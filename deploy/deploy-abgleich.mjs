/* ==========================================================================
   deploy-abgleich.mjs — sind die Daten nach dem Wechsel noch dieselben? (WP-31)

     node deploy-abgleich.mjs <sicherungsordner> <datenverzeichnis> [--start <ms>]

   deploy.sh sichert die Ablage, NACHDEM der alte Container angehalten ist,
   startet den neuen und ruft danach dieses Skript (im neuen Bild, ohne Netz,
   beides schreibgeschützt eingehängt). Jede Datei aus MANIFEST.json muss im
   Datenverzeichnis unverändert vorliegen (Größe und SHA-256).

   Nach dem Start darf sich etwas ändern (M2, Review WP-31): Caddy leitet
   schon vor „healthy“ Anfragen weiter, Nutzer schreiben, der Löschlauf
   läuft eine Minute nach dem Start. Mit --start <Zeitpunkt des Starts in ms>
   gilt deshalb:
     abweichend, Datei nach dem Start geändert (mtime ≥ start)  → nachStart
     fehlend, Verzeichnis nach dem Start geändert                → nachStart
     sonst abweichend/fehlend                                    → Fehler
   `nachStart` ist eine Warnung, kein Fehler. Ohne --start zählt jede
   Abweichung als Fehler.

   Ausgenommen sind die Stores, die der Dienst von selbst beschreibt:
   centric-spur (Protokoll), centric-takt (Bremse), und im Store centric
   aufraeumen:* (Vermerk des Löschlaufs). Überzählige Dateien sind kein
   Fehler — die Sicherung lässt einige Präfixe bewusst weg (Einmal-Token
   u. a.), und der neue Dienst darf Neues anlegen. Es geht um eines: Nichts,
   was vor dem Wechsel da war, ist ohne Grund verändert oder verschwunden.

   Ausgabe: eine JSON-Zeile auf stdout. Exit 0 nur ohne Fehler.
   ========================================================================== */
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const AUSGENOMMEN = new Set(["centric-spur", "centric-takt"]);
/* Schlüssel im Store centric, die der Dienst selbst fortschreibt: der Vermerk
   des täglichen Löschlaufs (eine Minute nach dem Start). */
const SELBST = ["aufraeumen%3A"];

const argumente = process.argv.slice(2);
let start = null;
const i = argumente.indexOf("--start");
if (i >= 0) {
  start = Number(argumente[i + 1]);
  argumente.splice(i, 2);
  if (!Number.isFinite(start) || start <= 0) {
    console.error("--start braucht einen Zeitpunkt in Millisekunden");
    process.exit(2);
  }
}
const [sicherung, daten] = argumente;
if (!sicherung || !daten) {
  console.error("Aufruf: node deploy-abgleich.mjs <sicherungsordner> <datenverzeichnis> [--start <ms>]");
  process.exit(2);
}

const manifest = JSON.parse(await readFile(path.join(sicherung, "MANIFEST.json"), "utf8"));
const sha256 = (b) => createHash("sha256").update(b).digest("hex");
const nachDemStart = async (p) => {
  if (start === null) return false;
  try { return (await stat(p)).mtimeMs >= start; } catch { return false; }
};

let gleich = 0, abweichend = 0, fehlend = 0, ausgelassen = 0, nachStart = 0;
for (const d of manifest.dateien || []) {
  const store = String(d.pfad).split("/")[0];
  const datei = String(d.pfad).slice(store.length + 1);
  if (AUSGENOMMEN.has(store) || (store === "centric" && SELBST.some((v) => datei.startsWith(v)))) {
    ausgelassen++; continue;
  }
  const ort = path.join(daten, d.pfad);
  let inhalt;
  try { inhalt = await readFile(ort); }
  catch {
    if (await nachDemStart(path.dirname(ort))) { nachStart++; console.error(`nach dem Start entfernt: ${d.pfad}`); }
    else { fehlend++; console.error(`fehlend: ${d.pfad}`); }
    continue;
  }
  if (inhalt.length === d.bytes && sha256(inhalt) === d.sha256) gleich++;
  else if (await nachDemStart(ort)) { nachStart++; console.error(`nach dem Start geändert: ${d.pfad}`); }
  else { abweichend++; console.error(`abweichend: ${d.pfad}`); }
}

const ok = abweichend === 0 && fehlend === 0 && gleich + nachStart > 0;
console.log(JSON.stringify({ gleich, abweichend, fehlend, nachStart, ausgelassen, ok }));
process.exitCode = ok ? 0 : 1;
