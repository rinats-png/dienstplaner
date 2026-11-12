/* ==========================================================================
   TEILSPEICHERUNG (WP-48.3) — Delta je Segment mit Versionen

   Entwurf: docs/acc45/WP48-TEILSPEICHERUNG.md, Abschnitt 2 und 4.2.

   Grundsatz (2.1): Ein Teil-PUT ist definiert als der Voll-PUT von
   Sicht(gespeichert) ⊕ Δ. Diese Datei rechnet NUR die Form, die Versionen,
   die Erwartungswerte und den virtuellen Vollrumpf. Rechte, Stempel,
   Abschluss, Fachprüfung, Gestalt und Schreiben bleiben die unveränderte
   Schreibkette in daten.mjs (PUT /api/bestand) — es gibt keinen zweiten
   Rechtepfad. Die Listen hier sind Verteidigung in der Tiefe: Sie können
   nur strenger sein als der Voll-PUT, nie großzügiger.

   Segmente:
   - Kernfeld `kern:<feld>`: ganzer Feldwert des eigenen Betriebs, ersetzt,
     mit Basisversion (sha256-Präfix über stabiles JSON des Felds in der
     SICHT der Rolle — nie über verborgene Daten, sonst Seitenkanal).
   - Monatszelle `abweichungen`/`erfassung`, Schlüssel `Person|JJJJ-MM-TT`,
     mit Erwartungswert `alt` (compare-and-set); `neu: null` löscht.
   - Nur Server (nie im Delta, 422): Stempel, eingefrorenes Ist,
     Monatsabschluss, Protokoll, Vertragsfelder, Kennung/Stand/Sitzung.
   ========================================================================== */

import { createHash } from "node:crypto";
import { BETRIEB } from "./sicht.mjs";
import { MONATSFELDER, monatVon } from "./scherben.mjs";

export const TEILWEG_FORMAT = 1;

/** Grenzen je Anfrage (4.2 „Größenlimits je Segment"). */
export const TEILE_GRENZEN = Object.freeze({
  rumpfBytes: 2 * 1024 * 1024,
  zellen: 5000,
  kernfelder: 25,
  kernfeldBytes: 1024 * 1024,
  zellwertBytes: 4 * 1024,
});

/** Zellfelder: flache Schlüssel/Wert-Paare je Person und Tag. */
export const ZELLFELDER = Object.freeze(["abweichungen", "erfassung"]);

/** Kernfelder, die nie über den Teilweg kommen — der Server oder der Betreiber setzt sie. */
export const NUR_SERVER = Object.freeze([
  /* Kennung, Stand, Sitzung */
  "id", "session", "version", "stand",
  /* Ist und Abschluss: nur über die eigenen Endpunkte (Stempeln, Korrektur, Abschluss) */
  "einstempeln", "istEingefroren", "monatsabschluss", "protokoll",
  /* entstehen nur in der Antwort (rechte.mjs abgeleiteteEntfernen) */
  "sichtIstDaten", "auswertungBetriebsrat", "klaerung",
  /* Kaufmännisches und Vertragliches (sicht.mjs BETRIEB) und der Vertragsstatus */
  "tarif", "seit", "bis", "testTage", "selbstAngelegt", "preisgestaltung", "rabattGrund",
  "kontakt", "kontaktName", "anschrift", "ustId", "notiz", "raum",
  "pakete", "status", "stichtag", "laeuftAb",
  /* gehört dem Betreiber */
  "adressAenderungen",
]);

/** Kernfelder, die der Teilweg annimmt: der Positivkatalog (sicht.mjs BETRIEB) ohne Monats- und Serverfelder. */
export const KERNFELDER = Object.freeze(Object.keys(BETRIEB)
  .filter((f) => !MONATSFELDER.includes(f) && !NUR_SERVER.includes(f)));

const OBEN = new Set(["format", "epoche", "anfrage", "durch", "kern", "zellen"]);
const ZELLE = new Set(["feld", "k", "alt", "neu"]);
const KERNTEIL = new Set(["basis", "wert"]);
const SCHLUESSEL = /^([^|]{1,64})\|(\d{4})-(\d{2})-(\d{2})$/;
const VERSION = /^[0-9a-f]{32}$/;
const ANFRAGE = /^[A-Za-z0-9_-]{8,64}$/;

/** Stabiles JSON (Schlüssel sortiert, undefined wie fehlend). */
export function stabil(x) {
  if (x === undefined) return "null";
  if (x === null || typeof x !== "object") return JSON.stringify(x);
  if (Array.isArray(x)) return `[${x.map((e) => (e === undefined ? "null" : stabil(e))).join(",")}]`;
  return `{${Object.keys(x).filter((k) => x[k] !== undefined).sort()
    .map((k) => `${JSON.stringify(k)}:${stabil(x[k])}`).join(",")}}`;
}

/** Version eines Segmentinhalts: sha256-Präfix (32 Hex) über stabiles JSON. */
export const version = (x) => createHash("sha256").update(stabil(x)).digest("hex").slice(0, 32);

/** JSON-gleich (fehlend ≙ null). */
export const gleich = (a, b) => stabil(a === undefined ? null : a) === stabil(b === undefined ? null : b);

const groesse = (x) => Buffer.byteLength(stabil(x), "utf8");

function datumGueltig(j, m, t) {
  const d = new Date(Date.UTC(Number(j), Number(m) - 1, Number(t)));
  return d.getUTCFullYear() === Number(j) && d.getUTCMonth() === Number(m) - 1 && d.getUTCDate() === Number(t);
}

/**
 * Prüft die Form eines Teil-Rumpfs (4.2). Gibt null oder { status, code, grund } zurück.
 * Der Betrieb kommt nie aus dem Rumpf, nur aus der Sitzung.
 * @param {any} r
 * @param {{ rolle: string, person: string|null }} sitzung
 */
export function teileFormFehler(r, sitzung) {
  const f = (grund, status = 422, code = "TEILE_UNGUELTIG") => ({ status, code, grund });
  if (!r || typeof r !== "object" || Array.isArray(r)) return f("Kein Teil-Rumpf übergeben.");
  if (groesse(r) > TEILE_GRENZEN.rumpfBytes) return f("Zu viele Änderungen auf einmal — bitte in Schritten speichern.", 413, "TEILE_ZU_GROSS");
  for (const k of Object.keys(r)) if (!OBEN.has(k)) return f(`Unbekanntes Feld ${k.slice(0, 40)}.`);
  if (r.format !== TEILWEG_FORMAT) return f("Unbekanntes Format.");
  if (typeof r.epoche !== "string" || !/^[0-9a-f]{8,64}$/.test(r.epoche)) return f("Epoche fehlt.");
  if (r.anfrage !== undefined && (typeof r.anfrage !== "string" || !ANFRAGE.test(r.anfrage))) return f("Ungültige Anfragekennung.");
  if (r.durch !== undefined && (typeof r.durch !== "string" || r.durch.length > 200)) return f("Ungültige Angabe durch.");

  const kern = r.kern === undefined ? {} : r.kern;
  if (!kern || typeof kern !== "object" || Array.isArray(kern)) return f("kern ist kein Objekt.");
  const felder = Object.keys(kern);
  if (felder.length > TEILE_GRENZEN.kernfelder) return f("Zu viele Kernfelder auf einmal — bitte in Schritten speichern.", 413, "TEILE_ZU_GROSS");
  for (const feld of felder) {
    if (MONATSFELDER.includes(feld) || NUR_SERVER.includes(feld)) return f(`Das Feld ${feld} ändert sich nicht über die Teilspeicherung.`);
    if (!KERNFELDER.includes(feld)) return f(`Unbekanntes Kernfeld ${feld.slice(0, 40)}.`);
    const t = kern[feld];
    if (!t || typeof t !== "object" || Array.isArray(t)) return f(`Kernfeld ${feld}: Form ungültig.`);
    for (const k of Object.keys(t)) if (!KERNTEIL.has(k)) return f(`Kernfeld ${feld}: unbekannte Angabe ${k.slice(0, 40)}.`);
    if (typeof t.basis !== "string" || !VERSION.test(t.basis)) return f(`Kernfeld ${feld}: Basisversion fehlt.`);
    /* Kein „fehlt = löschen" (Lehre WP-23b/19.0): null oder fehlend ist keine Löschung, sondern ein Fehler. */
    if (t.wert === undefined || t.wert === null) return f(`Kernfeld ${feld}: Wert fehlt.`);
    if (groesse(t.wert) > TEILE_GRENZEN.kernfeldBytes) return f(`Kernfeld ${feld} ist zu groß — bitte in Schritten speichern.`, 413, "TEILE_ZU_GROSS");
  }

  const zellen = r.zellen === undefined ? [] : r.zellen;
  if (!Array.isArray(zellen)) return f("zellen ist keine Liste.");
  if (zellen.length > TEILE_GRENZEN.zellen) return f("Zu viele Zellen auf einmal — bitte in Schritten speichern.", 413, "TEILE_ZU_GROSS");
  if (!felder.length && !zellen.length) return f("Keine Änderung übergeben.");
  const gesehen = new Set();
  for (const z of zellen) {
    if (!z || typeof z !== "object" || Array.isArray(z)) return f("Zelle: Form ungültig.");
    for (const k of Object.keys(z)) if (!ZELLE.has(k)) return f(`Zelle: unbekannte Angabe ${k.slice(0, 40)}.`);
    if (!ZELLFELDER.includes(z.feld)) return f("Zelle: Feld nicht erlaubt.");
    const m = typeof z.k === "string" ? SCHLUESSEL.exec(z.k) : null;
    if (!m || !datumGueltig(m[2], m[3], m[4])) return f("Zelle: Schlüssel ungültig.");
    if (!("neu" in z)) return f("Zelle: neuer Wert fehlt (null löscht).");
    if (groesse(z.neu) > TEILE_GRENZEN.zellwertBytes || groesse(z.alt) > TEILE_GRENZEN.zellwertBytes) return f("Zelle: Wert zu groß.", 413, "TEILE_ZU_GROSS");
    const id = `${z.feld}\u0000${z.k}`;
    if (gesehen.has(id)) return f("Zelle doppelt übergeben.");
    gesehen.add(id);
    /* Frühe Grobprüfung (4.2): Beschäftigte ändern nur Zellen der eigenen Person. Die volle Prüfung macht die
       Schreibkette auf dem virtuellen Rumpf; diese hier kann nur strenger sein. */
    if (sitzung.rolle === "mitarbeiter" && (!sitzung.person || m[1] !== String(sitzung.person)))
      return f("Angaben anderer Personen ändern sich so nicht.", 403, "TEILE_FREMD");
  }
  return null;
}

/** Der eigene Betrieb in der Sicht: über die Kennung des gespeicherten eigenen Betriebs. */
export function sichtBetrieb(sicht, mandantId) {
  if (!sicht || !Array.isArray(sicht.mandanten)) return null;
  return sicht.mandanten.find((m) => m && typeof m === "object" && m.id === mandantId) || null;
}

/** Versionen aller Segmente der Sicht (2.3 „Fähigkeit"): Kernfelder und Monatsscherben. */
export function teileVersionen(sicht, mandantId) {
  const m = sichtBetrieb(sicht, mandantId);
  if (!m) return {};
  const aus = {};
  for (const feld of Object.keys(m)) if (KERNFELDER.includes(feld)) aus[`kern:${feld}`] = version(m[feld]);
  for (const [monat, inhalt] of monatsInhalte(m)) aus[`${mandantId}::${monat}`] = version(inhalt);
  return aus;
}

/** Monat → { abweichungen: {…}, erfassung: {…} } aus der Sicht (nur die Zellfelder). */
function monatsInhalte(m, nur = null) {
  const je = new Map();
  for (const feld of ZELLFELDER) {
    const w = m[feld];
    if (!w || typeof w !== "object" || Array.isArray(w)) continue;
    for (const [k, v] of Object.entries(w)) {
      const monat = monatVon(k) || "ohne";
      if (nur && !nur.has(monat)) continue;
      if (!je.has(monat)) je.set(monat, Object.fromEntries(ZELLFELDER.map((f) => [f, {}])));
      je.get(monat)[feld][k] = v;
    }
  }
  return je;
}

/** Versionen nur der berührten Segmente (Antwort 200). */
export function beruehrteVersionen(sicht, mandantId, beruehrt) {
  const m = sichtBetrieb(sicht, mandantId);
  if (!m) return {};
  const aus = {};
  for (const feld of beruehrt.kern) aus[`kern:${feld}`] = version(m[feld]);
  const monate = new Set(beruehrt.monate);
  const inhalte = monatsInhalte(m, monate);
  for (const monat of monate) aus[`${mandantId}::${monat}`] = version(inhalte.get(monat) || Object.fromEntries(ZELLFELDER.map((f) => [f, {}])));
  return aus;
}

/**
 * Wendet ein (formgeprüftes) Delta auf die Sicht an (2.3 Schritte 4–6).
 * Ein einziger Konflikt → alles oder nichts: { konflikt } ohne virtuellen Rumpf.
 * Sonst { virtuell, beruehrt }: die Sicht mit dem eigenen Betrieb ⊕ Δ. Die Sicht selbst bleibt unverändert.
 * @param {any} sicht       bestandFuerAntwort(gespeichert, sitzung)
 * @param {string} mandantId Kennung des eigenen Betriebs (aus dem gespeicherten Stand, nie aus dem Rumpf)
 * @param {any} delta
 */
export function teileAnwenden(sicht, mandantId, delta) {
  const m = sichtBetrieb(sicht, mandantId);
  if (!m) return { fehlt: true };
  const konfliktKern = [];
  const konfliktZellen = [];
  const neu = { ...m };
  const beruehrt = { kern: [], monate: [] };
  for (const [feld, t] of Object.entries(delta.kern || {})) {
    const aktuell = m[feld];
    /* Basis passt, oder der Wert ist schon der aktuelle (Wiederholung ohne Wirkung). */
    if (t.basis !== version(aktuell) && !gleich(t.wert, aktuell)) {
      konfliktKern.push({ feld, aktuell: aktuell === undefined ? null : aktuell, version: version(aktuell) });
      continue;
    }
    neu[feld] = t.wert;
    beruehrt.kern.push(feld);
  }
  const monate = new Set();
  const kopiert = new Set();
  for (const z of delta.zellen || []) {
    const quelle = m[z.feld] && typeof m[z.feld] === "object" && !Array.isArray(m[z.feld]) ? m[z.feld] : {};
    const aktuell = Object.prototype.hasOwnProperty.call(quelle, z.k) ? quelle[z.k] : undefined;
    if (!gleich(z.alt, aktuell) && !gleich(z.neu, aktuell)) {
      konfliktZellen.push({ feld: z.feld, k: z.k, aktuell: aktuell === undefined ? null : aktuell });
      continue;
    }
    if (!kopiert.has(z.feld)) { neu[z.feld] = { ...quelle }; kopiert.add(z.feld); }
    if (z.neu === null) delete neu[z.feld][z.k];
    else neu[z.feld][z.k] = z.neu;
    monate.add(z.k.split("|")[1].slice(0, 7));
  }
  if (konfliktKern.length || konfliktZellen.length) return { konflikt: { kern: konfliktKern, zellen: konfliktZellen } };
  beruehrt.monate = [...monate].sort();
  return { virtuell: { ...sicht, mandanten: sicht.mandanten.map((x) => (x === m ? neu : x)) }, beruehrt };
}

/* ---------------------------------------------------------------------------
   Idempotenz (2.3 Schritt 7): dieselbe Anfragekennung derselben Sitzung im
   selben Raum bekommt 10 Minuten lang dieselbe Antwort, ohne neu zu schreiben.
   Gemerkt wird nur ein Erfolg; eine Absage rechnet die nächste Anfrage neu.
   --------------------------------------------------------------------------- */
const IDEMPOTENZ_MS = 10 * 60 * 1000;
const IDEMPOTENZ_MAX = 5000;
const gemerkt = new Map();

const idemSchluessel = (raum, sitzung, anfrage) =>
  `${raum}\u0000${sitzung.rolle}\u0000${sitzung.person ?? ""}\u0000${sitzung.mandantId ?? ""}\u0000${anfrage}`;

export function idempotenzLesen(raum, sitzung, anfrage, jetzt = Date.now()) {
  if (!anfrage) return null;
  const k = idemSchluessel(raum, sitzung, anfrage);
  const e = gemerkt.get(k);
  if (!e) return null;
  if (jetzt - e.zeit > IDEMPOTENZ_MS) { gemerkt.delete(k); return null; }
  return e.antwort;
}

export function idempotenzMerken(raum, sitzung, anfrage, antwortDaten, jetzt = Date.now()) {
  if (!anfrage) return;
  for (const [k, e] of gemerkt) { if (jetzt - e.zeit > IDEMPOTENZ_MS || gemerkt.size >= IDEMPOTENZ_MAX) gemerkt.delete(k); else break; }
  gemerkt.set(idemSchluessel(raum, sitzung, anfrage), { zeit: jetzt, antwort: antwortDaten });
}
