/* ==========================================================================
   MONATSABSCHLUSS UND PAUSE: OBERFLÄCHE (WP-16)

   Gerendert werden die echten Komponenten aus src/App.jsx mit Daten, wie der
   Server sie der Rolle liefert (bestandFuerRolle):
   - Monatsabschluss (Stempelbefunde): Status, Verlauf mit Grund, abgewiesene
     Stempel; „Monat abschließen“ für Leitung und Planung in vergangenen
     Monaten, „Wiederöffnen“ nur für die Leitung,
   - KorrekturKarte: im abgeschlossenen Monat kein „Korrektur beantragen“,
     stattdessen der Hinweis,
   - Stempeluhr: beim Ausstempeln ein Feld für die Pause.
   ========================================================================== */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { bestandFuerRolle } from "../server/lib/rechte.mjs";
import { migriere } from "../src/migration.js";
import { personenAngleichen } from "../server/lib/gestalt.mjs";
import { berlinZeitpunkt } from "../server/lib/zeiterfassung.mjs";

const HEUTE = "2026-11-10";
let A;
beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(berlinZeitpunkt(HEUTE, "11:00")));
  A = await import("../src/App.jsx");
}, 120000);
afterAll(() => { vi.useRealTimers(); });

const akt = new Proxy({}, { get: () => () => {} });
const text = (el) => renderToStaticMarkup(el).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const WER = { personId: "leitung", name: "Test leitung", rolle: "leitung" };

function betrieb() {
  const m = A.leererMandant("Abschluss", "pflege");
  const e = m.einheiten[0].id;
  const da = m.dienstarten[0].id;
  m.personen = ["leitung", "planer", "subplaner", "mitarbeiter", "betriebsrat"].map((rolle, i) => ({ ...A.zugangsPerson(rolle, e, i + 1),
    id: rolle, vorname: "Test", nachname: rolle, eintritt: "2020-01-01", zugehoerigkeit: [{ ab: "2020-01-01", einheitId: e }] }));
  const st = (t, s, en) => ({ start: s, startAm: `${t}T05:00:00.000Z`, ende: en, endeAm: `${t}T13:00:00.000Z` });
  m.abweichungen = { "mitarbeiter|2026-10-30": da, "mitarbeiter|2026-11-09": da };
  m.einstempeln = { "mitarbeiter|2026-10-30": st("2026-10-30", "06:00", "14:00"), "mitarbeiter|2026-11-09": st("2026-11-09", "06:00", "14:00") };
  m.erfassung = { "mitarbeiter|2026-10-30": { start: "06:00", ende: "14:00", bestaetigt: true, grund: "" },
    "mitarbeiter|2026-11-09": { start: "06:00", ende: "14:00", bestaetigt: true, grund: "" } };
  m.monatsabschluss = {
    "2026-10": { abgeschlossen: true, am: "2026-11-03T08:00:00.000Z", wer: WER, abdruck: "0123456789abcdef0123456789abcdef",
      verlauf: [
        { id: "ma-1", art: "abschluss", am: "2026-11-02T08:00:00.000Z", wer: WER, grund: "Lohnlauf Oktober" },
        { id: "ma-2", art: "wiederoeffnung", am: "2026-11-02T09:00:00.000Z", wer: WER, grund: "Nachtrag eines Nachtdiensts" },
        { id: "ma-3", art: "abschluss", am: "2026-11-03T08:00:00.000Z", wer: WER, grund: "" }],
      abgewiesen: [{ personId: "mitarbeiter", datum: "2026-10-31", art: "ende", zeitAm: "2026-11-01T05:00:00.000Z", offline: true, ereignis: "e1", am: "2026-11-04T07:00:00.000Z" }] },
  };
  return m;
}
function sitzFuer(m, rolle) {
  const mig = migriere({ version: 5, stand: 1, mandanten: [m] });
  if (!mig.ok) throw new Error(`Migration: ${mig.grund}`);
  const ms = bestandFuerRolle(personenAngleichen(mig.bestand), { rolle, person: rolle, betrieb: 0 }).mandanten[0];
  return { rolle: "kunde", db: { mandanten: [ms], session: { mandantId: ms.id, personId: rolle, rolle } }, mandant: ms,
    person: ms.personen.find((x) => x.id === rolle) };
}

describe("Monatsabschluss in den Stempelbefunden", () => {
  it("Leitung, abgeschlossener Monat: Status mit Wann und Wer, Verlauf mit Grund, abgewiesener Stempel, „Wiederöffnen“", () => {
    const t = text(h(A.Monatsabschluss, { sitz: sitzFuer(betrieb(), "leitung"), ym: "2026-10", akt }));
    expect(t).toContain("Oktober 2026 abgeschlossen");
    expect(t).toContain("Test leitung");
    expect(t).toContain("Lohnlauf Oktober");
    expect(t).toContain("wiedergeöffnet");
    expect(t).toContain("Nachtrag eines Nachtdiensts");
    expect(t).toContain("1 Stempel nach dem Abschluss abgewiesen");
    expect(t).toContain("Wiederöffnen");
    expect(t).not.toContain("Monat abschließen");
  });
  it("Planung, abgeschlossener Monat: kein „Wiederöffnen“ (nur die Leitung); offener vergangener Monat: „Monat abschließen“", () => {
    const zu = text(h(A.Monatsabschluss, { sitz: sitzFuer(betrieb(), "planer"), ym: "2026-10", akt }));
    expect(zu).toContain("Oktober 2026 abgeschlossen");
    expect(zu).not.toContain("Wiederöffnen");
    const offen = text(h(A.Monatsabschluss, { sitz: sitzFuer(betrieb(), "planer"), ym: "2026-09", akt }));
    expect(offen).toContain("September 2026 ist offen");
    expect(offen).toContain("Monat abschließen");
  });
  it("laufender Monat: kein Abschluss möglich, nur der Hinweis", () => {
    const t = text(h(A.Monatsabschluss, { sitz: sitzFuer(betrieb(), "leitung"), ym: "2026-11", akt }));
    expect(t).toContain("nach dem Monatsende");
    expect(t).not.toContain("Monat abschließen");
  });
  it("Schichtverantwortung, Betriebsrat, Beschäftigte: nichts (kein Verlauf, keine Gründe)", () => {
    for (const rolle of ["subplaner", "betriebsrat", "mitarbeiter"]) {
      const roh = renderToStaticMarkup(h(A.Monatsabschluss, { sitz: sitzFuer(betrieb(), rolle), ym: "2026-10", akt }));
      expect(roh, rolle).not.toMatch(/Lohnlauf|Nachtrag|Wiederöffnen|abschließen/);
    }
  });
});

describe("Beschäftigte: abgeschlossener Monat in „Meine Stempel“", () => {
  it("der Stempel vom 30.10. zeigt „Monat abgeschlossen“ ohne „Korrektur beantragen“; der vom 09.11. bleibt beantragbar", () => {
    const t = text(h(A.KorrekturKarte, { sitz: sitzFuer(betrieb(), "mitarbeiter"), akt }));
    expect(t).toContain("Monat abgeschlossen");
    expect((t.match(/Korrektur beantragen/g) || []).length).toBe(2);              // Überschrift + der Stempel vom 09.11.
  });
});

describe("Stempeluhr: Pause beim Ausstempeln", () => {
  it("eingestempelt: ein Feld „Pause (min)“ neben „Ausstempeln“, vorbelegt mit der Pause der Dienstart", () => {
    const m = betrieb();
    const da = m.dienstarten[0];
    m.abweichungen["mitarbeiter|2026-11-10"] = da.id;
    m.einstempeln["mitarbeiter|2026-11-10"] = { start: "06:00", startAm: "2026-11-10T05:00:00.000Z" };
    const sitz = sitzFuer(m, "mitarbeiter");
    const roh = renderToStaticMarkup(h(A.Stempeluhr, { sitz, akt }));
    expect(roh).toContain("Ausstempeln");
    expect(roh).toMatch(/aria-label="Pause in Minuten"/);
    if (da.pause) expect(roh).toContain(`value="${da.pause}"`);
    const mobil = renderToStaticMarkup(h(A.MStempel, { sitz, akt }));
    expect(mobil).toMatch(/aria-label="Pause in Minuten"/);
  });
});
