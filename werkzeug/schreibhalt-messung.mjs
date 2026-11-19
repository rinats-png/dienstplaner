#!/usr/bin/env node
/* ==========================================================================
   SCHREIBHALT-MESSUNG — Abnahme WP-28c: Sicherung unter Dauerlast

     node werkzeug/schreibhalt-messung.mjs [--sicherungen 1000] [--paare 8]
          [--luecke 5] [--pause 5] [--takt 10] [--ohne-halt] [--json]

   Nur Wegwerf-Daten in einem Temp-Verzeichnis. Ein eigener Prozess spielt
   den Server: echte Ablage (server/lib/ablage.mjs), echte Raumsperre, echter
   Halte-Kanal (server/lib/schreibhalt.mjs). Er schreibt ohne Pause
   Zwei-Datei-Transaktionen unter der Raumsperre — Konto, `--luecke` ms
   warten, Mitgliedschaft, beide mit derselben Generation — je Paar eine
   Schleife. Dieser Prozess sichert währenddessen `--sicherungen` Mal mit
   werkzeug/ablage-sicherung.mjs (sichern mit Halt, ohne Ruhezeit) und liest
   in jeder Sicherung jedes Paar: Weichen die Generationen ab, liegt der
   Schnitt mitten in einer Transaktion.

   Ergebnis: Schnitte, Erfolgsquote, Schreibvorgänge/s, Haltedauer, Laufzeit
   einer Transaktion (p50/p95/max) ohne und mit laufender Sicherung.
   Exit 1, wenn die Abnahme verfehlt ist (mit Halt: Schnitte > 0, Erfolg
   < 100 % oder < 50 Schreibvorgänge/s). `--ohne-halt` misst zum Vergleich
   den Stand ohne Halt (Ruhezeit 0) und prüft nichts.
   ========================================================================== */

import { fork } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const warte = (/** @type {number} */ ms) => new Promise((r) => setTimeout(r, ms));

function argumente(/** @type {string[]} */ a) {
  /** @type {Record<string, string|true>} */ const o = {};
  for (let i = 0; i < a.length; i++) {
    const k = a[i].replace(/^--/, "");
    if (["ohne-halt", "json", "schreiber"].includes(k)) o[k] = true;
    else o[k] = a[++i];
  }
  return o;
}
const zahl = (/** @type {any} */ w, /** @type {number} */ vorgabe) => (w === undefined ? vorgabe : Number(w));

/** @param {number[]} werte @param {number} q */
function quantil(werte, q) {
  if (!werte.length) return null;
  const s = [...werte].sort((a, b) => a - b);
  return Math.round(s[Math.min(s.length - 1, Math.floor(q * s.length))] * 10) / 10;
}

/* ---------------------------------------------------------------------------
   Kindprozess: der „Server“
   --------------------------------------------------------------------------- */
async function schreiber(/** @type {Record<string, any>} */ o) {
  const A = await import("../server/lib/ablage.mjs");
  const R = await import("../server/lib/raumsperre.mjs");
  const H = await import("../server/lib/schreibhalt.mjs");
  const k = await H.kanalStarten({ verzeichnis: String(o.verz), taktMs: zahl(o.takt, 10), protokoll: () => {} });
  if (!k.ok) throw new Error(`Kanal: ${k.grund}`);
  const store = A.getStore("centric");
  const paare = zahl(o.paare, 8);
  const luecke = zahl(o.luecke, 5);
  const pause = zahl(o.pause, 5);
  let an = true;
  let phase = "ruhig";
  let schreibungen = 0;
  let schreibfehler = 0;
  /** @type {string[]} */ const fehlerArten = [];
  let beginn = 0;
  /** @type {Record<string, number[]>} */
  const latenz = { ruhig: [], sicherung: [] };
  process.on("message", (/** @type {any} */ m) => {
    if (m && m.phase) { phase = m.phase; if (phase === "sicherung") { schreibungen = 0; beginn = performance.now(); } }
    if (m && m.stopp) an = false;
  });
  const laeufe = [];
  for (let i = 0; i < paare; i++) {
    laeufe.push((async () => {
      let gen = 0;
      while (an) {
        gen += 1;
        const t0 = performance.now();
        try {
          await R.unterRaumsperre(`mess-${i}`, async () => {
            await store.setJSON(`mess-konto-${i}`, { gen });
            await warte(luecke);
            await store.setJSON(`mess-mitglied-${i}`, { gen });
          });
          latenz[phase].push(performance.now() - t0);
          schreibungen += 2;
        } catch (e) {
          /* Gezählt, nicht verschluckt (Windows: EPERM beim Ersetzen einer gerade gelesenen Datei, WP-28b/2 B8). */
          schreibfehler += 1;
          if (fehlerArten.length < 3) fehlerArten.push(String(/** @type {any} */ (e).code || /** @type {any} */ (e).message));
        }
        if (pause) await warte(pause);
      }
    })());
  }
  await warte(300);
  /** @type {any} */ (process).send({ bereit: true });
  await Promise.all(laeufe);
  const sekunden = (performance.now() - beginn) / 1000;
  await H.kanalStoppen();
  const zusammen = (/** @type {number[]} */ w) => ({ n: w.length, p50: quantil(w, 0.5), p95: quantil(w, 0.95), max: quantil(w, 1) });
  /** @type {any} */ (process).send({ ergebnis: { schreibungen, sekunden, proSekunde: Math.round(schreibungen / sekunden), schreibfehler, fehlerArten,
    latenzRuhig: zusammen(latenz.ruhig), latenzSicherung: zusammen(latenz.sicherung) } });
}

/* ---------------------------------------------------------------------------
   Hauptprozess: sichern und zählen
   --------------------------------------------------------------------------- */
export async function messen(/** @type {Record<string, any>} */ o = {}) {
  const G = await import("./ablage-sicherung.mjs");
  const H = await import("../server/lib/schreibhalt.mjs");
  const anzahl = zahl(o.sicherungen, 1000);
  const paare = zahl(o.paare, 8);
  const mitHalt = !o["ohne-halt"];
  const basis = await mkdtemp(path.join(tmpdir(), "wp28c-messung-"));
  const daten = path.join(basis, "daten");
  const zustand = path.join(basis, "zustand");
  const verz = path.join(zustand, H.HALT_ORDNER);
  const ziel = path.join(basis, "sicherungen");
  await mkdir(daten, { recursive: true });
  const kind = fork(fileURLToPath(import.meta.url), ["--schreiber", "--verz", verz, "--paare", String(paare),
    "--luecke", String(zahl(o.luecke, 5)), "--pause", String(zahl(o.pause, 5)), "--takt", String(zahl(o.takt, 10))],
  { env: { ...process.env, CENTRIC_DATEN: daten, CENTRIC_ZUSTAND: zustand }, stdio: ["ignore", "ignore", "inherit", "ipc"] });
  /** @type {any} */ let ergebnisKind = null;
  const kindFertig = new Promise((r, f) => {
    kind.on("message", (/** @type {any} */ m) => { if (m.ergebnis) ergebnisKind = m.ergebnis; });
    kind.on("exit", (c) => (c === 0 ? r(undefined) : f(new Error(`Schreiber endete mit ${c}`))));
  });
  await new Promise((r, f) => { kind.on("message", (/** @type {any} */ m) => { if (m.bereit) r(undefined); }); kind.on("exit", f); });
  await warte(1500);                                    // Laufzeit ohne Sicherung
  kind.send({ phase: "sicherung" });

  let erfolg = 0; let fehlschlag = 0; let schnitte = 0; let mitHaltAbgeschlossen = 0;
  /** @type {string[]} */ const fehler = [];
  /** @type {number[]} */ const dauer = [];
  const genIn = async (/** @type {string} */ p, /** @type {string} */ k) =>
    JSON.parse(await readFile(path.join(p, "daten", "centric", `${k}.json`), "utf8")).daten.gen;
  const basisZeit = Date.UTC(2030, 0, 1);
  for (let n = 0; n < anzahl; n++) {
    const t0 = performance.now();
    try {
      const r = await G.sichern({ quelle: daten, ziel, jetzt: new Date(basisZeit + n * 1000), pause: 0, versuche: 1,
        ruhe: 0, schreibhalt: mitHalt ? verz : null });
      dauer.push(performance.now() - t0);
      erfolg += 1;
      if (r.manifest.konsistenz === "schreibhalt") mitHaltAbgeschlossen += 1;
      for (let i = 0; i < paare; i++) {
        const a = await genIn(r.pfad, `mess-konto-${i}`).catch(() => null);
        const b = await genIn(r.pfad, `mess-mitglied-${i}`).catch(() => null);
        if (a !== b) schnitte += 1;
      }
      await rm(r.pfad, { recursive: true, force: true });
    } catch (e) {
      fehlschlag += 1;
      if (fehler.length < 5) fehler.push(String(/** @type {any} */ (e).message || e).slice(0, 200));
    }
    if (o.fortschritt && (n + 1) % 100 === 0) process.stderr.write(`  ${n + 1}/${anzahl}\n`);
  }
  kind.send({ stopp: true });
  await kindFertig;
  await rm(basis, { recursive: true, force: true }).catch(() => {});
  const bericht = {
    modus: mitHalt ? "mit Schreib-Halt" : "ohne Halt (Ruhezeit 0, Vergleich)", plattform: process.platform,
    sicherungen: anzahl, erfolg, fehlschlag, erfolgsquote: Math.round((erfolg / anzahl) * 10000) / 100,
    mitHaltAbgeschlossen, schnitteMittenInTransaktion: schnitte, paareJeSicherung: paare,
    sicherungMs: { p50: quantil(dauer, 0.5), p95: quantil(dauer, 0.95), max: quantil(dauer, 1) },
    schreiber: ergebnisKind, fehler,
  };
  const ok = !mitHalt || (schnitte === 0 && erfolg === anzahl && mitHaltAbgeschlossen === anzahl
    && ergebnisKind && ergebnisKind.proSekunde >= 50 && ergebnisKind.schreibfehler === 0);
  return { ok, bericht };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const o = argumente(process.argv.slice(2));
  if (o.schreiber) {
    schreiber(o).then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
  } else {
    const { ok, bericht } = await messen({ ...o, fortschritt: !o.json });
    console.log(o.json ? JSON.stringify(bericht) : JSON.stringify(bericht, null, 2));
    if (!o["ohne-halt"]) console.error(ok ? "ABNAHME ERFÜLLT" : "ABNAHME VERFEHLT");
    process.exitCode = ok ? 0 : 1;
  }
}
