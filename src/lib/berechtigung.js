/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { rechteDerRolle } from "./rollen.js";

/* ------------------------------ Berechtigung ------------------------------ */
export function darf(sitz, recht, einheitId) {
  if (!sitz || sitz.rolle === "betreiber") return false;
  /* RB-1: feste Rechte (plan.publish) nur aus MATRIX_STD, nie aus der betriebseigenen Tabelle. */
  const rechte = rechteDerRolle(sitz.mandant.matrix, sitz.person.rolle);
  if (!rechte.includes(recht)) return false;
  if (sitz.person.rolle === "betriebsrat" && /\.(edit|approve|assign|publish)/.test(recht)) return false;
  if (!einheitId) return true;
  if (sitz.person.bereich === "ALLE") return true;
  return sitz.person.bereich === einheitId;
}
