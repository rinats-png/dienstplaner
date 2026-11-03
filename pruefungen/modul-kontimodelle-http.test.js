/* ==========================================================================
   MODUL KONTIMODELLE — Serverweg über HTTP (WP-19.12)

   Sollzeit und Freischichtdauer sind Regelwerte des Betriebs: Leitung speichert
   (200, Server stempelt), Planung nicht, Formfehler 422, Betriebsprotokoll nur
   als Anzahl, und eine parallele Änderung der Stammdaten führt zu 409.
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
  const kopf = { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.21.${Math.floor(nr / 250) % 250}.${nr % 250}` };
  if (methode !== "GET") kopf["content-type"] = "application/json";
  if (token) kopf.authorization = `Bearer ${token}`;
  const a = await daten(new Request(`http://${WIRT}${pfad}`, { method: methode, headers: kopf,
    ...(methode === "GET" ? {} : { body: JSON.stringify(rumpf || {}) }) }), {});
  let d = {}; try { d = await a.json(); } catch { /* leer */ }
  return { status: a.status, ...d };
}

const person = (id, rolle, einheit) => ({ id, vorname: "V", nachname: `N${id}`, rolle, bereich: einheit, status: "aktiv",
  geburtstag: "1980-01-01", zugehoerigkeit: [{ ab: "2020-01-01", einheitId: einheit }] });
const ROLLEN = { PL: { rolle: "planer", person: "p1" }, LT: { rolle: "leitung", person: "l1" }, MA: { rolle: "mitarbeiter", person: "m0" } };
const TOKEN = {};
const SOLL = "KONTI-ARBEITSZEIT-01", FS = "KONTI-FREISCHICHT-01";
const W = (wert, extra = {}) => ({ wert, quelle: "Betriebsvereinbarung Konti", fundstelle: "§ 2", pruefstatus: "provisional", ...extra });

const bestand = () => ({ version: 9, mandanten: [{
  id: "m1", name: "Haus", status: "aktiv", pakete: ["industrie"], einheiten: [{ id: "e1", name: "E1", versatzTage: 0 }],
  dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00", pause: 30 }], qualifikationen: [],
  einstellungen: { ruhezeit: 11, maxFolge: 6 },
  personen: [person("m0", "mitarbeiter", "e1"), person("p1", "planer", "ALLE"), person("l1", "leitung", "ALLE")],
  abweichungen: {}, abwesenheiten: [], erfassung: {}, einstempeln: {}, anfragen: [], nachrichten: [], bestaetigungen: [],
}] });

async function neuerRaum() {
  RAUM = `modul-konti-${++raumNr}`;
  await B.bestandSchreiben(laden(), RAUM, bestand(), { durch: "Prüfung" });
  for (const [k, r] of Object.entries(ROLLEN)) {
    TOKEN[k] = (await sitzungAnlegen({ bestand: RAUM, name: `V N${r.person}`, rolle: r.rolle, person: r.person, betrieb: 0,
      mandantId: "m1", einheit: null }, 2 * 3600 * 1000)).token;
  }
}
const gespeichert = async () => (await B.bestandLesen(laden(), RAUM)).bestand.mandanten[0];
const put = async (k, aendern) => {
  const g = await anfrage("/api/bestand", { token: TOKEN[k] });
  const b = kopie(g.bestand); aendern(b.mandanten[0]);
  return anfrage("/api/bestand", { methode: "PUT", token: TOKEN[k], rumpf: { bestand: b, etag: g.etag } });
};

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-modul-konti-"));
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

describe("Regelwerte der Kontimodelle über den Serverweg", { timeout: 120000 }, () => {
  it("Leitung speichert Sollzeit und Freischichtdauer: 200, Server stempelt; Protokoll nur als Anzahl", async () => {
    await neuerRaum();
    const r = await put("LT", (m) => { m.einstellungen.regelwerte = { [SOLL]: W(37.5), [FS]: W(7.5, { pruefstatus: "geprueft" }) }; });
    expect(r.status, JSON.stringify(r).slice(0, 200)).toBe(200);
    const rw = (await gespeichert()).einstellungen.regelwerte;
    expect(rw[SOLL]).toMatchObject({ wert: 37.5, geaendertVon: "l1", quelle: "Betriebsvereinbarung Konti" });
    expect(rw[FS]).toMatchObject({ pruefstatus: "geprueft", geprueftVon: "l1" });
    const z = (await S.spurLesen(1)).filter((x) => x.ausgang === "regelwert-geaendert");
    expect(z.map((x) => x.zusatz)).toEqual(["2 Regelwert(e)"]);
    expect(JSON.stringify(z)).not.toMatch(/37|Betriebsvereinbarung/);
  });
  it("Planung und Beschäftigte können sie nicht setzen", async () => {
    await neuerRaum();
    for (const k of ["PL", "MA"]) {
      const r = await put(k, (m) => { m.einstellungen.regelwerte = { [SOLL]: W(30) }; });
      expect([200, 403], k).toContain(r.status);
      expect((await gespeichert()).einstellungen.regelwerte, k).toBeUndefined();
    }
  });
  it("Formfehler und unbekannte Kennung: 422, nichts gespeichert", async () => {
    await neuerRaum();
    expect((await put("LT", (m) => { m.einstellungen.regelwerte = { [SOLL]: W(0) }; })).status).toBe(422);
    expect((await put("LT", (m) => { m.einstellungen.regelwerte = { [SOLL]: W(99) }; })).status).toBe(422);
    expect((await put("LT", (m) => { m.einstellungen.regelwerte = { "KONTI-ERFUNDEN-01": W(5) }; })).status).toBe(422);
    expect((await put("LT", (m) => { m.einstellungen.regelwerte = { [FS]: W(8, { pruefstatus: "geprueft", quelle: "" }) }; })).status).toBe(422);
    expect((await gespeichert()).einstellungen.regelwerte).toBeUndefined();
  });
  it("parallele Änderung der Einstellungen: die zweite Speicherung bekommt 409, nichts geht verloren", async () => {
    await neuerRaum();
    const a = await anfrage("/api/bestand", { token: TOKEN.LT });
    const b = await anfrage("/api/bestand", { token: TOKEN.PL });
    const ba = kopie(a.bestand); ba.mandanten[0].einstellungen.regelwerte = { [SOLL]: W(36) };
    expect((await anfrage("/api/bestand", { methode: "PUT", token: TOKEN.LT, rumpf: { bestand: ba, etag: a.etag } })).status).toBe(200);
    const bb = kopie(b.bestand); bb.mandanten[0].einstellungen.ruhezeit = 10;
    const r = await anfrage("/api/bestand", { methode: "PUT", token: TOKEN.PL, rumpf: { bestand: bb, etag: b.etag } });
    expect([403, 409], JSON.stringify(r).slice(0, 200)).toContain(r.status);
    expect((await gespeichert()).einstellungen.regelwerte[SOLL].wert).toBe(36);
  });
});
