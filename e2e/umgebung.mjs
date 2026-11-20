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

/** axe-Regelsätze für WCAG 2.2 Stufe AA (A und AA aus 2.0, 2.1 und 2.2). */
export const AXE_TAGS = Object.freeze(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22a", "wcag22aa"]);

/** Ab dieser Schwere schlägt ein Fund fehl (sofern nicht in e2e/axe-ausnahmen.json begründet). */
export const AXE_GATE = Object.freeze(["serious", "critical"]);
