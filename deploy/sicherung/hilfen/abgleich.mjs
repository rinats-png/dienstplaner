/* ==========================================================================
   Manifest-Abgleich nach einer Wiederherstellung (wiederherstellung-probe.sh)

     node abgleich.mjs <sicherungsordner> <datenziel>

   Läuft im Produktionsbild (node), braucht nur node:-Module. Vergleicht jede
   Datei aus MANIFEST.json mit der wiederhergestellten Datei per SHA-256 und
   zählt: gleich, abweichend, fehlend — dazu überzählige Dateien im Ziel, die
   das Manifest nicht kennt (Punktverzeichnisse ausgenommen).

   Ausgabe: eine JSON-Zeile auf stdout. Exit 0 nur, wenn alles gleich ist.
   ========================================================================== */
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const [sicherung, ziel] = process.argv.slice(2);
if (!sicherung || !ziel) {
  console.error("Aufruf: node abgleich.mjs <sicherungsordner> <datenziel>");
  process.exit(2);
}

const manifest = JSON.parse(await readFile(path.join(sicherung, "MANIFEST.json"), "utf8"));
const sha256 = (b) => createHash("sha256").update(b).digest("hex");

let gleich = 0, abweichend = 0, fehlend = 0;
const bekannt = new Set();
const raeume = new Set();
for (const d of manifest.dateien) {
  bekannt.add(d.pfad);
  const [store, datei] = d.pfad.split("/");
  if (store === "centric") {
    const schluessel = decodeURIComponent(datei.slice(0, -5));
    for (const p of ["kern:", "bestand:"])
      if (schluessel.startsWith(p)) raeume.add(schluessel.slice(p.length));
  }
  let inhalt;
  try { inhalt = await readFile(path.join(ziel, d.pfad)); }
  catch { fehlend++; console.error(`fehlend: ${d.pfad}`); continue; }
  if (inhalt.length === d.bytes && sha256(inhalt) === d.sha256) gleich++;
  else { abweichend++; console.error(`abweichend: ${d.pfad}`); }
}

let ueberzaehlig = 0;
for (const s of await readdir(ziel, { withFileTypes: true })) {
  if (s.name.startsWith(".")) continue;
  if (!s.isDirectory()) { ueberzaehlig++; continue; }
  for (const f of await readdir(path.join(ziel, s.name)))
    if (!bekannt.has(`${s.name}/${f}`)) { ueberzaehlig++; console.error(`überzählig: ${s.name}/${f}`); }
}

const erg = { manifest: manifest.dateien.length, gleich, abweichend, fehlend, ueberzaehlig,
  bestaende_erwartet: raeume.size, erstellt: manifest.erstellt };
console.log(JSON.stringify(erg));
process.exit(gleich === manifest.dateien.length && !abweichend && !fehlend && !ueberzaehlig ? 0 : 1);
