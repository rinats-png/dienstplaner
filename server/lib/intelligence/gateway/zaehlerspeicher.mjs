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
   Z5  Lesefehler oder beschädigter Rollup: werfen, nichts schreiben, nichts löschen (nur ein fehlender Rollup beginnt leer).
   Z6  E/A-Fehler beim Lesen eines Ereignisses brechen ab; gelöscht wird nur Gelesenes, das ungültig ist.
   Z7  Summen sind unabhängig von der Reihenfolge (Buchung/Rückbuchung); Kappen auf 0 erst beim Laden.
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
function rollupGueltig(r) {
  return r && typeof r === "object" && r.v === 1 && r.betriebe && typeof r.betriebe === "object" && !Array.isArray(r.betriebe) && Array.isArray(r.gefaltet)
    && r.gefaltet.every((k) => typeof k === "string") && r.gesamt && typeof r.gesamt === "object" && typeof r.gesamt.tag === "string" && Number.isFinite(r.gesamt.ie)
    && Object.values(r.betriebe).every((b) => b && typeof b.monat === "string" && typeof b.tag === "string" && Number.isFinite(b.ieMonat) && Number.isFinite(b.ieTag));
}
const leer = () => ({ v: 1, betriebe: {}, gesamt: { tag: "", ie: 0 }, gefaltet: [] });

function gueltig(e) {
  return e && typeof e === "object" && e.v === 1 && Number.isFinite(e.t) && typeof e.b === "string" && MUSTER_B.test(e.b)
    && (e.n === undefined || (Number.isInteger(e.n) && e.n >= 0 && e.n < 1e6)) && typeof e.tag === "string" && MUSTER_TAG.test(e.tag) && typeof e.monat === "string" && MUSTER_MONAT.test(e.monat)
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
    const n = String(e.n ?? 0).padStart(6, "0");   // laufende Folgenummer je Beleg: Buchung vor Rückbuchung, auch bei gleichem t
    await store.setJSON(`${EV}${e.tag}:${t13}-${n}-${zufall()}`, { v: 1, t: e.t, b: e.b, tag: e.tag, monat: e.monat, ie: e.ie, ...(e.n === undefined ? {} : { n: e.n }) });
  }

  /** Z2/Z3: Ereignisse in den Rollup falten, dann löschen. @returns {Promise<object>} der neue Rollup */
  function zusammenfassen() {
    return unterSperre(SPERR_RAUM, async () => {
      /* Z5 (fail closed): Ein Lesefehler oder ein beschädigter Rollup wirft — es wird NICHTS geschrieben und
         NICHTS gelöscht. Nur ein wirklich fehlender Rollup (null) beginnt leer. Sonst wären alle Kostenzähler
         durch einen einzigen Lesefehler auf 0 gesetzt, nachdem die Ereignisse schon gelöscht wurden. */
      const roh = await store.get(ROLLUP_SCHLUESSEL, { type: "json" });
      let roll;
      if (roh === null || roh === undefined) roll = leer();
      else if (rollupGueltig(roh)) roll = roh;
      else throw new Error("Zähler: Rollup beschädigt — keine Änderung");
      const liste = await store.list({ prefix: EV });
      const keys = ((liste && liste.blobs) || []).map((b) => b.key).sort();
      const schon = new Set(roll.gefaltet);
      const neu = [];
      const ungueltig = [];
      for (const key of keys) {
        if (schon.has(key)) continue;
        /* Z6: Ein E/A-Fehler beim Lesen bricht ab (nichts geändert); gelöscht wird nur, was erfolgreich gelesen wurde
           und ungültig ist. Ein verschwundener Schlüssel (null) wird übersprungen. */
        const e = await store.get(key, { type: "json" });
        if (e === null || e === undefined) continue;
        if (!gueltig(e)) { ungueltig.push(key); continue; }
        const b = roll.betriebe[e.b] || (roll.betriebe[e.b] = { monat: e.monat, tag: e.tag, ieMonat: 0, ieTag: 0 });
        /* Z7: Summen sind NICHT gekappt (kommutativ, unabhängig von der Reihenfolge); gekappt wird erst beim Laden. */
        if (e.monat > b.monat) { b.monat = e.monat; b.ieMonat = 0; }
        if (e.tag > b.tag) { b.tag = e.tag; b.ieTag = 0; }
        if (e.monat === b.monat) b.ieMonat += e.ie;
        if (e.tag === b.tag) b.ieTag += e.ie;
        if (e.tag > roll.gesamt.tag) roll.gesamt = { tag: e.tag, ie: 0 };
        if (e.tag === roll.gesamt.tag) roll.gesamt.ie += e.ie;
        neu.push(key);
      }
      for (const key of ungueltig) await store.delete(key).catch(() => {});
      /* Erst den Rollup (mit den neu gefalteten Schlüsseln), dann die Ereignisse löschen. */
      const vorhanden = new Set(keys);
      roll.gefaltet = [...new Set([...roll.gefaltet.filter((k) => vorhanden.has(k)), ...neu])];
      await store.setJSON(ROLLUP_SCHLUESSEL, roll);
      for (const key of roll.gefaltet) await store.delete(key).catch(() => {});
      return roll;
    });
  }

  /** Stand für Limits.ladeStand() — nach einem Neustart. Negative Zwischensummen werden erst hier auf 0 gekappt (Z7). */
  async function laden() {
    const r = await zusammenfassen();
    const betriebe = {};
    for (const [k, b] of Object.entries(r.betriebe)) betriebe[k] = { ...b, ieMonat: Math.max(0, b.ieMonat), ieTag: Math.max(0, b.ieTag) };
    return { betriebe, gesamt: { tag: r.gesamt.tag, ie: Math.max(0, r.gesamt.ie) } };
  }

  return Object.freeze({ senke, zusammenfassen, laden });
}
