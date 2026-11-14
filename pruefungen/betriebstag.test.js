// WP-ZEIT, Teilpaket ZEIT-A + ZEIT-C (docs/acc45/ZEIT-BETRIEBSTAG-VERTRAG.md, § 9: T-MN-1, T-GZ-*, T-CL-1).
//
// Befund P2: heute() (server/lib/engine/zeit.mjs) war im Browser der Rechnertag des Geräts, im Server der Tag der
// Prozesszeitzone. Ein Gerät in UTC, Kalifornien oder Auckland sah um Mitternacht (Berlin) den falschen Tag und damit
// den falschen Stempelvorgang. Befund P3: ankerMontag (server/lib/leerbetrieb.mjs) mischte Ortszeit und UTC-Datum.
//
// Jede Uhr in dieser Datei ist fest (vi.setSystemTime); die Prozesszeitzone wird je Fall über process.env.TZ
// umgestellt (Node liest TZ bei jeder Zuweisung neu) und danach wiederhergestellt.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { betriebstag, wanduhr, montagDerWoche, zoneErlaubt, ERLAUBTE_ZONEN, BETRIEBSZONE } from "../server/lib/betriebszeit.mjs";
import { heute, mitTagesdatum } from "../server/lib/engine/zeit.mjs";
import { heute as heuteOberflaeche } from "../src/lib/datum.js";
import { heuteBerlin, uhrzeitBerlin } from "../server/lib/zeiterfassung.mjs";
import { ankerMontag, baueLeerenBetrieb } from "../server/lib/leerbetrieb.mjs";
import { stempelVorgang } from "../src/stempelvorgang.js";

/** Gerätezeitzonen der Testmatrix: Betriebszone, UTC (CI), westlich (Kalifornien), östlich (Auckland, Kiritimati UTC+14). */
const GERAETEZONEN = ["Europe/Berlin", "UTC", "America/Los_Angeles", "Pacific/Auckland", "Pacific/Kiritimati"];

const TZ_VORHER = process.env.TZ;
function inZone(zone, f) {
  process.env.TZ = zone;
  try { return f(); } finally { if (TZ_VORHER === undefined) delete process.env.TZ; else process.env.TZ = TZ_VORHER; }
}

beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); });
afterEach(() => {
  vi.useRealTimers();
  if (TZ_VORHER === undefined) delete process.env.TZ; else process.env.TZ = TZ_VORHER;
});

/* Zeitpunkte (UTC) → erwarteter Berliner Kalendertag und Wanduhr. Umstellungsnächte 2026: 29.03. (02:00 MEZ → 03:00
   MESZ) und 25.10. (03:00 MESZ → 02:00 MEZ). */
const FAELLE = [
  ["2026-03-28T22:59:59Z", "2026-03-28", "23:59"], // letzte Sekunde des Samstags (MEZ)
  ["2026-03-28T23:00:00Z", "2026-03-29", "00:00"], // Mitternacht vor der Frühjahrsumstellung
  ["2026-03-29T00:59:00Z", "2026-03-29", "01:59"], // letzte Minute vor der Lücke
  ["2026-03-29T01:00:00Z", "2026-03-29", "03:00"], // 02:00–02:59 gibt es nicht
  ["2026-03-29T21:59:59Z", "2026-03-29", "23:59"], // letzte Sekunde des Umstellungstags (jetzt MESZ)
  ["2026-03-29T22:00:00Z", "2026-03-30", "00:00"],
  ["2026-10-24T21:59:59Z", "2026-10-24", "23:59"], // letzte Sekunde vor der Herbstnacht (MESZ)
  ["2026-10-24T22:00:00Z", "2026-10-25", "00:00"],
  ["2026-10-25T00:30:00Z", "2026-10-25", "02:30"], // erste 02:30 (MESZ)
  ["2026-10-25T01:30:00Z", "2026-10-25", "02:30"], // zweite 02:30 (MEZ) — Wanduhr mehrdeutig, Zeitpunkt nicht
  ["2026-10-25T22:59:59Z", "2026-10-25", "23:59"], // letzte Sekunde des Umstellungstags (jetzt MEZ)
  ["2026-10-25T23:00:00Z", "2026-10-26", "00:00"],
  ["2026-12-31T22:59:59Z", "2026-12-31", "23:59"], // Jahreswechsel
  ["2026-12-31T23:00:00Z", "2027-01-01", "00:00"],
  ["2026-11-14T23:00:01Z", "2026-11-15", "00:00"], // 00:00:01 Berlin
];

describe("betriebstag / wanduhr (ZEIT-A)", () => {
  it.each(FAELLE)("%s → %s %s, in jeder Prozesszeitzone gleich", (t, tag, uhr) => {
    for (const z of GERAETEZONEN) {
      inZone(z, () => {
        expect(betriebstag(new Date(t)), z).toBe(tag);
        expect(betriebstag(Date.parse(t)), z).toBe(tag);
        expect(betriebstag(t), z).toBe(tag);
        expect(wanduhr(new Date(t)), z).toBe(uhr);
      });
    }
  });

  it("Ohne Argument gilt die (feste) Uhr", () => {
    vi.setSystemTime(new Date("2026-03-28T23:00:00Z"));
    expect(betriebstag()).toBe("2026-03-29");
    expect(wanduhr()).toBe("00:00");
  });

  it("Positivliste (E1): nur Europe/Berlin; andere Zonen werden abgewiesen, nie still umgedeutet", () => {
    expect(BETRIEBSZONE).toBe("Europe/Berlin");
    expect([...ERLAUBTE_ZONEN]).toEqual(["Europe/Berlin"]);
    expect(Object.isFrozen(ERLAUBTE_ZONEN)).toBe(true);
    expect(zoneErlaubt("Europe/Berlin")).toBe(true);
    for (const z of ["UTC", "Europe/Vienna", "America/New_York", "Pacific/Auckland", "Mars/Olympus_Mons", "", "europe/berlin",
      "Europe/Berlin/", "../Europe/Berlin", "x".repeat(65), null, undefined, 42, {}]) {
      expect(zoneErlaubt(z), String(z)).toBe(false);
    }
    expect(() => betriebstag(new Date("2026-11-14T12:00:00Z"), "UTC")).toThrow(RangeError);
    expect(() => wanduhr(new Date("2026-11-14T12:00:00Z"), "Pacific/Auckland")).toThrow(RangeError);
  });

  it("Ungültiger Zeitpunkt: Fehler statt erfundenem Tag", () => {
    expect(() => betriebstag(new Date(NaN))).toThrow(RangeError);
    expect(() => betriebstag("kein-zeitpunkt")).toThrow(RangeError);
    expect(() => wanduhr(Number.NaN)).toThrow(RangeError);
  });

  it("heuteBerlin ist ein Alias ohne Verhaltensänderung (Golden-Vergleich gegen die bisherige Formel, inkl. DST-Nächte)", () => {
    const alt = (d) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(d);
    const start = Date.parse("2026-03-27T00:00:00Z");
    /* Viertelstunden über vier Tage um die Frühjahrsnacht, dann um die Herbstnacht, dann um den Jahreswechsel. */
    for (const basis of [start, Date.parse("2026-10-23T00:00:00Z"), Date.parse("2026-12-30T00:00:00Z")]) {
      for (let i = 0; i < 4 * 24 * 4; i++) {
        const d = new Date(basis + i * 15 * 60000);
        expect(heuteBerlin(d)).toBe(alt(d));
        expect(wanduhr(d)).toBe(uhrzeitBerlin(d));
      }
    }
  });
});

describe("heute() der Planrechnung (ZEIT-C, Befund P2)", () => {
  it.each(FAELLE)("um %s ist heute() in jeder Gerätezone der Berliner Tag %s", (t, tag) => {
    vi.setSystemTime(new Date(t));
    for (const z of GERAETEZONEN) {
      inZone(z, () => {
        expect(heute(), z).toBe(tag);
        expect(heuteOberflaeche(), z).toBe(tag);
      });
    }
  });

  it("mitTagesdatum legt den Tag weiterhin fest (Gegenrechnung auf dem Server)", () => {
    vi.setSystemTime(new Date("2026-10-24T22:00:00Z"));
    inZone("Pacific/Kiritimati", () => {
      expect(mitTagesdatum("2026-01-05", () => heute())).toBe("2026-01-05");
      expect(heute()).toBe("2026-10-25");
    });
  });
});

describe("Stempelvorgang über Mitternacht in fremden Gerätezonen (T-GZ, T-MN-1, T-CL-1)", () => {
  const p = { id: "zeit-t1-person-a7c3" };
  /* Eingestempelt 23:30 Berlin am Samstag, 2026-11-14 (= 22:30Z). */
  const D = "2026-11-14", D1 = "2026-11-15";
  const offen = { einstempeln: { [`${p.id}|${D}`]: { start: "23:30", startAm: "2026-11-14T22:30:00.000Z" } } };

  it.each(GERAETEZONEN)("Gerät in %s: um 00:02 Berlin heißt es „Ausstempeln“ für den Vortag", (z) => {
    const jetzt = new Date("2026-11-14T23:02:00Z");
    vi.setSystemTime(jetzt);
    inZone(z, () => {
      /* Aufruf wie in der Stempeluhr: Tag aus heute(). */
      expect(stempelVorgang(offen, p, heute(), jetzt, [])).toEqual(
        { datum: D, st: offen.einstempeln[`${p.id}|${D}`], vortag: true, offen: true, veraltet: false });
      /* Ohne Tagesparameter: derselbe Vorgang (T-CL-1). */
      expect(stempelVorgang(offen, p, undefined, jetzt, [])).toEqual(stempelVorgang(offen, p, D1, jetzt, []));
    });
  });

  it.each(GERAETEZONEN)("Gerät in %s: um 23:59:59 Berlin ist es noch der Tag des Beginns, um 00:00:01 der Folgetag", (z) => {
    inZone(z, () => {
      const vor = new Date("2026-11-14T22:59:59Z");
      vi.setSystemTime(vor);
      expect(stempelVorgang(offen, p, heute(), vor, [])).toMatchObject({ datum: D, vortag: false, offen: true, veraltet: false });
      const nach = new Date("2026-11-14T23:00:01Z");
      vi.setSystemTime(nach);
      expect(stempelVorgang(offen, p, heute(), nach, [])).toMatchObject({ datum: D, vortag: true, offen: true, veraltet: false });
      /* Ohne Stempel: Einstempeln für den Berliner Tag, nicht für den Gerätetag. */
      expect(stempelVorgang({}, p, heute(), nach, [])).toMatchObject({ datum: D1, vortag: false, offen: false });
    });
  });

  it.each(GERAETEZONEN)("Gerät in %s: Nachtdienst über die Herbstumstellung (22:00 → 06:00, 9 h) bleibt beim Schichttag", (z) => {
    const nacht = { einstempeln: { [`${p.id}|2026-10-24`]: { start: "22:00", startAm: "2026-10-24T20:00:00.000Z" } } };
    inZone(z, () => {
      const ende = new Date("2026-10-25T05:00:00Z"); // 06:00 MEZ
      vi.setSystemTime(ende);
      expect(heute()).toBe("2026-10-25");
      expect(stempelVorgang(nacht, p, heute(), ende, [])).toMatchObject({ datum: "2026-10-24", vortag: true, offen: true, veraltet: false });
    });
  });

  it.each(GERAETEZONEN)("Gerät in %s: Nachtdienst über die Frühjahrsumstellung (22:00 → 06:00, 7 h) bleibt beim Schichttag", (z) => {
    const nacht = { einstempeln: { [`${p.id}|2026-03-28`]: { start: "22:00", startAm: "2026-03-28T21:00:00.000Z" } } };
    inZone(z, () => {
      const ende = new Date("2026-03-29T04:00:00Z"); // 06:00 MESZ
      vi.setSystemTime(ende);
      expect(heute()).toBe("2026-03-29");
      expect(stempelVorgang(nacht, p, heute(), ende, [])).toMatchObject({ datum: "2026-03-28", vortag: true, offen: true, veraltet: false });
    });
  });
});

describe("Wochenanker eines neuen Betriebs (Befund P3, leerbetrieb.mjs)", () => {
  const ANKER = [
    ["2026-11-15T23:30:00Z", "2026-11-16"], // Montag 00:30 Berlin — UTC ist noch Sonntag
    ["2026-11-15T22:59:59Z", "2026-11-09"], // Sonntag 23:59:59 Berlin
    ["2026-11-16T22:59:00Z", "2026-11-16"], // Montag 23:59 Berlin — Auckland ist schon Dienstag
    ["2026-03-29T01:30:00Z", "2026-03-23"], // Sonntag der Frühjahrsumstellung, 03:30 MESZ
    ["2026-10-25T23:10:00Z", "2026-10-26"], // Montag nach der Herbstumstellung, 00:10 MEZ
  ];
  it.each(ANKER)("%s → Montag %s, in jeder Prozesszeitzone", (t, montag) => {
    for (const z of GERAETEZONEN) {
      inZone(z, () => {
        expect(ankerMontag(new Date(t)), z).toBe(montag);
        expect(montagDerWoche(new Date(t)), z).toBe(montag);
        vi.setSystemTime(new Date(t));
        expect(baueLeerenBetrieb({ name: "Zeit T1 Anker", branche: "pflege", raum: "zeit-t1-anker-5f2e9b" }).mandanten[0].anker, z).toBe(montag);
      });
    }
  });
});
