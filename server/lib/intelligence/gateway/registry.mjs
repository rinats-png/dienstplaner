/* ==========================================================================
   INTELLIGENCE-GATEWAY — MODEL REGISTRY (WP-I13, nur Konfiguration)

   Die Registry ordnet jeder Stufe (1 = Haiku-Klasse, 2 = Sonnet-Klasse,
   3 = Opus-Klasse; router.mjs) eine MODELLKENNUNG zu und legt den
   Modellort fest. Sie kommt ausschließlich aus der Serverkonfiguration des
   Betreibers (Bedingung 1 aus wp-i11-nachweis.md) — nie aus einer Anfrage,
   einer Nutzereingabe oder dem Adapter selbst.

   Für die Attrappe genügen Platzhalter-Kennungen. Echte Kennungen setzt der
   Betreiber erst mit WP-I18 (Anbieterfreigabe); hier steht kein Anbietername.

     erzeugeRegistry({ version, modellOrt: "extern"|"lokal", stufen: { 1: "kennung", 2?: …, 3?: … } })
       → { version, modellOrt, hoechsteStufe, modellFuer(stufe) }

   INVARIANTEN
   R1  Stufen lückenlos ab 1 (1 | 1–2 | 1–3); hoechsteStufe = letzte Stufe.
       So lässt sich die Opus-Stufe allein abschalten (Stufe 3 weglassen).
   R2  Kennungen sind kurze Namen, keine Adressen: nur [a-z0-9._-], ≤ 64,
       kein Schema, kein Pfad, kein Port, kein Nutzer@Host.
   R3  Nur eigene Felder, genau diese Felder; Ergebnis eingefroren und von der
       Eingabe entkoppelt.
   R4  Das Gateway nimmt nur Registries aus erzeugeRegistry an (Marke) und
       startet nicht, wenn der Ort der Registry nicht der des Adapters ist.
   ========================================================================== */

import { KiFehler } from "../fehler.mjs";

export const MODELL_ORTE = Object.freeze(["extern", "lokal"]);
const KENNUNG = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const VERSION = /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/;
const STUFEN = ["1", "2", "3"];
const echt = new WeakSet();

const nurEigene = (o, erlaubt) => !!o && typeof o === "object" && !Array.isArray(o) && Object.getPrototypeOf(o) === Object.prototype
  && Object.getOwnPropertyNames(o).every((k) => erlaubt.includes(k));

/** @param {unknown} k */
export function erzeugeRegistry(k) {
  const ungueltig = () => new KiFehler("KI_INTERN", "Model Registry ungültig.");
  if (!nurEigene(k, ["version", "modellOrt", "stufen"])) throw ungueltig();
  const { version, modellOrt, stufen } = /** @type {any} */ (k);
  if (typeof version !== "string" || !VERSION.test(version)) throw ungueltig();
  if (!MODELL_ORTE.includes(modellOrt)) throw ungueltig();
  if (!nurEigene(stufen, STUFEN)) throw ungueltig();
  const vorhanden = Object.getOwnPropertyNames(stufen).sort();
  if (!vorhanden.length || vorhanden.some((s, i) => s !== STUFEN[i])) throw ungueltig();
  const tabelle = new Map();
  for (const s of vorhanden) {
    const m = stufen[s];
    if (typeof m !== "string" || !KENNUNG.test(m)) throw ungueltig();
    tabelle.set(Number(s), m);
  }
  const r = Object.freeze({
    version,
    modellOrt,
    hoechsteStufe: vorhanden.length,
    /** @returns {string|null} */
    modellFuer(stufe) { return Number.isInteger(stufe) && tabelle.has(stufe) ? tabelle.get(stufe) : null; },
  });
  echt.add(r);
  return r;
}

/** Für das Gateway: nur eine echte Registry, sonst KI_INTERN. */
export function registryPruefen(r) {
  if (!r || typeof r !== "object" || !echt.has(r)) throw new KiFehler("KI_INTERN", "Model Registry ungültig.");
  return r;
}
