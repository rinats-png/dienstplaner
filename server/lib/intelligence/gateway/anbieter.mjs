/* ==========================================================================
   INTELLIGENCE-GATEWAY — ANBIETER-SCHNITTSTELLE (WP-I13)

   Der Vertrag, den jeder Anbieter-Adapter erfüllt (Attrappe, später der
   Live-Adapter aus WP-I18). Der Adapter bekommt STRUKTURIERTE Eingabe und
   liefert STRUKTURIERTE Ausgabe — nie Rohtext, den jemand weiterreicht.

     adapter = {
       id:        "attrappe" | …           // Kennung für Protokoll und Verzeichnis (Muster unten)
       modellOrt: "lokal" | "extern",      // aus Serverkonfiguration, nie aus der Anfrage
       erzeuge:   async ({ funktion, stufe, schemaVersion, paket, fremdtext, signal })
                    → { ausgabe: object, nutzung?: { eingabeToken, ausgabeToken } }
     }

   Fehlerklassen (AnbieterFehler.klasse):
     zeit               Zeitüberschreitung            — nicht wiederholen, nächste Stufe
     begrenzt           429 / Ratenbegrenzung         — technisch wiederholbar
     nicht_verfuegbar   Netz / 5xx / unbekannter Fehler — technisch wiederholbar
     ungueltig          abgebrochen/leer/unbrauchbar  — nicht wiederholen, nächste Stufe
     zu_gross           Antwort über der Grenze       — nicht wiederholen
     nicht_freigegeben  Adapter ist nicht freigegeben — nie wiederholen

   INVARIANTEN (Review-Hinweis):
   A1  Der Adapter bekommt eine tief eingefrorene KOPIE; er kann Paket und
       Gateway-Zustand nicht verändern.
   A2  Der Adapter bekommt weder Sitzung, Rolle, Person, Betrieb, Raum noch
       Alias-Karte — nur Paket und bereinigten, gekapselten Fremdtext.
   A3  Fehlertexte eines Adapters werden NIE weitergereicht (sie könnten
       Eingabedaten oder Schlüssel enthalten); das Gateway kennt nur die Klasse.
   A4  Jeder Aufruf hat eine Frist und ein AbortSignal; ein Adapter, der das
       Signal ignoriert, blockiert das Gateway trotzdem nicht (Promise.race).
   ========================================================================== */

import { KiFehler } from "../fehler.mjs";
import { deepFreeze } from "../felder.mjs";

export const ANBIETER_FEHLERKLASSEN = Object.freeze(["zeit", "begrenzt", "nicht_verfuegbar", "ungueltig", "zu_gross",
  "nicht_freigegeben"]);
const WIEDERHOLBAR = new Set(["begrenzt", "nicht_verfuegbar"]);
export const ANBIETER_ID_MUSTER = /^[a-z0-9][a-z0-9_.:-]{0,39}$/;

export class AnbieterFehler extends Error {
  /** @param {string} klasse @param {string} [meldung] */
  constructor(klasse, meldung = "Anbieterfehler") {
    super(meldung);
    this.name = "AnbieterFehler";
    this.klasse = ANBIETER_FEHLERKLASSEN.includes(klasse) ? klasse : "nicht_verfuegbar";
  }
  get wiederholbar() { return WIEDERHOLBAR.has(this.klasse); }
}

/** Jeder andere Fehler wird zu einer Klasse ohne seinen Text (A3). */
export function alsAnbieterFehler(e) {
  if (e instanceof AnbieterFehler) return new AnbieterFehler(e.klasse, "Anbieterfehler");
  return new AnbieterFehler("nicht_verfuegbar", "Anbieterfehler");
}

/** Prüft die Form eines Adapters, ohne ihn aufzurufen. */
export function anbieterPruefen(a) {
  if (!a || typeof a !== "object" || typeof a.erzeuge !== "function" || typeof a.id !== "string"
    || !ANBIETER_ID_MUSTER.test(a.id) || (a.modellOrt !== "lokal" && a.modellOrt !== "extern"))
    throw new KiFehler("KI_INTERN", "Anbieter ungültig.");
  return a;
}

const zahlOderNull = (n) => (typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1e9 ? Math.floor(n) : null);

/** Nutzungsangaben des Anbieters sind Fremdwerte: nur endliche, nicht negative Zahlen. */
export function nutzungBereinigen(n) {
  const o = n && typeof n === "object" ? n : {};
  return { eingabeToken: zahlOderNull(o.eingabeToken), ausgabeToken: zahlOderNull(o.ausgabeToken) };
}

function einmal(anbieter, eingabe, ms) {
  const ctrl = new AbortController();
  let timer;
  const frist = new Promise((_, nein) => {
    timer = setTimeout(() => { ctrl.abort(); nein(new AnbieterFehler("zeit", "Frist")); }, Math.max(1, ms));
    if (timer && typeof timer.unref === "function") timer.unref();
  });
  let lauf;
  try {
    lauf = Promise.resolve(anbieter.erzeuge({ ...eingabe, signal: ctrl.signal }));
  } catch (e) {
    lauf = Promise.reject(e);
  }
  return Promise.race([lauf, frist]).finally(() => clearTimeout(timer));
}

/**
 * Ein Aufruf mit Frist und technischen Wiederholungen.
 * Wiederholt wird nur bei `begrenzt`/`nicht_verfuegbar`, höchstens
 * `maxWiederholungen` Mal und nur, wenn bis zur Deadline noch `minRestMs` bleiben.
 * @param {{ anbieter: any, eingabe: object, zeitJeVersuchMs: number, maxWiederholungen: number, deadline: number,
 *   minRestMs?: number, jetzt: () => number, schlafen: (ms: number) => Promise<void> }} o
 * @returns {Promise<{ ausgabe: unknown, nutzung: { eingabeToken: number|null, ausgabeToken: number|null }, versuche: number }>}
 */
export async function aufrufen(o) {
  const { anbieter, eingabe, zeitJeVersuchMs, maxWiederholungen, deadline, jetzt, schlafen } = o;
  const minRest = o.minRestMs ?? 0;
  const kopie = deepFreeze(structuredClone(eingabe));
  let versuch = 0;
  for (;;) {
    versuch++;
    const rest = deadline - jetzt();
    if (rest <= 0) throw new AnbieterFehler("zeit", "Frist");
    try {
      const r = await einmal(anbieter, kopie, Math.min(zeitJeVersuchMs, rest));
      if (!r || typeof r !== "object") throw new AnbieterFehler("ungueltig", "leer");
      return { ausgabe: r.ausgabe, nutzung: nutzungBereinigen(r.nutzung), versuche: versuch };
    } catch (e) {
      const f = alsAnbieterFehler(e);
      if (!f.wiederholbar || versuch > maxWiederholungen || deadline - jetzt() < minRest) throw f;
      await schlafen(Math.min(50 * 2 ** (versuch - 1), Math.max(0, deadline - jetzt())));
    }
  }
}
