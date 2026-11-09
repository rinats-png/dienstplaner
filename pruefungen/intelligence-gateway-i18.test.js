/* ==========================================================================
   WP-I18 (KERN) — REGISTRY PFLICHT, SCHLÜSSELTRENNUNG, AUSGABEGRENZE,
   FREIGABE-GATE DES LIVE-ADAPTERS, FESTER RÜCKFALL JE FEHLERKLASSE

   A  Registry ist Pflicht; Modellkennung je Stufe aus registry.modellFuer(stufe)
      und Ausgabegrenze (maxAusgabeTokens) gehen an den Adapter.
   B  Gateway und Ergebnis-Speicher nur über erzeugeSchluesselbund; Alias- und
      MAC-Schlüssel getrennt; Rotation: alter MAC nur zum Prüfen.
   C  Live-Adapter: ohne Freigabe-Gate (Schalter, Budget > 0, AVV bestätigt)
      kein Transportaufruf — fetch ist in jedem Test durch eine Attrappe ersetzt,
      die nie aufgerufen werden darf.
   D  Jede Fehlerklasse des Adapters → fester Rückfall, nie Rohinhalt, nie eine
      teurere Stufe.

   Kein Netz, kein echter Anbieter, keine echten Schlüssel: alle Schlüssel sind
   Laufzeit-Platzhalter, alle Modellkennungen „platzhalter-…“.
   Module werden als Namensraum importiert, damit fehlende Exporte auf dem
   alten Stand je Fall rot sind (statt eines Ladefehlers).
   ========================================================================== */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { randomBytes } from "node:crypto";
import { inspect } from "node:util";
import { erzeugeGateway } from "../server/lib/intelligence/gateway/gateway.mjs";
import { erzeugeAttrappe } from "../server/lib/intelligence/gateway/attrappe.mjs";
import { Limits } from "../server/lib/intelligence/gateway/limits.mjs";
import { erzeugeAudit } from "../server/lib/intelligence/gateway/audit.mjs";
import * as ANB from "../server/lib/intelligence/gateway/anbieter.mjs";
import * as LIVE from "../server/lib/intelligence/gateway/anbieter-live.mjs";
import * as ERG from "../server/lib/intelligence/gateway/ergebnis.mjs";
import { sperrlisteBilden } from "../server/lib/intelligence/leckpruefung.mjs";
import { VERSIONEN, ZR, bestand, S, vollQuelle, schluesselbundTest, registryTest, SCHLUESSEL } from "./intelligence-gateway-fixture.mjs";

const AN = { prozess: () => "an", laufzeit: () => "an" };
const anfrage = (funktion = "F2") => ({ funktion, eingabe: { zeitraum: ZR } });
const fehlerVon = (f) => { try { f(); return null; } catch (e) { return e; } };
const hex = () => randomBytes(32).toString("hex");
const ROH = "ROHINHALT Anna Weberknecht 99999 boese.example";

let nr = 0;
function bauen(o = {}) {
  const ereignisse = [];
  const anbieter = o.anbieter || erzeugeAttrappe({ modus: o.modus || "ok", skript: o.skript });
  const limits = new Limits({ betriebKontingentIE: 700, gesamtTagesIE: 1000, gesamtHartTagesIE: 2000 });
  const opts = {
    anbieter, ladeBestand: () => bestand(), versionen: VERSIONEN, limits, audit: erzeugeAudit({ senke: (e) => ereignisse.push(e) }),
    schalter: AN, betriebAktiv: () => true, funktionenFreigegeben: ["F1", "F2", "F3"], faktenquelle: vollQuelle,
    zeiten: { stufeMs: 250, deadlineMs: 2000, maxWiederholungen: 2, minRestMs: 0, ...(o.zeiten || {}) }, schlafen: () => Promise.resolve(),
    zufallId: o.zufallId || (() => `Testauftrag${String(++nr).padStart(6, "0")}`),
    schluesselbund: schluesselbundTest(), registry: registryTest(), ...(o.extra || {}),
  };
  for (const k of o.ohne || []) delete opts[k];
  const gw = erzeugeGateway(opts);
  return { gw, anbieter, limits, ereignisse };
}

/* ---------------------------------------------------------------- A ---- */
describe("A — Registry ist Pflicht; Modellkennung und Ausgabegrenze gehen an den Adapter", () => {
  it("ohne Registry startet das Gateway nicht (KI_INTERN, Grund Registry) — fail closed, kein Aufruf möglich", () => {
    const e = fehlerVon(() => bauen({ ohne: ["registry"] }));
    expect(e && e.code).toBe("KI_INTERN");
    expect(String(e && e.message)).toMatch(/Registry/);
  });
  it("ungültige Registry (Attrappe, null, Konfigurationsobjekt) → KI_INTERN, Grund Registry", () => {
    for (const registry of [null, { version: "rr-1", modellOrt: "extern", hoechsteStufe: 3, modellFuer: () => "x" },
      { version: "rr-1", modellOrt: "extern", stufen: { 1: "platzhalter-stufe-1" } }]) {
      const e = fehlerVon(() => bauen({ extra: { registry } }));
      expect(e && e.code, JSON.stringify(registry)).toBe("KI_INTERN");
      expect(String(e && e.message)).toMatch(/Registry/);
    }
  });
  it("Modellkennung je Stufe kommt aus registry.modellFuer(stufe) (Eskalation 1→2→3 bei Prüferfehler)", async () => {
    const t = bauen({ modus: "falsche_zahl" });
    await t.gw.ausfuehren(S.leitung, anfrage("F2"));
    expect(t.anbieter.aufrufe.map((e) => [e.stufe, e.modellKennung])).toEqual([[1, "platzhalter-stufe-1"], [2, "platzhalter-stufe-2"], [3, "platzhalter-stufe-3"]]);
  });
  it("andere Registry → andere Kennungen; F3 startet bei Stufe 2 mit deren Kennung; Registry deckelt die Kette", async () => {
    const t = bauen({ modus: "falsche_zahl", extra: { registry: registryTest({ 1: "platzhalter-a", 2: "platzhalter-b" }) } });
    await t.gw.ausfuehren(S.leitung, anfrage("F3"));
    expect(t.anbieter.aufrufe.map((e) => [e.stufe, e.modellKennung])).toEqual([[2, "platzhalter-b"]]);
  });
  it("Ausgabegrenze: Vorgabe 8000, sonst aus der Konfiguration (ausgabeTokenMax) als maxAusgabeTokens an den Adapter", async () => {
    const t = bauen();
    await t.gw.ausfuehren(S.leitung, anfrage("F2"));
    expect(t.anbieter.aufrufe[0].maxAusgabeTokens).toBe(8000);
    const u = bauen({ extra: { ausgabeTokenMax: 1234 } });
    await u.gw.ausfuehren(S.leitung, anfrage("F2"));
    expect(u.anbieter.aufrufe[0].maxAusgabeTokens).toBe(1234);
  });
  it("ungültige Ausgabegrenze → Gateway startet nicht (KI_GROESSE)", () => {
    for (const v of [0, -1, 1.5, NaN, Infinity, "100", null, 2_000_000]) {
      const e = fehlerVon(() => bauen({ extra: { ausgabeTokenMax: v } }));
      expect(e && e.code, String(v)).toBe("KI_GROESSE");
    }
  });
  it("Adapter-Vertrag: Eingabe = genau ANBIETER_EINGABE_FELDER (inkl. modellKennung, maxAusgabeTokens) + signal", async () => {
    expect(ANB.ANBIETER_EINGABE_FELDER).toEqual(["funktion", "stufe", "schemaVersion", "paket", "fremdtext", "modellKennung", "maxAusgabeTokens"]);
    const t = bauen();
    await t.gw.ausfuehren(S.leitung, anfrage("F2"));
    expect(Object.keys(t.anbieter.aufrufe[0]).sort()).toEqual([...ANB.ANBIETER_EINGABE_FELDER, "signal"].sort());
  });
  it("Ausgabe über der Grenze (Nutzung > maxAusgabeTokens) → fester Rückfall, KEINE teurere Stufe, kein Text", async () => {
    const t = bauen({ modus: "skript", extra: { ausgabeTokenMax: 1000 },
      skript: () => ({ ausgabe: { text: "Es liegen keine Fakten vor." }, nutzung: { eingabeToken: 10, ausgabeToken: 5000 } }) });
    const r = await t.gw.ausfuehren(S.leitung, anfrage("F2"));
    expect(r.status).toBe("rueckfall");
    expect(["KI_ANBIETER", "KI_GROESSE"]).toContain(r.rueckfall.code);
    expect(r.ergebnis).toBeUndefined();
    expect(t.anbieter.aufrufe.map((e) => e.stufe)).toEqual([1]);
  });
  it("aufrufen: Nutzung über maxAusgabeTokens → Klasse zu_gross, nicht wiederholt", async () => {
    let n = 0;
    const a = { id: "t", modellOrt: "extern", erzeuge: async () => { n++; return { ausgabe: { text: "x" }, nutzung: { ausgabeToken: 11 } }; } };
    let k;
    try {
      await ANB.aufrufen({ anbieter: a, eingabe: { funktion: "F2", stufe: 1, schemaVersion: "1.0", paket: { fakten: [] }, fremdtext: null, modellKennung: "platzhalter-stufe-1", maxAusgabeTokens: 10 },
        zeitJeVersuchMs: 100, maxWiederholungen: 2, deadline: Date.now() + 1000, jetzt: Date.now, schlafen: () => Promise.resolve() });
    } catch (e) { k = e.klasse; }
    expect(k).toBe("zu_gross");
    expect(n).toBe(1);
  });
});

/* ---------------------------------------------------------------- B ---- */
describe("B — Schlüssel nur über erzeugeSchluesselbund; Alias und MAC getrennt; Rotation", () => {
  const T0 = Date.UTC(2026, 10, 15, 10, 0, 0);
  const SPERR = sperrlisteBilden(bestand().mandanten[0], { raum: "raum-a" });
  const FP = "c".repeat(64);
  const ERGEBNIS = { text: "Aus den Fakten: dienstart.beginn 06:00." };
  function mkStore() {
    const m = new Map();
    return { m, async get(k) { return m.has(k) ? structuredClone(m.get(k)) : null; }, async setJSON(k, v) { m.set(k, structuredClone(v)); },
      async delete(k) { m.delete(k); }, async list({ prefix = "" } = {}) { return { blobs: [...m.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }; } };
  }
  const speicher = (store, schluesselbund) => ERG.erzeugeErgebnisSpeicher({ store, jetzt: () => T0, schluesselbund, zufallId: () => "ctx-abcdefgh" });

  it("Gateway: lose Schlüsselfunktion aliasSchluessel → KI_INTERN (nur über den Schlüsselbund)", () => {
    const e = fehlerVon(() => bauen({ extra: { aliasSchluessel: () => SCHLUESSEL } }));
    expect(e && e.code).toBe("KI_INTERN");
    expect(String(e && e.message)).toMatch(/Schlüsselbund/);
  });
  it("Gateway: ohne Schlüsselbund oder mit nachgebautem Schlüsselbund → KI_INTERN", () => {
    const nachgebaut = { aliasSchluessel: () => SCHLUESSEL, macSchluessel: () => SCHLUESSEL, stand: () => ({}), signieren: () => "0".repeat(64), pruefen: () => ({ ok: true }) };
    for (const extra of [{ schluesselbund: undefined }, { schluesselbund: nachgebaut }, { schluesselbund: null }]) {
      const e = fehlerVon(() => bauen({ extra }));
      expect(e && e.code).toBe("KI_INTERN");
      expect(String(e && e.message)).toMatch(/Schlüsselbund/);
    }
  });
  it("Gateway läuft mit dem Alias-Schlüssel AUS dem Schlüsselbund: anderer Alias-Schlüssel → andere Alias im Paket", async () => {
    const fest = () => "Testauftrag-fest18";
    const a = bauen({ zufallId: fest, extra: { schluesselbund: schluesselbundTest() } });
    const b = bauen({ zufallId: fest, extra: { schluesselbund: schluesselbundTest({ alias: hex() }) } });
    expect((await a.gw.ausfuehren(S.leitung, anfrage("F2"))).status).toBe("fertig");
    expect((await b.gw.ausfuehren(S.leitung, anfrage("F2"))).status).toBe("fertig");
    const alias = (t) => t.anbieter.aufrufe[0].paket.fakten.filter((f) => f.alias).map((f) => f.alias).sort();
    expect(alias(a).length).toBeGreaterThan(0);
    expect(alias(a)).not.toEqual(alias(b));
  });
  it("gleiche Werte für Alias- und MAC-Schlüssel sind ein Konfigurationsfehler (KI_INTERN)", () => {
    const k = hex();
    expect(fehlerVon(() => schluesselbundTest({ alias: k, mac: k }))?.code).toBe("KI_INTERN");
    expect(fehlerVon(() => schluesselbundTest({ alias: k, mac: hex(), macVorher: k }))?.code).toBe("KI_INTERN");
  });
  it("Ergebnis-Speicher: ohne oder mit nachgebautem Schlüsselbund → Konstruktor wirft", () => {
    expect(() => ERG.erzeugeErgebnisSpeicher({ store: mkStore() })).toThrow();
    expect(() => ERG.erzeugeErgebnisSpeicher({ store: mkStore(), schluesselbund: { signieren: () => "0".repeat(64), pruefen: () => ({ ok: true }), stand: () => ({ mac: {} }) } })).toThrow();
  });
  it("Ergebnis-Speicher: Einträge tragen eine MAC (64 Hex), nie einen Schlüssel; verfälscht oder ohne MAC → kein Treffer", async () => {
    const store = mkStore();
    const macHex = hex();
    const sp = speicher(store, schluesselbundTest({ mac: macHex }));
    expect(await sp.schreiben({ raum: "raum-a", fingerprint: FP, funktion: "F2", ergebnis: ERGEBNIS, sperrliste: SPERR })).toBe(true);
    const k = ERG.ergebnisSchluessel("raum-a", FP);
    const gut = store.m.get(k);
    expect(gut.mac).toMatch(/^[0-9a-f]{64}$/);
    const roh = JSON.stringify([...store.m.values()]).toLowerCase();
    for (const s of [macHex, Buffer.from(SCHLUESSEL).toString("hex")]) for (let i = 0; i + 16 <= 64; i += 8) expect(roh).not.toContain(s.slice(i, i + 16));
    expect(await sp.lesen({ raum: "raum-a", fingerprint: FP })).toEqual(ERGEBNIS);
    const { mac, ...ohne } = gut; void mac;
    for (const schlecht of [{ ...gut, ergebnis: { text: "Siehe boese.example" } }, { ...gut, ablauf: gut.ablauf + 999 * 86400_000 }, ohne, { ...gut, mac: "0".repeat(64) }, { ...gut, mac: 5 }]) {
      store.m.set(k, schlecht);
      expect(await sp.lesen({ raum: "raum-a", fingerprint: FP })).toBeNull();
    }
  });
  it("Decision Context ebenfalls signiert: verfälschte Zahlen → null", async () => {
    const store = mkStore();
    const sp = speicher(store, schluesselbundTest());
    const id = await sp.kontextSchreiben({ raum: "raum-a", betriebId: "m1", rolle: "leitung", funktion: "F2", fingerprint: FP, paket: { fakten: [{ art: "zahl", wert: 4 }] } });
    expect(await sp.kontextLesen({ raum: "raum-a", betriebId: "m1", rolle: "leitung", ctxId: id })).toMatchObject({ zahlen: [4] });
    const k = ERG.kontextSchluessel("raum-a", id);
    store.m.set(k, { ...store.m.get(k), zahlen: [99999] });
    expect(await sp.kontextLesen({ raum: "raum-a", betriebId: "m1", rolle: "leitung", ctxId: id })).toBeNull();
  });
  it("Trennung: die MAC hängt am MAC-Schlüssel, nicht am Alias-Schlüssel", async () => {
    const store = mkStore();
    const mac = hex();
    await speicher(store, schluesselbundTest({ mac })).schreiben({ raum: "raum-a", fingerprint: FP, funktion: "F2", ergebnis: ERGEBNIS, sperrliste: SPERR });
    expect(await speicher(store, schluesselbundTest({ alias: hex(), mac })).lesen({ raum: "raum-a", fingerprint: FP })).toEqual(ERGEBNIS);   // anderer Alias, gleicher MAC
    expect(await speicher(store, schluesselbundTest({ mac: hex() })).lesen({ raum: "raum-a", fingerprint: FP })).toBeNull();               // gleicher Alias, anderer MAC
  });
  it("Rotation: alter MAC-Schlüssel nur zum PRÜFEN bestehender Einträge; neue Einträge nur mit dem neuen", async () => {
    const store = mkStore();
    const alt = hex(); const neu = hex();
    const FP2 = "d".repeat(64);
    await speicher(store, schluesselbundTest({ mac: alt })).schreiben({ raum: "raum-a", fingerprint: FP, funktion: "F2", ergebnis: ERGEBNIS, sperrliste: SPERR });
    const rotiert = speicher(store, schluesselbundTest({ mac: neu, macVorher: alt }));
    expect(await rotiert.lesen({ raum: "raum-a", fingerprint: FP })).toEqual(ERGEBNIS);              // bestehender Eintrag: mit vorher geprüft
    await rotiert.schreiben({ raum: "raum-a", fingerprint: FP2, funktion: "F2", ergebnis: ERGEBNIS, sperrliste: SPERR });
    expect(await speicher(store, schluesselbundTest({ mac: neu })).lesen({ raum: "raum-a", fingerprint: FP2 })).toEqual(ERGEBNIS);   // neu: mit neuem signiert
    expect(await speicher(store, schluesselbundTest({ mac: alt })).lesen({ raum: "raum-a", fingerprint: FP2 })).toBeNull();          // … nicht mit dem alten
    expect(await speicher(store, schluesselbundTest({ mac: neu })).lesen({ raum: "raum-a", fingerprint: FP })).toBeNull();           // vorher entfernt → alter Eintrag ungültig
  });
  it("Gateway und Ergebnis-Speicher müssen aus demselben Schlüsselbund stammen (sonst KI_INTERN)", () => {
    const sp = speicher(mkStore(), schluesselbundTest({ mac: hex() }));
    const e = fehlerVon(() => bauen({ extra: { ergebnisSpeicher: sp, kiVersionen: { prompt: "p1", pruefer: "v1", bausteinKatalog: "k1", routerRegistry: "rr1" } } }));
    expect(e && e.code).toBe("KI_INTERN");
    expect(String(e && e.message)).toMatch(/Schlüsselbund/);
    const bund = schluesselbundTest();
    expect(fehlerVon(() => bauen({ extra: { schluesselbund: bund, ergebnisSpeicher: speicher(mkStore(), bund),
      kiVersionen: { prompt: "p1", pruefer: "v1", bausteinKatalog: "k1", routerRegistry: "rr1" } } }))).toBeNull();
  });
});

/* ---------------------------------------------------------------- C ---- */
describe("C — Freigabe-Gate des Live-Adapters: ohne ALLE Bedingungen kein Aufruf", () => {
  const ENV = () => ({ [LIVE.LIVE_SCHALTER_NAME]: "ja", [LIVE.LIVE_SCHLUESSEL_NAME]: "platzhalter-schluessel-" + "x".repeat(24) });
  const KONF = () => ({ freigabe: true, monatsbudget: 50, avv: { status: "bestaetigt", datum: "2026-11-01" } });
  const EIN = { funktion: "F2", stufe: 1, schemaVersion: "1.0", paket: { fakten: [] }, fremdtext: null, modellKennung: "platzhalter-stufe-1", maxAusgabeTokens: 800 };
  const okTransport = () => vi.fn(async () => ({ status: 200, daten: { ausgabe: { text: "Es liegen keine Fakten vor." }, nutzung: { eingabeToken: 10, ausgabeToken: 5 } } }));
  let netz;
  beforeEach(() => { netz = vi.fn(() => { throw new Error("kein Netz in Tests"); }); vi.stubGlobal("fetch", netz); });
  afterEach(() => { expect(netz).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });

  const klasse = async (p) => { try { await p; return "ok"; } catch (e) { return e.klasse || `?${e}`; } };

  it("Vorgabe (keine Serverkonfiguration): gesperrt, Transport nie aufgerufen", async () => {
    const tr = okTransport();
    expect(await klasse(LIVE.erzeugeLiveAnbieter({ env: ENV(), transport: tr }).erzeuge(EIN))).toBe("nicht_freigegeben");
    expect(tr).not.toHaveBeenCalled();
  });
  it("freigabeGate: jede Bedingung einzeln; erst alle drei öffnen", () => {
    expect(typeof LIVE.freigabeGate).toBe("function");
    expect(LIVE.freigabeGate(KONF())).toMatchObject({ freigabe: true, budget: true, avv: true, offen: true });
    expect(LIVE.freigabeGate(undefined)).toMatchObject({ freigabe: false, budget: false, avv: false, offen: false });
  });
  it("fehlt EINE Bedingung (Schalter, Budget > 0, AVV bestätigt mit Datum) → gesperrt, kein Aufruf", async () => {
    const k = KONF;
    const fälle = [
      { ...k(), freigabe: false }, { ...k(), freigabe: "ja" }, { ...k(), freigabe: 1 }, (() => { const x = k(); delete x.freigabe; return x; })(),
      { ...k(), monatsbudget: 0 }, { ...k(), monatsbudget: -5 }, { ...k(), monatsbudget: NaN }, { ...k(), monatsbudget: Infinity }, { ...k(), monatsbudget: "50" },
      (() => { const x = k(); delete x.monatsbudget; return x; })(),
      { ...k(), avv: undefined }, { ...k(), avv: { status: "offen", datum: "2026-11-01" } }, { ...k(), avv: { status: "Bestaetigt", datum: "2026-11-01" } },
      { ...k(), avv: { status: "bestaetigt" } }, { ...k(), avv: { status: "bestaetigt", datum: "2026-13-01" } }, { ...k(), avv: { status: "bestaetigt", datum: "2026-02-30" } },
      { ...k(), avv: { status: "bestaetigt", datum: "01.11.2026" } }, { ...k(), avv: "bestaetigt" },
      Object.create(k()),                                                       // geerbte Werte zählen nicht
      { ...k(), avv: Object.create({ status: "bestaetigt", datum: "2026-11-01" }) },
    ];
    for (const konfig of fälle) {
      const tr = okTransport();
      expect(await klasse(LIVE.erzeugeLiveAnbieter({ env: ENV(), konfig, transport: tr }).erzeuge(EIN)), JSON.stringify(konfig)).toBe("nicht_freigegeben");
      expect(tr).not.toHaveBeenCalled();
    }
  });
  it("Gate offen, aber Umgebungs-Schalter/Schlüssel/Transport fehlt → gesperrt, kein Aufruf", async () => {
    const tr = okTransport();
    for (const env of [{}, { [LIVE.LIVE_SCHALTER_NAME]: "ja" }, { ...ENV(), [LIVE.LIVE_SCHALTER_NAME]: "JA" }, { ...ENV(), [LIVE.LIVE_SCHLUESSEL_NAME]: "kurz" }])
      expect(await klasse(LIVE.erzeugeLiveAnbieter({ env, konfig: KONF(), transport: tr }).erzeuge(EIN))).toBe("nicht_freigegeben");
    expect(await klasse(LIVE.erzeugeLiveAnbieter({ env: ENV(), konfig: KONF() }).erzeuge(EIN))).toBe("nicht_freigegeben");
    expect(tr).not.toHaveBeenCalled();
  });
  it("die Gate-Entscheidung fällt beim Erzeugen: spätere Änderung der Konfiguration öffnet nichts", async () => {
    const konfig = { ...KONF(), freigabe: false };
    const tr = okTransport();
    const a = LIVE.erzeugeLiveAnbieter({ env: ENV(), konfig, transport: tr });
    konfig.freigabe = true;
    expect(await klasse(a.erzeuge(EIN))).toBe("nicht_freigegeben");
    expect(tr).not.toHaveBeenCalled();
  });
  it("Kontrolle (Platzhalter): alle Bedingungen erfüllt → genau EIN Transportaufruf mit Modell und Grenze aus der Eingabe; fetch nie", async () => {
    const tr = okTransport();
    const r = await LIVE.erzeugeLiveAnbieter({ env: ENV(), konfig: KONF(), transport: tr }).erzeuge({ ...EIN, signal: new AbortController().signal });
    expect(tr).toHaveBeenCalledTimes(1);
    const arg = tr.mock.calls[0][0];
    expect(arg.modell).toBe("platzhalter-stufe-1");
    expect(arg.maxAusgabeTokens).toBe(800);
    expect(JSON.stringify(arg.paket)).not.toContain("platzhalter-schluessel");
    expect(r.ausgabe).toEqual({ text: "Es liegen keine Fakten vor." });
  });
  it("ohne Modellkennung oder Ausgabegrenze aus dem Gateway → kein Transportaufruf (ungueltig)", async () => {
    const tr = okTransport();
    const a = LIVE.erzeugeLiveAnbieter({ env: ENV(), konfig: KONF(), transport: tr });
    for (const e of [{ ...EIN, modellKennung: undefined }, { ...EIN, modellKennung: "https://x.example/m" }, { ...EIN, maxAusgabeTokens: 0 }, { ...EIN, maxAusgabeTokens: undefined }])
      expect(await klasse(a.erzeuge(e))).toBe("ungueltig");
    expect(tr).not.toHaveBeenCalled();
  });
  it("L4: Anbieterschlüssel in keinem JSON, String, inspect oder Fehler", async () => {
    const geheim = "platzhalter-geheim-" + "y".repeat(30);
    const a = LIVE.erzeugeLiveAnbieter({ env: { [LIVE.LIVE_SCHALTER_NAME]: "ja", [LIVE.LIVE_SCHLUESSEL_NAME]: geheim }, konfig: KONF(), transport: async () => { throw new Error(geheim); } });
    let f; try { await a.erzeuge(EIN); } catch (e) { f = e; }
    const alles = [JSON.stringify(a), String(a), inspect(a, { showHidden: true, depth: 5 }), String(f && f.message), JSON.stringify(f), f && f.stack].join("|");
    expect(alles).not.toContain(geheim);
  });
  it("im Gateway: Live-Adapter mit geschlossenem Gate → Rückfall KI_NICHT_FREIGEGEBEN, eine Stufe, kein Transport", async () => {
    const tr = okTransport();
    const t = bauen({ anbieter: LIVE.erzeugeLiveAnbieter({ env: ENV(), konfig: { ...KONF(), monatsbudget: 0 }, transport: tr }) });
    const r = await t.gw.ausfuehren(S.leitung, anfrage("F2"));
    expect(r).toMatchObject({ status: "rueckfall", rueckfall: { code: "KI_NICHT_FREIGEGEBEN" } });
    expect(tr).not.toHaveBeenCalled();
    expect(t.ereignisse.filter((e) => e.art === "ki.stufe").map((e) => e.stufe)).toEqual([1]);
  });
  it("im Gateway (Platzhalter, Gate offen): Modellkennung aus der Registry und Ausgabegrenze erreichen den Transport", async () => {
    const tr = okTransport();
    const t = bauen({ anbieter: LIVE.erzeugeLiveAnbieter({ env: ENV(), konfig: KONF(), transport: tr }), extra: { ausgabeTokenMax: 900 } });
    const r = await t.gw.ausfuehren(S.leitung, anfrage("F2"));
    expect(r.status).toBe("fertig");
    expect(tr).toHaveBeenCalledTimes(1);
    expect(tr.mock.calls[0][0]).toMatchObject({ modell: "platzhalter-stufe-1", maxAusgabeTokens: 900, stufe: 1 });
  });
});

/* ---------------------------------------------------------------- D ---- */
describe("D — jede Fehlerklasse des Adapters → fester Rückfall, nie Rohinhalt, nie eine teurere Stufe", () => {
  const ERWARTET = { zeit: "KI_ZEIT", begrenzt: "KI_ANBIETER", nicht_verfuegbar: "KI_ANBIETER", ungueltig: "KI_ANBIETER", schema: "KI_ANBIETER", zu_gross: "KI_ANBIETER" };
  it("Fehlerklasse schema existiert und ist nicht wiederholbar", () => {
    expect(ANB.ANBIETER_FEHLERKLASSEN).toContain("schema");
    expect(new ANB.AnbieterFehler("schema").klasse).toBe("schema");
    expect(new ANB.AnbieterFehler("schema").wiederholbar).toBe(false);
  });
  for (const [k, code] of Object.entries(ERWARTET)) {
    it(`Klasse ${k} (Attrappe) → Rückfall ${code}, nur Stufe 1, kein Rohinhalt in Antwort oder Protokoll`, async () => {
      for (const funktion of ["F2", "F3"]) {
        const t = bauen({ modus: "skript", skript: () => { throw new ANB.AnbieterFehler(k, ROH); } });
        const r = await t.gw.ausfuehren(S.leitung, anfrage(funktion));
        expect(r, `${k}/${funktion}`).toMatchObject({ status: "rueckfall", rueckfall: { code } });
        expect(r.ergebnis).toBeUndefined();
        const start = funktion === "F3" ? 2 : 1;
        expect(new Set(t.anbieter.aufrufe.map((e) => e.stufe)), `${k}/${funktion}`).toEqual(new Set([start]));
        expect(JSON.stringify(r) + JSON.stringify(t.ereignisse)).not.toMatch(/ROHINHALT|Weberknecht|99999|boese/);
      }
    });
  }

  it("Antwort ohne Struktur (kein Objekt, leer, Liste) ist eine Schema-Verletzung → fester Rückfall nach Stufe 1, kein Rohinhalt", async () => {
    for (const o of [{ modus: "kaputt" }, { modus: "leer" }, { modus: "skript", skript: () => ({ ausgabe: [ROH] }) }]) {
      const t = bauen(o);
      const r = await t.gw.ausfuehren(S.leitung, anfrage("F2"));
      expect(r, JSON.stringify(o.modus)).toMatchObject({ status: "rueckfall" });
      expect(t.anbieter.aufrufe.map((e) => e.stufe)).toEqual([1]);
      expect(JSON.stringify(r) + JSON.stringify(t.ereignisse)).not.toMatch(/ROHINHALT|Weberknecht|kein Objekt/);
    }
  });

  describe("über den Live-Adapter mit gemocktem Transport (Gate offen, Platzhalter)", () => {
    const ENV = { [LIVE.LIVE_SCHALTER_NAME]: "ja", [LIVE.LIVE_SCHLUESSEL_NAME]: "platzhalter-schluessel-" + "x".repeat(24) };
    const KONF = { freigabe: true, monatsbudget: 50, avv: { status: "bestaetigt", datum: "2026-11-01" } };
    let netz;
    beforeEach(() => { netz = vi.fn(() => { throw new Error("kein Netz in Tests"); }); vi.stubGlobal("fetch", netz); });
    afterEach(() => { expect(netz).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });

    const FAELLE = [
      ["zeit", "KI_ZEIT", ({ signal }) => new Promise((_, nein) => signal.addEventListener("abort", () => nein(new Error(ROH))))],
      ["begrenzt (429)", "KI_ANBIETER", async () => ({ status: 429, daten: { fehler: ROH } })],
      ["nicht verfügbar (503)", "KI_ANBIETER", async () => ({ status: 503, daten: { fehler: ROH } })],
      ["nicht verfügbar (Transportfehler)", "KI_ANBIETER", async () => { throw new Error(ROH); }],
      ["ungültig (keine Daten)", "KI_ANBIETER", async () => ({ status: 200, daten: null })],
      ["ungültig (Text statt Objekt)", "KI_ANBIETER", async () => ({ status: 200, daten: ROH })],
      ["Schema (fremdes Feld)", "KI_ANBIETER", async () => ({ status: 200, daten: { ausgabe: { text: "ok", roh: ROH } } })],
      ["Schema (Ausgabe ist Text)", "KI_ANBIETER", async () => ({ status: 200, daten: { ausgabe: ROH } })],
      ["Schema (text keine Zeichenkette)", "KI_ANBIETER", async () => ({ status: 200, daten: { ausgabe: { text: [ROH] } } })],
      ["zu groß (Abbruch Länge)", "KI_ANBIETER", async () => ({ status: 200, daten: { ausgabe: { text: ROH }, abbruch: "laenge" } })],
      ["zu groß (Nutzung über Grenze)", "KI_ANBIETER", async () => ({ status: 200, daten: { ausgabe: { text: "Es liegen keine Fakten vor." }, nutzung: { ausgabeToken: 999999 } } })],
    ];
    for (const [name, code, roh] of FAELLE) {
      it(`${name} → Rückfall, nur Modell der Stufe 1, kein Rohinhalt`, async () => {
        const tr = vi.fn(roh);
        const t = bauen({ anbieter: LIVE.erzeugeLiveAnbieter({ env: ENV, konfig: KONF, transport: tr }), zeiten: { stufeMs: 60 } });
        const r = await t.gw.ausfuehren(S.leitung, anfrage("F2"));
        expect(r.status).toBe("rueckfall");
        expect(["KI_ANBIETER", "KI_GROESSE", "KI_ZEIT"]).toContain(r.rueckfall.code);
        if (code !== "KI_ANBIETER" || !name.startsWith("zu groß")) expect(r.rueckfall.code).toBe(code);
        expect(r.ergebnis).toBeUndefined();
        expect(tr.mock.calls.length).toBeGreaterThan(0);
        expect(new Set(tr.mock.calls.map((c) => c[0].modell))).toEqual(new Set(["platzhalter-stufe-1"]));
        expect(JSON.stringify(r) + JSON.stringify(t.ereignisse)).not.toMatch(/ROHINHALT|Weberknecht|99999|boese/);
      });
    }
  });
});
