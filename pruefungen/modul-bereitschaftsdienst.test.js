/* ==========================================================================
   MODUL BEREITSCHAFTSDIENST — Stufen, Inanspruchnahme, Anrechnung (WP-19, Strang B)

   Vorläufig nach der Entscheidungsmatrix: Stufen mit Faktor aus dem Tarif
   (R1 a), Arbeitszeit und Vergütung getrennt (R2 c), Rufbereitschaft eigene
   Art (R4 a), Höchstarbeitszeit nur mit Vorgabe des Betriebs (R4). Das Modul
   bleibt „geplant“.
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  BEREITSCHAFT_ARTEN, pruefeBereitschaftStufe, pruefeBereitschaftEintrag, bereitschaftAnrechnung, bereitschaftHoechstBefunde,
  bereitschaftZusammen, wochenSchluessel, fensterMinuten, BEREITSCHAFT_GRENZEN,
} from "../server/lib/modul-bereitschaftsdienst.mjs";
import { BRANCHENMODULE, modulVon, pruefeModulRegistry, pruefeModulStatus } from "../server/lib/branchenmodule.mjs";
import { REGELN_BRANCHEN, pruefeBranchenkatalog } from "../server/lib/branchenkatalog.mjs";
import { BETRIEB } from "../server/lib/sicht.mjs";
import { pruefeRegister } from "../src/regelregister.js";
import { BereitschaftsUebersicht } from "../src/module/bereitschaftsdienst.jsx";

const STUFE_B = { id: "B", name: "Stufe B", art: "bereitschaft", faktor: 0.25, quelle: "Tarif X § 12 (Fassung 2026)" };
const STUFE_R = { id: "R", name: "Rufbereitschaft", art: "rufbereitschaft", faktor: 0.125, quelle: "Tarif X § 13" };
const STUFE_OHNE = { id: "O", name: "ohne Tarifwert", art: "bereitschaft", faktor: null };
const STUFEN = [STUFE_B, STUFE_R, STUFE_OHNE];
const AKTIV = BRANCHENMODULE.map((x) => (x.id === "bereitschaftsdienst" ? { ...x, status: "vorlaeufig" } : x));
const betrieb = ({ an = true, grenze = 0, bereitschaft = {} } = {}) => ({
  id: "b1", pakete: ["klinik"], bereitschaftStufen: STUFEN, bereitschaft,
  einstellungen: { branchenmodule: an ? { bereitschaftsdienst: { an: true, parameter: { hoechstArbeitszeitStunden: grenze } } } : {} },
});
const TAG = "2026-11-02";
const DIENST = (extra = {}) => ({ stufe: "B", beginn: "16:00", ende: "08:00", ...extra });

describe("Registry, Katalog und Felder", () => {
  it("Modul „geplant“ mit Klinik, Sach- und Personenfeld, Regel und Vorgabe 0 (aus)", () => {
    expect(modulVon("bereitschaftsdienst")).toMatchObject({ pakete: ["klinik"], status: "geplant",
      datenfelder: ["bereitschaftStufen", "bereitschaft"], sachfelder: ["bereitschaftStufen"], personenfelder: ["bereitschaft"],
      regelIds: ["BEREIT-HOECHST-01"] });
    expect(modulVon("bereitschaftsdienst").parameter.hoechstArbeitszeitStunden).toMatchObject({ standard: 0, min: 0 });
    expect(pruefeModulRegistry()).toEqual([]);
    expect(pruefeBranchenkatalog()).toEqual([]);
    expect(pruefeRegister()).toEqual([]);
  });
  it("beide Felder stehen im Positivkatalog, fail-closed", () => {
    expect(BETRIEB.bereitschaftStufen).toEqual(["weg", "weg"]);
    expect(BETRIEB.bereitschaft).toEqual(["weg", "weg"]);
  });
  it("Datenschutzgate: mit Personenfeld, Sachfeld, Ausnahmeweg und Schema verlässt das Modul „geplant“ ohne Befund", () => {
    const abgenommen = { ...modulVon("bereitschaftsdienst"), status: "vorlaeufig", abnahme: { datum: "2026-12-01", nachweis: "docs/acc45/x.md" } };
    expect(pruefeModulStatus([abgenommen])).toEqual([]);
    expect(pruefeModulStatus([{ ...abgenommen, berichtigungsWerte: undefined }]).join()).toMatch(/Wertschema/);
  });
  it("die Höchstarbeitsregel steht ohne Zahl im Code (Grenze kommt vom Betrieb)", () => {
    const r = REGELN_BRANCHEN.find((x) => x.id === "BEREIT-HOECHST-01");
    expect(r).toMatchObject({ modul: "bereitschaftsdienst", pruefstatus: "provisional", hoechsteStufe: "hinweis" });
    expect(r.parameter.hoechstens).toBeUndefined();
    expect(r.parameter.grenzeAus).toBe("modulParameter.hoechstArbeitszeitStunden");
  });
});

describe("Stufen (R1 a)", () => {
  it("gültige Stufe, auch ohne Tarifwert (Faktor leer = ungeklärt)", () => {
    expect(pruefeBereitschaftStufe(STUFE_B)).toBeNull();
    expect(pruefeBereitschaftStufe(STUFE_OHNE)).toBeNull();
  });
  it("Art, Faktor und Kennung werden geprüft", () => {
    expect(pruefeBereitschaftStufe({ ...STUFE_B, art: "ruhezeit" })).toMatch(/Art/);
    expect(pruefeBereitschaftStufe({ ...STUFE_B, faktor: 1.5 })).toMatch(/Faktor/);
    expect(pruefeBereitschaftStufe({ ...STUFE_B, faktor: -0.1 })).toMatch(/Faktor/);
    expect(pruefeBereitschaftStufe({ ...STUFE_B, faktor: "0,25" })).toMatch(/Faktor/);
    expect(pruefeBereitschaftStufe({ id: "", name: "x", art: "bereitschaft" })).toMatch(/Kennung/);
    expect(pruefeBereitschaftStufe({ ...STUFE_B, geheim: 1 })).toMatch(/unbekannte Felder/);
    expect(pruefeBereitschaftStufe({ ...STUFE_B, name: "x".repeat(61) })).toMatch(/Name/);
    expect(pruefeBereitschaftStufe(STUFE_B, [STUFE_B, { ...STUFE_R, id: "B" }])).toMatch(/doppelt/);
  });
});

describe("Dienst je Person und Tag (Eingabe)", () => {
  it("ein Dienst über Mitternacht ist gültig; ohne Dauer nicht", () => {
    expect(pruefeBereitschaftEintrag(DIENST(), STUFEN)).toBeNull();
    expect(fensterMinuten("16:00", "08:00")).toBe(960);
    expect(pruefeBereitschaftEintrag(DIENST({ ende: "16:00" }), STUFEN)).toMatch(/keine Dauer/);
  });
  it("unbekannte Stufe, Zeitform und Felder werden abgewiesen", () => {
    expect(pruefeBereitschaftEintrag(DIENST({ stufe: "X" }), STUFEN)).toMatch(/Stufe unbekannt/);
    expect(pruefeBereitschaftEintrag(DIENST({ beginn: "25:00" }), STUFEN)).toMatch(/HH:MM/);
    expect(pruefeBereitschaftEintrag(DIENST({ geheim: 1 }), STUFEN)).toMatch(/unbekannte Felder/);
    expect(pruefeBereitschaftEintrag("x", STUFEN)).toMatch(/Dienst/);
  });
  it("Inanspruchnahme liegt innerhalb des Fensters, Ende nach Beginn, Höchstzahl", () => {
    const ok = DIENST({ inanspruchnahmen: [{ von: "23:00", bis: "23:30" }, { von: "02:00", bis: "03:00" }] });
    expect(pruefeBereitschaftEintrag(ok, STUFEN)).toBeNull();
    expect(pruefeBereitschaftEintrag(DIENST({ inanspruchnahmen: [{ von: "07:00", bis: "09:00" }] }), STUFEN)).toMatch(/außerhalb/);
    expect(pruefeBereitschaftEintrag(DIENST({ inanspruchnahmen: [{ von: "10:00", bis: "10:00" }] }), STUFEN)).toMatch(/nach dem Beginn/);
    expect(pruefeBereitschaftEintrag(DIENST({ inanspruchnahmen: [{ von: "10:00" }] }), STUFEN)).toMatch(/\{ von, bis \}/);
    expect(pruefeBereitschaftEintrag(DIENST({ inanspruchnahmen: Array(BEREITSCHAFT_GRENZEN.inanspruchnahmen + 1).fill({ von: "17:00", bis: "17:10" }) }), STUFEN)).toMatch(/höchstens/);
  });
});

describe("Anrechnung: Arbeitszeit und Vergütung getrennt (R2 c, R4 a)", () => {
  it("Bereitschaft: Arbeitszeit ist die volle Dauer, die Vergütung folgt dem Faktor", () => {
    const a = bereitschaftAnrechnung(DIENST(), STUFE_B);
    expect(a).toEqual({ dauerMinuten: 960, arbeitszeitMinuten: 960, verguetungsMinuten: 240, status: "ok" });
  });
  it("Faktor 0 verkürzt die Arbeitszeit nicht", () => {
    const a = bereitschaftAnrechnung(DIENST(), { ...STUFE_B, faktor: 0 });
    expect(a.arbeitszeitMinuten).toBe(960);
    expect(a.verguetungsMinuten).toBe(0);
  });
  it("Rufbereitschaft: Arbeitszeit ist nur die Inanspruchnahme, die Vergütung die Dauer mal Faktor", () => {
    const a = bereitschaftAnrechnung(DIENST({ stufe: "R", inanspruchnahmen: [{ von: "23:00", bis: "00:30" }, { von: "02:00", bis: "02:45" }] }), STUFE_R);
    expect(a.arbeitszeitMinuten).toBe(90 + 45);
    expect(a.verguetungsMinuten).toBe(120);
  });
  it("ohne Tarifwert: Vergütung ungeklärt (null), nie 0", () => {
    const a = bereitschaftAnrechnung(DIENST({ stufe: "O" }), STUFE_OHNE);
    expect(a).toMatchObject({ verguetungsMinuten: null, status: "ungeklaert", arbeitszeitMinuten: 960 });
  });
  it("Arten sind genau Bereitschaft und Rufbereitschaft", () => {
    expect(BEREITSCHAFT_ARTEN).toEqual(["bereitschaft", "rufbereitschaft"]);
  });
});

describe("Höchstarbeitszeit als Hinweis (R4)", () => {
  // 16:00–08:00 = 16 h je Dienst; zwei Dienste derselben Woche = 32 h
  const zwei = { "p1|2026-11-02": DIENST(), "p1|2026-11-03": DIENST() };
  it("ohne Vorgabe des Betriebs (0) keine Prüfung", () => {
    expect(bereitschaftHoechstBefunde(betrieb({ grenze: 0, bereitschaft: zwei }), { module: AKTIV })).toEqual([]);
  });
  it("über der Vorgabe: ein Hinweis je Person und Woche, sperrt nie", () => {
    const b = bereitschaftHoechstBefunde(betrieb({ grenze: 24, bereitschaft: zwei }), { module: AKTIV });
    expect(b).toHaveLength(1);
    expect(b[0]).toMatchObject({ regel: "branche", regelId: "BEREIT-HOECHST-01", modul: "bereitschaftsdienst", stufe: "hinweis", art: "branche" });
    expect(b[0].text).toMatch(/32 Stunden/);
  });
  it("unter der Vorgabe oder in zwei Wochen: kein Hinweis", () => {
    expect(bereitschaftHoechstBefunde(betrieb({ grenze: 40, bereitschaft: zwei }), { module: AKTIV })).toEqual([]);
    const zwoWochen = { "p1|2026-11-02": DIENST(), "p1|2026-11-09": DIENST() };
    expect(bereitschaftHoechstBefunde(betrieb({ grenze: 24, bereitschaft: zwoWochen }), { module: AKTIV })).toEqual([]);
  });
  it("ohne eingeschaltetes Modul kein Hinweis", () => {
    expect(bereitschaftHoechstBefunde(betrieb({ an: false, grenze: 24, bereitschaft: zwei }))).toEqual([]);
  });
  it("Wochenschlüssel ist der Montag der ISO-Woche", () => {
    expect(wochenSchluessel("2026-11-02")).toBe("2026-11-02");
    expect(wochenSchluessel("2026-11-08")).toBe("2026-11-02");
    expect(wochenSchluessel("2026-11-09")).toBe("2026-11-09");
  });
});

describe("Schreibweg-Vertrag", () => {
  it("gültige Stufen und Dienste bestehen, ungültige werden mit Grund abgewiesen", () => {
    expect(bereitschaftZusammen({ bereitschaftStufen: STUFEN, bereitschaft: { "p1|2026-11-02": DIENST() } })).toEqual({});
    expect(bereitschaftZusammen({ bereitschaftStufen: [{ ...STUFE_B, faktor: 9 }] }).grund).toMatch(/Faktor/);
    expect(bereitschaftZusammen({ bereitschaftStufen: STUFEN, bereitschaft: { "p1": DIENST() } }).grund).toMatch(/Schlüssel/);
    expect(bereitschaftZusammen({ bereitschaftStufen: STUFEN, bereitschaft: { "p1|2026-11-02": DIENST({ stufe: "X" }) } }).grund).toMatch(/Stufe/);
    expect(bereitschaftZusammen({ bereitschaft: [DIENST()] }).grund).toMatch(/Form/);
    expect(bereitschaftZusammen(null)).toEqual({});
  });
});

describe("Darstellung", () => {
  const m = betrieb({ bereitschaft: { "pers-x|2026-11-02": DIENST({ inanspruchnahmen: [{ von: "02:00", bis: "03:00" }] }),
    "pers-y|2026-11-02": DIENST({ stufe: "O" }) } });
  it("zeigt Stufe, Arbeitszeit, Vergütung und „ungeklärt“, ohne Kennungen", () => {
    const html = renderToStaticMarkup(h(BereitschaftsUebersicht, { m, datum: TAG, personen: { "pers-x": "Anna" } }));
    expect(html).toMatch(/Stufe B/);
    expect(html).toMatch(/Arbeitszeit 16 h/);
    expect(html).toMatch(/Vergütung 4 h/);
    expect(html).toMatch(/Vergütung ungeklärt/);
    expect(html).toMatch(/Anna/);
    expect(html).not.toMatch(/pers-x|pers-y/);
  });
  it("ohne Dienst am Tag: Leerhinweis", () => {
    expect(renderToStaticMarkup(h(BereitschaftsUebersicht, { m, datum: "2026-12-24" }))).toMatch(/Keine Bereitschaft/);
  });
});
