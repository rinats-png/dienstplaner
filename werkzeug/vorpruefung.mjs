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
   - eslint meldet Fehler in geänderten Dateien;
   - öffentliches Repo: hinzugefügte Zeilen mit typischen Geheimnissen
     (privater Schlüssel, GitHub-/AWS-/API-Token, Passwort-Zuweisung) oder
     eine geänderte .env-Datei (außer .env.example).

   Warnung (Rückgabe bleibt 0):
   - geänderte Dateien außerhalb des Feldes „dateien" des Pakets
     (werkzeug/acc45-backlog.mjs) — dort kurz und unscharf gepflegt, deshalb
     nur ein Hinweis.

   Danach die Checkliste der häufigsten Review-Befunde (aus den Nachweisen
   in docs/acc45/*-nachweis.md) — zum Abhaken, nicht automatisch geprüft.

   Rückgabe: 0 in Ordnung (ggf. mit Warnungen), 1 harte Verstöße, 2 Aufruffehler.
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
export const GEHEIM = [
  { name: "privater Schlüssel", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: "GitHub-Token", re: /\b(ghp|gho|ghs|ghu)_[A-Za-z0-9]{30,}\b|\bgithub_pat_[A-Za-z0-9_]{30,}/ },
  { name: "AWS-Schlüssel", re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "API-Schlüssel", re: /\bsk-[A-Za-z0-9]{24,}\b|\bre_[A-Za-z0-9]{24,}\b/ },
  { name: "Passwort-Zuweisung", re: /\b(passwor[dt]|password|secret|pfeffer)\b\s*[:=]\s*["'][^"'\s]{12,}["']/i },
];

function git(args, cwd) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${(r.stderr || "").trim()}`);
  return r.stdout;
}

/** Geänderte Dateien gegenüber der Basis: Commits, Arbeitsbaum, neue Dateien. */
export function geaenderteDateien(basis, cwd) {
  const mb = git(["merge-base", basis, "HEAD"], cwd).trim();
  const geaendert = git(["diff", "--name-only", mb], cwd).split("\n");
  const neu = git(["ls-files", "--others", "--exclude-standard"], cwd).split("\n");
  return { mb, dateien: [...new Set([...geaendert, ...neu].map((x) => x.trim()).filter(Boolean))].sort() };
}

/** Hinzugefügte Zeilen gegenüber der Basis (für die Geheimnisprüfung). */
export function hinzugefuegt(mb, cwd, dateien) {
  const zeilen = [];
  const diff = git(["diff", "-U0", mb], cwd);
  let datei = null;
  for (const z of diff.split("\n")) {
    if (z.startsWith("+++ b/")) datei = z.slice(6);
    else if (z.startsWith("+") && !z.startsWith("+++")) zeilen.push({ datei, text: z.slice(1) });
  }
  const getrackt = new Set(git(["ls-files"], cwd).split("\n").map((x) => x.trim()));
  for (const d of dateien) {
    if (getrackt.has(d) || !existsSync(path.join(cwd, d))) continue;
    try { for (const t of readFileSync(path.join(cwd, d), "utf8").split("\n")) zeilen.push({ datei: d, text: t }); }
    catch { /* Binärdatei o. ä. */ }
  }
  return zeilen;
}

/** Das Feld „dateien" eines Pakets als Pfadpräfixe (unscharf gepflegt). */
export function dateienDesPakets(id, pakete) {
  const p = pakete.find((x) => x.id === id);
  if (!p) return null;
  return String(p.dateien).split(/,\s*/).map((x) => x.replace(/\s*\(.*\)\s*$/, "").trim())
    .filter((x) => x && x !== "–" && /[/.]/.test(x)).map((x) => x.replace(/\*.*$/, ""));
}

export async function main(argv, say = (s) => console.log(s), { cwd = process.cwd() } = {}) {
  const wert = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
  const basis = wert("--basis") || "origin/integration/centric-complete";
  const paket = wert("--paket");
  const ohneLint = argv.includes("--ohne-lint");
  const hart = [];
  const warn = [];

  let mb, dateien;
  try { ({ mb, dateien } = geaenderteDateien(basis, cwd)); }
  catch (e) { say(`FEHLER: ${e.message}`); return 2; }
  say(`Basis ${basis} (${mb.slice(0, 7)}): ${dateien.length} geänderte Datei(en)`);

  /* Paketumfang */
  if (paket) {
    const { paketeAus } = await import("./acc45-backlog.mjs");
    const praefixe = dateienDesPakets(paket, paketeAus());
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

  /* Öffentliches Repo */
  for (const d of dateien)
    if (/(^|\/)\.env(\.|$)/.test(d) && !/\.env\.example$/.test(d)) hart.push(`Umgebungsdatei im Änderungssatz: ${d}`);
  for (const { datei, text } of hinzugefuegt(mb, cwd, dateien)) {
    if (datei === "werkzeug/vorpruefung.mjs" || /vorpruefung\.test\./.test(datei || "")) continue;   // die Muster selbst
    for (const g of GEHEIM) if (g.re.test(text)) hart.push(`Mögliches Geheimnis (${g.name}) in ${datei}`);
  }

  /* eslint */
  const lintbar = dateien.filter((d) => LINTBAR.test(d) && existsSync(path.join(cwd, d)));
  if (!ohneLint && lintbar.length) {
    const bin = path.join(cwd, "node_modules", "eslint", "bin", "eslint.js");
    if (!existsSync(bin)) warn.push("eslint nicht gefunden (node_modules fehlt) — übersprungen.");
    else {
      const r = spawnSync(process.execPath, [bin, "--quiet", ...lintbar], { cwd, encoding: "utf8" });
      if (r.status !== 0) hart.push(`eslint meldet Fehler:\n${(r.stdout || r.stderr || "").trim().split("\n").slice(0, 40).join("\n")}`);
    }
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
