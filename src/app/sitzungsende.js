/* Befund B-L4 (lokale E2E-Abnahme 2026-11-19, docs/acc45/LOKALE-E2E-ABNAHME-2026-11-19.md §4): Endet die Sitzung beim
   Server (Ablauf nach 30 min Ruhe oder 12 h, Abmelden oder Entzug an anderer Stelle), antwortet er mit 401. speicher.js
   räumt dann das Merkmal (abmelden(true)) und meldet das Ende hierher (beiSitzungsende).

   Vorher erfuhr die Oberfläche davon nichts: Beim Laden blieb sie auf dem Ladegerüst „CENTRIC wird geladen" stehen,
   erst ein zweites Neuladen zeigte die Anmeldung.

   Jetzt, kontrolliert:
   - Steht nichts aus (kein wartender, laufender oder gescheiterter Schreibvorgang, keine offene Konfliktfrage), lädt
     die Seite neu — wie beim Abmelden (app/abmelden.js). Damit ist kein Bestand mehr im Speicher oder in der Anzeige,
     auch nicht im Modulzustand von speicher.js; ohne Merkmal erscheint die Anmeldung, mit einem Hinweis, warum.
   - Steht etwas aus, wird NICHT neu geladen: Die Eingaben liegen nur in diesem Reiter. Der Schreibvorgang scheitert
     mit 401 und landet wie bisher in der Leiste „nicht gespeichert" (Lage „abgemeldet", src/ansichten/speicherlage.jsx):
     dort Anmeldung mit dem Zugangscode in diesem Reiter und Senden, oder „Als Datei sichern". Nichts wird still
     verworfen. */
import * as SP from "../speicher.js";
import { vergissSchutzkonflikte } from "../schutzkonflikte-hook.js";

/** Merker im Speicher des Reiters über das Neuladen hinweg (nur „ja", kein Inhalt). */
export const SITZUNGSENDE_MERKER = "centric:sitzungsende";
export const SITZUNGSENDE_HINWEIS = "Deine Sitzung ist beendet — abgelaufen oder an anderer Stelle abgemeldet. "
  + "Bitte melde dich erneut an.";

/**
 * Rein: Was folgt auf das Sitzungsende?
 * @param {{ schreibenAusstehend: boolean, ausstehend: boolean }} lage
 * @returns {"anmeldung" | "halten"}
 */
export function sitzungsendeFolge({ schreibenAusstehend, ausstehend }) {
  return schreibenAusstehend || ausstehend ? "halten" : "anmeldung";
}

const ablageDesReiters = () => { try { return typeof sessionStorage === "undefined" ? null : sessionStorage; } catch { return null; } };

/**
 * Wird von speicher.js gerufen, sobald eine Anfrage mit gültigem Merkmal 401 bekommt.
 * @param {{ sp?: any, neuLaden?: () => void, ablage?: any }} [abh]  nur für Prüfungen austauschbar
 * @returns {"anmeldung" | "halten"}
 */
export function sitzungsendeBehandeln({ sp = SP, neuLaden = () => window.location.reload(), ablage = ablageDesReiters() } = {}) {
  const folge = sitzungsendeFolge({ schreibenAusstehend: !!sp.schreibenAusstehend(), ausstehend: !!sp.ausstehend() });
  if (folge !== "anmeldung") return folge;
  /* Wie abmeldenMitHinweis: gemerkte Schutzkonflikte gehören zur Sitzung (WP-22b). */
  vergissSchutzkonflikte();
  try { if (ablage) ablage.setItem(SITZUNGSENDE_MERKER, "ja"); } catch { /* privater Modus: dann ohne Hinweis */ }
  neuLaden();
  return folge;
}

/** Einmal beim Start (src/main.jsx). @returns {() => void} */
export function sitzungsendeBeobachten(abh) {
  return SP.beiSitzungsende(() => { sitzungsendeBehandeln(abh); });
}

/** Der Hinweis für die Anmeldung nach dem Neuladen — genau einmal, danach ist der Merker weg. */
export function sitzungsendeHinweisAbholen(ablage = ablageDesReiters()) {
  try {
    if (!ablage || ablage.getItem(SITZUNGSENDE_MERKER) !== "ja") return null;
    ablage.removeItem(SITZUNGSENDE_MERKER);
    return SITZUNGSENDE_HINWEIS;
  } catch { return null; }
}
