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
import { appQuelle } from "./app-quelle.js";
import { readFileSync } from "node:fs";
import { istVerfuegbar, istZeitFuer, pruefZeitFuer, IST_NICHT_VERFUEGBAR, ISTDATEN_TEXT, stundenText,
  zeitraumMonat, zeitraumBisMonat, zeitraumJahr } from "../src/istdaten.js";
import { bestandFuerRolle, zusammenfuehren } from "../server/lib/rechte.mjs";
import { heuteBerlin, tagePlus } from "../server/lib/zeiterfassung.mjs";

const app = appQuelle();
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

describe("Eine Fassung der Ist-Rechnung: src/istdaten.js reicht nur weiter (WP-27b-Review, Zusammenführung WP-16)", () => {
  it("src/istdaten.js enthält außer dem Kopfkommentar genau eine Zeile: export * from server/lib/istdaten.mjs", () => {
    const src = readFileSync(new URL("../src/istdaten.js", import.meta.url), "utf8");
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").trim();
    expect(code).toBe('export * from "../server/lib/istdaten.mjs";');
  });
  it("die Serverfassung trägt die Änderungen beider Pakete (WP-14b: ZEITUMSTELLUNG, nie negativ; WP-16: erfasste Pause in pruefZeitFuer)", () => {
    const q = readFileSync(new URL("../server/lib/istdaten.mjs", import.meta.url), "utf8");
    expect(q).toMatch(/startsWith\("ZEITUMSTELLUNG"\)/);
    expect(q).toMatch(/Math\.max\(0, dauerAm\(d, roh\)\)/);
    expect(q).toMatch(/ohnePlanDauerNull/);
    const p = { id: "a" }, da = { id: "F", start: "06:00", ende: "14:00", pause: 30 };
    const m = { personen: [p], dienstarten: [da], erfassung: { "a|2026-11-09": { start: "06:00", ende: "14:00", bestaetigt: true, pause: 10 } } };
    expect(pruefZeitFuer(m, p, "2026-11-09", da)).toEqual({ start: "06:00", ende: "14:00", pause: 10 });
  });
});

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
    /* WP-43 N1: mit dem betrachteten Zeitraum (24 Wochen bis `bis`). */
    expect(funktion("ausgleichPruefen")).toMatch(
      /istVerfuegbar\(m, p, \{ von: addDays\(bis, -\(ausglWochen \* 7 - 1\)\), bis \}\)\) return \{ nichtVerfuegbar: true, eingehalten: null \}/);
    expect(funktion("ausgleichVerstoesse")).toContain("if (e.nichtVerfuegbar) continue;");
  });
  it("alle Stundenrechnungen gehen über dieselbe Stelle", () => {
    expect(app).toMatch(/const istDauer = \(m, p, d, da\) => istZeitFuer\(m, p, d, da\);/);
    /* WP-43 N1: jede Auswertung nennt ihren Zeitraum. */
    const zeitraum = { istStunden: "zeitraumMonat(ym)", stundenkonto: "zeitraumBisMonat(ym)", nachtJahr: "zeitraumJahr(jahr)",
      auslastung: "zeitraumMonat(ym)", zuschlagStunden: "zeitraumMonat(ym)" };
    for (const [name, z] of Object.entries(zeitraum))
      expect(funktion(name), name).toContain(`istVerfuegbar(m, p, ${z})`);
    expect(app).not.toMatch(/istVerfuegbar\(m, p\)/);              // keine Auswertung ohne Zeitraum
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
    expect(funktion("Jahresansicht")).toContain("!istVerfuegbar(m, p, zeitraumJahr(jahr))");
    /* WP-43 N1: nicht verfügbare Konten ausklammern und nennen, nur ohne jedes verfügbare Konto „–". */
    const lage = funktion("Lagebild");
    expect(lage).toContain("!istVerfuegbar(m, p, kontenZeitraum)");
    expect(lage).toContain("kontenOhneIst === kontenMit.length ? null");
    expect(lage).toContain("(Ist-Daten nicht verfügbar)");
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

/* WP-43, Auflage B1: Nach einer Versetzung bekommt die Schichtverantwortung die
   Erfassung nur für Tage im eigenen Bereich. Für die übrigen Tage fehlt sie aus
   Datenschutzgründen — die Oberfläche darf dort nicht mit der Planzeit rechnen.
   Rot auf dem Stand vor B1: {std: 7.5, erfasst: false} ohne nichtVerfuegbar. */
describe("9. Schichtverantwortung tagesgenau: Tage im anderen Bereich nicht verfügbar, nie Planzeit", () => {
  const heute = heuteBerlin();
  const T_E1 = tagePlus(heute, -12), T_E2 = tagePlus(heute, -3), WECHSEL = tagePlus(heute, -10);
  const versetzt = () => {
    const b = bestand();
    const m0 = b.mandanten[0];
    m0.einheiten = [{ id: "e1" }, { id: "e2" }];
    const zu = (e) => ({ bereich: e, zugehoerigkeit: [{ ab: "2020-01-01", einheitId: e }], status: "aktiv" });
    Object.assign(m0.personen[0], { bereich: "e2", status: "aktiv",                // p17: e1 → e2
      zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }, { ab: WECHSEL, einheitId: "e2" }] });
    Object.assign(m0.personen[1], zu("e1"));                                       // p18: immer e1
    m0.personen.push({ id: "ps", vorname: "Sina", nachname: "Schicht", rolle: "subplaner", ...zu("e1") });
    m0.abweichungen = { [`p17|${T_E1}`]: "F", [`p17|${T_E2}`]: "F", [`p18|${T_E2}`]: "F" };
    m0.erfassung = {
      [`p17|${T_E1}`]: { start: "06:00", ende: "16:30", bestaetigt: true },
      [`p17|${T_E2}`]: { start: "06:00", ende: "16:30", bestaetigt: true },
      [`p18|${T_E2}`]: { start: "06:00", ende: "17:00", bestaetigt: true },
    };
    return bestandFuerRolle(b, { rolle: "subplaner", person: "ps", betrieb: 0 }).mandanten[0];
  };
  it("der Server nennt die zugänglichen Tage der versetzten Person — nur ihr Abschnitt in e1", () => {
    const s = versetzt().sichtIstDaten;
    expect(s.personen).toEqual(expect.arrayContaining(["p17", "p18", "ps"]));
    expect(s.zeitraeume).toEqual({ p17: [{ von: "2020-01-01", bis: tagePlus(WECHSEL, -1) }] });
  });
  it("Tag in e1: erfasste Ist-Zeit; Tag in e2: nicht verfügbar statt Planzeit", () => {
    const m = versetzt();
    expect(istZeitFuer(m, person(m, "p17"), T_E1, FRUEH)).toEqual({ std: IST17, erfasst: true, abweichung: IST17 - PLAN });
    const z = istZeitFuer(m, person(m, "p17"), T_E2, FRUEH);
    expect(z).toEqual({ std: null, erfasst: false, abweichung: 0, nichtVerfuegbar: true });
    expect(pruefZeitFuer(m, person(m, "p17"), T_E2, FRUEH)).toBeNull();
    expect(pruefZeitFuer(m, person(m, "p17"), T_E1, FRUEH)).toEqual({ start: "06:00", ende: "16:30", pause: 30 });
  });
  it("Auswertungen über Zeiträume (Konto, Monat, Ausgleich: istVerfuegbar ohne Tag): nicht verfügbar", () => {
    const m = versetzt();
    expect(istVerfuegbar(m, person(m, "p17"))).toBe(false);
    expect(istVerfuegbar(m, person(m, "p17"), T_E1)).toBe(true);
    expect(istVerfuegbar(m, person(m, "p17"), T_E2)).toBe(false);
    /* Wer immer im Bereich war, bleibt ganz verfügbar. */
    expect(istVerfuegbar(m, person(m, "p18"))).toBe(true);
    expect(istZeitFuer(m, person(m, "p18"), T_E2, FRUEH).std).toBe(IST18);
  });
  it("ein Vermerk mit kaputten Zeiträumen: fail-closed", () => {
    const m = { sichtIstDaten: { umfang: "personen", personen: ["p1"], zeitraeume: { p1: "kaputt" } } };
    expect(istVerfuegbar(m, { id: "p1" }, "2026-01-01")).toBe(false);
    expect(istVerfuegbar(m, { id: "p1" })).toBe(false);
  });
});

/* WP-43 Nachtrag N1: Auswertungen nennen ihren Zeitraum. Verfügbar ist eine
   Person, wenn der Zeitraum ganz in ihren zugänglichen Tagen liegt — eine alte
   oder künftige Versetzung außerhalb stört nicht mehr. Rot auf dcc0f7c: Dort
   galt jede Person mit irgendeinem fremden Abschnitt für jede Auswertung als
   „nicht verfügbar" (Konten, Monat, Jahr dauerhaft „–"). */
describe("10. Zeitraumbezug: Konten und Monate nach alter oder künftiger Versetzung", () => {
  const heute = heuteBerlin();
  const MONAT = heute.slice(0, 7);
  const sv = (zugP17) => {
    const b = bestand();
    const m0 = b.mandanten[0];
    m0.einheiten = [{ id: "e1" }, { id: "e2" }];
    Object.assign(m0.personen[0], { bereich: "e1", status: "aktiv", zugehoerigkeit: zugP17 });
    m0.personen.push({ id: "ps", vorname: "Sina", nachname: "Schicht", rolle: "subplaner", bereich: "e1", status: "aktiv",
      zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }] });
    const T = tagePlus(heute, -1);
    m0.abweichungen = { [`p17|${T}`]: "F" };
    m0.erfassung = { [`p17|${T}`]: { start: "06:00", ende: "16:30", bestaetigt: true } };
    return bestandFuerRolle(b, { rolle: "subplaner", person: "ps", betrieb: 0 }).mandanten[0];
  };
  it("alte Versetzung (2019 e2, seit 2021 e1): aktueller Monat, Kontojahr und Jahr verfügbar", () => {
    const m = sv([{ ab: "2019-01-01", einheitId: "e2" }, { ab: "2021-01-01", einheitId: "e1" }]);
    const p = person(m, "p17");
    expect(m.sichtIstDaten.zeitraeume.p17).toEqual([{ von: "2021-01-01", bis: "9999-12-31" }]);
    expect(istVerfuegbar(m, p, zeitraumMonat(MONAT))).toBe(true);
    expect(istVerfuegbar(m, p, zeitraumBisMonat(MONAT))).toBe(true);
    expect(istVerfuegbar(m, p, zeitraumJahr(heute.slice(0, 4)))).toBe(true);
    expect(istVerfuegbar(m, p, zeitraumJahr("2020"))).toBe(false);                 // damals e2
    expect(istVerfuegbar(m, p)).toBe(false);                                      // ohne Zeitraum: fail-closed
  });
  it("künftige Versetzung (in 200 Tagen nach e2): aktueller Monat verfügbar, ein Zeitraum über den Wechsel nicht", () => {
    const wechsel = tagePlus(heute, 200);
    const m = sv([{ ab: "2020-01-01", einheitId: "e1" }, { ab: wechsel, einheitId: "e2" }]);
    const p = person(m, "p17");
    expect(istVerfuegbar(m, p, zeitraumMonat(MONAT))).toBe(true);
    expect(istVerfuegbar(m, p, zeitraumBisMonat(MONAT))).toBe(true);
    expect(istVerfuegbar(m, p, zeitraumMonat(wechsel.slice(0, 7)))).toBe(false);
    expect(istVerfuegbar(m, p, { von: heute, bis: wechsel })).toBe(false);
  });
  it("Versetzung im betrachteten Monat: der Monat nicht verfügbar, die Tage davor und danach tagesgenau", () => {
    const wechsel = `${MONAT}-15`;
    const m = sv([{ ab: "2020-01-01", einheitId: "e2" }, { ab: wechsel, einheitId: "e1" }]);
    const p = person(m, "p17");
    expect(istVerfuegbar(m, p, zeitraumMonat(MONAT))).toBe(false);
    expect(istVerfuegbar(m, p, `${MONAT}-14`)).toBe(false);
    expect(istVerfuegbar(m, p, wechsel)).toBe(true);
    /* nie Planzeit als Ist: am Tag vor dem Wechsel „nicht verfügbar" */
    const z = istZeitFuer(m, p, `${MONAT}-14`, FRUEH);
    expect(z).toEqual({ std: null, erfasst: false, abweichung: 0, nichtVerfuegbar: true });
    expect(pruefZeitFuer(m, p, `${MONAT}-14`, FRUEH)).toBeNull();
    const ab = istZeitFuer(m, p, wechsel, FRUEH);
    expect(ab.nichtVerfuegbar).toBeUndefined();
  });
  it("Zeiträume: Monatsende und Jahre richtig, Lücken zwischen Abschnitten zählen", () => {
    expect(zeitraumMonat("2028-02")).toEqual({ von: "2028-02-01", bis: "2028-02-29" });
    expect(zeitraumBisMonat("2026-11")).toEqual({ von: "2026-01-01", bis: "2026-11-30" });
    const m = { sichtIstDaten: { umfang: "personen", personen: ["p1"],
      zeitraeume: { p1: [{ von: "2026-01-01", bis: "2026-01-31" }, { von: "2026-02-01", bis: "2026-02-10" }, { von: "2026-02-12", bis: "2026-12-31" }] } } };
    expect(istVerfuegbar(m, { id: "p1" }, { von: "2026-01-15", bis: "2026-02-10" })).toBe(true);   // aneinander anschließend
    expect(istVerfuegbar(m, { id: "p1" }, zeitraumMonat("2026-02"))).toBe(false);                 // Lücke am 11.
    expect(istVerfuegbar(m, { id: "p1" }, { von: "2026-03-01", bis: "2026-02-01" })).toBe(false);  // verkehrt herum
  });
});
