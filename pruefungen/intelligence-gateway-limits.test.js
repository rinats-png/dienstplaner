/* ==========================================================================
   INTELLIGENCE-GATEWAY — LIMITS, KONTINGENT, PROTOKOLL, SCHALTER, ROUTER (WP-I15)

   Einheiten gegen Spez. 7.2–7.5: Eingabegrenzen, IE je Größe, Tageslimit 25 %,
   Pause ab 110 %, Reserve 100–110 % nur für B und C, Klasse A bleibt,
   Notbremse, Rate je Person, Wiederholungsschutz, Parallelität, Zeitfehler,
   Rückgabe der Belege. Dazu Weißliste des Protokolls, Notschalter, Router.
   ========================================================================== */

import { describe, it, expect } from "vitest";
import { Limits, groesseAusTokens, IE_JE_GROESSE, EINGABE_GRENZEN } from "../server/lib/intelligence/gateway/limits.mjs";
import { erzeugeAudit, ereignisBereinigen, betriebKennung } from "../server/lib/intelligence/gateway/audit.mjs";
import { gatewayAn, schalterAn, modusAusUmgebung, SCHALTER_AUS } from "../server/lib/intelligence/gateway/schalter.mjs";
import { startstufe, stufenKette, STARTSTUFE } from "../server/lib/intelligence/gateway/router.mjs";
import { FUNKTIONEN_IDS } from "../server/lib/intelligence/schemas.mjs";

const T0 = Date.UTC(2026, 10, 15, 10, 0, 0);
const neu = (o = {}) => {
  const uhr = { t: T0 };
  const l = new Limits({ jetzt: () => uhr.t, betriebKontingentIE: 100, gesamtTagesIE: 1000, gesamtHartTagesIE: 2000, parallelJeBetrieb: 1000, ...o });
  return { l, uhr };
};
const R = (o = {}) => ({ betrieb: "b1", person: "p1", rolle: "planer", klasse: "B", tokens: 100, fingerprint: "f0", ...o });
let n = 0;
const frisch = (o = {}) => R({ fingerprint: `f${++n}`, ...o });

describe("Größen und Einheiten (Spez. 7.2/7.4)", () => {
  it("Grenzen 20.000 / 60.000 / 150.000 Token; darüber wird abgelehnt, nie gekürzt", () => {
    expect(EINGABE_GRENZEN).toEqual({ klein: 20000, mittel: 60000, gross: 150000 });
    expect(groesseAusTokens(0)).toBe("klein");
    expect(groesseAusTokens(20000)).toBe("klein");
    expect(groesseAusTokens(20001)).toBe("mittel");
    expect(groesseAusTokens(60001)).toBe("gross");
    expect(groesseAusTokens(150000)).toBe("gross");
    for (const x of [150001, -1, NaN, Infinity]) expect(groesseAusTokens(x), String(x)).toBeNull();
    expect(IE_JE_GROESSE).toEqual({ klein: 1, mittel: 3, gross: 7 });
  });
  it("zu große Eingabe → KI_GROESSE, nichts gebucht", () => {
    const { l } = neu();
    expect(l.reservieren(frisch({ tokens: 200000 }))).toMatchObject({ ok: false, code: "KI_GROESSE" });
    expect(l.stand("b1")).toEqual({ ieMonat: 0, ieTag: 0, laufend: 0, anteilMonat: 0 });
  });
  it("erweitern hebt die Klasse an (klein → groß), prüft das Kontingent mit und verringert nie", () => {
    const { l } = neu({ betriebKontingentIE: 100 });   // Tageslimit 25 IE
    const r = l.reservieren(frisch({ tokens: 0 }));
    expect(l.erweitern(r.beleg, 70000)).toEqual({ ok: true });
    expect(l.stand("b1").ieMonat).toBe(7);
    expect(l.erweitern(r.beleg, 10)).toEqual({ ok: true });
    expect(l.stand("b1").ieMonat).toBe(7);
    expect(l.erweitern(r.beleg, 999999)).toMatchObject({ ok: false, code: "KI_GROESSE" });
    const klein = neu({ betriebKontingentIE: 4 });   // Tageslimit 1 IE
    const k = klein.l.reservieren(frisch({ tokens: 0 }));
    expect(klein.l.erweitern(k.beleg, 30000)).toMatchObject({ ok: false, code: "KI_KONTINGENT" });
    expect(klein.l.stand("b1").ieMonat).toBe(1);          // unverändert
  });
});

describe("Kontingent: Stufen und Klasse A", () => {
  it("Tageslimit: höchstens 25 % des Monatskontingents am Tag (ohne Klasse A)", () => {
    const { l } = neu({ betriebKontingentIE: 40 });   // 10 IE am Tag
    for (let i = 0; i < 10; i++) expect(l.reservieren(frisch()).ok, String(i)).toBe(true);
    expect(l.reservieren(frisch())).toMatchObject({ ok: false, code: "KI_KONTINGENT", grund: "betrieb_tag" });
    expect(l.reservieren(frisch({ klasse: "A" })).ok).toBe(true);
  });
  it("neuer Tag: Tageszähler zurück, Monatszähler bleibt", () => {
    const { l, uhr } = neu({ betriebKontingentIE: 40, personJeStunde: { planer: 100 }, personJeTag: { planer: 1000 } });
    for (let i = 0; i < 10; i++) l.reservieren(frisch());
    uhr.t += 24 * 3600_000;
    expect(l.stand("b1").ieMonat).toBe(10);
    expect(l.reservieren(frisch()).ok).toBe(true);
    expect(l.stand("b1")).toMatchObject({ ieMonat: 11, ieTag: 1 });
  });
  it("Monatswechsel setzt den Monatszähler zurück", () => {
    const { l, uhr } = neu({ betriebKontingentIE: 40, personJeStunde: { planer: 100 }, personJeTag: { planer: 1000 } });
    for (let i = 0; i < 3; i++) l.reservieren(frisch());
    uhr.t = Date.UTC(2026, 11, 2, 10, 0, 0);
    l.reservieren(frisch());
    expect(l.stand("b1").ieMonat).toBe(1);
  });
  it("ab 100 % ist D angehalten, B/C laufen bis 110 % (Reserve), danach nur noch A", () => {
    const { l } = neu({ betriebKontingentIE: 100, tageslimitAnteil: 10, personJeStunde: { planer: 1000 }, personJeTag: { planer: 1000 }, parallelJeBetrieb: 1000 });
    for (let i = 0; i < 99; i++) l.reservieren(frisch({ tokens: 0 }));                      // 99 IE
    expect(l.reservieren(frisch({ klasse: "D", tokens: 30000 }))).toMatchObject({ ok: false, grund: "betrieb_reserve" });   // 102 > 100
    expect(l.reservieren(frisch({ klasse: "C", tokens: 30000 })).ok).toBe(true);            // 102 ≤ 110
    for (let i = 0; i < 8; i++) l.reservieren(frisch({ klasse: "C", tokens: 0 }));          // 110
    expect(l.reservieren(frisch({ klasse: "B", tokens: 0 }))).toMatchObject({ ok: false, grund: "betrieb_pause" });
    expect(l.reservieren(frisch({ klasse: "C", tokens: 0 }))).toMatchObject({ ok: false, grund: "betrieb_pause" });
    const a = l.reservieren(frisch({ klasse: "A", tokens: 0 }));
    expect(a.ok).toBe(true);
  });
  it("Klasse A meldet den Hinweis ueberKontingent ab 150 % des Kontingents, wird aber nicht gesperrt", () => {
    const { l } = neu({ betriebKontingentIE: 10, personJeStunde: { planer: 1000 }, personJeTag: { planer: 1000 }, klasseAJeStunde: 1000, parallelJeBetrieb: 1000 });
    let ueber = false;
    for (let i = 0; i < 20; i++) { const r = l.reservieren(frisch({ klasse: "A", tokens: 0 })); expect(r.ok).toBe(true); ueber ||= r.ueberKontingent; }
    expect(ueber).toBe(true);
  });
  it("absolutes Tagesdach sperrt auch A; das weiche Tagesbudget der Plattform nur Nicht-A", () => {
    const { l } = neu({ betriebKontingentIE: 1000, gesamtTagesIE: 2, gesamtHartTagesIE: 4, tageslimitAnteil: 1, parallelJeBetrieb: 100, personJeStunde: { planer: 100 } });
    expect(l.reservieren(frisch()).ok).toBe(true);
    expect(l.reservieren(frisch()).ok).toBe(true);
    expect(l.reservieren(frisch())).toMatchObject({ ok: false, grund: "gesamt_tag" });
    expect(l.reservieren(frisch({ klasse: "A" })).ok).toBe(true);
    expect(l.reservieren(frisch({ klasse: "A" })).ok).toBe(true);
    expect(l.reservieren(frisch({ klasse: "A" }))).toMatchObject({ ok: false, grund: "gesamt_hart" });
  });
  it("ein Betrieb kann den anderen nicht aufbrauchen (Kontingent je Betrieb)", () => {
    const { l } = neu({ betriebKontingentIE: 4 });
    expect(l.reservieren(frisch({ betrieb: "b1" })).ok).toBe(true);
    expect(l.reservieren(frisch({ betrieb: "b1" })).ok).toBe(false);
    expect(l.reservieren(frisch({ betrieb: "b2" })).ok).toBe(true);
  });
});

describe("Sicherheitslimits (gelten für jede Klasse)", () => {
  it("Rolle ohne Limit-Eintrag (Beschäftigte/F9, noch ungeklärt) → gesperrt", () => {
    const { l } = neu();
    for (const rolle of ["mitarbeiter", "betriebsrat", "betreiber", "x"]) expect(l.reservieren(frisch({ rolle })), rolle).toMatchObject({ ok: false, grund: "rolle_ohne_limit" });
    expect(l.reservieren(frisch({ rolle: "mitarbeiter" })).ok).toBe(false);
  });
  it("Person: 30/h und 200/Tag (Planer, Leitung); Klasse A bis 60/h", () => {
    const { l, uhr } = neu({ betriebKontingentIE: 1e6, gesamtTagesIE: 1e6, gesamtHartTagesIE: 2e6, tageslimitAnteil: 1, parallelJeBetrieb: 1e6 });
    const buche = (o) => { const r = l.reservieren(frisch(o)); if (r.ok) l.abschliessen(r.beleg, { verbraucht: true }); return r; };
    for (let i = 0; i < 30; i++) expect(buche({ klasse: "A" }).ok).toBe(true);
    for (let i = 0; i < 30; i++) expect(buche({ klasse: "A" }).ok, `a${i}`).toBe(true);   // Klasse A: 60 je Stunde
    expect(buche({ klasse: "A" })).toMatchObject({ ok: false, grund: "person_stunde" });
    uhr.t += 3600_001;
    for (let i = 0; i < 30; i++) expect(buche({}).ok).toBe(true);
    expect(buche({})).toMatchObject({ ok: false, grund: "person_stunde" });
  });
  it("Tageslimit je Person (200) für Nicht-A", () => {
    const { l, uhr } = neu({ betriebKontingentIE: 1e6, gesamtTagesIE: 1e6, gesamtHartTagesIE: 2e6, tageslimitAnteil: 1, parallelJeBetrieb: 1e6 });
    for (let h = 0; h < 7; h++) {
      for (let i = 0; i < 30; i++) { const r = l.reservieren(frisch()); if (r.ok) l.abschliessen(r.beleg, { verbraucht: true }); }
      uhr.t += 3600_001;
    }
    expect(l.reservieren(frisch())).toMatchObject({ ok: false, grund: "person_tag" });
  });
  it("Wiederholungsschutz: dieselbe Anfrage höchstens 5 × in 10 Minuten", () => {
    const { l, uhr } = neu();
    for (let i = 0; i < 5; i++) { const r = l.reservieren(R({ fingerprint: "gleich" })); expect(r.ok).toBe(true); l.abschliessen(r.beleg, { verbraucht: true }); }
    expect(l.reservieren(R({ fingerprint: "gleich" }))).toMatchObject({ ok: false, grund: "gleiche_anfrage" });
    expect(l.reservieren(R({ fingerprint: "andere" })).ok).toBe(true);
    uhr.t += 10 * 60_000 + 1;
    expect(l.reservieren(R({ fingerprint: "gleich" })).ok).toBe(true);
  });
  it("Parallelität: höchstens N gleichzeitig je Betrieb; abschliessen gibt den Platz frei, doppeltes abschliessen zählt nicht doppelt", () => {
    const { l } = neu({ parallelJeBetrieb: 2 });
    const a = l.reservieren(frisch()), b = l.reservieren(frisch());
    expect(l.reservieren(frisch())).toMatchObject({ ok: false, grund: "parallel" });
    l.abschliessen(a.beleg, { verbraucht: true });
    l.abschliessen(a.beleg, { verbraucht: true });
    expect(l.stand("b1").laufend).toBe(1);
    expect(l.reservieren(frisch()).ok).toBe(true);
    l.abschliessen(b.beleg, { verbraucht: true });
  });
  it("nichts geliefert → Einheiten zurück (einmal); geliefert → bleiben", () => {
    const { l } = neu();
    const a = l.reservieren(frisch({ tokens: 30000 }));
    expect(l.stand("b1").ieMonat).toBe(3);
    l.abschliessen(a.beleg, { verbraucht: false });
    l.abschliessen(a.beleg, { verbraucht: false });
    expect(l.stand("b1")).toMatchObject({ ieMonat: 0, ieTag: 0, laufend: 0 });
    expect(l.gesamtStand().ieTag).toBe(0);
    const b = l.reservieren(frisch({ tokens: 30000 }));
    l.abschliessen(b.beleg, { verbraucht: true });
    expect(l.stand("b1").ieMonat).toBe(3);
  });
  it("Zeitfehler (NaN, rückwärts) sperrt (fail closed)", () => {
    let t = T0;
    const l = new Limits({ jetzt: () => t, betriebKontingentIE: 100, gesamtTagesIE: 1000, gesamtHartTagesIE: 2000 });
    expect(l.reservieren(frisch()).ok).toBe(true);
    t = T0 - 1;
    expect(l.reservieren(frisch())).toMatchObject({ ok: false, code: "KI_LIMIT", grund: "zeit" });
    t = NaN;
    expect(l.reservieren(frisch())).toMatchObject({ ok: false, grund: "zeit" });
  });
  it("B5: der Stand nennt nur Summen je Betrieb, nie Personen", () => {
    const { l } = neu();
    l.reservieren(frisch({ person: "Anna Weberknecht" }));
    expect(JSON.stringify(l.stand("b1"))).not.toMatch(/Anna|p1/);
    expect(Object.keys(l.stand("b1")).sort()).toEqual(["anteilMonat", "ieMonat", "ieTag", "laufend"]);
    expect([...l.person.keys()].join("")).not.toMatch(/Anna/);
  });
  it("Zähler sind in der Größe begrenzt (kein unbegrenztes Wachstum bei vielen Betrieben)", () => {
    const { l } = neu({ personJeStunde: { planer: 100 } });
    let abgelehnt = 0;
    for (let i = 0; i < 5200; i++) { const r = l.reservieren(frisch({ betrieb: `b${i}`, person: `p${i}` })); if (!r.ok) abgelehnt++; else l.abschliessen(r.beleg, { verbraucht: true }); }
    expect(abgelehnt).toBeGreaterThan(0);
    expect(l.betrieb.size).toBeLessThanOrEqual(5000);
  });
});

describe("Protokoll: Weißliste", () => {
  const zeit = T0;
  it("unbekannte Felder und ungültige Werte werden verworfen und nur gezählt", () => {
    const e = ereignisBereinigen({ art: "ki.start", funktion: "F2", rolle: "leitung", person: "Anna Weberknecht", text: "geheim", alias: "P_BCDFGHJK",
      auftrag: "abc defghij", betrieb: "NICHT-HEX", stufe: 9, fakten: -1, ergebnis: "Anna Weberknecht", kategorien: ["klarname"], codes: ["P-02", "x"],
      fehlermeldung: new Error("x"), __proto__: { admin: true } }, zeit);
    expect(e).toEqual({ zeit: new Date(zeit).toISOString(), art: "ki.start", funktion: "F2", rolle: "leitung", verworfen: expect.any(Number) });
    expect(e.verworfen).toBeGreaterThanOrEqual(10);
    expect(JSON.stringify(e)).not.toMatch(/Anna|geheim|P_BCD/);
    expect(Object.isFrozen(e)).toBe(true);
  });
  it("gültige Werte kommen durch; Listen werden kopiert und eingefroren", () => {
    const k = ["STRUKTUR", "KLARNAME"];
    const e = ereignisBereinigen({ art: "ki.abgelehnt", ergebnis: "KI_LECK", kategorien: k, betrieb: "0123456789ab", ie: 3, ueberKontingent: true }, zeit);
    expect(e.kategorien).toEqual(k);
    expect(e.kategorien).not.toBe(k);
    expect(Object.isFrozen(e.kategorien)).toBe(true);
    expect(e.ueberKontingent).toBe(true);
  });
  it("Betrieb erscheint nur als 12-stelliger Hash, ohne Raum und Kennung im Klartext", () => {
    const b = betriebKennung("raum-a", "m1");
    expect(b).toMatch(/^[0-9a-f]{12}$/);
    expect(b).not.toContain("raum");
    expect(betriebKennung("raum-b", "m1")).not.toBe(b);
  });
  it("U2/U3: Pflichtereignis wirft ohne Senke oder bei Senkenfehler; melden stört nie", () => {
    expect(() => erzeugeAudit({}).pflicht({ art: "ki.start" })).toThrow();
    expect(() => erzeugeAudit({ senke: () => { throw new Error("x"); } }).pflicht({ art: "ki.start" })).toThrow();
    const a = erzeugeAudit({ senke: () => { throw new Error("x"); } });
    expect(() => a.melden({ art: "ki.ende" })).not.toThrow();
    expect(a.senkenFehler).toBe(1);
    expect(() => erzeugeAudit({}).melden({ art: "ki.ende" })).not.toThrow();
  });
});

describe("Notschalter", () => {
  it("nur genau der String an zählt — jede Ebene", () => {
    expect(gatewayAn({ prozess: () => "an", laufzeit: () => "an" })).toBe(true);
    for (const w of ["aus", "AN", "An", " an", "an ", true, 1, "true", "ja", null, undefined, {}, [], Promise.resolve("an")]) {
      expect(schalterAn(() => w), String(w)).toBe(false);
      expect(gatewayAn({ prozess: () => "an", laufzeit: () => w })).toBe(false);
    }
    expect(schalterAn(() => { throw new Error("x"); })).toBe(false);
    expect(schalterAn(undefined)).toBe(false);
    expect(gatewayAn(undefined)).toBe(false);
    expect(gatewayAn(null)).toBe(false);
    expect(gatewayAn(SCHALTER_AUS)).toBe(false);
  });
  it("Umgebung: nur CENTRIC_KI_MODUS=an schaltet ein; alles andere aus; keine Vorgabe aus process.env", () => {
    expect(modusAusUmgebung({ CENTRIC_KI_MODUS: "an" })).toBe("an");
    for (const e of [{}, { CENTRIC_KI_MODUS: "AN" }, { CENTRIC_KI_MODUS: "1" }, { CENTRIC_KI_MODUS: "true" }, null, undefined, "an"]) expect(modusAusUmgebung(e)).toBe("aus");
  });
  it("die Vorgabe SCHALTER_AUS ist unveränderlich", () => {
    expect(Object.isFrozen(SCHALTER_AUS)).toBe(true);
    expect(() => { "use strict"; SCHALTER_AUS.prozess = () => "an"; }).toThrow();
  });
});

describe("Router: Funktion → Startstufe (nur aufwärts)", () => {
  it("Tabelle nach Spez. 6.3: F3 beginnt bei 2, die formulierenden und berichtenden Funktionen bei 1; nicht genannte → null", () => {
    expect(startstufe("F3")).toBe(2);
    for (const f of ["F1", "F2", "F4", "F5", "F7A", "F9", "F10", "F11", "F12", "F14", "F15"]) expect(startstufe(f), f).toBe(1);
    for (const f of ["F6", "F8", "F13", "F16", "F17", "F18"]) expect(startstufe(f), f).toBeNull();
    for (const f of ["__proto__", "toString", "constructor", "F99", "", undefined, 3]) expect(startstufe(f), String(f)).toBeNull();
  });
  it("jede Funktion der Positivliste ist entweder zugeordnet oder bewusst offen", () => {
    const offen = FUNKTIONEN_IDS.filter((f) => !(f in STARTSTUFE));
    expect(offen.sort()).toEqual(["F13", "F16", "F17", "F18", "F6", "F8"].sort());
  });
  it("Kette: von der Startstufe aufwärts, nie darüber hinaus; Deckel schneidet ab", () => {
    expect(stufenKette("F2")).toEqual([1, 2, 3]);
    expect(stufenKette("F2", 2)).toEqual([1, 2]);
    expect(stufenKette("F3")).toEqual([2, 3]);
    expect(stufenKette("F3", 1)).toEqual([]);
    expect(stufenKette("F6")).toEqual([]);
    expect(stufenKette("F2", 9)).toEqual([1, 2, 3]);
    expect(stufenKette("F2", 0)).toEqual([]);
    expect(stufenKette("F2", 1.5)).toEqual([]);
  });
});
