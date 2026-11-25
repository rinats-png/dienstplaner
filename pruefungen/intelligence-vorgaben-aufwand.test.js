/* ==========================================================================
   WP-I4 Teil 3, Review-Nachbesserung #561 — Aufwandsdeckel, Wiederherstellen, Löschbarkeit

   Befund 1 (DoS): Parameter, die Beispielfälle in Parametergröße erzeugen, sind hart begrenzt (pruefeVorgabe), zusätzlich
   gilt je Anfrage ein kumuliertes Aufwandsbudget und ein Zeitbudget vor und während der Testläufe.
   Befund 2: Wiederherstellen übernimmt Vorgaben nicht aus der Sicherung (gilt weiter wie heute), mit Protokollzeile.
   Befund 3: Löschen nur für einen Entwurf ohne Aktivierungsmarke; Deaktivieren trägt eine fehlende Marke nach.
   Synthetische Daten.
   ========================================================================== */
import { describe, it, expect } from "vitest";
import {
  pruefeVorgabe, vorgabeTestlauf, vorgabenZusammen, beispielFaelle, VORGABEN_PARAMETER_GRENZE, VORGABEN_AUFWAND_JE_ANFRAGE,
} from "../server/lib/vorgaben.mjs";
import { betriebWiederherstellen } from "../server/lib/sicherungen.mjs";

const JETZT = "2026-11-25T08:00:00.000Z";
const ktx = (extra = {}) => ({ darfOrgEdit: true, person: "l1", tarif: "enterprise", jetzt: JETZT, ...extra });
const basis = (id, regelart, parameter, extra = {}) => ({ id, name: `Vorgabe ${id}`, regelart, parameter, geltung: { art: "betrieb" }, bezug: "monat",
  staerke: "muss", prioritaet: 1, grundlage: { art: "hausregel" }, status: "entwurf", ...extra });
const ZAEHL = (g, extra) => basis("z", "zaehlregel", { ereignis: "Nachtdienst", fenster: { art: "kalendermonat" }, richtung: "hoechstens", grenze: g }, extra);
const MUSTER = (max, danachFrei, extra) => basis("m", "musterregel", { art: "hoechstensFolge", klassen: ["N"], max, danachFrei }, extra);
const BESETZ = (min, extra) => basis("b", "besetzungsregel", { anforderungen: [{ art: "anzahl", min }] }, extra);
const PAAR = (min, extra) => basis("p", "paarregel", { wenn: "a", dann: "b", min }, extra);
const PFAD = { z: ZAEHL, m: (x, e) => MUSTER(x, 0, e), md: (x, e) => MUSTER(2, x, e), b: BESETZ, p: PAAR };
const WERTE = [1e5, 1e9, 1e15, NaN, Infinity, -Infinity, -1, -1e9, 2.5, 1e5 + 0.5];

describe("Befund 1: Parameter hart begrenzt, schnell abgewiesen", () => {
  it("die Grenzen sind benannte Konstanten", () => {
    expect(VORGABEN_PARAMETER_GRENZE).toMatchObject({ zaehlGrenze: 366, folgeMax: 366, danachFrei: 366, personen: 300 });
  });
  it("große, nicht endliche, negative und gebrochene Größen werden in unter 200 ms abgewiesen", () => {
    const t0 = performance.now();
    for (const [k, f] of Object.entries(PFAD)) {
      for (const w of WERTE) {
        expect(pruefeVorgabe(f(w)), `${k} ${w}`).toMatch(/Vorgabe/);
        expect(vorgabeTestlauf(f(w)).ok, `${k} ${w} Testlauf`).toBe(false);
      }
    }
    expect(performance.now() - t0).toBeLessThan(200);
  });
  it("die Obergrenze selbst und gewöhnliche Werte bleiben gültig", () => {
    expect(pruefeVorgabe(ZAEHL(366))).toBeNull();
    expect(pruefeVorgabe(ZAEHL(0))).toBeNull();
    expect(pruefeVorgabe(MUSTER(366, 366))).toBeNull();
    expect(pruefeVorgabe(BESETZ(300))).toBeNull();
    expect(pruefeVorgabe(PAAR(300))).toBeNull();
    expect(vorgabeTestlauf(BESETZ(300)).ok).toBe(true);
    expect(vorgabeTestlauf(PAAR(300)).ok).toBe(true);
    expect(vorgabeTestlauf(ZAEHL(5)).ok).toBe(true);
    expect(pruefeVorgabe(ZAEHL(367))).toMatch(/höchstens/);
  });
  it("Beispielfälle bleiben auch ohne Prüfung klein (Selbstschutz der Erzeugung)", () => {
    const t0 = performance.now();
    for (const w of [1e9, 1e15, Infinity]) {
      expect(beispielFaelle(ZAEHL(w))).toBeNull();
      expect(beispielFaelle(MUSTER(w, 0))).toBeNull();
      expect(beispielFaelle(BESETZ(w))).toBeNull();
      expect(beispielFaelle(PAAR(w))).toBeNull();
    }
    expect(performance.now() - t0).toBeLessThan(200);
  });
  it("über den Schreibweg: riesige aktive Vorgaben werden schnell abgewiesen, 200 auf einmal ebenso", () => {
    const t0 = performance.now();
    const viele = Array.from({ length: 200 }, (_, i) => ZAEHL(1e9, { id: `v${i}`, status: "aktiv" }));
    const r = vorgabenZusammen({}, { vorgaben: viele }, ktx());
    expect(r.grund).toMatch(/Vorgabe/);
    expect(performance.now() - t0).toBeLessThan(200);
  });
});

describe("Befund 1: kumuliertes Budget je Anfrage", () => {
  const maximal = (i) => BESETZ(300, { id: `v${i}`, status: "aktiv" });   // größte Besetzungsvorgabe, die ihren Test besteht
  it("viele maximal große, gültige Vorgaben in einer Anfrage überschreiten das Aufwandsbudget und werden mit Text abgewiesen", () => {
    const n = Math.ceil(VORGABEN_AUFWAND_JE_ANFRAGE / 600) + 5;
    const t0 = performance.now();
    const r = vorgabenZusammen({}, { vorgaben: Array.from({ length: n }, (_, i) => maximal(i)) }, ktx());
    expect(r.grund).toMatch(/Rechenaufwand/);
    expect(r.mandant).toBeUndefined();
    expect(performance.now() - t0).toBeLessThan(500);
  });
  it("eine überschaubare Anzahl derselben Vorgaben geht durch", () => {
    expect(vorgabenZusammen({}, { vorgaben: [maximal(1), maximal(2)] }, ktx()).grund).toBeUndefined();
  });
  it("das Zeitbudget bricht ab, bevor der nächste Testlauf beginnt", () => {
    const r = vorgabenZusammen({}, { vorgaben: [maximal(1), maximal(2)] }, ktx({ zeitBudgetMs: 0 }));
    expect(r.grund).toMatch(/zu lange/);
  });
  it("Entwürfe zählen nicht zum Budget", () => {
    const entwuerfe = Array.from({ length: 100 }, (_, i) => MUSTER(366, 366, { id: `e${i}`, status: "entwurf" }));
    expect(vorgabenZusammen({}, { vorgaben: entwuerfe }, ktx()).grund).toBeUndefined();
  });
});

describe("Befund 3: Löschbarkeit", () => {
  const stempel = { version: 1, geaendertAm: "2026-11-01T00:00:00.000Z", geaendertVon: "l1" };
  const alt = (vorgaben) => ({ vorgaben, personen: [], einheiten: [] });
  const G = (id, status, extra = {}) => basis(id, "grenzregel", { groesse: "Überstunden", hoechstens: 10 }, { status, ...extra });
  it("Altbestand inaktiv ohne Aktivierungsmarke lässt sich nicht löschen", () => {
    const r = vorgabenZusammen(alt([{ ...G("i", "inaktiv"), ...stempel }]), { vorgaben: [] }, ktx());
    expect(r.grund).toMatch(/deaktiv/i);
  });
  it("ein nie aktiver Entwurf bleibt löschbar", () => {
    const r = vorgabenZusammen(alt([{ ...G("e", "entwurf"), ...stempel }]), { vorgaben: [] }, ktx());
    expect(r.grund).toBeUndefined();
  });
  it("Deaktivieren trägt eine fehlende Aktivierungsmarke aus dem Vorzustand nach; danach ist Löschen gesperrt", () => {
    const a = alt([{ ...G("a", "aktiv"), ...stempel }]);
    const aus = vorgabenZusammen(a, { vorgaben: [{ ...G("a", "inaktiv"), ...stempel }] }, ktx());
    expect(aus.grund).toBeUndefined();
    expect(aus.mandant.vorgaben[0].aktiviertAm).toBe("2026-11-01T00:00:00.000Z");
    expect(vorgabenZusammen(aus.mandant, { vorgaben: [] }, ktx()).grund).toMatch(/deaktiv/i);
  });
  it("Deaktivieren ohne jede Marke im Vorzustand setzt die Zeit des Deaktivierens", () => {
    const aus = vorgabenZusammen(alt([G("a", "aktiv")]), { vorgaben: [G("a", "inaktiv")] }, ktx());
    expect(aus.mandant.vorgaben[0].aktiviertAm).toBe(JETZT);
  });
});

describe("Befund 2: Wiederherstellen übernimmt Vorgaben nicht aus der Sicherung", () => {
  const person = (id, rolle) => ({ id, vorname: id, nachname: id, rolle, bereich: "ALLE", zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }] });
  const G = (id, status, extra = {}) => basis(id, "grenzregel", { groesse: "Überstunden", hoechstens: 10 }, { status, version: 1, geaendertAm: "x", geaendertVon: "l1", ...extra });
  const raum = (vorgaben, einstellungen) => ({ version: 9, stand: 7, session: null, protokoll: [], tarife: [{ id: "pro" }], rechnungen: [], betreiber: {},
    mandanten: [{ id: "m-b", name: "Lindenhof", personen: [person("b-l", "leitung")], dienstarten: [{ id: "F" }], abweichungen: {}, protokoll: [], aenderungen: [],
      status: "aktiv", tarif: "pro", preisgestaltung: { sonderpreis: null }, ...(vorgaben ? { vorgaben } : {}), ...(einstellungen ? { einstellungen } : {}) }] });
  const L = { rolle: "leitung", person: "b-l", betrieb: 0 };
  const zurueck = (jetzt, sichVorgaben, sichEinst) => {
    const sich = JSON.parse(JSON.stringify(raum(sichVorgaben, sichEinst).mandanten[0]));
    return betriebWiederherstellen(jetzt, { umfang: "betrieb", mandantId: "m-b", mandant: sich, erzeugt: "2026-10-10T08:00:00Z" }, L,
      { marke: "x", heute: new Date("2026-10-18T10:00:00Z"), datenschutz: "aus" });
  };
  it("die heutigen Vorgaben und das Protokoll bleiben; Aktives und Ungetestetes der Sicherung kommen nicht zurück", () => {
    const protokoll = [{ art: "vorgabe-aktiviert", modul: "vorgaben", regelId: "VORGABE-A", am: "2026-11-01T00:00:00.000Z", von: "l1", version: 1 }];
    const heute = [G("a", "inaktiv", { aktiviertAm: "2026-11-01T00:00:00.000Z" })];
    const sicherung = [G("a", "aktiv"), G("neu", "aktiv", { regelart: "zaehlregel", parameter: { ereignis: "x", fenster: { art: "kalendermonat" }, richtung: "hoechstens", grenze: 1e9 } })];
    const r = zurueck(raum(heute, { modulprotokoll: protokoll }), sicherung, { modulprotokoll: [] });
    const m = r.bestand.mandanten[0];
    expect(m.vorgaben).toEqual(heute);
    expect(m.einstellungen.modulprotokoll).toEqual(protokoll);
    expect(m.protokoll[0].text).toMatch(/Vorgaben.*aktuellen Stand/);
  });
  it("hat der Betrieb heute keine Vorgaben, kommen auch keine aus der Sicherung", () => {
    const r = zurueck(raum(undefined), [G("a", "aktiv")]);
    expect("vorgaben" in r.bestand.mandanten[0]).toBe(false);
    expect(r.bestand.mandanten[0].protokoll[0].text).toMatch(/Vorgaben/);
  });
  it("gleiche Vorgaben in Sicherung und heute: keine Auslassungszeile", () => {
    const v = [G("a", "entwurf")];
    const r = zurueck(raum(v), v);
    expect(r.bestand.mandanten[0].vorgaben).toEqual(v);
    expect(r.bestand.mandanten[0].protokoll[0].text).not.toMatch(/Vorgaben/);
  });
});
