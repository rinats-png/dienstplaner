/* ==========================================================================
   Personalimport End-to-End: echte XLSX (SheetJS) -> Oberflächen-Schicht aus IMP-4
   (src/lib/import-schnittstelle.js + import-ablauf.js) -> ECHTER Handler
   server/funktionen/import.mjs (IMP-3) -> echter Bestand im Wegwerf-Datenverzeichnis.

   Kein Testdouble. Die Oberfläche bekommt als fetchFn nur eine Brücke, die den
   Aufruf (Pfad, Methode, Kopfzeilen, Rumpf) unverändert als Request an den
   Handler gibt. Damit sind Pfade und Feldnamen der UI-Schicht gegen den
   Endpunkt geprüft. Nur synthetische Daten, kein Netz, Geheimnisse nur zur Laufzeit.

   Aufruf: npx vitest run pruefungen/import-personal-e2e.test.js
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import * as XLSX from "../vendor/sheetjs/xlsx.mjs";
import { erzeugeAblauf } from "../src/lib/import-ablauf.js";
import { erzeugeImportSchnittstelle, IMPORT_PFADE } from "../src/lib/import-schnittstelle.js";

const WIRT = "127.0.0.1:3000";
let wurzel, laden, imp, B, V, U, sitzungAnlegen, spurStore;
let raumNr = 0, nr = 0;

/** Echte XLSX aus Zeilen (Arbeitsmappe mit einem Blatt). */
const xlsx = (zeilen, blatt = "Personal") => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(zeilen), blatt);
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
};
const KOPF = ["Name", "Vorname", "Personalnummer", "Einheit", "Eintritt"];

const person = (id, rolle, einheit, mehr = {}) => ({ id, vorname: `V${id}`, nachname: `N${id}`, rolle, bereich: einheit, status: "aktiv",
  email: "", funktion: "Fachkraft", eintritt: "2020-01-01", wochenstunden: 38.5, urlaubsanspruch: 30, qualifikationen: [],
  zugehoerigkeit: [{ ab: "2020-01-01", einheitId: einheit }], ...mehr });
const betrieb = (id, personen) => ({ id, name: `Haus ${id}`, status: "aktiv",
  einheiten: [{ id: `${id}-e1`, name: "Wohnbereich 1", versatz: 0 }], standorte: [], zyklus: { wochen: 1, tage: ["-", "-", "-", "-", "-", "-", "-"] },
  dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00", pause: 30 }], qualifikationen: [],
  einstellungen: { ruhezeit: 11, maxFolge: 6 }, personen,
  abweichungen: {}, abwesenheiten: [], erfassung: {}, einstempeln: {}, anfragen: [], nachrichten: [], bestaetigungen: [] });

async function neuerRaum() {
  const raum = `e2e-${++raumNr}`;
  const m1 = betrieb("m1", [person("l1", "leitung", "ALLE"),
    person("x1", "mitarbeiter", "m1-e1", { vorname: "Erika", nachname: "Beispiel", personalnummer: "1001", email: "alt@example.test", eintritt: "2019-03-01" }),
    person("x2", "mitarbeiter", "m1-e1", { vorname: "Otto", nachname: "Muster" })]);
  const m2 = betrieb("m2", [person("l2", "leitung", "ALLE")]);
  await B.bestandSchreiben(laden(), raum, { version: 9, mandanten: [m1, m2] }, { durch: "Prüfung" });
  const t = {};
  t.LT = (await sitzungAnlegen({ bestand: raum, name: "Test LT", rolle: "leitung", person: "l1", betrieb: 0, mandantId: "m1", einheit: null }, 2 * 3600 * 1000)).token;
  t.LT2 = (await sitzungAnlegen({ bestand: raum, name: "Test LT2", rolle: "leitung", person: "l2", betrieb: 1, mandantId: "m2", einheit: null }, 2 * 3600 * 1000)).token;
  return { raum, t };
}
const lesen = (raum) => B.bestandLesen(laden(), raum);
const betriebVon = async (raum, id) => (await lesen(raum)).bestand.mandanten.find((m) => m.id === id);

/** Brücke: UI-fetch -> echter Handler. Merkt sich jeden Aufruf (Pfad, Methode, Typ, Rumpfschlüssel). */
function bruecke(token) {
  const aufrufe = [];
  const fetchFn = async (pfad, init = {}) => {
    nr += 1;
    const h = { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.77.${Math.floor(nr / 250) % 250}.${nr % 250}`,
      authorization: `Bearer ${token}`, ...(init.headers || {}) };
    aufrufe.push({ pfad, methode: init.method, typ: h["content-type"],
      rumpfSchluessel: typeof init.body === "string" ? Object.keys(JSON.parse(init.body)).sort() : null });
    return imp(new Request(`http://${WIRT}${pfad}`, { method: init.method, headers: h, body: init.body }), {});
  };
  return { fetchFn, aufrufe };
}
/** Roher Schritt (ohne UI) für Fehler- und Mandantenfälle. */
async function roh(token, weg, rumpf) {
  const { fetchFn } = bruecke(token);
  const a = await fetchFn(`/api/import/${weg}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(rumpf) });
  let d = {}; try { d = await a.json(); } catch { /* leer */ }
  return { status: a.status, ...d };
}

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-impe2e-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = randomBytes(24).toString("hex");   // nur zur Laufzeit erzeugt
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
afterEach(() => { U._pruefhaken.nachDatensatz = null; U._pruefhaken.ablage = null; V._zuruecksetzen(); });

/* Datensätze (Zeilennummer der Daten = Datensatznummer):
   1 neu mit Eintritt · 2 Personalnummer-Treffer (Erika), ausdrücklich aktualisieren · 3 neu ohne Eintritt
   4 Namenstreffer ohne Nummer (Otto) -> überspringen · 5 unbekannte Einheit -> Konflikt, bleibt draußen */
const PERSONAL = () => xlsx([[...KOPF, "E-Mail"],
  ["Neumann", "Lena", "3001", "Wohnbereich 1", "2026-02-01", ""],
  ["Beispiel", "Erika", "1001", "Wohnbereich 1", "2025-01-01", "neu@example.test"],
  ["Kranz", "Paul", "3002", "Wohnbereich 1", "", ""],
  ["Muster", "Otto", "", "Wohnbereich 1", "2026-04-05", ""],
  ["Nord", "Nina", "3003", "Station Nord", "2026-05-01", ""]]);

describe("E2E 1 Personalimport durch alle Schritte (UI-Schicht -> echter Endpunkt)", { timeout: 120000 }, () => {
  it("upload -> analyse -> vorschau -> uebernahme mit Code der letzten Vorschau; Protokoll ohne Namen", async () => {
    const { raum, t } = await neuerRaum();
    const { fetchFn, aufrufe } = bruecke(t.LT);
    const a = erzeugeAblauf(erzeugeImportSchnittstelle({ fetchFn }));

    expect(await a.hochladen(Object.assign(PERSONAL(), { name: "Geheim-Personal-Neumann.xlsx" }))).toBe(true);
    let z = a.zustand();
    expect(z.schritt, JSON.stringify(z.fehler)).toBe("pruefen");
    expect(z.format).toBe("xlsx");
    expect(z.fehlendePflicht).toEqual([]);
    expect(z.zuordnung).toMatchObject({ nachname: 0, vorname: 1, personalnummer: 2, einheit: 3, eintritt: 4 });
    const nach = Object.fromEntries(z.datensaetze.map((d) => [d.datensatz, d]));
    expect(nach[1].vorgabe).toBe("neu");
    expect(nach[2].dublette).toMatchObject({ art: "personalnummer", personId: "x1" });
    expect(nach[2].erlaubt).not.toContain("neu");
    expect(nach[3].vorgabe).toBe("neu");
    expect(nach[4].dublette).toMatchObject({ art: "name", personId: "x2" });
    expect(nach[4].erlaubt).not.toContain("aktualisieren");
    expect(nach[5].konflikte).toEqual([{ art: "einheit-unbekannt" }]);
    /* Startwahl der UI: nie "aktualisieren". */
    expect(Object.values(z.entscheidungen)).not.toContain("aktualisieren");

    /* Entscheidungen: 2 ausdrücklich aktualisieren (mit Häkchen), 4 überspringen, 5 bleibt offen (klaeren). */
    const stand0 = (await lesen(raum)).stand;
    expect(a.entscheiden(2, "aktualisieren")).toBe(true);
    expect(a.entscheiden(4, "ueberspringen")).toBe(true);
    expect(await a.vorschauErstellen()).toBe(false);            // Aktualisieren ohne Bestätigung: UI ruft den Server nicht
    expect(a.zustand().fehlercode).toBe("AKTUALISIERUNG_OHNE_BESTAETIGUNG");
    expect(aufrufe.filter((x) => x.pfad === IMPORT_PFADE.vorschau)).toHaveLength(0);
    expect(a.bestaetigenAktualisierung(2, true)).toBe(true);
    expect(await a.vorschauErstellen(), JSON.stringify(a.zustand().fehler)).toBe(true);
    z = a.zustand();
    expect(z.schritt).toBe("vorschau");
    expect(z.zaehler).toMatchObject({ neu: 2, aktualisiert: 1, uebersprungen: 2, offen: 1 });
    expect(z.vorschau.neu.map((n) => n.personalnummer).sort()).toEqual(["3001", "3002"]);
    expect(z.vorschau.neu.find((n) => n.personalnummer === "3002").eintritt).toBeNull();
    expect(z.vorschau.neu.find((n) => n.personalnummer === "3002").eintrittAnzeige).toBe("nicht angegeben");
    expect(z.vorschau.aktualisieren[0]).toMatchObject({ personId: "x1" });
    expect(z.vorschau.aktualisieren[0].aenderungen.map((c) => c.feld)).toEqual(["email"]);   // Eintritt wird nie überschrieben
    expect((await lesen(raum)).stand, "Vorschau ändert den Bestand nicht").toBe(stand0);

    /* Übernahme: ohne Häkchen nicht; mit Häkchen mit dem Code der letzten Vorschau. */
    expect(await a.uebernehmen()).toBe(false);
    a.bestaetigtSetzen(true);
    const code = a.zustand().bestaetigungscode;
    expect(await a.uebernehmen(), JSON.stringify(a.zustand().fehler)).toBe(true);
    expect(a.zustand().schritt).toBe("fertig");
    expect(a.zustand().ergebnis).toMatchObject({ neu: 2, aktualisiert: 1, uebersprungen: 2 });
    expect(a.zustand().datensaetze).toEqual([]);

    const m1 = await betriebVon(raum, "m1");
    expect(m1.personen.find((p) => p.personalnummer === "3001")).toMatchObject({ vorname: "Lena", nachname: "Neumann", eintritt: "2026-02-01", rolle: "mitarbeiter" });
    expect(m1.personen.find((p) => p.personalnummer === "3002").eintritt).toBeNull();
    expect(m1.personen.some((p) => p.personalnummer === "3003"), "Konflikt (unbekannte Einheit) wird nicht angelegt").toBe(false);
    expect(m1.personen.filter((p) => p.nachname === "Muster" && p.vorname === "Otto")).toHaveLength(1);   // Namenstreffer: nichts angelegt
    const erika = m1.personen.find((p) => p.id === "x1");
    expect(m1.personen.filter((p) => p.personalnummer === "1001")).toHaveLength(1);
    expect(erika).toMatchObject({ email: "neu@example.test", eintritt: "2019-03-01" });   // Eintritt wird nie überschrieben
    expect(m1.personen.length).toBe(3 + 2);
    expect((await betriebVon(raum, "m2")).personen.map((p) => p.id)).toEqual(["l2"]);

    /* Der Server hat genau den Code der letzten Vorschau verlangt (Gegenprobe: ein anderer Code wird abgelehnt). */
    expect(code).toMatch(/\S/);
    const zweit = await roh(t.LT, "uebernahme", { vorgang: a.zustand().vorgang, bestaetigung: code });
    expect(zweit).toMatchObject({ status: 409, code: "BEREITS_UEBERNOMMEN" });

    /* Protokoll: Zahlen, Codes, Person-Id; keine Namen, E-Mails, Nummern, Dateinamen. */
    const { blobs } = await spurStore().list({ prefix: "" });
    const zeilen = [];
    for (const b of blobs) if (b.key.includes("/import/")) zeilen.push(await spurStore().get(b.key, { type: "json" }));
    const erfolg = zeilen.find((r) => r.ausgang === "erfolg");
    expect(erfolg).toMatchObject({ art: "import", person: "l1", mandantId: "m1" });
    expect(erfolg.zusatz).toContain("neu 2 · aktualisiert 1 · übersprungen 2");
    const text = JSON.stringify(zeilen);
    for (const verboten of ["Neumann", "Lena", "Kranz", "Paul", "Beispiel", "Erika", "Muster", "Otto", "Nina", "Nord", "3001", "3002", "1001", "alt@example", "Geheim", ".xlsx"])
      expect(text, verboten).not.toContain(verboten);
  });
});

describe("E2E 2 Keine automatische Überschreibung, Dubletten nur bei fehlender Nummer", { timeout: 120000 }, () => {
  const ERIKA = () => xlsx([KOPF, ["Beispiel", "Erika", "1001", "Wohnbereich 1", "2024-01-01"]]);
  async function bisAnalyse(t, datei) {
    const s = erzeugeImportSchnittstelle({ fetchFn: bruecke(t.LT).fetchFn });
    const up = await s.upload(datei, "personal");
    expect(up.ok, JSON.stringify(up)).toBe(true);
    const an = await s.analyse({ vorgang: up.daten.vorgang, blatt: up.daten.vorgabeBlatt });
    expect(an.ok).toBe(true);
    return { s, vorgang: up.daten.vorgang, an: an.daten };
  }
  it("gleiche Personalnummer: Vorgabe klären, nichts ohne ausdrückliche Entscheidung geändert", async () => {
    const { raum, t } = await neuerRaum();
    const vorher = await betriebVon(raum, "m1");
    const { s, vorgang, an } = await bisAnalyse(t, ERIKA());
    expect(an.datensaetze[0].vorgabe).toBe("klaeren");
    const v0 = await s.vorschau({ vorgang, entscheidungen: {}, bestaetigungen: {}, einheitenAnlegen: false });
    expect(v0.daten.zaehler).toMatchObject({ neu: 0, aktualisiert: 0 });
    expect(v0.daten.bereit).toBe(false);
    const neu = await s.vorschau({ vorgang, entscheidungen: { 1: "neu" }, bestaetigungen: {}, einheitenAnlegen: false });
    expect(neu).toMatchObject({ ok: false, status: 422, code: "ENTSCHEIDUNG_UNZULAESSIG" });
    const ohne = await s.vorschau({ vorgang, entscheidungen: { 1: "aktualisieren" }, bestaetigungen: {}, einheitenAnlegen: false });
    expect(ohne).toMatchObject({ ok: false, status: 422, code: "AKTUALISIERUNG_OHNE_BESTAETIGUNG" });
    expect((await s.uebernahme({ vorgang, bestaetigung: v0.daten.bestaetigung })).ok, "nichts zu übernehmen").toBe(false);
    expect(await betriebVon(raum, "m1")).toEqual(vorher);
  });
  it("Datei mit Eintritt anderer Person-Daten: Aktualisierung ersetzt nur erlaubte Felder, nie den Eintritt", async () => {
    const { raum, t } = await neuerRaum();
    const { s, vorgang } = await bisAnalyse(t, xlsx([[...KOPF, "E-Mail"], ["Beispiel", "Erika", "1001", "Wohnbereich 1", "2024-01-01", "neu@example.test"]]));
    const vs = await s.vorschau({ vorgang, entscheidungen: { 1: "aktualisieren" }, bestaetigungen: { 1: true }, einheitenAnlegen: false });
    expect(vs.ok, JSON.stringify(vs)).toBe(true);
    expect(vs.daten.vorschau.aktualisieren[0].aenderungen.map((c) => c.feld)).toEqual(["email"]);
    expect((await s.uebernahme({ vorgang, bestaetigung: vs.daten.bestaetigung })).ok).toBe(true);
    const x1 = (await betriebVon(raum, "m1")).personen.find((p) => p.id === "x1");
    expect(x1).toMatchObject({ email: "neu@example.test", eintritt: "2019-03-01" });
  });
  it("Dublettenvorschlag nur ohne Personalnummer; über den Namen nie aktualisieren, nur ausdrücklich neu", async () => {
    const { raum, t } = await neuerRaum();
    const { s, vorgang, an } = await bisAnalyse(t, xlsx([KOPF, ["Muster", "Otto", "", "Wohnbereich 1", ""]]));
    expect(an.datensaetze[0].dublette).toEqual({ art: "name", personId: "x2" });
    expect(an.datensaetze[0].vorgabe).toBe("klaeren");
    expect(an.datensaetze[0].erlaubt).not.toContain("aktualisieren");
    const akt = await s.vorschau({ vorgang, entscheidungen: { 1: "aktualisieren" }, bestaetigungen: { 1: true }, einheitenAnlegen: false });
    expect(akt).toMatchObject({ ok: false, code: "ENTSCHEIDUNG_UNZULAESSIG" });
    const vorgabe = await s.vorschau({ vorgang, entscheidungen: {}, bestaetigungen: {}, einheitenAnlegen: false });
    expect(vorgabe.daten.zaehler.neu).toBe(0);
    const neu = await s.vorschau({ vorgang, entscheidungen: { 1: "neu" }, bestaetigungen: {}, einheitenAnlegen: false });
    expect(neu.daten.zaehler.neu).toBe(1);
    expect((await s.uebernahme({ vorgang, bestaetigung: neu.daten.bestaetigung })).ok).toBe(true);
    const ottos = (await betriebVon(raum, "m1")).personen.filter((p) => p.nachname === "Muster" && p.vorname === "Otto");
    expect(ottos).toHaveLength(2);
    expect(ottos.find((p) => p.id === "x2")).toMatchObject({ email: "", eintritt: "2020-01-01" });
  });
  it("Personalnummer in der Datei mit abweichendem Namen: Treffer über die Nummer, nicht über den Namen", async () => {
    const { t } = await neuerRaum();
    const { an } = await bisAnalyse(t, xlsx([KOPF, ["Anders", "Anna", "1001", "Wohnbereich 1", ""]]));
    expect(an.datensaetze[0].dublette).toMatchObject({ art: "personalnummer", personId: "x1" });
    expect(an.datensaetze[0].erlaubt).not.toContain("neu");
  });
});

describe("E2E 3 Eintrittsdatum und Atomarität", { timeout: 120000 }, () => {
  it("ungültiges Eintrittsdatum (Text): Fehler am Datensatz, nur Überspringen; Übernahme mit Wahl neu bricht ab, nichts im Bestand", async () => {
    const { raum, t } = await neuerRaum();
    const vorher = await lesen(raum);
    const datei = xlsx([KOPF, ["Gut", "Gabi", "6001", "Wohnbereich 1", "2026-03-15"], ["Fehl", "Fritz", "6002", "Wohnbereich 1", "kein Datum"]]);
    const a = erzeugeAblauf(erzeugeImportSchnittstelle({ fetchFn: bruecke(t.LT).fetchFn }));
    expect(await a.hochladen(datei)).toBe(true);
    const d2 = a.zustand().datensaetze.find((d) => d.datensatz === 2);
    expect(d2.fehler).toContain("Eintrittsdatum ungültig");
    expect(JSON.stringify(d2.fehler)).not.toContain("kein Datum");
    expect(d2.erlaubt).toEqual(["ueberspringen"]);
    expect(a.entscheiden(2, "neu"), "UI lässt die Wahl nicht zu").toBe(false);
    /* Am Server vorbei: der Endpunkt lehnt die Wahl ab, es entsteht kein Teilbestand. */
    const up = await erzeugeImportSchnittstelle({ fetchFn: bruecke(t.LT).fetchFn }).upload(datei);
    await roh(t.LT, "analyse", { vorgang: up.daten.vorgang });
    const bad = await roh(t.LT, "vorschau", { vorgang: up.daten.vorgang, entscheidungen: { 1: "neu", 2: "neu" } });
    expect(bad.status).toBe(422);
    expect(bad.code).toBe("ENTSCHEIDUNG_UNZULAESSIG");
    expect(JSON.stringify(bad)).not.toContain("kein Datum");
    const ue = await roh(t.LT, "uebernahme", { vorgang: up.daten.vorgang, bestaetigung: "erfunden" });
    expect(ue.status).toBeGreaterThanOrEqual(409);
    expect((await lesen(raum)).stand).toBe(vorher.stand);
    expect((await betriebVon(raum, "m1")).personen.some((p) => ["6001", "6002"].includes(p.personalnummer))).toBe(false);
  });
  it("Abbruch mitten in der Übernahme: kein Teilbestand; Wiederholung mit demselben Code gelingt", async () => {
    const { raum, t } = await neuerRaum();
    const vorher = await lesen(raum);
    const datei = xlsx([KOPF, ["A", "Eins", "6101", "Wohnbereich 1", ""], ["B", "Zwei", "6102", "Wohnbereich 1", ""], ["C", "Drei", "6103", "Wohnbereich 1", ""]]);
    const a = erzeugeAblauf(erzeugeImportSchnittstelle({ fetchFn: bruecke(t.LT).fetchFn }));
    await a.hochladen(datei);
    expect(await a.vorschauErstellen()).toBe(true);
    a.bestaetigtSetzen(true);
    U._pruefhaken.nachDatensatz = (i) => { if (i === 2) throw new Error("Prüfung: Abbruch"); };
    expect(await a.uebernehmen()).toBe(false);
    expect((await lesen(raum)).stand).toBe(vorher.stand);
    expect((await betriebVon(raum, "m1")).personen.some((p) => /^610[123]$/.test(p.personalnummer || ""))).toBe(false);
    expect(a.zustand().fehler).not.toContain("Prüfung: Abbruch");
    U._pruefhaken.nachDatensatz = null;
    a.bestaetigtSetzen(true);
    expect(await a.uebernehmen(), JSON.stringify(a.zustand())).toBe(true);
    expect((await betriebVon(raum, "m1")).personen.filter((p) => /^610[123]$/.test(p.personalnummer || ""))).toHaveLength(3);
  });
  it("leeres Eintrittsdatum: null, kein Fehler, nicht das heutige Datum", async () => {
    const { raum, t } = await neuerRaum();
    const a = erzeugeAblauf(erzeugeImportSchnittstelle({ fetchFn: bruecke(t.LT).fetchFn }));
    await a.hochladen(xlsx([KOPF, ["Leer", "Lea", "6201", "Wohnbereich 1", ""]]));
    expect(a.zustand().datensaetze[0].fehler).toEqual([]);
    expect(await a.vorschauErstellen()).toBe(true);
    a.bestaetigtSetzen(true);
    expect(await a.uebernehmen()).toBe(true);
    const p = (await betriebVon(raum, "m1")).personen.find((x) => x.personalnummer === "6201");
    expect(p.eintritt).toBeNull();
    expect(p.eintritt).not.toBe(new Date().toISOString().slice(0, 10));
  });
});

describe("E2E 4 Mandant", { timeout: 120000 }, () => {
  it("Benutzer eines anderen Betriebs bekommt 404 auf alle Schritte des Vorgangs; der Besitzer kann weiter übernehmen", async () => {
    const { raum, t } = await neuerRaum();
    const a = erzeugeAblauf(erzeugeImportSchnittstelle({ fetchFn: bruecke(t.LT).fetchFn }));
    await a.hochladen(PERSONAL());
    a.entscheiden(4, "ueberspringen"); a.entscheiden(2, "ueberspringen");
    expect(await a.vorschauErstellen()).toBe(true);
    const { vorgang, bestaetigungscode } = a.zustand();
    for (const weg of ["analyse", "vorschau", "uebernahme", "verwerfen"]) {
      const r = await roh(t.LT2, weg, { vorgang, bestaetigung: bestaetigungscode });
      expect(r.status, weg).toBe(404);
      expect(r.code).toBe("NICHT_GEFUNDEN");
      expect(Object.keys(r).sort()).toEqual(["code", "fehler", "status"]);
    }
    a.bestaetigtSetzen(true);
    expect(await a.uebernehmen()).toBe(true);
    expect((await betriebVon(raum, "m2")).personen.map((p) => p.id)).toEqual(["l2"]);
  });
});

describe("E2E 5 UI-Schicht gegen Endpunkt: Pfade und Feldnamen", { timeout: 120000 }, () => {
  it("jeder Aufruf der UI trifft einen registrierten Pfad (POST) mit den Feldnamen, die der Handler liest", async () => {
    const { config } = await import("../server/funktionen/import.mjs");
    expect(Object.values(IMPORT_PFADE).sort()).toEqual([...config.path].sort());
    const { t } = await neuerRaum();
    const { fetchFn, aufrufe } = bruecke(t.LT);
    const a = erzeugeAblauf(erzeugeImportSchnittstelle({ fetchFn }));
    await a.hochladen(PERSONAL());
    a.entscheiden(2, "ueberspringen"); a.entscheiden(4, "ueberspringen");
    await a.vorschauErstellen();
    a.bestaetigtSetzen(true);
    await a.uebernehmen();
    expect(aufrufe.map((x) => x.pfad)).toEqual(["/api/import/upload?art=personal", IMPORT_PFADE.analyse, IMPORT_PFADE.vorschau, IMPORT_PFADE.uebernahme]);
    expect(aufrufe.every((x) => x.methode === "POST")).toBe(true);
    expect(aufrufe[0].typ).toBe("application/octet-stream");
    expect(aufrufe[1].rumpfSchluessel).toEqual(["blatt", "vorgang"]);                     // zuordnung: undefined wird nicht gesendet
    expect(aufrufe[2].rumpfSchluessel).toEqual(["bestaetigungen", "einheitenAnlegen", "entscheidungen", "vorgang"]);
    expect(aufrufe[3].rumpfSchluessel).toEqual(["bestaetigung", "vorgang"]);
    /* Antwortfelder, die die UI liest, kommen vom Endpunkt in dieser Form an (bereits im Ablauf geprüft; hier die Schlüssel). */
    const z = a.zustand();
    expect(z.schritt).toBe("fertig");
    expect(Object.keys(z.ergebnis).sort()).toEqual(expect.arrayContaining(["aktualisiert", "neu", "uebersprungen"]));
  });
  it("verwerfen: UI-Aufruf löscht den Vorgang am Endpunkt", async () => {
    const { t } = await neuerRaum();
    const { fetchFn, aufrufe } = bruecke(t.LT);
    const a = erzeugeAblauf(erzeugeImportSchnittstelle({ fetchFn }));
    await a.hochladen(PERSONAL());
    const vorgang = a.zustand().vorgang;
    await a.verwerfen();
    expect(aufrufe.at(-1).pfad).toBe(IMPORT_PFADE.verwerfen);
    expect((await roh(t.LT, "analyse", { vorgang })).status).toBe(404);
  });
});
