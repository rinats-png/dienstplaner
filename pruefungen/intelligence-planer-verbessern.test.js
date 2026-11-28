/* ==========================================================================
   WP-I9 PR-A — VERBESSERN-MODUS: ÄNDERUNGSLISTE MIT GRUND (server/lib/engine/planer-verbessern.mjs)

   Akzeptanz (INTELLIGENCE-ENTWICKLUNGSPLAN.md, Block K, I9): Plan begutachten → Änderungsliste mit Grund;
   nichts geschrieben, nichts überschrieben (reine Rechnung, keine Route, keine Oberfläche).

   Geprüft (nur synthetische Daten; PLANER_AN / PLANER_AGGREGATE_AN bleiben AUS):
   V1  Grün/Rot je Grund: Ruhezeit, Abwesenheit, Qualifikation (am Dienst), Nachtfolge; ohne Konflikt keine Änderung.
   V2  Strikter Rangvorteil nötig; „nicht bewertbar“ ist nie besser (Rangvergleich).
   V3  Unberührt: angeheftete Einträge (auch als Ersatz), Vergangenheit, abgeschlossener Monat, Schichtfolge.
   V4  Kein neuer Befund: Ersatz mit Folgebefund (Ruhezeit, Nachtfolge) verworfen; Qualifikation bleibt erfüllt.
   V5  Wechselwirkung zweier Änderungen (gemeinsam geprüft, spätere verworfen); gleicher Tag, gleicher Dienst.
   V6  Fail closed: Abgleich gegen den Bestand (ergebnis_passt_nicht), ungültige Eingaben, Aufwandsgrenze.
   V7  Datenschutz: Positivliste, Kennungsmuster, Personenkennungen nur in vonPersonId/nachPersonId, keine Namen/Prozent.
   V8  Rein: Determinismus, Eingabe eingefroren, Kalender (Monats-/Jahreswechsel, Schaltjahr, Zeitumstellung).

   Aufruf: npx vitest run pruefungen/intelligence-planer-verbessern.test.js
   ========================================================================== */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { readFileSync } from "node:fs";
import { planVerbessern, verbesserungAbgleich, verbessernRangVergleich, VERBESSERN_GRENZE, VERBESSERN_GRUENDE, VERBESSERN_RANGFOLGE, VERBESSERN_SCHLUESSEL,
  VERBESSERN_TYPEN } from "../server/lib/engine/planer-verbessern.mjs";
import { PLANER_AN, PLANER_GRENZE } from "../server/lib/engine/planer.mjs";
import { PLANBEFUND_GRENZE } from "../server/lib/engine/einsatz.mjs";
import { PLANER_AGGREGATE_AN, AGGREGAT_GRENZE } from "../server/lib/engine/planeraggregate.mjs";
import { pruefen } from "../server/lib/engine/befunde.mjs";
import { mitTagesdatum } from "../server/lib/engine/zeit.mjs";
import { addDays } from "../server/lib/regelwerk.mjs";
import { baueLeerenBetrieb } from "../server/lib/leerbetrieb.mjs";

vi.setConfig({ testTimeout: 180000 });
const lies = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const deepFreeze = (o) => { if (o && typeof o === "object" && !Object.isFrozen(o)) { Object.freeze(o); for (const k of Object.getOwnPropertyNames(o)) deepFreeze(o[k]); } return o; };
const kopie = (x) => structuredClone(x);

beforeAll(() => { vi.useFakeTimers({ now: new Date("2026-11-20T10:00:00Z"), toFake: ["Date"] }); });
afterAll(() => { vi.useRealTimers(); });

const NACHNAMEN = ["Zylinderkopf", "Wasserwaage", "Leuchtturmgasse", "Kieselsteinweg", "Ahornblattweg", "Birkenrindeweg", "Fichtenzapfen", "Lindenblüte"];
const T0 = "2026-11-20T10:00:00.000Z";
/** Synthetischer Betrieb: n Personen (Kennung `tp-…`), Dienste F (06–14), S (14–22), N (22–06) ohne Bedarf; Testqualifikation „qt“. */
function betrieb(n = 5, { qual = () => false } = {}) {
  const m = baueLeerenBetrieb({ name: "Testbetrieb Verbessern", branche: "pflege", email: "test@example.org", land: "HE", raum: "r-test" }).mandanten[0];
  const e = m.einheiten[0].id;
  m.qualifikationen.push({ id: "qt", name: "Testqualifikation", kurz: "TQ", ebene: "betrieb", bezug: "person", gueltigMonate: null, nachweisPflicht: false, fachkraft: false });
  m.personen = Array.from({ length: n }, (_, i) => ({ id: `tp-${1000 + i}`, vorname: "Testvorname", nachname: NACHNAMEN[i % NACHNAMEN.length], geburtstag: "1980-05-05",
    eintritt: "2020-01-01", zugehoerigkeit: [{ einheitId: e, ab: "2020-01-01" }], wochenstunden: 40, status: "aktiv", qualifikationen: qual(i) ? ["qt"] : [] }));
  return m;
}
const setze = (m, i, d, da) => { m.abweichungen[`tp-${1000 + i}|${d}`] = da; };
/** Ruhezeitkonflikt: Person i hat S am Vortag und F am Tag d (8 h Ruhe, schwere „warn“; an der Zeitumstellung im März 7 h, „danger“). */
const ruhezeit = (m, i, d) => { setze(m, i, addDays(d, -1), "S"); setze(m, i, d, "F"); };
const urlaub = (m, i, von, bis = von) => { m.abwesenheiten = [...m.abwesenheiten, { id: `a-${i}-${von}`, personId: `tp-${1000 + i}`, art: "urlaub", von, bis }]; };
const anheften = (m, i, d) => { m.angeheftet = { ...(m.angeheftet || {}), [`tp-${1000 + i}|${d}`]: { am: T0, vonRolle: "leitung" } }; };
const lauf = (m, ym, heute, extra = {}) => planVerbessern(m, ym, { heute, ...extra });
const befundeAm = (m, d, heute) => mitTagesdatum(heute, () => pruefen(m, d, d).filter((b) => b.schwere !== "info").map((b) => `${b.art}|${b.ref}`));

/** Alle Schlüssel eines Werts (rekursiv). */
const schluessel = (x, s = new Set()) => { if (Array.isArray(x)) x.forEach((y) => schluessel(y, s)); else if (x && typeof x === "object") for (const [k, v] of Object.entries(x)) { s.add(k); schluessel(v, s); } return s; };
const ERLAUBT = new Set([...VERBESSERN_SCHLUESSEL.ergebnis, ...VERBESSERN_SCHLUESSEL.aenderung, ...VERBESSERN_SCHLUESSEL.wirkung, ...VERBESSERN_SCHLUESSEL.aufwand,
  ...VERBESSERN_SCHLUESSEL.planbefund, ...VERBESSERN_RANGFOLGE]);
const KENNUNG = /^[A-Za-z0-9_.-]{1,64}$/;
/** Datenschutz-Prüfung eines Ergebnisses: Positivliste, Werte nur Zahl/Wahrheitswert/Kennung/null, Personenkennungen nur in den zwei Feldern. */
function datenschutz(r, m) {
  expect([...schluessel(r)].filter((k) => !ERLAUBT.has(k)), "Schlüssel außerhalb der Positivliste").toEqual([]);
  const t = JSON.stringify(r);
  for (const p of m.personen) expect(t.includes(p.nachname), p.nachname).toBe(false);
  expect(t.includes("Testvorname")).toBe(false);
  expect(/\|\d{4}-\d{2}-\d{2}/.test(t), "kein Schlüssel Person|Tag").toBe(false);
  expect(/%|prozent|score|punkte|gesamtnote/i.test(t), "keine Prozent-/Punktwerte").toBe(false);
  const ids = new Set(m.personen.map((p) => p.id));
  const blatt = (x, pfad) => {
    if (Array.isArray(x)) { x.forEach((y, i) => blatt(y, `${pfad}[${i}]`)); return; }
    if (x && typeof x === "object") { for (const [k, v] of Object.entries(x)) blatt(v, `${pfad}.${k}`); return; }
    expect(x === null || typeof x === "number" || typeof x === "boolean" || (typeof x === "string" && KENNUNG.test(x)), `${pfad}: ${x}`).toBe(true);
    if (typeof x === "number") expect(Number.isFinite(x), pfad).toBe(true);
    if (typeof x === "string" && ids.has(x)) expect(/\.(vonPersonId|nachPersonId)$/.test(pfad), `Personenkennung nur in von/nach: ${pfad}`).toBe(true);
  };
  blatt(r, "ergebnis");
}

/* ------------------------------------------------------------------------ */
describe("Schalter und Grenzen unverändert", () => {
  it("PLANER_AN und PLANER_AGGREGATE_AN bleiben AUS; Grenzen = Planer (40 Mio, 1 Mio, 372 Tage); nur Ersetzen", () => {
    expect(PLANER_AN).toBe(false);
    expect(PLANER_AGGREGATE_AN).toBe(false);
    expect(PLANBEFUND_GRENZE).toBe(40000000);
    expect(VERBESSERN_GRENZE.planbefund).toBe(PLANBEFUND_GRENZE);
    expect(VERBESSERN_GRENZE.aufwand).toBe(PLANER_GRENZE.aufwand);
    expect(AGGREGAT_GRENZE.fensterTage).toBe(372);
    expect([...VERBESSERN_TYPEN]).toEqual(["ersetzen"]);
    expect([...VERBESSERN_RANGFOLGE]).toEqual(["gesetz", "qualifikation", "besetzung", "muss", "soll", "verteilung"]);
  });
});

describe("V1: Grün/Rot je Grund", () => {
  it("Ruhezeit: die Einteilung geht an eine andere Person; Grund ruhezeit; Wirkung strikt besser; Befund danach weg", () => {
    const m = betrieb();
    ruhezeit(m, 0, "2026-12-10");
    expect(befundeAm(m, "2026-12-10", "2026-12-01")).toContain("ruhezeit|tp-1000");
    const r = lauf(m, "2026-12", "2026-12-01");
    expect(r.ok).toBe(true);
    expect(r.aenderungen).toHaveLength(1);
    const a = r.aenderungen[0];
    expect(a).toMatchObject({ typ: "ersetzen", datum: "2026-12-10", dienstId: "F", vonPersonId: "tp-1000", grund: "ruhezeit" });
    expect(a.nachPersonId).not.toBe("tp-1000");
    expect(a.nachPersonId).toMatch(/^tp-100[1-4]$/);
    expect(verbessernRangVergleich(a.wirkung.nachher, a.wirkung.vorher)).toBeLessThan(0);
    expect(a.wirkung.vorher.muss).toBe(1);
    expect(a.wirkung.nachher.muss).toBe(0);
    expect(r).toMatchObject({ konflikte: 1, unveraendert: 0, mitgeloest: 0, ungeprueft: 0, angeheftet: 0 });
    expect(verbesserungAbgleich(m, "2026-12", r, { heute: "2026-12-01" })).toEqual({ ok: true });
    /* Angewandt (nur hier im Test, als Kopie): Befund weg, kein neuer. */
    const n = kopie(m);
    n.abweichungen[`${a.vonPersonId}|${a.datum}`] = "-"; n.abweichungen[`${a.nachPersonId}|${a.datum}`] = a.dienstId;
    expect(befundeAm(n, "2026-12-10", "2026-12-01").filter((x) => !x.startsWith("regelsatz"))).toEqual([]);
  });
  it("Rot: ohne Konflikt keine Änderung (leerer Plan, regelkonformer Plan)", () => {
    const m = betrieb();
    expect(lauf(m, "2026-12", "2026-12-01")).toMatchObject({ ok: true, aenderungen: [], konflikte: 0, unveraendert: 0 });
    setze(m, 0, "2026-12-09", "F"); setze(m, 0, "2026-12-10", "S");
    expect(lauf(m, "2026-12", "2026-12-01")).toMatchObject({ ok: true, aenderungen: [], konflikte: 0 });
  });
  it("Abwesenheit: Dienst trotz Urlaub geht an eine andere Person; Besetzung zählt danach mit", () => {
    const m = betrieb();
    m.dienstarten[0].mindest = { mo_do: 1, fr: 1, sa: 1, so: 1 };
    setze(m, 0, "2026-12-15", "F");
    urlaub(m, 0, "2026-12-15");
    for (let t = 1; t <= 31; t++) { const d = `2026-12-${String(t).padStart(2, "0")}`; if (d !== "2026-12-15") setze(m, 1, d, "F"); }
    const r = lauf(m, "2026-12", "2026-12-01");
    expect(r.ok).toBe(true);
    const a = r.aenderungen.find((x) => x.datum === "2026-12-15");
    expect(a).toMatchObject({ grund: "abwesend", vonPersonId: "tp-1000", dienstId: "F" });
    expect(a.wirkung.vorher.besetzung).toBeGreaterThan(a.wirkung.nachher.besetzung);
  });
  it("Qualifikation am Dienst: unqualifizierte Einteilung geht an eine qualifizierte Person", () => {
    const m = betrieb(5, { qual: (i) => i >= 3 });
    m.dienstarten[0].mindestQual = { qt: 1 };
    setze(m, 0, "2026-12-10", "F");
    const r = lauf(m, "2026-12", "2026-12-01");
    expect(r.ok).toBe(true);
    const a = r.aenderungen.find((x) => x.datum === "2026-12-10");
    expect(a).toMatchObject({ grund: "qualifikation", vonPersonId: "tp-1000" });
    expect(["tp-1003", "tp-1004"]).toContain(a.nachPersonId);
    /* Umgebung: an den übrigen Tagen fehlt die Qualifikation ebenso (niemand im Dienst); an diesem Tag ist sie danach da. */
    expect(a.wirkung.vorher.qualifikation - a.wirkung.nachher.qualifikation).toBe(1);
    expect(befundeAm(m, "2026-12-10", "2026-12-01")).toContain("qualifikation|F|qt");
  });
});

describe("V2: strikter Rangvorteil; nicht bewertbar ist nie besser", () => {
  it("kein Rangvorteil ⇒ keine Änderung: niemand bringt die fehlende Qualifikation", () => {
    const m = betrieb(5);
    m.dienstarten[0].mindestQual = { qt: 1 };
    setze(m, 0, "2026-12-10", "F");
    const r = lauf(m, "2026-12", "2026-12-01");
    expect(r).toMatchObject({ ok: true, aenderungen: [], konflikte: 1, unveraendert: 1 });
  });
  it("Rangvergleich: streng in der Rangfolge; null entscheidet nie und beendet den Vergleich", () => {
    const r = (x = {}) => ({ gesetz: 0, qualifikation: 0, besetzung: 0, muss: 0, soll: 0, verteilung: 0, ...x });
    expect(verbessernRangVergleich(r({ gesetz: 0, muss: 5 }), r({ gesetz: 1 }))).toBeLessThan(0);
    expect(verbessernRangVergleich(r({ qualifikation: 0, besetzung: 9 }), r({ qualifikation: 1 }))).toBeLessThan(0);
    expect(verbessernRangVergleich(r({ besetzung: 1 }), r({ besetzung: 1, muss: 2 }))).toBeLessThan(0);
    expect(verbessernRangVergleich(r(), r())).toBe(0);
    /* Verteilung besser, aber Soll nicht bewertet: kein Vorteil (was hinter null läge, zählt nicht). */
    expect(verbessernRangVergleich(r({ soll: null, verteilung: 0 }), r({ soll: 0, verteilung: 3 }))).toBe(0);
    expect(verbessernRangVergleich(r({ verteilung: null }), r({ verteilung: 2 }))).toBe(0);
    expect(verbessernRangVergleich(r({ soll: 1 }), r({ soll: 0 }))).toBeGreaterThan(0);
    /* Ein Vorteil vor der nicht bewerteten Stufe entscheidet. */
    expect(verbessernRangVergleich(r({ muss: 0, soll: null }), r({ muss: 1, soll: 0 }))).toBeLessThan(0);
  });
});

describe("V3: unberührt", () => {
  it("angeheftete Einteilung bleibt; angeheftete Ersatzperson wird nicht vorgeschlagen", () => {
    const m = betrieb();
    ruhezeit(m, 0, "2026-12-10");
    anheften(m, 0, "2026-12-10");
    expect(lauf(m, "2026-12", "2026-12-01")).toMatchObject({ ok: true, aenderungen: [], konflikte: 1, angeheftet: 1, unveraendert: 1 });
    const n = betrieb();
    ruhezeit(n, 0, "2026-12-10");
    for (const i of [1, 2, 3]) { setze(n, i, "2026-12-10", "-"); anheften(n, i, "2026-12-10"); }
    const r = lauf(n, "2026-12", "2026-12-01");
    expect(r.aenderungen.map((a) => a.nachPersonId)).toEqual(["tp-1004"]);
  });
  it("unlesbare Anheftungen: nichts (fail closed)", () => {
    const m = betrieb();
    ruhezeit(m, 0, "2026-12-10");
    m.angeheftet = { kaputt: true };
    expect(lauf(m, "2026-12", "2026-12-01")).toEqual({ ok: false, grund: "anheftungen_unlesbar" });
  });
  it("Vergangenheit: Tage vor heute nie; heute selbst ja", () => {
    const m = betrieb();
    ruhezeit(m, 0, "2026-12-10");
    expect(lauf(m, "2026-12", "2026-12-11")).toMatchObject({ ok: true, aenderungen: [], konflikte: 0 });
    expect(lauf(m, "2026-12", "2026-12-10").aenderungen).toHaveLength(1);
    expect(lauf(m, "2026-12", "2027-01-05")).toMatchObject({ ok: true, aenderungen: [], konflikte: 0 });
  });
  it("abgeschlossener Monat: nichts; offener Abschluss-Eintrag: rechnet", () => {
    const m = betrieb();
    ruhezeit(m, 0, "2026-12-10");
    expect(lauf({ ...m, monatsabschluss: { "2026-12": { abgeschlossen: true, am: T0 } } }, "2026-12", "2026-12-01")).toEqual({ ok: false, grund: "monat_abgeschlossen" });
    expect(lauf({ ...m, monatsabschluss: { "2026-12": { abgeschlossen: false } } }, "2026-12", "2026-12-01").aenderungen).toHaveLength(1);
  });
  it("nur Einträge in abweichungen: andere Abweichungen, Abwesenheiten und Personen bleiben wörtlich", () => {
    const m = betrieb();
    ruhezeit(m, 0, "2026-12-10");
    setze(m, 2, "2026-12-03", "N");
    urlaub(m, 3, "2026-12-20", "2026-12-22");
    const vor = JSON.stringify(m);
    const r = lauf(m, "2026-12", "2026-12-01");
    expect(JSON.stringify(m)).toBe(vor);
    expect(r.aenderungen.every((a) => a.datum === "2026-12-10" && a.vonPersonId === "tp-1000")).toBe(true);
  });
});

describe("V4: kein neuer Befund, Qualifikation bleibt erfüllt", () => {
  it("Ersatz mit Folgebefund Ruhezeit (Spätdienst am Vortag) wird verworfen; die einzige saubere Person wird gewählt", () => {
    const m = betrieb(5);
    ruhezeit(m, 0, "2026-12-10");
    for (const i of [1, 2, 3]) setze(m, i, "2026-12-09", "S");
    const r = lauf(m, "2026-12", "2026-12-01");
    /* tp-1001 … 1003 haben selbst einen Ruhezeitkonflikt? Nein: S am 9., am 10. frei. Ersatz für F am 10. hätte 8 h Ruhe ⇒ verworfen. */
    expect(r.aenderungen.map((a) => [a.datum, a.nachPersonId])).toEqual([["2026-12-10", "tp-1004"]]);
    setze(m, 4, "2026-12-09", "S");
    expect(lauf(m, "2026-12", "2026-12-01")).toMatchObject({ ok: true, aenderungen: [], konflikte: 1, unveraendert: 1 });
  });
  it("Ersatz mit Folgebefund Nachtfolge (fünfte Nacht in Folge, Grenze 4) wird verworfen", () => {
    const m = betrieb(4);
    setze(m, 0, "2026-12-14", "N");
    urlaub(m, 0, "2026-12-14");
    for (const i of [1, 2]) for (const d of ["2026-12-10", "2026-12-11", "2026-12-12", "2026-12-13"]) setze(m, i, d, "N");
    setze(m, 3, "2026-12-14", "F");      // tp-1003 hat am 14. schon Dienst
    const r = lauf(m, "2026-12", "2026-12-01");
    expect(r).toMatchObject({ ok: true, aenderungen: [], konflikte: 1, unveraendert: 1 });
    /* Eine Nacht weniger bei tp-1002: der Ersatz ist zulässig. */
    delete m.abweichungen["tp-1002|2026-12-10"];
    const r2 = lauf(m, "2026-12", "2026-12-01");
    expect(r2.aenderungen.map((a) => [a.grund, a.nachPersonId])).toEqual([["abwesend", "tp-1002"]]);
  });
  it("Qualifikation bleibt erfüllt: Ruhezeitkonflikt in einem Dienst mit Mindestqualifikation geht nur an eine qualifizierte Person", () => {
    const m = betrieb(5, { qual: (i) => i === 0 || i === 4 });
    m.dienstarten[0].mindestQual = { qt: 1 };
    ruhezeit(m, 0, "2026-12-10");
    const r = lauf(m, "2026-12", "2026-12-01");
    expect(r.aenderungen.map((a) => [a.grund, a.nachPersonId])).toEqual([["ruhezeit", "tp-1004"]]);
    expect(r.aenderungen[0].wirkung.nachher.qualifikation).toBe(r.aenderungen[0].wirkung.vorher.qualifikation);
    /* Abgleich: dieselbe Änderung an eine Person ohne Qualifikation (Nachprüfung der Person besteht) ⇒ neuer Befund am Dienst. */
    const ohneQual = { ...r, aenderungen: [{ ...r.aenderungen[0], nachPersonId: "tp-1002" }] };
    expect(verbesserungAbgleich(m, "2026-12", ohneQual, { heute: "2026-12-01" })).toMatchObject({ ok: false, pruefung: "neuer_befund" });
    m.personen[4].qualifikationen = [];
    expect(lauf(m, "2026-12", "2026-12-01")).toMatchObject({ aenderungen: [], unveraendert: 1 });
  });
  it("Alleindienst eines Dritten: Ersatz, der den Partner entfernt, wird nicht als besser gezählt", () => {
    const m = betrieb(4);
    m.personen[1].einschraenkungen = { keinAlleindienst: true };
    ruhezeit(m, 0, "2026-12-10");
    setze(m, 1, "2026-12-10", "F");
    /* Alle möglichen Ersatzpersonen dürfen auch nicht allein: tp-1001 bliebe ohne Partner, wenn der Ersatz keinAlleindienst hat. */
    m.personen[2].einschraenkungen = { keinAlleindienst: true };
    m.personen[3].einschraenkungen = { keinAlleindienst: true };
    const r = lauf(m, "2026-12", "2026-12-01");
    expect(r.aenderungen.filter((a) => a.vonPersonId === "tp-1000")).toEqual([]);
  });
});

describe("V5: Wechselwirkungen", () => {
  it("zwei Änderungen, eine Ersatzperson: die spätere würde mit der früheren eine Ruhezeit verletzen ⇒ verworfen", () => {
    const m = betrieb(3);
    setze(m, 0, "2026-12-10", "S"); urlaub(m, 0, "2026-12-10", "2026-12-11");
    setze(m, 1, "2026-12-11", "F"); urlaub(m, 1, "2026-12-10", "2026-12-11");
    /* tp-1002 ist die einzige freie Person an beiden Tagen. Einzeln wäre jede Änderung gut; zusammen: S am 10., F am 11. = 8 h. */
    const r = lauf(m, "2026-12", "2026-12-01");
    expect(r.aenderungen.map((a) => [a.datum, a.dienstId, a.nachPersonId])).toEqual([["2026-12-10", "S", "tp-1002"]]);
    expect(r).toMatchObject({ konflikte: 2, unveraendert: 1 });
    /* Beide zusammen sind keine gültige Liste (gemeinsame Prüfung im Abgleich). */
    const beide = { ...r, aenderungen: [...r.aenderungen, { ...r.aenderungen[0], datum: "2026-12-11", dienstId: "F", vonPersonId: "tp-1001", grund: "abwesend" }] };
    expect(verbesserungAbgleich(m, "2026-12", beide, { heute: "2026-12-01" })).toMatchObject({ ok: false, grund: "ergebnis_passt_nicht" });
  });
  it("gleicher Tag, gleicher Dienst, zwei Konflikte: verschiedene Ersatzpersonen, feste Reihenfolge", () => {
    const m = betrieb(6);
    ruhezeit(m, 0, "2026-12-10");
    ruhezeit(m, 1, "2026-12-10");
    const r = lauf(m, "2026-12", "2026-12-01");
    expect(r.aenderungen.map((a) => a.vonPersonId)).toEqual(["tp-1000", "tp-1001"]);
    const nach = r.aenderungen.map((a) => a.nachPersonId);
    expect(new Set(nach).size).toBe(2);
    for (const q of nach) expect(["tp-1002", "tp-1003", "tp-1004", "tp-1005"]).toContain(q);
    expect(verbesserungAbgleich(m, "2026-12", r, { heute: "2026-12-01" })).toEqual({ ok: true });
  });
  it("ein Konflikt löst einen anderen mit (Folge an zwei Tagen derselben Person): mitgelöst, keine zweite Änderung", () => {
    const m = betrieb(5);
    m.einstellungen.maxFolge = 2;
    for (const d of ["2026-12-08", "2026-12-09", "2026-12-10"]) setze(m, 0, d, "F");
    urlaub(m, 0, "2026-12-10");
    const r = lauf(m, "2026-12", "2026-12-01");
    expect(r.aenderungen.map((a) => [a.datum, a.grund])).toEqual([["2026-12-10", "abwesend"]]);
  });
});

describe("V6: fail closed", () => {
  const basis = () => { const m = betrieb(); ruhezeit(m, 0, "2026-12-10"); return m; };
  let M, R;
  beforeAll(() => { M = basis(); R = lauf(M, "2026-12", "2026-12-01"); });
  const mit = (f) => { const e = kopie(R); f(e); return verbesserungAbgleich(M, "2026-12", e, { heute: "2026-12-01" }); };
  it("Abgleich: eigenes Ergebnis passt; jede Verfälschung ⇒ ergebnis_passt_nicht bzw. Kennung", () => {
    expect(R.aenderungen).toHaveLength(1);
    expect(verbesserungAbgleich(M, "2026-12", R, { heute: "2026-12-01" })).toEqual({ ok: true });
    const fall = {
      vorwert: (e) => { e.aenderungen[0].dienstId = "S"; },
      vonUnbekannt: (e) => { e.aenderungen[0].vonPersonId = "tp-9999"; },
      nachBelegt: (e) => { e.aenderungen[0].nachPersonId = "tp-1000"; },
      dublette: (e) => { e.aenderungen.push(kopie(e.aenderungen[0])); },
      fremderSchluessel: (e) => { e.aenderungen[0].name = "x"; },
      fremdesFeld: (e) => { e.personen = 1; },
      grund: (e) => { e.aenderungen[0].grund = "gefuehl"; },
      typ: (e) => { e.aenderungen[0].typ = "tauschen"; },
      kennung: (e) => { e.aenderungen[0].nachPersonId = "Zylinderkopf Testvorname"; },
      wirkungOhneVorteil: (e) => { e.aenderungen[0].wirkung.nachher = { ...e.aenderungen[0].wirkung.vorher }; },
      wirkungForm: (e) => { e.aenderungen[0].wirkung.vorher.punkte = 3; },
      vergangen: (e) => { e.aenderungen[0].datum = "2026-11-30"; },
      andererMonat: (e) => { e.aenderungen[0].datum = "2027-01-10"; },
      ausloeser: (e) => { e.aenderungen[0].grund = "folge"; },
      nichtBewertet: (e) => { e.nichtBewertet = ["gesetz"]; },
      falscherMonat: (e) => { e.ym = "2026-11"; },
    };
    for (const [n, f] of Object.entries(fall)) expect(mit(f).ok, n).toBe(false);
    expect(mit(fall.vorwert)).toMatchObject({ grund: "ergebnis_passt_nicht", pruefung: "vorwert" });
    expect(mit(fall.ausloeser)).toMatchObject({ grund: "ergebnis_passt_nicht", pruefung: "ausloeser" });
    expect(mit(fall.dublette)).toMatchObject({ grund: "ergebnis_passt_nicht", pruefung: "dublette" });
    /* Nachperson inzwischen belegt bzw. angeheftet. */
    const belegt = kopie(M); belegt.abweichungen[`${R.aenderungen[0].nachPersonId}|2026-12-10`] = "S";
    expect(verbesserungAbgleich(belegt, "2026-12", R, { heute: "2026-12-01" })).toMatchObject({ ok: false, pruefung: "nachwert" });
    const geheftet = kopie(M); geheftet.angeheftet = { [`${R.aenderungen[0].nachPersonId}|2026-12-10`]: { am: T0, vonRolle: "leitung" } };
    expect(verbesserungAbgleich(geheftet, "2026-12", R, { heute: "2026-12-01" })).toMatchObject({ ok: false, pruefung: "angeheftet" });
    /* Später gerechnet (heute nach dem Tag der Änderung): Tag vor heute ⇒ nie. */
    expect(verbesserungAbgleich(M, "2026-12", R, { heute: "2026-12-11" })).toMatchObject({ ok: false, pruefung: "tag" });
    /* Ersatz mit eigenem Folgebefund (S am Vortag): nachpruefen bzw. neuer Befund. */
    const folge = kopie(M); folge.abweichungen[`${R.aenderungen[0].nachPersonId}|2026-12-09`] = "S";
    expect(verbesserungAbgleich(folge, "2026-12", R, { heute: "2026-12-01" }).ok).toBe(false);
  });
  it("ungültige Eingaben ⇒ ok:false, nie ein Wurf", () => {
    const m = basis();
    const H = { heute: "2026-12-01" };
    for (const [n, x] of [["null", null], ["string", "betrieb"], ["leer", {}], ["personen", { ...m, personen: "x" }], ["abweichungen", { ...m, abweichungen: [] }],
      ["sicht", { ...m, sichtEntwuerfe: { heute: "2026-12-01" } }], ["sichtIst", { ...m, sichtIstDaten: true }], ["person", { ...m, personen: [null] }]])
      expect(planVerbessern(/** @type {any} */ (x), "2026-12", H), n).toEqual({ ok: false, grund: "betrieb_ungueltig" });
    for (const ym of [null, "2026-13", "2026-1", "1999-12", 202612]) expect(planVerbessern(m, /** @type {any} */ (ym), H).grund, String(ym)).toBe("monat_ungueltig");
    for (const heute of [undefined, null, "2026-02-30", "2027-02-29", "heute", 20261201]) expect(planVerbessern(m, "2026-12", /** @type {any} */ ({ heute })).grund, String(heute)).toBe("heute_ungueltig");
    expect(planVerbessern(m, "2026-12", /** @type {any} */ (null)).grund).toBe("heute_ungueltig");
    for (const o of [{ startwert: -1 }, { startwert: 1.5 }, { aufwand: Infinity }, { aufwand: NaN }, { aufwand: PLANER_GRENZE.aufwand + 1 }, { planbefundAufwand: PLANBEFUND_GRENZE + 1 }, { vorgabenAufwand: -3 }])
      expect(planVerbessern(m, "2026-12", { ...H, ...o }).ok, JSON.stringify(o)).toBe(false);
    for (const e of [null, "x", [], { ok: false }, { ok: true, ym: "2026-12" }, { ok: true, ym: "2026-12", aenderungen: {}, nichtBewertet: [] }])
      expect(verbesserungAbgleich(m, "2026-12", e, H).ok, JSON.stringify(e)).toBe(false);
    /* Fehler in einer Prüfung (Getter wirft): ok:false statt Wurf. */
    const boes = { ...m, get einstellungen() { throw new Error("kaputt"); } };
    expect(planVerbessern(boes, "2026-12", H).ok).toBe(false);
    expect(verbesserungAbgleich(boes, "2026-12", R, H).ok).toBe(false);
  });
  it("Aufwandsgrenze: riesige Eingabe ⇒ aufwand; knappes Budget ⇒ übrige Konflikte ungeprüft, ausgeschöpft", () => {
    const gross = betrieb(1);
    gross.personen = Array.from({ length: Math.ceil(VERBESSERN_GRENZE.personenTage / 31) + 1 }, (_, i) => ({ ...gross.personen[0], id: `tp-${100000 + i}` }));
    expect(lauf(gross, "2026-12", "2026-12-01")).toEqual({ ok: false, grund: "aufwand" });
    const m = basis();
    expect(lauf(m, "2026-12", "2026-12-01", { aufwand: 100 })).toMatchObject({ ok: false, grund: "aufwand" });
    ruhezeit(m, 1, "2026-12-20");
    const voll = lauf(m, "2026-12", "2026-12-01");
    expect(voll.aenderungen).toHaveLength(2);
    /* Budget so, dass genau der erste Konflikt geprüft wird. */
    let knapp = null;
    for (let g = 1000; g <= voll.aufwand.verbraucht; g += 500) { const r = lauf(m, "2026-12", "2026-12-01", { aufwand: g }); if (r.ok && r.aenderungen.length === 1) { knapp = r; break; } }
    expect(knapp).not.toBeNull();
    expect(knapp.aufwand.ausgeschoepft).toBe(true);
    expect(knapp.ungeprueft).toBe(1);
    expect(knapp.aufwand.verbraucht).toBeLessThanOrEqual(knapp.aufwand.grenze);
    expect(verbesserungAbgleich(m, "2026-12", knapp, { heute: "2026-12-01" })).toEqual({ ok: true });
    /* Budget der Planbefunde zu klein: keine Änderung, ausgeschöpft. */
    const pb = lauf(m, "2026-12", "2026-12-01", { planbefundAufwand: 10 });
    expect(pb).toMatchObject({ ok: true, aenderungen: [] });
    expect(pb.aufwand.planbefund.ausgeschoepft).toBe(true);
  });
});

describe("V7: Datenschutz", () => {
  it("Positivliste, Kennungsmuster; Personenkennungen nur in vonPersonId/nachPersonId; keine Namen, keine Prozent", () => {
    const m = betrieb(6, { qual: (i) => i >= 4 });
    m.dienstarten[0].mindestQual = { qt: 1 };
    setze(m, 0, "2026-12-03", "F");
    ruhezeit(m, 1, "2026-12-10");
    setze(m, 2, "2026-12-15", "N"); urlaub(m, 2, "2026-12-15");
    const r = lauf(m, "2026-12", "2026-12-01");
    expect(r.aenderungen.length).toBeGreaterThanOrEqual(2);
    datenschutz(r, m);
    for (const a of r.aenderungen) { expect(VERBESSERN_GRUENDE).toContain(a.grund); expect(Object.keys(a).sort()).toEqual([...VERBESSERN_SCHLUESSEL.aenderung].sort()); }
    datenschutz(lauf(betrieb(), "2026-12", "2026-12-01"), m);
  });
  it("Personen mit Kennungen außerhalb des Musters werden nie vorgeschlagen (kein Freitext im Ergebnis)", () => {
    const m = betrieb(3);
    m.personen[0].id = "Zylinderkopf, Testvorname";
    m.abweichungen["Zylinderkopf, Testvorname|2026-12-09"] = "S"; m.abweichungen["Zylinderkopf, Testvorname|2026-12-10"] = "F";
    const r = lauf(m, "2026-12", "2026-12-01");
    expect(r).toMatchObject({ ok: true, aenderungen: [], unveraendert: 1 });
    datenschutz(r, m);
  });
});

describe("V8: rein und deterministisch, Kalender", () => {
  it("zwei Läufe identisch; Startwert wirkt nur auf Gleichstände (gültig in jedem Fall)", () => {
    const m = betrieb(6);
    ruhezeit(m, 0, "2026-12-10"); ruhezeit(m, 1, "2026-12-17");
    const a = lauf(m, "2026-12", "2026-12-01"), b = lauf(kopie(m), "2026-12", "2026-12-01");
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const nach = new Set();
    for (const s of [1, 2, 3, 7, 99]) {
      const r = lauf(m, "2026-12", "2026-12-01", { startwert: s });
      expect(r.startwert).toBe(s);
      expect(r.aenderungen).toHaveLength(2);
      expect(verbesserungAbgleich(m, "2026-12", r, { heute: "2026-12-01" })).toEqual({ ok: true });
      for (const x of r.aenderungen) nach.add(x.nachPersonId);
      expect(JSON.stringify(lauf(m, "2026-12", "2026-12-01", { startwert: s }))).toBe(JSON.stringify(r));
    }
    expect(nach.size).toBeGreaterThan(1);
  });
  it("Eingabe tief eingefroren: gleiches Ergebnis, nichts verändert", () => {
    const m = betrieb(5);
    ruhezeit(m, 0, "2026-12-10");
    setze(m, 2, "2026-12-15", "N"); urlaub(m, 2, "2026-12-15");
    const offen = lauf(kopie(m), "2026-12", "2026-12-01");
    const vor = JSON.stringify(m);
    const fest = deepFreeze(kopie(m));
    const r = lauf(fest, "2026-12", "2026-12-01", deepFreeze({ heute: "2026-12-01" }));
    expect(JSON.stringify(r)).toBe(JSON.stringify(offen));
    expect(JSON.stringify(fest)).toBe(vor);
    expect(verbesserungAbgleich(fest, "2026-12", deepFreeze(kopie(r)), { heute: "2026-12-01" })).toEqual({ ok: true });
  });
  it("Monats- und Jahreswechsel: Konflikt am 1. durch Spätdienst am Monatsletzten des Vormonats", () => {
    for (const [d, ym] of [["2027-01-01", "2027-01"], ["2026-12-01", "2026-12"]]) {
      const m = betrieb();
      ruhezeit(m, 0, d);
      const r = lauf(m, ym, d);
      expect(r.aenderungen.map((a) => [a.datum, a.grund, a.vonPersonId]), d).toEqual([[d, "ruhezeit", "tp-1000"]]);
      /* Der Vortag im Vormonat bleibt unberührt (nur Tage des Monats ab heute). */
      expect(lauf(m, addDays(d, -1).slice(0, 7), addDays(d, -1)).aenderungen.filter((a) => a.datum === addDays(d, -1))).toEqual([]);
    }
  });
  it("Schaltjahr: Konflikt am 29.02.2028", () => {
    const m = betrieb();
    ruhezeit(m, 0, "2028-02-29");
    const r = lauf(m, "2028-02", "2028-02-01");
    expect(r.aenderungen.map((a) => a.datum)).toEqual(["2028-02-29"]);
    expect(verbesserungAbgleich(m, "2028-02", r, { heute: "2028-02-01" })).toEqual({ ok: true });
  });
  it("Zeitumstellung: Ende März 7 h Ruhe (Gesetz), Ende Oktober 9 h (Achtung) — beide ersetzt, Stufe im Rangvektor", () => {
    const mz = betrieb();
    ruhezeit(mz, 0, "2026-03-29");
    const rm = lauf(mz, "2026-03", "2026-03-01");
    expect(rm.aenderungen.map((a) => a.datum)).toEqual(["2026-03-29"]);
    expect(rm.aenderungen[0].wirkung.vorher.gesetz).toBe(1);
    const mo = betrieb();
    ruhezeit(mo, 0, "2026-10-25");
    const ro = lauf(mo, "2026-10", "2026-10-01");
    expect(ro.aenderungen.map((a) => a.datum)).toEqual(["2026-10-25"]);
    expect(ro.aenderungen[0].wirkung.vorher).toMatchObject({ gesetz: 0, muss: 1 });
  });
  it("Quelltext: keine Uhr, kein Zufall, nur relative Importe, kein node:/src/; planer.mjs bleibt die Quelle der Nachprüfung", () => {
    const c = lies("server/lib/engine/planer-verbessern.mjs").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
    expect(c).not.toMatch(/Date\.now\(|new Date\(|Math\.random\(|performance\.now\(/);
    expect(c).not.toMatch(/from\s+["']node:/);
    expect(c).not.toMatch(/from\s+["'][^"']*src\//);
    for (const x of c.matchAll(/from\s+["']([^"']+)["']/g)) expect(x[1]).toMatch(/^\.\.?\/[^.]/);
    expect(c).toMatch(/import \{[^}]*\bnachpruefen\b[^}]*\} from "\.\/planer\.mjs"/);
    expect(c).toMatch(/import \{[^}]*\bersatzVorschlaege\b[^}]*\} from "\.\/einsatz\.mjs"/);
    expect(c).not.toMatch(/abweichungen\[[^\]]+\]\s*=(?!=)/);              // kein Schreiben in fremde Objekte
  });
});
