#!/usr/bin/env node
/* ==========================================================================
   WP-48.1/48.2 MUTANTEN — jede eingebaute Schwäche muss eine Prüfung rot machen

   Baut je Mutant eine gezielte Schwäche in den Quelltext ein (Textersetzung,
   jede Suchstelle muss genau einmal vorkommen), lässt die zuständigen
   Prüfdateien laufen und stellt den Originaltext danach in jedem Fall wieder
   her (auch bei Fehler oder Strg-C). Ein Mutant ist „getötet", wenn der
   Prüflauf fehlschlägt; „überlebt" ist ein Befund.

   Aufruf:
     node werkzeug/wp48-mutanten.mjs                 # alle
     node werkzeug/wp48-mutanten.mjs --nur K3,K9     # einzelne
     node werkzeug/wp48-mutanten.mjs --liste         # nur auflisten
     node werkzeug/wp48-mutanten.mjs --pruefen       # nur prüfen, ob jede Ersetzung passt

   Rückgabe: 0 = alle getötet, 1 = mindestens einer überlebt, 2 = Aufruf- oder
   Ersetzungsfehler (Suchstelle nicht genau einmal gefunden).

   Läuft lokal einzeln (schwache Maschinen: ein Prüflauf nach dem anderen,
   --bail=1, großzügige Zeitgrenzen). Schreibt nur in die genannten
   Quelldateien und stellt sie wieder her; vor dem Start und am Ende wird
   geprüft, dass der Text wieder dem Original entspricht.
   ========================================================================== */

import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const KERN = ["pruefungen/wp48-speicherkern.test.js"];
const RUNDWEG = ["pruefungen/wp48-rundweg.test.js"];

/** @type {Array<{id: string, was: string, datei: string, ersetzungen: Array<[string, string]>, pruefungen: string[]}>} */
export const MUTANTEN = [
  /* --- Hash-Vermerk (48.2) --- */
  { id: "K1", was: "Abdruck einer Scherbe ohne Hash (Volltext wie vor 48.2)", datei: "server/lib/scherben.mjs",
    ersetzungen: [["return praefix(abdruckText(scherbe));", "return abdruckText(scherbe);"]], pruefungen: KERN },
  { id: "K2", was: "Abdruck des Kerns ohne Hash", datei: "server/lib/scherben.mjs",
    ersetzungen: [["return praefix(JSON.stringify(kern) ?? \"undefined\");", "return JSON.stringify(kern) ?? \"undefined\";"]], pruefungen: KERN },
  { id: "K3", was: "alte Text-Vermerke nicht übersetzt", datei: "server/lib/scherben.mjs",
    ersetzungen: [["wert.startsWith(\"{\")) return praefix(wert);", "wert.startsWith(\"{\")) return wert;"]], pruefungen: KERN },
  { id: "K4", was: "unklarer Vermerkeintrag übergangen statt Vermerk verworfen (fail-open)", datei: "server/lib/bestand.mjs",
    ersetzungen: [["    if (n === null) return null;\n    aus[id] = n;", "    if (n === null) continue;\n    aus[id] = n;"]], pruefungen: KERN },
  { id: "K5", was: "Vermerk-Aufräumen nach einem Sprung fehlt", datei: "server/lib/bestand.mjs",
    ersetzungen: [["  if (aufraeumenVoll) {", "  if (false) {"]], pruefungen: KERN },
  /* --- Lesecache (48.2) --- */
  { id: "K6", was: "Lesecache über die Sperre hinaus (ein Gedächtnis für alle Sperren)", datei: "server/lib/bestand.mjs",
    ersetzungen: [["  const kontext = sperrKontext(raum);\n  if (!kontext || !store", "  const kontext = LESECACHE;\n  if (!kontext || !store"]], pruefungen: KERN },
  { id: "K7", was: "Lesecache ohne Prüfung der Platte (Marke)", datei: "server/lib/bestand.mjs",
    ersetzungen: [["if (vorher && marke !== null && vorher.marke === marke)", "if (vorher)"]], pruefungen: KERN },
  { id: "K8", was: "Lesecache über das eigene Schreiben hinaus (kein Leeren, keine Prüfung)", datei: "server/lib/bestand.mjs",
    ersetzungen: [["if (vorher && marke !== null && vorher.marke === marke)", "if (vorher)"],
      ["function lesecacheLeeren(raum) {\n  const k = sperrKontext(raum);", "function lesecacheLeeren(raum) {\n  const k = null && sperrKontext(raum);"]], pruefungen: KERN },
  { id: "K9", was: "Lesecache gibt das gemerkte Objekt selbst heraus (keine Kopie)", datei: "server/lib/bestand.mjs",
    ersetzungen: [["jeAblage.set(store, { marke, wert: structuredClone(erg) });", "jeAblage.set(store, { marke, wert: erg });"],
      ["return structuredClone(vorher.wert);", "return vorher.wert;"]], pruefungen: KERN },
  /* --- Segmentschreiber (48.2) --- */
  { id: "K10", was: "Segmentschreiber ohne compare-and-set", datei: "server/lib/bestand.mjs",
    ersetzungen: [["  if (String(erwarteterStand) !== String(stand)) return { ok: false, grund: \"konflikt\"", "  if (false) return { ok: false, grund: \"konflikt\""]], pruefungen: KERN },
  { id: "K11", was: "Segmentschreiber ignoriert die Epoche", datei: "server/lib/bestand.mjs",
    ersetzungen: [["  if (erwarteteEpoche !== epoche)\n", "  if (false)\n"]], pruefungen: KERN },
  { id: "K12", was: "Schlüssel eines fremden Monats in einer Scherbe zugelassen", datei: "server/lib/bestand.mjs",
    ersetzungen: [["if (monatVon(k) !== s.monat) throw", "if (monatVon(k) === null) throw"]], pruefungen: KERN },
  { id: "K13", was: "Kern mit Monatsdaten zugelassen", datei: "server/lib/bestand.mjs",
    ersetzungen: [["if (zerlegen(k).scherben.size) throw", "if (false) throw"]], pruefungen: KERN },
  { id: "K14", was: "unbekanntes Feld in einer Scherbe zugelassen (z. B. Freeze/Protokoll)", datei: "server/lib/bestand.mjs",
    ersetzungen: [["Object.keys(s.felder).some((f) => !MONATSFELDER.includes(f))", "false"]], pruefungen: KERN },
  { id: "K15", was: "Segmentschreiber ohne Journal (Schritte direkt)", datei: "server/lib/bestand.mjs",
    ersetzungen: [["  await festschreiben(store, raum, schritte, neuerStand, zeit);\n  return { ok: true, stand: String(neuerStand), geschrieben, epoche };",
      "  await schritteAusfuehren(store, schritte);\n  return { ok: true, stand: String(neuerStand), geschrieben, epoche };"]], pruefungen: KERN },
  { id: "K16", was: "unberührte Abdrücke nicht aus dem Vermerk übernommen", datei: "server/lib/bestand.mjs",
    ersetzungen: [["const abdNeu = { ...abd, kern: kernAbdruck(kernNeu) };", "const abdNeu = { kern: kernAbdruck(kernNeu) };"]], pruefungen: KERN },
  { id: "K17", was: "leere Scherbe wird geschrieben statt entfernt", datei: "server/lib/bestand.mjs",
    ersetzungen: [["    if (leer) {\n      if (!(id in abd)) continue;", "    if (false) {\n      if (!(id in abd)) continue;"]], pruefungen: KERN },
  { id: "K18", was: "unklarer Stand der Platte (kein Vermerk) trotzdem geschrieben", datei: "server/lib/bestand.mjs",
    ersetzungen: [["  if (!abd) return unbestimmt;", "  if (false) return unbestimmt;"]], pruefungen: KERN },
  /* --- Epoche (48.2) --- */
  { id: "K19", was: "Wiederherstellen ohne neue Epoche", datei: "server/funktionen/daten.mjs",
    ersetzungen: [["erwarteterStand: jetztGelesen.stand, neueEpoche: true,", "erwarteterStand: jetztGelesen.stand, neueEpoche: false,"]], pruefungen: KERN },
  { id: "K20", was: "Epoche wird nicht übernommen (bei jedem Schreiben neu)", datei: "server/lib/bestand.mjs",
    ersetzungen: [["    ? epocheKern : neueEpoche();", "    ? neueEpoche() : neueEpoche();"]], pruefungen: KERN },
  { id: "K21", was: "Wiederanlauf ohne neue Epoche", datei: "server/lib/bestand.mjs",
    ersetzungen: [["    epoche = neueEpoche();\n    wiederanlauf = true;", "    wiederanlauf = true;"]], pruefungen: KERN },
  { id: "K22", was: "Epoche nur im Kern, nicht im Zeiger", datei: "server/lib/bestand.mjs",
    ersetzungen: [["wert: { nr: neuerStand, zeit, epoche } });\n\n  await festschreiben(store, raum, schritte, neuerStand, zeit, opt.aufraeumenVoll);",
      "wert: { nr: neuerStand, zeit } });\n\n  await festschreiben(store, raum, schritte, neuerStand, zeit, opt.aufraeumenVoll);"]], pruefungen: KERN },
  /* --- Integration mit WP-16 und Review-Auflagen --- */
  { id: "S1", was: "Segmentschreiber speichert die Sitzung im Kern (kein Entfernen)", datei: "server/lib/bestand.mjs",
    ersetzungen: [["const k = ohneSitzung(teile.kern);", "const k = teile.kern;"]], pruefungen: KERN },
  { id: "S2", was: "Betriebskennung locker (Umwandlung in Text, keine Formprüfung)", datei: "server/lib/bestand.mjs",
    ersetzungen: [["const bekannt = new Set(ids.filter(betriebIdGueltig));", "const bekannt = new Set(ids.map(String));"],
      ["!betriebIdGueltig(s.mandantId) || !bekannt.has(s.mandantId)", "!bekannt.has(String(s.mandantId))"]], pruefungen: KERN },
  { id: "S3", was: "Epoche im Segmentschreiber optional", datei: "server/lib/bestand.mjs",
    ersetzungen: [["  if (!epocheGueltig(erwarteteEpoche))\n    return Promise.reject", "  if (false)\n    return Promise.reject"],
      ["  if (erwarteteEpoche !== epoche)\n", "  if (erwarteteEpoche && erwarteteEpoche !== epoche)\n"]], pruefungen: KERN },
  { id: "S4", was: "leeres spätes Feld (istEingefroren) im Abdrucktext", datei: "server/lib/scherben.mjs",
    ersetzungen: [["if (!schluessel.length && SPAETE_FELDER.has(feld)) continue;", ""]], pruefungen: KERN },
  { id: "S5", was: "Schlüssel im Abdrucktext ohne Maskierung (M4)", datei: "server/lib/scherben.mjs",
    ersetzungen: [["return sicher ? k : ", "return k; // "]], pruefungen: KERN },
  { id: "S6", was: "Text zwischen WP-16 und WP-48 (leeres spätes Feld) nicht übersetzt", datei: "server/lib/scherben.mjs",
    ersetzungen: [["wert.replace(/\\|istEingefroren:0:$/, \"\")", "wert"]], pruefungen: KERN },
  { id: "S7", was: "doppelte Betriebskennung im Kern zugelassen", datei: "server/lib/bestand.mjs",
    ersetzungen: [["if (new Set(ids).size !== ids.length) throw", "if (false) throw"]], pruefungen: KERN },
  /* --- Rundweg-Invariante (48.1): das Netz fängt Rückfälle der Schreibkette --- */
  { id: "R1", was: "Planung/Leitung: verborgene Felder nicht aus dem Gespeicherten (vollRueckfuellen)", datei: "server/lib/rechte.mjs",
    ersetzungen: [["      if (!sichtbar(k)) aus[k] = v;", "      if (!sichtbar(k)) continue;"]], pruefungen: RUNDWEG },
  { id: "R2", was: "Schichtverantwortung: nicht mitgeschickte Felder nicht aus dem Gespeicherten", datei: "server/lib/rechte.mjs",
    ersetzungen: [["    if (!hat(neuM, feld)) { if (hat(altM, feld)) aus[feld] = a; continue; }", "    if (!hat(neuM, feld)) { continue; }"]], pruefungen: RUNDWEG },
  { id: "R3", was: "PUT gleicht den gespeicherten Stand vor dem Zusammenführen nicht an (WP-12)", datei: "server/funktionen/daten.mjs",
    ersetzungen: [["zusammenfuehren(jetzt ? personenAngleichen(jetzt.bestand) : null, bestand, s,", "zusammenfuehren(jetzt ? jetzt.bestand : null, bestand, s,"]], pruefungen: RUNDWEG },
];

function argWert(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}

function anwenden(text, ersetzungen, id) {
  let aus = text;
  for (const [alt, neu] of ersetzungen) {
    const n = aus.split(alt).length - 1;
    if (n !== 1) throw new Error(`${id}: Suchstelle ${n}× statt 1× gefunden: ${alt.slice(0, 80)}`);
    aus = aus.replace(alt, () => neu);
  }
  return aus;
}

async function main() {
  const nur = argWert("--nur");
  const auswahl = nur ? MUTANTEN.filter((m) => nur.split(",").includes(m.id)) : MUTANTEN;
  if (process.argv.includes("--liste")) {
    for (const m of auswahl) console.log(`${m.id}\t${m.datei}\t${m.was}`);
    return 0;
  }
  if (!auswahl.length) { console.error("Keine Mutanten ausgewählt."); return 2; }

  /* Vorab: Jede Ersetzung muss passen — sonst nichts anfassen. */
  const original = new Map();
  for (const m of auswahl) {
    const datei = path.join(WURZEL, m.datei);
    if (!original.has(datei)) original.set(datei, readFileSync(datei, "utf8"));
    anwenden(original.get(datei), m.ersetzungen, m.id);
  }
  if (process.argv.includes("--pruefen")) { console.log(`${auswahl.length} Mutanten anwendbar.`); return 0; }
  const wiederherstellen = () => { for (const [d, t] of original) writeFileSync(d, t); };
  for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => { wiederherstellen(); process.exit(130); });

  const ergebnis = [];
  try {
    for (const m of auswahl) {
      const datei = path.join(WURZEL, m.datei);
      writeFileSync(datei, anwenden(original.get(datei), m.ersetzungen, m.id));
      const a = Date.now();
      const r = spawnSync(process.execPath, [path.join(WURZEL, "node_modules", "vitest", "vitest.mjs"), "run", ...m.pruefungen,
        "--bail=1", "--testTimeout=120000", "--hookTimeout=120000"], { cwd: WURZEL, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
      writeFileSync(datei, original.get(datei));
      const rot = r.status !== 0;
      const zeile = (`${r.stdout || ""}\n${r.stderr || ""}`).split("\n").find((z) => /^\s*×/.test(z)) || "";
      ergebnis.push({ id: m.id, was: m.was, getoetet: rot, durch: zeile.trim().replace(/^×\s*/, "").slice(0, 110), s: Math.round((Date.now() - a) / 1000) });
      console.log(`${rot ? "getötet " : "ÜBERLEBT"}  ${m.id}  ${m.was}  (${Math.round((Date.now() - a) / 1000)} s)${zeile ? `\n          rot: ${zeile.trim().slice(0, 140)}` : ""}`);
    }
  } finally {
    wiederherstellen();
  }
  for (const [d, t] of original) if (readFileSync(d, "utf8") !== t) { console.error(`Nicht wiederhergestellt: ${d}`); return 2; }
  const ueber = ergebnis.filter((e) => !e.getoetet);
  console.log(`\n${ergebnis.length - ueber.length} von ${ergebnis.length} Mutanten getötet.`);
  if (process.argv.includes("--json")) console.log(JSON.stringify(ergebnis));
  return ueber.length ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((c) => process.exit(c), (e) => { console.error(String(e && e.message || e)); process.exit(2); });
}
