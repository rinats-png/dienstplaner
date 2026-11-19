/* ==========================================================================
   WP-14c — Nachbesserung (Datenintegrität / Abrechnung)

   K  Kennzeichnung: Eine BESTÄTIGTE Ist-Zeit, deren Pause die Anwesenheit erreicht (istZeitFuer:
      pauseUeberAnwesenheit, zählt 0 h), erreichte keine Oberfläche — pruefHinweis zählt nur unbestätigte
      Prüffälle, offenePunkte des Abschlusses ebenso. Jetzt (P2-12 Variante B, sichtbare Kennzeichnung, nur
      Kennzeichnung): pauseAnwesenheitFaelle, Lohnausgabe-Blatt (lohnPruefZeilen), Rückfrage vor dem Export
      (lohnWarnung), Abrechnungsdaten und Monatsabschluss. Keine Abschlusssperre (P2-12 Schritt 3, P2-6 b offen).
   I  istNeu beim Wiederöffnen / Korrekturbeginn: verglich JSON mit Schlüsselreihenfolge und mit der Kennzeichnung
      `p` — ein Altabschluss (Schema 1) zählte JEDEN Personentag als geändert, ein Abschluss vor der Kennzeichnung
      (#268) einen Tag mit Pause = Anwesenheit (istNeu: 1), obwohl nichts geändert war. Der Wert steht dauerhaft im
      Verlauf. Er ändert nie das Ist eines abgeschlossenen oder exportierten Monats.
   P  Negative / ungültige Pause im allgemeinen Speichern (PUT /api/bestand, Teilweg): eine Ist-Zeit eines
      ungestempelten Tages mit pause -30 zählte als 30 min MEHR Arbeitszeit, ohne Kennzeichnung. Jetzt 422
      PAUSE_UNGUELTIG für neue/geänderte Einträge; Alteinträge bleiben byte-gleich speicherbar (P2-16 offen).
   ========================================================================== */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { istZeitFuer, pruefHinweis, PAUSE_ANWESENHEIT_TEXT } from "../server/lib/istdaten.mjs";
import { istEinfrieren, istAbweichungen, eingefrorenDesMonats } from "../server/lib/isteinfrieren.mjs";
import { abschliessen, wiederoeffnen, istAbdruck, offenePunkte } from "../server/lib/monatsabschluss.mjs";
import { erfassungPauseFehler, PAUSE_UNGUELTIG } from "../server/lib/gestalt.mjs";
import { betriebErzeugen, istEinfrierenSchema1 } from "../werkzeug/wp16-messung.mjs";

const OKT = "2026-10";
const HEUTE = "2026-11-19";
const WER = { personId: "p1", name: "L", rolle: "leitung" };
let FL, Monatsabschluss;
beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${HEUTE}T09:00:00Z`));
  FL = await import("../src/lib/fachlogik.js");
  ({ Monatsabschluss } = await import("../src/ansichten/monatsabschluss.jsx"));
}, 120000);
afterAll(() => { vi.useRealTimers(); });

/** Ein Messbetrieb (3 Personen, Oktober geplant) und der erste geplante Diensttag von p2. */
function grund() {
  const m = betriebErzeugen(3, [OKT]);
  const fr = istEinfrieren(m, OKT);
  const tag = Object.keys(fr).find((k) => k.startsWith("p2|") && fr[k].d !== undefined);
  return { m, tag, datum: tag.split("|")[1] };
}
/** Pause gleich Anwesenheit (06:00–06:30, 30 min) und länger (06:00–06:20, 30 min): bestätigte Altdaten vor F2. */
const PAUSE_GLEICH = { start: "06:00", ende: "06:30", pause: 30, bestaetigt: true, grund: "" };
const PAUSE_LAENGER = { start: "06:00", ende: "06:20", pause: 30, bestaetigt: true, grund: "" };
const NORMAL = { start: "06:00", ende: "14:00", pause: 30, bestaetigt: true, grund: "" };
const zu = (m) => { const r = abschliessen(m, { monat: OKT, trotzPrueffaellen: true }, WER, new Date(`${HEUTE}T09:00:00Z`), "ma-okt", HEUTE);
  if ("status" in r) throw new Error(r.grund); return r.mandant; };
const ohneP = (w) => Object.fromEntries(Object.entries(w).map(([k, v]) => {
  if (!v || typeof v !== "object" || !("p" in v)) return [k, v];
  const { p: _p, ...r } = v; void _p; return [k, r];
}));
const sitz = (m) => ({ rolle: "leitung", mandant: m, person: { id: "p1", rolle: "leitung", bereich: "ALLE" } });
const text = (el) => renderToStaticMarkup(el).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

/* ------------------------------------------------------------------------ */
describe("K: bestätigte Ist-Zeit mit Pause ≥ Anwesenheit wird sichtbar gekennzeichnet", () => {
  it("Ausgangslage (bestehend): istZeitFuer kennzeichnet, pruefHinweis und offenePunkte sehen es nicht", () => {
    const { m, tag, datum } = grund();
    const x = { ...m, erfassung: { [tag]: PAUSE_LAENGER } };
    const p = x.personen.find((q) => q.id === "p2");
    expect(istZeitFuer(x, p, datum, x.dienstarten[0])).toMatchObject({ std: 0, erfasst: true, zurPruefung: true, pauseUeberAnwesenheit: true });
    expect(pruefHinweis(x, OKT)).toBeNull();                                 // nur unbestätigte Prüffälle
    expect(offenePunkte(x, OKT).zurPruefung).toBe(0);                        // sperrt nicht: P2-6 b offen, hier nicht gebaut
  });
  it("pauseAnwesenheitFaelle: offen, Pause = und > Anwesenheit; nicht bei gültiger Pause, nicht bei unbestätigt", () => {
    const { m, tag, datum } = grund();
    expect(FL.pauseAnwesenheitFaelle(m, OKT)).toBeNull();
    expect(FL.pauseAnwesenheitFaelle({ ...m, erfassung: { [tag]: NORMAL } }, OKT)).toBeNull();
    expect(FL.pauseAnwesenheitFaelle({ ...m, erfassung: { [tag]: { ...PAUSE_LAENGER, bestaetigt: false } } }, OKT)).toBeNull();
    for (const e of [PAUSE_GLEICH, PAUSE_LAENGER]) {
      const r = FL.pauseAnwesenheitFaelle({ ...m, erfassung: { [tag]: e } }, OKT);
      expect(r).toMatchObject({ anzahl: 1, faelle: [{ personId: "p2", datum }] });
      expect(r.text).toMatch(/1 bestätigte Ist-Zeit im Oktober 2026 mit einer Pause so lang wie die Anwesenheit oder länger: Sie zählt mit 0 h/);
    }
    /* anderer Monat: nichts */
    expect(FL.pauseAnwesenheitFaelle({ ...m, erfassung: { [tag]: PAUSE_LAENGER } }, "2026-09")).toBeNull();
  });
  it("Lohnausgabe-Blatt und Export-Rückfrage nennen den Tag; ohne Fall byte-gleich wie bisher", () => {
    const { m, tag, datum } = grund();
    const ohne = { ...m, erfassung: { [tag]: NORMAL } };
    const mit = { ...m, erfassung: { [tag]: PAUSE_LAENGER } };
    expect(FL.lohnPruefZeilen(ohne, OKT)).toEqual([]);
    expect(FL.lohnWarnung(ohne, OKT, null)).toBeNull();
    expect(FL.lohnWarnung(ohne, OKT, "W")).toBe("W");
    const z = FL.lohnPruefZeilen(mit, OKT);
    expect(z[0]).toMatch(/^ACHTUNG: 1 bestätigte Ist-Zeit im Oktober 2026/);
    expect(z[1]).toContain(datum);
    expect(z[1]).toContain(PAUSE_ANWESENHEIT_TEXT);
    expect(FL.lohnausgabeText(mit, OKT)).toContain(PAUSE_ANWESENHEIT_TEXT);
    const w = FL.lohnWarnung(mit, OKT, null);
    expect(w).toMatch(/Pause so lang wie die Anwesenheit/);
    expect(w).toContain(datum);
    expect(w).toMatch(/Trotzdem jetzt ausgeben\?$/);
    expect(FL.lohnWarnung(mit, OKT, "W")).toMatch(/\n\nW$/);
  });
  it("nur Kennzeichnung: Stunden, Konto, Lohnzeilen und Prüfsumme bleiben, wie sie sind", () => {
    const { m, tag } = grund();
    const mit = { ...m, erfassung: { [tag]: PAUSE_LAENGER } };
    const p = mit.personen.find((q) => q.id === "p2");
    const vorher = JSON.stringify([FL.istStunden(mit, p, OKT), FL.stundenkonto(mit, p, OKT), FL.datevSaetze(mit, OKT), istAbdruck(mit, OKT)]);
    const kopie = JSON.stringify(mit);
    FL.pauseAnwesenheitFaelle(mit, OKT); FL.lohnPruefZeilen(mit, OKT); FL.lohnWarnung(mit, OKT, null);
    expect(JSON.stringify(mit)).toBe(kopie);                                 // nichts still korrigiert
    expect(JSON.stringify([FL.istStunden(mit, p, OKT), FL.stundenkonto(mit, p, OKT), FL.datevSaetze(mit, OKT), istAbdruck(mit, OKT)])).toBe(vorher);
  });
  it("abgeschlossener Monat: gekennzeichnet — auch bei einem Abschluss vor der Kennzeichnung (#268, ohne p); Freeze byte-gleich", () => {
    const { m, tag, datum } = grund();
    const x = zu({ ...m, erfassung: { [tag]: PAUSE_GLEICH } });
    const vor268 = { ...x, istEingefroren: ohneP(x.istEingefroren) };
    for (const y of [x, vor268]) {
      const frz = JSON.stringify(y.istEingefroren);
      expect(FL.pauseAnwesenheitFaelle(y, OKT)).toMatchObject({ anzahl: 1, faelle: [{ personId: "p2", datum }] });
      expect(JSON.stringify(y.istEingefroren)).toBe(frz);
    }
  });
  it("Rollenschutz: ohne Ist-Daten der Person (Betriebsrat, sichtIstDaten keine) keine Fälle", () => {
    const { m, tag } = grund();
    expect(FL.pauseAnwesenheitFaelle({ ...m, erfassung: { [tag]: PAUSE_LAENGER }, sichtIstDaten: { umfang: "keine" } }, OKT)).toBeNull();
    expect(FL.pauseAnwesenheitFaelle({ ...m, erfassung: { [tag]: PAUSE_LAENGER }, sichtIstDaten: { umfang: "eigene", person: "p3" } }, OKT)).toBeNull();
  });
  it("Oberfläche Monatsabschluss: offen und abgeschlossen ein Prüffall mit Tag und Person; ohne Fall nichts", () => {
    const { m, tag } = grund();
    const akt = new Proxy({}, { get: () => () => {} });
    const leer = text(h(Monatsabschluss, { sitz: sitz({ ...m, erfassung: { [tag]: NORMAL } }), ym: OKT, akt }));
    expect(leer).not.toMatch(/Pause so lang wie die Anwesenheit/);
    const offen = text(h(Monatsabschluss, { sitz: sitz({ ...m, erfassung: { [tag]: PAUSE_LAENGER } }), ym: OKT, akt }));
    expect(offen).toMatch(/Prüffall: 1 bestätigte Ist-Zeit im Oktober 2026 mit einer Pause so lang wie die Anwesenheit/);
    expect(offen).toContain("N2");
    const abg = text(h(Monatsabschluss, { sitz: sitz(zu({ ...m, erfassung: { [tag]: PAUSE_LAENGER } })), ym: OKT, akt }));
    expect(abg).toMatch(/Pause so lang wie die Anwesenheit.*berichtigen nur über Wiederöffnen/);
  });
});

/* ------------------------------------------------------------------------ */
/** Das Verfahren VOR der Nachbesserung (Referenz für den Differenztest): JSON mit Reihenfolge, mit `p`. */
function istAbweichungenAlt(m, monat) {
  const jetzt = istEinfrieren(m, monat), eingefroren = eingefrorenDesMonats(m, monat);
  const auf = (w, k) => {
    const e = w[k]; const b = w[`*|${monat}`]; const pm = w[`${k.split("|")[0]}|${monat}`];
    const { d: ref, ...rest } = e;
    let da = e.da;
    if (ref !== undefined) da = b && b.da && b.da[ref] ? b.da[ref] : undefined;
    const u = e.u !== undefined ? e.u : (pm && pm.u !== undefined ? pm.u : undefined);
    if (da) rest.da = da; else delete rest.da;
    if (u !== undefined) rest.u = u;
    delete rest.u;
    return JSON.stringify(rest);
  };
  const v = (w, k) => (w[k] && typeof w[k] === "object" && !Array.isArray(w[k]) ? auf(w, k) : null);
  let n = 0;
  for (const k of new Set([...Object.keys(jetzt), ...Object.keys(eingefroren)])) {
    if (!/^[^|]+\|\d{4}-\d{2}-\d{2}$/.test(k)) continue;
    if (v(jetzt, k) !== v(eingefroren, k)) n++;
  }
  return n;
}

describe("I: istNeu zählt geänderte Ist-Zeiten, nicht Schlüsselreihenfolge oder Kennzeichnung", () => {
  it("Altabschluss Schema 1 ohne Änderung: istNeu 0 (vorher: jeder Personentag)", () => {
    const { m } = grund();
    const x = { ...m, istEingefroren: istEinfrierenSchema1(m, OKT), monatsabschluss: { [OKT]: { abgeschlossen: true } } };
    expect(istAbweichungenAlt(x, OKT)).toBeGreaterThan(30);                  // der Befund
    expect(istAbweichungen(x, OKT)).toBe(0);
  });
  it("Abschluss vor der Kennzeichnung (#268, Tag ohne p) ohne Änderung: istNeu 0 (vorher 1); Verlauf beim Wiederöffnen ebenso", () => {
    const { m, tag } = grund();
    const x = zu({ ...m, erfassung: { [tag]: PAUSE_GLEICH } });
    const vor268 = { ...x, istEingefroren: ohneP(x.istEingefroren) };
    /* So hätte der damalige Abschluss die Prüfsumme gerechnet: über den Freeze ohne p. */
    vor268.monatsabschluss = { [OKT]: { ...x.monatsabschluss[OKT], abdruck: istAbdruck(vor268, OKT) } };
    expect(istAbweichungenAlt(vor268, OKT)).toBe(1);                        // der Befund „Altabschluss mit istNeu: 1"
    expect(istAbweichungen(vor268, OKT)).toBe(0);
    const r = wiederoeffnen(vor268, { monat: OKT, grund: "Gegenprobe nach dem Abschluss" }, WER, new Date(`${HEUTE}T10:00:00Z`), "w-1");
    expect(r.ereignis).toMatchObject({ abdruckGleich: true, istNeu: 0 });
  });
  it("echte Änderungen zählen weiter: Erfassung, Dienst (Plan), Abwesenheit — auch im Altabschluss Schema 1", () => {
    const { m, tag, datum } = grund();
    const pid = tag.split("|")[0];
    const basis = zu({ ...m, erfassung: { [tag]: NORMAL } });
    const s1 = { ...basis, istEingefroren: istEinfrierenSchema1({ ...m, erfassung: { [tag]: NORMAL } }, OKT) };
    for (const y of [basis, s1]) {
      expect(istAbweichungen({ ...y, erfassung: { [tag]: { ...NORMAL, ende: "15:00" } } }, OKT)).toBe(1);
      expect(istAbweichungen({ ...y, abweichungen: { ...y.abweichungen, [tag]: "-" } }, OKT)).toBe(1);
      expect(istAbweichungen({ ...y, abwesenheiten: [{ id: "x", personId: pid, art: "urlaub", von: datum, bis: datum }] }, OKT)).toBe(1);
    }
  });
  it("Differenztest Schema 3: ohne reine Kennzeichnungs-Abweichung zählen alt und neu gleich (36 Änderungen)", () => {
    const { m } = grund();
    const tage = Object.keys(istEinfrieren(m, OKT)).filter((k) => /\|\d{4}-\d{2}-\d{2}$/.test(k));
    const x = zu(m);
    let geprueft = 0;
    for (let i = 0; i < 36; i++) {
      const k = tage[(i * 7) % tage.length];
      const art = i % 3;
      const y = art === 0 ? { ...x, erfassung: { [k]: { ...NORMAL, ende: `1${i % 10}:00` } } }
        : art === 1 ? { ...x, abweichungen: { ...x.abweichungen, [k]: ["F", "S", "N", "-"][i % 4] } }
          : { ...x, erfassung: { [k]: { ...NORMAL, bestaetigt: false, grund: "LANGER_DIENST" } } };
      expect(istAbweichungen(y, OKT), `${i} ${k}`).toBe(istAbweichungenAlt(y, OKT));
      geprueft++;
    }
    expect(geprueft).toBe(36);
  });
});

/* ------------------------------------------------------------------------ */
describe("P (Einheit): erfassungPauseFehler", () => {
  const b = (erfassung) => ({ mandanten: [{ id: "m-a", erfassung }] });
  const ALT = b({ "a|2026-11-01": { start: "06:00", ende: "14:00", bestaetigt: true, pause: -30 } });
  it.each([
    ["negativ", -30], ["Text", "abc"], ["Text negativ", "-30"], ["Bruch", 12.5], ["über 180", 181], ["NaN", Number.NaN], ["unendlich", 1e999],
    ["Objekt", { m: 30 }], ["Liste", [30]], ["wahr", true],
  ])("neu mit Pause %s ⇒ PAUSE_UNGUELTIG", (_t, pause) => {
    const f = erfassungPauseFehler(b({ "a|2026-11-02": { start: "06:00", ende: "14:00", bestaetigt: true, pause } }), null);
    expect(f).toMatchObject({ code: PAUSE_UNGUELTIG, feld: "mandanten[0].erfassung" });
  });
  it("Pause erreicht die Anwesenheit (= und >, Frühjahrsnacht mit wirklicher Dauer) ⇒ PAUSE_UNGUELTIG", () => {
    expect(erfassungPauseFehler(b({ "a|2026-11-02": { start: "06:00", ende: "06:30", bestaetigt: true, pause: 30 } }))).toMatchObject({ code: PAUSE_UNGUELTIG });
    expect(erfassungPauseFehler(b({ "a|2026-11-02": { start: "06:00", ende: "06:20", bestaetigt: true, pause: 30 } }))).toMatchObject({ code: PAUSE_UNGUELTIG });
    /* 29.03.: 01:30–03:20 sind 50 min wirkliche Anwesenheit — 60 min Pause ist zu lang, obwohl die Uhr 110 min zeigt */
    expect(erfassungPauseFehler(b({ "a|2026-03-29": { start: "01:30", ende: "03:20", bestaetigt: true, pause: 60 } }))).toMatchObject({ code: PAUSE_UNGUELTIG });
  });
  it("gültig ⇒ null: keine Angabe, null, \"\", 0, 30, \"45\", 180 bei 8 h, über Mitternacht, ohne Beginn/Ende (wie geplant)", () => {
    for (const e of [{}, { pause: null }, { pause: "" }, { pause: 0 }, { pause: 30 }, { pause: "45" }, { pause: 180 }])
      expect(erfassungPauseFehler(b({ "a|2026-11-02": { start: "06:00", ende: "14:00", bestaetigt: true, ...e } })), JSON.stringify(e)).toBeNull();
    expect(erfassungPauseFehler(b({ "a|2026-11-02": { start: "22:00", ende: "06:00", bestaetigt: true, pause: 45 } }))).toBeNull();
    expect(erfassungPauseFehler(b({ "a|2026-11-02": { start: null, ende: null, bestaetigt: true, pause: 30 } }))).toBeNull();
  });
  it("Alteintrag mit ungültiger Pause: unverändert (auch andere Schlüsselreihenfolge) ⇒ null; geändert ⇒ 422; gelöscht ⇒ null", () => {
    expect(erfassungPauseFehler(ALT, ALT)).toBeNull();
    expect(erfassungPauseFehler(b({ "a|2026-11-01": { pause: -30, bestaetigt: true, ende: "14:00", start: "06:00" } }), ALT)).toBeNull();
    expect(erfassungPauseFehler(b({ "a|2026-11-01": { start: "06:00", ende: "15:00", bestaetigt: true, pause: -30 } }), ALT)).toMatchObject({ code: PAUSE_UNGUELTIG });
    expect(erfassungPauseFehler(b({ "a|2026-11-01": { start: "06:00", ende: "14:00", bestaetigt: true, pause: 30 } }), ALT)).toBeNull();
    expect(erfassungPauseFehler(b({}), ALT)).toBeNull();
    /* anderer Betrieb mit gleichem Schlüssel ist neu */
    expect(erfassungPauseFehler({ mandanten: [{ id: "m-b", erfassung: ALT.mandanten[0].erfassung }] }, ALT)).toMatchObject({ code: PAUSE_UNGUELTIG });
  });
  it("Differenztest: für gültige Eingaben (alle Pausen 0–180, gültige Uhrzeiten) nie ein Fehler", () => {
    let n = 0;
    for (let pause = 0; pause <= 180; pause += 15) for (const [s, e] of [["06:00", "14:00"], ["13:30", "21:30"], ["21:15", "06:15"], ["00:00", "24:00"]]) {
      expect(erfassungPauseFehler(b({ "a|2026-11-02": { start: s, ende: e, bestaetigt: true, pause } }))).toBeNull();
      n++;
    }
    expect(n).toBe(52);
  });
});

/* ------------------------------------------------------------------------ */
describe("P (Handler): PUT /api/bestand und Teilweg", () => {
  const WIRT = "127.0.0.1:3000";
  const RAUM = "wp14c-nachbesserung";
  const ALT_ERF = { start: "08:00", ende: "16:00", bestaetigt: true, pause: -30 };
  let wurzel, laden, daten, B, token, nr = 0;
  const anfrage = async (pfad, { methode = "POST", rumpf, tok } = {}) => {
    nr += 1;
    const kopf = { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.63.${Math.floor(nr / 250) % 250}.${nr % 250}` };
    if (methode !== "GET") kopf["content-type"] = "application/json";
    if (tok) kopf.authorization = `Bearer ${tok}`;
    const a = await daten(new Request(`http://${WIRT}${pfad}`, { method: methode, headers: kopf,
      ...(methode === "GET" ? {} : { body: JSON.stringify(rumpf || {}) }) }), {});
    let d = {}; try { d = await a.json(); } catch { /* leer */ }
    return { status: a.status, ...d };
  };
  const roh = async () => (await B.bestandLesen(laden(), RAUM)).bestand;
  const person = (id, rolle) => ({ id, vorname: "V", nachname: `N${id}`, rolle, bereich: "ALLE", status: "aktiv", qualifikationen: [],
    zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }] });
  const bestand = () => ({ version: 9, mandanten: [{ id: "m-a", name: "A", status: "aktiv", einstellungen: {},
    einheiten: [{ id: "e1", name: "E" }], dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00", pause: 30, mindest: { mo_do: 0, fr: 0, sa: 0, so: 0 } }],
    personen: [person("l1", "leitung"), person("m1", "mitarbeiter")],
    /* Altbestand: eine bestätigte Ist-Zeit mit negativer Pause (so wie ein Altbestand sie tragen kann) */
    abweichungen: {}, einstempeln: {}, erfassung: { "m1|2026-11-03": ALT_ERF }, anfragen: [], abwesenheiten: [] }] });
  beforeAll(async () => {
    wurzel = await mkdtemp(path.join(tmpdir(), "centric-wp14c-nb-"));
    process.env.CENTRIC_DATEN = wurzel;
    process.env.CENTRIC_ABLAGE = "dateien";
    process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
    process.env.CENTRIC_TEILSPEICHERUNG = "true";
    const schutz = await import("../server/lib/schutz.mjs");
    for (const art of Object.keys(schutz.GRENZEN)) schutz.GRENZEN[art] = { ...schutz.GRENZEN[art], versuche: 100000 };
    const { getStore } = await import("../server/lib/ablage.mjs");
    laden = () => getStore({ name: "centric", consistency: "strong" });
    daten = (await import("../server/funktionen/daten.mjs")).default;
    B = await import("../server/lib/bestand.mjs");
    const { sitzungAnlegen } = await import("../server/lib/sitzungen.mjs");
    await B.bestandSchreiben(laden(), RAUM, bestand(), { durch: "Pruefung" });
    token = (await sitzungAnlegen({ bestand: RAUM, name: "V Nl1", rolle: "leitung", person: "l1", betrieb: 0, mandantId: "m-a", einheit: null },
      2 * 3600 * 1000)).token;
  }, 120000);
  afterAll(async () => {
    delete process.env.CENTRIC_TEILSPEICHERUNG;
    if (wurzel) await rm(wurzel, { recursive: true, force: true });
  });
  const holen = async () => {
    const g = await anfrage("/api/bestand", { methode: "GET", tok: token });
    expect(g.status).toBe(200);
    return g;
  };
  const schreiben = (g, aendern) => {
    const b = JSON.parse(JSON.stringify(g.bestand));
    aendern(b.mandanten[0]);
    return anfrage("/api/bestand", { methode: "PUT", tok: token, rumpf: { bestand: b, etag: g.etag, durch: "Pruefung" } });
  };
  it("eine unabhängige Änderung geht durch; der Alteintrag mit negativer Pause bleibt byte-gleich (nicht still korrigiert)", async () => {
    const w = await schreiben(await holen(), (m) => { m.name = "A geändert"; });
    expect(w.status, JSON.stringify(w)).toBe(200);
    const s = (await roh()).mandanten[0];
    expect(s.name).toBe("A geändert");
    expect(JSON.stringify(s.erfassung["m1|2026-11-03"])).toBe(JSON.stringify(ALT_ERF));
  });
  for (const [titel, aendern] of [
    ["neue Ist-Zeit mit Pause -30", (m) => { m.erfassung["m1|2026-11-04"] = { start: "06:00", ende: "14:00", bestaetigt: true, pause: -30, grund: "" }; }],
    ["neue Ist-Zeit mit Pause als Text", (m) => { m.erfassung["m1|2026-11-04"] = { start: "06:00", ende: "14:00", bestaetigt: true, pause: "x", grund: "" }; }],
    ["neue Ist-Zeit mit Pause über der Anwesenheit", (m) => { m.erfassung["m1|2026-11-04"] = { start: "06:00", ende: "06:20", bestaetigt: true, pause: 30, grund: "" }; }],
    ["Alteintrag geändert, Pause weiter negativ", (m) => { m.erfassung["m1|2026-11-03"] = { ...ALT_ERF, ende: "17:00" }; }],
  ]) {
    it(`${titel}: 422 PAUSE_UNGUELTIG, nichts geändert`, async () => {
      const vorher = JSON.stringify(await roh());
      const w = await schreiben(await holen(), aendern);
      expect(w.status, JSON.stringify(w)).toBe(422);
      expect(w.code).toBe(PAUSE_UNGUELTIG);
      expect(w.feld).toBe("mandanten[0].erfassung");
      expect(w.text).toContain("Es wurde nichts geändert.");
      expect(JSON.stringify(await roh())).toBe(vorher);
    });
  }
  it("gültige Ist-Zeiten gehen wie bisher: ohne Pause (Oberfläche der Leitung), mit 30 min; Alteintrag auf gültige Pause berichtigt", async () => {
    const w1 = await schreiben(await holen(), (m) => { m.erfassung["m1|2026-11-04"] = { start: "06:00", ende: "14:00", bestaetigt: true, grund: "" }; });
    expect(w1.status, JSON.stringify(w1)).toBe(200);
    const w2 = await schreiben(await holen(), (m) => { m.erfassung["m1|2026-11-05"] = { start: "06:00", ende: "14:00", bestaetigt: true, pause: 30, grund: "" }; });
    expect(w2.status, JSON.stringify(w2)).toBe(200);
    const w3 = await schreiben(await holen(), (m) => { m.erfassung["m1|2026-11-03"] = { ...ALT_ERF, pause: 30 }; });
    expect(w3.status, JSON.stringify(w3)).toBe(200);
    const s = (await roh()).mandanten[0];
    expect(s.erfassung["m1|2026-11-05"]).toMatchObject({ pause: 30 });
    expect(s.erfassung["m1|2026-11-03"]).toMatchObject({ pause: 30 });
  });
  it("Teilweg: neue Zelle mit Pause -30 ⇒ 422 PAUSE_UNGUELTIG, nichts geändert; gültige Zelle 200", async () => {
    const g = await holen();
    expect(g.teile && g.teile.epoche, "Teilweg-Versionen in der Antwort").toBeTruthy();
    const vorher = JSON.stringify(await roh());
    const t = await anfrage("/api/bestand/teile", { methode: "POST", tok: token, rumpf: { format: 1, epoche: g.teile.epoche, durch: "Pruefung",
      zellen: [{ feld: "erfassung", k: "m1|2026-11-06", alt: null, neu: { start: "06:00", ende: "14:00", bestaetigt: true, pause: -30, grund: "" } }] } });
    expect(t.status, JSON.stringify(t)).toBe(422);
    expect(t.code).toBe(PAUSE_UNGUELTIG);
    expect(JSON.stringify(await roh())).toBe(vorher);
    const ok = await anfrage("/api/bestand/teile", { methode: "POST", tok: token, rumpf: { format: 1, epoche: g.teile.epoche, durch: "Pruefung",
      zellen: [{ feld: "erfassung", k: "m1|2026-11-06", alt: null, neu: { start: "06:00", ende: "14:00", bestaetigt: true, pause: 30, grund: "" } }] } });
    expect(ok.status, JSON.stringify(ok)).toBe(200);
  });
});
