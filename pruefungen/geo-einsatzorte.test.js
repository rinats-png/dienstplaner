/* ==========================================================================
   EINSATZORTE JE DIENST, GEO-MODI, AUSSENDIENST (WP-20)

   Bis hierher prüfte die Stempeluhr nur gegen den Standort der Einheit. Jetzt
   kann eine Dienstart ihren eigenen Referenzort haben (ortModus):
     standort     (Vorgabe) der Standort der Einheit am Tag
     einsatzort   ein Einsatzort des Betriebs (dienstart.einsatzortId)
     aussendienst kein fester Ort: nichts wird gemessen oder verglichen
   und der Betrieb wählt, wie streng geprüft wird (einstellungen.geoModus):
     aus (geoPruefung false) | hinweis (Vorgabe, wenn an) | pflicht
   „pflicht" lehnt nie ab (E3: Die Arbeitszeit wird immer erfasst), sondern
   markiert das Ergebnis ORT_PRUEFEN, damit die Leitung es klärt.

   Der Server entscheidet; die Koordinate des Geräts ist nur Eingabe. Dauerhaft
   gespeichert werden Ergebnis, Grund, Abstandsklasse und (nur am Standort) die
   grob gerundete Entfernung — nie eine Rohkoordinate.
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { vorschau, raeumen, stichtage } from "../server/lib/aufbewahrung.mjs";
import {
  geoUrteil, geoModus, dienstOrtModus, abstandsklasse, dienstartOrtFehler, bestandDienstartOrtFehler, bestandStandorteFehler,
  INNERHALB, AUSSERHALB, NICHT_BEWERTBAR,
} from "../server/lib/geo.mjs";

const ZENTRALE = { lat: 50, lon: 8 };
const KUNDE = { lat: 51, lon: 9 };                      // rund 130 km weg
const M_JE_GRAD = (2 * Math.PI * 6371000) / 360;
const nord = (p, meter) => ({ lat: p.lat + meter / M_JE_GRAD, lon: p.lon });
const DATUM = "2026-10-30";

const betrieb = ({ geo = true, modus, dienstarten, einsatzorte } = {}) => ({
  id: "m-a", einstellungen: { geoPruefung: geo, ...(modus ? { geoModus: modus } : {}) },
  einheiten: [{ id: "e1", standortId: "st1" }],
  standorte: [{ id: "st1", name: "Zentrale", bundesland: "HE", ...ZENTRALE, radius: 200 }],
  einsatzorte: einsatzorte || [{ id: "es1", name: "Kunde Nord", ...KUNDE, radius: 100 }],
  dienstarten: dienstarten || [
    { id: "F", name: "Früh", start: "06:00", ende: "14:00" },
    { id: "E", name: "Kundentermin", start: "08:00", ende: "16:00", ortModus: "einsatzort", einsatzortId: "es1" },
    { id: "A", name: "Außendienst", start: "08:00", ende: "16:00", ortModus: "aussendienst" },
    { id: "X", name: "Einsatz ohne Ziel", start: "08:00", ende: "16:00", ortModus: "einsatzort", einsatzortId: "gibtsnicht" },
    { id: "K", name: "Einsatz ohne Koordinate", start: "08:00", ende: "16:00", ortModus: "einsatzort", einsatzortId: "es2" },
  ],
  abweichungen: {},
});
const PERSON = { id: "a1", zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }] };
const urteil = (dienst, p, opt = {}, genau = 10) => {
  const m = betrieb(opt);
  m.abweichungen = { [`a1|${DATUM}`]: dienst };
  return geoUrteil({ m, person: PERSON, datum: DATUM, messung: p ? { ...p, accuracy: genau } : null });
};

describe("Referenzort je Dienst", () => {
  it("ohne ortModus: wie bisher der Standort der Einheit", () => {
    const u = urteil("F", nord(ZENTRALE, 40));
    expect([u.geo.status, u.geo.referenz]).toEqual([INNERHALB, { art: "standort", id: "st1", name: "Zentrale" }]);
    expect(dienstOrtModus({ id: "F" })).toBe("standort");
    expect(dienstOrtModus({ ortModus: "unsinn" })).toBe("standort");
  });
  it("Einsatzort: Referenz ist der Einsatzort, nicht der Betriebsstandort", () => {
    const am = urteil("E", nord(KUNDE, 30));
    expect([am.geo.status, am.geo.referenz]).toEqual([INNERHALB, { art: "einsatzort", id: "es1", name: "Kunde Nord" }]);
    /* An der Zentrale ist das beim Kundentermin AUSSERHALB — beim Frühdienst wäre es innerhalb. */
    const zentrale = urteil("E", nord(ZENTRALE, 5));
    expect(zentrale.geo.status).toBe(AUSSERHALB);
    expect(urteil("F", nord(ZENTRALE, 5)).geo.status).toBe(INNERHALB);
  });
  it("Einsatzort: der Umkreis des Einsatzorts gilt (100 m), nicht der des Standorts (200 m)", () => {
    expect(urteil("E", nord(KUNDE, 80)).geo.status).toBe(INNERHALB);
    expect(urteil("E", nord(KUNDE, 150)).geo.status).toBe(AUSSERHALB);    // innerhalb 200, außerhalb 100
    /* Ohne Radius am Einsatzort gilt die Vorgabe 200 m. */
    const o = [{ id: "es1", name: "Kunde Nord", ...KUNDE }];
    expect(urteil("E", nord(KUNDE, 150), { einsatzorte: o }).geo.status).toBe(INNERHALB);
  });
  it("Einsatzort unbekannt oder ohne Koordinate: nicht bewertbar — nie ein Rückfall auf den Betriebsstandort", () => {
    const an = nord(ZENTRALE, 5);                                        // läge am Betriebsstandort innerhalb
    const u = urteil("X", an);
    expect([u.geo.status, u.geo.grund, u.innerhalb]).toEqual([NICHT_BEWERTBAR, "kein_referenzort", null]);
    const ohneKoordinate = urteil("K", an, { einsatzorte: [{ id: "es2", name: "Ohne" }] });
    expect(ohneKoordinate.geo.grund).toBe("keine_koordinate_am_referenzort");
  });
  it("kein Dienst an dem Tag (ungeplant): Standort der Einheit", () => {
    const u = urteil(undefined, nord(ZENTRALE, 40));
    expect([u.geo.status, u.geo.referenz.art]).toEqual([INNERHALB, "standort"]);
  });
});

describe("Außendienst", () => {
  it("kein fester Ort: nicht bewertbar mit Grund aussendienst; keine Entfernung, keine Abstandsklasse", () => {
    for (const p of [nord(ZENTRALE, 5), nord(KUNDE, 5), { lat: 10, lon: 10 }, null]) {
      const u = urteil("A", p);
      expect([u.geo.status, u.geo.grund, u.geprueft, u.innerhalb]).toEqual([NICHT_BEWERTBAR, "aussendienst", false, null]);
      expect(u.geo.referenz).toEqual({ art: "aussendienst", id: null, name: "Außendienst" });
      expect([u.geo.entfernungGerundet, u.geo.abstandsklasse, u.geo.genauigkeitM]).toEqual([null, null, null]);
      expect(u.text).toBe("Außendienst — ohne festen Ort");
    }
  });
  it("auch im Pflichtmodus keine Markierung (kein Ort, nichts zu klären)", () => {
    expect(urteil("A", nord(KUNDE, 5), { modus: "pflicht" }).markierungen).toEqual([]);
  });
  it("die mitgeschickte Koordinate beeinflusst nichts und steht nirgends im Ergebnis", () => {
    const u = urteil("A", { lat: 12.3456789, lon: 23.4567891 });
    const roh = JSON.stringify(u);
    expect(roh).not.toContain("12.3456789");
    expect(roh).not.toContain("23.4567891");
  });
});

describe("Modi: aus, hinweis, pflicht", () => {
  it("geoModus leitet aus Schalter und Einstellung ab; unbekannte Werte sind hinweis", () => {
    expect(geoModus(betrieb({ geo: false }))).toBe("aus");
    expect(geoModus(betrieb({ geo: false, modus: "pflicht" }))).toBe("aus");     // Pflicht ohne Schalter wirkt nicht
    expect(geoModus(betrieb())).toBe("hinweis");
    expect(geoModus(betrieb({ modus: "hinweis" }))).toBe("hinweis");
    expect(geoModus(betrieb({ modus: "pflicht" }))).toBe("pflicht");
    expect(geoModus(betrieb({ modus: "streng" }))).toBe("hinweis");
    expect(geoModus(null)).toBe("aus");
  });
  it("aus: nichts gemessen, auch nicht beim Einsatzort", () => {
    for (const d of ["F", "E", "A"]) {
      const u = urteil(d, nord(KUNDE, 5), { geo: false, modus: "pflicht" });
      expect([u.geo.grund, u.geo.entfernungGerundet, u.geo.abstandsklasse, u.markierungen]).toEqual(["pruefung_aus", null, null, []]);
    }
  });
  it("hinweis: Ergebnis ohne Markierung, auch außerhalb", () => {
    const u = urteil("E", nord(ZENTRALE, 5));
    expect([u.geo.status, u.markierungen]).toEqual([AUSSERHALB, []]);
  });
  it("pflicht: außerhalb, fehlende Position und unbewertbare Messung werden ORT_PRUEFEN — die Zeit bleibt gespeichert", () => {
    const pflicht = { modus: "pflicht" };
    expect(urteil("E", nord(ZENTRALE, 5), pflicht).markierungen).toEqual(["ORT_PRUEFEN"]);               // außerhalb
    expect(urteil("E", null, pflicht).markierungen).toEqual(["ORT_PRUEFEN"]);                             // keine Position
    expect(urteil("E", nord(KUNDE, 5), pflicht, 5000).markierungen).toEqual(["ORT_PRUEFEN"]);             // zu ungenau
    expect(urteil("X", nord(ZENTRALE, 5), pflicht).markierungen).toEqual(["ORT_PRUEFEN"]);                // Ziel fehlt
    expect(urteil("E", nord(KUNDE, 5), pflicht).markierungen).toEqual([]);                                // innerhalb
    expect(urteil("F", nord(ZENTRALE, 5), pflicht).markierungen).toEqual([]);
    expect(urteil("E", nord(ZENTRALE, 5), pflicht).geo.status).toBe(AUSSERHALB);                          // Urteil bleibt Urteil, keine Ablehnung
  });
});

describe("Abstandsklasse statt Koordinate", () => {
  it("Klassen: innerhalb, bis 1 km, bis 5 km, darüber; unbekannt ohne Messung", () => {
    expect(abstandsklasse(INNERHALB, 40)).toBe("innerhalb");
    expect(abstandsklasse(AUSSERHALB, 500)).toBe("bis_1km");
    expect(abstandsklasse(AUSSERHALB, 1000)).toBe("bis_1km");
    expect(abstandsklasse(AUSSERHALB, 1001)).toBe("bis_5km");
    expect(abstandsklasse(AUSSERHALB, 5000)).toBe("bis_5km");
    expect(abstandsklasse(AUSSERHALB, 5001)).toBe("ueber_5km");
    expect(abstandsklasse(NICHT_BEWERTBAR, 300)).toBe("bis_1km");
    expect(abstandsklasse(NICHT_BEWERTBAR, null)).toBeNull();
    expect(abstandsklasse(AUSSERHALB, NaN)).toBeNull();
  });
  it("Standort: grob gerundete Entfernung und Klasse; Einsatzort: nur die Klasse", () => {
    const st = urteil("F", nord(ZENTRALE, 2600));
    expect([st.geo.entfernungGerundet, st.geo.abstandsklasse]).toEqual(["2600", "bis_5km"]);
    const es = urteil("E", nord(KUNDE, 2600));
    expect([es.geo.entfernungGerundet, es.geo.abstandsklasse]).toEqual([null, "bis_5km"]);
    expect(urteil("E", nord(KUNDE, 20)).geo.abstandsklasse).toBe("innerhalb");
  });
  it("keine Rohkoordinate im Ergebnis, in keinem Modus", () => {
    for (const d of ["F", "E", "A", "X"]) {
      const p = { lat: 50.0012345, lon: 8.0054321 };
      const roh = JSON.stringify(geoUrteil({ m: (() => { const m = betrieb({ modus: "pflicht" }); m.abweichungen = { [`a1|${DATUM}`]: d }; return m; })(),
        person: PERSON, datum: DATUM, messung: { ...p, accuracy: 9 } }));
      expect(roh, d).not.toContain("50.0012345");
      expect(roh, d).not.toContain("8.0054321");
    }
  });
});

describe("Einsatzorte und Dienstarten beim Schreiben prüfen", () => {
  const alt = betrieb();
  const mit = (aenderung) => ({ ...alt, dienstarten: alt.dienstarten.map((d) => d.id === "F" ? { ...d, ...aenderung } : d) });
  it("gültig: standort, aussendienst, einsatzort mit vorhandenem Ziel", () => {
    expect(dienstartOrtFehler(alt.dienstarten, mit({ ortModus: "standort" }).dienstarten, alt.einsatzorte)).toBeNull();
    expect(dienstartOrtFehler(alt.dienstarten, mit({ ortModus: "aussendienst" }).dienstarten, alt.einsatzorte)).toBeNull();
    expect(dienstartOrtFehler(alt.dienstarten, mit({ ortModus: "einsatzort", einsatzortId: "es1" }).dienstarten, alt.einsatzorte)).toBeNull();
  });
  it("ungültig: unbekannter Modus, Einsatzort ohne Ziel, Ziel nicht vorhanden, Ziel kein String", () => {
    for (const f of [{ ortModus: "ueberall" }, { ortModus: 1 }, { ortModus: "einsatzort" }, { ortModus: "einsatzort", einsatzortId: "nix" },
      { ortModus: "einsatzort", einsatzortId: 5 }, { ortModus: "einsatzort", einsatzortId: "" }])
      expect(dienstartOrtFehler(alt.dienstarten, mit(f).dienstarten, alt.einsatzorte), JSON.stringify(f)).toMatch(/Früh/);
  });
  it("Altbestand blockiert nicht: ein früher gespeicherter Fehler bleibt unbeanstandet, solange er unverändert ist", () => {
    const kaputt = { id: "Z", name: "Alt", ortModus: "einsatzort", einsatzortId: "weg" };
    expect(dienstartOrtFehler([kaputt], [kaputt, { id: "N", name: "Neu" }], alt.einsatzorte)).toBeNull();
    expect(dienstartOrtFehler([kaputt], [{ ...kaputt, einsatzortId: "noch-weg" }], alt.einsatzorte)).toMatch(/Alt/);
  });
  it("über den ganzen Bestand (Betrieb zugeordnet über die Kennung)", () => {
    const neu = { mandanten: [mit({ ortModus: "einsatzort", einsatzortId: "nix" })] };
    expect(bestandDienstartOrtFehler({ mandanten: [alt] }, neu)).toMatch(/Früh/);
    expect(bestandDienstartOrtFehler({ mandanten: [alt] }, { mandanten: [alt] })).toBeNull();
  });
  it("Einsatzorte haben dieselben Wertebereiche wie Standorte (Breite, Länge, Umkreis)", () => {
    const b = (e) => ({ mandanten: [{ id: "m-a", einsatzorte: [e] }] });
    expect(bestandStandorteFehler({ mandanten: [] }, b({ id: "x", name: "Kunde", lat: 51, lon: 9, radius: 100 }))).toBeNull();
    for (const f of [{ lat: 450 }, { lon: -220 }, { radius: 0 }, { radius: 10000 }])
      expect(bestandStandorteFehler({ mandanten: [] }, b({ id: "x", name: "Kunde", lat: 51, lon: 9, radius: 100, ...f })), JSON.stringify(f)).toMatch(/Kunde/);
  });
  it("ein von einer Dienstart verwendeter Einsatzort lässt sich nicht entfernen", () => {
    const neu = { ...alt, einsatzorte: [] };
    expect(dienstartOrtFehler(alt.dienstarten, neu.dienstarten, neu.einsatzorte, alt.einsatzorte)).toMatch(/Kundentermin/);
  });
});

/* ---- Aufbewahrung (WP-26-Fristen): Standort-Ergebnisse gehen mit der kurzen Frist, Zeiten bleiben ---- */
describe("Aufbewahrung der Standort-Ergebnisse", () => {
  const HEUTE = "2026-11-03";
  const geoFelder = { ortStart: "Am Standort", innerhalbStart: true, geprueftStart: true, geoStart: { status: "INNERHALB" },
    ortEnde: "Am Standort", innerhalbEnde: true, geprueftEnde: true, geoEnde: { status: "INNERHALB" } };
  const stempel = { start: "06:00", ende: "14:00", startAm: "x", endeAm: "y", markierungen: ["ORT_PRUEFEN"], ...geoFelder };
  const m = () => ({ id: "m-a", personen: [], aufbewahrung: {},
    einstempeln: { "a1|2026-05-10": { ...stempel }, "a1|2026-10-10": { ...stempel }, "a1|2024-01-10": { ...stempel } },
    erfassung: {}, abweichungen: {} });
  it("Stichtag der Standort-Ergebnisse ist der der Gründe (Vorgabe 3 Monate), nicht der der Plandaten", () => {
    expect(stichtage(m(), HEUTE).standort).toBe(stichtage(m(), HEUTE).grund);
    expect(stichtage(m(), HEUTE).standort > stichtage(m(), HEUTE).plan).toBe(true);
  });
  it("Vorschau zählt nur Einträge zwischen den Stichtagen; ältere zählen bei den Plandaten", () => {
    const v = vorschau(m(), HEUTE);
    expect(v.standort).toBe(1);
    expect(v.plandaten.einstempeln).toBe(1);
    expect(v.gesamt).toBe(v.planSumme + v.standort + v.aenderungen + v.gruende + v.personen.length);
  });
  it("Löschlauf: Standort-Felder fort, Zeiten und Markierung bleiben, Neues unberührt, Uraltes ganz weg", () => {
    const { mandant, bericht } = raeumen(m(), HEUTE);
    const alt = mandant.einstempeln["a1|2026-05-10"];
    expect(alt).toEqual({ start: "06:00", ende: "14:00", startAm: "x", endeAm: "y", markierungen: ["ORT_PRUEFEN"] });
    for (const f of Object.keys(geoFelder)) expect(alt, f).not.toHaveProperty(f);
    expect(mandant.einstempeln["a1|2026-10-10"]).toMatchObject({ geoStart: { status: "INNERHALB" }, ortEnde: "Am Standort" });
    expect(mandant.einstempeln["a1|2024-01-10"]).toBeUndefined();
    expect(bericht.standort).toBe(1);
  });
  it("ein zweiter Lauf findet nichts mehr", () => {
    const einmal = raeumen(m(), HEUTE).mandant;
    expect(vorschau(einmal, HEUTE).standort).toBe(0);
  });
});
