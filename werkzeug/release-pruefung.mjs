#!/usr/bin/env node
/* ==========================================================================
   RELEASE-PRÜFUNG (REL-1) — Gates G1 bis G10 für einen Release-Kandidaten

   Prüft maschinenlesbar, ob ein Kandidat (Bild-Commit plus Bild-Digest)
   ausgeliefert werden darf, und gibt GO oder NO-GO mit Begründung je Gate aus.
   Richtlinie: docs/acc45/RELEASE-PROZESS.md.

   Das Werkzeug ändert nichts: kein VPS, kein SSH, kein Deploy, kein Workflow,
   kein Schreiben ins Repository. Netz nur im Online-Modus und nur lesend
   (`gh api` GET: Check-Runs, PR-Autor und Reviews). Git nur lesend und lokal.

   Grundsatz fail-closed: Fehlt eine Angabe, ist sie unlesbar oder
   widersprüchlich, ist das Gate NO-GO.

   Was woher gelesen wird (online):
     - aus dem KANDIDATEN-Commit (`git show <kandidat>:<pfad>`): Server-Code
       (Schalternamen), Release-Vorlagen, RELEASE-UNFERTIG.json,
       RELEASE-SCHALTER.json, SSOT, REVIEW-NACHWEIS*.md, Oberflächenkonstante;
     - aus HEAD (`git show HEAD:<pfad>`): nur deploy/FREIGEGEBENE-IMAGES.md,
       der Abnahmebericht der Listenzeile und die Freigabedatei. HEAD muss
       den Kandidaten enthalten und darf seitdem nur diese Pfade ändern.

     G1  CI: auf genau dem Kandidaten-SHA sind alle Pflicht-Check-Runs grün;
         jeder Lauf zählt (ein roter Lauf bleibt rot); eigene Gate-Jobs nicht
     G2  Review: jeder PR im Paket hat einen Beleg (GitHub-Review eines anderen
         Kontos, Tabelle in REVIEW-NACHWEIS*.md mit letzter Aussage positiv,
         SSOT-Stufe reviewt = true) oder ist vom Betreiber bestätigt; jeder
         Commit ohne PR ist NO-GO, außer akzeptiert (akzeptierteCommits)
     G3  Schalter: jeder CENTRIC_-Name im Server-Code ist in
         RELEASE-SCHALTER.json klassifiziert; Schalter und unfertige Funktionen
         (RELEASE-UNFERTIG.json) sind in keiner Release-Vorlage aktiv
     G4  Bild: Digest vollständig, Bildangaben mit Abfragezeit, Revisionslabel
         und SLSA-Provenienz = Kandidat, Freigabeliste gültig, Zeile `aktiv`
     G5  Migration: Startschreibvorgänge W-1…W-9 und Startblock gegen die Basis
         (Migrationsbericht); geändert oder neu ⇒ NO-GO bis Betreiberfreigabe
     G6  Sicherung, Restore-Probe, Widerrufbuch-Probe: vollständig und aktuell
     G7  Rückweg: Zeile `vorherig` oder dokumentierte Entscheidung O-1/O-2;
         `ruecksprung` NO-GO, wenn Basis oder Zeile `vorherig` ein Bild ohne
         Revisionslabel ist (ohneRevisionslabel: 274bfa0) oder die Basis fehlt
     G8  SSOT: kein P0/P1-Paket mit Status außer DONE/INTEGRATED/VERIFIED (auch
         CI_FAILED, unbekannt oder fehlend blockiert), dessen PR im Paket steckt (außer akzeptiertePakete mit Grund);
         prio außer genau P0–P3 (auch fehlend) blockiert wie P0/P1; pr eines solchen Pakets keine Liste "#123" ⇒ NO-GO;
         jede Paket-ID in ssotPakete von RELEASE-UNFERTIG.json steht in der SSOT;
         „nur hinter Schalter AUS“ nur für PRs aus ssotPrs (fehlt: keine Aussage); ssotPrs nur mit ssotPakete, jeder
         Eintrag genau "#123" und im pr eines genannten Pakets, sonst NO-GO
     G9  keine offenen P0/P1-Befunde (Strang folge, ABN-*, V4-*; Präfix nach NFKC,
         Groß-/Kleinschreibung, Unicode-Bindestrich → „-“; die bekannten REL-Pakete
         (REL_AUSNAHME_IDS, exakt) sind der Release-Prozess selbst und zählen nicht,
         jede andere ID mit Präfix REL- ⇒ NO-GO (Review #486 H-b); akzeptierteBefunde mit Grund);
         unbekannte oder fehlende prio blockiert wie P0/P1; ein offenes P0/P1-Paket
         mit fehlendem/unbekanntem strang (STRAENGE) oder ID außerhalb ID_MUSTER ⇒ NO-GO
     G8/G9: ein Eintrag in pakete, der kein Objekt ist ⇒ NO-GO (nicht still übersprungen)
     G10 Freigabedatei docs/acc45/releases/<id>.freigabe.json gültig, commitet,
         passend; Stand HEAD = Kandidat + nur Freigabepfade

   Aufruf:
     node werkzeug/release-pruefung.mjs --kandidat <bild-commit> --basis <voriger-release-commit>
         --digest sha256:<64 hex> --release-id <id> --bild-info <datei.json>
         [--nachweise <verzeichnis>] [--wurzel <repo>] [--kurz]
     node werkzeug/release-pruefung.mjs --offline --fixture <datei.json> --wurzel <verz>
         [--jetzt <ISO-Zeit>] [...]   (Beispiel: pruefungen/fixtures/release-pruefung-beispiel.json)
     node werkzeug/release-pruefung.mjs --konfig-zeigen

   Die Konfiguration steht nur in dieser Datei (KONFIG_STANDARD); Änderungen
   nur per PR mit Review. Es gibt bewusst kein --konfig.

   Ausgabe: JSON auf stdout (Gates, Gesamt, modus, uebersteuert,
   vorpruefungOk, Konfiguration). Kurzfassung auf stderr.
   Rückgabe: 0 GO (nur online, echte Uhr) · 1 NO-GO · 2 Aufruf-, Lese- oder
   Strukturfehler · 3 alle Gates GO, aber übersteuert (offline/Fixture oder
   --jetzt) — nie freigabefähig. --konfig-zeigen: 0 (nur Anzeige).
   ========================================================================== */
import { readFileSync, existsSync, readdirSync, lstatSync } from "node:fs";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

export const VERSION = 2;

/** SSOT-Status, die als erledigt gelten (Schema: werkzeug/acc45-backlog.mjs STATUS). Jeder andere Status ist offen. */
export const ERLEDIGT_STATUS = Object.freeze(["DONE", "INTEGRATED", "VERIFIED"]);
/** Bekannte SSOT-Prioritäten (Schema: werkzeug/acc45-backlog.mjs PRIOS, per Test gebunden). Review #477 H3: Eine
 *  andere oder fehlende prio eines offenen Pakets blockiert in G8/G9 (fail-closed), statt als „nicht P0/P1“ zu gelten. */
export const PRIO_STUFEN = Object.freeze(["P0", "P1", "P2", "P3"]);
/** Blockierende Prioritäten; G8 und G9 teilen dieselbe Liste (wie ERLEDIGT_STATUS). */
export const BLOCKER_PRIOS = Object.freeze(["P0", "P1"]);
/** PR-Verweis in SSOT (pr) und RELEASE-UNFERTIG.json (ssotPrs): genau "#123" (Schema: acc45-backlog.mjs PR_MUSTER). */
export const PR_MUSTER = /^#[1-9]\d*$/;
/** Bekannte SSOT-Stränge (Schema: acc45-backlog.mjs STRAENGE, per Test gebunden). Review #483 H2: G9 erkennt Befunde
 *  auch am Strang; ein fehlender oder anders geschriebener strang eines offenen P0/P1-Pakets blockiert (fail-closed). */
export const STRAENGE = Object.freeze(["acc45", "wp19", "intelligence", "folge", "extern"]);
/** Paket-ID (Schema: acc45-backlog.mjs ID_MUSTER, per Test gebunden). Review #483 H2: G9 blockiert ein offenes P0/P1-Paket
 *  mit anderer ID (Unicode-Bindestrich, Leerzeichen, Steuerzeichen), weil seine Befund-Zuordnung nicht sicher ist. */
export const ID_MUSTER = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
/** Review #486 H-b: G9-Ausnahme „Release-Prozess selbst“ nur für diese bekannten Pakete (exakte ID, Stand SSOT
 *  2026-11-23: REL-0, REL-0c, REL-1 bis REL-4). Ein anderes offenes P0/P1-Paket mit exaktem Präfix REL- (z. B. REL-ABN-1,
 *  REL-5) umgeht G9 nicht mehr: NO-GO, bis die Liste per PR mit Review ergänzt ist (fail-closed). */
export const REL_AUSNAHME_IDS = Object.freeze(["REL-0", "REL-0c", "REL-1", "REL-2", "REL-3", "REL-4"]);
/** Präfix der Release-Prozess-Pakete (exakt, ohne Normalisierung; „rel-1“ ist kein REL-Paket). */
export const REL_PRAEFIX = "REL-";

export const KONFIG_STANDARD = Object.freeze({
  repo: "rinats-png/dienstplaner",
  // Check-Runs der Workflows Prüfung, Sicherheit, Lieferkette und Betrieb: Deploy-Skripte (Stand 2026-11-20).
  pflichtChecks: [
    "pruefen", "browser-abnahme", "abhaengigkeiten", "geheimnisse", "interne-pruefung", "muster",
    "shellcheck", "compose", "caddy-vorlage", "skripte", "bild-scan",
  ],
  // Für Nicht-Pflicht-Check-Runs sind diese Abschlüsse unschädlich (Pflicht-Checks: nur success).
  ciUnschaedlich: ["success", "skipped", "neutral"],
  // Eigene Jobs des Release-Gates (RELEASE-PROZESS Anhang A.2) zählen in G1 nicht mit.
  eigeneChecks: ["release-gate"],
  reviewNachweisPraefix: "REVIEW-NACHWEIS",
  // Sammel-PRs (Zweig release/…, integration/…, main) decken die Commits darin NICHT ab.
  sammelZweig: "^(release|integration|main)(/|$)",
  schalterSuche: ["server", "server.mjs"],
  schalterDatei: "docs/acc45/RELEASE-SCHALTER.json",
  schalterKlassen: ["schalter-aus", "standard-an", "sicher-aktiv", "freigabepflichtig", "konfiguration"],
  // Diese Vorlagen müssen NODE_ENV=production setzen (Faktorpflicht, Epochenbindung hängen daran).
  nodeEnvPflicht: ["deploy/compose.yml", "Dockerfile"],
  vorlagen: [
    { pfad: ".env.example", art: "env", pflicht: true },
    { pfad: "deploy/compose.yml", art: "compose", pflicht: true },
    { pfad: "Dockerfile", art: "dockerfile", pflicht: true },
    { pfad: "deploy/staging-o2/env.staging.beispiel", art: "env", pflicht: false },
    { pfad: "deploy/staging-o2/compose.yml", art: "compose", pflicht: false },
  ],
  ausWerte: ["", "aus", "false", "0", "nein", "off"],
  unfertigDatei: "docs/acc45/RELEASE-UNFERTIG.json",
  freigabeListe: "deploy/FREIGEGEBENE-IMAGES.md",
  // Spiegel von EINGEBAUT_GESPERRT in deploy/freigabe-lib.sh.
  gesperrtEingebaut: [
    { digest: "sha256:f03a8514db6f07db5617e6818edd6505f0607d52ffcf5f985c862cfefc9c5a79", commit: "64d08a4957c5374e1f04c17be2b75162c07573d2" },
    { digest: "sha256:0861adee", commit: "1a56988d3c406aff99281f96c2d7da1dc24d7af7" },
  ],
  // Bilder ohne Revisionslabel org.opencontainers.image.revision (vor WP-03; Produktionsweg §1.1 Befund 3). Sie sind
  // nie Rücksprungziel (G7, OF-13): digest-pruefen.sh lässt sie nur mit --ohne-label zu, und der Forced Command lässt
  // --ohne-label nicht zu (deploy/deploy.sh:93). Ist die Basis eines dieser Bilder (erste Auslieferung), gilt bildseitig
  // nur R0 (Produktionsweg §3.3): das neue Bild schreibt beim ersten Start in data/ (W-1…W-9).
  ohneRevisionslabel: [
    { digest: "sha256:0b1929273a79d6c010c9a0303b0d624a8e61e3555df77c08773bd573dd3e452f", commit: "274bfa0baca5681f383eea334aab69875f31d5c1" },
  ],
  provenienzPflicht: true,
  bildInfoMaxTage: 7,
  // Startschreibvorgänge (docs/acc45/PRODUKTIONSWEG-VORBEREITUNG-2026-11-20.md 3.2).
  startschreibvorgaenge: [
    { id: "W-1", was: "Ablagesperre .prozess", quellen: ["server/lib/prozesssperre.mjs"] },
    { id: "W-2", was: "Schreibhalt-Kanal in zustand/", quellen: ["server/lib/schreibhalt.mjs"] },
    { id: "W-3", was: "Betreibersitzungen ohne zweiten Faktor beenden", quellen: ["server/lib/betreiber-zweifaktor.mjs", "server/lib/sitzungen.mjs"] },
    { id: "W-4", was: "Widerrufbuch der Zugangscodes anlegen und nachziehen", quellen: ["server/lib/widerrufbuch.mjs"] },
    { id: "W-5", was: "Konto-Widerrufbuch einsammeln und nachziehen", quellen: ["server/lib/kontowiderrufbuch.mjs"] },
    { id: "W-6", was: "Schlüsselepoche: Bindung erneuern", quellen: ["server/lib/schluesselepoche.mjs"] },
    { id: "W-7", was: "Löschlauf Testbetriebe", quellen: ["server/lib/aufraeumen.mjs"] },
    { id: "W-8", was: "Datenschutzlauf (Vermerk, Löschen nur mit Schalter)", quellen: ["server/lib/datenschutzlauf.mjs"] },
    { id: "W-9", was: "Speicherkern: Standvermerke beim Schreiben", quellen: ["server/lib/scherben.mjs", "server/lib/bestand.mjs", "server/lib/ablage.mjs"] },
  ],
  startblockQuellen: ["server.mjs"],
  sicherung: { sicherungMaxStunden: 26, restoreProbeMaxTage: 35, widerrufbuchProbeMaxTage: 35, widerrufbuchProbePflicht: true },
  ssot: "docs/acc45/work-packages.json",
  // G8 und G9 (Endurteil #427 A1): blockierend ist jeder Status, der NICHT in `erledigt` steht — auch CI_FAILED und
  // jeder unbekannte oder fehlende Status (fail-closed). Beide Gates teilen dieselbe Liste (ERLEDIGT_STATUS).
  // Review #477 H3: dazu blockiert jede prio außerhalb PRIO_STUFEN (Schreibweise, Leerzeichen, fehlend), fail-closed.
  blocker: { prios: BLOCKER_PRIOS, erledigt: ERLEDIGT_STATUS },
  befund: { straenge: ["folge"], idMuster: ["^ABN-", "^V4-"], ausnahmePraefix: REL_PRAEFIX, ausnahmeIds: REL_AUSNAHME_IDS, prios: BLOCKER_PRIOS, erledigt: ERLEDIGT_STATUS },
  freigabeVerzeichnis: "docs/acc45/releases",
  // „Gepusht“: origin muss dieses GitHub-Repository sein, und ein Freigabezweig muss genau auf HEAD zeigen.
  repoUrlMuster: "^(?:https://github\\.com/|git@github\\.com:|ssh://git@github\\.com/)rinats-png/dienstplaner(?:\\.git)?/?$",
  freigabeZweige: ["main"],
  // Seit dem Kandidaten dürfen in HEAD nur diese Pfade geändert sein (Listen-PR, Freigabedatei).
  erlaubtNachKandidat: ["docs/acc45/releases/", "deploy/FREIGEGEBENE-IMAGES.md"],
  // Ohne diese Gates ist die Vorprüfung (Phase 0) vollständig; sie folgen in der Endprüfung.
  endpruefungGates: ["G4", "G6", "G7", "G10"],
  // Compose lädt diese Dateien selbst (auch override); jede gefundene muss eine geprüfte Vorlage sein (G3).
  composeMuster: "(^|/)(docker-)?compose[^/]*\\.ya?ml$",
  composeSuche: ["deploy"],
  // Vorlagenbindung (G3): jede Datei dieser Art im Wurzelverzeichnis und unter deploy/ muss hier stehen; ihr
  // SHA-256 (Inhalt im Kandidaten) muss in der Freigabedatei unter vorlagenHashes stehen.
  gebundeneVorlagen: [".env.example", "Dockerfile", "deploy/compose.yml", "deploy/sicherung/env.beispiel",
    "deploy/sicherung/widerrufbuch.env.beispiel", "deploy/staging-o2/compose.yml", "deploy/staging-o2/env.staging.beispiel",
    "deploy/staging-o2/sicherung.env.beispiel", "deploy/staging-o2/widerrufbuch.env.beispiel"],
  vorlagenArt: "^(Dockerfile.*|(docker-)?compose.*\\.ya?ml|.*\\.env.*|\\.env.*|env\\..*|.*env.*\\.beispiel)$",
  vorlagenSuche: ["deploy"],
  composeWurzel: ["compose.yml", "compose.yaml", "docker-compose.yml", "docker-compose.yaml",
    "compose.override.yml", "compose.override.yaml", "docker-compose.override.yml", "docker-compose.override.yaml"],
});

const HEX40 = /^[0-9a-f]{40}$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const DATUM = /^\d{4}-\d{2}-\d{2}$/;
const RELEASE_ID = /^[a-z0-9][a-z0-9._-]{2,63}$/;
// Steuerzeichen in Pfaden (N1, Review #437, Delta-Check #437): Steuerzeichen (Cc: C0, DEL, C1), Formatzeichen (Cf:
// u. a. Richtungsumkehr, Nullbreite, BOM) und Zeilen-/Absatztrenner (Zl, Zp: U+2028/U+2029). Ein solcher Pfad im
// Wurzelverzeichnis oder unter deploy/ ist NO-GO.
const STEUERZEICHEN = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;
// Für jede Ausgabe (JSON, Kurzfassung, stderr): alle Zeichen der Klassen C (Steuer-, Format-, private, nicht
// vergebene Zeichen, Surrogate), Zl, Zp und jedes besondere Leerzeichen außer dem normalen werden als Escape
// geschrieben, nie roh (keine Terminal- oder Log-Injektion).
const UNSICHER = /[\p{C}\p{Zl}\p{Zp}]|(?! )\p{Zs}/gu;
const KURZ = { "\n": "\\n", "\r": "\\r", "\t": "\\t" };
const escape = (z) => {
  const n = z.codePointAt(0);
  return KURZ[z] ?? (n > 0xffff ? `\\u{${n.toString(16)}}` : "\\u" + n.toString(16).padStart(4, "0"));
};
/** Text für die Ausgabe: unsichere Zeichen als Escape; „\“ bleibt (idempotent). */
export const sicher = (s) => String(s).replace(UNSICHER, escape);
/** Pfad für die Ausgabe: zusätzlich „\“ verdoppelt, damit ein Escape im Namen eindeutig bleibt. */
const maskiert = (f) => sicher(String(f).replace(/\\/g, "\\\\"));
/** Alle Zeichenketten eines JSON-Werts (auch Schlüssel) über sicher(). */
function tiefSicher(x) {
  if (typeof x === "string") return sicher(x);
  if (Array.isArray(x)) return x.map(tiefSicher);
  if (istObjekt(x)) return Object.fromEntries(Object.entries(x).map(([k, v]) => [sicher(k), tiefSicher(v)]));
  return x;
}

const gate = (id, name) => ({ id, name, ergebnis: "GO", gruende: [], belege: [], manuell: [] });
const nogo = (g, grund) => { g.ergebnis = "NO-GO"; g.gruende.push(grund); return g; };
const istObjekt = (x) => x != null && typeof x === "object" && !Array.isArray(x);
const prNummer = (x) => Number(String(x).replace(/^#/, ""));

/* ---------------------------------------------------------------- Hilfen */

function lesenPfad(p) {
  try { return readFileSync(resolve(p), "utf8"); } catch { return null; }
}

function jsonLesen(text) {
  if (text == null) return { wert: null, fehler: "fehlt" };
  try { return { wert: JSON.parse(text), fehler: null }; } catch (e) { return { wert: null, fehler: "kein gültiges JSON: " + e.message }; }
}

function tiefSuchen(obj, passt, tiefe = 0, aus = []) {
  if (obj == null || typeof obj !== "object" || tiefe > 40) return aus;
  for (const [k, v] of Object.entries(obj)) {
    const t = passt(k, v);
    if (t !== undefined) aus.push(t);
    if (v && typeof v === "object") tiefSuchen(v, passt, tiefe + 1, aus);
  }
  return aus;
}

/* ------------------------------------------------- Freigabeliste (G4, G7) */

export function freigabelisteLesen(text, eingebaut = KONFIG_STANDARD.gesperrtEingebaut) {
  const fehler = [];
  const zeilen = [];
  if (text == null) return { zeilen, fehler: ["Freigabeliste fehlt oder ist unlesbar"] };
  for (const roh of text.split(/\r?\n/)) {
    if (!/^\s*\|/.test(roh) || !/sha256/.test(roh)) continue;
    const zeile = roh.replace(/\s+$/, "");
    const teile = zeile.split("|");
    if (!/^\|\s*`sha256:[0-9a-f]+`\s*\|/.test(zeile) || teile.length !== 8 || !zeile.endsWith("|")) {
      fehler.push(`ungültige Zeile: ${zeile.slice(0, 120)}`);
      continue;
    }
    const [digest, commit, datum, bericht, status, grund] = teile.slice(1, 7).map((f) => f.replace(/`/g, "").trim());
    const z = { digest, commit, datum, bericht, status, grund };
    if (!["aktiv", "vorherig", "gesperrt"].includes(status)) fehler.push(`unbekannter Status '${status}' bei ${digest}`);
    if (status === "gesperrt") {
      if (!/^sha256:[0-9a-f]{8,64}$/.test(digest)) fehler.push(`gesperrter Digest zu kurz: ${digest}`);
      if (!grund) fehler.push(`gesperrt ohne Grund: ${digest}`);
    } else if (!DIGEST.test(digest)) fehler.push(`Digest bei '${status}' nicht vollständig: ${digest}`);
    if (!HEX40.test(commit)) fehler.push(`Commit nicht 40 Hex: ${commit} (${digest})`);
    if (!DATUM.test(datum)) fehler.push(`Datum nicht JJJJ-MM-TT: ${datum} (${digest})`);
    zeilen.push(z);
  }
  if (zeilen.filter((z) => z.status === "aktiv").length > 1) fehler.push("mehr als eine Zeile aktiv");
  if (zeilen.filter((z) => z.status === "vorherig").length > 1) fehler.push("mehr als eine Zeile vorherig");
  const sperren = [...eingebaut, ...zeilen.filter((z) => z.status === "gesperrt")];
  for (const z of zeilen.filter((x) => x.status !== "gesperrt")) {
    if (sperren.some((s) => z.digest.startsWith(s.digest) || (s.commit && z.commit === s.commit))) {
      fehler.push(`${z.status} trägt einen gesperrten Digest oder Commit: ${z.digest}`);
    }
  }
  if (zeilen.length === 0 && fehler.length === 0) fehler.push("Freigabeliste ohne Tabellenzeilen");
  return { zeilen, fehler };
}

export function gesperrt(digest, zeilen, eingebaut = KONFIG_STANDARD.gesperrtEingebaut) {
  return [...eingebaut, ...zeilen.filter((z) => z.status === "gesperrt")].some((s) => digest.startsWith(s.digest));
}

/* --------------------------------------------------------------- G1 — CI */

export function g1Ci(checkRuns, kandidat, konfig) {
  const g = gate("G1", "CI voll grün auf dem Kopf-SHA");
  if (!Array.isArray(checkRuns)) return nogo(g, "keine Check-Runs abrufbar (fail-closed)");
  const ungueltig = checkRuns.filter((c) => !istObjekt(c) || typeof c.name !== "string");
  if (ungueltig.length) nogo(g, `${ungueltig.length} ungültige Check-Run-Einträge`);
  const runs = checkRuns.filter((c) => istObjekt(c) && typeof c.name === "string" && !konfig.eigeneChecks.includes(c.name));
  if (runs.length === 0) return nogo(g, "keine Check-Runs auf diesem Commit");
  const fremd = runs.filter((c) => c.head_sha !== kandidat);
  if (fremd.length) nogo(g, `${fremd.length} Check-Runs ohne head_sha oder zu einem anderen Commit`);
  // Jeder Lauf zählt: ein roter oder laufender Lauf auf demselben Kopf bleibt NO-GO.
  const jeName = new Map();
  for (const c of runs) jeName.set(c.name, [...(jeName.get(c.name) || []), c]);
  for (const name of konfig.pflichtChecks) {
    const l = jeName.get(name);
    if (!l) { nogo(g, `Pflicht-Check fehlt: ${name}`); continue; }
    const schlecht = l.filter((c) => c.status !== "completed" || c.conclusion !== "success");
    if (schlecht.length) nogo(g, `Pflicht-Check ${name}: ${schlecht.map((c) => c.status !== "completed" ? c.status : c.conclusion).join(", ")}`);
    else g.belege.push(`${name}: success (${l.length} Lauf/Läufe)`);
  }
  for (const [name, l] of jeName) {
    if (konfig.pflichtChecks.includes(name)) continue;
    for (const c of l) {
      if (c.status !== "completed") nogo(g, `Check ${name} läuft noch (${c.status})`);
      else if (!konfig.ciUnschaedlich.includes(c.conclusion)) nogo(g, `Check ${name}: ${c.conclusion}`);
    }
  }
  return g;
}

/* ----------------------------------------------------------- G2 — Review */

// Echte Positivform (geschlossenes Vokabular). Ein Urteil wird an „;“, „→“, „,“, „(“, „)“, „—“, „–“ in Teile zerlegt.
// Erlaubt ist nur: optional am Anfang „N Runden“ oder „Runde N“; danach nur Teile aus VERLAUF; der letzte Teil aus
// SCHLUSS. Jedes andere Wort (Bedingung, Vorbehalt, Verneinung, Name, Hinweis) macht das Urteil zu „kein Beleg“.
const RUNDEN = /^(?:\d+\s+Runden?|Runde\s+\d+)$/i;
const VERLAUF = /^(?:Delta\s+)?(?:MIT AUFLAGEN|MERGE-MIT-AUFLAGEN|NICHT MERGEN|MERGEBAR|MERGE-OK)$/i;
const AUFLAGE = /^(?:Delta\s+)?(?:MIT AUFLAGEN|MERGE-MIT-AUFLAGEN)$/i;
const SCHLUSS = /^(?:Delta\s+)?(?:MERGEBAR|MERGE-OK|erledigt)\.?$/i;

/** Bewertet ein Urteil nach der echten Positivform; alles andere ist kein Beleg (im Zweifel nein). */
export function urteilPositiv(urteil) {
  const teile = String(urteil).split(/[;→,()—–]/).map((x) => x.trim()).filter(Boolean);
  if (!teile.length) return false;
  if (RUNDEN.test(teile[0])) teile.shift();
  if (!teile.length || !SCHLUSS.test(teile[teile.length - 1])) return false;
  // „erledigt“ heißt nur etwas direkt nach einer Auflage (die Auflagen sind erledigt).
  if (/erledigt/i.test(teile[teile.length - 1]) && !(teile.length >= 2 && AUFLAGE.test(teile[teile.length - 2]))) return false;
  return teile.slice(0, -1).every((x) => VERLAUF.test(x));
}

/**
 * PR-Nummern mit positivem Urteil aus den Tabellen in REVIEW-NACHWEIS*.md. Dateien nach Namen (Datum) geordnet;
 * die LETZTE Aussage je PR zählt (eine spätere negative Zeile hebt eine frühere positive auf). Gelesen werden nur
 * Tabellen mit einer Kopfzeile, deren erste Zelle „PR“ ist und die eine Spalte „Urteil“ hat; die Spalte gilt nur
 * für diese Tabelle (eine Zeile ohne „|“ beendet sie). Erste Zelle einer Datenzeile: `#N` oder `#N Titel`.
 */
export function reviewNachweiseLesen(texte) {
  const belegt = new Map();
  const sortiert = [...texte].sort((a, b) => String(a.datei).localeCompare(String(b.datei)));
  for (const { datei, text } of sortiert) {
    let spalte = -1; // keine gültige Tabelle offen
    for (const zeile of String(text ?? "").split(/\r?\n/)) {
      if (!/^\s*\|/.test(zeile)) { spalte = -1; continue; }
      // Zellen an nicht maskierten Strichen trennen; \| ist ein Strich im Zelltext.
      const zellen = zeile.trim().replace(/^\|/, "").replace(/(?<!\\)\|$/, "").split(/(?<!\\)\|/).map((z) => z.replace(/\\\|/g, "|").trim());
      if (/^:?-{3,}:?$/.test(zellen[0] || "")) continue; // Trennzeile
      const m = /^#(\d+)\b/.exec(zellen[0] || "");
      if (!m) {
        // jede andere Zeile ist eine Kopfzeile: neue Tabelle
        const i = zellen.findIndex((z) => /urteil/i.test(z));
        spalte = /^PR$/i.test(zellen[0] || "") && i > 0 ? i : -1;
        continue;
      }
      if (spalte < 0 || zellen.length <= spalte) continue;
      const urteil = zellen[spalte];
      const nr = Number(m[1]);
      if (urteilPositiv(urteil)) belegt.set(nr, `${datei}: ${zellen[0]} — ${urteil}`);
      else belegt.delete(nr);
    }
  }
  return belegt;
}

/** PR-Nummern der SSOT-Pakete mit Statusstufe reviewt = true. */
export function ssotReviewBelege(ssot) {
  const m = new Map();
  for (const p of Array.isArray(ssot?.pakete) ? ssot.pakete : []) {
    if (!istObjekt(p) || p?.stufen?.reviewt?.wert !== true) continue;
    for (const x of Array.isArray(p.pr) ? p.pr : []) {
      const nr = prNummer(x);
      if (Number.isInteger(nr) && !m.has(nr)) m.set(nr, `SSOT ${p.id} reviewt: ${String(p.stufen.reviewt.beleg || "").slice(0, 80)}`);
    }
  }
  return m;
}

const PR_MERGE = /^Merge pull request #(\d+) from (\S+)/;
const PR_SQUASH = /\((?:PR )?#(\d+)\)\s*$/;

/** PR-Nummern aus den Betreffs: „Merge pull request #N“ und Squash „… (#N)“ / „… (PR #N)“. Nur Kandidaten — belegt erst die GitHub-Bestätigung. */
export function prsAusCommits(commits) {
  const s = new Set();
  for (const c of commits || []) {
    if (!istObjekt(c)) continue;
    const b = String(c.betreff || "");
    const m = PR_MERGE.exec(b) || PR_SQUASH.exec(b);
    if (m) s.add(Number(m[1]));
  }
  return [...s].sort((a, b) => a - b);
}

/**
 * Commits im Bereich ohne PR. Ein Betreff allein belegt nichts (er ist frei wählbar): Ein Merge- oder
 * Squash-Commit zählt nur, wenn GitHub den PR bestätigt (`bestaetigung[N]`: gemergt, mergeCommit = dieser Commit).
 * Die Zweigseite (M^1..M^2) eines bestätigten Merges zählt nur mit den Commits, die GitHub für den PR nennt, und
 * nicht bei Sammel-PRs (Zweig release/…, integration/…, main).
 * bestaetigung: { [N]: { gemergt: boolean, mergeCommit: sha, zweig: headRef, commits: [sha] } }
 */
export function commitsOhnePr(commits, konfig = KONFIG_STANDARD, bestaetigung = {}) {
  const liste = (commits || []).filter((c) => istObjekt(c) && typeof c.sha === "string");
  const nachSha = new Map(liste.map((c) => [c.sha, c]));
  const vorfahren = (start) => {
    const s = new Set();
    const stapel = [start];
    while (stapel.length) {
      const x = stapel.pop();
      if (!x || s.has(x) || !nachSha.has(x)) continue;
      s.add(x);
      for (const p of nachSha.get(x).eltern || []) stapel.push(p);
    }
    return s;
  };
  const sammel = new RegExp(konfig.sammelZweig);
  const best = istObjekt(bestaetigung) ? bestaetigung : {};
  const abgedeckt = new Set();
  for (const c of liste) {
    const b = String(c.betreff || "");
    const m = PR_MERGE.exec(b) || PR_SQUASH.exec(b);
    if (!m) continue;
    const p = best[m[1]];
    if (!istObjekt(p) || p.gemergt !== true || p.mergeCommit !== c.sha) continue;
    abgedeckt.add(c.sha);
    const prCommits = new Set(Array.isArray(p.commits) ? p.commits : []);
    if (PR_MERGE.test(b) && (c.eltern || []).length >= 2 && !sammel.test(String(p.zweig || ""))) {
      const links = vorfahren(c.eltern[0]);
      for (const x of vorfahren(c.eltern[1])) if (!links.has(x) && prCommits.has(x)) abgedeckt.add(x);
    }
  }
  return liste.filter((c) => !abgedeckt.has(c.sha)).map((c) => ({ sha: c.sha, betreff: String(c.betreff || "") }));
}

const REVIEW_ROLLEN = ["OWNER", "MEMBER", "COLLABORATOR"];

/**
 * Liegt ein GitHub-Review vor, das zählt? Gültig sind nur Reviews mit Konto (nicht der Autor), mit Rolle
 * OWNER/MEMBER/COLLABORATOR. Je Reviewer zählt der letzte Stand; APPROVED zählt nur auf dem aktuellen PR-Kopf
 * (`commit_id` = `head.sha`). Ein offenes CHANGES_REQUESTED eines gültigen Reviewers hebt alles auf.
 */
function githubFreigabe(a) {
  if (!istObjekt(a) || typeof a.kopf !== "string" || !a.kopf || typeof a.autor !== "string" || !a.autor) return null;
  const reviews = Array.isArray(a.reviews) ? a.reviews : [];
  const letzter = new Map();
  for (const r of reviews) {
    if (!istObjekt(r) || typeof r.autor !== "string" || !r.autor || r.autor === a.autor) continue;
    if (!REVIEW_ROLLEN.includes(r.assoc)) continue;
    if (r.state === "APPROVED" || r.state === "CHANGES_REQUESTED" || r.state === "DISMISSED") letzter.set(r.autor, r);
  }
  const zustaende = [...letzter.values()];
  if (zustaende.some((r) => r.state === "CHANGES_REQUESTED")) return null;
  return zustaende.find((r) => r.state === "APPROVED" && r.commit === a.kopf)?.autor ?? null;
}

export function g2Review({ prs, commitsOhnePr: ohne, anzahlCommits, prAngaben = {}, dokBelege = new Map(), ssotBelege = new Map(), freigabe = null }) {
  const g = gate("G2", "Unabhängiges Review je PR, kein Commit ohne PR");
  if (!Array.isArray(prs) || !Array.isArray(ohne)) return nogo(g, "PR- oder Commit-Liste des Kandidaten nicht ermittelbar (fail-closed)");
  const anzahl = Number.isInteger(anzahlCommits) ? anzahlCommits : prs.length + ohne.length;
  if (anzahl === 0) return nogo(g, "leerer Commit-Bereich Basis..Kandidat — ein leeres Paket ist nie GO");
  const bestaetigt = new Set((freigabe?.reviewBestaetigt || []).map(Number));
  for (const nr of prs) {
    const a = prAngaben?.[nr] || prAngaben?.[String(nr)];
    const fremd = githubFreigabe(a);
    if (fremd) { g.belege.push(`#${nr}: GitHub-Review APPROVED von ${fremd}`); continue; }
    if (dokBelege.has(nr)) { g.belege.push(`#${nr}: ${dokBelege.get(nr)}`); continue; }
    if (ssotBelege.has(nr)) { g.belege.push(`#${nr}: ${ssotBelege.get(nr)}`); continue; }
    if (bestaetigt.has(nr)) { g.belege.push(`#${nr}: vom Betreiber in der Freigabedatei bestätigt`); continue; }
    g.manuell.push(`#${nr}`);
  }
  const akzeptiert = (freigabe?.akzeptierteCommits || []).filter((a) => a?.grund && /^[0-9a-f]{40}$/.test(a.sha || ""));
  const offeneCommits = [];
  for (const c of ohne) {
    const a = akzeptiert.find((x) => c.sha === x.sha);
    if (a) g.belege.push(`Commit ${c.sha.slice(0, 10)} ohne PR, akzeptiert: ${a.grund}`);
    else { offeneCommits.push(c); g.manuell.push(`Commit ${c.sha.slice(0, 10)} ${c.betreff.slice(0, 60)}`); }
  }
  const prsOffen = g.manuell.filter((m) => m.startsWith("#"));
  if (prsOffen.length) {
    const kurz = prsOffen.slice(0, 20).join(", ") + (prsOffen.length > 20 ? ` … (${prsOffen.length - 20} weitere, Liste in manuelleBestaetigungen)` : "");
    nogo(g, `${prsOffen.length} PR(s) ohne maschinell prüfbaren Review-Beleg; Betreiber bestätigt sie in reviewBestaetigt der Freigabedatei: ${kurz}`);
  }
  if (offeneCommits.length) {
    nogo(g, `${offeneCommits.length} Commit(s) ohne PR im Paket (Freigabe nur über akzeptierteCommits mit Grund): ${offeneCommits.slice(0, 10).map((c) => c.sha.slice(0, 10)).join(", ")}`);
  }
  return g;
}

/* ---------------------------------------------------------- G3 — Schalter */

/** Alle CENTRIC_-Namen im Server-Code (auch indirekt gelesene). */
export function codeNamenFinden(texte) {
  const s = new Set();
  for (const t of texte) for (const m of String(t ?? "").matchAll(/\bCENTRIC_[A-Z0-9_]*[A-Z0-9]\b/g)) s.add(m[0]);
  return [...s].sort();
}

/** Entfernt einen Zeilenkommentar „ # …“ außerhalb von Anführungszeichen. */
function kommentarWeg(z) {
  let q = null;
  for (let i = 0; i < z.length; i++) {
    const c = z[i];
    if (q) { if (c === q) q = null; continue; }
    if (c === '"' || c === "'") { q = c; continue; }
    if (c === "#" && (i === 0 || /\s/.test(z[i - 1]))) return z.slice(0, i).replace(/\s+$/, "");
  }
  return z;
}

const NAME = "[A-Za-z_][A-Za-z0-9_]*";
// Werte, die in YAML keine einfache Zeichenkette sind (Block, Anker, Verweis, Tag, Flow) — nie als gelesen werten.
const KEIN_SKALAR = /^[{[|>&*!]/;
// Steuerwörter, die Werte aus anderen Dateien holen. Erlaubt ist nur genau `env_file: .env`.
const STEUERWORT = /(?:^|[^A-Za-z0-9_])["']?(env_file|extends|include)["']?\s*:/;
const ERLAUBTES_ENV_FILE = /^\s+env_file:\s*(["']?)\.env\1\s*$/;

/**
 * Zerlegt eine Vorlage in logische Zeilen. Kommentarzeilen werden VOR jedem Verbinden entfernt.
 * Zeilenfortsetzung mit „\“ gibt es nur im Dockerfile (wie bei Docker); dort ist eine fortgesetzte physische Zeile
 * mit „#“ und eine offene Fortsetzung am Dateiende unlesbar. In env und compose gibt es keine Fortsetzung; dort
 * wird ein Zeilenkommentar „ # …“ entfernt, die „\“/„$“-Prüfung sieht aber die ganze physische Zeile.
 * Liefert [{ z, pruefText, unlesbarGrund }].
 */
function logischeZeilen(text, art) {
  const alle = String(text ?? "").split(/\r?\n/);
  const aus = [];
  if (art === "dockerfile") {
    // Parser-Direktiven (# syntax=, # escape=, # check=) ändern, wie Docker die Datei liest. Erlaubt ist nur
    // genau „# syntax=docker/dockerfile:1“ als erste Zeile; jede andere Direktive ist unlesbar.
    alle.forEach((z, i) => {
      if (/^\s*#\s*(syntax|escape|check)\s*=/i.test(z) && !(i === 0 && z.trimEnd() === "# syntax=docker/dockerfile:1")) {
        aus.push({ z: z.trim(), pruefText: z, unlesbarGrund: "Parser-Direktive" });
      }
    });
  }
  const physisch = alle.filter((z) => z.trim() && !/^\s*#/.test(z));
  if (art !== "dockerfile") return [...aus, ...physisch.map((roh) => ({ z: kommentarWeg(roh), pruefText: roh, unlesbarGrund: null }))];
  let puffer = null;
  let grund = null;
  for (const z of physisch) {
    const fort = /\\[ \t]*$/.test(z);
    if (fort && z.includes("#")) grund = "Fortsetzung mit #";
    // Docker verbindet ohne Leerzeichen: nur das „\“ (und Leerraum dahinter) fällt weg.
    const teil = fort ? z.replace(/\\[ \t]*$/, "") : z;
    puffer = puffer == null ? teil : puffer + teil;
    if (!fort) { aus.push({ z: puffer, pruefText: puffer, unlesbarGrund: grund }); puffer = null; grund = null; }
  }
  if (puffer != null) aus.push({ z: puffer, pruefText: puffer, unlesbarGrund: "offene Fortsetzung am Dateiende" });
  return aus;
}

// Dockerfile: nur diese Anweisungen; CMD nur in der bekannten Form; kein ENTRYPOINT, SHELL, ONBUILD, ADD, STOPSIGNAL.
const DOCKER_ANWEISUNGEN = ["FROM", "ARG", "ENV", "WORKDIR", "COPY", "RUN", "USER", "EXPOSE", "HEALTHCHECK", "LABEL", "VOLUME", "CMD"];
const DOCKER_CMD = ['CMD ["node", "server.mjs"]'];

/**
 * Anweisungs- und Formregeln je Format (ohne Parsing): compose ohne „!“ außerhalb von Anführungszeichen (YAML-Tags)
 * und ohne command/entrypoint; Dockerfile nur bekannte Anweisungen, CMD nur in bekannter Form; env ohne COMPOSE_*.
 */
function formErlaubt(z, art) {
  if (art === "compose") {
    let q = null;
    for (const c of z) {
      if (q) { if (c === q) q = null; continue; }
      if (c === '"' || c === "'") { q = c; continue; }
      if (c === "!") return false;
    }
    return !/(?:^|[\s{,])["']?(command|entrypoint)["']?\s*:/.test(z);
  }
  if (art === "dockerfile") {
    const wort = (/^\s*([A-Za-z]+)/.exec(z) || [])[1];
    if (!wort || !DOCKER_ANWEISUNGEN.includes(wort.toUpperCase())) return false;
    if (wort.toUpperCase() === "CMD") return DOCKER_CMD.includes(z.trim());
    return true;
  }
  if (art === "env") return !/\bCOMPOSE_[A-Z0-9_]*/i.test(z);
  return true;
}

/**
 * „\“ und „$“ sind in Vorlagen nur in wenigen benannten Formen erlaubt, die die echten Vorlagen brauchen
 * (Stand 2026-11-21, je 0 Fehlalarme):
 *   compose     `image: <ref>@${NAME:?Meldung}` und `NAME: ${NAME:?Meldung}` (gleicher Name, nicht überwacht)
 *   dockerfile  `NAME=$NAME` / `NAME=${NAME}` in ENV (gleicher Name, nicht überwacht); die Fortsetzung „\“ am
 *               Zeilenende ist vorher aufgelöst
 *   env         keine
 * Jede andere Zeile mit „\“ oder „$“ ist unlesbar (fail-closed), gleich ob ein überwachter Name darin steht.
 */
function dollarUndBackslashErlaubt(z, art, istUeberwacht) {
  if (!/[\\$]/.test(z)) return true;
  if (z.includes("\\")) return false;
  if (art === "compose") {
    const bild = /^\s+image:\s+[^\s$"'\\]+@\$\{([A-Z_][A-Z0-9_]*):\?[^}$\\]*\}\s*$/.exec(z);
    if (bild) return !istUeberwacht(bild[1]);
    const pflicht = /^\s+([A-Z_][A-Z0-9_]*):\s+\$\{\1:\?[^}$\\]*\}\s*$/.exec(z);
    return !!pflicht && !istUeberwacht(pflicht[1]);
  }
  if (art === "dockerfile") {
    if (!/^\s*ENV\s/i.test(z)) return false;
    const rest = z.replace(/\b([A-Z_][A-Z0-9_]*)=\$(?:\{([A-Z_][A-Z0-9_]*)\}|([A-Z_][A-Z0-9_]*))(?=\s|$)/g,
      (ganz, n, a, b) => (n === (a || b) && !istUeberwacht(n) ? `${n}=X` : ganz));
    return !rest.includes("$");
  }
  return false; // env: keine Form mit „$“
}

/**
 * Liest eine Vorlage nach einer festen, kleinen Grammatik (Allowlist). Jede Zeile, die einen überwachten Namen
 * (CENTRIC_*, NODE_ENV, Variablen unfertiger Funktionen) enthält und nicht genau einer bekannten Form entspricht,
 * ist „unlesbar“ (fail-closed); ebenso jedes Steuerwort außer `env_file: .env`. Bezüge `$X` und `${X…}` zählen
 * nicht als Vorkommen. Bekannte Formen:
 *   env         NAME=wert | export NAME=wert
 *   compose     ␣NAME: skalar | ␣"NAME": skalar | ␣- NAME=wert | ␣- "NAME=wert" | key: { NAME: skalar, … } | key: ["NAME=wert", …]
 *   dockerfile  ENV|ARG NAME=wert [NAME=wert …] | ENV NAME wert | ARG NAME
 * Liefert { funde: [[Name, Rohwert]] in Dateireihenfolge (jeder Fund einzeln), unlesbar: [Zeile] }.
 */
export function vorlageAuswerten(text, art, ueberwacht = []) {
  const funde = [];
  const unlesbar = [];
  const argVorgaben = new Map();
  const istUeberwacht = (n) => /^CENTRIC_/.test(n) || /^NODE_/.test(n) || ueberwacht.includes(n);
  const vorkommen = (z) => [...z.matchAll(/(?<!\$\{?)\b([A-Z][A-Z0-9_]*)\b/g)].map((m) => m[1]).filter(istUeberwacht);
  for (const { z, pruefText, unlesbarGrund } of logischeZeilen(text, art)) {
    if (unlesbarGrund || !dollarUndBackslashErlaubt(pruefText, art, istUeberwacht) || !formErlaubt(pruefText, art)) { unlesbar.push(z.trim()); continue; }
    const gelesen = [];
    let m;
    if (art === "env") {
      if ((m = new RegExp(`^\\s*(?:export\\s+)?(${NAME})\\s*=(.*)$`).exec(z))) gelesen.push([m[1], m[2].trim()]);
    } else if (art === "compose") {
      if (STEUERWORT.test(z) && !ERLAUBTES_ENV_FILE.test(z)) { unlesbar.push(z.trim()); continue; }
      if ((m = new RegExp(`^\\s+(["']?)(${NAME})\\1:\\s+(\\S.*)$`).exec(z)) && !KEIN_SKALAR.test(m[3].trim())) {
        gelesen.push([m[2], m[3].trim()]);
      } else if ((m = new RegExp(`^\\s+-\\s+(["']?)(${NAME})=(.*)\\1\\s*$`).exec(z))) {
        gelesen.push([m[2], m[3]]);
      } else if ((m = /^\s*(["']?)[A-Za-z_-]+\1:\s*\{([^{}[\]]*)\}\s*$/.exec(z))) {
        for (const teil of m[2].split(",")) {
          const p = new RegExp(`^\\s*(["']?)(${NAME})\\1\\s*:\\s*(.*?)\\s*$`).exec(teil);
          if (p && !KEIN_SKALAR.test(p[3])) gelesen.push([p[2], p[3]]);
        }
      } else if ((m = /^\s*(["']?)[A-Za-z_-]+\1:\s*\[([^{}[\]]*)\]\s*$/.exec(z))) {
        for (const teil of m[2].split(",")) {
          const p = new RegExp(`^\\s*(["']?)(${NAME})=(.*?)\\1\\s*$`).exec(teil);
          if (p) gelesen.push([p[2], p[3]]);
        }
      }
    } else if (art === "dockerfile") {
      if ((m = /^\s*(ENV|ARG)\s+(.*)$/i.exec(z))) {
        const rest = m[2].trim();
        const istArg = m[1].toUpperCase() === "ARG";
        const paar = new RegExp(`(${NAME})=("[^"]*"|'[^']*'|\\S*)`, "g");
        if (/=/.test(rest) && rest.replace(paar, "").trim() === "") {
          for (const p of rest.matchAll(paar)) {
            if (istArg) { argVorgaben.set(p[1], p[2]); gelesen.push([p[1], p[2]]); continue; }
            const bezug = /^\$\{?([A-Za-z_][A-Za-z0-9_]*)\}?$/.exec(p[2]);
            gelesen.push([p[1], bezug && argVorgaben.has(bezug[1]) ? argVorgaben.get(bezug[1]) : p[2]]);
          }
        } else if (!/=/.test(rest)) {
          const p = new RegExp(`^(${NAME})(?:\\s+(.*))?$`).exec(rest);
          if (p && !istArg && p[2] !== undefined) gelesen.push([p[1], p[2].trim()]);
          else if (p && istArg && p[2] === undefined) gelesen.push([p[1], ""]);
        }
      }
    }
    const schluessel = new Set(gelesen.map(([k]) => k));
    if (vorkommen(z).some((n) => !schluessel.has(n))) { unlesbar.push(z.trim()); continue; }
    for (const [k, v] of gelesen) funde.push([k, v]);
  }
  return { funde, unlesbar };
}

/** Map Name → Rohwert (letzter Fund); nur zur Anzeige. G3 bewertet jeden Fund einzeln (vorlageAuswerten). */
export function vorlageLesen(text, art) {
  return new Map(vorlageAuswerten(text, art).funde);
}

/** Nicht sicher lesbare Zeilen einer Vorlage (siehe vorlageAuswerten). */
export function vorlageUnlesbar(text, art, ueberwacht = []) {
  return vorlageAuswerten(text, art, ueberwacht).unlesbar;
}

/**
 * Wert einer Vorlage, wie er wirkt: Anführungszeichen weg; `<…>`, `${X}`, `${X:?…}`, `$X` sind Platzhalter (null,
 * der Wert kommt aus der .env); `${X:-w}`, `${X-w}`, `${X:=w}`, `${X=w}` liefern den Vorgabewert w; `${X:+w}`,
 * `${X+w}` liefern w (vorsichtig: so, als sei X gesetzt).
 */
export function wertAufloesen(roh) {
  if (roh == null) return null;
  let w = String(roh).trim().replace(/^(["'])(.*)\1$/, "$2").trim();
  for (let i = 0; i < 10; i++) {
    const vorgabe = /^\$\{[A-Za-z_][A-Za-z0-9_]*:?[-=+](.*)\}$/.exec(w);
    if (vorgabe) { w = vorgabe[1].trim().replace(/^(["'])(.*)\1$/, "$2"); continue; }
    break;
  }
  if (/^<[^>]*>$/.test(w) || /^\$\{[^}]*\}$/.test(w) || /^\$[A-Za-z_][A-Za-z0-9_]*$/.test(w)) return null;
  return w;
}

/** Weicht der Wert vom Erlaubten ab? Vergleich wie im Server: trim und Kleinschreibung. Platzhalter: nein. */
export function abweichend(roh, erlaubt) {
  const w = wertAufloesen(roh);
  if (w == null) return false;
  const n = w.trim().toLowerCase();
  if (n === "") return false;
  return !erlaubt.map((x) => String(x).toLowerCase()).includes(n);
}

export function g3Schalter({ codeNamen, klassen, vorlagen, unfertig, quelltexte, freigabe = null, composeDateien, vorlagenStand }, konfig) {
  const g = gate("G3", "Schalter Standard AUS, unfertige Funktionen nicht aktiv");
  if (!Array.isArray(codeNamen) || codeNamen.length === 0) nogo(g, "keine CENTRIC_-Namen im Server-Code gefunden (fail-closed)");
  if (!istObjekt(klassen?.variablen)) return nogo(g, `${konfig.schalterDatei} fehlt oder ist ungültig (fail-closed)`);
  if (!istObjekt(unfertig) || !Array.isArray(unfertig.funktionen)) return nogo(g, `${konfig.unfertigDatei} fehlt oder ist ungültig (fail-closed)`);
  const kl = klassen.variablen;
  for (const [name, e] of Object.entries(kl)) {
    if (!istObjekt(e) || !konfig.schalterKlassen.includes(e.klasse)) nogo(g, `${konfig.schalterDatei}: ${name} ohne gültige Klasse`);
  }
  const unklassifiziert = (codeNamen || []).filter((n) => !Object.hasOwn(kl, n));
  if (unklassifiziert.length) nogo(g, `unklassifizierte CENTRIC_-Namen im Server-Code (in ${konfig.schalterDatei} einordnen): ${unklassifiziert.join(", ")}`);
  const freigegeben = new Map((Array.isArray(freigabe?.freigegebeneSchalter) ? freigabe.freigegebeneSchalter : [])
    .filter((x) => istObjekt(x) && typeof x.name === "string" && String(x.grund || "").trim()).map((x) => [x.name, x.grund]));
  if (composeDateien !== undefined) {
    if (!Array.isArray(composeDateien)) nogo(g, "Compose-Dateien des Kandidaten nicht ermittelbar (fail-closed)");
    else {
      const geprueft = new Set(konfig.vorlagen.filter((v) => v.art === "compose").map((v) => v.pfad));
      for (const f of composeDateien) if (!geprueft.has(f)) nogo(g, `${maskiert(f)}: wird von Compose geladen, ist aber keine geprüfte Vorlage`);
    }
  }
  g.bindung = [];
  if (vorlagenStand !== undefined) {
    const binde = (grund) => { g.bindung.push(grund); nogo(g, grund); };
    if (!istObjekt(vorlagenStand) || !istObjekt(vorlagenStand.dateien) || !Array.isArray(vorlagenStand.unbekannt)) {
      binde("Vorlagen des Kandidaten nicht ermittelbar (fail-closed)");
    } else {
      for (const f of vorlagenStand.unbekannt) binde(`${f}: Vorlage dieser Art nicht bindbar (gebundeneVorlagen, reguläre Datei) und nicht freigegeben`);
      const soll = freigabe?.vorlagenHashes;
      if (!istObjekt(soll)) binde("Freigabedatei ohne vorlagenHashes — die ausgelieferten Vorlagen sind nicht gebunden (--vorlagen-hashes)");
      else {
        for (const [f, h] of Object.entries(vorlagenStand.dateien)) {
          if (!Object.hasOwn(soll, f)) binde(`${f}: fehlt in vorlagenHashes`);
          else if (soll[f] !== h) binde(`${f}: Hash weicht von der Freigabe ab (Vorlage geändert, neu freigeben)`);
        }
        for (const f of Object.keys(soll)) if (!Object.hasOwn(vorlagenStand.dateien, f)) binde(`${maskiert(f)}: in vorlagenHashes, aber nicht im Kandidaten`);
      }
    }
  }
  const unfertigVariablen = unfertig.funktionen.filter(istObjekt).flatMap((f) => (Array.isArray(f.variablen) ? f.variablen : []));
  for (const v of vorlagen || []) {
    if (v.text == null) {
      if (v.pflicht) nogo(g, `Pflichtvorlage fehlt: ${v.pfad}`);
      continue;
    }
    const { funde, unlesbar } = vorlageAuswerten(v.text, v.art, unfertigVariablen);
    for (const z of unlesbar) nogo(g, `${v.pfad}: Zeile nicht sicher lesbar (keine bekannte Form): ${z.slice(0, 120)}`);
    // Jeder Fund einzeln: ein aktiver Fund irgendwo ist NO-GO, ein späterer Aus-Wert hebt ihn nicht auf.
    for (const [name, roh] of funde) {
      if (/^NODE_/.test(name) && name !== "NODE_ENV") nogo(g, `${v.pfad}: ${name} ist in Vorlagen verboten (z. B. NODE_OPTIONS kann Code laden und Schalter setzen)`);
      if (name === "NODE_ENV" && abweichend(roh, ["production"])) nogo(g, `${v.pfad}: NODE_ENV=${roh} (nur production; Faktorpflicht und Epochenbindung hängen daran)`);
      const e = kl[name];
      if (!istObjekt(e)) {
        if (/^CENTRIC_/.test(name)) nogo(g, `${v.pfad}: unklassifizierte Variable ${name} (in ${konfig.schalterDatei} einordnen)`);
      } else {
        const sicher = Array.isArray(e.sicherWerte) ? e.sicherWerte : [];
        if (e.klasse === "schalter-aus" && abweichend(roh, [...konfig.ausWerte, ...sicher])) nogo(g, `${v.pfad}: Schalter ${name} aktiv (${roh})`);
        if (e.klasse === "standard-an" && abweichend(roh, sicher)) nogo(g, `${v.pfad}: ${name} weicht vom Standard ab (${roh})`);
        if (e.klasse === "freigabepflichtig" && abweichend(roh, [...konfig.ausWerte, ...sicher])) {
          if (freigegeben.has(name)) g.belege.push(`${v.pfad}: ${name} aktiv, freigegeben: ${freigegeben.get(name)}`);
          else nogo(g, `${v.pfad}: ${name} aktiv ohne Betreiberfreigabe (freigegebeneSchalter in der Freigabedatei)`);
        }
      }
      for (const f of unfertig.funktionen) {
        if (!istObjekt(f) || !(Array.isArray(f.variablen) && f.variablen.includes(name))) continue;
        const sicher = Array.isArray(f.sicherWerte) ? f.sicherWerte : [];
        if (abweichend(roh, [...konfig.ausWerte, ...sicher])) nogo(g, `${v.pfad}: unfertige Funktion „${f.name}“ aktiv über ${name}`);
      }
    }
    if (konfig.nodeEnvPflicht.includes(v.pfad)) {
      const nodeEnv = funde.filter(([k]) => k === "NODE_ENV");
      if (!nodeEnv.length || nodeEnv.some(([, r]) => wertAufloesen(r) !== "production")) nogo(g, `${v.pfad}: NODE_ENV=production fehlt`);
    }
    if (unfertig.funktionen.some((f) => !istObjekt(f))) nogo(g, `${konfig.unfertigDatei}: ungültiger Eintrag`);
    g.belege.push(`${v.pfad}: geprüft (${funde.length} Funde)`);
  }
  for (const f of unfertig.funktionen) {
    for (const k of (istObjekt(f) && Array.isArray(f.quelltextKonstanten) ? f.quelltextKonstanten : [])) {
      const text = quelltexte?.[k.datei];
      if (text == null) { nogo(g, `Quelltext für ${k.name} fehlt: ${k.datei}`); continue; }
      const m = new RegExp(`\\b${k.name}\\s*=\\s*([^;\\n]+)`).exec(text);
      if (!m || m[1].trim() !== k.sollWert) nogo(g, `${k.datei}: ${k.name} ist nicht ${k.sollWert}`);
      else g.belege.push(`${k.datei}: ${k.name} = ${k.sollWert}`);
    }
  }
  g.belege.push(`${(codeNamen || []).length} CENTRIC_-Namen im Server-Code, alle klassifiziert: ${unklassifiziert.length === 0 ? "ja" : "nein"}`);
  return g;
}

/* ------------------------------------------------------------- G4 — Bild */

/**
 * Bildangaben: normal { abgefragtAm, digest, revision, provenienzRevision } oder Hülle { abgefragtAm, quelle,
 * roh: <Ausgabe von docker buildx imagetools inspect --format '{{json .}}'> }.
 */
export function bildAngabenLesen(roh) {
  if (!istObjekt(roh)) return null;
  const inhalt = istObjekt(roh.roh) ? roh.roh : roh;
  const digest = (typeof roh.digest === "string" && roh.digest) || inhalt.digest || inhalt.manifest?.digest || null;
  const labels = new Set(tiefSuchen(inhalt, (k, v) => (k === "org.opencontainers.image.revision" && typeof v === "string" ? v : undefined)));
  if (typeof roh.revision === "string") labels.add(roh.revision);
  const prov = new Set(tiefSuchen(inhalt, (k, v) => {
    if ((k === "vcs.revision" || k === "vcs:revision") && typeof v === "string") return v;
    if (k === "vcs" && v && typeof v.revision === "string") return v.revision;
    return undefined;
  }));
  if (typeof roh.provenienzRevision === "string") prov.add(roh.provenienzRevision);
  return { digest, labels: [...labels], provenienz: [...prov], abgefragtAm: typeof roh.abgefragtAm === "string" ? roh.abgefragtAm : null };
}

export function g4Bild({ digest, kandidat, bild, liste, berichtVorhanden, jetztMs }, konfig) {
  const g = gate("G4", "Bild: Digest, Label, Provenienz, Freigabeliste");
  if (typeof digest !== "string" || !DIGEST.test(digest)) nogo(g, `Digest fehlt oder ist nicht sha256:<64 hex>: ${digest || "<leer>"}`);
  if (!HEX40.test(kandidat || "")) nogo(g, "Kandidaten-Commit nicht als 40 Hex bekannt");
  if (!bild) nogo(g, "Bildangaben fehlen (--bild-info) — Label und Provenienz nicht prüfbar");
  else {
    const t = Date.parse(bild.abgefragtAm || "");
    if (!Number.isFinite(t)) nogo(g, "Bildangaben ohne abgefragtAm (Zeit der Registry-Abfrage)");
    else if (t > jetztMs + 5 * 60_000) nogo(g, `Bildangaben: abgefragtAm liegt in der Zukunft (${bild.abgefragtAm})`);
    else if (jetztMs - t > konfig.bildInfoMaxTage * 86400_000) nogo(g, `Bildangaben zu alt (${bild.abgefragtAm})`);
    if (!bild.digest) nogo(g, "Bildangaben ohne Digest");
    else if (bild.digest !== digest) nogo(g, `Bildangaben gehören zu ${bild.digest}, nicht zu ${digest}`);
    if (bild.labels.length === 0) nogo(g, "Revisionslabel org.opencontainers.image.revision fehlt");
    else if (bild.labels.length > 1) nogo(g, `widersprüchliche Revisionslabel: ${bild.labels.join(", ")}`);
    else if (bild.labels[0] !== kandidat) nogo(g, `Revisionslabel ${bild.labels[0]} ≠ Kandidat ${kandidat}`);
    else g.belege.push(`Label revision = ${kandidat}`);
    if (konfig.provenienzPflicht) {
      if (bild.provenienz.length === 0) nogo(g, "SLSA-Provenienz (vcs.revision) fehlt");
      else if (bild.provenienz.some((p) => p !== kandidat)) nogo(g, `Provenienz vcs.revision ${bild.provenienz.join(", ")} ≠ Kandidat`);
      else g.belege.push(`Provenienz vcs.revision = ${kandidat}`);
    }
  }
  if (liste.fehler.length) nogo(g, `Freigabeliste ungültig: ${liste.fehler.join("; ")}`);
  if (typeof digest === "string" && DIGEST.test(digest)) {
    if (gesperrt(digest, liste.zeilen, konfig.gesperrtEingebaut)) nogo(g, `Digest ist gesperrt: ${digest}`);
    const z = liste.zeilen.find((x) => x.digest === digest);
    if (!z) nogo(g, "Digest steht nicht in deploy/FREIGEGEBENE-IMAGES.md (Listen-PR zuerst, Produktionsweg 3.7 Schritt 3)");
    else {
      if (z.status !== "aktiv") nogo(g, `Listenzeile hat Status '${z.status}', erwartet aktiv`);
      if (z.commit !== kandidat) nogo(g, `Listenzeile Commit ${z.commit} ≠ Kandidat ${kandidat}`);
      if (!berichtVorhanden) nogo(g, `Abnahmebericht der Listenzeile fehlt im Repository: ${z.bericht}`);
      if (g.ergebnis === "GO") g.belege.push(`Listenzeile aktiv, Bericht ${z.bericht}`);
    }
  }
  return g;
}

/* -------------------------------------------------------- G5 — Migration */

export function migrationsbericht({ basis, kandidat, geaenderteDateien, neueDateien }, konfig) {
  const geaendert = new Set(geaenderteDateien || []);
  const neu = new Set(neueDateien || []);
  const eintraege = konfig.startschreibvorgaenge.map((w) => {
    const g = w.quellen.filter((q) => geaendert.has(q));
    const n = w.quellen.filter((q) => neu.has(q));
    return { id: w.id, was: w.was, quellen: w.quellen, geaendert: g, neuSeitBasis: n, betroffen: g.length > 0 || n.length > 0 };
  });
  const startblock = konfig.startblockQuellen.filter((q) => geaendert.has(q) || neu.has(q));
  const verdaechtig = [...new Set([...geaendert, ...neu])].filter((f) => /^server\//.test(f) && /migr/i.test(f));
  return {
    basis, kandidat,
    betroffen: eintraege.filter((e) => e.betroffen).map((e) => e.id),
    startblockGeaendert: startblock.length > 0,
    verdaechtigeDateien: verdaechtig,
    eintraege,
  };
}

export function g5Migration(bericht, freigabe, liste = null) {
  const g = gate("G5", "Datenmigration und Startschreibvorgänge");
  if (!bericht || !Array.isArray(bericht.eintraege) || bericht.fehler) {
    return nogo(g, `Änderungen gegen den vorigen Release nicht ermittelbar${bericht?.fehler ? ": " + bericht.fehler : ""} (fail-closed)`);
  }
  // Die Basis muss ein Release laut Freigabeliste sein (aktiv, vorherig oder gesperrt), sonst ist der Vergleich wertlos.
  if (liste && !liste.zeilen.some((z) => z.commit === bericht.basis && (z.status === "aktiv" || z.status === "vorherig"))) {
    nogo(g, `Basis ${bericht.basis} steht in keiner Zeile aktiv oder vorherig der Freigabeliste (FREIGEGEBENE-IMAGES.md); gesperrte Zeilen sind keine Basis`);
  }
  const zuPruefen = [...bericht.betroffen];
  if (bericht.startblockGeaendert) zuPruefen.push("STARTBLOCK");
  if (bericht.verdaechtigeDateien.length) zuPruefen.push("MIGRATIONSDATEI");
  if (zuPruefen.length === 0) { g.belege.push(`keine Startschreib-Quelle seit ${bericht.basis} geändert`); return g; }
  const f = freigabe?.migration;
  if (!istObjekt(f) || f.freigegeben !== true) {
    return nogo(g, `geändert seit ${bericht.basis}: ${zuPruefen.join(", ")} — NO-GO bis Betreiberfreigabe (migration.freigegeben in der Freigabedatei)`);
  }
  if (f.basisCommit !== bericht.basis) nogo(g, `Migrationsfreigabe gilt für Basis ${f.basisCommit || "<leer>"}, nicht für ${bericht.basis}`);
  const abgedeckt = new Set(Array.isArray(f.abgedeckt) ? f.abgedeckt : []);
  const fehlt = zuPruefen.filter((x) => !abgedeckt.has(x));
  if (fehlt.length) nogo(g, `Migrationsfreigabe deckt nicht ab: ${fehlt.join(", ")}`);
  if (!f.bericht) nogo(g, "Migrationsfreigabe ohne Verweis auf Bericht/Probe (migration.bericht)");
  if (g.ergebnis === "GO") g.belege.push(`Betreiberfreigabe deckt ${zuPruefen.join(", ")} ab (${f.bericht})`);
  return g;
}

/* ----------------------------------------------- G6 — Sicherung, Restore */

function zeitPruefen(g, name, status, jetzt, maxMs) {
  const t = Date.parse(status.zeit || "");
  if (!Number.isFinite(t)) return nogo(g, `${name}: Zeit fehlt oder unlesbar`);
  if (t > jetzt + 5 * 60_000) return nogo(g, `${name}: Zeit liegt in der Zukunft (${status.zeit})`);
  if (jetzt - t > maxMs) return nogo(g, `${name}: zu alt (${status.zeit})`);
  g.belege.push(`${name}: ${status.zeit}`);
  return g;
}

function probePruefen(g, name, status, jetzt, maxMs, art) {
  if (!istObjekt(status)) return nogo(g, `${name}: Nachweis fehlt`);
  if (status.art !== art) return nogo(g, `${name}: art '${status.art ?? "<fehlt>"}', erwartet '${art}'`);
  if (status.ergebnis !== "ok") return nogo(g, `${name}: ergebnis '${status.ergebnis ?? "<fehlt>"}'`);
  return zeitPruefen(g, name, status, jetzt, maxMs);
}

export function g6Sicherung(nachweise, jetztMs, konfig) {
  const g = gate("G6", "Sicherung und Restore-Nachweis aktuell");
  const s = konfig.sicherung;
  const n = istObjekt(nachweise) ? nachweise : {};
  const sich = n.sicherung;
  const sName = "Sicherung außer Haus (letzte-erfolgreiche.json)";
  if (!istObjekt(sich)) nogo(g, `${sName}: Nachweis fehlt`);
  else if (typeof sich.snapshot_id !== "string" || !sich.snapshot_id.trim()) nogo(g, `${sName}: snapshot_id fehlt`);
  else if (!(Number(sich.dateien) > 0)) nogo(g, `${sName}: keine Dateien`);
  else zeitPruefen(g, sName, sich, jetztMs, s.sicherungMaxStunden * 3600_000);
  probePruefen(g, "Restore-Probe (probe-status.json)", n.restoreProbe, jetztMs, s.restoreProbeMaxTage * 86400_000, "wiederherstellungsprobe");
  const r = n.restoreProbe;
  if (istObjekt(r) && (Number(r.abweichend) !== 0 || Number(r.fehlend) !== 0)) nogo(g, `Restore-Probe: abweichend ${r.abweichend}, fehlend ${r.fehlend}`);
  if (s.widerrufbuchProbePflicht) {
    probePruefen(g, "Widerrufbuch-Probe (widerrufbuch-probe-status.json)", n.widerrufbuchProbe, jetztMs, s.widerrufbuchProbeMaxTage * 86400_000, "widerrufbuch-probe");
  }
  return g;
}

/* ---------------------------------------------------------- G7 — Rückweg */

export function g7Rueckweg({ liste, kandidat, digest, basis }, freigabe, konfig) {
  const g = gate("G7", "Rückweg dokumentiert");
  if (liste.fehler.length) return nogo(g, "Freigabeliste ungültig — kein Rückweg prüfbar");
  const r = freigabe?.rueckweg;
  if (!istObjekt(r) || !["r0", "ruecksprung"].includes(r.strategie)) {
    return nogo(g, "rueckweg.strategie (r0 | ruecksprung) fehlt in der Freigabedatei");
  }
  // OF-13: Bilder ohne Revisionslabel sind nie Rücksprungziel; ist die Basis eines davon (erste Auslieferung), gibt es
  // bildseitig nur R0. Die Basis kommt aus --basis und aus basisCommit der Freigabedatei; eine Angabe genügt.
  const ohneLabel = Array.isArray(konfig.ohneRevisionslabel) ? konfig.ohneRevisionslabel : [];
  const unbeschriftet = (z) => ohneLabel.find((o) => (o.commit && z.commit === o.commit) || (o.digest && z.digest === o.digest));
  const basen = [...new Set([basis, freigabe?.basisCommit].filter((b) => typeof b === "string" && HEX40.test(b)))];
  const basisOhneLabel = basen.map((b) => unbeschriftet({ commit: b })).find(Boolean);
  const vorherig = liste.zeilen.find((z) => z.status === "vorherig");
  const ziel = vorherig && vorherig.digest !== digest && vorherig.commit !== kandidat &&
    !gesperrt(vorherig.digest, liste.zeilen, konfig.gesperrtEingebaut) && !unbeschriftet(vorherig) && !basisOhneLabel ? vorherig : null;
  if (r.strategie === "ruecksprung") {
    if (basen.length === 0) {
      return nogo(g, "Strategie ruecksprung: Basis unbekannt (--basis oder basisCommit) — Revisionslabel nicht prüfbar, nur r0 (fail-closed)");
    }
    if (basisOhneLabel) {
      return nogo(g, `Strategie ruecksprung unzulässig: Basis ${basisOhneLabel.commit.slice(0, 7)} ist ein Bild ohne Revisionslabel (erste Auslieferung, OF-13); das neue Bild schreibt beim ersten Start in data/ — nur r0 (R0 und Vorwärts-Reparatur, Produktionsweg §3.3)`);
    }
    const ohne = vorherig && unbeschriftet(vorherig);
    if (ohne) {
      return nogo(g, `Strategie ruecksprung unzulässig: Zeile vorherig ${ohne.commit.slice(0, 7)} ist ein Bild ohne Revisionslabel (OF-13, Forced Command ohne --ohne-label) — nur r0`);
    }
    if (!ziel) return nogo(g, "Strategie ruecksprung ohne zulässige Zeile vorherig");
    g.belege.push(`Rücksprungziel vorherig ${ziel.digest.slice(0, 19)}… (Commit ${ziel.commit.slice(0, 7)})`);
    return g;
  }
  if (!ziel) {
    if (!["a", "b", "c"].includes(r.entscheidungO1)) nogo(g, "kein Rücksprungziel und Entscheidung O-1 (a|b|c) nicht dokumentiert");
    if (!["a", "b"].includes(r.entscheidungO2)) nogo(g, "kein Rücksprungziel und Entscheidung O-2 (a|b) nicht dokumentiert");
  }
  if (g.ergebnis === "GO") g.belege.push(`R0 als Fehlerstrategie${ziel ? ", vorherig vorhanden" : `, O-1 ${r.entscheidungO1}, O-2 ${r.entscheidungO2}`}`);
  return g;
}

/* ------------------------------------------------------- G8, G9 — SSOT */

const annahmen = (liste) => new Map((Array.isArray(liste) ? liste : []).filter((a) => istObjekt(a) && a.id && String(a.grund || "").trim()).map((a) => [a.id, a.grund]));

/** Review #477 H3: blockiert die Priorität? P0/P1 (prios) und jede unbekannte oder fehlende prio (fail-closed). */
const prioBlockiert = (prio, prios) => prios.includes(prio) || !PRIO_STUFEN.includes(prio);
/** Priorität für Meldungen; unbekannte Werte nur als JSON (keine rohen Steuerzeichen), gekürzt. */
const prioText = (prio) => (PRIO_STUFEN.includes(prio) ? prio
  : `Priorität ${prio === undefined ? "fehlt" : String(JSON.stringify(prio)).slice(0, 40)}, unbekannt → blockierend`);

/** Review #483 H3: Zeile für einen Eintrag in pakete, der kein Objekt ist (Tupel, null, Text, Zahl). */
const keinObjekt = (konfig, i, x) =>
  `${konfig.ssot}: pakete[${i}] ist kein Objekt (${x === null ? "null" : Array.isArray(x) ? "Liste" : typeof x}) — nicht prüfbar (fail-closed)`;
/** Wert für Meldungen: JSON, nur druckbares ASCII (alles andere als \uXXXX), gekürzt. */
const idText = (x) => String(JSON.stringify(x) ?? "fehlt").replace(/[^\x20-\x7e]/gu, escape).slice(0, 60);
/** Review #483 H2: ID für den Präfix-Abgleich (ABN-, V4-): NFKC, Unicode-Bindestriche und Minus zu „-“, Großschreibung. */
const idNormal = (id) => id.normalize("NFKC").replace(/[\p{Pd}−]/gu, "-").toUpperCase();

/** Ein PR-Verweis "#123" als sichere Ganzzahl, sonst null (Review #473 H4/H5: keine Zahl ohne „#“, kein Überlauf). */
const prVerweis = (x) => {
  if (typeof x !== "string" || !PR_MUSTER.test(x)) return null;
  const n = Number(x.slice(1));
  return Number.isSafeInteger(n) ? n : null;
};

/** Liste von PR-Verweisen: { nummern } oder { fehler }. Gültig: Liste aus "#123" ohne Duplikate (leer erlaubt). */
function prListeLesen(wert) {
  if (wert === undefined) return { fehler: "fehlt" };
  if (!Array.isArray(wert)) return { fehler: "ist keine Liste" };
  const nummern = [];
  for (const x of wert) {
    const n = prVerweis(x);
    if (n === null) return { fehler: `enthält ungültigen Eintrag ${String(JSON.stringify(x) ?? x).slice(0, 40)} (Format #123)` };
    nummern.push(n);
  }
  if (new Set(nummern).size !== nummern.length) return { fehler: "enthält Duplikate" };
  return { nummern };
}

/** ssotPrs einer unfertigen Funktion: fehlt → { prs: null }; gültig → { prs: Set<Nummer> }; sonst { fehler }.
 *  Gültig: nicht leere Liste aus "#123" (sichere Ganzzahl), ohne Duplikate. */
export function ssotPrsLesen(wert) {
  if (wert === undefined) return { prs: null };
  if (Array.isArray(wert) && !wert.length) return { fehler: "ist leer (dann Feld weglassen)" };
  const l = prListeLesen(wert);
  return l.fehler ? { fehler: l.fehler } : { prs: new Set(l.nummern) };
}

export function g8Blocker(ssot, prsImKandidaten, freigabe, konfig, unfertig = null, klassen = null) {
  const g = gate("G8", "Keine offenen P0/P1-Pakete im Kandidaten");
  if (!istObjekt(ssot) || !Array.isArray(ssot.pakete)) return nogo(g, `${konfig.ssot} fehlt oder ist ungültig (fail-closed)`);
  if (!Array.isArray(prsImKandidaten)) return nogo(g, "PR-Liste des Kandidaten nicht ermittelbar (fail-closed)");
  const imKandidat = new Set(prsImKandidaten.map(Number));
  const akzeptiert = annahmen(freigabe?.akzeptiertePakete);
  for (const [i, p] of ssot.pakete.entries()) {
    if (!istObjekt(p)) { nogo(g, keinObjekt(konfig, i, p)); continue; }          // Review #483 H3: nicht still überspringen
    if (konfig.blocker.erledigt.includes(p.status) || !prioBlockiert(p.prio, konfig.blocker.prios)) continue;
    const kopf = `${p.id} (${prioText(p.prio)}, ${p.status})`;
    // Review #477 H3: ohne gültige pr-Liste ist nicht bestimmbar, ob das Paket im Kandidaten steckt (fail-closed)
    const liste = prListeLesen(p.pr);
    if (liste.fehler) { nogo(g, `${kopf}: pr ${liste.fehler} — PRs im Kandidaten nicht bestimmbar (fail-closed)`); continue; }
    const prs = liste.nummern.filter((x) => imKandidat.has(x));
    if (!prs.length) continue;
    if (akzeptiert.has(p.id)) { g.belege.push(`${kopf} vom Betreiber akzeptiert: ${akzeptiert.get(p.id)}`); continue; }
    nogo(g, `${kopf} steckt im Kandidaten über ${prs.map((x) => "#" + x).join(", ")}`);
  }
  // Unfertige Funktionen (RELEASE-UNFERTIG.json, Feld ssotPakete): Jede genannte Paket-ID muss in der SSOT stehen
  // (sonst ist die Liste veraltet, fail-closed). Steckt das Paket im Kandidaten, belegt G8, dass sein Code nur hinter
  // dem Schalter AUS ausgeliefert wird; die Sperre selbst prüft G3. Eine ungültige Liste meldet G3.
  if (istObjekt(unfertig) && Array.isArray(unfertig.funktionen)) {
    const pakete = new Map(ssot.pakete.filter(istObjekt).map((p) => [p.id, p]));
    for (const f of unfertig.funktionen) {
      if (!istObjekt(f)) continue;
      // Review #473 H2: ssotPrs ist nur mit ssotPakete erlaubt; sonst würde es nie geprüft (Schemafehler, NO-GO)
      if (f.ssotPakete === undefined) {
        if (f.ssotPrs !== undefined) nogo(g, `${konfig.unfertigDatei}: ${f.id}: ssotPrs ohne ssotPakete (Schemafehler)`);
        continue;
      }
      if (!Array.isArray(f.ssotPakete)) { nogo(g, `${konfig.unfertigDatei}: ${f.id}: ssotPakete ist keine Liste`); continue; }
      // Review #437 (3): ohne Variablen gibt es keinen Schalter, hinter dem der Code ruhen könnte → kein Beleg, NO-GO
      const variablen = Array.isArray(f.variablen) ? f.variablen.filter((v) => typeof v === "string" && v) : [];
      if (!variablen.length) { nogo(g, `${konfig.unfertigDatei}: ${f.id} nennt ssotPakete, aber keine variablen (kein Schalter)`); continue; }
      // Delta-Check #437 (2): Beleg nur, wenn jede Variable in RELEASE-SCHALTER.json als schalter-aus klassifiziert ist
      const keinAus = variablen.filter((v) => !(istObjekt(klassen?.variablen) && istObjekt(klassen.variablen[v]) && klassen.variablen[v].klasse === "schalter-aus"));
      if (keinAus.length) { nogo(g, `${konfig.unfertigDatei}: ${f.id}: nicht als schalter-aus klassifiziert (${konfig.schalterDatei}): ${keinAus.join(", ")}`); continue; }
      // Opus-Review #470 A2: ssotPrs (optional) nennt die PRs, die der Eintrag ausdrücklich und voll deckt. Nur diese
      // stehen in der Belegzeile als „nur hinter Schalter AUS“; fehlt ssotPrs, behauptet G8 keine Deckung (fail-closed).
      const deckung = ssotPrsLesen(f.ssotPrs);
      if (deckung.fehler) { nogo(g, `${konfig.unfertigDatei}: ${f.id}: ssotPrs ${deckung.fehler}`); continue; }
      // Review #473 H1: jeder ssotPrs-Eintrag muss im pr eines genannten ssotPakete-Pakets stehen (Tippfehler → NO-GO).
      // Die Belegzeilen unten bleiben; ein solcher Eintrag deckt ohnehin keinen PR des Kandidaten.
      if (deckung.prs) {
        const bekannt = new Set(f.ssotPakete.flatMap((id) => prListeLesen(pakete.get(id)?.pr).nummern ?? []));
        for (const nr of deckung.prs) {
          if (!bekannt.has(nr)) nogo(g, `${konfig.unfertigDatei}: ${f.id}: ssotPrs #${nr} steht in keinem pr der ssotPakete (${f.ssotPakete.join(", ")})`);
        }
      }
      for (const id of f.ssotPakete) {
        const p = pakete.get(id);
        if (!p) { nogo(g, `${konfig.unfertigDatei}: ${f.id} nennt ${id}, das nicht in der SSOT steht (Liste veraltet)`); continue; }
        const prs = (prListeLesen(p.pr).nummern ?? []).filter((x) => imKandidat.has(x));
        // Ein offenes P0/P1-Paket (oder mit unbekannter prio) ist oben schon NO-GO (außer akzeptiert); kein entlastender Beleg.
        const offenBlocker = prioBlockiert(p.prio, konfig.blocker.prios) && !konfig.blocker.erledigt.includes(p.status) && !akzeptiert.has(p.id);
        if (!prs.length || offenBlocker) continue;
        const liste = (xs) => xs.map((x) => "#" + x).join(", ");
        if (!deckung.prs) {
          g.belege.push(`${id} im Kandidaten (${liste(prs)}): „${f.name}“ (Schalter ${variablen.join(", ")}): Deckungsumfang nicht angegeben (ssotPrs fehlt) — keine Aussage; alle PRs bleiben Betreiber-Annahme`);
          continue;
        }
        const gedeckt = prs.filter((x) => deckung.prs.has(x));
        const offen = prs.filter((x) => !deckung.prs.has(x));
        const teil1 = gedeckt.length
          ? `nur hinter Schalter AUS (G3: ${variablen.join(", ")}): ${liste(gedeckt)}`
          : `kein PR des Pakets im Kandidaten durch den Schalter gedeckt (ssotPrs)`;
        const teil2 = offen.length ? `; NICHT durch den Schalter gedeckt: ${liste(offen)} — bleibt Betreiber-Annahme` : "";
        g.belege.push(`${id} im Kandidaten: „${f.name}“ ${teil1}${teil2}`);
      }
    }
  }
  return g;
}

export function g9Befunde(ssot, freigabe, konfig) {
  const g = gate("G9", "Keine offenen P0/P1-Befunde");
  if (!istObjekt(ssot) || !Array.isArray(ssot.pakete)) return nogo(g, `${konfig.ssot} fehlt oder ist ungültig (fail-closed)`);
  const muster = konfig.befund.idMuster.map((m) => new RegExp(m));
  const { ausnahmePraefix, ausnahmeIds } = konfig.befund;
  const akzeptiert = annahmen(freigabe?.akzeptierteBefunde);
  ssot.pakete.forEach((p, i) => {
    if (!istObjekt(p)) { nogo(g, keinObjekt(konfig, i, p)); return; }            // Review #483 H3
    // Nur offene Pakete mit P0/P1 oder unbekannter prio können blockieren; alle anderen bleiben wie vorher unberührt.
    if (konfig.befund.erledigt.includes(p.status) || !prioBlockiert(p.prio, konfig.befund.prios)) return;
    // Review #483 H2: ID und strang müssen dem Schema genügen, sonst ist die Befund-Zuordnung nicht sicher (fail-closed).
    // Eine Annahme (akzeptierteBefunde) hebt das nicht auf: erst die Daten korrigieren.
    if (typeof p.id !== "string" || !ID_MUSTER.test(p.id)) {
      nogo(g, `Paket pakete[${i}] (${prioText(p.prio)}): ID ${idText(p.id)} ungültig (Format ${ID_MUSTER.source}) — Befund-Zuordnung nicht bestimmbar (fail-closed)`);
      return;
    }
    if (!STRAENGE.includes(p.strang)) {
      nogo(g, `${p.id} (${prioText(p.prio)}, ${p.status}): strang ${p.strang === undefined ? "fehlt" : `${idText(p.strang)} unbekannt`} (zulässig: ${STRAENGE.join("|")}) — Befund-Zuordnung nicht bestimmbar (fail-closed)`);
      return;
    }
    // REL-*: nur exakt (keine Normalisierung). Review #486 H-b: Ausnahme nur für bekannte REL-Pakete; jede andere ID
    // mit diesem Präfix blockiert (fail-closed), auch mit Annahme — erst die Liste per PR mit Review ergänzen.
    if (p.id.startsWith(ausnahmePraefix)) {
      if (ausnahmeIds.includes(p.id)) return;
      nogo(g, `${p.id} (${prioText(p.prio)}, ${p.status}): Präfix ${ausnahmePraefix}, aber nicht in REL_AUSNAHME_IDS (${ausnahmeIds.join(", ")}) — Release-Prozess-Paket unbekannt, Befund-Zuordnung nicht bestimmbar (fail-closed)`);
      return;
    }
    const istBefund = konfig.befund.straenge.includes(p.strang) || muster.some((m) => m.test(idNormal(p.id)));
    if (!istBefund) return;
    if (akzeptiert.has(p.id)) { g.belege.push(`${p.id} vom Betreiber akzeptiert: ${akzeptiert.get(p.id)}`); return; }
    nogo(g, `${p.id} (${prioText(p.prio)}, ${p.status}): ${String(p.titel || "").slice(0, 80)}`);
  });
  return g;
}

/* ------------------------------------------------------- G10 — Freigabe */

/** Strukturprüfung der Freigabedatei; Liste der Fehler (leer = gültig). */
export function freigabeSchema(f) {
  const fe = [];
  if (!istObjekt(f)) return ["Freigabedatei ist kein Objekt"];
  const reihe = (name, pruef) => {
    if (f[name] === undefined) return;
    if (!Array.isArray(f[name]) || !f[name].every(pruef)) fe.push(`${name}: falsche Struktur`);
  };
  reihe("reviewBestaetigt", (x) => Number.isInteger(x) && x > 0);
  const mitGrund = (x) => istObjekt(x) && typeof x.id === "string" && typeof x.grund === "string" && x.grund.trim() !== "";
  reihe("akzeptiertePakete", mitGrund);
  reihe("akzeptierteBefunde", mitGrund);
  if (f.vorlagenHashes !== undefined && (!istObjekt(f.vorlagenHashes) ||
    !Object.entries(f.vorlagenHashes).every(([k, v]) => typeof k === "string" && /^[0-9a-f]{64}$/.test(String(v))))) fe.push("vorlagenHashes: falsche Struktur");
  reihe("freigegebeneSchalter", (x) => istObjekt(x) && typeof x.name === "string" && typeof x.grund === "string" && x.grund.trim() !== "");
  reihe("akzeptierteCommits", (x) => istObjekt(x) && /^[0-9a-f]{40}$/.test(x.sha || "") && typeof x.grund === "string" && x.grund.trim() !== "");
  if (f.rueckweg !== undefined && !istObjekt(f.rueckweg)) fe.push("rueckweg: kein Objekt");
  if (f.migration !== undefined) {
    if (!istObjekt(f.migration)) fe.push("migration: kein Objekt");
    else if (f.migration.abgedeckt !== undefined && (!Array.isArray(f.migration.abgedeckt) || !f.migration.abgedeckt.every((x) => typeof x === "string"))) fe.push("migration.abgedeckt: falsche Struktur");
  }
  return fe;
}

export function g10Freigabe({ releaseId, freigabe, freigabeFehler, commitet, kandidat, digest, basis, stand }, konfig = KONFIG_STANDARD) {
  const g = gate("G10", "Betreiberfreigabe für diesen Release");
  if (!istObjekt(stand) || stand.kandidatIstVorfahr !== true) nogo(g, "HEAD enthält den Kandidaten nicht (oder nicht ermittelbar)");
  if (!istObjekt(stand) || stand.headGepusht !== true) nogo(g, "HEAD ist nicht auf origin (gepusht) — lokale Stände gelten nicht");
  else if (!Array.isArray(stand.geaendertSeitKandidat)) nogo(g, "Änderungen seit dem Kandidaten nicht ermittelbar");
  else {
    const fremd = stand.geaendertSeitKandidat.filter((p) => !konfig.erlaubtNachKandidat.some((e) => (e.endsWith("/") ? p.startsWith(e) : p === e)));
    if (fremd.length) nogo(g, `seit dem Kandidaten in HEAD geändert (nur Liste und Freigabedatei erlaubt): ${fremd.slice(0, 10).join(", ")}`);
  }
  if (!releaseId) return nogo(g, "--release-id fehlt");
  if (!RELEASE_ID.test(releaseId)) return nogo(g, `Release-ID ungültig: ${releaseId}`);
  if (!freigabe) return nogo(g, `Freigabedatei fehlt oder ist ungültig: ${freigabeFehler || "fehlt"}`);
  for (const x of freigabeSchema(freigabe)) nogo(g, `Freigabedatei: ${x}`);
  if (freigabe.schema !== 1) nogo(g, "Freigabedatei: schema ist nicht 1");
  if (freigabe.releaseId !== releaseId) nogo(g, `Freigabedatei: releaseId ${freigabe.releaseId} ≠ ${releaseId}`);
  if (freigabe.kandidatCommit !== kandidat) nogo(g, `Freigabedatei: kandidatCommit ${freigabe.kandidatCommit} ≠ ${kandidat}`);
  if (freigabe.digest !== digest) nogo(g, `Freigabedatei: digest ${freigabe.digest} ≠ ${digest}`);
  if (!HEX40.test(String(freigabe.basisCommit || ""))) nogo(g, "Freigabedatei: basisCommit fehlt (der Betreiber bindet die Basis)");
  else if (freigabe.basisCommit !== basis) nogo(g, `Freigabedatei: basisCommit ${freigabe.basisCommit} ≠ --basis ${basis}`);
  if (freigabe.umgebung !== "produktion") nogo(g, "Freigabedatei: umgebung ist nicht produktion");
  if (!String(freigabe.freigegebenDurch || "").trim()) nogo(g, "Freigabedatei: freigegebenDurch fehlt");
  if (!DATUM.test(String(freigabe.datum || ""))) nogo(g, "Freigabedatei: datum fehlt oder nicht JJJJ-MM-TT");
  if (commitet !== true) nogo(g, "Freigabedatei ist nicht unverändert commitet (git ls-files / git status)");
  if (g.ergebnis === "GO") g.belege.push(`freigegeben durch ${freigabe.freigegebenDurch} am ${freigabe.datum}`);
  return g;
}

/* ------------------------------------------------------- Gesamtprüfung */

export function auswerten(e, konfig = KONFIG_STANDARD) {
  const liste = freigabelisteLesen(e.listeText, konfig.gesperrtEingebaut);
  const roheFreigabe = e.freigabe || null;
  // Andere Gates nutzen die Freigabedatei nur, wenn ihre Struktur stimmt (sonst fail-closed: wie nicht vorhanden).
  const freigabe = roheFreigabe && freigabeSchema(roheFreigabe).length === 0 ? roheFreigabe : null;
  const bericht = e.diffFehler || !e.basis
    ? { fehler: e.diffFehler || "keine Basis (--basis, voriger Release-Commit)" }
    : migrationsbericht({ basis: e.basis, kandidat: e.kandidat, geaenderteDateien: e.geaenderteDateien, neueDateien: e.neueDateien }, konfig);
  // Ein ungültiger Eintrag macht die ganze Commit-Liste unbrauchbar (fail-closed).
  const commitsOk = Array.isArray(e.commits) &&
    e.commits.every((c) => istObjekt(c) && typeof c.sha === "string" && Array.isArray(c.eltern) && typeof c.betreff === "string");
  // GitHub-Zuordnung Commit → gemergte PRs (Rebase-Merge, Squash mit anderem Betreff); Sammel-PRs sind dort
  // schon ausgefiltert. Ein Commit mit mindestens einer Zuordnung gilt als abgedeckt.
  const zuordnung = istObjekt(e.commitPrZuordnung) ? e.commitPrZuordnung : {};
  const zugeordnet = (sha) => (Array.isArray(zuordnung[sha]) ? zuordnung[sha].map(Number).filter(Number.isInteger) : []);
  const prs = commitsOk
    ? [...new Set([...prsAusCommits(e.commits), ...e.commits.flatMap((c) => zugeordnet(c.sha))])].sort((a, b) => a - b)
    : undefined;
  const ohne = commitsOk ? commitsOhnePr(e.commits, konfig, e.prBestaetigung).filter((c) => zugeordnet(c.sha).length === 0) : undefined;
  const gates = [
    g1Ci(e.checkRuns, e.kandidat, konfig),
    g2Review({ prs, commitsOhnePr: ohne, anzahlCommits: commitsOk ? e.commits.length : undefined, prAngaben: istObjekt(e.prAngaben) ? e.prAngaben : {}, dokBelege: reviewNachweiseLesen(e.reviewTexte || []), ssotBelege: ssotReviewBelege(e.ssot), freigabe }),
    g3Schalter({ codeNamen: e.codeNamen, klassen: e.klassen, vorlagen: e.vorlagen || [], unfertig: e.unfertig, quelltexte: e.quelltexte, freigabe, composeDateien: e.composeDateien, vorlagenStand: e.vorlagenStand ?? null }, konfig),
    g4Bild({ digest: e.digest, kandidat: e.kandidat, bild: bildAngabenLesen(e.bildRoh), liste, berichtVorhanden: e.berichtVorhanden, jetztMs: e.jetztMs }, konfig),
    g5Migration(bericht, freigabe, liste),
    g6Sicherung(e.nachweise, e.jetztMs, konfig),
    g7Rueckweg({ liste, kandidat: e.kandidat, digest: e.digest, basis: e.basis }, freigabe, konfig),
    g8Blocker(e.ssot, prs, freigabe, konfig, e.unfertig, e.klassen),
    g9Befunde(e.ssot, freigabe, konfig),
    g10Freigabe({ releaseId: e.releaseId, freigabe: roheFreigabe, freigabeFehler: e.freigabeFehler, commitet: e.freigabeCommitet, kandidat: e.kandidat, digest: e.digest, basis: e.basis, stand: e.stand }, konfig),
  ];
  const gesamt = gates.every((g) => g.ergebnis === "GO") ? "GO" : "NO-GO";
  const modus = e.modus || "offline-fixture";
  const uebersteuert = modus !== "online" || e.jetztUeberschrieben === true;
  // Delta-Check #437: Gründe, Belege und Bericht enthalten Text aus Pfaden, Vorlagen, SSOT und Freigabedatei. Die
  // Ausgabe trägt kein rohes Steuer- oder Formatzeichen (keine Terminal- oder Log-Injektion), siehe sicher().
  return tiefSicher({
    werkzeug: "release-pruefung", version: VERSION,
    zeitpunkt: Number.isFinite(e.jetztMs) ? new Date(e.jetztMs).toISOString() : null,
    modus, jetztUeberschrieben: e.jetztUeberschrieben === true, konfigAbweichend: false, uebersteuert,
    kandidat: e.kandidat || null, digest: e.digest || null, releaseId: e.releaseId || null, basis: e.basis || null,
    paket: { prs: prs ?? null, commitsOhnePr: ohne ?? null },
    gesamt,
    exitCode: gesamt !== "GO" ? 1 : uebersteuert ? 3 : 0,
    // Vorprüfung: ohne die Endprüfungs-Gates; bei G3 zählt die Vorlagenbindung (braucht die Freigabedatei) erst dort.
    vorpruefungOk: gates.filter((g) => !konfig.endpruefungGates.includes(g.id))
      .every((g) => g.ergebnis === "GO" || (g.id === "G3" && g.gruende.every((x) => (g.bindung || []).includes(x)))),
    nogo: gates.filter((g) => g.ergebnis !== "GO").map((g) => g.id),
    manuelleBestaetigungen: gates.flatMap((g) => g.manuell.map((m) => `${g.id}: ${m}`)),
    migrationsbericht: bericht,
    gates,
    konfiguration: konfig,
  });
}

/* ------------------------------------------------- Sammeln (Ein-/Ausgabe) */

const ZEITGRENZE_MS = 60_000;

/** Gemeinsame Optionen aller git- und gh-Aufrufe: nur lesen, Zeitgrenze 60 s. */
export function ausfuehrOptionen(cwd, extra = {}) {
  return { cwd, encoding: "utf8", maxBuffer: 512 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"], timeout: ZEITGRENZE_MS, ...extra };
}

/** Ausführung aller git/gh-Aufrufe (im Test ersetzbar, um die Optionen zu prüfen). */
export const ausfuehren = { exec: execFileSync };

function git(wurzel, args) {
  return ausfuehren.exec("git", args, ausfuehrOptionen(wurzel)).replace(/\s+$/, "");
}

function ghApi(wurzel, pfad, extra = []) {
  return JSON.parse(ausfuehren.exec("gh", ["api", ...extra, pfad], ausfuehrOptionen(wurzel)));
}

/** Löst eine Revision sicher auf (keine Option als Revision). Fehler: null. */
export function revisionAufloesen(wurzel, rev) {
  if (typeof rev !== "string" || !rev || rev.startsWith("-")) return null;
  try {
    const sha = git(wurzel, ["rev-parse", "--verify", "--quiet", "--end-of-options", `${rev}^{commit}`]);
    return HEX40.test(sha) ? sha : null;
  } catch { return null; }
}

/** Dateiquelle: offline der Arbeitsstand unter --wurzel, online ein Commit (`git show <rev>:<pfad>`). */
function quelle(wurzel, rev) {
  if (!rev) {
    const lesen = (rel) => { try { return readFileSync(join(wurzel, rel), "utf8"); } catch { return null; } };
    const dateien = (rel, aus = []) => {
      const p = join(wurzel, rel);
      if (!existsSync(p)) return aus;
      const s = lstatSync(p);
      if (!s.isDirectory()) { aus.push(rel); return aus; }
      for (const f of readdirSync(p)) dateien(`${rel}/${f}`, aus);
      return aus;
    };
    const wurzelDateien = () => { try { return readdirSync(wurzel, { withFileTypes: true }).filter((d) => d.isFile() || d.isSymbolicLink()).map((d) => d.name); } catch { return []; } };
    const lesenRoh = (rel) => { try { return readFileSync(join(wurzel, rel)); } catch { return null; } };
    // Arbeitsstand: Symlink = 120000, reguläre Datei = 100644 (das Ausführbar-Bit ist offline nicht verlässlich)
    const modus = (rel) => { try { const s = lstatSync(join(wurzel, rel)); return s.isSymbolicLink() ? "120000" : s.isFile() ? "100644" : "000000"; } catch { return null; } };
    const eintraege = (wurzeln) => {
      const aus = [];
      const gehe = (rel) => {
        let s;
        try { s = lstatSync(join(wurzel, rel)); } catch { return; }
        if (s.isSymbolicLink()) { aus.push({ pfad: rel, modus: "120000" }); return; }
        if (s.isDirectory()) { for (const f of readdirSync(join(wurzel, rel))) gehe(rel ? `${rel}/${f}` : f); return; }
        aus.push({ pfad: rel, modus: "100644" });
      };
      for (const w of wurzeln) gehe(w);
      for (const f of wurzelDateien()) aus.push({ pfad: f, modus: modus(f) });
      return aus;
    };
    return { lesen, lesenRoh, modus, eintraege, dateien: (wurzeln) => wurzeln.flatMap((r) => dateien(r)), gibt: (rel) => existsSync(join(wurzel, rel)), wurzelDateien };
  }
  const lesen = (rel) => { try { return ausfuehren.exec("git", ["show", `${rev}:${rel}`], ausfuehrOptionen(wurzel, { stdio: ["ignore", "pipe", "ignore"] })); } catch { return null; } };
  // ls-tree immer mit -z: Pfade kommen ungequotet (auch mit Nicht-ASCII-Zeichen), getrennt an NUL
  const baum = (args) => git(wurzel, ["ls-tree", "-z", ...args]).split("\0").filter(Boolean);
  const dateien = (wurzeln) => { try { return baum(["-r", "--name-only", rev, "--", ...wurzeln]); } catch { return []; } };
  const gibt = (rel) => { try { git(wurzel, ["cat-file", "-e", `${rev}:${rel}`]); return true; } catch { return false; } };
  const wurzelDateien = () => { try { return baum(["--name-only", rev]); } catch { return []; } };
  const eintragLesen = (z) => { const tab = z.indexOf("\t"); return { pfad: z.slice(tab + 1), modus: z.split(" ")[0] }; };
  // Einträge mit Mode: Wurzelverzeichnis (ohne Rekursion) und die Suchwurzeln (rekursiv; Symlinks und Submodule
  // erscheinen als eigener Eintrag, ihr Inhalt wird nicht verfolgt)
  const eintraege = (wurzeln) => {
    try { return [...baum([rev]).map(eintragLesen), ...baum(["-r", rev, "--", ...wurzeln]).map(eintragLesen)]; } catch { return null; }
  };
  // Rohe Bytes des Blobs (kein Dekodieren) und Mode aus dem Baum (100644, 100755, 120000 Symlink, 160000 Submodul …)
  const lesenRoh = (rel) => { try { return ausfuehren.exec("git", ["show", `${rev}:${rel}`], ausfuehrOptionen(wurzel, { stdio: ["ignore", "pipe", "ignore"], encoding: "buffer" })); } catch { return null; } };
  const modus = (rel) => {
    try {
      const z = baum([rev, "--", rel]).find((x) => x.endsWith(`\t${rel}`));
      return z ? z.split(" ")[0] : null;
    } catch { return null; }
  };
  return { lesen, lesenRoh, modus, eintraege, dateien, gibt, wurzelDateien };
}

function nachweiseAusQuelle(q, verz) {
  const basis = String(verz).replace(/\\/g, "/").replace(/\/+$/, "");
  const l = (n) => { const t = q.lesen(`${basis}/${n}`); try { return t == null ? null : JSON.parse(t); } catch { return null; } };
  return { sicherung: l("letzte-erfolgreiche.json"), restoreProbe: l("probe-status.json"), widerrufbuchProbe: l("widerrufbuch-probe-status.json") };
}

/**
 * Semantische Prüfung der Basis (online, vor jedem Netzaufruf): echter Vorfahr des Kandidaten, nicht gleich,
 * Bereich nicht leer, und Commit einer Zeile der Freigabeliste in HEAD. Liefert eine Fehlermeldung oder null.
 */
export function basisPruefen(wurzel, basis, kandidat, konfig = KONFIG_STANDARD) {
  if (basis === kandidat) return "Basis = Kandidat (leerer Bereich)";
  try { git(wurzel, ["merge-base", "--is-ancestor", basis, kandidat]); } catch { return "Basis ist kein Vorfahr des Kandidaten"; }
  let anzahl = 0;
  try { anzahl = Number(git(wurzel, ["rev-list", "--count", `${basis}..${kandidat}`])); } catch { return "Bereich nicht ermittelbar"; }
  if (!(anzahl > 0)) return "leerer Commit-Bereich";
  let liste = null;
  try { liste = ausfuehren.exec("git", ["show", `HEAD:${konfig.freigabeListe}`], ausfuehrOptionen(wurzel, { stdio: ["ignore", "pipe", "ignore"] })); } catch { liste = null; }
  const zeilen = freigabelisteLesen(liste).zeilen.filter((z) => z.commit === basis);
  if (!zeilen.length) return `Basis steht in keiner Zeile von ${konfig.freigabeListe} (HEAD)`;
  if (!zeilen.some((z) => z.status === "aktiv" || z.status === "vorherig")) return `Basis steht in ${konfig.freigabeListe} nicht als aktiv oder vorherig (gesperrt ist keine Basis)`;
  return null;
}

/** SHA-256 je Vorlage dieser Art im Kandidaten; nicht gelistete Dateien dieser Art als „unbekannt“. */
export function vorlagenStandErmitteln(kq, konfig = KONFIG_STANDARD) {
  // s-Flag: „.“ trifft auch Zeilenumbrüche und -trenner (Review #437); Steuerzeichen sperrt ohnehin STEUERZEICHEN
  const art = new RegExp(konfig.vorlagenArt, "is");
  const alle = kq.eintraege(konfig.vorlagenSuche);
  const dateiPfade = [...new Set([...kq.wurzelDateien(), ...kq.dateien(konfig.vorlagenSuche)])];
  const unbekannt = [];
  // je Pfad höchstens eine Meldung (roher Pfad als Schlüssel, Ausgabe immer maskiert; Delta-Check #437)
  const gemeldet = new Set();
  const melde = (f, grund) => { if (!gemeldet.has(f)) { gemeldet.add(f); unbekannt.push(`${maskiert(f)} (${grund})`); } };
  // N1 (Delta-Check #427): Ein Pfad mit Steuerzeichen (\n, \r, \t, NUL …) im Wurzelverzeichnis oder unter deploy/
  // ist immer NO-GO (Dateien, Verzeichnisse, Links). Das Muster vorlagenArt („.“ ohne s-Flag) erkannte etwa
  // „Dockerfile\nx“ nicht als Vorlage.
  for (const f of new Set([...dateiPfade, ...(Array.isArray(alle) ? alle.map((x) => x.pfad) : [])])) {
    if (STEUERZEICHEN.test(f)) melde(f, "Steuerzeichen im Pfad, nicht zulässig");
  }
  const kandidaten = dateiPfade.filter((f) => !STEUERZEICHEN.test(f) && art.test(f.split("/").pop())).sort();
  const dateien = {};
  for (const f of kandidaten) {
    if (!konfig.gebundeneVorlagen.includes(f)) { melde(f, "nicht gelistet"); continue; }
    const modus = kq.modus(f);
    if (modus !== "100644" && modus !== "100755") { melde(f, `Mode ${modus ?? "unbekannt"}, keine reguläre Datei`); continue; }
    const roh = kq.lesenRoh(f);
    if (roh == null) { melde(f, "nicht lesbar"); continue; }
    // gebunden: Mode und rohe Bytes, ohne Dekodieren
    dateien[f] = createHash("sha256").update(Buffer.concat([Buffer.from(`${modus}\0`), Buffer.from(roh)])).digest("hex");
  }
  // Jeder Symlink (120000) und jedes Submodul (160000) im Wurzelverzeichnis und unter deploy/ ist unzulässig —
  // auch ein Verzeichnis-Symlink, der gebundene Vorlagen still verschwinden ließe.
  if (!Array.isArray(alle)) unbekannt.push("(Baum des Kandidaten nicht lesbar)");
  else {
    for (const { pfad, modus } of alle) {
      if (modus === "120000" || modus === "160000") melde(pfad, `Mode ${modus}, Symlink/Submodul nicht zulässig`);
    }
  }
  return { dateien, unbekannt: [...new Set(unbekannt)].sort() };
}

function nachweiseLesen(verz) {
  if (!verz) return {};
  const l = (n) => { try { return JSON.parse(readFileSync(resolve(verz, n), "utf8")); } catch { return null; } };
  return { sicherung: l("letzte-erfolgreiche.json"), restoreProbe: l("probe-status.json"), widerrufbuchProbe: l("widerrufbuch-probe-status.json") };
}

/** Sammelt alle Angaben. Offline kommen Git- und Netzangaben ausschließlich aus der Fixture. */
export function sammeln(opt, konfig = KONFIG_STANDARD) {
  const w = opt.wurzel;
  const fx = istObjekt(opt.fixture) ? opt.fixture : {};
  const gh = typeof opt.gh === "function" ? opt.gh : (pfad, extra) => ghApi(opt.wurzel, pfad, extra);
  const online = !opt.offline;
  const e = { releaseId: opt.releaseId, digest: opt.digest, jetztMs: opt.jetztMs, modus: online ? "online" : "offline-fixture", jetztUeberschrieben: !!opt.jetztUeberschrieben };

  e.kandidat = online ? opt.kandidatSha : (typeof fx.kandidatCommit === "string" ? fx.kandidatCommit : null);
  e.basis = online ? opt.basisSha : (opt.basis || (typeof fx.basisCommit === "string" ? fx.basisCommit : null));
  const kq = quelle(w, online ? e.kandidat : null); // Stand des Kandidaten
  const hq = quelle(w, online ? "HEAD" : null);     // Liste und Freigabedatei

  // Aus dem Kandidaten
  const serverDateien = kq.dateien(konfig.schalterSuche).filter((f) => /\.m?js$/.test(f));
  e.codeNamen = codeNamenFinden(serverDateien.map((f) => kq.lesen(f)));
  e.klassen = jsonLesen(kq.lesen(konfig.schalterDatei)).wert;
  e.vorlagen = konfig.vorlagen.map((v) => ({ ...v, text: kq.lesen(v.pfad) }));
  const composeMuster = new RegExp(konfig.composeMuster, "i");
  e.vorlagenStand = vorlagenStandErmitteln(kq, konfig);
  e.composeDateien = [...kq.dateien(konfig.composeSuche).filter((f) => composeMuster.test(f)),
    ...konfig.composeWurzel.filter((f) => kq.gibt(f))];
  e.unfertig = jsonLesen(kq.lesen(konfig.unfertigDatei)).wert;
  e.quelltexte = {};
  for (const f of Array.isArray(e.unfertig?.funktionen) ? e.unfertig.funktionen : []) {
    for (const k of (istObjekt(f) && Array.isArray(f.quelltextKonstanten) ? f.quelltextKonstanten : [])) e.quelltexte[k.datei] = kq.lesen(k.datei);
  }
  e.ssot = jsonLesen(kq.lesen(konfig.ssot)).wert;
  e.reviewTexte = kq.dateien(["docs/acc45"])
    .filter((f) => /^docs\/acc45\/[^/]+$/.test(f) && f.split("/").pop().startsWith(konfig.reviewNachweisPraefix) && f.endsWith(".md"))
    .map((f) => ({ datei: f, text: kq.lesen(f) }));

  // Aus HEAD
  e.listeText = hq.lesen(konfig.freigabeListe);
  const zeile = freigabelisteLesen(e.listeText).zeilen.find((z) => z.digest === e.digest);
  e.berichtVorhanden = !!(zeile && zeile.bericht && hq.gibt(zeile.bericht));
  if (opt.releaseId && RELEASE_ID.test(opt.releaseId)) {
    const rel = `${konfig.freigabeVerzeichnis}/${opt.releaseId}.freigabe.json`;
    const j = jsonLesen(hq.lesen(rel));
    e.freigabe = istObjekt(j.wert) ? j.wert : null;
    e.freigabeFehler = j.fehler ? `${rel}: ${j.fehler}` : (j.wert && !istObjekt(j.wert) ? `${rel}: kein Objekt` : null);
    if (!online) e.freigabeCommitet = fx.freigabeCommitet === true;
    else {
      try {
        git(w, ["ls-files", "--error-unmatch", "--", rel]);
        e.freigabeCommitet = git(w, ["status", "--porcelain", "--", rel, konfig.freigabeListe]) === "";
      } catch { e.freigabeCommitet = false; }
    }
  }

  // Bild und Nachweise
  e.bildRoh = online ? (opt.bildInfo ? jsonLesen(lesenPfad(opt.bildInfo)).wert : null) : (fx.bildInfo ?? null);
  // Nachweise: offline aus Fixture oder Dateisystem; online nur aus HEAD (commitet), nie aus dem Arbeitsstand.
  e.nachweise = !online
    ? (fx.nachweise ? fx.nachweise : nachweiseLesen(opt.nachweise))
    : (opt.nachweise ? nachweiseAusQuelle(hq, opt.nachweise) : {});

  if (!online) {
    e.checkRuns = fx.checkRuns;
    e.commits = fx.commits;
    e.commitPrZuordnung = fx.commitPrZuordnung;
    e.prBestaetigung = fx.prBestaetigung;
    e.prAngaben = istObjekt(fx.prs) ? fx.prs : {};
    e.geaenderteDateien = fx.geaenderteDateien;
    e.neueDateien = Array.isArray(fx.neueDateien) ? fx.neueDateien : [];
    if (!Array.isArray(fx.geaenderteDateien)) e.diffFehler = "Fixture ohne geaenderteDateien";
    e.stand = fx.stand;
    return e;
  }

  // Online: Git-Angaben
  if (e.kandidat && e.basis) {
    try {
      e.geaenderteDateien = git(w, ["diff", "--no-renames", "--name-only", e.basis, e.kandidat]).split("\n").filter(Boolean);
      e.neueDateien = git(w, ["diff", "--no-renames", "--name-only", "--diff-filter=A", e.basis, e.kandidat]).split("\n").filter(Boolean);
      e.commits = git(w, ["log", "--format=%H%x09%P%x09%s", `${e.basis}..${e.kandidat}`]).split("\n").filter(Boolean).map((z) => {
        const [sha, eltern, ...betreff] = z.split("\t");
        return { sha, eltern: eltern ? eltern.split(" ") : [], betreff: betreff.join("\t") };
      });
    } catch (err) { e.diffFehler = "git diff/log scheiterte: " + String(err.message).split("\n")[0]; }
  }
  try {
    let vorfahr = true;
    try { git(w, ["merge-base", "--is-ancestor", e.kandidat, "HEAD"]); } catch { vorfahr = false; }
    let gepusht = false;
    // Gepusht heißt: origin ist dieses GitHub-Repository, und ein Freigabezweig (main) zeigt dort genau auf HEAD
    // (git remote get-url, git ls-remote; nur lesend).
    try {
      const url = git(w, ["remote", "get-url", "origin"]);
      if (new RegExp(konfig.repoUrlMuster).test(url)) {
        const kopf = git(w, ["rev-parse", "HEAD"]);
        const zweige = new Set(konfig.freigabeZweige.map((z) => `refs/heads/${z}`));
        gepusht = git(w, ["ls-remote", "--heads", "origin"]).split("\n").some((z) => {
          const [sha, ref] = z.split("\t");
          return sha === kopf && zweige.has(ref);
        });
      }
    } catch { gepusht = false; }
    e.stand = { kandidatIstVorfahr: vorfahr, headGepusht: gepusht, geaendertSeitKandidat: vorfahr ? git(w, ["diff", "--no-renames", "--name-only", e.kandidat, "HEAD"]).split("\n").filter(Boolean) : null };
  } catch { e.stand = null; }
  try {
    // filter=all: alle Läufe, nicht nur den jüngsten je Name (sonst gälte „ein roter Lauf bleibt rot“ nur offline).
    const seiten = gh(`repos/${konfig.repo}/commits/${e.kandidat}/check-runs?per_page=100&filter=all`, ["--paginate", "--slurp"]);
    e.checkRuns = seiten.flatMap((s) => s.check_runs || []);
  } catch { e.checkRuns = null; }
  // Commits ohne PR-Merkmal im Betreff: GitHub fragen, zu welchen gemergten PRs sie gehören (nur GET).
  e.commitPrZuordnung = {};
  const sammel = new RegExp(konfig.sammelZweig);
  // PR-Betreffs bestätigen: gemergt, merge_commit_sha, Zweig, Commits des PR (höchstens 250 laut GitHub).
  e.prBestaetigung = {};
  const prDaten = {};
  for (const nr of Array.isArray(e.commits) ? prsAusCommits(e.commits) : []) {
    try {
      const p = gh(`repos/${konfig.repo}/pulls/${nr}`);
      prDaten[nr] = p;
      const seiten = gh(`repos/${konfig.repo}/pulls/${nr}/commits?per_page=100`, ["--paginate", "--slurp"]);
      e.prBestaetigung[nr] = {
        gemergt: !!p.merged_at, mergeCommit: p.merge_commit_sha || null, zweig: String(p.head?.ref || ""),
        commits: seiten.flat().map((x) => x.sha),
      };
    } catch { /* ohne Bestätigung: der Betreff belegt nichts (fail-closed) */ }
  }
  if (Array.isArray(e.commits)) {
    for (const c of commitsOhnePr(e.commits, konfig, e.prBestaetigung)) {
      try {
        const l = gh(`repos/${konfig.repo}/commits/${c.sha}/pulls`);
        e.commitPrZuordnung[c.sha] = l.filter((p) => p.merged_at && !sammel.test(String(p.head?.ref || ""))).map((p) => p.number);
      } catch { /* ohne Antwort: bleibt „ohne PR“ (fail-closed) */ }
    }
  }
  e.prAngaben = {};
  const dok = reviewNachweiseLesen(e.reviewTexte);
  const ssotBeleg = ssotReviewBelege(e.ssot);
  const allePrs = Array.isArray(e.commits) ? new Set([...prsAusCommits(e.commits), ...Object.values(e.commitPrZuordnung).flat()]) : [];
  for (const nr of allePrs) {
    if (dok.has(nr) || ssotBeleg.has(nr)) continue; // Dokumentbeleg genügt; spart Abfragen
    try {
      const p = prDaten[nr] || gh(`repos/${konfig.repo}/pulls/${nr}`);
      const r = gh(`repos/${konfig.repo}/pulls/${nr}/reviews?per_page=100`, ["--paginate", "--slurp"]).flat();
      e.prAngaben[nr] = { autor: p.user?.login ?? null, kopf: p.head?.sha ?? null,
        reviews: r.map((x) => ({ state: x.state, autor: x.user?.login ?? null, assoc: x.author_association ?? null, commit: x.commit_id ?? null })) };
    } catch { /* ohne Angaben: G2 listet den PR zur manuellen Bestätigung */ }
  }
  return e;
}

/* ------------------------------------------------------------------ CLI */

export function argumenteLesen(argv) {
  const o = {};
  const mitWert = new Set(["--kandidat", "--digest", "--release-id", "--basis", "--bild-info", "--nachweise", "--jetzt", "--wurzel", "--fixture"]);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (mitWert.has(a)) {
      const v = argv[++i];
      if (v === undefined || v.startsWith("--")) throw new Error(`${a} braucht einen Wert`);
      o[a.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = v;
    } else if (a === "--offline") o.offline = true;
    else if (a === "--kurz") o.kurz = true;
    else if (a === "--konfig-zeigen") o.konfigZeigen = true;
    else if (a === "--vorlagen-hashes") o.vorlagenHashes = true;
    else throw new Error(`unbekannte Option: ${a}`);
  }
  return o;
}

export function kurzfassung(r) {
  const z = [`Release-Prüfung ${r.releaseId || "<ohne id>"} · Kandidat ${r.kandidat || "?"} · ${r.gesamt}${r.uebersteuert ? " (übersteuert: " + r.modus + (r.jetztUeberschrieben ? ", --jetzt" : "") + ")" : ""} · Exit ${r.exitCode}`];
  for (const g of r.gates) {
    z.push(`  ${g.id.padEnd(3)} ${g.ergebnis.padEnd(5)} ${g.name}`);
    for (const x of g.gruende.slice(0, 8)) z.push(`        - ${x}`);
    if (g.gruende.length > 8) z.push(`        … ${g.gruende.length - 8} weitere`);
  }
  return z.join("\n");
}

/** stderr-Ausgabe der CLI: Aufrufwerte und Fehlertexte können fremde Zeichen tragen (Delta-Check #437). */
const ausgabeFehler = (s) => console.error(sicher(s));

function main(argv) {
  let o;
  try { o = argumenteLesen(argv); } catch (err) { ausgabeFehler("Aufruf: " + err.message); return 2; }
  if (o.vorlagenHashes) {
    // Hilfe für die Freigabedatei: SHA-256 der Vorlagen des Kandidaten (offline: Arbeitsstand unter --wurzel).
    const w = resolve(o.wurzel || fileURLToPath(new URL("..", import.meta.url)));
    let rev = null;
    if (!o.offline) {
      rev = revisionAufloesen(w, o.kandidat);
      if (!rev) { ausgabeFehler("Aufruf: --vorlagen-hashes braucht --kandidat <commit> (oder --offline)"); return 2; }
    }
    const stand = vorlagenStandErmitteln(quelle(w, rev));
    const ausgabe = { vorlagenHashes: stand.dateien };
    if (o.basis) {
      // Nur Anzeige: was hat sich gegenüber dem vorigen Release geändert (der Betreiber sieht, was er quittiert).
      const bRev = o.offline ? null : revisionAufloesen(w, o.basis);
      if (!bRev) { ausgabeFehler("Aufruf: --basis ist kein Commit (Vergleich nur online)"); return 2; }
      const alt = vorlagenStandErmitteln(quelle(w, bRev)).dateien;
      ausgabe.vergleichMitBasis = Object.fromEntries(Object.entries(stand.dateien).map(([f, h]) => [f, {
        basis: alt[f] ?? null, kandidat: h, status: alt[f] == null ? "neu" : alt[f] === h ? "unverändert" : "geändert" }]));
      for (const [f, h] of Object.entries(alt)) {
        if (!Object.hasOwn(stand.dateien, f)) ausgabe.vergleichMitBasis[f] = { basis: h, kandidat: null, status: "entfernt" };
      }
    }
    console.log(JSON.stringify(tiefSicher(ausgabe), null, 2));
    for (const f of stand.unbekannt) ausgabeFehler(sicher(`nicht gelistete Vorlage: ${f}`));
    return stand.unbekannt.length ? 1 : 0;
  }
  if (o.konfigZeigen) {
    if (argv.length !== 1) { ausgabeFehler("Aufruf: --konfig-zeigen steht allein"); return 2; }
    console.log(JSON.stringify(KONFIG_STANDARD, null, 2));
    return 0;
  }
  const wurzel = resolve(o.wurzel || fileURLToPath(new URL("..", import.meta.url)));
  let fixture = null;
  let jetztMs;
  if (o.offline) {
    if (!o.fixture) { ausgabeFehler("Aufruf: --offline braucht --fixture <datei.json>"); return 2; }
    const j = jsonLesen(lesenPfad(o.fixture));
    if (!istObjekt(j.wert)) { ausgabeFehler(`Fixture ${o.fixture}: ${j.fehler || "kein Objekt"}`); return 2; }
    fixture = j.wert;
    jetztMs = o.jetzt ? Date.parse(o.jetzt) : Date.now();
    if (!Number.isFinite(jetztMs)) { ausgabeFehler("Aufruf: --jetzt ist keine Zeit"); return 2; }
  } else {
    if (o.jetzt) { ausgabeFehler("Aufruf: --jetzt ist nur offline zulässig"); return 2; }
    if (!o.kandidat) { ausgabeFehler("Aufruf: --kandidat <bild-commit> fehlt"); return 2; }
    if (!o.basis) { ausgabeFehler("Aufruf: --basis <voriger-release-commit> fehlt (Pflicht, keine Ableitung aus der Liste)"); return 2; }
    o.kandidatSha = revisionAufloesen(wurzel, o.kandidat);
    o.basisSha = revisionAufloesen(wurzel, o.basis);
    if (!o.kandidatSha) { ausgabeFehler(`Aufruf: --kandidat ${o.kandidat} ist kein Commit`); return 2; }
    if (!o.basisSha) { ausgabeFehler(`Aufruf: --basis ${o.basis} ist kein Commit`); return 2; }
    const basisFehler = basisPruefen(wurzel, o.basisSha, o.kandidatSha);
    if (basisFehler) { ausgabeFehler(`Aufruf: Basis ungeeignet: ${basisFehler}`); return 2; }
    jetztMs = Date.now();
  }
  let r;
  try {
    r = auswerten(sammeln({ ...o, wurzel, fixture, jetztMs, jetztUeberschrieben: !!o.jetzt }));
  } catch (err) {
    ausgabeFehler("Struktur- oder Lesefehler: " + (err && err.message));
    return 2;
  }
  if (o.kurz) console.log(kurzfassung(r));
  else { console.log(JSON.stringify(r, null, 2)); console.error(kurzfassung(r)); }
  return r.exitCode;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
