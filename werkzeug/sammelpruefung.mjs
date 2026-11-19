// Sammelpruefung: fuehrt JEDES Skript der Kette `pruefung` (package.json) aus und meldet je Skript
// bestanden / FEHLER / BEKANNT (umgebungsbedingt) samt Dauer. Anders als `npm run pruefung` (Kette mit `&&`,
// bricht beim ersten Fehler ab) laeuft sie standardmaessig bis zum Ende und zeigt alle Fehler auf einmal.
// Sie ersetzt keine Pruefung und schwaecht keine: ein Skript gilt nur bei Exit 0 als bestanden; jeder
// Fehler (auch ein bekannter) macht den Gesamtlauf rot. Die Liste pruefungen/sammelpruefung-bekannt.json
// ordnet einen Fehler nur ein (Grund und Plattform pflicht), sie verbirgt ihn nicht.
// Kein Netz und keine Geheimnisse ueber das hinaus, was die Kette selbst braucht.
//
// Aufruf: node werkzeug/sammelpruefung.mjs [--trocken] [--stopp] [--ab NAME] [--nur A,B] [--bericht datei.json] [--wurzel dir]
//   --trocken  Kette lesen und gegen package.json und pruefung.yml abgleichen, nichts ausfuehren
//   --stopp    beim ersten Fehler abbrechen (wie `npm run pruefung`)
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { aufrufe, pruefen } from "./ci-abdeckung.mjs";

const SAMMEL = "pruefung";
// Wuerde sich selbst aufrufen (Endlosschleife); im Trockenlauf trotzdem Teil der Kette.
export const SELBST = "pruefung:sammelpruefung";

export function kette(wurzel) {
  const skripte = JSON.parse(readFileSync(join(wurzel, "package.json"), "utf8")).scripts || {};
  const namen = [...new Set(aufrufe(skripte[SAMMEL]))];
  const fehler = [];
  if (!skripte[SAMMEL]) fehler.push("package.json hat kein Skript 'pruefung'.");
  for (const n of namen) if (!skripte[n]) fehler.push(`Kettenglied '${n}' hat kein Skript in package.json.`);
  if (skripte[SAMMEL] && !namen.includes(SELBST)) fehler.push(`'${SELBST}' fehlt in der Kette 'pruefung'.`);
  return { namen, fehler };
}

export function bekanntLesen(wurzel) {
  const p = join(wurzel, "pruefungen", "sammelpruefung-bekannt.json");
  const map = new Map();
  const fehler = [];
  if (!existsSync(p)) return { map, fehler };
  let roh;
  try {
    roh = JSON.parse(readFileSync(p, "utf8"));
  } catch (e) {
    return { map, fehler: ["sammelpruefung-bekannt.json ist kein gueltiges JSON: " + e.message] };
  }
  if (!Array.isArray(roh)) return { map, fehler: ["sammelpruefung-bekannt.json muss eine Liste sein."] };
  for (const e of roh) {
    const s = e && typeof e.skript === "string" ? e.skript : "";
    if (!s) { fehler.push("Eintrag ohne 'skript'."); continue; }
    if (typeof e.grund !== "string" || e.grund.trim().length < 20) { fehler.push(`Eintrag '${s}' ohne begruendetes 'grund' (mind. 20 Zeichen).`); continue; }
    if (typeof e.plattform !== "string" || !e.plattform.trim()) { fehler.push(`Eintrag '${s}' ohne 'plattform' (z. B. win32).`); continue; }
    if (map.has(s)) { fehler.push(`Eintrag '${s}' steht doppelt.`); continue; }
    map.set(s, { grund: e.grund.trim(), plattform: e.plattform.trim() });
  }
  return { map, fehler };
}

// Ein Kettenglied ausfuehren; Rueckgabe { code, ausgabe }. Austauschbar fuer Tests.
export function skriptAusfuehren(name, wurzel) {
  const r = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["run", name], {
    cwd: wurzel, encoding: "utf8", shell: process.platform === "win32", maxBuffer: 64 * 1024 * 1024,
  });
  return { code: r.status === null ? 1 : r.status, ausgabe: (r.stdout || "") + (r.stderr || "") };
}

export function lauf({ wurzel, namen, bekannt = new Map(), ausfuehren = skriptAusfuehren, stopp = false, plattform = process.platform, jetzt = () => Date.now() }) {
  const ergebnisse = [];
  for (const name of namen) {
    if (name === SELBST) { ergebnisse.push({ name, status: "uebersprungen", grund: "ruft diese Sammelpruefung selbst auf", ms: 0 }); continue; }
    const t0 = jetzt();
    const r = ausfuehren(name, wurzel);
    const ms = jetzt() - t0;
    if (r.code === 0) { ergebnisse.push({ name, status: "bestanden", ms }); continue; }
    const b = bekannt.get(name);
    const ein = b && b.plattform === plattform;
    ergebnisse.push({ name, status: ein ? "bekannt" : "fehler", code: r.code, ms, ende: String(r.ausgabe || "").split("\n").slice(-15).join("\n"), ...(ein ? { grund: b.grund } : {}) });
    if (stopp) break;
  }
  const rot = ergebnisse.filter((e) => e.status === "fehler" || e.status === "bekannt");
  return { ergebnisse, exit: rot.length ? 1 : 0 };
}

export function bericht(ergebnisse, gesamtMs) {
  const z = ["Sammelpruefung", "=============="];
  for (const e of ergebnisse) {
    const marke = { bestanden: "ok      ", fehler: "FEHLER  ", bekannt: "BEKANNT ", uebersprungen: "uebersp." }[e.status];
    z.push(`${marke} ${e.name.padEnd(48)} ${(e.ms / 1000).toFixed(1)} s${e.grund ? "  (" + e.grund + ")" : ""}`);
  }
  const n = (s) => ergebnisse.filter((e) => e.status === s).length;
  z.push("", `${ergebnisse.length} Glieder: ${n("bestanden")} bestanden, ${n("fehler")} Fehler, ${n("bekannt")} bekannte Umgebungsfehler (zaehlen als rot), ${n("uebersprungen")} uebersprungen; ${(gesamtMs / 1000).toFixed(0)} s.`);
  return z.join("\n");
}

export function trocken(wurzel) {
  const { namen, fehler } = kette(wurzel);
  const ci = pruefen(wurzel);
  const b = bekanntLesen(wurzel);
  const alle = [...fehler, ...b.fehler];
  // Gleiche Regel wie pruefung:ci-abdeckung (inkl. begruendeter Ausnahmen, z. B. serverlauf).
  for (const f of ci.fehler) alle.push("CI-Abdeckung: " + f);
  for (const [s] of b.map) if (!namen.includes(s)) alle.push(`Bekannte-Fehler-Eintrag '${s}' zeigt auf kein Kettenglied.`);
  return { namen, fehler: alle };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  const wert = (k) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : null; };
  const wurzel = resolve(wert("--wurzel") || ".");
  const t = trocken(wurzel);
  if (t.fehler.length) { for (const f of t.fehler) console.error("FEHLER: " + f); process.exit(1); }
  if (a.includes("--trocken")) { console.log(`Sammelpruefung (trocken) ok: ${t.namen.length} Kettenglieder, alle im Workflow.`); process.exit(0); }
  let namen = t.namen;
  if (wert("--nur")) { const nur = new Set(wert("--nur").split(",")); namen = namen.filter((n) => nur.has(n)); }
  if (wert("--ab")) { const i = namen.indexOf(wert("--ab")); if (i < 0) { console.error("FEHLER: --ab-Glied unbekannt."); process.exit(1); } namen = namen.slice(i); }
  const t0 = Date.now();
  const ausfuehren = (n, w) => { console.log(`> npm run ${n}`); const r = skriptAusfuehren(n, w); console.log(r.code === 0 ? "  ok" : "  Exit " + r.code); return r; };
  const r = lauf({ wurzel, namen, bekannt: bekanntLesen(wurzel).map, ausfuehren, stopp: a.includes("--stopp") });
  const gesamt = Date.now() - t0;
  console.log("\n" + bericht(r.ergebnisse, gesamt));
  for (const e of r.ergebnisse.filter((x) => x.ende)) console.log(`\n--- ${e.name} (Exit ${e.code}), Ende der Ausgabe ---\n${e.ende}`);
  if (wert("--bericht")) writeFileSync(resolve(wert("--bericht")), JSON.stringify({ plattform: process.platform, gesamtMs: gesamt, ergebnisse: r.ergebnisse.map(({ ende, ...x }) => x) }, null, 2));
  process.exit(r.exit);
}
