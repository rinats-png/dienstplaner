/* ==========================================================================
   WP-I7 Teil 7 — Verteilung im Planer, erste Stufe: Nachtdienste je Person im Kalendermonat
   (Betreiberentscheidung 27.11.; server/lib/engine/verteilung.mjs, planer.mjs Schritt 4 „Ausgleichen“)

   1. Definition: Wert, Vergleichsgruppe, maxAbweichung (Spannweite, Baukasten), Rundung, Rang; nicht Bewertbares nie „erfüllt“.
   2. Teilzeit anteilig NUR bei teilzeitAnteilig === true; Urlaub/Krankheit herausgenommen; andere Abwesenheit, Eintritt im Monat,
      Geltung teilweise = nicht bewertbar; keine Nacht möglich = außerhalb.
   3. Nachgelagert: Ausgleichen verbessert die Verteilung nur ohne Verschlechterung von Gesetz/Besetzung/Muss/Soll; Bestand und
      Angeheftetes nie verändert; jede eigene Einteilung besteht die Nachprüfung.
   4. Zufallsvergleich gegen eine naive Referenz (begrenzt: 10 Startwerte), Demobetrieb, Grenzen und Schalter unverändert.

   Aufruf: TZ=UTC npx vitest run pruefungen/intelligence-verteilung.test.js
   ========================================================================== */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { planeVorschlag, nachpruefen, rangVergleich, PLANER_AN, NICHT_BEWERTET } from "../server/lib/engine/planer.mjs";
import { verteilungVorbereiten, verteilungBewerten, nachtZaehlen, VERTEILUNG_GRUENDE } from "../server/lib/engine/verteilung.mjs";
import { neuesVorgabenBudget, vorgabePlanwirkung, verteilungGroesse } from "../server/lib/vorgabenwirkung.mjs";
import { PLANER_AGGREGATE_AN, AGGREGAT_GRENZE } from "../server/lib/engine/planeraggregate.mjs";
import { PLANBEFUND_GRENZE } from "../server/lib/engine/einsatz.mjs";
import { personTag } from "../server/lib/engine/plan.mjs";
import { baueLeerenBetrieb } from "../server/lib/leerbetrieb.mjs";
import { FEST, zufall, betriebe } from "./engine-golden.fixture.mjs";

const add = (t, n) => { const x = new Date(`${t}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };   // zeit-ok: reine Datumsrechnung
const YM = "2026-12";
const TAGE = []; for (let t = "2026-12-01"; t <= "2026-12-31"; t = add(t, 1)) TAGE.push(t);
const ST = { am: "2026-11-27T10:00:00.000Z", vonRolle: "leitung" };

let F, B;
beforeAll(async () => {
  vi.useFakeTimers({ now: new Date(FEST), toFake: ["Date"] });   // zeit-ok: feste Uhr der Prüfung
  vi.spyOn(Math, "random").mockImplementation(zufall(20261127));
  F = await import("../src/lib/fachlogik.js");
  B = betriebe(F);
}, 120000);
afterAll(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

const VT = (extra = {}) => ({ id: "vt-1", name: "Nächte gleichmäßig", regelart: "verteilungsregel", parameter: { groesse: "nachtdienste", maxAbweichung: 1 },
  geltung: { art: "betrieb" }, staerke: "soll", prioritaet: 1, status: "aktiv", grundlage: { art: "hausregel" }, bezug: "monat", ...extra });
/** Kleiner Betrieb: n Personen, ein Nachtdienst je Tag (Bedarf `bedarf`), keine Schichtfolge. */
const klein = (n = 4, bedarf = 1, vorgaben = [VT()]) => {
  const m = baueLeerenBetrieb({ name: "T", branche: "pflege", email: "x@example.org", land: "HE", raum: "r" }).mandanten[0];
  m.personen = Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, vorname: "A", nachname: `B${i + 1}`, eintritt: "2020-01-01",
    zugehoerigkeit: [{ einheitId: m.einheiten[0].id, ab: "2020-01-01" }], wochenstunden: 40, status: "aktiv", qualifikationen: [] }));
  m.dienstarten = m.dienstarten.map((d) => (d.id === "N" ? { ...d, mindest: { mo_do: bedarf, fr: bedarf, sa: bedarf, so: bedarf } } : d));
  m.vorgaben = vorgaben;
  return m;
};
const lauf = (m, o = {}) => planeVorschlag(m, YM, { freigabe: true, maxProPerson: 31, ...o });
const regel = (r, id = "vt-1") => r.verteilung.regeln.find((x) => x.vorgabeId === id);
const werte = (x) => Object.fromEntries(x.personen.map((p) => [p.personId, p.wert]));
/** Nachprüfung jeder eigenen Einteilung frisch (fail closed). */
const besteht = (m, r) => nachpruefen(m, { ...m, abweichungen: r.abweichungen }, r.gesetzt, neuesVorgabenBudget()).durch;
/** Bestand bleibt: jeder Eintrag des Bestands unverändert, jede neue Abweichung ist eine eigene Einteilung. */
const bestandFehler = (m, r) => {
  const f = [], eigene = new Set(r.gesetzt.map((g) => `${g.personId}|${g.datum}`));
  for (const [k, v] of Object.entries(m.abweichungen)) if (!eigene.has(k) && r.abweichungen[k] !== v) f.push(`${k} geändert`);
  for (const k of Object.keys(r.abweichungen)) if (!eigene.has(k) && !Object.prototype.hasOwnProperty.call(m.abweichungen, k)) f.push(`${k} neu ohne Einteilung`);
  for (const k of Object.keys(m.angeheftet || {})) if (eigene.has(k) || r.abweichungen[k] !== m.abweichungen[k]) f.push(`${k} angeheftet verändert`);
  return f;
};

describe("1. Definition, Rang, nie still „erfüllt“", () => {
  it("ohne Verteilungsvorgabe: nichts bewertet (null), Ergebnis ohne Verteilung; Schalter und Grenzen unverändert", () => {
    const r = lauf(klein(4, 1, []));
    expect(r.status).toBe("ok");
    expect(r.rang.verteilung).toBe(null);
    expect(r.nichtBewertet).toEqual(["verteilung", "wunsch"]);
    expect(r.verteilung).toBe(null);
    expect(NICHT_BEWERTET).toEqual(["wunsch"]);
    expect([PLANER_AN, PLANER_AGGREGATE_AN, PLANBEFUND_GRENZE, AGGREGAT_GRENZE.fensterTage]).toEqual([false, false, 40000000, 372]);
    expect(planeVorschlag(klein(), YM, {}).status, "ohne Freigabe nichts").toBe("aus");
  });

  it("Werte je Person, Spannweite gegen maxAbweichung (Baukasten), Abweichung = Wert − niedrigster Wert, Rang = Überschreitung", () => {
    const m = klein(4, 1);
    /* Bestand: p1 hat 6 Nächte, p2 2, p3/p4 keine; der Planer füllt den Rest (ohne Ausgleich: zuege 0). */
    ["2026-12-01", "2026-12-03", "2026-12-05", "2026-12-07", "2026-12-09", "2026-12-11"].forEach((d) => { m.abweichungen[`p1|${d}`] = "N"; });
    ["2026-12-02", "2026-12-04"].forEach((d) => { m.abweichungen[`p2|${d}`] = "N"; });
    const r = lauf(m, { zuege: 0 });
    expect(r.status).toBe("ok");
    const x = regel(r);
    const n = (pid) => TAGE.filter((d) => personTag({ ...m, abweichungen: r.abweichungen }, m.personen.find((p) => p.id === pid), d).dienstId === "N").length;
    for (const p of x.personen) { expect(p.nachtdienste, p.personId).toBe(n(p.personId)); expect(p.wert).toBe(p.nachtdienste); }
    const w = x.personen.map((p) => p.wert), min = Math.min(...w), max = Math.max(...w);
    expect(x.spannweite).toBe(max - min);
    for (const p of x.personen) expect(p.abweichung).toBe(p.wert - min);
    expect(x.ueberschreitung).toBe(Math.max(0, max - min - 1));
    expect(x.status).toBe(max - min > 1 ? "verletzt" : "erfuellt");
    expect(r.rang.verteilung).toBe(x.ueberschreitung);
    expect(r.nichtBewertet).toEqual(["wunsch"]);
    expect(r.verteilung.bewertet).toBe(true);
  }, 300000);

  it("maxAbweichung an der Grenze: Spannweite = Grenze erfüllt, eins darüber verletzt (Bewertung direkt, ohne Planen)", () => {
    const m = klein(3, 1, [VT({ parameter: { groesse: "nachtdienste", maxAbweichung: 2 } })]);
    const vt = verteilungVorbereiten(m, TAGE);
    const z = (a, b, c) => new Map([["p1", a], ["p2", b], ["p3", c]]);
    expect(verteilungBewerten(vt, z(5, 4, 3)).regeln[0]).toMatchObject({ status: "erfuellt", spannweite: 2, ueberschreitung: 0 });
    expect(verteilungBewerten(vt, z(5, 4, 3)).summe).toBe(0);
    expect(verteilungBewerten(vt, z(6, 4, 3)).regeln[0]).toMatchObject({ status: "verletzt", spannweite: 3, ueberschreitung: 1 });
    expect(verteilungBewerten(vt, z(6, 4, 3)).summe).toBe(1);
    /* Schreibweise der Größe: ohne Groß/Klein und Rand-Leerraum; andere Größen nicht bewertet */
    expect(verteilungGroesse({ parameter: { groesse: "  NachtDienste " } })).toBe("nachtdienste");
    expect(verteilungGroesse({ parameter: { groesse: "Nächte im Quartal" } })).toBe(null);
  });

  it("nicht bewertbare Größe, ungültige Parameter, Wunsch-Stärke: nie „erfüllt“; Rang nur, wenn alles bewertbar ist", () => {
    for (const [v, grund] of [[VT({ parameter: { groesse: "Nächte im Quartal", maxAbweichung: 1 } }), "groesse_nicht_bewertet"],
      [VT({ parameter: { groesse: "nachtdienste", maxAbweichung: -1 } }), "nicht_auswertbar"],
      [VT({ parameter: { groesse: "nachtdienste" } }), "nicht_auswertbar"]]) {
      const r = lauf(klein(3, 1, [v]), { zuege: 0 });
      expect(regel(r)).toMatchObject({ status: "nicht_bewertet", grund });
      expect(r.rang.verteilung, grund).toBe(null);
      expect(r.verteilung.bewertet).toBe(false);
      expect(r.nichtBewertet).toContain("verteilung");
    }
    /* Wunsch-Stärke gehört zum Rang Wunsch: genannt, aber nicht in der Verteilung gezählt */
    const r = lauf(klein(3, 1, [VT(), VT({ id: "vt-2", staerke: "wunsch" })]), { zuege: 0 });
    expect(regel(r, "vt-2")).toMatchObject({ status: "nicht_bewertet", grund: "wunsch" });
    expect(r.rang.verteilung).toBe(regel(r).ueberschreitung);
    /* Eine bewertbare und eine nicht bewertbare Muss/Soll-Vorgabe: insgesamt nicht bewertet (keine Teilsumme als Rang) */
    const rt = lauf(klein(3, 1, [VT(), VT({ id: "vt-2", parameter: { groesse: "Stunden", maxAbweichung: 1 } })]), { zuege: 0 });
    expect(regel(rt).status).toMatch(/erfuellt|verletzt/);
    expect(rt.rang.verteilung).toBe(null);
    expect(rt.nichtBewertet).toContain("verteilung");
    /* Muss-Stärke hebt die Verteilung nicht in den Rang Muss */
    const rm = lauf(klein(3, 1, [VT({ staerke: "muss" })]), { zuege: 0 });
    expect(rm.rang.muss).toBe(0);
    expect(typeof rm.rang.verteilung).toBe("number");
    /* Verwaltung: die Verteilungsregel wirkt nicht je Einteilung, der Grund nennt den Planer bzw. die nicht bewertete Größe */
    expect(vorgabePlanwirkung(VT())).toMatchObject({ wirkt: false });
    expect(vorgabePlanwirkung(VT()).grund).toContain("Rang „Verteilung“");
    expect(vorgabePlanwirkung(VT({ parameter: { groesse: "Stunden", maxAbweichung: 1 } })).grund).toMatch(/Testlauf/);
  }, 300000);

  it("Aufwand reicht nicht für die Vorbereitung: nicht bewertet (Grund aufwand), kein stilles „erfüllt“", () => {
    const r = lauf(klein(4, 1), { aufwand: 400, zuege: 0 });
    expect(regel(r)).toMatchObject({ status: "nicht_bewertet", grund: "aufwand" });
    expect(r.rang === null || r.rang.verteilung === null).toBe(true);
  });
});

describe("2. Vergleichsgruppe: Teilzeit, Abwesenheit, Eintritt, Einsatzmöglichkeit, Geltung", () => {
  it("Teilzeit anteilig NUR bei teilzeitAnteilig === true (Wert / Teilzeitquote); sonst unverändert gezählt", () => {
    for (const flag of [undefined, false, true]) {
      const m = klein(3, 1, [VT(flag === undefined ? {} : { ausnahmen: { teilzeitAnteilig: flag } })]);
      m.personen[2] = { ...m.personen[2], teilzeit: { aktiv: true, modus: "wochentage", wochentage: [0, 1, 2, 3, 4, 5, 6] }, wochenstunden: 20 };
      const vt = verteilungVorbereiten(m, TAGE);
      const e = verteilungBewerten(vt, new Map([["p1", 4], ["p2", 4], ["p3", 3]]));
      expect(werte(e.regeln[0]).p3, `Flag ${flag}`).toBe(flag === true ? 6 : 3);
      expect(werte(e.regeln[0]).p1).toBe(4);
    }
    /* Quote nicht bestimmbar (keine Wochenstunden) bei anteiliger Berechnung: nicht bewertbar, nie erfüllt */
    const m = klein(3, 1, [VT({ ausnahmen: { teilzeitAnteilig: true } })]);
    m.personen[2] = { ...m.personen[2], teilzeit: { aktiv: true }, wochenstunden: 0 };
    const e = verteilungBewerten(verteilungVorbereiten(m, TAGE), new Map([["p1", 4], ["p2", 4], ["p3", 4]]));
    expect(e.regeln[0].nichtBewertbar).toEqual([{ personId: "p3", grund: VERTEILUNG_GRUENDE.teilzeitquote, nachtdienste: 4 }]);
    expect(e.regeln[0].status).toBe("offen");
    expect(e.bewertet).toBe(false);
  });

  it("Urlaub/Krankheit aus Zähler und Grundlage (Wert · T/(T−U)); andere Abwesenheit, Eintritt im Monat, Geltung teilweise: nicht bewertbar; keine Nacht möglich, ganzer Monat Urlaub: außerhalb", () => {
    const m = klein(8, 1);
    m.abwesenheiten = [{ id: "u1", personId: "p2", art: "urlaub", von: "2026-12-01", bis: "2026-12-10" },
      { id: "s1", personId: "p3", art: "schulung", von: "2026-12-15", bis: "2026-12-15" },
      { id: "u2", personId: "p7", art: "krank", von: "2026-12-01", bis: "2026-12-31" }];
    m.personen[3] = { ...m.personen[3], eintritt: "2026-12-10" };
    m.personen[4] = { ...m.personen[4], einschraenkungen: { keineNacht: true } };
    m.personen[5] = { ...m.personen[5], imSchichtdienst: false };
    m.vorgaben = [VT({ ausnahmen: { zeitraeume: [], personen: [] } }), VT({ id: "vt-2", geltung: { art: "personen", personen: ["p1", "p8"] }, ausnahmen: { personen: ["p8"] } }),
      VT({ id: "vt-3", ausnahmen: { zeitraeume: [{ von: "2026-12-20", bis: "2026-12-31" }] } })];
    const vt = verteilungVorbereiten(m, TAGE);
    const z = new Map(m.personen.map((p) => [p.id, 3]));
    const e = verteilungBewerten(vt, z);
    const r1 = e.regeln.find((x) => x.vorgabeId === "vt-1");
    expect(werte(r1)).toEqual({ p1: 3, p2: Math.round(3 * 31 / 21 * 1e6) / 1e6, p8: 3 });
    expect(r1.nichtBewertbar.map((x) => [x.personId, x.grund])).toEqual([["p3", VERTEILUNG_GRUENDE.abwesenheit], ["p4", VERTEILUNG_GRUENDE.eintrittAustritt]]);
    expect(r1.ausserhalb.map((x) => [x.personId, x.grund]).sort()).toEqual([["p5", VERTEILUNG_GRUENDE.keineNacht], ["p6", VERTEILUNG_GRUENDE.schichtdienst], ["p7", VERTEILUNG_GRUENDE.ganzAbwesend]]);
    /* Die bekannten Werte zeigen die Verletzung schon (Baukasten); mit unbekannten Personen trotzdem nicht als Rang bewertet. */
    expect(r1.status, "unbekannte Personen: nie erfüllt").toBe("verletzt");
    const nur1 = verteilungBewerten(verteilungVorbereiten({ ...m, vorgaben: [VT()] }, TAGE), z);
    expect([nur1.regeln[0].status, nur1.bewertet, nur1.summe], "verletzt mit unbekannten Personen: kein Rang").toEqual(["verletzt", false, null]);
    /* Geltung einzelne Personen, Ausnahme: nur p1 ⇒ weniger als zwei ⇒ nicht anwendbar */
    const r2 = e.regeln.find((x) => x.vorgabeId === "vt-2");
    expect(r2.personen.map((x) => x.personId)).toEqual(["p1"]);
    expect(r2.status).toBe("nicht_anwendbar");
    /* Ausnahmezeitraum im Monat: Geltung nur an einem Teil ⇒ alle nicht bewertbar */
    const r3 = e.regeln.find((x) => x.vorgabeId === "vt-3");
    expect(r3.personen).toEqual([]);
    expect(r3.nichtBewertbar.every((x) => [VERTEILUNG_GRUENDE.geltungTeilweise, VERTEILUNG_GRUENDE.abwesenheit, VERTEILUNG_GRUENDE.eintrittAustritt].includes(x.grund))).toBe(true);
    expect(r3.status).toBe("offen");
    expect(e.bewertet).toBe(false);
    expect(e.summe).toBe(null);
    /* Ergebnis ohne Namen und ohne Schutzmerkmal im Grund */
    expect(JSON.stringify(e)).not.toMatch(/B1|keineNacht|schulung|krank|urlaub/);
  });
});

describe("3. Nachgelagert: Ausgleichen", () => {
  it("verbessert die Verteilung ohne Verschlechterung der höheren Ränge; Bestand und Angeheftetes unverändert; Nachprüfung besteht", () => {
    const m = klein(4, 1);
    /* Angeheftet und Bestand: p1 hat 5 Nächte im Bestand, zwei davon angeheftet; p2 ist am 20.12. angeheftet frei. */
    ["2026-12-01", "2026-12-02", "2026-12-03", "2026-12-04", "2026-12-05"].forEach((d) => { m.abweichungen[`p1|${d}`] = "N"; });
    m.abweichungen["p2|2026-12-20"] = "-";
    m.angeheftet = { "p1|2026-12-01": ST, "p1|2026-12-02": ST, "p2|2026-12-20": ST };
    const r0 = lauf(m, { zuege: 0 }), r = lauf(m, { zuege: 100 });
    expect([r0.status, r.status]).toEqual(["ok", "ok"]);
    expect(r0.rang.verteilung).toBeGreaterThan(0);
    expect(r.verteilung.ausgeglichen).toBeGreaterThan(0);
    expect(r.rang.verteilung).toBeLessThan(r0.rang.verteilung);
    for (const k of ["gesetz", "besetzung", "muss"]) expect(r.rang[k], k).toBeLessThanOrEqual(r0.rang[k]);
    expect(r.rang.soll === null || r.rang.soll <= r0.rang.soll).toBe(true);
    expect(rangVergleich(r.rang, r0.rang)).toBeLessThan(0);
    expect(bestandFehler(m, r)).toEqual([]);
    expect(besteht(m, r)).toBe(true);
    expect(r.gesetzt.some((g) => g.art === "ausgleich")).toBe(true);
    /* p1 behält die Bestandsnächte (5): der Ausgleich nimmt nur eigene Einteilungen */
    const p1 = regel(r).personen.find((x) => x.personId === "p1");
    expect(p1.nachtdienste).toBeGreaterThanOrEqual(5);
    /* gleicher Datenstand + Startwert = gleiches Ergebnis */
    expect(lauf(m, { zuege: 100 }).abweichungen).toEqual(r.abweichungen);
  }, 300000);

  it("nicht bewertbare Verteilung: kein Ausgleich (keine Wirkung auf den Plan)", () => {
    const m = klein(4, 1);
    m.abwesenheiten = [{ id: "s1", personId: "p3", art: "schulung", von: "2026-12-15", bis: "2026-12-15" }];
    const r = lauf(m, { zuege: 100 });
    expect(r.rang.verteilung).toBe(null);
    expect(r.verteilung.ausgeglichen).toBe(0);
    expect(r.gesetzt.some((g) => g.art === "ausgleich")).toBe(false);
    const ohne = lauf({ ...m, vorgaben: [] }, { zuege: 100 });
    expect(r.abweichungen, "ohne bewertbare Verteilung derselbe Plan wie ohne Vorgabe").toEqual(ohne.abweichungen);
  }, 300000);

  it("eine Soll-Vorgabe der Person mit wenigen Nächten hat Vorrang: kein Ausgleich, der einen Soll-Befund erzeugt", () => {
    const m = klein(3, 1);
    /* Soll: p3 höchstens 0 Nächte im Monat (Zählregel) — Verteilung darf das nicht überstimmen */
    m.vorgaben = [VT(), { id: "z-1", name: "p3 keine Nacht", regelart: "zaehlregel", parameter: { ereignis: "N", fenster: { art: "kalendermonat" }, richtung: "hoechstens", grenze: 0 },
      geltung: { art: "personen", personen: ["p3"] }, staerke: "soll", prioritaet: 2, status: "aktiv", grundlage: { art: "hausregel" }, bezug: "monat" }];
    const r0 = lauf(m, { zuege: 0 }), r = lauf(m, { zuege: 100 });
    expect(r.rang.soll).toBe(r0.rang.soll);
    expect(r.gesetzt.filter((g) => g.personId === "p3" && g.dienstId === "N" && g.art === "ausgleich")).toEqual([]);
    expect(besteht(m, r)).toBe(true);
  }, 300000);
});

describe("4. Zufallsvergleich gegen naive Referenz und Demobetrieb", () => {
  it("10 Startwerte (begrenzt): Werte = naive Zählung, Teilzeit nur mit Flag, Angeheftetes unverändert, Nachprüfung besteht", () => {
    let geprueft = 0, ausgeglichen = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const rnd = zufall(7700 + seed);
      const n = 4 + (seed % 3), flag = seed % 2 === 0;
      const m = klein(n, 1, [VT({ parameter: { groesse: "nachtdienste", maxAbweichung: seed % 3 }, ausnahmen: { teilzeitAnteilig: flag } })]);
      m.personen[n - 1] = { ...m.personen[n - 1], teilzeit: { aktiv: true, modus: "wochentage", wochentage: [0, 1, 2, 3, 4, 5, 6] }, wochenstunden: 30 };
      m.abwesenheiten = [{ id: "u", personId: "p2", art: "urlaub", von: "2026-12-0" + (1 + (seed % 5)), bis: "2026-12-1" + (seed % 9) }];
      m.angeheftet = {};
      for (const p of m.personen) for (const d of TAGE) {
        const x = rnd();
        if (x < 0.06) { m.abweichungen[`${p.id}|${d}`] = "N"; if (rnd() < 0.5) m.angeheftet[`${p.id}|${d}`] = ST; }
        else if (x < 0.1) { m.abweichungen[`${p.id}|${d}`] = "-"; if (rnd() < 0.5) m.angeheftet[`${p.id}|${d}`] = ST; }
      }
      const r = lauf(m, { zuege: 40, startwert: seed });
      expect(r.status, `seed ${seed}`).toBe("ok");
      expect(bestandFehler(m, r), `seed ${seed}`).toEqual([]);
      expect(besteht(m, r), `seed ${seed}`).toBe(true);
      /* naive Referenz: zählen über personTag, Faktor aus Urlaub und (nur mit Flag) Teilzeit */
      const fertig = { ...m, abweichungen: r.abweichungen };
      const urlaub = (p) => TAGE.filter((d) => m.abwesenheiten.some((a) => a.personId === p.id && a.von <= d && a.bis >= d)).length;
      const ref = {};
      for (const p of m.personen) {
        const nacht = TAGE.filter((d) => personTag(fertig, p, d).dienstId === "N").length;
        let w = nacht * 31 / (31 - urlaub(p));
        if (flag && p.teilzeit) w /= 30 / 40;
        ref[p.id] = Math.round(w * 1e6) / 1e6;
      }
      const x = regel(r);
      expect(werte(x), `seed ${seed}`).toEqual(ref);
      const sp = Math.max(...Object.values(ref)) - Math.min(...Object.values(ref));
      expect(x.status, `seed ${seed}`).toBe(sp > (seed % 3) + 1e-9 ? "verletzt" : "erfuellt");
      expect(r.rang.verteilung, `seed ${seed}`).toBeCloseTo(Math.max(0, sp - (seed % 3)), 5);
      /* höhere Ränge nicht schlechter als ohne Verteilungsvorgabe (gleicher Startwert) */
      const ohne = lauf({ ...m, vorgaben: [] }, { zuege: 40, startwert: seed });
      for (const k of ["gesetz", "besetzung", "muss"]) expect(r.rang[k], `seed ${seed} ${k}`).toBeLessThanOrEqual(ohne.rang[k]);
      ausgeglichen += r.verteilung.ausgeglichen;
      geprueft++;
    }
    expect(geprueft).toBe(10);
    expect(ausgeglichen, "der Ausgleich hat in den Zufallsfällen etwas getan").toBeGreaterThan(0);
  }, 600000);

  it("Demobetrieb mit Lücken: Verteilung bewertet oder sichtbar nicht bewertet; Bestand unverändert; nie schlechter in Gesetz/Besetzung/Muss", () => {
    const name = B.some(([x]) => x.startsWith("demo1")) ? "demo1" : B[0][0];
    const m = structuredClone(B.find(([x]) => x.startsWith(name))[1]);
    m.personen.forEach((p) => { for (const t of TAGE) if (F.personTag(m, p, t).dienstId === "N") m.abweichungen[`${p.id}|${t}`] = "-"; });
    const mm = structuredClone({ ...m, vorgaben: [...(m.vorgaben || []), VT()] });
    const r = planeVorschlag(mm, YM, { freigabe: true, zuege: 20, startwert: 3 });
    const ohne = planeVorschlag(structuredClone(m), YM, { freigabe: true, zuege: 20, startwert: 3 });
    expect(["ok", "nachpruefung"]).toContain(r.status);
    if (r.status === "ok") {
      expect(bestandFehler(mm, r)).toEqual([]);
      expect(r.verteilung.regeln.length).toBe(1);
      expect(r.verteilung.bewertet ? typeof r.rang.verteilung : r.rang.verteilung).toBe(r.verteilung.bewertet ? "number" : null);
      if (ohne.status === "ok") for (const k of ["gesetz", "besetzung", "muss"]) expect(r.rang[k], k).toBeLessThanOrEqual(ohne.rang[k]);
    }
  }, 600000);
});

describe("5. Zählung direkt", () => {
  it("nachtZaehlen zählt Bestand, Schichtfolge und eigene Einteilungen wie personTag", () => {
    const m = klein(3, 0);
    m.abweichungen = { "p1|2026-12-01": "N", "p1|2026-12-02": "N", "p2|2026-12-31": "N", "p3|2026-12-05": "F" };
    const vt = verteilungVorbereiten(m, TAGE);
    expect(Object.fromEntries(nachtZaehlen(m, vt))).toEqual({ p1: 2, p2: 1 });
  });
});
