/* ==========================================================================
   WP-I7 Teil 3 — EIGENER PLANER, ERSTE SCHEIBE (server/lib/engine/planer.mjs)

   Ganzer Monat ohne Oberfläche: feste Punkte, Blöcke vor Einzeltagen,
   Verbessern mit fester Zugzahl und festem Startwert, Rangfolge, Nachprüfung,
   ein Aufwandsbudget je Aufruf. Schalter AUS; planeMonat unverändert.

   Geprüft (nur synthetische Daten, kein KI-Anteil):
   1. Schalter AUS, KI-Pause (auch unlesbar), ungültige Eingaben: nichts gerechnet, nichts gesetzt.
   2. Gleichwertigkeit: ohne Blöcke und ohne Verbessern Schritt für Schritt planeMonat (mit und ohne Posten);
      offene Stellen wie frisch gerechnet; planeMonat und der Bestand bleiben unverändert.
   3. Ganzer Plan: feste Punkte bleiben, jede eigene Einteilung besteht den Prüfweg (frisch nachgeprüft), Blöcke,
      Verbessern nach der Rangfolge, gleicher Datenstand + Startwert = gleicher Vorschlag.
   4. Aufwand: vorab angemeldet, nie überschritten, aufgebraucht = offen mit Grund; zu klein = nichts.
   5. Vorgaben: Muss ungeprüft = nicht einteilen (fail-closed); mit Aggregaten keine Muss-Verletzung (Prüfweg).
   6. Mandantengrenze, Abwesenheit, kein Name im Ergebnis; Nachprüfung direkt; Rangvergleich.
   7. Messung relativ zu planeMonat (feste Obergrenze).
   8. Posten (Review #572 A1): keine Person ohne eigene Einteilung hat danach einen anderen Dienst als im Bestand (frisch gerechnet);
      Verdrängung mehrerer Personen, Monatsgrenze, Budget der Vorgaben leer in der Nachprüfung.

   Aufruf: npx vitest run pruefungen/intelligence-planer-kern.test.js
   ========================================================================== */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { writeFileSync, readFileSync } from "node:fs";
import * as PL from "../server/lib/engine/planer.mjs";
import { planeVorschlag, nachpruefen, rangVergleich, zufallAus, PLANER_AN, PLANER_GRENZE, RANGFOLGE, NICHT_BEWERTET } from "../server/lib/engine/planer.mjs";
import { neuesVorgabenBudget } from "../server/lib/vorgabenwirkung.mjs";
import { stufeRang } from "../server/lib/engine/einsatz.mjs";
import { FEST, zufall, betriebe } from "./engine-golden.fixture.mjs";

const add = (t, n) => { const x = new Date(`${t}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const YM = "2026-12";
const TAGE = []; for (let t = "2026-12-01"; t <= "2026-12-31"; t = add(t, 1)) TAGE.push(t);
const schluessel = (l) => l.map((g) => `${g.personId}|${g.datum}|${g.dienstId}`).sort();

let F, B;
beforeAll(async () => {
  vi.useFakeTimers({ now: new Date(FEST), toFake: ["Date"] });
  vi.spyOn(Math, "random").mockImplementation(zufall(20261128));
  F = await import("../src/lib/fachlogik.js");
  B = betriebe(F);
}, 120000);
afterAll(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

/** Demobetrieb mit Lücken: alle Nachtdienste im Dezember frei gemacht (feste Punkte = übriger Plan). */
const mitLuecken = (name, mehr = false) => {
  const m = structuredClone(B.find(([n]) => n.startsWith(name))[1]);
  /* mehr: zusätzlich bei jeder vierten Person alle Dienste frei (Lücken in mehreren Dienstarten am selben Tag) */
  m.personen.forEach((p, i) => { for (const t of TAGE) { const d = F.personTag(m, p, t).dienstId; if (d === "N" || (mehr && d && i % 4 === 0)) m.abweichungen[`${p.id}|${t}`] = "-"; } });
  /* frischer Stand: die Zwischenspeicher hängen am Objekt (Postenbesetzung) und wurden oben vor dem Ändern gefüllt */
  return structuredClone(m);
};
/** Offene Stellen frisch gerechnet. */
const offenFrisch = (m, ab) => {
  const s = { ...m, abweichungen: ab };
  const l = [];
  for (const d of TAGE) { const bes = F.besetzung(s, d); for (const da of m.dienstarten) { const b = bes[da.id]; if (b.diff < 0 || b.qualFehlt) l.push({ datum: d, dienstId: da.id, fehlt: Math.max(0, -b.diff), qualFehlt: b.qualFehlt }); } }
  return l;
};
/** Frische, unabhängige Nachprüfung jeder eigenen Einteilung (eigenes Budget, Automatik). */
const pruefwegFehler = (m, r, budget) => {
  const fehler = [];
  const fertig = { ...m, abweichungen: r.abweichungen };
  for (const g of r.gesetzt) {
    const k = `${g.personId}|${g.datum}`;
    const ohne = { ...fertig, abweichungen: { ...fertig.abweichungen } };
    if (Object.prototype.hasOwnProperty.call(m.abweichungen, k)) ohne.abweichungen[k] = m.abweichungen[k]; else delete ohne.abweichungen[k];
    const p = m.personen.find((x) => x.id === g.personId);
    const da = m.dienstarten.find((x) => x.id === g.dienstId);
    if (F.personTag(m, p, g.datum).dienstId) fehler.push(`${k} hatte im Bestand Dienst`);
    for (const b of F.hindernisBefunde(ohne, p, g.datum, da, { vorgabenBudget: budget || neuesVorgabenBudget(), vorgabenAutomatisch: true }))
      if (stufeRang(b.stufe) >= 2) fehler.push(`${k} ${b.regel}`);
  }
  return fehler;
};

describe("1. Schalter, Pause, Eingaben", () => {
  it("Schalter AUS: ohne Freigabe rechnet nichts, setzt nichts, Bestand unverändert", () => {
    expect(PLANER_AN).toBe(false);
    const m = mitLuecken("demo3");
    const r = planeVorschlag(m, YM);
    expect(r.status).toBe("aus");
    expect(r.gesetzt).toEqual([]);
    expect(r.abweichungen).toBe(m.abweichungen);
    expect(r.aufwand).toBe(null);
    expect(planeVorschlag(m, YM, { freigabe: "ja" }).status, "nur ausdrücklich true").toBe("aus");
  });
  it("KI-Pause hält den Planer an, auch ein unlesbarer Pausenstand", () => {
    const m = mitLuecken("demo3");
    m.einstellungen = { ...m.einstellungen, kiSteuerung: { pause: { aktiv: true } } };   // ohne gültigen Stempel: unlesbar = Pause
    const r = planeVorschlag(m, YM, { freigabe: true });
    expect(r.status).toBe("pausiert");
    expect(r.gesetzt).toEqual([]);
  });
  it("ungültige Eingaben (NaN, Infinity, Bruchzahl, negativ, zu groß, kein Kalendermonat): nichts gerechnet", () => {
    const m = mitLuecken("demo3");
    const falsch = [
      ["2026-13", {}], ["2026-1", {}], ["abc", {}], [null, {}], ["1999-12", {}],
      [YM, { aufwand: NaN }], [YM, { aufwand: Infinity }], [YM, { aufwand: 1.5 }], [YM, { aufwand: -1 }], [YM, { aufwand: PLANER_GRENZE.aufwand + 1 }], [YM, { aufwand: "1000" }],
      [YM, { zuege: Infinity }], [YM, { zuege: PLANER_GRENZE.zuege + 1 }], [YM, { startwert: -1 }], [YM, { startwert: 2 ** 32 }], [YM, { startwert: 0.5 }],
      [YM, { maxProPerson: 0 }], [YM, { maxProPerson: PLANER_GRENZE.maxProPerson + 1 }], [YM, { vorgabenAufwand: Infinity }], [YM, { vorgabenAufwand: 10 ** 9 }],
    ];
    for (const [ym, o] of falsch) {
      const r = planeVorschlag(m, ym, { freigabe: true, ...o });
      expect(r.status, `${ym} ${JSON.stringify(o)}`).toBe("ungueltig");
      expect(r.gesetzt).toEqual([]);
    }
    expect(planeVorschlag({ personen: [] }, YM, { freigabe: true }).status).toBe("ungueltig");
  });
});

describe("2. Gleichwertigkeit zu planeMonat (ohne Blöcke, ohne Verbessern)", () => {
  for (const name of ["demo3", "demo1"]) {
    it(`${name}${name === "demo1" ? " (mit Posten)" : ""}: dieselben Einteilungen, dieselben Abweichungen; offen wie frisch gerechnet; Bestand und planeMonat unverändert`, () => {
      const m = mitLuecken(name, true);
      const vorher = structuredClone(m);
      const a = F.planeMonat(m, YM, { maxProPerson: 3 });
      const b = planeVorschlag(m, YM, { freigabe: true, bloecke: false, zuege: 0 });
      expect(b.status).toBe("ok");
      expect(schluessel(b.gesetzt)).toEqual(schluessel(a.gesetzt));
      expect(b.abweichungen).toEqual(a.abweichungen);
      expect(b.offen).toEqual(offenFrisch(m, a.abweichungen));
      expect(b.aufwand.ausgeschoepft).toBe(false);
      expect(m, "der Planer verändert den Bestand nicht").toEqual(vorher);
      expect(F.planeMonat(m, YM, { maxProPerson: 3 }), "planeMonat nach dem Planer unverändert").toEqual(a);
    }, 300000);
  }
});

describe("3. Ganzer Plan (demo3): feste Punkte, Prüfweg, Blöcke, Verbessern, Wiederholbarkeit", () => {
  let m, r, ohneV;
  beforeAll(() => {
    m = mitLuecken("demo3");
    r = planeVorschlag(m, YM, { freigabe: true });
    ohneV = planeVorschlag(m, YM, { freigabe: true, zuege: 0 });
  }, 300000);
  it("feste Punkte bleiben; jede Änderung ist eine eigene Einteilung einer Person ohne Dienst", () => {
    expect(r.status).toBe("ok");
    expect(r.gesetzt.length).toBeGreaterThan(0);
    const eigene = new Set(r.gesetzt.map((g) => `${g.personId}|${g.datum}`));
    for (const [k, v] of Object.entries(m.abweichungen)) if (!eigene.has(k)) expect(r.abweichungen[k], k).toBe(v);
    for (const k of Object.keys(r.abweichungen)) if (!eigene.has(k)) expect(Object.prototype.hasOwnProperty.call(m.abweichungen, k), k).toBe(true);
    for (const g of r.gesetzt) expect(r.abweichungen[`${g.personId}|${g.datum}`]).toBe(g.dienstId);
  });
  it("jede eigene Einteilung besteht den Prüfweg frisch nachgeprüft (setzt nie einen Verstoß); offen und Rang wie frisch gerechnet", () => {
    expect(pruefwegFehler(m, r)).toEqual([]);
    expect(r.offen.map(({ grund, ...x }) => x)).toEqual(offenFrisch(m, r.abweichungen));
    expect(r.rang.besetzung).toBe(r.offen.reduce((s, x) => s + x.fehlt + (x.qualFehlt ? 1 : 0), 0));
    expect(r.rang.gesetz).toBe(0);
    expect(r.rang.muss).toBe(0);
    expect(r.rang.stabilitaet).toBe(r.gesetzt.length);
    for (const k of NICHT_BEWERTET) expect(r.rang[k], `${k} nicht bewertet, nie erfüllt`).toBe(null);
  });
  it("Blöcke vor Einzeltagen: Nachtblöcke mit derselben Person an aufeinanderfolgenden Tagen", () => {
    const nb = r.gesetzt.filter((g) => g.art === "nachtblock");
    expect(nb.length).toBeGreaterThan(0);
    const jeP = {};
    for (const g of nb) (jeP[g.personId] = jeP[g.personId] || []).push(g.datum);
    expect(Object.values(jeP).some((l) => l.sort().some((d, i) => i > 0 && add(l[i - 1], 1) === d)), "mindestens ein zusammenhängender Block").toBe(true);
    const ohneBloecke = planeVorschlag(m, YM, { freigabe: true, bloecke: false, zuege: 0 });
    expect(ohneBloecke.gesetzt.some((g) => g.art !== "einzel")).toBe(false);
  }, 300000);
  it("Verbessern nach der Rangfolge: nie schlechter als der Aufbau; hier strikt weniger Lücken", () => {
    expect(rangVergleich(r.rang, ohneV.rang)).toBeLessThanOrEqual(0);
    expect(r.verbessert).toBeGreaterThan(0);
    expect(r.rang.besetzung).toBeLessThan(ohneV.rang.besetzung);
    expect(ohneV.verbessert).toBe(0);
    expect(ohneV.rang.besetzung - r.rang.besetzung, "jeder behaltene Zug schließt mindestens eine Lücke").toBeGreaterThanOrEqual(r.verbessert);
  });
  it("gleicher Datenstand + gleicher Startwert = gleicher Vorschlag; anderer Startwert ebenfalls nachgeprüft", () => {
    expect(planeVorschlag(m, YM, { freigabe: true })).toEqual(r);
    const r2 = planeVorschlag(m, YM, { freigabe: true, startwert: 7 });
    expect(r2.status).toBe("ok");
    expect(r2.startwert).toBe(7);
    expect(r2.abweichungen, "der Startwert steuert die Reihenfolge der Züge").not.toEqual(r.abweichungen);
    expect(pruefwegFehler(m, r2)).toEqual([]);
    expect(rangVergleich(r2.rang, ohneV.rang)).toBeLessThanOrEqual(0);
  }, 300000);
});

describe("4. Aufwand je Aufruf", () => {
  it("knappes Budget: angemeldet, nie überschritten, Rest offen mit Grund „aufwand“, Gesetztes besteht den Prüfweg", () => {
    const m = mitLuecken("demo3");
    const r = planeVorschlag(m, YM, { freigabe: true, aufwand: 12000 });
    expect(r.status).toBe("ok");
    expect(r.aufwand.ausgeschoepft).toBe(true);
    expect(r.aufwand.verbraucht).toBeLessThanOrEqual(12000);
    expect(r.offen.some((x) => x.grund === "aufwand")).toBe(true);
    expect(pruefwegFehler(m, r)).toEqual([]);
    const voll = planeVorschlag(m, YM, { freigabe: true });
    expect(r.gesetzt.length).toBeLessThan(voll.gesetzt.length);
  }, 300000);
  it("zu klein für die Nachprüfung (auch 0): nichts gerechnet, nichts gesetzt", () => {
    const m = mitLuecken("demo3");
    for (const a of [0, 100, 31 * m.personen.length - 1]) {
      const r = planeVorschlag(m, YM, { freigabe: true, aufwand: a });
      expect(r.status, String(a)).toBe("aufwand");
      expect(r.gesetzt).toEqual([]);
    }
  });
});

describe("5. Interne Vorgaben (fail-closed)", () => {
  const jahrN = (grenze) => ({ id: "jN", name: "Jahr N", regelart: "zaehlregel", parameter: { ereignis: "N", fenster: { art: "kalenderjahr" }, richtung: "hoechstens", grenze },
    geltung: { art: "betrieb" }, bezug: "monat", staerke: "muss", prioritaet: 1, grundlage: { art: "hausregel" }, status: "aktiv" });
  it("Muss über ein Kalenderjahr ohne Aggregate (nicht prüfbar): die Automatik teilt nicht ein; mit Aggregaten: teilt ein, keine Muss-Verletzung", () => {
    const m = mitLuecken("demo3");
    const nJahr = (p) => { let c = 0; for (let t = "2026-01-01"; t <= "2026-12-31"; t = add(t, 1)) if (F.personTag(m, p, t).dienstId === "N") c++; return c; };
    m.vorgaben = [jahrN(Math.max(...m.personen.map(nJahr)) + 2)];
    const ohne = planeVorschlag(m, YM, { freigabe: true });
    expect(ohne.status).toBe("ok");
    expect(ohne.gesetzt).toEqual([]);
    const mit = planeVorschlag(m, YM, { freigabe: true, aggregate: true });
    expect(mit.gesetzt.filter((g) => g.dienstId === "N").length).toBeGreaterThan(0);
    expect(pruefwegFehler(m, mit, neuesVorgabenBudget(undefined, { aggregate: true }))).toEqual([]);
    expect(mit.rang.muss).toBe(0);
  }, 300000);
});

describe("6. Mandantengrenze, Abwesenheit, kein Name, Nachprüfung, Rangvergleich", () => {
  it("zwei Betriebe mit denselben Personenkennungen: jedes Ergebnis wie allein gerechnet (auch mit Aggregaten)", () => {
    const a = mitLuecken("demo3");
    const b = mitLuecken("demo3");
    for (const t of TAGE.slice(0, 10)) for (const p of b.personen.slice(0, 6)) b.abweichungen[`${p.id}|${t}`] = "-";
    const allein = planeVorschlag(b, YM, { freigabe: true, aggregate: true });
    const ra = planeVorschlag(a, YM, { freigabe: true, aggregate: true });
    const rb = planeVorschlag(b, YM, { freigabe: true, aggregate: true });
    expect(rb).toEqual(allein);
    expect(planeVorschlag(a, YM, { freigabe: true, aggregate: true })).toEqual(ra);
    expect(schluessel(ra.gesetzt)).not.toEqual(schluessel(rb.gesetzt));
  }, 300000);
  it("Abwesenheit: wer im ganzen Monat Urlaub hat, wird nie eingeteilt; das Ergebnis nennt keine Namen", () => {
    const m = mitLuecken("demo3");
    const r0 = planeVorschlag(m, YM, { freigabe: true, zuege: 0 });
    const zahl = {}; for (const g of r0.gesetzt) zahl[g.personId] = (zahl[g.personId] || 0) + 1;
    const pid = Object.entries(zahl).sort((x, y) => y[1] - x[1])[0][0];
    m.abwesenheiten = [...m.abwesenheiten, { id: "u-test", personId: pid, art: "urlaub", von: "2026-12-01", bis: "2026-12-31", status: "genehmigt" }];
    const r = planeVorschlag(m, YM, { freigabe: true });
    expect(r.gesetzt.filter((g) => g.personId === pid)).toEqual([]);
    const text = JSON.stringify(r);
    for (const p of m.personen) for (const n of [p.vorname, p.nachname]) if (n && n.length > 2) expect(text.includes(`"${n}"`) || text.includes(` ${n}`), n).toBe(false);
  }, 300000);
  it("Nachprüfung direkt: Einteilung einer abwesenden Person, eines schon eingeteilten Tags oder ohne passende Abweichung fällt durch", () => {
    const m = mitLuecken("demo3");
    const r = planeVorschlag(m, YM, { freigabe: true, zuege: 0 });
    const stand = { ...m, abweichungen: r.abweichungen };
    const eigene = r.gesetzt.map((g) => ({ personId: g.personId, datum: g.datum, dienstId: g.dienstId }));
    expect(nachpruefen(m, stand, eigene, neuesVorgabenBudget()).durch).toBe(true);
    const g = eigene[0];
    const abw = { ...m, abwesenheiten: [...m.abwesenheiten, { id: "k", personId: g.personId, art: "krank", von: g.datum, bis: g.datum }] };
    expect(nachpruefen(abw, { ...stand, abwesenheiten: abw.abwesenheiten }, [g], neuesVorgabenBudget()).durch, "abwesend").toBe(false);
    expect(nachpruefen(m, stand, [{ ...g, dienstId: "F" === g.dienstId ? "S" : "F" }], neuesVorgabenBudget()).durch, "Abweichung passt nicht").toBe(false);
    /* Bestand hatte an dem Tag schon Dienst (keine eigene Einteilung): fällt durch */
    const p = m.personen.find((x) => TAGE.some((t) => F.personTag(m, x, t).dienstId));
    const t = TAGE.find((x) => F.personTag(m, p, x).dienstId);
    const fremd = { personId: p.id, datum: t, dienstId: F.personTag(m, p, t).dienstId };
    const st2 = { ...m, abweichungen: { ...m.abweichungen, [`${p.id}|${t}`]: fremd.dienstId } };
    expect(nachpruefen(m, st2, [fremd], neuesVorgabenBudget()).durch, "Bestand hatte Dienst").toBe(false);
  }, 300000);
  it("Rangvergleich streng in der Rangfolge; nicht Bewertetes entscheidet nichts; Startwertfolge fest", () => {
    expect(RANGFOLGE).toEqual(["gesetz", "besetzung", "muss", "soll", "verteilung", "wunsch", "stabilitaet"]);
    const r = (x) => ({ gesetz: 0, besetzung: 5, muss: 0, soll: 2, verteilung: null, wunsch: null, stabilitaet: 10, ...x });
    expect(rangVergleich(r({ gesetz: 1, besetzung: 0 }), r({}))).toBeGreaterThan(0);
    expect(rangVergleich(r({ besetzung: 4, soll: 9, stabilitaet: 99 }), r({}))).toBeLessThan(0);
    expect(rangVergleich(r({ muss: 1, besetzung: 5 }), r({ soll: 0 }))).toBeGreaterThan(0);
    expect(rangVergleich(r({ soll: 1 }), r({ stabilitaet: 0 }))).toBeLessThan(0);
    expect(rangVergleich(r({ verteilung: 0 }), r({ verteilung: null }))).toBe(0);
    expect(rangVergleich(r({ soll: null, stabilitaet: 1 }), r({ soll: 0 }))).toBeLessThan(0);
    const a = zufallAus(5), b = zufallAus(5), c = zufallAus(6);
    const fa = [a(), a(), a()], fb = [b(), b(), b()];
    expect(fa).toEqual(fb);
    expect([c(), c(), c()]).not.toEqual(fa);
  });
});

describe("7. Messung (relativ zu planeMonat, feste Obergrenze)", () => {
  it("demo1 (86 Personen, Posten), Dezember mit allen Nachtdiensten frei: Planer höchstens 3 × planeMonat + 5 s", () => {
    const m = mitLuecken("demo1");
    let t0 = performance.now();
    const a = F.planeMonat(m, YM, { maxProPerson: 3 });
    const tMonat = performance.now() - t0;
    t0 = performance.now();
    const r = planeVorschlag(m, YM, { freigabe: true });
    const tPlaner = performance.now() - t0;
    if (process.env.MESSUNG_DATEI) writeFileSync(process.env.MESSUNG_DATEI, JSON.stringify({ tMonat, tPlaner, monat: a.gesetzt.length, planer: r.gesetzt.length, rang: r.rang, aufwand: r.aufwand, verbessert: r.verbessert }, null, 1));
    expect(r.status).toBe("ok");
    expect(r.rang.gesetz).toBe(0);
    expect(tPlaner).toBeLessThan(3 * tMonat + 5000);
  }, 600000);
});

describe("8. Posten: Bestandspersonen bleiben unverändert (Review #572 A1)", () => {
  /** demo1: der Posten braucht eine Qualifikation, die die Rotation nicht sicher hat — der Planer füllt die Qualifikationslücke mit einer
      Einteilung auf den Posten; die Postenbesetzung verdrängt dann eine Person der Rotation auf ihren Quelldienst. */
  const szenario = () => {
    const m = mitLuecken("demo1");
    const po = m.dienstarten.find((x) => x.posten && x.quelle);
    const q = m.qualifikationen.map((x) => x.id).find((id) => { const n = m.personen.filter((p) => p.qualifikationen.includes(id)).length; return n >= 5 && n < 40; });
    po.mindestQual = { [q]: 2 };
    return { m, po };
  };
  /** Personen ohne eigene Einteilung, deren Dienst sich gegenüber dem Bestand geändert hat (frische Rechnung). */
  const veraendert = (m, r) => {
    const fertig = { ...m, abweichungen: r.abweichungen };
    const eig = new Set(r.gesetzt.map((g) => `${g.personId}|${g.datum}`));
    const l = [];
    for (const p of m.personen) for (const t of TAGE) if (!eig.has(`${p.id}|${t}`) && (F.personTag(fertig, p, t).dienstId || null) !== (F.personTag(m, p, t).dienstId || null)) l.push(`${p.id}|${t}`);
    return l;
  };
  it("Planer mit Blöcken und Verbessern: keine Bestandsperson verdrängt; die Postenstellen bleiben offen mit Grund „verdraengung“; Prüfweg frisch", () => {
    const { m, po } = szenario();
    expect(F.planeMonat(m, YM, { maxProPerson: 3 }).gesetzt.some((g) => g.dienstId === po.id), "der bestehende Assistent setzt hier auf den Posten").toBe(true);
    const r = planeVorschlag(m, YM, { freigabe: true });
    expect(r.status).toBe("ok");
    expect(veraendert(m, r)).toEqual([]);
    expect(r.offen.some((x) => x.dienstId === po.id && x.grund === "verdraengung")).toBe(true);
    expect(pruefwegFehler(m, r)).toEqual([]);
  }, 600000);
  it("Verbessern mit Posten: Züge, die eine Bestandsperson verdrängen würden, werden verworfen, die übrigen behalten (kein Rückfall auf den Aufbau)", () => {
    const m0 = structuredClone(B.find(([n]) => n.startsWith("demo1"))[1]);
    m0.personen.forEach((p, i) => { for (const t of TAGE) { const d = F.personTag(m0, p, t).dienstId; if (d === "N" || (d && i % 3 === 0)) m0.abweichungen[`${p.id}|${t}`] = "-"; } });
    const m = structuredClone(m0);
    const po = m.dienstarten.find((x) => x.posten && x.quelle);
    const q = m.qualifikationen.map((x) => x.id).find((id) => { const n = m.personen.filter((p) => p.qualifikationen.includes(id)).length; return n >= 5 && n < 40; });
    po.mindestQual = { [q]: 2 };
    const auf = planeVorschlag(m, YM, { freigabe: true, zuege: 0 });
    const r = planeVorschlag(m, YM, { freigabe: true });
    expect(veraendert(m, r)).toEqual([]);
    expect(r.verbessert, "mindestens ein Zug behalten").toBeGreaterThan(0);
    expect(r.rang.besetzung).toBeLessThan(auf.rang.besetzung);
  }, 600000);
  it("ohne Blöcke und Verbessern ebenso (Aufbau Schritt für Schritt)", () => {
    const { m } = szenario();
    const r = planeVorschlag(m, YM, { freigabe: true, bloecke: false, zuege: 0 });
    expect(veraendert(m, r)).toEqual([]);
  }, 600000);
  it("verdraengt: eine und mehrere Verdrängte, mehrere Posten-Einteilungen am Tag, nur der eigene Tag (Monatsgrenze), ohne Posten nie", () => {
    const { m, po } = szenario();
    const bestand = { ...m, abweichungen: { ...m.abweichungen } };
    const tag = "2026-12-31";
    const frei = m.personen.filter((p) => !F.personTag(m, p, tag).dienstId && F.personTag(m, p, tag).quelle !== "extern").slice(0, 3);
    expect(frei.length).toBe(3);
    const mit = (n) => { const ab = { ...m.abweichungen }; for (const p of frei.slice(0, n)) ab[`${p.id}|${tag}`] = po.id; return { ...m, abweichungen: ab }; };
    const schl = (n) => new Set(frei.slice(0, n).map((p) => `${p.id}|${tag}`));
    expect(typeof PL.verdraengt).toBe("function");
    expect(PL.verdraengt(bestand, mit(1), tag, schl(1))).toBe(1);
    expect(PL.verdraengt(bestand, mit(2), tag, schl(2))).toBe(2);
    expect(PL.verdraengt(bestand, mit(2), "2027-01-01", schl(2)), "Folgetag (anderer Monat) unberührt").toBe(0);
    expect(PL.verdraengt(bestand, bestand, tag, new Set())).toBe(0);
    const ohnePosten = { ...mit(2), dienstarten: m.dienstarten.map((x) => (x.posten ? { ...x, posten: false } : x)) };
    const bestandOhne = { ...bestand, dienstarten: ohnePosten.dienstarten };
    expect(PL.verdraengt(bestandOhne, ohnePosten, tag, schl(2)), "ohne Posten ändert eine Einteilung niemand anderen").toBe(0);
    /* Nachprüfung: dieselben Einteilungen als „eigene“ fallen durch (zusammen und einzeln) */
    const eig = (n) => frei.slice(0, n).map((p) => ({ personId: p.id, datum: tag, dienstId: po.id }));
    const n2 = nachpruefen(m, mit(2), eig(2), neuesVorgabenBudget());
    expect(n2.durch).toBe(false);
    expect(n2.verdraengte).toBe(2);
    expect(nachpruefen(m, mit(1), eig(1), neuesVorgabenBudget()).durch).toBe(false);
  }, 300000);
  it("Nachprüfung mit leerem Budget der Vorgaben (Muss über ein Kalenderjahr): fällt durch, nie bestanden", () => {
    const m = mitLuecken("demo3");
    m.vorgaben = [{ id: "jN", name: "Jahr N", regelart: "zaehlregel", parameter: { ereignis: "N", fenster: { art: "kalenderjahr" }, richtung: "hoechstens", grenze: 400 },
      geltung: { art: "betrieb" }, bezug: "monat", staerke: "muss", prioritaet: 1, grundlage: { art: "hausregel" }, status: "aktiv" }];
    const r = planeVorschlag(m, YM, { freigabe: true, aggregate: true, zuege: 0 });
    expect(r.gesetzt.length).toBeGreaterThan(0);
    const st = { ...m, abweichungen: r.abweichungen };
    const eig = r.gesetzt.map((g) => ({ personId: g.personId, datum: g.datum, dienstId: g.dienstId }));
    expect(nachpruefen(m, st, eig, neuesVorgabenBudget(undefined, { aggregate: true })).durch).toBe(true);
    expect(nachpruefen(m, st, eig, neuesVorgabenBudget(0, { aggregate: true })).durch).toBe(false);
    expect(nachpruefen(m, st, eig, neuesVorgabenBudget(500, { aggregate: true })).durch, "Budget mitten in der Nachprüfung leer").toBe(false);
  }, 300000);

  /* ---------- planeMonat (bestehender Assistent): Verdrängung geprüft (Review #577, Betreiberentscheidung 26.11.) ---------- */
  /** Muss/Soll-Vorgabe zur Quelldienstart des Postens: höchstens 0 Quelldienste in 7 Tagen. Wirkt nur, wenn jemand in den Quelldienst
      kommt (Einteilung oder Verdrängung); wer schon Quelldienste hat und dazu verdrängt wird, verletzt sie (mehr als ohne). */
  const quellVorgabe = (po, staerke) => [{ id: "q7", name: "Quelldienst 7 Tage", regelart: "zaehlregel",
    parameter: { ereignis: po.quelle, fenster: { art: "rollierend", laenge: 7, einheit: "tage" }, richtung: "hoechstens", grenze: 0 },
    geltung: { art: "betrieb" }, bezug: "monat", staerke, prioritaet: 1, grundlage: { art: "hausregel" }, status: "aktiv" }];
  /** Jede durch planeMonat verdrängte Person (frisch gerechnet) mit ihren Befunden ab Achtung für den neuen Dienst (eigenes Budget, Automatik). */
  const verdraengtGeprueft = (m, r) => {
    const fertig = { ...m, abweichungen: r.abweichungen };
    const eig = new Set(r.gesetzt.map((g) => `${g.personId}|${g.datum}`));
    const l = [];
    for (const p of m.personen) for (const t of TAGE) {
      if (eig.has(`${p.id}|${t}`)) continue;
      const nach = F.personTag(fertig, p, t).dienstId || null;
      if (nach === (F.personTag(m, p, t).dienstId || null)) continue;
      const da = nach && m.dienstarten.find((x) => x.id === nach);
      const bef = da ? F.hindernisBefunde(fertig, p, t, da, { vorgabenBudget: neuesVorgabenBudget(), vorgabenAutomatisch: true }).filter((b) => stufeRang(b.stufe) >= 2).map((b) => b.regel) : ["ohneDienst"];
      l.push({ k: `${p.id}|${t}`, bef });
    }
    return l;
  };
  it("planeMonat (Befund #577): Posten mit mindestQual, Muss zur Quelldienstart — keine verdrängte Person verletzt Muss; Postenstellen offen mit Grund „verdraengung“", () => {
    const { m, po } = szenario();
    m.vorgaben = quellVorgabe(po, "muss");
    const r = F.planeMonat(structuredClone(m), YM, { maxProPerson: 3 });
    const v = verdraengtGeprueft(m, r);
    expect(v.filter((x) => x.bef.length), "verdrängte Person mit Befund ab Achtung (ungeprüfte Muss-Verletzung)").toEqual([]);
    expect(r.offen.some((x) => x.dienstId === po.id && x.grund === "verdraengung"), "die Postenstelle bleibt offen mit klarem Grund").toBe(true);
    expect(pruefwegFehler(m, { ...r, gesetzt: r.gesetzt })).toEqual([]);
  }, 600000);
  it("planeMonat Soll zur Quelldienstart: Einteilung wie bisher, die Verdrängung steht mit Hinweis beim Grund; ohne Vorgabe ebenso ohne Befund ab Achtung", () => {
    const { m, po } = szenario();
    const ohne = F.planeMonat(structuredClone(m), YM, { maxProPerson: 3 });
    expect(verdraengtGeprueft(m, ohne).filter((x) => x.bef.length)).toEqual([]);
    expect(ohne.gesetzt.some((g) => g.dienstId === po.id && g.grund.includes("verdrängt ")), "Verdrängung genannt").toBe(true);
    m.vorgaben = quellVorgabe(po, "soll");
    const r = F.planeMonat(structuredClone(m), YM, { maxProPerson: 3 });
    expect(verdraengtGeprueft(m, r).filter((x) => x.bef.length)).toEqual([]);
    const mitHinweis = r.gesetzt.filter((g) => g.dienstId === po.id && g.grund.includes("verdrängt ") && g.grund.includes("Hinweis: "));
    expect(mitHinweis.length, "Soll: eingeteilt, Verdrängung mit Hinweis gekennzeichnet").toBeGreaterThan(0);
    expect(r.gesetzt.filter((g) => g.grund.includes(`verdrängt ${g.name} in`)), "die eingeteilte Person selbst gilt nie als verdrängt").toEqual([]);
    expect(schluessel(r.gesetzt), "Soll sperrt nie: dieselben Einteilungen wie ohne Vorgabe").toEqual(schluessel(ohne.gesetzt));
  }, 600000);
  it("planeMonat Aufwand der Verdrängungsprüfung: 0 = mit Posten nichts eingeteilt (Grund „aufwand“), klein = leer mitten im Lauf, nie ungeprüft", () => {
    const { m } = szenario();
    m.vorgaben = quellVorgabe(m.dienstarten.find((x) => x.posten && x.quelle), "muss");
    const null0 = F.planeMonat(structuredClone(m), YM, { maxProPerson: 3, verdraengungAufwand: 0 });
    expect(null0.gesetzt).toEqual([]);
    expect(null0.offen.length).toBeGreaterThan(0);
    expect(null0.offen.some((x) => x.grund === "aufwand")).toBe(true);
    const P = m.personen.length;
    const klein = F.planeMonat(structuredClone(m), YM, { maxProPerson: 3, verdraengungAufwand: 5 * P + 2 });
    expect(klein.gesetzt.length).toBeGreaterThan(0);
    expect(klein.gesetzt.length).toBeLessThanOrEqual(5);
    expect(klein.offen.some((x) => x.grund === "aufwand")).toBe(true);
    expect(verdraengtGeprueft(m, klein).filter((x) => x.bef.length)).toEqual([]);
    expect(F.PLANEMONAT_VERDRAENGUNG_AUFWAND).toBe(1000000);
  }, 600000);
  it("planeMonat Gegenprobe ohne Posten: Verdrängungsprüfung ohne Wirkung und ohne Aufwand (auch Aufwand 0 gleich), Bestand unverändert", () => {
    const m = mitLuecken("demo3", true);
    expect(m.dienstarten.some((x) => x.posten)).toBe(false);
    const vorher = structuredClone(m);
    const a = F.planeMonat(m, YM, { maxProPerson: 3 });
    expect(F.planeMonat(m, YM, { maxProPerson: 3, verdraengungAufwand: 0 })).toEqual(a);
    expect(a.gesetzt.every((g) => !g.grund.includes("verdrängt "))).toBe(true);
    expect(a.offen.every((x) => x.grund === undefined)).toBe(true);
    expect(m).toEqual(vorher);
  }, 600000);
  it("planeMonat Messung (demo1, Posten mit mindestQual): mit Verdrängungsprüfung höchstens 2 × derselbe Lauf ohne Posten-Kennzeichen + 5 s", () => {
    const { m } = szenario();
    const ohneP = structuredClone(m);
    ohneP.dienstarten = ohneP.dienstarten.map((x) => (x.posten ? { ...x, posten: false } : x));
    F.planeMonat(structuredClone(ohneP), YM, { maxProPerson: 3 });   // aufwärmen
    let t0 = performance.now();
    const o = F.planeMonat(structuredClone(ohneP), YM, { maxProPerson: 3 });
    const tOhne = performance.now() - t0;
    t0 = performance.now();
    const r = F.planeMonat(structuredClone(m), YM, { maxProPerson: 3 });
    const tMit = performance.now() - t0;
    if (process.env.MESSUNG_DATEI) writeFileSync(process.env.MESSUNG_DATEI, JSON.stringify({ tOhne, tMit, gesetztOhne: o.gesetzt.length, gesetztMit: r.gesetzt.length, offenMit: r.offen.length }, null, 1));
    expect(tMit).toBeLessThan(2 * tOhne + 5000);
  }, 600000);
  it("Quelle: planeMonat und Planer nutzen dieselbe Prüfung verdraengt (einsatz.mjs), keine Kopie", () => {
    const q = readFileSync("src/lib/fachlogik.js", "utf8");
    const f = q.slice(q.indexOf("export function planeMonat("), q.indexOf("\n}\n", q.indexOf("export function planeMonat(")));
    expect(f).toContain("verdraengt(bestand, stand, d, eigene, liste)");
    expect(q.split("export function verdraengt(").length - 1).toBe(0);
    expect(readFileSync("server/lib/engine/planer.mjs", "utf8")).not.toContain("function verdraengt(");
    expect(readFileSync("server/lib/engine/einsatz.mjs", "utf8")).toContain("export function verdraengt(bestand, stand, d, eigene, liste)");
  });
});
