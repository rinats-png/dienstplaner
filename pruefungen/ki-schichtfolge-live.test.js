/* ==========================================================================
   WP-I2 — Live-Prüfung im Schichtfolge-Editor

   Beim Bearbeiten des Zyklusrasters zeigt der Editor laufend die Prüfbefunde
   (Ruhezeit, Dienste in Folge, Höchstarbeitszeit, Ausgleich, Schutz) — ohne
   Speichern und mit denselben Ergebnissen wie die bestehende Planprüfung
   (pruefen). Keine neue Regellogik, keine KI.

   Aufruf: npx vitest run pruefungen/ki-schichtfolge-live.test.js
   ========================================================================== */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const HEUTE = "2026-11-09";           // ein Montag
let A, P, R, S;

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${HEUTE}T09:00:00+01:00`));
  A = await import("../src/App.jsx");
  P = await import("../src/lib/fachlogik.js");
  R = await import("../src/lib/rasterpruefung.js");
  S = await import("../src/ansichten/schichtfolge.jsx");
}, 120000);
afterAll(() => { vi.useRealTimers(); });

/** Ein Betrieb mit einer Person; das Raster belegt Montag und Dienstag wie angegeben. */
function betrieb(tage) {
  const m = A.leererMandant("Live-Prüfung", "pflege");
  const e = m.einheiten[0].id;
  m.personen = [{ ...A.zugangsPerson("mitarbeiter", e, 1), id: "p1", vorname: "Test", nachname: "Eins" }];
  m.zyklus = { wochen: 1, tage: [...tage, ...Array(7 - tage.length).fill("-")], vorlage: null };
  return m;
}
const ruhe8 = () => betrieb(["S", "F"]);          // Spät 22:00 → Früh 06:00 = 8 h Ruhe
const ruhe16 = () => betrieb(["F", "F"]);          // 16 h Ruhe

describe("rasterBefunde — dieselben Befunde wie pruefen", () => {
  it("Raster mit 8 h Ruhe: Ruhezeit-Befund, Stufe warn (danger erst unter 8 h, wie pruefen), mit der Dienstfolge im Text", () => {
    const r = R.rasterBefunde(ruhe8());
    const ruhe = r.befunde.filter((b) => b.art === "ruhezeit");
    expect(ruhe.length).toBeGreaterThan(0);
    expect(ruhe[0].schwere).toBe("warn");
    expect(ruhe[0].text).toMatch(/8,0 h zwischen S/);
  });

  it("Raster mit 16 h Ruhe: kein Ruhezeit-Befund", () => {
    expect(R.rasterBefunde(ruhe16()).befunde.filter((b) => b.art === "ruhezeit")).toEqual([]);
  });

  it("Identität: jeder Befund ist ein Befund von pruefen über dasselbe Fenster (keine eigene Regellogik)", () => {
    const m = ruhe8();
    const r = R.rasterBefunde(m);
    const direkt = P.pruefen(m, r.von, r.bis);
    expect(r.von <= r.bis).toBe(true);
    expect(r.befunde.length).toBeGreaterThan(0);
    for (const b of r.befunde) expect(direkt).toContainEqual(b);
    /* und umgekehrt: alle Befunde der Rasterarten aus pruefen kommen vor */
    const arten = new Set(R.RASTER_ARTEN);
    expect(r.befunde.map((b) => b.id).sort()).toEqual(direkt.filter((b) => arten.has(b.art)).map((b) => b.id).sort());
  });

  it("Besetzungs- und Quotenbefunde gehören nicht dazu (Raster, nicht Tagesplan)", () => {
    const arten = new Set(R.rasterBefunde(ruhe8()).befunde.map((b) => b.art));
    for (const a of ["besetzung", "fachkraft", "qualifikation", "entgelt"]) expect(arten.has(a)).toBe(false);
  });

  it("Änderung des Rasters ändert den Befund sofort (ohne Speichern): 8 h → 16 h ⇒ weg", () => {
    const m = ruhe8();
    expect(R.rasterBefunde(m).befunde.some((b) => b.art === "ruhezeit")).toBe(true);
    const m2 = { ...m, zyklus: { ...m.zyklus, tage: ["S", "S", "-", "-", "-", "-", "-"] } };
    expect(R.rasterBefunde(m2).befunde.some((b) => b.art === "ruhezeit")).toBe(false);
  });

  it("Dienste in Folge über dem Grenzwert werden gemeldet", () => {
    const m = betrieb(["F", "F", "F", "F", "F", "F", "F"]);
    expect(R.rasterBefunde(m).befunde.some((b) => b.art === "folge")).toBe(true);
  });

  it("Zusammenfassung: Zählung je Art, höchste Stufe zuerst", () => {
    const g = R.rasterBefunde(ruhe8()).gruppen;
    expect(g.length).toBeGreaterThan(0);
    expect(g[0]).toMatchObject({ art: "ruhezeit", schwere: "warn" });
    expect(g[0].anzahl).toBeGreaterThan(0);
  });

  it("Raster ohne Dienst: keine Befunde, kein Absturz", () => {
    const r = R.rasterBefunde(betrieb([]));
    expect(r.befunde).toEqual([]);
    expect(r.gruppen).toEqual([]);
  });
});

describe("Schichtfolge-Ansicht zeigt die Live-Prüfung", () => {
  const akt = new Proxy({}, { get: () => () => {} });
  const seite = (m, rolle = "planer") => {
    const person = { ...A.zugangsPerson(rolle, m.einheiten[0].id, 9), id: rolle, rolle };
    const ms = { ...m, personen: [...m.personen, person] };
    const sitz = { rolle: "kunde", db: { mandanten: [ms], session: { mandantId: ms.id, personId: rolle, rolle } }, mandant: ms, person };
    return renderToStaticMarkup(h(S.Schichtfolge, { sitz, akt })).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  };

  it("8 h Ruhe: Bereich „Live-Prüfung“ mit Ruhezeit-Befund", () => {
    const t = seite(ruhe8());
    expect(t).toContain("Live-Prüfung");
    expect(t).toMatch(/Ruhezeit unterschritten/);
  });

  it("16 h Ruhe: Bereich zeigt „keine Befunde“", () => {
    const t = seite(ruhe16());
    expect(t).toContain("Live-Prüfung");
    expect(t).toMatch(/Keine Befunde/);
    expect(t).not.toMatch(/Ruhezeit unterschritten/);
  });

  it("Hinweis: Befunde erscheinen beim Ändern, nichts wird gespeichert oder gesperrt", () => {
    expect(seite(ruhe8())).toMatch(/nicht gespeichert|ohne Speichern|keine Sperre/i);
  });
});
