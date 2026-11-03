/* ==========================================================================
   GEO-SPEZIFIKATIONSRESTE (WP-29)

   Abgleich mit der Geo-Spezifikation (docs/acc45/wp29-nachweis.md): Was
   WP-20 und die Geo-V1-Pakete schon abdecken, steht in geo.test.js und
   geo-einsatzorte*.test.js. Hier stehen nur die Reste:

   - Felder: koordinatenQuelle, koordinatenGeprueftAm (Standort, Einsatzort),
     Einsatzort art/aktiv, Vorgabe-Umkreis 100 m am Einsatzort (B2, B9)
   - Begründungscodes: keine_freigabe, timeout, nicht_verfuegbar (vom Gerät),
     einsatzort_ungueltig (inaktiver Einsatzort, kein Rückfall) (B1, B4, B10)
   - Warnung über 100 m beim Übernehmen einer Position (B3)
   - Texte B13: Was gespeichert wird (Status, gerundete Entfernung, Genauigkeit,
     Prüfort) statt „nur, ob du am Einsatzort warst“
   - Spoofing-Hinweis B14: Standortangabe ist ein Hinweis, kein Beweis
   ========================================================================== */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  geoUrteil, standorteFehler, bestandStandorteFehler, NICHT_BEWERTBAR, AUSSERHALB, INNERHALB,
  GEO_QUELLEN, EINSATZORT_ARTEN, EINSATZORT_RADIUS_VORGABE, POSITION_GRUENDE, grundText, GEO_SPOOFING_TEXT, GEO_DATENSCHUTZ_TEXT,
} from "../server/lib/geo.mjs";
import { positionHolen, geoAnzeige, positionsUebernahme, koordinatenFelder, koordMitGrund } from "../src/stempelvorgang.js";
import { erfassen, rumpfFuer } from "../src/stempelpuffer.js";
import { bestandFuerRolle } from "../server/lib/rechte.mjs";

const lies = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const ZENTRALE = { lat: 50, lon: 8 };
const KUNDE = { lat: 51, lon: 9 };
const M_JE_GRAD = (2 * Math.PI * 6371000) / 360;
const nord = (p, meter) => ({ lat: p.lat + meter / M_JE_GRAD, lon: p.lon });
const DATUM = "2026-10-30";
const PERSON = { id: "a1", zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }] };
const betrieb = (eo, { modus } = {}) => ({
  id: "m-a", einstellungen: { geoPruefung: true, ...(modus ? { geoModus: modus } : {}) },
  einheiten: [{ id: "e1", standortId: "st1" }],
  standorte: [{ id: "st1", name: "Zentrale", bundesland: "HE", ...ZENTRALE, radius: 200 }],
  einsatzorte: [{ id: "es1", name: "Kunde Nord", ...KUNDE, ...eo }],
  dienstarten: [{ id: "E", name: "Kundentermin", start: "08:00", ende: "16:00", ortModus: "einsatzort", einsatzortId: "es1" }],
  abweichungen: { [`a1|${DATUM}`]: "E" },
});
const urteil = (m, messung) => geoUrteil({ m, person: PERSON, datum: DATUM, messung });

describe("Begründungscodes (B1, B4, B10)", () => {
  it("inaktiver Einsatzort: NICHT_BEWERTBAR / einsatzort_ungueltig — auch an der Koordinate, kein Rückfall auf den Standort", () => {
    const m = betrieb({ radius: 100, aktiv: false });
    for (const p of [nord(KUNDE, 5), nord(ZENTRALE, 5)]) {
      const u = urteil(m, { ...p, accuracy: 10 });
      expect([u.geo.status, u.geo.grund, u.geprueft, u.geo.abstandsklasse]).toEqual([NICHT_BEWERTBAR, "einsatzort_ungueltig", false, null]);
    }
    /* Ohne Angabe und mit aktiv:true gilt der Einsatzort (Altbestand hat kein Feld). */
    for (const eo of [{ radius: 100 }, { radius: 100, aktiv: true }])
      expect(urteil(betrieb(eo), { ...nord(KUNDE, 5), accuracy: 10 }).geo.status).toBe(INNERHALB);
  });
  it("Pflichtmodus: inaktiver Einsatzort markiert ORT_PRUEFEN, lehnt aber nicht ab", () => {
    const u = urteil(betrieb({ radius: 100, aktiv: false }, { modus: "pflicht" }), { ...nord(KUNDE, 5), accuracy: 10 });
    expect(u.markierungen).toEqual(["ORT_PRUEFEN"]);
  });
  it("Gerät meldet den Grund: keine_freigabe, timeout, nicht_verfuegbar — nur aus der Liste", () => {
    const m = betrieb({ radius: 100 });
    for (const g of ["keine_freigabe", "timeout", "nicht_verfuegbar"]) {
      const u = urteil(m, { lat: null, lon: null, accuracy: null, grund: g });
      expect([u.geo.status, u.geo.grund, u.geprueft, u.geo.entfernungGerundet]).toEqual([NICHT_BEWERTBAR, g, false, null]);
      expect(u.text).toBe(grundText(g));
    }
    expect([...POSITION_GRUENDE]).toEqual(["keine_freigabe", "timeout", "nicht_verfuegbar"]);
    /* Alles andere (Fremdtext, Code eines anderen Falls) bleibt keine_position und wird nie gespeichert. */
    for (const g of ["Maxi Muster", "pruefung_aus", "aussendienst", "<b>x</b>", 5, {}, "", undefined]) {
      const u = urteil(m, { lat: null, lon: null, accuracy: null, grund: g });
      expect(u.geo.grund, JSON.stringify(g)).toBe("keine_position");
      expect(JSON.stringify(u.geo)).not.toContain("Maxi");
    }
  });
  it("der Grund des Geräts ändert kein Urteil, wenn eine Position da ist, und nicht bei ausgeschalteter Prüfung", () => {
    const m = betrieb({ radius: 100 });
    expect(urteil(m, { ...nord(KUNDE, 5), accuracy: 10, grund: "timeout" }).geo.status).toBe(INNERHALB);
    const aus = { ...m, einstellungen: { geoPruefung: false } };
    expect(urteil(aus, { lat: null, lon: null, accuracy: null, grund: "timeout" }).geo.grund).toBe("pruefung_aus");
  });
  it("jeder Grund hat einen Text; Anzeige trägt den Grund als Klartext (B11)", () => {
    for (const g of ["pruefung_aus", "keine_position", "keine_freigabe", "timeout", "nicht_verfuegbar", "ungueltige_koordinate",
      "ungueltige_genauigkeit", "kein_referenzort", "keine_koordinate_am_referenzort", "einsatzort_ungueltig", "radius_ungueltig",
      "genauigkeit_zu_schlecht", "aussendienst"])
      expect(grundText(g), g).toMatch(/\S{3}/);
    const a = geoAnzeige({ start: "08:00", geoStart: { status: NICHT_BEWERTBAR, grund: "timeout" } }, "Start");
    expect([a.symbol, a.text, a.grundText]).toEqual(["?", "Standort nicht bewertbar", grundText("timeout")]);
    expect(geoAnzeige({ start: "08:00", geoStart: { status: AUSSERHALB, grund: null } }, "Start").grundText).toBe("");
  });
});

describe("Gerät: Grund der fehlenden Position (B4, B16 „Geo Gerät“)", () => {
  const holen = (geo) => { const e = []; positionHolen(true, (...a) => e.push(a), geo); return e[0]; };
  it("verweigert, nicht verfügbar, Zeitüberschreitung, keine Schnittstelle", () => {
    const fehler = (code) => ({ getCurrentPosition: (_ok, f) => f({ code, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 }) });
    expect(holen(fehler(1))).toEqual([null, "keine_freigabe"]);
    expect(holen(fehler(2))).toEqual([null, "nicht_verfuegbar"]);
    expect(holen(fehler(3))).toEqual([null, "timeout"]);
    expect(holen(fehler(99))).toEqual([null, "nicht_verfuegbar"]);
    expect(holen({ getCurrentPosition: (_ok, f) => f(new Error("x")) })).toEqual([null, "nicht_verfuegbar"]);
    expect(holen(null)).toEqual([null, "nicht_verfuegbar"]);
  });
  it("Prüfung aus: keine Abfrage, kein Grund; mit Position: kein Grund", () => {
    const e = [];
    positionHolen(false, (...a) => e.push(a), { getCurrentPosition: () => { throw new Error("nie"); } });
    expect(e[0]).toEqual([null]);
    expect(holen({ getCurrentPosition: (ok) => ok({ coords: { latitude: 1, longitude: 2, accuracy: 3 } }) }))
      .toEqual([{ lat: 1, lon: 2, accuracy: 3 }]);
  });
  it("an die Stempelaktion geht die Messung — ohne Position nur der Grund als Code", () => {
    expect(koordMitGrund({ lat: 1, lon: 2, accuracy: 3 }, "timeout")).toEqual({ lat: 1, lon: 2, accuracy: 3 });
    expect(koordMitGrund(null, "timeout")).toEqual({ grund: "timeout" });
    expect([koordMitGrund(null), koordMitGrund(null, ""), koordMitGrund(null, 5)]).toEqual([null, null, null]);
    /* Beide Aufrufstellen (Stempeluhr, mobile Fläche) reichen den Grund weiter. */
    const app = lies("src/App.jsx");
    expect(app.match(/positionHolen\(geoAn, \((?:k|koord), grund\) => \{ const ort = koordMitGrund\(/g) || []).toHaveLength(2);
  });
  it("speicher.stempeln sendet den Grund, aber nie zusammen mit einer Koordinate", async () => {
    const SP = await import("../src/speicher.js");
    const bodies = [];
    const alt = globalThis.fetch;
    globalThis.fetch = async (_u, o) => { bodies.push(JSON.parse(o.body)); return new Response(JSON.stringify({ ok: true }), { status: 200 }); };
    try {
      await SP.stempeln("2026-10-30", "start", { grund: "keine_freigabe" });
      await SP.stempeln("2026-10-30", "start", { lat: 50, lon: 8, accuracy: 9, grund: "timeout" });
      await SP.stempeln("2026-10-30", "start", null);
    } finally { globalThis.fetch = alt; }
    expect(bodies[0]).toMatchObject({ lat: null, lon: null, accuracy: null, positionGrund: "keine_freigabe" });
    expect(bodies[1]).toMatchObject({ lat: 50, lon: 8, accuracy: 9 });
    expect(bodies[1].positionGrund).toBeUndefined();
    expect(bodies[2].positionGrund).toBeUndefined();
  });
  it("der Grund liegt im Puffer und im Rumpf — ohne Koordinate; nur Werte aus der Liste", async () => {
    const dosen = new Map();
    const speicher = { alle: async () => [...dosen.values()], setzen: async (ev) => { dosen.set(ev.id, ev); } };
    const ev = await erfassen(speicher, { art: "start", koord: null, positionGrund: "timeout", inhaber: "i1", kennung: () => "k1" });
    expect(ev.koord).toBeNull();
    const rumpf = rumpfFuer(ev);
    expect([rumpf.positionGrund, rumpf.lat, rumpf.lon]).toEqual(["timeout", null, null]);
    const frei = await erfassen(speicher, { art: "start", koord: null, positionGrund: "Maxi Muster", inhaber: "i1", kennung: () => "k2" });
    expect(frei.positionGrund).toBeUndefined();
    expect(rumpfFuer(frei).positionGrund ?? null).toBeNull();
    const mit = await erfassen(speicher, { art: "start", koord: { lat: 1, lon: 2, accuracy: 5 }, positionGrund: "timeout", inhaber: "i1", kennung: () => "k3" });
    expect(mit.positionGrund).toBeUndefined();
    expect(rumpfFuer(mit).positionGrund ?? null).toBeNull();
    /* Auch ein von außen eingeschleuster Wert (älterer Puffer, Manipulation) geht nie hinaus. */
    expect(rumpfFuer({ ...frei, positionGrund: "Maxi Muster" }).positionGrund ?? null).toBeNull();
    expect(rumpfFuer({ ...mit, positionGrund: "timeout" }).positionGrund ?? null).toBeNull();
  });
});

describe("Felder (B2, B9)", () => {
  it("Quellen und Arten sind Listen aus der Spezifikation", () => {
    expect([...GEO_QUELLEN]).toEqual(["adresse", "geraet", "karte", "manuell"]);
    expect([...EINSATZORT_ARTEN]).toEqual(["kunde", "objekt", "patient", "baustelle", "sonstiger"]);
  });
  it("koordinatenQuelle: nur aus der Liste; koordinatenGeprueftAm: nur JJJJ-MM-TT", () => {
    const st = (x) => [{ id: "s", name: "Haus", lat: 50, lon: 8, radius: 200, ...x }];
    for (const q of GEO_QUELLEN) expect(standorteFehler([], st({ koordinatenQuelle: q })), q).toBeNull();
    for (const q of ["gps", "", 5, {}, true]) expect(standorteFehler([], st({ koordinatenQuelle: q })), JSON.stringify(q)).toMatch(/Quelle/);
    expect(standorteFehler([], st({ koordinatenGeprueftAm: "2026-10-30" }))).toBeNull();
    for (const d of ["30.10.2026", "2026-13-01", "2026-02-30", "heute", 20261030, {}])
      expect(standorteFehler([], st({ koordinatenGeprueftAm: d })), JSON.stringify(d)).toMatch(/Datum/);
    /* fehlend oder null ist erlaubt; Altbestand blockiert nicht, wenn unverändert. */
    expect(standorteFehler([], st({ koordinatenQuelle: null, koordinatenGeprueftAm: null }))).toBeNull();
    const alt = st({ koordinatenQuelle: "gps" });
    expect(standorteFehler(alt, st({ koordinatenQuelle: "gps", name: "Neu" }))).toBeNull();
  });
  it("Einsatzorte: art aus der Liste, aktiv ein Boolean — über den Bestand geprüft", () => {
    const bestand = (eo) => ({ mandanten: [{ id: "m1", standorte: [], einsatzorte: [{ id: "e", name: "K", radius: 100, ...eo }] }] });
    expect(bestandStandorteFehler({ mandanten: [] }, bestand({ art: "kunde", aktiv: false, koordinatenQuelle: "manuell" }))).toBeNull();
    expect(bestandStandorteFehler({ mandanten: [] }, bestand({ art: "arzt" }))).toMatch(/Art/);
    expect(bestandStandorteFehler({ mandanten: [] }, bestand({ aktiv: "nein" }))).toMatch(/aktiv/);
    expect(bestandStandorteFehler({ mandanten: [] }, bestand({ koordinatenQuelle: "gps" }))).toMatch(/Quelle/);
  });
  it("Vorgabe-Umkreis am Einsatzort: 100 m (Standort: 200 m)", () => {
    expect(EINSATZORT_RADIUS_VORGABE).toBe(100);
    /* 150 m entfernt, Messung auf 10 m genau: Umkreis 100 → außerhalb; mit 200 wäre es innerhalb. */
    const u = urteil(betrieb({}), { ...nord(KUNDE, 150), accuracy: 10 });
    expect(u.geo.status).toBe(AUSSERHALB);
    expect(urteil(betrieb({}), { ...nord(KUNDE, 80), accuracy: 10 }).geo.status).toBe(INNERHALB);
    /* Standort ohne Angabe bleibt bei 200 m. */
    const m = betrieb({ radius: 100 });
    delete m.standorte[0].radius;
    m.abweichungen = {};
    expect(urteil(m, { ...nord(ZENTRALE, 150), accuracy: 10 }).geo.status).toBe(INNERHALB);
  });
  it("Rollen ohne Planung und Leitung sehen die neuen Standortfelder nicht (Positivkatalog)", () => {
    const b = { version: 9, mandanten: [{ id: "m-a", name: "A", status: "aktiv", einstellungen: {}, einheiten: [], personen: [{ id: "x1", rolle: "mitarbeiter", bereich: "ALL" }],
      standorte: [{ id: "st1", name: "Haus", bundesland: "HE", lat: 50.1, lon: 8.6, radius: 150, adresse: { strasse: "Weg" },
        koordinatenQuelle: "geraet", koordinatenGeprueftAm: "2026-10-30" }],
      einsatzorte: [{ id: "es1", name: "K", art: "kunde", aktiv: true, lat: 1, lon: 2, radius: 100, koordinatenQuelle: "manuell" }] }] };
    for (const rolle of ["mitarbeiter", "betriebsrat", "subplaner"]) {
      const s = { rolle, person: "x1", mandantId: "m-a", betrieb: 0, bereich: "ALL" };
      const aus = JSON.stringify(bestandFuerRolle(b, s));
      for (const f of ["koordinatenQuelle", "koordinatenGeprueftAm", "strasse", "\"lat\"", "einsatzorte\":[{"]) expect(aus, `${rolle} ${f}`).not.toContain(f);
    }
  });
});

describe("Position übernehmen: Warnung über 100 m (B3)", () => {
  const pos = (accuracy, lat = 50.1234567, lon = 8.7654321) => ({ coords: { latitude: lat, longitude: lon, accuracy } });
  it("100 m ohne, 101 m mit Warnung; Quelle „geraet“, noch nicht bestätigt; Koordinate auf 6 Stellen", () => {
    const gut = positionsUebernahme(pos(100));
    expect(gut.ok).toBe(true);
    expect(gut.felder).toEqual({ lat: 50.123457, lon: 8.765432, koordinatenQuelle: "geraet", koordinatenGeprueftAm: null });
    expect([gut.warnung, gut.meldung]).toEqual([false, "Position übernommen · Genauigkeit ca. 100 m"]);
    const schlecht = positionsUebernahme(pos(101));
    expect(schlecht.warnung).toBe(true);
    expect(schlecht.meldung).toContain("Genauigkeit ca. 101 m");
    expect(schlecht.meldung).toMatch(/schlechter als 100 m/);
  });
  it("ungültige Position oder Genauigkeit wird nicht übernommen", () => {
    expect(positionsUebernahme(pos(10, 91, 8)).ok).toBe(false);
    expect(positionsUebernahme(pos(10, 50, 181)).ok).toBe(false);
    expect(positionsUebernahme(pos(NaN)).ok).toBe(false);
  });
  it("von Hand geänderte Koordinate: Quelle „manuell“, Bestätigung zurückgenommen", () => {
    expect(koordinatenFelder("lat", 50.5)).toEqual({ lat: 50.5, koordinatenQuelle: "manuell", koordinatenGeprueftAm: null });
    expect(koordinatenFelder("lon", undefined)).toEqual({ lon: undefined, koordinatenQuelle: "manuell", koordinatenGeprueftAm: null });
  });
});

describe("Texte B13 und Spoofing-Hinweis B14", () => {
  it("kein Text sagt mehr „gespeichert wird nur, ob du am Einsatzort warst“", () => {
    for (const datei of ["src/App.jsx", "src/handbuch-inhalt.js", "src/tour-inhalt.js", "src/pruefung.jsx"]) {
      const t = lies(datei).replace(/\s+/g, " ");
      for (const alt of [/nur,? ob (du|jemand) (am|beim) (Einsatzort|Stempeln am Einsatzort|Standort) (warst|war)/i, /Gespeichert wird nur, ob du dort warst/i, /Nur ob du beim Stempeln am Einsatzort warst/i,
        /nur festgehalten, ob du am Einsatzort warst/i])
        expect(t, `${datei}: ${alt}`).not.toMatch(alt);
    }
  });
  it("der Datenschutztext nennt Status, gerundete Entfernung, Genauigkeit und Prüfort — und was nicht gespeichert wird", () => {
    for (const w of ["Ergebnis", "grob gerundet", "Messgenauigkeit", "Prüfort", "keine Koordinate", "kein Verlauf"])
      expect(GEO_DATENSCHUTZ_TEXT, w).toContain(w);
    for (const datei of ["src/handbuch-inhalt.js", "src/tour-inhalt.js"]) {
      const t = lies(datei).replace(/\s+/g, " ");
      const i = t.indexOf("die Entfernung grob gerundet");
      expect(i, datei).toBeGreaterThan(-1);
      expect(t.slice(i, i + 160), datei).toContain("Prüfort");
    }
  });
  it("Spoofing-Hinweis: Hinweis, kein Beweis; kein Verstoß, keine automatischen Folgen", () => {
    for (const w of ["kein Beweis", "nicht zuverlässig", "Gespräch", "kein Verstoß"]) expect(GEO_SPOOFING_TEXT, w).toContain(w);
  });
  let A;
  beforeAll(async () => { A = await import("../src/App.jsx"); }, 120000);
  const text = (el) => renderToStaticMarkup(el).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const sitz = (m) => ({ rolle: "kunde", db: { mandanten: [m] }, mandant: m, person: { id: "l1", rolle: "leitung", bereich: "ALLE" } });
  const betr = (e = {}, extra = {}) => { const m = A.leererMandant("Geo-UI", "pflege"); m.einstellungen = { ...m.einstellungen, ...e }; return Object.assign(m, extra); };
  const akt = new Proxy({}, { get: () => () => {} });
  it("Schalter (Leitung) zeigt Datenschutztext und Spoofing-Hinweis — ein- wie ausgeschaltet", () => {
    for (const an of [true, false]) {
      const t = text(h(A.GeoSchalter, { sitz: sitz(betr({ geoPruefung: an })), akt }));
      expect(t).toContain("Prüfort");
      expect(t).toContain(GEO_SPOOFING_TEXT);
    }
  });
  it("Stempelbefunde (Leitung) tragen den Spoofing-Hinweis und deuten ✓ und ! nicht als Nachweis", () => {
    const m = betr({ geoPruefung: true }, { personen: [{ id: "p1", vorname: "A", nachname: "B", rolle: "mitarbeiter" }],
      einstempeln: { "p1|2026-10-30": { start: "08:00", geoStart: { status: INNERHALB, grund: null, genauigkeitM: 12, genauigkeitWarnung: false, referenz: { art: "standort", id: "s", name: "Haus" } } } } });
    const t = text(h(A.StempelBefunde, { sitz: sitz(m), ym: "2026-10", akt }));
    expect(t).toContain(GEO_SPOOFING_TEXT);
  });
  it("Handbuch für die Leitung nennt den Spoofing-Hinweis", () => {
    expect(lies("src/handbuch-inhalt.js").replace(/\s+/g, " ")).toContain("Eine Standortangabe ist ein Hinweis, kein Beweis");
  });
  it("Einsatzorte-Verwaltung: Art und Aktiv; Quelle und Bestätigung der Koordinate", () => {
    const m = betr({ geoPruefung: true }, { einsatzorte: [{ id: "es1", name: "Kunde", art: "kunde", aktiv: true, lat: 51, lon: 9, radius: 100, koordinatenQuelle: "manuell" }] });
    const t = text(h(A.Einsatzorte, { sitz: sitz(m), akt }));
    expect(t).toContain("Art");
    expect(t).toContain("Aktiv");
    expect(t).toMatch(/Quelle: von Hand/);
  });
  it("Standorte-Seite: Quelle, Bestätigung und Warnung über 100 m", () => {
    const m = betr({ geoPruefung: true }, { standorte: [{ id: "st1", name: "Zentrale", bundesland: "HE", lat: 50, lon: 8, radius: 200, koordinatenQuelle: "geraet" }] });
    const t = text(h(A.Standorte, { sitz: sitz(m), akt }));
    expect(t).toContain("Quelle: Gerät");
    expect(t).toContain("noch nicht bestätigt");
    const bestaetigt = betr({ geoPruefung: true }, { standorte: [{ id: "st1", name: "Zentrale", bundesland: "HE", lat: 50, lon: 8, radius: 200, koordinatenQuelle: "geraet", koordinatenGeprueftAm: "2026-10-30" }] });
    expect(text(h(A.Standorte, { sitz: sitz(bestaetigt), akt }))).toMatch(/bestätigt am 30\.10\.2026/);
  });
});
