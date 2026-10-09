/* ==========================================================================
   INVENTAR DER SITZUNGS-ZUGRIFFE

   Phase A.1, TEST-FIRST (Befund F3 und seine Ursache).

   F3 ist entstanden, weil jeder Pfad seine Sitzung selbst lesen durfte: Vier
   Dateien haben eine eigene Fassung des Lesens, und fünf Pfade in daten.mjs
   lasen die Sitzung roh, ohne die fachliche Prüfung. Der bisherige Test
   (arbeitssitzung.test.js) hält nur fest, welche DATEIEN eine Sitzung lesen
   und dass jede die Prüfung irgendwo benutzt — er sieht nicht, dass ein
   einzelner Pfad innerhalb einer Datei daran vorbeiläuft.

   Dieser Test legt fest, wer wo lesen darf. Er ist absichtlich eng: Eine
   neue Lesestelle lässt ihn scheitern, und wer sie bewusst einführt, trägt
   sie hier ein — mit Begründung. Das ist der Sinn.

   Statisch geprüft wird der Quelltext von server/ und server.mjs, ohne
   Kommentare. Dynamisch (Schreiber der Autoritätsdatensätze) prüfen
   sitzungsrennen.test.js und sitzungsbindung.test.js.
   ========================================================================== */

import { describe, it, expect, beforeAll } from "vitest";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const WURZEL = path.resolve(new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const quellen = new Map(); // relativer Pfad (mit /) -> Text ohne Kommentare

const ohneKommentare = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n").filter((z) => !/^\s*\/\//.test(z)).join("\n");

async function sammeln(rel) {
  const abs = path.join(WURZEL, rel);
  for (const n of await readdir(abs)) {
    const r = `${rel}/${n}`;
    if ((await stat(path.join(WURZEL, r))).isDirectory()) await sammeln(r);
    else if (n.endsWith(".mjs")) quellen.set(r, ohneKommentare(await readFile(path.join(WURZEL, r), "utf8")));
  }
}

beforeAll(async () => {
  await sammeln("server");
  quellen.set("server.mjs", ohneKommentare(await readFile(path.join(WURZEL, "server.mjs"), "utf8")));
});

/** Alle Dateien, deren Text `muster` enthält. */
const dateienMit = (muster) => [...quellen.entries()]
  .filter(([, t]) => muster.test(t)).map(([p]) => p).sort();

/** Dateien, die der Fix hinzufügen darf, ohne dass der Inventartest sie als
    „neue Lesestelle" beanstandet: der zentrale Prüfpunkt und der Aufräumlauf.
    Alles andere muss bewusst hier eingetragen werden. */
const ZUSATZ = ["server/lib/arbeitssitzung.mjs", "server/lib/sitzungsaufraeumen.mjs"];
const ohneZusatz = (liste) => liste.filter((p) => !ZUSATZ.includes(p));

/* ==========================================================================
   WER DARF DEN KOPF `authorization` LESEN
   ========================================================================== */

describe("Wer liest das Arbeitsmerkmal aus dem Kopf?", () => {
  it("nur die zentrale Primitive; sonst nur, wer ein ANDERES Geheimnis meint", () => {
    /* Bekannt und begründet:
         lib/sitzungen.mjs     die Primitive (merkmalAus)
         funktionen/einrichten.mjs   Verwaltungsschlüssel (kein Sitzungsmerkmal)
         lib/post.mjs, lib/schutz.mjs  ausgehende Aufrufe (Mailversand, Redis) */
    expect(dateienMit(/authorization/i)).toEqual([
      "server/funktionen/einrichten.mjs",
      "server/lib/post.mjs",
      "server/lib/schutz.mjs",
      "server/lib/sitzungen.mjs",
    ]);
  });
});

/* ==========================================================================
   WER DARF DIE SITZUNGSSPEICHER ANSPRECHEN
   ========================================================================== */

describe("Wer spricht die Sitzungsspeicher an?", () => {
  it("centric-sitzungen: nur Primitive, Prüfpunkt, Aufräumen, Raumlöschung, daten.mjs (sk:)", () => {
    expect(ohneZusatz(dateienMit(/centric-sitzungen|sitzungsSpeicher/))).toEqual([
      "server.mjs",                              // Verdrahtung des Löschlaufs
      "server/funktionen/daten.mjs",             // sk:-Schlüssel und das Beenden gesperrter Sitzungen
      "server/lib/sitzungen.mjs",                // die Primitive
    ]);
  });

  it("centric-accountsitzungen: nur die Account-Sitzungen selbst (und das Aufräumen)", () => {
    const erlaubt = [
      "server/lib/accountsitzungen.mjs",
    ];
    const gefunden = ohneZusatz(dateienMit(/centric-accountsitzungen|accountSitzungsSpeicher/));
    expect(gefunden).toEqual(erlaubt);
  });

  it("die Schlüsselpräfixe t:, sk:, as: stehen nur an den bekannten Stellen", () => {
    const t = ohneZusatz(dateienMit(/[`"']t:/));
    const sk = dateienMit(/[`"']sk:/);
    const as = ohneZusatz(dateienMit(/[`"']as:/));
    /* t: — Primitive und Raumlöschung; nie in einem Endpunkt. */
    expect(t, "t:").toEqual(["server/lib/raumloeschung.mjs", "server/lib/sitzungen.mjs"]);
    /* sk: — Primitive, daten.mjs (Sicherungsschlüssel verwalten), Raumlöschung. */
    expect(sk, "sk:").toEqual(["server/funktionen/daten.mjs", "server/lib/raumloeschung.mjs",
      "server/lib/sitzungen.mjs"]);
    expect(as, "as:").toEqual(["server/lib/accountsitzungen.mjs"]);
  });
});

describe("Der Aufräumlauf", () => {
  it("rührt Sicherungsschlüssel (sk:), Spur und stufe: nicht an", () => {
    const t = quellen.get("server/lib/sitzungsaufraeumen.mjs");
    if (t === undefined) return; // noch nicht vorhanden: der Verhaltenstest gilt
    expect(t).not.toMatch(/[`"']sk:/);
    expect(t).not.toMatch(/centric-spur/);
    expect(t).not.toMatch(/[`"']stufe:/);
  });
});

/* ==========================================================================
   JEDE LESESTELLE LÄUFT DURCH DEN GEMEINSAMEN PRÜFPUNKT
   ========================================================================== */

describe("Der gemeinsame Prüfpunkt", () => {
  const BEARER_DATEIEN = [
    "server/funktionen/daten.mjs",
    "server/funktionen/kalender.mjs",
    "server/funktionen/lage.mjs",
    "server/funktionen/zustellung.mjs",
  ];

  it("kein Endpunkt hat eine eigene Fassung des Lesens (sitzungLesen / sitzung(req))", () => {
    const eigene = dateienMit(/\bsitzungLesen\b|\bsitzung\(req\)|async function sitzung\(/)
      .filter((p) => p.startsWith("server/funktionen/"));
    expect(eigene).toEqual([]);
  });

  it("jede Datei mit Bearer-Zugriff benutzt den zentralen Leser", () => {
    for (const d of BEARER_DATEIEN) {
      expect(quellen.get(d), d).toMatch(/arbeitssitzungLesen/);
    }
  });

  it("in daten.mjs liest keine Stelle die Sitzung roh: jede Quelle ist der zentrale Leser", () => {
    const t = quellen.get("server/funktionen/daten.mjs");
    expect(t).not.toMatch(/\bsitzungLesen\b/);
    expect(t).not.toMatch(/\bsitzung\(req\)/);
    /* Jede Stelle, die eine Sitzung beurteilt, hat sie aus dem zentralen Leser:
       die fünf Pfade vor dem Hauptpfad (zugaenge, raum-loeschen,
       zugaenge-uebersicht, zugang-sperren, bestand-anlegen) und der Hauptpfad
       selbst. Kommt ein Pfad dazu, ändert sich diese Zahl — und wer sie ändert,
       sieht hier, dass der neue Pfad den Prüfpunkt braucht. */
    const aufrufe = t.match(/await arbeitssitzungLesen\(/g) || [];
    expect(aufrufe.length, "Aufrufe des zentralen Lesers in daten.mjs").toBe(6);
    /* Und jede Sitzung der Pfade davor wird aus dem Ergebnis des Lesers
       genommen, nicht anders gewonnen. */
    const sBQuellen = [...t.matchAll(/const sB = ([^;\n]+);/g)].map((m) => m[1]);
    expect(sBQuellen.length, "Stellen mit sB").toBeGreaterThanOrEqual(5);
    expect([...new Set(sBQuellen)]).toEqual(["lB.sitzung"]);
  });

  it("die Sitzung eines Endpunkts kommt nie aus einem eigenen Speicherzugriff", () => {
    for (const d of ["server/funktionen/kalender.mjs", "server/funktionen/lage.mjs",
      "server/funktionen/zustellung.mjs"]) {
      expect(quellen.get(d), d).not.toMatch(/centric-sitzungen/);
      expect(quellen.get(d), d).not.toMatch(/[`"']t:/);
    }
  });

  it("der zentrale Leser und die Prüfung liegen in arbeitssitzung.mjs", () => {
    const t = quellen.get("server/lib/arbeitssitzung.mjs");
    expect(t).toMatch(/export async function arbeitssitzungLesen/);
    expect(t).toMatch(/export async function arbeitssitzungPruefen/);
  });
});

/* ==========================================================================
   WER SCHREIBT AUTORITÄTSDATENSÄTZE
   ========================================================================== */

describe("Schreiber der Autoritätsdatensätze (statisch)", () => {
  const schreibenAuf = (muster) => [...quellen.entries()]
    .filter(([, t]) => new RegExp(String.raw`setJSON\(\s*${muster}`).test(t)).map(([p]) => p).sort();

  it("setJSON auf t:-Schlüssel gibt es nur in der Primitive", () => {
    expect(schreibenAuf(String.raw`[\`"']t:`)).toEqual(["server/lib/sitzungen.mjs"]);
  });

  it("setJSON auf as:-Schlüssel gibt es nur in den Account-Sitzungen", () => {
    expect(schreibenAuf(String.raw`(?:[\`"']as:|accountSitzungsSchluessel\()`))
      .toEqual(["server/lib/accountsitzungen.mjs"]);
  });

  it("die Datei der Primitive hat keinen Schreibvorgang, der einen gelesenen Datensatz zurückschreibt", () => {
    /* Das Muster des Befunds: `setJSON(<schluessel>, { ...s, zuletzt: … })` mit
       dem gelesenen Datensatz `s`. Aktivität wird in eigene Schlüssel
       geschrieben, nie in den Autoritätsdatensatz. */
    for (const d of ["server/lib/sitzungen.mjs", "server/lib/accountsitzungen.mjs"]) {
      expect(quellen.get(d), d).not.toMatch(/\{\s*\.\.\.s\s*,\s*zuletzt/);
    }
  });
});
