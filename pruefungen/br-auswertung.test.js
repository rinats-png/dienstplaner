/* ==========================================================================
   WP-27 — AUSWERTUNG FÜR DEN BETRIEBSRAT: nur Aggregate, Mindestgruppe 3

   Der Betriebsrat (audit.view) bekommt aus dem vollständigen Bestand Summen je
   Monat und Einheit: Dienste, Nachtdienste, Sonntagsdienste, lange Dienste,
   Ruhezeit unter 11 Stunden, bestätigte Ist-Stunden. Unter drei Personen keine
   Zahlen; ist eine Einheit gesperrt, auch die Gesamtzeile des Monats.
   Personen werden nie genannt. Andere Rollen bekommen das Feld nicht; mitgeschickt
   wird es nie gespeichert.

   Aufruf: npx vitest run pruefungen/br-auswertung.test.js
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { bestandFuerRolle, zusammenfuehren } from "../server/lib/rechte.mjs";
import { betriebsratAuswertung, BR_MINDESTGRUPPE } from "../server/lib/br-auswertung.mjs";
import { heuteBerlin, tagePlus } from "../server/lib/zeiterfassung.mjs";

const HEUTE = heuteBerlin();
const tag = (n) => tagePlus(HEUTE, n);
const person = (id, rolle, einheit, extra = {}) => ({ id, vorname: "V", nachname: `NAME-${id}`, rolle, bereich: einheit, status: "aktiv",
  geburtstag: "1980-01-01", zugehoerigkeit: einheit === "ALLE" ? [] : [{ ab: "2020-01-01", einheitId: einheit }], ...extra });
const bestand = () => ({ version: 1, stand: 7, mandanten: [{ id: "m1", name: "Haus",
  einheiten: [{ id: "gross", versatzTage: 0 }, { id: "klein", versatzTage: 0 }],
  dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00", pause: 30 }, { id: "N", name: "Nacht", start: "22:00", ende: "06:00", pause: 30 },
    { id: "L", name: "Lang", start: "07:00", ende: "19:00", pause: 30 }],
  zyklus: { tage: ["F", "F", "F", "F", "F", "-", "-"] }, anker: "2026-01-05", einstellungen: { ruhezeit: 11 },
  personen: [person("g1", "mitarbeiter", "gross"), person("g2", "mitarbeiter", "gross"), person("g3", "mitarbeiter", "gross"),
    person("k1", "mitarbeiter", "klein"), person("k2", "mitarbeiter", "klein"),
    person("p1", "planer", "ALLE"), person("l1", "leitung", "ALLE"), person("r1", "betriebsrat", "ALLE")],
  abweichungen: { [`g1|${tag(-3)}`]: "N", [`g2|${tag(-3)}`]: "L", [`g3|${tag(-10)}`]: "F" },
  erfassung: { [`g3|${tag(-10)}`]: { start: "06:00", ende: "15:00", bestaetigt: true } },
  nachrichten: [], anfragen: [], abwesenheiten: [], bestaetigungen: [] }] });
const SITZ = { BR: { rolle: "betriebsrat", person: "r1", betrieb: 0 }, PL: { rolle: "planer", person: "p1", betrieb: 0 },
  LT: { rolle: "leitung", person: "l1", betrieb: 0 }, MA: { rolle: "mitarbeiter", person: "g1", betrieb: 0 },
  SV: { rolle: "subplaner", person: "g1", betrieb: 0 } };

describe("die Auswertung selbst", () => {
  const a = betriebsratAuswertung(bestand().mandanten[0], HEUTE);
  const zeile = (monat, eid) => a.zeilen.find((z) => z.monat === monat && z.einheitId === eid);
  it("Mindestgruppe: die Einheit mit zwei Personen ohne Zahlen", () => {
    const z = zeile(HEUTE.slice(0, 7), "klein");
    expect(z).toEqual({ monat: HEUTE.slice(0, 7), einheitId: "klein", personen: `<${BR_MINDESTGRUPPE}`, gesperrt: true });
  });
  it("Zweitsperre: ist eine Einheit gesperrt, fehlt auch die Gesamtzeile des Monats", () => {
    expect(zeile(HEUTE.slice(0, 7), null)).toMatchObject({ gesperrt: true });
    expect(zeile(HEUTE.slice(0, 7), null).dienste).toBeUndefined();
  });
  it("die große Einheit: Summen, Nacht und lange Dienste aus dem Plan, Ist-Stunden aus bestätigten Zeiten", () => {
    const monat = tag(-3).slice(0, 7);
    const z = zeile(monat, "gross");
    expect(z.gesperrt).toBe(false);
    expect(z.personen).toBe(3);
    expect(z.nachtdienste).toBeGreaterThanOrEqual(1);
    expect(z.langeDienste).toBeGreaterThanOrEqual(1);
    if (tag(-10).slice(0, 7) === monat) expect(z.istErfasst).toBe(1);
  });
  it("keine Person, kein Name, keine Kennung", () => {
    expect(JSON.stringify(a)).not.toMatch(/NAME-|"g1"|"k1"|"r1"/);
  });
});

describe("nur der Betriebsrat, nie gespeichert", () => {
  it("der Betriebsrat bekommt sie, andere Rollen nicht", () => {
    expect(bestandFuerRolle(bestand(), SITZ.BR).mandanten[0].auswertungBetriebsrat).toBeTruthy();
    for (const k of ["PL", "LT", "MA", "SV"]) expect(bestandFuerRolle(bestand(), SITZ[k]).mandanten[0].auswertungBetriebsrat, k).toBeUndefined();
  });
  it("mitgeschickt: nie gespeichert", () => {
    const g = bestand();
    const s = JSON.parse(JSON.stringify(bestandFuerRolle(g, SITZ.PL)));
    s.mandanten[0].auswertungBetriebsrat = { zeilen: [{ monat: "x" }] };
    const e = zusammenfuehren(g, s, SITZ.PL);
    expect(e.verweigert).toBeFalsy();
    expect(e.mandanten[0].auswertungBetriebsrat).toBeUndefined();
  });
});

describe("Oberfläche: Auswertung für den Betriebsrat, falsche Ansichten gesperrt (Quelltext)", () => {
  const app = readFileSync(path.join(process.cwd(), "src/App.jsx"), "utf8");
  it("audit.view öffnet die Auswertung, export.data den CSV-Export — nur Aggregate", () => {
    expect(app).toContain('["brauswertung", "Auswertung (Betriebsrat)", "BR:audit.view"]');
    expect(app).toMatch(/darf\(sitz, "export\.data"\) && <Btn onClick=\{csv\}>/);
  });
  it("Leistungsnachweis (ohne Übergaben falsch) und leere Ansichten sind für den Betriebsrat gesperrt", () => {
    for (const v of ['["nachweis", "Leistungsnachweis", "OHNE_BR:', '["sonder", "Sondereinsätze", "OHNE_BR:', '["mittel", "Betriebsmittel", "OHNE_BR:', '["lenkzeiten", "Lenkzeiten", "OHNE_BR:'])
      expect(app, v).toContain(v);
  });
  it("Ausgleichszeitraum ohne Ist-Daten: „nicht bewertbar“ statt „eingehalten“; Urlaub ohne Konto kein NaN; Abwesenheit „abwesend“", () => {
    expect(app).toContain('ohneIstAusgleich ? "nicht bewertbar"');
    expect(app).toContain('typeof p.urlaubsanspruch === "number"');
    expect(app).toContain('id === "abwesend" ? ABW_NEUTRAL');
  });
});
