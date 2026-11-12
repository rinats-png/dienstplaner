/* ==========================================================================
   IMP-6 Teil — Zwischenspeicher des Schichtmodell-Ergebnisses je Vorgang (nur Arbeitsspeicher).

   Geprüft wird: Analyse und danach Vorschau rechnen genau einmal; geänderte Eingaben (Spaltenzuordnung, Dienstarten, Personen)
   rechnen neu; anderer Raum oder anderer Vorgang trifft nie; Ablauf, Verwerfen und Übernahme entfernen den Eintrag; die
   Grenzen (je Raum 20, gesamt 200) halten; das Ergebnis ist mit und ohne Zwischenspeicher gleich (Differenz); die
   Zeilenobergrenze und die Bremse gelten vor einem Treffer; Schalter aus => 404; die Zeit des Worst-Case-Ablaufs sinkt.

   Nur synthetische Daten. Aufruf:
     npx vitest run pruefungen/import-analyse-cache-imp6.test.js --testTimeout=120000
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { mappe } from "./import-parser-hilfen.mjs";
import * as C from "../server/lib/import/schichtcache.mjs";
import { schichtVorschau, schichtVorschauMitSpeicher } from "../server/lib/import/schichtvorschau.mjs";

const WIRT = "127.0.0.1:3000";
let wurzel, laden, imp, B, V, sitzungAnlegen;
let raumNr = 0, nr = 0;

const kopf = (token, extra = {}) => {
  nr += 1;
  return { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.71.${Math.floor(nr / 250) % 250}.${nr % 250}`,
    ...(token ? { authorization: `Bearer ${token}` } : {}), ...extra };
};
async function hochladen(token, datei) {
  const a = await imp(new Request(`http://${WIRT}/api/import/upload?art=schichtzyklus`, { method: "POST",
    headers: kopf(token, { "content-type": "application/octet-stream", "x-dateiname": encodeURIComponent("modelle.xlsx") }), body: datei }), {});
  let d = {}; try { d = await a.json(); } catch { /* leer */ }
  return { status: a.status, ...d };
}
async function schritt(token, weg, rumpf) {
  const a = await imp(new Request(`http://${WIRT}/api/import/${weg}`, { method: "POST",
    headers: kopf(token, { "content-type": "application/json" }), body: JSON.stringify(rumpf) }), {});
  let d = {}; try { d = await a.json(); } catch { /* leer */ }
  return { status: a.status, ...d };
}

const dienstart = (id, kurz, start, ende) => ({ id, kurz, name: `Dienst ${kurz}`, start, ende, pause: 30 });
const person = (id, rolle, einheit, mehr = {}) => ({ id, vorname: `V${id}`, nachname: `N${id}`, rolle, bereich: einheit, status: "aktiv",
  email: "", funktion: "Fachkraft", eintritt: "2020-01-01", wochenstunden: 38.5, urlaubsanspruch: 30, qualifikationen: [],
  zugehoerigkeit: [{ ab: "2020-01-01", einheitId: einheit }], ...mehr });
const betrieb = (id, personen) => ({ id, name: `Haus ${id}`, status: "aktiv",
  einheiten: [{ id: `${id}-e1`, name: "Wohnbereich 1", versatz: 0 }], standorte: [], zyklus: { wochen: 1, tage: ["-", "-", "-", "-", "-", "-", "-"] },
  dienstarten: [dienstart("F", "F", "06:00", "14:00"), dienstart("S", "S", "14:00", "22:00"), dienstart("N", "N", "22:00", "06:00")],
  qualifikationen: [], einstellungen: { ruhezeit: 11, maxFolge: 6 }, personen,
  abweichungen: {}, abwesenheiten: [], erfassung: {}, einstempeln: {}, anfragen: [], nachrichten: [], bestaetigungen: [] });
const personenListe = () => [person("l1", "leitung", "ALLE"),
  person("x1", "mitarbeiter", "m1-e1", { vorname: "Testperson", nachname: "Eins", personalnummer: "1001" }),
  person("x2", "mitarbeiter", "m1-e1", { vorname: "Testperson", nachname: "Zwei", personalnummer: "1002" })];
async function neuerRaum() {
  const raum = `imp6c-${++raumNr}`;
  await B.bestandSchreiben(laden(), raum, { version: 9, mandanten: [betrieb("m1", personenListe())] }, { durch: "Prüfung" });
  const token = (await sitzungAnlegen({ bestand: raum, name: "Test LT", rolle: "leitung", person: "l1", betrieb: 0, mandantId: "m1", einheit: null }, 2 * 3600 * 1000)).token;
  return { raum, token };
}
async function bestandSetzen(raum, aendern) {
  const r = await B.bestandLesen(laden(), raum);
  const b = JSON.parse(JSON.stringify(r.bestand));
  aendern(b.mandanten[0]);
  await B.bestandSchreiben(laden(), raum, b, { durch: "Prüfung" });
}

const MODELLE = [["Modell", "Tag", "Dienst"], ["Zweier", 1, "F"], ["Zweier", 2, "-"], ["Dreier", 1, "F"], ["Dreier", 2, "S"], ["Dreier", 3, "ZZ"]];
const ZUORD = [["Personalnummer", "Modell", "Beginn", "Versatz"], ["1001", "Zweier", "2026-06-01", 0], ["1002", "Dreier", "2026-06-01", 1], ["9999", "Zweier", "2026-06-01", 0]];
const DATEI = () => mappe({ Modelle: MODELLE, Zuordnungen: ZUORD });

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-imp6c-"));
  process.env.CENTRIC_IMPORT_AKTIV = "true";
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
  const { getStore } = await import("../server/lib/ablage.mjs");
  laden = () => getStore({ name: "centric", consistency: "strong" });
  imp = (await import("../server/funktionen/import.mjs")).default;
  B = await import("../server/lib/bestand.mjs");
  V = await import("../server/lib/import/vorgaenge.mjs");
  ({ sitzungAnlegen } = await import("../server/lib/sitzungen.mjs"));
});
afterAll(async () => { delete process.env.CENTRIC_IMPORT_AKTIV; if (wurzel) await rm(wurzel, { recursive: true, force: true }); });
afterEach(() => { process.env.CENTRIC_IMPORT_AKTIV = "true"; V._zuruecksetzen(); });

describe("IMP-6 Zwischenspeicher: Ablauf über die Schnittstelle", { timeout: 120000 }, () => {
  it("Analyse, dann Vorschau: es wird genau einmal gerechnet; weitere Vorschauen treffen ebenfalls", async () => {
    const { token } = await neuerRaum();
    const up = await hochladen(token, DATEI());
    expect(up.status).toBe(201);
    const a = await schritt(token, "analyse", { vorgang: up.vorgang });
    expect(a.status).toBe(200);
    expect(C._zaehler.berechnungen).toBe(1);
    const v1 = await schritt(token, "vorschau", { vorgang: up.vorgang });
    const v2 = await schritt(token, "vorschau", { vorgang: up.vorgang });
    expect(v1.status).toBe(200); expect(v2.status).toBe(200);
    expect(C._zaehler.berechnungen).toBe(1);
    expect(C._zaehler.treffer).toBe(2);
    expect(v1.vorschau.zyklenGesamt).toBe(2);
  });

  it("geänderte Spaltenzuordnung (neue Analyse) rechnet neu; unveränderte Wiederholung nicht", async () => {
    const { token } = await neuerRaum();
    const up = await hochladen(token, DATEI());
    await schritt(token, "analyse", { vorgang: up.vorgang });
    await schritt(token, "analyse", { vorgang: up.vorgang });
    expect(C._zaehler.berechnungen).toBe(1);
    const z = await schritt(token, "analyse", { vorgang: up.vorgang, zuordnung: { modell: 0, tag: 1, dienst: 2 } });
    expect(z.status).toBe(200);
    expect(C._zaehler.berechnungen).toBe(2);
    await schritt(token, "vorschau", { vorgang: up.vorgang });
    expect(C._zaehler.berechnungen).toBe(2);
    const z2 = await schritt(token, "analyse", { vorgang: up.vorgang, zuordnung: { modell: 0, tag: 2, dienst: 1 } });
    expect(z2.status).toBe(200);
    expect(C._zaehler.berechnungen).toBe(3);
  });

  it("geänderte Dienstarten oder Personen des Betriebs zwischen Analyse und Vorschau rechnen neu", async () => {
    const { raum, token } = await neuerRaum();
    const up = await hochladen(token, DATEI());
    const a = await schritt(token, "analyse", { vorgang: up.vorgang });
    expect(a.zyklen.find((z) => z.nr === 2).konflikte.map((k) => k.art)).toContain("dienstart-unbekannt");
    await bestandSetzen(raum, (m) => { m.dienstarten.push(dienstart("ZZ", "ZZ", "09:00", "17:00")); });
    const v1 = await schritt(token, "vorschau", { vorgang: up.vorgang });
    expect(C._zaehler.berechnungen).toBe(2);
    expect(v1.vorschau.zyklen.find((z) => z.nr === 2).konflikte.map((k) => k.art)).not.toContain("dienstart-unbekannt");
    await bestandSetzen(raum, (m) => { m.personen = m.personen.filter((p) => p.id !== "x2"); });
    const v2 = await schritt(token, "vorschau", { vorgang: up.vorgang });
    expect(C._zaehler.berechnungen).toBe(3);
    expect(v2.vorschau.zuordnungen.gesamt).toBe(3);
    await schritt(token, "vorschau", { vorgang: up.vorgang });
    expect(C._zaehler.berechnungen).toBe(3);
  });

  it("anderer Raum und anderer Vorgang treffen nie auf fremde Einträge (gleicher Inhalt, eigene Rechnung)", async () => {
    const r1 = await neuerRaum(), r2 = await neuerRaum();
    const u1 = await hochladen(r1.token, DATEI()), u1b = await hochladen(r1.token, DATEI()), u2 = await hochladen(r2.token, DATEI());
    await schritt(r1.token, "analyse", { vorgang: u1.vorgang });
    expect(C._zaehler.berechnungen).toBe(1);
    await schritt(r1.token, "analyse", { vorgang: u1b.vorgang });
    await schritt(r2.token, "analyse", { vorgang: u2.vorgang });
    expect(C._zaehler.berechnungen).toBe(3);
    expect(C._cacheAnzahl()).toBe(3);
    const fremd = await schritt(r2.token, "vorschau", { vorgang: u1.vorgang });
    expect(fremd.status).toBe(404);
    expect(C._zaehler.treffer).toBe(0);
    expect(C.schichtErgebnisHolen("anderer-raum", u1.vorgang, "x")).toBeNull();
    expect(C.schichtErgebnisHolen(r1.raum, u1.vorgang, "falscher-hash")).toBeNull();
    expect(C.schichtErgebnisHolen(r1.raum, "0".repeat(32), "x")).toBeNull();
  });

  it("Verwerfen entfernt den Eintrag zusammen mit dem Vorgang", async () => {
    const { token } = await neuerRaum();
    const up = await hochladen(token, DATEI());
    await schritt(token, "analyse", { vorgang: up.vorgang });
    expect(C._cacheAnzahl()).toBe(1);
    expect((await schritt(token, "verwerfen", { vorgang: up.vorgang })).status).toBe(200);
    expect(C._cacheAnzahl()).toBe(0);
  });

  it("Ablauf der Inaktivitätsfrist (30 Minuten) entfernt den Eintrag mit dem Vorgang", async () => {
    const { token } = await neuerRaum();
    const up = await hochladen(token, DATEI());
    await schritt(token, "analyse", { vorgang: up.vorgang });
    expect(C._cacheAnzahl()).toBe(1);
    V.aufraeumen(Date.now() + 29 * 60 * 1000);
    expect(C._cacheAnzahl()).toBe(1);
    V.aufraeumen(Date.now() + 31 * 60 * 1000);
    expect(V._roh(up.vorgang)).toBeNull();
    expect(C._cacheAnzahl()).toBe(0);
  });

  it("Übernahme (alsUebernommen) entfernt den Eintrag", async () => {
    const { token } = await neuerRaum();
    const up = await hochladen(token, DATEI());
    await schritt(token, "analyse", { vorgang: up.vorgang });
    expect(C._cacheAnzahl()).toBe(1);
    V.alsUebernommen(V._roh(up.vorgang), { zaehler: {}, zeit: "t" });
    expect(C._cacheAnzahl()).toBe(0);
  });

  it("Differenz: Ergebnis mit und ohne Zwischenspeicher ist gleich, und gleich der Analyse", async () => {
    const { token } = await neuerRaum();
    const up = await hochladen(token, DATEI());
    const a = await schritt(token, "analyse", { vorgang: up.vorgang });
    const mit = await schritt(token, "vorschau", { vorgang: up.vorgang });
    expect(C._zaehler.treffer).toBe(1);
    C._cacheZuruecksetzen();
    const ohne = await schritt(token, "vorschau", { vorgang: up.vorgang });
    expect(C._zaehler.berechnungen).toBe(1);
    expect(JSON.stringify(mit)).toBe(JSON.stringify(ohne));
    const { art: _a, unterstuetzt: _u, nurVorschau: _n, hinweis: _h, blatt: _b, zuordnungBlatt: _z, ...analyseErgebnis } = a;
    const { zeitraum: _zr, ...vorschauErgebnis } = mit.vorschau;
    delete analyseErgebnis.status;
    expect(JSON.stringify(analyseErgebnis)).toBe(JSON.stringify(vorschauErgebnis));
  });

  it("Schalter aus: alle Wege 404, kein Treffer", async () => {
    const { token } = await neuerRaum();
    const up = await hochladen(token, DATEI());
    await schritt(token, "analyse", { vorgang: up.vorgang });
    delete process.env.CENTRIC_IMPORT_AKTIV;
    for (const w of ["upload", "analyse", "vorschau", "uebernahme", "verwerfen"]) expect((await schritt(token, w, { vorgang: up.vorgang })).status).toBe(404);
    expect(C._zaehler.treffer).toBe(0);
  });
});

describe("IMP-6 Zwischenspeicher: Grenzen und Schutz", () => {
  const ERG = { ok: true, zyklen: [], zyklenGesamt: 0 };
  it("höchstens 20 Einträge je Raum und 200 gesamt; der älteste fliegt zuerst", () => {
    C._cacheZuruecksetzen();
    for (let i = 0; i < 25; i++) C.schichtErgebnisMerken("raum-a", `id-${i}`, "h", ERG);
    expect(C._cacheAnzahlRaum("raum-a")).toBe(20);
    expect(C.schichtErgebnisHolen("raum-a", "id-0", "h")).toBeNull();
    expect(C.schichtErgebnisHolen("raum-a", "id-4", "h")).toBeNull();
    expect(C.schichtErgebnisHolen("raum-a", "id-5", "h")).not.toBeNull();
    expect(C.schichtErgebnisHolen("raum-a", "id-24", "h")).not.toBeNull();
    C._cacheZuruecksetzen();
    for (let i = 0; i < 230; i++) C.schichtErgebnisMerken(`raum-${i % 15}`, `id-${i}`, "h", ERG);
    expect(C._cacheAnzahl()).toBeLessThanOrEqual(200);
    expect(C.schichtErgebnisHolen("raum-0", "id-0", "h")).toBeNull();
    expect(C.schichtErgebnisHolen("raum-4", "id-229", "h")).not.toBeNull();
    C._cacheZuruecksetzen();
  });
  it("je Vorgang nur ein Eintrag: ein neuer Hash ersetzt den alten", () => {
    C._cacheZuruecksetzen();
    C.schichtErgebnisMerken("r", "v", "h1", ERG); C.schichtErgebnisMerken("r", "v", "h2", ERG);
    expect(C._cacheAnzahl()).toBe(1);
    expect(C.schichtErgebnisHolen("r", "v", "h1")).toBeNull();
    expect(C.schichtErgebnisHolen("r", "v", "h2")).not.toBeNull();
    C._cacheZuruecksetzen();
  });
  it("Lebensdauer 30 Minuten: danach kein Treffer", () => {
    C._cacheZuruecksetzen();
    const t = 1_000_000;
    C.schichtErgebnisMerken("r", "v", "h", ERG, t);
    expect(C.schichtErgebnisHolen("r", "v", "h", t + 29 * 60 * 1000)).not.toBeNull();
    expect(C.schichtErgebnisHolen("r", "v", "h", t + 30 * 60 * 1000)).toBeNull();
    expect(C._cacheAnzahl()).toBe(0);
  });
  it("Ergebnis wird kopiert: Änderungen am Rückgabewert verändern den Speicher nicht", () => {
    C._cacheZuruecksetzen();
    const mein = { ok: true, zyklen: [{ nr: 1 }] };
    C.schichtErgebnisMerken("r", "v", "h", mein);
    mein.zyklen.push({ nr: 2 });
    const a = C.schichtErgebnisHolen("r", "v", "h"); a.zyklen.length = 0;
    expect(C.schichtErgebnisHolen("r", "v", "h").zyklen).toEqual([{ nr: 1 }]);
    C._cacheZuruecksetzen();
  });
  it("Zeilenobergrenze gilt VOR dem Hash und VOR jedem Treffer; Fehler werden nicht gehalten; Wiederholung rechnet nicht neu", () => {
    C._cacheZuruecksetzen();
    let n = 0;
    const rechne = (e) => { n += 1; return schichtVorschau(e); };
    const mandant = betrieb("m1", personenListe());
    const zu = [["Modell", "Tag", "Dienst"], ...Array.from({ length: 10001 }, (_, i) => ["M", i + 1, "F"])];
    const r = schichtVorschauMitSpeicher({ raum: "r", vorgang: "v" }, { mandant, modellZeilen: zu, zuordnungZeilen: null }, rechne);
    expect(r.ok).toBe(false); expect(r.code).toBe("PRUEFUMFANG_ZU_GROSS");
    expect(C._cacheAnzahl()).toBe(0);
    const klein = [["Modell", "Tag", "Dienst"], ["A", 1, "F"]];
    const r2 = schichtVorschauMitSpeicher({ raum: "r", vorgang: "v2" }, { mandant, modellZeilen: klein, zuordnungZeilen: zu }, rechne);
    expect(r2.ok).toBe(false);
    expect(C._cacheAnzahl()).toBe(0);
    const e = { mandant, modellZeilen: klein, zuordnungZeilen: null };
    n = 0;
    schichtVorschauMitSpeicher({ raum: "r", vorgang: "v3" }, e, rechne);
    schichtVorschauMitSpeicher({ raum: "r", vorgang: "v3" }, e, rechne);
    expect(n).toBe(1);
    C._cacheZuruecksetzen();
  });
  it("Bremse: ein Treffer umgeht sie nicht (im Handler steht die Bremse vor dem Speicher)", async () => {
    const q = await readFile(new URL("../server/funktionen/import.mjs", import.meta.url), "utf8");
    for (const marke of ["schritt === \"analyse\"", "schritt === \"vorschau\""]) {
      const von = q.indexOf(marke);
      const stueck = q.slice(von, q.indexOf("schichtVorschauMitSpeicher(", von));
      expect(stueck).toMatch(/await bremse\("schreiben", k\)/);
    }
  });
});

describe("IMP-6 Zwischenspeicher: Worst-Case an der Grenze (10.000 Zeilen)", { timeout: 300000 }, () => {
  it("Analyse und Vorschau mit 10.000 Modell- und 10.000 Zuordnungszeilen: Vorschau aus dem Speicher ist deutlich schneller", async () => {
    const modelle = [["Modell", "Tag", "Dienst"]];
    for (let m = 0; m < 100; m++) for (let t = 1; t <= 100; t++) modelle.push([`Modell ${m}`, t, ["F", "S", "N", "-", "XX"][(m + t) % 5]]);
    const zuord = [["Personalnummer", "Modell", "Beginn", "Versatz"]];
    for (let i = 0; i < 10000; i++) zuord.push([String(1000 + (i % 3)), `Modell ${i % 100}`, "2026-06-01", i % 7]);
    const { token } = await neuerRaum();
    const up = await hochladen(token, mappe({ Modelle: modelle, Zuordnungen: zuord }));
    expect(up.status).toBe(201);
    const zeit = async (weg) => { const t0 = performance.now(); const r = await schritt(token, weg, { vorgang: up.vorgang }); return { ms: performance.now() - t0, r }; };
    const a = await zeit("analyse");
    expect(a.r.status).toBe(200);
    const mit = await zeit("vorschau");
    expect(C._zaehler.berechnungen).toBe(1);
    C._cacheZuruecksetzen();
    const ohne = await zeit("vorschau");
    expect(C._zaehler.berechnungen).toBe(1);
    process.stderr.write(`IMP-6 Worst-Case: Analyse ${a.ms.toFixed(0)} ms, Vorschau mit Speicher ${mit.ms.toFixed(0)} ms, Vorschau ohne Speicher ${ohne.ms.toFixed(0)} ms; Ablauf ohne Speicher ${(a.ms + ohne.ms).toFixed(0)} ms, mit Speicher ${(a.ms + mit.ms).toFixed(0)} ms
`);
    expect(JSON.stringify(mit.r.vorschau)).toBe(JSON.stringify(ohne.r.vorschau));
    expect(mit.ms).toBeLessThan(ohne.ms * 0.8);
  });
});
