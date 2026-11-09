/* ==========================================================================
   SSOT-ABGLEICH — Prüfung vor jeder Aufgabenvergabe (read-only).

   Vergleicht docs/acc45/work-packages.json (Stand des Integrationsbranchs)
   mit den tatsächlich in integration/release-v4 gemergten PRs.

   Klassen je Paket:
     OK             SSOT erledigt und mit PR-Beleg, oder offen ohne PR-Treffer
     KORREKTUR      gemergter PR nennt das Paket, SSOT aber nicht erledigt
     BELEG_FEHLT    SSOT erledigt, aber kein gemergter PR nennt es
                    (Direkt-Merges zählen hier als Lücke, siehe WP-I12)

   Aufruf:  node werkzeug/ssot-abgleich.mjs [--json] [--pruefe] [--datei F] [--prs F]
     --prs F   PR-Liste aus Datei (JSON-Array) statt gh (für Prüfungen ohne Netz)
     --pruefe  Exit 1, wenn KORREKTUR oder BELEG_FEHLT vorliegen
   ========================================================================== */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { paketeFuerPr, brauchtPrBeleg, ERLEDIGT } from "./ssot-zuordnung.mjs";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASIS = "integration/release-v4";
const SSOT_PFAD = "docs/acc45/work-packages.json";

function argWert(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** SSOT aus Datei oder aus dem Integrationsbranch (nie aus dem Arbeitsbaum). */
export function ssotLesen(datei) {
  if (datei) return JSON.parse(readFileSync(datei, "utf8"));
  const text = execFileSync("git", ["show", `origin/${BASIS}:${SSOT_PFAD}`], { cwd: WURZEL, encoding: "utf8" });
  return JSON.parse(text);
}

/** Gemergte PRs in die Integration, mit Titel und Branch. */
export function gemergteUndPrs(datei) {
  if (datei) return JSON.parse(readFileSync(datei, "utf8"));
  const text = execFileSync("gh", ["pr", "list", "--state", "merged", "--base", BASIS, "--limit", "500",
    "--json", "number,title,headRefName"], { cwd: WURZEL, encoding: "utf8" });
  return JSON.parse(text);
}

/** Klassifiziert alle Pakete. */
export function abgleich(ssot, prs) {
  const zeilen = [];
  for (const p of ssot.pakete) {
    /* PR-Nummern aus der SSOT zählen, wenn der PR gemergt in die Integration ist. */
    const ssotNummern = new Set((p.pr || []).map((x) => String(x).match(/\d+/)?.[0]).filter(Boolean));
    const treffer = prs.filter((pr) => ssotNummern.has(String(pr.number)) || paketeFuerPr([p.id], pr).length > 0);
    const erledigt = ERLEDIGT.includes(p.status);
    const prNummern = treffer.map((pr) => `#${pr.number}`);
    let klasse;
    if (treffer.length > 0 && !erledigt) klasse = "KORREKTUR";
    else if (erledigt && treffer.length === 0 && brauchtPrBeleg(p)) klasse = "BELEG_FEHLT";
    else klasse = "OK";
    zeilen.push({ id: p.id, status: p.status, klasse, prs: prNummern });
  }
  return zeilen;
}

function ausgabe(zeilen, alsJson) {
  if (alsJson) { console.log(JSON.stringify(zeilen, null, 2)); return; }
  const zaehl = {};
  for (const z of zeilen) zaehl[z.klasse] = (zaehl[z.klasse] || 0) + 1;
  console.log("SSOT-Abgleich gegen integration/release-v4:", JSON.stringify(zaehl));
  for (const z of zeilen) {
    if (z.klasse === "OK") continue;
    console.log(`  ${z.klasse.padEnd(12)} ${z.id.padEnd(10)} SSOT=${z.status.padEnd(11)} PR=${z.prs.join(",") || "-"}`);
  }
}

const istHaupt = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (istHaupt) {
  const zeilen = abgleich(ssotLesen(argWert("--datei")), gemergteUndPrs(argWert("--prs")));
  ausgabe(zeilen, process.argv.includes("--json"));
  const kritisch = zeilen.some((z) => z.klasse === "KORREKTUR" || z.klasse === "BELEG_FEHLT");
  process.exit(process.argv.includes("--pruefe") && kritisch ? 1 : 0);
}
