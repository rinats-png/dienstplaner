/* Quelltext der Anwendungsoberfläche für Prüfungen, die den Text durchsuchen.
   WP-39 hat Teile von src/App.jsx in src/lib, src/ui und src/ansichten ausgelagert (Text unverändert).
   Die Prüfungen suchen weiterhin in „der Oberfläche“: die ausgelagerten Dateien und App.jsx zusammen,
   in der ursprünglichen Reihenfolge (Fachlogik, Bausteine, App-Verdrahtung src/app, App.jsx, Ansichten), damit Ausschnitte
   „von Marke A bis Marke B“ ihre Richtung behalten. Das vorangestellte `export ` entfällt, damit
   Muster wie /^function Name\(/ weiter greifen. */
import { readFileSync, readdirSync } from "node:fs";

const SRC = new URL("../src/", import.meta.url);
const lies = (p) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const ordner = (name) => {
  let dateien = [];
  try { dateien = readdirSync(new URL(name + "/", SRC)).filter((f) => /\.(jsx|js)$/.test(f)).sort(); } catch { /* Ordner fehlt */ }
  return dateien.map((f) => lies(new URL(`${name}/${f}`, SRC)));
};

/* WP-I12: Die Planrechnung steht im Rechenkern (server/lib/engine/); sie gehört weiter zu „der Oberfläche“,
   gegen die diese Prüfungen den Quelltext lesen. Sie steht vor der Fachlogik (dort standen die Funktionen; Ausschnitte „von Marke A bis Marke B“
   behalten so ihre Richtung). */
const ENGINE = new URL("../server/lib/engine/", import.meta.url);
const KERN = ["zeit", "textformat", "abwesenheitsarten", "plan", "befunde", "kennzahlen"];
const kern = () => KERN.map((n) => lies(new URL(`${n}.mjs`, ENGINE)));

export function appQuelle() {
  const lib = ordner("lib");   // alphabetisch; fachlogik.js ist die Datei, aus der die Planrechnung stammt
  const fi = readdirSync(new URL("lib/", SRC)).filter((f) => /.(jsx|js)$/.test(f)).sort().indexOf("fachlogik.js");
  const teile = [...lib.slice(0, fi), ...kern(), ...lib.slice(fi), ...ordner("ui"), ...ordner("app"), ...ordner("app/aktionen"), lies(new URL("App.jsx", SRC)), ...ordner("ansichten")];
  return teile.join("\n").replace(/^export /gm, "");
}
