/* ==========================================================================
   INTELLIGENCE-GATEWAY — PERSISTENZ DER ZÄHLER (WP-I15)

   Append-only Ereignisse plus Rollup (ARCHITEKTUR-ABGLEICH WP-I10: „Zähler ohne Redis und ohne ETag“).
   Alles über das Ablage-Interface (`store`, im Betrieb getStore("centric-ki-lauf")) — INJIZIERT; und der
   Schutz vor gleichzeitigem Zusammenfassen über eine injizierte Sperre (`unterSperre`, im Betrieb
   unterRaumsperre aus server/lib/raumsperre.mjs mit einem Pseudo-Raum wie „@ki-zaehler“).

     ki:zaehler:ev:<tag>:<t13>-<zufall>   ein Ereignis je Buchung/Rückbuchung/Anhebung (nie geändert)
     ki:zaehler:roll                      Rollup: Summen je Betrieb (nur Hash), gesamt, bereits gefaltete Ereignisse

   Ereignis: { v, t, b (Hash des Betriebs), tag, monat, ie (ganz, mit Vorzeichen) } — KEINE Person, KEIN Raum im
   Klartext, kein Text.

   INVARIANTEN
   Z1  Schreiben ist append-only: jedes Ereignis ist ein eigener Schlüssel; zwei Prozesse/Aufrufe können sich
       nie überschreiben (kein Lesen-Ändern-Schreiben).
   Z2  Zusammenfassen läuft unter der Sperre; es ist idempotent: der Rollup merkt sich die gefalteten Ereignis-
       schlüssel, bevor sie gelöscht werden — ein Absturz zwischen Schreiben des Rollups und Löschen der Ereignisse
       zählt nichts doppelt.
   Z3  Der Rollup ist aus den Ereignissen neu rechenbar (nichts außer dem Rollup geht verloren, wenn man die
       gefalteten Ereignisse behielte); beschädigte Ereignisse werden übersprungen und entfernt, nie mitgezählt.
   Z4  Ein Zähler- oder Speicherfehler wird dem Gateway gemeldet (Rückgabe false); Klasse A läuft dann im Speicher
       weiter, alle anderen werden abgelehnt (fail closed nur für Nicht-A, Plan I15).
   ========================================================================== */

import { randomBytes } from "node:crypto";

const EV = "ki:zaehler:ev:";
export const ROLLUP_SCHLUESSEL = "ki:zaehler:roll";
export const SPERR_RAUM = "@ki-zaehler";
const MUSTER_B = /^[0-9a-f]{16}$/;
const MUSTER_TAG = /^\d{4}-\d{2}-\d{2}$/;
const MUSTER_MONAT = /^\d{4}-\d{2}$/;
const leer = () => ({ v: 1, betriebe: {}, gesamt: { tag: "", ie: 0 }, gefaltet: [] });

function gueltig(e) {
  return e && typeof e === "object" && e.v === 1 && Number.isFinite(e.t) && typeof e.b === "string" && MUSTER_B.test(e.b)
    && typeof e.tag === "string" && MUSTER_TAG.test(e.tag) && typeof e.monat === "string" && MUSTER_MONAT.test(e.monat)
    && Number.isInteger(e.ie) && Math.abs(e.ie) <= 1000 && e.tag.startsWith(e.monat);
}

/**
 * @param {{ store: any, unterSperre: (raum: string, arbeit: () => Promise<any>) => Promise<any>, zufall?: () => string }} o
 */
export function erzeugeZaehlerSpeicher(o) {
  const { store, unterSperre } = o || {};
  for (const m of ["get", "setJSON", "delete", "list"]) if (!store || typeof store[m] !== "function") throw new Error(`Zähler: store.${m} fehlt`);
  if (typeof unterSperre !== "function") throw new Error("Zähler: unterSperre fehlt");
  const zufall = o.zufall || (() => randomBytes(6).toString("hex"));

  /** Z1: ein Ereignis, ein Schlüssel. Wirft bei Speicherfehler (Limits macht daraus „nicht dauerhaft“). */
  async function senke(e) {
    if (!gueltig({ v: 1, ...e })) throw new Error("Zähler: ungültiges Ereignis");
    const t13 = String(Math.floor(e.t)).padStart(13, "0");
    await store.setJSON(`${EV}${e.tag}:${t13}-${zufall()}`, { v: 1, t: e.t, b: e.b, tag: e.tag, monat: e.monat, ie: e.ie });
  }

  /** Z2/Z3: Ereignisse in den Rollup falten, dann löschen. @returns {Promise<object>} der neue Rollup */
  function zusammenfassen() {
    return unterSperre(SPERR_RAUM, async () => {
      let roll = await store.get(ROLLUP_SCHLUESSEL, { type: "json" }).catch(() => null);
      if (!roll || roll.v !== 1 || typeof roll.betriebe !== "object" || !Array.isArray(roll.gefaltet)) roll = leer();
      const liste = await store.list({ prefix: EV });
      const keys = ((liste && liste.blobs) || []).map((b) => b.key).sort();
      const schon = new Set(roll.gefaltet);
      const neu = [];
      for (const key of keys) {
        if (schon.has(key)) continue;
        const e = await store.get(key, { type: "json" }).catch(() => null);
        if (!gueltig(e)) { await store.delete(key).catch(() => {}); continue; }
        const b = roll.betriebe[e.b] || (roll.betriebe[e.b] = { monat: e.monat, tag: e.tag, ieMonat: 0, ieTag: 0 });
        if (e.monat > b.monat) { b.monat = e.monat; b.ieMonat = 0; }
        if (e.tag > b.tag) { b.tag = e.tag; b.ieTag = 0; }
        if (e.monat === b.monat) b.ieMonat = Math.max(0, b.ieMonat + e.ie);
        if (e.tag === b.tag) b.ieTag = Math.max(0, b.ieTag + e.ie);
        if (e.tag > roll.gesamt.tag) roll.gesamt = { tag: e.tag, ie: 0 };
        if (e.tag === roll.gesamt.tag) roll.gesamt.ie = Math.max(0, roll.gesamt.ie + e.ie);
        neu.push(key);
      }
      /* Erst den Rollup (mit den neu gefalteten Schlüsseln), dann die Ereignisse löschen. */
      const vorhanden = new Set(keys);
      roll.gefaltet = [...new Set([...roll.gefaltet.filter((k) => vorhanden.has(k)), ...neu])];
      await store.setJSON(ROLLUP_SCHLUESSEL, roll);
      for (const key of roll.gefaltet) await store.delete(key).catch(() => {});
      return roll;
    });
  }

  /** Stand für Limits.ladeStand() — nach einem Neustart. */
  async function laden() {
    const r = await zusammenfassen();
    return { betriebe: r.betriebe, gesamt: r.gesamt };
  }

  return Object.freeze({ senke, zusammenfassen, laden });
}
