/* ==========================================================================
   REVIEW WP-10 — Befunde K1, H1, M1, N1 als Prüfung

   Jeder Fall ist auf dem Stand vor der Korrektur (619beec) rot. Geprüft wird
   über die Antwort des Servers (bestandFuerRolle, zusammenfuehren) und, wo
   die Oberfläche nichts exportiert, über ihren Quelltext.

   Aufruf: npx vitest run pruefungen/review-wp10.test.js
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { bestandFuerRolle, zusammenfuehren } from "../server/lib/rechte.mjs";
import { heuteBerlin, tagePlus } from "../server/lib/zeiterfassung.mjs";

const HEUTE = heuteBerlin();
const tag = (n) => tagePlus(HEUTE, n);
const kopie = (x) => JSON.parse(JSON.stringify(x));
const APP = readFileSync(path.join(process.cwd(), "src/App.jsx"), "utf8").replace(/\r\n/g, "\n");
const funktionAb = (kopf) => { const a = APP.indexOf(kopf); expect(a, kopf).toBeGreaterThan(0); return APP.slice(a, APP.indexOf("\n}\n", a)); };
const aktion = (kopf) => { const a = APP.indexOf(kopf); expect(a, kopf).toBeGreaterThan(0); return APP.slice(a, APP.indexOf("\n      }, \"", a)); };

const person = (id, rolle, einheit, extra = {}) => ({ id, vorname: "V", nachname: `N${id}`, rolle, bereich: einheit,
  status: "aktiv", zugehoerigkeit: [{ ab: "2020-01-01", einheitId: einheit }], ...extra });
const SITZ = {
  MA: { rolle: "mitarbeiter", person: "m0", betrieb: 0 }, BR: { rolle: "betriebsrat", person: "r1", betrieb: 0 },
  SV: { rolle: "subplaner", person: "s1", betrieb: 0 }, PL: { rolle: "planer", person: "p1", betrieb: 0 },
  LT: { rolle: "leitung", person: "l1", betrieb: 0 },
};
const GEHEIM = ["MuSchG", "Mutterschutz", "Krank", "schwanger", "KOPF-GEHEIM"];

const bestand = (extra = {}) => ({
  version: 9, stand: 1,
  mandanten: [{
    id: "m1", name: "Haus", einheiten: [{ id: "e1" }, { id: "e2" }],
    dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00" }, { id: "N", name: "Nacht", start: "22:00", ende: "06:00" }],
    qualifikationen: [], einstellungen: { ruhezeit: 11, maxFolge: 6 },
    personen: [person("m0", "mitarbeiter", "e1"), person("a1", "mitarbeiter", "e1"), person("b1", "mitarbeiter", "e2"),
      person("r1", "betriebsrat", "ALLE"), person("s1", "subplaner", "e1"), person("p1", "planer", "ALLE"),
      person("l1", "leitung", "ALLE"), person("l2", "leitung", "ALLE")],
    abweichungen: {}, nachrichten: [], anfragen: [], abwesenheiten: [], bestaetigungen: [],
    selbstplanung: [{ id: "sp1", monat: tag(3).slice(0, 7), status: "uebernommen", uebernommen: 1, verworfen: 3,
      kopfFeld: "KOPF-GEHEIM",
      eintraege: [{ personId: "m0", datum: tag(3), dienstId: "F" }],
      nichtUebernommen: [
        { personId: "b1", datum: tag(3), dienstId: "N", grund: "MuSchG § 5: Nachtarbeit zwischen 20 und 6 Uhr …" },
        { personId: "a1", datum: tag(3), dienstId: "N", grund: "abwesend (Krank)" },
        { personId: "m0", datum: tag(3), dienstId: "N", grund: "schwanger laut Attest", hinweise: ["MuSchG"] }] }],
    ...extra,
  }],
});
const sicht = (r, g = bestand()) => bestandFuerRolle(g, SITZ[r]).mandanten[0];

/* ------------------------------------------------------------------------
   K1 — „nicht übernommen" der Selbstplanung (Art. 9 DSGVO)
   ------------------------------------------------------------------------ */
describe("K1: Rundenkopf der Selbstplanung", () => {
  it("Beschäftigte sehen nur die eigenen nicht übernommenen Einträge, ohne Grundtext, ohne fremde Kopffelder", () => {
    const r = sicht("MA").selbstplanung[0];
    expect(r.nichtUebernommen).toEqual([{ personId: "m0", datum: tag(3), dienstId: "N", grund: "befund" }]);
    for (const g of GEHEIM) expect(JSON.stringify(sicht("MA").selbstplanung), g).not.toContain(g);
  });
  it("die Schichtverantwortung nur eigenen Bereich am Tag, ohne Grundtext", () => {
    const r = sicht("SV").selbstplanung[0];
    expect(r.nichtUebernommen.map((e) => e.personId)).toEqual(["a1", "m0"]);
    for (const e of r.nichtUebernommen) expect(e.grund).toBe("befund");
    for (const g of GEHEIM) expect(JSON.stringify(sicht("SV").selbstplanung), g).not.toContain(g);
  });
  it("der Betriebsrat bekommt die Selbstplanung nicht", () => {
    expect(sicht("BR").selbstplanung || []).toEqual([]);
  });
  it("die Oberfläche speichert den Grund als Kennung, nie den Befundtext", () => {
    const u = aktion("rundeUebernehmen: (id, best) => mUpd((m0) => {");
    expect(u).not.toMatch(/grund: (sperre|ernst\[0\])\.text/);
    expect(u).not.toMatch(/nicht\.push\(\{ \.\.\.e,/);
    expect(u).toContain("grundKennung(");
  });
  it("der Server nimmt neue Einträge nur als Kennung an", () => {
    const g = bestand();
    const s = kopie(bestandFuerRolle(g, SITZ.PL));
    s.mandanten[0].selbstplanung[0].nichtUebernommen = [
      { personId: "b1", datum: tag(4), dienstId: "N", grund: "MuSchG § 5", text: "schwanger", hinweise: ["Krank"] },
      { personId: "a1", datum: tag(4), dienstId: "N", grund: "schutz" }];
    const e = zusammenfuehren(g, s, SITZ.PL);
    expect(e.mandanten[0].selbstplanung[0].nichtUebernommen).toEqual([
      { personId: "b1", datum: tag(4), dienstId: "N", grund: "befund" },
      { personId: "a1", datum: tag(4), dienstId: "N", grund: "schutz" }]);
  });
  it("Beschäftigte und Schichtverantwortung ändern „nicht übernommen“ nicht", () => {
    for (const r of ["MA", "SV"]) {
      const g = bestand();
      const s = kopie(bestandFuerRolle(g, SITZ[r]));
      s.mandanten[0].selbstplanung[0].nichtUebernommen = [{ personId: "b1", datum: tag(4), dienstId: "N", grund: "schutz" }];
      const e = zusammenfuehren(g, s, SITZ[r]);
      /* Der Rundenkopf kommt für beide aus dem gespeicherten Stand (selbstplanungZusammen). */
      expect(e && !e.verweigert, `${r}: ${e && e.verweigert}`).toBe(true);
      expect(e.mandanten[0].selbstplanung[0].nichtUebernommen, r).toEqual(g.mandanten[0].selbstplanung[0].nichtUebernommen);
    }
  });
});
