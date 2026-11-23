/* ==========================================================================
   SSOT-BELEGE — drei Ebenen je Paket, deterministisch, ohne Agent.

     implementiert   Code oder Tests oder Nachweis im Integrationsbranch
                     (Commit-Betreff, Testdatei oder Nachweis nennt die ID)
     integriert      gemergter PR gegen integration/release-v4
                     (Titel oder Branch nennt die ID; siehe ssot-abgleich.mjs)
     freigabebereit  stagingGeprueft UND fachlichFreigegeben sind belegt

   Vorhandener Code allein ist keine Integration und keine Freigabe.

   Aufruf:  node werkzeug/ssot-belege.mjs [--anwenden] [--datei F] [--prs F]
     Ohne --anwenden: nur Bericht (Standard).
     --prs F: gemergte PRs aus Datei (JSON-Array wie gh) statt gh (Prüfungen ohne Netz).
     PR-Belege aus dem SSOT-Feld pr zählen nur im Format "#123" (PR_MUSTER; Review #486 H-e).
     --anwenden: Pakete mit INTEGRIERT_OHNE_PR oder NICHT_BELEGT werden
                 auf REVIEW gesetzt (nie neu implementiert). Der Beleg
                 (Commits, Tests, Nachweise) wird eingetragen. Danach
                 status-schreiben und pruefen; scheitert die Prüfung,
                 wird zurückgerollt. Gemeinsame Sperre wie ssot-nach-integration.
                 PR-Verweise genau "#123" (PR_MUSTER aus acc45-backlog.mjs),
                 exakter Duplikatvergleich; ein ungültiger Verweis bricht vor
                 jeder Änderung ab (Rückgabe 1, Quelle unverändert; Review #483 H4).

   Option mit Wert (--datei, --prs) ohne Wert, ungültiger Eintrag im SSOT-Feld pr oder PR-Liste nicht ermittelbar:
   Abbruch vor jeder Änderung, Rückgabe 2 (Review #490 N1/N2; kein stiller Rückfall auf gh oder Standardpfad).

   Exit: 0 ok · 1 Prüfung fehlgeschlagen · 2 abgebrochen · 3 Sperre belegt
   ========================================================================== */
import { execFileSync } from "node:child_process";
import { prAnsicht } from "./gh-rest.mjs";
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { trifftText, ERLEDIGT, brauchtPrBeleg } from "./ssot-zuordnung.mjs";
import { gemergteUndPrs, abgleich, argWert, optionenPruefen } from "./ssot-abgleich.mjs";
// Review #483 H4: eine Quelle für das PR-Format (kein Zyklus: acc45-backlog.mjs importiert nur node:*).
import { PR_MUSTER } from "./acc45-backlog.mjs";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASIS = "origin/integration/release-v4";
const LOCK = path.join(os.tmpdir(), "centric-ssot.lock");

function git(args) { return execFileSync("git", args, { cwd: WURZEL, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }); }

/** Commit-Betreffs der Integration ohne Merge-Commits und ohne SSOT-Pflege. */
export function commitBetreffs() {
  return git(["log", "--no-merges", "--format=%h%x09%s", BASIS]).split("\n").filter(Boolean).map((z) => {
    const [hash, ...rest] = z.split("\t");
    return { hash, betreff: rest.join("\t") };
  }).filter((c) => !/^ssot\b/i.test(c.betreff));
}

/** Testdateien und Nachweise der Integration. */
export function dateienImBasisstand() {
  return git(["ls-tree", "-r", "--name-only", BASIS, "pruefungen", "docs/acc45"]).split("\n").filter(Boolean);
}

/** Belege je Paket aus Commits, Tests und Nachweisen. */
export function belegeFuer(id, commits, dateien) {
  const cs = commits.filter((c) => trifftText(id, c.betreff)).map((c) => c.hash);
  const ds = dateien.filter((d) => trifftText(id, path.basename(d)));
  return { commits: cs, dateien: ds };
}

/** Ist ein Commit im Integrationsbranch enthalten? */
export function imBasisstand(hash) {
  try { execFileSync("git", ["merge-base", "--is-ancestor", hash, BASIS], { cwd: WURZEL, stdio: "ignore" }); return true; }
  catch { return false; }
}

/**
 * PR-Belege aus der SSOT: PR gemergt (gleich welche Basis) UND sein
 * Merge-Commit liegt im Integrationsbranch. Nur dann zählt er als Integration.
 */
export function ssotPrBelege(p, ansicht = prAnsicht) {
  const belege = [];
  for (const x of p.pr || []) {
    // Review #486 H-e: genau PR_MUSTER („#123“), wie das Schema (acc45-backlog pruefen) es für pr verlangt; ein anderer
    // Eintrag („12“, „#0“, „#12a“) zählt nicht als Beleg und löst keinen Abruf aus. Gültige Daten: unverändert.
    if (typeof x !== "string" || !PR_MUSTER.test(x)) continue;
    const n = x.slice(1);
    let info;
    try { info = ansicht(n, WURZEL); }
    catch { continue; }
    const hashes = Object.values(p.stufen || {}).map((st) => String(st?.beleg || "")).join(" ").match(/\b[0-9a-f]{7,40}\b/g) || [];
    const ueber = info.mergeCommit?.oid && imBasisstand(info.mergeCommit.oid);
    const belegHash = hashes.some((h) => imBasisstand(h));
    if (info.state === "MERGED" && (ueber || belegHash)) belege.push(`#${n}`);
  }
  return belege;
}

/** Klassifiziert Pakete mit allen drei Ebenen. */
export function ebenen(ssot, prs, commits, dateien) {
  const zeilen = abgleich(ssot, prs);
  return zeilen.map((z) => {
    const p = ssot.pakete.find((x) => x.id === z.id);
    const b = belegeFuer(p.id, commits, dateien);
    const sprs = ssotPrBelege(p);
    const prs = [...new Set([...z.prs, ...sprs])];
    const implementiert = prs.length > 0 || b.commits.length > 0 || b.dateien.length > 0;
    const integriert = prs.length > 0 ? `PR ${prs.join(",")}` : (b.commits.length > 0 ? "nur Commit" : "nein");
    const freigabe = Boolean(p.stufen?.stagingGeprueft?.wert && p.stufen?.fachlichFreigegeben?.wert);
    let klasse = z.klasse;
    /* Klassen nach den belegten Ebenen: PR-Beleg zählt (Merge-Commit oder SSOT-Hash im Integrationsbranch). */
    if (prs.length > 0 && ERLEDIGT.includes(p.status)) klasse = "OK";
    else if (prs.length > 0 && !ERLEDIGT.includes(p.status)) klasse = "KORREKTUR";
    else if (ERLEDIGT.includes(p.status) && brauchtPrBeleg(p)) {
      klasse = b.commits.length > 0 || b.dateien.length > 0 ? "INTEGRIERT_OHNE_PR" : "NICHT_BELEGT";
    }
    return { id: p.id, status: p.status, implementiert, integriert, freigabe, klasse, commits: b.commits, dateien: b.dateien };
  });
}

function lockNehmen() {
  try { mkdirSync(LOCK); return true; } catch (e) {
    if (e.code !== "EEXIST") throw e;
    if (Date.now() - statSync(LOCK).mtimeMs > 15 * 60 * 1000) { rmSync(LOCK, { recursive: true, force: true }); return lockNehmen(); }
    return false;
  }
}
function lockFreigeben() { try { rmSync(LOCK, { recursive: true, force: true }); } catch { /* egal */ } }

/**
 * Schreibt nur belegte Nachweise nach. OK-Pakete bekommen die verifizierten
 * PR-Nummern im Feld pr (Status unverändert). PR-lose, nicht erledigte
 * Pakete werden auf REVIEW gesetzt. DONE wird nie automatisch herabgestuft.
 * Nie INTEGRATED durch dieses Werkzeug, nie neue Umsetzung.
 */
/**
 * PR-Verweise aus dem Feld integriert („PR #1,#2“, sonst keine). Review #483 H4: jeder Eintrag genau nach PR_MUSTER
 * („#0“, führende Null, Zusatz oder Leerzeichen → Fehler); doppelte Einträge zählen einmal.
 */
export function prVerweiseAus(integriert) {
  const m = /^PR (.*)$/s.exec(String(integriert));
  if (!m) return [];
  const xs = m[1].split(",");
  const falsch = xs.filter((x) => !PR_MUSTER.test(x));
  if (falsch.length) throw new Error(`ungültiger PR-Verweis ${JSON.stringify(falsch)} (Format "#123")`);
  return [...new Set(xs)];
}

export function anwenden(ssot, zeilen) {
  let belegErgaenzt = 0;
  let statusAufReview = 0;
  // Review #483 H4: erst alle Verweise prüfen, dann ändern — ein ungültiger Verweis ändert nichts (main: Rückgabe 1).
  const verweise = new Map(zeilen.filter((z) => z.klasse === "OK").map((z) => [z, prVerweiseAus(z.integriert)]));
  for (const z of zeilen) {
    const p = ssot.pakete.find((x) => x.id === z.id);
    if (z.klasse === "OK") {
      const vorhanden = new Set((p.pr || []).map(String));                  // exakter Listenvergleich, kein includes
      const neu = verweise.get(z).filter((x) => !vorhanden.has(x));
      if (neu.length > 0) { p.pr = [...(p.pr || []), ...neu]; belegErgaenzt++; }
      continue;
    }
    if (z.klasse !== "INTEGRIERT_OHNE_PR" && z.klasse !== "NICHT_BELEGT") continue;
    if (p.status === "DONE") continue;
    const beleg = [...z.commits.map((c) => `Commit ${c}`), ...z.dateien.slice(0, 5)].join(", ") || "kein Beleg";
    p.status = "REVIEW";
    p.stufen.implementiert = { wert: z.commits.length + z.dateien.length > 0, beleg };
    p.stufen.integriert = { wert: false, beleg: null };
    p.notiz = `${(p.notiz || "").trim()} Stand (automatisch): ${z.klasse === "INTEGRIERT_OHNE_PR" ? "Code und Tests im Integrationsbranch, aber kein gemergter PR-Beleg. Koordinator entscheidet: nachträglicher Beleg oder Ausnahme. Keine Neuimplementierung." : "kein Beleg (Commit, Test, Nachweis) gefunden. Koordinator prüfen."}`.trim();
    statusAufReview++;
  }
  return { belegErgaenzt, statusAufReview };
}

function main() {
  const wirken = process.argv.includes("--anwenden");
  let quelle, ssot, zeilen;
  try {
    /* Review #490 N2: --datei und --prs verlangen einen Wert; kein stiller Rückfall auf Standardpfad oder gh (Netz). */
    optionenPruefen(process.argv, { flags: ["--anwenden"], werte: ["--datei", "--prs"] });   // unbekannte Option: Abbruch (Rückgabe 2), kein Netzfallback
    const datei = argWert("--datei");
    /* --prs F: PR-Liste aus Datei statt gh (wie ssot-abgleich.mjs; für Prüfungen ohne Netz, Review #486 H-d). */
    const prsDatei = argWert("--prs");
    /* Die Quelle ist die Arbeitsdatei, sonst überschreibt --anwenden die eigenen Änderungen mit dem Integrationsstand. */
    quelle = datei ? path.resolve(datei) : path.join(WURZEL, "docs", "acc45", "work-packages.json");
    ssot = JSON.parse(readFileSync(quelle, "utf8"));
    zeilen = ebenen(ssot, gemergteUndPrs(prsDatei), commitBetreffs(), dateienImBasisstand());
  } catch (e) {
    // Review #490 N1/N2: Fehlbedienung oder ungültiges SSOT-Feld pr bricht vor jeder Änderung ab (wie ssot-abgleich.mjs).
    console.error("SSOT-Belege ABGEBROCHEN: " + String(e.message || e).split("\n")[0]);
    process.exitCode = 2;
    return;
  }
  const zaehl = {};
  for (const z of zeilen) zaehl[z.klasse] = (zaehl[z.klasse] || 0) + 1;
  console.log("SSOT-Belege (implementiert / integriert / freigabebereit):", JSON.stringify(zaehl));
  for (const z of zeilen) {
    if (z.klasse === "OK") continue;
    console.log(`  ${z.klasse.padEnd(20)} ${z.id.padEnd(10)} SSOT=${z.status.padEnd(11)} impl=${z.implementiert ? "ja" : "nein"} int=${z.integriert} frei=${z.freigabe ? "ja" : "nein"}`);
  }
  if (!wirken) { console.log("Dry-Run: mit --anwenden Nachweise übernehmen (kein Status-Upgrade, DONE unberührt)."); return; }
  if (!lockNehmen()) { console.log("Sperre belegt."); process.exitCode = 3; return; }
  const alt = readFileSync(quelle, "utf8");
  try {
    const { belegErgaenzt, statusAufReview } = anwenden(ssot, zeilen);
    writeFileSync(quelle, JSON.stringify(ssot, null, 2) + "\n");
    execFileSync("node", ["werkzeug/acc45-backlog.mjs", "status-schreiben"], { cwd: WURZEL, stdio: "ignore" });
    execFileSync("node", ["werkzeug/acc45-backlog.mjs", "pruefen"], { cwd: WURZEL, stdio: "ignore" });
    console.log(`Nachweise ergänzt: ${belegErgaenzt} Paket(e) mit verifizierter PR-Nummer. Statuswechsel auf REVIEW: ${statusAufReview}.`);
  } catch (e) {
    writeFileSync(quelle, alt);
    console.log("Prüfung fehlgeschlagen, zurückgerollt:", String(e.message || e).split("\n")[0]);
    process.exitCode = 1;
  } finally { lockFreigeben(); }
}

const istHaupt = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (istHaupt) main();
