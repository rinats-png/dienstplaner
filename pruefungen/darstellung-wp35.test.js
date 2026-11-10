/* WP-35 Darstellungsbefunde: Quelltextpruefung zur Browserprobe pruefungen/browser/darstellung-wp35.mjs.
   Die Probe misst bei 360/390/430 px (Edge, Wegwerfdaten); diese Datei haelt fest, dass die
   Mittel dafuer im Quelltext stehen: Zeilenkarten der Abrechnungsdaten bis 480 px, umbrechende
   Reiterleiste, Geo-Schalter nur fuer die Leitung (org.edit) und lokal sofort umgeschaltet. */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const lies = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const abrechnung = lies("src/ansichten/abrechnungsdaten.jsx");
const app = lies("src/App.jsx");
const geo = lies("src/ansichten/geo-schalter.jsx");
const stammdaten = lies("src/app/aktionen/stammdaten.js");

describe("WP-35: Abrechnungsdaten ohne Querscrollen bis 430 px", () => {
  it("die Personentabelle traegt die Stapelklasse und je Zelle eine Beschriftung", () => {
    expect(abrechnung).toMatch(/className="raster raster-stapel"/);
    for (const k of ["Gearbeitet", "Nacht", "Sonntag", "Feiertag", "Samstag", "Zuschlagswert"]) {
      expect(abrechnung).toContain(k);
    }
    expect(abrechnung).toMatch(/data-label=\{kopf\}/);
    expect(abrechnung).toMatch(/data-label="Zuschlagswert"/);
  });
  it("die Stilregel gilt bis 480 px und hebt die Mindestbreite auf", () => {
    const m = app.match(/@media \(max-width: 480px\)\{([\s\S]*?)\n\}/);
    expect(m).not.toBeNull();
    expect(m[1]).toMatch(/table\.raster-stapel\{min-width:0 !important/);
    expect(m[1]).toMatch(/content:attr\(data-label\)/);
    /* Spaltenkoepfe bleiben fuer Vorlesesoftware im Dokument */
    expect(m[1]).toMatch(/table\.raster-stapel thead\{position:absolute/);
    expect(m[1]).not.toMatch(/thead\{display:none/);
  });
  it("die Reiterleiste bricht um statt innen zu scrollen", () => {
    expect(abrechnung).toMatch(/className="seg-umbruch"/);
    expect(app).toMatch(/\.seg-umbruch \.seg\{flex-wrap:wrap; overflow-x:visible;\}/);
  });
});

describe("WP-35: Geo-Schalter", () => {
  it("schaltet die Anzeige lokal sofort um (mUpd), der Server bestaetigt danach", () => {
    expect(stammdaten).toMatch(/setzeGeoPruefung: \(an\) => mUpd\(/);
    expect(stammdaten).toMatch(/setzeGeoModus: \(modus\) => mUpd\(/);
  });
  it("Einschalten verlangt weiter die Bestaetigung der betrieblichen Pruefung", () => {
    expect(geo).toMatch(/disabled=\{!geprueft\}/);
    expect(geo).toMatch(/disabled=\{!modusGeprueft\}/);
  });
  it("die Karte steht nur im Betriebsbereich, den die Leitung (org.edit) bekommt", () => {
    expect(app).toMatch(/Die Betriebsverwaltung ist der Organisationsleitung vorbehalten/);
    expect(app).toMatch(/\["betrieb", "Betrieb", "org\.edit"\]|<GeoSchalter sitz=\{sitz\} akt=\{akt\} \/>/);
  });
});
