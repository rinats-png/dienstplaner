/* ==========================================================================
   IMP-6 Teil — Schichtmodell-Vorschau in /api/import (art=schichtzyklus), OHNE Schreiben.

   Geprüft wird: Serverschalter aus => 404 für alles; Rollen wie bei den übrigen Wegen (Leitung/Planung ja, andere nein);
   Analyse und Vorschau liefern Modelle, Zykluslänge, Zuordnung zu den Dienstarten des Betriebs, unbekannte Bezeichnungen
   und Konflikte; die Übernahme schreibt für Modelle nichts (Bestand unverändert) und meldet es; feindliche Eingaben
   (Formeln, riesige Zyklen, „krank (Grippe)“) ergeben begrenzte Ausgaben ohne zurückgegebene Bezeichnungen.

   Nur synthetische Daten („Testperson“, example.invalid). Aufruf:
     npx vitest run pruefungen/import-schichtmodell-vorschau-imp6.test.js
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { mappe } from "./import-parser-hilfen.mjs";

const WIRT = "127.0.0.1:3000";
const WEGE = ["upload", "analyse", "vorschau", "uebernahme", "verwerfen"];
let wurzel, laden, imp, B, V, sitzungAnlegen;
let raumNr = 0;
let nr = 0;

const kopf = (token, extra = {}) => {
  nr += 1;
  return { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.61.${Math.floor(nr / 250) % 250}.${nr % 250}`,
    ...(token ? { authorization: `Bearer ${token}` } : {}), ...extra };
};
async function hochladen(token, datei, art = "schichtzyklus") {
  const a = await imp(new Request(`http://${WIRT}/api/import/upload?art=${art}`, { method: "POST",
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

async function neuerRaum() {
  const raum = `imp6v-${++raumNr}`;
  const m1 = betrieb("m1", [person("l1", "leitung", "ALLE"), person("p1", "planer", "ALLE"), person("s1", "subplaner", "m1-e1"),
    person("a1", "mitarbeiter", "m1-e1"), person("br1", "betriebsrat", "ALLE"),
    person("x1", "mitarbeiter", "m1-e1", { vorname: "Testperson", nachname: "Eins", personalnummer: "1001", email: "eins@example.invalid" }),
    person("x2", "mitarbeiter", "m1-e1", { vorname: "Testperson", nachname: "Zwei", personalnummer: "1002" })]);
  await B.bestandSchreiben(laden(), raum, { version: 9, mandanten: [m1] }, { durch: "Prüfung" });
  const t = {};
  const anlegen = async (k, rolle, person, einheit = null) => {
    t[k] = (await sitzungAnlegen({ bestand: raum, name: `Test ${k}`, rolle, person, betrieb: 0, mandantId: "m1", einheit }, 2 * 3600 * 1000)).token;
  };
  await anlegen("LT", "leitung", "l1");
  await anlegen("PL", "planer", "p1");
  await anlegen("SV", "subplaner", "s1", "m1-e1");
  await anlegen("MA", "mitarbeiter", "a1");
  await anlegen("BR", "betriebsrat", "br1");
  return { raum, t };
}
const stand = async (raum) => { const r = await B.bestandLesen(laden(), raum); return { stand: r.stand, json: JSON.stringify(r.bestand) }; };

const MODELLE = [["Modell", "Tag", "Dienst"],
  ["Zweier", 1, "F"], ["Zweier", 2, "-"],
  ["Dreier", 1, "F"], ["Dreier", 2, "S"], ["Dreier", 3, "ZZ"],
  ["Defekt", 1, "F"], ["Defekt", 3, "S"]];
const ZUORD = [["Personalnummer", "Modell", "Beginn", "Versatz"],
  ["1001", "Zweier", "2026-06-01", 0], ["1002", "Dreier", "2026-06-01", 1], ["9999", "Zweier", "2026-06-01", 0], ["1001", "Gibtsnicht", "2026-07-01", 0]];
const DATEI = () => mappe({ Modelle: MODELLE, Zuordnungen: ZUORD });

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-imp6v-"));
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
});
afterAll(async () => { delete process.env.CENTRIC_IMPORT_AKTIV; if (wurzel) await rm(wurzel, { recursive: true, force: true }); });
afterEach(() => { process.env.CENTRIC_IMPORT_AKTIV = "true"; V._zuruecksetzen(); });

describe("IMP-6 Vorschau: Schalter und Rollen", { timeout: 120000 }, () => {
  it("Serverschalter aus: alle Wege 404, auch mit Leitungssitzung", async () => {
    const { t } = await neuerRaum();
    delete process.env.CENTRIC_IMPORT_AKTIV;
    for (const weg of WEGE) {
      const a = await imp(new Request(`http://${WIRT}/api/import/${weg}`, { method: "POST",
        headers: kopf(t.LT, { "content-type": weg === "upload" ? "application/octet-stream" : "application/json" }),
        body: weg === "upload" ? DATEI() : JSON.stringify({ vorgang: "x" }) }), {});
      expect(a.status, weg).toBe(404);
    }
    expect(V._anzahl()).toBe(0);
  });
  it("Leitung und Planung dürfen den Ablauf, die anderen Rollen nicht (403)", async () => {
    const { t } = await neuerRaum();
    for (const k of ["LT", "PL"]) {
      const up = await hochladen(t[k], DATEI());
      expect(up.status, k).toBe(201);
      expect((await schritt(t[k], "analyse", { vorgang: up.vorgang })).status, k).toBe(200);
      expect((await schritt(t[k], "vorschau", { vorgang: up.vorgang })).status, k).toBe(200);
    }
    for (const k of ["SV", "MA", "BR"]) {
      const r = await hochladen(t[k], DATEI());
      expect(r.status, k).toBe(403);
      expect(r.vorgang).toBeUndefined();
    }
  });
});

describe("IMP-6 Vorschau: Analyse und Vorschau", { timeout: 120000 }, () => {
  it("Analyse erkennt beide Blätter, Modelle, Länge, Dienstarten, Konflikte und Zuordnungen", async () => {
    const { t } = await neuerRaum();
    const up = await hochladen(t.LT, DATEI());
    const an = await schritt(t.LT, "analyse", { vorgang: up.vorgang });
    expect(an).toMatchObject({ status: 200, art: "schichtzyklus", unterstuetzt: false, nurVorschau: true, blatt: 0, zuordnungBlatt: 1, zyklenGesamt: 3 });
    expect(an.hinweis).toMatch(/noch nicht übernommen/);
    const [zwei, drei, defekt] = an.zyklen;
    expect(zwei).toMatchObject({ name: "Zweier", laenge: 2, dienste: 1, freieTage: 1, pruefbar: true, konflikte: [] });
    expect(zwei.dienstarten).toEqual([{ kurz: "F", tage: 1 }]);
    expect(drei).toMatchObject({ laenge: 3, pruefbar: false });
    expect(drei.konflikte.map((k) => k.art)).toContain("dienstart-unbekannt");
    expect(defekt.konflikte.map((k) => k.art)).toContain("tag-fehlt");
    /* Unbekanntes Kürzel nur als Index mit Zeilennummer, nie als Text. */
    expect(an.unbekannteBezeichnungen).toEqual([{ index: 1, anzahl: 1, zeilen: [5] }]);
    expect(JSON.stringify(an)).not.toContain("ZZ");
    expect(an.zuordnungen).toMatchObject({ gesamt: 4, personen: 2 });
    expect(an.zuordnungen.konflikte.map((k) => k.art).sort()).toEqual(["modell-mit-konflikt", "modell-unbekannt", "person-unbekannt"]);
    /* Keine Personalnummern oder Namen in der Antwort. */
    const roh = JSON.stringify(an);
    for (const s of ["1001", "1002", "9999", "Testperson", "example.invalid", "Gibtsnicht"]) expect(roh, s).not.toContain(s);
  });
  it("Vorschau liefert dasselbe als Vorschau, nie bereit, ohne Bestätigungscode", async () => {
    const { t } = await neuerRaum();
    const up = await hochladen(t.PL, DATEI());
    expect((await schritt(t.PL, "vorschau", { vorgang: up.vorgang })).status).toBe(409);   // erst Analyse
    await schritt(t.PL, "analyse", { vorgang: up.vorgang });
    const vs = await schritt(t.PL, "vorschau", { vorgang: up.vorgang });
    expect(vs).toMatchObject({ status: 200, art: "schichtzyklus", nurVorschau: true, bereit: false });
    expect(vs.bestaetigung).toBeUndefined();
    expect(vs.vorschau.zeitraum).toBeNull();
    expect(vs.vorschau.zyklen.map((z) => z.laenge)).toEqual([2, 3, 3]);
    expect(vs.vorschau.zuordnungen.gesamt).toBe(4);
  });
  it("ohne Zuordnungsblatt: nur Modelle; ohne Modellspalten: leeres Ergebnis mit fehlender Pflicht", async () => {
    const { t } = await neuerRaum();
    const a = await hochladen(t.LT, mappe({ Modelle: MODELLE }));
    const an = await schritt(t.LT, "analyse", { vorgang: a.vorgang });
    expect(an).toMatchObject({ status: 200, zuordnungen: null, zyklenGesamt: 3 });
    const b = await hochladen(t.LT, mappe({ Blatt: [["Woche", "Mo", "Di"], ["1", "F", "S"]] }));
    const bn = await schritt(t.LT, "analyse", { vorgang: b.vorgang });
    expect(bn).toMatchObject({ status: 200, zyklen: [], zyklenGesamt: 0 });
    expect(bn.fehlendePflicht.length).toBeGreaterThan(0);
  });
  it("ungültiges Blatt und ungültige Spaltenzuordnung werden abgewiesen", async () => {
    const { t } = await neuerRaum();
    const up = await hochladen(t.LT, DATEI());
    expect((await schritt(t.LT, "analyse", { vorgang: up.vorgang, blatt: 7 })).code).toBe("BLATT_UNGUELTIG");
    expect((await schritt(t.LT, "analyse", { vorgang: up.vorgang, zuordnungBlatt: 9 })).code).toBe("BLATT_UNGUELTIG");
    expect((await schritt(t.LT, "analyse", { vorgang: up.vorgang, zuordnung: { modell: 0, tag: 0 } })).code).toBe("ZUORDNUNG_UNGUELTIG");
  });
});

describe("IMP-6 Vorschau: Übernahme schreibt nichts", { timeout: 120000 }, () => {
  it("Übernahme von Modellen: 422 mit Hinweis, Bestand unverändert (auch mit erfundener Bestätigung)", async () => {
    const { raum, t } = await neuerRaum();
    const vorher = await stand(raum);
    const up = await hochladen(t.LT, DATEI());
    await schritt(t.LT, "analyse", { vorgang: up.vorgang });
    await schritt(t.LT, "vorschau", { vorgang: up.vorgang });
    for (const bestaetigung of [undefined, "x", "0".repeat(64)]) {
      const ue = await schritt(t.LT, "uebernahme", { vorgang: up.vorgang, bestaetigung });
      expect(ue).toMatchObject({ status: 422, code: "ART_NICHT_FREIGEGEBEN", schichtmodelleUebernommen: false });
      expect(ue.fehler).toMatch(/Schichtmodelle werden noch nicht übernommen/);
    }
    expect(await stand(raum)).toEqual(vorher);
  });
  it("Personalimport verhält sich unverändert (Person wird übernommen)", async () => {
    const { raum, t } = await neuerRaum();
    const datei = mappe({ Personal: [["Personalnummer", "Nachname", "Vorname", "E-Mail", "Einheit", "Eintritt", "Wochenstunden"],
      ["3001", "Testperson", "Neu", "", "Wohnbereich 1", "2026-02-01", 30]] });
    const up = await hochladen(t.LT, datei, "personal");
    expect(up.status).toBe(201);
    const an = await schritt(t.LT, "analyse", { vorgang: up.vorgang });
    expect(an.status).toBe(200);
    expect(an.zyklen).toBeUndefined();
    const vs = await schritt(t.LT, "vorschau", { vorgang: up.vorgang });
    expect(vs.zaehler.neu).toBe(1);
    const ue = await schritt(t.LT, "uebernahme", { vorgang: up.vorgang, bestaetigung: vs.bestaetigung });
    expect(ue.status, JSON.stringify(ue)).toBe(200);
    const m = (await B.bestandLesen(laden(), raum)).bestand.mandanten[0];
    expect(m.personen.some((p) => p.personalnummer === "3001")).toBe(true);
    expect(m.zyklus).toEqual({ wochen: 1, tage: ["-", "-", "-", "-", "-", "-", "-"] });
  });
});

describe("IMP-6 Vorschau: feindliche Eingaben", { timeout: 120000 }, () => {
  const BEZEICHNUNGEN = ["krank (Grippe)", "Attest Dr. Beispiel", "Reha", "=HYPERLINK(\"http://example.invalid\")", "+cmd|calc", "@SUM(1)", "Burnout-Klinik", "Sonderschicht Testperson"];
  it("Bezeichnungen werden nie zurückgegeben; Abwesenheit nur gezählt, nie zugeordnet", async () => {
    const { raum, t } = await neuerRaum();
    const vorher = await stand(raum);
    const zeilen = [["Modell", "Tag", "Dienst"], ...BEZEICHNUNGEN.map((b, i) => ["krank (Grippe)", i + 1, b])];
    zeilen.push(["=1+1", 1, "F"], ["Muster-A", 1, "F"]);
    const up = await hochladen(t.LT, mappe({ Modelle: zeilen }));
    const an = await schritt(t.LT, "analyse", { vorgang: up.vorgang });
    const vs = await schritt(t.LT, "vorschau", { vorgang: up.vorgang });
    for (const antwort of [an, vs]) {
      const roh = JSON.stringify(antwort);
      for (const s of ["krank", "Grippe", "Attest", "Reha", "HYPERLINK", "cmd", "SUM", "Burnout", "Klinik", "Sonderschicht", "Testperson", "=1+1"])
        expect(roh, s).not.toContain(s);
    }
    /* krank (Grippe), Attest, Reha, Klinik: Abwesenheit, nur gezählt. Formelzellen verwirft der Parser oder sie sind unbekannt. */
    expect(an.abwesenheitsartig.anzahl).toBe(4);
    expect(an.abwesenheitsartig.zeilen).toEqual([1, 2, 3, 7]);
    expect(an.unbekannteBezeichnungen.length).toBeGreaterThanOrEqual(1);
    expect(an.unbekannteBezeichnungen.every((u, i) => u.index === i + 1 && u.anzahl === 1)).toBe(true);
    expect(an.zyklen.map((z) => z.name)).toEqual([null, null, "Muster-A"]);
    expect(await stand(raum)).toEqual(vorher);
  });
  it("riesiger Zyklus (Tag 999999, viele Modelle): 422 ohne Rechnung, keine Teilausgabe", async () => {
    const { t } = await neuerRaum();
    const zeilen = [["Modell", "Tag", "Dienst"], ...Array.from({ length: 500 }, (_, i) => [`M${i}`, 999999, "F"])];
    const up = await hochladen(t.LT, mappe({ Modelle: zeilen }));
    const t0 = Date.now();
    const an = await schritt(t.LT, "analyse", { vorgang: up.vorgang });
    expect(Date.now() - t0).toBeLessThan(5000);
    expect(an).toMatchObject({ status: 422, code: "PRUEFUMFANG_ZU_GROSS" });
    expect(an.zyklen).toBeUndefined();
    const einzeln = await hochladen(t.LT, mappe({ Modelle: [["Modell", "Tag", "Dienst"], ["Lang", 999999, "F"]] }));
    expect((await schritt(t.LT, "analyse", { vorgang: einzeln.vorgang })).code).toBe("PRUEFUMFANG_ZU_GROSS");
  });
  it("sehr viele Modelle und unbekannte Bezeichnungen: Ausgabe bleibt begrenzt", async () => {
    const { t } = await neuerRaum();
    const zeilen = [["Modell", "Tag", "Dienst"], ...Array.from({ length: 3000 }, (_, i) => [`Mod${i}`, 1, `X${i}`])];
    const up = await hochladen(t.LT, mappe({ Modelle: zeilen }));
    const a = await imp(new Request(`http://${WIRT}/api/import/analyse`, { method: "POST",
      headers: kopf(t.LT, { "content-type": "application/json" }), body: JSON.stringify({ vorgang: up.vorgang }) }), {});
    const text = await a.text();
    const an = JSON.parse(text);
    expect(a.status).toBe(200);
    expect(an.zyklenGesamt).toBe(3000);
    expect(an.zyklen.length).toBe(50);
    expect(an.unbekannteBezeichnungen.length).toBe(50);
    expect(text.length).toBeLessThan(120 * 1024);
    expect(text).not.toContain("X2999");
  });
  it("kein Protokolleintrag und keine Zellinhalte im Vorgang nach dem Verwerfen", async () => {
    const { t } = await neuerRaum();
    const up = await hochladen(t.LT, DATEI());
    await schritt(t.LT, "analyse", { vorgang: up.vorgang });
    expect((await schritt(t.LT, "verwerfen", { vorgang: up.vorgang })).status).toBe(200);
    expect(V._roh(up.vorgang)).toBeNull();
  });
});
