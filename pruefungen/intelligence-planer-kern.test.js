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
   9. Planbefunde nachtfolge, ersatzruhe, sonntagsfrei (Betreiberentscheidung 26.11. Variante A, Review #584 B-1): planeMonat und
      Planer lösen keinen neuen Planbefund aus (pruefen frisch, November bis Januar); Grenzfälle, nicht bewertbar, Aufwand.

   Aufruf: npx vitest run pruefungen/intelligence-planer-kern.test.js
   ========================================================================== */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { writeFileSync, readFileSync } from "node:fs";
import * as PL from "../server/lib/engine/planer.mjs";
import { planeVorschlag, nachpruefen, rangVergleich, zufallAus, PLANER_AN, PLANER_GRENZE, PLANER_STANDARD, RANGFOLGE, NICHT_BEWERTET } from "../server/lib/engine/planer.mjs";
import { neuesVorgabenBudget } from "../server/lib/vorgabenwirkung.mjs";
import { kiSteuerungZusammen, kiSteuerungSicht, kiPauseAktiv } from "../server/lib/ki-steuerung.mjs";
import { stufeRang, planbefundeNeu, planbefundAufwandHoechst, PLANBEFUND_GRENZE } from "../server/lib/engine/einsatz.mjs";
import { ersatzruheBefunde } from "../server/lib/engine/befunde.mjs";
import { baueLeerenBetrieb } from "../server/lib/leerbetrieb.mjs";
import { FEST, zufall, betriebe } from "./engine-golden.fixture.mjs";

const add = (t, n) => { const x = new Date(`${t}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const YM = "2026-12";
const TAGE = []; for (let t = "2026-12-01"; t <= "2026-12-31"; t = add(t, 1)) TAGE.push(t);
/** Dezember und die ersten zehn Januartage (Vorwärtsprüfung über die Monatsgrenze). */
const TAGE_PLUS = [...TAGE]; for (let t = "2027-01-01"; t <= "2027-01-10"; t = add(t, 1)) TAGE_PLUS.push(t);
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
      /* Gründe offener Stellen (Planbefunde seit der Betreiberentscheidung 26.11.) stehen nicht in der frischen Rechnung; sie müssen
         dieselben sein wie bei planeMonat. */
      expect(b.offen.map(({ grund, ursache, regeln, vorgabenUnvollstaendig, ...x }) => x)).toEqual(offenFrisch(m, a.abweichungen));
      /* WP-I7 Teil 5: jede offene Stelle hat einen Grund oder eine Ursache (Kennung), nie nichts. */
      for (const x of b.offen) expect(x.grund || x.ursache, `${x.datum}|${x.dienstId}`).toBeTruthy();
      const gruende = (l) => l.filter((x) => x.grund).map((x) => `${x.datum}|${x.dienstId}|${x.grund}`).sort();
      expect(gruende(b.offen)).toEqual(gruende(a.offen));
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
    expect(r.offen.map(({ grund, ursache, regeln, vorgabenUnvollstaendig, ...x }) => x)).toEqual(offenFrisch(m, r.abweichungen));
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
    /* Jede zweite Person frei (bis zur Vorwärtsprüfung jede dritte): Seit der Aufbau bei einem Verstoß an Folgetagen die nächste Kandidatin
       nimmt, ist der Aufbau mit jeder dritten schon so gut, dass kein Zug mehr etwas schließt (29 → 26 Lücken, 0 Züge). Zusicherungen gleich. */
    m0.personen.forEach((p, i) => { for (const t of TAGE) { const d = F.personTag(m0, p, t).dienstId; if (d === "N" || (d && i % 2 === 0)) m0.abweichungen[`${p.id}|${t}`] = "-"; } });
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
    /* Ohne Posten nie „verdraengung“/„aufwand“; Gründe nur aus den Planbefunden (§ 11 ArbZG, Nachtdienste in Folge; 26.11.). */
    expect(a.offen.every((x) => x.grund === undefined || ["nachtfolge", "ersatzruhe", "sonntagsfrei"].includes(x.grund))).toBe(true);
    expect(m).toEqual(vorher);
  }, 600000);
  /** Delta-Review #579 B-1: Befunde ab Achtung (ohne Vorgaben) im Endstand, die im Bestand nicht bestanden — für JEDE Person mit Dienst
      (auch die eingeteilten selbst und Personen mit unverändertem Dienst), frisch auf dem fertigen Stand. */
  const neueHarte = (m, r, tage = TAGE) => {
    const fertig = { ...m, abweichungen: r.abweichungen };
    const opt = () => ({ vorgabenBudget: neuesVorgabenBudget(0), vorgabenAutomatisch: false });
    const harte = (st, p, t, da) => F.hindernisBefunde(st, p, t, da, opt()).filter((b) => stufeRang(b.stufe) >= 2 && !String(b.regel).startsWith("vorgabe")).map((b) => `${b.regel}|${b.text}`);
    const l = [];
    for (const t of tage) for (const p of m.personen) {
      const id = F.personTag(fertig, p, t).dienstId;
      if (!id) continue;
      const da = m.dienstarten.find((x) => x.id === id);
      if (!da) continue;
      const alt = F.personTag(m, p, t).dienstId === id ? new Set(harte(m, p, t, da)) : new Set();
      for (const k of harte(fertig, p, t, da)) if (!alt.has(k)) l.push(`${p.id}|${t}|${k.split("|")[0]}`);
    }
    return l;
  };
  for (const soll of [1, 2]) it(`planeMonat (Delta-Review #579 B-1, Posten Soll ${soll}): Personen mit keinAlleindienst bleiben nach einer Verdrängung nicht allein auf dem Posten`, () => {
    const m0 = mitLuecken("demo1");
    const po = m0.dienstarten.find((x) => x.posten && x.quelle);
    const q = m0.qualifikationen.map((x) => x.id).find((id) => { const n = m0.personen.filter((p) => p.qualifikationen.includes(id)).length; return n >= 5 && n < 40; });
    po.mindest = { mo_do: soll, fr: soll, sa: soll, so: soll };
    po.mindestQual = { [q]: 1 };
    for (const p of m0.personen) if (p.qualifikationen.includes(q)) p.einschraenkungen = { ...(p.einschraenkungen || {}), keinAlleindienst: true };
    const m = structuredClone(m0);
    const r = F.planeMonat(structuredClone(m), YM, { maxProPerson: 3 });
    /* Seit der Vorwärtsprüfung (Betreiberentscheidung 26.11.) ohne Ausnahme: auch „folge“ an Tagen NACH einer eigenen Einteilung. */
    expect(neueHarte(m, r, TAGE_PLUS), "neue Befunde ab Achtung im Endstand (u. a. keinAlleindienst, Dienste in Folge)").toEqual([]);
    expect(verdraengtGeprueft(m, r).filter((x) => x.bef.length)).toEqual([]);
    expect(pruefwegFehler(m, r)).toEqual([]);
  }, 600000);
  it("planeMonat (B-1) Aufwand: die Prüfung der Dienstmitglieder ist angemeldet — reicht er nur für Tagesvergleich und Verdrängten, wird nicht eingeteilt", () => {
    const m0 = structuredClone(B.find(([n]) => n.startsWith("demo1"))[1]);
    const po = m0.dienstarten.find((x) => x.posten && x.quelle);
    const q = m0.qualifikationen.map((x) => x.id).find((id) => { const n = m0.personen.filter((p) => p.qualifikationen.includes(id)).length; return n >= 5 && n < 40; });
    po.mindest = { mo_do: 1, fr: 1, sa: 1, so: 1 };
    po.mindestQual = { [q]: 1 };
    const m = structuredClone(m0);
    const P = m.personen.length;
    /* Vorbedingung: ohne Grenze verdrängt schon die erste Einteilung des Monats jemanden. */
    const voll = F.planeMonat(structuredClone(m), YM, { maxProPerson: 3 });
    expect(voll.gesetzt.length).toBeGreaterThan(0);
    const erste = voll.gesetzt[0];
    expect(erste.grund.includes("verdrängt "), "erste Einteilung verdrängt").toBe(true);
    /* Tagesvergleich (P) + eine verdrängte Person (1) reichen, die Mitglieder (je 2) nicht: nicht eingeteilt, Grund „aufwand“. */
    const r = F.planeMonat(structuredClone(m), YM, { maxProPerson: 3, verdraengungAufwand: P + 1 });
    expect(r.gesetzt).toEqual([]);
    expect(r.offen.some((x) => x.grund === "aufwand")).toBe(true);
    /* Obergrenze (C-3): größere Werte gelten als die Standardgrenze. */
    expect(F.planeMonat(structuredClone(m), YM, { maxProPerson: 3, verdraengungAufwand: 10 * F.PLANEMONAT_VERDRAENGUNG_AUFWAND })).toEqual(voll);
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
  /* ---------- Vorwärtsprüfung „Dienste in Folge“ (Betreiberentscheidung 26.11.; Review #579) ---------- */
  const D1 = "2026-12-01";
  /** demo3, Nachtdienste frei, höchstens 5 Dienste in Folge. X (beste Kandidatin für N am 1.12.) hat N vom 2.12. an `k` Tage in Folge
      (30.11. und der Tag nach dem Lauf frei); wer am 1.12. frei ist, ist dort abwesend — außer X und (mitY) Y, der letzten Kandidatin. */
  const folgeSzenario = (k, mitY = false) => {
    const m = mitLuecken("demo3");
    /* maxNachtFolge hoch: hier wirkt nur „Dienste in Folge“ (die Nachtregel prüft Abschnitt 9). */
    m.einstellungen = { ...m.einstellungen, maxFolge: 5, maxNachtFolge: 31 };
    const kand = F.ersatzVorschlaege(m, D1, "N").filter((x) => x.moeglich);
    const X = kand[0].person.id, Y = kand[kand.length - 1].person.id;
    m.abweichungen[`${X}|2026-11-30`] = "-";
    for (let j = 1; j <= k; j++) m.abweichungen[`${X}|${add(D1, j)}`] = "N";
    m.abweichungen[`${X}|${add(D1, k + 1)}`] = "-";
    const frei = m.personen.filter((p) => p.id !== X && !(mitY && p.id === Y) && !F.personTag(m, p, D1).dienstId);
    m.abwesenheiten = [...m.abwesenheiten, ...frei.map((p, i) => ({ id: `fv${i}`, personId: p.id, art: "urlaub", von: D1, bis: D1, status: "genehmigt" }))];
    return { m: structuredClone(m), X, Y };
  };
  const amTag = (r, pid) => r.gesetzt.filter((g) => g.personId === pid && g.datum === D1);
  it("planeMonat vorwärts (Befund #579): Einteilung VOR einer Folge bestehender Dienste, die sie zu lang macht — nicht gesetzt, offen mit Grund „folgeVorwaerts“", () => {
    const { m, X } = folgeSzenario(5);
    /* Vorbedingung: rückwärts allein sieht es nicht (X ist für den 1.12. einsetzbar und die einzige Kandidatin). */
    expect(F.ersatzVorschlaege(m, D1, "N").filter((x) => x.moeglich).map((x) => x.person.id)).toEqual([X]);
    const r = F.planeMonat(structuredClone(m), YM, { maxProPerson: 31 });
    expect(amTag(r, X)).toEqual([]);
    expect(r.offen.find((x) => x.datum === D1 && x.dienstId === "N")).toMatchObject({ grund: "folgeVorwaerts" });
    expect(neueHarte(m, r, TAGE_PLUS)).toEqual([]);
    expect(pruefwegFehler(m, r)).toEqual([]);
  }, 300000);
  it("planeMonat vorwärts: scheitert die beste Kandidatin, wird die nächste eingeteilt (die Stelle bleibt nicht unnötig offen)", () => {
    const { m, X, Y } = folgeSzenario(5, true);
    expect(F.ersatzVorschlaege(m, D1, "N").filter((x) => x.moeglich).map((x) => x.person.id), "X vor Y").toEqual([X, Y]);
    const r = F.planeMonat(structuredClone(m), YM, { maxProPerson: 31 });
    expect(amTag(r, X)).toEqual([]);
    expect(amTag(r, Y).map((g) => g.dienstId)).toEqual(["N"]);
    expect(neueHarte(m, r, TAGE_PLUS)).toEqual([]);
  }, 300000);
  it("planeMonat vorwärts Gegenproben: Folge genau maxFolge lang, Lücke am Tag danach — eingeteilt wie bisher (ohne Folgetage auch mit Aufwand 0)", () => {
    const { m, X } = folgeSzenario(4);
    const r = F.planeMonat(structuredClone(m), YM, { maxProPerson: 31 });
    expect(amTag(r, X).map((g) => g.dienstId), "1 + 4 = 5 Dienste in Folge sind erlaubt").toEqual(["N"]);
    expect(neueHarte(m, r, TAGE_PLUS)).toEqual([]);
    const { m: m2, X: X2 } = folgeSzenario(5);
    m2.abweichungen[`${X2}|${add(D1, 1)}`] = "-";   // Lücke am 2.12.: der Lauf danach hängt nicht an der Einteilung
    const r2 = F.planeMonat(structuredClone(m2), YM, { maxProPerson: 31 });
    expect(amTag(r2, X2).map((g) => g.dienstId)).toEqual(["N"]);
    const nur = (x) => x.gesetzt.filter((g) => g.datum === D1);
    expect(nur(F.planeMonat(structuredClone(m2), YM, { maxProPerson: 31, folgeAufwand: 0 })), "ohne Folgetage keine Arbeit").toEqual(nur(r2));
  }, 300000);
  it("planeMonat vorwärts Aufwand: vorab angemeldet (2 je Folgetag); reicht er nicht, nicht eingeteilt mit Grund „aufwand“; Obergrenze", () => {
    const { m, X } = folgeSzenario(5);
    for (const [a, grund] of [[0, "aufwand"], [9, "aufwand"], [10, "folgeVorwaerts"]]) {
      const r = F.planeMonat(structuredClone(m), YM, { maxProPerson: 31, folgeAufwand: a });
      expect(amTag(r, X), String(a)).toEqual([]);
      expect(r.offen.find((x) => x.datum === D1 && x.dienstId === "N"), String(a)).toMatchObject({ grund });
    }
    expect(F.PLANEMONAT_FOLGE_AUFWAND).toBe(1000000);
    const voll = F.planeMonat(structuredClone(m), YM, { maxProPerson: 31 });
    expect(F.planeMonat(structuredClone(m), YM, { maxProPerson: 31, folgeAufwand: 10 * F.PLANEMONAT_FOLGE_AUFWAND })).toEqual(voll);
  }, 300000);
  it("Planer vorwärts: Aufbau wie planeMonat (nächste Kandidatin), mit Blöcken und Verbessern kein neuer Befund; Nachprüfung lehnt die Einteilung ab", () => {
    const { m, X, Y } = folgeSzenario(5, true);
    const a = F.planeMonat(structuredClone(m), YM, { maxProPerson: 3 });
    const b = planeVorschlag(m, YM, { freigabe: true, bloecke: false, zuege: 0 });
    expect(schluessel(b.gesetzt)).toEqual(schluessel(a.gesetzt));
    expect(amTag(b, X)).toEqual([]);
    expect(amTag(b, Y).length).toBe(1);
    const voll = planeVorschlag(m, YM, { freigabe: true });
    expect(voll.status).toBe("ok");
    expect(neueHarte(m, voll, TAGE_PLUS)).toEqual([]);
    const st = { ...m, abweichungen: { ...m.abweichungen, [`${X}|${D1}`]: "N" } };
    expect(nachpruefen(m, st, [{ personId: X, datum: D1, dienstId: "N" }], neuesVorgabenBudget()).durch).toBe(false);
    const st4 = folgeSzenario(4);
    expect(nachpruefen(st4.m, { ...st4.m, abweichungen: { ...st4.m.abweichungen, [`${st4.X}|${D1}`]: "N" } }, [{ personId: st4.X, datum: D1, dienstId: "N" }], neuesVorgabenBudget()).durch, "Gegenprobe").toBe(true);
  }, 600000);
  it("Planer vorwärts im Nachtblock: die Fortsetzung endet vor dem Tag, der eine bestehende Folge zu lang machen würde (nicht erst die Nachprüfung)", () => {
    /* X beginnt den Nachtblock am 1.12. (einzige Kandidatin); 2.–3.12. frei, N vom 4.12. an fünf Tage. Am 3.12. wären es 1 + 2 + 5 > 5. */
    const { m, X } = folgeSzenario(0);
    for (let j = 3; j <= 7; j++) m.abweichungen[`${X}|${add(D1, j)}`] = "N";
    for (const j of [1, 2, 8]) m.abweichungen[`${X}|${add(D1, j)}`] = "-";
    const r = planeVorschlag(m, YM, { freigabe: true, zuege: 0 });
    expect(r.status, "Aufbau besteht die Nachprüfung").toBe("ok");
    const nb = r.gesetzt.filter((g) => g.personId === X && g.art === "nachtblock").map((g) => g.datum);
    expect(nb.slice(0, 2), "Block mit X begonnen").toEqual([D1, add(D1, 1)]);
    expect(nb).not.toContain(add(D1, 2));
    expect(neueHarte(m, r, TAGE_PLUS)).toEqual([]);
  }, 600000);
  for (const name of ["demo3", "demo1"]) it(`Endstand vorwärts (${name}, höchstens 3 Dienste in Folge, viele Lücken): planeMonat und Planer erzeugen keinen neuen Befund ab Achtung`, () => {
    const m = mitLuecken(name, true);
    m.einstellungen = { ...m.einstellungen, maxFolge: 3 };
    for (const h of [3, 31]) expect(neueHarte(m, F.planeMonat(structuredClone(m), YM, { maxProPerson: h }), TAGE_PLUS), `planeMonat ${h}`).toEqual([]);
    const r = planeVorschlag(m, YM, { freigabe: true });
    expect(r.status).toBe("ok");
    expect(neueHarte(m, r, TAGE_PLUS), "Planer").toEqual([]);
  }, 900000);
  it("Quelle: planeMonat und Planer nutzen dieselbe Vorwärtsprüfung folgeVorwaerts (einsatz.mjs), keine Kopie", () => {
    const q = readFileSync("src/lib/fachlogik.js", "utf8");
    const f = q.slice(q.indexOf("export function planeMonat("), q.indexOf("\n}\n", q.indexOf("export function planeMonat(")));
    expect(f).toContain("folgeVorwaerts(arbeit, x.person, d, da, folgeLeisten)");
    expect(q).not.toContain("export function folgeVorwaerts(");
    expect(readFileSync("server/lib/engine/planer.mjs", "utf8")).not.toContain("function folgeVorwaerts(");
    expect(readFileSync("server/lib/engine/einsatz.mjs", "utf8")).toContain("export function folgeVorwaerts(vorher, p, d, da, leisten, stand)");
  });
  it("Quelle: planeMonat und Planer nutzen dieselbe Prüfung verdraengt (einsatz.mjs), keine Kopie", () => {
    const q = readFileSync("src/lib/fachlogik.js", "utf8");
    const f = q.slice(q.indexOf("export function planeMonat("), q.indexOf("\n}\n", q.indexOf("export function planeMonat(")));
    expect(f).toContain("verdraengt(bestand, stand, d, eigene, liste)");
    expect(q.split("export function verdraengt(").length - 1).toBe(0);
    expect(readFileSync("server/lib/engine/planer.mjs", "utf8")).not.toContain("function verdraengt(");
    expect(readFileSync("server/lib/engine/einsatz.mjs", "utf8")).toContain("export function verdraengt(bestand, stand, d, eigene, liste)");
  });
});

/* ---------- 9. Planbefunde nachtfolge, ersatzruhe, sonntagsfrei (Betreiberentscheidung 26.11. Variante A; Review #584 B-1) ---------- */
describe("9. Planbefunde im Assistenten und im Planer (Nachtdienste in Folge, § 11 ArbZG)", () => {
  const PLAN_ARTEN = ["nachtfolge", "ersatzruhe", "sonntagsfrei"];
  const ANSICHTEN = [["2026-11-01", "2026-11-30"], ["2026-12-01", "2026-12-31"], ["2027-01-01", "2027-01-31"]];
  /** Planbefunde der drei Arten in den Prüfansichten November bis Januar (pruefen frisch), die es im Bestand nicht gab (Kennung + Schwere). */
  const neuePlan = (m, r) => {
    const l = [];
    for (const [von, bis] of ANSICHTEN) {
      const alt = new Set(F.pruefen(m, von, bis).filter((b) => PLAN_ARTEN.includes(b.art)).map((b) => `${b.id}|${b.schwere}`));
      for (const b of F.pruefen({ ...m, abweichungen: r.abweichungen }, von, bis))
        if (PLAN_ARTEN.includes(b.art) && !alt.has(`${b.id}|${b.schwere}`)) l.push(`${b.id}|${b.schwere}`);
    }
    return l;
  };
  const basis = () => structuredClone(B.find(([n]) => n.startsWith("demo3"))[1]);
  /** Eine Person ohne Abwesenheiten, durchgehend im Dienst (die synthetischen Fälle setzen ihren Plan selbst). */
  const person = (m) => m.personen.find((p) => p.eintritt && p.eintritt <= "2025-01-01" && !p.austritt && p.status !== "gesperrt"
    && !m.abwesenheiten.some((a) => a.personId === p.id));
  const istSonntag = (t) => new Date(`${t}T00:00:00Z`).getUTCDay() === 0;
  const setze = (m, pid, von, bis, wert, auchSonntag = true) => {
    for (let t = von; t <= bis; t = add(t, 1)) if (auchSonntag || !istSonntag(t)) m.abweichungen[`${pid}|${t}`] = wert;
  };
  /** Zählt die Anmeldungen; `rest` ist das Budget. */
  const zaehler = (rest = Infinity) => {
    const z = { aufrufe: 0, summe: 0, erste: null, f: null };
    z.f = (k) => { z.aufrufe++; if (z.erste === null) z.erste = k; if (k > rest) return false; rest -= k; z.summe += k; return true; };
    return z;
  };
  const D = "2026-12-08";   // Dienstag
  /** Die Person ist vom 1.11.2025 bis Ende 2028 dienstfrei (kein Sonntag, kein Feiertag, keine Nacht aus der Rotation); jeder Fall setzt
      seinen Plan danach selbst. */
  const fall = (m0, p) => { const m = structuredClone(m0); setze(m, p.id, "2025-11-01", "2028-12-31", "-"); return m; };
  const da = (m, id) => m.dienstarten.find((x) => x.id === id);

  it("nachtfolge (betrieblich): Lauf durch d länger als maxNachtFolge lehnt ab — vorwärts, rückwärts, verbindend; genau die Grenze, Tagdienst und ein unabhängiger bestehender Lauf nicht", () => {
    const m0 = basis(); const p = person(m0);
    expect(m0.einstellungen.maxNachtFolge).toBe(4);
    const mit = (naechte) => { const m = fall(m0, p, add(D, -70), add(D, 70)); for (const k of naechte) m.abweichungen[`${p.id}|${add(D, k)}`] = "N"; return structuredClone(m); };
    expect(planbefundeNeu(mit([1, 2, 3, 4]), p, D, da(m0, "N"), () => true)).toMatchObject({ regel: "nachtfolge", tag: D });
    expect(planbefundeNeu(mit([-4, -3, -2, -1]), p, D, da(m0, "N"), () => true)).toMatchObject({ regel: "nachtfolge", tag: D });
    expect(planbefundeNeu(mit([-2, -1, 1, 2]), p, D, da(m0, "N"), () => true)).toMatchObject({ regel: "nachtfolge", tag: D });
    expect(planbefundeNeu(mit([1, 2, 3]), p, D, da(m0, "N"), () => true), "genau 4 Nächte").toBe(null);
    expect(planbefundeNeu(mit([-14, -13, -12, -11, -10, -9]), p, D, da(m0, "N"), () => true), "bestehender Lauf ohne Bezug sperrt nicht").toBe(null);
    expect(planbefundeNeu(mit([-4, -3, -2, -1, 1, 2]), p, D, da(m0, "F"), () => true), "Tagdienst beendet den Lauf").toBe(null);
    const z = zaehler();
    expect(planbefundeNeu(mit([-5, -4, -3, 1, 2, 3]), p, D, da(m0, "F"), z.f)).toBe(null);
    expect([z.aufrufe, z.summe], "Tagdienst an einem Werktag, Nächte drumherum: nur die Auslöseprüfung der Ersatzruhe (110 Tage)").toEqual([1, 110]);
    /* Gegenprobe mit der Planprüfung: genau dieser Befund erscheint dort nach der Einteilung, davor nicht. */
    const m = mit([1, 2, 3, 4]);
    const nach = F.pruefen({ ...m, abweichungen: { ...m.abweichungen, [`${p.id}|${D}`]: "N" } }, "2026-12-01", "2026-12-31");
    expect(nach.filter((b) => b.art === "nachtfolge" && b.personId === p.id).map((b) => b.datum)).toEqual([add(D, 4)]);
    expect(F.pruefen(m, "2026-12-01", "2026-12-31").filter((b) => b.art === "nachtfolge" && b.personId === p.id)).toEqual([]);
  }, 120000);

  it("nachtfolge (Review #588 B-2): einen schon zu langen Lauf verlängern lehnt ab — in beide Richtungen gleich; Lauf bis zur Grenze erlaubt", () => {
    const m0 = basis(); const p = person(m0);
    const mit = (naechte) => { const m = fall(m0, p); for (const k of naechte) m.abweichungen[`${p.id}|${add(D, k)}`] = "N"; return structuredClone(m); };
    const N = da(m0, "N");
    const davor = mit([-5, -4, -3, -2, -1]), danach = mit([1, 2, 3, 4, 5]);
    /* Vorbedingung: der Lauf ist schon im Bestand zu lang (die Planprüfung meldet ihn einmal). */
    expect(F.pruefen(davor, "2026-12-01", "2026-12-31").filter((b) => b.art === "nachtfolge" && b.personId === p.id).length).toBe(1);
    expect(planbefundeNeu(davor, p, D, N, () => true), "sechste Nacht hinten an").toMatchObject({ regel: "nachtfolge", tag: D });
    expect(planbefundeNeu(danach, p, D, N, () => true), "sechste Nacht vorn an").toMatchObject({ regel: "nachtfolge", tag: D });
    expect(planbefundeNeu(mit([-3, -2, -1]), p, D, N, () => true), "vierte Nacht").toBe(null);
    expect(planbefundeNeu(mit([1, 2, 3]), p, D, N, () => true), "vierte Nacht vorn").toBe(null);
    expect(planbefundeNeu(mit([-12, -11, -10, -9, -8, -7, 1]), p, D, N, () => true), "zu langer Lauf anderswo sperrt nicht").toBe(null);
  }, 120000);

  it("nachtfolge nicht bewertbar (Grenze keine ganze Zahl ≥ 1): ein neuer Nachtdienst gilt nie als bestanden; ein Tagdienst ist nicht betroffen", () => {
    const m0 = basis(); const p = person(m0);
    for (const v of ["4", undefined, 0, 2.5, null]) {
      const m = fall(m0, p, add(D, -70), add(D, 70));
      m.einstellungen = { ...m.einstellungen, maxNachtFolge: v };
      const r = planbefundeNeu(m, p, D, da(m, "N"), () => true);
      expect(r, String(v)).toMatchObject({ regel: "nachtfolge" });
      expect(typeof r === "object" && r ? r.text : "").toContain("nicht bewertbar");
      expect(planbefundeNeu(m, p, D, da(m, "F"), () => true), String(v)).toBe(null);
    }
  }, 120000);

  /** Alle Sonntage eines Jahres. */
  const sonntage = (j) => { const l = []; for (let t = `${j}-01-01`; t <= `${j}-12-31`; t = add(t, 1)) if (istSonntag(t)) l.push(t); return l; };
  it("sonntagsfrei (§ 11 Abs. 1, gesetzlich): weniger als 15 freie Sonntage im Kalenderjahr nach der Einteilung lehnt ab — auch wenn es davor schon so war; Werktag und anderes Jahr nicht", () => {
    const m0 = basis(); const p = person(m0);
    const so = sonntage(2026);
    expect(so.length).toBe(52);
    const S = "2026-12-27";
    /* Werktage frei (Ersatzruhetage reichlich), die letzten `frei` Sonntage des Jahres frei, alle anderen mit Frühdienst. */
    const mitFrei = (frei) => { const m = fall(m0, p, "2025-11-01", "2027-02-28"); so.forEach((s, i) => { m.abweichungen[`${p.id}|${s}`] = i < so.length - frei ? "F" : "-"; }); return structuredClone(m); };
    expect(planbefundeNeu(mitFrei(15), p, S, da(m0, "F"), () => true)).toMatchObject({ regel: "sonntagsfrei", tag: S });
    expect(planbefundeNeu(mitFrei(10), p, S, da(m0, "F"), () => true), "schon unterschritten: noch ein Sonntag mehr").toMatchObject({ regel: "sonntagsfrei" });
    expect(planbefundeNeu(mitFrei(16), p, S, da(m0, "F"), () => true)).toBe(null);
    expect(planbefundeNeu(mitFrei(15), p, "2026-12-29", da(m0, "F"), () => true), "Werktag").toBe(null);
    expect(planbefundeNeu(mitFrei(15), p, "2027-01-03", da(m0, "F"), () => true), "Sonntag des Folgejahres zählt für 2027").toBe(null);
    /* Gegenprobe mit der Planprüfung (Ansicht Dezember: kein Sonntag mehr offen): unterschritten erst nach der Einteilung. */
    const m = mitFrei(15);
    const art = (st) => F.pruefen(st, "2026-12-01", "2026-12-31").filter((b) => b.art === "sonntagsfrei" && b.personId === p.id).map((b) => b.schwere);
    expect(art(m)).toEqual([]);
    expect(art({ ...m, abweichungen: { ...m.abweichungen, [`${p.id}|${S}`]: "F" } })).toEqual(["danger"]);
  }, 120000);

  it("ersatzruhe (§ 11 Abs. 3, gesetzlich): Sonntagsdienst ohne freien Werktag in zwei Wochen; Werktag als einziger Ersatztag eines früheren oder späteren Sonntags; Gegenproben", () => {
    const m0 = basis(); const p = person(m0);
    const S = "2026-12-13";
    /* Sonntag S: alle Werktage in S ± 13 mit Frühdienst; die Tage in `frei` bleiben frei. */
    const um = (frei, sonntagDienst) => {
      const m = fall(m0, p, add(S, -80), add(S, 80));
      setze(m, p.id, add(S, -13), add(S, 13), "F", false);
      for (const t of frei) m.abweichungen[`${p.id}|${t}`] = "-";
      if (sonntagDienst) m.abweichungen[`${p.id}|${S}`] = "F";
      return structuredClone(m);
    };
    const fd = da(m0, "F");
    expect(planbefundeNeu(um([], false), p, S, fd, () => true)).toMatchObject({ regel: "ersatzruhe", tag: S });
    expect(planbefundeNeu(um([add(S, -13)], false), p, S, fd, () => true), "ein freier Werktag 13 Tage davor genügt").toBe(null);
    expect(planbefundeNeu(um([add(S, 3)], true), p, add(S, 3), fd, () => true), "einziger Ersatztag des früheren Sonntags").toMatchObject({ regel: "ersatzruhe", tag: S });
    expect(planbefundeNeu(um([add(S, -3)], true), p, add(S, -3), fd, () => true), "einziger Ersatztag des späteren Sonntags").toMatchObject({ regel: "ersatzruhe", tag: S });
    expect(planbefundeNeu(um([add(S, 3), add(S, 4)], true), p, add(S, 3), fd, () => true), "zweiter freier Werktag").toBe(null);
    /* Gegenprobe mit der Planprüfung. */
    const m = um([add(S, 3)], true);
    const er = (st) => F.pruefen(st, "2026-12-01", "2026-12-31").filter((b) => b.art === "ersatzruhe" && b.personId === p.id).map((b) => b.datum);
    expect(er(m)).toEqual([]);
    expect(er({ ...m, abweichungen: { ...m.abweichungen, [`${p.id}|${add(S, 3)}`]: "F" } })).toEqual([S]);
  }, 120000);

  it("ersatzruhe Grenzfälle: Feiertage (acht Wochen), Sonntagsdienst im Folgemonat über die Jahresgrenze, Schaltjahr", () => {
    const m0 = basis(); const p = person(m0);
    const fd = da(m0, "F");
    /* Feiertage 25.12., 26.12., 1.1. gearbeitet, alle Werktage von 25.12. − 55 bis 1.1. + 55 gearbeitet (Sonntage frei); frei nur `frei`. */
    const fei = (frei) => {
      const m = fall(m0, p, "2026-09-01", "2027-04-30");
      setze(m, p.id, add("2026-12-25", -55), add("2027-01-01", 55), "F", false);
      for (const t of frei) m.abweichungen[`${p.id}|${t}`] = "-";
      return structuredClone(m);
    };
    const W = ["2027-02-03", "2027-02-04", "2027-02-05"];
    expect(planbefundeNeu(fei(W), p, W[2], fd, () => true), "drei Feiertage, drei Ersatztage: einer fehlt dann").toMatchObject({ regel: "ersatzruhe" });
    expect(planbefundeNeu(fei([...W, "2027-02-08"]), p, W[2], fd, () => true)).toBe(null);
    /* Sonntag 3.1.2027 gearbeitet, einziger freier Werktag in ± 13 ist der 31.12.2026 (Einteilung im Dezember). */
    const jg = fall(m0, p, "2026-10-01", "2027-03-31");
    setze(jg, p.id, "2026-12-21", "2027-01-16", "F", false);
    jg.abweichungen[`${p.id}|2027-01-03`] = "F";
    jg.abweichungen[`${p.id}|2026-12-31`] = "-";
    const mj = structuredClone(jg);
    expect(planbefundeNeu(mj, p, "2026-12-31", fd, () => true)).toMatchObject({ regel: "ersatzruhe", tag: "2027-01-03" });
    const er = (st) => F.pruefen(st, "2027-01-01", "2027-01-31").filter((b) => b.art === "ersatzruhe" && b.personId === p.id).map((b) => b.datum);
    expect(er(mj)).not.toContain("2027-01-03");
    expect(er({ ...mj, abweichungen: { ...mj.abweichungen, [`${p.id}|2026-12-31`]: "F" } }), "Prüfansicht Januar").toContain("2027-01-03");
    /* Schaltjahr: Sonntag 5.3.2028, einziger freier Werktag 29.2.2028. */
    const sj = fall(m0, p, "2027-12-01", "2028-05-31");
    setze(sj, p.id, "2028-02-21", "2028-03-18", "F", false);
    sj.abweichungen[`${p.id}|2028-03-05`] = "F";
    sj.abweichungen[`${p.id}|2028-02-29`] = "-";
    expect(planbefundeNeu(structuredClone(sj), p, "2028-02-29", fd, () => true)).toMatchObject({ regel: "ersatzruhe", tag: "2028-03-05" });
    sj.abweichungen[`${p.id}|2028-02-28`] = "-";
    expect(planbefundeNeu(structuredClone(sj), p, "2028-02-29", fd, () => true)).toBe(null);
  }, 120000);

  it("ersatzruhe nicht bewertbar (Bundesland unbekannt): ein neuer Arbeitstag gilt nie als bestanden", () => {
    const m0 = basis(); const p = person(m0);
    const m = fall(m0, p, add(D, -70), add(D, 70));
    m.bundesland = "XX";
    m.standorte = (m.standorte || []).map((s) => ({ ...s, bundesland: "XX" }));
    const r = planbefundeNeu(structuredClone(m), p, D, da(m, "F"), () => true);
    expect(r).toMatchObject({ regel: "ersatzruhe" });
    expect(typeof r === "object" && r ? r.text : "").toContain("nicht bewertbar");
  }, 120000);

  it("Aufwand in Personentagen (Review #588 B-3): Obergrenze VOR der Arbeit angemeldet; reicht er nicht: „aufwand“; ohne neuen Nacht- oder Arbeitstag keine Anmeldung", () => {
    const m0 = basis(); const p = person(m0);
    const ms = fall(m0, p);
    const S = "2026-12-13";
    const hoechst = planbefundAufwandHoechst(ms, 2026);
    let z = zaehler();
    expect(planbefundeNeu(ms, p, S, da(m0, "N"), z.f)).toBe(null);
    /* Nacht an einem Sonntag: Nachtlauf 2 · (4 + 1), Jahresbilanz 2 · 365 (letzter Sonntag + Zählung, Review #588), Auslöseprüfung 110;
       dann die Ersatzruhe in 9 Monatsansichten. */
    expect(z.aufrufe).toBe(2);
    expect(z.erste).toBe(2 * 5 + 2 * 365 + 110);
    expect(z.summe).toBeGreaterThan(z.erste);
    expect(z.summe).toBeLessThanOrEqual(hoechst);
    for (const rest of [0, z.erste - 1, z.erste, z.summe - 1]) { const y = zaehler(rest); expect(planbefundeNeu(ms, p, S, da(m0, "N"), y.f), String(rest)).toBe("aufwand"); }
    expect(planbefundeNeu(ms, p, S, da(m0, "N"), zaehler(z.summe).f)).toBe(null);
    z = zaehler(); expect(planbefundeNeu(ms, p, S, da(m0, "F"), z.f)).toBe(null);
    expect(z.erste, "Tagdienst am Sonntag: Jahresbilanz, Auslöseprüfung").toBe(2 * 365 + 110);
    z = zaehler(); expect(planbefundeNeu(ms, p, D, da(m0, "F"), z.f)).toBe(null);
    expect([z.aufrufe, z.summe], "Werktag ohne gearbeitete Sonn-/Feiertage in Reichweite: nur die Auslöseprüfung").toEqual([1, 110]);
    const mitF = structuredClone(ms); mitF.abweichungen[`${p.id}|${D}`] = "F";
    z = zaehler(); expect(planbefundeNeu(mitF, p, D, da(m0, "S"), z.f), "Dienstwechsel F → S (kein neuer Nacht- oder Arbeitstag)").toBe(null);
    expect(z.aufrufe).toBe(0);
    /* Die Obergrenze hängt nur an der Einstellung; das Budget ist eine echte Schranke (Messung im Nachweis). */
    expect(hoechst).toBeLessThan(100000);
    expect(PLANBEFUND_GRENZE).toBeGreaterThanOrEqual(100 * hoechst);
  }, 120000);

  it("ersatzruhe (Review #588 B-1, Kette vor dem Monat): d = 2.11.2026 liegt 60 Tage vor dem 1.1.2027 und außerhalb jeder Monatsansicht ± 56, ändert aber über den Anspruch 25.12. die Ansicht Januar", () => {
    const m0 = baueLeerenBetrieb({ name: "T", branche: "pflege", email: "x@example.org", land: "HE", raum: "r" }).mandanten[0];
    const p = { id: "p1", vorname: "A", nachname: "B", eintritt: "2020-01-01", zugehoerigkeit: [{ einheitId: m0.einheiten[0].id, ab: "2020-01-01" }], wochenstunden: 40, status: "aktiv", qualifikationen: [] };
    m0.personen = [p];
    /* Alle Werktage 1.9.2026–30.4.2027 gearbeitet (Sonntage frei, kein Sonntagsanspruch), darin 25.12., 26.12., 1.1.; frei nur d, 17.2., 19.2. und der 3.10. (sonst nähme dessen Anspruch d)
       Vorher: 25.12. → d (53 Tage), 26.12. → 17.2., 1.1. → 19.2. Nachher: 25.12. → 17.2., 26.12. → 19.2., 1.1. ohne Ersatzruhetag. */
    const d = "2026-11-02";
    setze(m0, p.id, "2026-09-01", "2027-04-30", "F", false);
    for (const t of [d, "2027-02-17", "2027-02-19", "2026-10-03"]) m0.abweichungen[`${p.id}|${t}`] = "-";
    const vor = structuredClone(m0);
    expect(planbefundeNeu(vor, p, d, da(vor, "F"), () => true)).toMatchObject({ regel: "ersatzruhe", tag: "2027-01-01" });
    const er = (st) => F.pruefen(st, "2027-01-01", "2027-01-31").filter((b) => b.art === "ersatzruhe").map((b) => b.datum);
    expect(er(vor)).toEqual([]);
    expect(er({ ...vor, abweichungen: { ...vor.abweichungen, [`${p.id}|${d}`]: "F" } })).toEqual(["2027-01-01"]);
    /* Gegenprobe: ein weiterer freier Tag für den 1.1. */
    vor.abweichungen[`${p.id}|2027-02-22`] = "-";
    expect(planbefundeNeu(structuredClone(vor), p, d, da(vor, "F"), () => true)).toBe(null);
  }, 120000);

  /** Eine Person im leeren Betrieb HE, Plan 1.8.2026–30.6.2027: Werktage Frühdienst, Sonntage frei, `frei` frei, `sonntag` gearbeitet. */
  const einePerson = (frei, sonntag) => {
    const m0 = baueLeerenBetrieb({ name: "T", branche: "pflege", email: "x@example.org", land: "HE", raum: "r" }).mandanten[0];
    const p = { id: "p1", vorname: "A", nachname: "B", eintritt: "2020-01-01", zugehoerigkeit: [{ einheitId: m0.einheiten[0].id, ab: "2020-01-01" }], wochenstunden: 40, status: "aktiv", qualifikationen: [] };
    m0.personen = [p];
    for (let t = "2026-08-01"; t <= "2027-06-30"; t = add(t, 1)) m0.abweichungen[`p1|${t}`] = istSonntag(t) ? "-" : "F";
    for (const t of frei) m0.abweichungen[`p1|${t}`] = "-";
    m0.abweichungen[`p1|${sonntag}`] = "F";
    return { m0, p };
  };
  const ersatzIn = (st, von, bis) => F.pruefen(st, von, bis).filter((b) => b.art === "ersatzruhe").map((b) => b.datum);

  it("ersatzruhe (Review #588, Kette nach dem Monat): Sonntagsdienst 21.2.2027 nach der Einteilung am 27.2.2027 nimmt den einzigen Ersatztag des 26.12.2026 — die Ansicht Dezember zeigt einen neuen Befund, die Einteilung lehnt ab", () => {
    /* Ein Anspruch NACH dem Monat (21.2.2027, Sonntagsfrist enger, wird vor den Feiertagsansprüchen zugeordnet) kann einen in der Ansicht
       Dezember gemeldeten Befund erzeugen: Die Aussage „Ansprüche nach dem Monat beeinflussen die gemeldeten nicht“ war falsch. */
    const { m0, p } = einePerson(["2026-10-03", "2026-11-10", "2027-02-15", "2027-02-27", "2027-04-20", "2027-04-21", "2027-04-22", "2027-04-23", "2027-04-24"], "2027-02-21");
    const d = "2027-02-27";
    const vor = structuredClone(m0), nach = { ...vor, abweichungen: { ...vor.abweichungen, [`p1|${d}`]: "F" } };
    expect(ersatzIn(vor, "2026-12-01", "2026-12-31")).toEqual([]);
    expect(ersatzIn(nach, "2026-12-01", "2026-12-31")).toEqual(["2026-12-26"]);
    expect(planbefundeNeu(vor, p, d, da(vor, "F"), () => true)).toMatchObject({ regel: "ersatzruhe", tag: "2026-12-26" });
    /* Gegenprobe: ein weiterer freier Werktag in Reichweite des 21.2. */
    vor.abweichungen["p1|2027-02-16"] = "-";
    expect(planbefundeNeu(structuredClone(vor), p, d, da(vor, "F"), () => true)).toBe(null);
  }, 120000);

  it("ersatzruhe (Review #588, Lagebild): das 14-Tage-Lagebild ab 24.12.2026 sagt dasselbe wie die Monatsansichten — nach der angenommenen Einteilung am 2.3.2027 kein neuer Befund zum 26.12.", () => {
    const { m0, p } = einePerson(["2026-10-03", "2026-11-10", "2027-02-15", "2027-03-02", "2027-04-20", "2027-04-21", "2027-04-22", "2027-04-23", "2027-04-24"], "2027-02-28");
    const d = "2027-03-02";
    const vor = structuredClone(m0), nach = { ...vor, abweichungen: { ...vor.abweichungen, [`p1|${d}`]: "F" } };
    expect(planbefundeNeu(vor, p, d, da(vor, "F"), () => true), "Monatsansichten unverändert: angenommen").toBe(null);
    /* Vor der Angleichung zeigte das Lagebild (eigene Zuordnung über 24.12. ± 56) nachher 26.12. und 1.1., die Monatsansichten nur den 1.1. */
    for (const st of [vor, nach]) {
      const lage = ersatzIn(st, "2026-12-24", "2027-01-06");
      const monate = [...ersatzIn(st, "2026-12-01", "2026-12-31"), ...ersatzIn(st, "2027-01-01", "2027-01-31")].filter((t) => t >= "2026-12-24" && t <= "2027-01-06");
      expect(lage).toEqual(monate);
    }
    expect(ersatzIn(nach, "2026-12-24", "2027-01-06")).toEqual(ersatzIn(vor, "2026-12-24", "2027-01-06"));
  }, 120000);

  it("ersatzruhe (Lagebild): jeder Schnitt (14 Tage, Monatsgrenzen, Jahreswechsel) gleich den Monatsansichten — dichte Zufallspläne, in denen die eigene Zuordnung des Schnitts anders ausfiele", () => {
    /* Dichte Pläne (85–97 % Arbeitstage, auch sonntags): Seeds, in denen die Zuordnung über den Schnitt ± 56 (Stand vor Teil 5) einen
       anderen Befund ergibt als die Monatsansichten (Review #595 R6). Vorbedingung unten: der alte Weg wiche ab. */
    const gen = (seed) => { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
    const m0 = baueLeerenBetrieb({ name: "T", branche: "pflege", email: "x@example.org", land: "HE", raum: "r" }).mandanten[0];
    const p = { id: "p1", vorname: "A", nachname: "B", eintritt: "2020-01-01", zugehoerigkeit: [{ einheitId: m0.einheiten[0].id, ab: "2020-01-01" }], wochenstunden: 40, status: "aktiv", qualifikationen: [] };
    m0.personen = [p];
    const sortiert = (l) => [...l].sort();
    let abweichendAlt = 0;
    for (const seed of [35, 64, 74, 76, 78]) {
      const rnd = gen(seed), q = 0.85 + rnd() * 0.12, ab = {};
      for (let t = "2026-06-01"; t <= "2027-06-30"; t = add(t, 1)) ab[`p1|${t}`] = rnd() < q ? "F" : "-";
      const st = { ...m0, abweichungen: ab };
      const monat = (f) => { const l = add(`${add(f, 32).slice(0, 7)}-01`, -1); return ersatzIn(st, f, l); };
      const alle = new Set(); for (const f of ["2026-10-01", "2026-11-01", "2026-12-01", "2027-01-01", "2027-02-01", "2027-03-01"]) for (const t of monat(f)) alle.add(t);
      for (const von of ["2026-10-20", "2026-11-24", "2026-12-24", "2027-01-15", "2026-12-28", "2027-02-22"]) {
        const bis = add(von, 13);
        const erwartet = sortiert([...alle].filter((t) => t >= von && t <= bis));
        expect(sortiert(ersatzIn(st, von, bis)), `${seed} ${von}`).toEqual(erwartet);
        if (sortiert(ersatzruheBefunde(st, p, von, bis).map((b) => b.datum)).join() !== erwartet.join()) abweichendAlt++;
      }
    }
    expect(abweichendAlt, "Vorbedingung: der alte Schnitt wiche in diesen Plänen ab").toBeGreaterThanOrEqual(5);
  }, 120000);

  it("Aufwand ist echte Arbeit (Review #588 B-3): Rechenzeit je angemeldetem Personentag im Median von drei Läufen unter 3 µs (gemessen rund 0,3–0,6 µs); die Grenze ist damit eine Schranke von höchstens 120 s", () => {
    const m = mitLuecken("demo3");
    const laeufe = [];
    for (let lauf = 0; lauf < 3; lauf++) {
      let k = 0, ms = 0;
      for (const id of ["N", "F"]) for (const p of m.personen.slice(0, 12)) for (const d of TAGE) {
        if (F.personTag(m, p, d).dienstId) continue;
        const t0 = performance.now();
        planbefundeNeu(m, p, d, m.dienstarten.find((x) => x.id === id), (x) => { k += x; return true; });
        ms += performance.now() - t0;
      }
      expect(k).toBeGreaterThan(100000);
      laeufe.push({ einheiten: k, ms, usJe: (ms * 1000) / k });
    }
    const median = laeufe.map((x) => x.usJe).sort((a, b) => a - b)[1];
    if (process.env.MESSUNG_DATEI) writeFileSync(process.env.MESSUNG_DATEI, JSON.stringify({ laeufe, median }, null, 1));
    expect(median).toBeLessThan(3);
    expect(PLANBEFUND_GRENZE * 3 / 1e6).toBeLessThanOrEqual(120);
  }, 300000);

  it("Planer (Review #588): Reserve der Nachprüfung auch für Einteilungen ohne Anmeldung (Rufbereitschaft am Tag) — Verbrauch nie über der Grenze; großes Budget: Ergebnis unverändert", () => {
    const m0 = baueLeerenBetrieb({ name: "T", branche: "pflege", email: "x@example.org", land: "HE", raum: "r" }).mandanten[0];
    m0.personen = [1, 2, 3, 4].map((i) => ({ id: `p${i}`, vorname: "A", nachname: `B${i}`, eintritt: "2020-01-01", zugehoerigkeit: [{ einheitId: m0.einheiten[0].id, ab: "2020-01-01" }], wochenstunden: 40, status: "aktiv", qualifikationen: [] }));
    m0.dienstarten = [{ ...m0.dienstarten[0], id: "R", name: "Ruf am Tag", kurz: "R", start: "08:00", ende: "16:00", pause: 0, form: "ruf", rufbereitschaft: true, ruhezeitNeutral: true, mindest: { mo_do: 1, fr: 1, sa: 1, so: 1 } }];
    const h = planbefundAufwandHoechst(m0, 2026);
    /* Fester Wert (Review #595 R10): HE 2026, maxNachtFolge 4: 2·5 + 2·366 + 110 + 9·2·(143 + 22·26 + 7·110). */
    expect(h).toBe(2 * 5 + 2 * 366 + 110 + 9 * 2 * (143 + 22 * 26 + 7 * 110));
    expect(h).toBe(27582);
    /* Vorbedingung: eine Einteilung meldet hier nichts an. */
    expect(planbefundeNeu(structuredClone(m0), m0.personen[0], "2026-12-01", m0.dienstarten[0], () => false)).toBe(null);
    for (const pb of [0, h - 1, h, 3 * h]) {
      const r = planeVorschlag(structuredClone(m0), YM, { freigabe: true, planbefundAufwand: pb, zuege: 0 });
      expect(r.status).toBe("ok");
      expect(r.aufwand.planbefund.verbraucht, String(pb)).toBeLessThanOrEqual(pb);
      expect(r.gesetzt.length, String(pb)).toBe(Math.floor(pb / h));
      expect(r.offen.some((x) => x.grund === "aufwand")).toBe(true);
    }
    const gross = planeVorschlag(structuredClone(m0), YM, { freigabe: true, zuege: 0 });
    expect(gross.gesetzt.length, "Höchstzahl 3 je Person").toBe(12);
    expect(gross.aufwand.planbefund.ausgeschoepft).toBe(false);
  }, 300000);

  /* Review #588 B-1: Fälle des Zufallsvergleichs (Seed 7, Durchlauf 644, 670, 758, 1001 aus dem Skript des Reviewers), nachgebaut mit
     demselben Generator: eine Person, leerer Betrieb HE, Plan 2026–2027 zufällig (55–95 % Arbeitstage). Früher angenommen, obwohl eine
     Monatsansicht danach einen neuen fehlenden Ersatzruhetag zeigt (Ketten über d ± 55 hinaus). Geprüft wird mit Frühdienst (nur die
     Ersatzruhe wirkt). */
  const zufallsPlan = (seed, bis) => {
    let s = seed >>> 0;
    const rnd = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    let erg = null;
    for (let it = 0; it <= bis; it++) {
      const q = 0.55 + rnd() * 0.4, qn = rnd() * 0.6;
      const ab = {};
      for (let t = "2026-01-01"; t <= "2027-12-31"; t = add(t, 1)) ab[`p1|${t}`] = rnd() < q ? (rnd() < qn ? "N" : "F") : "-";
      let d; do { d = add("2026-09-01", Math.floor(rnd() * 240)); } while (ab[`p1|${d}`] !== "-");
      rnd();
      if (it === bis) erg = { d, ab };
    }
    return erg;
  };
  for (const [lauf, d, tag] of [[644, "2027-03-20", "2027-05-17"], [670, "2027-04-28", "2027-05-06"], [758, "2026-10-26", "2026-12-26"], [1001, "2027-03-22", "2027-05-17"]])
    it(`ersatzruhe (Review #588 B-1, Seed 7 Durchlauf ${lauf}): Einteilung am ${d} lehnt ab — die Monatsansicht zeigt danach einen neuen fehlenden Ersatzruhetag zum ${tag}`, () => {
      const m0 = baueLeerenBetrieb({ name: "T", branche: "pflege", email: "x@example.org", land: "HE", raum: "r" }).mandanten[0];
      const p = { id: "p1", vorname: "A", nachname: "B", eintritt: "2020-01-01", zugehoerigkeit: [{ einheitId: m0.einheiten[0].id, ab: "2020-01-01" }], wochenstunden: 40, status: "aktiv", qualifikationen: [] };
      m0.personen = [p];
      const z = zufallsPlan(7, lauf);
      expect(z.d).toBe(d);
      const vor = { ...m0, abweichungen: z.ab };
      const fd = m0.dienstarten.find((x) => x.id === "F");
      expect(planbefundeNeu(vor, p, d, fd, () => true)).toMatchObject({ regel: "ersatzruhe", tag });
      /* Orakel: die Prüfansicht des Monats von `tag` (pruefen) vorher ohne, nachher mit dem Befund. */
      const f = `${tag.slice(0, 7)}-01`, l = add(`${add(f, 32).slice(0, 7)}-01`, -1);
      const er = (st) => F.pruefen(st, f, l).filter((b) => b.art === "ersatzruhe").map((b) => b.datum);
      expect(er(vor)).not.toContain(tag);
      expect(er({ ...vor, abweichungen: { ...z.ab, [`p1|${d}`]: "F" } })).toContain(tag);
    }, 120000);

  /** demo3, Nachtdienste frei, Dienste in Folge ohne wirksame Grenze (nur die Nachtregel wirkt). X (beste Kandidatin für N am 1.12.) hat N
      vom 2.12. an `k` Nächte; wer am 1.12. frei ist, ist dort abwesend — außer X und (mitY) Y. */
  const D1 = "2026-12-01";
  const nachtSzenario = (k, mitY = false) => {
    const m = mitLuecken("demo3");
    m.einstellungen = { ...m.einstellungen, maxFolge: 31 };
    const kand = F.ersatzVorschlaege(m, D1, "N").filter((x) => x.moeglich);
    const X = kand[0].person.id, Y = kand[kand.length - 1].person.id;
    m.abweichungen[`${X}|2026-11-30`] = "-";
    for (let j = 1; j <= k; j++) m.abweichungen[`${X}|${add(D1, j)}`] = "N";
    m.abweichungen[`${X}|${add(D1, k + 1)}`] = "-";
    const frei = m.personen.filter((p) => p.id !== X && !(mitY && p.id === Y) && !F.personTag(m, p, D1).dienstId);
    m.abwesenheiten = [...m.abwesenheiten, ...frei.map((p, i) => ({ id: `nf${i}`, personId: p.id, art: "urlaub", von: D1, bis: D1, status: "genehmigt" }))];
    return { m: structuredClone(m), X, Y };
  };
  const amTag = (r, pid) => r.gesetzt.filter((g) => g.personId === pid && g.datum === D1);
  it("planeMonat (Befund #584): Nacht VOR vier bestehenden Nächten — nicht gesetzt, offen mit Grund „nachtfolge“; mit Y die nächste Kandidatin; Aufwand 0 = „aufwand“", () => {
    const { m, X } = nachtSzenario(4);
    expect(F.ersatzVorschlaege(m, D1, "N").filter((x) => x.moeglich).map((x) => x.person.id), "Vorbedingung: X einsetzbar und einzige Kandidatin").toEqual([X]);
    const r = F.planeMonat(structuredClone(m), YM, { maxProPerson: 31 });
    expect(amTag(r, X)).toEqual([]);
    expect(r.offen.find((x) => x.datum === D1 && x.dienstId === "N")).toMatchObject({ grund: "nachtfolge" });
    expect(neuePlan(m, r)).toEqual([]);
    expect(pruefwegFehler(m, r)).toEqual([]);
    const a0 = F.planeMonat(structuredClone(m), YM, { maxProPerson: 31, planbefundAufwand: 0 });
    expect(amTag(a0, X)).toEqual([]);
    expect(a0.offen.find((x) => x.datum === D1 && x.dienstId === "N")).toMatchObject({ grund: "aufwand" });
    expect(F.PLANEMONAT_PLANBEFUND_AUFWAND).toBe(PLANBEFUND_GRENZE);
    expect(F.planeMonat(structuredClone(m), YM, { maxProPerson: 31, planbefundAufwand: 10 * F.PLANEMONAT_PLANBEFUND_AUFWAND })).toEqual(r);
    const mY = nachtSzenario(4, true);
    const rY = F.planeMonat(structuredClone(mY.m), YM, { maxProPerson: 31 });
    expect(amTag(rY, mY.X)).toEqual([]);
    expect(amTag(rY, mY.Y).map((g) => g.dienstId)).toEqual(["N"]);
    expect(neuePlan(mY.m, rY)).toEqual([]);
    const g = nachtSzenario(3);
    expect(amTag(F.planeMonat(structuredClone(g.m), YM, { maxProPerson: 31 }), g.X).map((x) => x.dienstId), "Gegenprobe: 1 + 3 Nächte erlaubt").toEqual(["N"]);
  }, 600000);

  it("Planer-Budgets getrennt (Review #588 B-3): Planbefunde belasten die Personenprüfungen nicht; knappes Planbefund-Budget mit reservierter Nachprüfung, nie überschritten", () => {
    const m = mitLuecken("demo3", true);
    const r1 = planeVorschlag(m, YM, { freigabe: true });
    expect(r1.status).toBe("ok");
    expect(r1.aufwand.ausgeschoepft).toBe(false);
    /* Genau der Verbrauch an Personenprüfungen (+ 1000) reicht für dasselbe Ergebnis; Planbefunde (je Aufruf Tausende Personentage) dürfen
       dieses Budget nicht belasten. */
    const r2 = planeVorschlag(m, YM, { freigabe: true, aufwand: r1.aufwand.verbraucht + 1000 });
    expect(r2.aufwand.ausgeschoepft).toBe(false);
    expect(schluessel(r2.gesetzt)).toEqual(schluessel(r1.gesetzt));
    const knapp = planeVorschlag(m, YM, { freigabe: true, planbefundAufwand: Math.floor(r1.aufwand.planbefund.verbraucht / 3) });
    expect(knapp.status).toBe("ok");
    expect(knapp.gesetzt.length).toBeGreaterThan(0);
    expect(knapp.aufwand.planbefund.ausgeschoepft).toBe(true);
    expect(knapp.aufwand.planbefund.verbraucht, "Reserve der Nachprüfung eingehalten").toBeLessThanOrEqual(knapp.aufwand.planbefund.grenze);
    expect(knapp.offen.some((x) => x.grund === "aufwand")).toBe(true);
  }, 900000);

  it("Planer: Aufbau wie planeMonat (nächste Kandidatin), Nachprüfung lehnt die Nacht vor vier Nächten ab, Gegenprobe drei", () => {
    const { m, X, Y } = nachtSzenario(4, true);
    const a = F.planeMonat(structuredClone(m), YM, { maxProPerson: 3 });
    const b = planeVorschlag(m, YM, { freigabe: true, bloecke: false, zuege: 0 });
    expect(schluessel(b.gesetzt)).toEqual(schluessel(a.gesetzt));
    expect(amTag(b, X)).toEqual([]);
    expect(amTag(b, Y).length).toBe(1);
    const st = { ...m, abweichungen: { ...m.abweichungen, [`${X}|${D1}`]: "N" } };
    expect(nachpruefen(m, st, [{ personId: X, datum: D1, dienstId: "N" }], neuesVorgabenBudget()).durch).toBe(false);
    /* Eigenes Budget der Planbefunde (Personentage, Review #588 B-3): ungültig = nichts gerechnet; 0 = nichts eingeteilt, Grund „aufwand“. */
    for (const v of [-1, 1.5, "1", PLANER_GRENZE.planbefundAufwand + 1]) expect(planeVorschlag(m, YM, { freigabe: true, planbefundAufwand: v }).status, String(v)).toBe("ungueltig");
    const null0 = planeVorschlag(m, YM, { freigabe: true, bloecke: false, zuege: 0, planbefundAufwand: 0 });
    expect(null0.gesetzt).toEqual([]);
    expect(null0.offen.some((x) => x.grund === "aufwand")).toBe(true);
    expect(null0.aufwand.planbefund).toMatchObject({ grenze: 0, verbraucht: 0, ausgeschoepft: true });
    expect(b.aufwand.planbefund.verbraucht).toBeGreaterThan(0);
    expect(b.aufwand.planbefund.verbraucht).toBeLessThanOrEqual(PLANER_STANDARD.planbefundAufwand);
    const g = nachtSzenario(3);
    expect(nachpruefen(g.m,{ ...g.m, abweichungen: { ...g.m.abweichungen, [`${g.X}|${D1}`]: "N" } }, [{ personId: g.X, datum: D1, dienstId: "N" }], neuesVorgabenBudget()).durch, "Gegenprobe").toBe(true);
  }, 600000);

  for (const [name, mehr] of [["demo3", false], ["demo3", true], ["demo2", false], ["demo1", false]]) it(`Endstand (${name}${mehr ? ", viele Lücken" : ", Nachtdienste frei"}): planeMonat${name === "demo3" && mehr ? " und Planer" : ""} ohne neuen Planbefund nachtfolge/ersatzruhe/sonntagsfrei`, () => {
    const m = mitLuecken(name, mehr);
    for (const h of name === "demo1" ? [31] : [3, 31]) {
      const r = F.planeMonat(structuredClone(m), YM, { maxProPerson: h });
      expect(neuePlan(m, r), `planeMonat ${h}`).toEqual([]);
      for (const o of r.offen.filter((x) => x.grund)) expect(["vorgabe", "verdraengung", "aufwand", "folgeVorwaerts", ...PLAN_ARTEN]).toContain(o.grund);
    }
    if (name === "demo3" && mehr) {
      const r = planeVorschlag(m, YM, { freigabe: true });
      expect(r.status).toBe("ok");
      expect(neuePlan(m, r), "Planer").toEqual([]);
    }
  }, 900000);

  it("Quelle: eine Rechnung — pruefen, planeMonat und Planer nutzen dieselben Funktionen (befunde.mjs, planbefundeNeu), keine Kopie", () => {
    const q = readFileSync("src/lib/fachlogik.js", "utf8");
    const f = q.slice(q.indexOf("export function planeMonat("), q.indexOf("\n}\n", q.indexOf("export function planeMonat(")));
    expect(f).toContain("planbefundeNeu(arbeit, x.person, d, da, planLeisten)");
    expect(f).toContain("planbefundeNeu(vorher, v.person, d, daN, planLeisten, stand)");
    const pl = readFileSync("server/lib/engine/planer.mjs", "utf8");
    expect(pl).toContain("planbefundeNeu(vorher, p, d, da, leistenPlan, stand)");
    const e = readFileSync("server/lib/engine/einsatz.mjs", "utf8");
    for (const x of ["ersatzruhetage(", "freieSonntage(", "nl === "]) { expect(e).not.toContain(x); expect(pl).not.toContain(x); expect(f).not.toContain(x); }
    /* Nachtlauf durch d (Review #588 B-2): eigene kleine Regel, Nachtdienst-Kriterium aus befunde.mjs (istNachtdienst), keine Kopie. */
    expect(e).toContain("istNachtdienst(st, ");
    expect(e).not.toContain("nachtschwelle(st.einstellungen)");
    const b = readFileSync("server/lib/engine/befunde.mjs", "utf8");
    const pr = b.slice(b.indexOf("export function pruefen("), b.indexOf("export function nachtfolgeBefunde("));
    for (const x of ["nachtfolgeBefunde(m, p, von, bis, vor)", "ersatzruheMonatsweise(m, p, von, bis, arbeitet)", "sonntagsfreiBefund(m, p, von, bis, arbeitet)"]) expect(pr).toContain(x);
    for (const x of ["ersatzruhetage(", "freieSonntage(", "maxNachtFolge + 1"]) expect(pr).not.toContain(x);
  });
});

describe("10. Betriebsmodus je Betrieb, Planungsreife, Ursache offener Stellen (WP-I7 Teil 5, Betreiberentscheidung 26.11.)", () => {
  const T0 = "2026-11-27T10:00:00.000Z";
  const LEIT = { rolle: "leitung", person: "L1" };
  const mitModus = (m, modus) => ({ ...m, einstellungen: { ...m.einstellungen, kiSteuerung: { planerModus: { modus, am: T0, vonRolle: "leitung" } } } });
  /** Kleiner Betrieb: leerer Betrieb HE, vier Personen mit Vertragsstunden, Frühdienst je Tag eine Person. */
  const klein = () => {
    const m = baueLeerenBetrieb({ name: "T", branche: "pflege", email: "x@example.org", land: "HE", raum: "r" }).mandanten[0];
    m.personen = [1, 2, 3, 4].map((i) => ({ id: `p${i}`, vorname: "A", nachname: `B${i}`, eintritt: "2020-01-01", zugehoerigkeit: [{ einheitId: m.einheiten[0].id, ab: "2020-01-01" }], wochenstunden: 40, status: "aktiv", qualifikationen: [] }));
    m.dienstarten = m.dienstarten.map((d) => (d.id === "F" ? { ...d, mindest: { mo_do: 1, fr: 1, sa: 1, so: 1 } } : d));
    return m;
  };

  it("Schalter: PLANER_AN bleibt AUS; ohne Freigabe ist jeder gespeicherte Modus AUS; nach Freigabe Standard Knopfdruck, automatisch nur ausdrücklich; unbekannt/unlesbar = AUS", () => {
    expect(PLANER_AN).toBe(false);
    expect(PL.planerModusWirksam(mitModus({ einstellungen: {} }, "automatisch").einstellungen)).toBe("aus");
    expect(PL.planerModusWirksam({}, true)).toBe("knopfdruck");
    expect(PL.planerModusWirksam(undefined, true)).toBe("knopfdruck");
    for (const w of ["aus", "knopfdruck", "automatisch"]) expect(PL.planerModusWirksam(mitModus({ einstellungen: {} }, w).einstellungen, true)).toBe(w);
    for (const kaputt of [{ planerModus: { modus: "immer", am: T0 } }, { planerModus: { modus: "automatisch" } }, { planerModus: "automatisch" }, { planerModus: null }])
      expect(PL.planerModusWirksam({ kiSteuerung: kaputt }, true), JSON.stringify(kaputt)).toBe("aus");
    expect(PL.planerModusWirksam({ kiSteuerung: { planerModus: { modus: "automatisch", am: T0 } } }, /** @type {any} */ ("ja")), "nur genau true gibt frei").toBe("aus");
    /* Review #595 B-1: das GANZE Feld unlesbar (vorhanden, kein einfaches Objekt) = AUS und Pause, nie „nicht vorhanden“. */
    for (const kaputt of ["kaputt", [], 5, true, null]) {
      expect(PL.planerModusWirksam({ kiSteuerung: kaputt }, true), JSON.stringify(kaputt)).toBe("aus");
      expect(kiPauseAktiv({ kiSteuerung: kaputt }), JSON.stringify(kaputt)).toBe(true);
    }
    expect(PL.planerModusWirksam(/** @type {any} */ ("kaputt"), true), "Einstellungen selbst kein Objekt").toBe("aus");
    /* Abgrenzung: fehlendes Feld (auch undefined) und leere Steuerung sind „nicht vorhanden“ — Standard, keine Pause. */
    for (const e of [{}, { kiSteuerung: undefined }, { kiSteuerung: {} }, undefined, null]) {
      expect(PL.planerModusWirksam(e, true), JSON.stringify(e)).toBe("knopfdruck");
      expect(kiPauseAktiv(e), JSON.stringify(e)).toBe(false);
    }
  });

  it("Review #595 B-1: unlesbare Steuerung im Einstieg und im Planer — AUS bzw. pausiert, nichts eingeteilt", () => {
    const m = klein();
    for (const kaputt of ["kaputt", [], 5, true, null]) {
      const k = { ...m, einstellungen: { ...m.einstellungen, kiSteuerung: kaputt } };
      const r = PL.planerEinstieg(k, YM, { freigabe: true, knopf: true });
      expect([r.status, r.modus, r.gesetzt.length], JSON.stringify(kaputt)).toEqual(["aus", "aus", 0]);
      expect(planeVorschlag(k, YM, { freigabe: true }).status, JSON.stringify(kaputt)).toBe("pausiert");
    }
  });

  it("Schreibweg: nur die Leitung ändert den Modus (Stempel vom Server, Protokoll ohne Inhalt); andere Rollen wirkungslos; ungültiger Wert abgewiesen; Sicht des Betriebsrats ohne Person", () => {
    const alt = { id: "b1", einstellungen: {} };
    const absicht = (w) => ({ id: "b1", einstellungen: { kiSteuerung: { planerModus: w } } });
    const ok = kiSteuerungZusammen(alt, absicht({ modus: "automatisch", am: "gefälscht", vonPerson: "X" }), LEIT, { jetzt: T0 });
    expect(ok.mandant.einstellungen.kiSteuerung.planerModus).toEqual({ modus: "automatisch", am: T0, vonRolle: "leitung", vonPerson: "L1" });
    expect(ok.mandant.einstellungen.kiSteuerung.protokoll.map((x) => [x.art, x.ziel, x.wert])).toEqual([["planermodus", "planer", "automatisch"]]);
    for (const rolle of ["planer", "betriebsrat", "schichtverantwortung", "mitarbeiter", "kunde", "betreiber"]) {
      const r = kiSteuerungZusammen(alt, absicht({ modus: "automatisch" }), { rolle, person: "x" }, { jetzt: T0 });
      expect(r.mandant && r.mandant.einstellungen.kiSteuerung, rolle).toBeUndefined();
    }
    expect(kiSteuerungZusammen(alt, absicht({ modus: "automatisch" }), { ...LEIT, demo: true }, { jetzt: T0 }).mandant.einstellungen.kiSteuerung, "Demo").toBeUndefined();
    for (const w of [{ modus: "immer" }, { modus: true }, "automatisch"])
      expect(kiSteuerungZusammen(alt, absicht(w), LEIT, { jetzt: T0 }).grund, JSON.stringify(w)).toContain("Betriebsmodus");
    const gleich = kiSteuerungZusammen(ok.mandant, absicht({ modus: "automatisch" }), LEIT, { jetzt: "2026-11-28T00:00:00.000Z" });
    expect(gleich.mandant.einstellungen.kiSteuerung, "unverändert: keine Änderung").toEqual(ok.mandant.einstellungen.kiSteuerung);
    expect(kiSteuerungSicht(ok.mandant.einstellungen, "betriebsrat").kiSteuerung.planerModus).toEqual({ modus: "automatisch", am: T0, vonRolle: "leitung" });
    /* Unlesbarer gespeicherter Modus: beim nächsten Schreiben der Leitung (andere Änderung) AUS mit Stempel des Systems. */
    const kaputt = { id: "b1", einstellungen: { kiSteuerung: { planerModus: { modus: "immer", am: T0 } } } };
    const r = kiSteuerungZusammen(kaputt, { id: "b1", einstellungen: { kiSteuerung: { betriebsratFrage: { antwort: "nein" } } } }, LEIT, { jetzt: T0 });
    expect(r.mandant.einstellungen.kiSteuerung.planerModus).toMatchObject({ modus: "aus", vonRolle: "system" });
  });

  it("planerEinstieg: aus / wartet auf Knopfdruck / pausiert / Knopfdruck rechnet / automatisch rechnet; ohne Freigabe nichts", () => {
    const m = klein();
    const leerErg = (r) => { expect(r.gesetzt).toEqual([]); expect(r.abweichungen).toEqual(m.abweichungen); };
    let r = PL.planerEinstieg(mitModus(m, "automatisch"), YM, { knopf: true });
    expect([r.status, r.modus]).toEqual(["aus", "aus"]); leerErg(r);
    r = PL.planerEinstieg(m, YM, { freigabe: true });
    expect([r.status, r.modus]).toEqual(["wartet", "knopfdruck"]); leerErg(r);
    r = PL.planerEinstieg(mitModus(m, "aus"), YM, { freigabe: true, knopf: true });
    expect(r.status).toBe("aus"); leerErg(r);
    const pausiert = { ...m, einstellungen: { ...m.einstellungen, kiSteuerung: { pause: { aktiv: true } } } };
    expect(PL.planerEinstieg(pausiert, YM, { freigabe: true, knopf: true }).status).toBe("pausiert");
    const k = PL.planerEinstieg(m, YM, { freigabe: true, knopf: true, zuege: 0 });
    expect([k.status, k.modus]).toEqual(["ok", "knopfdruck"]);
    expect(k.gesetzt.length).toBeGreaterThan(0);
    const direkt = planeVorschlag(m, YM, { freigabe: true, zuege: 0 });
    expect(schluessel(k.gesetzt)).toEqual(schluessel(direkt.gesetzt));
    const a = PL.planerEinstieg(mitModus(m, "automatisch"), YM, { freigabe: true, zuege: 0 });
    expect([a.status, a.modus]).toEqual(["ok", "automatisch"]);
    expect(PL.planerEinstieg(m, "2026-13", { freigabe: true, knopf: true }).status).toBe("ungueltig");
  }, 300000);

  it("nicht planungsreif: kein Vorschlag (auch kein teilweiser), sondern die fehlenden Voraussetzungen ohne Personenbezug — in jedem Modus", () => {
    const m = klein();
    m.personen = m.personen.map((p) => ({ ...p, wochenstunden: undefined }));   // Vertragsstunden fehlen (Pflichtpunkt)
    for (const [modus, knopf] of [["knopfdruck", true], ["automatisch", false]]) {
      const r = PL.planerEinstieg(mitModus(m, modus), YM, { freigabe: true, knopf });
      expect(r.status, modus).toBe("nicht_planungsreif");
      expect(r.gesetzt).toEqual([]);
      expect(r.offen).toEqual([]);
      expect(r.voraussetzungen.some((v) => v.punkt === "vertragsstunden")).toBe(true);
      const text = JSON.stringify(r.voraussetzungen);
      for (const p of m.personen) { expect(text).not.toContain(p.nachname); expect(text).not.toContain(`"${p.id}"`); }
    }
  }, 300000);

  it("unerfüllbares Muss: Stelle offen mit Ursache (Kennung vorgabeMuss), nie eine Einteilung mit Muss-Verletzung; ungültige Muss-Vorgabe fällt nicht still weg", () => {
    const m = klein();
    m.personen = m.personen.slice(0, 1);
    /* Muss: höchstens 1 F in Folge; die eine Person hat am 1.12. F, also ist der 2.12. mit ihr unerfüllbar. */
    const vg = (parameter) => ({ id: "v1", name: "Hausregel", status: "aktiv", staerke: "muss", prioritaet: 1, regelart: "musterregel", geltung: { art: "betrieb" }, grundlage: { art: "hausregel" }, parameter });
    m.vorgaben = [vg({ art: "hoechstensFolge", klassen: ["F"], max: 1 })];
    m.abweichungen["p1|2026-12-01"] = "F";
    const r = planeVorschlag(structuredClone(m), YM, { freigabe: true, zuege: 0, maxProPerson: 31 });
    expect(r.status).toBe("ok");
    expect(r.gesetzt.some((g) => g.datum === "2026-12-02")).toBe(false);
    const o2 = r.offen.find((x) => x.datum === "2026-12-02" && x.dienstId === "F");
    expect(o2).toMatchObject({ ursache: "hindernisse" });
    expect(o2.regeln).toContain("vorgabeMuss");
    expect(r.rang.muss).toBe(0);
    /* Ungültig beschrieben (Muster ohne brauchbare Länge): vorher still weg, jetzt nicht vollständig geprüft (Automatik: Achtung). */
    const u = structuredClone(m);
    u.vorgaben = [vg({ art: "hoechstensFolge", klassen: ["F"], max: "viele" })];
    const fd = u.dienstarten.find((x) => x.id === "F");
    const b = F.hindernisBefunde(u, u.personen[0], "2026-12-02", fd, { vorgabenBudget: neuesVorgabenBudget(), vorgabenAutomatisch: true });
    expect(b.find((x) => x.regel === "vorgabeOffen")).toMatchObject({ stufe: "achtung" });
    expect(b.find((x) => x.regel === "vorgabeOffen").text).toContain("nicht auswertbar");
    const ru = planeVorschlag(u, YM, { freigabe: true, zuege: 0, maxProPerson: 31 });
    expect(ru.gesetzt).toEqual([]);
    expect(ru.offen.length).toBeGreaterThan(0);
    expect(ru.offen.every((x) => x.grund || x.ursache === "unvollstaendig")).toBe(true);
    /* Soll ungültig: nur Hinweis (der Mensch bewertet), nie still. */
    const s = structuredClone(u); s.vorgaben[0].staerke = "soll";
    expect(F.hindernisBefunde(s, s.personen[0], "2026-12-02", fd, { vorgabenBudget: neuesVorgabenBudget(), vorgabenAutomatisch: true })
      .find((x) => x.regel === "vorgabeOffen")).toMatchObject({ stufe: "hinweis" });
  }, 300000);
});
