/* ==========================================================================
   STEMPEL UND ZEITERFASSUNG: WER SIEHT WELCHE?

   m.einstempeln ("personId|JJJJ-MM-TT" → Zeit, Entfernung, Standorturteil)
   und m.erfassung (Start, Ende, Bestätigung) sind personenbezogen.
   Beschäftigte erhalten nur die eigenen, der Betriebsrat nur die eigenen
   Stempel und keine Erfassung, die Schichtverantwortung die eigenen und von
   ihrem Bereich Beginn, Ende, Pause und Bestätigung; Leitung, Planung und
   Kunde unverändert.

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
  it("Betriebsrat bekommt keine fremden Stempel", () => {
    expect(sicht("betriebsrat", "pb").einstempeln).toEqual({});
    expect(sicht("betriebsrat", null).einstempeln).toEqual({});
    expect(JSON.stringify(sicht("betriebsrat", "pb"))).not.toContain("Am Einsatzort");
  });
  it("Betriebsrat bekommt den eigenen Stempel (er stempelt für sich), keine fremden", () => {
    const b = bestand();
    b.mandanten[0].einstempeln["pb|2026-10-22"] = stempel("08:00");
    const e = bestandFuerRolle(b, { rolle: "betriebsrat", person: "pb", betrieb: 0 }).mandanten[0].einstempeln;
    expect(Object.keys(e)).toEqual(["pb|2026-10-22"]);
  });
  it("Leitung, Planer und Kunde behalten alles", () => {
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
  it("Rückspeichern der gefilterten Sicht löscht keine fremde Erfassung; die eigene Änderung kommt an", () => {
    const gespeichert = bestand();
    const gesehen = bestandFuerRolle(gespeichert, { rolle: "mitarbeiter", person: "p17", betrieb: 0 });
    gesehen.mandanten[0].erfassung["p17|2026-10-22"] = { start: "06:01", ende: "14:30", bestaetigt: true, grund: "länger geblieben" };
    const neu = zusammenfuehren(gespeichert, gesehen, { rolle: "mitarbeiter", person: "p17", betrieb: 0 });
    const m = (neu.bestand || neu).mandanten[0];
    expect(Object.keys(m.erfassung).sort()).toEqual(["p170|2026-10-22", "p17|2026-10-22", "p18|2026-10-22"].sort());
    expect(m.erfassung["p18|2026-10-22"]).toEqual(gespeichert.mandanten[0].erfassung["p18|2026-10-22"]);
    expect(m.erfassung["p170|2026-10-22"]).toEqual(gespeichert.mandanten[0].erfassung["p170|2026-10-22"]);
    expect(m.erfassung["p17|2026-10-22"].ende).toBe("14:30");
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

/* ------------------------------------------------------------------------
   Schichtverantwortung: eigene Stempel; Erfassung des eigenen Bereichs ohne
   freien Grund; nichts aus fremden Bereichen. Und: Zurückspeichern ihres
   Ausschnitts verliert nichts.
   ------------------------------------------------------------------------ */
const bereichsBestand = () => ({
  mandanten: [{
    id: "m1", name: "Betrieb",
    personen: [
      { id: "ps", nachname: "Schicht", rolle: "subplaner", bereich: "A" },
      { id: "pa", nachname: "Ahorn", rolle: "mitarbeiter", bereich: "A" },
      { id: "pb", nachname: "Birke", rolle: "mitarbeiter", bereich: "B" },
      /* Bis zum 14.10. im Bereich A, ab dem 15.10. im Bereich B. */
      { id: "pw", nachname: "Wechsel", rolle: "mitarbeiter",
        zugehoerigkeit: [{ einheitId: "A", ab: "2026-01-01" }, { einheitId: "B", ab: "2026-10-15" }] },
    ],
    einstempeln: {
      "ps|2026-10-22": stempel("06:00"),
      "pa|2026-10-22": stempel("06:05", { ortEnde: "Abweichend, 3,2 km entfernt" }),
      "pb|2026-10-22": stempel("06:10"),
    },
    erfassung: {
      "ps|2026-10-22": { start: "06:00", ende: "14:00", bestaetigt: true, grund: "eigener Grund" },
      "pa|2026-10-22": { start: "06:05", ende: "14:20", pause: 30, bestaetigt: true, grund: "Arzttermin der Tochter" },
      "pb|2026-10-22": { start: "06:10", ende: "14:10", bestaetigt: true, grund: "Bereich B privat" },
      "pw|2026-10-10": { start: "07:00", ende: "15:00", bestaetigt: true, grund: "alt in A" },
      "pw|2026-10-20": { start: "07:00", ende: "15:00", bestaetigt: true, grund: "neu in B" },
    },
    dienstbuch: [],
  }],
});
const SV = { rolle: "subplaner", person: "ps", betrieb: 0 };
const svSicht = (b = bereichsBestand(), s = SV) => bestandFuerRolle(b, s).mandanten[0];
const speichern = (gespeichert, gesehen, s = SV) => {
  const erg = zusammenfuehren(gespeichert, gesehen, s);
  if (erg && erg.verweigert) throw new Error(erg.verweigert);
  return erg.mandanten[0];
};

describe("Schichtverantwortung: Lesen", () => {
  it("sieht nur den eigenen Stempel — keinen aus dem Bereich, keinen aus fremden Bereichen", () => {
    expect(Object.keys(svSicht().einstempeln)).toEqual(["ps|2026-10-22"]);
  });
  it("kein Standorturteil anderer Personen in der Antwort", () => {
    const t = JSON.stringify(svSicht().einstempeln);
    expect(t).not.toContain("3,2 km");
    expect(t).not.toContain("06:05");
    expect(t).not.toContain("06:10");
  });
  it("eigene Erfassung vollständig", () => {
    expect(svSicht().erfassung["ps|2026-10-22"]).toEqual(bereichsBestand().mandanten[0].erfassung["ps|2026-10-22"]);
  });
  it("Erfassung im eigenen Bereich nur Beginn, Ende, Pause, Bestätigung — kein Grund", () => {
    expect(svSicht().erfassung["pa|2026-10-22"]).toEqual({ start: "06:05", ende: "14:20", pause: 30, bestaetigt: true });
    expect(JSON.stringify(svSicht())).not.toContain("Arzttermin");
  });
  it("fremder Bereich: keine Erfassung, kein Grund", () => {
    expect(svSicht().erfassung["pb|2026-10-22"]).toBeUndefined();
    expect(JSON.stringify(svSicht())).not.toContain("Bereich B privat");
  });
  it("der Bereich gilt am Tag des Eintrags (Versetzung)", () => {
    const e = svSicht().erfassung;
    expect(e["pw|2026-10-10"]).toEqual({ start: "07:00", ende: "15:00", bestaetigt: true });
    expect(e["pw|2026-10-20"]).toBeUndefined();
    expect(JSON.stringify(svSicht())).not.toContain("alt in A");
  });
  it("Bereich „ALLE“: jede Person reduziert, Stempel weiter nur eigene", () => {
    const b = bereichsBestand(); b.mandanten[0].personen[0].bereich = "ALLE";
    const m = svSicht(b);
    expect(Object.keys(m.einstempeln)).toEqual(["ps|2026-10-22"]);
    expect(m.erfassung["pb|2026-10-22"]).toEqual({ start: "06:10", ende: "14:10", bestaetigt: true });
    expect(JSON.stringify(m)).not.toContain("privat");
  });
  it("ohne Bereich: nur die eigenen Zeiten", () => {
    const b = bereichsBestand(); delete b.mandanten[0].personen[0].bereich;
    expect(Object.keys(svSicht(b).erfassung)).toEqual(["ps|2026-10-22"]);
  });
  it("ohne Personenzuordnung: nichts", () => {
    const m = svSicht(bereichsBestand(), { rolle: "subplaner", person: null, betrieb: 0 });
    expect(m.einstempeln).toEqual({});
    expect(m.erfassung).toEqual({});
  });
  it("sichtIstDaten nennt die eigene Person und den Bereich, nie fremde Bereiche", () => {
    const s = svSicht().sichtIstDaten;
    expect(s.umfang).toBe("auswahl");
    expect(s.personen).toContain("ps");
    expect(s.personen).toContain("pa");
    expect(s.personen).not.toContain("pb");
    expect(s.personen).not.toContain("pw"); // heute in B
  });
  it("ein gespeichertes sichtIstDaten wird nie ausgeliefert", () => {
    const b = bereichsBestand(); b.mandanten[0].sichtIstDaten = { umfang: "eigene", person: "x" };
    expect(bestandFuerRolle(b, { rolle: "leitung", person: "pl", betrieb: 0 }).mandanten[0]).not.toHaveProperty("sichtIstDaten");
  });
  it("das Lesen verändert den gespeicherten Bestand nicht", () => {
    const b = bereichsBestand();
    svSicht(b);
    expect(b.mandanten[0]).toEqual(bereichsBestand().mandanten[0]);
  });
});

describe("Schichtverantwortung: Schreiben ohne Verlust", () => {
  it("Rückspeichern der unveränderten Sicht ändert nichts", () => {
    const g = bereichsBestand();
    const m = speichern(g, bestandFuerRolle(g, SV));
    expect(m.einstempeln).toEqual(g.mandanten[0].einstempeln);
    expect(m.erfassung).toEqual(g.mandanten[0].erfassung);
    expect(m).not.toHaveProperty("sichtIstDaten");
  });
  it("Änderung im Bereich kommt an, der freie Grund bleibt erhalten", () => {
    const g = bereichsBestand();
    const s = bestandFuerRolle(g, SV);
    s.mandanten[0].erfassung["pa|2026-10-22"] = { start: "06:05", ende: "14:45", pause: 30, bestaetigt: true };
    expect(speichern(g, s).erfassung["pa|2026-10-22"])
      .toEqual({ start: "06:05", ende: "14:45", pause: 30, bestaetigt: true, grund: "Arzttermin der Tochter" });
  });
  it("einen Grund im Bereich kann sie weder setzen noch überschreiben", () => {
    const g = bereichsBestand();
    const s = bestandFuerRolle(g, SV);
    s.mandanten[0].erfassung["pa|2026-10-22"] = { start: "06:05", ende: "14:20", pause: 30, bestaetigt: true, grund: "überschrieben" };
    expect(speichern(g, s).erfassung["pa|2026-10-22"].grund).toBe("Arzttermin der Tochter");
  });
  it("fremde Bereiche bleiben unberührt — auch bei gezielter Änderung", () => {
    const g = bereichsBestand();
    const s = bestandFuerRolle(g, SV);
    s.mandanten[0].erfassung["pb|2026-10-22"] = { start: "00:00", ende: "23:59", bestaetigt: true };
    s.mandanten[0].erfassung["pb|2026-10-23"] = { start: "00:00", ende: "23:59", bestaetigt: true };
    const m = speichern(g, s);
    expect(m.erfassung["pb|2026-10-22"]).toEqual(g.mandanten[0].erfassung["pb|2026-10-22"]);
    expect(m.erfassung["pb|2026-10-23"]).toBeUndefined();
    expect(m.erfassung["pw|2026-10-20"]).toEqual(g.mandanten[0].erfassung["pw|2026-10-20"]);
  });
  it("Stempel ändert sie über den Bestand nicht, auch keinen eigenen; nichts geht verloren", () => {
    const g = bereichsBestand();
    const s = bestandFuerRolle(g, SV);
    s.mandanten[0].einstempeln = { "ps|2026-10-22": stempel("01:00"), "pa|2026-10-23": stempel("02:00") };
    expect(speichern(g, s).einstempeln).toEqual(g.mandanten[0].einstempeln);
  });
  it("ohne Feld erfassung bleibt die Zeiterfassung vollständig", () => {
    const g = bereichsBestand();
    const s = bestandFuerRolle(g, SV);
    delete s.mandanten[0].erfassung;
    expect(speichern(g, s).erfassung).toEqual(g.mandanten[0].erfassung);
  });
  it("einen sichtbaren Eintrag im Bereich darf sie entfernen (wie bisher)", () => {
    const g = bereichsBestand();
    const s = bestandFuerRolle(g, SV);
    delete s.mandanten[0].erfassung["pa|2026-10-22"];
    const m = speichern(g, s);
    expect(m.erfassung["pa|2026-10-22"]).toBeUndefined();
    expect(Object.keys(m.erfassung).length).toBe(4);
  });
  it("Mitarbeiter: Rückspeichern verliert nichts; Betriebsrat darf nicht schreiben", () => {
    const g = bereichsBestand();
    const ma = { rolle: "mitarbeiter", person: "pa", betrieb: 0 };
    const m = zusammenfuehren(g, bestandFuerRolle(g, ma), ma).mandanten[0];
    expect(m.erfassung).toEqual(g.mandanten[0].erfassung);
    expect(m.einstempeln).toEqual(g.mandanten[0].einstempeln);
    const br = { rolle: "betriebsrat", person: "pb", betrieb: 0 };
    expect(zusammenfuehren(g, bestandFuerRolle(g, br), br)).toBeNull();
  });
});

describe("Mandantentrennung bleibt", () => {
  it("jede Rolle bekommt nur den eigenen Betrieb", () => {
    const b = bereichsBestand();
    b.mandanten.push({ id: "m2", name: "Fremd", personen: [{ id: "ps", bereich: "A" }],
      erfassung: { "ps|2026-10-22": { start: "01:00", ende: "02:00", bestaetigt: true, grund: "fremder Betrieb" } },
      einstempeln: { "ps|2026-10-22": stempel("01:00") } });
    for (const rolle of ["mitarbeiter", "betriebsrat", "subplaner", "planer", "leitung", "kunde"]) {
      const aus = bestandFuerRolle(b, { rolle, person: "ps", betrieb: 0 });
      expect(aus.mandanten.length, rolle).toBe(1);
      expect(aus.mandanten[0].id, rolle).toBe("m1");
      expect(JSON.stringify(aus), rolle).not.toContain("fremder Betrieb");
    }
  });
});
