/* Fester Port, damit Konfiguration, Aufbau und Testprozesse dieselbe Adresse
   kennen (die Konfiguration wird in jedem Prozess neu ausgewertet). */
export const PORT = Number(process.env.E2E_PORT) || 3917;
export const BASIS = `http://127.0.0.1:${PORT}`;
export const ERGEBNISSE = "e2e/ergebnisse";
