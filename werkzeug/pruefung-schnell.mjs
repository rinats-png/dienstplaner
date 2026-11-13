#!/usr/bin/env node
/* ==========================================================================
   PRUEFUNG-SCHNELL — schnelle lokale Vorprüfung vor der vollen CI

     npm run pruefung:schnell                       Vergleichsbasis origin/integration/release-v4
     npm run pruefung:schnell -- --basis origin/main
     npm run pruefung:schnell -- --trocken          nur anzeigen, was liefe

   Läuft nacheinander: Lint, Typprüfung (tsc), CI-Abdeckung und danach nur
   die Tests, die von den gegenüber der Basis geänderten Dateien berührt
   werden (vitest `related`; erfasst Commits dieses Zweigs, uncommittete und neue
   Dateien; nimmt auch Tests mit, die geänderte Module importieren). package.json,
   Lockfile, Workflow und docs/ werden dabei NICHT als Auslöser gewertet: vitest
   `--changed` würde bei geänderter package.json alle 362 Testdateien wählen
   (gemessen 2026-11-13, sonst 2). Meldet je Schritt die Dauer.

   Das ist KEIN Ersatz für die volle Prüfung (`npm run pruefung`, CI):
   - vor dem Merge gilt weiterhin die volle CI auf dem exakten Commit;
   - Tests, die Dateien nur zur Laufzeit lesen (readFileSync auf Quelltexte,
     Spawn von Kindprozessen, Dokument-/Wächter-Tests), hängen nicht im
     Importgraphen und werden von --changed nicht immer gefunden. Deshalb
     läuft zusätzlich `pruefungen/prozess-wachen.test.js` immer.

   Bekannte umgebungsabhängige Tests (nur Hinweis, keine Ausnahme): siehe
   docs/acc45/DURCHSATZ-ANALYSE.md, Abschnitt „Schnellprüfung“.
   ========================================================================== */
import { spawn, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { existsSync } from "node:fs";

/** Geänderte Quelldateien: Zweig gegen Basis, Arbeitsbaum und neue Dateien; ohne package.json/Lockfile/Workflow. */
export function geaenderteDateien(listeText, neuText = "") {
  const roh = [...String(listeText).split(/\r?\n/), ...String(neuText).split(/\r?\n/)].map((z) => z.trim()).filter(Boolean);
  const ausgeschlossen = new Set(["package.json", "package-lock.json"]);
  return [...new Set(roh)].filter((f) => /^[\w./-]+\.(?:m?js|cjs|jsx|json)$/.test(f) && !ausgeschlossen.has(f) && !f.startsWith(".github/") && !f.startsWith("docs/"));
}

const lintbar = (f) => /.(?:m?js|cjs|jsx)$/.test(f);

export function schritte(basis, dateien = []) {
  return [
    { name: dateien.some(lintbar) ? "Lint (nur geänderte Dateien; die CI lintet alles)" : "Lint (keine geänderte Quelldatei)", befehl: dateien.some(lintbar) ? ["npx", "eslint", ...dateien.filter(lintbar)] : ["node", "-e", "0"] },
    { name: "Typen", befehl: ["npm", "run", "pruefung:typen"] },
    { name: "CI-Abdeckung", befehl: ["npm", "run", "pruefung:ci-abdeckung"] },
    // Diese drei sind in der CI zusammen mit Typen die häufigsten Fehlschlagstellen des Gates „Prüfung“ (siehe DURCHSATZ-ANALYSE.md).
    { name: "Verdrahtung der Prüfdateien", befehl: ["npm", "run", "pruefung:verdrahtung", "--", "--testTimeout=120000"] },
    { name: "ACC45-Status aus einer Quelle", befehl: ["npm", "run", "pruefung:acc45-status", "--", "--testTimeout=120000"] },
    { name: "Dokumentation", befehl: ["npm", "run", "pruefung:doku", "--", "--testTimeout=120000"] },
    { name: "Prozesswächter", befehl: ["npx", "vitest", "run", "pruefungen/prozess-wachen.test.js", "--testTimeout=120000"] },
    { name: `Tests der Änderungen gegen ${basis}`, befehl: ["npx", "vitest", "related", "--run", "--passWithNoTests", "--testTimeout=120000", ...dateien] },
  ];
}

function lauf(befehl) {
  return new Promise((ok) => {
    // Feste Argumentlisten ohne Nutzereingaben; unter Windows sind npm/npx .cmd-Dateien.
    // Unter Windows als eine Befehlszeile über die Shell (npm/npx sind .cmd-Dateien); sonst direkt ohne Shell.
    const kind = process.platform === "win32"
      ? spawn(befehl.join(" "), { stdio: "inherit", shell: true })
      : spawn(befehl[0], befehl.slice(1), { stdio: "inherit" });
    kind.on("close", (code, signal) => ok(code ?? (signal ? 1 : 0)));
    kind.on("error", () => ok(127));
  });
}

export async function haupt(argv) {
  const i = argv.indexOf("--basis");
  const basis = i >= 0 && argv[i + 1] ? argv[i + 1] : "origin/integration/release-v4";
  if (!/^[\w./-]+$/.test(basis)) { console.error("Ungültige --basis."); return 2; }
  const wurzel = resolve(fileURLToPath(new URL("..", import.meta.url)));
  try { execFileSync("git", ["rev-parse", "--verify", "--quiet", basis], { cwd: wurzel, stdio: "ignore" }); }
  catch { console.error(`Basis ${basis} nicht gefunden (git fetch origin?).`); return 2; }
  const git = (a) => execFileSync("git", a, { cwd: wurzel, encoding: "utf8" });
  const dateien = geaenderteDateien(git(["diff", "--name-only", basis]), git(["ls-files", "--others", "--exclude-standard"]));
  dateien.splice(0, dateien.length, ...dateien.filter((f) => existsSync(resolve(wurzel, f))));
  console.log(`Geänderte Quelldateien gegen ${basis}: ${dateien.length}`);
  const liste = schritte(basis, dateien);
  if (argv.includes("--trocken")) { for (const s of liste) console.log(`${s.name}: ${s.befehl.join(" ")}`); return 0; }
  const ergebnis = [];
  let rc = 0;
  for (const s of liste) {
    const t0 = Date.now();
    console.log(`\n=== ${s.name} ===`);
    const code = await lauf(s.befehl);
    ergebnis.push({ name: s.name, code, sek: (Date.now() - t0) / 1000 });
    if (code !== 0) { rc = code; break; }
  }
  console.log("\n--- Zusammenfassung pruefung:schnell (ersetzt NICHT die volle CI) ---");
  for (const e of ergebnis) console.log(`${e.code === 0 ? "ok    " : "FEHLER"} ${e.sek.toFixed(1).padStart(7)} s  ${e.name}`);
  console.log(`Gesamt ${ergebnis.reduce((s, e) => s + e.sek, 0).toFixed(1)} s`);
  return rc;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  haupt(process.argv.slice(2)).then((c) => process.exit(c), (e) => { console.error(e); process.exit(1); });
}
