// Prozess-Wächter: billige, genaue Prüfungen gegen wiederkehrende Fehlerklassen der Entwicklungsorganisation
// (docs/acc45/DURCHSATZ-ANALYSE.md, Abschnitt 5). Kein Netz, keine Kindprozesse.
//
//  1. package.json: Schlüssel eindeutig, Sammelkette ohne Doppelte, jedes aufgerufene Skript existiert,
//     `sammelpruefung` ist das letzte Glied der Kette (Konflikte bei der Kettenvereinigung zeigen sich hier).
//  2. Zeilenenden von package.json, Workflow und work-packages.json: einheitlich (nur LF oder nur CRLF), kein BOM.
//  3. Neue Test-Dateien: keine Uhr ohne feste Uhr (Date.now()/new Date() ohne Fake-Timer) und keine
//     Kurzliteral-Ausschlüsse (`not.toContain("ab")` gegen Zufalls-IDs) ohne ausdrückliche Begründung.
//     Bestand vor 2026-11-13 steht in pruefungen/prozess-wachen-bestand.json (eingefroren, nicht erweitern).
//     Neue Dateien: Begründung im Quelltext mit `// zeit-ok: <Grund>` bzw. `// kollision-ok: <Grund>` (je Zeile/Datei).
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const wurzel = resolve(fileURLToPath(new URL("..", import.meta.url)));
const lesen = (rel) => readFileSync(join(wurzel, rel), "utf8");

/** Schlüssel der Ebene `scripts` in Dokumentreihenfolge (JSON.parse würde Doppelte stillschweigend schlucken). */
export function skriptSchluessel(text) {
  const norm = text.replace(/\r\n/g, "\n");
  const i = norm.indexOf('"scripts"');
  const j = norm.indexOf("{", i);
  const ende = norm.indexOf("\n  }", j);
  return [...norm.slice(j, ende).matchAll(/^ {4}"([^"]+)":/gm)].map((m) => m[1]);
}

export function zeilenendenArt(text) {
  const crlf = (text.match(/\r\n/g) || []).length;
  const lf = (text.match(/\n/g) || []).length - crlf;
  const einzel = (text.match(/\r(?!\n)/g) || []).length;
  return { crlf, lf, einzel, gemischt: einzel > 0 || (crlf > 0 && lf > 0) };
}

/** Findet Uhr-Abhängigkeit ohne feste Uhr (Dateiebene; Begründung per `zeit-ok:`). */
export function uhrBefund(text) {
  if (/zeit-ok:/.test(text)) return false;
  if (/useFakeTimers|setSystemTime|stubGlobal\(\s*["']Date/.test(text)) return false;
  return /Date\.now\(\)|new Date\(\)/.test(text);
}

/** Kurzliteral-Ausschlüsse (höchstens 3 Zeichen) ohne `kollision-ok:` in derselben Zeile. */
export function kurzliteralBefunde(text) {
  const r = [];
  text.split(/\r?\n/).forEach((z, i) => {
    if (/not\.toContain\(\s*(["'`])[^"'`]{1,3}\1\s*\)/.test(z) && !/kollision-ok:/.test(z)) r.push(i + 1);
  });
  return r;
}

describe("package.json: Sammelkette", () => {
  const text = lesen("package.json");
  const schluessel = skriptSchluessel(text);
  const skripte = JSON.parse(text).scripts;
  const kette = [...String(skripte.pruefung).matchAll(/npm run ([\w:.-]+)/g)].map((m) => m[1]);
  it("Skriptnamen sind eindeutig", () => {
    const doppelt = schluessel.filter((k, i) => schluessel.indexOf(k) !== i);
    expect(doppelt).toEqual([]);
    expect(schluessel.length).toBe(Object.keys(skripte).length);
  });
  it("die Kette hat keine doppelten Glieder", () => {
    expect(kette.filter((k, i) => kette.indexOf(k) !== i)).toEqual([]);
  });
  it("jedes Glied der Kette existiert als Skript", () => {
    expect(kette.filter((k) => !(k in skripte))).toEqual([]);
  });
  it("sammelpruefung ist das letzte Glied", () => {
    expect(kette.at(-1)).toBe("pruefung:sammelpruefung");
  });
  it("die Kette endet mit dem Sammelprüfungs-Skript ohne Folgebefehl", () => {
    expect(String(skripte.pruefung).trimEnd().endsWith("npm run pruefung:sammelpruefung")).toBe(true);
  });
});

describe("Zeilenenden", () => {
  it.each(["package.json", ".github/workflows/pruefung.yml", "docs/acc45/work-packages.json"])("%s: einheitlich, ohne BOM", (rel) => {
    const t = lesen(rel);
    expect(t.charCodeAt(0)).not.toBe(0xfeff);
    const a = zeilenendenArt(t);
    expect(a.gemischt, `${rel}: ${JSON.stringify(a)}`).toBe(false);
  });
  it("Hilfsfunktion erkennt gemischte Zeilenenden", () => {
    expect(zeilenendenArt("a\nb\n").gemischt).toBe(false);
    expect(zeilenendenArt("a\r\nb\r\n").gemischt).toBe(false);
    expect(zeilenendenArt("a\r\nb\n").gemischt).toBe(true);
    expect(zeilenendenArt("a\rb").gemischt).toBe(true);
  });
});

describe("Wächter-Hilfsfunktionen", () => {
  it("Uhrbefund", () => {
    expect(uhrBefund("const t = Date.now();")).toBe(true);
    expect(uhrBefund("vi.useFakeTimers(); Date.now()")).toBe(false);
    expect(uhrBefund("// zeit-ok: Zeitstempel nur als Datenwert\nnew Date()")).toBe(false);
    expect(uhrBefund("kein Zeitbezug")).toBe(false);
  });
  it("Kurzliteral-Befund", () => {
    expect(kurzliteralBefunde('expect(x).not.toContain("ab");')).toEqual([1]);
    expect(kurzliteralBefunde('expect(x).not.toContain("abcd");')).toEqual([]);
    expect(kurzliteralBefunde('expect(x).not.toContain("ab"); // kollision-ok: fester Wert')).toEqual([]);
  });
});

describe("neue Testdateien: Uhr und Zufallskollision", () => {
  const bestand = JSON.parse(lesen("pruefungen/prozess-wachen-bestand.json"));
  it("Bestandsliste trägt eine Begründung", () => {
    expect(String(bestand.grund).length).toBeGreaterThan(40);
  });
  const dateien = readdirSync(join(wurzel, "pruefungen")).filter((f) => f.endsWith(".test.js") && f !== "prozess-wachen.test.js");
  it("keine neue Testdatei mit freier Uhr", () => {
    const neu = dateien.filter((f) => !bestand.uhr.includes(f) && uhrBefund(lesen(`pruefungen/${f}`)));
    expect(neu, "Feste Uhr (vi.useFakeTimers/setSystemTime) nutzen oder `// zeit-ok: <Grund>` setzen. Siehe QS-2/QS-4.").toEqual([]);
  });
  it("keine neue Testdatei mit Kurzliteral-Ausschluss", () => {
    const neu = dateien.filter((f) => !bestand.kurzliteral.includes(f) && kurzliteralBefunde(lesen(`pruefungen/${f}`)).length);
    expect(neu, "Längeres, eindeutiges Literal wählen oder `// kollision-ok: <Grund>` in dieselbe Zeile. Siehe QS-5.").toEqual([]);
  });
});

describe("pruefung:schnell: Auswahl der Änderungen", () => {
  it("package.json, Lockfile, Workflow und docs lösen keine Testauswahl aus", async () => {
    const { geaenderteDateien } = await import("../werkzeug/pruefung-schnell.mjs");
    const l = geaenderteDateien("package.json\npackage-lock.json\n.github/workflows/pruefung.yml\ndocs/a.json\nserver/x.mjs\r\nsrc/App.jsx\nREADME.md\n", "pruefungen/neu.test.js\nserver/x.mjs\n");
    expect(l).toEqual(["server/x.mjs", "src/App.jsx", "pruefungen/neu.test.js"]);
  });
});
