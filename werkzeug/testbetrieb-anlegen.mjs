#!/usr/bin/env node
/* ==========================================================================
   TESTBETRIEB FÜR EIN KONTO ANLEGEN — Betreiberweg ohne Netz
   (OPT-1-F, Review #166 Blocker 3)

   Wann: Ein Konto (Registrierung abgeschlossen: Adresse bestätigt, Passwort
   gesetzt, Anspruch auf einen Testbetrieb offen) soll seinen Testbetrieb
   bekommen. Die Provisionierung (lib/provisionierung.mjs,
   testbetriebFuerAccountAnlegen) hat keinen öffentlichen Aufrufer und bekommt
   mit diesem Werkzeug auch keinen: Es läuft nur auf dem Server selbst.

   Wer darf: nur, wer den Server bedient (Zugriff auf den Datenordner und den
   Pfeffer). Kein Netzweg, kein Schalter, keine neue Berechtigung.

   Mit --ersteinrichtung entsteht zusätzlich der Ersteinrichtungscode der
   Leitung (lib/zugangscode-ersteinrichtung.mjs): einmalig, 72 Stunden, an
   Konto, Person und Betrieb gebunden, nach fünf falschen Werten aus der App
   gesperrt. Er erscheint hier genau einmal und wird nirgends gespeichert oder
   verschickt. Die Leitung richtet damit — zusammen mit Adresse und Passwort —
   den zweiten Faktor am Konto ein (POST /api/account/anmelden,
   zweifaktorAktion "beginnen" und "bestaetigen", Feld ersteinrichtungscode).
   Danach gilt nur die Kontoanmeldung mit Passwort und Code aus der App; der
   Code allein ergibt nie eine Sitzung. Ohne --ersteinrichtung bleibt es beim
   bisherigen Verhalten (kein Code). Unter CENTRIC_ROLLEN_ZWEIFAKTOR_PFLICHT=1
   ist ein Betrieb ohne diesen Code für seine Leitung nicht erreichbar.

   Aufruf (der Server ist vorher zu stoppen — die Ablage gehört immer nur
   einem Prozess; läuft er noch, bricht das Werkzeug ab):

     docker compose -f deploy/compose.yml stop centric-dp-web
     CENTRIC_DATEN=/pfad/zu/data CENTRIC_PFEFFER=... \
       node werkzeug/testbetrieb-anlegen.mjs --email adresse@example.org --ersteinrichtung --ja
     docker compose -f deploy/compose.yml start centric-dp-web

   Ausgang: 0 = angelegt, 1 = Fehler/abgelehnt.
   ========================================================================== */

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const imp = (p) => import(pathToFileURL(path.join(WURZEL, p)).href);

/** Der Wert hinter einem Schalter (`--email x`), sonst null. */
function wert(argv, name) {
  const i = argv.indexOf(name);
  return i >= 0 && i + 1 < argv.length && !String(argv[i + 1]).startsWith("--") ? String(argv[i + 1]) : null;
}

/**
 * Das Werkzeug als Funktion (für die Prüfung). Schreibt nichts selbst aus; die Ausgabe steht im Ergebnis.
 * @param {string[]} argv
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {Promise<{ok: boolean, text: string}>}
 */
export async function ausfuehren(argv, env = process.env) {
  const nein = (text) => ({ ok: false, text: `FEHLER: ${text}\n` });
  if (!argv.includes("--ja")) return nein("Zur Sicherheit ist --ja nötig. Lies den Kopf dieser Datei.");
  const email = wert(argv, "--email");
  if (!email) return nein("--email fehlt (Adresse des Kontos).");
  const ersteinrichtung = argv.includes("--ersteinrichtung");
  const daten = env.CENTRIC_DATEN;
  if (!daten) return nein("CENTRIC_DATEN fehlt (Pfad des Datenordners).");
  if (ersteinrichtung && !env.CENTRIC_PFEFFER)
    return nein("CENTRIC_PFEFFER fehlt — ohne ihn gibt es keinen Ersteinrichtungscode.");

  const { ablageBelegen } = await imp("server/lib/prozesssperre.mjs");
  const sperre = await ablageBelegen(daten, { puls: false, wartenMs: 0 });
  if (!sperre.ok) return nein(`${sperre.grund} Den Server zuerst stoppen.`);
  try {
    const { getStore } = await imp("server/lib/ablage.mjs");
    const { accountLesenPerMail } = await imp("server/lib/accounts.mjs");
    const { testbetriebFuerAccountAnlegen } = await imp("server/lib/provisionierung.mjs");
    const store = getStore({ name: "centric", consistency: "strong" });
    const sitzungen = getStore({ name: "centric-sitzungen", consistency: "strong" });
    const konto = await accountLesenPerMail(store, email);
    if (!konto || typeof konto.id !== "string") return nein("Zu dieser Adresse gibt es kein Konto. Nichts angelegt.");
    /* Ohne Schalter genau der bisherige Aufruf; mit Schalter ausdrücklich ersteinrichtung: true. */
    const e = await testbetriebFuerAccountAnlegen(store, sitzungen,
      { accountId: konto.id, ...(ersteinrichtung ? { ersteinrichtung: true } : {}) });
    if (!e.ok) return nein(`${e.grund || "abgelehnt"}${e.rollback ? ` (Rückbau: ${e.rollback})` : ""}.`);
    const zeilen = [`Testbetrieb angelegt: Raum ${e.raum}${e.wiederaufgenommen ? " (Vorgang zu Ende gebracht)" : ""}.`];
    if (e.ersteinrichtung && e.ersteinrichtung.code) {
      zeilen.push("", "Ersteinrichtungscode der Leitung (erscheint nur hier, einmal; nicht per E-Mail schicken):",
        `  ${e.ersteinrichtung.code}`, `  gültig bis ${e.ersteinrichtung.bis}`, "",
        "Die Leitung richtet damit, zusammen mit ihrer Adresse und ihrem Passwort, den zweiten Faktor am Konto ein.",
        "Danach gilt nur die Anmeldung mit Passwort und dem Code aus der App.");
    } else if (ersteinrichtung) {
      return nein("Kein Ersteinrichtungscode im Ergebnis. Bitte prüfen.");
    }
    return { ok: true, text: `${zeilen.join("\n")}\n` };
  } finally { await sperre.freigeben(); }
}

const direkt = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (direkt) {
  ausfuehren(process.argv.slice(2)).then((r) => {
    (r.ok ? process.stdout : process.stderr).write(r.text);
    process.exit(r.ok ? 0 : 1);
  }).catch((e) => { process.stderr.write(`FEHLER: ${String((e && e.message) || e)}\n`); process.exit(1); });
}
