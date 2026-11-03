/* ==========================================================================
   MODUL ANLAGEN — Anlagenbindung (WP-19, Strang C)

   Nach der Entscheidungsmatrix (Empfehlungen): A1 a — eine Anlage ist ein
   Betriebsmittel der Art „anlage" mit Mindestbesetzung je Dienstart und
   Laufzeitkalender; A2 a — Wochenmuster plus Ausnahmen; A3 a — Unterbesetzung
   ist ein Hinweis (vorläufige Registerregel), nie eine Sperre. Das Modul
   bleibt „geplant"; ein inaktives Modul erzeugt keine Befunde.
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ANLAGE_ART, istAnlage, pruefeAnlage, anlageLaeuft, anlagenBedarf, anlagenRegel, anlagenBefunde, anlagenZusammen,
} from "../server/lib/modul-anlagen.mjs";
import { BRANCHENMODULE, modulVon, pruefeModulRegistry } from "../server/lib/branchenmodule.mjs";
import { REGELN_BRANCHEN, pruefeBranchenkatalog } from "../server/lib/branchenkatalog.mjs";
import { REGELN, pruefeRegister } from "../src/regelregister.js";
import { pruefeRegel } from "../src/regelbaukasten.js";
import { branchenbestand, schreibeAls } from "./hilfen/branchenbetrieb.mjs";
import { AnlagenUebersicht } from "../src/module/anlagen.jsx";

const MO = "2026-11-02", SA = "2026-11-07", SO = "2026-11-08";
const PRESSE = { id: "bm1", art: ANLAGE_ART, name: "Presse 1", personId: null,
  mindestBesetzung: { F: 2, S: 1 },
  laufzeit: { wochentage: [true, true, true, true, true, false, false], ausnahmen: [{ datum: SA, laeuft: true }] } };
const OFEN = { id: "bm2", art: ANLAGE_ART, name: "Ofen", personId: null, mindestBesetzung: { F: 1, N: 1 } };   // ohne Laufzeit
const SCHLUESSEL = { id: "bm3", art: "schluessel", name: "Tor", personId: null };

/* Das Modul im Test eingeschaltet: dieselbe Registry, nur der Status „vorläufig". */
const AKTIV_LISTE = BRANCHENMODULE.map((x) => (x.id === "anlagen" ? { ...x, status: "vorlaeufig" } : x));
const betrieb = ({ an = true, pakete = ["industrie"] } = {}) => ({ ...branchenbestand({ pakete,
  branchenmodule: an ? { anlagen: { an: true } } : {} }).mandanten[0], betriebsmittel: [PRESSE, OFEN, SCHLUESSEL] });
const leute = (n) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, merkmale: [] }));

describe("Registry und Katalog", () => {
  it("Modul registriert, Industrie, „geplant“, mit seiner vorläufigen Registerregel", () => {
    const mod = modulVon("anlagen");
    expect(mod).toMatchObject({ pakete: ["industrie"], status: "geplant", regelIds: ["ANLAGEN-BESETZUNG-01"] });
    expect(pruefeModulRegistry()).toEqual([]);
    const r = REGELN_BRANCHEN.find((x) => x.id === "ANLAGEN-BESETZUNG-01");
    expect(r).toMatchObject({ modul: "anlagen", typ: "besetzungsregel", pruefstatus: "provisional", hoechsteStufe: "hinweis", regelstand: null });
    expect(r.scope.branche).toEqual(expect.arrayContaining(["produktion"]));
    expect(REGELN.some((x) => x.id === r.id)).toBe(true);
    expect(pruefeRegister()).toEqual([]);
    expect(pruefeBranchenkatalog()).toEqual([]);
  });
});

describe("Anlage als Betriebsmittel (A1)", () => {
  it("erkennt Anlagen und prüft ihre Felder streng", () => {
    expect(istAnlage(PRESSE)).toBe(true);
    expect(istAnlage(SCHLUESSEL)).toBe(false);
    expect(pruefeAnlage(PRESSE)).toBeNull();
    expect(pruefeAnlage(OFEN)).toBeNull();
    expect(pruefeAnlage(SCHLUESSEL)).toBeNull();          // keine Anlage: nichts zu prüfen
    for (const kaputt of [
      { ...PRESSE, mindestBesetzung: { F: -1 } }, { ...PRESSE, mindestBesetzung: { F: 1.5 } }, { ...PRESSE, mindestBesetzung: { F: 1000 } },
      { ...PRESSE, mindestBesetzung: [] }, { ...PRESSE, laufzeit: { wochentage: [true] } },
      { ...PRESSE, laufzeit: { wochentage: [1, 1, 1, 1, 1, 0, 0] } },
      { ...PRESSE, laufzeit: { wochentage: PRESSE.laufzeit.wochentage, ausnahmen: [{ datum: "morgen", laeuft: true }] } },
      { ...PRESSE, laufzeit: { wochentage: PRESSE.laufzeit.wochentage, ausnahmen: new Array(400).fill({ datum: MO, laeuft: true }) } },
      { ...PRESSE, laufzeit: { wochentage: PRESSE.laufzeit.wochentage, extra: 1 } },
    ]) expect(pruefeAnlage(kaputt), JSON.stringify(kaputt).slice(0, 120)).toBeTruthy();
  });
});

describe("Laufzeitkalender (A2)", () => {
  it("Wochenmuster und Ausnahmen; ohne Kalender nicht bewertbar", () => {
    expect(anlageLaeuft(PRESSE, MO)).toEqual({ laeuft: true, offen: false });
    expect(anlageLaeuft(PRESSE, SO)).toEqual({ laeuft: false, offen: false });
    expect(anlageLaeuft(PRESSE, SA)).toEqual({ laeuft: true, offen: false });   // Ausnahme
    expect(anlageLaeuft(OFEN, MO)).toEqual({ laeuft: null, offen: true });
  });
  it("Bedarf je Dienst: laufende Anlagen zählen, ruhende nicht, unbekannte zählen und sind „offen“", () => {
    const m = betrieb();
    expect(anlagenBedarf(m, MO, "F")).toMatchObject({ summe: 3, offen: true });
    expect(anlagenBedarf(m, SO, "F")).toMatchObject({ summe: 1, offen: true });
    expect(anlagenBedarf(m, MO, "S")).toMatchObject({ summe: 1, offen: false });
    expect(anlagenBedarf(m, MO, "X")).toMatchObject({ summe: 0, anlagen: [] });
  });
});

describe("Befunde (A3 a: Hinweis, sperrt nie; inaktives Modul: keine)", () => {
  const auswerten = (regel, kontext) => pruefeRegel(regel, kontext);
  it("Unterbesetzung ergibt einen Hinweis in der Form von einteilungsBefunde", () => {
    const b = anlagenBefunde(betrieb(), MO, "S", leute(0), { auswerten, module: AKTIV_LISTE });
    expect(b).toHaveLength(1);
    expect(b[0]).toMatchObject({ regel: "branche", regelId: "ANLAGEN-BESETZUNG-01", modul: "anlagen", stufe: "hinweis", art: "branche" });
  });
  it("genau erreicht und darüber: kein Befund; knapp darunter: Befund", () => {
    expect(anlagenBefunde(betrieb(), MO, "S", leute(1), { auswerten, module: AKTIV_LISTE })).toEqual([]);
    expect(anlagenBefunde(betrieb(), MO, "S", leute(2), { auswerten, module: AKTIV_LISTE })).toEqual([]);
    expect(anlagenBefunde(betrieb(), MO, "F", leute(2), { auswerten, module: AKTIV_LISTE })).toHaveLength(1);
  });
  it("Laufzeit unbekannt, Besetzung reicht: Hinweis „nicht bewertbar“, nie still erfüllt", () => {
    const b = anlagenBefunde(betrieb(), MO, "F", leute(3), { auswerten, module: AKTIV_LISTE });
    expect(b).toHaveLength(1);
    expect(b[0]).toMatchObject({ stufe: "hinweis", offen: true });
  });
  it("kein Bedarf: kein Befund", () => {
    expect(anlagenBefunde(betrieb(), SO, "S", leute(0), { auswerten, module: AKTIV_LISTE })).toEqual([]);
  });
  it("inaktives Modul erzeugt keine Befunde — geplant, ausgeschaltet oder ohne Paket", () => {
    expect(anlagenBefunde(betrieb(), MO, "S", leute(0), { auswerten })).toEqual([]);                       // Status geplant
    expect(anlagenBefunde(betrieb({ an: false }), MO, "S", leute(0), { auswerten, module: AKTIV_LISTE })).toEqual([]);
    expect(anlagenBefunde(betrieb({ pakete: [] }), MO, "S", leute(0), { auswerten, module: AKTIV_LISTE })).toEqual([]);
  });
  it("die Regelinstanz trägt den Bedarf und bleibt vorläufig", () => {
    const r = anlagenRegel(3);
    expect(r.parameter.anforderungen).toEqual([{ art: "anzahl", min: 3 }]);
    expect(r).toMatchObject({ pruefstatus: "provisional", hoechsteStufe: "hinweis" });
  });
});

describe("Schreibweg (Server)", () => {
  it("anlagenZusammen weist fehlerhafte Anlagen ab und lässt anderes durch", () => {
    expect(anlagenZusammen({ betriebsmittel: [PRESSE, SCHLUESSEL] }).grund).toBeUndefined();
    expect(anlagenZusammen({}).grund).toBeUndefined();
    expect(anlagenZusammen({ betriebsmittel: [{ ...PRESSE, mindestBesetzung: { F: -2 } }] }).grund).toMatch(/Presse 1/);
  });
  it("über den Serverweg: fehlerhafte Anlage wird abgewiesen, eine gültige gespeichert", () => {
    const g = branchenbestand({ pakete: ["industrie"] });
    const falsch = schreibeAls(g, "PL", (m) => { m.betriebsmittel = [{ ...PRESSE, laufzeit: { wochentage: "immer" } }]; });
    expect(falsch.verweigert).toMatch(/Anlage/);
    const gut = schreibeAls(g, "PL", (m) => { m.betriebsmittel = [PRESSE]; });
    expect(gut.verweigert).toBeFalsy();
    expect(gut.mandanten[0].betriebsmittel[0]).toMatchObject({ art: "anlage", mindestBesetzung: { F: 2, S: 1 } });
  });
});

describe("Oberfläche", () => {
  it("zeigt je Anlage Laufzeit und Bedarf, Unbekanntes als nicht bewertbar", () => {
    const html = renderToStaticMarkup(h(AnlagenUebersicht, { m: betrieb(), datum: MO }));
    expect(html).toContain("Presse 1");
    expect(html).toContain("Ofen");
    expect(html).toContain("nicht bewertbar");
    expect(html).not.toContain("Tor");
  });
});
