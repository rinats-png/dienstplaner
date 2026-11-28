/* ==========================================================================
   WP-I8 — ERFÜLLUNGSBERICHT ZU EINEM PLANVORSCHLAG (server/lib/engine/erfuellungsbericht.mjs)

   Akzeptanz (INTELLIGENCE-ENTWICKLUNGSPLAN.md, Block K, I8): Bericht nennt nur Zählwerte; je offenem
   Konflikt Wo/Warum/Wege; keine Scores je Person (D-16). Plan 7.4: keine Gesamtnote in Prozent.

   Geprüft (nur synthetische Daten, Planer nur mit `freigabe: true`; PLANER_AN bleibt AUS):
   E1  Grün: voll besetzter Vorschlag ⇒ Gesetz, Qualifikation, Besetzung erfüllt; Zählwerte stimmen.
   E2  Je Status ein Fall: verletzt (Gesetz, Soll, Verteilung), offen (Besetzung, Qualifikation mit Ursache),
       nicht bewertbar (keine Vorgabe, Bedarf nicht festgelegt, Soll ungeprüft, Wunsch) — nie „erfüllt“.
   E3  Rangfolge Gesetz > Qualifikation > Besetzung > Muss > Soll > Verteilung > Wunsch (maßgeblich).
   E4  Konflikte: Wo/Warum/Wege; Wege aus der Nachrechnung, bei Abweichung oder Grenze „unvollstaendig“.
   E5  Fail closed: fremdes/verändertes Ergebnis, kein Vorschlag, ungültige Eingaben, Fehler ⇒ { ok: false }.
   E6  Datenschutz: keine Personenkennung, kein Name, kein „Person|Tag“, kein Abwesenheitsgrund, keine Prozent.
   E7  Rein: Eingaben eingefroren, gleiche Eingabe ⇒ gleicher Bericht; Monats-/Jahreswechsel, Schaltjahr,
       Zeitumstellung; leerer Plan; riesige Eingabe (Aufwandsgrenze); Quelltext ohne Uhr/Zufall/node:/src/.

   Aufruf: npx vitest run pruefungen/intelligence-erfuellungsbericht.test.js
   ========================================================================== */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { readFileSync } from "node:fs";
import { erfuellungsbericht, BERICHT_RANGFOLGE, BERICHT_STATUS, BERICHT_GRENZE } from "../server/lib/engine/erfuellungsbericht.mjs";
import { planeVorschlag, PLANER_AN } from "../server/lib/engine/planer.mjs";
import { PLANER_AGGREGATE_AN } from "../server/lib/engine/planeraggregate.mjs";
import { LUECKEN_MAX } from "../server/lib/engine/luckenursache.mjs";
import { baueLeerenBetrieb } from "../server/lib/leerbetrieb.mjs";

vi.setConfig({ testTimeout: 180000 });
const lies = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const deepFreeze = (o) => { if (o && typeof o === "object" && !Object.isFrozen(o)) { Object.freeze(o); for (const k of Object.getOwnPropertyNames(o)) deepFreeze(o[k]); } return o; };
const kopie = (x) => structuredClone(x);

beforeAll(() => { vi.useFakeTimers({ now: new Date("2026-11-20T10:00:00Z"), toFake: ["Date"] }); });
afterAll(() => { vi.useRealTimers(); });

const NACHNAMEN = ["Zylinderkopf", "Wasserwaage", "Leuchtturmgasse", "Kieselsteinweg", "Ahornblattweg", "Birkenrindeweg", "Fichtenzapfen", "Lindenblüte"];
/** Synthetischer Betrieb: n Personen (Kennung `tp-…`, auffällige Nachnamen), Dienste ohne Bedarf; Testqualifikation ohne Nachweispflicht. */
function betrieb(n = 6, { qual = true } = {}) {
  const m = baueLeerenBetrieb({ name: "Testbetrieb Erfuellung", branche: "pflege", email: "test@example.org", land: "HE", raum: "r-test" }).mandanten[0];
  const e = m.einheiten[0].id;
  m.qualifikationen.push({ id: "qt", name: "Testqualifikation", kurz: "TQ", ebene: "betrieb", bezug: "person", gueltigMonate: null, nachweisPflicht: false, fachkraft: false });
  m.personen = Array.from({ length: n }, (_, i) => ({ id: `tp-${1000 + i}`, vorname: "Testvorname", nachname: NACHNAMEN[i % NACHNAMEN.length], geburtstag: "1980-05-05",
    eintritt: "2020-01-01", zugehoerigkeit: [{ einheitId: e, ab: "2020-01-01" }], wochenstunden: 40, status: "aktiv", qualifikationen: qual ? ["qt"] : [] }));
  return m;
}
const TAEGLICH = (n) => ({ mo_do: n, fr: n, sa: n, so: n });
/** Grün: Frühdienst (1, Testqualifikation) und Spätdienst (1) täglich, sechs Personen. */
function gruen() {
  const m = betrieb(6);
  const [F, S] = m.dienstarten;
  F.mindest = TAEGLICH(1); F.mindestQual = { qt: 1 };
  S.mindest = TAEGLICH(1);
  return m;
}
const planen = (m, ym, opt = {}) => planeVorschlag(m, ym, { freigabe: true, maxProPerson: 15, ...opt });
/** Planer und Bericht auf getrennten Kopien desselben Bestands (der Bericht bekommt den unberührten Bestand). */
function lauf(bau, ym, opt) {
  const m = bau();
  const r = planen(kopie(m), ym, opt);
  return { m, r };
}
/** Nimmt eine eigene Einteilung zurück und trägt die frei gewordene Stelle als offen ein (wie der Planer sie meldete). */
function stelleOeffnen(m, r, datum, dienstId, extra = {}) {
  const e = kopie(r);
  const i = e.gesetzt.findIndex((g) => g.datum === datum && g.dienstId === dienstId);
  if (i < 0) throw new Error(`keine eigene Einteilung ${datum} ${dienstId}`);
  const g = e.gesetzt[i];
  e.gesetzt.splice(i, 1);
  const k = `${g.personId}|${g.datum}`;
  if (Object.prototype.hasOwnProperty.call(m.abweichungen, k)) e.abweichungen[k] = m.abweichungen[k]; else delete e.abweichungen[k];
  const da = m.dienstarten.find((d) => d.id === dienstId);
  const qual = Object.keys(da.mindestQual || {}).length > 0;
  e.offen.push({ datum, dienstId, fehlt: 1, qualFehlt: qual, ursache: "direktMoeglich", regeln: [], ...extra });
  e.offen.sort((a, b) => (a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : 0));
  return e;
}
const kat = (b, name) => b.kategorien.find((k) => k.kategorie === name);
const statusVon = (b) => Object.fromEntries(b.kategorien.map((k) => [k.kategorie, k.status]));

/** Alle Schlüssel eines Werts (rekursiv). */
const schluessel = (x, s = new Set()) => { if (Array.isArray(x)) x.forEach((y) => schluessel(y, s)); else if (x && typeof x === "object") for (const [k, v] of Object.entries(x)) { s.add(k); schluessel(v, s); } return s; };
const ERLAUBT = new Set(["ok", "ym", "startwert", "massgeblich", "kategorie", "status", "zusammenfassung", "kategorien", "erfuellt", "verletzt", "offen", "nichtBewertbar",
  "stellen", "gesamt", "voll", "bedarfOffen", "qualifikation", "eigeneEinteilungen", "konflikte", "gelistet", "abgeschnitten", "mitWegen", "wegeUnvollstaendig",
  "ursacheUnvollstaendig", "rang", "umfang", "bestandGeprueft", "geprueft", "vorgaben", "grund", "bedarf", "fehlt", "nachgelagert", "summeUeberschreitung",
  "vorgabeId", "staerke", "groesse", "maxAbweichung", "spannweite", "ueberschreitung", "personen", "ausserhalb", "datum", "dienstId", "art", "qualFehlt",
  "fehlendeQualifikationen", "qid", "noetig", "ist", "ursache", "regeln", "vorgabenUnvollstaendig", "wegeStatus", "wege", "deckt"]);
/** Datenschutz-Prüfung eines Berichts gegen einen Bestand. */
function ohnePersonenbezug(b, m) {
  const t = JSON.stringify(b);
  for (const p of m.personen) { expect(t.includes(`"${p.id}"`), `Kennung ${p.id}`).toBe(false); expect(t.includes(p.nachname), p.nachname).toBe(false); }
  expect(t.includes("Testvorname")).toBe(false);
  expect(/\|\d{4}-\d{2}-\d{2}/.test(t), "kein Schlüssel Person|Tag").toBe(false);
  expect(/%|prozent|score|punkte|gesamtnote/i.test(t), "keine Prozent-/Punktwerte").toBe(false);
  const fremd = [...schluessel(b)].filter((k) => !ERLAUBT.has(k));
  expect(fremd, "Schlüssel außerhalb der Positivliste").toEqual([]);
  expect(schluessel(b).has("personId")).toBe(false);
}

/* Gemeinsame Läufe (einmal je Datei). */
let G11, G12, G02, G03, G10;
beforeAll(() => {
  G11 = lauf(gruen, "2026-11");
  G12 = lauf(gruen, "2026-12");
  G02 = lauf(gruen, "2028-02");
  G03 = lauf(gruen, "2026-03");
  G10 = lauf(gruen, "2026-10");
}, 180000);

describe("Schalter und Grenzen unverändert", () => {
  it("PLANER_AN und PLANER_AGGREGATE_AN bleiben AUS; Rangfolge und Status wie vereinbart", () => {
    expect(PLANER_AN).toBe(false);
    expect(PLANER_AGGREGATE_AN).toBe(false);
    expect([...BERICHT_RANGFOLGE]).toEqual(["gesetz", "qualifikation", "besetzung", "muss", "soll", "verteilung", "wunsch"]);
    expect([...BERICHT_STATUS]).toEqual(["erfuellt", "verletzt", "offen", "nicht-bewertbar"]);
  });
});

describe("E1: Grün — voll besetzter Vorschlag", () => {
  it("Gesetz, Qualifikation, Besetzung erfüllt; Zählwerte aus dem fertigen Stand; keine Konflikte", () => {
    const { m, r } = G11;
    expect(r.status).toBe("ok");
    expect(r.offen).toEqual([]);
    const b = erfuellungsbericht(m, r);
    expect(b.ok).toBe(true);
    expect(statusVon(b)).toMatchObject({ gesetz: "erfuellt", qualifikation: "erfuellt", besetzung: "erfuellt" });
    expect(kat(b, "besetzung")).toMatchObject({ stellen: 60, voll: 60, offen: 0, bedarf: 60, fehlt: 0, bedarfOffen: 0 });
    expect(kat(b, "qualifikation")).toMatchObject({ stellen: 30, offen: 0 });
    expect(kat(b, "gesetz")).toMatchObject({ umfang: "vorschlag", bestandGeprueft: false, geprueft: r.gesetzt.length, verletzt: 0 });
    expect(b.zusammenfassung.eigeneEinteilungen).toBe(r.gesetzt.length);
    expect(b.zusammenfassung.stellen).toEqual({ gesamt: 60, voll: 60, offen: 0, bedarfOffen: 0 });
    expect(b.konflikte).toEqual([]);
    expect(b.zusammenfassung.konflikte).toMatchObject({ gesamt: 0, gelistet: 0, abgeschnitten: false });
  });
});

describe("E2: je Status ein Fall", () => {
  it("nicht bewertbar ≠ erfüllt: ohne Vorgaben sind Muss, Soll, Verteilung, Wunsch nicht bewertbar mit Grund", () => {
    const b = erfuellungsbericht(G11.m, G11.r);
    for (const k of ["muss", "soll", "verteilung", "wunsch"]) {
      expect(kat(b, k).status, k).toBe("nicht-bewertbar");
      expect(typeof kat(b, k).grund, k).toBe("string");
    }
    expect(kat(b, "muss").grund).toBe("keine_vorgabe");
    expect(kat(b, "wunsch").grund).toBe("nicht_bewertet");
    /* Zählung: nicht bewertbar wird nie als erfüllt gezählt. */
    expect(b.zusammenfassung.kategorien).toEqual({ erfuellt: 3, verletzt: 0, offen: 0, nichtBewertbar: 4 });
  });

  it("erfüllt (Muss/Soll mit Vorgabe) gegen verletzt (Soll-Befund) und nicht bewertbar (Soll ungeprüft)", () => {
    const m = { ...G11.m, vorgaben: [{ id: "v-muss", status: "aktiv", staerke: "muss", regelart: "mindestFrei" }, { id: "v-soll", status: "aktiv", staerke: "soll", regelart: "mindestFrei" }] };
    const gr = erfuellungsbericht(m, G11.r);
    expect(kat(gr, "muss")).toMatchObject({ status: "erfuellt", vorgaben: 1, verletzt: 0 });
    expect(kat(gr, "soll")).toMatchObject({ status: "erfuellt", vorgaben: 1 });
    const rot = erfuellungsbericht(m, { ...G11.r, rang: { ...G11.r.rang, soll: 2 } });
    expect(kat(rot, "soll")).toMatchObject({ status: "verletzt", verletzt: 2 });
    const nb = erfuellungsbericht(m, { ...G11.r, rang: { ...G11.r.rang, soll: null } });
    expect(kat(nb, "soll")).toMatchObject({ status: "nicht-bewertbar", grund: "vorgaben_nicht_vollstaendig_geprueft" });
    /* Eine inaktive Vorgabe zählt nicht. */
    const inaktiv = erfuellungsbericht({ ...G11.m, vorgaben: [{ id: "v-x", status: "entwurf", staerke: "muss", regelart: "mindestFrei" }] }, G11.r);
    expect(kat(inaktiv, "muss").status).toBe("nicht-bewertbar");
  });

  it("verletzt: ein Gesetzesbefund in der Nachprüfung macht Gesetz rot", () => {
    const b = erfuellungsbericht(G11.m, { ...G11.r, rang: { ...G11.r.rang, gesetz: 1 } });
    expect(kat(b, "gesetz")).toMatchObject({ status: "verletzt", verletzt: 1 });
    expect(b.massgeblich).toEqual({ kategorie: "gesetz", status: "verletzt" });
  });

  it("offen (Besetzung, echter Planer): mehr Bedarf als Personen ⇒ offene Stellen mit Ursache, Zählwerte von N", () => {
    const { m, r } = lauf(() => { const x = betrieb(3); x.dienstarten[1].mindest = { mo_do: 5, fr: 0, sa: 0, so: 0 }; return x; }, "2026-11");
    const b = erfuellungsbericht(m, r);
    expect(b.ok).toBe(true);
    const bes = kat(b, "besetzung");
    expect(bes.status).toBe("offen");
    expect(bes.offen).toBeGreaterThan(0);
    expect(bes.voll + bes.offen).toBe(bes.stellen);
    expect(b.konflikte.length).toBe(r.offen.length);
    for (const k of b.konflikte) {
      expect(k.datum.slice(0, 7)).toBe("2026-11");
      expect(k.dienstId).toBe("S");
      expect(typeof k.ursache).toBe("string");
      expect(k.fehlt).toBeGreaterThan(0);
    }
    /* Gegenrechnung: fehlende Personen = Summe der Konflikte. */
    expect(bes.fehlt).toBe(b.konflikte.reduce((s, k) => s + k.fehlt, 0));
  });

  it("offen (Qualifikation): niemand hat die Qualifikation ⇒ Qualifikation offen vor Besetzung, Ursache qualifikationFehlt", () => {
    const { m, r } = lauf(() => { const x = betrieb(4, { qual: false }); x.dienstarten[2].mindest = TAEGLICH(1); x.dienstarten[2].mindestQual = { qt: 1 }; return x; }, "2026-11");
    const b = erfuellungsbericht(m, r);
    expect(kat(b, "qualifikation")).toMatchObject({ status: "offen", stellen: 30, offen: 30 });
    expect(b.massgeblich.kategorie).toBe("qualifikation");
    const k = b.konflikte.find((x) => x.qualFehlt);
    expect(k.fehlendeQualifikationen).toEqual([{ qid: "qt", noetig: 1, ist: k.fehlendeQualifikationen[0].ist }]);
    expect(b.konflikte.every((x) => x.art === "qualifikation" || x.art === "besetzung_und_qualifikation")).toBe(true);
    expect(b.konflikte.every((x) => x.ursache === "qualifikationFehlt" || typeof x.grund === "string" || x.ursache === "keinPersonal" || x.ursache === "hindernisse")).toBe(true);
  });

  it("nicht bewertbar: Bedarf nicht festgelegt ist nie „erfüllt“", () => {
    const { m, r } = lauf(() => { const x = gruen(); x.dienstarten[2].mindest = { mo_do: null, fr: null, sa: null, so: null }; return x; }, "2026-11");
    const b = erfuellungsbericht(m, r);
    expect(b.ok).toBe(true);
    const bes = kat(b, "besetzung");
    expect(bes.bedarfOffen).toBe(30);
    expect(bes.offen).toBe(0);
    expect(bes).toMatchObject({ status: "nicht-bewertbar", grund: "bedarf_nicht_festgelegt" });
  });

  it("Verteilung: verletzt, erfüllt, nicht bewertbar — die schlechteste Vorgabe zählt; ungeprüft nie erfüllt; keine Werte je Person", () => {
    const regel = (id, status, extra = {}) => ({ vorgabeId: id, regelId: `r-${id}`, staerke: "soll", groesse: "nachtdienste", maxAbweichung: 1, status, spannweite: 0, ueberschreitung: 0,
      personen: [{ personId: "tp-1000", nachtdienste: 2, wert: 2, abweichung: 0 }, { personId: "tp-1001", nachtdienste: 2, wert: 2, abweichung: 0 }], nichtBewertbar: [], ausserhalb: [], ...extra });
    const mit = (v) => erfuellungsbericht(G11.m, { ...G11.r, verteilung: v });
    const gr = mit({ bewertet: true, summe: 0, regeln: [regel("v1", "erfuellt")], ausgeglichen: 0 });
    expect(kat(gr, "verteilung")).toMatchObject({ status: "erfuellt", erfuellt: 1, summeUeberschreitung: 0 });
    expect(kat(gr, "verteilung").vorgaben[0]).toMatchObject({ vorgabeId: "v1", personen: 2, nichtBewertbar: 0, ausserhalb: 0 });
    const rot = mit({ bewertet: true, summe: 2, regeln: [regel("v1", "erfuellt"), regel("v2", "verletzt", { spannweite: 3, ueberschreitung: 2 })] });
    expect(kat(rot, "verteilung")).toMatchObject({ status: "verletzt", verletzt: 1, erfuellt: 1, summeUeberschreitung: 2 });
    const gemischt = mit({ bewertet: false, summe: null, regeln: [regel("v1", "erfuellt"), regel("v3", "nicht_bewertet", { grund: "aufwand", personen: [] })] });
    expect(kat(gemischt, "verteilung")).toMatchObject({ status: "nicht-bewertbar", nichtBewertbar: 1, summeUeberschreitung: null });
    expect(kat(gemischt, "verteilung").vorgaben.find((x) => x.vorgabeId === "v3")).toMatchObject({ status: "nicht-bewertbar", grund: "aufwand" });
    /* Alle Vorgaben erfüllt, der Planer hat die Verteilung aber nicht vollständig bewertet: nicht bewertbar. */
    const ungeprueft = mit({ bewertet: false, summe: null, regeln: [regel("v1", "erfuellt")] });
    expect(kat(ungeprueft, "verteilung").status).toBe("nicht-bewertbar");
    /* Baukasten „offen“ und „nicht anwendbar“ sind nicht bewertbar (nicht „offen“ im Sinn einer offenen Stelle). */
    const offen = mit({ bewertet: false, summe: null, regeln: [regel("v4", "offen", { grund: "personen_nicht_bewertbar" }), regel("v5", "nicht_anwendbar", { grund: "weniger_als_zwei" })] });
    expect(kat(offen, "verteilung").vorgaben.map((x) => x.status)).toEqual(["nicht-bewertbar", "nicht-bewertbar"]);
    for (const b of [gr, rot, gemischt, offen]) ohnePersonenbezug(b, G11.m);
  });
});

describe("E3: Rangfolge Gesetz > Qualifikation > Besetzung > Muss > Soll > Verteilung > Wunsch", () => {
  it("maßgeblich ist die ranghöchste nicht erfüllte Kategorie — gleich, was dahinter steht", () => {
    const { m, r } = G11;
    const mv = { ...m, vorgaben: [{ id: "v-muss", status: "aktiv", staerke: "muss", regelart: "mindestFrei" }, { id: "v-soll", status: "aktiv", staerke: "soll", regelart: "mindestFrei" }] };
    const vt = (status) => ({ bewertet: status !== "nicht_bewertet", summe: status === "verletzt" ? 1 : 0, regeln: [{ vorgabeId: "v-vt", staerke: "soll", groesse: "nachtdienste", maxAbweichung: 1, status,
      spannweite: 0, ueberschreitung: status === "verletzt" ? 1 : 0, personen: [], nichtBewertbar: [], ausserhalb: [] }] });
    const tag = r.gesetzt.find((g) => g.dienstId === "F").datum;
    const tagS = r.gesetzt.find((g) => g.dienstId === "S").datum;
    /* Stufen schrittweise verschlechtern: von hinten nach vorn; jedes Mal wird die neue Stufe maßgeblich. */
    const faelle = [
      { erwartet: "wunsch", e: { ...r, verteilung: vt("erfuellt") } },
      { erwartet: "verteilung", e: { ...r, verteilung: vt("verletzt") } },
      { erwartet: "soll", e: { ...r, verteilung: vt("verletzt"), rang: { ...r.rang, soll: 1 } } },
      { erwartet: "muss", e: { ...r, verteilung: vt("verletzt"), rang: { ...r.rang, soll: 1, muss: 1 } } },
      { erwartet: "besetzung", e: { ...stelleOeffnen(m, r, tagS, "S"), verteilung: vt("verletzt"), rang: { ...r.rang, soll: 1, muss: 1 } } },
      { erwartet: "qualifikation", e: { ...stelleOeffnen(m, stelleOeffnen(m, r, tagS, "S"), tag, "F"), verteilung: vt("verletzt"), rang: { ...r.rang, soll: 1, muss: 1 } } },
      { erwartet: "gesetz", e: { ...stelleOeffnen(m, stelleOeffnen(m, r, tagS, "S"), tag, "F"), verteilung: vt("verletzt"), rang: { ...r.rang, soll: 1, muss: 1, gesetz: 1 } } },
    ];
    for (const f of faelle) {
      const b = erfuellungsbericht(mv, f.e);
      expect(b.ok, f.erwartet).toBe(true);
      expect(b.massgeblich.kategorie, f.erwartet).toBe(f.erwartet);
      /* Alles vor der maßgeblichen Kategorie ist erfüllt. */
      const i = BERICHT_RANGFOLGE.indexOf(f.erwartet);
      expect(b.kategorien.slice(0, i).every((k) => k.status === "erfuellt"), f.erwartet).toBe(true);
      expect(b.kategorien.map((k) => k.kategorie)).toEqual([...BERICHT_RANGFOLGE]);
      expect(b.kategorien.map((k) => k.rang)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    }
  });

  it("Verteilung nur nachgelagert: eine verletzte Verteilung überdeckt keine offene Besetzung", () => {
    const { m, r } = G11;
    const tagS = r.gesetzt.find((g) => g.dienstId === "S").datum;
    const e = { ...stelleOeffnen(m, r, tagS, "S"), verteilung: { bewertet: true, summe: 3, regeln: [{ vorgabeId: "v", status: "verletzt", ueberschreitung: 3, personen: [], nichtBewertbar: [], ausserhalb: [] }] } };
    const b = erfuellungsbericht(m, e);
    expect(kat(b, "verteilung")).toMatchObject({ status: "verletzt", nachgelagert: true });
    expect(b.massgeblich).toEqual({ kategorie: "besetzung", status: "offen" });
  });
});

describe("E4: Konflikte mit Wo, Warum, Wege", () => {
  /** Zwei Personen, beide den ganzen Monat krank; Frühdienst Mo–Do mit Bedarf 1 ⇒ jede Stelle hat das Hindernis Abwesenheit. */
  const krank = (dienste = 1) => {
    const x = betrieb(2);
    x.dienstarten.slice(0, dienste).forEach((d) => { d.mindest = TAEGLICH(1); });
    if (dienste === 1) x.dienstarten[0].mindest = { mo_do: 1, fr: 0, sa: 0, so: 0 };
    for (const p of x.personen) x.abwesenheiten.push({ id: `abw-${p.id}`, personId: p.id, von: "2026-11-01", bis: "2026-11-30", art: "krank" });
    return x;
  };
  it("Wege aus der Nachrechnung: kleinste Regelmenge, Personenzahl, deckt — gleich der Ursache des Planers", () => {
    const { m, r } = lauf(() => krank(1), "2026-11");
    const b = erfuellungsbericht(m, r);
    expect(b.ok).toBe(true);
    expect(b.konflikte.length).toBe(r.offen.length);
    expect(b.konflikte.length).toBeGreaterThan(10);
    for (const k of b.konflikte) {
      const p = r.offen.find((x) => x.datum === k.datum && x.dienstId === k.dienstId);
      expect(k.ursache).toBe(p.ursache);
      expect(k.regeln).toEqual(p.regeln);
      expect(k.ursache).toBe("hindernisse");
      expect(k.wegeStatus).toBe("berechnet");
      expect(k.wege.length).toBeGreaterThan(0);
      expect(k.wege[0].regeln).toEqual(k.regeln);
      expect(k.wege[0]).toMatchObject({ personen: 2, deckt: 1 });
    }
    expect(b.zusammenfassung.konflikte).toMatchObject({ mitWegen: b.konflikte.length, wegeUnvollstaendig: 0, ursacheUnvollstaendig: 0 });
    ohnePersonenbezug(b, m);
    expect(JSON.stringify(b).includes("krank"), "kein Abwesenheitsgrund").toBe(false);
  });

  it("weicht die Ursache des Planers von der Nachrechnung ab, heißen die Wege unvollständig (keine erfundenen)", () => {
    const { m, r } = lauf(() => krank(1), "2026-11");
    const e = kopie(r);
    e.offen[0].regeln = ["ruhezeitGesetz"];
    const b = erfuellungsbericht(m, e);
    const k = b.konflikte.find((x) => x.datum === e.offen[0].datum && x.dienstId === e.offen[0].dienstId);
    expect(k).toMatchObject({ wegeStatus: "unvollstaendig", wege: [], regeln: ["ruhezeitGesetz"] });
    expect(b.zusammenfassung.konflikte.wegeUnvollstaendig).toBe(1);
  });

  it("höchstens LUECKEN_MAX Nachrechnungen je Bericht; darüber Wege unvollständig, gezählt", () => {
    const { m, r } = lauf(() => krank(3), "2026-11");
    const b = erfuellungsbericht(m, r);
    const mitH = b.konflikte.filter((k) => k.ursache === "hindernisse");
    expect(mitH.length).toBe(90);
    expect(mitH.filter((k) => k.wegeStatus === "berechnet").length).toBe(LUECKEN_MAX);
    expect(b.zusammenfassung.konflikte.wegeUnvollstaendig).toBe(90 - LUECKEN_MAX);
  });

  it("Ursache unvollständig oder Grund des Planers: übernommen, ohne Wege, gezählt", () => {
    const { m, r } = G11;
    const tagS = r.gesetzt.find((g) => g.dienstId === "S").datum;
    const e1 = stelleOeffnen(m, r, tagS, "S", { ursache: "unvollstaendig", regeln: [] });
    const b1 = erfuellungsbericht(m, e1);
    expect(b1.konflikte[0]).toMatchObject({ ursache: "unvollstaendig", wegeStatus: "keine", wege: [] });
    expect(b1.zusammenfassung.konflikte.ursacheUnvollstaendig).toBe(1);
    const e2 = stelleOeffnen(m, r, tagS, "S");
    delete e2.offen[0].ursache; delete e2.offen[0].regeln; e2.offen[0].grund = "aufwand";
    const b2 = erfuellungsbericht(m, e2);
    expect(b2.konflikte[0]).toMatchObject({ ursache: "grund", grund: "aufwand", wegeStatus: "keine" });
    expect(b2.zusammenfassung.konflikte.ursacheUnvollstaendig).toBe(0);
  });

  it("Konfliktliste begrenzt: weitere werden gezählt (abgeschnitten), nicht verschwiegen", () => {
    const { m, r } = lauf(() => { const x = betrieb(0); for (let i = 0; i < 17; i++) x.dienstarten.push({ ...x.dienstarten[0], id: `X${i}`, name: `Testdienst ${i}`, kurz: `X${i}` }); x.dienstarten.forEach((d) => { d.mindest = TAEGLICH(1); }); return x; }, "2026-11");
    expect(r.status).toBe("ok");
    expect(r.offen.length).toBe(600);
    const b = erfuellungsbericht(m, r);
    expect(b.konflikte.length).toBe(BERICHT_GRENZE.konflikte);
    expect(b.zusammenfassung.konflikte).toMatchObject({ gesamt: 600, gelistet: 500, abgeschnitten: true });
    expect(kat(b, "besetzung")).toMatchObject({ stellen: 600, offen: 600, voll: 0 });
  });
});

describe("E5: fail closed", () => {
  it("kein Vorschlag (Planer AUS, pausiert, ungültig) ⇒ kein Bericht", () => {
    const m = gruen();
    expect(erfuellungsbericht(m, planeVorschlag(kopie(m), "2026-11"))).toEqual({ ok: false, grund: "kein_vorschlag", status: "aus" });
    expect(erfuellungsbericht(m, planeVorschlag(kopie(m), "2026-13", { freigabe: true }))).toMatchObject({ ok: false, grund: "kein_vorschlag", status: "ungueltig" });
  });
  it("Ergebnis passt nicht zum Bestand (offene Stelle fehlt, eigene Einteilung fehlt im Stand, fremder Monat) ⇒ kein Bericht", () => {
    const { m, r } = G11;
    const tagS = r.gesetzt.find((g) => g.dienstId === "S").datum;
    const geoeffnet = stelleOeffnen(m, r, tagS, "S");
    expect(erfuellungsbericht(m, { ...geoeffnet, offen: [] }).grund).toBe("ergebnis_passt_nicht");
    expect(erfuellungsbericht(m, { ...geoeffnet, offen: [{ ...geoeffnet.offen[0], fehlt: 2 }] }).grund).toBe("ergebnis_passt_nicht");
    expect(erfuellungsbericht(m, { ...geoeffnet, offen: [geoeffnet.offen[0], geoeffnet.offen[0]] }).grund).toBe("ergebnis_passt_nicht");
    const ohne = kopie(r); const g = ohne.gesetzt[0]; delete ohne.abweichungen[`${g.personId}|${g.datum}`];
    expect(erfuellungsbericht(m, ohne).grund).toBe("ergebnis_passt_nicht");
    expect(erfuellungsbericht(m, { ...r, gesetzt: [...r.gesetzt, { personId: "tp-1000", datum: "2026-12-01", dienstId: "F" }] }).grund).toBe("ergebnis_passt_nicht");
    /* Eigene Einteilung nennt einen anderen Dienst als der Stand (Besetzung unverändert): passt nicht. */
    const vertauscht = kopie(r); vertauscht.gesetzt[0].dienstId = vertauscht.gesetzt[0].dienstId === "F" ? "S" : "F";
    expect(erfuellungsbericht(m, vertauscht).grund).toBe("ergebnis_passt_nicht");
    /* Bericht zu einem anderen Bestand (Bedarf geändert): passt nicht. */
    const anders = kopie(m); anders.dienstarten[1].mindest = TAEGLICH(2);
    expect(erfuellungsbericht(anders, r).grund).toBe("ergebnis_passt_nicht");
  });
  it("ungültige Eingaben und Fehler: Fehlerobjekt, nie eine Ausnahme", () => {
    const { m, r } = G11;
    expect(erfuellungsbericht(null, r).grund).toBe("betrieb_ungueltig");
    expect(erfuellungsbericht({ ...m, abweichungen: null }, r).grund).toBe("betrieb_ungueltig");
    expect(erfuellungsbericht(m, null).grund).toBe("ergebnis_ungueltig");
    expect(erfuellungsbericht(m, { ...r, ym: "2026-13" }).grund).toBe("monat_ungueltig");
    expect(erfuellungsbericht(m, { ...r, ym: "1999-12" }).grund).toBe("monat_ungueltig");
    expect(erfuellungsbericht(m, { ...r, rang: { ...r.rang, soll: -1 } }).grund).toBe("ergebnis_ungueltig");
    expect(erfuellungsbericht(m, { ...r, rang: { ...r.rang, gesetz: Number.NaN } }).grund).toBe("ergebnis_ungueltig");
    expect(erfuellungsbericht(m, { ...r, offen: "keine" }).grund).toBe("ergebnis_ungueltig");
    const boese = { ...r }; Object.defineProperty(boese, "gesetzt", { get() { throw new Error("Testfehler"); }, enumerable: true });
    expect(() => erfuellungsbericht(m, boese)).not.toThrow();
    expect(erfuellungsbericht(m, boese)).toEqual({ ok: false, grund: "fehler" });
  });
});

describe("E6: Datenschutz", () => {
  it("keine Personenkennung, kein Name, kein Person|Tag, keine Prozent; Schlüssel aus der Positivliste", () => {
    for (const { m, r } of [G11, G12, G02]) ohnePersonenbezug(erfuellungsbericht(m, r), m);
    const { m, r } = lauf(() => { const x = betrieb(3); x.dienstarten[1].mindest = { mo_do: 5, fr: 0, sa: 0, so: 0 }; return x; }, "2026-11");
    ohnePersonenbezug(erfuellungsbericht(m, r), m);
  });
});

describe("E7: rein, Kalender, Grenzen", () => {
  it("Eingaben eingefroren (Deep-Freeze): Bericht entsteht, nichts verändert; gleiche Eingabe ⇒ gleicher Bericht", () => {
    const m = deepFreeze(kopie(G11.m)), r = deepFreeze(kopie(G11.r));
    const vorM = JSON.stringify(m), vorR = JSON.stringify(r);
    const b1 = erfuellungsbericht(m, r);
    const b2 = erfuellungsbericht(m, r);
    expect(b1.ok).toBe(true);
    expect(JSON.stringify(m)).toBe(vorM);
    expect(JSON.stringify(r)).toBe(vorR);
    expect(b2).toEqual(b1);
    /* auch mit Konflikten und Wege-Nachrechnung */
    const tagS = G11.r.gesetzt.find((g) => g.dienstId === "S").datum;
    const e = deepFreeze(stelleOeffnen(G11.m, G11.r, tagS, "S"));
    expect(erfuellungsbericht(m, e).ok).toBe(true);
  });

  it("Jahreswechsel: Dezember zählt 31 Tage, nichts aus Januar; eine offene Stelle am 31.12. bleibt im Dezember", () => {
    const { m, r } = G12;
    const b = erfuellungsbericht(m, r);
    expect(kat(b, "besetzung").stellen).toBe(62);
    const tag = r.gesetzt.find((g) => g.datum === "2026-12-31" && g.dienstId === "S") ? "2026-12-31" : null;
    expect(tag).toBe("2026-12-31");
    const b2 = erfuellungsbericht(m, stelleOeffnen(m, r, tag, "S"));
    expect(b2.konflikte.map((k) => k.datum)).toEqual(["2026-12-31"]);
    expect(b2.zusammenfassung.stellen).toMatchObject({ gesamt: 62, voll: 61, offen: 1 });
  });

  it("Schaltjahr: Februar 2028 hat 29 Tage (2028-02-29 gezählt), Februar 2027 28", () => {
    const { m, r } = G02;
    const b = erfuellungsbericht(m, r);
    expect(kat(b, "besetzung").stellen).toBe(58);
    const b2 = erfuellungsbericht(m, stelleOeffnen(m, r, "2028-02-29", "S"));
    expect(b2.konflikte.map((k) => k.datum)).toEqual(["2028-02-29"]);
    const g27 = lauf(gruen, "2027-02");
    expect(kat(erfuellungsbericht(g27.m, g27.r), "besetzung").stellen).toBe(56);
  });

  it("Zeitumstellung: letzter Sonntag im März (29.3.2026) und Oktober (25.10.2026) sind gewöhnliche Tage", () => {
    for (const [{ m, r }, tag] of [[G03, "2026-03-29"], [G10, "2026-10-25"]]) {
      const b = erfuellungsbericht(m, r);
      expect(kat(b, "besetzung").stellen).toBe(62);
      const dienst = r.gesetzt.find((g) => g.datum === tag).dienstId;
      const b2 = erfuellungsbericht(m, stelleOeffnen(m, r, tag, dienst));
      expect(b2.konflikte.map((k) => k.datum)).toEqual([tag]);
      expect(b2.zusammenfassung.stellen.offen).toBe(1);
    }
  });

  it("leerer Plan: ohne Bedarf und ohne Einteilung ist nichts erfüllt (alles nicht bewertbar)", () => {
    const { m, r } = lauf(() => betrieb(3), "2026-11");
    expect(r.gesetzt).toEqual([]);
    const b = erfuellungsbericht(m, r);
    expect(b.ok).toBe(true);
    expect(b.kategorien.every((k) => k.status === "nicht-bewertbar")).toBe(true);
    expect(kat(b, "gesetz").grund).toBe("keine_einteilung_im_vorschlag");
    expect(kat(b, "besetzung").grund).toBe("keine_anforderung");
    expect(b.zusammenfassung.kategorien.erfuellt).toBe(0);
    expect(b.massgeblich).toEqual({ kategorie: "gesetz", status: "nicht-bewertbar" });
  });

  it("riesige Eingabe: über der Aufwandsgrenze kein Bericht (vorab, ohne Rechnung)", () => {
    const m = betrieb(1);
    const p0 = m.personen[0];
    m.personen = Array.from({ length: Math.ceil(BERICHT_GRENZE.personenTage / 30) + 1 }, (_, i) => ({ ...p0, id: `tp-g${i}` }));
    const e = { status: "ok", ym: "2026-11", startwert: 1, gesetzt: [], offen: [], abweichungen: {}, rang: { gesetz: 0, besetzung: 0, muss: 0, soll: 0, verteilung: null, wunsch: null, stabilitaet: 0 } };
    expect(erfuellungsbericht(m, e)).toEqual({ ok: false, grund: "aufwand" });
    const m2 = betrieb(1);
    m2.dienstarten = Array.from({ length: Math.ceil(BERICHT_GRENZE.stellen / 30) + 1 }, (_, i) => ({ ...m2.dienstarten[0], id: `D${i}` }));
    expect(erfuellungsbericht(m2, e)).toEqual({ ok: false, grund: "aufwand" });
    /* knapp darunter: gerechnet */
    const m3 = betrieb(1);
    m3.personen = Array.from({ length: Math.floor(BERICHT_GRENZE.personenTage / 30) }, (_, i) => ({ ...p0, id: `tp-h${i}` }));
    expect(erfuellungsbericht(m3, e).ok).toBe(true);
  });

  it("Quelltext: nur relative Importe, kein node:, kein src/, keine Uhr, kein Zufall, keine Ablage", () => {
    const c = lies("server/lib/engine/erfuellungsbericht.mjs");
    const importe = [...c.matchAll(/^import[^;]*from\s+"([^"]+)"/gm)].map((x) => x[1]);
    expect(importe.length).toBeGreaterThan(0);
    expect(importe.every((p) => p.startsWith("./") || p.startsWith("../"))).toBe(true);
    expect(importe.some((p) => /node:|src\/|intelligence\//.test(p))).toBe(false);
    const code = c.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(/Date\.now|new Date|Math\.random|process\.|require\(|fetch\(|writeFile|localStorage/.test(code)).toBe(false);
  });
});
