/* ==========================================================================
   REGELBAUKASTEN

   Zählregel (feste und rollierende Zeiträume, Monats-, Jahres- und
   Schaltjahrgrenzen), Grenzregel, Besetzungsregel (Anzahl, Quote, Verhältnis,
   fehlende Daten), Paarregel — und dass keine davon fehlende Daten als erfüllt
   liest oder eine ungeprüfte Regel zum Rechtsverstoß macht.

   Aufruf: npm run pruefung:baukasten
   ========================================================================== */
import { describe, it, expect } from "vitest";
import {
  addMonate, zeitraum, zaehlregel, grenzregel, besetzungsregel, paarregel, pruefeRegel, REGELARTEN_GERECHNET,
} from "../src/regelbaukasten.js";
import { REGELN, regel } from "../src/regelregister.js";

const R = (o) => ({
  id: "TEST-REGEL-01", typ: "grenzregel", bezeichnung: "Testregel", ebene: "bund",
  quelle: "Testgesetz", fundstelle: "§ 1", gueltigAb: null, gueltigBis: null,
  pruefstatus: "verified", geprueftAm: "2026-10-22", regelstand: "2026.10",
  scope: { branche: null, bundesland: null, beschaeftigungsmodell: null },
  hoechsteStufe: "recht", folge: null, parameter: {}, ...o,
});
const tage = (von, n) => Array.from({ length: n }, (_, i) => {
  const d = new Date(`${von}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + i);
  return d.toISOString().slice(0, 10);
});
const P = (id, ...merkmale) => ({ id, merkmale });
const ohneAngabe = (id) => ({ id });

describe("Zeiträume", () => {
  it("rollierend in Tagen: der Stichtag zählt mit", () => {
    expect(zeitraum({ art: "rollierend", einheit: "tage", laenge: 7 }, "2026-03-07")).toEqual({ von: "2026-03-01", bis: "2026-03-07" });
  });
  it("rollierend in Wochen", () => {
    expect(zeitraum({ art: "rollierend", einheit: "wochen", laenge: 2 }, "2026-03-14")).toEqual({ von: "2026-03-01", bis: "2026-03-14" });
  });
  it("rollierend in Monaten: zwölf Monate bis zum 31.03. beginnen am 01.04. des Vorjahres", () => {
    expect(zeitraum({ art: "rollierend", einheit: "monate", laenge: 12 }, "2026-03-31")).toEqual({ von: "2025-04-01", bis: "2026-03-31" });
  });
  it("rollierend über den Jahreswechsel", () => {
    expect(zeitraum({ art: "rollierend", einheit: "tage", laenge: 10 }, "2026-01-03")).toEqual({ von: "2025-12-25", bis: "2026-01-03" });
  });
  it("Schaltjahr: zwölf Monate bis 29.02.2024 beginnen am 01.03.2023", () => {
    expect(zeitraum({ art: "rollierend", einheit: "monate", laenge: 12 }, "2024-02-29")).toEqual({ von: "2023-03-01", bis: "2024-02-29" });
  });
  it("Schaltjahr: ein Monat zurück vom 31.03. ist der 29.02.", () => {
    expect(addMonate("2024-03-31", -1)).toBe("2024-02-29");
    expect(addMonate("2026-03-31", -1)).toBe("2026-02-28");
    expect(addMonate("2026-01-31", 1)).toBe("2026-02-28");
  });
  it("Kalendermonat umfasst den ganzen Monat, auch den 29. im Schaltjahr", () => {
    expect(zeitraum({ art: "kalendermonat" }, "2024-02-10")).toEqual({ von: "2024-02-01", bis: "2024-02-29" });
    expect(zeitraum({ art: "kalendermonat" }, "2026-02-10")).toEqual({ von: "2026-02-01", bis: "2026-02-28" });
    expect(zeitraum({ art: "kalendermonat" }, "2026-12-31")).toEqual({ von: "2026-12-01", bis: "2026-12-31" });
  });
  it("Kalenderjahr", () => {
    expect(zeitraum({ art: "kalenderjahr" }, "2026-07-15")).toEqual({ von: "2026-01-01", bis: "2026-12-31" });
  });
  it("ein fehlender oder ungültiger Stichtag wirft, statt zu raten", () => {
    expect(() => zeitraum({ art: "kalenderjahr" }, undefined)).toThrow();
    expect(() => zeitraum({ art: "kalenderjahr" }, "2026-02-30")).toThrow();
    expect(() => zeitraum({ art: "rollierend", einheit: "tage" }, "2026-01-01")).toThrow();
    expect(() => zeitraum({ art: "rollierend", einheit: "jahre", laenge: 1 }, "2026-01-01")).toThrow();
    expect(() => zeitraum({ art: "quartal" }, "2026-01-01")).toThrow();
  });
});

describe("Zählregel", () => {
  const rollend = R({ typ: "zaehlregel", parameter: { ereignis: "diensttag", fenster: { art: "rollierend", einheit: "tage", laenge: 7 }, richtung: "hoechstens", grenze: 5 } });

  it("genau an der Grenze ist erfüllt", () => {
    const e = zaehlregel(rollend, { ereignisse: tage("2026-03-01", 5), stichtag: "2026-03-07" });
    expect(e.status).toBe("erfuellt");
    expect(e.fakten.anzahl).toBe(5);
    expect(e.befund).toBeNull();
  });
  it("eins über der Grenze ist verletzt, mit Regelkennung, Quelle und Fundstelle", () => {
    const e = zaehlregel(rollend, { ereignisse: tage("2026-03-01", 6), stichtag: "2026-03-07" });
    expect(e.status).toBe("verletzt");
    expect(e.befund.stufe).toBe("recht");
    expect(e.befund.regelId).toBe("TEST-REGEL-01");
    expect(e.befund.quelle).toBe("§ 1 Testgesetz");
    expect(e.befund.fundstelle).toBe("§ 1");
    expect(e.befund.pruefstatus).toBe("verified");
  });
  it("ein Ereignis einen Tag vor dem Fenster zählt nicht, am ersten Tag des Fensters schon", () => {
    const draussen = zaehlregel(rollend, { ereignisse: ["2026-02-28", ...tage("2026-03-02", 5)], stichtag: "2026-03-07" });
    expect(draussen.fakten.anzahl).toBe(5);
    const drin = zaehlregel(rollend, { ereignisse: ["2026-03-01", ...tage("2026-03-02", 5)], stichtag: "2026-03-07" });
    expect(drin.fakten.anzahl).toBe(6);
  });
  it("ein Ereignis nach dem Stichtag zählt nicht", () => {
    expect(zaehlregel(rollend, { ereignisse: ["2026-03-08"], stichtag: "2026-03-07" }).fakten.anzahl).toBe(0);
  });
  it("zwei Ereignisse am selben Tag sind eines", () => {
    expect(zaehlregel(rollend, { ereignisse: ["2026-03-01", "2026-03-01"], stichtag: "2026-03-07" }).fakten.anzahl).toBe(1);
  });
  it("Ereignisse über den Jahreswechsel gehören zu einem rollierenden Fenster", () => {
    const e = zaehlregel(rollend, { ereignisse: ["2025-12-30", "2025-12-31", "2026-01-01"], stichtag: "2026-01-03" });
    expect(e.fakten.anzahl).toBe(3);
  });

  it("Kalenderjahr: Silvester zählt, der 1. Januar des Folgejahres nicht", () => {
    const j = R({ typ: "zaehlregel", parameter: { ereignis: "arbeitstag", fenster: { art: "kalenderjahr" }, richtung: "hoechstens", grenze: 2 } });
    expect(zaehlregel(j, { ereignisse: ["2026-01-01", "2026-12-31", "2027-01-01", "2025-12-31"], stichtag: "2026-06-01" }).fakten.anzahl).toBe(2);
    expect(zaehlregel(j, { ereignisse: ["2026-01-01", "2026-12-31", "2026-06-01"], stichtag: "2026-06-01" }).status).toBe("verletzt");
  });

  it("Kalendermonat im Schaltjahr: der 29.02. zählt, der 01.03. nicht", () => {
    const m = R({ typ: "zaehlregel", parameter: { ereignis: "frei", fenster: { art: "kalendermonat" }, richtung: "mindestens", grenze: 2 } });
    expect(zaehlregel(m, { ereignisse: ["2024-02-28", "2024-02-29", "2024-03-01"], stichtag: "2024-02-10" }).status).toBe("erfuellt");
    expect(zaehlregel(m, { ereignisse: ["2024-02-29", "2024-03-01"], stichtag: "2024-02-10" }).status).toBe("verletzt");
  });

  it("Monatsgrenze: mindestens-Regel zählt nur den Monat des Stichtags", () => {
    const m = R({ typ: "zaehlregel", parameter: { ereignis: "frei", fenster: { art: "kalendermonat" }, richtung: "mindestens", grenze: 1 } });
    expect(zaehlregel(m, { ereignisse: ["2026-01-31"], stichtag: "2026-02-01" }).status).toBe("verletzt");
    expect(zaehlregel(m, { ereignisse: ["2026-02-01"], stichtag: "2026-02-01" }).status).toBe("erfuellt");
  });

  it("zwölf Monate rollierend: ein Ereignis vor dem Fensterbeginn zählt nicht", () => {
    const w = R({ typ: "zaehlregel", parameter: { ereignis: "woche", fenster: { art: "rollierend", einheit: "monate", laenge: 12 }, richtung: "hoechstens", grenze: 1 } });
    expect(zaehlregel(w, { ereignisse: ["2025-03-31", "2025-04-01"], stichtag: "2026-03-31" }).fakten.anzahl).toBe(1);
    expect(zaehlregel(w, { ereignisse: ["2025-04-01", "2026-03-31"], stichtag: "2026-03-31" }).status).toBe("verletzt");
  });

  it("fehlende Ereignisliste oder fehlender Stichtag ist offen, nie erfüllt", () => {
    for (const k of [{ stichtag: "2026-03-07" }, { ereignisse: [] }, { ereignisse: null, stichtag: "2026-03-07" }, {}]) {
      const e = zaehlregel(rollend, k);
      expect(e.status, JSON.stringify(k)).toBe("offen");
      expect(e.offen).toBe(true);
      expect(e.befund.stufe).toBe("hinweis");
      expect(e.befund.text).toContain("Nicht bewertbar");
    }
  });
  it("ein Ereignis mit ungültigem Datum macht das Ergebnis offen", () => {
    expect(zaehlregel(rollend, { ereignisse: ["2026-02-30"], stichtag: "2026-03-07" }).status).toBe("offen");
    expect(zaehlregel(rollend, { ereignisse: ["gestern"], stichtag: "2026-03-07" }).status).toBe("offen");
  });
  it("unvollständige Parameter einer Regel werfen, statt still zu gelingen", () => {
    expect(() => zaehlregel(R({ typ: "zaehlregel", parameter: {} }), { ereignisse: [], stichtag: "2026-03-07" })).toThrow();
  });
});

describe("Grenzregel", () => {
  const h = R({ typ: "grenzregel", parameter: { groesse: "wochenstunden", hoechstens: 20 } });
  const m = R({ typ: "grenzregel", parameter: { groesse: "ruhezeit", mindestens: 11 } });

  it("die Grenze selbst ist erlaubt", () => {
    expect(grenzregel(h, { wert: 20 }).status).toBe("erfuellt");
    expect(grenzregel(m, { wert: 11 }).status).toBe("erfuellt");
  });
  it("knapp darüber beziehungsweise darunter ist verletzt", () => {
    expect(grenzregel(h, { wert: 20.01 }).status).toBe("verletzt");
    expect(grenzregel(m, { wert: 10.99 }).status).toBe("verletzt");
  });
  it("Gleitkommarauschen verletzt die Grenze nicht", () => {
    expect(grenzregel(h, { wert: 0.1 * 3 * (20 / 0.3) }).status).toBe("erfuellt");
  });
  it("kein Wert ist offen, nie erfüllt", () => {
    for (const w of [undefined, null, NaN, "20", Infinity]) {
      const e = grenzregel(h, { wert: w });
      expect(e.status, String(w)).toBe("offen");
      expect(e.befund.stufe).toBe("hinweis");
    }
  });
  it("0 ist ein Wert, kein fehlender Wert", () => {
    expect(grenzregel(h, { wert: 0 }).status).toBe("erfuellt");
    expect(grenzregel(m, { wert: 0 }).status).toBe("verletzt");
  });
  it("ohne Grenze wirft sie", () => {
    expect(() => grenzregel(R({ parameter: { groesse: "x" } }), { wert: 1 })).toThrow();
  });
});

describe("Besetzungsregel", () => {
  const regelMit = (anforderungen) => R({ typ: "besetzungsregel", parameter: { anforderungen } });

  describe("Mindestanzahl", () => {
    const r = regelMit([{ art: "anzahl", min: 2 }]);
    it("erfüllt bei genau der Anzahl", () => {
      expect(besetzungsregel(r, { personen: [P("a"), P("b")] }).status).toBe("erfuellt");
    });
    it("verletzt bei einer weniger", () => {
      const e = besetzungsregel(r, { personen: [P("a")] });
      expect(e.status).toBe("verletzt");
      expect(e.fakten).toEqual([{ gesamt: 1, min: 2 }]);
    });
    it("niemand im Dienst ist verletzt (bekannt), nicht offen", () => {
      expect(besetzungsregel(r, { personen: [] }).status).toBe("verletzt");
    });
    it("Personen ohne Merkmalsangabe zählen für die Anzahl", () => {
      expect(besetzungsregel(r, { personen: [ohneAngabe("a"), ohneAngabe("b")] }).status).toBe("erfuellt");
    });
  });

  describe("Mindestanzahl mit Qualifikation", () => {
    const r = regelMit([{ art: "anzahlMit", merkmal: "fachkraft", min: 1 }]);
    it("erfüllt, wenn eine Fachkraft da ist", () => {
      expect(besetzungsregel(r, { personen: [P("a", "fachkraft"), P("b")] }).status).toBe("erfuellt");
    });
    it("verletzt, wenn alle bekannt sind und keine Fachkraft dabei ist", () => {
      expect(besetzungsregel(r, { personen: [P("a"), P("b", "hilfskraft")] }).status).toBe("verletzt");
    });
    it("offen, wenn eine Person ohne Angabe die Fachkraft sein könnte", () => {
      const e = besetzungsregel(r, { personen: [P("a"), ohneAngabe("b")] });
      expect(e.status).toBe("offen");
      expect(e.befund.stufe).toBe("hinweis");
    });
    it("trotz unbekannter Person erfüllt, wenn es auch ohne sie reicht", () => {
      expect(besetzungsregel(r, { personen: [P("a", "fachkraft"), ohneAngabe("b")] }).status).toBe("erfuellt");
    });
  });

  describe("Quote mit Qualifikation (mindestens 40 %)", () => {
    const r = regelMit([{ art: "quoteMit", merkmal: "fachkraft", min: 0.4 }]);
    const crew = (fach, gesamt) => Array.from({ length: gesamt }, (_, i) => (i < fach ? P(`f${i}`, "fachkraft") : P(`h${i}`, "hilfskraft")));
    it("knapp darunter ist verletzt (2 von 6 = 33 %)", () => {
      const e = besetzungsregel(r, { personen: crew(2, 6) });
      expect(e.status).toBe("verletzt");
      expect(e.befund.text).toContain("33.3");
    });
    it("genau erreicht ist erfüllt (2 von 5 = 40 %)", () => {
      expect(besetzungsregel(r, { personen: crew(2, 5) }).status).toBe("erfuellt");
    });
    it("darüber ist erfüllt", () => {
      expect(besetzungsregel(r, { personen: crew(3, 5) }).status).toBe("erfuellt");
    });
    it("keine Personen: die Quote ist nicht berechenbar — offen, nicht grün", () => {
      const e = besetzungsregel(r, { personen: [] });
      expect(e.status).toBe("offen");
      expect(e.befund.stufe).toBe("hinweis");
    });
    it("unbekannte Personen, die die Quote noch retten könnten: offen", () => {
      expect(besetzungsregel(r, { personen: [P("a", "fachkraft"), P("b"), ohneAngabe("c")] }).status).toBe("offen");
    });
    it("unbekannte Personen, die sie auch dann nicht retten könnten: verletzt", () => {
      expect(besetzungsregel(r, { personen: [P("a"), P("b"), P("c"), P("d"), ohneAngabe("e"), P("f")] }).status).toBe("verletzt");
    });
  });

  describe("Höchstanteil Hilfskräfte", () => {
    const r = regelMit([{ art: "quoteMit", merkmal: "hilfskraft", max: 0.5 }]);
    it("genau die Hälfte ist erfüllt", () => {
      expect(besetzungsregel(r, { personen: [P("a", "hilfskraft"), P("b")] }).status).toBe("erfuellt");
    });
    it("mehr als die Hälfte ist verletzt", () => {
      expect(besetzungsregel(r, { personen: [P("a", "hilfskraft"), P("b", "hilfskraft"), P("c")] }).status).toBe("verletzt");
    });
    it("eine unbekannte Person, die die Obergrenze reißen könnte: offen", () => {
      expect(besetzungsregel(r, { personen: [P("a", "hilfskraft"), ohneAngabe("b"), P("c")] }).status).toBe("offen");
    });
  });

  describe("Verhältnis A:B", () => {
    const r = regelMit([{ art: "verhaeltnis", zaehler: "aufsicht", nenner: "azubi", min: 0.5 }]);
    it("1 Aufsicht auf 2 Azubis ist erfüllt", () => {
      expect(besetzungsregel(r, { personen: [P("a", "aufsicht"), P("b", "azubi"), P("c", "azubi")] }).status).toBe("erfuellt");
    });
    it("1 Aufsicht auf 3 Azubis ist verletzt", () => {
      const e = besetzungsregel(r, { personen: [P("a", "aufsicht"), P("b", "azubi"), P("c", "azubi"), P("d", "azubi")] });
      expect(e.status).toBe("verletzt");
      expect(e.fakten[0].noetig).toBe(2);
    });
    it("ohne Azubis ist nichts nötig", () => {
      expect(besetzungsregel(r, { personen: [P("a")] }).status).toBe("erfuellt");
    });
    it("eine Person ohne Angabe macht das Verhältnis offen", () => {
      expect(besetzungsregel(r, { personen: [P("a", "azubi"), ohneAngabe("b")] }).status).toBe("offen");
    });
  });

  describe("mehrere Anforderungen", () => {
    const r = regelMit([{ art: "anzahl", min: 2 }, { art: "anzahlMit", merkmal: "fachkraft", min: 1 }]);
    it("verletzt, sobald eine verletzt ist — auch wenn eine andere offen wäre", () => {
      expect(besetzungsregel(r, { personen: [P("a")] }).status).toBe("verletzt");
    });
    it("beide erfüllt", () => {
      expect(besetzungsregel(r, { personen: [P("a", "fachkraft"), P("b")] }).status).toBe("erfuellt");
    });
  });

  it("fehlende Personenliste ist offen, nie erfüllt", () => {
    for (const k of [{}, { personen: null }, { personen: "a" }]) {
      const e = besetzungsregel(regelMit([{ art: "anzahl", min: 1 }]), k);
      expect(e.status, JSON.stringify(k)).toBe("offen");
      expect(e.befund.stufe).toBe("hinweis");
    }
  });
  it("PpUGV: die bestehende Besetzungsprüfung bleibt Sache von aufgabeGedeckt — der Baukasten rechnet sie nicht noch einmal", () => {
    expect(regel("PPUGV-01").pruefstatus).toBe("legacy_verified");
    expect(() => pruefeRegel("PPUGV-01", {})).toThrow(/Bestandsregel/);
    expect(() => besetzungsregel("PPUGV-01", { personen: [] })).toThrow(/Bestandsregel/);
  });
  it("eine unbekannte Anforderungsart wirft", () => {
    expect(() => besetzungsregel(regelMit([{ art: "magie" }]), { personen: [P("a")] })).toThrow();
  });
});

describe("Paarregel", () => {
  const r = R({ typ: "paarregel", parameter: { wenn: "A", dann: "B", min: 1 } });

  it("A und B im Dienst: erfüllt", () => {
    expect(paarregel(r, { personen: [P("p1", "A"), P("p2", "B")] }).status).toBe("erfuellt");
  });
  it("nur A im Dienst: verletzt, die Person wird genannt", () => {
    const e = paarregel(r, { personen: [P("p1", "A"), P("p2")] });
    expect(e.status).toBe("verletzt");
    expect(e.fakten.ohne).toEqual(["p1"]);
    expect(e.befund.regelId).toBe("TEST-REGEL-01");
  });
  it("nur B im Dienst: nicht anwendbar", () => {
    const e = paarregel(r, { personen: [P("p1", "B"), P("p2")] });
    expect(e.status).toBe("nicht_anwendbar");
    expect(e.befund).toBeNull();
  });
  it("weder A noch B: nicht anwendbar", () => {
    expect(paarregel(r, { personen: [P("p1"), P("p2")] }).status).toBe("nicht_anwendbar");
    expect(paarregel(r, { personen: [] }).status).toBe("nicht_anwendbar");
  });
  it("eine Person mit A und B genügt sich nicht selbst", () => {
    expect(paarregel(r, { personen: [P("p1", "A", "B")] }).status).toBe("verletzt");
  });
  it("zwei Personen mit A und B decken sich gegenseitig", () => {
    expect(paarregel(r, { personen: [P("p1", "A", "B"), P("p2", "A", "B")] }).status).toBe("erfuellt");
  });
  it("min 2: eine B-Person genügt nicht", () => {
    const zwei = R({ typ: "paarregel", parameter: { wenn: "A", dann: "B", min: 2 } });
    expect(paarregel(zwei, { personen: [P("p1", "A"), P("p2", "B")] }).status).toBe("verletzt");
    expect(paarregel(zwei, { personen: [P("p1", "A"), P("p2", "B"), P("p3", "B")] }).status).toBe("erfuellt");
  });
  it("eine Person ohne Angabe, die B sein könnte: offen, nicht grün", () => {
    expect(paarregel(r, { personen: [P("p1", "A"), ohneAngabe("p2")] }).status).toBe("offen");
  });
  it("eine Person ohne Angabe, die A sein könnte, und niemand sonst mit A: offen", () => {
    expect(paarregel(r, { personen: [ohneAngabe("p1"), P("p2", "B")] }).status).toBe("offen");
  });
  it("fehlende Personenliste ist offen", () => {
    expect(paarregel(r, {}).status).toBe("offen");
  });
});

describe("Gültigkeit und Prüfstatus im Baukasten", () => {
  const zeitlich = R({ typ: "grenzregel", gueltigAb: "2027-01-01", gueltigBis: "2027-12-31", parameter: { groesse: "x", hoechstens: 1 } });

  it("außerhalb der Gültigkeit ist die Regel nicht anwendbar und erzeugt keinen Befund", () => {
    const e = grenzregel(zeitlich, { wert: 99, datum: "2026-12-31" });
    expect(e.status).toBe("nicht_anwendbar");
    expect(e.grund).toBe("ausserhalb_gueltigkeit");
    expect(e.befund).toBeNull();
    expect(grenzregel(zeitlich, { wert: 99, datum: "2028-01-01" }).status).toBe("nicht_anwendbar");
  });
  it("innerhalb gilt sie, die Grenztage eingeschlossen", () => {
    expect(grenzregel(zeitlich, { wert: 99, datum: "2027-01-01" }).status).toBe("verletzt");
    expect(grenzregel(zeitlich, { wert: 99, datum: "2027-12-31" }).status).toBe("verletzt");
  });
  it("ohne Datum gilt eine Regel mit Gültigkeitsgrenzen nicht (fail-closed) — statt still zu rechnen", () => {
    expect(grenzregel(zeitlich, { wert: 99 }).status).toBe("nicht_anwendbar");
  });
  it("vorläufig: höchstens ein Hinweis, auch bei Regelgrenze „recht“", () => {
    const v = R({ pruefstatus: "provisional", pruefhinweis: "x", regelstand: null, hoechsteStufe: "recht", parameter: { groesse: "x", hoechstens: 1 } });
    const e = grenzregel(v, { wert: 5 });
    expect(e.status).toBe("verletzt");
    expect(e.befund.stufe).toBe("hinweis");
    expect(e.befund.pruefstatus).toBe("provisional");
    expect(e.befund.folge).toBe("keine");
  });
  it("vorläufig und offen: ebenfalls Hinweis", () => {
    const v = R({ pruefstatus: "provisional", pruefhinweis: "x", regelstand: null, parameter: { groesse: "x", hoechstens: 1 } });
    expect(grenzregel(v, {}).befund.stufe).toBe("hinweis");
  });
  it("watchlist und deprecated: nicht anwendbar, kein Befund, keine Rechnung", () => {
    for (const s of ["watchlist", "deprecated"]) {
      const e = grenzregel(R({ pruefstatus: s, parameter: { groesse: "x", hoechstens: 1 } }), { wert: 99 });
      expect(e.status, s).toBe("nicht_anwendbar");
      expect(e.befund, s).toBeNull();
    }
  });
  it("kein Registereintrag mit Status provisional kann je eine höhere Stufe als Hinweis liefern", () => {
    const werkstudent = regel("BESCH-WERKSTUDENT-01");
    expect(grenzregel(werkstudent, { wert: 40 }).befund.stufe).toBe("hinweis");
    const jahr = regel("BESCH-KURZFRISTIG-01");
    const e = zaehlregel(jahr, { ereignisse: tage("2026-01-01", 100), stichtag: "2026-06-01" });
    expect(e.status).toBe("verletzt");
    expect(e.befund.stufe).toBe("hinweis");
    const eup = regel("KOPPLUNG-EUP-EFK-01");
    expect(paarregel(eup, { personen: [P("a", "elektrotechnisch_unterwiesen")] }).befund.stufe).toBe("hinweis");
    const brand = regel("QUOTE-BRANDSCHUTZ-01");
    const b = besetzungsregel(brand, { personen: Array.from({ length: 10 }, (_, i) => P(`p${i}`)) });
    expect(b.status).toBe("verletzt");
    expect(b.befund.stufe).toBe("hinweis");
    expect(b.befund.parameter.richtwert).toBe(true);
  });
  it("Bewertung und Folge sind getrennte Felder: eine Regel mit Folge Nachweis bleibt auf ihrer Stufe", () => {
    const n = R({ folge: "nachweis", hoechsteStufe: "achtung", parameter: { groesse: "x", hoechstens: 1 } });
    const e = grenzregel(n, { wert: 5 });
    expect(e.befund.stufe).toBe("achtung");
    expect(e.befund.folge).toBe("nachweis");
  });
  it("ohne eigene Folge: Hinweis ohne Folge, höhere Stufen verlangen Bestätigung (E-19)", () => {
    const hinweis = grenzregel(R({ hoechsteStufe: "hinweis", parameter: { groesse: "x", hoechstens: 1 } }), { wert: 5 });
    expect(hinweis.befund.folge).toBe("keine");
    const recht = grenzregel(R({ parameter: { groesse: "x", hoechstens: 1 } }), { wert: 5 });
    expect(recht.befund.folge).toBe("bestaetigung");
  });
  it("die Regelstufe bremst: hoechsteStufe achtung macht aus einer Verletzung nie einen Rechtsverstoß", () => {
    expect(grenzregel(R({ hoechsteStufe: "achtung", parameter: { groesse: "x", hoechstens: 1 } }), { wert: 5 }).befund.stufe).toBe("achtung");
  });
});

describe("Dispatcher", () => {
  it("rechnet nach Regelart, auch über die Kennung", () => {
    expect(pruefeRegel("BESCH-WERKSTUDENT-01", { wert: 10 }).status).toBe("erfuellt");
    expect(pruefeRegel(R({ typ: "paarregel", parameter: { wenn: "A", dann: "B" } }), { personen: [P("a", "A"), P("b", "B")] }).status).toBe("erfuellt");
  });
  it("eine unbekannte Kennung wirft", () => {
    expect(() => pruefeRegel("GIBT-ES-NICHT-01", {})).toThrow(/nicht im Register/);
  });
  it("eine nicht gerechnete Regelart wirft, statt still zu bestehen", () => {
    expect(() => pruefeRegel(R({ typ: "musterregel" }), {})).toThrow(/noch nicht gerechnet/);
  });
  it("eine Regel falscher Art wirft", () => {
    expect(() => zaehlregel("BESCH-WERKSTUDENT-01", {})).toThrow(/keine zaehlregel/);
  });
  it("Bestandsregeln rechnet der Baukasten nie", () => {
    for (const r of REGELN.filter((x) => x.pruefstatus === "legacy_verified"))
      expect(() => pruefeRegel(r, {}), r.id).toThrow(/Bestandsregel/);
  });
  it("die neuen Registerregeln der gerechneten Arten sind auswertbar", () => {
    for (const r of REGELN.filter((x) => x.pruefstatus !== "legacy_verified" && REGELARTEN_GERECHNET.includes(x.typ)))
      expect(() => pruefeRegel(r, {}), r.id).not.toThrow();
  });
});
