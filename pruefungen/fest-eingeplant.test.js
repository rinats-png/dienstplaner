/* ==========================================================================
   WP-I7 Teil 6 (Anheften) — „Fest eingeplant“ für Beschäftigte (Betreiberentscheidung zur Vorlage #595)

   1. Server (sicht.mjs festEingeplantEigene über bestandFuerRolle): Beschäftigte bekommen nur die eigenen angehefteten Tage
      als Liste von Tagen — nie die Karte, nie fremde Schlüssel, kein Wer/Wann/Grund; aufgehobene, verwaiste und
      Entwurfstage nicht; unlesbare oder fehlende Karte: leer, kein Fehler; nur der eigene Betrieb. Betriebsrat,
      Schichtverantwortung, Planung, Leitung, Kundenrolle: Antwort unverändert gegenüber dem Stand ohne das Feld. Das Feld
      entsteht nur in der Antwort; mitgeschickt wird es nie gespeichert und ändert die Karte nicht.
   2. Oberfläche (mobil.jsx, lib/festeingeplant.js): Hinweis als sichtbarer Text nur an eigener angehefteter Einteilung.

   Nur synthetische Daten. Aufruf: TZ=UTC npx vitest run pruefungen/fest-eingeplant.test.js
   ========================================================================== */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { bestandFuerRolle, zusammenfuehren } from "../server/lib/rechte.mjs";
import { festEingeplantEigene } from "../server/lib/sicht.mjs";
import { festEingeplant, FEST_EINGEPLANT_TEXT } from "../src/lib/festeingeplant.js";
import { MPlan, MHeute } from "../src/ansichten/mobil.jsx";
import { demobestand, personTag } from "../src/lib/fachlogik.js";

const ST = { am: "2026-11-27T10:00:00.000Z", vonRolle: "leitung" };
const AUF = { ...ST, aufgehobenAm: "2026-11-27T11:00:00.000Z", aufgehobenVonRolle: "planer" };
const TAG = /^\d{4}-\d{2}-\d{2}$/;

const person = (id, rolle) => ({ id, vorname: `V${id}`, nachname: `N${id}`, rolle, bereich: "e1", status: "aktiv",
  zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }] });
const betrieb = (id = "m1", extra = {}) => ({ id, name: `Haus ${id}`, einheiten: [{ id: "e1", name: "WB" }],
  dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00" }],
  personen: [person("a1", "mitarbeiter"), person("a2", "mitarbeiter"), person("s1", "subplaner"), person("r1", "betriebsrat"),
    person("p1", "planer"), person("l1", "leitung")],
  abweichungen: { "a1|2026-12-01": "F", "a1|2026-12-02": "-", "a1|2026-12-03": "F", "a1|2026-12-10": "F", "a2|2026-12-01": "F", "r1|2026-12-01": "F" },
  angeheftet: {
    "a1|2026-12-01": ST, "a1|2026-12-02": ST,            // aktiv, eingetragen
    "a1|2026-12-03": AUF,                                // aufgehoben
    "a1|2026-12-04": ST,                                 // verwaist (keine Einteilung)
    "a2|2026-12-01": ST, "r1|2026-12-01": ST,            // fremde Personen
  },
  einstellungen: {}, abwesenheiten: [], erfassung: {}, einstempeln: {}, anfragen: [], aenderungen: [], nachrichten: [], ...extra });
const bestand = (...m) => ({ version: 9, stand: 1, mandanten: m.length ? m : [betrieb()] });
const SITZ = {
  a1: { rolle: "mitarbeiter", person: "a1", betrieb: 0, mandantId: "m1" },
  a2: { rolle: "mitarbeiter", person: "a2", betrieb: 0, mandantId: "m1" },
  ohnePerson: { rolle: "mitarbeiter", person: null, betrieb: 0, mandantId: "m1" },
  betriebsrat: { rolle: "betriebsrat", person: "r1", betrieb: 0, mandantId: "m1" },
  subplaner: { rolle: "subplaner", person: "s1", betrieb: 0, mandantId: "m1" },
  planer: { rolle: "planer", person: "p1", betrieb: 0, mandantId: "m1" },
  leitung: { rolle: "leitung", person: "l1", betrieb: 0, mandantId: "m1" },
  kunde: { rolle: "kunde", person: null, betrieb: 0, mandantId: "m1" },
};
const sicht = (b, k) => bestandFuerRolle(b, SITZ[k]).mandanten[0];

describe("1. Server: festEingeplant nur für die eigene Person", () => {
  beforeEach(() => { vi.useFakeTimers({ now: new Date("2026-11-28T09:00:00.000Z"), toFake: ["Date"] }); });   // zeit-ok: feste Uhr der Prüfung
  afterEach(() => { vi.useRealTimers(); });

  it("Beschäftigte: eigene aktive, eingetragene Tage — keine aufgehobenen, verwaisten oder fremden; keine Karte", () => {
    const m = sicht(bestand(), "a1");
    expect(m.festEingeplant).toEqual(["2026-12-01", "2026-12-02"]);
    expect(m).not.toHaveProperty("angeheftet");
    expect(sicht(bestand(), "a2").festEingeplant).toEqual(["2026-12-01"]);
  });

  it("keine Metadaten: nur eine Liste von Tagen, kein Wer/Wann/Grund, keine Schlüssel „Person|Tag“", () => {
    const f = sicht(bestand(), "a1").festEingeplant;
    expect(Array.isArray(f)).toBe(true);
    for (const x of f) expect(typeof x === "string" && TAG.test(x), String(x)).toBe(true);
    const text = JSON.stringify(f);
    for (const verboten of ["|", "am", "vonRolle", "aufgehoben", "leitung", "planer", "a1", "a2", "r1"])
      expect(text, verboten).not.toContain(verboten);
  });

  it("unlesbare oder fehlende Karte: leer, kein Fehler", () => {
    for (const kaputt of ["x", [], 3, null, { "a1|2026-12-01": {} }, { "kein-schluessel": ST }, { "a1|2026-12-01": { ...ST, vonPerson: 1, aufgehobenVonRolle: "x" } }]) {
      const b = bestand(betrieb("m1", { angeheftet: kaputt }));
      let m;
      expect(() => { m = sicht(b, "a1"); }, JSON.stringify(kaputt)).not.toThrow();
      expect(m.festEingeplant, JSON.stringify(kaputt)).toEqual([]);
    }
    const ohne = betrieb(); delete ohne.angeheftet;
    expect(sicht(bestand(ohne), "a1").festEingeplant).toEqual([]);
    expect(festEingeplantEigene(undefined, "a1", {})).toEqual([]);
    expect(festEingeplantEigene(betrieb(), null, betrieb().abweichungen)).toEqual([]);
    expect(festEingeplantEigene(betrieb(), "a1", "kein Objekt")).toEqual([]);
  });

  it("Entwurf: ein nicht freigegebener künftiger Monat verrät keinen Hinweis; nach Freigabe sichtbar", () => {
    const entwurf = betrieb("m1", { einstellungen: { planFreigabePflicht: true } });
    const m = sicht(bestand(entwurf), "a1");
    expect(m.abweichungen).toEqual({});
    expect(m.festEingeplant).toEqual([]);
    const frei = betrieb("m1", { einstellungen: { planFreigabePflicht: true }, freigaben: { "2026-12": { stand: 1 } } });
    expect(sicht(bestand(frei), "a1").festEingeplant).toEqual(["2026-12-01", "2026-12-02"]);
  });

  it("Mandantentrennung: nur der eigene Betrieb, auch bei gleicher Personenkennung im fremden", () => {
    const fremd = betrieb("m2", { abweichungen: { "a1|2026-12-10": "F" }, angeheftet: { "a1|2026-12-10": ST } });
    expect(sicht(bestand(betrieb(), fremd), "a1").festEingeplant).toEqual(["2026-12-01", "2026-12-02"]);
    const b = bestand(fremd, betrieb());
    expect(bestandFuerRolle(b, { ...SITZ.a1, betrieb: 1 }).mandanten[0].festEingeplant).toEqual(["2026-12-01", "2026-12-02"]);
  });

  it("andere Rollen sehen nicht mehr als bisher: kein festEingeplant; Antwort gleich dem Stand ohne das Feld", () => {
    for (const k of ["betriebsrat", "subplaner", "planer", "leitung", "kunde", "ohnePerson"]) {
      const m = sicht(bestand(), k);
      expect(m, k).not.toHaveProperty("festEingeplant");
    }
    for (const k of ["betriebsrat", "subplaner", "ohnePerson"]) expect(sicht(bestand(), k), k).not.toHaveProperty("angeheftet");
    /* Betriebsrat und Schichtverantwortung: Antwort mit Karte = Antwort ohne Karte (die Karte wirkt nicht auf ihre Sicht). */
    const ohne = betrieb(); delete ohne.angeheftet;
    for (const k of ["betriebsrat", "subplaner"]) expect(sicht(bestand(), k), k).toEqual(sicht(bestand(ohne), k));
    /* Beschäftigte: bis auf festEingeplant gleich. */
    const { festEingeplant: _f, ...rest } = sicht(bestand(), "a1");
    const { festEingeplant: _g, ...restOhne } = sicht(bestand(ohne), "a1");
    expect(rest).toEqual(restOhne);
  });

  it("nur in der Antwort: mitgeschickt (auch gefälscht) wird festEingeplant nie gespeichert und ändert die Karte nicht", () => {
    const alt = bestand();
    const neu = structuredClone(alt);
    neu.mandanten[0].festEingeplant = ["2026-12-10", "2026-12-11"];
    neu.mandanten[0].angeheftet = { "a1|2026-12-10": ST };
    const e = zusammenfuehren(alt, neu, SITZ.a1);
    expect(e && !e.verweigert, e && e.verweigert).toBe(true);
    expect(e.mandanten[0]).not.toHaveProperty("festEingeplant");
    expect(e.mandanten[0].angeheftet).toEqual(alt.mandanten[0].angeheftet);
    /* Auch die Leitung speichert das abgeleitete Feld nicht. */
    const l = structuredClone(alt); l.mandanten[0].festEingeplant = ["2026-12-01"];
    const el = zusammenfuehren(alt, l, SITZ.leitung);
    expect(el && !el.verweigert, el && el.verweigert).toBe(true);
    expect(el.mandanten[0]).not.toHaveProperty("festEingeplant");
  });
});

describe("2. Oberfläche: Hinweis nur an eigener angehefteter Einteilung", () => {
  beforeEach(() => { vi.useFakeTimers({ now: new Date("2026-12-01T09:00:00.000Z"), toFake: ["Date"] }); });   // zeit-ok: feste Uhr der Prüfung
  afterEach(() => { vi.useRealTimers(); });
  const akt = new Proxy({}, { get: () => () => {} });
  const aufbau = () => {
    const db = demobestand();
    const m = db.mandanten[0];
    const ich = m.personen.find((p) => p.rolle === "mitarbeiter") || m.personen[0];
    const andere = m.personen.find((p) => String(p.id) !== String(ich.id));
    const tage = Array.from({ length: 42 }, (_, i) => { const x = new Date(Date.UTC(2026, 11, 1 + i)); return x.toISOString().slice(0, 10); });   // zeit-ok: reine Datumsrechnung
    const dienst = tage.filter((d) => personTag(m, ich, d).dienstId);
    const frei = tage.filter((d) => !personTag(m, ich, d).dienstId);
    return { db, m, ich, andere, dienst, frei };
  };
  const anzahl = (html) => html.split(FEST_EINGEPLANT_TEXT).length - 1;

  it("Hilfsfunktion: eigene Person und Tag mit Dienst ja; fremde Person, ohne Dienst, ohne Feld nie", () => {
    const m = { festEingeplant: ["2026-12-01"] };
    const ich = { id: "a1" }, fremd = { id: "a2" };
    expect(festEingeplant(m, ich, ich, "2026-12-01", true)).toBe(true);
    expect(festEingeplant(m, fremd, ich, "2026-12-01", true)).toBe(false);
    expect(festEingeplant(m, ich, ich, "2026-12-01", false)).toBe(false);
    expect(festEingeplant(m, ich, ich, "2026-12-02", true)).toBe(false);
    expect(festEingeplant({}, ich, ich, "2026-12-01", true)).toBe(false);
    expect(festEingeplant({ festEingeplant: "2026-12-01" }, ich, ich, "2026-12-01", true)).toBe(false);
    expect(festEingeplant(m, ich, null, "2026-12-01", true)).toBe(false);
  });

  it("Mein Plan: genau eine Karte mit sichtbarem Text am angehefteten Diensttag; ohne Feld kein Hinweis", () => {
    const { db, m, ich, dienst } = aufbau();
    expect(dienst.length, "Demobestand: Dienste in sechs Wochen").toBeGreaterThan(1);
    const sitz = { rolle: "mitarbeiter", db, mandant: m, person: ich };
    expect(anzahl(renderToStaticMarkup(h(MPlan, { sitz, akt, oeffnen() {} })))).toBe(0);
    m.festEingeplant = [dienst[1]];
    const html = renderToStaticMarkup(h(MPlan, { sitz, akt, oeffnen() {} }));
    expect(anzahl(html)).toBe(1);
    /* Barrierefrei: sichtbarer Text (nicht aria-hidden, nicht nur Farbe/Symbol). */
    expect(html).toMatch(new RegExp(`<div class="ssub" data-fest-eingeplant=""><span class="pille[^"]*">${FEST_EINGEPLANT_TEXT}</span></div>`));
    expect(html).not.toMatch(new RegExp(`aria-hidden="true"[^>]*>${FEST_EINGEPLANT_TEXT}`));
  });

  it("Mein Plan: ein Tag ohne Dienst bekommt keinen Hinweis", () => {
    const { db, m, ich, frei } = aufbau();
    const sitz = { rolle: "mitarbeiter", db, mandant: m, person: ich };
    m.festEingeplant = frei.slice(0, 5);
    expect(anzahl(renderToStaticMarkup(h(MPlan, { sitz, akt, oeffnen() {} })))).toBe(0);
  });

  it("Heute: Hinweis an der Karte „Dein Dienst heute“, wenn heute angeheftet; sonst nicht", () => {
    const { db, m, ich, dienst } = aufbau();
    if (dienst[0] !== "2026-12-01") vi.setSystemTime(new Date(`${dienst[0]}T09:00:00.000Z`));   // zeit-ok: Prüfuhr auf den ersten Diensttag
    const sitz = { rolle: "mitarbeiter", db, mandant: m, person: ich };
    const ohne = renderToStaticMarkup(h(MHeute, { sitz, akt, setTab() {}, oeffnen() {} }));
    expect(ohne).toContain("Dein Dienst heute");
    expect(anzahl(ohne)).toBe(0);
    m.festEingeplant = [dienst[0]];
    expect(anzahl(renderToStaticMarkup(h(MHeute, { sitz, akt, setTab() {}, oeffnen() {} })))).toBe(1);
  });
});
