/* ==========================================================================
   IMP-4 — Schnittstelle zu /api/import (Vertrag: IMP-3-NACHWEIS.md §1)

   Stand: Der Endpunkt /api/import (IMP-3) ist in integration/release-v4 eingebunden, liegt aber hinter dem
   Serverschalter CENTRIC_IMPORT_AKTIV (Vorgabe aus: dann 404, siehe server/lib/schalter.mjs). Die Oberfläche
   ruft ihn erst auf, wenn IMPORT_DATEI_AKTIV auf true steht; das ist eine eigene Freigabeentscheidung.
   Die Prüfungen laufen gegen ein Testdouble (pruefungen/hilfen/import-schnittstelle-attrappe.mjs).

   Diese Datei ist die EINZIGE Stelle der Oberfläche, die /api/import kennt.
   Sie ist reiner Transport: keine Regel, keine Entscheidung, kein Zwischenspeicher.
   Rückgabe immer { ok:true, daten } oder { ok:false, status, code, fehler } —
   nie eine Ausnahme. Es wird nichts protokolliert und nichts in den Browser-
   Speicher geschrieben (Personaldaten bleiben im Arbeitsspeicher des Vorgangs).
   ========================================================================== */

/** Schalter der Oberfläche, Vorgabe aus: nur nach ausdrücklicher Freigabe auf true setzen (zusätzlich Serverschalter CENTRIC_IMPORT_AKTIV). */
export const IMPORT_DATEI_AKTIV = false;

export const IMPORT_PFADE = Object.freeze({
  upload: "/api/import/upload",
  analyse: "/api/import/analyse",
  vorschau: "/api/import/vorschau",
  uebernahme: "/api/import/uebernahme",
  verwerfen: "/api/import/verwerfen",
});

const NETZFEHLER = { ok: false, status: 0, code: "NETZ", fehler: "Keine Verbindung zum Server. Es wurde nichts übernommen." };

async function antwortLesen(r) {
  let d = null;
  try { d = await r.json(); } catch { d = null; }
  if (r.ok) return { ok: true, daten: d || {} };
  return { ok: false, status: r.status, code: (d && d.code) || "FEHLER",
    fehler: (d && d.fehler) || "Der Import ist fehlgeschlagen.", mehr: d || {} };
}

/**
 * @param {{ fetchFn?: typeof fetch }} [opt] fetchFn: im Test das Testdouble; im Browser fetch.
 */
export function erzeugeImportSchnittstelle({ fetchFn } = {}) {
  const f = fetchFn || (typeof fetch === "function" ? fetch.bind(globalThis) : null);
  const senden = async (pfad, init) => {
    if (!f) return NETZFEHLER;
    try { return await antwortLesen(await f(pfad, { credentials: "same-origin", method: "POST", ...init })); }
    catch { return NETZFEHLER; }
  };
  const json = (pfad, rumpf) => senden(pfad, { headers: { "content-type": "application/json" }, body: JSON.stringify(rumpf) });
  return {
    /** Die Datei selbst als Rumpf; der Name geht nur als Endungshinweis mit (wird serverseitig nie gespeichert). */
    upload: (datei, art = "personal") => senden(`${IMPORT_PFADE.upload}?art=${encodeURIComponent(art)}`, {
      headers: { "content-type": "application/octet-stream", "x-dateiname": encodeURIComponent(String((datei && datei.name) || "")) },
      body: datei }),
    analyse: ({ vorgang, blatt, zuordnung }) => json(IMPORT_PFADE.analyse, { vorgang, blatt, zuordnung }),
    vorschau: ({ vorgang, entscheidungen, bestaetigungen, einheitenAnlegen }) =>
      json(IMPORT_PFADE.vorschau, { vorgang, entscheidungen, bestaetigungen, einheitenAnlegen }),
    uebernahme: ({ vorgang, bestaetigung }) => json(IMPORT_PFADE.uebernahme, { vorgang, bestaetigung }),
    verwerfen: ({ vorgang }) => json(IMPORT_PFADE.verwerfen, { vorgang }),
  };
}
