/* ==========================================================================
   INTELLIGENCE — ALIAS (PSEUDONYMISIERUNG) UND RÜCKÜBERSETZUNG (WP-I11)

   Personen, Einheiten und Objekte erscheinen im Faktenpaket nur als Alias:
   Präfix (P/E/O) und acht Konsonanten, z. B. „P_KXTBMQDR“.

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
     fuerServerSpeicher() für den Lauf-Store (WP-I14, Sicherungsklasse C).

   Rückübersetzung (Modellantwort → Kennung) nur hier im Server, nur für
   eine Rolle, die die Funktion auslösen darf, und nur im Raum und Betrieb,
   für die die Karte gebildet wurde. Ergebnis sind Platzhalter
   {{person:<kennung>}} — den Namen setzt die Oberfläche aus ihrer eigenen
   Sicht ein; dieses Modul kennt keine Namen.
   ========================================================================== */

import { createHmac, randomBytes } from "node:crypto";
import { ALIAS_ALPHABET, ALIAS_MUSTER } from "./schemas.mjs";
import { funktionEintrag, rolleDarf } from "./positivliste.mjs";
import { KiFehler } from "./fehler.mjs";

export const ALIAS_VERFAHREN = "hmac-sha256/v1";
export const SCHLUESSEL_MIN_BYTES = 32;
const PRAEFIX = Object.freeze({ person: "P", einheit: "E", objekt: "O" });
const TYP_VON_PRAEFIX = Object.freeze({ P: "person", E: "einheit", O: "objekt" });
const KONTEXT_MUSTER = /^[A-Za-z0-9_.:-]{1,128}$/;
/** Alias-artige Zeichenfolge irgendwo in einem Text (auch ohne Platzhalter). */
const ALIAS_IM_TEXT = /\b[PEO]_[BCDFGHJKLMNPQRSTVWXZ]{8}\b/g;
const PLATZHALTER = /\{\{(person|einheit|objekt):([PEO]_[BCDFGHJKLMNPQRSTVWXZ]{8})\}\}/g;

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

/** 40 Bit aus dem HMAC → acht Zeichen aus 20 Konsonanten (20^8 ≈ 2,6·10^10). */
function kodieren(buf) {
  let n = 0n;
  for (let i = 0; i < 6; i++) n = (n << 8n) | BigInt(buf[i]);
  let aus = "";
  for (let i = 0; i < 8; i++) { aus += ALIAS_ALPHABET[Number(n % 20n)]; n /= 20n; }
  return aus;
}

const geheim = new WeakMap();

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
    const p = PRAEFIX[typ];
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

  /** Ausdrückliche Ablage im Server (Lauf-Store, WP-I14). Nie ins Faktenpaket, nie in den Modellkontext. */
  fuerServerSpeicher() {
    const g = geheim.get(this);
    return { v: 1, verfahren: ALIAS_VERFAHREN, raum: this.raum, betriebId: this.betriebId, betriebIndex: this.betriebIndex,
      kontext: this.kontext, eintraege: [...g.rueck.entries()].map(([a, e]) => [a, e.typ, e.id]) };
  }

  /** Aus dem Lauf-Store zurück; ohne Schlüssel — neue Alias kann eine so
      geladene Karte nicht vergeben, nur auflösen. */
  static ausServerSpeicher(d) {
    if (!d || d.v !== 1 || d.verfahren !== ALIAS_VERFAHREN || !Array.isArray(d.eintraege))
      throw new KiFehler("KI_NICHT_GEFUNDEN", "Alias-Karte unlesbar.");
    const k = Object.create(AliasKarte.prototype);
    const rueck = new Map();
    const vor = new Map();
    for (const e of d.eintraege) {
      if (!Array.isArray(e) || e.length !== 3 || !ALIAS_MUSTER.test(e[0]) || !PRAEFIX[e[1]] || TYP_VON_PRAEFIX[e[0][0]] !== e[1])
        throw new KiFehler("KI_NICHT_GEFUNDEN", "Alias-Karte unlesbar.");
      rueck.set(e[0], { typ: e[1], id: String(e[2]) });
      vor.set(`${e[1]}|${e[2]}`, e[0]);
    }
    geheim.set(k, { unter: null, vor, rueck });
    Object.defineProperties(k, {
      raum: { value: String(d.raum), enumerable: false },
      betriebId: { value: String(d.betriebId), enumerable: false },
      betriebIndex: { value: Number(d.betriebIndex), enumerable: false },
      kontext: { value: String(d.kontext), enumerable: false },
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

/** Darf diese Sitzung die Karte benutzen? Raum und Betrieb aus der Sitzung. */
function sitzungPasst(karte, sitzung) {
  if (!sitzung || typeof sitzung !== "object") return false;
  const idx = sitzung.betrieb === undefined || sitzung.betrieb === null ? 0 : Number(sitzung.betrieb);
  return typeof sitzung.bestand === "string" && sitzung.bestand === karte.raum && idx === karte.betriebIndex;
}

/**
 * Rückübersetzung einer (geprüften) Modellantwort: jeder Alias wird zur
 * Kennung ({{person:<id>}}). Nur im Server, nur für eine berechtigte Rolle,
 * nur im Raum und Betrieb der Karte. Ein Alias, den die Karte nicht kennt,
 * bricht ab (das Modell hat ihn erfunden). Zahlen, Daten und alle übrigen
 * Werte bleiben unverändert.
 * @param {{ ergebnis: any, karte: AliasKarte, sitzung: any, funktion: string }} o
 */
export function rueckuebersetzen({ ergebnis, karte, sitzung, funktion }) {
  if (!(karte instanceof AliasKarte)) throw new KiFehler("KI_NICHT_GEFUNDEN", "Keine Alias-Karte.");
  const eintrag = funktionEintrag(funktion);
  if (!eintrag || !sitzung || !rolleDarf(eintrag, sitzung.rolle))
    throw new KiFehler("KI_ROLLE", "Diese Rolle darf das Ergebnis nicht zurückübersetzen.");
  if (!sitzungPasst(karte, sitzung)) throw new KiFehler("KI_NICHT_GEFUNDEN", "Nicht gefunden.");
  if (!eintrag.personenbezug && karte.groesse > 0 && enthaeltAlias(ergebnis, "P"))
    throw new KiFehler("KI_PRUEFER", "Personenbezug in einer Funktion ohne Personen.");
  const ersetze = (s) => {
    let t = s.replace(PLATZHALTER, (_, typ, a) => {
      const e = karte.aufloesenIntern(a);
      if (!e || e.typ !== typ) throw new KiFehler("KI_ALIAS_UNBEKANNT", "Unbekannter Alias in der Antwort.");
      return `{{${e.typ}:${e.id}}}`;
    });
    t = t.replace(ALIAS_IM_TEXT, (a) => {
      const e = karte.aufloesenIntern(a);
      if (!e) throw new KiFehler("KI_ALIAS_UNBEKANNT", "Unbekannter Alias in der Antwort.");
      return `{{${e.typ}:${e.id}}}`;
    });
    return t;
  };
  const lauf = (w, tiefe) => {
    if (tiefe > 10) throw new KiFehler("KI_EINGABE", "Antwort zu tief verschachtelt.");
    if (typeof w === "string") return ersetze(w);
    if (Array.isArray(w)) return w.map((x) => lauf(x, tiefe + 1));
    if (w && typeof w === "object") {
      const aus = {};
      for (const [k, v] of Object.entries(w)) aus[k] = lauf(v, tiefe + 1);
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
