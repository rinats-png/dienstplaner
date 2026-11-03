/* ==========================================================================
   EINSATZORTE UND PRÜFMODUS IN DER OBERFLÄCHE (WP-20)

   Gerendert wird, was React tatsächlich zeigt: der Prüfmodus im Schalter, die
   Verwaltung der Einsatzorte, ihre Verdrahtung mit den Aktionen, und die
   Anzeige eines gespeicherten Befunds (Außendienst, Einsatzort ohne Zahl,
   Markierung „Ort nicht bestätigt").
   ========================================================================== */
import { describe, it, expect, beforeAll } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { geoAnzeige, MARKIERUNG_TEXT } from "../src/stempelvorgang.js";
import { GEO_MODUS_TEXT } from "../server/lib/geo.mjs";

let A;
beforeAll(async () => { A = await import("../src/App.jsx"); }, 120000);

const betrieb = (e = {}, extra = {}) => {
  const m = A.leererMandant("Geo-UI", "pflege");
  m.einstellungen = { ...m.einstellungen, ...e };
  return Object.assign(m, extra);
};
const sitz = (m) => ({ rolle: "kunde", db: { mandanten: [m] }, mandant: m, person: null });
const text = (el) => renderToStaticMarkup(el).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const aufnahme = () => { const log = []; return { log, akt: new Proxy({}, { get: (_, n) => (...a) => { log.push([n, a]); } }) }; };
/** Eine Funktionskomponente innerhalb eines echten Renders aufrufen (Hooks laufen) und ihren Elementbaum nehmen. */
const baumVon = (komp, props) => { let aus; renderToStaticMarkup(h(() => { aus = komp(props); return null; })); return aus; };
/** Alle Elemente mit onClick im Baum einer Funktionskomponente (ohne Hooks: nur der erste Render). */
const knoepfe = (baum) => {
  const aus = [];
  const such = (n) => {
    if (!n || typeof n !== "object") return;
    if (Array.isArray(n)) return n.forEach(such);
    if (n.props && typeof n.props.onClick === "function") aus.push(n);
    if (n.props) such(n.props.children);
  };
  such(baum);
  return aus;
};

describe("Prüfmodus im Schalter", () => {
  const schalter = (e) => text(h(A.GeoSchalter, { sitz: sitz(betrieb(e)), akt: aufnahme().akt }));
  it("ausgeschaltet: kein Modus zur Wahl", () => {
    expect(schalter({ geoPruefung: false })).not.toContain("Prüfmodus");
  });
  it("eingeschaltet, ohne Angabe: Hinweis; Pflicht verlangt die Mitbestimmungs-Bestätigung (Text vom Server)", () => {
    const t = schalter({ geoPruefung: true });
    expect(t).toContain("Prüfmodus: Hinweis");
    expect(t).toContain(GEO_MODUS_TEXT);
    expect(t).toContain("Außendienst gibt es keinen festen Ort");
  });
  it("Pflicht: erklärt die Markierung und bietet die Rückstellung an", () => {
    const t = schalter({ geoPruefung: true, geoModus: "pflicht" });
    expect(t).toContain("Prüfmodus: verpflichtend");
    expect(t).toContain("Ort nicht bestätigt");
    expect(t).toContain("Auf Hinweis zurückstellen");
    expect(t).toContain("Die Arbeitszeit wird trotzdem erfasst");
  });
  it("Rückstellung ruft setzeGeoModus(hinweis) (echte Verdrahtung)", () => {
    const { log, akt } = aufnahme();
    const baum = baumVon(A.GeoSchalter, { sitz: sitz(betrieb({ geoPruefung: true, geoModus: "pflicht" })), akt });
    const k = knoepfe(baum).find((x) => text(x.props.children) === "Auf Hinweis zurückstellen");
    expect(k).toBeTruthy();
    k.props.onClick();
    expect(log).toEqual([["setzeGeoModus", ["hinweis"]]]);
  });
});

describe("Einsatzorte verwalten", () => {
  const orte = [{ id: "eo1", name: "Kunde Nord", lat: 51, lon: 9, radius: 100 }, { id: "eo2", name: "Ohne Koordinate" }];
  const dienste = [{ id: "E", name: "Kundentermin", ortModus: "einsatzort", einsatzortId: "eo1" }];
  const seite = (extra) => text(h(A.Einsatzorte, { sitz: sitz(betrieb({}, { einsatzorte: orte, dienstarten: dienste, ...extra })), akt: aufnahme().akt }));
  it("zeigt Orte, Prüfbarkeit und welche Dienstart sie verwendet; warnt vor Personennamen", () => {
    const t = seite();
    expect(renderToStaticMarkup(h(A.Einsatzorte, { sitz: sitz(betrieb({}, { einsatzorte: orte, dienstarten: dienste })), akt: aufnahme().akt })))
      .toContain('value="Kunde Nord"');
    expect(t).toContain("Prüfung möglich");
    expect(t).toContain("Ohne Koordinate „nicht bewertbar“");
    expect(t).toContain("verwendet von Kundentermin");
    expect(t).toContain("keinen Personennamen");
  });
  it("Entfernen eines verwendeten Einsatzorts ist gesperrt, eines freien nicht", () => {
    const html = renderToStaticMarkup(h(A.Einsatzorte, { sitz: sitz(betrieb({}, { einsatzorte: orte, dienstarten: dienste })), akt: aufnahme().akt }));
    const knoepfeHtml = [...html.matchAll(/<button[^>]*>(?:(?!<\/button>).)*Entfernen<\/button>/g)].map((x) => x[0]);
    expect(knoepfeHtml.length).toBe(2);
    expect(knoepfeHtml[0]).toMatch(/disabled/);
    expect(knoepfeHtml[1]).not.toMatch(/disabled/);
  });
  it("Entfernen eines freien Orts ruft loescheEinsatzort mit der Kennung", () => {
    const { log, akt } = aufnahme();
    const baum = baumVon(A.Einsatzorte, { sitz: sitz(betrieb({}, { einsatzorte: orte, dienstarten: dienste })), akt });
    const frei = knoepfe(baum).filter((x) => text(x.props.children) === "Entfernen" && !x.props.disabled);
    expect(frei.length).toBe(1);
    frei[0].props.onClick();
    expect(log).toEqual([["loescheEinsatzort", ["eo2"]]]);
  });
});

describe("Anzeige eines gespeicherten Befunds", () => {
  const e = (geo) => ({ start: "08:00", geoStart: geo });
  it("Außendienst: eigener Text, keine Entfernung", () => {
    const g = geoAnzeige(e({ status: "NICHT_BEWERTBAR", grund: "aussendienst", entfernungGerundet: null, abstandsklasse: null, referenz: { art: "aussendienst", name: "Außendienst" } }), "Start");
    expect(g.text).toBe("Außendienst — ohne festen Ort");
    expect(g.entfernung).toBe("");
  });
  it("Einsatzort außerhalb: nur die Abstandsklasse in Worten", () => {
    const g = geoAnzeige(e({ status: "AUSSERHALB", grund: null, entfernungGerundet: null, abstandsklasse: "bis_5km", referenz: { art: "einsatzort", name: "Kunde Nord" } }), "Start");
    expect([g.text, g.entfernung, g.referenz]).toEqual(["Standort abweichend", "1 bis 5 km", "Kunde Nord"]);
  });
  it("Standort wie bisher: gerundete Entfernung", () => {
    const g = geoAnzeige(e({ status: "AUSSERHALB", grund: null, entfernungGerundet: "2600", abstandsklasse: "bis_5km", referenz: { name: "Zentrale" } }), "Start");
    expect(g.entfernung).toBe("ca. 2,6 km");
  });
  it("Markierung ORT_PRUEFEN hat einen Text", () => {
    expect(MARKIERUNG_TEXT.ORT_PRUEFEN).toBe("Ort nicht bestätigt — bitte klären");
  });
});
