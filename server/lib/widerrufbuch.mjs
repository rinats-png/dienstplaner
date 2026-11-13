/* ==========================================================================
   WIDERRUFBUCH — widerrufene und ersetzte Zugangsdaten überleben jeden Rücksprung
   (Betreiberentscheidung E-M6, 2026-11-13)

   Ein Zugangscode (konto:<Ablageschlüssel>) gilt nicht mehr, sobald er gesperrt
   (zurückgezogen, ersetzt), als Ersteinrichtungscode (OPT-1) verbraucht, als
   Erstanmeldecode OHNE Person verbraucht („belegt“, PR #281) oder mit seinem
   Raum gelöscht ist. Ein benannter Verwalterschlüssel (verwalter:<sha256>) gilt
   nicht mehr, sobald er gesperrt ist. Bis hierher stand das NUR in der Ablage
   (`gesperrt: true`). Eine Wiederherstellung einer älteren Sicherung spielte
   den Stand von vorher zurück — und mit ihm den ungesperrten Zugang.

   Deshalb liegt die Autorität AUSSERHALB der gesicherten Ablage, neben der
   Schlüsselepoche (schluesselepoche.mjs):

     W  <CENTRIC_ZUSTAND>/zugang-widerrufe.json
          { fassung, id, ids,
            eintraege: { <Ablageschlüssel eines Codes>: { am, grund } },
            verwalter: { <sha256 eines Verwalterschlüssels>: { am, grund } },
            betriebe:  { <Betriebskennung>: { am, grund, person? } },
            wiederherstellungen: [{ zeit, sicherungErstellt }], siegel }
        Nur Prüfsummen (wie die Dateinamen der Ablage), nie ein Code oder
        Schlüssel. Das Siegel ist ein HMAC über den Inhalt mit einem aus
        CENTRIC_PFEFFER abgeleiteten Schlüssel: Wer die Datei ohne Pfeffer
        verändert, kürzt oder aus einer anderen Umgebung einsetzt, fällt auf.
        `verwalter` und `person` gehen nur ins Siegel, wenn belegt — ein Buch
        ohne sie bleibt gültig.
     A  centric/widerrufbuch:anker   { id }   (in der Ablage, mitgesichert)
        Sagt: „Zu dieser Ablage gehört ein Widerrufbuch mit dieser Kennung."
        Fehlt W, obwohl A da ist, ist der Zustand unbekannt.

   Zwei Klassen von Einträgen, bewusst getrennt (Review E-M6, Befund 1):
     Widerruf (`eintraege`, `verwalter`): Der Zugang gilt nie wieder.
     Abschluss (`betriebe`): „Die Ersteinrichtung dieses Betriebs ist
        abgeschlossen“ (PR #281, Marke `erstleitung-marke:<raum>:<mandantId>`).
        Das sperrt KEINEN Code: Ein mit Grund „angelegt“ eingelöster
        Erstanmeldecode ist danach der gewöhnliche, personengebundene Code der
        ersten Leitung. Der Abschluss stellt nach einem Rücksprung nur die
        Marke wieder her, damit kein Erstanmeldecode des Betriebs je wieder
        eine erste Leitung anlegt.

   Ein Code gilt nur, wenn W lesbar und unversehrt ist, zu A passt UND keiner
   seiner Ablageschlüssel (neu, alt, Kette `ersetztDurch` in beide Richtungen)
   darin steht. Jeder Zweifel schließt die Tür (fail-closed): Anmeldung 503,
   laufende Code-Sitzung 503, Kalenderfeed aus einem Code 503, benannter
   Verwalterschlüssel abgewiesen (der Ursprungsschlüssel CENTRIC_ADMIN hängt
   nicht am Buch).

   Reihenfolge eines Widerrufs (Review E-M6, Befund 3): ZUERST in der Ablage
   sperren und die Sitzungen beenden — der Widerruf wirkt sofort, auch wenn W
   gerade nicht schreibbar ist —, DANN W. Scheitert W, meldet der Aufrufer das
   laut („Widerruf wirksam, Widerrufbuch nicht beschrieben“, Protokoll, Zähler
   „widerrufbuch“ in /gesund); der nächste Widerruf, jeder Serverstart und jede
   Wiederherstellung mit dem Werkzeug sammeln den Eintrag aus der Ablage nach
   (einsammeln). Ein Abbruch zwischen den beiden Schreibvorgängen lässt den
   Zugang an mindestens einer Stelle gesperrt. Nur wo die Ablage den Zugang
   danach NICHT mehr kennt (Raumlöschung), steht W vorn — scheitert W dort,
   wird gesperrt statt gelöscht.

   Drei Wege halten Ablage und Buch übereinander, damit auch ein ÄLTERES Bild,
   das W nicht kennt, nichts wiederbelebt (es kennt `gesperrt`, aber nicht
   unbedingt `ersetztDurch` — Produktion 274bfa0):
     1. Widerruf: `gesperrt: true` an JEDEM Glied der Kette in der Ablage,
        dann W (mit der ganzen Kette).
     2. Nachziehen (Serverstart, Wiederherstellungswerkzeug): Jedes Konto und
        jeder Verwalterschlüssel, der in W steht, aber in der Ablage nicht
        gesperrt ist, wird gesperrt; fehlende Marken abgeschlossener Betriebe
        werden angelegt.
     3. Einsammeln: Was die Ablage gesperrt oder abgeschlossen kennt (auch aus
        einem älteren Bild, das W nicht schrieb), kommt nach W — vor jedem
        Tausch der Ablage.

   W wird nur fortgeschrieben, nie gekürzt. Ein Zugang, der einmal darin
   steht, gilt nie wieder; es gibt keinen Weg, ihn zu entsperren.
   ========================================================================== */

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdir, open, readFile, rename, rm, stat } from "node:fs/promises";
import path from "node:path";

export const BUCH_DATEI = "zugang-widerrufe.json";
export const ANKER_SCHLUESSEL = "widerrufbuch:anker";
/** Präfix der Marke „Erstanmeldung festgelegt“ aus PR #281 (erstleitung.mjs, erstleitungMarkeSchluessel). */
export const MARKE_PRAEFIX = "erstleitung-marke:";
export const VERWALTER_PRAEFIX = "verwalter:";
/** Nachtrag (Raumlöschung bei nicht schreibbarem Buch): Codes, die die Ablage schon gelöscht hat, die aber noch ins
    Buch müssen. Liegt in der Ablage, damit Serverstart, nächster Widerruf und Wiederherstellungswerkzeug sie finden. */
export const NACHTRAG_SCHLUESSEL = "widerrufbuch:nachtrag";
const FASSUNG = 1;
const ID_FORM = /^[0-9a-f]{32}$/;
const HEX64 = /^[0-9a-f]{64}$/;
const SCHLUESSEL_FORM = /^[A-Za-z0-9_:-]{8,160}$/;
const PERSON_FORM = /^[A-Za-z0-9_-]{0,64}$/;
const zufall = () => randomBytes(16).toString("hex");

export class WiderrufbuchFehler extends Error {
  /** @param {string} m */
  constructor(m) { super(m); this.code = "BESTAND_UNLESBAR"; }
}

/** Der Siegelschlüssel: aus dem Pfeffer abgeleitet, nie der Pfeffer selbst. */
function siegelSchluessel(pfeffer = process.env.CENTRIC_PFEFFER || "") {
  return createHash("sha256").update(`centric-widerrufbuch-v1:${pfeffer}`).digest();
}

const zeile = (v) => ({ am: String(v.am || ""), grund: String(v.grund || "") });

/** Feste Reihenfolge für das Siegel. */
function kanonisch(b) {
  const eintraege = {};
  for (const k of Object.keys(b.eintraege).sort()) eintraege[k] = zeile(b.eintraege[k]);
  const betriebe = {};
  for (const k of Object.keys(b.betriebe).sort()) {
    const v = b.betriebe[k];
    betriebe[k] = { ...zeile(v), ...(v.person ? { person: String(v.person) } : {}) };
  }
  const verwalter = {};
  for (const k of Object.keys(b.verwalter || {}).sort()) verwalter[k] = zeile(b.verwalter[k]);
  return JSON.stringify({ fassung: b.fassung, id: b.id, ids: [...b.ids], eintraege, betriebe,
    ...(Object.keys(verwalter).length ? { verwalter } : {}),
    wiederherstellungen: b.wiederherstellungen.map((w) => ({ zeit: String(w.zeit), sicherungErstellt: String(w.sicherungErstellt) })) });
}

/** @param {any} b @param {string} [pfeffer] */
export function siegelBilden(b, pfeffer) {
  return createHmac("sha256", siegelSchluessel(pfeffer)).update(kanonisch(b)).digest("hex");
}

const istMap = (x) => !!x && typeof x === "object" && !Array.isArray(x);

/** Gestalt und Siegel prüfen. Wirft bei jedem Befund. */
function pruefen(o, datei, pfeffer) {
  const kaputt = (w) => new WiderrufbuchFehler(`Widerrufbuch ${datei} ${w} — kein Zugangscode gilt, bis das geklärt ist (BEREITSTELLUNG.md §5.4).`);
  if (!o || typeof o !== "object" || o.fassung !== FASSUNG || !ID_FORM.test(o.id) || !Array.isArray(o.ids)
    || !o.ids.every((i) => ID_FORM.test(i)) || !o.ids.includes(o.id)
    || !istMap(o.eintraege) || !istMap(o.betriebe) || (o.verwalter !== undefined && !istMap(o.verwalter))
    || !Array.isArray(o.wiederherstellungen) || typeof o.siegel !== "string" || !/^[0-9a-f]{64}$/.test(o.siegel))
    throw kaputt("ist beschädigt");
  for (const [k, v] of Object.entries(o.eintraege))
    if (!SCHLUESSEL_FORM.test(k) || !v || typeof v !== "object") throw kaputt("ist beschädigt");
  for (const [k, v] of Object.entries(o.betriebe))
    if (!HEX64.test(k) || !v || typeof v !== "object" || (v.person !== undefined && !PERSON_FORM.test(String(v.person))))
      throw kaputt("ist beschädigt");
  for (const [k, v] of Object.entries(o.verwalter || {}))
    if (!HEX64.test(k) || !v || typeof v !== "object") throw kaputt("ist beschädigt");
  for (const w of o.wiederherstellungen) if (!w || typeof w !== "object") throw kaputt("ist beschädigt");
  const soll = Buffer.from(siegelBilden(o, pfeffer), "hex");
  if (!timingSafeEqual(soll, Buffer.from(o.siegel, "hex"))) throw kaputt("trägt ein falsches Siegel (verändert oder anderer Pfeffer)");
  if (!o.verwalter) o.verwalter = {};
  return o;
}

/**
 * W lesen. null: Datei fehlt. Unlesbar, beschädigt, falsches Siegel: wirft.
 * @param {string} verz  Zustandsverzeichnis
 * @param {{pfeffer?: string}} [o]
 */
export async function buchLesen(verz, { pfeffer } = {}) {
  const datei = path.join(verz, BUCH_DATEI);
  let roh;
  try { roh = await readFile(datei, "utf8"); }
  catch (e) {
    if (/** @type {any} */ (e).code === "ENOENT") return null;
    throw new WiderrufbuchFehler(`Widerrufbuch nicht lesbar (${/** @type {any} */ (e).code || e}).`);
  }
  let o = null;
  try { o = JSON.parse(roh); } catch { /* unten */ }
  return pruefen(o, BUCH_DATEI, pfeffer);
}

/** Ein neues, leeres Buch (noch nicht geschrieben). */
export function buchNeu() {
  const id = zufall();
  return { fassung: FASSUNG, id, ids: [id], eintraege: {}, verwalter: {}, betriebe: {}, wiederherstellungen: [], siegel: "" };
}

/**
 * W atomar schreiben (Zwischendatei, fsync, Umbenennen, Verzeichnis-fsync), Dateirechte 0600.
 * @param {string} verz @param {any} b @param {{pfeffer?: string}} [o]
 */
export async function buchSchreiben(verz, b, { pfeffer } = {}) {
  const fertig = { ...b, siegel: siegelBilden(b, pfeffer) };
  if (!Object.keys(fertig.verwalter || {}).length) delete fertig.verwalter;
  try {
    await mkdir(verz, { recursive: true, mode: 0o700 });
    const ziel = path.join(verz, BUCH_DATEI);
    const tmp = `${ziel}.${process.pid}.${zufall()}.tmp`;
    const fh = await open(tmp, "wx", 0o600);
    try { await fh.writeFile(JSON.stringify(fertig)); await fh.sync(); } finally { await fh.close(); }
    try { await rename(tmp, ziel); } catch (e) { await rm(tmp, { force: true }); throw e; }
    try { const dh = await open(verz, "r"); try { await dh.sync(); } finally { await dh.close(); } } catch { /* Windows */ }
  } catch (e) {
    throw new WiderrufbuchFehler(`Widerrufbuch nicht schreibbar (${/** @type {any} */ (e).code || e}).`);
  }
  if (!fertig.verwalter) fertig.verwalter = {};
  return fertig;
}

/** Lässt sich dieser Ablageschlüssel ins Buch eintragen? (Gestalt eines Zugangsschlüssels, wie `eintragen` sie verlangt.) */
export const eintragbar = (/** @type {any} */ s) => typeof s === "string" && SCHLUESSEL_FORM.test(s);

/** Die eintragbaren Schlüssel eines Nachtrags (Inhalt von NACHTRAG_SCHLUESSEL); alles andere: keine. */
export function nachtragSchluessel(/** @type {any} */ n) {
  return istMap(n) && istMap(n.schluessel) ? Object.keys(n.schluessel).filter(eintragbar) : [];
}

/** Einträge hinzufügen (nie entfernen). Gibt die Zahl NEUER Einträge zurück. Ein Schlüssel, der sich nicht eintragen
    lässt, wird nicht still übergangen: Der Widerruf wäre sonst nicht dauerhaft (fail-closed, der Aufrufer bricht ab). */
export function eintragen(b, schluessel, grund, am = new Date().toISOString()) {
  let neu = 0;
  for (const s of schluessel) {
    if (typeof s !== "string" || !SCHLUESSEL_FORM.test(s))
      throw new WiderrufbuchFehler("Ein Zugangsschlüssel hat eine unbekannte Form und lässt sich nicht widerrufen.");
    if (Object.hasOwn(b.eintraege, s)) continue;
    b.eintraege[s] = { am, grund: String(grund).slice(0, 40) };
    neu++;
  }
  return neu;
}

/** Verwalterschlüssel (sha256 als Hex) eintragen (nie entfernen). */
export function verwalterEintragen(b, hashes, grund, am = new Date().toISOString()) {
  if (!b.verwalter) b.verwalter = {};
  let neu = 0;
  for (const s of hashes) {
    if (typeof s !== "string" || !HEX64.test(s))
      throw new WiderrufbuchFehler("Ein Verwalterschlüssel hat eine unbekannte Form und lässt sich nicht widerrufen.");
    if (Object.hasOwn(b.verwalter, s)) continue;
    b.verwalter[s] = { am, grund: String(grund).slice(0, 40) };
    neu++;
  }
  return neu;
}

/* ---------------------------------------------------------------------------
   Ketten: Ein Code kann unter mehreren Ablageschlüsseln liegen (alter Hash ohne
   Pfeffer → `ersetztDurch` → neuer Hash). Gesperrt an einer Stelle heißt
   gesperrt an jeder — in beiden Richtungen, auch für ein älteres Bild, das der
   Kette nicht folgt.
   --------------------------------------------------------------------------- */

/**
 * Alle Ablageschlüssel, die mit einem der gegebenen über `ersetztDurch` verbunden sind (beide Richtungen).
 * @param {Record<string, any>} konten  Ablageschlüssel → Konto
 * @param {Iterable<string>} start
 */
export function kettenHuelle(konten, start) {
  const nach = new Map();
  const von = new Map();
  for (const [h, k] of Object.entries(konten || {})) {
    const z = k && typeof k.ersetztDurch === "string" && k.ersetztDurch ? k.ersetztDurch : null;
    if (!z) continue;
    nach.set(h, z);
    if (!von.has(z)) von.set(z, []);
    von.get(z).push(h);
  }
  const aus = new Set();
  const offen = [...start].filter((s) => typeof s === "string" && s);
  let schritte = 0;
  while (offen.length && schritte++ < 10000) {
    const s = /** @type {string} */ (offen.pop());
    if (aus.has(s)) continue;
    aus.add(s);
    const n = nach.get(s);
    if (n && !aus.has(n)) offen.push(n);
    for (const v of von.get(s) || []) if (!aus.has(v)) offen.push(v);
  }
  return aus;
}

const leer = (p) => p === null || p === undefined || p === "";
const gesetzt = (v) => v !== undefined && v !== null && v !== false;

/**
 * Hat die Ablage diesen Code als nicht mehr gültig vermerkt?
 *   gesperrt                          zurückgezogen, ersetzt, nach Fehlversuchen gesperrt
 *   ersteinrichtungVerbraucht         OPT-1 (zugangscode-ersteinrichtung.mjs): danach ein unbekannter Code
 *   erstleitungVerbraucht „belegt“    PR #281: verbraucht OHNE Person — gilt für die Anmeldung nicht mehr
 * NICHT: erstleitungVerbraucht „angelegt“ (mit Person) — das ist der gewöhnliche Code der ersten Leitung.
 */
export function inAblageWiderrufen(k) {
  if (!k || typeof k !== "object") return false;
  if (k.gesperrt) return true;
  if (gesetzt(k.ersteinrichtungVerbraucht)) return true;
  const v = k.erstleitungVerbraucht;
  if (!gesetzt(v)) return false;
  /* Wie erstleitungUngueltig (PR #281): verbraucht und ohne Person. „belegt“ ausdrücklich, auch falls je eine Person
     daran stünde (fail-closed). */
  return (v && typeof v === "object" && v.grund === "belegt") || leer(k.person);
}

/**
 * Die Kennung eines Betriebs im Buch: HMAC über Raum und Betriebskennung (keine Namen im Zustandsverzeichnis).
 * @param {string} raum @param {string} mandantId @param {string} [pfeffer]
 */
export function betriebsKennung(raum, mandantId, pfeffer) {
  return createHmac("sha256", siegelSchluessel(pfeffer)).update(`betrieb|${String(raum)}|${String(mandantId)}`).digest("hex");
}

/** Schlüssel der Marke aus PR #281 (erstleitung.mjs: erstleitungMarkeSchluessel) — die dokumentierte Schnittstelle. */
export const markeSchluessel = (raum, mandantId) => `${MARKE_PRAEFIX}${raum}:${mandantId}`;

/** Aus einem Markenschlüssel Raum und Betrieb (die Betriebskennung ist das letzte Glied). */
export function markeZerlegen(schluessel) {
  if (typeof schluessel !== "string" || !schluessel.startsWith(MARKE_PRAEFIX)) return null;
  const rest = schluessel.slice(MARKE_PRAEFIX.length);
  const i = rest.lastIndexOf(":");
  if (i <= 0 || i === rest.length - 1) return null;
  return { raum: rest.slice(0, i), mandantId: rest.slice(i + 1) };
}

/** Raum und Betrieb, auf die ein Erstanmeldecode zeigt (offen oder verbraucht); sonst null. */
function erstleitungBetrieb(k) {
  if (!k || typeof k !== "object" || typeof k.bestand !== "string" || !k.bestand) return null;
  const z = istMap(k.erstleitung) ? k.erstleitung : istMap(k.erstleitungVerbraucht) ? k.erstleitungVerbraucht : null;
  if (!z) return null;
  const m = typeof z.mandantId === "string" && z.mandantId ? z.mandantId : typeof k.mandantId === "string" ? k.mandantId : null;
  return m ? { raum: k.bestand, mandantId: m } : null;
}

/**
 * Betriebe, deren Ersteinrichtung nach der Ablage abgeschlossen ist: jede Marke (PR #281) und jeder mit „angelegt“
 * eingelöste Erstanmeldecode. Mit der Personenkennung der ersten Leitung, soweit bekannt.
 * @param {Record<string, any>} konten
 * @param {Array<{raum: string, mandantId: string, personId?: string}>} marken
 */
function abgeschlosseneBetriebe(konten, marken) {
  const aus = [];
  for (const m of marken || []) aus.push({ kennung: betriebsKennung(m.raum, m.mandantId), person: m.personId || "" });
  for (const k of Object.values(konten || {})) {
    const v = k && k.erstleitungVerbraucht;
    if (!istMap(v) || v.grund !== "angelegt") continue;
    const b = erstleitungBetrieb(k);
    if (b) aus.push({ kennung: betriebsKennung(b.raum, b.mandantId), person: String(v.personId || k.person || "") });
  }
  return aus;
}

/** Betriebe als abgeschlossen eintragen (nie entfernen; eine fehlende Personenkennung wird ergänzt). Zahl der Änderungen. */
export function betriebeEintragen(b, liste, grund, am = new Date().toISOString()) {
  let neu = 0;
  for (const x of liste) {
    const { kennung, person = "" } = typeof x === "string" ? { kennung: x } : x;
    if (typeof kennung !== "string" || !HEX64.test(kennung)) continue;
    const p = PERSON_FORM.test(String(person)) ? String(person) : "";
    const da = b.betriebe[kennung];
    if (da) {
      if (!da.person && p) { b.betriebe[kennung] = { ...da, person: p }; neu++; }
      continue;
    }
    b.betriebe[kennung] = { am, grund: String(grund).slice(0, 40), ...(p ? { person: p } : {}) };
    neu++;
  }
  return neu;
}

/**
 * Was die Ablage selbst als widerrufen oder abgeschlossen kennt (samt Kette), in das Buch übernehmen.
 * @param {any} b  Buch
 * @param {Record<string, any>} konten
 * @param {{verwalter?: Record<string, any>, marken?: Array<{raum: string, mandantId: string, personId?: string}>,
 *   nachtrag?: string[]}} [weitere]
 *   verwalter: sha256 → Eintrag; marken: Marken „Erstanmeldung festgelegt“ (PR #281);
 *   nachtrag: Schlüssel aus NACHTRAG_SCHLUESSEL (aus der Ablage schon gelöscht, noch nicht im Buch)
 */
export function einsammeln(b, konten, { verwalter = {}, marken = [], nachtrag = [] } = {}) {
  const gesperrt = Object.entries(konten || {}).filter(([, k]) => inAblageWiderrufen(k)).map(([h]) => h);
  const im = new Set(Object.keys(b.eintraege));
  const huelle = kettenHuelle(konten, [...gesperrt, ...im, ...(nachtrag || []).filter(eintragbar)]);
  const v = Object.entries(verwalter || {}).filter(([h, e]) => HEX64.test(h) && e && e.gesperrt).map(([h]) => h);
  return eintragen(b, [...huelle], "aus-ablage") + verwalterEintragen(b, v, "aus-ablage")
    + betriebeEintragen(b, abgeschlosseneBetriebe(konten, marken), "aus-ablage");
}

/**
 * Welche Konten der Ablage müssen nach dem Buch gesperrt werden? (Buch samt Kette, in der Ablage noch nicht gesperrt.)
 * @returns {string[]}
 */
export function nachzuziehen(b, konten) {
  const huelle = kettenHuelle(konten, Object.keys(b.eintraege));
  return [...huelle].filter((h) => konten[h] && !konten[h].gesperrt);
}

/** Welche Verwalterschlüssel der Ablage stehen im Buch, sind dort aber nicht gesperrt? */
export function verwalterNachzuziehen(b, verwalter) {
  return Object.keys(verwalter || {}).filter((h) => Object.hasOwn(b.verwalter || {}, h) && verwalter[h] && !verwalter[h].gesperrt);
}

/**
 * Welche Marken „Erstanmeldung festgelegt“ fehlen in der Ablage, obwohl das Buch den Betrieb als abgeschlossen kennt?
 * Gesucht wird über die Erstanmeldecodes der Ablage (offen oder verbraucht): nur sie können eine erste Leitung anlegen.
 * @returns {Array<{schluessel: string, wert: {personId: string, am: string}}>}
 */
export function markenNachzuziehen(b, konten, marken) {
  const da = new Set((marken || []).map((m) => markeSchluessel(m.raum, m.mandantId)));
  const aus = new Map();
  for (const k of Object.values(konten || {})) {
    const z = erstleitungBetrieb(k);
    if (!z) continue;
    const s = markeSchluessel(z.raum, z.mandantId);
    if (da.has(s) || aus.has(s)) continue;
    const e = b.betriebe[betriebsKennung(z.raum, z.mandantId)];
    if (e) aus.set(s, { schluessel: s, wert: { personId: String(e.person || ""), am: String(e.am || "") } });
  }
  return [...aus.values()];
}

/** Der gesperrte Stand eines Kontos oder Verwalterschlüssels, wie ihn jede Fassung der Anwendung versteht. */
export const gesperrtesKonto = (k, durch = "widerrufbuch", am = new Date().toISOString()) =>
  ({ ...k, gesperrt: true, gesperrtAm: k && k.gesperrtAm ? k.gesperrtAm : am, gesperrtDurch: k && k.gesperrtDurch ? k.gesperrtDurch : durch });

/* ---------------------------------------------------------------------------
   Im Server: eine Reihe je Prozess, ein Zwischenspeicher nach Dateistand
   --------------------------------------------------------------------------- */

/** @type {Promise<any>} */
let reihe = Promise.resolve();
/** @template T @param {() => Promise<T>} fn @returns {Promise<T>} */
function nacheinander(fn) {
  const r = reihe.then(fn, fn);
  reihe = r.catch(() => {});
  return r;
}

/* Lage für /gesund (gesund.mjs, Prüfung „widerrufbuch“): „unklar“ — das Buch ließ sich zuletzt nicht prüfen (kein Code
   gilt); „nachtrag“ — ein Widerruf wirkt in der Ablage, steht aber noch nicht im Buch (bis zum nächsten gelungenen
   Schreiben: nächster Widerruf, Serverstart oder Wiederherstellung mit dem Werkzeug). Nur Zustände, keine Kennungen. */
const lage = { unklar: false, nachtrag: false };
/** @returns {{stufe: "ok"|"warnung", text?: string}} */
export function widerrufbuchLage() {
  if (lage.unklar) return { stufe: "warnung", text: "Widerrufbuch nicht prüfbar: kein Zugangscode gilt (BEREITSTELLUNG.md §5.4)" };
  if (lage.nachtrag) return { stufe: "warnung", text: "Widerruf wirksam, Widerrufbuch nicht beschrieben (Nachtrag offen)" };
  return { stufe: "ok" };
}
/** @template T @param {Promise<T>} p @param {{schreibt?: boolean}} [o] @returns {Promise<T>} */
async function vermerken(p, { schreibt = false } = {}) {
  try {
    const r = await p;
    lage.unklar = false;
    if (schreibt) lage.nachtrag = false;
    return r;
  } catch (e) {
    if (schreibt) lage.nachtrag = true; else lage.unklar = true;
    throw e;
  }
}

/** Nachtrag im Speicher (falls schon das Schreiben von NACHTRAG_SCHLUESSEL scheiterte): Schlüssel → Grund. */
const imSpeicher = /** @type {Map<string, string>} */ (new Map());

/** Nach gelungenem Schreiben des Buchs den eingesammelten Nachtrag abräumen (in der Reihe, also ohne Wettlauf). */
async function nachtragAbraeumen(/** @type {any} */ store, /** @type {{nachtrag: string[], nachtragDa: boolean}} */ a) {
  for (const s of a.nachtrag) imSpeicher.delete(s);
  if (a.nachtragDa) {
    try { await store.delete(NACHTRAG_SCHLUESSEL); } catch { /* bleibt stehen: harmlos, er wird erneut eingesammelt */ }
  }
}

/** Zwischenspeicher: geprüftes Buch zum Dateistand (Größe, Zeit, Inode) und Verzeichnis. Jede Prüfung kostet ein stat. */
let zwischen = /** @type {{marke: string, buch: any}|null} */ (null);

async function verzeichnis() {
  const { zustandsVerzeichnis } = await import("./schluesselepoche.mjs");
  try { return zustandsVerzeichnis(); }
  catch (e) { throw new WiderrufbuchFehler(/** @type {Error} */ (e).message); }
}

const ankerLesen = async (store) => {
  try {
    const a = await store.get(ANKER_SCHLUESSEL, { type: "json" });
    if (a === null || a === undefined) return null;
    if (!a || !ID_FORM.test(a.id)) throw new Error("Anker beschädigt");
    return a;
  } catch (e) { throw new WiderrufbuchFehler(`Anker des Widerrufbuchs nicht lesbar (${/** @type {any} */ (e).message || e}).`); }
};

/** Alle Zugänge, Verwalterschlüssel und Marken der Ablage — streng (ein Lesefehler wirft, nie „leer“). */
async function ablageStand(store) {
  const { alleKontenStreng } = await import("./konten.mjs");
  try {
    const konten = await alleKontenStreng(store);
    /** @type {Record<string, any>} */ const verwalter = {};
    for (const b of (await store.list({ prefix: VERWALTER_PRAEFIX })).blobs) {
      const h = b.key.slice(VERWALTER_PRAEFIX.length);
      const e = await store.get(b.key, { type: "json" });
      if (e && HEX64.test(h)) verwalter[h] = e;
    }
    const marken = [];
    for (const b of (await store.list({ prefix: MARKE_PRAEFIX })).blobs) {
      const z = markeZerlegen(b.key);
      if (!z) continue;
      const m = await store.get(b.key, { type: "json" });
      if (m === null || m === undefined) continue;
      marken.push({ ...z, personId: istMap(m) && typeof m.personId === "string" ? m.personId : "" });
    }
    const n = await store.get(NACHTRAG_SCHLUESSEL, { type: "json" });
    const nachtrag = [...new Set([...nachtragSchluessel(n), ...imSpeicher.keys()])];
    return { konten, verwalter, marken, nachtrag, nachtragDa: n !== null && n !== undefined };
  } catch (e) { throw new WiderrufbuchFehler(`Zugänge nicht lesbar (${/** @type {any} */ (e).message || e}).`); }
}

/**
 * Den gültigen Stand feststellen (in der Reihe). Legt beim allerersten Mal das Buch an (eingesammelt aus der Ablage).
 * Wirft WiderrufbuchFehler bei unbekanntem Zustand.
 */
async function standJetzt(store) {
  const verz = await verzeichnis();
  const buch = await buchLesen(verz);
  const anker = await ankerLesen(store);
  if (buch) {
    if (anker && !buch.ids.includes(anker.id))
      throw new WiderrufbuchFehler("Widerrufbuch gehört nicht zu dieser Ablage (Kennung des Ankers unbekannt).");
    if (!anker) await store.setJSON(ANKER_SCHLUESSEL, { id: buch.id });
    return buch;
  }
  if (anker) throw new WiderrufbuchFehler("Widerrufbuch fehlt, obwohl die Ablage eines kennt.");
  /* Erstes Mal (Einführung, oder Ablage ohne je ein Buch): aus der Ablage einsammeln, dann den Anker setzen. */
  const neu = buchNeu();
  const a = await ablageStand(store);
  einsammeln(neu, a.konten, a);
  const geschrieben = await buchSchreiben(verz, neu);
  await store.setJSON(ANKER_SCHLUESSEL, { id: geschrieben.id });
  return geschrieben;
}

async function markeVon() {
  const verz = await verzeichnis();
  try {
    const st = await stat(path.join(verz, BUCH_DATEI));
    return `${verz}|${st.size}|${st.mtimeMs}|${st.ino}`;
  } catch { return null; }
}

/**
 * Das geprüfte Buch (mit Zwischenspeicher). Wirft WiderrufbuchFehler.
 * @param {any} store  die Ablage `centric`
 */
export async function buchGeprueft(store) {
  const m = await markeVon();
  if (m && zwischen && zwischen.marke === m) return zwischen.buch;
  return vermerken(nacheinander(async () => {
    const buch = await standJetzt(store);
    const marke = await markeVon();
    zwischen = marke ? { marke, buch } : null;
    return buch;
  }));
}

/**
 * Steht einer dieser Ablageschlüssel im Buch? Wirft bei unbekanntem Zustand (fail-closed: der Aufrufer weist ab).
 * @param {any} store
 * @param {Array<string|null|undefined>} schluessel
 */
export async function istWiderrufen(store, schluessel) {
  const b = await buchGeprueft(store);
  return schluessel.some((s) => typeof s === "string" && s && Object.hasOwn(b.eintraege, s));
}

/**
 * Steht dieser Verwalterschlüssel (sha256 als Hex) im Buch? Wirft bei unbekanntem Zustand.
 * @param {any} store @param {string} hash
 */
export async function verwalterWiderrufen(store, hash) {
  const b = await buchGeprueft(store);
  return typeof hash === "string" && Object.hasOwn(b.verwalter || {}, hash);
}

/** Buch fortschreiben: frischer Stand, einsammeln (Nachtrag früherer Fehlschläge), ändern, schreiben. In der Reihe. */
function fortschreiben(store, aendern) {
  return vermerken(nacheinander(async () => {
    const verz = await verzeichnis();
    const b = structuredClone(await standJetzt(store));
    const a = await ablageStand(store);
    const n = einsammeln(b, a.konten, a);
    const erg = aendern(b, a);
    if (n || erg.geaendert) {
      const geschrieben = await buchSchreiben(verz, b);
      const marke = await markeVon();
      zwischen = marke ? { marke, buch: geschrieben } : null;
    }
    await nachtragAbraeumen(store, a);
    return erg.wert;
  }), { schreibt: true });
}

/**
 * Codes ins Buch (samt Kette). Der Aufrufer hat sie in der Ablage SCHON gesperrt (oder sperrt sie, wenn das hier
 * wirft). Sammelt zugleich alles ein, was die Ablage gesperrt kennt — ein früher gescheiterter Eintrag wird so
 * nachgeholt. Wirft WiderrufbuchFehler, wenn das Buch nicht geschrieben werden kann.
 * @param {any} store
 * @param {string[]} schluessel
 * @param {string} grund
 * @returns {Promise<string[]>}  alle Ablageschlüssel der Kette
 */
export function widerrufen(store, schluessel, grund) {
  return fortschreiben(store, (b, a) => {
    const huelle = kettenHuelle(a.konten, schluessel);
    return { geaendert: eintragen(b, [...huelle], grund) > 0, wert: [...huelle] };
  });
}

/**
 * Verwalterschlüssel (sha256 als Hex) ins Buch. Sie sind in der Ablage schon gesperrt (verwalter.mjs, verwalterSperren).
 * @param {any} store @param {string[]} hashes @param {string} grund
 */
export function verwalterInsBuch(store, hashes, grund) {
  return fortschreiben(store, (b) => ({ geaendert: verwalterEintragen(b, hashes, grund) > 0, wert: hashes.length }));
}

/* ---------------------------------------------------------------------------
   Schnittstelle für den Erstanmeldecode (PR #281, erstleitung.mjs) — dort zu rufen, hier nur bereitgestellt.
   Verbindliche Abgrenzung (Review E-M6, Befund 1):
     „angelegt“ (Code an die neue erste Leitung gebunden): KEIN Widerruf. Nur
          await ersteinrichtungAbschliessen(store, raum, mandantId, personId)
        NACH dem Anlegen der Marke `erstleitung-marke:<raum>:<mandantId>`. Der Code bleibt der gewöhnliche Code der
        ersten Leitung; das Buch hält nur fest, dass der Betrieb eingerichtet ist, und legt die Marke nach einem
        Rücksprung wieder an (Serverstart, Wiederherstellungswerkzeug).
     „belegt“ (verbraucht ohne Person): Widerruf. NACH dem Verbrauchen in der Ablage:
          await widerrufen(store, [schluessel], "erstleitung-belegt")
     Scheitert einer dieser Aufrufe, bleibt der Schritt in der Ablage gültig (die Ablage ist ab dann sicher: Marke
     gesetzt bzw. Code verbraucht); der nächste Widerruf, Serverstart oder die Wiederherstellung sammeln ihn ein.
     Ohne diese Aufrufe gilt dasselbe — nur später: Eine Wiederherstellung per Verzeichniskopie OHNE Werkzeug und
     ohne Serverstart dazwischen verlöre einen Abschluss, der noch nicht eingesammelt war.
   --------------------------------------------------------------------------- */

/**
 * Die Ersteinrichtung eines Betriebs als abgeschlossen festhalten — außerhalb der Ablage, überlebt jede Wiederherstellung.
 * Sperrt keinen Code.
 * @param {any} store @param {string} raum @param {string} mandantId @param {string} [personId]  erste Leitung
 */
export function ersteinrichtungAbschliessen(store, raum, mandantId, personId = "") {
  if (typeof raum !== "string" || !raum || typeof mandantId !== "string" || !mandantId)
    return Promise.reject(new WiderrufbuchFehler("Betrieb für den Abschluss der Ersteinrichtung unklar."));
  return fortschreiben(store, (b) => ({
    geaendert: betriebeEintragen(b, [{ kennung: betriebsKennung(raum, mandantId), person: String(personId || "") }], "erstleitung") > 0,
    wert: undefined }));
}

/**
 * Ist die Ersteinrichtung dieses Betriebs abgeschlossen (nach dem Buch)? Wirft bei unbekanntem Zustand.
 * @param {any} store @param {string} raum @param {string} mandantId
 */
export async function ersteinrichtungAbgeschlossen(store, raum, mandantId) {
  const b = await buchGeprueft(store);
  return Object.hasOwn(b.betriebe, betriebsKennung(raum, mandantId));
}

/**
 * Beim Serverstart: Stand feststellen, aus der Ablage einsammeln, Buch in die Ablage nachziehen (Codes, Verwalter-
 * schlüssel, Marken). Wirft WiderrufbuchFehler — dann ist der Zustand unbekannt und jede Prüfung schließt die Tür.
 * @param {any} store
 */
export async function widerrufbuchStart(store) {
  return vermerken(nacheinander(async () => {
    const verz = await verzeichnis();
    const b = structuredClone(await standJetzt(store));
    const a = await ablageStand(store);
    const eingesammelt = einsammeln(b, a.konten, a);
    const geschrieben = eingesammelt ? await buchSchreiben(verz, b) : b;
    const marke = await markeVon();
    zwischen = marke ? { marke, buch: geschrieben } : null;
    await nachtragAbraeumen(store, a);
    const { kontoSchreiben } = await import("./konten.mjs");
    const offen = nachzuziehen(geschrieben, a.konten);
    for (const h of offen) await kontoSchreiben(store, h, gesperrtesKonto(a.konten[h]));
    const vOffen = verwalterNachzuziehen(geschrieben, a.verwalter);
    for (const h of vOffen) await store.setJSON(`${VERWALTER_PRAEFIX}${h}`, gesperrtesKonto(a.verwalter[h]));
    const mOffen = markenNachzuziehen(geschrieben, a.konten, a.marken);
    for (const m of mOffen) await store.setJSONWennNeu(m.schluessel, m.wert);
    return { eingesammelt, nachgezogen: offen.length + vOffen.length, marken: mOffen.length,
      eintraege: Object.keys(geschrieben.eintraege).length + Object.keys(geschrieben.verwalter || {}).length };
  }), { schreibt: true });
}

/**
 * Codes, die die Ablage schon GELÖSCHT hat (Raumlöschung), deren Eintrag ins Buch aber scheiterte: als Nachtrag
 * festhalten — im Speicher und in der Ablage (NACHTRAG_SCHLUESSEL). Der nächste Widerruf, der Serverstart und das
 * Wiederherstellungswerkzeug (vor dem Tausch) tragen sie ein; bis dahin meldet /gesund „Nachtrag offen“. In der Reihe,
 * damit gleichzeitige Löschungen einander nichts überschreiben. Wirft, wenn die Ablage nicht schreibbar ist (dann hält
 * der Speicher den Nachtrag bis zum nächsten gelungenen Schreiben des Buchs).
 * @param {any} store @param {string[]} schluessel @param {string} grund @returns {Promise<number>}
 */
export function nachtragAufnehmen(store, schluessel, grund) {
  const liste = [...new Set(schluessel)].filter(eintragbar);
  if (!liste.length) return Promise.resolve(0);
  for (const s of liste) if (!imSpeicher.has(s)) imSpeicher.set(s, String(grund).slice(0, 40));
  lage.nachtrag = true;
  return nacheinander(async () => {
    const alt = await store.get(NACHTRAG_SCHLUESSEL, { type: "json" });
    /** @type {Record<string, any>} */ const m = istMap(alt) && istMap(alt.schluessel) ? { ...alt.schluessel } : {};
    const am = new Date().toISOString();
    for (const s of liste) if (!Object.hasOwn(m, s)) m[s] = { am, grund: String(grund).slice(0, 40) };
    await store.setJSON(NACHTRAG_SCHLUESSEL, { schluessel: m });
    return liste.length;
  });
}

/** Nur für Prüfungen: Zwischenspeicher leeren. */
export function widerrufbuchVergessen() { zwischen = null; lage.unklar = false; lage.nachtrag = false; imSpeicher.clear(); }

/** Ein gescheiterter Bucheintrag eines Aufrufers (z. B. verwalterSperren), der die Ablage schon gesperrt hat. */
export function nachtragVermerken() { lage.nachtrag = true; }
