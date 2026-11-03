/* ==========================================================================
   MONATSABSCHLUSS (WP-16): Bibliothek, Wiederherstellen, Betriebsrat-Ist

   - abschlussWiderspruch: der Wächter für PUT /api/bestand (Vollsicht,
     unveränderte Monate, Löschlauf nach Fristablauf),
   - abschlussBeiWiederherstellung, abschlussStatus, istAbdruck,
   - WP-27: Wiederöffnen und Korrektur nach der Frist ändern das einmal
     ausgegebene Ist des Betriebsrats nicht — sie stehen als istKorrigiert.
   ========================================================================== */

import { describe, it, expect, beforeEach } from "vitest";
import { createHash } from "node:crypto";
import { abschliessen, wiederoeffnen, abschlussWiderspruch, abschlussBeiWiederherstellung, abschlussStatus, istAbdruck,
  offenePunkte, abschlussSperre, monatAbgeschlossen, abschlussAusGespeichert, abgewiesenVermerken, letzteWiederoeffnung, sha256Hex } from "../server/lib/monatsabschluss.mjs";
/* Neue Grenzen (Review M3) über den Namensraum: auf dem Stand davor rot statt Ladefehler. */
import * as MAB from "../server/lib/monatsabschluss.mjs";
import { vorschau, raeumen, berichtstext } from "../server/lib/aufbewahrung.mjs";
import { auskunftBauen } from "../server/lib/auskunft.mjs";
import { korrekturAnhaengen } from "../server/lib/stempelintegritaet.mjs";
import { auswertungHolen, auswertungenVergessen, BR_NEUBERECHNUNG_MS } from "../server/lib/br-auswertung.mjs";
import { betriebSicht } from "../server/lib/sicht.mjs";

const WER_L = { personId: "l1", name: "V L1", rolle: "leitung" };
const JETZT = new Date("2026-11-05T09:00:00.000Z");
const st = (s, e) => ({ start: s, startAm: "x", ende: e, endeAm: "y" });
const basis = () => ({ id: "m1", personen: [{ id: "a1" }, { id: "a2" }], dienstarten: [], abweichungen: {},
  einstempeln: { "a1|2026-10-28": st("06:00", "14:00"), "a1|2026-09-10": st("06:00", "14:00") },
  erfassung: { "a1|2026-10-28": { start: "06:00", ende: "14:00", bestaetigt: true }, "a1|2026-10-27": { start: "06:00", ende: "14:30", bestaetigt: true },
    "a1|2026-09-10": { start: "06:00", ende: "14:00", bestaetigt: true } } });
const geschlossen = () => {
  const r = abschliessen(basis(), { monat: "2026-10" }, WER_L, JETZT, "ma-1", "2026-11-05");
  if ("status" in r) throw new Error(r.grund);
  return r.mandant;
};
const kopie = (x) => JSON.parse(JSON.stringify(x));

describe("abschliessen / wiederoeffnen", () => {
  it("Abschluss: Prüfsumme der Ist-Daten, Wann/Wer, Verlauf; Sperre greift nur im Monat", () => {
    const m = geschlossen();
    expect(m.monatsabschluss["2026-10"]).toMatchObject({ abgeschlossen: true, am: JETZT.toISOString(), wer: WER_L, abdruck: istAbdruck(basis(), "2026-10") });
    expect(monatAbgeschlossen(m, "2026-10-01")).toBe(true);
    expect(monatAbgeschlossen(m, "2026-09-30")).toBe(false);
    expect(abschlussSperre(m, "2026-10-31")).toMatchObject({ status: 409, code: "MONAT_ABGESCHLOSSEN", monat: "2026-10" });
    expect(abschlussSperre(m, "2026-11-01")).toBeNull();
  });
  it("SHA-256 ohne node:crypto (die Datei erreicht die Oberfläche) stimmt mit node:crypto überein", () => {
    for (const t of ["", "abc", "ä€😀", "x".repeat(55), "y".repeat(56), "z".repeat(64), "w".repeat(1000)])
      expect(sha256Hex(t), JSON.stringify(t.slice(0, 5))).toBe(createHash("sha256").update(t).digest("hex"));
  });
  it("Prüfsumme unabhängig von der Reihenfolge der Schlüssel, abhängig vom Inhalt", () => {
    const a = basis(), b = basis();
    b.erfassung = Object.fromEntries(Object.entries(b.erfassung).reverse());
    expect(istAbdruck(a, "2026-10")).toBe(istAbdruck(b, "2026-10"));
    b.erfassung["a1|2026-10-27"].ende = "14:31";
    expect(istAbdruck(a, "2026-10")).not.toBe(istAbdruck(b, "2026-10"));
    expect(istAbdruck(a, "2026-09")).toBe(istAbdruck(b, "2026-09"));
  });
  it("offene Punkte: Antrag, unvollständiger Stempel, Ist zur Prüfung", () => {
    const m = basis();
    m.einstempeln["a2|2026-10-03"] = { start: "06:00", startAm: "x" };
    m.erfassung["a2|2026-10-04"] = { start: "06:00", ende: "20:00", bestaetigt: false, grund: "LANGER_DIENST" };
    m.einstempeln["a1|2026-10-28"].antraege = [{ id: "ka", status: "offen" }, { id: "kb", status: "abgelehnt" }];
    expect(offenePunkte(m, "2026-10")).toEqual({ antraege: 1, offeneStempel: 1, zurPruefung: 1 });
    expect(offenePunkte(m, "2026-09")).toEqual({ antraege: 0, offeneStempel: 0, zurPruefung: 0 });
  });
  it("Wiederöffnen: Grund Pflicht, Verlauf mit abdruckGleich; letzte Wiederöffnung für den Vermerk an Korrekturen", () => {
    const m = geschlossen();
    expect(wiederoeffnen(m, { monat: "2026-10", grund: "zu kurz" }, WER_L, JETZT, "w1")).toMatchObject({ status: 422 });
    const r = wiederoeffnen(m, { monat: "2026-10", grund: "Nachtrag eines Dienstes" }, WER_L, JETZT, "w1");
    if ("status" in r) throw new Error(r.grund);
    expect(r.eintrag.abgeschlossen).toBe(false);
    expect(r.eintrag.abdruck).toBeUndefined();
    expect(r.ereignis).toMatchObject({ art: "wiederoeffnung", grund: "Nachtrag eines Dienstes", abdruckGleich: true, wer: WER_L });
    expect(letzteWiederoeffnung(r.mandant, "2026-10-28")).toBe("w1");
    expect(letzteWiederoeffnung(m, "2026-10-28")).toBeNull();                 // abgeschlossen: keine Korrektur möglich
    expect(wiederoeffnen(r.mandant, { monat: "2026-10", grund: "Nachtrag eines Dienstes" }, WER_L, JETZT, "w2")).toMatchObject({ status: 409 });
  });
  it("Wiederöffnen nach einer Änderung am Ist (etwa Löschlauf oder direkter Ablagezugriff): abdruckGleich false (Review WP-16, M4)", () => {
    const m = geschlossen();
    const geaendert = kopie(m);
    delete geaendert.erfassung["a1|2026-10-27"];
    const r = wiederoeffnen(geaendert, { monat: "2026-10", grund: "Nachtrag eines Dienstes" }, WER_L, JETZT, "w1");
    if ("status" in r) throw new Error(r.grund);
    expect(r.ereignis.abdruckGleich).toBe(false);
    expect(r.ereignis.abdruck).not.toBe(m.monatsabschluss["2026-10"].abdruck);
    const anders = kopie(m);
    anders.einstempeln["a1|2026-10-28"].ende = "15:00";
    const r2 = wiederoeffnen(anders, { monat: "2026-10", grund: "Nachtrag eines Dienstes" }, WER_L, JETZT, "w2");
    if ("status" in r2) throw new Error(r2.grund);
    expect(r2.ereignis.abdruckGleich).toBe(false);
  });
  it("abgewiesene Stempel: vermerkt, je Ereignis einmal, Ist unverändert", () => {
    const m = geschlossen();
    const v = { personId: "a1", datum: "2026-10-30", art: "start", zeitAm: "2026-10-30T05:00:00.000Z", offline: true, ereignis: "e1", am: JETZT.toISOString() };
    const n = abgewiesenVermerken(abgewiesenVermerken(m, "2026-10", v), "2026-10", v);
    expect(n.monatsabschluss["2026-10"].abgewiesen).toHaveLength(1);
    expect(istAbdruck(n, "2026-10")).toBe(n.monatsabschluss["2026-10"].abdruck);
  });
});

describe("abschlussWiderspruch (PUT)", () => {
  const voll = { vollSicht: true, unveraendert: null, heute: "2026-11-05" };
  it("Änderung, Neuanlage, Löschung im abgeschlossenen Monat: Widerspruch; im offenen Monat nicht; unverändert nicht", () => {
    const alt = geschlossen();
    const f = (aendern) => { const n = kopie(alt); aendern(n); return abschlussWiderspruch(alt, n, voll); };
    expect(f(() => {})).toBeNull();
    expect(f((n) => { n.erfassung["a1|2026-10-27"].ende = "15:00"; })).toMatchObject({ schluessel: "a1|2026-10-27", monat: "2026-10" });
    expect(f((n) => { n.erfassung["a2|2026-10-02"] = { start: "06:00", ende: "14:00", bestaetigt: true }; })).toMatchObject({ schluessel: "a2|2026-10-02" });
    expect(f((n) => { delete n.erfassung["a1|2026-10-27"]; })).toMatchObject({ schluessel: "a1|2026-10-27" });
    expect(f((n) => { n.einstempeln["a1|2026-10-28"].pause = 15; })).toMatchObject({ schluessel: "a1|2026-10-28" });
    expect(f((n) => { n.erfassung["a1|2026-09-10"].ende = "15:00"; })).toBeNull();
    expect(f((n) => { delete n.erfassung; })).toBeNull();                       // nicht mitgeschickt: unverändert
  });
  it("ohne Vollsicht nichts (eingeschränkte Rollen schreiben Ist ohnehin nicht roh); veraltete Kopie: dem Drei-Wege-Abgleich überlassen", () => {
    const alt = geschlossen();
    const n = kopie(alt); n.erfassung["a1|2026-10-27"].ende = "15:00";
    expect(abschlussWiderspruch(alt, n, { ...voll, vollSicht: false })).toBeNull();
    expect(abschlussWiderspruch(alt, n, { ...voll, unveraendert: new Set(["m1::2026-09"]) })).toBeNull();
    expect(abschlussWiderspruch(alt, n, { ...voll, unveraendert: new Set(["m1::2026-10"]) })).not.toBeNull();
  });
  it("Löschlauf nach Ablauf der Aufbewahrungsfrist: Löschen erlaubt, Ändern nicht", () => {
    const alt = basis();
    alt.erfassung["a1|2023-05-10"] = { start: "06:00", ende: "14:00", bestaetigt: true };
    const r = abschliessen(alt, { monat: "2023-05" }, WER_L, JETZT, "ma", "2026-11-05");
    if ("status" in r) throw new Error(r.grund);
    const weg = kopie(r.mandant); delete weg.erfassung["a1|2023-05-10"];
    expect(abschlussWiderspruch(r.mandant, weg, { ...voll, loeschlauf: true })).toBeNull();
    expect(abschlussWiderspruch(r.mandant, weg, { ...voll, loeschlauf: false })).not.toBeNull();
    const anders = kopie(r.mandant); anders.erfassung["a1|2023-05-10"].ende = "15:00";
    expect(abschlussWiderspruch(r.mandant, anders, { ...voll, loeschlauf: true })).not.toBeNull();
  });
  it("der Abschluss selbst kommt beim Speichern aus dem gespeicherten Stand", () => {
    const alt = geschlossen();
    expect(abschlussAusGespeichert(alt, { ...alt, monatsabschluss: {} }).monatsabschluss).toBe(alt.monatsabschluss);
    expect("monatsabschluss" in abschlussAusGespeichert(basis(), { ...basis(), monatsabschluss: { "2026-10": { abgeschlossen: true } } })).toBe(false);
  });
});

describe("Wiederherstellen und Sicht", () => {
  it("abschlussBeiWiederherstellung: heutiger Abschluss und heutige Ist-Daten abgeschlossener Monate; offene Monate aus der Sicherung", () => {
    const jetzt = geschlossen();
    const sicherung = kopie(basis());
    sicherung.erfassung["a1|2026-10-27"].ende = "13:00";                     // alter Stand
    sicherung.erfassung["a1|2026-10-29"] = { start: "06:00", ende: "14:00", bestaetigt: true };   // nur in der Sicherung
    sicherung.erfassung["a1|2026-09-10"].ende = "13:00";
    const r = abschlussBeiWiederherstellung(jetzt, sicherung);
    expect(r.mandant.monatsabschluss).toBe(jetzt.monatsabschluss);
    expect(r.mandant.erfassung["a1|2026-10-27"].ende).toBe("14:30");
    expect(r.mandant.erfassung["a1|2026-10-29"]).toBeUndefined();
    expect(r.mandant.erfassung["a1|2026-09-10"].ende).toBe("13:00");
    expect(istAbdruck(r.mandant, "2026-10")).toBe(jetzt.monatsabschluss["2026-10"].abdruck);
  });
  it("abschlussStatus: nur abgeschlossene Monate, nur das Kennzeichen; betriebSicht für Beschäftigte und Betriebsrat", () => {
    const m = geschlossen();
    const w = wiederoeffnen(m, { monat: "2026-10", grund: "Nachtrag eines Dienstes" }, WER_L, JETZT, "w1");
    if ("status" in w) throw new Error(w.grund);
    const z = abschliessen(w.mandant, { monat: "2026-09" }, WER_L, JETZT, "ma-2", "2026-11-05");
    if ("status" in z) throw new Error(z.grund);
    expect(abschlussStatus(z.mandant.monatsabschluss)).toEqual({ "2026-09": { abgeschlossen: true } });
    for (const rolle of ["mitarbeiter", "betriebsrat"])
      expect(betriebSicht(z.mandant, { rolle, person: "a1" }).monatsabschluss).toEqual({ "2026-09": { abgeschlossen: true } });
  });
});

/* WP-27: Das einmal ausgegebene Ist (brist:) bleibt; ein Wiederöffnen mit Korrektur nach der Frist steht nur als istKorrigiert. */
describe("Betriebsrat-Auswertung: Wiederöffnen und Korrektur nach der Frist bleiben istKorrigiert", () => {
  const SPAET = "2026-06-20";
  const ablageNeu = () => {
    const d = new Map();
    return { get: async (k) => (d.has(k) ? JSON.parse(JSON.stringify(d.get(k))) : null), setJSON: async (k, v) => { d.set(k, JSON.parse(JSON.stringify(v))); },
      list: async ({ prefix }) => ({ blobs: [...d.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }), delete: async (k) => { d.delete(k); } };
  };
  const betrieb = () => {
    const personen = [], erfassung = {}, einstempeln = {};
    for (let i = 0; i < 4; i++) {
      personen.push({ id: `a${i}`, vorname: "V", nachname: `N${i}`, rolle: "mitarbeiter", bereich: "A", status: "aktiv",
        zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "A" }] });
      if (i < 3) {
        einstempeln[`a${i}|2026-05-12`] = st("06:00", "15:00");
        erfassung[`a${i}|2026-05-12`] = { start: "06:00", ende: "15:00", bestaetigt: true };
      }
    }
    return { id: "m1", name: "Haus", einheiten: [{ id: "A", versatzTage: 0 }], dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00", pause: 30 }],
      zyklus: { tage: ["F", "F", "F", "F", "F", "-", "-"] }, anker: "2026-01-05", einstellungen: {}, personen, abweichungen: {}, erfassung, einstempeln,
      abwesenheiten: [], nachrichten: [], anfragen: [], bestaetigungen: [] };
  };
  const warte = async (a) => { for (let i = 0; i < 600; i++) { const r = auswertungHolen(a); if (r.fertig) return r; await new Promise((w) => setTimeout(w, 5)); } throw new Error("nicht fertig"); };
  const zeile = (w) => w.zeilen.find((r) => r.monat === "2026-05" && r.einheitId === "A");
  beforeEach(() => auswertungenVergessen());

  it("Mai abgeschlossen, ausgegeben; wiedergeöffnet und eine Zeit korrigiert: dieselbe Zahl, istKorrigiert", async () => {
    const ablage = ablageNeu();
    const t0 = Date.now();
    const z0 = abschliessen(betrieb(), { monat: "2026-05" }, WER_L, new Date("2026-06-02T08:00:00Z"), "ma", SPAET);
    if ("status" in z0) throw new Error(z0.grund);
    const vorher = zeile((await warte({ raum: "br16", heute: SPAET, mandant: z0.mandant, ablage, jetzt: t0 })).wert);
    expect(vorher.istStunden).toBe(25.5);
    const w = wiederoeffnen(z0.mandant, { monat: "2026-05", grund: "Nachtrag nach Beschwerde" }, WER_L, new Date("2026-06-20T08:00:00Z"), "w1");
    if ("status" in w) throw new Error(w.grund);
    const k = korrekturAnhaengen(w.mandant, { personId: "a0", datum: "2026-05-12", start: "06:00", ende: "17:00", grund: "Übergabe dauerte zwei Stunden länger" },
      WER_L, new Date("2026-06-20T08:05:00Z"), "k1", { nachWiederoeffnung: "w1" });
    if ("status" in k) throw new Error(k.grund);
    expect(k.ereignis.nachWiederoeffnung).toBe("w1");
    const z1 = abschliessen(k.mandant, { monat: "2026-05" }, WER_L, new Date("2026-06-20T08:10:00Z"), "ma2", SPAET);
    if ("status" in z1) throw new Error(z1.grund);
    auswertungenVergessen();
    const nachher = zeile((await warte({ raum: "br16", heute: SPAET, mandant: z1.mandant, ablage, jetzt: t0 + BR_NEUBERECHNUNG_MS + 1000 })).wert);
    expect(nachher.istStunden).toBe(25.5);
    expect(nachher.istKorrigiert).toBe(true);
    expect(vorher.istKorrigiert).toBeUndefined();
  });
});

/* ---------------------------------------------------------------------------
   Review WP-16, M3: Abgewiesene Stempel lassen sich nicht fluten
   --------------------------------------------------------------------------- */
describe("abgewiesene Stempel: Obergrenze je Person, Zusammenfassen, begrenzte Schreibvorgänge (M3)", () => {
  const v = (pid, tag, art, n, extra = {}) => ({ personId: pid, datum: `2026-10-${String(tag).padStart(2, "0")}`, art, zeit: "06:00",
    zeitAm: `2026-10-${String(tag).padStart(2, "0")}T05:00:00.000Z`, offline: true, ereignis: `${pid}-${art}-${tag}-${n}`,
    am: "2026-11-05T09:00:00.000Z", ...extra });
  it("eine Person flutet 25 Tage: 20 Einträge, 5 nur gezählt — der Eintrag einer anderen Person bleibt", () => {
    let m = abgewiesenVermerken(geschlossen(), "2026-10", v("a2", 30, "ende", 1));
    for (let t = 1; t <= 25; t++) m = abgewiesenVermerken(m, "2026-10", v("a1", t, "start", 1));
    const e = m.monatsabschluss["2026-10"];
    expect(e.abgewiesen.filter((x) => x.personId === "a1")).toHaveLength(MAB.ABGEWIESEN_JE_PERSON);
    expect(e.abgewiesen.filter((x) => x.personId === "a2")).toHaveLength(1);
    expect(e.abgewiesenGezaehlt).toEqual({ a1: 5 });
    expect(istAbdruck(m, "2026-10")).toBe(e.abdruck);                                 // Ist unverändert
  });
  it("je Person, Tag und Art zusammengefasst (anzahl); an der Obergrenze kein Schreibvorgang mehr (dasselbe Objekt)", () => {
    let m = geschlossen();
    for (let n = 1; n <= 3; n++) m = abgewiesenVermerken(m, "2026-10", v("a1", 3, "start", n));
    expect(m.monatsabschluss["2026-10"].abgewiesen).toEqual([expect.objectContaining({ datum: "2026-10-03", art: "start", anzahl: 3 })]);
    for (let n = 4; n <= MAB.ABGEWIESEN_ANZAHL_MAX; n++) m = abgewiesenVermerken(m, "2026-10", v("a1", 3, "start", n));
    expect(m.monatsabschluss["2026-10"].abgewiesen[0].anzahl).toBe(MAB.ABGEWIESEN_ANZAHL_MAX);
    expect(abgewiesenVermerken(m, "2026-10", v("a1", 3, "start", 999))).toBe(m);
    for (let t = 1; t <= 31; t++) m = abgewiesenVermerken(m, "2026-10", v("a1", t, "ende", 1));
    let z = m;
    for (let n = 0; n < MAB.ABGEWIESEN_GEZAEHLT_MAX + 5; n++) z = abgewiesenVermerken(z, "2026-10", v("a1", 4, "start", n));
    expect(z.monatsabschluss["2026-10"].abgewiesenGezaehlt.a1).toBe(MAB.ABGEWIESEN_GEZAEHLT_MAX);
    expect(abgewiesenVermerken(z, "2026-10", v("a1", 5, "start", 1))).toBe(z);
  });
  it("offline erst nach über 48 Stunden gesendet: gekennzeichnet (alt), unter derselben Obergrenze", () => {
    const m = abgewiesenVermerken(geschlossen(), "2026-10", v("a1", 2, "start", 1));
    expect(m.monatsabschluss["2026-10"].abgewiesen[0]).toMatchObject({ alt: true, offline: true });
    const frisch = abgewiesenVermerken(geschlossen(), "2026-10", v("a1", 31, "ende", 1, { zeitAm: "2026-11-05T08:00:00.000Z" }));
    expect(frisch.monatsabschluss["2026-10"].abgewiesen[0].alt).toBeUndefined();
  });
});

/* ---------------------------------------------------------------------------
   Review WP-16, M2: Löschfrist, Auskunft, Anonymisierung
   --------------------------------------------------------------------------- */
describe("abgewiesene Stempel und eingefrorenes Ist: Frist, Auskunft, Anonymisierung (M2)", () => {
  const mitAbgewiesen = () => {
    let m = geschlossen();
    for (const [pid, tag] of [["a1", "2026-10-30"], ["a2", "2026-10-31"]])
      m = abgewiesenVermerken(m, "2026-10", { personId: pid, datum: tag, art: "start", zeit: "06:00", zeitAm: `${tag}T05:00:00.000Z`,
        offline: true, ereignis: `e-${pid}`, am: "2026-11-05T09:00:00.000Z" });
    for (let t = 1; t <= MAB.ABGEWIESEN_JE_PERSON + 2; t++)
      m = abgewiesenVermerken(m, "2026-10", { personId: "a2", datum: `2026-10-${String(t).padStart(2, "0")}`, art: "ende", zeit: "14:00",
        zeitAm: "2026-10-01T12:00:00.000Z", offline: true, ereignis: `f-${t}`, am: "2026-11-05T09:00:00.000Z" });
    return m;
  };
  it("Vorschau und Löschlauf: nach der Frist der Gründe gezählt und entfernt (samt Zähler), vorher nicht", () => {
    const m = mitAbgewiesen();
    expect(vorschau(m, "2026-12-15").abgewiesen).toBe(0);                              // Frist (3 Monate) noch nicht abgelaufen
    const v = vorschau(m, "2027-02-15");
    expect(v.abgewiesen).toBe(m.monatsabschluss["2026-10"].abgewiesen.length + 1);    // Einträge + Zähler von a2
    expect(v.gesamt).toBeGreaterThanOrEqual(v.abgewiesen);
    const { mandant, bericht } = raeumen(m, "2027-02-15");
    expect(mandant.monatsabschluss["2026-10"].abgewiesen).toBeUndefined();
    expect(mandant.monatsabschluss["2026-10"].abgewiesenGezaehlt).toBeUndefined();
    expect(mandant.monatsabschluss["2026-10"]).toMatchObject({ abgeschlossen: true, abdruck: m.monatsabschluss["2026-10"].abdruck });
    expect(berichtstext(bericht)).toMatch(/abgewiesene Stempel am Monatsabschluss entfernt/);
  });
  it("Löschlauf: das eingefrorene Ist geht mit der Plandatenfrist wie die Erfassung", () => {
    const m = { ...geschlossen(), istEingefroren: { "a1|2026-10-28": { std: 7.5, da: { id: "F" } }, "a1|2024-05-02": { std: 8, da: { id: "F" } } } };
    expect(vorschau(m, "2026-11-05").plandaten.istEingefroren).toBe(1);
    const { mandant } = raeumen(m, "2026-11-05");
    expect(Object.keys(mandant.istEingefroren)).toEqual(["a1|2026-10-28"]);
  });
  it("Anonymisierung oder Entfernen der Person (Speichern): ihre abgewiesenen Stempel und Zähler gehen mit, die anderer bleiben", () => {
    const alt = mitAbgewiesen();
    const anonym = abschlussAusGespeichert(alt, { ...alt, personen: [{ id: "a1" }, { id: "a2", anonym: true }] });
    expect(anonym.monatsabschluss["2026-10"].abgewiesen.map((x) => x.personId)).toEqual(["a1"]);
    expect(anonym.monatsabschluss["2026-10"].abgewiesenGezaehlt).toBeUndefined();
    const entfernt = abschlussAusGespeichert(alt, { ...alt, personen: [{ id: "a2" }] });
    expect(entfernt.monatsabschluss["2026-10"].abgewiesen.every((x) => x.personId === "a2")).toBe(true);
    expect(abschlussAusGespeichert(alt, { ...alt, personen: alt.personen }).monatsabschluss).toBe(alt.monatsabschluss);
  });
  it("Löschlauf mit fälliger Anonymisierung: die abgewiesenen Stempel der Person gehen mit", () => {
    const m = mitAbgewiesen();
    m.personen = [{ id: "a1" }, { id: "a2", austritt: "2026-03-31" }];
    const { mandant } = raeumen(m, "2026-11-05");
    expect(mandant.personen.find((p) => p.id === "a2").anonym).toBe(true);
    expect(mandant.monatsabschluss["2026-10"].abgewiesen.map((x) => x.personId)).toEqual(["a1"]);
  });
  it("Auskunft (Art. 15): eigene abgewiesene Stempel samt Zähler und das eigene eingefrorene Ist — nichts von anderen", () => {
    const m = { ...mitAbgewiesen(), istEingefroren: { "a1|2026-10-28": { std: 7.5, da: { id: "F" } }, "a2|2026-10-28": { std: 8, da: { id: "F" } } } };
    const a2 = auskunftBauen(m, { id: "a2" }, { raum: "r", erstellt: "2026-11-05T09:00:00.000Z", umfang: "selbst" });
    expect(a2.abgewieseneStempel.filter((x) => x.datum).map((x) => x.datum)).toContain("2026-10-31");
    expect(a2.abgewieseneStempel).toEqual(expect.arrayContaining([{ monat: "2026-10", nurGezaehlt: 3 }]));
    expect(a2.istEingefroren).toEqual([{ datum: "2026-10-28", std: 8, da: { id: "F" } }]);
    const a1 = auskunftBauen(m, { id: "a1" }, { raum: "r", erstellt: "2026-11-05T09:00:00.000Z", umfang: "selbst" });
    expect(a1.abgewieseneStempel).toEqual([expect.objectContaining({ monat: "2026-10", datum: "2026-10-30", art: "start", anzahl: 1 })]);
    expect(JSON.stringify(a1)).not.toMatch(/2026-10-31|e-a2/);
  });
});

/* ---------------------------------------------------------------------------
   Review WP-16 (niedrig): Nutzerführung, wenn ein Dienst vom Monatsletzten noch läuft
   --------------------------------------------------------------------------- */
describe("Abschluss mit laufendem Dienst vom Monatsletzten", () => {
  it("die Meldung erklärt, dass das Ausstempeln zu diesem Monat gehört und abgewiesen würde", () => {
    const m = basis();
    m.einstempeln["a2|2026-10-31"] = { start: "22:00", startAm: "2026-10-31T21:00:00.000Z" };
    const r = abschliessen(m, { monat: "2026-10" }, WER_L, JETZT, "ma-n", "2026-11-01");
    expect(r).toMatchObject({ status: 409, code: "ABSCHLUSS_PRUEFFAELLE", offen: { offeneStempel: 1, nachtOffen: 1 } });
    expect(r.grund).toMatch(/vom Monatsletzten noch nicht ausgestempelt.*abgewiesen/);
    delete m.einstempeln["a2|2026-10-31"];
    m.einstempeln["a2|2026-10-12"] = { start: "06:00", startAm: "x" };
    const ohne = abschliessen(m, { monat: "2026-10" }, WER_L, JETZT, "ma-n", "2026-11-01");
    expect(ohne).toMatchObject({ status: 409, offen: { offeneStempel: 1 } });
    expect(ohne.offen.nachtOffen).toBeUndefined();
    expect(ohne.grund).not.toMatch(/Monatsletzten/);
  });
});
