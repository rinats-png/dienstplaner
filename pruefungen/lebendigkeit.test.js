/* ==========================================================================
   LEBENDIGKEIT — die Ablaufregel der Sitzungen, als reine Funktionen

   Die Regel galt vorher zweimal, mit kleinen Abweichungen (sitzungen.mjs,
   accountsitzungen.mjs). Diese Prüfung hält fest, was beide Lesarten tun,
   damit der Umbau auf eine gemeinsame Funktion nichts verschiebt — und damit
   der Aufräumlauf dieselbe Frage dieselbe Antwort bekommt wie der Zugriff.
   ========================================================================== */

import { describe, it, expect } from "vitest";
import { ablaufUrteil, letzteAktivitaet, verlaengernFaellig, VERLAENGERN_AB }
  from "../server/lib/lebendigkeit.mjs";

const MIN = 60 * 1000;
const RUHE = 30 * MIN;
const NUN = 1_800_000_000_000;
const LOCKER = { streng: false, ruhe: RUHE };
const STRENG = { streng: true, ruhe: RUHE };

describe("Die absolute Frist", () => {
  it("gilt bis einschließlich zum Ende", () => {
    for (const o of [LOCKER, STRENG]) {
      expect(ablaufUrteil({ bis: NUN }, NUN, o).abgelaufen).toBe(false);
      expect(ablaufUrteil({ bis: NUN - 1 }, NUN, o)).toMatchObject({ abgelaufen: true, grund: "frist" });
    }
  });

  it("ein fehlendes Ende: streng abgelaufen, locker unklar und nicht abgelaufen", () => {
    expect(ablaufUrteil({}, NUN, STRENG)).toEqual({ abgelaufen: true, grund: "frist", unklar: false });
    expect(ablaufUrteil({}, NUN, LOCKER)).toEqual({ abgelaufen: false, grund: null, unklar: true });
    for (const bis of [undefined, "kein Datum", NaN, Infinity]) {
      expect(ablaufUrteil({ bis }, NUN, STRENG).abgelaufen, String(bis)).toBe(true);
      expect(ablaufUrteil({ bis }, NUN, LOCKER).abgelaufen, String(bis)).toBe(false);
    }
  });

  it("null gilt als Zeitpunkt null, also als abgelaufen (wie der Vergleich vorher)", () => {
    expect(ablaufUrteil({ bis: null }, NUN, LOCKER).grund).toBe("frist");
  });

  it("ein Ende als Zeichenkette wird wie eine Zahl gelesen", () => {
    expect(ablaufUrteil({ bis: String(NUN + 1000) }, NUN, STRENG).abgelaufen).toBe(false);
    expect(ablaufUrteil({ bis: String(NUN - 1000) }, NUN, LOCKER).abgelaufen).toBe(true);
  });
});

describe("Die Untätigkeit", () => {
  const satz = (zuletzt) => ({ bis: NUN + 10 * 3600 * 1000, zuletzt });

  it("endet erst nach der Ruhezeit", () => {
    for (const o of [LOCKER, STRENG]) {
      expect(ablaufUrteil(satz(NUN - RUHE), NUN, o).abgelaufen).toBe(false);
      expect(ablaufUrteil(satz(NUN - RUHE - 1), NUN, o)).toMatchObject({ abgelaufen: true, grund: "untaetig" });
    }
  });

  it("ohne bekannten Zugriff gibt es keine Untätigkeit", () => {
    for (const z of [undefined, 0, null, "x"]) {
      expect(ablaufUrteil(satz(z), NUN, STRENG).abgelaufen, String(z)).toBe(false);
    }
  });

  it("die Frist geht vor: ein abgelaufenes Ende meldet „frist“, nicht „untaetig“", () => {
    expect(ablaufUrteil({ bis: NUN - 1, zuletzt: NUN - 10 * RUHE }, NUN, STRENG).grund).toBe("frist");
  });

  it("die Aktivität verlängert, der spätere Zeitpunkt gilt", () => {
    const s = satz(NUN - 3 * RUHE);
    expect(ablaufUrteil(s, NUN, STRENG).grund).toBe("untaetig");
    expect(ablaufUrteil(s, NUN, { ...STRENG, aktivitaet: { zuletzt: NUN - MIN } }).abgelaufen).toBe(false);
    /* Eine ältere Aktivität macht nichts älter. */
    const frisch = satz(NUN - MIN);
    expect(ablaufUrteil(frisch, NUN, { ...STRENG, aktivitaet: { zuletzt: NUN - 3 * RUHE } }).abgelaufen).toBe(false);
  });

  it("die Aktivität kann das Ende nicht verlängern", () => {
    expect(ablaufUrteil({ bis: NUN - 1, zuletzt: NUN }, NUN, STRENG,).abgelaufen).toBe(true);
    expect(ablaufUrteil({ bis: NUN - 1 }, NUN, { ...STRENG, aktivitaet: { zuletzt: NUN } }).abgelaufen).toBe(true);
  });

  it("eine Aktivität ohne brauchbaren Zeitpunkt zählt nicht", () => {
    for (const a of [{}, { zuletzt: "x" }, { zuletzt: NaN }, null]) {
      expect(letzteAktivitaet({ zuletzt: 5 }, a), JSON.stringify(a)).toBe(5);
    }
  });
});

describe("Die Karenz", () => {
  it("verschiebt Frist und Untätigkeit um genau diese Zeit nach hinten", () => {
    const karenz = 60 * MIN;
    expect(ablaufUrteil({ bis: NUN - karenz }, NUN, { ...STRENG, karenz }).abgelaufen).toBe(false);
    expect(ablaufUrteil({ bis: NUN - karenz - 1 }, NUN, { ...STRENG, karenz }).abgelaufen).toBe(true);
    const s = { bis: NUN + 10 * 3600 * 1000 };
    expect(ablaufUrteil({ ...s, zuletzt: NUN - RUHE - karenz }, NUN, { ...STRENG, karenz }).abgelaufen).toBe(false);
    expect(ablaufUrteil({ ...s, zuletzt: NUN - RUHE - karenz - 1 }, NUN, { ...STRENG, karenz }).abgelaufen).toBe(true);
  });

  it("ohne Karenz gilt die Regel des Zugriffs unverändert", () => {
    expect(ablaufUrteil({ bis: NUN - 1 }, NUN, { ...STRENG, karenz: 0 }).abgelaufen).toBe(true);
  });
});

describe("Die Verlängerung", () => {
  it("ist fällig ohne bekannten Zugriff und nach mehr als einer Minute", () => {
    expect(verlaengernFaellig({}, null, NUN)).toBe(true);
    expect(verlaengernFaellig({ zuletzt: NUN - VERLAENGERN_AB }, null, NUN)).toBe(false);
    expect(verlaengernFaellig({ zuletzt: NUN - VERLAENGERN_AB - 1 }, null, NUN)).toBe(true);
  });

  it("richtet sich nach dem späteren Zugriff von Datensatz und Aktivität", () => {
    expect(verlaengernFaellig({ zuletzt: NUN - 10 * MIN }, { zuletzt: NUN - 5 }, NUN)).toBe(false);
    expect(verlaengernFaellig({ zuletzt: NUN - 5 }, { zuletzt: NUN - 10 * MIN }, NUN)).toBe(false);
  });
});
