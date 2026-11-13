#!/usr/bin/env node
/* ==========================================================================
   ERKENNUNG GESTRANDETER BETRIEBE — nur lesend (Betreiberentscheidung 2026-11-13)

   Ordnet jeden Betrieb einer Sicherung (oder einer Kopie einer Ablage) einer
   der Klassen M1 … M6 bzw. „unklar“ zu, wie sie docs/acc45/MIGRATION-
   ERSTEINRICHTUNGSCODES.md (PR #287, Abschnitte 1 und 2) und das Konzept
   docs/acc45/WIEDERHERSTELLUNG-GESTRANDETE-BETRIEBE.md (§1.4) beschreiben,
   und zählt, wie viele Betriebe die strengen Regeln E-D1/E-D2 aussperren
   würden. Gebrauch und Grenzen: docs/acc45/ERKENNUNG-GESTRANDETE-BETRIEBE.md.

     node werkzeug/erkennung-gestrandete-betriebe.mjs --sicherung <Ordner>
     node werkzeug/erkennung-gestrandete-betriebe.mjs --daten <Ordner> --kopie
         [--json] [--ausgabe <Datei>] [--stichtag JJJJ-MM-TT] [--gespeicherte-kennungen]

   ---------------------------------------------------------------------------
   Wie „nur lesend“ gesichert ist

   - Das Skript schreibt NICHTS: keine Zwischenkopie, keine Temp-Datei, kein
     Protokoll. Einzige Ausgaben sind stdout/stderr und — nur auf Wunsch —
     die mit --ausgabe genannte Datei (neu anzulegen, nie in der Eingabe).
   - Gelesen wird mit den Lesern der Anwendung (bestandLesenStreng aus
     server/lib/bestand.mjs, alleKontenStreng aus server/lib/konten.mjs,
     aktivePerson aus server/lib/personengueltig.mjs), aber NICHT über
     getStore() aus server/lib/ablage.mjs: Dessen Store legt beim ersten
     Schreiben Verzeichnisse an und räumt Zwischendateien weg. Stattdessen
     bekommen die Leser hier eine eigene Ablage (lesendeAblage), die das
     Dateiformat von ablage.mjs nur liest (readFile, readdir) und bei jedem
     Schreibaufruf (set, setJSON, setJSONWennNeu, delete) mit einem Fehler
     abbricht. Das strenge Lesen des Bestands schreibt selbst nichts (ein
     liegendes Journal wird nur im Speicher überlagert, bestand.mjs
     „ueberlagern“); die Raumsperre ist prozesslokal (Speicher, keine Datei).
   - Die Eingabe wird vor und nach dem Lauf über Namen, Größen und
     Änderungszeiten aller Dateien abgedrückt. Weicht das ab (z. B. weil
     doch ein Server schreibt), endet der Lauf mit Ausgang 1.
   - Eine Ablage (--daten) wird nur mit --kopie gelesen, nie unter dem Pfad
     aus CENTRIC_DATEN bzw. /data, und nie, wenn ihre Prozesssperre
     (server/lib/prozesssperre.mjs, Datei .prozess) frisch ist oder ein
     lebender Prozess dieses Rechners sie hält. Eine vorhandene, veraltete
     Sperre wird nur in einer wiederhergestellten Kopie hingenommen (Vermerk
     .wiederhergestellt.json von werkzeug/ablage-sicherung.mjs).
   - Eine Sicherung (--sicherung) wird zuerst mit `pruefen` aus
     werkzeug/ablage-sicherung.mjs geprüft (liest nur).
   - Kein Netz, kein SSH, kein Pfeffer: Zugänge werden nur über ihre Felder
     ausgewertet, nie über Codes oder Prüfsummen.

   ---------------------------------------------------------------------------
   Was ausgegeben wird (und was nie)

   Je Betrieb: Pseudonym von Raum und Betrieb (HMAC-SHA-256 mit einem
   Laufschlüssel, 12 Hex-Zeichen; der Laufschlüssel ist zufällig je Lauf oder
   kommt aus ERKENNUNG_LAUFSCHLUESSEL), Position im Raum, Klasse, Zahlen.
   Mit --gespeicherte-kennungen statt des Betriebspseudonyms die gespeicherte
   Betriebskennung (mandantId) — Vorsicht: Sie kann dem Raumnamen gleichen
   (leerbetrieb.mjs). Nie: Raum- oder Betriebsnamen, Personennamen, E-Mail,
   Personenkennungen, Codes, Ablageschlüssel, Prüfsummen, Kontaktangaben,
   Pfade der Eingabe. Fehlermeldungen nennen nur die Art des Fehlers.

   Ausgang: 0 = kein Betrieb betroffen (nur M5/M6), 2 = betroffene Betriebe
   (M1–M4), 1 = Lesefehler oder ein Betrieb „unklar“ (fail-closed),
   3 = Aufruf abgelehnt (fehlende Angaben, Live-Ablage, Ausgabe in der Eingabe).
   ========================================================================== */

import { createHash, createHmac, randomBytes } from "node:crypto";
import { open, readdir, readFile, stat } from "node:fs/promises";
import { hostname } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dateiname } from "../server/lib/ablage.mjs";
import { bestandLesenStreng } from "../server/lib/bestand.mjs";
import { alleKontenStreng } from "../server/lib/konten.mjs";
import { aktivePerson } from "../server/lib/personengueltig.mjs";
import { SPERRDATEI, VERALTET_MS } from "../server/lib/prozesssperre.mjs";
import { pruefen as sicherungPruefen, WIEDERHERSTELL_VERMERK } from "./ablage-sicherung.mjs";

export const FORMAT = "erkennung-gestrandete-betriebe/1";
export const AUSGANG = { NICHTS_BETROFFEN: 0, FEHLER_ODER_UNKLAR: 1, BETROFFEN: 2, ABGELEHNT: 3 };
export const KLASSEN = ["M1", "M2", "M3", "M4", "M5", "M6", "unklar"];
const BETROFFEN = new Set(["M1", "M2", "M3", "M4"]);
const ABLAGE_FASSUNG = 1;
const STORE = "centric";

export class ErkennungsFehler extends Error {
  /** @param {string} meldung @param {number} code */
  constructor(meldung, code) { super(meldung); this.code = code; }
}

/* ---------------------------------------------------------------------------
   Die nur lesende Ablage (Dateiformat wie server/lib/ablage.mjs)
   --------------------------------------------------------------------------- */

/** @param {string} name */
function schluesselAus(name) {
  if (!name.endsWith(".json")) return null;
  try { return decodeURIComponent(name.slice(0, -5)); } catch { return null; }
}

const NUR_LESEND = () => { throw new Error("Ablage: nur lesend — die Erkennung schreibt nicht."); };

/**
 * Eine Ablage mit der Schnittstelle von getStore(), die nur liest. Jeder Schreibaufruf wirft.
 * Fehlermeldungen nennen keinen Schlüssel (Schlüssel enthalten Raumnamen und Prüfsummen von Codes).
 * @param {string} verzeichnis  Ordner eines Stores (<wurzel>/centric)
 */
export function lesendeAblage(verzeichnis) {
  const pfad = (/** @type {string} */ k) => path.join(verzeichnis, dateiname(k));
  const umschlag = async (/** @type {string} */ k) => {
    let text;
    try { text = await readFile(pfad(k), { encoding: "utf8", flag: "r" }); }
    catch (e) {
      if (/** @type {any} */ (e).code === "ENOENT") return null;
      throw new Error(`Ablage: Datei nicht lesbar (${/** @type {any} */ (e).code || "Fehler"})`);
    }
    let u;
    try { u = JSON.parse(text); } catch { throw new Error("Ablage: Datei ist kein gültiger Umschlag (beschädigt?)"); }
    if (!u || u.fassung !== ABLAGE_FASSUNG) throw new Error("Ablage: unbekannte Fassung einer Datei");
    return u;
  };
  const inForm = (/** @type {any} */ u, /** @type {any} */ opts) => {
    const typ = opts && opts.type ? opts.type : "text";
    if (typ === "json") {
      if (u.typ === "json") return u.daten;
      try { return JSON.parse(u.daten); } catch { throw new Error("Ablage: Textwert ist kein JSON"); }
    }
    return u.typ === "json" ? JSON.stringify(u.daten) : u.daten;
  };
  return {
    async get(/** @type {string} */ k, /** @type {any} */ opts) { const u = await umschlag(k); return u ? inForm(u, opts) : null; },
    async getWithMetadata(/** @type {string} */ k, /** @type {any} */ opts) {
      const u = await umschlag(k);
      return u ? { data: inForm(u, opts), metadata: u.metadata || {}, etag: u.etag } : null;
    },
    async getMetadata(/** @type {string} */ k) { const u = await umschlag(k); return u ? { metadata: u.metadata || {}, etag: u.etag } : null; },
    async list(/** @type {any} */ opts) {
      const prefix = opts && opts.prefix ? String(opts.prefix) : "";
      let namen;
      try { namen = await readdir(verzeichnis); }
      catch (e) {
        if (/** @type {any} */ (e).code === "ENOENT") return { blobs: [], directories: [] };
        throw new Error(`Ablage: Verzeichnis nicht lesbar (${/** @type {any} */ (e).code || "Fehler"})`);
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
    set: NUR_LESEND, setJSON: NUR_LESEND, setJSONWennNeu: NUR_LESEND, delete: NUR_LESEND,
  };
}

/* ---------------------------------------------------------------------------
   Erstanmeldevermerk — Prädikate wie PR #281 (fix/leitungscode-ohne-person, Kopf 227f633e,
   server/lib/erstleitung.mjs: erstleitungOffen, erstleitungsZugang, erstleitungUngueltig). Hier nachgebildet,
   weil das Modul auf release-v4 noch nicht liegt; Änderungen dort sind hier nachzuziehen.
   --------------------------------------------------------------------------- */

const istObjekt = (/** @type {any} */ x) => !!x && typeof x === "object" && !Array.isArray(x);
const ohnePerson = (/** @type {any} */ p) => p === null || p === undefined || p === "";
const nichtLeer = (/** @type {any} */ x) => typeof x === "string" && x.length > 0;

/** @param {any} e */
export function erstleitungOffen(e) {
  if (!istObjekt(e) || !istObjekt(e.erstleitung)) return false;
  if (e.erstleitungVerbraucht) return false;
  if (e.rolle !== "leitung" || e.demo === true || e.gesperrt) return false;
  const z = e.erstleitung;
  if (typeof z.mandantId !== "string" || !z.mandantId || z.mandantId !== e.mandantId) return false;
  return typeof e.bestand === "string" && !!e.bestand;
}
/** @param {any} e */
export const erstleitungsZugang = (e) => istObjekt(e) && (istObjekt(e.erstleitung) || istObjekt(e.erstleitungVerbraucht));

/* ---------------------------------------------------------------------------
   Nutzbarkeit eines Zugangs (wie arbeitssitzung.mjs: Kette ersetztDurch, laeuftAb)
   --------------------------------------------------------------------------- */

/**
 * @param {string} schluessel @param {Record<string, any>} konten @param {number} jetzt
 * @returns {boolean}
 */
export function zugangNutzbar(schluessel, konten, jetzt) {
  const z = konten[schluessel];
  if (!istObjekt(z)) return false;
  const gesehen = new Set([schluessel]);
  for (let zeiger = z, tiefe = 0; ; tiefe++) {
    if (zeiger.gesperrt) return false;
    if (!nichtLeer(zeiger.ersetztDurch) || gesehen.has(zeiger.ersetztDurch)) break;
    if (tiefe >= 5) return false;
    gesehen.add(zeiger.ersetztDurch);
    zeiger = konten[zeiger.ersetztDurch];
    if (!istObjekt(zeiger)) return false;
  }
  if (z.laeuftAb && !(new Date(z.laeuftAb).getTime() >= jetzt)) return false;
  return true;
}

/* ---------------------------------------------------------------------------
   Klassifizierung eines Betriebs (reine Funktion)
   --------------------------------------------------------------------------- */

/** Auf das nächste Vielfache von 5 aufgerundet (0 bleibt 0) — keine genaue Kopfzahl kleiner Betriebe. */
export const aufFuenf = (/** @type {number} */ n) => (n <= 0 ? 0 : Math.ceil(n / 5) * 5);

/**
 * @param {{ raum: string, position: number, mandant: any, mandantenImRaum: any[],
 *   zugaenge: Array<[string, any]>, konten: Record<string, any>, mitgliedschaften: any[],
 *   selbststart: boolean, demoRaum: boolean, kundenSchreibspur: "ja"|"nein"|"unbekannt",
 *   fensterZustand: string, heute: string, jetzt: number }} e
 *   zugaenge: alle Zugänge des Raums (ohne Betreibercodes) als [Ablageschlüssel, Zugang]
 */
export function betriebKlassifizieren(e) {
  const { raum, position, mandant: m, mandantenImRaum, konten, heute, jetzt } = e;
  /** @type {string[]} */ const unklar = [];
  const mehrereBetriebe = mandantenImRaum.length > 1;
  const id = istObjekt(m) && nichtLeer(m.id) ? m.id : null;
  if (!istObjekt(m)) unklar.push("betrieb-unlesbar");
  else if (!id) unklar.push("betrieb-ohne-kennung");
  else if (mandantenImRaum.filter((x) => istObjekt(x) && x.id === id).length !== 1) unklar.push("kennung-doppelt");
  const personen = istObjekt(m) && Array.isArray(m.personen) ? m.personen : null;
  if (istObjekt(m) && !personen) unklar.push("personen-unlesbar");

  /* Welche Zugänge gehören zu diesem Betrieb? Kennung vor Position. */
  const gehoertHierher = (/** @type {any} */ k) => {
    if (nichtLeer(k.mandantId)) return id !== null && k.mandantId === id;
    return Number(k.betrieb ?? 0) === position;
  };
  const eigene = e.zugaenge.filter(([, k]) => gehoertHierher(k));
  for (const [, k] of eigene) {
    if (!nichtLeer(k.mandantId) && mehrereBetriebe) unklar.push("zugang-ohne-kennung-bei-mehreren-betrieben");
    if (!nichtLeer(k.rolle)) unklar.push("zugang-ohne-rolle");
    if (typeof k.person === "number") unklar.push("person-als-zahlindex");
  }

  const P = personen || [];
  const leitungsPersonen = P.filter((p) => istObjekt(p) && p.rolle === "leitung");
  const LA = new Set(leitungsPersonen.filter((p) => aktivePerson(m, p.id, heute)).map((p) => String(p.id)));
  const leitungInaktiv = { inaktiv: 0, ausgetreten: 0, anonym: 0, mehrdeutig: 0 };
  for (const p of leitungsPersonen) {
    if (LA.has(String(p.id))) continue;
    if (P.filter((x) => istObjekt(x) && String(x.id) === String(p.id)).length !== 1) leitungInaktiv.mehrdeutig++;
    else if (p.anonym) leitungInaktiv.anonym++;
    else if (p.austritt && String(p.austritt) < heute) leitungInaktiv.ausgetreten++;
    else leitungInaktiv.inaktiv++;
  }

  const codes = { personengebunden: 0, personengebundenOhneAktiveLeitung: 0, ohnePerson: 0,
    erstleitungOffen: 0, erstleitungEingeloest: 0, belegt: 0, gesperrtOderAbgelaufen: 0, demoOhnePerson: 0,
    andereRollenMitPerson: 0, andereRollenOhnePerson: 0 };
  let juengsterZ0 = "";
  for (const [schluessel, k] of eigene) {
    const nutzbar = zugangNutzbar(schluessel, konten, jetzt);
    if (k.rolle !== "leitung") {
      if (!nutzbar || k.demo === true) continue;
      if (ohnePerson(k.person)) codes.andereRollenOhnePerson++; else codes.andereRollenMitPerson++;
      continue;
    }
    if (k.demo === true) { if (nutzbar && ohnePerson(k.person)) codes.demoOhnePerson++; continue; }
    if (erstleitungsZugang(k)) {
      if (erstleitungOffen(k)) { if (nutzbar) codes.erstleitungOffen++; else codes.gesperrtOderAbgelaufen++; continue; }
      if (ohnePerson(k.person)) { codes.belegt++; continue; }          // M7: verbraucht ohne Person
      codes.erstleitungEingeloest++;                                     // jetzt ein personengebundener Code
    }
    if (!nutzbar) { codes.gesperrtOderAbgelaufen++; continue; }
    if (ohnePerson(k.person)) {
      codes.ohnePerson++;
      const monat = typeof k.angelegt === "string" ? k.angelegt.slice(0, 7) : "";
      if (/^\d{4}-\d{2}$/.test(monat) && monat > juengsterZ0) juengsterZ0 = monat;
    } else if (LA.has(String(k.person))) codes.personengebunden++;
    else codes.personengebundenOhneAktiveLeitung++;
  }

  const eigeneMitglieder = e.mitgliedschaften.filter((x) => istObjekt(x)
    && (nichtLeer(x.mandantId) ? id !== null && x.mandantId === id : Number(x.betrieb ?? 0) === position));
  const mitgliedschaften = { vorhanden: eigeneMitglieder.length,
    aktivMitAktiverLeitung: eigeneMitglieder.filter((x) => x.status === "aktiv" && !ohnePerson(x.person) && LA.has(String(x.person))).length };

  const Z0 = codes.ohnePerson;
  const ZP = codes.personengebunden + mitgliedschaften.aktivMitAktiverLeitung;
  const leer = P.length === 0;

  /** @type {string} */ let klasse;
  /** @type {string|null} */ let unterklasse = null;
  if (unklar.length) klasse = "unklar";
  else if (e.demoRaum) {
    klasse = codes.demoOhnePerson > 0 ? "M6" : "ausgeschlossen";
    if (klasse === "ausgeschlossen") unterklasse = "demo";
  } else if (leer) {
    if (Z0 > 0 && mitgliedschaften.vorhanden === 0) {
      klasse = "M1";
      unterklasse = e.selbststart ? "M1-t" : e.kundenSchreibspur !== "nein" ? "M1-k" : null;
    } else if (Z0 > 0) { klasse = "unklar"; unklar.push("leer-mit-mitgliedschaft"); }
    else if (codes.erstleitungOffen > 0) { klasse = "M5"; unterklasse = "erstanmeldecode-offen"; }
    else if (codes.demoOhnePerson > 0) klasse = "M6";
    else { klasse = "unklar"; unklar.push("leer-ohne-leitungszugang"); }
  } else if (Z0 > 0) {
    if (LA.size > 0) { klasse = "M2"; unterklasse = ZP === 0 ? "M2-ohne-anderen-zugang" : "M2-mit-anderem-zugang"; }
    else klasse = "M3";
  } else if (LA.size === 0) klasse = "M4";
  else if (ZP > 0) klasse = "M5";
  else if (codes.demoOhnePerson > 0) klasse = "M6";
  else { klasse = "unklar"; unklar.push("aktive-leitung-ohne-zugang"); }

  /* E-D1/E-D2 (streng): Ein gewöhnlicher Code ohne Person gibt nie Zugang; ein Erstanmeldecode nur im leeren Betrieb;
     Demo bleibt Ausnahme (kein Kundenzugang, hier nicht gezählt). */
  const zugangHeute = Z0 > 0 || ZP > 0 || codes.erstleitungOffen > 0;
  const zugangNachher = ZP > 0 || (codes.erstleitungOffen > 0 && leer);

  return {
    raum, position, mandantId: id, klasse, unterklasse,
    unklarGruende: [...new Set(unklar)].sort(),
    anzahlPersonen: aufFuenf(P.length),
    anzahlAktiveLeitung: LA.size,
    leitungspersonenNichtAktiv: leitungInaktiv,
    codes, mitgliedschaften,
    fensterZustand: e.fensterZustand,
    kundenSchreibspur: e.kundenSchreibspur,
    juengsterZ0Monat: juengsterZ0 || null,
    leitungszugangHeute: zugangHeute,
    leitungszugangNachEd1Ed2: zugangNachher,
    ausgesperrtDurchEd1Ed2: !e.demoRaum && klasse !== "ausgeschlossen" && zugangHeute && !zugangNachher,
  };
}

/* ---------------------------------------------------------------------------
   Eingabe: Art, Schutz vor der Live-Ablage, Abdruck
   --------------------------------------------------------------------------- */

const ist = async (/** @type {string} */ p, /** @type {"datei"|"ordner"} */ art) =>
  stat(p).then((s) => (art === "datei" ? s.isFile() : s.isDirectory()), () => false);

/** Liegt `kind` in `eltern` (oder ist es)? */
const liegtIn = (/** @type {string} */ kind, /** @type {string} */ eltern) => {
  const r = path.relative(path.resolve(eltern), path.resolve(kind));
  return r === "" || (!r.startsWith("..") && !path.isAbsolute(r));
};

/** Namen, Größen und Änderungszeiten aller Dateien unter `wurzel` — erkennt einen Schreiber während des Laufs. */
export async function abdruck(/** @type {string} */ wurzel) {
  const h = createHash("sha256");
  const gehen = async (/** @type {string} */ ordner, /** @type {string} */ rel) => {
    const eintraege = (await readdir(ordner, { withFileTypes: true })).sort((a, b) => (a.name < b.name ? -1 : 1));
    for (const e of eintraege) {
      const p = path.join(ordner, e.name);
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) { h.update(`d ${r}\n`); await gehen(p, r); continue; }
      const s = await stat(p);
      h.update(`f ${r} ${s.size} ${s.mtimeMs}\n`);
    }
  };
  await gehen(wurzel, "");
  return h.digest("hex");
}

/** Wie prozesssperre.mjs (lageDerSperre), nur lesend: Hält ein lebender Prozess diese Ablage? Immer gegen die echte Uhr
    (nicht gegen --jetzt): Die Änderungszeit der Sperre ist echte Zeit. */
async function sperreLage(/** @type {string} */ wurzel) {
  const jetzt = Date.now();
  const datei = path.join(wurzel, SPERRDATEI);
  let roh, st;
  try { [roh, st] = await Promise.all([readFile(datei, "utf8"), stat(datei)]); }
  catch (e) { if (/** @type {any} */ (e).code === "ENOENT") return "weg"; return "unklar"; }
  if (jetzt - st.mtimeMs < VERALTET_MS) return "frisch";
  let halter = null;
  try { halter = JSON.parse(roh); } catch { /* unlesbar, aber alt */ }
  if (halter && halter.rechner === hostname() && Number.isInteger(halter.pid) && halter.pid > 0 && halter.pid !== process.pid) {
    try { process.kill(halter.pid, 0); return "lebt"; }
    catch (e) { if (/** @type {any} */ (e).code === "EPERM") return "lebt"; }
  }
  return "veraltet";
}

/**
 * Bestimmt die zu lesende Ablagewurzel und lehnt Live-Ablagen ab.
 * @param {{ sicherung?: string, daten?: string, kopie?: boolean, env?: Record<string, string|undefined> }} o
 * @returns {Promise<{ art: "sicherung"|"kopie", eingabe: string, wurzel: string }>}
 */
export async function eingabeBestimmen({ sicherung, daten, kopie = false, env = process.env }) {
  if (!!sicherung === !!daten) throw new ErkennungsFehler("Genau eine Eingabe angeben: --sicherung <Ordner> oder --daten <Ordner> --kopie.", AUSGANG.ABGELEHNT);
  const eingabe = path.resolve(/** @type {string} */ (sicherung || daten));
  if (!(await ist(eingabe, "ordner"))) throw new ErkennungsFehler("Die Eingabe ist kein lesbarer Ordner. Archive vorher in einen leeren Wegwerfordner auspacken.", AUSGANG.ABGELEHNT);
  const istSicherung = await ist(path.join(eingabe, "MANIFEST.json"), "datei");

  if (istSicherung) {
    const r = await sicherungPruefen(eingabe);
    if (!r.ok) throw new ErkennungsFehler(`Die Sicherung ist ungültig (${r.fehler.length} Befund(e)). Einzelheiten nur lokal mit `
      + "`node werkzeug/ablage-sicherung.mjs pruefen --sicherung <Ordner>` ansehen.", AUSGANG.FEHLER_ODER_UNKLAR);
    return { art: "sicherung", eingabe, wurzel: path.join(eingabe, "daten") };
  }
  if (sicherung) throw new ErkennungsFehler("--sicherung zeigt nicht auf eine Sicherung (MANIFEST.json fehlt). Für die Kopie einer Ablage: --daten <Ordner> --kopie.", AUSGANG.ABGELEHNT);
  if (!kopie) throw new ErkennungsFehler("Eine Ablage wird nur als Kopie gelesen: --kopie angeben und sicherstellen, dass kein Server darauf läuft.", AUSGANG.ABGELEHNT);
  const live = path.resolve(env.CENTRIC_DATEN || "/data");
  if (eingabe === live) throw new ErkennungsFehler("Die Eingabe ist die Ablage aus CENTRIC_DATEN (bzw. /data) — nur eine Kopie lesen.", AUSGANG.ABGELEHNT);
  const lage = await sperreLage(eingabe);
  if (lage === "frisch" || lage === "lebt" || lage === "unklar")
    throw new ErkennungsFehler("Die Ablage ist in Benutzung (Prozesssperre .prozess ist frisch oder ihr Halter lebt) — abgelehnt.", AUSGANG.ABGELEHNT);
  if (lage === "veraltet" && !(await ist(path.join(eingabe, WIEDERHERSTELL_VERMERK), "datei")))
    throw new ErkennungsFehler("Die Ablage trägt eine Prozesssperre und ist keine wiederhergestellte Kopie — abgelehnt. "
      + "Eine Sicherung ziehen und diese (oder ihre Wiederherstellung in einen Wegwerfordner) lesen.", AUSGANG.ABGELEHNT);
  return { art: "kopie", eingabe, wurzel: eingabe };
}

/* ---------------------------------------------------------------------------
   Lesen und Auswerten
   --------------------------------------------------------------------------- */

const heuteBerlin = (/** @type {number} */ jetzt) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date(jetzt));

/**
 * Liest die Ablage unter `wurzel` (nur lesend) und klassifiziert alle Betriebe.
 * @param {{ wurzel: string, jetzt: number, stichtag?: string, laufschluessel: Buffer, gespeicherteKennungen?: boolean }} o
 */
export async function erkennen({ wurzel, jetzt, stichtag, laufschluessel, gespeicherteKennungen = false }) {
  const heute = stichtag || heuteBerlin(jetzt);
  const store = lesendeAblage(path.join(wurzel, STORE));
  const pseudo = (/** @type {string} */ was) => createHmac("sha256", laufschluessel).update(was).digest("hex").slice(0, 12);

  /** @type {Record<string, any>} */ let konten;
  try { konten = await alleKontenStreng(store); }
  catch { throw new ErkennungsFehler("Lesefehler: Zugänge (konto:*/konten) nicht lesbar.", AUSGANG.FEHLER_ODER_UNKLAR); }
  const alleSchluessel = (await store.list({})).blobs.map((b) => b.key);
  const raeume = [...new Set(alleSchluessel.filter((k) => k.startsWith("kern:") || k.startsWith("bestand:"))
    .map((k) => k.slice(k.indexOf(":") + 1)))].filter(Boolean).sort();

  /** @type {any[]} */ let mitglieder = [];
  try {
    for (const k of alleSchluessel.filter((x) => x.startsWith("mitglied:"))) {
      const v = await store.get(k, { type: "json" });
      if (istObjekt(v)) mitglieder.push({ ...v, raum: nichtLeer(v.raum) ? v.raum : raeume.find((r) => k.endsWith(`:${r}`)) ?? null });
    }
  } catch { throw new ErkennungsFehler("Lesefehler: Mitgliedschaften nicht lesbar.", AUSGANG.FEHLER_ODER_UNKLAR); }
  /** @type {any[]} */ let selbststarts = [];
  try { const s = await store.get("selbststarts", { type: "json" }); selbststarts = Array.isArray(s) ? s : []; }
  catch { throw new ErkennungsFehler("Lesefehler: Selbststartliste nicht lesbar.", AUSGANG.FEHLER_ODER_UNKLAR); }

  const kundenZugaenge = Object.entries(konten).filter(([, k]) => istObjekt(k) && k.rolle !== "betreiber");
  const raumSet = new Set(raeume);
  const ausgeschlossen = { "ppg-gate": 0, loeschung: 0, demo: 0 };
  const zaehler = { raeume: raeume.length, betriebe: 0, zugaengeOhneRaum: 0, zugaengeVerwaist: 0, m7Belegt: 0 };
  zaehler.zugaengeOhneRaum = kundenZugaenge.filter(([, k]) => !raumSet.has(k.bestand)).length;
  /** @type {any[]} */ const betriebe = [];

  for (const raum of raeume) {
    if (raum.startsWith("ppg-gate-")) { ausgeschlossen["ppg-gate"]++; continue; }
    let loeschmarke, vermerk, gelesen;
    try {
      loeschmarke = await store.get(`loeschung:${raum}`, { type: "json" });
      vermerk = await store.get(`ersteinrichtung:${raum}`, { type: "json" });
      gelesen = await bestandLesenStreng(store, raum);
    } catch { throw new ErkennungsFehler("Lesefehler: Bestand eines Raums nicht lesbar (Kern, Scherbe, Journal oder Vermerk).", AUSGANG.FEHLER_ODER_UNKLAR); }
    if (loeschmarke != null) { ausgeschlossen.loeschung++; continue; }
    const bestand = gelesen && gelesen.bestand;
    const mandanten = istObjekt(bestand) && Array.isArray(bestand.mandanten) ? bestand.mandanten : null;
    const zugaenge = kundenZugaenge.filter(([, k]) => k.bestand === raum);
    const demoRaum = /^demo-/i.test(raum);
    const kundenSchreibspur = !gelesen || gelesen.unzerlegt ? "unbekannt"
      : Number(gelesen.stand) > 1 ? "ja" : Number.isFinite(Number(gelesen.stand)) ? "nein" : "unbekannt";
    const fensterZustand = !istObjekt(vermerk) ? (zugaenge.length === 0 ? "neu" : "keiner")
      : Number.isFinite(vermerk.bis) && vermerk.bis > jetzt ? "offen" : "abgelaufen";

    if (!mandanten) {
      zaehler.betriebe++;
      betriebe.push({ raum, position: 0, mandantId: null, klasse: "unklar", unterklasse: null,
        unklarGruende: ["bestand-ohne-betriebsliste"], anzahlPersonen: 0, anzahlAktiveLeitung: 0,
        leitungspersonenNichtAktiv: null, codes: null, mitgliedschaften: null, fensterZustand, kundenSchreibspur,
        juengsterZ0Monat: null, leitungszugangHeute: null, leitungszugangNachEd1Ed2: null, ausgesperrtDurchEd1Ed2: false });
      continue;
    }
    const ids = new Set(mandanten.filter(istObjekt).map((m) => m.id));
    zaehler.zugaengeVerwaist += zugaenge.filter(([, k]) => nichtLeer(k.mandantId) ? !ids.has(k.mandantId)
      : !(Number(k.betrieb ?? 0) >= 0 && Number(k.betrieb ?? 0) < mandanten.length)).length;
    const raumMitglieder = mitglieder.filter((x) => x.raum === raum);
    const selbststart = raum.startsWith("t-") || selbststarts.some((x) => istObjekt(x) && x.raum === raum);
    mandanten.forEach((/** @type {any} */ m, /** @type {number} */ position) => {
      zaehler.betriebe++;
      const b = betriebKlassifizieren({ raum, position, mandant: m, mandantenImRaum: mandanten, zugaenge, konten,
        mitgliedschaften: raumMitglieder, selbststart: selbststart || (istObjekt(m) && m.selbstAngelegt === true),
        demoRaum, kundenSchreibspur, fensterZustand, heute, jetzt });
      if (b.klasse === "ausgeschlossen") { ausgeschlossen.demo++; return; }
      zaehler.m7Belegt += b.codes ? b.codes.belegt : 0;
      betriebe.push(b);
    });
  }

  /* Ausgabe ohne Raum- und Betriebsnamen: Pseudonyme, Position, Zahlen. */
  const zeilen = betriebe.map((b) => {
    const { raum, mandantId, ...rest } = b;
    return { raumPseudonym: pseudo(`raum\0${raum}`), betriebIndex: b.position,
      betriebKennung: gespeicherteKennungen ? mandantId : (mandantId === null ? null : pseudo(`betrieb\0${raum}\0${mandantId}`)),
      ...Object.fromEntries(Object.entries(rest).filter(([k]) => k !== "position")) };
  }).sort((a, b) => (KLASSEN.indexOf(a.klasse) - KLASSEN.indexOf(b.klasse))
    || (a.raumPseudonym < b.raumPseudonym ? -1 : a.raumPseudonym > b.raumPseudonym ? 1 : a.betriebIndex - b.betriebIndex));

  /** @type {Record<string, number>} */ const summen = Object.fromEntries(KLASSEN.map((k) => [k, 0]));
  /** @type {Record<string, number>} */ const unterklassen = {};
  for (const z of zeilen) {
    summen[z.klasse] = (summen[z.klasse] || 0) + 1;
    if (z.unterklasse) unterklassen[z.unterklasse] = (unterklassen[z.unterklasse] || 0) + 1;
  }
  const ausgesperrt = zeilen.filter((z) => z.ausgesperrtDurchEd1Ed2);
  /** @type {Record<string, number>} */ const ausgesperrtJeKlasse = {};
  for (const z of ausgesperrt) ausgesperrtJeKlasse[z.klasse] = (ausgesperrtJeKlasse[z.klasse] || 0) + 1;

  const ausgang = summen.unklar > 0 ? AUSGANG.FEHLER_ODER_UNKLAR
    : zeilen.some((z) => BETROFFEN.has(z.klasse)) ? AUSGANG.BETROFFEN : AUSGANG.NICHTS_BETROFFEN;
  return {
    format: FORMAT, stichtag: heute,
    kennungen: gespeicherteKennungen ? "gespeichert" : "pseudonym",
    zaehler, summen, unterklassen, ausgeschlossen,
    aussperrungEd1Ed2: { betriebe: ausgesperrt.length, jeKlasse: ausgesperrtJeKlasse,
      ohneLeitungszugangHeute: zeilen.filter((z) => z.leitungszugangHeute === false).length,
      ohneLeitungszugangNachher: zeilen.filter((z) => z.leitungszugangNachEd1Ed2 === false).length },
    betriebe: zeilen, ausgang,
  };
}

/* ---------------------------------------------------------------------------
   Darstellung
   --------------------------------------------------------------------------- */

/** @param {any} e @param {"sicherung"|"kopie"} art */
export function alsMarkdown(e, art) {
  const z = [];
  z.push("# Erkennung gestrandeter Betriebe (nur lesend)", "");
  z.push(`Stichtag: ${e.stichtag} · Eingabe: ${art === "sicherung" ? "geprüfte Sicherung" : "Kopie einer Ablage"} · `
    + `Kennungen: ${e.kennungen === "pseudonym" ? "Pseudonyme (HMAC, Laufschlüssel)" : "wie gespeichert"} · Format ${e.format}`, "");
  z.push("> Enthält keine Namen, E-Mail-Adressen, Codes oder Prüfsummen. Nicht einchecken, nicht weitergeben.", "");
  z.push("## Summen", "", "| Klasse | Betriebe |", "|---|---|");
  for (const k of KLASSEN) z.push(`| ${k} | ${e.summen[k] || 0} |`);
  const uk = Object.entries(e.unterklassen);
  if (uk.length) { z.push("", "Unterklassen: " + uk.map(([k, n]) => `${k} = ${n}`).join(", ")); }
  z.push("", "## Aussperrung durch E-D1/E-D2 (strenge Regeln)", "");
  z.push(`- Betriebe, die heute einen Leitungszugang haben und danach keinen mehr: **${e.aussperrungEd1Ed2.betriebe}**`
    + (Object.keys(e.aussperrungEd1Ed2.jeKlasse).length ? ` (${Object.entries(e.aussperrungEd1Ed2.jeKlasse).map(([k, n]) => `${k}: ${n}`).join(", ")})` : ""));
  z.push(`- ohne Leitungszugang schon heute: ${e.aussperrungEd1Ed2.ohneLeitungszugangHeute}; nach E-D1/E-D2: ${e.aussperrungEd1Ed2.ohneLeitungszugangNachher}`);
  z.push("", "## Zähler", "");
  z.push(`- Räume: ${e.zaehler.raeume}, Betriebe: ${e.zaehler.betriebe}`);
  z.push(`- ausgeschlossen: ppg-gate ${e.ausgeschlossen["ppg-gate"]}, Löschung begonnen ${e.ausgeschlossen.loeschung}, Demo ohne Leitungs-Demozugang ${e.ausgeschlossen.demo}`);
  z.push(`- Zugänge ohne vorhandenen Raum: ${e.zaehler.zugaengeOhneRaum}; Zugänge ohne passenden Betrieb: ${e.zaehler.zugaengeVerwaist}`);
  z.push(`- M7 (Erstanmeldecode „belegt“ verbraucht, ohne Person): ${e.zaehler.m7Belegt}`);
  z.push("", "## Betriebe", "");
  z.push("| Raum | Pos. | Betrieb | Klasse | Unterklasse | Personen (≤5er) | aktive Leitung | Ltg.-Codes mit Person | ohne Person | Erstanmeldung offen | belegt | gesperrt/abgelaufen | Demo | Mitgl. aktiv | Fenster | Schreibspur | ausgesperrt E-D1/E-D2 | unklar weil |");
  z.push("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
  for (const b of e.betriebe) {
    const c = b.codes || {};
    z.push(`| ${b.raumPseudonym} | ${b.betriebIndex} | ${b.betriebKennung ?? "—"} | ${b.klasse} | ${b.unterklasse ?? ""} | ${b.anzahlPersonen} | `
      + `${b.anzahlAktiveLeitung} | ${c.personengebunden ?? "—"} | ${c.ohnePerson ?? "—"} | ${c.erstleitungOffen ?? "—"} | ${c.belegt ?? "—"} | `
      + `${c.gesperrtOderAbgelaufen ?? "—"} | ${c.demoOhnePerson ?? "—"} | ${b.mitgliedschaften ? b.mitgliedschaften.aktivMitAktiverLeitung : "—"} | `
      + `${b.fensterZustand} | ${b.kundenSchreibspur} | ${b.ausgesperrtDurchEd1Ed2 ? "ja" : "nein"} | ${b.unklarGruende.join(", ")} |`);
  }
  if (!e.betriebe.length) z.push("| — | | | | | | | | | | | | | | | | | |");
  z.push("", `Ausgang: ${e.ausgang} (0 = nichts betroffen, 2 = betroffen, 1 = Lesefehler/unklar)`, "");
  return z.join("\n");
}

/* ---------------------------------------------------------------------------
   Kommandozeile
   --------------------------------------------------------------------------- */

const HILFE = `Aufruf (nur lesend, nur auf Kopien):
  erkennung-gestrandete-betriebe.mjs --sicherung <Ordner>        [--json] [--ausgabe <Datei>] [--stichtag JJJJ-MM-TT]
  erkennung-gestrandete-betriebe.mjs --daten <Ordner> --kopie    [--json] [--ausgabe <Datei>] [--stichtag JJJJ-MM-TT]
  Optional: --gespeicherte-kennungen (Betriebskennung wie gespeichert statt Pseudonym)
  Umgebung: ERKENNUNG_LAUFSCHLUESSEL (mind. 32 Hex-Zeichen) für wiederholbare Pseudonyme`;

/** @param {string[]} a */
function argumente(a) {
  /** @type {Record<string, string|true>} */ const o = {};
  const schalter = ["kopie", "json", "gespeicherte-kennungen", "hilfe"];
  const werte = ["sicherung", "daten", "ausgabe", "stichtag", "jetzt"];
  for (let i = 0; i < a.length; i++) {
    const k = a[i].startsWith("--") ? a[i].slice(2) : null;
    if (k && schalter.includes(k)) o[k] = true;
    else if (k && werte.includes(k) && i + 1 < a.length && !a[i + 1].startsWith("--")) o[k] = a[++i];
    else throw new ErkennungsFehler(`Unbekanntes oder unvollständiges Argument.\n${HILFE}`, AUSGANG.ABGELEHNT);
  }
  return o;
}

/**
 * @param {string[]} argv
 * @param {{ aus?: (s: string) => void, fehler?: (s: string) => void, env?: Record<string, string|undefined> }} [io]
 * @returns {Promise<number>}
 */
export async function main(argv, { aus = (s) => process.stdout.write(s), fehler = (s) => process.stderr.write(s + "\n"), env = process.env } = {}) {
  try {
    const o = argumente(argv);
    if (o.hilfe) { aus(HILFE + "\n"); return 0; }
    const jetzt = typeof o.jetzt === "string" ? Date.parse(o.jetzt) : Date.now();
    if (!Number.isFinite(jetzt)) throw new ErkennungsFehler("--jetzt: ISO-Zeitpunkt erwartet.", AUSGANG.ABGELEHNT);
    if (o.stichtag !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(String(o.stichtag)))
      throw new ErkennungsFehler("--stichtag: JJJJ-MM-TT erwartet.", AUSGANG.ABGELEHNT);
    const schluesselText = env.ERKENNUNG_LAUFSCHLUESSEL || undefined;
    if (schluesselText !== undefined && !/^[0-9a-fA-F]{32,128}$/.test(schluesselText))
      throw new ErkennungsFehler("ERKENNUNG_LAUFSCHLUESSEL: 32 bis 128 Hex-Zeichen erwartet.", AUSGANG.ABGELEHNT);
    const laufschluessel = schluesselText ? Buffer.from(schluesselText, "hex") : randomBytes(32);

    const ein = await eingabeBestimmen({ sicherung: typeof o.sicherung === "string" ? o.sicherung : undefined,
      daten: typeof o.daten === "string" ? o.daten : undefined, kopie: o.kopie === true, env });
    const ausgabe = typeof o.ausgabe === "string" ? path.resolve(o.ausgabe) : null;
    if (ausgabe && liegtIn(ausgabe, ein.eingabe))
      throw new ErkennungsFehler("--ausgabe darf nicht in der Eingabe liegen — die Eingabe bleibt unberührt.", AUSGANG.ABGELEHNT);

    const vorher = await abdruck(ein.eingabe);
    const erg = await erkennen({ wurzel: ein.wurzel, jetzt, stichtag: typeof o.stichtag === "string" ? o.stichtag : undefined,
      laufschluessel, gespeicherteKennungen: o["gespeicherte-kennungen"] === true });
    if ((await abdruck(ein.eingabe)) !== vorher)
      throw new ErkennungsFehler("Die Eingabe hat sich während des Laufs verändert — schreibt dort ein Prozess? Ergebnis verworfen.", AUSGANG.FEHLER_ODER_UNKLAR);

    const text = o.json ? JSON.stringify({ ...erg, eingabe: ein.art }, null, 2) + "\n" : alsMarkdown(erg, ein.art);
    if (ausgabe) {
      const fh = await open(ausgabe, "wx", 0o600).catch((e) => {
        throw new ErkennungsFehler(`--ausgabe: Datei lässt sich nicht neu anlegen (${e.code || "Fehler"}; vorhandene Dateien werden nie überschrieben).`, AUSGANG.ABGELEHNT);
      });
      try { await fh.writeFile(text, "utf8"); } finally { await fh.close(); }
      fehler(`Ergebnis geschrieben (${erg.betriebe.length} Betriebe, Ausgang ${erg.ausgang}).`);
    } else aus(text);
    return erg.ausgang;
  } catch (e) {
    if (e instanceof ErkennungsFehler) { fehler(`FEHLER: ${e.message}`); return e.code; }
    /* Unerwartet: nur die Art, nie Inhalte oder Pfade (sie können Raumnamen oder Prüfsummen tragen). */
    fehler(`FEHLER: unerwarteter Fehler (${/** @type {any} */ (e)?.name || "Error"}). Lauf abgebrochen, nichts geschrieben.`);
    return AUSGANG.FEHLER_ODER_UNKLAR;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
  && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  process.exitCode = await main(process.argv.slice(2));
}
