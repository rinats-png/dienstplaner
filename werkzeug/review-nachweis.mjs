/* ==========================================================================
   REVIEW-NACHWEIS je Merge und G2-Sammelbelegliste mit Hash (RST-3, P2-47 B3)

   Zwei Handgriffe, kein neues Framework; die Lesart bleibt in release-pruefung.mjs
   (urteilPositiv, reviewNachweiseLesen). Gate G2 selbst bleibt unverändert.

   1) zeile: Tabellenzeile für REVIEW-NACHWEIS-<Datum>.md in Positivform.
      Nur mit Reviewbericht: Berichtsdatei muss vorhanden sein und den PR nennen;
      ihr SHA-256 steht in der Zeile. Urteil nicht in Positivform -> keine Zeile.
   2) sammelliste: unveränderliche Liste der PRs mit tatsächlichem Beleg
      (letzte Aussage je PR positiv, wie G2 sie liest), mit SHA-256 über die
      sortierten Belegzeilen. Sie ersetzt KEINE fehlenden materiellen Sicherheits-
      oder Review-Nachweise: PRs ohne Beleg stehen als „ohne Beleg“ darin.
      Der Tabellenkopf ist absichtlich nicht „PR | … Urteil“ und der Dateiname nicht
      REVIEW-NACHWEIS*, damit G2 die Sammelliste nicht als Beleg liest.

   Aufruf:
     node werkzeug/review-nachweis.mjs zeile --pr N --modell M --urteil U --bericht DATEI [--datei REVIEW-NACHWEIS-JJJJ-MM-TT.md]
     node werkzeug/review-nachweis.mjs sammelliste --prs "#1,#2" [--ausgabe DATEI]
     node werkzeug/review-nachweis.mjs pruefen DATEI
   Exit: 0 ok · 1 abgelehnt/fehlerhaft · 2 Aufruf
   ========================================================================== */
import { readFileSync, writeFileSync, existsSync, readdirSync, appendFileSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { urteilPositiv, reviewNachweiseLesen, PR_MUSTER } from "./release-pruefung.mjs";

const WURZEL = join(dirname(fileURLToPath(import.meta.url)), "..");
export const KOPF = "| PR | Review-Modell | Urteil | Bericht (SHA-256) | Stand |\n|---|---|---|---|---|\n";
export const SAMMEL_KOPF = "| Nummer | Beleg |\n|---|---|\n";
const sha = (t) => createHash("sha256").update(t).digest("hex");
const zelle = (s) => String(s).replace(/\r?\n/g, " ").replace(/\|/g, "\\|").trim();

/** Zeile in Positivform; wirft, wenn Bericht fehlt, den PR nicht nennt oder das Urteil keine Positivform hat. */
export function zeileErzeugen({ pr, modell, urteil, berichtText, stand = "gemergt" }) {
  const nr = /^#?([1-9]\d*)$/.exec(String(pr).trim());
  if (!nr) throw new Error("PR-Nummer ungültig");
  if (typeof berichtText !== "string" || !berichtText.trim()) throw new Error("kein Beleg ohne Reviewbericht");
  if (!new RegExp(`#${nr[1]}(?!\\d)`).test(berichtText)) throw new Error(`Reviewbericht nennt #${nr[1]} nicht`);
  if (!String(modell ?? "").trim()) throw new Error("Review-Modell fehlt");
  if (!urteilPositiv(urteil)) throw new Error("Urteil nicht in Positivform: kein Beleg");
  return `| #${nr[1]} | ${zelle(modell)} | ${zelle(urteil)} | ${sha(berichtText)} | ${zelle(stand)} |`;
}

/** Je PR [Nummer, Beleg oder null], sortiert nach Nummer. */
export function sammelEintraege(prs, texte) {
  const belegt = reviewNachweiseLesen(texte);
  const nummern = [...new Set(prs.map((p) => {
    if (!PR_MUSTER.test(String(p))) throw new Error(`PR-Verweis ungültig: ${p}`);
    return Number(String(p).slice(1));
  }))].sort((a, b) => a - b);
  return nummern.map((n) => [n, belegt.get(n) ?? null]);
}

export const hashVon = (eintraege) => sha(eintraege.map(([n, b]) => `#${n}\t${b ?? "ohne Beleg"}`).join("\n"));

export function sammellisteErzeugen(prs, texte, stand) {
  const e = sammelEintraege(prs, texte);
  const mit = e.filter(([, b]) => b).length;
  const zeilen = e.map(([n, b]) => `| #${n} | ${b ? zelle(b) : "ohne Beleg"} |`).join("\n");
  return `# G2-Sammelbelegliste (unveränderlich)\n\nStand: ${stand}. PRs: ${e.length}, mit Beleg: ${mit}, ohne Beleg: ${e.length - mit}.\n`
    + `Diese Liste ersetzt keine fehlenden materiellen Sicherheits- oder Review-Nachweise und wird von G2 nicht als Beleg gelesen.\n\n`
    + `${SAMMEL_KOPF}${zeilen}\n\nSHA-256: ${hashVon(e)}\n`;
}

/** Liest eine Sammelliste zurück und prüft den Hash über ihre Zeilen. */
export function sammellistePruefen(text) {
  const m = /^SHA-256: ([0-9a-f]{64})\s*$/m.exec(text);
  if (!m) return { ok: false, grund: "Hash fehlt" };
  const e = [];
  for (const z of text.split(/\r?\n/)) {
    const c = /^\| #(\d+) \| (.*) \|$/.exec(z);
    if (c) e.push([Number(c[1]), c[2] === "ohne Beleg" ? null : c[2].replace(/\\\|/g, "|")]);
  }
  if (!e.length) return { ok: false, grund: "keine Zeilen" };
  return hashVon(e) === m[1] ? { ok: true, anzahl: e.length } : { ok: false, grund: "Hash stimmt nicht" };
}

function texteLesen(wurzel) {
  const dir = join(wurzel, "docs", "acc45");
  return readdirSync(dir).filter((f) => f.startsWith("REVIEW-NACHWEIS") && f.endsWith(".md"))
    .map((f) => ({ datei: f, text: readFileSync(join(dir, f), "utf8") }));
}
const wert = (a, n) => { const i = a.indexOf(n); return i >= 0 && a[i + 1] && !a[i + 1].startsWith("--") ? a[i + 1] : null; };

export function main(argv, wurzel = WURZEL, ausgabe = console.log) {
  const [befehl, ...a] = argv;
  try {
    if (befehl === "zeile") {
      const bericht = wert(a, "--bericht");
      if (!bericht || !existsSync(bericht)) throw new Error("kein Beleg ohne Reviewbericht (--bericht Datei fehlt oder nicht vorhanden)");
      const z = zeileErzeugen({ pr: wert(a, "--pr"), modell: wert(a, "--modell"), urteil: wert(a, "--urteil"), berichtText: readFileSync(bericht, "utf8") });
      const datei = wert(a, "--datei");
      if (datei) {
        if (!/^REVIEW-NACHWEIS-[\w.-]+\.md$/.test(basename(datei))) throw new Error("Dateiname muss REVIEW-NACHWEIS-*.md sein");
        if (!existsSync(datei)) writeFileSync(datei, `# Review-Nachweis je Merge\n\n${KOPF}`);
        appendFileSync(datei, `${z}\n`);
      } else ausgabe(z);
      return 0;
    }
    if (befehl === "sammelliste") {
      const prs = (wert(a, "--prs") || "").split(",").map((s) => s.trim()).filter(Boolean);
      if (!prs.length) { ausgabe("--prs fehlt"); return 2; }
      const text = sammellisteErzeugen(prs, texteLesen(wurzel), new Date().toISOString().slice(0, 10));
      const aus = wert(a, "--ausgabe");
      if (aus) {
        if (existsSync(aus)) throw new Error("Sammelliste ist unveränderlich: Datei existiert schon");
        writeFileSync(aus, text);
      } else ausgabe(text);
      return 0;
    }
    if (befehl === "pruefen" && a[0]) {
      const r = sammellistePruefen(readFileSync(a[0], "utf8"));
      ausgabe(r.ok ? `ok (${r.anzahl} Zeilen)` : `ABGELEHNT: ${r.grund}`);
      return r.ok ? 0 : 1;
    }
    ausgabe("Aufruf: zeile | sammelliste | pruefen (siehe Kopfkommentar)");
    return 2;
  } catch (f) { ausgabe(`ABGELEHNT: ${f.message}`); return 1; }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exit(main(process.argv.slice(2)));
