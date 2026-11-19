/* ==========================================================================
   IMP-5 — Organisationseinheiten im Import: Teams (Einheiten), Standorte,
   Qualifikationen; neue nur mit org.edit.

   Akzeptanz (docs/acc45/work-packages.json, IMP-5):
     A1  Fehlende Einheiten, Standorte und Qualifikationen sind ein
         Zuordnungskonflikt (Datensatz bleibt offen, nichts wird angelegt).
     A2  Planung allein erzeugt keine Einheiten (auch keine Standorte und
         Qualifikationen): 403 ORG_EDIT_FEHLT; der Server schreibt nichts davon.
     A3  Mit org.edit (Leitung) wird angelegt; angelegte Qualifikationen tragen
         keinen Sonderstatus (keine Fachkraft, keine Sperre, keine Nachweispflicht).

   Nur synthetische Daten. Aufruf:
     npx vitest run pruefungen/import-org-imp5.test.js --testTimeout=120000
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { readFileSync } from "node:fs";
import { analysieren, planen, anwenden, FELDER, AKTUALISIERBAR } from "../server/lib/import/personen.mjs";

let org;
beforeAll(async () => { org = await import("../server/lib/import/org.mjs").catch(() => null); });

const eingefroren = (o) => { Object.freeze(o); for (const v of Object.values(o)) if (v && typeof v === "object" && !Object.isFrozen(v)) eingefroren(v); return o; };
const kopie = (o) => JSON.parse(JSON.stringify(o));

/* --------------------------------------------------------------------------
   Reine Ebene: org.mjs, analysieren, planen, anwenden
   -------------------------------------------------------------------------- */
const MANDANT = () => ({ id: "m1", name: "Haus Eins",
  einheiten: [{ id: "e1", name: "Wohnbereich 1" }, { id: "e2", name: "Wohnbereich 2" }],
  standorte: [{ id: "st1", name: "Haus Nord" }],
  qualifikationen: [{ id: "q1", name: "Pflegefachkraft", kurz: "PFK", fachkraft: true, harteSperre: true, nachweisPflicht: true },
    { id: "q2", name: "Ersthelfer", kurz: "EH" }],
  zyklus: { wochen: 1 }, einstellungen: { sollWochenstunden: 40 },
  personen: [{ id: "p1", vorname: "Erika", nachname: "Beispiel", personalnummer: "1001", email: "", funktion: "Fachkraft",
    wochenstunden: 30, urlaubsanspruch: 30, qualifikationen: ["q2"] }] });
const KOPF = ["Personalnummer", "Nachname", "Vorname", "Einheit", "Standort", "Qualifikationen"];
const zeilen = (...z) => [KOPF, ...z];
const HEUTE = "2026-11-10";
let zaehlerId = 0;
const neueId = (p) => `${p}n${++zaehlerId}`;

describe("IMP-5 A1: fehlende Einheiten, Standorte, Qualifikationen sind ein Zuordnungskonflikt", () => {
  it("das Modul org.mjs gibt es", () => { expect(org).toBeTruthy(); });

  it("Analyse: unbekannte Einheit, unbekannter Standort, unbekannte Qualifikation → Konflikt, Vorgabe „klären“", () => {
    const m = eingefroren(MANDANT());
    const a = analysieren({ mandant: m, heute: HEUTE, zeilen: zeilen(
      ["5001", "Neu", "Nina", "Station Nord", "Haus Ost", "Pflegefachkraft"],
      ["5002", "Neu", "Nico", "Wohnbereich 1", "", "Hebammenkunde"],
      ["5003", "Alt", "Alma", "Wohnbereich 1", "", "pflegefachkraft, EH"]) });
    expect(a.ok).toBe(true);
    const [d1, d2, d3] = a.datensaetze;
    expect(d1.konflikte.map((k) => k.art)).toEqual(["einheit-unbekannt", "standort-unbekannt"]);
    expect(d2.konflikte).toEqual([{ art: "qualifikation-unbekannt" }]);
    expect(d3.konflikte).toEqual([]);
    expect([d1.vorgabe, d2.vorgabe, d3.vorgabe]).toEqual(["klaeren", "klaeren", "neu"]);
    expect(d3.qualifikationIds).toEqual(["q1", "q2"]);   // Name (ohne Groß-/Kleinschreibung) und Kürzel treffen
  });

  it("Konflikte nennen nie den Wert (keine Namen in Art oder Fehler)", () => {
    const a = analysieren({ mandant: MANDANT(), heute: HEUTE, zeilen: zeilen(["5001", "Neu", "Nina", "Station Geheim", "Ort Geheim", "Quali Geheim"]) });
    const s = JSON.stringify(a.datensaetze[0].konflikte) + JSON.stringify(a.datensaetze[0].fehler);
    expect(s).not.toMatch(/Geheim/);
  });

  it("Spalte „Qualifikationen“ wird erkannt; ohne die Spalte entsteht kein Konflikt", () => {
    expect(FELDER).toContain("qualifikationen");
    const a = analysieren({ mandant: MANDANT(), heute: HEUTE, zeilen: zeilen(["5001", "Neu", "Nina", "Wohnbereich 1", "", ""]) });
    expect(a.spalten.find((s) => s.kopf === "Qualifikationen").feld).toBe("qualifikationen");
    expect(a.datensaetze[0].konflikte).toEqual([]);
    const ohne = analysieren({ mandant: MANDANT(), heute: HEUTE, zeilen: [["Nachname", "Vorname", "Einheit"], ["Neu", "Nina", "Wohnbereich 1"]] });
    expect(ohne.datensaetze[0].konflikte).toEqual([]);
  });

  it("mehrdeutige Qualifikation (zwei Einträge gleichen Namens): Konflikt, nie „der erste“; Anlegen löst das nicht", () => {
    const m = MANDANT();
    m.qualifikationen.push({ id: "q3", name: "Ersthelfer", kurz: "EH2" });
    const a = analysieren({ mandant: m, heute: HEUTE, zeilen: zeilen(["5001", "Neu", "Nina", "Wohnbereich 1", "", "Ersthelfer"]) });
    expect(a.datensaetze[0].konflikte).toEqual([{ art: "qualifikation-mehrdeutig" }]);
    const p = planen({ mandant: m, analyse: a, einheitenAnlegen: true, orgEdit: true });
    expect(p.ok).toBe(true);
    expect(p.plan.neu).toEqual([]);
    expect(p.plan.offen).toEqual([{ datensatz: 1, grund: "konflikt" }]);
    expect(p.plan.neueQualifikationen).toEqual([]);
  });

  it("Planung (ohne org.edit): der Datensatz bleibt offen, es wird nichts zum Anlegen vorgemerkt", () => {
    const m = MANDANT();
    const a = analysieren({ mandant: m, heute: HEUTE, zeilen: zeilen(
      ["5001", "Neu", "Nina", "Station Nord", "", ""], ["5002", "Neu", "Nico", "Wohnbereich 1", "", "Hebammenkunde"]) });
    const p = planen({ mandant: m, analyse: a, einheitenAnlegen: false, orgEdit: false });
    expect(p.ok).toBe(true);
    expect(p.plan.offen.map((o) => o.datensatz)).toEqual([1, 2]);
    expect(p.plan.neu).toEqual([]);
    expect([p.plan.neueEinheiten, p.plan.neueStandorte, p.plan.neueQualifikationen]).toEqual([[], [], []]);
    /* Auch eine ausdrückliche Wahl „neu“ ohne Anlegen ist ein Zuordnungskonflikt (422), kein stilles Anlegen. */
    for (const nr of [1, 2]) {
      const e = planen({ mandant: m, analyse: a, entscheidungen: { [nr]: "neu" }, einheitenAnlegen: false, orgEdit: true });
      expect(e.ok, `Datensatz ${nr}`).toBe(false);
      expect(e.code).toBe("ZUORDNUNGSKONFLIKT");
    }
  });
});

describe("IMP-5 A2: Planung allein erzeugt keine Einheiten (org.edit nötig)", () => {
  it("orgAnlegenPruefen: Anlegen verlangen ohne org.edit → 403 ORG_EDIT_FEHLT; mit org.edit ok; org.edit allein legt nichts an", () => {
    expect(org.orgAnlegenPruefen({ anlegen: true, orgEdit: false })).toMatchObject({ ok: false, status: 403, code: "ORG_EDIT_FEHLT" });
    expect(org.orgAnlegenPruefen({ anlegen: true, orgEdit: undefined }).ok).toBe(false);
    expect(org.orgAnlegenPruefen({ anlegen: "ja", orgEdit: true })).toEqual({ ok: true, anlegen: false });
    expect(org.orgAnlegenPruefen({ anlegen: true, orgEdit: true })).toEqual({ ok: true, anlegen: true });
    expect(org.orgAnlegenPruefen({ anlegen: false, orgEdit: true })).toEqual({ ok: true, anlegen: false });
  });

  it("planen: Einheiten, Standorte UND Qualifikationen anlegen ohne org.edit → 403", () => {
    const m = MANDANT();
    const a = analysieren({ mandant: m, heute: HEUTE, zeilen: zeilen(["5001", "Neu", "Nina", "Station Nord", "Haus Ost", "Hebammenkunde"]) });
    const p = planen({ mandant: m, analyse: a, einheitenAnlegen: true, orgEdit: false });
    expect(p).toMatchObject({ ok: false, status: 403, code: "ORG_EDIT_FEHLT" });
  });

  it("anwenden: ein Plan mit neuen Einheiten/Standorten/Qualifikationen ohne org.edit wirft, bevor etwas entsteht", () => {
    const m = eingefroren(MANDANT());
    const plan = { neu: [{ datensatz: 1, werte: { nachname: "Neu", vorname: "Nina", einheit: "Station Nord", standort: "", qualifikationen: [] },
      einheitId: null, standortId: null, qualifikationIds: [] }], aktualisieren: [], neueEinheiten: ["Station Nord"], neueStandorte: [], neueQualifikationen: [] };
    for (const teil of [{ neueEinheiten: ["Station Nord"] }, { neueStandorte: ["Haus Ost"] }, { neueQualifikationen: ["Hebammenkunde"] }]) {
      const p = { ...plan, neueEinheiten: [], ...teil };
      expect(() => anwenden(m, p, { neueId, heute: HEUTE }), JSON.stringify(teil)).toThrow(/org\.edit/);
      expect(() => anwenden(m, p, { neueId, heute: HEUTE, orgEdit: false })).toThrow(/org\.edit/);
    }
  });

  it("orgAnlegen ohne org.edit: wirft ORG_EDIT_FEHLT und lässt den Betrieb unberührt", () => {
    const m = MANDANT();
    const vorher = kopie(m);
    let fehler;
    try { org.orgAnlegen(m, { neueEinheiten: ["X"], neueStandorte: [], neueQualifikationen: [], neu: [] }, { id: neueId, orgEdit: false }); } catch (e) { fehler = e; }
    expect(fehler && fehler.code).toBe("ORG_EDIT_FEHLT");
    expect(m).toEqual(vorher);
  });

  it("die Rechtegrundlage ist das bestehende org.edit: kein neues Recht in rollen.js, Planung hat es nicht", async () => {
    const quelle = readFileSync(path.join(import.meta.dirname, "../server/lib/import/org.mjs"), "utf8");
    expect(quelle).toMatch(/org\.edit/);
    expect(quelle).not.toMatch(/ALLE_RECHTE|import\.org|org\.create|org\.import/);
    const { darf } = await import("../server/lib/rechte.mjs");
    expect(darf("leitung", "org.edit")).toBe(true);
    expect(darf("planer", "org.edit")).toBe(false);
    expect(darf("planer", "staff.edit")).toBe(true);
  });
});

describe("IMP-5 A3: mit org.edit wird angelegt, Qualifikationen ohne Sonderstatus", () => {
  const lauf = (zeilenDatei, optionen = {}) => {
    const m = MANDANT();
    const a = analysieren({ mandant: m, heute: HEUTE, zeilen: zeilenDatei });
    const p = planen({ mandant: m, analyse: a, einheitenAnlegen: true, orgEdit: true, ...optionen });
    return { m, a, p };
  };
  it("Plan: neue Einheit, Standort und Qualifikation einmal je Name (ohne Groß-/Kleinschreibung), Datensätze „neu“", () => {
    const { p } = lauf(zeilen(["5001", "Neu", "Nina", "Station Nord", "Haus Ost", "Hebammenkunde, Ersthelfer"],
      ["5002", "Neu", "Nico", "station nord", "HAUS OST", "hebammenkunde"]));
    expect(p.ok).toBe(true);
    expect(p.plan.neueEinheiten).toEqual(["Station Nord"]);
    expect(p.plan.neueStandorte).toEqual(["Haus Ost"]);
    expect(p.plan.neueQualifikationen).toEqual(["Hebammenkunde"]);
    expect(p.zaehler).toMatchObject({ neu: 2, offen: 0, neueEinheiten: 1, neueStandorte: 1, neueQualifikationen: 1 });
  });
  it("anwenden: legt an, hängt Qualifikationen NUR an neue Personen, verändert die Eingabe nicht", () => {
    const { m, p } = lauf(zeilen(["5001", "Neu", "Nina", "Station Nord", "Haus Ost", "Hebammenkunde, Ersthelfer"]));
    const eingabe = eingefroren(kopie(m));
    const { mandant: neu, neueIds } = anwenden(eingabe, p.plan, { neueId, heute: HEUTE, orgEdit: true });
    const q = neu.qualifikationen.find((x) => x.name === "Hebammenkunde");
    expect(q).toBeTruthy();
    expect(neu.qualifikationen).toHaveLength(3);
    expect(neu.einheiten.map((e) => e.name)).toContain("Station Nord");
    expect(neu.standorte.map((s) => s.name)).toContain("Haus Ost");
    const person = neu.personen.find((x) => x.id === neueIds[0]);
    expect(person.qualifikationen.sort()).toEqual(["q2", q.id].sort());
    expect(typeof q.kurz).toBe("string");
    expect(q.kurz.length).toBeGreaterThan(1);
    expect(new Set(neu.qualifikationen.map((x) => x.id)).size).toBe(3);
    expect(new Set(neu.qualifikationen.map((x) => x.kurz.toLowerCase())).size).toBe(3);
    /* kein Sonderstatus */
    expect(q).toMatchObject({ fachkraft: false, harteSperre: false, nachweisPflicht: false, gueltigMonate: null });
    /* die bestehende Person ist unverändert */
    expect(neu.personen.find((x) => x.id === "p1")).toEqual(m.personen[0]);
  });
  it("bestehende Qualifikationen werden nur zugeordnet, nie verändert (Fachkraft, Sperre, Nachweis bleiben)", () => {
    const { m, p } = lauf(zeilen(["5001", "Neu", "Nina", "Wohnbereich 1", "", "PFK"]));
    expect(p.plan.neueQualifikationen).toEqual([]);
    const { mandant: neu, neueIds } = anwenden(m, p.plan, { neueId, heute: HEUTE, orgEdit: false });   // nichts anzulegen → org.edit nicht nötig
    expect(neu.qualifikationen).toEqual(m.qualifikationen);
    expect(neu.personen.find((x) => x.id === neueIds[0]).qualifikationen).toEqual(["q1"]);
  });
  it("„Aktualisieren“ ändert nie die Qualifikationen einer bestehenden Person", () => {
    expect(AKTUALISIERBAR).not.toContain("qualifikationen");
    const m = MANDANT();
    const a = analysieren({ mandant: m, heute: HEUTE, zeilen: zeilen(["1001", "Beispiel", "Erika", "Wohnbereich 1", "", "Pflegefachkraft"]) });
    const p = planen({ mandant: m, analyse: a, entscheidungen: { 1: "aktualisieren" }, bestaetigungen: { 1: true }, orgEdit: false });
    expect(p.ok).toBe(true);
    const { mandant: neu } = anwenden(m, p.plan, { neueId, heute: HEUTE });
    expect(neu.personen.find((x) => x.id === "p1").qualifikationen).toEqual(["q2"]);
  });
  it("der Hash der Vorschau ändert sich, wenn sich der Katalog zwischen Vorschau und Übernahme ändert", () => {
    const zl = zeilen(["5001", "Neu", "Nina", "Wohnbereich 1", "", "Hebammenkunde"]);
    const m = MANDANT();
    const h1 = planen({ mandant: m, analyse: analysieren({ mandant: m, heute: HEUTE, zeilen: zl }), einheitenAnlegen: true, orgEdit: true }).hash;
    m.qualifikationen.push({ id: "q9", name: "Hebammenkunde", kurz: "HK" });
    const h2 = planen({ mandant: m, analyse: analysieren({ mandant: m, heute: HEUTE, zeilen: zl }), einheitenAnlegen: true, orgEdit: true }).hash;
    expect(h2).not.toBe(h1);
  });
  it("Qualifikationen je Zelle begrenzt: zu viele oder zu lange → Fehler des Datensatzes, kein Abschneiden", () => {
    const viele = Array.from({ length: 21 }, (_, i) => `Q${i}`).join(",");
    const a = analysieren({ mandant: MANDANT(), heute: HEUTE, zeilen: zeilen(["5001", "Neu", "Nina", "Wohnbereich 1", "", viele],
      ["5002", "Neu", "Nico", "Wohnbereich 1", "", "L".repeat(101)]) });
    expect(a.datensaetze.map((d) => d.fehler)).toEqual([["Qualifikationen zu umfangreich"], ["Qualifikationen zu umfangreich"]]);
    expect(a.datensaetze.map((d) => d.vorgabe)).toEqual(["ueberspringen", "ueberspringen"]);
  });
});

/* --------------------------------------------------------------------------
   HTTP-Ebene: /api/import (Rollen aus der Sitzung, Schreiben über den Bestand)
   -------------------------------------------------------------------------- */
const WIRT = "127.0.0.1:3000";
let wurzel, laden, imp, B, sitzungAnlegen, V, U;
let raumNr = 0;
let nr = 0;
const kopf = (token, extra = {}) => {
  nr += 1;
  return { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.55.${Math.floor(nr / 250) % 250}.${nr % 250}`,
    ...(token ? { authorization: `Bearer ${token}` } : {}), ...extra };
};
async function hochladen(token, datei) {
  const a = await imp(new Request(`http://${WIRT}/api/import/upload`, { method: "POST",
    headers: kopf(token, { "content-type": "application/octet-stream", "x-dateiname": encodeURIComponent("personal-test.csv") }), body: datei }), {});
  let d = {}; try { d = await a.json(); } catch { /* leer */ }
  return { status: a.status, ...d };
}
async function schritt(token, weg, rumpf) {
  const a = await imp(new Request(`http://${WIRT}/api/import/${weg}`, { method: "POST",
    headers: kopf(token, { "content-type": "application/json" }), body: JSON.stringify(rumpf) }), {});
  let d = {}; try { d = await a.json(); } catch { /* leer */ }
  return { status: a.status, ...d };
}
const csv = (z) => Buffer.from(z.map((r) => r.join(";")).join("\n"), "utf8");
const person = (id, rolle, einheit, mehr = {}) => ({ id, vorname: `V${id}`, nachname: `N${id}`, rolle, bereich: einheit, status: "aktiv",
  email: "", funktion: "Fachkraft", eintritt: "2020-01-01", wochenstunden: 38.5, urlaubsanspruch: 30, qualifikationen: [],
  zugehoerigkeit: [{ ab: "2020-01-01", einheitId: einheit }], ...mehr });
const betrieb = () => ({ id: "m1", name: "Haus 1", status: "aktiv",
  einheiten: [{ id: "m1-e1", name: "Wohnbereich 1", versatz: 0 }], standorte: [{ id: "st1", name: "Haus Nord" }],
  zyklus: { wochen: 1, tage: ["-", "-", "-", "-", "-", "-", "-"] },
  dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00", pause: 30 }],
  qualifikationen: [{ id: "q1", name: "Pflegefachkraft", kurz: "PFK", fachkraft: true, harteSperre: false, nachweisPflicht: true, gueltigMonate: null }],
  einstellungen: { ruhezeit: 11, maxFolge: 6 },
  personen: [person("l1", "leitung", "ALLE"), person("p1", "planer", "ALLE")],
  abweichungen: {}, abwesenheiten: [], erfassung: {}, einstempeln: {}, anfragen: [], nachrichten: [], bestaetigungen: [] });
async function neuerRaum() {
  const raum = `imp5-${++raumNr}`;
  await B.bestandSchreiben(laden(), raum, { version: 9, mandanten: [betrieb()] }, { durch: "Prüfung" });
  const t = {};
  t.LT = (await sitzungAnlegen({ bestand: raum, name: "Test LT", rolle: "leitung", person: "l1", betrieb: 0, mandantId: "m1", einheit: null }, 2 * 3600 * 1000)).token;
  t.PL = (await sitzungAnlegen({ bestand: raum, name: "Test PL", rolle: "planer", person: "p1", betrieb: 0, mandantId: "m1", einheit: null }, 2 * 3600 * 1000)).token;
  return { raum, t };
}
const betriebVon = async (raum) => (await B.bestandLesen(laden(), raum)).bestand.mandanten.find((m) => m.id === "m1");
const KOPF_HTTP = ["Personalnummer", "Nachname", "Vorname", "Einheit", "Standort", "Qualifikationen"];
const DATEI = () => csv([KOPF_HTTP,
  ["8001", "Neu", "Nina", "Wohnbereich 1", "", "Hebammenkunde, Pflegefachkraft"],
  ["8002", "Alt", "Alf", "Wohnbereich 1", "", "pflegefachkraft"]]);

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-imp5-"));
  process.env.CENTRIC_IMPORT_AKTIV = "true";   // Server-Schalter (Vorgabe aus); diese Datei prüft den eingeschalteten Import
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
  const { getStore } = await import("../server/lib/ablage.mjs");
  laden = () => getStore({ name: "centric", consistency: "strong" });
  imp = (await import("../server/funktionen/import.mjs")).default;
  B = await import("../server/lib/bestand.mjs");
  V = await import("../server/lib/import/vorgaenge.mjs");
  U = await import("../server/lib/import/uebernahme.mjs");
  ({ sitzungAnlegen } = await import("../server/lib/sitzungen.mjs"));
});
afterAll(async () => { if (wurzel) await rm(wurzel, { recursive: true, force: true }); });
afterEach(() => { U._pruefhaken.nachDatensatz = null; U._pruefhaken.ablage = null; if (V._pruefhaken) V._pruefhaken.vorParser = null; V._zuruecksetzen(); });

describe("IMP-5 über den Endpunkt", { timeout: 120000 }, () => {
  it("Planung: fehlende Qualifikation ist Zuordnungskonflikt; Anlegen → 403; die Zeile bleibt offen, der Katalog unverändert", async () => {
    const { raum, t } = await neuerRaum();
    const up = await hochladen(t.PL, DATEI());
    expect(up.status, JSON.stringify(up)).toBe(201);
    const an = await schritt(t.PL, "analyse", { vorgang: up.vorgang });
    expect(an.status).toBe(200);
    expect(an.datensaetze[0].konflikte).toEqual([{ art: "qualifikation-unbekannt" }]);
    expect(an.datensaetze[1].konflikte).toEqual([]);
    const vs = await schritt(t.PL, "vorschau", { vorgang: up.vorgang });
    expect(vs.status).toBe(200);
    expect(vs.zaehler).toMatchObject({ neu: 1, offen: 1, neueQualifikationen: 0 });
    expect(vs.vorschau.neueQualifikationen).toEqual([]);
    const anlegen = await schritt(t.PL, "vorschau", { vorgang: up.vorgang, einheitenAnlegen: true });
    expect(anlegen.status).toBe(403);
    expect(anlegen.code).toBe("ORG_EDIT_FEHLT");
    expect((await schritt(t.PL, "vorschau", { vorgang: up.vorgang, entscheidungen: { 1: "neu" } })).code).toBe("ZUORDNUNGSKONFLIKT");
    const ue = await schritt(t.PL, "uebernahme", { vorgang: up.vorgang, bestaetigung: vs.bestaetigung });
    expect(ue.status, JSON.stringify(ue)).toBe(200);
    const m = await betriebVon(raum);
    expect(m.qualifikationen.map((q) => q.name)).toEqual(["Pflegefachkraft"]);
    expect(m.einheiten.map((e) => e.name)).toEqual(["Wohnbereich 1"]);
    expect(m.personen.some((p) => p.personalnummer === "8001")).toBe(false);
    expect(m.personen.find((p) => p.personalnummer === "8002").qualifikationen).toEqual(["q1"]);
  });

  it("Leitung (org.edit) legt die Qualifikation an; sie trägt keinen Sonderstatus; die Person bekommt sie", async () => {
    const { raum, t } = await neuerRaum();
    const up = await hochladen(t.LT, DATEI());
    expect((await schritt(t.LT, "analyse", { vorgang: up.vorgang })).status).toBe(200);
    const vs = await schritt(t.LT, "vorschau", { vorgang: up.vorgang, einheitenAnlegen: true });
    expect(vs.status, JSON.stringify(vs)).toBe(200);
    expect(vs.vorschau.neueQualifikationen).toEqual(["Hebammenkunde"]);
    expect(vs.zaehler).toMatchObject({ neu: 2, offen: 0, neueQualifikationen: 1 });
    const ue = await schritt(t.LT, "uebernahme", { vorgang: up.vorgang, bestaetigung: vs.bestaetigung });
    expect(ue.status, JSON.stringify(ue)).toBe(200);
    expect(ue.zaehler.neueQualifikationen).toBe(1);
    const m = await betriebVon(raum);
    const hk = m.qualifikationen.find((q) => q.name === "Hebammenkunde");
    expect(hk).toMatchObject({ fachkraft: false, harteSperre: false, nachweisPflicht: false, gueltigMonate: null });
    expect(m.qualifikationen.find((q) => q.id === "q1")).toMatchObject({ fachkraft: true, nachweisPflicht: true });   // Bestand unverändert
    expect(m.qualifikationen).toHaveLength(2);
    expect(m.personen.find((p) => p.personalnummer === "8001").qualifikationen.sort()).toEqual(["q1", hk.id].sort());
    expect(m.personen.find((p) => p.personalnummer === "8002").qualifikationen).toEqual(["q1"]);
  });

  it("derselbe Katalog-Eintrag entsteht bei erneutem Import nicht doppelt (Wiederholschutz je Datei, neue Datei findet ihn)", async () => {
    const { raum, t } = await neuerRaum();
    for (const nrx of ["8101", "8102"]) {
      const up = await hochladen(t.LT, csv([KOPF_HTTP, [nrx, "Neu", `P${nrx}`, "Wohnbereich 1", "", "Hebammenkunde"]]));
      expect((await schritt(t.LT, "analyse", { vorgang: up.vorgang })).status).toBe(200);
      const vs = await schritt(t.LT, "vorschau", { vorgang: up.vorgang, einheitenAnlegen: true });
      expect(vs.status).toBe(200);
      expect((await schritt(t.LT, "uebernahme", { vorgang: up.vorgang, bestaetigung: vs.bestaetigung })).status).toBe(200);
    }
    const m = await betriebVon(raum);
    expect(m.qualifikationen.filter((q) => q.name === "Hebammenkunde")).toHaveLength(1);
  });

  it("Planung kann auch über einen manipulierten Rumpf nichts anlegen (einheitenAnlegen ohne org.edit → 403, nichts geschrieben)", async () => {
    const { raum, t } = await neuerRaum();
    const vorher = await B.bestandLesen(laden(), raum);
    const up = await hochladen(t.PL, csv([KOPF_HTTP, ["8201", "Neu", "Nina", "Station Nord", "Haus Ost", "Hebammenkunde"]]));
    expect((await schritt(t.PL, "analyse", { vorgang: up.vorgang })).status).toBe(200);
    for (const rumpf of [{ einheitenAnlegen: true }, { einheitenAnlegen: true, entscheidungen: { 1: "neu" } }]) {
      const r = await schritt(t.PL, "vorschau", { vorgang: up.vorgang, ...rumpf });
      expect(r.status).toBe(403);
      expect(r.code).toBe("ORG_EDIT_FEHLT");
    }
    expect((await B.bestandLesen(laden(), raum)).stand).toBe(vorher.stand);
  });
});

/* --------------------------------------------------------------------------
   Folgeauftrag zu PR #187
   -------------------------------------------------------------------------- */
describe("IMP-5 Anzeige: welche Qualifikationen eine neue Person bekäme (Name, Kennzeichen, neu/bestehend)", () => {
  it("Analyse: je Datensatz die zugeordneten Qualifikationen mit Fachkraft/Nachweis/Sperre und neu/bestehend", () => {
    const a = analysieren({ mandant: MANDANT(), heute: HEUTE, zeilen: zeilen(["5001", "Neu", "Nina", "Wohnbereich 1", "", "Pflegefachkraft, EH, Hebammenkunde"]) });
    expect(a.datensaetze[0].qualifikationenAnzeige).toEqual([
      { name: "Pflegefachkraft", kurz: "PFK", neu: false, fachkraft: true, nachweisPflicht: true, harteSperre: true },
      { name: "Ersthelfer", kurz: "EH", neu: false, fachkraft: false, nachweisPflicht: false, harteSperre: false },
      { name: "Hebammenkunde", kurz: null, neu: true, fachkraft: false, nachweisPflicht: false, harteSperre: false }]);
  });

  it("der Bestätigungs-Hash deckt genau diese Anzeige ab: ändert sich ein Kennzeichen im Katalog, ändert sich der Hash", () => {
    const zl = zeilen(["5001", "Neu", "Nina", "Wohnbereich 1", "", "Pflegefachkraft"]);
    const hash = (m) => planen({ mandant: m, analyse: analysieren({ mandant: m, heute: HEUTE, zeilen: zl }), orgEdit: false }).hash;
    const m = MANDANT();
    const h0 = hash(m);
    expect(hash(MANDANT())).toBe(h0);
    for (const aendern of [(x) => { x.qualifikationen[0].fachkraft = false; }, (x) => { x.qualifikationen[0].nachweisPflicht = false; },
      (x) => { x.qualifikationen[0].harteSperre = false; }]) {
      const m2 = MANDANT(); aendern(m2);
      expect(hash(m2)).not.toBe(h0);
    }
    /* eine unbeteiligte Qualifikation ändert die Bestätigung nicht */
    const m3 = MANDANT(); m3.qualifikationen[1].fachkraft = true;
    expect(hash(m3)).toBe(h0);
  });

  it("qualifikationenText (Oberfläche) zeigt Name, Kennzeichen und neu/bestehend", async () => {
    const { qualifikationenText } = await import("../src/lib/import-ablauf.js");
    expect(qualifikationenText([])).toBe("keine");
    expect(qualifikationenText(undefined)).toBe("keine");
    expect(qualifikationenText([
      { name: "Pflegefachkraft", neu: false, fachkraft: true, nachweisPflicht: true, harteSperre: true },
      { name: "Hebammenkunde", neu: true, fachkraft: false, nachweisPflicht: false, harteSperre: false }]))
      .toBe("Pflegefachkraft (Fachkraft, Nachweis erforderlich, harte Sperre, bestehend); Hebammenkunde (neu angelegt)");
  });

  it("die Oberfläche bindet die Anzeige in Analysetabelle UND Vorschau ein", () => {
    const q = readFileSync(path.join(import.meta.dirname, "../src/ansichten/import-datei.jsx"), "utf8");
    expect(q.match(/qualifikationenText\(/g)).toHaveLength(2);
    expect(q).toMatch(/qualifikationenText\(d\.qualifikationen\)/);
    expect(q).toMatch(/qualifikationenText\(n\.qualifikationen\)/);
  });
});

describe("IMP-5 Namensvergleich: Unicode-Normalisierung, unsichtbare Zeichen, Kommagrenze", () => {
  const NFD = (s) => s.normalize("NFD");
  const mit = (name) => { const m = MANDANT(); m.einheiten.push({ id: "e3", name }); m.standorte.push({ id: "st2", name: "Südhaus" }); return m; };

  it("„Müller“ in NFD ist dieselbe Einheit wie in NFC (kein Konflikt, keine Dublette)", () => {
    const m = mit("Müller-Station");
    const a = analysieren({ mandant: m, heute: HEUTE, zeilen: zeilen(["5001", "Neu", "Nina", NFD("Müller-Station"), "", ""],
      ["5002", "Neu", "Nico", "MÜLLER-STATION", "", ""]) });
    expect(NFD("Müller-Station")).not.toBe("Müller-Station");
    expect(a.datensaetze.map((d) => d.konflikte)).toEqual([[], []]);
    expect(a.datensaetze.map((d) => d.einheitId)).toEqual(["e3", "e3"]);
    const p = planen({ mandant: m, analyse: a, einheitenAnlegen: true, orgEdit: true });
    expect(p.plan.neueEinheiten).toEqual([]);
  });

  it("NFD/NFC und unsichtbare Zeichen erzeugen keine zweite Einheit, keinen zweiten Standort, keine zweite Qualifikation", () => {
    const m = MANDANT();
    const a = analysieren({ mandant: m, heute: HEUTE, zeilen: zeilen(
      ["5001", "Neu", "Nina", NFD("Bürostation"), NFD("Südhaus"), "Hebamme​nkunde, Ärztliche Leitung"],
      ["5002", "Neu", "Nico", "Büro​station", "Süd­haus", "hebammenkunde, " + NFD("Ärztliche Leitung")]) });
    const p = planen({ mandant: m, analyse: a, einheitenAnlegen: true, orgEdit: true });
    expect(p.ok).toBe(true);
    expect(p.plan.neueEinheiten).toHaveLength(1);
    expect(p.plan.neueStandorte).toHaveLength(1);
    expect(p.plan.neueQualifikationen).toHaveLength(2);
    /* gespeichert wird die bereinigte NFC-Form, ohne unsichtbare Zeichen */
    const { mandant: neu } = anwenden(m, p.plan, { neueId, heute: HEUTE, orgEdit: true });
    const namen = [...neu.einheiten, ...neu.standorte, ...neu.qualifikationen].map((x) => x.name);
    for (const n of namen) { expect(n).toBe(n.normalize("NFC")); expect(n).not.toMatch(/[​­]/); }
    expect(neu.einheiten.filter((e) => e.name.toLowerCase().includes("büro"))).toHaveLength(1);
    expect(neu.qualifikationen.filter((q) => /hebamme/i.test(q.name))).toHaveLength(1);
    /* beide neuen Personen bekommen dieselbe Qualifikation */
    const quals = neu.personen.filter((x) => ["5001", "5002"].includes(x.personalnummer)).map((x) => [...x.qualifikationen].sort());
    expect(quals).toHaveLength(2);
    expect(quals[0]).toEqual(quals[1]);
  });

  it("eine vorhandene Qualifikation wird auch in NFD oder mit Null-Breite-Zeichen gefunden", () => {
    const m = MANDANT();
    m.qualifikationen.push({ id: "q7", name: "Ärztliche Leitung", kurz: "ÄL" });
    const a = analysieren({ mandant: m, heute: HEUTE, zeilen: zeilen(["5001", "Neu", "Nina", "Wohnbereich 1", "", NFD("Ärztliche Leitung") + ", Erst​helfer"]) });
    expect(a.datensaetze[0].konflikte).toEqual([]);
    expect(a.datensaetze[0].qualifikationIds.sort()).toEqual(["q2", "q7"]);
  });

  it("bekannte Grenze: ein Qualifikationsname mit Komma, Semikolon oder senkrechtem Strich ist nicht importierbar (wird getrennt, bleibt Konflikt)", () => {
    expect(org.qualifikationenAusText("Ersthelfer, Pflege ambulant; Wundmanagement | Hygiene")).toEqual(["Ersthelfer", "Pflege ambulant", "Wundmanagement", "Hygiene"]);
    const m = MANDANT();
    m.qualifikationen.push({ id: "q8", name: "Pflege, ambulant", kurz: "PA" });
    const a = analysieren({ mandant: m, heute: HEUTE, zeilen: zeilen(["5001", "Neu", "Nina", "Wohnbereich 1", "", "Pflege, ambulant"]) });
    expect(a.datensaetze[0].konflikte).toEqual([{ art: "qualifikation-unbekannt" }]);
    expect(a.datensaetze[0].neueQualifikationen).toEqual(["Pflege", "ambulant"]);
    expect(a.datensaetze[0].qualifikationIds).toEqual([]);
    expect(readFileSync(path.join(import.meta.dirname, "../docs/acc45/IMPORT-VERTRAG.md"), "utf8")).toMatch(/Qualifikationsname[^\n]*Komma/);
  });
});

describe("IMP-5 Anzeige und Bestätigung über den Endpunkt", { timeout: 120000 }, () => {
  const DATEI_Q = () => csv([KOPF_HTTP, ["8301", "Neu", "Nina", "Wohnbereich 1", "", "Pflegefachkraft, Hebammenkunde"],
    ["8302", "Alt", "Alf", "Wohnbereich 1", "", ""]]);
  const flags = (q) => ({ name: q.name, neu: q.neu, fachkraft: q.fachkraft, nachweisPflicht: q.nachweisPflicht });

  it("Analyse und Vorschau zeigen dieselben Qualifikationen mit Kennzeichen, und genau diese stehen nach der Übernahme am Betrieb", async () => {
    const { raum, t } = await neuerRaum();
    const up = await hochladen(t.LT, DATEI_Q());
    const an = await schritt(t.LT, "analyse", { vorgang: up.vorgang });
    const vs = await schritt(t.LT, "vorschau", { vorgang: up.vorgang, einheitenAnlegen: true });
    expect(vs.status, JSON.stringify(vs)).toBe(200);
    const erwartet = [{ name: "Pflegefachkraft", neu: false, fachkraft: true, nachweisPflicht: true },
      { name: "Hebammenkunde", neu: true, fachkraft: false, nachweisPflicht: false }];
    expect(an.datensaetze[0].qualifikationen.map(flags)).toEqual(erwartet);
    expect(vs.vorschau.neu[0].qualifikationen.map(flags)).toEqual(erwartet);
    expect(vs.vorschau.neu[1].qualifikationen).toEqual([]);
    expect(JSON.stringify(vs.vorschau.neu[0].qualifikationen)).toBe(JSON.stringify(an.datensaetze[0].qualifikationen));
    expect((await schritt(t.LT, "uebernahme", { vorgang: up.vorgang, bestaetigung: vs.bestaetigung })).status).toBe(200);
    const m = await betriebVon(raum);
    const person = m.personen.find((p) => p.personalnummer === "8301");
    const tatsaechlich = person.qualifikationen.map((id) => m.qualifikationen.find((q) => q.id === id))
      .map((q) => ({ name: q.name, fachkraft: q.fachkraft, nachweisPflicht: q.nachweisPflicht })).sort((a, b) => a.name.localeCompare(b.name));
    expect(tatsaechlich).toEqual(erwartet.map((q) => ({ name: q.name, fachkraft: q.fachkraft, nachweisPflicht: q.nachweisPflicht })).sort((a, b) => a.name.localeCompare(b.name)));
  });

  it("Planung sieht, dass die neue Person eine bestehende Fachkraft-Qualifikation bekäme (mit Kennzeichen)", async () => {
    const { t } = await neuerRaum();
    const up = await hochladen(t.PL, csv([KOPF_HTTP, ["8401", "Neu", "Nina", "Wohnbereich 1", "", "Pflegefachkraft"]]));
    await schritt(t.PL, "analyse", { vorgang: up.vorgang });
    const vs = await schritt(t.PL, "vorschau", { vorgang: up.vorgang });
    expect(vs.status).toBe(200);
    expect(vs.vorschau.neu[0].qualifikationen).toEqual([{ name: "Pflegefachkraft", kurz: "PFK", neu: false, fachkraft: true,
      nachweisPflicht: true, harteSperre: false }]);
  });

  it("ändert sich ein Kennzeichen der Qualifikation zwischen Vorschau und Übernahme, ist die Bestätigung veraltet (409, nichts geschrieben)", async () => {
    const { raum, t } = await neuerRaum();
    const up = await hochladen(t.PL, csv([KOPF_HTTP, ["8501", "Neu", "Nina", "Wohnbereich 1", "", "Pflegefachkraft"]]));
    await schritt(t.PL, "analyse", { vorgang: up.vorgang });
    const vs = await schritt(t.PL, "vorschau", { vorgang: up.vorgang });
    expect(vs.status).toBe(200);
    const stand = await B.bestandLesen(laden(), raum);
    const geaendert = kopie(stand.bestand);
    geaendert.mandanten[0].qualifikationen[0].fachkraft = false;
    await B.bestandSchreiben(laden(), raum, geaendert, { durch: "Prüfung" });
    const ue = await schritt(t.PL, "uebernahme", { vorgang: up.vorgang, bestaetigung: vs.bestaetigung });
    expect(ue.status).toBe(409);
    expect(ue.code).toBe("VORSCHAU_VERALTET");
    expect((await betriebVon(raum)).personen.some((p) => p.personalnummer === "8501")).toBe(false);
  });
});
