/* ==========================================================================
   ANHEFTEN — LESEN (WP-I7 Teil 6, Stufe B; Vorlage PR #595, Betreiberentscheidungen 26./27.11.)

   Eigene Karte des Betriebs `angeheftet` (nicht in `abweichungen`; deren Leser bleiben unverändert):
     { "<personId>|<JJJJ-MM-TT>": { am, vonRolle }                                   — angeheftet
       "<personId>|<JJJJ-MM-TT>": { am, vonRolle, aufgehobenAm, aufgehobenVonRolle } — aufgehoben (Vermerk, sichtbar) }
   Wert der Einteilung bleibt in `abweichungen` (Dienst oder „-“ = frei); Stempel setzt nur der Server (server/lib/anheften.mjs).

   Wirkung (Invarianten):
   (1) Planer, planeMonat und Verbessern setzen an einem angehefteten Tag der Person nichts (ersatzVorschlaege: nicht möglich;
       Planer: einsetzbar/Nachprüfung) und ändern angeheftete Einträge nie (sie stehen im Bestand, den der Planer nie ändert).
   (2) Verdrängung über Posten: angeheftete Personen sind nie eigene Einteilungen und zählen in `verdraengt` immer mit.
   (3) Eine UNLESBARE Karte (kein einfaches Objekt, ungültiger Schlüssel oder Eintrag, zu viele Einträge) heißt: jeder Tag gilt
       als angeheftet (fail closed) — der Planer rechnet nicht (Status „ungueltig“), die Ersatzsuche schlägt niemanden vor. Nie
       stilles Weglassen.
   Rein; keine Uhr, keine Ablage.
   ========================================================================== */

/** Feldname der Karte im Betrieb. */
export const ANGEHEFTET_FELD = "angeheftet";
/** Höchstzahl der Einträge (angeheftet und aufgehoben) und Bytegrenze der Karte (UTF-8 der JSON-Form). Ein Eintrag ≈ 90 Byte:
    3000 Einträge ≈ 270 KiB, weit unter RUMPF_MAX (6 MiB) neben dem übrigen Betrieb. */
export const ANGEHEFTET_GRENZE = Object.freeze({ eintraege: 3000, bytes: 320 * 1024 });

const istObjekt = (x) => !!x && typeof x === "object" && !Array.isArray(x);
const SCHLUESSEL = /^[^|]{1,80}\|\d{4}-\d{2}-\d{2}$/;
const text = (x) => typeof x === "string" && x.length > 0 && x.length <= 40;

/** Ist der Eintrag der Form nach gültig? (Server-Stempel: am, vonRolle; aufgehoben: beide Felder des Aufhebens.) */
export function anheftungEintragOk(w) {
  if (!istObjekt(w) || !text(w.am) || !text(w.vonRolle)) return false;
  const auf = Object.prototype.hasOwnProperty.call(w, "aufgehobenAm");
  if (!auf) return !Object.prototype.hasOwnProperty.call(w, "aufgehobenVonRolle");
  return text(w.aufgehobenAm) && text(w.aufgehobenVonRolle);
}

/** Ist der Schlüssel der Form nach gültig („Person|JJJJ-MM-TT“)? */
export const anheftungSchluesselOk = (k) => typeof k === "string" && SCHLUESSEL.test(k);

/**
 * Die Karte, streng gelesen.
 * @param {any} m Betrieb
 * @returns {{ ok: true, aktiv: Set<string>, aufgehoben: Set<string> } | { ok: false, grund: string }}
 */
export function anheftungenLesen(m) {
  if (!istObjekt(m) || !Object.prototype.hasOwnProperty.call(m, ANGEHEFTET_FELD) || m[ANGEHEFTET_FELD] === undefined)
    return { ok: true, aktiv: new Set(), aufgehoben: new Set() };
  const k = m[ANGEHEFTET_FELD];
  if (!istObjekt(k)) return { ok: false, grund: "Anheftungen nicht lesbar (kein Objekt)" };
  const e = Object.entries(k);
  if (e.length > ANGEHEFTET_GRENZE.eintraege) return { ok: false, grund: "Anheftungen nicht lesbar (zu viele Einträge)" };
  const aktiv = new Set(), aufgehoben = new Set();
  for (const [s, w] of e) {
    if (!anheftungSchluesselOk(s) || !anheftungEintragOk(w)) return { ok: false, grund: "Anheftungen nicht lesbar (ungültiger Eintrag)" };
    (Object.prototype.hasOwnProperty.call(w, "aufgehobenAm") ? aufgehoben : aktiv).add(s);
  }
  return { ok: true, aktiv, aufgehoben };
}

/**
 * Darf der Planer (oder planeMonat) am Tag d für die Person nichts setzen? Unlesbare Karte: ja (fail closed).
 * @param {ReturnType<typeof anheftungenLesen>} lesung @param {any} personId @param {string} d
 */
export function anheftungSperrt(lesung, personId, d) {
  if (!lesung || lesung.ok !== true) return true;
  return lesung.aktiv.has(`${personId}|${d}`);
}
