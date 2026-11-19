/* Misst die Abhängigkeitsschließung von Wurzelfunktionen in src/lib/fachlogik.js (WP-I12, Spez. S-07).
   Aufruf: node werkzeug/engine-schliessung.mjs [--datei=Pfad] pruefen personTag ...  — Ausgabe: Funktionen der Schließung.
   Vor der Extraktion (bda8b68) maß das Werkzeug 26 Definitionen / 654 Zeilen; die Fassung vor der Extraktion liefert
   `git show bda8b68:src/lib/fachlogik.js > Datei`, danach `--datei=Datei`. */
import { readFileSync } from "node:fs";
import * as acorn from "acorn";
import { analyze } from "eslint-scope";

const arg = process.argv.find((a) => a.startsWith("--datei="));
const quelle = readFileSync(arg ? arg.slice(8) : new URL("../src/lib/fachlogik.js", import.meta.url), "utf8");
const ast = acorn.parse(quelle, { ecmaVersion: "latest", sourceType: "module", ranges: true, locations: true });
const sc = analyze(ast, { ecmaVersion: 2022, sourceType: "module" });
const modul = sc.scopes.find((s) => s.type === "module");
const defs = new Map();   // Name -> { start, ende, zeilen, art }
for (const v of modul.variables) {
  const d = v.defs[0]; if (!d || d.type === "ImportBinding") continue;
  const top = d.node.type === "VariableDeclarator" ? d.parent : d.node;
  defs.set(v.name, { top, refs: new Set() });
}
for (const [name, e] of defs) {
  const node = e.top;
  for (const r of modul.through.concat(sc.scopes.flatMap((s) => s.references))) {
    if (!r.resolved || r.resolved.scope !== modul) continue;
    const pos = r.identifier.range[0];
    if (pos >= node.range[0] && pos < node.range[1] && r.resolved.name !== name) e.refs.add(r.resolved.name);
  }
}
const wurzeln = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const drin = new Set(); const stapel = [...wurzeln];
while (stapel.length) { const n = stapel.pop(); if (drin.has(n) || !defs.has(n)) continue; drin.add(n); for (const r of defs.get(n).refs) stapel.push(r); }
const zeilen = [...drin].map((n) => { const t = defs.get(n).top; return [n, t.loc.start.line, t.loc.end.line - t.loc.start.line + 1]; }).sort((a, b) => a[1] - b[1]);
console.log(JSON.stringify({ wurzeln, anzahl: drin.size, zeilen: zeilen.reduce((a, z) => a + z[2], 0), funktionen: zeilen.map((z) => `${z[0]}:${z[1]}+${z[2]}`) }, null, 1));
