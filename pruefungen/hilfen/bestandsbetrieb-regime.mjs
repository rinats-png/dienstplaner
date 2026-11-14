/* ==========================================================================
   NUR FÜR PRÜFUNGEN — einen Betrieb in den Zustand „vor A-3 angelegt“ versetzen

   Ein Bestandsbetrieb (angelegt vor PR #281) hat weder die Regime-Marke
   `erstleitung-regime:<raum>:<mandantId>` in der Ablage noch den Eintrag
   `regime` im Widerrufbuch (Kopplung E-M6 × #281, Review C1). Prüfungen, die
   einen solchen Betrieb über den heutigen Anlageweg erzeugen, entfernen
   deshalb BEIDES: die Marke (Aufrufer) und hier den Bucheintrag. Das Buch wird
   mit dem Pfeffer des Prüfprozesses neu gesiegelt (derselbe wie der des
   Servers). Produktionscode kennt keinen solchen Weg — das Buch wird dort nur
   fortgeschrieben.
   ========================================================================== */

/**
 * @param {string} raum
 * @param {string[]} ids  Betriebskennungen
 */
export async function regimeAusBuchEntfernen(raum, ids) {
  const W = await import("../../server/lib/widerrufbuch.mjs");
  const { zustandsVerzeichnis } = await import("../../server/lib/schluesselepoche.mjs");
  const verz = zustandsVerzeichnis();
  const b = await W.buchLesen(verz);
  if (!b) return;
  for (const id of ids) delete b.regime[W.betriebsKennung(raum, id)];
  await W.buchSchreiben(verz, b);
  W.widerrufbuchVergessen();
}
