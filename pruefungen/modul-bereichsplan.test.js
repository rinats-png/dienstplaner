/* ==========================================================================
   MODUL BEREICHSPLAN — Bereichs- und Wachabteilungsplanung (WP-19, Strang B)

   Nach der Entscheidungsmatrix (Empfehlungen, vorläufig bis zur
   Nutzerentscheidung): B1 b — Bereiche sind eine freie Liste je Einheit
   (`einheiten[].bereiche`, mit Soll je Dienstart); B2 b — Planung, Leitung
   und die Schichtverantwortung ordnen zu (Betriebsfeld `bereichsPlan`,
   Schlüssel „personId|Tag" → Bereich), die Schichtverantwortung nur im
   eigenen Bereich am Tag; B3 a — dasselbe Modul für die Wachabteilung im
   Rettungsdienst. Unterbesetzung eines Bereichs ist ein Hinweis. Das Modul
   bleibt „geplant"; ein inaktives Modul erzeugt keine Befunde.
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  pruefeBereiche, pruefeBereichsPlan, bereichsIndex, bereichsLage, bereichsplanBefunde, bereichsplanZusammen, BEREICH_GRENZEN,
} from "../server/lib/modul-bereichsplan.mjs";
import { BRANCHENMODULE, modulVon, pruefeModulRegistry } from "../server/lib/branchenmodule.mjs";
import { REGELN_BRANCHEN, pruefeBranchenkatalog } from "../server/lib/branchenkatalog.mjs";
import { BETRIEB } from "../server/lib/sicht.mjs";
import { pruefeRegister } from "../src/regelregister.js";
import { pruefeRegel } from "../server/lib/regelbaukasten.mjs";
import { bestandFuerRolle } from "../server/lib/rechte.mjs";
import { branchenbestand, schreibeAls, SITZUNGEN } from "./hilfen/branchenbetrieb.mjs";
import { BereichsUebersicht } from "../src/module/bereichsplan.jsx";

const MO = "2026-11-02", DI = "2026-11-03";
const BEREICHE_E1 = [{ id: "b1", name: "Wohnbereich Nord", soll: { F: 2 } }, { id: "b2", name: "Wohnbereich Süd", soll: { F: 1, S: 1 } }];
const BEREICHE_E2 = [{ id: "b3", name: "Station 3", soll: { F: 1 } }];
const person = (id, extra = {}) => ({ id, vorname: "V", nachname: id, status: "aktiv", ...extra });

const AKTIV = BRANCHENMODULE.map((x) => (x.id === "bereichsplan" ? { ...x, status: "vorlaeufig" } : x));
const einheitAm = (p) => p.einheit || "e1";
const opts = (extra = {}) => ({ auswerten: pruefeRegel, module: AKTIV, einheitAm, ...extra });

/** Ein Betrieb mit zwei Einheiten, Bereichen und Personen in beiden. */
function bestand({ pakete = ["pflege"], an = true, plan = {} } = {}) {
  const g = branchenbestand({ pakete, branchenmodule: an ? { bereichsplan: { an: true } } : {} });
  const m = g.mandanten[0];
  m.einheiten = [{ id: "e1", versatzTage: 0, bereiche: BEREICHE_E1 }, { id: "e2", versatzTage: 0, bereiche: BEREICHE_E2 }];
  m.personen.push({ ...m.personen[0], id: "x2", rolle: "mitarbeiter", bereich: "e2", zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e2" }] });
  m.dienstarten = [{ id: "F", name: "Früh", start: "06:00", ende: "14:00" }, { id: "S", name: "Spät", start: "14:00", ende: "22:00" }];
  m.bereichsPlan = plan;
  return g;
}

describe("Registry und Katalog", () => {
  it("Modul registriert, Pflege, „geplant“, mit vorläufiger Regel und Datenfeld", () => {
    expect(modulVon("bereichsplan")).toMatchObject({ pakete: ["pflege"], status: "geplant", datenfelder: ["bereichsPlan"],
      regelIds: ["BEREICH-BESETZUNG-01"] });
    expect(REGELN_BRANCHEN.find((r) => r.id === "BEREICH-BESETZUNG-01")).toMatchObject({ modul: "bereichsplan", pruefstatus: "provisional",
      hoechsteStufe: "hinweis", regelstand: null });
    expect(REGELN_BRANCHEN.find((r) => r.id === "BEREICH-BESETZUNG-01").scope.branche).toEqual(expect.arrayContaining(["pflege", "rettung"]));
    expect(pruefeModulRegistry()).toEqual([]);
    expect(pruefeBranchenkatalog()).toEqual([]);
    expect(pruefeRegister()).toEqual([]);
  });
  it("das Datenfeld steht im Positivkatalog", () => {
    expect(BETRIEB.bereichsPlan).toBeTruthy();
  });
});

describe("Datenmodell (B1 b)", () => {
  const einheiten = (b) => [{ id: "e1", bereiche: b }];
  it("gültige Bereiche; Index über alle Einheiten", () => {
    expect(pruefeBereiche(bestand().mandanten[0].einheiten)).toBeNull();
    expect(pruefeBereiche([{ id: "e1" }])).toBeNull();                                // ohne Bereiche in Ordnung
    expect(pruefeBereiche(undefined)).toBeNull();
    const ix = bereichsIndex(bestand().mandanten[0]);
    expect(ix.get("b3")).toMatchObject({ einheitId: "e2", bereich: { name: "Station 3" } });
    expect(ix.size).toBe(3);
  });
  it("weist Doppelte, fehlende Namen, falsche Sollwerte und zu viele Einträge ab", () => {
    for (const kaputt of [
      einheiten("x"), einheiten([{ id: "b" }]), einheiten([{ id: "b", name: " " }]), einheiten([{ id: "b", name: "B" }, { id: "b", name: "C" }]),
      einheiten([{ id: "b", name: "B", soll: { F: -1 } }]), einheiten([{ id: "b", name: "B", soll: { F: 1.5 } }]), einheiten([{ id: "b", name: "B", soll: [] }]),
      einheiten([{ id: "b", name: "B", extra: 1 }]),
      einheiten(Array.from({ length: BEREICH_GRENZEN.bereicheJeEinheit + 1 }, (_, i) => ({ id: `b${i}`, name: "B" }))),
      [{ id: "e1", bereiche: [{ id: "b", name: "B" }] }, { id: "e2", bereiche: [{ id: "b", name: "C" }] }],     // Kennung über Einheiten doppelt
    ]) expect(pruefeBereiche(kaputt), JSON.stringify(kaputt).slice(0, 100)).toMatch(/Bereich/);
  });
  it("Zuordnung: Schlüssel „Person|Tag“ → Bereich", () => {
    expect(pruefeBereichsPlan({ [`a|${MO}`]: "b1" })).toBeNull();
    expect(pruefeBereichsPlan(undefined)).toBeNull();
    for (const kaputt of [[], "x", { a: "b1" }, { [`a|${MO}`]: 5 }, { [`a|2026-13-40`]: "b1" }, { [`a|${MO}`]: "x".repeat(100) }])
      expect(pruefeBereichsPlan(kaputt), JSON.stringify(kaputt)).toMatch(/Bereich/);
    const alt = { "a|kaputt": "b1" };
    expect(pruefeBereichsPlan(alt, alt)).toBeNull();                                  // Altbestand blockiert nicht
  });
});

describe("Lage (Besetzung je Bereich)", () => {
  const plan = { [`a1|${MO}`]: "b1", [`p1|${MO}`]: "b1", [`s1|${MO}`]: "b2" };
  const leute = (...ids) => ids.map((id) => person(id));
  it("Soll, Ist und Fehlbestand der Bereiche einer Einheit im Dienst", () => {
    const m = bestand({ plan }).mandanten[0];
    const l = bereichsLage(m, "e1", MO, "F", leute("a1", "p1", "s1")).bereiche;
    expect(l.map((x) => [x.bereich, x.soll, x.ist.length, x.fehlt])).toEqual([["b1", 2, 2, 0], ["b2", 1, 1, 0]]);
    expect(bereichsLage(m, "e1", MO, "F", leute("a1")).bereiche.find((x) => x.bereich === "b1")).toMatchObject({ fehlt: 1 });
    expect(bereichsLage(m, "e1", MO, "N", [])).toEqual({ bereiche: [], nichtZugeordnet: [] });
  });
  it("wer nicht eingeteilt ist, ist „nicht zugeordnet“; Einträge anderer Tage zählen nicht", () => {
    const m = bestand({ plan: { [`a1|${DI}`]: "b1" } }).mandanten[0];
    const l = bereichsLage(m, "e1", MO, "F", leute("a1", "p1"));
    expect(l.bereiche.find((x) => x.bereich === "b1").ist).toEqual([]);
    expect(l.nichtZugeordnet).toEqual(["a1", "p1"]);
  });
});

describe("Befunde (Hinweis, sperrt nie; inaktiv: keine)", () => {
  const F = { id: "F" };
  it("Bereich unterbesetzt: Hinweis in der Form von einteilungsBefunde; genau erreicht: keiner", () => {
    const a = person("a1"), p = person("p1");
    const m = bestand({ plan: { [`a1|${MO}`]: "b1", [`p1|${MO}`]: "b1" } }).mandanten[0];
    const eins = bereichsplanBefunde(m, F, MO, a, [a], opts());
    expect(eins).toHaveLength(1);
    expect(eins[0]).toMatchObject({ regel: "branche", regelId: "BEREICH-BESETZUNG-01", modul: "bereichsplan", stufe: "hinweis", art: "branche" });
    expect(bereichsplanBefunde(m, F, MO, a, [a, p], opts())).toEqual([]);
  });
  it("ohne Zuordnung, ohne Soll im Dienst oder mit unbekanntem Bereich: nichts", () => {
    const a = person("a1");
    expect(bereichsplanBefunde(bestand().mandanten[0], F, MO, a, [a], opts())).toEqual([]);
    expect(bereichsplanBefunde(bestand({ plan: { [`a1|${MO}`]: "b1" } }).mandanten[0], { id: "S" }, MO, a, [a], opts())).toEqual([]);
    expect(bereichsplanBefunde(bestand({ plan: { [`a1|${MO}`]: "gibtsnicht" } }).mandanten[0], F, MO, a, [a], opts())).toEqual([]);
  });
  it("Bereich einer anderen Einheit: Hinweis „nicht bewertbar“, kein stilles Erfüllt", () => {
    const x = person("x2", { einheit: "e2" });
    const m = bestand({ plan: { [`x2|${MO}`]: "b1" } }).mandanten[0];
    const b = bereichsplanBefunde(m, F, MO, x, [x], opts());
    expect(b).toHaveLength(1);
    expect(b[0]).toMatchObject({ stufe: "hinweis", offen: true });
  });
  it("inaktives Modul erzeugt keine Befunde — geplant, ausgeschaltet, ohne Paket", () => {
    const a = person("a1");
    const plan = { [`a1|${MO}`]: "b1" };
    const art = (g, module) => bereichsplanBefunde(g.mandanten[0], F, MO, a, [a], opts({ module }));
    expect(art(bestand({ plan }), undefined)).toEqual([]);
    expect(art(bestand({ plan, an: false }), AKTIV)).toEqual([]);
    expect(art(bestand({ plan, pakete: [] }), AKTIV)).toEqual([]);
  });
});

describe("Schreibweg (Server) — Planung, Leitung und Schichtverantwortung (B2 b)", () => {
  it("bereichsplanZusammen prüft die Form; Altbestand blockiert nicht", () => {
    expect(bereichsplanZusammen({ einheiten: [{ id: "e1", bereiche: BEREICHE_E1 }], bereichsPlan: { [`a|${MO}`]: "b1" } }).grund).toBeUndefined();
    expect(bereichsplanZusammen({}).grund).toBeUndefined();
    expect(bereichsplanZusammen({ einheiten: [{ id: "e1", bereiche: [{ id: "b" }] }] }).grund).toMatch(/Bereich/);
    const alt = { einheiten: [{ id: "e1", bereiche: [{ id: "b" }] }], bereichsPlan: { kaputt: 1 } };
    expect(bereichsplanZusammen(alt, alt).grund).toBeUndefined();
  });
  it("Planung und Leitung speichern Bereiche und Zuordnungen; Fehlerhaftes wird abgewiesen", () => {
    for (const r of ["PL", "LT"]) {
      const ok = schreibeAls(bestand(), r, (m) => { m.bereichsPlan = { [`a1|${MO}`]: "b1", [`x2|${MO}`]: "b3" }; });
      expect(ok.verweigert, r).toBeFalsy();
      expect(ok.mandanten[0].bereichsPlan).toEqual({ [`a1|${MO}`]: "b1", [`x2|${MO}`]: "b3" });
    }
    expect(schreibeAls(bestand(), "LT", (m) => { m.einheiten[0].bereiche = [{ id: "b" }]; }).verweigert).toMatch(/Bereich/);
  });
  it("die Schichtverantwortung ordnet im eigenen Bereich am Tag zu, nicht darüber hinaus", () => {
    const g = bestand({ plan: { [`x2|${MO}`]: "b3" } });                              // fremder Bereich: für die SV unsichtbar
    const ok = schreibeAls(g, "SV", (m) => { m.bereichsPlan = { ...m.bereichsPlan, [`a1|${MO}`]: "b2" }; });
    expect(ok.verweigert).toBeFalsy();
    expect(ok.mandanten[0].bereichsPlan).toEqual({ [`x2|${MO}`]: "b3", [`a1|${MO}`]: "b2" });   // Unsichtbares bleibt erhalten
    const fremd = schreibeAls(g, "SV", (m) => { m.bereichsPlan = { ...m.bereichsPlan, [`x2|${DI}`]: "b3" }; });
    expect(fremd.verweigert).toMatch(/Bereich/);
    const falscherBereich = schreibeAls(g, "SV", (m) => { m.bereichsPlan = { ...m.bereichsPlan, [`a1|${MO}`]: "b3" }; });
    expect(falscherBereich.verweigert).toMatch(/Bereich/);
    const loeschen = schreibeAls(bestand({ plan: { [`a1|${MO}`]: "b1" } }), "SV", (m) => { delete m.bereichsPlan[`a1|${MO}`]; });
    expect(loeschen.verweigert).toBeFalsy();
    expect(loeschen.mandanten[0].bereichsPlan).toEqual({});
  });
  it("Beschäftigte schreiben keine Zuordnung", () => {
    const g = bestand({ plan: { [`a1|${MO}`]: "b1" } });
    const v = schreibeAls(g, "MA", (m) => { m.bereichsPlan = { [`a1|${MO}`]: "b2" }; });
    if (!v.verweigert) expect(v.mandanten[0].bereichsPlan).toEqual({ [`a1|${MO}`]: "b1" });
  });
});

describe("Sicht", () => {
  it("Bereiche (an der Einheit) sehen alle; die Zuordnung Beschäftigte nur eigene, SV im Bereich am Tag, Betriebsrat nicht", () => {
    const g = bestand({ plan: { [`a1|${MO}`]: "b1", [`s1|${MO}`]: "b2", [`x2|${MO}`]: "b3" } });
    for (const r of ["MA", "SV", "PL", "LT", "BR"]) expect(bestandFuerRolle(g, SITZUNGEN[r]).mandanten[0].einheiten[0].bereiche, r).toEqual(BEREICHE_E1);
    const schluessel = (r) => Object.keys(bestandFuerRolle(g, SITZUNGEN[r]).mandanten[0].bereichsPlan || {}).sort();
    expect(schluessel("PL")).toHaveLength(3);
    expect(schluessel("LT")).toHaveLength(3);
    expect(schluessel("MA")).toEqual([`a1|${MO}`]);
    expect(schluessel("SV")).toEqual([`a1|${MO}`, `s1|${MO}`]);                      // x2 liegt in einem anderen Bereich
    expect(schluessel("BR")).toEqual([]);
  });
});

describe("Oberfläche", () => {
  it("zeigt Bereiche mit Soll, Ist, Fehlbestand und nicht Zugeordnete in Worten", () => {
    const m = bestand({ plan: { [`a1|${MO}`]: "b1" } }).mandanten[0];
    const html = renderToStaticMarkup(h(BereichsUebersicht, { m, einheitId: "e1", datum: MO, dienstId: "F", personenImDienst: [person("a1"), person("p1")] }));
    for (const t of ["Wohnbereich Nord", "Wohnbereich Süd", "fehlt", "nicht zugeordnet"]) expect(html).toContain(t);
  });
});
