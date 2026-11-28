/* ==========================================================================
   WP-I7 (Anheften) — „Fest eingeplant“ in der Telefonansicht der Beschäftigten

   Grundlage ist die Ableitung aus #605: sicht.mjs festEingeplantEigene liefert Beschäftigten das Kennzeichen
   `festEingeplant` = { "<ich>|<JJJJ-MM-TT>": true } (fehlt, wenn leer); Text und Prüfung aus src/ansichten/anheftungen.jsx
   (FEST_EINGEPLANT_TEXT, festEingeplant). Hier ergänzend:
   1. Server: Entwurf, Mandantentrennung, Betriebsrat/SV mit Karte = ohne Karte, Objektform ohne Metadaten, und die Wache
      „mitgeschicktes festEingeplant wird nie gespeichert“ (rechte.mjs abgeleiteteEntfernen) — auch nicht ein bereits
      gespeichertes (Altbestand) über den vollen Schreibweg.
   2. Telefonansicht (mobil.jsx): Hinweis als sichtbarer Text nur an eigener angehefteter Einteilung mit Dienst.

   Nur synthetische Daten. Aufruf: TZ=UTC npx vitest run pruefungen/fest-eingeplant.test.js
   ========================================================================== */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { bestandFuerRolle, zusammenfuehren } from "../server/lib/rechte.mjs";
import { festEingeplant, FEST_EINGEPLANT_TEXT } from "../src/ansichten/anheftungen.jsx";
import { MPlan, MHeute } from "../src/ansichten/mobil.jsx";
import { demobestand, personTag } from "../src/lib/fachlogik.js";

const ST = { am: "2026-11-27T10:00:00.000Z", vonRolle: "leitung" };
const AUF = { ...ST, aufgehobenAm: "2026-11-27T11:00:00.000Z", aufgehobenVonRolle: "planer" };

const person = (id, rolle) => ({ id, vorname: `V${id}`, nachname: `N${id}`, rolle, bereich: "e1", status: "aktiv",
  zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }] });
const betrieb = (id = "m1", extra = {}) => ({ id, name: `Haus ${id}`, einheiten: [{ id: "e1", name: "WB" }],
  dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00" }],
  personen: [person("a1", "mitarbeiter"), person("a2", "mitarbeiter"), person("s1", "subplaner"), person("r1", "betriebsrat"),
    person("p1", "planer"), person("l1", "leitung")],
  abweichungen: { "a1|2026-12-01": "F", "a1|2026-12-02": "-", "a1|2026-12-03": "F", "a2|2026-12-01": "F", "r1|2026-12-01": "F" },
  angeheftet: { "a1|2026-12-01": ST, "a1|2026-12-02": ST, "a1|2026-12-03": AUF, "a1|2026-12-04": ST, "a2|2026-12-01": ST, "r1|2026-12-01": ST },
  einstellungen: {}, abwesenheiten: [], erfassung: {}, einstempeln: {}, anfragen: [], aenderungen: [], nachrichten: [], ...extra });
const bestand = (...m) => ({ version: 9, stand: 1, mandanten: m.length ? m : [betrieb()] });
const SITZ = {
  a1: { rolle: "mitarbeiter", person: "a1", betrieb: 0, mandantId: "m1" },
  betriebsrat: { rolle: "betriebsrat", person: "r1", betrieb: 0, mandantId: "m1" },
  subplaner: { rolle: "subplaner", person: "s1", betrieb: 0, mandantId: "m1" },
  leitung: { rolle: "leitung", person: "l1", betrieb: 0, mandantId: "m1" },
  kunde: { rolle: "kunde", person: null, betrieb: 0, mandantId: "m1" },
};
const sicht = (b, k) => bestandFuerRolle(b, SITZ[k]).mandanten[0];
const EIGEN = { "a1|2026-12-01": true, "a1|2026-12-02": true };

describe("1. Server: Kennzeichen der Basis (Objektform) — ergänzende Fälle", () => {
  beforeEach(() => { vi.useFakeTimers({ now: new Date("2026-11-28T09:00:00.000Z"), toFake: ["Date"] }); });   // zeit-ok: feste Uhr der Prüfung
  afterEach(() => { vi.useRealTimers(); });

  it("Objektform: nur eigene, aktive, eingetragene Tage; nur true; keine Metadaten, keine Karte", () => {
    const m = sicht(bestand(), "a1");
    expect(m.festEingeplant).toEqual(EIGEN);
    for (const [k, v] of Object.entries(m.festEingeplant)) { expect(k).toMatch(/^a1\|\d{4}-\d{2}-\d{2}$/); expect(v).toBe(true); }
    for (const verboten of ["vonRolle", "aufgehoben", "leitung", "planer", "a2|", "r1|", "2026-11-27"])
      expect(JSON.stringify(m.festEingeplant), verboten).not.toContain(verboten);
    expect(m).not.toHaveProperty("angeheftet");
  });

  it("Entwurf: nicht freigegebener künftiger Monat verrät nichts (Feld fehlt); nach Freigabe sichtbar", () => {
    const m = sicht(bestand(betrieb("m1", { einstellungen: { planFreigabePflicht: true } })), "a1");
    expect(m.abweichungen).toEqual({});
    expect(m).not.toHaveProperty("festEingeplant");
    const frei = betrieb("m1", { einstellungen: { planFreigabePflicht: true }, freigaben: { "2026-12": { stand: 1 } } });
    expect(sicht(bestand(frei), "a1").festEingeplant).toEqual(EIGEN);
  });

  it("Mandantentrennung: nur der eigene Betrieb, auch bei gleicher Personenkennung im fremden", () => {
    const fremd = betrieb("m2", { abweichungen: { "a1|2026-12-10": "F" }, angeheftet: { "a1|2026-12-10": ST } });
    expect(sicht(bestand(betrieb(), fremd), "a1").festEingeplant).toEqual(EIGEN);
    expect(bestandFuerRolle(bestand(fremd, betrieb()), { ...SITZ.a1, betrieb: 1 }).mandanten[0].festEingeplant).toEqual(EIGEN);
  });

  it("Betriebsrat und Schichtverantwortung: Antwort mit Karte = ohne Karte (sehen nicht mehr als bisher)", () => {
    const ohne = betrieb(); delete ohne.angeheftet;
    for (const k of ["betriebsrat", "subplaner"]) {
      expect(sicht(bestand(), k), k).not.toHaveProperty("festEingeplant");
      expect(sicht(bestand(), k), k).toEqual(sicht(bestand(ohne), k));
    }
  });

  it("C-2 Wache: mitgeschicktes festEingeplant wird nie gespeichert — voller Schreibweg (Leitung, Kunde), Beschäftigte, Altbestand", () => {
    const alt = bestand();
    for (const k of ["leitung", "kunde", "a1"]) {
      const neu = structuredClone(alt);
      neu.mandanten[0].festEingeplant = { "a1|2026-12-09": true, "p1|2026-12-01": true };
      const e = zusammenfuehren(alt, neu, SITZ[k]);
      expect(e && !e.verweigert, `${k}: ${e && e.verweigert}`).toBe(true);
      expect(e.mandanten[0], k).not.toHaveProperty("festEingeplant");
      /* Die Karte ist dieselbe wie beim Speichern ohne das Feld (die verwaiste Anheftung vermerkt der Schreibweg ohnehin). */
      expect(e.mandanten[0].angeheftet, k).toEqual(zusammenfuehren(alt, structuredClone(alt), SITZ[k]).mandanten[0].angeheftet);
    }
    /* Ein schon gespeichertes Kennzeichen (Altbestand, Fremdeinspielung) verschwindet beim nächsten Speichern der Leitung. */
    const altMit = bestand(betrieb("m1", { festEingeplant: { "a1|2026-12-09": true } }));
    const e = zusammenfuehren(altMit, structuredClone(altMit), SITZ.leitung);
    expect(e && !e.verweigert, e && e.verweigert).toBe(true);
    expect(e.mandanten[0]).not.toHaveProperty("festEingeplant");
  });
});

describe("2. Telefonansicht: Hinweis nur an eigener angehefteter Einteilung mit Dienst", () => {
  beforeEach(() => { vi.useFakeTimers({ now: new Date("2026-12-01T09:00:00.000Z"), toFake: ["Date"] }); });   // zeit-ok: feste Uhr der Prüfung
  afterEach(() => { vi.useRealTimers(); });
  const akt = new Proxy({}, { get: () => () => {} });
  const aufbau = () => {
    const db = demobestand();
    const m = db.mandanten[0];
    const ich = m.personen.find((p) => p.rolle === "mitarbeiter") || m.personen[0];
    const andere = m.personen.find((p) => String(p.id) !== String(ich.id));
    const tage = Array.from({ length: 42 }, (_, i) => new Date(Date.UTC(2026, 11, 1 + i)).toISOString().slice(0, 10));   // zeit-ok: reine Datumsrechnung
    const dienst = tage.filter((d) => personTag(m, ich, d).dienstId);
    const frei = tage.filter((d) => !personTag(m, ich, d).dienstId);
    return { db, m, ich, andere, dienst, frei, sitz: { rolle: "mitarbeiter", db, mandant: m, person: ich } };
  };
  const anzahl = (html) => html.split(FEST_EINGEPLANT_TEXT).length - 1;
  const fest = (pid, tage) => Object.fromEntries(tage.map((d) => [`${pid}|${d}`, true]));

  it("Mein Plan: genau eine Karte mit sichtbarem Text am angehefteten Diensttag; ohne Feld kein Hinweis", () => {
    const { m, dienst, ich, sitz } = aufbau();
    expect(dienst.length, "Demobestand: Dienste in sechs Wochen").toBeGreaterThan(1);
    expect(anzahl(renderToStaticMarkup(h(MPlan, { sitz, akt, oeffnen() {} })))).toBe(0);
    m.festEingeplant = fest(ich.id, [dienst[1]]);
    const html = renderToStaticMarkup(h(MPlan, { sitz, akt, oeffnen() {} }));
    expect(anzahl(html)).toBe(1);
    /* Barrierefrei: sichtbarer Text (Pille, nicht aria-hidden), nicht nur Farbe oder Symbol. */
    expect(html).toContain(`<div class="ssub" data-fest-eingeplant=""><span class="pille pille-accent pille-sm">${FEST_EINGEPLANT_TEXT}</span></div>`);
    expect(html).not.toContain(`aria-hidden="true">${FEST_EINGEPLANT_TEXT}`);
  });

  it("Mein Plan: fremde Person und Tage ohne Dienst bekommen nie einen Hinweis", () => {
    const { m, dienst, frei, ich, andere, sitz } = aufbau();
    m.festEingeplant = { ...fest(andere.id, dienst), ...fest(ich.id, frei.slice(0, 5)) };
    expect(anzahl(renderToStaticMarkup(h(MPlan, { sitz, akt, oeffnen() {} })))).toBe(0);
    expect(festEingeplant(m, andere.id, dienst[0])).toBe(true);    // Gegenprobe: das Kennzeichen läge vor, nur nicht für mich
  });

  it("Heute: Hinweis an „Dein Dienst heute“, wenn heute angeheftet; sonst nicht", () => {
    const { m, dienst, ich, sitz } = aufbau();
    vi.setSystemTime(new Date(`${dienst[0]}T09:00:00.000Z`));   // zeit-ok: Prüfuhr auf den ersten Diensttag
    const ohne = renderToStaticMarkup(h(MHeute, { sitz, akt, setTab() {}, oeffnen() {} }));
    expect(ohne).toContain("Dein Dienst heute");
    expect(anzahl(ohne)).toBe(0);
    m.festEingeplant = fest(ich.id, [dienst[0]]);
    expect(anzahl(renderToStaticMarkup(h(MHeute, { sitz, akt, setTab() {}, oeffnen() {} })))).toBe(1);
  });
});
