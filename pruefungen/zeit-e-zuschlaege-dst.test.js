/* ==========================================================================
   WP-ZEIT, Teilpaket ZEIT-E / E6 — Zuschläge in den Umstellungsnächten (Befund Z47)

   Vertrag: docs/acc45/ZEIT-BETRIEBSTAG-VERTRAG.md (§ 8.2 Zuschläge, § 9 T-DST-H1, T-ZS-1, § 11 E6).
   Betreiberentscheidung 2026-11-14 (bindend): Korrektur für OFFENE Monate jetzt; ABGESCHLOSSENE Monate bleiben
   unverändert (keine Neuberechnung, keine stille Migration); historische Korrekturen nur über den kontrollierten
   Revisionsweg (Wiederöffnen + neuer Abschluss); nur Europe/Berlin; eingefrorene Abrechnungsgrundlagen unberührt.

   Feste Uhr: vi.setSystemTime (nur Date). Die „vorher"-Werte (Hashes, Stunden) sind mit demselben Bestand
   (pruefungen/zeit-e-fixture.js) auf integration/release-v4 @ d84e4a83 (vor ZEIT-E) erhoben.
   ========================================================================== */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import * as MA from "../server/lib/monatsabschluss.mjs";
import * as IE from "../server/lib/isteinfrieren.mjs";
import { RECHEN_STAND } from "../server/lib/lohnrechnung.mjs";
import { bruttoAm, addDays, dauerAm } from "../server/lib/regelwerk.mjs";
import { istEinfrierenSchema1 } from "../werkzeug/wp16-messung.mjs";
import { zeitEBetrieb, OKT_ZEIT_E as OKT, MAERZ_ZEIT_E as MAERZ } from "./zeit-e-fixture.js";

const JETZT = "2026-11-05T09:00:00Z";
const WER_L = { personId: "l1", name: "L", rolle: "leitung" };
let wurzel, A;

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-zeit-e-zuschlaege-"));
  process.env.CENTRIC_DATEN = wurzel;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(JETZT));
  A = await import("../src/App.jsx");
}, 120000);
afterAll(async () => {
  vi.useRealTimers();
  if (wurzel) await rm(wurzel, { recursive: true, force: true });
});

const sha = (s) => createHash("sha256").update(s).digest("hex");
const da = (start, ende) => ({ start, ende, pause: 0 });
const anteile = (datum, start, ende, stand) => IE.tagesanteile(datum, da(start, ende), stand).map((t) => [t.datum, t.minuten]);
let nr = 0;
const zu = (m, monat) => {
  const r = MA.abschliessen(m, { monat, trotzPrueffaellen: true }, WER_L, new Date(JETZT), `zeit-e-ma-${monat}-${++nr}`, "2026-11-05");
  if ("status" in r) throw new Error(r.grund);
  return r.mandant;
};
const auf = (m, monat) => {
  const r = MA.wiederoeffnen(m, { monat, grund: "ZEIT-E Revisionsweg: Zuschläge Umstellungsnacht" }, WER_L, new Date(JETZT), `zeit-e-w-${monat}-${++nr}`);
  if ("status" in r) throw new Error(r.grund);
  return r.mandant;
};

/* Vorher-Werte, erhoben auf d84e4a83 (Rechenstand 2) mit zeitEBetrieb — siehe Kopf. */
const VORHER = {
  [OKT]: { z: [15, 6, 6, 4], rv: 2,
    freeze: "a3eeb82be264afa6d3ed996f6cc6b6920581844ac819524e04c61370d3c50a9d",
    csv: "43dc39a3d912aa8a3ce821141ee54ade57fc49684290b2dcb7690f74cfe96364",
    zw: "ad29cd5518c70e128a9edb79828c0e1fcc79a2a4db1fb71b86541b7f5dd6181e",
    zs: { nacht: 15, sonntag: 6, feiertag: 6, samstag: 4, gesamt: 23.5 } },
  [MAERZ]: { z: [6, 6, 0, 2], rv: 2,
    freeze: "c49ddb6534a1cd37b43f6ab37881186048ac574b3d7bb986e94e58a050f70d3c",
    csv: "dd0cf821b3facc36afdda4021bb6ef5505556d4eed15df6a88d4612278912009",
    zw: "9b601f5bb961199d2ec500008d84e2e28e6ad2af3b6be41e318e8f32b1c6f90e",
    zs: { nacht: 6, sonntag: 6, feiertag: 0, samstag: 2, gesamt: 6.5 } },
};

/* ------------------------------------------------------------------------ */
describe("ZEIT-E Z47: Tagesanteile mit wirklichen Minuten in Europe/Berlin", () => {
  it("Rechenstand ist 3; die Zone ist ausschließlich Europe/Berlin", () => {
    expect(RECHEN_STAND).toBe(3);
    expect(IE.BETRIEBSZONE_ZUSCHLAEGE).toBe("Europe/Berlin");
    expect(IE.RECHEN_STAND_WANDUHR).toBe(2);
  });

  it("T-DST-H1 Herbst: Sa 24.10.2026 22:00 → So 25.10. 06:00 = 9 h, Sonntagsanteil 7 h (vorher 6 h)", () => {
    expect(anteile("2026-10-24", "22:00", "06:00")).toEqual([["2026-10-24", 120], ["2026-10-25", 420]]);
    expect(anteile("2026-10-24", "22:00", "06:00", 2)).toEqual([["2026-10-24", 120], ["2026-10-25", 360]]);
  });

  it("Frühjahr: Sa 28.03.2026 22:00 → So 29.03. 06:00 = 7 h, Sonntagsanteil 5 h (vorher 6 h)", () => {
    expect(anteile("2026-03-28", "22:00", "06:00")).toEqual([["2026-03-28", 120], ["2026-03-29", 300]]);
    expect(anteile("2026-03-28", "22:00", "06:00", 2)).toEqual([["2026-03-28", 120], ["2026-03-29", 360]]);
  });

  it("Dienst ganz im Umstellungstag: 00:00–08:00 am 25.10. = 9 h, am 29.03. = 7 h", () => {
    expect(anteile("2026-10-25", "00:00", "08:00")).toEqual([["2026-10-25", 540]]);
    expect(anteile("2026-03-29", "00:00", "08:00")).toEqual([["2026-03-29", 420]]);
  });

  it("Dienst über die Umstellung hinweg: 01:00–03:30 am 25.10. = 210 min; 01:00–03:30 am 29.03. = 90 min", () => {
    expect(anteile("2026-10-25", "01:00", "03:30")).toEqual([["2026-10-25", 210]]);
    expect(anteile("2026-03-29", "01:00", "03:30")).toEqual([["2026-03-29", 90]]);
  });

  it("Sprungpunkt-Grenzen: Ende genau 02:00 noch nicht betroffen; Beginn in Lücke/Doppelstunde eindeutig", () => {
    expect(anteile("2026-03-29", "00:00", "02:00")).toEqual([["2026-03-29", 120]]);
    expect(anteile("2026-10-25", "00:00", "02:00")).toEqual([["2026-10-25", 120]]);
    /* 02:30 gibt es am 29.03. nicht (nach vorn geschoben = 03:30 Sommerzeit = 01:30Z), am 25.10. zweimal (die spätere
       = 01:30Z); Mitternachten sind eindeutig. */
    expect(IE.berlinZeitpunkt("2026-03-29", 150)).toBe(Date.UTC(2026, 2, 29, 1, 30));
    expect(IE.berlinZeitpunkt("2026-10-25", 150)).toBe(Date.UTC(2026, 9, 25, 1, 30));
    expect(IE.berlinZeitpunkt("2026-03-29", 0)).toBe(Date.UTC(2026, 2, 28, 23, 0));
    expect(IE.berlinZeitpunkt("2026-10-25", 0)).toBe(Date.UTC(2026, 9, 24, 22, 0));
    expect(IE.berlinZeitpunkt("2026-10-25", 1440)).toBe(Date.UTC(2026, 9, 25, 23, 0));
    /* Beginn in Lücke/Doppelstunde: dieselbe Dauer wie der Lohn (dauerAm/uhrversatz) — Z22 bleibt offen, keine
       zweite Lesart in den Zuschlägen. */
    expect(anteile("2026-03-29", "02:30", "10:00")).toEqual([["2026-03-29", 450]]);
    expect(anteile("2026-10-25", "02:30", "10:00")).toEqual([["2026-10-25", 450]]);
  });

  it("eindeutige Wanduhrzeiten: Tagesanteile = Abstand der wirklichen Zeitpunkte (Intl, Europe/Berlin)", () => {
    const luecke = (d, min) => ["2026-03-29", "2026-10-25", "2027-03-28", "2027-10-31"].includes(d) && min % 1440 >= 120 && min % 1440 < 180;
    const dienste = [["22:00", "06:00"], ["21:30", "07:15"], ["00:00", "08:00"], ["01:00", "03:30"], ["18:00", "06:00"], ["06:00", "14:00"]];
    const tage = ["2026-03-28", "2026-03-29", "2026-10-24", "2026-10-25", "2027-03-27", "2027-03-28", "2027-10-30", "2027-10-31", "2026-07-15"];
    let n = 0;
    for (const d of tage) for (const [s, e] of dienste) {
      const sm = Number(s.slice(0, 2)) * 60 + Number(s.slice(3)); let em = Number(e.slice(0, 2)) * 60 + Number(e.slice(3));
      if (em <= sm) em += 1440;
      const ed = em > 1440 ? addDays(d, 1) : d;
      if (luecke(d, sm) || luecke(ed, em)) continue;
      const summe = IE.tagesanteile(d, da(s, e)).reduce((a, t) => a + t.minuten, 0);
      expect(summe, `${d} ${s}-${e}`).toBe((IE.berlinZeitpunkt(d, em) - IE.berlinZeitpunkt(d, sm)) / 60000);
      n++;
    }
    expect(n).toBeGreaterThan(40);
  });

  it("0:00-Grenzen: Ende 24:00 ohne Folgetag; Sonntag 22:00 → Montag 06:00 ohne Umstellung unverändert", () => {
    expect(anteile("2026-10-24", "22:00", "00:00")).toEqual([["2026-10-24", 120]]);
    expect(anteile("2026-10-25", "22:00", "06:00")).toEqual([["2026-10-25", 120], ["2026-10-26", 360]]);
    expect(anteile("2026-03-29", "22:00", "06:00")).toEqual([["2026-03-29", 120], ["2026-03-30", 360]]);
    expect(anteile("2026-08-01", "21:30", "07:15")).toEqual(anteile("2026-08-01", "21:30", "07:15", 2));
  });

  it("Invariante: Summe der Tagesanteile = bruttoAm an jedem Tag 2026–2027 (inkl. beider Umstellungen je Jahr)", () => {
    const dienste = [["22:00", "06:00"], ["21:00", "06:00"], ["00:00", "08:00"], ["01:00", "03:30"], ["02:30", "10:00"],
      ["20:00", "02:00"], ["06:00", "14:00"], ["18:00", "06:00"], ["23:59", "00:01"], ["02:00", "03:00"], ["00:00", "00:00"]];
    let d = "2026-01-01", abweichend = [], tage = 0, ungleichWanduhr = 0;
    while (d <= "2027-12-31") {
      for (const [s, e] of dienste) {
        const x = da(s, e);
        const summe = IE.tagesanteile(d, x).reduce((a, t) => a + t.minuten, 0);
        if (summe !== Math.round(bruttoAm(d, x) * 60)) abweichend.push(`${d} ${s}-${e}: ${summe}`);
        if (summe !== IE.tagesanteile(d, x, 2).reduce((a, t) => a + t.minuten, 0)) ungleichWanduhr++;
      }
      d = addDays(d, 1); tage++;
    }
    expect(abweichend).toEqual([]);
    expect(tage).toBe(730);
    /* Nur Dienste in bzw. über den vier Umstellungsnächten weichen von der Wanduhr ab. */
    expect(ungleichWanduhr).toBeGreaterThan(0);
    expect(ungleichWanduhr).toBeLessThanOrEqual(4 * 2 * 11);
  });

  it("Rechenstand < 3 rechnet die Wanduhr-Teilung von damals bitgleich (für abgeschlossene Altmonate)", () => {
    expect(anteile("2026-10-24", "21:30", "07:15", 2)).toEqual([["2026-10-24", 150], ["2026-10-25", 435]]);
    expect(anteile("2026-10-24", "21:30", "07:15", 1)).toEqual([["2026-10-24", 150], ["2026-10-25", 435]]);
    expect(anteile("2026-10-24", "21:30", "07:15")).toEqual([["2026-10-24", 150], ["2026-10-25", 495]]);
  });
});

/* ------------------------------------------------------------------------ */
describe("ZEIT-E Z47: Sonn-, Feiertags-, Samstags- und Nachtanteile eines Diensttages", () => {
  const m = { bundesland: "BB", einheiten: [], einstellungen: { nachtVon: "23:00", nachtBis: "06:00" } };
  const leer = () => ({ nacht: 0, sonntag: 0, feiertag: 0, samstag: 0 });
  const addiere = (d, s, e, stand) => { const r = leer(); IE.zuschlagTagAddieren(m, null, d, da(s, e), r, stand); return r; };

  it("Herbst-Sonntag: Samstag 2 h, Sonntag 7 h; Nachtfenster 23–06 = 8 h (Nacht schon vorher richtig)", () => {
    expect(addiere("2026-10-24", "22:00", "06:00")).toEqual({ nacht: 8, sonntag: 7, feiertag: 0, samstag: 2 });
    expect(addiere("2026-10-24", "22:00", "06:00", 2)).toEqual({ nacht: 8, sonntag: 6, feiertag: 0, samstag: 2 });
  });

  it("Frühjahrs-Sonntag: Samstag 2 h, Sonntag 5 h; Nachtfenster 23–06 = 6 h", () => {
    expect(addiere("2026-03-28", "22:00", "06:00")).toEqual({ nacht: 6, sonntag: 5, feiertag: 0, samstag: 2 });
  });

  it("Feiertag in der Umstellungsnacht: Reformationstag So 31.10.2027 (BB) = 7 h Feiertag (vorher 6 h)", () => {
    expect(addiere("2027-10-30", "22:00", "06:00")).toEqual({ nacht: 8, sonntag: 0, feiertag: 7, samstag: 2 });
    expect(addiere("2027-10-30", "22:00", "06:00", 2)).toEqual({ nacht: 8, sonntag: 0, feiertag: 6, samstag: 2 });
  });

  it("Summe der Anteile = Bruttodauer der Umstellungsnacht (dauerAm ohne Pause)", () => {
    const r = addiere("2026-10-24", "22:00", "06:00");
    expect(r.sonntag + r.samstag).toBe(dauerAm("2026-10-24", da("22:00", "06:00")));
  });
});

/* ------------------------------------------------------------------------ */
describe("ZEIT-E E6: offene Monate korrigiert, abgeschlossene Monate unverändert", { timeout: 180000 }, () => {
  it("offener Oktober/März: Sonntag 7 h bzw. 5 h statt 6 h; Nacht, Feiertag (Allerheiligen, Monatsgrenze) und Gesamt unverändert", () => {
    const roh = zeitEBetrieb(A);
    const p = roh.personen[0];
    expect(A.zuschlagStunden(roh, p, OKT)).toEqual({ ...VORHER[OKT].zs, sonntag: 7 });
    expect(A.zuschlagStunden(roh, p, MAERZ)).toEqual({ ...VORHER[MAERZ].zs, sonntag: 5 });
    /* T-ZS-1 Monatsgrenze: der Dienst 31.10. → 1.11. (Allerheiligen, BY) zählt zum Oktober, 6 h Feiertag. */
    expect(A.zuschlagStunden(roh, p, "2026-11")).toMatchObject({ feiertag: 0, sonntag: 0 });
    expect(IE.zuschlagStand(roh, OKT)).toBe(3);
  });

  it("neuer Abschluss friert die korrigierten Werte mit Rechenstand 3 ein; abgeschlossen = offen", () => {
    const roh = zeitEBetrieb(A);
    const p = roh.personen[0];
    const m = zu(roh, OKT);
    expect(m.istEingefroren[`a1|${OKT}`].z).toEqual([15, 7, 6, 4]);
    expect(m.istEingefroren[`*|${OKT}`].rv).toBe(3);
    expect(A.zuschlagStunden(m, p, OKT)).toEqual(A.zuschlagStunden(roh, p, OKT));
    expect(A.datevSaetze(m, OKT)).toEqual(A.datevSaetze(roh, OKT));
    expect(A.datevSaetze(m, OKT).find((z) => z.lohnart === "1410").stunden).toBe(7);
    expect(IE.datevHinweise(m, OKT).rechenstand).toBeUndefined();
  });

  for (const mon of [OKT, MAERZ]) {
    it(`vor ZEIT-E abgeschlossener ${mon} (Schema 3, rv 2): Freeze, Zuschläge, Zuschlagswert und DATEV-Datei bytegleich`, () => {
      const roh = zeitEBetrieb(A);
      const p = roh.personen[0];
      /* Ein Abschluss des alten Standes unterscheidet sich vom heutigen genau in z und rv (alles andere hängt nicht
         an Z47) — so liegt der alte Abschluss vor; der Hash beweist, dass er dem damals erzeugten gleich ist. */
      const neu = zu(roh, mon);
      const alt = { ...neu, istEingefroren: { ...neu.istEingefroren,
        [`a1|${mon}`]: { ...neu.istEingefroren[`a1|${mon}`], z: VORHER[mon].z },
        [`*|${mon}`]: { ...neu.istEingefroren[`*|${mon}`], rv: VORHER[mon].rv } } };
      expect(sha(JSON.stringify(IE.eingefrorenDesMonats(alt, mon)))).toBe(VORHER[mon].freeze);
      const vorFreeze = JSON.stringify(alt.istEingefroren);
      expect(A.zuschlagStunden(alt, p, mon)).toEqual(VORHER[mon].zs);
      expect(sha(JSON.stringify(A.zuschlagWert(alt, p, mon)))).toBe(VORHER[mon].zw);
      expect(sha(A.datevCSV(alt, mon))).toBe(VORHER[mon].csv);
      /* Nichts wird zurückgeschrieben: das Lesen ändert den Freeze nicht. */
      expect(JSON.stringify(alt.istEingefroren)).toBe(vorFreeze);
      /* Die Lohnausgabe sagt nur, dass heute anders gerechnet wird — die eingefrorenen Werte gelten. */
      expect(IE.datevHinweise(alt, mon).rechenstand).toBe(2);
      expect(A.lohnausgabeText(alt, mon)).toContain("Abschluss mit Rechenstand 2");
      expect(A.lohnausgabeText(alt, mon)).toContain("Die eingefrorenen Werte gelten unverändert.");
      expect(IE.zuschlagStand(alt, mon)).toBe(2);
    });

    it(`Altabschluss ${mon} ohne eingefrorene Zuschläge (Schema 1): rechnet weiter mit der Wanduhr — keine Neuberechnung`, () => {
      const roh = zeitEBetrieb(A);
      const p = roh.personen[0];
      const s1 = { ...roh, monatsabschluss: { [mon]: { abgeschlossen: true } }, istEingefroren: istEinfrierenSchema1(roh, mon) };
      expect(IE.freezeStatus(s1, mon)).toEqual({ schema: 1 });
      expect(IE.zuschlagStand(s1, mon)).toBe(2);
      expect(A.zuschlagStunden(s1, p, mon)).toEqual(VORHER[mon].zs);
    });
  }

  it("historische Korrektur nur über den Revisionsweg: Wiederöffnen + neuer Abschluss friert Rechenstand 3 ein", () => {
    const roh = zeitEBetrieb(A);
    const p = roh.personen[0];
    const neu = zu(roh, OKT);
    const alt = { ...neu, istEingefroren: { ...neu.istEingefroren,
      [`a1|${OKT}`]: { ...neu.istEingefroren[`a1|${OKT}`], z: VORHER[OKT].z },
      [`*|${OKT}`]: { ...neu.istEingefroren[`*|${OKT}`], rv: 2 } } };
    expect(A.zuschlagStunden(alt, p, OKT).sonntag).toBe(6);
    const offen = auf(alt, OKT);
    expect(IE.freezeStatus(offen, OKT)).toBeNull();
    expect(A.zuschlagStunden(offen, p, OKT).sonntag).toBe(7);
    const revidiert = zu(offen, OKT);
    expect(revidiert.istEingefroren[`a1|${OKT}`].z).toEqual([15, 7, 6, 4]);
    expect(revidiert.istEingefroren[`*|${OKT}`].rv).toBe(3);
    expect(revidiert.monatsabschluss[OKT].stand).not.toBe(alt.monatsabschluss[OKT].stand);
  });
});
