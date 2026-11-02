/* ==========================================================================
   OBERFLÄCHE GERENDERT — F1 (Ist-Daten fehlen) und F2 (offener Stempel)

   Gefunden in der Browser-Abnahme von Kette B (2026-11-02):

   F1  Der Betriebsrat öffnete „Meine Schichten" und landete auf der
       Fehlerseite („Cannot read properties of null (reading
       'toLocaleString')"). Seine Ist-Daten fehlen bewusst (E1); die Kacheln
       formatierten null wie eine Zahl.
   F2  Ein offener Beginn an einem Tag ohne (noch) geplanten Dienst war für
       die Beschäftigte unsichtbar — „Heute frei", kein Ausstempeln.

   Geprüft wird nicht der Quelltext, sondern das, was React tatsächlich
   rendert: echte Komponenten aus src/App.jsx, Betrieb und Personen aus den
   Konstruktoren der Oberfläche (leererMandant, zugangsPerson), und die Daten
   so, wie der Server sie der jeweiligen Rolle ausliefert
   (bestandFuerRolle). Die Uhr steht fest, damit „heute" und die
   20-Stunden-Grenze nicht vom Testzeitpunkt abhängen.

   Aufruf: npm run pruefung:render
   ========================================================================== */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ISTDATEN_TEXT } from "../src/istdaten.js";
import { MARKIERUNG_TEXT } from "../src/stempelvorgang.js";
import { berlinZeitpunkt } from "../server/lib/zeiterfassung.mjs";
import { bestandFuerRolle, schreibumfang } from "../server/lib/rechte.mjs";
import { migriere } from "../src/migration.js";
import { personenAngleichen } from "../server/lib/gestalt.mjs";

const HEUTE = "2026-11-04", GESTERN = "2026-11-03", MONAT = "2026-11";
const uhr = (datum, zeit) => new Date(berlinZeitpunkt(datum, zeit));
let A;

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(uhr(HEUTE, "11:00"));
  A = await import("../src/App.jsx");
}, 120000);
afterAll(() => { vi.useRealTimers(); });

/** Ein Betrieb, wie die Oberfläche ihn anlegt, mit einer Person je Rolle. */
function betrieb() {
  const m = A.leererMandant("Render-Prüfung", "pflege");
  const e = m.einheiten[0].id;
  m.personen = ["leitung", "planer", "subplaner", "mitarbeiter", "betriebsrat"]
    .map((rolle, i) => ({ ...A.zugangsPerson(rolle, e, i + 1), id: rolle, vorname: "Test", nachname: rolle }));
  m.abweichungen = { [`mitarbeiter|${GESTERN}`]: "F", [`betriebsrat|${GESTERN}`]: "F" };
  m.erfassung = { [`mitarbeiter|${GESTERN}`]: { start: "06:00", ende: "14:30", bestaetigt: true, grund: "" },
    [`betriebsrat|${GESTERN}`]: { start: "06:00", ende: "14:30", bestaetigt: true, grund: "" } };
  m.einstempeln = {};
  return m;
}
/** Die Sicht der Rolle, so wie der Server sie ausliefert (GET /api/bestand:
    personenAngleichen, dann bestandFuerRolle) — nach derselben Migration,
    die die Oberfläche auf jeden geladenen Bestand anwendet (leererMandant
    legt Version 5 an). `angleichen: false` ist die Gegenprobe ohne den
    Schutz an der Datenmodellgrenze. */
function sitzFuer(m, rolle, { angleichen = true } = {}) {
  const mig = migriere({ version: 5, stand: 1, mandanten: [m] });
  if (!mig.ok) throw new Error(`Migration: ${mig.grund}`);
  const gelesen = angleichen ? personenAngleichen(mig.bestand) : mig.bestand;
  const ms = bestandFuerRolle(gelesen, { rolle, person: rolle, betrieb: 0 }).mandanten[0];
  const person = ms.personen.find((p) => p.id === rolle);
  return { rolle: "kunde", db: { mandanten: [ms], session: { mandantId: ms.id, personId: rolle, rolle } }, mandant: ms, person };
}
const akt = new Proxy({}, { get: () => () => {} });
const text = (el) => renderToStaticMarkup(el).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const meineSchichten = (m, rolle) => text(h(A.MeineSchichten, { sitz: sitzFuer(m, rolle), akt, ym: MONAT }));
const personalakte = (m, rolle) => text(h(A.Personalakte, { sitz: sitzFuer(m, rolle), personId: rolle, ym: MONAT, akt, onClose: () => {} }));
const mHeute = (m) => text(h(A.MHeute, { sitz: sitzFuer(m, "mitarbeiter"), akt, setTab: () => {}, oeffnen: () => {} }));
const prio = (m, rolle, opt) => text(h(A.Prioritaeten, { sitz: sitzFuer(m, rolle, opt), akt, gehZu: () => {}, oeffneTag: () => {} }));
const tagesstart = (m) => text(h(A.Tagesstart, { sitz: sitzFuer(m, "mitarbeiter"), akt, gehZu: () => {}, oeffneTag: () => {} }));

describe("F1 — „Meine Schichten\" ohne Ist-Daten", () => {
  it("Betriebsrat: rendert ohne Absturz; Ist-Werte „–\" mit Begründung, keine 0", () => {
    const m = betrieb();
    expect(sitzFuer(m, "betriebsrat").mandant.sichtIstDaten).toEqual({ umfang: "keine" });
    const t = meineSchichten(m, "betriebsrat");
    expect(t).toContain("Meine Schichten");
    expect(t).toMatch(/Stunden im Monat – h/);
    expect(t).toMatch(/Stundenkonto – h/);
    expect(t).toMatch(/Nachtstunden – h/);
    expect(t).toContain(ISTDATEN_TEXT);
    /* null darf nirgends zu einer Null werden. */
    expect(t).not.toMatch(/Stunden im Monat [+−]?0,0/);
    expect(t).not.toMatch(/Stundenkonto [+−]0,0/);
  });
  it("Betriebsrat: eigene Personalakte rendert ohne Absturz, ebenfalls „–\"", () => {
    const t = personalakte(betrieb(), "betriebsrat");
    expect(t).toMatch(/Konto kumuliert – h/);
    expect(t).toContain(ISTDATEN_TEXT);
  });
  it("Beschäftigte mit eigenen Ist-Daten: Zahlen, kein Hinweis auf fehlende Daten", () => {
    const m = betrieb();
    expect(sitzFuer(m, "mitarbeiter").mandant.sichtIstDaten).toEqual({ umfang: "eigene", person: "mitarbeiter" });
    const t = meineSchichten(m, "mitarbeiter");
    expect(t).toMatch(/Stunden im Monat \d+,\d h/);
    expect(t).toMatch(/Stundenkonto [+−]\d+,\d h/);
    expect(t).not.toContain(ISTDATEN_TEXT);
  });
  it("Planung und Leitung mit vollständigen Daten: unverändert Zahlen", () => {
    for (const rolle of ["planer", "leitung"]) {
      const m = betrieb();
      expect(sitzFuer(m, rolle).mandant).not.toHaveProperty("sichtIstDaten");
      const t = meineSchichten(m, rolle);
      expect(t, rolle).toMatch(/Stunden im Monat \d+,\d h/);
      expect(t, rolle).not.toContain(ISTDATEN_TEXT);
      expect(personalakte(m, rolle), rolle).toMatch(/Konto kumuliert [+−]\d+,\d h/);
    }
  });
});

describe("F2 — offener Stempel unabhängig vom Plan", () => {
  const mit = (eintraege, plan = {}) => { const m = betrieb(); m.einstempeln = eintraege; Object.assign(m.abweichungen, plan); return m; };
  const offenHeute = { [`mitarbeiter|${HEUTE}`]: { start: "06:02", startAm: uhr(HEUTE, "06:02").toISOString() } };

  it("Beginn heute, Dienst geplant: „Dein Dienst heute\" mit Ausstempeln, kein zweiter Start", () => {
    const m = mit(offenHeute, { [`mitarbeiter|${HEUTE}`]: "F" });
    for (const t of [mHeute(m), tagesstart(m)]) {
      expect(t).toContain("Dein Dienst heute");
      expect(t).toContain("Eingestempelt 06:02");
      expect(t).toContain("Ausstempeln");
      expect(t).not.toContain("Einstempeln");
    }
  });
  it("Beginn heute, Dienst danach gelöscht bzw. nie geplant: sichtbar und beendbar statt „Heute frei\"", () => {
    const m = mit(offenHeute);
    const mobil = mHeute(m);
    expect(mobil).toContain("Offener Dienst ohne Plan");
    expect(mobil).toContain("Eingestempelt 06:02");
    expect(mobil).toContain("Ausstempeln");
    expect(mobil).not.toContain("Heute frei");
    const desktop = tagesstart(m);
    expect(desktop).toContain("Offener Dienst ohne Plan");
    expect(desktop).toContain("Ausstempeln");
    expect(desktop).toContain("Im Dienst seit 06:02");
  });
  it("Nachtdienst vom Vortag innerhalb von 20 Stunden: Ausstempeln für gestern", () => {
    const m = mit({ [`mitarbeiter|${GESTERN}`]: { start: "22:01", startAm: uhr(GESTERN, "22:01").toISOString() } });
    for (const t of [mHeute(m), tagesstart(m)]) {
      expect(t).toContain("Offener Dienst von gestern");
      expect(t).toContain("Eingestempelt gestern 22:01");
      expect(t).toContain("Ausstempeln");
    }
  });
  it("Vortag über 20 Stunden: kein Ausstempeln für gestern, kein offener Vorgang heute", () => {
    const m = mit({ [`mitarbeiter|${GESTERN}`]: { start: "12:04", startAm: uhr(GESTERN, "12:04").toISOString() } });
    const t = mHeute(m);
    expect(t).not.toContain("Ausstempeln");
    expect(t).not.toContain("Eingestempelt gestern");
    expect(t).toContain("Heute frei");
  });
  it("Abgeschlossener Vorgang und Ende ohne Start: kein Ausstempeln, „Dienst erfasst\"", () => {
    for (const e of [{ start: "06:00", ende: "14:00" }, { ende: "09:13", markierungen: ["START_FEHLT"] }]) {
      const t = mHeute(mit({ [`mitarbeiter|${HEUTE}`]: e }, { [`mitarbeiter|${HEUTE}`]: "F" }));
      expect(t).toContain("Dienst erfasst");
      expect(t).not.toContain("Ausstempeln");
      expect(t).not.toContain("Einstempeln");
    }
  });
  it("Geplanter Dienst ohne Stempel: Planansicht unverändert mit Einstempeln", () => {
    const t = mHeute(mit({}, { [`mitarbeiter|${HEUTE}`]: "F" }));
    expect(t).toContain("Dein Dienst heute");
    expect(t).toContain("Einstempeln");
    expect(t).not.toContain("Offener Dienst");
  });
  it("Veralteter Beginn (über 20 Stunden, heute): kein normales Ausstempeln, Ende bleibt erfassbar", () => {
    vi.setSystemTime(uhr(HEUTE, "20:30"));
    try {
      const alt = { [`mitarbeiter|${HEUTE}`]: { start: "00:04", startAm: uhr(HEUTE, "00:04").toISOString() } };
      for (const plan of [{}, { [`mitarbeiter|${HEUTE}`]: "F" }]) {
        const m = mit(alt, plan);
        for (const t of [mHeute(m), tagesstart(m)]) {
          expect(t).toContain(MARKIERUNG_TEXT.START_VERALTET);
          expect(t).toContain("Ende trotzdem erfassen");
          expect(t).not.toMatch(/Ausstempeln/);
        }
      }
    } finally { vi.setSystemTime(uhr(HEUTE, "11:00")); }
  });
});

/* ==========================================================================
   P1 — Stempeln am Rechner: Prioritaeten ist die gerenderte Startseite
   (Tagesstart mit der Stempeluhr war nie eingebunden). Wer im Schichtdienst
   steht, stempelt — unabhängig von Rolle und Gerät; der Server nimmt nur
   die eigene Person der Sitzung an.
   ========================================================================== */
describe("P1 — Zeiterfassung am Rechner (Prioritaeten)", () => {
  const mit = (eintraege, plan = {}) => { const m = betrieb(); m.einstempeln = eintraege; Object.assign(m.abweichungen, plan); return m; };
  const ROLLEN_IM_DIENST = ["subplaner", "betriebsrat", "mitarbeiter"];

  it("Geplanter Dienst: Schichtverantwortung, Betriebsrat und Beschäftigte (Rechneransicht) sehen Dienst und Einstempeln", () => {
    for (const rolle of ROLLEN_IM_DIENST) {
      const t = prio(mit({}, { [`${rolle}|${HEUTE}`]: "F" }), rolle);
      expect(t, rolle).toContain("Mein Dienst heute");
      expect(t, rolle).toContain("Einstempeln");
      expect(t, rolle).not.toContain("Ausstempeln");
    }
  });
  it("Nicht im Schichtdienst (Leitung, Planung — Vorgabe der Oberfläche): keine Stempeluhr, auch mit Plan", () => {
    for (const rolle of ["leitung", "planer"]) {
      const t = prio(mit({}, { [`${rolle}|${HEUTE}`]: "F" }), rolle);
      expect(t, rolle).not.toContain("Einstempeln");
      expect(t, rolle).not.toContain("Mein Dienst heute");
    }
  });
  it("Offener Beginn mit Plan — auch beim Betriebsrat: Ausstempeln, kein zweites Einstempeln", () => {
    for (const rolle of ROLLEN_IM_DIENST) {
      const t = prio(mit({ [`${rolle}|${HEUTE}`]: { start: "06:02", startAm: uhr(HEUTE, "06:02").toISOString() } },
        { [`${rolle}|${HEUTE}`]: "F" }), rolle);
      expect(t, rolle).toContain("Eingestempelt 06:02");
      expect(t, rolle).toContain("Ausstempeln");
      expect(t, rolle).not.toContain("Einstempeln");
    }
  });
  it("Offener Beginn ohne Plan und Nachtdienst vom Vortag (≤ 20 h): sichtbar und beendbar", () => {
    for (const rolle of ROLLEN_IM_DIENST) {
      const ohne = prio(mit({ [`${rolle}|${HEUTE}`]: { start: "06:02", startAm: uhr(HEUTE, "06:02").toISOString() } }), rolle);
      expect(ohne, rolle).toContain("Offener Dienst ohne Plan");
      expect(ohne, rolle).toContain("Ausstempeln");
      const nacht = prio(mit({ [`${rolle}|${GESTERN}`]: { start: "22:01", startAm: uhr(GESTERN, "22:01").toISOString() } }), rolle);
      expect(nacht, rolle).toContain("Offener Dienst von gestern");
      expect(nacht, rolle).toContain("Eingestempelt gestern 22:01");
      expect(nacht, rolle).toContain("Ausstempeln");
    }
  });
  it("Veralteter Beginn (> 20 h): kein normales Ausstempeln, „Ende trotzdem erfassen\"; Vortag > 20 h erscheint nicht", () => {
    vi.setSystemTime(uhr(HEUTE, "20:30"));
    try {
      for (const rolle of ROLLEN_IM_DIENST) {
        const t = prio(mit({ [`${rolle}|${HEUTE}`]: { start: "00:04", startAm: uhr(HEUTE, "00:04").toISOString() } },
          { [`${rolle}|${HEUTE}`]: "F" }), rolle);
        expect(t, rolle).toContain(MARKIERUNG_TEXT.START_VERALTET);
        expect(t, rolle).toContain("Ende trotzdem erfassen");
        expect(t, rolle).not.toContain("Ausstempeln");
      }
    } finally { vi.setSystemTime(uhr(HEUTE, "11:00")); }
    const alt = prio(mit({ [`betriebsrat|${GESTERN}`]: { start: "12:04", startAm: uhr(GESTERN, "12:04").toISOString() } }), "betriebsrat");
    expect(alt).not.toContain("Ausstempeln");
    expect(alt).not.toContain("Eingestempelt gestern");
  });
  it("Datenschutz: Betriebsrat und Schichtverantwortung bekommen nur die eigenen Stempel, keine fremden Ist-Daten", () => {
    const m = mit({ [`betriebsrat|${HEUTE}`]: { start: "06:02" }, [`subplaner|${HEUTE}`]: { start: "06:11" },
      [`mitarbeiter|${HEUTE}`]: { start: "05:47", ortStart: "Am Standort" } }, { [`betriebsrat|${HEUTE}`]: "F", [`subplaner|${HEUTE}`]: "F" });
    const br = sitzFuer(m, "betriebsrat").mandant;
    expect(Object.keys(br.einstempeln)).toEqual([`betriebsrat|${HEUTE}`]);
    expect(br.erfassung).toEqual({});
    expect(br.sichtIstDaten).toEqual({ umfang: "keine" });
    expect(prio(m, "betriebsrat")).not.toContain("05:47");
    const sv = sitzFuer(m, "subplaner").mandant;
    expect(Object.keys(sv.einstempeln)).toEqual([`subplaner|${HEUTE}`]);
    expect(prio(m, "subplaner")).not.toContain("05:47");
    /* F1 bleibt: Der eigene Stempel macht beim Betriebsrat keine Ist-Stunden. */
    expect(meineSchichten(m, "betriebsrat")).toMatch(/Stunden im Monat – h/);
  });
});

/* ==========================================================================
   P1 — Personendaten: eine gespeicherte Person ohne (oder mit falsch
   getypter) qualifikationen ließ die Startseite jeder Rolle abstürzen.
   ========================================================================== */
describe("P1 — Altbestand ohne qualifikationen", () => {
  const kaputt = () => {
    const m = betrieb();
    m.abweichungen[`mitarbeiter|${HEUTE}`] = "F";
    for (const p of m.personen) {
      if (p.id === "mitarbeiter" || p.id === "leitung") delete p.qualifikationen;
      if (p.id === "planer") p.qualifikationen = "Pflegefachkraft";
    }
    return m;
  };
  it("Gegenprobe ohne Angleichen: die Startseite stürzt ab (der bisherige Fehler)", () => {
    expect(() => prio(kaputt(), "leitung", { angleichen: false })).toThrow();
    expect(() => mHeuteRoh(kaputt())).toThrow();
  });
  it("Mit dem Angleichen beim Lesen: Startseiten aller Rollen und die Beschäftigtenansicht rendern", () => {
    for (const rolle of ["leitung", "planer", "subplaner", "mitarbeiter", "betriebsrat"])
      expect(prio(kaputt(), rolle), rolle).toContain("Gute");
    expect(mHeute(kaputt())).toContain("Dein Dienst heute");
  });
});
const mHeuteRoh = (m) => text(h(A.MHeute, { sitz: sitzFuer(m, "mitarbeiter", { angleichen: false }), akt, setTab: () => {}, oeffnen: () => {} }));

/* ==========================================================================
   P1 — Urlaubshinweise nach der Anmeldung: Der Lauf ändert fremde Personen
   und legt Mitteilungen an. Nur mit vollem Schreibumfang (vom Server) —
   sonst wies der Server die Schichtverantwortung bei jeder Anmeldung mit
   403 „Keine Schreibberechtigung" ab.
   ========================================================================== */
describe("P1 — Urlaubshinweise nur mit vollem Schreibumfang", () => {
  it("je Rolle mit dem Schreibumfang, den der Server meldet: nur Leitung und Planung", () => {
    const erwartet = { leitung: true, planer: true, subplaner: false, mitarbeiter: false, betriebsrat: false };
    for (const [rolle, soll] of Object.entries(erwartet)) {
      const sitz = sitzFuer(betrieb(), rolle);
      expect(A.urlaubshinweiseAnlegen(sitz, { rolle, schreiben: schreibumfang(rolle) }), rolle).toBe(soll);
    }
  });
  it("ohne bekannten Schreibumfang oder als Betreiber: nie", () => {
    expect(A.urlaubshinweiseAnlegen(sitzFuer(betrieb(), "leitung"), null)).toBe(false);
    expect(A.urlaubshinweiseAnlegen(sitzFuer(betrieb(), "leitung"), { schreiben: "einheit" })).toBe(false);
    expect(A.urlaubshinweiseAnlegen({ rolle: "betreiber", db: {} }, { schreiben: "voll" })).toBe(false);
    expect(A.urlaubshinweiseAnlegen(null, { schreiben: "voll" })).toBe(false);
  });
  it("Schichtverantwortung hat das Recht req.approve.unit — gerade deshalb lief der Lauf bisher bei ihr", () => {
    expect(schreibumfang("subplaner")).toBe("einheit");
    expect(A.urlaubshinweiseAnlegen(sitzFuer(betrieb(), "subplaner"), { schreiben: "voll" })).toBe(true);
  });
});
