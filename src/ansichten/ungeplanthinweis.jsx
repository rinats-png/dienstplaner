/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { istUngeplant, UNGEPLANT_ABWESEND_TEXT } from "../istdaten.js";
import { postenBesatzung as eingefrorenerTag } from "../../server/lib/isteinfrieren.mjs";
import { istTag, ungeplantAm, istDauer, abwesenheitAm } from "../lib/fachlogik.js";
import { Rubrik } from "../ui/bausteine.jsx";
import { NUM } from "../ui/thema.js";
import { n1 } from "../lib/format.js";
import { C } from "../farben.js";

/**
 * Der eigene Dienst heute mit der Stempeluhr — am Rechner das Gegenstück zur
 * Karte in MHeute. Sichtbar bei geplantem Dienst und bei jedem offenen Beginn
 * (stempelVorgang: auch ohne Plan, auch vom Vortag). Ob jemand stempelt,
 * entscheidet dasselbe wie überall: Die Person steht im Schichtdienst
 * (`vorgang` ist sonst null), und /api/stempeln nimmt nur die eigene Person
 * der Sitzung an. Geo, 20-Stunden-Grenze und Doppelstart regeln Stempeluhr
 * und Server — hier entsteht keine eigene Logik.
 */
/**
 * Der heute gestempelte Dienst ohne Plan (WP-13) in Worten: Zeiten, ob die
 * Leitung ihn schon bestätigt hat, und was daraus im Stundenkonto wird. Ohne
 * so einen Dienst null.
 */
export function UngeplantHinweis({ m, p, d, ...rest }) {
  const e = p ? (m.erfassung || {})[`${p.id}|${d}`] : null;
  if (!istUngeplant(e)) return null;
  /* Abgeschlossener Monat: die eingefrorene Dauer (WP-16, Review H1). */
  const tz = eingefrorenerTag(m, p, d) !== undefined ? istTag(m, p, d) : null;
  const da = tz ? (tz.da && tz.da.ungeplant ? tz.da : null) : e.bestaetigt ? ungeplantAm(m, p, d) : null;
  const std = da ? (tz ? tz.idn.std : istDauer(m, p, d, da).std) : null;
  /* C1: An einem Tag mit Abwesenheit zählt auch ein bestätigter ungeplanter Dienst nicht (Konto, Lohn). */
  const abwesend = !!abwesenheitAm(m, p.id, d);
  return (
    <div {...rest}>
      <Rubrik>Ungeplanter Dienst</Rubrik>
      <div style={{ fontSize: 21, fontWeight: 600, marginTop: 5, ...NUM }}>{e.start}–{e.ende}{std !== null ? ` · ${n1(std)} h` : ""}</div>
      <div style={{ fontSize: 14, color: C.dim, marginTop: 3, lineHeight: 1.45 }}>
        {e.bestaetigt
          ? (abwesend ? `Von der Leitung bestätigt — ${UNGEPLANT_ABWESEND_TEXT}.` : "Von der Leitung bestätigt — zählt im Stundenkonto.")
          : (abwesend
            ? "Ohne geplanten Dienst gestempelt, an einem Tag mit Abwesenheit. Die Leitung prüft die Zeit; sie zählt auch nach der Bestätigung nicht im Stundenkonto."
            : "Ohne geplanten Dienst gestempelt. Die Leitung prüft die Zeit; erst nach ihrer Bestätigung zählt sie im Stundenkonto.")}</div>
    </div>);
}
