/* Quelltext der Anwendungsoberfläche für Prüfungen, die den Text durchsuchen.
   WP-39 hat Teile von src/App.jsx in src/lib, src/ui und src/ansichten ausgelagert (Text unverändert).
   Die Prüfungen suchen weiterhin in „der Oberfläche“: die ausgelagerten Dateien und App.jsx zusammen,
   in der ursprünglichen Reihenfolge (Fachlogik, Bausteine, App.jsx, Ansichten), damit Ausschnitte
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

export function appQuelle() {
  const teile = [...ordner("lib"), ...ordner("ui"), lies(new URL("App.jsx", SRC)), ...ordner("ansichten")];
  return teile.join("\n").replace(/^export /gm, "");
}
