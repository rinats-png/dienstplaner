/* ==========================================================================
   IMP-6 — KERN DER SCHICHTMODELLE JE PERSON (rein, ohne jeden Import)

   Welches Schichtmodell gilt für eine Person an einem Tag, und welcher
   Zyklustag ist es? Ausgelagert aus schichtzuordnung.mjs (dort weiter
   re-exportiert, Schnittstelle unverändert), damit die Planrechnung
   (fachpruefung.mjs, Planwirkung hinter CENTRIC_SCHICHTMODELL_WIRKUNG)
   ihn lesen kann, ohne über schichtzuordnung.mjs → monatsabschluss.mjs →
   isteinfrieren.mjs einen Importkreis zu bilden. Diese Datei importiert
   nichts und hat auf oberster Ebene keine Aufrufe.

   Datenmodell und Regeln: docs/acc45/IMP-6-MEHRFACHMODELLE.md.
   ========================================================================== */

/** Kennung des bisherigen Betriebsmodells (m.zyklus); reserviert, nie Kennung eines eigenen Modells. */
export const BETRIEB_MODELL = "betrieb";
export const ZUORDNUNG_FELD = "schichtmodellZuordnungen";
export const MODELLE_FELD = "schichtmodelle";

const TAG = /^(\d{4})-(\d{2})-(\d{2})$/;
const istObjekt = (x) => !!x && typeof x === "object" && !Array.isArray(x);

/** Ein wirkliches Kalenderdatum JJJJ-MM-TT? */
export function gueltigesDatum(s) {
  const t = typeof s === "string" ? TAG.exec(s) : null;
  if (!t) return false;
  const d = new Date(Date.UTC(Number(t[1]), Number(t[2]) - 1, Number(t[3])));
  return d.toISOString().slice(0, 10) === s;
}
const tagMs = (s) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
/** Tage zwischen zwei Daten, ohne Zeitzone (Zeitumstellung spielt für Kalendertage keine Rolle). */
export const zwischen = (a, b) => Math.round((tagMs(b) - tagMs(a)) / 86400000);
/** Datum + n Tage, ohne Zeitzone. */
export const plusTage = (s, n) => new Date(tagMs(s) + n * 86400000).toISOString().slice(0, 10);
const mod = (a, n) => ((a % n) + n) % n;

/** Die Modelle des Betriebs als Verzeichnis (nur wohlgeformte Einträge). */
export function modellVerzeichnis(m) {
  const aus = new Map();
  for (const x of (m && Array.isArray(m[MODELLE_FELD]) ? m[MODELLE_FELD] : []))
    if (istObjekt(x) && typeof x.id === "string" && x.id !== BETRIEB_MODELL && Array.isArray(x.tage) && x.tage.length) aus.set(x.id, x);
  return aus;
}

/** Die implizite Zuordnung des Altbestands: das Betriebsmodell, unbefristet. */
export const IMPLIZIT = Object.freeze({ id: null, modellId: BETRIEB_MODELL, gueltigAb: null, gueltigBis: null });

/** Die Zuordnungen einer Person — ohne Feld oder mit leerer Liste die implizite. */
export function zuordnungenVon(p) {
  const l = p && Array.isArray(p[ZUORDNUNG_FELD]) ? p[ZUORDNUNG_FELD] : null;
  return l && l.length ? l : [IMPLIZIT];
}

const deckt = (z, d) => (z.gueltigAb === null || z.gueltigAb === undefined || z.gueltigAb <= d)
  && (z.gueltigBis === null || z.gueltigBis === undefined || d <= z.gueltigBis);

/**
 * Das an einem Tag anzuwendende Schichtmodell einer Person. Genau ein Ergebnis:
 * - { art: "modell", modellId, zuordnungId, versatz, anker, quelle: "zuordnung" | "betrieb" }
 * - { art: "keine" }                       — kein Modell gilt an diesem Tag; zulässiger Zustand (Betreiberentscheidung
 *                                            2026-11-14 Frage 5), nie still das Betriebsmodell oder ein Nachbarmodell
 * - { art: "mehrdeutig", zuordnungIds }    — mehrere gelten (Klärung nötig, nie still entschieden)
 * - { art: "ungueltig", grund }            — Datum oder gespeicherte Zuordnung fehlerhaft (Klärung nötig)
 * @param {any} m Betrieb
 * @param {any} p Person
 * @param {string} datum JJJJ-MM-TT
 * @returns {{ art: string } & Record<string, any>}
 */
export function anzuwendendesModell(m, p, datum) {
  if (!gueltigesDatum(datum)) return { art: "ungueltig", grund: "datum" };
  const treffer = [];
  for (const z of zuordnungenVon(p)) {
    if (!istObjekt(z)) return { art: "ungueltig", grund: "zuordnung" };
    for (const f of ["gueltigAb", "gueltigBis"])
      if (z[f] !== null && z[f] !== undefined && !gueltigesDatum(z[f])) return { art: "ungueltig", grund: "zuordnung" };
    if (deckt(z, datum)) treffer.push(z);
  }
  if (!treffer.length) return { art: "keine" };
  if (treffer.length > 1) return { art: "mehrdeutig", zuordnungIds: treffer.map((z) => (z.id === undefined ? null : z.id)) };
  const z = treffer[0];
  if (z.modellId === BETRIEB_MODELL)
    return { art: "modell", modellId: BETRIEB_MODELL, zuordnungId: z.id ?? null, versatz: null, anker: null, quelle: "betrieb" };
  const modell = modellVerzeichnis(m).get(z.modellId);
  if (!modell) return { art: "ungueltig", grund: "modell-unbekannt" };
  if (!z.gueltigAb) return { art: "ungueltig", grund: "anker" };
  /* Versatz: fehlt er (oder ist leer), gilt Zyklustag 1 wie im Datenmodell. Ein gespeicherter Wert außerhalb 0 … n−1 oder
     keine ganze Zahl ist ungültig — nie still 0 oder Modulo. Entsteht über eine alte Sicherung (P2-4 Punkt 8); das
     Verkürzen eines Modells unter einen gespeicherten Versatz weist der Server ab (MODELL_VERKUERZT_VERSATZ). */
  const v = z.versatz;
  if (v !== undefined && v !== null && !(Number.isInteger(v) && v >= 0 && v < modell.tage.length)) return { art: "ungueltig", grund: "versatz" };
  return { art: "modell", modellId: z.modellId, zuordnungId: z.id ?? null, versatz: Number.isInteger(v) ? v : 0,
    anker: z.gueltigAb, quelle: "zuordnung" };
}

/**
 * Lage im eigenen Modell an einem Tag (nur für r.quelle === "zuordnung"): fortlaufende Nummer des Zyklustags seit dem
 * Beginn der Zuordnung (mit Versatz), Index im Zyklus, Zyklustage. Kalendertage, unabhängig von der Zeitumstellung.
 * @param {any} m Betrieb
 * @param {{ modellId: string, anker: string, versatz: number }} r Ergebnis von anzuwendendesModell
 * @param {string} datum JJJJ-MM-TT
 * @returns {{ nummer: number, index: number, tage: string[] }}
 */
export function modellLage(m, r, datum) {
  const tage = /** @type {any} */ (modellVerzeichnis(m).get(r.modellId)).tage;
  const nummer = zwischen(r.anker, datum) + r.versatz;
  return { nummer, index: mod(nummer, tage.length), tage };
}
