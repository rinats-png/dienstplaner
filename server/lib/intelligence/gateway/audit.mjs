/* ==========================================================================
   INTELLIGENCE-GATEWAY — PROTOKOLL OHNE PERSONENDATEN (WP-I13)

   Jedes Ereignis läuft durch eine WEISSLISTE: nur bekannte Felder mit streng
   geprüftem Wert kommen heraus. Alles andere wird verworfen und nur gezählt
   (`verworfen`). So kann auch ein Programmierfehler an anderer Stelle keinen
   Namen, Text, Schlüssel oder Anbieterfehlertext ins Protokoll bringen.

   Erlaubt sind: Ereignisart, Funktion (F1…), Rolle (Aufzählung), Ergebniscode,
   Auftragskennung (zufällig), Betrieb als 12-stelliger Hash, Stufe, Zähler,
   Dauer, Kategorien (Großbuchstaben-Codes), Anbieterkennung.
   NICHT erlaubt (nie im Protokoll): Person, Alias, Fakten, Text, Fremdtext,
   Anbieterantwort, Fehlermeldungen, Schlüssel, Raum.

   INVARIANTEN
   U1  Weißliste, kein Durchreichen: das Ergebnis ist ein neues, eingefrorenes Objekt.
   U2  Das START-Ereignis ist Pflicht: schlägt seine Aufzeichnung fehl, findet KEIN
       Anbieteraufruf statt (kein unprotokollierter Aufruf).
   U4  Das Pflichtereignis muss alle Pflichtfelder tragen (art, funktion, rolle, auftrag, betrieb, anbieter);
       fehlt eines nach der Weißliste, gilt es als nicht aufgezeichnet (KI_AUDIT, kein Anbieteraufruf).
   U3  Spätere Ereignisse stören den Vorgang nie (Fehler der Senke werden verschluckt
       und gezählt).
   ========================================================================== */

import { createHash } from "node:crypto";
import { GatewayFehler } from "./codes.mjs";

export const AUDIT_ARTEN = Object.freeze(["ki.abgelehnt", "ki.start", "ki.stufe", "ki.ende"]);
const ROLLEN = ["leitung", "planer", "mitarbeiter", "betriebsrat", "betreiber", "subplaner"];

const ganz = (max) => (v) => Number.isInteger(v) && v >= 0 && v <= max;
const muster = (re) => (v) => typeof v === "string" && re.test(v);

const FELDER = {
  art: (v) => AUDIT_ARTEN.includes(v),
  funktion: muster(/^F\d{1,2}[AB]?$/),
  rolle: (v) => ROLLEN.includes(v),
  ergebnis: muster(/^(ok|[A-Z][A-Z_]{1,44})$/),
  grund: muster(/^[a-z_]{1,32}$/),
  auftrag: muster(/^[A-Za-z0-9_-]{8,64}$/),
  betrieb: muster(/^[0-9a-f]{12}$/),
  anbieter: muster(/^[a-z0-9][a-z0-9_.:-]{0,39}$/),
  stufe: (v) => Number.isInteger(v) && v >= 1 && v <= 3,
  versuche: ganz(20),
  dauerMs: ganz(3_600_000),
  ie: ganz(1000),
  tokensEin: ganz(1e9),
  tokensAus: ganz(1e9),
  fakten: ganz(10000),
  verworfenAusgabe: ganz(1000),
  ueberKontingent: (v) => v === true,
  treffer: (v) => v === true,
  kategorien: (v) => Array.isArray(v) && v.length <= 12 && v.every(muster(/^[A-Z][A-Z_0-9-]{1,30}$/)),
  codes: (v) => Array.isArray(v) && v.length <= 12 && v.every(muster(/^P-\d{2}$/)),
};

/** Pflichtfelder je Pflichtereignis (U4). */
const PFLICHTFELDER = { "ki.start": ["art", "funktion", "rolle", "auftrag", "betrieb", "anbieter"] };

/** Opaker Betriebsbezeichner fürs Protokoll (kein Raum, keine Betriebskennung im Klartext). */
export const betriebKennung = (raum, betriebId) =>
  createHash("sha256").update(`centric-ki-audit|${raum}|${betriebId}`).digest("hex").slice(0, 12);

/** Weißliste anwenden. @returns {Readonly<Record<string, any>>} */
export function ereignisBereinigen(e, zeit) {
  const aus = { zeit: new Date(zeit).toISOString() };
  let verworfen = 0;
  for (const [k, v] of Object.entries(e && typeof e === "object" ? e : {})) {
    const pruefer = Object.prototype.hasOwnProperty.call(FELDER, k) ? FELDER[k] : null;
    if (pruefer && pruefer(v)) aus[k] = Array.isArray(v) ? Object.freeze([...v]) : v;
    else verworfen++;
  }
  if (verworfen) aus.verworfen = verworfen;
  return Object.freeze(aus);
}

/**
 * @param {{ senke?: (e: Readonly<Record<string, any>>) => void, jetzt?: () => number }} [o]
 */
export function erzeugeAudit(o = {}) {
  const jetzt = o.jetzt || (() => Date.now());
  const senke = o.senke;
  let senkenFehler = 0;
  return {
    /** Pflichtereignis (U2): wirft KI_AUDIT, wenn nicht aufgezeichnet. */
    pflicht(e) {
      if (typeof senke !== "function") throw new GatewayFehler("KI_AUDIT", "Kein Protokoll.");
      const b = ereignisBereinigen(e, jetzt());
      /* U4: ein Pflichtereignis ohne seine Pflichtfelder (verworfen wegen ungültigem Wert) zählt als nicht aufgezeichnet. */
      const pflichtfelder = PFLICHTFELDER[b.art];
      if (!pflichtfelder || !pflichtfelder.every((k) => Object.prototype.hasOwnProperty.call(b, k)))
        throw new GatewayFehler("KI_AUDIT", "Protokollereignis unvollständig.");
      try { senke(b); } catch { senkenFehler++; throw new GatewayFehler("KI_AUDIT", "Protokoll nicht verfügbar."); }
    },
    /** Hinweisereignis (U3): stört nie. */
    melden(e) {
      try { if (typeof senke === "function") senke(ereignisBereinigen(e, jetzt())); } catch { senkenFehler++; }
    },
    get senkenFehler() { return senkenFehler; },
  };
}
