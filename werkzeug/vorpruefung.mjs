#!/usr/bin/env node
/* ==========================================================================
   VORPRÜFUNG — vor Abgabe eines Pakets lokal ausführen

     node werkzeug/vorpruefung.mjs [--paket WP-xx] [--basis <ref>] [--ohne-lint]

   Vergleicht den Arbeitsstand (Commits seit der Basis, Arbeitsbaum und neue
   Dateien) mit der Basis (Vorgabe origin/integration/centric-complete) und
   prüft:

   hart (Rückgabe 1):
   - Code geändert (server/, src/, werkzeug/, deploy/, server.mjs, public/),
     aber kein Test neu oder geändert (pruefungen/, e2e/, *.test.*);
   - eslint meldet Fehler in geänderten Dateien (in Teilmengen aufgerufen);
   - öffentliches Repo: typische Geheimnisse (privater Schlüssel, GitHub-,
     AWS-, Slack-, Google-, Stripe-, OpenAI-/Anthropic-Token, JWT,
     Zugangsdaten in URLs, Zuweisungen an password/secret/token/apikey/
     pfeffer — auch mit Präfix und in JSON-Form) in hinzugefügten Zeilen —
     im Arbeitsstand UND in jedem Commit seit der Basis (auch wenn ein
     späterer Commit es wieder entfernt hat); eine Umgebungsdatei (.env,
     .env.*, *.env, .envrc; außer .env.example) im Änderungssatz.

   Warnung (Rückgabe bleibt 0):
   - geänderte Dateien außerhalb des Feldes „dateien" des Pakets
     (werkzeug/acc45-backlog.mjs) — dort kurz und unscharf gepflegt.

   Danach die Checkliste der häufigsten Review-Befunde (aus den Nachweisen
   in docs/acc45/*-nachweis.md) — zum Abhaken, nicht automatisch geprüft.

   Rückgabe: 0 in Ordnung (ggf. mit Warnungen), 1 harte Verstöße,
   2 Aufruf- oder Git-Fehler.
   ========================================================================== */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const CHECKLISTE = [
  "Fail-closed: Ein Lese- oder Ablagefehler heißt „unbekannt“, nie „gibt es nicht“ oder „leer“ (→ 503/Abbruch, nichts schreiben).",
  "Kein stiller Datenverlust: nichts löschen, überschreiben oder als leer festschreiben, was nur nicht lesbar war; Abbruch zwischen zwei Schritten durchdacht.",
  "Datenschutz je Rolle: Mitarbeitende, Schichtverantwortung (Bereich, tagesgenau), Betriebsrat (nur Zählwerte/ohne Namen), Leitung; Art. 9 (Gesundheit, Schutzmerkmale) nie im Wortlaut an Unberechtigte.",
  "Alle Schreibwege: PUT /api/bestand, Anlegen, Wiederherstellen, Stempeln, Selbstauskunft, Werkzeuge, Datenschutzlauf — dieselbe Prüfung überall?",
  "Rot vorher: jeder neue Test lief gegen den alten Stand rot (per Commit oder eigenem Worktree), Nachweis mit Zahlen.",
  "Laufzeit: keine Schleife über Eingaben ohne Grenze (Infinity, riesige Zahlen), kein synchrones Blockieren des Event-Loops, Tests mit Zeitgrenze.",
  "Testanpassungen: kein bestehender Test abgeschwächt oder abgeschaltet; jede Änderung im Nachweis begründet.",
  "Öffentliches Repo: keine Geheimnisse, Hosts, Zugangsdaten, echten Personendaten in Code, Tests, Nachweisen, Commit-Texten.",
];

const CODE = [/^server\//, /^src\//, /^werkzeug\//, /^deploy\//, /^public\//, /^server\.mjs$/];
const TEST = [/^pruefungen\//, /^e2e\//, /\.test\.[cm]?[jt]sx?$/];
const LINTBAR = /\.(m?js|cjs|jsx)$/;
const UMGEBUNG = /(^|\/)(\.env(\.[^/]*)?|\.envrc|[^/]+\.env)$/;
const LINT_TEILMENGE = 40;
/* Werte, die offensichtlich Platzhalter oder Prüfwerte sind, zählen bei
   Zuweisungen nicht (z. B. „pfeffer-nur-zum-pruefen-…"). */
const PLATZHALTER = /pruef|test|beispiel|example|dummy|platzhalter|xxx|changeme|nur-zum|<[^>]*>|\$\{/i;

/* Die Muster selbst stehen nur hier; jede Zeile trägt die Marke am Ende und
   wird bei der Suche ausgenommen — sonst nichts in dieser Datei. */
const MARKE = "vorpruefung:muster";
export const GEHEIM = [
  { name: "privater Schlüssel", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },                          // vorpruefung:muster
  { name: "GitHub-Token", re: /\b(ghp|gho|ghs|ghu|ghr)_[A-Za-z0-9]{30,}|\bgithub_pat_[A-Za-z0-9_]{30,}/ }, // vorpruefung:muster
  { name: "AWS-Schlüssel", re: /\b(AKIA|ASIA)[0-9A-Z]{16}\b/ },                                        // vorpruefung:muster
  { name: "Anthropic/OpenAI-Schlüssel", re: /\bsk-(ant|proj)-[A-Za-z0-9_-]{20,}|\bsk-[A-Za-z0-9]{32,}/ }, // vorpruefung:muster
  { name: "Stripe-Schlüssel", re: /\b(sk|rk|pk)_(live|test)_[A-Za-z0-9]{16,}/ },                      // vorpruefung:muster
  { name: "Slack-Token", re: /\bxox[abprsoe]-[A-Za-z0-9-]{10,}/ },                                    // vorpruefung:muster
  { name: "Google-API-Schlüssel", re: /\bAIza[0-9A-Za-z_-]{35}\b/ },                                  // vorpruefung:muster
  { name: "Resend-Schlüssel", re: /\bre_[A-Za-z0-9]{24,}\b/ },                                        // vorpruefung:muster
  { name: "JWT", re: /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/ },             // vorpruefung:muster
  { name: "Zugangsdaten in URL", re: /\b[a-z][a-z0-9+.-]*:\/\/[^/\s:@"'`]+:[^/\s@"'`]{3,}@[^\s/"'`]+/i }, // vorpruefung:muster
  { name: "Geheimnis-Zuweisung",                                                                      // vorpruefung:muster
    re: /["']?[\w.-]*(passwor[dt]|password|passwd|secret|token|api[_-]?key|apikey|pfeffer|pepper)[\w.-]*["']?\s*[:=]\s*["']([^"'\s]{12,})["']/i, // vorpruefung:muster
    platzhalterPruefen: true },                                                                     // vorpruefung:muster
];

function git(args, cwd) {
  const r = spawnSync("git", ["-c", "core.quotepath=false", ...args],
    { cwd, encoding: "utf8", maxBuffer: 512 * 1024 * 1024 });
  if (r.error) throw new Error(`git ${args.join(" ")}: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${(r.stderr || "").trim()}`);
  return r.stdout;
}
const nulListe = (s) => s.split("\0").map((x) => x.trim()).filter(Boolean);

/** Geänderte Dateien gegenüber der Basis: Commits, Arbeitsbaum, neue Dateien. */
export function geaenderteDateien(basis, cwd) {
  const mb = git(["merge-base", basis, "HEAD"], cwd).trim();
  const geaendert = nulListe(git(["diff", "--name-only", "-z", mb], cwd));
  const neu = nulListe(git(["ls-files", "--others", "--exclude-standard", "-z"], cwd));
  return { mb, dateien: [...new Set([...geaendert, ...neu])].sort() };
}

/** Pfad aus einer Kopfzeile „+++ b/pfad" bzw. „+++ "b/pfad"" (quotiert). */
function pfadAusKopf(rest) {
  let p = rest.trim();
  if (p.startsWith("\"") && p.endsWith("\"")) {
    try { p = JSON.parse(p); } catch { p = p.slice(1, -1); }
  }
  if (p === "/dev/null") return null;
  return p.startsWith("b/") ? p.slice(2) : p;
}

/** Hinzugefügte Zeilen aus einem Unified-Diff — Kopfzeilen nur außerhalb der Hunks. */
export function zeilenAusDiff(diff, quelle) {
  const aus = [];
  let datei = null;
  let imHunk = false;
  for (const z of diff.split("\n")) {
    if (z.startsWith("diff --git ")) { imHunk = false; datei = null; continue; }
    if (!imHunk) {
      if (z.startsWith("+++ ")) { datei = pfadAusKopf(z.slice(4)); continue; }
      if (z.startsWith("@@")) imHunk = true;
      continue;
    }
    if (z.startsWith("@@")) continue;
    if (z.startsWith("+")) aus.push({ datei, text: z.slice(1), quelle });
  }
  return aus;
}

/** Hinzugefügte Zeilen: Arbeitsstand gegen die Basis, jeder Commit seit der Basis, neue Dateien. */
export function hinzugefuegt(mb, cwd, dateien) {
  const zeilen = [
    ...zeilenAusDiff(git(["diff", "-U0", "--no-color", "--no-ext-diff", mb], cwd), "Arbeitsstand"),
    ...zeilenAusDiff(git(["log", "-p", "-U0", "--no-color", "--no-ext-diff", "--format=", `${mb}..HEAD`], cwd), "Commit"),
  ];
  const getrackt = new Set(nulListe(git(["ls-files", "-z"], cwd)));
  for (const d of dateien) {
    if (getrackt.has(d) || !existsSync(path.join(cwd, d))) continue;
    try { for (const t of readFileSync(path.join(cwd, d), "utf8").split("\n")) zeilen.push({ datei: d, text: t, quelle: "neu" }); }
    catch { /* Binärdatei o. ä. */ }
  }
  return zeilen;
}

/** Welche Geheimnisse stecken in einer Zeile? */
export function geheimnisseIn(text, datei = "") {
  if (datei === "werkzeug/vorpruefung.mjs" && text.includes(MARKE)) return [];
  const aus = [];
  for (const g of GEHEIM) {
    const m = g.re.exec(text);
    if (!m) continue;
    if (g.platzhalterPruefen && PLATZHALTER.test(m[2] || "")) continue;
    aus.push(g.name);
  }
  return aus;
}

/** Das Feld „dateien" eines Pakets als Pfadpräfixe (unscharf gepflegt). */
export function dateienDesPakets(id, pakete) {
  const p = pakete.find((x) => x.id === id);
  if (!p) return null;
  return String(p.dateien).split(/,\s*/).map((x) => x.replace(/\s*\(.*\)\s*$/, "").trim())
    .filter((x) => x && x !== "–" && /[/.]/.test(x)).map((x) => x.replace(/\*.*$/, ""));
}

export async function main(argv, say = (s) => console.log(s), { cwd = process.cwd(), pakete = null } = {}) {
  const wert = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
  const basis = wert("--basis") || "origin/integration/centric-complete";
  const paket = wert("--paket");
  const ohneLint = argv.includes("--ohne-lint");
  const hart = [];
  const warn = [];

  try {
    const { mb, dateien } = geaenderteDateien(basis, cwd);
    say(`Basis ${basis} (${mb.slice(0, 7)}): ${dateien.length} geänderte Datei(en)`);

    /* Paketumfang */
    if (paket) {
      const { paketeAus } = await import("./acc45-backlog.mjs");
      const praefixe = dateienDesPakets(paket, pakete || paketeAus());
      if (praefixe === null) { say(`FEHLER: unbekanntes Paket ${paket}`); return 2; }
      if (praefixe.length) {
        const ausserhalb = dateien.filter((d) => !d.startsWith("docs/acc45/") && !TEST.some((r) => r.test(d))
          && !praefixe.some((p) => d.startsWith(p) || d.endsWith(`/${p}`)));
        if (ausserhalb.length)
          warn.push(`Außerhalb des Feldes „dateien“ von ${paket} (${praefixe.join(", ")}): ${ausserhalb.join(", ")}`);
      }
    }

    /* Tests */
    const code = dateien.filter((d) => CODE.some((r) => r.test(d)));
    const tests = dateien.filter((d) => TEST.some((r) => r.test(d)));
    if (code.length && !tests.length)
      hart.push(`Code geändert (${code.length} Datei(en)), aber kein Test neu oder geändert.`);
    else if (code.length)
      say(`Tests geändert: ${tests.length} — geändert heißt nicht passend: deckt jeder Test die Änderung ab, war er vorher rot?`);

    /* Öffentliches Repo */
    for (const d of dateien)
      if (UMGEBUNG.test(d) && !/(^|\/)\.env\.example$/.test(d)) hart.push(`Umgebungsdatei im Änderungssatz: ${d}`);
    const gesehen = new Set();
    for (const { datei, text, quelle } of hinzugefuegt(mb, cwd, dateien)) {
      for (const name of geheimnisseIn(text, datei)) {
        const k = `${name}|${datei}|${quelle}`;
        if (gesehen.has(k)) continue;
        gesehen.add(k);
        hart.push(`Mögliches Geheimnis (${name}) in ${datei} (${quelle === "Commit" ? "in einem Commit seit der Basis" : quelle})`);
      }
    }

    /* eslint, in Teilmengen (Befehlszeilenlänge unter Windows) */
    const lintbar = dateien.filter((d) => LINTBAR.test(d) && existsSync(path.join(cwd, d)));
    if (!ohneLint && lintbar.length) {
      const bin = path.join(cwd, "node_modules", "eslint", "bin", "eslint.js");
      if (!existsSync(bin)) warn.push("eslint nicht gefunden (node_modules fehlt) — übersprungen.");
      else {
        const meldungen = [];
        for (let i = 0; i < lintbar.length; i += LINT_TEILMENGE) {
          const r = spawnSync(process.execPath, [bin, "--quiet", ...lintbar.slice(i, i + LINT_TEILMENGE)],
            { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
          if (r.error) throw new Error(`eslint: ${r.error.message}`);
          if (r.status !== 0) meldungen.push((r.stdout || r.stderr || "").trim());
        }
        if (meldungen.length) hart.push(`eslint meldet Fehler:\n${meldungen.join("\n").split("\n").slice(0, 40).join("\n")}`);
      }
    }
  } catch (e) {
    say(`FEHLER: ${e.message}`);
    return 2;
  }

  for (const w of warn) say(`WARNUNG: ${w}`);
  for (const h of hart) say(`VERSTOSS: ${h}`);
  say("\nCheckliste (häufigste Review-Befunde, docs/acc45/*-nachweis.md):");
  for (const c of CHECKLISTE) say(`  [ ] ${c}`);
  say(hart.length ? `\n${hart.length} harte(r) Verstoß/Verstöße.` : "\nKeine harten Verstöße.");
  return hart.length ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode = await main(process.argv.slice(2));
}
