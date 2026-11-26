/* ==========================================================================
   WP-I7 — PLANER-KERN: ZÄHLREGELN ÜBER 62 TAGE MIT VORBERECHNETEN AGGREGATEN
   (Betreiberentscheidung I5-4)

   Geprüft (nur synthetische Daten, kein KI-Anteil):
   1. Schalter AUS: ohne Freischaltung bleibt alles wie in WP-I5 (Zeitraum über 62 Tage = „nicht vollständig geprüft“, nie „bestanden“).
   2. Mit Aggregaten: Kalenderjahr und rollierend bis 372 Tage wirken; darüber offen mit Grund; Verwaltung (vorgabePlanwirkung) sagt dasselbe.
   3. Gleiches Ergebnis wie der Regelbaukasten (Prüfweg/Testlauf) für Zufallsfälle; Urlaub/Krankheit, Abwesenheit, Teilzeit wie in WP-I5.
   4. Rechenlast: Kosten = tatsächliche Arbeit (Monat lesen, Präfixsumme, Schritte), ein Budget je Einstieg, aufgebraucht = offen (fail-closed),
      kein halber Block; Mandantengrenze; KI-Pause hält die Aggregate an.
   5. Planer (planeMonat): Fortschreiben der Aggregate zwischen den Einteilungen, Ergebnis wie der Prüfweg, wiederholbar.
   6. Messung: Planer mit vielen Langzeitregeln gegen den Lauf ohne Vorgaben (feste Obergrenze).

   Aufruf: npx vitest run pruefungen/intelligence-planer-aggregate.test.js
   ========================================================================== */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { readFileSync, appendFileSync } from "node:fs";
import { vorgabenBefunde, vorgabePlanwirkung, neuesVorgabenBudget, vorgabenPlanFortschreiben } from "../server/lib/vorgabenwirkung.mjs";
import { VORGABEN_WIRKUNG_GRENZE, vorgabeAlsRegel } from "../server/lib/vorgaben.mjs";
import { PLANER_AGGREGATE_AN, AGGREGAT_GRENZE, aggregatZaehler, aggregateFortschreiben, neuerAggregatSpeicher, tagNr } from "../server/lib/engine/planeraggregate.mjs";
import { kiPauseAktiv } from "../server/lib/ki-steuerung.mjs";
import { zaehlregel } from "../server/lib/regelbaukasten.mjs";
import { FEST, zufall, betriebe } from "./engine-golden.fixture.mjs";

const TAG = "2026-11-17";
const add = (t, n) => { const x = new Date(`${t}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const DA = [{ id: "F", name: "Frühdienst", kurz: "F", start: "06:00", ende: "15:45" }, { id: "S", name: "Spätdienst", kurz: "S", start: "13:45", ende: "23:30" },
  { id: "N", name: "Nachtdienst", kurz: "N", start: "21:30", ende: "07:15" }];
const dienst = (id) => DA.find((d) => d.id === id);
const Z = (fenster, extra = {}, par = {}) => ({ id: "z", name: "Vorgabe z", regelart: "zaehlregel",
  parameter: { ereignis: "N", fenster, richtung: "hoechstens", grenze: 3, ...par },
  geltung: { art: "betrieb" }, bezug: "monat", staerke: "muss", prioritaet: 1, grundlage: { art: "hausregel" }, status: "aktiv", ...extra });
const JAHR = { art: "kalenderjahr" };
const P = { id: "pp" };
const AN = () => neuesVorgabenBudget(undefined, { aggregate: true });
const pruefe = (vorgaben, plan, { d = TAG, da = "N", p = P, budget = AN(), abw = {}, automatisch = false, einstellungen, m: mm } = {}) => {
  const m = mm || { dienstarten: DA, vorgaben, ...(einstellungen ? { einstellungen } : {}) };
  return vorgabenBefunde(m, p, d, dienst(da), { dienstAm: (x, t) => plan[t] || null, abwesendAm: (x, t) => abw[t] || null, budget, automatisch });
};
const regeln = (l) => l.map((b) => b.regel);

describe("1. Schalter AUS (Vorgabe): nichts ändert sich gegenüber WP-I5", () => {
  it("der Schalter ist aus; ein Budget ohne ausdrückliche Freischaltung hat keine Aggregate", () => {
    expect(PLANER_AGGREGATE_AN).toBe(false);
    expect(neuesVorgabenBudget().aggregat).toBe(null);
    expect(AN().aggregat).not.toBe(null);
    expect(AGGREGAT_GRENZE).toEqual({ fensterTage: 372 });
    expect(VORGABEN_WIRKUNG_GRENZE).toEqual({ aktive: 50, fensterTage: 62, aufwand: 200000 });   // die Lastgrenzen bleiben
  });
  it("Kalenderjahr ohne Aggregate: offen mit Grund „Zeitraum über 62 Tage“, in der Automatik bei Muss Achtung; Verwaltung: wirkt nicht", () => {
    const b = pruefe([Z(JAHR)], { "2026-02-01": "N", "2026-02-02": "N", "2026-02-03": "N" }, { budget: neuesVorgabenBudget() });
    expect(b.map((x) => [x.regel, x.stufe])).toEqual([["vorgabeOffen", "hinweis"]]);
    expect(b[0].text).toMatch(/Zeitraum über 62 Tage/);
    expect(pruefe([Z(JAHR)], {}, { budget: neuesVorgabenBudget(), automatisch: true })[0].stufe).toBe("achtung");
    expect(vorgabePlanwirkung(Z(JAHR)).wirkt).toBe(false);
  });
  it("der Planungsassistent der Oberfläche schaltet nichts ein (Quelle: nur maxProPerson)", () => {
    const q = readFileSync("src/ansichten/assistent.jsx", "utf8");
    expect(q).toContain("planeMonat(m, ym, { maxProPerson: max })");
    expect(q).not.toMatch(/aggregate\s*:/);
  });
});

describe("2. Mit Aggregaten: lange Zeiträume wirken, darüber offen", () => {
  it("Kalenderjahr „höchstens 3 N“: drei N im Februar, N im November → Muss-Befund; zwei N → keiner; N im Vorjahr zählt nicht", () => {
    const drei = { "2026-02-01": "N", "2026-02-02": "N", "2026-02-03": "N" };
    const b = pruefe([Z(JAHR)], drei);
    expect(b.map((x) => [x.regel, x.stufe])).toEqual([["vorgabeMuss", "achtung"]]);
    expect(b[0].regelId).toBe("VORGABE-Z");
    expect(pruefe([Z(JAHR)], { "2026-02-01": "N", "2026-02-02": "N" })).toEqual([]);
    expect(pruefe([Z(JAHR)], { "2025-12-29": "N", "2025-12-30": "N", "2025-12-31": "N" })).toEqual([]);
    expect(pruefe([Z(JAHR)], drei, { da: "F" })).toEqual([]);
  });
  it("eine schon bestehende Verletzung wird nicht angelastet, die Mehr-Last schon; Soll ist ein Hinweis", () => {
    const vier = { "2026-02-01": "N", "2026-02-02": "N", "2026-02-03": "N", "2026-02-04": "N" };
    expect(pruefe([Z(JAHR)], vier, { da: "F" })).toEqual([]);
    expect(regeln(pruefe([Z(JAHR)], vier))).toEqual(["vorgabeMuss"]);
    expect(pruefe([Z(JAHR, { staerke: "soll" })], vier).map((x) => [x.regel, x.stufe])).toEqual([["vorgabeSoll", "hinweis"]]);
  });
  it("rollierend 26 Wochen: N 150 Tage vor dem Tag zählt, 200 Tage davor nicht; Einteilung in der Mitte trifft ein späteres Fenster", () => {
    const f = { art: "rollierend", laenge: 26, einheit: "wochen" };
    expect(regeln(pruefe([Z(f)], { [add(TAG, -150)]: "N", [add(TAG, -151)]: "N", [add(TAG, -152)]: "N" }))).toEqual(["vorgabeMuss"]);
    expect(pruefe([Z(f)], { [add(TAG, -200)]: "N", [add(TAG, -201)]: "N", [add(TAG, -202)]: "N" })).toEqual([]);
    expect(regeln(pruefe([Z(f)], { [add(TAG, 100)]: "N", [add(TAG, 101)]: "N", [add(TAG, 102)]: "N" }))).toEqual(["vorgabeMuss"]);
  });
  it("Verwaltung und Prüfung sagen dasselbe: bis 372 Tage wirkt (mit Aggregaten), darüber nicht — die Prüfung meldet dann offen mit Grund", () => {
    const an = { aggregate: true };
    expect(vorgabePlanwirkung(Z(JAHR), an).wirkt).toBe(true);
    expect(vorgabePlanwirkung(Z({ art: "rollierend", laenge: 53, einheit: "wochen" }), an).wirkt).toBe(true);
    expect(vorgabePlanwirkung(Z({ art: "rollierend", laenge: 12, einheit: "monate" }), an).wirkt).toBe(true);
    expect(vorgabePlanwirkung(Z({ art: "rollierend", laenge: 372, einheit: "tage" }), an).wirkt).toBe(true);
    const lang = Z({ art: "rollierend", laenge: 13, einheit: "monate" });
    const w = vorgabePlanwirkung(lang, an);
    expect(w.wirkt).toBe(false);
    expect(w.grund).toMatch(/372 Tage/);
    const b = pruefe([lang], {});
    expect(regeln(b)).toEqual(["vorgabeOffen"]);
    expect(b[0].text).toMatch(/Zeitraum über 372 Tage/);
    expect(pruefe([lang], {}, { automatisch: true })[0].stufe).toBe("achtung");
    expect(regeln(pruefe([Z({ art: "rollierend", laenge: 373, einheit: "tage" })], {}))).toEqual(["vorgabeOffen"]);
    /* lange Muster bleiben offen (nicht Teil von I5-4) */
    const muster = { ...Z(JAHR), regelart: "musterregel", parameter: { art: "hoechstensFolge", klassen: ["F"], max: 40, danachFrei: 0 } };
    expect(regeln(pruefe([muster], {}, { da: "F" }))).toEqual(["vorgabeOffen"]);
  });
  it("Urlaub/Krankheit aus der Zählung, Abwesenheit nie frei: „mindestens 100 freie Tage im Jahr“", () => {
    const frei = Z(JAHR, {}, { ereignis: "frei", richtung: "mindestens", grenze: 100 });
    /* 266 Diensttage außer dem Tag selbst: frei sind 365 − 266 − 1 = 98 (mit der Einteilung) bzw. 99 (ohne) → verletzt und vergrößert */
    const plan = {};
    let n = 0;
    for (let t = "2026-01-01"; t <= "2026-12-31" && n < 266; t = add(t, 1)) if (t !== TAG) { plan[t] = "F"; n++; }
    expect(regeln(pruefe([frei], plan))).toEqual(["vorgabeMuss"]);
    /* Urlaub an 20 freien Tagen: zählt nicht als frei, die Grenze sinkt anteilig (100 · 345/365 = 94,52…) → 78 frei < 94,5 → Befund mit Hinweis */
    const abw = {};
    let u = 0;
    for (let t = "2026-12-01"; u < 20; t = add(t, 1)) if (!plan[t] && t !== TAG) { abw[t] = "urlaub"; u++; }
    const b = pruefe([frei], plan, { abw });
    expect(regeln(b)).toEqual(["vorgabeMuss"]);
    expect(b[0].text).toMatch(/ohne Urlaub und Krankheit/);
    /* Urlaub nur am Tag d selbst: wie im kurzen Weg wird er nicht herausgenommen (die Einteilung ersetzt den Tag) — volle Grenze, kein Zusatz */
    const nurD = pruefe([frei], plan, { abw: { [TAG]: "urlaub" } });
    expect(regeln(nurD)).toEqual(["vorgabeMuss"]);
    expect(nurD[0].text).not.toMatch(/ohne Urlaub|anteilig/);
    /* Schulung: kein Herausnehmen, aber auch kein freier Tag */
    const schulung = Object.fromEntries(Object.keys(abw).map((t) => [t, "schulung"]));
    expect(regeln(pruefe([frei], plan, { abw: schulung }))).toEqual(["vorgabeMuss"]);
  });
  it("Teilzeit anteilig nur bei ausdrücklichem „ja“; eine Mindestzahl freier Tage wird nie gesenkt", () => {
    const tz = { id: "tz", teilzeit: { aktiv: true }, wochenstunden: 20 };
    const drei = { "2026-02-01": "N", "2026-02-02": "N" };   // mit der Einteilung 3 N
    const m = (v) => ({ dienstarten: DA, vorgaben: [v], einstellungen: { sollWochenstunden: 40 } });
    const v = Z(JAHR, {}, { grenze: 4 });
    expect(pruefe(null, drei, { p: tz, m: m(v) })).toEqual([]);                                             // ohne Flag: Grenze 4
    expect(regeln(pruefe(null, drei, { p: tz, m: m({ ...v, ausnahmen: { teilzeitAnteilig: true } }) }))).toEqual(["vorgabeMuss"]);   // 2
    expect(pruefe(null, drei, { p: tz, m: m({ ...v, ausnahmen: { teilzeitAnteilig: false } }) })).toEqual([]);
  });
});

describe("3. Gleiches Ergebnis wie der Regelbaukasten (Prüfweg), Zufallsfälle über lange Zeiträume", () => {
  const rng = (seed) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  it("150 Fälle (Kalenderjahr; rollierend 63–372 Tage in Tagen, Wochen, Monaten; höchstens/mindestens; N, F, frei): Befund genau dann, wenn der Baukasten in einem Fenster mit der Einteilung verletzt und die Einteilung es herbeiführt oder vergrößert", () => {
    const r = rng(20261126);
    const wahl = (l) => l[Math.floor(r() * l.length)];
    let befunde = 0;
    for (let i = 0; i < 150; i++) {
      const art = wahl(["jahr", "tage", "wochen", "monate"]);
      const fenster = art === "jahr" ? JAHR : art === "tage" ? { art: "rollierend", laenge: 63 + Math.floor(r() * 310), einheit: "tage" }
        : art === "wochen" ? { art: "rollierend", laenge: 10 + Math.floor(r() * 44), einheit: "wochen" } : { art: "rollierend", laenge: 3 + Math.floor(r() * 10), einheit: "monate" };
      const n = art === "jahr" ? 1 : art === "tage" ? fenster.laenge : art === "wochen" ? 7 * fenster.laenge : 31 * fenster.laenge;
      const richtung = wahl(["hoechstens", "mindestens"]);
      const ereignis = wahl(["N", "F", "frei"]);
      const dichte = 0.2 + r() * 0.6;
      const spanne = art === "jahr" ? 400 : n + 31;
      const plan = {};
      for (let o = -spanne; o <= spanne; o++) if (o !== 0 && r() < dichte) plan[add(TAG, o)] = wahl(["F", "S", "N"]);
      /* Grenze nahe am tatsächlichen Wert, damit Befunde und Nicht-Befunde vorkommen */
      const fenster0 = art === "jahr" ? { von: "2026-01-01", bis: "2026-12-31" } : null;
      const zaehl = (von, bis) => { let c = 0; for (let t = von; t <= bis; t = add(t, 1)) if ((t === TAG ? "frei" : plan[t] || "frei") === ereignis) c++; return c; };
      const basis = fenster0 ? zaehl(fenster0.von, fenster0.bis) : zaehl(add(TAG, -(Math.min(n, 372) - 1)), TAG);
      const grenze = Math.max(0, basis + Math.floor(r() * 5) - 2);
      const v = Z(fenster, {}, { ereignis, richtung, grenze });
      const da = wahl(["F", "S", "N"]);
      const regel = vorgabeAlsRegel(v, { wirkend: true });
      const massDe = (e) => (richtung === "mindestens" ? -e.fakten.anzahl : e.fakten.anzahl);
      const mitL = [], ohneL = [];
      for (let o = -(spanne + 400); o <= spanne + 400; o++) {
        const t = add(TAG, o);
        const ohne = o === 0 ? "frei" : (plan[t] || "frei");
        const mit = o === 0 ? da : ohne;
        if (ohne === ereignis) ohneL.push(t);
        if (mit === ereignis) mitL.push(t);
      }
      let erwartet = false;
      for (let so = 0; so < n && !erwartet; so++) {
        const st = add(TAG, so);
        const mitE = zaehlregel(regel, { ereignisse: mitL, stichtag: st });
        if (mitE.status !== "verletzt") continue;
        const ohneE = zaehlregel(regel, { ereignisse: ohneL, stichtag: st });
        if (!(ohneE.status === "verletzt" && massDe(mitE) <= massDe(ohneE))) erwartet = true;
      }
      const b = pruefe([v], plan, { da });
      expect(b.every((x) => x.regel !== "vorgabeOffen"), `Fall ${i}: offen`).toBe(true);
      expect(b.length > 0, `Fall ${i}: ${richtung} ${grenze} ${ereignis} ${JSON.stringify(fenster)}, Dienst ${da}`).toBe(erwartet);
      if (erwartet) befunde++;
    }
    expect(befunde, "Befunde und Nicht-Befunde kommen vor").toBeGreaterThan(20);
    expect(befunde).toBeLessThan(130);
  }, 180000);
  it("kurze Zeiträume (≤ 62 Tage) rechnen mit Aggregaten genau wie ohne (der kurze Weg bleibt unverändert)", () => {
    const r = rng(7);
    for (let i = 0; i < 60; i++) {
      const f = { art: "rollierend", laenge: 2 + Math.floor(r() * 60), einheit: "tage" };
      const plan = {};
      for (let o = -70; o <= 70; o++) if (o && r() < 0.5) plan[add(TAG, o)] = ["F", "S", "N"][Math.floor(r() * 3)];
      const v = Z(f, {}, { grenze: Math.floor(r() * 20) });
      expect(pruefe([v], plan)).toEqual(pruefe([v], plan, { budget: neuesVorgabenBudget() }));
    }
  });
});

describe("4. Rechenlast, Mandantengrenze, Pause", () => {
  it("Kosten = tatsächliche Arbeit: erstes Kalenderjahr 365 Tagesabfragen + 12 Schritte; zweite Prüfung derselben Person nur die 12 Schritte", () => {
    const budget = AN();
    const m = { dienstarten: DA, vorgaben: [Z(JAHR)] };
    const k = { dienstAm: () => null, budget };
    vorgabenBefunde(m, P, TAG, dienst("N"), k);
    expect(VORGABEN_WIRKUNG_GRENZE.aufwand - budget.rest).toBe(365 + 12);
    vorgabenBefunde(m, P, add(TAG, 1), dienst("N"), k);
    expect(VORGABEN_WIRKUNG_GRENZE.aufwand - budget.rest).toBe(365 + 24);
    /* angeschnittener Monat: Präfixsumme einmal (Tage des Monats), danach ein Schritt */
    const sp = neuerAggregatSpeicher();
    let kosten = 0;
    const z = aggregatZaehler(sp, m, "pp", () => ({ klasse: "frei", abw: 0 }), (n) => { kosten += n; });
    expect(z.zaehle("frei", tagNr("2026-11-05"), tagNr("2026-11-09"))).toBe(5);
    expect(kosten).toBe(30 + 30 + 1);
    expect(z.zaehle("frei", tagNr("2026-11-01"), tagNr("2026-12-31"))).toBe(61);
    expect(kosten).toBe(61 + 31 + 2);
  });
  it("Budget aufgebraucht: offen mit Grund, in der Automatik bei Muss Achtung; kein halber Block bleibt liegen; nie ein Wurf", () => {
    const budget = neuesVorgabenBudget(300, { aggregate: true });
    const b = pruefe([Z(JAHR)], {}, { budget, automatisch: true });
    expect(b.map((x) => [x.regel, x.stufe])).toEqual([["vorgabeOffen", "achtung"]]);
    expect(b[0].text).toMatch(/Rechenbudget aufgebraucht/);
    expect(budget.ausgeschoepft).toBe(true);
    const sp = neuerAggregatSpeicher();
    const m = {};
    let rest = 40;
    const kosten = (n) => { if (rest < n) throw new Error("Budget"); rest -= n; };
    const z = aggregatZaehler(sp, m, "pp", () => ({ klasse: "N", abw: 0 }), kosten);
    expect(() => z.zaehle("N", tagNr("2026-01-01"), tagNr("2026-03-31"))).toThrow();
    expect([...sp.jeBetrieb.get(m).keys()]).toEqual(["pp|2026-01"]);   // Januar vollständig, Februar nicht angefangen
  });
  it("Mandantengrenze: zwei Betriebe, gleiche Personenkennung, ein Budget — keiner bekommt die Blöcke des anderen", () => {
    const budget = AN();
    const A = { dienstarten: DA, vorgaben: [Z(JAHR)] }, B = { dienstarten: DA, vorgaben: [Z(JAHR)] };
    const planA = { "2026-02-01": "N", "2026-02-02": "N", "2026-02-03": "N" };
    expect(regeln(pruefe(null, planA, { m: A, budget }))).toEqual(["vorgabeMuss"]);
    expect(pruefe(null, {}, { m: B, budget })).toEqual([]);
    expect(pruefe(null, planA, { m: { dienstarten: DA }, budget })).toEqual([]);   // ohne Vorgaben: nichts
  });
  it("KI-Pause hält die Aggregate an: offen mit Grund (Automatik bei Muss: nicht einteilen); ohne Pause rechnen sie", () => {
    const einstellungen = { kiSteuerung: { pause: { aktiv: true } } };   // unlesbarer Stand zählt als Pause (fail-closed)
    expect(kiPauseAktiv(einstellungen)).toBe(true);
    const plan = { "2026-02-01": "N", "2026-02-02": "N", "2026-02-03": "N" };
    const b = pruefe([Z(JAHR)], plan, { einstellungen, automatisch: true });
    expect(b.map((x) => [x.regel, x.stufe])).toEqual([["vorgabeOffen", "achtung"]]);
    expect(b[0].text).toMatch(/pausiert/);
    expect(vorgabePlanwirkung(Z(JAHR), { aggregate: true, pause: true }).wirkt).toBe(false);
    expect(regeln(pruefe([Z(JAHR)], plan, { einstellungen: { kiSteuerung: {} } }))).toEqual(["vorgabeMuss"]);
  });
  it("aggregateFortschreiben übernimmt nur, wenn sich allein die Einteilungen geändert haben, und merkt genau den Tag der geänderten Person zum Nachlesen vor (WP-I7 Teil 2; vorher: ganzer Monat verworfen)", () => {
    const sp = neuerAggregatSpeicher();
    const alt = { dienstarten: DA, abweichungen: {} };
    const lies = () => ({ klasse: "frei", abw: 0 });
    const z = aggregatZaehler(sp, alt, "a", lies, () => {});
    z.zaehle("frei", tagNr("2026-10-01"), tagNr("2026-11-30"));
    aggregatZaehler(sp, alt, "b", lies, () => {}).zaehle("frei", tagNr("2026-11-01"), tagNr("2026-11-30"));
    const neu = { ...alt, abweichungen: { "a|2026-11-17": "N" } };
    expect(aggregateFortschreiben(sp, alt, neu, [{ personId: "a", tag: "2026-11-17" }])).toBe(true);
    expect(sp.jeBetrieb.get(alt)).toBeUndefined();
    expect([...sp.jeBetrieb.get(neu).keys()].sort()).toEqual(["a|2026-10", "a|2026-11", "b|2026-11"]);
    expect([...sp.jeBetrieb.get(neu).values()].map((b) => [b.mon, [...b.neu]])).toEqual([["2026-10", []], ["2026-11", [16]], ["2026-11", []]]);
    const anders = { ...neu, dienstarten: [...DA] };
    expect(aggregateFortschreiben(sp, neu, anders, [])).toBe(false);
    expect(sp.jeBetrieb.get(anders)).toBeUndefined();
    expect(sp.jeBetrieb.get(neu)).toBeUndefined();
  });
});

describe("5. Planer (planeMonat) mit Aggregaten", () => {
  let F, B;
  beforeAll(async () => {
    vi.useFakeTimers({ now: new Date(FEST), toFake: ["Date"] });
    vi.spyOn(Math, "random").mockImplementation(zufall(20261126));
    F = await import("../src/lib/fachlogik.js");
    B = betriebe(F);
  }, 120000);
  afterAll(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
  const klein = (vorgaben) => {
    const m = structuredClone(B.find(([n]) => n.startsWith("demo1"))[1]);
    m.abwesenheiten = []; m.vorgaben = vorgaben;
    m.dienstarten = m.dienstarten.filter((x) => x.id === "N");
    m.personen = m.personen.filter((x) => x.rolle === "mitarbeiter" && !(x.teilzeit && x.teilzeit.aktiv) && !x.springer).slice(0, 6);
    m.abweichungen = {};
    /* das ganze Jahr frei (die Demo-Schichtfolge hätte schon viele Nachtdienste), dann je Person 2 Nachtdienste im Februar */
    for (const p of m.personen) for (let t = "2026-01-01"; t <= "2026-12-31"; t = add(t, 1)) m.abweichungen[`${p.id}|${t}`] = "-";
    for (const p of m.personen) { m.abweichungen[`${p.id}|2026-02-10`] = "N"; m.abweichungen[`${p.id}|2026-02-11`] = "N"; }
    return m;
  };
  const jahrN = (grenze) => ({ ...Z(JAHR, {}, { grenze }), id: "jn", name: "Jahr N" });
  it("teilt nie mehr Nachtdienste ein, als die Jahresregel erlaubt (Nachprüfung über den Prüfweg ohne Planer), und ist wiederholbar", () => {
    const m = klein([jahrN(5)]);
    const e1 = F.planeMonat(m, "2026-11", { maxProPerson: 31, aggregate: true });
    const e2 = F.planeMonat(m, "2026-11", { maxProPerson: 31, aggregate: true });
    expect(e2).toEqual(e1);
    expect(e1.gesetzt.length).toBeGreaterThan(0);
    const je = {};
    for (const g of e1.gesetzt) je[g.personId] = (je[g.personId] || 0) + 1;
    for (const [id, n] of Object.entries(je)) expect(n + 2, `Person ${id}`).toBeLessThanOrEqual(5);
    /* Prüfweg: jede gesetzte Einteilung, gegen den Endstand ohne sie geprüft, ergibt keinen Muss-Befund */
    const fertig = { ...m, abweichungen: e1.abweichungen };
    for (const g of e1.gesetzt) {
      const ohne = { ...fertig, abweichungen: { ...fertig.abweichungen, [`${g.personId}|${g.datum}`]: "-" } };
      const p = m.personen.find((x) => x.id === g.personId);
      const b = F.hindernisBefunde(ohne, p, g.datum, m.dienstarten[0], { vorgabenBudget: AN() });
      expect(b.filter((x) => x.regel === "vorgabeMuss"), `${g.datum}`).toEqual([]);
    }
  }, 180000);
  it("Review #572 A1: Posten-Besetzung hängt von der Einteilung ANDERER Personen ab — nach dem Fortschreiben gleiches Ergebnis wie frisch gerechnet (Betrieb mit Posten: der Tag wird bei allen Personen nachgelesen, WP-I7 Teil 2)", () => {
    const m = structuredClone(B.find(([n]) => n.startsWith("demo1"))[1]);
    const po = m.dienstarten.find((x) => x.posten && x.quelle);
    const Q = po && po.quelle;
    expect(po, "demo1 hat einen Posten mit Quelldienst").toBeTruthy();
    po.mindest = { mo_do: 1, fr: 1, sa: 1, so: 1 };   // Bedarf 1: wer manuell eingeteilt wird, verdrängt die Person aus der Folge
    const d = "2026-11-01";
    const P = m.personen.find((p) => F.personTag(m, p, d).dienstId === po.id);
    expect(P, "eine Person steht am Tag auf dem Posten").toBeTruthy();
    /* eine andere Person R auf den Posten: P fällt aus der Postenbesetzung und hat wieder ihren Quelldienst Q */
    let m2 = null, R = null;
    for (const r of m.personen) {
      if (r.id === P.id) continue;
      const x = { ...m, abweichungen: { ...m.abweichungen, [`${r.id}|${d}`]: po.id } };
      if (F.personTag(x, P, d).dienstId === Q) { m2 = x; R = r; break; }
    }
    expect(m2, "Einteilung einer anderen Person verdrängt P vom Posten").toBeTruthy();
    /* Prüftag: ein Tag im November, an dem P keinen Quelldienst hat; Grenze = Quelldienste von P im Jahr (ohne den Prüftag) im neuen Stand */
    const N = m.dienstarten.find((x) => x.id === Q);
    const tage = []; for (let t = "2026-01-01"; t <= "2026-12-31"; t = add(t, 1)) tage.push(t);
    const dp = tage.find((t) => t > "2026-11-05" && t < "2026-12-01" && F.personTag(m2, P, t).dienstId !== Q && !F.abwesenheitAm(m2, P.id, t));
    const nJahr = tage.filter((t) => t !== dp && F.personTag(m2, P, t).dienstId === Q).length;
    const vorgabe = { ...Z(JAHR, {}, { ereignis: Q, grenze: nJahr }), id: "jq", name: "Jahr Quelldienst" };
    const mit = (x) => ({ ...x, vorgaben: [vorgabe] });
    const a = mit(m), b = { ...a, abweichungen: m2.abweichungen };
    const prue = (x, budget) => vorgabenBefunde(x, P, dp, N, { dienstAm: (q, t) => F.personTag(x, q, t).dienstId || null,
      abwesendAm: (q, t) => { const ab = F.abwesenheitAm(x, q.id, t); return ab ? ab.art : null; }, budget }).map((y) => y.regel);
    const frisch = prue(b, AN());
    expect(frisch).toEqual(["vorgabeMuss"]);
    const budget = AN();
    prue(a, budget);                                                                // Blöcke für P im alten Stand
    vorgabenPlanFortschreiben(budget, a, b, [{ personId: R.id, tag: d }]);
    expect(prue(b, budget), "nach dem Fortschreiben wie frisch gerechnet").toEqual(frisch);
  }, 180000);
  it("ohne Freischaltung bleibt der Planer fail-closed: die Jahresregel ist offen, es wird nichts eingeteilt, die Lücken bleiben sichtbar", () => {
    const e = F.planeMonat(klein([jahrN(5)]), "2026-11", { maxProPerson: 31 });
    expect(e.gesetzt).toEqual([]);
    expect(e.offen.length).toBeGreaterThan(0);
  }, 180000);
  it("Quelle: planeMonat schreibt die Aggregate nach jeder Einteilung fort (ein Budget je Monat)", () => {
    const q = readFileSync("src/lib/fachlogik.js", "utf8");
    const a = q.indexOf("export function planeMonat(");
    const f = q.slice(a, q.indexOf("\n}\n", a));
    expect(f.split("neuesVorgabenBudget(").length - 1).toBe(1);
    expect(f).toContain("vorgabenPlanFortschreiben(ctx.vorgabenBudget, vorher, arbeit, [{ personId: beste.person.id, tag: d }])");
  });
});

describe("6. Messung: Planer mit vielen Langzeitregeln gegen den Lauf ohne Vorgaben", () => {
  let F, B;
  beforeAll(async () => {
    vi.useFakeTimers({ now: new Date(FEST), toFake: ["Date"] });
    vi.spyOn(Math, "random").mockImplementation(zufall(20261126));
    F = await import("../src/lib/fachlogik.js");
    B = betriebe(F);
  }, 120000);
  afterAll(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
  /* Messwerte für den Nachweis: nur mit MESSUNG_DATEI (sonst still). */
  const melde = (text) => { if (process.env.MESSUNG_DATEI) appendFileSync(process.env.MESSUNG_DATEI, `${text}\n`); };
  const zeit = (f) => { const t = process.hrtime.bigint(); const r = f(); return [Number(process.hrtime.bigint() - t) / 1e9, r]; };
  const lang = (i) => ({ ...Z(i % 2 ? JAHR : { art: "rollierend", laenge: 52, einheit: "wochen" }, {},
    i % 3 === 0 ? { ereignis: "frei", richtung: "mindestens", grenze: 60 + (i % 7) } : { ereignis: "N", grenze: 40 + i }), id: `l${String(i).padStart(2, "0")}`, name: `L${i}` });
  it("planeMonat auf demo1 mit 50 Muss-Langzeitregeln (Kalenderjahr, 52 Wochen; höchstens N, mindestens frei): höchstens 5 s mehr als ohne Vorgaben", () => {
    const m = structuredClone(B.find(([n]) => n.startsWith("demo1"))[1]);
    m.vorgaben = [];
    /* Lücken schaffen: alle Nachtdienste im Dezember frei, der Planer muss sie füllen */
    for (const p of m.personen) for (let t = "2026-12-01"; t <= "2026-12-31"; t = add(t, 1)) if (F.personTag(m, p, t).dienstId === "N") m.abweichungen[`${p.id}|${t}`] = "-";
    F.planeMonat(m, "2026-12", { maxProPerson: 3 });   // aufwärmen
    const [ohne] = zeit(() => F.planeMonat(m, "2026-12", { maxProPerson: 3 }));
    m.vorgaben = Array.from({ length: 50 }, (_, i) => lang(i));
    const [mit, e] = zeit(() => F.planeMonat(m, "2026-12", { maxProPerson: 3, aggregate: true }));
    melde(`planeMonat demo1 (${m.personen.length} Personen): ohne Vorgaben ${ohne.toFixed(2)} s, mit 50 Langzeitregeln ${mit.toFixed(2)} s, gesetzt ${e.gesetzt.length}, offen ${e.offen.length}`);
    expect(mit - ohne, `mit ${mit.toFixed(1)} s, ohne ${ohne.toFixed(1)} s`).toBeLessThan(5);
  }, 600000);
  it("synthetisch 300 Personen, 62 Tage, Ersatzsuche mit EINEM Budget, 50 Langzeitregeln: höchstens 5 s mehr als ohne Vorgaben; Worst-Case (rollierend 372 Tage, „mindestens frei“) ebenso", () => {
    const m = structuredClone(B.find(([n]) => n.startsWith("demo1"))[1]);
    const vorlage = m.personen.filter((x) => x.rolle === "mitarbeiter");
    m.personen = Array.from({ length: 300 }, (_, i) => ({ ...structuredClone(vorlage[i % vorlage.length]), id: `s${i}`, nachname: `S${i}` }));
    const lauf = (aggregate) => { const budget = neuesVorgabenBudget(undefined, { aggregate }); for (let i = 0; i < 62; i++) F.ersatzVorschlaege(m, add("2026-11-01", i), "N", undefined, { vorgabenBudget: budget, vorgabenAutomatisch: true }); return budget; };
    m.vorgaben = [];
    lauf(false);   // aufwärmen
    const [ohne] = zeit(() => lauf(false));
    m.vorgaben = Array.from({ length: 50 }, (_, i) => lang(i));
    const [aus] = zeit(() => lauf(false));   // Stand WP-I5: Langzeitregeln sofort „offen“
    const [mit, b1] = zeit(() => lauf(true));
    melde(`300 Personen x 62 Tage, 50 Langzeitregeln, Aggregate AUS (Stand vorher): ${aus.toFixed(2)} s`);
    m.vorgaben = Array.from({ length: 50 }, (_, i) => ({ ...lang(0), id: `w${String(i).padStart(2, "0")}`, name: `W${i}`,
      parameter: { ereignis: "frei", fenster: { art: "rollierend", laenge: 372, einheit: "tage" }, richtung: "mindestens", grenze: 100 + i } }));
    const [worst, b2] = zeit(() => lauf(true));
    melde(`300 Personen x 62 Tage: ohne ${ohne.toFixed(2)} s, 50 Langzeitregeln ${mit.toFixed(2)} s (Budget aufgebraucht: ${b1.ausgeschoepft}), Worst-Case 372 Tage mindestens frei ${worst.toFixed(2)} s (aufgebraucht: ${b2.ausgeschoepft})`);
    expect(mit - ohne).toBeLessThan(5);
    expect(worst - ohne).toBeLessThan(5);
  }, 900000);
});
