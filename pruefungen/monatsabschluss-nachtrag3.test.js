/* ==========================================================================
   MONATSABSCHLUSS — NACHTRAG DRITTER OPUS-DELTA-REVIEW (WP-16)

   Die Sonden des Reviews als Prüfungen:
   H-1  Lohnausgabe (DATEV) eines abgeschlossenen und exportierten Monats
        ändert sich nicht still: Übertrag geändert (Q1), offener Vormonat
        geändert (Q2), Person aus dem Personalstamm entfernt (P6), Name
        geändert — Konto, Mehrarbeit, Personalangaben aus dem Freeze.
   H-2  Lohnexport bestätigen ist an die ausgegebene Datei gebunden (Prüfsumme,
        Abschluss, Revision, Zeilen); Rennen wiederöffnen → ändern → neu
        abschließen → bestätigen: 409. Prüfsumme und Revision im Dateinamen
        und im Begleitblatt, das Spaltenformat bleibt.
   M-1  fail-closed: Verzeichnis fehlt (P3), Version unbekannt (P4),
        Monatseintrag fehlt (P5), Zuschlagsregeln/Lohnarten null (P7),
        Verweis ins Leere; Schema 1 als nicht reproduzierbar gekennzeichnet.
   M-2  Beschäftigte und Schichtverantwortung: Verzeichnis ohne Lohnarten,
        Monatseinträge anderer nur Positivkatalog.
   MB   Prüfsumme deckt das Verzeichnis.
   N-a  Stempel in einen exportierten Monat: Hinweis auf den Korrekturprozess.
   N-b  Auskunft nach Art. 15 erklärt die Kurzfelder.
   N-d  Rechenstand im Freeze, Rechenkonstanten gleich in Server und Oberfläche.
   N-e  Betriebsrat: kein live gerechnetes Soll im abgeschlossenen Monat.
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import * as MA from "../server/lib/monatsabschluss.mjs";
import * as IE from "../server/lib/isteinfrieren.mjs";
import { istEinfrierenSchema1 } from "../werkzeug/wp16-messung.mjs";

const WIRT = "127.0.0.1:3000";
const JETZT = "2026-11-05T09:00:00Z";
const OKT = "2026-10";
const SEP = "2026-09";
const WER_L = { personId: "l1", name: "L", rolle: "leitung" };
let wurzel, laden, daten, B, sitzungAnlegen, A, rechte;

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-wp16-nachtrag3-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
  const { getStore } = await import("../server/lib/ablage.mjs");
  laden = () => getStore({ name: "centric", consistency: "strong" });
  const schutz = await import("../server/lib/schutz.mjs");
  for (const art of Object.keys(schutz.GRENZEN)) schutz.GRENZEN[art] = { ...schutz.GRENZEN[art], versuche: 100000 };
  daten = (await import("../server/funktionen/daten.mjs")).default;
  B = await import("../server/lib/bestand.mjs");
  rechte = await import("../server/lib/rechte.mjs");
  ({ sitzungAnlegen } = await import("../server/lib/sitzungen.mjs"));
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(JETZT));
  A = await import("../src/App.jsx");
}, 120000);
afterAll(async () => {
  vi.useRealTimers();
  if (wurzel) await rm(wurzel, { recursive: true, force: true });
});

let nrAbschluss = 0;
const zu = (m, monat = OKT) => {
  nrAbschluss += 1;
  const r = MA.abschliessen(m, { monat, trotzPrueffaellen: true }, WER_L, new Date(JETZT), `ma-${monat}-${nrAbschluss}`, "2026-11-05");
  if ("status" in r) throw new Error(r.grund);
  return r.mandant;
};
const auf = (m, monat = OKT) => {
  const r = MA.wiederoeffnen(m, { monat, grund: "Gegenprobe nach dem Wiederöffnen" }, WER_L, new Date(JETZT), `w-${monat}-${nrAbschluss}`);
  if ("status" in r) throw new Error(r.grund);
  return r.mandant;
};
/** Der Stand der ausgegebenen Datei, wie ihn die Oberfläche beim Bestätigen mitschickt. */
const standVon = (m, monat = OKT) => (typeof A.lohnexportStand === "function" ? A.lohnexportStand(m, monat) : {});
/* Seit dem vierten Review (A-1/A-2): Mit offenen Vormonaten bestätigt der Server nur mit ausdrücklicher Überstimmung
   (409 VORMONAT_OFFEN ohne sie, geprüft in monatsabschluss-nachtrag4). Die Fälle hier mit absichtlich offenem
   September (Q2, P6, Rennen) bestätigen deshalb mit Kategorie und Begründung. */
const TROTZ = { trotzVormonat: true, vormonatKategorie: "vor_inbetriebnahme", vormonatGrund: "Vormonate ohne Zeitdaten vor dem Start" };
const exportieren = (m, monat = OKT, stand = standVon(m, monat), extra = {}) =>
  MA.lohnexportBestaetigen(m, { monat, ...(stand || {}), ...extra }, WER_L, new Date(JETZT), `le-${monat}-${nrAbschluss}`);
const exportiert = (m, monat = OKT) => {
  const r = exportieren(m, monat, standVon(m, monat), TROTZ);
  if ("status" in r) throw new Error(r.grund);
  return r.mandant;
};

/** Vier Personen in e1, Dienste über Abweichungen, alle Ist-Zeiten bestätigt (wie im zweiten Nachtrag). */
function betrieb() {
  const m = A.leererMandant("Nachtrag3", "pflege");
  const e1 = m.einheiten[0].id;
  const ohneVorgabe = { mindest: { mo_do: 0, fr: 0, sa: 0, so: 0 }, mindestQual: {} };
  const F = { ...m.dienstarten[0], ...ohneVorgabe, id: "F", name: "Früh", kurz: "F", start: "06:00", ende: "14:00", pause: 30, form: "regel" };
  const N = { ...m.dienstarten[0], ...ohneVorgabe, id: "N", name: "Nacht", kurz: "N", start: "21:00", ende: "06:00", pause: 30, form: "regel" };
  m.id = "m1";
  m.bundesland = "BY";
  m.dienstarten = [F, N];
  m.einstellungen = { ...m.einstellungen, nachtVon: "23:00", nachtBis: "06:00" };
  m.zuschlaege = [{ id: "z-n", art: "nacht", name: "Nacht", prozent: 25, aktiv: true }];
  m.personen = ["a1", "a2", "a3", "a4"].map((id, i) => ({ ...A.zugangsPerson("mitarbeiter", e1, i + 1), id, vorname: "V", nachname: id.toUpperCase(),
    personalnummer: `P${i + 1}`, rolle: "mitarbeiter", eintritt: "2020-01-01", zugehoerigkeit: [{ ab: "2020-01-01", einheitId: e1 }], bereich: e1,
    imSchichtdienst: false, wochenstunden: 1, stundenuebertrag: 500 }));
  m.abweichungen = {}; m.erfassung = {};
  for (const p of m.personen) {
    for (const t of ["05", "06", "07", "08", "09"]) m.abweichungen[`${p.id}|2026-10-${t}`] = "F";
    m.abweichungen[`${p.id}|2026-10-29`] = "N";
    for (const k of Object.keys(m.abweichungen)) if (k.startsWith(`${p.id}|`))
      m.erfassung[k] = { start: null, ende: null, bestaetigt: true, grund: "" };
  }
  m.einstempeln = {}; m.abwesenheiten = []; m.anfragen = []; m.monatsabschluss = {};
  m.lohnarten = undefined;
  return m;
}
const p = (m, id) => m.personen.find((x) => x.id === id);
const JAHR = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", SEP, OKT];
const zuAlle = (m) => JAHR.reduce((x, mon) => zu(x, mon), m);
const mehrarbeit = (m, pn = "P1", monat = OKT) => A.datevSaetze(m, monat).filter((z) => z.personalnummer === pn && z.lohnart === "1200").map((z) => z.stunden);
const mitFreeze = (m, aendern) => ({ ...m, istEingefroren: aendern({ ...m.istEingefroren }) });

/* ------------------------------------------------------------------------ */
describe("H-1: Lohnausgabe eines abgeschlossenen, exportierten Monats ändert sich nicht still", { timeout: 120000 }, () => {
  it("Q1: Januar–Oktober abgeschlossen, Oktober exportiert, Übertrag 500 → 550: Lohnart 1200, Konto und Prüfsumme unverändert", () => {
    const m = exportiert(zuAlle(betrieb()));
    const vorher = { ma: mehrarbeit(m), konto: A.stundenkonto(m, p(m, "a1"), OKT), datev: A.datevSaetze(m, OKT) };
    expect(vorher.ma).toHaveLength(1);
    expect(vorher.ma[0]).toBeGreaterThan(400);
    const x = { ...m, personen: m.personen.map((q) => (q.id === "a1" ? { ...q, stundenuebertrag: 550 } : q)) };
    expect(mehrarbeit(x)).toEqual(vorher.ma);
    expect(A.stundenkonto(x, p(x, "a1"), OKT)).toBe(vorher.konto);
    expect(A.datevSaetze(x, OKT)).toEqual(vorher.datev);
    expect(MA.istAbdruck(x, OKT)).toBe(m.monatsabschluss[OKT].abdruck);
    /* Gegenprobe: der offene November rechnet mit dem neuen Übertrag. */
    expect(A.stundenkonto(x, p(x, "a1"), "2026-11")).toBe(Math.round((A.stundenkonto(m, p(m, "a1"), "2026-11") + 50) * 10) / 10);
  });
  it("Q2: nur Oktober abgeschlossen und exportiert, September offen und geändert: Lohnart 1200 unverändert, Hinweis „Vormonat offen“", () => {
    const m = exportiert(zu(betrieb()));
    const vorher = { ma: mehrarbeit(m), konto: A.stundenkonto(m, p(m, "a1"), OKT) };
    expect(vorher.ma).toHaveLength(1);
    const x = { ...m, abweichungen: { ...m.abweichungen, "a1|2026-09-10": "F", "a1|2026-09-11": "F" },
      erfassung: { ...m.erfassung, "a1|2026-09-10": { start: null, ende: null, bestaetigt: true, grund: "" },
        "a1|2026-09-11": { start: null, ende: null, bestaetigt: true, grund: "" } } };
    expect(A.istStunden(x, p(x, "a1"), SEP).gesamt).toBe(A.istStunden(m, p(m, "a1"), SEP).gesamt + 15);
    expect(mehrarbeit(x)).toEqual(vorher.ma);
    expect(A.stundenkonto(x, p(x, "a1"), OKT)).toBe(vorher.konto);
    expect(A.lohnausgabeText(x, OKT)).toMatch(/Vormonat offen/);
    /* Die Änderung geht nicht verloren: Der offene November rechnet sie ein. */
    expect(A.stundenkonto(x, p(x, "a1"), "2026-11")).toBe(Math.round((A.stundenkonto(m, p(m, "a1"), "2026-11") + 15) * 10) / 10);
  });
  it("P6: Person aus dem Personalstamm entfernt → ihre Zeilen bleiben (aus dem Abschluss), Hinweis im Blatt, Prüfsumme gleich", () => {
    const m = exportiert(zu(betrieb()));
    const vorher = A.datevSaetze(m, OKT).filter((z) => z.personalnummer === "P2");
    expect(vorher.length).toBeGreaterThan(0);
    const x = { ...m, personen: m.personen.filter((q) => q.id !== "a2") };
    expect(A.datevSaetze(x, OKT).filter((z) => z.personalnummer === "P2")).toEqual(vorher);
    expect(A.datevSaetze(x, OKT)).toEqual(A.datevSaetze(m, OKT));
    expect(A.lohnausgabeText(x, OKT)).toMatch(/nicht mehr im Personalstamm/);
    expect(A.lohnausgabeText(x, OKT)).toMatch(/A2, V \(P2\)/);
  });
  it("Name und Personalnummer geändert → Lohnausgabe des abgeschlossenen Monats wie zum Abschluss; nach dem Wiederöffnen neu", () => {
    const m = zu(betrieb());
    const vorher = A.datevSaetze(m, OKT);
    const x = { ...m, personen: m.personen.map((q) => (q.id === "a1" ? { ...q, nachname: "NEU", personalnummer: "P99" } : q)) };
    expect(A.datevSaetze(x, OKT)).toEqual(vorher);
    expect(A.datevSaetze(auf(x), OKT).some((z) => z.personalnummer === "P99" && z.nachname === "NEU")).toBe(true);
  });
  it("Konto im Freeze: Abschluss rechnet es wie die Oberfläche offen (Übertrag + Vormonate), Lohnausgabe nur aus dem Freeze", () => {
    const roh = betrieb();
    const m = zu(roh);
    for (const q of m.personen) {
      expect(m.istEingefroren[`${q.id}|${OKT}`].k, q.id).toBe(A.stundenkonto(roh, p(roh, q.id), OKT));
      expect(m.istEingefroren[`${q.id}|${OKT}`].ue, q.id).toBe(500);
      expect(m.istEingefroren[`${q.id}|${OKT}`].ig, q.id).toBe(A.istStunden(roh, p(roh, q.id), OKT).gesamt);
    }
    expect(A.datevSaetze(m, OKT)).toEqual(A.datevSaetze(roh, OKT));
    expect(IE.datevAusFreeze(m, OKT)).toEqual(A.datevSaetze(m, OKT));
    expect(m.istEingefroren[`*|${OKT}`].vo).toEqual(JAHR.slice(0, 9));
  });
  it("Anonymisierung (Löschlauf) nimmt die Personalangaben auch aus dem Freeze", async () => {
    const { raeumen } = await import("../server/lib/aufbewahrung.mjs");
    const m = zu(betrieb());
    /* Austritt nachträglich weit zurück: Die Stammdatenfrist ist abgelaufen, der Löschlauf anonymisiert a2. */
    const x = { ...m, personen: m.personen.map((q) => (q.id === "a2" ? { ...q, austritt: "2019-06-30" } : q)) };
    const { mandant } = raeumen(x, "2026-11-05");
    const a2 = mandant.personen.find((q) => q.id === "a2");
    expect(a2.anonym).toBe(true);
    expect(mandant.istEingefroren[`a2|${OKT}`].nm).toEqual([a2.personalnummer || a2.id, a2.nachname, a2.vorname]);
    expect(JSON.stringify(mandant.istEingefroren)).not.toMatch(/"P2"|"A2"/);
    expect(mandant.istEingefroren[`a1|${OKT}`].nm).toEqual(["P1", "A1", "V"]);
  });
});

/* ------------------------------------------------------------------------ */
describe("H-2: Lohnexport bestätigen ist an die ausgegebene Datei gebunden", { timeout: 120000 }, () => {
  it("Rennen (Bibliothek): Datei erzeugt → wiederöffnet → geändert → neu abgeschlossen → bestätigen mit dem alten Stand: 409, nichts bestätigt", () => {
    const m = zu(betrieb());
    const stand = standVon(m);
    const geaendert = { ...auf(m), abweichungen: { ...m.abweichungen, "a1|2026-10-12": "F" },
      erfassung: { ...m.erfassung, "a1|2026-10-12": { start: null, ende: null, bestaetigt: true, grund: "" } } };
    const neu = zu(geaendert);
    const r = exportieren(neu, OKT, stand);
    expect(r.status).toBe(409);
    expect(r.code).toBe("EXPORTSTAND_ABWEICHEND");
    /* Auch ohne Änderung: neu abgeschlossen ist ein anderer Stand. */
    const gleich = zu(auf(m));
    expect(MA.istAbdruck(gleich, OKT)).toBe(m.monatsabschluss[OKT].abdruck);
    expect(exportieren(gleich, OKT, stand).status).toBe(409);
    /* Mit dem neuen Stand: bestätigt, Zeilen-Prüfsumme gespeichert. */
    const ok = exportieren(neu, OKT, standVon(neu), TROTZ);
    expect("status" in ok, ok.grund).toBe(false);
    expect(ok.eintrag.lohnexport).toMatchObject({ abdruck: neu.monatsabschluss[OKT].abdruck, stand: neu.monatsabschluss[OKT].stand,
      zeilen: standVon(neu).zeilen, revision: 1 });
  });
  it("ohne Stand der Datei 409 EXPORTSTAND_FEHLT; falsche Zeilen-Prüfsumme 409; falsche Revision 409", () => {
    const m = zu(betrieb());
    const ohne = MA.lohnexportBestaetigen(m, { monat: OKT }, WER_L, new Date(JETZT), "le-x");
    expect(ohne.status).toBe(409);
    expect(ohne.code).toBe("EXPORTSTAND_FEHLT");
    const s = standVon(m);
    expect(exportieren(m, OKT, { ...s, zeilen: "0".repeat(32) }).code).toBe("EXPORTSTAND_ABWEICHEND");
    expect(exportieren(m, OKT, { ...s, revision: 2 }).code).toBe("EXPORTSTAND_ABWEICHEND");
    expect(exportieren(m, OKT, s).code).toBe("VORMONAT_OFFEN");
    expect("status" in exportieren(m, OKT, s, TROTZ)).toBe(false);
  });
  it("Prüfsumme und Revision im Dateinamen und im Begleitblatt; das Spaltenformat der Datei bleibt", () => {
    const m = zu(betrieb());
    const e = m.monatsabschluss[OKT];
    expect(A.lohnausgabeDateiname(m, OKT, "csv")).toBe(`lohnausgabe_Nachtrag3_${OKT}_r1_${e.abdruck.slice(0, 12)}.csv`);
    expect(A.lohnausgabeDateiname({ ...m, monatsabschluss: {} }, OKT, "csv")).toBe(`lohnausgabe_Nachtrag3_${OKT}.csv`);
    expect(A.lohnausgabeText(m, OKT)).toContain(`Revision 1 · Prüfsumme ${e.abdruck} · Zeilen-Prüfsumme ${standVon(m).zeilen}`);
    expect(A.datevCSV(m, OKT).split("\r\n")[0]).toBe("﻿Personalnummer;Nachname;Vorname;Lohnart;Bezeichnung;Stunden;Monat;Jahr");
  });
  it("Oberfläche: Ausgabe merkt den Stand, Bestätigen schickt ihn mit (nicht mehr {}), speicher.js überträgt ihn", async () => {
    const app = await readFile(path.join(process.cwd(), "src/App.jsx"), "utf8");
    expect(app).not.toMatch(/SP\.monatsabschluss\("lohnexport", monat, \{\}\)/);
    /* Seit dem vierten Review (A-2) zusätzlich die Überstimmung offener/geänderter Vormonate — der Stand bleibt Pflicht. */
    expect(app).toMatch(/SP\.monatsabschluss\("lohnexport", monat, \{ exportStand, trotzVormonat \}\)/);
    expect(app).toMatch(/EXPORT_STAND\.set\(`\$\{sitz\.mandant\.id\}\|\$\{ym\}`, stand\)/);
    const sp = await readFile(path.join(process.cwd(), "src/speicher.js"), "utf8");
    expect(sp).toMatch(/abdruck: exportStand\.abdruck, stand: exportStand\.stand, revision: exportStand\.revision, zeilen: exportStand\.zeilen/);
  });
});

/* ------------------------------------------------------------------------ */
describe("M-1: fail-closed — kein still 0 h, keine stille Live-Rechnung", { timeout: 120000 }, () => {
  const nichtVerfuegbar = (x) => {
    const ist = A.istStunden(x, p(x, "a1"), OKT);
    expect(ist.abschlussLuecke).toBe(true);
    expect(ist.gesamt).toBeNull();
    expect(A.stundenkonto(x, p(x, "a1"), OKT)).toBeNull();
    expect(A.datevSaetze(x, OKT).filter((z) => z.personalnummer === "P1")).toEqual([]);
  };
  it("P3: Verzeichnis „*|JJJJ-MM“ fehlt → nicht verfügbar (nicht 0 h), keine Zeilen, Hinweis", () => {
    const m = zu(betrieb());
    expect(A.istStunden(m, p(m, "a1"), OKT).gesamt).toBeGreaterThan(0);
    const x = mitFreeze(m, (w) => { delete w[`*|${OKT}`]; return w; });
    expect(IE.freezeStatus(x, OKT)).toMatchObject({ unbekannt: true, grund: "verzeichnis" });
    nichtVerfuegbar(x);
    expect(A.lohnausgabeText(x, OKT)).toMatch(/unbekannten oder unvollständigen Format|fehlt das eingefrorene Ist/);
  });
  it("P4: Version unbekannt oder zu neu (v: 99, schema: 99) → nicht verfügbar", () => {
    const m = zu(betrieb());
    nichtVerfuegbar(mitFreeze(m, (w) => ({ ...w, [`*|${OKT}`]: { ...w[`*|${OKT}`], v: 99 } })));
    nichtVerfuegbar({ ...m, monatsabschluss: { [OKT]: { ...m.monatsabschluss[OKT], schema: 99 } } });
    /* Ohne Schema am Abschluss (so sehen ihn Beschäftigte): allein das Verzeichnis entscheidet. */
    nichtVerfuegbar(mitFreeze({ ...m, monatsabschluss: { [OKT]: { abgeschlossen: true } } }, (w) => ({ ...w, [`*|${OKT}`]: { ...w[`*|${OKT}`], v: 99 } })));
    expect(IE.freezeStatus(mitFreeze(m, (w) => ({ ...w, [`*|${OKT}`]: { ...w[`*|${OKT}`], v: 99 } })), OKT)).toMatchObject({ unbekannt: true });
  });
  it("P5: Monatseintrag einer Person fehlt → Soll nicht verfügbar (nicht nach heutigen Wochenstunden neu gerechnet), Ist Prüffall", () => {
    const m = zu(betrieb());
    const x0 = mitFreeze(m, (w) => { delete w[`a1|${OKT}`]; return w; });
    const x = { ...x0, personen: x0.personen.map((q) => (q.id === "a1" ? { ...q, wochenstunden: 40 } : q)) };
    expect(A.sollStunden(x, p(x, "a1"), OKT)).toBeNull();
    nichtVerfuegbar(x);
  });
  it("P7: ohne Zuschlagsregeln abgeschlossen → [] eingefroren, später angelegte Regeln wirken nicht rückwirkend; null gelesen → nicht verfügbar", () => {
    const roh = { ...betrieb(), zuschlaege: undefined };
    const m = zu(roh);
    expect(m.istEingefroren[`*|${OKT}`].zs).toEqual([]);
    const x = { ...m, zuschlaege: [{ id: "z-n", art: "nacht", name: "Nacht", prozent: 25, aktiv: true }] };
    expect(A.zuschlagWert(x, p(x, "a1"), OKT).summe).toBe(0);
    expect(A.zuschlagWert(auf(x), p(x, "a1"), OKT).summe).toBeGreaterThan(0);
    const n = mitFreeze(m, (w) => ({ ...w, [`*|${OKT}`]: { ...w[`*|${OKT}`], zs: null } }));
    expect(A.zuschlagWert({ ...n, zuschlaege: x.zuschlaege }, p(n, "a1"), OKT)).toMatchObject({ summe: null, nichtVerfuegbar: true });
  });
  it("P7: ohne eigene Lohnarten abgeschlossen → die Standardlohnarten eingefroren (nie null); la: null gelesen → keine Zeilen, Hinweis", async () => {
    const { LOHNARTEN_STD } = await import("../server/lib/lohnrechnung.mjs");
    const m = zu(betrieb());
    expect(m.istEingefroren[`*|${OKT}`].la).toEqual(LOHNARTEN_STD);
    const x = mitFreeze(m, (w) => ({ ...w, [`*|${OKT}`]: { ...w[`*|${OKT}`], la: null } }));
    expect(A.datevSaetze({ ...x, lohnarten: { nacht: { nr: "7777", text: "neu" } } }, OKT)).toEqual([]);
    expect(A.lohnausgabeText(x, OKT)).toMatch(/fehlen die Lohnarten/);
  });
  it("Verweis eines Tages ins Leere → Prüffall statt 0 h", () => {
    const m = zu(betrieb());
    const k = Object.keys(m.istEingefroren).find((x) => /^a1\|2026-10-\d\d$/.test(x) && m.istEingefroren[x].d !== undefined);
    nichtVerfuegbar(mitFreeze(m, (w) => ({ ...w, [k]: { ...w[k], d: 99 } })));
  });
  it("Schema 1: ausdrücklich „nicht reproduzierbar“ gekennzeichnet; Lohnexport nicht bestätigbar (FREEZE_NICHT_REPRODUZIERBAR)", () => {
    const roh = betrieb();
    const s1 = { ...roh, monatsabschluss: { [OKT]: { abgeschlossen: true } }, istEingefroren: istEinfrierenSchema1(roh, OKT) };
    expect(IE.freezeStatus(s1, OKT)).toMatchObject({ schema: 1 });
    expect(A.lohnausgabeText(s1, OKT)).toMatch(/nicht reproduzierbar/);
    const m = zu(betrieb());
    const alt = { ...s1, monatsabschluss: { [OKT]: { ...m.monatsabschluss[OKT], schema: 1, abdruck: MA.istAbdruck(s1, OKT) } } };
    const r = MA.lohnexportBestaetigen(alt, { monat: OKT, ...standVon(alt) }, WER_L, new Date(JETZT), "le-s1");
    expect(r.status).toBe(409);
    expect(r.code).toBe("FREEZE_NICHT_REPRODUZIERBAR");
  });
});

/* ------------------------------------------------------------------------ */
describe("MB: Prüfsumme deckt das Verzeichnis", () => {
  it("Lohnarten, Zuschlagsregeln oder Dienstart im Verzeichnis geändert → Prüfsumme anders", () => {
    const m = zu(betrieb());
    const a = m.monatsabschluss[OKT].abdruck;
    const b = m.istEingefroren[`*|${OKT}`];
    expect(MA.istAbdruck(m, OKT)).toBe(a);
    expect(MA.istAbdruck(mitFreeze(m, (w) => ({ ...w, [`*|${OKT}`]: { ...b, la: { ...b.la, nacht: { nr: "1401", text: "x" } } } })), OKT)).not.toBe(a);
    expect(MA.istAbdruck(mitFreeze(m, (w) => ({ ...w, [`*|${OKT}`]: { ...b, zs: [] } })), OKT)).not.toBe(a);
    expect(MA.istAbdruck(mitFreeze(m, (w) => ({ ...w, [`*|${OKT}`]: { ...b, da: { ...b.da, 0: { ...b.da[0], ende: "15:00" } } } })), OKT)).not.toBe(a);
  });
});

/* ------------------------------------------------------------------------ */
describe("M-2: Sicht — Verzeichnis ohne Lohnarten, Monatseinträge anderer nur Positivkatalog", { timeout: 120000 }, () => {
  const bestand = () => {
    const m = zu(betrieb());
    m.personen = [...m.personen, { ...m.personen[0], id: "s1", nachname: "S1", personalnummer: "P9", rolle: "subplaner" }];
    return { version: 9, stand: 1, session: null, mandanten: [m] };
  };
  it("Beschäftigte: Verzeichnis genau v, da, zs, rv (keine Lohnarten); eigener Monatseintrag ganz", () => {
    const m = rechte.bestandFuerRolle(bestand(), { rolle: "mitarbeiter", person: "a1", betrieb: 0 }).mandanten[0];
    const v = m.istEingefroren[`*|${OKT}`];
    expect(Object.keys(v).sort()).toEqual(["da", "rv", "v", "zs"]);
    expect(m.istEingefroren[`a1|${OKT}`]).toMatchObject({ nm: ["P1", "A1", "V"] });
    expect(Object.keys(m.istEingefroren).every((k) => k.startsWith("a1|") || k.startsWith("*|"))).toBe(true);
  });
  it("Schichtverantwortung: Verzeichnis ohne Lohnarten; Monatseintrag anderer ohne Konto, Übertrag, Summen, Personalangaben", () => {
    const m = rechte.bestandFuerRolle(bestand(), { rolle: "subplaner", person: "s1", betrieb: 0 }).mandanten[0];
    const w = m.istEingefroren || {};
    if (w[`*|${OKT}`]) expect(Object.keys(w[`*|${OKT}`]).sort()).toEqual(["da", "rv", "v", "zs"]);
    const fremd = Object.entries(w).filter(([k]) => /^a\d\|2026-10$/.test(k));
    expect(fremd.length).toBeGreaterThan(0);
    for (const [k, v] of fremd) expect(Object.keys(v).every((f) => ["s", "z", "nn", "i", "u"].includes(f)), k).toBe(true);
    expect(JSON.stringify(w)).not.toMatch(/"la"|"nm"|"k"|"ue"/);
  });
  it("Betriebsrat: nichts", () => {
    const m = rechte.bestandFuerRolle(bestand(), { rolle: "betriebsrat", person: "a1", betrieb: 0 }).mandanten[0];
    expect(m.istEingefroren === undefined || Object.keys(m.istEingefroren).length === 0).toBe(true);
  });
});

/* ------------------------------------------------------------------------ */
describe("N-d/N-e/N-b: Rechenstand, Soll für eingeschränkte Sicht, Legende der Auskunft", { timeout: 120000 }, () => {
  it("N-d: Rechenkonstanten des Servers gleich der Oberfläche (Entgeltstatus, Rang, Faktor); Rechenstand im Freeze, Hinweis bei Abweichung", async () => {
    const L = await import("../server/lib/lohnrechnung.mjs");
    for (const a of A.ABW) expect(L.ABW_RECHNUNG[a.id], a.id).toEqual({ bezahlt: a.bezahlt, rang: a.rang });
    expect(Object.keys(L.ABW_RECHNUNG).sort()).toEqual(A.ABW.map((a) => a.id).sort());
    const m = zu(betrieb());
    expect(m.istEingefroren[`*|${OKT}`].rv).toBe(L.RECHEN_STAND);
    const x = mitFreeze(m, (w) => ({ ...w, [`*|${OKT}`]: { ...w[`*|${OKT}`], rv: 0 } }));
    expect(A.lohnausgabeText(x, OKT)).toMatch(/Rechenstand 0/);
    expect(A.lohnausgabeText(m, OKT)).not.toMatch(/Rechenstand/);
  });
  it("N-d: abgeschlossene Summen hängen nicht an Code-Konstanten — eine Bereitschafts-Dienstart zählt nach dem Abschluss wie eingefroren", () => {
    const m = zu(betrieb());
    const ist = A.istStunden(m, p(m, "a1"), OKT);
    const x = mitFreeze(m, (w) => ({ ...w, [`a1|${OKT}`]: { ...w[`a1|${OKT}`], g: 1, gg: 0, ig: 1 } }));
    expect(A.istStunden(x, p(x, "a1"), OKT).gesamt).toBe(1);                       // die Oberfläche liest die eingefrorene Summe
    expect(ist.gesamt).toBe(m.istEingefroren[`a1|${OKT}`].ig);
  });
  it("N-e: Betriebsrat-Sicht (kein Ist-Zugang) bekommt im abgeschlossenen Monat kein live gerechnetes Soll; offen weiter", () => {
    const m = zu(betrieb());
    const br = { ...m, istEingefroren: {}, sichtIstDaten: { umfang: "keine" } };
    expect(A.sollStunden(br, p(br, "a1"), OKT)).toBeNull();
    expect(A.sollStunden(br, p(br, "a1"), "2026-11")).toBeGreaterThan(0);
  });
  it("N-b: Auskunft nach Art. 15 erklärt die Kurzfelder des eingefrorenen Ist", async () => {
    const { auskunftBauen, IST_EINGEFROREN_LEGENDE } = await import("../server/lib/auskunft.mjs");
    const m = zu(betrieb());
    const a = auskunftBauen(m, p(m, "a1"), { raum: "r", erstellt: JETZT, umfang: "selbst" });
    expect(a.istEingefrorenLegende).toEqual(IST_EINGEFROREN_LEGENDE);
    for (const f of ["d", "std", "e", "p", "a", "pl", "w", "u"]) expect(IST_EINGEFROREN_LEGENDE.tag[f], f).toBeTruthy();
    for (const f of ["s", "z", "nn", "i", "u", "k", "ue", "nm", "br", "ig"]) expect(IST_EINGEFROREN_LEGENDE.monat[f], f).toBeTruthy();
    /* Jedes Kurzfeld, das in der Auskunft vorkommt, ist erklärt. */
    expect(IST_EINGEFROREN_LEGENDE.datum).toBeTruthy();
    expect(a.istEingefroren.length).toBeGreaterThan(5);
    for (const v of a.istEingefroren) {
      const erklaert = /^\d{4}-\d{2}-\d{2}$/.test(v.datum) ? IST_EINGEFROREN_LEGENDE.tag : IST_EINGEFROREN_LEGENDE.monat;
      for (const f of Object.keys(v).filter((x) => x !== "datum")) expect(erklaert[f], `${v.datum}.${f}`).toBeTruthy();
    }
  });
});

/* ------------------------------------------------------------------------
   Gegen die Serverfunktion: Rennen und N-a
   ------------------------------------------------------------------------ */
let nr = 0;
const anfrage = async (pfad, { methode = "POST", rumpf, token } = {}) => {
  nr += 1;
  const kopf = { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.19.${Math.floor(nr / 250) % 250}.${nr % 250}` };
  if (methode !== "GET") kopf["content-type"] = "application/json";
  if (token) kopf.authorization = `Bearer ${token}`;
  const a = await daten(new Request(`http://${WIRT}/api/${pfad}`, { method: methode, headers: kopf,
    ...(methode === "GET" ? {} : { body: JSON.stringify(rumpf || {}) }) }), {});
  const text = await a.text();
  let d = {}; try { d = JSON.parse(text); } catch { /* leer */ }
  return { status: a.status, roh: text, ...d };
};
const ROLLEN = { l1: "leitung", a1: "mitarbeiter" };
const token = async (id, raum) => (await sitzungAnlegen({ bestand: raum, name: `V ${id.toUpperCase()}`, rolle: ROLLEN[id], person: id,
  betrieb: 0, mandantId: "m1", einheit: null }, 24 * 3600 * 1000)).token;
function serverBetrieb() {
  const F = { id: "F", name: "Früh", start: "06:00", ende: "14:00", pause: 30 };
  const person = (id) => ({ id, vorname: "V", nachname: id.toUpperCase(), rolle: ROLLEN[id], bereich: "e1", status: "aktiv", geburtstag: "1985-01-01",
    wochenstunden: 39, personalnummer: `P-${id}`, zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }] });
  const abweichungen = { "a1|2026-10-28": "F", "a1|2026-10-29": "F" };
  const erfassung = { "a1|2026-10-28": { start: "06:00", ende: "14:00", bestaetigt: true, grund: "" } };
  return { id: "m1", name: "Haus", einheiten: [{ id: "e1", name: "WB 1" }], einstellungen: { ruhezeit: 11 }, dienstarten: [F],
    personen: Object.keys(ROLLEN).map(person), abweichungen, abwesenheiten: [], erfassung, einstempeln: {}, anfragen: [], nachrichten: [], monatsabschluss: {} };
}
const raumAnlegen = async (raum) => B.bestandSchreiben(laden(), raum, { version: 9, mandanten: [serverBetrieb()] }, { durch: "Pruefung" });
const ansicht = async (raum) => (await anfrage("bestand", { methode: "GET", token: await token("l1", raum) })).bestand.mandanten[0];
const ID = (n) => `${String(n).padStart(8, "0")}-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe("H-2 (Server): Rennen über die Schnittstelle", { timeout: 120000 }, () => {
  it("Datei erzeugt → wiederöffnet → geändert → neu abgeschlossen → bestätigen mit altem Stand 409; mit neuem Stand 200", async () => {
    const raum = "wp16n3-rennen";
    await raumAnlegen(raum);
    const tL = await token("l1", raum);
    expect((await anfrage("monatsabschluss", { token: tL, rumpf: { aktion: "abschliessen", monat: OKT, trotzPrueffaellen: true } })).status).toBe(200);
    const alt = standVon(await ansicht(raum));
    expect(alt && alt.abdruck).toBeTruthy();
    expect((await anfrage("monatsabschluss", { token: tL, rumpf: { aktion: "wiederoeffnen", monat: OKT, grund: "Nachtrag eines vergessenen Dienstes" } })).status).toBe(200);
    const g = await anfrage("bestand", { methode: "GET", token: tL });
    const b = g.bestand;
    b.mandanten[0].abweichungen = { ...b.mandanten[0].abweichungen, "a1|2026-10-27": "F" };
    const put = await anfrage("bestand", { methode: "PUT", token: tL, rumpf: { bestand: b, etag: g.etag } });
    expect(put.status, put.roh).toBe(200);
    expect((await anfrage("monatsabschluss", { token: tL, rumpf: { aktion: "abschliessen", monat: OKT, trotzPrueffaellen: true } })).status).toBe(200);
    const r = await anfrage("monatsabschluss", { token: tL, rumpf: { aktion: "lohnexport", monat: OKT, ...alt } });
    expect(r.status, r.roh).toBe(409);
    expect(r.code).toBe("EXPORTSTAND_ABWEICHEND");
    const ohne = await anfrage("monatsabschluss", { token: tL, rumpf: { aktion: "lohnexport", monat: OKT } });
    expect(ohne.status).toBe(409);
    expect(ohne.code).toBe("EXPORTSTAND_FEHLT");
    const neu = standVon(await ansicht(raum));
    /* Vormonate offen (vierter Review A-1): ohne Überstimmung 409, mit ihr 200. */
    expect((await anfrage("monatsabschluss", { token: tL, rumpf: { aktion: "lohnexport", monat: OKT, ...neu } })).code).toBe("VORMONAT_OFFEN");
    const ok = await anfrage("monatsabschluss", { token: tL, rumpf: { aktion: "lohnexport", monat: OKT, ...neu, ...TROTZ } });
    expect(ok.status, ok.roh).toBe(200);
    expect(ok.eintrag.lohnexport.zeilen).toBe(neu.zeilen);
  });
  it("N-a: Stempel in einen exportierten Monat → 409 mit Hinweis auf den Korrekturprozess, nicht „nach dem Wiederöffnen erneut senden“", async () => {
    const raum = "wp16n3-rennen";
    const ev = { art: "start", clientEventId: ID(31), offline: true, erfasstAm: "2026-10-30T04:58:00.000Z", gesendetAm: JETZT };
    const r = await anfrage("stempeln", { token: await token("a1", raum), rumpf: ev });
    expect(r.status, r.roh).toBe(409);
    expect(r.code).toBe("MONAT_ABGESCHLOSSEN");
    expect(r.text).toMatch(/Korrekturprozess/);
    expect(r.text).not.toMatch(/nach dem Wiederöffnen/);
    expect(r.lohnexportiert).toBe(true);
  });
});
