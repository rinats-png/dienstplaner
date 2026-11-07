/* ==========================================================================
   SCHLÜSSELEPOCHE — Sicherungsschlüssel überleben keine Wiederherstellung
   (Betreiberentscheidung 2026-11-07)

   Nach jeder vollständigen Wiederherstellung der Ablage sind ALLE zuvor
   bestehenden Sicherungsschlüssel (`sk:`) ungültig, auch wenn der
   wiederhergestellte Stand vor ihrem Widerruf liegt. Ein Widerrufsvermerk
   (`skw:`) in derselben Ablage genügt dafür nicht: Er wird mit zurückgespielt.

   Deshalb liegt die Autorität AUSSERHALB der gesicherten Ablage:

     E  <CENTRIC_ZUSTAND>/schluessel-epoche.json   { epoche, bindung, seit, grund }
        Vorgabe CENTRIC_ZUSTAND: <CENTRIC_DATEN>-zustand (Geschwister, nicht
        darin). Weder ablage-sicherung noch restic sehen dieses Verzeichnis.
     D  centric-sitzungen/skbindung                { bindung }
        in der Ablage, aber NICHT in der Ablage-Sicherung (STORES „nur" lässt
        nur sk:/skw:/skraum: durch).

   Ein Schlüssel trägt beim Anlegen die Epoche (`epoche`). Er gilt nur, wenn
   E lesbar ist, E.epoche = sk.epoche und D.bindung = E.bindung. Passt D nicht
   zu E (fehlt, ist älter), ist die Ablage zurückgespielt worden: Es entsteht
   eine NEUE Epoche (Zufallswert, kein Zähler — eine verlorene Datei kann so
   nie eine alte Epoche wiederbeleben), und jeder bestehende Schlüssel ist
   ungültig.

   Wie jede Art der Wiederherstellung erkannt wird:
     - ablage-sicherung wiederherstellen (auch nach restic restore): D ist nie
       in der Sicherung → D fehlt → neue Epoche. Zusätzlich erneuert das
       Werkzeug E selbst, wenn es das Zustandsverzeichnis kennt.
     - Verzeichniskopie eines alten /data (mit D): D trägt eine alte Bindung,
       sobald seit der Kopie ein Schlüssel widerrufen wurde oder der Server
       neu gestartet ist (beides erneuert die Bindung). Für eine Kopie aus dem
       laufenden Prozess ohne Widerruf seither ist `ablage-sicherung.mjs
       schluessel-erneuern` Pflichtschritt (docs/BETRIEB-SICHERUNG.md).

   Fehler schließen die Tür: Ist E nicht lesbar oder nicht schreibbar, D nicht
   lesbar, oder liegt das Zustandsverzeichnis in der Ablage selbst, gibt es
   keine Epoche — kein Schlüssel gilt, keiner wird angelegt. Alles andere
   (Anmeldung, Betreiberzugang, Daten) hängt nicht daran.
   ========================================================================== */

import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { ablageWurzel } from "./ablage.mjs";
import { sitzungsSpeicher } from "./sitzungen.mjs";

export const EPOCHE_DATEI = "schluessel-epoche.json";
export const BINDUNG_SCHLUESSEL = "skbindung";
const FORM = /^[0-9a-f]{32}$/;
const zufall = () => randomBytes(16).toString("hex");

export class EpochenFehler extends Error {
  /** @param {string} m */
  constructor(m) { super(m); this.code = "BESTAND_UNLESBAR"; }
}

/** Das Zustandsverzeichnis. Liegt es in der Ablage, würde es mitgesichert: dann keines (fail-closed). */
export function zustandsVerzeichnis() {
  const daten = path.resolve(ablageWurzel());
  const z = path.resolve(process.env.CENTRIC_ZUSTAND || `${daten}-zustand`);
  if (z === daten || z.startsWith(daten + path.sep))
    throw new EpochenFehler("CENTRIC_ZUSTAND liegt in der Ablage und würde mitgesichert.");
  return z;
}

/** E lesen. null: fehlt oder unbrauchbar (beides führt zu einer neuen Epoche). Lesefehler: wirft. */
export async function epocheDateiLesen(verz) {
  let roh;
  try { roh = await readFile(path.join(verz, EPOCHE_DATEI), "utf8"); }
  catch (e) {
    if (/** @type {any} */ (e).code === "ENOENT") return null;
    throw new EpochenFehler(`Schlüsselepoche nicht lesbar (${/** @type {any} */ (e).code || e}).`);
  }
  let o = null;
  try { o = JSON.parse(roh); } catch { /* beschädigt: wie fehlend, die Folge ist eine neue Epoche */ }
  return o && FORM.test(o.epoche) && FORM.test(o.bindung) ? o : null;
}

/** E atomar schreiben (Zwischendatei, fsync, Umbenennen). */
async function epocheDateiSchreiben(verz, inhalt) {
  try {
    await mkdir(verz, { recursive: true, mode: 0o700 });
    const ziel = path.join(verz, EPOCHE_DATEI);
    const tmp = `${ziel}.${process.pid}.${zufall()}.tmp`;
    const fh = await open(tmp, "wx", 0o600);
    try { await fh.writeFile(JSON.stringify(inhalt)); await fh.sync(); } finally { await fh.close(); }
    try { await rename(tmp, ziel); } catch (e) { await rm(tmp, { force: true }); throw e; }
  } catch (e) {
    throw new EpochenFehler(`Schlüsselepoche nicht schreibbar (${/** @type {any} */ (e).code || e}).`);
  }
}

/**
 * Eine neue Epoche in E schreiben (für das Werkzeug: vor dem Zurückspielen, oder von Hand nach einer Verzeichniskopie).
 * Ohne Ablage: D wird dabei nicht angefasst; die alte D passt danach nicht mehr, also bleibt es bei der neuen Epoche.
 * @param {string} verz
 * @param {string} grund
 */
export async function epocheDateiErneuern(verz, grund) {
  const neu = { fassung: 1, epoche: zufall(), bindung: zufall(), seit: new Date().toISOString(),
    grund: String(grund).slice(0, 60) };
  await epocheDateiSchreiben(verz, neu);
  return neu;
}

/* Ein Prozess, eine Reihe: Lesen-Vergleichen-Schreiben von E und D läuft nie verschränkt. */
/** @type {Promise<any>} */
let reihe = Promise.resolve();
/** @template T @param {() => Promise<T>} fn @returns {Promise<T>} */
function nacheinander(fn) {
  const r = reihe.then(fn, fn);
  reihe = r.catch(() => {});
  return r;
}

async function bindungLesen(a) {
  try {
    const d = await a.get(BINDUNG_SCHLUESSEL, { type: "json" });
    return d && FORM.test(d.bindung) ? d.bindung : null;
  } catch (e) {
    throw new EpochenFehler(`Schlüsselbindung nicht lesbar (${/** @type {any} */ (e).message || e}).`);
  }
}

async function bindungSchreiben(a, bindung) {
  try { await a.setJSON(BINDUNG_SCHLUESSEL, { bindung }); }
  catch (e) { throw new EpochenFehler(`Schlüsselbindung nicht schreibbar (${/** @type {any} */ (e).message || e}).`); }
}

/**
 * Die gültige Epoche. Erkennt eine zurückgespielte Ablage und beginnt dann eine neue.
 * Wirft EpochenFehler (→ 503), wenn sich das nicht zuverlässig feststellen lässt.
 * @param {{ablage?: any}} [o]
 * @returns {Promise<{epoche: string, erneuert: (string|null)}>}  `erneuert`: Grund, falls gerade neu begonnen
 */
export function schluesselEpoche({ ablage = null } = {}) {
  return nacheinander(async () => {
    const a = ablage || sitzungsSpeicher();
    const verz = zustandsVerzeichnis();
    const e = await epocheDateiLesen(verz);
    const d = await bindungLesen(a);
    if (e && d && d === e.bindung) return { epoche: e.epoche, erneuert: null };
    const grund = !e ? (d ? "epoche-fehlt" : "erstmals") : (d ? "ablage-zurueckgespielt" : "bindung-fehlt");
    const neu = await epocheDateiErneuern(verz, grund);
    await bindungSchreiben(a, neu.bindung);
    if (e) console.warn(`Sicherungsschlüssel: neue Epoche (${grund}). Alle früheren Schlüssel sind ungültig.`);
    return { epoche: neu.epoche, erneuert: grund };
  });
}

/**
 * Die Bindung erneuern, Epoche bleibt. Vor jedem Widerruf und beim Start: Eine Kopie der Ablage von vorher passt dann
 * nicht mehr zu E und wird als Wiederherstellung erkannt. Gibt es noch keine Epoche, gibt es nichts zu erneuern.
 * @param {{ablage?: any, nurWennVorhanden?: boolean}} [o]
 * @returns {Promise<{erneuert: boolean, neueEpoche?: boolean}>}
 */
export function bindungErneuern({ ablage = null, nurWennVorhanden = false } = {}) {
  return nacheinander(async () => {
    const a = ablage || sitzungsSpeicher();
    const verz = zustandsVerzeichnis();
    const e = await epocheDateiLesen(verz);
    if (!e && nurWennVorhanden) return { erneuert: false };
    const d = await bindungLesen(a);
    /* Passt D schon jetzt nicht (oder fehlt E): erst eine neue Epoche, sonst würde eine Wiederherstellung übertüncht. */
    const epoche = e && d === e.bindung ? e.epoche : zufall();
    const neu = { fassung: 1, epoche, bindung: zufall(), seit: e && epoche === e.epoche ? e.seit : new Date().toISOString(),
      grund: e && epoche === e.epoche ? e.grund : (e ? "ablage-zurueckgespielt" : "erstmals") };
    /* Erst E, dann D: Bleibt D aus, passt beim nächsten Lesen nichts, und es gibt eine neue Epoche (sichere Richtung). */
    await epocheDateiSchreiben(verz, neu);
    await bindungSchreiben(a, neu.bindung);
    return { erneuert: true, neueEpoche: !e || epoche !== e.epoche };
  });
}
