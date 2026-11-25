/* WP-33 Teil 3: gemeinsame Festwerte der Playwright-Suite (e2e/). Nur 127.0.0.1, nie Staging oder Produktion. */
import { GERAETE_VIEWPORTS, GERAETE_VIEWPORTS_QUER } from "../src/ui/geraete.js";

export const PORT = Number(process.env.E2E_PORT || 3231);
export const BASIS = `http://127.0.0.1:${PORT}`;

/** Die acht Prüfviewports der Gerätematrix WP-21 (src/ui/geraete.js): fünf hoch bzw. Tablet, drei Telefone quer. */
export const VIEWPORTS = Object.freeze([...GERAETE_VIEWPORTS, ...GERAETE_VIEWPORTS_QUER]);

/** Rollen, für die global-setup.mjs synthetische Zugänge im Demo-Bestand (erfundene Personen) anlegt. */
export const ROLLEN = Object.freeze(["mitarbeiter", "subplaner", "planer", "leitung", "betriebsrat"]);

/** Weitere Zugänge der Rolle Beschäftigte (je eine eigene Person) für die Stempeluhr der Abnahme B: ein Stand ohne
 *  Einstempeln und einer eingestempelt, unabhängig vom schreibenden Ablauf B7 (e2e/abnahme-b-ablaeufe.spec.mjs). */
export const ZUSATZ_ZUGAENGE = Object.freeze(["stempeluhr-ein", "stempeluhr-aus"]);

/** WP-48-GB (e2e/oeffnen-parallel.spec.mjs): frische Zugänge für Personen, die KEIN anderer Test anmeldet — ohne
 *  Tourzustand, damit ein Schreibvorgang beim bloßen Öffnen (etwa ein Tour-Selbststart) auch im Suite-Lauf auffällt.
 *  [Schlüssel, Rolle, Index unter den aktiven Personen der Rolle]; Index 0 hat der Rollenzugang, Mitarbeiter 1 und 2
 *  haben die Stempeluhr-Zugänge. */
export const OEFFNEN_ZUGAENGE = Object.freeze([["oeffnen-planer", "planer", 1], ["oeffnen-subplaner", "subplaner", 1],
  ["oeffnen-mitarbeiter", "mitarbeiter", 3]]);

/** ZEIT-F Rest (e2e/zeit-f-abnahme-b-zonen.spec.mjs): eine eigene Beschäftigte für B7 im Zonenprojekt. B7 stempelt ein
 *  UND aus; mit der Person der Rolle „mitarbeiter“ (B7 in 390x844) oder einem Stempeluhr-Zugang lägen zwei schreibende
 *  Abläufe auf demselben Stempel, je nach Reihenfolge der Projekte. Gleiche Form wie OEFFNEN_ZUGAENGE. */
export const ZONEN_ZUGAENGE = Object.freeze([["b7-zone", "mitarbeiter", 4]]);

/** Weitere Codes je Rolle für dieselbe Person (Pool). Befund CI #423 (2026-11-20): Der Server deckelt gelungene
 *  Anmeldungen je CODE auf 20 in 5 Minuten (Lastbremse „anmelden-code“, server/lib/schutz.mjs). Die Suite meldet die
 *  Planung an acht Viewports rund acht Mal je Viewport an; läuft sie zügig, überschreitet EIN Code die Grenze (429,
 *  danach 5 Minuten gesperrt). Je Test wird deshalb einer von ZUGANG_POOL Codes der Rolle gewählt (stabil je Test,
 *  e2e/herkunft.mjs codeSchluessel) — wie mehrere Geräte einer Person. Schlüssel: rolle, rolle~2 … rolle~N. */
export const ZUGANG_POOL = 4;

/** Umgebungsvariable, über die global-setup.mjs die Zugangscodes an die Testprozesse reicht (nie ausgegeben). */
export const ZUGAENGE_VAR = "CENTRIC_E2E_ZUGAENGE";

/** Umgebungsvariable mit dem synthetischen Betreibercode des Testservers (Abnahme Strang A legt damit eigene Betriebe an;
 *  nie ausgegeben). */
export const BETREIBER_VAR = "CENTRIC_E2E_BETREIBER";

/** WP-48-GB: Zahl der Räume, die global-setup.mjs angelegt hat (je Arbeiter einer, höchstens RAEUME_HOECHSTENS). */
export const RAEUME_VAR = "CENTRIC_E2E_RAEUME";
export const RAEUME_HOECHSTENS = 4;

/** WP-48-GB: Raum des laufenden Arbeiters. Playwright setzt TEST_PARALLEL_INDEX (0 … workers-1) in jedem Testprozess;
 *  global-setup.mjs legt je Index einen eigenen Raum an und reicht dessen Codes als <VAR>_<Index>. Hier werden sie, bevor
 *  irgendein Test sie liest, zu den gewohnten Variablen ZUGAENGE_VAR und BETREIBER_VAR — alle Specs und hilfen.mjs lesen
 *  unverändert diese. Fehlt der Raum des Index (mehr Arbeiter als Räume), werden die Variablen geleert: Die Tests scheitern
 *  dann mit „Kein Testzugang“, statt still in einem fremden Raum zu schreiben (echte Konflikte, siehe global-setup.mjs).
 *  Außerhalb eines Testprozesses (Konfiguration, global-setup.mjs, Prüfungen) geschieht nichts. */
export function arbeiterRaumWaehlen(umgebung = process.env) {
  const index = umgebung.TEST_PARALLEL_INDEX;
  if (index === undefined || index === "" || umgebung[RAEUME_VAR] === undefined) return null;
  for (const v of [ZUGAENGE_VAR, BETREIBER_VAR]) {
    const eigen = umgebung[`${v}_${index}`];
    if (eigen) umgebung[v] = eigen; else delete umgebung[v];
  }
  return Number(index);
}
arbeiterRaumWaehlen();

/** axe-Regelsätze für WCAG 2.2 Stufe AA (A und AA aus 2.0, 2.1 und 2.2). */
export const AXE_TAGS = Object.freeze(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22a", "wcag22aa"]);

/** Ab dieser Schwere schlägt ein Fund fehl (sofern nicht in e2e/axe-ausnahmen.json begründet). */
export const AXE_GATE = Object.freeze(["serious", "critical"]);
