/* ==========================================================================
   BRANCHENBEFUNDE — Befunde aktiver Branchenmodule zu einem Dienst (WP-19, A2)

   Sammelt, was die Branchenmodule zu einem Dienst an einem Tag melden, in
   der Form von einteilungsBefunde (server/lib/fachpruefung.mjs): Befundart
   „branche", höchstens Hinweis, sperrt nie (BEFUND_KATALOG.branche).

   Ein Modul liefert nur, wenn es im Betrieb aktiv ist (modulAktiv in
   server/lib/branchenmodule.mjs) — sonst nichts. Gerechnet wird mit dem
   Regelbaukasten (server/lib/regelbaukasten.mjs) und dem Kompetenzstand des
   Regelwerks (server/lib/regelwerk.mjs): keine eigene Prüfmaschine.

   Die Besetzung des Dienstes kennt nur der Aufrufer (personenImDienst):
   die Oberfläche aus ihrem vollständigen Plan. Die Nachrechnung des
   Servers (schutzdurchsetzung.mjs, in Häppchen) reicht sie nicht herein
   und rechnet deshalb keine Branchenbefunde — sie setzt nur sperrende und
   bestätigungspflichtige Regeln durch, und „branche" ist keine davon.

   Ein geprüfter Regelwert des Betriebs (einstellungen.regelwerte, WP-19.0)
   hebt einen Befund auf „Achtung“ (regelwertAnwenden) — nie auf „recht“.

   Rein: keine Ablage, keine Uhr.
   ========================================================================== */
import { BRANCHENMODULE, regelwertAnwenden } from "./branchenmodule.mjs";
import { pruefeRegel } from "./regelbaukasten.mjs";
import { kompetenzStand } from "./regelwerk.mjs";
import { anlagenBefunde } from "./modul-anlagen.mjs";
import { maschinenqualBefunde } from "./modul-maschinenqual.mjs";
import { geteilterdienstBefunde } from "./modul-geteilterdienst.mjs";
import { postenBefunde } from "./modul-posten.mjs";
import { bereichsplanBefunde } from "./modul-bereichsplan.mjs";

/**
 * Die Befunde aktiver Branchenmodule zu Dienstart `da` am Tag `d`.
 * @param {any} m Betrieb
 * @param {any} da Dienstart
 * @param {string} d Tag JJJJ-MM-TT
 * @param {{ personenImDienst: (d: string, daId: any) => any[], person?: any, dienstAm?: (p: any, d: string) => any, qualGueltig?: (m: any, p: any, qid: string, heute: string) => boolean, einheitAm?: (p: any, d: string) => any, heute?: string, module?: readonly any[] }} o
 */
export function branchenBefunde(m, da, d, { personenImDienst, person, dienstAm, qualGueltig, einheitAm, heute, module = BRANCHENMODULE }) {
  if (!m || !da || typeof personenImDienst !== "function") return [];
  const personen = (personenImDienst(d, da.id) || []).filter((p) => p && typeof p === "object");
  const auswerten = (r, kontext) => pruefeRegel(r, kontext);
  /* Betriebliche Regelwerte (WP-19.0, G4): ein geprüfter Wert mit Quelle hebt einen Hinweis auf
     „Achtung“ — nie höher, nie eine Sperre (Befundart „branche“ sperrt nicht). */
  return [
    ...anlagenBefunde(m, d, da.id, personen.map((p) => ({ id: p.id, merkmale: [] })), { auswerten, module }),
    ...maschinenqualBefunde(m, d, da.id, personen, { auswerten, stand: kompetenzStand, module }),
    ...geteilterdienstBefunde(m, da, d, { person, dienstAm, auswerten, module }),
    ...(typeof einheitAm === "function" ? bereichsplanBefunde(m, da, d, person, personen, { auswerten, einheitAm, module }) : []),
    ...(typeof qualGueltig === "function" ? postenBefunde(m, da, d, person, personen, { auswerten, qualGueltig, heute: heute || d, module }) : []),
  ].map((b) => regelwertAnwenden(m, b, d));
}
