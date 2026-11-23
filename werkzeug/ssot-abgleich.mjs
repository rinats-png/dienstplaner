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
   Exit 2: abgebrochen (PR-Liste nicht ermittelbar, Option ohne Wert, ungültiger Eintrag im SSOT-Feld pr).
   ========================================================================== */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { paketeFuerPr, brauchtPrBeleg, ERLEDIGT } from "./ssot-zuordnung.mjs";
// Review #490 N1: eine Quelle für das PR-Format (kein Zyklus: acc45-backlog.mjs importiert nur node:*).
import { PR_MUSTER } from "./acc45-backlog.mjs";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASIS = "integration/release-v4";
const SSOT_PFAD = "docs/acc45/work-packages.json";

/**
 * Wert einer Option mit Wert (--datei, --prs). Review #490 N2: fehlt der Wert (Ende der Zeile, leer oder selbst eine
 * Option), ist das ein Fehler. Es gibt keinen stillen Rückfall auf gh (Netz) oder auf den Standardpfad.
 * Fehlt die Option ganz: undefined.
 */
export function argWert(name, argv = process.argv) {
  const i = argv.indexOf(name);
  if (i < 0) return undefined;
  const wert = argv[i + 1];
  if (typeof wert !== "string" || wert === "" || wert.startsWith("--")) throw new Error(`Option ${name} verlangt einen Wert`);
  return wert;
}

/** SSOT aus Datei oder aus dem Integrationsbranch (nie aus dem Arbeitsbaum). */
export function ssotLesen(datei) {
  if (datei) return JSON.parse(readFileSync(datei, "utf8"));
  const text = execFileSync("git", ["show", `origin/${BASIS}:${SSOT_PFAD}`], { cwd: WURZEL, encoding: "utf8" });
  return JSON.parse(text);
}

/** gh-Aufruf (Injektionspunkt für Prüfungen ohne Netz). */
function ghStandard(args) {
  return execFileSync("gh", args, { cwd: WURZEL, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
}

/** REST-Antwort (ein PR-Objekt je Zeile oder JSON-Array) -> [{number,title,headRefName}], nur gemergte. */
export function restZuPrListe(text) {
  const roh = [];
  const t = String(text).trim();
  if (t.startsWith("[")) roh.push(...JSON.parse(t));
  else for (const z of t.split(/\r?\n/)) if (z.trim()) roh.push(JSON.parse(z));
  return roh.filter((pr) => pr && pr.merged_at != null)
    .map((pr) => ({ number: pr.number, title: pr.title, headRefName: pr.head?.ref ?? pr.headRefName }));
}

/** Repo-Name; `gh repo view` nutzt GraphQL und scheitert in Cloud-Sitzungen, dann gilt der Remote `origin`. */
function repoName(gh) {
  try { return String(gh(["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"])).trim(); }
  catch {
    const url = execFileSync("git", ["remote", "get-url", "origin"], { cwd: WURZEL, encoding: "utf8" }).trim();
    const m = url.match(/github\.com[:/]([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/);
    if (!m) throw new Error("Repo-Name aus origin nicht ermittelbar");
    return m[1];
  }
}

/** GraphQL-Weg, bei Fehler REST-Ausweichweg; scheitert beides, wird abgebrochen (fail-closed). */
export function gemergteViaGh(gh = ghStandard) {
  let graphqlFehler;
  try {
    return JSON.parse(gh(["pr", "list", "--state", "merged", "--base", BASIS, "--limit", "500",
      "--json", "number,title,headRefName"]));
  } catch (e) { graphqlFehler = e; }
  try {
    const repo = repoName(gh);
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error(`Repo-Name unbrauchbar: "${repo}"`);
    const text = gh(["api", "--paginate", `repos/${repo}/pulls?state=closed&base=${BASIS}&per_page=100`, "--jq", ".[]"]);
    return restZuPrListe(text);
  } catch (e) {
    throw new Error("PR-Liste nicht ermittelbar (gh pr list: " + String(graphqlFehler?.message ?? graphqlFehler).split("\n")[0] +
      "; REST: " + String(e?.message ?? e).split("\n")[0] + "). Es wird nichts als gemergt gewertet.");
  }
}

/** Gemergte PRs in die Integration, mit Titel und Branch. */
export function gemergteUndPrs(datei) {
  if (datei) return JSON.parse(readFileSync(datei, "utf8"));
  return gemergteViaGh();
}

/**
 * PR-Nummern aus dem SSOT-Feld pr. Review #490 N1: jeder Eintrag genau nach PR_MUSTER („#123“), wie das Schema
 * (acc45-backlog pruefen) es verlangt; sonst Fehler (fail-closed). Gültige Daten: dieselben Nummern wie vorher.
 */
function ssotPrNummern(p) {
  const felder = p.pr || [];
  if (!Array.isArray(felder)) throw new Error(`Paket ${p.id}: Feld pr ist kein Array`);
  const falsch = felder.filter((x) => typeof x !== "string" || !PR_MUSTER.test(x));
  if (falsch.length) throw new Error(`Paket ${p.id}: ungültiger PR-Verweis im Feld pr ${JSON.stringify(falsch)} (Format "#123")`);
  return new Set(felder.map((x) => x.slice(1)));
}

/** Klassifiziert alle Pakete. */
export function abgleich(ssot, prs) {
  const zeilen = [];
  for (const p of ssot.pakete) {
    /* PR-Nummern aus der SSOT zählen, wenn der PR gemergt in die Integration ist. */
    const ssotNummern = ssotPrNummern(p);
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
  let zeilen;
  try {
    const datei = argWert("--datei");
    const prsDatei = argWert("--prs");   // beide Optionen zuerst prüfen: kein Lesen, kein gh-Aufruf bei Fehlbedienung
    zeilen = abgleich(ssotLesen(datei), gemergteUndPrs(prsDatei));
  }
  catch (e) { console.error("SSOT-Abgleich ABGEBROCHEN: " + e.message); process.exit(2); }
  ausgabe(zeilen, process.argv.includes("--json"));
  const kritisch = zeilen.some((z) => z.klasse === "KORREKTUR" || z.klasse === "BELEG_FEHLT");
  process.exit(process.argv.includes("--pruefe") && kritisch ? 1 : 0);
}
