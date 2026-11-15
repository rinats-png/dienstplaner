/* QS-ZEIT: Uhr des Testservers auf die gemeinsame Zeitbasis der Playwright-Suite stellen (e2e/zeitbasis.mjs).
   Wird NUR von e2e/global-setup.mjs geladen (node --import … server.mjs) — nie im Image, nie in Staging oder Produktion.
   Fail-closed: unter NODE_ENV=production bricht der Start ab, statt eine versetzte Uhr zu fahren. */
import { uhrVersetzen, UHR_VERSATZ_VAR } from "./zeitbasis.mjs";

if (process.env.NODE_ENV === "production") throw new Error("e2e/uhr-vorlauf.mjs ist nur für den lokalen Testserver.");
uhrVersetzen(process.env[UHR_VERSATZ_VAR]);
