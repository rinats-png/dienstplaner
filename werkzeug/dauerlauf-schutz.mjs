/* ==========================================================================
   DAUERLAUF-SCHUTZ — technische Hürde gegen direkte Pushes eines Workers (NICHT aktiviert).

   Ein Worker arbeitet in einer EIGENEN Arbeitskopie. Diese wird hier lokal (nur in dieser Kopie,
   nie global, keine settings.json) so eingerichtet:
     1. remote.<name>.pushurl = ungueltig://…  -> `git push origin …` scheitert schon an der URL.
     2. core.hooksPath auf ein eigenes Hook-Verzeichnis mit pre-push-Hook: lässt einen Push nur
        durch, wenn die Umgebungsvariable CENTRIC_PUSH_MARKE einer Einmalmarke entspricht, die
        `koordination.mjs push` unmittelbar vor dem Push in die Git-Verwaltung schreibt und danach
        löscht. Der Hook verbraucht die Marke. Das gilt auch für Pushes direkt an eine URL.
     3. credential.helper wird in der Kopie geleert; nur der Wrapper setzt den gespeicherten Helfer
        (centric.credentialhelper) per `-c` für seinen Push. In der Worker-Umgebung gilt
        GIT_TERMINAL_PROMPT=0 und GCM_INTERACTIVE=never (keine Anmeldeabfrage).
     4. centric.pushurl hält die echte Push-Adresse für den Wrapper.

   Was der Schutz NICHT leistet (ehrlich): Ein Worker mit freier Shell kann core.hooksPath zurücksetzen,
   `--no-verify` verwenden, die Marke selbst schreiben, centric.pushurl lesen oder einen gh-Token für
   HTTPS nutzen. Das ist eine Hürde gegen versehentliche oder vom Modell "vergessene" Direkt-Pushes,
   keine Sicherheitsgrenze. Wirksam bleiben: Fencing (Epoche), PR-Pflicht, Review, CI, Branch-Schutz,
   sowie die Berechtigungs-Allowlist (Vorschlag: docs/acc45/AUTONOMIE-ALLOWLIST-VORSCHLAG.json).
   ========================================================================== */
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gitPfad } from "./dauerlauf-prozess.mjs";

export const UNGUELTIGE_PUSHURL = "ungueltig://push-nur-ueber-koordination-mjs";
export const HOOK_KENNUNG = "CENTRIC-WORKER-PUSHSCHUTZ v1";

export const PRE_PUSH_HOOK = `#!/bin/sh
# ${HOOK_KENNUNG}: Pushes nur ueber node werkzeug/koordination.mjs push (Einmalmarke).
f="$(git rev-parse --git-path centric-push-marke)"
if [ -n "$CENTRIC_PUSH_MARKE" ] && [ -f "$f" ] && [ "$(cat "$f")" = "$CENTRIC_PUSH_MARKE" ]; then
  rm -f "$f"
  exit 0
fi
echo "ABGELEHNT: direkter git push im Worker-Kontext. Nur: node werkzeug/koordination.mjs push --halter H --epoche N --ziel refs/heads/X" >&2
exit 1
`;

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
/* git mit absolutem Pfad (PATH des Supervisors, nie das Verzeichnis der Worker-Kopie) und Arbeitsverzeichnis des
   Supervisors; die Kopie wird nur über -C angesprochen (eine dort abgelegte git.exe wird so nie gestartet). */
const git = (kopie, args) => execFileSync(gitPfad(), ["-C", kopie, ...args], { cwd: WURZEL, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const gitOpt = (kopie, args) => { try { return git(kopie, args); } catch { return ""; } };
const norm = (p) => { let r = path.resolve(p); try { r = realpathSync.native(r); } catch { /* bleibt */ } return process.platform === "win32" ? r.toLowerCase() : r; };
const hookDir = (kopie) => path.join(git(kopie, ["rev-parse", "--absolute-git-dir"]), "centric-hooks");

/** Grund, warum ein Pfad NICHT als Worker-Kopie taugt, sonst null. Schreibt nichts.
    Zulässig ist nur die Wurzel eines eigenständigen Klons: kein `git worktree` (geteiltes Git-Verzeichnis; jede
    `git config` landete in der gemeinsamen Konfiguration des Haupt-Repos), nicht das Haupt-Repo selbst. */
export function kopieGrund(kopie, { hauptWurzel = WURZEL } = {}) {
  if (typeof kopie !== "string" || !kopie.trim()) return "kein Pfad zur Worker-Kopie angegeben";
  if (!existsSync(kopie)) return "Worker-Kopie fehlt";
  let oben, gitDir, gemeinsam;
  try {
    oben = git(kopie, ["rev-parse", "--show-toplevel"]);
    gitDir = git(kopie, ["rev-parse", "--absolute-git-dir"]);
    gemeinsam = git(kopie, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  } catch { return "keine Git-Arbeitskopie"; }
  if (norm(oben) !== norm(kopie)) return "Pfad ist nicht die Wurzel einer Arbeitskopie";
  if (norm(gitDir) !== norm(gemeinsam)) return "geteiltes Git-Verzeichnis (git worktree): nur eigenständige Klone zulässig";
  let hauptGemeinsam = null;
  try { hauptGemeinsam = git(hauptWurzel, ["rev-parse", "--path-format=absolute", "--git-common-dir"]); } catch { /* kein Repo */ }
  if (hauptGemeinsam && norm(hauptGemeinsam) === norm(gemeinsam)) return "Worker-Kopie ist das Haupt-Repository (oder teilt dessen Git-Verzeichnis)";
  return null;
}

/** Richtet eine Worker-Arbeitskopie ein (nur lokale Konfiguration dieser Kopie). Lehnt ungeeignete Pfade ab, bevor
    irgendetwas geschrieben wird. */
export function richteWorkerKopieEin(kopie, { remoteName = "origin", hauptWurzel = WURZEL } = {}) {
  const grund = kopieGrund(kopie, { hauptWurzel });
  if (grund) return { ok: false, maengel: [grund] };
  const dir = hookDir(kopie);
  mkdirSync(dir, { recursive: true });
  const hook = path.join(dir, "pre-push");
  writeFileSync(hook, PRE_PUSH_HOOK);
  try { chmodSync(hook, 0o755); } catch { /* Windows: Git-sh führt aus */ }
  const echt = gitOpt(kopie, ["config", "--get", `remote.${remoteName}.url`]);
  if (!echt) throw new Error(`Remote ${remoteName} fehlt in der Worker-Kopie`);
  const helfer = gitOpt(kopie, ["config", "--get-all", "credential.helper"]).split(/\r?\n/).filter(Boolean).at(-1) || "";
  git(kopie, ["config", "--local", "core.hooksPath", dir]);
  git(kopie, ["config", "--local", `remote.${remoteName}.pushurl`, UNGUELTIGE_PUSHURL]);
  git(kopie, ["config", "--local", "centric.pushurl", echt]);
  if (helfer) git(kopie, ["config", "--local", "centric.credentialhelper", helfer]);
  git(kopie, ["config", "--local", "credential.helper", ""]);
  return pruefeWorkerKopie(kopie, { remoteName, hauptWurzel });
}

/** Prüft, ob die Schutzeinrichtung vollständig ist. { ok, maengel } — ohne ok startet der Supervisor keinen Worker. */
export function pruefeWorkerKopie(kopie, { remoteName = "origin", hauptWurzel = WURZEL } = {}) {
  const maengel = [];
  const grund = kopieGrund(kopie, { hauptWurzel });
  if (grund) return { ok: false, maengel: [grund] };
  let dir;
  try { dir = hookDir(kopie); } catch { return { ok: false, maengel: ["keine Git-Arbeitskopie"] }; }
  const hp = gitOpt(kopie, ["config", "--get", "core.hooksPath"]);
  if (!hp || norm(path.resolve(kopie, hp)) !== norm(dir)) maengel.push("core.hooksPath zeigt nicht auf den Schutz-Hook");
  const hook = path.join(dir, "pre-push");
  if (!existsSync(hook) || !readFileSync(hook, "utf8").includes(HOOK_KENNUNG)) maengel.push("pre-push-Hook fehlt oder ist verändert");
  if (gitOpt(kopie, ["config", "--get", `remote.${remoteName}.pushurl`]) !== UNGUELTIGE_PUSHURL) maengel.push("pushurl ist nicht gesperrt");
  if (!gitOpt(kopie, ["config", "--get", "centric.pushurl"])) maengel.push("centric.pushurl fehlt (Wrapper-Ziel)");
  return { ok: maengel.length === 0, maengel };
}

/** Umgebung eines Workers: Fencing-Daten, keine Anmeldeabfragen, keine Push-Marke, kein Supervisor-Schalter. */
export function workerUmgebung(basis, { paketId, halter, epoche }) {
  const env = { ...basis };
  delete env.CENTRIC_PUSH_MARKE;
  delete env.CENTRIC_AUTONOMIE;
  return { ...env, CENTRIC_DAUERLAUF_PAKET: paketId, CENTRIC_KOORD_HALTER: halter, CENTRIC_KOORD_EPOCHE: String(epoche), GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never" };
}
