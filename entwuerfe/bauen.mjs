/* Setzt die Studie aus ihren Teilen zusammen. Getrennt geschrieben, weil
   eine Datei von 160 KB sich nicht mehr sinnvoll bearbeiten lässt. */
import { readFileSync, writeFileSync, statSync } from "node:fs";
const TEILE = ["teil-1-kopf.html", "teil-2-produkt.html", "teil-3-analyse.html",
  "teil-4-entwuerfe.html", "teil-5-bewertung.html",
  "teil-6-code.html", "teil-7-code.html", "teil-8-code.html"];
let out = TEILE.map((t) => readFileSync(t, "utf8")).join("\n\n");
/* Im JSON-Skriptblock darf kein </script> stehen. */
out = out.replace("__DATEN__", readFileSync("daten.json", "utf8").replace(/</g, "\\u003c"));
writeFileSync("planungsansichten.html", out);
console.log("planungsansichten.html:", (statSync("planungsansichten.html").size / 1024).toFixed(0), "KB");
