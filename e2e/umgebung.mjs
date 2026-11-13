/* WP-33 Teil 3: gemeinsame Festwerte der Playwright-Suite (e2e/). Nur 127.0.0.1, nie Staging oder Produktion. */
import { GERAETE_VIEWPORTS, GERAETE_VIEWPORTS_QUER } from "../src/ui/geraete.js";

export const PORT = Number(process.env.E2E_PORT || 3231);
export const BASIS = `http://127.0.0.1:${PORT}`;

/** Die acht Prüfviewports der Gerätematrix WP-21 (src/ui/geraete.js): fünf hoch bzw. Tablet, drei Telefone quer. */
export const VIEWPORTS = Object.freeze([...GERAETE_VIEWPORTS, ...GERAETE_VIEWPORTS_QUER]);

/** Rollen, für die global-setup.mjs synthetische Zugänge im Demo-Bestand (erfundene Personen) anlegt. */
export const ROLLEN = Object.freeze(["mitarbeiter", "subplaner", "planer", "leitung", "betriebsrat"]);

/** Umgebungsvariable, über die global-setup.mjs die Zugangscodes an die Testprozesse reicht (nie ausgegeben). */
export const ZUGAENGE_VAR = "CENTRIC_E2E_ZUGAENGE";

/** axe-Regelsätze für WCAG 2.2 Stufe AA (A und AA aus 2.0, 2.1 und 2.2). */
export const AXE_TAGS = Object.freeze(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22a", "wcag22aa"]);

/** Ab dieser Schwere schlägt ein Fund fehl (sofern nicht in e2e/axe-ausnahmen.json begründet). */
export const AXE_GATE = Object.freeze(["serious", "critical"]);
