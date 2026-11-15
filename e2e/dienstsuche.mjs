/* QS-ZEIT: Tagsuche für schreibende Abnahmeabläufe, unabhängig von Uhrzeit, Wochentag, Schichtzyklus und Zeitzone.

   Gegen einen fremden Container (Staging-Gate, E2E_EXTERN_ADMIN) lässt sich die Uhr nicht stellen; der Tag „heute + 3“ kann
   dort auf eine Ruhezeitsperre (11 h, § 5 ArbZG) treffen, weil die Schichtfolge des Demo-Bestands am Kalender hängt.
   Statt eines festen Versatzes geht die Suche vom Berliner Betriebstag des ZIELSERVERS aus (nicht von der Uhr des Testrechners)
   und fragt die Planungsregeln des Servers: Der erste Tag, den der Server annimmt, wird genommen. Die Regel selbst bleibt
   unberührt: Nur eine Sperre mit der Ruhezeitmeldung führt zum nächsten Tag, jede andere Antwort bricht ab. */

/** Höchstzahl geprüfter Tage: mehr als ein ganzer Schichtzyklus (Vorlage v5: 35 Tage), also immer ein freier Vortag dabei. */
export const SUCHTAGE_MAX = 45;

/** Ist die Antwort die Ruhezeitsperre der Planung? (Text des Servers, siehe server/lib/schutzdurchsetzung.mjs) */
export const istRuhezeitSperre = (text) => /Einteilung am \d{4}-\d{2}-\d{2} nicht möglich: Ruhezeit unter 11 Stunden/.test(String(text || ""));

/** Kalendertag n Tage nach `iso` (UTC-Mittag, frei von Zeitumstellung). */
const plusTage = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

/**
 * Sucht ab `basis + ab` den ersten Tag, an dem `versuche(tag)` den Dienst annimmt.
 * @param {string} basis Berliner Betriebstag des Zielservers (YYYY-MM-DD)
 * @param {(tag: string) => Promise<{ ok: boolean, text?: string }> | { ok: boolean, text?: string }} versuche
 *   trägt den Dienst ein; ok = angenommen. Eine abgewiesene Eintragung darf nichts speichern.
 * @param {{ ab?: number, max?: number }} [opt]
 * @returns {Promise<{ tag: string, abgelehnt: string[] }>}
 */
export async function sucheDiensttag(basis, versuche, { ab = 3, max = SUCHTAGE_MAX } = {}) {
  const abgelehnt = [];
  for (let i = 0; i < max; i++) {
    const tag = plusTage(basis, ab + i);
    const r = await versuche(tag);
    if (r && r.ok) return { tag, abgelehnt };
    if (!istRuhezeitSperre(r && r.text)) throw new Error(`Eintragung am ${tag} aus anderem Grund abgewiesen: ${String(r && r.text).slice(0, 200)}`);
    abgelehnt.push(tag);
  }
  throw new Error(`Kein Tag in ${max} Tagen ab ${plusTage(basis, ab)} ohne Ruhezeitsperre (${abgelehnt.length} abgewiesen)`);
}
