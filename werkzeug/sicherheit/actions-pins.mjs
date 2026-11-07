#!/usr/bin/env node
/* ==========================================================================
   SICHERHEIT – Fremde GitHub Actions nur per Commit-SHA (SI-P8, Befund P8)

   Prüft jede `uses:`-Zeile in .github/workflows/*.yml|yaml und in
   .github/actions/ (rekursiv, action.yml|yaml):

   - lokale Actions und Workflows (`./…`) sind erlaubt,
   - Container-Actions (`docker://…`) nur mit `@sha256:<64 hex>`,
   - alle anderen (`owner/repo[/pfad]@ref`) nur mit vollständigem
     40-stelligem Commit-SHA und einem lesbaren Versionskommentar
     (`# v1.2.3`), damit Dependabot und Menschen die Version erkennen,
   - ein Ausdruck (`${{ … }}`) im `uses:` ist verboten,
   - derselbe SHA einer Action darf nicht mit verschiedenen Versions-
     kommentaren auftreten (falsch beschrifteter Pin).

   Mit --online wird zusätzlich je Action über `git ls-remote` geprüft, dass
   das Tag im Kommentar im offiziellen Repository auf genau diesen Commit
   zeigt (braucht Netz zu github.com; nicht Teil des CI-Laufs).

   Aufruf:   node werkzeug/sicherheit/actions-pins.mjs [--online]
   Ausgang:  0 = alle Referenzen gepinnt, 1 = Befund
   ========================================================================== */

import { readdir, readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const USES = /^\s*(?:-\s+)?uses\s*:\s*(.*)$/;
const SHA40 = /^[0-9a-f]{40}$/;
const VERSION = /^v\d+(?:\.\d+){0,2}$/;
const DOCKER_DIGEST = /^docker:\/\/[^@\s]+@sha256:[0-9a-f]{64}$/;
const ACTION = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)((?:\/[A-Za-z0-9_.\-/]+)?)@(.+)$/;

/** Wert und Kommentar einer `uses:`-Zeile trennen; Anführungszeichen ab. */
function zerlege(rest) {
  let wert = rest;
  let kommentar = "";
  const m = /^(?:"([^"]*)"|'([^']*)'|([^\s#]+))\s*(?:#\s*(.*))?$/.exec(rest.trim());
  if (m) {
    wert = m[1] ?? m[2] ?? m[3] ?? "";
    kommentar = (m[4] || "").trim();
  } else {
    wert = rest.trim();
  }
  return { wert, kommentar };
}

/**
 * Prüft den Text einer Workflow- oder Action-Datei.
 * @returns {{ referenzen: Array<object>, befunde: string[] }}
 */
export function actionsPruefen(text, datei = "<text>") {
  const referenzen = [];
  const befunde = [];
  const zeilen = String(text).split(/\r?\n/);
  zeilen.forEach((zeile, i) => {
    if (/^\s*#/.test(zeile)) return;
    const m = USES.exec(zeile);
    if (!m) return;
    const ort = `${datei}:${i + 1}`;
    const { wert, kommentar } = zerlege(m[1]);
    if (!wert) {
      befunde.push(`${ort}: leeres uses:`);
      return;
    }
    if (wert.includes("${{")) {
      befunde.push(`${ort}: Ausdruck in uses: (${wert}) – nicht prüfbar, nicht erlaubt`);
      return;
    }
    if (wert.startsWith("./")) {
      referenzen.push({ ort, art: "lokal", wert });
      return;
    }
    if (wert.startsWith("docker://")) {
      if (!DOCKER_DIGEST.test(wert)) befunde.push(`${ort}: Container-Action ohne sha256-Digest (${wert})`);
      else referenzen.push({ ort, art: "docker", wert });
      return;
    }
    const a = ACTION.exec(wert);
    if (!a) {
      befunde.push(`${ort}: unbekannte Form ohne @ref (${wert})`);
      return;
    }
    const [, owner, repo, unterpfad, ref] = a;
    if (!SHA40.test(ref)) {
      befunde.push(`${ort}: ${owner}/${repo}${unterpfad}@${ref} ist nicht auf einen vollständigen Commit-SHA gepinnt`);
      return;
    }
    if (!VERSION.test(kommentar)) {
      befunde.push(`${ort}: ${owner}/${repo}${unterpfad}@${ref} ohne Versionskommentar (erwartet: # vX.Y.Z)`);
      return;
    }
    referenzen.push({ ort, art: "extern", repo: `${owner}/${repo}`, unterpfad, sha: ref, version: kommentar });
  });
  return { referenzen, befunde };
}

/** Gleicher SHA derselben Action mit verschiedenen Versionskommentaren. */
export function kommentareAbgleichen(referenzen) {
  const befunde = [];
  const je = new Map();
  for (const r of referenzen) {
    if (r.art !== "extern") continue;
    const k = `${r.repo}@${r.sha}`;
    const bisher = je.get(k);
    if (!bisher) je.set(k, r);
    else if (bisher.version !== r.version) {
      befunde.push(`${r.ort}: ${k} als ${r.version} beschriftet, in ${bisher.ort} als ${bisher.version}`);
    }
  }
  return befunde;
}

async function dateienSammeln() {
  const ergebnis = [];
  const wf = path.join(WURZEL, ".github", "workflows");
  for (const n of (await readdir(wf).catch(() => [])).sort()) {
    if (/\.ya?ml$/.test(n)) ergebnis.push(path.join(wf, n));
  }
  const gehe = async (dir) => {
    for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) await gehe(p);
      else if (/^action\.ya?ml$/.test(e.name)) ergebnis.push(p);
    }
  };
  await gehe(path.join(WURZEL, ".github", "actions"));
  return ergebnis;
}

/** Alle Workflows und lokalen Actions des Repositorys prüfen. */
export async function repositoryPruefen() {
  const referenzen = [];
  const befunde = [];
  const dateien = await dateienSammeln();
  for (const d of dateien) {
    const rel = path.relative(WURZEL, d);
    const r = actionsPruefen(await readFile(d, "utf8"), rel);
    referenzen.push(...r.referenzen);
    befunde.push(...r.befunde);
  }
  befunde.push(...kommentareAbgleichen(referenzen));
  return { dateien: dateien.map((d) => path.relative(WURZEL, d)), referenzen, befunde };
}

/** Online: Tag im Kommentar muss im offiziellen Repo auf den SHA zeigen. */
function onlineAbgleichen(referenzen) {
  const befunde = [];
  const geprueft = new Map();
  for (const r of referenzen) {
    if (r.art !== "extern") continue;
    const k = `${r.repo}@${r.sha}#${r.version}`;
    if (geprueft.has(k)) continue;
    const lauf = spawnSync(
      "git",
      ["ls-remote", `https://github.com/${r.repo}.git`, `refs/tags/${r.version}`, `refs/tags/${r.version}^{}`],
      { encoding: "utf8", timeout: 30000 },
    );
    const zeilen = (lauf.stdout || "").trim().split("\n").filter(Boolean);
    // Bei annotierten Tags zählt die dereferenzierte Zeile (^{}).
    const deref = zeilen.find((z) => z.endsWith("^{}")) || zeilen[0] || "";
    const sha = deref.split(/\s+/)[0];
    const ok = lauf.status === 0 && sha === r.sha;
    geprueft.set(k, ok);
    console.log(`${ok ? "ok  " : "FEHL"} ${r.repo} ${r.version} -> ${sha || "(nicht gefunden)"}`);
    if (!ok) befunde.push(`${r.ort}: ${r.repo} ${r.version} zeigt auf ${sha || "nichts"}, gepinnt ist ${r.sha}`);
  }
  return befunde;
}

const istCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (istCli) {
  const { dateien, referenzen, befunde } = await repositoryPruefen();
  if (process.argv.includes("--online")) befunde.push(...onlineAbgleichen(referenzen));
  const extern = referenzen.filter((r) => r.art === "extern");
  console.log(
    `Actions-Pins: ${dateien.length} Dateien, ${extern.length} externe Referenzen ` +
      `(${new Set(extern.map((r) => `${r.repo}@${r.sha}`)).size} verschiedene), ` +
      `${referenzen.filter((r) => r.art === "lokal").length} lokale`,
  );
  if (dateien.length === 0) befunde.push("keine Workflow-Dateien gefunden");
  for (const b of befunde) console.log(`::error::${b}`);
  process.exit(befunde.length ? 1 : 0);
}
