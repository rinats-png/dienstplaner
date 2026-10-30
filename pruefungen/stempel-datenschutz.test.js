/* ==========================================================================
   STEMPEL UND ZEITERFASSUNG: WER SIEHT WELCHE?

   m.einstempeln ("personId|JJJJ-MM-TT" → Zeit, Entfernung, Standorturteil)
   und m.erfassung (Start, Ende, Bestätigung) sind personenbezogen.
   Beschäftigte erhalten nur die eigenen, der Betriebsrat keine; Leitung,
   Planung und Schichtverantwortung unverändert.

   Aufruf: npm run pruefung:stempeldaten
   (Die Prüfung gegen den laufenden Server steht in pruefungen/rechte.mjs, S2.)
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { bestandFuerRolle, zusammenfuehren } from "../server/lib/rechte.mjs";

const stempel = (zeit, extra = {}) => ({ start: zeit, ortStart: "Am Einsatzort (12 m)", innerhalbStart: true, geprueftStart: true, ...extra });
const bestand = () => ({
  mandanten: [{
    id: "m1", name: "Betrieb",
    personen: [
      { id: "p17", vorname: "Eva", nachname: "Eins", rolle: "mitarbeiter", email: "eva@x.de", geburtstag: "1990-01-01" },
      { id: "p18", vorname: "Max", nachname: "Zwei", rolle: "mitarbeiter", email: "max@x.de", geburtstag: "1991-02-02" },
      { id: "pb", vorname: "Britta", nachname: "Rat", rolle: "betriebsrat" },
      { id: "pl", vorname: "Lena", nachname: "Leitung", rolle: "leitung" },
    ],
    einstempeln: {
      "p17|2026-10-22": stempel("06:01", { ende: "14:05", ortEnde: "Abweichend, 3,2 km entfernt", innerhalbEnde: false }),
      "p18|2026-10-22": stempel("05:58"),
      "p170|2026-10-22": stempel("07:00"),
    },
    erfassung: {
      "p17|2026-10-22": { start: "06:01", ende: "14:05", bestaetigt: true, grund: "" },
      "p18|2026-10-22": { start: "05:58", ende: "14:00", bestaetigt: true, grund: "Übergabe länger" },
      "p170|2026-10-22": { start: "07:00", ende: "15:00", bestaetigt: true, grund: "" },
    },
    abwesenheiten: [],
  }],
});
const sicht = (rolle, person) => bestandFuerRolle(bestand(), { rolle, person, betrieb: 0 }).mandanten[0];

describe("Stempelereignisse nach Rolle", () => {
  it("Mitarbeiter sieht den eigenen Stempel — vollständig", () => {
    const e = sicht("mitarbeiter", "p17").einstempeln;
    expect(Object.keys(e)).toEqual(["p17|2026-10-22"]);
    expect(e["p17|2026-10-22"]).toEqual(bestand().mandanten[0].einstempeln["p17|2026-10-22"]);
  });
  it("Mitarbeiter sieht fremde Stempel nicht, auch nicht bei ähnlicher Kennung (p17 ≠ p170)", () => {
    const e = sicht("mitarbeiter", "p17").einstempeln;
    expect(e["p18|2026-10-22"]).toBeUndefined();
    expect(e["p170|2026-10-22"]).toBeUndefined();
    expect(JSON.stringify(sicht("mitarbeiter", "p17"))).not.toContain("05:58");
  });
  it("Mitarbeiter ohne Personenzuordnung bekommt keinen Stempel", () => {
    expect(sicht("mitarbeiter", null).einstempeln).toEqual({});
    expect(sicht("mitarbeiter", undefined).einstempeln).toEqual({});
  });
  it("numerische Personenkennungen funktionieren ebenso", () => {
    const b = { mandanten: [{ id: "m", personen: [{ id: 0 }, { id: 1 }], einstempeln: { "0|2026-10-22": { start: "06:00" }, "1|2026-10-22": { start: "07:00" } } }] };
    const e = bestandFuerRolle(b, { rolle: "mitarbeiter", person: 0, betrieb: 0 }).mandanten[0].einstempeln;
    expect(Object.keys(e)).toEqual(["0|2026-10-22"]);
  });
  it("Betriebsrat bekommt keine Roh-Stempel", () => {
    expect(sicht("betriebsrat", "pb").einstempeln).toEqual({});
    expect(sicht("betriebsrat", null).einstempeln).toEqual({});
    expect(JSON.stringify(sicht("betriebsrat", "pb"))).not.toContain("Am Einsatzort");
  });
  /* Die Schichtverantwortung sieht seit 1e.2 nur sich und ihren Bereich
     (schichtverantwortung- und sicht-schichtverantwortung-Tests). */
  it("Leitung, Planer und Kundenrolle behalten alles", () => {
    for (const rolle of ["leitung", "planer", "kunde"]) {
      const e = sicht(rolle, "pl").einstempeln;
      expect(Object.keys(e).sort(), rolle).toEqual(["p170|2026-10-22", "p17|2026-10-22", "p18|2026-10-22"].sort());
    }
  });
  it("andere Filter bleiben: fremde Stammdaten fehlen für Mitarbeiter und Betriebsrat, die Leitung sieht sie", () => {
    for (const [rolle, ich] of [["mitarbeiter", "p17"], ["betriebsrat", "pb"]]) {
      const p18 = sicht(rolle, ich).personen.find((p) => p.id === "p18");
      expect(p18, rolle).not.toHaveProperty("email");
      expect(p18, rolle).not.toHaveProperty("geburtstag");
      expect(p18.nachname).toBe("Zwei");
    }
    expect(sicht("leitung", "pl").personen.find((p) => p.id === "p18").email).toBe("max@x.de");
  });
  it("das Lesen verändert den gespeicherten Bestand nicht", () => {
    const b = bestand();
    bestandFuerRolle(b, { rolle: "mitarbeiter", person: "p17", betrieb: 0 });
    expect(Object.keys(b.mandanten[0].einstempeln).length).toBe(3);
  });
});

describe("Zeiterfassung (erfassung) nach Rolle", () => {
  const ALLE = ["p170|2026-10-22", "p17|2026-10-22", "p18|2026-10-22"].sort();
  it("Mitarbeiter sieht die eigene Erfassung — vollständig", () => {
    const e = sicht("mitarbeiter", "p17").erfassung;
    expect(Object.keys(e)).toEqual(["p17|2026-10-22"]);
    expect(e["p17|2026-10-22"]).toEqual(bestand().mandanten[0].erfassung["p17|2026-10-22"]);
  });
  it("Mitarbeiter sieht fremde Erfassung nicht", () => {
    const e = sicht("mitarbeiter", "p17").erfassung;
    expect(e["p18|2026-10-22"]).toBeUndefined();
    expect(JSON.stringify(sicht("mitarbeiter", "p17"))).not.toContain("Übergabe länger");
  });
  it("p17 trifft nicht p170", () => {
    expect(sicht("mitarbeiter", "p17").erfassung["p170|2026-10-22"]).toBeUndefined();
    expect(Object.keys(sicht("mitarbeiter", "p170").erfassung)).toEqual(["p170|2026-10-22"]);
  });
  it("Person ohne Zuordnung sieht keine Erfassung", () => {
    expect(sicht("mitarbeiter", null).erfassung).toEqual({});
    expect(sicht("mitarbeiter", undefined).erfassung).toEqual({});
  });
  it("Betriebsrat sieht keine personenbezogene Erfassung", () => {
    expect(sicht("betriebsrat", "pb").erfassung).toEqual({});
    expect(sicht("betriebsrat", null).erfassung).toEqual({});
  });
  it("Leitung sieht die Erfassung unverändert", () => {
    expect(sicht("leitung", "pl").erfassung).toEqual(bestand().mandanten[0].erfassung);
  });
  it("Planer und Kunde wie bisher: alles", () => {
    for (const rolle of ["planer", "kunde"])
      expect(Object.keys(sicht(rolle, "pl").erfassung).sort(), rolle).toEqual(ALLE);
  });
  it("ein Bestand ohne erfassung bleibt ohne (kein leeres Feld erfunden)", () => {
    const b = bestand(); delete b.mandanten[0].erfassung;
    expect(bestandFuerRolle(b, { rolle: "mitarbeiter", person: "p17", betrieb: 0 }).mandanten[0]).not.toHaveProperty("erfassung");
  });
});

describe("Schreiben: ein gefilterter Bestand löscht keine fremden Stempel", () => {
  it("Mitarbeiter speichert seine gefilterte Sicht zurück — fremde Stempel bleiben gespeichert", () => {
    const gespeichert = bestand();
    const gesehen = bestandFuerRolle(gespeichert, { rolle: "mitarbeiter", person: "p17", betrieb: 0 });
    const neu = zusammenfuehren(gespeichert, gesehen, { rolle: "mitarbeiter", person: "p17", betrieb: 0 });
    const m = (neu.bestand || neu).mandanten[0];
    expect(Object.keys(m.einstempeln).sort()).toEqual(["p170|2026-10-22", "p17|2026-10-22", "p18|2026-10-22"].sort());
  });
  /* Seit 4cfc1c2 ändern Beschäftigte ihre Zeiten nicht mehr über das
     allgemeine Speichern, sondern über POST /api/zeit-bestaetigen. */
  it("Rückspeichern der gefilterten Sicht löscht keine fremde Erfassung; eine eigene Änderung über diesen Weg wird übergangen", () => {
    const gespeichert = bestand();
    const gesehen = bestandFuerRolle(gespeichert, { rolle: "mitarbeiter", person: "p17", betrieb: 0 });
    gesehen.mandanten[0].erfassung["p17|2026-10-22"] = { start: "06:01", ende: "14:30", bestaetigt: true, grund: "länger geblieben" };
    const neu = zusammenfuehren(gespeichert, gesehen, { rolle: "mitarbeiter", person: "p17", betrieb: 0 });
    const m = (neu.bestand || neu).mandanten[0];
    expect(Object.keys(m.erfassung).sort()).toEqual(["p170|2026-10-22", "p17|2026-10-22", "p18|2026-10-22"].sort());
    expect(m.erfassung["p18|2026-10-22"]).toEqual(gespeichert.mandanten[0].erfassung["p18|2026-10-22"]);
    expect(m.erfassung["p170|2026-10-22"]).toEqual(gespeichert.mandanten[0].erfassung["p170|2026-10-22"]);
    expect(m.erfassung["p17|2026-10-22"]).toEqual(gespeichert.mandanten[0].erfassung["p17|2026-10-22"]);
  });
  it("ein Mitarbeiter kann fremde Erfassung nicht anlegen oder ändern", () => {
    const gespeichert = bestand();
    const frech = bestandFuerRolle(gespeichert, { rolle: "mitarbeiter", person: "p17", betrieb: 0 });
    frech.mandanten[0].erfassung["p18|2026-10-22"] = { start: "00:00", ende: "23:59", bestaetigt: true };
    frech.mandanten[0].erfassung["p18|2026-10-23"] = { start: "00:00", ende: "23:59", bestaetigt: true };
    const neu = zusammenfuehren(gespeichert, frech, { rolle: "mitarbeiter", person: "p17", betrieb: 0 });
    const m = (neu.bestand || neu).mandanten[0];
    expect(m.erfassung["p18|2026-10-22"].start).toBe("05:58");
    expect(m.erfassung["p18|2026-10-23"]).toBeUndefined();
  });
  it("ein Mitarbeiter kann Stempel weder anlegen noch ändern", () => {
    const gespeichert = bestand();
    const frech = bestandFuerRolle(gespeichert, { rolle: "mitarbeiter", person: "p17", betrieb: 0 });
    frech.mandanten[0].einstempeln["p17|2026-10-22"] = stempel("01:00", { innerhalbStart: true });
    frech.mandanten[0].einstempeln["p18|2026-10-23"] = stempel("02:00");
    const neu = zusammenfuehren(gespeichert, frech, { rolle: "mitarbeiter", person: "p17", betrieb: 0 });
    const m = (neu.bestand || neu).mandanten[0];
    expect(m.einstempeln["p17|2026-10-22"].start).toBe("06:01");
    expect(m.einstempeln["p18|2026-10-23"]).toBeUndefined();
  });
});
