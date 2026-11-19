/* ==========================================================================
   KORREKTURWORKFLOW: OBERFLÄCHE (WP-14)

   Gerendert werden die echten Komponenten aus src/App.jsx mit Daten, wie der
   Server sie der Rolle liefert (bestandFuerRolle):
   - KorrekturKarte: die eigenen Stempel, „Korrektur beantragen“, offener
     Antrag mit „Antrag zurückziehen“, abgelehnter mit Begründung,
   - KorrekturAntraege: offene Anträge mit Original, bisheriger Ist-Zeit und
     Vorschlag; „Genehmigen“/„Ablehnen“ nur für Leitung und Planung,
   - KorrekturOffene: START_FEHLT, START_VERALTET, KONFLIKT, fehlendes Ende
     (B3) und der Altbestand ungeplanter Dienste (C5),
   - die Meldung nach einer Korrektur mit den Regelhinweisen (C3, C4).
   ========================================================================== */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { bestandFuerRolle } from "../server/lib/rechte.mjs";
import { migriere } from "../src/migration.js";
import { personenAngleichen } from "../server/lib/gestalt.mjs";
import { berlinZeitpunkt } from "../server/lib/zeiterfassung.mjs";

const HEUTE = "2026-11-10", MONAT = "2026-11", T1 = "2026-11-09", T2 = "2026-11-06", T3 = "2026-11-05", T4 = "2026-11-03";
let A;
beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(berlinZeitpunkt(HEUTE, "11:00")));
  A = await import("../src/App.jsx");
}, 120000);
afterAll(() => { vi.useRealTimers(); });

const akt = new Proxy({}, { get: () => () => {} });
const text = (el) => renderToStaticMarkup(el).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const antrag = (extra = {}) => ({ id: "ka-1", von: { personId: "mitarbeiter", name: "Test mitarbeiter", rolle: "mitarbeiter" }, gestellt: "2026-11-09T18:00:00.000Z",
  vorschlag: { start: "05:55", ende: "14:30", pause: 30 }, grund: "Übergabe dauerte länger", original: { start: "06:02", ende: "14:01" },
  ist: { start: "06:02", ende: "14:01", bestaetigt: true }, status: "offen", entschieden: null, ...extra });

function betrieb() {
  const m = A.leererMandant("Korrektur", "pflege");
  const e = m.einheiten[0].id;
  const da = m.dienstarten[0].id;
  m.personen = ["leitung", "planer", "subplaner", "mitarbeiter", "betriebsrat"].map((rolle, i) => ({ ...A.zugangsPerson(rolle, e, i + 1),
    id: rolle, vorname: "Test", nachname: rolle, eintritt: "2020-01-01", zugehoerigkeit: [{ ab: "2020-01-01", einheitId: e }] }));
  m.abweichungen = { [`mitarbeiter|${T1}`]: da, [`subplaner|${T1}`]: da, [`mitarbeiter|${T2}`]: da, [`mitarbeiter|${T3}`]: da };
  const st = (s, en, extra = {}) => ({ start: s, startAm: `${T1}T05:00:00.000Z`, ende: en, endeAm: `${T1}T13:00:00.000Z`, ...extra });
  m.einstempeln = {
    [`mitarbeiter|${T1}`]: st("06:02", "14:01", { antraege: [antrag()] }),
    [`subplaner|${T1}`]: st("06:00", "14:00", { antraege: [antrag({ id: "ka-sv", von: { personId: "subplaner" }, grund: "Antrag der Schichtverantwortung" })] }),
    [`mitarbeiter|${T2}`]: { ende: "14:00", endeAm: `${T2}T13:00:00.000Z`, markierungen: ["START_FEHLT"] },
    [`mitarbeiter|${T3}`]: st("06:00", "14:00", { antraege: [antrag({ id: "ka-ab", status: "abgelehnt", grund: "War doch pünktlich",
      entschieden: { durch: { personId: "leitung" }, wann: "2026-11-06T08:00:00Z", begruendung: "Die Übergabe steht im Dienstbuch anders." } })] }),
    [`betriebsrat|${T4}`]: st("06:00", "14:00", { markierungen: ["UNGEPLANTER_DIENST"] }),
  };
  m.erfassung = { [`mitarbeiter|${T1}`]: { start: "06:02", ende: "14:01", bestaetigt: true, grund: "" },
    [`betriebsrat|${T4}`]: { start: "06:00", ende: "14:00", bestaetigt: true, grund: "" } };
  m.abweichungen[`betriebsrat|${T4}`] = "-";
  return m;
}
function sitzFuer(m, rolle) {
  const mig = migriere({ version: 5, stand: 1, mandanten: [m] });
  if (!mig.ok) throw new Error(`Migration: ${mig.grund}`);
  const ms = bestandFuerRolle(personenAngleichen(mig.bestand), { rolle, person: rolle, betrieb: 0 }).mandanten[0];
  return { rolle: "kunde", db: { mandanten: [ms], session: { mandantId: ms.id, personId: rolle, rolle } }, mandant: ms,
    person: ms.personen.find((x) => x.id === rolle) };
}

describe("Beschäftigte: KorrekturKarte", () => {
  it("die eigenen Stempel mit Original; offener Antrag mit Vorschlag und „Antrag zurückziehen“; abgelehnter mit Begründung; START_FEHLT als Fall", () => {
    const t = text(h(A.KorrekturKarte, { sitz: sitzFuer(betrieb(), "mitarbeiter"), akt }));
    expect(t).toContain("Korrektur beantragen");
    expect(t).toContain("Stempel 06:02–14:01");
    expect(t).toContain("gilt 06:02–14:01");
    expect(t).toContain("Antrag offen");
    expect(t).toContain("Antrag zurückziehen");
    expect(t).toContain("Beantragt: 05:55–14:30 · Pause 30 min — Übergabe dauerte länger");
    expect(t).toContain("Abgelehnt: Die Übergabe steht im Dienstbuch anders.");
    expect(t).toContain("Stempel –");                                    // START_FEHLT: kein Beginn
    expect(t).toContain("Dein Stempel bleibt, wie er ist");
  });
  it("kein Stempel in den letzten 14 Tagen oder keine Person: nichts", () => {
    const m = betrieb();
    m.einstempeln = { [`mitarbeiter|2026-10-01`]: { start: "06:00", ende: "14:00" } };
    expect(text(h(A.KorrekturKarte, { sitz: sitzFuer(m, "mitarbeiter"), akt }))).toBe("");
  });
  it("Datenschutz: Schichtverantwortung und Betriebsrat sehen nur den eigenen Stempel — keine fremden Anträge", () => {
    const sv = text(h(A.KorrekturKarte, { sitz: sitzFuer(betrieb(), "subplaner"), akt }));
    expect(sv).toContain("Beantragt: 05:55–14:30");                      // der eigene Antrag
    expect(sv).toContain("Antrag der Schichtverantwortung");
    expect(sv).not.toContain("Übergabe dauerte länger");
    const br = text(h(A.KorrekturKarte, { sitz: sitzFuer(betrieb(), "betriebsrat"), akt }));
    expect(br).not.toContain("Übergabe dauerte länger");
    expect(br).toContain("ohne geplanten Dienst");
  });
});

describe("Leitung und Planung: Anträge, offene Fälle, Altbestand", () => {
  it("KorrekturAntraege: Original, bisherige Ist-Zeit und Vorschlag; „Genehmigen“ und „Ablehnen“ für Leitung und Planung", () => {
    for (const rolle of ["leitung", "planer"]) {
      const t = text(h(A.KorrekturAntraege, { sitz: sitzFuer(betrieb(), rolle), akt }));
      expect(t, rolle).toContain("2 Korrekturanträge");
      expect(t).toContain("Original 06:02–14:01");
      expect(t).toContain("gilt bisher 06:02–14:01");
      expect(t).toContain("beantragt 05:55–14:30 · Pause 30 min");
      expect(t).toContain("Grund: Übergabe dauerte länger");
      expect((t.match(/Genehmigen/g) || []).length).toBe(2);
      expect((t.match(/Ablehnen/g) || []).length).toBe(2);
      expect(t).not.toContain("War doch pünktlich");                     // der abgelehnte steht nicht mehr in der Liste
    }
  });
  it("KorrekturAntraege: die Schichtverantwortung entscheidet nicht (und sieht fremde Stempel nicht)", () => {
    const t = text(h(A.KorrekturAntraege, { sitz: sitzFuer(betrieb(), "subplaner"), akt }));
    expect(t).not.toContain("Genehmigen");
    expect(t).not.toContain("Übergabe dauerte länger");
  });
  it("KorrekturOffene (B3): START_FEHLT mit „Korrigieren“; Altbestand (C5) mit „Prüfen und bestätigen“; nur der gewählte Monat", () => {
    const t = text(h(A.KorrekturOffene, { sitz: sitzFuer(betrieb(), "leitung"), ym: MONAT, akt }));
    expect(t).toContain("1 Stempel braucht eine Korrektur");
    expect(t).toContain("Korrigieren");
    expect(t).toContain("Stempel ––14:00");
    expect(t).toContain("1 ungeplanter Dienst ohne Prüfung (Altbestand)");
    expect(t).toContain("früher ohne Prüfung bestätigt — zählt nicht");
    expect(t).toContain("Prüfen und bestätigen");
    expect(text(h(A.KorrekturOffene, { sitz: sitzFuer(betrieb(), "leitung"), ym: "2026-10", akt }))).toBe("");
    const sv = text(h(A.KorrekturOffene, { sitz: sitzFuer(betrieb(), "subplaner"), ym: MONAT, akt }));
    expect(sv).not.toContain("Korrigieren");                              // ohne Recht keine Knöpfe
  });
  it("ein bereits korrigierter offener Fall und ein geprüfter Altbestand verschwinden aus der Liste", () => {
    const m = betrieb();
    m.erfassung[`mitarbeiter|${T2}`] = { start: "06:00", ende: "14:00", bestaetigt: true, korrigiert: true, grund: "Korrektur der Stempelzeit" };
    m.erfassung[`betriebsrat|${T4}`] = { start: "06:00", ende: "14:00", bestaetigt: true, korrigiert: true, ungeplant: true, grund: "Korrektur der Stempelzeit" };
    expect(text(h(A.KorrekturOffene, { sitz: sitzFuer(m, "leitung"), ym: MONAT, akt }))).toBe("");
  });
  it("WP-14b (M3): ein früher korrigierter Tag ohne Plan ohne Marke (zählte nie) steht wieder im Altbestand", () => {
    const m = betrieb();
    m.erfassung[`betriebsrat|${T4}`] = { start: "06:00", ende: "14:00", bestaetigt: true, korrigiert: true, pause: 30, grund: "Korrektur der Stempelzeit" };
    const t = text(h(A.KorrekturOffene, { sitz: sitzFuer(m, "leitung"), ym: MONAT, akt }));
    expect(t).toContain("1 ungeplanter Dienst ohne Prüfung (Altbestand)");
    expect(t).toContain("Prüfen und bestätigen");
  });
  it("ZeitFormular: Beginn, Ende, Pause, Grund; der Knopf erst mit Uhrzeiten und Grund (≥ 10 Zeichen)", () => {
    const markup = renderToStaticMarkup(h(A.ZeitFormular, { start: "06:00", ende: "14:00", pause: 30, knopf: "Antrag stellen", onSenden() {} }));
    expect(markup).toContain('aria-label="Beginn"');
    expect(markup).toContain('aria-label="Pause in Minuten"');
    expect(markup).toContain('aria-label="Grund"');
    expect(markup).toMatch(/<button[^>]*disabled[^>]*>Antrag stellen/);
  });
});

describe("Meldung nach der Korrektur (C3, C4)", () => {
  it("Regelhinweise stehen in der Meldung; sonst der Standardsatz; Hinweis zu vielen Korrekturen geht vor", () => {
    expect(A.korrekturMeldung({})).toBe("Korrektur gespeichert — der Stempel bleibt unverändert.");
    const m = A.korrekturMeldung({ hinweise: [{ code: "PAUSE", text: "Keine Pause erfasst, nötig sind 30 min." }, { code: "RUHEZEIT", text: "Nur 8 h Ruhezeit." }] });
    expect(m).toBe("Korrektur gespeichert — der Stempel bleibt unverändert. Hinweise: Keine Pause erfasst, nötig sind 30 min. Nur 8 h Ruhezeit.");
    expect(A.korrekturMeldung({ hinweis: "Dieser Stempel wurde jetzt 20-mal korrigiert." })).toBe("Dieser Stempel wurde jetzt 20-mal korrigiert.");
  });
});
