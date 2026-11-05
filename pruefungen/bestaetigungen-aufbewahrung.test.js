/* ==========================================================================
   BESTÄTIGUNGSPROTOKOLL: AUFBEWAHRUNG (A32, PR #16-Prüfung)

   § 16 Abs. 2 ArbZG: Aufzeichnungen zwei Jahre aufbewahren. Das Protokoll
   hatte keine Löschfrist (Speicherbegrenzung, Art. 5 DSGVO) und war auf
   5000 Einträge begrenzt, danach wurden neue Bestätigungen abgewiesen.

   Jetzt nimmt der Aufbewahrungslauf das Protokoll mit auf: dieselbe Frist wie
   Plandaten (mindestens 24 Monate). Der Modus bleibt „vorschau“ — gelöscht
   wird erst nach ausdrücklicher Freigabe (docs/AUFBEWAHRUNG-FREIGABE-
   VORBEREITUNG.md). Außerdem: Ein veralteter Client darf Gelöschtes nicht
   neu datiert wieder einspielen, und sein Speichern wird nicht blockiert.
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { vorschau, raeumen, berichtstext, bestaetigungTag, datenschutzModus } from "../server/lib/aufbewahrung.mjs";
import { einheitZusammen } from "../server/lib/rechte.mjs";

const HEUTE = "2026-11-05";
const alt = { id: "b-alt", personId: "p1", datum: "2023-06-01", zeit: "2023-06-01T08:00:00.000Z", aktion: "einsprung" };
const grenznah = { id: "b-grenze", personId: "p1", datum: "2024-11-05", zeit: "2024-11-05T08:00:00.000Z" };   // genau 24 Monate
const neu = { id: "b-neu", personId: "p1", datum: "2026-10-30", zeit: "2026-10-30T08:00:00.000Z" };
const ohneTag = { id: "b-ohne", personId: "p1" };
const mandant = (liste) => ({ id: "m1", personen: [], bestaetigungen: liste });

describe("bestaetigungTag", () => {
  it("nimmt den spätesten Tag, den der Eintrag trägt", () => {
    expect(bestaetigungTag({ zeit: "2024-01-01T10:00:00Z", datum: "2025-03-04", bis: "2025-03-10" })).toBe("2025-03-10");
  });
  it("ohne erkennbaren Tag: null (der Eintrag bleibt liegen)", () => {
    expect(bestaetigungTag(ohneTag)).toBeNull();
    expect(bestaetigungTag(null)).toBeNull();
    expect(bestaetigungTag({ zeit: "kaputt" })).toBeNull();
  });
});

describe("Vorschau und Räumung", () => {
  it("die Vorschau zählt nur Einträge, die älter als die Frist sind", () => {
    const v = vorschau(mandant([alt, grenznah, neu, ohneTag]), HEUTE);
    expect(v.bestaetigungen).toBe(1);
    expect(v.gesamt).toBeGreaterThanOrEqual(1);
  });
  it("die Grenze selbst ist noch in der Frist", () => {
    expect(vorschau(mandant([grenznah]), HEUTE).bestaetigungen).toBe(0);
  });
  it("die Räumung entfernt nur fällige Einträge, nichts sonst", () => {
    const r = raeumen(mandant([alt, grenznah, neu, ohneTag]), HEUTE);
    expect(r.mandant.bestaetigungen.map((e) => e.id).sort()).toEqual(["b-grenze", "b-neu", "b-ohne"]);
    expect(r.bericht.bestaetigungen).toBe(1);
  });
  it("eine kürzere eingestellte Frist verkürzt die Aufbewahrung nicht unter zwei Jahre", () => {
    const m = { ...mandant([{ ...alt, datum: "2025-06-01", zeit: "2025-06-01T08:00:00.000Z" }]), aufbewahrung: { plandatenMonate: 1 } };
    expect(vorschau(m, HEUTE).bestaetigungen).toBe(0);
  });
  it("ohne Protokoll entsteht kein Schlüssel und kein Fund", () => {
    const m = { id: "m2", personen: [] };
    expect(vorschau(m, HEUTE).bestaetigungen).toBe(0);
    expect("bestaetigungen" in raeumen(m, HEUTE).mandant).toBe(false);
  });
  it("der Berichtstext nennt die Einträge", () => {
    expect(berichtstext(vorschau(mandant([alt]), HEUTE))).toMatch(/1 Bestätigung im Bestätigungsprotokoll entfernt/);
  });
  it("der Modus bleibt Vorschau, solange nichts anderes ausdrücklich gesetzt ist", () => {
    expect(datenschutzModus(undefined)).toBe("vorschau");
    expect(datenschutzModus("")).toBe("vorschau");
    expect(datenschutzModus("irgendwas")).toBe("vorschau");
  });
});

describe("Veralteter Client spielt Gelöschtes nicht wieder ein", () => {
  const person = (id, rolle) => ({ id, vorname: id, nachname: id.toUpperCase(), rolle, zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }] });
  const basis = () => ({
    id: "m1", personen: [person("s1", "subplaner"), person("p1", "mitarbeiter")],
    dienstarten: [{ id: "N" }], einheiten: [{ id: "e1" }], abweichungen: {}, nachrichten: [], bestaetigungen: [],
  });
  const eintrag = (id, datum) => ({ id, personId: "p1", datum, dienstId: "N", aktion: "einsprung", stufe: "achtung", gelesen: true,
    befunde: [{ regel: "ruhezeitBetrieb", stufe: "achtung" }] });
  it("ein fälliger, unbekannter Eintrag wird übergangen, das Speichern gelingt", () => {
    const stand = basis();
    const r = einheitZusammen(stand, { ...stand, bestaetigungen: [eintrag("b-alt", "2023-06-01")] }, { person: "s1", rolle: "subplaner" });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    expect(r.mandant.bestaetigungen).toHaveLength(0);
  });
  it("ein aktueller Eintrag wird weiter angenommen (nicht blockiert)", () => {
    const stand = basis();
    const r = einheitZusammen(stand, { ...stand, bestaetigungen: [eintrag("b-neu", "2026-11-03")] }, { person: "s1", rolle: "subplaner" });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    expect(r.mandant.bestaetigungen.map((e) => e.id)).toEqual(["b-neu"]);
  });
  it("ein fälliger Eintrag neben einem aktuellen beeinträchtigt den aktuellen nicht", () => {
    const stand = basis();
    const r = einheitZusammen(stand, { ...stand, bestaetigungen: [eintrag("b-alt", "2023-06-01"), eintrag("b-neu", "2026-11-03")] },
      { person: "s1", rolle: "subplaner" });
    expect(r.ok).toBe(true);
    expect(r.mandant.bestaetigungen.map((e) => e.id)).toEqual(["b-neu"]);
  });
});
