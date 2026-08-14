/* ==========================================================================
   TARIFVORLAGEN

   Eine Vorlage greift ins Regelwerk eines laufenden Betriebs. Was sie
   anfasst, muss sie anfassen — und was sie nicht nennt, darf sie nicht
   berühren.

   Aufruf: npm run pruefung:tarife
   ========================================================================== */

import { describe, it, expect } from "vitest";
import {
  TARIFWERKE, tarifwerk, vorlagenFuer, anwenden, wertText, FELDNAME,
  zusatzurlaubstage, zusatzurlaub, STAND,
} from "../src/tarifwerke.js";

const HEUTE = "2026-08-14";

function betrieb() {
  return {
    id: "m1",
    name: "Pflegeheim Sonnenhof",
    personen: [{ id: "p1", nachname: "Berg" }],
    dienstarten: [{ id: "F", name: "Frühdienst" }],
    einheiten: [{ id: "e1", name: "Wohnbereich 1" }],
    einstellungen: {
      wochenstunden: 40, urlaubsanspruch: 30, ruhezeit: 11, maxFolge: 6,
      maxTagesstunden: 10, ausgleichWochen: 24,
      pausen: { ab6h: 30, ab9h: 45 },
      quote: { tag: 0.4, nacht: 0.5 },
    },
    zuschlaege: [{ id: "z1", name: "Alt", art: "nacht", prozent: 99, aktiv: true }],
  };
}

describe("Bestand der Vorlagen", () => {
  it("jede Vorlage hat Kennung, Quelle, Stand und Hinweise", () => {
    for (const t of TARIFWERKE) {
      expect(t.id).toBeTruthy();
      expect(t.name).toBeTruthy();
      expect(t.quelle).toMatch(/^https:\/\//);
      expect(t.stand).toBe(STAND);
      expect(Array.isArray(t.hinweise)).toBe(true);
      expect(t.hinweise.length).toBeGreaterThan(0);
    }
  });

  it("Kennungen sind eindeutig", () => {
    const ids = TARIFWERKE.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("jedes Einstellungsfeld hat einen lesbaren Namen", () => {
    for (const t of TARIFWERKE)
      for (const k of Object.keys(t.einstellungen))
        expect(FELDNAME[k], `kein Name für ${k}`).toBeTruthy();
  });

  it("kennt die tarifliche Wochenarbeitszeit", () => {
    expect(tarifwerk("tvoed-p").einstellungen.wochenstunden).toBe(38.5);
    expect(tarifwerk("avr-caritas").einstellungen.wochenstunden).toBe(39);
    expect(tarifwerk("gesetzlich").einstellungen.wochenstunden).toBe(40);
  });

  it("kennt das Nachtfenster je Werk", () => {
    /* § 7 Abs. 5 TVöD: 21 bis 6 Uhr. § 2 Abs. 3 ArbZG: 23 bis 6 Uhr. */
    expect(tarifwerk("tvoed-p").einstellungen.nachtVon).toBe("21:00");
    expect(tarifwerk("gesetzlich").einstellungen.nachtVon).toBe("23:00");
  });

  it("behauptet keinen Prozentsatz, wo der Tarif einen Betrag zahlt", () => {
    /* Der Nachtzuschlag der AVR ist ein fester Eurobetrag je Stunde. Er steht
       mit null Prozent in der Liste, damit die Stunden gezählt werden, ohne
       eine Prozentzahl zu erfinden. */
    const nacht = tarifwerk("avr-caritas").zuschlaege.find((z) => z.art === "nacht");
    expect(nacht.prozent).toBe(0);
    expect(nacht.aktiv).toBe(true);
    expect(tarifwerk("avr-caritas").hinweise.join(" ")).toMatch(/fester Eurobetrag/);
  });

  it("nennt beim gesetzlichen Werk, dass die Prozentzahl nicht im Gesetz steht", () => {
    expect(tarifwerk("gesetzlich").hinweise.join(" ")).toMatch(/kein Rechtssatz/);
  });

  it("gibt Unbekanntes als null zurück", () => {
    expect(tarifwerk("gibtsnicht")).toBe(null);
  });
});

describe("vorlagenFuer", () => {
  it("stellt passende Werke nach vorn", () => {
    const v = vorlagenFuer("pflege");
    expect(v[0].branchen).toContain("pflege");
    expect(v.length).toBe(TARIFWERKE.length);
  });
  it("verliert nichts bei einer unbekannten Branche", () => {
    expect(vorlagenFuer("gastronomie").length).toBe(TARIFWERKE.length);
  });
});

describe("anwenden", () => {
  const { mandant: neu, geaendert } = anwenden(betrieb(), "tvoed-p", HEUTE);

  it("setzt die tariflichen Werte", () => {
    expect(neu.einstellungen.wochenstunden).toBe(38.5);
    expect(neu.einstellungen.nachtVon).toBe("21:00");
    expect(neu.einstellungen.zusatzurlaub.wechselschichtMonate).toBe(2);
  });

  it("lässt unerwähnte Einstellungen stehen", () => {
    /* maxFolge und die Fachkraftquote nennt die Vorlage nicht — sie sind
       betrieblich und dürfen nicht überschrieben werden. */
    expect(neu.einstellungen.maxFolge).toBe(6);
    expect(neu.einstellungen.quote).toEqual({ tag: 0.4, nacht: 0.5 });
  });

  it("rührt Personal, Dienstarten und Einheiten nicht an", () => {
    expect(neu.personen).toHaveLength(1);
    expect(neu.dienstarten).toHaveLength(1);
    expect(neu.einheiten).toHaveLength(1);
  });

  it("ersetzt die Zuschlagsregeln vollständig", () => {
    expect(neu.zuschlaege.find((z) => z.prozent === 99)).toBeUndefined();
    expect(neu.zuschlaege.find((z) => z.art === "nacht").prozent).toBe(20);
    expect(neu.zuschlaege.every((z) => z.id)).toBe(true);
  });

  it("schreibt auf, woher die Werte kamen", () => {
    expect(neu.tarifwerk.id).toBe("tvoed-p");
    expect(neu.tarifwerk.stand).toBe(STAND);
    expect(neu.tarifwerk.angewendet).toBe(HEUTE);
    expect(neu.tarifwerk.quelle).toMatch(/^https:\/\//);
  });

  it("meldet, was sich ändert", () => {
    const felder = geaendert.map((g) => g.feld);
    expect(felder).toContain("wochenstunden");
    expect(felder).toContain("nachtVon");
    expect(felder).toContain("zuschlaege");
    /* ruhezeit stand schon auf 11 und darf nicht als Änderung erscheinen. */
    expect(felder).not.toContain("ruhezeit");
  });

  it("verändert den ursprünglichen Betrieb nicht", () => {
    const m = betrieb();
    const vorher = JSON.stringify(m);
    anwenden(m, "tvoed-p", HEUTE);
    expect(JSON.stringify(m)).toBe(vorher);
  });

  it("tut bei unbekannter Kennung nichts", () => {
    const m = betrieb();
    const erg = anwenden(m, "gibtsnicht", HEUTE);
    expect(erg.mandant).toBe(m);
    expect(erg.geaendert).toEqual([]);
  });
});

describe("wertText", () => {
  it("macht Pausen und Zusatzurlaub lesbar", () => {
    expect(wertText({ ab6h: 30, ab9h: 45 })).toBe("30 min ab 6 h, 45 min ab 9 h");
    expect(wertText({ wechselschichtMonate: 2, schichtMonate: 4 }))
      .toMatch(/1 Tag je 2 Monate Wechselschicht/);
  });
  it("benennt Fehlendes als solches", () => {
    expect(wertText(null)).toBe("nicht gesetzt");
    expect(wertText(undefined)).toBe("nicht gesetzt");
  });
  it("gibt Zahlen als Text zurück", () => {
    expect(wertText(38.5)).toBe("38.5");
  });
});

describe("Zusatzurlaub nach § 27 TVöD", () => {
  it("rechnet einen Tag je zwei Monate Wechselschicht", () => {
    expect(zusatzurlaubstage(2, 2)).toBe(1);
    expect(zusatzurlaubstage(11, 2)).toBe(5);
    expect(zusatzurlaubstage(12, 2)).toBe(6);
  });
  it("rechnet einen Tag je vier Monate Schichtarbeit", () => {
    expect(zusatzurlaubstage(12, 4)).toBe(3);
    expect(zusatzurlaubstage(3, 4)).toBe(0);
  });
  it("gibt bei Unsinn null zurück", () => {
    expect(zusatzurlaubstage(0, 2)).toBe(0);
    expect(zusatzurlaubstage(5, 0)).toBe(0);
    expect(zusatzurlaubstage(null, 2)).toBe(0);
  });

  const e = tarifwerk("tvoed-p").einstellungen;

  it("lässt Wechselschicht vor Schichtarbeit gehen", () => {
    /* Zwölf Monate in beidem gibt es nicht; wenn doch beides gemeldet wird,
       gilt der günstigere Anspruch. */
    const z = zusatzurlaub(e, 12, 12);
    expect(z.art).toBe("wechselschicht");
    expect(z.tage).toBe(6);
  });
  it("nimmt Schichtarbeit, wenn Wechselschicht nicht reicht", () => {
    const z = zusatzurlaub(e, 1, 8);
    expect(z.art).toBe("schicht");
    expect(z.tage).toBe(2);
  });
  it("gibt nichts unter der Schwelle", () => {
    const z = zusatzurlaub(e, 1, 3);
    expect(z.tage).toBe(0);
    expect(z.art).toBe(null);
  });
  it("gibt nichts, wenn das Werk keinen Zusatzurlaub kennt", () => {
    const z = zusatzurlaub(tarifwerk("gesetzlich").einstellungen, 12, 12);
    expect(z.tage).toBe(0);
  });
});
