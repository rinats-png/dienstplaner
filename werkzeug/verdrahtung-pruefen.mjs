// Verdrahtungsprüfung: Jede Prüfdatei direkt unter pruefungen/ muss in einem
// package.json-Skript oder im CI-Workflow vorkommen, sonst läuft sie nie.
// Bewusste Ausnahmen stehen in pruefungen/verdrahtung-ausnahmen.json
// (Pflichtfeld "grund" je Eintrag). Nur Node-Bordmittel, keine Abhängigkeit.
//
// Was als Prüfdatei gilt:
//   - *.test.js direkt unter pruefungen/ (immer);
//   - *.mjs direkt unter pruefungen/, sofern sie nicht von einer anderen Datei
//     (pruefungen/**, werkzeug/**, server/**, src/**) eingebunden wird.
//     Eingebundene Module sind Hilfen (z. B. szenario.mjs) und werden nicht
//     gemeldet. Unterverzeichnisse (hilfen/, fixtures/, basis/, browser/) und
//     Nicht-Skripte (*.json) sind nie Prüfdateien.
//
// Aufruf: node werkzeug/verdrahtung-pruefen.mjs [wurzel]
// Rückgabe: Exit 1 bei Fehlern. Warnungen (Arbeitspakete) brechen nie ab.
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

function esc(s) {
  return s.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
}

// Verdrahtung aus package.json-Skripten und Workflows einlesen.
export function verdrahtungSammeln(wurzel) {
  const texte = [];
  const pj = join(wurzel, "package.json");
  if (existsSync(pj)) {
    const skripte = JSON.parse(readFileSync(pj, "utf8")).scripts || {};
    for (const v of Object.values(skripte)) texte.push(String(v));
  }
  const wf = join(wurzel, ".github", "workflows");
  if (existsSync(wf)) {
    for (const f of readdirSync(wf)) {
      if (/\.ya?ml$/.test(f)) texte.push(readFileSync(join(wf, f), "utf8"));
    }
  }
  const alles = texte.join("\n");
  const token = alles.match(/pruefungen\/[\w.*\-/]+/g) || [];
  return { alles, token: [...new Set(token)] };
}

export function istVerdrahtet(datei, { alles, token }) {
  const pfad = "pruefungen/" + datei;
  for (const t of token) {
    if (t === pfad) return true;
    if (t.includes("*")) {
      if (new RegExp("^" + t.split("*").map(esc).join("[^/]*") + "$").test(pfad)) return true;
    } else if (!/\.(js|mjs)$/.test(t) && !t.endsWith("/") && pfad.startsWith(t)) {
      return true; // vitest-Präfix, z. B. pruefungen/intelligence-
    }
  }
  return new RegExp("(^|[^\\w.-])" + esc(datei) + "($|[^\\w.-])").test(alles);
}

function skripteSammeln(dir, ausgabe, tiefe = 0) {
  if (!existsSync(dir) || tiefe > 4) return;
  for (const d of readdirSync(dir, { withFileTypes: true })) {
    if (d.name === "node_modules" || d.name.startsWith(".")) continue;
    const p = join(dir, d.name);
    if (d.isDirectory()) skripteSammeln(p, ausgabe, tiefe + 1);
    else if (/\.(m?js|cjs|jsx|sh)$/.test(d.name)) ausgabe.push(p);
  }
}

// Hilfe = .mjs, die in einer anderen Datei als Pfad/Import vorkommt.
export function hilfsmodule(wurzel, mjsDateien) {
  const quellen = [];
  for (const v of ["pruefungen", "werkzeug", "server", "src"]) skripteSammeln(join(wurzel, v), quellen);
  const inhalte = quellen.map((p) => ({ p, t: readFileSync(p, "utf8") }));
  const hilfen = new Set();
  for (const name of mjsDateien) {
    const re = new RegExp("[\"'`/]" + esc(name) + "[\"'`]");
    const eigen = join(wurzel, "pruefungen", name);
    if (inhalte.some((q) => resolve(q.p) !== resolve(eigen) && re.test(q.t))) hilfen.add(name);
  }
  return hilfen;
}

export function ausnahmenLesen(wurzel) {
  const p = join(wurzel, "pruefungen", "verdrahtung-ausnahmen.json");
  const fehler = [];
  const map = new Map();
  if (!existsSync(p)) return { map, fehler };
  let roh;
  try {
    roh = JSON.parse(readFileSync(p, "utf8"));
  } catch (e) {
    fehler.push("verdrahtung-ausnahmen.json ist kein gültiges JSON: " + e.message);
    return { map, fehler };
  }
  if (!Array.isArray(roh)) {
    fehler.push("verdrahtung-ausnahmen.json muss eine Liste sein.");
    return { map, fehler };
  }
  for (const e of roh) {
    const datei = e && typeof e.datei === "string" ? e.datei : "";
    if (!datei) { fehler.push("Ausnahme ohne 'datei'."); continue; }
    if (typeof e.grund !== "string" || e.grund.trim().length < 10) {
      fehler.push(`Ausnahme '${datei}' ohne begründetes Pflichtfeld 'grund' (mind. 10 Zeichen).`);
      continue;
    }
    map.set(datei, e.grund.trim());
  }
  return { map, fehler };
}

export function pruefen(wurzel) {
  const fehler = [];
  const warnungen = [];
  const dir = join(wurzel, "pruefungen");
  const eintraege = readdirSync(dir, { withFileTypes: true }).filter((d) => d.isFile()).map((d) => d.name);
  const tests = eintraege.filter((n) => /\.test\.js$/.test(n));
  const mjs = eintraege.filter((n) => /\.mjs$/.test(n));
  const hilfen = hilfsmodule(wurzel, mjs);
  const dateien = [...tests, ...mjs.filter((n) => !hilfen.has(n))].sort();
  const v = verdrahtungSammeln(wurzel);
  const { map: ausnahmen, fehler: afehler } = ausnahmenLesen(wurzel);
  fehler.push(...afehler);
  const fehlend = [];
  for (const d of dateien) {
    if (istVerdrahtet(d, v)) {
      if (ausnahmen.has(d)) warnungen.push(`Ausnahme überflüssig, '${d}' ist verdrahtet.`);
      continue;
    }
    if (ausnahmen.has(d)) continue;
    fehlend.push(d);
  }
  if (fehlend.length) {
    fehler.push(
      `${fehlend.length} Prüfdatei(en) weder in package.json-Skripten noch im Workflow verdrahtet (laufen nie in der CI):\n` +
        fehlend.map((f) => "  - pruefungen/" + f).join("\n") +
        "\n  Entweder in ein pruefung:*-Skript und pruefung.yml aufnehmen oder in pruefungen/verdrahtung-ausnahmen.json mit 'grund' eintragen.",
    );
  }
  for (const a of ausnahmen.keys()) {
    if (!eintraege.includes(a)) warnungen.push(`Ausnahme '${a}' verweist auf keine vorhandene Prüfdatei.`);
  }
  warnungen.push(...paketWarnungen(wurzel));
  return { fehler, warnungen, geprueft: dateien.length, hilfen: [...hilfen].sort() };
}

// Nur Warnungen, ohne Netz: lokale work-packages.json und lokale Remote-Branch-Liste.
function paketWarnungen(wurzel) {
  const w = [];
  const p = join(wurzel, "docs", "acc45", "work-packages.json");
  if (!existsSync(p) || !statSync(p).isFile()) return w;
  let daten;
  try { daten = JSON.parse(readFileSync(p, "utf8")); } catch { return w; }
  const liste = Array.isArray(daten.pakete) ? daten.pakete : [];
  const mitBranch = [];
  let branches = null;
  try {
    branches = execFileSync("git", ["branch", "-r"], { cwd: wurzel, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
      .split("\n").map((s) => s.trim()).filter(Boolean);
  } catch { /* kein Git: Branchprüfung entfällt */ }
  for (const e of liste) {
    if (!e || !/^(INTEGRATED|DONE)$/i.test(String(e.status || ""))) continue;
    const id = String(e.id || "?");
    const prLeer = !e.pr || (Array.isArray(e.pr) && e.pr.length === 0);
    if (!e.branch || prLeer) w.push(`Paket ${id} (${e.status}) hat leeren branch- oder pr-Eintrag.`);
    if (branches) {
      const schluessel = id.toLowerCase().replace(/[^a-z0-9]+/g, "");
      if (schluessel.length < 4) continue;
      const re = new RegExp("(^|[^a-z0-9])" + schluessel + "([^0-9]|$)");
      const offen = branches.filter(
        (b) => !b.includes("HEAD") && !/^origin\/(main|integration\/)/.test(b) && re.test(b.toLowerCase()),
      );
      if (offen.length) mitBranch.push(`${id} (${offen.length})`);
    }
  }
  if (mitBranch.length) w.push(`${mitBranch.length} INTEGRATED/DONE-Paket(e) mit noch offenem Remote-Branch (Aufräumen prüfen): ${mitBranch.join(", ")}`);
  return w;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const wurzel = resolve(process.argv[2] || ".");
  const { fehler, warnungen, geprueft } = pruefen(wurzel);
  for (const x of warnungen) console.warn("WARNUNG: " + x);
  for (const x of fehler) console.error("FEHLER: " + x);
  if (fehler.length) process.exit(1);
  console.log(`Verdrahtung ok: ${geprueft} Prüfdateien geprüft.`);
}
