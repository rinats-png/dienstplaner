/* ==========================================================================
   STEMPELPRÜFUNG UND FACHPRÜFUNG ZUSAMMEN (WP-06 Nachtrag, B-N1)

   Beim Speichern laufen nacheinander (server/funktionen/daten.mjs, PUT):
   1. die Stempelprüfung (WP-06): Originale unveränderlich,
   2. die Zusammenführung (rechte.mjs, zusammenfuehren),
   3. stempelSichern: gespeicherte Stempel bleiben,
   4. die Fachprüfung (WP-22): Mutterschutz, Jugendschutz, Ruhezeiten ….

   Die offene Fachprüfung hängt per WeakMap (OFFENE_PRUEFUNG) am Objekt, das
   zusammenfuehren zurückgibt. stempelSichern baut ein neues Objekt — wer
   fachpruefungOffen erst danach fragt, bekommt null, und jede Sperre ist
   wirkungslos (Fund beim Merge, abnahme-a-b.test.js war rot). Dieser Test
   hält das fest, ausdrücklich bei einem Bestand MIT Stempeln und Ist-Zeiten:
   ein Verstoß gegen Mutterschutz oder Jugendschutz ergibt 403, nichts wird
   gespeichert — auch wenn Stempel im Bestand stehen und unverändert
   mitgeschickt werden.
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const WIRT = "127.0.0.1:3000";
let wurzel, laden, daten, B, Z, sitzungAnlegen, RAUM, MITTWOCH, GESTERN;
let raumNr = 0;
const kopie = (x) => JSON.parse(JSON.stringify(x));

let nr = 0;
async function anfrage(pfad, { methode = "GET", rumpf, token } = {}) {
  nr += 1;
  const kopf = { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.14.${Math.floor(nr / 250) % 250}.${nr % 250}` };
  if (methode !== "GET") kopf["content-type"] = "application/json";
  if (token) kopf.authorization = `Bearer ${token}`;
  const a = await daten(new Request(`http://${WIRT}${pfad}`, { method: methode, headers: kopf,
    ...(methode === "GET" ? {} : { body: JSON.stringify(rumpf || {}) }) }), {});
  let d = {}; try { d = await a.json(); } catch { /* leer */ }
  return { status: a.status, ...d };
}
const person = (id, rolle, einheit, extra = {}) => ({ id, vorname: "V", nachname: `N${id}`, rolle, bereich: einheit,
  status: "aktiv", geburtstag: "1980-01-01", zugehoerigkeit: [{ ab: "2020-01-01", einheitId: einheit }], ...extra });
const stempel = (start, ende) => ({ start, startAm: `${GESTERN}T05:00:00.000Z`, ortStart: "Ohne Standortfreigabe erfasst",
  innerhalbStart: null, geprueftStart: false, ende, endeAm: `${GESTERN}T13:00:00.000Z`, ortEnde: "Ohne Standortfreigabe erfasst",
  innerhalbEnde: null, geprueftEnde: false });

function bestand() {
  const geboren15 = (() => { const d = new Date(`${MITTWOCH}T00:00:00Z`); d.setUTCFullYear(d.getUTCFullYear() - 15); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 10); })();
  /* Stempel und Ist-Zeiten für mehrere Personen — die Leitung "zugleich Stempel im Bestand". */
  const einstempeln = {}, erfassung = {};
  for (const id of ["m0", "mu", "j15", "p1", "l1"]) {
    einstempeln[`${id}|${GESTERN}`] = stempel("06:02", "14:01");
    erfassung[`${id}|${GESTERN}`] = { start: "06:02", ende: "14:01", bestaetigt: true, grund: "" };
  }
  return { version: 9, mandanten: [{
    id: "m1", name: "Stempelhaus", status: "aktiv",
    einheiten: [{ id: "e1", name: "WB 1", versatzTage: 0 }],
    dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00", pause: 30 },
      { id: "B", name: "bis 22", start: "14:00", ende: "22:00", pause: 30 },
      { id: "N", name: "Nacht", start: "22:00", ende: "06:00", pause: 30 }],
    qualifikationen: [], einstellungen: { ruhezeit: 11, maxFolge: 6 },
    personen: [
      person("m0", "mitarbeiter", "e1"),
      person("mu", "mitarbeiter", "e1", { mutterschutz: true, geburtstag: "1990-01-01" }),
      person("j15", "mitarbeiter", "e1", { geburtstag: geboren15 }),
      person("p1", "planer", "ALLE"), person("l1", "leitung", "ALLE")],
    abweichungen: { [`m0|${GESTERN}`]: "F", [`mu|${GESTERN}`]: "F", [`j15|${GESTERN}`]: "F", [`p1|${GESTERN}`]: "F", [`l1|${GESTERN}`]: "F" },
    abwesenheiten: [], erfassung, einstempeln, anfragen: [], nachrichten: [],
  }] };
}

const ROLLEN = { PL: { rolle: "planer", person: "p1" }, LT: { rolle: "leitung", person: "l1" } };
const TOKEN = {};
async function neuerRaum() {
  RAUM = `stempel-fach-${++raumNr}`;
  await B.bestandSchreiben(laden(), RAUM, bestand(), { durch: "Pruefung" });
  for (const [k, r] of Object.entries(ROLLEN)) {
    TOKEN[k] = (await sitzungAnlegen({ bestand: RAUM, name: `V N${r.person}`, rolle: r.rolle, person: r.person, betrieb: 0,
      mandantId: "m1", einheit: null }, 2 * 3600 * 1000)).token;
  }
}
const gespeichert = async () => (await B.bestandLesen(laden(), RAUM)).bestand.mandanten[0];
async function schreiben(k, aendern) {
  const g = await anfrage("/api/bestand", { token: TOKEN[k] });
  expect(g.status, `${k} GET`).toBe(200);
  const b = kopie(g.bestand);
  aendern(b.mandanten[0]);
  return anfrage("/api/bestand", { methode: "PUT", token: TOKEN[k], rumpf: { bestand: b, etag: g.etag } });
}

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-stempel-fach-"));
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
  const HEUTE = Z.heuteBerlin();
  GESTERN = Z.tagePlus(HEUTE, -1);
  for (let n = 10; n < 18; n++) if (new Date(`${Z.tagePlus(HEUTE, n)}T12:00:00Z`).getUTCDay() === 3) { MITTWOCH = Z.tagePlus(HEUTE, n); break; }
}, 60000);
afterAll(async () => { if (wurzel) await rm(wurzel, { recursive: true, force: true }); });

describe("Fachprüfung bleibt wirksam, wenn der Bestand Stempel enthält", { timeout: 120000 }, () => {
  for (const k of ["PL", "LT"]) {
    it(`${k}: Mutterschutz — Dienst bis 22 Uhr ohne Einwilligung ⇒ 403, nichts gespeichert (Stempel im Bestand)`, async () => {
      await neuerRaum();
      const vorher = await gespeichert();
      expect(Object.keys(vorher.einstempeln)).toHaveLength(5);
      const r = await schreiben(k, (x) => { x.abweichungen[`mu|${MITTWOCH}`] = "B"; });
      expect(r.status, JSON.stringify(r).slice(0, 300)).toBe(403);
      const nachher = await gespeichert();
      expect(nachher.abweichungen[`mu|${MITTWOCH}`]).toBeUndefined();
      expect(nachher.einstempeln).toEqual(vorher.einstempeln);
      expect(nachher.erfassung).toEqual(vorher.erfassung);
    });
    it(`${k}: Jugendschutz — 15-Jährige im Spätdienst bis 22 Uhr ⇒ 403, nichts gespeichert (Stempel im Bestand)`, async () => {
      await neuerRaum();
      const vorher = await gespeichert();
      const r = await schreiben(k, (x) => { x.abweichungen[`j15|${MITTWOCH}`] = "B"; });
      expect(r.status, JSON.stringify(r).slice(0, 300)).toBe(403);
      const nachher = await gespeichert();
      expect(nachher.abweichungen[`j15|${MITTWOCH}`]).toBeUndefined();
      expect(nachher.einstempeln).toEqual(vorher.einstempeln);
    });
  }
  it("Gegenprobe: eine unbedenkliche Änderung mit denselben Stempeln im Bestand ⇒ 200, Stempel unverändert", async () => {
    await neuerRaum();
    const vorher = await gespeichert();
    const r = await schreiben("PL", (x) => { x.abweichungen[`m0|${MITTWOCH}`] = "F"; });
    expect(r.status, JSON.stringify(r).slice(0, 300)).toBe(200);
    const nachher = await gespeichert();
    expect(nachher.abweichungen[`m0|${MITTWOCH}`]).toBe("F");
    expect(nachher.einstempeln).toEqual(vorher.einstempeln);
  });
  it("beides in einer Übermittlung: Verstoß gegen den Jugendschutz UND veränderter Stempel ⇒ 403 (die Stempelprüfung greift zuerst), nichts gespeichert", async () => {
    await neuerRaum();
    const vorher = await gespeichert();
    const r = await schreiben("LT", (x) => {
      x.abweichungen[`j15|${MITTWOCH}`] = "B";
      x.einstempeln[`m0|${GESTERN}`] = { ...x.einstempeln[`m0|${GESTERN}`], start: "05:00" };
    });
    expect(r.status).toBe(403);
    const nachher = await gespeichert();
    expect(nachher.einstempeln).toEqual(vorher.einstempeln);
    expect(nachher.abweichungen[`j15|${MITTWOCH}`]).toBeUndefined();
  });
  it("die Reihenfolge steht im Quelltext: fachpruefungOffen vor stempelSichern", async () => {
    const { readFile } = await import("node:fs/promises");
    const src = await readFile(new URL("../server/funktionen/daten.mjs", import.meta.url), "utf8");
    const i = src.indexOf("const offen = fachpruefungOffen(zuSchreiben);");
    const j = src.indexOf("stempelSichern(altNachId");
    expect(i).toBeGreaterThan(-1);
    expect(j).toBeGreaterThan(i);
  });
});
