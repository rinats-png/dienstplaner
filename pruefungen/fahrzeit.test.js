/* ==========================================================================
   LENK- UND RUHEZEITEN

   Die Fallstricke liegen in den Ausnahmen: zweimal zehn Stunden, dreimal
   neun Stunden Ruhe, und die Unterbrechung, die geteilt werden darf — aber
   nur in dieser Reihenfolge.
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { GRENZEN, pruefeTag, pruefeWoche, wochentage, luecken } from "../src/fahrzeit.js";

const tag = (datum, lenkzeit, mehr = {}) => ({ datum, lenkzeit, ...mehr });
const hart = (r) => r.befunde.filter((b) => b.schwere === "danger");

describe("Ein Tag", () => {
  it("ohne erfasste Lenkzeit gibt es kein Urteil", () => {
    for (const wert of [null, undefined, "", NaN]) {
      const r = pruefeTag(tag("2026-09-09", wert));
      expect(r.urteil, String(wert)).toBe("grau");
      expect(r.befunde[0].text).toContain("Tachograf");
    }
  });

  it("neun Stunden sind unauffällig", () => {
    const r = pruefeTag(tag("2026-09-09", 9 * 60, { unterbrechungen: [45] }));
    expect(r.urteil).toBe("gruen");
    expect(hart(r)).toEqual([]);
  });

  it("zehn Stunden sind eine Verlängerung, keine Verletzung", () => {
    const r = pruefeTag(tag("2026-09-09", 10 * 60, { unterbrechungen: [45] }), 0);
    expect(r.urteil).toBe("gruen");
    expect(r.verlaengerung).toBe(true);
    expect(r.befunde.some((b) => b.schwere === "info")).toBe(true);
  });

  it("die dritte Verlängerung in der Woche ist eine Verletzung", () => {
    const r = pruefeTag(tag("2026-09-09", 10 * 60, { unterbrechungen: [45] }), 2);
    expect(r.urteil).toBe("rot");
    expect(hart(r)[0].regel).toContain("Art. 6 Abs. 1");
  });

  it("über zehn Stunden ist immer eine Verletzung", () => {
    const r = pruefeTag(tag("2026-09-09", 10 * 60 + 1, { unterbrechungen: [45] }), 0);
    expect(r.urteil).toBe("rot");
  });

  it("nach viereinhalb Stunden braucht es eine Unterbrechung", () => {
    const ohne = pruefeTag(tag("2026-09-09", 6 * 60, { unterbrechungen: [] }));
    expect(ohne.urteil).toBe("rot");
    expect(hart(ohne)[0].regel).toContain("Art. 7");
  });

  it("45 Minuten am Stück genügen", () => {
    expect(pruefeTag(tag("2026-09-09", 8 * 60, { unterbrechungen: [45] })).urteil).toBe("gruen");
  });

  it("15 und dann 30 Minuten genügen ebenfalls", () => {
    expect(pruefeTag(tag("2026-09-09", 8 * 60, { unterbrechungen: [15, 30] })).urteil).toBe("gruen");
  });

  it("30 und dann 15 genügen nicht — die Reihenfolge steht im Gesetz", () => {
    const r = pruefeTag(tag("2026-09-09", 8 * 60, { unterbrechungen: [30, 15] }));
    expect(r.urteil).toBe("rot");
  });

  it("drei kurze Pausen genügen nicht, auch wenn sie zusammen reichen", () => {
    const r = pruefeTag(tag("2026-09-09", 8 * 60, { unterbrechungen: [15, 15, 15] }));
    expect(r.urteil).toBe("rot");
  });

  it("unter viereinhalb Stunden braucht es keine", () => {
    expect(pruefeTag(tag("2026-09-09", 4 * 60, { unterbrechungen: [] })).urteil).toBe("gruen");
  });

  it("elf Stunden Ruhe davor sind unauffällig", () => {
    const r = pruefeTag(tag("2026-09-09", 8 * 60, { unterbrechungen: [45], ruhezeitDavor: 11 * 60 }));
    expect(r.urteil).toBe("gruen");
    expect(r.verkuerzung).toBe(false);
  });

  it("neun Stunden Ruhe sind eine zulässige Verkürzung", () => {
    const r = pruefeTag(tag("2026-09-09", 8 * 60, { unterbrechungen: [45], ruhezeitDavor: 9 * 60 }), 0, 0);
    expect(r.urteil).toBe("gruen");
    expect(r.verkuerzung).toBe(true);
  });

  it("die vierte Verkürzung ist eine Verletzung", () => {
    const r = pruefeTag(tag("2026-09-09", 8 * 60, { unterbrechungen: [45], ruhezeitDavor: 9 * 60 }), 0, 3);
    expect(r.urteil).toBe("rot");
    expect(hart(r)[0].regel).toContain("Art. 8 Abs. 4");
  });

  it("unter neun Stunden Ruhe ist nie zulässig", () => {
    const r = pruefeTag(tag("2026-09-09", 8 * 60, { unterbrechungen: [45], ruhezeitDavor: 8 * 60 }));
    expect(r.urteil).toBe("rot");
    expect(hart(r)[0].regel).toContain("Art. 8 Abs. 2");
  });
});

describe("Eine Woche", () => {
  const woche = (werte, mehr = {}) => wochentage("2026-09-09").slice(0, werte.length)
    .map((d, i) => tag(d, werte[i], { unterbrechungen: [45], ...mehr }));

  it("verbraucht die Verlängerungen der Reihe nach", () => {
    const r = pruefeWoche(woche([600, 600, 600, 480, 480]));
    expect(r.verlaengerungen).toBe(3);
    expect(r.tage[2].urteil).toBe("rot");
    expect(r.tage[0].urteil).toBe("gruen");
  });

  it("56 Stunden sind die Wochengrenze", () => {
    const knapp = pruefeWoche(woche([540, 540, 540, 540, 540, 540]));
    expect(knapp.summe).toBe(54 * 60);
    expect(knapp.befunde.filter((b) => b.schwere === "danger")).toEqual([]);
    const drueber = pruefeWoche(woche([540, 540, 540, 540, 540, 540, 300]));
    expect(drueber.urteil).toBe("rot");
    expect(drueber.befunde.some((b) => b.regel.includes("Art. 6 Abs. 2"))).toBe(true);
  });

  it("die Doppelwoche wird mitgerechnet", () => {
    const r = pruefeWoche(woche([540, 540, 540, 540, 480]), 50 * 60);
    expect(r.befunde.some((b) => b.regel.includes("Art. 6 Abs. 3"))).toBe(true);
  });

  it("ohne Vorwoche wird die Doppelwoche nicht behauptet", () => {
    const r = pruefeWoche(woche([540, 540, 540, 540, 480]), null);
    expect(r.befunde.some((b) => b.regel.includes("Art. 6 Abs. 3"))).toBe(false);
  });

  it("eine Woche ohne Erfassung ist nicht bewertbar", () => {
    const r = pruefeWoche(woche([null, null, null]));
    expect(r.urteil).toBe("grau");
    expect(r.fehlend).toBe(3);
  });

  it("teilweise erfasst heißt: bewertet, was da ist, und gezählt, was fehlt", () => {
    const r = pruefeWoche(woche([540, null, 480]));
    expect(r.erfasst).toBe(2);
    expect(r.fehlend).toBe(1);
    expect(r.summe).toBe(17 * 60);
  });
});

describe("Hilfsgrößen", () => {
  it("wochentage gibt Montag bis Sonntag", () => {
    const w = wochentage("2026-09-09");
    expect(w.length).toBe(7);
    expect(w[0]).toBe("2026-09-07");
    expect(w[6]).toBe("2026-09-13");
  });

  it("luecken nennt die Tage ohne Erfassung", () => {
    expect(luecken([tag("2026-09-09", 60), tag("2026-09-10", null)])).toEqual(["2026-09-10"]);
  });

  it("die Grenzen stehen als Zahlen bereit", () => {
    expect(GRENZEN.tagLenkzeit).toBe(540);
    expect(GRENZEN.wocheLenkzeit).toBe(3360);
    expect(GRENZEN.doppelwocheLenkzeit).toBe(5400);
  });
});
