/* ==========================================================================
   EINLADUNGEN UND ZURÜCKSETZEN — die Token dahinter

   Beides ist derselbe Vorgang mit anderer Frist: Ein Link, der genau
   einmal erlaubt, für ein bestimmtes Konto ein Passwort zu setzen.
   Eine Einladung läuft sieben Tage, ein Zurücksetzen sechzig Minuten.

   Drei Eigenschaften, ohne die der Link eine offene Tür wäre:

   Gehasht abgelegt — im Speicher liegt nur die Prüfsumme. Wer den
   Bestand liest, kann keinen einzigen Link daraus bauen; das ist
   dieselbe Überlegung wie bei den Zugangscodes.

   Einmalig — beim Einlösen wird der Eintrag gelöscht, bevor das
   Passwort gesetzt wird. Ein zweiter Klick auf denselben Link findet
   nichts mehr vor.

   Mit Laufnummer — das Konto zählt seine Ausstellungen. Ein Token trägt
   die Nummer, unter der es entstand, und gilt nur, solange sie stimmt.
   Wer neu einlädt, entwertet damit jeden früheren Link, auch wenn
   dessen Frist noch liefe. Ohne das wäre „erneut einladen“ keine
   Entwertung, sondern nur ein weiterer Schlüssel im Umlauf.
   ========================================================================== */

import { createHash, randomBytes } from "node:crypto";

const PRAEFIX = "einladung:";
const hash = (s) => createHash("sha256").update(String(s)).digest("hex");

export const EINLADUNG_STUNDEN = 7 * 24;
export const ZURUECKSETZEN_MINUTEN = 60;

/**
 * Stellt ein Token aus. `konto` ist der Ablageschlüssel des Kontos,
 * `nr` die Laufnummer, unter der es gilt. Gibt das Token zurück — die
 * einzige Stelle, an der es je im Klartext existiert.
 */
export async function tokenAusstellen(store, { konto, zweck, nr, minuten }) {
  const token = randomBytes(32).toString("base64url");
  await store.setJSON(PRAEFIX + hash(token), {
    konto, zweck: zweck || "einladung", nr: Number(nr) || 0,
    bis: Date.now() + (Number(minuten) || 60) * 60 * 1000,
    angelegt: new Date().toISOString(),
  });
  return token;
}

/**
 * Löst ein Token ein: prüft Frist und Zweck, löscht den Eintrag und gibt
 * ihn zurück. Wer null bekommt, erfährt nicht, warum — abgelaufen,
 * entwertet und nie gewesen sehen von außen gleich aus.
 */
export async function tokenEinloesen(store, token, zweck) {
  if (!token || String(token).length < 20) return null;
  const schluessel = PRAEFIX + hash(token);
  try {
    const eintrag = await store.get(schluessel, { type: "json" });
    if (!eintrag) return null;
    /* Erst löschen, dann urteilen: Auch ein abgelaufenes Token ist nach
       dem ersten Versuch verbraucht. */
    await store.delete(schluessel).catch(() => {});
    if (eintrag.bis < Date.now()) return null;
    if (zweck && eintrag.zweck !== zweck) return null;
    return eintrag;
  } catch { return null; }
}
