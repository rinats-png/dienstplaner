/* ==========================================================================
   IMP-1 — Vier Bestandsfehler im Personalimport (src/lib/fachlogik.js)

   1  Erkannte Dubletten werden ungeprüft übernommen
   2  Zugeordnete Personalnummern werden nicht gespeichert / nicht gelesen
   3  Fehlende E-Mail-Adressen werden erfunden (vorname.nachname@betrieb.de)
   4  Ungültige Eintrittsdaten werden still durch das heutige Datum ersetzt

   Freigabe: Personalnummer ist mandantenintern der bevorzugte Identifikator.
   Keine Zusammenführung nur über Namen, keine automatische Überschreibung.
   Aufruf: npx vitest run pruefungen/import-bestand-imp1.test.js
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { demobestand, importParsen, importZuordnen, importPruefen } from "../src/lib/fachlogik.js";

const m0 = demobestand().mandanten[0];
const einheit = m0.einheiten[0].name;
const lauf = (text, mandant = m0, entscheidungen) => {
  const { kopf, daten } = importParsen(text);
  const { zu } = importZuordnen(kopf, daten);
  return importPruefen(mandant, kopf, daten, zu, entscheidungen);
};
const KOPF = "Nachname;Vorname;Personalnummer;E-Mail;Einheit;Eintritt";
const mitNr = { ...m0, personen: [{ ...m0.personen[0], personalnummer: "P4711", nachname: "Altmann", vorname: "Gerda" }, ...m0.personen.slice(1)] };
const appImportQuelle = () => {
  const q = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  const i = q.indexOf("importieren: (zeilen, anlegen)");
  return q.slice(i, i + 2500);
};

describe("IMP-1 Fehler 1: Dubletten", () => {
  it("D1 Dublette nach Personalnummer wird nicht als übernehmbar geführt", () => {
    const r = lauf(`${KOPF}\nNeumann;Ida;P4711;;${einheit};01.03.2024`, mitNr);
    expect(r.zeilen[0].doppelt).toBe(true);
    expect(r.zeilen[0].dublette.grund).toBe("personalnummer");
    expect(r.zeilen[0].ok).toBe(false);
    expect(r.gut).toBe(0);
  });
  it("D2 Dublette nach Name wird nicht ungeprüft übernommen", () => {
    const p = m0.personen[0];
    const r = lauf(`${KOPF}\n${p.nachname};${p.vorname};;;${einheit};01.03.2024`);
    expect(r.zeilen[0].dublette.grund).toBe("name");
    expect(r.zeilen[0].ok).toBe(false);
  });
  it("D3 Neu anlegen nur nach ausdrücklicher Wahl", () => {
    const p = m0.personen[0];
    const r = lauf(`${KOPF}\n${p.nachname};${p.vorname};;;${einheit};01.03.2024`, m0, { 1: "neu" });
    expect(r.zeilen[0].ok).toBe(true);
  });
  it("D4 Bestehenden aktualisieren (nur per Personalnummer) braucht ausdrückliche Bestätigung und wird nicht als Neuanlage geführt", () => {
    /* IMP-3-Auflage: Erwartung angepasst. Früher wurde ein reiner Namenstreffer (zielId bei grund "name")
       aktualisiert; das ist verboten (siehe Block "Auflage"). Aktualisierung nur über Personalnummer-Treffer. */
    const p = mitNr.personen[0];
    const t = `${KOPF}\nNeumann;Ida;P4711;;${einheit};01.03.2024`;
    expect(lauf(t, mitNr, { 1: { aktion: "aktualisieren" } }).zeilen[0].ok).toBe(false);
    const b = lauf(t, mitNr, { 1: { aktion: "aktualisieren", bestaetigt: true } }).zeilen[0];
    expect(b.aktion).toBe("aktualisieren");
    expect(b.zielId).toBe(p.id);
    expect(b.ok).toBe(false); /* nie als Neuanlage übernehmbar */
  });
  it("D5 Überspringen und Konflikt klären nehmen die Zeile nicht auf", () => {
    const p = m0.personen[0];
    const t = `${KOPF}\n${p.nachname};${p.vorname};;;${einheit};01.03.2024`;
    expect(lauf(t, m0, { 1: "ueberspringen" }).zeilen[0].ok).toBe(false);
    expect(lauf(t, m0, { 1: "klaeren" }).zeilen[0].ok).toBe(false);
  });
  it("D6 Doppelte Personalnummer innerhalb der Datei wird erkannt", () => {
    const r = lauf(`${KOPF}\nAaa;Bea;P9;;${einheit};01.03.2024\nCcc;Dora;P9;;${einheit};01.03.2024`);
    expect(r.zeilen[0].ok).toBe(true);
    expect(r.zeilen[1].dublette.grund).toBe("personalnummer");
    expect(r.zeilen[1].ok).toBe(false);
  });
  it("D7 Gleiche Nummer, die im Mandanten nicht vorkommt, stört nicht (mandantenintern)", () => {
    const r = lauf(`${KOPF}\nNeumann;Ida;P4711;;${einheit};01.03.2024`);
    expect(r.zeilen[0].doppelt).toBe(false);
    expect(r.zeilen[0].ok).toBe(true);
  });
});

describe("IMP-1 Auflage aus dem IMP-3-Review: Namenstreffer aktualisiert nie", () => {
  const p = m0.personen[0];
  const person = (nr) => ({ ...m0, personen: [{ ...p, personalnummer: nr }, ...m0.personen.slice(1)] });
  const zeile = (nr, name = `${p.nachname};${p.vorname}`) => `${KOPF}\n${name};${nr};;${einheit};01.03.2024`;
  const AKT = { aktion: "aktualisieren", bestaetigt: true };

  it("A1 Namenstreffer ohne Personalnummer: Vorgabe klären/neu, nie aktualisieren", () => {
    const z = lauf(zeile(""), m0).zeilen[0];
    expect(z.dublette.grund).toBe("name");
    expect(["klaeren", "neu"]).toContain(z.vorgabe);
    expect(z.ok).toBe(false);
  });
  it("A2 Aktualisieren mit Bestätigung auf Namenstreffer wird abgewiesen: kein zielId, nicht ok", () => {
    const z = lauf(zeile(""), m0, { 1: AKT }).zeilen[0];
    expect(z.zielId).toBe(null);
    expect(z.aktualisierungBestaetigt).toBe(false);
    expect(z.aktion).not.toBe("aktualisieren");
    expect(z.ok).toBe(false);
  });
  it("A3 Namenstreffer mit abweichender Personalnummer: Vorgabe klären, nicht neu, nie Aktualisierung", () => {
    const z = lauf(zeile("P9999"), person("P4711")).zeilen[0];
    expect(z.doppelt).toBe(true);
    expect(z.vorgabe).toBe("klaeren");
    expect(z.ok).toBe(false);
    const a = lauf(zeile("P9999"), person("P4711"), { 1: AKT }).zeilen[0];
    expect(a.zielId).toBe(null);
    expect(a.ok).toBe(false);
  });
  it("A4 Führende Nullen: 01001 gegen 1001 gilt als möglicher Treffer (klären), nicht als verschieden", () => {
    const z = lauf(zeile("01001", "Fremd;Name"), person("1001")).zeilen[0];
    expect(z.doppelt).toBe(true);
    expect(z.vorgabe).toBe("klaeren");
    expect(z.zielId).toBe(null);
    expect(z.ok).toBe(false);
  });
  it("A5 Schreibweise: P-1001 gegen P1001 gilt als möglicher Treffer (klären)", () => {
    const z = lauf(zeile("P-1001", "Fremd;Name"), person("P1001")).zeilen[0];
    expect(z.doppelt).toBe(true);
    expect(z.vorgabe).toBe("klaeren");
    expect(z.ok).toBe(false);
    expect(lauf(zeile("P-1001", "Fremd;Name"), person("P1001"), { 1: AKT }).zeilen[0].zielId).toBe(null);
  });
  it("A6 Personalnummer-Treffer: Aktualisierung nur mit Bestätigung", () => {
    const m = person("P4711");
    const t = zeile("P4711", "Fremd;Name");
    const ohne = lauf(t, m).zeilen[0];
    expect(ohne.dublette.grund).toBe("personalnummer");
    expect(ohne.zielId).toBe(null);
    expect(lauf(t, m, { 1: { aktion: "aktualisieren" } }).zeilen[0].zielId).toBe(null);
    expect(lauf(t, m, { 1: AKT }).zeilen[0].zielId).toBe(p.id);
  });
  it("A7 Gleiche Nummer plus gleicher Name: Treffer über die Nummer, mit Bestätigung", () => {
    const z = lauf(zeile("P4711"), person("P4711"), { 1: AKT }).zeilen[0];
    expect(z.dublette.grund).toBe("personalnummer");
    expect(z.zielId).toBe(p.id);
  });
  it("A8 Namensdublette innerhalb der Datei kann nicht aktualisieren", () => {
    const r = lauf(`${KOPF}\nAaa;Bea;;;${einheit};01.03.2024\nAaa;Bea;;;${einheit};01.03.2024`, m0, { 2: AKT });
    expect(r.zeilen[1].zielId).toBe(null);
    expect(r.zeilen[1].ok).toBe(false);
  });
});

describe("IMP-1 Fehler 2: Personalnummer", () => {
  it("N1 Zeile trägt die zugeordnete Personalnummer", () => {
    const r = lauf(`${KOPF}\nNeumann;Ida;P123;;${einheit};01.03.2024`);
    expect(r.zeilen[0].personalnummer).toBe("P123");
  });
  it("N2 Ohne Nummer bleibt sie leer", () => {
    const r = lauf(`${KOPF}\nNeumann;Ida;;;${einheit};01.03.2024`);
    expect(r.zeilen[0].personalnummer).toBe("");
  });
  it("N3 App speichert die Nummer in der neuen Person", () => {
    expect(appImportQuelle()).toMatch(/personalnummer:\s*z\.personalnummer/);
  });
});

describe("IMP-1 Fehler 3: E-Mail wird nie erfunden", () => {
  it("E1 Fehlende E-Mail bleibt leer", () => {
    const r = lauf(`${KOPF}\nNeumann;Ida;P1;;${einheit};01.03.2024`);
    expect(r.zeilen[0].email).toBe("");
  });
  it("E2 Vorhandene E-Mail wird übernommen", () => {
    const r = lauf(`${KOPF}\nNeumann;Ida;P1;ida@firma.de;${einheit};01.03.2024`);
    expect(r.zeilen[0].email).toBe("ida@firma.de");
  });
  it("E3 Ungültige E-Mail ist ein Fehler, kein Ersatz", () => {
    const r = lauf(`${KOPF}\nNeumann;Ida;P1;keine-mail;${einheit};01.03.2024`);
    expect(r.zeilen[0].ok).toBe(false);
    expect(r.zeilen[0].fehler.join(" ")).toMatch(/E-Mail/);
  });
  it("E4 Importpfad in App.jsx erfindet keine Adresse mehr", () => {
    expect(appImportQuelle()).not.toMatch(/@betrieb\.de/);
  });
});

describe("IMP-1 Fehler 4: ungültiges Datum", () => {
  const heute = new Date().toISOString().slice(0, 10);
  for (const [name, roh] of [["Text", "irgendwann"], ["unmöglicher Tag", "31.02.2024"], ["Monat 13", "01.13.2024"], ["ISO unmöglich", "2024-02-30"]]) {
    it(`T-${name}: Fehler statt heutigem Datum`, () => {
      const z = lauf(`${KOPF}\nNeumann;Ida;P1;;${einheit};${roh}`).zeilen[0];
      expect(z.ok).toBe(false);
      expect(z.eintritt).not.toBe(heute);
      expect(z.fehler.join(" ")).toMatch(/Eintritt/);
    });
  }
  it("T-gültig: deutsches und ISO-Datum werden gelesen", () => {
    expect(lauf(`${KOPF}\nA;B;P1;;${einheit};29.02.2024`).zeilen[0].eintritt).toBe("2024-02-29");
    expect(lauf(`${KOPF}\nA;B;P1;;${einheit};2024-03-01`).zeilen[0].ok).toBe(true);
  });
});
