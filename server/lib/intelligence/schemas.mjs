/* ==========================================================================
   INTELLIGENCE — DATENVERTRÄGE (WP-I11)

   Vier Verträge als JSON Schema 2020-12 und ein kleiner, strenger Prüfer:

   - Faktenpaket   (Kern → Modell-Eingabe; pseudonymisiert, ohne Raum,
                    ohne Klarnamen, ohne Alias-Karte)
   - Anfrage       (Client → Gateway; ohne Raum, Rolle, Betrieb)
   - Antwort       (Gateway → Client; Pflichtkennzeichnung, kein Schreibfeld)
   - Prüfergebnis  (Prüfer → Gateway; nur Kennungen und Zahlen)

   Grundlage: docs/intelligence/ARCHITEKTUR-ABGLEICH.md 2.2 (Entwurf 0.1).
   Hier eingefroren als Fassung 1.0; die Abweichungen zum Entwurf stehen in
   docs/intelligence/FAKTENPAKET.md.

   Der Prüfer kennt nur die Schlüsselwörter, die die Schemata hier benutzen.
   Ein unbekanntes Schlüsselwort im Schema ist ein Programmierfehler und
   wirft — so kann niemand ein Schema mit einer Regel erweitern, die still
   ignoriert würde. Jedes Objekt-Schema muss additionalProperties: false
   tragen; unbekannte Felder werden immer verworfen.

   Vor der Schemaprüfung läuft eine Strukturprüfung: nur einfache Objekte,
   Felder, Zeichenketten, endliche Zahlen, Wahrheitswerte; keine Zugriffs-
   funktionen, keine Symbole, keine Prototyp-Schlüssel; Tiefe, Knotenzahl
   und Gesamtgröße begrenzt.

   Kein Netz, kein Speicher, keine Umgebungsvariable.
   ========================================================================== */

import { FELDNAMEN, deepFreeze } from "./felder.mjs";

export const SCHEMA_VERSION = "1.0";
const SCHEMA_URI = "https://json-schema.org/draft/2020-12/schema";

/** Harte Grenzen für jede Eingabe in einen Vertrag. */
export const STRUKTUR_GRENZEN = Object.freeze({
  tiefe: 8,                 // Verschachtelungstiefe (Wurzel = 0)
  knoten: 6000,             // Werte insgesamt
  schluesselJeObjekt: 32,
  schluesselLaenge: 64,
  bytes: 512 * 1024,        // serialisierte Größe
});

/** Funktionen, für die ein Faktenpaket gebildet werden kann. F7B fehlt mit
    Absicht: Dokumente (PDF/Scan/Foto) laufen über eine eigene Strecke (I27)
    mit Klarnamen nach Schwärzung und eigener Datenschutz-Folgenabschätzung. */
export const FUNKTIONEN_IDS = Object.freeze(["F1", "F2", "F3", "F4", "F5", "F6", "F7A", "F8", "F9", "F10",
  "F11", "F12", "F13", "F14", "F15", "F16", "F17", "F18"]);

/** Alias: Präfix (P Person, E Einheit, O Objekt/Standort) und acht
    Konsonanten. Keine Vokale — ein Alias kann kein Wort und keinen Namen
    bilden; keine Ziffern — der Prüfer verwechselt ihn nicht mit einer Zahl. */
export const ALIAS_ALPHABET = "BCDFGHJKLMNPQRSTVWXZ";
export const ALIAS_MUSTER_TEXT = "^[PEO]_[BCDFGHJKLMNPQRSTVWXZ]{8}$";
export const ALIAS_MUSTER = new RegExp(ALIAS_MUSTER_TEXT);

export const DATUM_MUSTER_TEXT = "^\\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])$";
export const ZEIT_MUSTER_TEXT = "^(([01]\\d|2[0-3]):[0-5]\\d|24:00)$";
/** Kennungen (Dienstart, Qualifikation, Regel, Kennzahl): Buchstaben (auch
    Umlaute), Ziffern und . _ : + - — keine Leerzeichen, kein Satz. */
export const KENNUNG_MUSTER_TEXT = "^[\\p{L}\\p{N}_.:+-]{1,64}$";
const KENNUNG_MUSTER = new RegExp(KENNUNG_MUSTER_TEXT, "u");
const FAKT_ID_MUSTER_TEXT = "^[a-z0-9_.:-]{1,64}$";
const VERSION_MUSTER_TEXT = "^[A-Za-z0-9_.:+-]{1,40}$";

export const FAKT_ARTEN = Object.freeze(["zahl", "zeit", "datum", "zustand", "kennung", "wahr"]);
export const EINHEITEN = Object.freeze(["min", "h", "tage", "personen", "prozent", "anzahl"]);
/** Zustände — ein festes Vokabular, kein Freitext. „abwesend" ist der
    einzige Abwesenheitszustand; eine Art oder ein Grund kommt nie hinein. */
export const ZUSTAENDE = Object.freeze(["abwesend", "frei", "hinweis", "achtung", "recht", "neu", "geaendert",
  "entfernt", "offen", "erfuellt", "verletzt", "nicht_bewertbar"]);
export const PRUEFSTATUS = Object.freeze(["geprueft", "provisional", "hinweis"]);

/* ------------------------------------------------------------------------
   DIE SCHEMATA
   ------------------------------------------------------------------------ */
const str = (maxLength, extra = {}) => ({ type: "string", maxLength, ...extra });
const datum = () => ({ type: "string", maxLength: 10, pattern: DATUM_MUSTER_TEXT, format: "date" });
const alias = () => ({ type: "string", maxLength: 10, pattern: ALIAS_MUSTER_TEXT });

const ZEITRAUM = { type: "object", required: ["von", "bis"], additionalProperties: false,
  properties: { von: datum(), bis: datum() } };

/** @type {any} */
export const FAKTENPAKET_SCHEMA = {
    $schema: SCHEMA_URI,
    $id: `centric:intelligence/faktenpaket-${SCHEMA_VERSION}`,
    title: "Faktenpaket",
    type: "object",
    required: ["schemaVersion", "funktion", "versionen", "zeitraum", "fakten"],
    additionalProperties: false,
    properties: {
      schemaVersion: { const: SCHEMA_VERSION },
      funktion: { enum: [...FUNKTIONEN_IDS] },
      versionen: {
        type: "object",
        required: ["schema", "positivliste", "engine", "regelstand", "tarifstand"],
        additionalProperties: false,
        properties: {
          schema: { const: SCHEMA_VERSION },
          positivliste: str(40, { pattern: VERSION_MUSTER_TEXT }),
          engine: str(40, { pattern: VERSION_MUSTER_TEXT }),
          regelstand: str(40, { pattern: VERSION_MUSTER_TEXT }),
          tarifstand: str(40, { pattern: VERSION_MUSTER_TEXT }),
        },
      },
      /* null bei Funktionen ohne Betriebsdaten (F5, F9). */
      zeitraum: { type: ["object", "null"], required: ["von", "bis"], additionalProperties: false,
        properties: { von: datum(), bis: datum() } },
      bezug: {
        type: "object", additionalProperties: false,
        properties: { alias: alias(), bezugAlias: alias(), datum: datum(), ref: str(64, { pattern: KENNUNG_MUSTER_TEXT }) },
      },
      fakten: {
        type: "array", maxItems: 500,
        items: {
          type: "object",
          required: ["id", "feld", "art", "wert"],
          additionalProperties: false,
          properties: {
            id: str(64, { pattern: FAKT_ID_MUSTER_TEXT }),
            feld: { enum: [...FELDNAMEN] },
            art: { enum: [...FAKT_ARTEN] },
            wert: { type: ["number", "string", "boolean"], maxLength: 64, minimum: -1000000, maximum: 1000000 },
            einheit: { enum: [...EINHEITEN] },
            alias: alias(),
            bezugAlias: alias(),
            ref: str(64, { pattern: KENNUNG_MUSTER_TEXT }),
            datum: datum(),
            bis: datum(),
            regel: {
              type: "object", required: ["regelId", "pruefstatus"], additionalProperties: false,
              properties: {
                regelId: str(64, { pattern: KENNUNG_MUSTER_TEXT }),
                fundstelle: str(120, { pattern: "^[\\p{L}\\p{N} §.,:()/-]{1,120}$" }),
                pruefstatus: { enum: [...PRUEFSTATUS] },
              },
            },
          },
        },
      },
      fremdtext: {
        type: "array", maxItems: 20,
        items: {
          type: "object", required: ["kapselId", "text"], additionalProperties: false,
          properties: { kapselId: str(8, { pattern: "^k[0-9]{1,2}$" }), text: str(4000) },
        },
      },
    },
};

/** Eingabe einer Funktion (Teil der Anfrage). Je Funktion kann I13 ein
    engeres Schema setzen; dieses ist die gemeinsame, strenge Obergrenze. */
export const EINGABE_SCHEMA = {
  $schema: SCHEMA_URI,
  $id: `centric:intelligence/eingabe-${SCHEMA_VERSION}`,
  type: "object",
  additionalProperties: false,
  properties: {
    zeitraum: ZEITRAUM,
    fremdtext: { type: "array", maxItems: 20, items: str(4000) },
  },
};

export const ANFRAGE_SCHEMA = {
  $schema: SCHEMA_URI,
  $id: `centric:intelligence/anfrage-${SCHEMA_VERSION}`,
  title: "Anfrage",
  type: "object",
  required: ["funktion", "eingabe"],
  additionalProperties: false,
  properties: {
    funktion: { enum: [...FUNKTIONEN_IDS] },
    eingabe: EINGABE_SCHEMA,
    bezug: {
      type: "object", additionalProperties: false,
      properties: {
        datum: datum(),
        personId: str(64, { pattern: "^[A-Za-z0-9_.:-]{1,64}$" }),
        schichtId: str(64, { pattern: KENNUNG_MUSTER_TEXT }),
        einheitId: str(64, { pattern: "^[A-Za-z0-9_.:-]{1,64}$" }),
      },
    },
    sprache: { enum: ["de"] },
    idempotenz: str(64, { pattern: "^[A-Za-z0-9_-]{1,64}$" }),
  },
};

const BAUSTEIN = {
  type: "object", required: ["id"], additionalProperties: false,
  properties: {
    id: str(64, { pattern: "^[A-Za-z0-9_.:-]{1,64}$" }),
    /* Parameter als Liste (Name, Wert), damit die Objektform streng bleibt. */
    parameter: {
      type: "array", maxItems: 20,
      items: {
        type: "object", required: ["name", "wert"], additionalProperties: false,
        properties: { name: str(40, { pattern: "^[a-z][a-zA-Z0-9_]{0,39}$" }),
          wert: { type: ["string", "number", "boolean"], maxLength: 200, minimum: -1000000, maximum: 1000000 } },
      },
    },
  },
};

export const ANTWORT_SCHEMA = {
  $schema: SCHEMA_URI,
  $id: `centric:intelligence/antwort-${SCHEMA_VERSION}`,
  title: "Antwort",
  type: "object",
  required: ["status", "auftragId", "kennzeichnung"],
  additionalProperties: false,
  properties: {
    status: { enum: ["wartet", "laeuft", "fertig", "rueckfall", "fehler"] },
    auftragId: str(64, { pattern: "^[A-Za-z0-9_-]{8,64}$" }),
    ctxId: str(64, { pattern: "^[A-Za-z0-9_-]{8,64}$" }),
    ergebnis: {
      type: "object", additionalProperties: false,
      properties: {
        bausteine: { type: "array", maxItems: 100, items: BAUSTEIN },
        text: str(4000),
      },
    },
    kennzeichnung: {
      type: "object", required: ["kiGestuetzt", "entwurf", "veroeffentlicht", "geprueft"], additionalProperties: false,
      properties: {
        kiGestuetzt: { const: true },
        entwurf: { const: true },
        veroeffentlicht: { const: false },
        geprueft: { type: "boolean" },
        verzeichnisId: str(64, { pattern: "^[A-Za-z0-9_.:-]{1,64}$" }),
      },
    },
    rueckfall: {
      type: "object", required: ["code"], additionalProperties: false,
      properties: { code: str(44, { pattern: "^KI_[A-Z_]{1,40}$" }), text: str(300) },
    },
  },
};

export const PRUEFERGEBNIS_SCHEMA = {
  $schema: SCHEMA_URI,
  $id: `centric:intelligence/pruefergebnis-${SCHEMA_VERSION}`,
  title: "Prüfergebnis",
  type: "object",
  required: ["version", "ergebnis", "versuche", "regeln"],
  additionalProperties: false,
  properties: {
    version: { const: SCHEMA_VERSION },
    ergebnis: { enum: ["bestanden", "wiederholen", "rueckfall"] },
    versuche: { type: "integer", minimum: 1, maximum: 2 },
    regeln: {
      type: "array", maxItems: 10,
      items: {
        type: "object", required: ["code", "ok"], additionalProperties: false,
        properties: {
          code: { enum: ["P-01", "P-02", "P-03", "P-04", "P-05", "P-06", "P-07", "P-08", "P-09", "P-10"] },
          ok: { type: "boolean" },
          /* Kennungen, nie Werte aus Personendaten. */
          verstoesse: { type: "array", maxItems: 50, items: str(80, { pattern: "^[A-Za-z0-9_.:\\[\\] -]{1,80}$" }) },
        },
      },
    },
    gegenrechnung: {
      type: "object", additionalProperties: false,
      properties: { geprueft: { type: "integer", minimum: 0, maximum: 100000 },
        abweichungen: { type: "integer", minimum: 0, maximum: 100000 } },
    },
  },
};

/* ------------------------------------------------------------------------
   STRUKTURPRÜFUNG
   ------------------------------------------------------------------------ */
const VERBOTENE_SCHLUESSEL = new Set(["__proto__", "constructor", "prototype"]);

/**
 * Prüft, ob ein Wert ein reines JSON-Datum innerhalb der Grenzen ist.
 * @param {unknown} wert
 * @returns {string[]} Fehler (Pfad und Regel, nie der Wert)
 */
export function strukturPruefen(wert, grenzen = STRUKTUR_GRENZEN) {
  const fehler = [];
  let knoten = 0;
  const lauf = (w, pfad, tiefe) => {
    if (fehler.length > 20) return;
    knoten++;
    if (knoten > grenzen.knoten) { if (!fehler.includes("$: zu viele Werte")) fehler.push("$: zu viele Werte"); return; }
    if (tiefe > grenzen.tiefe) { fehler.push(`${pfad}: zu tief verschachtelt`); return; }
    if (w === null || typeof w === "string" || typeof w === "boolean") return;
    if (typeof w === "number") { if (!Number.isFinite(w)) fehler.push(`${pfad}: keine endliche Zahl`); return; }
    if (typeof w !== "object") { fehler.push(`${pfad}: Typ ${typeof w} nicht erlaubt`); return; }
    if (Object.getOwnPropertySymbols(w).length) { fehler.push(`${pfad}: Symbol-Schlüssel`); return; }
    if (Array.isArray(w)) {
      if (Object.getPrototypeOf(w) !== Array.prototype) { fehler.push(`${pfad}: kein einfaches Feld`); return; }
      const schl = Object.getOwnPropertyNames(w).filter((k) => k !== "length");
      if (schl.length !== w.length || schl.some((k, i) => k !== String(i))) { fehler.push(`${pfad}: lückenhaftes oder erweitertes Feld`); return; }
      for (let i = 0; i < w.length; i++) {
        const d = Object.getOwnPropertyDescriptor(w, i);
        if (!d || !("value" in d)) { fehler.push(`${pfad}[${i}]: Zugriffsfunktion`); continue; }
        lauf(d.value, `${pfad}[${i}]`, tiefe + 1);
      }
      return;
    }
    const proto = Object.getPrototypeOf(w);
    if (proto !== Object.prototype && proto !== null) { fehler.push(`${pfad}: kein einfaches Objekt`); return; }
    const schl = Object.getOwnPropertyNames(w);
    if (schl.length > grenzen.schluesselJeObjekt) { fehler.push(`${pfad}: zu viele Felder`); return; }
    for (const k of schl) {
      if (VERBOTENE_SCHLUESSEL.has(k)) { fehler.push(`${pfad}: verbotener Schlüssel`); continue; }
      if (k.length > grenzen.schluesselLaenge) { fehler.push(`${pfad}: Schlüssel zu lang`); continue; }
      const d = Object.getOwnPropertyDescriptor(w, k);
      if (!d || !("value" in d)) { fehler.push(`${pfad}.${k}: Zugriffsfunktion`); continue; }
      if (!d.enumerable) { fehler.push(`${pfad}.${k}: verborgenes Feld`); continue; }
      lauf(d.value, `${pfad}.${k}`, tiefe + 1);
    }
  };
  lauf(wert, "$", 0);
  if (!fehler.length) {
    let groesse = 0;
    try { groesse = Buffer.byteLength(JSON.stringify(wert), "utf8"); } catch { fehler.push("$: nicht serialisierbar"); }
    if (groesse > grenzen.bytes) fehler.push("$: zu groß");
  }
  return fehler;
}

/* ------------------------------------------------------------------------
   SCHEMAPRÜFUNG (Teilmenge von JSON Schema 2020-12)
   ------------------------------------------------------------------------ */
const BEKANNTE_WOERTER = new Set(["$schema", "$id", "title", "description", "type", "const", "enum", "required",
  "properties", "additionalProperties", "items", "minItems", "maxItems", "minLength", "maxLength", "pattern",
  "minimum", "maximum", "format"]);
const musterCache = new Map();
const muster = (p) => {
  if (!musterCache.has(p)) musterCache.set(p, new RegExp(p, "u"));
  return musterCache.get(p);
};
const typVon = (w) => (w === null ? "null" : Array.isArray(w) ? "array"
  : typeof w === "number" ? (Number.isInteger(w) ? "integer" : "number") : typeof w);
const passtTyp = (w, typ) => {
  const t = typVon(w);
  return t === typ || (typ === "number" && t === "integer");
};
/** Ist JJJJ-MM-TT ein Tag, den es gibt? */
const DATUM_RE = new RegExp(DATUM_MUSTER_TEXT);
export function istDatum(s) {
  if (typeof s !== "string" || !DATUM_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function pruefe(schema, w, pfad, fehler) {
  if (fehler.length > 50) return;
  for (const k of Object.keys(schema)) if (!BEKANNTE_WOERTER.has(k)) throw new Error(`Schema: unbekanntes Schlüsselwort ${k}`);
  if (schema.properties && schema.additionalProperties !== false) throw new Error(`Schema: ${pfad} ohne additionalProperties: false`);
  if ("const" in schema && w !== schema.const) { fehler.push(`${pfad}: Wert nicht zulässig`); return; }
  if (schema.enum && !schema.enum.includes(w)) { fehler.push(`${pfad}: Wert nicht in der Liste`); return; }
  if (schema.type) {
    const typen = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!typen.some((t) => passtTyp(w, t))) { fehler.push(`${pfad}: falscher Typ`); return; }
  }
  if (typeof w === "string") {
    if (schema.maxLength !== undefined && [...w].length > schema.maxLength) fehler.push(`${pfad}: zu lang`);
    if (schema.minLength !== undefined && [...w].length < schema.minLength) fehler.push(`${pfad}: zu kurz`);
    if (schema.pattern && !muster(schema.pattern).test(w)) fehler.push(`${pfad}: Form nicht zulässig`);
    if (schema.format === "date" && !istDatum(w)) fehler.push(`${pfad}: kein gültiges Datum`);
  }
  if (typeof w === "number") {
    if (schema.minimum !== undefined && w < schema.minimum) fehler.push(`${pfad}: zu klein`);
    if (schema.maximum !== undefined && w > schema.maximum) fehler.push(`${pfad}: zu groß`);
  }
  if (Array.isArray(w)) {
    if (schema.maxItems !== undefined && w.length > schema.maxItems) { fehler.push(`${pfad}: zu viele Einträge`); return; }
    if (schema.minItems !== undefined && w.length < schema.minItems) fehler.push(`${pfad}: zu wenige Einträge`);
    if (schema.items) w.forEach((x, i) => pruefe(schema.items, x, `${pfad}[${i}]`, fehler));
  } else if (w && typeof w === "object") {
    const props = schema.properties || {};
    for (const r of schema.required || []) if (!Object.prototype.hasOwnProperty.call(w, r)) fehler.push(`${pfad}.${r}: fehlt`);
    for (const [k, v] of Object.entries(w)) {
      if (!Object.prototype.hasOwnProperty.call(props, k)) { fehler.push(`${pfad}: unbekanntes Feld`); continue; }
      pruefe(props[k], v, `${pfad}.${k}`, fehler);
    }
  }
}

/**
 * Struktur- und Schemaprüfung. Liefert nie den geprüften Wert in den Fehlern.
 * @returns {{ ok: boolean, fehler: string[] }}
 */
export function validieren(schema, wert) {
  const fehler = strukturPruefen(wert);
  if (fehler.length) return { ok: false, fehler };
  pruefe(schema, wert, "$", fehler);
  return { ok: fehler.length === 0, fehler };
}

/* ------------------------------------------------------------------------
   ZUSATZREGELN DES FAKTENPAKETS (in JSON Schema nur mit if/then sagbar)
   ------------------------------------------------------------------------ */
const ZEIT_RE = new RegExp(ZEIT_MUSTER_TEXT);
/** Passt der Wert eines Fakts zu seiner Art? */
export function wertPasstZurArt(art, wert) {
  switch (art) {
    case "zahl": return typeof wert === "number" && Number.isFinite(wert);
    case "wahr": return typeof wert === "boolean";
    case "zeit": return typeof wert === "string" && ZEIT_RE.test(wert);
    case "datum": return istDatum(wert);
    case "zustand": return typeof wert === "string" && ZUSTAENDE.includes(wert);
    case "kennung": return typeof wert === "string" && KENNUNG_MUSTER.test(wert);
    default: return false;
  }
}

/** Faktenpaket: Schema plus Zusatzregeln (Wert ↔ Art, Zeitraum, eindeutige Kennungen). */
export function pruefeFaktenpaket(paket) {
  const v = validieren(FAKTENPAKET_SCHEMA, paket);
  if (!v.ok) return v;
  const fehler = [];
  const ids = new Set();
  paket.fakten.forEach((f, i) => {
    if (!wertPasstZurArt(f.art, f.wert)) fehler.push(`$.fakten[${i}].wert: passt nicht zur Art`);
    if (f.einheit !== undefined && f.art !== "zahl") fehler.push(`$.fakten[${i}].einheit: nur bei Zahlen`);
    if (f.bis !== undefined && (f.datum === undefined || f.bis < f.datum)) fehler.push(`$.fakten[${i}].bis: ohne oder vor datum`);
    if (ids.has(f.id)) fehler.push(`$.fakten[${i}].id: doppelt`);
    ids.add(f.id);
  });
  if (paket.zeitraum && paket.zeitraum.bis < paket.zeitraum.von) fehler.push("$.zeitraum: bis vor von");
  return { ok: fehler.length === 0, fehler };
}
/** Die Schemata sind unveränderlich — niemand lockert sie zur Laufzeit. */
export const SCHEMATA = deepFreeze({ faktenpaket: FAKTENPAKET_SCHEMA, eingabe: EINGABE_SCHEMA, anfrage: ANFRAGE_SCHEMA,
  antwort: ANTWORT_SCHEMA, pruefergebnis: PRUEFERGEBNIS_SCHEMA });

export const pruefeAnfrage = (a) => validieren(ANFRAGE_SCHEMA, a);
export const pruefeEingabe = (e) => validieren(EINGABE_SCHEMA, e);
export const pruefeAntwort = (a) => validieren(ANTWORT_SCHEMA, a);
export const pruefePruefergebnis = (p) => validieren(PRUEFERGEBNIS_SCHEMA, p);
