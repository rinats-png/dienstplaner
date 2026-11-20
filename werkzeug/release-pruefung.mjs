#!/usr/bin/env node
/* ==========================================================================
   RELEASE-PRÜFUNG (REL-1) — Gates G1 bis G10 für einen Release-Kandidaten

   Prüft maschinenlesbar, ob ein Kandidat (Commit oder Branch, dazu der
   Bild-Digest) ausgeliefert werden darf, und gibt GO oder NO-GO mit Begründung
   je Gate aus. Richtlinie: docs/acc45/RELEASE-PROZESS.md.

   Das Werkzeug ändert nichts: kein VPS, kein SSH, kein Deploy, kein Workflow,
   kein Schreiben ins Repository. Netz nur im Online-Modus und nur lesend
   (`gh api`, GET: Check-Runs und PR-Angaben). Git nur lesend und lokal.

   Grundsatz fail-closed: Fehlt eine Angabe, ist sie unlesbar oder
   widersprüchlich, ist das Gate NO-GO. Exit 0 nur bei GO in allen Gates.

     G1  CI: alle Pflicht-Check-Runs auf genau dem Kopf-SHA abgeschlossen und grün
     G2  Review: jeder PR im Kandidaten hat einen maschinell prüfbaren Beleg
         (GitHub-Review eines anderen Kontos, Tabelle in REVIEW-NACHWEIS*.md,
         SSOT-Paket mit Stufe reviewt = true, PR-Text) — sonst Liste
         „manuelle Bestätigung“; GO nur, wenn der
         Betreiber diese PRs in der Freigabedatei bestätigt (reviewBestaetigt)
     G3  Schalter: jeder Schalter (server/lib/schalter.mjs und Muster
         `process.env.X === "true"` im Server) steht in allen Release-Vorlagen
         auf Standard AUS; keine Funktion aus docs/acc45/RELEASE-UNFERTIG.json
         ist dort aktiv
     G4  Bild: Digest vollständig, Revisionslabel und SLSA-Provenienz vorhanden,
         beide = Kandidaten-Commit, Freigabeliste gültig und mit Zeile `aktiv`
     G5  Migration: Startschreibvorgänge W-1…W-9 gegen den vorigen Release
         (Migrationsbericht); geändert ⇒ NO-GO bis Betreiberfreigabe
     G6  Sicherung und Restore-Nachweis jünger als die Grenzen der Konfiguration
     G7  Rückweg: Zeile `vorherig` oder dokumentierte Entscheidung O-1/O-2 (R0)
     G8  SSOT: kein P0/P1-Paket im Status REVIEW/BLOCKED/IN_PROGRESS/READY,
         dessen PR im Kandidaten steckt (außer vom Betreiber akzeptiert)
     G9  keine offenen P0/P1-Befunde (Strang folge, ABN-*, V4-*)
     G10 Freigabedatei docs/acc45/releases/<id>.freigabe.json vorhanden,
         commitet und passend zu Commit und Digest

   Aufruf:
     node werkzeug/release-pruefung.mjs --kandidat <sha|branch> --digest sha256:<64 hex>
         --release-id <id> [--basis <commit>] [--bild-info <datei.json>]
         [--nachweise <verzeichnis>] [--jetzt <ISO-Zeit>] [--konfig <datei.json>]
         [--wurzel <repo>] [--kurz]
     node werkzeug/release-pruefung.mjs --offline --fixture <datei.json> [...]
         (alle Netz- und Git-Angaben aus der Fixture; Dateien aus --wurzel)
     node werkzeug/release-pruefung.mjs --konfig-zeigen

   Ausgabe: JSON auf stdout (Konfiguration, Gates, Gesamt). Kurzfassung auf
   stderr. Rückgabe: 0 GO · 1 NO-GO · 2 Aufruf- oder Lesefehler.
   ========================================================================== */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const VERSION = 1;

export const KONFIG_STANDARD = Object.freeze({
  repo: "rinats-png/dienstplaner",
  // Check-Runs der Workflows Prüfung, Sicherheit, Lieferkette und Betrieb: Deploy-Skripte (Stand 2026-11-20,
  // abgefragt auf integration/release-v4 @ 014c86ab). Jeder muss auf dem Kopf-SHA `success` sein.
  pflichtChecks: [
    "pruefen", "browser-abnahme", "abhaengigkeiten", "geheimnisse", "interne-pruefung", "muster",
    "shellcheck", "compose", "caddy-vorlage", "skripte", "bild-scan",
  ],
  // Für andere (nicht Pflicht-)Check-Runs gelten diese Abschlüsse als unschädlich.
  ciUnschaedlich: ["success", "skipped", "neutral"],
  reviewNachweisPraefix: "docs/acc45/REVIEW-NACHWEIS",
  schalterQuellen: ["server/lib/schalter.mjs"],
  schalterSuche: ["server", "server.mjs"],
  // Release-Vorlagen: dort darf kein Schalter und keine unfertige Funktion aktiv sein.
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
  // Spiegel von EINGEBAUT_GESPERRT in deploy/freigabe-lib.sh (gilt auch, wenn die Liste anders lautet).
  gesperrtEingebaut: [
    { digest: "sha256:f03a8514db6f07db5617e6818edd6505f0607d52ffcf5f985c862cfefc9c5a79", commit: "64d08a4957c5374e1f04c17be2b75162c07573d2" },
    { digest: "sha256:0861adee", commit: "1a56988d3c406aff99281f96c2d7da1dc24d7af7" },
  ],
  provenienzPflicht: true,
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
  blocker: { prios: ["P0", "P1"], status: ["REVIEW", "BLOCKED", "IN_PROGRESS", "READY"] },
  befund: { straenge: ["folge"], idMuster: ["^ABN-", "^V4-"], prios: ["P0", "P1"], erledigt: ["DONE", "INTEGRATED", "VERIFIED"] },
  freigabeVerzeichnis: "docs/acc45/releases",
});

const HEX40 = /^[0-9a-f]{40}$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const DATUM = /^\d{4}-\d{2}-\d{2}$/;
const RELEASE_ID = /^[a-z0-9][a-z0-9._-]{2,63}$/;

const gate = (id, name) => ({ id, name, ergebnis: "GO", gruende: [], belege: [], manuell: [] });
const nogo = (g, grund) => { g.ergebnis = "NO-GO"; g.gruende.push(grund); return g; };

/* ---------------------------------------------------------------- Hilfen */

/** Liest eine Datei relativ zur Wurzel; null, wenn sie fehlt oder unlesbar ist. */
export function lesen(wurzel, rel) {
  try { return readFileSync(join(wurzel, rel), "utf8"); } catch { return null; }
}

/** Liest eine Datei über einen Pfad des Aufrufs (absolut oder relativ zum Arbeitsverzeichnis). */
function lesenPfad(p) {
  try { return readFileSync(resolve(p), "utf8"); } catch { return null; }
}

function jsonLesen(text) {
  if (text == null) return { wert: null, fehler: "fehlt" };
  try { return { wert: JSON.parse(text), fehler: null }; } catch (e) { return { wert: null, fehler: "kein gültiges JSON: " + e.message }; }
}

/** Sammelt alle Werte zu einem Schlüssel in einem verschachtelten Objekt. */
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

/**
 * Liest die Tabelle aus deploy/FREIGEGEBENE-IMAGES.md nach denselben Regeln wie freigabe-lib.sh
 * (freigaben_lesen) und den Regeln am Kopf der Datei. Liefert { zeilen, fehler }.
 */
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
  if (checkRuns.length === 0) return nogo(g, "keine Check-Runs auf diesem Commit");
  const fremd = checkRuns.filter((c) => c.head_sha && c.head_sha !== kandidat);
  if (fremd.length) nogo(g, `${fremd.length} Check-Runs gehören zu einem anderen Commit`);
  // Wiederholte Läufe: je Name zählt der jüngste.
  const jeName = new Map();
  for (const c of checkRuns) {
    const alt = jeName.get(c.name);
    const zeit = (x) => String(x.started_at || x.completed_at || "") + String(x.id ?? "").padStart(20, "0");
    if (!alt || zeit(c) > zeit(alt)) jeName.set(c.name, c);
  }
  for (const name of konfig.pflichtChecks) {
    const c = jeName.get(name);
    if (!c) { nogo(g, `Pflicht-Check fehlt: ${name}`); continue; }
    if (c.status !== "completed") nogo(g, `Pflicht-Check ${name} nicht abgeschlossen (${c.status})`);
    else if (c.conclusion !== "success") nogo(g, `Pflicht-Check ${name}: ${c.conclusion}`);
    else g.belege.push(`${name}: success`);
  }
  for (const [name, c] of jeName) {
    if (konfig.pflichtChecks.includes(name)) continue;
    if (c.status !== "completed") nogo(g, `Check ${name} läuft noch (${c.status})`);
    else if (!konfig.ciUnschaedlich.includes(c.conclusion)) nogo(g, `Check ${name}: ${c.conclusion}`);
  }
  return g;
}

/* ----------------------------------------------------------- G2 — Review */

/** PR-Nummern mit Urteil aus den Tabellen in REVIEW-NACHWEIS*.md. */
export function reviewNachweiseLesen(texte) {
  const belegt = new Map();
  for (const { datei, text } of texte) {
    for (const zeile of String(text).split(/\r?\n/)) {
      const m = /^\|\s*#(\d+)\s*\|([^|]*)\|([^|]*)\|/.exec(zeile);
      if (!m) continue;
      const urteil = m[3].trim();
      // Endurteil MERGEBAR oder „Auflagen erledigt“; ein letztes „MIT AUFLAGEN“ ohne Erledigung reicht nicht.
      const ok = /MERGEBAR|erledigt/i.test(urteil) && !/MIT AUFLAGEN\s*\)?\s*$/i.test(urteil);
      if (ok) belegt.set(Number(m[1]), `${datei}: ${m[2].trim()} — ${urteil}`);
    }
  }
  return belegt;
}

const PR_TEXT_REVIEW = /(unabhängig\w*\s+)?Review[^\n]{0,200}?(MERGEBAR|ohne Auflagen|Auflagen erledigt)/i;

/** PR-Nummern der SSOT-Pakete mit Statusstufe reviewt = true (Beleg im Paket). */
export function ssotReviewBelege(ssot) {
  const m = new Map();
  for (const p of ssot?.pakete || []) {
    if (p?.stufen?.reviewt?.wert !== true) continue;
    for (const x of p.pr || []) {
      const nr = Number(String(x).replace(/^#/, ""));
      if (Number.isInteger(nr) && !m.has(nr)) m.set(nr, `SSOT ${p.id} reviewt: ${String(p.stufen.reviewt.beleg || "").slice(0, 80)}`);
    }
  }
  return m;
}

export function g2Review(prsImKandidaten, prAngaben, dokBelege, freigabe, ssotBelege = new Map()) {
  const g = gate("G2", "Unabhängiges Review je PR");
  if (!Array.isArray(prsImKandidaten)) return nogo(g, "PR-Liste des Kandidaten nicht ermittelbar (fail-closed)");
  const bestaetigt = new Set((freigabe?.reviewBestaetigt || []).map(Number));
  for (const nr of prsImKandidaten) {
    const a = prAngaben?.[nr] || prAngaben?.[String(nr)];
    const fremdReview = (a?.reviews || []).find((r) => r.state === "APPROVED" && r.autor && r.autor !== a.autor);
    if (fremdReview) { g.belege.push(`#${nr}: GitHub-Review APPROVED von ${fremdReview.autor}`); continue; }
    if (dokBelege.has(nr)) { g.belege.push(`#${nr}: ${dokBelege.get(nr)}`); continue; }
    if (ssotBelege.has(nr)) { g.belege.push(`#${nr}: ${ssotBelege.get(nr)}`); continue; }
    if (a?.body && PR_TEXT_REVIEW.test(a.body)) { g.belege.push(`#${nr}: PR-Text nennt Review-Urteil`); continue; }
    if (bestaetigt.has(nr)) { g.belege.push(`#${nr}: vom Betreiber in der Freigabedatei bestätigt`); continue; }
    g.manuell.push(`#${nr}`);
  }
  if (g.manuell.length) {
    const kurz = g.manuell.slice(0, 20).join(", ") + (g.manuell.length > 20 ? ` … (${g.manuell.length - 20} weitere, Liste in manuelleBestaetigungen)` : "");
    nogo(g, `${g.manuell.length} PR(s) ohne maschinell prüfbaren Review-Beleg; Betreiber bestätigt sie in reviewBestaetigt der Freigabedatei: ${kurz}`);
  }
  return g;
}

/* ---------------------------------------------------------- G3 — Schalter */

/** Schalter-Variablen aus schalter.mjs (alle process.env.X) und aus `process.env.X === "true"|"ja"` im Server. */
export function schalterFinden(quellTexte, suchTexte) {
  const s = new Set();
  for (const t of quellTexte) for (const m of String(t).matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) s.add(m[1]);
  for (const t of suchTexte) {
    for (const m of String(t).matchAll(/process\.env\.([A-Z][A-Z0-9_]*)\s*===?\s*["'](true|ja)["']/g)) s.add(m[1]);
  }
  return [...s].sort();
}

/** Liefert die aktiv gesetzten Variablen einer Vorlage: Map Name → Wert (nur nicht auskommentierte Zuweisungen). */
export function vorlageLesen(text, art) {
  const werte = new Map();
  const lines = String(text).replace(/\\\r?\n/g, " ").split(/\r?\n/);
  for (const z of lines) {
    if (/^\s*#/.test(z)) continue;
    if (art === "env") {
      const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(z);
      if (m) werte.set(m[1], m[2].replace(/\s+#.*$/, "").trim().replace(/^["']|["']$/g, ""));
    } else if (art === "compose") {
      const m = /^\s+(?:-\s*)?([A-Z][A-Z0-9_]*)\s*[:=]\s*(.*)$/.exec(z);
      if (m) werte.set(m[1], m[2].replace(/\s+#.*$/, "").trim().replace(/^["']|["']$/g, ""));
    } else if (art === "dockerfile") {
      const m = /^\s*ENV\s+(.*)$/i.exec(z);
      if (!m) continue;
      const rest = m[1];
      if (/=/.test(rest)) {
        for (const p of rest.matchAll(/([A-Za-z_][A-Za-z0-9_]*)=("[^"]*"|'[^']*'|\S*)/g)) werte.set(p[1], p[2].replace(/^["']|["']$/g, ""));
      } else {
        const p = /^([A-Za-z_][A-Za-z0-9_]*)\s+(.*)$/.exec(rest.trim());
        if (p) werte.set(p[1], p[2].trim());
      }
    }
  }
  return werte;
}

const platzhalter = (w) => /^<[^>]*>$/.test(w) || /^\$\{[^}]*\}$/.test(w) || /^\$[A-Z_]+$/.test(w);

export function istAktiv(wert, anWerte, aus = KONFIG_STANDARD.ausWerte) {
  if (wert == null) return false;
  const w = String(wert).trim();
  if (Array.isArray(anWerte) && anWerte.length) return anWerte.includes(w);
  if (platzhalter(w)) return false;
  return !aus.includes(w.toLowerCase());
}

export function g3Schalter({ schalter, vorlagen, unfertig, quelltexte }, konfig) {
  const g = gate("G3", "Schalter Standard AUS, unfertige Funktionen nicht aktiv");
  if (!schalter.length) nogo(g, "keine Schalter gefunden — Quelle server/lib/schalter.mjs fehlt oder ist leer (fail-closed)");
  if (!unfertig || !Array.isArray(unfertig.funktionen)) return nogo(g, `${konfig.unfertigDatei} fehlt oder ist ungültig (fail-closed)`);
  for (const v of vorlagen) {
    if (v.text == null) {
      if (v.pflicht) nogo(g, `Pflichtvorlage fehlt: ${v.pfad}`);
      continue;
    }
    const werte = vorlageLesen(v.text, v.art);
    for (const name of schalter) {
      if (werte.has(name) && istAktiv(werte.get(name), null, konfig.ausWerte)) nogo(g, `${v.pfad}: Schalter ${name} aktiv (${werte.get(name)})`);
    }
    for (const f of unfertig.funktionen) {
      for (const name of f.variablen || []) {
        if (werte.has(name) && istAktiv(werte.get(name), f.anWerte, konfig.ausWerte)) {
          nogo(g, `${v.pfad}: unfertige Funktion „${f.name}“ aktiv über ${name}`);
        }
      }
    }
    g.belege.push(`${v.pfad}: geprüft (${werte.size} gesetzte Variablen)`);
  }
  for (const f of unfertig.funktionen) {
    for (const k of f.quelltextKonstanten || []) {
      const text = quelltexte?.[k.datei];
      if (text == null) { nogo(g, `Quelltext für ${k.name} fehlt: ${k.datei}`); continue; }
      const m = new RegExp(`\\b${k.name}\\s*=\\s*([^;\\n]+)`).exec(text);
      if (!m || m[1].trim() !== k.sollWert) nogo(g, `${k.datei}: ${k.name} ist nicht ${k.sollWert}`);
      else g.belege.push(`${k.datei}: ${k.name} = ${k.sollWert}`);
    }
  }
  g.belege.push(`Schalter: ${schalter.join(", ")}`);
  return g;
}

/* ------------------------------------------------------------- G4 — Bild */

/** Holt Digest, Revisionslabel und Provenienz-Revision aus einer Bildbeschreibung (normal oder roh, z. B. imagetools). */
export function bildAngabenLesen(roh) {
  if (!roh || typeof roh !== "object") return null;
  const digest = roh.digest || roh.manifest?.digest || null;
  const labels = new Set(tiefSuchen(roh, (k, v) => (k === "org.opencontainers.image.revision" && typeof v === "string" ? v : undefined)));
  if (typeof roh.revision === "string") labels.add(roh.revision);
  const prov = new Set(tiefSuchen(roh, (k, v) => {
    if ((k === "vcs.revision" || k === "vcs:revision") && typeof v === "string") return v;
    if (k === "vcs" && v && typeof v.revision === "string") return v.revision;
    return undefined;
  }));
  if (typeof roh.provenienzRevision === "string") prov.add(roh.provenienzRevision);
  return { digest, labels: [...labels], provenienz: [...prov] };
}

export function g4Bild({ digest, kandidat, bild, liste, berichtVorhanden }, konfig) {
  const g = gate("G4", "Bild: Digest, Label, Provenienz, Freigabeliste");
  if (!digest || !DIGEST.test(digest)) nogo(g, `Digest fehlt oder ist nicht sha256:<64 hex>: ${digest || "<leer>"}`);
  if (!HEX40.test(kandidat || "")) nogo(g, "Kandidaten-Commit nicht als 40 Hex bekannt");
  if (!bild) nogo(g, "Bildangaben fehlen (--bild-info oder Fixture bildInfo) — Label und Provenienz nicht prüfbar");
  else {
    if (bild.digest && digest && bild.digest !== digest) nogo(g, `Bildangaben gehören zu ${bild.digest}, nicht zu ${digest}`);
    if (!bild.digest) nogo(g, "Bildangaben ohne Digest");
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
  if (digest && DIGEST.test(digest)) {
    if (gesperrt(digest, liste.zeilen, konfig.gesperrtEingebaut)) nogo(g, `Digest ist gesperrt: ${digest}`);
    const z = liste.zeilen.find((x) => x.digest === digest);
    if (!z) nogo(g, "Digest steht nicht in deploy/FREIGEGEBENE-IMAGES.md (Listen-PR zuerst, Produktionsweg 3.7 Schritt 3)");
    else {
      if (z.status !== "aktiv") nogo(g, `Listenzeile hat Status '${z.status}', erwartet aktiv`);
      if (z.commit !== kandidat) nogo(g, `Listenzeile Commit ${z.commit} ≠ Kandidat ${kandidat}`);
      if (!berichtVorhanden) nogo(g, `Abnahmebericht der Listenzeile fehlt im Repository: ${z.bericht}`);
      if (z.status === "aktiv" && z.commit === kandidat) g.belege.push(`Listenzeile aktiv, Bericht ${z.bericht}`);
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
  const startblock = konfig.startblockQuellen.filter((q) => geaendert.has(q));
  const verdaechtig = [...geaendert].filter((f) => /^server\//.test(f) && /migr/i.test(f));
  return {
    basis, kandidat,
    betroffen: eintraege.filter((e) => e.betroffen).map((e) => e.id),
    startblockGeaendert: startblock.length > 0,
    verdaechtigeDateien: verdaechtig,
    eintraege,
  };
}

export function g5Migration(bericht, freigabe) {
  const g = gate("G5", "Datenmigration und Startschreibvorgänge");
  if (!bericht || !Array.isArray(bericht.eintraege) || bericht.fehler) {
    return nogo(g, `Änderungen gegen den vorigen Release nicht ermittelbar${bericht?.fehler ? ": " + bericht.fehler : ""} (fail-closed)`);
  }
  const zuPruefen = [...bericht.betroffen];
  if (bericht.startblockGeaendert) zuPruefen.push("STARTBLOCK");
  if (bericht.verdaechtigeDateien.length) zuPruefen.push("MIGRATIONSDATEI");
  if (zuPruefen.length === 0) { g.belege.push(`keine Startschreib-Quelle seit ${bericht.basis} geändert`); return g; }
  const f = freigabe?.migration;
  if (!f || f.freigegeben !== true) {
    return nogo(g, `geändert seit ${bericht.basis}: ${zuPruefen.join(", ")} — NO-GO bis Betreiberfreigabe (migration.freigegeben in der Freigabedatei)`);
  }
  if (f.basisCommit !== bericht.basis) nogo(g, `Migrationsfreigabe gilt für Basis ${f.basisCommit || "<leer>"}, nicht für ${bericht.basis}`);
  const abgedeckt = new Set(f.abgedeckt || []);
  const fehlt = zuPruefen.filter((x) => !abgedeckt.has(x));
  if (fehlt.length) nogo(g, `Migrationsfreigabe deckt nicht ab: ${fehlt.join(", ")}`);
  if (!f.bericht) nogo(g, "Migrationsfreigabe ohne Verweis auf Bericht/Probe (migration.bericht)");
  if (g.ergebnis === "GO") g.belege.push(`Betreiberfreigabe deckt ${zuPruefen.join(", ")} ab (${f.bericht})`);
  return g;
}

/* ----------------------------------------------- G6 — Sicherung, Restore */

function alterPruefen(g, name, status, jetzt, maxMs, erwartetArt) {
  if (!status) return nogo(g, `${name}: Nachweis fehlt`);
  if (erwartetArt && status.art && status.art !== erwartetArt) return nogo(g, `${name}: falsche Art '${status.art}'`);
  if (status.ergebnis !== undefined && status.ergebnis !== "ok") return nogo(g, `${name}: ergebnis '${status.ergebnis}'`);
  const t = Date.parse(status.zeit || "");
  if (!Number.isFinite(t)) return nogo(g, `${name}: Zeit fehlt oder unlesbar`);
  if (t > jetzt + 5 * 60_000) return nogo(g, `${name}: Zeit liegt in der Zukunft (${status.zeit})`);
  if (jetzt - t > maxMs) return nogo(g, `${name}: zu alt (${status.zeit})`);
  g.belege.push(`${name}: ${status.zeit}`);
  return g;
}

export function g6Sicherung(nachweise, jetztMs, konfig) {
  const g = gate("G6", "Sicherung und Restore-Nachweis aktuell");
  const s = konfig.sicherung;
  const n = nachweise || {};
  alterPruefen(g, "Sicherung außer Haus (letzte-erfolgreiche.json)", n.sicherung, jetztMs, s.sicherungMaxStunden * 3600_000);
  alterPruefen(g, "Restore-Probe (probe-status.json)", n.restoreProbe, jetztMs, s.restoreProbeMaxTage * 86400_000, "wiederherstellungsprobe");
  const r = n.restoreProbe;
  if (r && (Number(r.abweichend) !== 0 || Number(r.fehlend) !== 0)) nogo(g, `Restore-Probe: abweichend ${r.abweichend}, fehlend ${r.fehlend}`);
  if (s.widerrufbuchProbePflicht) {
    alterPruefen(g, "Widerrufbuch-Probe (widerrufbuch-probe-status.json)", n.widerrufbuchProbe, jetztMs, s.widerrufbuchProbeMaxTage * 86400_000, "widerrufbuch-probe");
  }
  return g;
}

/* ---------------------------------------------------------- G7 — Rückweg */

export function g7Rueckweg({ liste, kandidat, digest }, freigabe, konfig) {
  const g = gate("G7", "Rückweg dokumentiert");
  if (liste.fehler.length) return nogo(g, "Freigabeliste ungültig — kein Rückweg prüfbar");
  const r = freigabe?.rueckweg;
  if (!r || !["r0", "ruecksprung"].includes(r.strategie)) {
    return nogo(g, "rueckweg.strategie (r0 | ruecksprung) fehlt in der Freigabedatei");
  }
  const vorherig = liste.zeilen.find((z) => z.status === "vorherig");
  const ziel = vorherig && vorherig.digest !== digest && vorherig.commit !== kandidat &&
    !gesperrt(vorherig.digest, liste.zeilen, konfig.gesperrtEingebaut) ? vorherig : null;
  if (r.strategie === "ruecksprung") {
    if (!ziel) return nogo(g, "Strategie ruecksprung ohne zulässige Zeile vorherig");
    g.belege.push(`Rücksprungziel vorherig ${ziel.digest.slice(0, 19)}… (Commit ${ziel.commit.slice(0, 7)})`);
    return g;
  }
  // R0: Entscheidungen O-1 und O-2 (Produktionsweg Abschnitt 6) müssen dokumentiert sein, wenn es kein Ziel gibt.
  if (!ziel) {
    if (!["a", "b", "c"].includes(r.entscheidungO1)) nogo(g, "kein Rücksprungziel und Entscheidung O-1 (a|b|c) nicht dokumentiert");
    if (!["a", "b"].includes(r.entscheidungO2)) nogo(g, "kein Rücksprungziel und Entscheidung O-2 (a|b) nicht dokumentiert");
  }
  if (g.ergebnis === "GO") g.belege.push(`R0 als Fehlerstrategie${ziel ? ", vorherig vorhanden" : `, O-1 ${r.entscheidungO1}, O-2 ${r.entscheidungO2}`}`);
  return g;
}

/* ------------------------------------------------------- G8, G9 — SSOT */

export function g8Blocker(ssot, prsImKandidaten, freigabe, konfig) {
  const g = gate("G8", "Keine offenen P0/P1-Pakete im Kandidaten");
  if (!ssot || !Array.isArray(ssot.pakete)) return nogo(g, `${konfig.ssot} fehlt oder ist ungültig (fail-closed)`);
  if (!Array.isArray(prsImKandidaten)) return nogo(g, "PR-Liste des Kandidaten nicht ermittelbar (fail-closed)");
  const imKandidat = new Set(prsImKandidaten.map(Number));
  const akzeptiert = new Map((freigabe?.akzeptiertePakete || []).filter((a) => a && a.id && a.grund).map((a) => [a.id, a.grund]));
  for (const p of ssot.pakete) {
    if (!konfig.blocker.prios.includes(p.prio) || !konfig.blocker.status.includes(p.status)) continue;
    const prs = (p.pr || []).map((x) => Number(String(x).replace(/^#/, ""))).filter((x) => imKandidat.has(x));
    if (!prs.length) continue;
    if (akzeptiert.has(p.id)) { g.belege.push(`${p.id} (${p.prio}, ${p.status}) vom Betreiber akzeptiert: ${akzeptiert.get(p.id)}`); continue; }
    nogo(g, `${p.id} (${p.prio}, ${p.status}) steckt im Kandidaten über ${prs.map((x) => "#" + x).join(", ")}`);
  }
  return g;
}

export function g9Befunde(ssot, konfig) {
  const g = gate("G9", "Keine offenen P0/P1-Befunde");
  if (!ssot || !Array.isArray(ssot.pakete)) return nogo(g, `${konfig.ssot} fehlt oder ist ungültig (fail-closed)`);
  const muster = konfig.befund.idMuster.map((m) => new RegExp(m));
  for (const p of ssot.pakete) {
    const istBefund = konfig.befund.straenge.includes(p.strang) || muster.some((m) => m.test(p.id));
    if (!istBefund || !konfig.befund.prios.includes(p.prio) || konfig.befund.erledigt.includes(p.status)) continue;
    nogo(g, `${p.id} (${p.prio}, ${p.status}): ${String(p.titel || "").slice(0, 80)}`);
  }
  return g;
}

/* ------------------------------------------------------- G10 — Freigabe */

export function g10Freigabe({ releaseId, freigabe, freigabeFehler, commitet, kandidat, digest }) {
  const g = gate("G10", "Betreiberfreigabe für diesen Release");
  if (!releaseId) return nogo(g, "--release-id fehlt");
  if (!RELEASE_ID.test(releaseId)) return nogo(g, `Release-ID ungültig: ${releaseId}`);
  if (!freigabe) return nogo(g, `Freigabedatei fehlt oder ist ungültig: ${freigabeFehler || "fehlt"}`);
  if (freigabe.schema !== 1) nogo(g, "Freigabedatei: schema ist nicht 1");
  if (freigabe.releaseId !== releaseId) nogo(g, `Freigabedatei: releaseId ${freigabe.releaseId} ≠ ${releaseId}`);
  if (freigabe.kandidatCommit !== kandidat) nogo(g, `Freigabedatei: kandidatCommit ${freigabe.kandidatCommit} ≠ ${kandidat}`);
  if (freigabe.digest !== digest) nogo(g, `Freigabedatei: digest ${freigabe.digest} ≠ ${digest}`);
  if (freigabe.umgebung !== "produktion") nogo(g, "Freigabedatei: umgebung ist nicht produktion");
  if (!String(freigabe.freigegebenDurch || "").trim()) nogo(g, "Freigabedatei: freigegebenDurch fehlt");
  if (!DATUM.test(String(freigabe.datum || ""))) nogo(g, "Freigabedatei: datum fehlt oder nicht JJJJ-MM-TT");
  if (commitet !== true) nogo(g, "Freigabedatei ist nicht unverändert commitet (git ls-files / git diff)");
  if (g.ergebnis === "GO") g.belege.push(`freigegeben durch ${freigabe.freigegebenDurch} am ${freigabe.datum}`);
  return g;
}

/* ------------------------------------------------------- Gesamtprüfung */

/**
 * Reine Auswertung: bekommt alle Angaben, rechnet alle Gates. Keine Ein-/Ausgabe.
 * eingabe: { kandidat, digest, releaseId, basis, jetztMs, checkRuns, prsImKandidaten, prAngaben,
 *   reviewTexte, schalterQuellTexte, schalterSuchTexte, vorlagen, unfertig, quelltexte, bildRoh,
 *   listeText, berichtVorhanden, geaenderteDateien, neueDateien, diffFehler, nachweise, ssot,
 *   freigabe, freigabeFehler, freigabeCommitet }
 */
export function auswerten(e, konfig = KONFIG_STANDARD) {
  const liste = freigabelisteLesen(e.listeText, konfig.gesperrtEingebaut);
  const freigabe = e.freigabe || null;
  const bericht = e.diffFehler || !e.basis
    ? { fehler: e.diffFehler || "keine Basis (voriger Release) bestimmbar" }
    : migrationsbericht({ basis: e.basis, kandidat: e.kandidat, geaenderteDateien: e.geaenderteDateien, neueDateien: e.neueDateien }, konfig);
  const gates = [
    g1Ci(e.checkRuns, e.kandidat, konfig),
    g2Review(e.prsImKandidaten, e.prAngaben || {}, reviewNachweiseLesen(e.reviewTexte || []), freigabe, ssotReviewBelege(e.ssot)),
    g3Schalter({
      schalter: schalterFinden(e.schalterQuellTexte || [], e.schalterSuchTexte || []),
      vorlagen: e.vorlagen || [], unfertig: e.unfertig, quelltexte: e.quelltexte,
    }, konfig),
    g4Bild({ digest: e.digest, kandidat: e.kandidat, bild: bildAngabenLesen(e.bildRoh), liste, berichtVorhanden: e.berichtVorhanden }, konfig),
    g5Migration(bericht, freigabe),
    g6Sicherung(e.nachweise, e.jetztMs, konfig),
    g7Rueckweg({ liste, kandidat: e.kandidat, digest: e.digest }, freigabe, konfig),
    g8Blocker(e.ssot, e.prsImKandidaten, freigabe, konfig),
    g9Befunde(e.ssot, konfig),
    g10Freigabe({ releaseId: e.releaseId, freigabe, freigabeFehler: e.freigabeFehler, commitet: e.freigabeCommitet, kandidat: e.kandidat, digest: e.digest }),
  ];
  const gesamt = gates.every((g) => g.ergebnis === "GO") ? "GO" : "NO-GO";
  return {
    werkzeug: "release-pruefung", version: VERSION,
    zeitpunkt: Number.isFinite(e.jetztMs) ? new Date(e.jetztMs).toISOString() : null,
    kandidat: e.kandidat || null, digest: e.digest || null, releaseId: e.releaseId || null, basis: e.basis || null,
    paket: { prs: Array.isArray(e.prsImKandidaten) ? [...e.prsImKandidaten].sort((a, b) => a - b) : null },
    gesamt,
    nogo: gates.filter((g) => g.ergebnis !== "GO").map((g) => g.id),
    manuelleBestaetigungen: gates.flatMap((g) => g.manuell.map((m) => `${g.id}: ${m}`)),
    migrationsbericht: bericht,
    gates,
    konfiguration: konfig,
  };
}

/* ------------------------------------------------- Sammeln (Ein-/Ausgabe) */

function git(wurzel, args) {
  return execFileSync("git", args, { cwd: wurzel, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function ghApi(wurzel, pfad, extra = []) {
  return JSON.parse(execFileSync("gh", ["api", ...extra, pfad], { cwd: wurzel, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] }));
}

/** PR-Nummern aus Commit-Betreffs und -Texten: „Merge pull request #N“ und „(#N)“. */
export function prsAusLog(text) {
  const s = new Set();
  for (const m of String(text).matchAll(/Merge pull request #(\d+)/g)) s.add(Number(m[1]));
  for (const m of String(text).matchAll(/\(#(\d+)\)\s*$/gm)) s.add(Number(m[1]));
  return [...s].sort((a, b) => a - b);
}

/** Basis = jüngster freigegebener Stand (aktiv vor vorherig), dessen Commit nicht der Kandidat ist. */
export function basisAusListe(listeText, kandidat) {
  const { zeilen } = freigabelisteLesen(listeText);
  for (const st of ["aktiv", "vorherig"]) {
    const z = zeilen.find((x) => x.status === st && x.commit !== kandidat && HEX40.test(x.commit));
    if (z) return z.commit;
  }
  return null;
}

function nachweiseLesen(verz) {
  if (!verz) return {};
  const l = (n) => { try { return JSON.parse(readFileSync(resolve(verz, n), "utf8")); } catch { return null; } };
  return { sicherung: l("letzte-erfolgreiche.json"), restoreProbe: l("probe-status.json"), widerrufbuchProbe: l("widerrufbuch-probe-status.json") };
}

function dateienRekursiv(wurzel, rel, aus = []) {
  const p = join(wurzel, rel);
  if (!existsSync(p)) return aus;
  if (statSync(p).isFile()) { if (/\.m?js$/.test(rel)) aus.push(rel); return aus; }
  for (const f of readdirSync(p)) dateienRekursiv(wurzel, `${rel}/${f}`, aus);
  return aus;
}

/** Sammelt alle Angaben. Offline kommen Git- und Netzangaben ausschließlich aus der Fixture. */
export function sammeln(opt, konfig = KONFIG_STANDARD) {
  const w = opt.wurzel;
  const fx = opt.fixture || {};
  const e = { releaseId: opt.releaseId, digest: opt.digest, jetztMs: opt.jetztMs };

  // Kandidat
  if (opt.offline) e.kandidat = fx.kandidatCommit;
  else {
    try { e.kandidat = git(w, ["rev-parse", "--verify", `${opt.kandidat}^{commit}`]); } catch { e.kandidat = null; }
  }

  // Dateien aus dem Arbeitsstand (Wurzel)
  e.listeText = lesen(w, konfig.freigabeListe);
  e.basis = opt.basis || fx.basisCommit || basisAusListe(e.listeText, e.kandidat);
  const zeile = freigabelisteLesen(e.listeText).zeilen.find((z) => z.digest === e.digest);
  e.berichtVorhanden = !!(zeile && zeile.bericht && existsSync(join(w, zeile.bericht)));
  e.schalterQuellTexte = konfig.schalterQuellen.map((q) => lesen(w, q)).filter((t) => t != null);
  e.schalterSuchTexte = konfig.schalterSuche.flatMap((q) => dateienRekursiv(w, q)).map((q) => lesen(w, q)).filter((t) => t != null);
  e.vorlagen = konfig.vorlagen.map((v) => ({ ...v, text: lesen(w, v.pfad) }));
  e.unfertig = jsonLesen(lesen(w, konfig.unfertigDatei)).wert;
  e.quelltexte = {};
  for (const f of e.unfertig?.funktionen || []) for (const k of f.quelltextKonstanten || []) e.quelltexte[k.datei] = lesen(w, k.datei);
  e.ssot = jsonLesen(lesen(w, konfig.ssot)).wert;
  const reviewVerz = join(w, "docs", "acc45");
  const praefix = konfig.reviewNachweisPraefix.split("/").pop();
  e.reviewTexte = existsSync(reviewVerz)
    ? readdirSync(reviewVerz).filter((f) => f.startsWith(praefix) && f.endsWith(".md")).map((f) => ({ datei: `docs/acc45/${f}`, text: lesen(w, `docs/acc45/${f}`) }))
    : [];
  if (opt.releaseId && RELEASE_ID.test(opt.releaseId)) {
    const rel = `${konfig.freigabeVerzeichnis}/${opt.releaseId}.freigabe.json`;
    const j = jsonLesen(lesen(w, rel));
    e.freigabe = j.wert && typeof j.wert === "object" ? j.wert : null;
    e.freigabeFehler = j.fehler ? `${rel}: ${j.fehler}` : null;
    if (opt.offline) e.freigabeCommitet = fx.freigabeCommitet === true;
    else {
      try {
        git(w, ["ls-files", "--error-unmatch", "--", rel]);
        e.freigabeCommitet = git(w, ["status", "--porcelain", "--", rel]) === "";
      } catch { e.freigabeCommitet = false; }
    }
  }

  // Bild und Nachweise
  e.bildRoh = fx.bildInfo ?? (opt.bildInfo ? jsonLesen(lesenPfad(opt.bildInfo)).wert : null);
  e.nachweise = fx.nachweise ?? nachweiseLesen(opt.nachweise);

  // Git-Angaben: geänderte Dateien, PRs im Kandidaten
  if (opt.offline) {
    e.checkRuns = fx.checkRuns;
    e.prsImKandidaten = fx.prsImKandidaten;
    e.prAngaben = fx.prs || {};
    e.geaenderteDateien = fx.geaenderteDateien;
    e.neueDateien = fx.neueDateien || [];
    if (!Array.isArray(fx.geaenderteDateien)) e.diffFehler = "Fixture ohne geaenderteDateien";
  } else {
    if (e.kandidat && e.basis) {
      try {
        e.geaenderteDateien = git(w, ["diff", "--name-only", e.basis, e.kandidat]).split("\n").filter(Boolean);
        e.neueDateien = git(w, ["diff", "--name-only", "--diff-filter=A", e.basis, e.kandidat]).split("\n").filter(Boolean);
        e.prsImKandidaten = prsAusLog(git(w, ["log", "--format=%s%n%b", `${e.basis}..${e.kandidat}`]));
      } catch (err) { e.diffFehler = "git diff/log scheiterte: " + String(err.message).split("\n")[0]; }
    }
    if (e.kandidat) {
      try {
        const seiten = ghApi(w, `repos/${konfig.repo}/commits/${e.kandidat}/check-runs?per_page=100`, ["--paginate", "--slurp"]);
        e.checkRuns = seiten.flatMap((s) => s.check_runs || []);
      } catch { e.checkRuns = null; }
    }
    e.prAngaben = {};
    const dok = reviewNachweiseLesen(e.reviewTexte);
    const ssotBeleg = ssotReviewBelege(e.ssot);
    for (const nr of e.prsImKandidaten || []) {
      if (dok.has(nr) || ssotBeleg.has(nr)) continue; // Dokumentbeleg genügt; spart Abfragen
      try {
        const p = ghApi(w, `repos/${konfig.repo}/pulls/${nr}`);
        const r = ghApi(w, `repos/${konfig.repo}/pulls/${nr}/reviews?per_page=100`);
        e.prAngaben[nr] = { body: p.body || "", autor: p.user?.login, reviews: r.map((x) => ({ state: x.state, autor: x.user?.login })) };
      } catch { /* ohne Angaben: G2 listet den PR zur manuellen Bestätigung */ }
    }
  }
  return e;
}

/* ------------------------------------------------------------------ CLI */

export function argumenteLesen(argv) {
  const o = {};
  const mitWert = new Set(["--kandidat", "--digest", "--release-id", "--basis", "--bild-info", "--nachweise", "--jetzt", "--konfig", "--wurzel", "--fixture"]);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (mitWert.has(a)) {
      const v = argv[++i];
      if (v === undefined || v.startsWith("--")) throw new Error(`${a} braucht einen Wert`);
      o[a.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = v;
    } else if (a === "--offline") o.offline = true;
    else if (a === "--kurz") o.kurz = true;
    else if (a === "--konfig-zeigen") o.konfigZeigen = true;
    else throw new Error(`unbekannte Option: ${a}`);
  }
  return o;
}

export function kurzfassung(r) {
  const z = [`Release-Prüfung ${r.releaseId || "<ohne id>"} · Kandidat ${r.kandidat || "?"} · ${r.gesamt}`];
  for (const g of r.gates) {
    z.push(`  ${g.id.padEnd(3)} ${g.ergebnis.padEnd(5)} ${g.name}`);
    for (const x of g.gruende.slice(0, 8)) z.push(`        - ${x}`);
    if (g.gruende.length > 8) z.push(`        … ${g.gruende.length - 8} weitere`);
  }
  return z.join("\n");
}

function main(argv) {
  let o;
  try { o = argumenteLesen(argv); } catch (err) { console.error("Aufruf: " + err.message); return 2; }
  let konfig = KONFIG_STANDARD;
  if (o.konfig) {
    const j = jsonLesen(lesenPfad(o.konfig));
    if (!j.wert) { console.error(`Konfiguration ${o.konfig}: ${j.fehler}`); return 2; }
    konfig = { ...KONFIG_STANDARD, ...j.wert };
  }
  if (o.konfigZeigen) { console.log(JSON.stringify(konfig, null, 2)); return 0; }
  const wurzel = resolve(o.wurzel || fileURLToPath(new URL("..", import.meta.url)));
  let fixture = null;
  if (o.offline) {
    if (!o.fixture) { console.error("Aufruf: --offline braucht --fixture <datei.json>"); return 2; }
    const j = jsonLesen(lesenPfad(o.fixture));
    if (!j.wert) { console.error(`Fixture ${o.fixture}: ${j.fehler}`); return 2; }
    fixture = j.wert;
  } else if (!o.kandidat) { console.error("Aufruf: --kandidat <sha|branch> fehlt"); return 2; }
  const jetztMs = o.jetzt ? Date.parse(o.jetzt) : Date.now();
  if (!Number.isFinite(jetztMs)) { console.error("Aufruf: --jetzt ist keine Zeit"); return 2; }
  const e = sammeln({ ...o, wurzel, fixture, jetztMs }, konfig);
  const r = auswerten(e, konfig);
  if (o.kurz) console.log(kurzfassung(r));
  else { console.log(JSON.stringify(r, null, 2)); console.error(kurzfassung(r)); }
  return r.gesamt === "GO" ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
