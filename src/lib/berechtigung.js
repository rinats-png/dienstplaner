/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { MATRIX_STD } from "./rollen.js";

/* ------------------------------ Berechtigung ------------------------------ */
export function darf(sitz, recht, einheitId) {
  if (!sitz || sitz.rolle === "betreiber") return false;
  const rechte = (sitz.mandant.matrix || MATRIX_STD)[sitz.person.rolle] || [];
  if (!rechte.includes(recht)) return false;
  if (sitz.person.rolle === "betriebsrat" && /\.(edit|approve|assign)/.test(recht)) return false;
  if (!einheitId) return true;
  if (sitz.person.bereich === "ALLE") return true;
  return sitz.person.bereich === einheitId;
}
