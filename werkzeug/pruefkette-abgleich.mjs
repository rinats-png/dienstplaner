/* ==========================================================================
   PRÜFKETTE ABGLEICHEN — Sammelprüfung und CI sagen dasselbe

   Es gibt zwei Listen derselben Prüfungen:

     package.json  "pruefung"           die Sammelkette für den Rechner
     .github/workflows/pruefung.yml     die Schritte der CI

   Beide wurden von Hand gepflegt, und sie liefen auseinander: Im November
   2026 liefen vierzehn Suiten (Accounts, Registrierung, Anmeldung über HTTP,
   Betriebsauswahl, Sicherung der Ablage …) nur in der CI. Wer lokal
   `npm run pruefung` grün sah, hatte sie nie gesehen.

   Dieses Werkzeug vergleicht beide Listen und meldet jede Abweichung:

     1. Jede `npm run pruefung:*`, die die CI aufruft, steht auch in der
        Kette — direkt oder über `pruefung:serverlauf` (die HTTP-Prüfungen
        der CI laufen dort gegen einen Container, lokal gegen einen frischen
        Server; `node pruefungen/<name>.mjs` ⇔ `serverlauf.mjs <name>`).
     2. Jedes Glied der Kette läuft auch in der CI — wieder direkt oder, für
        die Glieder von `pruefung:serverlauf`, über das passende Skript.
     3. Kein `pruefung:*`-Skript steht in keiner der beiden Listen.

   Ausnahmen stehen unten mit Begründung. Eine neue Ausnahme ist eine
   Entscheidung, keine Bequemlichkeit.

   Aufruf:  node werkzeug/pruefkette-abgleich.mjs     (Status 1 bei Abweichung)
   Prüfung: npm run pruefung:pruefkette
   ========================================================================== */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Skripte, die die CI aufruft, die aber keine Prüfsuite sind. */
export const NUR_CI = {
  build: "Übersetzen der Oberfläche — Voraussetzung für das Containerbild, keine Prüfung.",
};

/** Glieder der Kette, die in der CI absichtlich anders heißen. */
export const NUR_KETTE = {
  "pruefung:serverlauf": "Sammelskript; seine Glieder werden einzeln gegen die CI geprüft.",
};

/** `npm run a && npm run b` → ["a", "b"] — nur die npm-Aufrufe. */
export function ketteLesen(befehl) {
  return String(befehl || "")
    .split("&&")
    .map((s) => s.trim())
    .map((s) => /^npm run ([\w:.-]+)$/.exec(s))
    .filter(Boolean)
    .map((m) => m[1]);
}

/** Glieder, die die Kette nicht als `npm run` aufruft (dann ist sie keine reine Kette). */
export function fremdeGlieder(befehl) {
  return String(befehl || "")
    .split("&&")
    .map((s) => s.trim())
    .filter((s) => s && !/^npm run [\w:.-]+$/.test(s));
}

/** `node pruefungen/serverlauf.mjs rechte && …` → ["rechte", …] */
export function serverlaufLesen(befehl) {
  return [...String(befehl || "").matchAll(/serverlauf\.mjs\s+([\w./-]+)/g)]
    .map((m) => m[1].replace(/^pruefungen\//, "").replace(/\.mjs$/, ""));
}

/** Alle `npm run X` aus der Workflow-Datei, Kommentarzeilen ausgenommen. */
export function ciLesen(yaml) {
  const namen = new Set();
  for (const zeile of String(yaml || "").split(/\r?\n/)) {
    if (/^\s*#/.test(zeile)) continue;
    for (const m of zeile.matchAll(/npm run ([\w:.-]+)/g)) namen.add(m[1]);
  }
  return namen;
}

/** Welche serverlauf-Prüfung führt ein Skript aus? `node pruefungen/x.mjs` → "x" */
const serverlaufNameVon = (befehl) => {
  const m = /^node pruefungen\/([\w-]+)\.mjs$/.exec(String(befehl || "").trim());
  return m ? m[1] : null;
};

/**
 * Vergleicht Kette und CI. Liefert eine Liste von Befunden — leer heißt: im Gleichlauf.
 * @param {{ scripts: Record<string, string>, workflow: string }} eingabe
 * @returns {string[]}
 */
export function abgleichen({ scripts, workflow }) {
  const befunde = [];
  if (!scripts || typeof scripts.pruefung !== "string") return ["package.json hat kein Skript „pruefung“."];

  for (const f of fremdeGlieder(scripts.pruefung))
    befunde.push(`Kette enthält ein Glied, das kein „npm run“ ist: „${f}“.`);

  const kette = ketteLesen(scripts.pruefung);
  const ketteSet = new Set(kette);
  const ci = ciLesen(workflow);
  const serverlauf = ketteSet.has("pruefung:serverlauf")
    ? new Set(serverlaufLesen(scripts["pruefung:serverlauf"])) : new Set();

  for (const name of kette)
    if (!(name in scripts)) befunde.push(`Kette ruft „${name}“, das Skript gibt es nicht.`);
  for (const name of ci)
    if (!(name in scripts)) befunde.push(`CI ruft „${name}“, das Skript gibt es nicht.`);

  /* Abgedeckt in der Kette: direkt oder über serverlauf. */
  const inKette = (name) => {
    if (ketteSet.has(name)) return true;
    const n = serverlaufNameVon(scripts[name]);
    return !!n && serverlauf.has(n);
  };
  /* Abgedeckt in der CI: direkt — oder ein serverlauf-Glied über das CI-Skript gleichen Ziels. */
  const ciZiele = new Set([...ci].map((s) => serverlaufNameVon(scripts[s])).filter(Boolean));

  /* 1. CI → Kette */
  for (const name of [...ci].sort()) {
    if (name in NUR_CI || !(name in scripts)) continue;
    if (!inKette(name)) befunde.push(`„${name}“ läuft in der CI, fehlt aber in der Kette „pruefung“.`);
  }

  /* 2. Kette → CI */
  for (const name of kette) {
    if (name in NUR_KETTE) continue;
    if (!ci.has(name)) befunde.push(`„${name}“ steht in der Kette, läuft aber nicht in der CI.`);
  }
  for (const n of serverlauf)
    if (!ciZiele.has(n))
      befunde.push(`serverlauf „${n}“ steht in der Kette, kein CI-Schritt ruft pruefungen/${n}.mjs.`);

  /* 3. Verwaiste Skripte */
  for (const name of Object.keys(scripts).sort()) {
    if (!name.startsWith("pruefung:")) continue;
    if (!ci.has(name) && !inKette(name) && !(name in NUR_KETTE))
      befunde.push(`„${name}“ steht weder in der Kette noch in der CI.`);
  }
  return befunde;
}

/** Liest die echten Dateien des Repos. */
export function repoLesen(wurzel) {
  const paket = JSON.parse(readFileSync(path.join(wurzel, "package.json"), "utf8"));
  const workflow = readFileSync(path.join(wurzel, ".github", "workflows", "pruefung.yml"), "utf8");
  return { scripts: paket.scripts || {}, workflow };
}

const direkt = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (direkt) {
  const wurzel = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const befunde = abgleichen(repoLesen(wurzel));
  if (befunde.length) {
    console.error(`Prüfkette und CI laufen auseinander (${befunde.length}):`);
    for (const b of befunde) console.error(`  - ${b}`);
    process.exit(1);
  }
  console.log("Prüfkette und CI im Gleichlauf.");
}
