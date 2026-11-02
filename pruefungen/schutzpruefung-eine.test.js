/* ==========================================================================
   EINE SCHUTZPRÜFUNG — und der Server setzt sie durch (WP-11)

   1. Im Code gibt es genau eine Schutzprüfung: schutzEinsatz in
      server/lib/schutzpruefung.mjs. schutzBefunde (Rohdaten) und
      regelBefunde (Einsatzregeln) sind ihre Datenwege und werden nur dort
      aufgerufen; Oberfläche (Planprüfung, Warndialog, Ersatzsuche) und
      Server lesen schutzEinsatz. src/regelwerk.js reicht nur weiter.
   2. Der Server weist eine neue oder geänderte Einteilung in abweichungen
      ab, die schutzEinsatz sperrt (Nachprüfung WP-10, B2) — für Planung,
      Leitung und Schichtverantwortung; bestehende bleiben unberührt.
   3. Eine Bestätigung hilft nicht: Auch wenn der Client nur warnende
      Befunde nennt, prüft der Server die Einteilung selbst.

   Aufruf: npx vitest run pruefungen/schutzpruefung-eine.test.js
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { bestandFuerRolle, zusammenfuehren } from "../server/lib/rechte.mjs";
import { heuteBerlin, tagePlus } from "../server/lib/zeiterfassung.mjs";

const WURZEL = process.cwd();
const quellen = () => {
  const aus = [];
  const gehe = (dir) => { for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) gehe(p); else if (/\.(js|jsx|mjs)$/.test(e.name)) aus.push(p); } };
  gehe(path.join(WURZEL, "src")); gehe(path.join(WURZEL, "server"));
  return aus.map((p) => [path.relative(WURZEL, p).replace(/\\/g, "/"), readFileSync(p, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")]);
};

describe("genau eine Schutzprüfung im Code", () => {
  const alle = quellen();
  const wo = (re) => alle.filter(([, s]) => re.test(s)).map(([p]) => p);
  it("definiert nur in server/lib/schutzpruefung.mjs", () => {
    for (const f of ["schutzEinsatz", "schutzBefunde", "regelBefunde", "schutzBefundeFuer"])
      expect(wo(new RegExp(`function ${f}\\(`)), f).toEqual(["server/lib/schutzpruefung.mjs"]);
  });
  it("schutzBefunde und regelBefunde werden nur dort aufgerufen", () => {
    for (const f of ["schutzBefunde", "regelBefunde"])
      expect(wo(new RegExp(`(?<!function )\\b${f}\\(`)), f).toEqual(["server/lib/schutzpruefung.mjs"]);
  });
  it("Oberfläche und Server lesen schutzEinsatz", () => {
    const app = alle.find(([p]) => p === "src/App.jsx")[1];
    const fn = (kopf) => app.slice(app.indexOf(kopf), app.indexOf("\n}\n", app.indexOf(kopf)));
    expect(fn("function hindernisBefunde(")).toContain("schutzEinsatz(p, da, d, m.einstellungen)");
    expect(fn("function pruefen(")).toContain("schutzEinsatz(p, da, d, m.einstellungen)");
    expect(app).not.toMatch(/einsatzSchutz\(/);                           // keine zweite Abfrage daneben
    expect(alle.find(([p]) => p === "server/lib/schutzdurchsetzung.mjs")[1]).toContain("schutzEinsatz(person, dienstart, datum, einst)");
  });
  it("das Regelwerk definiert keine eigene Fassung, sondern reicht weiter", () => {
    /* Seit WP-22 steht das Regelwerk in server/lib/regelwerk.mjs; src/regelwerk.js reicht es weiter. */
    const src = alle.find(([p]) => p === "src/regelwerk.js")[1];
    expect(src).toMatch(/export \* from "\.\.\/server\/lib\/regelwerk\.mjs"/);
    const rw = alle.find(([p]) => p === "server/lib/regelwerk.mjs")[1];
    expect(rw).toMatch(/from "\.\/schutzpruefung\.mjs"/);
    for (const q of [src, rw]) expect(q).not.toMatch(/function (schutzEinsatz|schutzBefunde|regelBefunde)\(/);
  });
});

/* ------------------------------------------------------------------------
   Server-Durchsetzung
   ------------------------------------------------------------------------ */
const HEUTE = heuteBerlin();
const tag = (n) => tagePlus(HEUTE, n);
const sonntag = (() => { for (let n = 2; n < 10; n++) { const t = tag(n); if (new Date(`${t}T12:00:00Z`).getUTCDay() === 0) return t; } return null; })();
const werktag = (() => { for (let n = 2; n < 10; n++) { const t = tag(n); const w = new Date(`${t}T12:00:00Z`).getUTCDay(); if (w >= 1 && w <= 5) return t; } return null; })();
const person = (id, rolle, einheit, extra = {}) => ({ id, vorname: "V", nachname: `N${id}`, rolle, bereich: einheit,
  status: "aktiv", geburtstag: "1980-01-01", zugehoerigkeit: [{ ab: "2020-01-01", einheitId: einheit }], ...extra });
const bestand = () => ({ version: 9, stand: 1, mandanten: [{
  id: "m1", name: "Haus", einheiten: [{ id: "e1" }],
  dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00" }, { id: "N", name: "Nacht", start: "22:00", ende: "06:00" }],
  qualifikationen: [], einstellungen: { ruhezeit: 11, maxFolge: 6 },
  personen: [person("mu", "mitarbeiter", "e1", { mutterschutz: true }), person("ju", "mitarbeiter", "e1", { geburtstag: tag(-17 * 365) }),
    person("ok", "mitarbeiter", "e1"), person("weg", "mitarbeiter", "e1", { austritt: tag(1) }),
    person("s1", "subplaner", "e1"), person("p1", "planer", "ALLE"), person("l1", "leitung", "ALLE")],
  abweichungen: { [`mu|${tag(30)}`]: "N" },   // Altbestand: bleibt unberührt
  nachrichten: [], anfragen: [], abwesenheiten: [], bestaetigungen: [] }] });
const SITZ = { SV: { rolle: "subplaner", person: "s1", betrieb: 0 }, PL: { rolle: "planer", person: "p1", betrieb: 0 },
  LT: { rolle: "leitung", person: "l1", betrieb: 0 } };
const schreiben = (r, aendern, g = bestand()) => {
  const s = JSON.parse(JSON.stringify(bestandFuerRolle(g, SITZ[r])));
  aendern(s.mandanten[0]);
  return zusammenfuehren(g, s, SITZ[r]);
};

describe("der Server sperrt, was die Schutzprüfung sperrt (B2)", () => {
  for (const r of ["PL", "LT", "SV"]) {
    it(`${r}: Mutterschutz nachts, Jugendliche nachts, nach Austritt — abgewiesen`, () => {
      for (const [k, d] of [[`mu|${werktag}`, "N"], [`mu|${sonntag}`, "F"], [`ju|${werktag}`, "N"], [`weg|${tag(5)}`, "F"]]) {
        const e = schreiben(r, (m) => { m.abweichungen[k] = d; });
        expect(e && e.verweigert, `${r} ${k}`).toMatch(/nicht möglich/);
      }
    });
    it(`${r}: zulässige Einteilungen gehen durch, der Altbestand bleibt`, () => {
      const e = schreiben(r, (m) => { m.abweichungen[`mu|${werktag}`] = "F"; m.abweichungen[`ok|${werktag}`] = "N"; });
      expect(e && !e.verweigert, `${r}: ${e && e.verweigert}`).toBe(true);
      expect(e.mandanten[0].abweichungen[`mu|${tag(30)}`]).toBe("N");
    });
  }
  it("die Meldung nennt kein Merkmal und kein Gesetz", () => {
    const e = schreiben("SV", (m) => { m.abweichungen[`mu|${werktag}`] = "N"; });
    expect(e.verweigert).not.toMatch(/MuSchG|Mutterschutz|JArbSchG|schwanger|Jugend/);
  });
  it("eine Bestätigung mit nur warnenden Befunden hilft nicht", () => {
    const e = schreiben("PL", (m) => {
      m.bestaetigungen = [{ id: "b-x", personId: "mu", datum: werktag, dienstId: "N", aktion: "einsprung", stufe: "achtung",
        gelesen: true, befunde: [{ regel: "verfuegbarkeit", stufe: "achtung" }] }];
    });
    expect(e.verweigert).toMatch(/sperrender Befund/);
  });
});
