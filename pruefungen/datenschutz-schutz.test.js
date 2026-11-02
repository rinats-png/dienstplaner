/* ==========================================================================
   DATENSCHUTZ DER SCHUTZMERKMALE

   Schwangerschaft (Mutterschutz) und Schwerbehinderung sind Gesundheits-
   angaben nach Artikel 9 DSGVO. Sie gehören in die Planung der Leitung, nicht
   zu Kolleginnen, und nicht erkennbar in das Protokoll des Betriebsrats.

   Aufruf: npm run pruefung:schutzdaten
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { bestandFuerRolle, bestaetigungFuerBetriebsrat, SCHUTZ_NEUTRAL } from "../server/lib/rechte.mjs";

const person = (id, extra = {}) => ({ id, vorname: "V" + id, nachname: "N" + id, einheit: "e1", ...extra });
const bestand = (extra = {}) => ({
  mandanten: [{
    name: "Betrieb",
    personen: [
      person("p1", { mutterschutz: true, geburtstag: "1995-05-05" }),
      person("p2", { schwerbehindert: true, geburtstag: "1980-01-01" }),
      person("p3", {}),
      person("pl", { rolle: "planer" }),
    ],
    abwesenheiten: [], bestaetigungen: [], ...extra,
  }],
});
const sicht = (rolle, ich, b = bestand()) => bestandFuerRolle(b, { rolle, person: ich, betrieb: 0 }).mandanten[0];
const nach = (m, id) => m.personen.find((p) => p.id === id);

describe("Mutterschutz und Schwerbehinderung bei fremden Personen", () => {
  it("Mitarbeiter sehen sie bei Kolleginnen nicht", () => {
    const m = sicht("mitarbeiter", "p3");
    expect(nach(m, "p1")).not.toHaveProperty("mutterschutz");
    expect(nach(m, "p2")).not.toHaveProperty("schwerbehindert");
    expect(nach(m, "p1").nachname).toBe("Np1");
  });
  it("die eigene Person behält ihren Eintrag", () => {
    expect(nach(sicht("mitarbeiter", "p1"), "p1").mutterschutz).toBe(true);
    expect(nach(sicht("mitarbeiter", "p2"), "p2").schwerbehindert).toBe(true);
    // … aber nicht den der anderen
    expect(nach(sicht("mitarbeiter", "p1"), "p2")).not.toHaveProperty("schwerbehindert");
  });
  it("der Betriebsrat sieht sie bei niemandem", () => {
    const m = sicht("betriebsrat", null);
    expect(nach(m, "p1")).not.toHaveProperty("mutterschutz");
    expect(nach(m, "p2")).not.toHaveProperty("schwerbehindert");
  });
  it("Leitung, Planung und Schichtverantwortung sehen sie wie bisher", () => {
    for (const rolle of ["leitung", "planer", "subplaner"]) {
      const m = sicht(rolle, "pl");
      expect(nach(m, "p1").mutterschutz, rolle).toBe(true);
      expect(nach(m, "p2").schwerbehindert, rolle).toBe(true);
    }
  });
  it("die Quelldaten werden nicht verändert", () => {
    const b = bestand();
    sicht("mitarbeiter", "p3", b);
    expect(b.mandanten[0].personen[0].mutterschutz).toBe(true);
  });
});

describe("Bestätigtes Protokoll für den Betriebsrat", () => {
  const eintrag = (befunde, extra = {}) => ({
    id: "b1", personId: "p1", datum: "2026-11-12", dienstId: "N", aktion: "einsprung", stufe: "recht",
    befunde, regelIds: [], grundArt: "dringend", grund: "Frau P1 ist schwanger, deshalb", ohneGrund: false,
    gelesen: true, durch: "Sandra", durchId: "s1", rolle: "subplaner", ...extra });
  const muschg = { stufe: "recht", text: "Nachtarbeit zwischen 20 und 6 Uhr nur mit Einwilligung und behördlicher Genehmigung.", quelle: "MuSchG § 5" };
  const sgb = { stufe: "achtung", text: "Schwerbehinderte Menschen sind auf Verlangen von Mehrarbeit über acht Stunden freizustellen.", quelle: "SGB IX § 207" };
  const ruhe = { stufe: "recht", text: "Ruhezeit 8 h", quelle: "§ 5 ArbZG" };

  it("MuSchG wird neutral: keine Regel, keine Fundstelle, kein Text, kein Freitext", () => {
    const b = bestaetigungFuerBetriebsrat(eintrag([muschg], { regelIds: ["MUSCHG-05"] }));
    expect(b.befunde).toEqual([{ stufe: "recht", text: "Individuelle Schutzregel", quelle: SCHUTZ_NEUTRAL }]);
    expect(b.regelIds).toEqual([SCHUTZ_NEUTRAL]);
    expect(b.grund).toBe("");
    const alles = JSON.stringify(b);
    for (const verrat of ["MuSchG", "MUSCHG", "Mutterschutz", "schwanger", "Nachtarbeit"]) expect(alles).not.toContain(verrat);
  });
  it("SGB IX wird neutral", () => {
    const b = bestaetigungFuerBetriebsrat(eintrag([sgb], { regelIds: ["SGBIX-207-01"], grund: "" }));
    expect(b.befunde[0]).toEqual({ stufe: "achtung", text: "Individuelle Schutzregel", quelle: SCHUTZ_NEUTRAL });
    const alles = JSON.stringify(b);
    for (const verrat of ["SGB IX", "SGBIX", "Schwerbehind"]) expect(alles).not.toContain(verrat);
  });
  it("erhalten bleiben Datum, Dienst, Stufe, Aktion, Bestätigungszeit und die Rolle; Namen fehlen", () => {
    const b = bestaetigungFuerBetriebsrat(eintrag([muschg], { zeit: "2026-11-12T08:00:00Z" }));
    expect(b).toMatchObject({ datum: "2026-11-12", dienstId: "N", stufe: "recht", aktion: "einsprung",
      zeit: "2026-11-12T08:00:00Z", durch: "subplaner", personId: null, durchId: null });
  });
  it("in einem Eintrag mit mehreren Befunden wird nur der sensible neutralisiert", () => {
    const b = bestaetigungFuerBetriebsrat(eintrag([ruhe, muschg]));
    expect(b.befunde[0]).toEqual(ruhe);
    expect(b.befunde[1].quelle).toBe(SCHUTZ_NEUTRAL);
  });
  it("andere Befunde, auch Jugendarbeitsschutz, bleiben unverändert (nur ohne Namen)", () => {
    const jug = { stufe: "recht", text: "Jugendliche dürfen nicht zwischen 20 und 6 Uhr beschäftigt werden.", quelle: "JArbSchG § 14" };
    const b = bestaetigungFuerBetriebsrat(eintrag([ruhe, jug], { regelIds: ["AZ-RUHE-01", "JARBSCHG-14"], grund: "Engpass" }));
    expect(b.befunde).toEqual([ruhe, jug]);
    expect(b.regelIds).toEqual(["AZ-RUHE-01", "JARBSCHG-14"]);
    expect(b.grund).toBe("Engpass");
    expect(b.personId).toBeNull();
  });
  it("auch ältere Einträge ohne regelIds werden an der Quelle erkannt", () => {
    const b = bestaetigungFuerBetriebsrat({ ...eintrag([muschg]), regelIds: undefined });
    expect(b.befunde[0].quelle).toBe(SCHUTZ_NEUTRAL);
  });
  it("zwei sensible Regeln ergeben eine neutrale Kennung", () => {
    const b = bestaetigungFuerBetriebsrat(eintrag([muschg, sgb], { regelIds: ["MUSCHG-05", "SGBIX-207-01", "AZ-RUHE-01"] }));
    expect(b.regelIds).toEqual([SCHUTZ_NEUTRAL, "AZ-RUHE-01"]);
  });

  it("Rollenschnitt über die Antwort des Servers: Betriebsrat neutral, Planung detailliert, Beschäftigte ohne Protokoll", () => {
    const e = eintrag([muschg], { regelIds: ["MUSCHG-05"] });
    const b = bestand({ bestaetigungen: [e] });
    const br = sicht("betriebsrat", null, b).bestaetigungen[0];
    expect(br.befunde[0].quelle).toBe(SCHUTZ_NEUTRAL);
    expect(br.personId).toBeNull();
    for (const rolle of ["leitung", "planer", "subplaner"]) {
      const plan = sicht(rolle, "pl", b).bestaetigungen[0];
      expect(plan.befunde[0].quelle, rolle).toBe("MuSchG § 5");
      expect(plan.regelIds, rolle).toEqual(["MUSCHG-05"]);
      expect(plan.personId, rolle).toBe("p1");
    }
    expect(sicht("mitarbeiter", "p3", b).bestaetigungen).toBeUndefined();
    expect(b.mandanten[0].bestaetigungen[0].befunde[0].quelle).toBe("MuSchG § 5");  // Quelle unverändert
  });
});
