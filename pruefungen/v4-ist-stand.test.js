/* ==========================================================================
   V4-IST (2026-11-21): Formebene im Inventarwerkzeug (werkzeug/v4-inventar.mjs).

   Anlass: Das Inventar meldete „0 % Formensystem“, weil es nur <V4Karte/V4Knopf/…> zählte. Die V4-Form erreicht die
   Oberfläche heute aber über die Oberflächenschicht (src/v4/app-stil.js) auf den Altklassen .karte/.btn/.inp/…, die
   die Bausteine (Card, Btn, Inp, Seitenkarte, Fenster …) setzen. Geprüft: Klassenwörter auch aus Ternären,
   Formträger aus Bausteinen, Formstufe in fester Rangfolge, Form-Literale, sichtbarer Nenner, Hauptansichten,
   Determinismus und Nenner-Invarianten am echten Bestand. Keine Uhr, kein Netz, keine Kindprozesse.
   Aufruf: npx vitest run pruefungen/v4-ist-stand.test.js
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  klassenWoerter, formKlassen, formTraegerIn, formKennzahlen, formStufe, formErreicht, farbStufe, FORM_STUFEN,
  NUR_LAYOUT_KLASSEN, hauptansicht, HAUPTANSICHTEN, HAUPTANSICHT_DATEIEN, inventar, zusammenfassung,
  hauptansichtenMarkdown, kennzahlen,
} from "../werkzeug/v4-inventar.mjs";
import { V4_APP_KLASSEN } from "../src/v4/app-stil.js";

const WURZEL = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const lies = (p) => readFileSync(join(WURZEL, p), "utf8").replace(/\r\n/g, "\n");

describe("Klassenwörter und Formträger", () => {
  it("liest Klassen auch aus Ternären und Vorlagen, nicht aus anderen Attributen", () => {
    const t = '<a className={still ? "karte-still" : "karte"} /><b className={`btn btn-${k} ${x}`} /><i title="inp" />';
    expect(klassenWoerter(t)).toEqual(["karte-still", "karte", "btn", "btn-"]);
  });

  it("Formklassen ohne reine Layoutklassen", () => {
    const fk = formKlassen(V4_APP_KLASSEN);
    for (const k of NUR_LAYOUT_KLASSEN) expect(fk).not.toContain(k);
    expect(fk).toContain("karte");
    expect(fk).toContain("btn");
  });

  it("Formträger: exportierte Komponente mit Formklasse; lokale Helfer und Layoutklassen zählen nicht", () => {
    const t = [
      'export const Card = ({ still }) => <div className={`${still ? "karte-still" : "karte"}`} />;',
      'export const Fuss = () => <div className="fussleiste noprint" />;',
      "export function Marke() { return <svg />; }",
      'function helfer() { return <button className="btn" />; }',
    ].join("\n");
    expect(formTraegerIn(t, formKlassen(V4_APP_KLASSEN))).toEqual(["Card"]);
  });

  it("die echten Bausteine Card, Btn, Inp, Sel, Seitenkarte, Fenster sind Formträger", async () => {
    const inv = await inventar();
    for (const n of ["Card", "Btn", "Inp", "Sel", "Seitenkarte", "Fenster"]) expect(inv.formTraeger).toContain(n);
  }, 60000);
});

describe("Formkennzahlen und Stufen", () => {
  const ov = V4_APP_KLASSEN;
  it("Baustein zählt nur, wenn importiert", () => {
    const mit = formKennzahlen('import { Card } from "../ui/bausteine.jsx";\n<Card>x</Card>', ov, ["Card"]);
    const ohne = formKennzahlen("const Card = () => null;\n<Card>x</Card>", ov, ["Card"]);
    expect(mit.formBaustein).toBe(1);
    expect(ohne.formBaustein).toBe(0);
  });

  it("Form-Literale: borderRadius als Zahl und boxShadow als Literal; Token-Werte nicht", () => {
    const k = formKennzahlen('style={{ borderRadius: 8, boxShadow: "0 1px 2px x" }} style={{ borderRadius: "var(--v4-r-gross)" }}', ov);
    expect(k.formLiterale).toBe(2);
  });

  it("sichtbar nur mit Markup; reine Logik ist nicht sichtbar", () => {
    expect(formKennzahlen("export const a = 1;", ov).sichtbar).toBe(false);
    expect(formKennzahlen("return <div>x</div>;", ov).sichtbar).toBe(true);
  });

  it("Rangfolge der Formstufen", () => {
    const basis = { v4Baustein: 0, formDirekt: 0, formBaustein: 0, tokenVar: 0, sichtbar: true };
    expect(formStufe({ ...basis, v4Baustein: 1, formDirekt: 3 })).toBe("V4-Baustein");
    expect(formStufe({ ...basis, formDirekt: 1, formBaustein: 2 })).toBe("Overlay direkt");
    expect(formStufe({ ...basis, formBaustein: 2, tokenVar: 1 })).toBe("Overlay über Baustein");
    expect(formStufe({ ...basis, tokenVar: 1 })).toBe("Token direkt");
    expect(formStufe(basis)).toBe("ohne V4-Form");
    expect(formStufe({ ...basis, sichtbar: false })).toBe("nicht sichtbar");
    expect(FORM_STUFEN.filter(formErreicht)).toEqual(["V4-Baustein", "Overlay direkt", "Overlay über Baustein", "Token direkt"]);
  });

  it("Farbstufe: Literale vor Palette; ohne eigene Farbe sichtbar = geerbt", () => {
    const k = (t) => ({ ...kennzahlen(t), tokens: "keine", gruppe: "Ansicht", sichtbar: true });
    expect(farbStufe({ ...k("x='#fff'"), tokens: "Palette" })).toBe("Literale");
    expect(farbStufe({ ...k("x"), tokens: "Palette" })).toBe("V4");
    expect(farbStufe(k("x"))).toBe("geerbt");
    expect(farbStufe({ ...k("x"), sichtbar: false })).toBe("ohne Farbe");
  });

  it("Hauptansicht: Dateiliste vor Familie, Branchenmodule nach Gruppe", () => {
    expect(hauptansicht({ datei: "src/ansichten/import.jsx", familie: "personal", gruppe: "Ansicht" })).toBe("Import");
    expect(hauptansicht({ datei: "src/ansichten/personal.jsx", familie: "personal", gruppe: "Ansicht" })).toBe("Personal");
    expect(hauptansicht({ datei: "src/module/posten.jsx", familie: "standort", gruppe: "Branchenmodul" })).toBe("Branchenmodule");
    for (const h of Object.keys(HAUPTANSICHT_DATEIEN)) expect(HAUPTANSICHTEN).toContain(h);
  });
});

describe("Gesamtlauf", () => {
  it("deterministisch; Formstufen und Hauptansichten summieren sich zum Nenner", async () => {
    const a = await inventar(), b = await inventar();
    expect(hauptansichtenMarkdown(a)).toBe(hauptansichtenMarkdown(b));
    const z = zusammenfassung(a).ohneV4;
    expect(Object.values(z.form).reduce((s, n) => s + n, 0)).toBe(z.dateien);
    expect(z.form["nicht sichtbar"]).toBe(z.dateien - z.sichtbar);
    expect(Object.values(z.farbe).reduce((s, n) => s + n, 0)).toBe(z.dateien);
    const h = zusammenfassung(a).jeHauptansicht;
    expect(Object.values(h).reduce((s, x) => s + x.dateien, 0)).toBe(z.dateien);
    expect(Object.values(h).reduce((s, x) => s + x.formErreicht, 0)).toBe(z.formErreicht);
    expect(z.sichtbarVoll).toBeLessThanOrEqual(z.formErreicht);
  }, 60000);

  it("jede Datei der Hauptansichts-Listen existiert im Inventar", async () => {
    const dateien = new Set((await inventar()).eintraege.map((x) => x.datei));
    for (const liste of Object.values(HAUPTANSICHT_DATEIEN)) for (const d of liste) expect(dateien.has(d), d).toBe(true);
  }, 60000);

  it("Ist-Stand-Dokument nennt Werkzeugaufruf und Test", () => {
    const doc = lies("docs/acc45/V4-IST-STAND-2026-11-21.md");
    expect(doc).toContain("node werkzeug/v4-inventar.mjs --hauptansichten");
    expect(doc).toContain("pruefungen/v4-ist-stand.test.js");
  });
});
