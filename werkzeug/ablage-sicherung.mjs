#!/usr/bin/env node
/* ==========================================================================
   ABLAGE-SICHERUNG — Sichern, Prüfen, Wiederherstellen der ganzen Ablage

   Die Anwendung hält alles unter CENTRIC_DATEN (Vorgabe /data) als Dateien:
   ein Verzeichnis je Store, darin eine Datei je Schlüssel (server/lib/
   ablage.mjs). Dieses Werkzeug sichert diesen Baum — und zwar nur, was nach
   einer Wiederherstellung gebraucht wird.

     node werkzeug/ablage-sicherung.mjs sichern --quelle /data --ziel /sicherungen
     node werkzeug/ablage-sicherung.mjs pruefen --sicherung /sicherungen/centric-sicherung-…
     node werkzeug/ablage-sicherung.mjs wiederherstellen --sicherung … --ziel /data [--ersetzen]

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
   Kopieren noch einmal angesehen; hat sich in dieser Zeit eine gesicherte
   Datei geändert oder ist eine dazugekommen, wird verworfen und neu
   begonnen (dreimal), danach mit Fehler abgebrochen. Wer sicher gehen will,
   stoppt den Server vorher — dann gibt es nie einen zweiten Anlauf.

   Wiederherstellen: Der Server muss stehen (es wird versucht, /gesund zu
   erreichen; antwortet es, wird abgelehnt). Ein nicht leeres Ziel wird nur
   mit --ersetzen angefasst, und auch dann nichts gelöscht: Der alte Inhalt
   wandert nach `.vor-wiederherstellung-<UTC>/` im Ziel.
   ========================================================================== */

import { createHash } from "node:crypto";
import { mkdir, open, readdir, readFile, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** Dieselbe Fassung wie server/lib/ablage.mjs (FASSUNG). */
const ABLAGE_FASSUNG = 1;
const FORMAT = 1;

/**
 * Einordnung jedes Stores. `nur`: nur diese Schlüsselpräfixe werden
 * gesichert. `ohne`: diese Schlüsselpräfixe werden weggelassen.
 * Ohne Angabe wird der Store ganz gesichert; `klasse: "C"` heißt: gar nicht.
 */
export const STORES = {
  "centric":                  { klasse: "A", ohne: ["token:", "tokencode:"] },
  "centric-sitzungen":        { klasse: "B", nur: ["sk:"] },
  "centric-spur":             { klasse: "B" },
  "centric-accountsitzungen": { klasse: "C" },
  "centric-takt":             { klasse: "C" },
};

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
function umschlagPruefen(datei, inhalt) {
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
 * Listet, was in die Sicherung gehört, und was bewusst fehlt.
 * @param {string} quelle
 */
async function quelleAnsehen(quelle) {
  let eintraege;
  try { eintraege = await readdir(quelle, { withFileTypes: true }); }
  catch (e) { throw new SicherungsFehler(`Quelle ${quelle} nicht lesbar: ${/** @type {any} */ (e).message}`); }

  /** @type {{store: string, name: string, pfad: string, bytes: number, mtimeMs: number}[]} */
  const dateien = [];
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
    for (const d of await readdir(dir, { withFileTypes: true })) {
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
      const st = await stat(path.join(dir, d.name));
      dateien.push({ store: e.name, name: d.name, pfad: path.join(dir, d.name),
        bytes: st.size, mtimeMs: st.mtimeMs });
      stores[e.name].dateien += 1;
      stores[e.name].bytes += st.size;
    }
  }
  dateien.sort((a, b) => (a.store + "/" + a.name).localeCompare(b.store + "/" + b.name));
  return { dateien, stores, ausgelassen };
}

const fingerabdruck = (/** @type {{store:string,name:string,bytes:number,mtimeMs:number}[]} */ l) =>
  l.map((d) => `${d.store}/${d.name}|${d.bytes}|${d.mtimeMs}`).join("\n");

/* ---------------------------------------------------------------------------
   Sichern
   --------------------------------------------------------------------------- */

/**
 * @param {{quelle: string, ziel: string, jetzt?: Date, versuche?: number,
 *          pause?: number, meldung?: (s: string) => void}} o
 * @returns {Promise<{pfad: string, manifest: any}>}
 */
export async function sichern({ quelle, ziel, jetzt = new Date(), versuche = 3, pause = 1000,
  meldung = () => {} }) {
  quelle = path.resolve(quelle); ziel = path.resolve(ziel);
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
  for (let versuch = 1; versuch <= versuche; versuch++) {
    await rm(werkstatt, { recursive: true, force: true });
    const vorher = await quelleAnsehen(quelle);
    await mkdir(path.join(werkstatt, "daten"), { recursive: true, mode: 0o700 });
    for (const s of Object.keys(vorher.stores))
      await mkdir(path.join(werkstatt, "daten", s), { recursive: true, mode: 0o700 });

    const liste = [];
    let verschwunden = false;
    for (const d of vorher.dateien) {
      let inhalt;
      try { inhalt = await readFile(d.pfad); }
      catch (e) {
        if (/** @type {any} */ (e).code === "ENOENT") { verschwunden = true; break; }
        throw e;
      }
      if (inhalt.length !== d.bytes) { verschwunden = true; break; }   // zwischen Listen und Lesen geändert
      umschlagPruefen(`${d.store}/${d.name}`, inhalt);
      await schreibenFest(path.join(werkstatt, "daten", d.store, d.name), inhalt);
      liste.push({ pfad: `${d.store}/${d.name}`, bytes: inhalt.length, sha256: sha256(inhalt) });
    }
    const nachher = verschwunden ? null : await quelleAnsehen(quelle);
    if (verschwunden || !nachher || fingerabdruck(nachher.dateien) !== fingerabdruck(vorher.dateien)) {
      letzterGrund = "Die Ablage hat sich während der Sicherung verändert.";
      meldung(`Versuch ${versuch}/${versuche}: ${letzterGrund}`);
      await rm(werkstatt, { recursive: true, force: true });
      if (versuch < versuche) await new Promise((r) => setTimeout(r, pause));
      continue;
    }

    const summe = { dateien: liste.length, bytes: liste.reduce((a, d) => a + d.bytes, 0) };
    const manifest = {
      format: FORMAT, werkzeug: "ablage-sicherung", erstellt: jetzt.toISOString(),
      pfefferPruefwert: pruefwert, stores: vorher.stores, ausgelassen: vorher.ausgelassen,
      summe, dateien: liste,
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

/**
 * @param {{sicherung: string, ziel: string, ersetzen?: boolean, serverUrl?: string,
 *          serverPruefen?: boolean, jetzt?: Date, meldung?: (s: string) => void}} o
 */
export async function wiederherstellen({ sicherung, ziel, ersetzen = false, serverUrl,
  serverPruefen = true, jetzt = new Date(), meldung = () => {} }) {
  sicherung = path.resolve(sicherung); ziel = path.resolve(ziel);

  const probe = await pruefen(sicherung);
  if (!probe.ok)
    throw new SicherungsFehler(`Die Sicherung ist nicht in Ordnung, nichts wurde angefasst:\n  ${probe.fehler.join("\n  ")}`);
  const manifest = probe.manifest;

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

  await mkdir(ziel, { recursive: true, mode: 0o700 });
  const vorhanden = (await readdir(ziel)).filter((n) => !n.startsWith("."));
  if (vorhanden.length && !ersetzen)
    throw new SicherungsFehler(`Das Ziel ${ziel} ist nicht leer (${vorhanden.join(", ")}). Mit --ersetzen wird der Inhalt beiseitegelegt, nicht gelöscht.`);

  // 1. neben dem Ziel aufbauen und nachprüfen — noch ist nichts angefasst
  const stufe = path.join(ziel, `.wiederherstellung-${stempel(jetzt)}`);
  await rm(stufe, { recursive: true, force: true });
  await mkdir(stufe, { recursive: true, mode: 0o700 });
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

  // 2. alten Inhalt beiseite, neuen an seinen Platz — Umbenennen, nichts löschen
  let beiseite = null;
  if (vorhanden.length) {
    beiseite = path.join(ziel, `.vor-wiederherstellung-${stempel(jetzt)}`);
    await mkdir(beiseite, { recursive: true, mode: 0o700 });
    for (const n of vorhanden) await rename(path.join(ziel, n), path.join(beiseite, n));
  }
  for (const s of Object.keys(manifest.stores)) await rename(path.join(stufe, s), path.join(ziel, s));
  await rm(stufe, { recursive: true, force: true });
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
  ablage-sicherung.mjs sichern          [--quelle /data] --ziel <Ordner>
  ablage-sicherung.mjs pruefen          --sicherung <Ordner>
  ablage-sicherung.mjs wiederherstellen --sicherung <Ordner> [--ziel /data] [--ersetzen]
                                        [--server-url <URL>] [--ohne-serverpruefung]`;

export async function main(/** @type {string[]} */ argv) {
  const [befehl, ...rest] = argv;
  const say = (/** @type {string} */ s) => console.error(s);
  try {
    const o = argumente(rest);
    if (befehl === "sichern") {
      if (!o.ziel) throw new SicherungsFehler(HILFE, 2);
      const r = await sichern({ quelle: String(o.quelle || process.env.CENTRIC_DATEN || "/data"),
        ziel: String(o.ziel), meldung: say });
      const m = r.manifest;
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
        serverPruefen: !o["ohne-serverpruefung"], meldung: say });
      console.log(`Wiederhergestellt: ${r.dateien} Dateien nach ${r.ziel}`);
      if (r.beiseite) console.log(`Alter Inhalt liegt in ${r.beiseite} — nach erfolgreichem Start prüfen und dann von Hand entfernen.`);
      console.log("Server jetzt starten und die Anmeldung ausprobieren.");
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
