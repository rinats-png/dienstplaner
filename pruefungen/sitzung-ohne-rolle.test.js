/* ==========================================================================
   SITZUNG OHNE ROLLE: KEIN ZUGRIFF OHNE NACHGEWIESENE BERECHTIGUNG (P0)

   Befund aus der Prüfung von PR #17: Eine Sitzung ohne Rolle wurde über
   rolleBekannt(undefined) === true als gültig behandelt und danach über
   „sitzung.rolle || 'kunde'“ mit der Vollsicht und dem Vollschreibrecht
   der Kundenrolle ausgestattet.

   Regel jetzt: Eine Sitzung braucht eine Rolle als Zeichenkette aus der
   Rangliste (sitzungsRolleBekannt). Fehlt sie, gibt es keinen Bestand,
   kein Schreiben und keine Sicht. Die Eingabe-Vorgabe „kunde“ für das
   Anlegen von Zugängen bleibt unverändert.
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  bestandFuerRolle, zusammenfuehren, sitzungsRolleBekannt, rolleBekannt, BEKANNTE_ROLLEN,
} from "../server/lib/rechte.mjs";

const WURZEL = join(import.meta.dirname, "..");
const lies = (p) => readFileSync(join(WURZEL, p), "utf8");

const MARKER = "SR-GEHEIM-NOTIZ";
const person = (id, rolle, einheit = "e1", extra = {}) => ({ id, vorname: `V${id}`, nachname: `N${id}`, rolle, bereich: einheit,
  status: "aktiv", zugehoerigkeit: [{ ab: "2020-01-01", einheitId: einheit }], ...extra });
const bestand = () => ({ version: 9, stand: 1, session: null, mandanten: [{
  id: "m-a", name: "A", status: "aktiv", tarif: "pro", einheiten: [{ id: "e1" }], standorte: [], dienstarten: [{ id: "F", name: "F" }],
  personen: [person("al", "leitung", "ALLE"), person("am", "mitarbeiter", "e1", { notiz: MARKER })],
  abweichungen: {}, anfragen: [], notrufe: [], nachrichten: [], dienstbuch: [],
  abwesenheiten: [{ id: "ab", personId: "am", art: "krank", von: "2026-12-01", bis: "2026-12-01", notiz: MARKER }] }] });
const ohneRolle = (extra = {}) => ({ person: "am", betrieb: 0, mandantId: "m-a", ...extra });

describe("sitzungsRolleBekannt: nur eine nachgewiesene Rolle gilt", () => {
  it("jede Rolle der Rangliste und kunde gelten", () => {
    for (const r of BEKANNTE_ROLLEN) expect(sitzungsRolleBekannt(r), r).toBe(true);
  });
  it("fehlende oder falsche Rollenangabe gilt nicht", () => {
    for (const r of [undefined, null, "", "Leitung", "gast", 0, false, {}, [], ["leitung"]])
      expect(sitzungsRolleBekannt(r), JSON.stringify(r)).toBe(false);
  });
  it("Gegenstück: auch für Anlagen gibt es keine Vorgabe mehr (2026-11-07)", () => {
    expect(rolleBekannt(undefined)).toBe(false);
  });
});

describe("Sitzung ohne Rolle erhält keinen Bestand", () => {
  it("bestandFuerRolle liefert nichts, auch wenn Person und Betrieb passen", () => {
    expect(bestandFuerRolle(bestand(), ohneRolle())).toBeNull();
    expect(bestandFuerRolle(bestand(), ohneRolle({ rolle: null }))).toBeNull();
  });
  it("die Sicht enthält keine Rohdaten, auch nicht über eine Person oder Abwesenheit", () => {
    for (const s of [ohneRolle(), ohneRolle({ rolle: null })]) {
      expect(JSON.stringify(bestandFuerRolle(bestand(), s) ?? null)).not.toContain(MARKER);
    }
  });
});

describe("Sitzung ohne Rolle schreibt nicht", () => {
  it("zusammenfuehren verweigert jede Änderung", () => {
    const b = bestand();
    const geaendert = bestand();
    geaendert.mandanten[0].personen[1].notiz = "SR-NEU";
    expect(zusammenfuehren(b, geaendert, ohneRolle())).toBeNull();
    expect(zusammenfuehren(b, geaendert, ohneRolle({ rolle: undefined }))).toBeNull();
  });
});

describe("Quelltext: die Sitzungsprüfungen nutzen die strikte Prüfung", () => {
  const stellen = [
    ["server/lib/rechte.mjs", /!sitzungsRolleBekannt\(sitzung\.rolle\)/g, 2],
    ["server/funktionen/daten.mjs", /!sitzungsRolleBekannt\(s0\.rolle\)/g, 1],
    ["server/funktionen/zustellung.mjs", /!sitzungsRolleBekannt\(s\.rolle\)/g, 1],
    ["server/funktionen/kalender.mjs", /!sitzungsRolleBekannt\(s\.rolle\)/g, 1],
    ["server/lib/betriebsauswahl.mjs", /!sitzungsRolleBekannt\(m\.rolle\)/g, 1],
  ];
  for (const [datei, muster, anzahl] of stellen) {
    it(`${datei}: ${anzahl} Stelle(n) mit strikter Prüfung`, () => {
      expect((lies(datei).match(muster) || []).length).toBe(anzahl);
    });
  }
  it("kein Rückfall „sitzung.rolle || kunde“ mehr in der Rechteprüfung", () => {
    expect(lies("server/lib/rechte.mjs")).not.toMatch(/sitzung\.rolle \|\| "kunde"/);
  });
});
