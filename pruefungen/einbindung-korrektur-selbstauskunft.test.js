/* ==========================================================================
   EINBINDUNG: Monatskorrektur (WP-16c) und Selbstauskunft (WP-15)

   Gerendert werden die echten Hostkomponenten (StempelBefunde, MeineSchichten) mit den Daten,
   die der Server der Rolle liefert (bestandFuerRolle). Geprüft: wer sieht was, und dass die
   Aktionen (monatKorrektur, uebernehmeSelbstauskunft) in akt vorhanden sind.
   ========================================================================== */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { berlinZeitpunkt } from "../server/lib/zeiterfassung.mjs";
import { bestandFuerRolle } from "../server/lib/rechte.mjs";
import { migriere } from "../src/migration.js";
import { personenAngleichen } from "../server/lib/gestalt.mjs";
import { StempelBefunde } from "../src/ansichten/korrekturen.jsx";
import { appQuelle } from "./app-quelle.js";

const HEUTE = "2026-11-04", MONAT = "2026-11", TAG = "2026-11-03";
let A;
beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(berlinZeitpunkt(HEUTE, "11:00")));
  A = await import("../src/App.jsx");
}, 120000);
afterAll(() => { vi.useRealTimers(); });

const antrag = () => ({ id: "sa-1", status: "offen", gestellt: "2026-11-03T18:00:00.000Z", von: { personId: "mitarbeiter", rolle: "mitarbeiter" },
  wieGeplant: false, vorschlag: { start: "05:30", ende: "15:00", pause: 15 }, grund: "Übergabe verlängert",
  abweichung: { abweichend: true, marken: ["BEGINN"], beginnMin: -30, endeMin: 60, dauerMin: 90, pauseMin: -15,
    plan: { dienst: "F", start: "06:00", ende: "14:00", pause: 30 } }, stempel: "keiner", entschieden: null });

function betrieb(abschluss = false) {
  const m = A.leererMandant("Einbindung", "pflege");
  const e = m.einheiten[0].id;
  m.personen = ["leitung", "planer", "subplaner", "mitarbeiter", "betriebsrat"]
    .map((rolle, i) => ({ ...A.zugangsPerson(rolle, e, i + 1), id: rolle, vorname: "Test", nachname: rolle }));
  m.einstempeln = {};
  m.erfassung = { [`mitarbeiter|${TAG}`]: { start: null, ende: null, bestaetigt: false, selbstauskunft: antrag() } };
  m.monatsabschluss = !abschluss ? {} : { [MONAT]: { abgeschlossen: true, revision: 1, revisionen: [],
    lohnexport: { am: "2026-11-03T10:00:00.000Z", wer: { name: "Test leitung" }, abdruck: "abc", revision: 1 } } };
  return m;
}
function sitzFuer(m, rolle) {
  const mig = migriere({ version: 5, stand: 1, mandanten: [m] });
  if (!mig.ok) throw new Error(`Migration: ${mig.grund}`);
  const ms = bestandFuerRolle(personenAngleichen(mig.bestand), { rolle, person: rolle, betrieb: 0 }).mandanten[0];
  return { rolle: "kunde", db: { mandanten: [ms], session: { mandantId: ms.id, personId: rolle, rolle } }, mandant: ms, person: ms.personen.find((p) => p.id === rolle) };
}
const akt = new Proxy({}, { get: () => () => {} });
const text = (el) => renderToStaticMarkup(el).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const befunde = (rolle, abschluss = false) => text(h(StempelBefunde, { sitz: sitzFuer(betrieb(abschluss), rolle), ym: MONAT, akt }));
const meine = (rolle) => text(h(A.MeineSchichten, { sitz: sitzFuer(betrieb(), rolle), akt, ym: MONAT }));

describe("Einbindung Monatskorrektur (WP-16c): nur Leitung (org.edit)", () => {
  it("Leitung sieht „Korrektur beginnen“ nach bestätigtem Lohnexport", () => {
    const t = befunde("leitung", true);
    expect(t).toContain("Korrektur nach Lohnexport");
    expect(t).toContain("Korrektur beginnen");
  });
  it.each(["planer", "subplaner", "mitarbeiter", "betriebsrat"])("%s sieht keine Monatskorrektur", (rolle) => {
    expect(befunde(rolle, true)).not.toContain("Korrektur nach Lohnexport");
  });
  it("ohne akt.monatKorrektur rendert nichts (kein Absturz)", () => {
    expect(text(h(StempelBefunde, { sitz: sitzFuer(betrieb(true), "leitung"), ym: MONAT, akt: {} }))).not.toContain("Korrektur nach Lohnexport");
  });
});

describe("Einbindung Selbstauskunft (WP-15)", () => {
  it("Leitung und Planung sehen die Freigabe mit Freigeben/Ablehnen", () => {
    for (const rolle of ["leitung", "planer"]) {
      const t = befunde(rolle);
      expect(t, rolle).toContain("Freigeben");
      expect(t, rolle).toContain("Grund: Übergabe verlängert");
    }
  });
  it("Schichtverantwortung und Betriebsrat sehen keine Freigabe", () => {
    for (const rolle of ["subplaner", "betriebsrat"]) expect(befunde(rolle), rolle).not.toContain("Übergabe verlängert");
  });
  it("die Beschäftigte sieht ihren Antrag in „Meine Schichten“, der Betriebsrat nicht", () => {
    const t = meine("mitarbeiter");
    expect(t).toContain("Meine Zeiten-Anträge");
    expect(t).toContain("offen — zählt noch nicht");
    expect(meine("betriebsrat")).not.toContain("Meine Zeiten-Anträge");
  });
  it("App.jsx stellt die Aktionen bereit und meldet Selbstauskunft-Stand in erfassung", () => {
    /* WP-39: die Aktionen stehen in src/app/aktionen/ — gelesen wird App.jsx samt ausgelagerter Dateien. */
    const q = appQuelle();
    expect(q).toMatch(/monatKorrektur: async \(aktion, monat, extra = \{\}\)/);
    expect(q).toMatch(/uebernehmeSelbstauskunft: \(pid, d, erg\)/);
    expect(q).toContain('SP.monatsabschluss(aktion, monat, extra)');
  });
});
