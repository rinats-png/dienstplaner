/* ==========================================================================
   IMP-9 — KI-Schnittstelle für den Import (austauschbar, OHNE Aktivierung)

   Was dieses Modul ist: ein ANSCHLUSS (Port) für einen austauschbaren Anbieter,
   der unklare Spalten einer Importdatei einem Feld zuordnen DARF — als
   VORSCHLAG, den eine Person bestätigt. Was es nicht ist: eine Anbindung. Es gibt
   hier keinen Netzcode, keinen Schlüssel, keine Umgebungsvariable, keinen Anbieter
   und keine Verdrahtung. Der Import (personen.mjs, uebernahme.mjs, import.mjs)
   kennt dieses Modul nicht und braucht es nicht: der deterministische Import
   ist vollständig ohne KI (Akzeptanz IMP-9).

   Wiederverwendet, nicht neu erfunden (server/lib/intelligence/):
   - Anbieter-Vertrag und Aufruf mit Frist, Ausgabegrenze, Fehlerklassen: gateway/anbieter.mjs
   - Notschalter, zwei Ebenen, fail closed: gateway/schalter.mjs (gatewayAn)
   - Freigabe-Gate (Freigabe, Monatsbudget, bestätigter AV-Vertrag): gateway/anbieter-live.mjs (freigabeGate)
   - Fremdtext bereinigen: kapsel.mjs; Leck-Prüfung gegen die Sperrliste des Betriebs: leckpruefung.mjs
   - Fehlercodes der Familie KI_… (KI_AUS, KI_NICHT_FREIGEGEBEN, KI_LECK, KI_PRUEFER, KI_GROESSE, KI_ZEIT, KI_ANBIETER, KI_LIMIT).

   Ablauf von `port.vorschlagen(...)` — die Reihenfolge IST die Sicherheit:
     1  Freigabe (alles oder nichts, sonst KEIN Aufruf, KEINE Datenaufbereitung):
        Notschalter beider Ebenen "an" UND Freigabe-Gate (freigabe, monatsbudget, AVV) UND ein
        PROTOKOLLIERTER Freigabevermerk der Voraussetzungen E-25 (Anbieter, AV-Vertrag, ZDR, Drittland)
        und E-26 (DSFA), gebunden an genau diesen Anbieter, diesen Modellort und diesen Zweck.
     2  Minimierung (eingabeMinimieren): nur Spalten OHNE Zuordnung; je Spalte nur die bereinigte
        Überschrift und höchstens 3 FORM-maskierte Proben (Buchstabenklasse, keine Inhalte);
        niemals eine Zeile, ein Zellwert im Klartext, eine Personendaten-Spalte oder Betriebsdaten.
     3  Leck-Prüfung gegen die Sperrliste des Betriebs (Namen, Nummern, Kontakte …); was anschlägt,
        wird weggelassen; ohne Sperrliste oder bei Restverdacht: kein Aufruf (KI_LECK).
     4  Aufruf des Anbieters mit Frist und Ausgabegrenze (anbieter.mjs). Fehlertexte des Anbieters
        verlassen das Modul nie (nur die Klasse).
     5  Strenge Prüfung der Ausgabe (ergebnisPruefen): genau dieses Schema, nur Kennungen und
        Zahlen, kein Freitext, Grenzen, keine Doppelten; bei Verstoß wird die GANZE Antwort verworfen.
     6  Der Vorschlag (vorschlagBilden) ist ein VORSCHLAG: bestaetigt:false, autoAnwenden:false.
        Eine Zuordnung entsteht erst durch vorschlagUebernehmen mit einer AUSDRÜCKLICHEN Bestätigung
        der Person je Spalte; das Ergebnis läuft danach durch dieselbe Prüfung wie jede manuelle
        Zuordnung (zuordnungPruefen) und durch den unveränderten deterministischen Import.

   FEHLER schlagen nie durch: Jede Funktion liefert { ok:false, code, text } statt zu werfen; der Import
   läuft dann ohne KI-Vorschlag weiter.

   VORAUSSETZUNGEN FÜR JEDE PRODUKTIVE ANBINDUNG (nicht Teil dieses Pakets): E-25 und E-26 (Betreiber),
   WP-I18/WP-I19 (Gateway-Freigabe), Verdrahtung nach Betreiberfreigabe. Die Funktion F7A des Gateways bleibt
   gesperrt (FREISCHALTUNG_GESPERRT), bis ihre Sperre dort ausdrücklich aufgehoben wird; dieses Modul hebt sie nicht auf.

   KONSERVATIVE FESTLEGUNGEN (Betreiberentscheidung nicht eingeholt, daher fail closed):
   - Es gibt KEINEN Modus, der Personendaten (Namen, Werte, Zeilen) an einen Anbieter gibt — auch nicht mit
     vollständiger Freigabe. Die Freigabe öffnet nur den Weg für die minimierte Eingabe.
   - Ein Freigabevermerk gilt nur für Zweck "import-spaltenzuordnung" und nur mit Datum nicht in der Zukunft.
   - Das Monatsbudget wird nur als Voraussetzung geprüft (Gate); die Mengenzählung leistet beim produktiven
     Anschluss das Gateway (limits.mjs). Zusätzlich begrenzt der Port seine eigene Aufrufzahl (aufrufeMax).
   ========================================================================== */

import { anbieterPruefen, aufrufen, alsAnbieterFehler } from "../intelligence/gateway/anbieter.mjs";
import { gatewayAn, SCHALTER_AUS } from "../intelligence/gateway/schalter.mjs";
import { freigabeGate } from "../intelligence/gateway/anbieter-live.mjs";
import { fremdtextBereinigen } from "../intelligence/kapsel.mjs";
import { leckPruefen, textPruefen } from "../intelligence/leckpruefung.mjs";
import { FELDER, zuordnungPruefen } from "./personen.mjs";

export const KI_SCHEMA_VERSION = "1";
/** Kennung dieser Verwendung (nicht eine Funktion F1–F18 der Positivliste). */
export const KI_FUNKTION = "import.spaltenzuordnung";
export const KI_ZWECK = "import-spaltenzuordnung";
/** Betreiber-Voraussetzungen jeder produktiven Anbindung (docs/acc45/BETREIBER-AUFGABEN-WEIHNACHTEN.md). */
export const PRODUKTIV_VORAUSSETZUNGEN = Object.freeze(["E-25", "E-26"]);

export const KI_GRENZEN = Object.freeze({
  spalten: 200, ueberschriftZeichen: 60, ueberschriftZiffern: 3, proben: 3, probeZeichen: 24,
  vorschlaege: 200, unsicherheiten: 200, validierungsfehler: 50, alternativen: 3,
  paketBytes: 32_768, ausgabeBytes: 16_384, ausgabeTokens: 4_000,
  fristMs: 20_000, aufrufeMax: 50, sicherAb: 0.8, befundeMax: 10,
});

export const KI_UNSICHERHEIT_GRUENDE = Object.freeze(["mehrdeutig", "keine_passung", "unleserlich"]);
export const KI_VALIDIERUNG_CODES = Object.freeze(["SPALTE_UNKLAR", "FELD_UNBEKANNT", "WERT_UNLESBAR", "SONSTIGES"]);
export const KI_CODES_IMPORT = Object.freeze(["KI_AUS", "KI_NICHT_FREIGEGEBEN", "KI_EINGABE", "KI_LECK", "KI_ANBIETER", "KI_ZEIT",
  "KI_GROESSE", "KI_PRUEFER", "KI_LIMIT"]);
/** Feste Texte; nie ein Wert aus der Datei, nie eine Anbieterantwort. */
export const KI_TEXTE = Object.freeze({
  KI_AUS: "Die KI-Unterstützung ist nicht aktiv. Der Import funktioniert unverändert.",
  KI_NICHT_FREIGEGEBEN: "Die KI-Unterstützung ist für diesen Betrieb nicht freigegeben. Der Import funktioniert unverändert.",
  KI_EINGABE: "Für einen KI-Vorschlag fehlen verwertbare Angaben. Der Import funktioniert unverändert.",
  KI_LECK: "Die Spaltenangaben enthalten möglicherweise Personendaten und werden nicht weitergegeben. Der Import funktioniert unverändert.",
  KI_ANBIETER: "Der KI-Dienst ist gerade nicht erreichbar. Der Import funktioniert unverändert.",
  KI_ZEIT: "Der KI-Dienst hat nicht rechtzeitig geantwortet. Der Import funktioniert unverändert.",
  KI_GROESSE: "Die Antwort des KI-Dienstes war zu umfangreich und wird nicht verwendet. Der Import funktioniert unverändert.",
  KI_PRUEFER: "Die Antwort des KI-Dienstes hat die Prüfung nicht bestanden und wird nicht verwendet. Der Import funktioniert unverändert.",
  KI_LIMIT: "Die Nutzungsgrenze für KI-Vorschläge ist erreicht. Der Import funktioniert unverändert.",
});

const nein = (code, mehr = {}) => ({ ok: false, code, text: KI_TEXTE[code], ...mehr });
const eigen = (o, n) => (o && typeof o === "object" && Object.hasOwn(o, n) ? o[n] : undefined);
const einfach = (o) => !!o && typeof o === "object" && !Array.isArray(o) && Object.getPrototypeOf(o) === Object.prototype;
const nurEigene = (o, erlaubt) => einfach(o) && Object.getOwnPropertyNames(o).every((k) => erlaubt.includes(k));
const tief = (o) => { Object.freeze(o); for (const v of Object.values(o)) if (v && typeof v === "object" && !Object.isFrozen(v)) tief(v); return o; };
const FELD_SET = new Set(FELDER);

/* --------------------------------------------------------------------------
   1  Freigabe
   -------------------------------------------------------------------------- */
const DATUM = /^(\d{4})-(\d{2})-(\d{2})$/;
const KENNUNG = /^[a-z0-9][a-z0-9._-]{0,63}$/;
function datumOk(s, jetztMs) {
  const m = typeof s === "string" ? DATUM.exec(s) : null;
  if (!m || typeof jetztMs !== "number" || !Number.isFinite(jetztMs)) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (d.getUTCFullYear() !== Number(m[1]) || d.getUTCMonth() !== Number(m[2]) - 1 || d.getUTCDate() !== Number(m[3])) return false;
  const n = new Date(jetztMs);
  return d.getTime() <= Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate());
}

/**
 * Ist der Weg zum Anbieter JETZT offen? Alles oder nichts; jede Unklarheit heißt „zu“.
 *
 * konfig = { freigabe: true, monatsbudget: <Zahl > 0>, avv: { status: "bestaetigt", datum }, modellKennung: "…",
 *   vermerk: { e25: "erteilt", e26: "erteilt", zweck: "import-spaltenzuordnung", anbieterId, modellOrt, datum } }
 * Der Vermerk ist die PROTOKOLLIERTE Betreiberfreigabe zu E-25 und E-26; ohne ihn gibt es keinen Aufruf.
 * @returns {{ offen: boolean, grund: "schalter"|"gate"|"vermerk"|"anbieter"|null }}
 */
export function kiFreigabe({ konfig, schalter, anbieter, jetzt = Date.now }) {
  let jetztMs;
  try { jetztMs = typeof jetzt === "function" ? jetzt() : undefined; } catch { jetztMs = undefined; }
  try {
    if (!gatewayAn(schalter || SCHALTER_AUS)) return { offen: false, grund: "schalter" };
    if (!anbieter) return { offen: false, grund: "anbieter" };
    if (!freigabeGate(konfig, () => jetztMs).offen) return { offen: false, grund: "gate" };
    const v = eigen(konfig, "vermerk");
    const kennung = eigen(konfig, "modellKennung");
    if (typeof kennung !== "string" || !KENNUNG.test(kennung)) return { offen: false, grund: "gate" };
    const vermerkOk = einfach(v)
      && eigen(v, "e25") === "erteilt" && eigen(v, "e26") === "erteilt"
      && eigen(v, "zweck") === KI_ZWECK
      && eigen(v, "anbieterId") === anbieter.id && eigen(v, "modellOrt") === anbieter.modellOrt
      && datumOk(eigen(v, "datum"), jetztMs);
    return vermerkOk ? { offen: true, grund: null } : { offen: false, grund: "vermerk" };
  } catch {
    return { offen: false, grund: "gate" };
  }
}

/* --------------------------------------------------------------------------
   2/3  Minimierung und Leck-Prüfung
   -------------------------------------------------------------------------- */
const UEBERSCHRIFT = /^[\p{L}\p{N} .,:;_\-/()%#&+?!]+$/u;

/**
 * Eine Probe auf ihre FORM reduzieren: Großbuchstabe → A, Kleinbuchstabe → a, Ziffer → 9, Leerraum → Leerzeichen, wenige
 * Satzzeichen bleiben, alles andere → ?; gleiche aufeinanderfolgende Zeichen fallen zusammen. Der Inhalt ist nicht rekonstruierbar
 * („Müller, Erika“ → „Aa, Aa“; „01.02.1990“ → „9.9.9“), auch keine Länge.
 */
export function maskieren(wert) {
  let t = "";
  if (typeof wert === "string") t = wert;
  else if (typeof wert === "number" && Number.isFinite(wert)) t = String(wert);
  else if (wert && typeof wert === "object" && wert.typ === "datum") t = String(wert.text ?? "");
  let aus = "";
  for (const z of t.normalize("NFC").slice(0, 200)) {
    let m;
    if (/\p{Lu}/u.test(z)) m = "A";
    else if (/[\p{Ll}\p{Lo}\p{Lm}]/u.test(z)) m = "a";
    else if (/\p{Nd}/u.test(z)) m = "9";
    else if (/\s/u.test(z)) m = " ";
    else if (".,:;-/()#+%".includes(z)) m = z;
    else m = "?";
    if (aus[aus.length - 1] !== m || !"Aa9? ".includes(m)) aus += m;
    if (aus.length >= KI_GRENZEN.probeZeichen) break;
  }
  return aus.trim();
}

/**
 * Das, was an einen Anbieter gehen DARF — und nichts sonst (Positivliste im Code, kein Durchreichen):
 * je unzugeordneter Spalte Index, bereinigte Überschrift und höchstens `proben` maskierte Proben.
 * @param {{ spalten: { index: number, kopf?: unknown, feld?: string|null }[], zeilen?: unknown[][], sperrliste: any, proben?: number }} e
 * @returns {{ ok: true, paket: any, indizes: number[], ausgeschlossen: number } | { ok: false, code: string, text: string }}
 */
export function eingabeMinimieren({ spalten, zeilen, sperrliste, proben = 0 } = /** @type {any} */ ({})) {
  try {
    if (!Array.isArray(spalten) || !sperrliste) return nein(sperrliste ? "KI_EINGABE" : "KI_LECK");
    const nProben = Number.isInteger(proben) ? Math.min(Math.max(proben, 0), KI_GRENZEN.proben) : 0;
    const offen = spalten.filter((s) => s && typeof s === "object" && (s.feld === null || s.feld === undefined)
      && Number.isInteger(s.index) && s.index >= 0 && s.index < KI_GRENZEN.spalten).slice(0, KI_GRENZEN.spalten);
    const daten = Array.isArray(zeilen) ? zeilen.slice(1) : [];
    const liste = [];
    let ausgeschlossen = 0;
    const gesehen = new Set();
    for (const s of offen) {
      if (gesehen.has(s.index)) continue;
      gesehen.add(s.index);
      let ueberschrift;
      try { ueberschrift = fremdtextBereinigen(typeof s.kopf === "string" ? s.kopf : ""); } catch { ueberschrift = ""; }
      const ziffern = (ueberschrift.match(/\p{Nd}/gu) || []).length;
      const brauchbar = ueberschrift.length >= 1 && ueberschrift.length <= KI_GRENZEN.ueberschriftZeichen && /\p{L}/u.test(ueberschrift)
        && UEBERSCHRIFT.test(ueberschrift) && ziffern <= KI_GRENZEN.ueberschriftZiffern;
      const spalte = { index: s.index, ueberschrift };
      if (brauchbar && nProben > 0) {
        const p = [];
        for (const z of daten) {
          if (p.length >= nProben) break;
          const m = Array.isArray(z) ? maskieren(z[s.index]) : "";
          if (m && !p.includes(m)) p.push(m);
        }
        spalte.proben = p;
      }
      /* Jede Spalte einzeln: eine verdächtige Überschrift (etwa ein Name, wenn die Kopfzeile fehlt) fällt weg, der Rest bleibt. */
      if (!brauchbar || !textPruefen(ueberschrift, sperrliste).ok || !leckPruefen(spalte, sperrliste).ok) { ausgeschlossen++; continue; }
      liste.push(spalte);
    }
    if (!liste.length) return nein(ausgeschlossen ? "KI_LECK" : "KI_EINGABE");
    const paket = tief({ schemaVersion: KI_SCHEMA_VERSION, funktion: KI_FUNKTION, spalten: liste, ziele: [...FELDER] });
    /* Letzte Schranke über das ganze Paket (fail closed). */
    if (!leckPruefen(paket, sperrliste).ok) return nein("KI_LECK");
    if (new TextEncoder().encode(JSON.stringify(paket)).length > KI_GRENZEN.paketBytes) return nein("KI_GROESSE");
    return { ok: true, paket, indizes: liste.map((x) => x.index), ausgeschlossen };
  } catch {
    return nein("KI_EINGABE");
  }
}

/* --------------------------------------------------------------------------
   5  Ergebnis-Schema, streng
   -------------------------------------------------------------------------- */
const ECHTE_ERGEBNISSE = new WeakSet();
const ECHTE_VORSCHLAEGE = new WeakSet();
const ECHTE_PORTS = new WeakSet();

/** Nur Daten: einfache Objekte und Listen ohne Zugriffsfunktionen, begrenzte Tiefe und Knotenzahl (kein Zyklus, kein Proxy-Trick). */
function nurDaten(x, tiefe = 0, zaehler = { n: 0 }) {
  if (++zaehler.n > 5000 || tiefe > 8) return false;
  if (x === null || typeof x === "string" || typeof x === "boolean") return true;
  if (typeof x === "number") return true;
  if (typeof x !== "object") return false;
  const proto = Object.getPrototypeOf(x);
  if (Array.isArray(x) ? proto !== Array.prototype : proto !== Object.prototype) return false;
  for (const k of Reflect.ownKeys(x)) {
    if (typeof k !== "string") return false;
    const d = Object.getOwnPropertyDescriptor(x, k);
    if (!d || !("value" in d) || !nurDaten(d.value, tiefe + 1, zaehler)) return false;
  }
  return true;
}

/**
 * Prüft die Ausgabe eines Anbieters. Erlaubt ist GENAU:
 *   { version: "1", vorschlaege: [{ spalte, feld, konfidenz }], unsicherheiten?: [{ spalte, grund, alternativen? }],
 *     validierungsfehler?: [{ code, spalte? }] }
 * `spalte` nur aus den angebotenen Spalten, `feld` nur aus FELDER, `konfidenz` eine Zahl in [0, 1], `grund`/`code` aus festen Listen.
 * Kein Freitext, keine weiteren Schlüssel, keine Doppelten. Ein einziger Verstoß verwirft die GANZE Antwort; die Befunde nennen Pfad
 * und Art, nie einen Wert der Antwort.
 * @param {unknown} roh
 * @param {{ indizes: Iterable<number> }} o
 * @returns {{ ok: true, ergebnis: any } | { ok: false, groesse: boolean, fehler: { art: string, pfad: string }[] }}
 */
export function ergebnisPruefen(roh, { indizes } = /** @type {any} */ ({})) {
  const fehler = [];
  const f = (art, pfad) => { if (fehler.length < KI_GRENZEN.befundeMax) fehler.push({ art, pfad }); };
  const zu = () => ({ ok: false, groesse: fehler.some((x) => x.art === "GROESSE"), fehler });
  const erlaubteSpalten = new Set([...(indizes || [])].filter((i) => Number.isInteger(i)));
  let k;
  if (!nurDaten(roh)) { f("STRUKTUR", "$"); return zu(); }
  try { k = structuredClone(roh); } catch { f("STRUKTUR", "$"); return zu(); }
  let bytes;
  try { bytes = new TextEncoder().encode(JSON.stringify(k)).length; } catch { f("STRUKTUR", "$"); return zu(); }
  if (!(bytes <= KI_GRENZEN.ausgabeBytes)) { f("GROESSE", "$"); return zu(); }
  if (!nurEigene(k, ["version", "vorschlaege", "unsicherheiten", "validierungsfehler"])) { f("STRUKTUR", "$"); return zu(); }
  if (k.version !== KI_SCHEMA_VERSION) f("VERSION", "$.version");
  const liste = (name, max, pflicht) => {
    const v = k[name];
    if (v === undefined && !pflicht) return [];
    if (!Array.isArray(v)) { f("TYP", `$.${name}`); return []; }
    if (v.length > max) { f("GROESSE", `$.${name}`); return []; }
    return v;
  };
  const spalteOk = (s, pfad) => {
    if (!Number.isInteger(s) || !erlaubteSpalten.has(s)) { f("SPALTE", pfad); return false; }
    return true;
  };
  const feldOk = (x, pfad) => {
    if (typeof x !== "string" || !FELD_SET.has(x)) { f("FELD", pfad); return false; }
    return true;
  };
  const vorschlaege = liste("vorschlaege", KI_GRENZEN.vorschlaege, true).map((v, i) => {
    const p = `$.vorschlaege[${i}]`;
    if (!nurEigene(v, ["spalte", "feld", "konfidenz"]) || Object.getOwnPropertyNames(v).length !== 3) { f("STRUKTUR", p); return null; }
    const a = spalteOk(v.spalte, `${p}.spalte`);
    const b = feldOk(v.feld, `${p}.feld`);
    const c = typeof v.konfidenz === "number" && Number.isFinite(v.konfidenz) && v.konfidenz >= 0 && v.konfidenz <= 1;
    if (!c) f("KONFIDENZ", `${p}.konfidenz`);
    return a && b && c ? { spalte: v.spalte, feld: v.feld, konfidenz: v.konfidenz } : null;
  });
  const unsicherheiten = liste("unsicherheiten", KI_GRENZEN.unsicherheiten, false).map((u, i) => {
    const p = `$.unsicherheiten[${i}]`;
    if (!nurEigene(u, ["spalte", "grund", "alternativen"])) { f("STRUKTUR", p); return null; }
    const a = spalteOk(u.spalte, `${p}.spalte`);
    const g = typeof u.grund === "string" && KI_UNSICHERHEIT_GRUENDE.includes(u.grund);
    if (!g) f("GRUND", `${p}.grund`);
    let alt = [];
    if (u.alternativen !== undefined) {
      if (!Array.isArray(u.alternativen) || u.alternativen.length > KI_GRENZEN.alternativen) f("TYP", `${p}.alternativen`);
      else if (!u.alternativen.every((x, j) => feldOk(x, `${p}.alternativen[${j}]`)) || new Set(u.alternativen).size !== u.alternativen.length) f("FELD", `${p}.alternativen`);
      else alt = [...u.alternativen];
    }
    return a && g ? { spalte: u.spalte, grund: u.grund, alternativen: alt } : null;
  });
  const validierungsfehler = liste("validierungsfehler", KI_GRENZEN.validierungsfehler, false).map((v, i) => {
    const p = `$.validierungsfehler[${i}]`;
    if (!nurEigene(v, ["code", "spalte"])) { f("STRUKTUR", p); return null; }
    const c = typeof v.code === "string" && KI_VALIDIERUNG_CODES.includes(v.code);
    if (!c) f("CODE", `${p}.code`);
    const s = v.spalte === undefined ? true : spalteOk(v.spalte, `${p}.spalte`);
    return c && s ? { code: v.code, ...(v.spalte === undefined ? {} : { spalte: v.spalte }) } : null;
  });
  const doppelt = (xs, schluessel, name) => {
    const g = new Set();
    for (const x of xs) { if (!x) continue; const s = schluessel(x); if (g.has(s)) f("DOPPELT", `$.${name}`); g.add(s); }
  };
  doppelt(vorschlaege, (x) => x.spalte, "vorschlaege");
  doppelt(vorschlaege, (x) => x.feld, "vorschlaege");
  doppelt(unsicherheiten, (x) => x.spalte, "unsicherheiten");
  if (fehler.length) return zu();
  const ergebnis = tief({ version: KI_SCHEMA_VERSION, vorschlaege, unsicherheiten, validierungsfehler });
  ECHTE_ERGEBNISSE.add(ergebnis);
  return { ok: true, ergebnis };
}

/* --------------------------------------------------------------------------
   6  Vorschlag (nie automatisch angewendet)
   -------------------------------------------------------------------------- */
/**
 * Aus einem GEPRÜFTEN Ergebnis einen Vorschlag zur Bestätigung machen. Rein: ändert weder Ergebnis noch Zuordnung.
 * @param {{ ergebnis: any, zuordnung?: Record<string, number|null> }} e
 */
export function vorschlagBilden({ ergebnis, zuordnung } = /** @type {any} */ ({})) {
  if (!ergebnis || typeof ergebnis !== "object" || !ECHTE_ERGEBNISSE.has(ergebnis)) return nein("KI_PRUEFER");
  const z = zuordnung && typeof zuordnung === "object" && !Array.isArray(zuordnung) ? zuordnung : {};
  const feldBelegt = new Set(Object.keys(z).filter((k) => Number.isInteger(z[k])));
  const spalteBelegt = new Set(Object.values(z).filter((v) => Number.isInteger(v)));
  const eintraege = ergebnis.vorschlaege.map((v) => ({ spalte: v.spalte, feld: v.feld, konfidenz: v.konfidenz,
    sicher: v.konfidenz >= KI_GRENZEN.sicherAb,
    konflikt: spalteBelegt.has(v.spalte) ? "spalte-belegt" : feldBelegt.has(v.feld) ? "feld-belegt" : null }));
  const vorschlag = tief({ quelle: "ki", status: "vorschlag", bestaetigt: false, autoAnwenden: false, version: KI_SCHEMA_VERSION,
    eintraege, unsicherheiten: ergebnis.unsicherheiten.map((u) => ({ ...u })), validierungsfehler: ergebnis.validierungsfehler.map((v) => ({ ...v })) });
  ECHTE_VORSCHLAEGE.add(vorschlag);
  return { ok: true, vorschlag };
}

/**
 * Die EINZIGE Stelle, an der aus einem Vorschlag eine Zuordnung wird: nur für die Spalten, die die Person ausdrücklich
 * bestätigt hat (`bestaetigung.spalten`, keine Sammelbestätigung). Der Aufrufer leitet die Bestätigung ausschließlich aus der
 * Anfrage einer angemeldeten Person ab. Ergebnis ist eine NEUE Zuordnung; die Eingabe bleibt unverändert, und die Zuordnung
 * läuft durch dieselbe Prüfung wie jede manuelle (zuordnungPruefen).
 * @param {{ vorschlag: any, zuordnung?: any, bestaetigung: { spalten: number[] }, spaltenAnzahl: number }} e
 */
export function vorschlagUebernehmen({ vorschlag, zuordnung, bestaetigung, spaltenAnzahl } = /** @type {any} */ ({})) {
  const abgelehnt = (grund) => ({ ok: false, code: "KI_EINGABE", text: KI_TEXTE.KI_EINGABE, grund });
  if (!vorschlag || typeof vorschlag !== "object" || !ECHTE_VORSCHLAEGE.has(vorschlag)) return abgelehnt("kein Vorschlag");
  if (!Number.isInteger(spaltenAnzahl) || spaltenAnzahl < 1) return abgelehnt("spaltenAnzahl");
  const sp = einfach(bestaetigung) ? bestaetigung.spalten : null;
  if (!nurEigene(bestaetigung, ["spalten"]) || !Array.isArray(sp) || !sp.length || sp.length > KI_GRENZEN.spalten
    || !sp.every((x) => Number.isInteger(x)) || new Set(sp).size !== sp.length) return abgelehnt("bestaetigung");
  const nachSpalte = new Map(vorschlag.eintraege.map((e) => [e.spalte, e]));
  const gewaehlt = [];
  for (const s of sp) {
    const e = nachSpalte.get(s);
    if (!e || e.konflikt) return abgelehnt("spalte");
    gewaehlt.push(e);
  }
  const neu = Object.create(null);
  const alt = zuordnung && typeof zuordnung === "object" && !Array.isArray(zuordnung) ? zuordnung : {};
  for (const k of Object.keys(alt)) neu[k] = alt[k];
  for (const e of gewaehlt) neu[e.feld] = e.spalte;
  const p = zuordnungPruefen(neu, spaltenAnzahl);
  if (!p.ok) return abgelehnt("zuordnung");
  return { ok: true, zuordnung: p.zuordnung, uebernommen: gewaehlt.map((e) => ({ spalte: e.spalte, feld: e.feld })),
    offen: vorschlag.eintraege.length - gewaehlt.length };
}

/* --------------------------------------------------------------------------
   Der Port
   -------------------------------------------------------------------------- */
const schlafenVorgabe = (ms) => new Promise((r) => { const t = setTimeout(r, ms); if (t.unref) t.unref(); });
const KLASSE_ZU_CODE = Object.freeze({ zeit: "KI_ZEIT", zu_gross: "KI_GROESSE", schema: "KI_PRUEFER", ungueltig: "KI_PRUEFER",
  nicht_freigegeben: "KI_NICHT_FREIGEGEBEN", begrenzt: "KI_ANBIETER", nicht_verfuegbar: "KI_ANBIETER" });

/**
 * Erzeugt den Port. OHNE Argumente (oder ohne Anbieter) ist er AUS: `vorschlagen` liefert KI_AUS, ohne etwas anzufassen.
 * Der Anbieter ist ein Adapter nach gateway/anbieter.mjs (id, modellOrt, erzeuge); die Konfiguration kommt vom Server, nie aus
 * einer Anfrage. Dieses Modul liest keine Umgebung: `schalter` und `konfig` übergibt, wer es einmal verdrahtet (Betreiberfreigabe).
 * @param {{ anbieter?: any, konfig?: any, schalter?: { prozess: () => unknown, laufzeit: () => unknown }, jetzt?: () => number,
 *   schlafen?: (ms: number) => Promise<void>, fristMs?: number, aufrufeMax?: number }} [o]
 */
export function erzeugeKiPort(o = {}) {
  let anbieter = null;
  if (o && o.anbieter !== undefined && o.anbieter !== null) { try { anbieter = anbieterPruefen(o.anbieter); } catch { anbieter = null; } }
  const konfig = o && o.konfig;
  const schalter = o && o.schalter;
  const jetzt = o && typeof o.jetzt === "function" ? o.jetzt : Date.now;
  const schlafen = o && typeof o.schlafen === "function" ? o.schlafen : schlafenVorgabe;
  const fristMs = o && Number.isInteger(o.fristMs) && o.fristMs > 0 ? Math.min(o.fristMs, KI_GRENZEN.fristMs) : KI_GRENZEN.fristMs;
  const aufrufeMax = o && Number.isInteger(o.aufrufeMax) && o.aufrufeMax >= 0 ? Math.min(o.aufrufeMax, KI_GRENZEN.aufrufeMax) : KI_GRENZEN.aufrufeMax;
  let aufrufe = 0;
  const freigabe = () => kiFreigabe({ konfig, schalter, anbieter, jetzt });

  const port = Object.freeze({
    id: "ki-import-port",
    /** Nur Auskunft; nennt Gründe als feste Wörter, nie Werte der Konfiguration. */
    status() { const f = freigabe(); return Object.freeze({ aktiv: f.offen, grund: f.grund }); },
    /**
     * @param {{ spalten: any[], zeilen?: unknown[][], sperrliste: any, proben?: number }} anfrage
     * @returns {Promise<{ ok: true, ergebnis: any } | { ok: false, code: string, text: string }>}
     */
    async vorschlagen(anfrage) {
      try {
        const f = freigabe();
        if (!f.offen) return nein(f.grund === "schalter" || f.grund === "anbieter" ? "KI_AUS" : "KI_NICHT_FREIGEGEBEN");
        const a = anfrage && typeof anfrage === "object" ? anfrage : {};
        const min = eingabeMinimieren({ spalten: a.spalten, zeilen: a.zeilen, sperrliste: a.sperrliste, proben: a.proben });
        if (!min.ok) return nein(min.code);
        if (aufrufe >= aufrufeMax) return nein("KI_LIMIT");
        aufrufe++;
        let r;
        try {
          r = await aufrufen({ anbieter, eingabe: { funktion: KI_FUNKTION, stufe: 1, schemaVersion: KI_SCHEMA_VERSION, paket: min.paket,
            fremdtext: null, modellKennung: eigen(konfig, "modellKennung"), maxAusgabeTokens: KI_GRENZEN.ausgabeTokens },
          zeitJeVersuchMs: fristMs, maxWiederholungen: 0, deadline: jetzt() + fristMs, jetzt, schlafen });
        } catch (e) {
          return nein(KLASSE_ZU_CODE[alsAnbieterFehler(e).klasse] || "KI_ANBIETER");
        }
        const g = ergebnisPruefen(r.ausgabe, { indizes: min.indizes });
        if (!g.ok) return nein(g.groesse ? "KI_GROESSE" : "KI_PRUEFER", { befunde: g.fehler });
        return { ok: true, ergebnis: g.ergebnis };
      } catch {
        return nein("KI_ANBIETER");
      }
    },
  });
  ECHTE_PORTS.add(port);
  return port;
}

/** Der Standard: aus. Kein Anbieter, keine Konfiguration, beide Schalter „aus“. */
export const KI_PORT_AUS = erzeugeKiPort();

/**
 * Bequemer Gesamtweg: Vorschlag einholen und als Vorschlag aufbereiten. Wirft nie. Ein Port, der nicht aus `erzeugeKiPort` stammt,
 * zählt als „aus“. Das Ergebnis der Analyse wird nicht verändert; der Import läuft in jedem Fehlerfall unverändert weiter.
 * @param {{ port?: any, spalten: any[], zeilen?: unknown[][], zuordnung?: any, sperrliste: any, proben?: number }} e
 */
export async function kiVorschlagEinholen({ port = KI_PORT_AUS, spalten, zeilen, zuordnung, sperrliste, proben = 0 } = /** @type {any} */ ({})) {
  try {
    if (!port || typeof port !== "object" || !ECHTE_PORTS.has(port)) return nein("KI_AUS");
    const r = await port.vorschlagen({ spalten, zeilen, sperrliste, proben });
    if (!r || r.ok !== true) return nein(r && KI_CODES_IMPORT.includes(r.code) ? r.code : "KI_ANBIETER");
    return vorschlagBilden({ ergebnis: r.ergebnis, zuordnung });
  } catch {
    return nein("KI_ANBIETER");
  }
}
