/* ==========================================================================
   IST-DATEN UNTER ROLLENSCHUTZ: KEINE PLANZEIT ALS IST-ZEIT

   Seit der Server m.erfassung für Beschäftigte (fremde Personen) und den
   Betriebsrat ausfiltert, fehlt dort die Erfassung aus Datenschutzgründen.
   Der Rückfall „keine Erfassung → Planzeit" darf dann nicht greifen: Ist-Zeit
   ist „nicht verfügbar", nicht „gleich dem Plan". Leitung und Planung
   unverändert.

   Aufruf: npm run pruefung:istdaten
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { istVerfuegbar, istZeitFuer, pruefZeitFuer, IST_NICHT_VERFUEGBAR, ISTDATEN_TEXT, stundenText } from "../src/istdaten.js";
import { bestandFuerRolle, zusammenfuehren } from "../server/lib/rechte.mjs";

const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const funktion = (name) => {
  const von = app.search(new RegExp(`(function ${name}\\(|const ${name} = )`));
  expect(von, name).toBeGreaterThan(0);
  return app.slice(von, app.indexOf("\n}", von) + 2);
};

const FRUEH = { id: "F", name: "Früh", start: "06:00", ende: "14:00", pause: 30 };
const TAG = "2026-10-21";
const bestand = () => ({
  mandanten: [{
    id: "m1", name: "Betrieb",
    personen: [
      { id: "p17", vorname: "Eva", nachname: "Eins", rolle: "mitarbeiter" },
      { id: "p18", vorname: "Max", nachname: "Zwei", rolle: "mitarbeiter" },
      { id: "pb", vorname: "Britta", nachname: "Rat", rolle: "betriebsrat" },
    ],
    dienstarten: [FRUEH],
    abweichungen: { [`p17|${TAG}`]: "F", [`p18|${TAG}`]: "F" },
    erfassung: {
      [`p17|${TAG}`]: { start: "06:00", ende: "16:30", bestaetigt: true, grund: "länger" },
      [`p18|${TAG}`]: { start: "06:00", ende: "17:00", bestaetigt: true, grund: "Übergabe" },
    },
    einstempeln: {}, abwesenheiten: [],
  }],
});
const sicht = (rolle, person) => bestandFuerRolle(bestand(), { rolle, person, betrieb: 0 }).mandanten[0];
const person = (m, id) => m.personen.find((p) => p.id === id);
const PLAN = 7.5, IST17 = 10, IST18 = 10.5;   // 06:00–14:00 −30 min · 06:00–16:30 −30 · 06:00–17:00 −30

describe("istVerfuegbar", () => {
  it("ohne Vermerk des Servers: alles verfügbar (Leitung, Planung, lokale Daten)", () => {
    expect(istVerfuegbar({}, { id: "x" })).toBe(true);
    expect(istVerfuegbar(null, { id: "x" })).toBe(true);
  });
  it("„eigene\": nur die eigene Person, exakt (p17 ≠ p170), auch numerisch", () => {
    const m = { sichtIstDaten: { umfang: "eigene", person: "p17" } };
    expect(istVerfuegbar(m, { id: "p17" })).toBe(true);
    expect(istVerfuegbar(m, { id: "p170" })).toBe(false);
    expect(istVerfuegbar(m, { id: "p18" })).toBe(false);
    expect(istVerfuegbar({ sichtIstDaten: { umfang: "eigene", person: 0 } }, { id: 0 })).toBe(true);
    expect(istVerfuegbar({ sichtIstDaten: { umfang: "eigene", person: null } }, { id: "p17" })).toBe(false);
  });
  it("„keine\" und jeder unbekannte Umfang: nichts verfügbar", () => {
    expect(istVerfuegbar({ sichtIstDaten: { umfang: "keine" } }, { id: "p17" })).toBe(false);
    expect(istVerfuegbar({ sichtIstDaten: { umfang: "irgendwas" } }, { id: "p17" })).toBe(false);
  });
});

describe("Der Server vermerkt den Rollenschutz", () => {
  it("Mitarbeiter: eigene, Betriebsrat: keine, Leitung und Planung: kein Vermerk", () => {
    expect(sicht("mitarbeiter", "p17").sichtIstDaten).toEqual({ umfang: "eigene", person: "p17" });
    expect(sicht("mitarbeiter", null).sichtIstDaten).toEqual({ umfang: "keine" });
    expect(sicht("betriebsrat", "pb").sichtIstDaten).toEqual({ umfang: "keine" });
    for (const r of ["leitung", "planer", "kunde"]) expect(sicht(r, "pl"), r).not.toHaveProperty("sichtIstDaten");
    /* Schichtverantwortung: Vermerk mit den Personen, deren Ist-Zeiten sie bekommt (siehe 8.). */
    expect(sicht("subplaner", "pl").sichtIstDaten.umfang).toBe("personen");
  });
  it("ein gespeicherter Vermerk zählt nicht (Leitung sieht ihn nie)", () => {
    const b = bestand(); b.mandanten[0].sichtIstDaten = { umfang: "keine" };
    expect(bestandFuerRolle(b, { rolle: "leitung", person: "pl", betrieb: 0 }).mandanten[0]).not.toHaveProperty("sichtIstDaten");
  });
  it("Rückspeichern durch Beschäftigte speichert den Vermerk nicht", () => {
    const gespeichert = bestand();
    const gesehen = bestandFuerRolle(gespeichert, { rolle: "mitarbeiter", person: "p17", betrieb: 0 });
    const neu = zusammenfuehren(gespeichert, gesehen, { rolle: "mitarbeiter", person: "p17", betrieb: 0 });
    expect((neu.bestand || neu).mandanten[0]).not.toHaveProperty("sichtIstDaten");
  });
});

describe("Ist-Zeit je Rolle — die gemeinsame Stelle aller Stunden (istDauer)", () => {
  it("1. Mitarbeiter sieht die eigene Ist-Zeit weiterhin korrekt", () => {
    const m = sicht("mitarbeiter", "p17");
    const z = istZeitFuer(m, person(m, "p17"), TAG, FRUEH);
    expect(z).toMatchObject({ std: IST17, erfasst: true });
    expect(z.nichtVerfuegbar).toBeUndefined();
  });
  it("2. Betriebsrat bekommt keine personenbezogene Erfassung", () => {
    expect(sicht("betriebsrat", "pb").erfassung).toEqual({});
  });
  it("3. Betriebsrat bekommt keine Planzeit als Ist-Zeit", () => {
    const m = sicht("betriebsrat", "pb");
    for (const id of ["p17", "p18"]) {
      const z = istZeitFuer(m, person(m, id), TAG, FRUEH);
      expect(z.std, id).toBeNull();
      expect(z.std, id).not.toBe(PLAN);
      expect(z.nichtVerfuegbar, id).toBe(true);
    }
  });
  it("Mitarbeiter: für Kolleginnen ebenfalls keine Planzeit als Ist-Zeit", () => {
    const m = sicht("mitarbeiter", "p17");
    expect(istZeitFuer(m, person(m, "p18"), TAG, FRUEH).std).toBeNull();
  });
  it("8. Schichtverantwortung: Ist-Zeit für sich und den eigenen Bereich, sonst nicht verfügbar statt Planzeit", () => {
    const b = bestand();
    const m0 = b.mandanten[0];
    m0.einheiten = [{ id: "e1" }, { id: "e2" }];
    const zu = (e) => ({ bereich: e, zugehoerigkeit: [{ ab: "2020-01-01", einheitId: e }], status: "aktiv" });
    Object.assign(m0.personen[0], zu("e1"));                       // p17: Bereich
    Object.assign(m0.personen[1], zu("e2"));                       // p18: fremd
    m0.personen.push({ id: "ps", vorname: "Sina", nachname: "Schicht", rolle: "subplaner", ...zu("e1") });
    const m = bestandFuerRolle(b, { rolle: "subplaner", person: "ps", betrieb: 0 }).mandanten[0];
    expect(m.sichtIstDaten.umfang).toBe("personen");
    expect(istZeitFuer(m, person(m, "p17"), TAG, FRUEH)).toEqual({ std: IST17, erfasst: true, abweichung: IST17 - PLAN });
    expect(istZeitFuer(m, person(m, "p18"), TAG, FRUEH)).toEqual({ std: null, erfasst: false, abweichung: 0, nichtVerfuegbar: true });
    expect(pruefZeitFuer(m, person(m, "p18"), TAG, FRUEH)).toBeNull();
  });
  it("7. Leitung und Planung unverändert: erfasst schlägt Plan, ohne Erfassung gilt der Plan", () => {
    for (const r of ["leitung", "planer"]) {
      const m = sicht(r, "pl");
      expect(istZeitFuer(m, person(m, "p17"), TAG, FRUEH), r).toEqual({ std: IST17, erfasst: true, abweichung: IST17 - PLAN });
      expect(istZeitFuer(m, person(m, "p18"), TAG, FRUEH).std, r).toBe(IST18);
      expect(istZeitFuer(m, person(m, "p17"), "2026-10-22", FRUEH), r).toEqual({ std: PLAN, erfasst: false, abweichung: 0 });
    }
  });
});

describe("4. Ist-Zeit-Prüfungen ohne zugängliche Ist-Daten: nicht bewertbar", () => {
  it("pruefZeitFuer liefert für den Betriebsrat nichts — keine Prüfung gegen den Plan", () => {
    const m = sicht("betriebsrat", "pb");
    expect(pruefZeitFuer(m, person(m, "p17"), TAG, FRUEH)).toBeNull();
  });
  it("… für die Leitung die erfasste Zeit, ohne Erfassung den Plan (wie bisher)", () => {
    const m = sicht("leitung", "pl");
    expect(pruefZeitFuer(m, person(m, "p17"), TAG, FRUEH)).toEqual({ start: "06:00", ende: "16:30", pause: 30 });
    expect(pruefZeitFuer(m, person(m, "p17"), "2026-10-22", FRUEH)).toBe(FRUEH);
  });
  it("die Planprüfung meldet „nicht bewertbar\" statt eines Befunds aus dem Plan", () => {
    const f = funktion("pruefen");
    expect(f).toContain("pruefZeitFuer(m, p, d, da)");
    expect(f).toContain('art: "istdaten"');
    expect(f).not.toMatch(/const ist = e && e\.bestaetigt/);
  });
  it("Ausgleichszeitraum: ohne Ist-Daten weder eingehalten noch verletzt", () => {
    expect(funktion("ausgleichPruefen")).toMatch(/istVerfuegbar\(m, p\)\) return \{ nichtVerfuegbar: true, eingehalten: null \}/);
    expect(funktion("ausgleichVerstoesse")).toContain("if (e.nichtVerfuegbar) continue;");
  });
  it("alle Stundenrechnungen gehen über dieselbe Stelle", () => {
    expect(app).toMatch(/const istDauer = \(m, p, d, da\) => istZeitFuer\(m, p, d, da\);/);
    for (const name of ["istStunden", "stundenkonto", "nachtJahr", "auslastung"])
      expect(funktion(name), name).toContain("istVerfuegbar(m, p)");
    expect(IST_NICHT_VERFUEGBAR.gesamt).toBeNull();
    expect(Object.isFrozen(IST_NICHT_VERFUEGBAR)).toBe(true);
  });
});

describe("Darstellung: nie 0, nie Plan als Ist", () => {
  it("Text und Platzhalter", () => {
    expect(ISTDATEN_TEXT).toBe("Ist-Arbeitszeit für diese Rolle nicht personenbezogen verfügbar.");
    expect(stundenText(null, String)).toBe("–");
    expect(stundenText(0, String)).toBe("0");
  });
  it("Monatsplan, Jahresansicht, Lagebild, Team-Auslastung behandeln „nicht verfügbar\"", () => {
    expect(funktion("Einsatzplan")).toContain("ist.nichtVerfuegbar");
    expect(funktion("Jahresansicht")).toContain("!istVerfuegbar(m, p)");
    expect(funktion("Lagebild")).toContain("!istVerfuegbar(m, p)");
    expect(funktion("TeamAuslastungLeiste")).toContain("ta.nichtVerfuegbar");
    expect(funktion("teamAuslastung")).toContain("nichtVerfuegbar: true");
  });
  it("Begründungen sagen „nicht verfügbar\" statt „im Mittel\"", () => {
    expect(funktion("ersatzVorschlaege")).toContain('"Stundenkonto nicht verfügbar"');
    expect(funktion("rangGruende")).toContain("kto === null");
    expect(funktion("ermuedung")).toContain("konto === null");
    expect(funktion("bewerbungsPunkte")).toContain("konto !== null");
  });
});

describe("5. Reine Planansichten des Betriebsrats unverändert", () => {
  it("Dienstplan, Dienstarten und Abweichungen kommen vollständig an", () => {
    const br = sicht("betriebsrat", "pb"), l = sicht("leitung", "pl");
    expect(br.abweichungen).toEqual(l.abweichungen);
    expect(br.dienstarten).toEqual(l.dienstarten);
    expect(br.personen.map((p) => p.id)).toEqual(l.personen.map((p) => p.id));
  });
});

describe("6. Exporte: keine Planzeit als Ist-Zeit", () => {
  it("die Tabelle „Erfasste Zeiten\" gibt nur Erfasstes aus — beim Betriebsrat ist sie leer", () => {
    const f = funktion("vollExport");
    const teil = f.slice(f.indexOf("tabellen.erfassung"), f.indexOf("tabellen.anfragen"));
    expect(teil).toContain("v.start");
    expect(teil).not.toMatch(/istDauer|istStunden|dauer\(/);
    expect(Object.keys(sicht("betriebsrat", "pb").erfassung)).toEqual([]);
  });
  it("Lohn- und Zuschlagsausgaben (mit Ist-Stunden) sind dem Betriebsrat verschlossen", () => {
    expect(app).toMatch(/\["abrechnung", "Abrechnungsdaten", "account\.view\.all"\]/);
    const br = app.match(/betriebsrat: \[([^\]]*)\]/)[1];
    expect(br).not.toContain("account.view.all");
    expect(br).not.toContain("org.edit");          // Datenmitnahme
  });
  it("der Dienstplan-Export ist reine Planinformation", () => {
    const i = app.indexOf("exportCSV: () =>");
    const teil = app.slice(i, app.indexOf("},", i));
    expect(teil).not.toMatch(/istDauer|istStunden|erfassung/);
  });
  it("Zuschlagsstunden ohne Ist-Daten: gearbeitete Stunden null", () => {
    expect(funktion("zuschlagStunden")).toContain("if (ohneIst) { r.gesamt = null; r.nichtVerfuegbar = true; }");
  });
});
