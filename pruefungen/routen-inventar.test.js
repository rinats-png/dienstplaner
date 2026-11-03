/* ==========================================================================
   ROUTEN-INVENTAR — Pflicht-Sondenprüfung (interne Sicherheitsprüfung 2026-11)

   Bis hierher gab es keine Prüfung, die sagt: „Jeder Weg, den der Server
   annimmt, steht in der Rechtematrix und wird von mindestens einer Prüfung
   aufgerufen.“ rechtematrix-zeilen.test.js bindet die Datenklassen (§1) an
   den Code, sitzungsinventar.test.js das Lesen der Sitzung — ein neues
   `if (pfad === "x")` in daten.mjs oder ein neuer `config.path` lief aber
   ohne Zeile und ohne Sonde durch.

   Diese Prüfung liest die Wege aus dem Quelltext (config.path der
   Funktionen, jedes `pfad === "…"`/`pfad !== "…"`, die PFADE-Listen,
   `pfad.startsWith("…")`) und verlangt für JEDEN:
     1. einen Eintrag in INVENTAR unten (neuer Weg ohne Eintrag → rot),
     2. eine Zeile in RECHTEMATRIX.md (Weg in Backticks, auch als
        Platzhalter `…/*`) — oder eine ausdrücklich begründete Lücke,
     3. mindestens eine Datei unter pruefungen/, die den Weg aufruft,
        und die im Inventar genannten Sonden-Dateien müssen ihn enthalten.
   Ein Eintrag im Inventar, den es im Code nicht mehr gibt, ist ebenfalls rot.

   Bekannte Lücken stehen in LUECKEN mit Grund; ihre Zahl ist festgeschrieben,
   damit eine neue Lücke eine bewusste Änderung dieser Datei braucht.
   ========================================================================== */

import { describe, it, expect, beforeAll } from "vitest";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FUNKTIONEN = path.join(WURZEL, "server", "funktionen");

/** Weg → Sonden-Dateien (unter pruefungen/), die ihn aufrufen, auch mit
 *  einer Rolle, die es nicht darf, wo das sinnvoll ist. */
export const INVENTAR = {
  "/api/zugaenge": ["pentest.mjs", "sicherheit-intern.test.js"],
  "/api/raum-loeschen": ["pentest.mjs"],
  "/api/zugaenge-uebersicht": ["rechte.mjs", "server.test.js"],
  "/api/zugang-sperren": ["rechte.mjs", "sitzungsbindung.test.js"],
  "/api/bestand-anlegen": ["rechte.mjs"],
  "/api/demos": ["demozugang.mjs"],
  "/api/demo": ["demozugang.mjs", "rollen-eintritt.test.js"],
  "/api/anmelden": ["betreiber-zweifaktor.test.js", "bremse-lokal.test.js"],
  "/api/abmelden": ["pentest.mjs", "rollen-failclosed.test.js"],
  "/api/bestand": ["rechtematrix.test.js", "pentest.mjs"],
  "/api/br-auswertung": ["br-auswertung.test.js"],
  "/api/stempeln": ["stempel-datenschutz.test.js", "bremse-wp47.test.js"],
  "/api/stempel-korrektur": ["korrekturworkflow.test.js", "rollen-failclosed.test.js"],
  "/api/korrektur-antrag": ["rollen-failclosed.test.js"],
  "/api/korrektur-entscheiden": ["rollen-failclosed.test.js"],
  "/api/zeit-bestaetigen": ["rollen-failclosed.test.js", "stempel-datenschutz.test.js"],
  "/api/auskunft": ["dsgvo-server.test.js"],
  "/api/vollausgabe": ["pentest.mjs", "rollen-failclosed.test.js"],
  "/api/sicherungsschluessel": ["verwaltungswege.test.js", "sicherung.mjs"],
  "/api/sicherung": ["rollen-failclosed.test.js", "wiederherstellen-ui.test.js"],
  "/api/sicherungen": ["rollen-failclosed.test.js", "wiederherstellen-ui.test.js"],
  "/api/wiederherstellen": ["wiederherstellen-ui.test.js", "mandanten-session.test.js"],
  "/api/account/anmelden": ["anmeldung-http.test.js"],
  "/api/account/sitzung": ["anmeldung-http.test.js"],
  "/api/account/abmelden": ["anmeldung-http.test.js"],
  "/api/account/mitgliedschaften": ["betriebsauswahl.test.js"],
  "/api/account/betrieb": ["betriebsauswahl.test.js"],
  "/api/registrierung": ["registrierung-http.test.js"],
  "/api/registrierung/verifizieren": ["registrierung-http.test.js"],
  "/api/registrierung/passwort": ["passwort-http.test.js"],
  "/einrichten": ["server.test.js"],
  "/einrichten/verwalter": ["zweifaktor.test.js"],
  "/einrichten/umgebung": ["zweifaktor.test.js"],
  "/einrichten/uebersicht": ["zweifaktor.test.js"],
  "/einrichten/bindung": ["altcodes.test.js"],
  "/einrichten/zweifaktor": ["zweifaktor.test.js"],
  "/kalender/einrichten": ["kalender-rechte.test.js"],
  "/kalender/daten": ["kalender-rechte.test.js"],
  "/kalender/loeschen": ["kalender-rechte.test.js"],
  "/kalender/feed": ["kalender-feed-live.test.js"],
  "/zustellung/senden": ["zustellung-rechte.test.js"],
  "/zustellung/anmelden": ["zustellung-rechte.test.js", "sicherheit-intern.test.js"],
  "/zustellung/abmelden": ["zustellung-rechte.test.js"],
  "/zustellung/schluessel": ["server.test.js"],
  "/lage": ["rechte.mjs", "server.test.js"],
  "/starten": ["starten.test.js"],
  "/starten/neu": ["starten.test.js"],
};

/** Wege ohne eigene Zeile in RECHTEMATRIX.md — bewusst, mit Grund. */
export const LUECKEN = {
  "/api/abmelden": "beendet nur die eigene Sitzung; kein Datenzugriff",
  "/api/registrierung": "öffentlich (Selbstregistrierung), eigene Bremse; Zeile in §2 nachtragen (SI-P5)",
  "/api/registrierung/verifizieren": "öffentlich mit Einmal-Token; Zeile in §2 nachtragen (SI-P5)",
  "/api/registrierung/passwort": "öffentlich mit Einmal-Token; Zeile in §2 nachtragen (SI-P5)",
  "/starten": "öffentlicher Selbststart, gebremst; Zeile in §2 nachtragen (SI-P5)",
  "/starten/neu": "öffentlicher Selbststart, gebremst; Zeile in §2 nachtragen (SI-P5)",
};
const LUECKEN_ANZAHL = 6;

/* ---------------------------------------------------------------- Quelltext */
const ohneKommentare = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");

async function wegeAusQuelltext() {
  const wege = new Set();
  for (const datei of (await readdir(FUNKTIONEN)).filter((d) => d.endsWith(".mjs"))) {
    const text = ohneKommentare(await readFile(path.join(FUNKTIONEN, datei), "utf8"));
    const cfg = (text.match(/export const config = \{[\s\S]*?\};/) || [""])[0];
    const muster = [...cfg.matchAll(/"(\/[^"]*)"/g)].map((m) => m[1]);
    const praefixe = muster.filter((p) => p.endsWith("/*")).map((p) => p.slice(0, -1));
    for (const p of muster) if (!p.endsWith("/*")) wege.add(p);
    const teile = new Set();
    for (const m of text.matchAll(/pfad\s*[!=]==\s*"([^"]*)"/g)) teile.add(m[1]);
    for (const m of text.matchAll(/pfad\.startsWith\("([^"]+)"\)/g)) teile.add(m[1].replace(/\/$/, ""));
    for (const m of text.matchAll(/PFADE\s*=\s*\[([\s\S]*?)\]/g))
      for (const n of m[1].matchAll(/"([^"]+)"/g)) teile.add(n[1]);
    for (const t of teile) {
      if (t === "") continue;                                   // Wurzel des Präfixes, steht als config.path
      if (t.startsWith("/")) { wege.add(t); continue; }        // absolute Pfade (anmeldung, registrierung)
      for (const p of praefixe) wege.add(p + t);
    }
    /* Nur Präfix ohne Unterwege (z. B. /starten/*): der Präfix selbst ist ein Weg. */
    if (praefixe.length && !teile.size) for (const p of praefixe) wege.add(p.replace(/\/$/, ""));
  }
  return wege;
}

function matrixHat(matrix, weg) {
  const spannen = [...matrix.matchAll(/`([^`\n]+)`/g)].map((m) => m[1]);
  return spannen.some((s) => s.split(/[\s,]+/).some((wort) => {
    const w = wort.replace(/^(GET|PUT|POST|DELETE)\s*/, "");
    if (w === weg) return true;
    if (w.endsWith("/*")) return weg.startsWith(w.slice(0, -1)) || weg === w.slice(0, -2);
    if (w.startsWith(weg + "/<") || w.startsWith(weg + "?")) return true;   // /kalender/feed/<geheim>.ics
    return false;
  }));
}

describe("Routen-Inventar: jeder Weg hat Matrixzeile und Sonde", () => {
  let wege, matrix, sonden;
  beforeAll(async () => {
    wege = await wegeAusQuelltext();
    matrix = await readFile(path.join(WURZEL, "RECHTEMATRIX.md"), "utf8");
    const pdir = path.join(WURZEL, "pruefungen");
    sonden = {};
    for (const f of (await readdir(pdir)).filter((d) => /\.m?js$/.test(d) && d !== "routen-inventar.test.js"))
      sonden[f] = await readFile(path.join(pdir, f), "utf8");
  });

  it("der Quelltext liefert eine plausible Zahl an Wegen", () => {
    expect(wege.size).toBeGreaterThanOrEqual(40);
  });

  it("jeder Weg im Code steht im Inventar (neuer Weg → Eintrag, Matrixzeile, Sonde)", () => {
    const fehlt = [...wege].filter((w) => !(w in INVENTAR));
    expect(fehlt, "Wege ohne Inventareintrag").toEqual([]);
  });

  it("jeder Inventareintrag gibt es im Code noch", () => {
    const veraltet = Object.keys(INVENTAR).filter((w) => !wege.has(w));
    expect(veraltet, "Inventar enthält Wege, die es nicht mehr gibt").toEqual([]);
  });

  it("jeder Weg hat eine Zeile in RECHTEMATRIX.md oder eine begründete Lücke", () => {
    const ohne = Object.keys(INVENTAR).filter((w) => !matrixHat(matrix, w) && !LUECKEN[w]);
    expect(ohne, "Wege ohne Matrixzeile").toEqual([]);
    const ueberholt = Object.keys(LUECKEN).filter((w) => matrixHat(matrix, w));
    expect(ueberholt, "Lücke geschlossen — aus LUECKEN streichen").toEqual([]);
    expect(Object.keys(LUECKEN).length).toBe(LUECKEN_ANZAHL);
  });

  it("jede genannte Sonde existiert und ruft den Weg auf", () => {
    const fehler = [];
    for (const [weg, dateien] of Object.entries(INVENTAR)) {
      expect(dateien.length, weg).toBeGreaterThan(0);
      const re = new RegExp(weg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?![\\w-])");
      for (const d of dateien) if (!sonden[d] || !re.test(sonden[d])) fehler.push(`${weg} → ${d}`);
    }
    expect(fehler, "Sonde fehlt oder ruft den Weg nicht auf").toEqual([]);
  });
});
