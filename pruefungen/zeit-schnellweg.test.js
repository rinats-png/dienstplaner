// Zeit-Schnellweg (WP-48.7 Rest, docs/acc45/WP48-TEILSPEICHERUNG.md): zeitpunktAusWanduhr rechnet für Europe/Berlin
// und ganze Minuten 2000–2999 aus einer je Jahr gegen Intl geprüften Umstellungstabelle statt je Aufruf über
// Intl.formatToParts; kalendertagEcht ohne split/Date; letzterSonntag gemerkt je (Jahr, Monat).
//
// Differenzialtest: Die ALTEN Fassungen stehen wörtlich in pruefungen/hilfen/zeit-schnellweg-referenz.mjs (Stand
// integration/release-v4 1163c54f). Verglichen wird Ergebnis UND Fehler (Typ und Text):
// - alle Minuten (−180 … 1620) beider Umstellungssonntage jedes Jahres 2000–2100 (Lücke 29.03., doppelte Stunde 25.10.),
// - Stichproben je Jahr 2101–2999 (Kantenminuten der Umstellungssonntage, Nachbartage),
// - 20 000 Zufallstage 2000–2999 mit Zufallsminuten (fester Startwert), auch Bruchteile von Minuten,
// - Grenzfälle: unechte Tage (P2-12, werfen), NaN/Infinity/Zeichenkette als Minuten, fremde Zone, Jahresränder 2000/2999,
// - kalendertagEcht für jeden Tag 2000–2100 und Stichproben bis 2999 samt unechter Formen,
// - letzterSonntag/uhrsprung/uhrversatz für alle Monate 1990–3010 bzw. jeden Tag 2000–2100, in mehreren Prozesszeitzonen.
// Erwartet: 0 Abweichungen.
// zeit-ok: Kein Test liest die Uhr; jeder Vergleich übergibt feste Kalendertage und Minuten (Zufall mit festem Startwert).
import { describe, it, expect, afterEach } from "vitest";
import * as ALT from "./hilfen/zeit-schnellweg-referenz.mjs";
import { zeitpunktAusWanduhr, zeitpunktAusWanduhrErgebnis, kalendertagEcht, BETRIEBSZONE } from "../server/lib/betriebszeit.mjs";
import { letzterSonntag, uhrsprung, uhrversatz } from "../server/lib/regelwerk.mjs";
import { berlinZeitpunkt } from "../server/lib/isteinfrieren.mjs";

const TZ_VORHER = process.env.TZ;
afterEach(() => { if (TZ_VORHER === undefined) delete process.env.TZ; else process.env.TZ = TZ_VORHER; });

const TAG = 86400000;
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
/** Letzter Sonntag (ISO) im Monat mo (1–12) — unabhängige Rechnung nur für die Testmengen. */
const sonntag = (j, mo) => { const t = Date.UTC(j, mo, 0); return iso(t - new Date(t).getUTCDay() * TAG); };

let saat = 0x7a17c0de;
const zufall = () => { saat = (saat * 1103515245 + 12345) >>> 0; return saat / 2 ** 32; };

/** Ergebnis oder Fehler (Typ + Text) eines Aufrufs — damit auch gleiche Würfe verglichen werden. */
const lauf = (f) => { try { return { wert: f() }; } catch (e) { return { fehler: `${e?.constructor?.name}: ${e?.message}` }; } };
function vergleiche(faelle, alt, neu) {
  const abw = [];
  for (const a of faelle) {
    const x = lauf(() => alt(...a)), y = lauf(() => neu(...a));
    if (!Object.is(x.wert, y.wert) || x.fehler !== y.fehler) { abw.push({ a, alt: x, neu: y }); if (abw.length > 10) break; }
  }
  return abw;
}

/* ---- Mengen ------------------------------------------------------------------------------------------------------ */
const UMSTELLUNG_VOLL = (() => {
  const out = [];
  for (let j = 2000; j <= 2100; j++) for (const mo of [3, 10]) {
    const d = sonntag(j, mo);
    for (let m = -180; m <= 1620; m++) out.push([d, m]);
  }
  return out;
})();
const KANTEN = [-1441, -1440, -121, -120, -61, -60, -1, 0, 1, 59, 60, 61, 119, 120, 121, 150, 179, 180, 181, 1439, 1440, 1441, 1500, 1560, 1561, 2880];
const STICHPROBEN_BIS_2999 = (() => {
  const out = [];
  for (let j = 2101; j <= 2999; j++) for (const mo of [3, 10]) {
    const s = Date.parse(`${sonntag(j, mo)}T00:00:00Z`);
    for (const v of [-1, 0, 1]) for (const m of KANTEN) out.push([iso(s + v * TAG), m]);
  }
  return out;
})();
const ZUFALL = (() => {
  const out = [];
  const von = Date.UTC(2000, 0, 1), tage = Math.round((Date.UTC(3000, 0, 1) - von) / TAG);
  for (let i = 0; i < 20000; i++) {
    const d = iso(von + Math.floor(zufall() * tage) * TAG);
    const r = zufall();
    const m = r < 0.85 ? Math.floor(zufall() * 4321) - 1440 : r < 0.95 ? Math.round(zufall() * 2880 * 1000) / 1000 - 60 : Math.floor(zufall() * 1440) + 0.5;
    out.push([d, m]);
  }
  return out;
})();
const GRENZEN = [
  ["2000-01-01", 0], ["2000-01-01", -1], ["2000-01-01", -60], ["2000-01-01", -61], ["2000-01-01", -120], ["2000-01-01", -1440],
  ["2000-01-01", -600000], ["2999-12-31", 1439], ["2999-12-31", 1440], ["2999-12-31", 1441], ["2999-12-31", 2880], ["2999-12-31", 600000],
  ["2026-03-29", 120], ["2026-03-29", 150], ["2026-03-29", 179], ["2026-03-29", 180], ["2026-10-25", 120], ["2026-10-25", 150],
  ["2026-10-25", 179], ["2026-10-25", 180], ["2026-03-29", 120.5], ["2026-10-25", 179.99], ["2026-10-25", 0.25],
  ["2026-03-29", NaN], ["2026-03-29", Infinity], ["2026-03-29", -Infinity], ["2026-03-29", "90"], ["2026-03-29", "x"],
  ["2026-03-29", true], ["2026-03-29", null], ["2026-03-29", undefined], ["2026-03-29", 1e15], ["2026-03-29", -0],
  ["2026-02-30", 0], ["2026-13-01", 0], ["2026-00-10", 0], ["1999-12-31", 0], ["3000-01-01", 0], ["2100-02-29", 60],
  ["2000-02-29", 60], ["2024-02-29", 60], ["2026-1-01", 0], [20260329, 0], [null, 0], [undefined, 0], ["", 0],
  ["２０２６-03-29", 0], ["2026-03-29 ", 0], [new String("2026-03-29"), 0],
];
const ZONEN_FAELLE = [["2026-03-29", 150, "UTC"], ["2026-03-29", 150, "Europe/Paris"], ["2026-03-29", 150, "Nirgendwo/Zone"],
  ["2026-03-29", 150, ""], ["2026-03-29", 150, BETRIEBSZONE], ["2026-02-30", 150, "UTC"], ["2026-03-29", NaN, "UTC"]];

describe("Zeit-Schnellweg: zeitpunktAusWanduhr alt gegen neu (Differenzialtest)", () => {
  it("Umfang der Mengen", () => {
    expect(UMSTELLUNG_VOLL.length).toBe(101 * 2 * 1801);
    expect(STICHPROBEN_BIS_2999.length).toBe(899 * 2 * 3 * KANTEN.length);
    expect(ZUFALL.length).toBe(20000);
  });

  it("alle Minuten der Umstellungssonntage 2000–2100 — 0 Abweichungen", () => {
    expect(vergleiche(UMSTELLUNG_VOLL, ALT.zeitpunktAusWanduhr, zeitpunktAusWanduhr)).toEqual([]);
  }, 180000);

  it("Lücke 29.03.2026 und doppelte Stunde 25.10.2026 wie bisher aufgelöst", () => {
    const u = (d, h, m) => Date.parse(`${d}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00Z`);
    expect(zeitpunktAusWanduhr("2026-03-29", 150)).toBe(u("2026-03-29", 1, 30));   // 02:30 → 03:30 Sommerzeit
    expect(zeitpunktAusWanduhr("2026-10-25", 150)).toBe(u("2026-10-25", 1, 30));   // doppelte Stunde: die spätere
    expect(berlinZeitpunkt("2026-10-25", 1440) - berlinZeitpunkt("2026-10-25", 0)).toBe(25 * 3600000);
    expect(berlinZeitpunkt("2026-03-29", 1440) - berlinZeitpunkt("2026-03-29", 0)).toBe(23 * 3600000);
  });

  it("Stichproben je Jahr 2101–2999 (Kantenminuten, Nachbartage) — 0 Abweichungen", () => {
    expect(vergleiche(STICHPROBEN_BIS_2999, ALT.zeitpunktAusWanduhr, zeitpunktAusWanduhr)).toEqual([]);
  }, 180000);

  it("20 000 Zufallstage 2000–2999 (fester Startwert) — 0 Abweichungen", () => {
    expect(vergleiche(ZUFALL, ALT.zeitpunktAusWanduhr, zeitpunktAusWanduhr)).toEqual([]);
  }, 60000);

  it("Grenzfälle: unechte Tage werfen weiter (P2-12), NaN/fremde Zone/Jahresränder wie bisher", () => {
    expect(vergleiche(GRENZEN, ALT.zeitpunktAusWanduhr, zeitpunktAusWanduhr)).toEqual([]);
    expect(vergleiche(ZONEN_FAELLE, ALT.zeitpunktAusWanduhr, zeitpunktAusWanduhr)).toEqual([]);
    expect(() => zeitpunktAusWanduhr("2026-02-30", 0)).toThrow("UNGUELTIGER_KALENDERTAG");
    expect(zeitpunktAusWanduhrErgebnis("2026-02-30", 0)).toEqual({ ok: false, grund: "UNGUELTIGER_KALENDERTAG", datum: "2026-02-30" });
    expect(() => zeitpunktAusWanduhr("2026-03-29", 0, "UTC")).toThrow("Zeitzone nicht zugelassen");
  });

  it("Prozesszeitzone ändert nichts (Stichprobe in fünf Zonen)", () => {
    const menge = [...GRENZEN, ...ZUFALL.slice(0, 500), ...UMSTELLUNG_VOLL.filter((_, i) => i % 97 === 0)];
    for (const z of ["Europe/Berlin", "UTC", "America/Los_Angeles", "Pacific/Auckland", "Pacific/Kiritimati"]) {
      process.env.TZ = z;
      expect(vergleiche(menge, ALT.zeitpunktAusWanduhr, zeitpunktAusWanduhr)).toEqual([]);
    }
  }, 60000);
});

describe("Zeit-Schnellweg: kalendertagEcht alt gegen neu", () => {
  it("jeder Tag 2000–2100, Stichproben bis 2999, unechte Formen — 0 Abweichungen", () => {
    const faelle = [];
    for (let j = 2000; j <= 2999; j += j < 2100 ? 1 : 7) {
      for (let m = 0; m <= 13; m++) for (let t = 0; t <= 32; t++) {
        faelle.push([`${j}-${String(m).padStart(2, "0")}-${String(t).padStart(2, "0")}`]);
      }
    }
    for (const s of ["1999-12-31", "3000-01-01", "0000-01-01", "9999-12-31", "2026-1-1", "2026-01-1", "20260101", "2026/01/01",
      "2026-02-29x", " 2026-02-28", "２０２６-01-01", "2026-0a-01", "", null, undefined, 20260101, new String("2026-01-01"), {}, []]) faelle.push([s]);
    expect(faelle.length).toBeGreaterThan(101 * 14 * 33);
    expect(vergleiche(faelle, ALT.kalendertagEcht, kalendertagEcht)).toEqual([]);
  });
});

describe("Zeit-Schnellweg: letzterSonntag (gemerkt), uhrsprung, uhrversatz alt gegen neu", () => {
  const MONATE = [];
  for (let j = 1990; j <= 3010; j++) for (let m = 0; m <= 13; m++) MONATE.push([j, m]);
  for (const a of [[2026.5, 3], [2026, 3.5], ["2026", 3], [2026, "3"], [NaN, 3], [99, 3], [0, 10], [-1, 10], [275761, 3]]) MONATE.push(a);

  it("letzterSonntag für alle Monate 1990–3010 in fünf Prozesszeitzonen — 0 Abweichungen (gemerkter Wert zonenunabhängig)", () => {
    for (const z of ["UTC", "Europe/Berlin", "America/Sao_Paulo", "Pacific/Auckland", "Pacific/Kiritimati"]) {
      process.env.TZ = z;
      expect(vergleiche(MONATE, ALT.letzterSonntag, letzterSonntag)).toEqual([]);
    }
  }, 60000);

  it("uhrsprung für jeden Tag 2000–2100 und Stichproben bis 2999 — 0 Abweichungen; Umstellungssonntage ±60", () => {
    const faelle = [];
    for (let t = Date.UTC(2000, 0, 1); t < Date.UTC(2101, 0, 1); t += TAG) faelle.push([iso(t)]);
    for (let j = 2101; j <= 2999; j++) for (const mo of [3, 10]) {
      const s = Date.parse(`${sonntag(j, mo)}T00:00:00Z`);
      for (const v of [-7, -1, 0, 1]) faelle.push([iso(s + v * TAG)]);
    }
    for (const s of ["", "2026", "abcd-03-29", null, undefined, "2026-03-29T00:00"]) faelle.push([s]);
    expect(vergleiche(faelle, ALT.uhrsprung, uhrsprung)).toEqual([]);
    expect(uhrsprung("2026-03-29")).toBe(-60);
    expect(uhrsprung("2026-10-25")).toBe(60);
  });

  it("uhrversatz (Nachtdienste über die Umstellung, 2000–2100 und Zufall) — 0 Abweichungen", () => {
    const faelle = [];
    const tagIndex = (d) => Math.round((Date.parse(`${d}T00:00:00Z`) - Date.UTC(2000, 0, 1)) / TAG);
    for (let j = 2000; j <= 2100; j++) for (const mo of [3, 10]) {
      const b = tagIndex(sonntag(j, mo)) * 1440;
      for (const [von, bis] of [[-120, 360], [0, 120], [120, 480], [119, 121], [-1440, 2880], [60, 180], [-180, 0]]) faelle.push([b + von, b + bis]);
    }
    for (let i = 0; i < 5000; i++) { const v = Math.floor(zufall() * 365243 * 1440); faelle.push([v, v + Math.floor(zufall() * 2880)]); }
    expect(vergleiche(faelle, ALT.uhrversatz, uhrversatz)).toEqual([]);
  });
});
