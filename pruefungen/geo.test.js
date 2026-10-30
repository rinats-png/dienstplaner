/* ==========================================================================
   GEO V1 — Standortprüfung beim Stempeln (P0 + P1)

   Eine Stelle für die Prüfung (server/lib/geo.mjs), drei Zustände mit
   Genauigkeit, gerundete Entfernung, Betriebsschalter (Vorgabe aus, schalten
   nur die Leitung), Kennzeichen START_FEHLT und UNGEPLANTER_DIENST, offener
   Vorgang über Mitternacht in der Oberfläche. Die Arbeitszeit wird in jedem
   Fall gespeichert.
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  geoUrteil, entfernungRunden, entfernungText, koordinateGueltig, radiusGueltig, abstandMeter, standortBundesland,
  INNERHALB, AUSSERHALB, NICHT_BEWERTBAR,
} from "../server/lib/geo.mjs";
import { stempelVorgang, positionHolen, geoAnzeige, POSITION_OPTIONEN, geoPruefungAn } from "../src/stempelvorgang.js";

/* Ein Punkt n Meter nördlich des Referenzorts (auf der Kugel mit R = 6 371 km exakt). */
const REF = { lat: 50, lon: 8 };
const M_JE_GRAD = (2 * Math.PI * 6371000) / 360;
const nord = (meter) => REF.lat + meter / M_JE_GRAD;

const betrieb = (st = {}, geo = true) => ({
  id: "m-a", einstellungen: { geoPruefung: geo },
  einheiten: [{ id: "e1", standortId: "st1" }, { id: "e2", standortId: "st2" }],
  standorte: [{ id: "st1", name: "Zentrale", bundesland: "HE", lat: REF.lat, lon: REF.lon, radius: 200, ...st },
    { id: "st2", name: "Außenstelle", land: "NI" }],
});
const PERSON = { id: "a1", zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }] };
const urteil = (messung, st, geo) => geoUrteil({ m: betrieb(st, geo), person: PERSON, datum: "2026-10-30", messung });

describe("geo.mjs: Standort und Referenzort", () => {
  it("keine Koordinate am Standort: nicht bewertbar — nie außerhalb", () => {
    const u = urteil({ lat: nord(5000), lon: REF.lon, accuracy: 5 }, { lat: undefined, lon: undefined });
    expect([u.geo.status, u.geo.grund, u.innerhalb]).toEqual([NICHT_BEWERTBAR, "keine_koordinate_am_referenzort", null]);
  });
  it("gültige Koordinate, innerhalb, außerhalb, genau auf dem Radius (d + a = r)", () => {
    expect(urteil({ lat: nord(50), lon: REF.lon, accuracy: 10 }).geo.status).toBe(INNERHALB);
    expect(urteil({ lat: nord(400), lon: REF.lon, accuracy: 10 }).geo.status).toBe(AUSSERHALB);
    expect(urteil({ lat: nord(190), lon: REF.lon, accuracy: 10 }).geo.status).toBe(INNERHALB);   // 190 + 10 = 200
    expect(urteil({ lat: nord(191), lon: REF.lon, accuracy: 10 }).geo.status).toBe(NICHT_BEWERTBAR);
  });
  it("ungültige Breite/Länge: nicht bewertbar — auch der Periodizitätstrick (+360°) gilt nicht als innerhalb", () => {
    for (const [lat, lon] of [[91, 8], [-91, 8], [50, 181], [50, -181], [NaN, 8], ["50", 8], [REF.lat + 360, REF.lon], [REF.lat, REF.lon + 360]]) {
      const u = urteil({ lat, lon, accuracy: 5 });
      expect(u.geo.status, `${lat}/${lon}`).toBe(NICHT_BEWERTBAR);
      expect(u.innerhalb).toBeNull();
    }
    expect(abstandMeter(REF.lat + 360, REF.lon, REF.lat, REF.lon)).toBe(0);   // darum die Bereichsprüfung
  });
  it("Radius 0, negativ, unter 25, über 5000: nicht bewertbar; fehlend: Vorgabe 200 m", () => {
    for (const radius of [0, -50, 24, 5001, NaN, "200"])
      expect(urteil({ lat: nord(10), lon: REF.lon, accuracy: 5 }, { radius }).geo.grund, String(radius)).toBe("radius_ungueltig");
    expect(urteil({ lat: nord(180), lon: REF.lon, accuracy: 5 }, { radius: undefined }).geo.status).toBe(INNERHALB);
    expect(urteil({ lat: nord(300), lon: REF.lon, accuracy: 5 }, { radius: undefined }).geo.status).toBe(AUSSERHALB);
    expect([radiusGueltig(25), radiusGueltig(5000), koordinateGueltig(-90, 180)]).toEqual([true, true, true]);
  });
  it("Referenzort folgt der Einheit am Tag; ohne Standort der Einheit: nicht bewertbar", () => {
    const p = { id: "a1", zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }, { ab: "2026-10-15", einheitId: "e2" }] };
    const vorher = geoUrteil({ m: betrieb(), person: p, datum: "2026-10-14", messung: { lat: nord(10), lon: REF.lon, accuracy: 5 } });
    const nachher = geoUrteil({ m: betrieb(), person: p, datum: "2026-10-16", messung: { lat: nord(10), lon: REF.lon, accuracy: 5 } });
    expect(vorher.geo.referenz).toEqual({ art: "standort", id: "st1", name: "Zentrale" });
    expect([nachher.geo.status, nachher.geo.grund, nachher.geo.referenz.id]).toEqual([NICHT_BEWERTBAR, "keine_koordinate_am_referenzort", "st2"]);
    expect(standortBundesland({ land: "NI" })).toBe("NI");
    expect(standortBundesland({ bundesland: "HE", land: "NI" })).toBe("HE");
  });
});

describe("geo.mjs: Genauigkeit", () => {
  it("sehr genau, 100 m ohne Warnung, über 100 m mit Warnung, über 1000 m zwingend nicht bewertbar", () => {
    expect(urteil({ lat: nord(0), lon: REF.lon, accuracy: 3 }).geo).toMatchObject({ status: INNERHALB, genauigkeitM: 3, genauigkeitWarnung: false });
    expect(urteil({ lat: nord(0), lon: REF.lon, accuracy: 100 }).geo).toMatchObject({ status: INNERHALB, genauigkeitWarnung: false });
    expect(urteil({ lat: nord(0), lon: REF.lon, accuracy: 101 }).geo).toMatchObject({ status: INNERHALB, genauigkeitWarnung: true });
    expect(urteil({ lat: nord(5000), lon: REF.lon, accuracy: 1000 }, { radius: 5000 }).geo.status).toBe(NICHT_BEWERTBAR);
    expect(urteil({ lat: nord(0), lon: REF.lon, accuracy: 1000 }, { radius: 5000 }).geo.status).toBe(INNERHALB);
    expect(urteil({ lat: nord(0), lon: REF.lon, accuracy: 1001 }, { radius: 5000 }).geo).toMatchObject({ status: NICHT_BEWERTBAR, grund: "genauigkeit_zu_schlecht" });
  });
  it("Grenzfall: Messkreis schneidet den Umkreis — nicht bewertbar statt außerhalb", () => {
    const u = urteil({ lat: nord(250), lon: REF.lon, accuracy: 80 });   // 250 − 80 = 170 ≤ 200 < 250 + 80
    expect([u.geo.status, u.geo.grund]).toEqual([NICHT_BEWERTBAR, "genauigkeit_zu_schlecht"]);
    expect(urteil({ lat: nord(300), lon: REF.lon, accuracy: 80 }).geo.status).toBe(AUSSERHALB);   // 300 − 80 > 200
  });
  it("fehlende oder unsinnige Genauigkeit: nicht bewertbar", () => {
    for (const accuracy of [undefined, null, 0, -5, NaN, "10", 200000])
      expect(urteil({ lat: nord(0), lon: REF.lon, accuracy }).geo.grund, String(accuracy)).toBe("ungueltige_genauigkeit");
  });
});

describe("geo.mjs: Schalter, fehlende Position, Datenminimierung", () => {
  it("Schalter aus: keine Prüfung, auch mit Koordinate (pruefung_aus)", () => {
    const u = urteil({ lat: nord(0), lon: REF.lon, accuracy: 5 }, {}, false);
    expect([u.geo.status, u.geo.grund, u.geprueft, u.text]).toEqual([NICHT_BEWERTBAR, "pruefung_aus", false, "Ohne Standortprüfung erfasst"]);
    expect(geoUrteil({ m: { ...betrieb(), einstellungen: {} }, person: PERSON, datum: "2026-10-30", messung: { lat: 50, lon: 8, accuracy: 5 } }).geo.grund).toBe("pruefung_aus");
  });
  it("ohne Position (abgelehnt, nicht verfügbar): nicht bewertbar", () => {
    expect(urteil(null).geo.grund).toBe("keine_position");
    expect(urteil({ lat: null, lon: null, accuracy: null }).geo.grund).toBe("keine_position");
  });
  it("Entfernung gerundet: unter 1 km auf 50 m, 1–5 km auf 100 m, darüber „>5 km\"", () => {
    const tab = [[0, "0"], [24, "0"], [26, "50"], [974, "950"], [976, "1000"], [1049, "1000"], [1050, "1100"], [4999, "5000"], [5000, "5000"], [5001, ">5 km"], [80000, ">5 km"]];
    for (const [d, r] of tab) expect(entfernungRunden(d), String(d)).toBe(r);
    expect([entfernungText("350"), entfernungText("1200"), entfernungText(">5 km")]).toEqual(["ca. 350 m", "ca. 1,2 km", "mehr als 5 km"]);
  });
  it("Urteil und Text tragen keine exakte Entfernung und keine Koordinate", () => {
    const u = urteil({ lat: nord(437), lon: REF.lon, accuracy: 12 });
    expect(u.geo.entfernungGerundet).toBe("450");
    expect(u.text).toBe("Abweichend, ca. 450 m entfernt");
    expect(JSON.stringify(u)).not.toMatch(/437/);
    expect(JSON.stringify(u)).not.toContain(String(nord(437)).slice(0, 8));
    expect(urteil({ lat: nord(37), lon: REF.lon, accuracy: 5 }).text).toBe("Am Standort");
  });
});

describe("Oberfläche: Position, offener Vorgang, Befund", () => {
  it("Positionsabfrage nur bei eingeschalteter Prüfung, mit Genauigkeit und frischer Messung", () => {
    const aufrufe = [];
    const geo = { getCurrentPosition: (ok, _f, opt) => { aufrufe.push(opt); ok({ coords: { latitude: 50.1, longitude: 8.6, accuracy: 14 } }); } };
    let erg = "unberührt";
    positionHolen(false, (k) => { erg = k; }, geo);
    expect([erg, aufrufe.length]).toEqual([null, 0]);
    positionHolen(true, (k) => { erg = k; }, geo);
    expect(erg).toEqual({ lat: 50.1, lon: 8.6, accuracy: 14 });
    expect(aufrufe[0]).toEqual({ enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
    expect(POSITION_OPTIONEN).toEqual(aufrufe[0]);
    positionHolen(true, (k) => { erg = k; }, { getCurrentPosition: (_o, fehler) => fehler(new Error("verweigert")) });
    expect(erg).toBeNull();
    expect([geoPruefungAn({ einstellungen: { geoPruefung: true } }), geoPruefungAn({ einstellungen: {} }), geoPruefungAn({})]).toEqual([true, false, false]);
  });
  it("Nachtdienst: offener Beginn von gestern → Ausstempeln für gestern, kein neuer Start für heute", () => {
    const p = { id: "a1" };
    const offen = { einstempeln: { "a1|2026-10-29": { start: "21:58" } } };
    expect(stempelVorgang(offen, p, "2026-10-30")).toEqual({ datum: "2026-10-29", st: { start: "21:58" }, vortag: true });
    const fertig = { einstempeln: { "a1|2026-10-29": { start: "21:58", ende: "06:04" } } };
    expect(stempelVorgang(fertig, p, "2026-10-30")).toEqual({ datum: "2026-10-30", st: null, vortag: false });
    const heute = { einstempeln: { "a1|2026-10-30": { start: "06:00" } } };
    expect(stempelVorgang(heute, p, "2026-10-30").datum).toBe("2026-10-30");
    expect(stempelVorgang({}, p, "2026-11-01")).toEqual({ datum: "2026-11-01", st: null, vortag: false });
  });
  it("Befundanzeige: ✓ ! ? ○ — und alte Einträge ohne geoStart/geoEnde bleiben lesbar", () => {
    const e = { start: "06:00", ende: "14:00",
      geoStart: { status: INNERHALB, entfernungGerundet: "50", genauigkeitM: 8, genauigkeitWarnung: false, referenz: { name: "Zentrale" } },
      geoEnde: { status: NICHT_BEWERTBAR, grund: "pruefung_aus" } };
    expect(geoAnzeige(e, "Start")).toMatchObject({ symbol: "✓", entfernung: "ca. 50 m", genauigkeit: 8, referenz: "Zentrale" });
    expect(geoAnzeige(e, "Ende")).toMatchObject({ symbol: "○", text: "Geo-Prüfung aus" });
    expect(geoAnzeige({ start: "06:00", geoStart: { status: AUSSERHALB, entfernungGerundet: ">5 km" } }, "Start").symbol).toBe("!");
    expect(geoAnzeige({ start: "06:00", geoStart: { status: NICHT_BEWERTBAR, grund: "keine_position" } }, "Start").symbol).toBe("?");
    const alt = { start: "06:00", ortStart: "Am Einsatzort (37 m)", innerhalbStart: true, ende: "14:00", innerhalbEnde: false };
    expect(geoAnzeige(alt, "Start")).toMatchObject({ symbol: "✓", entfernung: "" });
    expect(JSON.stringify(geoAnzeige(alt, "Start"))).not.toContain("37 m");
    expect(geoAnzeige(alt, "Ende").symbol).toBe("!");
    expect(geoAnzeige({ start: "06:00", ortStart: "Ohne Standortfreigabe erfasst", innerhalbStart: null }, "Start").symbol).toBe("?");
    expect(geoAnzeige({ start: "06:00" }, "Ende")).toBeNull();
  });
  it("Quelltext: keine eigene Ortsprüfung mehr im Client, keine erfundenen Koordinaten bei der Anlage", async () => {
    const app = (await readFile(path.join(__dirname, "..", "src", "App.jsx"), "utf8")).replace(/\r\n/g, "\n");
    expect(app).not.toMatch(/function stempelPruefen\(|function abstandMeter\(/);
    const block = (start) => { const i = app.indexOf(start); expect(i, start).toBeGreaterThan(0); return app.slice(i, app.indexOf("\n}\n", i)); };
    for (const name of ["function baueAusAnlage(", "function leererMandant("]) {
      const b = block(name);
      expect(b, name).toContain("lat: undefined, lon: undefined");
      expect(b, name).not.toMatch(/lat: 50\.11|50\.11 \+/);
    }
    for (const name of ["function Stempeluhr(", "function MStempel("]) {
      const b = block(name);
      expect(b, name).toContain("positionHolen(geoAn");
      expect(b, name).toContain("stempelVorgang(");
      expect(b, name).not.toContain("navigator.geolocation");
    }
  });
});

/* ---------- über den echten Handler ---------- */

const WIRT = "127.0.0.1:3000";
const RAUM = "georaum";
let wurzel, laden, daten, kontoSchreiben, ablageSchluessel, B, Z;
let nr = 0, HEUTE, GESTERN;
const anfrage = async (pfad, { methode = "POST", rumpf, token } = {}) => {
  nr += 1;
  const kopf = { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.15.${Math.floor(nr / 250)}.${nr % 250}` };
  if (methode !== "GET") kopf["content-type"] = "application/json";
  if (token) kopf.authorization = `Bearer ${token}`;
  const a = await daten(new Request(`http://${WIRT}${pfad}`, { method: methode, headers: kopf,
    ...(methode === "GET" ? {} : { body: JSON.stringify(rumpf || {}) }) }), {});
  const text = await a.text();
  let d = {}; try { d = JSON.parse(text); } catch { /* leer */ }
  return { status: a.status, roh: text, ...d };
};
const stempeln = (t, rumpf) => anfrage("/api/stempeln", { token: t, rumpf });
const gespeichert = async () => (await B.bestandLesen(laden(), RAUM)).bestand.mandanten[0];
const lies = (t) => anfrage("/api/bestand", { methode: "GET", token: t });
const person = (id, rolle, extra = {}) => ({ id, vorname: `V${id}`, nachname: `N${id}`, rolle, bereich: "e1", status: "aktiv",
  zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }], ...extra });
const MARKE = 50.0012345;                     // eine unverwechselbare Breite, darf nirgends gespeichert sein
const T = {};

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-geo-"));
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
  GESTERN = new Date(new Date(`${HEUTE}T12:00:00Z`).getTime() - 86400000).toISOString().slice(0, 10);
  const ids = ["a1", "a2", "a3", "a4", "a5", "a6"];
  await B.bestandSchreiben(laden(), RAUM, { version: 9, mandanten: [{
    id: "m-a", name: "A", status: "aktiv", einstellungen: {},
    einheiten: [{ id: "e1", standortId: "st1" }], standorte: [{ id: "st1", name: "Zentrale", bundesland: "HE", lat: 50, lon: 8, radius: 200 }],
    dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00" }, { id: "N", name: "Nacht", start: "22:00", ende: "06:00" }],
    personen: [person("l1", "leitung", { bereich: "ALLE" }), person("p1", "planer", { bereich: "ALLE" }), person("r1", "betriebsrat", { bereich: "ALLE" }),
      ...ids.map((i) => person(i, "mitarbeiter"))],
    /* a2 hat heute keinen geplanten Dienst; alle anderen Frühdienst, a6 gestern Nachtdienst */
    abweichungen: Object.fromEntries([...ids.filter((i) => i !== "a2").map((i) => [`${i}|${HEUTE}`, "F"]), [`a6|${GESTERN}`, "N"]]),
    einstempeln: { [`a6|${GESTERN}`]: { start: "21:57", ortStart: "Am Einsatzort (12 m)", innerhalbStart: true, geprueftStart: true } },
    erfassung: {}, anfragen: [], notrufe: [], nachrichten: [], abwesenheiten: [],
  }] }, { durch: "Pruefung" });
  let c = 0;
  for (const [id, rolle] of [["l1", "leitung"], ["p1", "planer"], ["r1", "betriebsrat"], ...ids.map((i) => [i, "mitarbeiter"])]) {
    c += 1;
    const code = `GEO${c}-AAAA-${String(c).padStart(4, "0")}`;
    await kontoSchreiben(laden(), ablageSchluessel(code), { name: id, bestand: RAUM, rolle, person: id, betrieb: 0, mandantId: "m-a",
      angelegt: "2026-01-01T00:00:00.000Z" });
    T[id] = (await anfrage("/api/anmelden", { rumpf: { zugangscode: code } })).token;
    expect(T[id], id).toBeTruthy();
  }
});
afterAll(async () => { await rm(wurzel, { recursive: true, force: true }); });

describe("Handler: Schalter aus (Vorgabe)", () => {
  it("Arbeitszeit wird erfasst, keine Prüfung — auch wenn eine Position mitkommt", async () => {
    const s = await stempeln(T.a1, { datum: HEUTE, art: "start", lat: 50, lon: 8, accuracy: 5 });
    expect(s.status, s.roh).toBe(200);
    expect(s.eintrag.start).toBeTruthy();
    expect(s.eintrag.geoStart).toMatchObject({ status: NICHT_BEWERTBAR, grund: "pruefung_aus" });
    expect(s.ort).toBe("Ohne Standortprüfung erfasst");
  });
});

describe("Handler: Schalter — nur die Leitung, Zeitpunkt und Person setzt der Server", () => {
  const schalten = async (t, an, extra = {}) => {
    const r = await lies(t);
    const b = JSON.parse(JSON.stringify(r.bestand));
    b.mandanten[0].einstellungen = { ...(b.mandanten[0].einstellungen || {}), geoPruefung: an, ...extra };
    return anfrage("/api/bestand", { methode: "PUT", token: t, rumpf: { bestand: b, etag: r.etag, durch: "Test" } });
  };
  it("Planung kann nicht einschalten (wirkungslos)", async () => {
    const w = await schalten(T.p1, true);
    expect(w.status, w.roh).toBe(200);
    expect((await gespeichert()).einstellungen.geoPruefung).not.toBe(true);
  });
  it("Leitung schaltet ein; mitgeschickte Angaben zu Zeitpunkt und Person zählen nicht", async () => {
    const w = await schalten(T.l1, true, { geoPruefungAktiviertAm: "1999-01-01", geoPruefungAktiviertVon: "p1" });
    expect(w.status, w.roh).toBe(200);
    const e = (await gespeichert()).einstellungen;
    expect(e.geoPruefung).toBe(true);
    expect(e.geoPruefungAktiviertVon).toBe("l1");
    expect(e.geoPruefungAktiviertAm.slice(0, 10)).toBe(new Date().toISOString().slice(0, 10));
  });
  it("Planung kann nicht ausschalten (wirkungslos)", async () => {
    await schalten(T.p1, false);
    expect((await gespeichert()).einstellungen.geoPruefung).toBe(true);
  });
});

describe("Schalter über die übrigen Schreibwege", () => {
  it("Schichtverantwortung abgewiesen, Beschäftigte wirkungslos, Kundenrolle wie die Leitung", async () => {
    const { bestandFuerRolle, zusammenfuehren } = await import("../server/lib/rechte.mjs");
    const g = () => ({ version: 9, mandanten: [{ id: "m-a", einstellungen: { geoPruefung: false }, einheiten: [{ id: "e1" }], standorte: [], dienstarten: [],
      personen: [person("l1", "leitung", { bereich: "ALLE" }), person("s1", "subplaner"), person("a1", "mitarbeiter")], abweichungen: {}, anfragen: [], notrufe: [], nachrichten: [] }] });
    const versuch = (rolle, pid) => {
      const s = { rolle, person: pid, betrieb: 0, mandantId: "m-a" };
      const b = JSON.parse(JSON.stringify(bestandFuerRolle(g(), s)));
      b.mandanten[0].einstellungen = { ...(b.mandanten[0].einstellungen || {}), geoPruefung: true };
      return zusammenfuehren(g(), b, s);
    };
    expect(versuch("subplaner", "s1").verweigert).toBeTruthy();
    expect(versuch("mitarbeiter", "a1").mandanten[0].einstellungen.geoPruefung).toBe(false);
    const k = versuch("kunde", "l1").mandanten[0].einstellungen;
    expect([k.geoPruefung, k.geoPruefungAktiviertVon]).toEqual([true, "l1"]);
  });
});

describe("Handler: Schalter an", () => {
  it("innerhalb: Urteil gespeichert, Erfassung entsteht beim Ausstempeln", async () => {
    const e = await stempeln(T.a1, { datum: HEUTE, art: "ende", lat: nord(40), lon: 8, accuracy: 10 });
    expect(e.status, e.roh).toBe(200);
    expect(e.eintrag.geoEnde).toMatchObject({ status: INNERHALB, entfernungGerundet: "50", genauigkeitM: 10, referenz: { id: "st1", name: "Zentrale" } });
    expect(e.erfassung).toMatchObject({ bestaetigt: true });
    expect((await gespeichert()).erfassung[`a1|${HEUTE}`].ende).toBe(e.zeit);
  });
  it("außerhalb, ohne Position, zu ungenau: Arbeitszeit trotzdem gespeichert", async () => {
    const aussen = await stempeln(T.a3, { datum: HEUTE, art: "start", lat: nord(2600), lon: 8, accuracy: 20 });
    expect([aussen.status, aussen.eintrag.geoStart.status, aussen.eintrag.geoStart.entfernungGerundet]).toEqual([200, AUSSERHALB, "2600"]);
    const ohne = await stempeln(T.a4, { datum: HEUTE, art: "start" });
    expect([ohne.status, ohne.eintrag.geoStart.grund, !!ohne.eintrag.start]).toEqual([200, "keine_position", true]);
    const ungenau = await stempeln(T.a5, { datum: HEUTE, art: "start", lat: 50, lon: 8, accuracy: 2500 });
    expect([ungenau.status, ungenau.eintrag.geoStart.grund]).toEqual([200, "genauigkeit_zu_schlecht"]);
  });
  it("Datenschutz: keine Rohkoordinate, keine exakte Entfernung in der Ablage", async () => {
    const s = await stempeln(T.a3, { datum: HEUTE, art: "ende", lat: MARKE + 0.004, lon: 8.0012345, accuracy: 7 });
    expect(s.status).toBe(200);
    const alles = JSON.stringify(await gespeichert());
    expect(alles).not.toContain("50.0052345");
    expect(alles).not.toContain("8.0012345");
    expect(alles).not.toContain("2600 m");             // keine exakte Meterzahl im Text …
    expect(s.eintrag.ortEnde).not.toMatch(/\(\d+ m\)/);  // … und nicht im alten Format
    expect(Number(s.eintrag.geoEnde.entfernungGerundet) % 50).toBe(0);
  });
  it("Betriebsrat sieht keine personenbezogenen Roh-Stempel (E1)", async () => {
    const r = await lies(T.r1);
    expect(r.status).toBe(200);
    expect(r.bestand.mandanten[0].einstempeln).toEqual({});
    expect(r.roh).not.toContain("geoStart");
  });
});

describe("Handler: Kennzeichen", () => {
  it("UNGEPLANTER_DIENST: Einstempeln ohne geplanten Dienst bleibt erlaubt und wird gekennzeichnet", async () => {
    const s = await stempeln(T.a2, { datum: HEUTE, art: "start" });
    expect(s.status, s.roh).toBe(200);
    expect(s.markierungen).toEqual(["UNGEPLANTER_DIENST"]);
    expect((await gespeichert()).einstempeln[`a2|${HEUTE}`].markierungen).toEqual(["UNGEPLANTER_DIENST"]);
  });
  it("START_FEHLT: das Ende bleibt, keine erfundene Startzeit, keine Ist-Erfassung", async () => {
    const r = await lies(T.l1);
    const b = JSON.parse(JSON.stringify(r.bestand));
    delete b.mandanten[0].einstempeln[`a4|${HEUTE}`];       // Leitung entfernt den Start (Korrekturfall)
    expect((await anfrage("/api/bestand", { methode: "PUT", token: T.l1, rumpf: { bestand: b, etag: r.etag, durch: "Test" } })).status).toBe(200);
    const e = await stempeln(T.a4, { datum: HEUTE, art: "ende" });
    expect(e.status, e.roh).toBe(200);
    expect(e.markierungen).toEqual(["START_FEHLT"]);
    expect(e.erfassung).toBeNull();
    const g = await gespeichert();
    expect(g.einstempeln[`a4|${HEUTE}`].start).toBeUndefined();
    expect(g.einstempeln[`a4|${HEUTE}`].ende).toBe(e.zeit);
    expect(g.erfassung[`a4|${HEUTE}`]).toBeUndefined();
  });
  it("nach START_FEHLT: ein späterer Start ersetzt das gestempelte Ende nicht (409)", async () => {
    const s2 = await stempeln(T.a4, { datum: HEUTE, art: "start" });
    expect([s2.status, s2.code]).toEqual([409, "STEMPEL_SCHON_AUSGESTEMPELT"]);
    const g = await gespeichert();
    expect(g.einstempeln[`a4|${HEUTE}`].ende).toBeTruthy();
    expect(g.einstempeln[`a4|${HEUTE}`].start).toBeUndefined();
  });
});

describe("Handler: Nachtdienst und Altbestand", () => {
  it("offener Beginn von gestern: Ausstempeln für gestern gelingt (Serverregel unverändert)", async () => {
    const e = await stempeln(T.a6, { datum: GESTERN, art: "ende", lat: nord(10), lon: 8, accuracy: 9 });
    expect(e.status, e.roh).toBe(200);
    expect(e.eintrag.start).toBe("21:57");
    expect(e.eintrag.geoEnde.status).toBe(INNERHALB);
  });
  it("alter Stempel ohne geoStart bleibt lesbar und unverändert", async () => {
    const r = await lies(T.l1);
    const alt = r.bestand.mandanten[0].einstempeln[`a6|${GESTERN}`];
    expect(alt.ortStart).toBe("Am Einsatzort (12 m)");
    expect(alt.geoStart).toBeUndefined();
    expect(geoAnzeige(alt, "Start").symbol).toBe("✓");
  });
});
