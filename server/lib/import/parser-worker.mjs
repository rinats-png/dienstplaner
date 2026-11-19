/* IMP-2 — Kindskript des Parsers (läuft seit Review 561dd32, E-A, in einem eigenen Prozess, nicht mehr im Worker-Thread;
   der Dateiname bleibt für bestehende Prüfungen). Liest die Eingabe von stdin (4 Byte Kopflänge, Kopf-JSON { name, grenzen },
   Dateibytes), führt den Parser-Kern aus (einschließlich Textmengen- und Zeilenprüfung) und schreibt genau ein Ergebnis als JSON
   nach stdout. Keine Netzverbindung, kein Schreiben von Dateien. */
import { parseKern } from "./parser-kern.mjs";

const teile = [];
for await (const t of process.stdin) teile.push(t);
const ein = Buffer.concat(teile);
let ergebnis;
try {
  const kl = ein.readUInt32BE(0);
  const kopf = JSON.parse(ein.subarray(4, 4 + kl).toString("utf8"));
  ergebnis = parseKern({ buffer: ein.subarray(4 + kl), name: kopf.name, grenzen: kopf.grenzen });
} catch {
  ergebnis = { ok: false, code: "VERARBEITUNG_FEHLGESCHLAGEN", nachricht: "Die Datei konnte nicht verarbeitet werden." };
}
process.stdout.write(JSON.stringify(ergebnis));
