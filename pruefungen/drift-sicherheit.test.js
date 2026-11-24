/* ==========================================================================
   DRIFT SICHERHEIT: SICHERHEIT.md gegen die Konstanten im Code

   Prinzip (Masterprompt V6 Abschnitt 10, Drift Detection): Die Datei
   SICHERHEIT.md nennt Zahlen, die Kunden und Prüfer lesen (Fristen, Zähler,
   Grenzen). Diese Prüfung liest die Zahl aus der Doku UND die Konstante aus dem
   Quelltext und verlangt Gleichheit. Rein lesend, ohne Agent, ohne Netz.

   - Die Doku-Zahl wird per Satzmuster aus SICHERHEIT.md gelesen. Ist der Satz
     umformuliert, ist die Aussage nicht mehr auffindbar und die Prüfung meldet
     das (statt still zu schweigen).
   - Die Code-Konstante wird per Regex aus dem Quelltext gelesen. Nichts wird
     importiert oder neu exportiert, es gibt keine Seiteneffekte.
   - Nur eindeutige Paare sind gebunden. Aussagen ohne genau eine Konstante
     (etwa „87 Tests“) bleiben ungeprüft.
   - Bei Abweichung nennt die Meldung beide Seiten mit Datei:Zeile.
   - Es gibt heute keine bekannte Abweichung. Käme eine, deren Richtung (Doku
     oder Code falsch?) offen ist, gehört sie als Eintrag mit Grund in eine
     Liste `bekannteAbweichung` und die Prüfung muss verlangen, dass sie
     weiter besteht (siehe pruefungen/drift-regelwerk.test.js).
   ========================================================================== */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DOKU = "SICHERHEIT.md";
const lies = (d) => readFileSync(path.join(WURZEL, d), "utf8").replace(/\r\n/g, "\n");

/* ---- Hilfen ------------------------------------------------------------ */

const zeileVon = (text, index) => text.slice(0, index).split("\n").length;
const ZAHLWORT = { zwei: 2, drei: 3, vier: 4, fünf: 5, sechs: 6, zehn: 10 };
const zahl = (s) => (ZAHLWORT[s] ?? Number(String(s).replace(/\./g, "")));

/** Eine Aussage der Doku: die Zahlen der Fangklammern samt Zeile. */
function dokuAussage(muster) {
  const text = lies(DOKU);
  const m = muster.exec(text);
  if (!m) return null;
  return { werte: m.slice(1).map(zahl), zeile: zeileVon(text, m.index), satz: m[0].replace(/\s+/g, " ") };
}

/** Rechnet einen Ausdruck wie `20 * 60 * 1000`. Nur Ziffern, `*`, `_`, `.`. */
function rechne(ausdruck) {
  const sauber = ausdruck.replace(/_/g, "").trim();
  if (!/^[0-9.*\s]+$/.test(sauber)) throw new Error(`Ausdruck nicht lesbar: ${ausdruck}`);
  return sauber.split("*").reduce((p, f) => p * Number(f), 1);
}

/** `const NAME = <Ausdruck>;` samt Zeile. Fehlt sie, bricht die Prüfung mit klarer Meldung ab. */
function konstante(datei, name) {
  const text = lies(datei);
  const m = new RegExp(`(?:^|\\n)\\s*(?:export\\s+)?const\\s+${name}\\s*=\\s*([0-9_.*\\s]+?)\\s*;`).exec(text);
  if (!m) throw new Error(`${datei}: Konstante ${name} nicht gefunden (umbenannt? dann Prüfung und Doku nachziehen)`);
  const index = m.index + m[0].indexOf(m[1]);
  return { wert: rechne(m[1]), stelle: `${datei}:${zeileVon(text, index)}`, name };
}

/** Ein Feld eines Eintrags `schluessel: { … }` innerhalb eines Blocks (ab `start` bis `\n};`). */
function blockEintrag(datei, start, schluessel, feld) {
  const text = lies(datei);
  const von = text.indexOf(start);
  if (von < 0) throw new Error(`${datei}: Block "${start}" nicht gefunden`);
  const bis = text.indexOf("\n};", von);
  const zeilen = text.slice(von, bis < 0 ? undefined : bis).split("\n");
  const sk = schluessel.replace(/-/g, "\\-");
  const kopf = new RegExp(`^\\s*(?:"${sk}"|${sk}):\\s*\\{`);
  const i = zeilen.findIndex((z) => kopf.test(z));
  if (i < 0) throw new Error(`${datei}: Eintrag ${schluessel} in "${start}" nicht gefunden`);
  const eintrag = `${zeilen[i]} ${zeilen[i + 1] || ""}`; /* ein Eintrag kann über zwei Zeilen laufen */
  const f = new RegExp(`\\b${feld}:\\s*([0-9_]+)`).exec(eintrag);
  if (!f) throw new Error(`${datei}: Feld ${feld} im Eintrag ${schluessel} nicht gefunden`);
  return { wert: Number(f[1].replace(/_/g, "")), stelle: `${datei}:${zeileVon(text, von) + i}`, name: `${schluessel}.${feld}` };
}

/** Ein Eintrag der Liste MENGEN in gestalt.mjs (mehrere `name: n,` je Zeile). */
function mengenEintrag(name) {
  const text = lies(GESTALT);
  const von = text.indexOf("const MENGEN = {");
  if (von < 0) throw new Error(`${GESTALT}: MENGEN nicht gefunden`);
  const ende = text.indexOf("};", von);
  const m = new RegExp(`\\b${name}:\\s*([0-9_]+)`).exec(text.slice(von, ende));
  if (!m) throw new Error(`${GESTALT}: MENGEN.${name} nicht gefunden`);
  const index = von + text.slice(von).indexOf(m[0]);
  return { wert: Number(m[1].replace(/_/g, "")), stelle: `${GESTALT}:${zeileVon(text, index)}`, name: `MENGEN.${name}` };
}

/** Die Prüfung: Doku-Zahl (Fangklammer `index`) gegen eine oder mehrere Code-Stellen. */
function paare(titel, muster, bindungen) {
  it(titel, () => {
    const a = dokuAussage(muster);
    expect(a, `${DOKU}: Aussage nicht mehr auffindbar (Satz umformuliert?): ${muster}`).not.toBeNull();
    const abweichungen = [];
    for (const b of bindungen) {
      const c = b();
      const doku = a.werte[c.index ?? 0];
      if (doku !== c.wert) {
        abweichungen.push(`${DOKU}:${a.zeile} sagt ${doku} („${a.satz}“), ${c.stelle} (${c.name}) ist ${c.wert}`);
      }
    }
    expect(abweichungen, `Abweichung zwischen Doku und Code:\n${abweichungen.join("\n")}`).toEqual([]);
  });
}

/** Bindung an `const NAME = …;`, Wert durch `teiler` (Millisekunden in Minuten usw.). */
const konst = (datei, name, teiler, index = 0) => () => {
  const c = konstante(datei, name);
  return { ...c, wert: c.wert / teiler, index };
};
/** Bindung an ein Feld eines Eintrags in GRENZEN oder NOTGRENZEN (schutz.mjs). */
const grenze = (block, schluessel, feld, teiler, index = 0) => () => {
  const c = blockEintrag("server/lib/schutz.mjs", block, schluessel, feld);
  return { ...c, wert: c.wert / teiler, index };
};
const menge = (name) => () => mengenEintrag(name);

const MIN = 60 * 1000;
const STD = 60 * MIN;
const SITZ = "server/lib/sitzungen.mjs";
const KONTO = "server/lib/accountsitzungen.mjs";
const DATEN = "server/funktionen/daten.mjs";
const DURCH = "server/lib/schutzdurchsetzung.mjs";
const GESTALT = "server/lib/gestalt.mjs";
const GR = "export const GRENZEN = {";
const NOT = "export const NOTGRENZEN = {";

describe("SICHERHEIT.md gegen Konstanten: Sitzungen und frische Anmeldung", () => {
  paare("frische Anmeldung: 20 Minuten = FRISCH in daten.mjs",
    /Anmeldung, die jünger als (\d+) Minuten ist/,
    [konst(DATEN, "FRISCH", MIN)]);

  paare("Betreibersitzung nach 2 h (Zeile Privilegierte Aktionen) = DAUER_BETREIBER",
    /Betreibersitzungen laufen nach (\d+) h ab/,
    [konst(SITZ, "DAUER_BETREIBER", STD)]);

  paare("12 h absolut = DAUER_STANDARD und DAUER des Kontos",
    /(\d+) h absolut, \d+ min Untätigkeit, Betreiber \d+ h/,
    [konst(SITZ, "DAUER_STANDARD", STD), konst(KONTO, "DAUER", STD)]);

  paare("30 min Untätigkeit = RUHE bei Arbeits- und Kontositzung",
    /\d+ h absolut, (\d+) min Untätigkeit, Betreiber \d+ h/,
    [konst(SITZ, "RUHE", MIN), konst(KONTO, "RUHE", MIN)]);

  paare("Betreiber 2 h (Zeile Sitzungen) = DAUER_BETREIBER",
    /\d+ h absolut, \d+ min Untätigkeit, Betreiber (\d+) h/,
    [konst(SITZ, "DAUER_BETREIBER", STD)]);
});

describe("SICHERHEIT.md gegen schutz.mjs: Brute Force", () => {
  paare("Anmelden 8/5 min = GRENZEN.anmelden (Versuche, Fenster)",
    /Anmelden (\d+)\/(\d+) min/,
    [grenze(GR, "anmelden", "versuche", 1, 0), grenze(GR, "anmelden", "fenster", 60, 1)]);

  paare("Einrichten 5/10 min = GRENZEN.einrichten",
    /Einrichten (\d+)\/(\d+) min/,
    [grenze(GR, "einrichten", "versuche", 1, 0), grenze(GR, "einrichten", "fenster", 60, 1)]);

  paare("Selbststart 3/h = GRENZEN.starten (Versuche; das Fenster ist eine Stunde)",
    /Selbststart (\d+)\/h\b/,
    [grenze(GR, "starten", "versuche", 1)]);

  it("Selbststart je Stunde: das Fenster von GRENZEN.starten ist genau eine Stunde", () => {
    const c = blockEintrag("server/lib/schutz.mjs", GR, "starten", "fenster");
    expect(c.wert, `${c.stelle}: ${DOKU} sagt „Selbststart 3/h“, das Fenster ist ${c.wert} s`).toBe(3600);
  });

  paare("Stempeln 10/min je Person = GRENZEN.stempeln",
    /Stempeln (\d+)\/min je Person/,
    [grenze(GR, "stempeln", "versuche", 1)]);

  paare("gelungene Anmeldungen 1000/5 min je Betrieb = GRENZEN[anmelden-erfolg]",
    /gelungene Anmeldungen (\d+)\/(\d+) min je Betrieb/,
    [grenze(GR, "anmelden-erfolg", "versuche", 1, 0), grenze(GR, "anmelden-erfolg", "fenster", 60, 1)]);

  paare("Notbremse: 20 je Herkunft, 200 insgesamt, fünf Minuten = NOTGRENZEN[anmelden-konto]",
    /(\d+) Versuche je Herkunft und (\d+) Fehlversuche insgesamt, je\s+(fünf|zehn|drei) Minuten/,
    [grenze(NOT, "anmelden-konto", "versuche", 1, 0), grenze(NOT, "anmelden-konto", "gesamt", 1, 1),
      grenze(NOT, "anmelden-konto", "fenster", 60, 2)]);
});

describe("SICHERHEIT.md gegen Konstanten: Server-Grenzen", () => {
  paare("Rumpf höchstens 6 MB = RUMPF_MAX",
    /Rumpf höchstens (\d+) MB/,
    [konst(DATEN, "RUMPF_MAX", 1024 * 1024)]);

  paare("Schrumpfung über 34 % = SICHERUNGSSCHWELLE",
    /Schrumpfung über (\d+) %/,
    [() => {
      const text = lies(GESTALT);
      const m = /export const SICHERUNGSSCHWELLE\s*=\s*([0-9.]+)\s*;/.exec(text);
      if (!m) throw new Error(`${GESTALT}: SICHERUNGSSCHWELLE nicht gefunden`);
      return { wert: Math.round(Number(m[1]) * 100), stelle: `${GESTALT}:${zeileVon(text, m.index)}`, name: "SICHERUNGSSCHWELLE (in Prozent)" };
    }]);

  paare("höchstens 100.000 Zeichen je Feld = TEXT_MAX",
    /höchstens ([\d.]+) Zeichen je Feld/,
    [konst(GESTALT, "TEXT_MAX", 1)]);

  paare("etwa 20.000 Personen = MENGEN.personen",
    /\(etwa ([\d.]+) Personen, \d+ Dienstarten\)/,
    [menge("personen")]);

  paare("500 Dienstarten = MENGEN.dienstarten",
    /\(etwa [\d.]+ Personen, (\d+) Dienstarten\)/,
    [menge("dienstarten")]);

  paare("Nachrechnung bricht nach 8 s ab = ZEITBUDGET_MS",
    /bricht nach (\d+) s mit 503 ab/,
    [konst(DURCH, "ZEITBUDGET_MS", 1000)]);

  paare("10 Strukturänderungen je Minute = STRUKTUR_JE_MINUTE",
    /(\d+) Strukturänderungen je Minute/,
    [konst(DURCH, "STRUKTUR_JE_MINUTE", 1)]);

  paare("Fachprüfung 120 Tage voraus = SCHUTZ_HORIZONT_TAGE",
    /\((\d+) Tage voraus, nur geänderte Einteilungen\)/,
    [konst(DURCH, "SCHUTZ_HORIZONT_TAGE", 1)]);

  paare("Event-Loop-Abgabe: höchstens N ms am Stück = HAEPPCHEN_MS",
    /höchstens (\d+) ms am Stück/,
    [konst(DURCH, "HAEPPCHEN_MS", 1)]);
});
