/* ==========================================================================
   KOORDINATION — atomare Schreib-Lease für CENTRIC.

   Es gibt genau einen schreibenden Koordinator. Der Zustand liegt als
   Datei lease.json im Branch `koordination/lease` des Remotes. Jede Änderung
   ist ein neuer Commit auf der bisherigen Spitze und wird OHNE Force gepusht:
   Git lehnt den Push ab, wenn die Spitze inzwischen weitergewandert ist
   (Compare-and-Swap). Zwei gleichzeitige Übernahmen können deshalb nie beide
   gelingen. Der Verlierer liest neu und entscheidet erneut.

   Felder: epoche (zählt je Übernahme hoch), halter, uebernommen_am,
   erneuert_am, gueltig_bis, uebergabe (Begründung/Beleg der Übergabe),
   vorgaenger (Halter vor der Übernahme), freigegeben_am.

   Regeln:
   - Übernahme nur, wenn (a) keine Lease existiert, (b) sie freigegeben ist,
     (c) sie abgelaufen ist, oder (d) der Halter dieselbe Person ist (Erneuerung).
     Bei (a) und (c) ist eine ausdrückliche --uebergabe als Text Pflicht.
   - Eine gültige Lease eines anderen Halters wird NIE überschrieben. Er muss
     zuerst `freigeben` (kontrollierte Rückübergabe) oder ablaufen.
   - Gültigkeit begrenzt (Standard 90 Min, höchstens 240); wer schreibt,
     erneuert regelmäßig. Läuft sie ab, kann ein anderer übernehmen.
   - Schreibende Arbeit beginnt nur, wenn `pruefen` Exit 0 liefert.

   Aufruf:
     node werkzeug/koordination.mjs status
     node werkzeug/koordination.mjs uebernehmen --halter H --uebergabe "Text" [--minuten 90]
     node werkzeug/koordination.mjs erneuern   --halter H [--minuten 90]
     node werkzeug/koordination.mjs freigeben  --halter H
     node werkzeug/koordination.mjs pruefen    --halter H     (Exit 0 = darf schreiben)
   Umgebung: KOORD_REMOTE (Standard origin) für Prüfungen mit lokalem Remote.
   ========================================================================== */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REF = "refs/heads/koordination/lease";
const STANDARD_MIN = 90;
const MAX_MIN = 240;

/** Reine Entscheidung, ohne I/O. Gibt { ok, grund, neu } zurück. */
export function entscheide(lease, jetzt, a) {
  const t = jetzt.getTime();
  const min = Math.min(Math.max(Number(a.minuten) || STANDARD_MIN, 1), MAX_MIN);
  const gueltig = lease && !lease.freigegeben_am && Date.parse(lease.gueltig_bis) > t;
  const bis = new Date(t + min * 60000).toISOString();
  if (!a.halter) return { ok: false, grund: "Halter fehlt" };

  if (a.aktion === "freigeben") {
    if (!lease || lease.halter !== a.halter) return { ok: false, grund: "nur der Halter kann freigeben" };
    return { ok: true, grund: "freigegeben", neu: { ...lease, freigegeben_am: jetzt.toISOString(), gueltig_bis: jetzt.toISOString() } };
  }
  if (a.aktion === "pruefen") {
    return gueltig && lease.halter === a.halter
      ? { ok: true, grund: `Lease gültig bis ${lease.gueltig_bis}` }
      : { ok: false, grund: gueltig ? `Lease hält ${lease.halter} bis ${lease.gueltig_bis}` : "keine gültige Lease" };
  }
  if (a.aktion === "erneuern") {
    if (!gueltig || lease.halter !== a.halter) return { ok: false, grund: "Erneuern nur mit gültiger eigener Lease; erst übernehmen" };
    return { ok: true, grund: "erneuert", neu: { ...lease, erneuert_am: jetzt.toISOString(), gueltig_bis: bis } };
  }
  if (a.aktion === "uebernehmen") {
    if (gueltig && lease.halter === a.halter) return entscheide(lease, jetzt, { ...a, aktion: "erneuern" });
    if (gueltig) return { ok: false, grund: `${lease.halter} hält die Lease bis ${lease.gueltig_bis}; Rückübergabe durch Freigabe nötig` };
    if (!a.uebergabe || a.uebergabe.trim().length < 10) return { ok: false, grund: "ausdrückliche --uebergabe (Begründung/Beleg) fehlt" };
    return { ok: true, grund: "übernommen", neu: {
      epoche: (lease?.epoche || 0) + 1, halter: a.halter, uebernommen_am: jetzt.toISOString(),
      erneuert_am: jetzt.toISOString(), gueltig_bis: bis, uebergabe: a.uebergabe.trim(),
      vorgaenger: lease?.halter || null, freigegeben_am: null,
    } };
  }
  return { ok: false, grund: `unbekannte Aktion ${a.aktion}` };
}

function git(args, eingabe) {
  return execFileSync("git", args, { cwd: WURZEL, encoding: "utf8", input: eingabe, stdio: ["pipe", "pipe", "pipe"] }).trim();
}
const remote = () => process.env.KOORD_REMOTE || "origin";

/** Liest Spitze und Lease; null, wenn der Branch noch fehlt. */
export function lesen() {
  let spitze;
  try { spitze = git(["ls-remote", remote(), REF]).split(/\s+/)[0] || null; } catch (e) { throw new Error(`Remote nicht erreichbar: ${e.message.split("\n")[0]}`); }
  if (!spitze) return { spitze: null, lease: null };
  git(["fetch", "--quiet", remote(), `${REF}:refs/koordination/lokal`, "--force"]);
  return { spitze, lease: JSON.parse(git(["show", "refs/koordination/lokal:lease.json"])) };
}

/** Schreibt als neuer Commit auf die gelesene Spitze; Push ohne Force = atomar. */
export function schreiben(spitze, lease, nachricht) {
  const blob = git(["hash-object", "-w", "--stdin"], JSON.stringify(lease, null, 2) + "\n");
  const baum = git(["mktree"], `100644 blob ${blob}\tlease.json\n`);
  const args = ["-c", "user.name=koordination", "-c", "user.email=koordination@centric.invalid", "commit-tree", baum, "-m", nachricht];
  if (spitze) args.push("-p", spitze);
  const commit = git(args);
  git(["push", "--quiet", remote(), `${commit}:${REF}`]); // wirft bei Non-Fast-Forward
  return commit;
}

function arg(name) { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; }

function haupt() {
  const aktion = process.argv[2];
  const { spitze, lease } = lesen();
  if (aktion === "status") { console.log(JSON.stringify(lease || { halter: null }, null, 2)); return 0; }
  const e = entscheide(lease, new Date(), { aktion, halter: arg("--halter"), uebergabe: arg("--uebergabe"), minuten: arg("--minuten") });
  if (!e.ok) { console.error(`ABGELEHNT: ${e.grund}`); return 1; }
  if (e.neu) {
    try { schreiben(spitze, e.neu, `Lease ${aktion}: ${e.neu.halter} Epoche ${e.neu.epoche}`); }
    catch { console.error("ABGELEHNT: Lease wurde gleichzeitig geändert (CAS verloren). Neu lesen und erneut entscheiden."); return 2; }
  }
  console.log(`OK: ${e.grund}`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = haupt();
