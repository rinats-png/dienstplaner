/* ==========================================================================
   RECHENKERN — SCHNITTSTELLE FÜR DIE INTELLIGENCE-SCHICHT (WP-I12)

   Der Rechenkern rechnet, das Sprachmodell nicht. Diese Datei ist der einzige
   Einstieg für die Intelligence-Schicht: aus der ROLLENSICHT eines Betriebs
   (dieselbe Sicht, die das Faktenpaket bekommt: faktenpaket.mjs, WP-I11)
   werden benannte, typisierte Fakten mit Herkunft gerechnet — mit derselben
   Planrechnung, die der Client benutzt (plan.mjs, befunde.mjs, kennzahlen.mjs;
   src/lib/fachlogik.js reicht sie nur weiter: EINE Fassung).

   Rein: kein React, kein DOM, kein Netz, kein Dateizugriff, kein Zufall. Die
   einzige Uhr ist das `heute` der Eingabe. Die Eingabe wird nie verändert
   (sie darf tief eingefroren sein); der Zwischenspeicher der Planrechnung
   hängt in einer WeakMap an einer Kopie, nie an der Sicht.

   AUSGABE (je Fakt)
     id        stabile Kennung des Fakts (Herkunft + Schlüssel), nur im Server
     feld      Feldname aus intelligence/felder.mjs (Herkunft „berechnet“)
     wert      Zahl, Wahrheitswert oder Kennung gemäß Art des Felds
     person?   Kennung in der Sicht (das Faktenpaket macht daraus einen Alias)
     datum?    JJJJ-MM-TT
     ref?      Kennung der Sache (Kennzahl)
     herkunft  { berechnung, version, von, bis, heute } — wie der Fakt entstand

   `faktenquelleErzeugen` liefert dieselben Fakten ohne `id` und `herkunft`
   (das Faktenpaket erlaubt nur die Schlüssel feld, person, einheit, ref, wert,
   datum, bis, regel). Welche Felder tatsächlich ins Paket kommen, entscheidet
   weiter allein die Positivliste.

   Der Rechenkern importiert nie etwas aus server/lib/intelligence/.

   WAS (NOCH) NICHT GERECHNET WIRD — nichts davon wird geraten; Fragen und
   Gründe in docs/acc45/wp-i12-fragen.md:
     befund.stufe   (Abbildung der Schwere auf hinweis/achtung/recht fehlt)
     besetzung.*    (Soll gilt je Dienstart, das Feld verlangt eine Einheit)
     konto.saldo    (Feld sagt „Plan, nicht Ist“, stundenkonto rechnet mit Ist)
     kandidat.*, ruhezeit.ist, aenderung.art, regel.art
   ========================================================================== */
import { pruefen, mitMerkmalen } from "./befunde.mjs";
import { planKennzahlen } from "./kennzahlen.mjs";
import { mitTagesdatum } from "./zeit.mjs";

export const ENGINE_VERSION = "engine-0.1";

const TAG = /^\d{4}-\d{2}-\d{2}$/;
const MAX_TAGE = 62;
const tageZwischen = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
const istTag = (s) => typeof s === "string" && TAG.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`))
  && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
const liste = (w) => (Array.isArray(w) ? w : []);
const istObj = (w) => !!w && typeof w === "object" && !Array.isArray(w);

/** Felder, die der Rechenkern berechnet (Teilmenge der „berechneten“ Felder des Faktenpakets). */
export const BERECHNETE_FELDER = Object.freeze(["befund.regel", "kennzahl.wert"]);

/** Kennzahlen aus planKennzahlen, die der Rechenkern nennt (ref = Kennung). `spanne` und `wochenenden` fehlen:
    sie sind in der vorhandenen Rechnung nicht zahlenwertig (docs/acc45/wp-i12-fragen.md, Frage 4). */
export const KENNZAHLEN = Object.freeze({
  "plan.befunde": "befunde", "plan.schwer": "schwer", "plan.unterbesetzt": "unterbesetzt",
  "plan.ueberbesetzt": "ueberbesetzt", "plan.dienste": "dienste", "plan.stunden": "stunden",
});

class EngineEingabeFehler extends Error {
  constructor(meldung) { super(meldung); this.name = "EngineEingabeFehler"; this.code = "ENGINE_EINGABE"; }
}

function optionenPruefen(o) {
  if (!istObj(o)) throw new EngineEingabeFehler("Optionen fehlen.");
  const { zeitraum, heute, merkmale = [] } = o;
  if (!istObj(zeitraum) || !istTag(zeitraum.von) || !istTag(zeitraum.bis) || zeitraum.bis < zeitraum.von)
    throw new EngineEingabeFehler("Zeitraum fehlt oder ist ungültig.");
  if (tageZwischen(zeitraum.von, zeitraum.bis) + 1 > MAX_TAGE) throw new EngineEingabeFehler("Zeitraum zu lang.");
  if (!istTag(heute)) throw new EngineEingabeFehler("Tagesdatum (heute) fehlt oder ist ungültig.");
  if (!Array.isArray(merkmale) || merkmale.some((x) => typeof x !== "string")) throw new EngineEingabeFehler("Merkmale ungültig.");
  return { von: zeitraum.von, bis: zeitraum.bis, heute, merkmale: new Set(merkmale) };
}

/** Eine Arbeitsansicht der Sicht: erbt von ihr (gelesen wird nur, was die Rechnung braucht — nichts wird kopiert, nichts
    geschrieben) und ergänzt fehlende Listen als leere. Die Sicht selbst bleibt unberührt. */
function arbeitskopie(sicht) {
  if (!istObj(sicht)) throw new EngineEingabeFehler("Sicht fehlt.");
  const ergaenzt = {};
  for (const k of ["personen", "einheiten", "dienstarten", "qualifikationen", "abwesenheiten"]) if (!Array.isArray(sicht[k])) ergaenzt[k] = { value: [], enumerable: true };
  if (!istObj(sicht.abweichungen)) ergaenzt.abweichungen = { value: {}, enumerable: true };
  return Object.create(sicht, ergaenzt);
}

const herkunft = (berechnung, o) => Object.freeze({ berechnung, version: ENGINE_VERSION, von: o.von, bis: o.bis, heute: o.heute });

/**
 * Rechnet die Fakten eines Zeitraums.
 *
 * @param {object} sicht  Betrieb in Rollensicht (wie das Faktenpaket sie bekommt)
 * @param {{ zeitraum: {von: string, bis: string}, heute: string, merkmale?: string[] }} optionen
 *        heute      Tagesdatum des Aufrufers (kein Uhrzugriff); merkmale: gebuchte und nutzbare Merkmale
 *                   (z. B. „fachkraftquote“) — ohne Angabe gilt keines als nutzbar
 * @returns {{ version: string, zeitraum: {von: string, bis: string}, heute: string, fakten: object[],
 *             nichtBerechenbar: { berechnung: string, grund: string }[], zaehler: object }}
 */
export function rechnen(sicht, optionen) {
  const o = optionenPruefen(optionen);
  const m = arbeitskopie(sicht);
  const fakten = [];
  const nichtBerechenbar = [];
  const ergebnis = mitTagesdatum(o.heute, () => mitMerkmalen((_m, merkmal) => o.merkmale.has(merkmal), () => {
    const aus = { befunde: null, kennzahlen: null };
    try { aus.befunde = pruefen(m, o.von, o.bis); } catch { nichtBerechenbar.push({ berechnung: "pruefen", grund: "Eingabe unvollständig" }); }
    try { aus.kennzahlen = planKennzahlen(m, o.von, o.bis); } catch { nichtBerechenbar.push({ berechnung: "planKennzahlen", grund: "Eingabe unvollständig" }); }
    return aus;
  }));

  if (ergebnis.befunde) {
    const h = herkunft("pruefen", o);
    for (const b of ergebnis.befunde) {
      if (!b || typeof b.art !== "string" || !istTag(b.datum)) continue;
      const f = { id: `eng:pruefen:${b.id}`, feld: "befund.regel", wert: b.art, datum: b.datum, herkunft: h };
      if (typeof b.personId === "string" || typeof b.personId === "number") f.person = String(b.personId);
      fakten.push(f);
    }
  }
  if (ergebnis.kennzahlen) {
    const h = herkunft("planKennzahlen", o);
    for (const [ref, schluessel] of Object.entries(KENNZAHLEN)) {
      const w = ergebnis.kennzahlen[schluessel];
      if (typeof w === "number" && Number.isFinite(w)) fakten.push({ id: `eng:planKennzahlen:${ref}`, feld: "kennzahl.wert", ref, wert: w, herkunft: h });
      else nichtBerechenbar.push({ berechnung: ref, grund: "kein endlicher Zahlenwert" });
    }
  }
  /* Feste, vom Zufall und von der Hashreihenfolge unabhängige Reihenfolge. */
  fakten.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return Object.freeze({
    version: ENGINE_VERSION, zeitraum: Object.freeze({ von: o.von, bis: o.bis }), heute: o.heute,
    fakten: Object.freeze(fakten.map((f) => Object.freeze(f))),
    nichtBerechenbar: Object.freeze(nichtBerechenbar.map((x) => Object.freeze(x))),
    zaehler: Object.freeze({ fakten: fakten.length, nichtBerechenbar: nichtBerechenbar.length }),
  });
}

/**
 * Faktenquelle für das Faktenpaket (faktenpaket.mjs, Parameter `faktenquelle`): liefert die berechneten Fakten
 * ohne `id` und `herkunft`. Eine Funktion ohne Zeitraum (zeitraum null) bekommt nichts.
 * @param {{ heute: string | (() => string), merkmale?: string[] | (() => string[]) }} o
 */
export function faktenquelleErzeugen(o) {
  if (!istObj(o)) throw new EngineEingabeFehler("Optionen fehlen.");
  const tag = typeof o.heute === "function" ? o.heute : () => o.heute;
  const merk = typeof o.merkmale === "function" ? o.merkmale : () => o.merkmale || [];
  return ({ sicht, zeitraum }) => {
    if (!zeitraum) return [];
    const r = rechnen(sicht, { zeitraum, heute: tag(), merkmale: merk() });
    return r.fakten.map(({ feld, person, ref, wert, datum }) => {
      const x = { feld, wert };
      if (person !== undefined) x.person = person;
      if (ref !== undefined) x.ref = ref;
      if (datum !== undefined) x.datum = datum;
      return x;
    });
  };
}

const schluessel = (f) => JSON.stringify([f.feld, f.person ?? null, f.ref ?? null, f.datum ?? null]);

/**
 * Gegenrechnung: rechnet die Fakten nach und vergleicht. Ein Fakt gilt als bestätigt, wenn der Rechenkern denselben
 * Fakt (Feld, Person, Bezug, Datum) mit demselben Wert ergibt. Fakten anderer Felder sind „nicht prüfbar“ (der
 * Rechenkern kennt sie nicht); sie sind keine Abweichung, werden aber gezählt und genannt.
 *
 * @param {object} sicht
 * @param {{ feld: string, wert: any, person?: string, ref?: string, datum?: string }[]} fakten
 * @param {{ zeitraum: object, heute: string, merkmale?: string[] }} optionen
 * @returns {{ ok: boolean, geprueft: number, bestaetigt: number, nichtPruefbar: string[], abweichungen: { feld: string, grund: string }[] }}
 */
export function gegenrechnen(sicht, fakten, optionen) {
  const r = rechnen(sicht, optionen);
  const nach = new Map();
  for (const f of r.fakten) {
    const k = schluessel(f);
    if (!nach.has(k)) nach.set(k, []);
    nach.get(k).push(f.wert);
  }
  /* Ein Feld, das der Rechenkern nicht berechnen konnte (Eingabe unvollständig), bestätigt nichts. */
  const ausgefallen = new Set(r.nichtBerechenbar.map((x) => x.berechnung));
  let geprueft = 0, bestaetigt = 0;
  const nichtPruefbar = new Set();
  const abweichungen = [];
  for (const f of liste(fakten)) {
    if (!istObj(f) || typeof f.feld !== "string") { abweichungen.push({ feld: "?", grund: "ungültiger Fakt" }); continue; }
    if (!BERECHNETE_FELDER.includes(f.feld)) { nichtPruefbar.add(f.feld); continue; }
    geprueft++;
    if (f.feld === "kennzahl.wert" && ausgefallen.has(f.ref)) { abweichungen.push({ feld: f.feld, grund: "nicht berechenbar" }); continue; }
    const werte = nach.get(schluessel(f));
    if (werte && werte.some((w) => Object.is(w, f.wert) || w === f.wert)) bestaetigt++;
    else abweichungen.push({ feld: f.feld, grund: werte ? "Wert weicht ab" : "vom Rechenkern nicht ergeben" });
  }
  return { ok: abweichungen.length === 0, geprueft, bestaetigt, nichtPruefbar: [...nichtPruefbar].sort(), abweichungen };
}

/**
 * Haken für den Ausgabeprüfer (gateway/pruefer.mjs, Parameter `gegenrechnung`): `quelle` liefert zu Ausgabe und Paket
 * die Sicht, die zu prüfenden Fakten und die Optionen (der Server kennt Betrieb und Alias-Karte, der Prüfer nicht).
 * Rückgabe { ok: true } nur, wenn alle prüfbaren Fakten bestätigt sind; jede Ausnahme und jede Abweichung = ok:false.
 * @param {(a: { ausgabe: any, paket: any }) => { sicht: object, fakten: any[], optionen: object }} quelle
 */
export function gegenrechnungErzeugen(quelle) {
  if (typeof quelle !== "function") throw new EngineEingabeFehler("Quelle fehlt.");
  return (a) => {
    try {
      const q = quelle(a);
      const g = gegenrechnen(q.sicht, q.fakten, q.optionen);
      return g.ok ? { ok: true } : { ok: false };
    } catch { return { ok: false }; }
  };
}
