/* ==========================================================================
   SSOT-NACH-INTEGRATION — setzt die Pakete eines gemergten PRs auf
   INTEGRATED, mit dem PR als Beleg. Wird nach jeder Integration aufgerufen.

   Teil-PRs: Nennt der PR-Titel nur einen Teil ("Teil 2", "Teil:", "Teil-PR", "Teilpaket", "Teilumfang", "Bibliothek",
   z. B. "WP-33 Teil: Testinfrastruktur ...", "WP-40 Teil: Browser-Abnahme ...", "WP-16c Teil: Messung des
   Korrekturpfads ...", "WP-I24 Teil 1: ..."), setzt das Werkzeug das Paket
   NICHT auf INTEGRATED, sondern vermerkt den PR und hält es auf IN_PROGRESS (Art TEILWEISE). Der Koordinator prüft den Rest.

   Teil-PRs und vorhandener Beleg (Art TEILWEISE): Hat die Stufe "integriert" bereits einen nicht leeren Beleg, der NICHT
   der Standardtext dieses Werkzeugs ist (z. B. ein Detailbeleg bei WP-48 mit Wert false), bleiben Wert und Beleg erhalten;
   der PR wird nur angehängt ("(+ PR #N)", idempotent, Wortgrenze: #30 ist nicht #301). Nur ohne Beleg oder mit dem
   Standardtext wird der Standardtext gesetzt; weitere PRs werden dort in die Liste aufgenommen ("Teilumfang in PR #341,
   #342 integriert; ..."), nie überschrieben. In der Notiz steht je Paket höchstens EIN Satz "Stand (automatisch): Teilumfang
   nach #341, #342, #346, ..."; weitere PRs werden in diesen Satz eingefasst (idempotent, keine Dubletten).

   Externe Betreiberpakete (Feld strang = "extern", z. B. E-9): Ein PR setzt sie nie auf INTEGRATED. Das Werkzeug hängt
   den PR nur an die Liste "pr" an (Art PR_ERGAENZT_EXTERN), ohne Statuswechsel, Stufen- oder Notizänderung.

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

/**
 * Nennt der PR-Titel nur einen Teil eines Pakets ("Teil 2", "Teil:", "Teil-PR", "Teilpaket", "Teilumfang", "Bibliothek")? Dann darf das Werkzeug das
 * Paket nicht auf INTEGRATED setzen, auch wenn die Paket-ID im Titel steht (WP-21 Teil 1 und 2, IMP-6 Bibliothek).
 * Im Zweifel konservativ: Ein Treffer erzwingt die Prüfung durch den Koordinator.
 */
export function istTeilPr(titel) {
  return /\bTeil\s*\d+\b|\bTeil(?:paket|umfang)?\b|\bBibliothek\b/i.test(String(titel ?? ""));
}

/** Hat das Paket die Stufe „integriert“ ausdrücklich als „teilweise“ geführt, ist es nach einem weiteren PR nicht vollständig, auch wenn der Titel keinen Teil nennt. */
export function istDeklariertTeilweise(p) {
  return p?.stufen?.integriert?.wert === "teilweise";
}

/** Standardtext der Stufe "integriert" bei Teil-PRs; die PR-Liste wird bei weiteren PRs erweitert. */
const STD_ANFANG = "Teilumfang in PR ";
const STD_ENDE = " integriert; der PR-Titel nennt nur einen Teil des Pakets. Koordinator prüft, was noch offen ist.";
const stdBeleg = (prs) => `${STD_ANFANG}${prs.join(", ")}${STD_ENDE}`;
function stdPrs(beleg) {
  const t = String(beleg || "").trim();
  if (!t.startsWith(STD_ANFANG) || !t.endsWith(STD_ENDE)) return null;
  return t.slice(STD_ANFANG.length, t.length - STD_ENDE.length).split(", ").filter(Boolean);
}
const NOTIZ_TEIL = /\s*Stand \(automatisch\): Teilumfang nach ([^;]*?), Status [A-Z_]+; Rest offen \(Titel nennt nur einen Teil\)\./g;

/** Externe Betreiberpakete werden in der SSOT über strang = "extern" geführt (alle E-<n>); nie automatisch INTEGRATED. */
export function istExternBetreiber(p) {
  return p?.strang === "extern";
}

export function plan(ssot, pr) {
  const treffer = paketeFuerPr(ssot.pakete.map((p) => p.id), pr);
  const teil = istTeilPr(pr.title);
  const aenderungen = [];
  for (const id of treffer) {
    const p = ssot.pakete.find((x) => x.id === id);
    const pnr = `#${pr.number}`;
    if (istExternBetreiber(p)) {
      if (!(p.pr || []).includes(pnr)) aenderungen.push({ id, art: "PR_ERGAENZT_EXTERN", pr: pnr });
    } else if (ERLEDIGT.includes(p.status)) {
      if (!(p.pr || []).includes(pnr)) aenderungen.push({ id, art: "PR_ERGAENZT", pr: pnr });
    } else if (teil || istDeklariertTeilweise(p)) {
      aenderungen.push({ id, art: "TEILWEISE", von: p.status, pr: pnr });
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
    if (a.art === "PR_ERGAENZT_EXTERN") continue;
    if (a.art === "INTEGRIERT") {
      p.status = "INTEGRATED";
      for (const k of ["implementiert", "lokalGetestet", "reviewt", "integriert"]) p.stufen[k] = { wert: true, beleg };
    }
    if (a.art === "TEILWEISE") {
      /* Teilumfang: Status nie INTEGRATED. Ein noch nicht begonnenes Paket gilt jetzt als in Arbeit. */
      /* Als „teilweise“ deklarierte Pakete behalten ihren Status: ein BLOCKED-Paket (Betreibersperre, z. B. E-9) wird durch einen PR nicht freigegeben. */
      if (!istDeklariertTeilweise(p) && (p.status === "BLOCKED" || p.status === "READY")) p.status = "IN_PROGRESS";
      /* Vorhandener Beleg, der nicht der Standardtext ist: Wert und Beleg behalten, den PR nur anhängen (nie zurückstufen). */
      p.stufen.integriert = p.stufen.integriert || { wert: false, beleg: null };
      const alt = String(p.stufen.integriert.beleg || "").trim();
      const alteStd = stdPrs(alt);
      if (alt && !alteStd) {
        if (!new RegExp(pnr + "(?![0-9])").test(alt)) p.stufen.integriert = { wert: p.stufen.integriert.wert, beleg: `${alt} (+ PR ${pnr})` };
      } else {
        const prs = [...new Set([...(alteStd || []), pnr])];
        p.stufen.integriert = { wert: istDeklariertTeilweise(p) ? "teilweise" : false, beleg: stdBeleg(prs) };
      }
      /* Notiz: höchstens ein automatischer Teilumfang-Satz je Paket, die PRs werden zusammengefasst. */
      const notizPrs = [];
      const rest = String(p.notiz || "").replace(NOTIZ_TEIL, (_m, liste) => { notizPrs.push(...liste.split(", ")); return ""; }).trim();
      const alle = [...new Set([...notizPrs, pnr])];
      p.notiz = `${rest} Stand (automatisch): Teilumfang nach ${alle.join(", ")}, Status ${p.status}; Rest offen (Titel nennt nur einen Teil).`.trim();
      continue;
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
