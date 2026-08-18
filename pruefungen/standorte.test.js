/* ==========================================================================
   STANDORTE — Zuordnung und Zuschlag

   Ein Standort kostet nichts mehr, solange er zum Kontingent seiner Stufe
   gehört. Geprüft wird, dass der Zuschlag korrekt gestaffelt ist, dass die
   größten Standorte automatisch die kostenlosen sind, und dass die
   Zuordnung von Person zu Standort weiterhin stimmt.
   ========================================================================== */

import { describe, it, expect } from "vitest";
import { STANDORT_BAENDER, standortZuschlag, standortzuschlaege, jeStandort, standortAm }
  from "../src/standorte.js";

describe("Der Zuschlag für einen einzelnen Standort", () => {
  it("bleibt unter der Schwelle kostenlos", () => {
    expect(standortZuschlag(0)).toBe(0);
    expect(standortZuschlag(14)).toBe(0);
  });

  it("greift ab fünfzehn Personen", () => {
    expect(standortZuschlag(15)).toBeGreaterThan(0);
    expect(standortZuschlag(40)).toBe(standortZuschlag(15));
  });

  it("steigt mit der Größe, in Stufen", () => {
    expect(standortZuschlag(80)).toBeGreaterThan(standortZuschlag(40));
    expect(standortZuschlag(150)).toBeGreaterThan(standortZuschlag(80));
    expect(standortZuschlag(500)).toBeGreaterThan(standortZuschlag(150));
  });

  it("negative oder unsinnige Werte gelten als null Personen", () => {
    expect(standortZuschlag(-5)).toBe(0);
    expect(standortZuschlag(NaN)).toBe(0);
  });

  it("die Bänder sind lückenlos und aufsteigend sortiert", () => {
    for (let i = 1; i < STANDORT_BAENDER.length; i++)
      expect(STANDORT_BAENDER[i].bis).toBeGreaterThan(STANDORT_BAENDER[i - 1].bis);
  });
});

describe("Zuschläge über mehrere Standorte", () => {
  it("ohne Standorte gibt es nichts zu zahlen", () => {
    const z = standortzuschlaege([], 1);
    expect(z.posten).toEqual([]);
    expect(z.summe).toBe(0);
  });

  it("innerhalb des Kontingents ist jeder Standort kostenlos, egal wie groß", () => {
    const z = standortzuschlaege([400], 1);
    expect(z.posten).toEqual([]);
    expect(z.summe).toBe(0);
  });

  it("die größten Standorte zählen automatisch zum Kontingent", () => {
    /* Drei Standorte, ein Platz im Kontingent: Der größte (70) bleibt
       kostenlos, die beiden kleineren lösen einen Zuschlag aus. */
    const z = standortzuschlaege([25, 70, 10], 1);
    expect(z.posten.map((p) => p.personen).sort((a, b) => a - b)).toEqual([10, 25]);
    expect(z.summe).toBe(standortZuschlag(25) + standortZuschlag(10));
  });

  it("ein Betrieb, der an einem Ort wächst, zahlt dafür nie mehr", () => {
    /* Der Kern der Preisumstellung: Personenzahl am einzigen Standort
       bewegt den Preis nicht, solange er im Kontingent bleibt. */
    for (const n of [10, 25, 45, 90, 200, 400])
      expect(standortzuschlaege([n], 1).summe).toBe(0);
  });

  it("ein zweiter, großer Standort löst einen Zuschlag aus", () => {
    const einer = standortzuschlaege([60], 1).summe;
    const zwei = standortzuschlaege([60, 45], 1).summe;
    expect(einer).toBe(0);
    expect(zwei).toBeGreaterThan(0);
    expect(zwei).toBe(standortZuschlag(45));
  });

  it("ein zweiter, kleiner Standort bleibt trotzdem kostenlos", () => {
    expect(standortzuschlaege([60, 8], 1).summe).toBe(0);
  });
});

describe("Zuordnung", () => {
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
