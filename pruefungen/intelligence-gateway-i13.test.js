/* ==========================================================================
   WP-I13 — GATEWAY, ATTRAPPE, ROUTER, PRÜFER: BEDINGUNGEN AUS WP-I11
   (vor jedem Anbieteranschluss, schon für die Attrappe)

   1  modellOrt nur aus Serverkonfiguration (Model Registry, nie Anfrage)
   2  getrennte Schlüssel (Alias, MAC der Karte) mit Rotation — nur Platzhalter,
      in den Tests zur Laufzeit zufällig erzeugt, kein Schlüssel im Repo
   3  Rückübersetzung nur nach Schemaprüfung (Kontrolle der Kette)
   4  Ausgabe durch die Leck-Prüfung (Kontrolle der Kette)
   5  F7A gesperrt — auch ohne Fremdtext
   6  Namenspolitik vor Freitext-Funktionen (F5, F6, F7A, F9, F16)

   Kein Netz, kein echter Anbieter, keine Umgebung: alles gegen die Attrappe.
   Die neuen Module werden dynamisch geladen, damit der Stand vor der
   Umsetzung je Fall rot ist (statt eines einzigen Ladefehlers).
   ========================================================================== */

import { describe, it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import { inspect } from "node:util";
import { erzeugeGateway } from "../server/lib/intelligence/gateway/gateway.mjs";
import { erzeugeAttrappe } from "../server/lib/intelligence/gateway/attrappe.mjs";
import { Limits } from "../server/lib/intelligence/gateway/limits.mjs";
import { erzeugeAudit } from "../server/lib/intelligence/gateway/audit.mjs";
import { AliasKarte } from "../server/lib/intelligence/alias.mjs";
import { SCHLUESSEL, VERSIONEN, ZR, bestand, S, vollQuelle, fold } from "./intelligence-gateway-fixture.mjs";

const GW = "../server/lib/intelligence/gateway/";
const laden = (n) => import(`${GW}${n}.mjs`);
const AN = { prozess: () => "an", laufzeit: () => "an" };
const code = async (p) => { try { await p; return "ok"; } catch (e) { return e.code || String(e); } };
const codeSync = (f) => { try { f(); return "ok"; } catch (e) { return e.code || String(e); } };
const anfrage = (funktion = "F2", eingabe = { zeitraum: ZR }) => ({ funktion, eingabe });
const hex = (n = 32) => randomBytes(n).toString("hex");

/** Gültige Namenspolitik (Entscheidungsdatensatz, keine Personendaten). */
const POLITIK = Object.freeze({ version: "np-1", sperrliste: "betrieb", kurznamen: "sperren", doppelgaenger: "sperren",
  fremdeSchrift: "sperren", freigabe: "produktverantwortung" });

let nr = 0;
function bauen(o = {}) {
  const ereignisse = [];
  const anbieter = o.anbieter || erzeugeAttrappe({ modus: o.modus || "ok", skript: o.skript });
  const limits = new Limits({ betriebKontingentIE: 700, gesamtTagesIE: 1000, gesamtHartTagesIE: 2000 });
  const extra = {};
  if ("namenspolitik" in o) extra.namenspolitik = o.namenspolitik;
  if ("registry" in o) extra.registry = o.registry;
  const gw = erzeugeGateway({
    anbieter, ladeBestand: () => bestand(), aliasSchluessel: o.aliasSchluessel || (() => SCHLUESSEL), versionen: VERSIONEN, limits,
    audit: erzeugeAudit({ senke: (e) => ereignisse.push(e) }), schalter: AN, betriebAktiv: () => true,
    funktionenFreigegeben: o.freigegeben || ["F1", "F2", "F3", "F5", "F6", "F7A", "F9", "F16"], faktenquelle: vollQuelle,
    hoechsteStufe: o.hoechste, zeiten: { stufeMs: 250, deadlineMs: 2000, maxWiederholungen: 0, minRestMs: 0 },
    schlafen: () => Promise.resolve(), zufallId: o.zufallId || (() => `Testauftrag${String(++nr).padStart(6, "0")}`), ...extra,
  });
  return { gw, anbieter, limits, ereignisse };
}

describe("Bedingung 5: F7A bleibt gesperrt — auch ohne Fremdtext und auch, wenn sie freigegeben wäre", () => {
  it("F7A freigegeben, ohne Fremdtext, mit gültiger Namenspolitik → KI_FUNKTION, kein Anbieteraufruf, kein Verbrauch", async () => {
    const t = bauen({ namenspolitik: POLITIK, freigegeben: ["F7A"] });
    expect(await code(t.gw.ausfuehren(S.leitung, anfrage("F7A")))).toBe("KI_FUNKTION");
    expect(t.anbieter.aufrufe.length).toBe(0);
    expect(t.limits.stand("raum-a|0").ieMonat).toBe(0);
  });
  it("Kontrolle: F7A mit Fremdtext bleibt KI_FUNKTION", async () => {
    const t = bauen({ namenspolitik: POLITIK });
    expect(await code(t.gw.ausfuehren(S.leitung, anfrage("F7A", { fremdtext: ["Spalte Früh"] })))).toBe("KI_FUNKTION");
    expect(t.anbieter.aufrufe.length).toBe(0);
  });
});

describe("Bedingung 6: Namenspolitik vor Freitext-Funktionen", () => {
  it("ohne Namenspolitik: F5 mit harmlosem Fremdtext → KI_FUNKTION, Anbieter nie aufgerufen, kein Limit gebucht", async () => {
    const t = bauen();
    expect(await code(t.gw.ausfuehren(S.leitung, anfrage("F5", { fremdtext: ["Entwurf einer kurzen Nachricht bitte"] })))).toBe("KI_FUNKTION");
    expect(t.anbieter.aufrufe.length).toBe(0);
    expect(t.limits.stand("raum-a|0").ieMonat).toBe(0);
    expect(t.ereignisse.some((e) => e.art === "ki.abgelehnt" && e.grund === "namenspolitik")).toBe(true);
  });
  it("ohne Namenspolitik: jede Freitext-Funktion (F5, F6, F9, F16) wird vor dem Anbieter verweigert", async () => {
    const t = bauen();
    for (const [f, s] of [["F5", S.leitung], ["F6", S.leitung], ["F9", S.mitarbeiter], ["F16", S.planer]]) {
      expect(await code(t.gw.ausfuehren(s, anfrage(f, { fremdtext: ["Bitte kurz erklären"] }))), f).toBe("KI_FUNKTION");
    }
    expect(t.anbieter.aufrufe.length).toBe(0);
  });
  it("mit gültiger Namenspolitik: F5 läuft gegen die Attrappe bis „fertig“", async () => {
    const t = bauen({ namenspolitik: POLITIK });
    const r = await t.gw.ausfuehren(S.leitung, anfrage("F5", { fremdtext: ["Entwurf einer kurzen Nachricht bitte"] }));
    expect(r.status).toBe("fertig");
    expect(t.anbieter.aufrufe.length).toBe(1);
  });
  it("Kontrolle: Funktionen ohne Freitext (F2) brauchen keine Namenspolitik", async () => {
    const t = bauen();
    expect((await t.gw.ausfuehren(S.leitung, anfrage("F2"))).status).toBe("fertig");
  });
  it("ungültige Namenspolitik → das Gateway startet nicht (KI_INTERN), statt still zu sperren oder zu öffnen", () => {
    const fälle = [null, "np-1", [], {}, { ...POLITIK, version: "" }, { ...POLITIK, kurznamen: "erlauben" }, { ...POLITIK, sperrliste: "keine" },
      { ...POLITIK, doppelgaenger: "aus" }, { ...POLITIK, fremdeSchrift: "erlauben" }, { ...POLITIK, freigabe: "Anna Weberknecht" },
      { ...POLITIK, zusatz: 1 }, JSON.parse('{"__proto__":{"kurznamen":"sperren"},"version":"np-1"}'),
      (() => { const { freigabe, ...r } = POLITIK; void freigabe; return r; })(), Object.create(POLITIK)];
    for (const p of fälle) expect(codeSync(() => bauen({ namenspolitik: p })), JSON.stringify(p)).toBe("KI_INTERN");
  });
  it("die Prüffunktion ist exportiert, gibt eine eingefrorene Kopie zurück und ist unabhängig vom Eingabeobjekt", async () => {
    const { namenspolitikPruefen } = await laden("namenspolitik");
    const ein = { ...POLITIK };
    const p = namenspolitikPruefen(ein);
    expect(p).toEqual(POLITIK);
    expect(Object.isFrozen(p)).toBe(true);
    ein.kurznamen = "erlauben";
    expect(p.kurznamen).toBe("sperren");
  });
});

describe("Bedingung 1: Model Registry — Modell und modellOrt nur aus der Serverkonfiguration", () => {
  const KONF = () => ({ version: "rr-1", modellOrt: "extern", stufen: { 1: "platzhalter-stufe-1", 2: "platzhalter-stufe-2", 3: "platzhalter-stufe-3" } });
  it("gültige Registry: Modell je Stufe, höchste Stufe, eingefroren; unbekannte Stufe → null", async () => {
    const { erzeugeRegistry } = await laden("registry");
    const r = erzeugeRegistry(KONF());
    expect(r.version).toBe("rr-1");
    expect(r.modellOrt).toBe("extern");
    expect(r.hoechsteStufe).toBe(3);
    expect([1, 2, 3].map((s) => r.modellFuer(s))).toEqual(["platzhalter-stufe-1", "platzhalter-stufe-2", "platzhalter-stufe-3"]);
    for (const s of [0, 4, "1", null, undefined, 1.5, "__proto__"]) expect(r.modellFuer(s), String(s)).toBeNull();
    expect(Object.isFrozen(r)).toBe(true);
    const k = KONF(); const r2 = erzeugeRegistry(k); k.stufen[1] = "anders";
    expect(r2.modellFuer(1)).toBe("platzhalter-stufe-1");
  });
  it("Registry mit nur Stufe 1 (z. B. Opus-Stufe abgeschaltet): höchste Stufe 1", async () => {
    const { erzeugeRegistry } = await laden("registry");
    expect(erzeugeRegistry({ version: "rr-2", modellOrt: "lokal", stufen: { 1: "m1" } }).hoechsteStufe).toBe(1);
  });
  it("ungültige Konfiguration → KI_INTERN (Ort, Lücken, Adressen statt Kennungen, fremde Schlüssel)", async () => {
    const { erzeugeRegistry } = await laden("registry");
    const k = KONF;
    const fälle = [undefined, null, "x", { ...k(), modellOrt: "irgendwo" }, { ...k(), modellOrt: undefined }, { ...k(), version: "" },
      { ...k(), stufen: {} }, { ...k(), stufen: { 1: "a", 3: "c" } }, { ...k(), stufen: { 2: "b" } }, { ...k(), stufen: { 1: "a", 4: "d" } },
      { ...k(), stufen: { 1: "https://modell.example/v1" } }, { ...k(), stufen: { 1: "modell/pfad" } }, { ...k(), stufen: { 1: "host:443" } },
      { ...k(), stufen: { 1: "nutzer@host" } }, { ...k(), stufen: { 1: "Mit Leerzeichen" } }, { ...k(), stufen: { 1: "" } }, { ...k(), stufen: { 1: 7 } },
      { ...k(), stufen: { 1: "a".repeat(65) } }, { ...k(), zusatz: true }, { ...k(), stufen: JSON.parse('{"1":"a","__proto__":{"2":"b"}}') }];
    for (const f of fälle) expect(codeSync(() => erzeugeRegistry(f)), JSON.stringify(f)).toBe("KI_INTERN");
  });
  it("Gateway: Registry-Ort ≠ Adapter-Ort → startet nicht (KI_INTERN); nur Ergebnisse von erzeugeRegistry werden angenommen", async () => {
    const { erzeugeRegistry } = await laden("registry");
    expect(codeSync(() => bauen({ registry: erzeugeRegistry({ ...KONF(), modellOrt: "lokal" }) }))).toBe("KI_INTERN");
    expect(codeSync(() => bauen({ registry: { version: "rr-1", modellOrt: "extern", hoechsteStufe: 3, modellFuer: () => "x" } }))).toBe("KI_INTERN");
    expect(codeSync(() => bauen({ registry: erzeugeRegistry(KONF()) }))).toBe("ok");
  });
  it("Gateway: die Registry begrenzt die Stufenkette (nur Stufe 1 konfiguriert → genau ein Anbieteraufruf bei Prüferfehler)", async () => {
    const { erzeugeRegistry } = await laden("registry");
    const t = bauen({ modus: "falsche_zahl", registry: erzeugeRegistry({ version: "rr-3", modellOrt: "extern", stufen: { 1: "m1" } }) });
    const r = await t.gw.ausfuehren(S.leitung, anfrage("F2"));
    expect(r.status).toBe("rueckfall");
    expect(t.anbieter.aufrufe.map((e) => e.stufe)).toEqual([1]);
  });
  it("Kontrolle: die Anfrage kann weder Modell noch Ort noch Stufe setzen (KI_EINGABE, kein Anbieteraufruf)", async () => {
    const t = bauen();
    for (const zusatz of [{ modell: "x" }, { modellOrt: "lokal" }, { stufe: 3 }]) {
      expect(await code(t.gw.ausfuehren(S.leitung, { ...anfrage("F2"), ...zusatz })), JSON.stringify(zusatz)).toBe("KI_EINGABE");
    }
    expect(t.anbieter.aufrufe.length).toBe(0);
  });
});

describe("Bedingung 2: getrennte Schlüssel (Alias, MAC der Karte) mit Rotation", () => {
  const namen = async () => (await laden("schluessel")).SCHLUESSEL_NAMEN;
  const env = async (w) => { const n = await namen(); const e = {}; for (const [k, v] of Object.entries(w)) if (v !== undefined) e[n[k]] = v; return e; };

  it("liest die Schlüssel nur aus dem übergebenen env; liefert Kopien (≥ 32 Byte)", async () => {
    const { erzeugeSchluesselbund } = await laden("schluessel");
    const a = hex(); const m = hex();
    const b = erzeugeSchluesselbund({ env: await env({ alias: a, mac: m }) });
    const k1 = b.aliasSchluessel();
    expect(Buffer.from(k1).toString("hex")).toBe(a);
    expect(Buffer.from(b.macSchluessel()).toString("hex")).toBe(m);
    k1.fill(0);
    expect(Buffer.from(b.aliasSchluessel()).toString("hex")).toBe(a);
  });
  it("fehlend, zu kurz, kein Hex, Platzhalter (gleiche Bytes, kurze Wiederholung) → KI_INTERN", async () => {
    const { erzeugeSchluesselbund } = await laden("schluessel");
    const m = hex();
    const fälle = [{ mac: m }, { alias: hex(), mac: undefined }, { alias: hex(16), mac: m }, { alias: "zz".repeat(32), mac: m },
      { alias: "00".repeat(32), mac: m }, { alias: "deadbeef".repeat(8), mac: m }, { alias: "0123456789abcdef".repeat(4), mac: m },
      { alias: hex() + "0", mac: m }, { alias: 12345, mac: m }];
    for (const f of fälle) expect(await code((async () => erzeugeSchluesselbund({ env: await env(f) }))()), JSON.stringify(Object.keys(f))).toBe("KI_INTERN");
  });
  it("getrennt: Alias = MAC, MAC = vorheriger MAC, Alias = vorheriger MAC → KI_INTERN", async () => {
    const { erzeugeSchluesselbund } = await laden("schluessel");
    const a = hex(); const m = hex();
    for (const f of [{ alias: a, mac: a }, { alias: a, mac: m, macVorher: m }, { alias: a, mac: m, macVorher: a }, { alias: a.toUpperCase(), mac: a }]) {
      expect(await code((async () => erzeugeSchluesselbund({ env: await env(f) }))()), JSON.stringify(Object.keys(f))).toBe("KI_INTERN");
    }
  });
  it("Prototypkette wird nicht gelesen (Prototype Pollution)", async () => {
    const { erzeugeSchluesselbund } = await laden("schluessel");
    const geerbt = Object.create(await env({ alias: hex(), mac: hex() }));
    expect(codeSync(() => erzeugeSchluesselbund({ env: geerbt }))).toBe("KI_INTERN");
  });
  it("kein Schlüssel in JSON, String, inspect, Fehlermeldung oder stand()", async () => {
    const { erzeugeSchluesselbund } = await laden("schluessel");
    const a = hex(); const m = hex(); const v = hex();
    const b = erzeugeSchluesselbund({ env: await env({ alias: a, mac: m, macVorher: v }) });
    const sichtbar = [JSON.stringify(b), String(b), inspect(b, { showHidden: true, depth: 5 }), JSON.stringify(b.stand())].join("|").toLowerCase();
    for (const k of [a, m, v]) for (let i = 0; i + 16 <= 64; i += 8) expect(sichtbar).not.toContain(k.slice(i, i + 16));
    try { erzeugeSchluesselbund({ env: await env({ alias: a, mac: a }) }); } catch (e) { expect(String(e.message).toLowerCase()).not.toContain(a.slice(0, 16)); }
    const st = b.stand();
    expect(st.alias.kennung).toMatch(/^[0-9a-f]{12}$/);
    expect(st.mac.kennung).toMatch(/^[0-9a-f]{12}$/);
    expect(st.alias.kennung).not.toBe(st.mac.kennung);
    expect(st.mac.vorher).toBe(true);
    expect(st.alias.vorher).toBe(false);
  });
  it("Rotation: eine mit dem alten MAC-Schlüssel abgelegte Karte wird mit (neu, vorher) geladen und mit dem neuen neu abgelegt; ohne vorher nicht mehr", async () => {
    const { erzeugeSchluesselbund } = await laden("schluessel");
    const a = hex(); const alt = hex(); const neu = hex();
    const b1 = erzeugeSchluesselbund({ env: await env({ alias: a, mac: alt }) });
    const karte = new AliasKarte({ schluessel: b1.aliasSchluessel(), raum: "raum-a", betriebId: "m1", betriebIndex: 0, kontext: "k1" });
    const p = karte.alias("person", "a1");
    const abgelegt = b1.karteAblegen(karte);
    const b2 = erzeugeSchluesselbund({ env: await env({ alias: a, mac: neu, macVorher: alt }) });
    const g = b2.karteLaden(abgelegt);
    expect(g.umschluesseln).toBe(true);
    expect(g.karte.aufloesenIntern(p)).toEqual({ typ: "person", id: "a1" });
    const neuAbgelegt = b2.karteAblegen(g.karte);
    expect(neuAbgelegt.mac).not.toBe(abgelegt.mac);
    const b3 = erzeugeSchluesselbund({ env: await env({ alias: a, mac: neu }) });
    expect(b3.karteLaden(neuAbgelegt).umschluesseln).toBe(false);
    expect(codeSync(() => b3.karteLaden(abgelegt))).toBe("KI_NICHT_GEFUNDEN");
    expect(codeSync(() => b3.karteLaden({ ...neuAbgelegt, mac: "0".repeat(64) }))).toBe("KI_NICHT_GEFUNDEN");
  });
  it("das Gateway läuft mit dem Alias-Schlüssel aus dem Schlüsselbund (gegen die Attrappe)", async () => {
    const { erzeugeSchluesselbund } = await laden("schluessel");
    const b = erzeugeSchluesselbund({ env: await env({ alias: hex(), mac: hex() }) });
    const t = bauen({ aliasSchluessel: b.aliasSchluessel });
    expect((await t.gw.ausfuehren(S.leitung, anfrage("F2"))).status).toBe("fertig");
  });
});

describe("Kette gegen die Attrappe (deterministisch; Bedingungen 3 und 4)", () => {
  const lauf = async (o) => {
    const t = bauen({ namenspolitik: POLITIK, ...o });
    const r = await t.gw.ausfuehren(S.leitung, anfrage("F2"));
    return { r, stufen: t.anbieter.aufrufe.map((e) => e.stufe), t };
  };
  it("ok → fertig, gekennzeichnet als Entwurf, nicht veröffentlicht; gleicher Auftragskontext → gleiche Antwort", async () => {
    const fest = () => "Testauftrag-fest01";
    const a = await lauf({ zufallId: fest }); const b = await lauf({ zufallId: fest });
    expect(a.r.status).toBe("fertig");
    expect(a.r.kennzeichnung).toEqual({ kiGestuetzt: true, entwurf: true, veroeffentlicht: false, geprueft: true });
    expect(a.r).toEqual(b.r);
  });
  it("fehler → Rückfall KI_ANBIETER; Zeitüberschreitung → Rückfall KI_ZEIT (keine Ausnahme nach außen)", async () => {
    expect((await lauf({ modus: "fehler" })).r.rueckfall.code).toBe("KI_ANBIETER");
    expect((await lauf({ modus: "zeitueberschreitung" })).r.rueckfall.code).toBe("KI_ZEIT");
  });
  it("falsche Zahl → Prüfer verwirft auf jeder Stufe, Eskalation nur aufwärts 1→2→3, dann Rückfall KI_PRUEFER", async () => {
    const { r, stufen } = await lauf({ modus: "falsche_zahl" });
    expect(r.status).toBe("rueckfall");
    expect(r.rueckfall.code).toBe("KI_PRUEFER");
    expect(stufen).toEqual([1, 2, 3]);
    expect(JSON.stringify(r)).not.toContain("99999");
  });
  it("Leck in der Ausgabe (Klarname) → fail closed: Rückfall, kein Name in Antwort oder Protokoll", async () => {
    const { r, t } = await lauf({ modus: "skript", skript: () => ({ text: "Anna Weberknecht übernimmt den Dienst." }) });
    expect(r.status).toBe("rueckfall");
    const alles = fold(JSON.stringify(r) + JSON.stringify(t.ereignisse));
    for (const n of ["anna", "weberknecht"]) expect(alles).not.toContain(n);
  });
  it("erfundener Alias → kein Rückübersetzen ohne bestandene Prüfung (Rückfall KI_PRUEFER)", async () => {
    const { r } = await lauf({ modus: "erfundener_alias" });
    expect(r.status).toBe("rueckfall");
    expect(r.rueckfall.code).toBe("KI_PRUEFER");
  });
  it("Schreibbefehl in der Ausgabe (fremdes Feld) → verworfen", async () => {
    const { r } = await lauf({ modus: "fremdes_feld" });
    expect(r.status === "rueckfall" || !("plan" in (r.ergebnis || {}))).toBe(true);
    expect(JSON.stringify(r)).not.toContain("schreibe");
  });
});
