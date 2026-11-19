// CI-Abdeckung: Jedes Skript, das die Sammelprüfung `pruefung` in package.json
// aufruft, muss auch in der CI laufen — direkt (`npm run X` in
// .github/workflows/pruefung.yml) oder mittelbar (ein dort aufgerufenes Skript
// ruft es wieder per `npm run` auf). Sonst bleibt eine Prüfung grün, die nie
// jemand ausführt. Bewusste Ausnahmen stehen in
// pruefungen/ci-abdeckung-ausnahmen.json (Pflichtfeld "grund") und in
// docs/acc45/CI-ABDECKUNG.md. Nur Node-Bordmittel.
//
// Aufruf: node werkzeug/ci-abdeckung.mjs [wurzel]      Rückgabe: Exit 1 bei Fehlern.
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SAMMEL = "pruefung";

export function aufrufe(text) {
  return [...String(text || "").matchAll(/npm run (?:--silent |-s )?([\w:.-]+)/g)].map((m) => m[1]);
}

export function luecke(wurzel) {
  const skripte = JSON.parse(readFileSync(join(wurzel, "package.json"), "utf8")).scripts || {};
  const kette = [...new Set(aufrufe(skripte[SAMMEL]))];
  let wf = "";
  const dir = join(wurzel, ".github", "workflows");
  if (existsSync(dir)) {
    for (const f of readdirSync(dir)) {
      // Nur das Prüf-Gate: andere Workflows (Auslieferung u. a.) ersetzen es nicht.
      if (f === "pruefung.yml") wf = readFileSync(join(dir, f), "utf8");
    }
  }
  const abgedeckt = new Set();
  const besuchen = (n) => {
    if (abgedeckt.has(n)) return;
    abgedeckt.add(n);
    for (const k of aufrufe(skripte[n])) besuchen(k);
  };
  for (const n of aufrufe(wf)) besuchen(n);
  return { skripte, kette, abgedeckt, fehlend: kette.filter((n) => !abgedeckt.has(n)) };
}

export function ausnahmenLesen(wurzel) {
  const p = join(wurzel, "pruefungen", "ci-abdeckung-ausnahmen.json");
  const fehler = [];
  const map = new Map();
  if (!existsSync(p)) return { map, fehler };
  let roh;
  try {
    roh = JSON.parse(readFileSync(p, "utf8"));
  } catch (e) {
    fehler.push("ci-abdeckung-ausnahmen.json ist kein gültiges JSON: " + e.message);
    return { map, fehler };
  }
  if (!Array.isArray(roh)) {
    fehler.push("ci-abdeckung-ausnahmen.json muss eine Liste sein.");
    return { map, fehler };
  }
  for (const e of roh) {
    const skript = e && typeof e.skript === "string" ? e.skript : "";
    if (!skript) { fehler.push("Ausnahme ohne 'skript'."); continue; }
    if (typeof e.grund !== "string" || e.grund.trim().length < 20) {
      fehler.push(`Ausnahme '${skript}' ohne begründetes Pflichtfeld 'grund' (mind. 20 Zeichen).`);
      continue;
    }
    if (map.has(skript)) { fehler.push(`Ausnahme '${skript}' steht doppelt.`); continue; }
    map.set(skript, { grund: e.grund.trim(), vorlaeufig: e.vorlaeufig === true });
  }
  return { map, fehler };
}

export function pruefen(wurzel) {
  const { skripte, kette, abgedeckt, fehlend } = luecke(wurzel);
  const { map, fehler: af } = ausnahmenLesen(wurzel);
  const fehler = [...af];
  const warnungen = [];
  const offen = fehlend.filter((n) => !map.has(n));
  if (offen.length) {
    fehler.push(
      `${offen.length} Skript(e) der Sammelprüfung 'pruefung' laufen nicht in der CI:\n` +
        offen.map((n) => "  - " + n).join("\n") +
        "\n  Entweder in .github/workflows/pruefung.yml aufnehmen oder in pruefungen/ci-abdeckung-ausnahmen.json mit 'grund' eintragen (und in docs/acc45/CI-ABDECKUNG.md begründen).",
    );
  }
  for (const [n, a] of map) {
    let meldung = null;
    if (!skripte[n]) meldung = `Ausnahme '${n}' verweist auf kein Skript in package.json.`;
    else if (!kette.includes(n)) meldung = `Ausnahme '${n}' ist gar nicht in der Sammelprüfung 'pruefung', also überflüssig.`;
    else if (abgedeckt.has(n)) meldung = `Ausnahme '${n}' ist überflüssig: das Skript läuft inzwischen in der CI. Eintrag entfernen.`;
    if (!meldung) continue;
    (a.vorlaeufig ? warnungen : fehler).push(meldung);
  }
  return { fehler, warnungen, kette: kette.length, ausnahmen: map.size };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const wurzel = resolve(process.argv[2] || ".");
  const r = pruefen(wurzel);
  for (const w of r.warnungen) console.warn("Warnung: " + w);
  if (r.fehler.length) {
    for (const f of r.fehler) console.error("FEHLER: " + f);
    process.exit(1);
  }
  console.log(`CI-Abdeckung ok: ${r.kette} Skripte in der Sammelprüfung, ${r.ausnahmen} begründete Ausnahmen.`);
}
