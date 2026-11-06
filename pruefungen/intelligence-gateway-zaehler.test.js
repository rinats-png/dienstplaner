/* ==========================================================================
   INTELLIGENCE-GATEWAY — PERSISTENZ DER ZÄHLER, ALARME (WP-I15, Rest)

   Append-only Ereignisse + Rollup über das Ablage-Interface, race-sicher unter der Raumsperre
   (raumsperre.mjs), idempotent nach Absturz, Neustart lädt den Stand; fail closed für Nicht-A;
   Alarme als reine Funktion.
   ========================================================================== */

import { describe, it, expect, afterAll, vi } from "vitest";

// Dateiablage mit fsync: unter Last (viele Prüfdateien parallel) braucht das Zeit.
vi.setConfig({ testTimeout: 30000 });
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { erzeugeZaehlerSpeicher, ROLLUP_SCHLUESSEL, SPERR_RAUM } from "../server/lib/intelligence/gateway/zaehlerspeicher.mjs";
import { alarmeBerechnen } from "../server/lib/intelligence/gateway/alarme.mjs";
import { Limits } from "../server/lib/intelligence/gateway/limits.mjs";
import { erzeugeGateway } from "../server/lib/intelligence/gateway/gateway.mjs";
import { erzeugeAttrappe } from "../server/lib/intelligence/gateway/attrappe.mjs";
import { erzeugeAudit } from "../server/lib/intelligence/gateway/audit.mjs";
import { unterRaumsperre } from "../server/lib/raumsperre.mjs";
import { SCHLUESSEL, VERSIONEN, ZR, bestand, S, vollQuelle } from "./intelligence-gateway-fixture.mjs";

const T0 = Date.UTC(2026, 10, 15, 10, 0, 0);
const B = "0123456789abcdef";
const ev = (o = {}) => ({ t: T0, b: B, tag: "2026-11-15", monat: "2026-11", ie: 1, ...o });

function speicherStore() {
  const m = new Map();
  return {
    m, ausfall: false, loeschenAusfall: false, zaehlerSchreiben: 0,
    async get(k) { if (this.ausfall) throw new Error("Platte"); return m.has(k) ? structuredClone(m.get(k)) : null; },
    async setJSON(k, v) { if (this.ausfall) throw new Error("Platte"); this.zaehlerSchreiben++; m.set(k, structuredClone(v)); },
    async delete(k) { if (this.ausfall || this.loeschenAusfall) throw new Error("Platte"); m.delete(k); },
    async list({ prefix = "" } = {}) { if (this.ausfall) throw new Error("Platte"); return { blobs: [...m.keys()].filter((k) => k.startsWith(prefix)).sort().map((key) => ({ key })), directories: [] }; },
  };
}
const ohneSperre = (raum, arbeit) => Promise.resolve().then(arbeit);

describe("Zähler-Speicher: append-only + Rollup", () => {
  it("Z1 jedes Ereignis ist ein eigener Schlüssel (nie überschrieben), ohne Person und Raum im Klartext", async () => {
    const store = speicherStore();
    const z = erzeugeZaehlerSpeicher({ store, unterSperre: ohneSperre });
    await Promise.all([z.senke(ev()), z.senke(ev()), z.senke(ev())]);
    const keys = [...store.m.keys()];
    expect(keys.length).toBe(3);
    expect(new Set(keys).size).toBe(3);
    expect(keys.every((k) => k.startsWith("ki:zaehler:ev:2026-11-15:"))).toBe(true);
    expect(Object.keys(store.m.get(keys[0])).sort()).toEqual(["b", "ie", "monat", "t", "tag", "v"]);
  });
  it("ungültige Ereignisse werden abgelehnt (Hash, Tag, Monat, Größe, Typ)", async () => {
    const z = erzeugeZaehlerSpeicher({ store: speicherStore(), unterSperre: ohneSperre });
    for (const schlecht of [ev({ b: "Anna Weberknecht" }), ev({ tag: "morgen" }), ev({ monat: "2026-12" }), ev({ ie: 1.5 }), ev({ ie: 99999 }), ev({ t: NaN }), ev({ ie: "1" })])
      await expect(z.senke(schlecht), JSON.stringify(schlecht)).rejects.toThrow();
  });
  it("Zusammenfassen summiert, löscht die Ereignisse, ist wiederholbar (Idempotenz)", async () => {
    const store = speicherStore();
    const z = erzeugeZaehlerSpeicher({ store, unterSperre: ohneSperre });
    await z.senke(ev({ ie: 3, t: T0 })); await z.senke(ev({ ie: 7, t: T0 + 1 })); await z.senke(ev({ ie: -3, t: T0 + 2 }));
    const r = await z.zusammenfassen();
    expect(r.betriebe[B]).toMatchObject({ monat: "2026-11", tag: "2026-11-15", ieMonat: 7, ieTag: 7 });
    expect(r.gesamt).toEqual({ tag: "2026-11-15", ie: 7 });
    expect([...store.m.keys()]).toEqual([ROLLUP_SCHLUESSEL]);
    const r2 = await z.zusammenfassen();
    expect(r2.betriebe[B].ieMonat).toBe(7);
  });
  it("Z2 Absturz zwischen Rollup-Schreiben und Löschen: nichts wird doppelt gezählt", async () => {
    const store = speicherStore();
    const z = erzeugeZaehlerSpeicher({ store, unterSperre: ohneSperre });
    await z.senke(ev({ ie: 3 })); await z.senke(ev({ ie: 4, t: T0 + 1 }));
    store.loeschenAusfall = true;                                   // Rollup geschrieben, Ereignisse bleiben liegen
    await z.zusammenfassen();
    expect([...store.m.keys()].filter((k) => k.includes(":ev:")).length).toBe(2);
    await z.zusammenfassen();                                        // noch einmal, Löschen schlägt weiter fehl
    expect((await z.zusammenfassen()).betriebe[B].ieMonat).toBe(7);
    store.loeschenAusfall = false;
    await z.senke(ev({ ie: 1, t: T0 + 2 }));
    expect((await z.zusammenfassen()).betriebe[B].ieMonat).toBe(8);
    expect([...store.m.keys()]).toEqual([ROLLUP_SCHLUESSEL]);
  });
  it("Monats- und Tageswechsel: neuer Monat/Tag setzt den jeweiligen Zähler zurück; verspätete alte Ereignisse zählen nicht in den neuen", async () => {
    const z = erzeugeZaehlerSpeicher({ store: speicherStore(), unterSperre: ohneSperre });
    await z.senke(ev({ ie: 5 }));
    await z.senke(ev({ ie: 2, tag: "2026-11-16", t: T0 + 1 }));
    await z.senke(ev({ ie: 1, tag: "2026-12-01", monat: "2026-12", t: T0 + 2 }));
    await z.senke(ev({ ie: 9, tag: "2026-11-16", t: T0 + 3 }));     // verspätet, alter Monat
    const r = await z.zusammenfassen();
    expect(r.betriebe[B]).toMatchObject({ monat: "2026-12", tag: "2026-12-01", ieMonat: 1, ieTag: 1 });
  });
  it("Z3 beschädigte Ereignisse werden übersprungen und entfernt, nicht mitgezählt", async () => {
    const store = speicherStore();
    const z = erzeugeZaehlerSpeicher({ store, unterSperre: ohneSperre });
    await z.senke(ev({ ie: 2 }));
    store.m.set("ki:zaehler:ev:2026-11-15:0000000000001-bad", { v: 1, t: 1, b: "x", ie: 1e9 });
    store.m.set("ki:zaehler:ev:2026-11-15:0000000000002-bad", "kaputt");
    const r = await z.zusammenfassen();
    expect(r.betriebe[B].ieMonat).toBe(2);
    expect([...store.m.keys()]).toEqual([ROLLUP_SCHLUESSEL]);
  });
  it("beschädigter Rollup → neu beginnen (kein Absturz)", async () => {
    const store = speicherStore();
    const z = erzeugeZaehlerSpeicher({ store, unterSperre: ohneSperre });
    store.m.set(ROLLUP_SCHLUESSEL, { v: 9, betriebe: 5 });
    await z.senke(ev({ ie: 2 }));
    expect((await z.zusammenfassen()).betriebe[B].ieMonat).toBe(2);
  });
  it("Konstruktor verlangt Store und Sperre", () => {
    expect(() => erzeugeZaehlerSpeicher({ store: speicherStore() })).toThrow();
    expect(() => erzeugeZaehlerSpeicher({ unterSperre: ohneSperre })).toThrow();
  });
});

describe("Race-Sicherheit unter der echten Raumsperre und der echten Dateiablage", () => {
  const wurzel = mkdtempSync(path.join(tmpdir(), "centric-zaehler-"));
  afterAll(() => { rmSync(wurzel, { recursive: true, force: true }); });
  it("viele gleichzeitige Ereignisse und Zusammenfassungen: die Summe stimmt genau, Ereignisse bleiben keine liegen", async () => {
    const alt = process.env.CENTRIC_DATEN;
    process.env.CENTRIC_DATEN = wurzel;
    try {
      const { getStore } = await import("../server/lib/ablage.mjs");
      const store = getStore("centric-ki-lauf");
      const z = erzeugeZaehlerSpeicher({ store, unterSperre: unterRaumsperre });
      const arbeit = [];
      for (let i = 0; i < 24; i++) {
        arbeit.push(z.senke(ev({ ie: 1, t: T0 + i })));
        if (i % 7 === 0) arbeit.push(z.zusammenfassen());
      }
      await Promise.all(arbeit);
      const r = await z.zusammenfassen();
      expect(r.betriebe[B].ieMonat).toBe(24);
      expect(r.gesamt.ie).toBe(24);
      expect((await store.list({ prefix: "ki:zaehler:ev:" })).blobs).toEqual([]);
      /* die Sperre ist ein Pseudo-Raum, kollidiert nie mit einem Betrieb */
      expect(SPERR_RAUM.startsWith("@")).toBe(true);
    } finally {
      if (alt === undefined) delete process.env.CENTRIC_DATEN; else process.env.CENTRIC_DATEN = alt;
    }
  });
});

describe("Limits mit Persistenz", () => {
  const konf = { betriebKontingentIE: 100, gesamtTagesIE: 1000, gesamtHartTagesIE: 2000, personJeStunde: { planer: 1000, leitung: 1000 }, parallelJeBetrieb: 1000 };
  const R = (i, o = {}) => ({ betrieb: "b1", person: "p1", rolle: "planer", klasse: "B", tokens: 100, fingerprint: `f${i}`, ...o });

  it("Buchung, Anhebung und Rückbuchung werden als Ereignisse geschrieben; Neustart lädt denselben Stand", async () => {
    const store = speicherStore(); const uhr = { t: T0 };
    const z = erzeugeZaehlerSpeicher({ store, unterSperre: ohneSperre });
    const l = new Limits({ ...konf, jetzt: () => uhr.t, senke: z.senke });
    const a = l.reservieren(R(1)); expect(l.erweitern(a.beleg, 30000)).toEqual({ ok: true });
    expect(await l.dauerhaft(a.beleg)).toBe(true);
    const b = l.reservieren(R(2)); l.abschliessen(b.beleg, { verbraucht: false });
    l.abschliessen(a.beleg, { verbraucht: true });
    await new Promise((r) => setTimeout(r, 10));
    expect(l.stand("b1")).toMatchObject({ ieMonat: 3, ieTag: 3 });
    /* „Neustart“: neues Limits-Objekt, Stand aus dem Rollup */
    const l2 = new Limits({ ...konf, jetzt: () => uhr.t, senke: z.senke });
    l2.ladeStand(await z.laden());
    expect(l2.stand("b1")).toMatchObject({ ieMonat: 3, ieTag: 3, laufend: 0 });
    expect(l2.gesamtStand().ieTag).toBe(3);
    /* das Tageslimit (25 von 100) gilt nach dem Neustart weiter */
    for (let i = 0; i < 22; i++) expect(l2.reservieren(R(100 + i)).ok).toBe(true);
    expect(l2.reservieren(R(999))).toMatchObject({ ok: false, grund: "betrieb_tag" });
  });
  it("Neustart mitten im Monat hebt Zähler nicht auf (Kontingent bleibt verbraucht), neuer Tag setzt den Tageszähler zurück", async () => {
    const store = speicherStore(); const uhr = { t: T0 };
    const z = erzeugeZaehlerSpeicher({ store, unterSperre: ohneSperre });
    const l = new Limits({ ...konf, jetzt: () => uhr.t, senke: z.senke });
    for (let i = 0; i < 20; i++) { const r = l.reservieren(R(i)); l.abschliessen(r.beleg, { verbraucht: true }); }
    await new Promise((r) => setTimeout(r, 10));
    uhr.t += 24 * 3600_000;
    const l2 = new Limits({ ...konf, jetzt: () => uhr.t });
    l2.ladeStand(await z.laden());
    const r = l2.reservieren(R(500));
    expect(r.ok).toBe(true);
    expect(l2.stand("b1")).toMatchObject({ ieMonat: 21, ieTag: 1 });
  });
  it("ladeStand: nur vor dem Gebrauch, ungültige Einträge werden ignoriert", () => {
    const l = new Limits({ ...konf });
    l.ladeStand({ betriebe: { "nicht-hash": { monat: "2026-11", tag: "2026-11-15", ieMonat: 5, ieTag: 5 }, [B]: { monat: "2026-11", tag: "2026-11-15", ieMonat: -5, ieTag: 5 } }, gesamt: { tag: "x", ie: -1 } });
    expect(l.stand("b1").ieMonat).toBe(0);
    l.reservieren(R(1));
    expect(() => l.ladeStand({ betriebe: {} })).toThrow();
  });
  it("Senke fällt aus: dauerhaft() liefert false, ohne den Vorgang zu stören; Kein Speicher: immer true", async () => {
    const l = new Limits({ ...konf, senke: () => { throw new Error("Platte"); } });
    const r = l.reservieren(R(1));
    expect(r.ok).toBe(true);
    expect(await l.dauerhaft(r.beleg)).toBe(false);
    const k = new Limits({ ...konf });
    expect(await k.dauerhaft(k.reservieren(R(1)).beleg)).toBe(true);
  });

  describe("im Gateway: Zähler muss dauerhaft sein, bevor der Anbieter gerufen wird", () => {
    const bauen = (store, o = {}) => {
      const uhr = { t: T0 };
      const z = erzeugeZaehlerSpeicher({ store, unterSperre: ohneSperre });
      const limits = new Limits({ ...konf, jetzt: () => uhr.t, senke: z.senke });
      const anbieter = erzeugeAttrappe();
      const alarme = [];
      const gw = erzeugeGateway({ anbieter, ladeBestand: () => bestand(), aliasSchluessel: () => SCHLUESSEL, versionen: VERSIONEN, limits,
        audit: erzeugeAudit({ senke: () => {} }), schalter: { prozess: () => "an", laufzeit: () => "an" }, betriebAktiv: () => true, funktionenFreigegeben: ["F1", "F2"],
        faktenquelle: vollQuelle, alarmHaken: o.alarmHaken || ((a) => alarme.push(a)), zeiten: { stufeMs: 250, deadlineMs: 2000, maxWiederholungen: 0, minRestMs: 0 } });
      return { gw, anbieter, limits, z, alarme };
    };
    const anf = (f, von = "2026-11-01") => ({ funktion: f, eingabe: { zeitraum: { von, bis: ZR.bis } } });
    it("Speicher ausgefallen: Klasse B (F1) wird abgelehnt, KEIN Anbieteraufruf; Klasse A (F2) läuft im Speicher weiter", async () => {
      const store = speicherStore(); store.ausfall = true;
      const t = bauen(store);
      await expect(t.gw.ausfuehren(S.leitung, anf("F1"))).rejects.toMatchObject({ code: "KI_LIMIT" });
      expect(t.anbieter.aufrufe.length).toBe(0);
      expect(t.limits.stand("raum-a|0").laufend).toBe(0);
      expect((await t.gw.ausfuehren(S.leitung, anf("F2"))).status).toBe("fertig");
      expect(t.anbieter.aufrufe.length).toBe(1);
    });
    it("Speicher in Ordnung: Ereignisse liegen vor dem Anbieteraufruf im Speicher", async () => {
      const store = speicherStore();
      let davor = -1;
      const t = bauen(store);
      const orig = t.anbieter.erzeuge.bind(t.anbieter);
      t.anbieter.erzeuge = async (e) => { davor = [...store.m.keys()].filter((k) => k.includes(":ev:")).length; return orig(e); };
      await t.gw.ausfuehren(S.leitung, anf("F2"));
      expect(davor).toBeGreaterThanOrEqual(1);
    });
    it("Alarmhaken: wird mit reinen Codes aufgerufen, ein werfender Haken stört nicht", async () => {
      const t = bauen(speicherStore(), { alarmHaken: () => { throw new Error("Mail kaputt"); } });
      expect((await t.gw.ausfuehren(S.leitung, anf("F2"))).status).toBe("fertig");
    });
  });
});

describe("Alarme (reine Funktion)", () => {
  it("Betrieb: 70 / 90 / 100 / 110 % des Monatskontingents — höchste Stufe zuerst", () => {
    const stufe = (ie) => alarmeBerechnen({ betrieb: { ieMonat: ie, kontingentIE: 100 } }).map((a) => a.code);
    expect(stufe(69)).toEqual([]);
    expect(stufe(70)).toEqual(["KONTINGENT_70"]);
    expect(stufe(90)).toEqual(["KONTINGENT_90"]);
    expect(stufe(100)).toEqual(["KONTINGENT_100"]);
    expect(stufe(110)).toEqual(["KONTINGENT_110"]);
    expect(stufe(500)).toEqual(["KONTINGENT_110"]);
  });
  it("Plattform: 80 % und 100 % des Tagesbudgets, hartes Dach, Dreifaches des 7-Tage-Mittels", () => {
    const g = (ieTag, extra = {}) => alarmeBerechnen({ gesamt: { ieTag, tagesIE: 100, hartTagesIE: 200 }, ...extra }).map((a) => a.code);
    expect(g(79)).toEqual([]);
    expect(g(80)).toEqual(["GESAMT_80"]);
    expect(g(100)).toEqual(["GESAMT_100"]);
    expect(g(200)).toEqual(["GESAMT_HART"]);
    expect(g(50, { tageswerte7: [10, 10, 10, 10, 10, 10, 10] })).toEqual(["KOSTEN_DREIFACH"]);
    expect(g(30, { tageswerte7: [10, 10, 10, 10, 10, 10, 10] })).toEqual([]);
    expect(g(50, { tageswerte7: [10, 10] })).toEqual([]);       // zu wenig Vergleichswerte
    expect(g(50, { tageswerte7: [0, 0, 0, 0, 0, 0, 0] })).toEqual([]);
  });
  it("kein Klartext: nur Ebene, Code, Stufe; robust gegen Unsinn", () => {
    const a = alarmeBerechnen({ betrieb: { ieMonat: 100, kontingentIE: 100 }, gesamt: { ieTag: 100, tagesIE: 100 } });
    expect(a.every((x) => Object.keys(x).sort().join() === "code,ebene,stufe")).toBe(true);
    for (const x of [null, undefined, 5, {}, { betrieb: { ieMonat: NaN, kontingentIE: 0 } }, { gesamt: { ieTag: -1, tagesIE: "x" } }, { betrieb: { ieMonat: 5, kontingentIE: -1 } }])
      expect(alarmeBerechnen(x)).toEqual([]);
  });
});
