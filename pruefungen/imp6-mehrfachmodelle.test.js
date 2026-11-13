/* ==========================================================================
   IMP-6 Teil 2 — MEHRERE SCHICHTMODELLE JE PERSON (serverseitig, ohne Aktivierung)

   Betreiberentscheidung 2026-11-13. Geprüft wird die Bibliothek
   server/lib/schichtzuordnung.mjs rein und über den echten Handler
   (GET/PUT /api/bestand, POST /api/bestand/teile) mit Dateiablage, echten
   Sitzungen und absichtlich manipulierten Rümpfen:

   A. Bibliothek: genau ein Modell je Tag oder ausdrücklich keine/mehrdeutig/
      ungültig (nie still entschieden); Prüfung der ganzen Liste (Form,
      Kennung, Modell, Datum, Reihenfolge, Versatz, Überschneidung, Lücke,
      Obergrenzen); Altbestand = implizites Betriebsmodell; Zykluslage über
      Zeitumstellung und Schalttag.
   1. Lesen je Rolle: nur Planung, Leitung, Kundenrolle.
   2. Schreiben je Rolle: jede andere Rolle ändert nichts; erlaubte Rollen
      schreiben, Wann/Wer/Version vom Server (Fälschungen verfallen).
   3. Kontrollierte Klärung: mehrdeutige oder unvollständige Listen werden
      abgewiesen (deutscher Grund), nichts gespeichert.
   4. Historischer Schutz: vergangene Tage, heute, freigegebene und
      abgeschlossene Monate, geänderte Zyklustage eines geltenden Modells.
   5. Veraltete Kopie, Altbestand-Rundweg (keine Migration, kein neues Feld).
   6. Teilweg ist nie großzügiger als der Voll-PUT.
   7. Protokoll: nur Kennungen, keine Namen, keine Modellnamen.
   8. Importvorschau mit zwei Modellen je Person (ohne Schreiben, Schalter aus).

   Aufruf: npx vitest run pruefungen/imp6-mehrfachmodelle.test.js --testTimeout=120000
   ========================================================================== */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import * as L from "../server/lib/schichtzuordnung.mjs";
import { schichtVorschau } from "../server/lib/import/schichtvorschau.mjs";
import { heuteBerlin } from "../server/lib/zeiterfassung.mjs";

const WIRT = "127.0.0.1:3000";
let wurzel, laden, daten, imp, B, G, sitzungAnlegen, spur;
const kopie = (x) => JSON.parse(JSON.stringify(x));

const HEUTE = heuteBerlin();
const plus = (s, n) => L.plusTage(s, n);
/** Erster Tag des n-ten Folgemonats. */
const monat = (n) => new Date(Date.UTC(Number(HEUTE.slice(0, 4)), Number(HEUTE.slice(5, 7)) - 1 + n, 1)).toISOString().slice(0, 10);
const M1 = monat(1), M2 = monat(2), M3 = monat(3);

let nr = 0;
async function anfrage(pfad, { methode = "GET", rumpf, token, handler } = {}) {
  nr += 1;
  const kopf = { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.78.${Math.floor(nr / 250) % 250}.${nr % 250}` };
  if (methode !== "GET") kopf["content-type"] = "application/json";
  if (token) kopf.authorization = `Bearer ${token}`;
  const a = await (handler || daten)(new Request(`http://${WIRT}${pfad}`, { method: methode, headers: kopf,
    ...(methode === "GET" ? {} : { body: typeof rumpf === "string" ? rumpf : JSON.stringify(rumpf || {}) }) }), {});
  let d = {}; try { d = await a.json(); } catch { /* leer */ }
  return { status: a.status, ...d };
}

const ROLLEN = {
  LT: { rolle: "leitung", person: "l1" },
  KU: { rolle: "kunde", person: null },
  PL: { rolle: "planer", person: "p1" },
  SV: { rolle: "subplaner", person: "s1", einheit: "e1" },
  MA: { rolle: "mitarbeiter", person: "m0" },
  MA_EIGEN: { rolle: "mitarbeiter", person: "a1" },
  BR: { rolle: "betriebsrat", person: "r1" },
  BT: { rolle: "betreiber", person: null },
};
const ERLAUBT = ["LT", "KU", "PL"];
const NICHT = ["SV", "MA", "MA_EIGEN", "BR"];
const MARKE = "MODELLNAME-GEHEIM-4711";
const STEMPEL = { geaendertAm: "2026-06-01T10:00:00.000Z", geaendertVon: "l1", version: 2 };

const person = (id, rolle, einheit, extra = {}) => ({ id, vorname: "V", nachname: `N${id}`, rolle, bereich: einheit,
  status: "aktiv", geburtstag: "1980-01-01", qualifikationen: [], zugehoerigkeit: [{ ab: "2020-01-01", einheitId: einheit }],
  telefon: "0", email: `${id}@example.org`, personalnummer: `PN-${id}`, ...extra });
const MODELLE = () => [{ id: "tag", name: MARKE, tage: ["F", "F", "-"], ...STEMPEL }, { id: "nacht", name: "Nacht", tage: ["N", "N", "-", "-"], ...STEMPEL }];
const ZUORDNUNGEN_A1 = () => [{ id: "a1-alt", modellId: "betrieb", gueltigAb: null, gueltigBis: "2026-06-30", ...STEMPEL },
  { id: "a1-tag", modellId: "tag", gueltigAb: "2026-07-01", gueltigBis: null, versatz: 0, ...STEMPEL }];

function bestand({ mit = true, freigegeben = [], abgeschlossen = [] } = {}) {
  const einheiten = [{ id: "e1", name: "WB 1", versatzTage: 0 }, { id: "e2", name: "WB 2", versatzTage: 0 }];
  const betrieb = (id, name) => ({
    id, name, branche: "pflege", bundesland: "BE", einheitLabel: "Wohnbereich", status: "aktiv", stichtag: null, laeuftAb: null, pakete: [], matrix: null,
    einheiten: kopie(einheiten), dienstarten: [{ id: "F", kurz: "F", name: "Früh", start: "06:00", ende: "14:00", pause: 30 }, { id: "N", kurz: "N", name: "Nacht", start: "22:00", ende: "06:00", pause: 30 }],
    zyklus: { wochen: 1, tage: ["F", "F", "-", "F", "F", "-", "-"], vorlage: null }, anker: "2026-01-05",
    zuschlaege: [], einstellungen: { ruhezeit: 11, maxFolge: 6 }, rollennamen: {}, briefing: [], aufgaben: [], qualifikationen: [],
    genehmigungsstufen: [], tarifwerk: null, version: 9, stand: 1,
    personen: [person("m0", "mitarbeiter", "e1"), person("a1", "mitarbeiter", "e1", mit ? { schichtmodellZuordnungen: ZUORDNUNGEN_A1() } : {}),
      person("r1", "betriebsrat", "ALLE"), person("s1", "subplaner", "e1"), person("p1", "planer", "ALLE"), person("l1", "leitung", "ALLE")],
    abweichungen: {}, planstaende: {}, freigaben: Object.fromEntries(freigegeben.map((m) => [m, { am: "2026-11-01T00:00:00.000Z", wer: "l1" }])),
    unterschreitungen: [], belegung: {}, therapie: {}, aushang: [],
    monatsabschluss: Object.fromEntries(abgeschlossen.map((m) => [m, { abgeschlossen: true, am: "2026-11-01T00:00:00.000Z", wer: "l1", verlauf: [] }])),
    istEingefroren: {}, standorte: [], abwesenheiten: [], krankmeldungen: [], anfragen: [], wuensche: [], einspruenge: [], ausschreibungen: [],
    selbstplanung: [], nachrichten: [], notrufe: [], erfassung: {}, einstempeln: {}, fahrzeiten: {}, checks: {}, ansichten: {},
    kompetenzen: [], einarbeitung: [], aenderungen: [], bestaetigungen: [], dienstbuch: [], uebergaben: [], protokoll: [],
    notizen: {}, tagesnotizen: {}, tarif: "pro", seit: "2026-01-01", preisgestaltung: {}, kontakt: "k@example.org",
    ...(mit ? { schichtmodelle: MODELLE() } : {}),
  });
  return { version: 9, stand: 1, mandanten: [betrieb("m1", "Haus"), betrieb("m2", "Haus 2")] };
}

let raumNr = 0;
async function neuerRaum({ rollen = Object.keys(ROLLEN), ...opt } = {}) {
  const raum = `imp6-mm-${++raumNr}`;
  await B.bestandSchreiben(laden(), raum, G.personenAngleichen(G.uebergabenAngleichen(bestand(opt))), { durch: "Pruefung" });
  const token = {};
  for (const k of rollen) {
    const r = ROLLEN[k];
    token[k] = (await sitzungAnlegen({ bestand: raum, name: `V N${r.person}`, rolle: r.rolle, person: r.person, betrieb: 0,
      mandantId: "m1", einheit: r.einheit || null }, 2 * 3600 * 1000)).token;
  }
  return { raum, token };
}
async function gespeichert(raum) {
  const g = await B.bestandLesenStreng(laden(), raum);
  const m1 = g.bestand.mandanten.find((m) => m.id === "m1");
  return { bestand: g.bestand, m1, m2: g.bestand.mandanten.find((m) => m.id === "m2"), a1: m1.personen.find((p) => p.id === "a1") };
}

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-imp6-mm-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
  process.env.CENTRIC_TEILSPEICHERUNG = "true";
  delete process.env.CENTRIC_IMPORT_AKTIV;
  const schutz = await import("../server/lib/schutz.mjs");
  for (const art of Object.keys(schutz.GRENZEN)) schutz.GRENZEN[art] = { ...schutz.GRENZEN[art], versuche: 100000 };
  const { getStore } = await import("../server/lib/ablage.mjs");
  laden = () => getStore({ name: "centric", consistency: "strong" });
  spur = () => getStore({ name: "centric-spur" });
  daten = (await import("../server/funktionen/daten.mjs")).default;
  imp = (await import("../server/funktionen/import.mjs")).default;
  B = await import("../server/lib/bestand.mjs");
  G = await import("../server/lib/gestalt.mjs");
  ({ sitzungAnlegen } = await import("../server/lib/sitzungen.mjs"));
});
afterAll(async () => {
  delete process.env.CENTRIC_TEILSPEICHERUNG;
  if (wurzel) await rm(wurzel, { recursive: true, force: true });
});

async function schreibeAls(token, k, aendern, { roh } = {}) {
  const g = await anfrage("/api/bestand", { token: token[k] });
  expect(g.status, `${k}: Lesen`).toBe(200);
  const rumpf = { bestand: kopie(g.bestand), etag: g.etag, durch: "Pruefung" };
  const m = rumpf.bestand.mandanten.find((x) => x.id === "m1");
  aendern(m, rumpf);
  return anfrage("/api/bestand", { methode: "PUT", token: token[k], rumpf: roh ? roh(rumpf) : rumpf });
}
const pA1 = (m) => m.personen.find((p) => p.id === "a1");
/** Gültige Änderung: ab M2 das Nachtmodell (Versatz 1), mit gefälschten Stempeln. */
const WECHSEL = (m) => {
  const p = pA1(m);
  p.schichtmodellZuordnungen = [ZUORDNUNGEN_A1()[0], { ...ZUORDNUNGEN_A1()[1], gueltigBis: plus(M2, -1), geaendertVon: "fremd" },
    { id: "a1-nacht", modellId: "nacht", gueltigAb: M2, gueltigBis: null, versatz: 1, geaendertAm: "1999-01-01T00:00:00.000Z", geaendertVon: "fremd", version: 99 }];
};

/* ------------------------------------------------------------------------ */
describe("A. Bibliothek: genau ein Modell oder ausdrücklich Klärung", () => {
  const m = { dienstarten: [{ id: "F" }, { id: "N" }], schichtmodelle: MODELLE(), zyklus: { tage: ["F", "-"] }, anker: "2026-01-05",
    einheiten: [{ id: "e1", versatzTage: 0 }] };
  const verz = L.modellVerzeichnis(m);
  const p = { id: "a1", zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }], schichtmodellZuordnungen: ZUORDNUNGEN_A1() };
  it("Altbestand ohne Feld oder mit leerer Liste: das Betriebsmodell, unbefristet", () => {
    for (const q of [{ id: "x" }, { id: "x", schichtmodellZuordnungen: [] }])
      for (const d of ["1999-01-01", HEUTE, "2099-12-31"]) expect(L.anzuwendendesModell(m, q, d)).toMatchObject({ art: "modell", modellId: "betrieb", quelle: "betrieb" });
  });
  it("je Tag genau ein Modell aus der Zuordnung", () => {
    expect(L.anzuwendendesModell(m, p, "2026-06-30")).toMatchObject({ art: "modell", modellId: "betrieb", zuordnungId: "a1-alt" });
    expect(L.anzuwendendesModell(m, p, "2026-07-01")).toMatchObject({ art: "modell", modellId: "tag", zuordnungId: "a1-tag", anker: "2026-07-01", versatz: 0 });
  });
  it("Überschneidung: mehrdeutig mit beiden Kennungen, keine stille Wahl", () => {
    const q = { schichtmodellZuordnungen: [{ id: "a", modellId: "tag", gueltigAb: "2027-01-01", gueltigBis: null }, { id: "b", modellId: "nacht", gueltigAb: "2027-02-01", gueltigBis: null }] };
    expect(L.anzuwendendesModell(m, q, "2027-02-10")).toEqual({ art: "mehrdeutig", zuordnungIds: ["a", "b"] });
    expect(L.anzuwendendesModell(m, q, "2026-12-31")).toEqual({ art: "keine" });
    expect(L.modellDienstAm(m, q, "2027-02-10").art).toBe("mehrdeutig");
  });
  it("fehlerhafte Daten: ungültig statt geraten", () => {
    expect(L.anzuwendendesModell(m, p, "2027-02-30").art).toBe("ungueltig");
    expect(L.anzuwendendesModell(m, { schichtmodellZuordnungen: [{ id: "a", modellId: "weg", gueltigAb: "2026-01-01", gueltigBis: null }] }, "2026-02-01"))
      .toEqual({ art: "ungueltig", grund: "modell-unbekannt" });
    expect(L.anzuwendendesModell(m, { schichtmodellZuordnungen: [{ id: "a", modellId: "tag", gueltigAb: "1.1.2026", gueltigBis: null }] }, "2026-02-01").art).toBe("ungueltig");
  });
  it("Zykluslage: über Zeitumstellung (März/Oktober) und Schalttag gleichmäßig weiter", () => {
    const q = { schichtmodellZuordnungen: [{ id: "a", modellId: "nacht", gueltigAb: "2027-03-01", gueltigBis: null, versatz: 0 }] };
    const folge = (von, n) => Array.from({ length: n }, (_, i) => L.modellDienstAm(m, q, plus(von, i)).dienstId);
    expect(folge("2027-03-26", 8)).toEqual(folge("2027-03-02", 8));        // über 2027-03-28 (Umstellung): 24 Tage = 6 Zyklen
    /* Zyklustag = Kalendertage seit Beginn modulo 4 — unabhängig von 23- oder 25-Stunden-Tagen. */
    const idx = (d) => ((Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8)) - Date.UTC(2027, 2, 1)) / 864e5) % 4;
    for (const d of ["2027-03-27", "2027-03-28", "2027-03-29", "2027-10-30", "2027-10-31", "2027-11-01", "2028-02-28", "2028-02-29", "2028-03-01"])
      expect(L.modellDienstAm(m, q, d).dienstId, d).toBe(["N", "N", null, null][idx(d)]);
  });
  it("Prüfung der Liste: gültig, und jeder Klärungsfall mit eigenem Code", () => {
    expect(L.pruefeZuordnungen(ZUORDNUNGEN_A1(), verz)).toBeNull();
    expect(L.pruefeZuordnungen([], verz)).toBeNull();
    const z = (x) => ({ id: "z", modellId: "tag", gueltigAb: "2027-01-01", gueltigBis: null, ...x });
    const faelle = [
      ["FORM", "x"], ["FORM", [1]], ["FORM", [z({ extra: 1 })]], ["KENNUNG", [z({ id: "mit leer" })]],
      ["DOPPELT", [z({ gueltigBis: "2027-01-31" }), z({ gueltigAb: "2027-02-01" })]],
      ["MODELL_UNBEKANNT", [z({ modellId: "gibtsnicht" })]], ["DATUM", [z({ gueltigAb: "2027-02-30" })]], ["DATUM", [{ id: "z", modellId: "tag", gueltigAb: "2027-01-01" }]],
      ["REIHENFOLGE", [z({ gueltigBis: "2026-12-31" })]], ["ANKER", [z({ gueltigAb: null })]], ["VERSATZ", [z({ versatz: 3 })]], ["VERSATZ", [z({ versatz: -1 })]],
      ["VERSATZ", [z({ modellId: "betrieb", versatz: 1 })]],
      ["UEBERSCHNEIDUNG", [z({ id: "a" }), z({ id: "b", gueltigAb: "2027-06-01" })]],
      ["UEBERSCHNEIDUNG", [z({ id: "a", modellId: "betrieb", gueltigAb: null }), z({ id: "b", gueltigAb: "2027-06-01" })]],
      ["LUECKE", [z({ id: "a", gueltigBis: "2027-01-31" }), z({ id: "b", gueltigAb: "2027-02-02" })]],
      ["ZU_VIELE", Array.from({ length: 51 }, (_, i) => z({ id: `z${i}`, gueltigAb: plus("2027-01-01", i), gueltigBis: plus("2027-01-01", i) }))],
    ];
    for (const [code, liste] of faelle) expect(L.pruefeZuordnungen(liste, verz), code).toMatchObject({ code });
  });
  it("Modellliste: reservierte Kennung, unbekannte Dienstart, Grenzen", () => {
    expect(L.pruefeModelle(MODELLE(), m.dienstarten)).toBeNull();
    expect(L.pruefeModelle([{ id: "betrieb", name: "x", tage: ["F"] }], m.dienstarten)).toMatchObject({ code: "KENNUNG" });
    expect(L.pruefeModelle([{ id: "a", name: "x", tage: ["Z"] }], m.dienstarten)).toMatchObject({ code: "DIENSTART" });
    expect(L.pruefeModelle([{ id: "a", name: "x", tage: [] }], m.dienstarten)).toMatchObject({ code: "TAGE" });
    expect(L.pruefeModelle([{ id: "a", name: "x", tage: new Array(1001).fill("-") }], m.dienstarten)).toMatchObject({ code: "TAGE" });
    expect(L.pruefeModelle(Array.from({ length: 51 }, (_, i) => ({ id: `m${i}`, name: "x", tage: ["-"] })), m.dienstarten)).toMatchObject({ code: "ZU_VIELE" });
    expect(L.pruefeModelle([{ id: "a", name: "x".repeat(81), tage: ["-"] }], m.dienstarten)).toMatchObject({ code: "NAME" });
  });
});

/* ------------------------------------------------------------------------ */
describe("1. Lesen je Rolle", () => {
  it("Planung, Leitung, Kundenrolle sehen Modelle und Zuordnungen; alle anderen nichts davon", async () => {
    const { token } = await neuerRaum();
    for (const k of ERLAUBT) {
      const g = await anfrage("/api/bestand", { token: token[k] });
      const m = g.bestand.mandanten[0];
      expect(JSON.stringify(m.schichtmodelle), k).toContain(MARKE);
      expect(pA1(m).schichtmodellZuordnungen, k).toHaveLength(2);
    }
    for (const k of [...NICHT, "BT"]) {
      const g = await anfrage("/api/bestand", { token: token[k] });
      expect(g.status, k).toBe(200);
      const s = JSON.stringify(g);
      expect(s, k).not.toContain(MARKE);
      expect(s, k).not.toContain("schichtmodellZuordnungen");
      expect(s, k).not.toContain("a1-tag");
    }
  });
});

/* ------------------------------------------------------------------------ */
describe("2. Schreiben je Rolle mit manipulierten Rümpfen", () => {
  const FAELLE = {
    "gültiger Wechsel mit gefälschten Stempeln": WECHSEL,
    "Zuordnungen geleert": (m) => { pA1(m).schichtmodellZuordnungen = []; },
    "Unsinn statt Liste": (m) => { pA1(m).schichtmodellZuordnungen = "x"; },
    "Zuordnung an fremder Person angelegt": (m) => { m.personen.find((p) => p.id === "m0").schichtmodellZuordnungen = [{ id: "z", modellId: "tag", gueltigAb: M2, gueltigBis: null }]; },
    "Modelle ersetzt": (m) => { m.schichtmodelle = [{ id: "boese", name: "x", tage: ["F"] }]; },
    "Modelle als Unsinn": (m) => { m.schichtmodelle = 7; },
  };
  for (const k of NICHT) {
    for (const [name, aendern] of Object.entries(FAELLE)) {
      it(`${k} (${ROLLEN[k].rolle}): ${name} ändert nichts`, async () => {
        const { raum, token } = await neuerRaum({ rollen: [k] });
        const vorher = await gespeichert(raum);
        const a = await schreibeAls(token, k, aendern);
        expect([200, 403], JSON.stringify(a).slice(0, 200)).toContain(a.status);
        const nachher = await gespeichert(raum);
        expect(nachher.m1.schichtmodelle, k).toEqual(vorher.m1.schichtmodelle);
        expect(nachher.m1.personen.map((p) => p.schichtmodellZuordnungen ?? null), k).toEqual(vorher.m1.personen.map((p) => p.schichtmodellZuordnungen ?? null));
      });
    }
  }
  it("Betreiber: gefälschte Modelle und Zuordnungen bleiben wirkungslos, auch in einem neu angelegten Betrieb", async () => {
    const { raum, token } = await neuerRaum({ rollen: ["BT"] });
    const vorher = await gespeichert(raum);
    const g = await anfrage("/api/bestand", { token: token.BT });
    const rumpf = { bestand: kopie(g.bestand), etag: g.etag, durch: "Pruefung" };
    for (const m of rumpf.bestand.mandanten || []) { m.schichtmodelle = [{ id: "boese", name: "x", tage: ["F"] }]; for (const p of m.personen || []) p.schichtmodellZuordnungen = []; }
    const neu = { ...kopie(rumpf.bestand.mandanten[0]), id: "m3", name: "Haus 3", schichtmodelle: [{ id: "boese", name: "x", tage: ["F"] }] };
    neu.personen = (neu.personen || []).map((p) => ({ ...p, schichtmodellZuordnungen: [{ id: "z", modellId: "boese", gueltigAb: "2020-01-01", gueltigBis: null }] }));
    rumpf.bestand.mandanten.push(neu);
    await anfrage("/api/bestand", { methode: "PUT", token: token.BT, rumpf });
    const nachher = await gespeichert(raum);
    expect(nachher.m1.schichtmodelle).toEqual(vorher.m1.schichtmodelle);
    expect(nachher.a1.schichtmodellZuordnungen).toEqual(vorher.a1.schichtmodellZuordnungen);
    const m3 = nachher.bestand.mandanten.find((m) => m.id === "m3");
    if (m3) {
      expect(Object.prototype.hasOwnProperty.call(m3, "schichtmodelle")).toBe(false);
      expect(JSON.stringify(m3.personen || [])).not.toContain("schichtmodellZuordnungen");
    }
  });
  for (const k of ERLAUBT) {
    it(`${k}: gültiger Wechsel ab ${M2} wird gespeichert; Wann, Wer und Version vom Server`, async () => {
      const { raum, token } = await neuerRaum({ rollen: [k] });
      const a = await schreibeAls(token, k, WECHSEL);
      expect(a.status, JSON.stringify(a).slice(0, 300)).toBe(200);
      const { a1, m1, m2 } = await gespeichert(raum);
      const [alt, tag, nacht] = a1.schichtmodellZuordnungen;
      expect(alt).toEqual(ZUORDNUNGEN_A1()[0]);                                 // unverändert: gespeicherter Datensatz samt Stempel
      expect(tag).toMatchObject({ gueltigBis: plus(M2, -1), version: 3, geaendertVon: ROLLEN[k].person });
      expect(nacht).toMatchObject({ modellId: "nacht", gueltigAb: M2, versatz: 1, version: 1, geaendertVon: ROLLEN[k].person });
      expect(Date.parse(nacht.geaendertAm)).toBeGreaterThan(Date.parse("2026-11-01"));
      expect(L.anzuwendendesModell(m1, a1, M2)).toMatchObject({ art: "modell", modellId: "nacht" });
      expect(L.anzuwendendesModell(m1, a1, plus(M2, -1))).toMatchObject({ art: "modell", modellId: "tag" });
      expect(m2.personen.find((p) => p.id === "a1").schichtmodellZuordnungen).toEqual(ZUORDNUNGEN_A1());   // anderer Betrieb unberührt
    });
  }
  it("Leitung legt ein neues Modell an und ordnet es ab M2 zu; Modellstempel vom Server", async () => {
    const { raum, token } = await neuerRaum({ rollen: ["LT"] });
    const a = await schreibeAls(token, "LT", (m) => {
      m.schichtmodelle.push({ id: "spaet", name: "Spät", tage: ["N", "-"], geaendertVon: "fremd", version: 50 });
      pA1(m).schichtmodellZuordnungen = [ZUORDNUNGEN_A1()[0], { ...ZUORDNUNGEN_A1()[1], gueltigBis: plus(M2, -1) },
        { id: "a1-spaet", modellId: "spaet", gueltigAb: M2, gueltigBis: null }];
    });
    expect(a.status, JSON.stringify(a).slice(0, 300)).toBe(200);
    const { m1 } = await gespeichert(raum);
    expect(m1.schichtmodelle.find((x) => x.id === "spaet")).toMatchObject({ version: 1, geaendertVon: "l1" });
    expect(m1.schichtmodelle.find((x) => x.id === "tag")).toEqual(MODELLE()[0]);
  });
});

/* ------------------------------------------------------------------------ */
describe("3. Kontrollierte Klärung statt stiller Auflösung (Leitung, PUT)", () => {
  const z = (x) => ({ id: "neu", modellId: "nacht", gueltigAb: M2, gueltigBis: null, ...x });
  const basis = () => [ZUORDNUNGEN_A1()[0], { ...ZUORDNUNGEN_A1()[1], gueltigBis: plus(M2, -1) }];
  const FAELLE = {
    "Überschneidung": [/überschneiden/, (m) => { pA1(m).schichtmodellZuordnungen = [ZUORDNUNGEN_A1()[0], ZUORDNUNGEN_A1()[1], z({})]; }],
    "Lücke": [/Lücke/, (m) => { pA1(m).schichtmodellZuordnungen = [...basis(), z({ gueltigAb: plus(M2, 3) })]; }],
    "unbekanntes Modell": [/gibt es im Betrieb nicht/, (m) => { pA1(m).schichtmodellZuordnungen = [...basis(), z({ modellId: "gibtsnicht" })]; }],
    "kein Kalenderdatum": [/kein gültiges Datum/, (m) => { pA1(m).schichtmodellZuordnungen = [...basis(), z({ gueltigAb: `${M2.slice(0, 7)}-32` })]; }],
    "Ende vor Beginn": [/vor „Gültig ab“/, (m) => { pA1(m).schichtmodellZuordnungen = [...basis(), z({ gueltigBis: plus(M2, -5) })]; }],
    "Versatz außerhalb des Zyklus": [/Versatz/, (m) => { pA1(m).schichtmodellZuordnungen = [...basis(), z({ versatz: 4 })]; }],
    "unbekanntes Feld": [/Unbekanntes Feld/, (m) => { pA1(m).schichtmodellZuordnungen = [...basis(), z({ admin: true })]; }],
    "doppelte Kennung": [/doppelt/, (m) => { pA1(m).schichtmodellZuordnungen = [...basis(), z({ id: "a1-tag" })]; }],
    "zu viele": [/Höchstens 50/, (m) => { pA1(m).schichtmodellZuordnungen = Array.from({ length: 51 }, (_, i) => z({ id: `z${i}`, gueltigAb: plus(M2, i), gueltigBis: plus(M2, i) })); }],
    "verwendetes Modell entfernt": [/noch Person a1 zugeordnet/, (m) => { m.schichtmodelle = m.schichtmodelle.filter((x) => x.id !== "tag"); }],
    "Modell mit reservierter Kennung": [/reserviert/, (m) => { m.schichtmodelle.push({ id: "betrieb", name: "x", tage: ["F"] }); }],
    "Modell mit unbekannter Dienstart": [/Dienstart des Betriebs/, (m) => { m.schichtmodelle.push({ id: "neu", name: "x", tage: ["Z"] }); }],
  };
  for (const [name, [text, aendern]] of Object.entries(FAELLE)) {
    it(`${name}: abgewiesen mit deutschem Grund, nichts gespeichert`, async () => {
      const { raum, token } = await neuerRaum({ rollen: ["LT"] });
      const vorher = await gespeichert(raum);
      const a = await schreibeAls(token, "LT", aendern);
      expect(a.status).toBe(403);
      expect(String(a.text)).toMatch(text);
      expect(String(a.text)).not.toContain("Na1");                            // kein Name im Grund (er steht auch im Protokoll)
      const nachher = await gespeichert(raum);
      expect(nachher.m1.schichtmodelle).toEqual(vorher.m1.schichtmodelle);
      expect(nachher.a1.schichtmodellZuordnungen).toEqual(vorher.a1.schichtmodellZuordnungen);
    });
  }
  it("__proto__ im rohen JSON ist ein unbekanntes Feld", async () => {
    const { raum, token } = await neuerRaum({ rollen: ["LT"] });
    const vorher = await gespeichert(raum);
    const a = await schreibeAls(token, "LT", (m) => { pA1(m).schichtmodellZuordnungen = [...basis(), z({ id: "proto" })]; },
      { roh: (r) => JSON.stringify(r).replace('"id":"proto"', '"__proto__":{"admin":true},"id":"proto"') });
    expect(a.status).toBe(403);
    expect(({}).admin).toBeUndefined();
    expect((await gespeichert(raum)).a1.schichtmodellZuordnungen).toEqual(vorher.a1.schichtmodellZuordnungen);
  });
});

/* ------------------------------------------------------------------------ */
describe("4. Historischer Schutz: kein rückwirkender Wechsel", () => {
  const abgewiesen = async (aendern, opt, text) => {
    const { raum, token } = await neuerRaum({ rollen: ["LT"], ...opt });
    const vorher = await gespeichert(raum);
    const a = await schreibeAls(token, "LT", aendern);
    expect(a.status, JSON.stringify(a).slice(0, 300)).toBe(403);
    expect(String(a.text)).toMatch(text);
    const nachher = await gespeichert(raum);
    expect(nachher.a1.schichtmodellZuordnungen).toEqual(vorher.a1.schichtmodellZuordnungen);
    expect(nachher.m1.schichtmodelle).toEqual(vorher.m1.schichtmodelle);
  };
  const wechselAb = (tag) => (m) => {
    pA1(m).schichtmodellZuordnungen = [ZUORDNUNGEN_A1()[0], { ...ZUORDNUNGEN_A1()[1], gueltigBis: plus(tag, -1) },
      { id: "a1-nacht", modellId: "nacht", gueltigAb: tag, gueltigBis: null }];
  };
  it("Wechsel ab heute: abgewiesen (vergangene und laufende Tage bleiben)", () => abgewiesen(wechselAb(HEUTE), {}, /vergangene Tage/));
  it("Wechsel in der Vergangenheit: abgewiesen", () => abgewiesen(wechselAb("2026-08-01"), {}, /vergangene Tage/));
  it("bisherige Zuordnung rückwirkend verkürzt (Lücke wird zu „keines“): abgewiesen", () =>
    abgewiesen((m) => { pA1(m).schichtmodellZuordnungen = [ZUORDNUNGEN_A1()[1]]; }, {}, /vergangene Tage/));
  it("Altbestand-Person bekommt ein Modell seit jeher: abgewiesen", () =>
    abgewiesen((m) => { m.personen.find((p) => p.id === "m0").schichtmodellZuordnungen = [{ id: "z", modellId: "tag", gueltigAb: "2025-01-01", gueltigBis: null }]; }, {}, /vergangene Tage/));
  it(`Wechsel ab ${M1} in freigegebenem Monat: abgewiesen`, () => abgewiesen(wechselAb(M1), { freigegeben: [M1.slice(0, 7)] }, /freigegebenen Plan/));
  it(`Wechsel ab ${M2}, abgeschlossener Monat ${M3.slice(0, 7)} (offenes Ende): abgewiesen`, () =>
    abgewiesen(wechselAb(M2), { abgeschlossen: [M3.slice(0, 7)] }, /abgeschlossenen Monat/));
  it("Zyklustage eines Modells, das schon gilt, ändern: abgewiesen", () =>
    abgewiesen((m) => { m.schichtmodelle[0].tage = ["F", "-", "-"]; }, {}, /vergangene Tage/));
  it(`Wechsel ab ${M2}, nur ${M1.slice(0, 7)} freigegeben: erlaubt; ein Modell ohne Zuordnung lässt sich ändern`, async () => {
    const { raum, token } = await neuerRaum({ rollen: ["LT"], freigegeben: [M1.slice(0, 7)] });
    expect((await schreibeAls(token, "LT", wechselAb(M2))).status).toBe(200);
    const b = await neuerRaum({ rollen: ["LT"] });
    const a = await schreibeAls(b.token, "LT", (m) => { m.schichtmodelle[1].tage = ["N", "-", "-"]; });
    expect(a.status, JSON.stringify(a).slice(0, 200)).toBe(200);
    expect((await gespeichert(b.raum)).m1.schichtmodelle[1]).toMatchObject({ tage: ["N", "-", "-"], version: 3 });
    expect((await gespeichert(raum)).a1.schichtmodellZuordnungen).toHaveLength(3);
  });
  it("Zyklustage eines Modells, das erst ab M2 gilt, ändern: erlaubt; in einem freigegebenen Monat nicht", async () => {
    const { raum, token } = await neuerRaum({ rollen: ["LT"] });
    expect((await schreibeAls(token, "LT", wechselAb(M2))).status).toBe(200);
    expect((await schreibeAls(token, "LT", (m) => { m.schichtmodelle[1].tage = ["N", "N", "N", "-"]; })).status).toBe(200);
    expect((await gespeichert(raum)).m1.schichtmodelle[1].tage).toEqual(["N", "N", "N", "-"]);
    await abgewiesen((m) => { wechselAb(M2)(m); }, { freigegeben: [M2.slice(0, 7)] }, /freigegebenen Plan/);
  });
  it("neue Person: implizites Modell wie bisher; eigenes Modell ab M2 erlaubt, seit gestern abgewiesen", async () => {
    const { raum, token } = await neuerRaum({ rollen: ["LT"] });
    const a = await schreibeAls(token, "LT", (m) => { m.personen.push({ ...person("n9", "mitarbeiter", "e1"),
      schichtmodellZuordnungen: [{ id: "n9-a", modellId: "betrieb", gueltigAb: null, gueltigBis: plus(M2, -1) }, { id: "n9-b", modellId: "tag", gueltigAb: M2, gueltigBis: null }] }); });
    expect(a.status, JSON.stringify(a).slice(0, 300)).toBe(200);
    expect((await gespeichert(raum)).m1.personen.find((p) => p.id === "n9").schichtmodellZuordnungen).toHaveLength(2);
    await abgewiesen((m) => { m.personen.push({ ...person("n8", "mitarbeiter", "e1"),
      schichtmodellZuordnungen: [{ id: "n8-a", modellId: "tag", gueltigAb: plus(HEUTE, -1), gueltigBis: null }] }); }, {}, /vergangene Tage/);
  });
});

/* ------------------------------------------------------------------------ */
describe("5. Veraltete Kopie und Altbestand (keine Migration)", () => {
  it("Planung schickt eine Kopie ohne beide Felder und ändert sonst Erlaubtes: 200, Modelle und Zuordnungen bleiben", async () => {
    const { raum, token } = await neuerRaum({ rollen: ["PL"] });
    const vorher = await gespeichert(raum);
    const a = await schreibeAls(token, "PL", (m) => {
      delete m.schichtmodelle;
      for (const p of m.personen) delete p.schichtmodellZuordnungen;
      m.dienstarten = m.dienstarten.map((d) => (d.id === "F" ? { ...d, ende: "14:15" } : d));
    });
    expect(a.status, JSON.stringify(a).slice(0, 300)).toBe(200);
    const nachher = await gespeichert(raum);
    expect(nachher.m1.dienstarten.find((d) => d.id === "F").ende).toBe("14:15");
    expect(nachher.m1.schichtmodelle).toEqual(vorher.m1.schichtmodelle);
    expect(nachher.a1.schichtmodellZuordnungen).toEqual(vorher.a1.schichtmodellZuordnungen);
  });
  it("Rundweg mit Zuordnungen: GET und unveränderter PUT ändern für keine Rolle etwas (Stempel bleiben)", async () => {
    for (const k of [...ERLAUBT, ...NICHT]) {
      const { raum, token } = await neuerRaum({ rollen: [k] });
      const vorher = await gespeichert(raum);
      const a = await schreibeAls(token, k, () => {});
      expect([200, 403], `${k}: ${JSON.stringify(a).slice(0, 150)}`).toContain(a.status);
      const nachher = await gespeichert(raum);
      expect(nachher.m1.schichtmodelle, k).toEqual(vorher.m1.schichtmodelle);
      expect(nachher.m1.personen.map((p) => p.schichtmodellZuordnungen ?? null), k).toEqual(vorher.m1.personen.map((p) => p.schichtmodellZuordnungen ?? null));
    }
  });
  it("Altbestand ohne die Felder: nach dem Rundweg jeder Rolle entsteht keines, alle Personen bleiben beim Betriebsmodell", async () => {
    for (const k of [...ERLAUBT, ...NICHT]) {
      const { raum, token } = await neuerRaum({ rollen: [k], mit: false });
      await schreibeAls(token, k, (m) => { for (const p of m.personen) if (ERLAUBT.includes(k)) p.schichtmodellZuordnungen = []; if (ERLAUBT.includes(k)) m.schichtmodelle = []; });
      const { m1 } = await gespeichert(raum);
      expect(Object.prototype.hasOwnProperty.call(m1, "schichtmodelle"), k).toBe(false);
      for (const p of m1.personen) {
        expect(Object.prototype.hasOwnProperty.call(p, "schichtmodellZuordnungen"), `${k} ${p.id}`).toBe(false);
        expect(L.anzuwendendesModell(m1, p, HEUTE)).toMatchObject({ art: "modell", modellId: "betrieb" });
      }
    }
  });
});

/* ------------------------------------------------------------------------ */
describe("6. Teilweg (POST /api/bestand/teile) ist nie großzügiger als der Voll-PUT", () => {
  const stabil = (x) => {
    if (x === undefined) return "null";
    if (x === null || typeof x !== "object") return JSON.stringify(x);
    if (Array.isArray(x)) return `[${x.map((e) => (e === undefined ? "null" : stabil(e))).join(",")}]`;
    return `{${Object.keys(x).filter((k) => x[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${stabil(x[k])}`).join(",")}}`;
  };
  const version = (x) => createHash("sha256").update(stabil(x)).digest("hex").slice(0, 32);
  const maske = (x) => JSON.parse(JSON.stringify(x ?? null).replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z/g, "ZEIT"));
  const UEBERLAPPUNG = (m) => { pA1(m).schichtmodellZuordnungen = [...ZUORDNUNGEN_A1(), { id: "x", modellId: "nacht", gueltigAb: M2, gueltigBis: null }]; };
  for (const [fall, aendern] of [["gültiger Wechsel", WECHSEL], ["Überschneidung", UEBERLAPPUNG]]) {
    for (const k of [...ERLAUBT, ...NICHT]) {
      it(`${k}, ${fall}: gleicher Status und gleicher Stand wie der Voll-PUT`, async () => {
        const A = await neuerRaum({ rollen: [k] });
        const Bv = await neuerRaum({ rollen: [k] });
        const gA = await anfrage("/api/bestand", { token: A.token[k] });
        if (!gA.teile) return;   // Teilweg für diese Rolle nicht angeboten
        const m = kopie(gA.bestand.mandanten[0]);
        aendern(m);
        const delta = { format: 1, epoche: gA.teile.epoche, durch: "Pruefung",
          kern: { personen: { basis: gA.teile.versionen["kern:personen"] ?? version(gA.bestand.mandanten[0].personen), wert: m.personen } } };
        const t = await anfrage("/api/bestand/teile", { methode: "POST", token: A.token[k], rumpf: delta });
        const v = await schreibeAls(Bv.token, k, aendern);
        const nachA = await gespeichert(A.raum), nachB = await gespeichert(Bv.raum);
        if (typeof t.code === "string" && t.code.startsWith("TEILE_") && t.code !== "TEILE_KONFLIKT") {
          expect(nachA.a1.schichtmodellZuordnungen, `${k}: früh abgewiesen`).toEqual(ZUORDNUNGEN_A1());
        } else {
          expect(t.status, `${k}: Teil ${JSON.stringify(t).slice(0, 150)} / Voll ${JSON.stringify(v).slice(0, 150)}`).toBe(v.status);
          expect(maske(nachA.a1.schichtmodellZuordnungen), `${k}: Stand`).toEqual(maske(nachB.a1.schichtmodellZuordnungen));
        }
        if (ERLAUBT.includes(k) && fall === "gültiger Wechsel") expect(nachA.a1.schichtmodellZuordnungen.map((x) => x.id)).toEqual(["a1-alt", "a1-tag", "a1-nacht"]);
        else expect(nachA.a1.schichtmodellZuordnungen, k).toEqual(ZUORDNUNGEN_A1());
      });
    }
  }
});

/* ------------------------------------------------------------------------ */
describe("7. Protokoll: je Änderung eine Zeile, nur Kennungen", () => {
  it("Wechsel und neues Modell stehen mit Kennungen im Protokoll; kein Name, kein Modellname, kein Zeitraum", async () => {
    const { token } = await neuerRaum({ rollen: ["LT"] });
    const a = await schreibeAls(token, "LT", (m) => { WECHSEL(m); m.schichtmodelle.push({ id: "spaet", name: "GEHEIMER-MODELLNAME", tage: ["-"] }); });
    expect(a.status).toBe(200);
    const zeilen = [];
    for (const b of (await spur().list({})).blobs) {
      const e = await spur().get(b.key, { type: "json" });
      if (e && e.ausgang === "schichtmodell") zeilen.push(e);
    }
    const texte = zeilen.map((e) => e.zusatz);
    expect(texte).toEqual(expect.arrayContaining(["Schichtmodell spaet angelegt",
      "Schichtmodell-Zuordnung a1-tag geändert: Person a1, Modell tag", "Schichtmodell-Zuordnung a1-nacht angelegt: Person a1, Modell nacht"]));
    const s = JSON.stringify(zeilen);
    for (const verboten of ["GEHEIMER-MODELLNAME", MARKE, "Na1", M2, "PN-a1"]) expect(s, verboten).not.toContain(verboten);
    expect(zeilen.some((e) => e.rolle === "leitung" && e.person === "l1" && /a1-nacht angelegt/.test(e.zusatz))).toBe(true);
  });
});

/* ------------------------------------------------------------------------ */
describe("8. Importvorschau: zwei Modelle je Person (ohne Schreiben, Schalter aus)", () => {
  const mandant = () => bestand().mandanten[0];
  const MODELLZEILEN = [["Modell", "Tag", "Dienst"], ["Früh", 1, "F"], ["Früh", 2, "-"], ["Nacht", 1, "N"], ["Nacht", 2, "N"], ["Nacht", 3, "-"]];
  it("Person mit zwei Modellen ab M2 und M3: als Modellwechsel erkannt und übernehmbar; ab gestern: rückwirkend; ohne Personendaten", () => {
    const zuordnung = [["Personalnummer", "Modell", "Beginn", "Versatz"],
      ["PN-m0", "Früh", M2, 0], ["PN-m0", "Nacht", M3, 1],
      ["PN-a1", "Nacht", plus(HEUTE, -1), 0],
      ["PN-p1", "Früh", M2, 0], ["PN-p1", "Früh", M2, 1]];
    const r = schichtVorschau({ mandant: mandant(), modellZeilen: MODELLZEILEN, zuordnungZeilen: zuordnung, heute: HEUTE });
    expect(r.ok).toBe(true);
    expect(r.zuordnungen.modellwechsel).toEqual({ personen: 2, mehrereModelle: 1, uebernehmbar: 1,
      rueckwirkend: { anzahl: 1, datensaetze: [3] }, klaeren: { anzahl: 0, datensaetze: [] } });
    expect(r.zuordnungen.konflikte.find((k) => k.art === "zuordnung-doppelt")).toMatchObject({ anzahl: 2 });
    const s = JSON.stringify(r);
    for (const verboten of ["PN-m0", "PN-a1", "m0", "a1-tag", "Nm0", M2, "import-"]) expect(s, verboten).not.toContain(verboten);
  });
  it("freigegebener Monat und Übergang aus gespeicherten Zuordnungen: rückwirkend bzw. übernehmbar", () => {
    const m = bestand({ freigegeben: [M2.slice(0, 7)] }).mandanten[0];
    const zuordnung = [["Personalnummer", "Modell", "Beginn", "Versatz"], ["PN-a1", "Nacht", M2, 0], ["PN-m0", "Früh", M3, 0]];
    const r = schichtVorschau({ mandant: m, modellZeilen: MODELLZEILEN, zuordnungZeilen: zuordnung, heute: HEUTE });
    expect(r.zuordnungen.modellwechsel).toMatchObject({ personen: 2, uebernehmbar: 1, rueckwirkend: { anzahl: 1, datensaetze: [1] } });
  });
  it("ohne Tag (alter Aufruf) bleibt das Ergebnis wie bisher", () => {
    const r = schichtVorschau({ mandant: mandant(), modellZeilen: MODELLZEILEN, zuordnungZeilen: [["Personalnummer", "Modell", "Beginn", "Versatz"], ["PN-m0", "Früh", M2, 0]] });
    expect(r.zuordnungen).not.toHaveProperty("modellwechsel");
  });
  it("der Importweg bleibt aus: 404 für die Leitung, nichts geschrieben", async () => {
    const { raum, token } = await neuerRaum({ rollen: ["LT"] });
    const vorher = await gespeichert(raum);
    for (const weg of ["upload", "analyse", "vorschau", "uebernahme"]) {
      const a = await anfrage(`/api/import/${weg}`, { methode: "POST", token: token.LT, rumpf: { art: "schichtzyklus" }, handler: imp });
      expect(a.status, weg).toBe(404);
    }
    expect((await gespeichert(raum)).bestand).toEqual(vorher.bestand);
  });
});
