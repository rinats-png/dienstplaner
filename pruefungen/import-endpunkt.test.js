/* ==========================================================================
   IMP-3 — Endpunkt /api/import: Rollen, Mandant, Wiederholschutz, Grenzen,
   Dubletten, org.edit, atomare Übernahme (Fehlerinjektion), Protokoll.

   Nur synthetische Daten. Aufruf:
     npx vitest run pruefungen/import-endpunkt.test.js
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { enthaeltToken } from "./hilfen/token-suche.mjs";
import { mappe } from "./import-parser-hilfen.mjs";
import * as XLSX from "../vendor/sheetjs/xlsx.mjs";
import { parseDatei } from "../server/lib/import/parser.mjs";
import { datumAusZelle } from "../server/lib/import/personen.mjs";

const WIRT = "127.0.0.1:3000";
let wurzel, laden, imp, B, sitzungAnlegen, V, U, spurStore;
let raumNr = 0;
let nr = 0;

const kopf = (token, extra = {}) => {
  nr += 1;
  return { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.31.${Math.floor(nr / 250) % 250}.${nr % 250}`,
    ...(token ? { authorization: `Bearer ${token}` } : {}), ...extra };
};
async function hochladen(token, datei, { art, name = "personal-test.csv", typ = "application/octet-stream" } = {}) {
  const a = await imp(new Request(`http://${WIRT}/api/import/upload${art ? `?art=${art}` : ""}`, { method: "POST",
    headers: kopf(token, { "content-type": typ, "x-dateiname": encodeURIComponent(name) }), body: datei }), {});
  let d = {}; try { d = await a.json(); } catch { /* leer */ }
  return { status: a.status, ...d };
}
async function schritt(token, weg, rumpf) {
  const a = await imp(new Request(`http://${WIRT}/api/import/${weg}`, { method: "POST",
    headers: kopf(token, { "content-type": "application/json" }), body: JSON.stringify(rumpf) }), {});
  let d = {}; try { d = await a.json(); } catch { /* leer */ }
  return { status: a.status, ...d };
}

const csv = (zeilen) => Buffer.from(zeilen.map((z) => z.join(";")).join("\n"), "utf8");
const KOPF = ["Personalnummer", "Nachname", "Vorname", "E-Mail", "Einheit", "Eintritt", "Wochenstunden"];

const person = (id, rolle, einheit, mehr = {}) => ({ id, vorname: `V${id}`, nachname: `N${id}`, rolle, bereich: einheit, status: "aktiv",
  email: "", funktion: "Fachkraft", eintritt: "2020-01-01", wochenstunden: 38.5, urlaubsanspruch: 30, qualifikationen: [],
  zugehoerigkeit: [{ ab: "2020-01-01", einheitId: einheit }], ...mehr });
const betrieb = (id, personen) => ({ id, name: `Haus ${id}`, status: "aktiv",
  einheiten: [{ id: `${id}-e1`, name: "Wohnbereich 1", versatz: 0 }], standorte: [], zyklus: { wochen: 1, tage: ["-", "-", "-", "-", "-", "-", "-"] },
  dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00", pause: 30 }], qualifikationen: [],
  einstellungen: { ruhezeit: 11, maxFolge: 6 }, personen,
  abweichungen: {}, abwesenheiten: [], erfassung: {}, einstempeln: {}, anfragen: [], nachrichten: [], bestaetigungen: [] });

/** Ein Raum mit zwei Betrieben: m1 (Index 0) und m2 (Index 1). */
async function neuerRaum() {
  const raum = `imp3-${++raumNr}`;
  const m1 = betrieb("m1", [person("l1", "leitung", "ALLE"), person("p1", "planer", "ALLE"), person("s1", "subplaner", "m1-e1"),
    person("a1", "mitarbeiter", "m1-e1"), person("br1", "betriebsrat", "ALLE"),
    person("x1", "mitarbeiter", "m1-e1", { vorname: "Erika", nachname: "Beispiel", personalnummer: "1001", email: "alt@example.test", eintritt: "2019-03-01" }),
    person("x2", "mitarbeiter", "m1-e1", { vorname: "Otto", nachname: "Muster" })]);
  const m2 = betrieb("m2", [person("l2", "leitung", "ALLE"),
    person("y1", "mitarbeiter", "m2-e1", { vorname: "Fremd", nachname: "Person", personalnummer: "2002" })]);
  await B.bestandSchreiben(laden(), raum, { version: 9, mandanten: [m1, m2] }, { durch: "Prüfung" });
  const t = {};
  const anlegen = async (k, rolle, person, betriebIdx, mandantId, einheit = null) => {
    t[k] = (await sitzungAnlegen({ bestand: raum, name: `Test ${k}`, rolle, person, betrieb: betriebIdx, mandantId, einheit }, 2 * 3600 * 1000)).token;
  };
  await anlegen("LT", "leitung", "l1", 0, "m1");
  await anlegen("PL", "planer", "p1", 0, "m1");
  await anlegen("SV", "subplaner", "s1", 0, "m1", "m1-e1");
  await anlegen("MA", "mitarbeiter", "a1", 0, "m1");
  await anlegen("BR", "betriebsrat", "br1", 0, "m1");
  await anlegen("LT2", "leitung", "l2", 1, "m2");
  return { raum, t };
}
const lesen = async (raum) => (await B.bestandLesen(laden(), raum));
const betriebVon = async (raum, id) => (await lesen(raum)).bestand.mandanten.find((m) => m.id === id);

/** Upload → Analyse → Vorschau, gibt alles zurück. */
async function bisVorschau(token, datei, vorschauRumpf = {}, analyseRumpf = {}) {
  const up = await hochladen(token, datei);
  expect(up.status, JSON.stringify(up)).toBe(201);
  const an = await schritt(token, "analyse", { vorgang: up.vorgang, ...analyseRumpf });
  expect(an.status, JSON.stringify(an).slice(0, 300)).toBe(200);
  const vs = await schritt(token, "vorschau", { vorgang: up.vorgang, ...vorschauRumpf });
  return { up, an, vs };
}

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-imp3-"));
  process.env.CENTRIC_IMPORT_AKTIV = "true";   // Server-Schalter (Vorgabe aus); diese Datei prüft den eingeschalteten Import
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
  const { getStore } = await import("../server/lib/ablage.mjs");
  laden = () => getStore({ name: "centric", consistency: "strong" });
  spurStore = () => getStore({ name: "centric-spur" });
  imp = (await import("../server/funktionen/import.mjs")).default;
  B = await import("../server/lib/bestand.mjs");
  V = await import("../server/lib/import/vorgaenge.mjs");
  U = await import("../server/lib/import/uebernahme.mjs");
  ({ sitzungAnlegen } = await import("../server/lib/sitzungen.mjs"));
});
afterAll(async () => { if (wurzel) await rm(wurzel, { recursive: true, force: true }); });
afterEach(() => { U._pruefhaken.nachDatensatz = null; U._pruefhaken.ablage = null; if (V._pruefhaken) V._pruefhaken.vorParser = null; V._zuruecksetzen(); });

const DATEI_ZWEI = () => csv([KOPF, ["3001", "Neumann", "Lena", "lena.neumann@example.test", "Wohnbereich 1", "01.02.2026", "30"],
  ["3002", "Kranz", "Paul", "", "Wohnbereich 1", "", "40"]]);

describe("IMP-3 Rollen und Anmeldung", { timeout: 120000 }, () => {
  it("ohne Sitzung 401", async () => {
    const r = await hochladen(null, DATEI_ZWEI());
    expect(r.status).toBe(401);
  });
  it("Leitung und Planung dürfen hochladen (201)", async () => {
    const { t } = await neuerRaum();
    expect((await hochladen(t.LT, DATEI_ZWEI())).status).toBe(201);
    expect((await hochladen(t.PL, DATEI_ZWEI())).status).toBe(201);
  });
  for (const k of ["SV", "MA", "BR"]) {
    it(`${k} darf nicht importieren (403, nichts geparst, nichts gespeichert)`, async () => {
      const { raum, t } = await neuerRaum();
      const vorher = await lesen(raum);
      const r = await hochladen(t[k], DATEI_ZWEI());
      expect(r.status).toBe(403);
      expect(r.vorgang).toBeUndefined();
      expect(V._anzahl()).toBe(0);
      expect((await lesen(raum)).stand).toBe(vorher.stand);
    });
  }
  it("falsche Methode 405, fremde Herkunft 403, falscher Inhaltstyp 415", async () => {
    const { t } = await neuerRaum();
    const g = await imp(new Request(`http://${WIRT}/api/import/upload`, { method: "GET", headers: kopf(t.LT) }), {});
    expect(g.status).toBe(405);
    const fremd = await imp(new Request(`http://${WIRT}/api/import/upload`, { method: "POST",
      headers: { ...kopf(t.LT, { "content-type": "application/octet-stream" }), origin: "https://boese.example" }, body: DATEI_ZWEI() }), {});
    expect(fremd.status).toBe(403);
    expect((await hochladen(t.LT, DATEI_ZWEI(), { typ: "text/plain" })).status).toBe(415);
  });
});

describe("IMP-3 Ablauf Upload → Analyse → Vorschau → Übernahme", { timeout: 120000 }, () => {
  it("übernimmt zwei neue Personen mit Personalnummer, ohne erfundene E-Mail", async () => {
    const { raum, t } = await neuerRaum();
    const { up, an, vs } = await bisVorschau(t.LT, DATEI_ZWEI());
    expect(up.format).toBe("csv");
    expect(an.fehlendePflicht).toEqual([]);
    expect(an.zuordnung.personalnummer).toBe(0);
    expect(an.datensaetze.map((d) => d.vorgabe)).toEqual(["neu", "neu"]);
    expect(vs.status).toBe(200);
    expect(vs.zaehler).toMatchObject({ neu: 2, aktualisiert: 0, uebersprungen: 0 });
    expect(vs.vorschau.zeitraum.von <= vs.vorschau.zeitraum.bis).toBe(true);
    expect(Array.isArray(vs.vorschau.zyklen)).toBe(true);
    const vorher = await betriebVon(raum, "m1");
    /* Ohne Bestätigung keine Übernahme. */
    expect((await schritt(t.LT, "uebernahme", { vorgang: up.vorgang })).status).toBe(409);
    expect((await betriebVon(raum, "m1")).personen.length).toBe(vorher.personen.length);
    const ue = await schritt(t.LT, "uebernahme", { vorgang: up.vorgang, bestaetigung: vs.bestaetigung });
    expect(ue.status, JSON.stringify(ue)).toBe(200);
    expect(ue.zaehler).toMatchObject({ neu: 2, aktualisiert: 0, uebersprungen: 0 });
    const m1 = await betriebVon(raum, "m1");
    const lena = m1.personen.find((p) => p.personalnummer === "3001");
    const paul = m1.personen.find((p) => p.personalnummer === "3002");
    expect(lena).toMatchObject({ vorname: "Lena", nachname: "Neumann", email: "lena.neumann@example.test", eintritt: "2026-02-01",
      wochenstunden: 30, rolle: "mitarbeiter" });
    expect(lena.zugehoerigkeit[0].einheitId).toBe("m1-e1");
    expect(paul.email).toBe("");
    /* Der andere Betrieb bleibt unberührt. */
    expect((await betriebVon(raum, "m2")).personen.length).toBe(2);
    /* Nach der Übernahme hält der Vorgang keine Inhalte mehr. */
    const roh = V._roh(up.vorgang);
    expect(roh.zeilen).toBeNull();
    expect(roh.blaetter).toBeNull();
  });
  it("liest auch eine XLSX-Datei", async () => {
    const { raum, t } = await neuerRaum();
    const datei = mappe({ Personal: [KOPF, ["4001", "Wolf", "Ida", "", "Wohnbereich 1", "2026-03-01", 20]] });
    const { up, vs } = await bisVorschau(t.PL, datei);
    expect(up.format).toBe("xlsx");
    const ue = await schritt(t.PL, "uebernahme", { vorgang: up.vorgang, bestaetigung: vs.bestaetigung });
    expect(ue.status).toBe(200);
    expect((await betriebVon(raum, "m1")).personen.some((p) => p.personalnummer === "4001" && p.wochenstunden === 20)).toBe(true);
  });
  it("Fehler je Datensatz nennen das Feld, nicht den Wert", async () => {
    const { t } = await neuerRaum();
    const { an } = await bisVorschau(t.LT, csv([KOPF, ["5001", "Kurz", "Kai", "kai-kaputt-adresse", "Wohnbereich 1", "31.02.2026", "abc"]]));
    const d = an.datensaetze[0];
    expect(d.fehler).toEqual(expect.arrayContaining(["E-Mail ungültig", "Eintrittsdatum ungültig", "Wochenstunden ungültig"]));
    expect(JSON.stringify(d.fehler)).not.toContain("kai-kaputt-adresse");
    expect(JSON.stringify(d.fehler)).not.toContain("31.02.2026");
    expect(d.erlaubt).toEqual(["ueberspringen"]);
  });
});

describe("IMP-3 Wiederholschutz", { timeout: 120000 }, () => {
  it("derselbe Vorgang zweimal: zweites Mal 409, nichts doppelt", async () => {
    const { raum, t } = await neuerRaum();
    const { up, vs } = await bisVorschau(t.LT, DATEI_ZWEI());
    expect((await schritt(t.LT, "uebernahme", { vorgang: up.vorgang, bestaetigung: vs.bestaetigung })).status).toBe(200);
    const zweit = await schritt(t.LT, "uebernahme", { vorgang: up.vorgang, bestaetigung: vs.bestaetigung });
    expect(zweit.status).toBe(409);
    expect(zweit.code).toBe("BEREITS_UEBERNOMMEN");
    expect((await betriebVon(raum, "m1")).personen.filter((p) => p.personalnummer === "3001").length).toBe(1);
  });
  it("Doppelklick (zwei gleichzeitige Übernahmen): genau eine gelingt", async () => {
    const { raum, t } = await neuerRaum();
    const { up, vs } = await bisVorschau(t.LT, DATEI_ZWEI());
    const [a, b] = await Promise.all([1, 2].map(() => schritt(t.LT, "uebernahme", { vorgang: up.vorgang, bestaetigung: vs.bestaetigung })));
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect((await betriebVon(raum, "m1")).personen.filter((p) => p.personalnummer === "3001").length).toBe(1);
  });
  it("dieselbe Datei in einem neuen Vorgang: 409 DATEI_BEREITS_UEBERNOMMEN", async () => {
    const { raum, t } = await neuerRaum();
    const erst = await bisVorschau(t.LT, DATEI_ZWEI());
    expect((await schritt(t.LT, "uebernahme", { vorgang: erst.up.vorgang, bestaetigung: erst.vs.bestaetigung })).status).toBe(200);
    const stand = (await lesen(raum)).stand;
    /* Neuer Vorgang, gleiche Datei; die Personen sind jetzt Dubletten — „aktualisieren" bestätigt, damit es etwas zu tun gäbe. */
    const up = await hochladen(t.LT, DATEI_ZWEI());
    await schritt(t.LT, "analyse", { vorgang: up.vorgang });
    const vs = await schritt(t.LT, "vorschau", { vorgang: up.vorgang, entscheidungen: { 1: "aktualisieren" }, bestaetigungen: { 1: true } });
    expect(vs.status).toBe(200);
    const r = await schritt(t.LT, "uebernahme", { vorgang: up.vorgang, bestaetigung: vs.bestaetigung });
    expect(r.status).toBe(409);
    expect(r.code).toBe("DATEI_BEREITS_UEBERNOMMEN");
    expect((await lesen(raum)).stand).toBe(stand);
  });
});

describe("IMP-3 Grenzen und beschädigte Dateien", { timeout: 180000 }, () => {
  it("über 10 MB: 413, kein Vorgang", async () => {
    const { t } = await neuerRaum();
    const r = await hochladen(t.LT, Buffer.alloc(10 * 1024 * 1024 + 1, 0x41));
    expect(r.status).toBe(413);
    expect(r.code).toBe("DATEI_ZU_GROSS");
    expect(V._anzahl()).toBe(0);
  });
  it("20.001 Datenzeilen: 422 ZU_VIELE_ZEILEN", async () => {
    const { t } = await neuerRaum();
    const zeilen = [KOPF];
    for (let i = 0; i < 20001; i++) zeilen.push([`${10000 + i}`, `N${i}`, `V${i}`, "", "Wohnbereich 1", "", "30"]);
    const r = await hochladen(t.LT, csv(zeilen));
    expect(r.status).toBe(422);
    expect(r.code).toBe("ZU_VIELE_ZEILEN");
  });
  it("201 Spalten: 422 ZU_VIELE_SPALTEN", async () => {
    const { t } = await neuerRaum();
    const z = Array.from({ length: 201 }, (_, i) => `S${i}`);
    const r = await hochladen(t.LT, csv([z, z]));
    expect(r.status).toBe(422);
    expect(r.code).toBe("ZU_VIELE_SPALTEN");
  });
  it("abgeschnittene XLSX: verständliche Meldung, kein Stacktrace", async () => {
    const { t } = await neuerRaum();
    const ganz = mappe({ A: [KOPF, ["1", "a", "b", "", "Wohnbereich 1", "", "30"]] });
    const r = await hochladen(t.LT, ganz.subarray(0, Math.floor(ganz.length / 2)), { name: "kaputt.xlsx" });
    expect(r.status).toBe(422);
    expect(["BESCHAEDIGT", "UNBEKANNTES_FORMAT"]).toContain(r.code);
    expect(typeof r.fehler).toBe("string");
    expect(JSON.stringify(r)).not.toMatch(/at \w+ \(|\.mjs:\d+|Error:/);
  });
  it("leere Datei: 422 LEER", async () => {
    const { t } = await neuerRaum();
    const r = await hochladen(t.LT, Buffer.alloc(0));
    expect(r.status).toBe(422);
    expect(r.code).toBe("LEER");
  });
});

describe("IMP-3 Dubletten", { timeout: 120000 }, () => {
  it("mit Personalnummer: Vorgabe klären; „neu“unzulässig; Aktualisieren ohne Bestätigung abgewiesen; mit Bestätigung nur erlaubte Felder", async () => {
    const { raum, t } = await neuerRaum();
    const datei = csv([KOPF, ["1001", "Beispiel", "Erika", "neu@example.test", "Wohnbereich 1", "01.01.2025", "25"]]);
    const up = await hochladen(t.LT, datei);
    const an = await schritt(t.LT, "analyse", { vorgang: up.vorgang });
    expect(an.datensaetze[0].dublette).toEqual({ art: "personalnummer", personId: "x1" });
    expect(an.datensaetze[0].vorgabe).toBe("klaeren");
    expect(an.datensaetze[0].erlaubt).not.toContain("neu");
    /* Ohne Entscheidung: nichts zu übernehmen. */
    const v0 = await schritt(t.LT, "vorschau", { vorgang: up.vorgang });
    expect(v0.zaehler).toMatchObject({ neu: 0, aktualisiert: 0, offen: 1 });
    expect((await schritt(t.LT, "vorschau", { vorgang: up.vorgang, entscheidungen: { 1: "neu" } })).code).toBe("ENTSCHEIDUNG_UNZULAESSIG");
    const ohne = await schritt(t.LT, "vorschau", { vorgang: up.vorgang, entscheidungen: { 1: "aktualisieren" } });
    expect(ohne.status).toBe(422);
    expect(ohne.code).toBe("AKTUALISIERUNG_OHNE_BESTAETIGUNG");
    const mit = await schritt(t.LT, "vorschau", { vorgang: up.vorgang, entscheidungen: { 1: "aktualisieren" }, bestaetigungen: { 1: true } });
    expect(mit.status).toBe(200);
    expect(mit.vorschau.aktualisieren[0].aenderungen.map((a) => a.feld).sort()).toEqual(["email", "wochenstunden"]);
    const ue = await schritt(t.LT, "uebernahme", { vorgang: up.vorgang, bestaetigung: mit.bestaetigung });
    expect(ue.status).toBe(200);
    const x1 = (await betriebVon(raum, "m1")).personen.find((p) => p.id === "x1");
    expect(x1.email).toBe("neu@example.test");
    expect(x1.wochenstunden).toBe(25);
    expect(x1.eintritt, "Eintritt wird nie überschrieben").toBe("2019-03-01");
    expect((await betriebVon(raum, "m1")).personen.filter((p) => p.personalnummer === "1001").length).toBe(1);
  });
  it("ohne Personalnummer: nur Vorschlag, nie Aktualisieren über den Namen; „neu“nur ausdrücklich", async () => {
    const { raum, t } = await neuerRaum();
    const datei = csv([["Nachname", "Vorname", "Einheit"], ["Muster", "Otto", "Wohnbereich 1"]]);
    const up = await hochladen(t.LT, datei);
    const an = await schritt(t.LT, "analyse", { vorgang: up.vorgang });
    expect(an.datensaetze[0].dublette).toEqual({ art: "name", personId: "x2" });
    expect(an.datensaetze[0].erlaubt).not.toContain("aktualisieren");
    expect(an.datensaetze[0].vorgabe).toBe("klaeren");
    expect((await schritt(t.LT, "vorschau", { vorgang: up.vorgang, entscheidungen: { 1: "aktualisieren" }, bestaetigungen: { 1: true } })).code)
      .toBe("ENTSCHEIDUNG_UNZULAESSIG");
    const vorgabe = await schritt(t.LT, "vorschau", { vorgang: up.vorgang });
    expect(vorgabe.zaehler.neu).toBe(0);
    const neu = await schritt(t.LT, "vorschau", { vorgang: up.vorgang, entscheidungen: { 1: "neu" } });
    expect(neu.zaehler.neu).toBe(1);
    expect((await schritt(t.LT, "uebernahme", { vorgang: up.vorgang, bestaetigung: neu.bestaetigung })).status).toBe(200);
    const ottos = (await betriebVon(raum, "m1")).personen.filter((p) => p.nachname === "Muster" && p.vorname === "Otto");
    expect(ottos.length).toBe(2);
    expect(ottos.find((p) => p.id === "x2")).toMatchObject({ email: "" });   // die vorhandene unverändert
  });
  it("Personalnummer ist mandantenintern: dieselbe Nummer im anderen Betrieb ist keine Dublette", async () => {
    const { t } = await neuerRaum();
    const up = await hochladen(t.LT, csv([KOPF, ["2002", "Anders", "Anna", "", "Wohnbereich 1", "", "30"]]));
    const an = await schritt(t.LT, "analyse", { vorgang: up.vorgang });
    expect(an.datensaetze[0].dublette).toBeNull();
    expect(an.datensaetze[0].vorgabe).toBe("neu");
  });
  it("dieselbe Personalnummer zweimal in der Datei: beide klären, keiner übernommen", async () => {
    const { t } = await neuerRaum();
    const { an, vs } = await bisVorschau(t.LT, csv([KOPF, ["7001", "Eins", "A", "", "Wohnbereich 1", "", "30"],
      ["7001", "Zwei", "B", "", "Wohnbereich 1", "", "30"]]));
    expect(an.datensaetze.map((d) => d.vorgabe)).toEqual(["klaeren", "klaeren"]);
    expect(vs.zaehler.neu).toBe(0);
  });
});

describe("IMP-3 Organisationseinheiten nur mit org.edit", { timeout: 120000 }, () => {
  const DATEI = () => csv([KOPF, ["8001", "Neu", "Nina", "", "Station Nord", "", "30"], ["8002", "Alt", "Alf", "", "Wohnbereich 1", "", "30"]]);
  it("Planung: fehlende Einheit ist Zuordnungskonflikt; Anlegen verlangt org.edit (403)", async () => {
    const { raum, t } = await neuerRaum();
    const { up, an, vs } = await bisVorschau(t.PL, DATEI());
    expect(an.datensaetze[0].konflikte).toEqual([{ art: "einheit-unbekannt" }]);
    expect(vs.zaehler).toMatchObject({ neu: 1, offen: 1 });
    const anlegen = await schritt(t.PL, "vorschau", { vorgang: up.vorgang, einheitenAnlegen: true });
    expect(anlegen.status).toBe(403);
    expect(anlegen.code).toBe("ORG_EDIT_FEHLT");
    expect((await schritt(t.PL, "vorschau", { vorgang: up.vorgang, entscheidungen: { 1: "neu" } })).code).toBe("ZUORDNUNGSKONFLIKT");
    const ue = await schritt(t.PL, "uebernahme", { vorgang: up.vorgang, bestaetigung: vs.bestaetigung });
    expect(ue.status).toBe(200);
    const m1 = await betriebVon(raum, "m1");
    expect(m1.einheiten.map((e) => e.name)).toEqual(["Wohnbereich 1"]);
    expect(m1.personen.some((p) => p.personalnummer === "8001")).toBe(false);
  });
  it("Leitung (org.edit) legt die fehlende Einheit an", async () => {
    const { raum, t } = await neuerRaum();
    const { up } = await bisVorschau(t.LT, DATEI());
    const vs = await schritt(t.LT, "vorschau", { vorgang: up.vorgang, einheitenAnlegen: true });
    expect(vs.status).toBe(200);
    expect(vs.vorschau.neueEinheiten).toEqual(["Station Nord"]);
    expect(vs.zaehler.neu).toBe(2);
    expect((await schritt(t.LT, "uebernahme", { vorgang: up.vorgang, bestaetigung: vs.bestaetigung })).status).toBe(200);
    const m1 = await betriebVon(raum, "m1");
    const nord = m1.einheiten.find((e) => e.name === "Station Nord");
    expect(nord).toBeTruthy();
    expect(m1.personen.find((p) => p.personalnummer === "8001").zugehoerigkeit[0].einheitId).toBe(nord.id);
  });
});

describe("IMP-3 Mandantentrennung", { timeout: 120000 }, () => {
  it("Leitung eines anderen Betriebs (gleicher Raum) und eines anderen Raums: 404 ohne Auskunft", async () => {
    const { raum, t } = await neuerRaum();
    const anderer = await neuerRaum();
    const { up, vs } = await bisVorschau(t.LT, DATEI_ZWEI());
    for (const fremd of [t.LT2, anderer.t.LT]) {
      for (const weg of ["analyse", "vorschau", "uebernahme", "verwerfen"]) {
        const r = await schritt(fremd, weg, { vorgang: up.vorgang, bestaetigung: vs.bestaetigung });
        expect(r.status, `${weg}`).toBe(404);
        expect(Object.keys(r).sort()).toEqual(["code", "fehler", "status"]);
        expect(r.code).toBe("NICHT_GEFUNDEN");
      }
    }
    /* Auch eine andere Person desselben Betriebs mit Importrecht sieht den Vorgang nicht. */
    expect((await schritt(t.PL, "analyse", { vorgang: up.vorgang })).status).toBe(404);
    /* Der Vorgang lebt für den Besitzer weiter, und geschrieben wird nur in den eigenen Betrieb. */
    expect((await schritt(t.LT, "uebernahme", { vorgang: up.vorgang, bestaetigung: vs.bestaetigung })).status).toBe(200);
    expect((await betriebVon(raum, "m2")).personen.map((p) => p.id).sort()).toEqual(["l2", "y1"]);
    expect((await betriebVon(anderer.raum, "m1")).personen.some((p) => p.personalnummer === "3001")).toBe(false);
  });
  it("Leitung von m2 importiert nur in m2", async () => {
    const { raum, t } = await neuerRaum();
    const { up, vs } = await bisVorschau(t.LT2, csv([KOPF, ["9001", "Zweit", "Zoe", "", "Wohnbereich 1", "", "30"]]));
    expect((await schritt(t.LT2, "uebernahme", { vorgang: up.vorgang, bestaetigung: vs.bestaetigung })).status).toBe(200);
    expect((await betriebVon(raum, "m2")).personen.find((p) => p.personalnummer === "9001").zugehoerigkeit[0].einheitId).toBe("m2-e1");
    expect((await betriebVon(raum, "m1")).personen.some((p) => p.personalnummer === "9001")).toBe(false);
  });
});

describe("IMP-3 Übernahme ganz oder gar nicht (Fehlerinjektion)", { timeout: 120000 }, () => {
  const DREI = () => csv([KOPF, ["6001", "A", "Eins", "", "Wohnbereich 1", "", "30"], ["6002", "B", "Zwei", "", "Wohnbereich 1", "", "30"],
    ["6003", "C", "Drei", "", "Wohnbereich 1", "", "30"]]);
  it("Abbruch nach dem zweiten von drei Datensätzen: kein Teilbestand; danach gelingt die Wiederholung", async () => {
    const { raum, t } = await neuerRaum();
    const { up, vs } = await bisVorschau(t.LT, DREI());
    const vorher = await lesen(raum);
    U._pruefhaken.nachDatensatz = (i) => { if (i === 2) throw new Error("Prüfung: Abbruch mitten in der Übernahme"); };
    const r = await schritt(t.LT, "uebernahme", { vorgang: up.vorgang, bestaetigung: vs.bestaetigung });
    expect(r.status).toBe(500);
    expect(r.code).toBe("UEBERNAHME_ABGEBROCHEN");
    expect(JSON.stringify(r)).not.toContain("Prüfung: Abbruch");
    const nach = await lesen(raum);
    expect(nach.stand).toBe(vorher.stand);
    expect(nach.bestand.mandanten[0].personen.some((p) => ["6001", "6002", "6003"].includes(p.personalnummer))).toBe(false);
    U._pruefhaken.nachDatensatz = null;
    const wieder = await schritt(t.LT, "uebernahme", { vorgang: up.vorgang, bestaetigung: vs.bestaetigung });
    expect(wieder.status).toBe(200);
    expect((await betriebVon(raum, "m1")).personen.filter((p) => ["6001", "6002", "6003"].includes(p.personalnummer)).length).toBe(3);
  });
  it("Plattenfehler vor dem Festschreiben (Journal): nichts übernommen, 503", async () => {
    const { raum, t } = await neuerRaum();
    const { up, vs } = await bisVorschau(t.LT, DREI());
    const vorher = await lesen(raum);
    U._pruefhaken.ablage = (s) => ({ ...s, get: s.get.bind(s), getMetadata: s.getMetadata.bind(s), list: s.list.bind(s), delete: s.delete.bind(s),
      setJSON: async (k, ...rest) => { if (String(k).startsWith("journal:")) throw new Error("Platte voll"); return s.setJSON(k, ...rest); } });
    const r = await schritt(t.LT, "uebernahme", { vorgang: up.vorgang, bestaetigung: vs.bestaetigung });
    expect(r.status).toBe(503);
    expect(r.code).toBe("SCHREIBEN_FEHLGESCHLAGEN");
    const nach = await lesen(raum);
    expect(nach.stand).toBe(vorher.stand);
    expect(nach.bestand.mandanten[0].personen.length).toBe(vorher.bestand.mandanten[0].personen.length);
  });
  it("Plattenfehler nach dem Festschreiben: Journal gilt, alle drei Personen da, keiner halb", async () => {
    const { raum, t } = await neuerRaum();
    const { up, vs } = await bisVorschau(t.LT, DREI());
    let einmal = true;
    U._pruefhaken.ablage = (s) => ({ ...s, get: s.get.bind(s), getMetadata: s.getMetadata.bind(s), list: s.list.bind(s), delete: s.delete.bind(s),
      setJSON: async (k, ...rest) => { if (einmal && String(k).startsWith("kern:")) { einmal = false; throw new Error("Platte weg"); } return s.setJSON(k, ...rest); } });
    const r = await schritt(t.LT, "uebernahme", { vorgang: up.vorgang, bestaetigung: vs.bestaetigung });
    expect(r.status, JSON.stringify(r)).toBe(200);
    U._pruefhaken.ablage = null;
    const m1 = await betriebVon(raum, "m1");
    expect(m1.personen.filter((p) => ["6001", "6002", "6003"].includes(p.personalnummer)).length).toBe(3);
  });
});

describe("IMP-3 Protokoll, Fristen, Gerüst", { timeout: 120000 }, () => {
  it("Protokollzeilen: Zeitpunkt, Person-Id, Zahlen — keine Namen, E-Mails, Personalnummern, Dateinamen", async () => {
    const { t } = await neuerRaum();
    const name = "Geheim-Liste-Neumann.csv";
    const up = await hochladen(t.LT, DATEI_ZWEI(), { name });
    await schritt(t.LT, "analyse", { vorgang: up.vorgang });
    const vs = await schritt(t.LT, "vorschau", { vorgang: up.vorgang });
    expect((await schritt(t.LT, "uebernahme", { vorgang: up.vorgang, bestaetigung: vs.bestaetigung })).status).toBe(200);
    await hochladen(t.MA, DATEI_ZWEI(), { name });   // abgewiesen, auch protokolliert
    const { blobs } = await spurStore().list({ prefix: "" });
    const zeilen = [];
    for (const b of blobs) if (b.key.includes("/import/")) zeilen.push(await spurStore().get(b.key, { type: "json" }));
    expect(zeilen.length).toBeGreaterThanOrEqual(3);
    const text = JSON.stringify(zeilen);
    for (const verboten of ["Neumann", "Lena", "Kranz", "Paul", "lena.neumann", "example.test", "3001", "3002", name, "Geheim"])
      expect(enthaeltToken(text, verboten), `${verboten} als Token im Protokoll`).toBe(false);
    const erfolg = zeilen.find((z) => z.ausgang === "erfolg");
    expect(erfolg).toMatchObject({ art: "import", person: "l1", mandantId: "m1" });
    expect(erfolg.zusatz).toContain("neu 2 · aktualisiert 0 · übersprungen 0");
    expect(typeof erfolg.zeit).toBe("string");
    expect(zeilen.some((z) => z.ausgang === "abgewiesen" && z.person === "a1")).toBe(true);
  });
  it("Fristen: nach 30 Minuten ohne Zugriff ist der Vorgang gelöscht; Verwerfen löscht sofort", async () => {
    const { t } = await neuerRaum();
    const up = await hochladen(t.LT, DATEI_ZWEI());
    expect(V._roh(up.vorgang)).toBeTruthy();
    V.aufraeumen(Date.now() + V.FRISTEN.inaktivMs + 1000);
    expect(V._roh(up.vorgang)).toBeNull();
    expect((await schritt(t.LT, "analyse", { vorgang: up.vorgang })).status).toBe(404);
    const zwei = await hochladen(t.LT, DATEI_ZWEI());
    expect((await schritt(t.LT, "verwerfen", { vorgang: zwei.vorgang })).status).toBe(200);
    expect(V._roh(zwei.vorgang)).toBeNull();
    expect(V.FRISTEN).toEqual({ inaktivMs: 30 * 60 * 1000, hoechstMs: 2 * 60 * 60 * 1000 });
  });
  it("Schichtzyklen: Gerüst ohne Übernahme, Vorschau mit Liste (keine Begrenzung auf einen Zyklus)", async () => {
    const { t } = await neuerRaum();
    const up = await hochladen(t.LT, csv([["Woche", "Mo", "Di"], ["1", "F", "S"]]), { art: "schichtzyklus" });
    expect(up.status).toBe(201);
    const an = await schritt(t.LT, "analyse", { vorgang: up.vorgang });
    expect(an).toMatchObject({ art: "schichtzyklus", unterstuetzt: false, zyklen: [] });
    const vs = await schritt(t.LT, "vorschau", { vorgang: up.vorgang });
    expect(Array.isArray(vs.vorschau.zyklen)).toBe(true);
    expect((await schritt(t.LT, "uebernahme", { vorgang: up.vorgang, bestaetigung: "x" })).status).toBe(422);
  });
  it("Registrierung: genaue Pfade und eigene Rumpfgrenze von 10 MB", async () => {
    const { config } = await import("../server/funktionen/import.mjs");
    expect(config.path).toEqual(["/api/import/upload", "/api/import/analyse", "/api/import/vorschau", "/api/import/uebernahme", "/api/import/verwerfen"]);
    expect(config.rumpfMax).toBe(10 * 1024 * 1024);
  });
});

/* Eintrittsdatum (Entscheidung 2026-11-09): leer und optional -> null; gültig -> übernehmen; ungültig -> Fehler;
   „heute" nur nach ausdrücklicher Eingabe; keine stille Ersetzung. */
describe("IMP-3 Eintrittsdatum ohne stille Ersetzung", { timeout: 120000 }, () => {
  const heuteTag = () => new Date().toISOString().slice(0, 10);
  async function uebernehmen(t, raum, zeile, entscheidungen) {
    const up = await hochladen(t.LT, csv([KOPF, zeile]));
    const an = await schritt(t.LT, "analyse", { vorgang: up.vorgang });
    const vs = await schritt(t.LT, "vorschau", { vorgang: up.vorgang, ...(entscheidungen || {}) });
    return { up, an, vs, d: an.datensaetze[0] };
  }
  it("neue Person mit leerem Eintritt: null, nicht das heutige Datum, ohne Fehler", async () => {
    const { raum, t } = await neuerRaum();
    const { up, d, vs } = await uebernehmen(t, raum, ["6001", "Leer", "Lea", "", "Wohnbereich 1", "", "20"]);
    expect(d.fehler).toEqual([]);
    const ue = await schritt(t.LT, "uebernahme", { vorgang: up.vorgang, bestaetigung: vs.bestaetigung });
    expect(ue.status, JSON.stringify(ue)).toBe(200);
    const p = (await betriebVon(raum, "m1")).personen.find((x) => x.personalnummer === "6001");
    expect(p.eintritt).not.toBe(heuteTag());
    expect(p.eintritt).toBeNull();
    expect(d.hinweise.join(" ")).not.toMatch(/heutig/i);
  });
  it("gültiger Eintritt (ISO und TT.MM.JJJJ) wird übernommen", async () => {
    const { raum, t } = await neuerRaum();
    const a = await uebernehmen(t, raum, ["6002", "Gut", "Gabi", "", "Wohnbereich 1", "2026-03-15", "20"]);
    const ue = await schritt(t.LT, "uebernahme", { vorgang: a.up.vorgang, bestaetigung: a.vs.bestaetigung });
    expect(ue.status).toBe(200);
    expect((await betriebVon(raum, "m1")).personen.find((x) => x.personalnummer === "6002").eintritt).toBe("2026-03-15");
    const b = await uebernehmen(t, raum, ["6003", "Gut", "Gero", "", "Wohnbereich 1", "5.4.2026", "20"]);
    expect(b.d.fehler).toEqual([]);
    const ub = await schritt(t.LT, "uebernahme", { vorgang: b.up.vorgang, bestaetigung: b.vs.bestaetigung });
    expect(ub.status).toBe(200);
    expect((await betriebVon(raum, "m1")).personen.find((x) => x.personalnummer === "6003").eintritt).toBe("2026-04-05");
  });
  it("31.02. und ungültiges Format sind Fehler, nie Ersatz durch heute", async () => {
    const { raum, t } = await neuerRaum();
    for (const roh of ["31.02.2026", "2026-02-30", "morgen", "2026/03/01", "1.2"]) {
      const { up, d } = await uebernehmen(t, raum, ["6004", "Fehl", "Fritz", "", "Wohnbereich 1", roh, "20"]);
      expect(d.fehler, roh).toContain("Eintrittsdatum ungültig");
      expect(d.erlaubt, roh).toEqual(["ueberspringen"]);
      await schritt(t.LT, "verwerfen", { vorgang: up.vorgang });
    }
    expect((await betriebVon(raum, "m1")).personen.some((x) => x.personalnummer === "6004")).toBe(false);
  });
  it("Aktualisierung einer bestehenden Person mit leerem Eintritt lässt das bestehende Datum unverändert", async () => {
    const { raum, t } = await neuerRaum();
    const { up, vs } = await uebernehmen(t, raum, ["1001", "Beispiel", "Erika", "neu@example.test", "Wohnbereich 1", "", "25"],
      { entscheidungen: { 1: "aktualisieren" }, bestaetigungen: { 1: true } });
    expect(vs.status).toBe(200);
    expect(vs.vorschau.aktualisieren[0].aenderungen.map((a) => a.feld)).not.toContain("eintritt");
    const ue = await schritt(t.LT, "uebernahme", { vorgang: up.vorgang, bestaetigung: vs.bestaetigung });
    expect(ue.status).toBe(200);
    const x1 = (await betriebVon(raum, "m1")).personen.find((p) => p.id === "x1");
    expect(x1.eintritt).toBe("2019-03-01");
    expect(x1.email).toBe("neu@example.test");
  });
});

/* ==========================================================================
   Auflagen aus dem IMP-3-Review (Branch acc45/import/imp-3-auflagen)
   ========================================================================== */

/** Fremde Änderung am Betrieb m1 zwischen Vorschau und Übernahme. */
async function betriebAendern(raum, fn) {
  const g = await lesen(raum);
  const best = structuredClone(g.bestand);
  fn(best.mandanten.find((m) => m.id === "m1"));
  await B.bestandSchreiben(laden(), raum, best, { durch: "Prüfung" });
}

describe("Auflage 4a — VORSCHAU_VERALTET", { timeout: 120000 }, () => {
  it("Bestand ändert sich zwischen Vorschau und Übernahme: 409, nichts geschrieben", async () => {
    const { raum, t } = await neuerRaum();
    const { up, vs } = await bisVorschau(t.LT, DATEI_ZWEI());
    expect(vs.status).toBe(200);
    /* Jemand legt inzwischen eine Person mit derselben Personalnummer an: der Plan der Vorschau gilt nicht mehr. */
    await betriebAendern(raum, (m) => m.personen.push(person("z9", "mitarbeiter", "m1-e1", { vorname: "Lena", nachname: "Neumann", personalnummer: "3001" })));
    const stand = (await lesen(raum)).stand;
    const ue = await schritt(t.LT, "uebernahme", { vorgang: up.vorgang, bestaetigung: vs.bestaetigung });
    expect(ue.status).toBe(409);
    expect(ue.code).toBe("VORSCHAU_VERALTET");
    const nachher = await lesen(raum);
    expect(nachher.stand, "kein Schreibvorgang").toBe(stand);
    expect((await betriebVon(raum, "m1")).personen.filter((p) => p.personalnummer === "3002").length).toBe(0);
  });
});

describe("Auflage 4b — leere Zelle überschreibt bei Aktualisierung nichts", { timeout: 120000 }, () => {
  it("nur die gefüllte Zelle ändert; leere Zellen lassen E-Mail, Wochenstunden, Urlaub, Funktion unberührt; neue Zeile mit leerer Zelle bleibt leer", async () => {
    const { raum, t } = await neuerRaum();
    const kopf = ["Personalnummer", "Nachname", "Vorname", "E-Mail", "Einheit", "Wochenstunden", "Funktion", "Urlaubsanspruch"];
    const datei = csv([kopf,
      ["1001", "Beispiel", "Erika", "", "Wohnbereich 1", "", "Leitung Pflege", ""],
      ["6001", "Leer", "Lea", "", "Wohnbereich 1", "", "", ""]]);
    const up = await hochladen(t.LT, datei);
    await schritt(t.LT, "analyse", { vorgang: up.vorgang });
    const vs = await schritt(t.LT, "vorschau", { vorgang: up.vorgang, entscheidungen: { 1: "aktualisieren", 2: "neu" }, bestaetigungen: { 1: true } });
    expect(vs.status, JSON.stringify(vs)).toBe(200);
    expect(vs.vorschau.aktualisieren[0].aenderungen.map((a) => a.feld)).toEqual(["funktion"]);
    const ue = await schritt(t.LT, "uebernahme", { vorgang: up.vorgang, bestaetigung: vs.bestaetigung });
    expect(ue.status).toBe(200);
    const m1 = await betriebVon(raum, "m1");
    expect(m1.personen.find((p) => p.id === "x1")).toMatchObject({ funktion: "Leitung Pflege", email: "alt@example.test", wochenstunden: 38.5, urlaubsanspruch: 30 });
    const lea = m1.personen.find((p) => p.personalnummer === "6001");
    expect(lea.email, "keine erfundene E-Mail").toBe("");
  });
});

describe("Auflage 4c — Betreiber und Kundenrolle: 403", { timeout: 120000 }, () => {
  for (const rolle of ["betreiber", "kunde"]) {
    it(`${rolle}: Upload 403, nichts geparst, nichts gespeichert`, async () => {
      const { raum } = await neuerRaum();
      const tok = (await sitzungAnlegen({ bestand: raum, name: `Test ${rolle}`, rolle, person: null, betrieb: 0, mandantId: "m1", einheit: null }, 2 * 3600 * 1000)).token;
      const vorher = await lesen(raum);
      const r = await hochladen(tok, DATEI_ZWEI());
      expect(r.status).toBe(403);
      expect(r.vorgang).toBeUndefined();
      expect(V._anzahl()).toBe(0);
      expect((await lesen(raum)).stand).toBe(vorher.stand);
    });
  }
});

describe("Auflage 2/4d — Personalnummern mit führenden Nullen und Trennzeichen", { timeout: 120000 }, () => {
  for (const [nummer, bestehend] of [["01001", "1001"], ["001001", "1001"], ["P-1001", "P1001"], ["p 1001", "P1001"], ["P01001", "P1001"]]) {
    it(`„${nummer}“ gegen „${bestehend}“: möglicher Treffer, Vorgabe klären, nie still neu`, async () => {
      const { raum, t } = await neuerRaum();
      await betriebAendern(raum, (m) => { m.personen.find((p) => p.id === "x1").personalnummer = bestehend; });
      const up = await hochladen(t.LT, csv([KOPF, [nummer, "Anders", "Anna", "", "Wohnbereich 1", "", "30"]]));
      const an = await schritt(t.LT, "analyse", { vorgang: up.vorgang });
      expect(an.datensaetze[0].dublette).toMatchObject({ art: "personalnummer-aehnlich", personId: "x1" });
      expect(an.datensaetze[0].vorgabe).toBe("klaeren");
      expect(an.datensaetze[0].erlaubt).not.toContain("aktualisieren");
      const vs = await schritt(t.LT, "vorschau", { vorgang: up.vorgang });
      expect(vs.zaehler).toMatchObject({ neu: 0, aktualisiert: 0, offen: 1 });
      /* Aktualisieren über eine nur ähnliche Nummer ist nie möglich. */
      expect((await schritt(t.LT, "vorschau", { vorgang: up.vorgang, entscheidungen: { 1: "aktualisieren" }, bestaetigungen: { 1: true } })).code).toBe("ENTSCHEIDUNG_UNZULAESSIG");
    });
  }
  it("gleichwertige Nummern innerhalb der Datei: beide Zeilen klären", async () => {
    const { t } = await neuerRaum();
    const { an, vs } = await bisVorschau(t.LT, csv([KOPF, ["07001", "Eins", "A", "", "Wohnbereich 1", "", "30"], ["7001", "Zwei", "B", "", "Wohnbereich 1", "", "30"]]));
    expect(an.datensaetze.map((d) => d.vorgabe)).toEqual(["klaeren", "klaeren"]);
    expect(an.datensaetze.map((d) => d.dublette && d.dublette.art)).toEqual(["personalnummer-datei", "personalnummer-datei"]);
    expect(vs.zaehler.neu).toBe(0);
  });
  it("dieselbe Nummer dreimal in der Datei, die erste auch im Bestand: alle Zeilen markiert, nichts übernommen", async () => {
    const { t } = await neuerRaum();
    const { an, vs } = await bisVorschau(t.LT, csv([KOPF, ["1001", "Beispiel", "Erika", "", "Wohnbereich 1", "", "30"],
      ["1001", "Zwei", "B", "", "Wohnbereich 1", "", "30"], ["1001", "Drei", "C", "", "Wohnbereich 1", "", "30"]]));
    expect(an.datensaetze.map((d) => d.dublette && d.dublette.art)).toEqual(["personalnummer-datei", "personalnummer-datei", "personalnummer-datei"]);
    expect(an.datensaetze.every((d) => !d.erlaubt.includes("aktualisieren"))).toBe(true);
    expect(vs.zaehler).toMatchObject({ neu: 0, aktualisiert: 0 });
  });
  it("dieselbe Nummer mehrfach im Bestand: kein stiller Treffer auf die erste Person, sondern klären", async () => {
    const { raum, t } = await neuerRaum();
    await betriebAendern(raum, (m) => m.personen.push(person("x3", "mitarbeiter", "m1-e1", { vorname: "Zweite", nachname: "Doppelt", personalnummer: "1001" })));
    const up = await hochladen(t.LT, csv([KOPF, ["1001", "Beispiel", "Erika", "", "Wohnbereich 1", "", "30"]]));
    const an = await schritt(t.LT, "analyse", { vorgang: up.vorgang });
    expect(an.datensaetze[0].dublette).toMatchObject({ art: "personalnummer-mehrdeutig", personIds: ["x1", "x3"] });
    expect(an.datensaetze[0].erlaubt).toEqual(["ueberspringen", "klaeren"]);
    expect(an.datensaetze[0].vorgabe).toBe("klaeren");
  });
});

describe("Auflage 2/4e — gleicher Name bei abweichender oder fehlender Nummer: klären, nie neu", { timeout: 120000 }, () => {
  it("Name gleich, Nummer abweicht (Bestand hat eine Nummer): klären", async () => {
    const { t } = await neuerRaum();
    const up = await hochladen(t.LT, csv([KOPF, ["9999", "Beispiel", "Erika", "", "Wohnbereich 1", "", "30"]]));
    const an = await schritt(t.LT, "analyse", { vorgang: up.vorgang });
    expect(an.datensaetze[0].dublette).toEqual({ art: "name", personId: "x1" });
    expect(an.datensaetze[0].vorgabe).toBe("klaeren");
    const vs = await schritt(t.LT, "vorschau", { vorgang: up.vorgang });
    expect(vs.zaehler).toMatchObject({ neu: 0, offen: 1 });
  });
  it("Name gleich, Datei hat keine Nummer, Bestand hat eine: klären", async () => {
    const { t } = await neuerRaum();
    const up = await hochladen(t.LT, csv([["Nachname", "Vorname", "Einheit"], ["Beispiel", "Erika", "Wohnbereich 1"]]));
    const an = await schritt(t.LT, "analyse", { vorgang: up.vorgang });
    expect(an.datensaetze[0].dublette).toEqual({ art: "name", personId: "x1" });
    expect(an.datensaetze[0].vorgabe).toBe("klaeren");
  });
  it("Name gleich, Datei hat Nummer, Bestand keine: klären", async () => {
    const { t } = await neuerRaum();
    const up = await hochladen(t.LT, csv([KOPF, ["5555", "Muster", "Otto", "", "Wohnbereich 1", "", "30"]]));
    const an = await schritt(t.LT, "analyse", { vorgang: up.vorgang });
    expect(an.datensaetze[0].dublette).toEqual({ art: "name", personId: "x2" });
    expect(an.datensaetze[0].vorgabe).toBe("klaeren");
  });
  it("gleicher Name zweimal in der Datei mit verschiedenen Nummern: beide klären", async () => {
    const { t } = await neuerRaum();
    const { an, vs } = await bisVorschau(t.LT, csv([KOPF, ["8101", "Gleich", "Gerd", "", "Wohnbereich 1", "", "30"], ["8102", "Gleich", "Gerd", "", "Wohnbereich 1", "", "30"]]));
    expect(an.datensaetze.map((d) => d.vorgabe)).toEqual(["klaeren", "klaeren"]);
    expect(vs.zaehler.neu).toBe(0);
  });
  it("Entscheidung „neu“ bleibt ausdrücklich möglich (Benutzer entscheidet)", async () => {
    const { raum, t } = await neuerRaum();
    const up = await hochladen(t.LT, csv([KOPF, ["9999", "Beispiel", "Erika", "", "Wohnbereich 1", "", "30"]]));
    await schritt(t.LT, "analyse", { vorgang: up.vorgang });
    const vs = await schritt(t.LT, "vorschau", { vorgang: up.vorgang, entscheidungen: { 1: "neu" } });
    expect(vs.zaehler.neu).toBe(1);
    expect((await schritt(t.LT, "uebernahme", { vorgang: up.vorgang, bestaetigung: vs.bestaetigung })).status).toBe(200);
    expect((await betriebVon(raum, "m1")).personen.filter((p) => p.nachname === "Beispiel").length).toBe(2);
  });
});

describe("Auflage 3 — Parser-Grenzen", { timeout: 120000 }, () => {
  it("Vorgangsgrenze greift VOR dem Parsen: vierter Upload im Raum bekommt 429, auch mit unlesbarer Datei", async () => {
    const { t } = await neuerRaum();
    for (let i = 0; i < 3; i++) expect((await hochladen(t.LT, DATEI_ZWEI())).status).toBe(201);
    /* Wäre geparst worden, käme 422 (kein Tabellenformat). Mit der Grenze davor: 429, die Datei wird nicht angefasst. */
    const r = await hochladen(t.LT, Buffer.from([0x00, 0x01, 0x02, 0x03, 0xff, 0xfe, 0x00, 0x00]), { name: "muell.bin" });
    expect(r.status).toBe(429);
    expect(r.code).toBe("ZU_VIELE_VORGAENGE");
    expect(V._anzahl()).toBe(3);
  });
  it("ein fehlgeschlagener Upload hält keinen Vorgang fest", async () => {
    const { t } = await neuerRaum();
    for (let i = 0; i < 5; i++) expect((await hochladen(t.LT, Buffer.alloc(0))).status).toBe(422);
    expect(V._anzahl()).toBe(0);
    expect((await hochladen(t.LT, DATEI_ZWEI())).status).toBe(201);
  });
  it("höchstens 2 Parser gleichzeitig: überzählige Uploads 503, danach wieder frei", async () => {
    const raeume = [];
    for (let i = 0; i < 6; i++) raeume.push(await neuerRaum());
    const rs = await Promise.all(raeume.map((r) => hochladen(r.t.LT, DATEI_ZWEI())));
    const stati = JSON.stringify(rs.map((r) => r.status));
    const ok = rs.filter((r) => r.status === 201).length;
    const zuViel = rs.filter((r) => r.status === 503);
    expect(rs.every((r) => r.status === 201 || r.status === 503), stati).toBe(true);
    expect(zuViel.length, stati).toBeGreaterThan(0);
    expect(zuViel[0].code).toBe("ZU_VIEL_GLEICHZEITIG");
    expect(V._anzahl(), "abgewiesene Uploads halten keinen Vorgang").toBe(ok);
    expect((await hochladen(raeume[0].t.PL, DATEI_ZWEI())).status).toBe(201);
  });
});

/* ==========================================================================
   Auflagen aus dem Delta-Review (Opus) — Branch acc45/import/imp-3-auflagen2
   Reihenfolge wird über Zustände erzwungen (gehaltene Raumsperre, Parser-Haken),
   nie über Wartezeiten.
   ========================================================================== */

/** Warten, bis ein Zustand eintritt — ohne Zeitannahme, nur durch Abgeben der Ereignisschleife (gedeckelt). */
async function bisZustand(pruef) {
  for (let i = 0; i < 20000 && !pruef(); i++) await new Promise((r) => setImmediate(r));
  expect(pruef(), "Zustand nicht erreicht").toBe(true);
}

/** Die Raumsperre von außen halten: kehrt zurück, sobald die Sperre gehalten wird; das Ergebnis gibt sie frei. */
async function sperreHalten(raum) {
  let oeffnen;
  const tor = new Promise((r) => { oeffnen = r; });
  let gehalten;
  const halt = new Promise((r) => { gehalten = r; });
  const fertig = B.unterRaumsperre(raum, async () => { gehalten(); await tor; });
  await halt;
  return async () => { oeffnen(); await fertig; };
}

describe("Delta-Review 3a — Übernahme-Rennen", { timeout: 120000 }, () => {
  it("zweiter Tab: Vorschau und Analyse während laufender Übernahme 409; geschrieben wird der bestätigte Plan", async () => {
    const { raum, t } = await neuerRaum();
    const { up, vs } = await bisVorschau(t.LT, DATEI_ZWEI());
    expect(vs.zaehler.neu).toBe(2);
    const freigeben = await sperreHalten(raum);
    let vs2, an2, ueP;
    try {
      ueP = schritt(t.LT, "uebernahme", { vorgang: up.vorgang, bestaetigung: vs.bestaetigung });
      await bisZustand(() => (V._roh(up.vorgang) || {}).laeuft === true);
      /* Die Übernahme wartet jetzt auf die Raumsperre. Ein zweiter Tab erstellt eine andere Vorschau. */
      vs2 = await schritt(t.LT, "vorschau", { vorgang: up.vorgang, entscheidungen: { 2: "ueberspringen" } });
      an2 = await schritt(t.LT, "analyse", { vorgang: up.vorgang });
    } finally { await freigeben(); }
    const ue = await ueP;
    expect(vs2.status, JSON.stringify(vs2).slice(0, 200)).toBe(409);
    expect(vs2.code).toBe("UEBERNAHME_LAEUFT");
    expect(an2.status).toBe(409);
    expect(an2.code).toBe("UEBERNAHME_LAEUFT");
    expect(ue.status, JSON.stringify(ue)).toBe(200);
    expect(ue.zaehler.neu, "der bestätigte Plan (zwei neue), nicht der des zweiten Tabs").toBe(2);
    const m1 = await betriebVon(raum, "m1");
    expect(m1.personen.filter((p) => ["3001", "3002"].includes(p.personalnummer)).length).toBe(2);
  });
  it("Doppelklick: zweite Übernahme während der ersten 409 LAEUFT_BEREITS, nichts doppelt", async () => {
    const { raum, t } = await neuerRaum();
    const { up, vs } = await bisVorschau(t.LT, DATEI_ZWEI());
    const freigeben = await sperreHalten(raum);
    let zweit, ueP;
    try {
      ueP = schritt(t.LT, "uebernahme", { vorgang: up.vorgang, bestaetigung: vs.bestaetigung });
      await bisZustand(() => (V._roh(up.vorgang) || {}).laeuft === true);
      zweit = await schritt(t.LT, "uebernahme", { vorgang: up.vorgang, bestaetigung: vs.bestaetigung });
    } finally { await freigeben(); }
    expect(zweit.status).toBe(409);
    expect(zweit.code).toBe("LAEUFT_BEREITS");
    expect((await ueP).status).toBe(200);
    expect((await betriebVon(raum, "m1")).personen.filter((p) => p.personalnummer === "3001").length).toBe(1);
  });
  it("Übernahme mit alter Bestätigung nach neuer Vorschau: 409 VORSCHAU_VERALTET, nichts geschrieben", async () => {
    const { raum, t } = await neuerRaum();
    const { up, vs } = await bisVorschau(t.LT, DATEI_ZWEI());
    const vs2 = await schritt(t.LT, "vorschau", { vorgang: up.vorgang, entscheidungen: { 2: "ueberspringen" } });
    expect(vs2.status).toBe(200);
    expect(vs2.bestaetigung).not.toBe(vs.bestaetigung);
    const stand = (await lesen(raum)).stand;
    const alt = await schritt(t.LT, "uebernahme", { vorgang: up.vorgang, bestaetigung: vs.bestaetigung });
    expect(alt.status).toBe(409);
    expect(alt.code).toBe("VORSCHAU_VERALTET");
    expect((await lesen(raum)).stand, "kein Schreibvorgang").toBe(stand);
    expect((await betriebVon(raum, "m1")).personen.some((p) => ["3001", "3002"].includes(p.personalnummer))).toBe(false);
    /* Mit der Bestätigung der aktuellen Vorschau gelingt es — genau deren Plan. */
    const neu = await schritt(t.LT, "uebernahme", { vorgang: up.vorgang, bestaetigung: vs2.bestaetigung });
    expect(neu.status).toBe(200);
    expect(neu.zaehler.neu).toBe(1);
  });
});

describe("Delta-Review 3b — Plan-Hash mit Dublettenlage", { timeout: 120000 }, () => {
  it("„neu“ bestätigt, danach Person gleichen Namens im Bestand angelegt: 409 VORSCHAU_VERALTET, keine doppelte Person", async () => {
    const { raum, t } = await neuerRaum();
    const up = await hochladen(t.LT, csv([KOPF, ["3101", "Sommer", "Sina", "", "Wohnbereich 1", "", "30"]]));
    const an = await schritt(t.LT, "analyse", { vorgang: up.vorgang });
    expect(an.datensaetze[0].dublette).toBeNull();
    const vs = await schritt(t.LT, "vorschau", { vorgang: up.vorgang, entscheidungen: { 1: "neu" } });
    expect(vs.zaehler.neu).toBe(1);
    await betriebAendern(raum, (m) => m.personen.push(person("z8", "mitarbeiter", "m1-e1", { vorname: "Sina", nachname: "Sommer" })));
    const stand = (await lesen(raum)).stand;
    const ue = await schritt(t.LT, "uebernahme", { vorgang: up.vorgang, bestaetigung: vs.bestaetigung });
    expect(ue.status, JSON.stringify(ue)).toBe(409);
    expect(ue.code).toBe("VORSCHAU_VERALTET");
    expect((await lesen(raum)).stand, "kein Schreibvorgang").toBe(stand);
    expect((await betriebVon(raum, "m1")).personen.filter((p) => p.nachname === "Sommer").length).toBe(1);
  });
});

describe("Delta-Review 1b — Namensvergleich wie bei den Spalten normalisiert", { timeout: 120000 }, () => {
  for (const [bestandN, bestandV, dateiN, dateiV] of [
    ["Müller", "Anna", "Mueller", "Anna"],
    ["Mueller", "Anna", "Müller", "Anna"],
    ["Strauß", "Jörg", "Strauss", "Joerg"],
    ["Muster", "Anna Lena", "Muster", "Anna  Lena"],
    ["Muster", "Anna Lena", "Muster", "Anna-Lena"],
    ["Meyer-Lüdenscheidt", "Eva", "MEYER LUEDENSCHEIDT", "eva"],
  ]) {
    it(`„${dateiV} ${dateiN}“ gegen „${bestandV} ${bestandN}“: Treffer, Vorgabe klären, nie neu`, async () => {
      const { raum, t } = await neuerRaum();
      await betriebAendern(raum, (m) => Object.assign(m.personen.find((p) => p.id === "x2"), { nachname: bestandN, vorname: bestandV }));
      const up = await hochladen(t.LT, csv([KOPF, ["5556", dateiN, dateiV, "", "Wohnbereich 1", "", "30"]]));
      const an = await schritt(t.LT, "analyse", { vorgang: up.vorgang });
      expect(an.datensaetze[0].dublette).toEqual({ art: "name", personId: "x2" });
      expect(an.datensaetze[0].vorgabe).toBe("klaeren");
      const vs = await schritt(t.LT, "vorschau", { vorgang: up.vorgang });
      expect(vs.zaehler).toMatchObject({ neu: 0, offen: 1 });
    });
  }
  it("innerhalb der Datei: „Anna Müller“ und „Anna Mueller“ sind gleich — beide klären", async () => {
    const { t } = await neuerRaum();
    const { an, vs } = await bisVorschau(t.LT, csv([KOPF, ["8201", "Müller", "Anna", "", "Wohnbereich 1", "", "30"],
      ["8202", "Mueller", "Anna", "", "Wohnbereich 1", "", "30"]]));
    expect(an.datensaetze.map((d) => d.dublette && d.dublette.art)).toEqual(["name-datei", "name-datei"]);
    expect(vs.zaehler.neu).toBe(0);
  });
  it("verschiedene Namen bleiben verschieden (kein Treffer über Wegnormalisieren)", async () => {
    const { t } = await neuerRaum();
    const up = await hochladen(t.LT, csv([KOPF, ["5557", "Muster", "Annalena", "", "Wohnbereich 1", "", "30"],
      ["5558", "Мустер", "Отто", "", "Wohnbereich 1", "", "30"], ["5559", "Мустерова", "Анна", "", "Wohnbereich 1", "", "30"]]));
    const an = await schritt(t.LT, "analyse", { vorgang: up.vorgang });
    expect(an.datensaetze.map((d) => d.dublette)).toEqual([null, null, null]);
    expect(an.datensaetze.map((d) => d.vorgabe)).toEqual(["neu", "neu", "neu"]);
  });
});

/** Parser-Haken: hält jeden Parser nach dem Belegen seines Platzes an, bis `oeffnen()`. */
function parserTor() {
  const erreicht = [];
  const warter = [];
  let oeffnen;
  const tor = new Promise((r) => { oeffnen = r; });
  V._pruefhaken.vorParser = async ({ raum }) => { erreicht.push(raum); warter.splice(0).forEach((w) => w()); await tor; };
  const bis = async (n) => { while (erreicht.length < n) await new Promise((r) => warter.push(r)); };
  return { erreicht, bis, oeffnen: () => oeffnen() };
}

describe("Delta-Review 4a — Parser-Plätze je Raum", { timeout: 120000 }, () => {
  it("zwei parallele Uploads desselben Raums: der zweite 503 ZU_VIEL_GLEICHZEITIG, ohne Vorgang", async () => {
    const { raum: raumA, t } = await neuerRaum();
    const tor = parserTor();
    let erstes, zweites;
    try {
      erstes = hochladen(t.LT, DATEI_ZWEI());
      await tor.bis(1);
      zweites = await Promise.race([hochladen(t.PL, DATEI_ZWEI()).then((antwort) => ({ antwort })), tor.bis(2).then(() => ({ imParser: true }))]);
    } finally { tor.oeffnen(); }
    expect(zweites.imParser, "zweiter Parser desselben Raums wurde gestartet").toBeUndefined();
    expect(zweites.antwort.status).toBe(503);
    expect(zweites.antwort.code).toBe("ZU_VIEL_GLEICHZEITIG");
    expect((await erstes).status).toBe(201);
    expect(V._anzahl(), "der abgewiesene Upload hält keinen Vorgang").toBe(1);
    /* Danach ist der Platz des Raums wieder frei. */
    V._pruefhaken.vorParser = null;
    expect(V._parserImRaum(raumA), "Raum-Platz wieder frei").toBe(0);
    expect((await hochladen(t.PL, DATEI_ZWEI())).status).toBe(201);
  });
  it("zwei Räume gleichzeitig: beide dürfen parsen", async () => {
    const a = await neuerRaum();
    const b = await neuerRaum();
    const tor = parserTor();
    let ra, rb;
    try {
      ra = hochladen(a.t.LT, DATEI_ZWEI());
      await tor.bis(1);
      rb = hochladen(b.t.LT, DATEI_ZWEI());
      await tor.bis(2);
      expect(tor.erreicht).toEqual([a.raum, b.raum]);
    } finally { tor.oeffnen(); }
    expect((await ra).status).toBe(201);
    expect((await rb).status).toBe(201);
  });
});

/* ==========================================================================
   Freigabe Betreiber (IMP-3): Die Vorschau zeigt das endgültige Datum (nach der Umrechnung des Datumssystems),
   die Übernahme speichert genau dieses; leer bleibt null und erscheint als „nicht angegeben".
   ========================================================================== */

const TAG = 86400000;
/** XLSX-Mappe mit einer echten Datumszelle (Seriennummer + Datumsformat) im 1900er- oder 1904er-System. */
function datumsMappe(personalnummer, iso, system) {
  const serial1900 = Date.parse(`${iso}T00:00:00Z`) / TAG + 25569;
  const serial = system === 1904 ? serial1900 - 1462 : serial1900;
  const ws = XLSX.utils.aoa_to_sheet([["Personalnummer", "Nachname", "Vorname", "Einheit", "Eintritt"],
    [personalnummer, "Datum", `D${personalnummer}`, "Wohnbereich 1", 0]]);
  ws.E2 = { t: "n", v: serial, z: "dd.mm.yyyy" };
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Personal");
  wb.Workbook = { WBProps: { date1904: system === 1904 } };
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
}

describe("Freigabe Betreiber — Datumswerte in der Vorschau = gespeicherte Werte", { timeout: 120000 }, () => {
  async function vorschauUndUebernahme(t, raum, datei) {
    const up = await hochladen(t.LT, datei, { name: "datum.xlsx" });
    expect(up.status, JSON.stringify(up)).toBe(201);
    /* Datum nur über den Parser: Nichts wird mehr in den Vorgang hineingeschrieben; die Werte kommen so, wie der echte
       Parser (IMP-2) sie liefert (1904er-Mappen dort bereits auf 1900 umgerechnet). */
    const an = await schritt(t.LT, "analyse", { vorgang: up.vorgang });
    const vs = await schritt(t.LT, "vorschau", { vorgang: up.vorgang });
    expect(vs.status, JSON.stringify(vs).slice(0, 300)).toBe(200);
    const ue = await schritt(t.LT, "uebernahme", { vorgang: up.vorgang, bestaetigung: vs.bestaetigung });
    expect(ue.status, JSON.stringify(ue)).toBe(200);
    return { an, vs, ue };
  }
  it("1900er- und 1904er-Mappe mit gleichem Kalenderdatum: gleiche Vorschau; die Übernahme speichert genau das Vorschau-Datum", async () => {
    const { raum, t } = await neuerRaum();
    const a = await vorschauUndUebernahme(t, raum, datumsMappe("7190", "2026-03-15", 1900));
    const b = await vorschauUndUebernahme(t, raum, datumsMappe("7194", "2026-03-15", 1904));
    expect(a.vs.vorschau.neu[0].eintritt).toBe("2026-03-15");
    expect(b.vs.vorschau.neu[0].eintritt).toBe("2026-03-15");
    expect(a.vs.vorschau.neu[0].eintrittAnzeige).toBe("15.03.2026");
    expect(b.vs.vorschau.neu[0].eintrittAnzeige).toBe("15.03.2026");
    const m1 = await betriebVon(raum, "m1");
    expect(m1.personen.find((p) => p.personalnummer === "7190").eintritt).toBe(a.vs.vorschau.neu[0].eintritt);
    expect(m1.personen.find((p) => p.personalnummer === "7194").eintritt).toBe(b.vs.vorschau.neu[0].eintritt);
  });
  it("ohne Angabe des Datumssystems gilt 1900 (Rückwärtsverhalten)", async () => {
    const { raum, t } = await neuerRaum();
    const a = await vorschauUndUebernahme(t, raum, datumsMappe("7191", "2026-03-15", 1900));
    expect(a.vs.vorschau.neu[0].eintritt).toBe("2026-03-15");
  });
  it("leeres Eintrittsdatum: null, in der Vorschau „nicht angegeben“, gespeichert null", async () => {
    const { raum, t } = await neuerRaum();
    const { up, vs } = await bisVorschau(t.LT, csv([KOPF, ["7192", "Leer", "Lia", "", "Wohnbereich 1", "", "30"]]));
    expect(vs.vorschau.neu[0].eintritt).toBeNull();
    expect(vs.vorschau.neu[0].eintrittAnzeige).toBe("nicht angegeben");
    expect((await schritt(t.LT, "uebernahme", { vorgang: up.vorgang, bestaetigung: vs.bestaetigung })).status).toBe(200);
    expect((await betriebVon(raum, "m1")).personen.find((p) => p.personalnummer === "7192").eintritt).toBeNull();
  });
  it("Datum nur über den Parser: 1900- und 1904-Mappe (gleicher Kalendertag) liefern in Vorschau und Speicherung dasselbe Eintrittsdatum", async () => {
    /* Der echte Parser liefert beide Mappen bereits im System 1900 und meldet die Herkunft nur als Quelle. */
    const p1900 = await parseDatei({ buffer: datumsMappe("7195", "2026-03-15", 1900), name: "a.xlsx" });
    const p1904 = await parseDatei({ buffer: datumsMappe("7196", "2026-03-15", 1904), name: "b.xlsx" });
    expect(p1900.ok && p1904.ok).toBe(true);
    expect(p1904.datumssystem).toBe("1900");
    expect(p1904.datumssystemQuelle).toBe("1904");
    expect(p1900.datumssystemQuelle).toBeUndefined();
    const { raum, t } = await neuerRaum();
    const a = await vorschauUndUebernahme(t, raum, datumsMappe("7195", "2026-03-15", 1900));
    const b = await vorschauUndUebernahme(t, raum, datumsMappe("7196", "2026-03-15", 1904));
    expect(a.vs.vorschau.neu[0].eintritt).toBe("2026-03-15");
    expect(b.vs.vorschau.neu[0].eintritt).toBe("2026-03-15");
    const m1 = await betriebVon(raum, "m1");
    for (const [nr, x] of [["7195", a], ["7196", b]]) {
      const pe = m1.personen.find((q) => q.personalnummer === nr);
      expect(pe.eintritt).toBe(x.vs.vorschau.neu[0].eintritt);
      expect(pe.eintritt).toBe("2026-03-15");
    }
    /* Nur Anzeige: Hinweis bei 1904, keiner bei 1900. */
    expect(b.vs.datumHinweis).toBe("Datei im System 1904, Werte umgerechnet");
    expect(b.an.datumHinweis).toBe("Datei im System 1904, Werte umgerechnet");
    expect(a.vs.datumHinweis).toBeUndefined();
  });
  it("datumAusZelle rechnet nie selbst um: Excel-1900-Seriennummer; ein etwaiges zweites Argument wird ignoriert (keine Doppelverschiebung)", () => {
    const serial = Date.parse("2026-03-15T00:00:00Z") / TAG + 25569;
    const z = { typ: "datum", roh: serial, text: "" };
    expect(datumAusZelle(z)).toEqual({ wert: "2026-03-15" });
    expect(datumAusZelle(z, "1904")).toEqual({ wert: "2026-03-15" });
    expect(datumAusZelle({ typ: "datum", roh: 0, text: "kein Datum" })).toEqual({ ungueltig: true });
  });
});
