/* ==========================================================================
   PROZESSSPERRE — ein Prozess je Ablage

   Die Sperre je Raum (raumsperre.mjs) lebt im Speicher dieses Prozesses.
   Ein zweiter Prozess auf derselben Ablage hat seine eigene Reihe, und
   damit sind die verlorenen Änderungen wieder da: zwei Container beim
   Ausrollen, ein Testserver, der versehentlich auf den Datenordner zeigt.
   Deshalb belegt server.mjs beim Start die Datei

     <CENTRIC_DATEN>/.prozess      { pid, start, rechner }

   mit O_EXCL — angelegt wird sie nur, wenn es sie noch nicht gibt. Gibt es
   sie, wird geprüft, ob ihr Halter noch lebt:

   Derselbe Rechner (derselbe Container): Lebt die PID, und ist die Datei
   frisch, hält ein anderer Prozess die Ablage — Start verweigert. Ist die
   PID tot, oder ist es die eigene (im Container ist der Server nach jedem
   Neustart wieder PID 1), ist die Sperre veraltet und wird übernommen.

   Ein anderer Rechner (ein zweiter Container auf demselben Datenordner):
   Dessen PIDs lassen sich von hier aus nicht prüfen. Dafür gibt es den
   Puls — der Halter frischt alle zehn Sekunden die Änderungszeit der Datei
   auf. Bleibt sie länger als dreißig Sekunden stehen, gilt die Sperre als
   veraltet. Ist sie frischer, wird eine Weile beobachtet: Rückt sie vor,
   lebt der Halter, und der Start wird verweigert; bleibt sie stehen, bis
   sie veraltet ist, wird übernommen. Damit kommt ein neuer Container nach
   einem harten Abbruch des alten nach spätestens einer halben Minute hoch,
   statt für immer zu warten.

   Das Wegräumen einer veralteten Sperre ist selbst ein Rennen: Zwei
   Prozesse, die gleichzeitig starten, könnten beide dieselbe tote Sperre
   finden. Deshalb wird nicht gelöscht, sondern umbenannt, und der
   umbenannte Inhalt mit dem verglichen, was als veraltet beurteilt wurde.
   Hat inzwischen ein anderer die Sperre neu belegt, wird sie zurückgestellt
   und der eigene Start verweigert.

   Der Container läuft read-only bis auf /data; die Datei liegt deshalb in
   der Ablage selbst. Sie ist keine .json-Datei in einem Store-Ordner und
   damit für die Ablage (ablage.mjs) unsichtbar.
   ========================================================================== */

import { open, readFile, rename, unlink, utimes, stat, link, mkdir } from "node:fs/promises";
import { readFileSync, unlinkSync } from "node:fs";
import { hostname } from "node:os";
import { randomBytes } from "node:crypto";
import path from "node:path";

export const SPERRDATEI = ".prozess";
/** Alle so viele Millisekunden frischt der Halter die Änderungszeit auf. */
export const PULS_MS = 10_000;
/** Älter als das, und der Puls ist ausgeblieben. */
export const VERALTET_MS = 30_000;
/** So lange wird eine fremde, noch frische Sperre höchstens beobachtet. */
export const WARTEN_MS = VERALTET_MS + 5_000;

/** Lebt ein Prozess mit dieser PID auf diesem Rechner? */
function pidLebt(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; }
  catch (e) { return /** @type {any} */ (e).code === "EPERM"; }   // es gibt ihn, er gehört nur nicht uns
}

const warte = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Wie steht es um die vorhandene Sperre?
 * @returns {Promise<{ zustand: "weg"|"lebt"|"unklar"|"veraltet", roh?: string,
 *   halter?: any, mtime?: number }>}
 */
async function lageDerSperre(datei, { veraltetMs }) {
  let roh, st;
  try { [roh, st] = await Promise.all([readFile(datei, "utf8"), stat(datei)]); }
  catch (e) { if (/** @type {any} */ (e).code === "ENOENT") return { zustand: "weg" }; throw e; }
  const alter = Date.now() - st.mtimeMs;
  let halter = null;
  try { halter = JSON.parse(roh); } catch { /* unten behandelt */ }

  /* Unlesbar: Ein Halter, der gerade erst anlegt, hat noch nichts
     hineingeschrieben. Frisch heißt also „abwarten", alt heißt „Rest
     eines Absturzes". */
  if (!halter || typeof halter !== "object")
    return { zustand: alter < veraltetMs ? "unklar" : "veraltet", roh, halter: null, mtime: st.mtimeMs };

  if (halter.rechner === hostname()) {
    if (halter.pid === process.pid) return { zustand: "veraltet", roh, halter, mtime: st.mtimeMs };
    if (!pidLebt(halter.pid)) return { zustand: "veraltet", roh, halter, mtime: st.mtimeMs };
    /* PID lebt, aber kein Puls mehr: Eine wiederverwendete PID ist
       wahrscheinlicher als ein Server, der dreißig Sekunden stillsteht. */
    return { zustand: alter < veraltetMs ? "lebt" : "veraltet", roh, halter, mtime: st.mtimeMs };
  }
  return { zustand: alter < veraltetMs ? "unklar" : "veraltet", roh, halter, mtime: st.mtimeMs };
}

/** Eine als veraltet beurteilte Sperre wegräumen — nur, wenn es noch dieselbe ist. */
async function veralteteWegraeumen(datei, rohErwartet) {
  const beiseite = `${datei}.veraltet-${process.pid}-${randomBytes(4).toString("hex")}`;
  try { await rename(datei, beiseite); }
  catch (e) { if (/** @type {any} */ (e).code === "ENOENT") return true; throw e; }
  const roh = await readFile(beiseite, "utf8").catch(() => null);
  if (roh !== rohErwartet) {
    /* Inzwischen hatte ein anderer die Ablage neu belegt — zurückstellen. */
    await link(beiseite, datei).catch(() => {});
    await unlink(beiseite).catch(() => {});
    return false;
  }
  await unlink(beiseite).catch(() => {});
  return true;
}

const beschreibung = (h) => (h
  ? `Prozess ${h.pid} auf ${h.rechner || "?"} seit ${h.start || "?"}`
  : "ein Prozess, dessen Sperre noch angelegt wird");

/**
 * Belegt die Ablage für diesen Prozess.
 *
 * @param {string} wurzel  CENTRIC_DATEN
 * @param {{ puls?: boolean, pulsMs?: number, veraltetMs?: number, wartenMs?: number,
 *   verloren?: (grund: string) => void }} [o]
 * @returns {Promise<{ ok: boolean, grund?: string, halter?: any, datei?: string, uebernommen?: boolean,
 *   freigeben?: () => Promise<void>, freigebenSofort?: () => void }>}
 *   ok: true mit freigeben/freigebenSofort, sonst ok: false mit grund und halter
 */
export async function ablageBelegen(wurzel, { puls = true, pulsMs = PULS_MS, veraltetMs = VERALTET_MS,
  wartenMs = WARTEN_MS, verloren = null } = {}) {
  await mkdir(wurzel, { recursive: true });
  const datei = path.join(wurzel, SPERRDATEI);
  const eigen = { pid: process.pid, start: new Date().toISOString(), rechner: hostname() };
  let uebernommen = false;
  let letzte = null;

  for (let versuch = 0; versuch < 5; versuch++) {
    try {
      const fh = await open(datei, "wx");
      try { await fh.writeFile(JSON.stringify(eigen)); } finally { await fh.close(); }
      return belegt(datei, eigen, uebernommen, { puls, pulsMs, verloren });
    } catch (e) {
      if (/** @type {any} */ (e).code !== "EEXIST") throw e;
    }

    let lage = await lageDerSperre(datei, { veraltetMs });
    /* Frisch, aber nicht prüfbar: beobachten, ob der Puls weitergeht. */
    if (lage.zustand === "unklar" && wartenMs > 0) {
      const bis = Date.now() + wartenMs;
      const anfang = lage.mtime;
      while (lage.zustand === "unklar" && Date.now() < bis) {
        await warte(Math.min(1000, Math.max(50, bis - Date.now())));
        lage = await lageDerSperre(datei, { veraltetMs });
        if (lage.zustand === "unklar" && lage.mtime !== anfang) { lage = { ...lage, zustand: "lebt" }; break; }
      }
    }
    letzte = lage;
    if (lage.zustand === "weg") continue;
    if (lage.zustand === "lebt" || lage.zustand === "unklar") {
      return { ok: false, halter: lage.halter,
        grund: `Ablage ${wurzel} ist belegt: ${beschreibung(lage.halter)}.` };
    }
    /* veraltet */
    if (!(await veralteteWegraeumen(datei, lage.roh))) {
      return { ok: false, halter: null,
        grund: `Ablage ${wurzel} ist belegt: Ein anderer Prozess hat sie gerade übernommen.` };
    }
    uebernommen = true;
  }
  return { ok: false, halter: letzte && letzte.halter,
    grund: `Ablage ${wurzel} ist belegt: Die Sperre ließ sich nicht übernehmen.` };
}

function belegt(datei, eigen, uebernommen, { puls, pulsMs, verloren }) {
  const istMeine = (roh) => {
    try { const h = JSON.parse(roh); return h.pid === eigen.pid && h.start === eigen.start; }
    catch { return false; }
  };
  let uhr = null;
  if (puls) {
    uhr = setInterval(async () => {
      try {
        const roh = await readFile(datei, "utf8");
        if (!istMeine(roh)) throw new Error("Sperre gehört einem anderen Prozess");
        const t = new Date();
        await utimes(datei, t, t);
      } catch (e) {
        /* Die Sperre ist weg oder gehört jemand anderem — dann schreiben
           womöglich zwei Prozesse. Das meldet der Aufrufer (server.mjs
           beendet sich); hier wird nur nicht weiter gepulst. */
        clearInterval(uhr);
        if (verloren) verloren(String(/** @type {any} */ (e).message || e));
      }
    }, pulsMs);
    uhr.unref();
  }
  const anhalten = () => { if (uhr) clearInterval(uhr); uhr = null; };
  return {
    ok: true, datei, uebernommen,
    /** Gibt die Sperre frei — nur, wenn sie noch diesem Prozess gehört. */
    async freigeben() {
      anhalten();
      const roh = await readFile(datei, "utf8").catch(() => null);
      if (roh !== null && istMeine(roh)) await unlink(datei).catch(() => {});
    },
    /** Dasselbe synchron, für process.on("exit"). */
    freigebenSofort() {
      anhalten();
      try { if (istMeine(readFileSync(datei, "utf8"))) unlinkSync(datei); } catch { /* schon weg */ }
    },
  };
}
