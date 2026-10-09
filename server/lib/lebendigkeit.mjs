/* ==========================================================================
   LEBENDIGKEIT — wann ist eine Sitzung abgelaufen? Reine Funktionen.

   Diese Regel gab es zweimal: in sitzungen.mjs (Arbeitssitzungen) und in
   accountsitzungen.mjs (Account-Sitzungen), jeweils mit einer kleinen
   Abweichung. Und sie wird ein drittes Mal gebraucht, von jedem, der
   aufräumt: Ein Aufräumlauf, der „abgelaufen" anders versteht als der
   Zugriff, löscht entweder Gültiges oder lässt Totes liegen.

   Deshalb steht sie hier, einmal, ohne Ablage und ohne Uhr. Wer eine Zeit
   braucht, bekommt sie als Argument; wer lesen oder löschen will, tut das
   selbst. Diese Datei kennt weder einen Speicher noch einen Schlüssel noch
   einen Account.

   ---------------------------------------------------------------------------
   Die beiden Lesarten

   `streng`   Ein Datensatz ohne brauchbares Ende gilt als abgelaufen. So
              hält es die Account-Sitzung: Ein Datensatz ohne Frist darf
              nicht ewig leben.
   `locker`   Ein Datensatz ohne brauchbares Ende läuft nicht ab. So hat es
              die Arbeitssitzung immer gehalten (`s.bis < nun` ist bei
              fehlendem `bis` falsch). Das bleibt, damit dieser Umbau nichts
              am Verhalten ändert; ein Aufräumlauf behandelt so einen
              Datensatz als „unklar" und löscht ihn nicht.

   Das Ende selbst gehört noch zur Gültigkeit; erst danach ist Schluss.

   ---------------------------------------------------------------------------
   Aktivität

   Der Zeitpunkt des letzten Zugriffs steht im Datensatz (`zuletzt`) und —
   wo er getrennt geführt wird — in einem Aktivitätsdatensatz. Gilt der
   spätere von beiden. Ein Aktivitätsdatensatz kann eine Sitzung nur
   verlängern, nie berechtigen: Ob es die Sitzung überhaupt gibt, steht im
   Datensatz mit der Autorität, und den fragt der Aufrufer zuerst.

   ---------------------------------------------------------------------------
   Karenz

   Ein Aufräumlauf löscht nur, was seit mindestens `karenz` Millisekunden
   tot ist. Ein Zugriff, der gerade im Gang ist, verlängert die Sitzung
   erst nach dem Lesen; die Karenz sorgt dafür, dass der Lauf nie gegen
   diesen Zugriff gewinnt. Der Zugriff selbst rechnet mit Karenz 0.
   ========================================================================== */

/** Die Verlängerung wird höchstens einmal je Minute geschrieben. */
export const VERLAENGERN_AB = 60 * 1000;

/**
 * @typedef {{ abgelaufen: boolean, grund: ("frist"|"untaetig"|null),
 *   unklar: boolean }} Urteil
 */

/**
 * Der letzte bekannte Zugriff: der spätere von Datensatz und Aktivität.
 * Null (0) heißt: keiner bekannt.
 *
 * @param {{zuletzt?: unknown}|null|undefined} satz
 * @param {{zuletzt?: unknown}|null|undefined} [aktivitaet]
 * @returns {number}
 */
export function letzteAktivitaet(satz, aktivitaet = null) {
  const a = Number(satz && satz.zuletzt) || 0;
  const b = Number(aktivitaet && aktivitaet.zuletzt) || 0;
  return Math.max(a, b);
}

/**
 * Ist die Sitzung abgelaufen?
 *
 * Erst die absolute Frist, dann die Untätigkeit — in dieser Reihenfolge, weil
 * der Grund im Protokoll und in den Tests dieselbe Auskunft gibt wie vorher.
 *
 * @param {{bis?: unknown, zuletzt?: unknown}} satz
 * @param {number} nun  Millisekunden
 * @param {{streng: boolean, ruhe: number,
 *   aktivitaet?: ({zuletzt?: unknown}|null), karenz?: number}} o
 * @returns {Urteil}
 */
export function ablaufUrteil(satz, nun, { streng, ruhe, aktivitaet = null, karenz = 0 }) {
  const bis = Number(satz && satz.bis);
  const brauchbar = Number.isFinite(bis);
  if (streng && !brauchbar) return { abgelaufen: true, grund: "frist", unklar: false };
  if (brauchbar && bis + karenz < nun) return { abgelaufen: true, grund: "frist", unklar: false };

  const letzte = letzteAktivitaet(satz, aktivitaet);
  if (letzte && nun - letzte > ruhe + karenz)
    return { abgelaufen: true, grund: "untaetig", unklar: false };

  return { abgelaufen: false, grund: null, unklar: !streng && !brauchbar };
}

/**
 * Ist eine Verlängerung fällig? Ohne bekannten Zugriff immer; sonst, wenn der
 * letzte länger als eine Minute zurückliegt. Nicht bei jedem Zugriff: Ein
 * Mensch, der arbeitet, erzeugt sonst hunderte Schreibvorgänge je Stunde.
 *
 * @param {{zuletzt?: unknown}|null|undefined} satz
 * @param {{zuletzt?: unknown}|null|undefined} aktivitaet
 * @param {number} nun
 * @returns {boolean}
 */
export function verlaengernFaellig(satz, aktivitaet, nun) {
  const letzte = letzteAktivitaet(satz, aktivitaet);
  return !letzte || nun - letzte > VERLAENGERN_AB;
}
