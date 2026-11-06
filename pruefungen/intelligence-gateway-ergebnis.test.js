/* ==========================================================================
   INTELLIGENCE-GATEWAY — FINGERPRINT, ERGEBNIS-SPEICHER, DECISION CONTEXT (WP-I14)

   Treffer nur bei identischem Entscheidungskontext, nie über Betriebsgrenzen; jeder Bestandteil
   des Fingerprints wird einzeln als Invalidierung geprüft; nichts Personenbezogenes im Speicher;
   Aufbewahrung (30/90 Tage) mit Vorschau-Modus; Raumlöschung; echte Dateiablage (ablage.mjs).
   ========================================================================== */

import { describe, it, expect, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fingerprintBilden, erzeugeErgebnisSpeicher, FINGERPRINT_TEILE, ergebnisSchluessel, kontextSchluessel, paketHash, kontextAusPaket } from "../server/lib/intelligence/gateway/ergebnis.mjs";
import { erzeugeGateway } from "../server/lib/intelligence/gateway/gateway.mjs";
import { erzeugeAttrappe } from "../server/lib/intelligence/gateway/attrappe.mjs";
import { Limits } from "../server/lib/intelligence/gateway/limits.mjs";
import { erzeugeAudit } from "../server/lib/intelligence/gateway/audit.mjs";
import { sperrlisteBilden } from "../server/lib/intelligence/leckpruefung.mjs";
import { SCHLUESSEL, VERSIONEN, ZR, bestand, sitzung, S, vollQuelle, VERBOTEN_IM_PAKET, fold } from "./intelligence-gateway-fixture.mjs";

const TAG = 86400_000;
const T0 = Date.UTC(2026, 10, 15, 10, 0, 0);

/** Ablage im Speicher mit dem Interface von ablage.mjs (get/setJSON/delete/list). */
function speicherStore() {
  const m = new Map();
  return {
    m, ausfall: false,
    async get(k) { if (this.ausfall) throw new Error("Platte"); return m.has(k) ? structuredClone(m.get(k)) : null; },
    async setJSON(k, v) { if (this.ausfall) throw new Error("Platte"); m.set(k, structuredClone(v)); },
    async delete(k) { if (this.ausfall) throw new Error("Platte"); m.delete(k); },
    async list({ prefix = "" } = {}) { if (this.ausfall) throw new Error("Platte"); return { blobs: [...m.keys()].filter((k) => k.startsWith(prefix)).sort().map((key) => ({ key })), directories: [] }; },
  };
}

const TEILE = { raum: "raum-a", betriebId: "m1", funktion: "F2", paketHash: "a".repeat(64), regelwerk: "r-2026-11|t-2026", engine: "0.0.0", prompt: "p1", schema: "1.0",
  pruefer: "v1", bausteinKatalog: "k1", routerRegistry: "rr1", zeitraum: { von: "2026-11-01", bis: "2026-11-30" }, bezug: null, rolle: "leitung", sprache: "de" };
const SPERR = sperrlisteBilden(bestand().mandanten[0], { raum: "raum-a" });
const ERG = { text: "Aus den Fakten: dienstart.beginn 06:00." };

describe("Fingerprint", () => {
  it("64 Hexzeichen, deterministisch, unabhängig von der Schlüsselreihenfolge", () => {
    const a = fingerprintBilden(TEILE);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(fingerprintBilden({ ...TEILE })).toBe(a);
    expect(fingerprintBilden(Object.fromEntries(Object.entries(TEILE).reverse()))).toBe(a);
    expect(fingerprintBilden({ ...TEILE, zeitraum: { bis: "2026-11-30", von: "2026-11-01" } })).toBe(a);
  });
  it("jeder Bestandteil ändert den Fingerprint (Invalidierung je Bestandteil)", () => {
    const a = fingerprintBilden(TEILE);
    const andere = { raum: "raum-b", betriebId: "m2", funktion: "F3", paketHash: "b".repeat(64), regelwerk: "r-2026-12|t-2026", engine: "0.0.1", prompt: "p2", schema: "1.1",
      pruefer: "v2", bausteinKatalog: "k2", routerRegistry: "rr2", zeitraum: { von: "2026-11-02", bis: "2026-11-30" }, bezug: { datum: "2026-11-03" }, rolle: "planer", sprache: "en" };
    expect(Object.keys(andere).sort()).toEqual([...FINGERPRINT_TEILE].sort());
    for (const k of FINGERPRINT_TEILE) expect(fingerprintBilden({ ...TEILE, [k]: andere[k] }), k).not.toBe(a);
  });
  it("fehlt ein Bestandteil (oder ist leer), gibt es keinen Fingerprint", () => {
    for (const k of FINGERPRINT_TEILE) {
      const t = { ...TEILE }; delete t[k];
      expect(() => fingerprintBilden(t), k).toThrow();
      if (k !== "bezug" && k !== "zeitraum") expect(() => fingerprintBilden({ ...TEILE, [k]: "" }), `${k} leer`).toThrow();
      if (k !== "bezug" && k !== "zeitraum") expect(() => fingerprintBilden({ ...TEILE, [k]: null }), `${k} null`).toThrow();
    }
    expect(() => fingerprintBilden(null)).toThrow();
  });
  it("Review 12: zeitraum darf null sein (wie bezug) — F4/F5/F9 haben keinen Zeitraum — und ändert den Fingerprint", () => {
    const a = fingerprintBilden({ ...TEILE, zeitraum: null });
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(fingerprintBilden(TEILE));
  });
  it("Schlüssel: Raum URL-kodiert — das Präfix eines Raums trifft nie einen anderen (a gegen a:b)", () => {
    const fp = "c".repeat(64);
    expect(ergebnisSchluessel("a", fp).startsWith("ki:erg:a:")).toBe(true);
    expect(ergebnisSchluessel("a:b", fp).startsWith("ki:erg:a:")).toBe(false);
    expect(kontextSchluessel("a:b", "x".repeat(10)).startsWith("ki:ktx:a:")).toBe(false);
  });
});

describe("Ergebnis-Speicher", () => {
  const neu = (o = {}) => { const store = speicherStore(); const uhr = { t: T0 }; return { store, uhr, sp: erzeugeErgebnisSpeicher({ store, jetzt: () => uhr.t, ...o }) }; };
  const fp = fingerprintBilden(TEILE);

  it("schreiben → lesen: gleiche Antwort; Eintrag trägt Raum und Fingerprint; Frist 30 Tage", async () => {
    const { store, sp } = neu();
    expect(await sp.schreiben({ raum: "raum-a", fingerprint: fp, funktion: "F2", ergebnis: ERG, sperrliste: SPERR })).toBe(true);
    expect(await sp.lesen({ raum: "raum-a", fingerprint: fp })).toEqual(ERG);
    const e = store.m.get(ergebnisSchluessel("raum-a", fp));
    expect(e).toMatchObject({ v: 1, art: "erg", raum: "raum-a", fingerprint: fp, funktion: "F2" });
    expect(e.ablauf - e.erzeugt).toBe(30 * TAG);
  });
  it("E1 nie über Betriebsgrenzen: anderer Raum, anderer Fingerprint → kein Treffer; Eintrag eines anderen Raums unter fremdem Schlüssel wird nicht geglaubt", async () => {
    const { store, sp } = neu();
    await sp.schreiben({ raum: "raum-a", fingerprint: fp, funktion: "F2", ergebnis: ERG, sperrliste: SPERR });
    expect(await sp.lesen({ raum: "raum-b", fingerprint: fp })).toBeNull();
    expect(await sp.lesen({ raum: "raum-a", fingerprint: fingerprintBilden({ ...TEILE, prompt: "p2" }) })).toBeNull();
    /* Eintrag von A heimlich unter dem Schlüssel von B abgelegt */
    store.m.set(ergebnisSchluessel("raum-b", fp), store.m.get(ergebnisSchluessel("raum-a", fp)));
    expect(await sp.lesen({ raum: "raum-b", fingerprint: fp })).toBeNull();
  });
  it("E1 abgelaufen, beschädigt, fremde Version, fremde Art, unerlaubte Felder → Fehlschlag", async () => {
    const { store, uhr, sp } = neu();
    await sp.schreiben({ raum: "raum-a", fingerprint: fp, funktion: "F2", ergebnis: ERG, sperrliste: SPERR });
    const k = ergebnisSchluessel("raum-a", fp);
    const gut = store.m.get(k);
    for (const kaputt of [{ ...gut, v: 2 }, { ...gut, art: "ktx" }, { ...gut, ablauf: "bald" }, { ...gut, ergebnis: { plan: {} } }, { ...gut, ergebnis: null }, "text", 5, null,
      { ...gut, fingerprint: "d".repeat(64) }]) {
      store.m.set(k, kaputt);
      expect(await sp.lesen({ raum: "raum-a", fingerprint: fp }), JSON.stringify(kaputt)).toBeNull();
    }
    store.m.set(k, gut);
    expect(await sp.lesen({ raum: "raum-a", fingerprint: fp })).toEqual(ERG);
    uhr.t += 30 * TAG;
    expect(await sp.lesen({ raum: "raum-a", fingerprint: fp })).toBeNull();
  });
  it("E5 Lesefehler = Fehlschlag, Schreibfehler = false, nie eine Ausnahme", async () => {
    const { store, sp } = neu();
    await sp.schreiben({ raum: "raum-a", fingerprint: fp, funktion: "F2", ergebnis: ERG, sperrliste: SPERR });
    store.ausfall = true;
    expect(await sp.lesen({ raum: "raum-a", fingerprint: fp })).toBeNull();
    expect(await sp.schreiben({ raum: "raum-a", fingerprint: fp, funktion: "F2", ergebnis: ERG, sperrliste: SPERR })).toBe(false);
    expect(await sp.kontextSchreiben({ raum: "raum-a", betriebId: "m1", rolle: "leitung", funktion: "F2", fingerprint: fp, paket: { fakten: [] } })).toBeNull();
    await expect(sp.verwerfen({ raum: "raum-a", fingerprint: fp })).resolves.toBeUndefined();
  });
  it("E2 zweite Schranke beim Schreiben: Klarname, Kontakt, Gesundheit, fremde Felder, fehlende Sperrliste → nichts gespeichert", async () => {
    const { store, sp } = neu();
    for (const e of [{ text: "Anna Weberknecht hat Dienst." }, { text: "Anna ist schwanger" }, { text: "anna.weberknecht@example.org" }, { plan: {} }, {}, null, "x",
      { text: "ok", bausteine: [{ id: "Weberknecht" }] }])
      expect(await sp.schreiben({ raum: "raum-a", fingerprint: fp, funktion: "F2", ergebnis: e, sperrliste: SPERR }), JSON.stringify(e)).toBe(false);
    expect(await sp.schreiben({ raum: "raum-a", fingerprint: fp, funktion: "F2", ergebnis: ERG, sperrliste: undefined })).toBe(false);
    expect(await sp.schreiben({ raum: "", fingerprint: fp, funktion: "F2", ergebnis: ERG, sperrliste: SPERR })).toBe(false);
    expect(await sp.schreiben({ raum: "raum-a", fingerprint: "kurz", funktion: "F2", ergebnis: ERG, sperrliste: SPERR })).toBe(false);
    expect(store.m.size).toBe(0);
  });
  it("Fristen: Vorgaben 30/90 Tage; Betreiber darf kürzen, nie verlängern", () => {
    expect(neu().sp.fristen).toEqual({ ergebnisTage: 30, kontextTage: 90 });
    expect(neu({ fristenTage: { ergebnisTage: 7, kontextTage: 14 } }).sp.fristen).toEqual({ ergebnisTage: 7, kontextTage: 14 });
    expect(neu({ fristenTage: { ergebnisTage: 365, kontextTage: 9999 } }).sp.fristen).toEqual({ ergebnisTage: 30, kontextTage: 90 });
    expect(neu({ fristenTage: { ergebnisTage: -1, kontextTage: "x" } }).sp.fristen).toEqual({ ergebnisTage: 30, kontextTage: 90 });
  });
  it("Store ohne get/setJSON/delete/list → Konstruktor wirft", () => {
    expect(() => erzeugeErgebnisSpeicher({ store: { get() {} } })).toThrow();
    expect(() => erzeugeErgebnisSpeicher({})).toThrow();
  });
});

describe("Decision Context", () => {
  const neu = () => { const store = speicherStore(); const uhr = { t: T0 }; let n = 0; return { store, uhr, sp: erzeugeErgebnisSpeicher({ store, jetzt: () => uhr.t, zufallId: () => `ctx-${String(++n).padStart(8, "0")}` }) }; };
  const PAKET = { fakten: [
    { id: "f.0", feld: "ruhezeit.ist", art: "zahl", wert: 660, alias: "P_BCDFGHJK" },
    { id: "f.1", feld: "befund.regel", art: "kennung", wert: "ruhezeitGesetz", alias: "P_BCDFGHJK", regel: { regelId: "ruhezeitGesetz", pruefstatus: "geprueft", fundstelle: "§ 5 ArbZG" } },
  ] };
  it("E3 nur Zahlen, Regelkennungen, Versionen, Stufen, Codes — keine Alias, keine Texte; 90 Tage", async () => {
    const { store, sp } = neu();
    const id = await sp.kontextSchreiben({ raum: "raum-a", betriebId: "m1", rolle: "leitung", funktion: "F2", fingerprint: "e".repeat(64), versionen: { engine: "0.0.0", prompt: "p1" }, stufen: [1, 2], pruefCodes: ["P-02", "x", "Anna"], treffer: false, paket: PAKET });
    expect(id).toBe("ctx-00000001");
    const e = await sp.kontextLesen({ raum: "raum-a", betriebId: "m1", rolle: "leitung", ctxId: id });
    expect(e).toMatchObject({ funktion: "F2", stufen: [1, 2], pruefCodes: ["P-02"], regelIds: ["ruhezeitGesetz"], zahlen: [660], faktenAnzahl: 2, treffer: false });
    expect(e.ablauf - e.erzeugt).toBe(90 * TAG);
    expect(JSON.stringify(store.m.get(kontextSchluessel("raum-a", id)))).not.toMatch(/P_BCDFGHJK|text|Anna/);
    expect(kontextAusPaket(PAKET)).toEqual({ faktenAnzahl: 2, regelIds: ["ruhezeitGesetz"], zahlen: [660] });
  });
  it("fremde Kennung, anderer Raum, abgelaufen, ungültiges Format → null (nicht „verboten“)", async () => {
    const { uhr, sp } = neu();
    const id = await sp.kontextSchreiben({ raum: "raum-a", betriebId: "m1", rolle: "leitung", funktion: "F2", fingerprint: "e".repeat(64), paket: PAKET });
    expect(await sp.kontextLesen({ raum: "raum-b", betriebId: "m1", rolle: "leitung", ctxId: id })).toBeNull();
    for (const x of ["nicht-da-123", "", "../x", null, undefined, 5]) expect(await sp.kontextLesen({ raum: "raum-a", betriebId: "m1", rolle: "leitung", ctxId: x })).toBeNull();
    uhr.t += 90 * TAG;
    expect(await sp.kontextLesen({ raum: "raum-a", betriebId: "m1", rolle: "leitung", ctxId: id })).toBeNull();
  });
});

describe("Aufbewahrung und Löschung", () => {
  const fp = fingerprintBilden(TEILE);
  async function vorbereiten(modus) {
    const store = speicherStore(); const uhr = { t: T0 };
    const sp = erzeugeErgebnisSpeicher({ store, jetzt: () => uhr.t, modus, zufallId: () => "ctx-abcdefgh" });
    await sp.schreiben({ raum: "raum-a", fingerprint: fp, funktion: "F2", ergebnis: ERG, sperrliste: SPERR });
    await sp.kontextSchreiben({ raum: "raum-a", betriebId: "m1", rolle: "leitung", funktion: "F2", fingerprint: fp, paket: { fakten: [] } });
    return { store, uhr, sp };
  }
  it("Vorschau (ausdrücklich gewählt): meldet Fälliges, löscht NICHTS", async () => {
    const { store, uhr, sp } = await vorbereiten("vorschau");
    expect(sp.modus).toBe("vorschau");
    uhr.t += 31 * TAG;
    expect(await sp.aufraeumen()).toEqual({ modus: "vorschau", geprueft: 2, faellig: 1, geloescht: 0, fehler: 0 });
    expect(store.m.size).toBe(2);
    uhr.t += 60 * TAG;
    expect((await sp.aufraeumen()).faellig).toBe(2);
    expect(store.m.size).toBe(2);
  });
  it("an: löscht fällige (30 Tage Ergebnis, 90 Tage Kontext), auch Beschädigtes; aus: tut nichts; ungültiger Modus → an (E7)", async () => {
    const { store, uhr, sp } = await vorbereiten("an");
    uhr.t += 31 * TAG;
    expect((await sp.aufraeumen()).geloescht).toBe(1);
    expect([...store.m.keys()].every((k) => k.startsWith("ki:ktx:"))).toBe(true);
    store.m.set("ki:erg:raum-a:kaputt", { v: 1 });
    uhr.t += 60 * TAG;
    expect((await sp.aufraeumen()).geloescht).toBe(2);
    expect(store.m.size).toBe(0);
    const aus = await vorbereiten("aus");
    aus.uhr.t += 999 * TAG;
    expect(await aus.sp.aufraeumen()).toMatchObject({ modus: "aus", geprueft: 0, geloescht: 0 });
    expect(aus.store.m.size).toBe(2);
    expect((await vorbereiten("kaputt")).sp.modus).toBe("an");
  });
  it("Löschlauf übersteht Speicherfehler (zählt Fehler, wirft nicht)", async () => {
    const { store, uhr, sp } = await vorbereiten("an");
    uhr.t += 100 * TAG;
    store.ausfall = true;
    const b = await sp.aufraeumen();
    expect(b.fehler).toBeGreaterThan(0);
    expect(b.geloescht).toBe(0);
  });
  it("Raumlöschung (Art. 17) entfernt alle ki:*-Einträge dieses Raums und nur dieses Raums", async () => {
    const { store, sp } = await vorbereiten("an");
    await sp.schreiben({ raum: "raum-b", fingerprint: fp, funktion: "F2", ergebnis: ERG, sperrliste: sperrlisteBilden(bestand().mandanten[0], { raum: "raum-b" }) });
    await sp.schreiben({ raum: "raum-a:x", fingerprint: fp, funktion: "F2", ergebnis: ERG, sperrliste: SPERR });
    expect(await sp.raumLoeschen("raum-a")).toBe(2);
    expect([...store.m.keys()].sort()).toEqual([ergebnisSchluessel("raum-a:x", fp), ergebnisSchluessel("raum-b", fp)].sort());
    expect(await sp.raumLoeschen("")).toBe(0);
  });
});

describe("Im Gateway: Treffer statt Anbieteraufruf", () => {
  function bauen(o = {}) {
    const store = o.store || speicherStore();
    const uhr = { t: T0 };
    const sp = erzeugeErgebnisSpeicher({ store, jetzt: () => uhr.t });
    const anbieter = o.anbieter || erzeugeAttrappe({ modus: o.modus || "ok", skript: o.skript });
    const limits = new Limits({ jetzt: () => uhr.t, betriebKontingentIE: 700, gesamtTagesIE: 1000, gesamtHartTagesIE: 2000 });
    const ereignisse = [];
    const gw = erzeugeGateway({ anbieter, ladeBestand: o.ladeBestand || (() => bestand()), aliasSchluessel: () => o.schluessel || SCHLUESSEL, versionen: o.versionen || VERSIONEN, limits,
      audit: erzeugeAudit({ senke: (e) => ereignisse.push(e) }), schalter: { prozess: () => "an", laufzeit: () => "an" }, betriebAktiv: () => true,
      funktionenFreigegeben: ["F2"], faktenquelle: vollQuelle, ergebnisSpeicher: sp,
      kiVersionen: o.kiVersionen || { prompt: "p1", pruefer: "v1", bausteinKatalog: "k1", routerRegistry: "rr1" },
      zeiten: { stufeMs: 250, deadlineMs: 2000, maxWiederholungen: 0, minRestMs: 0 }, schlafen: () => Promise.resolve() });
    return { gw, anbieter, limits, store, sp, ereignisse, uhr };
  }
  const anf = (von = "2026-11-01") => ({ funktion: "F2", eingabe: { zeitraum: { von, bis: ZR.bis } } });

  it("zweiter identischer Vorgang: Treffer, Anbieter nicht erneut, 0 Einheiten, gleiche Antwort, ctxId", async () => {
    const t = bauen();
    const a = await t.gw.ausfuehren(S.leitung, anf());
    const b = await t.gw.ausfuehren(S.leitung, anf());
    expect(a.status).toBe("fertig"); expect(b.status).toBe("fertig");
    expect(t.anbieter.aufrufe.length).toBe(1);
    expect(b.ergebnis).toEqual(a.ergebnis);
    expect(t.limits.stand("raum-a|0").ieMonat).toBe(1);       // nur der erste Vorgang kostete
    expect(a.ctxId).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    expect(b.ctxId).not.toBe(a.ctxId);
    expect(t.ereignisse.find((e) => e.art === "ki.ende" && e.treffer === true)).toBeTruthy();
    const ktx = await t.sp.kontextLesen({ raum: "raum-a", betriebId: "m1", rolle: "leitung", ctxId: b.ctxId });
    expect(ktx).toMatchObject({ treffer: true, funktion: "F2" });
  });
  it("Invalidierung: anderer Zeitraum, geänderte Fakten, andere Prompt-/Prüfer-/Katalog-/Registry-Version, andere Engine, anderer Raum → kein Treffer", async () => {
    const store = speicherStore();
    const basis = bauen({ store });
    await basis.gw.ausfuehren(S.leitung, anf());
    const faelle = [
      ["Zeitraum", bauen({ store }), anf("2026-11-02")],
      ["Prompt", bauen({ store, kiVersionen: { prompt: "p2", pruefer: "v1", bausteinKatalog: "k1", routerRegistry: "rr1" } }), anf()],
      ["Prüfer", bauen({ store, kiVersionen: { prompt: "p1", pruefer: "v2", bausteinKatalog: "k1", routerRegistry: "rr1" } }), anf()],
      ["Baustein-Katalog", bauen({ store, kiVersionen: { prompt: "p1", pruefer: "v1", bausteinKatalog: "k2", routerRegistry: "rr1" } }), anf()],
      ["Router/Registry", bauen({ store, kiVersionen: { prompt: "p1", pruefer: "v1", bausteinKatalog: "k1", routerRegistry: "rr2" } }), anf()],
      ["Engine", bauen({ store, versionen: { ...VERSIONEN, engine: "0.0.1" } }), anf()],
      ["Regelstand", bauen({ store, versionen: { ...VERSIONEN, regelstand: "r-2026-12" } }), anf()],
    ];
    for (const [name, t, a] of faelle) {
      expect((await t.gw.ausfuehren(S.leitung, a)).status, name).toBe("fertig");
      expect(t.anbieter.aufrufe.length, `${name}: Anbieter muss gerufen werden`).toBe(1);
    }
  });
  it("Invalidierung: ändert sich der Bestand (andere Fakten), gibt es keinen Treffer", async () => {
    const store = speicherStore();
    await bauen({ store }).gw.ausfuehren(S.leitung, anfrageAusF2());
    const geaendert = () => { const b = bestand(); b.mandanten[0].dienstarten[0] = { ...b.mandanten[0].dienstarten[0], start: "05:30" }; return b; };
    const t = bauen({ store, ladeBestand: geaendert });
    await t.gw.ausfuehren(S.leitung, anfrageAusF2());
    expect(t.anbieter.aufrufe.length).toBe(1);
    function anfrageAusF2() { return anf(); }
  });
  it("Mandantentrennung: gleiche Fakten in einem anderen Raum → kein Treffer", async () => {
    const store = speicherStore();
    await bauen({ store }).gw.ausfuehren(S.leitung, anf());
    const t = bauen({ store });
    const r = await t.gw.ausfuehren(sitzung("leitung", "l1", { bestand: "raum-b" }), anf());
    expect(r.status).toBe("fertig");
    expect(t.anbieter.aufrufe.length).toBe(1);
  });
  it("andere Rolle, gleiche Fakten (Planung statt Leitung) → eigener Fingerprint", async () => {
    const store = speicherStore();
    await bauen({ store }).gw.ausfuehren(S.leitung, anf());
    const t = bauen({ store });
    await t.gw.ausfuehren(S.planer, anf());
    expect(t.anbieter.aufrufe.length).toBe(1);
  });
  it("anderer Alias-Schlüssel (Rotation) → Alias ändern sich → kein Treffer", async () => {
    const store = speicherStore();
    await bauen({ store }).gw.ausfuehren(S.leitung, anf());
    const t = bauen({ store, schluessel: Buffer.from("1f3a5c7e9b0d2f4a6c8e0b1d3f5a7c9e1b3d5f7a9c0e2b4d6f8a0c1e3b5d7f9a", "hex") });
    await t.gw.ausfuehren(S.leitung, anf());
    expect(t.anbieter.aufrufe.length).toBe(1);
  });
  it("gespeicherter Eintrag wird beim Treffer erneut geprüft: vergiftet (erfundener Alias, Link) → verworfen, Anbieter ruft neu, Eintrag ersetzt", async () => {
    const store = speicherStore();
    const t = bauen({ store });
    await t.gw.ausfuehren(S.leitung, anf());
    const schluessel = [...store.m.keys()].find((k) => k.startsWith("ki:erg:"));
    store.m.set(schluessel, { ...store.m.get(schluessel), ergebnis: { text: "Siehe boese.example/x und P_ZZZZZZZZ" } });
    const u = bauen({ store });
    const r = await u.gw.ausfuehren(S.leitung, anf());
    expect(r.status).toBe("fertig");
    expect(u.anbieter.aufrufe.length).toBe(1);
    expect(JSON.stringify(store.m.get(schluessel))).not.toContain("boese");
  });
  it("Rückfälle und abgelehnte Antworten werden nie gespeichert", async () => {
    for (const modus of ["injektion", "falsche_zahl", "fehler"]) {
      const t = bauen({ modus });
      await t.gw.ausfuehren(S.leitung, anf());
      expect([...t.store.m.keys()].filter((k) => k.startsWith("ki:erg:")), modus).toEqual([]);
      expect([...t.store.m.keys()].filter((k) => k.startsWith("ki:ktx:")), modus).toEqual([]);
    }
  });
  it("E2/E3 im Betrieb: im Speicher stehen weder Klarnamen noch Kontakte noch Roh-Kennungen, kein Alias im Kontext", async () => {
    const t = bauen({ modus: "skript", skript: (nr, ein) => ({ text: `Betroffen ist ${ein.paket.fakten.find((f) => f.alias).alias}.` }) });
    const r = await t.gw.ausfuehren(S.leitung, anf());
    expect(r.status).toBe("fertig");
    const roh = fold(JSON.stringify([...t.store.m.entries()]));
    for (const v of VERBOTEN_IM_PAKET.filter((x) => !["notiz", "grund", "anmerkung", "raum-a"].includes(x))) expect(roh.includes(fold(v)), v).toBe(false);
    const ktx = [...t.store.m.entries()].find(([k]) => k.startsWith("ki:ktx:"))[1];
    expect(JSON.stringify(ktx)).not.toMatch(/[PEOD]_[BCDFGHJKLMNPQRSTVWXZ]{8}/);
    expect(JSON.stringify([...t.store.m.entries()].find(([k]) => k.startsWith("ki:erg:"))[1])).toMatch(/P_[BCDFGHJKLMNPQRSTVWXZ]{8}/);   // Alias-Form
    expect(r.ergebnis.text).toMatch(/\{\{person:/);                                                                                      // Antwort an den Menschen: übersetzt
  });
  it("Speicherausfall bricht den Vorgang nicht: Antwort kommt, nur ohne Treffer", async () => {
    const t = bauen();
    t.store.ausfall = true;
    const r = await t.gw.ausfuehren(S.leitung, anf());
    expect(r.status).toBe("fertig");
    expect(r.ctxId).toBeUndefined();
  });
  it("Speicher ohne Versionsangaben → Gateway lässt sich nicht bauen", () => {
    const store = speicherStore();
    expect(() => erzeugeGateway({ anbieter: erzeugeAttrappe(), ladeBestand: () => bestand(), aliasSchluessel: () => SCHLUESSEL, versionen: VERSIONEN,
      limits: new Limits({ betriebKontingentIE: 1, gesamtTagesIE: 1, gesamtHartTagesIE: 1 }), audit: erzeugeAudit({}), ergebnisSpeicher: erzeugeErgebnisSpeicher({ store }) })).toThrow();
  });
  it("paketHash ist deterministisch und reihenfolgeunabhängig", () => {
    expect(paketHash({ a: 1, b: [1, { c: 2, d: 3 }] })).toBe(paketHash({ b: [1, { d: 3, c: 2 }], a: 1 }));
    expect(paketHash({ a: 1 })).not.toBe(paketHash({ a: 2 }));
  });
});

describe("Echte Dateiablage (server/lib/ablage.mjs)", () => {
  const wurzel = mkdtempSync(path.join(tmpdir(), "centric-ki-"));
  afterAll(() => { rmSync(wurzel, { recursive: true, force: true }); });
  it("Rundweg über getStore(\"centric-ki-lauf\"): schreiben, lesen, Raum löschen, Aufräumen; Schlüssel im Dateinamen kodiert", async () => {
    const alt = process.env.CENTRIC_DATEN;
    process.env.CENTRIC_DATEN = wurzel;
    try {
      const { getStore } = await import("../server/lib/ablage.mjs");
      const store = getStore("centric-ki-lauf");
      const uhr = { t: T0 };
      const sp = erzeugeErgebnisSpeicher({ store, jetzt: () => uhr.t, modus: "an" });
      const fp = fingerprintBilden(TEILE);
      expect(await sp.schreiben({ raum: "raum:a/b", fingerprint: fp, funktion: "F2", ergebnis: ERG, sperrliste: SPERR })).toBe(true);
      expect(await sp.lesen({ raum: "raum:a/b", fingerprint: fp })).toEqual(ERG);
      expect(await sp.lesen({ raum: "raum", fingerprint: fp })).toBeNull();
      const id = await sp.kontextSchreiben({ raum: "raum:a/b", betriebId: "m1", rolle: "leitung", funktion: "F2", fingerprint: fp, paket: { fakten: [] } });
      expect(await sp.kontextLesen({ raum: "raum:a/b", betriebId: "m1", rolle: "leitung", ctxId: id })).toMatchObject({ funktion: "F2" });
      uhr.t += 31 * TAG;
      expect(await sp.aufraeumen()).toMatchObject({ faellig: 1, geloescht: 1 });
      expect(await sp.raumLoeschen("raum:a/b")).toBe(1);
      expect((await store.list({ prefix: "ki:" })).blobs).toEqual([]);
    } finally {
      if (alt === undefined) delete process.env.CENTRIC_DATEN; else process.env.CENTRIC_DATEN = alt;
    }
  });
});
