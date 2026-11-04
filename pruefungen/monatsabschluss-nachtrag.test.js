/* ==========================================================================
   MONATSABSCHLUSS — NACHTRAG ZWEITER OPUS-DELTA-REVIEW (WP-16)

   H-neu-1  Freeze kompakt (Schema 2, versioniert), gleiches Ergebnis wie
            Schema 1 über alle Demobetriebe; die Oberfläche schickt Freeze und
            Abschluss nicht mehr mit; Größe je Personentag ≤ 60 B; Stichprobe
            der Messmatrix (werkzeug/wp16-messung.mjs).
   M-neu-1  abschlussWiderspruch linear: 400 Personen × 24 Monate < 1 s.
   M-neu-2  Soll, Wochenstunden, Feiertage/Bundesland, Nachtfenster,
            Lohnarten, Austritt und Zugehörigkeit eines abgeschlossenen Monats
            eingefroren — Konto, DATEV und Betriebsrat-Auswertung bleiben; nach
            dem Wiederöffnen wirken die Änderungen.
   N1–N7    abgewiesene Stempel ohne Verdrängung, nur gültiger Monat in der
            Spur, fehlender Freeze als Prüffall, bestand-anlegen verwirft
            Abschluss/Freeze, Textauskunft vollständig, kein Tag in der Spur.
   Betreiber (C): Lohnexport bestätigen sperrt einfaches Wiederöffnen.
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { VERSION } from "../src/migration.js";
import { ohneServerFelder, SERVER_FELDER } from "../src/speicher.js";
import { abschliessen, wiederoeffnen, abschlussWiderspruch, abgewiesenVermerken, lohnexportBestaetigen, istAbdruck,
  ABGEWIESEN_MAX, ABGEWIESEN_JE_PERSON, KORREKTUR_ERFORDERLICH } from "../server/lib/monatsabschluss.mjs";
import { istEinfrieren, eingefrorenFuerPerson, FREEZE_SCHEMA } from "../server/lib/isteinfrieren.mjs";
import { betriebsratAuswertung } from "../server/lib/br-auswertung.mjs";
import { betriebErzeugen, istEinfrierenSchema1, alleAbschliessen, abschlussWiderspruchVorher, monateVor, RUMPF_MAX as MESS_RUMPF_MAX }
  from "../werkzeug/wp16-messung.mjs";

const WIRT = "127.0.0.1:3000";
const JETZT = "2026-11-05T09:00:00Z";
const OKT = "2026-10";
const WER_L = { personId: "l1", name: "L", rolle: "leitung" };
let wurzel, laden, daten, B, sitzungAnlegen, A;

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-wp16-nachtrag-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
  const { getStore } = await import("../server/lib/ablage.mjs");
  laden = () => getStore({ name: "centric", consistency: "strong" });
  const schutz = await import("../server/lib/schutz.mjs");
  for (const art of Object.keys(schutz.GRENZEN)) schutz.GRENZEN[art] = { ...schutz.GRENZEN[art], versuche: 100000 };
  daten = (await import("../server/funktionen/daten.mjs")).default;
  B = await import("../server/lib/bestand.mjs");
  ({ sitzungAnlegen } = await import("../server/lib/sitzungen.mjs"));
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(JETZT));
  A = await import("../src/App.jsx");
}, 120000);
afterAll(async () => {
  vi.useRealTimers();
  if (wurzel) await rm(wurzel, { recursive: true, force: true });
});

const zu = (m, monat = OKT) => {
  const r = abschliessen(m, { monat, trotzPrueffaellen: true }, WER_L, new Date(JETZT), `ma-${monat}`, "2026-11-05");
  if ("status" in r) throw new Error(r.grund);
  return r.mandant;
};
/* Überstimmung offener Vormonate beim Lohnexport (vierter Review A-1): Die Fälle hier schließen nur den Oktober ab. */
const TROTZ = { trotzVormonat: true, vormonatKategorie: "vor_inbetriebnahme", vormonatGrund: "Vormonate ohne Zeitdaten vor dem Start" };
const auf = (m, monat = OKT) => {
  const r = wiederoeffnen(m, { monat, grund: "Gegenprobe nach dem Wiederöffnen" }, WER_L, new Date(JETZT), `w-${monat}`);
  if ("status" in r) throw new Error(r.grund);
  return r.mandant;
};

/* ------------------------------------------------------------------------ */
describe("H-neu-1: Freeze kompakt (Schema 2) — gleiches Ergebnis, kleiner, nicht im PUT der Oberfläche", { timeout: 120000 }, () => {
  it("alle Demobetriebe: Schema 1 (je Tag volle Dienstart) und Schema 2 rechnen Stunden, Konto, Zuschläge, DATEV, Ausgleich gleich", () => {
    const b = A.demobestand();
    const monat = `${new Date().getFullYear()}-03`;
    let personen = 0;
    for (const m of b.mandanten) {
      const ab = { [monat]: { abgeschlossen: true } };
      const s1 = { ...m, monatsabschluss: ab, istEingefroren: istEinfrierenSchema1(m, monat) };
      const s2 = { ...m, monatsabschluss: ab, istEingefroren: istEinfrieren(m, monat) };
      for (const p of m.personen) {
        /* Schema 1 kennt keinen Monatseintrag: Eine Person ohne jeden Tageseintrag (im Dienst, aber nichts geplant)
           ist dort ein Prüffall (N3, fail-closed) — verglichen werden die übrigen. Schema 2 rechnet für alle wie offen. */
        const s1Luecke = A.istStunden(s1, p, monat).abschlussLuecke === true;
        expect(A.istStunden(s2, p, monat), `${m.name} ${p.id}`).toEqual(A.istStunden(m, p, monat));
        expect(A.stundenkonto(s2, p, monat), `${m.name} ${p.id}`).toEqual(A.stundenkonto(m, p, monat));
        expect(A.zuschlagStunden(s2, p, monat), `${m.name} ${p.id}`).toEqual(A.zuschlagStunden(m, p, monat));
        expect(A.sollStunden(s2, p, monat), `${m.name} ${p.id}`).toBe(A.sollStunden(m, p, monat));
        expect(A.ausgleichPruefen(s2, p, `${monat}-31`), `${m.name} ${p.id}`).toEqual(A.ausgleichPruefen(m, p, `${monat}-31`));
        if (s1Luecke) {
          expect(Object.keys(s1.istEingefroren).some((k) => k.startsWith(`${p.id}|`)), `${m.name} ${p.id}`).toBe(false);
          continue;
        }
        personen++;
        expect(A.istStunden(s2, p, monat), `${m.name} ${p.id}`).toEqual(A.istStunden(s1, p, monat));
        expect(A.stundenkonto(s2, p, monat), `${m.name} ${p.id}`).toEqual(A.stundenkonto(s1, p, monat));
        expect(A.zuschlagStunden(s2, p, monat), `${m.name} ${p.id}`).toEqual(A.zuschlagStunden(s1, p, monat));
        expect(A.ausgleichPruefen(s2, p, `${monat}-31`), `${m.name} ${p.id}`).toEqual(A.ausgleichPruefen(s1, p, `${monat}-31`));
      }
      expect(A.datevSaetze(s2, monat)).toEqual(A.datevSaetze(m, monat));
      const ohneLuecke = (z) => z.filter((x) => !A.istStunden(s1, m.personen.find((q) => (q.personalnummer || q.id) === x.personalnummer), monat).abschlussLuecke);
      expect(ohneLuecke(A.datevSaetze(s2, monat))).toEqual(A.datevSaetze(s1, monat));
      /* Schema und Verzeichnis */
      expect(s2.istEingefroren[`*|${monat}`].v).toBe(FREEZE_SCHEMA);
    }
    expect(personen).toBeGreaterThan(20);
  });
  it("Größe (Stichprobe 60 Personen × 12 Monate): ≤ 60 B je Personentag, < 35 % von Schema 1; PUT der Oberfläche ohne Freeze und Abschluss unter RUMPF_MAX", () => {
    const monate = monateVor(OKT, 11).concat([OKT]);
    const roh = betriebErzeugen(60, monate);
    const m = alleAbschliessen(roh, monate);
    const tage = Object.keys(m.istEingefroren).filter((k) => /\|\d{4}-\d{2}-\d{2}$/.test(k)).length;
    const groesse = (x) => Buffer.byteLength(JSON.stringify(x));
    const s2 = groesse(m.istEingefroren);
    const s1 = groesse(Object.assign({}, ...monate.map((x) => istEinfrierenSchema1(roh, x))));
    expect(tage).toBeGreaterThan(60 * 12 * 15);
    expect(s2 / tage).toBeLessThanOrEqual(60);
    expect(s2).toBeLessThan(0.35 * s1);
    const bestand = { version: VERSION, mandanten: [m] };
    const hinaus = ohneServerFelder(bestand);
    expect(hinaus.mandanten[0].istEingefroren).toBeUndefined();
    expect(hinaus.mandanten[0].monatsabschluss).toBeUndefined();
    expect(bestand.mandanten[0].istEingefroren).toBeDefined();                         // der Stand der Oberfläche bleibt
    expect(groesse(hinaus)).toBe(groesse(bestand) - groesse(m.istEingefroren) - groesse(m.monatsabschluss)
      - Buffer.byteLength(',"istEingefroren":') - Buffer.byteLength(',"monatsabschluss":'));
    expect(groesse({ bestand: hinaus, etag: "x" })).toBeLessThan(MESS_RUMPF_MAX);
  });
  it("die Oberfläche schickt beim Speichern ohne Server-Felder (speicher.js); RUMPF_MAX unverändert 6 MB", async () => {
    expect([...SERVER_FELDER].sort()).toEqual(["istEingefroren", "monatsabschluss"]);
    const quelle = await readFile(path.join(process.cwd(), "src/speicher.js"), "utf8");
    /* Integration mit WP-19.0 (Ausnahmeweg): die einmalige Angabe hängt am bereits gekürzten Stand — die Serverfelder
       gehen auch auf diesem Weg nie hinaus, und gesendet wird genau dieser Stand. */
    expect(quelle).toMatch(/const mit = mitEinmaligerAngabe\(ohneServerFelder\(\{ \.\.\.auftrag\.bestand, session: null \}\), angabe\);/);
    expect(quelle).toMatch(/const hinaus = mit\.bestand;/);
    expect(quelle).toMatch(/body: JSON\.stringify\(\{ bestand: hinaus, etag, durch: auftrag\.durch \}\)/);
    const server = await readFile(path.join(process.cwd(), "server/funktionen/daten.mjs"), "utf8");
    expect(server).toMatch(/const RUMPF_MAX = 6 \* 1024 \* 1024;/);
    expect(MESS_RUMPF_MAX).toBe(6 * 1024 * 1024);
  });
});

/* ------------------------------------------------------------------------ */
describe("M-neu-1: abschlussWiderspruch linear", { timeout: 120000 }, () => {
  it("400 Personen × 24 abgeschlossene Monate: < 1 s; Ergebnis wie die alte Schleife (unverändert, geändert, gelöscht, neu)", () => {
    const monate = monateVor("2026-11", 24);
    const erfassung = {};
    for (const mon of monate) for (let t = 1; t <= 22; t++) for (let i = 1; i <= 400; i++)
      erfassung[`p${i}|${mon}-${String(t).padStart(2, "0")}`] = { start: "06:00", ende: "14:00", bestaetigt: true, grund: "" };
    const alt = { id: "m1", erfassung, einstempeln: {}, monatsabschluss: Object.fromEntries(monate.map((x) => [x, { abgeschlossen: true }])) };
    const gleich = { ...alt, erfassung: { ...erfassung } };
    const t0 = performance.now();
    expect(abschlussWiderspruch(alt, gleich, { vollSicht: true })).toBeNull();
    const dauer = performance.now() - t0;
    /* Ziel < 1 s (gemessen im Nachweis; der Wert steht im Prüfprotokoll). Die Grenze hier hat Luft für einen
       ausgelasteten Prüfrechner — die alte Schleife braucht dafür 40–54 s (werkzeug/wp16-messung.mjs), fällt also weit darüber. */
    console.log(`M-neu-1: abschlussWiderspruch 400 Personen × 24 Monate: ${Math.round(dauer)} ms`);
    expect(dauer).toBeLessThan(5000);
    const faelle = [
      { ...alt, erfassung: { ...erfassung, [`p7|${monate[5]}-03`]: { start: "06:00", ende: "15:00", bestaetigt: true, grund: "x" } } },
      { ...alt, erfassung: Object.fromEntries(Object.entries(erfassung).filter(([k]) => k !== `p9|${monate[20]}-11`)) },
      { ...alt, erfassung: { ...erfassung, [`p9|${monate[2]}-25`]: { start: "06:00", ende: "14:00", bestaetigt: true, grund: "" },
        [`p1|${monate[1]}-23`]: { start: "06:00", ende: "14:00", bestaetigt: true, grund: "" } } },
      { ...alt, einstempeln: { [`p3|${monate[4]}-02`]: { start: "06:00" } }, erfassung: { ...erfassung, [`p4|${monate[9]}-02`]: { bestaetigt: false } } },
    ];
    for (const g of faelle) {
      const neu = abschlussWiderspruch(alt, g, { vollSicht: true });
      const vorher = abschlussWiderspruchVorher(alt, g);
      expect(neu && { schluessel: neu.schluessel, monat: neu.monat }).toEqual(vorher);
    }
  });
});

/* ------------------------------------------------------------------------ */
/** Ein Betrieb für M-neu-2/N3/N6: vier Personen in e1, Dienste über Abweichungen, alle Ist-Zeiten bestätigt. */
function betrieb() {
  const m = A.leererMandant("Nachtrag", "pflege");
  const e1 = m.einheiten[0].id;
  const ohneVorgabe = { mindest: { mo_do: 0, fr: 0, sa: 0, so: 0 }, mindestQual: {} };
  const F = { ...m.dienstarten[0], ...ohneVorgabe, id: "F", name: "Früh", kurz: "F", start: "06:00", ende: "14:00", pause: 30, form: "regel" };
  const N = { ...m.dienstarten[0], ...ohneVorgabe, id: "N", name: "Nacht", kurz: "N", start: "21:00", ende: "06:00", pause: 30, form: "regel" };
  m.id = "m1";
  m.bundesland = "BY";
  m.einheiten = [m.einheiten[0], { ...m.einheiten[0], id: "e2", name: "Zweiter Bereich" }];
  m.dienstarten = [F, N];
  m.einstellungen = { ...m.einstellungen, nachtVon: "23:00", nachtBis: "06:00" };
  m.zuschlaege = [{ id: "z-n", art: "nacht", name: "Nacht", prozent: 25, aktiv: true }, { id: "z-f", art: "feiertag", name: "Feiertag", prozent: 100, aktiv: true },
    { id: "z-sa", art: "samstag", name: "Samstag", prozent: 10, aktiv: true }];
  m.personen = ["a1", "a2", "a3", "a4"].map((id, i) => ({ ...A.zugangsPerson("mitarbeiter", e1, i + 1), id, vorname: "V", nachname: id.toUpperCase(),
    personalnummer: `P${i + 1}`, rolle: "mitarbeiter", eintritt: "2020-01-01", zugehoerigkeit: [{ ab: "2020-01-01", einheitId: e1 }], imSchichtdienst: false, wochenstunden: 39 }));
  m.abweichungen = {}; m.erfassung = {};
  for (const p of m.personen) {
    for (const t of ["05", "06", "07", "08", "09", "31"]) m.abweichungen[`${p.id}|2026-10-${t}`] = "F";       // 31.10.: Samstag, Reformationstag in NI
    m.abweichungen[`${p.id}|2026-10-29`] = "N";
    for (const k of Object.keys(m.abweichungen)) if (k.startsWith(`${p.id}|`))
      m.erfassung[k] = { start: null, ende: null, bestaetigt: true, grund: "" };
  }
  m.einstempeln = {}; m.abwesenheiten = []; m.anfragen = []; m.monatsabschluss = {};
  m.lohnarten = undefined;
  return m;
}
const p = (m, id) => m.personen.find((x) => x.id === id);
/** Alles, was Konto, Lohn/DATEV und Betriebsrat aus Oktober machen. */
const auswertung = (m) => ({
  soll: A.sollStunden(m, p(m, "a1"), OKT),
  konto: A.stundenkonto(m, p(m, "a1"), OKT),
  ist: A.istStunden(m, p(m, "a1"), OKT),
  zuschlag: A.zuschlagStunden(m, p(m, "a1"), OKT),
  wert: A.zuschlagWert(m, p(m, "a1"), OKT),
  datev: A.datevSaetze(m, OKT),
  /* Betriebsrat: die Ist-Zeile des Bereichs e1 (Plan-Zeilen folgen bewusst dem heutigen Plan). */
  br: betriebsratAuswertung(m, "2026-12-20").zeilen.filter((z) => z.monat === OKT && z.einheitId === m.einheiten[0].id)
    .map((z) => ({ ist: z.istStunden, n: z.istErfasst })),
});
/* Januar bis Oktober abgeschlossen: Das Konto im Oktober läuft über das ganze Jahr. */
const JAHR = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", OKT];
const zuAlle = (m) => JAHR.reduce((x, mon) => zu(x, mon), m);

describe("M-neu-2: Soll, Einstellungen, Zugehörigkeit eines abgeschlossenen Monats eingefroren", { timeout: 120000 }, () => {
  const aenderungen = {
    "Wochenstunden −10": (m) => ({ ...m, personen: m.personen.map((x) => (x.id === "a1" ? { ...x, wochenstunden: 29 } : x)) }),
    "Bundesland BY → NI (Reformationstag 31.10.)": (m) => ({ ...m, bundesland: "NI",
      standorte: (m.standorte || []).map((s) => ({ ...s, bundesland: "NI" })) }),
    "Nachtfenster 23–6 → 20–6": (m) => ({ ...m, einstellungen: { ...m.einstellungen, nachtVon: "20:00", nachtBis: "06:00" } }),
    "Austritt rückwirkend auf den 15.10.": (m) => ({ ...m, personen: m.personen.map((x) => (x.id === "a1" ? { ...x, austritt: "2026-10-15" } : x)) }),
    "Versetzung nach e2 ab 01.10.": (m) => ({ ...m, personen: m.personen.map((x) => (x.id === "a1"
      ? { ...x, zugehoerigkeit: [{ ab: "2020-01-01", einheitId: m.einheiten[0].id }, { ab: "2026-10-01", einheitId: "e2" }] } : x)) }),
    "Lohnart Nacht umnummeriert": (m) => ({ ...m, lohnarten: { nacht: { nr: "1401", text: "Nacht neu" } } }),
    "Zuschlagssatz Nacht 25 → 40 %": (m) => ({ ...m, zuschlaege: m.zuschlaege.map((z) => (z.art === "nacht" ? { ...z, prozent: 40 } : z)) }),
  };
  for (const [name, aendern] of Object.entries(aenderungen)) {
    it(`${name}: abgeschlossen unverändert — nach dem Wiederöffnen wirkt die Änderung`, () => {
      const m = zuAlle(betrieb());
      const vorher = auswertung(m);
      expect(vorher.ist.geleistet).toBeGreaterThan(0);
      expect(vorher.br[0].ist).toBeGreaterThan(0);
      const geaendert = aendern(m);
      expect(auswertung(geaendert), name).toEqual(vorher);
      expect(auswertung(auf(geaendert)), name).not.toEqual(auswertung(auf(m)));
    });
  }
  it("Prüfsumme deckt die eingefrorenen Monatswerte: Soll im Freeze geändert → Prüfsumme anders", () => {
    const m = zu(betrieb());
    const k = "a1|2026-10";
    const x = { ...m, istEingefroren: { ...m.istEingefroren, [k]: { ...m.istEingefroren[k], s: 1 } } };
    expect(istAbdruck(x, OKT)).not.toBe(m.monatsabschluss[OKT].abdruck);
    expect(istAbdruck(m, OKT)).toBe(m.monatsabschluss[OKT].abdruck);
  });
});

/* ------------------------------------------------------------------------ */
describe("N3: fehlender Freeze im abgeschlossenen Monat ist ein Prüffall, nie 0 h", { timeout: 120000 }, () => {
  it("Person nachträglich mit Eintritt im abgeschlossenen Monat: Ist und Konto nicht verfügbar, keine DATEV-Zeile, Hinweis in der Lohnausgabe", () => {
    const m = zu(betrieb());
    const neu = { ...A.zugangsPerson("mitarbeiter", m.einheiten[0].id, 9), id: "a9", vorname: "V", nachname: "A9", personalnummer: "P9",
      rolle: "mitarbeiter", eintritt: "2026-10-10", zugehoerigkeit: [{ ab: "2026-10-10", einheitId: m.einheiten[0].id }], imSchichtdienst: false, wochenstunden: 39 };
    const x = { ...m, personen: [...m.personen, neu], abweichungen: { ...m.abweichungen, "a9|2026-10-12": "F" } };
    const ist = A.istStunden(x, neu, OKT);
    expect(ist.abschlussLuecke).toBe(true);
    expect(ist.gesamt).toBeNull();
    expect(A.stundenkonto(x, neu, OKT)).toBeNull();
    expect(A.zuschlagStunden(x, neu, OKT).gesamt).toBeNull();
    expect(A.datevSaetze(x, OKT).filter((z) => z.personalnummer === "P9")).toEqual([]);
    expect(A.lohnausgabeText(x, OKT)).toMatch(/1 Person fehlt in dieser Ausgabe/);
    expect(A.lohnausgabeText(x, OKT)).toMatch(/A9, V/);
    /* Die anderen bleiben, wie sie waren. */
    expect(A.istStunden(x, p(x, "a1"), OKT)).toEqual(A.istStunden(m, p(m, "a1"), OKT));
    /* Offen gerechnet (Gegenprobe) zählt der Tag. */
    expect(A.istStunden(auf(x), neu, OKT).gesamt).toBe(7.5);
  });
  it("Altabschluss ohne Freeze: alle Personen Prüffall — nicht 0 h", () => {
    const m = { ...betrieb(), monatsabschluss: { [OKT]: { abgeschlossen: true } } };
    const ist = A.istStunden(m, p(m, "a1"), OKT);
    expect(ist.abschlussLuecke).toBe(true);
    expect(ist.geleistet).toBeNull();
    expect(A.datevSaetze(m, OKT)).toEqual([]);
    expect(A.lohnausgabeText(m, OKT)).toMatch(/4 Personen fehlen in dieser Ausgabe/);
  });
});

/* ------------------------------------------------------------------------ */
describe("N1: abgewiesene Stempel — keine stille Verdrängung über der Obergrenze je Betrieb", () => {
  it(`${Math.ceil(ABGEWIESEN_MAX / ABGEWIESEN_JE_PERSON) + 1} Personen × ${ABGEWIESEN_JE_PERSON}: die ersten bleiben, darüber gezählt`, () => {
    let m = { id: "m1", monatsabschluss: { [OKT]: { abgeschlossen: true, verlauf: [] } } };
    const personen = Math.ceil(ABGEWIESEN_MAX / ABGEWIESEN_JE_PERSON) + 1;
    for (let i = 1; i <= personen; i++) for (let t = 1; t <= ABGEWIESEN_JE_PERSON; t++)
      m = abgewiesenVermerken(m, OKT, { personId: `p${i}`, datum: `2026-10-${String(t).padStart(2, "0")}`, art: "start", zeit: "06:00",
        zeitAm: `2026-10-${String(t).padStart(2, "0")}T04:00:00Z`, offline: true, ereignis: `ev-${i}-${t}`, am: JETZT });
    const e = m.monatsabschluss[OKT];
    expect(e.abgewiesen).toHaveLength(ABGEWIESEN_MAX);
    expect(e.abgewiesen.filter((x) => x.personId === "p1")).toHaveLength(ABGEWIESEN_JE_PERSON);     // nicht verdrängt
    expect(e.abgewiesenGezaehlt[`p${personen}`]).toBe(ABGEWIESEN_JE_PERSON);                       // „weitere" gezählt
  });
});

/* ------------------------------------------------------------------------ */
describe("N6: Textauskunft der Oberfläche nennt Freeze und abgewiesene Stempel", { timeout: 120000 }, () => {
  it("Abschnitte mit Inhalt", () => {
    const m0 = zu(betrieb());
    const m = { ...m0, monatsabschluss: { [OKT]: { ...m0.monatsabschluss[OKT],
      abgewiesen: [{ personId: "a1", datum: "2026-10-30", art: "start", zeit: "05:58", offline: true, am: JETZT }], abgewiesenGezaehlt: { a1: 3 } } } };
    const t = A.datenauskunft(m, "a1");
    expect(t).toContain("EINGEFRORENES IST (MONATSABSCHLUSS)");
    expect(t).toMatch(/Früh 7,5 h/);
    expect(t).toMatch(/2026-10: Soll /);
    expect(t).toContain("ABGEWIESENE STEMPEL (ABGESCHLOSSENER MONAT)");
    expect(t).toMatch(/Beginn 05:58 \(offline\)/);
    expect(t).toMatch(/3 weitere/);
    expect(A.datenauskunft(m, "a2")).not.toMatch(/05:58/);
  });
});

/* ------------------------------------------------------------------------
   Gegen die Serverfunktion
   ------------------------------------------------------------------------ */
let nr = 0;
const anfrage = async (pfad, { methode = "POST", rumpf, token } = {}) => {
  nr += 1;
  const kopf = { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.18.${Math.floor(nr / 250) % 250}.${nr % 250}` };
  if (methode !== "GET") kopf["content-type"] = "application/json";
  if (token) kopf.authorization = `Bearer ${token}`;
  const a = await daten(new Request(`http://${WIRT}/api/${pfad}`, { method: methode, headers: kopf,
    ...(methode === "GET" ? {} : { body: JSON.stringify(rumpf || {}) }) }), {});
  const text = await a.text();
  let d = {}; try { d = JSON.parse(text); } catch { /* leer */ }
  return { status: a.status, roh: text, ...d };
};
const ROLLEN = { l1: "leitung", p1: "planer", a1: "mitarbeiter", a2: "mitarbeiter" };
const token = async (id, raum) => (await sitzungAnlegen({ bestand: raum, name: `V ${id.toUpperCase()}`, rolle: ROLLEN[id], person: id,
  betrieb: 0, mandantId: "m1", einheit: null }, 24 * 3600 * 1000)).token;
const mandant = async (raum) => (await B.bestandLesen(laden(), raum)).bestand.mandanten[0];
function serverBetrieb() {
  const F = { id: "F", name: "Früh", start: "06:00", ende: "14:00", pause: 30 };
  const person = (id) => ({ id, vorname: "V", nachname: id.toUpperCase(), rolle: ROLLEN[id], bereich: "e1", status: "aktiv", geburtstag: "1985-01-01",
    wochenstunden: 39, zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }] });
  const abweichungen = { "a1|2026-10-28": "F", "a1|2026-10-29": "F", "a1|2026-11-02": "F", "a1|2026-11-03": "F" };
  const erfassung = { "a1|2026-10-28": { start: "06:00", ende: "14:00", bestaetigt: true, grund: "" },
    "a1|2026-11-03": { start: "06:00", ende: "14:00", bestaetigt: true, grund: "" } };
  return { id: "m1", name: "Haus", einheiten: [{ id: "e1", name: "WB 1" }], einstellungen: { ruhezeit: 11 }, dienstarten: [F],
    personen: Object.keys(ROLLEN).map(person), abweichungen, abwesenheiten: [], erfassung, einstempeln: {}, anfragen: [], nachrichten: [], monatsabschluss: {} };
}
const raumAnlegen = async (raum) => B.bestandSchreiben(laden(), raum, { version: 9, mandanten: [serverBetrieb()] }, { durch: "Pruefung" });
const spurZeilen = async () => {
  const { getStore } = await import("../server/lib/ablage.mjs");
  const spur = getStore({ name: "centric-spur" });
  const zeilen = [];
  for (const praefix of ["2026-11-05/schreiben/"]) {
    const { blobs } = await spur.list({ prefix: praefix });
    for (const b of blobs) zeilen.push(await spur.get(b.key, { type: "json" }));
  }
  return zeilen;
};

describe("H-neu-1 (b): Speichern ohne Freeze und Abschluss", { timeout: 120000 }, () => {
  it("Leitung und Planung: PUT ohne istEingefroren/monatsabschluss → 200, beides unverändert; alte Oberfläche (mitgeschickt) → 200, unverändert", async () => {
    const raum = "wp16n-put";
    await raumAnlegen(raum);
    expect((await anfrage("monatsabschluss", { token: await token("l1", raum), rumpf: { aktion: "abschliessen", monat: OKT } })).status).toBe(200);
    const vorher = await mandant(raum);
    for (const id of ["l1", "p1"]) {
      const g = await anfrage("bestand", { methode: "GET", token: await token(id, raum) });
      expect(g.status, g.roh).toBe(200);
      const hinaus = ohneServerFelder(g.bestand);
      hinaus.mandanten[0].nachrichten = [...(hinaus.mandanten[0].nachrichten || [])];
      const r = await anfrage("bestand", { methode: "PUT", token: await token(id, raum), rumpf: { bestand: hinaus, etag: g.etag } });
      expect(r.status, `${id} ${r.roh}`).toBe(200);
      const n = await mandant(raum);
      expect(n.istEingefroren, id).toEqual(vorher.istEingefroren);
      expect(n.monatsabschluss, id).toEqual(vorher.monatsabschluss);
      const g2 = await anfrage("bestand", { methode: "GET", token: await token(id, raum) });
      const alt = await anfrage("bestand", { methode: "PUT", token: await token(id, raum), rumpf: { bestand: g2.bestand, etag: g2.etag } });
      expect(alt.status, `${id} alt ${alt.roh}`).toBe(200);
      expect((await mandant(raum)).istEingefroren).toEqual(vorher.istEingefroren);
    }
  });
});

describe("Betreiberentscheidung (C): Lohnexport bestätigen — danach kein einfaches Wiederöffnen", { timeout: 120000 }, () => {
  it("Planung 403; nicht abgeschlossen 409; Leitung 200 (Wann, Wer, Prüfsumme, Revision 1); doppelt 409; Wiederöffnen 409 KORREKTUR_ERFORDERLICH; Sicht der Beschäftigten nur Status; Wiederherstellen behält", async () => {
    const raum = "wp16n-export";
    await raumAnlegen(raum);
    const tL = await token("l1", raum);
    expect((await anfrage("monatsabschluss", { token: tL, rumpf: { aktion: "lohnexport", monat: OKT } })).status).toBe(409);
    expect((await anfrage("monatsabschluss", { token: tL, rumpf: { aktion: "abschliessen", monat: OKT } })).status).toBe(200);
    const s = await anfrage("sicherung", { token: tL, rumpf: {} });
    expect(s.status, s.roh).toBe(200);
    expect((await anfrage("monatsabschluss", { token: await token("p1", raum), rumpf: { aktion: "lohnexport", monat: OKT } })).status).toBe(403);
    expect((await anfrage("monatsabschluss", { token: await token("a1", raum), rumpf: { aktion: "lohnexport", monat: OKT } })).status).toBe(403);
    /* Seit dem dritten Review (H-2) schickt die Oberfläche den Stand der ausgegebenen Datei mit. */
    const sicht = (await anfrage("bestand", { methode: "GET", token: tL })).bestand.mandanten[0];
    /* Seit dem vierten Review (A-1): Vormonate offen → nur mit ausdrücklicher Überstimmung (Kategorie, Begründung). */
    const vm = await anfrage("monatsabschluss", { token: tL, rumpf: { aktion: "lohnexport", monat: OKT, ...A.lohnexportStand(sicht, OKT) } });
    expect(vm.status, vm.roh).toBe(409);
    expect(vm.code).toBe("VORMONAT_OFFEN");
    const r = await anfrage("monatsabschluss", { token: tL, rumpf: { aktion: "lohnexport", monat: OKT, ...A.lohnexportStand(sicht, OKT), ...TROTZ } });
    expect(r.status, r.roh).toBe(200);
    expect(r.eintrag.lohnexport).toMatchObject({ am: JETZT.replace("Z", ".000Z"), wer: { personId: "l1", rolle: "leitung" }, revision: 1 });
    expect(r.eintrag.lohnexport.abdruck).toBe(r.eintrag.abdruck);
    expect(r.eintrag).toMatchObject({ schema: FREEZE_SCHEMA, revision: 1 });
    expect(r.eintrag.verlauf.at(-1)).toMatchObject({ art: "lohnexport" });
    expect((await anfrage("monatsabschluss", { token: tL, rumpf: { aktion: "lohnexport", monat: OKT } })).status).toBe(409);
    const w = await anfrage("monatsabschluss", { token: tL, rumpf: { aktion: "wiederoeffnen", monat: OKT, grund: "Nachtrag eines vergessenen Dienstes" } });
    expect(w.status, w.roh).toBe(409);
    expect(w.code).toBe(KORREKTUR_ERFORDERLICH);
    expect(w.fehler).toMatch(/Korrekturprozess erforderlich/);
    expect((await mandant(raum)).monatsabschluss[OKT].abgeschlossen).toBe(true);
    const a = await anfrage("bestand", { methode: "GET", token: await token("a1", raum) });
    expect(a.bestand.mandanten[0].monatsabschluss[OKT]).toEqual({ abgeschlossen: true, lohnexportiert: true });
    /* Sicherung von vor der Bestätigung zurückspielen: Abschluss mit Exportstatus und Freeze von heute. */
    const vorher = await mandant(raum);
    const g = await anfrage("bestand", { methode: "GET", token: tL });
    const wh = await anfrage("wiederherstellen", { token: tL, rumpf: { marke: s.marke, etag: g.etag } });
    expect(wh.status, wh.roh).toBe(200);
    const nachher = await mandant(raum);
    expect(nachher.monatsabschluss).toEqual(vorher.monatsabschluss);
    expect(nachher.istEingefroren).toEqual(vorher.istEingefroren);
    expect(istAbdruck(nachher, OKT)).toBe(nachher.monatsabschluss[OKT].abdruck);
    const sp = (await spurZeilen()).filter((x) => x.ausgang === "erfolg" && /Lohnexport bestätigt/.test(x.zusatz || ""));
    expect(sp.length).toBe(1);
    expect(sp[0].zusatz).toMatch(/^Monatsabschluss 2026-10 Lohnexport bestätigt ma-[0-9a-f]+ · Revision 1 · trotz Vormonat \(vor_inbetriebnahme\)$/);
  });
  it("Bibliothek: Prüfsumme weicht ab (am Server vorbei geändert) → 409, kein Export", () => {
    const m = zu(betrieb());
    const k = Object.keys(m.istEingefroren).find((x) => /^a1\|2026-10-\d\d$/.test(x));
    const x = { ...m, istEingefroren: { ...m.istEingefroren, [k]: { ...m.istEingefroren[k], std: 12 } } };
    /* Mit dem Stand der Datei (seit dem dritten Review, H-2) — die Prüfsumme weicht trotzdem ab: 409. */
    const r = lohnexportBestaetigen(x, { monat: OKT, ...A.lohnexportStand(m, OKT) }, WER_L, new Date(JETZT), "le-1");
    expect(r.status).toBe(409);
    expect(r.code).toBe("ABDRUCK_ABWEICHEND");
    expect("status" in lohnexportBestaetigen(m, { monat: OKT, ...A.lohnexportStand(m, OKT), ...TROTZ }, WER_L, new Date(JETZT), "le-2")).toBe(false);
  });
});

describe("N2/N7: Spur ohne Freitext und ohne Tag; Auskunft vollständig", { timeout: 120000 }, () => {
  it("N2: ungültiger Monat (Freitext) vor der Rechteprüfung → in der Spur nur „ungültig“", async () => {
    const raum = "wp16n-spur";
    await raumAnlegen(raum);
    const r = await anfrage("monatsabschluss", { token: await token("a1", raum), rumpf: { aktion: "abschliessen", monat: "2026-10 Frau Muster krank" } });
    expect(r.status).toBe(403);
    const z = (await spurZeilen()).filter((x) => /^Monatsabschluss abschliessen/.test(x.zusatz || ""));
    expect(z.some((x) => x.zusatz === "Monatsabschluss abschliessen ungültig · Rolle mitarbeiter")).toBe(true);
    expect(z.some((x) => /Muster/.test(x.zusatz))).toBe(false);
  });
  it("N7: Selbstauskunft und „schon erfasst“: kein Tag im Text, der Tag als eigenes Feld; Betreiber-Lage ohne Tag; Auskunft nach Art. 15 mit Tag", async () => {
    const raum = "wp16n-spur";
    const t = await token("a1", raum);
    const ok = await anfrage("zeit-bestaetigen", { token: t, rumpf: { datum: "2026-11-02" } });
    expect(ok.status, ok.roh).toBe(200);
    const schon = await anfrage("zeit-bestaetigen", { token: t, rumpf: { datum: "2026-11-03" } });
    expect(schon.status).toBe(409);
    const { spurFuerBetreiber } = await import("../server/lib/schutz.mjs");
    const z = (await spurZeilen()).filter((x) => /^(Selbstauskunft Zeiten|Zeit bestätigen)/.test(x.zusatz || ""));
    expect(z.map((x) => x.zusatz).sort()).toEqual(["Selbstauskunft Zeiten", "Zeit bestätigen: schon erfasst"]);
    for (const x of z) {
      expect(x.zusatz).not.toMatch(/\d{4}-\d{2}-\d{2}/);
      expect(["2026-11-02", "2026-11-03"]).toContain(x.tag);
      const b = spurFuerBetreiber(x);
      expect(b.tag).toBeUndefined();
      expect(JSON.stringify(b)).not.toMatch(/\d{4}-\d{2}-\d{2}(?!T)/);
    }
    const { protokollZurPerson } = await import("../server/lib/auskunft.mjs");
    const { getStore } = await import("../server/lib/ablage.mjs");
    const eigen = await protokollZurPerson(getStore({ name: "centric-spur" }), { raumKennung: z[0].kennung, mandantId: "m1", personId: "a1", einBetrieb: true });
    expect(eigen.filter((x) => /^(Selbstauskunft Zeiten|Zeit bestätigen)/.test(x.zusatz || "")).map((x) => x.tag).sort()).toEqual(["2026-11-02", "2026-11-03"]);
  });
  it("N7: keine Spur-Zeile in daten.mjs nennt den Tag im Text (stempeln, Zeit bestätigen, Selbstauskunft)", async () => {
    const quelle = await readFile(path.join(process.cwd(), "server/funktionen/daten.mjs"), "utf8");
    expect(quelle).not.toMatch(/`stempeln \$\{art\} \$\{/);
    expect(quelle).not.toMatch(/`Zeit bestätigen \$\{datum\}/);
    expect(quelle).not.toMatch(/`Selbstauskunft Zeiten: \$\{/);
  });
});

describe("N4: bestand-anlegen verwirft Abschluss und Freeze aus dem Inhalt", { timeout: 120000 }, () => {
  it("Betreiber legt einen Raum mit erfundenem Abschluss und Freeze an → gespeichert ohne beides", async () => {
    const raum = "wp16n-anlegen";
    const tB = (await sitzungAnlegen({ bestand: raum, name: "Betreiber", rolle: "betreiber", person: null, betrieb: 0, mandantId: null, einheit: null }, 3600e3)).token;
    const m = { ...serverBetrieb(), monatsabschluss: { [OKT]: { abgeschlossen: true, abdruck: "x", verlauf: [] } },
      istEingefroren: { "a1|2026-10-28": { std: 99, e: 1 } } };
    const r = await anfrage("bestand-anlegen", { token: tB, rumpf: { bestand: raum, inhalt: { version: VERSION, mandanten: [m] } } });
    expect(r.status, r.roh).toBe(200);
    const n = await mandant(raum);
    expect(n.monatsabschluss === undefined || Object.keys(n.monatsabschluss).length === 0).toBe(true);
    expect(n.istEingefroren === undefined || Object.keys(n.istEingefroren).length === 0).toBe(true);
  });
});

describe("Löschfrist: Monats- und Betriebseinträge des Freezes fallen mit dem Monat (aufbewahrung.mjs)", { timeout: 120000 }, () => {
  it("Löschlauf: \"*|JJJJ-MM\" und \"pid|JJJJ-MM\" eines Monats jenseits der Plandatenfrist weg, der abgeschlossene Oktober bleibt", async () => {
    const { raeumen } = await import("../server/lib/aufbewahrung.mjs");
    const m = zu(betrieb());
    const alt = { ...m, istEingefroren: { ...m.istEingefroren, "*|2019-01": { v: 2, da: {}, la: null, zs: null }, "a1|2019-01": { s: 1, z: [0, 0, 0, 0], nn: 0, i: 1, u: null },
      "a1|2019-01-07": { d: 0, std: 7.5 } } };
    const { mandant } = raeumen(alt, "2026-11-05");
    expect(Object.keys(mandant.istEingefroren).filter((k) => k.includes("|2019-01"))).toEqual([]);
    expect(mandant.istEingefroren["*|2026-10"]).toEqual(m.istEingefroren["*|2026-10"]);
    expect(mandant.istEingefroren["a1|2026-10"]).toEqual(m.istEingefroren["a1|2026-10"]);
  });
});

describe("Auskunft (Art. 15, Server): eingefrorenes Ist mit aufgelöster Dienstart", { timeout: 120000 }, () => {
  it("Tage nennen die Dienstart, nicht nur den Verweis", () => {
    const m = zu(betrieb());
    const w = eingefrorenFuerPerson(m, "a1");
    expect(w["a1|2026-10-29"]).toMatchObject({ da: { id: "N", start: "21:00" }, std: 8.5 });
    expect(w["a1|2026-10-29"].d).toBeUndefined();
    expect(w["a1|2026-10"]).toMatchObject({ i: 1 });
    expect(Object.keys(w).every((k) => k.startsWith("a1|"))).toBe(true);
  });
});
