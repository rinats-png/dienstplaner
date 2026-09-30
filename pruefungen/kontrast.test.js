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
import { C_HELL, C_DUNKEL, AVATAR_HELL, AVATAR_DUNKEL } from "../src/farben.js";

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
  /* Leitstand: Text auf Flächen, die der neue Stil zusätzlich benutzt */
  ["aus", "flaeche", 4.5],                       // Kennzahl-Titel, Einheit, Legende auf Karten
  ["aufAkzent", "accent", 4.5],                  // Knopf mit gefülltem Akzent
  ["aufAkzent", "ok", 4.5],                      // .btn-ok
  ["accent", "accentLight", 4.5],                // aktive Bereichs-Pille, aktives Seg, Pille „accent"
  ["text", "accentLight", 4.5],
  ["violet", "flaecheStill", 4.5],               // Pille „violet"
  ["accentLight", "accentDeep", 4.5],            // Konto-Knopf in der Kopfzeile
  ["danger", "dangerLight", 4.5],                // .btn-danger, Zähler-Warnung
  /* Übersichten und Entscheidungsansichten: getönte Zeilen (Untergrenzen,
     Lenkzeiten, Belastung, Notrufe) tragen normalen Text, Erklärkästen und
     Seitenkarten tragen Statuswörter auf der eingelassenen Fläche. */
  ["text", "dangerLight", 4.5], ["dim", "dangerLight", 4.5],
  ["text", "warnLight", 4.5], ["dim", "warnLight", 4.5],
  ["text", "okLight", 4.5],
  ["ok", "flaecheStill", 4.5], ["warn", "flaecheStill", 4.5], ["danger", "flaecheStill", 4.5],
  ["dim", "accentLight", 4.5],                   // Checkliste auf Karte, aktive Zeile in Listen
  /* Arbeitsebene und Formulare (P5, P6): Rollenfarben des Ablaufs als Schrift
     auf Karte, Grund und der Fläche einer erledigten Station */
  ["accentDeep", "flaeche", 4.5], ["accentDeep", "okLight", 4.5], ["accentDeep", "bg", 4.5],
  ["violet", "okLight", 4.5], ["violet", "bg", 4.5], ["accent", "okLight", 4.5],
  ["ok", "bg", 4.5],
  ["aufAkzent", "steuer", 3],                    // Haken im Kreis, wenn »steuer« die Fläche ist
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

  it("jede Farbe ist eine gültige Hexangabe — die halbtransparenten Tokens als rgba", () => {
    /* verlaufA/B/C, kopfGrund und ueberlagerung liegen über anderen Flächen
       und sind deshalb bewusst rgba(). Ihre Wirkung prüft der Abschnitt
       „Verlauf" unten. */
    const halbtransparent = ["verlaufA", "verlaufB", "verlaufC", "kopfGrund", "ueberlagerung"];
    for (const [name, P] of [["hell", C_HELL], ["dunkel", C_DUNKEL]]) {
      for (const [k, v] of Object.entries(P)) {
        if (halbtransparent.includes(k)) expect(String(v), `${name}.${k}`).toMatch(/^rgba\(\d+,\d+,\d+,\.?\d+\)$/);
        else expect(String(v), `${name}.${k}`).toMatch(/^#[0-9A-Fa-f]{3,8}$/);
      }
    }
  });
});

/* --------------------------------------------------------------------------
   Rechnen mit halbtransparenten Farben (rgba) über einem Grund
   -------------------------------------------------------------------------- */
const rgb = (hex) => {
  const h = String(hex).replace("#", "");
  const voll = h.length === 3 ? h.split("").map((x) => x + x).join("") : h;
  return [0, 2, 4].map((i) => parseInt(voll.slice(i, i + 2), 16));
};
const rgba = (t) => {
  const m = String(t).match(/^rgba\((\d+),(\d+),(\d+),(\.?\d+)\)$/);
  if (!m) throw new Error(`Kein rgba: ${t}`);
  return { farbe: [+m[1], +m[2], +m[3]], alpha: parseFloat(m[4]) };
};
const ueber = (grund, deck) => {
  const { farbe, alpha } = rgba(deck);
  return grund.map((g, i) => Math.round(farbe[i] * alpha + g * (1 - alpha)));
};
const hexVon = (c) => "#" + c.map((x) => x.toString(16).padStart(2, "0")).join("");

/* --------------------------------------------------------------------------
   VERLAUF

   Titel und Untertitel jeder Ansicht liegen auf dem Farbverlauf. Er ist
   deshalb nur so kräftig, dass `text` und `dim` darauf lesbar bleiben;
   die leise Textfarbe `aus` gehört nie auf den Verlauf (Beleg unten).

   Der Verlauf ist ein Radialverlauf: An jedem Punkt liegt höchstens eine
   Stufe (A, dann B, dann durchsichtig) über dem Grund, dazu am rechten Rand
   ein zweiter, kleinerer Fleck (C). Geprüft wird jede Stufe für sich und
   der Stapel A+B als strenge Obergrenze — er kommt in der Wirklichkeit nicht
   vor, weil die Stufen nacheinander stehen, nicht übereinander.

   Der Grund ist `bg` (so liegt der Verlauf in der Anwendung), im
   Hellmodus zusätzlich `flaecheStill`, auf dem die Entwürfe gezeichnet sind.
   -------------------------------------------------------------------------- */
describe("Verlauf", () => {
  const grenzen = { Hell: 0.40, Dunkel: 0.24 };
  for (const [name, P, gruende] of [["Hell", C_HELL, ["bg", "flaecheStill"]], ["Dunkel", C_DUNKEL, ["bg"]]]) {
    describe(name, () => {
      it("bleibt unter der Deckkraft-Grenze", () => {
        for (const k of ["verlaufA", "verlaufB", "verlaufC"]) {
          expect(rgba(P[k]).alpha, `${name}.${k}`).toBeLessThanOrEqual(grenzen[name]);
        }
      });
      for (const grund of gruende) {
        const g = rgb(P[grund]);
        const stufen = {
          "A": ueber(g, P.verlaufA),
          "B": ueber(g, P.verlaufB),
          "C": ueber(g, P.verlaufC),
          "A+B (Obergrenze)": ueber(ueber(g, P.verlaufA), P.verlaufB),
        };
        for (const [stufe, farbe] of Object.entries(stufen)) {
          for (const text of ["text", "dim"]) {
            it(`${text} auf ${stufe} über ${grund} erreicht 4,5:1`, () => {
              const v = verhaeltnis(P[text], hexVon(farbe));
              expect(v, `${P[text]} auf ${hexVon(farbe)} = ${v}:1`).toBeGreaterThanOrEqual(4.5);
            });
          }
        }
      }
      it("die leise Textfarbe `aus` trägt auf dem Verlauf nicht — deshalb steht sie dort nie", () => {
        const farbe = hexVon(ueber(rgb(P.bg), P.verlaufA));
        expect(verhaeltnis(P.aus, farbe)).toBeLessThan(4.5);
      });
    });
  }
});

/* --------------------------------------------------------------------------
   Weiße Schrift auf den Dienstfarben (Master-Prompt D.1). Die Dienstarten
   erscheinen als Tönung mit Linie; wo eine volle Fläche vorkommt (Legende,
   Zeitachse), trägt die weiße Schrift nur auf diesen zehn.
   -------------------------------------------------------------------------- */
describe("Dienstfarben", () => {
  const TRAEGT = { "#017070": 5.91, "#316C81": 5.85, "#023441": 13.37, "#955410": 5.91, "#2E6B4F": 6.30,
    "#B3261E": 6.54, "#4C4668": 8.81, "#0369A1": 5.93, "#35506B": 8.36, "#8A5A00": 5.93 };
  for (const [farbe, soll] of Object.entries(TRAEGT)) {
    it(`Weiß auf ${farbe} erreicht ${soll}:1`, () => {
      expect(verhaeltnis("#FFFFFF", farbe)).toBeGreaterThanOrEqual(4.5);
      expect(Math.abs(verhaeltnis("#FFFFFF", farbe) - soll)).toBeLessThan(0.05);
    });
  }
  it("Weiß auf Freistellung-Grau trägt nicht (3,39:1) — dort steht die Tönung, nie die volle Fläche", () => {
    expect(verhaeltnis("#FFFFFF", "#878C93")).toBeLessThan(4.5);
  });
});

/* --------------------------------------------------------------------------
   Namenszeichen: acht Paare je Erscheinungsbild
   -------------------------------------------------------------------------- */
describe("Avatar-Töne", () => {
  for (const [name, paare] of [["Hell", AVATAR_HELL], ["Dunkel", AVATAR_DUNKEL]]) {
    it(`${name}: acht Paare`, () => expect(paare).toHaveLength(8));
    paare.forEach(([flaeche, schrift], i) => {
      it(`${name} ${i + 1}: ${schrift} auf ${flaeche} erreicht 4,5:1`, () => {
        expect(verhaeltnis(schrift, flaeche)).toBeGreaterThanOrEqual(4.5);
      });
    });
  }
});

/* --------------------------------------------------------------------------
   Dienstfarben im Dunkelmodus (Darstellung, nicht Daten)

   Die Farben von Dienstarten, Einheiten und Qualifikationen sind Daten und
   für hellen Grund gewählt. Als Schrift oder Kante auf dem dunklen Kartengrund
   werden sie in der Darstellung aufgehellt (src/gestalt/lesbar.js, in App.jsx
   als `lesbar()`): Schrift auf mindestens 4,5:1, Kanten und Punkte auf 3:1.
   Im hellen Erscheinungsbild bleibt die Farbe unverändert.
   -------------------------------------------------------------------------- */
import { readFileSync } from "node:fs";
import { aufhellenBis, kontrastVon } from "../src/gestalt/lesbar.js";

describe("Dienstfarben als Schrift und Kante im Dunkelmodus", () => {
  const DIENST = ["#017070", "#316C81", "#023441", "#4C4668", "#955410", "#2E6B4F", "#B3261E", "#35506B",
    "#0369A1", "#8A5A00", "#878C93"];
  const quelle = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  const bloc = quelle.slice(quelle.indexOf("const PALETTE = ["), quelle.indexOf("const PALETTE_NAMEN"));
  const PALETTE = bloc.match(/#[0-9A-Fa-f]{6}/g) || [];
  const grund = C_DUNKEL.flaeche;

  it("die Palette der dreißig Farben wird gelesen", () => expect(PALETTE).toHaveLength(30));

  for (const farbe of [...DIENST, ...PALETTE]) {
    it(`${farbe}: als Schrift ≥ 4,5:1 und als Kante ≥ 3:1 auf dem Kartengrund`, () => {
      expect(kontrastVon(aufhellenBis(farbe, grund, 4.5), grund)).toBeGreaterThanOrEqual(4.5);
      expect(kontrastVon(aufhellenBis(farbe, grund, 3), grund)).toBeGreaterThanOrEqual(3);
    });
  }
  it("eine Farbe, die schon trägt, bleibt unverändert", () => {
    expect(aufhellenBis("#7FE0E0", grund, 4.5)).toBe("#7FE0E0");
  });
  it("die dunkelste Dienstfarbe (Nacht) wird spürbar heller, bleibt aber bläulich-grün", () => {
    const h = aufhellenBis("#023441", grund, 4.5);
    expect(h).not.toBe("#023441");
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    expect(b).toBeGreaterThan(r);
    expect(g).toBeGreaterThan(r);
  });
});
