/* ==========================================================================
   OFFENE PRÜFFÄLLE: VERHALTEN (Nachprüfung WP-17, A1, A2, A4)

   Statt Quelltext-Muster: echte Funktionen und Komponenten aus src/App.jsx,
   mit Daten, wie der Server sie der jeweiligen Rolle liefert.
   - A1  Beide Lohn-Exporte (Lohnausgabe-CSV, Zuschläge) fragen vor dem
         Download nach, solange im Monat Ist-Zeiten zur Prüfung offen sind.
   - A2  Vormonate mit offenen Fällen stehen im Hinweis (Abrechnungsdaten,
         Zwölf-Monats-Verlauf).
   - A4  Bestätigen nur für Leitung/Planung und nie für die eigene Zeit.
   ========================================================================== */
import { describe, it, expect, beforeAll } from "vitest";
import { appQuelle } from "./app-quelle.js";
import { readFile } from "node:fs/promises";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { bestandFuerRolle } from "../server/lib/rechte.mjs";
import { migriere } from "../src/migration.js";
import { personenAngleichen } from "../server/lib/gestalt.mjs";
import { ZUR_PRUEFUNG_TEXT, exportWarnung, vormonateMitPruefung } from "../src/istdaten.js";

const MONAT = "2026-11", FOLGE = "2026-12", TAG = "2026-11-02", VOR = "2026-10-05";
let A;
beforeAll(async () => { A = await import("../src/App.jsx"); }, 120000);

const lang = { start: "06:00", ende: "20:30", bestaetigt: false, grund: "LANGER_DIENST: 14,5 Stunden — bitte prüfen" };
function betrieb(erfassung) {
  const m = A.leererMandant("Prüffälle", "pflege");
  const e = m.einheiten[0].id;
  const da = m.dienstarten[0].id;
  m.personen = ["leitung", "subplaner", "mitarbeiter"].map((rolle, i) => ({ ...A.zugangsPerson(rolle, e, i + 1),
    id: rolle, vorname: "Test", nachname: rolle, eintritt: "2020-01-01", zugehoerigkeit: [{ ab: "2020-01-01", einheitId: e }] }));
  m.abweichungen = { [`mitarbeiter|${TAG}`]: da, [`mitarbeiter|${VOR}`]: da, [`leitung|${TAG}`]: da };
  m.erfassung = erfassung;
  m.einstempeln = {};
  return m;
}
function sitzFuer(m, rolle) {
  const mig = migriere({ version: 5, stand: 1, mandanten: [m] });
  if (!mig.ok) throw new Error(`Migration: ${mig.grund}`);
  const ms = bestandFuerRolle(personenAngleichen(mig.bestand), { rolle, person: rolle, betrieb: 0 }).mandanten[0];
  return { rolle: "kunde", db: { mandanten: [ms], session: { mandantId: ms.id, personId: rolle, rolle } }, mandant: ms,
    person: ms.personen.find((x) => x.id === rolle) };
}
const text = (el) => renderToStaticMarkup(el).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const akt = new Proxy({}, { get: () => () => {} });
const offen = () => betrieb({ [`mitarbeiter|${TAG}`]: lang, [`mitarbeiter|${VOR}`]: lang });

describe("Zählung und Lohnblatt", () => {
  it("istStunden zählt die Prüffälle des Monats", () => {
    const m = offen();
    const p = m.personen.find((x) => x.id === "mitarbeiter");
    expect(A.istStunden(m, p, MONAT).zurPruefung).toBe(1);
    expect(A.istStunden(m, p, "2026-10").zurPruefung).toBe(1);
    expect(A.istStunden(m, p, "2026-09").zurPruefung).toBe(0);
    expect(A.istStunden(betrieb({}), p, MONAT).zurPruefung).toBe(0);
  });
  it("Lohnblatt: Warnabschnitt mit Zeile je betroffenem Tag; ohne Fälle keiner", () => {
    const blatt = A.lohnausgabeText(offen(), MONAT);
    expect(blatt).toMatch(/ACHTUNG: 1 Ist-Zeit im November 2026 zur Prüfung/);
    expect(blatt).toContain(`${TAG}  mitarbeiter, Test: ${ZUR_PRUEFUNG_TEXT}`);
    expect(A.lohnausgabeText(betrieb({}), MONAT)).not.toContain("ACHTUNG");
  });
});

describe("A1: Exporte fragen nach", () => {
  it("exportWarnung: Rückfrage mit den Tagen; sonst null", () => {
    const w = exportWarnung(offen(), MONAT);
    expect(w).toMatch(/1 Ist-Zeit im November 2026 zur Prüfung/);
    expect(w).toContain(`Betroffen: ${TAG} (${ZUR_PRUEFUNG_TEXT}).`);
    expect(w).toMatch(/Trotzdem jetzt ausgeben\?$/);
    expect(exportWarnung(offen(), "2026-09")).toBeNull();
    expect(exportWarnung(betrieb({}), MONAT)).toBeNull();
  });
  it("Lohnausgabe-CSV und Zuschläge-Export rufen sie auf, bevor die Datei entsteht", async () => {
    const app = appQuelle();
    const z = app.slice(app.indexOf("exportZuschlaege: (ym2) => {"), app.indexOf("/* --- Ausgaben --- */"));
    expect(z.indexOf("exportWarnung(m, ym2)")).toBeGreaterThan(-1);
    expect(z.indexOf("window.confirm(warnung)")).toBeLessThan(z.indexOf("lade("));
    const d = app.slice(app.indexOf("exportDATEV: (ym) => {"), app.indexOf("exportLohnBlatt: (ym) => {"));
    expect(d.indexOf("exportWarnung(sitz.mandant, ym)")).toBeGreaterThan(-1);
    expect(d.indexOf("window.confirm(warnung)")).toBeLessThan(d.indexOf("datevCSV("));
  });
});

describe("A2: Vormonate", () => {
  it("vormonateMitPruefung: Vormonate mit offenen Fällen, nie der Monat selbst; je Person", () => {
    const m = offen();
    expect(vormonateMitPruefung(m, FOLGE).map((x) => [x.ym, x.anzahl])).toEqual([["2026-10", 1], ["2026-11", 1]]);
    expect(vormonateMitPruefung(m, MONAT).map((x) => x.ym)).toEqual(["2026-10"]);
    expect(vormonateMitPruefung(m, FOLGE, "leitung")).toEqual([]);
    expect(vormonateMitPruefung(m, FOLGE, "mitarbeiter")).toHaveLength(2);
  });
  it("Abrechnungsdaten (Leitung): Band mit „Zur Prüfliste“ und Export-Hinweis; im Folgemonat der Hinweis auf Vormonate", () => {
    const aktuell = text(h(A.Abrechnungsdaten, { sitz: sitzFuer(offen(), "leitung"), ym: MONAT, akt }));
    expect(aktuell).toContain("1 Ist-Zeit zur Prüfung · November 2026");
    expect(aktuell).toContain("Zur Prüfliste");
    expect(aktuell).toContain("fragen vor dem Download nach");
    const folge = text(h(A.Abrechnungsdaten, { sitz: sitzFuer(offen(), "leitung"), ym: FOLGE, akt }));
    expect(folge).toContain("Vormonate mit offenen Prüffällen");
    expect(folge).toContain("Oktober 2026 (1), November 2026 (1)");
    expect(text(h(A.Abrechnungsdaten, { sitz: sitzFuer(betrieb({}), "leitung"), ym: MONAT, akt }))).not.toContain("Prüffälle");
  });
});

describe("A4: Bestätigen nur mit Recht und nie die eigene Zeit", () => {
  it("Leitung: nur für die Zeit anderer; Schichtverantwortung: nie", () => {
    const m = betrieb({ [`mitarbeiter|${TAG}`]: lang, [`leitung|${TAG}`]: lang });
    const anzahl = (rolle) => (text(h(A.StempelBefunde, { sitz: sitzFuer(m, rolle), ym: MONAT, akt })).match(/Bestätigen/g) || []).length;
    expect(anzahl("leitung")).toBe(1);            // nur die Zeit von „mitarbeiter“
    expect(anzahl("subplaner")).toBe(0);
  });
});
