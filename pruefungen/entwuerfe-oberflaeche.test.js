/* ==========================================================================
   ENTWÜRFE IN DER OBERFLÄCHE (WP-23, Review Punkt 5 und 3)

   Der Server lässt die Einteilungen eines nicht freigegebenen Monats für
   Beschäftigte weg. Die Oberfläche rechnet aber bei fehlender Abweichung den
   Dienst aus der Schichtfolge (personTag). Ohne Gegenmaßnahme sähe eine
   Beschäftigte im Entwurfsmonat einen vermeintlichen Regeldienst.

   Geprüft wird, was React tatsächlich rendert (echte Komponenten aus
   src/App.jsx, Daten so, wie der Server sie der Rolle ausliefert), mit fester
   Uhr: heute ist 2026-11-04, der Entwurfsmonat ist der laufende (zukünftige
   Tage), freigegeben ist der Folgemonat.
   ========================================================================== */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { berlinZeitpunkt } from "../server/lib/zeiterfassung.mjs";
import { bestandFuerRolle } from "../server/lib/rechte.mjs";
import { migriere } from "../src/migration.js";
import { personenAngleichen } from "../server/lib/gestalt.mjs";

const HEUTE = "2026-11-04", MORGEN = "2026-11-05", SPAET = "2026-11-20", MONAT = "2026-11", FOLGE = "2026-12";
let A;

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(berlinZeitpunkt(HEUTE, "11:00")));
  A = await import("../src/App.jsx");
}, 120000);
afterAll(() => { vi.useRealTimers(); });

/** Betrieb wie die Oberfläche ihn anlegt; `pflicht`/`freigaben` steuern, ob der Filter wirkt. */
function betrieb({ pflicht, freigaben = {} } = {}) {
  const m = A.leererMandant("Entwurf-Prüfung", "pflege");
  const e = m.einheiten[0].id;
  m.personen = ["leitung", "planer", "mitarbeiter"]
    .map((rolle, i) => ({ ...A.zugangsPerson(rolle, e, i + 1), id: rolle, vorname: "Test", nachname: rolle }));
  m.abweichungen = { [`mitarbeiter|${HEUTE}`]: "F", [`mitarbeiter|${MORGEN}`]: "F", [`mitarbeiter|${SPAET}`]: "F" };
  m.freigaben = freigaben;
  if (pflicht === undefined) delete m.einstellungen.planFreigabePflicht; else m.einstellungen.planFreigabePflicht = pflicht;
  return m;
}
function sitzFuer(m, rolle) {
  const mig = migriere({ version: 5, stand: 1, mandanten: [m] });
  if (!mig.ok) throw new Error(`Migration: ${mig.grund}`);
  const ms = bestandFuerRolle(personenAngleichen(mig.bestand), { rolle, person: rolle, betrieb: 0 }).mandanten[0];
  const person = ms.personen.find((p) => p.id === rolle);
  return { rolle: "kunde", db: { mandanten: [ms], session: { mandantId: ms.id, personId: rolle, rolle } }, mandant: ms, person };
}
const text = (el) => renderToStaticMarkup(el).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const aktAufnahme = () => { const log = []; return { log, akt: new Proxy({}, { get: (_, n) => (...a) => { log.push([n, a]); } }) }; };
const meine = (m, rolle) => text(h(A.MeineSchichten, { sitz: sitzFuer(m, rolle), akt: aktAufnahme().akt, ym: MONAT }));
const NOCH_NICHT = "noch nicht veröffentlicht";

describe("personTag: kein vermeintlicher Regeldienst im Entwurf", () => {
  it("Beschäftigte, Filter wirkt: Entwurfstag liefert quelle „entwurf“, keinen Dienst und keinen Planwert", () => {
    const s = sitzFuer(betrieb({ pflicht: true }), "mitarbeiter");
    expect(s.mandant.sichtEntwuerfe).toEqual({ heute: HEUTE });
    for (const d of [MORGEN, SPAET, "2026-11-30"]) {
      const t = A.personTag(s.mandant, s.person, d);
      expect(t, d).toMatchObject({ quelle: "entwurf", dienstId: null, plan: null, abweichung: null });
    }
  });
  it("heute und frühere Tage zählen nie als Entwurf", () => {
    const s = sitzFuer(betrieb({ pflicht: true }), "mitarbeiter");
    expect(A.personTag(s.mandant, s.person, HEUTE).quelle).not.toBe("entwurf");
    expect(A.personTag(s.mandant, s.person, "2026-11-03").quelle).not.toBe("entwurf");
  });
  it("freigegebener Folgemonat: dort wie bisher (kein Entwurf)", () => {
    const s = sitzFuer(betrieb({ pflicht: true, freigaben: { [FOLGE]: { stand: 1, zeit: "x", durch: "L" } } }), "mitarbeiter");
    expect(A.personTag(s.mandant, s.person, "2026-12-10").quelle).not.toBe("entwurf");
    expect(A.personTag(s.mandant, s.person, SPAET).quelle).toBe("entwurf");
  });
  it("Filter wirkt nicht (kein Pflicht, keine Freigabe): alles wie bisher", () => {
    const s = sitzFuer(betrieb(), "mitarbeiter");
    expect(s.mandant.sichtEntwuerfe).toBeUndefined();
    expect(A.personTag(s.mandant, s.person, MORGEN)).toMatchObject({ quelle: "abweichung", dienstId: "F" });
  });
  it("Planung sieht den Entwurf weiter (kein Hinweisfeld, Abweichung da)", () => {
    const s = sitzFuer(betrieb({ pflicht: true }), "planer");
    expect(s.mandant.sichtEntwuerfe).toBeUndefined();
    const ma = s.mandant.personen.find((p) => p.id === "mitarbeiter");
    expect(A.personTag(s.mandant, ma, MORGEN)).toMatchObject({ quelle: "abweichung", dienstId: "F" });
  });
});

describe("Meine Schichten", () => {
  it("Beschäftigte im Entwurf: „noch nicht veröffentlicht“ statt Dienst oder „frei“", () => {
    const t = meine(betrieb({ pflicht: true }), "mitarbeiter");
    expect(t).toContain(NOCH_NICHT);
  });
  it("ohne Filter: kein solcher Hinweis, der Dienst steht dort", () => {
    const t = meine(betrieb(), "mitarbeiter");
    expect(t).not.toContain(NOCH_NICHT);
  });
  it("Planung: nie „noch nicht veröffentlicht“", () => {
    expect(meine(betrieb({ pflicht: true }), "planer")).not.toContain(NOCH_NICHT);
  });
});

describe("Heute: morgen noch Entwurf", () => {
  it("sagt „Der Plan für morgen ist noch nicht veröffentlicht“, nennt keinen Dienst", () => {
    const m = betrieb({ pflicht: true });
    m.abweichungen[`mitarbeiter|${HEUTE}`] = "-";
    const t = text(h(A.MHeute, { sitz: sitzFuer(m, "mitarbeiter"), akt: aktAufnahme().akt, setTab: () => {}, oeffnen: () => {} }));
    expect(t).toContain("Der Plan für morgen ist noch nicht veröffentlicht.");
    expect(t).not.toContain("Nächster Dienst morgen");
    expect(t).not.toContain("Auch morgen kein Dienst");
  });
});

describe("Hinweis für die Leitung: Planfreigabe aktivieren", () => {
  const hat = (sitz) => A.tagesaufgaben(sitz).some((a) => a.titel === "Planfreigabe aktivieren");
  it("Filter aus: Leitung bekommt die dringende Aufgabe", () => {
    const aufg = A.tagesaufgaben(sitzFuer(betrieb(), "leitung")).find((a) => a.titel === "Planfreigabe aktivieren");
    expect(aufg).toBeTruthy();
    expect(aufg.dringend).toBe(true);
    expect(aufg.text).toContain("Entwürfe");
  });
  it("Pflicht ausdrücklich aus und keine Freigabe: ebenfalls", () => {
    expect(hat(sitzFuer(betrieb({ pflicht: false }), "leitung"))).toBe(true);
  });
  it("Pflicht an: keine Aufgabe", () => {
    expect(hat(sitzFuer(betrieb({ pflicht: true }), "leitung"))).toBe(false);
  });
  it("schon eine Freigabe: keine Aufgabe (der Filter wirkt)", () => {
    expect(hat(sitzFuer(betrieb({ freigaben: { [FOLGE]: { stand: 1, zeit: "x", durch: "L" } } }), "leitung"))).toBe(false);
  });
  it("Planung ohne org.edit und Beschäftigte bekommen die Aufgabe nicht", () => {
    expect(hat(sitzFuer(betrieb(), "planer"))).toBe(false);
    expect(hat(sitzFuer(betrieb(), "mitarbeiter"))).toBe(false);
  });
});

describe("Schalter in der Betriebsverwaltung", () => {
  const schalter = (m, rolle, akt) => text(h(A.PlanFreigabeSchalter, { sitz: sitzFuer(m, rolle), akt }));
  it("Filter aus: sagt es und bietet „Planfreigabe aktivieren“", () => {
    const t = schalter(betrieb(), "leitung", aktAufnahme().akt);
    expect(t).toContain("Beschäftigte sehen Entwürfe");
    expect(t).toContain("Planfreigabe aktivieren");
  });
  it("Pflicht an: „Entwürfe verborgen“ und „Planfreigabe ausschalten“", () => {
    const t = schalter(betrieb({ pflicht: true }), "leitung", aktAufnahme().akt);
    expect(t).toContain("Entwürfe verborgen");
    expect(t).toContain("Planfreigabe ausschalten");
  });
  it("Pflicht aus, aber Freigabe vorhanden: Hinweis, dass der Filter trotzdem wirkt", () => {
    const t = schalter(betrieb({ pflicht: false, freigaben: { [FOLGE]: { stand: 1, zeit: "x", durch: "L" } } }), "leitung", aktAufnahme().akt);
    expect(t).toContain("Entwürfe verborgen");
    expect(t).toContain("wirkt aber, weil schon ein Monat freigegeben wurde");
  });
  it("Klick ruft die Aktion mit dem umgekehrten Wert (echte Verdrahtung)", () => {
    const { log, akt } = aktAufnahme();
    const knoepfe = [];
    const such = (n) => { if (!n || typeof n !== "object") return; if (Array.isArray(n)) return n.forEach(such);
      if (n.props && typeof n.props.onClick === "function") knoepfe.push(n);
      if (n.props) such(n.props.children); };
    // Die Funktionskomponente direkt aufrufen, um den Elementbaum zu bekommen.
    such(A.PlanFreigabeSchalter({ sitz: sitzFuer(betrieb(), "leitung"), akt }));
    expect(knoepfe.length).toBeGreaterThan(0);
    knoepfe[knoepfe.length - 1].props.onClick();
    expect(log).toEqual([["setzePlanFreigabePflicht", [true]]]);
  });
});
