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

/* ==========================================================================
   A-4 (Abnahme V4; Betreiberentscheidung 2026-11-13) — Dienstart ohne mindest

   Der Server nahm eine Dienstart ohne `mindest` an; danach stürzte die
   Oberfläche ab („Cannot read properties of undefined (reading 'fr')",
   fachlogik.js simulation/einrichtungsstand, Dienstarten-Ansicht,
   mindestFuer). Neue Eingaben weist der Server jetzt ab (personendaten.
   test.js); ein schon gespeicherter Altstand muss trotzdem rendern, wird als
   „Mindestbesetzung fehlt" gekennzeichnet — nie still als 0 gezeigt — und
   die Oberfläche verändert ihn dabei nicht (byte-gleicher Rundweg).
   ========================================================================== */
describe("A-4 — Dienstart ohne mindest rendert ohne Absturz und ist gekennzeichnet", () => {
  let FL, IE, DA, Dienstarten, Lagebild, Schichtfolge;
  beforeAll(async () => {
    FL = await import("../src/lib/fachlogik.js");
    IE = await import("../server/lib/isteinfrieren.mjs");
    DA = await import("../src/ansichten/dienstarten.jsx");
    ({ Dienstarten } = DA);
    ({ Lagebild } = await import("../src/ansichten/lagebild.jsx"));
    ({ Schichtfolge } = await import("../src/ansichten/schichtfolge.jsx"));
  }, 120000);
  /** Betrieb mit einer Altdienstart: mindest fehlt, ist null oder unvollständig. */
  const altbetrieb = (wie = "fehlt") => {
    const m = betrieb();
    const d = m.dienstarten[0];
    if (wie === "fehlt") delete d.mindest; else if (wie === "null") d.mindest = null; else d.mindest = { mo_do: 2 };
    return m;
  };
  const ansichten = (sitz) => [
    ["Dienstarten", () => text(h(Dienstarten, { sitz, akt }))],
    ["Prioritaeten", () => text(h(A.Prioritaeten, { sitz, akt, gehZu: () => {}, oeffneTag: () => {} }))],
    ["Lagebild", () => text(h(Lagebild, { sitz, akt, oeffneTag: () => {} }))],
    ["Schichtfolge", () => text(h(Schichtfolge, { sitz, akt }))],
  ];

  it("Leitung und Planung: Dienstarten, Prioritäten, Lagebild, Schichtfolge rendern; Altdaten bleiben unverändert", () => {
    for (const wie of ["fehlt", "null", "teil"]) for (const rolle of ["leitung", "planer"]) {
      const sitz = sitzFuer(altbetrieb(wie), rolle);
      const vorher = JSON.stringify(sitz.mandant);
      for (const [name, rendern] of ansichten(sitz)) {
        let t = "";
        expect(() => { t = rendern(); }, `${wie}/${rolle}/${name}`).not.toThrow();
        expect(t.length, `${wie}/${rolle}/${name}`).toBeGreaterThan(0);
      }
      expect(JSON.stringify(sitz.mandant), `${wie}/${rolle}: Oberfläche verändert den Altstand nicht`).toBe(vorher);
    }
  });
  it("Dienstarten-Karte: fehlende Vorgabe als Befund „Mindestbesetzung fehlt\" (kein 0), unvollständige je Feld „fehlt\"", () => {
    const fehlt = renderToStaticMarkup(h(Dienstarten, { sitz: sitzFuer(altbetrieb("fehlt"), "leitung"), akt }));
    expect(fehlt).toContain('data-befund="mindest-fehlt"');
    expect(text(h(Dienstarten, { sitz: sitzFuer(altbetrieb("fehlt"), "leitung"), akt }))).toMatch(/Mindestbesetzung fehlt — bitte festlegen/);
    expect(text(h(Dienstarten, { sitz: sitzFuer(altbetrieb("fehlt"), "leitung"), akt }))).not.toMatch(/Mo–Do 0 Fr 0 Sa 0 So\/Feiertag 0 Mindestbesetzung fehlt/);
    expect(renderToStaticMarkup(h(Dienstarten, { sitz: sitzFuer(altbetrieb("null"), "leitung"), akt }))).toContain('data-befund="mindest-fehlt"');
    const teil = text(h(Dienstarten, { sitz: sitzFuer(altbetrieb("teil"), "leitung"), akt }));
    expect(teil).toMatch(/Mo–Do 2 Fr fehlt Sa fehlt So\/Feiertag fehlt Mindestbesetzung unvollständig/);
    /* Eine vollständige Dienstart zeigt ihre Werte ohne Befund. */
    const ganz = renderToStaticMarkup(h(Dienstarten, { sitz: sitzFuer(betrieb(), "leitung"), akt }));
    expect(ganz).not.toContain("data-befund=");
  });
  it("Dienstarten-Karte: jeder ungültig gespeicherte Wert (negativ, Kommazahl, über 999, Text, leer) steht als „ungültig\" da — nie als 0 oder still als Zahl; Daten unverändert", () => {
    const ungueltig = [-1, 2.5, 1000, "abc", "", "2.5", "-1", " ", true];
    for (const v of ungueltig) {
      const m = betrieb();
      m.dienstarten[0].mindest = { mo_do: 1, fr: v, sa: 1, so: 1 };
      const sitz = sitzFuer(m, "leitung");
      const vorher = JSON.stringify(sitz.mandant);
      const html = renderToStaticMarkup(h(Dienstarten, { sitz, akt }));
      const t = text(h(Dienstarten, { sitz, akt }));
      const was = JSON.stringify(v);
      expect(html, was).toContain('data-befund="mindest-ungueltig"');
      expect(t, was).toMatch(/Fr ungültig/);
      expect(t, was).toMatch(/Mindestbesetzung ungültig — bitte korrigieren/);
      expect(t, was).not.toMatch(/Fr 0\b/);
      expect(t, was).not.toMatch(/Fr -1|Fr 2\.5|Fr 1000/);
      expect(html, was).not.toContain('data-befund="mindest-unvollstaendig"');
      expect(JSON.stringify(sitz.mandant), `${was}: die Karte schreibt nichts zurück`).toBe(vorher);
      expect(FL.mindestUngueltig(m.dienstarten[0]), was).toEqual(["fr"]);
      expect(FL.mindestLuecken(m.dienstarten[0]), was).toEqual(["fr"]);
    }
    /* Fehlend und ungültig zugleich: beide Befunde, je Feld das Richtige. */
    const gemischt = betrieb();
    gemischt.dienstarten[0].mindest = { mo_do: -2, fr: 1 };
    const t = text(h(Dienstarten, { sitz: sitzFuer(gemischt, "leitung"), akt }));
    expect(t).toMatch(/Mo–Do ungültig Fr 1 Sa fehlt So\/Feiertag fehlt/);
    expect(t).toMatch(/Mindestbesetzung unvollständig/);
    expect(t).toMatch(/Mindestbesetzung ungültig/);
    /* Gültig bleibt unmarkiert: ganze Zahlen 0..999, auch der Altwert als Text. */
    for (const md of [{ mo_do: 0, fr: 0, sa: 0, so: 0 }, { mo_do: 999, fr: 1, sa: 2, so: 3 }, { mo_do: "2", fr: "3", sa: " 1 ", so: "0" }]) {
      const ok = betrieb(); ok.dienstarten[0].mindest = md;
      expect(renderToStaticMarkup(h(Dienstarten, { sitz: sitzFuer(ok, "leitung"), akt })), JSON.stringify(md)).not.toContain("data-befund=");
      expect(FL.mindestLuecken(ok.dienstarten[0]), JSON.stringify(md)).toEqual([]);
    }
  });
  it("Fachlogik: simulation, einrichtungsstand und mindestFuer werfen nicht; die Altdienstart ist als fehlend erkennbar", () => {
    const m = altbetrieb("fehlt");
    const vorher = JSON.stringify(m);
    expect(() => FL.simulation(m)).not.toThrow();
    expect(() => FL.einrichtungsstand(m)).not.toThrow();
    expect(IE.mindestFuer(m, m.dienstarten[0], HEUTE)).toBe(0);
    expect(FL.mindestVorhanden(m.dienstarten[0])).toBe(false);
    expect(FL.mindestLuecken(m.dienstarten[0])).toEqual(["mo_do", "fr", "sa", "so"]);
    expect(FL.mindestVorhanden(m.dienstarten[1])).toBe(true);
    expect(FL.mindestLuecken(m.dienstarten[1])).toEqual([]);
    expect(FL.mindestWerte(m.dienstarten[1])).toEqual(m.dienstarten[1].mindest);
    expect(JSON.stringify(m)).toBe(vorher);
  });
  it("Planungsreife meldet die Altdienstart ohne mindest als fehlenden Besetzungsbedarf (Befund, kein stilles 0)", async () => {
    const { planungsreife } = await import("../server/lib/engine/planungsreife.mjs");
    const m = altbetrieb("fehlt");
    const r = planungsreife(m, { von: "2026-12-01", bis: "2026-12-31" });
    const bedarf = r.luecken.find((l) => l.punkt === "bedarf");
    expect(bedarf && bedarf.text).toMatch(/fehlt der Besetzungsbedarf/);
    expect(bedarf.ids).toContain(String(m.dienstarten[0].id));
  });
});

describe("A-4 — Zahl als Text im gespeicherten mindest bleibt, was sie war", () => {
  const textMindest = { mo_do: "2", fr: "3", sa: " 1 ", so: "0" };
  const zahlMindest = { mo_do: 2, fr: 3, sa: 1, so: 0 };
  it("mindestWerte liest \"2\" wie 2; ungültig oder fehlend bleibt 0 und steht in mindestLuecken", async () => {
    const IE = await import("../server/lib/isteinfrieren.mjs");
    expect(IE.mindestWerte({ mindest: textMindest })).toEqual(zahlMindest);
    expect(IE.mindestLuecken({ mindest: textMindest })).toEqual([]);
    expect(IE.mindestWerte({ mindest: zahlMindest })).toEqual(zahlMindest);
    const kaputt = { mindest: { mo_do: "viele", fr: "", sa: null, so: NaN } };
    expect(IE.mindestWerte(kaputt)).toEqual({ mo_do: 0, fr: 0, sa: 0, so: 0 });
    expect(IE.mindestLuecken(kaputt)).toEqual(["mo_do", "fr", "sa", "so"]);
  });
  it("Einfrieren, Prüfung und Fachprüfung: Text und Zahl liefern dasselbe wie auf integration/release-v4", async () => {
    const IE = await import("../server/lib/isteinfrieren.mjs");
    const FP = await import("../server/lib/fachpruefung.mjs");
    const FL = await import("../src/lib/fachlogik.js");
    /* Die bisherige Rechnung (release-v4, isteinfrieren.mjs mindestFuer) wörtlich als Vergleich. */
    const { dow } = await import("../server/lib/regelwerk.mjs");
    const { feiertag } = await import("../server/lib/feiertage.mjs");
    const bisher = (m, da, d) => { const w = dow(d);
      const wt = w === 6 ? da.mindest.so : w === 5 ? da.mindest.sa : w === 4 ? da.mindest.fr : da.mindest.mo_do;
      return Math.max(wt, feiertag(d, m.bundesland) ? da.mindest.so : 0); };
    for (const d of ["2026-11-09", "2026-11-13", "2026-11-14", "2026-11-15"]) {
      const m = betrieb();
      const a = { ...m.dienstarten[0], mindest: textMindest }, b = { ...m.dienstarten[0], mindest: zahlMindest };
      expect(IE.mindestFuer(m, a, d), d).toBe(IE.mindestFuer(m, b, d));
      expect(IE.mindestFuer(m, a, d), d).toBe(bisher(m, a, d));
      expect(FP.mindestOhneFeiertag(a, d)).toBe(FP.mindestOhneFeiertag(b, d));
    }
    /* Feiertag (3. Oktober, Mo–Do-Wert 2, So-Wert "4"): der Feiertag hebt auf 4 an — wie bisher. */
    const m = betrieb();
    expect(IE.mindestFuer(m, { mindest: { ...textMindest, so: "4" } }, "2024-10-03")).toBe(4);
    expect(IE.mindestFuer(betrieb(), { mindest: textMindest }, "2026-11-09")).toBe(2);
    const mt = betrieb(), mz = betrieb();
    mt.dienstarten[0].mindest = textMindest; mz.dienstarten[0].mindest = zahlMindest;
    expect(JSON.stringify(FL.simulation(mt).luecken.map((x) => x.tage))).toBe(JSON.stringify(FL.simulation(mz).luecken.map((x) => x.tage)));
    expect(FL.einrichtungsstand(mt)).toEqual(FL.einrichtungsstand(mz));
  });
  it("Rundweg: Altstand mit Text wird weder angeglichen noch abgewiesen (byte-gleich)", async () => {
    const G = await import("../server/lib/gestalt.mjs");
    const m = betrieb(); m.dienstarten[0].mindest = textMindest;
    const bestand = { mandanten: [m] };
    const vorher = JSON.stringify(bestand);
    const neu = JSON.parse(vorher);
    expect(G.dienstartenFehler(neu, JSON.parse(vorher))).toBeNull();
    G.dienstartenAngleichen(neu, JSON.parse(vorher));
    expect(JSON.stringify(neu)).toBe(vorher);
  });
});

/* ==========================================================================
   A-4 Nachtrag (ABN-A4, 2026-11-19) — Besetzungsanzeige ohne festgelegten Bedarf

   Betreiberentscheidung 2026-11-13/14 (#280 Q3/Q4): historisch fehlende
   Mindestbesetzung wird gekennzeichnet, nie still 0. Die Planansichten
   zeigten für eine Altdienstart ohne `mindest` aber „0/0" (scheinbar
   gedeckt), bei unvollständigem oder unlesbarem `mindest` „NaN". Jetzt:
   „–" mit dem Text „Bedarf nicht festgelegt". soll, diff und status bleiben
   unverändert (ob ein fehlender Bedarf die Ampel ändern soll, ist eine
   offene Betreiberfrage, ENTSCHEIDUNGSLISTE P2-17); gültige Dienstarten
   rendern wie bisher.
   ========================================================================== */
describe("A-4 Nachtrag — Besetzungsanzeige: fehlender Bedarf heißt „Bedarf nicht festgelegt\", nie 0/0 oder NaN", () => {
  let FL; const V = {};
  beforeAll(async () => {
    FL = await import("../src/lib/fachlogik.js");
    ({ Monatsplan: V.Monatsplan } = await import("../src/ansichten/monatsplan.jsx"));
    ({ Tagesdetail: V.Tagesdetail } = await import("../src/ansichten/tagesdetail.jsx"));
    ({ Lagebild: V.Lagebild } = await import("../src/ansichten/lagebild.jsx"));
    ({ Zeitachse: V.Zeitachse } = await import("../src/ansichten/zeitachse.jsx"));
    ({ Schnellbesetzung: V.Schnellbesetzung } = await import("../src/ansichten/schnellbesetzung.jsx"));
    ({ Ersatzliste: V.Ersatzliste } = await import("../src/ansichten/ersatzliste.jsx"));
    ({ Eskalation: V.Eskalation } = await import("../src/ansichten/eskalation.jsx"));
  }, 120000);
  const FREITAG = "2026-11-06";   // in der Woche von HEUTE; ein Teil-mindest { mo_do } hat freitags keinen Wert
  const OFFEN = "Bedarf nicht festgelegt";
  const mit = (wie) => {
    const m = betrieb(); const d = m.dienstarten[0];
    if (wie === "fehlt") delete d.mindest;
    else if (wie === "null") d.mindest = null;
    else if (wie === "teil") d.mindest = { mo_do: 2 };
    else if (wie === "unlesbar") d.mindest = { mo_do: "abc", fr: "abc", sa: "abc", so: "abc" };
    return m;
  };
  const ansichten = (sitz) => {
    const daId = sitz.mandant.dienstarten[0].id, zu = () => {};
    return [
      ["Monatsplan", () => renderToStaticMarkup(h(V.Monatsplan, { sitz, ym: MONAT, setYm: zu, oeffneTag: zu, akt }))],
      ["Wochenliste", () => renderToStaticMarkup(h(V.Monatsplan, { sitz, ym: MONAT, setYm: zu, oeffneTag: zu, akt, schmal: true }))],
      ["Tagesdetail", () => renderToStaticMarkup(h(V.Tagesdetail, { sitz, datum: FREITAG, onClose: zu, akt }))],
      ["Zeitachse", () => renderToStaticMarkup(h(V.Zeitachse, { sitz, oeffneTag: zu, akt }))],
      ["Schnellbesetzung", () => renderToStaticMarkup(h(V.Schnellbesetzung, { sitz, datum: FREITAG, dienstId: daId, akt, onClose: zu }))],
      ["Ersatzliste", () => renderToStaticMarkup(h(V.Ersatzliste, { sitz, datum: FREITAG, dienstId: daId, akt, onFertig: zu }))],
      ["Eskalation", () => renderToStaticMarkup(h(V.Eskalation, { sitz, datum: FREITAG, dienstId: daId, akt, onClose: zu }))],
      ["Lagebild", () => renderToStaticMarkup(h(V.Lagebild, { sitz, akt, oeffneTag: zu }))],
    ];
  };

  it("fehlend, null, unvollständig, unlesbar: kein Absturz, kein NaN/undefined, „Bedarf nicht festgelegt\" statt Zahl", () => {
    for (const wie of ["fehlt", "null", "teil", "unlesbar"]) {
      const sitz = sitzFuer(mit(wie), "leitung");
      const vorher = JSON.stringify(sitz.mandant);
      for (const [name, rendern] of ansichten(sitz)) {
        /* Lagebild zeigt nur heute (Mittwoch): ein Teil-mindest mit mo_do ist dort festgelegt. */
        if (wie === "teil" && name === "Lagebild") continue;
        let html = "";
        expect(() => { html = rendern(); }, `${wie}/${name}`).not.toThrow();
        expect(html, `${wie}/${name}`).not.toMatch(/NaN|undefined/);
        expect(html, `${wie}/${name}`).toContain(OFFEN);
      }
      expect(JSON.stringify(sitz.mandant), `${wie}: Oberfläche verändert den Altstand nicht`).toBe(vorher);
    }
  });
  it("Gegenprobe gültige Dienstarten: keine Kennzeichnung, kein NaN/undefined", () => {
    const sitz = sitzFuer(betrieb(), "leitung");
    for (const [name, rendern] of ansichten(sitz)) {
      const html = rendern();
      expect(html, name).not.toContain(OFFEN);
      expect(html, name).not.toMatch(/NaN|undefined/);
    }
  });
  it("Gegenprobe: ausdrücklich 0 an allen Tagen und ein Posten ohne mindest sind festgelegt — keine Kennzeichnung", () => {
    const m = betrieb();
    m.dienstarten[0].mindest = { mo_do: 0, fr: 0, sa: 0, so: 0 };
    const posten = { ...JSON.parse(JSON.stringify(m.dienstarten[1])), id: "PO", kurz: "PO", name: "Posten ohne Bedarf", posten: true };
    delete posten.mindest;
    m.dienstarten.push(posten);
    const sitz = sitzFuer(m, "leitung");
    for (const [name, rendern] of ansichten(sitz)) {
      const html = rendern();
      expect(html, name).not.toContain(OFFEN);
      expect(html, name).not.toMatch(/NaN|undefined/);
    }
    for (const d of [HEUTE, FREITAG, "2026-11-07", "2026-11-08", "2026-12-25"]) {
      const b = FL.besetzung(sitz.mandant, d);
      expect(b[sitz.mandant.dienstarten[0].id], d).not.toHaveProperty("bedarfOffen");
      expect(b.PO, d).not.toHaveProperty("bedarfOffen");
      expect(b[sitz.mandant.dienstarten[0].id].soll, d).toBe(0);
    }
  });
  it("Tageswert null, leer, false, Liste oder negativ (auch So-Wert am Feiertag): gekennzeichnet; soll wie bisher", async () => {
    const IE_ = await import("../server/lib/isteinfrieren.mjs");
    {
      const SA = "2026-11-07", WEIHNACHTEN = "2026-12-25", FR_NORMAL = "2026-12-18";
      for (const sa of [null, "", false, [3], -1]) {
        const m = betrieb(); const id = m.dienstarten[0].id;
        m.dienstarten[0].mindest = { mo_do: 2, fr: 2, sa, so: 1 };
        const b = FL.besetzung(m, SA)[id];
        expect(b.bedarfOffen, JSON.stringify(sa)).toBe(true);
        expect(b.soll, JSON.stringify(sa)).toBe(IE_.mindestFuer(m, m.dienstarten[0], SA));
        expect(FL.besetzung(m, FREITAG)[id], JSON.stringify(sa)).not.toHaveProperty("bedarfOffen");
      }
      const m = betrieb(); const id = m.dienstarten[0].id;
      m.dienstarten[0].mindest = { mo_do: 2, fr: 2, sa: 2, so: null };
      expect(FL.besetzung(m, WEIHNACHTEN)[id].bedarfOffen).toBe(true);
      expect(FL.besetzung(m, WEIHNACHTEN)[id].soll).toBe(2);
      expect(FL.besetzung(m, FR_NORMAL)[id]).not.toHaveProperty("bedarfOffen");
      /* Altwert als Text bleibt festgelegt. */
      const t = betrieb(); t.dienstarten[0].mindest = { mo_do: "2", fr: "2", sa: "0", so: "1" };
      for (const d of [HEUTE, SA, "2026-11-08", WEIHNACHTEN]) expect(FL.besetzung(t, d)[t.dienstarten[0].id], d).not.toHaveProperty("bedarfOffen");
      const html = renderToStaticMarkup(h(V.Tagesdetail, { sitz: sitzFuer((() => { const x = betrieb();
        x.dienstarten[0].mindest = { mo_do: 2, fr: 2, sa: null, so: null }; return x; })(), "leitung"), datum: SA, onClose: () => {}, akt }));
      expect(html).toContain(OFFEN);
    }
  });
  it("besetzung und tagesband: bedarfOffen nur ohne festgelegten Bedarf; soll, diff und status wie bisher", () => {
    const m = mit("fehlt"), id = m.dienstarten[0].id;
    const b = FL.besetzung(m, FREITAG)[id];
    expect(b.bedarfOffen).toBe(true);
    expect([b.soll, b.diff, b.status]).toEqual([0, b.anzahl, "ok"]);
    expect(FL.tagesband(m, FREITAG).find((s) => s.da.id === id).bedarfOffen).toBe(true);
    const t = mit("teil"), tid = t.dienstarten[0].id;
    expect(FL.besetzung(t, FREITAG)[tid].bedarfOffen).toBe(true);
    expect(FL.besetzung(t, HEUTE)[tid]).not.toHaveProperty("bedarfOffen");
    expect(FL.besetzung(t, HEUTE)[tid].soll).toBe(2);
    /* Gültige Dienstarten: das Feld fehlt ganz — das Ergebnis hat dieselben Schlüssel wie bisher. */
    const g = betrieb();
    for (const d of Array.from({ length: 30 }, (_, i) => `${MONAT}-${String(i + 1).padStart(2, "0")}`)) {
      for (const e of Object.values(FL.besetzung(g, d))) expect(e, d).not.toHaveProperty("bedarfOffen");
      for (const s of FL.tagesband(g, d)) expect(s, d).not.toHaveProperty("bedarfOffen");
    }
  });
  it("Anzeigehelfer: „–\" und Text nur bei bedarfOffen, sonst die Zahl wie bisher", () => {
    expect(FL.sollAnzeige({ soll: 3 })).toBe(3);
    expect(FL.sollAnzeige({ soll: 0 })).toBe(0);
    expect(FL.sollAnzeige({ soll: 0, bedarfOffen: true })).toBe("–");
    expect(FL.sollAnzeige({ soll: NaN, bedarfOffen: true })).toBe("–");
    expect(FL.besetztText({ anzahl: 2, soll: 3 })).toBe("2 von 3");
    expect(FL.besetztText({ anzahl: 2, soll: 0, bedarfOffen: true })).toBe(`2 eingeteilt, ${OFFEN}`);
    expect(FL.BEDARF_OFFEN_TEXT).toBe(OFFEN);
  });
});

describe("A-4 — Eingabe der Mindestbesetzung (Dialog)", () => {
  let DA;
  beforeAll(async () => { DA = await import("../src/ansichten/dienstarten.jsx"); }, 120000);
  const felder = (props) => renderToStaticMarkup(h(DA.MindestFelder, { onChange: () => {}, ...props }));
  it("Felder: ganze Zahlen (inputMode numeric, Schritt 1, min 0), Pflicht, zugänglicher Name, 24px", () => {
    const html = felder({ werte: { mo_do: "", fr: "", sa: "", so: "" }, neu: true, ohneMindest: false, versucht: false });
    const inputs = html.match(/<input[^>]*>/g) || [];
    expect(inputs).toHaveLength(4);
    for (const i of inputs) {
      expect(i).toContain('type="number"'); expect(i).toContain('inputMode="numeric"');
      expect(i).toContain('step="1"'); expect(i).toContain('min="0"'); expect(i).toContain('max="999"');
      expect(i).toContain("required"); expect(i).toContain('aria-required="true"');
      expect(i).toMatch(/min-height:\s*24px/);
      const id = (i.match(/id="([^"]+)"/) || [])[1];
      expect(id, i).toBeTruthy();
      expect(html).toContain(`for="${id}"`);
    }
    for (const l of ["Mo – Do", "Freitag", "Samstag", "So / Feiertag"]) expect(html).toContain(l);
    /* Leer und noch nicht gespeichert: kein Fehler vorab. */
    expect(html).not.toContain('role="alert"');
    expect(html).not.toMatch(/\bKI\b/);
  });
  it("Fehlertext neben dem Feld: Komma, negativ, Text sofort; leeres Pflichtfeld beim Speichern", () => {
    const html = felder({ werte: { mo_do: "2.5", fr: "-1", sa: "abc", so: "" }, neu: true, ohneMindest: false, versucht: false });
    expect((html.match(/role="alert"/g) || []).length).toBe(3);
    expect(html).toContain("Bitte eine ganze Zahl von 0 bis 999 eingeben — ohne Komma, nicht negativ.");
    expect(html).toMatch(/aria-invalid="true"[^>]*aria-describedby="mindest-mo_do-fehler"|aria-describedby="mindest-mo_do-fehler"[^>]*aria-invalid="true"/);
    const nach = felder({ werte: { mo_do: "1", fr: "1", sa: "1", so: "" }, neu: true, ohneMindest: false, versucht: true });
    expect(nach).toContain("Pflichtfeld: bitte eine ganze Zahl ab 0 eingeben (0 = keine Mindestbesetzung).");
  });
  it("Altstand ohne mindest: Hinweis „Mindestbesetzung fehlt\", Felder leer, ganz leer bleibt erlaubt (dann bleibt sie offen)", () => {
    const html = felder({ werte: DA.mindestFuerDialog({ id: "F" }), neu: false, ohneMindest: true, versucht: true });
    expect(html).toContain('data-befund="mindest-fehlt"');
    expect(html).not.toContain('role="alert"');
    expect(html).not.toMatch(/value="0"/);
  });
  it("Speichern: neu ohne Werte → Fehler (nichts gespeichert); 0 → {0,0,0,0}; Altstand leer → weglassen; Text \"2\" öffnet als 2", () => {
    const leer = { mo_do: "", fr: "", sa: "", so: "" };
    expect(DA.mindestZumSpeichern(leer, { neu: true, ohneMindest: false }).fehler).toBeTruthy();
    expect(Object.keys(DA.mindestZumSpeichern(leer, { neu: true, ohneMindest: false }).fehler)).toEqual(["mo_do", "fr", "sa", "so"]);
    expect(DA.mindestZumSpeichern({ mo_do: "0", fr: 0, sa: " 0 ", so: "0" }, { neu: true, ohneMindest: false })).toEqual({ mindest: { mo_do: 0, fr: 0, sa: 0, so: 0 } });
    for (const v of ["2.5", "-1", "abc", "1e2", "1000", null])
      expect(DA.mindestZumSpeichern({ mo_do: v, fr: 1, sa: 1, so: 1 }, { neu: true, ohneMindest: false }).fehler, String(v)).toHaveProperty("mo_do");
    expect(DA.mindestZumSpeichern(leer, { neu: false, ohneMindest: true })).toEqual({ weglassen: true });
    expect(DA.mindestZumSpeichern({ ...leer, fr: "1" }, { neu: false, ohneMindest: true }).fehler).toBeTruthy();
    expect(DA.mindestZumSpeichern(leer, { neu: false, ohneMindest: false }).fehler).toBeTruthy();
    expect(DA.mindestFuerDialog({ mindest: { mo_do: "2", fr: 3, sa: "x", so: 2.5 } })).toEqual({ mo_do: 2, fr: 3, sa: "x", so: 2.5 });
    expect(DA.mindestFuerDialog({ mindest: { mo_do: 1 } })).toEqual({ mo_do: 1, fr: "", sa: "", so: "" });
  });
});
