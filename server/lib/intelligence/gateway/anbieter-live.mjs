/* ==========================================================================
   INTELLIGENCE-GATEWAY — LIVE-ANBIETER MIT FREIGABE-GATE (WP-I18, Kern)

   Dieses Modul enthält KEINEN Netzcode, keinen Anbietertreiber, keine
   Anbieteradresse. Den Weg ins Netz bringt ein von außen INJIZIERTER
   `transport` mit (anbieterneutral; Adresse, Anmeldung und Übersetzung ins
   Anbieterformat liegen dort — erst mit der Verdrahtung nach Betreiberfreigabe).
   Kein Server verdrahtet dieses Modul (Grenztest).

   FREIGABE-GATE — der Live-Pfad ist gesperrt, solange nicht ALLES gilt:
     (1) konfig.freigabe === true                    (Serverkonfiguration, Vorgabe aus)
     (2) konfig.monatsbudget: endliche Zahl > 0       (Betreiber-Monatsbudget)
     (3) konfig.avv = { status: "bestaetigt", datum: "JJJJ-MM-TT" }  (bestätigte Auftragsverarbeitung;
         Datum gültig und NICHT in der Zukunft — Review-Auflage B)
     (4) Umgebungs-Schalter = "ja" UND Anbieterschlüssel (≥ 20 Zeichen OHNE Leerraum, verschieden vom
         Alias- und MAC-Schlüssel des Schlüsselbunds — Review-Auflage C)   (L1)
     (5) ein Transport ist übergeben
   Gesperrt → `erzeuge` wirft „nicht freigegeben“ (Klasse nicht_freigegeben) — OHNE
   den Transport auch nur anzufassen. Das Gate wird beim Erzeugen festgestellt
   und ist danach unveränderlich (eingefrorene Kopie der Konfiguration).
   Die Werte in Tests sind Platzhalter; dieses Paket schaltet nichts frei.

   ANTWORT DES TRANSPORTS (anbieterneutral):
     transport({ modell, maxAusgabeTokens, funktion, stufe, schemaVersion, paket, fremdtext, schluessel, signal })
       → { status: number, daten?: { ausgabe, nutzung?: { eingabeToken, ausgabeToken }, abbruch?: "laenge" } }
   Abbildung auf Fehlerklassen (anbieter.mjs; im Gateway jede → fester Rückfall, G22):
     Abbruchsignal / Frist                 → zeit
     429                                   → begrenzt
     5xx, Transportfehler, sonstiger Status → nicht_verfuegbar
     daten fehlt / kein Objekt              → ungueltig
     ausgabe verletzt das Schema            → schema
     abbruch "laenge"                       → zu_gross
   Kein Text, kein Status, kein Rohinhalt der Antwort verlässt das Modul in
   einer Fehlermeldung (A3).

   INVARIANTEN
   L1  Ohne Umgebungs-Schalter UND Schlüssel: nicht freigegeben.
   L2  Ohne Gate (1)–(3) und Transport (5): nicht freigegeben, kein Transportaufruf.
   L3  Das Modul liest KEINE Umgebung selbst (kein process.env): der Aufrufer übergibt `env`.
   L4  Der Schlüssel steht nur in einer Closure; er erscheint in keiner Eigenschaft,
       keiner Fehlermeldung, keinem toJSON, keiner Ausgabe; der Transport erhält ihn
       als eigenes Argument, nie im Paket.
   L5  Modell und Ausgabegrenze nur aus der Gateway-Eingabe (Registry, Konfiguration);
       fehlen sie, gibt es keinen Transportaufruf (ungueltig).
   ========================================================================== */

import { AnbieterFehler } from "./anbieter.mjs";
import { SCHLUESSEL_NAMEN } from "./schluessel.mjs";

/* Namen bewusst zusammengesetzt: noch kein Server liest sie; sie gehören erst mit der Verdrahtung (Betreiberfreigabe) ins Betriebshandbuch und in .env.example. */
export const LIVE_SCHALTER_NAME = "CENTRIC" + "_KI_ANBIETER_LIVE";
export const LIVE_SCHLUESSEL_NAME = "CENTRIC" + "_KI_ANBIETER_SCHLUESSEL";

const DATUM = /^(\d{4})-(\d{2})-(\d{2})$/;
const KENNUNG = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const TEXT_MAX = 20_000;

const eigen = (o, n) => (o && typeof o === "object" && Object.hasOwn(o, n) ? o[n] : undefined);   // nie über die Prototypkette

/** Gültiges Kalenderdatum, das nicht nach dem heutigen Tag (UTC, Uhr `jetztMs`) liegt; unbrauchbare Uhr → false (Auflage B). */
function datumGueltig(s, jetztMs) {
  const m = typeof s === "string" ? DATUM.exec(s) : null;
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (!(d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]))) return false;
  if (typeof jetztMs !== "number" || !Number.isFinite(jetztMs)) return false;
  const n = new Date(jetztMs);
  return d.getTime() <= Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate());
}

/** Auflage C: Leerraum zählt nicht; Vergleich ohne Leerraum und ohne Groß-/Kleinschreibung. */
const ohneLeerraum = (s) => String(s).replace(/\s+/g, "");
function schluesselBrauchbar(schluessel, env) {
  if (typeof schluessel !== "string") return false;
  const k = ohneLeerraum(schluessel);
  if (k.length < 20) return false;
  const gleich = (v) => typeof v === "string" && ohneLeerraum(v).toLowerCase() === k.toLowerCase();
  return !Object.values(SCHLUESSEL_NAMEN).some((name) => gleich(eigen(env, name)));
}

/**
 * Prüft die drei Freigabebedingungen der Serverkonfiguration (ohne Umgebung und Transport).
 * @param {unknown} konfig
 * @param {() => number} [jetzt]   Uhr (ms); Vorgabe Date.now — ein AVV-Datum in der Zukunft schließt das Gate (Auflage B)
 * @returns {{ freigabe: boolean, budget: boolean, avv: boolean, offen: boolean }}
 */
export function freigabeGate(konfig, jetzt = Date.now) {
  const freigabe = eigen(konfig, "freigabe") === true;
  const b = eigen(konfig, "monatsbudget");
  const budget = typeof b === "number" && Number.isFinite(b) && b > 0;
  const avvRoh = eigen(konfig, "avv");
  let jetztMs;
  try { jetztMs = typeof jetzt === "function" ? jetzt() : undefined; } catch { jetztMs = undefined; }
  const avv = eigen(avvRoh, "status") === "bestaetigt" && datumGueltig(eigen(avvRoh, "datum"), jetztMs);
  return Object.freeze({ freigabe, budget, avv, offen: freigabe && budget && avv });
}

/** Formprüfung der Ausgabe (Schema): nur text (Zeichenkette) und/oder bausteine (Liste), nichts sonst. */
function ausgabeSchemaOk(a) {
  if (!a || typeof a !== "object" || Array.isArray(a) || Object.getPrototypeOf(a) !== Object.prototype) return false;
  const k = Object.keys(a);
  if (!k.length || !k.every((x) => x === "text" || x === "bausteine")) return false;
  if ("text" in a && (typeof a.text !== "string" || a.text.length > TEXT_MAX)) return false;
  if ("bausteine" in a && !Array.isArray(a.bausteine)) return false;
  return true;
}

/**
 * @param {{ env?: Record<string, string|undefined>, konfig?: { freigabe?: boolean, monatsbudget?: number,
 *   avv?: { status?: string, datum?: string } }, transport?: Function, jetzt?: () => number }} [o]
 */
export function erzeugeLiveAnbieter(o = {}) {
  const env = o && o.env && typeof o.env === "object" ? o.env : {};
  const schluessel = eigen(env, LIVE_SCHLUESSEL_NAME);
  const schlussDa = schluesselBrauchbar(schluessel, env);
  const schalterAn = eigen(env, LIVE_SCHALTER_NAME) === "ja";
  const gate = freigabeGate(o && o.konfig, o && typeof o.jetzt === "function" ? o.jetzt : Date.now);
  const transport = o && typeof o.transport === "function" ? o.transport : null;
  const offen = schlussDa && schalterAn && gate.offen && transport !== null;

  return Object.freeze({
    id: "live",
    modellOrt: /** @type {const} */ ("extern"),
    async erzeuge(eingabe) {
      /* Zwei Meldungen ohne Inhalt: Umgebung nicht gesetzt — oder gesetzt, aber Freigabe-Gate/Transport fehlt. */
      if (!(schlussDa && schalterAn)) throw new AnbieterFehler("nicht_freigegeben", "nicht freigegeben");
      if (!offen) throw new AnbieterFehler("nicht_freigegeben", "nicht freigegeben (Freigabe-Gate WP-I18 geschlossen)");
      const e = eingabe && typeof eingabe === "object" ? eingabe : {};
      /* L5: Modell und Ausgabegrenze nur aus der Gateway-Eingabe. */
      if (typeof e.modellKennung !== "string" || !KENNUNG.test(e.modellKennung) || !Number.isInteger(e.maxAusgabeTokens) || e.maxAusgabeTokens <= 0)
        throw new AnbieterFehler("ungueltig", "Eingabe unvollständig");
      const signal = e.signal;
      let r;
      try {
        r = await transport({ modell: e.modellKennung, maxAusgabeTokens: e.maxAusgabeTokens, funktion: e.funktion, stufe: e.stufe,
          schemaVersion: e.schemaVersion, paket: e.paket, fremdtext: e.fremdtext ?? null, schluessel, signal });
      } catch {
        if (signal && signal.aborted) throw new AnbieterFehler("zeit", "abgebrochen");
        throw new AnbieterFehler("nicht_verfuegbar", "Transportfehler");
      }
      if (signal && signal.aborted) throw new AnbieterFehler("zeit", "abgebrochen");
      const status = r && typeof r === "object" ? r.status : undefined;
      if (status === 429) throw new AnbieterFehler("begrenzt", "Ratenbegrenzung");
      if (!Number.isInteger(status) || status < 200 || status > 299) throw new AnbieterFehler("nicht_verfuegbar", "Status");
      const d = r.daten;
      if (!d || typeof d !== "object" || Array.isArray(d)) throw new AnbieterFehler("ungueltig", "leer");
      if (d.abbruch === "laenge") throw new AnbieterFehler("zu_gross", "Ausgabegrenze");
      if (!ausgabeSchemaOk(d.ausgabe)) throw new AnbieterFehler("schema", "Schema");
      const n = d.nutzung && typeof d.nutzung === "object" ? d.nutzung : {};
      return { ausgabe: d.ausgabe, nutzung: { eingabeToken: n.eingabeToken, ausgabeToken: n.ausgabeToken } };
    },
    toJSON() { return { id: "live", freigegeben: offen }; },
    toString() { return "[LiveAnbieter]"; },
    [Symbol.for("nodejs.util.inspect.custom")]() { return "[LiveAnbieter]"; },
  });
}
