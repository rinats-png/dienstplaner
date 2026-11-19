/* ==========================================================================
   GH-REST — PR-Abfragen ohne GraphQL.

   In Cloud-Sitzungen ist GitHub GraphQL gesperrt (HTTP 403), `gh pr list` und
   `gh pr view` scheitern dort. Dieses Modul liefert dieselben Felder über die
   REST-Schnittstelle (`gh api`), damit der SSOT-Abgleich überall läuft.
   ========================================================================== */
import { execFileSync } from "node:child_process";

function api(pfad, wurzel, extra = []) {
  return execFileSync("gh", ["api", ...extra, pfad], { cwd: wurzel, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
}

/** Wie `gh pr list --state merged --base B --json number,title,headRefName`. */
export function gemergteListe(basis, wurzel) {
  const text = api(`repos/{owner}/{repo}/pulls?state=closed&base=${encodeURIComponent(basis)}&per_page=100`,
    wurzel, ["--paginate", "--slurp"]);
  return JSON.parse(text).flat()
    .filter((p) => p.merged_at)
    .map((p) => ({ number: p.number, title: p.title, headRefName: p.head.ref }));
}

/** Wie `gh pr view N --json number,title,headRefName,baseRefName,mergedAt,state,mergeCommit`. */
export function prAnsicht(nummer, wurzel) {
  const p = JSON.parse(api(`repos/{owner}/{repo}/pulls/${Number(nummer)}`, wurzel));
  return {
    number: p.number, title: p.title, headRefName: p.head.ref, baseRefName: p.base.ref,
    mergedAt: p.merged_at, state: p.merged_at ? "MERGED" : p.state === "open" ? "OPEN" : "CLOSED",
    mergeCommit: p.merge_commit_sha ? { oid: p.merge_commit_sha } : null,
  };
}
