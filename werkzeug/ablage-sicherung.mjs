#!/usr/bin/env node
/* ==========================================================================
   ABLAGE-SICHERUNG — Sichern, Prüfen, Wiederherstellen der ganzen Ablage

   Die Anwendung hält alles unter CENTRIC_DATEN (Vorgabe /data) als Dateien:
   ein Verzeichnis je Store, darin eine Datei je Schlüssel (server/lib/
   ablage.mjs). Dieses Werkzeug sichert diesen Baum — und zwar nur, was nach
   einer Wiederherstellung gebraucht wird.

     node werkzeug/ablage-sicherung.mjs sichern --quelle /data --ziel /sicherungen
     node werkzeug/ablage-sicherung.mjs pruefen --sicherung /sicherungen/centric-sicherung-…
     node werkzeug/ablage-sicherung.mjs wiederherstellen --sicherung … --ziel /data [--ersetzen] [--zustand <Ordner>]
     node werkzeug/ablage-sicherung.mjs schluessel-erneuern --zustand <Ordner>
     node werkzeug/ablage-sicherung.mjs widerrufbuch-neu --zustand <Ordner> [--daten /data]

   ---------------------------------------------------------------------------
   Was gesichert wird — und was nicht

   A  zwingend       centric              Betriebe, Bestände, Scherben, Stände,
                                          Sicherungen im Betrieb, Accounts,
                                          Mitgliedschaften (samt Generation),
                                          Zugangscodes, Verwalter, Kalender-
                                          Feeds, Push-Anmeldungen
   B  sinnvoll       centric-sitzungen    NUR `sk:` (Sicherungsschlüssel für
                                          die Sicherung außer Haus: gelten bis
                                          zu einem Jahr; der Klartext liegt nur
                                          beim Besitzer, nicht in der Ablage)
                     centric-spur         das Protokoll
   C  flüchtig       centric-accountsitzungen, centric-takt,
                     centric-sitzungen `t:`, centric `token:` / `tokencode:`

   Warum C bewusst fehlt: Eine Sitzung oder ein Einmal-Token, das nach der
   Sicherung widerrufen oder verbraucht wurde, wäre nach einer Wiederher-
   stellung wieder gültig. Das Weglassen ist hier die sichere Richtung — alle
   melden sich neu an, offene Einladungs- und Passwortlinks werden neu
   angefordert. Die Bremszähler (centric-takt) füllen sich von selbst.

   Ein Verzeichnis, das hier nicht eingeordnet ist, bricht die Sicherung ab.
   Wer einen neuen Store einführt, muss ihn in STORES einordnen — sonst fehlte
   er in jeder Sicherung, ohne dass es jemand merkt.

   ---------------------------------------------------------------------------
   Was nicht in /data liegt, aber zur Wiederherstellung gehört

   CENTRIC_PFEFFER (Umgebung). Die Hashes von Adressen und Zugangscodes sind
   damit gebildet; ohne denselben Pfeffer findet kein Konto und kein Code mehr
   zu seinem Datensatz. Die Sicherung speichert nur einen Prüfwert, nie den
   Pfeffer, und die Wiederherstellung lehnt einen anderen ab. Der Pfeffer
   gehört getrennt von den Daten gesichert (Passwortmanager, nicht neben
   die Sicherung).

   ---------------------------------------------------------------------------
   Aufbau einer Sicherung

     centric-sicherung-<UTC>/
       daten/<store>/<datei>.json   Kopien, byteweise
       MANIFEST.json                Dateiliste mit SHA-256 und Größe
       MANIFEST.sha256              Prüfsumme des Manifests
       FERTIG                       wird als Letztes geschrieben

   Gebaut wird in `.unfertig-…` und erst am Ende umbenannt. Eine Sicherung
   ohne FERTIG ist unvollständig und wird von `pruefen` und `wiederherstellen`
   abgelehnt.

   Konsistenz: Der Server darf laufen. Jede einzelne Datei ist durch die
   Ablage atomar, aber zwei zusammengehörige (Konto und Mitgliedschaft)
   können beim Kopieren auseinanderlaufen. Deshalb wird die Quelle nach dem
   Kopieren noch einmal angesehen. Hat sich dabei eine gesicherte Datei
   geändert, ist eine dazugekommen oder weggefallen, werden NUR diese
   Dateien neu kopiert und die Quelle erneut angesehen (bis zu zwölf Runden
   je Versuch). Gilt erst, wenn ein vollständiger Durchlauf jede Kopie
   unverändert bestätigt: dann hat sich seit dem Lesen nichts verändert, das
   sich an Größe, Änderungszeit, Inode oder Dateimenge zeigt (kein Beweis eines
   je bestehenden Zustands: Dateien, die nur zwischen zwei Listen existieren
   oder zwischen Stores wandern, sieht dieses Verfahren nicht). Gelingt das nicht, wird der
   Versuch verworfen und neu begonnen (dreimal), danach mit Fehler
   abgebrochen (Code 3, nichts angelegt).

   Grenzen dieser Zusicherung (WP-28b/2): Sie gilt für das Dateisystem, nicht
   für Anwendungsvorgänge. Schreibt die Anwendung zwei zusammengehörige Dateien
   nacheinander, kann ein Schnitt zwischen ihnen liegen. Deshalb muss nach der
   Ruhezeit `--ruhe` (Vorgabe 1000 ms) ein zweiter Durchlauf dasselbe zeigen;
   so sind Lücken unter dieser Zeit ausgeschlossen, längere nicht. Unter
   Dauerlast gelingt das nicht (Code 3). Eine Zusicherung für beliebige
   Dauerlast gibt es nur mit Schreib-Halt im Server, nicht in diesem Werkzeug.
   Wer sicher gehen will, stoppt den Server vorher — dann gibt es nie einen
   zweiten Anlauf.

   Schreib-Halt (WP-28c, --schreibhalt <Ordner>, server/lib/schreibhalt.mjs):
   Kopiert wird zuerst ohne Halt. Für den letzten Durchgang bittet das
   Werkzeug den laufenden Server über den Ordner `schreibhalt` seines
   Zustandsverzeichnisses um einen kurzen, befristeten Halt: Der Server lässt
   keine neuen Vorgänge mehr beginnen und bestätigt, sobald die laufenden
   fertig sind. Dann werden die geänderten Dateien nachkopiert und die Quelle
   geprüft — sie steht still, und keine Transaktion ist halb. Gilt nur, wenn
   der Server danach bestätigt, dass der Halt bis zur Freigabe galt; läuft
   die Frist vorher ab, zählt der Durchgang nicht (nächste Runde, am Ende
   Code 3). Antwortet kein Server, gilt der Weg mit Ruhezeit oben. Das
   Manifest vermerkt den Weg (`konsistenz`: "schreibhalt" | "ruhezeit").

   Sicherungsschlüssel nach einer Wiederherstellung (Betreiberentscheidung
   2026-11-07): Nach jeder vollständigen Wiederherstellung gilt KEIN früherer
   Sicherungsschlüssel mehr. Die Autorität dafür liegt außerhalb der Ablage
   (server/lib/schluesselepoche.mjs): die Schlüsselepoche im Zustandsverzeichnis
   (CENTRIC_ZUSTAND) und ihr Gegenstück `skbindung` in centric-sitzungen, das
   NIE in eine Sicherung kommt. Fehlt es nach dem Zurückspielen, beginnt der
   Server eine neue Epoche. Kennt dieses Werkzeug das Zustandsverzeichnis
   (--zustand oder CENTRIC_ZUSTAND), erneuert es die Epoche zusätzlich selbst,
   BEVOR es die Daten tauscht; misslingt das, wird nichts angefasst. Eine
   Sicherung, die `skbindung` oder sonst etwas Flüchtiges enthält, wird
   abgelehnt. Wer ein altes /data per Verzeichniskopie zurückspielt (ohne
   dieses Werkzeug), ruft danach `schluessel-erneuern` auf.

   Widerrufene Zugangscodes nach einer Wiederherstellung (E-M6, 2026-11-13,
   server/lib/widerrufbuch.mjs): Mit Zustandsverzeichnis übernimmt das Werkzeug
   vor dem Tausch alle in der bisherigen Ablage gesperrten Codes ins Widerrufbuch,
   sperrt alles, was dort steht, in der zurückzuspielenden Kopie (`gesperrt`,
   das auch ältere Bilder kennen) und vermerkt die Wiederherstellung. Buch
   beschädigt, fremd oder fehlend bei vorhandenem Anker: Abbruch, nichts
   angefasst. `widerrufbuch-neu` legt ein verlorenes Buch nur bewusst neu an.

   Wiederherstellen: Der Server muss stehen (es wird versucht, /gesund zu
   erreichen; antwortet es, wird abgelehnt). Ein nicht leeres Ziel wird nur
   mit --ersetzen angefasst, und auch dann nichts gelöscht: Der alte Inhalt
   wandert nach `.vor-wiederherstellung-<UTC>/` im Ziel.
   ========================================================================== */

import { createHash, randomBytes } from "node:crypto";
import { mkdir, open, readdir, readFile, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { hostname } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { BINDUNG_SCHLUESSEL, epocheDateiErneuern, ueberlappen } from "../server/lib/schluesselepoche.mjs";
import { haltAnfordern } from "../server/lib/schreibhalt.mjs";
import { dateiname } from "../server/lib/ablage.mjs";
import { ANKER_SCHLUESSEL, MARKE_PRAEFIX, VERWALTER_PRAEFIX, buchLesen, buchNeu, buchSchreiben, einsammeln, nachzuziehen,
  verwalterNachzuziehen, markenNachzuziehen, markeZerlegen, gesperrtesKonto, NACHTRAG_SCHLUESSEL, nachtragSchluessel }
  from "../server/lib/widerrufbuch.mjs";
import { SPERRDATEI, VERALTET_MS } from "../server/lib/prozesssperre.mjs";

/** Dieselbe Fassung wie server/lib/ablage.mjs (FASSUNG). */
const ABLAGE_FASSUNG = 1;
const FORMAT = 1;

/**
 * Einordnung jedes Stores. `nur`: nur diese Schlüsselpräfixe werden
 * gesichert. `ohne`: diese Schlüsselpräfixe werden weggelassen.
 * Ohne Angabe wird der Store ganz gesichert; `klasse: "C"` heißt: gar nicht.
 */
export const STORES = {
  "centric":                  { klasse: "A", ohne: ["token:", "tokencode:", "zweifaktor-nachweis:"] },
  "centric-sitzungen":        { klasse: "B", nur: ["sk:", "skw:", "skraum:"] },
  "centric-spur":             { klasse: "B" },
  "centric-accountsitzungen": { klasse: "C" },
  "centric-takt":             { klasse: "C" },
};

/** Wie viele Dateien quelleAnsehen gleichzeitig mit stat ansieht. */
const STAT_BLOCK = 64;

const sha256 = (/** @type {Buffer|string} */ b) => createHash("sha256").update(b).digest("hex");

export class SicherungsFehler extends Error {
  /** @param {string} meldung @param {number} [code] */
  constructor(meldung, code = 1) { super(meldung); this.code = code; }
}

/** Prüfwert des Pfeffers — kein Pfeffer, kein Rückschluss darauf. */
function pfefferPruefwert(/** @type {string|undefined} */ pfeffer) {
  return pfeffer ? sha256(`centric-sicherung-pfeffer-v1:${pfeffer}`).slice(0, 16) : null;
}

const stempel = (/** @type {Date} */ d) =>
  d.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");

/** Schreibt eine Datei vollständig und zwingt sie auf die Platte. */
async function schreibenFest(/** @type {string} */ ziel, /** @type {Buffer|string} */ inhalt) {
  const fh = await open(ziel, "wx", 0o600);
  try { await fh.writeFile(inhalt); await fh.sync(); } finally { await fh.close(); }
}

/** Ordner auf die Platte; nicht jedes Dateisystem erlaubt das (Windows). */
async function ordnerFest(/** @type {string} */ ordner) {
  try { const dh = await open(ordner, "r"); try { await dh.sync(); } finally { await dh.close(); } }
  catch { /* siehe ablage.mjs: dann ohne */ }
}

/** @param {string} datei @param {Buffer} inhalt */
export function umschlagPruefen(datei, inhalt) {
  let u;
  try { u = JSON.parse(inhalt.toString("utf8")); }
  catch { throw new SicherungsFehler(`${datei} ist kein gültiger JSON-Umschlag (beschädigt?)`); }
  if (!u || u.fassung !== ABLAGE_FASSUNG)
    throw new SicherungsFehler(`${datei}: unbekannte Fassung der Ablage`);
}

/* ---------------------------------------------------------------------------
   Quelle ansehen
   --------------------------------------------------------------------------- */

/**
 * Listet, was in die Sicherung gehört, und was bewusst fehlt. Auch für
 * werkzeug/ablage-pruefen.mjs: Was hier oder in umschlagPruefen scheitert,
 * bricht die Sicherung ab.
 * @param {string} quelle
 */
export async function quelleAnsehen(quelle) {
  let eintraege;
  try { eintraege = await readdir(quelle, { withFileTypes: true }); }
  catch (e) { throw new SicherungsFehler(`Quelle ${quelle} nicht lesbar: ${/** @type {any} */ (e).message}`); }

  /** @type {{store: string, name: string, pfad: string, bytes: number, mtimeMs: number}[]} */
  const dateien = [];
  /** @type {{store: string, name: string, pfad: string}[]} */
  const kandidaten = [];
  let veraendert = false;
  /** @type {Record<string, {klasse: string, dateien: number, bytes: number}>} */
  const stores = {};
  /** @type {Record<string, Record<string, number>>} */
  const ausgelassen = {};
  const merke = (/** @type {string} */ s, /** @type {string} */ grund) => {
    ausgelassen[s] = ausgelassen[s] || {};
    ausgelassen[s][grund] = (ausgelassen[s][grund] || 0) + 1;
  };

  for (const e of eintraege) {
    if (e.name.startsWith(".")) continue;             // .vor-wiederherstellung-…, .unfertig-…
    if (!e.isDirectory())
      throw new SicherungsFehler(`Unerwartete Datei im Wurzelverzeichnis: ${e.name}. Sicherung abgebrochen.`, 2);
    const regel = /** @type {Record<string, any>} */ (STORES)[e.name];
    if (!regel)
      throw new SicherungsFehler(
        `Store „${e.name}" ist nicht eingeordnet (werkzeug/ablage-sicherung.mjs, STORES). `
        + "Sicherung abgebrochen — sonst fehlte er unbemerkt.", 2);
    const dir = path.join(quelle, e.name);
    stores[e.name] = { klasse: regel.klasse, dateien: 0, bytes: 0 };
    let inhaltDir;
    try { inhaltDir = await readdir(dir, { withFileTypes: true }); }
    catch (fehler) {
      // Das Verzeichnis ist zwischen der Wurzelliste und hier verschwunden (verschoben, ersetzt): Veränderung.
      if (/** @type {any} */ (fehler).code === "ENOENT") { veraendert = true; delete stores[e.name]; continue; }
      throw fehler;
    }
    for (const d of inhaltDir) {
      /* Ein Link (auch kaputt) ist kein Schlüssel-Datei: abbrechen, nie als „verändert“ melden. */
      if (d.isSymbolicLink())
        throw new SicherungsFehler(`Symbolischer Link ${e.name}/${d.name}. Sicherung abgebrochen — bitte von Hand ansehen.`, 2);
      if (d.isDirectory())
        throw new SicherungsFehler(`Unerwartetes Verzeichnis ${e.name}/${d.name}. Sicherung abgebrochen.`, 2);
      if (d.name.endsWith(".tmp")) { merke(e.name, "unfertige Zwischendatei (.tmp)"); continue; }
      if (!d.name.endsWith(".json"))
        throw new SicherungsFehler(`Fremde Datei ${e.name}/${d.name}. Sicherung abgebrochen.`, 2);
      if (regel.klasse === "C") { merke(e.name, "flüchtig (Klasse C)"); continue; }
      let schluessel;
      try { schluessel = decodeURIComponent(d.name.slice(0, -5)); }
      catch { throw new SicherungsFehler(`Dateiname ${e.name}/${d.name} ist kein gültiger Schlüssel.`, 2); }
      if (regel.nur && !regel.nur.some((/** @type {string} */ p) => schluessel.startsWith(p))) {
        merke(e.name, "flüchtig (Präfix nicht gesichert)"); continue;
      }
      const vom = (regel.ohne || []).find((/** @type {string} */ p) => schluessel.startsWith(p));
      if (vom) { merke(e.name, `flüchtig (${vom})`); continue; }
      kandidaten.push({ store: e.name, name: d.name, pfad: path.join(dir, d.name) });
    }
  }
  /* stat in Blöcken gleichzeitig: Die Liste ist zugleich die Gegenprobe der Sicherung, und je kürzer sie
     dauert, desto kleiner ist das Fenster, in dem eine Änderung sie stört (5000 Dateien: sonst ~220 ms). */
  for (let i = 0; i < kandidaten.length; i += STAT_BLOCK) {
    const block = kandidaten.slice(i, i + STAT_BLOCK);
    const ergebnisse = await Promise.all(block.map((k) => stat(k.pfad).then((st) => ({ st }), (err) => ({ err }))));
    ergebnisse.forEach((r, j) => {
      const k = block[j];
      if ("err" in r) {
        // Zwischen readdir und stat ersetzt oder entfernt: Veränderung der Quelle, kein Fehler.
        if (/** @type {any} */ (r.err).code === "ENOENT") { veraendert = true; return; }
        throw r.err;
      }
      dateien.push({ ...k, bytes: r.st.size, mtimeMs: r.st.mtimeMs, ino: r.st.ino });
      stores[k.store].dateien += 1;
      stores[k.store].bytes += r.st.size;
    });
  }
  dateien.sort((a, b) => (a.store + "/" + a.name).localeCompare(b.store + "/" + b.name));
  return { dateien, stores, ausgelassen, veraendert };
}

/** Fingerabdruck einer Datei aus der Liste: Größe, Änderungszeit und Inode. Die Ablage ersetzt eine Datei immer
    durch eine neue (Zwischendatei + rename = neue Inode); so fällt auch ein Austausch auf, der Größe und mtime
    zufällig gleich lässt (mtime-Takt). Ein Fehlalarm kostet nur ein Nachkopieren. */
const fp = (/** @type {{bytes:number,mtimeMs:number,ino?:number}} */ d) => `${d.bytes}|${d.mtimeMs}|${d.ino ?? ""}`;
const idVon = (/** @type {{store:string,name:string}} */ d) => `${d.store}/${d.name}`;

/* ---------------------------------------------------------------------------
   Sichern
   --------------------------------------------------------------------------- */

/**
 * @param {{quelle: string, ziel: string, jetzt?: Date, versuche?: number, runden?: number,
 *          pause?: number, ruhe?: number, meldung?: (s: string) => void,
 *          schreibhalt?: (null|string|{anfordern: () => Promise<any>})}} o
 *   `ruhe` (ms): Bestätigungspause vor dem Abschluss, siehe unten. Als Bibliotheksaufruf 0 (Tests, kurze Läufe);
 *   die Kommandozeile setzt 1000, wenn nichts anderes verlangt wird (`--ruhe`).
 *   `schreibhalt`: Ordner des Halte-Kanals (oder ein Objekt mit `anfordern()` wie haltAnfordern) — siehe Kopf.
 * @returns {Promise<{pfad: string, manifest: any}>}
 */
export async function sichern({ quelle, ziel, jetzt = new Date(), versuche = 3, runden = 12, pause = 1000,
  ruhe = 0, meldung = () => {}, schreibhalt = null }) {
  quelle = path.resolve(quelle); ziel = path.resolve(ziel);
  const haltKanal = typeof schreibhalt === "string"
    ? { anfordern: () => haltAnfordern(/** @type {string} */ (schreibhalt)) } : schreibhalt;
  if (typeof schreibhalt === "string") {
    if (ueberlappen(schreibhalt, quelle))
      throw new SicherungsFehler(`Der Halte-Ordner ${schreibhalt} liegt in der Quelle oder umgekehrt.`, 2);
    if (!(await stat(schreibhalt).then((st) => st.isDirectory(), () => false)))
      throw new SicherungsFehler(`Halte-Ordner ${schreibhalt} fehlt (er entsteht beim Serverstart im Zustandsverzeichnis).`, 2);
  }
  /** Ohne Server (keine Antwort) für den Rest des Laufs ohne Halt: nicht in jeder Runde warten. */
  let haltAus = !haltKanal;
  /** Unbestätigte Halte (Drain-Grenze, abgelehnt): nach dem zweiten für diesen Lauf ohne Halt weiter. */
  let haltUnbestaetigt = 0;
  if (ziel === quelle || ziel.startsWith(quelle + path.sep))
    throw new SicherungsFehler("Das Ziel darf nicht innerhalb der Quelle liegen — die Sicherung würde sich selbst sichern.", 2);
  await mkdir(ziel, { recursive: true, mode: 0o700 });

  const name = `centric-sicherung-${stempel(jetzt)}`;
  const endgueltig = path.join(ziel, name);
  const werkstatt = path.join(ziel, `.unfertig-${name}`);
  if (await stat(endgueltig).then(() => true, () => false))
    throw new SicherungsFehler(`${endgueltig} gibt es schon. Nichts überschrieben.`);

  const pruefwert = pfefferPruefwert(process.env.CENTRIC_PFEFFER);
  if (!pruefwert) meldung("Warnung: CENTRIC_PFEFFER ist nicht gesetzt — die Sicherung kann den Pfeffer nicht gegenprüfen.");

  let letzterGrund = "";
  /** @type {"schreibhalt"|"ruhezeit"|null} */
  let konsistenz = null;
  try {
    for (let versuch = 1; versuch <= versuche; versuch++) {
      await rm(werkstatt, { recursive: true, force: true });
      let ansicht = await quelleAnsehen(quelle);
      if (ansicht.veraendert) {
        letzterGrund = "Die Ablage hat sich während der Sicherung verändert.";
        meldung(`Versuch ${versuch}/${versuche}: ${letzterGrund}`);
        if (versuch < versuche) await new Promise((r) => setTimeout(r, pause));
        continue;
      }
      await mkdir(path.join(werkstatt, "daten"), { recursive: true, mode: 0o700 });

      /* Kopieren in Runden. Eine Datei gilt als gesichert, wenn ihre Kopie zu dem Fingerabdruck gehört, den die
         Liste VOR dem Lesen hatte. Danach wird die Quelle neu angesehen: stimmt jede Datei der neuen Liste mit
         ihrer Kopie überein (und nichts fehlt oder ist dazugekommen), hat sich zwischen Lesen und Prüfdurchlauf
         nichts verändert, das sich an Größe, Änderungszeit, Inode oder Dateimenge zeigt — gemeinsam für alle
         Dateien, nicht nur je Datei. (Kein Beweis eines je existierenden Zustands bei Dateien, die zyklisch
         hin- und herwandern; dasselbe galt für den Vorher/Nachher-Vergleich zuvor.)
         Sonst werden nur die abweichenden Dateien in der nächsten Runde neu gelesen. */
      /** @type {Map<string, {fp: string, bytes: number, sha256: string}>} */
      const kopien = new Map();
      const storeAngelegt = new Set();
      /* Eine Kopie, die nicht mehr zum Stand der Quelle gehört, wird sofort samt Datei verworfen:
         in der Werkstatt liegt nie etwas, das nicht in `kopien` steht (pruefen() wacht darüber). */
      const verwerfen = async (/** @type {string} */ id) => {
        kopien.delete(id);
        await rm(path.join(werkstatt, "daten", id), { force: true });
      };
      /** Bringt die Kopien auf den Stand der Liste. true: unterwegs Unruhe gesehen. */
      const kopieren = async (/** @type {Awaited<ReturnType<typeof quelleAnsehen>>} */ liste) => {
        let unruhig = false;
        const aktuell = new Set(liste.dateien.map(idVon));
        for (const id of [...kopien.keys()]) if (!aktuell.has(id)) await verwerfen(id);   // gelöscht oder verschoben
        for (const d of liste.dateien) {
          const id = idVon(d);
          if (kopien.get(id)?.fp === fp(d)) continue;                       // Kopie gehört schon zu diesem Stand
          await verwerfen(id);
          let inhalt;
          try { inhalt = await readFile(d.pfad); }
          catch (e) {
            if (/** @type {any} */ (e).code === "ENOENT") { unruhig = true; continue; }
            throw e;
          }
          if (inhalt.length !== d.bytes) { unruhig = true; continue; }     // zwischen Listen und Lesen geändert
          umschlagPruefen(id, inhalt);
          if (!storeAngelegt.has(d.store)) {
            await mkdir(path.join(werkstatt, "daten", d.store), { recursive: true, mode: 0o700 });
            storeAngelegt.add(d.store);
          }
          await schreibenFest(path.join(werkstatt, "daten", d.store, d.name), inhalt);
          kopien.set(id, { fp: fp(d), bytes: inhalt.length, sha256: sha256(inhalt) });
        }
        return unruhig;
      };
      /** Stimmt die Liste mit den Kopien überein (Menge und Fingerabdrücke)? */
      const gleich = (/** @type {Awaited<ReturnType<typeof quelleAnsehen>>} */ l) => !l.veraendert
        && l.dateien.length === kopien.size && l.dateien.every((d) => kopien.get(idVon(d))?.fp === fp(d));
      let stabil = false;
      for (let runde = 1; runde <= runden && !stabil; runde++) {
        let unruhig = await kopieren(ansicht);
        if (!haltAus) {
          /* Letzter Durchgang unter Schreib-Halt (siehe Kopf). */
          const h = await /** @type {{anfordern: () => Promise<any>}} */ (haltKanal).anfordern();
          if (h.gehalten) {
            let ok = false;
            let gehaltenBisZuletzt = false;
            /** @type {Awaited<ReturnType<typeof quelleAnsehen>>|null} */
            let unterHalt = null;
            try {
              const vorher = await quelleAnsehen(quelle);
              const u = vorher.veraendert || await kopieren(vorher);
              unterHalt = await quelleAnsehen(quelle);
              ok = !u && gleich(unterHalt);
            } finally {
              gehaltenBisZuletzt = await h.freigeben();
            }
            ansicht = unterHalt || await quelleAnsehen(quelle);
            if (ok && gehaltenBisZuletzt) { stabil = true; konsistenz = "schreibhalt"; break; }
            meldung(`Versuch ${versuch}/${versuche}, Runde ${runde}/${runden}: ${gehaltenBisZuletzt
              ? "Ablage hat sich unter dem Schreib-Halt verändert (Schreiber außerhalb des Servers?)"
              : "Schreib-Halt vor dem Abschluss abgelaufen — dieser Durchgang zählt nicht"}.`);
            continue;
          }
          if (h.keinServer) {
            haltAus = true;
            meldung(`Schreib-Halt nicht verfügbar (${h.grund}) — weiter mit Ruhezeit, ohne Halt.`);
          } else {
            haltUnbestaetigt += 1;
            if (haltUnbestaetigt >= 2) haltAus = true;
            meldung(`Versuch ${versuch}/${versuche}, Runde ${runde}/${runden}: Schreib-Halt nicht bestätigt (${h.grund}) — ${haltAus
              ? "für den Rest des Laufs ohne Halt, mit Ruhezeit" : "diese Runde mit Ruhezeit"}.`);
          }
        }
        let jetztListe = await quelleAnsehen(quelle);
        if (jetztListe.veraendert) unruhig = true;
        stabil = !unruhig && gleich(jetztListe);
        /* Ruhezeit: Eine Transaktion über mehrere Dateien (Konto, dann Mitgliedschaft) kann zwischen zwei
           Schreibvorgängen im Schnitt liegen. Nach `ruhe` ms (Monotonzeit, unabhängig von der Dateiuhr) muss ein
           zweiter vollständiger Durchlauf dasselbe zeigen: Dann war die erste Datei schon vor dem ersten und
           die zweite noch nicht nach dem zweiten Durchlauf geschrieben — Lücken kürzer als `ruhe` sind
           ausgeschlossen. Längere Lücken (z. B. Warten auf eine Raumsperre) bleiben möglich. */
        if (stabil && ruhe > 0) {
          await new Promise((r) => setTimeout(r, ruhe));
          jetztListe = await quelleAnsehen(quelle);
          stabil = gleich(jetztListe);
        }
        if (stabil) konsistenz = "ruhezeit";
        ansicht = jetztListe;
        if (!stabil && runde < runden) meldung(`Versuch ${versuch}/${versuche}, Runde ${runde}/${runden}: Ablage hat sich verändert — geänderte Dateien werden nachkopiert.`);
      }
      if (!stabil) {
        letzterGrund = "Die Ablage hat sich während der Sicherung verändert.";
        meldung(`Versuch ${versuch}/${versuche}: ${letzterGrund}`);
        await rm(werkstatt, { recursive: true, force: true });
        if (versuch < versuche) await new Promise((r) => setTimeout(r, pause));
        continue;
      }

      /* Stores im Endstand bekommen ihr Verzeichnis auch ohne Dateien (die Wiederherstellung braucht es);
         ein Store, der zwischendurch ganz weggefallen ist, bleibt nicht als leeres Verzeichnis zurück. */
      for (const sName of Object.keys(ansicht.stores))
        await mkdir(path.join(werkstatt, "daten", sName), { recursive: true, mode: 0o700 });
      for (const sName of await readdir(path.join(werkstatt, "daten")))
        if (!Object.hasOwn(ansicht.stores, sName)) await rm(path.join(werkstatt, "daten", sName), { recursive: true, force: true });
      const liste = ansicht.dateien.map((d) => {
        const k = /** @type {{bytes: number, sha256: string}} */ (kopien.get(idVon(d)));
        return { pfad: idVon(d), bytes: k.bytes, sha256: k.sha256 };
      });

      const summe = { dateien: liste.length, bytes: liste.reduce((a, d) => a + d.bytes, 0) };
      const manifest = {
        format: FORMAT, werkzeug: "ablage-sicherung", erstellt: jetzt.toISOString(),
        pfefferPruefwert: pruefwert, stores: ansicht.stores, ausgelassen: ansicht.ausgelassen,
        konsistenz, summe, dateien: liste,
      };
      const text = JSON.stringify(manifest, null, 2) + "\n";
      await schreibenFest(path.join(werkstatt, "MANIFEST.json"), text);
      await schreibenFest(path.join(werkstatt, "MANIFEST.sha256"), sha256(text) + "\n");
      // Erst jetzt gilt die Sicherung als vollständig.
      await schreibenFest(path.join(werkstatt, "FERTIG"), `FERTIG ${sha256(text)}\n`);
      await ordnerFest(werkstatt);

      // Gegenprobe, bevor sie ihren Namen bekommt: das, was auf der Platte liegt.
      const probe = await pruefen(werkstatt);
      if (!probe.ok) {
        await rm(werkstatt, { recursive: true, force: true });
        throw new SicherungsFehler(`Die frisch geschriebene Sicherung besteht die Prüfung nicht:\n  ${probe.fehler.join("\n  ")}`);
      }
      await rename(werkstatt, endgueltig);
      await ordnerFest(ziel);
      return { pfad: endgueltig, manifest };
    }
  } catch (e) {
    // Jeder Abbruch (auch Code 1/2) hinterlässt nichts Halbes im Ziel.
    await rm(werkstatt, { recursive: true, force: true }).catch(() => {});
    throw e;
  }
  throw new SicherungsFehler(
    `${letzterGrund} Nach ${versuche} Versuchen aufgegeben, keine Sicherung angelegt. `
    + "Server stoppen und erneut sichern.", 3);
}

/* ---------------------------------------------------------------------------
   Prüfen
   --------------------------------------------------------------------------- */

/**
 * @param {string} sicherung
 * @returns {Promise<{ok: boolean, fehler: string[], manifest: any|null}>}
 */
export async function pruefen(sicherung) {
  sicherung = path.resolve(sicherung);
  /** @type {string[]} */ const fehler = [];
  const lies = (/** @type {string} */ n) => readFile(path.join(sicherung, n));

  let manifestText, fertig, summeDatei;
  try { fertig = (await lies("FERTIG")).toString("utf8").trim(); }
  catch { return { ok: false, manifest: null, fehler: ["FERTIG fehlt — die Sicherung wurde nie abgeschlossen oder ist unvollständig kopiert."] }; }
  try { manifestText = await lies("MANIFEST.json"); }
  catch { return { ok: false, manifest: null, fehler: ["MANIFEST.json fehlt."] }; }
  try { summeDatei = (await lies("MANIFEST.sha256")).toString("utf8").trim(); }
  catch { return { ok: false, manifest: null, fehler: ["MANIFEST.sha256 fehlt."] }; }

  const echt = sha256(manifestText);
  if (summeDatei !== echt) fehler.push("MANIFEST.json stimmt nicht mit MANIFEST.sha256 überein.");
  if (fertig !== `FERTIG ${echt}`) fehler.push("FERTIG gehört nicht zu diesem Manifest.");
  let manifest;
  try { manifest = JSON.parse(manifestText.toString("utf8")); }
  catch { return { ok: false, manifest: null, fehler: [...fehler, "MANIFEST.json ist kein gültiges JSON."] }; }
  if (manifest.format !== FORMAT) fehler.push(`Unbekanntes Format ${manifest.format}.`);
  if (!Array.isArray(manifest.dateien)) return { ok: false, manifest, fehler: [...fehler, "Manifest ohne Dateiliste."] };
  if (fehler.length) return { ok: false, manifest, fehler };

  const erwartet = new Set();
  let bytes = 0;
  for (const d of manifest.dateien) {
    if (typeof d.pfad !== "string" || !/^[a-z0-9-]+\/[A-Za-z0-9_%-]+\.json$/.test(d.pfad)
      || !Object.hasOwn(STORES, d.pfad.split("/")[0])) {
      fehler.push(`Unzulässiger Pfad im Manifest: ${String(d.pfad)}`); continue;
    }
    erwartet.add(d.pfad);
    let inhalt;
    try { inhalt = await readFile(path.join(sicherung, "daten", d.pfad)); }
    catch { fehler.push(`Fehlt: ${d.pfad}`); continue; }
    if (inhalt.length !== d.bytes) fehler.push(`Größe weicht ab: ${d.pfad}`);
    if (sha256(inhalt) !== d.sha256) fehler.push(`Prüfsumme weicht ab: ${d.pfad}`);
    try { umschlagPruefen(d.pfad, inhalt); } catch (e) { fehler.push(/** @type {Error} */ (e).message); }
    bytes += inhalt.length;
  }
  // Nichts darf dabeiliegen, was das Manifest nicht kennt.
  try {
    for (const s of await readdir(path.join(sicherung, "daten"), { withFileTypes: true })) {
      if (!s.isDirectory()) { fehler.push(`Unerwartet in daten/: ${s.name}`); continue; }
      for (const f of await readdir(path.join(sicherung, "daten", s.name)))
        if (!erwartet.has(`${s.name}/${f}`)) fehler.push(`Nicht im Manifest: ${s.name}/${f}`);
    }
  } catch { fehler.push("Verzeichnis daten/ fehlt oder ist nicht lesbar."); }
  if (manifest.summe && (manifest.summe.dateien !== manifest.dateien.length || manifest.summe.bytes !== bytes))
    fehler.push("Summen im Manifest stimmen nicht.");
  return { ok: fehler.length === 0, fehler, manifest };
}

/* ---------------------------------------------------------------------------
   Wiederherstellen
   --------------------------------------------------------------------------- */

/** Antwortet ein Server unter dieser Adresse? Dann läuft er. */
async function serverLaeuft(/** @type {string} */ url) {
  try {
    await fetch(url, { signal: AbortSignal.timeout(2000) });
    return true;
  } catch { return false; }
}

/** Name des Vermerks der Wiederherstellungen im Datenverzeichnis (Punktdatei: nicht gesichert). */
export const WIEDERHERSTELL_VERMERK = ".wiederhergestellt.json";

/**
 * Alle vermerkten Wiederherstellungen eines Datenverzeichnisses, älteste
 * zuerst: [{ zeit, sicherungErstellt }]. Keine Datei: []. Die frühere Form
 * (ein einzelnes Objekt) wird als Liste mit einem Eintrag gelesen.
 * Vorhanden, aber unlesbar oder unvollständig: Fehler — nie still „keine".
 * @param {string} wurzel
 * @returns {Promise<Array<{zeit: string, sicherungErstellt: string}>>}
 */
export async function wiederherstellVermerkeLesen(wurzel) {
  const datei = path.join(wurzel, WIEDERHERSTELL_VERMERK);
  let roh;
  try { roh = await readFile(datei, "utf8"); }
  catch (e) {
    if (/** @type {any} */ (e).code === "ENOENT") return [];
    throw new SicherungsFehler(`${datei} ist nicht lesbar (${/** @type {any} */ (e).code || e}). Erst klären — siehe BETRIEB-SICHERUNG §4a.`, 2);
  }
  let o;
  try { o = JSON.parse(roh); } catch { o = null; }
  const liste = Array.isArray(o?.wiederherstellungen) ? o.wiederherstellungen
    : (o && typeof o === "object" && o.zeit && o.sicherungErstellt ? [o] : null);
  if (!liste || !liste.every((w) => w && Number.isFinite(Date.parse(w.zeit)) && Number.isFinite(Date.parse(w.sicherungErstellt))))
    throw new SicherungsFehler(`${datei} ist beschädigt — die Standfolge der Wiederherstellungen ist nicht bekannt. `
      + "Erst klären — siehe BETRIEB-SICHERUNG §4a.", 2);
  return liste.map((w) => ({ zeit: w.zeit, sicherungErstellt: w.sicherungErstellt }));
}

/**
 * Gehört diese Datei der Sicherung nach STORES überhaupt hinein? Sonst ist die Sicherung fremd oder manipuliert.
 * Diese Prüfung ist nur so streng wie STORES: Die Positivliste von centric-sitzungen darf nie Flüchtiges aufnehmen
 * (t:, ta:, skbindung) — sonst nähme auch das Zurückspielen es an (Test: sicherungsschluessel-wiederherstellung).
 * STORES darf nur strenger werden; wird es strenger, bleiben ältere Sicherungen wegen des nicht geprüften
 * `ohne` (unten) zurückspielbar.
 */
export function gehoertInSicherung(/** @type {string} */ pfad) {
  const [store, datei] = pfad.split("/");
  const regel = /** @type {Record<string, any>} */ (STORES)[store];
  if (!regel || regel.klasse === "C") return false;
  let schluessel;
  try { schluessel = decodeURIComponent(datei.slice(0, -5)); } catch { return false; }
  if (store === "centric-sitzungen" && schluessel === BINDUNG_SCHLUESSEL) return false;
  /* `ohne` wird hier nicht geprüft: Ältere Sicherungen enthielten Präfixe, die erst später ausgeschlossen wurden
     (z. B. zweifaktor-nachweis:), und sollen sich weiter zurückspielen lassen. Die Sitzungsablage dagegen nur mit
     ihrer festen Positivliste. */
  return !regel.nur || regel.nur.some((/** @type {string} */ p) => schluessel.startsWith(p));
}

/** Das Zustandsverzeichnis darf nicht in der Ablage liegen (es würde sonst mit ihr gesichert und zurückgespielt).
    Verglichen werden die echten Pfade (Links und Junctions aufgelöst). */
function zustandOrtPruefen(/** @type {string} */ zustand, /** @type {string} */ ziel) {
  const z = path.resolve(zustand);
  if (ueberlappen(z, ziel))
    throw new SicherungsFehler(`Das Zustandsverzeichnis ${z} liegt in der Ablage ${ziel} oder umgekehrt. Nichts wurde angefasst.`, 2);
  return z;
}

/**
 * Nach dem Zurückspielen eines alten /data ohne dieses Werkzeug (Verzeichniskopie): neue Schlüsselepoche, damit kein
 * früherer Sicherungsschlüssel mehr gilt.
 * Wie beim Wiederherstellen muss der Server stehen: Ein laufender Server schriebe sofort eine Bindung zur alten Ablage.
 * @param {{zustand: string, daten?: string, serverUrl?: string, serverPruefen?: boolean}} o
 */
export async function schluesselErneuern({ zustand, daten, serverUrl, serverPruefen = true }) {
  const z = zustandOrtPruefen(zustand, path.resolve(daten || process.env.CENTRIC_DATEN || "/data"));
  if (serverPruefen) {
    const url = serverUrl || `http://127.0.0.1:${process.env.PORT || 3000}/gesund`;
    if (await serverLaeuft(url))
      throw new SicherungsFehler(`Unter ${url} antwortet ein Server. Erst stoppen, dann die Schlüsselepoche erneuern. Nichts wurde angefasst.`);
  }
  try { return await epocheDateiErneuern(z, "von-hand-nach-wiederherstellung"); }
  catch (e) { throw new SicherungsFehler(`Schlüsselepoche nicht erneuert: ${/** @type {Error} */ (e).message}`); }
}

/* ---------------------------------------------------------------------------
   Widerrufbuch (E-M6) — Zugangscodes einer Ablage auf der Platte lesen und sperren
   --------------------------------------------------------------------------- */

const KONTO_PRAEFIX = "konto%3A";

/** Den Inhalt (`daten`) eines Umschlags lesen; fehlt die Datei: null. Beschädigt: wirft (fail-closed). */
async function umschlagDaten(/** @type {string} */ datei) {
  let roh;
  try { roh = await readFile(datei); }
  catch (e) { if (/** @type {any} */ (e).code === "ENOENT") return null; throw e; }
  umschlagPruefen(datei, roh);
  const u = JSON.parse(roh.toString("utf8"));
  return u.typ === "json" ? u.daten : JSON.parse(u.daten);
}

/** Einen JSON-Umschlag wie server/lib/ablage.mjs schreiben (überschreibt; nur in der Stufe oder einem stillen Ziel). */
async function umschlagSchreiben(/** @type {string} */ datei, /** @type {any} */ daten, /** @type {object} */ metadata = {}) {
  const serialisiert = JSON.stringify(daten);
  const inhalt = JSON.stringify({ fassung: ABLAGE_FASSUNG, etag: `"${sha256(serialisiert).slice(0, 32)}"`, typ: "json", metadata, daten });
  const tmp = `${datei}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  await schreibenFest(tmp, inhalt);
  try { await rename(tmp, datei); } catch (e) { await rm(tmp, { force: true }); throw e; }
}

const VERWALTER_DATEI = dateiname(`${VERWALTER_PRAEFIX}x`).slice(0, -"x.json".length);
const MARKE_DATEI = dateiname(`${MARKE_PRAEFIX}x`).slice(0, -"x.json".length);

/**
 * Alle Zugänge (konto:* und der alte Sammelblob „konten"), Verwalterschlüssel (verwalter:*) und Marken
 * „Erstanmeldung festgelegt" (erstleitung-marke:*, PR #281) eines Store-Verzeichnisses `centric`. Beschädigt: wirft.
 * @param {string} dir
 * @returns {Promise<{konten: Record<string, any>, verwalter: Record<string, any>,
 *   marken: Array<{raum: string, mandantId: string, personId: string}>, nachtrag?: string[]}>}
 */
async function kontenImOrdner(dir) {
  /** @type {Record<string, any>} */ const konten = {};
  /** @type {Record<string, any>} */ const verwalter = {};
  /** @type {Array<{raum: string, mandantId: string, personId: string}>} */ const marken = [];
  let namen = [];
  try { namen = await readdir(dir); }
  catch (e) { if (/** @type {any} */ (e).code === "ENOENT") return { konten, verwalter, marken }; throw e; }
  const sammel = namen.includes("konten.json") ? await umschlagDaten(path.join(dir, "konten.json")) : null;
  if (sammel && typeof sammel === "object") Object.assign(konten, sammel);
  for (const n of namen) {
    if (!n.endsWith(".json")) continue;
    if (n.startsWith(KONTO_PRAEFIX)) {
      const k = await umschlagDaten(path.join(dir, n));
      if (k) konten[decodeURIComponent(n.slice(KONTO_PRAEFIX.length, -5))] = k;
    } else if (n.startsWith(VERWALTER_DATEI)) {
      const e = await umschlagDaten(path.join(dir, n));
      if (e) verwalter[decodeURIComponent(n.slice(VERWALTER_DATEI.length, -5))] = e;
    } else if (n.startsWith(MARKE_DATEI)) {
      const z = markeZerlegen(decodeURIComponent(n.slice(0, -5)));
      const m = z ? await umschlagDaten(path.join(dir, n)) : null;
      if (z && m !== null && m !== undefined)
        marken.push({ ...z, personId: m && typeof m === "object" && typeof m.personId === "string" ? m.personId : "" });
    }
  }
  /* Nachtrag einer Raumlöschung bei nicht schreibbarem Buch (widerrufbuch.mjs, nachtragAufnehmen): Codes, die die
     Ablage schon gelöscht hat — vor dem Tausch ins Buch, sonst lebten sie mit einer älteren Sicherung wieder auf. */
  const nachtragDatei = dateiname(NACHTRAG_SCHLUESSEL);
  const nachtrag = namen.includes(nachtragDatei) ? nachtragSchluessel(await umschlagDaten(path.join(dir, nachtragDatei))) : [];
  return { konten, verwalter, marken, nachtrag };
}

/**
 * Hält ein lebender Prozess die Ablage (Prozesssperre .prozess, server/lib/prozesssperre.mjs)? Dann wird nichts
 * angefasst — auch mit --ohne-serverpruefung (Review E-M6, Befund 5: Werkzeug und Server haben keine gemeinsame
 * Sperre; das ersetzt sie für einen Server, dessen /gesund nicht erreichbar ist). Derselbe Rechner: lebt die PID, ist
 * sie belegt; ist sie tot, nicht (auch wenn die Datei frisch ist — ein hart beendeter Server). Ein anderer Rechner
 * (zweiter Container): belegt, solange der Puls frisch ist. Unlesbar: belegt.
 * @param {string} daten
 */
export async function ablageBelegt(daten) {
  const datei = path.join(daten, SPERRDATEI);
  let roh, st;
  try { [roh, st] = await Promise.all([readFile(datei, "utf8"), stat(datei)]); }
  catch (e) { if (/** @type {any} */ (e).code === "ENOENT") return false; return true; }
  let halter = null;
  try { halter = JSON.parse(roh); } catch { /* unten */ }
  const frisch = Date.now() - st.mtimeMs < VERALTET_MS;
  if (halter && halter.rechner === hostname() && Number.isInteger(halter.pid) && halter.pid > 0) {
    if (halter.pid === process.pid) return false;
    try { process.kill(halter.pid, 0); return true; }
    catch (e) { return /** @type {any} */ (e).code === "EPERM"; }
  }
  return frisch;
}

/**
 * Vor dem Tausch: Widerrufbuch prüfen, aus der laufenden Ablage einsammeln, in der Stufe sperren, Wiederherstellung
 * vermerken, Buch schreiben. Wirft bei jedem Zweifel (dann wird nichts getauscht).
 * @param {{zustandsVerz: string, stufe: string, ziel: string, manifest: any, jetzt: Date}} o
 */
export async function widerrufbuchVorbereiten({ zustandsVerz, stufe, ziel, manifest, jetzt }) {
  const buchVorher = await buchLesen(zustandsVerz);
  const ankerDatei = path.join(stufe, "centric", dateiname(ANKER_SCHLUESSEL));
  const anker = await umschlagDaten(ankerDatei).catch(() => { throw new SicherungsFehler("Der Anker des Widerrufbuchs in der Sicherung ist beschädigt. Nichts wurde angefasst.", 2); });
  if (!buchVorher && anker)
    throw new SicherungsFehler(`Das Widerrufbuch fehlt in ${zustandsVerz}, die Sicherung kennt aber eines. Ohne es lebten `
      + "widerrufene Zugangscodes wieder auf. Erst die Kopie des Widerrufbuchs zurücklegen (BEREITSTELLUNG.md §5.4) "
      + "oder bewusst `widerrufbuch-neu` aufrufen. Nichts wurde angefasst.", 2);
  if (buchVorher && anker && !buchVorher.ids.includes(anker.id))
    throw new SicherungsFehler("Die Sicherung gehört zu einem anderen Widerrufbuch (andere Umgebung?). Nichts wurde angefasst.", 2);
  const buch = buchVorher ? structuredClone(buchVorher) : buchNeu();
  /* Was die bisherige Ablage gesperrt oder abgeschlossen kennt (auch aus einem älteren Bild, das das Buch nicht schrieb). */
  const jetzigeAblage = await kontenImOrdner(path.join(ziel, "centric"));
  const eingesammelt = einsammeln(buch, jetzigeAblage.konten, jetzigeAblage);
  /* Was in der Sicherung selbst schon gesperrt ist, ebenso — und dann alles im Buch in der Stufe sperren. */
  const stufeAblage = await kontenImOrdner(path.join(stufe, "centric"));
  einsammeln(buch, stufeAblage.konten, stufeAblage);
  const offen = nachzuziehen(buch, stufeAblage.konten);
  const vOffen = verwalterNachzuziehen(buch, stufeAblage.verwalter);
  const mOffen = markenNachzuziehen(buch, stufeAblage.konten, stufeAblage.marken);
  await mkdir(path.join(stufe, "centric"), { recursive: true, mode: 0o700 });
  for (const h of offen)
    await umschlagSchreiben(path.join(stufe, "centric", dateiname(`konto:${h}`)), gesperrtesKonto(stufeAblage.konten[h], "wiederherstellung", jetzt.toISOString()));
  for (const h of vOffen)
    await umschlagSchreiben(path.join(stufe, "centric", dateiname(`${VERWALTER_PRAEFIX}${h}`)), gesperrtesKonto(stufeAblage.verwalter[h], "wiederherstellung", jetzt.toISOString()));
  /* Marken „Erstanmeldung festgelegt" (PR #281), die die ältere Sicherung noch nicht kannte: Ohne sie legte ein offener
     Erstanmeldecode eines schon eingerichteten Betriebs erneut eine erste Leitung an. Kein Code wird dafür gesperrt. */
  for (const m of mOffen) await umschlagSchreiben(path.join(stufe, "centric", dateiname(m.schluessel)), m.wert);
  if (!anker) await umschlagSchreiben(ankerDatei, { id: buch.id });
  buch.wiederherstellungen.push({ zeit: jetzt.toISOString(), sicherungErstellt: String(manifest.erstellt) });
  await buchSchreiben(zustandsVerz, buch);
  return { eintraege: Object.keys(buch.eintraege).length + Object.keys(buch.verwalter || {}).length, eingesammelt,
    nachgezogen: offen.length + vOffen.length, marken: mOffen.length };
}

/**
 * Bewusster Neuanfang des Widerrufbuchs, wenn es verloren ist (Server neu aufgesetzt, Zustandsverzeichnis weg, keine
 * Kopie). Nur bei stehendem Server und nur, wenn es KEIN Buch gibt. Eingesammelt wird, was die Ablage gesperrt kennt;
 * was nur im verlorenen Buch stand, ist damit nicht mehr geschützt (Restrisiko, BEREITSTELLUNG.md §5.4).
 * @param {{zustand: string, daten: string, serverUrl?: string, serverPruefen?: boolean}} o
 */
export async function widerrufbuchNeu({ zustand, daten, serverUrl, serverPruefen = true }) {
  const z = zustandOrtPruefen(zustand, path.resolve(daten));
  if (serverPruefen) {
    const url = serverUrl || `http://127.0.0.1:${process.env.PORT || 3000}/gesund`;
    if (await serverLaeuft(url)) throw new SicherungsFehler(`Unter ${url} antwortet ein Server. Erst stoppen. Nichts wurde angefasst.`);
  }
  let vorhanden = null;
  try { vorhanden = await buchLesen(z); } catch { vorhanden = "kaputt"; }
  if (vorhanden) throw new SicherungsFehler("Es gibt schon ein Widerrufbuch (oder ein beschädigtes) — es wird nie ersetzt. Beschädigt: die Kopie zurücklegen.", 2);
  const buch = buchNeu();
  const ankerAlt = await umschlagDaten(path.join(path.resolve(daten), "centric", dateiname(ANKER_SCHLUESSEL))).catch(() => null);
  if (ankerAlt && /^[0-9a-f]{32}$/.test(ankerAlt.id)) buch.ids.push(ankerAlt.id);
  if (await ablageBelegt(path.resolve(daten)))
    throw new SicherungsFehler("Die Ablage ist in Benutzung (Prozesssperre .prozess: ein Server läuft). Erst stoppen. Nichts wurde angefasst.");
  const a = await kontenImOrdner(path.join(path.resolve(daten), "centric"));
  const n = einsammeln(buch, a.konten, a);
  await buchSchreiben(z, buch);
  return { eintraege: n };
}

/**
 * @param {{sicherung: string, ziel: string, ersetzen?: boolean, serverUrl?: string,
 *          serverPruefen?: boolean, jetzt?: Date, meldung?: (s: string) => void, zustand?: (string|null)}} o
 *   `zustand`: Zustandsverzeichnis (CENTRIC_ZUSTAND) — dann wird die Schlüsselepoche vor dem Tausch erneuert.
 */
export async function wiederherstellen({ sicherung, ziel, ersetzen = false, serverUrl,
  serverPruefen = true, jetzt = new Date(), meldung = () => {}, zustand = null }) {
  sicherung = path.resolve(sicherung); ziel = path.resolve(ziel);
  const zustandsVerz = zustand ? zustandOrtPruefen(zustand, ziel) : null;

  const probe = await pruefen(sicherung);
  if (!probe.ok)
    throw new SicherungsFehler(`Die Sicherung ist nicht in Ordnung, nichts wurde angefasst:\n  ${probe.fehler.join("\n  ")}`);
  const manifest = probe.manifest;
  /* Nichts Flüchtiges zurückspielen, vor allem nicht die Schlüsselbindung: Sie ist das, woran der Server eine
     Wiederherstellung erkennt. */
  const fremd = manifest.dateien.map((/** @type {any} */ d) => d.pfad).filter((/** @type {string} */ p) => !gehoertInSicherung(p));
  if (fremd.length)
    throw new SicherungsFehler(`Die Sicherung enthält Dateien, die nie gesichert werden (${fremd.slice(0, 3).join(", ")}). Nichts wurde angefasst.`);

  if (manifest.pfefferPruefwert) {
    const jetztWert = pfefferPruefwert(process.env.CENTRIC_PFEFFER);
    if (jetztWert !== manifest.pfefferPruefwert)
      throw new SicherungsFehler(
        "CENTRIC_PFEFFER fehlt oder ist ein anderer als bei der Sicherung. Ohne den alten Pfeffer "
        + "findet kein Konto und kein Zugangscode zu seinem Datensatz. Nichts wurde angefasst.");
  } else {
    meldung("Warnung: Die Sicherung enthält keinen Pfeffer-Prüfwert — Pfeffer bitte selbst gegenprüfen.");
  }

  if (serverPruefen) {
    const url = serverUrl || `http://127.0.0.1:${process.env.PORT || 3000}/gesund`;
    if (await serverLaeuft(url))
      throw new SicherungsFehler(`Unter ${url} antwortet ein Server. Erst stoppen, dann wiederherstellen. Nichts wurde angefasst.`);
  }
  /* Auch ohne Serverprüfung über HTTP: Hält ein lebender Prozess die Ziel-Ablage (.prozess), wird nichts angefasst. */
  if (await ablageBelegt(ziel))
    throw new SicherungsFehler("Die Ziel-Ablage ist in Benutzung (Prozesssperre .prozess: ein Server läuft). Erst stoppen, dann wiederherstellen. Nichts wurde angefasst.");

  await mkdir(ziel, { recursive: true, mode: 0o700 });
  const vorhanden = (await readdir(ziel)).filter((n) => !n.startsWith("."));
  if (vorhanden.length && !ersetzen)
    throw new SicherungsFehler(`Das Ziel ${ziel} ist nicht leer (${vorhanden.join(", ")}). Mit --ersetzen wird der Inhalt beiseitegelegt, nicht gelöscht.`);
  /* Frühere Wiederherstellungen dieses Ziels — ein unlesbarer Vermerk
     bricht ab, bevor etwas angefasst ist (fail-closed). */
  const fruehere = await wiederherstellVermerkeLesen(ziel);

  /* Eindeutige Namen für Stufe und Beiseite-Ordner: Zeit plus Zufall. Vorher nur die Sekunde — zwei Wiederherstellungen
     derselben Wurzel in derselben Sekunde benannten in einen schon gefüllten Beiseite-Ordner um (Linux: ENOTEMPTY,
     halb verschoben). Angelegt wird ohne `recursive`: Gibt es den Namen schon, bricht es ab, statt etwas zu überschreiben. */
  const kennung = `${stempel(jetzt)}-${randomBytes(4).toString("hex")}`;

  // 1. neben dem Ziel aufbauen und nachprüfen — noch ist nichts angefasst
  const stufe = path.join(ziel, `.wiederherstellung-${kennung}`);
  await mkdir(stufe, { mode: 0o700 });
  try {
    for (const s of Object.keys(manifest.stores))
      await mkdir(path.join(stufe, s), { recursive: true, mode: 0o700 });
    for (const d of manifest.dateien) {
      const inhalt = await readFile(path.join(sicherung, "daten", d.pfad));
      if (sha256(inhalt) !== d.sha256) throw new SicherungsFehler(`Prüfsumme änderte sich beim Lesen: ${d.pfad}`);
      await schreibenFest(path.join(stufe, d.pfad), inhalt);
    }
    for (const d of manifest.dateien) {
      const echt = await readFile(path.join(stufe, d.pfad));
      if (sha256(echt) !== d.sha256) throw new SicherungsFehler(`Geschriebene Datei stimmt nicht: ${d.pfad}`);
    }
  } catch (e) {
    await rm(stufe, { recursive: true, force: true });
    throw e;
  }

  /* 1b. Schlüsselepoche erneuern, BEVOR die alten Daten an ihren Platz kommen: Misslingt das, bleibt alles, wie es war.
     Ohne Zustandsverzeichnis erkennt der Server die Wiederherstellung selbst (skbindung fehlt in jeder Sicherung). */
  if (zustandsVerz) {
    try { await epocheDateiErneuern(zustandsVerz, "wiederherstellung"); }
    catch (e) {
      await rm(stufe, { recursive: true, force: true });
      throw new SicherungsFehler(`Schlüsselepoche nicht erneuert (${/** @type {Error} */ (e).message}). Nichts wurde angefasst.`);
    }
    meldung("Schlüsselepoche erneuert: Kein früherer Sicherungsschlüssel gilt mehr.");
  } else {
    meldung("Hinweis: Kein Zustandsverzeichnis angegeben. Der Server beginnt beim ersten Gebrauch eines Schlüssels eine neue Epoche.");
  }

  /* 1c. E-M6: Widerrufbuch (server/lib/widerrufbuch.mjs), nach der Epoche (deren Erneuerung bleibt bei einem Abbruch:
     sichere Richtung). Was die LAUFENDE Ablage gesperrt kennt, kommt ins Buch; alles,
     was im Buch steht, wird in der zurückzuspielenden Kopie gesperrt — so belebt auch ein älteres Bild, das das Buch
     nicht kennt, keinen widerrufenen oder ersetzten Code. Jeder Zweifel bricht ab, bevor etwas angefasst ist. */
  if (zustandsVerz) {
    try {
      const w = await widerrufbuchVorbereiten({ zustandsVerz, stufe, ziel, manifest, jetzt });
      meldung(`Widerrufbuch: ${w.eintraege} widerrufene Zugänge, ${w.eingesammelt} aus der bisherigen Ablage übernommen, `
        + `${w.nachgezogen} in der Sicherung gesperrt, ${w.marken} Marken der Ersteinrichtung wiederhergestellt.`);
    } catch (e) {
      await rm(stufe, { recursive: true, force: true });
      throw e instanceof SicherungsFehler ? e
        : new SicherungsFehler(`Widerrufbuch: ${/** @type {Error} */ (e).message} Nichts wurde angefasst.`, 2);
    }
  } else {
    meldung("Hinweis: Kein Zustandsverzeichnis angegeben. Widerrufene Zugangscodes sperrt erst der Server dieser Fassung "
      + "beim Start nach — vor einem Rücksprung auf ein älteres Bild mit --zustand wiederherstellen (BEREITSTELLUNG.md §5.4).");
  }

  // 2. alten Inhalt beiseite, neuen an seinen Platz — Umbenennen, nichts löschen
  let beiseite = null;
  /** @type {string[]} */ const verschoben = [];
  /** @type {string[]} */ const eingesetzt = [];
  try {
    if (vorhanden.length) {
      beiseite = path.join(ziel, `.vor-wiederherstellung-${kennung}`);
      await mkdir(beiseite, { mode: 0o700 });                        // neu und leer, nie ein vorhandener
      for (const n of vorhanden) { await rename(path.join(ziel, n), path.join(beiseite, n)); verschoben.push(n); }
    }
    for (const s of Object.keys(manifest.stores)) { await rename(path.join(stufe, s), path.join(ziel, s)); eingesetzt.push(s); }
  } catch (e) {
    /* Zurückrollen: Die Ablage soll aussehen wie vorher. (Eine schon erneuerte Schlüsselepoche bleibt — sichere Richtung.) */
    const rest = [];
    for (const s of eingesetzt.reverse()) await rename(path.join(ziel, s), path.join(stufe, s)).catch(() => rest.push(s));
    for (const n of verschoben.reverse())
      await rename(path.join(/** @type {string} */ (beiseite), n), path.join(ziel, n)).catch(() => rest.push(n));
    await rm(stufe, { recursive: true, force: true }).catch(() => {});
    if (beiseite && !rest.length) await rm(beiseite, { recursive: true, force: true }).catch(() => {});
    throw new SicherungsFehler(rest.length
      ? `Tausch misslungen (${/** @type {Error} */ (e).message}); NICHT vollständig zurückgerollt: ${rest.join(", ")} — von Hand prüfen (${beiseite}).`
      : `Tausch misslungen (${/** @type {Error} */ (e).message}); zurückgerollt, die Ablage ist unverändert.`);
  }
  await rm(stufe, { recursive: true, force: true });
  /* Vermerk der Wiederherstellung (WP-45b): Ab hier zählen die Standnummern
     ab dem Stand dieser Sicherung neu. Sicherungen, die NACH dieser, aber VOR
     der Wiederherstellung entstanden, gehören zu der verworfenen Folge —
     gleiche Nummer, anderer Inhalt. werkzeug/ablage-pruefen.mjs lehnt sie
     deshalb ab. Punktdatei: nicht in der Sicherung, für die Ablage unsichtbar. */
  /* Fortgeschrieben, nicht überschrieben: Jede frühere Wiederherstellung
     hat ihre eigene verworfene Folge (WP-45d, W1). */
  const vermerk = path.join(ziel, WIEDERHERSTELL_VERMERK);
  const vermerkTmp = `${vermerk}.${process.pid}.tmp`;
  await rm(vermerkTmp, { force: true });
  await schreibenFest(vermerkTmp, JSON.stringify({ wiederherstellungen: [...fruehere,
    { zeit: jetzt.toISOString(), sicherungErstellt: manifest.erstellt }] }));
  await rename(vermerkTmp, vermerk);
  await ordnerFest(ziel);

  if (typeof process.getuid === "function" && process.getuid() === 0)
    meldung("Hinweis: als root wiederhergestellt. Der Container läuft als uid 1000 — `chown -R 1000:1000` auf das Ziel nicht vergessen.");
  return { ziel, beiseite, dateien: manifest.dateien.length, stores: Object.keys(manifest.stores) };
}

/* ---------------------------------------------------------------------------
   Kommandozeile
   --------------------------------------------------------------------------- */

function argumente(/** @type {string[]} */ a) {
  /** @type {Record<string, string|true>} */ const o = {};
  for (let i = 0; i < a.length; i++) {
    if (!a[i].startsWith("--")) throw new SicherungsFehler(`Unerwartetes Argument: ${a[i]}`, 2);
    const k = a[i].slice(2);
    if (["ersetzen", "ohne-serverpruefung"].includes(k)) o[k] = true;
    else if (i + 1 < a.length && !a[i + 1].startsWith("--")) o[k] = a[++i];
    else throw new SicherungsFehler(`--${k} braucht einen Wert`, 2);
  }
  return o;
}

const HILFE = `Aufruf:
  ablage-sicherung.mjs sichern          [--quelle /data] --ziel <Ordner> [--ruhe <ms, Vorgabe 1000>]
                                        [--schreibhalt <Zustandsverzeichnis>/schreibhalt]
  ablage-sicherung.mjs pruefen          --sicherung <Ordner>
  ablage-sicherung.mjs wiederherstellen --sicherung <Ordner> [--ziel /data] [--ersetzen]
                                        [--server-url <URL>] [--ohne-serverpruefung] [--zustand <Ordner>]
  ablage-sicherung.mjs schluessel-erneuern --zustand <Ordner> [--daten /data] [--server-url <URL>] [--ohne-serverpruefung]
  ablage-sicherung.mjs widerrufbuch-neu --zustand <Ordner> [--daten /data] [--server-url <URL>] [--ohne-serverpruefung]`;

export async function main(/** @type {string[]} */ argv) {
  const [befehl, ...rest] = argv;
  const say = (/** @type {string} */ s) => console.error(s);
  try {
    const o = argumente(rest);
    if (befehl === "sichern") {
      if (!o.ziel) throw new SicherungsFehler(HILFE, 2);
      // Nur reine Dezimalzahlen: Number("") ist 0 und würde die Bestätigung still abschalten (z. B. --ruhe "$LEER").
      const ruhe = o.ruhe === undefined ? 1000 : (/^\d{1,6}$/.test(String(o.ruhe)) ? Number(o.ruhe) : NaN);
      if (!Number.isInteger(ruhe) || ruhe > 600000)
        throw new SicherungsFehler("--ruhe: ganze Zahl in Millisekunden, 0 bis 600000", 2);
      const r = await sichern({ quelle: String(o.quelle || process.env.CENTRIC_DATEN || "/data"),
        ziel: String(o.ziel), ruhe, meldung: say,
        schreibhalt: typeof o.schreibhalt === "string" ? o.schreibhalt : null });
      const m = r.manifest;
      say(m.konsistenz === "schreibhalt" ? "Konsistenz: unter Schreib-Halt des Servers abgeschlossen."
        : "Konsistenz: ohne Schreib-Halt (Ruhezeit).");
      console.log(`Sicherung vollständig: ${r.pfad}`);
      console.log(`  ${m.summe.dateien} Dateien, ${m.summe.bytes} Bytes`);
      for (const [s, v] of Object.entries(m.stores))
        console.log(`  ${s} (${v.klasse}): ${v.dateien} Dateien`);
      for (const [s, g] of Object.entries(m.ausgelassen))
        for (const [grund, n] of Object.entries(g)) console.log(`  bewusst ausgelassen: ${s} — ${grund}: ${n}`);
      console.log("Nächster Schritt: Kopie außerhalb des Servers ablegen und mit `pruefen` dort gegenprüfen.");
      return 0;
    }
    if (befehl === "pruefen") {
      if (!o.sicherung) throw new SicherungsFehler(HILFE, 2);
      const r = await pruefen(String(o.sicherung));
      if (!r.ok) { say(`UNGÜLTIG:\n  ${r.fehler.join("\n  ")}`); return 1; }
      console.log(`In Ordnung: ${r.manifest.summe.dateien} Dateien, erstellt ${r.manifest.erstellt}`);
      return 0;
    }
    if (befehl === "wiederherstellen") {
      if (!o.sicherung) throw new SicherungsFehler(HILFE, 2);
      const r = await wiederherstellen({ sicherung: String(o.sicherung),
        ziel: String(o.ziel || process.env.CENTRIC_DATEN || "/data"), ersetzen: !!o.ersetzen,
        serverUrl: typeof o["server-url"] === "string" ? o["server-url"] : undefined,
        serverPruefen: !o["ohne-serverpruefung"], meldung: say,
        zustand: typeof o.zustand === "string" ? o.zustand : (process.env.CENTRIC_ZUSTAND || null) });
      console.log(`Wiederhergestellt: ${r.dateien} Dateien nach ${r.ziel}`);
      console.log("Sicherungsschlüssel: Alle früheren sind ungültig. Eine Leitung legt in der App neue an; Automatisierungen danach kontrolliert umstellen.");
      if (r.beiseite) console.log(`Alter Inhalt liegt in ${r.beiseite} — nach erfolgreichem Start prüfen und dann von Hand entfernen.`);
      console.log("Server jetzt starten und die Anmeldung ausprobieren.");
      return 0;
    }
    if (befehl === "schluessel-erneuern") {
      const zustand = typeof o.zustand === "string" ? o.zustand : process.env.CENTRIC_ZUSTAND;
      if (!zustand) throw new SicherungsFehler(HILFE, 2);
      await schluesselErneuern({ zustand, daten: typeof o.daten === "string" ? o.daten : undefined,
        serverUrl: typeof o["server-url"] === "string" ? o["server-url"] : undefined, serverPruefen: !o["ohne-serverpruefung"] });
      console.log("Schlüsselepoche erneuert: Kein früherer Sicherungsschlüssel gilt mehr. Eine Leitung legt in der App neue an.");
      return 0;
    }
    if (befehl === "widerrufbuch-neu") {
      const zustand = typeof o.zustand === "string" ? o.zustand : process.env.CENTRIC_ZUSTAND;
      if (!zustand) throw new SicherungsFehler(HILFE, 2);
      const r = await widerrufbuchNeu({ zustand, daten: String(o.daten || process.env.CENTRIC_DATEN || "/data"),
        serverUrl: typeof o["server-url"] === "string" ? o["server-url"] : undefined, serverPruefen: !o["ohne-serverpruefung"] });
      console.log(`Widerrufbuch neu angelegt: ${r.eintraege} gesperrte Zugänge aus der Ablage übernommen. Was nur im verlorenen Buch stand, ist nicht mehr geschützt.`);
      return 0;
    }
    throw new SicherungsFehler(HILFE, 2);
  } catch (e) {
    if (e instanceof SicherungsFehler) { say(`FEHLER: ${e.message}`); return e.code; }
    say(`FEHLER: ${e && /** @type {Error} */ (e).stack || e}`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
  && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  process.exitCode = await main(process.argv.slice(2));
}
