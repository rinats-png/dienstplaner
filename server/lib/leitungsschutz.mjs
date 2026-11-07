/* ==========================================================================
   LEITUNG IM RAUM (SI-P6, Befund P6)

   Der Betreiber legt über POST /api/zugaenge Zugangscodes für einen Raum an.
   Für einen NEUEN Betrieb ist das der Weg zu seinen ersten Zugängen. Für
   einen Raum, in dem die Kundin oder der Kunde schon eine Leitung hat, wäre
   ein weiterer Leitung-Code ein Zugriff auf deren Personendaten an der
   Leitung vorbei — entgegen der Zusage in AV §3.

   Diese Prüfung beantwortet nur: Gibt es in diesem Raum schon einen
   WIRKSAMEN Leitungszugang? Wirksam heißt:

     - ein Code der Rolle „leitung“ für diesen Raum, der nicht gesperrt, kein
       Demo-Zugang und nicht abgelaufen ist (ein Ablaufdatum, das sich nicht
       lesen lässt, gilt als „nicht abgelaufen“ — im Zweifel wirksam), oder
     - eine Mitgliedschaft der Rolle „leitung“ im Zustand aktiv oder
       eingeladen (entzogen ist ein Grabstein und zählt nicht).

   Fail-closed: Lässt sich die Ablage nicht vollständig lesen, wirft die
   Funktion. Die bestehenden Sammelleser (alleKonten, mitgliedschaftenDesRaums)
   schlucken Lesefehler und lieferten dann „keine Leitung“ — für eine
   Schutzentscheidung ist das der falsche Ausgang. Die Funktion liest daher
   selbst und gibt Fehler weiter.
   ========================================================================== */

import { mitgliedSchluessel, raummitgliedSchluessel } from "./accounts.mjs";

const KONTO = "konto:";
const SAMMEL = "konten";

/** Ein Ablaufdatum als Zeitpunkt (ms), oder null, wenn es keines gibt oder es sich nicht lesen lässt. */
const ablaufMs = (wert) => {
  if (wert === undefined || wert === null || wert === "") return null;
  const t = new Date(wert).getTime();
  return Number.isFinite(t) ? t : NaN;
};

/** Zählt dieses Konto als wirksame Leitung dieses Raums? */
function kontoWirksam(k, raum, jetzt) {
  if (!k || typeof k !== "object") return false;
  if (k.bestand !== raum || k.rolle !== "leitung") return false;
  if (k.gesperrt || k.demo) return false;
  const bis = ablaufMs(k.laeuftAb);
  if (bis === null) return true;           // kein Ablauf
  if (Number.isNaN(bis)) return true;      // nicht lesbar: im Zweifel wirksam
  return bis > jetzt;                      // abgelaufen zählt nicht
}

/**
 * @param {any} store
 * @param {string} raum
 * @param {number} [jetzt]
 * @returns {Promise<{vorhanden: boolean, quelle?: "code"|"mitgliedschaft"}>}
 * @throws wenn die Ablage nicht (vollständig) lesbar ist
 */
export async function leitungImRaum(store, raum, jetzt = Date.now()) {
  if (typeof raum !== "string" || !raum) throw new Error("Raum fehlt");

  /* Zugangscodes: Sammelblob (Altbestand) und Einzelschlüssel. Jeder Lesefehler wirft. */
  const sammel = (await store.get(SAMMEL, { type: "json" })) || {};
  for (const k of Object.values(sammel))
    if (kontoWirksam(k, raum, jetzt)) return { vorhanden: true, quelle: "code" };
  const { blobs } = await store.list({ prefix: KONTO });
  for (const b of blobs) {
    const k = await store.get(b.key, { type: "json" });
    if (kontoWirksam(k, raum, jetzt)) return { vorhanden: true, quelle: "code" };
  }

  /* Mitgliedschaften des Raums (Zugänge über Account und Passwort). */
  const vorsatz = raummitgliedSchluessel(raum, "");
  const { blobs: zeiger } = await store.list({ prefix: vorsatz });
  for (const z of zeiger) {
    const accountId = z.key.slice(vorsatz.length);
    if (!accountId) continue;
    const m = await store.get(mitgliedSchluessel(accountId, raum), { type: "json" });
    if (m && m.raum === raum && m.accountId === accountId && m.rolle === "leitung"
      && (m.status === "aktiv" || m.status === "eingeladen")) return { vorhanden: true, quelle: "mitgliedschaft" };
  }
  return { vorhanden: false };
}
