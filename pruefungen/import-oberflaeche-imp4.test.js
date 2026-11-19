/* ==========================================================================
   IMP-4 — Personalimport: Oberfläche (Vorschau, Dublettenwahl) gegen den Vertrag aus IMP-3

   Läuft ausschließlich gegen das Testdouble pruefungen/hilfen/import-schnittstelle-attrappe.mjs.
   NICHT geprüft (wartet auf IMP-3): der echte Endpunkt /api/import.
   Aufruf: npx vitest run pruefungen/import-oberflaeche-imp4.test.js
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { erzeugeAblauf, aktionenFuer, startEntscheidungen, vorschauAnfrage, unbestaetigteAktualisierungen, dublettenText } from "../src/lib/import-ablauf.js";
import { erzeugeImportSchnittstelle, IMPORT_DATEI_AKTIV, IMPORT_PFADE } from "../src/lib/import-schnittstelle.js";
import { ImportDateiAnsicht } from "../src/ansichten/import-datei.jsx";
import { erzeugeAttrappe, erzeugeFetchAttrappe, standardDatensaetze } from "./hilfen/import-schnittstelle-attrappe.mjs";

const DATEI = { name: "personal.csv" };
const bereit = async (opt) => { const s = erzeugeAttrappe(opt); const a = erzeugeAblauf(s); await a.hochladen(DATEI); return { s, a }; };
const html = (a) => renderToStaticMarkup(h(ImportDateiAnsicht, { z: a.zustand(), a, onClose() {} }));
const quelle = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

describe("Schalter und Schnittstelle", () => {
  it("S1 solange IMP-3 nicht integriert ist, ist der Dateiimport aus", () => {
    expect(IMPORT_DATEI_AKTIV).toBe(false);
  });
  it("S2 ohne Schalter zeigt die Importansicht keinen Dateiweg (Quelltext, gleicher Stand wie vor IMP-4)", () => {
    const q = quelle("../src/ansichten/import.jsx");
    expect(q).toContain("IMPORT_DATEI_AKTIV ? erzeugeImportSchnittstelle() : null");
    expect(q).toContain("{schnittstelle && <Btn");
  });
  it("S3 nur eine Datei kennt /api/import", () => {
    const treffer = ["../src/ansichten/import.jsx", "../src/ansichten/import-datei.jsx", "../src/lib/import-ablauf.js"].filter((p) => quelle(p).includes("/api/import"));
    expect(treffer).toEqual([]);
  });
  it("S4 Upload: Rumpf ist die Datei, octet-stream, Name nur kodiert im Kopf; Analyse/Vorschau/Übernahme als JSON", async () => {
    const { fetchFn, aufrufe } = erzeugeFetchAttrappe({ [IMPORT_PFADE.upload]: { status: 201, body: { vorgang: "v1" } }, [IMPORT_PFADE.analyse]: { body: {} } });
    const s = erzeugeImportSchnittstelle({ fetchFn });
    const datei = { name: "Müller Liste.csv" };
    await s.upload(datei, "personal");
    await s.analyse({ vorgang: "v1", blatt: 0, zuordnung: { nachname: 0 } });
    expect(aufrufe[0].pfad).toBe("/api/import/upload?art=personal");
    expect(aufrufe[0].init.method).toBe("POST");
    expect(aufrufe[0].init.body).toBe(datei);
    expect(aufrufe[0].init.headers["content-type"]).toBe("application/octet-stream");
    expect(aufrufe[0].init.headers["x-dateiname"]).toBe(encodeURIComponent("Müller Liste.csv"));
    expect(aufrufe[1].init.headers["content-type"]).toBe("application/json");
    expect(JSON.parse(aufrufe[1].init.body)).toEqual({ vorgang: "v1", blatt: 0, zuordnung: { nachname: 0 } });
    expect(aufrufe[1].init.credentials).toBe("same-origin");
  });
  it("S5 Fehlerantwort und Netzfehler werden zu { ok:false } ohne Ausnahme", async () => {
    const e1 = erzeugeFetchAttrappe({ [IMPORT_PFADE.uebernahme]: { status: 409, body: { code: "VORSCHAU_VERALTET", fehler: "veraltet" } } });
    const r1 = await erzeugeImportSchnittstelle({ fetchFn: e1.fetchFn }).uebernahme({ vorgang: "v", bestaetigung: "x" });
    expect(r1).toMatchObject({ ok: false, status: 409, code: "VORSCHAU_VERALTET" });
    const e2 = erzeugeFetchAttrappe({ [IMPORT_PFADE.upload]: new Error("aus") });
    expect(await erzeugeImportSchnittstelle({ fetchFn: e2.fetchFn }).upload(DATEI)).toMatchObject({ ok: false, code: "NETZ" });
  });
});

describe("Dublettenregeln in der Oberfläche", () => {
  const [pn, name, neuling, fehler, konflikt] = standardDatensaetze();
  it("D1 Personalnummer-Treffer: aktualisieren/überspringen/klären, nie „neu“", () => {
    expect(aktionenFuer(pn)).toEqual(["aktualisieren", "ueberspringen", "klaeren"]);
    expect(aktionenFuer({ ...pn, erlaubt: ["neu", "aktualisieren", "ueberspringen"] })).not.toContain("neu");
  });
  it("D2 Namenstreffer ohne Nummer: nur Vorschlag, „aktualisieren“ nie wählbar (auch wenn ein Server es anböte)", () => {
    expect(aktionenFuer(name)).toEqual(["neu", "ueberspringen", "klaeren"]);
    expect(aktionenFuer({ ...name, erlaubt: ["neu", "aktualisieren", "ueberspringen", "klaeren"] })).not.toContain("aktualisieren");
    expect(dublettenText(name)).toMatch(/^Vorschlag/);
    expect(dublettenText(name)).toMatch(/nichts zusammengeführt/);
  });
  it("D3 Fehlerhafter Datensatz: nur überspringen; Doppelte Nummer in der Datei: kein „neu“, kein „aktualisieren“", () => {
    expect(aktionenFuer(fehler)).toEqual(["ueberspringen"]);
    const dd = { ...neuling, dublette: { art: "personalnummer-datei", datensatz: 3 }, erlaubt: ["neu", "aktualisieren", "ueberspringen", "klaeren"] };
    expect(aktionenFuer(dd)).toEqual(["ueberspringen", "klaeren"]);
  });
  it("D4 Startwahl ist nie „aktualisieren“, auch wenn der Server es vorgäbe", () => {
    const s = startEntscheidungen([{ ...pn, vorgabe: "aktualisieren" }, name, neuling, fehler]);
    expect(s).toEqual({ 1: "klaeren", 2: "klaeren", 3: "neu", 4: "ueberspringen" });
  });
  it("D5 Bestätigungen gehen nur für Datensätze mit Wahl „aktualisieren“ in die Anfrage", () => {
    const q = vorschauAnfrage({ vorgang: "v", entscheidungen: { 1: "ueberspringen", 2: "aktualisieren" }, bestaetigungen: { 1: true, 2: true, 9: true }, einheitenAnlegen: undefined });
    expect(q.bestaetigungen).toEqual({ 2: true });
    expect(q.einheitenAnlegen).toBe(false);
    expect(unbestaetigteAktualisierungen({ 1: "aktualisieren", 2: "aktualisieren" }, { 2: true })).toEqual([1]);
  });
});

describe("Ablauf gegen das Testdouble", () => {
  it("A1 Upload, Analyse, Startwahl: nichts wird verändert, nichts aktualisiert", async () => {
    const { s, a } = await bereit();
    const z = a.zustand();
    expect(z.schritt).toBe("pruefen");
    expect(z.entscheidungen).toEqual({ 1: "klaeren", 2: "klaeren", 3: "neu", 4: "ueberspringen", 5: "klaeren" });
    expect(Object.values(z.entscheidungen)).not.toContain("aktualisieren");
    expect(s.aufrufe.map((x) => x.name)).toEqual(["upload", "analyse"]);
  });
  it("A2 unzulässige Wahl wird abgelehnt und ändert nichts", async () => {
    const { a } = await bereit();
    expect(a.entscheiden(2, "aktualisieren")).toBe(false);
    expect(a.entscheiden(1, "neu")).toBe(false);
    expect(a.entscheiden(4, "neu")).toBe(false);
    expect(a.entscheiden(99, "neu")).toBe(false);
    expect(a.zustand().entscheidungen[2]).toBe("klaeren");
  });
  it("A3 Aktualisieren ohne ausdrückliche Bestätigung: keine Vorschau, kein Serveraufruf", async () => {
    const { s, a } = await bereit();
    a.entscheiden(1, "aktualisieren");
    const vorher = s.aufrufe.length;
    expect(await a.vorschauErstellen()).toBe(false);
    expect(a.zustand().fehlercode).toBe("AKTUALISIERUNG_OHNE_BESTAETIGUNG");
    expect(s.aufrufe.length).toBe(vorher);
  });
  it("A4 voller Weg: Wahl, Bestätigung, Vorschau mit alt → neu, Häkchen, Übernahme mit dem Code der Vorschau", async () => {
    const { s, a } = await bereit();
    a.entscheiden(1, "aktualisieren");
    a.bestaetigenAktualisierung(1, true);
    a.entscheiden(2, "neu");
    a.entscheiden(5, "ueberspringen");
    expect(await a.vorschauErstellen()).toBe(true);
    const z = a.zustand();
    expect(z.schritt).toBe("vorschau");
    expect(z.vorschau.aktualisieren[0].aenderungen[0]).toEqual({ feld: "vorname", alt: "Gerd", neu: "Gerda" });
    const anfrage = s.aufrufe.find((x) => x.name === "vorschau").arg;
    expect(anfrage.bestaetigungen).toEqual({ 1: true });
    expect(anfrage.entscheidungen[1]).toBe("aktualisieren");
    expect(await a.uebernehmen()).toBe(false);                    // ohne Häkchen nicht
    expect(s.aufrufe.some((x) => x.name === "uebernahme")).toBe(false);
    a.bestaetigtSetzen(true);
    expect(await a.uebernehmen()).toBe(true);
    expect(s.aufrufe.find((x) => x.name === "uebernahme").arg).toEqual({ vorgang: "v1", bestaetigung: s.zustand.code });
    expect(a.zustand().schritt).toBe("fertig");
    expect(a.zustand().ergebnis.neu).toBe(1);
    expect(a.zustand().datensaetze).toEqual([]);                 // keine Personendaten im Zustand nach der Übernahme
  });
  it("A5 jede Änderung nach der Vorschau macht sie ungültig; ohne neue Vorschau keine Übernahme", async () => {
    const { s, a } = await bereit();
    a.entscheiden(5, "ueberspringen");
    await a.vorschauErstellen();
    a.bestaetigtSetzen(true);
    expect(a.entscheiden(2, "neu")).toBe(true);
    expect(a.zustand()).toMatchObject({ schritt: "pruefen", vorschau: null, bestaetigungscode: null, bestaetigt: false });
    expect(await a.uebernehmen()).toBe(false);
    expect(s.aufrufe.some((x) => x.name === "uebernahme")).toBe(false);
  });
  it("A6 „Zurück“ verwirft Vorschau und Bestätigung", async () => {
    const { a } = await bereit();
    a.entscheiden(5, "ueberspringen");
    await a.vorschauErstellen();
    a.bestaetigtSetzen(true);
    expect(a.zurueck()).toBe(true);
    expect(a.zustand()).toMatchObject({ schritt: "pruefen", bestaetigt: false, vorschau: null });
  });
  it("A7 Doppelklick auf „Übernehmen“ sendet genau eine Übernahme", async () => {
    const { s, a } = await bereit();
    a.entscheiden(5, "ueberspringen");
    await a.vorschauErstellen();
    a.bestaetigtSetzen(true);
    const r = await Promise.all([a.uebernehmen(), a.uebernehmen()]);
    expect(r.filter(Boolean)).toHaveLength(1);
    expect(s.aufrufe.filter((x) => x.name === "uebernahme")).toHaveLength(1);
  });
  it("A8 nichts zu übernehmen: nicht bereit, keine Übernahme möglich", async () => {
    const { s, a } = await bereit();
    for (const nr of [1, 2, 3, 5]) a.entscheiden(nr, "ueberspringen");
    await a.vorschauErstellen();
    expect(a.zustand().bereit).toBe(false);
    a.bestaetigtSetzen(true);
    expect(await a.uebernehmen()).toBe(false);
    expect(s.aufrufe.some((x) => x.name === "uebernahme")).toBe(false);
  });
  it("A9 Serverabsagen: Einheit ohne Recht (403) und veraltete Vorschau (409) mit verständlichem Satz", async () => {
    const { a } = await bereit({ rolleDarfEinheitenAnlegen: false });
    a.entscheiden(5, "neu"); a.einheitenAnlegen(true);
    expect(await a.vorschauErstellen()).toBe(false);
    expect(a.zustand().fehler).toMatch(/Leitung/);
    const v = await bereit({ uebernahmeFehler: { ok: false, status: 409, code: "VORSCHAU_VERALTET", fehler: "x" } });
    v.a.entscheiden(5, "ueberspringen"); await v.a.vorschauErstellen(); v.a.bestaetigtSetzen(true);
    expect(await v.a.uebernehmen()).toBe(false);
    expect(v.a.zustand()).toMatchObject({ schritt: "pruefen", bestaetigt: false, bestaetigungscode: null });
    expect(v.a.zustand().fehler).toMatch(/Vorschau neu erstellen/);
  });
  it("A10 Spaltenzuordnung von Hand: Server wird neu befragt, Wahlen werden neu vorbelegt", async () => {
    const { s, a } = await bereit();
    a.entscheiden(2, "neu");
    await a.zuordnen("einheit", "");
    const letzter = s.aufrufe.filter((x) => x.name === "analyse").pop().arg;
    expect(letzter.zuordnung.einheit).toBeUndefined();
    expect(a.zustand().fehlendePflicht).toEqual(["einheit"]);
    expect(a.zustand().entscheidungen[2]).toBe("klaeren");
  });
  it("A11 Abbrechen verwirft den Vorgang beim Server; nach der Übernahme nicht mehr nötig", async () => {
    const { s, a } = await bereit();
    await a.verwerfen();
    expect(s.zustand.verworfen).toBe(true);
    expect(a.zustand().schritt).toBe("wahl");
    const f = await bereit();
    f.a.entscheiden(5, "ueberspringen"); await f.a.vorschauErstellen(); f.a.bestaetigtSetzen(true); await f.a.uebernehmen();
    await f.a.verwerfen();
    expect(f.s.aufrufe.some((x) => x.name === "verwerfen")).toBe(false);
  });
  it("A12 Uploadfehler (Datei zu groß): Satz, kein Vorgang", async () => {
    const s = erzeugeAttrappe(); s.upload = async () => ({ ok: false, status: 413, code: "DATEI_ZU_GROSS", fehler: "zu groß" });
    const a = erzeugeAblauf(s);
    expect(await a.hochladen(DATEI)).toBe(false);
    expect(a.zustand()).toMatchObject({ schritt: "wahl", vorgang: null });
    expect(a.zustand().fehler).toMatch(/10 MB/);
  });
});

describe("Anzeige (statisch gerendert)", () => {
  it("V1 Dateiwahl", async () => {
    const a = erzeugeAblauf(erzeugeAttrappe());
    const t = html(a);
    expect(t).toContain('type="file"');
    expect(t).toContain("nicht gespeichert");
  });
  it("V2 Prüfschritt: Namenstreffer als Vorschlag, kein Aktualisieren in der Auswahl, Pflichtsterne", async () => {
    const { a } = await bereit();
    const t = html(a);
    expect(t).toContain("Vorschlag: Eine Person mit gleichem Vor- und Nachnamen");
    expect(t).toContain("Diese Personalnummer gibt es im Betrieb bereits");
    expect(t).toContain("Vorname fehlt");
    expect(t).toContain("Noch klären");
    expect(t).toContain("Nachname *");
    // Datensatz 2 (Namenstreffer): sein Auswahlfeld bietet kein „aktualisieren“
    const sel2 = t.slice(t.indexOf('aria-label="Wahl für Datensatz 2"'), t.indexOf('aria-label="Wahl für Datensatz 3"'));
    expect(sel2).not.toContain("Bestehende Person aktualisieren");
    const sel1 = t.slice(t.indexOf('aria-label="Wahl für Datensatz 1"'), t.indexOf('aria-label="Wahl für Datensatz 2"'));
    expect(sel1).toContain("Bestehende Person aktualisieren");
    expect(sel1).not.toContain("Als neue Person anlegen");
  });
  it("V3 Bestätigungsfeld erscheint erst bei Wahl „aktualisieren“; Vorschau zeigt alt → neu, Übernehmen gesperrt ohne Häkchen", async () => {
    const { a } = await bereit();
    expect(html(a)).not.toContain("darf mit den Werten aus der Datei aktualisiert werden");
    a.entscheiden(1, "aktualisieren");
    expect(html(a)).toContain("darf mit den Werten aus der Datei aktualisiert werden");
    a.bestaetigenAktualisierung(1, true); a.entscheiden(5, "ueberspringen");
    await a.vorschauErstellen();
    const t = html(a);
    expect(t).toContain("Gerd → Gerda");
    expect(t).toContain("Ich habe die Vorschau geprüft");
    expect(t).toMatch(/<button[^>]*disabled[^>]*>Jetzt übernehmen/);
    a.bestaetigtSetzen(true);
    expect(html(a)).not.toMatch(/<button[^>]*disabled[^>]*>Jetzt übernehmen/);
  });
  it("V4 Ergebnis", async () => {
    const { a } = await bereit();
    a.entscheiden(5, "ueberspringen"); await a.vorschauErstellen(); a.bestaetigtSetzen(true); await a.uebernehmen();
    expect(html(a)).toContain("1 neu angelegt");
  });
});
