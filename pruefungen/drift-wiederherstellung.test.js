/* ==========================================================================
   DRIFT WIEDERHERSTELLUNG: Sicherungs- und Löschdokumentation gegen Skripte,
   Werkzeuge und Konstanten

   Prinzip (Masterprompt V6 Abschnitt 10, Drift Detection): docs/RESTORE-ANLEITUNG.md
   und docs/BETRIEB-SICHERUNG.md nennen Zahlen, Fristen, Dateinamen, Befehle,
   Skript- und Schrittnamen, Pfade und Zeitpläne, nach denen ein Betreiber im
   Ernstfall handelt. Dazu kommen Löschfristen in Datenschutz- und Betriebsdoku.
   Diese Prüfung liest die Aussage aus der Doku UND die Stelle aus dem
   Quelltext (deploy/sicherung/*, werkzeug/ablage-*.mjs, Workflow, server/lib/*)
   und verlangt Gleichheit. Rein lesend, ohne Agent, ohne Netz, ohne Uhr.

   Methode wie pruefungen/drift-sicherheit.test.js und drift-regelwerk.test.js:
   - Die Doku-Aussage wird per Satzmuster gelesen. Ist der Satz umformuliert,
     meldet die Prüfung „Aussage nicht mehr auffindbar“ (sie schweigt nie).
   - Die Code-Seite wird per Regex aus dem Quelltext gelesen. Nichts wird
     importiert, nichts neu exportiert, es gibt keine Seiteneffekte.
   - Nur eindeutige Paare sind gebunden. Eine Mindestanzahl verhindert, dass
     die Prüfung bei 0 Paaren grün bleibt.
   - Jede Meldung nennt beide Seiten mit Datei:Zeile.
   - Zeilenenden: CRLF und LF gelten gleich.
   - `bekannteAbweichung`: Abweichung mit offener Richtung (Doku oder Code
     falsch?). Sie wird nicht versteckt: Die Prüfung verlangt, dass sie weiter
     besteht, und wird rot, sobald sie behoben ist.

   Was NICHT gebunden ist (Reichweite): Messwerte (z. B. „bei 2/s 5 von 5“),
   Zeitangaben für Menschen („5 min“, „vierteljährlich“), Empfehlungen
   (Speicherziel, Passwortmanager, Perioden des Totmannschalters), das
   Verhalten der Skripte als Ganzes (Reihenfolge, Fehlerpfade), der Inhalt der
   Ablaufschritte in Prosa, Preise und Verträge. Die Prüfung belegt, dass Zahl,
   Name, Pfad und Befehl in der Doku und im Code gleich sind, nicht dass die
   Beschreibung vollständig ist. Keine Rechtsbewertung: Die Fristen werden nur
   als Zahl gegen die Konstante gehalten.
   ========================================================================== */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lies = (d) => readFileSync(path.join(WURZEL, d), "utf8").replace(/\r\n/g, "\n");
const zeileVon = (text, index) => text.slice(0, index).split("\n").length;

const BS = "docs/BETRIEB-SICHERUNG.md";
const RS = "docs/RESTORE-ANLEITUNG.md";
const G = "deploy/sicherung/gemeinsam.sh";
const SA = "deploy/sicherung/sicherung-ausser-haus.sh";
const WP = "deploy/sicherung/wiederherstellung-probe.sh";
const WS = "deploy/sicherung/widerrufbuch-sicherung.sh";
const WB = "deploy/sicherung/widerrufbuch-probe.sh";
const ENV = "deploy/sicherung/env.beispiel";
const CRON = "deploy/sicherung/crontab.beispiel";
const FLOW = ".github/workflows/betrieb-sicherung.yml";
const AS = "werkzeug/ablage-sicherung.mjs";
const AP = "werkzeug/ablage-pruefen.mjs";
const SCHUTZ = "server/lib/schutz.mjs";
const SDU = "server/lib/schutzdurchsetzung.mjs";

/* ---- Werte lesen ------------------------------------------------------- */

const ZAHLWORT = { zwei: 2, drei: 3, vier: 4, fünf: 5, sechs: 6, zwölf: 12, stunde: 1 };
/** Ein gelesener Wert: Zahlwort oder reine Zahl als Zahl, sonst als Text (z. B. Version, Pfad). */
const wert = (s) => {
  const k = String(s).toLowerCase();
  if (Object.prototype.hasOwnProperty.call(ZAHLWORT, k)) return ZAHLWORT[k];
  return /^\d+$/.test(s) ? Number(s) : s;
};
const wertCode = (s, teiler) => {
  const w = wert(String(s).replace(/_/g, ""));
  return typeof w === "number" && teiler !== 1 ? w / teiler : w;
};

/** Eine Aussage der Doku: Werte der Fangklammern samt Zeile. null, wenn der Satz fehlt. */
function dokuAussage(datei, muster) {
  const text = lies(datei);
  const m = muster.exec(text);
  if (!m) return null;
  return { werte: m.slice(1).map(wert), zeile: zeileVon(text, m.index), satz: m[0].replace(/\s+/g, " ").slice(0, 110) };
}

/** Code-Seite per Regex. `map`: [[Index der Doku-Klammer, Index der Code-Klammer, Teiler?], …]. */
const quelle = (datei, regex, name, map) => () => {
  const text = lies(datei);
  const m = regex.exec(text);
  if (!m) throw new Error(`${datei}: ${name} nicht gefunden (Quelltext umgebaut? dann Prüfung und Doku nachziehen)`);
  return { stelle: `${datei}:${zeileVon(text, m.index)}`, name, paare: map.map(([d, c, t = 1]) => [d, wertCode(m[c], t)]) };
};

/** Crontab-Vorlage: die Zeile (auch auskommentiert) zu einem Skript. `map`: [[Doku-Index, "minute"|"stunde"|"tag"], …]. */
const cron = (skript, map) => () => {
  const text = lies(CRON);
  const zeilen = text.split("\n");
  const i = zeilen.findIndex((z) => z.includes(`/${skript}`) && /^#?\s*[0-9*/,-]+\s+[0-9*/,-]+\s+[0-9*/,-]+\s+[0-9*/,-]+\s+[0-9*/,-]+\s/.test(z));
  if (i < 0) throw new Error(`${CRON}: keine Zeile für ${skript} (Vorlage umgebaut?)`);
  const f = zeilen[i].replace(/^#\s*/, "").trim().split(/\s+/);
  const feld = { minute: f[0], stunde: f[1], tag: f[2] };
  return { stelle: `${CRON}:${i + 1}`, name: `Crontab-Zeile ${skript}`, paare: map.map(([d, k]) => [d, wertCode(feld[k], 1)]) };
};

/* ---- gebundene Paare ---------------------------------------------------- */
/* id, Doku-Datei, Satzmuster, Bindungen an den Quelltext. */

const PAARE = [
  /* -- Zeitplan (Crontab-Vorlage) -- */
  { id: "zeit-sicherung", doku: BS, muster: /\*\*`sicherung-ausser-haus\.sh`\*\* \(täglich (\d{2}):(\d{2}) UTC/,
    titel: "Sicherung täglich 02:30 UTC = Crontab-Zeile", bind: [cron("sicherung-ausser-haus.sh", [[0, "stunde"], [1, "minute"]])] },
  { id: "zeit-cron-schritt", doku: BS, muster: /täglich (\d{2}):(\d{2}) UTC Sicherung, am (\d+)\. jedes Monats (\d{2}):(\d{2}) UTC Probe/,
    titel: "2.9 Cron: Sicherung 02:30 und Probe am 3. 04:15 = Crontab-Zeilen",
    bind: [cron("sicherung-ausser-haus.sh", [[0, "stunde"], [1, "minute"]]),
      cron("wiederherstellung-probe.sh", [[2, "tag"], [3, "stunde"], [4, "minute"]])] },
  { id: "zeit-probe-restore", doku: RS, muster: /monatlich, automatisch \((\d+)\., (\d{2}):(\d{2})\)/,
    titel: "Probe-Routine am 3., 04:15 = Crontab-Zeile", bind: [cron("wiederherstellung-probe.sh", [[0, "tag"], [1, "stunde"], [2, "minute"]])] },
  { id: "zeit-widerrufbuch-probe", doku: BS, muster: /Crontab-Zeile am (\d+)\., (\d{2}):(\d{2}) UTC/,
    titel: "Widerrufbuch-Probe am 5., 04:45 = Crontab-Zeile", bind: [cron("widerrufbuch-probe.sh", [[0, "tag"], [1, "stunde"], [2, "minute"]])] },
  { id: "zeit-widerrufbuch-job", doku: BS, muster: /\(stündlich, Minute (\d+)\)/,
    titel: "Widerrufbuch-Job stündlich zur Minute 17 = Crontab-Zeile", bind: [cron("widerrufbuch-sicherung.sh", [[0, "minute"]])] },

  /* -- Aufbewahrung, Grenzen, Fristen der Skripte -- */
  { id: "restic-forget", doku: BS, muster: /`--keep-daily (\d+) --keep-weekly (\d+) --keep-monthly (\d+) --prune`/,
    titel: "restic forget 7/4/12 = Skript",
    bind: [quelle(SA, /--keep-daily (\d+) --keep-weekly (\d+) --keep-monthly (\d+) --prune/, "forget-Schalter", [[0, 1], [1, 2], [2, 3]])] },
  { id: "schwund", doku: BS, muster: /um mehr als `SCHWUND_GRENZE_PROZENT` \((\d+) %\)/,
    titel: "Schwundgrenze 20 % = Vorgabe im Skript und in der Vorlage",
    bind: [quelle(G, /\$\{SCHWUND_GRENZE_PROZENT:=(\d+)\}/, "SCHWUND_GRENZE_PROZENT", [[0, 1]]),
      quelle(ENV, /# SCHWUND_GRENZE_PROZENT=(\d+)/, "SCHWUND_GRENZE_PROZENT (Vorlage)", [[0, 1]])] },
  { id: "lokal-behalten", doku: BS, muster: /bis auf `LOKAL_BEHALTEN` \((\d+)\) löschen/,
    titel: "lokale Kopien: 2 = LOKAL_BEHALTEN",
    bind: [quelle(G, /\$\{LOKAL_BEHALTEN:=(\d+)\}/, "LOKAL_BEHALTEN", [[0, 1]]),
      quelle(ENV, /^LOKAL_BEHALTEN=(\d+)/m, "LOKAL_BEHALTEN (Vorlage)", [[0, 1]])] },
  { id: "lokal-behalten-grenzen", doku: BS, muster: /die letzten (\d+) Sicherungen liegen \*\*unverschlüsselt\*\*/,
    titel: "Grenzen: die letzten 2 Sicherungen liegen lokal = LOKAL_BEHALTEN",
    bind: [quelle(G, /\$\{LOKAL_BEHALTEN:=(\d+)\}/, "LOKAL_BEHALTEN", [[0, 1]])] },
  { id: "zeitgrenzen", doku: BS, muster: /jeder restic-Aufruf `ZEITGRENZE_RESTIC` \(Vorgabe (\d+) s\), jeder Container `ZEITGRENZE_CONTAINER` \((\d+) s\)/,
    titel: "Zeitgrenzen 7200 s / 900 s = Vorgaben im Skript und in der Vorlage",
    bind: [quelle(G, /\$\{ZEITGRENZE_RESTIC:=(\d+)\}/, "ZEITGRENZE_RESTIC", [[0, 1]]),
      quelle(G, /\$\{ZEITGRENZE_CONTAINER:=(\d+)\}/, "ZEITGRENZE_CONTAINER", [[1, 1]]),
      quelle(ENV, /# ZEITGRENZE_RESTIC=(\d+)/, "ZEITGRENZE_RESTIC (Vorlage)", [[0, 1]]),
      quelle(ENV, /# ZEITGRENZE_CONTAINER=(\d+)/, "ZEITGRENZE_CONTAINER (Vorlage)", [[1, 1]])] },
  { id: "check-anteil", doku: BS, muster: /`--read-data-subset (\d+)%`/,
    titel: "restic check liest 5 % = CHECK_ANTEIL",
    bind: [quelle(G, /\$\{CHECK_ANTEIL:=(\d+)%\}/, "CHECK_ANTEIL", [[0, 1]]),
      quelle(ENV, /# CHECK_ANTEIL=(\d+)%/, "CHECK_ANTEIL (Vorlage)", [[0, 1]])] },
  { id: "check-anteil-grenzen", doku: BS, muster: /`restic check` liest täglich nur (\d+) %\*\*/,
    titel: "Grenzen: restic check liest täglich 5 % = CHECK_ANTEIL",
    bind: [quelle(G, /\$\{CHECK_ANTEIL:=(\d+)%\}/, "CHECK_ANTEIL", [[0, 1]])] },
  { id: "log-tage", doku: BS, muster: /sicherung-<UTC>\.log` \((\d+) Tage\)/,
    titel: "Log je Lauf 60 Tage = Aufräumen im Skript",
    bind: [quelle(G, /-name '\*\.log' -mtime \+(\d+) -delete/, "Log-Alter", [[0, 1]])] },
  { id: "cron-log", doku: BS, muster: /auf die letzten (\d+) Zeilen, sobald es (\d+) MiB übersteigt/,
    titel: "cron.log: 5000 Zeilen ab 1 MiB = Skript",
    bind: [quelle(G, /tail -n (\d+) "\$cron"/, "cron.log Zeilen", [[0, 1]]),
      quelle(G, /stat -c %s "\$cron"\)" -gt (\d+) \]\]/, "cron.log Größe (Byte)", [[1, 1, 1048576]])] },
  { id: "widerrufbuch-aufbewahrung", doku: BS, muster: /`--keep-last (\d+) --keep-daily (\d+)`/,
    titel: "Widerrufbuch: keep-last 200, keep-daily 90 = Skript",
    bind: [quelle(WS, /readonly AUFBEWAHRUNG_LETZTE=(\d+)/, "AUFBEWAHRUNG_LETZTE", [[0, 1]]),
      quelle(WS, /readonly AUFBEWAHRUNG_TAGE=(\d+)/, "AUFBEWAHRUNG_TAGE", [[1, 1]])] },
  { id: "restic-mindestversion", doku: BS, muster: /\*\*restic ≥ (\d+\.\d+\.\d+)\*\*/,
    titel: "restic ≥ 0.16.0 = RESTIC_MINDESTVERSION",
    bind: [quelle(G, /readonly RESTIC_MINDESTVERSION=(\d+\.\d+\.\d+)/, "RESTIC_MINDESTVERSION", [[0, 1]])] },
  { id: "retry-lock", doku: BS, muster: /`--retry-lock (\d+m)`/,
    titel: "--retry-lock 5m = RETRY_LOCK", bind: [quelle(G, /RETRY_LOCK=\(--retry-lock (\d+m)\)/, "RETRY_LOCK", [[0, 1]])] },
  { id: "restic-pin-version", doku: BS, muster: /releases\/download\/v(\d+\.\d+\.\d+)\/restic_(\d+\.\d+\.\d+)_linux_amd64\.bz2/,
    titel: "restic-Version in der Einrichtung = Workflow (\"dieselbe Version wie in CI\")",
    bind: [quelle(FLOW, /RESTIC_VERSION: "(\d+\.\d+\.\d+)"/, "RESTIC_VERSION", [[0, 1], [1, 1]])] },
  { id: "restic-pin-summe", doku: BS, muster: /echo "([0-9a-f]{64}) {2}restic_/,
    titel: "restic-Prüfsumme in der Einrichtung = Workflow",
    bind: [quelle(FLOW, /RESTIC_SHA256: "([0-9a-f]{64})"/, "RESTIC_SHA256", [[0, 1]])] },

  /* -- Exit-Codes -- */
  { id: "exit-konfig-sperre", doku: BS, muster: /Exit (\d+) bzw\. (\d+) \(anderer Lauf aktiv/,
    titel: "Exit 78 (Konfiguration) bzw. 75 (anderer Lauf) = Skript",
    bind: [quelle(G, /readonly CODE_KONFIG=(\d+)/, "CODE_KONFIG", [[0, 1]]), quelle(G, /readonly CODE_GESPERRT=(\d+)/, "CODE_GESPERRT", [[1, 1]])] },
  { id: "exit-ruecksprung", doku: BS, muster: /\*\*(\d+) nur Rücksprung\*\*/,
    titel: "Exit 3 = Rücksprung", bind: [quelle(WS, /readonly CODE_RUECKSPRUNG=(\d+)/, "CODE_RUECKSPRUNG", [[0, 1]])] },
  { id: "exit-restic", doku: BS, muster: /\*\*(\d+) restic\s+gescheitert\*\*/,
    titel: "Exit 4 = restic gescheitert", bind: [quelle(WS, /readonly CODE_RESTIC=(\d+)/, "CODE_RESTIC", [[0, 1]])] },
  { id: "exit-vergleich", doku: BS, muster: /\*\*(\d+)\s+Vergleichsstand fehlt\*\*/,
    titel: "Exit 5 = Vergleichsstand fehlt", bind: [quelle(WS, /readonly CODE_VERGLEICH_FEHLT=(\d+)/, "CODE_VERGLEICH_FEHLT", [[0, 1]])] },
  { id: "exit-liste", doku: BS, muster: /· (\d+) anderer Lauf · (\d+) Konfiguration/,
    titel: "Exit-Codes 75 und 78 in der Liste = Skript",
    bind: [quelle(G, /readonly CODE_GESPERRT=(\d+)/, "CODE_GESPERRT", [[0, 1]]), quelle(G, /readonly CODE_KONFIG=(\d+)/, "CODE_KONFIG", [[1, 1]])] },
  { id: "exit-zeitgrenze", doku: BS, muster: /· (\d+)\s+Zeitgrenze des Prüfcontainers/,
    titel: "Exit 124 = Zeitgrenze", bind: [quelle(G, /\$rc -eq (\d+) \|\| \$rc -eq 137/, "Zeitüberschreitung rc", [[0, 1]])] },

  /* -- Werkzeug ablage-sicherung / Server -- */
  { id: "ruhe-vorgabe", doku: BS, muster: /Ruhezeit `--ruhe` \(Vorgabe (\d+) ms\)/,
    titel: "--ruhe Vorgabe 1000 ms = Werkzeug (Aufruf und Hilfetext)",
    bind: [quelle(AS, /o\.ruhe === undefined \? (\d+) :/, "ruhe-Vorgabe", [[0, 1]]), quelle(AS, /--ruhe <ms, Vorgabe (\d+)>/, "ruhe-Vorgabe (Hilfe)", [[0, 1]])] },
  { id: "runden-versuche", doku: BS, muster: /in bis zu (zwölf) Runden je Versuch nach \((drei) Versuche\)/,
    titel: "zwölf Runden, drei Versuche = Werkzeug",
    bind: [quelle(AS, /versuche = (\d+), runden = (\d+)/, "versuche/runden", [[0, 2], [1, 1]])] },
  { id: "format", doku: BS, muster: /`FORMAT = (\d+)`/,
    titel: "Formatfassung FORMAT = 1 = Werkzeug", bind: [quelle(AS, /const FORMAT = (\d+);/, "FORMAT", [[0, 1]])] },
  { id: "schreibhalt-frist", doku: BS, muster: /`CENTRIC_SCHREIBHALT_MAX_MS`, Vorgabe (\d+) ms, höchstens (\d+) s;/,
    titel: "Schreib-Halt: Vorgabe 3000 ms, höchstens 10 s = Server",
    bind: [quelle("server/lib/schreibhalt.mjs", /HALT_VORGABE_MS = ([\d_]+);/, "HALT_VORGABE_MS", [[0, 1]]),
      quelle("server/lib/schreibhalt.mjs", /HALT_HART_MS = ([\d_]+);/, "HALT_HART_MS", [[1, 1, 1000]])] },
  { id: "sperre-45s", doku: BS, muster: /solange sie jünger als \*\*(\d+) Sekunden\*\* ist/,
    titel: "Prozesssperre veraltet nach 45 s = VERALTET_MS",
    bind: [quelle("server/lib/prozesssperre.mjs", /VERALTET_MS = ([\d_]+);/, "VERALTET_MS", [[0, 1, 1000]])] },
  { id: "wiederherstellen-grenzen", doku: BS, muster: /Gesamtgrenze (\d+) s, Raumsperre bis (\d+) s/,
    titel: "Wiederherstellen: Gesamtgrenze 45 s, Raumsperre 15 s = Server",
    bind: [quelle(SDU, /WIEDERHERSTELLEN_GRENZEN = \{ budgetMs: \d+, gesamtMs: (\d+),/, "gesamtMs", [[0, 1, 1000]]),
      quelle("server/lib/raumsperre.mjs", /SPERRE_ZEITGRENZE_MS = ([\d_]+);/, "SPERRE_ZEITGRENZE_MS", [[1, 1, 1000]])] },
  { id: "wiederherstellen-budget", doku: BS, muster: /eigenes Zeitbudget von (\d+) s \(`WIEDERHERSTELLEN_GRENZEN`\)/,
    titel: "Fachprüfung beim Wiederherstellen 30 s = budgetMs",
    bind: [quelle(SDU, /WIEDERHERSTELLEN_GRENZEN = \{ budgetMs: (\d+),/, "budgetMs", [[0, 1, 1000]])] },
  { id: "wiederherstellen-bremse", doku: BS, muster: /Grenze von (fünf) Wiederherstellungen je (Stunde)\./,
    titel: "Bremse: fünf Wiederherstellungen je Stunde = GRENZEN.wiederherstellen",
    bind: [quelle(SCHUTZ, /wiederherstellen: \{ versuche: (\d+), fenster: (\d+),/, "GRENZEN.wiederherstellen", [[0, 1], [1, 2, 3600]])] },
  { id: "widerrufbuch-alarm", doku: BS, muster: /älter als \*\*(\d+) h\*\* oder einem Buch, das sich vor mehr als\s+\*\*(\d+) min\*\*/,
    titel: "Alarm bei Widerrufbuch-Sicherung: 3 h und 90 min = Konstanten",
    bind: [quelle("server/lib/widerrufbuchsicherung.mjs", /SICHERUNG_WARNUNG_STUNDEN = (\d+);/, "SICHERUNG_WARNUNG_STUNDEN", [[0, 1]]),
      quelle("server/lib/widerrufbuchsicherung.mjs", /NACHLAUF_MINUTEN = (\d+);/, "NACHLAUF_MINUTEN", [[1, 1]])] },

  /* -- Pfade und Dateinamen (Text gegen Text) -- */
  { id: "pfad-passwortdatei", doku: BS, muster: /RESTIC_PASSWORD_FILE=(~\/\.config\/centric-sicherung\/restic-passwort)/,
    titel: "Pfad der restic-Passwortdatei = Vorlage", bind: [quelle(ENV, /^RESTIC_PASSWORD_FILE=(\S+)/m, "RESTIC_PASSWORD_FILE", [[0, 1]])] },
  { id: "pfad-konfig", doku: BS, muster: /cp ~\/centric-sicherung\/env\.beispiel (~\/\.config\/centric-sicherung\/env)\n/,
    titel: "Pfad der Konfigurationsdatei = Vorlage", bind: [quelle(ENV, /Ablage auf dem VPS: (~\/\.config\/centric-sicherung\/env)/, "Ablage der Konfiguration", [[0, 1]])] },
  { id: "pfad-daten", doku: BS, muster: /`(\/opt\/apps\/centric-dienstplanung\/data)`/,
    titel: "Datenpfad des Dienstes = CENTRIC_DATEN_PFAD in der Vorlage", bind: [quelle(ENV, /^CENTRIC_DATEN_PFAD=(\S+)/m, "CENTRIC_DATEN_PFAD", [[0, 1]])] },
  { id: "pfad-skripte", doku: BS, muster: /cp -r <checkout>\/deploy\/sicherung\/\. ~\/(centric-sicherung)\//,
    titel: "Zielordner der Skripte = Pfad in der Crontab-Vorlage", bind: [quelle(CRON, /\/home\/admin\/(centric-sicherung)\/sicherung-ausser-haus\.sh/, "Skriptordner", [[0, 1]])] },
  { id: "pfad-lokal", doku: RS, muster: /`~\/sicherung\/(lokal)`/,
    titel: "lokale Sicherungen unter ~/sicherung/lokal = LOKAL_ZIEL", bind: [quelle(G, /\$\{LOKAL_ZIEL:=\$STATUS_VERZEICHNIS\/(lokal)\}/, "LOKAL_ZIEL", [[0, 1]])] },
  { id: "pfad-statusordner", doku: RS, muster: /`~\/(sicherung)\/probe-status\.json`/,
    titel: "probe-status.json unter ~/sicherung = STATUS_VERZEICHNIS", bind: [quelle(G, /\$\{STATUS_VERZEICHNIS:=\$HOME\/(sicherung)\}/, "STATUS_VERZEICHNIS", [[0, 1]])] },
  { id: "datei-probe-status", doku: RS, muster: /`~\/sicherung\/(probe-status\.json)`/,
    titel: "Name der Probe-Statusdatei = Skript", bind: [quelle(WP, /STATUS_DATEI="\$STATUS_VERZEICHNIS\/(probe-status\.json)"/, "STATUS_DATEI", [[0, 1]])] },
  { id: "datei-status", doku: BS, muster: /`(status\.json)`: `zeit, ergebnis/,
    titel: "Name der Statusdatei = Skript", bind: [quelle(SA, /STATUS_DATEI="\$STATUS_VERZEICHNIS\/(status\.json)"/, "STATUS_DATEI", [[0, 1]])] },
  { id: "datei-letzte", doku: BS, muster: /status\.json` und `(letzte-erfolgreiche\.json)`/,
    titel: "Name der Datei des letzten Erfolgs = Skript", bind: [quelle(SA, /LETZTE_DATEI="\$STATUS_VERZEICHNIS\/(letzte-erfolgreiche\.json)"/, "LETZTE_DATEI", [[0, 1]])] },
  { id: "datei-widerrufbuch-status", doku: BS, muster: /eigene Statusdatei\s+`(widerrufbuch-status\.json)`/,
    titel: "Name der Widerrufbuch-Statusdatei = Skript", bind: [quelle(WS, /STATUS_DATEI="\$STATUS_VERZEICHNIS\/(widerrufbuch-status\.json)"/, "STATUS_DATEI", [[0, 1]])] },
  { id: "datei-widerrufbuecher", doku: BS, muster: /`zustand\/(zugang-widerrufe\.json)` \(E-M6\) und `zustand\/(konto-widerrufe\.json)`/,
    titel: "Namen der Widerrufbücher = Skript", bind: [quelle(WS, /readonly BUECHER=\((\S+) (\S+)\)/, "BUECHER", [[0, 1], [1, 2]])] },
  { id: "marker-fertig", doku: BS, muster: /find ~\/notfall -name (FERTIG) -path/,
    titel: "Fertigmarke FERTIG = Werkzeug", bind: [quelle(AS, /path\.join\(werkstatt, "(FERTIG)"\)/, "FERTIG", [[0, 1]])] },

  /* -- Schnittstellen der App (Wiederherstellen durch die Leitung) -- */
  { id: "route-sicherungen", doku: RS, muster: /`GET \/api\/(sicherungen)` und `POST \/api\/(wiederherstellen)`/,
    titel: "GET /api/sicherungen und POST /api/wiederherstellen = Routen im Server",
    bind: [quelle("server/funktionen/daten.mjs", /pfad === "(sicherungen)" && req\.method === "GET"/, "Route sicherungen", [[0, 1]]),
      quelle("server/funktionen/daten.mjs", /pfad === "(wiederherstellen)" && req\.method === "POST"/, "Route wiederherstellen", [[1, 1]])] },

  /* -- Löschfristen (Datenschutz- und Betriebsdoku) gegen die Konstanten -- */
  { id: "frist-test-bereitstellung", doku: "BEREITSTELLUNG.md", muster: /Testbetrieb läuft (\d+) Tage; danach weist die Anmeldung ab, die Daten bleiben\s+(\d+) Tage liegen/,
    titel: "Testbetrieb 30 Tage, danach 90 Tage Aufbewahrung = aufraeumen.mjs",
    bind: [quelle("server/lib/aufraeumen.mjs", /export const TESTTAGE = (\d+);/, "TESTTAGE", [[0, 1]]),
      quelle("server/lib/aufraeumen.mjs", /export const AUFBEWAHRUNG_TAGE = (\d+);/, "AUFBEWAHRUNG_TAGE", [[1, 1]])] },
  { id: "frist-test-entwicklung", doku: "ENTWICKLUNG.md", muster: /täglicher Löschlauf für abgelaufene Testbetriebe \((\d+) \+ (\d+) Tage\)/,
    titel: "Löschlauf Testbetriebe (30 + 90 Tage) = aufraeumen.mjs",
    bind: [quelle("server/lib/aufraeumen.mjs", /export const TESTTAGE = (\d+);/, "TESTTAGE", [[0, 1]]),
      quelle("server/lib/aufraeumen.mjs", /export const AUFBEWAHRUNG_TAGE = (\d+);/, "AUFBEWAHRUNG_TAGE", [[1, 1]])] },
  { id: "frist-test-loeschkonzept", doku: "rechtliches/loeschkonzept.md", muster: /nach (\d+) Tagen Test plus (\d+) Tage Aufbewahrung/,
    titel: "Löschkonzept: 30 Tage Test plus 90 Tage Aufbewahrung = aufraeumen.mjs",
    bind: [quelle("server/lib/aufraeumen.mjs", /export const TESTTAGE = (\d+);/, "TESTTAGE", [[0, 1]]),
      quelle("server/lib/aufraeumen.mjs", /export const AUFBEWAHRUNG_TAGE = (\d+);/, "AUFBEWAHRUNG_TAGE", [[1, 1]])] },
  { id: "frist-spur-datenfluss", doku: "docs/legal/DATENFLUSSBERICHT.md", muster: /Ablage `centric-spur` \| Löschung nach (\d+) Tagen/,
    titel: "Datenflussbericht: Spur wird nach 30 Tagen gelöscht = SPUR_TAGE",
    bind: [quelle(SCHUTZ, /const SPUR_TAGE = (\d+);/, "SPUR_TAGE", [[0, 1]])] },
  { id: "frist-spur-loeschkonzept", doku: "rechtliches/loeschkonzept.md", muster: /Das (\d+)-Tage-Anwendungsprotokoll/,
    titel: "Löschkonzept: 30-Tage-Anwendungsprotokoll = SPUR_TAGE",
    bind: [quelle(SCHUTZ, /const SPUR_TAGE = (\d+);/, "SPUR_TAGE", [[0, 1]])] },
  { id: "frist-zustell-mailpush", doku: "docs/MAIL-PUSH-EINRICHTUNG.md", muster: /Standard (\d+) Tage \(`CENTRIC_ZUSTELLPROTOKOLL_TAGE`, (\d+)–(\d+)\)/,
    titel: "Zustellprotokoll Standard 30 Tage, 1–365 = server.mjs",
    bind: [quelle("server.mjs", /t >= (\d+) && t <= (\d+) \? t : (\d+);/, "ZUSTELLPROTOKOLL_TAGE", [[1, 1], [2, 2], [0, 3]])] },
  { id: "frist-zustell-handbuch", doku: "docs/BETRIEBSHANDBUCH.md", muster: /`CENTRIC_ZUSTELLPROTOKOLL_TAGE` \| Aufbewahrung des Zustellprotokolls \((\d+)–(\d+)\);[^|]*\| (\d+) \|/,
    titel: "Betriebshandbuch: Zustellprotokoll 1–365, Vorgabe 30 = server.mjs",
    bind: [quelle("server.mjs", /t >= (\d+) && t <= (\d+) \? t : (\d+);/, "ZUSTELLPROTOKOLL_TAGE", [[0, 1], [1, 2], [2, 3]])] },
  { id: "frist-zustell-datenfluss", doku: "docs/legal/DATENFLUSSBERICHT.md", muster: /\| Zustellprotokoll \| [^|]*\| [^|]*\| `CENTRIC_ZUSTELLPROTOKOLL_TAGE` \((\d+)\)/,
    titel: "Datenflussbericht: Zustellprotokoll 30 Tage = server.mjs",
    bind: [quelle("server.mjs", /t >= \d+ && t <= \d+ \? t : (\d+);/, "ZUSTELLPROTOKOLL_TAGE", [[0, 1]])] },
  { id: "frist-zustell-loeschkonzept", doku: "rechtliches/loeschkonzept.md", muster: /Zustellprotokoll \(Mail\/Push\): (\d+) Tage laut Betriebsdokumentation/,
    titel: "Löschkonzept: Zustellprotokoll 30 Tage = server.mjs",
    bind: [quelle("server.mjs", /t >= \d+ && t <= \d+ \? t : (\d+);/, "ZUSTELLPROTOKOLL_TAGE", [[0, 1]])] },
  { id: "frist-sicherungen-plan", doku: "docs/legal/BACKUP-AUFBEWAHRUNG-ENTSCHEIDUNG.md", muster: /täglich bis (\d+) Tage, wöchentlich bis (\d+) Tage, Höchstalter (\d+) Tage, \*\*die (\d+) neuesten/,
    titel: "In-App-Sicherungen: 14 / 90 / 90 Tage, 20 neueste = SICHERUNGS_PLAN",
    bind: [quelle("server/lib/datenschutzlauf.mjs", /neuesteBehalten: (\d+), taeglichTage: (\d+), woechentlichTage: (\d+), hoechstalterTage: (\d+)/, "SICHERUNGS_PLAN",
      [[0, 2], [1, 3], [2, 4], [3, 1]])] },
  { id: "frist-sicherungen-loeschkonzept", doku: "rechtliches/loeschkonzept.md", muster: /\((\d+) neueste immer; je Tag eine für (\d+) Tage; je Woche bis (\d+) Tage; nichts älter als (\d+) Tage\)/,
    titel: "Löschkonzept: Ausdünnung 20 neueste, 14, 90, 90 Tage = SICHERUNGS_PLAN",
    bind: [quelle("server/lib/datenschutzlauf.mjs", /neuesteBehalten: (\d+), taeglichTage: (\d+), woechentlichTage: (\d+), hoechstalterTage: (\d+)/, "SICHERUNGS_PLAN",
      [[0, 1], [1, 2], [2, 3], [3, 4]])] },
  { id: "frist-aufbewahrung-monate", doku: "rechtliches/loeschkonzept.md", muster: /Plandaten (\d+) Monate, Stammdaten (\d+) Monate nach Austritt[^.]*?Standortangaben (\d+) Monate\./,
    titel: "Löschkonzept: Plandaten 24, Stammdaten 6, Gründe/Standort 3 Monate = VORGABE",
    bind: [quelle("server/lib/aufbewahrung.mjs", /plandatenMonate: (\d+),\s*stammdatenMonate: (\d+),\s*gruendeMonate: (\d+),/, "VORGABE", [[0, 1], [1, 2], [2, 3]])] },
  { id: "frist-aufbewahrung-bereich", doku: "rechtliches/loeschkonzept.md", muster: /Zulässiger Einstellbereich (\d+) bis (\d+) Monate/,
    titel: "Löschkonzept: Einstellbereich 1 bis 600 Monate = FRIST_GRENZEN",
    bind: [quelle("server/lib/aufbewahrung.mjs", /FRIST_GRENZEN = Object\.freeze\(\{ min: (\d+), max: (\d+) \}\)/, "FRIST_GRENZEN", [[0, 1], [1, 2]])] },
  { id: "frist-import-erledigt", doku: "docs/BETRIEBSHANDBUCH.md", muster: /`importerledigt:…` \((\d+) Tage\)/,
    titel: "Wiederholschutz Import 30 Tage = ERLEDIGT_FRIST_MS",
    bind: [quelle("server/lib/import/uebernahme.mjs", /ERLEDIGT_FRIST_MS = (\d+) \* 24 \* 60 \* 60 \* 1000;/, "ERLEDIGT_FRIST_MS (Tage)", [[0, 1]])] },
];

/* ---- bekannte Abweichungen ---------------------------------------------- */
/* { id, grund }: Abweichung mit offener Richtung. Die Prüfung verlangt, dass sie besteht. Heute leer. */
const bekannteAbweichung = [];

const MINDEST_PAARE = 61;

describe("Wiederherstellungs- und Löschdoku gegen Skripte und Konstanten: gebundene Aussagen", () => {
  it("Mindestanzahl gebundener Paare (die Prüfung schweigt nie bei 0)", () => {
    expect(PAARE.length, "zu wenige gebundene Aussagen: Paare gelöscht?").toBeGreaterThanOrEqual(MINDEST_PAARE);
    const ids = PAARE.map((p) => p.id);
    expect(new Set(ids).size, "doppelte Kennung in PAARE").toBe(ids.length);
    for (const b of bekannteAbweichung) {
      expect(b.grund, `bekannteAbweichung ohne Grund: ${b.id}`).toBeTruthy();
      expect(ids, `bekannteAbweichung nennt unbekanntes Paar: ${b.id}`).toContain(b.id);
    }
  });

  for (const p of PAARE) {
    it(`${p.id}: ${p.titel}`, () => {
      const a = dokuAussage(p.doku, p.muster);
      expect(a, `${p.doku}: Aussage nicht mehr auffindbar (Satz umformuliert?): ${p.muster}`).not.toBeNull();
      const abweichungen = [];
      for (const b of p.bind) {
        const c = b();
        for (const [i, w] of c.paare) {
          if (a.werte[i] !== w) abweichungen.push(`${p.doku}:${a.zeile} sagt ${a.werte[i]} („${a.satz}“), ${c.stelle} (${c.name}) ist ${w}`);
        }
      }
      const bekannt = bekannteAbweichung.find((x) => x.id === p.id);
      if (bekannt) {
        expect(abweichungen.length, `bekannteAbweichung ${p.id} besteht nicht mehr: Eintrag streichen`).toBeGreaterThan(0);
        return;
      }
      expect(abweichungen, `Abweichung zwischen Doku und Code:\n${abweichungen.join("\n")}`).toEqual([]);
    });
  }
});

/* ---- Dateinamen und Skriptnamen ----------------------------------------- */

const SUCH = ["", "deploy/sicherung", "deploy/sicherung/ci", "werkzeug", ".github/workflows", "docs", "server/lib"];

/** In Rückstrichen genannte Dateien (sh, mjs, yml, py, beispiel) und Markdown-Verweise samt Zeile. */
function genannteDateien(datei) {
  const text = lies(datei);
  const aus = [];
  for (const m of text.matchAll(/`([A-Za-z0-9_./-]+\.(?:sh|mjs|yml|py|beispiel))`/g)) aus.push({ name: m[1], zeile: zeileVon(text, m.index), art: "datei" });
  for (const m of text.matchAll(/\]\(([^)#\s]+\.md)(?:#[^)]*)?\)/g)) aus.push({ name: m[1], zeile: zeileVon(text, m.index), art: "verweis" });
  return aus;
}
function vorhanden(datei, d) {
  const ordner = path.posix.dirname(datei);
  if (d.art === "verweis") return existsSync(path.join(WURZEL, path.posix.join(ordner, d.name)));
  if (d.name.startsWith("~") || d.name.startsWith("/")) return true;
  if (d.name.includes("/")) return existsSync(path.join(WURZEL, d.name)) || existsSync(path.join(WURZEL, ordner, d.name));
  return SUCH.some((o) => existsSync(path.join(WURZEL, o, d.name)));
}

describe("Wiederherstellungsdoku: Dateinamen, Skriptnamen, Verweise", () => {
  for (const [datei, mindest] of [[BS, 25], [RS, 3]]) {
    it(`jede in ${datei} genannte Skript-, Werkzeug-, Workflow- und Vorlagendatei und jeder Doku-Verweis existiert`, () => {
      const genannt = genannteDateien(datei);
      expect(genannt.length, `${datei}: zu wenige Dateinamen gefunden (Format geändert?)`).toBeGreaterThanOrEqual(mindest);
      const fehlend = genannt.filter((d) => !vorhanden(datei, d)).map((d) => `${datei}:${d.zeile} nennt ${d.name}, die Datei gibt es nicht`);
      expect(fehlend, fehlend.join("\n")).toEqual([]);
    });
  }

  it("jedes Skript in deploy/sicherung/ und jedes Werkzeug ablage-*.mjs steht in der Doku (BETRIEB-SICHERUNG.md)", () => {
    const doku = lies(BS);
    const skripte = readdirSync(path.join(WURZEL, "deploy/sicherung")).filter((f) => f.endsWith(".sh"));
    const werkzeuge = readdirSync(path.join(WURZEL, "werkzeug")).filter((f) => /^ablage-.*\.mjs$/.test(f));
    expect(skripte.length, "keine Skripte in deploy/sicherung gefunden").toBeGreaterThanOrEqual(4);
    expect(werkzeuge.length, "keine Werkzeuge ablage-*.mjs gefunden").toBeGreaterThanOrEqual(2);
    const fehlend = [...skripte, ...werkzeuge].filter((f) => !doku.includes(f))
      .map((f) => `${f} liegt im Quellbaum, steht aber nicht in ${BS} (Doku nachziehen oder Datei entfernen)`);
    expect(fehlend, fehlend.join("\n")).toEqual([]);
  });

  /** Die Schrittnamen (`schritt` in status.json) im Skript, in Reihenfolge der Zuweisung. */
  const schritte = (datei) => [...lies(datei).matchAll(/^SCHRITT="([a-z-]+)"/gm)].map((m) => m[1]);

  it("Tabelle „Schritt“ (§1) nennt genau die Schritte, die sicherung-ausser-haus.sh setzt", () => {
    const text = lies(BS);
    const von = text.indexOf("| # | Schritt (`schritt` in status.json)");
    expect(von, `${BS}: Schrittetabelle nicht auffindbar (umformuliert?)`).toBeGreaterThan(0);
    const ende = text.indexOf("\n\n", von);
    const doku = new Set();
    for (const z of text.slice(von, ende).split("\n").slice(2)) {
      /* Zelle „Schritt“: `name` oder `name`, `name2` vor dem Doppelpunkt. */
      const m = /^\s*`([a-z-]+)`(?:, `([a-z-]+)`)?[:\s]/.exec(z.split("|")[2] || "");
      if (m) { doku.add(m[1]); if (m[2]) doku.add(m[2]); }
    }
    expect(doku.size, `${BS}: keine Schrittnamen in der Tabelle gelesen (Format geändert?)`).toBeGreaterThanOrEqual(8);
    const skript = new Set(schritte(SA));
    expect(skript.size, `${SA}: keine SCHRITT-Zuweisungen gefunden`).toBeGreaterThanOrEqual(8);
    const nurDoku = [...doku].filter((s) => !skript.has(s)).map((s) => `${BS}:${zeileVon(text, text.indexOf(`\`${s}\``, von))} nennt Schritt ${s}, ${SA} setzt ihn nicht`);
    const nurSkript = [...skript].filter((s) => !doku.has(s)).map((s) => `${SA} setzt Schritt ${s}, die Tabelle in ${BS} (§1) nennt ihn nicht`);
    expect([...nurDoku, ...nurSkript], [...nurDoku, ...nurSkript].join("\n")).toEqual([]);
  });

  it("Tabelle „schritt“ (§3) nennt nur Schritte, die ein Skript kennt (Sicherung oder Probe)", () => {
    const text = lies(BS);
    const von = text.indexOf("| schritt | häufige Ursache | Abhilfe |");
    expect(von, `${BS}: Alarmtabelle nicht auffindbar (umformuliert?)`).toBeGreaterThan(0);
    const ende = text.indexOf("\n\n", von);
    const bekannt = new Set([...schritte(SA), ...schritte(WP)]);
    const genannt = [];
    for (const z of text.slice(von, ende).split("\n").slice(2)) {
      const zelle = z.split("|")[1] || "";
      for (const m of zelle.matchAll(/`([a-z]+(?:-[a-z]+)*)`/g)) genannt.push({ name: m[1], zeile: zeileVon(text, text.indexOf(z, von)) });
    }
    expect(genannt.length, `${BS}: keine Schrittnamen in der Alarmtabelle`).toBeGreaterThanOrEqual(10);
    const fehlend = genannt.filter((g) => !bekannt.has(g.name)).map((g) => `${BS}:${g.zeile} nennt Schritt ${g.name}, kein Skript setzt ihn`);
    expect(fehlend, fehlend.join("\n")).toEqual([]);
  });

  it("Abschnittsverweise (§N) in beiden Dokumenten zeigen auf vorhandene Überschriften von BETRIEB-SICHERUNG.md", () => {
    const bs = lies(BS);
    const ueberschriften = new Set([...bs.matchAll(/^## (\d+a?)\./gm)].map((m) => m[1]));
    expect(ueberschriften.size, `${BS}: keine nummerierten Überschriften gefunden`).toBeGreaterThanOrEqual(8);
    const fehlend = [];
    let gezaehlt = 0;
    for (const datei of [RS, BS]) {
      const text = lies(datei);
      for (const m of text.matchAll(/§(\d+a?)(?![\d.]*\.\d)/g)) {
        if (/BEREITSTELLUNG\s*$/.test(text.slice(Math.max(0, m.index - 16), m.index))) continue;
        gezaehlt++;
        if (!ueberschriften.has(m[1])) fehlend.push(`${datei}:${zeileVon(text, m.index)} verweist auf §${m[1]}, ${BS} hat keine Überschrift „## ${m[1]}.“`);
      }
    }
    expect(gezaehlt, "keine Abschnittsverweise gefunden (Format geändert?)").toBeGreaterThanOrEqual(8);
    expect(fehlend, fehlend.join("\n")).toEqual([]);
  });

  it("BEREITSTELLUNG.md hat den von beiden Dokumenten genannten Abschnitt 5.4 (Sicherung und Wiederherstellung der gesamten Ablage)", () => {
    expect(lies(BS) + lies(RS)).toMatch(/5\.4/);
    expect(lies("BEREITSTELLUNG.md"), "BEREITSTELLUNG.md: Überschrift „5.4 Sicherung und Wiederherstellung“ fehlt").toMatch(/^### 5\.4 Sicherung und Wiederherstellung/m);
  });
});

/* ---- Befehle und Optionen ------------------------------------------------ */

describe("Wiederherstellungsdoku: Befehle und Optionen gegen die Werkzeuge", () => {
  /* Jeder Eintrag: Option oder Befehl, Doku, Quelle. Doku und Quelle müssen ihn nennen. */
  const OPTIONEN = [
    { t: "--beiseitelegen", doku: [BS, RS], q: AP }, { t: "--aus-sicherung", doku: [BS, RS], q: AP },
    { t: "--kern-zurueck", doku: [BS, RS], q: AP }, { t: "--fehlende-hinnehmen", doku: [BS, RS], q: AP },
    { t: "--ohne-vermerk", doku: [BS], q: AP },
    { t: "--ruhe", doku: [BS], q: AS }, { t: "--schreibhalt", doku: [BS], q: AS },
    { t: "--ersetzen", doku: [BS], q: AS }, { t: "--zustand", doku: [BS], q: AS }, { t: "--daten", doku: [BS], q: AS },
    { t: "--widerrufbuch-kopie", doku: [BS], q: AS }, { t: "--vorher", doku: [BS], q: AS },
    { t: "--snapshot", doku: [BS, RS], q: WP }, { t: "--erster-lauf", doku: [BS], q: WS },
  ];
  const BEFEHLE = [
    { t: "sichern", doku: BS, q: AS, re: /ablage-sicherung\.mjs sichern\b/, dre: /`ablage-sicherung sichern`/ },
    { t: "pruefen", doku: RS, q: AS, re: /ablage-sicherung\.mjs pruefen\b/, dre: /`ablage-sicherung\.mjs pruefen`/ },
    { t: "wiederherstellen", doku: BS, q: AS, re: /ablage-sicherung\.mjs wiederherstellen\b/, dre: /`ablage-sicherung wiederherstellen`/ },
    { t: "schluessel-erneuern", doku: BS, q: AS, re: /ablage-sicherung\.mjs schluessel-erneuern\b/, dre: /werkzeug\/ablage-sicherung\.mjs schluessel-erneuern/ },
    { t: "widerrufbuch-pruefen", doku: BS, q: AS, re: /ablage-sicherung\.mjs widerrufbuch-pruefen\b/, dre: /`ablage-sicherung\.mjs widerrufbuch-pruefen/ },
    { t: "widerrufbuch-vereinen", doku: BS, q: AS, re: /ablage-sicherung\.mjs widerrufbuch-vereinen\b/, dre: /`widerrufbuch-vereinen`/ },
  ];

  it("jede genannte Option steht in der Doku und im Quelltext des Werkzeugs oder Skripts", () => {
    expect(OPTIONEN.length).toBeGreaterThanOrEqual(14);
    const meldungen = [];
    for (const o of OPTIONEN) {
      const q = lies(o.q);
      if (!new RegExp(`${o.t.replace(/-/g, "\\-")}(?![a-z-])`).test(q)) meldungen.push(`${o.q}: kennt die Option ${o.t} nicht (Doku nennt sie)`);
      for (const d of o.doku) {
        const text = lies(d);
        if (!new RegExp(`${o.t.replace(/-/g, "\\-")}(?![a-z-])`).test(text)) meldungen.push(`${d}: Aussage nicht mehr auffindbar: Option ${o.t} (${o.q} kennt sie)`);
      }
    }
    expect(meldungen, meldungen.join("\n")).toEqual([]);
  });

  it("jeder genannte Befehl von ablage-sicherung.mjs steht in der Doku und im Hilfetext des Werkzeugs", () => {
    expect(BEFEHLE.length).toBeGreaterThanOrEqual(6);
    const meldungen = [];
    for (const b of BEFEHLE) {
      if (!b.re.test(lies(b.q))) meldungen.push(`${b.q}: Hilfetext kennt den Befehl ${b.t} nicht (Doku nennt ihn)`);
      if (!b.dre.test(lies(b.doku))) meldungen.push(`${b.doku}: Aussage nicht mehr auffindbar: Befehl ${b.t} (${b.dre})`);
    }
    expect(meldungen, meldungen.join("\n")).toEqual([]);
  });

  it("die Sicherungsskripte rufen die Werkzeug-Befehle auf, die die Doku in §1 beschreibt (sichern, pruefen, wiederherstellen)", () => {
    expect(lies(SA)).toMatch(/ablage-sicherung\.mjs sichern\b/);
    expect(lies(SA)).toMatch(/ablage-sicherung\.mjs pruefen\b/);
    expect(lies(WP)).toMatch(/ablage-sicherung\.mjs pruefen\b/);
    expect(lies(WP)).toMatch(/ablage-sicherung\.mjs wiederherstellen\b/);
  });

  it("die Doku nennt die Container-Schalter des Werkzeugaufrufs, die auch die Skripte setzen (kein Netz, schreibgeschützt, keine Rechte)", () => {
    /* gemeinsam.sh baut den Werkzeug-Container (Sicherung, Probe-Werkzeug), die Probe startet den Dienst-Container selbst. */
    for (const datei of [G, WP]) {
      const q = lies(datei);
      for (const s of ["--network none", "--read-only", "--cap-drop ALL"]) {
        expect(q, `${datei}: Schalter ${s} fehlt (Doku ${BS} §1 sagt „--network none --read-only --cap-drop ALL“)`).toContain(s);
      }
    }
    expect(lies(BS)).toContain("--network none --read-only --cap-drop ALL");
  });
});

/* ---- Namen in Rückstrichen: Umgebungsvariablen und Fehlercodes ------------ */

describe("Wiederherstellungsdoku: genannte Variablen und Codes gibt es im Quelltext", () => {
  const ordner = (d, aus) => {
    for (const e of readdirSync(path.join(WURZEL, d), { withFileTypes: true })) {
      if (e.name === "node_modules") continue;
      const p = path.posix.join(d, e.name);
      if (e.isDirectory()) ordner(p, aus);
      else if (/\.(mjs|js|sh|py|yml|beispiel|json)$/.test(e.name) && statSync(path.join(WURZEL, p)).size < 3_000_000) aus.push(p);
    }
    return aus;
  };
  const quellen = () => {
    const dateien = [...ordner("server", []), ...ordner("deploy", []), ...ordner("werkzeug", []), "server.mjs", "Dockerfile", FLOW];
    return dateien.map((d) => lies(d)).join("\n");
  };

  it("jeder in Rückstrichen genannte GROSS_GESCHRIEBENE Name (Variable, Konstante, Fehlercode) steht im Quelltext", () => {
    const korpus = quellen();
    const meldungen = [];
    let gezaehlt = 0;
    for (const datei of [BS, RS]) {
      const text = lies(datei);
      const gesehen = new Set();
      for (const m of text.matchAll(/`([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)(?:=[^`]*)?`/g)) {
        if (gesehen.has(m[1])) continue;
        gesehen.add(m[1]);
        gezaehlt++;
        if (!korpus.includes(m[1])) meldungen.push(`${datei}:${zeileVon(text, m.index)} nennt ${m[1]}, im Quelltext (server, deploy, werkzeug, Workflow) kommt der Name nicht vor`);
      }
    }
    expect(gezaehlt, "keine großgeschriebenen Namen gefunden (Format geändert?)").toBeGreaterThanOrEqual(20);
    expect(meldungen, meldungen.join("\n")).toEqual([]);
  });
});

/* ---- Workflow (nur lesen) -------------------------------------------------- */

describe("Wiederherstellungsdoku: Workflow betrieb-sicherung.yml", () => {
  it("die in der Doku genannten CI-Skripte und der Workflow-Name stimmen mit dem Workflow überein", () => {
    const flow = lies(FLOW);
    const doku = lies(BS);
    expect(doku, `${BS}: Aussage nicht mehr auffindbar: Verweis auf den Workflow`).toContain(".github/workflows/betrieb-sicherung.yml");
    expect(flow, `${FLOW}: Name „Betrieb Sicherung“ fehlt`).toMatch(/^name: Betrieb Sicherung$/m);
    const skripte = [...doku.matchAll(/`(deploy\/sicherung\/ci\/[a-z-]+\.sh)`/g)].map((m) => m[1]);
    expect(skripte.length, `${BS}: kein CI-Skript genannt (Format geändert?)`).toBeGreaterThanOrEqual(1);
    for (const s of skripte) {
      expect(existsSync(path.join(WURZEL, s)), `${BS} nennt ${s}, die Datei gibt es nicht`).toBe(true);
      expect(flow, `${FLOW} ruft ${s} nicht auf (Doku ${BS} §6 sagt, der Workflow tue es)`).toMatch(new RegExp(`run: ${s.replace(/[./]/g, "\\$&")}`));
    }
  });

  it("der Workflow löst auf Änderungen an den dokumentierten Skripten und am Werkzeug aus", () => {
    const flow = lies(FLOW);
    for (const p of ["deploy/sicherung/**", "werkzeug/ablage-sicherung.mjs", ".github/workflows/betrieb-sicherung.yml"]) {
      expect(flow, `${FLOW}: Pfadfilter ${p} fehlt`).toContain(`"${p}"`);
    }
  });

  it("der Workflow hat keinen Zeitplan (schedule), und die Doku behauptet keinen", () => {
    expect(lies(FLOW), `${FLOW}: hat jetzt einen Zeitplan, Doku ${BS} §6 beschreibt den Nachweis ohne Zeitplan: Doku prüfen`).not.toMatch(/^\s*schedule:/m);
    expect(lies(BS), `${BS}: nennt jetzt einen Zeitplan für den CI-Nachweis, ${FLOW} hat keinen`).not.toMatch(/CI[^.\n]{0,80}(nächtlich|täglich|wöchentlich)/);
  });
});
