/* ==========================================================================
   WP-I16 (Fehlerbehebung, Review #596 B-1) — die Bestätigung einer Änderung rückt den ETag nie vor

   Echter Browser-Speicher (src/speicher.js) gegen den echten Handler (fetch ist die Brücke). Zwischen dem PUT der Leitung und
   dem Lesen zur Bestätigung schreibt eine andere Rolle (Planung). Danach muss ein weiterer Voll-PUT mit dem alten Bestand der
   Leitung weiterhin als Konflikt (409) abgewiesen werden — kein stilles Überschreiben der fremden Änderung.
   ========================================================================== */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import * as SP from "../src/speicher.js";

const WIRT = "127.0.0.1:3000";
const RAUM = "wpi16etag";
let wurzel, laden, daten, kontoSchreiben, ablageSchluessel, B, nr = 0;
const CODE = {};

const person = (id, rolle) => ({ id, vorname: `V${id}`, nachname: `N${id}`, rolle, bereich: "e1", status: "aktiv",
  zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }] });
const ROLLEN = [["l1", "leitung"], ["p1", "planer"]];
const echtesFetch = globalThis.fetch;
let fremdToken = null;

const anfrage = async (pfad, opt = {}) => {
  nr += 1;
  const kopf = { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.18.${Math.floor(nr / 250)}.${nr % 250}`, ...(opt.headers || {}) };
  const a = await daten(new Request(`http://${WIRT}${pfad}`, { method: opt.method || "GET", headers: kopf, ...(opt.body ? { body: opt.body } : {}) }), {});
  return a;
};
const gespeichert = async () => (await B.bestandLesen(laden(), RAUM)).bestand.mandanten[0];

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-wpi16etag-"));
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
    CODE[id] = `WPK${c}-AAAA-${String(c).padStart(4, "0")}`;
    await kontoSchreiben(laden(), ablageSchluessel(CODE[id]), { name: id, bestand: RAUM, rolle, person: id, betrieb: 0, mandantId: "m-a",
      angelegt: "2026-01-01T00:00:00.000Z" });
  }
  /* Planung meldet sich über die Anfrage-Brücke an (nicht über SP: SP gehört der Leitung). */
  const a = await anfrage("/api/anmelden", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ zugangscode: CODE.p1 }) });
  fremdToken = (await a.json()).token;
  globalThis.fetch = (url, opt = {}) => {
    const h = { ...(opt.headers || {}) };
    return anfrage(String(url), { method: opt.method, headers: h, body: opt.body });
  };
  const d = await SP.anmelden(CODE.l1, false);
  expect(d.token).toBeTruthy();
}, 120000);
afterAll(async () => { globalThis.fetch = echtesFetch; await rm(wurzel, { recursive: true, force: true }); });

const schreibe = (bestand) => new Promise((ok) => {
  SP.schreib(bestand, { durch: "Leitung", sofort: true, onGespeichert: () => ok("gespeichert"), onKonflikt: () => ok("konflikt"), onFehler: () => ok("fehler") });
});

describe("liesZumVergleich", () => {
  it("fremde Schreibung zwischen PUT und Bestätigungs-Lesen: der ETag rückt nicht vor, der nächste Voll-PUT mit altem Bestand bleibt 409", async () => {
    const r = await SP.lies();                                   // Leitung liest (ETag E0)
    const b0 = JSON.parse(JSON.stringify(r.bestand));
    const b1 = JSON.parse(JSON.stringify(b0));
    b1.mandanten[0].einstellungen = { kiSteuerung: { betriebsratFrage: { antwort: "nein" } } };
    expect(await schreibe(b1)).toBe("gespeichert");               // PUT#1 (ETag E1)
    /* Planung schreibt dazwischen (E2). */
    const g = await anfrage("/api/bestand", { headers: { authorization: `Bearer ${fremdToken}` } });
    const gd = await g.json();
    const fremd = JSON.parse(JSON.stringify(gd.bestand));
    fremd.mandanten[0].personen.find((p) => p.id === "p1").nachname = "Fremd";
    const f = await anfrage("/api/bestand", { method: "PUT", headers: { authorization: `Bearer ${fremdToken}`, "content-type": "application/json" },
      body: JSON.stringify({ bestand: fremd, etag: gd.etag, durch: "Planung" }) });
    expect(f.status).toBe(200);
    /* Bestätigungs-Lesen: liefert den Serverstand, ändert aber den ETag der Leitung nicht. */
    const gelesen = await SP.liesZumVergleich();
    expect(gelesen.mandanten[0].personen.find((p) => p.id === "p1").nachname).toBe("Fremd");
    /* PUT#2 der Leitung mit ihrem alten Bestand: Konflikt, die fremde Änderung bleibt. */
    const b2 = JSON.parse(JSON.stringify(b1));
    b2.mandanten[0].name = "Ueberschrieben";
    expect(await schreibe(b2)).toBe("konflikt");
    const m = await gespeichert();
    expect(m.personen.find((p) => p.id === "p1").nachname).toBe("Fremd");
    expect(m.name).toBe("A");
  });
  it("wirft bei Lesefehler (nie eine Bestätigung)", async () => {
    const vorher = globalThis.fetch;
    globalThis.fetch = () => Promise.reject(new Error("offline"));
    try { await expect(SP.liesZumVergleich()).rejects.toThrow(); } finally { globalThis.fetch = vorher; }
  });
});
