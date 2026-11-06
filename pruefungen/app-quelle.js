/* Quelltext der Anwendungsoberfläche für Prüfungen, die den Text durchsuchen.
   WP-39 hat Teile von src/App.jsx in src/ansichten, src/ui und src/lib ausgelagert (Text unverändert).
   Die Prüfungen suchen weiterhin in „der Oberfläche“: App.jsx und den ausgelagerten Dateien zusammen.
   Das vorangestellte `export ` entfällt, damit Muster wie /^function Name\(/ weiter greifen. */
import { readFileSync, readdirSync } from "node:fs";


const SRC = new URL("../src/", import.meta.url);
const lies = (p) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");

export function appQuelle() {
  const teile = [lies(new URL("App.jsx", SRC))];
  for (const ordner of ["ansichten", "ui", "lib"]) {
    let dateien = [];
    try { dateien = readdirSync(new URL(ordner + "/", SRC)).filter((f) => /\.(jsx|js)$/.test(f)).sort(); } catch { /* Ordner fehlt */ }
    for (const f of dateien) teile.push(lies(new URL(`${ordner}/${f}`, SRC)));
  }
  return teile.join("\n").replace(/^export /gm, "");
}

