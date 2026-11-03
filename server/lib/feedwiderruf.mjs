/* ==========================================================================
   FEEDS OHNE HERKUNFT BEI EINER SPERRE WIDERRUFEN (WP-24, Review-Auflage A4a)

   Ein Kalender-Feed aus der Zeit vor WP-24 trägt keine Herkunft
   (feedherkunft.mjs): Er wird bei jedem Abruf nur über die Person im Bestand
   geprüft. Wird das Konto oder der Zugangscode gesperrt, aus dem er einst
   eingerichtet wurde, liefe er weiter, bis jemand die Person sperrt.

   Darum widerruft die Sperre eines Kontos (accounts.mjs, accountSperren) und
   eines Zugangscodes (daten.mjs, /api/zugang-sperren) zusätzlich den
   herkunftslosen Feed der gebundenen Person — gefunden über den Index
   feedperson:<raum>:<mandantId>:<personId>, nie über eine Suche im ganzen
   Bestand. Ein Feed MIT Herkunft bleibt hier unangetastet: Für ihn
   entscheidet die Herkunftsprüfung beim nächsten Abruf (und eine fremde
   Herkunft gehört nicht dieser Sperre).

   Ohne Abhängigkeit von accounts.mjs, damit accounts.mjs dieses Modul
   einbinden kann (kein Importkreis über feedherkunft.mjs).
   ========================================================================== */

/** @typedef {{ raum: string, mandantId: string, personId: string }} FeedBindung */

/**
 * @param {any} store  Ablage „centric"
 * @param {FeedBindung[]} bindungen
 * @returns {Promise<{ widerrufen: number, fehler: number }>}
 */
export async function herkunftsloseFeedsWiderrufen(store, bindungen) {
  let widerrufen = 0;
  let fehler = 0;
  const gesehen = new Set();
  for (const b of Array.isArray(bindungen) ? bindungen : []) {
    if (!b || typeof b.raum !== "string" || !b.raum || typeof b.mandantId !== "string" || !b.mandantId
      || b.personId === null || b.personId === undefined || String(b.personId) === "") continue;
    const personId = String(b.personId);
    const index = `feedperson:${b.raum}:${b.mandantId}:${personId}`;
    if (gesehen.has(index)) continue;
    gesehen.add(index);
    try {
      const idx = await store.get(index, { type: "json" });
      if (!idx || typeof idx.hash !== "string" || !idx.hash) continue;
      const eintrag = await store.get(`feed:${idx.hash}`, { type: "json" });
      if (!eintrag) continue;
      /* Nur ein Feed ohne Herkunft, und nur, wenn er sicher dieser Person in diesem Betrieb gehört. */
      if (eintrag.herkunft !== undefined && eintrag.herkunft !== null) continue;
      if (eintrag.bestand !== b.raum || String(eintrag.personId) !== personId || eintrag.mandantId !== b.mandantId) continue;
      await store.delete(`feed:${idx.hash}`);
      await store.delete(`feeddaten:${idx.hash}`).catch(() => {});
      await store.delete(index).catch(() => {});
      widerrufen++;
    } catch {
      /* Die Sperre selbst darf daran nicht scheitern; der Feed bleibt dann bis zur Prüfung der Person. */
      fehler++;
    }
  }
  return { widerrufen, fehler };
}
