#!/usr/bin/env node
/* ==========================================================================
   SICHERHEIT – Wiederherstellungsübung (interne Prüfung 2026-11, Prüfpunkt 9)

   Ende-zu-Ende mit den vorhandenen Werkzeugen, nur lokal, nur synthetische
   Daten (Personen „p1“ …), in einem Wegwerfordner:

     1. Ablage füllen (server/lib: zwei Betriebe, 40 Personen, Plan über
        sechs Monate → Kern + Monatsscherben, ein Zugangscode)
     2. Fingerabdruck des gelesenen Bestands und des Codes nehmen
     3. werkzeug/ablage-sicherung.mjs sichern  → pruefen (muss bestehen)
     4. Manipulierte Kopie der Sicherung (ein Byte) → pruefen muss scheitern
     5. Datenverlust: Store „centric“ gelöscht, eine Scherbe zerstört
        → der Bestand ist nicht mehr lesbar
     6. Wiederherstellen mit falschem Pfeffer → muss abgelehnt werden
     7. wiederherstellen --ersetzen → Fingerabdruck identisch, Code wieder
        auffindbar, werkzeug/ablage-pruefen.mjs ohne Befund
     8. Der beiseitegelegte Altinhalt (.vor-wiederherstellung-*) existiert

   Lesen und Schreiben laufen je in einem eigenen Kindprozess, damit kein
   Zwischenspeicher eines Moduls das Ergebnis schönt.

   Aufruf:  node werkzeug/sicherheit/wiederherstellung-uebung.mjs
   Ausgang: 0 = alle Schritte bestanden
   ========================================================================== */

import { spawnSync } from "node:child_process";
import { mkdtemp, rm, readdir, readFile, writeFile, cp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SELBST = fileURLToPath(import.meta.url);
const PFEFFER = "uebung-pfeffer-nur-synthetisch-0123456789";   // synthetisch, kein Betriebsgeheimnis
const RAUM = "uebung";
const CODE = "UEBG-AAAA-0001";

/* ---------------------------------------------------------- Kindschritte */
async function kind(schritt) {
  const imp = (p) => import(pathToFileURL(path.join(WURZEL, p)).href);
  const { getStore } = await imp("server/lib/ablage.mjs");
  const B = await imp("server/lib/bestand.mjs");
  const { kontoSchreiben, kontoLesen } = await imp("server/lib/konten.mjs");
  const { ablageSchluessel } = await imp("server/lib/codes.mjs");
  const store = getStore({ name: "centric", consistency: "strong" });
  if (schritt === "schreiben") {
    const person = (i, m) => ({ id: `${m}-p${i}`, vorname: `V${i}`, nachname: `N${i}`, rolle: i === 0 ? "leitung" : "mitarbeiter",
      bereich: "e1", zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }] });
    const betrieb = (id) => {
      const personen = Array.from({ length: 20 }, (_, i) => person(i, id));
      const abweichungen = {};
      for (let mo = 1; mo <= 6; mo++) for (const p of personen) for (const t of [3, 11, 19])
        abweichungen[`${p.id}|2026-${String(mo).padStart(2, "0")}-${String(t).padStart(2, "0")}`] = "F";
      return { id, name: `Betrieb ${id}`, einheiten: [{ id: "e1", name: "Station" }], personen, abweichungen,
        nachrichten: [], notrufe: [], anfragen: [] };
    };
    await B.bestandSchreiben(store, RAUM, { version: 9, mandanten: [betrieb("m-a"), betrieb("m-b")] }, { durch: "Uebung" });
    await kontoSchreiben(store, ablageSchluessel(CODE), { name: "Leitung", bestand: RAUM, rolle: "leitung",
      person: "m-a-p0", betrieb: 0, mandantId: "m-a", angelegt: "2026-01-01T00:00:00.000Z" });
    return;
  }
  if (schritt === "lesen") {
    let g = null, fehler = null;
    try { g = await B.bestandLesenStreng(store, RAUM); } catch (e) { fehler = e.code || e.message; }
    const b = g && g.bestand;
    const k = await kontoLesen(store, ablageSchluessel(CODE)).catch(() => null);
    const abdruck = b ? createHash("sha256").update(JSON.stringify(b.mandanten)).digest("hex") : null;
    const eintraege = b ? b.mandanten.reduce((s, m) => s + Object.keys(m.abweichungen || {}).length, 0) : 0;
    process.stdout.write(JSON.stringify({ abdruck, eintraege, fehler, code: !!(k && k.bestand === RAUM) }));
  }
}

/* ---------------------------------------------------------- Ablauf */
function lauf(args, env, erwartet = 0) {
  const r = spawnSync(process.execPath, args, { cwd: WURZEL, env: { ...process.env, ...env }, encoding: "utf8", timeout: 300_000 });
  return { ok: r.status === erwartet, status: r.status, aus: `${r.stdout || ""}${r.stderr || ""}` };
}

async function haupt() {
  const tmp = await mkdtemp(path.join(tmpdir(), "centric-wiederherstellung-"));
  const daten = path.join(tmp, "daten"), sich = path.join(tmp, "sicherungen");
  const env = { CENTRIC_DATEN: daten, CENTRIC_ABLAGE: "dateien", CENTRIC_PFEFFER: PFEFFER, PORT: "1" };
  const ergebnisse = [];
  const pruef = (name, ok, info = "") => { ergebnisse.push(ok); console.log(`${ok ? "BESTANDEN" : "FEHLER   "}  ${name}${info ? ` — ${info}` : ""}`); };
  const lesen = () => JSON.parse(lauf([SELBST, "--schritt", "lesen"], env).aus.trim().split("\n").pop() || "{}");
  try {
    const w = lauf([SELBST, "--schritt", "schreiben"], env);
    pruef("1 synthetische Ablage geschrieben", w.ok, w.ok ? "" : w.aus.slice(-300));
    const vorher = lesen();
    pruef("2 Fingerabdruck vorher", !!vorher.abdruck && vorher.code, `${vorher.eintraege} Planeinträge, Code ${vorher.code ? "da" : "fehlt"}`);

    const s = lauf(["werkzeug/ablage-sicherung.mjs", "sichern", "--quelle", daten, "--ziel", sich], env);
    const ordner = (await readdir(sich)).find((d) => d.startsWith("centric-sicherung-"));
    pruef("3 Sicherung erzeugt", s.ok && !!ordner, s.ok ? ordner : s.aus.slice(-300));
    const sOrdner = path.join(sich, ordner || "fehlt");
    const p = lauf(["werkzeug/ablage-sicherung.mjs", "pruefen", "--sicherung", sOrdner], env);
    pruef("3 Sicherung geprüft (Manifest, SHA-256)", p.ok, p.ok ? "" : p.aus.slice(-300));

    const kaputt = path.join(tmp, "manipuliert");
    await cp(sOrdner, kaputt, { recursive: true });
    const kernOrdner = path.join(kaputt, "daten", "centric");
    const opfer = (await readdir(kernOrdner)).find((d) => d.endsWith(".json"));
    const inhalt = await readFile(path.join(kernOrdner, opfer));
    inhalt[Math.floor(inhalt.length / 2)] ^= 0x01;
    await writeFile(path.join(kernOrdner, opfer), inhalt);
    const pk = lauf(["werkzeug/ablage-sicherung.mjs", "pruefen", "--sicherung", kaputt], env);
    pruef("4 manipulierte Sicherung wird erkannt", pk.status !== 0, `Ausgang ${pk.status}`);

    const centric = path.join(daten, "centric");
    const dateien = await readdir(centric);
    const scherbe = dateien.find((d) => /scherbe/.test(decodeURIComponent(d)));
    if (scherbe) await writeFile(path.join(centric, scherbe), "{kaputt");
    for (const d of dateien.filter((x) => x !== scherbe)) await rm(path.join(centric, d), { force: true });
    const verloren = lesen();
    pruef("5 Datenverlust simuliert (Bestand nicht mehr lesbar)", !verloren.abdruck || verloren.abdruck !== vorher.abdruck,
      `Fehler: ${verloren.fehler || "leer"}, Code ${verloren.code ? "da" : "weg"}`);

    const falsch = lauf(["werkzeug/ablage-sicherung.mjs", "wiederherstellen", "--sicherung", sOrdner, "--ziel", daten, "--ersetzen"],
      { ...env, CENTRIC_PFEFFER: "anderer-pfeffer-synthetisch-000000" });
    pruef("6 Wiederherstellung mit fremdem Pfeffer abgelehnt", falsch.status !== 0, `Ausgang ${falsch.status}`);

    const r = lauf(["werkzeug/ablage-sicherung.mjs", "wiederherstellen", "--sicherung", sOrdner, "--ziel", daten, "--ersetzen"], env);
    pruef("7 Wiederherstellung durchgelaufen", r.ok, r.ok ? "" : r.aus.slice(-400));
    const nachher = lesen();
    pruef("7 Bestand identisch (SHA-256 über alle Betriebe)", nachher.abdruck === vorher.abdruck, `${nachher.eintraege} Planeinträge`);
    pruef("7 Zugangscode wieder auffindbar", nachher.code === true);
    const ap = lauf(["werkzeug/ablage-pruefen.mjs", "--daten", daten, RAUM], env);
    pruef("7 ablage-pruefen ohne Befund", ap.ok, ap.ok ? "" : ap.aus.slice(-300));
    const beiseite = (await readdir(daten)).some((d) => d.startsWith(".vor-wiederherstellung-"));
    pruef("8 Altinhalt beiseitegelegt statt gelöscht", beiseite);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
  const fehl = ergebnisse.filter((x) => !x).length;
  console.log(`${ergebnisse.length - fehl} von ${ergebnisse.length} Schritten bestanden.`);
  return fehl ? 1 : 0;
}

const i = process.argv.indexOf("--schritt");
if (i >= 0) await kind(process.argv[i + 1]);
else process.exitCode = await haupt();
