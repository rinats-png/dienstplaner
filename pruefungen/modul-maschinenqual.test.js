/* ==========================================================================
   MODUL MASCHINENQUAL — Maschinenqualifikationen (WP-19, Strang C)

   Nach der Entscheidungsmatrix (Empfehlungen): M1 a — Matrix aus den
   bestehenden Kompetenzen (art „geraet" mit betriebsmittelId einer Anlage),
   keine neue Struktur; M2 a — Wiederholung jährlich als änderbare Vorgabe;
   M3 a — befähigte Person als Merkmal der Kompetenz. Qualifizierte Besetzung
   je Anlage ist ein Hinweis (vorläufige Regel). Hängt an „anlagen";
   Status „geplant"; ein inaktives Modul erzeugt keine Befunde.
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  maschinenKompetenzVorlage, pruefeMaschinenKompetenz, qualifikationsMatrix, anlagenMerkmale, maschinenqualBefunde,
  maschinenqualZusammen, MASCHQUAL_WIEDERHOLUNG_MONATE,
} from "../server/lib/modul-maschinenqual.mjs";
import { BRANCHENMODULE, modulVon, pruefeModulRegistry } from "../server/lib/branchenmodule.mjs";
import { REGELN_BRANCHEN, pruefeBranchenkatalog } from "../server/lib/branchenkatalog.mjs";
import { pruefeRegister } from "../src/regelregister.js";
import { pruefeRegel } from "../src/regelbaukasten.js";
import { kompetenzStand } from "../src/regelwerk.js";
import { branchenbestand, schreibeAls, SITZUNGEN, vorlaeufigListe, schalterAn } from "./hilfen/branchenbetrieb.mjs";
import { bestandFuerRolle } from "../server/lib/rechte.mjs";
import { QualifikationsMatrix } from "../src/module/maschinenqual.jsx";

const MO = "2026-11-02";
const LAEUFT = { wochentage: [true, true, true, true, true, false, false] };
const PRESSE = { id: "bm1", art: "anlage", name: "Presse 1", personId: null, mindestBesetzung: { F: 2 }, laufzeit: LAEUFT };
const FRAESE = { id: "bm2", art: "anlage", name: "Fräse", personId: null, mindestBesetzung: { F: 1 }, laufzeit: LAEUFT };
const K_PRESSE = { id: "k1", name: "Bedienung Presse 1", art: "geraet", betriebsmittelId: "bm1", wiederholungMonate: 12,
  pflichtFuer: [], zugedacht: [] };
const K_TOR = { id: "k2", name: "Tor", art: "taetigkeit", betriebsmittelId: null, pflichtFuer: [], zugedacht: [] };
const person = (id, nachweise = []) => ({ id, vorname: "V", nachname: id, status: "aktiv", kompetenzNachweise: nachweise });
const P_GUELTIG = person("a", [{ kompetenzId: "k1", ab: "2026-06-01" }]);
const P_ALT = person("b", [{ kompetenzId: "k1", ab: "2024-01-01" }]);
const P_OHNE = person("c");

const AKTIV = BRANCHENMODULE.map((x) => (x.id === "anlagen" || x.id === "maschinenqual" ? { ...x, status: "vorlaeufig" } : x));
const betrieb = ({ module = { anlagen: { an: true }, maschinenqual: { an: true } }, kompetenzen = [K_PRESSE, K_TOR] } = {}) => ({
  ...branchenbestand({ pakete: ["industrie"], branchenmodule: module }).mandanten[0],
  betriebsmittel: [PRESSE, FRAESE], kompetenzen, personen: [P_GUELTIG, P_ALT, P_OHNE] });
const auswerten = (r, k) => pruefeRegel(r, k);

describe("Registry und Katalog", () => {
  it("Modul registriert, hängt an anlagen, „geplant“, mit vorläufiger Regel", () => {
    expect(modulVon("maschinenqual")).toMatchObject({ pakete: ["industrie"], status: "geplant", abhaengigVon: ["anlagen"],
      regelIds: ["MASCHQUAL-BESETZUNG-01"] });
    expect(REGELN_BRANCHEN.find((r) => r.id === "MASCHQUAL-BESETZUNG-01"))
      .toMatchObject({ modul: "maschinenqual", pruefstatus: "provisional", hoechsteStufe: "hinweis" });
    expect(pruefeModulRegistry()).toEqual([]);
    expect(pruefeBranchenkatalog()).toEqual([]);
    expect(pruefeRegister()).toEqual([]);
  });
});

describe("Kompetenzen je Anlage (M1, M2, M3)", () => {
  it("Vorlage: Gerätekompetenz an der Anlage, jährliche Wiederholung als Vorgabe", () => {
    expect(MASCHQUAL_WIEDERHOLUNG_MONATE).toBe(12);
    expect(maschinenKompetenzVorlage(PRESSE)).toMatchObject({ name: "Bedienung Presse 1", art: "geraet",
      betriebsmittelId: "bm1", wiederholungMonate: 12, befaehigtePerson: false });
    expect(maschinenKompetenzVorlage(PRESSE, { befaehigt: true })).toMatchObject({ name: "Befähigte Person Presse 1",
      befaehigtePerson: true });
  });
  it("prüft die Felder streng, lässt fremde Kompetenzen in Ruhe", () => {
    expect(pruefeMaschinenKompetenz(K_PRESSE)).toBeNull();
    expect(pruefeMaschinenKompetenz(K_TOR)).toBeNull();
    expect(pruefeMaschinenKompetenz({ ...K_PRESSE, befaehigtePerson: "ja" })).toMatch(/befähigte/i);
    expect(pruefeMaschinenKompetenz({ ...K_PRESSE, wiederholungMonate: 0 })).toBeTruthy();
    expect(pruefeMaschinenKompetenz({ ...K_PRESSE, wiederholungMonate: 1000 })).toBeTruthy();
  });
});

describe("Matrix Person × Anlage", () => {
  it("Stand je Zelle; Anlagen ohne Kompetenz heißen „nicht hinterlegt“", () => {
    const mx = qualifikationsMatrix(betrieb(), MO, kompetenzStand);
    expect(mx.anlagen.map((a) => a.id)).toEqual(["bm1", "bm2"]);
    const zeile = (id) => mx.zeilen.find((z) => z.personId === id).zellen;
    expect(zeile("a").bm1.stand).toBe("gueltig");
    expect(zeile("b").bm1.stand).toBe("abgelaufen");
    expect(zeile("c").bm1.stand).toBe("fehlt");
    expect(zeile("a").bm2).toBeNull();
  });
  it("Merkmale „anlage:<id>“ nur für gültige Kompetenzen", () => {
    const m = betrieb();
    expect(anlagenMerkmale(m, P_GUELTIG, MO, kompetenzStand)).toEqual(["anlage:bm1"]);
    expect(anlagenMerkmale(m, P_ALT, MO, kompetenzStand)).toEqual([]);
  });
});

describe("Befunde (Hinweis, sperrt nie; inaktiv: keine)", () => {
  const opts = (extra = {}) => ({ auswerten, stand: kompetenzStand, module: AKTIV, ...extra });
  it("zu wenige qualifizierte Personen an der Presse: Hinweis; Fräse ohne Kompetenz: nicht bewertbar", () => {
    const b = maschinenqualBefunde(betrieb(), MO, "F", [P_GUELTIG, P_ALT], opts());
    const presse = b.find((x) => x.text.includes("Presse 1"));
    const fraese = b.find((x) => x.text.includes("Fräse"));
    expect(presse).toMatchObject({ regel: "branche", regelId: "MASCHQUAL-BESETZUNG-01", stufe: "hinweis" });
    expect(presse.offen).toBeUndefined();
    expect(fraese).toMatchObject({ stufe: "hinweis", offen: true });
    for (const x of b) expect(x.stufe).toBe("hinweis");
  });
  it("genug qualifizierte Personen: kein Befund zur Presse", () => {
    const zweiter = person("d", [{ kompetenzId: "k1", ab: "2026-05-01" }]);
    const b = maschinenqualBefunde(betrieb(), MO, "F", [P_GUELTIG, zweiter], opts());
    expect(b.some((x) => x.text.includes("Presse 1"))).toBe(false);
  });
  it("inaktives Modul erzeugt keine Befunde — geplant, aus, oder anlagen aus", () => {
    expect(maschinenqualBefunde(betrieb(), MO, "F", [P_OHNE], opts({ module: BRANCHENMODULE }))).toEqual([]);
    expect(maschinenqualBefunde(betrieb({ module: { anlagen: { an: true } } }), MO, "F", [P_OHNE], opts())).toEqual([]);
    expect(maschinenqualBefunde(betrieb({ module: { maschinenqual: { an: true } } }), MO, "F", [P_OHNE], opts())).toEqual([]);
  });
});

describe("Review-Auflage 1: nur ableiten, was die Rolle vom Server bekommt", () => {
  const opts = (extra = {}) => ({ auswerten, stand: kompetenzStand, module: AKTIV, ...extra });
  it("Personen ohne ausgelieferte Kompetenznachweise sind unbekannt — keine Merkmale, nicht „fehlt“", () => {
    const ohne = { id: "x", vorname: "V", nachname: "x", status: "aktiv" };       // kompetenzNachweise nicht ausgeliefert
    expect(anlagenMerkmale(betrieb(), ohne, MO, kompetenzStand)).toBeNull();
    expect(anlagenMerkmale(betrieb(), { ...ohne, kompetenzNachweise: [] }, MO, kompetenzStand)).toEqual([]);
    const mx2 = qualifikationsMatrix({ ...betrieb(), personen: [ohne] }, MO, kompetenzStand);
    expect(mx2.zeilen[0].zellen.bm1).toEqual({ stand: "unbekannt", bis: null, kompetenzId: null });
  });
  it("Sicht einer Beschäftigten: die Kolleginnen sind unbekannt, es gibt keinen Fehlalarm und keinen Aufschluss über Dritte", () => {
    const g = branchenbestand({ pakete: ["industrie"], branchenmodule: { anlagen: { an: true }, maschinenqual: { an: true } } });
    Object.assign(g.mandanten[0], { betriebsmittel: [PRESSE], kompetenzen: [K_PRESSE], dienstarten: betrieb().dienstarten });
    for (const p of g.mandanten[0].personen) p.kompetenzNachweise = p.id === "a1" ? [{ kompetenzId: "k1", ab: "2026-06-01" }] : [];
    const sicht = bestandFuerRolle(g, SITZUNGEN.MA).mandanten[0];
    const fremd = sicht.personen.filter((p) => p.id !== "a1");
    expect(fremd.some((p) => Array.isArray(p.kompetenzNachweise))).toBe(false);          // Positivkatalog
    const b = maschinenqualBefunde(sicht, MO, "F", sicht.personen.filter((p) => ["a1", "p1", "l1"].includes(p.id)), opts());
    for (const x of b) { expect(x.stufe).toBe("hinweis"); expect(x.offen, x.text).toBe(true); }
  });
  it("Matrix zeigt Unbekanntes als „nicht bewertbar“", () => {
    const html = renderToStaticMarkup(h(QualifikationsMatrix, { m: { ...betrieb(), personen: [{ id: "x", vorname: "V", nachname: "x" }] }, datum: MO, stand: kompetenzStand }));
    expect(html).toContain("nicht bewertbar");
  });
});

describe("Review-Auflage 2: Altbestand blockiert nicht", () => {
  it("ein unveränderter fehlerhafter Eintrag wird toleriert, ein geänderter oder neuer streng geprüft", () => {
    const alt = { kompetenzen: [{ ...K_PRESSE, befaehigtePerson: "ja" }] };
    expect(maschinenqualZusammen(alt, alt).grund).toBeUndefined();
    expect(maschinenqualZusammen({ kompetenzen: [{ ...K_PRESSE, befaehigtePerson: "nein" }] }, alt).grund).toMatch(/befähigte/i);
    expect(maschinenqualZusammen({ kompetenzen: [...alt.kompetenzen, { ...K_PRESSE, id: "k9", befaehigtePerson: 3 }] }, alt).grund).toMatch(/befähigte/i);
  });
});

describe("Schreibweg (Server)", () => {
  it("WP-19 B1: bei Status „geplant“ speichert keine Rolle eine Maschinenkompetenz; Kompetenzen ohne Modulteil bleiben frei", () => {
    const g = branchenbestand({ pakete: ["industrie"], branchenmodule: schalterAn("anlagen", "maschinenqual") });
    for (const r of ["LT", "KD", "PL"]) expect(schreibeAls(g, r, (m) => { m.kompetenzen = [{ ...K_PRESSE, befaehigtePerson: true }]; }).verweigert, r).toMatch(/wirkt in diesem Betrieb nicht/);
    const { befaehigtePerson: _b, ...ohne } = { ...K_PRESSE, id: "k-kern", betriebsmittelId: null }; void _b;
    expect(schreibeAls(g, "LT", (m) => { m.kompetenzen = [ohne]; }).verweigert).toBeFalsy();
  });
  it("fehlerhafte Kompetenzfelder werden abgewiesen, gültige gespeichert (Prüfmodus „vorlaeufig“, Module an)", () => {
    expect(maschinenqualZusammen({ kompetenzen: [K_PRESSE, K_TOR] }).grund).toBeUndefined();
    const g = branchenbestand({ pakete: ["industrie"], branchenmodule: schalterAn("anlagen", "maschinenqual") });
    const liste = vorlaeufigListe("anlagen", "maschinenqual");
    const falsch = schreibeAls(g, "LT", (m) => { m.kompetenzen = [{ ...K_PRESSE, befaehigtePerson: 1 }]; }, { liste });
    expect(falsch.verweigert).toMatch(/befähigte/i);
    const gut = schreibeAls(g, "LT", (m) => { m.kompetenzen = [{ ...K_PRESSE, befaehigtePerson: true }]; }, { liste });
    expect(gut.verweigert).toBeFalsy();
  });
});

describe("Oberfläche", () => {
  it("die Matrix zeigt Anlagen als Spalten und Stände in Worten", () => {
    const html = renderToStaticMarkup(h(QualifikationsMatrix, { m: betrieb(), datum: MO, stand: kompetenzStand }));
    expect(html).toContain("Presse 1");
    expect(html).toContain("abgelaufen");
    expect(html).toContain("nicht hinterlegt");
    expect(html).toContain("<table");
  });
});
