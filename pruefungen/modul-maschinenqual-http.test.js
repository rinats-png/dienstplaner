/* ==========================================================================
   MODUL MASCHINENQUALIFIKATION — Serverweg über HTTP (WP-19.11)

   Am echten Handler (server/funktionen/daten.mjs):
     - Qualifikationsgrundlage: Planung speichert (200), Formfehler 422,
       Betriebsrat und Beschäftigte sehen die fremde Grundlage nicht,
     - Regelwert: Leitung setzt eine geprüfte Höchstgrenze (200, Server
       stempelt), Planung kann sie nicht setzen und nicht aufheben,
       ein längeres Intervall wird mit 422 abgewiesen,
     - Betriebsprotokoll nur mit Anzahlen (keine Person, kein Bezug, kein Wert).
   ========================================================================== */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const WIRT = "127.0.0.1:3000";
let wurzel, laden, daten, B, sitzungAnlegen, S;
let raumNr = 0, RAUM = "";
const kopie = (x) => JSON.parse(JSON.stringify(x));

let nr = 0;
async function anfrage(pfad, { methode = "GET", rumpf, token } = {}) {
  nr += 1;
  const kopf = { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.20.${Math.floor(nr / 250) % 250}.${nr % 250}` };
  if (methode !== "GET") kopf["content-type"] = "application/json";
  if (token) kopf.authorization = `Bearer ${token}`;
  const a = await daten(new Request(`http://${WIRT}${pfad}`, { method: methode, headers: kopf,
    ...(methode === "GET" ? {} : { body: JSON.stringify(rumpf || {}) }) }), {});
  let d = {}; try { d = await a.json(); } catch { /* leer */ }
  return { status: a.status, ...d };
}

const person = (id, rolle, einheit, extra = {}) => ({ id, vorname: "V", nachname: `N${id}`, rolle, bereich: einheit, status: "aktiv",
  geburtstag: "1980-01-01", zugehoerigkeit: [{ ab: "2020-01-01", einheitId: einheit }], ...extra });
const ROLLEN = { PL: { rolle: "planer", person: "p1" }, LT: { rolle: "leitung", person: "l1" }, MA: { rolle: "mitarbeiter", person: "m0" },
  BR: { rolle: "betriebsrat", person: "r1" } };
const TOKEN = {};
const PRESSE = { id: "bm1", art: "anlage", name: "Presse 3", personId: null, mindestBesetzung: { F: 1 }, laufzeit: { wochentage: new Array(7).fill(true) } };
const K_BED = { id: "k1", name: "Bedienung Presse 3", art: "geraet", betriebsmittelId: "bm1", wiederholungMonate: 12, pflichtFuer: [], zugedacht: [] };
const K_BEF = { id: "k9", name: "Befähigte Person Presse 3", art: "geraet", betriebsmittelId: "bm1", wiederholungMonate: 36, befaehigtePerson: true, pflichtFuer: [], zugedacht: [] };
const GRUND = { art: "berufsausbildung", bezug: "Zeugnis GEHEIMBEZUG 2014", datum: "2014-07-01" };

const bestand = () => ({ version: 9, mandanten: [{
  id: "m1", name: "Haus", status: "aktiv", pakete: ["industrie"], einheiten: [{ id: "e1", name: "E1", versatzTage: 0 }],
  dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00", pause: 30 }], qualifikationen: [],
  einstellungen: { ruhezeit: 11, maxFolge: 6 }, betriebsmittel: [PRESSE], kompetenzen: [K_BED, K_BEF],
  personen: [person("m0", "mitarbeiter", "e1", { kompetenzNachweise: [{ kompetenzId: "k9", ab: "2026-01-01", qualifikationsgrundlage: { art: "schulung", bezug: "EIGENER-BEZUG" } }] }),
    person("x1", "mitarbeiter", "e1", { kompetenzNachweise: [{ kompetenzId: "k9", ab: "2026-01-01" }] }),
    person("p1", "planer", "ALLE"), person("l1", "leitung", "ALLE"), person("r1", "betriebsrat", "ALLE")],
  abweichungen: {}, abwesenheiten: [], erfassung: {}, einstempeln: {}, anfragen: [], nachrichten: [], bestaetigungen: [],
}] });

async function neuerRaum() {
  RAUM = `modul-maschqual-${++raumNr}`;
  await B.bestandSchreiben(laden(), RAUM, bestand(), { durch: "Prüfung" });
  for (const [k, r] of Object.entries(ROLLEN)) {
    TOKEN[k] = (await sitzungAnlegen({ bestand: RAUM, name: `V N${r.person}`, rolle: r.rolle, person: r.person, betrieb: 0,
      mandantId: "m1", einheit: null }, 2 * 3600 * 1000)).token;
  }
}
const gespeichert = async () => (await B.bestandLesen(laden(), RAUM)).bestand.mandanten[0];
const nachweisX1 = (m) => m.personen.find((p) => p.id === "x1").kompetenzNachweise.find((n) => n.kompetenzId === "k9");
const put = async (k, aendern) => {
  const g = await anfrage("/api/bestand", { token: TOKEN[k] });
  const b = kopie(g.bestand); aendern(b.mandanten[0]);
  return anfrage("/api/bestand", { methode: "PUT", token: TOKEN[k], rumpf: { bestand: b, etag: g.etag } });
};

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-modul-maschqual-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
  const { getStore } = await import("../server/lib/ablage.mjs");
  laden = () => getStore({ name: "centric", consistency: "strong" });
  daten = (await import("../server/funktionen/daten.mjs")).default;
  B = await import("../server/lib/bestand.mjs");
  S = await import("../server/lib/schutz.mjs");
  ({ sitzungAnlegen } = await import("../server/lib/sitzungen.mjs"));
});
afterAll(async () => { if (wurzel) await rm(wurzel, { recursive: true, force: true }); });

describe("Qualifikationsgrundlage über den Serverweg", { timeout: 120000 }, () => {
  it("Planung speichert die Grundlage (200); im Protokoll steht nur die Anzahl", async () => {
    await neuerRaum();
    const r = await put("PL", (m) => { nachweisX1(m).qualifikationsgrundlage = GRUND; });
    expect(r.status, JSON.stringify(r).slice(0, 200)).toBe(200);
    expect(nachweisX1(await gespeichert()).qualifikationsgrundlage).toEqual(GRUND);
    const z = (await S.spurLesen(1)).filter((x) => x.ausgang === "qualifikationsgrundlage-geaendert");
    expect(z.map((x) => x.zusatz)).toEqual(["1 Nachweis(e)"]);
    expect(JSON.stringify(z)).not.toMatch(/GEHEIMBEZUG|x1|2014|\|/);
  });
  it("Formfehler: 422, nichts gespeichert; an der Bedienungskompetenz: 422", async () => {
    await neuerRaum();
    const a = await put("PL", (m) => { nachweisX1(m).qualifikationsgrundlage = { art: "gesetz", bezug: "x" }; });
    expect(a.status).toBe(422);
    expect(a.text).toMatch(/Qualifikationsgrundlage/);
    const b = await put("LT", (m) => { m.personen.find((p) => p.id === "x1").kompetenzNachweise = [{ kompetenzId: "k1", ab: "2026-01-01", qualifikationsgrundlage: GRUND }]; });
    expect(b.status).toBe(422);
    expect(nachweisX1(await gespeichert()).qualifikationsgrundlage).toBeUndefined();
  });
  it("Sicht: die Person sieht ihre eigene Grundlage, Betriebsrat sieht keine, Beschäftigte keine fremde", async () => {
    await neuerRaum();
    await put("PL", (m) => { nachweisX1(m).qualifikationsgrundlage = GRUND; });
    const br = JSON.stringify((await anfrage("/api/bestand", { token: TOKEN.BR })).bestand);
    expect(br).not.toMatch(/GEHEIMBEZUG|EIGENER-BEZUG/);
    expect(br).toContain("k9");
    const ma = JSON.stringify((await anfrage("/api/bestand", { token: TOKEN.MA })).bestand);
    expect(ma).toContain("EIGENER-BEZUG");
    expect(ma).not.toContain("GEHEIMBEZUG");
    const pl = JSON.stringify((await anfrage("/api/bestand", { token: TOKEN.PL })).bestand);
    expect(pl).toContain("GEHEIMBEZUG");
    expect(pl).toContain("EIGENER-BEZUG");
  });
  it("Beschäftigte können die Grundlage weder setzen noch löschen", async () => {
    await neuerRaum();
    await put("PL", (m) => { nachweisX1(m).qualifikationsgrundlage = GRUND; });
    await put("MA", (m) => { for (const p of m.personen) for (const n of p.kompetenzNachweise || []) { n.qualifikationsgrundlage = { art: "sonstige", bezug: "hack" }; } });
    const m = await gespeichert();
    expect(nachweisX1(m).qualifikationsgrundlage).toEqual(GRUND);
    expect(m.personen.find((p) => p.id === "m0").kompetenzNachweise[0].qualifikationsgrundlage.bezug).toBe("EIGENER-BEZUG");
  });
});

describe("Regelwert Unterweisungsintervall über den Serverweg", { timeout: 120000 }, () => {
  const RW = "MASCHQUAL-INTERVALL-01";
  const GEPR = { wert: 12, quelle: "Gefährdungsbeurteilung Halle 2", fundstelle: "Abschnitt 4.2", pruefstatus: "geprueft" };
  it("Leitung setzt die geprüfte Höchstgrenze: 200, der Server setzt Wer und Wann; Protokoll nur als Anzahl", async () => {
    await neuerRaum();
    const r = await put("LT", (m) => { m.einstellungen.regelwerte = { [RW]: GEPR }; });
    expect(r.status, JSON.stringify(r).slice(0, 200)).toBe(200);
    const e = (await gespeichert()).einstellungen.regelwerte[RW];
    expect(e).toMatchObject({ wert: 12, pruefstatus: "geprueft", geprueftVon: "l1", geaendertVon: "l1" });
    expect(e.geprueftAm).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const z = (await S.spurLesen(1)).filter((x) => x.ausgang === "regelwert-geaendert");
    expect(z.map((x) => x.zusatz)).toEqual(["1 Regelwert(e)"]);
    expect(JSON.stringify(z)).not.toMatch(/Gefährdungsbeurteilung|4\.2/);
  });
  it("Planung kann den Regelwert weder setzen noch aufheben", async () => {
    await neuerRaum();
    const a = await put("PL", (m) => { m.einstellungen.regelwerte = { [RW]: { ...GEPR, wert: 99 } }; });
    expect([200, 403]).toContain(a.status);
    expect((await gespeichert()).einstellungen.regelwerte).toBeUndefined();
    await put("LT", (m) => { m.einstellungen.regelwerte = { [RW]: GEPR }; });
    await put("PL", (m) => { delete m.einstellungen.regelwerte; });
    expect((await gespeichert()).einstellungen.regelwerte[RW]).toMatchObject({ wert: 12, pruefstatus: "geprueft" });
  });
  it("ein längeres Intervall über der geprüften Grenze: 422 mit Quelle und Fundstelle; ein kürzeres 200", async () => {
    await neuerRaum();
    await put("LT", (m) => { m.einstellungen.regelwerte = { [RW]: GEPR }; });
    const lang = await put("PL", (m) => { m.kompetenzen.find((k) => k.id === "k1").wiederholungMonate = 24; });
    expect(lang.status).toBe(422);
    expect(lang.text).toMatch(/Höchstgrenze/);
    expect(lang.text).toContain("Abschnitt 4.2");
    expect((await gespeichert()).kompetenzen.find((k) => k.id === "k1").wiederholungMonate).toBe(12);
    const kurz = await put("PL", (m) => { m.kompetenzen.find((k) => k.id === "k1").wiederholungMonate = 6; });
    expect(kurz.status).toBe(200);
  });
  it("ohne geprüfte Grenze: ein längeres Intervall wird gespeichert (nur Hinweis, keine Sperre)", async () => {
    await neuerRaum();
    const r = await put("PL", (m) => { m.kompetenzen.find((k) => k.id === "k1").wiederholungMonate = 24; });
    expect(r.status).toBe(200);
    expect((await gespeichert()).kompetenzen.find((k) => k.id === "k1").wiederholungMonate).toBe(24);
  });
  it("Formfehler am Regelwert: 422", async () => {
    await neuerRaum();
    expect((await put("LT", (m) => { m.einstellungen.regelwerte = { [RW]: { wert: 0, pruefstatus: "provisional" } }; })).status).toBe(422);
    expect((await put("LT", (m) => { m.einstellungen.regelwerte = { [RW]: { ...GEPR, fundstelle: "" } }; })).status).toBe(422);
  });
});
