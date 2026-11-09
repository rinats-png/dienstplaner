/* ==========================================================================
   WP-I15 — Lücken im Kostenschutz: Stundenobergrenze je Betrieb, Ausgabegrenze,
   Zeitkonfiguration (fail closed), degradierter Modus bei Limit-Überschreitung.
   Alles gegen die Attrappe; keine Kosten, kein Anbieter.
   ========================================================================== */

import { describe, it, expect } from "vitest";
import { Limits } from "../server/lib/intelligence/gateway/limits.mjs";
import { erzeugeGateway } from "../server/lib/intelligence/gateway/gateway.mjs";
import { erzeugeAttrappe } from "../server/lib/intelligence/gateway/attrappe.mjs";
import { erzeugeAudit } from "../server/lib/intelligence/gateway/audit.mjs";
import { pruefeAntwort } from "../server/lib/intelligence/schemas.mjs";
import { SCHLUESSEL, VERSIONEN, ZR, S, bestand, vollQuelle } from "./intelligence-gateway-fixture.mjs";

const T0 = Date.UTC(2026, 10, 15, 10, 0, 0);
const STD = 3600_000;
const neu = (o = {}) => {
  const uhr = { t: T0 };
  const l = new Limits({ jetzt: () => uhr.t, betriebKontingentIE: 1000, gesamtTagesIE: 5000, gesamtHartTagesIE: 9000, parallelJeBetrieb: 1000,
    personJeStunde: { planer: 1000 }, personJeTag: { planer: 1000 }, ...o });
  return { l, uhr };
};
let n = 0;
const R = (o = {}) => ({ betrieb: "b1", person: "p1", rolle: "planer", klasse: "B", tokens: 30000, fingerprint: `f${++n}`, ...o });   // mittel = 3 IE

describe("Stundenobergrenze je Betrieb (Klasse A bleibt)", () => {
  it("ohne Angabe: keine Stundenbegrenzung (bisheriges Verhalten)", () => {
    const { l } = neu();
    for (let i = 0; i < 20; i++) expect(l.reservieren(R()).ok).toBe(true);
  });
  it("Obergrenze 7 IE/h: zwei Aufrufe à 3 IE gehen, der dritte nicht; nach einer Stunde wieder", () => {
    const { l, uhr } = neu({ betriebJeStundeIE: 7 });
    expect(l.reservieren(R()).ok).toBe(true);
    expect(l.reservieren(R()).ok).toBe(true);
    expect(l.reservieren(R())).toMatchObject({ ok: false, code: "KI_KONTINGENT", grund: "betrieb_stunde" });
    expect(l.stand("b1").ieMonat).toBe(6);
    uhr.t += STD + 1;
    expect(l.reservieren(R()).ok).toBe(true);
  });
  it("ein anderer Betrieb ist nicht betroffen", () => {
    const { l } = neu({ betriebJeStundeIE: 3 });
    expect(l.reservieren(R()).ok).toBe(true);
    expect(l.reservieren(R()).ok).toBe(false);
    expect(l.reservieren(R({ betrieb: "b2" })).ok).toBe(true);
  });
  it("Klasse A wird dadurch nie gesperrt (B4)", () => {
    const { l } = neu({ betriebJeStundeIE: 3 });
    expect(l.reservieren(R()).ok).toBe(true);
    expect(l.reservieren(R({ klasse: "A" })).ok).toBe(true);
  });
  it("nichts geliefert: die Einheiten gehen auch aus dem Stundenfenster zurück", () => {
    const { l } = neu({ betriebJeStundeIE: 3 });
    const r = l.reservieren(R());
    l.abschliessen(r.beleg, { verbraucht: false });
    expect(l.reservieren(R()).ok).toBe(true);
  });
  it("erweitern zählt die angehobene Größe im Stundenfenster mit", () => {
    const { l } = neu({ betriebJeStundeIE: 5 });
    const r = l.reservieren(R({ tokens: 0 }));          // klein = 1 IE
    expect(l.erweitern(r.beleg, 70000)).toMatchObject({ ok: false, code: "KI_KONTINGENT" });   // groß = 7 > 5
    expect(l.erweitern(r.beleg, 30000)).toEqual({ ok: true });                                  // mittel = 3
    expect(l.reservieren(R({ tokens: 0 })).ok).toBe(true);                                      // 3 + 1 <= 5
    expect(l.reservieren(R({ tokens: 0 })).ok).toBe(true);                                      // 4 + 1 <= 5
    expect(l.reservieren(R({ tokens: 0 })).ok).toBe(false);                                     // 5 + 1 > 5
  });
  it("ungültige Angabe (0, negativ, NaN, Text) → Konstruktor wirft (fail closed)", () => {
    for (const v of [0, -1, NaN, Infinity, "5", null]) expect(() => neu({ betriebJeStundeIE: v }), String(v)).toThrow();
  });
  it("rückwärtslaufende Uhr sperrt wie bisher", () => {
    const { l, uhr } = neu({ betriebJeStundeIE: 7 });
    expect(l.reservieren(R()).ok).toBe(true);
    uhr.t -= 5000;
    expect(l.reservieren(R()).ok).toBe(false);
  });
});

/* ---- Gateway: Ausgabegrenze, Zeitkonfiguration, degradierter Modus ---- */

const AN = { prozess: () => "an", laufzeit: () => "an" };
let zaehler = 0;
function bauen(o = {}) {
  const uhr = { t: T0 };
  const anbieter = o.anbieter || erzeugeAttrappe({ modus: o.modus || "ok", skript: o.skript });
  const limits = new Limits({ jetzt: () => uhr.t, betriebKontingentIE: 700, gesamtTagesIE: 1000, gesamtHartTagesIE: 2000, ...(o.limitKonfig || {}) });
  const ereignisse = [];
  const gw = erzeugeGateway({
    anbieter, ladeBestand: () => bestand(), aliasSchluessel: () => SCHLUESSEL, versionen: VERSIONEN, limits,
    audit: erzeugeAudit({ senke: (e) => ereignisse.push(e), jetzt: () => uhr.t }),
    schalter: "schalter" in o ? o.schalter : AN, betriebAktiv: () => true, funktionenFreigegeben: ["F1", "F2"], faktenquelle: vollQuelle,
    zeiten: { stufeMs: 250, deadlineMs: 2000, maxWiederholungen: 0, minRestMs: 0, ...(o.zeiten || {}) }, schlafen: () => Promise.resolve(),
    zufallId: () => `Kostenauftrag${String(++zaehler).padStart(6, "0")}`,
    ...(o.gw || {}),
  });
  return { gw, anbieter, limits, ereignisse };
}
const anfrage = (funktion = "F2") => ({ funktion, eingabe: { zeitraum: ZR } });
const mitAusgabe = (tokens) => (nr, eingabe) => ({ ausgabe: { text: `Aus den Fakten: ${eingabe.paket.fakten[0].feld}.` }, nutzung: { eingabeToken: 100, ausgabeToken: tokens } });

describe("Ausgabegrenze (Token)", () => {
  it("Ausgabe über der Grenze → Rückfall KI_GROESSE, keine Teilausgabe, Einheiten bleiben verbraucht", async () => {
    const t = bauen({ modus: "skript", skript: mitAusgabe(5000), gw: { ausgabeTokenMax: 1000 } });
    const r = await t.gw.ausfuehren(S.leitung, anfrage());
    expect(r.status).toBe("rueckfall");
    expect(r.rueckfall.code).toBe("KI_GROESSE");
    expect(r.ergebnis).toBeUndefined();
    expect(pruefeAntwort(r).ok).toBe(true);
    expect(t.limits.stand("raum-a|0").ieMonat).toBeGreaterThan(0);   // Anbieter hat geliefert: B7
  });
  it("Ausgabe genau an der Grenze besteht", async () => {
    const t = bauen({ modus: "skript", skript: mitAusgabe(1000), gw: { ausgabeTokenMax: 1000 } });
    expect((await t.gw.ausfuehren(S.leitung, anfrage())).status).toBe("fertig");
  });
  it("Vorgabe vorhanden: eine absurd lange Ausgabe wird auch ohne Angabe verworfen", async () => {
    const t = bauen({ modus: "skript", skript: mitAusgabe(10_000_000) });
    expect((await t.gw.ausfuehren(S.leitung, anfrage())).rueckfall.code).toBe("KI_GROESSE");
  });
  it("ungültige Grenze (0, negativ, NaN, Text) → Gateway wird nicht gebaut", () => {
    for (const v of [0, -5, NaN, Infinity, "100"]) expect(() => bauen({ gw: { ausgabeTokenMax: v } }), String(v)).toThrow();
  });
});

describe("Zeitkonfiguration (Deadline) fail closed", () => {
  it("unbrauchbare Werte (NaN, 0, negativ, Text) für Deadline oder Stufenfrist → Gateway wird nicht gebaut", () => {
    for (const z of [{ deadlineMs: NaN }, { deadlineMs: 0 }, { deadlineMs: -1 }, { stufeMs: "45000" }, { stufeMs: 0 }, { maxWiederholungen: -1 }, { minRestMs: NaN }])
      expect(() => bauen({ zeiten: z }), JSON.stringify(z)).toThrow();
  });
  it("die Stufenfrist darf die globale Deadline nicht übersteigen (sonst wäre die Deadline wirkungslos)", () => {
    expect(() => bauen({ zeiten: { stufeMs: 5000, deadlineMs: 2000 } })).toThrow();
  });
});

describe("Degradierter Modus bei Limit-Überschreitung", () => {
  const überschritten = { limitKonfig: { betriebKontingentIE: 100, gesamtTagesIE: 1000, gesamtHartTagesIE: 2000 } };
  it("ausfuehren wirft weiterhin (bisheriger Vertrag)", async () => {
    const t = bauen({ ...überschritten, limitKonfig: { ...überschritten.limitKonfig, personJeStunde: { leitung: 1 } } });
    await t.gw.ausfuehren(S.leitung, anfrage());
    await expect(t.gw.ausfuehren(S.leitung, anfrage("F1"))).rejects.toMatchObject({ code: "KI_LIMIT" });
  });
  it("ausfuehrenDegradiert: Limit → Rückfall-Antwort statt Ausnahme, schema-gültig, Anbieter nicht erneut gerufen", async () => {
    const t = bauen({ limitKonfig: { betriebKontingentIE: 700, gesamtTagesIE: 1000, gesamtHartTagesIE: 2000, personJeStunde: { leitung: 1 } } });
    await t.gw.ausfuehren(S.leitung, anfrage());
    const vorher = t.anbieter.aufrufe.length;
    const r = await t.gw.ausfuehrenDegradiert(S.leitung, anfrage("F1"));
    expect(r).toMatchObject({ status: "rueckfall", rueckfall: { code: "KI_LIMIT" }, kennzeichnung: { geprueft: false, veroeffentlicht: false } });
    expect(r.rueckfall.text.length).toBeGreaterThan(10);
    expect(r.ergebnis).toBeUndefined();
    expect(pruefeAntwort(r).ok).toBe(true);
    expect(Object.isFrozen(r)).toBe(true);
    expect(t.anbieter.aufrufe.length).toBe(vorher);
  });
  it("Kontingent erschöpft → Rückfall KI_KONTINGENT", async () => {
    const t = bauen({ limitKonfig: { betriebKontingentIE: 4, gesamtTagesIE: 1000, gesamtHartTagesIE: 2000 } });   // Tageslimit 1 IE
    await t.gw.ausfuehren(S.leitung, anfrage());
    const r = await t.gw.ausfuehrenDegradiert(S.planer, anfrage("F1"));
    expect(r.rueckfall.code).toBe("KI_KONTINGENT");
  });
  it("Erfolg bleibt Erfolg", async () => {
    const t = bauen({});
    expect((await t.gw.ausfuehrenDegradiert(S.leitung, anfrage())).status).toBe("fertig");
  });
  it("Notschalter und Pausierung werden NICHT zum Rückfall umgedeutet (eigene Zustände), Fehler der Anfrage auch nicht", async () => {
    const aus = bauen({ schalter: { prozess: () => "aus", laufzeit: () => "an" } });
    await expect(aus.gw.ausfuehrenDegradiert(S.leitung, anfrage())).rejects.toMatchObject({ code: "KI_AUS" });
    expect(aus.anbieter.aufrufe.length).toBe(0);
    const t = bauen({});
    await expect(t.gw.ausfuehrenDegradiert(S.leitung, { funktion: "gibtEsNicht" })).rejects.toBeTruthy();
  });
  it("kein Personenbezug im Rückfalltext oder im Protokoll", async () => {
    const t = bauen({ limitKonfig: { betriebKontingentIE: 700, gesamtTagesIE: 1000, gesamtHartTagesIE: 2000, personJeStunde: { leitung: 1 } } });
    await t.gw.ausfuehren(S.leitung, anfrage());
    const r = await t.gw.ausfuehrenDegradiert(S.leitung, anfrage("F1"));
    expect(JSON.stringify([r, t.ereignisse])).not.toMatch(/Weberknecht|Brandt|Sonnenhof/);
  });
});
