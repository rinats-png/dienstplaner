/* ==========================================================================
   INTELLIGENCE — LÖSCHLAUF FÜR ki:*-SCHLÜSSEL (WP-I14)

   Ergänzt den Ergebnis-Speicher (gateway/ergebnis.mjs: Fingerprint, ki:erg, ki:ktx, Fristen, raumLoeschen) um das, was
   für die Raumlöschung und den Datenschutzlauf fehlte:

     L1  Raumlöschung: alle ki:erg:/ki:ktx:-Schlüssel EINES Raums. Fehler werden gezählt (nicht geworfen, nicht
         verschluckt); `vollstaendig` ist erst wahr, wenn nichts liegen blieb. Ein Fehler stoppt die übrigen nicht.
     L2  Vormerkung (ki:loeschung:<raum>) VOR dem Löschen, erst bei Vollständigkeit entfernt: Bricht der Prozess ab,
         holt kiLoeschungNachholen() sie nach Neustart nach (Muster aufraeumen.mjs, Marke loeschung:<raum>).
         Die Vormerkung enthält nur Raumkennung und Zeitpunkt, keine Personendaten.
     L3  Datenschutzlauf: fällige Einträge (Frist) wegräumen, dann Vorgemerktes nachholen. Wirft nie.

   Ort: gateway/ (neben ergebnis.mjs). Die Schreib- und Löschwege (Vormerkung, Raumeinträge) liegen in ergebnis.mjs (Schutzgrenze);
   dieses Modul ruft nur deren Funktionen auf. Der Store wird INJIZIERT (im Betrieb getStore("centric-ki-lauf")); kein Netz, keine KI, keine Importe aus der Engine.
   ========================================================================== */

import { VORMERKUNG_PRAEFIX, vormerkSchluessel, kiVormerkungSchreiben, kiVormerkungEntfernen, kiRaumEintraegeLoeschen } from "./ergebnis.mjs";
export { VORMERKUNG_PRAEFIX };
const grundVon = (e) => String((e && e.message) || e || "unbekannt").slice(0, 160);

/**
 * @param {object} kiStore Ablage-Interface (wird nur an ergebnis.mjs durchgereicht)
 * @param {string} raum
 * @returns {Promise<{ raum: string, geloescht: number, vollstaendig: boolean, fehler: Array<{ schluessel: string, grund: string }> }>}
 */
export async function kiRaumBereinigen(kiStore, raum) {
  const fehler = [];
  let geloescht = 0;
  if (typeof raum !== "string" || !raum) return { raum: String(raum), geloescht, vollstaendig: false, fehler: [{ schluessel: "raum", grund: "ungültig" }] };
  const marke = vormerkSchluessel(raum);
  try { await kiVormerkungSchreiben(kiStore, raum); }
  catch (e) { return { raum, geloescht, vollstaendig: false, fehler: [{ schluessel: marke, grund: grundVon(e) }] }; }
  const lauf = await kiRaumEintraegeLoeschen(kiStore, raum);
  geloescht = lauf.geloescht;
  fehler.push(...lauf.fehler);
  if (fehler.length === 0) {
    try { await kiVormerkungEntfernen(kiStore, raum); } catch (e) { fehler.push({ schluessel: marke, grund: grundVon(e) }); }
  }
  return { raum, geloescht, vollstaendig: fehler.length === 0, fehler };
}

/**
 * Nach Neustart: vorgemerkte Löschungen zu Ende bringen.
 * @returns {Promise<{ geprueft: number, vollstaendig: number, offen: number, fehler: number }>}
 */
export async function kiLoeschungNachholen(kiStore) {
  const b = { geprueft: 0, vollstaendig: 0, offen: 0, fehler: 0 };
  let blobs;
  try { ({ blobs } = await kiStore.list({ prefix: VORMERKUNG_PRAEFIX })); }
  catch { b.fehler++; return b; }
  for (const x of blobs || []) {
    b.geprueft++;
    let raum = null;
    try { raum = decodeURIComponent(x.key.slice(VORMERKUNG_PRAEFIX.length)); } catch { b.offen++; b.fehler++; continue; }
    const r = await kiRaumBereinigen(kiStore, raum);
    if (r.vollstaendig) b.vollstaendig++; else b.offen++;
  }
  return b;
}

/**
 * Datenschutzlauf der ki:*-Schlüssel: Fristen, dann Nachholen. Wirft nie.
 * @param {{ aufraeumen: () => Promise<object> }} speicher aus erzeugeErgebnisSpeicher
 */
export async function kiDatenschutzlauf(speicher, kiStore) {
  let aufraeumen;
  try { aufraeumen = await speicher.aufraeumen(); } catch { aufraeumen = { modus: "?", geprueft: 0, faellig: 0, geloescht: 0, fehler: 1 }; }
  let nachholen;
  try { nachholen = await kiLoeschungNachholen(kiStore); } catch { nachholen = { geprueft: 0, vollstaendig: 0, offen: 0, fehler: 1 }; }
  return { aufraeumen, nachholen };
}
