/* ==========================================================================
   ABLAGE — Ersatz für @netlify/blobs

   Die Anwendung ruft an sieben Stellen `getStore()` auf und benutzt davon
   genau sieben Methoden: get, getWithMetadata, getMetadata, set, setJSON,
   delete, list.
   Diese Datei stellt dieselbe Schnittstelle bereit und legt die Werte als
   Dateien ab — auf dem eigenen Server, nicht bei Netlify.

   Wo die Daten liegen

     <CENTRIC_DATEN>/<store>/<schlüssel>.json      Vorgabe: /data

   Ein Schlüssel wird zu einem Dateinamen, indem alles außer Buchstaben,
   Ziffern, `_` und `-` als %XX (UTF-8) geschrieben wird. `scherbe:raum:2026-08`
   wird so zu `scherbe%3Araum%3A2026-08.json`, `2026-09-11/anmelden/abc` zu
   `2026-09-11%2Fanmelden%2Fabc.json`. Damit kann kein Schlüssel das
   Verzeichnis verlassen, und `list({ prefix })` ist ein Vergleich der
   zurückübersetzten Namen.

   Jede Datei ist ein JSON-Umschlag:

     { "fassung": 1, "etag": "…", "typ": "json"|"text",
       "metadata": {…}, "daten": … }

   Schreiben ist atomar: erst in eine temporäre Datei im selben Verzeichnis,
   fsync, dann umbenennen. Ein Leser sieht entweder den alten oder den neuen
   Stand, nie einen halben. Die Standnummern und der Drei-Wege-Abgleich in
   bestand.mjs bleiben davon unberührt — sie leben oberhalb dieser Schicht.

   Umschalten

     CENTRIC_ABLAGE=dateien   Dateien (Vorgabe außerhalb von Netlify)
     CENTRIC_ABLAGE=netlify   weiterhin @netlify/blobs — für den Betrieb
                              auf Netlify und für `vite dev` mit dem
                              Netlify-Plugin, das den Blob-Kontext setzt.

   Ohne ausdrückliche Angabe entscheidet der Blob-Kontext: Ist er da (Netlify
   oder Netlify-Plugin), bleibt es bei @netlify/blobs. Sonst Dateien.
   ========================================================================== */

import { mkdir, open, readdir, readFile, rename, unlink } from "node:fs/promises";
import { createHash, randomBytes } from "node:crypto";
import path from "node:path";

const STORE_NAME = /^[a-z0-9][a-z0-9-]{0,63}$/;
const FASSUNG = 1;

/** @returns {string} */
export function ablageWurzel() {
  return process.env.CENTRIC_DATEN || "/data";
}

/**
 * Welche Ablage gilt? Einmal entschieden, einmal gemeldet.
 * @returns {"dateien"|"netlify"}
 */
let entschieden = null;
export function ablageArt() {
  if (entschieden) return entschieden;
  const wahl = (process.env.CENTRIC_ABLAGE || "").trim().toLowerCase();
  if (wahl === "dateien" || wahl === "netlify") entschieden = wahl;
  else {
    const kontext = process.env.NETLIFY_BLOBS_CONTEXT
      || /** @type {any} */ (globalThis).netlifyBlobsContext;
    entschieden = kontext ? "netlify" : "dateien";
  }
  return entschieden;
}

/* ---------------------------------------------------------------------------
   Schlüssel <-> Dateiname
   --------------------------------------------------------------------------- */

/** @param {string} schluessel */
function dateiname(schluessel) {
  if (typeof schluessel !== "string" || !schluessel.length)
    throw new Error("Ablage: leerer Schlüssel");
  let aus = "";
  for (const byte of Buffer.from(schluessel, "utf8")) {
    const z = String.fromCharCode(byte);
    aus += /[A-Za-z0-9_-]/.test(z) ? z : "%" + byte.toString(16).toUpperCase().padStart(2, "0");
  }
  return aus + ".json";
}

/** @param {string} name */
function schluesselAus(name) {
  if (!name.endsWith(".json")) return null;
  const roh = name.slice(0, -5);
  try { return decodeURIComponent(roh); } catch { return null; }
}

/* ---------------------------------------------------------------------------
   Dateien
   --------------------------------------------------------------------------- */

const angelegt = new Set();

/** @param {string} verzeichnis */
async function sicherstellen(verzeichnis) {
  if (angelegt.has(verzeichnis)) return;
  await mkdir(verzeichnis, { recursive: true, mode: 0o700 });
  angelegt.add(verzeichnis);
}

/**
 * Schreibt erst daneben, dann um. Niemand sieht eine halbe Datei.
 * @param {string} ziel
 * @param {string} inhalt
 */
async function atomarSchreiben(ziel, inhalt) {
  const tmp = `${ziel}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
  const fh = await open(tmp, "w", 0o600);
  try {
    await fh.writeFile(inhalt, "utf8");
    await fh.sync();
  } finally {
    await fh.close();
  }
  try {
    await rename(tmp, ziel);
  } catch (e) {
    await unlink(tmp).catch(() => {});
    throw e;
  }
  /* Auch das Verzeichnis auf die Platte — sonst kann nach einem Stromausfall
     die Datei da sein, der Eintrag im Verzeichnis aber nicht. */
  try {
    const dh = await open(path.dirname(ziel), "r");
    try { await dh.sync(); } finally { await dh.close(); }
  } catch { /* nicht jedes Dateisystem erlaubt das; dann ohne */ }
}

/**
 * @param {string} datei
 * @returns {Promise<{fassung:number, etag:string, typ:string, metadata:object, daten:any}|null>}
 */
async function umschlagLesen(datei) {
  let text;
  try {
    text = await readFile(datei, "utf8");
  } catch (e) {
    if (e && e.code === "ENOENT") return null;
    throw e;
  }
  const u = JSON.parse(text);
  if (!u || u.fassung !== FASSUNG) throw new Error(`Ablage: unbekannte Fassung in ${datei}`);
  return u;
}

/** @param {string} serialisiert */
function etagFuer(serialisiert) {
  return `"${createHash("sha256").update(serialisiert).digest("hex").slice(0, 32)}"`;
}

/* ---------------------------------------------------------------------------
   Der Store
   --------------------------------------------------------------------------- */

/**
 * @param {string} name
 */
function dateiStore(name) {
  const verzeichnis = path.join(ablageWurzel(), name);
  const pfad = (/** @type {string} */ schluessel) => path.join(verzeichnis, dateiname(schluessel));

  /**
   * Gibt den Wert in der gewünschten Form zurück — wie @netlify/blobs:
   * ohne Angabe als Text, mit { type: "json" } als Objekt.
   * @param {any} u
   * @param {{type?: string}|undefined} opts
   */
  const inForm = (u, opts) => {
    const typ = opts && opts.type ? opts.type : "text";
    if (typ === "json") return u.typ === "json" ? u.daten : JSON.parse(u.daten);
    if (typ === "text") return u.typ === "json" ? JSON.stringify(u.daten) : u.daten;
    throw new Error(`Ablage: Form „${typ}" wird nicht unterstützt`);
  };

  /**
   * @param {string} schluessel
   * @param {"json"|"text"} typ
   * @param {any} daten
   * @param {{metadata?: object}|undefined} opts
   */
  const schreiben = async (schluessel, typ, daten, opts) => {
    await sicherstellen(verzeichnis);
    const metadata = opts && opts.metadata && typeof opts.metadata === "object" ? opts.metadata : {};
    const serialisiert = typ === "json" ? JSON.stringify(daten) : String(daten);
    const umschlag = { fassung: FASSUNG, etag: etagFuer(serialisiert), typ, metadata,
      daten: typ === "json" ? daten : serialisiert };
    await atomarSchreiben(pfad(schluessel), JSON.stringify(umschlag));
  };

  return {
    /**
     * @param {string} schluessel
     * @param {{type?: string}} [opts]
     */
    async get(schluessel, opts) {
      const u = await umschlagLesen(pfad(schluessel));
      return u ? inForm(u, opts) : null;
    },

    /**
     * @param {string} schluessel
     * @param {{type?: string}} [opts]
     * @returns {Promise<{data:any, metadata:object, etag:string}|null>}
     */
    async getWithMetadata(schluessel, opts) {
      const u = await umschlagLesen(pfad(schluessel));
      return u ? { data: inForm(u, opts), metadata: u.metadata || {}, etag: u.etag } : null;
    },

    /**
     * Nur die Metadaten — ohne den Wert zu übergeben. Bei Dateien wird die
     * Datei trotzdem gelesen; sie ist klein genug, und ein zweites Format
     * nur dafür wäre eine zweite Fehlerquelle.
     * @param {string} schluessel
     * @returns {Promise<{metadata:object, etag:string}|null>}
     */
    async getMetadata(schluessel) {
      const u = await umschlagLesen(pfad(schluessel));
      return u ? { metadata: u.metadata || {}, etag: u.etag } : null;
    },

    /**
     * @param {string} schluessel
     * @param {string} daten
     * @param {{metadata?: object}} [opts]
     */
    async set(schluessel, daten, opts) {
      await schreiben(schluessel, "text", daten, opts);
    },

    /**
     * @param {string} schluessel
     * @param {any} daten
     * @param {{metadata?: object}} [opts]
     */
    async setJSON(schluessel, daten, opts) {
      await schreiben(schluessel, "json", daten, opts);
    },

    /** @param {string} schluessel */
    async delete(schluessel) {
      try {
        await unlink(pfad(schluessel));
      } catch (e) {
        if (!e || e.code !== "ENOENT") throw e;
      }
    },

    /**
     * Alle Schlüssel, wahlweise mit Präfix. Wie bei @netlify/blobs kommt eine
     * flache Liste zurück; der ETag steht dort, wo er ohne zweites Lesen zu
     * haben ist — hier also nicht, und kein Aufrufer verlangt ihn.
     * @param {{prefix?: string}} [opts]
     * @returns {Promise<{blobs: Array<{key: string}>, directories: string[]}>}
     */
    async list(opts) {
      const prefix = opts && opts.prefix ? String(opts.prefix) : "";
      let namen;
      try {
        namen = await readdir(verzeichnis);
      } catch (e) {
        if (e && e.code === "ENOENT") return { blobs: [], directories: [] };
        throw e;
      }
      const blobs = [];
      for (const n of namen) {
        if (n.endsWith(".tmp")) continue;
        const key = schluesselAus(n);
        if (key !== null && key.startsWith(prefix)) blobs.push({ key });
      }
      blobs.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
      return { blobs, directories: [] };
    },
  };
}

/**
 * Bleibt bei Netlify: lädt @netlify/blobs erst, wenn es gebraucht wird, und
 * reicht jeden Aufruf durch. So bleibt der Import hier synchron wie bisher.
 * @param {object} opts
 */
function netlifyStore(opts) {
  const laden = import("@netlify/blobs").then((m) => m.getStore(/** @type {any} */ (opts)));
  const durch = (/** @type {string} */ methode) =>
    (/** @type {any[]} */ ...a) => laden.then((s) => s[methode](...a));
  return {
    get: durch("get"),
    getWithMetadata: durch("getWithMetadata"),
    getMetadata: durch("getMetadata"),
    set: durch("set"),
    setJSON: durch("setJSON"),
    delete: durch("delete"),
    list: durch("list"),
  };
}

let gemeldet = false;

/**
 * Ersatz für `getStore` aus @netlify/blobs. Nimmt denselben Aufruf entgegen:
 * einen Namen oder `{ name, consistency }`. `consistency` ist bei Dateien
 * ohne Bedeutung — eine Platte ist immer „strong".
 * @param {string|{name: string, consistency?: string}} angabe
 */
export function getStore(angabe) {
  /** @type {{name?: string, consistency?: string}} */
  const opts = typeof angabe === "string" ? { name: angabe } : angabe || {};
  const name = String(opts.name || "");
  if (!STORE_NAME.test(name)) throw new Error(`Ablage: unzulässiger Store-Name „${name}"`);

  const art = ablageArt();
  if (!gemeldet) {
    gemeldet = true;
    console.log(art === "dateien"
      ? `Ablage: Dateien unter ${ablageWurzel()}`
      : "Ablage: @netlify/blobs");
  }
  return art === "netlify" ? netlifyStore(opts) : dateiStore(name);
}
