/* ==========================================================================
   GEO-SPEZIFIKATIONSRESTE ÜBER DEN ECHTEN HANDLER (WP-29)

   - Stempel ohne Position: Der Grund vom Gerät (keine_freigabe, timeout,
     nicht_verfuegbar) wird als geoStart.grund gespeichert — nur aus der Liste.
     Der Stempel selbst wird in jedem Fall gespeichert (E3). Keine Rohkoordinate
     in Antwort oder Ablage.
   - Schreibweg Standorte/Einsatzorte: neue Felder (koordinatenQuelle,
     koordinatenGeprueftAm, art, aktiv) werden geprüft: 422 mit Klartext.
   - Ein inaktiver Einsatzort gibt einsatzort_ungueltig.
   ========================================================================== */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const WIRT = "127.0.0.1:3000";
const RAUM = "wp29raum";
const KUNDE = { lat: 51.2345678, lon: 9.8765432 };
let wurzel, laden, daten, kontoSchreiben, ablageSchluessel, B, Z, HEUTE;
let nr = 0;
const T = {};

const anfrage = async (pfad, { methode = "POST", rumpf, token } = {}) => {
  nr += 1;
  const kopf = { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.29.${Math.floor(nr / 250)}.${nr % 250}` };
  if (methode !== "GET") kopf["content-type"] = "application/json";
  if (token) kopf.authorization = `Bearer ${token}`;
  const a = await daten(new Request(`http://${WIRT}${pfad}`, { method: methode, headers: kopf,
    ...(methode === "GET" ? {} : { body: JSON.stringify(rumpf || {}) }) }), {});
  const text = await a.text();
  let d = {}; try { d = JSON.parse(text); } catch { /* leer */ }
  return { status: a.status, roh: text, ...d };
};
const stempeln = (t, rumpf) => anfrage("/api/stempeln", { token: t, rumpf: { datum: HEUTE, ...rumpf } });
const lies = (t) => anfrage("/api/bestand", { methode: "GET", token: t });
const gespeichert = async () => (await B.bestandLesen(laden(), RAUM)).bestand.mandanten[0];
const person = (id, rolle, extra = {}) => ({ id, vorname: `V${id}`, nachname: `N${id}`, rolle, bereich: "e1", status: "aktiv",
  zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }], ...extra });
const MA = ["g1", "g2", "g3", "g4", "g5", "g6"];

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-wp29-"));
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
  Z = await import("../server/lib/zeiterfassung.mjs");
  HEUTE = Z.heuteBerlin();
  await B.bestandSchreiben(laden(), RAUM, { version: 9, mandanten: [{
    id: "m-a", name: "A", status: "aktiv", einstellungen: { geoPruefung: true },
    einheiten: [{ id: "e1", standortId: "st1" }],
    standorte: [{ id: "st1", name: "Zentrale", bundesland: "HE", lat: 50, lon: 8, radius: 200 }],
    einsatzorte: [{ id: "es1", name: "Kunde Nord", ...KUNDE, radius: 100 }, { id: "es2", name: "Kunde Süd", ...KUNDE, radius: 100, aktiv: false }],
    dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00" },
      { id: "E", name: "Kundentermin", start: "08:00", ende: "16:00", ortModus: "einsatzort", einsatzortId: "es1" },
      { id: "I", name: "Inaktiv", start: "08:00", ende: "16:00", ortModus: "einsatzort", einsatzortId: "es2" }],
    personen: [person("l1", "leitung", { bereich: "ALLE" }), ...MA.map((i) => person(i, "mitarbeiter"))],
    abweichungen: { [`g1|${HEUTE}`]: "F", [`g2|${HEUTE}`]: "F", [`g3|${HEUTE}`]: "F", [`g4|${HEUTE}`]: "F", [`g5|${HEUTE}`]: "I", [`g6|${HEUTE}`]: "F" },
    einstempeln: {}, erfassung: {}, anfragen: [], notrufe: [], nachrichten: [], abwesenheiten: [],
  }] }, { durch: "Pruefung" });
  let c = 0;
  for (const [id, rolle] of [["l1", "leitung"], ...MA.map((i) => [i, "mitarbeiter"])]) {
    c += 1;
    const code = `WPY${c}-AAAA-${String(c).padStart(4, "0")}`;
    await kontoSchreiben(laden(), ablageSchluessel(code), { name: id, bestand: RAUM, rolle, person: id, betrieb: 0, mandantId: "m-a",
      angelegt: "2026-01-01T00:00:00.000Z" });
    T[id] = (await anfrage("/api/anmelden", { rumpf: { zugangscode: code } })).token;
    expect(T[id], id).toBeTruthy();
  }
}, 120000);
afterAll(async () => { await rm(wurzel, { recursive: true, force: true }); });

describe("Stempel ohne Position: Grund vom Gerät", () => {
  const geoVon = async (id) => (await gespeichert()).einstempeln[`${id}|${HEUTE}`].geoStart;
  it("keine_freigabe, timeout, nicht_verfuegbar werden gespeichert; der Stempel steht in jedem Fall", async () => {
    for (const [id, g] of [["g1", "keine_freigabe"], ["g2", "timeout"], ["g3", "nicht_verfuegbar"]]) {
      const w = await stempeln(T[id], { art: "start", lat: null, lon: null, accuracy: null, positionGrund: g });
      expect(w.status, w.roh).toBe(200);
      const geo = await geoVon(id);
      expect([geo.status, geo.grund], g).toEqual(["NICHT_BEWERTBAR", g]);
      expect((await gespeichert()).einstempeln[`${id}|${HEUTE}`].start).toMatch(/^\d\d:\d\d$/);
    }
  });
  it("ein Fremdtext als Grund wird nie gespeichert (keine_position)", async () => {
    const w = await stempeln(T.g4, { art: "start", lat: null, lon: null, accuracy: null, positionGrund: "Maxi Muster <script>" });
    expect(w.status, w.roh).toBe(200);
    expect((await geoVon("g4")).grund).toBe("keine_position");
    expect(JSON.stringify(await gespeichert())).not.toContain("Maxi Muster");
  });
  it("mit Position zählt der Grund nicht; die Antwort trägt keine Koordinate", async () => {
    const w = await stempeln(T.g6, { art: "start", lat: 50.987654321, lon: 8.123456789, accuracy: 12, positionGrund: "timeout" });
    expect(w.status, w.roh).toBe(200);
    expect((await geoVon("g6")).grund).not.toBe("timeout");
    expect(w.roh + JSON.stringify(await gespeichert())).not.toMatch(/50\.98765|8\.12345/);
  });
});

describe("Inaktiver Einsatzort", () => {
  it("Stempel am Einsatzort einer inaktiven Stelle: einsatzort_ungueltig, kein Rückfall, gespeichert", async () => {
    const w = await stempeln(T.g5, { art: "start", lat: KUNDE.lat, lon: KUNDE.lon, accuracy: 10 });
    expect(w.status, w.roh).toBe(200);
    const geo = (await gespeichert()).einstempeln[`g5|${HEUTE}`].geoStart;
    expect([geo.status, geo.grund]).toEqual(["NICHT_BEWERTBAR", "einsatzort_ungueltig"]);
    expect(w.roh).not.toContain(String(KUNDE.lat));
  });
});

describe("Schreibweg: neue Felder werden geprüft", () => {
  const setze = async (liste, id, felder) => {
    const r = await lies(T.l1);
    const b = JSON.parse(JSON.stringify(r.bestand));
    b.mandanten[0][liste] = b.mandanten[0][liste].map((s) => (s.id === id ? { ...s, ...felder } : s));
    return anfrage("/api/bestand", { methode: "PUT", token: T.l1, rumpf: { bestand: b, etag: r.etag, durch: "Test" } });
  };
  it("Standort: ungültige Quelle oder Datum 422, nichts gespeichert; gültig gespeichert", async () => {
    for (const f of [{ koordinatenQuelle: "gps" }, { koordinatenGeprueftAm: "30.10.2026" }]) {
      const w = await setze("standorte", "st1", f);
      expect(w.status, JSON.stringify(f) + w.roh).toBe(422);
      expect((await gespeichert()).standorte[0].koordinatenQuelle).toBeUndefined();
    }
    const ok = await setze("standorte", "st1", { koordinatenQuelle: "geraet", koordinatenGeprueftAm: "2026-10-30" });
    expect(ok.status, ok.roh).toBe(200);
    expect((await gespeichert()).standorte[0]).toMatchObject({ koordinatenQuelle: "geraet", koordinatenGeprueftAm: "2026-10-30" });
  });
  it("Einsatzort: ungültige Art, aktiv als Text, ungültige Quelle: 422; gültig gespeichert", async () => {
    for (const f of [{ art: "arzt" }, { aktiv: "ja" }, { koordinatenQuelle: "gps" }]) {
      const w = await setze("einsatzorte", "es1", f);
      expect(w.status, JSON.stringify(f) + w.roh).toBe(422);
    }
    const ok = await setze("einsatzorte", "es1", { art: "baustelle", aktiv: true, koordinatenQuelle: "manuell" });
    expect(ok.status, ok.roh).toBe(200);
  });
});
