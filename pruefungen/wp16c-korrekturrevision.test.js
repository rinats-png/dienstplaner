/* ==========================================================================
   WP-16c — MONATSABSCHLUSS: KORREKTURREVISIONEN NACH BESTÄTIGTEM LOHNEXPORT

   Revision 1 bleibt historisch (abgelegt, unverändert); Revision N+1 mit Zeitpunkt, Berechtigten, Anlass, Grund und
   Differenz; Differenz der Lohnzeilen; gekennzeichneter Korrekturexport; Rechte (nur Leitung beginnt/gibt frei);
   zweite Person für die lohnrelevante Differenz; keine Frist; Migration alter Abschlüsse; Vertrags-/Tarifparameter;
   späte Offline-Stempel; parallele Änderungen.
   ========================================================================== */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { VERSION } from "../src/migration.js";
import { abschliessen, wiederoeffnen, lohnexportBestaetigen, korrekturBeginnen, korrekturFreigeben, exportZeilenFuer,
  KORREKTUR_ERFORDERLICH, KORREKTUR_FREIGABE_ERFORDERLICH, KORREKTUR_BASIS_FEHLT, KORREKTUR_BASIS_ABWEICHEND, KORREKTUR_DIFFERENZ_FEHLT,
  datevZeilenAbdruck, abschlussStatus, monatAbgeschlossen } from "../server/lib/monatsabschluss.mjs";
import { abschlussRecht } from "../server/lib/rechte.mjs";
import { abschlussPersonenRaeumen } from "../server/lib/aufbewahrung.mjs";
import { LOHNARTEN_STD } from "../server/lib/lohnrechnung.mjs";

const WIRT = "127.0.0.1:3000";
const JETZT = "2026-11-05T09:00:00Z";
const OKT = "2026-10";
const TROTZ = { trotzVormonat: true, vormonatKategorie: "vor_inbetriebnahme", vormonatGrund: "Vormonate ohne Zeitdaten vor dem Start" };
const WER_L1 = { personId: "l1", name: "L1", rolle: "leitung" };
const WER_L2 = { personId: "l2", name: "L2", rolle: "leitung" };
let wurzel, laden, daten, B, sitzungAnlegen, A, FL;

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-wp16c-"));
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
  FL = await import("../src/lib/fachlogik.js");
}, 120000);
afterAll(async () => {
  vi.useRealTimers();
  if (wurzel) await rm(wurzel, { recursive: true, force: true });
});

/* ------------------------------ Betrieb ------------------------------ */
const ROLLEN = { l1: "leitung", l2: "leitung", p1: "planer", br1: "betriebsrat", a1: "mitarbeiter", a2: "mitarbeiter", l3: "leitung" };
function betrieb() {
  const m = A.leererMandant("Revision", "pflege");
  const e1 = m.einheiten[0].id;
  const ohneVorgabe = { mindest: { mo_do: 0, fr: 0, sa: 0, so: 0 }, mindestQual: {} };
  const F = { ...m.dienstarten[0], ...ohneVorgabe, id: "F", name: "Früh", kurz: "F", start: "06:00", ende: "14:00", pause: 30, form: "regel" };
  m.id = "m1";
  m.bundesland = "BY";
  m.dienstarten = [F];
  m.einstellungen = { ...m.einstellungen, nachtVon: "23:00", nachtBis: "06:00", ruhezeit: 11 };
  m.zuschlaege = [{ id: "z-n", art: "nacht", name: "Nacht", prozent: 25, aktiv: true }, { id: "z-f", art: "feiertag", name: "Feiertag", prozent: 100, aktiv: true },
    { id: "z-sa", art: "samstag", name: "Samstag", prozent: 10, aktiv: true }, { id: "z-so", art: "sonntag", name: "Sonntag", prozent: 50, aktiv: true }];
  m.personen = Object.keys(ROLLEN).map((id, i) => ({ ...A.zugangsPerson(ROLLEN[id], e1, i + 1), id, vorname: "V", nachname: id.toUpperCase(),
    personalnummer: `P${i + 1}`, rolle: ROLLEN[id], eintritt: "2020-01-01", zugehoerigkeit: [{ ab: "2020-01-01", einheitId: e1 }],
    imSchichtdienst: false, wochenstunden: 39, geburtstag: "1985-01-01" }));
  m.abweichungen = {}; m.erfassung = {};
  for (const id of ["a1", "a2"]) {
    for (const t of ["05", "06", "07", "08", "09", "18", "31"]) {              // 18.10. Sonntag, 31.10. Samstag
      m.abweichungen[`${id}|2026-10-${t}`] = "F";
      m.erfassung[`${id}|2026-10-${t}`] = { start: null, ende: null, bestaetigt: true, grund: "" };
    }
  }
  m.einstempeln = {}; m.abwesenheiten = []; m.anfragen = []; m.nachrichten = []; m.monatsabschluss = {};
  m.lohnarten = undefined;
  return m;
}
const zu = (m, monat = OKT, wer = WER_L1) => {
  const r = abschliessen(m, { monat, trotzPrueffaellen: true }, wer, new Date(JETZT), `ma-${monat}`, "2026-11-05");
  if ("status" in r) throw new Error(r.grund);
  return r.mandant;
};
const exportiert = (m, monat = OKT, id = "le-1") => {
  const r = lohnexportBestaetigen(m, { monat, ...FL.lohnexportStand(m, monat), ...TROTZ }, WER_L1, new Date(JETZT), id);
  if ("status" in r) throw new Error(`${r.code} ${r.grund}`);
  return r.mandant;
};
const beginnen = (m, extra = {}, wer = WER_L1) => korrekturBeginnen(m, { monat: OKT, anlass: "fehler", grund: "Samstagsdienst war länger als eingetragen", ...extra }, wer, new Date(JETZT), "kb-1");
/** Korrektur: a1 hat den Samstagsdienst am 31.10. doch nicht geleistet (Ausfall) — der Samstagszuschlag entfällt. */
const mitKorrektur = (m) => {
  const { ["a1|2026-10-31"]: _a, ...abw } = m.abweichungen;
  const { ["a1|2026-10-31"]: _e, ...erf } = m.erfassung;
  void _a; void _e;
  return { ...m, abweichungen: abw, erfassung: erf };
};
const sa = (zeilen, pnr = "P1") => zeilen.filter((z) => z.personalnummer === pnr);

/* ------------------------------ Bibliothek ------------------------------ */
describe("Revision 1 bleibt historisch; Revision 2 mit Differenz", { timeout: 120000 }, () => {
  it("Beginnen legt die exportierte Revision unverändert ab, öffnet den Monat und führt Revision 2 (Wann, Wer, Anlass, Grund)", () => {
    const m = exportiert(zu(betrieb()));
    const eintrag1 = m.monatsabschluss[OKT];
    const zeilen1 = exportZeilenFuer(m, OKT);
    expect(zeilen1).toMatchObject({ revision: 1, korrekturZu: null });
    expect(zeilen1.zeilen.length).toBeGreaterThan(0);
    const r = beginnen(m);
    expect("status" in r, JSON.stringify(r)).toBe(false);
    const e = r.mandant.monatsabschluss[OKT];
    expect(e).toMatchObject({ abgeschlossen: false, revision: 2, korrektur: { offen: true, anlass: "fehler", vonRevision: 1, freigabe: null } });
    expect(e.revisionen).toHaveLength(1);
    expect(e.revisionen[0]).toMatchObject({ revision: 1, stand: eintrag1.stand, abdruck: eintrag1.abdruck, lohnexport: eintrag1.lohnexport, schema: eintrag1.schema });
    expect(e.revisionen[0].zeilen.length).toBe(zeilen1.zeilen.length);               // die ausgegebenen Zeilen, kompakt
    expect(e.verlauf.at(-1)).toMatchObject({ art: "korrektur-beginn", revision: 2, vonRevision: 1, anlass: "fehler", wer: { personId: "l1", rolle: "leitung" } });
    expect(e.verlauf.at(-1).grund).toMatch(/Samstagsdienst/);
    expect(e.lohnexport).toBeUndefined();
    expect(Object.keys(r.mandant.istEingefroren || {}).filter((k) => k.includes(OKT))).toEqual([]);   // wie nach dem Wiederöffnen
    expect(monatAbgeschlossen(r.mandant, OKT)).toBe(false);
  });
  it("Abschluss ohne lohnrelevante Änderung: keine Differenz, keine Freigabe nötig, Revision 2 mit leerem Korrekturexport", () => {
    const m = exportiert(zu(betrieb()));
    const b = beginnen(m);
    const z = abschliessen(b.mandant, { monat: OKT }, WER_L1, new Date(JETZT), "ma-2", "2026-11-05");
    expect("status" in z, JSON.stringify(z)).toBe(false);
    expect(z.differenz.n).toBe(0);
    expect(z.eintrag).toMatchObject({ abgeschlossen: true, revision: 2, korrektur: { offen: false, differenz: { n: 0 } } });
    expect(z.eintrag.revisionen).toHaveLength(1);
    expect(exportZeilenFuer(z.mandant, OKT)).toMatchObject({ zeilen: [], revision: 2, korrekturZu: 1 });
  });
  it("lohnrelevante Änderung: Differenz = neue − exportierte Zeilen, gekennzeichnet; Abschluss ohne zweite Person ⇒ 409", () => {
    const m = exportiert(zu(betrieb()));
    const voll1 = exportZeilenFuer(m, OKT).zeilen;
    const b = beginnen(m);
    const geaendert = mitKorrektur(b.mandant);
    const z = abschliessen(geaendert, { monat: OKT }, WER_L1, new Date(JETZT), "ma-2", "2026-11-05");
    expect(z.status).toBe(409);
    expect(z.code).toBe(KORREKTUR_FREIGABE_ERFORDERLICH);
    expect(z.differenz.n).toBeGreaterThan(0);
    /* Vorschau/Freigabe der zweiten Person */
    const ohneDiff = korrekturFreigeben(geaendert, { monat: OKT }, WER_L2, new Date(JETZT), "kf-1", "2026-11-05");
    expect(ohneDiff.code).toBe(KORREKTUR_DIFFERENZ_FEHLT);
    const falsch = korrekturFreigeben(geaendert, { monat: OKT, differenz: "0".repeat(32) }, WER_L2, new Date(JETZT), "kf-1", "2026-11-05");
    expect(falsch.code).toBe(KORREKTUR_DIFFERENZ_FEHLT);
    const selbst = korrekturFreigeben(geaendert, { monat: OKT, differenz: ohneDiff.differenz.abdruck }, WER_L1, new Date(JETZT), "kf-1", "2026-11-05");
    expect([selbst.status, selbst.code]).toEqual([403, "KORREKTUR_ZWEITE_PERSON"]);
    const ohnePerson = korrekturFreigeben(geaendert, { monat: OKT, differenz: ohneDiff.differenz.abdruck }, { personId: null, rolle: "leitung" }, new Date(JETZT), "kf-1", "2026-11-05");
    expect(ohnePerson.status).toBe(403);
    const f = korrekturFreigeben(geaendert, { monat: OKT, differenz: ohneDiff.differenz.abdruck }, WER_L2, new Date(JETZT), "kf-1", "2026-11-05");
    expect("status" in f, JSON.stringify(f)).toBe(false);
    expect(f.eintrag.korrektur.freigabe).toMatchObject({ wer: { personId: "l2" }, differenz: ohneDiff.differenz.abdruck, n: ohneDiff.differenz.n });
    expect(f.eintrag.verlauf.at(-1)).toMatchObject({ art: "korrektur-freigabe", wer: { personId: "l2" } });
    /* Abschluss mit Freigabe */
    const ok = abschliessen(f.mandant, { monat: OKT }, WER_L1, new Date(JETZT), "ma-2", "2026-11-05");
    expect("status" in ok, JSON.stringify(ok)).toBe(false);
    expect(ok.eintrag).toMatchObject({ abgeschlossen: true, revision: 2, korrektur: { offen: false, differenz: { n: ohneDiff.differenz.n } } });
    expect(ok.eintrag.verlauf.at(-1)).toMatchObject({ art: "abschluss", revision: 2, differenz: { n: ohneDiff.differenz.n } });
    /* Korrekturexport: nur Differenzzeilen, gekennzeichnet, Summen stimmen */
    const ex = exportZeilenFuer(ok.mandant, OKT);
    expect(ex).toMatchObject({ revision: 2, korrekturZu: 1 });
    expect(ex.zeilen.every((x) => /^Korrektur R2 zu R1: /.test(x.bezeichnung))).toBe(true);
    const voll2 = FL.datevSaetze(ok.mandant, OKT);
    expect(voll2).toEqual(ex.zeilen);                                        // die Oberfläche gibt genau diese Zeilen aus
    const samstag = ex.zeilen.find((x) => x.personalnummer === "P5" && /Samstag|samstag/i.test(x.bezeichnung));
    expect(samstag).toBeTruthy();
    expect(samstag.stunden).toBeCloseTo(-8, 2);                               // der Samstagsdienst entfällt
    expect(sa(voll1, "P6").length).toBeGreaterThan(0);                        // a2 unverändert ⇒ keine Zeile in der Differenz
    expect(ex.zeilen.some((x) => x.personalnummer === "P6")).toBe(false);
    /* Revision 1 unverändert abgelegt */
    expect(ok.eintrag.revisionen[0]).toEqual(f.eintrag.revisionen[0]);
  });
  it("Freigabe ist an Differenz UND Ist-Stand gebunden: jede weitere Änderung nach der Freigabe macht sie ungültig", () => {
    const m = exportiert(zu(betrieb()));
    const g = mitKorrektur(beginnen(m).mandant);
    const d = korrekturFreigeben(g, { monat: OKT }, WER_L2, new Date(JETZT), "kf-1", "2026-11-05").differenz.abdruck;
    const f = korrekturFreigeben(g, { monat: OKT, differenz: d }, WER_L2, new Date(JETZT), "kf-1", "2026-11-05");
    const { ["a2|2026-10-31"]: _x, ...restAbw } = f.mandant.abweichungen;
    void _x;
    const spaeter = { ...f.mandant, abweichungen: restAbw };
    const z = abschliessen(spaeter, { monat: OKT }, WER_L1, new Date(JETZT), "ma-2", "2026-11-05");
    expect([z.status, z.code]).toEqual([409, KORREKTUR_FREIGABE_ERFORDERLICH]);
    expect(z.grund).toMatch(/passt nicht mehr/);
  });
  it("Freigabe und Ist-Stand: eine Änderung, die die Lohnzeilen nicht berührt (Frühdienst werktags), macht die Freigabe trotzdem ungültig", () => {
    const m = exportiert(zu(betrieb()));
    const g = mitKorrektur(beginnen(m).mandant);
    const d = korrekturFreigeben(g, { monat: OKT }, WER_L2, new Date(JETZT), "kf-1", "2026-11-05").differenz.abdruck;
    const f = korrekturFreigeben(g, { monat: OKT, differenz: d }, WER_L2, new Date(JETZT), "kf-1", "2026-11-05");
    const still = { ...f.mandant, erfassung: { ...f.mandant.erfassung, "a2|2026-10-05": { start: "06:00", ende: "15:00", bestaetigt: true, grund: "x" } } };
    const z = abschliessen(still, { monat: OKT }, WER_L1, new Date(JETZT), "ma-2", "2026-11-05");
    expect([z.status, z.code]).toEqual([409, KORREKTUR_FREIGABE_ERFORDERLICH]);
  });
  it("kein Wiederöffnen nach Export (Zeiger auf den Korrekturprozess); nach Revision 2 ohne Export darf einfach wiederöffnet werden, die Revision bleibt offen", () => {
    const m = exportiert(zu(betrieb()));
    const w = wiederoeffnen(m, { monat: OKT, grund: "Nachtrag eines vergessenen Dienstes" }, WER_L1, new Date(JETZT), "w-1");
    expect([w.status, w.code]).toEqual([409, KORREKTUR_ERFORDERLICH]);
    expect(w.grund).toMatch(/korrektur-beginnen/);
    const z = abschliessen(beginnen(m).mandant, { monat: OKT }, WER_L1, new Date(JETZT), "ma-2", "2026-11-05");
    const auf = wiederoeffnen(z.mandant, { monat: OKT, grund: "Noch etwas vergessen" }, WER_L1, new Date(JETZT), "w-2");
    expect("status" in auf, JSON.stringify(auf)).toBe(false);
    expect(auf.eintrag).toMatchObject({ abgeschlossen: false, revision: 2, korrektur: { offen: true, freigabe: null } });
    expect(auf.eintrag.revisionen).toHaveLength(1);
  });
  it("Korrekturexport bestätigen: Zeilen = Differenz, ereignis.korrekturZu; danach wieder gesperrt und eine weitere Korrektur wird Revision 3 gegen Revision 2", () => {
    let m = exportiert(zu(betrieb()));
    let g = mitKorrektur(beginnen(m).mandant);
    const d = korrekturFreigeben(g, { monat: OKT }, WER_L2, new Date(JETZT), "kf-1", "2026-11-05").differenz.abdruck;
    g = korrekturFreigeben(g, { monat: OKT, differenz: d }, WER_L2, new Date(JETZT), "kf-1", "2026-11-05").mandant;
    g = abschliessen(g, { monat: OKT }, WER_L1, new Date(JETZT), "ma-2", "2026-11-05").mandant;
    const ohneStand = lohnexportBestaetigen(g, { monat: OKT }, WER_L1, new Date(JETZT), "le-2");
    expect(ohneStand.status).toBe(409);
    const alt = FL.lohnexportStand(g, OKT);
    const ex = lohnexportBestaetigen(g, { monat: OKT, ...alt, ...TROTZ }, WER_L1, new Date(JETZT), "le-2");
    expect("status" in ex, JSON.stringify(ex)).toBe(false);
    expect(ex.ereignis).toMatchObject({ art: "lohnexport", revision: 2, korrekturZu: 1 });
    expect(ex.eintrag.lohnexport).toMatchObject({ revision: 2, korrekturZu: 1 });
    expect(ex.ereignis.zeilen).toBe(datevZeilenAbdruck(exportZeilenFuer(g, OKT).zeilen));
    expect(FL.lohnausgabeDateiname(ex.mandant, OKT, "csv")).toMatch(/_korrektur_r2_/);
    expect(FL.datevCSV(ex.mandant, OKT)).toContain("Korrektur R2 zu R1");
    m = ex.mandant;
    expect([wiederoeffnen(m, { monat: OKT, grund: "Noch einmal ändern bitte" }, WER_L1, new Date(JETZT), "w-3").code]).toEqual([KORREKTUR_ERFORDERLICH]);
    /* Revision 3 gegen Revision 2 (volle Zeilen von Revision 2 abgelegt, nicht der Korrekturexport) */
    const b3 = korrekturBeginnen(m, { monat: OKT, anlass: "gesetzlich", grund: "Berichtigung nach Prüfung des Lohnbüros" }, WER_L1, new Date(JETZT), "kb-2");
    expect("status" in b3, JSON.stringify(b3)).toBe(false);
    expect(b3.eintrag).toMatchObject({ revision: 3 });
    expect(b3.eintrag.revisionen.map((r) => r.revision)).toEqual([1, 2]);
    expect(b3.eintrag.revisionen[1].zeilen.length).toBe(b3.eintrag.revisionen[0].zeilen.length - 1);   // volle Zeilen von Revision 2 (Samstag a1 entfallen)
    const g3 = abschliessen(b3.mandant, { monat: OKT }, WER_L1, new Date(JETZT), "ma-3", "2026-11-05");
    expect("status" in g3, JSON.stringify(g3)).toBe(false);
    expect(g3.differenz.n).toBe(0);                                                   // nichts geändert gegenüber Revision 2 ⇒ leer
  });
});

describe("Regeln und Grenzen", () => {
  it("nur nach bestätigtem Lohnexport; Anlass und Grund Pflicht; offene Korrektur ⇒ nicht doppelt", () => {
    const zuOhneExport = zu(betrieb());
    expect(beginnen(zuOhneExport).code).toBe("KORREKTUR_NICHT_NOETIG");
    const m = exportiert(zuOhneExport);
    expect(beginnen(m, { grund: "kurz" }).status).toBe(422);
    expect(beginnen(m, { anlass: "egal" }).status).toBe(422);
    expect(beginnen(m, { anlass: undefined }).status).toBe(422);
    const b = beginnen(m);
    expect(beginnen(b.mandant).status).toBe(409);
    expect(korrekturFreigeben(m, { monat: OKT }, WER_L2, new Date(JETZT), "kf", "2026-11-05").status).toBe(409);        // keine offene Korrektur
  });
  it("keine starre Frist: 500 Tage nach dem Export ist die Korrektur möglich", () => {
    const m = exportiert(zu(betrieb()));
    const spaet = korrekturBeginnen(m, { monat: OKT, anlass: "gesetzlich", grund: "Berichtigung Jahre später" }, WER_L1, new Date("2028-03-20T09:00:00Z"), "kb-9");
    expect("status" in spaet, JSON.stringify(spaet)).toBe(false);
    expect(spaet.ereignis.am).toBe("2028-03-20T09:00:00.000Z");
  });
  it("Migration: Abschluss ohne Revisionsfeld gilt als Revision 1; ohne rekonstruierbares Freeze ⇒ 409 KORREKTUR_BASIS_FEHLT (fail-closed)", () => {
    const m = exportiert(zu(betrieb()));
    const { revision: _r, ...ohneRev } = m.monatsabschluss[OKT];
    void _r;
    const alt = { ...m, monatsabschluss: { [OKT]: ohneRev } };
    const b = beginnen(alt);
    expect("status" in b, JSON.stringify(b)).toBe(false);
    expect(b.eintrag.revision).toBe(2);
    expect(b.eintrag.revisionen[0].revision).toBe(1);
    const istOhne = Object.fromEntries(Object.entries(m.istEingefroren).filter(([k]) => !k.includes(OKT)));
    const kaputt = beginnen({ ...m, istEingefroren: istOhne });
    expect([kaputt.status, kaputt.code]).toEqual([409, KORREKTUR_BASIS_FEHLT]);
  });
  it("Basis weicht ab (heute andere Zeilen als bestätigt, z. B. nach Anonymisierung): immer 409, auch mit eingeschmuggeltem basisAbweichung", () => {
    const m = exportiert(zu(betrieb()));
    const k = Object.keys(m.istEingefroren).find((x) => x === "a1|2026-10" && m.istEingefroren[x].nm);
    const verfaelscht = { ...m, istEingefroren: { ...m.istEingefroren, [k]: { ...m.istEingefroren[k], nm: ["P1X", "Neu", "Name"] } } };
    /* Der Abdruck des Abschlusses deckt das Freeze: das ist eine Verfälschung, keine Anonymisierung ⇒ 409 ABDRUCK_ABWEICHEND */
    expect(beginnen(verfaelscht).code).toBe("ABDRUCK_ABWEICHEND");
    /* Anonymisierung über die Löschfrist-Funktion ändert nm UND den Abdruck nicht — dann weichen die Zeilen ab */
    const e = m.monatsabschluss[OKT];
    const neuE = { ...e, lohnexport: { ...e.lohnexport, zeilen: "f".repeat(32) } };
    const abw = beginnen({ ...m, monatsabschluss: { [OKT]: neuE } });
    expect([abw.status, abw.code]).toEqual([409, KORREKTUR_BASIS_ABWEICHEND]);
    const noch = beginnen({ ...m, monatsabschluss: { [OKT]: neuE } }, { basisAbweichung: true });
    expect([noch.status, noch.code]).toEqual([409, KORREKTUR_BASIS_ABWEICHEND]);
  });
  it("Vertrags-/Tarifparameter: eine geänderte Lohnart zwischen Export und Korrektur taucht in der Differenz auf und braucht die zweite Person (nie still)", () => {
    const m = exportiert(zu(betrieb()));
    const b = beginnen(m).mandant;
    const std = LOHNARTEN_STD;
    const geaendert = { ...b, lohnarten: { ...std, samstag: { nr: "7777", text: "Samstag neu" } } };
    const z = abschliessen(geaendert, { monat: OKT }, WER_L1, new Date(JETZT), "ma-2", "2026-11-05");
    expect([z.status, z.code]).toEqual([409, KORREKTUR_FREIGABE_ERFORDERLICH]);
    expect(z.differenz.n).toBeGreaterThan(0);
  });
  it("Rechte: korrektur-beginnen und -freigeben wie das Wiederöffnen (org.edit), alle anderen Rollen und Gäste nein", () => {
    for (const rolle of ["leitung", "planer", "schichtverantwortung", "mitarbeiter", "betriebsrat", "kunde", "gast", "", null, undefined]) {
      for (const aktion of ["korrektur-beginnen", "korrektur-freigeben"])
        expect(abschlussRecht(rolle, aktion), `${rolle} ${aktion}`).toBe(abschlussRecht(rolle, "wiederoeffnen"));
    }
    expect(abschlussRecht("leitung", "korrektur-beginnen")).toBe(true);
    expect(abschlussRecht("planer", "korrektur-beginnen")).toBe(false);
    expect(abschlussRecht("mitarbeiter", "korrektur-freigeben")).toBe(false);
  });
  it("Sicht: Beschäftigte sehen von Revisionen nichts; ein Monat in Korrektur erscheint ihnen als offen", () => {
    const m = exportiert(zu(betrieb()));
    expect(abschlussStatus(m.monatsabschluss)[OKT]).toEqual({ abgeschlossen: true, lohnexportiert: true });
    const b = beginnen(m).mandant;
    expect(abschlussStatus(b.monatsabschluss)).toEqual({});
    const zu2 = abschliessen(b, { monat: OKT }, WER_L1, new Date(JETZT), "ma-2", "2026-11-05").mandant;
    expect(JSON.stringify(abschlussStatus(zu2.monatsabschluss))).not.toMatch(/revision|korrektur|zeilen/);
  });
  it("Aufbewahrung: abgelegte Lohnzeilen (Personalnummern) gehen mit dem Freeze nach der Plandatenfrist, Kennung/Prüfsumme/Berechtigte bleiben", () => {
    const m = exportiert(zu(betrieb()));
    const b = beginnen(m).mandant;
    const frisch = abschlussPersonenRaeumen(b.monatsabschluss, { planStichtag: "2026-01-01" });
    expect(frisch.entfernt).toBe(0);
    const alt = abschlussPersonenRaeumen(b.monatsabschluss, { planStichtag: "2026-12-01" });
    expect(alt.entfernt).toBe(1);
    const r = alt.wert[OKT].revisionen[0];
    expect(r.zeilen).toBeUndefined();
    expect(r).toMatchObject({ revision: 1, zeilenGeloescht: true, abdruck: m.monatsabschluss[OKT].abdruck });
    /* danach lässt sich ein Korrekturexport nicht mehr gegen Revision 1 rechnen — beim Beginnen wird das geprüft (Freeze gelöscht ⇒ BASIS_FEHLT) */
  });
});

/* ------------------------------ Serverfunktion ------------------------------ */
let nr = 0;
const anfrage = async (pfad, { methode = "POST", rumpf, token } = {}) => {
  nr += 1;
  const kopf = { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.21.${Math.floor(nr / 250) % 250}.${nr % 250}` };
  if (methode !== "GET") kopf["content-type"] = "application/json";
  if (token) kopf.authorization = `Bearer ${token}`;
  const a = await daten(new Request(`http://${WIRT}/api/${pfad}`, { method: methode, headers: kopf,
    ...(methode === "GET" ? {} : { body: JSON.stringify(rumpf || {}) }) }), {});
  const text = await a.text();
  let d = {}; try { d = JSON.parse(text); } catch { /* leer */ }
  return { status: a.status, roh: text, ...d };
};
const token = async (id, raum) => (await sitzungAnlegen({ bestand: raum, name: `V ${id.toUpperCase()}`, rolle: ROLLEN[id], person: id,
  betrieb: 0, mandantId: "m1", einheit: null }, 24 * 3600 * 1000)).token;
const mandant = async (raum) => (await B.bestandLesen(laden(), raum)).bestand.mandanten[0];
const ID = (n) => `${String(n).padStart(8, "0")}-0000-4000-8000-${String(n).padStart(12, "0")}`;
const abschlussPost = (t, rumpf) => anfrage("monatsabschluss", { token: t, rumpf: { monat: OKT, ...rumpf } });

describe("HTTP: der ganze Weg mit Rechten, Rennen und späten Stempeln", { timeout: 180000 }, () => {
  it("Abschluss, Export, Korrektur beginnen (nur Leitung), Ist ändern, Freigabe durch die zweite Leitung, Abschluss, Korrekturexport", async () => {
    const raum = "wp16c-weg";
    await B.bestandSchreiben(laden(), raum, { version: VERSION, mandanten: [betrieb()] }, { durch: "Pruefung" });
    const [tL1, tL2, tP, tA, tBr] = [await token("l1", raum), await token("l2", raum), await token("p1", raum), await token("a1", raum), await token("br1", raum)];
    expect((await abschlussPost(tL1, { aktion: "abschliessen" })).status).toBe(200);
    /* vor dem Export: Beginnen ⇒ 409 (einfaches Wiederöffnen genügt) */
    const vor = await abschlussPost(tL1, { aktion: "korrektur-beginnen", anlass: "fehler", grund: "Zu früh für eine Korrektur" });
    expect([vor.status, vor.code]).toEqual([409, "KORREKTUR_NICHT_NOETIG"]);
    const sicht = (await anfrage("bestand", { methode: "GET", token: tL1 })).bestand.mandanten[0];
    const ex = await abschlussPost(tL1, { aktion: "lohnexport", ...FL.lohnexportStand(sicht, OKT), ...TROTZ });
    expect(ex.status, ex.roh).toBe(200);
    const w = await abschlussPost(tL1, { aktion: "wiederoeffnen", grund: "Nachtrag eines vergessenen Dienstes" });
    expect([w.status, w.code]).toEqual([409, KORREKTUR_ERFORDERLICH]);

    /* Rechte */
    const rumpfB = { aktion: "korrektur-beginnen", anlass: "fehler", grund: "Samstagsdienst war länger als eingetragen" };
    for (const t of [tP, tA, tBr]) expect((await abschlussPost(t, rumpfB)).status).toBe(403);
    expect((await abschlussPost(tL1, { ...rumpfB, anlass: undefined })).status).toBe(422);
    expect((await mandant(raum)).monatsabschluss[OKT].abgeschlossen).toBe(true);

    /* parallele Änderungen: zwei Leitungen beginnen gleichzeitig ⇒ genau eine Revision */
    const par = await Promise.all([abschlussPost(tL1, rumpfB), abschlussPost(tL2, rumpfB)]);
    expect(par.map((x) => x.status).sort()).toEqual([200, 409]);
    const m1 = await mandant(raum);
    expect(m1.monatsabschluss[OKT]).toMatchObject({ abgeschlossen: false, revision: 2 });
    expect(m1.monatsabschluss[OKT].revisionen).toHaveLength(1);
    const beginner = par[0].status === 200 ? "l1" : "l2";
    const zweite = beginner === "l1" ? tL2 : tL1;

    /* Beschäftigte sehen den Monat als offen, ohne Revisionen; nachträgliche Offline-Stempel für den Monat sind jetzt möglich (Korrektur offen) */
    const a = await anfrage("bestand", { methode: "GET", token: tA });
    expect(a.bestand.mandanten[0].monatsabschluss).toEqual({});
    const spaet = await anfrage("stempeln", { token: await token("a2", raum), rumpf: { art: "start", clientEventId: ID(1), offline: true,
      erfasstAm: "2026-10-30T04:58:00.000Z", gesendetAm: JETZT } });
    expect(spaet.status, spaet.roh).toBe(200);
    expect((await mandant(raum)).einstempeln["a2|2026-10-30"].ereignisStart).toBe(ID(1));

    /* Ist ändern (Leitung, PUT mit ETag) */
    const g = await anfrage("bestand", { methode: "GET", token: tL1 });
    const b = JSON.parse(JSON.stringify(g.bestand));
    delete b.mandanten[0].abweichungen["a1|2026-10-31"];
    delete b.mandanten[0].erfassung["a1|2026-10-31"];
    const tBeginner = beginner === "l1" ? tL1 : tL2;
    const gB = await anfrage("bestand", { methode: "GET", token: tBeginner });
    const bB = JSON.parse(JSON.stringify(gB.bestand));
    delete bB.mandanten[0].abweichungen["a1|2026-10-31"];
    delete bB.mandanten[0].erfassung["a1|2026-10-31"];
    const put = await anfrage("bestand", { methode: "PUT", token: tBeginner, rumpf: { bestand: bB, etag: gB.etag } });
    expect(put.status, put.roh).toBe(200);
    void b; void g;
    /* offener Stempel von a2 (nur Beginn) sperrt den Abschluss, bis er geklärt ist; hier ausdrücklich */
    const tPlan = tP;
    const ohneFreigabe = await abschlussPost(tPlan, { aktion: "abschliessen", trotzPrueffaellen: true });
    expect([ohneFreigabe.status, ohneFreigabe.code]).toEqual([409, KORREKTUR_FREIGABE_ERFORDERLICH]);
    expect(ohneFreigabe.differenz.n).toBeGreaterThan(0);
    /* Freigabe: Beginner 403, Planung 403, zweite Leitung ohne/mit falscher/richtiger Differenz */
    const frei = (t, extra = {}) => abschlussPost(t, { aktion: "korrektur-freigeben", ...extra });
    expect([(await frei(beginner === "l1" ? tL1 : tL2)).status]).toEqual([403]);
    expect((await frei(tP)).status).toBe(403);
    expect((await frei(tA)).status).toBe(403);
    const vorschau = await frei(zweite);
    expect([vorschau.status, vorschau.code]).toEqual([409, KORREKTUR_DIFFERENZ_FEHLT]);
    expect((await frei(zweite, { differenz: "1".repeat(32) })).status).toBe(409);
    const ok = await frei(zweite, { differenz: vorschau.differenz.abdruck });
    expect(ok.status, ok.roh).toBe(200);
    expect(ok.eintrag.korrektur.freigabe.wer.personId).toBe(beginner === "l1" ? "l2" : "l1");
    /* Abschluss der Revision durch die Planung (staff.edit), mit Freigabe */
    const zu2 = await abschlussPost(tPlan, { aktion: "abschliessen", trotzPrueffaellen: true });
    expect(zu2.status, zu2.roh).toBe(200);
    expect(zu2.eintrag).toMatchObject({ abgeschlossen: true, revision: 2 });
    expect(zu2.eintrag.korrektur.differenz.n).toBeGreaterThan(0);

    /* Korrekturexport bestätigen */
    const sicht2 = (await anfrage("bestand", { methode: "GET", token: tL1 })).bestand.mandanten[0];
    expect(FL.datevSaetze(sicht2, OKT).every((x) => /^Korrektur R2 zu R1/.test(x.bezeichnung))).toBe(true);
    const ex2 = await abschlussPost(tL1, { aktion: "lohnexport", ...FL.lohnexportStand(sicht2, OKT), ...TROTZ });
    expect(ex2.status, ex2.roh).toBe(200);
    expect(ex2.ereignis).toMatchObject({ revision: 2, korrekturZu: 1 });
    /* danach gesperrt wie Revision 1; ein später Stempel wird mit Hinweis abgewiesen */
    const w2 = await abschlussPost(tL1, { aktion: "wiederoeffnen", grund: "Noch einmal ändern bitte" });
    expect(w2.code).toBe(KORREKTUR_ERFORDERLICH);
    const abgew = await anfrage("stempeln", { token: await token("a1", raum), rumpf: { art: "start", clientEventId: ID(2), offline: true,
      erfasstAm: "2026-10-29T04:58:00.000Z", gesendetAm: JETZT } });
    expect([abgew.status, abgew.code, abgew.lohnexportiert]).toEqual([409, "MONAT_ABGESCHLOSSEN", true]);
    const fin = await mandant(raum);
    expect(fin.monatsabschluss[OKT].abgewiesen).toEqual([expect.objectContaining({ personId: "a1", datum: "2026-10-29" })]);
    expect(fin.monatsabschluss[OKT].revisionen[0]).toMatchObject({ revision: 1, lohnexport: expect.objectContaining({ revision: 1 }) });
    /* ein PUT kann Abschluss und Revisionen nicht verändern */
    const g3 = await anfrage("bestand", { methode: "GET", token: tL1 });
    const b3 = JSON.parse(JSON.stringify(g3.bestand));
    b3.mandanten[0].monatsabschluss[OKT].revisionen = [];
    b3.mandanten[0].monatsabschluss[OKT].revision = 1;
    const put3 = await anfrage("bestand", { methode: "PUT", token: tL1, rumpf: { bestand: b3, etag: g3.etag } });
    expect([200, 403, 409]).toContain(put3.status);
    expect((await mandant(raum)).monatsabschluss[OKT].revisionen).toHaveLength(1);
    expect((await mandant(raum)).monatsabschluss[OKT].revision).toBe(2);
    /* Spur: nur Monat, Kennung, Zahlen — kein Grund */
    const { getStore } = await import("../server/lib/ablage.mjs");
    const sp = getStore({ name: "centric-spur" });
    const zeilen = [];
    const { blobs } = await sp.list({ prefix: "2026-11-05/schreiben/" });
    for (const bl of blobs) zeilen.push(await sp.get(bl.key, { type: "json" }));
    const kor = zeilen.filter((z) => z.ausgang === "erfolg" && /Korrektur (begonnen|freigegeben)/.test(z.zusatz || ""));
    expect(kor.length).toBe(2);
    for (const z of kor) expect(z.zusatz).not.toMatch(/Samstagsdienst|\d{4}-\d{2}-\d{2}/);
  });
});

describe("Review-Befunde 1–3, 5, 6: Umgehung, Person, Autoren, Differenzzeilen, Basis", { timeout: 180000 }, () => {
  it("1 (kritisch): vorschau im Rumpf schließt die Revision nicht — Planung, Leitung allein und Leitung mit vorschau bleiben bei 409; interne Schalter sind nicht von außen setzbar", async () => {
    const raum = "wp16c-bypass";
    await B.bestandSchreiben(laden(), raum, { version: VERSION, mandanten: [betrieb()] }, { durch: "Pruefung" });
    const [tL1, tP] = [await token("l1", raum), await token("p1", raum)];
    expect((await abschlussPost(tL1, { aktion: "abschliessen" })).status).toBe(200);
    const sicht = (await anfrage("bestand", { methode: "GET", token: tL1 })).bestand.mandanten[0];
    expect((await abschlussPost(tL1, { aktion: "lohnexport", ...FL.lohnexportStand(sicht, OKT), ...TROTZ })).status).toBe(200);
    expect((await abschlussPost(tL1, { aktion: "korrektur-beginnen", anlass: "fehler", grund: "Samstagsdienst war nicht geleistet" })).status).toBe(200);
    const g = await anfrage("bestand", { methode: "GET", token: tL1 });
    const b = JSON.parse(JSON.stringify(g.bestand));
    delete b.mandanten[0].abweichungen["a1|2026-10-31"];
    delete b.mandanten[0].erfassung["a1|2026-10-31"];
    expect((await anfrage("bestand", { methode: "PUT", token: tL1, rumpf: { bestand: b, etag: g.etag } })).status).toBe(200);
    for (const [t, extra] of [[tP, { vorschau: true }], [tL1, {}], [tL1, { vorschau: true }], [tP, { vorschau: "true", opt: { vorschau: true }, freigabe: { differenz: "x" } }]]) {
      const z = await abschlussPost(t, { aktion: "abschliessen", trotzPrueffaellen: true, ...extra });
      expect([z.status, z.code]).toEqual([409, KORREKTUR_FREIGABE_ERFORDERLICH]);
      expect(z.differenz.zeilen).toBeUndefined();                              // der Abschluss liefert nur Zahlen
    }
    expect((await mandant(raum)).monatsabschluss[OKT]).toMatchObject({ abgeschlossen: false, revision: 2 });
  });
  it("2: Beginn ohne Personenkennung (Leitungs-Code ohne Person) wird abgewiesen; mit Person geht es", async () => {
    const raum = "wp16c-ohneperson";
    await B.bestandSchreiben(laden(), raum, { version: VERSION, mandanten: [exportiert(zu(betrieb()))] }, { durch: "Pruefung" });
    const tOhne = (await sitzungAnlegen({ bestand: raum, name: "Code", rolle: "leitung", person: null, betrieb: 0, mandantId: "m1", einheit: null }, 3600000)).token;
    const r = await abschlussPost(tOhne, { aktion: "korrektur-beginnen", anlass: "fehler", grund: "Samstagsdienst war nicht geleistet" });
    expect([r.status, r.code]).toEqual([403, "KORREKTUR_PERSON_NOETIG"]);
    expect((await mandant(raum)).monatsabschluss[OKT].abgeschlossen).toBe(true);
    const m = exportiert(zu(betrieb()));
    expect(beginnen(m, {}, { personId: null, rolle: "leitung" }).code).toBe("KORREKTUR_PERSON_NOETIG");
    expect(beginnen(m, {}, { rolle: "leitung" }).status).toBe(403);
  });
  it("3: wer die Änderungen gemacht hat (PUT oder Stempelkorrektur), gibt sie nicht frei; eine dritte Person darf", async () => {
    const raum = "wp16c-autoren";
    await B.bestandSchreiben(laden(), raum, { version: VERSION, mandanten: [betrieb()] }, { durch: "Pruefung" });
    const [tL1, tL2, tL3] = [await token("l1", raum), await token("l2", raum), await token("l3", raum)];
    expect((await abschlussPost(tL1, { aktion: "abschliessen" })).status).toBe(200);
    const sicht = (await anfrage("bestand", { methode: "GET", token: tL1 })).bestand.mandanten[0];
    expect((await abschlussPost(tL1, { aktion: "lohnexport", ...FL.lohnexportStand(sicht, OKT), ...TROTZ })).status).toBe(200);
    expect((await abschlussPost(tL1, { aktion: "korrektur-beginnen", anlass: "fehler", grund: "Samstagsdienst war nicht geleistet" })).status).toBe(200);
    /* L2 ändert die Zeiten selbst … */
    const g = await anfrage("bestand", { methode: "GET", token: tL2 });
    const b = JSON.parse(JSON.stringify(g.bestand));
    delete b.mandanten[0].abweichungen["a1|2026-10-31"];
    delete b.mandanten[0].erfassung["a1|2026-10-31"];
    expect((await anfrage("bestand", { methode: "PUT", token: tL2, rumpf: { bestand: b, etag: g.etag } })).status).toBe(200);
    expect((await mandant(raum)).monatsabschluss[OKT].korrektur.autoren).toEqual(["l2"]);
    /* … und gibt die eigene Änderung nicht frei */
    const frei = (t, extra = {}) => abschlussPost(t, { aktion: "korrektur-freigeben", ...extra });
    const eigene = await frei(tL2);
    expect([eigene.status, eigene.code]).toEqual([403, "KORREKTUR_ZWEITE_PERSON"]);
    expect((await frei(tL1)).status).toBe(403);                                    // Beginner
    const vorschau = await frei(tL3);
    expect([vorschau.status, vorschau.code]).toEqual([409, KORREKTUR_DIFFERENZ_FEHLT]);
    /* 5: die Freigabe sieht die Differenzzeilen */
    expect(vorschau.differenz.zeilen.length).toBe(vorschau.differenz.n);
    expect(vorschau.differenz.zeilen[0]).toMatchObject({ personalnummer: "P5", stunden: -8 });
    expect(vorschau.differenz.zeilen[0].bezeichnung).toMatch(/^Korrektur R2 zu R1/);
    expect((await frei(await token("a1", raum))).status).toBe(403);               // andere Rollen sehen sie nie
    expect((await frei(await token("p1", raum))).status).toBe(403);
    const ok = await frei(tL3, { differenz: vorschau.differenz.abdruck });
    expect(ok.status, ok.roh).toBe(200);
    expect(ok.differenz.zeilen.length).toBe(ok.differenz.n);
    expect((await mandant(raum)).monatsabschluss[OKT].korrektur.freigabe).not.toHaveProperty("zeilen");
  });
  it("3 (Stempelkorrektur): Autor eines Korrekturereignisses seit Beginn gibt nicht frei (Bibliothek)", () => {
    const m = exportiert(zu(betrieb()));
    let g = mitKorrektur(beginnen(m).mandant);
    const e = g.monatsabschluss[OKT];
    g = { ...g, einstempeln: { "a1|2026-10-05": { start: "06:00", ende: "14:00", korrekturen: [{ id: "k1", wann: new Date(Date.parse(JETZT) + 1000).toISOString(), wer: { personId: "l2" } }] } } };
    void e;
    const r = korrekturFreigeben(g, { monat: OKT }, WER_L2, new Date(JETZT), "kf", "2026-11-05");
    expect([r.status, r.code]).toEqual([403, "KORREKTUR_ZWEITE_PERSON"]);
    expect(korrekturFreigeben(g, { monat: OKT }, { personId: "l3", rolle: "leitung" }, new Date(JETZT), "kf", "2026-11-05").code).toBe(KORREKTUR_DIFFERENZ_FEHLT);
  });
});
