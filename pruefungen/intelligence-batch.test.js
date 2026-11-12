/* ==========================================================================
   INTELLIGENCE — BATCH-INFRASTRUKTUR (WP-I29 Teil 1), gegen die Attrappe

   Obergrenzen, Isolation, Idempotenz, Kontingent (vor Start und je Eintrag), Abbruch, Frist, Determinismus,
   Schalter AUS (kein Gateway-Aufruf), keine Gesundheitsdaten in den Fakten, keine Schreibzugriffe, Rollenmatrix.
   ========================================================================== */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { erzeugeBatchLauf, batchSpecLesen, BATCH_GRENZEN } from "../server/lib/intelligence/funktionen/batch-lauf.mjs";
import { erzeugeGateway } from "../server/lib/intelligence/gateway/gateway.mjs";
import { erzeugeAttrappe } from "../server/lib/intelligence/gateway/attrappe.mjs";
import { Limits } from "../server/lib/intelligence/gateway/limits.mjs";
import { erzeugeAudit } from "../server/lib/intelligence/gateway/audit.mjs";
import { VERSIONEN, bestand, S, sitzung, vollQuelle, verbotenImPaket, schluesselbundTest, registryTest } from "./intelligence-gateway-fixture.mjs";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const AN = { prozess: () => "an", laufzeit: () => "an" };
const KEIN_WARTEN = () => Promise.resolve();
const tag = (n) => new Date(Date.UTC(2026, 10, n)).toISOString().slice(0, 10);
const eintrag = (n, funktion = "F2") => ({ funktion, eingabe: { zeitraum: { von: tag(n), bis: tag(n) } } });
const eintraege = (n, funktion = "F2") => Array.from({ length: n }, (_, i) => eintrag(i + 1, funktion));
const spec = (n = 3, extra = {}) => ({ schluessel: "auftrag-0001", eintraege: eintraege(n), ...extra });
const code = async (p) => { try { await p; return "ok"; } catch (e) { return e.code || String(e); } };
let zaehlerId = 0;

function bauen(o = {}) {
  const uhr = { t: Date.UTC(2026, 10, 15, 10, 0, 0) };
  const anbieter = o.anbieter || erzeugeAttrappe({ modus: o.modus || "ok", skript: o.skript });
  const limits = o.limits || new Limits({ jetzt: () => uhr.t, betriebKontingentIE: 700, gesamtTagesIE: 1000, gesamtHartTagesIE: 2000,
    personJeStunde: { leitung: 500, planer: 500 }, personJeTag: { leitung: 500, planer: 500 }, parallelJeBetrieb: 2, ...(o.limitKonfig || {}) });
  const ladeBestand = o.ladeBestand || vi.fn(() => bestand());
  const gw = erzeugeGateway({
    anbieter, ladeBestand, schluesselbund: schluesselbundTest(), registry: registryTest(), versionen: VERSIONEN, limits,
    audit: erzeugeAudit({ senke: () => {}, jetzt: () => uhr.t }), schalter: AN, betriebAktiv: () => true,
    funktionenFreigegeben: ["F2", "F3", "F4", "F11", "F12"], faktenquelle: vollQuelle,
    zeiten: { stufeMs: 250, deadlineMs: 2000, maxWiederholungen: 0, minRestMs: 0 }, schlafen: KEIN_WARTEN,
    zufallId: () => `Testauftrag${String(++zaehlerId).padStart(6, "0")}`,
  });
  const gateway = o.gateway === undefined ? { ausfuehren: vi.fn((s, a) => gw.ausfuehren(s, a)) } : o.gateway;
  const batch = erzeugeBatchLauf({ gateway, limits, schalter: "schalter" in o ? o.schalter : AN, funktionenFreigegeben: o.freigegeben || ["F2", "F3", "F4", "F11", "F12"],
    jetzt: o.jetzt || (() => uhr.t), zufallId: () => `batch${String(++zaehlerId).padStart(6, "0")}` });
  return { batch, gateway, anbieter, limits, uhr, ladeBestand };
}
async function laufen(t, s, sp) { const r = await t.batch.starten(s, sp); return t.batch.warten(s, r.id); }

describe("Spec: geschlossenes Schema und Obergrenzen", () => {
  it("gültige Spec wird gelesen, Vorgaben gesetzt", () => {
    expect(batchSpecLesen(spec(2))).toMatchObject({ maxIE: null, fristMs: BATCH_GRENZEN.fristVorgabeMs, parallel: 1 });
  });
  it("zu viele Einträge, leer, fremde Schlüssel, falsche Typen, zu großer Inhalt, schlechter Schlüssel", () => {
    const schlecht = [
      spec(BATCH_GRENZEN.eintraege + 1), { ...spec(), eintraege: [] }, { ...spec(), extra: 1 }, { ...spec(), schluessel: "kurz" }, { ...spec(), schluessel: "ungültig!!!!" },
      { ...spec(), maxIE: 0 }, { ...spec(), maxIE: BATCH_GRENZEN.maxIE + 1 }, { ...spec(), maxIE: 1.5 }, { ...spec(), parallel: 3 }, { ...spec(), parallel: 0 },
      { ...spec(), fristMs: 10 }, { ...spec(), fristMs: BATCH_GRENZEN.fristMaxMs + 1 }, null, [], "x",
      { ...spec(), eintraege: [{ ...eintrag(1), extra: true }] }, { ...spec(), eintraege: [{ funktion: "F2" }] }, { ...spec(), eintraege: [{ funktion: "F99", eingabe: {} }] },
      { ...spec(), eintraege: [{ ...eintrag(1), bezug: { personId: "x".repeat(70) } }] },
      { ...spec(), eintraege: [{ funktion: "F2", eingabe: { zeitraum: { von: "2026-11-01", bis: "2026-11-02" }, text: "x".repeat(70000) } }] },
    ];
    for (const s of schlecht) expect(() => batchSpecLesen(s), JSON.stringify(s).slice(0, 60)).toThrow();
    for (const s of schlecht) { try { batchSpecLesen(s); } catch (e) { expect(e.code).toBe("KI_EINGABE"); } }
  });
  it("genau an der Obergrenze ist erlaubt", () => {
    expect(batchSpecLesen(spec(BATCH_GRENZEN.eintraege)).eintraege.length).toBe(BATCH_GRENZEN.eintraege);
  });
  it("starten wirft KI_EINGABE und ruft das Gateway nicht", async () => {
    const t = bauen();
    expect(await code(t.batch.starten(S.leitung, { ...spec(), extra: 1 }))).toBe("KI_EINGABE");
    expect(t.gateway.ausfuehren).not.toHaveBeenCalled();
  });
  it("Fremdtext-Funktionen (F5/F6/F9/F16) sind nicht batchfähig", async () => {
    const t = bauen({ freigegeben: ["F5", "F9"] });
    for (const f of ["F5", "F6", "F9", "F16"]) expect(await code(t.batch.starten(S.leitung, { schluessel: "auftrag-0001", eintraege: [{ funktion: f, eingabe: { text: "x" } }] }))).not.toBe("ok");
    expect(t.gateway.ausfuehren).not.toHaveBeenCalled();
  });
  it("nicht freigegebene Funktion → KI_FUNKTION, nichts läuft", async () => {
    const t = bauen({ freigegeben: ["F3"] });
    expect(await code(t.batch.starten(S.leitung, spec(2)))).toBe("KI_FUNKTION");
    expect(t.gateway.ausfuehren).not.toHaveBeenCalled();
  });
});

describe("Ausführung gegen die Attrappe", () => {
  it("alle Einträge laufen in Reihenfolge, Ergebnis je Eintrag, Fortschritt als Zähler", async () => {
    const t = bauen();
    const r = await laufen(t, S.leitung, spec(4));
    expect(r.status).toBe("fertig");
    expect(r.fortschritt).toEqual({ gesamt: 4, fertig: 4, nicht_verfuegbar: 0, fehler: 0, nicht_ausgefuehrt: 0, laufend: 0 });
    const e = t.batch.ergebnis(S.leitung, r.id).eintraege;
    expect(e.map((x) => x.index)).toEqual([0, 1, 2, 3]);
    expect(e.every((x) => x.status === "fertig" && x.antwort && x.kennzeichnung.entwurf === true && x.kennzeichnung.veroeffentlicht === false)).toBe(true);
    expect(t.gateway.ausfuehren).toHaveBeenCalledTimes(4);
  });
  it("Fortschritt ist während des Laufs sichtbar (laeuft, laufend ≥ 1), Ergebnis erst nach dem Ende", async () => {
    let frei;
    const tor = new Promise((r) => { frei = r; });
    const t = bauen({ skript: async () => { await tor; return { text: "Es liegen keine Fakten vor." }; }, modus: "skript" });
    const start = await t.batch.starten(S.leitung, spec(2));
    expect(start.status).toBe("laeuft");
    await new Promise((r) => setTimeout(r, 20));
    expect(t.batch.status(S.leitung, start.id).fortschritt.laufend).toBe(1);
    expect(await code(Promise.resolve().then(() => t.batch.ergebnis(S.leitung, start.id)))).toBe("KI_NICHT_GEFUNDEN");
    frei();
    expect((await t.batch.warten(S.leitung, start.id)).status).toBe("fertig");
  });
  it("höchstens `parallel` Einträge gleichzeitig (1 Vorgabe, 2 Obergrenze)", async () => {
    for (const parallel of [1, 2]) {
      let aktiv = 0, spitze = 0;
      const t = bauen({ modus: "skript", skript: async () => { aktiv++; spitze = Math.max(spitze, aktiv); await new Promise((r) => setTimeout(r, 5)); aktiv--; return { text: "ok" }; } });
      await laufen(t, S.leitung, spec(6, { parallel }));
      expect(spitze).toBe(parallel);
    }
  });
  it("deterministisch: gleiche Eingaben, gleiche Ergebnisse (ohne Auftrags-IDs)", async () => {
    const lauf = async () => { zaehlerId = 0; const t = bauen(); const r = await laufen(t, S.leitung, spec(5)); const x = t.batch.ergebnis(S.leitung, r.id); return JSON.stringify({ s: x.status, f: x.fortschritt, e: x.eintraege }, (k, v) => (k === "auftragId" ? undefined : v)); };
    expect(await lauf()).toBe(await lauf());
  });
  it("Ergebnis bleibt in Eingabereihenfolge, auch wenn spätere Einträge schneller sind", async () => {
    const t = bauen({ modus: "skript", skript: async (nr) => { await new Promise((r) => setTimeout(r, nr === 1 ? 30 : 1)); return { text: `Eintrag ${nr}` }; } });
    const r = await laufen(t, S.leitung, spec(3, { parallel: 2 }));
    expect(t.batch.ergebnis(S.leitung, r.id).eintraege.map((x) => x.index)).toEqual([0, 1, 2]);
  });
});

describe("Isolation je Eintrag", () => {
  it("ein werfender, ein formal kaputter und ein durchgefallener Eintrag beeinflussen die anderen nicht", async () => {
    const t = bauen({ modus: "skript", skript: (nr, eingabe) => {
      const von = eingabe.paket.zeitraum && eingabe.paket.zeitraum.von;
      if (von === tag(2)) throw new Error("Name Anna Weberknecht, Diagnose J11");
      if (von === tag(3)) return { text: "Die Ruhezeit beträgt 99999 Minuten." };
      return { text: "Es liegen keine Fakten vor." };
    } });
    const r = await laufen(t, S.leitung, spec(4));
    const e = t.batch.ergebnis(S.leitung, r.id).eintraege;
    expect(r.status).toBe("fertig");
    expect(e.map((x) => x.status)).toEqual(["fertig", "nicht_verfuegbar", "nicht_verfuegbar", "fertig"]);
    expect(JSON.stringify(e)).not.toMatch(/Weberknecht|J11|Diagnose/);
  });
  it("wirft das Gateway selbst für einen Eintrag, steht dort nur der Code; die anderen laufen weiter", async () => {
    let n = 0;
    const gateway = { ausfuehren: vi.fn(async () => { n++; if (n === 2) throw new Error("Anna Weberknecht krank"); return { status: "fertig", ergebnis: { text: "ok" }, kennzeichnung: { kiGestuetzt: true, entwurf: true, veroeffentlicht: false, geprueft: true } }; }) };
    const t = bauen({ gateway });
    const r = await laufen(t, S.leitung, spec(3));
    const e = t.batch.ergebnis(S.leitung, r.id).eintraege;
    expect(e.map((x) => x.status)).toEqual(["fertig", "fehler", "fertig"]);
    expect(e[1].code).toBe("KI_INTERN");
    expect(JSON.stringify(e[1])).not.toMatch(/Weberknecht|krank/);
  });
  it("Anbieter aus (kein Gateway): jeder Eintrag nicht_verfuegbar, ohne Aufruf", async () => {
    const t = bauen({ gateway: null });
    const r = await laufen(t, S.leitung, spec(3));
    expect(r.status).toBe("fertig");
    expect(r.fortschritt.nicht_verfuegbar).toBe(3);
    expect(t.anbieter.aufrufe.length).toBe(0);
  });
  it("Anbieter fällt aus (Fehlermodus): nicht_verfuegbar, Auftrag trotzdem fertig", async () => {
    const t = bauen({ modus: "fehler" });
    const r = await laufen(t, S.leitung, spec(2));
    expect(r.status).toBe("fertig");
    expect(r.fortschritt.nicht_verfuegbar).toBe(2);
  });
});

describe("Idempotenz", () => {
  it("gleicher Schlüssel + gleiche Spec: derselbe Auftrag, keine zweite Ausführung", async () => {
    const t = bauen();
    const a = await t.batch.starten(S.leitung, spec(3));
    const b = await t.batch.starten(S.leitung, spec(3));
    await t.batch.warten(S.leitung, a.id);
    expect(b.id).toBe(a.id);
    expect(a.neu).toBe(true);
    expect(b.neu).toBe(false);
    expect(t.gateway.ausfuehren).toHaveBeenCalledTimes(3);
    const c = await t.batch.starten(S.leitung, spec(3));
    expect(c.id).toBe(a.id);
    expect(t.gateway.ausfuehren).toHaveBeenCalledTimes(3);
  });
  it("gleicher Schlüssel + andere Spec → KI_EINGABE, nichts Neues läuft", async () => {
    const t = bauen();
    await laufen(t, S.leitung, spec(2));
    const n = t.gateway.ausfuehren.mock.calls.length;
    expect(await code(t.batch.starten(S.leitung, spec(3)))).toBe("KI_EINGABE");
    expect(t.gateway.ausfuehren.mock.calls.length).toBe(n);
  });
  it("derselbe Schlüssel einer anderen Person oder eines anderen Betriebs ist ein anderer Auftrag; fremder Auftrag nicht lesbar", async () => {
    const t = bauen();
    const a = await t.batch.starten(S.leitung, spec(2));
    const b = await t.batch.starten(S.planer, spec(2));
    const c = await t.batch.starten({ ...S.leitung, betrieb: 1 }, spec(2));
    expect(new Set([a.id, b.id, c.id]).size).toBe(3);
    await t.batch.warten(S.leitung, a.id);
    expect(await code(Promise.resolve().then(() => t.batch.status(S.planer, a.id)))).toBe("KI_NICHT_GEFUNDEN");
    expect(await code(Promise.resolve().then(() => t.batch.ergebnis(S.planer, a.id)))).toBe("KI_NICHT_GEFUNDEN");
    expect(await code(Promise.resolve().then(() => t.batch.status(S.leitung, "gibtsnicht")))).toBe("KI_NICHT_GEFUNDEN");
  });
  it("verwerfen gibt den Auftrag frei (danach neuer Lauf möglich)", async () => {
    const t = bauen();
    const a = await laufen(t, S.leitung, spec(1));
    t.batch.verwerfen(S.leitung, a.id);
    expect(await code(Promise.resolve().then(() => t.batch.status(S.leitung, a.id)))).toBe("KI_NICHT_GEFUNDEN");
    const b = await t.batch.starten(S.leitung, spec(1));
    expect(b.neu).toBe(true);
  });
});

describe("Kontingent", () => {
  it("reicht der Rest vor dem Start nicht: kein Gateway-Aufruf, klarer Status", async () => {
    const t = bauen({ limitKonfig: { betriebKontingentIE: 2 } });
    const r = await t.batch.starten(S.leitung, spec(3));
    expect(r.status).toBe("kontingent_zu_knapp");
    expect(r.grund).toBe("KI_KONTINGENT");
    expect(t.gateway.ausfuehren).not.toHaveBeenCalled();
    expect(t.batch.ergebnis(S.leitung, r.id).eintraege.every((x) => x.status === "nicht_ausgefuehrt")).toBe(true);
    expect(t.limits.stand("raum-a|0").ieMonat).toBe(0);
  });
  it("Auftragsbudget maxIE unter der Mindestmenge: kein Start", async () => {
    const t = bauen();
    const r = await t.batch.starten(S.leitung, spec(3, { maxIE: 2 }));
    expect(r.status).toBe("kontingent_zu_knapp");
    expect(t.gateway.ausfuehren).not.toHaveBeenCalled();
  });
  it("ohne Kontingentwissen (kein limits) läuft nichts (fail closed)", async () => {
    const gw = { ausfuehren: vi.fn() };
    const batch = erzeugeBatchLauf({ gateway: gw, schalter: AN, funktionenFreigegeben: ["F2"] });
    const r = await batch.starten(S.leitung, spec(1));
    expect(r.status).toBe("kontingent_zu_knapp");
    expect(gw.ausfuehren).not.toHaveBeenCalled();
  });
  it("Kontingent wird mitten im Lauf erreicht: der Auftrag stoppt, nie über dem Kontingent", async () => {
    /* 4 IE Rest, 6 Einträge zu je 1 IE: vor dem Start 6 > 4 → zu knapp; also Verbrauch vorab erzeugen. */
    const t = bauen({ limitKonfig: { betriebKontingentIE: 10, gesamtTagesIE: 1000, tageslimitAnteil: 1 } });
    const vor = await laufen(t, S.leitung, { schluessel: "vorlauf-001", eintraege: eintraege(4).map((e, i) => ({ ...e, eingabe: { zeitraum: { von: tag(20 + i), bis: tag(20 + i) } } })) });
    expect(vor.status).toBe("fertig");
    const verbraucht = t.limits.stand("raum-a|0").ieMonat;
    expect(verbraucht).toBeGreaterThan(0);
    const r = await laufen(t, S.leitung, spec(10 - verbraucht));      // genau der Rest: läuft
    expect(r.status).toBe("fertig");
    expect(t.limits.stand("raum-a|0").ieMonat).toBeLessThanOrEqual(10);
    const nochmal = await t.batch.starten(S.leitung, { schluessel: "zweiter-lauf", eintraege: eintraege(1) });
    expect(nochmal.status).toBe("kontingent_zu_knapp");
  });
  it("Faktenpaket größer als erwartet verbraucht mehr IE: die Schleife bricht je Eintrag ab (kontingent_erreicht), restliche nicht_ausgefuehrt", async () => {
    let verbrauch = 0;
    const limits = { konfig: () => ({ kontingentIE: 10, tagesIE: 1000 }), stand: () => ({ ieMonat: verbrauch }), gesamtStand: () => ({ ieTag: 0 }) };
    const gateway = { ausfuehren: vi.fn(async () => { verbrauch += 4; return { status: "fertig", ergebnis: { text: "ok" }, kennzeichnung: { kiGestuetzt: true, entwurf: true, veroeffentlicht: false, geprueft: true } }; }) };
    const batch = erzeugeBatchLauf({ gateway, limits, schalter: AN, funktionenFreigegeben: ["F2"] });
    const s = await batch.starten(S.leitung, spec(8));
    const r = await batch.warten(S.leitung, s.id);
    expect(r.status).toBe("kontingent_erreicht");
    expect(gateway.ausfuehren).toHaveBeenCalledTimes(3);       // 4+4+4 = 12 ≥ 10: danach kein weiterer Eintrag
    expect(batch.ergebnis(S.leitung, s.id).eintraege.map((x) => x.status)).toEqual(["fertig", "fertig", "fertig", "nicht_ausgefuehrt", "nicht_ausgefuehrt", "nicht_ausgefuehrt", "nicht_ausgefuehrt", "nicht_ausgefuehrt"]);
  });
  it("Gateway meldet KI_KONTINGENT oder KI_LIMIT: Auftrag endet mit klarem Status, Rest nicht_ausgefuehrt", async () => {
    for (const [c, status] of [["KI_KONTINGENT", "kontingent_erreicht"], ["KI_LIMIT", "limit_erreicht"]]) {
      let n = 0;
      const gateway = { ausfuehren: vi.fn(async () => { n++; if (n === 2) { const e = new Error("x"); e.code = c; throw e; } return { status: "fertig", ergebnis: { text: "ok" }, kennzeichnung: {} }; }) };
      const t = bauen({ gateway });
      const r = await laufen(t, S.leitung, spec(5));
      expect(r.status).toBe(status);
      expect(r.grund).toBe(c);
      expect(t.batch.ergebnis(S.leitung, r.id).eintraege.map((x) => x.status)).toEqual(["fertig", "fehler", "nicht_ausgefuehrt", "nicht_ausgefuehrt", "nicht_ausgefuehrt"]);
      expect(gateway.ausfuehren).toHaveBeenCalledTimes(2);
    }
  });
  it("Auftragsbudget maxIE wird je Eintrag eingehalten (Verbrauch je Eintrag höher als die Mindestkosten)", async () => {
    let verbrauch = 0;
    const limits = { konfig: () => ({ kontingentIE: 100, tagesIE: 1000 }), stand: () => ({ ieMonat: verbrauch }), gesamtStand: () => ({ ieTag: 0 }) };
    const gateway = { ausfuehren: vi.fn(async () => { verbrauch += 2; return { status: "fertig", ergebnis: { text: "ok" }, kennzeichnung: {} }; }) };
    const batch = erzeugeBatchLauf({ gateway, limits, schalter: AN, funktionenFreigegeben: ["F2"] });
    const s = await batch.starten(S.leitung, spec(4, { maxIE: 4 }));
    const r = await batch.warten(S.leitung, s.id);
    expect(r.status).toBe("kontingent_erreicht");
    expect(r.grund).toBe("auftragsbudget");
    expect(gateway.ausfuehren).toHaveBeenCalledTimes(2);
    expect(verbrauch).toBeLessThanOrEqual(4);
  });
});

describe("Abbruch, Frist, Schalter", () => {
  it("abbrechen: kein weiterer Eintrag startet, Status abgebrochen", async () => {
    let frei;
    const tor = new Promise((r) => { frei = r; });
    const t = bauen({ modus: "skript", skript: async () => { await tor; return { text: "ok" }; } });
    const s = await t.batch.starten(S.leitung, spec(5));
    await new Promise((r) => setTimeout(r, 10));
    t.batch.abbrechen(S.leitung, s.id);
    frei();
    const r = await t.batch.warten(S.leitung, s.id);
    expect(r.status).toBe("abgebrochen");
    expect(r.fortschritt.fertig).toBe(1);
    expect(r.fortschritt.nicht_ausgefuehrt).toBe(4);
    expect(t.gateway.ausfuehren).toHaveBeenCalledTimes(1);
  });
  it("Frist abgelaufen: Status frist_abgelaufen, Rest nicht_ausgefuehrt", async () => {
    const uhr = { t: 1_000_000 };
    const t = bauen({ jetzt: () => uhr.t, modus: "skript", skript: () => { uhr.t += 2000; return { text: "ok" }; } });
    const r = await laufen(t, S.leitung, spec(5, { fristMs: 3000 }));
    expect(r.status).toBe("frist_abgelaufen");
    expect(r.fortschritt.fertig).toBe(2);
    expect(r.fortschritt.nicht_ausgefuehrt).toBe(3);
  });
  it("Schalter AUS: KI_AUS, kein Gateway-Aufruf, nichts gemerkt; Vorgabe ist AUS", async () => {
    for (const schalter of [{ prozess: () => "aus", laufzeit: () => "an" }, { prozess: () => "an" }, null, undefined]) {
      const t = bauen({ schalter });
      expect(await code(t.batch.starten(S.leitung, spec(2)))).toBe("KI_AUS");
      expect(t.gateway.ausfuehren).not.toHaveBeenCalled();
      expect(t.anbieter.aufrufe.length).toBe(0);
    }
    const ohne = erzeugeBatchLauf({});
    expect(await code(ohne.starten(S.leitung, spec(1)))).toBe("KI_AUS");
  });
  it("Notschalter während des Laufs: Status ausgeschaltet, kein weiterer Aufruf", async () => {
    let modus = "an";
    const t = bauen({ schalter: { prozess: () => modus, laufzeit: () => "an" }, modus: "skript", skript: () => { modus = "aus"; return { text: "ok" }; } });
    const r = await laufen(t, S.leitung, spec(4));
    expect(r.status).toBe("ausgeschaltet");
    expect(t.gateway.ausfuehren).toHaveBeenCalledTimes(1);
  });
});

describe("Rollenmatrix", () => {
  it("nur leitung und planer; Beschäftigte, Schichtverantwortung, Betriebsrat, Betreiber, Kunde, fremde Rollen → KI_ROLLE, nichts läuft", async () => {
    const t = bauen();
    for (const s of [S.mitarbeiter, S.subplaner, S.betriebsrat, S.betreiber, sitzung("kunde", "k1"), sitzung("", "x"), sitzung("admin", "x")]) {
      expect(await code(t.batch.starten(s, spec(1))), s.rolle).toBe("KI_ROLLE");
    }
    expect(t.gateway.ausfuehren).not.toHaveBeenCalled();
    for (const s of [S.leitung, S.planer]) expect((await laufen(t, s, spec(1))).status).toBe("fertig");
  });
  it("F4 (Leitungsbriefing) nur für die Leitung, F2/F11/F12 auch für Planer", async () => {
    const t = bauen();
    expect(await code(t.batch.starten(S.planer, { schluessel: "auftrag-f4", eintraege: [{ funktion: "F4", eingabe: { zeitraum: { von: tag(1), bis: tag(1) } } }] }))).toBe("KI_ROLLE");
    expect(t.gateway.ausfuehren).not.toHaveBeenCalled();
    expect((await laufen(t, S.leitung, { schluessel: "auftrag-f4", eintraege: [{ funktion: "F4", eingabe: { zeitraum: { von: tag(1), bis: tag(1) } } }] })).status).toBe("fertig");
  });
  it("ohne gültige Sitzung → KI_NICHT_ANGEMELDET", async () => {
    const t = bauen();
    for (const s of [null, {}, { rolle: "leitung" }, { rolle: "leitung", person: "", bestand: "raum-a" }]) expect(await code(t.batch.starten(s, spec(1)))).toBe("KI_NICHT_ANGEMELDET");
  });
});

describe("Fakten und Schreibzugriffe", () => {
  it("jeder Eintrag erhält ein Faktenpaket ohne Gesundheits-, Abwesenheits-, Betriebsrats- und Klardaten (Bestand mit Krankmeldungen)", async () => {
    const t = bauen();
    const r = await laufen(t, S.leitung, spec(6));
    expect(r.status).toBe("fertig");
    expect(t.anbieter.aufrufe.length).toBe(6);
    for (const a of t.anbieter.aufrufe) expect(verbotenImPaket(a.paket)).toEqual([]);
    for (const a of t.anbieter.aufrufe) expect(JSON.stringify(a)).not.toMatch(/Grippe|krank|Diagnose|mutterschutz|Haberland|Weberknecht/i);
  });
  it("keine Schreibzugriffe: Bestand bleibt unverändert, kein Speicher wird angelegt", async () => {
    const roh = bestand();
    const vorher = JSON.stringify(roh);
    const t = bauen({ ladeBestand: () => roh });
    await laufen(t, S.leitung, spec(4));
    expect(JSON.stringify(roh)).toBe(vorher);
  });
  it("Quelltext: kein Store, keine Datei, kein Netz, keine Umgebung, kein Protokoll, keine Verdrahtung", () => {
    const q = readFileSync(path.join(WURZEL, "server/lib/intelligence/funktionen/batch-lauf.mjs"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(q).not.toMatch(/setJSON|getJSON|writeFile|appendFile|node:fs|bestandSchreiben|zusammenfuehren|\bfetch\s*\(|node:https?|node:net|process\.env|console\.|audit.|erzeugeErgebnisSpeicher/i);
    for (const m of q.matchAll(/from\s+["']([^"']+)["']/g)) expect(m[1].startsWith("../") || m[1].startsWith("./") || m[1] === "node:crypto", m[1]).toBe(true);
    for (const datei of ["server.mjs"]) expect(readFileSync(path.join(WURZEL, datei), "utf8")).not.toMatch(/batch-lauf|erzeugeBatchLauf/);
  });
});
