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

const PRAEFIX = "konto:";
const SAMMEL = "konten";

/** Ein einzelnes Konto lesen. Erst einzeln, dann aus dem Sammelblob. */
export async function kontoLesen(store, schluessel) {
  if (!schluessel) return null;
  try {
    const einzeln = await store.get(PRAEFIX + schluessel, { type: "json" });
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
