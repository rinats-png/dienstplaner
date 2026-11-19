// WP-ZEIT-Rest (docs/acc45/QS-ZEITABHAENGIGKEIT.md § 3, docs/acc45/ZEIT-BETRIEBSTAG-VERTRAG.md Z22/Z23):
// Die lokalen Berlin-Tagesformeln in erstleitung.mjs, paketstand.mjs, planfreigabe.mjs und zeiterfassung.mjs rufen
// jetzt die zentrale Zeitbasis server/lib/betriebszeit.mjs (betriebstag, wanduhr, zeitpunktAusWanduhr) auf.
//
// Differenzialtest: Die ALTEN Formeln stehen unten wörtlich (Stand integration/release-v4 d9d30940). Sie werden mit
// den neuen Aufrufen verglichen. Kernmenge (Umstellungsnächte 2026-03-29 und 2026-10-25, Umstellungskanten
// sekundengenau, jede Berliner Mitternacht 2026 ±1 s) in den Prozesszeitzonen Europe/Berlin, UTC,
// America/Los_Angeles, Pacific/Auckland und Pacific/Kiritimati; Breitenmenge (Raster 2000–2040, alle Minuten der
// Umstellungstage 2020–2035, jeder Tag 2026) in TZ=UTC — die alten Formeln bauen je Aufruf ein Intl-Format
// (~0,3 ms), deshalb nicht alles in jeder Zone. Erwartet: 0 Abweichungen.
// zeit-ok: Jeder Vergleich übergibt einen festen Zeitpunkt; die Vorgabe `jetzt = new Date()` stammt nur aus den wörtlich übernommenen alten Formeln und wird hier nie genutzt.
import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { betriebstag } from "../server/lib/betriebszeit.mjs";
import { paketTag } from "../server/lib/paketstand.mjs";
import { laufenderTag, sekundenBisTageswechsel } from "../server/lib/planfreigabe.mjs";
import { berlinZeitpunkt, uhrzeitBerlin, heuteBerlin } from "../server/lib/zeiterfassung.mjs";

/* ---- Alte Formeln, wörtlich ------------------------------------------------------------------------------------- */
// erstleitung.mjs:106 (nicht exportiert; neu: betriebstag(jetzt))
const altErstleitungHeute = (jetzt = Date.now()) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date(jetzt));
// paketstand.mjs:126
const altPaketTag = (jetzt = new Date()) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(jetzt);
// planfreigabe.mjs:31
function altLaufenderTag(jetzt = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(jetzt);
}
// planfreigabe.mjs:36
function altSekundenBisTageswechsel(jetzt = new Date()) {
  const t = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", hourCycle: "h23",
    hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(jetzt);
  const w = (k) => Number(t.find((x) => x.type === k).value);
  return 86400 - (w("hour") * 3600 + w("minute") * 60 + w("second"));
}
// zeiterfassung.mjs:90-113
const TAG = /^\d{4}-\d{2}-\d{2}$/;
const UHRZEIT = /^(([01]\d|2[0-3]):[0-5]\d|24:00)$/;
const iso = (d) => d.toISOString().slice(0, 10);
const BERLIN_TEILE = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Berlin", hourCycle: "h23",
  year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
function berlinVersatz(ms) {
  const t = Object.fromEntries(BERLIN_TEILE.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  const wand = Date.UTC(Number(t.year), Number(t.month) - 1, Number(t.day), Number(t.hour), Number(t.minute));
  return wand - Math.floor(ms / 60000) * 60000;
}
function altBerlinZeitpunkt(datum, uhrzeit) {
  if (!TAG.test(String(datum)) || typeof uhrzeit !== "string" || !UHRZEIT.test(uhrzeit)) return null;
  const [y, mo, d] = datum.split("-").map(Number);
  if (iso(new Date(Date.UTC(y, mo - 1, d))) !== datum) return null;
  const wand = Date.UTC(y, mo - 1, d, Number(uhrzeit.slice(0, 2)), Number(uhrzeit.slice(3, 5)));
  const erst = wand - berlinVersatz(wand);
  return wand - berlinVersatz(erst);
}
function altUhrzeitBerlin(jetzt = new Date()) {
  return jetzt.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });
}

/* ---- Zeitpunkte ------------------------------------------------------------------------------------------------- */
const ZONEN = ["Europe/Berlin", "UTC", "America/Los_Angeles", "Pacific/Auckland", "Pacific/Kiritimati"];
const TZ_VORHER = process.env.TZ;
afterEach(() => { if (TZ_VORHER === undefined) delete process.env.TZ; else process.env.TZ = TZ_VORHER; });

let saat = 0x5eed1234;
const zufall = () => { saat = (saat * 1103515245 + 12345) >>> 0; return saat / 2 ** 32; };
const MIN = 60000;

function zeitpunkteKern() {
  const out = [];
  // Umstellungsnächte 2026 (Vortag 21 Uhr bis Folgetag 3 Uhr Berlin), alle 3 Minuten mit zufälliger Sekunde/ms.
  for (const [von, bis] of [["2026-03-28T20:00:00Z", "2026-03-30T02:00:00Z"], ["2026-10-24T20:00:00Z", "2026-10-26T02:00:00Z"]]) {
    for (let t = Date.parse(von); t < Date.parse(bis); t += 3 * MIN) out.push(t + Math.floor(zufall() * 3 * MIN));
  }
  // Umstellungszeitpunkte sekundengenau ±60 s (volle Sekunde und .999).
  for (const k of [Date.parse("2026-03-29T01:00:00Z"), Date.parse("2026-10-25T01:00:00Z")]) {
    for (let s = -60; s <= 60; s++) out.push(k + s * 1000, k + s * 1000 + 999);
  }
  // Jede mögliche Berliner Mitternacht 2026 (22:00Z bzw. 23:00Z des Vortags), je eine Millisekunde davor und genau.
  for (let tag = Date.parse("2026-01-01T00:00:00Z"); tag <= Date.parse("2027-01-01T00:00:00Z"); tag += 86400000) {
    for (const k of [tag - 3600000, tag - 7200000]) out.push(k - 1, k);
  }
  return out;
}
function zeitpunkteBreit() {
  const out = [];
  for (let t = Date.parse("2000-01-01T00:00:00Z"); t < Date.parse("2040-01-01T00:00:00Z"); t += 2999 * MIN) {
    out.push(t + Math.floor(zufall() * 2999 * MIN));
  }
  return out;
}
const KERN = zeitpunkteKern();
const BREIT = zeitpunkteBreit();

const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const umstellungstage = (j) => [3, 10].flatMap((mo) => {
  const so = new Date(Date.UTC(j, mo, 0));
  so.setUTCDate(so.getUTCDate() - so.getUTCDay());                  // letzter Sonntag im März bzw. Oktober
  return [-1, 0, 1].map((v) => iso(new Date(so.getTime() + v * 86400000)));
});
/** Kern: alle Minuten 00:00–24:00 der Umstellungstage 2026 samt Nachbartagen. */
const WANDUHR_KERN = umstellungstage(2026).flatMap((d) => Array.from({ length: 1441 }, (_, m) => [d, hhmm(m)]));
/** Breite: alle Minuten der Umstellungssonntage 2020–2035, jeder Tag 2026 alle 31 Minuten, jede Woche 2000–2040 zu 13 Uhrzeiten. */
const WANDUHR_BREIT = (() => {
  const out = [];
  for (let j = 2020; j <= 2035; j++) for (const d of umstellungstage(j).filter((_, i) => i % 3 === 1)) for (let m = 0; m <= 1440; m++) out.push([d, hhmm(m)]);
  for (let t = Date.UTC(2026, 0, 1); t < Date.UTC(2027, 0, 1); t += 86400000) {
    for (let m = 0; m <= 1440; m += 31) out.push([iso(new Date(t)), hhmm(m)]);
    out.push([iso(new Date(t)), "24:00"]);
  }
  for (let t = Date.UTC(2000, 0, 3); t < Date.UTC(2040, 0, 1); t += 7 * 86400000) {
    for (const m of [0, 1, 59, 60, 119, 120, 150, 179, 180, 720, 1380, 1439, 1440]) out.push([iso(new Date(t)), hhmm(m)]);
  }
  return out;
})();

/* Abweichungen sammeln statt je Punkt erwarten (ein expect() je Vergleich wäre zu langsam). Kernmenge in jeder Zone,
   Breitenmenge in UTC. */
function abweichungen(kern, breit, vergleich) {
  const liste = [];
  const lauf = (z, menge) => {
    process.env.TZ = z;
    for (const x of menge) { vergleich(z, x, liste); if (liste.length > 20) return; }
  };
  for (const z of ZONEN) lauf(z, kern);
  lauf("UTC", breit);
  return liste;
}

describe("Berlin-Tagesformeln: alt gegen zentrale Zeitbasis (Differenzialtest)", () => {
  it("Umfang: genug Zeitpunkte und Wanduhrzeiten", () => {
    expect(KERN.length).toBeGreaterThan(3000);
    expect(BREIT.length).toBeGreaterThan(7000);
    expect(WANDUHR_KERN.length).toBe(6 * 1441);
    expect(WANDUHR_BREIT.length).toBeGreaterThan(80000);
  });

  it("erstleitung heuteBerlin, paketTag, laufenderTag, heuteBerlin = betriebstag — 0 Abweichungen", () => {
    const fehler = abweichungen(KERN, BREIT, (z, ms, liste) => {
      const d = new Date(ms);
      const alt = altPaketTag(d);
      // Die drei alten Tagesformeln sind dieselbe sv-SE/Berlin-Formel; Gleichheit untereinander einmal (UTC) belegt.
      if (z === "UTC" && (altErstleitungHeute(ms) !== alt || altLaufenderTag(d) !== alt)) liste.push([z, ms, "alt uneinig"]);
      if (betriebstag(ms) !== alt) liste.push([z, ms, "erstleitung", alt, betriebstag(ms)]);
      if (paketTag(d) !== alt) liste.push([z, ms, "paketTag", alt, paketTag(d)]);
      if (paketTag(ms) !== alt) liste.push([z, ms, "paketTag(ms)"]);
      if (laufenderTag(d) !== alt) liste.push([z, ms, "laufenderTag", alt, laufenderTag(d)]);
      if (heuteBerlin(d) !== alt) liste.push([z, ms, "heuteBerlin", alt, heuteBerlin(d)]);
    });
    expect(fehler).toEqual([]);
  }, 300000);

  it("sekundenBisTageswechsel — 0 Abweichungen", () => {
    const fehler = abweichungen(KERN, BREIT, (z, ms, liste) => {
      const alt = altSekundenBisTageswechsel(new Date(ms));
      if (sekundenBisTageswechsel(new Date(ms)) !== alt) liste.push([z, ms, alt, sekundenBisTageswechsel(new Date(ms))]);
      if (sekundenBisTageswechsel(ms) !== alt) liste.push([z, ms, "ms"]);
    });
    expect(fehler).toEqual([]);
  }, 300000);

  it("uhrzeitBerlin = wanduhr — 0 Abweichungen", () => {
    const fehler = abweichungen(KERN, BREIT, (z, ms, liste) => {
      const d = new Date(ms);
      const alt = altUhrzeitBerlin(d);
      if (uhrzeitBerlin(d) !== alt) liste.push([z, ms, alt, uhrzeitBerlin(d)]);
    });
    expect(fehler).toEqual([]);
  }, 300000);

  it("berlinZeitpunkt (zeitpunktAusWanduhr) — 0 Abweichungen, auch Lücke, Doppelstunde und 24:00", () => {
    const fehler = abweichungen(WANDUHR_KERN, WANDUHR_BREIT, (z, [d, u], liste) => {
      const alt = altBerlinZeitpunkt(d, u);
      if (berlinZeitpunkt(d, u) !== alt) liste.push([z, d, u, alt, berlinZeitpunkt(d, u)]);
    });
    expect(fehler).toEqual([]);
  }, 300000);

  it("berlinZeitpunkt: ungültige Angaben bleiben null wie bisher", () => {
    const faelle = [["2026-02-30", "08:00"], ["2026-13-01", "08:00"], ["0000-01-01", "08:00"], ["2026-1-1", "08:00"],
      ["2026-03-29", "24:01"], ["2026-03-29", "8:00"], ["2026-03-29", 480], [null, "08:00"], ["2026-03-29", "25:00"]];
    for (const [d, u] of faelle) {
      expect(altBerlinZeitpunkt(d, u)).toBeNull();
      expect(berlinZeitpunkt(d, u)).toBeNull();
    }
  });

  it("Stichproben der Umstellungsnächte (feste Erwartung)", () => {
    expect(berlinZeitpunkt("2026-03-29", "02:30")).toBe(Date.parse("2026-03-29T01:30:00Z")); // Lücke → 03:30 MESZ
    expect(berlinZeitpunkt("2026-10-25", "02:30")).toBe(Date.parse("2026-10-25T01:30:00Z")); // spätere (MEZ)
    expect(berlinZeitpunkt("2026-10-24", "24:00")).toBe(Date.parse("2026-10-24T22:00:00Z"));
    expect(uhrzeitBerlin(new Date("2026-10-24T22:00:00Z"))).toBe("00:00");
    expect(sekundenBisTageswechsel(new Date("2026-03-28T22:59:59.500Z"))).toBe(1);
    expect(paketTag(new Date("2026-12-31T23:00:00Z"))).toBe("2027-01-01");
  });

  it("keine lokale Berlin-Formel mehr in den vier Modulen", () => {
    for (const f of ["erstleitung", "paketstand", "planfreigabe", "zeiterfassung"]) {
      const quelle = readFileSync(new URL(`../server/lib/${f}.mjs`, import.meta.url), "utf8");
      expect(quelle, f).not.toMatch(/timeZone:\s*["']Europe\/Berlin["']/);
      expect(quelle, f).not.toMatch(/new Intl\.DateTimeFormat|toLocale(Date|Time)?String/);
    }
  });
});
