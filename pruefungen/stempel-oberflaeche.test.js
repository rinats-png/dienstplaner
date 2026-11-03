/* ==========================================================================
   STEMPELN IN DER OBERFLÄCHE NACH WP-17 (Review-Auflagen W1–W3)

   W1  Ein langer Dienst (über geplanter Dauer + 2 h) wird nicht automatisch
       bestätigt. Bis die Leitung bestätigt, zählt die Planzeit — aber nicht
       still: istZeitFuer meldet `zurPruefung`, die Stempelbefunde listen den
       Fall mit „Bestätigen" (Leitung/Planung, Vermerk im Protokoll).
   W2  Die lokale Kopie nach dem Stempeln liegt unter dem Tag, den der Server
       gewählt hat (erg.datum) — nicht unter dem Gerätedatum.
   W3  Nachtdienst von gestern ohne Einstempeln: Die Oberfläche bietet
       „Dienstende stempeln" an (dieselbe Regel wie der Server, F1).
   ========================================================================== */

import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { stempelVorgang, stempelSchluessel, MARKIERUNG_TEXT } from "../src/stempelvorgang.js";
import { istZeitFuer, erfassungenZurPruefung, zurPruefung, pruefHinweis, ZUR_PRUEFUNG_TEXT } from "../src/istdaten.js";

const person = { id: "a1", rolle: "mitarbeiter", zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }] };
const betrieb = (extra = {}) => ({ id: "m1", einheiten: [{ id: "e1" }], einstellungen: {}, abwesenheiten: [],
  dienstarten: [{ id: "N", start: "22:00", ende: "06:00" }, { id: "F", start: "06:00", ende: "14:00" }],
  abweichungen: {}, einstempeln: {}, erfassung: {}, ...extra });

describe("W3: „Dienstende stempeln“ für einen Nachtdienst ohne Einstempeln", () => {
  const HEUTE = "2026-11-03";
  it("gestern Nachtdienst geplant, kein Stempel, 06:30 → nachtEnde, Tag gestern", () => {
    const m = betrieb({ abweichungen: { "a1|2026-11-02": "N" } });
    const v = stempelVorgang(m, person, HEUTE, new Date("2026-11-03T05:30:00Z"));
    expect(v).toMatchObject({ datum: "2026-11-02", st: null, nachtEnde: true, offen: false });
  });
  it("… nicht mehr nach Dienstende + 4 h, nicht mit Stempel von gestern, nicht ohne Nachtdienst", () => {
    const m = betrieb({ abweichungen: { "a1|2026-11-02": "N" } });
    expect(stempelVorgang(m, person, HEUTE, new Date("2026-11-03T09:30:00Z")).nachtEnde).toBeUndefined();
    const mitStempel = betrieb({ abweichungen: { "a1|2026-11-02": "N" },
      einstempeln: { "a1|2026-11-02": { start: "22:00", ende: "06:00" } } });
    expect(stempelVorgang(mitStempel, person, HEUTE, new Date("2026-11-03T05:30:00Z")).nachtEnde).toBeUndefined();
    expect(stempelVorgang(betrieb(), person, HEUTE, new Date("2026-11-03T05:30:00Z")).nachtEnde).toBeUndefined();
  });
  it("Stempeluhr und mobile Stempelfläche bieten es an", async () => {
    const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
    expect((app.match(/nachtEnde/g) || []).length).toBeGreaterThanOrEqual(4);
    expect((app.match(/Dienstende stempeln/g) || []).length).toBeGreaterThanOrEqual(2);
  });
});

describe("W2: Schlüssel der lokalen Kopie", () => {
  it("der Tag vom Server, nicht der des Geräts", () => {
    expect(stempelSchluessel("a1", { datum: "2026-11-02" }, "2026-11-03")).toBe("a1|2026-11-02");
    expect(stempelSchluessel("a1", {}, "2026-11-03")).toBe("a1|2026-11-03");
  });
  it("App.jsx spiegelt mit stempelSchluessel", async () => {
    const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
    expect(app).toMatch(/const k = stempelSchluessel\(pid, erg, datum\);/);
    expect(app).not.toMatch(/const spiegeln = \(s2\) => \{[\s\S]{0,200}const k = `\$\{pid\}\|\$\{datum\}`/);
  });
});

describe("W1: langer Dienst zur Prüfung — nicht still", () => {
  const e = { start: "06:00", ende: "20:30", bestaetigt: false, grund: "LANGER_DIENST: 14,5 Stunden — bitte prüfen" };
  const m = betrieb({ erfassung: { "a1|2026-11-02": e, "a1|2026-11-01": { start: "06:00", ende: "14:00", bestaetigt: true, grund: "" } } });
  it("istZeitFuer: Planzeit, aber zurPruefung", () => {
    const r = istZeitFuer(m, person, "2026-11-02", { start: "06:00", ende: "14:00", pause: 0 });
    expect(r).toMatchObject({ erfasst: false, zurPruefung: true });
    expect(r.std).toBe(8);
    expect(istZeitFuer(m, person, "2026-11-01", { start: "06:00", ende: "14:00", pause: 0 }).zurPruefung).toBeUndefined();
  });
  it("erfassungenZurPruefung listet genau diese Fälle des Monats", () => {
    expect(zurPruefung(e)).toBe(true);
    expect(erfassungenZurPruefung(m, "2026-11")).toEqual([{ personId: "a1", datum: "2026-11-02", erfassung: e }]);
    expect(erfassungenZurPruefung(m, "2026-10")).toEqual([]);
  });
  it("Stempelbefunde: Liste zur Prüfung mit „Bestätigen“ (Leitung/Planung), Vermerk im Protokoll", async () => {
    const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
    expect(app).toMatch(/erfassungenZurPruefung\(m, ym\)/);
    expect(app).toMatch(/akt\.langerDienstBestaetigen\(personId, datum\)/);
    /* Seit WP-06 als Korrekturereignis über den Server (Vermerk: Ereignis am
       Stempel und Betriebsprotokoll „Stempelkorrektur"), nicht mehr mUpd. */
    expect(app).toMatch(/langerDienstBestaetigen: \(pid, d\) => \{/);
    expect(app).toMatch(/return akt\.stempelKorrigieren\(pid, d, e\.start, e\.ende, "Langer Dienst geprüft und bestätigt"\);/);
    expect(app).toMatch(/const erg = await SP\.stempelKorrektur\(pid, d, start, ende, grund\);/);
    expect(MARKIERUNG_TEXT.LANGER_DIENST).toBeTruthy();
  });
});

/* Nachprüfung WP-17 (2): Solange im Monat Ist-Zeiten zur Prüfung offen sind,
   sagen Lohnausgabe, Stundenkonto und Export es — vorher ging der Lohnexport
   still mit der Planzeit hinaus. (3): Bestätigen nur Leitung/Planung, nie
   die eigene Zeit. */
describe("W1-Rest: Ist-Zeiten zur Prüfung in Lohnausgabe, Konto und Export", () => {
  const lang = { start: "06:00", ende: "20:30", bestaetigt: false, grund: "LANGER_DIENST: 14,5 Stunden — bitte prüfen" };
  const m = betrieb({ erfassung: { "a1|2026-11-02": lang, "b2|2026-11-05": lang,
    "a1|2026-11-03": { start: "06:00", ende: "14:00", bestaetigt: true, grund: "" } } });
  it("pruefHinweis: Monat, Anzahl, Fälle; je Person; ohne Fälle null", () => {
    const h = pruefHinweis(m, "2026-11");
    expect(h).toMatchObject({ anzahl: 2, monat: "November 2026",
      faelle: [{ personId: "a1", datum: "2026-11-02" }, { personId: "b2", datum: "2026-11-05" }] });
    expect(h.text).toMatch(/2 Ist-Zeiten im November 2026 zur Prüfung/);
    expect(h.text).toMatch(/vorläufig die Planzeiten/);
    expect(pruefHinweis(m, "2026-11", "a1").anzahl).toBe(1);
    expect(pruefHinweis(m, "2026-11", "c3")).toBeNull();
    expect(pruefHinweis(m, "2026-10")).toBeNull();
    expect(ZUR_PRUEFUNG_TEXT).toBe("zur Prüfung, Planzeit vorläufig");
  });
  it("App: istStunden zählt, Lohnblatt kennzeichnet je Tag, CSV warnt vor dem Download, Band in Abrechnung und Konto", async () => {
    const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
    const ist = app.slice(app.indexOf("function istStunden("), app.indexOf("§ 3 ArbZG"));
    expect(ist).toMatch(/if \(idn\.zurPruefung\) pruefFaelle\+\+;/);
    expect(ist).toMatch(/zurPruefung: pruefFaelle \}/);
    const blatt = app.slice(app.indexOf("function lohnausgabeText("), app.indexOf("BELASTBARKEIT UND ENTSCHEIDUNG"));
    expect(blatt).toMatch(/\.\.\.lohnPruefZeilen\(m, ym\)/);
    expect(app).toMatch(/h\.faelle\.map\(\(f\) => `  \$\{f\.datum\}  \$\{nameVon\(f\.personId\)\}: \$\{ZUR_PRUEFUNG_TEXT\}`\)/);
    const csv = app.slice(app.indexOf("exportDATEV: (ym) => {"), app.indexOf("exportLohnBlatt: (ym) => {"));
    expect(csv.indexOf("exportWarnung(sitz.mandant, ym)")).toBeGreaterThan(-1);
    expect(csv.indexOf("window.confirm")).toBeGreaterThan(-1);
    expect(csv.indexOf("window.confirm")).toBeLessThan(csv.indexOf("datevCSV(sitz.mandant, ym)"));
    const abr = app.slice(app.indexOf("function Abrechnungsdaten("), app.indexOf("function Lohnausgabe("));
    expect(abr).toMatch(/pruefHinweis\(m, ym\)/);
    expect(abr).toMatch(/onClick=\{\(\) => setReiter\("stempel"\)\}>Zur Prüfliste/);
    expect(app).toMatch(/pruefHinweis\(m, ym, p\.id\)/);       // Personalakte, Stundenkonto
    expect(app).toMatch(/pruefHinweis\(m, ym, ich\.id\)/);     // Mein Stundenkonto
    expect(app).toMatch(/status: zurPruefung\(v\) \? ZUR_PRUEFUNG_TEXT/);  // Gesamtexport
  });
  it("Bestätigen: nur staff.edit (nicht Schichtverantwortung), nie die eigene Zeit", async () => {
    const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
    const sb = app.slice(app.indexOf("function StempelBefunde("), app.indexOf("function Abrechnungsdaten("));
    expect(sb.length).toBeGreaterThan(100);
    expect(sb).toMatch(/const darfBestaetigen = darf\(sitz, "staff\.edit"\);/);
    expect(sb).not.toMatch(/plan\.edit\.unit/);
    expect(sb).toMatch(/darfBestaetigen && akt && String\(personId\) !== eigene && \(/);
  });
});
