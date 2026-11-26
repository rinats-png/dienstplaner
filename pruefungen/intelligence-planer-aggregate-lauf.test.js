/* ==========================================================================
   WP-I7 Teil 2 — PLANER-KERN: AGGREGATE EINMAL JE LAUF (Tagesnachführung)

   Teil 1 (#572) verwarf nach jeder Einteilung den ganzen Monatsblock der
   eingeteilten Person; im Betrieb mit Posten-Dienstarten wurde gar nichts
   übernommen (Review #572 A1) — alles las neu, das Budget war früh aufgebraucht.
   Jetzt: Blöcke einmal je Lauf, danach wird genau der geänderte Tag nachgelesen
   (mit Posten bei allen Personen mit einem Block des Monats).

   Geprüft (nur synthetische Daten, kein KI-Anteil):
   1. Gleichwertigkeit: nach dem Fortschreiben dieselben Zählungen wie frisch gerechnet (Zufallsfälle, Präfixsummen, Abwesenheit).
   2. Kosten: Nachlesen = ein Schritt je vorgemerktem Tag, vor dem Lesen angemeldet; aufgebraucht oder Lesefehler = Block unverändert
      und weiter vorgemerkt (kein halb nachgeführter Block); ungültige Tage = keine Übernahme.
   3. Posten: der Tag wird bei allen Personen des Monats vorgemerkt, ohne Posten nur bei der eingeteilten; andere Monate nie.
   4. Betrieb mit Posten (demo1): Folge von Einteilungen, nach jedem Fortschreiben dieselben Befunde wie frisch; planeMonat wiederholbar,
      Ergebnis über den Prüfweg nachgeprüft.

   Aufruf: npx vitest run pruefungen/intelligence-planer-aggregate-lauf.test.js
   ========================================================================== */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { vorgabenBefunde, neuesVorgabenBudget, vorgabenPlanFortschreiben } from "../server/lib/vorgabenwirkung.mjs";
import { aggregatZaehler, aggregateFortschreiben, neuerAggregatSpeicher, tagNr } from "../server/lib/engine/planeraggregate.mjs";
import { FEST, zufall, betriebe } from "./engine-golden.fixture.mjs";

const add = (t, n) => { const x = new Date(`${t}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const rng = (seed) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const DA = [{ id: "F" }, { id: "N" }];
const KLASSEN = ["F", "S", "N", "frei"];

/** lies über einen Plan { pid: { tag: { klasse, abw } } } (fehlend = frei). */
const lieser = (plan, pid) => (t) => (plan[pid] && plan[pid][t]) || { klasse: "frei", abw: 0 };
/** Zählungen über Bereiche (ganze und angeschnittene Monate), Klassen und Abwesenheit, Tagesklassen einzelner Tage. */
const bereiche = [["2026-01-01", "2026-12-31"], ["2026-03-05", "2026-03-20"], ["2026-02-10", "2026-04-02"], ["2026-11-17", "2026-11-17"], ["2026-06-01", "2026-06-30"]];
const bild = (z) => [
  ...bereiche.flatMap(([a, b]) => [...KLASSEN.map((k) => z.zaehle(k, tagNr(a), tagNr(b))), z.zaehleAbw(tagNr(a), tagNr(b))]),
  ...["2026-03-07", "2026-06-15", "2026-11-17"].map((t) => [z.klasse(tagNr(t)), z.abw(tagNr(t))]),
];

describe("1. Gleichwertigkeit: Fortschreiben + Nachlesen = frisch gerechnet", () => {
  it("200 Zufallsfälle: Folgen von 1–6 Änderungen (Klasse, Abwesenheit) an verschiedenen Personen, mit und ohne Posten, Präfixsummen schon gebildet", () => {
    const r = rng(20261127);
    const wahl = (l) => l[Math.floor(r() * l.length)];
    const tagZ = () => add("2026-01-01", Math.floor(r() * 365));
    for (let fall = 0; fall < 200; fall++) {
      const posten = r() < 0.5;
      const pids = ["a", "b", "c"];
      const plan = {};
      for (const pid of pids) { plan[pid] = {}; for (let i = 0; i < 120; i++) plan[pid][tagZ()] = { klasse: wahl(KLASSEN), abw: 0 }; }
      for (let i = 0; i < 10; i++) plan.a[tagZ()] = { klasse: undefined, abw: r() < 0.5 ? 1 : 0 };   // abwesend (ohne Klasse)
      const sp = neuerAggregatSpeicher();
      let m = { dienstarten: posten ? [...DA, { id: "P", posten: true, quelle: "N" }] : DA, abweichungen: {} };
      for (const pid of pids) bild(aggregatZaehler(sp, m, pid, lieser(plan, pid), () => {}));   // alle Blöcke und Präfixsummen gebildet
      const schritte = 1 + Math.floor(r() * 6);
      for (let s = 0; s < schritte; s++) {
        const wer = wahl(pids), t = r() < 0.3 ? "2026-11-17" : tagZ();
        plan[wer][t] = { klasse: wahl([...KLASSEN, undefined]), abw: r() < 0.2 ? 1 : 0 };
        if (plan[wer][t].klasse !== undefined) plan[wer][t].abw = 0;
        const aend = [{ personId: wer, tag: t }];
        /* mit Posten ändert eine Einteilung auch den Tag einer ANDEREN Person (Verdrängung vom Posten) — gemeldet wird nur die eingeteilte */
        if (posten && r() < 0.5) { const andere = wahl(pids.filter((x) => x !== wer)); plan[andere][t] = { klasse: wahl(KLASSEN), abw: 0 }; }
        const neu = { ...m, abweichungen: { ...m.abweichungen, [`${wer}|${t}`]: s } };
        expect(aggregateFortschreiben(sp, m, neu, aend)).toBe(true);
        m = neu;
        if (r() < 0.5) for (const pid of pids) bild(aggregatZaehler(sp, m, pid, lieser(plan, pid), () => {}));   // zwischendurch lesen
      }
      for (const pid of pids) {
        const fortgeschrieben = bild(aggregatZaehler(sp, m, pid, lieser(plan, pid), () => {}));
        const frisch = bild(aggregatZaehler(neuerAggregatSpeicher(), m, pid, lieser(plan, pid), () => {}));
        expect(fortgeschrieben, `Fall ${fall}, Person ${pid}, Posten ${posten}`).toEqual(frisch);
      }
    }
  });
});

describe("2. Kosten und fail-closed", () => {
  const vorbereiten = () => {
    const sp = neuerAggregatSpeicher();
    const plan = { a: {}, b: {} };
    const alt = { dienstarten: DA, abweichungen: {} };
    const z = aggregatZaehler(sp, alt, "a", lieser(plan, "a"), () => {});
    z.zaehle("N", tagNr("2026-11-05"), tagNr("2026-11-20"));                 // Block und Präfixsumme „N“ gebildet
    aggregatZaehler(sp, alt, "b", lieser(plan, "b"), () => {}).zaehle("N", tagNr("2026-11-01"), tagNr("2026-11-30"));
    plan.a["2026-11-17"] = { klasse: "N", abw: 0 };
    const neu = { ...alt, abweichungen: { "a|2026-11-17": "N" } };
    expect(aggregateFortschreiben(sp, alt, neu, [{ personId: "a", tag: "2026-11-17" }])).toBe(true);
    return { sp, plan, alt, neu };
  };
  it("Nachlesen kostet einen Schritt je vorgemerktem Tag (vorher: ganzer Monat neu); eine verfallene Präfixsumme wird mit Kosten neu gebildet", () => {
    const { sp, plan, neu } = vorbereiten();
    expect([...sp.jeBetrieb.get(neu).keys()].sort()).toEqual(["a|2026-11", "b|2026-11"]);
    let kosten = 0;
    const z = aggregatZaehler(sp, neu, "a", lieser(plan, "a"), (n) => { kosten += n; });
    expect(z.zaehle("N", tagNr("2026-11-01"), tagNr("2026-11-30"))).toBe(1);
    expect(kosten).toBe(1 + 1);                                                // 1 Tag nachgelesen + 1 Schritt (ganzer Monat)
    expect(z.zaehle("N", tagNr("2026-11-05"), tagNr("2026-11-20"))).toBe(1);
    expect(kosten).toBe(2 + 30 + 1);                                          // Präfixsumme verfallen: neu gebildet (30 Tage) + 1 Schritt
    let k2 = 0;
    aggregatZaehler(sp, neu, "b", lieser(plan, "b"), (n) => { k2 += n; }).zaehle("N", tagNr("2026-11-01"), tagNr("2026-11-30"));
    expect(k2).toBe(1);                                                        // ohne Posten: andere Person nicht vorgemerkt
  });
  it("Budget reicht nicht für das Nachlesen: Wurf, Block unverändert und weiter vorgemerkt; danach mit Budget richtig", () => {
    const { sp, plan, neu } = vorbereiten();
    const b = sp.jeBetrieb.get(neu).get("a|2026-11");
    const vorher = { kl: [...b.kl], tot: [...b.tot], neu: [...b.neu] };
    const z = aggregatZaehler(sp, neu, "a", lieser(plan, "a"), () => { throw new Error("Budget"); });
    expect(() => z.zaehle("N", tagNr("2026-11-01"), tagNr("2026-11-30"))).toThrow("Budget");
    expect({ kl: [...b.kl], tot: [...b.tot], neu: [...b.neu] }).toEqual(vorher);
    expect(aggregatZaehler(sp, neu, "a", lieser(plan, "a"), () => {}).zaehle("N", tagNr("2026-11-01"), tagNr("2026-11-30"))).toBe(1);
  });
  it("Lesefehler beim Nachlesen: Block unverändert und weiter vorgemerkt (kein halb nachgeführter Block)", () => {
    const { sp, neu } = vorbereiten();
    const b = sp.jeBetrieb.get(neu).get("a|2026-11");
    const vorher = { kl: [...b.kl], tot: [...b.tot], neu: [...b.neu] };
    const z = aggregatZaehler(sp, neu, "a", () => { throw new Error("lesen"); }, () => {});
    expect(() => z.klasse(tagNr("2026-11-17"))).toThrow("lesen");
    expect({ kl: [...b.kl], tot: [...b.tot], neu: [...b.neu] }).toEqual(vorher);
  });
  it("ungültige Tage (kein Datum, 30. Februar, falsches Format, NaN): keine Übernahme, nichts vorgemerkt; der neue Stand liest neu", () => {
    for (const tag of ["2026-02-30", "2026-1-01", "NaN", "", "2026-11-17T00:00", null, 20261117]) {
      const sp = neuerAggregatSpeicher();
      const alt = { dienstarten: DA, abweichungen: {} };
      aggregatZaehler(sp, alt, "a", () => ({ klasse: "frei", abw: 0 }), () => {}).zaehle("frei", tagNr("2026-02-01"), tagNr("2026-02-28"));
      const neu = { ...alt, abweichungen: { x: 1 } };
      expect(aggregateFortschreiben(sp, alt, neu, [{ personId: "a", tag: "2026-02-03" }, { personId: "a", tag }]), String(tag)).toBe(false);
      expect(sp.jeBetrieb.get(neu)).toBeUndefined();
      expect(sp.jeBetrieb.get(alt)).toBeUndefined();
    }
  });
});

describe("3. Posten: welcher Tag bei wem vorgemerkt wird", () => {
  it("mit Posten-Dienstart: der Tag bei allen Personen mit einem Block DIESES Monats; andere Monate und andere Tage nie", () => {
    const sp = neuerAggregatSpeicher();
    const alt = { dienstarten: [...DA, { id: "P", posten: true, quelle: "N" }], abweichungen: {} };
    for (const pid of ["a", "b", "c"]) aggregatZaehler(sp, alt, pid, () => ({ klasse: "frei", abw: 0 }), () => {}).zaehle("frei", tagNr("2026-10-01"), tagNr("2026-11-30"));
    const neu = { ...alt, abweichungen: { "a|2026-11-17": "P" } };
    expect(aggregateFortschreiben(sp, alt, neu, [{ personId: "a", tag: "2026-11-17" }])).toBe(true);
    const jeP = sp.jeBetrieb.get(neu);
    for (const pid of ["a", "b", "c"]) {
      expect([...jeP.get(`${pid}|2026-11`).neu], pid).toEqual([16]);
      expect([...jeP.get(`${pid}|2026-10`).neu], pid).toEqual([]);
    }
  });
});

describe("4. Betrieb mit Posten (demo1): Einteilungsfolge und planeMonat", () => {
  let F, B;
  beforeAll(async () => {
    vi.useFakeTimers({ now: new Date(FEST), toFake: ["Date"] });
    vi.spyOn(Math, "random").mockImplementation(zufall(20261126));
    F = await import("../src/lib/fachlogik.js");
    B = betriebe(F);
  }, 120000);
  afterAll(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
  const JAHR = { art: "kalenderjahr" };
  const regel = (ereignis, grenze, richtung = "hoechstens") => ({ id: `j${ereignis}${richtung}`, name: `Jahr ${ereignis}`, regelart: "zaehlregel",
    parameter: { ereignis, fenster: JAHR, richtung, grenze }, geltung: { art: "betrieb" }, bezug: "monat", staerke: "muss", prioritaet: 1,
    grundlage: { art: "hausregel" }, status: "aktiv" });

  it("12 Einteilungen (auch auf den Posten, Verdrängung anderer Personen): nach jedem Fortschreiben dieselben Befunde wie frisch gerechnet", () => {
    const m0 = structuredClone(B.find(([n]) => n.startsWith("demo1"))[1]);
    const po = m0.dienstarten.find((x) => x.posten && x.quelle);
    expect(po, "demo1 hat einen Posten mit Quelldienst").toBeTruthy();
    po.mindest = { mo_do: 1, fr: 1, sa: 1, so: 1 };
    const Q = po.quelle;
    const personen = m0.personen.filter((p) => p.rolle === "mitarbeiter").slice(0, 10);
    const tage = ["2026-11-03", "2026-11-04", "2026-11-10"];
    /* Grenzen nahe am Stand, damit Befunde und Nicht-Befunde vorkommen */
    const zahl = (m, p, k) => { let c = 0; for (let t = "2026-01-01"; t <= "2026-12-31"; t = add(t, 1)) if ((F.personTag(m, p, t).dienstId || "frei") === k) c++; return c; };
    m0.vorgaben = [regel(Q, zahl(m0, personen[0], Q)), regel(po.id, zahl(m0, personen[1], po.id) + 1), regel("frei", zahl(m0, personen[2], "frei"), "mindestens")];
    const pruefeAlle = (m, budget) => personen.flatMap((p) => tage.map((d) => vorgabenBefunde(m, p, d, m.dienstarten.find((x) => x.id === Q), {
      dienstAm: (q, t) => F.personTag(m, q, t).dienstId || null,
      abwesendAm: (q, t) => { const ab = F.abwesenheitAm(m, q.id, t); return ab ? ab.art : null; }, budget }).map((x) => `${p.id}|${d}|${x.regel}|${x.text}`)));
    const r = rng(11);
    const budget = neuesVorgabenBudget(10000000, { aggregate: true });
    let m = m0;
    pruefeAlle(m, budget);
    let verdraengt = 0, befunde = 0;
    for (let s = 0; s < 12; s++) {
      const p = personen[Math.floor(r() * personen.length)], d = tage[Math.floor(r() * tage.length)];
      const ziel = s % 3 === 0 ? po.id : s % 3 === 1 ? Q : "-";
      const neu = { ...m, abweichungen: { ...m.abweichungen, [`${p.id}|${d}`]: ziel } };
      if (personen.some((x) => x.id !== p.id && F.personTag(m, x, d).dienstId !== F.personTag(neu, x, d).dienstId)) verdraengt++;
      expect(vorgabenPlanFortschreiben(budget, m, neu, [{ personId: p.id, tag: d }])).toBe(true);
      m = neu;
      const fort = pruefeAlle(m, budget);
      const frisch = pruefeAlle(m, neuesVorgabenBudget(10000000, { aggregate: true }));
      expect(fort, `Schritt ${s}`).toEqual(frisch);
      befunde += frisch.length;
    }
    expect(verdraengt, "mindestens eine Einteilung ändert den Tag einer anderen Person").toBeGreaterThan(0);
    expect(befunde, "Befunde kommen vor").toBeGreaterThan(0);
  }, 300000);

  it("planeMonat (demo1 mit Posten, Aggregate): wiederholbar, setzt ein, und keine gesetzte Einteilung verletzt die Jahresregel (Prüfweg)", () => {
    const m = structuredClone(B.find(([n]) => n.startsWith("demo1"))[1]);
    const N = m.dienstarten.find((x) => x.id === "N");
    for (const p of m.personen) for (let t = "2026-12-01"; t <= "2026-12-31"; t = add(t, 1)) if (F.personTag(m, p, t).dienstId === "N") m.abweichungen[`${p.id}|${t}`] = "-";
    /* Grenze je Person: Nachtdienste im Jahr nach dem Freimachen + 2 (wer schon viele hat, bekommt im Dezember höchstens zwei) */
    const nJahr = (x, p) => { let c = 0; for (let t = "2026-01-01"; t <= "2026-12-31"; t = add(t, 1)) if (F.personTag(x, p, t).dienstId === "N") c++; return c; };
    const grenze = Math.max(...m.personen.filter((p) => p.rolle === "mitarbeiter").slice(0, 20).map((p) => nJahr(m, p))) + 2;
    m.vorgaben = [regel("N", grenze)];
    const e1 = F.planeMonat(m, "2026-12", { maxProPerson: 3, aggregate: true });
    const e2 = F.planeMonat(m, "2026-12", { maxProPerson: 3, aggregate: true });
    expect(e2).toEqual(e1);
    expect(e1.gesetzt.length, "mit Tagesnachführung reicht das Budget für Einteilungen").toBeGreaterThan(0);
    const fertig = { ...m, abweichungen: e1.abweichungen };
    for (const g of e1.gesetzt.filter((x) => x.dienstId === "N")) {
      const ohne = { ...fertig, abweichungen: { ...fertig.abweichungen, [`${g.personId}|${g.datum}`]: "-" } };
      const p = m.personen.find((x) => x.id === g.personId);
      const b = F.hindernisBefunde(ohne, p, g.datum, N, { vorgabenBudget: neuesVorgabenBudget(undefined, { aggregate: true }) });
      expect(b.filter((x) => x.regel === "vorgabeMuss"), `${g.personId} ${g.datum}`).toEqual([]);
    }
  }, 600000);
});
