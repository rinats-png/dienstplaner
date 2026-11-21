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

   Aufruf:   node werkzeug/sicherheit/geheimnisse.mjs [--nur-arbeitsstand]
   Ausgang:  0 = keine Funde, 1 = Funde (ohne Werte gelistet)
   ========================================================================== */

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createInterface } from "node:readline";
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
     diff.mnemonicPrefix, core.quotePath) das Format nicht verschiebt. */
export const GIT_LOG_ARGS = [
  "-c", "core.quotePath=true", "-c", "diff.noprefix=false", "-c", "diff.mnemonicPrefix=false",
  "-c", "log.showSignature=false", "-c", "diff.suppressBlankEmpty=false",
  "log", "-p", "--no-color", "--no-ext-diff", "--no-textconv", "-M",
  "--src-prefix=a/", "--dst-prefix=b/", "--remerge-diff",
  "--format=@@COMMIT %H %P", "-U0",
];

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
   Hash gehalten) schon in einem Nicht-Merge-Commit gefunden, gilt der
   Merge-Fund als Kopie und wird nicht doppelt gemeldet; dessen Einstufung
   (offen oder frei) gilt bereits über den Ursprungs-Commit.

   Freigaben werden JE TREFFER geprüft, bevor nach Datei × Regel
   zusammengefasst wird – so verdeckt ein freigegebener Treffer nie einen
   offenen derselben Datei × Regel aus einem anderen Commit. */
export async function fundeSammeln(zeilen, { freigaben = FREIGABEN } = {}) {
  let commit = "-", istMerge = false, datei = null, zustand = "aussen", letzteKopf = "";
  let restAlt = 0, restNeu = 0, anzahl = 0, commits = 0, merges = 0, doppelt = 0;
  const offen = new Map(), frei = new Map();
  const ohneMergeKennung = new Set(), mergeFunde = [];

  const einstufen = (t) => {
    const g = freigabeFuer(t, freigaben);
    const k = `${g?.commit ?? ""}|${t.datei}|${t.regel}`;
    const ziel = g ? frei : offen;
    if (!ziel.has(k)) ziel.set(k, g ? { ...t, grund: g.grund } : t);
  };
  const pruefen = (inhalt, d) => {
    if (d !== null && /package-lock\.json$/.test(d)) return;   // nur Integritätsprüfsummen
    for (const f of zeilePruefen(inhalt)) {
      const t = { commit, datei: d ?? DATEI_UNBEKANNT, ...f };
      const kennung = createHash("sha256").update(`${t.datei}\0${f.regel}\0${inhalt}`).digest("hex");
      if (istMerge) { mergeFunde.push({ t, kennung }); continue; }
      ohneMergeKennung.add(kennung);
      einstufen(t);
    }
  };

  for await (const z of zeilen) {
    anzahl++;
    if (zustand === "hunk") {
      const c = z[0];
      if (c === "+") { restNeu--; pruefen(z.slice(1), datei); }
      else if (c === "-") restAlt--;
      else if (c === " ") { restAlt--; restNeu--; }
      else if (c === "\\") { /* „\ No newline at end of file“ */ }
      else pruefen(z, null);                                   // unerwartet: fail-closed
      if (restAlt <= 0 && restNeu <= 0) zustand = "nachHunk";
      continue;
    }
    if (z.startsWith("@@COMMIT ")) {
      const teile = z.slice(9).trim().split(/\s+/);
      commit = teile[0] || "-"; istMerge = teile.length > 2;
      commits++; if (istMerge) merges++;
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
      if (KOPFZEILE.test(z) && letzteKopf === "diff") continue;
    }
    if (z === "") continue;
    pruefen(z, null);                                          // unerwartet: fail-closed
  }

  for (const { t, kennung } of mergeFunde) {
    if (ohneMergeKennung.has(kennung)) { doppelt++; continue; }
    einstufen(t);
  }
  return { offen: [...offen.values()], frei: [...frei.values()], zeilen: anzahl, commits, merges, doppelt };
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
   ein "\r" im Dateiinhalt darf die Hunk-Zählung nicht verschieben. */
export async function* zeilenAus(strom) {
  const dec = new StringDecoder("utf8");
  let rest = "";
  for await (const stueck of strom) {
    rest += dec.write(stueck);
    let i;
    while ((i = rest.indexOf("\n")) >= 0) {
      const z = rest.slice(0, i);
      rest = rest.slice(i + 1);
      yield z.endsWith("\r") ? z.slice(0, -1) : z;
    }
  }
  rest += dec.end();
  if (rest) yield rest.endsWith("\r") ? rest.slice(0, -1) : rest;
}

function gitFehler(kind, name) {
  return new Promise((res, rej) => {
    let fehler = "";
    kind.stderr.on("data", (d) => { if (fehler.length < 4000) fehler += d; });
    kind.on("error", rej);
    kind.on("close", (code) => (code === 0 ? res() : rej(new Error(`${name} endete mit ${code}: ${fehler.trim().split("\n")[0] ?? ""}`))));
  });
}

/** Ganzer Verlauf: Diffs (inkl. Merge-Remerge-Diff) und Commit-Texte. `refs` z. B. ["--all"]. */
export async function historieScannen({ cwd = WURZEL, refs = ["--all"], freigaben = FREIGABEN } = {}) {
  const kind = spawn("git", [...GIT_LOG_ARGS, ...refs], { cwd });
  const ende = gitFehler(kind, "git log -p");
  const r = await fundeSammeln(zeilenAus(kind.stdout), { freigaben });
  await ende;                                                  // fail-closed: git-Fehler bricht ab
  const tk = spawn("git", [...GIT_TEXT_ARGS, ...refs], { cwd });
  const tEnde = gitFehler(tk, "git log (Commit-Text)");
  const teile = [];
  for await (const s of tk.stdout) teile.push(s);
  await tEnde;
  const t = commitTexteSammeln(Buffer.concat(teile).toString("utf8"), { freigaben });
  return { ...r, offen: [...r.offen, ...t.offen], frei: [...r.frei, ...t.frei], textCommits: t.commits };
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

const istHaupt = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (istHaupt) {
  const nurArbeitsstand = process.argv.includes("--nur-arbeitsstand");
  const kurz = (c) => (/^[0-9a-f]{40}$/.test(c) ? c.slice(0, 8) : c);
  let offen, frei;
  if (nurArbeitsstand) {
    const kind = spawn("git", ["grep", "-n", "-I", "-E", ".", "--", "."], { cwd: WURZEL });
    const rl = createInterface({ input: kind.stdout, crlfDelay: Infinity });
    let zeilen = 0;
    const funde = new Map();
    for await (const z of rl) {
      zeilen++;
      const i = z.indexOf(":"); const j = z.indexOf(":", i + 1);
      const datei = z.slice(0, i);
      for (const f of zeilePruefen(z.slice(j + 1))) funde.set(`${datei}|${f.regel}`, { commit: "Arbeitsstand", datei, ...f });
    }
    await new Promise((r) => kind.on("close", r));
    console.log(`Arbeitsstand: ${zeilen} Zeilen geprüft`);
    offen = []; frei = [];
    for (const f of funde.values()) {
      const g = freigabeFuer(f);
      if (g) frei.push({ ...f, grund: g.grund }); else offen.push(f);
    }
  } else {
    const start = Date.now();
    let r;
    try { r = await historieScannen(); } catch (e) {
      console.error(`FEHLER: Verlauf nicht vollständig lesbar – ${e.message}`);
      process.exit(2);
    }
    console.log(`Historie: ${r.commits} Commits (davon ${r.merges} Merges, Remerge-Diff), ${r.zeilen} Diff-Zeilen, ${r.textCommits} Commit-Texte geprüft; ${r.doppelt} Merge-Kopien bekannter Funde zusammengefasst; ${((Date.now() - start) / 1000).toFixed(1)} s`);
    ({ offen, frei } = r);
  }
  for (const f of frei) console.log(`FREI ${kurz(f.commit)} ${f.datei} – ${f.regel}: ${f.grund}`);
  for (const f of offen) console.log(`FUND ${kurz(f.commit)} ${f.datei} – ${f.regel} (Länge ${f.laenge}, Wert absichtlich nicht ausgegeben)`);
  console.log(offen.length ? `ERGEBNIS: ${offen.length} offene Fundstellen (Datei × Regel)`
    : `ERGEBNIS: keine offenen Funde (${frei.length} begründete Fehlalarme)`);
  process.exit(offen.length ? 1 : 0);
}
