/* ==========================================================================
   MONATSABSCHLUSS — NACHTRAG VIERTER OPUS-DELTA-REVIEW (WP-16)

   A-1  Vormonat wiederöffnet und neu abgeschlossen: Der Folgemonat sagt es
        (`vs` im Verzeichnis, datevHinweise.vormonatGeaendert), der
        Lohnexport ist 409 VORMONAT_GEAENDERT / VORMONAT_OFFEN — überstimmbar
        nur ausdrücklich (trotzVormonat + Kategorie + Begründung),
        protokolliert im Verlauf; die Spur nennt nur die Kategorie.
   A-2  Die Rückfrage vor dem Bestätigen nennt die Vormonate; speicher.js
        überträgt die Überstimmung. Abschließen bleibt erlaubt (gekennzeichnet).
   A-3  Bestätigte Zeilen-Prüfsumme wird verglichen (Anonymisierung,
        Softwarestand); gelöschter Freeze eines bestätigten Monats heißt
        „nach Frist gelöscht“, nicht „wiederöffnen und erneut abschließen“.
   A-4  Übertrag ohne Jahresbezug: nur Hinweis, nichts umgerechnet.
   A-5  Austritt im Monat: Hinweis „ausgetreten – Zeilen nicht ausgegeben“,
        Verhalten unverändert (offene Entscheidung).
   A-6  Mehrarbeit (Lohnart 1200) als Kontostand bezeichnet.
   N-1  Bereitschaft/Ruf aus dem Ist (Sommerzeit, erfasste Zeit), Rechenstand 2.
   N-2  Zeilen-Prüfsumme unabhängig von der Reihenfolge (sortiert wie die Datei).
   N-3  Prüfungen gegen die überlebenden Mutanten U1, U3, U4, U5, U8, U10;
        Vergleich offen = Schema 1 = Schema 3 mit Bereitschaft/Ruf, Austritt
        im Monat und ungeplanter bezahlter Abwesenheit.
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { appQuelle } from "./app-quelle.js";
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
let wurzel, laden, daten, B, sitzungAnlegen, A;

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-wp16-nachtrag4-"));
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

let nrAbschluss = 0;
const zu = (m, monat = OKT, heute = "2026-11-05", jetzt = JETZT) => {
  nrAbschluss += 1;
  const r = MA.abschliessen(m, { monat, trotzPrueffaellen: true }, WER_L, new Date(jetzt), `ma-${monat}-${nrAbschluss}`, heute);
  if ("status" in r) throw new Error(r.grund);
  return r.mandant;
};
const auf = (m, monat = OKT) => {
  nrAbschluss += 1;
  const r = MA.wiederoeffnen(m, { monat, grund: "Gegenprobe nach dem Wiederöffnen" }, WER_L, new Date(JETZT), `w-${monat}-${nrAbschluss}`);
  if ("status" in r) throw new Error(r.grund);
  return r.mandant;
};
const standVon = (m, monat = OKT) => (typeof A.lohnexportStand === "function" ? A.lohnexportStand(m, monat) : {});
const exportieren = (m, monat = OKT, extra = {}) =>
  MA.lohnexportBestaetigen(m, { monat, ...(standVon(m, monat) || {}), ...extra }, WER_L, new Date(JETZT), `le-${monat}-${++nrAbschluss}`);
const TROTZ = { trotzVormonat: true, vormonatKategorie: "vor_inbetriebnahme", vormonatGrund: "Vormonate ohne Zeitdaten vor dem Start" };
const exportiert = (m, monat = OKT, extra = {}) => {
  const r = exportieren(m, monat, extra);
  if ("status" in r) throw new Error(r.grund);
  return r.mandant;
};
const leer = () => ({ start: null, ende: null, bestaetigt: true, grund: "" });

/** Vier Personen in e1, Dienste über Abweichungen, alle Ist-Zeiten bestätigt (wie im dritten Nachtrag). */
function betrieb() {
  const m = A.leererMandant("Nachtrag4", "pflege");
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
    for (const t of ["07", "08"]) m.abweichungen[`${p.id}|2026-09-${t}`] = "F";
    for (const k of Object.keys(m.abweichungen)) if (k.startsWith(`${p.id}|`)) m.erfassung[k] = leer();
  }
  m.einstempeln = {}; m.abwesenheiten = []; m.anfragen = []; m.monatsabschluss = {};
  m.lohnarten = undefined;
  return m;
}
/** Dazu Bereitschaft in der Nacht der Zeitumstellung (24./25.10., 10 h), Rufbereitschaft mit erfasster Zeit. */
function mitBereitschaft() {
  const m = betrieb();
  const basis = m.dienstarten[1];
  const BD = { ...basis, id: "B", name: "Bereitschaft", kurz: "B", start: "21:00", ende: "06:00", pause: 0, form: "bereitschaft" };
  const RB = { ...basis, id: "R", name: "Rufbereitschaft", kurz: "R", start: "18:00", ende: "06:00", pause: 0, form: "ruf", rufbereitschaft: true, faktor: 0.125 };
  m.dienstarten = [...m.dienstarten, BD, RB];
  m.abweichungen["a1|2026-10-24"] = "B"; m.erfassung["a1|2026-10-24"] = leer();
  m.abweichungen["a1|2026-10-10"] = "R"; m.erfassung["a1|2026-10-10"] = { start: "20:00", ende: "06:00", bestaetigt: true, grund: "" };
  return m;
}
const p = (m, id) => m.personen.find((x) => x.id === id);
const VOR_SEP = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08"];
const JAHR = [...VOR_SEP, SEP, OKT];
const zuAlle = (m) => JAHR.reduce((x, mon) => zu(x, mon), m);

/* ------------------------------------------------------------------------ */
describe("A-1: Vormonat wiederöffnet und neu abgeschlossen — Folgemonat gekennzeichnet, Lohnexport nur ausdrücklich", { timeout: 120000 }, () => {
  it("Jan–Sep zu, Okt zu, Sep wiederöffnet, geändert, neu zu → Hinweis, 409 VORMONAT_GEAENDERT; Überstimmung nur mit Kategorie und Begründung, protokolliert", () => {
    let m = zuAlle(betrieb());
    const vs = m.istEingefroren[`*|${OKT}`].vs;
    expect(Object.keys(vs || {}).sort()).toEqual(JAHR.slice(0, 9));
    for (const mon of JAHR.slice(0, 9)) expect(vs[mon], mon).toBe(m.monatsabschluss[mon].stand);
    expect(IE.datevHinweise(m, OKT)).toMatchObject({ vormonateOffen: [], vormonatGeaendert: [] });
    const vorher = A.datevSaetze(m, OKT);
    m = auf(m, SEP);
    m = { ...m, abweichungen: { ...m.abweichungen, "a1|2026-09-10": "F", "a1|2026-09-11": "F" },
      erfassung: { ...m.erfassung, "a1|2026-09-10": leer(), "a1|2026-09-11": leer() } };
    m = zu(m, SEP);
    /* Der Oktober bleibt, wie er abgeschlossen wurde (kein stilles Umrechnen) — aber er sagt es. */
    expect(A.datevSaetze(m, OKT)).toEqual(vorher);
    const h = IE.datevHinweise(m, OKT);
    expect(h.vormonatGeaendert).toEqual([SEP]);
    expect(h.vormonateOffen).toEqual([]);
    expect(A.lohnausgabeText(m, OKT)).toMatch(/Vormonat nach dem Abschluss geändert \(September 2026\)/);
    expect(A.freezeZeilen(m, OKT).join("\n")).toMatch(/Vormonat nach dem Abschluss geändert/);
    const r = exportieren(m);
    expect(r.status).toBe(409);
    expect(r.code).toBe("VORMONAT_GEAENDERT");
    expect(r.vormonate).toEqual({ offen: [], geaendert: [SEP] });
    /* Überstimmen: ausdrücklich, mit Kategorie aus der Liste und Begründung (begrenzt). */
    expect(exportieren(m, OKT, { trotzVormonat: true }).status).toBe(422);
    expect(exportieren(m, OKT, { ...TROTZ, vormonatKategorie: "irgendwas" }).status).toBe(422);
    expect(exportieren(m, OKT, { ...TROTZ, vormonatGrund: "kurz" }).status).toBe(422);
    expect(exportieren(m, OKT, { ...TROTZ, vormonatGrund: "x".repeat(MA.ABSCHLUSS_GRUND_MAX + 1) }).status).toBe(422);
    expect(exportieren(m, OKT, { trotzVormonat: "ja", vormonatKategorie: "abgestimmt", vormonatGrund: "mit dem Lohnbüro abgestimmt" }).status).toBe(409);
    const ok = exportieren(m, OKT, { trotzVormonat: true, vormonatKategorie: "abgestimmt", vormonatGrund: "Mit dem Lohnbüro abgestimmt, Ausgleich im November" });
    expect("status" in ok, ok.grund).toBe(false);
    expect(ok.ereignis).toMatchObject({ art: "lohnexport", grund: "Mit dem Lohnbüro abgestimmt, Ausgleich im November",
      trotzVormonat: { kategorie: "abgestimmt", offen: [], geaendert: [SEP] } });
    expect(ok.eintrag.lohnexport.trotzVormonat).toEqual({ kategorie: "abgestimmt", offen: [], geaendert: [SEP] });
    expect(ok.eintrag.verlauf.at(-1)).toEqual(ok.ereignis);
  });
  it("U3: Vormonat beim Abschluss zu, heute wieder offen → „Vormonat offen“, 409 VORMONAT_OFFEN", () => {
    const m = auf(zuAlle(betrieb()), SEP);
    const h = IE.datevHinweise(m, OKT);
    expect(h.vormonateOffen).toEqual([SEP]);
    expect(h.vormonatGeaendert).toEqual([]);
    const r = exportieren(m);
    expect(r.status).toBe(409);
    expect(r.code).toBe("VORMONAT_OFFEN");
    expect(r.vormonate).toEqual({ offen: [SEP], geaendert: [] });
  });
  it("Nur Oktober abgeschlossen: Abschluss erlaubt (gekennzeichnet), Lohnexport 409 VORMONAT_OFFEN; mit Überstimmung bestätigt", () => {
    const m = zu(betrieb());
    expect(m.istEingefroren[`*|${OKT}`].vo).toEqual(JAHR.slice(0, 9));
    expect(m.istEingefroren[`*|${OKT}`].vs).toBeUndefined();
    const r = exportieren(m);
    expect(r.code).toBe("VORMONAT_OFFEN");
    expect(r.vormonate.offen).toEqual(JAHR.slice(0, 9));
    /* Prüfreihenfolge: der gebundene Stand zuerst — ohne Datei bleibt es EXPORTSTAND_FEHLT. */
    expect(MA.lohnexportBestaetigen(m, { monat: OKT, ...TROTZ }, WER_L, new Date(JETZT), "le-x").code).toBe("EXPORTSTAND_FEHLT");
    const ok = exportieren(m, OKT, TROTZ);
    expect("status" in ok, ok.grund).toBe(false);
    expect(ok.eintrag.lohnexport.trotzVormonat).toMatchObject({ kategorie: "vor_inbetriebnahme", offen: JAHR.slice(0, 9) });
  });
});

/* ------------------------------------------------------------------------ */
describe("A-2: Rückfrage nennt die Vormonate, Oberfläche überträgt die Überstimmung", { timeout: 120000 }, () => {
  it("lohnexportRueckfrage nennt offene und geänderte Vormonate; ohne beides keine Begründung nötig", () => {
    let m = zuAlle(betrieb());
    expect(A.lohnexportRueckfrage(m, OKT).vormonate).toBe(false);
    m = zu(auf(m, SEP), SEP);
    const r = A.lohnexportRueckfrage(m, OKT);
    expect(r.vormonate).toBe(true);
    expect(r.text).toMatch(/September 2026/);
    expect(r.text).toMatch(/geändert/);
    const o = A.lohnexportRueckfrage(zu(betrieb()), OKT);
    expect(o.vormonate).toBe(true);
    expect(o.text).toMatch(/offen/);
    expect(A.VORMONAT_KATEGORIEN.map((k) => k.id).sort()).toEqual(Object.keys(MA.VORMONAT_KATEGORIEN).sort());
  });
  it("Oberfläche: Bestätigen schickt die Überstimmung; speicher.js überträgt sie; Fehler tragen die Vormonate", async () => {
    const app = appQuelle();
    expect(app).toMatch(/SP\.monatsabschluss\("lohnexport", monat, \{ exportStand, trotzVormonat \}\)/);
    const sp = await readFile(path.join(process.cwd(), "src/speicher.js"), "utf8");
    expect(sp).toMatch(/trotzVormonat: true, vormonatKategorie: trotzVormonat\.kategorie, vormonatGrund: trotzVormonat\.grund/);
    expect(sp).toMatch(/f\.vormonate = d\.vormonate \|\| null/);
  });
});

/* ------------------------------------------------------------------------
   Gegen die Serverfunktion
   ------------------------------------------------------------------------ */
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
const spurZeilen = async () => {
  const { getStore } = await import("../server/lib/ablage.mjs");
  const spur = getStore({ name: "centric-spur" });
  const zeilen = [];
  const { blobs } = await spur.list({ prefix: "2026-11-05/schreiben/" });
  for (const b of blobs) zeilen.push(await spur.get(b.key, { type: "json" }));
  return zeilen;
};

describe("A-1 (Server): 409 mit Vormonaten, Überstimmung über die Schnittstelle, Spur ohne Freitext", { timeout: 120000 }, () => {
  it("offene Vormonate → 409 VORMONAT_OFFEN mit Liste; mit Überstimmung 200; Spur nennt nur die Kategorie", async () => {
    const raum = "wp16n4-vormonat";
    await B.bestandSchreiben(laden(), raum, { version: 9, mandanten: [serverBetrieb()] }, { durch: "Pruefung" });
    const tL = await token("l1", raum);
    expect((await anfrage("monatsabschluss", { token: tL, rumpf: { aktion: "abschliessen", monat: OKT, trotzPrueffaellen: true } })).status).toBe(200);
    const sicht = (await anfrage("bestand", { methode: "GET", token: tL })).bestand.mandanten[0];
    const stand = standVon(sicht);
    const r = await anfrage("monatsabschluss", { token: tL, rumpf: { aktion: "lohnexport", monat: OKT, ...stand } });
    expect(r.status, r.roh).toBe(409);
    expect(r.code).toBe("VORMONAT_OFFEN");
    expect(r.vormonate.offen).toContain(SEP);
    const ok = await anfrage("monatsabschluss", { token: tL, rumpf: { aktion: "lohnexport", monat: OKT, ...stand,
      trotzVormonat: true, vormonatKategorie: "sonstiges", vormonatGrund: "Freitext Muster geheim 4711 bleibt im Verlauf" } });
    expect(ok.status, ok.roh).toBe(200);
    expect(ok.eintrag.verlauf.at(-1)).toMatchObject({ art: "lohnexport", grund: "Freitext Muster geheim 4711 bleibt im Verlauf",
      trotzVormonat: { kategorie: "sonstiges" } });
    const sp = (await spurZeilen()).filter((x) => /lohnexport/i.test(x.zusatz || ""));
    expect(sp.some((x) => x.ausgang === "abgewiesen")).toBe(true);
    const erfolg = sp.filter((x) => x.ausgang === "erfolg");
    expect(erfolg.length).toBe(1);
    expect(erfolg[0].zusatz).toMatch(/^Monatsabschluss 2026-10 Lohnexport bestätigt ma-[0-9a-f]+ · Revision 1 · trotz Vormonat \(sonstiges\)$/);
    expect(JSON.stringify(sp)).not.toMatch(/geheim|4711|Muster/);
  });
});

/* ------------------------------------------------------------------------ */
describe("A-3: bestätigte Zeilen-Prüfsumme verglichen; gelöschter Freeze heißt „nach Frist gelöscht“", { timeout: 120000 }, () => {
  it("Löschlauf nach bestätigtem Export: Anonymisierung → „weicht von der bestätigten Ausgabe ab“; Freeze gelöscht → Status „geloescht“, kein „wiederöffnen“", async () => {
    const AUF = await import("../server/lib/aufbewahrung.mjs");
    let m = exportiert(zuAlle(betrieb()));
    expect(MA.lohnexportVergleich(m, OKT, A.datevSaetze(m, OKT))).toMatchObject({ status: "gleich" });
    expect(A.freezeZeilen(m, OKT).join("\n")).not.toMatch(/bestätigten Ausgabe/);
    m = { ...m, personen: m.personen.map((x) => (x.id === "a1" ? { ...x, austritt: "2026-10-31" } : x)) };
    const anonym = AUF.raeumen(m, "2027-06-01").mandant;
    expect(anonym.personen.find((x) => x.id === "a1").anonym).toBe(true);
    expect(MA.lohnexportVergleich(anonym, OKT, A.datevSaetze(anonym, OKT))).toMatchObject({ status: "abweichend",
      bestaetigt: m.monatsabschluss[OKT].lohnexport.zeilen });
    expect(A.freezeZeilen(anonym, OKT).join("\n")).toMatch(/weicht von der bestätigten Ausgabe ab \(Anonymisierung\/Softwarestand\)/);
    expect(A.lohnausgabeText(anonym, OKT)).toMatch(/weicht von der bestätigten Ausgabe ab/);
    const weg = AUF.raeumen(m, "2031-01-01").mandant;
    expect(IE.freezeStatus(weg, OKT)).toMatchObject({ unbekannt: true, grund: "geloescht" });
    expect(IE.datevHinweise(weg, OKT)).toMatchObject({ unbekannt: true, geloescht: true });
    expect(MA.lohnexportVergleich(weg, OKT, A.datevSaetze(weg, OKT))).toMatchObject({ status: "geloescht" });
    const t = A.lohnausgabeText(weg, OKT);
    expect(t).toMatch(/nach Frist gelöscht/);
    expect(t).not.toMatch(/wiederöffnen und erneut abschließen/);
    expect(A.freezeZeilen(weg, OKT).join("\n")).not.toMatch(/wiederöffnen/i);
    expect(IE.abschlussLueckeText(weg, OKT)).toMatch(/nach Frist gelöscht/);
    /* Nicht bestätigter Monat ohne Verzeichnis bleibt der Prüffall „verzeichnis“ (fail-closed, wie bisher). */
    const ohne = { ...m, monatsabschluss: { ...m.monatsabschluss, [OKT]: { ...m.monatsabschluss[OKT], lohnexport: undefined } } };
    const ohneWeg = AUF.raeumen(ohne, "2031-01-01").mandant;
    expect(IE.freezeStatus(ohneWeg, OKT)).toMatchObject({ unbekannt: true, grund: "verzeichnis" });
  });
  it("Softwarestand simuliert: eine Zeile anders gerechnet → abweichend; Monatsabschluss-Ansicht nennt es", () => {
    const m = exportiert(zuAlle(betrieb()));
    const anders = A.datevSaetze(m, OKT).map((z, i) => (i === 0 ? { ...z, stunden: z.stunden + 1 } : z));
    expect(MA.lohnexportVergleich(m, OKT, anders)).toMatchObject({ status: "abweichend" });
    expect(MA.lohnexportVergleich(zu(betrieb()), OKT, [])).toBeNull();
  });
});

/* ------------------------------------------------------------------------ */
describe("A-4: Übertrag ohne Jahresbezug — nur Hinweis, nichts umgerechnet", { timeout: 120000 }, () => {
  it("R6: Dezember im Januar abgeschlossen, Übertrag schon fürs neue Jahr gepflegt → Konto wie gerechnet, Hinweis auf den Jahreswechsel", () => {
    const m0 = betrieb();
    for (const q of m0.personen) { m0.abweichungen[`${q.id}|2026-12-07`] = "F"; m0.erfassung[`${q.id}|2026-12-07`] = leer(); }
    const m1 = { ...m0, personen: m0.personen.map((x) => ({ ...x, stundenuebertrag: 999 })) };
    const r1 = zu(m0, "2026-12", "2027-01-05", "2027-01-05T09:00:00Z");
    const r2 = zu(m1, "2026-12", "2027-01-05", "2027-01-05T09:00:00Z");
    expect(r2.istEingefroren["a1|2026-12"].k).toBe(Math.round((r1.istEingefroren["a1|2026-12"].k + 499) * 10) / 10);
    expect(IE.datevHinweise(r2, "2026-12").uebertragJahreswechsel).toBe(true);
    expect(A.lohnausgabeText(r2, "2026-12")).toMatch(/Übertrag ohne Jahresbezug/);
    /* Im laufenden Jahr abgeschlossen: kein Hinweis. */
    expect(IE.datevHinweise(zu(betrieb()), OKT).uebertragJahreswechsel).toBe(false);
  });
  it("Übertrag zwischen zwei Abschlüssen des Jahres geändert → Hinweis mit altem und neuem Wert", () => {
    let m = zu(betrieb(), SEP);
    m = { ...m, personen: m.personen.map((x) => (x.id === "a1" ? { ...x, stundenuebertrag: 550 } : x)) };
    m = zu(m, OKT);
    const h = IE.datevHinweise(m, OKT);
    expect(h.uebertragGeaendert).toEqual([expect.objectContaining({ personId: "a1", ue: 550, vorher: 500, seit: SEP })]);
    expect(A.lohnausgabeText(m, OKT)).toMatch(/Übertrag seit September 2026 geändert/);
    expect(A.lohnausgabeText(m, OKT)).toMatch(/A1, V \(P1\): 500 → 550/);
  });
});

/* ------------------------------------------------------------------------ */
describe("A-5 / U4: Austritt im Monat — keine Zeilen (unverändert), aber ausdrücklich gesagt", { timeout: 120000 }, () => {
  it("R2: Austritt am 15.10. → offen und abgeschlossen keine Zeilen für P2, Hinweis „ausgetreten – Zeilen nicht ausgegeben“", () => {
    const m0 = betrieb();
    p(m0, "a2").austritt = "2026-10-15";
    expect(A.datevSaetze(m0, OKT).filter((z) => z.personalnummer === "P2")).toEqual([]);
    expect(A.lohnausgabeText(m0, OKT)).toMatch(/ausgetreten – Zeilen nicht ausgegeben/);
    expect(A.lohnausgabeText(m0, OKT)).toMatch(/A2, V \(P2\), Austritt 15\.10\.2026/);
    const m = zu(m0);
    expect(m.istEingefroren[`a2|${OKT}`].i).toBe(0);
    expect(m.istEingefroren[`a2|${OKT}`].k).toBeGreaterThan(0);
    expect(IE.datevAusFreeze(m, OKT).filter((z) => z.personalnummer === "P2")).toEqual([]);
    expect(A.datevSaetze(m, OKT).filter((z) => z.personalnummer === "P2")).toEqual([]);
    expect(IE.datevHinweise(m, OKT).ausgetreten).toEqual([expect.objectContaining({ personId: "a2", personalnummer: "P2", austritt: "2026-10-15" })]);
    expect(A.lohnausgabeText(m, OKT)).toMatch(/ausgetreten – Zeilen nicht ausgegeben/);
    /* Personalstamm später ohne a2: der Hinweis kommt aus dem Freeze. */
    const x = { ...m, personen: m.personen.filter((q) => q.id !== "a2") };
    expect(IE.datevHinweise(x, OKT).ausgetreten).toEqual([expect.objectContaining({ personId: "a2", personalnummer: "P2" })]);
  });
});

/* ------------------------------------------------------------------------ */
describe("A-6: Mehrarbeit als Kontostand bezeichnet", { timeout: 120000 }, () => {
  it("Blatt zum Gegenlesen und Lohnausgabe nennen Lohnart 1200 „Kontostand“ und erklären es; die Datei bleibt im Format", () => {
    const m = zuAlle(betrieb());
    const t = A.lohnausgabeText(m, OKT);
    expect(t).toMatch(/1200 {6}Mehrarbeit \(Kontostand\)/);
    expect(t).toMatch(/Stand des Stundenkontos zum Monatsende/);
    expect(A.datevCSV(m, OKT)).toMatch(/;1200;Mehrarbeit;/);
    expect(A.mehrarbeitNr(m, OKT)).toBe("1200");
    expect(A.mehrarbeitNr({ ...betrieb(), lohnarten: { mehrarbeit: { nr: "2200", text: "MA" } } }, "2026-11")).toBe("2200");
  });
});

/* ------------------------------------------------------------------------ */
describe("N-1 / U10: Bereitschaft und Ruf aus dem Ist (Sommerzeit, erfasste Zeit)", { timeout: 120000 }, () => {
  it("R5: Bereitschaft 21–06 in der Nacht 24./25.10. = 10 h, Ruf erfasst 20–06 = 10 h (geplant 12); offen = eingefroren; Rechenstand 2", async () => {
    const L = await import("../server/lib/lohnrechnung.mjs");
    expect(L.RECHEN_STAND).toBe(2);
    const roh = mitBereitschaft();
    const m = zu(roh);
    expect(m.istEingefroren["a1|2026-10-24"].std).toBe(10);
    expect(m.istEingefroren[`a1|${OKT}`].br).toEqual([10, 10]);
    const zeilen = (x) => A.datevSaetze(x, OKT).filter((z) => z.personalnummer === "P1" && ["1500", "1510"].includes(z.lohnart));
    expect(zeilen(m).map((z) => [z.lohnart, z.stunden])).toEqual([["1500", 10], ["1510", 10]]);
    expect(zeilen(roh)).toEqual(zeilen(m));
    expect(m.istEingefroren[`*|${OKT}`].rv).toBe(2);
  });
});

/* ------------------------------------------------------------------------ */
describe("N-2: Zeilen-Prüfsumme unabhängig von der Reihenfolge", () => {
  it("umgekehrte oder gemischte Zeilen → dieselbe Prüfsumme; andere Stunden → andere", () => {
    const z = [
      { personalnummer: "P10", nachname: "B", vorname: "V", lohnart: "1400", bezeichnung: "N", stunden: 1, monat: OKT },
      { personalnummer: "P2", nachname: "A", vorname: "V", lohnart: "1200", bezeichnung: "M", stunden: 2, monat: OKT },
      { personalnummer: "P2", nachname: "A", vorname: "V", lohnart: "1400", bezeichnung: "N", stunden: 3, monat: OKT }];
    const a = MA.datevZeilenAbdruck(z);
    expect(MA.datevZeilenAbdruck([...z].reverse())).toBe(a);
    expect(MA.datevZeilenAbdruck([z[1], z[0], z[2]])).toBe(a);
    expect(MA.datevZeilenAbdruck([{ ...z[0], stunden: 9 }, z[1], z[2]])).not.toBe(a);
    /* Dieselbe Ordnung wie die Datei: P2 vor P10 (numerisch), darin nach Lohnart. */
    expect([...z].sort(MA.datevReihenfolge).map((x) => `${x.personalnummer}/${x.lohnart}`)).toEqual(["P2/1200", "P2/1400", "P10/1400"]);
  });
});

/* ------------------------------------------------------------------------ */
describe("N-3: Prüfungen gegen überlebende Mutanten", { timeout: 120000 }, () => {
  it("U5: bezahlte Abwesenheit ohne Plan wird nicht gutgeschrieben — eingefroren wie offen", () => {
    const roh = betrieb();
    roh.abwesenheiten = [{ id: "u1", personId: "a3", art: "urlaub", von: "2026-10-12", bis: "2026-10-14", notiz: "" },
      { id: "u2", personId: "a3", art: "urlaub", von: "2026-10-06", bis: "2026-10-06", notiz: "" }];
    const m = zu(roh);
    expect(m.istEingefroren["a3|2026-10-12"]).toMatchObject({ a: ["urlaub"] });
    expect(m.istEingefroren["a3|2026-10-12"].pl).toBeUndefined();
    expect(m.istEingefroren[`a3|${OKT}`].gg).toBe(0);
    expect(A.istStunden(m, p(m, "a3"), OKT)).toEqual(A.istStunden(roh, p(roh, "a3"), OKT));
    expect(A.stundenkonto(m, p(m, "a3"), OKT)).toBe(A.stundenkonto(roh, p(roh, "a3"), OKT));
  });
  it("U1: Schema am Abschluss widerspricht dem Verzeichnis → unbekannt, keine Zeilen, kein Lohnexport", () => {
    const m = zuAlle(betrieb());
    const x = { ...m, monatsabschluss: { ...m.monatsabschluss, [OKT]: { ...m.monatsabschluss[OKT], schema: 2 } } };
    expect(IE.freezeStatus(x, OKT)).toMatchObject({ unbekannt: true, grund: "version" });
    expect(A.datevSaetze(x, OKT)).toEqual([]);
    expect(exportieren(x).code).toBe("FREEZE_NICHT_REPRODUZIERBAR");
  });
  it("U8: Abschluss ohne Schema (Verzeichnis Schema 3) → Lohnexport nicht bestätigbar", () => {
    const m = zuAlle(betrieb());
    const { schema: _s, ...ohne } = m.monatsabschluss[OKT];
    void _s;
    const x = { ...m, monatsabschluss: { ...m.monatsabschluss, [OKT]: ohne } };
    expect(IE.freezeStatus(x, OKT)).toMatchObject({ reproduzierbar: true });
    const r = exportieren(x);
    expect(r.status).toBe(409);
    expect(r.code).toBe("FREEZE_NICHT_REPRODUZIERBAR");
  });
  it("offen = Schema 1 = Schema 3: Bereitschaft/Ruf (Sommerzeit, erfasst), Austritt im Monat, ungeplante bezahlte Abwesenheit", () => {
    const roh = mitBereitschaft();
    p(roh, "a2").austritt = "2026-10-15";
    roh.abwesenheiten = [{ id: "u1", personId: "a3", art: "urlaub", von: "2026-10-12", bis: "2026-10-14", notiz: "" }];
    const ab = { [OKT]: { abgeschlossen: true } };
    const s1 = { ...roh, monatsabschluss: ab, istEingefroren: istEinfrierenSchema1(roh, OKT) };
    const s3 = zu(roh);
    for (const q of roh.personen) {
      for (const [name, x] of [["Schema 1", s1], ["Schema 3", s3]]) {
        expect(A.istStunden(x, p(x, q.id), OKT), `${name} ${q.id}`).toEqual(A.istStunden(roh, q, OKT));
        expect(A.stundenkonto(x, p(x, q.id), OKT), `${name} ${q.id}`).toBe(A.stundenkonto(roh, q, OKT));
        expect(A.zuschlagStunden(x, p(x, q.id), OKT), `${name} ${q.id}`).toEqual(A.zuschlagStunden(roh, q, OKT));
      }
    }
    expect(A.datevSaetze(s3, OKT)).toEqual(A.datevSaetze(roh, OKT));
    expect(A.datevSaetze(s1, OKT)).toEqual(A.datevSaetze(roh, OKT));
    expect(A.datevSaetze(roh, OKT).some((z) => z.lohnart === "1500" && z.stunden === 10)).toBe(true);
    expect(A.datevSaetze(roh, OKT).some((z) => z.personalnummer === "P2")).toBe(false);
  });
});
