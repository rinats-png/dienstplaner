#!/usr/bin/env node
/* ==========================================================================
   SICHERHEIT – Abhängigkeiten und Lockfile (interne Prüfung 2026-11, Prüfpunkt 2)

   1. Lockfile (package-lock.json) ohne Netz prüfen:
      - lockfileVersion ≥ 2
      - jedes Paket mit „resolved“ kommt von https://registry.npmjs.org/
      - jedes Paket mit „resolved“ trägt eine sha512-Integrität
      - keine git:, file:, http:-Quellen, keine Links außerhalb des Projekts
      - Abgleich package.json ↔ Lockfile-Wurzel (gleiche Abhängigkeiten)
      - Pakete mit Installationsskripten (hasInstallScript) werden gelistet
   2. npm audit (braucht Netz zur Registry) – getrennt Laufzeit (--omit=dev)
      und gesamt; ausgegeben werden Paket, Schwere, direkt/indirekt, Fix.
      Mit --ohne-audit wird Teil 2 übersprungen (z. B. offline).

   Aufruf:   node werkzeug/sicherheit/abhaengigkeiten.mjs [--ohne-audit]
   Ausgang:  0 = Lockfile sauber und Laufzeit ohne hoch/kritisch, 1 = sonst
   ========================================================================== */

import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export function lockfilePruefen(lock, pkg) {
  const befunde = [];
  if (!(lock.lockfileVersion >= 2)) befunde.push(`lockfileVersion ${lock.lockfileVersion} < 2`);
  const pakete = lock.packages || {};
  const skripte = [];
  let anzahl = 0;
  for (const [ort, p] of Object.entries(pakete)) {
    if (ort === "") continue;
    anzahl++;
    if (p.link) { if (String(p.resolved || "").startsWith("..") || path.isAbsolute(String(p.resolved || ""))) befunde.push(`${ort}: Link außerhalb des Projekts`); continue; }
    if (p.hasInstallScript) skripte.push(ort.replace(/^node_modules\//, ""));
    if (!p.resolved) continue;   // gebündelte/optionale Einträge ohne Quelle
    if (!p.resolved.startsWith("https://registry.npmjs.org/")) befunde.push(`${ort}: fremde Quelle`);
    if (!/^sha512-/.test(String(p.integrity || ""))) befunde.push(`${ort}: keine sha512-Integrität`);
  }
  const wurzel = pakete[""] || {};
  for (const feld of ["dependencies", "devDependencies"]) {
    const a = pkg[feld] || {}, b = wurzel[feld] || {};
    for (const n of new Set([...Object.keys(a), ...Object.keys(b)]))
      if (a[n] !== b[n]) befunde.push(`${feld}.${n}: package.json ${a[n]} ≠ Lockfile ${b[n]}`);
  }
  return { anzahl, befunde, skripte };
}

function audit(nurLaufzeit) {
  const args = ["audit", "--json", ...(nurLaufzeit ? ["--omit=dev"] : [])];
  const r = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", args,
    { cwd: WURZEL, encoding: "utf8", shell: process.platform === "win32", timeout: 180_000 });
  try { return JSON.parse(r.stdout); } catch { return { fehler: (r.stderr || "").slice(0, 300) }; }
}

const istHaupt = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (istHaupt) {
  const lock = JSON.parse(await readFile(path.join(WURZEL, "package-lock.json"), "utf8"));
  const pkg = JSON.parse(await readFile(path.join(WURZEL, "package.json"), "utf8"));
  const l = lockfilePruefen(lock, pkg);
  console.log(`Lockfile: v${lock.lockfileVersion}, ${l.anzahl} Pakete, Befunde: ${l.befunde.length}`);
  for (const b of l.befunde) console.log(`  ${b}`);
  console.log(`Pakete mit Installationsskript: ${l.skripte.length ? l.skripte.join(", ") : "keine"}`);
  let schlecht = l.befunde.length > 0;
  if (!process.argv.includes("--ohne-audit")) {
    for (const [name, nur] of [["Laufzeit (--omit=dev)", true], ["gesamt", false]]) {
      const r = audit(nur);
      if (r.fehler !== undefined) { console.log(`npm audit ${name}: nicht ausführbar – ${r.fehler}`); schlecht = true; continue; }
      console.log(`npm audit ${name}: ${JSON.stringify(r.metadata && r.metadata.vulnerabilities)}`);
      for (const [n, v] of Object.entries(r.vulnerabilities || {})) {
        const via = (v.via || []).map((x) => typeof x === "string" ? `über ${x}` : `${x.title} (${x.url})`).join("; ");
        console.log(`  ${n}: ${v.severity}, ${v.isDirect ? "direkt" : "indirekt"}, Fix: ${JSON.stringify(v.fixAvailable)} – ${via}`);
        if (nur && (v.severity === "high" || v.severity === "critical")) schlecht = true;
      }
    }
  }
  process.exit(schlecht ? 1 : 0);
}
