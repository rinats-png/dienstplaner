/* ==========================================================================
   INTELLIGENCE — REGELBAUKASTEN, VIER NEUE ARTEN (WP-I3)

   Musterregel, Blockregel, Verteilungsregel, Wunschregel — je positiv,
   negativ und an den Rändern. Dazu: Wochenend-Rotation aus Plan 5.3, Testlauf,
   Bestimmtheit (gleiche Eingabe, gleiche Ausgabe), keine Veränderung der
   Eingaben, keine Personenbewertung, Laufzeit bei 31 Tagen x 40 Personen.

   Aufruf: npm run pruefung:intelligence
   ========================================================================== */
import { describe, it, expect } from "vitest";
import {
  musterregel, blockregel, verteilungsregel, wunschregel, pruefeRegel, testlauf,
  wochenendEreignisse, wochenendZaehlregel, wuenscheGeordnet, REGELARTEN_ALLE,
} from "../src/regelbaukasten.js";
import { REGELARTEN } from "../src/regelregister.js";

const R = (o) => ({
  id: "TEST-NEU-01", typ: "musterregel", bezeichnung: "Testregel", ebene: "betrieb",
  quelle: null, fundstelle: null, gueltigAb: null, gueltigBis: null,
  pruefstatus: "verified", geprueftAm: "2026-11-06", regelstand: "2026.11",
  scope: { branche: null, bundesland: null, beschaeftigungsmodell: null },
  hoechsteStufe: "achtung", folge: null, parameter: {}, ...o,
});
const tageAb = (von, n) => Array.from({ length: n }, (_, i) => {
  const d = new Date(`${von}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + i);
  return d.toISOString().slice(0, 10);
});
/** Plan aus Klassenfolge ab einem Tag; "?" = unbekannt (kein Eintrag). */
const plan = (von, folge) => {
  const t = {};
  tageAb(von, folge.length).forEach((d, i) => { if (folge[i] !== "?") t[d] = folge[i]; });
  return t;
};
const tiefEinfrieren = (o) => { if (o && typeof o === "object") { Object.values(o).forEach(tiefEinfrieren); Object.freeze(o); } return o; };

/* 2026-03-02 ist ein Montag. */
const MO = "2026-03-02";

describe("Musterregel — verbotene Folge", () => {
  const regel = R({ typ: "musterregel", bezeichnung: "Nach Nacht kein Früh", parameter: { art: "verbotenFolge", von: ["N"], dann: ["F"] } });
  const lauf = (folge) => musterregel(regel, { tage: plan(MO, folge), von: MO, bis: tageAb(MO, folge.length).at(-1) });

  it("Nacht gefolgt von Früh ist ein Verstoß, mit Tag und Folgetag", () => {
    const e = lauf(["F", "N", "F", "frei"]);
    expect(e.status).toBe("verletzt");
    expect(e.fakten.verstoesse).toEqual([{ tag: "2026-03-03", folgetag: "2026-03-04", von: "N", dann: "F" }]);
    expect(e.befund.stufe).toBe("achtung");
  });
  it("Nacht gefolgt von frei oder Spät ist in Ordnung", () => {
    expect(lauf(["N", "frei", "F"]).status).toBe("erfuellt");
    const r2 = R({ parameter: { art: "verbotenFolge", von: ["N"], dann: ["F"] } });
    expect(musterregel(r2, { tage: plan(MO, ["N", "S"]), von: MO, bis: "2026-03-03" }).status).toBe("erfuellt");
  });
  it("Rand: Nacht am letzten Tag des Zeitraums hat kein Paar und verletzt nichts", () => {
    expect(lauf(["F", "F", "N"]).status).toBe("erfuellt");
  });
  it("ein unbekannter Tag macht das Ergebnis offen, nicht grün", () => {
    const e = lauf(["N", "?", "F"]);
    expect(e.status).toBe("offen");
    expect(e.befund.stufe).toBe("hinweis");
  });
  it("ein sicherer Verstoß bleibt ein Verstoß, auch wenn anderswo Tage fehlen", () => {
    expect(lauf(["N", "F", "?", "F"]).status).toBe("verletzt");
  });
  it("abstandTage 2: Nacht, ein Tag Pause, dann Früh", () => {
    const r2 = R({ parameter: { art: "verbotenFolge", von: ["N"], dann: ["F"], abstandTage: 2 } });
    expect(musterregel(r2, { tage: plan(MO, ["N", "frei", "F"]), von: MO, bis: "2026-03-04" }).status).toBe("verletzt");
    expect(musterregel(r2, { tage: plan(MO, ["N", "F", "frei"]), von: MO, bis: "2026-03-04" }).status).toBe("erfuellt");
  });
  it("Plan 5.3: Nachtdienst-Wochenende, am Montag Früh → Ruhezeit-Hinweis (Verstoß), Montag frei → in Ordnung", () => {
    const so = "2026-11-29"; // Sonntag
    const mit = { tage: { "2026-11-28": "N", [so]: "N", "2026-11-30": "F" }, von: "2026-11-28", bis: "2026-11-30" };
    expect(musterregel(regel, mit).status).toBe("verletzt");
    expect(musterregel(regel, { ...mit, tage: { ...mit.tage, "2026-11-30": "frei" } }).status).toBe("erfuellt");
  });
  it("ohne Zeitraum: offen; ein Zeitraum mit nur einem Tag: nicht anwendbar", () => {
    expect(musterregel(regel, { tage: {} }).status).toBe("offen");
    expect(musterregel(regel, { tage: { [MO]: "N" }, von: MO, bis: MO }).status).toBe("nicht_anwendbar");
  });
  it("unvollständige Parameter und unbekannte Art werfen", () => {
    expect(() => musterregel(R({ parameter: { art: "verbotenFolge", von: ["N"] } }), { von: MO, bis: MO })).toThrow(/unvollständig/);
    expect(() => musterregel(R({ parameter: { art: "irgendwas" } }), { von: MO, bis: MO })).toThrow(/unvollständig/);
    expect(() => musterregel(R({ parameter: { art: "verbotenFolge", von: ["N"], dann: ["F"], abstandTage: 0 } }), { von: MO, bis: MO })).toThrow(/abstandTage/);
  });
});

describe("Musterregel — höchstens eine Folge, danach frei", () => {
  const regel = R({ bezeichnung: "Nachtblock", parameter: { art: "hoechstensFolge", klassen: ["N"], max: 3, danachFrei: 2 } });
  /* Mitten im Zeitraum beginnen: ein vorgeschalteter Frei-Tag, damit der Block nicht am Rand steht. */
  const lauf = (folge) => musterregel(regel, { tage: plan(MO, folge), von: MO, bis: tageAb(MO, folge.length).at(-1) });

  it("drei Nächte, danach zwei Tage frei: in Ordnung", () => {
    expect(lauf(["frei", "N", "N", "N", "frei", "frei", "F"]).status).toBe("erfuellt");
  });
  it("vier Nächte sind zu viel", () => {
    const e = lauf(["frei", "N", "N", "N", "N", "frei", "frei"]);
    expect(e.status).toBe("verletzt");
    expect(e.fakten.verstoesse[0]).toMatchObject({ grund: "zu_lang", laenge: 4, von: "2026-03-03", bis: "2026-03-06" });
  });
  it("nach dem Block nur ein freier Tag, dann Dienst: Verstoß", () => {
    const e = lauf(["frei", "N", "N", "frei", "F", "frei", "frei"]);
    expect(e.status).toBe("verletzt");
    expect(e.fakten.verstoesse[0]).toMatchObject({ grund: "nicht_frei_danach", tag: "2026-03-06" });
  });
  it("Rand vorn: ein Block ab dem ersten Tag könnte früher begonnen haben → offen", () => {
    expect(lauf(["N", "N", "frei", "frei", "frei"]).status).toBe("offen");
  });
  it("Rand vorn, aber schon zu lang: sicher verletzt", () => {
    expect(lauf(["N", "N", "N", "N", "frei", "frei"]).status).toBe("verletzt");
  });
  it("Block am Ende, die Freitage danach liegen außerhalb → offen", () => {
    expect(lauf(["frei", "frei", "N", "N", "N"]).status).toBe("offen");
  });
  it("genau max Nächte ist erlaubt (Grenze)", () => {
    expect(lauf(["frei", "N", "N", "N", "frei", "frei"]).status).toBe("erfuellt");
  });
  it("ein unbekannter Tag im Block macht offen", () => {
    expect(lauf(["frei", "N", "?", "N", "frei", "frei", "frei"]).status).toBe("offen");
  });
  it("ohne danachFrei zählt nur die Länge", () => {
    const r2 = R({ parameter: { art: "hoechstensFolge", klassen: ["N"], max: 2 } });
    expect(musterregel(r2, { tage: plan(MO, ["frei", "N", "N", "F"]), von: MO, bis: "2026-03-05" }).status).toBe("erfuellt");
  });
  it("mehrere Klassen bilden einen gemeinsamen Block", () => {
    const r2 = R({ parameter: { art: "hoechstensFolge", klassen: ["N", "S"], max: 2 } });
    expect(musterregel(r2, { tage: plan(MO, ["frei", "N", "S", "N", "frei"]), von: MO, bis: "2026-03-06" }).status).toBe("verletzt");
  });
});

describe("Blockregel — zusammengehörige Tage", () => {
  const regel = R({ typ: "blockregel", bezeichnung: "Wochenende einheitlich", parameter: { wochentage: [5, 6] } });
  const SA = "2026-03-07", SO = "2026-03-08";
  const ein = (sa, so, extra = {}) => blockregel(regel, { tage: { [SA]: sa, [SO]: so }, von: MO, bis: "2026-03-08", ...extra });

  it("gleiche Dienstart an beiden Tagen: erfüllt", () => { expect(ein("F", "F").status).toBe("erfuellt"); });
  it("Früh am Samstag, Spät am Sonntag: verletzt, mit den Tagen", () => {
    const e = ein("F", "S");
    expect(e.status).toBe("verletzt");
    expect(e.fakten.verstoesse[0].tage).toEqual([SA, SO]);
  });
  it("mit Gruppen gelten Früh und Spät als gleich (Frage 4 des Plans ist ein Parameter)", () => {
    const r2 = R({ typ: "blockregel", parameter: { wochentage: [5, 6], gruppen: { F: "tag", S: "tag", N: "nacht" } } });
    const k = (a, b) => ({ tage: { [SA]: a, [SO]: b }, von: MO, bis: SO });
    expect(blockregel(r2, k("F", "S")).status).toBe("erfuellt");
    expect(blockregel(r2, k("F", "N")).status).toBe("verletzt");
  });
  it("Dienst an einem Tag und frei am anderen ist uneinheitlich", () => { expect(ein("F", "frei").status).toBe("verletzt"); });
  it("beide frei ist einheitlich", () => { expect(ein("frei", "frei").status).toBe("erfuellt"); });
  it("ein unbekannter Tag macht offen; ein sicherer Widerspruch bleibt verletzt", () => {
    expect(ein("F", undefined).status).toBe("offen");
    const k = { tage: { [SA]: "F", "2026-03-14": "F", "2026-03-15": "N" }, von: MO, bis: "2026-03-15" };
    expect(blockregel(regel, k).status).toBe("verletzt");
  });
  it("Randblock (Monat beginnt am Sonntag) wird nicht bewertet und nicht als erfüllt gezählt", () => {
    const e = blockregel(regel, { tage: { "2026-03-01": "F" }, von: "2026-03-01", bis: "2026-03-05" });
    expect(e.status).toBe("offen");
    expect(e.fakten.randbloecke).toEqual(["2026-02-28"]);
  });
  it("ein Zeitraum ohne Block: nicht anwendbar", () => {
    expect(blockregel(regel, { tage: {}, von: MO, bis: "2026-03-05" }).status).toBe("nicht_anwendbar");
  });
  it("mehrere Wochen: ein schlechtes Wochenende genügt, alle werden gezählt", () => {
    const tage = { "2026-03-07": "F", "2026-03-08": "F", "2026-03-14": "F", "2026-03-15": "S", "2026-03-21": "N", "2026-03-22": "N" };
    const e = blockregel(regel, { tage, von: MO, bis: "2026-03-22" });
    expect(e.fakten.bloecke).toBe(3);
    expect(e.fakten.verstoesse).toHaveLength(1);
    expect(e.status).toBe("verletzt");
  });
  it("Block aus drei Tagen (Fr–So)", () => {
    const r3 = R({ typ: "blockregel", parameter: { wochentage: [4, 5, 6] } });
    expect(blockregel(r3, { tage: { "2026-03-06": "N", [SA]: "N", [SO]: "N" }, von: MO, bis: SO }).status).toBe("erfuellt");
    expect(blockregel(r3, { tage: { "2026-03-06": "N", [SA]: "N", [SO]: "F" }, von: MO, bis: SO }).status).toBe("verletzt");
  });
  it("ungültige Wochentage werfen", () => {
    expect(() => blockregel(R({ typ: "blockregel", parameter: { wochentage: [5] } }), { von: MO, bis: SO })).toThrow(/wochentage/);
    expect(() => blockregel(R({ typ: "blockregel", parameter: { wochentage: [5, 9] } }), { von: MO, bis: SO })).toThrow(/wochentage/);
  });
});

describe("Verteilungsregel — gleichmäßig verteilen", () => {
  const regel = R({ typ: "verteilungsregel", bezeichnung: "Nächte gleichmäßig", parameter: { groesse: "Nachtdienste im Quartal", maxAbweichung: 1 } });
  const lauf = (werte) => verteilungsregel(regel, { werte });

  it("Spannweite innerhalb der Grenze: erfüllt (genau 1 ist erlaubt)", () => {
    const e = lauf({ a: 4, b: 5, c: 4 });
    expect(e.status).toBe("erfuellt");
    expect(e.fakten).toMatchObject({ min: 4, max: 5, spannweite: 1 });
  });
  it("Spannweite 2 bei höchstens 1: verletzt, mit niedrigster und höchster Kennung", () => {
    const e = lauf({ a: 3, b: 5, c: 4 });
    expect(e.status).toBe("verletzt");
    expect(e.fakten.niedrigste).toEqual(["a"]);
    expect(e.fakten.hoechste).toEqual(["b"]);
  });
  it("alle gleich: erfüllt, auch bei maxAbweichung 0", () => {
    expect(verteilungsregel(R({ typ: "verteilungsregel", parameter: { groesse: "x", maxAbweichung: 0 } }), { werte: { a: 2, b: 2 } }).status).toBe("erfuellt");
  });
  it("Kommazahlen ohne Rundungsfehler", () => {
    expect(verteilungsregel(R({ typ: "verteilungsregel", parameter: { groesse: "x", maxAbweichung: 0.3 } }), { werte: { a: 0.1, b: 0.4 } }).status).toBe("erfuellt");
  });
  it("ein fehlender Wert macht offen; eine sichere Verletzung bleibt verletzt", () => {
    expect(lauf({ a: 4, b: 5, c: undefined }).status).toBe("offen");
    expect(lauf({ a: 1, b: 5, c: undefined }).status).toBe("verletzt");
  });
  it("NaN und Text zählen als unbekannt, nicht als 0", () => {
    expect(lauf({ a: 0, b: 1, c: NaN, d: "viel" }).status).toBe("offen");
  });
  it("weniger als zwei bekannte Werte: offen; weniger als zwei Personen: nicht anwendbar; keine Werte: offen", () => {
    expect(lauf({ a: 3, b: undefined }).status).toBe("offen");
    expect(lauf({ a: 3 }).status).toBe("nicht_anwendbar");
    expect(verteilungsregel(regel, {}).status).toBe("offen");
  });
  it("Ausgabe unabhängig von der Reihenfolge der Schlüssel", () => {
    expect(lauf({ c: 4, a: 3, b: 5 })).toEqual(lauf({ a: 3, b: 5, c: 4 }));
  });
});

describe("Wunschregel — nur ein Wunsch", () => {
  const regel = R({ typ: "wunschregel", bezeichnung: "Dienstag frei", hoechsteStufe: "recht", folge: "freigabe", parameter: { wunsch: "frei", wochentage: [1], prioritaet: 2 } });
  /* 2026-03-03 und 03-10 sind Dienstage. */
  const lauf = (tage, r = regel) => wunschregel(r, { tage, von: MO, bis: "2026-03-15" });

  it("alle Dienstage frei: erfüllt", () => {
    expect(lauf({ "2026-03-03": "frei", "2026-03-10": "frei" }).status).toBe("erfuellt");
  });
  it("ein Dienstag mit Dienst: verletzt, aber nie mehr als ein Hinweis ohne Folge", () => {
    const e = lauf({ "2026-03-03": "frei", "2026-03-10": "F" });
    expect(e.status).toBe("verletzt");
    expect(e.befund.stufe).toBe("hinweis");
    expect(e.befund.folge).toBe("keine");
    expect(e.fakten).toMatchObject({ wunschtage: 2, erfuellt: 1, nichtErfuellt: ["2026-03-10"], prioritaet: 2 });
  });
  it("ein unbekannter Dienstag: offen", () => {
    expect(lauf({ "2026-03-03": "frei" }).status).toBe("offen");
  });
  it("kein Wunschtag im Zeitraum: nicht anwendbar", () => {
    expect(wunschregel(regel, { tage: {}, von: "2026-03-04", bis: "2026-03-09" }).status).toBe("nicht_anwendbar");
  });
  it("Wunsch nach bestimmten Daten", () => {
    const r2 = R({ typ: "wunschregel", parameter: { wunsch: "frei", daten: ["2026-03-14"] } });
    expect(lauf({ "2026-03-14": "frei" }, r2).status).toBe("erfuellt");
    expect(lauf({ "2026-03-14": "N" }, r2).status).toBe("verletzt");
  });
  it("Wunsch nach einer Dienstart und gegen eine Dienstart", () => {
    const will = R({ typ: "wunschregel", parameter: { wunsch: "dienstart", wochentage: [0], klassen: ["F"] } });
    const nicht = R({ typ: "wunschregel", parameter: { wunsch: "keineDienstart", wochentage: [0], klassen: ["N"] } });
    expect(lauf({ [MO]: "F", "2026-03-09": "F" }, will).status).toBe("erfuellt");
    expect(lauf({ [MO]: "F", "2026-03-09": "S" }, will).status).toBe("verletzt");
    expect(lauf({ [MO]: "F", "2026-03-09": "frei" }, nicht).status).toBe("erfuellt");
    expect(lauf({ [MO]: "N", "2026-03-09": "frei" }, nicht).status).toBe("verletzt");
  });
  it("ungültige Parameter werfen", () => {
    expect(() => wunschregel(R({ typ: "wunschregel", parameter: { wunsch: "frei" } }), { von: MO, bis: MO })).toThrow(/wochentage/);
    expect(() => wunschregel(R({ typ: "wunschregel", parameter: { wunsch: "egal", wochentage: [1] } }), { von: MO, bis: MO })).toThrow(/wunsch/);
    expect(() => wunschregel(R({ typ: "wunschregel", parameter: { wunsch: "frei", wochentage: [1], prioritaet: 9 } }), { von: MO, bis: MO })).toThrow(/prioritaet/);
    expect(() => wunschregel(R({ typ: "wunschregel", parameter: { wunsch: "dienstart", wochentage: [1] } }), { von: MO, bis: MO })).toThrow(/klassen/);
  });
  it("Prioritäten ordnen: 1 vor 5, unerfüllt vor erfüllt, dann nach Kennung; ohne Zufall", () => {
    const e = (id, prio, status) => ({ regelId: id, status, fakten: { prioritaet: prio } });
    const eingabe = [e("b", 3, "erfuellt"), e("a", 3, "verletzt"), e("c", 1, "erfuellt"), e("d", 5, "verletzt")];
    const ordnung = wuenscheGeordnet(eingabe).map((x) => x.regelId);
    expect(ordnung).toEqual(["c", "a", "b", "d"]);
    expect(wuenscheGeordnet([...eingabe].reverse()).map((x) => x.regelId)).toEqual(ordnung);
    expect(eingabe.map((x) => x.regelId)).toEqual(["b", "a", "c", "d"]); // Eingabe unverändert
  });
});

describe("Gemeinsame Zusagen aller vier Arten", () => {
  const faelle = [
    ["musterregel", { art: "verbotenFolge", von: ["N"], dann: ["F"] }, { tage: { [MO]: "N", "2026-03-03": "F" }, von: MO, bis: "2026-03-03" }, musterregel],
    ["blockregel", { wochentage: [5, 6] }, { tage: { "2026-03-07": "F", "2026-03-08": "S" }, von: MO, bis: "2026-03-08" }, blockregel],
    ["verteilungsregel", { groesse: "x", maxAbweichung: 0 }, { werte: { a: 1, b: 2 } }, verteilungsregel],
    ["wunschregel", { wunsch: "frei", wochentage: [0] }, { tage: { [MO]: "F" }, von: MO, bis: MO }, wunschregel],
  ];
  for (const [typ, parameter, kontext, fn] of faelle) {
    describe(typ, () => {
      const regel = R({ typ, parameter });
      it("gleiche Eingabe, gleiche Ausgabe", () => {
        expect(fn(regel, kontext)).toEqual(fn(regel, kontext));
        expect(JSON.stringify(fn(regel, kontext))).toBe(JSON.stringify(fn(structuredClone(regel), structuredClone(kontext))));
      });
      it("verändert weder Regel noch Kontext (auch tief eingefroren nicht)", () => {
        const r = tiefEinfrieren(structuredClone(regel)), k = tiefEinfrieren(structuredClone(kontext));
        expect(() => fn(r, k)).not.toThrow();
        expect(r).toEqual(regel); expect(k).toEqual(kontext);
      });
      it("wirkt nicht bei watchlist und außerhalb der Gültigkeit", () => {
        expect(fn(R({ typ, parameter, pruefstatus: "watchlist" }), kontext).status).toBe("nicht_anwendbar");
        expect(fn(R({ typ, parameter, gueltigAb: "2099-01-01" }), { ...kontext, stichtag: "2026-03-08" }).status).toBe("nicht_anwendbar");
      });
      it("eine vorläufige Regel erzeugt höchstens einen Hinweis", () => {
        const e = fn(R({ typ, parameter, pruefstatus: "provisional", hoechsteStufe: "recht" }), kontext);
        if (e.status === "verletzt") expect(e.befund.stufe).toBe("hinweis");
      });
      it("nennt kein Personenmerkmal: Parameter mit Gesundheit/Leistung/Fehlzeit werfen", () => {
        for (const wort of ["Krankheitstage", "Fehlzeit", "Leistung", "Gesundheit", "Zuverlässigkeit"])
          expect(() => fn(R({ typ, parameter: { ...parameter, groesse: wort } }), kontext), wort).toThrow(/Personenmerkmal/);
      });
      it("falsche Regelart wirft", () => {
        expect(() => fn(R({ typ: "zaehlregel", parameter }), kontext)).toThrow(/keine/);
      });
    });
  }
});

describe("Wochenend-Rotation (Plan 5.3) mit den vier alten und neuen Arten zusammen", () => {
  /* November 2026: Samstage 7., 14., 21., 28. Der 31.10./1.11. ist ein Randwochenende. */
  const VON = "2026-11-01", BIS = "2026-11-30", ST = "2026-11-30";
  const opt = { von: VON, bis: BIS, stichtag: ST, tagKlassen: ["F", "S"], nachtKlassen: ["N"] };
  const gut = {
    "2026-11-07": "frei", "2026-11-08": "frei", "2026-11-14": "frei", "2026-11-15": "frei",
    "2026-11-21": "F", "2026-11-22": "F", "2026-11-28": "N", "2026-11-29": "N", "2026-11-30": "frei",
  };
  const zaehl = (id, richtung, grenze) => R({
    id, typ: "zaehlregel", bezeichnung: id,
    parameter: { ereignis: "Wochenende", fenster: { art: "kalendermonat" }, richtung, grenze },
  });
  const rot = (tage) => ({
    freiMin: wochenendZaehlregel(zaehl("WE-FREI-MIN", "mindestens", 2), "frei", { ...opt, tage }),
    freiMax: wochenendZaehlregel(zaehl("WE-FREI-MAX", "hoechstens", 2), "frei", { ...opt, tage }),
    tag: wochenendZaehlregel(zaehl("WE-TAG-MIN", "mindestens", 1), "tag", { ...opt, tage }),
    tagMax: wochenendZaehlregel(zaehl("WE-TAG-MAX", "hoechstens", 1), "tag", { ...opt, tage }),
    nacht: wochenendZaehlregel(zaehl("WE-NACHT-MIN", "mindestens", 1), "nacht", { ...opt, tage }),
    nachtMax: wochenendZaehlregel(zaehl("WE-NACHT-MAX", "hoechstens", 1), "nacht", { ...opt, tage }),
    block: blockregel(R({ typ: "blockregel", parameter: { wochentage: [5, 6], gruppen: { F: "tag", S: "tag" } } }), { tage, von: VON, bis: BIS }),
    montag: musterregel(R({ parameter: { art: "verbotenFolge", von: ["N"], dann: ["F", "S"] } }), { tage, von: "2026-11-28", bis: BIS }),
  });

  it("ordnet jedes Wochenende einer Art zu; das Randwochenende wird nicht gezählt", () => {
    const e = wochenendEreignisse(gut, VON, BIS, opt);
    expect(e).toMatchObject({ frei: ["2026-11-07", "2026-11-14"], tag: ["2026-11-21"], nacht: ["2026-11-28"], rand: ["2026-10-31"], vollstaendig: true });
  });
  it("2 freie, 1 Tag-, 1 Nachtwochenende: alles erfüllt, Block einheitlich, Montag frei", () => {
    const e = rot(gut);
    for (const [k, v] of Object.entries(e)) expect(v.status, k).toBe("erfuellt");
  });
  it("drei freie Wochenenden und kein Nachtdienst-Wochenende: Höchst- und Mindestgrenzen schlagen an", () => {
    const e = rot({ ...gut, "2026-11-28": "frei", "2026-11-29": "frei" });
    expect(e.freiMax.status).toBe("verletzt");
    expect(e.nacht.status).toBe("verletzt");
  });
  it("Nachtdienst-Wochenende mit Früh am Montag: Verstoß gegen das Muster (Ruhezeit-Hinweis)", () => {
    expect(rot({ ...gut, "2026-11-30": "F" }).montag.status).toBe("verletzt");
  });
  it("Samstag Tag, Sonntag Nacht: uneinheitlicher Block", () => {
    expect(rot({ ...gut, "2026-11-21": "F", "2026-11-22": "N" }).block.status).toBe("verletzt");
  });
  it("ein Wochenende ohne Plan: höchstens und mindestens werden nie grün, die sichere Seite bleibt gültig", () => {
    const luecke = { ...gut }; delete luecke["2026-11-14"]; delete luecke["2026-11-15"];
    const e = rot(luecke);
    expect(e.freiMin.status).toBe("offen"); // 1 frei gezählt, mindestens 2, das offene könnte es heilen
    expect(e.freiMax.status).toBe("offen"); // 1 frei gezählt, das offene könnte das Dach überschreiten
    expect(wochenendEreignisse(luecke, VON, BIS, opt).offen).toEqual(["2026-11-14"]);
  });
  it("ein Wochenende ohne Plan, aber höchstens ist schon sicher gerissen: bleibt verletzt", () => {
    const luecke = { ...gut, "2026-11-21": "frei", "2026-11-22": "frei", "2026-11-28": "frei", "2026-11-29": "frei" }; delete luecke["2026-11-14"]; delete luecke["2026-11-15"];
    expect(rot(luecke).freiMax.status).toBe("verletzt"); // 3 frei sicher
  });
  it("unbekannte Wochenendart wirft", () => {
    expect(() => wochenendZaehlregel(zaehl("X", "mindestens", 1), "halb", { ...opt, tage: gut })).toThrow(/unbekannt/);
  });
});

describe("Testlauf", () => {
  const regel = R({ typ: "blockregel", bezeichnung: "WE einheitlich", parameter: { wochentage: [5, 6] } });
  const gutes = { tage: { "2026-03-07": "F", "2026-03-08": "F" }, von: MO, bis: "2026-03-08" };
  const schlechtes = { tage: { "2026-03-07": "F", "2026-03-08": "S" }, von: MO, bis: "2026-03-08" };
  const luecke = { tage: { "2026-03-07": "F" }, von: MO, bis: "2026-03-08" };

  it("zählt Ergebnisse und nennt die verletzten Fälle (24 Personen, 7 verletzt)", () => {
    const faelle = Array.from({ length: 24 }, (_, i) => ({ id: `p${String(i).padStart(2, "0")}`, kontext: i < 7 ? schlechtes : gutes }));
    const t = testlauf(regel, faelle);
    expect(t).toMatchObject({ anzahl: 24, verletzt: 7, erfuellt: 17, offen: 0, nicht_anwendbar: 0, gruen: false });
    expect(t.verletzte).toEqual(["p00", "p01", "p02", "p03", "p04", "p05", "p06"]);
  });
  it("grün nur bei lauter Erfüllung; offen ist nie grün", () => {
    expect(testlauf(regel, [{ id: "a", kontext: gutes }, { id: "b", kontext: gutes }]).gruen).toBe(true);
    const mitOffen = testlauf(regel, [{ id: "a", kontext: gutes }, { id: "b", kontext: luecke }]);
    expect(mitOffen.gruen).toBe(false);
    expect(mitOffen.offene).toEqual(["b"]);
    expect(testlauf(regel, []).gruen).toBe(false);
  });
  it("Reihenfolge der Eingabe ändert die Ausgabe nicht; Eingabe bleibt unverändert", () => {
    const f = [{ id: "z", kontext: gutes }, { id: "a", kontext: schlechtes }];
    const kopie = structuredClone(f);
    expect(testlauf(regel, f)).toEqual(testlauf(regel, [...f].reverse()));
    expect(f).toEqual(kopie);
  });
  it("ohne Fälle zu rechnen wirft nicht, ohne Liste schon", () => {
    expect(() => testlauf(regel, null)).toThrow(/Fälle/);
  });
});

describe("Dispatcher und Register", () => {
  it("alle acht Regelarten sind gerechnet und stimmen mit dem Register überein", () => {
    expect(REGELARTEN_ALLE).toHaveLength(8);
    for (const a of REGELARTEN_ALLE) expect(REGELARTEN[a], a).toBeTruthy();
    expect(Object.keys(REGELARTEN).filter((k) => k !== "bestandsregel").sort()).toEqual([...REGELARTEN_ALLE].sort());
  });
  it("pruefeRegel leitet die vier neuen Arten richtig weiter", () => {
    const k = { tage: { [MO]: "F" }, von: MO, bis: MO, werte: { a: 1, b: 1 } };
    expect(pruefeRegel(R({ typ: "wunschregel", parameter: { wunsch: "frei", wochentage: [0] } }), k).status).toBe("verletzt");
    expect(pruefeRegel(R({ typ: "verteilungsregel", parameter: { groesse: "x", maxAbweichung: 0 } }), k).status).toBe("erfuellt");
    expect(pruefeRegel(R({ typ: "blockregel", parameter: { wochentage: [5, 6] } }), k).status).toBe("nicht_anwendbar");
    expect(pruefeRegel(R({ typ: "musterregel", parameter: { art: "verbotenFolge", von: ["N"], dann: ["F"] } }), k).status).toBe("nicht_anwendbar");
  });
  it("Bestandsregeln und unbekannte Kennungen werfen weiter", () => {
    expect(() => pruefeRegel("AZ-FOLGE-01", {})).toThrow(/Bestandsregel/);
    expect(() => pruefeRegel("GIBT-ES-NICHT", {})).toThrow(/nicht im Register/);
  });
  it("die alten vier Arten rechnen über denselben Dispatcher unverändert", () => {
    expect(pruefeRegel(R({ typ: "grenzregel", parameter: { groesse: "h", hoechstens: 20 } }), { wert: 20 }).status).toBe("erfuellt");
  });
});

describe("Laufzeit: 31 Tage x 40 Personen", () => {
  it("rechnet alle vier Arten für alle Personen unter einer Sekunde", () => {
    const tage = tageAb("2026-03-01", 31);
    const klassen = ["F", "S", "N", "frei"];
    const personen = Array.from({ length: 40 }, (_, p) => {
      const t = {};
      tage.forEach((d, i) => { t[d] = klassen[(p + i * 3 + (i % 7 === 0 ? 1 : 0)) % 4]; });
      return t;
    });
    const muster = R({ parameter: { art: "hoechstensFolge", klassen: ["N"], max: 3, danachFrei: 2 } });
    const verbot = R({ parameter: { art: "verbotenFolge", von: ["N"], dann: ["F"] } });
    const block = R({ typ: "blockregel", parameter: { wochentage: [5, 6], gruppen: { F: "tag", S: "tag" } } });
    const wunsch = R({ typ: "wunschregel", parameter: { wunsch: "frei", wochentage: [1] } });
    const verteil = R({ typ: "verteilungsregel", parameter: { groesse: "Nächte", maxAbweichung: 3 } });
    const t0 = performance.now();
    const werte = {};
    personen.forEach((t, p) => {
      const k = { tage: t, von: "2026-03-01", bis: "2026-03-31" };
      musterregel(muster, k); musterregel(verbot, k); blockregel(block, k); wunschregel(wunsch, k);
      werte[`p${p}`] = Object.values(t).filter((c) => c === "N").length;
    });
    verteilungsregel(verteil, { werte });
    wochenendEreignisse(personen[0], "2026-03-01", "2026-03-31", { tagKlassen: ["F", "S"], nachtKlassen: ["N"] });
    expect(performance.now() - t0).toBeLessThan(1000);
  });
});
