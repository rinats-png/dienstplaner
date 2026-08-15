/* ==========================================================================
   STANDORTE UND IHRE KOSTENFOLGE

   Ein Standort mehr ist eine Vertragsänderung. Geprüft wird, dass die
   Rechnung dazu stimmt — und dass der Hinweis nicht nur „teurer" sagt,
   sondern die Zahl nennt, die auf der nächsten Rechnung steht.
   ========================================================================== */

import { describe, it, expect } from "vitest";
import { staffel, stufe, folgen, zustimmung, hinweistext, jeStandort, standortAm }
  from "../src/standorte.js";

describe("Mengenstaffel", () => {
  it("greift ab dem zweiten Standort", () => {
    expect(staffel(1).rabatt).toBe(0);
    expect(staffel(2).rabatt).toBeCloseTo(0.07);
    expect(staffel(4).rabatt).toBeCloseTo(0.12);
    expect(staffel(30).rabatt).toBeCloseTo(0.34);
  });

  it("null oder unsinnige Zahlen gelten als ein Standort", () => {
    expect(stufe(0, 89).anzahl).toBe(1);
    expect(stufe(-3, 89).anzahl).toBe(1);
    expect(stufe(NaN, 89).anzahl).toBe(1);
  });
});

describe("Was ein Standort mehr kostet", () => {
  it("ein Standort, voller Preis", () => {
    expect(stufe(1, 89).netto).toBe(89);
  });

  it("zwei Standorte, sieben Prozent auf jeden", () => {
    const s = stufe(2, 89);
    expect(s.einzel).toBe(82.77);
    expect(s.netto).toBe(165.54);
  });

  it("der Sprung von eins auf zwei", () => {
    const f = folgen(1, 2, 89);
    expect(f.neueStaffel).toBe(true);
    expect(f.mehr).toBe(76.54);
    /* Weniger als der volle zweite Standort — genau das soll der Hinweis
       sagen, sonst wirkt die Zahl falsch. */
    expect(f.mehr).toBeLessThan(89);
  });

  it("der Sprung innerhalb einer Stufe", () => {
    const f = folgen(3, 4, 89);
    expect(f.neueStaffel).toBe(false);
    expect(f.mehr).toBe(78.32);
  });

  it("beim Sprung in die nächste Stufe sinkt der Einzelpreis", () => {
    const f = folgen(5, 6, 89);
    expect(f.neueStaffel).toBe(true);
    expect(f.nachher.einzel).toBeLessThan(f.vorher.einzel);
    expect(f.mehr).toBeGreaterThan(0);   // die Summe steigt trotzdem
  });
});

describe("Wer zustimmen muss", () => {
  it("der Betreiber niemandem", () => {
    expect(zustimmung("betreiber")).toBe("frei");
  });
  it("die Leitung sich selbst", () => {
    expect(zustimmung("leitung")).toBe("bestaetigen");
  });
  it("die Planung der Leitung", () => {
    expect(zustimmung("planer")).toBe("anfragen");
  });
  it("alle übrigen dürfen nicht", () => {
    expect(zustimmung("subplaner")).toBe("nein");
    expect(zustimmung("mitarbeiter")).toBe("nein");
  });
});

describe("Der Hinweistext", () => {
  it("nennt beide Zahlen, wenn die Staffel greift", () => {
    const t = hinweistext(folgen(1, 2, 89));
    expect(t).toMatch(/1 auf 2 Standorte/);
    expect(t).toMatch(/Mengenstaffel/);
    expect(t).toMatch(/82\.77/);
    expect(t).toMatch(/165\.54/);
  });

  it("spricht die Staffel nicht an, wenn sie nicht greift", () => {
    const t = hinweistext(folgen(3, 4, 89));
    expect(t).not.toMatch(/Mengenstaffel/);
    expect(t).toMatch(/78\.32/);
  });
});

describe("Aufstellung je Standort", () => {
  const m = {
    name: "Nordwacht",
    standorte: [{ id: "s1", name: "Frankfurt" }, { id: "s2", name: "Hannover" }],
    einheiten: [{ id: "e1", standortId: "s1" }, { id: "e2", standortId: "s2" }],
    personen: [
      { id: "p1", rolle: "leitung", status: "aktiv", zugehoerigkeit: [{ ab: "2026-01-01", einheitId: "e1" }] },
      { id: "p2", rolle: "planer", status: "aktiv", zugehoerigkeit: [{ ab: "2026-01-01", einheitId: "e1" }] },
      { id: "p3", rolle: "mitarbeiter", status: "aktiv", zugehoerigkeit: [{ ab: "2026-01-01", einheitId: "e2" }] },
      { id: "p4", rolle: "mitarbeiter", status: "aktiv", austritt: "2026-03-01",
        zugehoerigkeit: [{ ab: "2026-01-01", einheitId: "e2" }] },
    ],
  };

  it("zählt Personen und Rollen getrennt je Standort", () => {
    const a = jeStandort(m, "2026-08-15");
    expect(a).toHaveLength(2);
    expect(a[0].standort.name).toBe("Frankfurt");
    expect(a[0].personen).toBe(2);
    expect(a[0].rollen.planer).toBe(1);
    expect(a[1].personen).toBe(1);      // p4 ist ausgetreten
  });

  it("ein Wechsel der Einheit wechselt den Standort", () => {
    const gewandert = { ...m, personen: [{ id: "p9", rolle: "mitarbeiter", status: "aktiv",
      zugehoerigkeit: [{ ab: "2026-01-01", einheitId: "e1" }, { ab: "2026-06-01", einheitId: "e2" }] }] };
    expect(standortAm(gewandert, gewandert.personen[0], "2026-03-01")).toBe("s1");
    expect(standortAm(gewandert, gewandert.personen[0], "2026-08-15")).toBe("s2");
  });

  it("ohne hinterlegte Standorte gibt es einen", () => {
    const ohne = { name: "Klein", einheiten: [{ id: "e1" }], personen: [] };
    const a = jeStandort(ohne, "2026-08-15");
    expect(a).toHaveLength(1);
    expect(a[0].standort.name).toBe("Klein");
  });
});
