/* ==========================================================================
   SCHREIBHALT — kurzer, befristeter Halt neuer Schreibvorgänge für eine
   konsistente Sicherung unter Last (WP-28c, Folge zu WP-28b/2)

   Die Ablage-Sicherung (werkzeug/ablage-sicherung.mjs) kopiert Dateien,
   während der Server schreibt. Ohne Hilfe des Servers kann sie nur
   feststellen, dass sich nichts verändert hat — unter Dauerlast gelingt das
   nie, und ein Schnitt kann mitten in einer Transaktion über zwei Dateien
   liegen (Konto, dann Mitgliedschaft). Hier hilft der Server:

     1. Neue Vorgänge beginnen nicht, laufende laufen zu Ende (Drain).
        Ein Vorgang ist alles, was an einem der Eintritte beginnt:
        unterRaumsperre (raumsperre.mjs), die Reihen je Schlüssel in
        accounts/token/provisionierung/registrierung/zweifaktor/
        schluesselepoche — und jeder einzelne Schreibvorgang der Ablage
        (ablage.mjs), der nicht schon zu einem Vorgang gehört.
     2. Ist nichts mehr in Arbeit, gilt der Halt als bestätigt. Jetzt
        steht alles still, was in die Sicherung gehört, und kein Vorgang
        ist halb fertig.
     3. Die Sicherung kopiert die wenigen geänderten Dateien nach, prüft
        und gibt frei. Wartende Schreiber laufen danach in ihrer Reihenfolge
        weiter — sie bekommen keinen Fehler, sie warten nur.

   Befristet, immer. Ein Halt endet spätestens nach seiner Frist
   (höchstens CENTRIC_SCHREIBHALT_MAX_MS, Vorgabe 3000 ms, harte Obergrenze
   10 000 ms — unter der Zeitgrenze der Raumsperre von 15 s). Danach läuft
   der Server normal weiter; die Sicherung erfährt, dass der Halt abgelaufen
   ist, und meldet ehrlich Misserfolg für diesen Durchgang. Kein Zustand
   auf der Platte überlebt einen Neustart (der Kanal räumt beim Start auf).
   Nach einem Halt folgt eine Pause mindestens seiner Dauer: höchstens die
   Hälfte der Zeit kann gehalten sein, auch bei einem fehlerhaften Skript.

   Wiedereintritt. Ein Vorgang, der während des Halts weiterschreibt oder
   einen weiteren Eintritt betritt, gehört schon dazu und wartet nie auf
   sich selbst (AsyncLocalStorage, Muster wie raumsperre.mjs). Die Marke
   erlischt mit dem Ende des Vorgangs: Ein Hintergrundvorgang, der später
   schreibt, wird wieder gewöhnlich gezählt.

   Kein Verklemmen. Gehalten wird VOR dem Eintritt in eine Reihe, nie
   darin: Wer in einer Reihe steht oder eine Sperre hält, ist schon
   zugelassen und läuft durch. Was trotzdem nicht fertig wird (eine
   hängende Arbeit), verhindert nur die Bestätigung — die Frist löst den
   Halt in jedem Fall.

   Nie gehalten: Lesen, Sitzungen, Bremszähler, Einmal-Token-Einträge,
   skbindung — alles, was nie in eine Sicherung kommt (wirdGesichert,
   gleiche Einordnung wie STORES in werkzeug/ablage-sicherung.mjs; ein Test
   hält beide gleich). Kurz verzögert (nie abgewiesen): was gesicherte Daten
   schreibt oder eine Reihe betritt — auch Token-Einlösung, Zwei-Faktor
   (auch beim Betreiber-Login) und Protokolleinträge. /gesund, der
   Prozesspuls und die Raumsperre sind unberührt; der Halt ist kein
   Schreibstopp.

   Kanal zur Sicherung: zwei kleine Dateien im Unterordner `schreibhalt`
   des Zustandsverzeichnisses (CENTRIC_ZUSTAND, außerhalb der Ablage, wie
   schluesselepoche.mjs). Kein Netz, kein HTTP-Endpunkt: Wer dort schreiben
   kann, ist Betreiber des Hosts (uid des Dienstes oder root). Mandanten und
   Fremde erreichen ihn nicht; ein Halt kostet höchstens die Frist.

     anfrage.json  vom Werkzeug  { fassung: 1, token, fristMs, erstellt }
                   Löschen = Freigabe.
     antwort.json  vom Server    { fassung: 1, token, stand, … }
                   stand: gehalten | freigegeben | abgelaufen | abgelehnt
                   grund bei „freigegeben“: geloescht (nur das zählt als Erfolg)
                   ersetzt (die Anfrage wurde während des Halts überschrieben)
                   oder unsicher (sie war zwischendurch nicht lesbar) — dann
                   ist nichts bewiesen

   Freigegeben wird NUR, wenn die Anfrage nachweislich gelöscht ist (ENOENT).
   Ein Lesefehler (EIO, EMFILE …) oder eine fremde Anfrage beendet den Halt
   nicht — er läuft dann bis zur Frist und gilt als nicht bewiesen.
   Drain-Grenze: Ist nach einem Viertel der Frist noch etwas in Arbeit, endet
   der Halt sofort (unbestätigt), statt die volle Frist zu halten.
   ========================================================================== */

import { AsyncLocalStorage } from "node:async_hooks";
import { lstat, mkdir, open, readdir, rename, rm } from "node:fs/promises";
import { constants as FS } from "node:fs";
import { randomBytes } from "node:crypto";
import { performance } from "node:perf_hooks";
import path from "node:path";

/** Harte Obergrenze jeder Frist. Deutlich unter der Raumsperren-Zeitgrenze (15 s). */
export const HALT_HART_MS = 10_000;
/** Vorgabe für CENTRIC_SCHREIBHALT_MAX_MS. */
export const HALT_VORGABE_MS = 3_000;
/** Unterordner des Zustandsverzeichnisses. */
export const HALT_ORDNER = "schreibhalt";
export const ANFRAGE = "anfrage.json";
export const ANTWORT = "antwort.json";
/** So alt darf eine Anfrage höchstens sein (Uhrzeit des Hosts): Reste eines früheren Laufs gelten nicht. */
export const ANFRAGE_FRISCH_MS = 30_000;
const TOKEN = /^[0-9a-f]{32}$/;
const GROESSE_MAX = 1024;

const jetzt = () => performance.now();

/**
 * Die größte erlaubte Frist aus CENTRIC_SCHREIBHALT_MAX_MS. 0 schaltet den Kanal ab.
 * Unlesbare Werte: Vorgabe (der Halt bleibt befristet, nie offen).
 */
export function haltObergrenze() {
  const roh = (process.env.CENTRIC_SCHREIBHALT_MAX_MS ?? "").trim();
  if (roh === "") return HALT_VORGABE_MS;
  if (!/^\d{1,6}$/.test(roh)) return HALT_VORGABE_MS;
  return Math.min(Number(roh), HALT_HART_MS);
}

/* ---------------------------------------------------------------------------
   Was in eine Sicherung kommt — dieselbe Einordnung wie STORES
   (werkzeug/ablage-sicherung.mjs). Nur das wird gehalten.
   Unbekannte Stores: gehalten (die sichere Richtung für die Konsistenz).
   --------------------------------------------------------------------------- */
const OHNE = { "centric": ["token:", "tokencode:", "zweifaktor-nachweis:"] };
const NUR = { "centric-sitzungen": ["sk:", "skw:", "skraum:"] };
const FLUECHTIG = new Set(["centric-accountsitzungen", "centric-takt"]);

/** @param {string} store @param {string} schluessel */
export function wirdGesichert(store, schluessel) {
  if (FLUECHTIG.has(store)) return false;
  const k = String(schluessel);
  const nur = /** @type {Record<string, string[]>} */ (NUR)[store];
  if (nur) return nur.some((p) => k.startsWith(p));
  const ohne = /** @type {Record<string, string[]>} */ (OHNE)[store];
  return !(ohne && ohne.some((p) => k.startsWith(p)));
}

/* ---------------------------------------------------------------------------
   Vorgänge zählen, Halt
   --------------------------------------------------------------------------- */

/** Marke des laufenden Vorgangs: { aktiv } */
const zugelassen = new AsyncLocalStorage();
/** Laufende (zugelassene, noch nicht fertige) Vorgänge. */
let laufend = 0;
/** Der aktuelle Halt oder null. */
let halt = /** @type {null | Halt} */ (null);
/** Wer auf das Ende des Halts wartet, in Reihenfolge. */
let wartende = /** @type {Array<() => void>} */ ([]);
/** Vor diesem Zeitpunkt (Monotonzeit) beginnt kein neuer Halt. */
let pauseBis = 0;

/**
 * @typedef {{ token: string, fristMs: number, beginn: number, bestaetigt: boolean,
 *   ende: (null|"freigegeben"|"abgelaufen"), dauerMs: number, bereit: Promise<boolean>,
 *   _bestaetigen: (ok: boolean) => void, _uhr: any, _beiEnde: ((h: Halt) => void)|null }} Halt
 */

/** Gehört der laufende Ablauf zu einem zugelassenen Vorgang? */
export function imVorgang() {
  const m = zugelassen.getStore();
  return !!(m && m.aktiv);
}

/** @template T @param {() => Promise<T>|T} arbeit @returns {Promise<T>} */
function aufrufen(arbeit) {
  try { return Promise.resolve(arbeit()); } catch (e) { return Promise.reject(e); }
}

/** @template T @param {() => Promise<T>|T} arbeit @returns {Promise<T>} */
function zulassen(arbeit) {
  laufend += 1;
  const marke = { aktiv: true };
  const lauf = zugelassen.run(marke, () => aufrufen(arbeit));
  const fertig = () => {
    marke.aktiv = false;
    laufend -= 1;
    if (laufend === 0 && halt && !halt.bestaetigt) bestaetigen(halt);
  };
  lauf.then(fertig, fertig);
  return lauf;
}

/**
 * Führt `arbeit` als Vorgang aus. Kein Halt: sofort (synchron begonnen, die Reihenfolge der Aufrufer bleibt).
 * Halt: erst nach seinem Ende. Schon in einem Vorgang: sofort, ohne neu zu zählen.
 * @template T
 * @param {() => Promise<T>|T} arbeit
 * @returns {Promise<T>}
 */
export function vorgang(arbeit) {
  if (imVorgang()) return aufrufen(arbeit);
  if (!halt) return zulassen(arbeit);
  /* `.then` übernimmt den Ablaufkontext des Aufrufers (z. B. eine gehaltene Raumsperre ist es nicht — die wäre
     zugelassen —, aber ein anderer AsyncLocalStorage-Kontext bleibt erhalten). */
  return new Promise((r) => { wartende.push(() => r(undefined)); }).then(() => vorgang(arbeit));
}

/**
 * Ein einzelner Schreibvorgang der Ablage: gehalten nur, wenn er in die Sicherung gehört.
 * @template T @param {string} store @param {string} schluessel @param {() => Promise<T>} arbeit @returns {Promise<T>}
 */
export function schreibvorgang(store, schluessel, arbeit) {
  if (!wirdGesichert(store, schluessel)) return arbeit();
  return vorgang(arbeit);
}

/** @param {Halt} h */
function bestaetigen(h) {
  if (h.bestaetigt || halt !== h) return;
  h.bestaetigt = true;
  h._bestaetigen(true);
}

/** @param {Halt} h @param {"freigegeben"|"abgelaufen"} grund */
function beenden(h, grund) {
  if (halt !== h) return false;
  clearTimeout(h._uhr);
  halt = null;
  h.ende = grund;
  h.dauerMs = jetzt() - h.beginn;
  pauseBis = jetzt() + h.dauerMs;
  if (!h.bestaetigt) h._bestaetigen(false);
  const w = wartende;
  wartende = [];
  for (const weiter of w) weiter();
  if (h._beiEnde) { try { h._beiEnde(h); } catch { /* Meldung, nie den Ablauf */ } }
  return true;
}

/**
 * Beginnt einen Halt. `bereit` erfüllt sich mit true, sobald nichts mehr in Arbeit ist, mit false, wenn das nicht
 * binnen eines Viertels der Frist gelingt (Drain-Grenze; der Halt endet dann sofort). null, wenn schon ein Halt gilt, die Pause nach dem letzten noch läuft oder fristMs ungültig ist.
 * @param {number} fristMs  wird auf haltObergrenze() (höchstens HALT_HART_MS) gekürzt
 * @param {{ token?: string, beiEnde?: (h: Halt) => void, obergrenze?: number }} [o]
 * @returns {Halt|null}
 */
export function halten(fristMs, { token = randomBytes(16).toString("hex"), beiEnde = null, obergrenze = haltObergrenze() } = {}) {
  if (halt || jetzt() < pauseBis) return null;
  const grenze = Math.min(obergrenze, HALT_HART_MS);
  if (!Number.isInteger(fristMs) || fristMs < 1 || grenze < 1) return null;
  const frist = Math.min(fristMs, grenze);
  /** @type {(ok: boolean) => void} */
  let erfuellen = () => {};
  const bereit = new Promise((r) => { erfuellen = r; });
  /** @type {Halt} */
  const h = { token, fristMs: frist, beginn: jetzt(), bestaetigt: false, ende: null, dauerMs: 0, bereit,
    _bestaetigen: erfuellen, _uhr: null, _beiEnde: beiEnde };
  halt = h;
  h._uhr = setTimeout(() => beenden(h, "abgelaufen"), frist);
  if (h._uhr && typeof h._uhr.unref === "function") h._uhr.unref();
  /* Drain-Grenze: höchstens ein Viertel der Frist auf laufende Vorgänge warten, sonst sofort aufgeben. */
  const drain = setTimeout(() => { if (halt === h && !h.bestaetigt) beenden(h, "abgelaufen"); }, Math.max(1, Math.floor(frist / 4)));
  if (typeof drain.unref === "function") drain.unref();
  if (laufend === 0) bestaetigen(h);
  return h;
}

/**
 * Gibt den Halt frei. true heißt: Er galt bis eben ununterbrochen (die Frist war nicht abgelaufen). false: Er war
 * schon vorbei — was dazwischen gelesen wurde, ist nicht gehalten gewesen.
 * @param {Halt} h
 */
export function freigeben(h) { return beenden(h, "freigegeben"); }

/** Lage für Prüfungen und Protokoll. */
export function haltZustand() {
  return { gehalten: !!halt, bestaetigt: !!(halt && halt.bestaetigt), laufend, wartend: wartende.length };
}

/** Nur für Prüfungen: alles zurück auf Anfang. */
export function _zuruecksetzen() {
  if (halt) beenden(halt, "freigegeben");
  pauseBis = 0;
}

/* ---------------------------------------------------------------------------
   Dateien des Kanals
   --------------------------------------------------------------------------- */

/* Kein Link folgen, nie an einer FIFO hängen bleiben (unter Windows gibt es die Schalter nicht: dann 0). */
const OEFFNEN = FS.O_RDONLY | (FS.O_NOFOLLOW || 0) | (FS.O_NONBLOCK || 0);

/**
 * Kleine Datei lesen: nur eine gewöhnliche Datei, höchstens GROESSE_MAX Bytes, kein Link, keine FIFO.
 * @returns {Promise<{ fehlt: true } | { fehler: string } | { wert: any }>}  wert null: Inhalt unbrauchbar
 */
async function lesen(/** @type {string} */ datei) {
  let fh;
  try { fh = await open(datei, OEFFNEN); }
  catch (e) {
    const code = /** @type {any} */ (e).code;
    return code === "ENOENT" ? { fehlt: true } : { fehler: String(code || e) };
  }
  try {
    if (!(await fh.stat()).isFile()) return { wert: null };
    const puffer = Buffer.alloc(GROESSE_MAX + 1);
    const { bytesRead } = await fh.read(puffer, 0, puffer.length, 0);
    if (bytesRead > GROESSE_MAX) return { wert: null };
    try { const o = JSON.parse(puffer.subarray(0, bytesRead).toString("utf8")); return { wert: o && typeof o === "object" ? o : null }; }
    catch { return { wert: null }; }
  } catch (e) { return { fehler: String(/** @type {any} */ (e).code || e) }; }
  finally { await fh.close().catch(() => {}); }
}

/** Kurzform: der Inhalt oder null (fehlt, Fehler, unbrauchbar). */
async function kleinLesen(/** @type {string} */ datei) {
  const r = await lesen(datei);
  return "wert" in r ? r.wert : null;
}

/** Atomar schreiben: Zwischendatei, fsync, Umbenennen. */
async function atomar(/** @type {string} */ datei, /** @type {object} */ inhalt) {
  const tmp = `${datei}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
  const fh = await open(tmp, "wx", 0o600);
  try { await fh.writeFile(JSON.stringify(inhalt)); await fh.sync(); } finally { await fh.close(); }
  /* Unter Windows scheitert das Umbenennen über eine Datei, die gerade jemand liest (EPERM/EACCES/EBUSY):
     kurz warten und erneut versuchen (wie ablage.mjs). Unter Linux greift das nie. */
  for (let versuch = 0; ; versuch++) {
    try { await rename(tmp, datei); return; }
    catch (e) {
      const code = /** @type {any} */ (e).code;
      if (process.platform !== "win32" || !["EPERM", "EACCES", "EBUSY"].includes(code) || versuch >= 20) {
        await rm(tmp, { force: true });
        throw e;
      }
      await new Promise((r) => setTimeout(r, 2 * (versuch + 1)));
    }
  }
}

/** Reste eines früheren Laufs entfernen: kein Halt über einen Neustart. */
async function aufraeumen(/** @type {string} */ verz) {
  await rm(path.join(verz, ANFRAGE), { force: true });
  await rm(path.join(verz, ANTWORT), { force: true });
  for (const n of await readdir(verz).catch(() => []))
    if (n.endsWith(".tmp")) await rm(path.join(verz, n), { force: true }).catch(() => {});
}

/* ---------------------------------------------------------------------------
   Serverseite des Kanals
   --------------------------------------------------------------------------- */

/** @type {null | { stoppen: () => Promise<void> }} */
let kanal = null;

/**
 * Startet den Kanal: liest `anfrage.json` im Takt, hält, quittiert in `antwort.json`.
 * @param {{ verzeichnis: string, taktMs?: number, protokoll?: (s: string) => void }} o
 * @returns {Promise<{ ok: boolean, grund?: string }>}
 */
export async function kanalStarten({ verzeichnis, taktMs = 50, protokoll = (s) => console.log(s) }) {
  if (kanal) return { ok: true };
  if (haltObergrenze() < 1) return { ok: false, grund: "abgeschaltet (CENTRIC_SCHREIBHALT_MAX_MS=0)" };
  try {
    await mkdir(verzeichnis, { recursive: true, mode: 0o700 });
    /* Nur ein echter Ordner (kein Link), unter POSIX im Besitz dieses Prozesses und für niemand sonst schreibbar. */
    const st = await lstat(verzeichnis);
    if (!st.isDirectory()) return { ok: false, grund: `${verzeichnis} ist kein Ordner (Link?)` };
    if (process.platform !== "win32" && typeof process.getuid === "function"
      && (st.uid !== process.getuid() || (st.mode & 0o022) !== 0))
      return { ok: false, grund: `${verzeichnis}: falscher Besitzer oder für andere schreibbar` };
    await aufraeumen(verzeichnis);
  } catch (e) {
    return { ok: false, grund: `Ordner ${verzeichnis} nicht nutzbar (${/** @type {any} */ (e).code || e})` };
  }
  const anfrageDatei = path.join(verzeichnis, ANFRAGE);
  const antwortDatei = path.join(verzeichnis, ANTWORT);
  /** Antworten nacheinander, in der Reihenfolge der Ereignisse. */
  let antworten = Promise.resolve();
  const antworte = (/** @type {object} */ inhalt) => {
    antworten = antworten.then(() => atomar(antwortDatei, { fassung: 1, ...inhalt, zeit: new Date().toISOString() }))
      .catch((e) => protokoll(`Schreibhalt: Antwort nicht geschrieben (${e && e.code || e})`));
    return antworten;
  };
  /** @type {null | Halt} */
  let aktiv = null;
  let zuletzt = "";
  let zuletztAbgelehnt = "";
  /** Wurde die Anfrage des laufenden Halts überschrieben? */
  let ersetzt = false;
  /** Gab es während des laufenden Halts einen Lesefehler an der Anfrage? */
  let unsicher = false;
  let beschaeftigt = false;
  let gestoppt = false;

  const pruefen = async () => {
    if (beschaeftigt || gestoppt) return;
    beschaeftigt = true;
    try {
      const r = await lesen(anfrageDatei);
      if (aktiv) {
        /* Freigabe NUR, wenn die Anfrage wirklich gelöscht ist. Lesefehler: weiter halten (die Frist begrenzt).
           Eine fremde oder kaputte Anfrage: weiter halten, ablehnen, und die spätere Freigabe gilt als „ersetzt“. */
        if ("fehlt" in r) {
          const h = aktiv;
          aktiv = null;
          const grund = ersetzt ? "ersetzt" : unsicher ? "unsicher" : "geloescht";
          if (freigeben(h)) {
            protokoll(`Schreibhalt: freigegeben nach ${Math.round(h.dauerMs)} ms (${grund})`);
            await antworte({ token: h.token, stand: "freigegeben", grund, dauerMs: Math.round(h.dauerMs) });
          }
        } else if ("fehler" in r) {
          /* Nicht lesbar: nicht freigeben (die Frist begrenzt). Was danach kommt, ist nicht mehr bewiesen. */
          if (!unsicher) protokoll(`Schreibhalt: Anfrage nicht lesbar (${r.fehler}) — Halt läuft bis zur Frist oder Löschung, gilt aber nicht als bewiesen`);
          unsicher = true;
        } else if ("wert" in r && (!r.wert || r.wert.token !== aktiv.token)) {
          if (!ersetzt) protokoll("Schreibhalt: Anfrage während des Halts ersetzt — dieser Halt beweist nichts mehr");
          ersetzt = true;
          const fremd = r.wert && typeof r.wert.token === "string" && TOKEN.test(r.wert.token) ? r.wert.token : "";
          if (fremd && fremd !== zuletztAbgelehnt) {
            zuletztAbgelehnt = fremd;
            await antworte({ token: fremd, stand: "abgelehnt", grund: "ein anderer Halt läuft" });
          }
        }
        return;
      }
      const a = "wert" in r ? r.wert : null;
      if (!a || typeof a.token !== "string" || a.token === zuletzt) return;
      if (jetzt() < pauseBis || halt) return;       // später, nach der Pause
      zuletzt = a.token;
      const alter = Date.now() - Date.parse(String(a.erstellt));
      const gueltig = a.fassung === 1 && TOKEN.test(a.token) && Number.isInteger(a.fristMs) && a.fristMs >= 1
        && Number.isFinite(alter) && Math.abs(alter) <= ANFRAGE_FRISCH_MS;
      if (!gueltig) { await antworte({ token: TOKEN.test(a.token) ? a.token : "", stand: "abgelehnt", grund: "Anfrage ungültig oder veraltet" }); return; }
      const h = halten(a.fristMs, { token: a.token, beiEnde: (x) => {
        if (x.ende !== "abgelaufen") return;
        if (aktiv === x) aktiv = null;
        protokoll(`Schreibhalt: Frist ${x.fristMs} ms abgelaufen${x.bestaetigt ? "" : " (nie bestätigt: Vorgänge liefen noch)"}`);
        antworte({ token: x.token, stand: "abgelaufen", bestaetigt: x.bestaetigt });
      } });
      if (!h) { await antworte({ token: a.token, stand: "abgelehnt", grund: "Halt nicht möglich" }); return; }
      aktiv = h;
      ersetzt = false;
      unsicher = false;
      h.bereit.then((ok) => { if (ok && halt === h) antworte({ token: h.token, stand: "gehalten", fristMs: h.fristMs }); });
    } catch (e) {
      protokoll(`Schreibhalt: Kanal-Fehler (${e && /** @type {any} */ (e).message || e})`);
    } finally {
      beschaeftigt = false;
    }
  };
  const uhr = setInterval(pruefen, taktMs);
  uhr.unref();
  kanal = {
    stoppen: async () => {
      gestoppt = true;
      clearInterval(uhr);
      if (aktiv) { freigeben(aktiv); aktiv = null; }
      await antworten;
      kanal = null;
    },
  };
  return { ok: true };
}

/** Kanal beenden (Prüfungen, Herunterfahren). Ein laufender Halt wird freigegeben. */
export async function kanalStoppen() { if (kanal) await kanal.stoppen(); }

/* ---------------------------------------------------------------------------
   Werkzeugseite des Kanals (werkzeug/ablage-sicherung.mjs)
   --------------------------------------------------------------------------- */

/**
 * Fordert über den Kanal einen Halt an und wartet auf die Bestätigung.
 * Ergebnis: { gehalten: true, freigeben(): Promise<boolean> } oder { gehalten: false, grund, keinServer }.
 * `freigeben()` ist nur true, wenn der Server bestätigt, dass der Halt bis zur Freigabe ununterbrochen galt UND die
 * Freigabe vom Löschen genau dieser Anfrage kam (grund „geloescht“, nicht „ersetzt“).
 * @param {string} verz
 * @param {{ fristMs?: number, warteMs?: number, taktMs?: number }} [o]
 */
export async function haltAnfordern(verz, { fristMs = 2000, warteMs = HALT_HART_MS + 2000, taktMs = 10 } = {}) {
  const token = randomBytes(16).toString("hex");
  const anfrageDatei = path.join(verz, ANFRAGE);
  const antwortDatei = path.join(verz, ANTWORT);
  const pause = () => new Promise((r) => setTimeout(r, taktMs));
  const zuruecknehmen = async () => {
    const a = await kleinLesen(anfrageDatei);
    if (a && a.token === token) await rm(anfrageDatei, { force: true }).catch(() => {});
  };
  /** Wartet auf eine Antwort zu diesem Token mit einem der Stände. */
  const warten = async (/** @type {string[]} */ staende, /** @type {number} */ ms) => {
    const bis = jetzt() + ms;
    for (;;) {
      const b = await kleinLesen(antwortDatei);
      if (b && b.token === token && staende.includes(b.stand)) return b;
      if (jetzt() >= bis) return null;
      await pause();
    }
  };
  try {
    await atomar(anfrageDatei, { fassung: 1, token, fristMs, erstellt: new Date().toISOString() });
  } catch (e) {
    return { gehalten: false, keinServer: true, grund: `Anfrage nicht schreibbar (${/** @type {any} */ (e).code || e})` };
  }
  const b = await warten(["gehalten", "abgelehnt", "abgelaufen"], warteMs);
  if (!b || b.stand !== "gehalten") {
    await zuruecknehmen();
    return { gehalten: false, keinServer: !b,
      grund: !b ? `keine Antwort des Servers in ${warteMs} ms` : b.stand === "abgelehnt" ? `abgelehnt (${b.grund || "?"})`
        : "Frist abgelaufen, bevor alle laufenden Vorgänge fertig waren" };
  }
  const gewaehrt = Number(b.fristMs) || fristMs;
  return {
    gehalten: true,
    fristMs: gewaehrt,
    /** @returns {Promise<boolean>} */
    freigeben: async () => {
      await rm(anfrageDatei, { force: true }).catch(() => {});
      const e = await warten(["freigegeben", "abgelaufen"], gewaehrt + 2000);
      return !!e && e.stand === "freigegeben" && e.grund === "geloescht";
    },
  };
}
