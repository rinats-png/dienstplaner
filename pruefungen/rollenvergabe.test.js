/* ==========================================================================
   ROLLENVERGABE

   Geprüft wird vor allem die Richtung, in die es schiefgehen kann: dass
   niemand sich oder anderen eine Rolle auf der eigenen Höhe oder darüber
   verschafft. Eine Auswahlliste, die nur erlaubte Rollen anzeigt, ist
   Bedienkomfort; hier steht der Schutz.
   ========================================================================== */

import { describe, it, expect } from "vitest";
import { vergebbareRollen, darfVergeben, pruefeRollenwechsel, rollennamen, nameGueltig }
  from "../netlify/lib/rollenvergabe.mjs";

describe("Wer darf was vergeben", () => {
  it("die Leitung alles unter sich", () => {
    const r = vergebbareRollen("leitung");
    expect(r).toContain("planer");
    expect(r).toContain("subplaner");
    expect(r).toContain("mitarbeiter");
    expect(r).toContain("betriebsrat");
    expect(r).not.toContain("leitung");
  });

  it("die Planung nur darunter", () => {
    const r = vergebbareRollen("planer");
    expect(r).toEqual(expect.arrayContaining(["subplaner", "mitarbeiter", "betriebsrat"]));
    expect(r).not.toContain("planer");
    expect(r).not.toContain("leitung");
  });

  it("die Schichtverantwortung nur Beschäftigte", () => {
    const r = vergebbareRollen("subplaner");
    expect(r).toEqual(expect.arrayContaining(["mitarbeiter", "betriebsrat"]));
    expect(r).not.toContain("subplaner");
    expect(r).not.toContain("planer");
  });

  it("Beschäftigte gar nichts", () => {
    expect(vergebbareRollen("mitarbeiter")).toEqual([]);
    expect(vergebbareRollen("betriebsrat")).toEqual([]);
    expect(vergebbareRollen("unbekannt")).toEqual([]);
  });

  it("der Betreiber setzt die erste Leitung", () => {
    expect(vergebbareRollen("betreiber")).toContain("leitung");
  });
});

describe("Der einzelne Wechsel", () => {
  it("Leitung macht jemanden zur Planung", () => {
    expect(darfVergeben("leitung", "planer", "mitarbeiter").ok).toBe(true);
  });

  it("Planung macht niemanden zur Planung", () => {
    const u = darfVergeben("planer", "planer", "mitarbeiter");
    expect(u.ok).toBe(false);
    expect(u.grund).toMatch(/unterhalb/);
  });

  it("Planung macht niemanden zur Leitung", () => {
    expect(darfVergeben("planer", "leitung", "mitarbeiter").ok).toBe(false);
  });

  it("und nimmt der Leitung ihre Rolle nicht weg", () => {
    /* Der eigentliche Angriff: nicht sich selbst hochsetzen, sondern die
       Leitung herabsetzen und den Betrieb von unten übernehmen. */
    const u = darfVergeben("planer", "mitarbeiter", "leitung");
    expect(u.ok).toBe(false);
    expect(u.grund).toMatch(/leitung/);
  });

  it("Schichtverantwortung stellt keine zweite auf", () => {
    expect(darfVergeben("subplaner", "subplaner", "mitarbeiter").ok).toBe(false);
    expect(darfVergeben("subplaner", "mitarbeiter", "mitarbeiter").ok).toBe(true);
  });
});

describe("Der ganze Betrieb auf einmal", () => {
  const alt = [
    { id: "p1", rolle: "leitung" },
    { id: "p2", rolle: "planer" },
    { id: "p3", rolle: "mitarbeiter" },
  ];

  it("unveränderte Rollen stören nicht", () => {
    /* Eine Planung speichert den Betrieb. Die Leitung steht darin, mit
       ihrer Rolle. Das ist kein Wechsel und darf nichts blockieren. */
    expect(pruefeRollenwechsel(alt, alt, "planer").ok).toBe(true);
  });

  it("eine erlaubte Beförderung geht durch", () => {
    const neu = alt.map((p) => (p.id === "p3" ? { ...p, rolle: "subplaner" } : p));
    expect(pruefeRollenwechsel(alt, neu, "planer").ok).toBe(true);
  });

  it("eine neue Person mit zu hoher Rolle nicht", () => {
    const neu = [...alt, { id: "p4", rolle: "planer" }];
    const u = pruefeRollenwechsel(alt, neu, "planer");
    expect(u.ok).toBe(false);
    expect(u.person).toBe("p4");
  });

  it("eine neue Person mit erlaubter Rolle schon", () => {
    const neu = [...alt, { id: "p4", rolle: "mitarbeiter" }];
    expect(pruefeRollenwechsel(alt, neu, "subplaner").ok).toBe(true);
  });

  it("die Leitung löschen geht nicht", () => {
    const neu = alt.filter((p) => p.id !== "p1");
    const u = pruefeRollenwechsel(alt, neu, "planer");
    expect(u.ok).toBe(false);
    expect(u.person).toBe("p1");
  });

  it("eine Beschäftigte löschen schon", () => {
    const neu = alt.filter((p) => p.id !== "p3");
    expect(pruefeRollenwechsel(alt, neu, "planer").ok).toBe(true);
  });

  it("die Leitung darf die Planung umsetzen", () => {
    const neu = alt.map((p) => (p.id === "p2" ? { ...p, rolle: "mitarbeiter" } : p));
    expect(pruefeRollenwechsel(alt, neu, "leitung").ok).toBe(true);
  });

  it("aber keine zweite Leitung ernennen", () => {
    const neu = alt.map((p) => (p.id === "p2" ? { ...p, rolle: "leitung" } : p));
    expect(pruefeRollenwechsel(alt, neu, "leitung").ok).toBe(false);
  });

  it("leere Listen sind kein Fehler", () => {
    expect(pruefeRollenwechsel(null, null, "leitung").ok).toBe(true);
    expect(pruefeRollenwechsel([], [], "mitarbeiter").ok).toBe(true);
  });
});

describe("Eigene Rollenbezeichnungen", () => {
  const VORGABE = { leitung: "Organisationsleitung", planer: "Planung",
    subplaner: "Schichtverantwortung", mitarbeiter: "Beschäftigte" };

  it("ohne eigene Namen gilt die Vorgabe", () => {
    expect(rollennamen({}, VORGABE)).toEqual(VORGABE);
  });

  it("eigene Namen ersetzen nur die Anzeige", () => {
    const n = rollennamen({ rollennamen: { subplaner: "Wohnbereichsleitung" } }, VORGABE);
    expect(n.subplaner).toBe("Wohnbereichsleitung");
    expect(n.planer).toBe("Planung");
  });

  it("ein leerer Name setzt zurück", () => {
    const n = rollennamen({ rollennamen: { subplaner: "   " } }, VORGABE);
    expect(n.subplaner).toBe("Schichtverantwortung");
  });

  it("unbekannte Kennungen kommen nicht durch", () => {
    const n = rollennamen({ rollennamen: { erfunden: "Chef" } }, VORGABE);
    expect(n.erfunden).toBeUndefined();
    expect(Object.keys(n)).toEqual(Object.keys(VORGABE));
  });

  it("Namen werden geprüft", () => {
    expect(nameGueltig("Stationsleitung")).toEqual({ ok: true, wert: "Stationsleitung" });
    expect(nameGueltig("")).toEqual({ ok: true, wert: "" });
    expect(nameGueltig("X").ok).toBe(false);
    expect(nameGueltig("x".repeat(41)).ok).toBe(false);
  });
});
