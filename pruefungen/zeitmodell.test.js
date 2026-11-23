/* ==========================================================================
   WP-ZEIT, ZEIT-B Stufe 1, Schritt 2 — Lesekern server/lib/zeitmodell.mjs
   (docs/acc45/ZEIT-B-STUFE1-PLAN.md § 2.4, § 2.5, § 5 Schritt 2, § 10 N2/N3 und „Schritt 2 umgesetzt")

   Geprüft, mit festen Erwartungswerten:
   - zeitmodellVon ist total: Schlüssel fehlt / undefined → 1; Zahl 2 → 2; alles andere → "UNBEKANNT" (fail-closed).
   - signaturVollstaendig (N2): Feldpräsenz zeitmodell, zeitzone, startKalendertag, zeitStart, zeitStart.eingegangenAm —
     unabhängig vom Wert von zeitmodell.
   - Zone wird NUR bei Modell 2 mit vollständiger Signatur geprüft und gelesen; ein vagabundierendes Feld zeitzone an
     einem Modell-1-Datensatz bleibt ohne Wirkung und ohne Befund.
   - N3: zeitmodell 2 ohne vollständige Signatur → Befund ZEITMODELL_SIGNATUR_UNVOLLSTAENDIG, Zone und Kalendertage
     nach der Modell-1-Regel, lesbar (kein fail-closed).
   - Leserregel I6 (T-LEG-1/2): Modell 1 leitet nie einen Kalendertag aus startAm/endeAm ab; Gerätetag-Schlüssel bleibt.
   - Gemischter Datensatz (Modell 2 mit Ende ohne endeKalendertag) → ZEITMODELL_ENDE_ALT, Ende nach Modell-1-Regel.
   - zoneZum: ohne gespeicherten Verlauf implizite Version 1 Europe/Berlin (auch an den Umstellungskanten); ein
     gespeicherter Verlauf ist in Stufe 1 unbekannt → fail-closed.
   - Wächter: Schritt 2 hat keinen Aufrufer — keine Produktionsdatei bindet server/lib/zeitmodell.mjs ein (Schritt 3
     ändert diesen Wächter bewusst).
   Prozesszonen: UTC (CI), Europe/Berlin, Pacific/Kiritimati, America/Los_Angeles — Ergebnis überall gleich.

   zeit-ok: Kein Test liest die Uhr; alle Zeitpunkte sind feste ISO-Literale.
   ========================================================================== */
import { describe, it, expect, afterEach } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  UNBEKANNT, BEFUND, zeitmodellVon, signaturVollstaendig, beginnModellZwei, zoneVon, kalendertageVon, stempelLesen,
  zoneZum,
} from "../server/lib/zeitmodell.mjs";

const ZONEN = ["UTC", "Europe/Berlin", "Pacific/Kiritimati", "America/Los_Angeles"];
/** Erwarteter Versatz der Prozesszone am 2026-01-15 (Date#getTimezoneOffset, Minuten) — beweist, dass die Zone wirkt. */
const VERSATZ = { UTC: 0, "Europe/Berlin": -60, "Pacific/Kiritimati": -840, "America/Los_Angeles": 480 };
const TZ_VORHER = process.env.TZ;
const tzZurueck = () => { if (TZ_VORHER === undefined) delete process.env.TZ; else process.env.TZ = TZ_VORHER; };
afterEach(tzZurueck);
function inZone(zone, f) {
  process.env.TZ = zone;
  try {
    expect(new Date("2026-01-15T12:00:00Z").getTimezoneOffset(), `Prozesszone ${zone} wirkt nicht`).toBe(VERSATZ[zone]);
    return f();
  } finally { tzZurueck(); }
}

/** Ein vollständiger Modell-2-Beginn (Form laut Plan § 2.1), Schichttag 2026-11-10. */
const m2 = (extra = {}) => ({
  start: "06:00", startAm: "2026-11-10T05:00:00.000Z",
  zeitmodell: 2, zeitzone: "Europe/Berlin", zeitzonenVersion: 1, startKalendertag: "2026-11-10",
  zeitStart: { quelle: "eingang", eingegangenAm: "2026-11-10T05:00:00.000Z" },
  ...extra,
});
const ohne = (o, ...k) => { const c = { ...o }; for (const x of k) delete c[x]; return c; };

/* ---- zeitmodellVon: feste Erwartungen (Plan § 2.5, § 5 Schritt 2) ------------------------------------------------- */
const MODELL_FAELLE = [
  ["Schlüssel fehlt", {}, 1],
  ["undefined", { zeitmodell: undefined }, 1],
  ["Zahl 2", { zeitmodell: 2 }, 2],
  ["Text \"2\"", { zeitmodell: "2" }, UNBEKANNT],
  ["null", { zeitmodell: null }, UNBEKANNT],
  ["Zahl 1", { zeitmodell: 1 }, UNBEKANNT],
  ["Zahl 3", { zeitmodell: 3 }, UNBEKANNT],
  ["2.5", { zeitmodell: 2.5 }, UNBEKANNT],
  ["NaN", { zeitmodell: NaN }, UNBEKANNT],
  ["Infinity", { zeitmodell: Infinity }, UNBEKANNT],
  ["0", { zeitmodell: 0 }, UNBEKANNT],
  ["Objekt", { zeitmodell: { wert: 2 } }, UNBEKANNT],
  ["Array", { zeitmodell: [2] }, UNBEKANNT],
  ["true", { zeitmodell: true }, UNBEKANNT],
  ["leerer Text", { zeitmodell: "" }, UNBEKANNT],
  ["BigInt 2n", { zeitmodell: 2n }, UNBEKANNT],
  ["Zahl-Objekt Object(2)", { zeitmodell: Object(2) }, UNBEKANNT],
];

function modellTests() {
  for (const [name, e, erw] of MODELL_FAELLE) {
    it(`zeitmodellVon: ${name} → ${String(erw)}`, () => { expect(zeitmodellVon(e)).toBe(erw); });
  }
  it("zeitmodellVon: ein Altdatensatz (Modell 1, alle heutigen Felder) → 1", () => {
    expect(zeitmodellVon({ start: "21:30", startAm: "2026-10-03T19:30:00.000Z", ende: "07:15", endeAm: "2026-10-04T05:15:00.000Z",
      endeDatum: "2026-10-04", offlineStart: { offline: true } })).toBe(1);
  });
  it("zeitmodellVon: kein Datensatz (null, undefined, Text, Zahl, Array) → UNBEKANNT, nie still Modell 1", () => {
    for (const e of [null, undefined, "2", 2, true, [], [{ zeitmodell: 2 }]]) expect(zeitmodellVon(e), String(e)).toBe(UNBEKANNT);
  });
  it("zeitmodellVon liest nur eigene Felder (aus JSON gibt es keine geerbten)", () => {
    expect(zeitmodellVon(Object.create({ zeitmodell: 3 }))).toBe(1);
    expect(zeitmodellVon(Object.assign(Object.create(null), { zeitmodell: 2 }))).toBe(2);
    expect(zeitmodellVon(JSON.parse('{"__proto__":{"zeitmodell":3}}'))).toBe(1);
  });
}

/* ---- N2: vollständige Signatur über Feldpräsenz ------------------------------------------------------------------- */
function signaturTests() {
  it("N2: vollständige Signatur = zeitmodell, zeitzone, startKalendertag, zeitStart, zeitStart.eingegangenAm vorhanden", () => {
    expect(signaturVollstaendig(m2())).toBe(true);
    for (const k of ["zeitmodell", "zeitzone", "startKalendertag", "zeitStart"]) {
      expect(signaturVollstaendig(ohne(m2(), k)), `ohne ${k}`).toBe(false);
      expect(signaturVollstaendig(m2({ [k]: undefined })), `${k}: undefined`).toBe(false);
    }
    expect(signaturVollstaendig(m2({ zeitStart: { quelle: "eingang" } }))).toBe(false);
    expect(signaturVollstaendig(m2({ zeitStart: null }))).toBe(false);
    expect(signaturVollstaendig(m2({ zeitStart: "2026-11-10T05:00:00.000Z" }))).toBe(false);
    expect(signaturVollstaendig(m2({ zeitStart: ["eingegangenAm"] }))).toBe(false);
    /* zeitzonenVersion gehört nicht zur Signatur (N2 nennt sie nicht). */
    expect(signaturVollstaendig(ohne(m2(), "zeitzonenVersion"))).toBe(true);
  });
  it("N2: unabhängig vom Wert von zeitmodell (3, \"2\", null, 1 zählen als vorhanden)", () => {
    for (const v of [3, "2", null, 1, 2.5]) expect(signaturVollstaendig(m2({ zeitmodell: v })), String(v)).toBe(true);
  });
  it("N2: kein Datensatz → keine Signatur", () => {
    for (const e of [null, undefined, "x", 2, []]) expect(signaturVollstaendig(e)).toBe(false);
  });
  it("R-S2: „Beginn Modell 2“ = vollständige Signatur UND zeitmodellVon 2 UND Zone erlaubt", () => {
    expect(beginnModellZwei(m2())).toBe(true);
    expect(beginnModellZwei(m2({ zeitmodell: 3 }))).toBe(false);              // vollständig, unbekannter Wert
    expect(beginnModellZwei(m2({ zeitmodell: "2" }))).toBe(false);
    expect(beginnModellZwei(ohne(m2(), "startKalendertag"))).toBe(false);     // N3
    expect(beginnModellZwei(ohne(m2(), "zeitStart"))).toBe(false);            // N3
    expect(beginnModellZwei(m2({ zeitzone: "America/New_York" }))).toBe(false);
    expect(beginnModellZwei({ start: "06:00", zeitzone: "Europe/Berlin" })).toBe(false);  // vagabundierendes Feld
    expect(beginnModellZwei(null)).toBe(false);
  });
}

/* ---- Zone: nur bei Modell 2 mit vollständiger Signatur ------------------------------------------------------------ */
function zoneTests() {
  it("Modell 1 mit vagabundierendem zeitzone \"America/New_York\" → Berlin, kein Befund (Plan § 5 Schritt 2)", () => {
    expect(zoneVon({ start: "06:00", zeitzone: "America/New_York" })).toEqual({ zone: "Europe/Berlin", befunde: [] });
    expect(zoneVon({ start: "06:00", zeitzone: 42 })).toEqual({ zone: "Europe/Berlin", befunde: [] });
    expect(zoneVon({})).toEqual({ zone: "Europe/Berlin", befunde: [] });
  });
  it("Modell 2 (vollständig) mit \"America/New_York\" → ZONE_UNBEKANNT, fail-closed (keine Zone)", () => {
    expect(zoneVon(m2({ zeitzone: "America/New_York" }))).toEqual({ zone: null, befunde: [BEFUND.ZONE_UNBEKANNT] });
    for (const z of ["", null, "europe/berlin", "Europe/Berlin ", "Etc/UTC", "UTC", 1])
      expect(zoneVon(m2({ zeitzone: z })).befunde, String(z)).toEqual([BEFUND.ZONE_UNBEKANNT]);
  });
  it("Modell 2 (vollständig) mit Europe/Berlin → Zone des Datensatzes", () => {
    expect(zoneVon(m2())).toEqual({ zone: "Europe/Berlin", befunde: [] });
  });
  it("N3: zeitmodell 2 ohne vollständige Signatur → Zone nach Modell-1-Regel, zeitzone wird nicht geprüft", () => {
    expect(zoneVon(ohne(m2({ zeitzone: "America/New_York" }), "startKalendertag")))
      .toEqual({ zone: "Europe/Berlin", befunde: [BEFUND.ZEITMODELL_SIGNATUR_UNVOLLSTAENDIG] });
    expect(zoneVon({ zeitmodell: 2 })).toEqual({ zone: "Europe/Berlin", befunde: [BEFUND.ZEITMODELL_SIGNATUR_UNVOLLSTAENDIG] });
  });
  it("Unbekanntes Modell → ZEITMODELL_UNBEKANNT, keine Zone (auch mit erlaubter Zone)", () => {
    expect(zoneVon(m2({ zeitmodell: 3 }))).toEqual({ zone: null, befunde: [BEFUND.ZEITMODELL_UNBEKANNT] });
    expect(zoneVon({ zeitmodell: null, zeitzone: "Europe/Berlin" })).toEqual({ zone: null, befunde: [BEFUND.ZEITMODELL_UNBEKANNT] });
  });
}

/* ---- Kalendertage (I6, T-LEG-1/2, gemischt, N3, Mitternacht, Umstellungsnächte) ---------------------------------- */
function kalendertagTests() {
  it("T-LEG-1: Modell 1 leitet nie aus startAm ab — 23:59:59 und 00:00:01 Berlin bleiben beim Schlüsseltag", () => {
    /* 2026-11-10 23:59:59 Berlin = 22:59:59Z; 2026-11-11 00:00:01 Berlin = 23:00:01Z am 10. */
    const a = { start: "23:59", startAm: "2026-11-10T22:59:59.000Z" };
    const b = { start: "00:00", startAm: "2026-11-10T23:00:01.000Z" };
    expect(kalendertageVon(a, "2026-11-10")).toEqual({ start: "2026-11-10", ende: null, befunde: [] });
    expect(kalendertageVon(b, "2026-11-11")).toEqual({ start: "2026-11-11", ende: null, befunde: [] });
    /* Derselbe Stempel unter einem „falschen" Schlüssel bleibt beim Schlüssel (kein Umdeuten). */
    expect(kalendertageVon(b, "2026-11-10").start).toBe("2026-11-10");
  });
  it("T-LEG-2: Gerätetag-Schlüssel vor WP-17 bleibt, auch wenn startAm/endeAm auf einen anderen Berliner Tag zeigen", () => {
    const e = { start: "22:00", startAm: "2026-11-17T21:00:00.000Z", ende: "06:04", endeAm: "2026-11-18T05:04:00.000Z" };
    expect(kalendertageVon(e, "2026-11-16")).toEqual({ start: "2026-11-16", ende: "2026-11-16", befunde: [] });
    expect(kalendertageVon({ ende: "06:04" }, "2026-11-16")).toEqual({ start: "2026-11-16", ende: "2026-11-16", befunde: [] });
  });
  it("Modell 1: Ende = endeDatum ?? Schlüsseltag; offener Beginn → ende null", () => {
    expect(kalendertageVon({ start: "21:30", ende: "07:15", endeDatum: "2026-10-04" }, "2026-10-03").ende).toBe("2026-10-04");
    expect(kalendertageVon({ start: "21:30", ende: "07:15", endeDatum: null }, "2026-10-03").ende).toBe("2026-10-03");
    expect(kalendertageVon({ start: "21:30", startAm: "2026-10-03T19:30:00.000Z" }, "2026-10-03").ende).toBe(null);
    expect(kalendertageVon({ start: "21:30", endeAm: "2026-10-04T05:15:00.000Z" }, "2026-10-03").ende).toBe("2026-10-03");
  });
  it("Umstellungsnächte: Modell 1 nach Schlüssel, Modell 2 nach gespeicherten Werten (nie neu berechnet)", () => {
    /* Frühjahrsnacht 2026-03-29: Beginn 28.03. 22:00 MEZ, Ende 29.03. 06:00 MESZ. */
    const f1 = { start: "22:00", startAm: "2026-03-28T21:00:00.000Z", ende: "06:00", endeAm: "2026-03-29T04:00:00.000Z", endeDatum: "2026-03-29" };
    expect(kalendertageVon(f1, "2026-03-28")).toEqual({ start: "2026-03-28", ende: "2026-03-29", befunde: [] });
    const f2 = m2({ start: "22:00", startAm: "2026-03-28T21:00:00.000Z", startKalendertag: "2026-03-28",
      ende: "06:00", endeAm: "2026-03-29T04:00:00.000Z", endeDatum: "2026-03-29", endeKalendertag: "2026-03-29" });
    expect(kalendertageVon(f2, "2026-03-28")).toEqual({ start: "2026-03-28", ende: "2026-03-29", befunde: [] });
    /* Herbstnacht 2026-10-25: Beginn 24.10. 22:00 MESZ, Ende 25.10. 06:00 MEZ (Nacht hat 9 h). */
    const h2 = m2({ start: "22:00", startAm: "2026-10-24T20:00:00.000Z", startKalendertag: "2026-10-24",
      ende: "06:00", endeAm: "2026-10-25T05:00:00.000Z", endeDatum: "2026-10-25", endeKalendertag: "2026-10-25" });
    expect(kalendertageVon(h2, "2026-10-24")).toEqual({ start: "2026-10-24", ende: "2026-10-25", befunde: [] });
    /* Gespeicherte Werte gelten, auch wenn startAm auf einen anderen Tag zeigt: der Leser rechnet nicht nach. */
    const anders = m2({ startAm: "2026-11-11T05:00:00.000Z" });
    expect(kalendertageVon(anders, "2026-11-10").start).toBe("2026-11-10");
  });
  it("gemischter Datensatz (Modell 2, Ende ohne endeKalendertag) → ZEITMODELL_ENDE_ALT, Ende nach Modell-1-Regel", () => {
    const e = m2({ ende: "07:15", endeAm: "2026-11-11T06:15:00.000Z", endeDatum: "2026-11-11" });
    expect(kalendertageVon(e, "2026-11-10")).toEqual({ start: "2026-11-10", ende: "2026-11-11", befunde: [BEFUND.ZEITMODELL_ENDE_ALT] });
    const g = m2({ ende: "14:00", endeAm: "2026-11-10T13:00:00.000Z" });
    expect(kalendertageVon(g, "2026-11-10")).toEqual({ start: "2026-11-10", ende: "2026-11-10", befunde: [BEFUND.ZEITMODELL_ENDE_ALT] });
    /* Offener Modell-2-Beginn ist nicht gemischt. */
    expect(kalendertageVon(m2(), "2026-11-10")).toEqual({ start: "2026-11-10", ende: null, befunde: [] });
  });
  it("N3: zeitmodell 2 ohne startKalendertag/zeitStart → Befund, Kalendertage nach Modell-1-Regel, lesbar (kein fail-closed)", () => {
    const e = ohne(m2({ startAm: "2026-11-10T23:30:00.000Z", ende: "06:00", endeDatum: "2026-11-11" }), "startKalendertag");
    expect(kalendertageVon(e, "2026-11-10"))
      .toEqual({ start: "2026-11-10", ende: "2026-11-11", befunde: [BEFUND.ZEITMODELL_SIGNATUR_UNVOLLSTAENDIG] });
    const f = ohne(m2({ endeKalendertag: "2026-12-24" }), "zeitStart");
    /* endeKalendertag eines unvollständigen Datensatzes wird nicht gelesen (Modell-1-Regel). */
    expect(kalendertageVon(f, "2026-11-10"))
      .toEqual({ start: "2026-11-10", ende: null, befunde: [BEFUND.ZEITMODELL_SIGNATUR_UNVOLLSTAENDIG] });
    const r = stempelLesen(f, "2026-11-10");
    expect(r).toMatchObject({ modell: 2, signatur: false, regel: 1, lesbar: true, zone: "Europe/Berlin" });
  });
  it("vollständige Signatur mit zeitmodell 3 → UNBEKANNT, fail-closed (keine Kalendertage, keine Zone)", () => {
    const r = stempelLesen(m2({ zeitmodell: 3 }), "2026-11-10");
    expect(r).toEqual({ modell: UNBEKANNT, signatur: true, regel: null, lesbar: false, zone: null, start: null, ende: null,
      befunde: [BEFUND.ZEITMODELL_UNBEKANNT] });
    expect(kalendertageVon(m2({ zeitmodell: 3 }), "2026-11-10")).toEqual({ start: null, ende: null, befunde: [BEFUND.ZEITMODELL_UNBEKANNT] });
    /* Auch ohne Signatur bleibt der unbekannte Wert unbekannt (Rückfallregel § 3.6 ist Sache der Wächter, Schritt 3). */
    expect(stempelLesen({ zeitmodell: "2" }, "2026-11-10")).toMatchObject({ modell: UNBEKANNT, signatur: false, lesbar: false });
  });
  it("Modell 2 mit unerlaubter Zone → fail-closed, auch die Kalendertage", () => {
    expect(stempelLesen(m2({ zeitzone: "America/New_York" }), "2026-11-10")).toEqual({ modell: 2, signatur: true, regel: null,
      lesbar: false, zone: null, start: null, ende: null, befunde: [BEFUND.ZONE_UNBEKANNT] });
  });
  it("unechte Kalendertage → KALENDERTAG_UNGUELTIG, fail-closed (nie gerollt, P2-12)", () => {
    const fc = (r) => ({ lesbar: r.lesbar, start: r.start, ende: r.ende, befunde: r.befunde });
    const zu = { lesbar: false, start: null, ende: null, befunde: [BEFUND.KALENDERTAG_UNGUELTIG] };
    expect(fc(stempelLesen(m2({ startKalendertag: "2026-02-30" }), "2026-11-10"))).toEqual(zu);
    expect(fc(stempelLesen(m2({ ende: "07:00", endeKalendertag: "2026-13-01" }), "2026-11-10"))).toEqual(zu);
    expect(fc(stempelLesen({ start: "06:00" }, "2026-11-31"))).toEqual(zu);
    expect(fc(stempelLesen({ start: "06:00" }, undefined))).toEqual(zu);
    expect(fc(stempelLesen({ ende: "07:00", endeDatum: "2026-11-1" }, "2026-11-10"))).toEqual(zu);
  });
  it("die Leser schreiben nie zurück (Eingabe bleibt bitgleich)", () => {
    const faelle = [m2(), m2({ zeitmodell: 3 }), ohne(m2(), "zeitStart"), m2({ ende: "07:00" }), { start: "06:00", zeitzone: "America/New_York" }];
    for (const e of faelle) {
      const vorher = JSON.stringify(e);
      stempelLesen(e, "2026-11-10"); zoneVon(e); kalendertageVon(e, "2026-11-10"); zeitmodellVon(e); signaturVollstaendig(e); beginnModellZwei(e);
      expect(JSON.stringify(e)).toBe(vorher);
    }
  });
}

/* ---- zoneZum (Plan § 2.4, Vertrag § 4.1 Absatz 2) ----------------------------------------------------------------- */
function zoneZumTests() {
  const IMPLIZIT = { version: 1, zone: "Europe/Berlin", implizit: true };
  it("ohne gespeicherten Verlauf: implizite Version 1 Europe/Berlin — auch an den Umstellungskanten und Mitternacht", () => {
    const m = { personen: [] };
    for (const t of [
      "2026-03-29T00:59:59.999Z", "2026-03-29T01:00:00.000Z",   // Frühjahr: letzte MEZ-Millisekunde / erste MESZ
      "2026-10-25T00:59:59.999Z", "2026-10-25T01:00:00.000Z",   // Herbst: letzte MESZ-Millisekunde / erste MEZ
      "2026-11-10T22:59:59.000Z", "2026-11-10T23:00:01.000Z",   // 23:59:59 / 00:00:01 Berlin
      "1999-12-31T23:00:00.000Z", "2999-06-01T00:00:00.000Z",
    ]) {
      expect(zoneZum(m, t), t).toEqual(IMPLIZIT);
      expect(zoneZum(m, new Date(t)), t).toEqual(IMPLIZIT);
      expect(zoneZum(m, Date.parse(t)), t).toEqual(IMPLIZIT);
    }
    expect(zoneZum({ zeitzonenVerlauf: undefined }, "2026-11-10T12:00:00Z")).toEqual(IMPLIZIT);
  });
  it("gespeicherter Verlauf ist in Stufe 1 unbekannt → fail-closed (nie still Berlin)", () => {
    const zu = { version: null, zone: null, implizit: false, befund: BEFUND.ZEITZONENVERLAUF_UNBEKANNT };
    for (const v of [[], [{ version: 1, zone: "Europe/Berlin" }], null, "Europe/Berlin", {}])
      expect(zoneZum({ zeitzonenVerlauf: v }, "2026-11-10T12:00:00Z"), JSON.stringify(v)).toEqual(zu);
  });
  it("ungültiger Zeitpunkt oder fehlender Betrieb → Fehler (nie die echte Uhr)", () => {
    expect(() => zoneZum({}, undefined)).toThrow(RangeError);
    expect(() => zoneZum({}, "kein Datum")).toThrow(RangeError);
    expect(() => zoneZum({}, NaN)).toThrow(RangeError);
    expect(() => zoneZum(null, "2026-11-10T12:00:00Z")).toThrow(TypeError);
    expect(() => zoneZum([], "2026-11-10T12:00:00Z")).toThrow(TypeError);
  });
}

describe("ZEIT-B Schritt 2: Lesekern zeitmodell.mjs", () => {
  modellTests();
  signaturTests();
  zoneTests();
  kalendertagTests();
  zoneZumTests();

  for (const zone of ZONEN) {
    it(`Prozesszone ${zone}: alle Leser liefern dasselbe Ergebnis`, () => {
      const lauf = () => {
        const proben = [
          [m2(), "2026-11-10"],
          [m2({ ende: "07:15", endeAm: "2026-11-11T06:15:00.000Z", endeDatum: "2026-11-11" }), "2026-11-10"],
          [ohne(m2(), "startKalendertag"), "2026-11-10"],
          [{ start: "00:00", startAm: "2026-11-10T23:00:01.000Z", zeitzone: "America/New_York" }, "2026-11-11"],
          [{ start: "22:00", startAm: "2026-10-24T20:00:00.000Z", ende: "06:00", endeAm: "2026-10-25T05:00:00.000Z", endeDatum: "2026-10-25" }, "2026-10-24"],
          [m2({ zeitmodell: 3 }), "2026-11-10"],
        ];
        return {
          lesen: proben.map(([e, k]) => stempelLesen(e, k)),
          zone: zoneZum({}, "2026-03-29T01:00:00.000Z"),
        };
      };
      expect(inZone(zone, lauf)).toEqual(lauf());
      expect(inZone(zone, lauf).lesen.map((r) => [r.regel, r.start, r.ende])).toEqual([
        [2, "2026-11-10", null], [2, "2026-11-10", "2026-11-11"], [1, "2026-11-10", null], [1, "2026-11-11", null],
        [1, "2026-10-24", "2026-10-25"], [null, null, null],
      ]);
    });
  }
});

/* ---- Wächter: Schritt 2 ohne Aufrufer ----------------------------------------------------------------------------- */
describe("ZEIT-B Schritt 2: zeitmodell.mjs hat keinen Aufrufer im Produktcode", () => {
  /* Schritt 3 (Fail-closed-Wächter) bindet das Modul bewusst ein und ändert dann DIESEN Test (Plan § 4). */
  const WURZEL = fileURLToPath(new URL("..", import.meta.url));
  const SELBST = join("server", "lib", "zeitmodell.mjs");
  function dateien(dir, aus = []) {
    let eintraege;
    try { eintraege = readdirSync(join(WURZEL, dir), { withFileTypes: true }); } catch { return aus; }
    for (const d of eintraege) {
      if (d.name === "node_modules" || d.name.startsWith(".")) continue;
      const p = join(dir, d.name);
      if (d.isDirectory()) dateien(p, aus);
      else if (/\.(mjs|cjs|js|jsx|ts|tsx)$/.test(d.name)) aus.push(p);
    }
    return aus;
  }
  it("keine Datei unter server/, src/, werkzeug/, deploy/, public/ und server.mjs nennt zeitmodell.mjs", () => {
    const liste = ["server", "src", "werkzeug", "deploy", "public"].flatMap((d) => dateien(d)).concat(["server.mjs"]);
    expect(liste.length).toBeGreaterThan(50);
    expect(liste).toContain(SELBST);
    const treffer = liste.filter((p) => p !== SELBST)
      .filter((p) => /zeitmodell\.mjs|\/zeitmodell["'`]/.test(readFileSync(join(WURZEL, p), "utf8")))
      .map((p) => relative(".", p).split(sep).join("/"));
    expect(treffer).toEqual([]);
  });
});
