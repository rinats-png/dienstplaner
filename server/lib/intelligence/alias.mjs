/* ==========================================================================
   INTELLIGENCE — ALIAS (PSEUDONYMISIERUNG) UND RÜCKÜBERSETZUNG (WP-I11)

   Personen, Einheiten, Objekte und Dienstarten erscheinen im Faktenpaket
   nur als Alias: Präfix (P/E/O/D) und acht Konsonanten, z. B. „P_KXTBMQDR“.
   Dienstarten sind seit dem Review-Nachtrag (F5) opak: ein Kürzel wie „K“,
   „KK“ oder „BV“ verriete sonst Krankheit oder Beschäftigungsverbot.

   Verfahren (keyed HMAC, kein Schlüssel im Repo):
   - Der Aufrufer (Gateway, WP-I13) übergibt einen Schlüssel von mindestens
     32 Byte: entweder den Betriebsschlüssel aus der Server-Umgebung (dann
     sind Alias innerhalb desselben Kontexts über Aufrufe hinweg gleich —
     nötig für den Fingerprint, WP-I14) oder einen je Auftrag frisch
     gezogenen (zufallsSchluessel()). Dieses Modul liest KEINE
     Umgebungsvariable und kennt keinen Vorgabeschlüssel: ohne Schlüssel
     gibt es keine Alias-Karte (fail closed).
   - Aus dem Schlüssel wird je Raum und Betrieb ein Unterschlüssel
     abgeleitet: HMAC-SHA256(schluessel, "centric-ki-alias/v1|raum|betrieb").
     Derselbe Mensch hat in zwei Räumen nie denselben Alias.
   - Alias = Kodierung von HMAC-SHA256(unterschluessel, kontext|typ|id|n).
     Der Kontext (Auftrag, Entscheidungskontext) trennt Anfragen: Ohne
     Schlüssel ist aus einem Alias weder die Kennung noch ein Zusammenhang
     zwischen zwei Kontexten zu errechnen. Bei einer Kollision (≈ 1 zu
     25 Milliarden je Paar) zählt n hoch.
   - Die Alias-Karte (Alias → Typ, Kennung) bleibt im Server. Sie lässt sich
     nicht versehentlich serialisieren (toJSON wirft); nur ausdrücklich über
     fuerServerSpeicher(macSchluessel) für den Lauf-Store (WP-I14,
     Sicherungsklasse C) — mit HMAC über den ganzen Inhalt; geladen wird nur,
     was mit demselben Schlüssel bestätigt ist (Review F8).

   Rückübersetzung (Modellantwort → Kennung) nur hier im Server, nur für
   eine Rolle, die die Funktion auslösen darf, und nur im Raum und Betrieb,
   für die die Karte gebildet wurde — geprüft an der Betriebskennung im
   aktuellen Bestand, nicht nur am Index (Review F8). Ergebnis sind
   Platzhalter {{person:<kennung>}} — den Namen setzt die Oberfläche aus
   ihrer eigenen Sicht ein; dieses Modul kennt keine Namen. Platzhalter
   entstehen nur aus Alias: jede andere geschweifte Klammer in der
   Modellausgabe bricht ab (Review F4).
   ========================================================================== */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { ALIAS_ALPHABET } from "./schemas.mjs";
import { funktionEintrag, rolleDarf } from "./positivliste.mjs";
import { KiFehler } from "./fehler.mjs";

export const ALIAS_VERFAHREN = "hmac-sha256/v1";
export const SCHLUESSEL_MIN_BYTES = 32;
const PRAEFIX = Object.freeze({ person: "P", einheit: "E", objekt: "O", dienst: "D" });
const TYP_VON_PRAEFIX = Object.freeze({ P: "person", E: "einheit", O: "objekt", D: "dienst" });
const KONTEXT_MUSTER = /^[A-Za-z0-9_.:-]{1,128}$/;
const JEDER_ALIAS = /^[PEOD]_[BCDFGHJKLMNPQRSTVWXZ]{8}$/;
/** Platzhalter aus einem Alias — die einzige Form, in der geschweifte Klammern stehen dürfen. */
const PLATZHALTER = /\{\{(person|einheit|objekt|dienst):([PEOD]_[BCDFGHJKLMNPQRSTVWXZ]{8})\}\}/g;
/** Platzhalter oder alias-artige Zeichenfolge irgendwo im Text — in einem Durchgang ersetzt. */
const ALIAS_ODER_PLATZHALTER =
  /\{\{(person|einheit|objekt|dienst):([PEOD]_[BCDFGHJKLMNPQRSTVWXZ]{8})\}\}|\b([PEOD]_[BCDFGHJKLMNPQRSTVWXZ]{8})\b/g;
const ALIAS_IM_TEXT = /\b[PEOD]_[BCDFGHJKLMNPQRSTVWXZ]{8}\b/g;
const KARTE_MAC_PRAEFIX = "centric-ki-aliaskarte/v1|";

/** Ein frischer, kryptographisch zufälliger Schlüssel (32 Byte) — für Alias
    je Auftrag ohne Betriebsschlüssel. */
export function zufallsSchluessel() {
  return randomBytes(SCHLUESSEL_MIN_BYTES);
}

function schluesselPruefen(s) {
  if (!(s instanceof Uint8Array) || s.length < SCHLUESSEL_MIN_BYTES)
    throw new KiFehler("KI_ALIAS_SCHLUESSEL", "Kein gültiger Alias-Schlüssel (mindestens 32 Byte) — kein Faktenpaket.");
  /* Ein Schlüssel aus lauter gleichen Bytes ist ein Platzhalter, kein Geheimnis. */
  if (s.every((b) => b === s[0]))
    throw new KiFehler("KI_ALIAS_SCHLUESSEL", "Alias-Schlüssel ohne Entropie — kein Faktenpaket.");
}

/** Die ersten 48 Bit (6 Byte) des HMAC → acht Zeichen aus 20 Konsonanten.
    Genutzt werden davon 20^8 ≈ 2,6·10^10 Werte (≈ 34,6 Bit); der Rest der
    48 Bit fällt durch die Division weg (vernachlässigbare Schieflage). */
function kodieren(buf) {
  let n = 0n;
  for (let i = 0; i < 6; i++) n = (n << 8n) | BigInt(buf[i]);
  let aus = "";
  for (let i = 0; i < 8; i++) { aus += ALIAS_ALPHABET[Number(n % 20n)]; n /= 20n; }
  return aus;
}

/**
 * Index des Betriebs aus der Sitzung — ohne Rückfall auf einen anderen.
 * Fehlt die Angabe, gilt nur ein Bestand mit genau einem Betrieb. Gemeinsam
 * für den Bildner (faktenpaket.mjs) und die Rückübersetzung.
 * @returns {number | null}
 */
export function betriebIndexAusSitzung(sitzung, bestand) {
  const n = bestand && typeof bestand === "object" && Array.isArray(bestand.mandanten) ? bestand.mandanten.length : 0;
  if (!n || !sitzung || typeof sitzung !== "object") return null;
  if (sitzung.betrieb === undefined || sitzung.betrieb === null) return n === 1 ? 0 : null;
  if (typeof sitzung.betrieb !== "number" && typeof sitzung.betrieb !== "string") return null;
  if (typeof sitzung.betrieb === "string" && !/^\d{1,6}$/.test(sitzung.betrieb)) return null;
  const i = Number(sitzung.betrieb);
  return Number.isInteger(i) && i >= 0 && i < n ? i : null;
}

const geheim = new WeakMap();

/** Kanonische Form des Lauf-Store-Inhalts (ohne MAC) — feste Reihenfolge. */
const kanonisch = (d) => JSON.stringify([d.v, d.verfahren, d.raum, d.betriebId, d.betriebIndex, d.kontext, d.eintraege]);
const karteMac = (schluessel, d) => createHmac("sha256", schluessel).update(KARTE_MAC_PRAEFIX + kanonisch(d)).digest("hex");

export class AliasKarte {
  /**
   * @param {{ schluessel: Uint8Array, raum: string, betriebId: string, betriebIndex: number, kontext: string }} o
   */
  constructor(o) {
    const { schluessel, raum, betriebId, betriebIndex, kontext } = o || /** @type {any} */ ({});
    schluesselPruefen(schluessel);
    if (typeof raum !== "string" || !raum) throw new KiFehler("KI_NICHT_GEFUNDEN", "Raum fehlt.");
    if (typeof betriebId !== "string" || !betriebId) throw new KiFehler("KI_NICHT_GEFUNDEN", "Betrieb fehlt.");
    if (!Number.isInteger(betriebIndex) || betriebIndex < 0) throw new KiFehler("KI_NICHT_GEFUNDEN", "Betrieb fehlt.");
    if (typeof kontext !== "string" || !KONTEXT_MUSTER.test(kontext)) throw new KiFehler("KI_EINGABE", "Kontext fehlt oder ist ungültig.");
    const unter = createHmac("sha256", schluessel).update(`centric-ki-alias/v1|${raum}|${betriebId}`).digest();
    geheim.set(this, { unter, vor: new Map(), rueck: new Map() });
    Object.defineProperties(this, {
      raum: { value: raum, enumerable: false },
      betriebId: { value: betriebId, enumerable: false },
      betriebIndex: { value: betriebIndex, enumerable: false },
      kontext: { value: kontext, enumerable: false },
      verfahren: { value: ALIAS_VERFAHREN, enumerable: false },
    });
    Object.freeze(this);
  }

  /** Alias für (typ, kennung) — stabil innerhalb der Karte. */
  alias(typ, id) {
    const g = geheim.get(this);
    if (!g || !g.unter) throw new KiFehler("KI_ALIAS_SCHLUESSEL", "Diese Alias-Karte kann keine Alias vergeben.");
    const p = Object.prototype.hasOwnProperty.call(PRAEFIX, typ) ? PRAEFIX[typ] : undefined;
    if (!p) throw new KiFehler("KI_EINGABE", "Unbekannter Alias-Typ.");
    if (id === null || id === undefined || id === "") throw new KiFehler("KI_EINGABE", "Kennung fehlt.");
    const k = `${typ}|${String(id)}`;
    if (g.vor.has(k)) return g.vor.get(k);
    for (let n = 0; n < 1000; n++) {
      const h = createHmac("sha256", g.unter).update(`${this.kontext}|${typ}|${String(id)}|${n}`).digest();
      const a = `${p}_${kodieren(h)}`;
      if (!g.rueck.has(a)) {
        g.vor.set(k, a);
        g.rueck.set(a, { typ, id: String(id) });
        return a;
      }
    }
    throw new KiFehler("KI_EINGABE", "Alias nicht vergebbar.");
  }

  /** Nur für diesen Modulkreis: Alias → { typ, id } oder null. */
  aufloesenIntern(a) {
    const e = geheim.get(this).rueck.get(a);
    return e ? { ...e } : null;
  }

  get groesse() { return geheim.get(this).rueck.size; }

  /** Ausdrückliche Ablage im Server (Lauf-Store, WP-I14). Nie ins Faktenpaket, nie in den Modellkontext.
      Der MAC-Schlüssel kommt vom Aufrufer (≥ 32 Byte, kein Vorgabewert). */
  fuerServerSpeicher(macSchluessel) {
    schluesselPruefen(macSchluessel);
    const g = geheim.get(this);
    const d = { v: 1, verfahren: ALIAS_VERFAHREN, raum: this.raum, betriebId: this.betriebId, betriebIndex: this.betriebIndex,
      kontext: this.kontext, eintraege: [...g.rueck.entries()].map(([a, e]) => [a, e.typ, e.id]) };
    return { ...d, mac: karteMac(macSchluessel, d) };
  }

  /** Aus dem Lauf-Store zurück; nur mit gültigem MAC (gleicher Schlüssel wie
      beim Ablegen). Ohne Alias-Schlüssel — neue Alias kann eine so geladene
      Karte nicht vergeben, nur auflösen. */
  static ausServerSpeicher(d, macSchluessel) {
    schluesselPruefen(macSchluessel);
    const unlesbar = () => new KiFehler("KI_NICHT_GEFUNDEN", "Alias-Karte unlesbar.");
    if (!d || typeof d !== "object" || d.v !== 1 || d.verfahren !== ALIAS_VERFAHREN || !Array.isArray(d.eintraege)
      || typeof d.raum !== "string" || !d.raum || typeof d.betriebId !== "string" || !d.betriebId
      || !Number.isInteger(d.betriebIndex) || d.betriebIndex < 0 || typeof d.kontext !== "string" || !KONTEXT_MUSTER.test(d.kontext)
      || typeof d.mac !== "string" || !/^[0-9a-f]{64}$/.test(d.mac)) throw unlesbar();
    const rueck = new Map();
    const vor = new Map();
    for (const e of d.eintraege) {
      if (!Array.isArray(e) || e.length !== 3 || typeof e[0] !== "string" || !JEDER_ALIAS.test(e[0])
        || typeof e[1] !== "string" || TYP_VON_PRAEFIX[e[0][0]] !== e[1] || typeof e[2] !== "string" || !e[2] || rueck.has(e[0]))
        throw unlesbar();
      rueck.set(e[0], { typ: e[1], id: e[2] });
      vor.set(`${e[1]}|${e[2]}`, e[0]);
    }
    const soll = Buffer.from(karteMac(macSchluessel, d), "hex");
    if (!timingSafeEqual(soll, Buffer.from(d.mac, "hex"))) throw unlesbar();
    const k = Object.create(AliasKarte.prototype);
    geheim.set(k, { unter: null, vor, rueck });
    Object.defineProperties(k, {
      raum: { value: d.raum, enumerable: false },
      betriebId: { value: d.betriebId, enumerable: false },
      betriebIndex: { value: d.betriebIndex, enumerable: false },
      kontext: { value: d.kontext, enumerable: false },
      verfahren: { value: ALIAS_VERFAHREN, enumerable: false },
    });
    return Object.freeze(k);
  }

  /** Die Karte gehört nie in JSON — weder ins Paket noch ins Protokoll. */
  toJSON() {
    throw new KiFehler("KI_INTERN", "Alias-Karte darf nicht serialisiert werden (fuerServerSpeicher benutzen).");
  }
  toString() { return "[AliasKarte]"; }
  [Symbol.for("nodejs.util.inspect.custom")]() { return "[AliasKarte]"; }
}

/** Darf diese Sitzung die Karte benutzen? Raum aus der Sitzung, Betrieb über
    den Index der Sitzung im aktuellen Bestand — und dessen Kennung muss die
    der Karte sein (ein verschobener Index trifft sonst einen anderen Betrieb). */
function sitzungPasst(karte, sitzung, bestand) {
  if (!sitzung || typeof sitzung !== "object" || typeof sitzung.bestand !== "string" || sitzung.bestand !== karte.raum) return false;
  const idx = betriebIndexAusSitzung(sitzung, bestand);
  if (idx === null || idx !== karte.betriebIndex) return false;
  const m = bestand.mandanten[idx];
  if (!m || typeof m !== "object" || m.id === undefined || m.id === null || String(m.id) !== karte.betriebId) return false;
  if (Object.prototype.hasOwnProperty.call(m, "raum") && m.raum !== undefined && m.raum !== null && m.raum !== karte.raum) return false;
  return true;
}

/**
 * Rückübersetzung einer (geprüften) Modellantwort: jeder Alias wird zur
 * Kennung ({{person:<id>}}). Nur im Server, nur für eine berechtigte Rolle,
 * nur im Raum und Betrieb der Karte (Betriebskennung aus dem aktuellen
 * Bestand). Ein Alias, den die Karte nicht kennt, bricht ab (das Modell hat
 * ihn erfunden); eine geschweifte Klammer außerhalb eines Alias-Platzhalters
 * ebenso. Zahlen, Daten und alle übrigen Werte bleiben unverändert.
 * @param {{ ergebnis: any, karte: AliasKarte, sitzung: any, funktion: string, bestand: any }} o
 */
export function rueckuebersetzen({ ergebnis, karte, sitzung, funktion, bestand }) {
  if (!(karte instanceof AliasKarte)) throw new KiFehler("KI_NICHT_GEFUNDEN", "Keine Alias-Karte.");
  const eintrag = funktionEintrag(funktion);
  if (!eintrag || !sitzung || !rolleDarf(eintrag, sitzung.rolle))
    throw new KiFehler("KI_ROLLE", "Diese Rolle darf das Ergebnis nicht zurückübersetzen.");
  if (!sitzungPasst(karte, sitzung, bestand)) throw new KiFehler("KI_NICHT_GEFUNDEN", "Nicht gefunden.");
  if (!eintrag.personenbezug && karte.groesse > 0 && enthaeltAlias(ergebnis, "P"))
    throw new KiFehler("KI_PRUEFER", "Personenbezug in einer Funktion ohne Personen.");
  const ersetze = (s) => {
    /* Platzhalter nur aus Alias: jede andere geschweifte Klammer (roher
       {{person:<kennung>}}, {{x}}, verschachtelt) kommt nicht durch. */
    if (/[{}]/.test(s.replace(PLATZHALTER, " ")))
      throw new KiFehler("KI_PRUEFER", "Platzhalter in der Antwort, der nicht aus einem Alias stammt.");
    return s.replace(ALIAS_ODER_PLATZHALTER, (_, typ, a1, a2) => {
      const e = karte.aufloesenIntern(a1 || a2);
      if (!e || (typ && e.typ !== typ)) throw new KiFehler("KI_ALIAS_UNBEKANNT", "Unbekannter Alias in der Antwort.");
      return `{{${e.typ}:${e.id}}}`;
    });
  };
  const lauf = (w, tiefe) => {
    if (tiefe > 10) throw new KiFehler("KI_EINGABE", "Antwort zu tief verschachtelt.");
    if (typeof w === "string") return ersetze(w);
    if (Array.isArray(w)) return w.map((x) => lauf(x, tiefe + 1));
    if (w && typeof w === "object") {
      const aus = {};
      /* defineProperty statt Zuweisung: ein Schlüssel „__proto__“ wird
         eigenes Feld und setzt nie den Prototyp (Review F10). */
      for (const [k, v] of Object.entries(w))
        Object.defineProperty(aus, k, { value: lauf(v, tiefe + 1), enumerable: true, writable: true, configurable: true });
      return aus;
    }
    return w;
  };
  return lauf(ergebnis, 0);
}

function enthaeltAlias(w, praefix) {
  if (typeof w === "string") return (w.match(ALIAS_IM_TEXT) || []).some((a) => a[0] === praefix);
  if (Array.isArray(w)) return w.some((x) => enthaeltAlias(x, praefix));
  if (w && typeof w === "object") return Object.values(w).some((x) => enthaeltAlias(x, praefix));
  return false;
}
