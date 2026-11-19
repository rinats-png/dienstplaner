/* ==========================================================================
   PERSONAL — DIE ROLLENAUSWAHL HAT EINEN ZUGÄNGLICHEN NAMEN (WCAG 4.1.2)

   Gefunden in der Abnahme V4 Strang A (Befund A-5, 2026-11-13): axe-core
   meldete auf der Ansicht „Personal" der Leitung „select-name" (critical):
   Die Rollenauswahl je Zeile ist ein <select> ohne Beschriftung — ein
   Bildschirmleser sagt nur „Auswahlfeld, Planer", nicht wessen Rolle.

   Geprüft wird, was React rendert (echte Komponente, Betrieb aus dem
   Konstruktor der Oberfläche, Sicht der Leitung wie vom Server geliefert):
   Jedes <select> der Personalliste trägt einen Namen, der die Person nennt.

   Aufruf: npx vitest run pruefungen/personal-rollenauswahl-name.test.js
   ========================================================================== */
import { describe, it, expect, beforeAll } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { bestandFuerRolle } from "../server/lib/rechte.mjs";
import { personenAngleichen } from "../server/lib/gestalt.mjs";
import { migriere } from "../src/migration.js";

let A, Personal;
beforeAll(async () => {
  A = await import("../src/App.jsx");
  ({ Personal } = await import("../src/ansichten/personal.jsx"));
}, 120000);

function sitzLeitung() {
  const m = A.leererMandant("Rollenauswahl-Prüfung", "pflege");
  const e = m.einheiten[0].id;
  m.personen = [["leitung", "Lea", "Leitung"], ["planer", "Pia", "Planung"], ["mitarbeiter", "Mara", "Muster"]]
    .map(([rolle, vorname, nachname], i) => ({ ...A.zugangsPerson(rolle, e, i + 1), id: rolle, vorname, nachname }));
  const mig = migriere({ version: 5, stand: 1, mandanten: [m] });
  if (!mig.ok) throw new Error(`Migration: ${mig.grund}`);
  const ms = bestandFuerRolle(personenAngleichen(mig.bestand), { rolle: "leitung", person: "leitung", betrieb: 0 }).mandanten[0];
  return { rolle: "leitung", db: { mandanten: [ms], session: { mandantId: ms.id, personId: "leitung", rolle: "leitung" } },
    mandant: ms, person: ms.personen.find((p) => p.id === "leitung") };
}
const akt = new Proxy({}, { get: () => () => {} });

describe("Personal: Rollenauswahl je Zeile", () => {
  it("jedes <select> hat einen Namen mit der Person (aria-label)", () => {
    const html = renderToStaticMarkup(h(Personal, { sitz: sitzLeitung(), ym: "2026-11", akt, oeffnePerson: () => {} }));
    const selects = html.match(/<select\b[^>]*>/g) || [];
    expect(selects.length, "Die Leitung sieht Rollenauswahlen für Planung und Beschäftigte").toBeGreaterThanOrEqual(2);
    for (const s of selects) expect(s, s).toMatch(/aria-label="[^"]*\S[^"]*"/);
    expect(html).toContain('aria-label="Rolle von Pia Planung"');
    expect(html).toContain('aria-label="Rolle von Mara Muster"');
  });
});
