/* Planungsassistent: Klartext zu den Gründen, mit denen planeMonat eine Stelle offen lässt.
   Eine Quelle für die Oberfläche (src/ansichten/assistent.jsx) und den Selbsttest (src/pruefung.jsx):
   dieselben Gründe, dieselben Texte. Reine Texte, keine Personenbezüge, keine Rechenlogik.
   Gründe kommen aus planeMonat (src/lib/fachlogik.js): vorgabe, aufwand, verdraengung, folgeVorwaerts und die
   Planbefunde nachtfolge, ersatzruhe, sonntagsfrei. Unbekannt oder leer: fail-closed, nie „frei“. */

const GRUND_UNBEKANNT = "Grund nicht bewertbar – Stelle bleibt offen";

/** Grund → Klartext für Leitung/Planung. Gesetzlich (§ 11 ArbZG) und betrieblich (Einstellung) getrennt benannt. */
const GRUENDE = Object.freeze({
  verdraengung: "Die Einteilung würde eine andere Person aus ihrem Dienst verdrängen (Posten) und dort eine Regel verletzen oder ist nicht prüfbar – Stelle bleibt offen",
  folgeVorwaerts: "Die Einteilung würde die Dienste in Folge an den Tagen danach über die Grenze verlängern oder ein Folgedienst ist nicht prüfbar (Dienst unbekannt) – Stelle bleibt offen",
  nachtfolge: "Zu viele Nachtdienste in Folge (betriebliche Grenze) oder Grenze nicht bewertbar – Stelle bleibt offen",
  ersatzruhe: "Ersatzruhetag nach Sonntags- oder Feiertagsarbeit wäre nicht gesichert (§ 11 Abs. 3 ArbZG) oder nicht bewertbar – Stelle bleibt offen",
  sonntagsfrei: "Weniger als 15 freie Sonntage im Jahr (§ 11 Abs. 1 ArbZG) – Stelle bleibt offen",
  aufwand: "Rechenbudget erreicht – Stelle bleibt offen",
  vorgabe: "Rechenbudget der Vorgaben erreicht – Stelle bleibt offen",
});

/** Klartext zu einem Grund; für jeden anderen Wert (unbekannt, leer, kein Text) die neutrale Anzeige – nie leer. */
export function grundText(grund) {
  return typeof grund === "string" && Object.hasOwn(GRUENDE, grund) ? GRUENDE[grund] : GRUND_UNBEKANNT;
}

/** Zeile einer offenen Stelle: „2 fehlen · Qualifikation fehlt“, mit Grund: „… · <Klartext>“.
 *  Ohne Feld grund (niemand einsetzbar) bleibt die Zeile wie bisher; ein vorhandenes, aber unlesbares Feld zeigt „Grund nicht bewertbar“. */
export function offenText(o) {
  const teile = [];
  if (o.fehlt > 0) teile.push(`${o.fehlt} fehlen`);
  if (o.qualFehlt) teile.push("Qualifikation fehlt");
  if (o.grund !== undefined) teile.push(grundText(o.grund));
  return teile.join(" · ");
}
