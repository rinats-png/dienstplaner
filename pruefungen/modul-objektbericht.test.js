/* ==========================================================================
   MODUL OBJEKTBERICHT — Bericht je Objekt und Zeitraum (WP-19, Strang A)

   Vorläufig nach der Entscheidungsmatrix: aggregiert ohne Namen (O1 a),
   strukturierte Ereignisse ohne Freitext (O2 b), Soll aus der Planung, Ist
   aus der Dienstzeit, unbekannt heißt „ungeklärt“ (O3 a), CSV (O4). Das Modul
   bleibt „geplant“ und hat keine eigenen Betriebsfelder.
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { objektberichtDaten, objektberichtCsv, OBJEKTBERICHT_GRENZEN } from "../server/lib/modul-objektbericht.mjs";
import { BRANCHENMODULE, modulVon, pruefeModulRegistry } from "../server/lib/branchenmodule.mjs";
import { ObjektberichtVorschau } from "../src/module/objektbericht.jsx";

const TAG = "2026-11-02";
const K = (liste) => Object.fromEntries(liste.map((e) => [`${e.id}|${e.datum}`, e]));
const WB = (extra) => ({ id: "w1", datum: TAG, uhrzeit: "08:15", objektId: "o1", art: "kontrollgang", text: "Geheimer Freitext",
  einheitId: "e1", vonId: "pers-anna-7x", erfasst: "2026-11-02T08:20:00.000Z", ...extra });
const M = {
  objekte: [{ id: "o1", name: "Objekt Nord", standortId: null, posten: [
    { id: "po1", name: "Pforte; Haupt", soll: { F: 2 }, qualifikationen: [] },
    { id: "po2", name: "=HYPERLINK(x)", soll: { F: 1, S: 1 }, qualifikationen: [] }] }],
  dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00" }, { id: "S", name: "Spät", start: "14:00", ende: "22:00" }],
  postenPlan: { [`pers-anna-7x|${TAG}`]: "po1", [`pers-ben-9y|${TAG}`]: "po1", [`pers-cara-3z|${TAG}`]: "po2" },
  wachbuch: K([WB({ id: "w1" }), WB({ id: "w2", art: "vorkommnis", uhrzeit: "09:00", objektId: "o2" })]),
};
const dienstzeit = (datum, dienst) => (dienst === "F" ? ["pers-anna-7x", "pers-ben-9y"] : ["pers-cara-3z"]);
const bericht = (extra = {}) => objektberichtDaten(M, { objektId: "o1", von: TAG, bis: TAG, zugriff: "voll", dienstzeit, ...extra });

describe("Registry (keine eigenen Betriebsfelder)", () => {
  it("Modul „geplant“, nach Posten abhängig, ohne Datenfelder; Registry stimmig", () => {
    expect(modulVon("objektbericht")).toMatchObject({ pakete: ["sicherheit"], status: "geplant", abhaengigVon: ["posten"], datenfelder: [] });
    expect(pruefeModulRegistry()).toEqual([]);
    expect(BRANCHENMODULE.length).toBe(12);
  });
});

describe("Zugriff und Eingaben (O1 a, Planung und Leitung)", () => {
  it("nur mit Zugriff „voll“ entsteht ein Bericht", () => {
    expect(bericht({ zugriff: "einheit" }).grund).toMatch(/Planung und Leitung/);
    expect(bericht({ zugriff: "eigene" }).grund).toMatch(/Planung und Leitung/);
    expect(bericht({ zugriff: "keiner" }).grund).toMatch(/Planung und Leitung/);
  });
  it("Zeitraum und Objekt werden geprüft", () => {
    expect(bericht({ von: "2026-11-05", bis: "2026-11-01" }).grund).toMatch(/Zeitraum/);
    expect(bericht({ von: "2026-02-31" }).grund).toMatch(/Zeitraum/);
    expect(bericht({ bis: "2027-06-01" }).grund).toMatch(/höchstens/);
    expect(bericht({ objektId: "gibtsnicht" }).grund).toMatch(/Objekt unbekannt/);
    expect(OBJEKTBERICHT_GRENZEN.spanneTage).toBe(62);
  });
  it("ohne Dienstzeit-Funktion ist die Berechnung ein Fehler (kein stiller Wert)", () => {
    expect(() => objektberichtDaten(M, { objektId: "o1", von: TAG, bis: TAG, zugriff: "voll", dienstzeit: undefined })).toThrow(/Dienstzeit/);
  });
});

describe("Soll und Ist je Posten (O3 a)", () => {
  it("Soll aus der Planung, Ist aus der Dienstzeit, Fehlbestand je Zeile", () => {
    const { tage } = bericht();
    const zeilen = tage[0].zeilen.map((z) => [z.dienst, z.posten, z.soll, z.ist, z.fehlt, z.status]);
    expect(zeilen).toEqual([
      ["F", "po1", 2, 2, 0, "ok"],
      ["F", "po2", 1, 0, 1, "ok"],
      ["S", "po2", 1, 1, 0, "ok"],
    ]);
  });
  it("unbekannte Dienstzeit: „ungeklärt“ mit leeren Werten, nie „0“", () => {
    const { tage } = bericht({ dienstzeit: () => null });
    for (const z of tage[0].zeilen) expect([z.ist, z.fehlt, z.status]).toEqual([null, null, "ungeklärt"]);
  });
  it("Posten ohne Soll im Dienst erscheinen nicht", () => {
    const { tage } = bericht();
    expect(tage[0].zeilen.some((z) => z.dienst === "S" && z.posten === "po1")).toBe(false);
  });
});

describe("Datenschutz: keine Namen, keine Personenkennungen, kein Freitext (O1 a, O2 b)", () => {
  it("der Bericht enthält weder Personenkennungen noch den Freitext eines Eintrags", () => {
    const b = bericht();
    const text = JSON.stringify(b);
    expect(text).not.toMatch(/pers-/);
    expect(text).not.toMatch(/Geheimer Freitext/);
    expect(text).not.toMatch(/vonId/);
  });
  it("Ereignisse nur mit Datum, Uhrzeit und Art, nur des Objekts im Zeitraum", () => {
    const { ereignisse } = bericht();
    expect(ereignisse).toEqual([{ datum: TAG, uhrzeit: "08:15", art: "kontrollgang" }]);
  });
});

describe("Reproduzierbarkeit (Grundsatz des Berichts)", () => {
  it("gleiche Daten und Zeitraum, gleiches Ergebnis; Reihenfolge der Dienste bleibt stabil", () => {
    expect(JSON.stringify(bericht())).toBe(JSON.stringify(bericht()));
  });
});

describe("CSV (O4 b)", () => {
  it("Kopf, Objekt, Zeitraum, Zeilen und Ereignisse mit Semikolon und CRLF", () => {
    const csv = objektberichtCsv(bericht());
    expect(csv.split("\r\n")[0]).toBe("Objekt;Objekt Nord");
    expect(csv).toMatch(/Zeitraum;2026-11-02;2026-11-02/);
    expect(csv).toMatch(/Datum;Dienst;Posten;Soll;Ist;Fehlt;Status/);
    expect(csv).toMatch(/\r\n$/);
  });
  it("Sonderzeichen werden gequotet, Formeln entschärft", () => {
    const csv = objektberichtCsv(bericht());
    expect(csv).toMatch(/"Pforte; Haupt"/);
    expect(csv).toMatch(/'=HYPERLINK\(x\)/);
    expect(csv).not.toMatch(/;=HYPERLINK/);
  });
  it("ungeklärte Zeilen haben leere Ist- und Fehlt-Felder", () => {
    const csv = objektberichtCsv(bericht({ dienstzeit: () => null }));
    expect(csv).toMatch(/2026-11-02;F;"Pforte; Haupt";2;;;ungeklärt/);
  });
  it("ohne gültigen Bericht ist die CSV leer", () => {
    expect(objektberichtCsv(bericht({ zugriff: "keiner" }))).toBe("");
  });
});

describe("Darstellung", () => {
  it("ohne Zugriff: nur der Hinweis, keine Zahlen", () => {
    const html = renderToStaticMarkup(h(ObjektberichtVorschau, { m: M, von: TAG, bis: TAG, zugriff: "keiner", dienstzeit }));
    expect(html).toMatch(/nur für Planung und Leitung/);
    expect(html).not.toMatch(/besetzt/);
  });
  it("mit Zugriff: Zahlen, und „Dienstzeit ungeklärt“ wo nichts bekannt ist", () => {
    const html = renderToStaticMarkup(h(ObjektberichtVorschau, { m: M, von: TAG, bis: TAG, zugriff: "voll", dienstzeit: () => null }));
    expect(html).toMatch(/Dienstzeit ungeklärt/);
    expect(html).not.toMatch(/pers-/);
  });
  it("ohne Objekte: Leerhinweis", () => {
    expect(renderToStaticMarkup(h(ObjektberichtVorschau, { m: {}, von: TAG, bis: TAG, zugriff: "voll" }))).toMatch(/Noch keine Objekte/);
  });
});
