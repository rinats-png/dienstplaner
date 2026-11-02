/* ==========================================================================
   ERSTBEFÜLLUNG UND BINDUNG DER ZUGANGSCODES — reine Logik

   Einen leeren Raum richtet nur der Betreiber ein; die Demo hat eine feste
   Gestalt; Zugangscodes tragen die Kennung ihres Betriebs. Den HTTP-Weg
   prüft pruefungen/erstbefuellung.mjs (serverlauf).
   ========================================================================== */

import { describe, it, expect } from "vitest";
import { DEMO_KENNUNGEN, demoGestaltPruefen, vorlageBestand, mandantPruefen, codeBindung,
  betriebFuerNeuenCode, bindungsVorschau } from "../server/lib/erstbefuellung.mjs";
import { zusammenfuehren } from "../server/lib/rechte.mjs";
import { pruefeGestalt } from "../server/lib/gestalt.mjs";

const demo = () => ({ version: 9, mandanten: DEMO_KENNUNGEN.map((id) => ({ id, name: id })) });
const ROLLEN = ["mitarbeiter", "betriebsrat", "subplaner", "planer", "leitung", "kunde", "betreiber"];

describe("Leerer Raum: kein Schreibweg für irgendeine Rolle", () => {
  for (const rolle of ROLLEN) {
    it(`${rolle} befüllt keinen leeren Raum über PUT /api/bestand`, () => {
      const erg = zusammenfuehren(null, demo(), { rolle, person: "p1", betrieb: 0 });
      expect(erg === null || !!erg.verweigert, rolle).toBe(true);
    });
  }
});

describe("Demo-Gestalt", () => {
  it("genau m-nordwacht, m-lindenhof, m-steinbach in dieser Reihenfolge", () => {
    expect(DEMO_KENNUNGEN).toEqual(["m-nordwacht", "m-lindenhof", "m-steinbach"]);
    expect(demoGestaltPruefen(demo())).toBeNull();
  });
  it("falsche Reihenfolge, fehlender, zusätzlicher, unbekannter oder doppelter Betrieb: abgewiesen", () => {
    const b = demo(); b.mandanten.reverse();
    expect(demoGestaltPruefen(b)).toMatch(/Stelle 0/);
    expect(demoGestaltPruefen({ mandanten: demo().mandanten.slice(0, 2) })).toMatch(/genau 3/);
    expect(demoGestaltPruefen({ mandanten: [...demo().mandanten, { id: "m-x" }] })).toMatch(/genau 3/);
    const fremd = demo(); fremd.mandanten[2].id = "m-anders";
    expect(demoGestaltPruefen(fremd)).toMatch(/Stelle 2/);
    const doppelt = demo(); doppelt.mandanten[2].id = "m-nordwacht";
    expect(demoGestaltPruefen(doppelt)).toBeTruthy();
    expect(pruefeGestalt(doppelt).ok).toBe(false);
    expect(demoGestaltPruefen(null)).toBeTruthy();
  });
});

describe("Vorlagen leer und test", () => {
  it("leer: genau ein Betrieb, Kennung = Raumname, gültige Gestalt", () => {
    const b = vorlageBestand("leer", { raum: "kunde-neu", name: "Haus am See" });
    expect(b.mandanten.map((m) => m.id)).toEqual(["kunde-neu"]);
    expect(b.mandanten[0].name).toBe("Haus am See");
    expect(pruefeGestalt(b).ok).toBe(true);
  });
  it("test: reproduzierbar — gleiche Eingabe, gleiche Gestalt", () => {
    const a = vorlageBestand("test", { raum: "test-raum" });
    const b = vorlageBestand("test", { raum: "test-raum" });
    expect(a.mandanten.map((m) => [m.id, m.name])).toEqual([["test-raum", "Testbetrieb"]]);
    expect(b.mandanten.map((m) => [m.id, m.name])).toEqual(a.mandanten.map((m) => [m.id, m.name]));
    expect(pruefeGestalt(a).ok).toBe(true);
  });
  it("die Demo baut der Server nicht selbst (offener Architekturpunkt)", () => {
    expect(vorlageBestand("demo", { raum: "demo-x" })).toBeNull();
  });
});

describe("Neue Codes: Position und Kennung", () => {
  it("gültige Position: beides wird gespeichert", () => {
    expect(betriebFuerNeuenCode(demo(), 1)).toEqual({ betrieb: 1, mandantId: "m-lindenhof" });
    expect(betriebFuerNeuenCode(demo(), undefined)).toEqual({ betrieb: 0, mandantId: "m-nordwacht" });
  });
  it("leerer Raum, ungültige Position, uneindeutige Kennung: kein Code", () => {
    expect(betriebFuerNeuenCode(null, 0).grund).toMatch(/nicht eingerichtet/);
    expect(betriebFuerNeuenCode({ mandanten: [] }, 0).grund).toMatch(/nicht eingerichtet/);
    for (const falsch of [3, -1, 1.5, "x"]) expect(betriebFuerNeuenCode(demo(), falsch).grund, String(falsch)).toBeTruthy();
    expect(betriebFuerNeuenCode({ mandanten: [{ id: "a" }, { id: "a" }] }, 0).grund).toMatch(/eindeutig/);
  });
});

describe("Anmelden: Bindung prüfen", () => {
  it("passende Position und Kennung: Zugang", () => {
    expect(codeBindung(demo(), { rolle: "leitung", betrieb: 1, mandantId: "m-lindenhof" }))
      .toEqual({ ok: true, mandantId: "m-lindenhof" });
  });
  it("falsche Kennung oder verschobene Position: kein Zugang", () => {
    expect(codeBindung(demo(), { rolle: "leitung", betrieb: 1, mandantId: "m-nordwacht" }))
      .toMatchObject({ ok: false, grund: "mandant-verschoben" });
    const verschoben = demo();
    verschoben.mandanten = [verschoben.mandanten[1], verschoben.mandanten[0], verschoben.mandanten[2]];
    expect(codeBindung(verschoben, { rolle: "leitung", betrieb: 1, mandantId: "m-lindenhof" }))
      .toMatchObject({ ok: false, grund: "mandant-verschoben" });
  });
  it("Altcode im Raum mit genau einem Betrieb: eindeutig, wird gebunden", () => {
    expect(codeBindung({ mandanten: [{ id: "haus" }] }, { rolle: "mitarbeiter", betrieb: 0 }))
      .toEqual({ ok: true, mandantId: "haus", migrieren: true });
  });
  it("Altcode im Raum mit mehreren Betrieben: nicht raten, gilt weiter über die Position", () => {
    expect(codeBindung(demo(), { rolle: "leitung", betrieb: 1 })).toEqual({ ok: true, mandantId: null });
  });
  it("Betreiber und leerer Raum: nichts zu binden", () => {
    expect(codeBindung(demo(), { rolle: "betreiber" })).toEqual({ ok: true, mandantId: null });
    expect(codeBindung(null, { rolle: "leitung", betrieb: 0 })).toEqual({ ok: true, mandantId: null });
  });
  it("dieselbe Prüfung wie für Sitzungen aus einem Konto", () => {
    expect(mandantPruefen(demo(), 2, "m-steinbach")).toBeNull();
    expect(mandantPruefen(demo(), 2, "m-lindenhof")).toBe("mandant-verschoben");
    expect(mandantPruefen({ mandanten: [] }, 0, "x")).toBe("mandant-fehlt");
  });
});

describe("Trockenlauf für alte Codes", () => {
  it("zeigt Position, heutigen Betrieb und ob eine gespeicherte Kennung passt — ändert nichts", () => {
    const zugaenge = [
      { kennung: "aaaa1111", name: "Nordwacht", rolle: "leitung", betrieb: 0 },
      { kennung: "bbbb2222", name: "Lindenhof", rolle: "leitung", betrieb: 1, mandantId: "m-lindenhof" },
      { kennung: "cccc3333", name: "Steinbach", rolle: "leitung", betrieb: 2, mandantId: "m-nordwacht" },
      { kennung: "dddd4444", name: "Weg", rolle: "leitung", betrieb: 7 },
    ];
    const vor = JSON.stringify(zugaenge);
    const v = bindungsVorschau(demo(), zugaenge);
    expect(v.map((x) => [x.kennung, x.aktuell && x.aktuell.id, x.passt])).toEqual([
      ["aaaa1111", "m-nordwacht", null], ["bbbb2222", "m-lindenhof", true],
      ["cccc3333", "m-steinbach", false], ["dddd4444", null, null]]);
    expect(JSON.stringify(zugaenge)).toBe(vor);
  });
});
