/* ==========================================================================
   KORREKTURWORKFLOW — NACHTRAG WP-14b (unabhängige Nachprüfung WP-06b/13/14)

   M1  Betriebsprotokoll (Spur) und Betreiber-Lage: keine Schutzkennungen
       (Art. 9: Mutterschutz, Jugendschutz), keine Ist-Zeiten, keine
       Personenkennung der betroffenen Person — der Betreiber ist
       Auftragsverarbeiter (§ 3 AV), lage.mjs „ohne personenbezogene Daten“.
   M2  Zeitumstellung: Pause gegen die wirkliche Anwesenheit (bruttoAm), Ist
       nie negativ — Antrag, Genehmigung und Direktkorrektur.
   M3  Korrigierter Tag ohne Plan (DAUER_NULL, UNGEPLANTER_DIENST) zählt.
   M4  Beginn = Ende: 422 (Antrag und Direktkorrektur), keine 24-h-Ausnahme.
   M5  Genehmigung eines überholten Antrags (Ist seitdem geändert): 409.
   N1  Antrag ohne Pause: die übernommene Pause nach derselben Regel wie bei
       der Genehmigung — sonst bleibt der Antrag hängen.
   N2  Selbstfreigabe: Kennzeichen am Ereignis (ändert kein Recht).
   N3  Antrag mit Ende in der Zukunft: 422.
   M4-Schwachstelle: genehmigt, dann abgelehnt ⇒ 409.
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pauseZuLang } from "../server/lib/zeitregeln.mjs";
import { antragStellen, antragEntscheiden } from "../server/lib/korrekturworkflow.mjs";
import { korrekturAnhaengen } from "../server/lib/stempelintegritaet.mjs";
import { ungeplanterDienst, istZeitFuer, pruefHinweis } from "../src/istdaten.js";

const WIRT = "127.0.0.1:3000";
const RAUM = "wp14b-nachtrag";
let wurzel, laden, daten, lage, B, Z, sitzungAnlegen, schutz;
let HEUTE, tag;

let nr = 0;
const rufen = async (fn, url, { methode = "POST", rumpf, token } = {}) => {
  nr += 1;
  const kopf = { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.16.${Math.floor(nr / 250) % 250}.${nr % 250}` };
  if (methode !== "GET") kopf["content-type"] = "application/json";
  if (token) kopf.authorization = `Bearer ${token}`;
  const a = await fn(new Request(`http://${WIRT}${url}`, { method: methode, headers: kopf,
    ...(methode === "GET" ? {} : { body: JSON.stringify(rumpf || {}) }) }), {});
  const text = await a.text();
  let d = {}; try { d = JSON.parse(text); } catch { /* leer */ }
  return { status: a.status, roh: text, ...d };
};
const anfrage = (pfad, o) => rufen(daten, `/api/${pfad}`, o);
const person = (id, rolle, extra = {}) => ({ id, vorname: "V", nachname: id.toUpperCase(), rolle, bereich: "e1", status: "aktiv",
  geburtstag: "1985-01-01", wochenstunden: 39, zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }], ...extra });
const ROLLEN = { l1: "leitung", p1: "planer", a1: "mitarbeiter", a2: "mitarbeiter", a3: "mitarbeiter", a4: "mitarbeiter",
  mu1: "mitarbeiter", ju1: "mitarbeiter", r1: "betriebsrat" };
const token = async (id) => (await sitzungAnlegen({ bestand: RAUM, name: `V ${id.toUpperCase()}`, rolle: ROLLEN[id], person: id, betrieb: 0,
  mandantId: "m1", einheit: null }, 2 * 3600 * 1000)).token;
const betreiberToken = async () => (await sitzungAnlegen({ bestand: RAUM, name: "Betrieb", rolle: "betreiber", person: null, betrieb: 0,
  mandantId: "m1", einheit: null }, 2 * 3600 * 1000)).token;
const mandant = async () => (await B.bestandLesen(laden(), RAUM)).bestand.mandanten[0];
const stempel = (start, ende, extra = {}) => ({ start, startAm: `${tag(-1)}T05:00:00.000Z`, ortStart: "Ohne Standortfreigabe erfasst",
  innerhalbStart: null, geprueftStart: false, ende, endeAm: `${tag(-1)}T13:00:00.000Z`, ortEnde: "Ohne Standortfreigabe erfasst",
  innerhalbEnde: null, geprueftEnde: false, ...extra });
const antrag = (datum, start, ende, grund = "Ich habe vergessen auszustempeln", extra = {}) => ({ datum, start, ende, grund, ...extra });
const DA = [{ id: "F", name: "Früh", start: "06:00", ende: "14:00", pause: 30 }, { id: "N", name: "Nacht", start: "22:00", ende: "06:00", pause: 60 }];

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-wp14b-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
  const { getStore } = await import("../server/lib/ablage.mjs");
  laden = () => getStore({ name: "centric", consistency: "strong" });
  schutz = await import("../server/lib/schutz.mjs");
  for (const art of Object.keys(schutz.GRENZEN)) schutz.GRENZEN[art] = { ...schutz.GRENZEN[art], versuche: 100000 };
  daten = (await import("../server/funktionen/daten.mjs")).default;
  lage = (await import("../server/funktionen/lage.mjs")).default;
  B = await import("../server/lib/bestand.mjs");
  Z = await import("../server/lib/zeiterfassung.mjs");
  ({ sitzungAnlegen } = await import("../server/lib/sitzungen.mjs"));
  HEUTE = Z.heuteBerlin();
  tag = (n) => Z.tagePlus(HEUTE, n);
  const einstempeln = {}, erfassung = {}, abweichungen = {};
  for (const [id, n] of [["a1", -1], ["a1", -2], ["a2", -1], ["a2", -2], ["a3", -1], ["a4", -1], ["mu1", -1], ["mu1", -2], ["ju1", -1], ["l1", -1], ["l1", -2], ["r1", -1]]) {
    einstempeln[`${id}|${tag(n)}`] = stempel("06:02", "14:01");
    erfassung[`${id}|${tag(n)}`] = { start: "06:02", ende: "14:01", bestaetigt: true, grund: "" };
    abweichungen[`${id}|${tag(n)}`] = "F";
  }
  /* N1: zuletzt erfasste Pause 60 min. */
  erfassung[`a3|${tag(-1)}`].pause = 60;
  /* M2: Stempel an beiden Umstellungstagen (Direktkorrektur ohne Zeitgrenze). */
  for (const d of ["2026-03-29", "2026-10-25"]) {
    einstempeln[`a2|${d}`] = { start: "01:00", startAm: `${d}T00:00:00.000Z`, ende: "04:00", endeAm: `${d}T02:00:00.000Z` };
    erfassung[`a2|${d}`] = { start: "01:00", ende: "04:00", bestaetigt: true, grund: "" };
    abweichungen[`a2|${d}`] = "F";
  }
  await B.bestandSchreiben(laden(), RAUM, { version: 9, mandanten: [{ id: "m1", name: "Haus",
    einheiten: [{ id: "e1", name: "WB 1" }], einstellungen: { ruhezeit: 11 }, dienstarten: DA,
    personen: [person("l1", "leitung"), person("p1", "planer"), person("a1", "mitarbeiter"), person("a2", "mitarbeiter"),
      person("a3", "mitarbeiter"), person("a4", "mitarbeiter"), person("mu1", "mitarbeiter", { mutterschutz: true }),
      person("ju1", "mitarbeiter", { geburtstag: "2010-05-05" }), person("r1", "betriebsrat")],
    abweichungen, abwesenheiten: [], erfassung, einstempeln, anfragen: [], nachrichten: [] }] }, { durch: "Pruefung" });
}, 60000);
afterAll(async () => { if (wurzel) await rm(wurzel, { recursive: true, force: true }); });

/* Ein kleiner Betrieb für die Prüfungen ohne Server. */
const klein = (extra = {}) => ({ personen: [person("a", "mitarbeiter"), person("l", "leitung")], dienstarten: DA,
  abweichungen: {}, einstempeln: {}, erfassung: {}, einstellungen: { ruhezeit: 11 }, ...extra });

/* ======================================================================== */
describe("M1: keine Schutzkennungen, Ist-Zeiten oder Personenkennungen im Protokoll und in der Betreiber-Lage", { timeout: 120000 }, () => {
  const VERBOTEN = ["MUTTERSCHUTZ", "JUGENDSCHUTZ", "mu1", "ju1", "14:00", "22:00", "06:02", "14:01"];
  it("Antrag + Genehmigung mit Mutterschutz-Hinweis, Direktkorrektur mit Jugendschutz-Hinweis: Antworten tragen die Hinweise, die Spur nicht", async () => {
    const a = await anfrage("korrektur-antrag", { token: await token("mu1"), rumpf: antrag(tag(-1), "14:00", "22:00", "Spätdienst getauscht, so gearbeitet", { pause: 30 }) });
    expect(a.status, a.roh).toBe(200);
    const g = await anfrage("korrektur-entscheiden", { token: await token("l1"),
      rumpf: { personId: "mu1", datum: tag(-1), antragId: a.antrag.id, entscheidung: "genehmigt" } });
    expect(g.status, g.roh).toBe(200);
    expect(g.hinweise.map((x) => x.code)).toContain("MUTTERSCHUTZ");             // die Leitung erfährt es — in der Antwort
    const k = await anfrage("stempel-korrektur", { token: await token("p1"),
      rumpf: { personId: "ju1", datum: tag(-1), start: "14:00", ende: "22:00", pause: 30, grund: "Spätdienst laut Übergabebuch" } });
    expect(k.status, k.roh).toBe(200);
    expect(k.hinweise.map((x) => x.code)).toContain("JUGENDSCHUTZ");
    /* Abweisung mit Zeiten im Grund (Pause zu lang). */
    const ab = await anfrage("stempel-korrektur", { token: await token("p1"),
      rumpf: { personId: "mu1", datum: tag(-2), start: "14:00", ende: "15:00", pause: 90, grund: "Pause falsch eingetragen, Korrektur" } });
    expect(ab.status).toBe(422);

    const spur = schutz.spurLesen ? await schutz.spurLesen(1) : [];
    const korrektur = spur.filter((z) => /^(Korrekturantrag|Stempelkorrektur)/.test(z.zusatz || ""));
    expect(korrektur.length).toBeGreaterThanOrEqual(4);
    for (const z of korrektur) {
      for (const w of VERBOTEN) expect(z.zusatz, `Spur: ${w}`).not.toContain(w);
      expect(z.zusatz).not.toMatch(/\b([01]\d|2[0-3]):[0-5]\d\b/);
      expect(z.zusatz).not.toMatch(/\|\d{4}-\d{2}-\d{2}/);
    }
    /* Die Folge bleibt nachvollziehbar: Antrag und Korrekturereignis per Kennung; die Zeiten stehen am Stempel. */
    expect(korrektur.some((z) => z.zusatz === `Korrekturantrag ${a.antrag.id}: gestellt`)).toBe(true);
    expect(korrektur.some((z) => z.zusatz.startsWith(`Korrekturantrag ${a.antrag.id}: genehmigt · Korrektur ${g.ereignis.id}`)
      && /· \d+ Hinweise?\b/.test(z.zusatz))).toBe(true);
    expect(korrektur.some((z) => z.zusatz.startsWith(`Stempelkorrektur ${k.ereignis.id}`))).toBe(true);
  });
  it("die Betreiber-Lage filtert auch Altbestand der Spur (vor dem Nachtrag geschriebene Zeilen) und nennt keine Personenkennung", async () => {
    /* Eine Zeile im alten Format, wie sie bis zu 30 Tage in der Spur liegt. */
    await schutz.protokoll("schreiben", "raum-x", "erfolg",
      "Korrekturantrag ka-0123 mu1|2026-11-02: genehmigt · 06:02–14:01 → 14:00–22:00 · Hinweise: MUTTERSCHUTZ,JUGENDSCHUTZ",
      { rolle: "leitung", person: "l1" });
    const r = await rufen(lage, "/lage?tage=2", { methode: "GET", token: await betreiberToken() });
    expect(r.status, r.roh).toBe(200);
    expect(r.letzte.length).toBeGreaterThan(0);
    for (const w of ["MUTTERSCHUTZ", "JUGENDSCHUTZ", "mu1", "ju1"]) expect(r.roh, `Lage: ${w}`).not.toContain(w);
    for (const z of r.letzte) {
      expect(z, JSON.stringify(z)).not.toHaveProperty("person");
      const { zeit: _zeit, ...ohneZeit } = z;                                 // der Zeitstempel der Zeile selbst ist keine Ist-Zeit
      const s = JSON.stringify(ohneZeit);
      for (const w of VERBOTEN) expect(s, `Lage: ${w}`).not.toContain(w);
      expect(s).not.toMatch(/\b([01]\d|2[0-3]):[0-5]\d\b/);
      expect(s).not.toMatch(/\w\|\d{4}-\d{2}-\d{2}/);
    }
    /* Die Zeile selbst bleibt sichtbar — nur ohne Personenbezug. */
    expect(r.letzte.some((z) => /^Korrekturantrag ka-0123 .*genehmigt/.test(z.zusatz || ""))).toBe(true);
  });
});

/* ======================================================================== */
describe("M2: Zeitumstellung — Pause gegen die wirkliche Anwesenheit, Ist nie negativ", { timeout: 120000 }, () => {
  it("pauseZuLang mit Tag: Frühjahr 01:00–04:00 sind 2 h (150 min zu lang), Herbst 01:00–03:00 sind 3 h (150 min gehen)", () => {
    expect(pauseZuLang("01:00", "04:00", 150, "2026-03-29")).toBe(true);
    expect(pauseZuLang("01:00", "04:00", 119, "2026-03-29")).toBe(false);
    expect(pauseZuLang("01:00", "03:00", 150, "2026-10-25")).toBe(false);
    expect(pauseZuLang("01:00", "03:00", 180, "2026-10-25")).toBe(true);
    expect(pauseZuLang("01:00", "04:00", 150)).toBe(false);                   // ohne Tag wie bisher (Uhrzeit)
  });
  it("Direktkorrektur am 29.03.: 01:00–04:00 mit 150 min Pause ⇒ 422, Ist unverändert; mit 119 min 200 und Ist ≥ 0", async () => {
    const t = await token("l1");
    const vor = (await mandant()).erfassung["a2|2026-03-29"];
    const k = (pause) => anfrage("stempel-korrektur", { token: t, rumpf: { personId: "a2", datum: "2026-03-29", start: "01:00", ende: "04:00", pause,
      grund: "Pause laut Pausenbuch nachgetragen" } });
    expect((await k(150)).status).toBe(422);
    expect((await mandant()).erfassung["a2|2026-03-29"]).toEqual(vor);
    const gut = await k(119);
    expect(gut.status, gut.roh).toBe(200);
    const m = await mandant();
    const ist = istZeitFuer(m, m.personen.find((p) => p.id === "a2"), "2026-03-29", DA[0]);
    expect(ist.std).toBeGreaterThanOrEqual(0);
    expect(ist.std).toBeLessThan(0.1);
  });
  it("Antrag und Genehmigung am 29.03.: 150 min Pause bei 01:00–04:00 ⇒ 422 (Antrag) bzw. 422 (Genehmigung eines Altantrags)", () => {
    const m = klein({ einstempeln: { "a|2026-03-29": { start: "01:00", ende: "04:00" } },
      erfassung: { "a|2026-03-29": { start: "01:00", ende: "04:00", bestaetigt: true, grund: "" } }, abweichungen: { "a|2026-03-29": "F" } });
    const r = antragStellen(m, { personId: "a" }, antrag("2026-03-29", "01:00", "04:00", "Pause laut Pausenbuch", { pause: 150 }),
      new Date("2026-03-30T08:00:00Z"), "ka-1", "2026-03-30");
    expect(r.status).toBe(422);
    /* Ein Antrag, der vor dem Nachtrag angenommen wurde, läuft bei der Genehmigung in dieselbe Prüfung. */
    const alt = { id: "ka-alt", von: { personId: "a" }, gestellt: "2026-03-30T08:00:00Z", vorschlag: { start: "01:00", ende: "04:00", pause: 150 },
      grund: "Pause laut Pausenbuch", original: { start: "01:00", ende: "04:00" }, ist: { start: "01:00", ende: "04:00", bestaetigt: true },
      status: "offen", entschieden: null };
    const m2 = { ...m, einstempeln: { "a|2026-03-29": { start: "01:00", ende: "04:00", antraege: [alt] } } };
    const e = antragEntscheiden(m2, { personId: "a", datum: "2026-03-29", antragId: "ka-alt", entscheidung: "genehmigt" }, { personId: "l" }, new Date(), "k-1");
    expect(e.status).toBe(422);
  });
  it("Altdaten mit negativer Ist-Dauer (Pause größer als die wirkliche Anwesenheit) zählen 0, nicht negativ", () => {
    const m = klein({ erfassung: { "a|2026-03-29": { start: "01:00", ende: "04:00", bestaetigt: true, pause: 150, grund: "" } } });
    const ist = istZeitFuer(m, m.personen[0], "2026-03-29", DA[0]);
    expect(ist.erfasst).toBe(true);
    expect(ist.std).toBe(0);
  });
  it("Herbst 25.10.: ein ZEITUMSTELLUNG-Prüffall lässt sich nicht mit denselben Uhrzeiten bestätigen (422); eindeutige Zeiten gehen", () => {
    const m = klein({ abweichungen: { "a|2026-10-25": "F" },
      einstempeln: { "a|2026-10-25": { start: "02:30", startAm: "2026-10-25T00:30:00.000Z", ende: "02:20", endeAm: "2026-10-25T01:20:00.000Z", markierungen: ["ZEITUMSTELLUNG"] } },
      erfassung: { "a|2026-10-25": { start: "02:30", ende: "02:20", bestaetigt: false, grund: "ZEITUMSTELLUNG: 0,8 Stunden gemessen" } } });
    const k = (start, ende) => korrekturAnhaengen(m, { personId: "a", datum: "2026-10-25", start, ende, pause: 0, grund: "Herbstnacht geprüft, Zeiten eindeutig" },
      { personId: "l", rolle: "leitung" }, new Date("2026-10-26T08:00:00Z"), "k-1");
    expect(k("02:30", "02:20").status).toBe(422);
    const gut = k("02:30", "03:20");
    expect("status" in gut).toBe(false);
    expect(istZeitFuer(gut.mandant, gut.mandant.personen[0], "2026-10-25", DA[0]).std).toBeCloseTo(50 / 60, 2);
  });
  it("Herbst 25.10.: Direktkorrektur 02:30–02:30 (Pause 30) ⇒ 422 (Beginn = Ende), keine 23,5-h-Ist", async () => {
    const r = await anfrage("stempel-korrektur", { token: await token("l1"),
      rumpf: { personId: "a2", datum: "2026-10-25", start: "02:30", ende: "02:30", pause: 30, grund: "Ende laut Übergabe nachgetragen" } });
    expect(r.status).toBe(422);
    expect((await mandant()).erfassung["a2|2026-10-25"]).toMatchObject({ start: "01:00", ende: "04:00" });
  });
});

/* ======================================================================== */
describe("M3: korrigierter Tag ohne Plan (DAUER_NULL) zählt", () => {
  const stempelNull = { start: "06:00", startAm: "2026-11-02T05:00:00.000Z", ende: "06:00", endeAm: "2026-11-02T05:00:30.000Z",
    markierungen: ["UNGEPLANTER_DIENST", "DAUER_NULL"] };
  const erfNull = { start: "06:00", ende: "06:00", bestaetigt: false,
    grund: "DAUER_NULL: Beginn und Ende in derselben Minute — Zeiten bitte über die Korrektur eintragen" };
  it("nach der Korrektur trägt die Ist-Zeit die Marke ungeplant — 06:00–14:00 mit 30 min Pause zählen 7,5 h", () => {
    const m = klein({ einstempeln: { "a|2026-11-02": stempelNull }, erfassung: { "a|2026-11-02": erfNull } });
    const r = korrekturAnhaengen(m, { personId: "a", datum: "2026-11-02", start: "06:00", ende: "14:00", pause: 30, grund: "Zeiten laut Dienstbuch eingetragen" },
      { personId: "l", rolle: "leitung" }, new Date("2026-11-03T08:00:00Z"), "k-1");
    expect("status" in r ? r : null).toBeNull();
    expect(r.erfassung).toMatchObject({ bestaetigt: true, korrigiert: true, ungeplant: true });
    const p = r.mandant.personen[0];
    const d = ungeplanterDienst(r.mandant, p, "2026-11-02");
    expect(d).not.toBeNull();
    expect(istZeitFuer(r.mandant, p, "2026-11-02", d).std).toBeCloseTo(7.5, 2);
  });
  it("auch ohne vorherige Marke an einer bestätigten Ist-Zeit (Altbestand einer früheren Korrektur) setzt die erneute Prüfung sie", () => {
    const m = klein({ einstempeln: { "a|2026-11-02": stempelNull },
      erfassung: { "a|2026-11-02": { start: "06:00", ende: "14:00", bestaetigt: true, korrigiert: true, pause: 30, grund: "Korrektur der Stempelzeit" } } });
    const r = korrekturAnhaengen(m, { personId: "a", datum: "2026-11-02", start: "06:00", ende: "14:00", pause: 30, grund: "Altbestand geprüft und bestätigt" },
      { personId: "l", rolle: "leitung" }, new Date("2026-11-03T08:00:00Z"), "k-2");
    expect("status" in r ? r : null).toBeNull();
    expect(r.erfassung.ungeplant).toBe(true);
  });
  it("pruefHinweis: ein DAUER_NULL-Tag ohne Plan ist „ungeplant“ (keine Planzeit), nicht „Planzeit vorläufig“", () => {
    const m = klein({ einstempeln: { "a|2026-11-02": stempelNull }, erfassung: { "a|2026-11-02": erfNull } });
    const h = pruefHinweis(m, "2026-11");
    expect(h && h.faelle.map((f) => f.art)).toEqual(["ungeplant"]);
    expect(h.lang).toBe(0);
  });
});

/* ======================================================================== */
describe("M4: Beginn = Ende wird serverseitig abgewiesen", { timeout: 120000 }, () => {
  it("Direktkorrektur 06:00–06:00 ⇒ 422, Ist unverändert", async () => {
    const vor = (await mandant()).erfassung[`a4|${tag(-1)}`];
    const r = await anfrage("stempel-korrektur", { token: await token("l1"),
      rumpf: { personId: "a4", datum: tag(-1), start: "06:00", ende: "06:00", grund: "Ganzer Tag laut Dienstbuch" } });
    expect(r.status, r.roh).toBe(422);
    expect((await mandant()).erfassung[`a4|${tag(-1)}`]).toEqual(vor);
  });
  it("Ausnahme nur mit geplantem 24-Stunden-Dienst (Dienstart Beginn = Ende): Korrektur und Antrag 07:00–07:00 gehen", () => {
    const m = klein({ dienstarten: [...DA, { id: "D24", name: "24 Stunden", start: "07:00", ende: "07:00", pause: 30 }],
      abweichungen: { "a|2026-11-01": "D24", "a|2026-10-31": "F" },
      einstempeln: { "a|2026-11-01": { start: "07:00" }, "a|2026-10-31": { start: "07:00" } } });
    const k = (datum) => korrekturAnhaengen(m, { personId: "a", datum, start: "07:00", ende: "07:00", grund: "24-Stunden-Dienst wie geplant" },
      { personId: "l", rolle: "leitung" }, new Date("2026-11-03T08:00:00Z"), "k-1");
    expect("status" in k("2026-11-01")).toBe(false);
    expect(k("2026-10-31").status).toBe(422);                                  // Frühdienst geplant: keine Ausnahme
    const a = (datum) => antragStellen(m, { personId: "a" }, antrag(datum, "07:00", "07:00", "24-Stunden-Dienst wie geplant"),
      new Date("2026-11-03T08:00:00Z"), "ka-1", "2026-11-03");
    expect("status" in a("2026-11-01")).toBe(false);
    expect(a("2026-10-31").status).toBe(422);
  });
  it("Antrag 06:00–06:00 mit und ohne Pause ⇒ 422, kein Antrag am Stempel", async () => {
    const t = await token("a4");
    expect((await anfrage("korrektur-antrag", { token: t, rumpf: antrag(tag(-1), "06:00", "06:00", "Ganzer Tag gearbeitet") })).status).toBe(422);
    expect((await anfrage("korrektur-antrag", { token: t, rumpf: antrag(tag(-1), "06:00", "06:00", "Ganzer Tag gearbeitet", { pause: 0 }) })).status).toBe(422);
    expect((await mandant()).einstempeln[`a4|${tag(-1)}`].antraege).toBeUndefined();
  });
});

/* ======================================================================== */
describe("M5: Genehmigung eines überholten Antrags (Lost Update) und doppelte Entscheidung", { timeout: 120000 }, () => {
  it("MA beantragt 07–15, Leitung korrigiert direkt auf 06–12, Genehmigung ⇒ 409 „überholt“; die Korrektur bleibt; Ablehnen geht", async () => {
    const a = await anfrage("korrektur-antrag", { token: await token("a1"), rumpf: antrag(tag(-2), "07:00", "15:00", "Später angefangen und später gegangen") });
    expect(a.status, a.roh).toBe(200);
    const k = await anfrage("stempel-korrektur", { token: await token("l1"),
      rumpf: { personId: "a1", datum: tag(-2), start: "06:00", ende: "12:00", pause: 30, grund: "Laut Dienstbuch um 12 Uhr gegangen" } });
    expect(k.status, k.roh).toBe(200);
    const g = await anfrage("korrektur-entscheiden", { token: await token("l1"),
      rumpf: { personId: "a1", datum: tag(-2), antragId: a.antrag.id, entscheidung: "genehmigt" } });
    expect(g.status, g.roh).toBe(409);
    expect(g.fehler).toMatch(/überholt/);
    const m = await mandant();
    expect(m.erfassung[`a1|${tag(-2)}`]).toMatchObject({ start: "06:00", ende: "12:00", pause: 30 });
    expect(m.einstempeln[`a1|${tag(-2)}`].antraege[0].status).toBe("offen");
    const ab = await anfrage("korrektur-entscheiden", { token: await token("l1"),
      rumpf: { personId: "a1", datum: tag(-2), antragId: a.antrag.id, entscheidung: "abgelehnt", begruendung: "Die Zeit ist inzwischen korrigiert." } });
    expect(ab.status, ab.roh).toBe(200);
  });
  it("genehmigt, dann abgelehnt ⇒ 409; Ist und Status bleiben die der Genehmigung", async () => {
    const a = await anfrage("korrektur-antrag", { token: await token("a1"), rumpf: antrag(tag(-1), "05:50", "14:10", "Übergabe dauerte länger als geplant") });
    expect(a.status, a.roh).toBe(200);
    const ent = async (entscheidung, extra = {}) => anfrage("korrektur-entscheiden", { token: await token("p1"),
      rumpf: { personId: "a1", datum: tag(-1), antragId: a.antrag.id, entscheidung, ...extra } });
    expect((await ent("genehmigt")).status).toBe(200);
    const nach = (await mandant()).erfassung[`a1|${tag(-1)}`];
    expect(nach).toMatchObject({ start: "05:50", ende: "14:10" });
    expect((await ent("abgelehnt", { begruendung: "Doch nicht, laut Dienstbuch anders." })).status).toBe(409);
    expect((await ent("genehmigt")).status).toBe(409);
    const m = await mandant();
    expect(m.erfassung[`a1|${tag(-1)}`]).toEqual(nach);
    expect(m.einstempeln[`a1|${tag(-1)}`].antraege[0].status).toBe("genehmigt");
    expect(m.einstempeln[`a1|${tag(-1)}`].korrekturen).toHaveLength(1);
  });
});

/* ======================================================================== */
describe("N1: Antrag ohne Pause — die übernommene Pause wird schon beim Antrag geprüft", { timeout: 120000 }, () => {
  it("zuletzt erfasste Pause 60 min, Antrag 08:00–08:45 ohne Pause ⇒ 422 (statt 200 und hängender Genehmigung)", async () => {
    const r = await anfrage("korrektur-antrag", { token: await token("a3"), rumpf: antrag(tag(-1), "08:00", "08:45", "Nur kurz da gewesen, Rest frei") });
    expect(r.status, r.roh).toBe(422);
    expect(r.fehler).toMatch(/Pause/);
    expect((await mandant()).einstempeln[`a3|${tag(-1)}`].antraege).toBeUndefined();
    /* mit genannter kürzerer Pause geht es */
    const ok = await anfrage("korrektur-antrag", { token: await token("a3"), rumpf: antrag(tag(-1), "08:00", "08:45", "Nur kurz da gewesen, Rest frei", { pause: 0 }) });
    expect(ok.status, ok.roh).toBe(200);
  });
  it("ohne Ist-Zeit gilt die Pause der geplanten Dienstart (Nacht 60 min) — 22:00–22:45 ohne Pause ⇒ 422", () => {
    const m = klein({ einstempeln: { "a|2026-11-02": { ende: "06:00", markierungen: ["START_FEHLT"] } }, abweichungen: { "a|2026-11-02": "N" } });
    const r = antragStellen(m, { personId: "a" }, antrag("2026-11-02", "22:00", "22:45", "Nur kurz eingesprungen"), new Date("2026-11-03T12:00:00Z"), "ka-1", "2026-11-03");
    expect(r.status).toBe(422);
  });
});

/* ======================================================================== */
describe("N3: Antrag mit Ende in der Zukunft", () => {
  const m = () => klein({ einstempeln: { "a|2026-11-03": { start: "06:00" }, "a|2026-11-02": { start: "22:00" } },
    abweichungen: { "a|2026-11-03": "F", "a|2026-11-02": "N" } });
  const jetzt = new Date("2026-11-03T07:00:00Z");                             // 08:00 Berliner Zeit
  it("heute 06:00–23:59 um 8 Uhr ⇒ 422; 06:00–07:30 geht", () => {
    expect(antragStellen(m(), { personId: "a" }, antrag("2026-11-03", "06:00", "23:59", "Ganzer Tag geplant"), jetzt, "ka-1", "2026-11-03").status).toBe(422);
    expect("status" in antragStellen(m(), { personId: "a" }, antrag("2026-11-03", "06:00", "07:30", "Früher gegangen, Arzttermin"), jetzt, "ka-2", "2026-11-03")).toBe(false);
  });
  it("gestern 22:00 bis heute 09:00 um 8 Uhr ⇒ 422; bis 07:00 geht", () => {
    expect(antragStellen(m(), { personId: "a" }, antrag("2026-11-02", "22:00", "09:00", "Nachtdienst verlängert"), jetzt, "ka-3", "2026-11-03").status).toBe(422);
    expect("status" in antragStellen(m(), { personId: "a" }, antrag("2026-11-02", "22:00", "07:00", "Nachtdienst verlängert"), jetzt, "ka-4", "2026-11-03")).toBe(false);
  });
});

/* ======================================================================== */
describe("N2: Selbstfreigabe gekennzeichnet (Vier-Augen bleibt offene Entscheidung)", { timeout: 120000 }, () => {
  it("Leitung korrigiert die eigene Zeit direkt ⇒ Ereignis selbstfreigabe: true; Planung korrigiert fremde ⇒ ohne Kennzeichen", async () => {
    const r = await anfrage("stempel-korrektur", { token: await token("l1"),
      rumpf: { personId: "l1", datum: tag(-1), start: "06:00", ende: "14:30", pause: 30, grund: "Eigene Zeit laut Dienstbuch" } });
    expect(r.status, r.roh).toBe(200);
    expect(r.ereignis.selbstfreigabe).toBe(true);
    const f = await anfrage("stempel-korrektur", { token: await token("p1"),
      rumpf: { personId: "a2", datum: tag(-1), start: "06:00", ende: "14:30", pause: 30, grund: "Zeit laut Dienstbuch korrigiert" } });
    expect(f.status, f.roh).toBe(200);
    expect(f.ereignis).not.toHaveProperty("selbstfreigabe");
  });
  it("Leitung stellt Antrag für sich und genehmigt ihn selbst ⇒ 200 (Recht unverändert), Ereignis selbstfreigabe: true, Spur nennt es", async () => {
    const a = await anfrage("korrektur-antrag", { token: await token("l1"), rumpf: antrag(tag(-2), "06:00", "15:00", "Länger geblieben wegen Übergabe") });
    expect(a.status, a.roh).toBe(200);
    const g = await anfrage("korrektur-entscheiden", { token: await token("l1"),
      rumpf: { personId: "l1", datum: tag(-2), antragId: a.antrag.id, entscheidung: "genehmigt" } });
    expect(g.status, g.roh).toBe(200);
    expect(g.ereignis.selbstfreigabe).toBe(true);
    const m = await mandant();
    expect(m.einstempeln[`l1|${tag(-2)}`].korrekturen.at(-1).selbstfreigabe).toBe(true);
    const spur = await schutz.spurLesen(1);
    expect(spur.some((z) => z.zusatz === `Korrekturantrag ${a.antrag.id}: genehmigt · Korrektur ${g.ereignis.id} · Selbstfreigabe`
      || (z.zusatz || "").startsWith(`Korrekturantrag ${a.antrag.id}: genehmigt · Korrektur ${g.ereignis.id} · Selbstfreigabe`))).toBe(true);
  });
});
