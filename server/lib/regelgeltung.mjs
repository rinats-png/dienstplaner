/* ==========================================================================
   REGELGELTUNG — Prüfstatus, Wirkung, Geltung, Stufendeckel (WP-19, A3)

   Bis WP-19 standen diese Funktionen nur in src/regelregister.js. Der
   Regelbaukasten braucht sie, und seit er auch auf dem Server rechnet
   (server/lib/regelbaukasten.mjs), stehen sie hier — eine Fassung, die das
   Register weiterreicht (src/regelregister.js exportiert sie unverändert).
   Inhalt und Verhalten sind unverändert übernommen.

   Rein: keine Ablage, keine Uhr.
   ========================================================================== */

/** Prüfstatus und was er der Regel erlaubt. wirkung: "voll" | "hinweis" | "keine". */
export const PRUEFSTATUS = {
  verified: { label: "geprüft", wirkung: "voll" },
  legacy_verified: { label: "Bestand, geprüft", wirkung: "voll" },
  provisional: { label: "vorläufig", wirkung: "hinweis" },
  watchlist: { label: "beobachtet", wirkung: "keine" },
  deprecated: { label: "abgelöst", wirkung: "keine" },
};

/** Folgen. „keine" heißt: nur anzeigen. */
export const FOLGEN = ["keine", "bestaetigung", "nachweis", "berechnung", "bericht", "freigabe"];

/** Rang der Stufen — wie WARNSTUFEN in src/warnstufen.js (Test: pruefungen/branchen-andock.test.js). */
export const STUFE_RANG = Object.freeze({ hinweis: 1, achtung: 2, recht: 3 });
/** Rang einer Stufe; Unbekanntes zählt als Hinweis. */
export const stufeRangRegel = (s) => (Object.prototype.hasOwnProperty.call(STUFE_RANG, s) ? STUFE_RANG[s] : STUFE_RANG.hinweis);

/**
 * Gilt die Regel an diesem Tag? Ohne Datum gilt nur, was keine Grenzen hat —
 * Unklares gilt im Zweifel nicht.
 */
export function gilt(r, datum) {
  if (!r) return false;
  const hatGrenze = !!(r.gueltigAb || r.gueltigBis);
  if (!datum) return !hatGrenze;
  if (r.gueltigAb && datum < r.gueltigAb) return false;
  if (r.gueltigBis && datum > r.gueltigBis) return false;
  return true;
}

/** „voll", „hinweis" oder „keine" — was der Prüfstatus der Regel erlaubt. Unbekanntes wirkt nicht. */
export function wirkung(r) {
  const s = r && PRUEFSTATUS[r.pruefstatus];
  return s ? s.wirkung : "keine";
}

/**
 * Begrenzt die Stufe eines Befunds auf das, was die Regel darf (Regel als
 * Objekt; das Register löst Kennungen auf, src/regelregister.js begrenzeStufe).
 *
 *   keine Regel                                       → Stufe unverändert (Bestandspfad)
 *   keine Wirkung (watchlist, deprecated, unbekannt)  → null, kein Befund
 *   provisional                                       → höchstens „hinweis"
 *                                                       (außer laufzeit "bestand": nicht herabgestuft)
 *   sonst                                             → höchstens die Regelgrenze,
 *                                                       sofern die Regel eine nennt
 * @param {any} r
 * @param {string|null} stufe
 */
export function begrenzeStufeRegel(r, stufe) {
  if (!r) return stufe;
  const w = wirkung(r);
  if (w === "keine") return null;
  if (stufe == null) return stufe;
  /* Prüfstatus und Laufzeit sind zwei Fragen. „provisional" beschreibt, wie
     gut die QUELLE geprüft ist, und bremst neu eingeführte Regeln. Eine
     Regel, die ein getestetes Bestandsmodul schon rechnet (laufzeit
     "bestand": Fahrzeit, PPP-RL, Tarifvorlagen), wird dadurch nicht
     herabgestuft — ihre Stufe bestimmt weiter das Modul. */
  if (r.laufzeit === "bestand") return stufe;
  const grenze = w === "hinweis" ? "hinweis" : r.hoechsteStufe;
  if (!grenze) return stufe;
  return stufeRangRegel(stufe) > stufeRangRegel(grenze) ? grenze : stufe;
}
