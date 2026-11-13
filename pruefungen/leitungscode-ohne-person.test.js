/* ==========================================================================
   ABNAHME V4, A-3 — Leitungscode ohne Person zeigt nicht den Vorführ-Rollenwähler

   Befund: Ein Leitungscode OHNE Person in einem Betrieb, der Personen, aber
   keine aktive Leitungsperson hat, landete auf dem Rollenwähler der
   Vorführfassung („Vorführfassung — du bist bereits angemeldet", „Zur
   Betreiberkonsole", „Als Planer anmelden …"), obwohl der Zugang kein
   Demozugang ist. Ursache in der Oberfläche: ohne passende Person keine
   Sitzung → App.jsx rendert `Anmeldung`, und die ist für einen Bestand ohne
   Sitzung der Rollenwähler. Serverseitig keine Rechteausweitung (das Token
   bleibt „leitung"); der Server bleibt unverändert.

   Regel (src/app/zugangssitzung.js):
   - Code ohne Person, Personen vorhanden, keine aktive der Rolle → klare
     Meldung (Ladefehler-Bildschirm), keine Sitzung, keine Person angelegt,
     auch keine im Bestand mitgebrachte fremde Sitzung.
   - Betrieb ganz ohne Personen → wie bisher: die erste Person entsteht aus
     dem Code (erste Anmeldung der Leitung im leeren Betrieb).
   - Demozugang, Altrolle „kunde", Betreiber, personengebundene Codes →
     unverändert.

   Geprüft wird die echte Auflösung und das, was React tatsächlich rendert
   (Ladefehlerseite, Anmeldung) — ohne Browser.

   Aufruf: npx vitest run pruefungen/leitungscode-ohne-person.test.js
   ========================================================================== */
import { describe, it, expect, beforeAll } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { sitzungAusZugang, OHNE_PERSON_TITEL } from "../src/app/zugangssitzung.js";
import { Ladefehlerseite } from "../src/ansichten/ladefehler.jsx";

const HEUTE = "2026-11-13";
const text = (el) => renderToStaticMarkup(el).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const kopie = (x) => JSON.parse(JSON.stringify(x));
const VORFUEHRUNG = ["Vorführfassung", "Zur Betreiberkonsole", "Sicht einer Rolle im Betrieb"];

let Anmeldung;
beforeAll(async () => { ({ Anmeldung } = await import("../src/ansichten/anmeldung.jsx")); }, 120000);

const person = (id, rolle, extra = {}) => ({ id, vorname: "V", nachname: `N${id}`, rolle, bereich: "ALLE", status: "aktiv",
  qualifikationen: [], eintritt: "2020-01-01", austritt: null, zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }], ...extra });
const bestand = (personen, extra = {}) => ({ version: 9, stand: 3, mandanten: [{ id: "m1", name: "Haus Linde", status: "aktiv",
  einheiten: [{ id: "e1", name: "WB 1" }], dienstarten: [], einstellungen: {}, personen, ...extra }] });
const OHNE_LEITUNG = () => bestand([person("p1", "planer"), person("m0", "mitarbeiter")]);
const LEITUNG = { rolle: "leitung", person: null, betrieb: 0, demo: false };

describe("A-3: Code ohne Person, Personen da, keine aktive Person der Rolle", () => {
  const faelle = [
    ["keine Leitungsperson", OHNE_LEITUNG],
    ["einzige Leitung ausgeschieden", () => bestand([person("l1", "leitung", { austritt: "2026-01-31" }), person("m0", "mitarbeiter")])],
    ["einzige Leitung inaktiv", () => bestand([person("l1", "leitung", { status: "inaktiv" }), person("m0", "mitarbeiter")])],
    ["einzige Leitung tritt erst später ein", () => bestand([person("l1", "leitung", { eintritt: "2027-01-01" }), person("m0", "mitarbeiter")])],
  ];
  it.each(faelle)("%s: Meldung, keine Sitzung, keine Person angelegt, Bestand sonst unverändert", (_n, bau) => {
    const b = bau();
    const vorher = kopie(b);
    const r = sitzungAusZugang(b, LEITUNG, HEUTE);
    expect(r.fehler).toBeTruthy();
    expect(r.fehler.titel).toBe(OHNE_PERSON_TITEL);
    expect(r.fehler.text).toContain("Haus Linde");
    expect(r.fehler.text).toMatch(/Betreiber oder die Verwaltung/);
    expect(r.bestand.session).toBeNull();
    expect(r.bestand.mandanten).toEqual(vorher.mandanten);
    expect(b).toEqual(vorher);
  });
  it("gilt für jede Rolle eines Codes ohne Person (z. B. Planung ohne Planungsperson)", () => {
    const r = sitzungAusZugang(bestand([person("l1", "leitung"), person("m0", "mitarbeiter")]), { ...LEITUNG, rolle: "planer" }, HEUTE);
    expect(r.fehler && r.fehler.titel).toBe(OHNE_PERSON_TITEL);
    expect(r.bestand.session).toBeNull();
  });
  it("eine im Bestand mitgebrachte Sitzung einer anderen Person wird nicht übernommen", () => {
    const b = { ...OHNE_LEITUNG(), session: { rolle: "kunde", mandantId: "m1", personId: "p1" } };
    const r = sitzungAusZugang(b, LEITUNG, HEUTE);
    expect(r.bestand.session).toBeNull();
    expect(r.fehler).toBeTruthy();
  });
  it("gerendert: klare Meldung mit Abmelden — kein Rollenwähler, keine Betreiberkonsole, kein Rollenwechsel", () => {
    const r = sitzungAusZugang(OHNE_LEITUNG(), LEITUNG, HEUTE);
    const t = text(h(Ladefehlerseite, { ladefehler: r.fehler, onNeuLaden: () => {}, onDemoAnlegen: () => {}, onAbmelden: () => {} }));
    expect(t).toContain(OHNE_PERSON_TITEL);
    expect(t).toContain("Abmelden");
    for (const v of [...VORFUEHRUNG, "Als Planer", "anmelden …", "Demo-Bestand anlegen", "Neu laden"]) expect(t).not.toContain(v);
    expect(renderToStaticMarkup(h(Ladefehlerseite, { ladefehler: r.fehler, onAbmelden: () => {} }))).toContain('role="alert"');
  });
  it("Gegenprobe: ohne Meldung rendert dieselbe Lage den Rollenwähler der Vorführfassung (der Befund)", () => {
    const db = { ...OHNE_LEITUNG(), session: null };
    const t = text(h(Anmeldung, { db, onLogin: () => {} }));
    for (const v of VORFUEHRUNG) expect(t).toContain(v);
  });
  it("App.jsx: der Ladefehler-Bildschirm hat Vorrang vor der Anmeldung (ohne Sitzung)", () => {
    const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
    const fehler = app.indexOf("if (ladefehler) {");
    const anm = app.indexOf("if (!db.session) return");
    expect(fehler).toBeGreaterThan(0);
    expect(anm).toBeGreaterThan(fehler);
    expect(app).toMatch(/const aufgeloest = sitzungAusZugang\(b, zugang\);[\s\S]{0,120}if \(aufgeloest\.fehler\) setLadefehler\(aufgeloest\.fehler\);/);
  });
});

describe("A-3: unverändert", () => {
  it("leerer Betrieb: erste Anmeldung der Leitung legt ihre Person an und meldet sie an", () => {
    const b = bestand([], { seit: "2026-11-01", kontakt: "l@example.org" });
    const r = sitzungAusZugang(b, LEITUNG, HEUTE);
    expect(r.fehler).toBeNull();
    const ps = r.bestand.mandanten[0].personen;
    expect(ps).toHaveLength(1);
    expect(ps[0]).toMatchObject({ rolle: "leitung", bereich: "ALLE", status: "aktiv", eintritt: "2026-11-01", email: "l@example.org",
      imSchichtdienst: false, zugehoerigkeit: [{ ab: "2026-11-01", einheitId: "e1" }] });
    expect(r.bestand.session).toEqual({ rolle: "kunde", mandantId: "m1", personId: ps[0].id });
    expect(b.mandanten[0].personen).toEqual([]);
  });
  it("aktive Leitung vorhanden: Code ohne Person meldet die erste aktive Leitung an", () => {
    const b = bestand([person("l0", "leitung", { austritt: "2026-01-31" }), person("l1", "leitung"), person("m0", "mitarbeiter")]);
    const r = sitzungAusZugang(b, LEITUNG, HEUTE);
    expect(r.fehler).toBeNull();
    expect(r.bestand.session).toEqual({ rolle: "kunde", mandantId: "m1", personId: "l1" });
    expect(r.bestand.mandanten).toEqual(b.mandanten);
  });
  it("personengebundener Code: Kennung, dann Index; unbekannte Person → bisherige Meldung, nie eine andere Person", () => {
    const b = bestand([person("l1", "leitung"), person("m0", "mitarbeiter")]);
    expect(sitzungAusZugang(b, { rolle: "mitarbeiter", person: "m0" }, HEUTE).bestand.session.personId).toBe("m0");
    expect(sitzungAusZugang(b, { rolle: "mitarbeiter", person: 1 }, HEUTE).bestand.session.personId).toBe("m0");
    const weg = sitzungAusZugang(b, { rolle: "mitarbeiter", person: "x9" }, HEUTE);
    expect(weg.fehler).toMatch(/gehört zu einer Person, die es in „Haus Linde" nicht mehr gibt/);
    expect(weg.bestand.session).toBeNull();
  });
  it("Demozugang und Altrolle „kunde“: Bestand unverändert, der Rollenwähler bleibt (Vorführfassung)", () => {
    for (const zugang of [{ ...LEITUNG, demo: true }, { rolle: "kunde" }, null]) {
      const b = OHNE_LEITUNG();
      const r = sitzungAusZugang(b, zugang, HEUTE);
      expect(r.bestand).toBe(b);
      expect(r.fehler).toBeNull();
      const t = text(h(Anmeldung, { db: r.bestand, onLogin: () => {} }));
      for (const v of VORFUEHRUNG) expect(t, JSON.stringify(zugang)).toContain(v);
    }
  });
  it("Betreiber: Sitzung der Betreiberkonsole, keine Meldung", () => {
    const r = sitzungAusZugang(OHNE_LEITUNG(), { rolle: "betreiber" }, HEUTE);
    expect(r.bestand.session).toEqual({ rolle: "betreiber" });
    expect(r.fehler).toBeNull();
  });
});
