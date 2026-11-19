/* ==========================================================================
   INTELLIGENCE-GATEWAY — REGRESSIONSTESTS ZU RUNDE 3 DES REVIEWS (e6d1fc5)

   1 Vorzeichen negativer Paketwerte · 2 Einheiten hinter Klammer/Bindestrich/pro/je · 3 Löschlauf bei E/A-Fehler ·
   4 Rückbuchung ohne Buchung · 5 strenger Rollup · 7 Schalter-Takt ohne Überlappung. (8–10: in ergebnis-, oberfläche-
   und zaehler-Tests; 6 = Single-Instance, Betriebsvoraussetzung im Nachweis.) Alle Fälle waren gegen e6d1fc5 rot.
   ========================================================================== */
import { describe, it, expect, vi } from "vitest";
import { ausgabePruefen } from "../server/lib/intelligence/gateway/pruefer.mjs";
import { sperrlisteBilden } from "../server/lib/intelligence/leckpruefung.mjs";
import { erzeugeZaehlerSpeicher, ROLLUP_SCHLUESSEL } from "../server/lib/intelligence/gateway/zaehlerspeicher.mjs";
import { Limits } from "../server/lib/intelligence/gateway/limits.mjs";
import { erzeugeErgebnisSpeicher } from "../server/lib/intelligence/gateway/ergebnis.mjs";
import { erzeugeGateway } from "../server/lib/intelligence/gateway/gateway.mjs";
import { erzeugeAttrappe } from "../server/lib/intelligence/gateway/attrappe.mjs";
import { erzeugeAudit } from "../server/lib/intelligence/gateway/audit.mjs";
import { SCHLUESSEL, VERSIONEN, ZR, bestand, S, vollQuelle, schluesselbundTest, registryTest } from "./intelligence-gateway-fixture.mjs";

vi.setConfig({ testTimeout: 30000 });
const B = "0123456789abcdef";
const sperre = async (_r, f) => f();
const code = async (p) => { try { await p; return "ok"; } catch (e) { return e.code || String(e); } };
function mkStore() {
  const m = new Map(); let ausfall = null;
  return { m, setFail(p) { ausfall = p; },
    async get(k) { if (ausfall && k.startsWith(ausfall)) throw new Error("io"); return m.has(k) ? structuredClone(m.get(k)) : null; },
    async setJSON(k, v) { m.set(k, structuredClone(v)); }, async delete(k) { m.delete(k); },
    async list({ prefix = "" } = {}) { return { blobs: [...m.keys()].filter((k) => k.startsWith(prefix)).sort().map((key) => ({ key })) }; } };
}

describe("Prüfer, Runde 3", () => {
  const SPERR = sperrlisteBilden(bestand().mandanten[0], { raum: "raum-a" });
  const paket = (saldo) => ({ schemaVersion: "1.0", funktion: "F2", zeitraum: { von: "2026-11-01", bis: "2026-11-30" }, fakten: [
    { id: "f.0", feld: "ruhezeit.ist", art: "zahl", wert: 660, einheit: "min", alias: "P_BCDFGHJK", datum: "2026-11-04" },
    { id: "f.1", feld: "konto.saldo", art: "zahl", wert: saldo, einheit: "h", alias: "P_BCDFGHJK" },
    { id: "f.2", feld: "besetzung.ist", art: "zahl", wert: 4, alias: "P_BCDFGHJK" }] });
  const pr = (t, saldo = -3.5) => ausgabePruefen({ ausgabe: { text: t }, paket: paket(saldo), bausteinKatalog: null, sperrliste: SPERR });
  const REJ = (l, s) => { for (const t of l) expect(pr(t, s).ok, t).toBe(false); };
  const OK = (l, s) => { for (const t of l) expect(pr(t, s).ok, t).toBe(true); };

  it("1 ein NEGATIVER Paketwert wird nur mit „-“ oder „minus“ genannt", () => {
    REJ(["Saldo 3,5 Stunden.", "konto.saldo 3,5", "3,5 Stunden Überstunden", "3,5 Überstunden", "3,5 Stunden Mehrarbeit", "3,5 Minusstunden", "3,5 Stunden über Soll",
      "3,5 Stunden unter Soll", "3,5 Stunden zu wenig", "3,5 Stunden zu viel", "3,5 Stunden fehlen", "3,5 Stunden in den roten Zahlen", "Saldo +3,5 Stunden",
      "Saldo plus 3,5 Stunden", "3,5 Stunden Soll unterschritten", "3,5 Stunden ins Minus"], -3.5);
    OK(["Saldo -3,5 Stunden.", "Saldo minus 3,5 Stunden.", "konto.saldo -3.5 und ruhezeit.ist 660"], -3.5);
  });
  it("1 ein POSITIVER Paketwert nie mit „-“ oder „minus“", () => {
    REJ(["Saldo -3,5 Stunden.", "Saldo minus 3,5 Stunden.", "Saldo −3,5 Stunden"], 3.5);
    OK(["Saldo 3,5 Stunden.", "Saldo plus 3,5 Stunden.", "konto.saldo 3,5"], 3.5);
  });
  it("1 Richtungswörter ohne Zahl bleiben zulässig (kein Wortlisten-Wettrennen für Sätze ohne Zahlen)", () => {
    OK(["Eine Person fehlt.", "Es sind zu wenige Personen eingeplant."], -3.5);
  });

  it("2 Einheitenwörter hinter Klammer, Bindestrich, Gedankenstrich, Schrägstrich, pro/je werden geprüft", () => {
    REJ(["ruhezeit.ist 660 (Sekunden)", "660-Sekunden-Pause", "4 (Jahre)", "4-Sekunden", "4 pro Woche", "4 je Jahr", "Es sind 4 – Wochen.", "4/Woche", "4 / Monat", "4 (pro Woche)",
      "660 [Sekunden]", "„660“ Sekunden", "660: Sekunden", "ruhezeit.ist 660 (Stunden)", "konto.saldo -3,5 (Minuten)", "4 pro Tag", "3,5 je Tag"]);
    OK(["besetzung.ist 4", "ruhezeit.ist 660 (Minuten)", "ruhezeit.ist 660 – Minuten", "Ruhezeit 660/Minuten", "4 und 4"], -3.5);
  });

  it("2 am Satzende endet die Suche: die Zahl am Ende eines Satzes erbt das nächste Wort nicht", () => {
    OK(["besetzung.ist 4. Danach folgt nichts.", "ruhezeit.ist 660; Wochen werden nicht genannt"], -3.5);
  });
});

describe("Löschlauf bei E/A-Fehler (3)", () => {
  it("ein Lesefehler löscht NICHTS — weder abgelaufene noch gültige Einträge —, er wird gezählt", async () => {
    const s = mkStore(); const t = { now: Date.UTC(2026, 10, 1) };
    const sp = erzeugeErgebnisSpeicher({ schluesselbund: schluesselbundTest(), store: s, jetzt: () => t.now, zufallId: () => "ctx-abcdefgh" });
    const sl = sperrlisteBilden(bestand().mandanten[0], { raum: "r" });
    await sp.schreiben({ raum: "r", fingerprint: "a".repeat(64), funktion: "F2", ergebnis: { text: "Hallo" }, sperrliste: sl });
    await sp.kontextSchreiben({ raum: "r", betriebId: "b1", rolle: "planer", funktion: "F2", fingerprint: "a".repeat(64), paket: { fakten: [] } });
    await new Promise((r) => setTimeout(r, 30));          // ein nebenbei gestarteter Lauf ist durch
    const vorher = [...s.m.keys()].sort();
    expect(vorher.length).toBe(2);
    s.setFail("ki:");
    t.now += 200 * 86400_000;            // alles abgelaufen — nur lesen darf nicht gehen
    const b = await sp.aufraeumen();
    s.setFail(null);
    expect([...s.m.keys()].sort()).toEqual(vorher);
    expect(b).toMatchObject({ geloescht: 0, fehler: 2 });
    expect((await sp.aufraeumen()).geloescht).toBe(2);      // danach, mit gesunder Platte, wird gelöscht
  });
  it("das Aufräumen nach kontextSchreiben läuft ebenfalls (Closure statt this)", async () => {
    const s = mkStore(); const t = { now: Date.UTC(2026, 10, 1) };
    const sp = erzeugeErgebnisSpeicher({ schluesselbund: schluesselbundTest(), store: s, jetzt: () => t.now, zufallId: (() => { let n = 0; return () => `ctx-${String(++n).padStart(8, "0")}`; })() });
    await sp.kontextSchreiben({ raum: "r", betriebId: "b1", rolle: "planer", funktion: "F2", fingerprint: "a".repeat(64), paket: { fakten: [] } });
    t.now += 100 * 86400_000;
    await sp.kontextSchreiben({ raum: "r", betriebId: "b1", rolle: "planer", funktion: "F2", fingerprint: "b".repeat(64), paket: { fakten: [] } });
    await new Promise((r) => setTimeout(r, 30));
    expect([...s.m.keys()].length).toBe(1);
    const { schreiben } = sp;                                // von außen herausgenommen: kein „this“-Verlust
    expect(await schreiben({ raum: "", fingerprint: "x", ergebnis: {}, sperrliste: null })).toBe(false);
  });
});

describe("Zähler (4, 5)", () => {
  it("4 Buchung nicht dauerhaft → die Rückbuchung wird NICHT geschrieben (kein negativer Drift)", async () => {
    const s = mkStore(); const z = erzeugeZaehlerSpeicher({ store: s, unterSperre: sperre });
    let n = 0;
    const L = new Limits({ betriebKontingentIE: 100, gesamtTagesIE: 1000, gesamtHartTagesIE: 2000, jetzt: () => 1762400000000, parallelJeBetrieb: 10,
      senke: (e) => { if (++n === 1) throw new Error("Platte kurz weg"); return z.senke(e); } });
    const r = L.reservieren({ betrieb: "b", person: "p", rolle: "planer", klasse: "B", tokens: 0, fingerprint: "x" });
    L.abschliessen(r.beleg, { verbraucht: false });
    expect(await L.dauerhaft(r.beleg)).toBe(false);               // die Buchung ging verloren …
    expect([...s.m.keys()].filter((k) => k.includes(":ev:")).length).toBe(0);   // … und die Rückbuchung wurde gar nicht erst gesendet
    const r2 = L.reservieren({ betrieb: "b", person: "p", rolle: "planer", klasse: "B", tokens: 30000, fingerprint: "y" });
    await L.dauerhaft(r2.beleg);
    expect((await z.laden()).betriebe[Object.keys((await z.laden()).betriebe)[0]].ieMonat).toBe(3);   // nur die echte Buchung zählt
  });
  it("4 Buchung dauerhaft, Rückbuchung folgt → beides wird geschrieben und gleicht sich aus", async () => {
    const s = mkStore(); const z = erzeugeZaehlerSpeicher({ store: s, unterSperre: sperre });
    const L = new Limits({ betriebKontingentIE: 100, gesamtTagesIE: 1000, gesamtHartTagesIE: 2000, jetzt: () => 1762400000000, senke: z.senke });
    const r = L.reservieren({ betrieb: "b", person: "p", rolle: "planer", klasse: "B", tokens: 0, fingerprint: "x" });
    L.abschliessen(r.beleg, { verbraucht: false });
    expect(await L.dauerhaft(r.beleg)).toBe(true);
    expect([...s.m.keys()].filter((k) => k.includes(":ev:")).length).toBe(2);
    expect(Object.values((await z.laden()).betriebe)[0].ieMonat).toBe(0);
  });
  it("5 ein strenger Rollup: jede Abweichung wirft und lässt Rollup und Ereignisse unangetastet", async () => {
    const ok = { v: 1, betriebe: { [B]: { monat: "2026-11", tag: "2026-11-06", ieMonat: 1, ieTag: 1 } }, gesamt: { tag: "2026-11-06", ie: 1 }, gefaltet: [] };
    const schlecht = [
      { ...ok, extra: 1 }, { ...ok, betriebe: { [B]: { ...ok.betriebe[B], tag: "zzzz" } } }, { ...ok, betriebe: { [B]: { ...ok.betriebe[B], monat: "zzzz" } } },
      { ...ok, betriebe: { [B]: { ...ok.betriebe[B], ieMonat: -1e300, ieTag: -1e300 } } }, { ...ok, betriebe: { [B]: { ...ok.betriebe[B], ieMonat: 1.5 } } },
      { ...ok, betriebe: { [B]: { ...ok.betriebe[B], ieMonat: 1e9 } } }, { ...ok, betriebe: { [B]: { ...ok.betriebe[B], x: 1 } } }, { ...ok, betriebe: { "nicht-hex": ok.betriebe[B] } },
      { ...ok, betriebe: { [B]: { ...ok.betriebe[B], tag: "2026-12-01" } } },        // Tag gehört nicht zum Monat
      { ...ok, gesamt: { tag: "zzzz", ie: 0 } }, { ...ok, gesamt: { tag: "2026-11-06", ie: -1e300 } }, { ...ok, gesamt: { tag: "2026-11-06", ie: 0, y: 1 } },
      { ...ok, gefaltet: ["fremd:schluessel"] }, { ...ok, gefaltet: [5] }, { ...ok, v: 2 }, [], null,
    ];
    for (const roll of schlecht) {
      const s = mkStore(); const z = erzeugeZaehlerSpeicher({ store: s, unterSperre: sperre });
      if (roll !== null) s.m.set(ROLLUP_SCHLUESSEL, roll);
      await z.senke({ t: 2, b: B, tag: "2026-11-06", monat: "2026-11", ie: 999, n: 1 });
      if (roll === null) { await expect(z.laden(), "null = fehlend, beginnt leer").resolves.toBeTruthy(); continue; }
      await expect(z.laden(), JSON.stringify(roll).slice(0, 80)).rejects.toThrow();
      expect(s.m.get(ROLLUP_SCHLUESSEL)).toEqual(roll);
      expect([...s.m.keys()].filter((k) => k.includes(":ev:")).length).toBe(1);
    }
    const s = mkStore(); const z = erzeugeZaehlerSpeicher({ store: s, unterSperre: sperre });
    s.m.set(ROLLUP_SCHLUESSEL, ok);
    await z.senke({ t: 2, b: B, tag: "2026-11-06", monat: "2026-11", ie: 5, n: 1 });
    expect((await z.laden()).betriebe[B].ieMonat).toBe(6);
  });
});

describe("Notschalter-Takt (7)", () => {
  function bauen(betriebAktiv, zeiten = {}) {
    const anbieter = erzeugeAttrappe({ modus: "zeitueberschreitung" });
    const limits = new Limits({ betriebKontingentIE: 700, gesamtTagesIE: 1000, gesamtHartTagesIE: 2000, parallelJeBetrieb: 5 });
    const gw = erzeugeGateway({ anbieter, ladeBestand: () => bestand(), schluesselbund: schluesselbundTest(), registry: registryTest(), versionen: VERSIONEN, limits, audit: erzeugeAudit({ senke: () => {} }),
      schalter: { prozess: () => "an", laufzeit: () => "an" }, betriebAktiv, funktionenFreigegeben: ["F2"], faktenquelle: vollQuelle,
      zeiten: { stufeMs: 10_000, deadlineMs: 30_000, maxWiederholungen: 0, minRestMs: 0, schalterTaktMs: 15, schalterFristMs: 60, ...zeiten }, schlafen: () => Promise.resolve() });
    return { gw, anbieter, limits };
  }
  it("ein hängendes betriebAktiv zählt als pausiert (eigene Frist) und staut keine Prüfungen auf", async () => {
    let aufrufe = 0;
    const t = bauen(() => { aufrufe++; return aufrufe <= 3 ? true : new Promise(() => {}); });
    const t0 = Date.now();
    expect(await code(t.gw.ausfuehren(S.leitung, { funktion: "F2", eingabe: { zeitraum: ZR } }))).toBe("KI_PAUSIERT");
    expect(Date.now() - t0).toBeLessThan(2000);
    expect(t.anbieter.aufrufe[0].signal.aborted).toBe(true);
    expect(aufrufe).toBeLessThanOrEqual(6);        // 1 am Anfang + wenige Prüfungen: nie ein Stau (Takt 15 ms, Frist 60 ms)
  });
  it("kein Zeitgeber bleibt zurück", async () => {
    const t = bauen(() => true, { stufeMs: 50, deadlineMs: 500 });
    const set = vi.spyOn(globalThis, "setInterval"); const clear = vi.spyOn(globalThis, "clearInterval");
    await t.gw.ausfuehren(S.leitung, { funktion: "F2", eingabe: { zeitraum: ZR } });
    expect(clear.mock.calls.length).toBeGreaterThanOrEqual(set.mock.calls.length);
    set.mockRestore(); clear.mockRestore();
  });
});
