/* ==========================================================================
   DRIFT REGELWERK: docs/REGELWERK-REGISTRY.md gegen Dateien, Skripte, Stand

   Prinzip (Masterprompt V6 Abschnitt 10, Drift Detection): Die Registry-Doku
   behauptet, welche Dateien die Regelmaschine bilden, welche Prüfungen es gibt
   und nach welcher Fassung (`REGELSTAND`) gerechnet wird. Diese Prüfung liest
   Doku UND Quellbaum und verlangt, dass beides zusammenpasst. Rein lesend,
   ohne Agent, ohne Netz.

   1. Jede in der Doku genannte Datei gibt es (Pfad mit Ordner, oder nur der
      Name: dann in Wurzel, src, server/lib, pruefungen oder docs).
   2. Jede Regelwerk-Datei im Quellbaum (`src/regel*.js`,
      `server/lib/regel*.mjs`) steht in der Doku. Die Doku fordert „genau eine
      Regelmaschine“: eine zweite, nicht genannte Datei ist ein Befund.
   3. Jedes in der Doku genannte Skript (`npm run X`, `pruefung:X`) steht in
      package.json.
   4. `REGELSTAND` (Version, Stand, Quellenstand) in der Doku = Quelltext, und
      `src/regelwerk.js` reicht die Datei mit `REGELSTAND` weiter.
   5. Die Zahl „N Regeln ohne Fundstelle“ = Zählung im Register.

   bekannteAbweichung: Abweichung, deren Richtung (Doku oder Code falsch?)
   noch niemand entschieden hat. Sie wird nicht versteckt: Die Prüfung
   verlangt, dass sie weiter besteht. Wird sie behoben, wird der Eintrag rot
   und muss gestrichen werden.
   ========================================================================== */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { REGELN } from "../src/regelregister.js";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DOKU = "docs/REGELWERK-REGISTRY.md";
const lies = (d) => readFileSync(path.join(WURZEL, d), "utf8").replace(/\r\n/g, "\n");
const doku = lies(DOKU);
const zeileVon = (text, index) => text.slice(0, index).split("\n").length;

/* ---- bekannte Abweichungen --------------------------------------------- */
/* Regelwerk-Dateien ohne Nennung in der Doku. Richtung offen: Die Doku (Zeile 43) nennt Muster-, Block-,
   Verteilungs- und Wunschregel „geplant, nicht gerechnet“; `server/lib/regelbaukasten-erweitert.mjs` (WP-I3)
   rechnet sie. Ob die Doku nachzuziehen oder die Datei noch nicht angeschlossen ist, hat niemand entschieden.
   Stand 2026-11-24, gefunden von dieser Prüfung. */
const bekannteAbweichung = [
  { datei: "server/lib/regelbaukasten-erweitert.mjs",
    grund: "Doku Zeile 43 nennt Muster-/Block-/Verteilungs-/Wunschregel noch „geplant“; Datei (WP-I3) existiert; Anschluss und Doku-Nachzug offen" },
  { datei: "server/lib/regelstatus.mjs",
    grund: "kanonische Darstellung des Prüfstatus (WP-19.0); in der Doku nirgends genannt; Doku-Nachzug offen" },
];

/* ---- Hilfen ------------------------------------------------------------ */

const regelDateien = () => [
  ...readdirSync(path.join(WURZEL, "src")).filter((f) => /^regel.*\.js$/.test(f)).map((f) => `src/${f}`),
  ...readdirSync(path.join(WURZEL, "server/lib")).filter((f) => /^regel.*\.mjs$/.test(f)).map((f) => `server/lib/${f}`),
].sort();

/** Alle in Rückstrichen genannten Dateinamen der Doku samt Zeile. */
function genannteDateien(text) {
  const aus = [];
  for (const m of text.matchAll(/`([A-Za-z0-9_./-]+\.(?:js|mjs|md|json|yml|sh))`/g)) {
    aus.push({ name: m[1], zeile: zeileVon(text, m.index) });
  }
  return aus;
}

const SUCHORDNER = ["", "src", "server/lib", "pruefungen", "docs"];
const gefunden = (name) => (name.includes("/")
  ? existsSync(path.join(WURZEL, name))
  : SUCHORDNER.some((o) => existsSync(path.join(WURZEL, o, name))));

describe("Registry-Doku gegen Dateien", () => {
  it("jede in der Doku genannte Datei gibt es", () => {
    const genannt = genannteDateien(doku);
    expect(genannt.length, `${DOKU}: keine Dateinamen gefunden (Format geändert?)`).toBeGreaterThan(15);
    const fehlend = genannt.filter((d) => !gefunden(d.name)).map((d) => `${DOKU}:${d.zeile} nennt ${d.name}, die Datei gibt es nicht`);
    expect(fehlend, fehlend.join("\n")).toEqual([]);
  });

  it("die Dateitabelle (Abschnitt Code) nennt mindestens die Kerndateien der Regelmaschine", () => {
    const kopf = doku.indexOf("\nCode:\n");
    const ende = doku.indexOf("\nPrüfungen:", kopf);
    expect(kopf, `${DOKU}: Abschnitt „Code:“ nicht gefunden`).toBeGreaterThan(0);
    const tabelle = doku.slice(kopf, ende);
    for (const d of ["src/regelregister.js", "server/lib/regelbaukasten.mjs", "server/lib/regelgeltung.mjs", "src/regelwerk.js"]) {
      expect(tabelle, `${DOKU}: Dateitabelle nennt ${d} nicht mehr`).toContain(d);
      expect(existsSync(path.join(WURZEL, d)), `${d} gibt es nicht`).toBe(true);
    }
  });

  it("jede Regelwerk-Datei im Quellbaum steht in der Doku (außer bekannteAbweichung)", () => {
    const ausnahmen = new Set(bekannteAbweichung.map((a) => a.datei));
    const nichtGenannt = regelDateien()
      .filter((d) => !doku.includes(path.basename(d)))
      .filter((d) => !ausnahmen.has(d))
      .map((d) => `${d} liegt im Quellbaum, steht aber nicht in ${DOKU} („genau eine Regelmaschine“: Datei in die Tabelle aufnehmen oder entfernen)`);
    expect(nichtGenannt, nichtGenannt.join("\n")).toEqual([]);
  });

  it("bekannteAbweichung: jeder Eintrag besteht noch, hat einen Grund und eine vorhandene Datei", () => {
    for (const a of bekannteAbweichung) {
      expect(a.grund, `Eintrag ohne Grund: ${a.datei}`).toBeTruthy();
      expect(existsSync(path.join(WURZEL, a.datei)), `${a.datei} gibt es nicht mehr: Eintrag streichen`).toBe(true);
      expect(doku.includes(path.basename(a.datei)),
        `${a.datei} steht jetzt in ${DOKU}: Eintrag aus bekannteAbweichung streichen`).toBe(false);
    }
  });
});

describe("Registry-Doku gegen package.json", () => {
  const skripte = JSON.parse(lies("package.json")).scripts;

  it("jedes genannte npm-Skript gibt es", () => {
    const genannt = [];
    for (const m of doku.matchAll(/npm run ([a-z0-9:-]+)/g)) genannt.push({ name: m[1], zeile: zeileVon(doku, m.index) });
    for (const m of doku.matchAll(/`(pruefung:[a-z0-9-]+)`/g)) genannt.push({ name: m[1], zeile: zeileVon(doku, m.index) });
    expect(genannt.length, `${DOKU}: keine Skripte gefunden (Format geändert?)`).toBeGreaterThan(4);
    const fehlend = genannt.filter((g) => !(g.name in skripte))
      .map((g) => `${DOKU}:${g.zeile} nennt Skript ${g.name}, package.json kennt es nicht`);
    expect(fehlend, fehlend.join("\n")).toEqual([]);
  });
});

describe("Registry-Doku gegen REGELSTAND und Register", () => {
  const QUELLE = "server/lib/regelwerk.mjs";
  const quelle = lies(QUELLE);
  const feld = (name) => {
    const m = new RegExp(`\\n\\s*${name}:\\s*"([^"]+)"`).exec(quelle);
    if (!m) throw new Error(`${QUELLE}: REGELSTAND.${name} nicht gefunden`);
    return { wert: m[1], stelle: `${QUELLE}:${zeileVon(quelle, m.index + 1)}` };
  };

  it("src/regelwerk.js reicht die Datei mit REGELSTAND weiter (die Doku verortet REGELSTAND dort)", () => {
    expect(lies("src/regelwerk.js")).toMatch(/export \* from "\.\.\/server\/lib\/regelwerk\.mjs"/);
    expect(quelle).toMatch(/export const REGELSTAND = \{/);
    expect(doku).toContain("`REGELSTAND.version` in `src/regelwerk.js`");
  });

  it("Version in der Doku = REGELSTAND.version", () => {
    const m = /`REGELSTAND\.version`\s+\*\*(\d{4}\.\d{2})\*\*/.exec(doku);
    expect(m, `${DOKU}: Aussage „REGELSTAND.version **JJJJ.MM**“ nicht auffindbar`).not.toBeNull();
    const c = feld("version");
    expect(m[1], `${DOKU}:${zeileVon(doku, m.index)} sagt ${m[1]}, ${c.stelle} ist ${c.wert}`).toBe(c.wert);
    const m2 = /Regelstand (\d{4}\.\d{2})\b/.exec(doku);
    expect(m2, `${DOKU}: „Regelstand JJJJ.MM“ nicht auffindbar`).not.toBeNull();
    expect(m2[1], `${DOKU}:${zeileVon(doku, m2.index)} sagt ${m2[1]}, ${c.stelle} ist ${c.wert}`).toBe(c.wert);
  });

  it("Rechtsstand und Quellenstand in der Doku = REGELSTAND.stand und quellenstand", () => {
    const m = /`stand`\s+\*\*(\d{4}-\d{2}-\d{2})\*\*/.exec(doku);
    expect(m, `${DOKU}: Aussage „stand **JJJJ-MM-TT**“ nicht auffindbar`).not.toBeNull();
    const s = feld("stand");
    expect(m[1], `${DOKU}:${zeileVon(doku, m.index)} sagt ${m[1]}, ${s.stelle} ist ${s.wert}`).toBe(s.wert);
    const q = /\*\*(\d{4}-\d{2}-\d{2})\*\*\s+vervollständigt\s+\(`quellenstand`\)/.exec(doku);
    expect(q, `${DOKU}: Aussage „**JJJJ-MM-TT** vervollständigt (quellenstand)“ nicht auffindbar`).not.toBeNull();
    const c = feld("quellenstand");
    expect(q[1], `${DOKU}:${zeileVon(doku, q.index)} sagt ${q[1]}, ${c.stelle} ist ${c.wert}`).toBe(c.wert);
  });

  it("die Zahl der Regeln ohne Fundstelle in der Doku = Zählung im Register", () => {
    const m = /tragen (\d+) Regeln keine Fundstelle/.exec(doku);
    expect(m, `${DOKU}: Aussage „tragen N Regeln keine Fundstelle“ nicht auffindbar`).not.toBeNull();
    const ohne = REGELN.filter((r) => !(r.fundstelle && String(r.fundstelle).trim())).length;
    expect(Number(m[1]), `${DOKU}:${zeileVon(doku, m.index)} sagt ${m[1]}, src/regelregister.js hat ${ohne} Regeln ohne Fundstelle`).toBe(ohne);
  });
});
