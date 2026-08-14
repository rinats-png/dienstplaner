/* ==========================================================================
   ZUGANGSCODES

   Der Code ist das einzige Geheimnis — kein Benutzername, kein Passwort.
   Abgelegt wurde er als createHash("sha256").update(code): ohne Salz, ohne
   Streckung, mit einer Funktion, die auf Geschwindigkeit gebaut ist.

   Zwölf Zeichen aus einem 26er-Alphabet ergeben rund 9,5 · 10^16
   Möglichkeiten. Gegen Online-Raten trägt das. Fließt aber der konten-Blob
   ab, liegt der Suchraum für handelsübliche Hardware in Tagen.

   Der übliche Rat lautet scrypt oder argon2. Er passt hier nicht: Gesucht
   wird über den Hash als Schlüssel, und eine langsame Funktion je Anmeldung
   wäre erträglich — eine langsame Funktion je Konto beim Durchsuchen nicht.

   Deshalb ein geschlüsselter Hash. HMAC-SHA256 mit einem Pfeffer, der nur
   in der Umgebung steht und nie im Speicher landet. Wer den Blob hat, aber
   den Pfeffer nicht, kann nichts durchprobieren — es fehlt der Schlüssel.
   Die Suche bleibt dabei ein einzelner Zugriff.

   Einrichtung:
     CENTRIC_PFEFFER = 32 zufällige Bytes, base64
     node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

   Ohne Pfeffer arbeitet alles wie bisher weiter — kein Betrieb bleibt
   stehen, nur der Schutz fehlt. Beim Setzen werden Codes bei ihrer nächsten
   Anmeldung still umgeschlüsselt.
   ========================================================================== */

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/** Der alte Weg. Bleibt für Konten, die noch nicht umgeschlüsselt sind. */
export const altHash = (s) => createHash("sha256").update(String(s)).digest("hex");

/** Der neue Weg. Ohne Pfeffer gibt es ihn nicht. */
export function neuHash(s) {
  const pfeffer = process.env.CENTRIC_PFEFFER;
  if (!pfeffer) return null;
  return "p1:" + createHmac("sha256", pfeffer).update(String(s)).digest("hex");
}

/** Gibt es überhaupt einen Pfeffer? */
export const pfeffrig = () => !!process.env.CENTRIC_PFEFFER;

/**
 * Schlüssel, unter dem ein neuer Code abgelegt wird. Mit Pfeffer der
 * geschlüsselte, sonst der alte — damit bleibt alles benutzbar.
 */
export const ablageSchluessel = (code) => neuHash(code) || altHash(code);

/**
 * Sucht ein Konto zu einem Code.
 *
 * Erst der geschlüsselte Schlüssel, dann der alte. Wird das Konto über den
 * alten gefunden und ein Pfeffer ist vorhanden, meldet die Antwort
 * `umschluesseln` — der Aufrufer schreibt es dann unter dem neuen Schlüssel
 * fort. So wandert der Bestand ohne Sammelvorgang hinüber.
 */
export function findeKonto(konten, code) {
  if (!code) return { eintrag: null, schluessel: null, umschluesseln: false };

  const neu = neuHash(code);
  if (neu && konten[neu])
    return { eintrag: konten[neu], schluessel: neu, umschluesseln: false };

  const alt = altHash(code);
  if (konten[alt])
    return { eintrag: konten[alt], schluessel: alt, umschluesseln: !!neu };

  return { eintrag: null, schluessel: null, umschluesseln: false };
}

/**
 * Schreibt ein über den alten Schlüssel gefundenes Konto auf den neuen um.
 * Verändert das übergebene Objekt und gibt zurück, ob etwas geschah.
 */
export function umschluesseln(konten, code, altSchluessel) {
  const neu = neuHash(code);
  if (!neu || !konten[altSchluessel]) return false;
  konten[neu] = { ...konten[altSchluessel], umgeschluesselt: new Date().toISOString() };
  delete konten[altSchluessel];
  return true;
}

/**
 * Gleichlanger Vergleich zweier Zeichenketten.
 *
 * Stand als `gleich` in daten.mjs, korrekt geschrieben und nirgends
 * aufgerufen — während einrichten.mjs das Verwaltungskennwort mit !==
 * verglich. Hier liegt sie an einer Stelle, an der beide sie finden.
 */
export function gleich(a, b) {
  const x = Buffer.from(String(a ?? ""));
  const y = Buffer.from(String(b ?? ""));
  /* Bei ungleicher Länge trotzdem vergleichen, damit auch das keine
     Zeitunterschiede erzeugt. */
  if (x.length !== y.length) {
    timingSafeEqual(x, x);
    return false;
  }
  return timingSafeEqual(x, y);
}
