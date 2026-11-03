/* ==========================================================================
   MODUL GETEILTERDIENST — Geteilte Dienste (WP-19, Strang B)

   Nach der Entscheidungsmatrix (Empfehlungen, vorläufig bis zur
   Nutzerentscheidung): T1 a — Ruhezeit ab Ende des zweiten Abschnitts, die
   Lücke ist keine Ruhezeit; T2 b — Höchstspanne trägt der Betrieb ein
   (Vorgabe: keine Grenze); T3 a — Kommen/Gehen je Abschnitt. Das Modul
   bleibt „geplant"; ein inaktives Modul erzeugt keine Befunde.
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  istGeteilt, pruefeGeteiltenDienst, geteilteZeiten, geteiltesFenster, istJeAbschnitt, geteilterdienstBefunde,
  geteilterdienstZusammen,
} from "../server/lib/modul-geteilterdienst.mjs";
import { BRANCHENMODULE, modulVon, pruefeModulRegistry } from "../server/lib/branchenmodule.mjs";
import { REGELN_BRANCHEN, pruefeBranchenkatalog } from "../server/lib/branchenkatalog.mjs";
import { pruefeRegister } from "../src/regelregister.js";
import { pruefeRegel } from "../server/lib/regelbaukasten.mjs";
import { branchenbestand, schreibeAls } from "./hilfen/branchenbetrieb.mjs";
import { AbschnittsAnzeige } from "../src/module/geteilterdienst.jsx";

const MO = "2026-11-02", DI = "2026-11-03";
/* 06:00–10:00 und 15:00–19:00: vier Stunden Lücke, acht Stunden Arbeit, dreizehn Stunden Spanne. */
const GET = { id: "G", name: "Geteilt", start: "06:00", ende: "10:00", zweiterAbschnitt: { start: "15:00", ende: "19:00" } };
const FRUEH = { id: "F", name: "Früh", start: "06:00", ende: "14:00" };
const SPAET = { id: "S", name: "Spät", start: "14:00", ende: "22:00" };

const AKTIV = BRANCHENMODULE.map((x) => (x.id === "geteilterdienst" ? { ...x, status: "vorlaeufig" } : x));
const betrieb = ({ an = true, pakete = ["klinik"], hoechstSpanne } = {}) => {
  const parameter = hoechstSpanne === undefined ? undefined : { hoechstSpanneStunden: hoechstSpanne };
  const m = branchenbestand({ pakete, branchenmodule: an ? { geteilterdienst: parameter ? { an: true, parameter } : { an: true } } : {} }).mandanten[0];
  return { ...m, dienstarten: [GET, FRUEH, SPAET] };
};
const opts = (extra = {}) => ({ auswerten: pruefeRegel, module: AKTIV, ...extra });

describe("Registry und Katalog", () => {
  it("Modul registriert, Klinik, „geplant“, mit zwei vorläufigen Regeln", () => {
    expect(modulVon("geteilterdienst")).toMatchObject({ pakete: ["klinik"], status: "geplant",
      regelIds: ["GETEILT-RUHE-01", "GETEILT-SPANNE-01"] });
    expect(modulVon("geteilterdienst").parameter.hoechstSpanneStunden).toMatchObject({ typ: "zahl", standard: 0, vorlaeufig: true });
    for (const id of ["GETEILT-RUHE-01", "GETEILT-SPANNE-01"])
      expect(REGELN_BRANCHEN.find((r) => r.id === id)).toMatchObject({ modul: "geteilterdienst", pruefstatus: "provisional",
        hoechsteStufe: "hinweis", regelstand: null });
    expect(pruefeModulRegistry()).toEqual([]);
    expect(pruefeBranchenkatalog()).toEqual([]);
    expect(pruefeRegister()).toEqual([]);
  });
});

describe("Form eines geteilten Dienstes", () => {
  it("erkennt geteilte Dienste und lässt die übrigen in Ruhe", () => {
    expect(istGeteilt(GET)).toBe(true);
    expect(istGeteilt(FRUEH)).toBe(false);
    expect(istGeteilt({ ...FRUEH, zweiterAbschnitt: null })).toBe(false);
    expect(pruefeGeteiltenDienst(FRUEH)).toBeNull();
    expect(pruefeGeteiltenDienst(GET)).toBeNull();
  });
  it("weist Überschneidung, fehlende Lücke, falsche Uhrzeit und über 24 Stunden Spanne ab", () => {
    const mit = (zw) => ({ ...GET, zweiterAbschnitt: zw });
    for (const kaputt of [mit({ start: "09:00", ende: "12:00" }), mit({ start: "10:00", ende: "12:00" }), mit({ start: "25:00", ende: "26:00" }),
      mit({ start: "15:00" }), mit("15:00-19:00"), mit({ start: "15:00", ende: "19:00", extra: 1 }), mit({ start: "11:00", ende: "07:30" }),
      mit({ start: "15:00", ende: "15:00" })])
      expect(pruefeGeteiltenDienst(kaputt), JSON.stringify(kaputt.zweiterAbschnitt)).toBeTruthy();
  });
  it("Nachtabschnitt über Mitternacht ist zulässig", () => {
    expect(pruefeGeteiltenDienst({ ...GET, start: "08:00", ende: "12:00", zweiterAbschnitt: { start: "20:00", ende: "02:00" } })).toBeNull();
  });
});

describe("Zeiten (Bearbeitung und Dauer)", () => {
  it("Arbeitszeit ohne Lücke, Lücke, Spanne, Fenster", () => {
    expect(geteilteZeiten(GET)).toEqual({ arbeitH: 8, lueckeH: 5, spanneH: 13,
      abschnitte: [{ von: 360, bis: 600 }, { von: 900, bis: 1140 }] });
    expect(geteiltesFenster(GET)).toEqual({ von: 360, bis: 1140 });
  });
  it("über Mitternacht: zweiter Abschnitt liegt auf dem Folgetag", () => {
    const n = { ...GET, start: "08:00", ende: "12:00", zweiterAbschnitt: { start: "20:00", ende: "02:00" } };
    expect(geteilteZeiten(n)).toMatchObject({ arbeitH: 10, lueckeH: 8, spanneH: 18 });
    expect(geteiltesFenster(n)).toEqual({ von: 480, bis: 1560 });
  });
});

describe("Stempeln je Abschnitt (T3 a)", () => {
  it("Ist je Abschnitt aus zwei Kommen/Gehen-Paaren; Zeit in der Lücke zählt nicht als Arbeit", () => {
    const r = istJeAbschnitt(GET, [{ start: "06:05", ende: "10:00" }, { start: "15:00", ende: "19:10" }]);
    expect(r.abschnitte.map((a) => a.istH)).toEqual([3.92, 4.17]);
    expect(r.ausserhalb).toBe(false);
    expect(r.fehlt).toEqual([]);
  });
  it("ein einziges durchgehendes Paar über die Lücke: gemeldet, die Lücke wird abgezogen", () => {
    const r = istJeAbschnitt(GET, [{ start: "06:00", ende: "19:00" }]);
    expect(r.durchgehend).toBe(true);
    expect(r.abschnitte.map((a) => a.istH)).toEqual([4, 4]);
  });
  it("fehlender Abschnitt wird genannt, Stempel außerhalb beider Abschnitte werden markiert", () => {
    expect(istJeAbschnitt(GET, [{ start: "06:00", ende: "10:00" }]).fehlt).toEqual([1]);
    expect(istJeAbschnitt(GET, [{ start: "11:00", ende: "12:00" }]).ausserhalb).toBe(true);
    expect(istJeAbschnitt(GET, []).fehlt).toEqual([0, 1]);
    expect(istJeAbschnitt(FRUEH, [{ start: "06:00", ende: "14:00" }])).toBeNull();
  });
});

describe("Befunde (Hinweis, sperrt nie; inaktiv: keine)", () => {
  const dienstAmMit = (id) => (_p, t) => (t === DI ? id : null);
  it("Ruhezeit ab Ende des zweiten Abschnitts: Spät am Vortag … zu kurz nach 19:00? — Früh am Folgetag nach dem Geteilten", () => {
    /* Geteilt Montag endet 19:00, Früh Dienstag beginnt 06:00: 11 h, genau erreicht → kein Befund. */
    expect(geteilterdienstBefunde(betrieb(), GET, MO, { ...opts(), person: {}, dienstAm: dienstAmMit("F") })).toEqual([]);
    /* Späte Variante: zweiter Abschnitt bis 21:00 → 9 h bis 06:00. */
    const spaet = { ...GET, zweiterAbschnitt: { start: "15:00", ende: "21:00" } };
    const m = { ...betrieb(), dienstarten: [spaet, FRUEH, SPAET] };
    const b = geteilterdienstBefunde(m, spaet, MO, { ...opts(), person: {}, dienstAm: dienstAmMit("F") });
    expect(b).toHaveLength(1);
    expect(b[0]).toMatchObject({ regel: "branche", regelId: "GETEILT-RUHE-01", modul: "geteilterdienst", stufe: "hinweis" });
  });
  it("auch der Dienst davor zählt: Spät am Vortag, dann Geteilt mit Beginn 06:00 → 8 Stunden", () => {
    const dienstAm = (_p, t) => (t === "2026-11-01" ? "S" : null);
    const b = geteilterdienstBefunde(betrieb(), GET, MO, { ...opts(), person: {}, dienstAm });
    expect(b).toHaveLength(1);
    expect(b[0].regelId).toBe("GETEILT-RUHE-01");
  });
  it("die Lücke ist keine Ruhezeit: der Bestandswert (nur erster Abschnitt) würde 20 h nennen, hier zählt das Ende des zweiten", () => {
    const spaet = { ...GET, zweiterAbschnitt: { start: "15:00", ende: "23:00" } };
    const m = { ...betrieb(), dienstarten: [spaet, FRUEH, SPAET] };
    const b = geteilterdienstBefunde(m, spaet, MO, { ...opts(), person: {}, dienstAm: dienstAmMit("F") });
    expect(b).toHaveLength(1);
    expect(b[0].text).toMatch(/7[,.]0 h/);
  });
  it("Höchstspanne: ohne Eintrag keine Grenze (Vorgabe), mit Eintrag Hinweis darüber, genau erreicht in Ordnung", () => {
    const ohne = geteilterdienstBefunde(betrieb(), GET, MO, { ...opts(), person: {}, dienstAm: () => null });
    expect(ohne).toEqual([]);
    expect(geteilterdienstBefunde(betrieb({ hoechstSpanne: 13 }), GET, MO, { ...opts(), person: {}, dienstAm: () => null })).toEqual([]);
    const b = geteilterdienstBefunde(betrieb({ hoechstSpanne: 12 }), GET, MO, { ...opts(), person: {}, dienstAm: () => null });
    expect(b).toHaveLength(1);
    expect(b[0]).toMatchObject({ regelId: "GETEILT-SPANNE-01", stufe: "hinweis" });
  });
  it("kein geteilter Dienst: keine Befunde", () => {
    expect(geteilterdienstBefunde(betrieb(), FRUEH, MO, { ...opts(), person: {}, dienstAm: dienstAmMit("F") })).toEqual([]);
  });
  it("inaktives Modul erzeugt keine Befunde — geplant, ausgeschaltet, ohne Paket", () => {
    const spaet = { ...GET, zweiterAbschnitt: { start: "15:00", ende: "23:00" } };
    const art = (m, module) => geteilterdienstBefunde({ ...m, dienstarten: [spaet, FRUEH] }, spaet, MO, { auswerten: pruefeRegel, module, person: {}, dienstAm: dienstAmMit("F") });
    expect(art(betrieb(), undefined)).toEqual([]);
    expect(art(betrieb({ an: false }), AKTIV)).toEqual([]);
    expect(art(betrieb({ pakete: [] }), AKTIV)).toEqual([]);
  });
});

describe("Schreibweg (Server)", () => {
  it("geteilterdienstZusammen weist fehlerhafte zweite Abschnitte ab, lässt andere Dienstarten durch", () => {
    expect(geteilterdienstZusammen({ dienstarten: [GET, FRUEH] }).grund).toBeUndefined();
    expect(geteilterdienstZusammen({}).grund).toBeUndefined();
    expect(geteilterdienstZusammen({ dienstarten: [{ ...GET, zweiterAbschnitt: { start: "09:00", ende: "12:00" } }] }).grund).toMatch(/Geteilt/);
  });
  it("über den Serverweg: Leitung speichert einen gültigen, ein fehlerhafter wird abgewiesen", () => {
    const g = branchenbestand({ pakete: ["klinik"] });
    expect(schreibeAls(g, "LT", (m) => { m.dienstarten = [...m.dienstarten, GET]; }).verweigert).toBeFalsy();
    expect(schreibeAls(g, "LT", (m) => { m.dienstarten = [...m.dienstarten, { ...GET, zweiterAbschnitt: { start: "09:00", ende: "12:00" } }]; }).verweigert).toMatch(/Geteilt/);
  });
});

describe("Review-Auflage 2: Altbestand blockiert nicht", () => {
  it("ein unveränderter fehlerhafter Eintrag wird toleriert, ein geänderter oder neuer streng geprüft", () => {
    const kaputt = { ...GET, zweiterAbschnitt: { start: "09:00", ende: "12:00" } };
    const alt = { dienstarten: [kaputt] };
    expect(geteilterdienstZusammen(alt, alt).grund).toBeUndefined();
    expect(geteilterdienstZusammen({ dienstarten: [{ ...kaputt, name: "Umbenannt" }] }, alt).grund).toMatch(/Umbenannt/);
    expect(geteilterdienstZusammen({ dienstarten: [kaputt, { ...kaputt, id: "H" }] }, alt).grund).toMatch(/Geteilt/);
  });
});

describe("Oberfläche", () => {
  it("zeigt beide Abschnitte, Arbeitszeit, Lücke und Spanne in Worten", () => {
    const html = renderToStaticMarkup(h(AbschnittsAnzeige, { da: GET }));
    for (const t of ["06:00", "10:00", "15:00", "19:00", "Arbeitszeit", "Lücke", "Spanne"]) expect(html).toContain(t);
    expect(renderToStaticMarkup(h(AbschnittsAnzeige, { da: FRUEH }))).toBe("");
  });
});
