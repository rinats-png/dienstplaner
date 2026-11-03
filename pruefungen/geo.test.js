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
  standorteFehler, bestandStandorteFehler,
  INNERHALB, AUSSERHALB, NICHT_BEWERTBAR,
} from "../server/lib/geo.mjs";
import { stempelVorgang, positionHolen, geoAnzeige, POSITION_OPTIONEN, geoPruefungAn, endeFehlt } from "../src/stempelvorgang.js";
import {
  berlinZeitpunkt, offenSeitMinuten, startZuordenbar, uhrzeitBerlin, heuteBerlin, OFFEN_MAX_MINUTEN,
} from "../server/lib/zeiterfassung.mjs";

/* Ein Zeitpunkt nach Berliner Wanduhr. */
const um = (datum, uhrzeit) => new Date(berlinZeitpunkt(datum, uhrzeit));

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

describe("geo.mjs: Standortangaben beim Schreiben", () => {
  const st = (x) => ({ id: "st1", name: "Zentrale", ...x });
  it("ungültige neue Werte: abgewiesen, nicht still korrigiert", () => {
    for (const x of [{ lat: 450 }, { lat: -91 }, { lon: -220 }, { lon: 181 }, { radius: 0 }, { radius: -5 }, { radius: 24 },
      { radius: 10000 }, { lat: "50" }, { lon: NaN }, { radius: "200" }])
      expect(standorteFehler([], [st(x)]), JSON.stringify(x)).toBeTruthy();
  });
  it("gültige Werte und fehlende Koordinaten: zulässig", () => {
    for (const x of [{}, { lat: undefined, lon: undefined }, { lat: null, lon: null, radius: null }, { lat: 90, lon: -180, radius: 25 },
      { lat: -90, lon: 180, radius: 5000 }, { lat: 50.1109, lon: 8.6821, radius: 200 }])
      expect(standorteFehler([], [st(x)]), JSON.stringify(x)).toBeNull();
  });
  it("Altbestand: ein unverändert gespeicherter ungültiger Wert blockiert nicht — eine Änderung daran wird geprüft", () => {
    const alt = [st({ lat: 450, radius: 0 })];
    expect(standorteFehler(alt, [st({ lat: 450, radius: 0, name: "Zentrale neu" })])).toBeNull();
    expect(standorteFehler(alt, [st({ lat: 451, radius: 0 })])).toBeTruthy();
    expect(standorteFehler(alt, [st({ lat: 50, radius: 0 })])).toBeNull();
    expect(standorteFehler(alt, [st({ lat: 450, radius: 9000 })])).toBeTruthy();
    expect(standorteFehler(alt, [st({ lat: 450, radius: 0 }), { id: "st2", name: "Neu", lon: -220 }])).toBeTruthy();
  });
  it("über den ganzen Bestand, zugeordnet über die Betriebskennung", () => {
    const alt = { mandanten: [{ id: "m-a", standorte: [st({ lat: 450 })] }] };
    expect(bestandStandorteFehler(alt, { mandanten: [{ id: "m-a", standorte: [st({ lat: 450 })] }] })).toBeNull();
    expect(bestandStandorteFehler(alt, { mandanten: [{ id: "m-b", standorte: [st({ lat: 450 })] }] })).toBeTruthy();
    expect(bestandStandorteFehler(null, { mandanten: [{ id: "m-a", standorte: [st({ radius: 0 })] }] })).toBeTruthy();
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
    const frueh = um("2026-10-30", "06:04");
    const offen = { einstempeln: { "a1|2026-10-29": { start: "21:58" } } };
    expect(stempelVorgang(offen, p, "2026-10-30", frueh)).toEqual({ datum: "2026-10-29", st: { start: "21:58" }, vortag: true, offen: true, veraltet: false });
    const fertig = { einstempeln: { "a1|2026-10-29": { start: "21:58", ende: "06:04" } } };
    expect(stempelVorgang(fertig, p, "2026-10-30", frueh)).toEqual({ datum: "2026-10-30", st: null, vortag: false, offen: false, veraltet: false });
    const heute = { einstempeln: { "a1|2026-10-30": { start: "06:00" } } };
    expect(stempelVorgang(heute, p, "2026-10-30", frueh).datum).toBe("2026-10-30");
    expect(stempelVorgang({}, p, "2026-11-01", um("2026-11-01", "06:00"))).toEqual({ datum: "2026-11-01", st: null, vortag: false, offen: false, veraltet: false });
  });
  it("F2: offener Beginn bleibt offen und beendbar — unabhängig vom Plan; veraltet nur nach der 20-Stunden-Grenze", () => {
    const p = { id: "a1" };
    const tag = "2026-11-02", mittag = um(tag, "12:00");
    /* stempelVorgang liest den Plan nicht: mit, ohne und nach gelöschtem Dienst dasselbe Ergebnis. */
    const mitPlan = { abweichungen: { [`a1|${tag}`]: "F" }, einstempeln: { [`a1|${tag}`]: { start: "06:02" } } };
    const ohnePlan = { abweichungen: {}, einstempeln: { [`a1|${tag}`]: { start: "06:02" } } };
    for (const m of [mitPlan, ohnePlan])
      expect(stempelVorgang(m, p, tag, mittag)).toEqual({ datum: tag, st: { start: "06:02" }, vortag: false, offen: true, veraltet: false });
    /* Beginn heute 00:04, jetzt 20:04 → genau 20 h, noch zuordenbar; 20:05 → veraltet. */
    const frueh = { einstempeln: { [`a1|${tag}`]: { start: "00:04" } } };
    expect(stempelVorgang(frueh, p, tag, um(tag, "20:04"))).toMatchObject({ offen: true, veraltet: false });
    expect(stempelVorgang(frueh, p, tag, um(tag, "20:05"))).toMatchObject({ offen: true, veraltet: true, vortag: false });
    /* Mit eindeutigem Zeitpunkt (startAm) zählt dieser, nicht die Uhrzeit. */
    const mitAm = { einstempeln: { [`a1|${tag}`]: { start: "00:04", startAm: um(tag, "00:04").toISOString() } } };
    expect(stempelVorgang(mitAm, p, tag, um(tag, "20:05")).veraltet).toBe(true);
    /* Nachtdienst vom Vortag innerhalb von 20 h: Vortag, offen, nicht veraltet. */
    const nacht = { einstempeln: { "a1|2026-11-01": { start: "22:01" } } };
    expect(stempelVorgang(nacht, p, tag, um(tag, "09:14"))).toEqual({ datum: "2026-11-01", st: { start: "22:01" }, vortag: true, offen: true, veraltet: false });
    /* Vortag über 20 h: kein Ausstempeln für gestern; heute ist nichts offen (Korrektur über die Leitung). */
    const alt = { einstempeln: { "a1|2026-11-01": { start: "12:04" } } };
    expect(stempelVorgang(alt, p, tag, um(tag, "09:14"))).toEqual({ datum: tag, st: null, vortag: false, offen: false, veraltet: false });
    /* Abgeschlossen: nicht offen. Ende ohne Start (START_FEHLT): nicht offen. Kein Eintrag: nicht offen. */
    expect(stempelVorgang({ einstempeln: { [`a1|${tag}`]: { start: "06:00", ende: "14:00" } } }, p, tag, mittag)).toMatchObject({ offen: false, veraltet: false });
    expect(stempelVorgang({ einstempeln: { [`a1|${tag}`]: { ende: "09:13", markierungen: ["START_FEHLT"] } } }, p, tag, mittag)).toMatchObject({ offen: false, veraltet: false });
    expect(stempelVorgang({}, p, tag, mittag)).toMatchObject({ offen: false, veraltet: false, st: null });
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

/* ---------- 20-Stunden-Grenze für offene Vorgänge (Geo-Spezifikation B6) ---------- */

describe("zeiterfassung.mjs: offener Beginn höchstens 20 Stunden", () => {
  const dauer = (d1, z1, d2, z2) => offenSeitMinuten(d1, z1, um(d2, z2));
  it("Berliner Wanduhr ↔ Zeitpunkt, auch über die Zeitumstellung", () => {
    expect(new Date(berlinZeitpunkt("2026-07-01", "12:00")).toISOString()).toBe("2026-07-01T10:00:00.000Z");
    expect(new Date(berlinZeitpunkt("2026-12-01", "12:00")).toISOString()).toBe("2026-12-01T11:00:00.000Z");
    expect(new Date(berlinZeitpunkt("2026-10-25", "02:30")).toISOString()).toBe("2026-10-25T01:30:00.000Z");   // doppelt: die spätere
    expect(new Date(berlinZeitpunkt("2026-10-25", "01:30")).toISOString()).toBe("2026-10-24T23:30:00.000Z");
    expect(uhrzeitBerlin(um("2027-03-28", "03:05"))).toBe("03:05");
    expect(heuteBerlin(um("2027-01-01", "00:10"))).toBe("2027-01-01");
    expect([berlinZeitpunkt("2026-13-01", "06:00"), berlinZeitpunkt("2026-10-22", "6:00"), berlinZeitpunkt("2026-10-22", null)])
      .toEqual([null, null, null]);
  });
  it("1. Tagdienst und 2. Nachtdienst über Mitternacht", () => {
    expect(dauer("2026-10-22", "06:00", "2026-10-22", "14:05")).toBe(8 * 60 + 5);
    expect(dauer("2026-10-22", "20:15", "2026-10-23", "06:03")).toBe(9 * 60 + 48);
    expect(startZuordenbar("2026-10-22", "20:15", um("2026-10-23", "06:03"))).toBe(true);
    /* 16 Stunden: technisch zugeordnet; ob zulässig, sagt das Regelwerk. */
    expect(dauer("2026-10-22", "18:00", "2026-10-23", "10:00")).toBe(16 * 60);
    expect(startZuordenbar("2026-10-22", "18:00", um("2026-10-23", "10:00"))).toBe(true);
  });
  it("3.–5. Grenze: 19:59 und genau 20:00 zugeordnet, 20:01 nicht", () => {
    expect(OFFEN_MAX_MINUTEN).toBe(1200);
    expect(startZuordenbar("2026-10-22", "06:00", um("2026-10-23", "01:59"))).toBe(true);
    expect(dauer("2026-10-22", "06:00", "2026-10-23", "02:00")).toBe(1200);
    expect(startZuordenbar("2026-10-22", "06:00", um("2026-10-23", "02:00"))).toBe(true);
    expect(startZuordenbar("2026-10-22", "06:00", um("2026-10-23", "02:01"))).toBe(false);
    /* Sekunden zählen nicht: gespeichert und angezeigt werden Minuten. */
    expect(startZuordenbar("2026-10-22", "06:00", new Date(um("2026-10-23", "02:00").getTime() + 59000))).toBe(true);
    /* Am selben Tag gilt dieselbe Grenze. */
    expect(startZuordenbar("2026-10-22", "02:00", um("2026-10-22", "22:00"))).toBe(true);
    expect(startZuordenbar("2026-10-22", "02:00", um("2026-10-22", "22:01"))).toBe(false);
  });
  it("6. vergessenes Ausstempeln: 06:00 → 06:01 am Folgetag ist kein zugehöriger Vorgang", () => {
    expect(dauer("2026-10-22", "06:00", "2026-10-23", "06:01")).toBe(24 * 60 + 1);
    expect(startZuordenbar("2026-10-22", "06:00", um("2026-10-23", "06:01"))).toBe(false);
    /* Ein Beginn in der Zukunft (falsch gestellte Daten) ist ebenfalls nicht zuordenbar. */
    expect(startZuordenbar("2026-10-23", "08:00", um("2026-10-23", "06:00"))).toBe(false);
  });
  it("7. Monatswechsel und 8. Jahreswechsel", () => {
    expect(dauer("2026-10-31", "22:00", "2026-11-01", "06:00")).toBe(480);
    expect(startZuordenbar("2026-10-31", "22:00", um("2026-11-01", "06:00"))).toBe(true);
    expect(startZuordenbar("2026-10-31", "06:00", um("2026-11-01", "06:00"))).toBe(false);
    expect(dauer("2026-12-31", "22:00", "2027-01-01", "06:00")).toBe(480);
    expect(startZuordenbar("2026-12-31", "22:00", um("2027-01-01", "06:00"))).toBe(true);
    expect(startZuordenbar("2026-12-31", "06:00", um("2027-01-01", "06:30"))).toBe(false);
  });
  it("Zeitumstellung: Nacht 24./25.10.2026 eine Stunde länger, 27./28.3.2027 eine kürzer — die Grenze zählt echte Zeit", () => {
    expect(dauer("2026-10-24", "22:00", "2026-10-25", "06:00")).toBe(9 * 60);
    expect(dauer("2027-03-27", "22:00", "2027-03-28", "06:00")).toBe(7 * 60);
    /* 11:00 → 06:00 sind auf der Wanduhr 19 h, tatsächlich 20 h: noch zugeordnet; eine Minute früher nicht. */
    expect(startZuordenbar("2026-10-24", "11:00", um("2026-10-25", "06:00"))).toBe(true);
    expect(startZuordenbar("2026-10-24", "10:59", um("2026-10-25", "06:00"))).toBe(false);
    /* Frühjahr: 09:00 → 06:00 sind auf der Wanduhr 21 h, tatsächlich 20 h. */
    expect(startZuordenbar("2027-03-27", "09:00", um("2027-03-28", "06:00"))).toBe(true);
  });
  it("Rückstellnacht: „02:30“ ist zweideutig — mit startAm zählt die tatsächlich verstrichene Zeit", () => {
    const jetzt = new Date("2026-10-25T20:45:00Z");                       // 21:45 Winterzeit
    /* Beginn 02:30 Sommerzeit (erstes Vorkommen) = 00:30Z: tatsächlich 20:15 h. */
    expect(offenSeitMinuten("2026-10-25", "02:30", jetzt, "2026-10-25T00:30:00.000Z")).toBe(1215);
    expect(startZuordenbar("2026-10-25", "02:30", jetzt, "2026-10-25T00:30:00.000Z")).toBe(false);
    /* Beginn 02:30 Winterzeit (zweites Vorkommen) = 01:30Z: 19:15 h. */
    expect(startZuordenbar("2026-10-25", "02:30", jetzt, "2026-10-25T01:30:00.000Z")).toBe(true);
    /* Altbestand ohne startAm: als Winterzeit gelesen (dokumentierte Grenze der Rückwärtskompatibilität). */
    expect(offenSeitMinuten("2026-10-25", "02:30", jetzt)).toBe(1155);
    /* Auch „jetzt" in der Doppelstunde ist eindeutig: 02:30 Sommerzeit am Ende, Beginn 06:31 am Vortag = 20:59 h. */
    expect(offenSeitMinuten("2026-10-24", "06:31", new Date("2026-10-25T00:30:00Z"))).toBe(20 * 60 - 1);
    expect(offenSeitMinuten("2026-10-24", "06:31", new Date("2026-10-25T01:30:00Z"))).toBe(20 * 60 + 59);
    /* Sommerzeitbeginn: startAm und Wanduhr ergeben dasselbe. */
    const fj = new Date("2027-03-28T04:00:00Z");                          // 06:00 Sommerzeit
    expect(offenSeitMinuten("2027-03-27", "09:00", fj, "2027-03-27T08:00:00Z")).toBe(offenSeitMinuten("2027-03-27", "09:00", fj));
    /* Sekunden im startAm zählen nicht; ungültiges startAm fällt auf Tag + Uhrzeit zurück. */
    expect(offenSeitMinuten("2026-10-22", "06:00", um("2026-10-23", "02:00"), "2026-10-22T04:00:59.999Z")).toBe(1200);
    for (const kaputt of ["gestern", "2026-10-22 04:00", "2026-10-22T04:00:00+02:00", 17, null])
      expect(offenSeitMinuten("2026-10-22", "06:00", um("2026-10-23", "02:00"), kaputt)).toBe(1200);
  });
  it("Oberfläche: „Ausstempeln für gestern“ nur innerhalb der Grenze, sonst heute einstempeln und „Ende fehlt“", () => {
    const p = { id: "a1" };
    const m = { einstempeln: { "a1|2026-10-22": { start: "06:00" } } };
    expect(stempelVorgang(m, p, "2026-10-23", um("2026-10-23", "02:00"))).toMatchObject({ datum: "2026-10-22", vortag: true });
    expect(stempelVorgang(m, p, "2026-10-23", um("2026-10-23", "06:01")))
      .toEqual({ datum: "2026-10-23", st: null, vortag: false, offen: false, veraltet: false });
    expect(endeFehlt("2026-10-22", m.einstempeln["a1|2026-10-22"], um("2026-10-23", "02:00"))).toBe(false);
    expect(endeFehlt("2026-10-22", m.einstempeln["a1|2026-10-22"], um("2026-10-23", "06:01"))).toBe(true);
    expect(endeFehlt("2026-10-22", { start: "06:00", ende: "14:00" }, um("2026-10-25", "06:00"))).toBe(false);
    expect(endeFehlt("2026-10-22", null)).toBe(false);
    /* Mit startAm entscheidet der eindeutige Zeitpunkt, auch in der Oberfläche. */
    const doppel = { einstempeln: { "a1|2026-10-25": { start: "02:30", startAm: "2026-10-25T00:30:00.000Z" } } };
    expect(stempelVorgang(doppel, p, "2026-10-26", new Date("2026-10-25T23:15:00Z")).vortag).toBe(false);
    expect(endeFehlt("2026-10-25", doppel.einstempeln["a1|2026-10-25"], new Date("2026-10-25T20:45:00Z"))).toBe(true);
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
  /* z1…z9: ohne geplanten Dienst, nur für die 20-Stunden-Grenze (eigene Schlüssel, keine Überschneidung). */
  const zs = ["z1", "z2", "z3", "z4", "z5", "z6", "z7", "z8", "z9"];
  await B.bestandSchreiben(laden(), RAUM, { version: 9, mandanten: [{
    id: "m-a", name: "A", status: "aktiv", einstellungen: {},
    einheiten: [{ id: "e1", standortId: "st1" }], standorte: [{ id: "st1", name: "Zentrale", bundesland: "HE", lat: 50, lon: 8, radius: 200 }],
    dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00" }, { id: "N", name: "Nacht", start: "22:00", ende: "06:00" }],
    personen: [person("l1", "leitung", { bereich: "ALLE" }), person("p1", "planer", { bereich: "ALLE" }), person("r1", "betriebsrat", { bereich: "ALLE" }),
      ...ids.map((i) => person(i, "mitarbeiter")), ...zs.map((i) => person(i, "mitarbeiter"))],
    /* a2 hat heute keinen geplanten Dienst; alle anderen Frühdienst, a6 gestern Nachtdienst */
    abweichungen: Object.fromEntries([...ids.filter((i) => i !== "a2").map((i) => [`${i}|${HEUTE}`, "F"]), [`a6|${GESTERN}`, "N"]]),
    einstempeln: { [`a6|${GESTERN}`]: { start: "21:57", ortStart: "Am Einsatzort (12 m)", innerhalbStart: true, geprueftStart: true } },
    erfassung: {}, anfragen: [], notrufe: [], nachrichten: [], abwesenheiten: [],
  }] }, { durch: "Pruefung" });
  let c = 0;
  for (const [id, rolle] of [["l1", "leitung"], ["p1", "planer"], ["r1", "betriebsrat"], ...[...ids, ...zs].map((i) => [i, "mitarbeiter"])]) {
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
  const schalten = async (t, an, extra = { geoPruefungBestaetigt: true }) => {
    const r = await lies(t);
    const b = JSON.parse(JSON.stringify(r.bestand));
    b.mandanten[0].einstellungen = { ...(b.mandanten[0].einstellungen || {}), geoPruefung: an, ...extra };
    return anfrage("/api/bestand", { methode: "PUT", token: t, rumpf: { bestand: b, etag: r.etag, durch: "Test" } });
  };
  it("Leitung ohne Bestätigung: aus → an abgewiesen, nichts gespeichert", async () => {
    const w = await schalten(T.l1, true, {});
    expect(w.status, w.roh).toBe(403);
    expect(w.roh).toContain("betrieblich geprüft");
    expect((await gespeichert()).einstellungen.geoPruefung).not.toBe(true);
    const w2 = await schalten(T.l1, true, { geoPruefungBestaetigt: "ja" });
    expect(w2.status).toBe(403);
  });
  it("Planung kann nicht einschalten (wirkungslos)", async () => {
    const w = await schalten(T.p1, true);
    expect(w.status, w.roh).toBe(200);
    expect((await gespeichert()).einstellungen.geoPruefung).not.toBe(true);
  });
  it("Leitung schaltet ein; mitgeschickte Angaben zu Zeitpunkt und Person zählen nicht", async () => {
    const w = await schalten(T.l1, true, { geoPruefungBestaetigt: true, geoPruefungAktiviertAm: "1999-01-01", geoPruefungAktiviertVon: "p1" });
    expect(w.status, w.roh).toBe(200);
    const e = (await gespeichert()).einstellungen;
    expect(e.geoPruefung).toBe(true);
    expect(e.geoPruefungAktiviertVon).toBe("l1");
    expect(e.geoPruefungAktiviertAm.slice(0, 10)).toBe(new Date().toISOString().slice(0, 10));
    expect(e).not.toHaveProperty("geoPruefungBestaetigt");                 // nie gespeichert
  });
  it("an → an braucht keine neue Bestätigung; Zeitpunkt und Person bleiben", async () => {
    const vorher = (await gespeichert()).einstellungen;
    const w = await schalten(T.l1, true, {});
    expect(w.status, w.roh).toBe(200);
    const e = (await gespeichert()).einstellungen;
    expect([e.geoPruefung, e.geoPruefungAktiviertAm, e.geoPruefungAktiviertVon])
      .toEqual([true, vorher.geoPruefungAktiviertAm, vorher.geoPruefungAktiviertVon]);
  });
  it("Planung kann nicht ausschalten (wirkungslos)", async () => {
    await schalten(T.p1, false);
    expect((await gespeichert()).einstellungen.geoPruefung).toBe(true);
  });
});

describe("Schalter über die übrigen Schreibwege", () => {
  it("Schichtverantwortung abgewiesen, Beschäftigte wirkungslos, Kundenrolle wie die Leitung (mit Bestätigung)", async () => {
    const { bestandFuerRolle, zusammenfuehren } = await import("../server/lib/rechte.mjs");
    const g = () => ({ version: 9, mandanten: [{ id: "m-a", einstellungen: { geoPruefung: false }, einheiten: [{ id: "e1" }], standorte: [], dienstarten: [],
      personen: [person("l1", "leitung", { bereich: "ALLE" }), person("s1", "subplaner"), person("a1", "mitarbeiter")], abweichungen: {}, anfragen: [], notrufe: [], nachrichten: [] }] });
    const versuch = (rolle, pid, bestaetigt = true) => {
      const s = { rolle, person: pid, betrieb: 0, mandantId: "m-a" };
      const b = JSON.parse(JSON.stringify(bestandFuerRolle(g(), s)));
      b.mandanten[0].einstellungen = { ...(b.mandanten[0].einstellungen || {}), geoPruefung: true, ...(bestaetigt ? { geoPruefungBestaetigt: true } : {}) };
      return zusammenfuehren(g(), b, s);
    };
    expect(versuch("subplaner", "s1").verweigert).toBeTruthy();
    expect(versuch("mitarbeiter", "a1").mandanten[0].einstellungen.geoPruefung).toBe(false);
    const k = versuch("kunde", "l1").mandanten[0].einstellungen;
    expect([k.geoPruefung, k.geoPruefungAktiviertVon]).toEqual([true, "l1"]);
    expect(k).not.toHaveProperty("geoPruefungBestaetigt");
    expect(versuch("kunde", "l1", false).verweigert).toMatch(/betrieblich geprüft/);
  });
});

describe("Handler: Standortangaben — direkter Aufruf am Schreibweg vorbei", () => {
  const setze = async (felder) => {
    const r = await lies(T.l1);
    const b = JSON.parse(JSON.stringify(r.bestand));
    b.mandanten[0].standorte = b.mandanten[0].standorte.map((s) => (s.id === "st1" ? { ...s, ...felder } : s));
    return anfrage("/api/bestand", { methode: "PUT", token: T.l1, rumpf: { bestand: b, etag: r.etag, durch: "Test" } });
  };
  it("lat 450, lon −220, Umkreis 0 und 10000: 422, nichts gespeichert", async () => {
    for (const f of [{ lat: 450 }, { lon: -220 }, { radius: 0 }, { radius: 10000 }]) {
      const w = await setze(f);
      expect(w.status, JSON.stringify(f) + w.roh).toBe(422);
      const st = (await gespeichert()).standorte.find((s) => s.id === "st1");
      expect([st.lat, st.lon, st.radius], JSON.stringify(f)).toEqual([50, 8, 200]);
    }
  });
  it("gültige Änderung: gespeichert; Koordinaten entfernen ist erlaubt", async () => {
    expect((await setze({ radius: 250 })).status).toBe(200);
    expect((await gespeichert()).standorte.find((s) => s.id === "st1").radius).toBe(250);
    expect((await setze({ radius: 200 })).status).toBe(200);
  });
  it("Altbestand: ein gespeicherter ungültiger Wert blockiert keinen unabhängigen Schreibvorgang", async () => {
    const roh = await B.bestandLesen(laden(), RAUM);
    const b = JSON.parse(JSON.stringify(roh.bestand));
    b.mandanten[0].standorte.push({ id: "st-alt", name: "Alt", lat: 450, lon: 8, radius: 0 });
    expect((await B.bestandSchreiben(laden(), RAUM, b, { durch: "Altbestand" })).ok).toBe(true);
    const r = await lies(T.l1);
    const n = JSON.parse(JSON.stringify(r.bestand));
    n.mandanten[0].dienstarten = [...n.mandanten[0].dienstarten, { id: "S", name: "Spät", start: "14:00", ende: "22:00" }];
    const w = await anfrage("/api/bestand", { methode: "PUT", token: T.l1, rumpf: { bestand: n, etag: r.etag, durch: "Test" } });
    expect(w.status, w.roh).toBe(200);
    const g = await gespeichert();
    expect(g.dienstarten.some((x) => x.id === "S")).toBe(true);
    expect(g.standorte.find((s) => s.id === "st-alt").lat).toBe(450);
    /* … und die Prüfung beim Stempeln behandelt ihn als nicht bewertbar */
    const u = geoUrteil({ m: { ...g, einheiten: [{ id: "e1", standortId: "st-alt" }] }, person: { id: "x", zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }] },
      datum: HEUTE, messung: { lat: 50, lon: 8, accuracy: 5 } });
    expect(u.geo.status).toBe(NICHT_BEWERTBAR);
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

describe("Handler: Ausschalten", () => {
  it("an → aus ohne Bestätigung erlaubt (nur Leitung)", async () => {
    const r = await lies(T.l1);
    const b = JSON.parse(JSON.stringify(r.bestand));
    b.mandanten[0].einstellungen = { ...b.mandanten[0].einstellungen, geoPruefung: false };
    const w = await anfrage("/api/bestand", { methode: "PUT", token: T.l1, rumpf: { bestand: b, etag: r.etag, durch: "Test" } });
    expect(w.status, w.roh).toBe(200);
    expect((await gespeichert()).einstellungen.geoPruefung).toBe(false);
  });
});

describe("Handler: Nachtdienst und Altbestand", () => {
  /* Uhrzeitunabhängig (WP-17, W4): Der Altbestand-Beginn „gestern 21:57"
     bekommt einen eindeutigen Zeitpunkt vor zehn Stunden (startAm) — damit ist
     er zu jeder Uhrzeit des Prüflaufs zuordenbar. Der andere Fall (über 20 h:
     eigenes Ende, KONFLIKT) steht fest geprüft unten (z4, z8). */
  it("offener Beginn von gestern: Ausstempeln für gestern gelingt, Altbestand-Felder bleiben", async () => {
    const r = await lies(T.l1);
    const b = JSON.parse(JSON.stringify(r.bestand));
    b.mandanten[0].einstellungen = { ...b.mandanten[0].einstellungen, geoPruefung: true, geoPruefungBestaetigt: true };
    expect((await anfrage("/api/bestand", { methode: "PUT", token: T.l1, rumpf: { bestand: b, etag: r.etag, durch: "Test" } })).status).toBe(200);
    {
      const { bestand } = await B.bestandLesen(laden(), RAUM);
      const k = `a6|${GESTERN}`;
      bestand.mandanten[0].einstempeln[k] = { ...bestand.mandanten[0].einstempeln[k],
        startAm: new Date(Date.now() - 10 * 3600000).toISOString() };
      await B.bestandSchreiben(laden(), RAUM, bestand, { durch: "Pruefung" });
    }
    const e = await stempeln(T.a6, { datum: GESTERN, art: "ende", lat: nord(10), lon: 8, accuracy: 9 });
    expect(e.status, e.roh).toBe(200);
    expect(e.datum).toBe(GESTERN);
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

describe("Handler: 20-Stunden-Grenze beim Ausstempeln", { timeout: 20000 }, () => {
  /* Der Handler rechnet mit der echten Serverzeit. Der offene Beginn wird
     deshalb relativ zu „jetzt" angelegt; damit Anlegen und Ausstempeln in
     dieselbe Minute fallen, wird ein Minutenwechsel abgewartet. */
  const minutenSicher = async () => {
    const s = new Date().getSeconds();
    if (s >= 50) await new Promise((r) => setTimeout(r, (61 - s) * 1000));
  };
  const offenSeit = async (pid, minuten) => {
    const beginn = new Date(Math.floor(Date.now() / 60000) * 60000 - minuten * 60000);
    const datum = heuteBerlin(beginn), start = uhrzeitBerlin(beginn);
    const { bestand } = await B.bestandLesen(laden(), RAUM);
    const m = bestand.mandanten[0];
    m.einstempeln = { ...(m.einstempeln || {}), [`${pid}|${datum}`]: { start } };
    const erf = { ...(m.erfassung || {}) };
    delete erf[`${pid}|${datum}`];
    m.erfassung = erf;
    await B.bestandSchreiben(laden(), RAUM, bestand, { durch: "Pruefung" });
    return { datum, start, k: `${pid}|${datum}` };
  };
  const ausstempeln = (pid, datum) => stempeln(T[pid], { datum, art: "ende", lat: nord(10), lon: 8, accuracy: 9 });

  /* 19:59 und 20:00 Stunden sind zugeordnet — aber seit WP-17 (F4) über
     LANGER_DIENST_MINUTEN (12 h): Erfassung zur Prüfung, nicht bestätigt. */
  it("19:59 Stunden: zugeordnet, Erfassung zur Prüfung (LANGER_DIENST)", async () => {
    await minutenSicher();
    const o = await offenSeit("z1", 1199);
    const e = await ausstempeln("z1", o.datum);
    expect(e.status, e.roh).toBe(200);
    expect(e.markierungen).not.toContain("START_VERALTET");
    expect(e.markierungen).toContain("LANGER_DIENST");
    expect(e.erfassung).toMatchObject({ start: o.start, ende: e.zeit, bestaetigt: false });
    expect((await gespeichert()).erfassung[o.k]).toMatchObject({ start: o.start, bestaetigt: false });
  });
  it("genau 20:00 Stunden: noch zugeordnet (Grenze eingeschlossen)", async () => {
    await minutenSicher();
    const o = await offenSeit("z2", 1200);
    const e = await ausstempeln("z2", o.datum);
    expect(e.status, e.roh).toBe(200);
    expect(e.markierungen).not.toContain("START_VERALTET");
    expect(e.erfassung).toMatchObject({ start: o.start, bestaetigt: false });
  });
  /* Uhrzeitunabhängig (W4): Der Beginn steht unter dem heutigen Schlüssel mit
     eindeutigem Zeitpunkt vor 20:01 Stunden (startAm) — sonst fiele er je nach
     Uhrzeit auf gestern und würde nach B6.3 gar nicht angehängt. */
  it("20:01 Stunden (selber Tag): Ende gespeichert, Beginn unverändert, keine Erfassung, START_VERALTET", async () => {
    await minutenSicher();
    const beginn = new Date(Math.floor(Date.now() / 60000) * 60000 - 1201 * 60000);
    const o = { datum: HEUTE, start: uhrzeitBerlin(beginn), k: `z3|${HEUTE}` };
    {
      const { bestand } = await B.bestandLesen(laden(), RAUM);
      const m = bestand.mandanten[0];
      m.einstempeln = { ...(m.einstempeln || {}), [o.k]: { start: o.start, startAm: beginn.toISOString() } };
      await B.bestandSchreiben(laden(), RAUM, bestand, { durch: "Pruefung" });
    }
    const e = await ausstempeln("z3", o.datum);
    expect(e.status, e.roh).toBe(200);
    expect(e.markierungen).toContain("START_VERALTET");
    expect(e.erfassung).toBeNull();
    const g = await gespeichert();
    expect(g.einstempeln[o.k]).toMatchObject({ start: o.start, ende: e.zeit, markierungen: ["START_VERALTET"] });
    expect(g.erfassung[o.k]).toBeUndefined();
  });
  it("vergessenes Ausstempeln: 24 Stunden später wird keine bestätigte 24-Stunden-Schicht", async () => {
    await minutenSicher();
    const o = await offenSeit("z4", 24 * 60);
    expect(o.datum).toBe(GESTERN);
    const e = await ausstempeln("z4", GESTERN);
    expect(e.status, e.roh).toBe(200);
    /* Seit WP-17 (B6.3): nie still angehängt — eigenes Ende auf heute
       (START_FEHLT), der alte Vorgang bleibt offen und trägt KONFLIKT. */
    expect(e.datum).toBe(HEUTE);
    expect(e.markierungen).toContain("START_FEHLT");
    expect(e.erfassung).toBeNull();
    const g = await gespeichert();
    /* Nichts geht verloren: Beginn am alten Vorgang, Ende als eigenes Ereignis. */
    expect(g.einstempeln[o.k]).toMatchObject({ start: o.start, markierungen: ["KONFLIKT"], konfliktGrund: "vorgang_veraltet" });
    expect(g.einstempeln[o.k].ende).toBeUndefined();
    expect(g.einstempeln[`z4|${HEUTE}`]).toMatchObject({ ende: e.zeit });
    expect(g.erfassung[o.k]).toBeUndefined();
    /* Auch unter keinem anderen Schlüssel dieser Person. */
    expect(Object.keys(g.erfassung).filter((k) => k.startsWith("z4|"))).toEqual([]);
  });
  it("Korrektur bleibt möglich: die Leitung trägt die tatsächliche Zeit nach, der Stempel bleibt erhalten", async () => {
    const k = `z4|${GESTERN}`;
    const r = await lies(T.l1);
    const b = JSON.parse(JSON.stringify(r.bestand));
    const stempel = b.mandanten[0].einstempeln[k];
    b.mandanten[0].erfassung = { ...(b.mandanten[0].erfassung || {}),
      [k]: { start: stempel.start, ende: "14:00", bestaetigt: true, grund: "Ausstempeln vergessen" } };
    const w = await anfrage("/api/bestand", { methode: "PUT", token: T.l1, rumpf: { bestand: b, etag: r.etag, durch: "Test" } });
    expect(w.status, w.roh).toBe(200);
    const g = await gespeichert();
    expect(g.erfassung[k]).toMatchObject({ ende: "14:00", grund: "Ausstempeln vergessen" });
    expect(g.einstempeln[k]).toEqual(stempel);
  });
  it("nach vergessenem Ausstempeln lässt sich heute einstempeln; der alte Vorgang bleibt unberührt", async () => {
    await minutenSicher();
    const o = await offenSeit("z5", 24 * 60);
    const vorher = (await gespeichert()).einstempeln[o.k];
    const s = await stempeln(T.z5, { datum: HEUTE, art: "start", lat: nord(10), lon: 8, accuracy: 9 });
    expect(s.status, s.roh).toBe(200);
    const g = await gespeichert();
    expect(g.einstempeln[o.k]).toEqual(vorher);
    expect(g.einstempeln[`z5|${HEUTE}`].start).toBe(s.zeit);
    expect(endeFehlt(o.datum, g.einstempeln[o.k])).toBe(true);
  });
  it("doppelter Start überschreibt nicht (409)", async () => {
    const s1 = await stempeln(T.z6, { datum: HEUTE, art: "start" });
    expect(s1.status, s1.roh).toBe(200);
    const s2 = await stempeln(T.z6, { datum: HEUTE, art: "start" });
    expect(s2.status).toBe(409);
    expect(s2.code).toBe("STEMPEL_SCHON_EINGESTEMPELT");
    expect((await gespeichert()).einstempeln[`z6|${HEUTE}`].start).toBe(s1.zeit);
  });
  it("Ende ohne Start: keine erfundene Startzeit, keine Planzeit, keine Erfassung", async () => {
    const e = await stempeln(T.z7, { datum: HEUTE, art: "ende" });
    expect(e.status, e.roh).toBe(200);
    expect(e.markierungen).toContain("START_FEHLT");
    expect(e.markierungen).not.toContain("START_VERALTET");
    const g = await gespeichert();
    expect(g.einstempeln[`z7|${HEUTE}`].start).toBeUndefined();
    expect(g.erfassung[`z7|${HEUTE}`]).toBeUndefined();
  });
  it("Tagdienst: Start und Ende am selben Tag, zugeordnet, kein endeDatum", async () => {
    const s = await stempeln(T.z8, { datum: HEUTE, art: "start" });
    expect(s.status, s.roh).toBe(200);
    const e = await stempeln(T.z8, { datum: HEUTE, art: "ende" });
    expect(e.status, e.roh).toBe(200);
    expect(e.erfassung).toMatchObject({ start: s.zeit, ende: e.zeit, bestaetigt: true });
    expect(e.eintrag.endeDatum).toBeUndefined();
    /* Neue Ereignisse tragen den eindeutigen Zeitpunkt (UTC) neben der Uhrzeit; die Erfassung bleibt unverändert. */
    const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
    expect(s.eintrag.startAm).toMatch(iso);
    expect(e.eintrag).toMatchObject({ startAm: s.eintrag.startAm });
    expect(e.eintrag.endeAm).toMatch(iso);
    expect(uhrzeitBerlin(new Date(s.eintrag.startAm))).toBe(s.zeit);
    expect(Object.keys(e.erfassung).sort()).toEqual(["bestaetigt", "ende", "grund", "start"]);
  });
  it("startAm ist maßgeblich: ein Beginn mit Uhrzeit von eben, aber startAm vor 21 Stunden, ist veraltet", async () => {
    const { bestand } = await B.bestandLesen(laden(), RAUM);
    const m = bestand.mandanten[0];
    const k = `z8|${GESTERN}`;
    m.einstempeln = { ...m.einstempeln, [k]: { start: uhrzeitBerlin(new Date()), startAm: new Date(Date.now() - 21 * 3600000).toISOString() } };
    /* Ein heutiger Vorgang von z8 aus einer früheren Prüfung würde das Ende auf sich ziehen (stempelZiel, Regel 1). */
    delete m.einstempeln[`z8|${HEUTE}`];
    await B.bestandSchreiben(laden(), RAUM, bestand, { durch: "Pruefung" });
    const e = await stempeln(T.z8, { datum: GESTERN, art: "ende" });
    expect(e.status, e.roh).toBe(200);
    expect([e.datum, e.markierungen.includes("START_FEHLT")]).toEqual([HEUTE, true]);   // B6.3: nicht angehängt
    expect(e.erfassung).toBeNull();
    expect((await gespeichert()).einstempeln[k].markierungen).toContain("KONFLIKT");
  });
  it("Nachtdienst: offener Beginn von gestern innerhalb der Grenze wird zugeordnet und trägt endeDatum", async () => {
    await minutenSicher();
    const o = await offenSeit("z9", 9 * 60 + 48);
    const e = await ausstempeln("z9", o.datum);
    expect(e.status, e.roh).toBe(200);
    expect(e.erfassung).toMatchObject({ start: o.start, bestaetigt: true });
    if (o.datum !== HEUTE) expect(e.eintrag.endeDatum).toBe(HEUTE);
    else expect(e.eintrag.endeDatum).toBeUndefined();
  });
});

/* Wer im Schichtdienst steht, stempelt die eigene Zeit — auch im Betriebsrat
   (Desktop-Stempeluhr, Prioritaeten). Der Server nimmt nur die eigene Person
   der Sitzung an; zurück kommt nur der eigene Stempel, keine Erfassung. */
describe("Handler: Betriebsrat stempelt die eigene Zeit", () => {
  it("Beginn 200, sieht nur den eigenen Stempel, keine Erfassung; Doppelstart 409", async () => {
    const s = await stempeln(T.r1, { datum: HEUTE, art: "start" });
    expect(s.status).toBe(200);
    expect(s.eintrag.start).toBeTruthy();
    const r = await lies(T.r1);
    const m = r.bestand.mandanten[0];
    expect(Object.keys(m.einstempeln)).toEqual([`r1|${HEUTE}`]);
    expect(m.erfassung).toEqual({});
    expect(m.sichtIstDaten).toEqual({ umfang: "keine" });
    const d = await stempeln(T.r1, { datum: HEUTE, art: "start" });
    expect(d.status).toBe(409);
    expect(d.code).toBe("STEMPEL_SCHON_EINGESTEMPELT");
    const e = await stempeln(T.r1, { datum: HEUTE, art: "ende" });
    expect(e.status).toBe(200);
    expect(e.eintrag.start).toBe(s.eintrag.start);
    expect((await lies(T.r1)).bestand.mandanten[0].erfassung).toEqual({});
  });
});
