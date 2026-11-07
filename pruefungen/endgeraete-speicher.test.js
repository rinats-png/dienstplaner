/* ==========================================================================
   ENDGERÄTESPEICHER — Inventur (T-10)

   Jeder Speicherschlüssel, den der Code in src/ und public/ ablegt, muss in
   docs/legal/ENDGERAETE-SPEICHER.md stehen. Ein neuer Schlüssel ohne Eintrag
   macht den Test rot. Gesucht wird in Textform (Zeichenketten, die mit
   „centric:", „centric." oder „centric-" beginnen) in Dateien, die
   Browserspeicher benutzen; Kommentare zählen nicht.
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = fileURLToPath(new URL("..", import.meta.url));
const inventur = readFileSync(join(WURZEL, "docs/legal/ENDGERAETE-SPEICHER.md"), "utf8");

function dateien(dir) {
  const aus = [];
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) aus.push(...dateien(p));
    else if (/\.(js|jsx|mjs|html)$/.test(n) && !/\.test\./.test(n)) aus.push(p);
  }
  return aus;
}
const ohneKommentare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const SPEICHER_API = /\b(localStorage|sessionStorage|indexedDB|document\.cookie)\b|\bcaches\.(open|keys|delete)\b/;

const quellen = [...dateien(join(WURZEL, "src")), ...dateien(join(WURZEL, "public"))]
  .map((p) => ({ pfad: relative(WURZEL, p).replace(/\\/g, "/"), text: ohneKommentare(readFileSync(p, "utf8")) }));
const nutzer = quellen.filter((q) => SPEICHER_API.test(q.text));

/** Schlüsselkandidaten: Zeichenketten „centric…" ohne Dateinamen-Endung, bis zum ersten ${ . */
function schluessel(text) {
  const aus = new Set();
  for (const m of text.matchAll(/["'`](centric[:.-][^"'`\n]*)["'`]/g)) {
    const roh = m[1];
    if (/\.(json|txt|svg|png|de)\b/.test(roh)) continue;
    aus.add(roh.split("${")[0]);
  }
  return [...aus];
}

describe("Speicherinventur (docs/legal/ENDGERAETE-SPEICHER.md)", () => {
  it("die Inventur ist vorhanden und trägt den Entwurfshinweis", () => {
    expect(inventur).toContain("ENTWURF");
  });

  it("jede Datei, die Browserspeicher benutzt, steht in der Dateiliste der Inventur", () => {
    const liste = inventur.slice(inventur.indexOf("## Dateien"));
    expect(nutzer.length).toBeGreaterThan(0);
    for (const q of nutzer) expect(liste, q.pfad).toContain(`\`${q.pfad}\``);
  });

  it("jeder im Code vorkommende Schlüssel steht in der Inventur", () => {
    const gefunden = nutzer.flatMap((q) => schluessel(q.text).map((k) => ({ k, pfad: q.pfad })));
    expect(gefunden.length).toBeGreaterThanOrEqual(7);
    for (const { k, pfad } of gefunden) expect(inventur, `${k} (${pfad})`).toContain(`\`${k}\``);
  });

  it("die bekannten Schlüssel werden vom Prüfer wirklich gefunden (die Suche ist nicht leer gelaufen)", () => {
    const alle = new Set(nutzer.flatMap((q) => schluessel(q.text)));
    for (const k of ["centric:token", "centric:gemerkt", "centric.thema", "centric-stempel",
      "centric:stempelpuffer:", "centric-schale-", "centric-daten-"]) expect(alle.has(k), k).toBe(true);
  });

  it("das Cookie des Servers steht in der Inventur", () => {
    const q = readFileSync(join(WURZEL, "server/funktionen/anmeldung.mjs"), "utf8");
    const name = /export const COOKIE = "([^"]+)"/.exec(q)[1];
    expect(inventur).toContain(`\`${name}\``);
  });

  it("die Inventur nennt die Rohkoordinate im Stempelpuffer", () => {
    expect(inventur).toMatch(/Rohkoordinate/);
    expect(inventur).toContain("koord");
  });
});
