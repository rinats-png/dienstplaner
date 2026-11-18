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
  it("1999-12 und 3000-01: 422 UNGUELTIGER_MONAT in allen Abschlussaktionen", () => {
    for (const monat of ["1999-12", "3000-01", "0000-01", "9999-12"])
      for (const [name, f] of aufrufe(monat))
        expect(f(), `${name} ${monat}`).toEqual({ status: 422, grund: "Kein gültiger Monat (Jahr 2000 bis 2999).", code: MA.UNGUELTIGER_MONAT });
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
        expect(String((r && r.grund) || ""), `${name} ${monat}`).not.toMatch(/Kein gültiger Monat/);
      }
    const r = MA.abschliessen(betrieb(), { monat: "2000-01", bestaetigt: true }, wer, jetzt, "ma-1", "2026-03-10");
    expect("mandant" in r, JSON.stringify(r).slice(0, 300)).toBe(true);
    expect(r.mandant.istEingefroren["p1|2000-01-10"]).toBeTruthy();
  });
  /* Delta-Review A1-1: ein GESPEICHERTER Altmonat außerhalb der Grenze darf keine Sackgasse werden. */
  const mitAbschluss = (eintrag) => ({ ...betrieb(), monatsabschluss: { "1999-12": eintrag } });
  const zu = { abgeschlossen: true, am: "2000-01-05T08:00:00.000Z", wer: { personId: "l1", name: "L", rolle: "leitung" }, abdruck: "x".repeat(32), verlauf: [] };
  it("gespeicherter Abschluss 1999-12: wiederoeffnen geht (ohne Wurf), abschliessen bleibt 422", () => {
    const w = MA.wiederoeffnen(mitAbschluss(zu), { monat: "1999-12", grund: "Prüfung des Monats" }, wer, jetzt, "ma-2");
    expect("mandant" in w, JSON.stringify(w).slice(0, 300)).toBe(true);
    expect(w.eintrag.abgeschlossen).toBe(false);
    expect(w.ereignis.istNeu).toBeNull();                       // Hinweis nicht rechenbar (Tage außerhalb der Zeitbasis)
    expect(MA.monatAbgeschlossen(w.mandant, "1999-12")).toBe(false);
    expect(MA.abschliessen(w.mandant, { monat: "1999-12", bestaetigt: true }, wer, jetzt, "ma-3", "2026-03-10"))
      .toMatchObject({ status: 422, code: MA.UNGUELTIGER_MONAT });
    expect(MA.abschliessen(mitAbschluss(zu), { monat: "1999-12", bestaetigt: true }, wer, jetzt, "ma-3", "2026-03-10"))
      .toMatchObject({ status: 422, code: MA.UNGUELTIGER_MONAT });
    expect(MA.lohnexportBestaetigen(mitAbschluss(zu), { monat: "1999-12" }, wer, jetzt, "ma-3")).toMatchObject({ status: 422, code: MA.UNGUELTIGER_MONAT });
  });
  it("gespeicherte offene Korrektur 1999-12: korrekturVerwerfen geht, korrekturFreigeben bleibt 422", () => {
    const offen = { ...zu, abgeschlossen: false, revision: 2, korrektur: { offen: true, id: "k1", am: "2000-02-01T08:00:00.000Z", wer: { personId: "l2" }, anlass: "nachtrag", vonRevision: 1, freigabe: null } };
    const v = MA.korrekturVerwerfen(mitAbschluss(offen), { monat: "1999-12", grund: "Prüfung des Monats" }, wer, jetzt, "ma-4");
    expect("mandant" in v, JSON.stringify(v).slice(0, 300)).toBe(true);
    expect(v.eintrag.korrektur).toMatchObject({ offen: false, verworfen: true });
    expect(MA.korrekturFreigeben(mitAbschluss(offen), { monat: "1999-12" }, wer, jetzt, "ma-4", "2026-03-10"))
      .toMatchObject({ status: 422, code: MA.UNGUELTIGER_MONAT });
  });
  it("gespeicherter exportierter Abschluss 1999-12: korrekturBeginnen antwortet (409), nie ein Wurf", () => {
    const exp = { ...zu, lohnexport: { am: "2000-01-06T08:00:00.000Z", wer: { personId: "l1" } } };
    const k = MA.korrekturBeginnen(mitAbschluss(exp), { monat: "1999-12", grund: "Prüfung des Monats", anlass: Object.keys(MA.KORREKTUR_ANLAESSE)[0] }, wer, jetzt, "ma-5");
    expect(k.status, JSON.stringify(k).slice(0, 300)).toBe(409);
    expect(MA.wiederoeffnen(mitAbschluss(exp), { monat: "1999-12", grund: "Prüfung des Monats" }, wer, jetzt, "ma-5"))
      .toMatchObject({ status: 409, code: MA.KORREKTUR_ERFORDERLICH });
  });
  it("nicht gespeichert: 1999-12 bleibt in allen Aktionen 422", () => {
    const fremd = mitAbschluss(zu);
    for (const [name, f] of [
      ["wiederoeffnen", () => MA.wiederoeffnen(fremd, { monat: "1998-12", grund: "Prüfung des Monats" }, wer, jetzt, "ma-6")],
      ["korrekturVerwerfen", () => MA.korrekturVerwerfen(fremd, { monat: "1998-12", grund: "Prüfung des Monats" }, wer, jetzt, "ma-6")],
      ["korrekturBeginnen", () => MA.korrekturBeginnen(fremd, { monat: "3000-01", grund: "Prüfung des Monats" }, wer, jetzt, "ma-6")],
    ]) expect(f(), name).toMatchObject({ status: 422, code: MA.UNGUELTIGER_MONAT });
  });
});
