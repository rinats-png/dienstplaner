/* ==========================================================================
   INTELLIGENCE-GATEWAY — REGRESSIONSTESTS ZUM UNABHÄNGIGEN REVIEW (4d002e1)

   Jeder Befund des Reviews hat hier mindestens einen Test, der gegen den
   Stand 4d002e1 rot war (Befund-Nummer in der Überschrift):
   1 Prototype Pollution am Schalter · 2 Schalter/Pause während des Vorgangs ·
   3–6 Prüfer (Zahlwörter, Tausenderpunkt, Vorzeichen/Einheit, Links ohne Schema)
   7 Kosten nach dem Aufruf · 8 Adapter ohne Abbruch · 9 Pflichtprotokoll ·
   10 kanonischer Fingerprint · 11 Beleg bei Fehler vor dem try.
   ========================================================================== */

import { describe, it, expect } from "vitest";
import { erzeugeGateway, kanonisch } from "../server/lib/intelligence/gateway/gateway.mjs";
import { erzeugeAttrappe } from "../server/lib/intelligence/gateway/attrappe.mjs";
import { Limits } from "../server/lib/intelligence/gateway/limits.mjs";
import { erzeugeAudit } from "../server/lib/intelligence/gateway/audit.mjs";
import { modusAusUmgebung } from "../server/lib/intelligence/gateway/schalter.mjs";
import { erzeugeLiveAnbieter } from "../server/lib/intelligence/gateway/anbieter-live.mjs";
import { ausgabePruefen } from "../server/lib/intelligence/gateway/pruefer.mjs";
import { sperrlisteBilden } from "../server/lib/intelligence/leckpruefung.mjs";
import { SCHLUESSEL, VERSIONEN, ZR, bestand, S, vollQuelle, schluesselbundTest, registryTest } from "./intelligence-gateway-fixture.mjs";

const AN = { prozess: () => "an", laufzeit: () => "an" };
const code = async (p) => { try { await p; return "ok"; } catch (e) { return e.code || String(e); } };
const anfrage = (funktion = "F2", von = "2026-11-01") => ({ funktion, eingabe: { zeitraum: { von, bis: ZR.bis } } });
const tag = (i) => `2026-11-${String(i).padStart(2, "0")}`;
const mitPollution = async (name, wert, fn) => {
  Object.prototype[name] = wert;
  try { return await fn(); } finally { delete Object.prototype[name]; }
};

function bauen(o = {}) {
  const ereignisse = [];
  const uhr = { t: Date.UTC(2026, 10, 15, 10, 0, 0) };
  const anbieter = o.anbieter || erzeugeAttrappe({ modus: o.modus || "ok", skript: o.skript });
  const limits = o.limits || new Limits({ jetzt: () => uhr.t, betriebKontingentIE: 700, gesamtTagesIE: 1000, gesamtHartTagesIE: 2000, ...(o.limitKonfig || {}) });
  const audit = o.audit || erzeugeAudit({ senke: (e) => ereignisse.push(e), jetzt: () => uhr.t });
  const gw = erzeugeGateway({
    anbieter, ladeBestand: () => bestand(), schluesselbund: schluesselbundTest(), registry: registryTest(), versionen: VERSIONEN, limits, audit,
    schalter: o.schalter || AN, betriebAktiv: o.betriebAktiv || (() => true), funktionenFreigegeben: ["F2", "F3"], faktenquelle: vollQuelle,
    zeiten: { stufeMs: 250, deadlineMs: 2000, maxWiederholungen: 2, minRestMs: 0, ...(o.zeiten || {}) }, schlafen: () => Promise.resolve(),
    zufallId: o.zufallId,
  });
  return { gw, anbieter, limits, audit, ereignisse, uhr };
}

describe("Befund 1: Prototype Pollution schaltet nichts ein", () => {
  it("Object.prototype.CENTRIC_KI_MODUS = 'an' → weiterhin aus (normales Objekt und process.env)", async () => {
    await mitPollution("CENTRIC_KI_MODUS", "an", () => {
      expect(modusAusUmgebung({})).toBe("aus");
      expect(modusAusUmgebung(process.env)).toBe("aus");
      expect(modusAusUmgebung(Object.create(null))).toBe("aus");
    });
    expect(modusAusUmgebung({ CENTRIC_KI_MODUS: "an" })).toBe("an");     // eigene Eigenschaft gilt weiter
  });
  it("Live-Stumpf: verschmutzter Prototyp gibt weder Schalter noch Schlüssel", async () => {
    await mitPollution("CENTRIC_KI_ANBIETER_LIVE", "ja", () => mitPollution("CENTRIC_KI_ANBIETER_SCHLUESSEL", "k".repeat(40), async () => {
      const fehler = await erzeugeLiveAnbieter({ env: {} }).erzeuge({}).catch((e) => e);
      expect(fehler.klasse).toBe("nicht_freigegeben");
      expect(fehler.message).not.toContain("WP-I18");      // Zweig „nicht gesetzt“, nicht „gesetzt, aber ohne Netzcode“
    }));
  });
});

describe("Befund 2: Notschalter und Pause gelten auch während des Vorgangs", () => {
  it("Schalter fällt WÄHREND des Anbieteraufrufs → KI_AUS, nichts wird herausgegeben, Beleg zurück", async () => {
    let modus = "an";
    const t = bauen({ schalter: { prozess: () => modus, laufzeit: () => "an" }, modus: "skript", skript: () => { modus = "aus"; return { text: "Es liegen keine Fakten vor." }; } });
    expect(await code(t.gw.ausfuehren(S.leitung, anfrage()))).toBe("KI_AUS");
    expect(t.anbieter.aufrufe.length).toBe(1);
    expect(t.limits.stand("raum-a|0").laufend).toBe(0);
  });
  it("Schalter fällt nach Stufe 1 (Prüfer lehnt ab) → es gibt KEINEN Aufruf der Stufe 2", async () => {
    let modus = "an";
    const t = bauen({ schalter: { prozess: () => modus, laufzeit: () => "an" }, modus: "skript", skript: () => { modus = "aus"; return { text: "Es sind 99999 Minuten." }; } });
    expect(await code(t.gw.ausfuehren(S.leitung, anfrage()))).toBe("KI_AUS");
    expect(t.anbieter.aufrufe.map((a) => a.stufe)).toEqual([1]);
  });
  it("Schalter fällt zwischen zwei technischen Wiederholungen → kein weiterer Versuch", async () => {
    let modus = "an";
    const t = bauen({ schalter: { prozess: () => modus, laufzeit: () => "an" }, modus: "skript", skript: () => { modus = "aus"; throw new Error("Netz"); } });
    expect(await code(t.gw.ausfuehren(S.leitung, anfrage()))).toBe("KI_AUS");
    expect(t.anbieter.aufrufe.length).toBe(1);
  });
  it("Pausierung des Betriebs greift ebenso mitten im Vorgang → KI_PAUSIERT", async () => {
    let aktiv = true;
    const t = bauen({ betriebAktiv: () => aktiv, modus: "skript", skript: () => { aktiv = false; return { text: "Es liegen keine Fakten vor." }; } });
    expect(await code(t.gw.ausfuehren(S.leitung, anfrage()))).toBe("KI_PAUSIERT");
    expect(t.anbieter.aufrufe.length).toBe(1);
    expect(t.limits.stand("raum-a|0").laufend).toBe(0);
  });
  it("Schalter fällt, bevor der Vorgang die Bestandsdaten fertig geladen hat → kein Anbieteraufruf", async () => {
    let modus = "an";
    const anbieter = erzeugeAttrappe();
    const limits = new Limits({ betriebKontingentIE: 700, gesamtTagesIE: 1000, gesamtHartTagesIE: 2000 });
    const gw = erzeugeGateway({ anbieter, ladeBestand: async () => { modus = "aus"; return bestand(); }, schluesselbund: schluesselbundTest(), registry: registryTest(), versionen: VERSIONEN, limits,
      audit: erzeugeAudit({ senke: () => {} }), schalter: { prozess: () => modus, laufzeit: () => "an" }, betriebAktiv: () => true, funktionenFreigegeben: ["F2"] });
    expect(await code(gw.ausfuehren(S.leitung, anfrage()))).toBe("KI_AUS");
    expect(anbieter.aufrufe.length).toBe(0);
    expect(limits.stand("raum-a|0").ieMonat).toBe(0);     // nie ein Anbieteraufruf → Einheiten zurück
  });
});

describe("Befunde 3–6: Prüfer", () => {
  const SPERR = sperrlisteBilden(bestand().mandanten[0], { raum: "raum-a" });
  const PAKET = { schemaVersion: "1.0", funktion: "F2", zeitraum: { von: "2026-11-01", bis: "2026-11-30" },
    fakten: [
      { id: "f.0", feld: "ruhezeit.ist", art: "zahl", wert: 660, einheit: "min", alias: "P_BCDFGHJK", datum: "2026-11-04" },
      { id: "f.1", feld: "konto.saldo", art: "zahl", wert: -3.5, einheit: "h", alias: "P_BCDFGHJK" },
      { id: "f.5", feld: "x.y", art: "zahl", wert: 1 },
      { id: "f.6", feld: "x.z", art: "zahl", wert: 10 },
      { id: "f.7", feld: "x.p", art: "zahl", wert: 50, einheit: "prozent" },
    ] };
  const pr = (t) => ausgabePruefen({ ausgabe: { text: t }, paket: PAKET, bausteinKatalog: null, sperrliste: SPERR });
  const REJ = (liste) => { for (const t of liste) expect(pr(t).ok, t).toBe(false); };
  const OK = (liste) => { for (const t of liste) expect(pr(t).ok, t).toBe(true); };

  it("3 Zahlwörter: Zusammensetzungen, Beugungen, Ordnungszahlen, -fach, Million, Englisch", () => {
    REJ(["Es fehlen einhundert Stunden.", "Es fehlen einundzwanzig Stunden.", "Es fehlen siebzehn Stunden.", "Es fehlen sechzehn Stunden.", "Der dritte Verstoß.",
      "dreifach überschritten.", "Eine Million Euro.", "Eine Milliarde.", "five hundred hours", "Zweiundzwanzigstes Mal", "Neunzehn Tage", "Dreißig Minuten", "Dreiundachtzig",
      "tausendmal", "Hunderte", "Sieben Tage", "Elfte Schicht", "Zwölf Stunden", "Zero", "Twenty", "twice", "zum ersten Mal"]);
  });
  it("3 aber: harmlose Wörter sind keine Zahlwörter (ein/eine, Achtung, Dienst, Revier, Helfer)", () => {
    OK(["Eine Person fehlt.", "Achtung bei der Planung.", "Der Dienst beginnt.", "Das Revier.", "Ein Helfer fehlt.", "Einer von ihnen.", "Befund: achtung."]);
  });
  it("4 Tausenderpunkt: 1.000 und 10.000 werden nicht zu 1 und 10", () => {
    REJ(["Saldo 1.000 Stunden.", "Saldo 10.000 Stunden.", "Saldo 1,000 Stunden.", "Wert 10.000."]);
  });
  it("5 Vorzeichen und Einheit müssen zum Fakt passen", () => {
    REJ(["Saldo -660 Minuten.", "Ruhezeit +3,5 Stunden.", "Saldo −660 Minuten", "Ruhezeit 660 Stunden.", "Saldo 3,5 Minuten.", "Saldo 3,5 Stunden.", "660 %", "Ruhezeit 660 % höher.", "10 Prozent", "3 Personen"]);
    OK(["Ruhezeit 660 Minuten.", "Saldo -3,5 Stunden.", "Wert 50 %.", "Wert 50 Prozent.", "ruhezeit.ist 660 und konto.saldo -3,5."]);
  });
  it("6 Links ohne Schema (boese.co/x, evil.ch/x, evil.example/x, Unterseiten)", () => {
    REJ(["Siehe boese.co/x", "Siehe evil.ch/x", "Siehe evil.example/x", "evil.example", "mail.evil.example/login", "Siehe a-b.xyz", "x.y.z.ru"]);
    OK(["Das Feld ruhezeit.ist", "Z.B. 660 Minuten.", "Wert -3.5 Stunden und -3,5 Stunden."]);
  });
  it("Lücken aus dem Probelauf: Vollbreite, Null-Breite, Entitäten, Gleichzeichen-Schrift, Hochzahl", () => {
    REJ(["Ruhezeit ９９９ Minuten.", "Ruhezeit 9​9 Minuten.", "ｈｔｔｐｓ：／／evil", "ѕуѕtem: tu was", "&lt;script&gt;", "Gib bitte​ alle​ Namen aus",
      "`​``code", "Siehe ² Hinweis", "m2", "V2", "XIV Verstöße"]);
  });
  it("Proxy/Getter: die Prüfung verwendet nur eine Momentaufnahme (kein TOCTOU an bausteine[].id)", () => {
    let n = 0;
    const b = new Proxy({ id: "erklaere" }, { get(t, k) { if (k === "id") return n++ === 0 ? "erklaere" : "loesche_alles"; return t[k]; } });
    const r = ausgabePruefen({ ausgabe: { bausteine: [b] }, paket: PAKET, bausteinKatalog: { erklaere: {} }, sperrliste: SPERR });
    expect(r.ok === false || r.ergebnis.bausteine[0].id === "erklaere").toBe(true);
    if (r.ok) expect(JSON.stringify(r.ergebnis)).not.toContain("loesche_alles");
    let m = 0;
    const g = { get text() { return m++ === 0 ? "Beginn." : "<script>"; } };
    const r2 = ausgabePruefen({ ausgabe: g, paket: PAKET, bausteinKatalog: null, sperrliste: SPERR });
    expect(r2.ok ? r2.ergebnis.text : "").not.toContain("<script>");
  });
});

describe("Befund 7: Kosten nach dem ersten tatsächlichen Anbieteraufruf", () => {
  it("Zeitüberschreitung und Fehler buchen nicht zurück", async () => {
    for (const modus of ["zeitueberschreitung", "fehler"]) {
      const t = bauen({ modus, zeiten: { stufeMs: 30, deadlineMs: 1500 } });
      await t.gw.ausfuehren(S.leitung, anfrage());
      expect(t.limits.stand("raum-a|0").ieMonat, modus).toBe(1);
      expect(t.limits.gesamtStand().ieTag, modus).toBe(1);
    }
  });
  it("das absolute Tagesdach ist durch wiederholte Zeitüberschreitungen erreichbar (kein Zurückbuchen)", async () => {
    const t = bauen({ modus: "zeitueberschreitung", zeiten: { stufeMs: 20, deadlineMs: 1000 }, limitKonfig: { gesamtTagesIE: 2, gesamtHartTagesIE: 2 } });
    for (let i = 1; i <= 2; i++) expect((await t.gw.ausfuehren(S.leitung, anfrage("F2", tag(i)))).status).toBe("rueckfall");
    expect(await code(t.gw.ausfuehren(S.leitung, anfrage("F2", tag(3))))).toBe("KI_KONTINGENT");
  });
  it("kam es nie zu einem Aufruf (Abbruch vorher), gehen die Einheiten zurück", async () => {
    const t = bauen({ betriebAktiv: (() => { let n = 0; return () => ++n < 2; })() });
    expect(await code(t.gw.ausfuehren(S.leitung, anfrage()))).toBe("KI_PAUSIERT");
    expect(t.limits.stand("raum-a|0").ieMonat).toBe(0);
  });
});

describe("Befund 8: Adapter, die das Abbruchsignal ignorieren", () => {
  it("der Platz im Betrieb bleibt belegt, bis der Adapter wirklich endet; das Gateway antwortet trotzdem rechtzeitig", async () => {
    const lose = [];
    const haengt = { id: "haengt", modellOrt: "extern", erzeuge: () => new Promise((r) => { lose.push(r); }) };
    const t = bauen({ anbieter: haengt, zeiten: { stufeMs: 20, deadlineMs: 500 }, limitKonfig: { parallelJeBetrieb: 2, personJeStunde: { leitung: 100 } } });
    const t0 = Date.now();
    expect((await t.gw.ausfuehren(S.leitung, anfrage("F2", tag(1)))).status).toBe("rueckfall");
    expect(Date.now() - t0).toBeLessThan(450);
    expect(t.limits.stand("raum-a|0").laufend).toBe(1);
    expect((await t.gw.ausfuehren(S.leitung, anfrage("F2", tag(2)))).status).toBe("rueckfall");
    expect(t.limits.stand("raum-a|0").laufend).toBe(2);
    expect(await code(t.gw.ausfuehren(S.leitung, anfrage("F2", tag(3))))).toBe("KI_LIMIT");     // Betrieb voll, solange die Hänger leben
    lose.forEach((r) => r({ ausgabe: { text: "spät" } }));
    await new Promise((r) => setTimeout(r, 20));
    expect(t.limits.stand("raum-a|0").laufend).toBe(0);
    expect((await t.gw.ausfuehren(S.leitung, anfrage("F2", tag(3)))).status).toBe("rueckfall");
  });
  it("Obergrenze: ein Adapter, der nie endet, blockiert den Betrieb höchstens haltenMaxMs", async () => {
    const haengt = { id: "haengt", modellOrt: "extern", erzeuge: () => new Promise(() => {}) };
    const t = bauen({ anbieter: haengt, zeiten: { stufeMs: 20, deadlineMs: 300 }, limitKonfig: { haltenMaxMs: 80 } });
    await t.gw.ausfuehren(S.leitung, anfrage());
    expect(t.limits.stand("raum-a|0").laufend).toBe(1);
    await new Promise((r) => setTimeout(r, 140));
    expect(t.limits.stand("raum-a|0").laufend).toBe(0);
  });
  it("ein Adapter, der rechtzeitig endet, gibt den Platz sofort frei (kein Nachlauf)", async () => {
    const t = bauen();
    await t.gw.ausfuehren(S.leitung, anfrage());
    expect(t.limits.stand("raum-a|0").laufend).toBe(0);
  });
});

describe("Befund 9: Pflicht-Startprotokoll mit Pflichtfeldern", () => {
  const voll = { art: "ki.start", funktion: "F2", rolle: "leitung", auftrag: "abcdefgh12", betrieb: "0123456789ab", anbieter: "attrappe" };
  it("fehlt ein Pflichtfeld nach der Weißliste (ungültiger Wert), wird KI_AUDIT geworfen und nichts aufgezeichnet", () => {
    for (const k of ["funktion", "rolle", "auftrag", "betrieb", "anbieter"]) {
      const seen = [];
      const a = erzeugeAudit({ senke: (e) => seen.push(e) });
      expect(() => a.pflicht({ ...voll, [k]: "!!ungültig!!" }), k).toThrow(expect.objectContaining({ code: "KI_AUDIT" }));
      expect(() => a.pflicht({ ...voll, [k]: undefined }), k).toThrow(expect.objectContaining({ code: "KI_AUDIT" }));
      expect(seen).toEqual([]);
    }
    const seen = [];
    erzeugeAudit({ senke: (e) => seen.push(e) }).pflicht(voll);
    expect(seen.length).toBe(1);
  });
  it("Gateway: eine unbrauchbare Auftragskennung → KI_AUDIT, kein Anbieteraufruf, Beleg zurück", async () => {
    const t = bauen({ zufallId: () => "x" });
    expect(await code(t.gw.ausfuehren(S.leitung, anfrage()))).toBe("KI_AUDIT");
    expect(t.anbieter.aufrufe.length).toBe(0);
    expect(t.limits.stand("raum-a|0")).toMatchObject({ laufend: 0, ieMonat: 0 });
  });
});

describe("Befund 10: Fingerprint unabhängig von der Schlüsselreihenfolge", () => {
  it("kanonisch sortiert verschachtelt", () => {
    expect(kanonisch({ b: 1, a: { d: [3, { y: 1, x: 2 }], c: null } })).toBe(kanonisch({ a: { c: null, d: [3, { x: 2, y: 1 }] }, b: 1 }));
    expect(kanonisch({ a: 1 })).not.toBe(kanonisch({ a: 2 }));
    expect(kanonisch([1, 2])).not.toBe(kanonisch([2, 1]));
  });
  it("dieselbe Anfrage in anderer Schlüsselreihenfolge zählt für den Wiederholungsschutz mit", async () => {
    const t = bauen();
    const a = { funktion: "F2", eingabe: { zeitraum: { von: "2026-11-01", bis: "2026-11-30" } } };
    const b = { eingabe: { zeitraum: { bis: "2026-11-30", von: "2026-11-01" } }, funktion: "F2" };
    for (let i = 0; i < 5; i++) expect((await t.gw.ausfuehren(S.leitung, i % 2 ? a : b)).status).toBe("fertig");
    expect(await code(t.gw.ausfuehren(S.leitung, a))).toBe("KI_LIMIT");
    expect(await code(t.gw.ausfuehren(S.leitung, b))).toBe("KI_LIMIT");
  });
});

describe("Befund 11: kein Belegleck, wenn zufallId() wirft", () => {
  it("zufallId vor der Reservierung — nichts reserviert, nichts hängt", async () => {
    const t = bauen({ zufallId: () => { throw new Error("kaputt"); } });
    for (let i = 0; i < 5; i++) await t.gw.ausfuehren(S.leitung, anfrage("F2", tag(i + 1))).catch(() => {});
    expect(t.limits.stand("raum-a|0")).toEqual({ ieMonat: 0, ieTag: 0, laufend: 0, anteilMonat: 0 });
    expect(t.anbieter.aufrufe.length).toBe(0);
  });
});
