/* ==========================================================================
   PREISGESTALTUNG

   Die Tarifrechnung gilt für den Regelfall. Alles, worüber jemand
   telefoniert hat, steht hier — und weil es um Geld geht, ist die
   Reihenfolge der Regeln keine Geschmacksfrage.

   Mitgeprüft wird `rabattGrund`. Das Feld stand seit jeher im Datensatz und
   war in der Betreiberkonsole als Prozentfeld bedienbar; gelesen hat es
   niemand. Wer es auf zwanzig Prozent stellte, bekam dieselbe Rechnung wie
   vorher.
   ========================================================================== */

import { describe, it, expect } from "vitest";
import { gestaltung, istFrei, aussetzungFuer, monateZwischen, monatspreis,
  rechnungFaellig, lagetext } from "../src/preisgestaltung.js";

const HEUTE = "2026-08-15";

describe("Auffüllen und Aufräumen", () => {
  it("ein Betrieb ohne Vereinbarung ist leer, nicht kaputt", () => {
    const g = gestaltung({});
    expect(g.sonderpreis).toBe(null);
    expect(g.freiBis).toBe(null);
    expect(g.aussetzungen).toEqual([]);
  });

  it("Zahlen als Zeichenkette werden gerechnet", () => {
    const g = gestaltung({ preisgestaltung: { sonderpreis: { betrag: "420.5" } } });
    expect(g.sonderpreis.betrag).toBe(420.5);
  });

  it("ein Sonderpreis von null ist eine Aussage, kein Fehler", () => {
    const g = gestaltung({ preisgestaltung: { sonderpreis: { betrag: 0 } } });
    expect(g.sonderpreis).not.toBe(null);
    expect(g.sonderpreis.betrag).toBe(0);
  });

  it("ohne Bezeichnung gibt es eine", () => {
    const g = gestaltung({ preisgestaltung: { sonderpreis: { betrag: 200 } } });
    expect(g.sonderpreis.bezeichnung).toBe("Individuelle Vereinbarung");
  });

  it("halbe Aussetzungen fliegen raus, einseitige werden geschlossen", () => {
    const g = gestaltung({ preisgestaltung: { aussetzungen: [
      { von: "2026-11", bis: "2027-01" },
      { von: "2026-05" },                  // ohne bis → ein Monat
      { von: "quatsch", bis: "2026-12" },  // ungültig
      { von: "2027-05", bis: "2027-01" },  // rückwärts
    ] } });
    expect(g.aussetzungen).toHaveLength(2);
    expect(g.aussetzungen[1]).toMatchObject({ von: "2026-05", bis: "2026-05" });
  });

  it("ein unbrauchbares Datum gilt als keines", () => {
    expect(gestaltung({ preisgestaltung: { freiBis: "irgendwann" } }).freiBis).toBe(null);
    expect(gestaltung({ preisgestaltung: { freiBis: "2026-09-30" } }).freiBis).toBe("2026-09-30");
  });
});

describe("Kostenlose Zeit", () => {
  const m = { preisgestaltung: { freiBis: "2026-09-30", freiGrund: "Einführung" } };

  it("gilt bis einschließlich zum genannten Tag", () => {
    expect(istFrei(m, "2026-09-30")).toBe(true);
    expect(istFrei(m, "2026-10-01")).toBe(false);
  });

  it("ohne Datum gilt sie nie", () => {
    expect(istFrei({}, HEUTE)).toBe(false);
  });
});

describe("Ausgesetzte Monate", () => {
  const m = { preisgestaltung: { aussetzungen: [
    { von: "2026-11", bis: "2027-01", grund: "Umbau" }] } };

  it("beide Enden zählen mit", () => {
    expect(aussetzungFuer(m, "2026-11")).toBeTruthy();
    expect(aussetzungFuer(m, "2026-12")).toBeTruthy();
    expect(aussetzungFuer(m, "2027-01")).toBeTruthy();
  });

  it("davor und danach nicht", () => {
    expect(aussetzungFuer(m, "2026-10")).toBe(null);
    expect(aussetzungFuer(m, "2027-02")).toBe(null);
  });

  it("ein Tagesdatum wird auf den Monat gekürzt", () => {
    expect(aussetzungFuer(m, "2026-12-24")).toBeTruthy();
  });

  it("die Länge zählt beide Enden", () => {
    expect(monateZwischen("2026-11", "2027-01")).toBe(3);
    expect(monateZwischen("2026-05", "2026-05")).toBe(1);
    expect(monateZwischen("2026-01", "2026-12")).toBe(12);
  });
});

describe("Der Monatspreis — die Reihenfolge zählt", () => {
  it("ohne Vereinbarung gilt der Tarif", () => {
    const p = monatspreis({}, 178, "2026-08", HEUTE);
    expect(p.netto).toBe(178);
    expect(p.herkunft).toBe("tarif");
    expect(p.text).toBe("Nach Tarif");
  });

  it("der Sonderpreis ersetzt die Tarifrechnung", () => {
    const m = { preisgestaltung: { sonderpreis: { betrag: 420, bezeichnung: "Rahmenvertrag" } } };
    const p = monatspreis(m, 1780, "2026-08", HEUTE);
    expect(p.netto).toBe(420);
    expect(p.herkunft).toBe("sonderpreis");
    expect(p.tarifwert).toBe(1780);
    /* Negativ heißt günstiger — die übliche Leserichtung bei einem Nachlass. */
    expect(p.abweichung).toBe(-1360);
  });

  it("der Rabatt wirkt auf das Ergebnis — und wirkt überhaupt", () => {
    const p = monatspreis({ rabattGrund: 0.2 }, 200, "2026-08", HEUTE);
    expect(p.netto).toBe(160);
    expect(p.rabatt).toBe(0.2);
  });

  it("Rabatt auch auf den Sonderpreis", () => {
    const m = { rabattGrund: 0.1, preisgestaltung: { sonderpreis: { betrag: 500 } } };
    expect(monatspreis(m, 999, "2026-08", HEUTE).netto).toBe(450);
  });

  it("ein Rabatt über hundert Prozent wird gedeckelt", () => {
    /* Sonst entstünde eine Gutschrift, die niemand beabsichtigt hat. */
    expect(monatspreis({ rabattGrund: 3 }, 200, "2026-08", HEUTE).netto).toBe(0);
    expect(monatspreis({ rabattGrund: -1 }, 200, "2026-08", HEUTE).netto).toBe(200);
  });

  it("die kostenlose Zeit setzt alles auf null", () => {
    const m = { rabattGrund: 0.2, preisgestaltung: {
      sonderpreis: { betrag: 500 }, freiBis: "2026-09-30" } };
    const p = monatspreis(m, 999, "2026-08", HEUTE);
    expect(p.netto).toBe(0);
    expect(p.frei).toBe(true);
    expect(p.text).toMatch(/Kostenlos bis 2026-09-30/);
  });

  it("und danach gilt wieder die Vereinbarung", () => {
    const m = { preisgestaltung: { sonderpreis: { betrag: 500 }, freiBis: "2026-09-30" } };
    expect(monatspreis(m, 999, "2026-10", HEUTE).netto).toBe(500);
  });

  it("für die kostenlose Zeit zählt der Monatsanfang", () => {
    /* Wer bis zum 15. frei hat, hat den Monat frei. Ein geschenkter Monat
       wird nicht anteilig zurückgefordert. */
    const m = { preisgestaltung: { freiBis: "2026-09-15" } };
    expect(monatspreis(m, 100, "2026-09", HEUTE).netto).toBe(0);
    expect(monatspreis(m, 100, "2026-10", HEUTE).netto).toBe(100);
  });

  it("die Aussetzung setzt ebenfalls auf null", () => {
    const m = { preisgestaltung: { aussetzungen: [
      { von: "2026-11", bis: "2026-12", grund: "Umbau" }] } };
    const p = monatspreis(m, 300, "2026-11", HEUTE);
    expect(p.netto).toBe(0);
    expect(p.ausgesetzt).toBeTruthy();
    expect(p.text).toMatch(/ausgesetzt — Umbau/);
    expect(monatspreis(m, 300, "2027-01", HEUTE).netto).toBe(300);
  });

  it("die Aussetzung nennt sich vor der kostenlosen Zeit", () => {
    /* Beides zugleich ergibt denselben Betrag; der Text soll den
       vorübergehenden Zustand nennen, nicht den dauerhaften. */
    const m = { preisgestaltung: { freiBis: "2027-12-31",
      aussetzungen: [{ von: "2026-11", bis: "2026-11", grund: "Pause" }] } };
    expect(monatspreis(m, 300, "2026-11", HEUTE).text).toMatch(/ausgesetzt/);
  });
});

describe("Ob überhaupt eine Rechnung entsteht", () => {
  it("im Regelfall ja", () => {
    expect(rechnungFaellig({}, "2026-08")).toEqual({ faellig: true, grund: null });
  });

  it("im ausgesetzten Monat nicht", () => {
    const m = { preisgestaltung: { aussetzungen: [{ von: "2026-11", bis: "2026-11" }] } };
    expect(rechnungFaellig(m, "2026-11").faellig).toBe(false);
    expect(rechnungFaellig(m, "2026-11").grund).toBe("ausgesetzt");
  });

  it("in der kostenlosen Zeit nicht", () => {
    const m = { preisgestaltung: { freiBis: "2026-09-30" } };
    expect(rechnungFaellig(m, "2026-09").grund).toBe("kostenlos");
    expect(rechnungFaellig(m, "2026-10").faellig).toBe(true);
  });

  it("ein Sonderpreis allein hebt die Rechnung nicht auf", () => {
    const m = { preisgestaltung: { sonderpreis: { betrag: 1 } } };
    expect(rechnungFaellig(m, "2026-08").faellig).toBe(true);
  });
});

describe("Der Satz für die Konsole", () => {
  it("ohne Vereinbarung sagt er das", () => {
    expect(lagetext({}, HEUTE)).toMatch(/Nach Tarif/);
  });

  it("nennt Sonderpreis und laufende Freizeit", () => {
    const m = { preisgestaltung: { sonderpreis: { betrag: 420, bezeichnung: "Rahmen" },
      freiBis: "2026-09-30" } };
    const t = lagetext(m, HEUTE);
    expect(t).toMatch(/420\.00/);
    expect(t).toMatch(/Rahmen/);
    expect(t).toMatch(/kostenlos noch bis/);
  });

  it("unterscheidet laufende von abgelaufener Freizeit", () => {
    const m = { preisgestaltung: { freiBis: "2026-01-31" } };
    expect(lagetext(m, HEUTE)).toMatch(/endete am/);
  });

  it("vergangene Aussetzungen erwähnt er nicht mehr", () => {
    const m = { preisgestaltung: { aussetzungen: [{ von: "2025-01", bis: "2025-03" }] } };
    expect(lagetext(m, HEUTE)).toMatch(/Nach Tarif/);
  });
});
