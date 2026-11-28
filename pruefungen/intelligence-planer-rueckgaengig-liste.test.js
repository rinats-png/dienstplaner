/* ==========================================================================
   WP-I7 — PLANVORSCHLAG-ÜBERNAHME, Stufe 3 (Server, nur lesen): POST /api/planer-rueckgaengig-liste
   (server/lib/planer-aktion.mjs über den echten Handler daten.mjs)

   Die Liste der offenen Rückgängig-Datensätze des eigenen Betriebs für einen Monat — damit die Oberfläche nach dem Neuladen noch
   zurücknehmen kann (die Kennung `pu-…` ginge sonst verloren).
   1. Rechte und Reihenfolge: Leitung und Planung ja; Schichtverantwortung, Beschäftigte, Betriebsrat, Kundenrolle und Demo 403; ohne
      Sitzung 401; unbekannte Felder im Rumpf 400; Monat Pflicht.
   2. Inhalt: nur Kennung, Monat, Zahl, Zeitraum (Tage) und letzter Tag der Rücknahme — nie Person|Tag, Namen, Vorwerte, Zeitpunkt,
      Vorschlagskennung; nur der gefragte Monat; abgelaufene und abgeschlossene Datensätze nicht; neueste zuerst.
   3. Nur lesen, ohne Planer-Freigabe: der Bestand bleibt byte-gleich, kein Planerlauf, die Liste geht bei ausgeschaltetem Planer.
   4. Mandantentrennung: ein anderer Betrieb desselben Raums sieht die Datensätze nicht.
   5. Ende zu Ende mit dem echten Weg: übernehmen → Liste → zurücknehmen → Liste leer.
   Nur synthetische Daten, Uhr fest (vi.useFakeTimers, nur Date). PLANER_AN bleibt im Code AUS; die Prüfung gibt den Planer nur über
   den Prüf-Zugang frei (vi.mock von engine/planer.mjs) — nie über die Anfrage.
   Aufruf: TZ=UTC npx vitest run pruefungen/intelligence-planer-rueckgaengig-liste.test.js
   ========================================================================== */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { baueLeerenBetrieb } from "../server/lib/leerbetrieb.mjs";
import { aufbewahrenBis } from "../server/lib/planer-rueckgaengig.mjs";

vi.mock("../server/lib/engine/planer.mjs", async (original) => {
  const o = /** @type {any} */ (await original());
  return { ...o, get PLANER_AN() { return globalThis.__listeFreiPruefung === true; },
    planerEinstieg: (...a) => { globalThis.__listeLaeufe = (globalThis.__listeLaeufe || 0) + 1; return o.planerEinstieg(...a); } };
});

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const T0 = "2026-11-27T10:00:00.000Z";
const YM = "2026-12";
const WIRT = "127.0.0.1:3000";
const st = { am: T0, vonRolle: "leitung" };
const FREI = Object.freeze({ betrieb: { an: true, ...st }, betriebsratFrage: { antwort: "nein", ...st }, planerSchalter: { an: true, ...st } });
const frei = (an) => { globalThis.__listeFreiPruefung = an; };
const laeufe = () => globalThis.__listeLaeufe || 0;
const WEG = "/api/planer-rueckgaengig-liste";

let wurzel, S, nr = 0, raumNr = 0;

beforeAll(async () => {
  vi.useFakeTimers({ now: new Date(T0), toFake: ["Date"] });
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-wpi7rgl-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
  const schutz = await import("../server/lib/schutz.mjs");
  for (const art of Object.keys(schutz.GRENZEN)) schutz.GRENZEN[art] = { ...schutz.GRENZEN[art], versuche: 1000000 };
  const { getStore } = await import("../server/lib/ablage.mjs");
  S = { laden: () => getStore({ name: "centric", consistency: "strong" }), daten: (await import("../server/funktionen/daten.mjs")).default,
    B: await import("../server/lib/bestand.mjs"), G: await import("../server/lib/gestalt.mjs"), sitzungAnlegen: (await import("../server/lib/sitzungen.mjs")).sitzungAnlegen };
}, 180000);
afterAll(async () => {
  vi.useRealTimers();
  frei(false);
  if (wurzel) await rm(wurzel, { recursive: true, force: true });
});
afterEach(() => { vi.setSystemTime(new Date(T0)); frei(false); });

/* ---------------------------------- Betrieb ---------------------------------- */
const STAB = [["l1", "leitung"], ["l2", "leitung"], ["pl1", "planer"], ["s1", "subplaner"], ["a1", "mitarbeiter"], ["b1", "betriebsrat"], ["k1", "kunde"]];
function bestandFuer(id = "m1") {
  const g = baueLeerenBetrieb({ name: "T", branche: "pflege", email: "x@example.org", land: "HE", raum: "r" });
  const m = g.mandanten[0];
  m.id = id;
  m.status = "aktiv";
  const e1 = m.einheiten[0].id;
  m.personen = [
    ...[1, 2, 3, 4].map((i) => ({ id: `p${i}`, vorname: "Vorname", nachname: `Zuname${i}`, eintritt: "2020-01-01", zugehoerigkeit: [{ einheitId: e1, ab: "2020-01-01" }], wochenstunden: 40, status: "aktiv", qualifikationen: [] })),
    ...STAB.map(([pid, rolle]) => ({ id: pid, vorname: "Stab", nachname: `Stabname-${pid}`, rolle, status: "aktiv", wochenstunden: 40, bereich: rolle === "subplaner" ? e1 : "ALLE", qualifikationen: [] })),
  ];
  m.dienstarten = m.dienstarten.map((d) => (d.id === "F" ? { ...d, mindest: { mo_do: 1, fr: 1, sa: 1, so: 1 } } : d));
  m.einstellungen = { ...m.einstellungen, kiSteuerung: structuredClone(FREI) };
  g.version = 9;
  return g;
}
const SITZ = { LT: ["l1", "leitung"], PL: ["pl1", "planer"], SV: ["s1", "subplaner"], MA: ["a1", "mitarbeiter"], BR: ["b1", "betriebsrat"],
  KD: ["k1", "kunde"], DLT: ["l1", "leitung", true], DPL: ["pl1", "planer", true] };
/** Ein Datensatz wie ihn die Aktion schreibt (synthetisch): Kennung, Monat, Einträge mit Vorwerten, Frist. */
const hex = (n) => n.toString(16).padStart(32, "0");
const satz = (n, ym, tage, am = "2026-11-26T09:00:00.000Z") => ({ id: `pu-${hex(n)}`, vorschlag: `pv-${hex(n + 1000)}`, art: "planer-uebernahme", ym, basis: `sha256:${hex(n)}`, am,
  eintraege: tage.map((d, i) => ({ schluessel: `p${(i % 4) + 1}|${d}`, vorher: null, nachher: "F" })), aufbewahrenBis: aufbewahrenBis(ym) });
async function raum(o = {}) {
  const name = `wpi7rgl-${++raumNr}`;
  const g = bestandFuer("m1");
  if (o.zweiterBetrieb) g.mandanten.push(bestandFuer("m2").mandanten[0]);
  if (o.saetze) g.mandanten[0].planerRueckgaengig = o.saetze;
  if (o.abgeschlossen) g.mandanten[0].monatsabschluss = { [o.abgeschlossen]: { abgeschlossen: true } };
  await S.B.bestandSchreiben(S.laden(), name, S.G.personenAngleichen(g), { durch: "Pruefung" });
  const r = { name, t: {}, mid: "m1", einheit: g.mandanten[0].einheiten[0].id };
  await frisch(r);
  return r;
}
async function frisch(r) {
  for (const [k, [person, rolle, demo]] of Object.entries(SITZ))
    r.t[k] = (await S.sitzungAnlegen({ bestand: r.name, name: `Stab ${person}`, rolle, person, betrieb: 0, mandantId: r.mid, einheit: rolle === "subplaner" ? r.einheit : null,
      ...(demo ? { demo: true } : {}) }, 30 * 24 * 3600 * 1000)).token;
  return r;
}
async function anfrage(pfad, { methode = "POST", rumpf, token } = {}) {
  nr += 1;
  const kopf = { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.82.${Math.floor(nr / 250) % 250}.${nr % 250}` };
  if (methode !== "GET") kopf["content-type"] = "application/json";
  if (token) kopf.authorization = `Bearer ${token}`;
  const a = await S.daten(new Request(`http://${WIRT}${pfad}`, { method: methode, headers: kopf,
    ...(methode === "GET" ? {} : { body: JSON.stringify(rumpf === undefined ? {} : rumpf) }) }), {});
  const text = await a.text();
  let d = {}; try { d = JSON.parse(text); } catch { /* leer */ }
  return { status: a.status, roh: text, ...d };
}
const liste = (rumpf, token) => anfrage(WEG, { rumpf, token });
const lesen = async (name) => S.B.bestandLesenStreng(S.laden(), name);
const abdruck = async (name) => { const l = await lesen(name); return JSON.stringify({ stand: l.stand, bestand: l.bestand }); };

const DREI = [satz(1, YM, ["2026-12-03", "2026-12-05", "2026-12-04"], "2026-11-26T09:00:00.000Z"),
  satz(2, YM, ["2026-12-10", "2026-12-24"], "2026-11-26T11:00:00.000Z"),
  satz(3, "2026-11", ["2026-11-30"], "2026-11-26T08:00:00.000Z")];

describe("1. Rechte und Rumpf", { timeout: 300000 }, () => {
  it("Leitung und Planung bekommen die Liste; Schichtverantwortung, Beschäftigte, Betriebsrat, Kundenrolle und Demo 403; ohne Sitzung 401", async () => {
    const r = await raum({ saetze: DREI });
    const vorher = await abdruck(r.name);
    for (const k of ["LT", "PL"]) {
      const x = await liste({ ym: YM }, r.t[k]);
      expect([x.status, x.ok, x.eintraege.length], k).toEqual([200, true, 2]);
    }
    for (const k of ["SV", "MA", "BR", "KD", "DLT", "DPL"]) {
      const x = await liste({ ym: YM }, r.t[k]);
      expect([x.status, x.code], k).toEqual([403, "keine-berechtigung"]);
      expect(x.roh, k).not.toMatch(/pu-[0-9a-f]{32}/);
    }
    expect((await liste({ ym: YM })).status).toBe(401);
    expect(await abdruck(r.name)).toBe(vorher);
  });
  it("Rumpf: nur { ym }; unbekannte Felder und falsche Monate 400, eingeschleuste Rolle/Demo/Freigabe wirkungslos", async () => {
    const r = await raum({ saetze: DREI });
    for (const rumpf of [{ ym: YM, rolle: "leitung" }, { ym: YM, demo: false }, { ym: YM, freigabe: true }, { ym: YM, uebernahme: DREI[0].id }, []]) {
      const x = await liste(rumpf, r.t.LT);
      expect([x.status, x.code], JSON.stringify(rumpf)).toEqual([400, "anfrage-ungueltig"]);
    }
    for (const rumpf of [{}, { ym: 202612 }, { ym: "2026-13" }, { ym: "2026-1" }, { ym: null }]) {
      const x = await liste(rumpf, r.t.LT);
      expect([x.status, x.code], JSON.stringify(rumpf)).toEqual([400, "monat-ungueltig"]);
    }
    /* Auch ein eingeschleustes demo wirkt nicht: die Demo-Sitzung bleibt 403. */
    expect((await liste({ ym: YM, demo: false }, r.t.DLT)).status).toBe(403);
  });
  it("GET ist kein Weg (404), nur POST", async () => {
    const r = await raum({ saetze: DREI });
    const x = await anfrage(WEG, { methode: "GET", token: r.t.LT });
    expect(x.status).not.toBe(200);
    expect(x.roh).not.toMatch(/pu-[0-9a-f]{32}/);
  });
});

describe("2. Inhalt: nur das Nötige", { timeout: 300000 }, () => {
  it("je Eintrag genau Kennung, Monat, Zahl, Zeitraum und Frist; nur der gefragte Monat; neueste zuerst", async () => {
    const r = await raum({ saetze: DREI });
    const x = await liste({ ym: YM }, r.t.LT);
    expect(x.status).toBe(200);
    expect(x.ym).toBe(YM);
    expect(x.eintraege).toEqual([
      { uebernahme: DREI[1].id, ym: YM, anzahl: 2, von: "2026-12-10", bis: "2026-12-24", rueckgaengigBis: "2027-01-07" },
      { uebernahme: DREI[0].id, ym: YM, anzahl: 3, von: "2026-12-03", bis: "2026-12-05", rueckgaengigBis: "2027-01-07" },
    ]);
    for (const e of x.eintraege) expect(Object.keys(e).sort()).toEqual(["anzahl", "bis", "rueckgaengigBis", "uebernahme", "von", "ym"]);
    /* Weder Person|Tag noch Namen, Vorwerte, Zeitpunkt, Vorschlag oder Basis. */
    expect(x.roh).not.toMatch(/p\d\||Zuname|Stabname|Vorname|vorher|nachher|schluessel|basis|"am"|pv-|sha256|eintraege\]?":\[\{"schluessel/);
    const nov = await liste({ ym: "2026-11" }, r.t.LT);
    expect(nov.eintraege.map((e) => [e.uebernahme, e.anzahl])).toEqual([[DREI[2].id, 1]]);
    expect((await liste({ ym: "2027-02" }, r.t.LT)).eintraege).toEqual([]);
  });
  it("abgelaufene (Frist) und abgeschlossene Datensätze erscheinen nicht; ein unbrauchbarer Datensatz wird nicht angeboten", async () => {
    const abgelaufen = satz(4, "2026-10", ["2026-10-20"]);   // Frist 2026-11-07 < heute (2026-11-27)
    const leer = { ...satz(5, YM, []), eintraege: [] };
    const r = await raum({ saetze: [...DREI, abgelaufen, leer, { id: "pu-kaputt", ym: YM }] });
    expect((await liste({ ym: "2026-10" }, r.t.LT)).eintraege).toEqual([]);
    expect((await liste({ ym: YM }, r.t.LT)).eintraege.map((e) => e.uebernahme)).toEqual([DREI[1].id, DREI[0].id]);
    const zu = await raum({ saetze: DREI, abgeschlossen: YM });
    expect((await liste({ ym: YM }, zu.t.LT)).eintraege).toEqual([]);
    expect((await liste({ ym: "2026-11" }, zu.t.LT)).eintraege).toHaveLength(1);
    /* Fristende: am letzten Tag noch, am Tag danach nicht mehr. */
    vi.setSystemTime(new Date("2027-01-07T10:00:00.000Z"));
    await frisch(r);
    expect((await liste({ ym: YM }, r.t.LT)).eintraege).toHaveLength(2);
    vi.setSystemTime(new Date("2027-01-08T10:00:00.000Z"));
    await frisch(r);
    expect((await liste({ ym: YM }, r.t.LT)).eintraege).toEqual([]);
  });
  it("ohne Datensätze: leere Liste", async () => {
    const r = await raum();
    const x = await liste({ ym: YM }, r.t.LT);
    expect([x.status, x.ok, x.eintraege]).toEqual([200, true, []]);
  });
});

describe("3. Nur lesen, unabhängig von der Planer-Freigabe", { timeout: 300000 }, () => {
  it("Planer aus: die Liste geht, nichts gerechnet, nichts geschrieben; Planer frei ändert die Antwort nicht", async () => {
    const r = await raum({ saetze: DREI });
    const vorher = await abdruck(r.name);
    const n0 = laeufe();
    frei(false);
    const aus = await liste({ ym: YM }, r.t.LT);
    frei(true);
    const an = await liste({ ym: YM }, r.t.LT);
    expect(aus.status).toBe(200);
    expect(an.eintraege).toEqual(aus.eintraege);
    expect(laeufe()).toBe(n0);
    expect(await abdruck(r.name)).toBe(vorher);
  });
  it("Quelltext: Rolle vor Bremse vor Aktion; keine Planer-Freigabe, kein Schreiben in der Liste", async () => {
    const d = await readFile(path.join(WURZEL, "server", "funktionen", "daten.mjs"), "utf8");
    const von = d.indexOf('pfad === "planer-rueckgaengig-liste"');
    const block = d.slice(von, d.indexOf('pfad === "abmelden" && req.method === "POST") {', von));
    expect(block.indexOf("planerAktionErlaubt(s)")).toBeGreaterThan(-1);
    expect(block.indexOf("planerAktionErlaubt(s)")).toBeLessThan(block.indexOf('bremse("lesen"'));
    expect(block.indexOf('bremse("lesen"')).toBeLessThan(block.indexOf("rueckgaengigListeAusgeben("));
    const a = await readFile(path.join(WURZEL, "server", "lib", "planer-aktion.mjs"), "utf8");
    const liste_ = a.slice(a.indexOf("export async function rueckgaengigListeAusgeben"), a.indexOf("export function planerAktion("));
    expect(liste_).not.toMatch(/planerFrei\(|PLANER_AN|bestandSchreiben|schreiben\(|unterRaumsperre/);
  });
});

describe("4. Mandantentrennung", { timeout: 300000 }, () => {
  it("ein anderer Betrieb desselben Raums sieht die Datensätze nicht", async () => {
    const r = await raum({ saetze: DREI, zweiterBetrieb: true });
    expect((await liste({ ym: YM }, r.t.LT)).eintraege).toHaveLength(2);
    const t2 = (await S.sitzungAnlegen({ bestand: r.name, name: "Stab l1", rolle: "leitung", person: "l1", betrieb: 1, mandantId: "m2", einheit: null }, 30 * 24 * 3600 * 1000)).token;
    const x = await liste({ ym: YM }, t2);
    expect([x.status, x.eintraege]).toEqual([200, []]);
    expect(x.roh).not.toMatch(/pu-[0-9a-f]{32}/);
  });
});

describe("5. Ende zu Ende mit dem echten Weg", { timeout: 300000 }, () => {
  it("übernehmen → die Liste nennt die Übernahme (auch bei ausgeschaltetem Planer) → zurücknehmen → die Liste ist leer", async () => {
    const r = await raum();
    frei(true);
    const v = await anfrage("/api/planer-vorschlag", { rumpf: { ym: YM }, token: r.t.LT });
    expect(v.status, v.roh.slice(0, 300)).toBe(201);
    const auswahl = v.eintraege.slice(0, 3).map((e) => e.index);
    const u = await anfrage("/api/planer-uebernahme", { rumpf: { vorschlag: v.vorschlag, auswahl, bestaetigt: true }, token: r.t.LT });
    expect(u.status, u.roh.slice(0, 300)).toBe(200);
    frei(false);
    const l = await liste({ ym: YM }, r.t.PL);
    const tage = v.eintraege.slice(0, 3).map((e) => e.datum).sort();
    expect(l.eintraege).toEqual([{ uebernahme: u.uebernahme, ym: YM, anzahl: 3, von: tage[0], bis: tage[2], rueckgaengigBis: u.rueckgaengigBis }]);
    const z = await anfrage("/api/planer-rueckgaengig", { rumpf: { uebernahme: l.eintraege[0].uebernahme, bestaetigt: true }, token: r.t.LT });
    expect(z.status, z.roh.slice(0, 300)).toBe(200);
    expect((await liste({ ym: YM }, r.t.LT)).eintraege).toEqual([]);
  });
});
