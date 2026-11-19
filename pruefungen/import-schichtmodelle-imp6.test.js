/* ==========================================================================
   IMP-6 — Schichtmodelle und Schichtzyklen: mehrere Modelle, beliebige
   Zykluslänge, Ausrollen mit den Dienstarten des Betriebs (Nachtschicht über
   Mitternacht, Zeitumstellung), Prüfung über die bestehende Planprüfung,
   Konflikte statt stiller Korrektur, Determinismus, Ressourcengrenze.

   Nur synthetische Daten. Aufruf:
     npx vitest run pruefungen/import-schichtmodelle-imp6.test.js
   ========================================================================== */

import { describe, it, expect } from "vitest";
import { modelleLesen, zuordnungenLesen, ausrollen, schichtLage } from "../server/lib/import/schichtmodelle.mjs";
import { schichtmodelleAnalysieren, SCHICHT_GRENZEN, grenzenAus } from "../server/lib/import/schichtpruefung.mjs";

const da = (kurz, start, ende, pause = 30, mehr = {}) => ({ id: `da-${kurz}`, kurz, name: `Dienst ${kurz}`, start, ende, pause, ...mehr });
const DIENSTE = [da("F", "06:00", "14:00"), da("S", "14:00", "22:00"), da("N", "22:00", "06:00", 45), da("T", "09:00", "17:00")];
const person = (id, nr, mehr = {}) => ({ id, vorname: `V${id}`, nachname: `N${id}`, personalnummer: nr, status: "aktiv",
  eintritt: "2020-01-01", austritt: null, geburtstag: "1985-05-05", zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }],
  qualifikationen: [], einschraenkungen: {}, wochenstunden: 40, ...mehr });
const betrieb = (mehr = {}) => ({ id: "m1", name: "Testhaus", bundesland: "BY", einheiten: [{ id: "e1", name: "Team 1", versatz: 0 }],
  standorte: [], dienstarten: DIENSTE, qualifikationen: [], einstellungen: { ruhezeit: 11, maxFolge: 6, maxNachtFolge: 4 },
  personen: [person("p1", "100"), person("p2", "200"), person("p3", "300")], abweichungen: {}, abwesenheiten: [],
  zyklus: { wochen: 1, tage: ["-", "-", "-", "-", "-", "-", "-"] }, anker: "2026-01-05", ...mehr });

const KOPF_M = ["Modell", "Tag", "Dienst"];
const KOPF_Z = ["Personalnummer", "Modell", "Beginn", "Versatz"];
/** Modellzeilen aus { Name: ["F", "S", "-", …] }. */
const modellTabelle = (modelle) => [KOPF_M, ...Object.entries(modelle).flatMap(([n, tage]) => tage.map((k, i) => [n, i + 1, k]))];
const analyse = (modelle, zuordnungen, von, bis, mehr = {}) => schichtmodelleAnalysieren({ mandant: mehr.mandant || betrieb(),
  modellZeilen: modellTabelle(modelle), zuordnungZeilen: zuordnungen ? [KOPF_Z, ...zuordnungen] : null, von, bis, grenzen: mehr.grenzen });
const schichtenVon = (r, personId) => r.schichten.filter((s) => s.personId === personId);

describe("IMP-6 keine feste Zykluslänge, mehrere Modelle", () => {
  const MODELLE = {
    "Drei": ["F", "S", "-"],
    "Woche": ["F", "F", "F", "F", "F", "-", "-"],
    "Zehn": ["F", "F", "S", "S", "-", "N", "N", "-", "-", "-"],
    "Vier Wochen": Array.from({ length: 28 }, (_, i) => (i % 7 < 5 ? "T" : "-")),
  };
  it("liest 3, 7, 10 und 28 Tage in einer Datei als vier Modelle", () => {
    const r = modelleLesen({ zeilen: modellTabelle(MODELLE), dienstarten: DIENSTE });
    expect(r.ok).toBe(true);
    expect(r.modelle.map((m) => [m.name, m.laenge, m.pruefbar])).toEqual([["Drei", 3, true], ["Woche", 7, true], ["Zehn", 10, true], ["Vier Wochen", 28, true]]);
    expect(r.modelle[2].tage).toEqual(["da-F", "da-F", "da-S", "da-S", null, "da-N", "da-N", null, null, null]);
  });
  it("Reihenfolge der Zeilen ist egal; die Zykluslänge ist die höchste Tagesnummer", () => {
    const zeilen = modellTabelle({ "Zehn": MODELLE.Zehn });
    const gemischt = [zeilen[0], ...zeilen.slice(1).reverse()];
    expect(modelleLesen({ zeilen: gemischt, dienstarten: DIENSTE }).modelle[0].tage)
      .toEqual(modelleLesen({ zeilen, dienstarten: DIENSTE }).modelle[0].tage);
  });
  it("rollt jedes Modell mit seiner eigenen Periode aus (Tag d und d + Länge gleich)", () => {
    const r = analyse(MODELLE, [["100", "Drei", "2026-06-01", 0], ["200", "Zehn", "2026-06-01", 0], ["300", "Vier Wochen", "2026-06-01", 0]],
      "2026-06-01", "2026-07-31");
    expect(r.ok).toBe(true);
    for (const [pid, len] of [["p1", 3], ["p2", 10], ["p3", 28]]) {
      const s = schichtenVon(r, pid);
      expect(s.length).toBe(61);
      for (let i = 0; i + len < s.length; i++) expect(s[i + len].dienstId).toBe(s[i].dienstId);
      expect(s.map((x) => x.zyklusTag).slice(0, len)).toEqual(Array.from({ length: len }, (_, i) => i + 1));
    }
    /* Zehn Tage sind keine Wochenperiode: Tag d und d + 7 unterscheiden sich mindestens einmal. */
    const zehn = schichtenVon(r, "p2");
    expect(zehn.some((x, i) => i + 7 < zehn.length && zehn[i + 7].dienstId !== x.dienstId)).toBe(true);
  });
  it("Zuordnung mit Versatz und Modellwechsel je Person", () => {
    const r = analyse(MODELLE, [["100", "Zehn", "2026-06-01", 0], ["200", "Zehn", "2026-06-01", 3], ["300", "Drei", "2026-06-01", 0],
      ["300", "Woche", "2026-06-10", 0]], "2026-06-01", "2026-06-20");
    const p1 = schichtenVon(r, "p1"), p2 = schichtenVon(r, "p2"), p3 = schichtenVon(r, "p3");
    for (let i = 0; i + 3 < p1.length; i++) expect(p2[i].dienstId).toBe(p1[i + 3].dienstId);
    expect(p3.filter((s) => s.datum < "2026-06-10").every((s) => s.modell === "Drei")).toBe(true);
    expect(p3.filter((s) => s.datum >= "2026-06-10").every((s) => s.modell === "Woche")).toBe(true);
    expect(p3.find((s) => s.datum === "2026-06-10")).toMatchObject({ zyklusTag: 1, kurz: "F" });
  });
  it("Versatz außerhalb des Zyklus wird nicht still umgerechnet, sondern als Fehler gemeldet", () => {
    const m = modelleLesen({ zeilen: modellTabelle({ "Drei": MODELLE.Drei }), dienstarten: DIENSTE });
    const z = zuordnungenLesen({ zeilen: [KOPF_Z, ["100", "Drei", "2026-06-01", 3], ["100", "Drei", "2026-07-01", ""]],
      personen: betrieb().personen, modelle: m.modelle });
    expect(z.datensaetze[0].fehler).toContain("Versatz ungültig");
    expect(z.datensaetze[1].fehler).toContain("Versatz fehlt");
    expect(z.datensaetze.every((d) => d.vorgabe === "ueberspringen")).toBe(true);
  });
});

describe("IMP-6 Nachtschicht über Mitternacht und Zeitumstellung", () => {
  const N = DIENSTE[2];
  it("Nachtschicht endet am Folgetag, auch über den Monatswechsel", () => {
    expect(schichtLage("2026-01-31", N)).toEqual({ beginn: "2026-01-31T22:00", ende: "2026-02-01T06:00", ueberMitternacht: true, minuten: 480, stunden: 7.25 });
    expect(schichtLage("2026-12-31", N).ende).toBe("2027-01-01T06:00");
    expect(schichtLage("2026-01-31", DIENSTE[0]).ueberMitternacht).toBe(false);
  });
  it("Zeitumstellung: Oktobernacht 9 h, Märznacht 7 h (dieselbe Rechnung wie die Planprüfung)", () => {
    expect(schichtLage("2026-10-24", N)).toMatchObject({ ende: "2026-10-25T06:00", minuten: 540, stunden: 8.25 });
    expect(schichtLage("2027-03-27", N)).toMatchObject({ ende: "2027-03-28T06:00", minuten: 420, stunden: 6.25 });
  });
  it("ausgerollte Nachtschichten tragen die Lage mit Zeitumstellung", () => {
    const r = analyse({ "Nacht": ["N", "N", "-", "-"] }, [["100", "Nacht", "2026-10-23", 0]], "2026-10-23", "2026-10-26");
    expect(schichtenVon(r, "p1").filter((s) => s.dienstId).map((s) => [s.datum, s.ende, s.minuten]))
      .toEqual([["2026-10-23", "2026-10-24T06:00", 480], ["2026-10-24", "2026-10-25T06:00", 540]]);
  });
  it("Ruhezeit über die Zeitumstellung im März: 11 h laut Uhr, 10 h wirklich → Befund", () => {
    const modell = { "Wochenende": ["S", "T", "-", "-", "-", "-", "-"] };
    const maerz = analyse(modell, [["100", "Wochenende", "2027-03-27", 0]], "2027-03-27", "2027-04-02");
    const b = maerz.befunde.filter((x) => x.quelle === "zuordnung" && x.art === "ruhezeit");
    expect(b).toHaveLength(1);
    expect(b[0]).toMatchObject({ datum: "2027-03-28", personId: "p1", datensatz: 1 });
    expect(b[0].text).toContain("10,0 h");
    /* Gegenprobe: dieselbe Folge eine Woche vorher (ohne Umstellung) hat genau 11 h. */
    const vorher = analyse(modell, [["100", "Wochenende", "2027-03-13", 0]], "2027-03-13", "2027-03-19");
    expect(vorher.befunde.filter((x) => x.art === "ruhezeit")).toEqual([]);
  });
});

describe("IMP-6 Prüfung mit der bestehenden Planprüfung und den Dienstarten des Betriebs", () => {
  it("Ruhezeitverstoß im Modell (auch über das Zyklusende) und bei der Person", () => {
    const r = analyse({ "Kurzwechsel": ["S", "F", "-"] }, [["100", "Kurzwechsel", "2026-06-01", 0]], "2026-06-01", "2026-06-06");
    const mod = r.modelle[0].befunde.filter((b) => b.art === "ruhezeit");
    expect(mod.length).toBeGreaterThan(0);
    expect(mod[0]).toMatchObject({ quelle: "modell", modell: "Kurzwechsel", zyklusTag: 2, schwere: "warn" });
    expect(mod[0].text).toContain("8,0 h zwischen S");
    const per = r.befunde.filter((b) => b.quelle === "zuordnung" && b.art === "ruhezeit");
    expect(per.map((b) => b.datum)).toEqual(["2026-06-02", "2026-06-05"]);
    const z = r.zuordnungTabelle.datensaetze[0];
    expect(z.vorgabe).toBe("klaeren");
    expect(z.erlaubt).toEqual(["uebernehmen", "ueberspringen", "klaeren"]);
    /* Kein Auto-Fix: das Modell bleibt, wie es geliefert wurde. */
    expect(r.modelle[0].tage).toEqual(["da-S", "da-F", null]);
  });
  it("die Grenze kommt aus den Einstellungen des Betriebs (Ruhezeit 8 h → kein Befund)", () => {
    const r = analyse({ "Kurzwechsel": ["S", "F", "-"] }, null, "2026-06-01", "2026-06-06",
      { mandant: betrieb({ einstellungen: { ruhezeit: 8, maxFolge: 6, maxNachtFolge: 4 } }) });
    expect(r.befunde.filter((b) => b.art === "ruhezeit")).toEqual([]);
  });
  it("dasselbe Kürzel mit den Zeiten eines anderen Betriebs ergibt keinen Verstoß", () => {
    const andere = [da("F", "09:00", "17:00"), da("S", "12:00", "20:00")];
    const r = analyse({ "Kurzwechsel": ["S", "F", "-"] }, null, "2026-06-01", "2026-06-06", { mandant: betrieb({ dienstarten: andere }) });
    expect(r.ok).toBe(true);
    expect(r.befunde.filter((b) => b.art === "ruhezeit")).toEqual([]);
  });
  it("Dienste in Folge und Nachtdienste in Folge nach den Grenzen des Betriebs", () => {
    const r = analyse({ "Sieben": ["F", "F", "F", "F", "F", "F", "F", "-"], "Nächte": ["N", "N", "N", "N", "N", "-", "-", "-"] }, null,
      "2026-06-01", "2026-06-20");
    expect(r.modelle[0].befunde.map((b) => b.art)).toContain("folge");
    expect(r.modelle[1].befunde.map((b) => b.art)).toContain("nachtfolge");
    const locker = analyse({ "Sieben": ["F", "F", "F", "F", "F", "F", "F", "-"] }, null, "2026-06-01", "2026-06-20",
      { mandant: betrieb({ einstellungen: { ruhezeit: 11, maxFolge: 7, maxNachtFolge: 4 } }) });
    expect(locker.befunde.filter((b) => b.art === "folge")).toEqual([]);
  });
  it("fehlende Grenze im Betrieb: Grundwert und Hinweis statt stiller Nicht-Prüfung", () => {
    const r = analyse({ "Kurzwechsel": ["S", "F", "-"] }, null, "2026-06-01", "2026-06-06", { mandant: betrieb({ einstellungen: {} }) });
    expect(r.hinweise).toContainEqual({ art: "grundwert-verwendet", feld: "ruhezeit", wert: 11 });
    expect(r.befunde.filter((b) => b.art === "ruhezeit").length).toBeGreaterThan(0);
  });
  it("Merkmale der Person zählen: Nachtdienst trotz Einschränkung", () => {
    const m = betrieb();
    m.personen[0].einschraenkungen = { keineNacht: true };
    const r = analyse({ "Nacht": ["N", "-", "-"] }, [["100", "Nacht", "2026-06-01", 0]], "2026-06-01", "2026-06-03", { mandant: m });
    expect(r.befunde.some((b) => b.quelle === "zuordnung" && b.art === "einschraenkung" && b.personId === "p1")).toBe(true);
  });
});

describe("IMP-6 Konflikte statt stiller Ergänzung", () => {
  it("unbekannte Dienstart ist ein Zuordnungskonflikt; das Modell wird weder ausgerollt noch geprüft", () => {
    const r = analyse({ "Mit X": ["F", "X", "-"] }, [["100", "Mit X", "2026-06-01", 0]], "2026-06-01", "2026-06-10");
    expect(r.ok).toBe(true);
    const zeile = r.modellTabelle.datensaetze.find((d) => d.werte.dienst === "X");
    expect(zeile.konflikte).toEqual([{ art: "dienstart-unbekannt" }]);
    expect(r.modelle[0]).toMatchObject({ pruefbar: false, tage: [null, null, null] });
    expect(r.modelle[0].konflikte).toContainEqual({ art: "dienstart-unbekannt", datensaetze: [zeile.datensatz], tage: [2] });
    const z = r.zuordnungTabelle.datensaetze[0];
    expect(z.konflikte).toEqual([{ art: "modell-mit-konflikt" }]);
    expect(z.vorgabe).toBe("klaeren");
    expect(z.erlaubt).not.toContain("uebernehmen");
    expect(r.schichten).toEqual([]);
  });
  it("leere Dienstzelle und fehlender Tag sind Lücken, keine Freischicht", () => {
    const r = modelleLesen({ zeilen: [KOPF_M, ["L", 1, "F"], ["L", 2, ""], ["L", 4, "-"]], dienstarten: DIENSTE });
    expect(r.datensaetze[1].fehler).toEqual(["Dienst fehlt"]);
    expect(r.modelle[0].pruefbar).toBe(false);
    expect(r.modelle[0].konflikte.map((k) => k.art)).toEqual(expect.arrayContaining(["tag-fehlt", "datensatz-fehlerhaft"]));
    expect(r.modelle[0].konflikte.find((k) => k.art === "tag-fehlt")).toMatchObject({ tage: [3], anzahl: 1 });
  });
  it("doppelter Tag, unbekannte Person, unbekanntes Modell, mehrdeutiges Kürzel", () => {
    const zwei = [...DIENSTE, { ...da("F", "07:00", "15:00"), id: "da-F2" }];
    const m = modelleLesen({ zeilen: [KOPF_M, ["D", 1, "S"], ["D", 1, "S"], ["E", 1, "F"]], dienstarten: zwei });
    expect(m.modelle[0].konflikte.map((k) => k.art)).toContain("tag-doppelt");
    expect(m.modelle[1].konflikte.map((k) => k.art)).toContain("dienstart-mehrdeutig");
    const z = zuordnungenLesen({ zeilen: [KOPF_Z, ["999", "D", "2026-06-01", 0], ["100", "Gibt es nicht", "2026-06-01", 0]],
      personen: betrieb().personen, modelle: m.modelle });
    expect(z.datensaetze[0].konflikte).toContainEqual({ art: "person-unbekannt" });
    expect(z.datensaetze[1].konflikte).toContainEqual({ art: "modell-unbekannt" });
  });
  it("Fehlermeldungen nennen Felder, nie Werte", () => {
    const r = modelleLesen({ zeilen: [KOPF_M, ["Geheim", "abc", "F"]], dienstarten: DIENSTE });
    expect(JSON.stringify(r.datensaetze[0].fehler)).not.toContain("abc");
    expect(r.datensaetze[0].fehler).toEqual(["Tag ungültig"]);
  });
});

describe("IMP-6 Determinismus", () => {
  const MODELLE = { "A": ["S", "F", "-"], "B": ["N", "N", "-", "-", "F", "F", "-", "-", "-", "-"] };
  const ZU = [["100", "A", "2026-10-20", 1], ["200", "B", "2026-10-20", 4], ["300", "B", "2026-10-22", 0]];
  it("gleiche Eingabe → gleiches Ergebnis und gleicher Hash; der Bestand bleibt unverändert", () => {
    const m = betrieb();
    const vorher = JSON.stringify(m);
    const a = analyse(MODELLE, ZU, "2026-10-20", "2026-11-10", { mandant: m });
    const b = analyse(structuredClone(MODELLE), structuredClone(ZU), "2026-10-20", "2026-11-10", { mandant: structuredClone(m) });
    expect(a.ok).toBe(true);
    expect(b).toEqual(a);
    expect(b.hash).toBe(a.hash);
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(m)).toBe(vorher);
  });
  it("eine andere Eingabe ergibt einen anderen Hash", () => {
    const a = analyse(MODELLE, ZU, "2026-10-20", "2026-11-10");
    const b = analyse(MODELLE, [ZU[0], ZU[1], ["300", "B", "2026-10-22", 1]], "2026-10-20", "2026-11-10");
    expect(b.hash).not.toBe(a.hash);
  });
  it("ausrollen ist eine reine Funktion des Modells und des Datums", () => {
    const mo = modelleLesen({ zeilen: modellTabelle(MODELLE), dienstarten: DIENSTE }).modelle[1];
    const e = { modell: mo, beginn: "2026-10-20", versatz: 4, von: "2026-10-20", bis: "2026-11-30", dienstarten: DIENSTE };
    expect(ausrollen(e)).toEqual(ausrollen(structuredClone(e)));
  });
});

describe("IMP-6 Ressourcengrenze (technisch begründet, keine Geschäftsregel)", () => {
  it("Standardgrenze ist ein Rechenbudget von 20.000 Personentagen", () => {
    expect(SCHICHT_GRENZEN).toEqual({ pruefTage: 20000 });
    expect(grenzenAus({ pruefTage: -1, fremd: 5 })).toEqual({ pruefTage: 20000 });
    expect(grenzenAus({ pruefTage: 10 })).toEqual({ pruefTage: 10 });
  });
  it("genau an der Grenze geht, eins darüber nicht — ohne Teilergebnis", () => {
    /* 1 Modell à 7 Tagen (2 × 7 = 14) + 1 Person × 10 Tage = 24 Personentage. */
    const e = [{ "Woche": ["F", "F", "F", "F", "F", "-", "-"] }, [["100", "Woche", "2026-06-01", 0]], "2026-06-01", "2026-06-10"];
    expect(analyse(...e, { grenzen: { pruefTage: 24 } }).ok).toBe(true);
    const zuViel = analyse(...e, { grenzen: { pruefTage: 23 } });
    expect(zuViel).toEqual({ ok: false, code: "PRUEFUMFANG_ZU_GROSS", grenze: "pruefTage", wert: 24, hoechstens: 23,
      nachricht: "Die Prüfung wäre zu umfangreich. Bitte den Zeitraum verkürzen oder die Datei teilen." });
  });
  it("lange Zyklen sind zulässig, solange die Rechnung ins Budget passt (365 Tage)", () => {
    const jahr = Array.from({ length: 365 }, (_, i) => (i % 9 < 4 ? "T" : "-"));
    const r = analyse({ "Jahr": jahr }, [["100", "Jahr", "2026-01-01", 100]], "2026-01-01", "2026-01-31");
    expect(r.ok).toBe(true);
    expect(r.modelle[0]).toMatchObject({ laenge: 365, pruefbar: true });
    expect(schichtenVon(r, "p1")[0].zyklusTag).toBe(101);
  });
  it("ungültiger Zeitraum wird abgewiesen", () => {
    expect(analyse({ "A": ["F"] }, null, "2026-06-10", "2026-06-01").code).toBe("ZEITRAUM_UNGUELTIG");
    expect(analyse({ "A": ["F"] }, null, "2026-02-30", "2026-03-01").code).toBe("ZEITRAUM_UNGUELTIG");
  });
});
