/* ==========================================================================
   WP-I16 Teil 1 — Betriebssteuerung über den ECHTEN Handler (PUT /api/bestand)

   Die gelesene Sicht jeder Rolle wird mit einer Änderung zurückgeschickt, wie es die Oberfläche tut:
   - Leitung schaltet; Planung, Beschäftigte, Schichtverantwortung nie
   - Betriebsrat setzt und hebt die Pause auf — und sonst nichts; ohne Pausenänderung bleibt es bei 403
   - die Leitung hebt die Pause nicht auf; keine neue Route (nur PUT /api/bestand)
   ========================================================================== */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const WIRT = "127.0.0.1:3000";
const RAUM = "wpi16raum";
let wurzel, laden, daten, kontoSchreiben, ablageSchluessel, B, nr = 0;
const T = {};
const AN = { prozess: "an" };

const anfrage = async (pfad, { methode = "POST", rumpf, token } = {}) => {
  nr += 1;
  const kopf = { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.16.${Math.floor(nr / 250)}.${nr % 250}` };
  if (methode !== "GET") kopf["content-type"] = "application/json";
  if (token) kopf.authorization = `Bearer ${token}`;
  const a = await daten(new Request(`http://${WIRT}${pfad}`, { method: methode, headers: kopf,
    ...(methode === "GET" ? {} : { body: JSON.stringify(rumpf || {}) }) }), {});
  const text = await a.text();
  let d = {}; try { d = JSON.parse(text); } catch { /* leer */ }
  return { status: a.status, roh: text, ...d };
};
const lies = (t) => anfrage("/api/bestand", { methode: "GET", token: t });
const gespeichert = async () => (await B.bestandLesen(laden(), RAUM)).bestand.mandanten[0];
const person = (id, rolle) => ({ id, vorname: `V${id}`, nachname: `N${id}`, rolle, bereich: "e1", status: "aktiv",
  zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }] });
const ROLLEN = [["l1", "leitung"], ["p1", "planer"], ["s1", "subplaner"], ["a1", "mitarbeiter"], ["r1", "betriebsrat"]];

/** Liest die Sicht der Rolle, ändert den Betrieb darin und schickt sie zurück. */
async function schreibe(id, aendere) {
  const r = await lies(T[id]);
  expect(r.status, `${id} lesen`).toBe(200);
  const b = JSON.parse(JSON.stringify(r.bestand));
  aendere(b.mandanten[0]);
  return anfrage("/api/bestand", { methode: "PUT", token: T[id], rumpf: { bestand: b, etag: r.etag, durch: "Test" } });
}
const ki = (m) => (m.einstellungen || {}).kiSteuerung;
const setze = (k) => (m) => { m.einstellungen = { ...(m.einstellungen || {}), kiSteuerung: k }; };

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-wpi16-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
  const { getStore } = await import("../server/lib/ablage.mjs");
  laden = () => getStore({ name: "centric", consistency: "strong" });
  const schutz = await import("../server/lib/schutz.mjs");
  for (const art of Object.keys(schutz.GRENZEN)) schutz.GRENZEN[art] = { ...schutz.GRENZEN[art], versuche: 100000 };
  daten = (await import("../server/funktionen/daten.mjs")).default;
  ({ kontoSchreiben } = await import("../server/lib/konten.mjs"));
  ({ ablageSchluessel } = await import("../server/lib/codes.mjs"));
  B = await import("../server/lib/bestand.mjs");
  await B.bestandSchreiben(laden(), RAUM, { version: 9, mandanten: [{
    id: "m-a", name: "A", status: "aktiv", einstellungen: {},
    einheiten: [{ id: "e1" }], dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00" }],
    personen: ROLLEN.map(([id, rolle]) => person(id, rolle)),
    abweichungen: {}, einstempeln: {}, erfassung: {}, anfragen: [], notrufe: [], nachrichten: [], abwesenheiten: [],
  }] }, { durch: "Pruefung" });
  let c = 0;
  for (const [id, rolle] of ROLLEN) {
    c += 1;
    const code = `WPI${c}-AAAA-${String(c).padStart(4, "0")}`;
    await kontoSchreiben(laden(), ablageSchluessel(code), { name: id, bestand: RAUM, rolle, person: id, betrieb: 0, mandantId: "m-a",
      angelegt: "2026-01-01T00:00:00.000Z" });
    T[id] = (await anfrage("/api/anmelden", { rumpf: { zugangscode: code } })).token;
    expect(T[id], id).toBeTruthy();
  }
}, 120000);
afterAll(async () => { await rm(wurzel, { recursive: true, force: true }); });

describe("PUT /api/bestand: Steuerung je Rolle", () => {
  it("Planung, Schichtverantwortung, Beschäftigte, Betriebsrat: Hauptschalter, Funktion und Frage kommen nicht an", async () => {
    for (const id of ["p1", "s1", "a1", "r1"]) {
      for (const absicht of [{ betriebsratFrage: { antwort: "nein" } }, { funktionen: { F3: { an: true } } }, { betrieb: { an: true } }]) {
        await schreibe(id, setze(absicht));
        expect(ki(await gespeichert()), `${id} ${JSON.stringify(absicht)}`).toBeUndefined();
      }
    }
  });
  it("Leitung beantwortet die Frage, schaltet Hauptschalter und F3 ein; Stand und Protokoll stehen in der Ablage", async () => {
    const e = await schreibe("l1", setze({ betrieb: { an: true }, funktionen: { F3: { an: true } }, betriebsratFrage: { antwort: "nein" } }));
    expect(e.status, e.roh).toBe(200);
    const k = ki(await gespeichert());
    expect(k.betrieb.an).toBe(true);
    expect(k.funktionen.F3.an).toBe(true);
    expect(k.protokoll.length).toBe(3);
    const m = await gespeichert();
    const { intelligenceErlaubt } = await import("../server/lib/ki-steuerung.mjs");
    expect(intelligenceErlaubt(m, "F3", "leitung", AN)).toBe(true);
    expect(intelligenceErlaubt(m, "F3", "leitung", {})).toBe(false);
  });
  it("Leitung, Planung und Betriebsrat sehen den Stand (Betriebsrat ohne Personenkennung); Schichtverantwortung und Beschäftigte nicht", async () => {
    expect(ki((await lies(T.l1)).bestand.mandanten[0]).betrieb.an).toBe(true);
    expect(ki((await lies(T.p1)).bestand.mandanten[0]).betrieb.an).toBe(true);
    const br = ki((await lies(T.r1)).bestand.mandanten[0]);
    expect(br.betrieb.an).toBe(true);
    expect(JSON.stringify(br)).not.toMatch(/vonPerson|"l1"/);
    for (const id of ["s1", "a1"]) expect(ki((await lies(T[id])).bestand.mandanten[0]), id).toBeUndefined();
  });
  it("Planung ändert den Stand nicht (der gesendete Wert wird ignoriert)", async () => {
    await schreibe("p1", setze({ funktionen: { F3: { an: false } } }));
    expect(ki(await gespeichert()).funktionen.F3.an).toBe(true);
  });
  it("Betriebsrat: ohne Änderung der Pause bleibt es bei 403 (wie bisher)", async () => {
    const e = await schreibe("r1", (m) => { m.name = "Gekapert"; });
    expect(e.status).toBe(403);
    expect((await gespeichert()).name).toBe("A");
  });
  it("Betriebsrat setzt die Pause: sofort wirksam, nichts sonst ändert sich", async () => {
    const vorher = await gespeichert();
    const e = await schreibe("r1", (m) => { setze({ ...ki(m), pause: { aktiv: true } })(m); m.name = "Gekapert"; });
    expect(e.status, e.roh).toBe(200);
    const nachher = await gespeichert();
    expect(ki(nachher).pause).toMatchObject({ aktiv: true, vonRolle: "betriebsrat", vonPerson: "r1" });
    expect(nachher.name).toBe("A");
    expect({ ...nachher, einstellungen: null }).toEqual({ ...vorher, einstellungen: null });
    const { intelligenceErlaubt } = await import("../server/lib/ki-steuerung.mjs");
    for (const r of ["leitung", "planer", "mitarbeiter"]) expect(intelligenceErlaubt(nachher, "F3", r, AN), r).toBe(false);
  });
  it("Leitung hebt die Pause nicht auf — auch nicht mit anderen Änderungen zusammen", async () => {
    for (const absicht of [{ pause: { aktiv: false } }, { pause: { aktiv: false }, betrieb: { an: true } }]) {
      await schreibe("l1", (m) => setze({ ...ki(m), ...absicht })(m));
      expect(ki(await gespeichert()).pause.aktiv, JSON.stringify(absicht)).toBe(true);
    }
  });
  it("Betriebsrat hebt die Pause auf und fälscht dazu den Hauptschalter: die Pause gilt, der Hauptschalter bleibt; Funktion wieder erlaubt, Protokoll vollständig", async () => {
    const e = await schreibe("r1", (m) => setze({ ...ki(m), pause: { aktiv: false }, betrieb: { an: false } })(m));
    expect(e.status, e.roh).toBe(200);
    const m = await gespeichert();
    expect(ki(m).betrieb.an).toBe(true);
    const { intelligenceErlaubt } = await import("../server/lib/ki-steuerung.mjs");
    expect(ki(m).pause.aktiv).toBe(false);
    expect(intelligenceErlaubt(m, "F3", "leitung", AN)).toBe(true);
    expect(ki(m).protokoll.map((x) => x.art)).toEqual(["betrieb-an", "frage", "funktion-an", "pause-gesetzt", "pause-aufgehoben"]);
  });
  it("keine neue Route: /api/ki-steuerung und /ki/steuerung gibt es nicht", async () => {
    for (const p of ["/api/ki-steuerung", "/ki/steuerung"]) {
      const e = await anfrage(p, { methode: "PUT", token: T.r1, rumpf: { pause: { aktiv: true } } });
      expect([404, 405]).toContain(e.status);
    }
  });
});
