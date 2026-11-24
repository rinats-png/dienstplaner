#!/usr/bin/env node
/* ==========================================================================
   NAECHSTES-PAKET — die ersten ausführbaren Pakete aus der SSOT (nur lesend)

     node werkzeug/naechstes-paket.mjs [--json] [--anzahl <n>]
     node werkzeug/naechstes-paket.mjs [--json] --parallel <n>      (n = 1 bis 3)

   Auswahl (docs/acc45/work-packages.json, über bereit() aus acc45-backlog.mjs):
   Status READY oder IN_PROGRESS mit offener Restarbeit, alle Abhängigkeiten
   INTEGRATED/VERIFIED/DONE, nicht extern (Betreiberpakete), nicht bedingt.
   BLOCKED-Pakete erscheinen nie. Rang: Priorität P0 vor P3, dann geringerer
   offener Aufwand (Mitte der Spanne), dann Paket-ID.

   Ausgabe: Paket, Priorität, Aufwand, Status, Notiz (kurz) und die
   Konfliktzonen (Hinweis: ein Schreiber zur Zeit, docs/acc45/AGENTS.md).

   --parallel <n>: Vorschlag (keine Zuweisung) für bis zu n Pakete, die
   untereinander konfliktfrei sind. Greedy in der Rangfolge oben. Zonen nur
   aus den SSOT-Feldern konfliktzonen und dateien (7 Namen aus KONFLIKTZONEN
   in acc45-backlog.mjs; Regeln beim Block "Konfliktzonen" unten). Ohne belegbare
   Zone gilt ein Paket als „Zone unbekannt“ und wird nur einzeln vorgeschlagen.
   Hartgrenze 3 (schreibende Agenten, AGENTS.md); n > 3 wird abgelehnt.
   --parallel 1 gibt dasselbe aus wie --anzahl 1.
   Das Prinzip (konfliktfreie Auswahl, Schreibbereich-Kollision) folgt
   KORDANT src/scheduler.mjs (MIT-Lizenz); die Umsetzung ist eigen.

   Exit 0 mit mindestens einem Paket, Exit 1 ohne ausführbares Paket,
   Exit 2 bei falschem Aufruf. Schreibt nichts, ruft kein Netz auf.
   ========================================================================== */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { paketeAus, bereit, restAufwand, notizKurz } from "./acc45-backlog.mjs";

const RANG = { P0: 0, P1: 1, P2: 2, P3: 3 };
const mitte = (s) => (s.min + s.max) / 2;
const spanne = (s) => (s.min === s.max ? `${s.min}` : `${s.min}–${s.max}`);

const rangListe = (pakete) => bereit(pakete)
  .map((p) => ({ p, rest: restAufwand(p) }))
  .sort((a, b) => (RANG[a.p.prio] ?? 9) - (RANG[b.p.prio] ?? 9) || mitte(a.rest) - mitte(b.rest) || a.p.id.localeCompare(b.p.id));
const kurz = ({ p, rest }) => ({
  id: p.id, titel: p.titel, prio: p.prio, status: p.status, strang: p.strang,
  aufwandPT: p.aufwandPT, restPT: rest, konfliktzonen: [...p.konfliktzonen], notiz: notizKurz(p),
});

/** Die ersten n ausführbaren Pakete, nach Priorität, dann offenem Aufwand, dann ID. */
export function naechste(pakete, n = 5) {
  return rangListe(pakete).slice(0, n).map(kurz);
}

/* ---- Konfliktzonen für --parallel ------------------------------------------
   Das Werkzeug liest nur die SSOT-Felder konfliktzonen und dateien. Die sieben
   Namen aus KONFLIKTZONEN (acc45-backlog.mjs) werden auf feste Pfade
   abgebildet. Nicht modelliert: die übrigen Zeilen der Dateibesitz-Tabelle
   in docs/acc45/AGENTS.md, die V4-3b-Byte-Pins und der Pin NACHTRAG_QS2
   (src/pruefung.jsx); sie wirken nur, wenn ein Paket die Datei in dateien
   nennt. Regeln (fail-closed, lieber "unbekannt" als clevere Logik):
   - Kanonisierung: Backslash zu /, Kleinschreibung, leere und "."-Segmente
     weg (linear), Punkte/Leerzeichen am Segmentende weg (NTFS), "..",
     UNC-Pfade (\\\\host\\...) und Laufwerke (C:) gelten als unbekannt.
     package-lock.json zählt als package.json.
   - Zwei Pfade überlappen, wenn die Segmentfolge des einen im anderen
     vorkommt (gleich, Verzeichnis darüber, Teilpfad wie lib/rechte.mjs gegen
     server/lib/rechte.mjs). Ein Schrägstrich am Ende (design/) ist ein
     Verzeichnisanspruch und deckt jede Datei darunter ab.
   - Ein nackter Dateiname (kein /, mit Endung, z. B. daten.mjs) hat keinen
     belegten Ort und überlappt per Basename mit jedem Anspruch gleichen Namens.
   - Alles andere (kein /, keine Endung, nicht in VERZEICHNIS; Freitext; ".github")
     ist "Zone unbekannt" und läuft nur einzeln.
   - "Tests" in dateien zählt als Anspruch auf package.json (scripts).
   Aufwand: |A|·|B| Vergleiche je Paarung; die Eingabe ist die vertrauenswürdige SSOT. */
export const MAX_PARALLEL = 3;
const ZONE_PFAD = Object.freeze({
  "App.jsx": "src/App.jsx", "daten.mjs": "server/funktionen/daten.mjs", "rechte.mjs": "server/lib/rechte.mjs",
  "sicht.mjs": "server/lib/sicht.mjs", "package.json": "package.json",
  "stempelintegritaet.mjs": "server/lib/stempelintegritaet.mjs", "src/ansichten": "src/ansichten/",
});
const VERZEICHNIS = /^(src|docs|e2e|deploy|server|werkzeug|pruefungen|public)$/;
const DATEI = /^[^./\\][^/\\]*\.\w+$/;
const pfadToken = (t) => /^[\w.\-*/\\]+$/.test(t) && !t.startsWith("\\\\") && (t.includes("/") || t.includes("\\") || DATEI.test(t) || VERZEICHNIS.test(t));

/** Kanonische Form eines Pfads; null bei "..", UNC oder leerem Ergebnis. */
export function kanon(t) {
  const roh = String(t).trim();
  if (roh.startsWith("\\\\")) return null;
  const teile = roh.replace(/\\/g, "/").toLowerCase().split("/").filter((s) => s !== "" && s !== ".");
  if (teile.includes("..")) return null;
  const sauber = teile.map((s) => s.replace(/[. ]+$/, ""));
  if (!sauber.length || sauber.includes("")) return null;
  return sauber.join("/").replace(/(^|\/)package-lock\.json$/, "$1package.json");
}

/** Ansprüche eines Pakets: [{pfad (kanonisch), label, nackt}] oder null (Zone unbekannt). Fail-closed. */
export function zonenAnspruch(p) {
  const out = [];
  const add = (roh, label) => {
    const k = kanon(roh);
    if (k === null) return false;
    out.push({ pfad: k, label, nackt: !/[/\\]/.test(roh) && DATEI.test(roh) });
    return true;
  };
  for (const z of p.konfliktzonen || []) if (!ZONE_PFAD[z] || !add(ZONE_PFAD[z], z)) return null;
  for (const t of String(p.dateien ?? "").split(/[,;]/).map((x) => x.trim()).filter(Boolean)) {
    if (t.toLowerCase() === "tests") { add("package.json", "package.json (scripts)"); continue; }
    if (!pfadToken(t) || !add(t, t)) return null;
  }
  return out.length ? out : null;
}

const basis = (x) => x.slice(x.lastIndexOf("/") + 1);
const enthalten = (a, b) => `/${a}/`.includes(`/${b}/`);
/** Glob: Überlappung, wenn der feste Anfang (vor *) des einen im anderen steckt. */
const globGleich = (a, b) => {
  const x = a.split("*")[0], y = b.split("*")[0];
  return (a.includes("*") && y.startsWith(x)) || (b.includes("*") && x.startsWith(y));
};
const gleichartig = (a, b) => enthalten(a, b) || enthalten(b, a) || globGleich(a, b);
/** Zwei Ansprüche überlappen; nackte Dateinamen vergleichen per Basename. */
const ueberlappt = (a, b) => (a.nackt || b.nackt ? gleichartig(a.nackt ? a.pfad : basis(a.pfad), b.nackt ? b.pfad : basis(b.pfad)) : gleichartig(a.pfad, b.pfad));
function konflikt(a, b) {
  for (const x of a) for (const y of b) if (ueberlappt(x, y)) return x.label !== x.pfad ? x.label : y.label;
  return null;
}

/** Bis zu n untereinander konfliktfreie Pakete (Greedy in der Rangfolge von naechste()). */
export function parallelWaehlen(pakete, n) {
  if (!Number.isInteger(n) || n < 1 || n > MAX_PARALLEL) throw new Error(`--parallel: 1 bis ${MAX_PARALLEL}`);
  const gewaehlt = [], ausgeschlossen = [];
  for (const r of rangListe(pakete)) {
    if (gewaehlt.length >= n) break;
    const x = kurz(r);
    const claim = zonenAnspruch(r.p);
    const eintrag = { x: { ...x, zonenBelegt: claim ? claim.map((c) => c.label) : null }, claim };
    if (!gewaehlt.length) { gewaehlt.push(eintrag); if (!claim) break; continue; }
    if (!claim) { ausgeschlossen.push({ id: x.id, grund: "Zone unbekannt (nur einzeln)" }); continue; }
    let grund = null;
    for (const g of gewaehlt) { const z = konflikt(g.claim, claim); if (z) { grund = `Konflikt mit ${g.x.id} in Zone ${z}`; break; } }
    if (grund) ausgeschlossen.push({ id: x.id, grund }); else gewaehlt.push(eintrag);
  }
  return { pakete: gewaehlt.map((g) => g.x), ausgeschlossen };
}

export function main(argv, say = (s) => console.log(s), pakete = null) {
  const json = argv.includes("--json");
  let n = 5;
  const i = argv.indexOf("--anzahl");
  if (i >= 0) { n = Number(argv[i + 1]); if (!Number.isInteger(n) || n < 1) { say("Aufruf: node werkzeug/naechstes-paket.mjs [--json] [--anzahl <n>]"); return 2; } }
  const pi = argv.indexOf("--parallel");
  const unbekannt = argv.filter((a, k) => a.startsWith("--") && !["--json", "--anzahl", "--parallel"].includes(a) && argv[k - 1] !== "--anzahl" && argv[k - 1] !== "--parallel");
  if (unbekannt.length) { say(`Unbekannte Option: ${unbekannt[0]}`); return 2; }
  if (pi >= 0) {
    const wert = argv[pi + 1] ?? "";
    if (i >= 0 || argv.indexOf("--parallel", pi + 1) >= 0 || !/^[1-9]\d*$/.test(wert) || Number(wert) > MAX_PARALLEL) {
      say(`Aufruf: node werkzeug/naechstes-paket.mjs [--json] --parallel <n> (n = 1 bis ${MAX_PARALLEL}, nicht mit --anzahl)`);
      return 2;
    }
    const m = Number(wert);
    if (m > 1) {
      const r = parallelWaehlen(pakete ?? paketeAus(), m);
      if (json) { say(JSON.stringify(r, null, 2)); return r.pakete.length ? 0 : 1; }
      if (!r.pakete.length) { say("Kein ausführbares Paket (READY oder IN_PROGRESS mit erfüllten Abhängigkeiten)."); return 1; }
      say(`Vorschlag (keine Zuweisung): ${r.pakete.length} von höchstens ${m} konfliktfreien Paketen`);
      r.pakete.forEach((x, k) => {
        say(`${k + 1}. ${x.id}  ${x.prio}  ${spanne(x.restPT)} PT offen  ${x.status}  ${x.strang}  ${x.titel}`);
        say(`   Zone: ${x.zonenBelegt ? x.zonenBelegt.join(", ") : "unbekannt (nur einzeln)"}`);
        say(`   Grund: Rang ${k + 1} nach Priorität${k ? ", ohne Überlappung mit den vorher gewählten" : ""}`);
      });
      if (r.ausgeschlossen.length) { say("Ausgeschlossen:"); r.ausgeschlossen.forEach((e) => say(`   ${e.id}: ${e.grund}`)); }
      return 0;
    }
    n = 1;
  }
  const liste = naechste(pakete ?? paketeAus(), n);
  if (json) { say(JSON.stringify(liste, null, 2)); return liste.length ? 0 : 1; }
  if (!liste.length) { say("Kein ausführbares Paket (READY oder IN_PROGRESS mit erfüllten Abhängigkeiten)."); return 1; }
  liste.forEach((x, k) => {
    say(`${k + 1}. ${x.id}  ${x.prio}  ${spanne(x.restPT)} PT offen  ${x.status}  ${x.strang}  ${x.titel}`);
    say(`   Konfliktzonen: ${x.konfliktzonen.join(", ") || "keine"}${x.konfliktzonen.length ? " (ein Schreiber zur Zeit, docs/acc45/AGENTS.md)" : ""}`);
    say(`   Notiz: ${x.notiz}`);
  });
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try { process.exitCode = main(process.argv.slice(2)); }
  catch (e) { console.error(`FEHLER: ${e.message}`); process.exitCode = 2; }
}
