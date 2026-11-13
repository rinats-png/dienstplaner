/* ==========================================================================
   WP-I4 Teil 1 — INTERNE VORGABEN ÜBER DEN ECHTEN HANDLER (GET/PUT /api/bestand, POST /api/bestand/teile)

   Mit Dateiablage und echten Sitzungen; die Rümpfe sind absichtlich manipuliert. Geprüft wird:

   1. Lesen je Rolle: nur org.edit (Leitung, Kundenrolle, Demo-Leitung) bekommt die Vorgaben; Planung, Demo-Planung,
      Schichtverantwortung, Beschäftigte, Betriebsrat und der Betreiber bekommen weder Text noch Zahl; ein anderer Betrieb
      im selben Raum sieht nur die eigenen.
   2. Schreiben je Rolle mit gefälschten Rümpfen (neue aktive Vorgabe mit gefälschtem Wer/Wann/Version, leere Liste,
      geänderter Status, Unsinn statt Liste): org.edit schreibt und der Server setzt Wann/Wer/Version; jede andere Rolle
      ändert nichts. Eine veraltete Kopie der Planung (leere Vorgaben), die sonst Erlaubtes ändert, scheitert nicht
      (kein 403 wegen des Felds) und lässt die gespeicherten Vorgaben stehen.
   3. Obergrenzen und geschlossenes Schema: zu viele, zu lange, unbekannte Felder (auch "__proto__" im rohen JSON),
      Kennung, Priorität, Stufengrenze — abgewiesen, nichts gespeichert.
   4. Rundweg: unveränderter Rückweg ändert nichts (mit und ohne Vorgaben, Altbestand ohne das Feld bekommt keines).
   5. Teilweg: POST /api/bestand/teile ist nie großzügiger als der Voll-PUT (gleicher Status und gleicher Stand).
   6. Anderer Betrieb: keine Wirkung auf fremde Vorgaben.

   Aufruf: npx vitest run pruefungen/intelligence-vorgaben-wege.test.js
   ========================================================================== */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

const WIRT = "127.0.0.1:3000";
let wurzel, laden, daten, B, G, sitzungAnlegen;
const kopie = (x) => JSON.parse(JSON.stringify(x));

let nr = 0;
async function anfrage(pfad, { methode = "GET", rumpf, token } = {}) {
  nr += 1;
  const kopf = { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.77.${Math.floor(nr / 250) % 250}.${nr % 250}` };
  if (methode !== "GET") kopf["content-type"] = "application/json";
  if (token) kopf.authorization = `Bearer ${token}`;
  const a = await daten(new Request(`http://${WIRT}${pfad}`, { method: methode, headers: kopf,
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
  BR: { rolle: "betriebsrat", person: "r1" },
  BT: { rolle: "betreiber", person: null },
  DL: { rolle: "leitung", person: "l1", demo: true },
  DP: { rolle: "planer", person: "p1", demo: true },
  LT2: { rolle: "leitung", person: "l1", betrieb: 1, mandant: "m2" },
};
const ORG_EDIT = ["LT", "KU", "DL"];
const OHNE_ORG_EDIT = ["PL", "SV", "MA", "BR", "DP"];
const MARKE = "GEHEIM-PERSON-4711";
const MARKE2 = "FREMDER-BETRIEB-0815";

const person = (id, rolle, einheit) => ({ id, vorname: "V", nachname: `N${id}`, rolle, bereich: einheit,
  status: "aktiv", geburtstag: "1980-01-01", qualifikationen: [], zugehoerigkeit: [{ ab: "2020-01-01", einheitId: einheit }],
  telefon: "0", email: `${id}@example.org` });

const V = (id, status, extra = {}) => ({ id, name: `Vorgabe ${id}`, regelart: "grenzregel", parameter: { groesse: "Überstunden im Monat", hoechstens: 10 },
  geltung: { art: "betrieb" }, bezug: "monat", staerke: "muss", prioritaet: 1, grundlage: { art: "hausregel" }, status, ...extra });
const GESPEICHERT = () => [{ ...V("alt", "aktiv", { name: "Freie Wochenenden", geltung: { art: "personen", personen: [MARKE, "a1"] } }),
  geaendertAm: "2026-11-01T10:00:00.000Z", geaendertVon: "l1", aktiviertAm: "2026-11-01T10:00:00.000Z", aktiviertVon: "l1", version: 3 }];

function bestand({ mit = true, tarif = "pro" } = {}) {
  const einheiten = [{ id: "e1", name: "WB 1", versatzTage: 0 }, { id: "e2", name: "WB 2", versatzTage: 0 }];
  const betrieb = (id, name, vorgaben) => ({
    id, name, branche: "pflege", bundesland: "BE", einheitLabel: "Wohnbereich", status: "aktiv", stichtag: null, laeuftAb: null, pakete: [], matrix: null,
    einheiten: kopie(einheiten), dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00", pause: 30 }],
    zyklus: ["F", "F", "-"], anker: "2026-01-05", zyklusLaenge: 3, gruppen: [], versatzTageVon: {},
    zuschlaege: [], einstellungen: { ruhezeit: 11, maxFolge: 6 }, rollennamen: {}, briefing: [], aufgaben: [], qualifikationen: [],
    genehmigungsstufen: [], tarifwerk: null, version: 9, stand: 1,
    personen: [person("m0", "mitarbeiter", "e1"), person("a1", "mitarbeiter", "e1"), person("r1", "betriebsrat", "ALLE"), person("s1", "subplaner", "e1"),
      person("p1", "planer", "ALLE"), person("l1", "leitung", "ALLE")],
    abweichungen: {}, planstaende: {}, freigaben: {}, unterschreitungen: [], belegung: {}, therapie: {}, aushang: [], monatsabschluss: {},
    istEingefroren: {}, standorte: [], abwesenheiten: [], krankmeldungen: [], anfragen: [], wuensche: [], einspruenge: [], ausschreibungen: [],
    selbstplanung: [], nachrichten: [], notrufe: [], erfassung: {}, einstempeln: {}, fahrzeiten: {}, checks: {}, ansichten: {},
    kompetenzen: [], einarbeitung: [], aenderungen: [], bestaetigungen: [], dienstbuch: [], uebergaben: [], protokoll: [],
    notizen: {}, tagesnotizen: {}, tarif, seit: "2026-01-01", preisgestaltung: {}, kontakt: "k@example.org",
    ...(vorgaben ? { vorgaben } : {}),
  });
  const m2vorgaben = [{ ...V("fremd", "aktiv", { name: MARKE2 }), geaendertAm: "2026-11-01T10:00:00.000Z", geaendertVon: "l1", version: 1 }];
  return { version: 9, stand: 1, mandanten: [betrieb("m1", "Haus", mit ? GESPEICHERT() : null), betrieb("m2", "Haus 2", m2vorgaben)] };
}

let raumNr = 0;
async function neuerRaum({ rollen = Object.keys(ROLLEN), mit = true, tarif = "pro" } = {}) {
  const raum = `wp-i4-wege-${++raumNr}`;
  await B.bestandSchreiben(laden(), raum, G.personenAngleichen(G.uebergabenAngleichen(bestand({ mit, tarif }))), { durch: "Pruefung" });
  const token = {};
  for (const k of rollen) {
    const r = ROLLEN[k];
    token[k] = (await sitzungAnlegen({ bestand: raum, name: `V N${r.person}`, rolle: r.rolle, person: r.person, betrieb: r.betrieb || 0,
      mandantId: r.mandant || "m1", einheit: r.einheit || null, ...(r.demo ? { demo: true } : {}) }, 2 * 3600 * 1000)).token;
  }
  return { raum, token };
}
async function gespeichert(raum) {
  const g = await B.bestandLesenStreng(laden(), raum);
  return { bestand: g.bestand, m1: g.bestand.mandanten.find((m) => m.id === "m1"), m2: g.bestand.mandanten.find((m) => m.id === "m2") };
}
const eigenerBetrieb = (g, k) => g.bestand.mandanten.find((m) => m.id === (ROLLEN[k].mandant || "m1"));

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-wp-i4-wege-"));
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
  G = await import("../server/lib/gestalt.mjs");
  ({ sitzungAnlegen } = await import("../server/lib/sitzungen.mjs"));
});
afterAll(async () => {
  delete process.env.CENTRIC_TEILSPEICHERUNG;
  if (wurzel) await rm(wurzel, { recursive: true, force: true });
});

/** Lesen als Rolle, Rumpf ändern, schreiben (Voll-PUT). */
async function schreibeAls(raum, token, k, aendern, { roh } = {}) {
  const g = await anfrage("/api/bestand", { token: token[k] });
  expect(g.status, `${k}: Lesen`).toBe(200);
  const rumpf = { bestand: kopie(g.bestand), etag: g.etag, durch: "Pruefung" };
  const m = rumpf.bestand.mandanten.find((x) => x.id === (ROLLEN[k].mandant || "m1"));
  aendern(m, rumpf);
  return anfrage("/api/bestand", { methode: "PUT", token: token[k], rumpf: roh ? roh(rumpf) : rumpf });
}

describe("1. Lesen je Rolle", () => {
  it("nur org.edit bekommt die Vorgaben; alle anderen weder Text noch Zahl noch Personen", async () => {
    const { token } = await neuerRaum();
    for (const k of ORG_EDIT) {
      const g = await anfrage("/api/bestand", { token: token[k] });
      const v = g.bestand.mandanten[0].vorgaben;
      expect(v, k).toHaveLength(1);
      expect(JSON.stringify(v), k).toContain(MARKE);
      expect(JSON.stringify(g), k).not.toContain(MARKE2);
    }
    for (const k of [...OHNE_ORG_EDIT]) {
      const g = await anfrage("/api/bestand", { token: token[k] });
      expect(g.status, k).toBe(200);
      const s = JSON.stringify(g);
      expect(s, k).not.toContain(MARKE);
      expect(s, k).not.toContain("Freie Wochenenden");
      expect(s, k).not.toContain(MARKE2);
      expect(g.bestand.mandanten[0].vorgaben || [], k).toEqual([]);
    }
    const bt = await anfrage("/api/bestand", { token: token.BT });
    expect(JSON.stringify(bt)).not.toContain(MARKE);
    expect(JSON.stringify(bt)).not.toContain("Freie Wochenenden");
  });
  it("anderer Betrieb im selben Raum: nur die eigenen Vorgaben", async () => {
    const { token } = await neuerRaum();
    const g = await anfrage("/api/bestand", { token: token.LT2 });
    expect(JSON.stringify(g)).toContain(MARKE2);
    expect(JSON.stringify(g)).not.toContain(MARKE);
    expect(JSON.stringify(g)).not.toContain("Freie Wochenenden");
  });
});

describe("2. Schreiben je Rolle mit manipulierten Rümpfen", () => {
  const FAELLE = {
    "neue aktive Vorgabe mit gefälschtem Wer, Wann und Version": (m) => {
      m.vorgaben = [...(m.vorgaben || []), V("neu", "aktiv", { geaendertAm: "1999-01-01T00:00:00.000Z", geaendertVon: "fremd", aktiviertAm: "1999-01-01T00:00:00.000Z", aktiviertVon: "fremd", version: 99 })];
    },
    "leere Liste": (m) => { m.vorgaben = []; },
    "Status geändert, Wer gefälscht": (m) => { m.vorgaben = [{ ...GESPEICHERT()[0], status: "inaktiv", geaendertVon: "fremd" }]; },
    "Unsinn statt Liste": (m) => { m.vorgaben = "x"; },
    "Feld entfernt (veraltete Kopie)": (m) => { delete m.vorgaben; },
  };
  for (const k of OHNE_ORG_EDIT) {
    for (const [name, aendern] of Object.entries(FAELLE)) {
      it(`${k} (${ROLLEN[k].rolle}${ROLLEN[k].demo ? ", Demo" : ""}): ${name} ändert nichts`, async () => {
        const { raum, token } = await neuerRaum();
        const vorher = await gespeichert(raum);
        await schreibeAls(raum, token, k, aendern);
        const nachher = await gespeichert(raum);
        expect(nachher.m1.vorgaben).toEqual(vorher.m1.vorgaben);
        expect(nachher.m2.vorgaben).toEqual(vorher.m2.vorgaben);
      });
    }
  }
  it("Betreiber: auch mit gefälschtem Rumpf bleiben die Vorgaben des Betriebs unverändert", async () => {
    const { raum, token } = await neuerRaum();
    const vorher = await gespeichert(raum);
    const g = await anfrage("/api/bestand", { token: token.BT });
    const rumpf = { bestand: kopie(g.bestand), etag: g.etag, durch: "Pruefung" };
    for (const m of rumpf.bestand.mandanten || []) m.vorgaben = [V("boese", "aktiv")];
    await anfrage("/api/bestand", { methode: "PUT", token: token.BT, rumpf });
    const nachher = await gespeichert(raum);
    expect(nachher.m1.vorgaben).toEqual(vorher.m1.vorgaben);
    expect(nachher.m2.vorgaben).toEqual(vorher.m2.vorgaben);
  });

  for (const k of ORG_EDIT) {
    it(`${k}: legt an; Wann, Wer und Version setzt der Server, gefälschte Angaben verfallen`, async () => {
      const { raum, token } = await neuerRaum();
      const a = await schreibeAls(raum, token, k, FAELLE["neue aktive Vorgabe mit gefälschtem Wer, Wann und Version"]);
      expect(a.status, JSON.stringify(a).slice(0, 200)).toBe(200);
      const { m1 } = await gespeichert(raum);
      const neu = m1.vorgaben.find((v) => v.id === "neu");
      expect(neu.geaendertVon).toBe(ROLLEN[k].person);
      expect(neu.aktiviertVon).toBe(ROLLEN[k].person);
      expect(neu.geaendertAm).not.toBe("1999-01-01T00:00:00.000Z");
      expect(Date.parse(neu.geaendertAm)).toBeGreaterThan(Date.parse("2026-11-01"));
      expect(neu.aktiviertAm).toBe(neu.geaendertAm);
      expect(neu.version).toBe(1);
      /* Die bestehende Vorgabe bleibt unberührt (Stempel und Version aus dem gespeicherten Stand). */
      expect(m1.vorgaben.find((v) => v.id === "alt")).toEqual(GESPEICHERT()[0]);
    });
    it(`${k}: Änderung zählt die Version hoch, behält den ersten Aktivierer; Löschen geht`, async () => {
      const { raum, token } = await neuerRaum();
      await schreibeAls(raum, token, k, (m) => { m.vorgaben[0].prioritaet = 5; m.vorgaben[0].version = 1; m.vorgaben[0].aktiviertVon = "fremd"; });
      const { m1 } = await gespeichert(raum);
      expect(m1.vorgaben[0]).toMatchObject({ prioritaet: 5, version: 4, aktiviertVon: "l1", aktiviertAm: "2026-11-01T10:00:00.000Z", geaendertVon: ROLLEN[k].person });
      await schreibeAls(raum, token, k, (m) => { m.vorgaben = []; });
      expect((await gespeichert(raum)).m1.vorgaben).toEqual([]);
    });
  }

  it("veraltete Kopie der Planung: leere Vorgaben plus erlaubte Änderung — kein 403, Änderung gilt, Vorgaben bleiben", async () => {
    const { raum, token } = await neuerRaum();
    const vorher = await gespeichert(raum);
    const a = await schreibeAls(raum, token, "PL", (m) => { m.vorgaben = []; m.dienstarten = m.dienstarten.map((d) => (d.id === "F" ? { ...d, ende: "14:15" } : d)); });
    expect(a.status, JSON.stringify(a).slice(0, 300)).toBe(200);
    const nachher = await gespeichert(raum);
    expect(nachher.m1.dienstarten.find((d) => d.id === "F").ende).toBe("14:15");
    expect(nachher.m1.vorgaben).toEqual(vorher.m1.vorgaben);
  });
  it("anderer Betrieb: die Leitung von Betrieb 2 ändert die eigenen Vorgaben, die von Betrieb 1 bleiben", async () => {
    const { raum, token } = await neuerRaum();
    const vorher = await gespeichert(raum);
    const a = await schreibeAls(raum, token, "LT2", (m) => { m.vorgaben = [{ ...m.vorgaben[0], prioritaet: 7 }]; });
    expect(a.status, JSON.stringify(a).slice(0, 200)).toBe(200);
    const nachher = await gespeichert(raum);
    expect(nachher.m1.vorgaben).toEqual(vorher.m1.vorgaben);
    expect(nachher.m2.vorgaben.find((v) => v.id === "fremd")).toMatchObject({ prioritaet: 7, version: 2, geaendertVon: "l1" });
  });
  it("anderer Betrieb: ein gefälschter Rumpf mit fremdem Betrieb ändert dessen Vorgaben nicht", async () => {
    const { raum, token } = await neuerRaum();
    const vorher = await gespeichert(raum);
    await schreibeAls(raum, token, "LT2", (m, rumpf) => {
      const fremd = kopie(vorher.m1); fremd.vorgaben = [V("boese", "aktiv")];
      rumpf.bestand.mandanten = [fremd, ...rumpf.bestand.mandanten];
    });
    expect((await gespeichert(raum)).m1.vorgaben).toEqual(vorher.m1.vorgaben);
  });
  it("die Leitung von Betrieb 1 ändert nichts an den Vorgaben von Betrieb 2", async () => {
    const { raum, token } = await neuerRaum();
    const vorher = await gespeichert(raum);
    await schreibeAls(raum, token, "LT", (m, rumpf) => {
      m.vorgaben = [];
      rumpf.bestand.mandanten = [...rumpf.bestand.mandanten, { ...kopie(vorher.m2), vorgaben: [V("boese", "aktiv")] }];
    });
    expect((await gespeichert(raum)).m2.vorgaben).toEqual(vorher.m2.vorgaben);
  });
});

describe("3. Obergrenzen und geschlossenes Schema (Leitung, über PUT)", () => {
  const abgewiesen = async (aendern, { tarif = "pro", roh } = {}) => {
    const { raum, token } = await neuerRaum({ rollen: ["LT"], tarif });
    const vorher = await gespeichert(raum);
    const a = await schreibeAls(raum, token, "LT", aendern, { roh });
    const nachher = await gespeichert(raum);
    expect(nachher.m1.vorgaben, "nichts gespeichert").toEqual(vorher.m1.vorgaben);
    return a;
  };
  it("mehr als 200 Vorgaben", async () => {
    const a = await abgewiesen((m) => { m.vorgaben = Array.from({ length: 201 }, (_, i) => V(`v${i}`, "entwurf")); }, { tarif: "enterprise" });
    expect(a.status).toBeGreaterThanOrEqual(400);
  });
  it("Name über 80 Zeichen, Beschreibung über 500, Parameter über 2000 Zeichen", async () => {
    for (const aendern of [(m) => { m.vorgaben.push(V("lang", "entwurf", { name: "x".repeat(81) })); },
      (m) => { m.vorgaben.push(V("lang", "entwurf", { beschreibung: "x".repeat(501) })); },
      (m) => { m.vorgaben.push(V("lang", "entwurf", { parameter: { groesse: "x".repeat(2100), hoechstens: 1 } })); }])
      expect((await abgewiesen(aendern)).status).toBeGreaterThanOrEqual(400);
  });
  it("unbekannte Felder, Kennung, Priorität, Regelart, doppelte Kennung", async () => {
    for (const aendern of [(m) => { m.vorgaben.push({ ...V("x1", "entwurf"), extra: 1 }); },
      (m) => { m.vorgaben.push(V("Gross Buchstabe", "entwurf")); },
      (m) => { m.vorgaben.push(V("p100", "entwurf", { prioritaet: 100 })); },
      (m) => { m.vorgaben.push(V("magie", "entwurf", { regelart: "magie" })); },
      (m) => { m.vorgaben.push(V("alt", "entwurf")); },
      (m) => { m.vorgaben.push(V("pers", "entwurf", { name: "Keine Krankheitstage" })); }])
      expect((await abgewiesen(aendern)).status).toBeGreaterThanOrEqual(400);
  });
  it("__proto__ im rohen JSON ist ein unbekanntes Feld und wird abgewiesen", async () => {
    const a = await abgewiesen(() => {}, { roh: (rumpf) => {
      rumpf.bestand.mandanten[0].vorgaben.push(V("proto", "entwurf"));
      return JSON.stringify(rumpf).replace('"id":"proto"', '"__proto__":{"admin":true},"id":"proto"');
    } });
    expect(a.status).toBeGreaterThanOrEqual(400);
    expect(({}).admin).toBeUndefined();
  });
  it("Stufengrenze: in Basis sechs aktive abgewiesen, fünf gehen; Entwürfe zählen nicht", async () => {
    const aktiv = (n) => Array.from({ length: n }, (_, i) => V(`a${i}`, "aktiv"));
    expect((await abgewiesen((m) => { m.vorgaben = aktiv(6); }, { tarif: "basis" })).status).toBeGreaterThanOrEqual(400);
    const { raum, token } = await neuerRaum({ rollen: ["LT"], tarif: "basis", mit: false });
    const a = await schreibeAls(raum, token, "LT", (m) => { m.vorgaben = [...aktiv(5), ...Array.from({ length: 10 }, (_, i) => V(`e${i}`, "entwurf"))]; });
    expect(a.status, JSON.stringify(a).slice(0, 200)).toBe(200);
    expect((await gespeichert(raum)).m1.vorgaben).toHaveLength(15);
  });
});

describe("4. Rundweg", () => {
  it("mit Vorgaben: GET und unveränderter PUT ändern für jede Rolle nichts (Stempel bleiben)", async () => {
    for (const k of [...ORG_EDIT, ...OHNE_ORG_EDIT]) {
      const { raum, token } = await neuerRaum();
      const vorher = await gespeichert(raum);
      const a = await schreibeAls(raum, token, k, () => {});
      expect([200, 403], `${k}: ${JSON.stringify(a).slice(0, 150)}`).toContain(a.status);
      const nachher = await gespeichert(raum);
      expect(nachher.m1.vorgaben, k).toEqual(vorher.m1.vorgaben);
      expect(nachher.m2.vorgaben, k).toEqual(vorher.m2.vorgaben);
    }
  });
  it("Altbestand ohne das Feld: nach dem Rundweg jeder Rolle bekommt der Betrieb keines", async () => {
    for (const k of [...ORG_EDIT, ...OHNE_ORG_EDIT]) {
      const { raum, token } = await neuerRaum({ mit: false });
      await schreibeAls(raum, token, k, () => {});
      const { m1 } = await gespeichert(raum);
      expect(Object.prototype.hasOwnProperty.call(m1, "vorgaben"), k).toBe(false);
    }
  });
  it("Altbestand: die Leitung legt die erste Vorgabe an, die Planung sieht sie danach nicht", async () => {
    const { raum, token } = await neuerRaum({ mit: false });
    const a = await schreibeAls(raum, token, "LT", (m) => { m.vorgaben = [V("erste", "entwurf")]; });
    expect(a.status).toBe(200);
    const g = await anfrage("/api/bestand", { token: token.PL });
    expect(JSON.stringify(g)).not.toContain("Vorgabe erste");
  });
});

describe("5. Teilweg (POST /api/bestand/teile) ist nie großzügiger als der Voll-PUT", () => {
  const stabil = (x) => {
    if (x === undefined) return "null";
    if (x === null || typeof x !== "object") return JSON.stringify(x);
    if (Array.isArray(x)) return `[${x.map((e) => (e === undefined ? "null" : stabil(e))).join(",")}]`;
    return `{${Object.keys(x).filter((k) => x[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${stabil(x[k])}`).join(",")}}`;
  };
  const version = (x) => createHash("sha256").update(stabil(x)).digest("hex").slice(0, 32);
  const NEU = () => [...GESPEICHERT(), V("neu", "aktiv", { geaendertVon: "fremd", version: 99 })];
  for (const k of [...ORG_EDIT, ...OHNE_ORG_EDIT]) {
    it(`${k}: gleicher Status und gleicher Stand wie der Voll-PUT`, async () => {
      const A = await neuerRaum({ rollen: [k] });
      const Bv = await neuerRaum({ rollen: [k] });
      const gA = await anfrage("/api/bestand", { token: A.token[k] });
      const m = gA.bestand.mandanten[0];
      if (!gA.teile) return;   // Teilweg für diese Rolle nicht angeboten: nichts zu vergleichen
      const delta = { format: 1, epoche: gA.teile.epoche, durch: "Pruefung",
        kern: { vorgaben: { basis: gA.teile.versionen["kern:vorgaben"] ?? version(m.vorgaben), wert: NEU() } } };
      const t = await anfrage("/api/bestand/teile", { methode: "POST", token: A.token[k], rumpf: delta });
      const v = await schreibeAls(Bv.raum, Bv.token, k, (mm) => { mm.vorgaben = NEU(); });
      const nachA = await gespeichert(A.raum);
      const nachB = await gespeichert(Bv.raum);
      const maske = (x) => JSON.parse(JSON.stringify(x).replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z/g, "ZEIT"));
      if (typeof t.code === "string" && t.code.startsWith("TEILE_") && t.code !== "TEILE_KONFLIKT") {
        expect(nachA.m1.vorgaben, `${k}: früh abgewiesen, nichts geschrieben`).toEqual(GESPEICHERT());
      } else {
        expect(t.status, `${k}: Teil ${JSON.stringify(t).slice(0, 150)} / Voll ${JSON.stringify(v).slice(0, 150)}`).toBe(v.status);
        expect(maske(nachA.m1.vorgaben), `${k}: Stand`).toEqual(maske(nachB.m1.vorgaben));
      }
      if (ORG_EDIT.includes(k)) expect(nachA.m1.vorgaben.map((x) => x.id), k).toEqual(["alt", "neu"]);
      else expect(nachA.m1.vorgaben, k).toEqual(GESPEICHERT());
      const neu = nachA.m1.vorgaben.find((x) => x.id === "neu");
      if (neu) { expect(neu.geaendertVon).toBe(ROLLEN[k].person); expect(neu.version).toBe(1); }
    });
  }
});
