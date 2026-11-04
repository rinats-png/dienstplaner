#!/usr/bin/env node
/* ==========================================================================
   SICHERHEIT – statische Prüfung (interne Prüfung 2026-11, Prüfpunkt 1)

   Zwei Teile, beide ohne Netz und ohne Zusatzpakete:

   1. ESLint mit der Projektkonfiguration plus den sicherheitsrelevanten
      Kernregeln (no-eval, no-implied-eval, no-new-func, no-script-url,
      no-proto, no-extend-native) und – für src/ – den React-Regeln
      react/no-danger und react/jsx-no-target-blank, react/jsx-no-script-url.
      Ein eigenes Sicherheits-Plugin (eslint-plugin-security) ist im Projekt
      nicht installiert; die Musterliste unten deckt dessen Kernfälle ab.

   2. Muster-Suche in src/, server/ und server.mjs nach Senken und riskanten
      Aufrufen. Jeder Treffer wird gegen eine kurze, begründete Freigabeliste
      (FREIGABEN) geprüft. Unbegründete Treffer der Klasse „hart“ lassen den
      Lauf scheitern; Klasse „sichten“ wird nur aufgelistet (Handsichtung im
      Bericht docs/acc45/SICHERHEIT-INTERN-2026-11.md).

   Aufruf:   node werkzeug/sicherheit/statik.mjs [--json]
   Ausgang:  0 = keine unbegründeten harten Treffer, 1 = sonst
   ========================================================================== */

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ORTE = ["src", "server", "server.mjs"];
const ALS_JSON = process.argv.includes("--json");

/** Muster: name, regex, klasse ("hart" | "sichten"), nur ("src"|"server"|undefined) */
export const MUSTER = [
  { name: "eval", re: /(^|[^.\w])eval\s*\(/, klasse: "hart" },
  { name: "new Function", re: /new\s+Function\s*\(/, klasse: "hart" },
  { name: "setTimeout/setInterval mit Zeichenkette", re: /set(Timeout|Interval)\s*\(\s*["'`]/, klasse: "hart" },
  { name: "dangerouslySetInnerHTML", re: /dangerouslySetInnerHTML/, klasse: "hart" },
  { name: "innerHTML/outerHTML-Zuweisung", re: /\.(inner|outer)HTML\s*=/, klasse: "hart" },
  { name: "insertAdjacentHTML", re: /insertAdjacentHTML\s*\(/, klasse: "hart" },
  { name: "document.write", re: /document\.write(ln)?\s*\(/, klasse: "hart" },
  { name: "javascript:-URL", re: /["'`]javascript:/i, klasse: "hart" },
  { name: "child_process", re: /child_process/, klasse: "hart" },
  { name: "vm-Modul", re: /from\s+["']node:vm["']|require\(["'](node:)?vm["']\)/, klasse: "hart" },
  { name: "unsichere Deserialisierung (node-serialize/yaml.load/v8.deserialize)", re: /node-serialize|yaml\.load\(|v8\.deserialize|unserialize\(/, klasse: "hart" },
  { name: "TLS-Prüfung aus", re: /rejectUnauthorized\s*:\s*false|NODE_TLS_REJECT_UNAUTHORIZED/, klasse: "hart" },
  { name: "CORS pauschal", re: /access-control-allow-origin["'`]?\s*[:,]\s*["'`]\*/i, klasse: "hart" },
  { name: "__proto__-Zugriff", re: /__proto__/, klasse: "sichten" },
  { name: "Object.assign/Spread aus Rumpf (Prototype Pollution sichten)", re: /Object\.assign\([^)]*(rumpf|body|eingabe)/i, klasse: "sichten" },
  { name: "RegExp aus Variable (ReDoS sichten)", re: /new\s+RegExp\s*\(\s*[^"'`/\s]/, klasse: "sichten" },
  { name: "fs-Pfad aus Variable (Traversal sichten)", re: /\b(readFile|writeFile|createReadStream|createWriteStream|unlink|rm|rename|open|stat|readdir|mkdir)\s*\(\s*path\.(join|resolve)\(/, klasse: "sichten", nur: "server" },
  { name: "Server-seitiger Abruf (SSRF sichten)", re: /\bfetch\s*\(|https?\.request\s*\(|sendNotification\s*\(/, klasse: "sichten", nur: "server" },
  { name: "Weiterleitung (Open Redirect sichten)", re: /status:\s*30[1278]|Response\.redirect|["']location["']\s*:/i, klasse: "sichten", nur: "server" },
  { name: "window.location aus Daten (Open Redirect sichten)", re: /(window\.)?location(\.href)?\s*=\s*[^=]|location\.(assign|replace)\s*\(/, klasse: "sichten", nur: "src" },
  { name: "window.open", re: /window\.open\s*\(/, klasse: "sichten", nur: "src" },
  { name: "postMessage", re: /postMessage\s*\(/, klasse: "sichten" },
  { name: "JSON.parse auf Rohtext", re: /JSON\.parse\s*\(/, klasse: "sichten", nur: "server" },
];

/* Begründete Ausnahmen: Datei-Endung des Pfads + Mustername. Jede Zeile
   braucht eine Begründung; neue Fundstellen außerhalb fallen auf. */
export const FREIGABEN = [
  { datei: "src/App.jsx", muster: "document.write",
    grund: "zwei Druckfenster (Handbuch, Aushangplan); alle Bestandsdaten maskiert (esc/h, SI-03), CSP vererbt sich an about:blank" },
];

async function dateien(ort) {
  const voll = path.join(WURZEL, ort);
  if (ort.endsWith(".mjs")) return [voll];
  const aus = [];
  async function lauf(d) {
    for (const e of await readdir(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (e.name !== "node_modules") await lauf(p); }
      else if (/\.(m?js|jsx)$/.test(e.name)) aus.push(p);
    }
  }
  await lauf(voll);
  return aus;
}

function rel(p) { return path.relative(WURZEL, p).split(path.sep).join("/"); }

export async function musterSuche() {
  const treffer = [];
  for (const ort of ORTE) {
    for (const datei of await dateien(ort)) {
      const r = rel(datei);
      const bereich = r.startsWith("src/") ? "src" : "server";
      const zeilen = (await readFile(datei, "utf8")).split(/\r?\n/);
      zeilen.forEach((z, i) => {
        const t = z.trim();
        if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) return;   // Kommentare
        for (const m of MUSTER) {
          if (m.nur && m.nur !== bereich) continue;
          if (!m.re.test(z)) continue;
          const frei = FREIGABEN.find((f) => r.endsWith(f.datei) && f.muster === m.name);
          treffer.push({ datei: r, zeile: i + 1, muster: m.name, klasse: m.klasse, frei: frei ? frei.grund : null });
        }
      });
    }
  }
  return treffer;
}

async function eslintLauf() {
  let ESLint;
  try { ({ ESLint } = await import("eslint")); } catch { return { fehlt: true }; }
  const eslint = new ESLint({
    cwd: WURZEL,
    overrideConfig: [
      { files: ["**/*.{js,jsx,mjs}"], rules: {
        "no-eval": "error", "no-implied-eval": "error", "no-new-func": "error",
        "no-script-url": "error", "no-proto": "error", "no-extend-native": "error" } },
      { files: ["src/**/*.{js,jsx}"], rules: {
        "react/no-danger": "error", "react/jsx-no-target-blank": "error", "react/jsx-no-script-url": "error" } },
    ],
  });
  const erg = await eslint.lintFiles(ORTE);
  const regeln = new Set(["no-eval", "no-implied-eval", "no-new-func", "no-script-url", "no-proto", "no-extend-native",
    "react/no-danger", "react/jsx-no-target-blank", "react/jsx-no-script-url"]);
  const sicherheit = [];
  let fehlerSonst = 0;
  for (const d of erg) for (const m of d.messages) {
    if (regeln.has(m.ruleId)) sicherheit.push({ datei: rel(d.filePath), zeile: m.line, regel: m.ruleId });
    else if (m.severity === 2) fehlerSonst++;
  }
  return { dateien: erg.length, sicherheit, fehlerSonst };
}

const istHaupt = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (istHaupt) {
  const es = await eslintLauf();
  const tr = await musterSuche();
  const hartOffen = tr.filter((t) => t.klasse === "hart" && !t.frei);
  if (ALS_JSON) {
    console.log(JSON.stringify({ eslint: es, treffer: tr }, null, 2));
  } else {
    if (es.fehlt) console.log("ESLint: nicht installiert (npm ci) – übersprungen");
    else console.log(`ESLint: ${es.dateien} Dateien, Sicherheitsregeln verletzt: ${es.sicherheit.length}, sonstige Fehler: ${es.fehlerSonst}`);
    for (const s of es.sicherheit || []) console.log(`  ESLINT ${s.datei}:${s.zeile} ${s.regel}`);
    const nachMuster = {};
    for (const t of tr) (nachMuster[t.muster] ||= []).push(t);
    for (const m of MUSTER) {
      const l = nachMuster[m.name] || [];
      console.log(`[${m.klasse}] ${m.name}: ${l.length}`);
      for (const t of l) console.log(`    ${t.datei}:${t.zeile}${t.frei ? `  (frei: ${t.frei})` : ""}`);
    }
    console.log(hartOffen.length ? `ERGEBNIS: ${hartOffen.length} unbegründete harte Treffer` : "ERGEBNIS: keine unbegründeten harten Treffer");
  }
  process.exit(hartOffen.length || (es.sicherheit && es.sicherheit.length) ? 1 : 0);
}
