/* ==========================================================================
   KONTENSPEICHER

   Alle Zugänge lagen in einem Blob namens "konten". Drei Stellen lasen ihn,
   hängten an und schrieben zurück: einrichten, starten und zugaenge. Zwei
   gleichzeitige Selbststarts — und ein ausgelieferter Code funktionierte
   nie. Der Interessent sah einen Code auf dem Bildschirm, der ins Leere
   zeigte, und niemand konnte es nachvollziehen.

   Ein Schlüssel je Konto löst das ohne jede Sperre: Zwei Schreibvorgänge
   auf verschiedene Schlüssel stören einander nicht. Zugegriffen wird
   ohnehin nur über den Hash des Codes.

   Der alte Sammelblob wird weiter gelesen, solange er existiert — kein
   Bestandskunde verliert seinen Zugang. Wer sich anmeldet, wandert dabei
   still auf den Einzelschlüssel.
   ========================================================================== */

import { neuHash, altHash } from "./codes.mjs";

const PRAEFIX = "konto:";
const SAMMEL = "konten";

/** Ein einzelnes Konto lesen. Erst einzeln, dann aus dem Sammelblob. */
export async function kontoLesen(store, schluessel) {
  if (!schluessel) return null;
  try {
    const einzeln = await store.get(PRAEFIX + schluessel, { type: "json" });
    /* Ein Verweis statt eines Kontos: Wer eine Adresse hat und zusätzlich
       einen Code bekommt, hat trotzdem nur ein Konto — der Code zeigt
       darauf. Genau ein Sprung, kein zweiter: Ein Verweis auf einen
       Verweis wäre ein Fehler im Datenbestand, keiner im Leser. */
    if (einzeln && einzeln.verweis)
      return await store.get(PRAEFIX + einzeln.verweis, { type: "json" });
    if (einzeln) return einzeln;
  } catch { /* weiter zum Sammelblob */ }
  try {
    const sammel = (await store.get(SAMMEL, { type: "json" })) || {};
    return sammel[schluessel] || null;
  } catch { return null; }
}

/** Ein Konto schreiben — immer einzeln. */
export async function kontoSchreiben(store, schluessel, konto) {
  await store.setJSON(PRAEFIX + schluessel, konto);
}

/**
 * Alle Konten. Braucht nur, wer suchen muss: die Demoliste und das Sperren
 * eines ganzen Betriebs. Der Anmeldeweg kommt ohne aus.
 */
export async function alleKonten(store) {
  const aus = {};
  try {
    const sammel = (await store.get(SAMMEL, { type: "json" })) || {};
    Object.assign(aus, sammel);
  } catch { /* kein Sammelblob mehr */ }
  try {
    const { blobs } = await store.list({ prefix: PRAEFIX });
    for (const b of blobs) {
      const k = b.key.slice(PRAEFIX.length);
      const konto = await store.get(b.key, { type: "json" });
      /* Einzelne schlagen den Sammelblob — sie sind der neuere Stand. */
      if (konto) aus[k] = konto;
    }
  } catch { /* egal */ }
  return aus;
}

/**
 * Ein Konto aus dem Sammelblob auf einen Einzelschlüssel heben.
 * Läuft beiläufig bei der Anmeldung; ein Fehler bleibt folgenlos.
 */
export async function kontoVereinzeln(store, schluessel) {
  try {
    const einzeln = await store.get(PRAEFIX + schluessel, { type: "json" });
    if (einzeln) return false;
    const sammel = (await store.get(SAMMEL, { type: "json" })) || {};
    if (!sammel[schluessel]) return false;
    await store.setJSON(PRAEFIX + schluessel, sammel[schluessel]);
    return true;
  } catch { return false; }
}

/* --------------------------------------------------------------------------
   KONTEN MIT ADRESSE

   Der zweite Suchschlüssel neben der Code-Prüfsumme. Die Adresse wird wie
   ein Code behandelt: nie im Klartext abgelegt, mit Pfeffer geschlüsselt,
   wo einer da ist, und beim ersten Fund über den alten Weg still auf den
   neuen gehoben — dasselbe Muster wie in codes.mjs.
   -------------------------------------------------------------------------- */

/** Eine Adresse auf ihre Vergleichsform bringen. */
export const mailNormieren = (email) => String(email || "").trim().toLowerCase();

/** Der Ablageschlüssel einer Adresse — mit Pfeffer, wo einer da ist. */
export function mailSchluessel(email) {
  const m = mailNormieren(email);
  return "mail:" + (neuHash(m) || altHash(m));
}

/**
 * Sucht ein Konto zu einer Adresse. Erst der geschlüsselte Schlüssel,
 * dann der alte; wird über den alten gefunden und ein Pfeffer ist da,
 * meldet die Antwort `umschluesseln` — der Aufrufer schreibt es dann
 * unter dem neuen fort.
 */
export async function findeKontoMail(store, email) {
  const m = mailNormieren(email);
  if (!m || !m.includes("@"))
    return { eintrag: null, schluessel: null, umschluesseln: false };
  const neu = neuHash(m) ? "mail:" + neuHash(m) : null;
  const alt = "mail:" + altHash(m);
  if (neu) {
    const eintrag = await kontoLesen(store, neu);
    if (eintrag) return { eintrag, schluessel: neu, umschluesseln: false };
  }
  const eintrag = await kontoLesen(store, alt);
  if (eintrag) return { eintrag, schluessel: neu || alt, umschluesseln: !!neu };
  return { eintrag: null, schluessel: null, umschluesseln: false };
}
