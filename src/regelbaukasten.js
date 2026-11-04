/* ==========================================================================
   REGELBAUKASTEN — Weiterleitung

   Der Regelbaukasten (zaehlregel, grenzregel, besetzungsregel, paarregel)
   steht seit WP-19 (Andockpunkt A3) in server/lib/regelbaukasten.mjs, damit
   der Server Branchenregeln mit derselben Rechnung bewertet wie die
   Oberfläche — eine Fassung, keine zweite Maschine (wie regelwerk.mjs in
   WP-22; das Serverbild enthält kein src/).

   Diese Datei reicht weiter. Einziger Unterschied: Eine Kennung statt eines
   Regelobjekts löst sie hier über das ganze Regelregister auf
   (src/regelregister.js); der Server kennt nur die Branchenregeln. Was nicht
   im Register steht, geht als Kennung weiter und wirft dort dieselbe Meldung
   wie bisher.
   ========================================================================== */
import * as S from "../server/lib/regelbaukasten.mjs";
import { regel } from "./regelregister.js";

export { REGELARTEN_GERECHNET, addMonate, zeitraum } from "../server/lib/regelbaukasten.mjs";

const los = (x) => (typeof x === "string" ? (regel(x) || x) : x);

/** @param {object|string} regelOderId @param {any} [kontext] */
export const zaehlregel = (regelOderId, kontext) => S.zaehlregel(los(regelOderId), kontext);
/** @param {object|string} regelOderId @param {any} [kontext] */
export const grenzregel = (regelOderId, kontext) => S.grenzregel(los(regelOderId), kontext);
/** @param {object|string} regelOderId @param {any} [kontext] */
export const besetzungsregel = (regelOderId, kontext) => S.besetzungsregel(los(regelOderId), kontext);
/** @param {object|string} regelOderId @param {any} [kontext] */
export const paarregel = (regelOderId, kontext) => S.paarregel(los(regelOderId), kontext);
/** @param {object|string} regelOderId @param {any} [kontext] */
export const pruefeRegel = (regelOderId, kontext) => S.pruefeRegel(los(regelOderId), kontext);
