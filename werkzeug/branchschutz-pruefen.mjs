/* ==========================================================================
   BRANCHSCHUTZ-PRÜFER — liest nur, ändert nie eine Einstellung.

   Die Lease (werkzeug/koordination.mjs) ist nur dann ein verlässlicher Schutz
   gegen parallele Koordinatoren, wenn niemand ihren Branch per Force-Push
   überschreiben oder löschen kann. Dieses Werkzeug prüft über die GitHub-REST-
   Schnittstelle, ob für die wichtigen Branches Force-Push UND Löschen
   tatsächlich gesperrt sind. Klassischer Branch-Schutz und Rulesets zählen.

   Fail-closed: Was sich nicht belegen lässt (Berechtigung fehlt, API-Fehler),
   gilt als NICHT geschützt.

   Aufruf:  node werkzeug/branchschutz-pruefen.mjs [--zweig NAME] [--json]
   Exit:    0 alle geprüften Branches geschützt
            1 mindestens eine belegte Lücke (nicht geschützt)
            2 nicht belegbar (API-Fehler / fehlende Berechtigung), keine belegte Lücke
   ========================================================================== */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Branches, deren Force-Push und Löschen gesperrt sein müssen. */
export const ZWEIGE = Object.freeze([
  "koordination/lease",
  "integration/release-v4",
  "main",
]);

function ghStandard(args) {
  return execFileSync("gh", args, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
}

/** 404 "Branch not protected" ist eine belegte Lücke, jeder andere Fehler ist nicht belegbar. */
const keinSchutz = (e) => /Branch not protected|HTTP 404/i.test(`${e?.stderr ?? ""} ${e?.stdout ?? ""} ${e?.message ?? ""}`);
const kurz = (e) => String(e?.stderr || e?.message || e).split("\n")[0].slice(0, 160);

/**
 * Prüft einen Branch. `gh` ist austauschbar (Prüfungen ohne Netz).
 * Rückgabe: { zweig, force, loeschen, status: "geschuetzt"|"luecke"|"unbekannt", hinweise[] }
 */
export function schutzFuer(zweig, gh = ghStandard) {
  const enc = encodeURIComponent(zweig);
  const hinweise = [];
  let force = false;
  let loeschen = false;
  let fehler = false;

  try {
    const p = JSON.parse(gh(["api", `repos/{owner}/{repo}/branches/${enc}/protection`]));
    if (p?.allow_force_pushes?.enabled === false) force = true;
    if (p?.allow_deletions?.enabled === false) loeschen = true;
    hinweise.push("klassischer Branch-Schutz vorhanden");
  } catch (e) {
    if (keinSchutz(e)) hinweise.push("kein klassischer Branch-Schutz");
    else { fehler = true; hinweise.push(`klassischer Schutz nicht lesbar: ${kurz(e)}`); }
  }

  try {
    const regeln = JSON.parse(gh(["api", `repos/{owner}/{repo}/rules/branches/${enc}`]));
    const typen = new Set(Array.isArray(regeln) ? regeln.map((r) => r?.type) : []);
    if (typen.has("non_fast_forward")) force = true;
    if (typen.has("deletion")) loeschen = true;
    hinweise.push(`Rulesets: ${typen.size ? [...typen].join(", ") : "keine Regeln"}`);
  } catch (e) {
    fehler = true;
    hinweise.push(`Rulesets nicht lesbar: ${kurz(e)}`);
  }

  const status = force && loeschen ? "geschuetzt" : fehler ? "unbekannt" : "luecke";
  return { zweig, force, loeschen, status, hinweise };
}

/** Exit-Code aus den Einzelergebnissen: Lücke vor unbekannt vor ok. */
export function exitCode(ergebnisse) {
  if (ergebnisse.some((e) => e.status === "luecke")) return 1;
  if (ergebnisse.some((e) => e.status === "unbekannt")) return 2;
  return 0;
}

function arg(name) { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; }

function haupt() {
  const nur = arg("--zweig");
  const zweige = nur ? [nur] : ZWEIGE;
  const ergebnisse = zweige.map((z) => schutzFuer(z));
  if (process.argv.includes("--json")) console.log(JSON.stringify(ergebnisse, null, 2));
  else {
    for (const e of ergebnisse) {
      console.log(`${e.status.toUpperCase().padEnd(10)} ${e.zweig}  force-push gesperrt=${e.force ? "ja" : "nein"}  löschen gesperrt=${e.loeschen ? "ja" : "nein"}`);
      for (const h of e.hinweise) console.log(`           - ${h}`);
    }
  }
  const code = exitCode(ergebnisse);
  if (code !== 0) console.error("Lease ist KEIN verlässlicher Schutz, solange nicht alle Branches geschützt sind (docs/acc45/BETREIBER-BRANCHSCHUTZ.md).");
  return code;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = haupt();
