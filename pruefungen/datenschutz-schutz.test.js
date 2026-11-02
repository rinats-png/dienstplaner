/* ==========================================================================
   DATENSCHUTZ DER SCHUTZMERKMALE

   Schwangerschaft (Mutterschutz) und Schwerbehinderung sind Gesundheits-
   angaben nach Artikel 9 DSGVO. Sie gehören in die Planung der Leitung, nicht
   zu Kolleginnen, und nicht erkennbar in das Protokoll des Betriebsrats.

   WP-11: Kette A brachte diese Prüfung mit eigener Neutralisierung in
   rechte.mjs (bestaetigungFuerBetriebsrat, SCHUTZ_NEUTRAL). Maßgeblich sind
   die Positivkataloge von Kette B (server/lib/sicht.mjs), und die sind an
   drei Stellen strenger — die Erwartungen folgen ihnen, keine wurde gelockert:
   - Die eigene Person bekommt die Rohfelder mutterschutz/schwerbehindert
     nicht über GET /api/bestand (EIGENE_PERSON: „keine Ansicht der Person
     braucht sie"); Auskunft nach Art. 15 DSGVO läuft über die Vollausgabe.
   - Die Schichtverantwortung bekommt keine Rohfelder, nur neutrale
     Einsatzregeln (planungsregeln, Commit S1).
   - Der Betriebsrat bekommt das Bestätigungsprotokoll nur als Zählwerte je
     Monat, Regel und Stufe (Nachprüfung WP-10, M1-Rest); jede Schutzregel,
     auch der Jugendarbeitsschutz, heißt dort „schutz", ohne Gesetz, ohne
     Text, ohne Freitext.

   Aufruf: npm run pruefung:schutzdaten
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { bestandFuerRolle } from "../server/lib/rechte.mjs";
import { bestaetigungenBetriebsrat, SCHUTZ_NEUTRAL } from "../server/lib/sicht.mjs";

const person = (id, extra = {}) => ({ id, vorname: "V" + id, nachname: "N" + id, bereich: "e1",
  zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }], ...extra });
const bestand = (extra = {}) => ({
  mandanten: [{
    name: "Betrieb", einheiten: [{ id: "e1" }],
    personen: [
      person("p1", { mutterschutz: true, geburtstag: "1995-05-05" }),
      person("p2", { schwerbehindert: true, geburtstag: "1980-01-01" }),
      person("p3", {}),
      person("pl", { rolle: "planer" }),
      person("sv", { rolle: "subplaner" }),
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
  it("die eigene Person bekommt die Rohfelder nicht über die Planungsansicht (Kette B, EIGENE_PERSON)", () => {
    expect(nach(sicht("mitarbeiter", "p1"), "p1")).not.toHaveProperty("mutterschutz");
    expect(nach(sicht("mitarbeiter", "p2"), "p2")).not.toHaveProperty("schwerbehindert");
    // … und erst recht nicht den der anderen
    expect(nach(sicht("mitarbeiter", "p1"), "p2")).not.toHaveProperty("schwerbehindert");
  });
  it("der Betriebsrat sieht sie bei niemandem", () => {
    const m = sicht("betriebsrat", null);
    expect(nach(m, "p1")).not.toHaveProperty("mutterschutz");
    expect(nach(m, "p2")).not.toHaveProperty("schwerbehindert");
  });
  it("Leitung und Planung sehen sie; die Schichtverantwortung nur als neutrale Einsatzregel", () => {
    for (const rolle of ["leitung", "planer"]) {
      const m = sicht(rolle, "pl");
      expect(nach(m, "p1").mutterschutz, rolle).toBe(true);
      expect(nach(m, "p2").schwerbehindert, rolle).toBe(true);
    }
    const sv = sicht("subplaner", "sv");
    expect(nach(sv, "p1")).not.toHaveProperty("mutterschutz");
    expect(nach(sv, "p2")).not.toHaveProperty("schwerbehindert");
    expect(nach(sv, "p1").planungsregeln.map((r) => r.regel)).toContain("nachtNichtZulaessig");
    expect(nach(sv, "p2").planungsregeln.map((r) => r.regel)).toContain("ueber8hNurAbsprache");
    expect(JSON.stringify(sv)).not.toMatch(/MuSchG|SGB IX|Mutterschutz|Schwerbehind/);
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
  /* Altbestand mit Wortlaut (vor dem Befundkatalog) und neue Einträge mit Kennung. */
  const muschg = { stufe: "recht", text: "Nachtarbeit zwischen 20 und 6 Uhr nur mit Einwilligung und behördlicher Genehmigung.", quelle: "MuSchG § 5" };
  const sgb = { stufe: "achtung", text: "Schwerbehinderte Menschen sind auf Verlangen von Mehrarbeit über acht Stunden freizustellen.", quelle: "SGB IX § 207" };
  const jug = { stufe: "recht", text: "Jugendliche dürfen nicht zwischen 20 und 6 Uhr beschäftigt werden.", quelle: "JArbSchG § 14" };
  const ruhe = { regel: "ruhezeitBetrieb", stufe: "achtung" };
  const VERRAT = ["MuSchG", "MUSCHG", "Mutterschutz", "schwanger", "Nachtarbeit", "SGB IX", "SGBIX", "Schwerbehind",
    "JArbSchG", "Jugend", "Sandra", "subplaner", "einsprung", "p1", "b1"];
  const sauber = (x) => { const t = JSON.stringify(x); for (const v of VERRAT) expect(t, v).not.toContain(v); };

  it("MuSchG wird neutral: keine Regel, keine Fundstelle, kein Text, kein Freitext, keine Person", () => {
    const b = bestaetigungenBetriebsrat([eintrag([muschg], { regelIds: ["MUSCHG-05"] })]);
    expect(b).toEqual([{ monat: "2026-11", regel: SCHUTZ_NEUTRAL, stufe: "recht", anzahl: "<3" }]);
    sauber(b);
  });
  it("SGB IX wird neutral", () => {
    const b = bestaetigungenBetriebsrat([eintrag([sgb], { regelIds: ["SGBIX-207-01"], stufe: "achtung", grund: "" })]);
    expect(b).toEqual([{ monat: "2026-11", regel: SCHUTZ_NEUTRAL, stufe: "achtung", anzahl: "<3" }]);
    sauber(b);
  });
  it("erhalten bleiben nur Monat, Regel, Stufe und die Anzahl; Tag, Dienst, Aktion, Zeit und Rolle fehlen", () => {
    const b = bestaetigungenBetriebsrat([eintrag([muschg], { zeit: "2026-11-12T08:00:00Z" })]);
    expect(Object.keys(b[0]).sort()).toEqual(["anzahl", "monat", "regel", "stufe"]);
  });
  it("in einem Eintrag mit mehreren Befunden wird nur der sensible neutralisiert", () => {
    const b = bestaetigungenBetriebsrat([eintrag([ruhe, muschg])]);
    expect(b.map((x) => x.regel)).toEqual(["ruhezeitBetrieb", SCHUTZ_NEUTRAL].sort());
    sauber(b);
  });
  it("auch der Jugendarbeitsschutz heißt nur „schutz“ (Kette B: Alter ist ein Schutzmerkmal, Commit S1)", () => {
    const b = bestaetigungenBetriebsrat([eintrag([ruhe, jug], { regelIds: ["AZ-RUHE-01", "JARBSCHG-14"], grund: "Engpass" })]);
    expect(b.map((x) => x.regel).sort()).toEqual(["ruhezeitBetrieb", SCHUTZ_NEUTRAL].sort());
    expect(JSON.stringify(b)).not.toContain("Engpass");                    // kein Freitext
    sauber(b);
  });
  it("auch ältere Einträge ohne regelIds werden an der Quelle erkannt", () => {
    const b = bestaetigungenBetriebsrat([{ ...eintrag([muschg]), regelIds: undefined }]);
    expect(b[0].regel).toBe(SCHUTZ_NEUTRAL);
  });
  it("zwei sensible Regeln in einem Eintrag zählen einmal als „schutz“", () => {
    const b = bestaetigungenBetriebsrat([eintrag([muschg, sgb], { regelIds: ["MUSCHG-05", "SGBIX-207-01", "AZ-RUHE-01"] })]);
    expect(b.filter((x) => x.regel === SCHUTZ_NEUTRAL)).toHaveLength(1);
  });
  it("ab drei Bestätigungen steht die Zahl, darunter „<3“", () => {
    const b = bestaetigungenBetriebsrat([1, 2, 3].map((i) => eintrag([ruhe], { id: `x${i}`, stufe: "achtung" })));
    expect(b).toEqual([{ monat: "2026-11", regel: "ruhezeitBetrieb", stufe: "achtung", anzahl: 3 }]);
  });

  it("Rollenschnitt über die Antwort des Servers: Betriebsrat Zählwerte, Planung detailliert, Beschäftigte ohne Protokoll", () => {
    const e = eintrag([muschg], { regelIds: ["MUSCHG-05"] });
    const b = bestand({ bestaetigungen: [e] });
    const br = sicht("betriebsrat", null, b).bestaetigungen;
    expect(br).toEqual([{ monat: "2026-11", regel: SCHUTZ_NEUTRAL, stufe: "recht", anzahl: "<3" }]);
    for (const rolle of ["leitung", "planer"]) {
      const plan = sicht(rolle, "pl", b).bestaetigungen[0];
      expect(plan.befunde[0].quelle, rolle).toBe("MuSchG § 5");
      expect(plan.regelIds, rolle).toEqual(["MUSCHG-05"]);
      expect(plan.personId, rolle).toBe("p1");
    }
    expect(sicht("mitarbeiter", "p3", b).bestaetigungen || []).toEqual([]);
    expect(b.mandanten[0].bestaetigungen[0].befunde[0].quelle).toBe("MuSchG § 5");  // Quelle unverändert
  });
});
