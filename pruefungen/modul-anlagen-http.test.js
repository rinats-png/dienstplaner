/* ==========================================================================
   MODUL ANLAGEN — Serverweg über HTTP (WP-19.10)

   Prüft am echten Handler (server/funktionen/daten.mjs), nicht nur an den
   reinen Funktionen:
     - Formfehler einer Anlage → 422 (nicht 403), nichts gespeichert,
     - fehlende Berechtigung → keine Änderung der Anlage (Beschäftigte),
     - gültige Änderung durch die Planung → 200, gespeichert,
     - parallele Bearbeitung des Kalenders → 409 mit aktuellem Stand,
     - Betriebsprotokoll: „anlage-geaendert“ nur mit Anzahlen, ohne Namen
       und ohne Person|Tag.
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
  const kopf = { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.19.${Math.floor(nr / 250) % 250}.${nr % 250}` };
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
const PRESSE = { id: "bm1", art: "anlage", name: "Geheimpresse Alpha", personId: null, mindestBesetzung: { F: 2 },
  laufzeit: { wochentage: [true, true, true, true, true, false, false] },
  grundlage: { art: "gefaehrdungsbeurteilung", bezug: "GB 7" } };
const KRAN = { id: "bm2", art: "anlage", name: "Kran", personId: null, mindestBesetzung: { F: 1 }, laufzeit: { wochentage: new Array(7).fill(true) } };

const bestand = () => ({ version: 9, mandanten: [{
  id: "m1", name: "Haus", status: "aktiv", pakete: ["industrie"], einheiten: [{ id: "e1", name: "E1", versatzTage: 0 }],
  dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00", pause: 30 }], qualifikationen: [],
  einstellungen: { ruhezeit: 11, maxFolge: 6 }, betriebsmittel: [PRESSE, KRAN],
  personen: [person("m0", "mitarbeiter", "e1"), person("p1", "planer", "ALLE"), person("l1", "leitung", "ALLE")],
  abweichungen: {}, abwesenheiten: [], erfassung: {}, einstempeln: {}, anfragen: [], nachrichten: [], bestaetigungen: [],
}] });

async function neuerRaum() {
  RAUM = `modul-anlagen-${++raumNr}`;
  await B.bestandSchreiben(laden(), RAUM, bestand(), { durch: "Prüfung" });
  for (const [k, r] of Object.entries(ROLLEN)) {
    TOKEN[k] = (await sitzungAnlegen({ bestand: RAUM, name: `V N${r.person}`, rolle: r.rolle, person: r.person, betrieb: 0,
      mandantId: "m1", einheit: null }, 2 * 3600 * 1000)).token;
  }
}
const gespeichert = async () => (await B.bestandLesen(laden(), RAUM)).bestand.mandanten[0];

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-modul-anlagen-"));
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

describe("Anlagen über den Serverweg", { timeout: 120000 }, () => {
  it("Formfehler: 422 mit Grund, nichts gespeichert; Planung und Leitung gleich", async () => {
    for (const k of ["PL", "LT"]) {
      await neuerRaum();
      const g = await anfrage("/api/bestand", { token: TOKEN[k] });
      const b = kopie(g.bestand);
      b.mandanten[0].betriebsmittel[0].grundlage = { art: "gesetz", bezug: "x" };
      const r = await anfrage("/api/bestand", { methode: "PUT", token: TOKEN[k], rumpf: { bestand: b, etag: g.etag } });
      expect(r.status, `${k}: ${JSON.stringify(r).slice(0, 200)}`).toBe(422);
      expect(r.text).toMatch(/Grundlage/);
      expect((await gespeichert()).betriebsmittel[0].grundlage).toEqual(PRESSE.grundlage);
    }
  });
  it("Datum der Ausnahme, das keinen Kalendertag meint (30. Februar): 422", async () => {
    await neuerRaum();
    const g = await anfrage("/api/bestand", { token: TOKEN.PL });
    const b = kopie(g.bestand);
    b.mandanten[0].betriebsmittel[0].laufzeit.ausnahmen = [{ datum: "2026-02-30", laeuft: false }];
    expect((await anfrage("/api/bestand", { methode: "PUT", token: TOKEN.PL, rumpf: { bestand: b, etag: g.etag } })).status).toBe(422);
  });
  it("Beschäftigte sehen die Anlage ohne Bedarf und können sie nicht verändern", async () => {
    await neuerRaum();
    const g = await anfrage("/api/bestand", { token: TOKEN.MA });
    const a = g.bestand.mandanten[0].betriebsmittel.find((x) => x.id === "bm1");
    expect(a.name).toBe("Geheimpresse Alpha");
    for (const f of ["mindestBesetzung", "laufzeit", "grundlage"]) expect(a).not.toHaveProperty(f);
    const b = kopie(g.bestand);
    b.mandanten[0].betriebsmittel[0].name = "Hacker";
    const r = await anfrage("/api/bestand", { methode: "PUT", token: TOKEN.MA, rumpf: { bestand: b, etag: g.etag } });
    expect([200, 403]).toContain(r.status);
    const s = (await gespeichert()).betriebsmittel[0];
    expect(s).toMatchObject({ name: "Geheimpresse Alpha", mindestBesetzung: { F: 2 }, grundlage: PRESSE.grundlage });
  });
  it("gültige Änderung der Planung: 200, gespeichert, im Betriebsprotokoll nur als Anzahl", async () => {
    await neuerRaum();
    const g = await anfrage("/api/bestand", { token: TOKEN.PL });
    const b = kopie(g.bestand);
    b.mandanten[0].betriebsmittel[0].mindestBesetzung = { F: 3 };
    b.mandanten[0].betriebsmittel[0].laufzeit.ausnahmen = [{ datum: "2026-12-24", laeuft: false }];
    const r = await anfrage("/api/bestand", { methode: "PUT", token: TOKEN.PL, rumpf: { bestand: b, etag: g.etag } });
    expect(r.status, JSON.stringify(r).slice(0, 200)).toBe(200);
    expect((await gespeichert()).betriebsmittel[0].mindestBesetzung).toEqual({ F: 3 });
    const zeilen = (await S.spurLesen(1)).filter((z) => z.ausgang === "anlage-geaendert");
    expect(zeilen.length).toBe(1);
    expect(zeilen[0].zusatz).toBe("1 Anlage(n): 1 geändert, 0 neu, 0 entfernt");
    const alles = JSON.stringify(zeilen);
    expect(alles).not.toMatch(/Geheimpresse|Kran|2026-12-24|\|/);
  });
  it("abgewiesene Speicherung steht im Protokoll, ohne dass die Anlage geändert wurde", async () => {
    await neuerRaum();
    const g = await anfrage("/api/bestand", { token: TOKEN.PL });
    const b = kopie(g.bestand);
    b.mandanten[0].betriebsmittel[1].mindestBesetzung = { F: -5 };
    expect((await anfrage("/api/bestand", { methode: "PUT", token: TOKEN.PL, rumpf: { bestand: b, etag: g.etag } })).status).toBe(422);
    const zeilen = (await S.spurLesen(1)).filter((z) => z.ausgang === "abgewiesen" && /Kran/.test(z.zusatz || ""));
    expect(zeilen.length).toBeGreaterThan(0);
    expect((await gespeichert()).betriebsmittel[1].mindestBesetzung).toEqual({ F: 1 });
  });
  it("parallele Bearbeitung der Anlagen: die zweite Speicherung bekommt 409 mit dem aktuellen Stand, nichts geht verloren", async () => {
    await neuerRaum();
    const a = await anfrage("/api/bestand", { token: TOKEN.PL });
    const bl = await anfrage("/api/bestand", { token: TOKEN.LT });
    const ba = kopie(a.bestand); ba.mandanten[0].betriebsmittel[0].mindestBesetzung = { F: 4 };
    expect((await anfrage("/api/bestand", { methode: "PUT", token: TOKEN.PL, rumpf: { bestand: ba, etag: a.etag } })).status).toBe(200);
    const bb = kopie(bl.bestand); bb.mandanten[0].betriebsmittel[0].laufzeit.wochentage = new Array(7).fill(true);
    const r = await anfrage("/api/bestand", { methode: "PUT", token: TOKEN.LT, rumpf: { bestand: bb, etag: bl.etag } });
    expect(r.status, JSON.stringify(r).slice(0, 200)).toBe(409);
    expect(r.bestand).toBeTruthy();
    expect((await gespeichert()).betriebsmittel[0].mindestBesetzung).toEqual({ F: 4 });
  });
});
