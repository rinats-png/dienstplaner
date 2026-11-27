/* ==========================================================================
   Planungsassistent: Gründe offener Stellen (WP-I4/I5/I7, kein neues Paket)

   Der Assistent (src/ansichten/assistent.jsx) und der Selbsttest (src/pruefung.jsx) liefern dieselben Gründe
   und Texte: eine Quelle (src/lib/assistentGruende.js) und eine Rechnung (planeMonat aus src/lib/fachlogik.js).
   Geprüft: Klartext je Grund, fail-closed bei allem Unbekannten, Zeile ohne Grund wie bisher, jeder Grund
   der Engine hat einen Text, Einhängung in beide Dateien (keine zweite Kopie). Keine Uhr, kein Netz.
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { grundText, offenText } from "../src/lib/assistentGruende.js";

const lies = (d) => readFileSync(new URL(`../${d}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const UNBEKANNT = "Grund nicht bewertbar – Stelle bleibt offen";
const BEKANNT = ["verdraengung", "folgeVorwaerts", "nachtfolge", "ersatzruhe", "sonntagsfrei", "aufwand", "vorgabe"];

describe("Klartext der Gründe", () => {
  it("jeder bekannte Grund hat einen eigenen deutschen Text, der die offene Stelle nennt", () => {
    const texte = BEKANNT.map(grundText);
    expect(new Set(texte).size).toBe(BEKANNT.length);
    for (const t of texte) { expect(t).toMatch(/Stelle bleibt offen$/); expect(t).not.toBe(UNBEKANNT); }
  });
  it("Rechenbudget wird ohne Interna erklärt", () => {
    expect(grundText("aufwand")).toBe("Rechenbudget erreicht – Stelle bleibt offen");
    expect(grundText("aufwand")).not.toMatch(/aufwand/i);
  });
  it("gesetzlich und betrieblich bleiben getrennt benannt", () => {
    expect(grundText("sonntagsfrei")).toMatch(/§ 11 Abs\. 1 ArbZG/);
    expect(grundText("ersatzruhe")).toMatch(/§ 11 Abs\. 3 ArbZG/);
    expect(grundText("nachtfolge")).toMatch(/betriebliche/);
  });
  it("fail-closed: unbekannt, leer, kein Text, Objektschlüssel → neutrale Anzeige, nie leer", () => {
    for (const x of ["", "irgendwas", "Aufwand", null, undefined, 0, 7, {}, [], ["aufwand"], true, "constructor", "__proto__", "toString", "hasOwnProperty"])
      expect(grundText(x)).toBe(UNBEKANNT);
  });
  it("keine Personenbezüge: Texte enthalten keine Namen, Kennungen oder Zahlen außer den Paragrafen", () => {
    for (const g of BEKANNT) expect(grundText(g).replace(/§ 11 Abs\. [13] ArbZG/, "").replace(/15 freie/, "")).not.toMatch(/\d/);
  });
});

describe("Zeile einer offenen Stelle", () => {
  const alt = (o) => `${o.fehlt > 0 ? `${o.fehlt} fehlen` : ""}${o.qualFehlt ? (o.fehlt > 0 ? " · " : "") + "Qualifikation fehlt" : ""}`;
  it("ohne Grund exakt wie bisher (alle Kombinationen)", () => {
    for (const fehlt of [0, 1, 3]) for (const qualFehlt of [false, true, undefined])
      expect(offenText({ datum: "2026-12-01", dienstId: "F", fehlt, qualFehlt })).toBe(alt({ fehlt, qualFehlt }));
  });
  it("mit Grund: Fehlbetrag, Qualifikation, dann der Klartext", () => {
    expect(offenText({ fehlt: 2, qualFehlt: true, grund: "folgeVorwaerts" })).toBe(`2 fehlen · Qualifikation fehlt · ${grundText("folgeVorwaerts")}`);
    expect(offenText({ fehlt: 0, qualFehlt: false, grund: "aufwand" })).toBe("Rechenbudget erreicht – Stelle bleibt offen");
  });
  it("vorhandenes, aber unlesbares Grundfeld ist nie „frei“ oder leer", () => {
    for (const grund of [null, "", "x", 5])
      expect(offenText({ fehlt: 1, grund })).toBe(`1 fehlen · ${UNBEKANNT}`);
    expect(offenText({ fehlt: 0, qualFehlt: false, grund: null })).toBe(UNBEKANNT);
  });
});

describe("Eine Quelle für Assistent und Selbsttest", () => {
  it("jeder Grund, den die Engine setzt, hat einen Text (Quelltext von planeMonat und den Planbefunden)", () => {
    const fl = lies("src/lib/fachlogik.js");
    const start = fl.indexOf("export function planeMonat");
    const planeMonat = fl.slice(start, fl.indexOf("\n}\n", start));
    const aus = new Set([...planeMonat.matchAll(/(?:grund: |return |\? )"(\w+)"/g)].map((x) => x[1]));
    const ei = lies("server/lib/engine/einsatz.mjs");
    const s0 = ei.indexOf("export function planbefundeNeu");
    for (const x of ei.slice(s0).matchAll(/regel: "(\w+)"/g)) aus.add(x[1]);
    for (const g of ["verdraengung", "aufwand", "vorgabe", "folgeVorwaerts", "nachtfolge", "ersatzruhe", "sonntagsfrei"]) expect(aus.has(g)).toBe(true);
    for (const g of aus) if (BEKANNT.includes(g) || /^(verdraengung|aufwand|vorgabe|folgeVorwaerts)$/.test(g)) expect(grundText(g)).not.toBe(UNBEKANNT);
    /* alles, was als Grund ausgegeben wird, ist bekannt: nichts landet unbemerkt in der neutralen Anzeige */
    const grundWerte = [...planeMonat.matchAll(/grund: "(\w+)"/g)].map((x) => x[1]);
    for (const g of grundWerte) expect(BEKANNT).toContain(g);
  });
  it("der Assistent zeigt die Zeile über offenText (keine eigene Auslegung in der Oberfläche)", () => {
    const q = lies("src/ansichten/assistent.jsx");
    expect(q).toMatch(/import \{ offenText \} from "\.\.\/lib\/assistentGruende\.js"/);
    expect(q).toContain("{offenText(o)}");
    expect(q).not.toContain("Qualifikation fehlt");
  });
  it("der Selbsttest rechnet mit derselben planeMonat und prüft dieselben Texte (keine zweite Kopie)", () => {
    const p = lies("src/pruefung.jsx");
    expect(p).not.toMatch(/function planeMonat\b/);
    expect(p).toMatch(/import \{[^}]*\bplaneMonat\b[^}]*\} from "\.\/lib\/fachlogik\.js"/);
    expect(p).toMatch(/import \{ offenText \} from "\.\/lib\/assistentGruende\.js"/);
    expect(p).toMatch(/offenText\(/);
  });
});
