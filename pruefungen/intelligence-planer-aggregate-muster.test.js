/* ==========================================================================
   WP-I7 — LANGE MUSTERREGELN MIT DEN AGGREGATEN DES PLANER-KERNS
   (Betreiberentscheidung 26.11.: Rückfrage 4 aus Teil 1 — ja, innerhalb WP-I7)

   Musterregeln (höchstens in Folge, verbotene Folge) werten das Fenster d ± halb aus (halb = max + danachFrei + 1 bzw. Abstand).
   Bis 62 Tage rechnet der kurze Weg; länger (bis 372 Tage) jetzt mit den Monatsblöcken der Aggregate, darüber offen.

   Geprüft (nur synthetische Daten, kein KI-Anteil):
   1. Schalter AUS / Verwaltung / Obergrenze: ohne Aggregate unverändert offen; mit Aggregaten bis 372 Tage wirksam, darüber offen mit Grund;
      KI-Pause (auch unlesbar) hält an; Automatik bei Muss offen = Achtung.
   2. Gleichwertigkeit: kurzer Weg = Regelbaukasten (Referenz) = Aggregatweg, Zufallsfälle über Fenstergrenzen, Jahreswechsel, Schaltjahre
      (2000/2028 ja, 2100 nein), Abwesenheit (nie frei), Klasse „frei“ im Muster, eigene Freiklasse; musterVerschaerft direkt gegen den Baukasten.
   3. Rechenlast: Grundbetrag + ein Schritt je gelesenem Tag, vorab angemeldet; Budget leer/knapp = offen, nie bestanden; ungültige Tage und
      kaputte Parameter = offen; Mandantengrenze.
   4. Fortschreiben mit Posten (Tagesklasse hängt an anderen Personen): nach jeder Einteilung dieselben Befunde wie frisch gerechnet.
   5. planeMonat mit langer Muss-Musterregel: Schalter AUS = keine Einteilung (fail-closed); Aggregate an = Einteilungen, keine verletzt
      die Vorgabe (Prüfweg), wiederholbar.
   6. Messung: planeMonat mit langen Musterregeln gegen den Lauf ohne Vorgaben (feste Obergrenze, relativ).

   Aufruf: npx vitest run pruefungen/intelligence-planer-aggregate-muster.test.js
   ========================================================================== */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { appendFileSync } from "node:fs";
import { vorgabenBefunde, vorgabePlanwirkung, neuesVorgabenBudget, vorgabenPlanFortschreiben, musterVerschaerft, MUSTER_LANG_GRUNDKOSTEN } from "../server/lib/vorgabenwirkung.mjs";
import { vorgabeAlsRegel, VORGABEN_WIRKUNG_GRENZE } from "../server/lib/vorgaben.mjs";
import { PLANER_AGGREGATE_AN, AGGREGAT_GRENZE, tagNr } from "../server/lib/engine/planeraggregate.mjs";
import { musterregel } from "../server/lib/regelbaukasten-erweitert.mjs";
import { kiPauseAktiv } from "../server/lib/ki-steuerung.mjs";
import { FEST, zufall, betriebe } from "./engine-golden.fixture.mjs";

const TAG = "2026-11-17";
const add = (t, n) => { const x = new Date(`${t}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const rng = (seed) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const DA = [{ id: "F" }, { id: "S" }, { id: "N" }];
const dienst = (id) => DA.find((d) => d.id === id);
const M = (parameter, extra = {}) => ({ id: "m", name: "Vorgabe m", regelart: "musterregel", parameter, geltung: { art: "betrieb" }, bezug: "monat",
  staerke: "muss", prioritaet: 1, grundlage: { art: "hausregel" }, status: "aktiv", ...extra });
const FOLGE = (max, danachFrei = 0, klassen = ["F"]) => ({ art: "hoechstensFolge", klassen, max, danachFrei });
const VERBOTEN = (abstandTage, von = ["N"], dann = ["F"]) => ({ art: "verbotenFolge", von, dann, abstandTage });
const AN = (aufwand) => neuesVorgabenBudget(aufwand, { aggregate: true });
const P = { id: "pp" };
const pruefe = (vorgaben, plan, { d = TAG, da = "F", p = P, budget = AN(), abw = {}, automatisch = false, einstellungen, m: mm } = {}) => {
  const m = mm || { dienstarten: DA, vorgaben, ...(einstellungen ? { einstellungen } : {}) };
  return vorgabenBefunde(m, p, d, dienst(da), { dienstAm: (x, t) => plan[t] || null, abwesendAm: (x, t) => abw[t] || null, budget, automatisch });
};
const regeln = (l) => l.map((b) => b.regel);
const halbVon = (par) => (par.art === "hoechstensFolge" ? par.max + (par.danachFrei || 0) + 1 : par.abstandTage === undefined ? 1 : par.abstandTage);

/** Referenz = der Regelbaukasten über das ganze Fenster d ± halb, mit und ohne die Einteilung, Vergleichsregel des kurzen Wegs
    (verletzt mit, und nicht: ohne verletzt bei gleich großer oder größerer Summe der Verstoßlängen). Abwesend = unbekannt (nie frei). */
const massVon = (e) => (e.fakten.verstoesse || []).reduce((s, x) => s + (x && Number.isFinite(x.laenge) && x.laenge > 0 ? x.laenge : 1), 0);
function referenz(v, plan, abw, d, da) {
  const h = halbVon(v.parameter), von = add(d, -h), bis = add(d, h);
  const mit = {}, ohne = {};
  for (let o = -h; o <= h; o++) {
    const t = add(d, o);
    const k = o === 0 ? "frei" : abw[t] ? undefined : plan[t] || "frei";
    if (k !== undefined) ohne[t] = k;
    const km = o === 0 ? da : k;
    if (km !== undefined) mit[t] = km;
  }
  const r = vorgabeAlsRegel({ ...v, gueltigAb: null, gueltigBis: null }, { wirkend: true });
  const mitE = musterregel(r, { tage: mit, von, bis, stichtag: d });
  if (mitE.status !== "verletzt") return [];
  const ohneE = musterregel(r, { tage: ohne, von, bis, stichtag: d });
  if (ohneE.status === "verletzt" && massVon(mitE) <= massVon(ohneE)) return [];
  return [`vorgabeMuss|Interne Vorgabe „${v.name}“: ${String(mitE.text).replace(`${v.name}: `, "")}`];
}
const bild = (l) => l.map((b) => (b.regel === "vorgabeOffen" ? `vorgabeOffen|${b.stufe}` : `${b.regel}|${b.text}`));

describe("1. Schalter AUS, Verwaltung, Obergrenze 372 Tage, Pause", () => {
  it("Schalter AUS (Vorgabe): lange Muster wie bisher offen mit Grund „Zeitraum über 62 Tage“, Automatik bei Muss Achtung; Verwaltung unverändert", () => {
    expect(PLANER_AGGREGATE_AN).toBe(false);
    expect(VORGABEN_WIRKUNG_GRENZE).toEqual({ aktive: 50, fensterTage: 62, aufwand: 200000 });   // keine Budgeterhöhung
    expect(AGGREGAT_GRENZE).toEqual({ fensterTage: 372 });
    const lang = M(FOLGE(40));
    const b = pruefe([lang], {}, { budget: neuesVorgabenBudget() });
    expect(b.map((x) => [x.regel, x.stufe])).toEqual([["vorgabeOffen", "hinweis"]]);
    expect(b[0].text).toMatch(/Zeitraum über 62 Tage \(rechnet erst mit den Aggregaten des Planers\)/);
    expect(pruefe([lang], {}, { budget: neuesVorgabenBudget(), automatisch: true })[0].stufe).toBe("achtung");
    expect(vorgabePlanwirkung(lang)).toEqual({ wirkt: false, grund: "Muster über mehr als 62 Tage rechnen nur im Testlauf; im Plan wirkt diese Regel noch nicht." });
    expect(vorgabePlanwirkung(M(FOLGE(29))).wirkt).toBe(true);   // kurz: wie bisher
  });
  it("mit Aggregaten: Fenster bis 372 Tage wirkt (halb 185), 373 nicht — Verwaltung und Prüfung sagen dasselbe; verbotene Folge ebenso", () => {
    const an = { aggregate: true };
    for (const [par, wirkt] of [[FOLGE(184), true], [FOLGE(183, 1), true], [FOLGE(185), false], [FOLGE(30), true], [VERBOTEN(31), true], [VERBOTEN(185), true],
      [VERBOTEN(186), false], [VERBOTEN(1e9), false]]) {
      const v = M(par);
      const w = vorgabePlanwirkung(v, an);
      expect(w.wirkt, JSON.stringify(par)).toBe(wirkt);
      const b = pruefe([v], {});
      if (wirkt) { expect(w.grund).toBe(null); expect(b, JSON.stringify(par)).toEqual([]); }
      else {
        expect(w.grund).toMatch(/Muster über 372 Tage/);
        expect(regeln(b)).toEqual(["vorgabeOffen"]);
        expect(b[0].text).toMatch(/Muster über 372 Tage/);
        expect(pruefe([v], {}, { automatisch: true })[0].stufe).toBe("achtung");
      }
    }
  });
  it("KI-Pause (auch unlesbarer Stand) hält die langen Muster an: offen, Automatik bei Muss Achtung; ohne Pause rechnen sie", () => {
    const einstellungen = { kiSteuerung: { pause: { aktiv: true } } };
    expect(kiPauseAktiv(einstellungen)).toBe(true);
    const plan = {};
    for (let i = 1; i <= 40; i++) plan[add(TAG, -i)] = "F";
    const v = M(FOLGE(40));
    const b = pruefe([v], plan, { einstellungen, automatisch: true });
    expect(b.map((x) => [x.regel, x.stufe])).toEqual([["vorgabeOffen", "achtung"]]);
    expect(b[0].text).toMatch(/pausiert/);
    expect(vorgabePlanwirkung(v, { aggregate: true, pause: true }).wirkt).toBe(false);
    expect(regeln(pruefe([v], plan, { einstellungen: { kiSteuerung: {} } }))).toEqual(["vorgabeMuss"]);
  });
  it("Fachfall: „höchstens 40 F in Folge“ — 40 F davor + F am Tag = Muss; Soll = Hinweis; S am Tag oder Lücke = nichts; Bestand nicht angelastet", () => {
    const plan = {};
    for (let i = 1; i <= 40; i++) plan[add(TAG, -i)] = "F";
    expect(pruefe([M(FOLGE(40))], plan).map((x) => [x.regel, x.stufe])).toEqual([["vorgabeMuss", "achtung"]]);
    expect(pruefe([M(FOLGE(40), { staerke: "soll" })], plan).map((x) => [x.regel, x.stufe])).toEqual([["vorgabeSoll", "hinweis"]]);
    expect(pruefe([M(FOLGE(40))], plan, { da: "S" })).toEqual([]);
    expect(pruefe([M(FOLGE(40))], { ...plan, [add(TAG, -20)]: null })).toEqual([]);
    /* 41 F schon im Bestand (verletzt): eine Einteilung, die den Block nicht verlängert (Tag nach einem freien Tag), wird nicht angelastet */
    const bestand = {};
    for (let i = 2; i <= 42; i++) bestand[add(TAG, -i)] = "F";
    expect(pruefe([M(FOLGE(40))], bestand)).toEqual([]);
    expect(regeln(pruefe([M(FOLGE(40))], { ...bestand, [add(TAG, -1)]: "F" }))).toEqual(["vorgabeMuss"]);   // verlängert
    /* vorwärts: F am Tag verbindet mit 40 F danach */
    const danach = {};
    for (let i = 1; i <= 40; i++) danach[add(TAG, i)] = "F";
    expect(regeln(pruefe([M(FOLGE(40))], danach))).toEqual(["vorgabeMuss"]);
    /* verbotene Folge mit 40 Tagen Abstand: N am Tag −40 → kein F am Tag; N am Tag → kein F am Tag +40 */
    expect(regeln(pruefe([M(VERBOTEN(40))], { [add(TAG, -40)]: "N" }))).toEqual(["vorgabeMuss"]);
    expect(regeln(pruefe([M(VERBOTEN(40))], { [add(TAG, 40)]: "F" }, { da: "N" }))).toEqual(["vorgabeMuss"]);
    expect(pruefe([M(VERBOTEN(40))], { [add(TAG, -39)]: "N" })).toEqual([]);
    /* Abwesenheit ist nie frei: Urlaub am Tag −40 (statt N) → unbekannt, kein Befund; „danach frei“ mit Urlaub danach → kein Verstoß */
    expect(pruefe([M(VERBOTEN(40))], { [add(TAG, -40)]: "N" }, { abw: { [add(TAG, -40)]: "urlaub" } })).toEqual([]);
    expect(pruefe([M(FOLGE(30, 2))], { [add(TAG, 1)]: "S" }, { abw: { [add(TAG, 1)]: "urlaub" } })).toEqual([]);
    expect(regeln(pruefe([M(FOLGE(30, 2))], { [add(TAG, 1)]: "S" }))).toEqual(["vorgabeMuss"]);
  });
});

/** Zufallsplan um d: Blöcke einer Klasse (Längen bis über max), Lücken, Abwesenheiten. */
function zufallsfall(r, lang) {
  const wahl = (l) => l[Math.floor(r() * l.length)];
  const anker = wahl(["2026-11-17", "2026-12-31", "2027-01-01", "2028-02-29", "2028-03-01", "2000-02-29", "2000-03-01", "2100-02-28", "2100-03-01", "2027-06-30"]);
  const d = add(anker, Math.floor(r() * 7) - 3);
  let par;
  if (r() < 0.6) {
    const klassen = wahl([["F"], ["N"], ["F", "S"], ["F", "S", "N"], ["frei"], ["N", "frei"]]);
    const h = lang ? 31 + Math.floor(r() * 155) : 1 + Math.floor(r() * 30);
    const danachFrei = Math.min(Math.max(0, h - 2), r() < 0.4 ? 0 : r() < 0.8 ? 1 + Math.floor(r() * 4) : 5 + Math.floor(r() * 40));
    const max = Math.max(1, h - danachFrei - 1);
    par = { ...FOLGE(max, danachFrei, klassen), ...(r() < 0.1 ? { frei: "S" } : {}) };
  } else {
    const a = lang ? 31 + Math.floor(r() * 155) : 1 + Math.floor(r() * 30);
    par = VERBOTEN(a, wahl([["N"], ["N", "S"], ["frei"], ["F"]]), wahl([["F"], ["F", "N"], ["frei"], ["S"]]));
  }
  const h = halbVon(par);
  const plan = {}, abw = {};
  const max = par.max || 3;
  /* Blöcke: Länge um max (auch genau max, max+1), dazwischen Lücken; dichter um d */
  for (let o = -h - 3; o <= h + 3;) {
    const k = wahl(["F", "S", "N", "F", "N"]);
    const len = r() < 0.5 ? 1 + Math.floor(r() * 4) : Math.max(1, max - 2 + Math.floor(r() * 5));
    for (let i = 0; i < len && o <= h + 3; i++, o++) if (o !== 0) plan[add(d, o)] = k;
    const luecke = Math.floor(r() * 4);
    for (let i = 0; i < luecke && o <= h + 3; i++, o++) if (o !== 0 && r() < 0.15) abw[add(d, o)] = wahl(["urlaub", "krank", "schulung"]);
    if (r() < 0.2) { const t = add(d, Math.floor(r() * (2 * h + 1)) - h); if (t !== d) plan[t] = wahl(["F", "S", "N", null]); }
  }
  /* Verbotene Folge: die zwei Paartage gezielt setzen, damit Treffer vorkommen */
  if (par.art === "verbotenFolge" && r() < 0.6) { plan[add(d, -par.abstandTage)] = wahl(["N", "S", "F"]); plan[add(d, par.abstandTage)] = wahl(["F", "N", "S"]); }
  return { d, par, plan, abw, da: wahl(["F", "S", "N"]) };
}

describe("2. Gleichwertigkeit: kurzer Weg = Regelbaukasten = Aggregatweg", () => {
  it("300 kurze Muster (Fenster ≤ 62 Tage): der bestehende kurze Weg (ohne und mit Aggregat-Budget) = Referenz des Regelbaukastens", () => {
    const r = rng(20261126);
    let treffer = 0;
    for (let i = 0; i < 300; i++) {
      const f = zufallsfall(r, false);
      const v = M(f.par);
      const erwartet = referenz(v, f.plan, f.abw, f.d, f.da);
      const opt = { d: f.d, da: f.da, abw: f.abw };
      expect(bild(pruefe([v], f.plan, { ...opt, budget: neuesVorgabenBudget() })), `Fall ${i} ${JSON.stringify(f.par)} ${f.d}`).toEqual(erwartet);
      expect(bild(pruefe([v], f.plan, { ...opt, budget: AN() })), `Fall ${i}`).toEqual(erwartet);
      if (erwartet.length) treffer++;
    }
    expect(treffer, "Befunde und Nicht-Befunde kommen vor").toBeGreaterThan(30);
    expect(treffer).toBeLessThan(270);
  }, 120000);
  it("400 lange Muster (Fenster 63–371 Tage; Jahreswechsel, Schaltjahre 2000/2028, 2100 kein Schaltjahr): Aggregatweg = Referenz, gleicher Text; Schalter AUS = offen", () => {
    const r = rng(4711);
    let treffer = 0;
    for (let i = 0; i < 400; i++) {
      const f = zufallsfall(r, true);
      const v = M(f.par);
      const erwartet = referenz(v, f.plan, f.abw, f.d, f.da);
      const opt = { d: f.d, da: f.da, abw: f.abw };
      expect(bild(pruefe([v], f.plan, { ...opt, budget: AN(10000000) })), `Fall ${i} ${JSON.stringify(f.par)} ${f.d} ${f.da}`).toEqual(erwartet);
      expect(regeln(pruefe([v], f.plan, { ...opt, budget: neuesVorgabenBudget() }))).toEqual(["vorgabeOffen"]);
      if (erwartet.length) treffer++;
    }
    expect(treffer, "Befunde und Nicht-Befunde kommen vor").toBeGreaterThan(40);
    expect(treffer).toBeLessThan(360);
  }, 120000);
  it("musterVerschaerft direkt gegen den Baukasten (1000 Fälle, kurz und lang, Fenster am Rand abgeschnitten): verschärft genau dann, wenn die Referenz einen Befund hat", () => {
    const r = rng(99);
    let ja = 0;
    for (let i = 0; i < 1000; i++) {
      const f = zufallsfall(r, r() < 0.5);
      const v = M(f.par);
      const s0 = tagNr(f.d), h = halbVon(f.par);
      const klasseAm = (t) => { const tt = new Date(t * 86400000).toISOString().slice(0, 10); return f.abw[tt] ? undefined : f.plan[tt] || "frei"; };
      const erwartet = referenz(v, f.plan, f.abw, f.d, f.da).length > 0;
      expect(musterVerschaerft(f.par, klasseAm, s0, s0 - h, s0 + h, f.da, "frei"), `Fall ${i} ${JSON.stringify(f.par)} ${f.d}`).toBe(erwartet);
      if (erwartet) ja++;
    }
    expect(ja).toBeGreaterThan(100);
    expect(ja).toBeLessThan(900);
  }, 120000);
});

describe("3. Rechenlast: Kosten vorab, Budget leer = offen, ungültige Eingaben, Mandantengrenze", () => {
  it("Kosten = Grundbetrag + ein Schritt je gelesenem Tag (+ Monat lesen beim ersten Zugriff); mit gelesenen Blöcken nur Grundbetrag + Tage", () => {
    expect(MUSTER_LANG_GRUNDKOSTEN).toBe(2);
    const budget = AN(1000);
    const m = { dienstarten: DA, vorgaben: [M(FOLGE(40))] };
    expect(pruefe(null, {}, { m, budget })).toEqual([]);
    /* gelesen: Tag −1 (q0) und Tag +1 — beide im November (30 Tage) */
    expect(1000 - budget.rest).toBe(2 + 2 + 30);
    const vorher = budget.rest;
    expect(pruefe(null, {}, { m, budget })).toEqual([]);
    expect(vorher - budget.rest).toBe(2 + 2);
  });
  it("Budget leer oder knapp (vor der Arbeit angemeldet): offen „Rechenbudget aufgebraucht“, nie bestanden; mit genau genug Budget der Befund", () => {
    const plan = {};
    for (let i = 1; i <= 40; i++) plan[add(TAG, -i)] = "F";
    const m = { dienstarten: DA, vorgaben: [M(FOLGE(40))] };
    const voll = AN(100000);
    expect(regeln(pruefe(null, plan, { m, budget: voll }))).toEqual(["vorgabeMuss"]);
    const noetig = 100000 - voll.rest;
    /* Treffer: Baukasten über das Fenster (83 Tage) mit/ohne = 2 je Tag, vorab angemeldet (Kostenmodell des kurzen Wegs) */
    expect(noetig).toBeGreaterThanOrEqual(MUSTER_LANG_GRUNDKOSTEN + 2 * 83);
    for (const rest of [0, 1, MUSTER_LANG_GRUNDKOSTEN, 40, noetig - 1]) {
      const b = pruefe(null, plan, { m, budget: AN(rest), automatisch: true });
      expect(b.map((x) => [x.regel, x.stufe]), `Budget ${rest}`).toEqual([["vorgabeOffen", "achtung"]]);
      expect(b[0].text).toMatch(/Rechenbudget aufgebraucht/);
    }
    expect(regeln(pruefe(null, plan, { m, budget: AN(noetig) }))).toEqual(["vorgabeMuss"]);
  });
  it("ungültiger Tag (30. Februar, falsches Format) und kaputte Parameter (leere Klassenliste, unbekannte Art): offen „Rechenfehler“, nie bestanden", () => {
    for (const d of ["2026-02-30", "2026-2-03"]) {
      const b = pruefe([M(FOLGE(40))], {}, { d, automatisch: true });
      expect(b.map((x) => [x.regel, x.stufe]), d).toEqual([["vorgabeOffen", "achtung"]]);
      expect(b[0].text).toMatch(/Rechenfehler/);
    }
    for (const par of [{ ...FOLGE(40), klassen: [] }, { ...FOLGE(40), klassen: [""] }, { ...FOLGE(40), art: "irgendwas", abstandTage: 40 }, { ...VERBOTEN(40), dann: [] }]) {
      const b = pruefe([M(par)], {}, { automatisch: true });
      expect(b.map((x) => [x.regel, x.stufe]), JSON.stringify(par)).toEqual([["vorgabeOffen", "achtung"]]);
      expect(b[0].text).toMatch(/Rechenfehler/);
    }
  });
  it("Mandantengrenze: zwei Betriebe, gleiche Personenkennung, ein Budget — jeder rechnet mit seinem eigenen Plan", () => {
    const planA = {};
    for (let i = 1; i <= 40; i++) planA[add(TAG, -i)] = "F";
    const budget = AN();
    const A = { dienstarten: DA, vorgaben: [M(FOLGE(40))] }, B = { dienstarten: DA, vorgaben: [M(FOLGE(40))] };
    expect(regeln(pruefe(null, planA, { m: A, budget }))).toEqual(["vorgabeMuss"]);
    expect(pruefe(null, {}, { m: B, budget })).toEqual([]);
    expect(regeln(pruefe(null, planA, { m: A, budget }))).toEqual(["vorgabeMuss"]);
  });
});

describe("4. Fortschreiben: Tagesklasse hängt bei Posten an anderen Personen (Review #572 A1) — Befunde wie frisch gerechnet", () => {
  it("150 Einteilungen in 10 Läufen mit Posten-Dienstart (eine Einteilung ändert auch den Tag einer anderen Person, gemeldet wird nur die eingeteilte)", () => {
    const r = rng(2611);
    const wahl = (l) => l[Math.floor(r() * l.length)];
    const DAP = [...DA, { id: "P", posten: true, quelle: "N" }];
    const pids = ["a", "b", "c"];
    let geaendert = 0, befunde = 0;
    for (let lauf = 0; lauf < 10; lauf++) {
      const vorgaben = [M(FOLGE(32, 1, ["N", "P"])), { ...M(VERBOTEN(45, ["N"], ["N", "F"])), id: "v2", name: "Vorgabe v2" }];
      const basis = {};
      for (const pid of pids) { basis[pid] = {}; for (let o = -80; o <= 80; o++) if (r() < 0.8) basis[pid][add(TAG, o)] = wahl(["N", "N", "N", "F", "S"]); }
      const dienstAm = (m) => (x, t) => { const k = `${x.id}|${t}`; const w = Object.prototype.hasOwnProperty.call(m.abweichungen, k) ? m.abweichungen[k] : basis[x.id][t] || null; return w === "-" ? null : w; };
      const pruefeAlle = (m, budget) => pids.flatMap((pid) => [-30, -1, 0, 1, 2, 30].map((o) => add(TAG, o)).flatMap((d) => ["N", "F"].map((da) =>
        bild(vorgabenBefunde(m, { id: pid }, d, dienst(da), { dienstAm: dienstAm(m), abwesendAm: () => null, budget })).join("~"))));
      const budget = AN(50000000);
      let m = { dienstarten: DAP, vorgaben, abweichungen: {} };
      pruefeAlle(m, budget);
      for (let s = 0; s < 15; s++) {
        const wer = wahl(pids), t = add(TAG, Math.floor(r() * 61) - 30);
        const neuAbw = { ...m.abweichungen, [`${wer}|${t}`]: wahl(["N", "P", "-", "F"]) };
        /* Verdrängung: eine andere Person wechselt am selben Tag (Posten-Besetzung) — nicht gemeldet */
        if (r() < 0.6) { const andere = wahl(pids.filter((x) => x !== wer)); neuAbw[`${andere}|${t}`] = wahl(["N", "P", "-"]); }
        const neu = { ...m, abweichungen: neuAbw };
        expect(vorgabenPlanFortschreiben(budget, m, neu, [{ personId: wer, tag: t }])).toBe(true);
        const vorher = pruefeAlle(m, AN(50000000));
        m = neu;
        const fort = pruefeAlle(m, budget);
        const frisch = pruefeAlle(m, AN(50000000));
        expect(fort, `Lauf ${lauf}, Schritt ${s}`).toEqual(frisch);
        if (JSON.stringify(vorher) !== JSON.stringify(frisch)) geaendert++;
        befunde += frisch.filter((x) => x.includes("vorgabeMuss")).length;
      }
    }
    expect(geaendert, "Einteilungen ändern Befunde").toBeGreaterThan(20);
    expect(befunde, "Befunde kommen vor").toBeGreaterThan(0);
  }, 300000);
});

describe("5. planeMonat mit langer Muss-Musterregel (demo3, Dezember, Nachtdienste frei gemacht)", () => {
  let F, B;
  beforeAll(async () => {
    vi.useFakeTimers({ now: new Date(FEST), toFake: ["Date"] });
    vi.spyOn(Math, "random").mockImplementation(zufall(20261126));
    F = await import("../src/lib/fachlogik.js");
    B = betriebe(F);
  }, 120000);
  afterAll(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
  const vorbereitet = (vorgaben) => {
    const m = structuredClone(B.find(([n]) => n.startsWith("demo3"))[1]);
    for (const p of m.personen) for (let t = "2026-12-01"; t <= "2026-12-31"; t = add(t, 1)) if (F.personTag(m, p, t).dienstId === "N") m.abweichungen[`${p.id}|${t}`] = "-";
    m.vorgaben = vorgaben;
    return m;
  };
  /* „kein Nachtdienst 35 Tage nach einem Nachtdienst“ (Fenster 71 Tage) und „höchstens 31 Diensttage in Folge“ (Fenster 65 Tage) */
  const dienste = () => B.find(([n]) => n.startsWith("demo3"))[1].dienstarten.map((x) => String(x.id));
  const lange = () => [M(VERBOTEN(35, ["N"], ["N"])), { ...M(FOLGE(31, 0, dienste())), id: "m2", name: "Vorgabe m2" }];

  it("Schalter AUS: Muss offen = Achtung, der Assistent teilt keinen Nachtdienst ein (fail-closed); Aggregate an: teilt ein, wiederholbar, und keine Einteilung verletzt die Vorgaben (Prüfweg, frisch)", () => {
    const m = vorbereitet(lange());
    const aus = F.planeMonat(m, "2026-12", { maxProPerson: 3 });
    expect(aus.gesetzt.filter((g) => g.dienstId === "N")).toEqual([]);
    const e1 = F.planeMonat(m, "2026-12", { maxProPerson: 3, aggregate: true });
    const e2 = F.planeMonat(m, "2026-12", { maxProPerson: 3, aggregate: true });
    expect(e2).toEqual(e1);
    const gesetztN = e1.gesetzt.filter((g) => g.dienstId === "N");
    expect(gesetztN.length, "mit Aggregaten werden Nachtdienste eingeteilt").toBeGreaterThan(0);
    const fertig = { ...m, abweichungen: e1.abweichungen };
    for (const g of e1.gesetzt) {
      const ohne = { ...fertig, abweichungen: { ...fertig.abweichungen, [`${g.personId}|${g.datum}`]: "-" } };
      const p = m.personen.find((x) => x.id === g.personId);
      const b = F.hindernisBefunde(ohne, p, g.datum, m.dienstarten.find((x) => x.id === g.dienstId), { vorgabenBudget: neuesVorgabenBudget(10000000, { aggregate: true }) });
      expect(b.filter((x) => x.regel === "vorgabeMuss" || x.regel === "vorgabeOffen"), `${g.personId} ${g.datum} ${g.dienstId}`).toEqual([]);
    }
  }, 600000);

  it("6. Messung: planeMonat mit fünf langen Musterregeln (Aggregate an) höchstens 2 × der Lauf ohne Vorgaben + 5 s", () => {
    const ohneM = vorbereitet([]);
    let t0 = performance.now();
    const ohne = F.planeMonat(ohneM, "2026-12", { maxProPerson: 3, aggregate: true });
    const tOhne = performance.now() - t0;
    const fuenf = [...lange(), { ...M(FOLGE(40, 2, ["N"])), id: "m3", name: "Vorgabe m3" }, { ...M(VERBOTEN(60, ["N"], ["F"])), id: "m4", name: "Vorgabe m4" },
      { ...M(FOLGE(100, 0, ["F"])), id: "m5", name: "Vorgabe m5" }];
    const mitM = vorbereitet(fuenf);
    t0 = performance.now();
    const mit = F.planeMonat(mitM, "2026-12", { maxProPerson: 3, aggregate: true });
    const tMit = performance.now() - t0;
    const zeile = `lange Muster demo3: ohne ${(tOhne / 1000).toFixed(1)} s (${ohne.gesetzt.length} gesetzt, ${ohne.offen.length} offen), 5 lange Muster ${(tMit / 1000).toFixed(1)} s (${mit.gesetzt.length} gesetzt, ${mit.offen.length} offen, Gründe ${JSON.stringify(mit.offen.reduce((a, o) => ({ ...a, [o.grund || "-"]: (a[o.grund || "-"] || 0) + 1 }), {}))})\n`;
    if (process.env.MESSUNG_DATEI) appendFileSync(process.env.MESSUNG_DATEI, zeile);
    expect(tMit, zeile).toBeLessThan(2 * tOhne + 5000);
  }, 600000);
});
