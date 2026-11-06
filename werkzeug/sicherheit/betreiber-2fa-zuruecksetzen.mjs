#!/usr/bin/env node
/* ==========================================================================
   BETREIBER-2FA ZURÜCKSETZEN (WP-32d) — Wiederherstellung ohne Netzweg

   Wann: Der Betreiber hat Authenticator und Wiederherstellungscodes verloren
   (oder eine begonnene Einrichtung abgebrochen, die unter Pflicht nicht
   überschrieben werden darf).

   Wer darf: nur, wer den Server selbst bedient (Zugriff auf den Datenordner)
   UND den Betreibercode kennt. Beides ist nötig; es gibt keine Hintertür-
   Vorgabe, kein festes Geheimnis und keinen Weg über das Netz.

   Aufruf (der Server ist vorher zu stoppen — die Ablage gehört immer nur
   einem Prozess; läuft er noch, bricht das Werkzeug ab):

     docker compose stop app
     printf '%s\n' 'BETREIBER-CODE' | \
       CENTRIC_DATEN=/pfad/zu/data CENTRIC_PFEFFER=... \
       node werkzeug/sicherheit/betreiber-2fa-zuruecksetzen.mjs --ja
     docker compose start app

   (Den Code per Pipe/Eingabe geben, nicht als Argument — Argumente stehen in
   der Prozessliste. Ohne Pipe fragt das Werkzeug nicht nach, sondern bricht ab.)

   Wirkung: alle Sitzungen dieses Codes enden; der alte zweite Faktor samt
   Wiederherstellungscodes wird gelöscht; sofort beginnt eine NEUE Einrichtung,
   deren Geheimnis hier einmal erscheint. Danach in der App (oder per
   /api/anmelden, zweifaktorAktion "bestaetigen") mit dem ersten Code
   bestätigen — erst dann gilt der Code wieder. Neue Wiederherstellungscodes
   erscheinen bei der Bestätigung.

   Ausgang: 0 = zurückgesetzt, 1 = Fehler/abgelehnt (nichts verändert, außer
   wenn die Meldung etwas anderes sagt).
   ========================================================================== */

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const imp = (p) => import(pathToFileURL(path.join(WURZEL, p)).href);
const ab = (text) => { process.stderr.write(`FEHLER: ${text}\n`); process.exit(1); };

async function stdinLesen() {
  if (process.stdin.isTTY) return "";
  let roh = "";
  for await (const teil of process.stdin) roh += teil;
  return roh.split(/\r?\n/)[0].trim();
}

async function main() {
  if (!process.argv.includes("--ja"))
    ab("Zur Sicherheit ist --ja nötig. Lies den Kopf dieser Datei (Wirkung: Sitzungen enden, alter Faktor wird gelöscht).");
  const daten = process.env.CENTRIC_DATEN;
  if (!daten) ab("CENTRIC_DATEN fehlt (Pfad des Datenordners).");
  if (!process.env.CENTRIC_PFEFFER) ab("CENTRIC_PFEFFER fehlt — ohne ihn lässt sich nichts neu einrichten.");
  const code = await stdinLesen();
  if (!code) ab("Den Betreibercode über die Standardeingabe geben (Pipe), nicht als Argument.");

  const { ablageBelegen } = await imp("server/lib/prozesssperre.mjs");
  const sperre = await ablageBelegen(daten, { puls: false, wartenMs: 0 });
  if (!sperre.ok) ab(`${sperre.grund} Den Server zuerst stoppen.`);
  try {
    const { getStore } = await imp("server/lib/ablage.mjs");
    const { betreiberZweifaktorZuruecksetzen } = await imp("server/lib/betreiber-zweifaktor.mjs");
    const store = getStore({ name: "centric", consistency: "strong" });
    const r = await betreiberZweifaktorZuruecksetzen({ store, code });
    if (!r.ok) ab(`${r.grund}. Nichts geändert.`);
    process.stdout.write([
      "Der zweite Faktor dieses Betreibercodes wurde zurückgesetzt.",
      `Sitzungen beendet: ${r.sitzungenBeendet}`,
      "",
      "Neues Geheimnis (erscheint nur hier, einmal):",
      `  ${r.geheimnis}`,
      `  ${r.otpauth}`,
      "",
      "In die Authenticator-App eintragen, dann den Server starten und mit dem ersten Code",
      "bestätigen (zweifaktorAktion: bestaetigen). Erst danach gilt der Code wieder.",
      "",
    ].join("\n"));
  } finally { await sperre.freigeben(); }
}
main().catch((e) => ab(String(e && e.message || e)));
