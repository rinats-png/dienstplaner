/* ==========================================================================
   Auflage A aus dem Datenreview PR #130 — Stempel von Personen ohne Eintritt
   gehen nicht still verloren

   Szenario: Eine Person ohne Eintrittsdatum (null/leer) stempelt. Der Stempel
   wird gespeichert (UNGEPLANTER_DIENST), zählt aber nicht ins Ist, weil die
   Person an keinem Tag im Dienst ist. Bisher: kein Prüffall im Abschluss, keine
   Zeile und kein Hinweis in der Lohnausgabe — Stunden fehlten ohne Warnung.
   Entscheidung 2026-11-09: Stempeln bleibt erlaubt; Monatsabschluss und
   Lohnausgabe melden einen PRUEFFALL „Eintrittsdatum fehlt – Stunden nicht
   abgerechnet" mit der Anzahl der Stempel; der Abschluss geht nicht still durch.
   Aufruf: npx vitest run pruefungen/person-eintritt-stempel.test.js --testTimeout=60000
   ========================================================================== */
import { describe, it, expect } from "vitest";
import * as IE from "../server/lib/isteinfrieren.mjs";
import { abschliessen, istAbdruck } from "../server/lib/monatsabschluss.mjs";
import { demobestand, lohnPruefZeilen, lohnWarnung, lohnausgabeText, datevSaetze, ohneEintrittZeilen } from "../src/lib/fachlogik.js";

const WER_L = { personId: "l1", name: "V L1", rolle: "leitung" };
const JETZT = new Date("2026-11-05T09:00:00.000Z");
const MON = "2026-10";
const st = (s, e) => ({ start: s, startAm: "x", ende: e, endeAm: "y", markierungen: ["UNGEPLANTER_DIENST"] });
const kopie = (x) => JSON.parse(JSON.stringify(x));
/* Wie monatsabschluss-lib.test.js: a1 (Altbestand ohne Feld) mit vollständigem, bestätigtem Ist;
   dazu p0 ohne Eintritt mit zwei vollständigen Stempeln (einer bestätigt) und einem im Vormonat. */
const basis = (eintritt = null) => ({ id: "m1", personen: [{ id: "a1" }, { id: "p0", vorname: "Ida", nachname: "Ohne", eintritt }],
  dienstarten: [], abweichungen: {},
  einstempeln: { "a1|2026-10-28": st("06:00", "14:00"), "p0|2026-10-05": st("06:00", "14:00"), "p0|2026-10-06": st("06:00", "14:00"),
    "p0|2026-09-30": st("06:00", "14:00") },
  erfassung: { "a1|2026-10-28": { start: "06:00", ende: "14:00", bestaetigt: true },
    "p0|2026-10-05": { start: "06:00", ende: "14:00", bestaetigt: true }, "p0|2026-10-06": { start: "06:00", ende: "14:00", bestaetigt: true } } });
const schliessen = (m, r = {}) => abschliessen(m, { monat: MON, ...r }, WER_L, JETZT, "ma-1", "2026-11-05");

describe("Auflage A (1): Stempel ohne Eintritt -> Prüffall im Monatsabschluss", () => {
  it("A-1a ohneEintrittPrueffaelle nennt Person und Anzahl der Stempel des Monats", () => {
    expect(typeof IE.ohneEintrittPrueffaelle).toBe("function");
    for (const e of [null, ""]) {
      const f = IE.ohneEintrittPrueffaelle(basis(e), MON);
      expect(f).toHaveLength(1);
      expect(f[0].person.id).toBe("p0");
      expect(f[0].anzahl).toBe(2);                                      // nur Oktober, nicht der 30.09.
    }
    expect(IE.OHNE_EINTRITT_TEXT).toBe("Eintrittsdatum fehlt – Stunden nicht abgerechnet");
  });
  it("A-1b abschliessen: 409 ABSCHLUSS_PRUEFFAELLE mit Anzahl, nichts geschlossen", () => {
    const r = schliessen(basis());
    expect(r).toMatchObject({ status: 409, code: "ABSCHLUSS_PRUEFFAELLE" });
    expect(r.offen.ohneEintritt).toBe(2);
    expect(r.grund).toMatch(/Eintrittsdatum fehlt – Stunden nicht abgerechnet/);
    expect(r.grund).toMatch(/2 Stempel/);
  });
  it("A-1c nur ausdrücklich (trotzPrueffaellen): Abschluss vermerkt den Prüffall im Verlauf", () => {
    const r = schliessen(basis(), { trotzPrueffaellen: true });
    expect("status" in r).toBe(false);
    expect(r.ereignis.offen).toMatchObject({ ohneEintritt: 2 });
    /* Der Stempel ist nicht verloren: er bleibt gespeichert. */
    expect(r.mandant.einstempeln["p0|2026-10-05"]).toBeTruthy();
    /* Auch nach dem Abschluss bleibt der Prüffall sichtbar. */
    expect(IE.ohneEintrittPrueffaelle(r.mandant, MON)[0].anzahl).toBe(2);
  });
});

describe("Auflage A (2): Lohnausgabe — Hinweis statt stiller Auslassung", () => {
  const m0 = demobestand().mandanten[0];
  const vorlage = m0.personen.find((q) => q.imSchichtdienst !== false && !q.springer && q.status !== "gesperrt");
  const ym = "2025-10";
  const mit = (eintritt) => {
    const p = { ...vorlage, id: "p-ohne", vorname: "Ida", nachname: "Ohne", personalnummer: "P-OHNE", austritt: null, status: "aktiv", eintritt,
      zugehoerigkeit: [{ ab: null, einheitId: vorlage.zugehoerigkeit[0].einheitId }] };
    return { ...m0, personen: [...m0.personen, p],
      einstempeln: { ...(m0.einstempeln || {}), [`p-ohne|${ym}-07`]: st("06:00", "14:00"), [`p-ohne|${ym}-08`]: st("06:00", "14:00") } };
  };
  it("A-2a lohnPruefZeilen und Lohnausgabe-Text nennen den Prüffall mit Name und Anzahl", () => {
    const m = mit(null);
    const z = lohnPruefZeilen(m, ym).join("\n");
    expect(z).toMatch(/Eintrittsdatum fehlt – Stunden nicht abgerechnet/);
    expect(z).toMatch(/Ohne, Ida/);
    expect(z).toMatch(/2 Stempel/);
    expect(lohnausgabeText(m, ym)).toMatch(/Eintrittsdatum fehlt – Stunden nicht abgerechnet/);
  });
  it("A-2b Rückfrage vor dem Export nennt den Prüffall (nicht still)", () => {
    const w = lohnWarnung(mit(null), ym, null);
    expect(w).toBeTruthy();
    expect(w).toMatch(/Eintrittsdatum fehlt/);
  });
  it("A-2d ohneEintrittZeilen: offener Monat „rechnen mit“; abgeschlossen Wiederöffnen, nach Lohnexport Korrekturprozess", () => {
    expect(ohneEintrittZeilen(mit(null), ym)[0]).toMatch(/rechnen die Stunden mit/);
    const zu = (extra) => ({ ...mit(null), monatsabschluss: { [ym]: { abgeschlossen: true, am: "2025-11-03T08:00:00.000Z", ...extra } } });
    const a = ohneEintrittZeilen(zu({}), ym).join("\n");
    expect(a).toMatch(/Eintrittsdatum fehlt – Stunden nicht abgerechnet/);
    expect(a).toMatch(/Ohne, Ida: 2 Stempel/);
    expect(a).not.toMatch(/rechnen die Stunden mit/);
    expect(a).toMatch(/Wiederöffnen und erneuten Abschluss/);
    const b = ohneEintrittZeilen(zu({ lohnexport: { am: "2025-11-04T08:00:00.000Z" } }), ym).join("\n");
    expect(b).not.toMatch(/rechnen die Stunden mit/);
    expect(b).toMatch(/Korrekturprozess/);
  });
  it("A-2c keine erfundenen Stunden: die Person hat keine Lohnartensätze", () => {
    expect(datevSaetze(mit(null), ym).some((x) => x.personalnummer === "P-OHNE")).toBe(false);
  });

  it("A-3 Kontrolle: mit gesetztem Eintritt keine Änderung (kein Prüffall, gleiche Warnung, gleiche Zeilen)", () => {
    const ohneStempel = { ...m0 };
    const m = mit("2020-01-01");
    expect(IE.ohneEintrittPrueffaelle(m, ym)).toEqual([]);
    expect(lohnPruefZeilen(m, ym).join("\n")).not.toMatch(/Eintrittsdatum fehlt/);
    expect(lohnWarnung(m, ym, null)).toBe(lohnWarnung(ohneStempel, ym, null));
  });
});

describe("Auflage A (3): mit gesetztem Eintritt keine Änderung im Abschluss", () => {
  it("A-3a gesetzter Eintritt bzw. Altbestand ohne Feld: kein Prüffall, Abschluss wie bisher", () => {
    const m = basis("2020-01-01");
    expect(IE.ohneEintrittPrueffaelle(m, MON)).toEqual([]);
    const ohneP0 = { ...m, personen: [{ id: "a1" }] };
    for (const x of [ohneP0, (() => { const b = basis(); delete b.personen[1].eintritt; return b; })()]) {
      expect(IE.ohneEintrittPrueffaelle(x, MON)).toEqual([]);
      const r = schliessen(x);
      expect("status" in r, r.grund).toBe(false);
      expect(r.ereignis.offen).toBeUndefined();
    }
  });
});

describe("Auflage A (4): bereits eingefrorene Monate bleiben stabil", () => {
  it("A-4a ein abgeschlossener Monat bleibt abgeschlossen, Prüfsumme und Freeze unverändert", () => {
    const zu = schliessen(basis(), { trotzPrueffaellen: true }).mandant;
    const vorher = kopie(zu);
    expect(istAbdruck(zu, MON)).toBe(zu.monatsabschluss[MON].abdruck);
    /* Der Prüffall ist ein Hinweis, er ändert den Freeze nicht. */
    IE.ohneEintrittPrueffaelle(zu, MON);
    expect(zu).toEqual(vorher);
    expect(schliessen(zu)).toMatchObject({ status: 409 });                 // schon abgeschlossen
    expect(Object.keys(zu[IE.IST_EINGEFROREN]).some((k) => k.startsWith("p0|"))).toBe(false);
  });
  it("A-4b Freeze der übrigen Personen gleich wie ohne die Person ohne Eintritt", () => {
    const a = schliessen(basis(), { trotzPrueffaellen: true }).mandant;
    const b0 = basis(); b0.personen = [b0.personen[0]];
    for (const k of Object.keys(b0.einstempeln)) if (k.startsWith("p0|")) delete b0.einstempeln[k];
    for (const k of Object.keys(b0.erfassung)) if (k.startsWith("p0|")) delete b0.erfassung[k];
    const b = schliessen(b0).mandant;
    const nur = (w) => Object.fromEntries(Object.entries(w[IE.IST_EINGEFROREN]).filter(([k]) => k.startsWith("a1|")));
    expect(nur(a)).toEqual(nur(b));
  });
});
