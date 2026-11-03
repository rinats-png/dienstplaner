/* ==========================================================================
   MONATSABSCHLUSS (WP-16): Abschluss sperrt Ist, Wiederöffnen protokolliert

   Gegen die Serverfunktion mit vorgegebener Serverzeit (nur Date gefälscht;
   Sperren und Bremsen laufen echt). Heute ist der 05.11.2026, Oktober ist im
   Testbestand abgeschlossen.

   - Jeder Schreibweg auf Ist-Daten eines abgeschlossenen Monats wird
     abgewiesen und ändert nichts: Stempeln (auch offline aus dem Puffer),
     Selbstauskunft, Korrektur, Antrag, Entscheidung, PUT (ändern, anlegen,
     löschen), Wiederherstellen.
   - Abschließen: Leitung, Planung, Kundenrolle; Wiederöffnen nur Leitung und
     Kundenrolle — mit Grund, Wann und Wer im Verlauf und im Protokoll.
   - Nach dem Wiederöffnen sind Korrekturen wieder Ereignisse am Stempel und
     tragen die Kennung der Wiederöffnung.
   - Datenschutz: Beschäftigte, Betriebsrat, Schichtverantwortung sehen nur,
     ob ein Monat abgeschlossen ist.
   - Rennen: Abschluss und Stempel gleichzeitig — nie ein Stempel im Monat
     nach dem Abschluss.
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import * as PUF from "../src/stempelpuffer.js";

const WIRT = "127.0.0.1:3000";
const RAUM = "wp16";
let wurzel, laden, daten, B, sitzungAnlegen;

let nr = 0;
const anfrage = async (pfad, { methode = "POST", rumpf, token } = {}) => {
  nr += 1;
  const kopf = { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.16.${Math.floor(nr / 250) % 250}.${nr % 250}` };
  if (methode !== "GET") kopf["content-type"] = "application/json";
  if (token) kopf.authorization = `Bearer ${token}`;
  const a = await daten(new Request(`http://${WIRT}/api/${pfad}`, { method: methode, headers: kopf,
    ...(methode === "GET" ? {} : { body: JSON.stringify(rumpf || {}) }) }), {});
  const text = await a.text();
  let d = {}; try { d = JSON.parse(text); } catch { /* leer */ }
  return { status: a.status, roh: text, ...d };
};
const ROLLEN = { l1: "leitung", p1: "planer", s1: "subplaner", a1: "mitarbeiter", a2: "mitarbeiter", r1: "betriebsrat", ku1: "kunde" };
const person = (id, extra = {}) => ({ id, vorname: "V", nachname: id.toUpperCase(), rolle: ROLLEN[id], bereich: "e1", status: "aktiv",
  geburtstag: "1985-01-01", wochenstunden: 39, zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }], ...extra });
const token = async (id, raum = RAUM) => (await sitzungAnlegen({ bestand: raum, name: `V ${id.toUpperCase()}`, rolle: ROLLEN[id], person: id,
  betrieb: 0, mandantId: "m1", einheit: null }, 24 * 3600 * 1000)).token;
const betreiber = async (raum = RAUM) => (await sitzungAnlegen({ bestand: raum, name: "Betreiber", rolle: "betreiber", person: null,
  betrieb: 0, mandantId: null, einheit: null }, 3600 * 1000)).token;
const mandant = async (raum = RAUM) => (await B.bestandLesen(laden(), raum)).bestand.mandanten[0];
const zeitAuf = (iso) => vi.setSystemTime(new Date(iso));
const JETZT = "2026-11-05T09:00:00Z";                                       // 10:00 Berlin
const ID = (n) => `${String(n).padStart(8, "0")}-0000-4000-8000-${String(n).padStart(12, "0")}`;
const stempel = (tag, start, ende, extra = {}) => ({ start, startAm: `${tag}T05:00:00.000Z`, ortStart: "Ohne Standortfreigabe erfasst",
  innerhalbStart: null, geprueftStart: false, ...(ende ? { ende, endeAm: `${tag}T13:00:00.000Z`, ortEnde: "Ohne Standortfreigabe erfasst",
    innerhalbEnde: null, geprueftEnde: false } : {}), ...extra });
const offenerAntrag = (id, von) => ({ id, von: { personId: von, name: `V ${von}`, rolle: "mitarbeiter" }, gestellt: "2026-10-29T18:00:00.000Z",
  vorschlag: { start: "05:55", ende: "14:30" }, grund: "Übergabe dauerte länger", original: { start: "06:00", ende: "14:00" },
  ist: { start: "06:00", ende: "14:00", bestaetigt: true }, status: "offen", entschieden: null });
const ABSCHLUSS_OKT = { abgeschlossen: true, am: "2026-11-02T08:00:00.000Z", wer: { personId: "l1", name: "V L1", rolle: "leitung" },
  abdruck: "0123456789abcdef0123456789abcdef",
  verlauf: [{ id: "ma-1", art: "abschluss", am: "2026-11-02T08:00:00.000Z", wer: { personId: "l1", name: "V L1", rolle: "leitung" },
    grund: "Lohnlauf Oktober", abdruck: "0123456789abcdef0123456789abcdef" }] };

function betrieb(extra = {}) {
  const abweichungen = {}, einstempeln = {}, erfassung = {};
  const tag = (pid, t, s, e, x = {}) => { abweichungen[`${pid}|${t}`] = "F"; einstempeln[`${pid}|${t}`] = stempel(t, s, e, x);
    if (s && e) erfassung[`${pid}|${t}`] = { start: s, ende: e, bestaetigt: true, grund: "" }; };
  /* Oktober (abgeschlossen) */
  tag("a1", "2026-10-28", "06:00", "14:00");
  tag("a2", "2026-10-27", "06:00", "14:00", { antraege: [offenerAntrag("ka-okt", "a2")] });  // Altbestand: offener Antrag im abgeschlossenen Monat
  erfassung["a1|2026-10-27"] = { start: "06:00", ende: "14:30", bestaetigt: true, grund: "länger geblieben" };  // Selbstauskunft, kein Stempel
  abweichungen["a1|2026-10-27"] = "F";
  abweichungen["a1|2026-10-30"] = "F";                                      // geplant, noch nichts erfasst
  einstempeln["a2|2026-10-31"] = stempel("2026-10-31", "22:00", null, { startAm: "2026-10-31T21:00:00.000Z" });   // Nachtdienst offen
  abweichungen["a2|2026-10-31"] = "N";
  /* September (offen, sauber) */
  tag("a1", "2026-09-10", "06:00", "14:00");
  /* August: ein unvollständiger Stempel (Prüffall) */
  einstempeln["a2|2026-08-12"] = stempel("2026-08-12", "06:00", null);
  abweichungen["a2|2026-08-12"] = "F";
  /* Juli: ein offener Korrekturantrag */
  tag("a1", "2026-07-15", "06:00", "14:00", { antraege: [offenerAntrag("ka-jul", "a1")] });
  /* November (laufend) */
  tag("a1", "2026-11-03", "06:00", "14:00");
  return { id: "m1", name: "Haus", einheiten: [{ id: "e1", name: "WB 1" }], einstellungen: { ruhezeit: 11 },
    dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00", pause: 30 }, { id: "N", name: "Nacht", start: "22:00", ende: "06:00", pause: 30 }],
    personen: Object.keys(ROLLEN).map((id) => person(id)), abweichungen, abwesenheiten: [], erfassung, einstempeln, anfragen: [], nachrichten: [],
    monatsabschluss: { "2026-10": ABSCHLUSS_OKT }, ...extra };
}
const raumAnlegen = async (raum, extra = {}) => B.bestandSchreiben(laden(), raum, { version: 9, mandanten: [betrieb(extra)] }, { durch: "Pruefung" });

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-wp16-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
  const { getStore } = await import("../server/lib/ablage.mjs");
  laden = () => getStore({ name: "centric", consistency: "strong" });
  const schutz = await import("../server/lib/schutz.mjs");
  for (const art of Object.keys(schutz.GRENZEN)) schutz.GRENZEN[art] = { ...schutz.GRENZEN[art], versuche: 100000 };
  daten = (await import("../server/funktionen/daten.mjs")).default;
  B = await import("../server/lib/bestand.mjs");
  ({ sitzungAnlegen } = await import("../server/lib/sitzungen.mjs"));
  vi.useFakeTimers({ toFake: ["Date"] });
  zeitAuf(JETZT);
  await raumAnlegen(RAUM);
}, 60000);
afterAll(async () => {
  vi.useRealTimers();
  if (wurzel) await rm(wurzel, { recursive: true, force: true });
});

const ist = (m) => JSON.stringify({ e: Object.fromEntries(Object.entries(m.einstempeln).filter(([k]) => k.includes("|2026-10-"))),
  f: Object.fromEntries(Object.entries(m.erfassung).filter(([k]) => k.includes("|2026-10-"))) });

describe("Abgeschlossener Monat: jeder Schreibweg auf Ist-Daten wird abgewiesen", { timeout: 120000 }, () => {
  it("Stempeln: ein offline erfasster Beginn vom 31.10. → 409 MONAT_ABGESCHLOSSEN, kein Stempel, für die Leitung am Abschluss vermerkt (einmal)", async () => {
    const vorher = ist(await mandant());
    const ev = { art: "start", clientEventId: ID(1), offline: true, erfasstAm: "2026-10-31T04:58:00.000Z", gesendetAm: JETZT };
    const r = await anfrage("stempeln", { token: await token("a1"), rumpf: ev });
    expect(r.status, r.roh).toBe(409);
    expect(r.code).toBe("MONAT_ABGESCHLOSSEN");
    expect(r.fehler).toMatch(/Oktober 2026 ist abgeschlossen/);
    expect(r.text).toMatch(/nicht gespeichert/);
    const m = await mandant();
    expect(ist(m)).toBe(vorher);
    expect(m.einstempeln["a1|2026-10-31"]).toBeUndefined();
    expect(m.monatsabschluss["2026-10"].abgewiesen).toEqual([expect.objectContaining({ personId: "a1", datum: "2026-10-31", art: "start",
      offline: true, ereignis: ID(1) })]);
    /* Das Gerät sendet erneut (Puffer, „Erneut senden"): wieder 409, kein zweiter Vermerk. */
    expect((await anfrage("stempeln", { token: await token("a1"), rumpf: ev })).status).toBe(409);
    expect((await mandant()).monatsabschluss["2026-10"].abgewiesen).toHaveLength(1);
  });
  it("Stempeln: das Ende eines Nachtdiensts vom 31.10. (offline um 06:00 am 01.11. erfasst) → 409, der offene Beginn bleibt unverändert", async () => {
    const vorher = (await mandant()).einstempeln["a2|2026-10-31"];
    const r = await anfrage("stempeln", { token: await token("a2"), rumpf: { art: "ende", clientEventId: ID(2), offline: true,
      erfasstAm: "2026-11-01T05:00:00.000Z", gesendetAm: JETZT } });
    expect(r.status, r.roh).toBe(409);
    expect(r.code).toBe("MONAT_ABGESCHLOSSEN");
    const m = await mandant();
    expect(m.einstempeln["a2|2026-10-31"]).toEqual(vorher);
    expect(m.erfassung["a2|2026-10-31"]).toBeUndefined();
  });
  it("Selbstauskunft (zeit-bestaetigen) für den 30.10. → 409, nichts erfasst", async () => {
    const r = await anfrage("zeit-bestaetigen", { token: await token("a1"), rumpf: { datum: "2026-10-30", start: null, ende: null } });
    expect(r.status, r.roh).toBe(409);
    expect(r.code).toBe("MONAT_ABGESCHLOSSEN");
    expect((await mandant()).erfassung["a1|2026-10-30"]).toBeUndefined();
  });
  it("Stempelkorrektur der Leitung → 409, Ist-Zeit und Stempel unverändert", async () => {
    const vorher = ist(await mandant());
    const r = await anfrage("stempel-korrektur", { token: await token("l1"), rumpf: { personId: "a1", datum: "2026-10-28",
      start: "06:00", ende: "15:00", grund: "Nachtrag nach dem Lohnlauf" } });
    expect(r.status, r.roh).toBe(409);
    expect(r.code).toBe("MONAT_ABGESCHLOSSEN");
    expect(ist(await mandant())).toBe(vorher);
  });
  it("Korrekturantrag der Beschäftigten → 409, kein Antrag am Stempel", async () => {
    const r = await anfrage("korrektur-antrag", { token: await token("a1"), rumpf: { datum: "2026-10-28", start: "05:50", ende: "14:00",
      grund: "Ich war früher da als gestempelt" } });
    expect(r.status, r.roh).toBe(409);
    expect(r.code).toBe("MONAT_ABGESCHLOSSEN");
    expect((await mandant()).einstempeln["a1|2026-10-28"].antraege).toBeUndefined();
  });
  it("Antrag entscheiden (genehmigen, ablehnen, zurückziehen) → 409, der Antrag bleibt offen", async () => {
    const vorher = ist(await mandant());
    const e = (wer, entscheidung) => anfrage("korrektur-entscheiden", { token: wer, rumpf: { personId: "a2", datum: "2026-10-27",
      antragId: "ka-okt", entscheidung, begruendung: "Steht so im Dienstbuch" } });
    for (const [wer, ent] of [[await token("l1"), "genehmigt"], [await token("p1"), "abgelehnt"], [await token("a2"), "zurueckgezogen"]]) {
      const r = await e(wer, ent);
      expect(r.status, `${ent} ${r.roh}`).toBe(409);
      expect(r.code).toBe("MONAT_ABGESCHLOSSEN");
    }
    expect(ist(await mandant())).toBe(vorher);
  });
  it("PUT /api/bestand (Leitung, Planung, Kundenrolle): Ist-Zeit ändern, anlegen, löschen → 403 MONAT_ABGESCHLOSSEN; unverändert zurück → 200", async () => {
    for (const id of ["l1", "p1", "ku1"]) {
      const t = await token(id);
      const g = await anfrage("bestand", { methode: "GET", token: t });
      expect(g.status).toBe(200);
      const versuche = [
        (m) => { m.erfassung["a1|2026-10-27"] = { ...m.erfassung["a1|2026-10-27"], ende: "16:00" }; },
        (m) => { m.erfassung["a1|2026-10-30"] = { start: "06:00", ende: "14:00", bestaetigt: true, grund: "nachgetragen" }; },
        (m) => { delete m.erfassung["a1|2026-10-27"]; },
      ];
      for (const [i, aendern] of versuche.entries()) {
        const b = JSON.parse(JSON.stringify(g.bestand));
        aendern(b.mandanten[0]);
        const r = await anfrage("bestand", { methode: "PUT", token: t, rumpf: { bestand: b, etag: g.etag } });
        expect(r.status, `${id} Versuch ${i}: ${r.roh}`).toBe(403);
        expect(r.code).toBe("MONAT_ABGESCHLOSSEN");
      }
      const unveraendert = await anfrage("bestand", { methode: "PUT", token: t, rumpf: { bestand: g.bestand, etag: g.etag } });
      expect(unveraendert.status, unveraendert.roh).toBe(200);
    }
    const m = await mandant();
    expect(m.erfassung["a1|2026-10-27"]).toEqual({ start: "06:00", ende: "14:30", bestaetigt: true, grund: "länger geblieben" });
    expect(m.erfassung["a1|2026-10-30"]).toBeUndefined();
  });
  it("PUT /api/bestand: dieselbe Änderung in einem offenen Monat geht durch (keine Funktionskürzung)", async () => {
    const t = await token("l1");
    const g = await anfrage("bestand", { methode: "GET", token: t });
    const b = JSON.parse(JSON.stringify(g.bestand));
    b.mandanten[0].erfassung["a1|2026-09-11"] = { start: "06:00", ende: "14:00", bestaetigt: true, grund: "nachgetragen" };
    const r = await anfrage("bestand", { methode: "PUT", token: t, rumpf: { bestand: b, etag: g.etag } });
    expect(r.status, r.roh).toBe(200);
    expect((await mandant()).erfassung["a1|2026-09-11"]).toMatchObject({ start: "06:00", bestaetigt: true });
  });
  it("PUT /api/bestand: den Abschluss selbst über das Speichern ändern ist wirkungslos (Leitung) — die Schichtverantwortung schickt die verkürzte Form unverändert zurück: 200", async () => {
    const t = await token("l1");
    const g = await anfrage("bestand", { methode: "GET", token: t });
    const b = JSON.parse(JSON.stringify(g.bestand));
    b.mandanten[0].monatsabschluss["2026-10"] = { abgeschlossen: false };
    b.mandanten[0].monatsabschluss["2026-09"] = { abgeschlossen: true };
    const r = await anfrage("bestand", { methode: "PUT", token: t, rumpf: { bestand: b, etag: g.etag } });
    expect([200, 403]).toContain(r.status);
    const m = await mandant();
    expect(m.monatsabschluss["2026-10"].abgeschlossen).toBe(true);
    expect(m.monatsabschluss["2026-09"]).toBeUndefined();
    const ts = await token("s1");
    const gs = await anfrage("bestand", { methode: "GET", token: ts });
    expect(gs.bestand.mandanten[0].monatsabschluss).toEqual({ "2026-10": { abgeschlossen: true } });
    const rs = await anfrage("bestand", { methode: "PUT", token: ts, rumpf: { bestand: gs.bestand, etag: gs.etag } });
    expect(rs.status, rs.roh).toBe(200);
    expect((await mandant()).monatsabschluss["2026-10"]).toMatchObject({ abgeschlossen: true, verlauf: [expect.objectContaining({ id: "ma-1" })] });
  });
});

describe("Veraltete Kopie nach dem Abschluss: der Abschluss bleibt", { timeout: 120000 }, () => {
  it("Leitung lädt, Planung schließt ab, Leitung speichert mit der alten Kopie (Abschluss darin noch offen): nie überschrieben", async () => {
    const raum = "wp16-veraltet";
    await raumAnlegen(raum, { monatsabschluss: {} });
    const tl = await token("l1", raum);
    const g = await anfrage("bestand", { methode: "GET", token: tl });
    const zu = await anfrage("monatsabschluss", { token: await token("p1", raum), rumpf: { aktion: "abschliessen", monat: "2026-09" } });
    expect(zu.status, zu.roh).toBe(200);
    const b = JSON.parse(JSON.stringify(g.bestand));
    b.mandanten[0].erfassung["a1|2026-11-04"] = { start: "06:00", ende: "14:00", bestaetigt: true, grund: "nachgetragen" };
    const r = await anfrage("bestand", { methode: "PUT", token: tl, rumpf: { bestand: b, etag: g.etag } });
    expect([200, 409]).toContain(r.status);                                 // 409: bekannter Kern-Konflikt, die Oberfläche lädt neu
    expect((await mandant(raum)).monatsabschluss["2026-09"].abgeschlossen).toBe(true);
    /* Mit dem aktuellen Stand und einem „offenen“ September darin: wirkungslos. */
    const g2 = await anfrage("bestand", { methode: "GET", token: tl });
    const b2 = JSON.parse(JSON.stringify(g2.bestand));
    delete b2.mandanten[0].monatsabschluss["2026-09"];
    const r2 = await anfrage("bestand", { methode: "PUT", token: tl, rumpf: { bestand: b2, etag: g2.etag } });
    expect(r2.status, r2.roh).toBe(200);
    expect((await mandant(raum)).monatsabschluss["2026-09"].abgeschlossen).toBe(true);
  });
});

describe("Abschließen und Wiederöffnen: Rechte, Grund, Verlauf, Protokoll", { timeout: 120000 }, () => {
  const abschluss = async (id, rumpf) => anfrage("monatsabschluss", { token: id === "bt" ? await betreiber() : await token(id), rumpf });

  it("Abschließen: Beschäftigte, Schichtverantwortung, Betriebsrat, Betreiber 403; Planung 200 mit Wann, Wer und Prüfsumme", async () => {
    for (const id of ["a1", "s1", "r1", "bt"]) {
      const r = await abschluss(id, { aktion: "abschliessen", monat: "2026-09" });
      expect(r.status, `${id}: ${r.roh}`).toBe(403);
    }
    expect((await mandant()).monatsabschluss["2026-09"]).toBeUndefined();
    const r = await abschluss("p1", { aktion: "abschliessen", monat: "2026-09", grund: "Lohnlauf September" });
    expect(r.status, r.roh).toBe(200);
    const e = (await mandant()).monatsabschluss["2026-09"];
    expect(e).toMatchObject({ abgeschlossen: true, am: "2026-11-05T09:00:00.000Z", wer: { personId: "p1", rolle: "planer" } });
    expect(e.abdruck).toMatch(/^[0-9a-f]{32}$/);
    expect(e.verlauf).toEqual([expect.objectContaining({ art: "abschluss", grund: "Lohnlauf September", wer: expect.objectContaining({ personId: "p1" }),
      am: "2026-11-05T09:00:00.000Z", abdruck: e.abdruck })]);
  });
  it("Abschließen: schon abgeschlossen 409; laufender oder künftiger Monat 422; ungültiger Monat 422", async () => {
    expect((await abschluss("l1", { aktion: "abschliessen", monat: "2026-09" })).status).toBe(409);
    expect((await abschluss("l1", { aktion: "abschliessen", monat: "2026-11" })).status).toBe(422);
    expect((await abschluss("l1", { aktion: "abschliessen", monat: "2026-12" })).status).toBe(422);
    expect((await abschluss("l1", { aktion: "abschliessen", monat: "2026-13" })).status).toBe(422);
    expect((await abschluss("l1", { aktion: "irgendwas", monat: "2026-08" })).status).toBe(400);
  });
  it("Abschließen: offene Prüffälle → 409 mit Zahlen; ausdrücklich trotzdem → 200 und im Verlauf vermerkt", async () => {
    const r = await abschluss("l1", { aktion: "abschliessen", monat: "2026-08" });
    expect(r.status, r.roh).toBe(409);
    expect(r.code).toBe("ABSCHLUSS_PRUEFFAELLE");
    expect(r.offen).toMatchObject({ offeneStempel: 1, antraege: 0 });
    const t = await abschluss("l1", { aktion: "abschliessen", monat: "2026-08", trotzPrueffaellen: true });
    expect(t.status, t.roh).toBe(200);
    expect((await mandant()).monatsabschluss["2026-08"].verlauf[0].offen).toMatchObject({ offeneStempel: 1 });
  });
  it("Abschließen: ein offener Korrekturantrag sperrt den Abschluss — auch mit „trotzdem“", async () => {
    const r = await abschluss("l1", { aktion: "abschliessen", monat: "2026-07", trotzPrueffaellen: true });
    expect(r.status, r.roh).toBe(409);
    expect(r.code).toBe("ABSCHLUSS_ANTRAEGE_OFFEN");
    expect((await mandant()).monatsabschluss["2026-07"]).toBeUndefined();
  });
  it("Wiederöffnen: Planung, Beschäftigte, Schichtverantwortung, Betriebsrat, Betreiber 403; Leitung ohne oder mit zu kurzem Grund 422", async () => {
    for (const id of ["p1", "a1", "s1", "r1", "bt"]) {
      const r = await abschluss(id, { aktion: "wiederoeffnen", monat: "2026-09", grund: "Nachtrag eines vergessenen Dienstes" });
      expect(r.status, `${id}: ${r.roh}`).toBe(403);
    }
    expect((await abschluss("l1", { aktion: "wiederoeffnen", monat: "2026-09" })).status).toBe(422);
    expect((await abschluss("l1", { aktion: "wiederoeffnen", monat: "2026-09", grund: "kurz" })).status).toBe(422);
    expect((await mandant()).monatsabschluss["2026-09"].abgeschlossen).toBe(true);
  });
  it("Wiederöffnen durch die Leitung: Grund, Wann, Wer im Verlauf; danach Korrektur möglich — als Ereignis mit der Kennung der Wiederöffnung; erneuter Abschluss", async () => {
    const r = await abschluss("l1", { aktion: "wiederoeffnen", monat: "2026-09", grund: "Nachtrag eines vergessenen Dienstes" });
    expect(r.status, r.roh).toBe(200);
    let e = (await mandant()).monatsabschluss["2026-09"];
    expect(e.abgeschlossen).toBe(false);
    const w = e.verlauf[e.verlauf.length - 1];
    expect(w).toMatchObject({ art: "wiederoeffnung", grund: "Nachtrag eines vergessenen Dienstes", am: "2026-11-05T09:00:00.000Z",
      wer: { personId: "l1", rolle: "leitung" } });
    expect(e.verlauf).toHaveLength(2);
    const k = await anfrage("stempel-korrektur", { token: await token("l1"), rumpf: { personId: "a1", datum: "2026-09-10",
      start: "06:00", ende: "15:00", grund: "Übergabe dauerte eine Stunde länger" } });
    expect(k.status, k.roh).toBe(200);
    expect(k.ereignis).toMatchObject({ nachWiederoeffnung: w.id, vorher: { start: "06:00", ende: "14:00" }, nachher: { start: "06:00", ende: "15:00" } });
    const m = await mandant();
    expect(m.einstempeln["a1|2026-09-10"].korrekturen).toHaveLength(1);
    expect(m.einstempeln["a1|2026-09-10"]).toMatchObject({ start: "06:00", ende: "14:00" });                  // Original bleibt
    const zu = await abschluss("l1", { aktion: "abschliessen", monat: "2026-09", grund: "Nach Korrektur" });
    expect(zu.status, zu.roh).toBe(200);
    e = (await mandant()).monatsabschluss["2026-09"];
    expect(e.verlauf.map((x) => x.art)).toEqual(["abschluss", "wiederoeffnung", "abschluss"]);
    expect(e.verlauf[2].abdruck).not.toBe(e.verlauf[0].abdruck);                                              // Ist hat sich geändert
    expect(w.abdruckGleich).toBe(true);
  });
  it("die Kundenrolle (Probierraum) darf wiederöffnen; ein nicht abgeschlossener Monat 409", async () => {
    expect((await abschluss("ku1", { aktion: "wiederoeffnen", monat: "2026-08", grund: "Ausprobieren im Probierraum" })).status).toBe(200);
    expect((await abschluss("ku1", { aktion: "wiederoeffnen", monat: "2026-08", grund: "Ausprobieren im Probierraum" })).status).toBe(409);
  });
  it("Protokoll: Abschluss, Wiederöffnen und Abweisungen stehen in der Spur — mit Monat, Rolle und Person", async () => {
    const { getStore } = await import("../server/lib/ablage.mjs");
    const spur = getStore({ name: "centric-spur" });
    const { blobs } = await spur.list({ prefix: "2026-11-05/schreiben/" });
    const zeilen = [];
    for (const b of blobs) zeilen.push(await spur.get(b.key, { type: "json" }));
    const z = (muster, ausgang) => zeilen.filter((x) => muster.test(x.zusatz || "") && (!ausgang || x.ausgang === ausgang));
    expect(z(/^Monatsabschluss 2026-09 abgeschlossen/, "erfolg").length).toBeGreaterThanOrEqual(2);
    expect(z(/^Monatsabschluss 2026-09 wiedergeöffnet: Nachtrag eines vergessenen Dienstes/, "erfolg")).toHaveLength(1);
    expect(z(/^Monatsabschluss .*Rolle/, "abgewiesen").length).toBeGreaterThanOrEqual(8);
    expect(z(/Monat abgeschlossen/, "abgewiesen").length).toBeGreaterThanOrEqual(6);
    for (const x of z(/^Monatsabschluss 2026-09 /, "erfolg")) expect(x.rolle && x.person, x.zusatz).toBeTruthy();
  });
});

describe("Datenschutz: Abschlussdetails nur für Planung und Leitung", { timeout: 120000 }, () => {
  it("Beschäftigte, Betriebsrat, Schichtverantwortung: nur „abgeschlossen“ je Monat — kein Wer, Grund, Verlauf, keine abgewiesenen Stempel", async () => {
    for (const id of ["a1", "a2", "r1", "s1"]) {
      const g = await anfrage("bestand", { methode: "GET", token: await token(id) });
      expect(g.status).toBe(200);
      const ma = g.bestand.mandanten[0].monatsabschluss;
      expect(Object.values(ma).every((x) => JSON.stringify(x) === JSON.stringify({ abgeschlossen: true })), id).toBe(true);
      expect(ma["2026-10"], id).toEqual({ abgeschlossen: true });
      /* Die Kennung des Oktober-Abschlusses genau ("ma-1" in Anführungszeichen): Die Korrektur am eigenen Stempel trägt
         legitim `nachWiederoeffnung: "ma-<Hex>"` — ein Muster ohne Begrenzung träfe sie bei Hex-Beginn „1“ (Review WP-16, M1). */
      expect(g.roh, id).not.toMatch(/Lohnlauf|Nachtrag eines|abgewiesen|"ma-1"/);
    }
  });
  it("Planung und Leitung: der volle Verlauf mit Grund und den abgewiesenen Stempeln", async () => {
    for (const id of ["p1", "l1"]) {
      const g = await anfrage("bestand", { methode: "GET", token: await token(id) });
      const okt = g.bestand.mandanten[0].monatsabschluss["2026-10"];
      expect(okt.verlauf[0]).toMatchObject({ id: "ma-1", grund: "Lohnlauf Oktober" });
      expect(okt.abgewiesen.map((x) => [x.personId, x.datum, x.art])).toEqual([["a1", "2026-10-31", "start"], ["a2", "2026-10-31", "ende"]]);
    }
  });
});

describe("Wiederherstellen: Abschlussstand und Ist abgeschlossener Monate bleiben", { timeout: 120000 }, () => {
  it("Sicherung vor dem Abschluss zurückspielen: Oktober bleibt abgeschlossen, die korrigierte Ist-Zeit bleibt; offene Monate kommen aus der Sicherung", async () => {
    const raum = "wp16-wieder";
    await raumAnlegen(raum, { monatsabschluss: {} });
    const t = await token("l1", raum);
    const s = await anfrage("sicherung", { token: t, rumpf: {} });
    expect(s.status, s.roh).toBe(200);
    /* Danach: Ist im Oktober geändert (korrigiert), Oktober abgeschlossen, November geändert — direkt in der Ablage. */
    const jetzt = await B.bestandLesen(laden(), raum);
    const m = jetzt.bestand.mandanten[0];
    m.erfassung["a1|2026-10-27"] = { start: "06:00", ende: "15:30", bestaetigt: true, grund: "korrigiert vor Abschluss" };
    m.erfassung["a1|2026-10-29"] = { start: "06:00", ende: "14:00", bestaetigt: true, grund: "nachgetragen vor Abschluss" };
    m.monatsabschluss = { "2026-10": ABSCHLUSS_OKT };
    m.erfassung["a1|2026-11-04"] = { start: "06:00", ende: "14:00", bestaetigt: true, grund: "nach der Sicherung" };
    await B.bestandSchreiben(laden(), raum, jetzt.bestand, { durch: "Pruefung" });
    const g = await anfrage("bestand", { methode: "GET", token: t });
    const w = await anfrage("wiederherstellen", { token: t, rumpf: { marke: s.marke, etag: g.etag } });
    expect(w.status, w.roh).toBe(200);
    const n = await mandant(raum);
    expect(n.monatsabschluss["2026-10"].abgeschlossen).toBe(true);
    expect(n.erfassung["a1|2026-10-27"]).toMatchObject({ ende: "15:30", grund: "korrigiert vor Abschluss" });
    expect(n.erfassung["a1|2026-10-29"]).toMatchObject({ grund: "nachgetragen vor Abschluss" });
    expect(n.erfassung["a1|2026-11-04"]).toBeUndefined();                     // offener Monat: aus der Sicherung
  });
});

describe("Offline-Puffer (WP-07): ein Stempel für einen inzwischen abgeschlossenen Monat geht nicht verloren", { timeout: 120000 }, () => {
  it("Puffer → 409 → sichtbar abgelehnt mit Grund, bleibt auf dem Gerät; nach dem Wiederöffnen erneut gesendet → genau ein Stempel", async () => {
    const raum = "wp16-puffer";
    await raumAnlegen(raum);
    const ta = await token("a1", raum);
    const speicher = PUF.speicherFluechtig();
    const inh = "inhaber-a1";
    const ev = await PUF.erfassen(speicher, { art: "start", inhaber: inh, jetzt: new Date("2026-10-30T04:58:00.000Z"), offline: true });
    const senden = async (e) => {
      const { inhaber: _x, ...rumpf } = PUF.rumpfFuer(e, new Date());
      void _x;
      const r = await anfrage("stempeln", { token: ta, rumpf });
      return { status: r.status, daten: r };
    };
    const lauf = await PUF.abarbeiten(speicher, inh, senden);
    expect(lauf.ergebnisse[ev.id]).toMatchObject({ art: "abgelehnt" });
    expect(lauf.ergebnisse[ev.id].grund).toMatch(/abgeschlossen/);
    const liegt = (await PUF.ereignisseVon(speicher, inh)).find((x) => x.id === ev.id);
    expect(liegt).toMatchObject({ zustand: "abgelehnt", fehler: { code: "MONAT_ABGESCHLOSSEN", status: 409 } });
    expect((await mandant(raum)).einstempeln["a1|2026-10-30"]).toBeUndefined();
    expect((await mandant(raum)).monatsabschluss["2026-10"].abgewiesen).toEqual([expect.objectContaining({ ereignis: ev.id, datum: "2026-10-30" })]);
    /* Die Leitung öffnet den Oktober wieder; die Person sendet erneut. */
    expect((await anfrage("monatsabschluss", { token: await token("l1", raum), rumpf: { aktion: "wiederoeffnen", monat: "2026-10",
      grund: "Offline-Stempel vom 30.10. nachtragen" } })).status).toBe(200);
    expect(await PUF.erneutSenden(speicher, ev.id, inh)).toBe(true);
    const zweiter = await PUF.abarbeiten(speicher, inh, senden);
    expect(zweiter.ergebnisse[ev.id]).toMatchObject({ art: "ok" });
    const st = (await mandant(raum)).einstempeln["a1|2026-10-30"];
    expect(st).toMatchObject({ start: "05:58", ereignisStart: ev.id });
    expect(st.markierungen).toEqual(expect.arrayContaining(["OFFLINE_ERFASST"]));
  });
});

describe("KONFLIKT am alten Vorgang (B6.3) nur im offenen Monat (Review WP-16, M4)", { timeout: 120000 }, () => {
  it("Ende am 01.11. zu einem über 20 h alten Beginn vom 31.10.: der Oktober-Vorgang bleibt im abgeschlossenen Monat unberührt — im offenen bekommt er KONFLIKT", async () => {
    try {
      for (const [raum, zu] of [["wp16-konflikt-zu", true], ["wp16-konflikt-offen", false]]) {
        zeitAuf(JETZT);
        await raumAnlegen(raum, zu ? {} : { monatsabschluss: {} });
        zeitAuf("2026-11-01T18:30:00Z");                                        // 19:30 Berlin, 22,5 h nach dem Beginn
        const vorher = (await mandant(raum)).einstempeln["a2|2026-10-31"];
        const r = await anfrage("stempeln", { token: await token("a2", raum), rumpf: { art: "ende" } });
        expect(r.status, `${raum}: ${r.roh}`).toBe(200);
        const m = await mandant(raum);
        expect(m.einstempeln["a2|2026-11-01"], raum).toMatchObject({ ende: "19:30" });
        if (zu) {
          expect(m.einstempeln["a2|2026-10-31"]).toEqual(vorher);
          expect(m.einstempeln["a2|2026-10-31"].markierungen || []).not.toContain("KONFLIKT");
        } else {
          expect(m.einstempeln["a2|2026-10-31"].markierungen).toEqual(expect.arrayContaining(["KONFLIKT"]));
        }
      }
    } finally { zeitAuf(JETZT); }
  });
});

describe("Nebenläufigkeit: Abschluss und Stempel gleichzeitig (Raumsperre)", { timeout: 120000 }, () => {
  it("in 6 Rennen: entweder der Stempel liegt vor dem Abschluss (in der Prüfsumme) oder er ist abgewiesen und vermerkt — nie danach im Monat", async () => {
    const { istAbdruck } = await import("../server/lib/monatsabschluss.mjs");
    for (let i = 0; i < 6; i++) {
      const raum = `wp16-rennen-${i}`;
      await raumAnlegen(raum, { monatsabschluss: {} });
      const roh = await B.bestandLesen(laden(), raum);                       // ohne den offenen Antrag im Oktober
      delete roh.bestand.mandanten[0].einstempeln["a2|2026-10-27"].antraege;
      await B.bestandSchreiben(laden(), raum, roh.bestand, { durch: "Pruefung" });
      const tl = await token("l1", raum), ta = await token("a2", raum);
      const zu = () => anfrage("monatsabschluss", { token: tl, rumpf: { aktion: "abschliessen", monat: "2026-10", trotzPrueffaellen: true } });
      const ende = () => anfrage("stempeln", { token: ta, rumpf: { art: "ende", clientEventId: ID(100 + i), offline: true,
        erfasstAm: "2026-11-01T05:00:00.000Z", gesendetAm: JETZT } });
      const [a, b] = i % 2 ? await Promise.all([zu(), ende()]).then(([x, y]) => [x, y]) : await Promise.all([ende(), zu()]).then(([y, x]) => [x, y]);
      expect(a.status, a.roh).toBe(200);
      const m = await mandant(raum);
      expect(m.monatsabschluss["2026-10"].abgeschlossen).toBe(true);
      expect(istAbdruck(m, "2026-10"), `Rennen ${i}`).toBe(m.monatsabschluss["2026-10"].abdruck);
      if (b.status === 200) expect(m.einstempeln["a2|2026-10-31"].ende).toBe("06:00");
      else {
        expect([b.status, b.code]).toEqual([409, "MONAT_ABGESCHLOSSEN"]);
        expect(m.einstempeln["a2|2026-10-31"].ende).toBeUndefined();
        expect(m.monatsabschluss["2026-10"].abgewiesen).toHaveLength(1);
      }
    }
  });
});
