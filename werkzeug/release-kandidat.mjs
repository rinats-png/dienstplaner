#!/usr/bin/env node
/* ==========================================================================
   RELEASE-KANDIDAT (RST-2) — Schnitt eines Kandidaten vorbereiten

   Standard ist der TROCKENLAUF: Er liest nur und erzeugt die Unterlagen, die
   der Betreiber für einen Release-Kandidaten braucht (docs/acc45/RELEASE-PROZESS.md
   Abschnitt 5 und 6): Vorlage der Freigabedatei mit vorlagenHashes, G2-Belegliste,
   G8/G9-Listen, Pfadklassen, Gate-Voraussetzungen und die Übergabe (nächste Schritte).

   Grenzen (bewusst, unveränderlich):
     - Der Trockenlauf ändert nichts: kein Zweig, kein Commit, keine Datei im
       Repository. Er liest ausschließlich aus dem angegebenen Schnitt-Commit
       (`git show/ls-tree/diff/log` auf genau diesem SHA); gleiche Eingabe gibt
       byte-gleiche Ausgabe (keine Uhrzeit, keine Hosts, keine Schlüssel).
     - `--ausgabe <verz>` schreibt die Unterlagen als Dateien, aber nur AUSSERHALB
       des Repositorys und nie über eine bestehende, abweichende Datei.
     - `--anlegen` legt ausschließlich einen LOKALEN Zweig release/rc-<id> auf dem
       Schnitt-Commit an (ohne Checkout). Er ändert nie einen bestehenden Kandidaten
       (lokal oder auf dem Remote vorhandener Zweig, vergebene Release-ID: Abbruch).
     - Kein Push, kein PR, kein Merge, kein Workflow, kein Bildbau, kein Deploy,
       kein Aufruf von gh/curl. Netz nur `git ls-remote` (lesend) bei `--anlegen`.
       Push und Entwurfs-PR stehen als Befehlstext in der Übergabe; sie führt die
       Koordination bzw. der Betreiber aus.
     - Das Werkzeug erklärt nie „bereit“ oder „GO“: `freigabeBereit` ist immer false.
       Was nicht ermittelbar ist, steht als „nicht bewertbar“ (fail-closed, Exit 1).
     - Gate-Logik und Konfiguration bleiben in werkzeug/release-pruefung.mjs; dieses
       Werkzeug ruft deren Funktionen (G8, G9, Freigabeliste) und deren Vorlagen-
       Hashes nur lesend auf und ändert sie nicht.

   Aufruf:
     node werkzeug/release-kandidat.mjs --kandidat <schnitt-commit> --basis <voriger-release-commit>
         --release-id <id> [--ausgabe <verzeichnis>] [--wurzel <repo>] [--kurz]
     node werkzeug/release-kandidat.mjs … --anlegen     (nur lokaler Zweig release/rc-<id>)
   Umgebung: KANDIDAT_REMOTE (Standard origin) für die Prüfung auf einen bestehenden Remote-Zweig.
   Rückgabe: 0 Unterlagen vollständig erzeugt (kein Freigabeurteil) · 1 nicht bewertbar oder
   Anlegen verweigert · 2 Aufruffehler.
   ========================================================================== */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  KONFIG_STANDARD, freigabelisteLesen, g8Blocker, g9Befunde, prsAusCommits, revisionAufloesen, sicher,
} from "./release-pruefung.mjs";

const HIER = path.dirname(fileURLToPath(import.meta.url));
export const VERSION = 1;
const RELEASE_ID = /^[a-z0-9][a-z0-9._-]{2,63}$/;
const GRENZE = { prs: 2000, direkt: 100, kritisch: 50, gruende: 50, betreff: 80 };
const ZEITGRENZE_MS = 60_000;

/** Ausführung aller Fremdprozesse (im Test ersetzbar und protokollierbar). */
export const lauf = { exec: execFileSync };

const optionen = (cwd, extra = {}) => ({
  cwd, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"], timeout: ZEITGRENZE_MS,
  env: { ...process.env, GIT_NO_REPLACE_OBJECTS: "1" }, ...extra,
});
const git = (w, args, extra) => lauf.exec("git", args, optionen(w, extra));
const versuch = (f) => { try { return f(); } catch { return null; } };

/** Alle Zeichen der Klassen C, Zl, Zp und besondere Leerzeichen als Escape (keine Terminal-/Log-Injektion). */
function tiefSicher(x) {
  if (typeof x === "string") return sicher(x);
  if (Array.isArray(x)) return x.map(tiefSicher);
  if (x && typeof x === "object") return Object.fromEntries(Object.entries(x).map(([k, v]) => [sicher(k), tiefSicher(v)]));
  return x;
}

/* ------------------------------------------------------------ Pfadklassen */

/** Reihenfolge zählt (erste Übereinstimmung). nahAnAuslieferung ist eine Einordnung, keine Ableitung aus dem Dockerfile. */
export const PFADKLASSEN = Object.freeze([
  { id: "workflows", muster: /^\.github\//, nahAnAuslieferung: false },
  { id: "server", muster: /^(server\/|server\.mjs$)/, nahAnAuslieferung: true },
  { id: "app", muster: /^(src\/|public\/|vendor\/|index\.html$|vite\.config\.js$)/, nahAnAuslieferung: true },
  { id: "deploy-vorlagen", muster: /^(deploy\/|Dockerfile|(docker-)?compose[^/]*\.ya?ml$|\.env|\.dockerignore$)/, nahAnAuslieferung: true },
  { id: "paketkette", muster: /^package(-lock)?\.json$/, nahAnAuslieferung: true },
  { id: "pruefungen", muster: /^(pruefungen\/|e2e\/|playwright\.config\.mjs$)/, nahAnAuslieferung: false },
  { id: "werkzeug", muster: /^werkzeug\//, nahAnAuslieferung: false },
  { id: "docs", muster: /^docs\//, nahAnAuslieferung: false },
  { id: "website-marketing", muster: /^(website|marketing)\//, nahAnAuslieferung: false },
  { id: "sonstiges", muster: /./, nahAnAuslieferung: false },
]);
const KRITISCH = /^(\.github\/|deploy\/|Dockerfile|(docker-)?compose|\.env|server\.mjs$|package(-lock)?\.json$)/;

export function pfadklasse(pfad) {
  return PFADKLASSEN.find((k) => k.muster.test(pfad)).id;
}

export function pfadklassenZaehlen(pfade) {
  const zaehler = Object.fromEntries(PFADKLASSEN.map((k) => [k.id, 0]));
  for (const p of pfade) zaehler[pfadklasse(p)]++;
  return zaehler;
}

/* --------------------------------------------------------------- Sammeln */

const nichtBewertbar = (grund) => ({ bewertbar: false, grund });

function lesenAus(w, rev, pfad) {
  return versuch(() => git(w, ["show", `${rev}:${pfad}`], { stdio: ["ignore", "pipe", "ignore"] }));
}
const jsonAus = (w, rev, pfad) => { const t = lesenAus(w, rev, pfad); try { return t == null ? null : JSON.parse(t); } catch { return null; } };

function basisUndBereich(w, basis, kandidat) {
  if (basis === kandidat) return nichtBewertbar("Basis = Kandidat (leerer Bereich)");
  if (versuch(() => git(w, ["rev-parse", "--is-shallow-repository"]).trim()) !== "false") return nichtBewertbar("flacher oder unlesbarer Klon: Geschichte unvollständig (voller Klon nötig)");
  if (versuch(() => git(w, ["merge-base", "--is-ancestor", basis, kandidat]) ?? "") === null) return nichtBewertbar("Basis ist kein Vorfahr des Kandidaten");
  const anzahl = Number(versuch(() => git(w, ["rev-list", "--count", `${basis}..${kandidat}`]).trim()));
  if (!(anzahl > 0)) return nichtBewertbar("Bereich leer oder nicht ermittelbar");
  const liste = freigabelisteLesen(lesenAus(w, kandidat, KONFIG_STANDARD.freigabeListe));
  if (liste.fehler.length) return nichtBewertbar(`Freigabeliste im Schnitt ungültig: ${liste.fehler[0]}`);
  const zeilen = liste.zeilen.filter((z) => z.commit === basis);
  if (!zeilen.some((z) => z.status === "aktiv" || z.status === "vorherig")) return nichtBewertbar("Basis steht in der Freigabeliste des Schnitts nicht als aktiv oder vorherig");
  return { bewertbar: true, anzahlCommits: anzahl, basisStatus: zeilen.find((z) => z.status === "aktiv" || z.status === "vorherig").status };
}

function commitsLesen(w, basis, kandidat) {
  const roh = versuch(() => git(w, ["log", "-z", "--format=%H%x1f%P%x1f%s", `${basis}..${kandidat}`]));
  const ersteElter = versuch(() => git(w, ["rev-list", "--first-parent", `${basis}..${kandidat}`]).split("\n").filter(Boolean));
  if (roh == null || ersteElter == null) return null;
  const alle = roh.split("\0").filter(Boolean).map((z) => { const [sha, eltern, betreff] = z.split("\x1f"); return { sha, eltern: (eltern || "").split(" ").filter(Boolean), betreff: betreff || "" }; });
  return { alle, ersteElter: new Set(ersteElter) };
}

function g2Belegliste(c) {
  const prs = prsAusCommits(c.alle);
  const direkt = c.alle.filter((x) => c.ersteElter.has(x.sha) && prsAusCommits([x]).length === 0)
    .map((x) => ({ sha: x.sha, betreff: x.betreff.slice(0, GRENZE.betreff) })).sort((a, b) => a.sha.localeCompare(b.sha));
  return {
    hinweis: "Nur Kandidatenliste aus den Commit-Betreffs. Belege (GitHub-Review eines anderen Kontos, REVIEW-NACHWEIS, SSOT reviewt) und die Bestätigung der PRs prüft release-pruefung G2 online.",
    prs: prs.slice(0, GRENZE.prs).map((nr) => ({ pr: nr, beleg: null })),
    prsGesamt: prs.length,
    prsGekuerzt: Math.max(0, prs.length - GRENZE.prs),
    commitsOhnePrBetreff: direkt.slice(0, GRENZE.direkt),
    commitsOhnePrBetreffGesamt: direkt.length,
    commitsOhnePrBetreffGekuerzt: Math.max(0, direkt.length - GRENZE.direkt),
  };
}

function g8g9Listen(w, kandidat, prs) {
  const ssot = jsonAus(w, kandidat, KONFIG_STANDARD.ssot);
  if (ssot == null) return nichtBewertbar(`${KONFIG_STANDARD.ssot} im Schnitt fehlt oder ist unlesbar`);
  const unfertig = jsonAus(w, kandidat, KONFIG_STANDARD.unfertigDatei);
  const klassen = jsonAus(w, kandidat, KONFIG_STANDARD.schalterDatei);
  let g8; let g9;
  try {
    g8 = g8Blocker(ssot, prs, null, KONFIG_STANDARD, unfertig, klassen);
    g9 = g9Befunde(ssot, null, KONFIG_STANDARD);
  } catch (e) { return nichtBewertbar(`SSOT-Auswertung fehlgeschlagen: ${String(e && e.message).slice(0, 120)}`); }
  const roh = (g) => ({
    // Vorschau ohne Betreiber-Annahmen; kein Freigabeurteil
    vorschau: g.ergebnis === "GO" ? "keine Blocker gefunden (Vorschau)" : "Blocker vorhanden",
    blocker: g.gruende.slice(0, GRENZE.gruende), blockerGesamt: g.gruende.length,
    blockerGekuerzt: Math.max(0, g.gruende.length - GRENZE.gruende),
  });
  return {
    bewertbar: true,
    g8: roh(g8),
    g9: roh(g9),
    unfertigeFunktionenListeGelesen: unfertig != null,
    schalterklassenGelesen: klassen != null,
  };
}

function vorlagenHashes(w, basis, kandidat) {
  let r;
  try {
    r = lauf.exec("node", [path.join(HIER, "release-pruefung.mjs"), "--vorlagen-hashes", "--kandidat", kandidat, "--basis", basis, "--wurzel", w], optionen(w, { stdio: ["ignore", "pipe", "pipe"] }));
  } catch (e) {
    return nichtBewertbar(`Vorlagen-Hashes nicht ermittelbar (release-pruefung Exit ${e && e.status != null ? e.status : "?"}): nicht gelistete oder unlesbare Vorlage`);
  }
  try {
    const j = JSON.parse(r);
    if (!j || typeof j.vorlagenHashes !== "object" || j.vorlagenHashes == null) return nichtBewertbar("Vorlagen-Hashes: unerwartete Ausgabe");
    const sortiert = Object.fromEntries(Object.entries(j.vorlagenHashes).sort(([a], [b]) => a.localeCompare(b)));
    const vergleich = j.vergleichMitBasis ? Object.fromEntries(Object.entries(j.vergleichMitBasis).sort(([a], [b]) => a.localeCompare(b)).map(([f, v]) => [f, v.status])) : null;
    return { bewertbar: true, hashes: sortiert, vergleichMitBasis: vergleich };
  } catch { return nichtBewertbar("Vorlagen-Hashes: Ausgabe nicht lesbar"); }
}

function pfadAnalyse(w, basis, kandidat) {
  const roh = versuch(() => git(w, ["diff", "--name-only", "-z", "--no-renames", basis, kandidat]));
  if (roh == null) return nichtBewertbar("Änderungsliste nicht ermittelbar");
  const pfade = [...new Set(roh.split("\0").filter(Boolean))].sort();
  const klassen = pfadklassenZaehlen(pfade);
  const kritisch = pfade.filter((p) => KRITISCH.test(p));
  const startquellen = KONFIG_STANDARD.startschreibvorgaenge.filter((s) => s.quellen.some((q) => pfade.includes(q))).map((s) => s.id);
  if (KONFIG_STANDARD.startblockQuellen.some((q) => pfade.includes(q))) startquellen.push("STARTBLOCK");
  return {
    bewertbar: true,
    geaenderteDateien: pfade.length,
    pfadklassen: PFADKLASSEN.map((k) => ({ klasse: k.id, nahAnAuslieferung: k.nahAnAuslieferung, dateien: klassen[k.id] })),
    kritischeDateien: kritisch.slice(0, GRENZE.kritisch),
    kritischeDateienGesamt: kritisch.length,
    kritischeDateienGekuerzt: Math.max(0, kritisch.length - GRENZE.kritisch),
    startschreibvorgaengeBetroffen: startquellen.sort(),
  };
}

const GATES = [
  ["G1", "CI auf dem Kandidaten-SHA (Check-Runs)", "online auf dem Release-Commit M; im Trockenlauf nicht bewertbar"],
  ["G2", "Review-Belege je PR", "Belegliste erzeugt (g2Belege); Belege und PR-Bestätigung prüft release-pruefung online"],
  ["G3", "Schalter und Vorlagen", "Vorlagen-Hashes erzeugt; Schalter- und Grammatikprüfung nur durch release-pruefung"],
  ["G4", "Bild, Digest, Freigabeliste", "Endprüfung: braucht Digest, Bildangaben und die Zeile aktiv; nicht bewertbar"],
  ["G5", "Migration (Startschreibvorgänge)", "betroffene Quellen aufgelistet (startschreibvorgaengeBetroffen); Bericht und Freigabe nur durch release-pruefung und Betreiber"],
  ["G6", "Sicherung, Restore-Probe, Widerrufbuch-Probe", "Endprüfung: braucht Nachweise des Betreibers; nicht bewertbar"],
  ["G7", "Rückweg", "Endprüfung: braucht Zeile vorherig und Freigabedatei; nicht bewertbar"],
  ["G8", "Keine offenen P0/P1-Pakete im Kandidaten", "Vorschau erzeugt (g8g9Listen), ohne Betreiber-Annahmen"],
  ["G9", "Keine offenen P0/P1-Befunde", "Vorschau erzeugt (g8g9Listen), ohne Betreiber-Annahmen"],
  ["G10", "Betreiberfreigabe (Freigabedatei)", "Endprüfung: Vorlage erzeugt, Freigabe und Commit nur durch den Betreiber"],
].map(([id, name, trockenlauf]) => ({ gate: id, name, trockenlauf, bewertung: "nicht bewertet" }));

function freigabeVorlage(releaseId, basis, kandidat, hashes) {
  return {
    schema: 1,
    releaseId,
    schnittCommit: kandidat,
    kandidatCommit: null,
    digest: null,
    umgebung: "produktion",
    freigegebenDurch: null,
    datum: null,
    basisCommit: basis,
    vorlagenHashes: hashes ?? null,
    rueckweg: { strategie: null },
    reviewBestaetigt: [],
    akzeptiertePakete: [],
    akzeptierteBefunde: [],
    akzeptierteCommits: [],
    freigegebeneSchalter: [],
  };
}

function uebergabeText(releaseId, basis, kandidat, rc) {
  return [
    `# Übergabe Kandidat ${releaseId}`,
    "",
    `Schnitt-Commit S: ${kandidat}`,
    `Basis (voriger Release): ${basis}`,
    `rc-Zweig (Vorschlag): ${rc}`,
    "",
    "Dieses Dokument ist eine Vorbereitung, kein Freigabeurteil. Das Werkzeug hat nichts gepusht, nichts gemergt und nichts ausgelöst.",
    "",
    "Nächste Schritte (je Schritt führt ihn die genannte Rolle aus):",
    "",
    `1. Koordination: lokalen Zweig anlegen: node werkzeug/release-kandidat.mjs --kandidat ${kandidat} --basis ${basis} --release-id ${releaseId} --ausgabe <verzeichnis außerhalb des Repositorys> --anlegen`,
    `2. Koordination (Maschinenkonto): Zweig einmal pushen und Entwurfs-PR öffnen: git push origin ${rc} und gh pr create --draft --base main --head ${rc}. Das Werkzeug führt beides nicht aus.`,
    `3. Claude: Vorprüfung aus dem Kandidaten-Worktree: node werkzeug/release-pruefung.mjs --kandidat ${kandidat} --basis ${basis} --digest <sha256:…> --release-id ${releaseId} --bild-info <datei>`,
    "4. Betreiber: Release-PR nach main mergen (Release-Commit M), Bildbau und Auslieferung selbst auslösen.",
    "5. Betreiber: Freigabedatei aus der Vorlage (freigabe-vorlage.json) ausfüllen: kandidatCommit = M, digest, freigegebenDurch, datum, rueckweg, Annahmen mit Grund; als docs/acc45/releases/<id>.freigabe.json commiten.",
    "6. Claude: Endprüfung auf main-HEAD (release-pruefung ohne Übersteuerung); nur Exit 0 zählt.",
    "",
    "Zu beachten: Die Vorlagen-Hashes gelten für den Baum von S; nach dem Release-Merge ist Baum(M) = Baum(S), die Hashes bleiben gleich (RELEASE-PROZESS Abschnitt 1).",
    "",
  ].join("\n");
}

/** Gesamtlauf (lesend). Liefert das Ergebnisobjekt; die CLI gibt es aus. */
export function trockenlauf({ wurzel, kandidat: kRev, basis: bRev, releaseId }) {
  const kandidat = revisionAufloesen(wurzel, kRev);
  const basis = revisionAufloesen(wurzel, bRev);
  if (!kandidat || !basis) return { aufrufFehler: !kandidat ? "--kandidat ist kein Commit" : "--basis ist kein Commit" };
  const rc = `release/rc-${releaseId}`;
  const baum = versuch(() => git(wurzel, ["rev-parse", `${kandidat}^{tree}`]).trim());
  const abschnitte = {};
  abschnitte.basis = basisUndBereich(wurzel, basis, kandidat);
  const vergeben = versuch(() => { git(wurzel, ["cat-file", "-e", `${kandidat}:docs/acc45/releases/${releaseId}.freigabe.json`]); return true; });
  abschnitte.releaseId = vergeben ? nichtBewertbar("Release-ID ist im Schnitt schon vergeben (Freigabedatei vorhanden)") : { bewertbar: true };
  const c = abschnitte.basis.bewertbar ? commitsLesen(wurzel, basis, kandidat) : null;
  if (abschnitte.basis.bewertbar && c == null) abschnitte.basis = nichtBewertbar("Commit-Liste nicht ermittelbar");
  const g2 = c ? g2Belegliste(c) : null;
  abschnitte.g2 = c ? { bewertbar: true } : nichtBewertbar("Commit-Liste fehlt");
  abschnitte.g8g9 = c ? g8g9Listen(wurzel, kandidat, prsAusCommits(c.alle)) : nichtBewertbar("Commit-Liste fehlt");
  abschnitte.pfade = abschnitte.basis.bewertbar ? pfadAnalyse(wurzel, basis, kandidat) : nichtBewertbar("Basis ungeeignet");
  abschnitte.vorlagen = abschnitte.basis.bewertbar ? vorlagenHashes(wurzel, basis, kandidat) : nichtBewertbar("Basis ungeeignet");
  const bewertbar = baum != null && Object.values(abschnitte).every((a) => a.bewertbar);
  const hashes = abschnitte.vorlagen.bewertbar ? abschnitte.vorlagen.hashes : null;
  const nichtBew = Object.entries(abschnitte).filter(([, a]) => !a.bewertbar).map(([k, a]) => `${k}: ${a.grund}`);
  if (baum == null) nichtBew.push("schnitt: Baum nicht ermittelbar");
  const ergebnis = {
    werkzeug: "release-kandidat",
    version: VERSION,
    modus: "trockenlauf",
    releaseId,
    schnittCommit: kandidat,
    schnittBaum: baum,
    basisCommit: basis,
    rcZweig: rc,
    status: bewertbar ? "unterlagen-erzeugt" : "nicht-bewertbar",
    freigabeBereit: false,
    nichtBewertbarGruende: nichtBew.sort(),
    basis: abschnitte.basis.bewertbar ? { commits: abschnitte.basis.anzahlCommits, listenstatus: abschnitte.basis.basisStatus } : null,
    pfade: abschnitte.pfade.bewertbar ? abschnitte.pfade : null,
    g2Belege: g2,
    g8g9Listen: abschnitte.g8g9.bewertbar ? abschnitte.g8g9 : null,
    vorlagenVergleichMitBasis: abschnitte.vorlagen.bewertbar ? abschnitte.vorlagen.vergleichMitBasis : null,
    gateVoraussetzungen: GATES,
    freigabeVorlage: bewertbar ? freigabeVorlage(releaseId, basis, kandidat, hashes) : null,
    uebergabe: bewertbar ? uebergabeText(releaseId, basis, kandidat, rc) : null,
  };
  // Die Übergabe besteht nur aus geprüften Werten (40 Hex, Release-ID-Muster) und eigenem Text; Zeilenumbrüche bleiben.
  const { uebergabe, ...rest } = ergebnis;
  return { ...tiefSicher(rest), uebergabe };
}

/* ---------------------------------------------------------------- Ausgabe */

const dateien = (e) => ({
  "kandidat-trockenlauf.json": JSON.stringify({ ...e, freigabeVorlage: undefined, uebergabe: undefined }, null, 2) + "\n",
  "freigabe-vorlage.json": JSON.stringify(e.freigabeVorlage, null, 2) + "\n",
  "g2-belege.json": JSON.stringify(e.g2Belege, null, 2) + "\n",
  "g8-g9-listen.json": JSON.stringify(e.g8g9Listen, null, 2) + "\n",
  "uebergabe.md": e.uebergabe,
});

const innerhalb = (kind, eltern) => { const r = path.relative(eltern, kind); return r === "" || (!r.startsWith("..") && !path.isAbsolute(r)); };

/** Schreibt die Unterlagen außerhalb des Repositorys; überschreibt nie eine abweichende Datei. Fehlertext oder null. */
export function unterlagenSchreiben(wurzel, verz, e) {
  const ziel = path.resolve(verz);
  const wurzelReal = versuch(() => realpathSync(versuch(() => git(wurzel, ["rev-parse", "--show-toplevel"]).trim()) || wurzel));
  if (!wurzelReal) return "Repository-Wurzel nicht ermittelbar";
  const zielReal = (() => { let p = ziel; while (!existsSync(p)) p = path.dirname(p); return path.join(realpathSync(p), path.relative(p, ziel)); })();
  if (innerhalb(zielReal, wurzelReal)) return "--ausgabe liegt im Repository (die Unterlagen entstehen außerhalb des Kandidaten)";
  const inhalt = dateien(e);
  for (const [name, text] of Object.entries(inhalt)) {
    const p = path.join(ziel, name);
    if (existsSync(p) && readFileSync(p, "utf8") !== text) return `${name} existiert mit abweichendem Inhalt (wird nie überschrieben)`;
  }
  mkdirSync(ziel, { recursive: true });
  for (const [name, text] of Object.entries(inhalt)) {
    const p = path.join(ziel, name);
    if (!existsSync(p)) writeFileSync(p, text, { flag: "wx" });
  }
  return null;
}

/* ---------------------------------------------------------------- Anlegen */

/** Legt lokal release/rc-<id> auf dem Schnitt-Commit an. Ändert nie einen bestehenden Kandidaten. { ok, text }. */
export function rcAnlegen(wurzel, e, remote = process.env.KANDIDAT_REMOTE || "origin") {
  if (e.status !== "unterlagen-erzeugt") return { ok: false, text: "nicht bewertbar: kein Zweig angelegt (fail-closed)" };
  const ref = `refs/heads/${e.rcZweig}`;
  if (versuch(() => git(wurzel, ["check-ref-format", ref])) === null) return { ok: false, text: "Zweigname ungültig" };
  const lokal = versuch(() => git(wurzel, ["rev-parse", "--verify", "--quiet", "--end-of-options", ref]).trim());
  if (lokal && lokal !== e.schnittCommit) return { ok: false, text: `${e.rcZweig} existiert lokal auf einem anderen Commit: bestehender Kandidat bleibt unverändert` };
  const entfernt = versuch(() => git(wurzel, ["ls-remote", "--heads", "--", remote, ref]).trim());
  if (entfernt == null) return { ok: false, text: "Remote nicht lesbar: Vorhandensein des Zweigs nicht prüfbar (fail-closed), nichts angelegt" };
  if (entfernt !== "") {
    const sha = entfernt.split(/\s+/)[0];
    return { ok: false, text: `${e.rcZweig} existiert auf dem Remote${sha === e.schnittCommit ? " (gleicher Commit)" : " auf einem anderen Commit"}: bestehender Kandidat bleibt unverändert` };
  }
  if (lokal) return { ok: true, text: `${e.rcZweig} liegt lokal schon auf dem Schnitt-Commit: nichts geändert` };
  git(wurzel, ["branch", "--no-track", e.rcZweig, e.schnittCommit]);
  return { ok: true, text: `${e.rcZweig} lokal angelegt auf ${e.schnittCommit}; nicht gepusht (Push und Entwurfs-PR siehe Übergabe)` };
}

/* -------------------------------------------------------------------- CLI */

export function argumenteLesen(argv) {
  const o = {};
  const mitWert = new Set(["--kandidat", "--basis", "--release-id", "--ausgabe", "--wurzel"]);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (mitWert.has(a)) {
      const v = argv[++i];
      if (v === undefined || v.startsWith("--")) throw new Error(`${a} braucht einen Wert`);
      o[a.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = v;
    } else if (a === "--anlegen") o.anlegen = true;
    else if (a === "--kurz") o.kurz = true;
    else throw new Error(`unbekannte Option: ${a}`);
  }
  return o;
}

export function kurzfassung(e) {
  const z = [`Kandidat ${e.releaseId} · Schnitt ${e.schnittCommit} · Basis ${e.basisCommit} · ${e.status} · freigabeBereit: false`];
  for (const g of e.nichtBewertbarGruende) z.push(`  nicht bewertbar - ${g}`);
  if (e.pfade) z.push(`  ${e.pfade.geaenderteDateien} Dateien; kritisch: ${e.pfade.kritischeDateienGesamt}; Start-Schreibvorgänge: ${e.pfade.startschreibvorgaengeBetroffen.join(", ") || "keine"}`);
  if (e.g2Belege) z.push(`  G2-Kandidaten: ${e.g2Belege.prsGesamt} PRs, ${e.g2Belege.commitsOhnePrBetreffGesamt} Commits ohne PR-Betreff`);
  if (e.g8g9Listen) z.push(`  G8: ${e.g8g9Listen.g8.vorschau} (${e.g8g9Listen.g8.blockerGesamt}); G9: ${e.g8g9Listen.g9.vorschau} (${e.g8g9Listen.g9.blockerGesamt})`);
  return z.join("\n");
}

const fehler = (s) => console.error(sicher(s));

export function main(argv) {
  let o;
  try { o = argumenteLesen(argv); } catch (err) { fehler("Aufruf: " + err.message); return 2; }
  if (!o.kandidat || !o.basis || !o.releaseId || !RELEASE_ID.test(o.releaseId)) {
    fehler("Aufruf: --kandidat <commit> --basis <commit> --release-id <id> [--ausgabe <verz>] [--anlegen] [--wurzel <repo>] [--kurz]");
    return 2;
  }
  const wurzel = path.resolve(o.wurzel || path.join(HIER, ".."));
  let e;
  try { e = trockenlauf({ wurzel, kandidat: o.kandidat, basis: o.basis, releaseId: o.releaseId }); } catch (err) {
    fehler("Lesefehler: " + (err && err.message));
    return 1;
  }
  if (e.aufrufFehler) { fehler("Aufruf: " + e.aufrufFehler); return 2; }
  let ausgabeFehler = null;
  if (o.ausgabe) {
    if (e.status !== "unterlagen-erzeugt") ausgabeFehler = "nicht bewertbar: keine Unterlagen geschrieben (fail-closed)";
    else ausgabeFehler = unterlagenSchreiben(wurzel, o.ausgabe, e);
    if (ausgabeFehler) fehler("Ausgabe verweigert: " + ausgabeFehler);
  }
  let anlegen = null;
  if (o.anlegen && !ausgabeFehler) {
    anlegen = rcAnlegen(wurzel, e);
    fehler("Anlegen: " + anlegen.text);
  }
  if (o.kurz) console.log(kurzfassung(e));
  else { console.log(JSON.stringify(e, null, 2)); console.error(kurzfassung(e)); }
  if (ausgabeFehler || (anlegen && !anlegen.ok)) return 1;
  return e.status === "unterlagen-erzeugt" ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
