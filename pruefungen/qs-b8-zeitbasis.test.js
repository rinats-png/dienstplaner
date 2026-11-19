/* ==========================================================================
   QS-ZEIT: B8 der Browserabnahme auf fester Zeitbasis — und die Ruhezeit bleibt sperrend
   (docs/acc45/QS-ZEITABHAENGIGKEIT.md; e2e/zeitbasis.mjs)

   Befund (CI browser-abnahme, 2026-11-15): B8 trug am Tag „heute + 3“ einen
   Frühdienst ein. Der Demo-Bestand legt die Schichtfolge am Kalender fest; am
   2026-11-15 lag davor ein Spätdienst (bis 22:00) — 8 h Ruhezeit, der Server
   wies die Planung zu Recht mit „Ruhezeit unter 11 Stunden“ ab (403).

   Hier, ohne Browser, mit derselben Serverprüfung (fachpruefungUebermittlung,
   die PUT /api/bestand nutzt) und demselben Demo-Bestand (demobestand(), den
   e2e/global-setup.mjs im Browser anlegt) unter fester Uhr:
   1. Ursache nachgestellt: Mit Abnahmetag 2026-11-15 sperrt B8 (11-18).
   2. Zeitbasis der Suite: Abnahmetag + 3 nimmt den Frühdienst an (B8 positiv).
   3. Gegenprobe der Suite (Abnahmetag + 4 Spät, + 5 Früh) sperrt mit der
      Ruhezeitmeldung — die Regel ist nicht abgeschwächt.
   4. uhrVersetzen: new Date()/Date.now()/Date() versetzt, alles andere unverändert.

   Aufruf: npx vitest run pruefungen/qs-b8-zeitbasis.test.js
   ========================================================================== */
import { describe, it, expect, vi, afterEach } from "vitest";
import { demobestand } from "../src/lib/fachlogik.js";
import { fachpruefungUebermittlung } from "../server/lib/schutzdurchsetzung.mjs";
import { ABNAHME_ZEITPUNKT, ABNAHMETAG, tagPlus, uhrVersetzen, abnahmeHeute } from "../e2e/zeitbasis.mjs";

afterEach(() => { vi.useRealTimers(); });

/** Demo-Bestand und die Person der Rolle „mitarbeiter“ wie in e2e/global-setup.mjs, unter fester Uhr erzeugt. */
function demoAm(zeitpunkt) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(zeitpunkt));
  const m = demobestand().mandanten[0];
  const ma = m.personen.filter((x) => x.rolle === "mitarbeiter" && x.status !== "inaktiv" && x.imSchichtdienst !== false)[0];
  return { m, ma };
}
/** Die Planung trägt Dienste ein; Ergebnis der Serverprüfung (null = angenommen). */
function planen(m, eintraege, heute) {
  const neu = JSON.parse(JSON.stringify(m));
  neu.abweichungen = { ...(neu.abweichungen || {}), ...eintraege };
  return fachpruefungUebermittlung(m, neu, heute);
}
const RUHEZEIT = (tag) => `Einteilung am ${tag} nicht möglich: Ruhezeit unter 11 Stunden. Sperrende Regeln lassen sich nicht bestätigen.`;

describe("B8 auf fester Zeitbasis", () => {
  it("die Zeitbasis ist der Berliner Tag des Abnahmezeitpunkts, fern von Mitternacht", () => {
    expect(abnahmeHeute(new Date(ABNAHME_ZEITPUNKT))).toBe(ABNAHMETAG);
    expect(abnahmeHeute(new Date(Date.parse(ABNAHME_ZEITPUNKT) + 12 * 3600000)), "zwölf Stunden Lauf bleiben am selben Tag").toBe(ABNAHMETAG);
  });

  it("Ursache: mit Abnahmetag 2026-11-15 trifft der Frühdienst von B8 (11-18) auf den Spätdienst vom 11-17", () => {
    const { m, ma } = demoAm("2026-11-15T09:00:00.000Z");
    expect(planen(m, { [`${ma.id}|2026-11-18`]: "F" }, "2026-11-15")).toEqual({ sperre: RUHEZEIT("2026-11-18") });
  });

  it("B8 positiv: Abnahmetag + 3 nimmt den Frühdienst an", () => {
    const { m, ma } = demoAm(ABNAHME_ZEITPUNKT);
    expect(planen(m, { [`${ma.id}|${tagPlus(ABNAHMETAG, 3)}`]: "F" }, ABNAHMETAG)).toBeNull();
  });

  it("Gegenprobe: Spätdienst + 4, Frühdienst + 5 sperrt mit der Ruhezeitmeldung", () => {
    const { m, ma } = demoAm(ABNAHME_ZEITPUNKT);
    const spaet = tagPlus(ABNAHMETAG, 4), frueh = tagPlus(ABNAHMETAG, 5);
    const r = planen(m, { [`${ma.id}|${spaet}`]: "S", [`${ma.id}|${frueh}`]: "F" }, ABNAHMETAG);
    expect([RUHEZEIT(spaet), RUHEZEIT(frueh)]).toContain(r && r.sperre);
    /* Dieselben Dienste mit einem freien Tag dazwischen: keine Ruhezeitsperre (die Gegenprobe prüft genau die Regel). */
    expect(planen(m, { [`${ma.id}|${spaet}`]: "S", [`${ma.id}|${tagPlus(spaet, 1)}`]: "-", [`${ma.id}|${tagPlus(spaet, 2)}`]: "F" }, ABNAHMETAG))
      .not.toEqual(expect.objectContaining({ sperre: expect.stringContaining("Ruhezeit") }));
  });
});

describe("Gegenprobe gilt auch mit echter Uhr (Staging-Gate, Versatz 0): an jedem Basistag des Zyklus", () => {
  it("Spätdienst + 4, Frühdienst + 5 ist an jedem der 40 Basistage gesperrt, mit der Ruhezeitmeldung, ohne den Bestand zu ändern", () => {
    for (let i = 0; i < 40; i++) {
      const basis = tagPlus("2026-11-01", i);
      const { m, ma } = demoAm(`${basis}T12:00:00.000Z`);
      const vorher = JSON.stringify(m);
      const spaet = tagPlus(basis, 4), frueh = tagPlus(basis, 5);
      const r = planen(m, { [`${ma.id}|${spaet}`]: "S", [`${ma.id}|${frueh}`]: "F" }, basis);
      expect([RUHEZEIT(spaet), RUHEZEIT(frueh)], `Basistag ${basis}`).toContain(r && r.sperre);
      expect(JSON.stringify(m), "die Prüfung speichert nichts").toBe(vorher);
    }
  });
});

describe("uhrVersetzen (Server-Vorlauf und Init-Skript des Browsers)", () => {
  it("versetzt nur jetzt; feste Zeitpunkte, parse, UTC und instanceof bleiben", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-15T22:59:50.000Z"));
    const ziel = { Date };
    const versatz = Date.parse(ABNAHME_ZEITPUNKT) - Date.now();
    uhrVersetzen(versatz, ziel);
    uhrVersetzen(versatz, ziel);                                            // zweimal: wirkt einmal
    expect(new ziel.Date().toISOString()).toBe(ABNAHME_ZEITPUNKT);
    expect(ziel.Date.now()).toBe(Date.parse(ABNAHME_ZEITPUNKT));
    expect(ziel.Date()).toBe(new Date(ABNAHME_ZEITPUNKT).toString());
    expect(new ziel.Date("2026-01-02T03:04:05.000Z").toISOString()).toBe("2026-01-02T03:04:05.000Z");
    expect(new ziel.Date(2026, 0, 2).getFullYear()).toBe(2026);
    expect(ziel.Date.parse("2026-01-02T00:00:00.000Z")).toBe(Date.parse("2026-01-02T00:00:00.000Z"));
    expect(ziel.Date.UTC(2026, 0, 2)).toBe(Date.UTC(2026, 0, 2));
    expect(new ziel.Date()).toBeInstanceOf(Date);
    expect(new ziel.Date() instanceof ziel.Date).toBe(true);
    vi.advanceTimersByTime(1000);
    expect(ziel.Date.now() - Date.parse(ABNAHME_ZEITPUNKT), "die Uhr läuft weiter").toBe(1000);
    const ohne = { Date };
    uhrVersetzen(0, ohne);
    expect(ohne.Date).toBe(Date);
  });
});
