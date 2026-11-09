/* ==========================================================================
   INTELLIGENCE-GATEWAY — REGRESSIONSTESTS ZUM DELTA-REVIEW VON 6354ff5

   1–3 Zähler-Persistenz (fail closed, E/A-Fehler, Reihenfolge) · 4–6 Prüfer (Vorzeichenwörter, Einheiten,
   Zahlverkleidungen) · 7 Kontext an Betrieb und Rolle · 8 Aufbewahrung durchgesetzt · 9 hängender Zählerspeicher ·
   10 Notschalter bricht laufende Aufrufe ab · 12 zeitraum null. (11, Single-Instance, ist eine Betriebsvoraussetzung
   im Nachweis.) Alle Fälle waren gegen 6354ff5 rot.
   ========================================================================== */
import { describe, it, expect, vi } from "vitest";
import { erzeugeZaehlerSpeicher, ROLLUP_SCHLUESSEL } from "../server/lib/intelligence/gateway/zaehlerspeicher.mjs";
import { Limits } from "../server/lib/intelligence/gateway/limits.mjs";
import { erzeugeErgebnisSpeicher, fingerprintBilden } from "../server/lib/intelligence/gateway/ergebnis.mjs";
import { erzeugeGateway } from "../server/lib/intelligence/gateway/gateway.mjs";
import { erzeugeAttrappe } from "../server/lib/intelligence/gateway/attrappe.mjs";
import { erzeugeAudit } from "../server/lib/intelligence/gateway/audit.mjs";
import { ausgabePruefen } from "../server/lib/intelligence/gateway/pruefer.mjs";
import { sperrlisteBilden } from "../server/lib/intelligence/leckpruefung.mjs";
import { SCHLUESSEL, VERSIONEN, ZR, bestand, betrieb, sitzung, S, vollQuelle, NAMENSPOLITIK_TEST, schluesselbundTest, registryTest } from "./intelligence-gateway-fixture.mjs";

vi.setConfig({ testTimeout: 30000 });

const T0 = Date.UTC(2026, 10, 15, 10, 0, 0);
const TAG = 86400_000;
const B = "0123456789abcdef";
const code = async (p) => { try { await p; return "ok"; } catch (e) { return e.code || String(e); } };

function mkStore() {
  const m = new Map(); let ausfall = null;
  return { m, setFail(praefix) { ausfall = praefix; },
    async get(k) { if (ausfall && k.startsWith(ausfall)) throw new Error("io"); return m.has(k) ? structuredClone(m.get(k)) : null; },
    async setJSON(k, v) { m.set(k, structuredClone(v)); },
    async delete(k) { m.delete(k); },
    async list({ prefix = "" } = {}) { return { blobs: [...m.keys()].filter((k) => k.startsWith(prefix)).sort().map((key) => ({ key })), directories: [] }; } };
}
const sperre = async (_r, f) => f();
const ev = (o = {}) => ({ t: 1, b: B, tag: "2026-11-06", monat: "2026-11", ie: 50, ...o });

describe("Befund 1/2: Zähler-Persistenz ist fail closed", () => {
  it("Lesefehler am Rollup: wirft, schreibt nichts, löscht nichts — Zähler werden nicht auf 0 gesetzt", async () => {
    const s = mkStore(); const z = erzeugeZaehlerSpeicher({ store: s, unterSperre: sperre });
    await z.senke(ev());
    expect((await z.zusammenfassen()).betriebe[B].ieMonat).toBe(50);
    const vorher = JSON.stringify(s.m.get(ROLLUP_SCHLUESSEL));
    await z.senke(ev({ t: 2, ie: 5 }));
    s.setFail(ROLLUP_SCHLUESSEL);
    await expect(z.zusammenfassen()).rejects.toThrow();
    await expect(z.laden()).rejects.toThrow();
    s.setFail(null);
    expect(JSON.stringify(s.m.get(ROLLUP_SCHLUESSEL))).toBe(vorher);
    expect([...s.m.keys()].filter((k) => k.includes(":ev:")).length).toBe(1);        // das Ereignis ist nicht gelöscht
    expect((await z.zusammenfassen()).betriebe[B].ieMonat).toBe(55);                  // danach stimmt alles
  });
  it("beschädigter oder fremder Rollup: wirft und bleibt unangetastet (statt leer überschrieben zu werden)", async () => {
    for (const schlecht of [{ v: 9, betriebe: 5 }, "kaputt", { v: 1, betriebe: {}, gefaltet: "x", gesamt: {} }, { v: 1, betriebe: { [B]: { monat: 1 } }, gefaltet: [], gesamt: { tag: "x", ie: 0 } }, 42]) {
      const s = mkStore(); const z = erzeugeZaehlerSpeicher({ store: s, unterSperre: sperre });
      s.m.set(ROLLUP_SCHLUESSEL, schlecht);
      await z.senke(ev());
      await expect(z.zusammenfassen(), JSON.stringify(schlecht)).rejects.toThrow();
      expect(s.m.get(ROLLUP_SCHLUESSEL)).toEqual(schlecht);
      expect([...s.m.keys()].filter((k) => k.includes(":ev:")).length).toBe(1);
    }
  });
  it("kein Rollup vorhanden (erster Start): beginnt leer — das ist der einzige Fall", async () => {
    const s = mkStore(); const z = erzeugeZaehlerSpeicher({ store: s, unterSperre: sperre });
    await z.senke(ev({ ie: 3 }));
    expect((await z.zusammenfassen()).betriebe[B].ieMonat).toBe(3);
  });
  it("E/A-Fehler beim Lesen eines Ereignisses: Abbruch, das Ereignis bleibt liegen und zählt später", async () => {
    const s = mkStore(); const z = erzeugeZaehlerSpeicher({ store: s, unterSperre: sperre });
    await z.senke(ev({ ie: 7 }));
    s.setFail("ki:zaehler:ev:");
    await expect(z.zusammenfassen()).rejects.toThrow();
    s.setFail(null);
    expect([...s.m.keys()].filter((k) => k.includes(":ev:")).length).toBe(1);
    expect(s.m.has(ROLLUP_SCHLUESSEL)).toBe(false);
    expect((await z.zusammenfassen()).betriebe[B].ieMonat).toBe(7);
  });
  it("nur wirklich ungültiger (gelesener) Inhalt wird gelöscht; ein verschwundener Schlüssel wird übersprungen", async () => {
    const s = mkStore(); const z = erzeugeZaehlerSpeicher({ store: s, unterSperre: sperre });
    await z.senke(ev({ ie: 2 }));
    s.m.set("ki:zaehler:ev:2026-11-06:0000000000009-000000-bad", { v: 1, kaputt: true });
    const orig = s.list.bind(s);
    s.list = async (o) => { const r = await orig(o); r.blobs.push({ key: "ki:zaehler:ev:2026-11-06:0000000000010-000000-weg" }); return r; };
    expect((await z.zusammenfassen()).betriebe[B].ieMonat).toBe(2);
    expect(s.m.has("ki:zaehler:ev:2026-11-06:0000000000009-000000-bad")).toBe(false);
  });
});

describe("Befund 3: Buchung und Rückbuchung zur selben Zeit", () => {
  it("200 Läufe: nach Buchung + Rückbuchung (gleiches t) bleibt der Rollup bei 0, nie bei den gebuchten IE", async () => {
    let aufgeblaeht = 0;
    for (let i = 0; i < 200; i++) {
      const s = mkStore(); const z = erzeugeZaehlerSpeicher({ store: s, unterSperre: sperre });
      const L = new Limits({ betriebKontingentIE: 100, gesamtTagesIE: 1000, gesamtHartTagesIE: 2000, jetzt: () => 1762400000000, senke: z.senke });
      const r = L.reservieren({ betrieb: "raum|0", person: "p", rolle: "planer", klasse: "B", tokens: 0, fingerprint: "x" });
      L.abschliessen(r.beleg, { verbraucht: false });
      await L.dauerhaft(r.beleg);
      const roll = await z.zusammenfassen();
      if (Object.values(roll.betriebe)[0].ieMonat !== 0) aufgeblaeht++;
      expect((await z.laden()).gesamt.ie).toBe(0);
    }
    expect(aufgeblaeht).toBe(0);
  });
  it("Ereignisse eines Belegs tragen eine laufende Folgenummer im Schlüssel (Buchung vor Rückbuchung)", async () => {
    const s = mkStore(); const z = erzeugeZaehlerSpeicher({ store: s, unterSperre: sperre });
    const L = new Limits({ betriebKontingentIE: 100, gesamtTagesIE: 1000, gesamtHartTagesIE: 2000, jetzt: () => 1762400000000, senke: z.senke });
    const r = L.reservieren({ betrieb: "b", person: "p", rolle: "planer", klasse: "B", tokens: 0, fingerprint: "x" });
    L.erweitern(r.beleg, 30000); L.abschliessen(r.beleg, { verbraucht: false });
    await L.dauerhaft(r.beleg);
    const keys = [...s.m.keys()].sort();
    expect(keys.map((k) => k.split(":").pop().split("-")[1])).toEqual(["000001", "000002", "000003"]);
    expect(keys.map((k) => s.m.get(k).ie)).toEqual([1, 2, -3]);
  });
  it("eine Rückbuchung vor ihrer Buchung (langsamer Schreibvorgang) wird nicht gekappt, sondern später ausgeglichen", async () => {
    const s = mkStore(); const z = erzeugeZaehlerSpeicher({ store: s, unterSperre: sperre });
    await z.senke(ev({ ie: -3, n: 2 }));
    expect((await z.laden()).betriebe[B].ieMonat).toBe(0);      // gekappt erst beim Laden
    await z.senke(ev({ ie: 3, n: 1 }));
    expect((await z.laden()).betriebe[B].ieMonat).toBe(0);
    await z.senke(ev({ ie: 4, n: 1, t: 2 }));
    expect((await z.laden()).betriebe[B].ieMonat).toBe(4);
  });
});

describe("Befunde 4–6: Prüfer", () => {
  const SPERR = sperrlisteBilden(bestand().mandanten[0], { raum: "raum-a" });
  const paket = (saldo) => ({ schemaVersion: "1.0", funktion: "F2", zeitraum: { von: "2026-11-01", bis: "2026-11-30" }, fakten: [
    { id: "f.0", feld: "ruhezeit.ist", art: "zahl", wert: 660, einheit: "min", alias: "P_BCDFGHJK", datum: "2026-11-04" },
    { id: "f.1", feld: "konto.saldo", art: "zahl", wert: saldo, einheit: "h", alias: "P_BCDFGHJK" }] });
  const pr = (t, saldo = -3.5) => ausgabePruefen({ ausgabe: { text: t }, paket: paket(saldo), bausteinKatalog: null, sperrliste: SPERR });
  const REJ = (liste, saldo) => { for (const t of liste) expect(pr(t, saldo).ok, t).toBe(false); };
  const OK = (liste, saldo) => { for (const t of liste) expect(pr(t, saldo).ok, t).toBe(true); };

  it("4 Vorzeichenwörter: minus/plus werden als Vorzeichen geprüft, Defizit/Überschuss/negativ/im Minus abgelehnt", () => {
    OK(["Saldo minus 3,5 Stunden.", "Saldo -3,5 Stunden."], -3.5);
    REJ(["Saldo plus 3,5 Stunden.", "Defizit 3,5 Stunden.", "Überschuss von 3,5 Stunden.", "Ueberschuss 3,5 Stunden", "Saldo 3,5 Stunden im Minus.", "Saldo 3,5 Stunden im Plus.",
      "negativ 3,5 Stunden", "positiver Saldo 3,5 Stunden", "Guthaben 3,5 Stunden", "Fehlbetrag 3,5 Stunden", "Rückstand 3,5 Stunden"], -3.5);
    OK(["Saldo plus 3,5 Stunden."], 3.5);
    REJ(["Saldo minus 3,5 Stunden."], 3.5);
  });
  it("5 unbekannte Einheiten und nackte Zahlen: Sekunden, Wochen, Euro, Jahre, „Alter 660“ werden abgelehnt", () => {
    REJ(["660 Sekunden", "660 Wochen", "660 Euro", "660 Jahre", "660 Monate", "Alter 660", "Tel 660 3,5", "P_BCDFGHJK ist 3,5 Jahre alt", "660 Dienste", "Ruhezeit 660.",
      "660 Tage", "3,5 Minuten", "3,5 Personen", "ein Jahr", "eine Woche", "eine Stunde", "einen Tag", "Mrd.", "Tsd.", "Mio."]);
    OK(["660 Minuten", "ruhezeit.ist 660", "Saldo -3,5 Stunden", "konto.saldo -3,5 und ruhezeit.ist 660", "Ruhezeit von 660 Minuten. Saldo -3,5 Stunden"], -3.5);
  });
  it("6 Zahlverkleidungen: zweieinhalb, anderthalb, zwanzigjährig, Zwanzigern, zweistellig, 3,5-fach, 660-mal, 3,5 x, × 3,5, kleine römische Ziffern", () => {
    REJ(["zweieinhalb Stunden", "anderthalb Stunden", "eineinhalb Stunden", "dritthalb Stunden", "zwanzigjährig", "in den Zwanzigern", "Zwanzigerjahre", "zweistellig",
      "dreistellige Summe", "3,5-fach", "660-mal", "3,5 x", "× 3,5", "3,5fach", "660 mal", "Abschnitt iv", "ix Stunden", "ⅹ Stunden", "ⅳ", "ⅿ", "Stufe x", "Block VII", "Typ mdc",
      "beide Personen", "verdreifacht", "Hundertschaft"], -3.5);
    OK(["Mi und Di haben Dienst.", "z.B. ruhezeit.ist 660", "d.h. ruhezeit.ist 660"], -3.5);
  });
});

describe("Gateway-Befunde", () => {
  function bauen(o = {}) {
    const store = o.store || mkStore(); const uhr = { t: T0 };
    const sp = o.speicher || erzeugeErgebnisSpeicher({ schluesselbund: schluesselbundTest(), store, jetzt: () => uhr.t, modus: o.modus });
    const anbieter = o.anbieter || erzeugeAttrappe({ modus: o.attrappe || "ok", skript: o.skript });
    const limits = o.limits || new Limits({ jetzt: () => uhr.t, betriebKontingentIE: 700, gesamtTagesIE: 1000, gesamtHartTagesIE: 2000, parallelJeBetrieb: 5, ...(o.limitKonfig || {}) });
    let schalter = o.schalter || { prozess: () => "an", laufzeit: () => "an" };
    const gw = erzeugeGateway({ anbieter, ladeBestand: () => (o.bestand ? o.bestand() : bestand()), schluesselbund: schluesselbundTest(), registry: registryTest(), versionen: VERSIONEN, limits,
      audit: erzeugeAudit({ senke: () => {} }), schalter, betriebAktiv: o.betriebAktiv || (() => true), funktionenFreigegeben: ["F1", "F2", "F5"], faktenquelle: vollQuelle, namenspolitik: NAMENSPOLITIK_TEST,   // WP-I13 G18
      ergebnisSpeicher: o.ohneSpeicher ? undefined : sp, kiVersionen: { prompt: "p1", pruefer: "v1", bausteinKatalog: "k1", routerRegistry: "rr1" },
      zeiten: { stufeMs: 250, deadlineMs: 2000, maxWiederholungen: 0, minRestMs: 0, schalterTaktMs: 15, ...(o.zeiten || {}) }, schlafen: () => Promise.resolve() });
    return { gw, anbieter, limits, store, sp, uhr };
  }
  const anf = (von = "2026-11-01") => ({ funktion: "F2", eingabe: { zeitraum: { von, bis: ZR.bis } } });

  it("7 Kontext ist an Betrieb und Rolle gebunden (zwei Betriebe im selben Raum)", async () => {
    const zwei = () => bestand(betrieb("m1", "Haus Eins"), betrieb("m2", "Haus Zwei"));
    const t = bauen({ bestand: zwei });
    const a = await t.gw.ausfuehren(sitzung("leitung", "l1", { betrieb: 0 }), anf());
    expect(a.ctxId).toBeTruthy();
    expect(await t.sp.kontextLesen({ raum: "raum-a", betriebId: "m1", rolle: "leitung", ctxId: a.ctxId })).toMatchObject({ funktion: "F2" });
    expect(await t.sp.kontextLesen({ raum: "raum-a", betriebId: "m2", rolle: "leitung", ctxId: a.ctxId })).toBeNull();     // anderer Betrieb, gleicher Raum
    expect(await t.sp.kontextLesen({ raum: "raum-a", betriebId: "m1", rolle: "planer", ctxId: a.ctxId })).toBeNull();      // andere Rolle
    expect(await t.sp.kontextLesen({ raum: "raum-a", ctxId: a.ctxId })).toBeNull();                                         // ohne Angabe nie
    const roh = JSON.stringify(t.store.m.get([...t.store.m.keys()].find((k) => k.startsWith("ki:ktx:"))));
    expect(roh).not.toContain("m1");                                                                                      // nur der Hash
    expect(await t.sp.kontextSchreiben({ raum: "raum-a", funktion: "F2", fingerprint: "e".repeat(64), paket: { fakten: [] } })).toBeNull();
  });

  it("8 Aufbewahrung: Vorgabe „an“; das Gateway startet nicht mit „vorschau“/„aus“; Fristen werden beim Schreiben nebenbei durchgesetzt", async () => {
    const store = mkStore();
    expect(erzeugeErgebnisSpeicher({ schluesselbund: schluesselbundTest(), store }).modus).toBe("an");
    for (const modus of ["vorschau", "aus"])
      expect(() => bauen({ modus }), modus).toThrow();
    const t = bauen({ store });
    await t.gw.ausfuehren(S.leitung, anf("2026-11-01"));
    const alt = [...store.m.keys()].filter((k) => k.startsWith("ki:"));
    expect(alt.length).toBe(2);
    t.uhr.t += 100 * TAG;
    await t.gw.ausfuehren(S.leitung, anf("2026-11-02"));
    await new Promise((r) => setTimeout(r, 30));
    const jetzt = [...store.m.keys()].filter((k) => k.startsWith("ki:"));
    expect(alt.some((k) => jetzt.includes(k))).toBe(false);          // die alten Einträge sind gelöscht
    expect(jetzt.length).toBe(2);                                    // nur die neuen
  });

  it("9 hängender Zählerspeicher: nach der Frist gilt „nicht dauerhaft“ — Nicht-A läuft nicht, A läuft", async () => {
    const haengt = () => new Promise(() => {});
    const limits = new Limits({ betriebKontingentIE: 700, gesamtTagesIE: 1000, gesamtHartTagesIE: 2000, senke: haengt, parallelJeBetrieb: 5 });
    const r = limits.reservieren({ betrieb: "b", person: "p", rolle: "planer", klasse: "B", tokens: 0, fingerprint: "x" });
    const t0 = Date.now();
    expect(await limits.dauerhaft(r.beleg, 40)).toBe(false);
    expect(Date.now() - t0).toBeLessThan(400);
    const t = bauen({ limits: new Limits({ betriebKontingentIE: 700, gesamtTagesIE: 1000, gesamtHartTagesIE: 2000, senke: haengt, parallelJeBetrieb: 5 }), zeiten: { zaehlerMs: 30 } });
    const t1 = Date.now();
    expect(await code(t.gw.ausfuehren(S.leitung, { funktion: "F1", eingabe: { zeitraum: ZR } }))).toBe("KI_LIMIT");
    expect(Date.now() - t1).toBeLessThan(1500);
    expect(t.anbieter.aufrufe.length).toBe(0);
    expect((await t.gw.ausfuehren(S.leitung, anf())).status).toBe("fertig");
  });

  it("10 Der Notschalter bricht einen laufenden Anbieteraufruf ab (zyklische Prüfung, AbortSignal)", async () => {
    let an = true;
    const t = bauen({ attrappe: "zeitueberschreitung", schalter: { prozess: () => (an ? "an" : "aus"), laufzeit: () => "an" }, zeiten: { stufeMs: 10_000, deadlineMs: 30_000, schalterTaktMs: 15 }, ohneSpeicher: true });
    const lauf = t.gw.ausfuehren(S.leitung, anf());
    await new Promise((r) => setTimeout(r, 60));
    expect(t.anbieter.aufrufe.length).toBe(1);
    an = false;
    const t0 = Date.now();
    expect(await code(lauf)).toBe("KI_AUS");
    expect(Date.now() - t0).toBeLessThan(1000);
    expect(t.anbieter.aufrufe[0].signal.aborted).toBe(true);
    expect(t.anbieter.aufrufe.length).toBe(1);                       // keine weitere Stufe
    expect(t.limits.stand("raum-a|0").laufend).toBe(0);
  });
  it("10 Dasselbe für die Pause des Betriebs (betriebAktiv fällt während des Aufrufs)", async () => {
    let aktiv = true;
    const t = bauen({ attrappe: "zeitueberschreitung", betriebAktiv: () => aktiv, zeiten: { stufeMs: 10_000, deadlineMs: 30_000, schalterTaktMs: 15 }, ohneSpeicher: true });
    const lauf = t.gw.ausfuehren(S.leitung, anf());
    await new Promise((r) => setTimeout(r, 60));
    aktiv = false;
    expect(await code(lauf)).toBe("KI_PAUSIERT");
    expect(t.anbieter.aufrufe[0].signal.aborted).toBe(true);
  });
  it("10 Läuft nichts mehr, bleibt kein Zeitgeber zurück (kein Intervall nach dem Vorgang)", async () => {
    const t = bauen({ ohneSpeicher: true });
    const set = vi.spyOn(globalThis, "setInterval"); const clear = vi.spyOn(globalThis, "clearInterval");
    await t.gw.ausfuehren(S.leitung, anf());
    expect(set.mock.calls.length).toBeGreaterThan(0);
    expect(clear.mock.calls.length).toBeGreaterThanOrEqual(set.mock.calls.length);
    set.mockRestore(); clear.mockRestore();
  });

  it("12 zeitraum null (Funktion ohne Zeitraum, z. B. F5): Fingerprint wird gebildet, zweiter Aufruf ist ein Treffer", async () => {
    expect(() => fingerprintBilden({ raum: "r", betriebId: "b", funktion: "F5", paketHash: "a".repeat(64), regelwerk: "r", engine: "e", prompt: "p", schema: "1.0", pruefer: "v",
      bausteinKatalog: "k", routerRegistry: "rr", zeitraum: null, bezug: null, rolle: "leitung", sprache: "de" })).not.toThrow();
    const t = bauen({});
    const a = { funktion: "F5", eingabe: { fremdtext: ["Entwurf einer kurzen Nachricht bitte"] } };
    const r1 = await t.gw.ausfuehren(S.leitung, a);
    const r2 = await t.gw.ausfuehren(S.leitung, a);
    expect(r1.status).toBe("fertig"); expect(r2.status).toBe("fertig");
    expect(t.anbieter.aufrufe.length).toBe(1);
  });
});
