/* ==========================================================================
   SSOT-NACH-INTEGRATION — setzt die Pakete eines gemergten PRs auf
   INTEGRATED, mit dem PR als Beleg. Wird nach jeder Integration aufgerufen.

   Aufruf:  node werkzeug/ssot-nach-integration.mjs <PR-Nummer> [--schreibe] [--datei F]
     Ohne --schreibe: nur Plan (Dry-Run, Standard).
     --schreibe: schreibt docs/acc45/work-packages.json, erzeugt die
                 Übersichten neu und prüft die Quelle; scheitert die Prüfung,
                 wird die Datei zurückgesetzt.

   Exit: 0 ok/keine Änderung · 1 Prüfung fehlgeschlagen · 2 PR nicht
         gemergt in die Integration oder keinem Paket zuzuordnen ·
         3 Sperre belegt (ein anderer Watcher läuft)

   Sperre: Ein gemeinsamer Lock-Ordner im Temp-Verzeichnis verhindert,
   dass zwei Watcher gleichzeitig Statusänderungen schreiben.
   ========================================================================== */
import { execFileSync } from "node:child_process";
import { prAnsicht } from "./gh-rest.mjs";
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { paketeFuerPr, ERLEDIGT } from "./ssot-zuordnung.mjs";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASIS = "integration/release-v4";
const SSOT = path.join(WURZEL, "docs", "acc45", "work-packages.json");
const LOCK = path.join(os.tmpdir(), "centric-ssot.lock");
const LOCK_ALT_MS = 15 * 60 * 1000;

function lockNehmen() {
  for (let versuch = 0; versuch < 2; versuch++) {
    try { mkdirSync(LOCK); return true; } catch (e) {
      if (e.code !== "EEXIST") throw e;
      /* Veralteter Lock (Absturz eines Watchers) wird einmal entfernt. */
      if (Date.now() - statSync(LOCK).mtimeMs > LOCK_ALT_MS) { rmSync(LOCK, { recursive: true, force: true }); continue; }
      return false;
    }
  }
  return false;
}
function lockFreigeben() { try { rmSync(LOCK, { recursive: true, force: true }); } catch { /* egal */ } }


const ERGEBNIS = (code, text) => { if (text) console.log(text); process.exitCode = code; };

export function plan(ssot, pr) {
  const treffer = paketeFuerPr(ssot.pakete.map((p) => p.id), pr);
  const aenderungen = [];
  for (const id of treffer) {
    const p = ssot.pakete.find((x) => x.id === id);
    const pnr = `#${pr.number}`;
    if (ERLEDIGT.includes(p.status)) {
      if (!(p.pr || []).includes(pnr)) aenderungen.push({ id, art: "PR_ERGAENZT", pr: pnr });
    } else {
      aenderungen.push({ id, art: "INTEGRIERT", von: p.status, pr: pnr });
    }
  }
  return aenderungen;
}

export function anwenden(ssot, aenderungen, pr) {
  const pnr = `#${pr.number}`;
  const beleg = `PR ${pnr} in integration/release-v4`;
  for (const a of aenderungen) {
    const p = ssot.pakete.find((x) => x.id === a.id);
    p.pr = [...new Set([...(p.pr || []), pnr])];
    if (a.art === "INTEGRIERT") {
      p.status = "INTEGRATED";
      for (const k of ["implementiert", "lokalGetestet", "reviewt", "integriert"]) p.stufen[k] = { wert: true, beleg };
    }
    p.notiz = `${(p.notiz || "").trim()} Stand (automatisch): ${p.status} nach ${pnr}.`.trim();
  }
  return ssot;
}

function main() {
  const pnr = process.argv.find((a) => /^\d+$/.test(a));
  if (!pnr) return ERGEBNIS(2, "Aufruf: node werkzeug/ssot-nach-integration.mjs <PR-Nummer> [--schreibe]");
  const schreibe = process.argv.includes("--schreibe");
  const datei = process.argv.includes("--datei") ? process.argv[process.argv.indexOf("--datei") + 1] : null;

  const pr = prAnsicht(pnr, WURZEL);
  if (!pr.mergedAt || pr.baseRefName !== BASIS) return ERGEBNIS(2, `PR #${pnr} ist nicht in ${BASIS} gemergt (Basis ${pr.baseRefName}).`);

  const quelle = datei ? path.resolve(datei) : SSOT;
  const ssot = JSON.parse(readFileSync(quelle, "utf8"));
  const aenderungen = plan(ssot, pr);
  if (aenderungen.length === 0) return ERGEBNIS(2, `PR #${pnr}: kein Paket zugeordnet oder bereits vollständig vermerkt.`);
  console.log(`PR #${pnr} "${pr.title}" → ${aenderungen.map((a) => `${a.id}(${a.art}${a.von ? ":" + a.von : ""})`).join(", ")}`);
  if (!schreibe) return ERGEBNIS(0, "Dry-Run: mit --schreibe übernehmen.");

  if (!lockNehmen()) return ERGEBNIS(3, "Sperre belegt: ein anderer Watcher schreibt gerade den SSOT-Stand. Später erneut.");
  let sicherung = null;
  try {
    sicherung = readFileSync(quelle, "utf8");
    anwenden(ssot, aenderungen, pr);
    writeFileSync(quelle, JSON.stringify(ssot, null, 2) + "\n");
    if (quelle === SSOT) {
      execFileSync("node", ["werkzeug/acc45-backlog.mjs", "status-schreiben"], { cwd: WURZEL, stdio: "ignore" });
      execFileSync("node", ["werkzeug/acc45-backlog.mjs", "pruefen"], { cwd: WURZEL, stdio: "ignore" });
    }
    ERGEBNIS(0, `Übernommen: ${aenderungen.length} Änderung(en). Bitte committen und per PR bestätigen.`);
  } catch (e) {
    if (sicherung !== null) writeFileSync(quelle, sicherung);
    ERGEBNIS(1, `Prüfung fehlgeschlagen, Datei zurückgesetzt: ${String(e.message || e).split("\n")[0]}`);
  } finally {
    lockFreigeben();
  }
}

const istHaupt = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (istHaupt) main();
