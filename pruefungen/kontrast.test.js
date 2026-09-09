/* ==========================================================================
   KONTRAST — WCAG 2.1 AA

   Die Palette trägt ihre Verhältniszahlen als Kommentar. Kommentare altern:
   Wer eine Farbe eine Spur abdunkelt, ändert selten die Zahl daneben. Diese
   Prüfung rechnet nach — für beide Erscheinungsbilder, für jede Paarung,
   die in der Anwendung tatsächlich vorkommt.

   Die Schwellen aus WCAG 2.1:
     4,5:1  normaler Text (1.4.3)
     3,0:1  großer Text ab 18,66 px fett oder 24 px (1.4.3)
     3,0:1  Bedienelemente, Zustände, Ränder, Diagramme (1.4.11)

   Was hier nicht geprüft wird, weil es keine Farbfrage ist: ob eine Aussage
   allein über Farbe getroffen wird. Das steht in der Zugänglichkeitsprüfung.
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { C_HELL, C_DUNKEL } from "../src/farben.js";

/* --- Die Rechnung nach WCAG 2.1, Abschnitt „relative luminance" --------- */
const kanal = (v) => {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const leuchtkraft = (hex) => {
  const h = String(hex).replace("#", "");
  const voll = h.length === 3 ? h.split("").map((x) => x + x).join("") : h;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(voll.slice(i, i + 2), 16));
  return 0.2126 * kanal(r) + 0.7152 * kanal(g) + 0.0722 * kanal(b);
};
const verhaeltnis = (a, b) => {
  const [x, y] = [leuchtkraft(a), leuchtkraft(b)].sort((p, q) => q - p);
  return Math.round(((x + 0.05) / (y + 0.05)) * 100) / 100;
};

/* Die Rechnung selbst muss stimmen, bevor sie etwas beweist. */
describe("Die Rechnung", () => {
  it("Schwarz auf Weiß ergibt 21:1", () => {
    expect(verhaeltnis("#000000", "#FFFFFF")).toBe(21);
  });
  it("Gleiche Farben ergeben 1:1", () => {
    expect(verhaeltnis("#3C7C8C", "#3C7C8C")).toBe(1);
  });
  it("Kurzschreibweise wird verstanden", () => {
    expect(verhaeltnis("#000", "#fff")).toBe(21);
  });
});

/* --------------------------------------------------------------------------
   Die Paarungen, wie sie in der Anwendung vorkommen.
   -------------------------------------------------------------------------- */
const paare = (P) => [
  /* Fließtext auf allen drei Grundflächen */
  ["text", "bg", 4.5], ["text", "flaeche", 4.5], ["text", "flaecheStill", 4.5],
  /* Gedämpfter Text — Hinweise, Unterzeilen, Tabellenköpfe */
  ["dim", "bg", 4.5], ["dim", "flaeche", 4.5], ["dim", "flaecheStill", 4.5],
  ["dimmer", "flaeche", 4.5],
  /* „aus" trägt abgeschaltete Beschriftungen: Bedienelement, nicht Fließtext */
  ["aus", "flaeche", 3],
  /* Der Akzent trägt Verweise und aktive Zustände */
  ["accent", "bg", 4.5], ["accent", "flaeche", 4.5],
  /* Statusfarben als Text auf Karten und auf ihren eigenen Flächen */
  ["ok", "flaeche", 4.5], ["warn", "flaeche", 4.5],
  ["danger", "flaeche", 4.5], ["violet", "flaeche", 4.5],
  ["ok", "okLight", 4.5], ["warn", "warnLight", 4.5], ["danger", "dangerLight", 4.5],
  /* Die Seitenleiste ist dunkel in beiden Erscheinungsbildern */
  ["accentOrig", "sidebar", 3],
  /* Bedienelemente und ihre Zustände nach 1.4.11 — Ränder, Schalter,
     Umschalter. Reine Trennlinien (line, lineSoft, lineStark) sind davon
     ausgenommen: Sie tragen keine Bedeutung, die verloren ginge. */
  ["steuer", "flaeche", 3], ["steuer", "bg", 3], ["steuer", "flaecheStill", 3],
];

for (const [name, P] of [["Hell", C_HELL], ["Dunkel", C_DUNKEL]]) {
  describe(`Palette ${name}`, () => {
    for (const [vorne, hinten, schwelle] of paare(P)) {
      it(`${vorne} auf ${hinten} erreicht ${schwelle}:1`, () => {
        const v = verhaeltnis(P[vorne], P[hinten]);
        expect(v, `${P[vorne]} auf ${P[hinten]} = ${v}:1`).toBeGreaterThanOrEqual(schwelle);
      });
    }

    it("der Text auf dem gefüllten Akzent trägt", () => {
      /* Schaltflächen. Im Hellmodus ist der Akzent dunkel und trägt weißen
         Text, im Dunkelmodus hell und trägt dunklen — deshalb aufAkzent. */
      const v = verhaeltnis(P.aufAkzent, P.accent);
      expect(v, `#FFFFFF auf ${P.accent} = ${v}:1`).toBeGreaterThanOrEqual(4.5);
    });

    it("Text auf der Seitenleiste trägt", () => {
      const v = verhaeltnis(name === "Hell" ? "#FFFFFF" : P.text, P.sidebar);
      expect(v).toBeGreaterThanOrEqual(4.5);
    });

    it("die Grundflächen unterscheiden sich sichtbar voneinander", () => {
      /* Karte gegen Grund: Wo der Unterschied unter 1,2 liegt, trägt allein
         die Fläche die Trennung nicht — dann braucht es einen Rand. Genau
         das ist im Hellmodus so, und deshalb steht er im Quelltext. */
      const v = verhaeltnis(P.flaeche, P.bg);
      if (v < 1.2) expect(verhaeltnis(P.line, P.flaeche)).toBeGreaterThanOrEqual(1.2);
      else expect(v).toBeGreaterThanOrEqual(1.2);
    });
  });
}

describe("Beide Erscheinungsbilder", () => {
  it("tragen dieselben Schlüssel", () => {
    const hell = Object.keys(C_HELL).sort();
    const dunkel = Object.keys(C_DUNKEL).sort();
    expect(dunkel).toEqual(hell);
  });

  it("jede Farbe ist eine gültige Hexangabe", () => {
    for (const [name, P] of [["hell", C_HELL], ["dunkel", C_DUNKEL]]) {
      for (const [k, v] of Object.entries(P)) {
        expect(String(v), `${name}.${k}`).toMatch(/^#[0-9A-Fa-f]{3,8}$/);
      }
    }
  });
});
