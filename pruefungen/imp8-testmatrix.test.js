/* ==========================================================================
   IMP-8 — Synthetische Testdateien und Testmatrix (20 Fälle F01–F20)
   Matrix, Herleitung und Annahmen: docs/acc45/IMP-8-TESTMATRIX.md
   Fixtures: pruefungen/import-fixtures/ (CSV/TSV statisch, Binärdateien aus erzeuge.mjs zur Laufzeit)

   Ebenen: Unit = parseDatei (IMP-2) und analysieren (IMP-3, rein); HTTP = echter Handler
   server/funktionen/import.mjs im Wegwerf-Datenverzeichnis (wie import-endpunkt.test.js). Der Schalter
   IMPORT_DATEI_AKTIV (Oberfläche) bleibt aus und wird nicht berührt; E2E (Browser) ist offen.
   Nur synthetische Daten, kein Netz, keine Produktivdaten.

   Aufruf: npx vitest run pruefungen/imp8-testmatrix.test.js --testTimeout=120000
   ========================================================================== */
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { mkdtemp, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseDatei } from "../server/lib/import/parser.mjs";
import { analysieren } from "../server/lib/import/personen.mjs";
import { csvText } from "../src/csvfeld.js";
import * as F from "./import-fixtures/erzeuge.mjs";

const HEUTE = "2026-11-12";
const WIRT = "127.0.0.1:3000";
const hat = (r, code) => (r.hinweise || []).some((h) => h.code === code);

/* ---------------- Betrieb für die Analyse (rein erfundene Personen) ---------------- */
const bestandPerson = { id: "b1", vorname: "Fiktiv", nachname: "Testperson Bestand", personalnummer: "TP-0001", rolle: "mitarbeiter",
  bereich: "m1-e1", status: "aktiv", email: "", funktion: "Fachkraft", eintritt: "2020-01-01", wochenstunden: 38.5, urlaubsanspruch: 30,
  qualifikationen: [], zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "m1-e1" }] };
const betrieb = (personen = []) => ({ id: "m1", name: "Haus Test", status: "aktiv",
  einheiten: [{ id: "m1-e1", name: "Wohnbereich 1", versatz: 0 }], standorte: [], qualifikationen: [], personen,
  zyklus: { wochen: 1, tage: ["-", "-", "-", "-", "-", "-", "-"] }, dienstarten: [], einstellungen: {},
  abweichungen: {}, abwesenheiten: [], erfassung: {}, einstempeln: {}, anfragen: [], nachrichten: [], bestaetigungen: [] });

/** Datei → Parser → Analyse (erstes Blatt). */
async function lesenUndAnalysieren(buffer, name, mandant = betrieb()) {
  const r = await parseDatei({ buffer, name });
  expect(r.ok, JSON.stringify(r).slice(0, 300)).toBe(true);
  const a = analysieren({ mandant, zeilen: r.blaetter[0].zeilen, heute: HEUTE });
  expect(a.ok, JSON.stringify(a).slice(0, 300)).toBe(true);
  return { r, a };
}
const werteOhne = (a) => a.datensaetze.map((d) => d.werte);

/* ---------------- HTTP-Gerüst (Handler im Wegwerfverzeichnis) ---------------- */
let wurzel, laden, imp, B, V, sitzungAnlegen, token, nr = 0, raumNr = 0;
const kopf = (extra = {}) => { nr += 1;
  return { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.88.${Math.floor(nr / 250) % 250}.${nr % 250}`,
    authorization: `Bearer ${token}`, ...extra }; };
async function hochladen(datei, name = "personal-test.csv") {
  const a = await imp(new Request(`http://${WIRT}/api/import/upload`, { method: "POST",
    headers: kopf({ "content-type": "application/octet-stream", "x-dateiname": encodeURIComponent(name) }), body: datei }), {});
  let d = {}; try { d = await a.json(); } catch { /* leer */ }
  return { status: a.status, ...d };
}
async function schritt(weg, rumpf) {
  const a = await imp(new Request(`http://${WIRT}/api/import/${weg}`, { method: "POST",
    headers: kopf({ "content-type": "application/json" }), body: JSON.stringify(rumpf) }), {});
  let d = {}; try { d = await a.json(); } catch { /* leer */ }
  return { status: a.status, ...d };
}
async function dateienIn(dir) {
  const aus = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) aus.push(...await dateienIn(p)); else aus.push(p);
  }
  return aus;
}

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-imp8-"));
  process.env.CENTRIC_IMPORT_AKTIV = "true";   // Server-Schalter (Vorgabe aus); diese Datei prüft den eingeschalteten Import
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
  const { getStore } = await import("../server/lib/ablage.mjs");
  laden = () => getStore({ name: "centric", consistency: "strong" });
  imp = (await import("../server/funktionen/import.mjs")).default;
  B = await import("../server/lib/bestand.mjs");
  V = await import("../server/lib/import/vorgaenge.mjs");
  ({ sitzungAnlegen } = await import("../server/lib/sitzungen.mjs"));
  const raum = `imp8-${++raumNr}`;
  const leitung = { id: "l1", vorname: "Fiktiv", nachname: "Testleitung", rolle: "leitung", bereich: "ALLE", status: "aktiv", email: "",
    funktion: "Leitung", eintritt: "2020-01-01", wochenstunden: 38.5, urlaubsanspruch: 30, qualifikationen: [],
    zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "ALLE" }] };
  await B.bestandSchreiben(laden(), raum, { version: 9, mandanten: [betrieb([leitung, bestandPerson])] }, { durch: "Prüfung" });
  token = (await sitzungAnlegen({ bestand: raum, name: "Test LT", rolle: "leitung", person: "l1", betrieb: 0, mandantId: "m1", einheit: null },
    2 * 3600 * 1000)).token;
});
afterAll(async () => { if (wurzel) await rm(wurzel, { recursive: true, force: true }); });
afterEach(() => { V._zuruecksetzen(); });

describe("IMP-8 Gültige Dateien und Formate (F01–F06)", { timeout: 120000 }, () => {
  it("F01 [Unit] CSV UTF-8 mit Semikolon: fünf Personen, alle neu, Kommazahl und beide Datumsformen gelesen", async () => {
    const { r, a } = await lesenUndAnalysieren(F.fixture("f01-gueltig.csv"), "f01-gueltig.csv");
    expect(r.format).toBe("csv");
    expect(r.hinweise).toEqual([]);
    expect(a.fehlendePflicht).toEqual([]);
    expect(a.zaehler).toMatchObject({ gesamt: 5, fehlerhaft: 0, dubletten: 0, konflikte: 0 });
    expect(a.datensaetze.map((d) => d.vorgabe)).toEqual(["neu", "neu", "neu", "neu", "neu"]);
    expect(a.datensaetze.map((d) => d.werte.eintritt)).toEqual(["2026-02-01", "2026-03-01", null, "2026-04-15", "2026-05-01"]);
    expect(a.datensaetze.map((d) => d.werte.wochenstunden)).toEqual([38.5, 30, 20, 40, null]);
    expect(a.datensaetze[2].werte.email).toBe("");   // leer bleibt leer, nie erfunden
  });
  it("F01 [HTTP] Upload 201, Format csv, Analyse 200 ohne Fehler", async () => {
    const up = await hochladen(F.fixture("f01-gueltig.csv"), "f01-gueltig.csv");
    expect(up.status, JSON.stringify(up)).toBe(201);
    expect(up.format).toBe("csv");
    const an = await schritt("analyse", { vorgang: up.vorgang });
    expect(an.status).toBe(200);
    expect(an.zaehler).toMatchObject({ gesamt: 5, fehlerhaft: 0 });
  });
  it("F02 [Unit] CSV mit UTF-8-BOM: BOM entfernt, erste Überschrift sauber und zugeordnet", async () => {
    const { r, a } = await lesenUndAnalysieren(F.csvMitBom(), "f02-bom.csv");
    expect(r.blaetter[0].zeilen[0][0]).toBe("Personalnummer");
    expect(a.zuordnung.personalnummer).toBe(0);
    expect(a.zaehler.gesamt).toBe(5);
  });
  it("F03 [Unit] CSV in Windows-1252: Umlaut erhalten, Hinweis ZEICHENSATZ_ERSATZ", async () => {
    const { r, a } = await lesenUndAnalysieren(F.csv1252(), "f03-ansi.csv");
    expect(hat(r, "ZEICHENSATZ_ERSATZ")).toBe(true);
    expect(a.datensaetze[0].werte.nachname).toBe("Müller-Testperson");
  });
  it("F04 [Unit] TSV (Endung .tsv): Tab als Trenner", async () => {
    const { r, a } = await lesenUndAnalysieren(F.fixture("f04-tabs.tsv"), "f04-tabs.tsv");
    expect(r.format).toBe("tsv");
    expect(a.zaehler).toMatchObject({ gesamt: 2, fehlerhaft: 0 });
    expect(a.datensaetze[0].werte.personalnummer).toBe("TP-2001");
  });
  it("F05 [Unit] XLSX: Datumszelle als Rohzahl plus Text, Analyse liefert ISO-Datum und Zahl", async () => {
    const { r, a } = await lesenUndAnalysieren(F.xlsxGueltig(), "f05.xlsx");
    expect(r.format).toBe("xlsx");
    expect(r.blaetter[0].zeilen[1][4]).toMatchObject({ typ: "datum" });
    expect(werteOhne(a).map((w) => [w.eintritt, w.wochenstunden])).toEqual([["2026-02-01", 38.5], ["2026-03-15", 20]]);
    expect(a.zaehler.fehlerhaft).toBe(0);
  });
  it("F05 [HTTP] XLSX-Upload 201, Format xlsx", async () => {
    const up = await hochladen(F.xlsxGueltig(), "f05.xlsx");
    expect(up.status, JSON.stringify(up)).toBe(201);
    expect(up.format).toBe("xlsx");
  });
  it("F06 [Unit] XLS (BIFF): gleiches Ergebnis wie dieselbe Mappe als XLSX", async () => {
    const x = await lesenUndAnalysieren(F.xlsxGueltig(), "f05.xlsx");
    const s = await lesenUndAnalysieren(F.xlsGueltig(), "f06.xls");
    expect(s.r.format).toBe("xls");
    expect(werteOhne(s.a)).toEqual(werteOhne(x.a));
  });
});

describe("IMP-8 Datum (F07–F08)", { timeout: 120000 }, () => {
  it("F07 [Unit] Datumsformen: ISO und TT.MM.JJJJ gültig, leer = null (nie heute), alles andere ungültig", async () => {
    const { a } = await lesenUndAnalysieren(F.fixture("f07-datumsformate.csv"), "f07.csv");
    const d = a.datensaetze;
    expect(d[0].werte.eintritt).toBe("2026-02-01");
    expect(d[1].werte.eintritt).toBe("2026-02-01");   // 1.2.2026
    expect(d[6].werte.eintritt).toBeNull();           // leer
    expect(d[6].fehler).toEqual([]);
    for (const i of [2, 3, 4, 5, 7]) {                // 31.02., 2024-02-30, Monat 13, Text, US-Form
      expect(d[i].fehler, `Zeile ${i + 1}`).toContain("Eintrittsdatum ungültig");
      expect(d[i].werte.eintritt).toBeNull();
      expect(d[i].erlaubt).toEqual(["ueberspringen"]);
      expect(JSON.stringify(d[i].fehler)).not.toMatch(/31\.02|2024-02-30|demnaechst/);   // nennt das Feld, nie den Wert
    }
    expect(a.zaehler.fehlerhaft).toBe(5);
  });
  it("F08 [Unit] 1904-Mappe: Parser normiert auf 1900, Analyse liefert dieselben Kalendertage wie 1900-Mappe", async () => {
    const a1900 = await lesenUndAnalysieren(F.xlsxGueltig(), "f08-1900.xlsx");
    const a1904 = await lesenUndAnalysieren(F.xlsx1904(), "f08-1904.xlsx");
    expect(a1904.r.datumssystem).toBe("1900");
    expect(a1904.r.datumssystemQuelle).toBe("1904");
    expect(hat(a1904.r, "DATUMSSYSTEM_1904")).toBe(true);
    expect(a1900.r.datumssystemQuelle).toBeUndefined();
    expect(werteOhne(a1904.a).map((w) => w.eintritt)).toEqual(["2026-02-01", "2026-03-15"]);   // keine zweite Verschiebung
    expect(werteOhne(a1904.a)).toEqual(werteOhne(a1900.a));
  });
});

describe("IMP-8 Hostile Zellinhalte (F09)", { timeout: 120000 }, () => {
  const PRAEFIX = /^[=+\-@]/;
  it("F09 [Unit] CSV: Zellen mit = + - @ bleiben unverändert Text (nichts wird ausgewertet); Ausgabe-Schutz csvText neutralisiert sie", async () => {
    const { r, a } = await lesenUndAnalysieren(F.fixture("f09-formelzellen.csv"), "f09.csv");
    expect(r.blaetter[0].zeilen.slice(1).every((z) => typeof z[1] === "string" && PRAEFIX.test(z[1]))).toBe(true);
    const nachnamen = werteOhne(a).map((w) => w.nachname);
    expect(nachnamen).toEqual(["=1+1", "+Testperson 32", "-Testperson 33", "@Testperson 34"]);
    expect(a.zaehler.fehlerhaft).toBe(0);
    for (const w of werteOhne(a)) {
      expect(PRAEFIX.test(w.funktion)).toBe(true);
      expect(csvText(w.nachname).startsWith("'")).toBe(true);   // Ausgabeseite (SI-02, src/csvfeld.js)
      expect(csvText(w.funktion).replace(/^"/, "").startsWith("'")).toBe(true);
    }
  });
  it("F09 [Unit] XLSX: Textzellen mit = + - @ bleiben Text; echte Formelzelle liefert nur den gespeicherten Wert, nie den Formeltext", async () => {
    const r = await parseDatei({ buffer: F.xlsxFormelzellen(), name: "f09.xlsx" });
    expect(r.ok, JSON.stringify(r).slice(0, 300)).toBe(true);
    const z = r.blaetter[0].zeilen;
    expect(z[1][1]).toBe("=1+1");
    expect(z[1][3]).toBe("+SUMME(A1:A9)");
    expect(z[2][1]).toBe("-Testperson 92");
    expect(z[2][3]).toBe("@SUMME(1)");
    expect(z[3][3]).toBe(42);                                   // gespeicherter Wert der Formelzelle
    expect(JSON.stringify(r)).not.toContain("HYPERLINK");
  });
  it("F09 [HTTP] Datei mit Formelzellen wird angenommen, Werte unverändert als Text analysiert, Analyse ohne Fehler", async () => {
    const up = await hochladen(F.fixture("f09-formelzellen.csv"), "f09.csv");
    expect(up.status).toBe(201);
    const an = await schritt("analyse", { vorgang: up.vorgang });
    expect(an.status).toBe(200);
    expect(an.datensaetze.map((d) => d.werte.nachname)).toEqual(["=1+1", "+Testperson 32", "-Testperson 33", "@Testperson 34"]);
    expect(an.zaehler.fehlerhaft).toBe(0);
  });
});

describe("IMP-8 Dubletten (F10–F11)", { timeout: 120000 }, () => {
  it("F10 [Unit] Doppelte Personalnummer in der Datei (auch Groß-/Kleinschreibung): alle beteiligten Zeilen klären, keine übernehmbar als neu", async () => {
    const { a } = await lesenUndAnalysieren(F.fixture("f10-doppelte-personalnummer.csv"), "f10.csv");
    const d = a.datensaetze;
    for (const i of [0, 1, 2, 3]) {
      expect(d[i].dublette, `Zeile ${i + 1}`).toMatchObject({ art: "personalnummer-datei" });
      expect(d[i].vorgabe).toBe("klaeren");
      expect(d[i].erlaubt).toEqual(["ueberspringen", "klaeren"]);
    }
    expect(d[4].dublette).toBeNull();
    expect(d[4].vorgabe).toBe("neu");
  });
  it("F10 [HTTP] Dieselbe Datei über den Endpunkt: Vorgabe klären für die doppelten Zeilen", async () => {
    const up = await hochladen(F.fixture("f10-doppelte-personalnummer.csv"), "f10.csv");
    expect(up.status).toBe(201);
    const an = await schritt("analyse", { vorgang: up.vorgang });
    expect(an.datensaetze.map((d) => d.vorgabe)).toEqual(["klaeren", "klaeren", "klaeren", "klaeren", "neu"]);
  });
  it("F11 [Unit] Treffer gegen den Bestand: exakte Nummer = klären (aktualisieren nur mit Bestätigung, nie neu), neue Nummer = neu, nur Name = klären", async () => {
    const { a } = await lesenUndAnalysieren(F.fixture("f11-gegen-bestand.csv"), "f11.csv", betrieb([bestandPerson]));
    const d = a.datensaetze;
    expect(d[0].dublette).toMatchObject({ art: "personalnummer", personId: "b1" });
    expect(d[0].vorgabe).toBe("klaeren");
    expect(d[0].erlaubt).toEqual(["aktualisieren", "ueberspringen", "klaeren"]);
    expect(d[1].dublette).toBeNull();
    expect(d[1].vorgabe).toBe("neu");
    expect(d[2].dublette).toMatchObject({ art: "name", personId: "b1" });   // Name allein: nur Vorschlag
    expect(d[2].vorgabe).toBe("klaeren");
  });
  it("F11 [Unit] Ähnliche Nummer (Trennzeichen, führende Nullen, Schreibweise) gegen den Bestand: möglicher Treffer, klären, nie still neu; in der Datei gegenseitig klären", async () => {
    const { a } = await lesenUndAnalysieren(F.fixture("f11b-aehnliche-nummer.csv"), "f11b.csv", betrieb([bestandPerson]));
    for (const d of a.datensaetze) { expect(d.vorgabe).toBe("klaeren"); expect(d.dublette).not.toBeNull(); }
    const einzeln = await lesenUndAnalysieren(Buffer.from("Personalnummer;Nachname;Vorname;Einheit\nTP-00-01;Testperson 52;Fiktiv;Wohnbereich 1\n"),
      "f11c.csv", betrieb([bestandPerson]));
    expect(einzeln.a.datensaetze[0].dublette).toMatchObject({ art: "personalnummer-aehnlich", personId: "b1" });
    expect(einzeln.a.datensaetze[0].vorgabe).toBe("klaeren");
  });
});

describe("IMP-8 Leer, binär, falsche Kodierung (F12–F13)", { timeout: 120000 }, () => {
  it("F12 [Unit] Leere Datei und reiner Leerraum: Fehler ohne Teilergebnis; nur Kopfzeile: lesbar, aber keine Datensätze", async () => {
    for (const [n, buffer] of [["leer", F.leer()], ["leerraum", F.nurLeerraum()]]) {
      const r = await parseDatei({ buffer, name: "f12.csv" });
      expect(r.ok, n).toBe(false);
      expect(["EINGABE_UNGUELTIG", "LEER"], n).toContain(r.code);
      expect(r.blaetter, n).toBeUndefined();
      expect(r.nachricht).toMatch(/[a-zäöü]{4,}/i);
    }
    const { a } = await lesenUndAnalysieren(F.nurKopf(), "f12-kopf.csv");
    expect(a.datensaetze).toEqual([]);
    expect(a.zaehler.gesamt).toBe(0);
  });
  it("F12 [HTTP] Leere Datei: 422, kein Vorgang angelegt", async () => {
    const r = await hochladen(F.leer(), "f12.csv");
    expect(r.status).toBe(422);
    expect(r.code).toBe("LEER");
    expect(V._anzahl()).toBe(0);
  });
  it("F13 [Unit] PNG, EXE, Zufallsbytes und UTF-16-Text (enthält NUL): UNBEKANNTES_FORMAT, kein Teilergebnis, auch bei Endung .xlsx/.csv", async () => {
    for (const [n, buffer] of [["png", F.png()], ["exe", F.exe()], ["zufall", F.zufall()], ["utf16", F.csvUtf16()]]) {
      for (const name of ["x.xlsx", "x.csv"]) {
        const r = await parseDatei({ buffer, name });
        expect(r.ok, `${n} ${name}`).toBe(false);
        expect(r.code, `${n} ${name}`).toBe("UNBEKANNTES_FORMAT");
        expect(r.blaetter).toBeUndefined();
      }
    }
  });
  it("F13 [HTTP] Binärdatei: 422, verständliche Meldung, kein Stacktrace, kein Vorgang", async () => {
    const r = await hochladen(F.exe(), "x.xlsx");
    expect(r.status).toBe(422);
    expect(r.code).toBe("UNBEKANNTES_FORMAT");
    expect(JSON.stringify(r)).not.toMatch(/at \w+ \(|\.mjs:\d+|Error:/);
    expect(V._anzahl()).toBe(0);
  });
});

describe("IMP-8 Größen- und Grenzfälle (F14–F16)", { timeout: 180000 }, () => {
  it("F14 [Unit] 10 MB + 1 Byte: DATEI_ZU_GROSS ohne Teilergebnis", async () => {
    const r = await parseDatei({ buffer: Buffer.alloc(10 * 1024 * 1024 + 1, 0x41), name: "f14.csv" });
    expect(r).toMatchObject({ ok: false, code: "DATEI_ZU_GROSS" });
    expect(r.blaetter).toBeUndefined();
  });
  it("F14 [HTTP] 10 MB + 1 Byte: 413, kein Vorgang", async () => {
    const r = await hochladen(Buffer.alloc(10 * 1024 * 1024 + 1, 0x41), "f14.csv");
    expect(r.status).toBe(413);
    expect(r.code).toBe("DATEI_ZU_GROSS");
    expect(V._anzahl()).toBe(0);
  });
  it("F15 [Unit] Zeilen: 20.000 ok, 20.001 ZU_VIELE_ZEILEN; Spalten: 200 ok, 201 ZU_VIELE_SPALTEN; Zelle 32.767 Zeichen ok, 32.768 TEXT_ZU_GROSS", async () => {
    expect((await parseDatei({ buffer: F.csvZeilen(20000), name: "z.csv" })).ok).toBe(true);
    expect(await parseDatei({ buffer: F.csvZeilen(20001), name: "z.csv" })).toMatchObject({ ok: false, code: "ZU_VIELE_ZEILEN" });
    expect((await parseDatei({ buffer: F.csvSpalten(200), name: "s.csv" })).ok).toBe(true);
    expect(await parseDatei({ buffer: F.csvSpalten(201), name: "s.csv" })).toMatchObject({ ok: false, code: "ZU_VIELE_SPALTEN" });
    expect((await parseDatei({ buffer: F.csvZelle(32767), name: "c.csv" })).ok).toBe(true);
    expect(await parseDatei({ buffer: F.csvZelle(32768), name: "c.csv" })).toMatchObject({ ok: false, code: "TEXT_ZU_GROSS" });
  });
  it("F15 [HTTP] 20.001 Zeilen und 201 Spalten: 422 mit dem Vertragscode", async () => {
    const z = await hochladen(F.csvZeilen(20001), "z.csv");
    expect([z.status, z.code]).toEqual([422, "ZU_VIELE_ZEILEN"]);
    const s = await hochladen(F.csvSpalten(201), "s.csv");
    expect([s.status, s.code]).toEqual([422, "ZU_VIELE_SPALTEN"]);
    expect(V._anzahl()).toBe(0);
  });
  it("F16 [Unit] ZIP-Bomben: erklärt über 100 MB, Kompressionsverhältnis, lügender Kopf, zu viele Einträge: abgelehnt ohne Teilergebnis, schnell", async () => {
    const t0 = Date.now();
    const gross = await parseDatei({ buffer: F.bombeErklaertGross(), name: "b.xlsx" });
    expect(gross).toMatchObject({ ok: false, code: "ENTPACKT_ZU_GROSS" });
    expect(await parseDatei({ buffer: F.bombeVerhaeltnis(), name: "b.xlsx" })).toMatchObject({ ok: false, code: "KOMPRESSION_VERDAECHTIG" });
    const luege = await parseDatei({ buffer: F.bombeLuegenderKopf(), name: "b.xlsx", grenzen: { entpacktBytes: 5 * 1024 * 1024 } });
    expect(luege.ok).toBe(false);
    expect(["ENTPACKT_ZU_GROSS", "BESCHAEDIGT", "KOMPRESSION_VERDAECHTIG"]).toContain(luege.code);
    expect(await parseDatei({ buffer: F.bombeVieleEintraege(), name: "b.xlsx", grenzen: { archivEintraege: 10 } }))
      .toMatchObject({ ok: false, code: "ENTPACKT_ZU_GROSS" });
    for (const r of [gross, luege]) expect(r.blaetter).toBeUndefined();
    expect(Date.now() - t0).toBeLessThan(20000);
  });
  it("F16 [HTTP] ZIP-Bombe: 422, Server antwortet danach weiter", async () => {
    const r = await hochladen(F.bombeErklaertGross(), "b.xlsx");
    expect([r.status, r.code]).toEqual([422, "ENTPACKT_ZU_GROSS"]);
    expect((await hochladen(F.fixture("f01-gueltig.csv"), "ok.csv")).status).toBe(201);
  });
});

describe("IMP-8 Dateinamen, Spalten, nicht unterstützte Formate (F17–F20)", { timeout: 180000 }, () => {
  const NAMEN = ["../../../etc/passwd", "..\\..\\windows\\boot.ini", "x\u0000.csv", "‮fdp.csv", `${"a".repeat(5000)}.xlsx`,
    "CON.csv", "personal.csv;rm -rf", "daten.<img src=x onerror=alert(1)>", "x.xlsx"];
  it("F17 [Unit] Dateiname steuert nie die Erkennung: derselbe Inhalt gibt bei jedem Namen dasselbe Ergebnis; Hinweise tragen keinen langen Namen", async () => {
    const roh = F.fixture("f01-gueltig.csv");
    const basis = await parseDatei({ buffer: roh, name: "f01.csv" });
    for (const name of NAMEN) {
      const r = await parseDatei({ buffer: roh, name });
      expect(r.ok, name.slice(0, 20)).toBe(true);
      expect(r.format).toBe("csv");
      expect(r.blaetter).toEqual(basis.blaetter);
      const s = JSON.stringify(r.hinweise);
      expect(s).not.toMatch(/passwd|boot\.ini|onerror/);
      expect(s.length).toBeLessThan(2000);
      for (const h of r.hinweise) {   // Vertrag §2: die Endung erscheint höchstens mit 10 Zeichen
        const m = /Dateiendung „([^“]*)“/.exec(h.nachricht);
        if (m) expect(m[1].replace(/^.|…$/g, "").length).toBeLessThanOrEqual(10);
      }
    }
  });
  it("F17 [HTTP] Namenstricks im Kopf x-dateiname: 201, Name wird nicht zurückgegeben, keine Datei dieses Namens im Datenverzeichnis", async () => {
    for (const name of NAMEN) {
      const r = await hochladen(F.fixture("f01-gueltig.csv"), name);
      expect(r.status, name.slice(0, 20)).toBe(201);
      for (const h of r.hinweise || []) {
        const m = /Dateiendung „([^“]*)“/.exec(h.nachricht);
        if (m) expect(m[1].replace(/^.|…$/g, "").length).toBeLessThanOrEqual(10);
      }
      expect(JSON.stringify(r)).not.toMatch(/passwd|boot\.ini|onerror/);
      V._zuruecksetzen();
    }
    const dateien = (await dateienIn(wurzel)).map((p) => p.toLowerCase());
    expect(dateien.some((p) => /passwd|boot\.ini|fdp\.csv|rm -rf|onerror/.test(path.basename(p)))).toBe(false);
    expect(dateien.every((p) => p.startsWith(wurzel.toLowerCase()))).toBe(true);
  });
  it("F18 [Unit] Unbekannte Spalten (Konfession, Geburtsort, …): nicht zugeordnet, nicht gelesen, kein Fehler", async () => {
    const { r, a } = await lesenUndAnalysieren(F.fixture("f18-unbekannte-spalten.csv"), "f18.csv");
    expect(r.blaetter[0].zeilen[0]).toEqual(["Personalnummer", "Nachname", "Vorname", "Einheit", "Konfession", "Geburtsort", "Lieblingsfarbe"]);
    expect(a.spalten.filter((s) => s.feld === null).map((s) => s.kopf)).toEqual(["Konfession", "Geburtsort", "Lieblingsfarbe"]);
    expect(a.zaehler).toMatchObject({ gesamt: 2, fehlerhaft: 0 });
    expect(JSON.stringify(a.datensaetze)).not.toMatch(/Testkonfession|Testort|blau|gruen/);
    expect(a.datensaetze[0].vorgabe).toBe("neu");
  });
  it("F19 [Unit] Pflichtspalte Einheit fehlt: fehlendePflicht, keine Datensätze", async () => {
    const { a } = await lesenUndAnalysieren(F.fixture("f19-pflichtspalte-fehlt.csv"), "f19.csv");
    expect(a.fehlendePflicht).toEqual(["einheit"]);
    expect(a.datensaetze).toEqual([]);
  });
  it("F19 [HTTP] Analyse meldet die fehlende Pflichtspalte, Vorschau 422 PFLICHTSPALTE_FEHLT", async () => {
    const up = await hochladen(F.fixture("f19-pflichtspalte-fehlt.csv"), "f19.csv");
    expect(up.status).toBe(201);
    const an = await schritt("analyse", { vorgang: up.vorgang });
    expect(an.status).toBe(200);
    expect(an.fehlendePflicht).toEqual(["einheit"]);
    const vs = await schritt("vorschau", { vorgang: up.vorgang });
    expect([vs.status, vs.code]).toEqual([422, "PFLICHTSPALTE_FEHLT"]);
  });
  it("F20 [Unit] XLSM, ODS, XLSB: NICHT_UNTERSTUETZT (auch mit Endung .xlsx); verschlüsselte Datei: PASSWORTGESCHUETZT; keine Daten, kein Teilergebnis", async () => {
    for (const [n, buffer, name] of [["xlsm", F.xlsm(), "m.xlsm"], ["xlsm-getarnt", F.xlsm(), "m.xlsx"], ["ods", F.ods(), "o.ods"],
      ["ods-getarnt", F.ods(), "o.xlsx"], ["xlsb", F.xlsb(), "b.xlsb"]]) {
      const r = await parseDatei({ buffer, name });
      expect(r, n).toMatchObject({ ok: false, code: "NICHT_UNTERSTUETZT" });
      expect(r.blaetter, n).toBeUndefined();
      expect(r.nachricht, n).toMatch(/[a-zäöü]{4,}/i);
    }
    expect((await parseDatei({ buffer: F.ods(), name: "o.ods" })).nachricht).toMatch(/bitte als XLSX oder CSV speichern/);
    expect(await parseDatei({ buffer: F.verschluesselt(), name: "p.xlsx" })).toMatchObject({ ok: false, code: "PASSWORTGESCHUETZT" });
  });
  it("F20 [HTTP] ODS: 422 NICHT_UNTERSTUETZT, kein Vorgang", async () => {
    const r = await hochladen(F.ods(), "o.ods");
    expect([r.status, r.code]).toEqual([422, "NICHT_UNTERSTUETZT"]);
    expect(V._anzahl()).toBe(0);
  });
});
