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
import * as E from "../server/lib/regelbaukasten-erweitert.mjs";
import { regel } from "./regelregister.js";

export { REGELARTEN_GERECHNET, addMonate, zeitraum } from "../server/lib/regelbaukasten.mjs";
/* WP-I3: Muster-, Block-, Verteilungs-, Wunschregel (server/lib/regelbaukasten-erweitert.mjs). */
export { REGELARTEN_ALLE, wuenscheGeordnet, wochenendEreignisse } from "../server/lib/regelbaukasten-erweitert.mjs";

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
export const musterregel = (regelOderId, kontext) => E.musterregel(los(regelOderId), kontext);
/** @param {object|string} regelOderId @param {any} [kontext] */
export const blockregel = (regelOderId, kontext) => E.blockregel(los(regelOderId), kontext);
/** @param {object|string} regelOderId @param {any} [kontext] */
export const verteilungsregel = (regelOderId, kontext) => E.verteilungsregel(los(regelOderId), kontext);
/** @param {object|string} regelOderId @param {any} [kontext] */
export const wunschregel = (regelOderId, kontext) => E.wunschregel(los(regelOderId), kontext);
/** Zählregel über Wochenenden einer Art; siehe E.wochenendZaehlregel. */
export const wochenendZaehlregel = (regelOderId, art, kontext) => E.wochenendZaehlregel(los(regelOderId), art, kontext);
/** Testlauf einer Regel gegen mehrere Fälle, ohne Aktivierung. */
export const testlauf = (regelOderId, faelle) => E.testlauf(los(regelOderId), faelle);
/** Rechnet alle acht Regelarten (seit WP-I3). @param {object|string} regelOderId @param {any} [kontext] */
export const pruefeRegel = (regelOderId, kontext) => E.pruefeRegel(los(regelOderId), kontext);
