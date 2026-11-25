#!/usr/bin/env node
/* ==========================================================================
   SICHERHEIT – Geheimnis-Suche über die gesamte Git-Historie
   (interne Prüfung 2026-11, Prüfpunkt 3)

   Ergänzt gitleaks in .github/workflows/sicherheit.yml um einen lokalen,
   abhängigkeitsfreien Lauf. Gelesen wird `git log -p --all --remerge-diff`
   (jede Fassung jeder Datei auf allen Zweigen, auch gelöschte Dateien, dazu
   was Merge-Commits selbst einbringen); geprüft werden nur hinzugefügte
   Zeilen. Zusätzlich Commit-Nachricht und Autor-/Committer-Felder
   (`git log -z`). Die Datei eines Treffers stammt nur aus dem Diff-Kopf
   (Review #450, A1); ist sie nicht sicher bestimmbar, bleibt der Fund offen.

   Das Repo ist ÖFFENTLICH: Die Ausgabe nennt NIE den gefundenen Wert, nur
   Commit (kurz), Datei, Regel und die Länge des Treffers. Platzhalter
   (beispiel, example, xxx, <...>, ${...}, process.env) gelten nicht als Fund.

   Binärdateien (SI-P10): `--text` erzwingt den Textdiff auch für Dateien mit
   NUL-Byte oder `.gitattributes` `-diff`/`binary`; siehe GIT_BASIS_ARGS.

   Aufruf:   node werkzeug/sicherheit/geheimnisse.mjs [--nur-arbeitsstand | --remotes[=<name>]]
             ohne Option: `--all` (alle Referenzen, auch lokale Zweige und Stash;
             so in CI); `--remotes`: nur `--remotes=origin`;
             `--nur-arbeitsstand` mit `--remotes`: Rückgabe 2 (nicht kombinierbar)
   Ausgang:  0 = keine Funde, 1 = Funde (ohne Werte gelistet),
             2 = Aufruf- oder git-Fehler, kein Commit geprüft
   ========================================================================== */

import { spawn as nodeSpawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { StringDecoder } from "node:string_decoder";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export const REGELN = [
  { name: "privater Schlüssel (PEM)", re: /-----BEGIN (RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY( BLOCK)?-----/ },
  { name: "AWS-Zugangsschlüssel", re: /\b(AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { name: "GitHub-Token", re: /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b|\bgithub_pat_[A-Za-z0-9_]{60,}\b/ },
  { name: "Slack-Token", re: /\bxox[abprs]-[A-Za-z0-9-]{10,}/ },
  { name: "Stripe-Schlüssel", re: /\b(sk|rk)_(live|test)_[A-Za-z0-9]{20,}\b/ },
  { name: "Resend-Schlüssel", re: /\bre_[A-Za-z0-9]{8,}_[A-Za-z0-9]{16,}\b/ },
  { name: "Anthropic/OpenAI-Schlüssel", re: /\bsk-(ant-)?[A-Za-z0-9_-]{32,}\b/ },
  { name: "Google-API-Schlüssel", re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: "JWT", re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
  { name: "VAPID privat (Wert)", re: /VAPID_PRIVATE\s*[=:]\s*["']?[A-Za-z0-9_-]{40,}/ },
  { name: "URL mit Zugangsdaten", re: /\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@"'<>]{2,}:[^\s:/@"'<>]{6,}@[^\s"'<>]+/i },
  { name: "Zuweisung Geheimnis-Variable", re: /\b(CENTRIC_PFEFFER|RESEND_API_KEY|REDIS_REST_TOKEN|SMTP_PASS(WORD)?|[A-Z_]*(SECRET|PASSWORT|PASSWORD|API_KEY|TOKEN))\s*[=:]\s*["']?[A-Za-z0-9+/_=.-]{16,}/ },
];

/* Erkennbare Prüfwerte zählen als Platzhalter — nun je Treffer, nicht je Zeile. */
const PLATZHALTER = /beispiel|example|xxxx|changeme|dummy|platzhalter|nur[-_]zum[-_]pruefen|kein[-_]echter|synthetisch|proben|0123456789|9876543210|<[^>]+>|\$\{|process\.env|\.\.\.|test-?geheim|nicht-geheim|AAAAAAAA|0000000000|abcdef|sk-ant-\.\.\./i;

/* Geprüfte Fehlalarme (2026-11-03), je mit Grund. Ohne `commit` gilt ein
   Eintrag für Datei × Regel in jedem Commit (bisheriges Verhalten). Mit
   `commit` (vollständiger 40-stelliger SHA, exakter Vergleich) gilt er NUR für
   genau diesen Commit × Datei × Regel – für Altlasten im Verlauf, der nicht
   umgeschrieben werden darf. */
export const FREIGABEN = [
  { datei: "pruefungen/intelligence-leck.test.js", regel: "privater Schlüssel (PEM)", grund: "nur die Kopfzeile als Prüfmuster eines Leck-Tests, kein Schlüsselmaterial" },
  { datei: "pruefungen/werkzeuge-im-bild.sh", regel: "Zuweisung Geheimnis-Variable", grund: "fester CI-Prüfwert, kein Betriebsgeheimnis" },
  { datei: "pruefungen/ip-kuerzel.test.js", regel: "Zuweisung Geheimnis-Variable", grund: "feste Testwerte fuer CENTRIC_PFEFFER im Unit-Test, kein Betriebsgeheimnis (Pruefung 2026-11-07)" },
  { datei: ".github/workflows/deploy.yml", regel: "Zuweisung Geheimnis-Variable", grund: "fester CI-Prüfwert, kein Betriebsgeheimnis" },
  { datei: ".github/workflows/pruefung.yml", regel: "Zuweisung Geheimnis-Variable", grund: "fester CI-Prüfwert, kein Betriebsgeheimnis" },
  /* Früher Test-Commit von PR #447 (Zweig acc45/release/rel-0-installer):
     nur die PEM-Kopfzeile als Negativ-Testtext für schluesselPruefen, keine
     Schlüsseldaten, keine Endzeile (geprüft 2026-11-21 mit git show). Der
     Folgecommit setzt die Zeile zusammen; der Verlauf ist ohne Force-Push
     nicht umschreibbar. Eng: nur dieser Commit × diese Datei × PEM. */
  { commit: "b8e67eddfe1ee371d897d01da9288d89df0a7e56", datei: "pruefungen/inventur-install.test.js", regel: "privater Schlüssel (PEM)", grund: "Testtext (nur PEM-Kopfzeile), kein Schlüsselmaterial; Verlauf nicht umschreibbar" },
  /* Erster Commit von PR #537 (GATE-EW3, Zweig acc45/gate/ew3-staging-patch): Prüfwert GHCR_TOKEN: "GEHEIM-TOKEN-…"
     als Umgebung eines Tests, der belegt, dass der Nachweis KEINE Umgebungswerte übernimmt — erfundener Text, kein
     Token (geprüft 2026-11-24 mit git show). Der Folgecommit baut den Wert zur Laufzeit; der Verlauf ist ohne
     Force-Push nicht umschreibbar. Eng: nur dieser Commit × diese Datei × diese Regel. */
  { commit: "9ca6d3dff01a87d3e6e40d48eb58ec8ad6469bc4", datei: "pruefungen/workflow-patch-ew3.test.js", regel: "Zuweisung Geheimnis-Variable", grund: "erfundener Prüfwert eines Negativtests, kein Token; Verlauf nicht umschreibbar" },
];

/** Freigabe für einen einzelnen Treffer { commit, datei, regel } oder undefined.
    Ohne sicher bestimmte Datei (datei null/leer/Kennzeichen) gibt es nie eine Freigabe. */
export function freigabeFuer(f, freigaben = FREIGABEN) {
  if (typeof f.datei !== "string" || f.datei === "" || f.datei === DATEI_UNBEKANNT) return undefined;
  return freigaben.find((g) => g.datei === f.datei && g.regel === f.regel && (g.commit === undefined || g.commit === f.commit));
}

/** Kennzeichen für Treffer, deren Datei sich nicht sicher bestimmen ließ (fail-closed: nie frei). */
export const DATEI_UNBEKANNT = "(Datei unbekannt)";
/** Pseudo-Datei für Treffer in Commit-Nachricht oder Autor-/Committer-Feldern. */
export const COMMIT_TEXT = "(Commit-Text)";

/* git-Aufruf für den Verlauf (Review #450, A1/A2):
   - `--remerge-diff`: Merge-Commits zeigen nur, was der Merge SELBST gegenüber
     dem automatischen Neu-Merge der Eltern einbringt (Konfliktauflösung,
     „böser“ Merge). Inhalte der Elternzweige erscheinen dort nicht erneut.
     Ohne diese Option zeigt `git log -p` für Merges gar keinen Diff.
   - `%P`: Eltern im Marker, damit Merge-Funde erkannt und gegen Funde normaler
     Commits abgeglichen werden (keine Doppelmeldung).
   - Feste Präfixe und Quoting, damit Benutzer-Konfiguration (diff.noprefix,
     diff.mnemonicPrefix, core.quotePath, log.showRoot) das Format oder den
     Umfang nicht verschiebt.
   - Octopus-Merges (mehr als zwei Eltern) liefert `--remerge-diff` ohne Diff.
     Sie werden in einem zweiten Lauf (GIT_OCTOPUS_ARGS, First-Parent-Diff)
     mit Marker `@@OCTOPUS` nachgereicht; fehlt das, bleibt je Octopus ein
     offener Fund OCTOPUS_UNGEPRUEFT (fail-closed).
   - Zufallskennung im Marker (Delta-Review #453, H-a): Der Lauf nutzt
     `@@COMMIT-<kennung>` bzw. `@@OCTOPUS-<kennung>` mit einer Kennung aus
     crypto.randomBytes je Lauf. Ein fester Marker, den jemand über
     Dateiname, Kopfzeile oder Inhalt einschleust, wird so nie als Marker
     gelesen. Die Kennung erscheint in keiner Ausgabe. GIT_LOG_ARGS und
     GIT_OCTOPUS_ARGS sind nur die Vorlage ohne Kennung (Doku/Tests).
   - `--text` (SI-P10, Review #453 H1): Ohne die Option zeigt git für Dateien,
     die als binär gelten, nur „Binary files … differ“ – bei einem NUL-Byte im
     Inhalt, bei `.gitattributes` `-diff`/`binary`/`diff=<treiber>` mit
     `diff.<treiber>.binary` und über `core.bigFileThreshold`. `--text`
     erzwingt für ALLE Dateien den Textdiff; `--no-textconv` und
     `--no-ext-diff` verhindern, dass ein Attribut `diff=<treiber>` den Inhalt
     über textconv oder ein externes Programm umschreibt. Erscheint trotzdem
     eine Zeile „Binary files … differ“, ist das ein offener Fund
     BINAER_UNGEPRUEFT (fail-closed). */
const GIT_BASIS_ARGS = [
  "-c", "core.quotePath=true", "-c", "diff.noprefix=false", "-c", "diff.mnemonicPrefix=false",
  "-c", "log.showSignature=false", "-c", "diff.suppressBlankEmpty=false", "-c", "log.showRoot=true",
  "log", "-p", "--text", "--no-color", "--no-ext-diff", "--no-textconv", "-M",
  "--src-prefix=a/", "--dst-prefix=b/", "-U0",
];
const mit = (nonce) => (nonce ? `-${nonce}` : "");
/** Zufallskennung je Lauf (32 Hex-Zeichen aus crypto.randomBytes). */
export function markeErzeugen() { return randomBytes(16).toString("hex"); }
export function gitLogArgs(nonce) { return [...GIT_BASIS_ARGS, "--remerge-diff", `--format=@@COMMIT${mit(nonce)} %H %P`]; }
export function gitOctopusArgs(nonce) { return [...GIT_BASIS_ARGS, "--diff-merges=first-parent", "--no-walk=unsorted", "--stdin", `--format=@@OCTOPUS${mit(nonce)} %H %P`]; }
export const GIT_LOG_ARGS = gitLogArgs("");
export const GIT_OCTOPUS_ARGS = gitOctopusArgs("");
/** Regel-Name für einen Octopus-Merge, dessen Inhalt nicht geprüft wurde. */
export const OCTOPUS_UNGEPRUEFT = "Octopus-Merge ungeprüft";
/** Regel-Name für einen Diff-Eintrag „Binary files … differ“ trotz `--text` (Inhalt nicht gesehen). */
export const BINAER_UNGEPRUEFT = "Binär-Diff ungeprüft";

/* Überlange Zeilen (SI-P10): Binärdateien und minifizierte Dateien haben oft
   Megabytes ohne Zeilenumbruch. zeilenAus hält höchstens MAX_ZEILE Zeichen je
   Zeile im Speicher. Längere Zeilen kommen als Anfang (Zeichenkette, zählt für
   den Zustandsautomaten) und danach als Fortsetzungen `{ fortsetzung }`; jede
   Fortsetzung beginnt mit den letzten UEBERLAPPUNG Zeichen des vorigen
   Abschnitts, damit ein Treffer an der Schnittstelle nicht verloren geht. */
export const MAX_ZEILE = 1 << 20;
export const UEBERLAPPUNG = 4096;

/* Entschlüsselt einen Pfad aus `+++ b/<Pfad>` nach git-Quoting (quote_c_style):
   "…" mit \\ \" \a \b \t \n \v \f \r und Oktal-Bytes \ooo (UTF-8). Git hängt an
   ungequotete Namen mit Leerzeichen ein Tab an; ein echtes Tab im Namen wird
   immer gequotet. Liefert null, wenn der Pfad nicht sicher bestimmbar ist. */
export function pfadAusKopf(rest, praefix = "b/") {
  let s = rest.endsWith("\t") ? rest.slice(0, -1) : rest;
  if (s.startsWith('"')) {
    if (s.length < 2 || !s.endsWith('"')) return null;
    const bytes = [];
    const ESC = { a: 7, b: 8, t: 9, n: 10, v: 11, f: 12, r: 13, '"': 34, "\\": 92 };
    for (let i = 1; i < s.length - 1; i++) {
      const c = s[i];
      if (c === '"') return null;                       // ungeschütztes Anführungszeichen
      if (c !== "\\") { for (const b of Buffer.from(c, "utf8")) bytes.push(b); continue; }
      const n = s[++i];
      if (n === undefined || i >= s.length - 1) return null;
      if (n in ESC) { bytes.push(ESC[n]); continue; }
      if (/[0-3]/.test(n) && /^[0-7]{2}$/.test(s.slice(i + 1, i + 3))) { bytes.push(parseInt(s.slice(i, i + 3), 8)); i += 2; continue; }
      return null;
    }
    try { s = new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(bytes)); } catch { return null; }
  } else if (s.includes('"') || s.includes("\t")) {
    return null;                                        // git hätte gequotet
  }
  if (!s.startsWith(praefix) || s.length === praefix.length) return null;
  return s.slice(praefix.length);
}

const KOPFZEILE = /^(index |old mode |new mode |deleted file mode |new file mode |similarity index |dissimilarity index |rename from |rename to |copy from |copy to |Binary files |remerge )/;
const HUNK = /^@@ -\d+(?:,(\d+))? \+\d+(?:,(\d+))? @@/;

/* Wertet Zeilen von `git log -p --format="@@COMMIT %H %P" -U0` aus (Zustandsautomat).

   A1 (Review #450): Die Datei kommt NUR aus dem Diff-Kopf – `+++ b/…` direkt
   nach `--- …`, zwischen `diff --git` und dem ersten `@@`. Innerhalb eines
   Hunks wird nach den Zählern aus `@@ -a,b +c,d @@` gezählt; dort ist JEDE
   Zeile Inhalt, auch eine hinzugefügte Zeile `++ b/<Pfad>` (im Diff
   `+++ b/<Pfad>`). Unerwartete Zeilen werden fail-closed geprüft: Treffer
   darin bekommen DATEI_UNBEKANNT und damit nie eine Freigabe.

   A2: Merge-Commits (mehr als ein Elternteil im Marker) liefern Funde aus dem
   Remerge-Diff. Ist dieselbe Zeile (Datei × Regel × Zeileninhalt, nur als
   Hash gehalten) schon in einem Nicht-Merge-Commit gefunden UND ist das
   Original dort offen oder ohne Commit-Bindung frei, gilt der Merge-Fund als
   Kopie und wird nicht doppelt gemeldet. Ist das Original nur über eine
   Freigabe MIT `commit` frei (z. B. b8e67edd), gilt diese Bindung nicht für
   den Merge: der Merge-Fund wird mit dem Merge-SHA eingestuft (Review #453).

   Octopus-Merges: siehe GIT_OCTOPUS_ARGS. Ein Octopus, der im Hauptlauf
   (`@@COMMIT`, mehr als zwei Eltern) auftaucht, aber nie mit `@@OCTOPUS`
   nachgereicht wird, ergibt einen offenen Fund OCTOPUS_UNGEPRUEFT.

   Freigaben werden JE TREFFER geprüft, bevor nach Datei × Regel
   zusammengefasst wird – so verdeckt ein freigegebener Treffer nie einen
   offenen derselben Datei × Regel aus einem anderen Commit.

   `nonce`: Kennung der Marker dieses Laufs (H-a). Nur `@@COMMIT-<nonce> `
   und `@@OCTOPUS-<nonce> ` gelten als Marker; ohne `nonce` (Tests, Vorlage)
   die festen Texte. Andere Marker-Zeilen sind unerwartet (fail-closed). */
export async function fundeSammeln(zeilen, { freigaben = FREIGABEN, nonce = "" } = {}) {
  const M_COMMIT = `@@COMMIT${mit(nonce)} `, M_OCTOPUS = `@@OCTOPUS${mit(nonce)} `;
  let commit = "-", istMerge = false, datei = null, zustand = "aussen", letzteKopf = "";
  let restAlt = 0, restNeu = 0, anzahl = 0, commits = 0, merges = 0, doppelt = 0;
  const offen = new Map(), frei = new Map();
  /* Kennung → true, wenn ein Original offen oder ohne commit frei ist */
  const originale = new Map(), mergeFunde = [];
  const octopusGesehen = new Set(), octopusGeprueft = new Set();

  const einstufen = (t) => {
    const g = freigabeFuer(t, freigaben);
    const k = `${g?.commit ?? ""}|${t.datei}|${t.regel}`;
    const ziel = g ? frei : offen;
    if (!ziel.has(k)) ziel.set(k, g ? { ...t, grund: g.grund } : t);
    return g;
  };
  const pruefen = (inhalt, d) => {
    if (d !== null && /package-lock\.json$/.test(d)) return;   // nur Integritätsprüfsummen
    for (const f of zeilePruefen(inhalt)) {
      const t = { commit, datei: d ?? DATEI_UNBEKANNT, ...f };
      const kennung = createHash("sha256").update(`${t.datei}\0${f.regel}\0${inhalt}`).digest("hex");
      if (istMerge) { mergeFunde.push({ t, kennung }); continue; }
      const g = einstufen(t);
      originale.set(kennung, originale.get(kennung) === true || !g || g.commit === undefined);
    }
  };

  /* SI-P10: Ziel für Fortsetzungen überlanger Zeilen. Datei (String) für eine
     hinzugefügte Zeile, null für unerwartete Zeilen (fail-closed, Datei
     unbekannt), undefined für entfernte und Kontextzeilen (alter Inhalt). */
  let fort = null, fortsetzungen = 0;
  for await (const z of zeilen) {
    if (typeof z !== "string") {
      fortsetzungen++;
      if (fort !== undefined) pruefen(z.fortsetzung, fort);
      continue;
    }
    anzahl++;
    fort = null;
    if (zustand === "hunk") {
      const c = z[0];
      if (c === "+") { restNeu--; pruefen(z.slice(1), datei); fort = datei; }
      else if (c === "-") { restAlt--; fort = undefined; }
      else if (c === " ") { restAlt--; restNeu--; fort = undefined; }
      else if (c === "\\") { /* „\ No newline at end of file“ */ }
      else pruefen(z, null);                                   // unerwartet: fail-closed
      if (restAlt <= 0 && restNeu <= 0) zustand = "nachHunk";
      continue;
    }
    if (z.startsWith(M_COMMIT)) {
      const teile = z.slice(M_COMMIT.length).trim().split(/\s+/);
      commit = teile[0] || "-"; istMerge = teile.length > 2;
      commits++; if (istMerge) merges++;
      if (teile.length > 3) octopusGesehen.add(commit);
      zustand = "aussen"; datei = null; letzteKopf = "";
      continue;
    }
    if (z.startsWith(M_OCTOPUS)) {
      const teile = z.slice(M_OCTOPUS.length).trim().split(/\s+/);
      commit = teile[0] || "-"; istMerge = true;
      octopusGeprueft.add(commit);
      zustand = "aussen"; datei = null; letzteKopf = "";
      continue;
    }
    if (z.startsWith("diff --git ")) { zustand = "kopf"; datei = null; letzteKopf = "diff"; continue; }
    if (zustand === "nachHunk" && z.startsWith("\\")) continue;
    if (z.startsWith("@@ ") && (zustand === "kopf" || zustand === "nachHunk")) {
      const m = HUNK.exec(z);
      if (m) {
        restAlt = m[1] === undefined ? 1 : Number(m[1]);
        restNeu = m[2] === undefined ? 1 : Number(m[2]);
        zustand = restAlt > 0 || restNeu > 0 ? "hunk" : "nachHunk";
        continue;
      }
    }
    if (zustand === "kopf") {
      if (z.startsWith("--- ") && letzteKopf !== "---" && letzteKopf !== "+++") { letzteKopf = "---"; continue; }
      if (z.startsWith("+++ ") && letzteKopf === "---") {
        letzteKopf = "+++";
        datei = z === "+++ /dev/null" ? null : pfadAusKopf(z.slice(4));
        continue;
      }
      if (z.startsWith("Binary files ") && letzteKopf === "diff") {
        /* SI-P10: trotz --text kein Textdiff → Inhalt nicht gesehen, nie frei */
        einstufen({ commit, datei: DATEI_UNBEKANNT, regel: BINAER_UNGEPRUEFT, laenge: 0 });
        continue;
      }
      if (KOPFZEILE.test(z) && letzteKopf === "diff") continue;
    }
    if (z === "") continue;
    pruefen(z, null);                                          // unerwartet: fail-closed
  }

  for (const { t, kennung } of mergeFunde) {
    if (originale.get(kennung) === true) { doppelt++; continue; }
    einstufen(t);
  }
  for (const o of octopusGesehen) {
    if (!octopusGeprueft.has(o)) einstufen({ commit: o, datei: DATEI_UNBEKANNT, regel: OCTOPUS_UNGEPRUEFT, laenge: 0 });
  }
  return { offen: [...offen.values()], frei: [...frei.values()], zeilen: anzahl, commits, merges, doppelt, octopus: octopusGesehen.size, fortsetzungen };
}

/* Commit-Nachricht und Autor-/Committer-Felder. Eingabe: Text von
   `git log -z --format=%H%x1f%an <%ae>%x1f%cn <%ce>%x1f%B` (Datensätze durch
   NUL getrennt). Jeder Datensatz wird VOLLSTÄNDIG zeilenweise geprüft, auch
   wenn er unerwartet aufgebaut ist (fail-closed). Treffer gelten für die
   Pseudo-Datei COMMIT_TEXT; Freigaben dafür nur mit `commit`. */
export const GIT_TEXT_ARGS = ["-c", "log.showSignature=false", "log", "-z", "--no-color", "--format=%H%x1f%an <%ae>%x1f%cn <%ce>%x1f%B"];
export function commitTexteSammeln(text, { freigaben = FREIGABEN } = {}) {
  const offen = new Map(), frei = new Map();
  let commits = 0;
  for (const block of text.split("\0")) {
    if (block === "") continue;
    commits++;
    const m = /^[0-9a-f]{40}/.test(block) && block[40] === "\u001f";
    const commit = m ? block.slice(0, 40) : "-";
    for (const zeile of (m ? block.slice(41) : block).replaceAll("\u001f", "\n").split(/[\r\n]+/)) {
      for (const f of zeilePruefen(zeile)) {
        const t = { commit, datei: COMMIT_TEXT, ...f };
        const g = freigaben.find((x) => x.commit !== undefined && x.commit === commit && x.datei === COMMIT_TEXT && x.regel === f.regel);
        const k = `${commit}|${f.regel}`;
        const ziel = g ? frei : offen;
        if (!ziel.has(k)) ziel.set(k, g ? { ...t, grund: g.grund } : t);
      }
    }
  }
  return { offen: [...offen.values()], frei: [...frei.values()], commits };
}

/* Zerlegt einen Byte-Strom NUR an "\n" (nicht an einzelnem "\r" wie readline):
   ein "\r" im Dateiinhalt darf die Hunk-Zählung nicht verschieben.
   SI-P10: Speicher je Zeile begrenzt (MAX_ZEILE); längere Zeilen kommen als
   Anfang (String) plus Fortsetzungen `{ fortsetzung }` mit Überlappung. */
export async function* zeilenAus(strom, { maxZeile = MAX_ZEILE, ueberlappung = UEBERLAPPUNG } = {}) {
  if (!(ueberlappung >= 0 && maxZeile > ueberlappung)) throw new Error("zeilenAus: maxZeile muss größer als ueberlappung sein");
  const dec = new StringDecoder("utf8");
  const ohneCr = (z) => (z.endsWith("\r") ? z.slice(0, -1) : z);
  let rest = "", lang = false;                               // lang: aktuelle Zeile schon angebrochen
  const ausgabe = (z) => (lang ? { fortsetzung: z } : z);
  /* gibt vom Zeilenanfang `s` Abschnitte aus, bis höchstens maxZeile übrig sind */
  function* abschnitte(s) {
    while (s.length > maxZeile) {
      yield ausgabe(s.slice(0, maxZeile));
      lang = true;
      s = s.slice(maxZeile - ueberlappung);
    }
    return s;
  }
  for await (const stueck of strom) {
    rest += dec.write(stueck);
    let i;
    while ((i = rest.indexOf("\n")) >= 0) {
      const z = yield* abschnitte(rest.slice(0, i));
      rest = rest.slice(i + 1);
      yield ausgabe(ohneCr(z));
      lang = false;
    }
    rest = yield* abschnitte(rest);
  }
  rest += dec.end();
  if (rest) { const z = yield* abschnitte(rest); yield ausgabe(ohneCr(z)); }
}

/* Ende eines git-Kindprozesses als Promise. `erlaubt`: Rückgabewerte, die
   kein Fehler sind (git grep: 1 = keine Treffer). Startfehler (git fehlt,
   Arbeitsverzeichnis fehlt: Ereignis `error`) lehnen ab (SI-P11 H5). Die
   Ablehnung ist sofort als behandelt markiert: Sie tritt oft ein, bevor der
   Aufrufer das Promise abwartet, und wäre sonst eine unbehandelte Ablehnung
   (Absturz mit Rückgabe 1 statt 2). Der Aufrufer bekommt sie beim `await`. */
function gitFehler(kind, name, erlaubt = [0]) {
  const p = new Promise((res, rej) => {
    let fehler = "";
    kind.stderr?.on("data", (d) => { if (fehler.length < 4000) fehler += d; });
    kind.on("error", (e) => rej(new Error(`${name} nicht startbar (${e.code ?? e.message})`)));
    kind.on("close", (code) => (erlaubt.includes(code) ? res(code) : rej(new Error(`${name} endete mit ${code}: ${fehler.trim().split("\n")[0] ?? ""}`))));
  });
  p.catch(() => {});
  return p;
}

/* Schreibt `text` nach stdin des Kindprozesses (Delta-Review #453, H-b).
   Ohne `error`-Handler wäre ein EPIPE (git endet vor dem Lesen) ein
   unbehandelter Fehler: Abbruch mit Rückgabe 1 statt 2. Liefert nie eine
   Ablehnung, sondern den Fehler oder null – so bleibt auch ein später
   eintreffender Fehler behandelt, wenn der Aufrufer schon abgebrochen hat. */
export function eingabeSenden(kind, text) {
  return new Promise((res) => {
    let fertig = false;
    const ende = (f) => { if (!fertig) { fertig = true; res(f); } };
    kind.stdin.on("error", (e) => ende(e));
    kind.stdin.on("close", () => ende(kind.stdin.writableFinished ? null : new Error("stdin vorzeitig geschlossen")));
    kind.stdin.on("finish", () => ende(null));
    kind.stdin.end(text);
  });
}

/** Ganzer Verlauf: Diffs (inkl. Merge-Remerge-Diff) und Commit-Texte. `refs` z. B. ["--all"].
    `spawn` nur für Tests (Attrappe eines Kindprozesses, SI-P10 c). */
export async function historieScannen({ cwd = WURZEL, refs = ["--all"], freigaben = FREIGABEN, spawn = nodeSpawn } = {}) {
  /* Octopus-Merges vorab bestimmen (fail-closed: Fehler bricht ab) */
  const ok = spawn("git", ["rev-list", "--min-parents=3", ...refs], { cwd });
  const okEnde = gitFehler(ok, "git rev-list (Octopus)");
  const okTeile = [];
  for await (const s of ok.stdout) okTeile.push(s);
  await okEnde;
  const octopusShas = Buffer.concat(okTeile).toString("utf8").split("\n").map((s) => s.trim()).filter(Boolean);

  const nonce = markeErzeugen();                               // H-a: nie ausgeben
  async function* alleZeilen() {
    const kind = spawn("git", [...gitLogArgs(nonce), ...refs], { cwd });
    const ende = gitFehler(kind, "git log -p");
    yield* zeilenAus(kind.stdout);
    await ende;                                                // fail-closed: git-Fehler bricht ab
    if (octopusShas.length === 0) return;
    const ko = spawn("git", gitOctopusArgs(nonce), { cwd });
    const koEnde = gitFehler(ko, "git log -p (Octopus)");
    const eingabe = eingabeSenden(ko, octopusShas.join("\n") + "\n");
    yield* zeilenAus(ko.stdout);
    await koEnde;                                              // A-1: Nachlauf-Fehler bricht ab
    const f = await eingabe;                                   // H-b: Liste nicht vollständig übergeben
    if (f) throw new Error(`git log -p (Octopus): Eingabe nicht vollständig übergeben (${f.code ?? f.message})`);
  }
  const r = await fundeSammeln(alleZeilen(), { freigaben, nonce });
  const tk = spawn("git", [...GIT_TEXT_ARGS, ...refs], { cwd });
  const tEnde = gitFehler(tk, "git log (Commit-Text)");
  const teile = [];
  for await (const s of tk.stdout) teile.push(s);
  await tEnde;
  const t = commitTexteSammeln(Buffer.concat(teile).toString("utf8"), { freigaben });
  return { ...r, offen: [...r.offen, ...t.offen], frei: [...r.frei, ...t.frei], textCommits: t.commits };
}

/* Arbeitsstand (`--nur-arbeitsstand`): alle verfolgten Dateien im Arbeitsbaum
   über `git grep`. `-a` statt `-I` (SI-P10): Dateien mit NUL-Byte oder
   Attribut `-diff` werden als Text durchsucht; überlange Zeilen in Abschnitten.
   SI-P11 (Review #461):
   - H3a: Rückgabewert von git grep wird ausgewertet: 0 = Treffer, 1 = keine
     Treffer, alles andere (auch Signal) = Fehler → Ablehnung (Werkzeug: 2).
   - H3b: `-z`: Datei, Zeilennummer und Inhalt sind durch NUL getrennt, der
     Dateiname steht wörtlich. Ein `:` im Dateinamen verschiebt die Trennung
     nicht mehr. Ein Zeilenumbruch im Dateinamen teilt den Datensatz auf
     mehrere Zeilen; Zeilen ohne NUL sind solche Namensteile und werden mit
     dem folgenden Datensatz wieder zusammengesetzt. Namensteile ohne
     Datensatz und Zeilen ohne gültige Zeilennummer werden fail-closed mit
     DATEI_UNBEKANNT geprüft. */
export const GIT_GREP_ARGS = ["grep", "-n", "-z", "-a", "--no-textconv", "--color=never", "--no-column", "-E", ".", "--", "."];
export async function arbeitsstandScannen({ cwd = WURZEL, freigaben = FREIGABEN, spawn = nodeSpawn } = {}) {
  const kind = spawn("git", GIT_GREP_ARGS, { cwd });
  const ende = gitFehler(kind, "git grep", [0, 1]);
  let zeilen = 0, fortsetzungen = 0, datei = DATEI_UNBEKANNT, namensTeile = [];
  const funde = new Map();
  const merken = (text, d) => { for (const f of zeilePruefen(text)) { const k = `${d}\0${f.regel}`; if (!funde.has(k)) funde.set(k, { commit: "Arbeitsstand", datei: d, ...f }); } };
  for await (const z of zeilenAus(kind.stdout)) {
    if (typeof z !== "string") { fortsetzungen++; merken(z.fortsetzung, datei); continue; }
    const i = z.indexOf("\0");
    if (i < 0) { namensTeile.push(z); datei = DATEI_UNBEKANNT; continue; }
    zeilen++;
    const pfad = [...namensTeile, z.slice(0, i)].join("\n");
    namensTeile = [];
    const m = /^\d+[\0:]/.exec(z.slice(i + 1));
    if (!m || pfad === "") { datei = DATEI_UNBEKANNT; merken(z, datei); continue; }
    datei = pfad;
    merken(z.slice(i + 1 + m[0].length), datei);
  }
  for (const t of namensTeile) merken(t, DATEI_UNBEKANNT);
  await ende;                                                  // H3a/H5: Fehler bricht ab
  const offen = [], frei = [];
  for (const f of funde.values()) {
    const g = freigabeFuer(f, freigaben);
    if (g) frei.push({ ...f, grund: g.grund }); else offen.push(f);
  }
  return { offen, frei, zeilen, fortsetzungen };
}

/* Review: Ein Platzhalter unterdrückt nur den eigenen Treffer, nie die ganze
   Zeile — sonst versteckte „example“ irgendwo in der Zeile ein echtes
   Geheimnis daneben. Deshalb werden alle Treffer einer Regel einzeln geprüft. */
export function zeilePruefen(zeile) {
  const funde = [];
  for (const r of REGELN) {
    const alle = new RegExp(r.re.source, r.re.flags.includes("g") ? r.re.flags : r.re.flags + "g");
    for (const m of zeile.matchAll(alle)) {
      if (PLATZHALTER.test(m[0])) continue;
      funde.push({ regel: r.name, laenge: m[0].length });
      break;
    }
  }
  return funde;
}

/* Aufrufoptionen (SI-P10 b, Review #455 H3). Standard bleibt `--all` (CI
   unverändert). `--remotes` prüft nur die Zweige von `origin`
   (`--remotes=origin`), `--remotes=<name>` die eines anderen Remotes – lokal
   ohne Altfunde aus lokalen Zweigen und dem Stash-Stapel. Unbekannte Optionen
   führen zu Rückgabe 2 (kein stiller Rückfall auf einen anderen Umfang).
   SI-P11 H4: `--nur-arbeitsstand` prüft keinen Verlauf; zusammen mit
   `--remotes` wird der Aufruf abgelehnt statt `--remotes` still zu übergehen. */
export function argumenteLesen(argv) {
  let modus = "historie", refs = ["--all"], remotes = false;
  for (const a of argv) {
    if (a === "--nur-arbeitsstand") modus = "arbeitsstand";
    else if (a === "--remotes") { refs = ["--remotes=origin"]; remotes = true; }
    else if (a.startsWith("--remotes=")) {
      const name = a.slice("--remotes=".length);
      if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)) throw new Error(`ungültiger Remote-Name: ${JSON.stringify(name)}`);
      refs = [`--remotes=${name}`]; remotes = true;
    } else throw new Error(`unbekannte Option: ${JSON.stringify(a)}`);
  }
  if (modus === "arbeitsstand" && remotes) throw new Error("--nur-arbeitsstand und --remotes sind nicht kombinierbar (der Arbeitsstand hat keinen Verlauf)");
  return { modus, refs };
}

const istHaupt = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (istHaupt) {
  /* SI-P11 H5: Rückgabe 1 heißt „Funde“. Ein unerwarteter Absturz darf nie so
     aussehen; er endet als Aufruf-/git-Fehler mit 2 (zweite Linie hinter der
     Behandlung in gitFehler und den try/catch unten). */
  const absturz = (e) => { console.error(`FEHLER: unerwarteter Abbruch – ${e?.message ?? e}`); process.exit(2); };
  process.on("uncaughtException", absturz);
  process.on("unhandledRejection", absturz);
  let aufruf;
  try { aufruf = argumenteLesen(process.argv.slice(2)); } catch (e) {
    console.error(`FEHLER: ${e.message}. Aufruf: node werkzeug/sicherheit/geheimnisse.mjs [--nur-arbeitsstand | --remotes[=<name>]]`);
    process.exit(2);
  }
  const kurz = (c) => (/^[0-9a-f]{40}$/.test(c) ? c.slice(0, 8) : c);
  let offen, frei;
  if (aufruf.modus === "arbeitsstand") {
    let r;
    try { r = await arbeitsstandScannen(); } catch (e) {
      console.error(`FEHLER: Arbeitsstand nicht vollständig lesbar – ${e.message}`);
      process.exit(2);
    }
    console.log(`Arbeitsstand: ${r.zeilen} Zeilen geprüft (${r.fortsetzungen} Abschnitte überlanger Zeilen)`);
    ({ offen, frei } = r);
  } else {
    const start = Date.now();
    let r;
    try { r = await historieScannen({ refs: aufruf.refs }); } catch (e) {
      console.error(`FEHLER: Verlauf nicht vollständig lesbar – ${e.message}`);
      process.exit(2);
    }
    if (r.commits === 0) {                                     // z. B. Remote ohne Zweige: nichts geprüft ≠ sauber
      console.error(`FEHLER: kein Commit geprüft (Umfang ${aufruf.refs.join(" ")})`);
      process.exit(2);
    }
    console.log(`Historie (${aufruf.refs.join(" ")}): ${r.commits} Commits (davon ${r.merges} Merges, Remerge-Diff), ${r.zeilen} Diff-Zeilen (Textdiff auch für Binärdateien, ${r.fortsetzungen} Abschnitte überlanger Zeilen), ${r.textCommits} Commit-Texte geprüft; ${r.doppelt} Merge-Kopien bekannter Funde zusammengefasst; ${((Date.now() - start) / 1000).toFixed(1)} s`);
    ({ offen, frei } = r);
  }
  for (const f of frei) console.log(`FREI ${kurz(f.commit)} ${f.datei} – ${f.regel}: ${f.grund}`);
  for (const f of offen) console.log(`FUND ${kurz(f.commit)} ${f.datei} – ${f.regel} (Länge ${f.laenge}, Wert absichtlich nicht ausgegeben)`);
  console.log(offen.length ? `ERGEBNIS: ${offen.length} offene Fundstellen (Datei × Regel)`
    : `ERGEBNIS: keine offenen Funde (${frei.length} begründete Fehlalarme)`);
  process.exit(offen.length ? 1 : 0);
}
