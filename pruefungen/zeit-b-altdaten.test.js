/* ==========================================================================
   WP-ZEIT, ZEIT-B Stufe 1, Schritt 1 — Golden-Anker TEIL A: Altdaten, für immer invariant
   (docs/acc45/ZEIT-B-STUFE1-PLAN.md § 3.2 Teil A, § 6.2; Vertrag ZEIT-BETRIEBSTAG-VERTRAG.md § 9 T-EXP-1, T-ZS-1)

   Was: Ein statischer Altbestand (pruefungen/fixtures/zeit-b-altdaten.json, Modell-1-Stempel in allen Varianten,
   geschlossene Monate mit Freeze Schema 3, ein bestätigter Lohnexport). Festgehalten als Literale:
     - istAbdruck je Monat (server/lib/monatsabschluss.mjs istAbdruck);
     - Entscheidung von stempelWiderspruch für die gleiche Kopie und je eine Mutation (Feld ändern, Feld erfinden,
       Stempel erfinden, Korrektur-Grund ändern) — nur Entscheidung und Schlüssel, nicht der Wortlaut des Grundes;
     - stempelBeiWiederherstellung (Ergebnis-Hashes, Zahl behaltener Stempel);
     - Exporte geschlossener Monate: Zeilen-Prüfsumme der Lohnausgabe (exportZeilenFuer → datevAusFreeze,
       datevZeilenAbdruck), SHA-256 der Freeze-Zeilen, SHA-256 der Lohnausgabe-Datei (datevCSV),
       Zuschlagsstunden (zuschlagStunden, im geschlossenen Monat aus dem Freeze) NUR der Person b3, die alle
       Zuschlagsfälle trägt (T-ZS-1: Sa 21:30 → So 07:15, 24.→25.12., 31.10.→1.11., beide Umstellungsnächte);
       die Zuschläge der übrigen Personen sind nur über die Datei-/Zeilen-Prüfsummen gedeckt. Dazu
       lohnexportVergleich des bestätigten Oktobers.
   Prozesszonen: UTC (CI), Europe/Berlin, Pacific/Kiritimati, America/Los_Angeles — Ergebnis überall gleich.

   REGEL TEIL A: Diese Werte ändern sich NIE — auch nicht durch andere Pakete. Eine nötige Änderung ist ein Befund
   (Altdaten würden umgedeutet), kein Testpflege-Fall: Schritt anhalten, Befund an die Orchestrierung (Plan § 6.2).
   Die Fixture wird nie neu erzeugt (Herkunft: pruefungen/hilfen/zeit-b-altdaten-erzeugen.mjs, Stand ec9d5605).
   Erwartungswerte erhoben auf origin/integration/release-v4 @ ec9d5605.

   zeit-ok: Kein Test liest die Uhr; alle Rechnungen arbeiten auf gespeicherten Daten mit festen Zeitstempeln.
   ========================================================================== */
import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { istAbdruck, exportZeilenFuer, datevZeilenAbdruck, lohnexportVergleich } from "../server/lib/monatsabschluss.mjs";
import { datevAusFreeze } from "../server/lib/isteinfrieren.mjs";
import { stempelWiderspruch, stempelBeiWiederherstellung } from "../server/lib/stempelintegritaet.mjs";
import { datevCSV, zuschlagStunden } from "../src/lib/fachlogik.js";

const FIXTURE = readFileSync(new URL("./fixtures/zeit-b-altdaten.json", import.meta.url), "utf8");
const bestand = () => JSON.parse(FIXTURE).mandant;
const sha = (s) => createHash("sha256").update(s).digest("hex");

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

const MONATE = ["2026-03", "2026-10", "2026-11", "2026-12", "2027-01"];
const GESCHLOSSEN = ["2026-03", "2026-10", "2026-12"];
/** Fest gewählte Schlüssel der Fixture (siehe Erzeuger): ein Modell-1-Stempel mit startAm im geschlossenen Oktober,
    ein korrigierter Stempel (Oktober) und ein Schlüssel, den es nicht gibt. */
const K_FELD = "b3|2026-10-03";
const K_KORREKTUR = "b1|2026-10-04";
const K_NEU = "b3|2026-11-30";

function widerspruchFaelle() {
  const faelle = {
    gleich: () => {},
    feldAendern: (n) => { n.einstempeln[K_FELD].ende = "07:16"; },
    feldErfinden: (n) => { n.einstempeln[K_FELD].zeitmodell = 2; },
    zoneErfinden: (n) => { n.einstempeln[K_FELD].zeitzone = "Europe/Berlin"; },
    stempelErfinden: (n) => { n.einstempeln[K_NEU] = { start: "06:00", startAm: "2026-11-30T05:00:00.000Z" }; },
    korrekturAendern: (n) => { n.einstempeln[K_KORREKTUR].korrekturen[0].grund = "Anderer Grund, nachträglich"; },
  };
  const aus = {};
  for (const [name, mut] of Object.entries(faelle)) {
    for (const [o, opt] of [["standard", {}], ["vollSicht", { vollSicht: true }]]) {
      const alt = bestand(), neu = bestand();
      mut(neu);
      const r = stempelWiderspruch(alt, neu, opt);
      aus[`${name}/${o}`] = r === null ? "angenommen" : `abgewiesen:${r.schluessel}`;
    }
  }
  return aus;
}

function wiederherstellung() {
  /* (1) Sicherung älter: ohne die Januar-Stempel 2027 — sie bleiben aus dem heutigen Stand. (2) Heute fehlt ein Stempel
     (z. B. nach Löschlauf), die Sicherung hat ihn — er kommt zurück. */
  const jetzt = bestand(), sicherung = bestand();
  for (const k of Object.keys(sicherung.einstempeln)) if (k.split("|")[1].startsWith("2027-01")) { delete sicherung.einstempeln[k]; delete sicherung.erfassung[k]; }
  const r1 = stempelBeiWiederherstellung(jetzt, sicherung);
  const jetzt2 = bestand(), sicherung2 = bestand();
  delete jetzt2.einstempeln["b2|2026-11-16"];
  const r2 = stempelBeiWiederherstellung(jetzt2, sicherung2);
  const kurz = (r) => ({ behalten: r.behalten, einstempeln: sha(JSON.stringify(r.mandant.einstempeln)).slice(0, 32),
    erfassung: sha(JSON.stringify(r.mandant.erfassung)).slice(0, 32) });
  return { aelter: kurz(r1), geloescht: kurz(r2) };
}

function exporte() {
  const m = bestand();
  const b3 = m.personen.find((p) => p.id === "b3");
  const aus = {};
  for (const mon of GESCHLOSSEN) {
    const ex = exportZeilenFuer(m, mon);
    aus[mon] = {
      revision: ex.revision, korrekturZu: ex.korrekturZu, n: ex.zeilen.length,
      zeilen: datevZeilenAbdruck(ex.zeilen),
      freeze: sha(JSON.stringify(datevAusFreeze(m, mon))),
      datei: sha(datevCSV(m, mon)),
      zuschlaegeB3: zuschlagStunden(m, b3, mon),
    };
  }
  const v = lohnexportVergleich(m, "2026-10");
  aus.lohnexportVergleich = v;
  return aus;
}

const ankerWerte = () => {
  const m = bestand();
  return {
    abdruck: Object.fromEntries(MONATE.map((mon) => [mon, istAbdruck(m, mon)])),
    widerspruch: widerspruchFaelle(),
    wiederherstellung: wiederherstellung(),
    exporte: exporte(),
  };
};

/* ---- Erwartungswerte (Literale, erhoben auf ec9d5605) — NIE ändern (Regel Teil A, Kopf) ---------------------------- */
const ERWARTET = {
  abdruck: {
    "2026-03": "eb071ae0a70d377afdf09f97a60e8bc4",
    "2026-10": "13268a3968fb1da720ba658914d2926a",
    "2026-11": "773ff1ddbb75c94b026115889b65189b",
    "2026-12": "20e86d36e221c6ef2804f2d47b523c6c",
    "2027-01": "6ae139f13929d72f2bcc4285ce147c8b",
  },
  widerspruch: {
    "gleich/standard": "angenommen", "gleich/vollSicht": "angenommen",
    "feldAendern/standard": "abgewiesen:b3|2026-10-03", "feldAendern/vollSicht": "abgewiesen:b3|2026-10-03",
    "feldErfinden/standard": "abgewiesen:b3|2026-10-03", "feldErfinden/vollSicht": "abgewiesen:b3|2026-10-03",
    "zoneErfinden/standard": "abgewiesen:b3|2026-10-03", "zoneErfinden/vollSicht": "abgewiesen:b3|2026-10-03",
    "stempelErfinden/standard": "abgewiesen:b3|2026-11-30", "stempelErfinden/vollSicht": "abgewiesen:b3|2026-11-30",
    "korrekturAendern/standard": "abgewiesen:b1|2026-10-04", "korrekturAendern/vollSicht": "abgewiesen:b1|2026-10-04",
  },
  wiederherstellung: {
    aelter: { behalten: 25, einstempeln: "227f336b2965c5774958e2b01c7a051a", erfassung: "590496d3f31fec279d0a22bdc929cbda" },
    geloescht: { behalten: 0, einstempeln: "eacbf9ad61be1398aa5a21c2d6b35243", erfassung: "590496d3f31fec279d0a22bdc929cbda" },
  },
  exporte: {
    "2026-03": { revision: 1, korrekturZu: null, n: 9, zeilen: "0d228b16ded9e29b6d6ad64a20eb5270",
      freeze: "5a3f56b905e4fb570d69361606b554cdfbd3ba3f05482054686cbafdb9813c40",
      datei: "21f83f0abbfcc53afdb209e31f37c82c56467374d4e597f8f4448d80a8d8cedc",
      zuschlaegeB3: { nacht: 6, sonntag: 5, feiertag: 0, samstag: 2, gesamt: 6.5 } },          // Frühjahrsnacht 28.→29.03.
    "2026-10": { revision: 1, korrekturZu: null, n: 10, zeilen: "9c06f0b02b01e2d06b65aee728f296e7",
      freeze: "0f8d49bfe040dc2f6d7c052b4daeaec048faad9c8c8bae633195dca10c5b3cb0",
      datei: "4267b8d2dc5231b8d045ce7b35516cb6b19125b9e7c1559d42d33d8df977ab68",
      zuschlaegeB3: { nacht: 22, sonntag: 14.25, feiertag: 8.5, samstag: 4, gesamt: 25 } },   // Sa 21:30→So 07:15, Herbstnacht, 31.10.→1.11.
    "2026-12": { revision: 1, korrekturZu: null, n: 9, zeilen: "f650fa78e6c3dedfecdff9756d23bf00",
      freeze: "5128aed24864c7ac9dd2d8403b7c1243a333b6c0edceee6ee8432ba016f0906d",
      datei: "e8f548c929f5e8b8af0347625e7365ca5fd18df8eb3474438c655630a4b412d7",
      zuschlaegeB3: { nacht: 7, sonntag: 0, feiertag: 6, samstag: 0, gesamt: 7.5 } },          // 24.→25.12.
    lohnexportVergleich: { status: "gleich", bestaetigt: "9c06f0b02b01e2d06b65aee728f296e7", am: "2026-11-04T08:00:00.000Z",
      n: 10, heute: "9c06f0b02b01e2d06b65aee728f296e7" },
  },
};

describe("ZEIT-B Golden-Anker Teil A: Altdaten-Fixtures, für immer invariant", () => {
  it("die Fixture ist der Altbestand: Modell 1 in allen Varianten, kein Zeitmodellfeld", () => {
    const m = bestand();
    const st = Object.values(m.einstempeln);
    expect(st.length).toBe(129);
    expect(st.filter((e) => !e.startAm).length).toBeGreaterThan(0);                 // vor WP-17
    expect(st.filter((e) => e.endeDatum).length).toBeGreaterThan(0);
    expect(st.filter((e) => e.offlineStart).length).toBeGreaterThan(0);
    expect(st.filter((e) => Array.isArray(e.korrekturen)).length).toBeGreaterThan(0);
    expect(st.filter((e) => Array.isArray(e.antraege)).length).toBeGreaterThan(0);
    expect(st.filter((e) => Array.isArray(e.markierungen)).length).toBeGreaterThan(0);
    const z2 = ["zeitmodell", "zeitzone", "zeitzonenVersion", "startKalendertag", "endeKalendertag", "zeitStart", "zeitEnde"];
    expect(st.filter((e) => z2.some((f) => f in e))).toEqual([]);
    expect(m.einstempeln["b2|2026-11-16"]).toEqual({ ende: "06:04" });              // Gerätetag-Schlüssel vor WP-17
    expect(Object.keys(m.monatsabschluss)).toEqual(GESCHLOSSEN);
  });

  for (const zone of ZONEN) {
    it(`Prozesszone ${zone}: alle Anker gleich den eingefrorenen Werten`, () => {
      const w = inZone(zone, ankerWerte);
      expect(w).toEqual(ERWARTET);
    });
  }

  it("Gegenprobe: der Anker ist empfindlich — ein Zeitmodellfeld an einem Stempel ändert genau den Abdruck seines Monats", () => {
    const m = bestand();
    const vorher = Object.fromEntries(MONATE.map((mon) => [mon, istAbdruck(m, mon)]));
    m.einstempeln[K_FELD].zeitmodell = 2;
    const nachher = Object.fromEntries(MONATE.map((mon) => [mon, istAbdruck(m, mon)]));
    for (const mon of MONATE) expect(nachher[mon] === vorher[mon], mon).toBe(mon !== "2026-10");
    /* Ein Feld weniger ebenso. */
    const n = bestand();
    delete n.einstempeln[K_FELD].endeAm;
    expect(istAbdruck(n, "2026-10")).not.toBe(vorher["2026-10"]);
  });
});
