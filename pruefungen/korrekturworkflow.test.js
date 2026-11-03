/* ==========================================================================
   KORREKTURWORKFLOW (WP-14): Antrag → Freigabe → Ist

   Antrag am Stempel (nur eigene, letzte 62 Tage, Grund ≥ 10 Zeichen, ein
   offener je Stempel), Entscheidung durch Leitung/Planung (genehmigt →
   Korrekturereignis mit Antrags-Kennung, Ist ändert sich; abgelehnt mit
   Begründung), Zurückziehen nur durch die antragstellende Person. Das
   Original bleibt unverändert; START_FEHLT und START_VERALTET (KONFLIKT)
   lassen sich so auflösen. Dazu die Regelhinweise (C3: Tageshöchstzeit,
   Ruhezeit, Mutter-/Jugendschutz; C4: Pause) und der Altbestand (C5).
   Datenschutz H8+: Anträge folgen dem Stempel — die Schichtverantwortung
   sieht keine fremden.
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { regelHinweise } from "../server/lib/zeitregeln.mjs";
import { antragStellen, antragEntscheiden } from "../server/lib/korrekturworkflow.mjs";
import { stempelWiderspruch } from "../server/lib/stempelintegritaet.mjs";
import { ungeplanterDienst, istZeitFuer } from "../src/istdaten.js";

const WIRT = "127.0.0.1:3000";
const RAUM = "wp14-korrektur";
let wurzel, laden, daten, B, Z, sitzungAnlegen;
let HEUTE, tag;

let nr = 0;
const anfrage = async (pfad, { methode = "POST", rumpf, token } = {}) => {
  nr += 1;
  const kopf = { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.15.${Math.floor(nr / 250) % 250}.${nr % 250}` };
  if (methode !== "GET") kopf["content-type"] = "application/json";
  if (token) kopf.authorization = `Bearer ${token}`;
  const a = await daten(new Request(`http://${WIRT}/api/${pfad}`, { method: methode, headers: kopf,
    ...(methode === "GET" ? {} : { body: JSON.stringify(rumpf || {}) }) }), {});
  const text = await a.text();
  let d = {}; try { d = JSON.parse(text); } catch { /* leer */ }
  return { status: a.status, roh: text, ...d };
};
const person = (id, rolle, extra = {}) => ({ id, vorname: "V", nachname: id.toUpperCase(), rolle, bereich: "e1", status: "aktiv",
  geburtstag: "1985-01-01", wochenstunden: 39, zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }], ...extra });
const ROLLEN = { l1: "leitung", p1: "planer", s1: "subplaner", a1: "mitarbeiter", a2: "mitarbeiter", a3: "mitarbeiter", r1: "betriebsrat" };
const token = async (id) => (await sitzungAnlegen({ bestand: RAUM, name: `V ${id.toUpperCase()}`, rolle: ROLLEN[id], person: id, betrieb: 0,
  mandantId: "m1", einheit: null }, 2 * 3600 * 1000)).token;
const mandant = async () => (await B.bestandLesen(laden(), RAUM)).bestand.mandanten[0];
const stempel = (start, ende, extra = {}) => ({ start, startAm: `${tag(-1)}T05:00:00.000Z`, ortStart: "Ohne Standortfreigabe erfasst",
  innerhalbStart: null, geprueftStart: false, ende, endeAm: `${tag(-1)}T13:00:00.000Z`, ortEnde: "Ohne Standortfreigabe erfasst",
  innerhalbEnde: null, geprueftEnde: false, ...extra });
const antrag = (datum, start, ende, grund = "Ich habe vergessen auszustempeln", extra = {}) => ({ datum, start, ende, grund, ...extra });

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-wp14-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
  const { getStore } = await import("../server/lib/ablage.mjs");
  laden = () => getStore({ name: "centric", consistency: "strong" });
  const schutz = await import("../server/lib/schutz.mjs");
  for (const art of Object.keys(schutz.GRENZEN)) schutz.GRENZEN[art] = { ...schutz.GRENZEN[art], versuche: 100000 };
  daten = (await import("../server/funktionen/daten.mjs")).default;
  B = await import("../server/lib/bestand.mjs");
  Z = await import("../server/lib/zeiterfassung.mjs");
  ({ sitzungAnlegen } = await import("../server/lib/sitzungen.mjs"));
  HEUTE = Z.heuteBerlin();
  tag = (n) => Z.tagePlus(HEUTE, n);
  const einstempeln = {}, erfassung = {}, abweichungen = {};
  /* Reguläre Tage mit Plan (Frühdienst): a1 tag(-1), tag(-2), tag(-3); a2 tag(-1); a3 tag(-1); s1, r1 tag(-1). */
  for (const [id, n] of [["a1", -1], ["a1", -2], ["a1", -3], ["a2", -1], ["a3", -1], ["a3", -2], ["s1", -1], ["r1", -1], ["l1", -1]]) {
    einstempeln[`${id}|${tag(n)}`] = stempel("06:02", "14:01");
    erfassung[`${id}|${tag(n)}`] = { start: "06:02", ende: "14:01", bestaetigt: true, grund: "" };
    abweichungen[`${id}|${tag(n)}`] = "F";
  }
  /* START_FEHLT: nur ein Ende, keine Erfassung (a1, tag(-4)). */
  einstempeln[`a1|${tag(-4)}`] = { ende: "14:00", endeAm: `${tag(-4)}T13:00:00.000Z`, markierungen: ["START_FEHLT"] };
  abweichungen[`a1|${tag(-4)}`] = "F";
  /* START_VERALTET / KONFLIKT: nur ein Beginn (a2, tag(-3)). */
  einstempeln[`a2|${tag(-3)}`] = { start: "06:00", startAm: `${tag(-3)}T05:00:00.000Z`, markierungen: ["KONFLIKT"], konfliktGrund: "vorgang_veraltet" };
  abweichungen[`a2|${tag(-3)}`] = "F";
  /* Altbestand ungeplant (C5): Stempel mit UNGEPLANTER_DIENST, von früher „bestätigt“ ohne Marke (a3, tag(-5), kein Plan). */
  einstempeln[`a3|${tag(-5)}`] = stempel("06:00", "14:00", { markierungen: ["UNGEPLANTER_DIENST"] });
  erfassung[`a3|${tag(-5)}`] = { start: "06:00", ende: "14:00", bestaetigt: true, grund: "" };
  abweichungen[`a3|${tag(-5)}`] = "-";
  /* Zwei Tage hintereinander für die Ruhezeit (a1): Spätdienst bis 22:00 am Vortag von tag(-2) … */
  await B.bestandSchreiben(laden(), RAUM, { version: 9, mandanten: [{ id: "m1", name: "Haus",
    einheiten: [{ id: "e1", name: "WB 1" }], einstellungen: { ruhezeit: 11 },
    dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00", pause: 30 }],
    personen: [person("l1", "leitung"), person("p1", "planer"), person("s1", "subplaner"), person("a1", "mitarbeiter"),
      person("a2", "mitarbeiter"), person("a3", "mitarbeiter"), person("r1", "betriebsrat")],
    abweichungen, abwesenheiten: [], erfassung, einstempeln, anfragen: [], nachrichten: [] }] }, { durch: "Pruefung" });
}, 60000);
afterAll(async () => { if (wurzel) await rm(wurzel, { recursive: true, force: true }); });

describe("Antrag stellen", { timeout: 120000 }, () => {
  it("die eigene Person, ihr Stempel: 200, offener Antrag am Stempel mit Original und bisheriger Ist-Zeit; Stempel und Ist unverändert", async () => {
    const vorher = await mandant();
    const r = await anfrage("korrektur-antrag", { token: await token("a1"), rumpf: antrag(tag(-1), "05:55", "14:30", "Übergabe dauerte länger", { pause: 30 }) });
    expect(r.status, r.roh).toBe(200);
    expect(r.antrag).toMatchObject({ status: "offen", von: { personId: "a1", rolle: "mitarbeiter" }, vorschlag: { start: "05:55", ende: "14:30", pause: 30 },
      grund: "Übergabe dauerte länger", original: { start: "06:02", ende: "14:01" }, ist: { start: "06:02", ende: "14:01", bestaetigt: true }, entschieden: null });
    const nachher = await mandant();
    const { antraege, ...rest } = nachher.einstempeln[`a1|${tag(-1)}`];
    expect(rest).toEqual(vorher.einstempeln[`a1|${tag(-1)}`]);
    expect(antraege).toHaveLength(1);
    expect(nachher.erfassung).toEqual(vorher.erfassung);
  });
  it("Prüfungen: kein Stempel 404, Zukunft/zu alt/Grund/Uhrzeit/Pause 422, zweiter offener Antrag 409, gleiche Zeit 409", async () => {
    const t = await token("a1");
    const gut = antrag(tag(-2), "05:55", "14:30");
    const p = (rumpf) => anfrage("korrektur-antrag", { token: t, rumpf });
    expect((await p({ ...gut, datum: tag(-9) })).status).toBe(404);
    expect((await p({ ...gut, datum: tag(1) })).status).toBe(422);
    expect((await p({ ...gut, datum: tag(-70) })).status).toBe(422);
    expect((await p({ ...gut, grund: "zu kurz" })).status).toBe(422);
    expect((await p({ ...gut, start: "6 Uhr" })).status).toBe(422);
    expect((await p({ ...gut, pause: 400 })).status).toBe(422);
    expect((await p({ ...gut, datum: "gestern" })).status).toBe(400);
    expect((await p(antrag(tag(-1), "05:00", "15:00"))).status).toBe(409);                 // schon ein offener Antrag
    expect((await p(antrag(tag(-2), "06:02", "14:01"))).status).toBe(409);                 // gilt schon so
    expect((await p(gut)).status).toBe(200);
  });
  it("auch die Schichtverantwortung und der Betriebsrat stellen für den eigenen Stempel (sie stempeln)", async () => {
    for (const id of ["s1", "r1"]) {
      const r = await anfrage("korrektur-antrag", { token: await token(id), rumpf: antrag(tag(-1), "05:50", "14:10") });
      expect(r.status, `${id} ${r.roh}`).toBe(200);
    }
  });
  it("fremde Stempel gibt es nicht: a2 kommt an den Stempel von a3 nicht heran (Antrag gilt immer der eigenen Person)", async () => {
    const r = await anfrage("korrektur-antrag", { token: await token("a2"), rumpf: { ...antrag(tag(-5), "06:00", "15:00"), personId: "a3" } });
    expect(r.status).toBe(404);                                  // a2 hat an tag(-5) keinen Stempel
  });
});

describe("Entscheiden", { timeout: 120000 }, () => {
  const ent = (id, r) => anfrage("korrektur-entscheiden", { token: id, rumpf: r });
  it("Beschäftigte, Schichtverantwortung und Betriebsrat entscheiden nicht (403), nichts ändert sich", async () => {
    const vorher = await mandant();
    const a = vorher.einstempeln[`a1|${tag(-1)}`].antraege[0];
    for (const id of ["a1", "a2", "s1", "r1"])
      expect((await ent(await token(id), { personId: "a1", datum: tag(-1), antragId: a.id, entscheidung: "genehmigt" })).status, id).toBe(403);
    expect((await mandant()).erfassung).toEqual(vorher.erfassung);
  });
  it("Leitung genehmigt: Korrekturereignis mit Antrag, Pause, Hinweisen; Ist ändert sich; Original bleibt; Antrag 'genehmigt' mit Entscheider", async () => {
    const vorher = await mandant();
    const a = vorher.einstempeln[`a1|${tag(-1)}`].antraege[0];
    const r = await ent(await token("l1"), { personId: "a1", datum: tag(-1), antragId: a.id, entscheidung: "genehmigt" });
    expect(r.status, r.roh).toBe(200);
    expect(r.erfassung).toMatchObject({ start: "05:55", ende: "14:30", bestaetigt: true, pause: 30, korrigiert: true });
    const m = await mandant();
    const s = m.einstempeln[`a1|${tag(-1)}`];
    const { antraege, korrekturen, ...original } = s;
    const { antraege: _a, ...vorherOriginal } = vorher.einstempeln[`a1|${tag(-1)}`];
    expect(original).toEqual(vorherOriginal);
    expect(korrekturen).toHaveLength(1);
    expect(korrekturen[0]).toMatchObject({ vorher: { start: "06:02", ende: "14:01", bestaetigt: true }, nachher: { start: "05:55", ende: "14:30", pause: 30 },
      wer: { personId: "l1", rolle: "leitung" }, antrag: { id: a.id, vonPersonId: "a1" } });
    expect(korrekturen[0].grund).toMatch(new RegExp(`^Antrag ${a.id}: Übergabe dauerte länger`));
    expect(antraege[0]).toMatchObject({ status: "genehmigt", entschieden: { durch: { personId: "l1", rolle: "leitung" }, korrekturId: korrekturen[0].id } });
    expect(m.erfassung[`a1|${tag(-1)}`]).toMatchObject({ start: "05:55", ende: "14:30", pause: 30 });
    /* Ist-Berechnung nimmt die genannte Pause: 05:55–14:30 sind 8,58 h Anwesenheit, minus 30 min = 8,08 h. */
    const ist = istZeitFuer(m, m.personen.find((p) => p.id === "a1"), tag(-1), m.dienstarten[0]);
    expect(ist).toMatchObject({ erfasst: true });
    expect(ist.std).toBeCloseTo(8.08, 1);
  });
  it("doppelt entscheiden 409; Ablehnen braucht eine Begründung (422); Ablehnung ändert die Ist-Zeit nicht", async () => {
    const m0 = await mandant();
    const a0 = m0.einstempeln[`a1|${tag(-1)}`].antraege[0];
    expect((await ent(await token("l1"), { personId: "a1", datum: tag(-1), antragId: a0.id, entscheidung: "genehmigt" })).status).toBe(409);
    const a2 = m0.einstempeln[`s1|${tag(-1)}`].antraege[0];
    expect((await ent(await token("p1"), { personId: "s1", datum: tag(-1), antragId: a2.id, entscheidung: "abgelehnt" })).status).toBe(422);
    const ist = (await mandant()).erfassung[`s1|${tag(-1)}`];
    const r = await ent(await token("p1"), { personId: "s1", datum: tag(-1), antragId: a2.id, entscheidung: "abgelehnt", begruendung: "Die Übergabe steht im Dienstbuch anders." });
    expect(r.status, r.roh).toBe(200);
    const m = await mandant();
    expect(m.erfassung[`s1|${tag(-1)}`]).toEqual(ist);
    expect(m.einstempeln[`s1|${tag(-1)}`].korrekturen).toBeUndefined();
    expect(m.einstempeln[`s1|${tag(-1)}`].antraege[0]).toMatchObject({ status: "abgelehnt",
      entschieden: { durch: { personId: "p1", rolle: "planer" }, begruendung: "Die Übergabe steht im Dienstbuch anders." } });
  });
  it("Zurückziehen: nur die antragstellende Person, nur solange offen", async () => {
    const m0 = await mandant();
    const a = m0.einstempeln[`r1|${tag(-1)}`].antraege[0];
    expect((await ent(await token("a2"), { personId: "r1", datum: tag(-1), antragId: a.id, entscheidung: "zurueckgezogen" })).status).toBe(403);
    expect((await ent(await token("r1"), { personId: "r1", datum: tag(-1), antragId: a.id, entscheidung: "zurueckgezogen" })).status).toBe(200);
    expect((await mandant()).einstempeln[`r1|${tag(-1)}`].antraege[0].status).toBe("zurueckgezogen");
    expect((await ent(await token("r1"), { personId: "r1", datum: tag(-1), antragId: a.id, entscheidung: "zurueckgezogen" })).status).toBe(409);
    /* Danach ist ein neuer Antrag für den Tag möglich. */
    expect((await anfrage("korrektur-antrag", { token: await token("r1"), rumpf: antrag(tag(-1), "05:45", "14:15") })).status).toBe(200);
  });
  it("unbekannter Antrag 404, ungültige Entscheidung 400", async () => {
    expect((await ent(await token("l1"), { personId: "a1", datum: tag(-1), antragId: "gibt-es-nicht", entscheidung: "genehmigt" })).status).toBe(404);
    expect((await ent(await token("l1"), { personId: "a1", datum: tag(-1), antragId: "x", entscheidung: "vielleicht" })).status).toBe(400);
  });
});

describe("START_FEHLT und START_VERALTET auflösen (B3)", { timeout: 120000 }, () => {
  it("START_FEHLT: Ende ohne Beginn — der Antrag nennt den Beginn, die Genehmigung ergibt die Ist-Zeit; der Stempel bleibt ohne Beginn", async () => {
    const r = await anfrage("korrektur-antrag", { token: await token("a1"), rumpf: antrag(tag(-4), "06:00", "14:00", "Vergessen einzustempeln, war pünktlich da") });
    expect(r.status, r.roh).toBe(200);
    expect(r.antrag).toMatchObject({ original: { start: null, ende: "14:00" }, ist: null });
    const e = await anfrage("korrektur-entscheiden", { token: await token("l1"),
      rumpf: { personId: "a1", datum: tag(-4), antragId: r.antrag.id, entscheidung: "genehmigt" } });
    expect(e.status, e.roh).toBe(200);
    const m = await mandant();
    expect(m.erfassung[`a1|${tag(-4)}`]).toMatchObject({ start: "06:00", ende: "14:00", bestaetigt: true });
    expect(m.einstempeln[`a1|${tag(-4)}`].start).toBeUndefined();
    expect(m.einstempeln[`a1|${tag(-4)}`].markierungen).toEqual(["START_FEHLT"]);
  });
  it("START_VERALTET/KONFLIKT: nur ein Beginn — die Leitung korrigiert direkt (Korrekturdialog), das Original bleibt", async () => {
    const r = await anfrage("stempel-korrektur", { token: await token("p1"),
      rumpf: { personId: "a2", datum: tag(-3), start: "06:00", ende: "14:00", grund: "Ausstempeln vergessen, laut Dienstbuch 14 Uhr" } });
    expect(r.status, r.roh).toBe(200);
    const m = await mandant();
    expect(m.erfassung[`a2|${tag(-3)}`]).toMatchObject({ start: "06:00", ende: "14:00", bestaetigt: true });
    expect(m.einstempeln[`a2|${tag(-3)}`]).toMatchObject({ start: "06:00", markierungen: ["KONFLIKT"], konfliktGrund: "vorgang_veraltet" });
    expect(m.einstempeln[`a2|${tag(-3)}`].ende).toBeUndefined();
  });
});

describe("Datenschutz (H8+) und Schreibschutz", { timeout: 120000 }, () => {
  it("die Schichtverantwortung sieht keine fremden Stempel und damit keine fremden Anträge; Beschäftigte nur die eigenen", async () => {
    const sv = await anfrage("bestand", { methode: "GET", token: await token("s1") });
    expect(sv.status).toBe(200);
    expect(Object.keys(sv.bestand.mandanten[0].einstempeln || {})).toEqual([`s1|${tag(-1)}`]);
    expect(sv.roh).not.toContain("Übergabe dauerte länger");
    expect(sv.roh).not.toContain("Vergessen einzustempeln");
    const a2 = await anfrage("bestand", { methode: "GET", token: await token("a2") });
    expect(a2.roh).not.toContain("Übergabe dauerte länger");
    const a1 = await anfrage("bestand", { methode: "GET", token: await token("a1") });
    expect(a1.roh).toContain("Übergabe dauerte länger");
    const br = await anfrage("bestand", { methode: "GET", token: await token("r1") });
    expect(br.roh).not.toContain("Übergabe dauerte länger");
  });
  it("über das Speichern lassen sich Anträge weder anlegen noch ändern (403); eine ältere Kopie mit altem Status ist kein Verstoß", async () => {
    const lt = await token("l1");
    const g = await anfrage("bestand", { methode: "GET", token: lt });
    const b = JSON.parse(JSON.stringify(g.bestand));
    b.mandanten[0].einstempeln[`a1|${tag(-1)}`].antraege[0].grund = "anders";
    expect((await anfrage("bestand", { methode: "PUT", token: lt, rumpf: { bestand: b, etag: g.etag } })).status).toBe(403);
    const c = JSON.parse(JSON.stringify(g.bestand));
    c.mandanten[0].einstempeln[`a2|${tag(-1)}`].antraege = [{ id: "ka-erfunden", von: { personId: "a2" }, gestellt: "2026-01-01T00:00:00Z",
      vorschlag: { start: "01:00", ende: "23:00" }, grund: "selbst gebaut", status: "genehmigt" }];
    expect((await anfrage("bestand", { methode: "PUT", token: lt, rumpf: { bestand: c, etag: g.etag } })).status).toBe(403);
    /* Statusabweichung einer älteren Kopie: gleicher unveränderlicher Teil, anderer Status ⇒ kein Widerspruch. */
    const alt = JSON.parse(JSON.stringify(g.bestand));
    alt.mandanten[0].einstempeln[`a1|${tag(-1)}`].antraege[0].status = "offen";
    expect(stempelWiderspruch((await mandant()), alt.mandanten[0], { heute: HEUTE })).toBeNull();
    const ok = await anfrage("bestand", { methode: "PUT", token: lt, rumpf: { bestand: alt, etag: g.etag } });
    expect(ok.status, ok.roh).toBe(200);
    expect((await mandant()).einstempeln[`a1|${tag(-1)}`].antraege[0].status).toBe("genehmigt");
  });
});

describe("Protokoll vollständig", () => {
  /* WP-14b (M1): Die Spur liest der Betreiber (Auftragsverarbeiter). Sie nennt jede Stufe mit Antrags- und
     Ereigniskennung, Ausgang, Rolle und Person des Handelnden — aber nicht mehr die betroffene Person, den Tag,
     die Ist-Zeiten oder Hinweiskennungen (Art. 9). Diese stehen am Stempel (Antrag, Korrekturereignis). */
  it("Antrag, Genehmigung, Ablehnung, Zurückziehen und Abweisungen stehen im Betriebsprotokoll (Spur) — mit Antrag, Ereignis, Ausgang, Handelndem; ohne Person|Tag und Zeiten", async () => {
    const { getStore } = await import("../server/lib/ablage.mjs");
    const spur = getStore({ name: "centric-spur" });
    const heute = new Date().toISOString().slice(0, 10);
    const { blobs } = await spur.list({ prefix: `${heute}/schreiben/` });
    const zeilen = [];
    for (const b of blobs) zeilen.push(await spur.get(b.key, { type: "json" }));
    const z = (muster, ausgang) => zeilen.filter((x) => muster.test(x.zusatz || "") && (!ausgang || x.ausgang === ausgang));
    const m = await mandant();
    const aA1 = m.einstempeln[`a1|${tag(-1)}`].antraege[0];
    const aS1 = m.einstempeln[`s1|${tag(-1)}`].antraege[0];
    const aR1 = m.einstempeln[`r1|${tag(-1)}`].antraege[0];
    /* a1: drei Anträge gestellt (tag -1, -2, -4) und der genehmigte entschieden; s1 abgelehnt; r1 zurückgezogen. */
    expect(zeilen.filter((x) => /^Korrekturantrag ka-\w+: gestellt$/.test(x.zusatz || "") && x.ausgang === "erfolg" && x.person === "a1").length).toBeGreaterThanOrEqual(3);
    expect(z(new RegExp(`^Korrekturantrag ${aA1.id}: genehmigt · Korrektur ${aA1.entschieden.korrekturId}( · \\d+ Hinweise?)?$`), "erfolg")).toHaveLength(1);
    expect(z(new RegExp(`^Korrekturantrag ${aS1.id}: abgelehnt$`), "erfolg")).toHaveLength(1);
    expect(z(new RegExp(`^Korrekturantrag ${aR1.id}: zurueckgezogen$`), "erfolg")).toHaveLength(1);
    for (const x of z(/^(Korrekturantrag|Stempelkorrektur)/)) {
      expect(x.zusatz, "keine Person|Tag").not.toMatch(/\|\d{4}-\d{2}-\d{2}/);
      expect(x.zusatz, "keine Uhrzeiten").not.toMatch(/\b([01]\d|2[0-3]):[0-5]\d\b/);
      expect(x.zusatz, "keine Schutzkennungen").not.toMatch(/MUTTERSCHUTZ|JUGENDSCHUTZ/);
    }
    expect(z(/^Korrekturantrag entscheiden: /, "abgewiesen").length).toBeGreaterThanOrEqual(3);
    expect(z(/^Korrekturantrag entscheiden · Rolle /, "abgewiesen").length).toBeGreaterThanOrEqual(4);
    expect(z(/^Korrekturantrag: /, "abgewiesen").length).toBeGreaterThanOrEqual(6);
    expect(z(/^Stempelkorrektur k-\w+/, "erfolg").length).toBeGreaterThanOrEqual(1);       // direkte Korrektur (START_VERALTET)
    /* Jede Zeile trägt Rolle und Person des Handelnden. */
    for (const x of z(/^Korrekturantrag ka-/, "erfolg")) expect(x.rolle && x.person, x.zusatz).toBeTruthy();
  });
});

describe("Regelhinweise und Pause (C3, C4)", () => {
  const m = (extra = {}) => ({ personen: [person("p", "mitarbeiter", extra.person || {})], erfassung: extra.erfassung || {}, einstellungen: { ruhezeit: 11 } });
  const codes = (h) => h.map((x) => x.code);
  it("C4 Pause: ab 6 h 30 min, ab 9 h 45 min; ausreichende Pause ohne Hinweis", () => {
    expect(codes(regelHinweise(m(), "p", "2026-11-02", { start: "06:00", ende: "14:00", pause: 0 }))).toEqual(["PAUSE"]);
    expect(codes(regelHinweise(m(), "p", "2026-11-02", { start: "06:00", ende: "14:00", pause: 30 }))).toEqual([]);
    expect(codes(regelHinweise(m(), "p", "2026-11-02", { start: "06:00", ende: "16:30", pause: 30 }))).toContain("PAUSE");
    expect(codes(regelHinweise(m(), "p", "2026-11-02", { start: "06:00", ende: "16:30", pause: 45 }))).toEqual([]);
    expect(codes(regelHinweise(m(), "p", "2026-11-02", { start: "06:00", ende: "11:00", pause: 0 }))).toEqual([]);
  });
  it("C3 Tageshöchstzeit: über 10 h netto", () => {
    expect(codes(regelHinweise(m(), "p", "2026-11-02", { start: "06:00", ende: "18:30", pause: 45 }))).toContain("TAGESGRENZE");
    expect(codes(regelHinweise(m(), "p", "2026-11-02", { start: "06:00", ende: "16:00", pause: 45 }))).not.toContain("TAGESGRENZE");
  });
  it("C3 Ruhezeit gegen die bestätigten Zeiten von Vor- und Folgetag", () => {
    const erfassung = { "p|2026-11-01": { start: "14:00", ende: "22:00", bestaetigt: true }, "p|2026-11-03": { start: "05:00", ende: "13:00", bestaetigt: true } };
    const h = regelHinweise(m({ erfassung }), "p", "2026-11-02", { start: "06:00", ende: "16:00", pause: 45 });
    const ruhe = h.filter((x) => x.code === "RUHEZEIT");
    expect(ruhe).toHaveLength(1);                                          // 22→06 = 8 h zu kurz; 16→05 = 13 h genügt
    expect(ruhe[0].text).toMatch(/Vortag/);
    const beide = regelHinweise(m({ erfassung }), "p", "2026-11-02", { start: "06:00", ende: "22:00", pause: 45 }).filter((x) => x.code === "RUHEZEIT");
    expect(beide.map((x) => /Vortag|Folgetag/.exec(x.text)[0])).toEqual(["Vortag", "Folgetag"]);       // 22→05 = 7 h
  });
  it("C3 Mutterschutz und Jugendschutz: Zeiten vor 6 und nach 20 Uhr", () => {
    const mu = regelHinweise(m({ person: { mutterschutz: true } }), "p", "2026-11-02", { start: "14:00", ende: "21:00", pause: 30 });
    expect(codes(mu)).toContain("MUTTERSCHUTZ");
    const jung = regelHinweise(m({ person: { geburtstag: "2010-05-05" } }), "p", "2026-11-02", { start: "13:00", ende: "21:00", pause: 30 });
    expect(codes(jung)).toContain("JUGENDSCHUTZ");
    expect(codes(regelHinweise(m({ person: { mutterschutz: true, geburtstag: "2010-05-05" } }), "p", "2026-11-02", { start: "08:00", ende: "16:00", pause: 60 }))).toEqual([]);   // WP-16: Jugendliche über 6 h brauchen 60 min (§ 11 JArbSchG)
  });
});

describe("Ungeplanter Dienst: Pause und Altbestand (C4, C5)", { timeout: 120000 }, () => {
  it("C5: ein Altbestand-Stempel ohne Plan mit „bestätigter“ Zeit bekommt mit der Prüfung durch die Leitung die Marke — dann zählt er", async () => {
    const m0 = await mandant();
    expect(ungeplanterDienst(m0, m0.personen.find((p) => p.id === "a3"), tag(-5))).toBeNull();           // zählt bisher nicht
    const r = await anfrage("stempel-korrektur", { token: await token("l1"),
      rumpf: { personId: "a3", datum: tag(-5), start: "06:00", ende: "14:00", pause: 30, grund: "Altbestand geprüft, Dienst war abgesprochen" } });
    expect(r.status, r.roh).toBe(200);
    expect(r.erfassung).toMatchObject({ ungeplant: true, bestaetigt: true, pause: 30 });
    expect(r.hinweise).toEqual([]);
    const m = await mandant();
    const d = ungeplanterDienst(m, m.personen.find((p) => p.id === "a3"), tag(-5));
    expect(d).toMatchObject({ start: "06:00", ende: "14:00", pause: 30 });
  });
  it("C4: die Pause senkt die Ist-Dauer des ungeplanten Dienstes (8 h → 7,5 h); ohne Pause weist der Hinweis darauf hin", async () => {
    const m = await mandant();
    const p = m.personen.find((x) => x.id === "a3");
    const mitPause = istZeitFuer(m, p, tag(-5), ungeplanterDienst(m, p, tag(-5)));
    expect(mitPause.std).toBeCloseTo(7.5, 1);
    const hinweise = regelHinweise(m, "a3", tag(-5), { start: "06:00", ende: "14:00", pause: 0 });
    expect(hinweise.map((x) => x.code)).toEqual(["PAUSE"]);
  });
  it("ein regulärer Stempeltag mit gleicher Zeit bleibt „nichts zu korrigieren“ (409); der Altbestand-Fall ohne Marke ist die Ausnahme", async () => {
    const gleich = await anfrage("stempel-korrektur", { token: await token("l1"),
      rumpf: { personId: "a1", datum: tag(-2), start: "06:02", ende: "14:01", grund: "Nichts zu ändern, nur bestätigt" } });
    expect(gleich.status).toBe(409);
    const mm = { personen: [person("a", "mitarbeiter")], einstempeln: { "a|2026-11-02": { start: "06:00", ende: "14:00", markierungen: ["UNGEPLANTER_DIENST"] } },
      erfassung: { "a|2026-11-02": { start: "06:00", ende: "14:00", bestaetigt: true, grund: "" } }, abweichungen: { "a|2026-11-02": "-" } };
    const alt = antragStellen(mm, { personId: "a" }, { datum: "2026-11-02", start: "06:00", ende: "14:00", grund: "Gleiche Zeit, nur zur Prüfung" }, new Date("2026-11-03T08:00:00Z"), "ka-1", "2026-11-03");
    expect(alt.status).toBe(409);                      // der Antrag auf dieselbe Zeit ist keiner
    const e = antragEntscheiden(mm, { personId: "a", datum: "2026-11-02", antragId: "x", entscheidung: "genehmigt" }, { personId: "l" }, new Date(), "k-1");
    expect(e.status).toBe(404);
  });
});

describe("Pause kleiner als die Anwesenheit (Auflage C1)", { timeout: 120000 }, () => {
  it("Antrag: Pause gleich oder größer als die Brutto-Dauer (auch über Mitternacht) wird mit 422 abgelehnt; der Stempel bleibt unverändert", async () => {
    const t = await token("a3");
    const vorher = await mandant();
    const p = (rumpf) => anfrage("korrektur-antrag", { token: t, rumpf });
    const a = await p(antrag(tag(-1), "08:00", "09:00", "Pause zu lang eingetragen", { pause: 180 }));
    expect(a.status, a.roh).toBe(422);
    expect((await p(antrag(tag(-1), "08:00", "09:00", "Pause so lang wie der Dienst", { pause: 60 }))).status).toBe(422);
    expect((await p(antrag(tag(-1), "22:00", "01:00", "Nachtdienst, Pause so lang wie der Dienst", { pause: 180 }))).status).toBe(422);
    expect(await mandant()).toEqual(vorher);
    /* eine kürzere Pause ist keine 422 mehr (200, oder 409 wenn schon ein Antrag offen ist) */
    expect((await p(antrag(tag(-1), "08:00", "09:00", "Pause kürzer als der Dienst", { pause: 59 }))).status).not.toBe(422);
    expect((await p(antrag(tag(-2), "22:00", "02:00", "Nachtdienst, Pause kürzer", { pause: 180 }))).status).not.toBe(422);
  });
  it("direkte Korrektur (/api/stempel-korrektur): Pause nicht kleiner als die Brutto-Dauer → 422, Ist bleibt; 59 min bei 1 h gehen", async () => {
    const t = await token("l1");
    const vor = (await mandant()).erfassung[`a1|${tag(-3)}`];
    const k = (extra) => anfrage("stempel-korrektur", { token: t, rumpf: { personId: "a1", datum: tag(-3), grund: "Pause falsch eingetragen, Korrektur", ...extra } });
    expect((await k({ start: "08:00", ende: "09:00", pause: 180 })).status).toBe(422);
    expect((await k({ start: "08:00", ende: "09:00", pause: 60 })).status).toBe(422);
    expect((await k({ start: "22:00", ende: "01:00", pause: 180 })).status).toBe(422);        // über Mitternacht: 3 h brutto
    expect((await mandant()).erfassung[`a1|${tag(-3)}`]).toEqual(vor);
    const gut = await k({ start: "08:00", ende: "09:00", pause: 59 });
    expect(gut.status, gut.roh).toBe(200);
    const m = await mandant();
    expect(istZeitFuer(m, m.personen.find((x) => x.id === "a1"), tag(-3), { start: "08:00", ende: "09:00", pause: 59 }).std).toBeGreaterThanOrEqual(0);
  });
  it("ohne genannte Pause zählt die zuletzt erfasste: sie darf die neue Dauer nicht übersteigen", async () => {
    const r = await anfrage("stempel-korrektur", { token: await token("l1"), rumpf: { personId: "a1", datum: tag(-3), start: "08:00", ende: "08:30", grund: "Dienst war nur kurz, Ende korrigiert" } });
    expect(r.status, r.roh).toBe(422);
  });
  it("Hinweis (keine Sperre), wenn die Pause den größten Teil der Anwesenheit ausmacht", () => {
    const m = { personen: [], erfassung: {} };
    expect(regelHinweise(m, "p", "2026-11-02", { start: "08:00", ende: "10:00", pause: 90 }).map((x) => x.code)).toContain("PAUSE_LANG");
    expect(regelHinweise(m, "p", "2026-11-02", { start: "08:00", ende: "16:00", pause: 30 }).map((x) => x.code)).not.toContain("PAUSE_LANG");
  });
});
