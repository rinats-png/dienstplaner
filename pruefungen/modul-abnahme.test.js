/* WP-19.13 (Teil): Abnahmematrix der zwoelf Branchenmodule, Server-Seite.
   Rechnet je Modul, Feld und Rolle (pruefungen/hilfen/modulabnahme.mjs) und prueft:
     (a) Registry „geplant“ (echt): Schreiben aller Module mit Betriebsfeld (R-9) geschlossen, nichts gespeichert —
         seit WP-19 B1 auch die fuenf aelteren Module (Registerwache server/lib/modul-altwege.mjs).
     (b) Pruefmodus (Registry nur in der Testhilfe „vorlaeufig“): genau die dokumentierte vorlaeufige Rechtematrix
         (wp19-offene-fragen-agent.md R-1 bis R-4, R-8), wo offen: das strengste heutige Verhalten.
     (c) Lesen je Rolle (R-3), kein Leck in einen anderen Betrieb, Betreiber ohne Moduldaten.
     (d) Die Tabelle in docs/acc45/WP-19-MODULABNAHME.md ist genau diese Rechnung (kein Abweichen). Neu erzeugen:
         MODULABNAHME_SCHREIBEN=1 npx vitest run pruefungen/modul-abnahme.test.js pruefungen/modul-abnahme-oberflaeche.test.js
   Die Registry in server/lib/branchenmodule.mjs wird nie veraendert. Aufruf: npm run pruefung:modulabnahme */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { BRANCHENMODULE, pruefeModulStatus } from "../server/lib/branchenmodule.mjs";
import { MODUL_OBERFLAECHEN } from "../src/module/index.js";
import { berechneMatrix, matrixMarkdown, zugriffMarkdown, ROLLEN, FELDER, PRUEF_LISTE, blockPruefen, blockLesen } from "./hilfen/modulabnahme.mjs";

const zeilen = berechneMatrix();
const zeile = (feld, art) => zeilen.find((x) => x.feld === feld && x.art === art);
const zelle = (feld, art, k) => zeile(feld, art).zellen[k];
const doc = () => readFileSync(new URL("../docs/acc45/WP-19-MODULABNAHME.md", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const lies = (n) => readFileSync(new URL(`../docs/acc45/${n}`, import.meta.url), "utf8");

const IDS = ["posten", "wachbuch", "objektbericht", "bereichsplan", "pflegequal", "bereitschaftsdienst", "geteilterdienst", "funktionsdienst", "rotation",
  "anlagen", "maschinenqual", "kontimodelle"];
const OHNE_WIRKUNG = ["wirkungslos", "abgewiesen"];

describe("Umfang und Status: nichts eingeschaltet", () => {
  it("die zwölf Module der Registry sind genau die der Matrix; alle „geplant“, ohne Abnahme (Status ändert nur der Betreiber, G8)", () => {
    expect(BRANCHENMODULE.map((x) => x.id)).toEqual(IDS);
    for (const x of BRANCHENMODULE) { expect(x.status, x.id).toBe("geplant"); expect(x.abnahme, x.id).toBeUndefined(); }
    expect(pruefeModulStatus()).toEqual([]);
    expect(new Set(FELDER.map((f) => f.modul))).toEqual(new Set(IDS));
    expect(new Set(MODUL_OBERFLAECHEN.map((o) => o.modul))).toEqual(new Set(IDS));
  });
  it("der Prüfmodus ist eine Kopie nur der Testhilfe: alle „vorlaeufig“, die Registry selbst unverändert", () => {
    expect(PRUEF_LISTE.every((x) => x.status === "vorlaeufig")).toBe(true);
    expect(BRANCHENMODULE.every((x) => x.status === "geplant")).toBe(true);
    expect(Object.isFrozen(BRANCHENMODULE)).toBe(true);
  });
  it("die Matrix deckt jedes Betriebsfeld der Module und alle zehn Rollenspalten ab", () => {
    const felder = new Set(BRANCHENMODULE.flatMap((x) => x.datenfelder));
    for (const f of felder) expect(zeilen.some((z) => z.feld === f), `Feld ${f}`).toBe(true);
    expect(ROLLEN.map((r) => r.k)).toEqual(["LT", "PL", "SV", "MA", "BR", "KD", "BT", "DL", "DP", "AB"]);
    for (const z of zeilen) expect(Object.keys(z.zellen)).toEqual(ROLLEN.map((r) => r.k));
    expect(zeilen.length).toBe(13 * 3 + 1);
  });
});

describe("(a) Registry „geplant“: Schreiben geschlossen, nichts gespeichert (R-9)", () => {
  const geplant = zeilen.filter((z) => z.art === "schreiben-geplant");
  it("registergesteuerte Module (alle mit Betriebsfeld): kein Schreiben, keine Rolle, auch nicht die Leitung", () => {
    expect(geplant.every((x) => x.register), "jede Zeile fragt das Register").toBe(true);
    for (const z of geplant.filter((x) => x.register))
      for (const k of Object.keys(z.zellen)) expect(OHNE_WIRKUNG, `${z.feld} ${k}`).toContain(z.zellen[k]);
    for (const feld of ["bereitschaftStufen", "bereitschaft", "funktionsbereiche", "funktionsPlan", "rotationen", "pflegeNiveaus", "wachbuch"])
      expect(zelle(feld, "schreiben-geplant", "LT")).toBe("abgewiesen");
  });
  it("Befund B1 (behoben): die fünf älteren Module (Posten, Bereichsplan, geteilte Dienste, Anlagen, Maschinenqualifikation) fragen das Register — "
    + "bei „geplant“ speichert keine Rolle, auch nicht Leitung, Kundenrolle, Demo oder die Schichtverantwortung im Bereichsplan", () => {
    const betroffen = ["objekte", "postenPlan", "bereichsPlan", "dienstarten", "betriebsmittel", "kompetenzen"];
    for (const feld of betroffen) {
      for (const k of ["LT", "PL", "SV", "KD", "DL", "DP"]) expect(zelle(feld, "schreiben-geplant", k), `B1 ${feld} ${k}`).toBe("abgewiesen");
      for (const k of ROLLEN.map((r) => r.k)) expect(OHNE_WIRKUNG, `B1 ${feld} ${k}`).toContain(zelle(feld, "schreiben-geplant", k));
      expect(zeile(feld, "schreiben-geplant").register, feld).toBe(true);
      /* Wie die neueren Module: dieselbe Zeile wie Wachbuch & Co. bei „geplant“. */
      expect(zeile(feld, "schreiben-geplant").zellen, feld).toEqual(zeile("rotationen", "schreiben-geplant").zellen);
      /* Das Register wirkt: im Prüfmodus schreiben Planung und Leitung (und Kundenrolle, Demo) wieder. */
      for (const k of ["LT", "PL", "KD", "DL", "DP"]) expect(zelle(feld, "schreiben-pruef", k), `Prüfmodus ${feld} ${k}`).toBe("gespeichert");
    }
  });
  it("Rollen ohne Schreibrecht und fremde Betriebe speichern nirgends (auch bei den älteren Modulen)", () => {
    for (const z of geplant) for (const k of ["MA", "BR", "BT", "AB"]) expect(OHNE_WIRKUNG, `${z.feld} ${k}`).toContain(z.zellen[k]);
  });
});

describe("(b) Prüfmodus: die dokumentierte vorläufige Rechtematrix (R-1, R-2, R-4, R-8)", () => {
  const P = "schreiben-pruef";
  it("R-1: Bereitschaft und Funktionsplan schreiben Planung und Leitung (und Kundenrolle, Demo); Stufen, Bereiche, Niveaus, Rotationen nur die Organisationsleitung (org.edit)", () => {
    for (const feld of ["bereitschaft", "funktionsPlan"]) for (const k of ["LT", "PL", "KD", "DL", "DP"]) expect(zelle(feld, P, k), `${feld} ${k}`).toBe("gespeichert");
    for (const feld of ["bereitschaftStufen", "funktionsbereiche", "pflegeNiveaus", "rotationen"]) {
      for (const k of ["LT", "KD", "DL"]) expect(zelle(feld, P, k), `${feld} ${k}`).toBe("gespeichert");
      for (const k of ["PL", "DP"]) expect(zelle(feld, P, k), `${feld} ${k}`).toBe("abgewiesen");
    }
  });
  it("R-1/R-2: Schichtverantwortung, Beschäftigte, Betriebsrat, Betreiber und fremde Betriebe schreiben kein Modul mit Register (Ausnahme B2 b: Bereichsplan der Schichtverantwortung)", () => {
    const sv = (z, k) => k === "SV" && z.feld === "bereichsPlan";
    for (const z of zeilen.filter((x) => x.art === P && x.register))
      for (const k of ["SV", "MA", "BR", "BT", "AB"]) if (!sv(z, k)) expect(z.zellen[k], `${z.feld} ${k}`).not.toBe("gespeichert");
    for (const z of zeilen.filter((x) => x.art === P && x.register))
      for (const k of ["SV", "BR", "AB"]) if (!sv(z, k)) expect(z.zellen[k], `${z.feld} ${k}`).toBe("abgewiesen");
  });
  it("R-2: Wachbuch — Planung und Leitung tragen nur ein, wenn sie am Tag auf einem Posten des Objekts stehen; ohne Mitbestätigung (G6) nichts", () => {
    for (const k of ["LT", "PL", "KD", "DL", "DP"]) expect(zelle("wachbuch", P, k), k).toBe("gespeichert");
    for (const k of ROLLEN.map((r) => r.k)) expect(zelle("wachbuch", "schreiben-pruef-ohne-bestaetigung", k), `ohne Bestätigung ${k}`).not.toBe("gespeichert");
    for (const k of ["LT", "PL", "KD", "DL", "DP", "SV", "BR", "AB"]) expect(zelle("wachbuch", "schreiben-pruef-ohne-bestaetigung", k), k).toBe("abgewiesen");
  });
  it("R-4/R-12: die Kundenrolle verhält sich in jeder Zeile wie die Leitung; Demo-Konten wie ihre Rolle (kein Sonderrecht)", () => {
    for (const z of zeilen) { expect(z.zellen.KD, `KD ${z.feld} ${z.art}`).toBe(z.zellen.LT); expect(z.zellen.DL, `DL ${z.feld} ${z.art}`).toBe(z.zellen.LT); expect(z.zellen.DP, `DP ${z.feld} ${z.art}`).toBe(z.zellen.PL); }
  });
  it("R-8: ein anderer Betrieb schreibt nichts in den Betrieb 0 (jede Zeile abgewiesen)", () => {
    for (const z of zeilen.filter((x) => x.art.startsWith("schreiben"))) expect(z.zellen.AB, `${z.feld} ${z.art}`).toBe("abgewiesen");
  });
  it("Schichtverantwortung im Bereichsplan: nur eigene Einheit (dokumentierter Weg bereichsPlanSchicht, B2) — im Prüfmodus gespeichert, bei „geplant“ abgewiesen (B1 behoben)", () => {
    expect(zelle("bereichsPlan", P, "SV")).toBe("gespeichert");
    expect(zelle("bereichsPlan", "schreiben-geplant", "SV")).toBe("abgewiesen");
  });
});

describe("(c) Lesen je Rolle (R-3, R-8) und Betreiber", () => {
  const L = "lesen";
  it("Wachbuch: Beschäftigte nur Selbstverfasstes, Schichtverantwortung nur die eigene Einheit, Betriebsrat nichts, Leitung/Planung/Kundenrolle alles (R-3, R-4)", () => {
    expect(zeile("wachbuch", L).zellen).toMatchObject({ LT: "alles", PL: "alles", KD: "alles", SV: "teilweise 2/3", MA: "teilweise 1/3", BR: "nichts", BT: "nichts" });
  });
  it("Bereitschaft und Rotation: Beschäftigte und Schichtverantwortung nur die eigene Person (R-3)", () => {
    expect(zeile("bereitschaft", L).zellen).toMatchObject({ SV: "teilweise 1/4", MA: "teilweise 1/4", BR: "nichts", LT: "alles", PL: "alles" });
    expect(zeile("rotationen", L).zellen).toMatchObject({ SV: "teilweise 1/3", MA: "teilweise 1/3", BR: "nichts", LT: "alles", PL: "alles" });
  });
  it("Sachfelder (Stufen, Funktionsbereiche, Niveaus): nur Planung und Leitung (R-3, offen)", () => {
    for (const feld of ["bereitschaftStufen", "funktionsbereiche", "pflegeNiveaus"])
      expect(zeile(feld, L).zellen, feld).toMatchObject({ LT: "alles", PL: "alles", KD: "alles", SV: "nichts", MA: "nichts", BR: "nichts", BT: "nichts" });
  });
  it("Posten- und Bereichsplan: Beschäftigte nur die eigene Einteilung, Schichtverantwortung ihr Bereich, Betriebsrat nichts", () => {
    expect(zeile("postenPlan", L).zellen).toMatchObject({ MA: "teilweise 1/3", BR: "nichts", LT: "alles" });
    expect(zeile("bereichsPlan", L).zellen).toMatchObject({ SV: "teilweise 2/3", MA: "teilweise 1/3", BR: "nichts", LT: "alles" });
    expect(zeile("funktionsPlan", L).zellen).toMatchObject({ SV: "teilweise 2/3", MA: "teilweise 1/3", BR: "nichts" });
  });
  it("Betrieb 0 ist für einen anderen Betrieb unsichtbar, in jeder Zeile (kein LECK)", () => {
    for (const z of zeilen.filter((x) => x.art === L)) expect(z.zellen.AB, z.feld).toBe("nichts");
    for (const z of zeilen) for (const k of Object.keys(z.zellen)) expect(z.zellen[k], `${z.feld} ${z.art} ${k}`).not.toBe("LECK");
  });
  it("Betreiber: keine Moduldaten des Betriebs (nur Betriebskonfiguration: Dienstarten); Beobachtung: Betriebsrat sieht Dienstarten und Kompetenzen (staff.view, offen M3)", () => {
    for (const z of zeilen.filter((x) => x.art === L && x.feld !== "dienstarten")) expect(z.zellen.BT, z.feld).toBe("nichts");
    expect(zelle("dienstarten", L, "BT")).toBe("alles");
    expect(zelle("kompetenzen", L, "BR")).toBe("alles");
  });
});

describe("Verweise auf offene Fragen sind belegt, nicht erfunden", () => {
  it("jede Kennung (R-x, FN-xx, Matrixfrage) steht in den WP-19-Dokumenten", () => {
    const quellen = ["wp19-offene-fragen-agent.md", "WP19-MODULPLAN.md", "WP19-OFFENE-FACHNACHWEISE.md"].map(lies).join("\n");
    const tokens = new Set(FELDER.flatMap((f) => f.offen));
    expect(tokens.size).toBeGreaterThan(30);
    for (const t of tokens) expect(new RegExp(`(^|[^A-Za-z0-9-])${t}($|[^A-Za-z0-9-])`).test(quellen), t).toBe(true);
  });
});

describe("(d) Das Dokument ist die Rechnung (kein Abweichen)", () => {
  it("Server-Matrix: Tabelle in docs/acc45/WP-19-MODULABNAHME.md gleich der berechneten", () => {
    const soll = matrixMarkdown(zeilen);
    expect(blockPruefen("MATRIX-SERVER", soll)).toBe(soll);
  });
  it("Zugriffsstufen der Ansichten (Objektbericht, Wachbuch): Tabelle gleich der Funktionen der Oberfläche", () => {
    const soll = zugriffMarkdown();
    expect(blockPruefen("MATRIX-ZUGRIFF", soll)).toBe(soll);
  });
  it("Befunde und Grenzen der Prüfung stehen im Dokument (B1, B2, B3; Status bleibt geplant; nicht geprüft)", () => {
    const d = doc();
    for (const t of ["Befund B1", "Befund B2", "Befund B3", "Befund B4", "Befund B5", "Nicht geprüft", "geplant", "G8", "E-22"]) expect(d, t).toContain(t);
    expect(d).toContain("**Befund B1 (Rechte/Aktivität, kein Datenleck, behoben, dieser PR).**");
    expect(d).toContain("modul-altwege.mjs");
    expect(blockLesen("MATRIX-UI")).toBeTruthy();
  });
});
