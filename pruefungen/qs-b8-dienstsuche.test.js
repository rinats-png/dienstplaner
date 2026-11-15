/* ==========================================================================
   QS-ZEIT: Tagsuche von B8 (e2e/dienstsuche.mjs) unter festen Uhren — findet immer einen gültigen Tag, nie einen mit
   verletzter Ruhezeit (docs/acc45/QS-ZEITABHAENGIGKEIT.md, Staging-Gate mit echter Serveruhr)

   Gegen einen fremden Container (Staging-Gate) läuft die Suite mit der echten Uhr, der Demo-Bestand entsteht am echten
   Tag. Hier derselbe Weg ohne Browser: Demo-Bestand (demobestand()) und Serverprüfung (fachpruefungUebermittlung, die
   PUT /api/bestand nutzt) unter FESTEN Uhren; der Betriebstag ist der Berliner Tag der Uhr (betriebstag), die Suche
   probiert ab Betriebstag + 3 den Frühdienst. Geprüft über einen ganzen Schichtzyklus (Vorlage v5: 35 Tage) und alle
   Wochentage, Monats- und Jahreswechsel (Anker montag(Jahr-01-01)), beide Zeitumstellungen und das UTC-Fenster
   22:59–23:59 (Berliner Mitternacht). Die Ruhezeitregel ist nicht berührt: Jeder abgewiesene Tag trägt die Ruhezeitmeldung,
   der gefundene Tag wird angenommen, und ein Spätdienst am Vortag des gefundenen Tages wird weiterhin gesperrt.

   Aufruf: npx vitest run pruefungen/qs-b8-dienstsuche.test.js
   ========================================================================== */
import { describe, it, expect, vi, afterEach } from "vitest";
import { demobestand } from "../src/lib/fachlogik.js";
import { fachpruefungUebermittlung } from "../server/lib/schutzdurchsetzung.mjs";
import { betriebstag } from "../server/lib/betriebszeit.mjs";
import { sucheDiensttag, istRuhezeitSperre, SUCHTAGE_MAX } from "../e2e/dienstsuche.mjs";
import { tagPlus } from "../e2e/zeitbasis.mjs";

afterEach(() => { vi.useRealTimers(); });

function demoAm(zeitpunkt) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(zeitpunkt));
  const m = demobestand().mandanten[0];
  const ma = m.personen.filter((x) => x.rolle === "mitarbeiter" && x.status !== "inaktiv" && x.imSchichtdienst !== false)[0];
  return { m, ma, basis: betriebstag(new Date(zeitpunkt)) };
}
function planen(m, eintraege, heute) {
  const neu = JSON.parse(JSON.stringify(m));
  neu.abweichungen = { ...(neu.abweichungen || {}), ...eintraege };
  return fachpruefungUebermittlung(m, neu, heute);
}
const RUHEZEIT = (tag) => `Einteilung am ${tag} nicht möglich: Ruhezeit unter 11 Stunden. Sperrende Regeln lassen sich nicht bestätigen.`;

/** Die Suche wie in B8: Frühdienst probieren; die Antwort des Servers (Text der Sperre oder angenommen). */
async function sucheAm(zeitpunkt) {
  const { m, ma, basis } = demoAm(zeitpunkt);
  const probiert = [];
  const r = await sucheDiensttag(basis, (tag) => {
    probiert.push(tag);
    const x = planen(m, { [`${ma.id}|${tag}`]: "F" }, basis);
    return x === null ? { ok: true } : { ok: false, text: x.sperre };
  });
  return { m, ma, basis, probiert, ...r };
}

/** Uhren: 40 aufeinanderfolgende Tage (mehr als ein Zyklus, alle Wochentage) zu drei Tageszeiten, dazu Sonderfälle. */
const uhren = [];
for (let i = 0; i < 40; i++) {
  const tag = tagPlus("2026-11-01", i);
  for (const z of ["T00:05:00Z", "T12:00:00Z", "T22:59:30Z", "T23:30:00Z"]) uhren.push(`${tag}${z}`);
}
const sonder = [
  "2026-10-24T22:59:50Z", "2026-10-25T00:30:00Z", "2026-10-25T23:30:00Z", "2026-10-26T22:59:59Z",   // Ende der Sommerzeit (2026-10-25)
  "2027-03-26T23:30:00Z", "2027-03-27T22:59:59Z", "2027-03-27T23:00:00Z", "2027-03-28T23:30:00Z",   // Beginn der Sommerzeit (2027-03-28)
  "2026-11-30T23:30:00Z", "2026-12-31T22:59:59Z", "2026-12-31T23:00:00Z", "2027-01-01T00:00:00Z",   // Monats- und Jahreswechsel
  "2027-02-28T23:30:00Z", "2027-04-30T21:59:59Z", "2027-04-30T22:00:00Z", "2027-06-30T22:30:00Z",   // Monatsende, Sommerzeit (Mitternacht = 22:00Z)
  "2028-02-28T23:30:00Z", "2028-02-29T23:30:00Z",                                                    // Schaltjahr
];

describe("Tagsuche für B8: immer ein gültiger Tag, nie eine Ruhezeitverletzung", () => {
  it.each([...uhren, ...sonder])("Uhr %s", async (zeitpunkt) => {
    const { m, ma, basis, probiert, tag, abgelehnt } = await sucheAm(zeitpunkt);
    expect(tag >= tagPlus(basis, 3), "nie vor Betriebstag + 3").toBe(true);
    expect(probiert.length, "höchstens ein Zyklus").toBeLessThan(SUCHTAGE_MAX);
    expect(probiert[probiert.length - 1]).toBe(tag);
    /* Der gefundene Tag wird angenommen (derselbe Serverweg wie PUT /api/bestand). */
    expect(planen(m, { [`${ma.id}|${tag}`]: "F" }, basis)).toBeNull();
    /* Jeder übersprungene Tag ist eine echte Ruhezeitsperre mit der Meldung der Regel. */
    for (const t of abgelehnt) expect(planen(m, { [`${ma.id}|${t}`]: "F" }, basis)).toEqual({ sperre: RUHEZEIT(t) });
    /* Die Regel gilt unverändert: Spätdienst am Vortag des gefundenen Tages macht denselben Frühdienst unzulässig. */
    const r = planen(m, { [`${ma.id}|${tagPlus(tag, -1)}`]: "S", [`${ma.id}|${tag}`]: "F" }, basis);
    expect(r && r.sperre, "Spätdienst + Frühdienst bleibt gesperrt").toMatch(/Ruhezeit unter 11 Stunden/);
  });

  it("über den ganzen Schichtzyklus wird nicht immer Betriebstag + 3 genommen (die Suche ist nötig) und es gibt ohne Suche rote Tage", async () => {
    let uebersprungen = 0, tage = 0;
    for (let i = 0; i < 40; i++) {
      const r = await sucheAm(`${tagPlus("2026-11-01", i)}T12:00:00Z`);
      tage++; if (r.abgelehnt.length) uebersprungen++;
    }
    expect(uebersprungen, "mindestens ein Basistag trifft auf eine Ruhezeitsperre (2026-11-15 ist belegt)").toBeGreaterThan(0);
    expect(uebersprungen).toBeLessThan(tage);
  });

  it("der dokumentierte Ausfalltag 2026-11-15: + 3 gesperrt, die Suche nimmt den nächsten zulässigen Tag", async () => {
    const r = await sucheAm("2026-11-15T09:00:00Z");
    expect(r.abgelehnt[0]).toBe("2026-11-18");
    expect(r.tag > "2026-11-18").toBe(true);
  });
});

describe("Sucheverhalten", () => {
  it("bricht bei jeder anderen Abweisung sofort ab (nichts wird überspielt)", async () => {
    await expect(sucheDiensttag("2026-11-14", () => ({ ok: false, text: "Kein Zugriff" }))).rejects.toThrow(/anderem Grund/);
  });
  it("meldet, wenn kein Tag zulässig ist (kein stilles Weitersuchen)", async () => {
    await expect(sucheDiensttag("2026-11-14", (t) => ({ ok: false, text: RUHEZEIT(t) }), { max: 5 })).rejects.toThrow(/Kein Tag in 5 Tagen/);
  });
  it("erkennt nur die Ruhezeitsperre", () => {
    expect(istRuhezeitSperre(RUHEZEIT("2026-11-18"))).toBe(true);
    expect(istRuhezeitSperre("Einteilung am 2026-11-18 nicht möglich: Höchstarbeitszeit.")).toBe(false);
    expect(istRuhezeitSperre(undefined)).toBe(false);
  });
});
