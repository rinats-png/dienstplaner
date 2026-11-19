/* ==========================================================================
   P2-12 (Variante B, Betreiberentscheidung 2026-11-18) — Kalendertage, die es nicht gibt

   Ein Tag wie „2026-02-30" wird weder still korrigiert (gerollt) noch
   unbemerkt verarbeitet:
   1. betriebszeit.zeitpunktAusWanduhr wirft RangeError("UNGUELTIGER_KALENDERTAG")
      statt auf den 2. März zu rollen; zeitpunktAusWanduhrErgebnis liefert
      { ok:false } ohne Wurf. Für jeden echten Tag (kalendertagEcht, Jahre
      2000–2999) bit-gleich zum alten Verhalten (Differenzialtest: alte Formel
      wörtlich, Grenzfälle, Schaltjahre, Zufallstage mit festem Startwert).
   2. Eingabewege (Selbstauskunft, Korrekturantrag, Entscheidung): 422 nur für
      diese Anfrage. PUT /api/bestand und Teilweg: NEUE oder GEÄNDERTE Einträge
      mit unechtem Tag in erfassung/abweichungen/abwesenheiten → 422; ein
      gespeicherter Alteintrag bleibt unverändert speicherbar und blockiert
      keine unabhängigen Speichervorgänge (nie normalisiert/gefiltert/gelöscht).
   3. Oberfläche: zuschlagStunden wirft nicht, sondern meldet „nicht verfügbar".

   Aufruf: npx vitest run pruefungen/p212-kalendertag.test.js
   ========================================================================== */
// zeit-ok: Alle Kalenderdaten sind feste Werte ohne Bezug zur Uhr (Zahlenraster 2000–2999, Februar bis Dezember 2026; die Abwesenheiten 2026-11-30/2026-12-01 können je nach Laufzeitpunkt in der Zukunft liegen, die Prüfung hängt davon nicht ab). Zeitpunkte entstehen nur aus festen Angaben; die Handler laufen auf der echten Uhr, ihr Ergebnis hier hängt nicht vom Laufzeitpunkt ab.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { freezeStatus } from "../server/lib/isteinfrieren.mjs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { kalendertagEcht, zeitpunktAusWanduhr, zeitpunktAusWanduhrErgebnis, UNGUELTIGER_KALENDERTAG, BETRIEBSZONE } from "../server/lib/betriebszeit.mjs";
import { tagGueltig } from "../server/lib/paketstand.mjs";
import { berlinZeitpunkt, selbstauskunftPruefen } from "../server/lib/zeiterfassung.mjs";
import { istEinfrieren } from "../server/lib/isteinfrieren.mjs";
import { antragStellen } from "../server/lib/korrekturworkflow.mjs";
import { selbstauskunftEntscheiden } from "../server/lib/selbstauskunft.mjs";
import { kalendertagFehler } from "../server/lib/gestalt.mjs";
import { zuschlagStunden } from "../src/lib/fachlogik.js";

/* ---------- 1. Die alte Abbildung, wörtlich (Stand vor P2-12) ---------- */
const altFormat = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Berlin", hourCycle: "h23",
  year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
const altTeile = (ms) => Object.fromEntries(altFormat.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
function altZeitpunktAusWanduhr(datum, minuten) {
  const [j, mo, t] = String(datum).split("-").map(Number);
  const wand = Date.UTC(j, mo - 1, t) + minuten * 60000;
  const versatz = (ms) => {
    const p = altTeile(ms);
    return Math.round((Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute)) - ms) / 60000);
  };
  const passend = [60, 120].filter((v) => versatz(wand - v * 60000) === v);
  const v = passend.length === 1 ? passend[0] : 60;
  return wand - v * 60000;
}

const zwei = (n) => String(n).padStart(2, "0");
const tagText = (j, m, t) => `${String(j).padStart(4, "0")}-${zwei(m)}-${zwei(t)}`;
const monatsende = (j, m) => new Date(Date.UTC(j, m, 0)).getUTCDate();
/** Fester Startwert (mulberry32) — wiederholbar. */
function zufall(start) {
  let a = start >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

describe("kalendertagEcht", () => {
  it("dieselbe Regel wie paketstand.tagGueltig (Form, Jahr 2000–2999, Monatsende, Schaltjahre)", () => {
    const faelle = ["2026-02-28", "2026-02-29", "2024-02-29", "2000-02-29", "2100-02-29", "2400-02-29", "2026-04-30", "2026-04-31",
      "2026-12-31", "2026-13-01", "2026-00-10", "2026-01-00", "1999-12-31", "2000-01-01", "2999-12-31", "3000-01-01",
      "2026-1-1", "2026-01-1", " 2026-01-01", "2026-01-01T00:00", "", "abcd-ef-gh"];
    for (const s of faelle) expect(kalendertagEcht(s), s).toBe(tagGueltig(s));
    for (const x of [null, undefined, 20260101, {}, ["2026-01-01"]]) expect(kalendertagEcht(x)).toBe(false);
    expect(["2024-02-29", "2000-02-29", "2400-02-29"].every(kalendertagEcht)).toBe(true);
    expect(["2100-02-29", "2026-02-29", "2026-02-30", "2026-04-31"].some(kalendertagEcht)).toBe(false);
  });
  it("vollständig über 2000–2999: jeder Monat, Tage 0–32", () => {
    for (let j = 2000; j <= 2999; j++) for (let m = 0; m <= 13; m++) for (const t of [0, 1, 28, 29, 30, 31, 32]) {
      const echt = m >= 1 && m <= 12 && t >= 1 && t <= monatsende(j, m);
      if (kalendertagEcht(tagText(j, m, t)) !== echt) throw new Error(tagText(j, m, t));
    }
  });
});

describe("zeitpunktAusWanduhr: Differenzialtest gegen die alte Formel (gültige Tage)", () => {
  const MINUTEN = [0, 1, 59, 60, 119, 120, 121, 150, 179, 180, 181, 720, 1380, 1439, 1440, 1441, 1500, 2879, 2880];
  it("Grenzfälle: Monatsenden, Jahreswechsel, Schaltjahre, Jahre 2000 und 2999", () => {
    const tage = [];
    for (const j of [2000, 2001, 2024, 2025, 2026, 2027, 2028, 2099, 2100, 2400, 2999])
      for (let m = 1; m <= 12; m++) for (const t of [1, 28, monatsende(j, m)]) tage.push(tagText(j, m, t));
    const abw = [];
    for (const d of tage) for (const min of MINUTEN) {
      const alt = altZeitpunktAusWanduhr(d, min), neu = zeitpunktAusWanduhr(d, min);
      if (alt !== neu) abw.push([d, min, alt, neu]);
      const e = zeitpunktAusWanduhrErgebnis(d, min);
      if (!e.ok || e.ms !== alt) abw.push([d, min, "Ergebnis", e]);
    }
    expect(tage.length).toBeGreaterThan(390);
    expect(abw).toEqual([]);
  });
  it("Umstellungsnächte 2020–2035: jede Minute des Sonntags", () => {
    const sonntag = (j, m) => { const t = monatsende(j, m); const wt = new Date(Date.UTC(j, m - 1, t)).getUTCDay(); return tagText(j, m, t - wt); };
    const abw = [];
    for (let j = 2020; j <= 2035; j++) for (const m of [3, 10]) {
      const d = sonntag(j, m);
      for (let min = 0; min <= 1440; min++) if (altZeitpunktAusWanduhr(d, min) !== zeitpunktAusWanduhr(d, min)) abw.push([d, min]);
    }
    expect(abw).toEqual([]);
  }, 120000);
  it("20 000 Zufallstage 2000–2999 (fester Startwert), Zufallsminuten 0–2880", () => {
    const r = zufall(0x9212);
    const abw = [];
    for (let i = 0; i < 20000; i++) {
      const j = 2000 + Math.floor(r() * 1000), m = 1 + Math.floor(r() * 12), t = 1 + Math.floor(r() * monatsende(j, m));
      const d = tagText(j, m, t), min = Math.floor(r() * 2881);
      if (altZeitpunktAusWanduhr(d, min) !== zeitpunktAusWanduhr(d, min)) abw.push([d, min]);
    }
    expect(abw).toEqual([]);
  }, 120000);
});

describe("zeitpunktAusWanduhr: unechte Tage werfen, statt zu rollen", () => {
  const UNECHT = ["2026-02-29", "2026-02-30", "2026-02-31", "2026-04-31", "2026-13-01", "2026-00-15", "2026-01-00", "2026-01-32",
    "2100-02-29", "1999-12-31", "3000-01-01", "2026-1-1", "", null, undefined, 20260101];
  it("RangeError UNGUELTIGER_KALENDERTAG — die alte Formel hätte gerollt", () => {
    expect(altZeitpunktAusWanduhr("2026-02-30", 0)).toBe(altZeitpunktAusWanduhr("2026-03-02", 0));   // das war der Befund
    for (const d of UNECHT) {
      expect(() => zeitpunktAusWanduhr(d, 0), String(d)).toThrow(RangeError);
      expect(() => zeitpunktAusWanduhr(d, 0), String(d)).toThrow(UNGUELTIGER_KALENDERTAG);
    }
  });
  it("zeitpunktAusWanduhrErgebnis: { ok:false, grund, datum } ohne Wurf; Zone außerhalb der Liste wirft weiter", () => {
    for (const d of UNECHT) expect(zeitpunktAusWanduhrErgebnis(d, 600)).toEqual({ ok: false, grund: UNGUELTIGER_KALENDERTAG, datum: d });
    expect(zeitpunktAusWanduhrErgebnis("2026-07-01", 720, BETRIEBSZONE)).toEqual({ ok: true, ms: Date.parse("2026-07-01T10:00:00.000Z") });
    expect(() => zeitpunktAusWanduhrErgebnis("2026-07-01", 0, "UTC")).toThrow(RangeError);
  });
  it("zeiterfassung.berlinZeitpunkt bleibt null für unechte Tage (kein Wurf)", () => {
    for (const d of ["2026-02-30", "2026-13-01", "2100-02-29", "1999-12-31"]) expect(berlinZeitpunkt(d, "08:00"), d).toBeNull();
    expect(berlinZeitpunkt("2026-03-02", "08:00")).toBe(Date.parse("2026-03-02T07:00:00.000Z"));
  });
  it("istEinfrieren prüft den Monat am Eingang", () => {
    for (const mon of ["2026-13", "2026-00", "2026-1", "2026-02-30", "", null, undefined, 202601])
      expect(() => istEinfrieren({ personen: [] }, mon), String(mon)).toThrow(RangeError);
    expect(() => istEinfrieren({ personen: [] }, "2026-02")).not.toThrow();
  });
});

/* ---------- 2a. Eingabewege mit eigenem Endpunkt ---------- */
describe("Eingabewege: Selbstauskunft, Korrekturantrag, Entscheidung", () => {
  const p = { id: "p1", zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }] };
  it("selbstauskunftPruefen: „Kein gültiges Datum.“ auch für 2026-02-30 (wie für die falsche Form)", () => {
    expect(selbstauskunftPruefen({}, p, "2026-02-30", { bestaetigt: true }, "2026-03-10")).toEqual({ grund: "Kein gültiges Datum." });
    expect(selbstauskunftPruefen({}, p, "2026-2-3", { bestaetigt: true }, "2026-03-10")).toEqual({ grund: "Kein gültiges Datum." });
    /* gültiger Tag: wie bisher (hier ohne Plan) */
    expect(selbstauskunftPruefen({}, p, "2026-03-02", { bestaetigt: true }, "2026-03-10")).toEqual({ grund: "An diesem Tag war kein Dienst geplant." });
  });
  it("antragStellen: falsche Form 400 wie bisher, unechter Tag 422 UNGUELTIGER_KALENDERTAG", () => {
    const jetzt = new Date("2026-03-10T12:00:00.000Z");
    const rumpf = (datum) => ({ datum, start: "06:00", ende: "14:00", grund: "Stempel vergessen, Dienst normal" });
    expect(antragStellen({}, { personId: "p1" }, rumpf("2026-2-3"), jetzt, "ka-1", "2026-03-10").status).toBe(400);
    for (const d of ["2026-02-30", "2026-02-29", "2026-13-01"])
      expect(antragStellen({}, { personId: "p1" }, rumpf(d), jetzt, "ka-1", "2026-03-10"), d)
        .toEqual({ status: 422, grund: "Diesen Kalendertag gibt es nicht.", art: UNGUELTIGER_KALENDERTAG });
  });
  it("selbstauskunftEntscheiden: unechter Tag 422, falsche Form 400 wie bisher", () => {
    const jetzt = new Date("2026-03-10T12:00:00.000Z");
    const r = (datum) => ({ personId: "p1", datum, antragId: "sa-1", entscheidung: "zurueckgezogen" });
    expect(selbstauskunftEntscheiden({}, r("2026-02-30"), { personId: "p1" }, jetzt))
      .toEqual({ status: 422, grund: "Diesen Kalendertag gibt es nicht.", art: UNGUELTIGER_KALENDERTAG });
    expect(selbstauskunftEntscheiden({}, r("2026-2-3"), { personId: "p1" }, jetzt).status).toBe(400);
    expect(selbstauskunftEntscheiden({ erfassung: {} }, r("2026-03-02"), { personId: "p1" }, jetzt).status).toBe(404);
  });
});

/* ---------- 2b. kalendertagFehler (Einheit) ---------- */
describe("kalendertagFehler: nur neue oder geänderte Einträge", () => {
  const alt = () => ({ mandanten: [{ id: "m-a",
    erfassung: { "p1|2026-02-30": { start: "08:00", ende: "16:00", bestaetigt: true }, "p1|2026-03-02": { start: "06:00", ende: "14:00", bestaetigt: true } },
    abweichungen: { "p1|2026-04-31": "F", "p1|2026-03-03": "F" },
    abwesenheiten: [{ id: "a1", personId: "p1", art: "urlaub", von: "2026-02-30", bis: "2026-03-01" },
      { personId: "p1", art: "urlaub", von: "2026-06-31", bis: "2026-07-02" }] }] });
  const kopie = (x) => JSON.parse(JSON.stringify(x));
  it("unveränderte Alteinträge (auch in anderer Schlüsselreihenfolge, auch ohne Kennung) blockieren nicht", () => {
    expect(kalendertagFehler(alt(), alt())).toBeNull();
    const b = alt();
    b.mandanten[0].erfassung["p1|2026-02-30"] = { bestaetigt: true, ende: "16:00", start: "08:00" };
    b.mandanten[0].abwesenheiten[0] = { bis: "2026-03-01", von: "2026-02-30", art: "urlaub", personId: "p1", id: "a1" };   // nur Reihenfolge
    b.mandanten[0].erfassung["p1|2026-03-04"] = { start: "06:00", ende: "14:00", bestaetigt: true };   // unabhängig, gültig
    expect(kalendertagFehler(b, alt())).toBeNull();
  });
  it("Löschen eines Alteintrags ist keine neue Angabe", () => {
    const b = alt();
    delete b.mandanten[0].erfassung["p1|2026-02-30"];
    b.mandanten[0].abwesenheiten.splice(0, 1);
    expect(kalendertagFehler(b, alt())).toBeNull();
  });
  it("neu eingeführt: erfassung, abweichungen, abwesenheiten von/bis → Fehler mit Feld", () => {
    const fall = (f) => { const b = alt(); f(b.mandanten[0]); return kalendertagFehler(b, alt()); };
    expect(fall((m) => { m.erfassung["p2|2026-02-31"] = { start: "06:00", ende: "14:00", bestaetigt: true }; }))
      .toEqual({ code: UNGUELTIGER_KALENDERTAG, feld: "mandanten[0].erfassung", grund: "Den Kalendertag 2026-02-31 gibt es nicht." });
    expect(fall((m) => { m.abweichungen["p2|2026-13-01"] = "F"; })).toMatchObject({ feld: "mandanten[0].abweichungen" });
    expect(fall((m) => { m.abweichungen["p2|2026-02-29|2"] = "F"; })).toMatchObject({ feld: "mandanten[0].abweichungen" });
    expect(fall((m) => { m.abwesenheiten.push({ id: "a9", personId: "p2", art: "urlaub", von: "2026-03-01", bis: "2026-04-31" }); }))
      .toMatchObject({ feld: "mandanten[0].abwesenheiten[2].bis" });
    expect(fall((m) => { m.abwesenheiten.push({ personId: "p2", art: "urlaub", von: "2026-09-31", bis: "2026-10-01" }); }))
      .toMatchObject({ feld: "mandanten[0].abwesenheiten[2].von" });
    /* ohne gespeicherten Stand ist alles neu */
    expect(kalendertagFehler(alt(), null)).toMatchObject({ code: UNGUELTIGER_KALENDERTAG });
  });
  it("geändert: anderer Wert an einem Alteintrag, anderes von/bis → Fehler", () => {
    const b = alt();
    b.mandanten[0].erfassung["p1|2026-02-30"] = { start: "09:00", ende: "16:00", bestaetigt: true };
    expect(kalendertagFehler(b, alt())).toMatchObject({ feld: "mandanten[0].erfassung" });
    const c = alt();
    c.mandanten[0].abwesenheiten[0].von = "2026-02-31";
    expect(kalendertagFehler(c, alt())).toMatchObject({ feld: "mandanten[0].abwesenheiten[0].von" });
  });
  it("Abwesenheit: gleiche Kennung und gleiches unechtes von, aber anderer Inhalt oder doppelte Kennung → Fehler", () => {
    const fall = (f) => { const b = alt(); f(b.mandanten[0]); return kalendertagFehler(b, alt()); };
    expect(fall((m) => { m.abwesenheiten[0].personId = "p2"; })).toMatchObject({ feld: "mandanten[0].abwesenheiten[0].von" });
    expect(fall((m) => { m.abwesenheiten[0].art = "krank"; })).toMatchObject({ feld: "mandanten[0].abwesenheiten[0].von" });
    expect(fall((m) => { m.abwesenheiten.push({ ...m.abwesenheiten[0] }); })).toMatchObject({ code: UNGUELTIGER_KALENDERTAG });
    expect(fall((m) => { m.abwesenheiten.push({ ...m.abwesenheiten[0], personId: "p2" }); })).toMatchObject({ code: UNGUELTIGER_KALENDERTAG });
  });
  it("Multimenge (Delta-Review A2): zwei gespeicherte gleiche Kennung (unecht + echt) → zwei unechte Kopien abgewiesen", () => {
    const v = alt();
    v.mandanten[0].abwesenheiten.push({ id: "a1", personId: "p1", art: "urlaub", von: "2026-03-05", bis: "2026-03-06" });
    expect(kalendertagFehler(kopie(v), v)).toBeNull();
    const b = kopie(v);
    b.mandanten[0].abwesenheiten[2] = { ...b.mandanten[0].abwesenheiten[0] };                    // echt → Kopie des unechten
    expect(kalendertagFehler(b, v)).toMatchObject({ code: UNGUELTIGER_KALENDERTAG, feld: "mandanten[0].abwesenheiten[2].von" });
    const c = kopie(v);
    c.mandanten[0].abwesenheiten[2].von = "2026-02-30";                                         // bisher echt, jetzt unecht
    expect(kalendertagFehler(c, v)).toMatchObject({ code: UNGUELTIGER_KALENDERTAG, feld: "mandanten[0].abwesenheiten[2].von" });
  });
  it("Multimenge ohne Kennung: 1→1 und unverändert gehen, 1→3 abgewiesen", () => {
    const ohne = alt().mandanten[0].abwesenheiten[1];
    expect(ohne.id).toBeUndefined();
    expect(kalendertagFehler(alt(), alt())).toBeNull();
    const b = alt(); b.mandanten[0].abwesenheiten.push({ ...ohne }, { ...ohne });
    expect(kalendertagFehler(b, alt())).toMatchObject({ code: UNGUELTIGER_KALENDERTAG, feld: "mandanten[0].abwesenheiten[2].von" });
    const c = alt(); c.mandanten[0].abwesenheiten.push({ ...ohne });
    expect(kalendertagFehler(c, alt())).toMatchObject({ code: UNGUELTIGER_KALENDERTAG });
  });
  it("Abwesenheit: ein Altbestand mit doppelter Kennung bleibt unverändert speicherbar, eine dritte Kopie nicht", () => {
    const v = alt(); v.mandanten[0].abwesenheiten.push({ ...v.mandanten[0].abwesenheiten[0] });
    expect(kalendertagFehler(kopie(v), v)).toBeNull();
    const b = kopie(v); b.mandanten[0].abwesenheiten.push({ ...b.mandanten[0].abwesenheiten[0] });
    expect(kalendertagFehler(b, v)).toMatchObject({ code: UNGUELTIGER_KALENDERTAG });
  });
  it("nie verändert: der übergebene Stand bleibt byte-gleich", () => {
    const b = alt(), v = alt(), vorher = JSON.stringify(b);
    kalendertagFehler(b, v);
    expect(JSON.stringify(b)).toBe(vorher);
    expect(kopie(v)).toEqual(alt());
  });
});

/* ---------- 2d. Folgepunkte Review #344: anfragen, ausschreibungen, krankmeldungen; Tage ohne führende Nullen ---------- */
describe("kalendertagFehler: Folgepunkte (2) und (4)", () => {
  const verlauf = [{ schritt: "eingegangen", von: "p1", rolle: "mitarbeiter", zeit: "2026-03-01T08:00:00.000Z" }];
  const alt = () => ({ mandanten: [{ id: "m-a",
    erfassung: { "p1|2026-2-30": { start: "08:00", ende: "16:00" } }, abweichungen: {},
    anfragen: [{ id: "r1", personId: "p1", typ: "abwesenheit", art: "urlaub", von: "2026-02-30", bis: "2026-03-01", status: "offen" },
      { id: "r2", personId: "p2", typ: "tausch", status: "offen", von: "2026-04-31", bis: "2026-04-31", partnerId: null, interessenten: ["x9", "p1", "x8"] },
      { id: "r3", personId: "p1", typ: "abwesenheit", art: "urlaub", von: "2026-03-02", bis: "2026-03-03", status: "offen" }],
    ausschreibungen: [{ id: "s1", datum: "2026-06-31", dienstId: "F", status: "offen", bewerbungen: [{ personId: "p1", text: "" }, { personId: "p2", text: "" }], vergebenAn: null }],
    krankmeldungen: [{ id: "km-1", personId: "p1", von: "2026-09-31", bis: "2026-10-01", status: "eingegangen", verlauf }] }] });
  const fall = (f, v = alt()) => { const b = kopie(v); f(b.mandanten[0]); return kalendertagFehler(b, v); };
  const kopie = (x) => JSON.parse(JSON.stringify(x));
  it("unveränderte Alteinträge in allen Listen und mit Schlüssel ohne Nullen blockieren nicht", () => {
    expect(kalendertagFehler(alt(), alt())).toBeNull();
    expect(fall((m) => { m.anfragen.push({ id: "r9", personId: "p1", typ: "abwesenheit", art: "urlaub", von: "2026-03-05", bis: "2026-03-06", status: "offen" }); })).toBeNull();
  });
  it("Rechtezusammenführung ordnet um oder setzt undefined: kein falsches 422", () => {
    /* anfragenZusammen (Beschäftigte): eigene Meldung hinten; antwort/freigaben: undefined; fehlende interessenten = [] */
    expect(fall((m) => { m.anfragen[1] = { ...m.anfragen[1], interessenten: ["x9", "x8", "p1"] }; })).toBeNull();
    expect(fall((m) => { m.anfragen[0] = { ...m.anfragen[0], freigaben: undefined, entschieden: undefined, durch: undefined, antwort: undefined, interessenten: [] }; })).toBeNull();
    /* ausschreibungenZusammen: fremde Bewerbungen vor der eigenen */
    expect(fall((m) => { m.ausschreibungen[0] = { ...m.ausschreibungen[0], bewerbungen: [{ personId: "p2", text: "" }, { personId: "p1", text: "" }] }; })).toBeNull();
  });
  it("neu: Antrag, Ausschreibung, Krankmeldungsfall mit unechtem Tag → Fehler mit Feld", () => {
    expect(fall((m) => { m.anfragen.push({ id: "r9", personId: "p1", typ: "abwesenheit", art: "urlaub", von: "2026-02-30", bis: "2026-03-01", status: "offen" }); }))
      .toEqual({ code: UNGUELTIGER_KALENDERTAG, feld: "mandanten[0].anfragen[3].von", grund: "Den Kalendertag 2026-02-30 gibt es nicht." });
    expect(fall((m) => { m.anfragen.unshift({ id: "r9", personId: "p1", typ: "tausch", von: "2026-03-01", bis: "2026-11-31", status: "offen" }); }))
      .toMatchObject({ feld: "mandanten[0].anfragen[0].bis" });
    expect(fall((m) => { m.ausschreibungen.unshift({ id: "s9", datum: "2026-13-01", dienstId: "F", status: "offen", bewerbungen: [], vergebenAn: null }); }))
      .toMatchObject({ code: UNGUELTIGER_KALENDERTAG, feld: "mandanten[0].ausschreibungen[0].datum" });
    expect(fall((m) => { m.krankmeldungen.unshift({ id: "km-2", personId: "p1", von: "2026-02-30", bis: "2026-02-30", status: "eingegangen", verlauf }); }))
      .toMatchObject({ code: UNGUELTIGER_KALENDERTAG, feld: "mandanten[0].krankmeldungen[0].von" });
  });
  it("geändert: ein unechter Alteintrag lässt sich nicht entscheiden oder umschreiben, aber löschen", () => {
    expect(fall((m) => { m.anfragen[0].status = "genehmigt"; })).toMatchObject({ feld: "mandanten[0].anfragen[0].von" });
    expect(fall((m) => { m.anfragen[1].interessenten.push("p3"); })).toMatchObject({ feld: "mandanten[0].anfragen[1].von" });
    expect(fall((m) => { m.ausschreibungen[0].status = "vergeben"; m.ausschreibungen[0].vergebenAn = "p1"; })).toMatchObject({ feld: "mandanten[0].ausschreibungen[0].datum" });
    expect(fall((m) => { m.anfragen[2].von = "2026-02-29"; })).toMatchObject({ feld: "mandanten[0].anfragen[2].von" });   // bisher echt
    expect(fall((m) => { m.anfragen.splice(0, 2); m.ausschreibungen = []; m.krankmeldungen = []; delete m.erfassung["p1|2026-2-30"]; })).toBeNull();
  });
  it("(4) Tag ohne führende Nullen: neu oder geändert abgewiesen, unverändert speicherbar; volle Form wie bisher", () => {
    expect(fall((m) => { m.erfassung["p2|2026-2-3"] = { start: "08:00", ende: "16:00" }; }))
      .toEqual({ code: UNGUELTIGER_KALENDERTAG, feld: "mandanten[0].erfassung", grund: "Das Datum 2026-2-3 hat nicht die Form JJJJ-MM-TT." });
    expect(fall((m) => { m.abweichungen["p2|2026-03-2"] = "F"; })).toMatchObject({ feld: "mandanten[0].abweichungen" });
    expect(fall((m) => { m.erfassung["p1|2026-2-30"] = { start: "09:00", ende: "16:00" }; })).toMatchObject({ feld: "mandanten[0].erfassung" });
    expect(fall((m) => { m.anfragen.push({ id: "r9", personId: "p1", von: "2026-3-1", bis: "2026-03-01" }); })).toMatchObject({ feld: "mandanten[0].anfragen[3].von" });
    /* volle Form vorn: unverändert die bisherige Regel (echter Tag vorn zählt) */
    expect(fall((m) => { m.abweichungen["p2|2026-03-02|2"] = "F"; m.anfragen.push({ id: "r9", personId: "p1", von: "2026-03-01T08:00", bis: "2026-03-011" }); })).toBeNull();
    /* keine Tagesangabe: wie bisher nicht geprüft */
    expect(fall((m) => { m.abweichungen["p2|x"] = "F"; m.anfragen.push({ id: "r9", personId: "p1", von: "", bis: null }); m.ausschreibungen.push({ id: "s9" }); })).toBeNull();
  });
  it("Differenz: für Bestände nur mit echten Tagen immer null (gleich wie vorher) — 300 Zufallsbestände, fester Startwert", () => {
    const r = zufall(0x3441);
    const tag = () => { const j = 2000 + Math.floor(r() * 1000), mo = 1 + Math.floor(r() * 12); return tagText(j, mo, 1 + Math.floor(r() * monatsende(j, mo))); };
    const liste = (n, f) => Array.from({ length: n }, (_, i) => f(i));
    for (let i = 0; i < 300; i++) {
      const m = { id: "m-a", erfassung: Object.fromEntries(liste(5, () => [`p${Math.floor(r() * 3)}|${tag()}`, { start: "08:00" }])),
        abweichungen: Object.fromEntries(liste(5, () => [`p${Math.floor(r() * 3)}|${tag()}`, "F"])),
        abwesenheiten: liste(3, (k) => ({ id: `a${k}`, von: tag(), bis: tag() })), anfragen: liste(3, (k) => ({ id: `r${k}`, von: tag(), bis: tag(), interessenten: ["b", "a"] })),
        ausschreibungen: liste(3, (k) => ({ id: `s${k}`, datum: tag(), bewerbungen: [{ personId: "b" }, { personId: "a" }] })), krankmeldungen: liste(2, (k) => ({ id: `k${k}`, von: tag(), bis: tag() })) };
      const b = { mandanten: [m] };
      expect(kalendertagFehler(b, null)).toBeNull();
      expect(kalendertagFehler(b, { mandanten: [{ id: "m-a" }] })).toBeNull();
    }
  });
});

/* ---------- 3. Oberfläche: zuschlagStunden ---------- */
describe("zuschlagStunden: kein Wurf, „nicht verfügbar“", () => {
  it("ein Monat, dessen Tage es nicht gibt, liefert nichtVerfuegbar statt eines Wurfs", () => {
    const p = { id: "p1", vorname: "V", nachname: "N", rolle: "mitarbeiter", status: "aktiv", wochenstunden: 39,
      zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }], qualifikationen: [] };
    const m = { id: "m-a", personen: [p], einheiten: [{ id: "e1", name: "E" }], zyklus: [], anker: "2026-01-05",
      dienstarten: [{ id: "N", name: "Nacht", start: "22:00", ende: "06:00", pause: 0 }],
      abweichungen: { "p1|2026-13-01": "N" }, erfassung: {}, einstempeln: {}, abwesenheiten: [], zuschlaege: [], einstellungen: {} };
    const r = zuschlagStunden(m, p, "2026-13");
    expect(r).toMatchObject({ nacht: null, sonntag: null, feiertag: null, samstag: null, gesamt: null, nichtVerfuegbar: true, ungueltigerKalendertag: true });
  });
});

/* ---------- 3b. Folgepunkt (3): zuschlagWert reicht „nicht verfügbar" durch ---------- */
describe("zuschlagWert: unechter Monat → keine Zahlen; gültige Monate wie bisher", () => {
  const p = { id: "p1", vorname: "V", nachname: "N", rolle: "mitarbeiter", status: "aktiv", wochenstunden: 39,
    zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }], qualifikationen: [] };
  const betrieb = (abw) => ({ id: "m-a", personen: [p], einheiten: [{ id: "e1", name: "E" }], zyklus: [], anker: "2026-01-05",
    dienstarten: [{ id: "N", name: "Nacht", start: "22:00", ende: "06:00", pause: 0 }], abweichungen: abw, erfassung: {}, einstempeln: {},
    abwesenheiten: [], einstellungen: {},
    zuschlaege: [{ id: "z1", name: "Nacht", art: "nacht", prozent: 25, aktiv: true }, { id: "z2", name: "Sonntag", art: "sonntag", prozent: 50, aktiv: true },
      { id: "z3", name: "Aus", art: "samstag", prozent: 10, aktiv: false }] });
  /* die Formel vor dem Folgepunkt, wörtlich (ohne Freeze-Zweig, der hier nicht greift) */
  const altWert = (m, ym) => {
    const std = zuschlagStunden(m, p, ym);
    const zeilen = (m.zuschlaege || []).filter((z) => z.aktiv).map((z) => {
      const h = std[z.art] || 0;
      return { regel: z, stunden: Math.round(h * 100) / 100, wert: Math.round(h * z.prozent / 100 * 100) / 100 };
    });
    return { std, zeilen, summe: Math.round(zeilen.reduce((a, l) => a + l.wert, 0) * 100) / 100 };
  };
  it("2026-13: nichtVerfuegbar, summe null, je aktiver Regel eine Zeile ohne Wert (keine 0)", async () => {
    const { zuschlagWert } = await import("../src/lib/fachlogik.js");
    const m = betrieb({ "p1|2026-13-01": "N" });
    const w = zuschlagWert(m, p, "2026-13");
    expect(w.summe).toBeNull();
    expect(w.nichtVerfuegbar).toBe(true);
    expect(w.zeilen.map((z) => [z.regel.id, z.stunden, z.wert])).toEqual([["z1", null, null], ["z2", null, null]]);
    expect(altWert(m, "2026-13").summe).toBe(0);   // das war der Befund: eine Zahl statt „nicht verfügbar"
  });
  it("gültige Monate: Ergebnis gleich der alten Formel", async () => {
    const { zuschlagWert } = await import("../src/lib/fachlogik.js");
    for (const ym of ["2026-01", "2026-02", "2026-03", "2026-10", "2024-02"]) {
      const abw = {};
      for (let t = 1; t <= 28; t += 3) abw[`p1|${ym}-${String(t).padStart(2, "0")}`] = "N";
      const m = betrieb(abw);
      expect(zuschlagWert(m, p, ym), ym).toEqual(altWert(betrieb(abw), ym));
    }
  });
});

/* ---------- 2c. Über den echten Handler: PUT /api/bestand und Teilweg ---------- */
const WIRT = "127.0.0.1:3000";
const RAUM = "p212-kalendertag";
let wurzel, laden, daten, B, token;
let nr = 0;
const anfrage = async (pfad, { methode = "POST", rumpf, tok } = {}) => {
  nr += 1;
  const kopf = { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.62.${Math.floor(nr / 250) % 250}.${nr % 250}` };
  if (methode !== "GET") kopf["content-type"] = "application/json";
  if (tok) kopf.authorization = `Bearer ${tok}`;
  const a = await daten(new Request(`http://${WIRT}${pfad}`, { method: methode, headers: kopf,
    ...(methode === "GET" ? {} : { body: JSON.stringify(rumpf || {}) }) }), {});
  let d = {}; try { d = await a.json(); } catch { /* leer */ }
  return { status: a.status, ...d };
};
const roh = async () => (await B.bestandLesen(laden(), RAUM)).bestand;
const ALT_ERF = { start: "08:00", ende: "16:00", bestaetigt: true };
const person = (id, rolle) => ({ id, vorname: "V", nachname: `N${id}`, rolle, bereich: "ALLE", status: "aktiv", qualifikationen: [],
  zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }] });
const bestand = () => ({ version: 9, mandanten: [{ id: "m-a", name: "A", status: "aktiv", einstellungen: {},
  einheiten: [{ id: "e1", name: "E" }], dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00", mindest: { mo_do: 0, fr: 0, sa: 0, so: 0 } }],
  personen: [person("l1", "leitung"), person("m1", "mitarbeiter")],
  /* Alteinträge mit einem Tag, den es nicht gibt — so wie ein Altbestand sie tragen kann */
  abweichungen: { "m1|2026-04-31": "F" }, einstempeln: {}, erfassung: { "m1|2026-02-30": ALT_ERF }, anfragen: [],
  abwesenheiten: [{ id: "abw-alt", personId: "m1", art: "urlaub", von: "2026-06-31", bis: "2026-07-02" }] }] });
/** Stabiles JSON wie in wp48-teilweg.test.js (Version eines Kernfelds). */
function stabil(x) {
  if (x === undefined) return "null";
  if (x === null || typeof x !== "object") return JSON.stringify(x);
  if (Array.isArray(x)) return `[${x.map((e) => (e === undefined ? "null" : stabil(e))).join(",")}]`;
  return `{${Object.keys(x).filter((k) => x[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${stabil(x[k])}`).join(",")}}`;
}
const version = (x) => createHash("sha256").update(stabil(x)).digest("hex").slice(0, 32);

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-p212-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
  process.env.CENTRIC_TEILSPEICHERUNG = "true";
  const schutz = await import("../server/lib/schutz.mjs");
  for (const art of Object.keys(schutz.GRENZEN)) schutz.GRENZEN[art] = { ...schutz.GRENZEN[art], versuche: 100000 };
  const { getStore } = await import("../server/lib/ablage.mjs");
  laden = () => getStore({ name: "centric", consistency: "strong" });
  daten = (await import("../server/funktionen/daten.mjs")).default;
  B = await import("../server/lib/bestand.mjs");
  const { sitzungAnlegen } = await import("../server/lib/sitzungen.mjs");
  await B.bestandSchreiben(laden(), RAUM, bestand(), { durch: "Pruefung" });
  token = (await sitzungAnlegen({ bestand: RAUM, name: "V Nl1", rolle: "leitung", person: "l1", betrieb: 0, mandantId: "m-a", einheit: null },
    2 * 3600 * 1000)).token;
});
afterAll(async () => {
  delete process.env.CENTRIC_TEILSPEICHERUNG;
  if (wurzel) await rm(wurzel, { recursive: true, force: true });
});

describe("Handler: PUT /api/bestand", () => {
  const holen = async () => {
    const g = await anfrage("/api/bestand", { methode: "GET", tok: token });
    expect(g.status).toBe(200);
    return g;
  };
  const schreiben = (g, aendern) => {
    const b = JSON.parse(JSON.stringify(g.bestand));
    aendern(b.mandanten[0]);
    return anfrage("/api/bestand", { methode: "PUT", tok: token, rumpf: { bestand: b, etag: g.etag, durch: "Pruefung" } });
  };
  it("eine unabhängige Änderung geht durch; die Alteinträge bleiben byte-gleich", async () => {
    const w = await schreiben(await holen(), (m) => { m.name = "A geändert"; });
    expect(w.status, JSON.stringify(w)).toBe(200);
    const s = (await roh()).mandanten[0];
    expect(s.name).toBe("A geändert");
    expect(s.erfassung["m1|2026-02-30"]).toEqual(ALT_ERF);
    expect(s.abweichungen["m1|2026-04-31"]).toBe("F");
    expect(s.abwesenheiten.find((a) => a.id === "abw-alt")).toEqual(bestand().mandanten[0].abwesenheiten[0]);
  });
  for (const [titel, aendern, feld] of [
    ["neuer Ist-Eintrag 2026-02-31", (m) => { m.erfassung["m1|2026-02-31"] = { ...ALT_ERF }; }, "mandanten[0].erfassung"],
    ["Alteintrag geändert", (m) => { m.erfassung["m1|2026-02-30"] = { ...ALT_ERF, ende: "17:00" }; }, "mandanten[0].erfassung"],
    ["neue Einteilung 2026-09-31", (m) => { m.abweichungen["m1|2026-09-31"] = "F"; }, "mandanten[0].abweichungen"],
    ["neue Abwesenheit bis 2026-11-31", (m) => { m.abwesenheiten.push({ id: "abw-neu", personId: "m1", art: "urlaub", von: "2026-11-30", bis: "2026-11-31" }); },
      "mandanten[0].abwesenheiten[1].bis"],
  ]) {
    it(`${titel}: 422 UNGUELTIGER_KALENDERTAG, nichts geändert`, async () => {
      const vorher = JSON.stringify(await roh());
      const w = await schreiben(await holen(), aendern);
      expect(w.status, JSON.stringify(w)).toBe(422);
      expect(w.code).toBe(UNGUELTIGER_KALENDERTAG);
      expect(w.feld).toBe(feld);
      expect(w.text).toContain("Es wurde nichts geändert.");
      expect(JSON.stringify(await roh())).toBe(vorher);
    });
  }
});

describe("Handler: Teilweg POST /api/bestand/teile", () => {
  const holen = async () => {
    const g = await anfrage("/api/bestand", { methode: "GET", tok: token });
    expect(g.status).toBe(200);
    expect(g.teile && g.teile.epoche, "Teilweg-Versionen in der Antwort").toBeTruthy();
    return g;
  };
  it("neue Zelle mit unechtem Tag: 422 schon in der Formprüfung des Teilwegs (TEILE_UNGUELTIG, bestehend), nichts geändert", async () => {
    const g = await holen();
    const vorher = JSON.stringify(await roh());
    const t = await anfrage("/api/bestand/teile", { methode: "POST", tok: token, rumpf: { format: 1, epoche: g.teile.epoche, durch: "Pruefung",
      zellen: [{ feld: "erfassung", k: "m1|2026-02-31", alt: null, neu: { ...ALT_ERF } }] } });
    expect(t.status, JSON.stringify(t)).toBe(422);
    expect(t.code).toBe("TEILE_UNGUELTIG");
    expect(t.text).toContain("Schlüssel ungültig");
    expect(JSON.stringify(await roh())).toBe(vorher);
  });
  it("Kern abwesenheiten: neue mit unechtem Tag 422; eine gültige neue geht, die Altangabe bleibt", async () => {
    const g = await holen();
    const m = g.bestand.mandanten[0];
    const kern = (wert) => ({ abwesenheiten: { basis: g.teile.versionen["kern:abwesenheiten"] ?? version(m.abwesenheiten), wert } });
    const neu = (bis) => [...m.abwesenheiten, { id: "abw-t", personId: "m1", art: "urlaub", von: "2026-11-30", bis }];
    const f = await anfrage("/api/bestand/teile", { methode: "POST", tok: token, rumpf: { format: 1, epoche: g.teile.epoche, durch: "Pruefung", kern: kern(neu("2026-11-31")) } });
    expect(f.status, JSON.stringify(f)).toBe(422);
    expect(f.code).toBe(UNGUELTIGER_KALENDERTAG);
    const ok = await anfrage("/api/bestand/teile", { methode: "POST", tok: token, rumpf: { format: 1, epoche: g.teile.epoche, durch: "Pruefung", kern: kern(neu("2026-12-01")) } });
    expect(ok.status, JSON.stringify(ok)).toBe(200);
    const s = (await roh()).mandanten[0];
    expect(s.abwesenheiten.map((a) => [a.id, a.von, a.bis])).toEqual([["abw-alt", "2026-06-31", "2026-07-02"], ["abw-t", "2026-11-30", "2026-12-01"]]);
    expect(s.erfassung["m1|2026-02-30"]).toEqual(ALT_ERF);
  });
});

/* ---------- A1 (Review #344): Monat der Abschlussaktionen außerhalb 2000–2999 → 422, kein Wurf ---------- */
describe("Monatsabschluss: Jahr außerhalb 2000–2999", () => {
  let MA;
  beforeAll(async () => { MA = await import("../server/lib/monatsabschluss.mjs"); });
  const betrieb = () => ({ id: "m-a", personen: [{ id: "p1", vorname: "V", nachname: "N", rolle: "mitarbeiter", status: "aktiv", wochenstunden: 39,
      zugehoerigkeit: [{ ab: "1990-01-01", einheitId: "e1" }], qualifikationen: [] }],
    einheiten: [{ id: "e1", name: "E" }], zyklus: [], anker: "2026-01-05",
    dienstarten: [{ id: "N", name: "Nacht", start: "22:00", ende: "06:00", pause: 0 }],
    abweichungen: { "p1|1999-12-10": "N", "p1|3000-01-10": "N", "p1|2000-01-10": "N", "p1|2999-12-10": "N" },
    erfassung: {}, einstempeln: {}, abwesenheiten: [], zuschlaege: [], einstellungen: {} });
  const wer = { personId: "l1", name: "L", rolle: "leitung" };
  const jetzt = new Date("2026-03-10T12:00:00.000Z");
  const aufrufe = (monat) => [
    ["abschliessen", () => MA.abschliessen(betrieb(), { monat, bestaetigt: true }, wer, jetzt, "ma-1", "2026-03-10")],
    ["wiederoeffnen", () => MA.wiederoeffnen(betrieb(), { monat, grund: "Prüfung des Monats" }, wer, jetzt, "ma-1")],
    ["lohnexportBestaetigen", () => MA.lohnexportBestaetigen(betrieb(), { monat }, wer, jetzt, "ma-1")],
    ["korrekturBeginnen", () => MA.korrekturBeginnen(betrieb(), { monat, grund: "Prüfung des Monats" }, wer, jetzt, "ma-1")],
    ["korrekturFreigeben", () => MA.korrekturFreigeben(betrieb(), { monat }, wer, jetzt, "ma-1", "2026-03-10")],
    ["korrekturVerwerfen", () => MA.korrekturVerwerfen(betrieb(), { monat, grund: "Prüfung des Monats" }, wer, jetzt, "ma-1")],
  ];
  const ART = { abschliessen: "anlegen", lohnexportBestaetigen: "anlegen", korrekturFreigeben: "anlegen",
    wiederoeffnen: "oeffnen", korrekturBeginnen: "oeffnen", korrekturVerwerfen: "verwerfen" };
  const OEFFNEN_409 = (monat) => ({ status: 409, code: MA.UNGUELTIGER_MONAT,
    grund: `Monat außerhalb der unterstützten Jahre 2000–2999: ${monat} bleibt, wie er ist. Eine Änderung nur durch den Betreiber.` });
  const ANLEGEN_422 = () => ({ status: 422, grund: "Kein gültiger Monat (Jahr 2000 bis 2999).", code: MA.UNGUELTIGER_MONAT });
  it("1999-12, 3000-01 (nicht gespeichert): anlegen/verwerfen 422, öffnen 409 — alle mit UNGUELTIGER_MONAT", () => {
    for (const monat of ["1999-12", "3000-01", "0000-01", "9999-12"])
      for (const [name, f] of aufrufe(monat))
        expect(f(), `${name} ${monat}`).toEqual(ART[name] === "oeffnen" ? OEFFNEN_409(monat) : ANLEGEN_422());
  });
  it("falsche Form wie bisher (ohne Code)", () => {
    for (const monat of ["2026-13", "2026-1", "", undefined, ["2026-01"], 202601, ["1999-12"]])
      for (const [name, f] of aufrufe(monat)) expect(f(), `${name} ${monat}`).toEqual({ status: 422, grund: "Kein gültiger Monat (JJJJ-MM)." });
  });
  it("2000-01 und 2999-12 sind gültig: kein Monatsfehler, kein Wurf (Abschluss mit geplantem Nachtdienst)", () => {
    for (const monat of ["2000-01", "2999-12", "2026-02"])
      for (const [name, f] of aufrufe(monat)) {
        const r = f();
        expect(r && r.code, `${name} ${monat}`).not.toBe(MA.UNGUELTIGER_MONAT);
        expect(String((r && r.grund) || ""), `${name} ${monat}`).not.toMatch(/Kein gültiger Monat|außerhalb der unterstützten/);
      }
    const r = MA.abschliessen(betrieb(), { monat: "2000-01", bestaetigt: true }, wer, jetzt, "ma-1", "2026-03-10");
    expect("mandant" in r, JSON.stringify(r).slice(0, 300)).toBe(true);
    expect(r.mandant.istEingefroren["p1|2000-01-10"]).toBeTruthy();
  });

  /* Delta-Review Runde 3 (A1-K1): ein GESPEICHERTER Altmonat 1999-12 — echter Schema-3-Freeze mit bestätigtem
     Lohnexport, erzeugt mit dem Code der Basis 32951445 (pruefungen/fixtures/p212-altmonat-1999-12.json). Sicherer
     Zustand: abgeschlossen (und exportiert) bleibt abgeschlossen. Geprüft wird der ZUSTAND, nicht nur der Status. */
  const FIX = JSON.parse(readFileSync(new URL("./fixtures/p212-altmonat-1999-12.json", import.meta.url), "utf8"));
  const M = "1999-12";
  const zustand = (m) => {
    const e = MA.abschlussEintrag(m, M);
    return { abgeschlossen: e.abgeschlossen, lohnexport: e.lohnexport ?? null, revision: e.revision ?? null, schema: e.schema, abdruck: e.abdruck,
      verlauf: e.verlauf.length, korrektur: e.korrektur ?? null, freeze: Object.keys(m.istEingefroren).filter((k) => k.includes(M)).sort(),
      sperre: MA.abschlussSperre(m, "1999-12-10"), laufend: MA.hatLaufendeKorrektur(m) };
  };
  it("Fixture: Schema-3-Freeze, bestätigter Lohnexport, Sperre aktiv", () => {
    const z = zustand(FIX.exportiert);
    expect(z).toMatchObject({ abgeschlossen: true, laufend: false });
    expect(z.lohnexport).toBeTruthy();
    expect(z.freeze.length).toBeGreaterThan(0);
    expect(z.sperre).toMatchObject({ code: MA.MONAT_ABGESCHLOSSEN, monat: M });
    expect(freezeStatus(FIX.exportiert, M)).toMatchObject({ reproduzierbar: true });
    expect(MA.istAbdruck(FIX.exportiert, M)).toBe(z.abdruck);
  });
  it("exportierter Altmonat: korrekturBeginnen 409 vor jeder Zustandsänderung — Abschluss, Lohnexport, Freeze, Revision, Sperre unverändert", () => {
    const m = JSON.parse(JSON.stringify(FIX.exportiert)), vorher = JSON.stringify(m), z0 = zustand(m);
    for (const w of [wer, { personId: "l2", name: "L2", rolle: "leitung" }]) {
      const k = MA.korrekturBeginnen(m, { monat: M, grund: "Prüfung des Monats", anlass: Object.keys(MA.KORREKTUR_ANLAESSE)[0] }, w, jetzt, "ma-5");
      expect(k).toEqual(OEFFNEN_409(M));
    }
    expect(MA.wiederoeffnen(m, { monat: M, grund: "Prüfung des Monats" }, wer, jetzt, "ma-5")).toEqual(OEFFNEN_409(M));
    expect(MA.korrekturFreigeben(m, { monat: M }, wer, jetzt, "ma-5", "2026-03-10")).toEqual(ANLEGEN_422());
    expect(MA.korrekturVerwerfen(m, { monat: M, grund: "Prüfung des Monats" }, wer, jetzt, "ma-5").status).toBe(409);   // keine laufende Korrektur
    expect(JSON.stringify(m)).toBe(vorher);
    expect(zustand(m)).toEqual(z0);
  });
  it("nur geschlossener (nicht exportierter) Altmonat: wiederoeffnen 409 und unverändert; abschliessen/lohnexport 422", () => {
    const m = JSON.parse(JSON.stringify(FIX.geschlossen)), vorher = JSON.stringify(m), z0 = zustand(m);
    expect(z0).toMatchObject({ abgeschlossen: true, lohnexport: null });
    expect(MA.wiederoeffnen(m, { monat: M, grund: "Prüfung des Monats" }, wer, jetzt, "ma-6")).toEqual(OEFFNEN_409(M));
    expect(MA.abschliessen(m, { monat: M, bestaetigt: true }, wer, jetzt, "ma-6", "2026-03-10")).toEqual(ANLEGEN_422());
    const a = MA.abschlussEintrag(m, M);
    expect(MA.lohnexportBestaetigen(m, { monat: M, abdruck: a.abdruck, stand: a.stand, revision: 1, zeilen: "x" }, wer, jetzt, "ma-6")).toEqual(ANLEGEN_422());
    expect(JSON.stringify(m)).toBe(vorher);
    expect(zustand(m)).toEqual(z0);
    expect(z0.sperre).toMatchObject({ code: MA.MONAT_ABGESCHLOSSEN });
  });
  it("eine schon laufende Korrektur eines Altmonats (vor P2-12 begonnen) lässt sich verwerfen; ohne gespeicherten Abschluss 422", () => {
    const e = MA.abschlussEintrag(FIX.exportiert, M);
    const { abdruck: _a, stand: _s, lohnexport: _l, ...rest } = e;
    void _a; void _s; void _l;
    const laufend = { ...FIX.exportiert, istEingefroren: {}, monatsabschluss: { [M]: { ...rest, abgeschlossen: false, revision: 2,
      korrektur: { offen: true, id: "k1", am: "2026-03-01T08:00:00.000Z", wer: { personId: "l2" }, anlass: Object.keys(MA.KORREKTUR_ANLAESSE)[0], vonRevision: 1, freigabe: null } } } };
    const v = MA.korrekturVerwerfen(laufend, { monat: M, grund: "Prüfung des Monats" }, wer, jetzt, "ma-7");
    expect("mandant" in v, JSON.stringify(v).slice(0, 300)).toBe(true);
    expect(v.eintrag.korrektur).toMatchObject({ offen: false, verworfen: true });
    /* Bestehende Semantik (unverändert, nur dokumentiert): Eine verworfene Korrektur „läuft" bis zum nächsten Abschluss
       (laeuft zählt verworfen mit) — für einen Altmonat, der sich nicht mehr abschließen lässt, also dauerhaft. */
    expect(MA.hatLaufendeKorrektur(v.mandant)).toBe(true);
    expect(MA.korrekturFreigeben(laufend, { monat: M }, wer, jetzt, "ma-7", "2026-03-10")).toEqual(ANLEGEN_422());
    expect(MA.korrekturVerwerfen(betrieb(), { monat: "1998-12", grund: "Prüfung des Monats" }, wer, jetzt, "ma-7")).toEqual(ANLEGEN_422());
  });
});

/* ---------- 2e. Folgepunkte (2)/(4) über den echten Handler, je Rolle (LT/PL/SV/MA/Betriebsrat) ----------
   Geprüft wird der ZUSTAND (gespeicherter Stand byte-gleich bzw. genau die erwartete Änderung), nicht nur der Status. */
describe("Handler: anfragen/ausschreibungen/krankmeldungen je Rolle", () => {
  const R2 = "p212-folgepunkte";
  const VERLAUF = [{ schritt: "eingegangen", von: "m1", rolle: "mitarbeiter", zeit: "2026-03-01T08:00:00.000Z" }];
  const p2 = (id, rolle, bereich = "ALLE") => ({ ...person(id, rolle), bereich });
  const start = () => ({ version: 9, mandanten: [{ id: "m-a", name: "A", status: "aktiv", einstellungen: {},
    einheiten: [{ id: "e1", name: "E" }], dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00", mindest: { mo_do: 0, fr: 0, sa: 0, so: 0 } }],
    personen: [p2("l1", "leitung"), p2("pl1", "planer"), p2("sv1", "subplaner", "e1"), p2("m1", "mitarbeiter", "e1"), p2("m2", "mitarbeiter", "e1"), p2("br1", "betriebsrat")],
    abweichungen: {}, einstempeln: {}, erfassung: { "m1|2026-2-30": ALT_ERF }, abwesenheiten: [], nachrichten: [], wuensche: [],
    /* Alteinträge mit Tagen, die es nicht gibt */
    anfragen: [{ id: "r-alt", personId: "m1", typ: "abwesenheit", art: "urlaub", von: "2026-02-30", bis: "2026-03-01", status: "offen", erstellt: "x", antwort: "" },
      { id: "r-tausch", personId: "m2", typ: "tausch", status: "offen", von: "2026-04-31", bis: "2026-04-31", partnerId: null, interessenten: ["x9", "m1", "x8"], text: "", erstellt: "x" },
      /* Review #356 M1: fremde Anträge, die die Sicht für m1 verbirgt (kein offenes Tauschgesuch) — einer mit unechtem Tag */
      { id: "r-verborgen", personId: "m2", typ: "abwesenheit", art: "urlaub", von: "2026-06-31", bis: "2026-07-01", status: "offen", erstellt: "x", antwort: "" },
      { id: "r-urlaub-ok", personId: "m2", typ: "abwesenheit", art: "urlaub", von: "2026-07-06", bis: "2026-07-07", status: "offen", erstellt: "x", antwort: "" },
      /* Delta-Review #356 A1: verborgene Tauschgesuche — mit festem Partner und entschieden (je mit unechtem Tag) */
      { id: "t-partner", personId: "m2", typ: "tausch", status: "offen", von: "2026-09-31", bis: "2026-09-31", partnerId: "m1", interessenten: [], text: "", erstellt: "x" },
      { id: "t-zu", personId: "m2", typ: "tausch", status: "genehmigt", von: "2026-11-31", bis: "2026-11-31", partnerId: null, interessenten: [], text: "", erstellt: "x" },
      /* ein sichtbares, gültiges Tauschgesuch (Regression: Interesse melden und zurückziehen) */
      { id: "r-tausch-ok", personId: "m2", typ: "tausch", status: "offen", von: "2026-07-02", bis: "2026-07-02", partnerId: null, interessenten: [], text: "", erstellt: "x" }],
    ausschreibungen: [{ id: "as-alt", datum: "2026-06-31", dienstId: "F", einheitId: "e1", hinweis: "", status: "offen", erstellt: "2026-03-01T08:00:00.000Z", durch: "L",
      bewerbungen: [{ personId: "m1", text: "" }, { personId: "m2", text: "" }], vergebenAn: null }],
    krankmeldungen: [{ id: "km-alt", personId: "m1", von: "2026-09-31", bis: "2026-10-01", status: "eingegangen", verlauf: VERLAUF }] }] });
  const roh2 = async () => (await B.bestandLesen(laden(), R2)).bestand;
  const tok = {};
  beforeAll(async () => {
    const { sitzungAnlegen } = await import("../server/lib/sitzungen.mjs");
    for (const [pid, rolle] of [["l1", "leitung"], ["pl1", "planer"], ["sv1", "subplaner"], ["m1", "mitarbeiter"], ["br1", "betriebsrat"]])
      tok[rolle] = (await sitzungAnlegen({ bestand: R2, name: pid, rolle, person: pid, betrieb: 0, mandantId: "m-a", einheit: null }, 2 * 3600 * 1000)).token;
  });
  const zurueck = () => B.bestandSchreiben(laden(), R2, start(), { durch: "Pruefung" });
  const put = async (rolle, aendern) => {
    const g = await anfrage("/api/bestand", { methode: "GET", tok: tok[rolle] });
    expect(g.status, `GET ${rolle}`).toBe(200);
    const b = JSON.parse(JSON.stringify(g.bestand));
    aendern(b.mandanten[0]);
    return anfrage("/api/bestand", { methode: "PUT", tok: tok[rolle], rumpf: { bestand: b, etag: g.etag, durch: "Pruefung" } });
  };
  /** Die Alteinträge, wie sie gespeichert sein müssen (Zustand). */
  const altZustand = (m) => ({ erf: m.erfassung["m1|2026-2-30"], anfragen: m.anfragen.filter((a) => a.id === "r-alt" || a.id === "r-tausch"),
    as: m.ausschreibungen.filter((a) => a.id === "as-alt"), km: m.krankmeldungen.filter((f) => f.id === "km-alt") });
  const ALT = altZustand(start().mandanten[0]);
  /* Beschäftigte: Die Rechtezusammenführung (rechte.mjs, unverändert) ordnet beim Speichern die eigene Meldung bzw.
     Bewerbung hinter die fremden — das war schon vorher so und ist kein Teil dieses Folgepunkts. Verglichen wird dann
     inhaltlich ohne diese Reihenfolge; die Umordnung selbst ist ausdrücklich festgehalten. */
  const ALT_MA = (() => { const z = JSON.parse(JSON.stringify(ALT));
    z.anfragen[1].interessenten = ["x9", "x8", "m1"]; z.as[0].bewerbungen = [{ personId: "m2", text: "" }, { personId: "m1", text: "" }]; return z; })();
  const altSoll = (rolle) => (rolle === "mitarbeiter" ? ALT_MA : ALT);
  const eigenerAntrag = (pid, von, bis = von) => ({ id: `r-neu-${pid}`, personId: pid, typ: "abwesenheit", art: "urlaub", von, bis, status: "offen", erstellt: "y", antwort: "" });
  const PID = { leitung: "l1", planer: "pl1", subplaner: "sv1", mitarbeiter: "m1" };

  for (const rolle of ["leitung", "planer", "subplaner", "mitarbeiter"]) {
    it(`${rolle}: unabhängiger gültiger Antrag 200 — Alteinträge (auch umgeordnete Interessenten/Bewerbungen) byte-gleich`, async () => {
      await zurueck();
      const w = await put(rolle, (m) => { m.anfragen.unshift(eigenerAntrag(PID[rolle], "2026-03-02")); });
      expect(w.status, JSON.stringify(w)).toBe(200);
      const s = (await roh2()).mandanten[0];
      expect(altZustand(s)).toEqual(altSoll(rolle));
      expect(s.anfragen.find((a) => a.id === `r-neu-${PID[rolle]}`)).toMatchObject({ von: "2026-03-02", status: "offen" });
    });
    it(`${rolle}: eigener Antrag mit 2026-02-30 → 422 UNGUELTIGER_KALENDERTAG, gespeicherter Stand unverändert`, async () => {
      await zurueck();
      const vorher = JSON.stringify(await roh2());
      const w = await put(rolle, (m) => { m.anfragen.unshift(eigenerAntrag(PID[rolle], "2026-02-30", "2026-03-01")); });
      expect(w.status, JSON.stringify(w)).toBe(422);
      expect(w.code).toBe(UNGUELTIGER_KALENDERTAG);
      expect(w.feld).toMatch(/^mandanten\[0\]\.anfragen\[\d+\]\.von$/);
      expect(w.text).toBe("Den Kalendertag 2026-02-30 gibt es nicht. Es wurde nichts geändert.");
      expect(JSON.stringify(await roh2())).toBe(vorher);
    });
  }
  it("mitarbeiter: Krankmeldung per Speichern mit 2026-02-30 → 422 (krankmeldungen), kein Fall; gültig → Fall gespeichert", async () => {
    await zurueck();
    const vorher = JSON.stringify(await roh2());
    const krank = (von) => (m) => { m.abwesenheiten.push({ id: "kr-neu", personId: "m1", art: "krank", von, bis: von, notiz: "" }); };
    const w = await put("mitarbeiter", krank("2026-02-30"));
    expect(w.status, JSON.stringify(w)).toBe(422);
    expect(w.code).toBe(UNGUELTIGER_KALENDERTAG);
    expect(w.feld).toBe("mandanten[0].krankmeldungen[0].von");
    expect(JSON.stringify(await roh2())).toBe(vorher);
    const ok = await put("mitarbeiter", krank("2026-03-02"));
    expect(ok.status, JSON.stringify(ok)).toBe(200);
    const s = (await roh2()).mandanten[0];
    expect(s.krankmeldungen.map((f) => [f.id, f.von, f.status])).toEqual([["km-kr-neu", "2026-03-02", "eingegangen"], ["km-alt", "2026-09-31", "eingegangen"]]);
    expect(s.abwesenheiten).toEqual([]);
    expect(altZustand(s)).toEqual(ALT_MA);
  });
  it("mitarbeiter: fremder Antrag mit unechtem Tag fällt wie bisher still weg (Rechte zuerst, kein 422-Orakel)", async () => {
    await zurueck();
    const vorher = JSON.stringify(await roh2());
    const w = await put("mitarbeiter", (m) => { m.anfragen.unshift({ ...eigenerAntrag("m2", "2026-02-30"), id: "r-fremd" }); });
    expect(w.status, JSON.stringify(w)).toBe(200);
    expect((await roh2()).mandanten[0].anfragen.map((a) => a.id).sort()).toEqual(JSON.parse(vorher).mandanten[0].anfragen.map((a) => a.id).sort());
    expect(altZustand((await roh2()).mandanten[0])).toEqual(ALT_MA);
  });
  it("subplaner: neue Ausschreibung am 2026-02-30 → 422; am echten Tag 200", async () => {
    await zurueck();
    const vorher = JSON.stringify(await roh2());
    const neu = (datum) => (m) => { m.ausschreibungen.unshift({ id: "as-neu", datum, dienstId: "F", hinweis: "", status: "offen", bewerbungen: [], vergebenAn: null }); };
    const w = await put("subplaner", neu("2026-02-30"));
    expect(w.status, JSON.stringify(w)).toBe(422);
    expect(w.feld).toBe("mandanten[0].ausschreibungen[0].datum");
    expect(JSON.stringify(await roh2())).toBe(vorher);
    const ok = await put("subplaner", neu("2026-03-02"));
    expect(ok.status, JSON.stringify(ok)).toBe(200);
    const s = (await roh2()).mandanten[0];
    expect(s.ausschreibungen.map((a) => [a.id, a.datum])).toEqual([["as-neu", "2026-03-02"], ["as-alt", "2026-06-31"]]);
    expect(altZustand(s)).toEqual(ALT);
  });
  it("leitung: unechten Altantrag entscheiden → 422; Schlüssel ohne Nullen neu → 422; löschen → 200 und weg", async () => {
    await zurueck();
    const vorher = JSON.stringify(await roh2());
    const w = await put("leitung", (m) => { m.anfragen = m.anfragen.map((a) => (a.id === "r-alt" ? { ...a, status: "genehmigt" } : a)); });
    expect(w.status, JSON.stringify(w)).toBe(422);
    expect(w.feld).toMatch(/^mandanten\[0\]\.anfragen\[\d+\]\.von$/);
    expect(JSON.stringify(await roh2())).toBe(vorher);
    const k = await put("leitung", (m) => { m.erfassung["m2|2026-3-2"] = { ...ALT_ERF }; });
    expect(k.status, JSON.stringify(k)).toBe(422);
    expect(k.text).toBe("Das Datum 2026-3-2 hat nicht die Form JJJJ-MM-TT. Es wurde nichts geändert.");
    expect(JSON.stringify(await roh2())).toBe(vorher);
    const d = await put("leitung", (m) => { m.anfragen = m.anfragen.filter((a) => a.id !== "r-alt"); });
    expect(d.status, JSON.stringify(d)).toBe(200);
    const s = (await roh2()).mandanten[0];
    expect(s.anfragen.map((a) => a.id)).toEqual(["r-tausch", "r-verborgen", "r-urlaub-ok", "t-partner", "t-zu", "r-tausch-ok"]);
    expect(s.erfassung["m1|2026-2-30"]).toEqual(ALT_ERF);
  });
  it("Review #356 M1: Interesse an einem verborgenen fremden Antrag (erratene Kennung) — 200, Zustand unverändert, wie eine Kennung, die es nicht gibt", async () => {
    const ohneStand = (w) => { const { etag: _e, stand: _s, ...rest } = w; void _e; void _s; return rest; };
    const antworten = {};
    for (const id of ["r-verborgen", "r-urlaub-ok", "t-partner", "t-zu", "r-gibt-es-nicht"]) {
      await zurueck();
      const vorher = (await roh2()).mandanten[0];
      const w = await put("mitarbeiter", (m) => { m.anfragen.push({ id, interessenten: ["m1"] }); });
      expect(w.status, `${id} ${JSON.stringify(w)}`).toBe(200);
      antworten[id] = ohneStand(w);
      const s = (await roh2()).mandanten[0];
      /* Zustand: alle Anträge außer der umgeordneten Interessenliste des sichtbaren Alt-Tauschgesuchs byte-gleich */
      /* (anfragenZusammen reiht unverändert die gesendeten vor die nicht gesendeten — Reihenfolge zählt hier nicht) */
      const ohneTausch = (m) => m.anfragen.filter((a) => a.id !== "r-tausch").sort((x, y) => x.id.localeCompare(y.id));
      expect(ohneTausch(s), id).toEqual(ohneTausch(vorher));
      expect(s.anfragen.find((a) => a.id === "r-verborgen").interessenten, id).toBeUndefined();
      expect(s.anfragen.find((a) => a.id === "r-urlaub-ok").interessenten, id).toBeUndefined();
      expect(s.anfragen.find((a) => a.id === "t-partner").interessenten, id).toEqual([]);
      expect(s.anfragen.find((a) => a.id === "t-zu").interessenten, id).toEqual([]);
    }
    for (const id of ["r-verborgen", "r-urlaub-ok", "t-partner", "t-zu"]) expect(antworten[id], id).toEqual(antworten["r-gibt-es-nicht"]);
  });
  it("Regression: Interesse an einem sichtbaren Tauschgesuch melden und zurückziehen geht weiter", async () => {
    await zurueck();
    const an = await put("mitarbeiter", (m) => { m.anfragen.find((a) => a.id === "r-tausch-ok").interessenten = ["m1"]; });
    expect(an.status, JSON.stringify(an)).toBe(200);
    expect((await roh2()).mandanten[0].anfragen.find((a) => a.id === "r-tausch-ok").interessenten).toEqual(["m1"]);
    const ab = await put("mitarbeiter", (m) => { m.anfragen.find((a) => a.id === "r-tausch-ok").interessenten = []; });
    expect(ab.status, JSON.stringify(ab)).toBe(200);
    expect((await roh2()).mandanten[0].anfragen.find((a) => a.id === "r-tausch-ok").interessenten).toEqual([]);
  });
  it("betriebsrat: Speichern mit unechtem Antrag → Rechte-Absage vor jeder Tagesprüfung (kein 422), nichts geändert", async () => {
    await zurueck();
    const vorher = JSON.stringify(await roh2());
    const w = await put("betriebsrat", (m) => { m.anfragen.unshift(eigenerAntrag("br1", "2026-02-30")); });
    expect(w.status, JSON.stringify(w)).not.toBe(422);
    expect(w.code).not.toBe(UNGUELTIGER_KALENDERTAG);
    expect(JSON.stringify(await roh2())).toBe(vorher);
  });
});
