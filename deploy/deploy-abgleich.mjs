/* ==========================================================================
   deploy-abgleich.mjs — sind die Daten nach dem Wechsel noch dieselben? (WP-31)

     node deploy-abgleich.mjs <sicherungsordner> <datenverzeichnis>

   deploy.sh sichert die Ablage, NACHDEM der alte Container angehalten ist,
   startet den neuen und ruft danach dieses Skript (im neuen Bild, ohne Netz,
   beides schreibgeschützt eingehängt). Jede Datei aus MANIFEST.json muss im
   Datenverzeichnis unverändert vorliegen (Größe und SHA-256).

   Ausgenommen sind die Stores, die der Dienst von selbst beschreibt, ohne
   dass jemand etwas tut: centric-spur (Protokoll) und centric-takt (Bremse).
   Überzählige Dateien sind kein Fehler — die Sicherung lässt einige Präfixe
   bewusst weg (Einmal-Token u. a.), und der neue Dienst darf Neues anlegen.
   Ebenso ausgenommen: aufraeumen:* (Vermerk des Löschlaufs, SELBST unten).
   Es geht um eines: Nichts, was vor dem Wechsel da war, ist verändert oder
   verschwunden.

   Ausgabe: eine JSON-Zeile auf stdout. Exit 0 nur ohne Abweichung.
   ========================================================================== */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

const AUSGENOMMEN = new Set(["centric-spur", "centric-takt"]);
/* Schlüssel im Store centric, die der Dienst selbst fortschreibt: der Vermerk
   des täglichen Löschlaufs (eine Minute nach dem Start). */
const SELBST = ["aufraeumen%3A"];

const [sicherung, daten] = process.argv.slice(2);
if (!sicherung || !daten) {
  console.error("Aufruf: node deploy-abgleich.mjs <sicherungsordner> <datenverzeichnis>");
  process.exit(2);
}

const manifest = JSON.parse(await readFile(path.join(sicherung, "MANIFEST.json"), "utf8"));
const sha256 = (b) => createHash("sha256").update(b).digest("hex");

let gleich = 0, abweichend = 0, fehlend = 0, ausgelassen = 0;
for (const d of manifest.dateien || []) {
  const store = String(d.pfad).split("/")[0];
  const datei = String(d.pfad).slice(store.length + 1);
  if (AUSGENOMMEN.has(store) || (store === "centric" && SELBST.some((v) => datei.startsWith(v)))) {
    ausgelassen++; continue;
  }
  let inhalt;
  try { inhalt = await readFile(path.join(daten, d.pfad)); }
  catch { fehlend++; console.error(`fehlend: ${d.pfad}`); continue; }
  if (inhalt.length === d.bytes && sha256(inhalt) === d.sha256) gleich++;
  else { abweichend++; console.error(`abweichend: ${d.pfad}`); }
}

const ergebnis = { gleich, abweichend, fehlend, ausgelassen, ok: abweichend === 0 && fehlend === 0 && gleich > 0 };
console.log(JSON.stringify(ergebnis));
process.exitCode = ergebnis.ok ? 0 : 1;
