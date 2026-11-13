/* ==========================================================================
   WP-I4 — INTERNE VORGABEN: VERWALTUNG (Block K)

   Prüft die Verwaltung der Vorgaben, nicht ihre Wirkung im Plan (das ist WP-I5):
     - Form und Parameter (der Regelbaukasten ist der Prüfer),
     - Umsetzung in ein Regelobjekt: nur aktive Vorgaben wirken, Muss/Soll/Wunsch,
     - Testlauf mit Beispielfällen für alle Regelarten,
     - Stufengrenzen 5/25/unbegrenzt (E-21),
     - Rechte über den Schreib- und Lesepfad (nur org.edit: Leitung, Kundenrolle; für alle anderen
       Rollen ist das Feld unsichtbar und ein mitgeschicktes Feld wirkungslos), Wann/Wer/Version vom Server,
     - Sicht: Planung, Schichtverantwortung, Beschäftigte und Betriebsrat nichts (keine Lesesicht des
       Betriebsrats: offene Mitbestimmungsfrage),
     (Die Wege über den echten Handler: intelligence-vorgaben-wege.test.js.)
     - Formularfelder ↔ Parameter.
   Alle Daten synthetisch.
   ========================================================================== */
import { describe, it, expect } from "vitest";
import {
  pruefeVorgabe, vorgabeAlsRegel, vorgabeTestlauf, beispielFaelle, vorgabenGrenze, vorgabenZusammen, aktiveVorgaben,
  PARAMETER_FELDER, felderAusParametern, parameterAusFeldern, VORGABEN_REGELARTEN, VORGABEN_STUFENGRENZE,
} from "../server/lib/vorgaben.mjs";
import { pruefeRegel } from "../server/lib/regelbaukasten-erweitert.mjs";
import { bestandFuerRolle } from "../server/lib/rechte.mjs";
import { branchenbestand, schreibeAls, SITZUNGEN } from "./hilfen/branchenbetrieb.mjs";

const kopie = (x) => JSON.parse(JSON.stringify(x));

/* Je Regelart eine gültige Vorgabe. */
const BASIS = { geltung: { art: "betrieb" }, bezug: "monat", staerke: "muss", prioritaet: 1, grundlage: { art: "hausregel" }, status: "entwurf" };
const V = {
  zaehlregel: { id: "freie-we", name: "Freie Wochenenden", regelart: "zaehlregel", parameter: { ereignis: "freies Wochenende", fenster: { art: "kalendermonat" }, richtung: "mindestens", grenze: 2 } },
  grenzregel: { id: "ueberstunden", name: "Überstunden", regelart: "grenzregel", parameter: { groesse: "Überstunden im Monat", hoechstens: 10 } },
  besetzungsregel: { id: "fachkraft-frueh", name: "Fachkraft im Frühdienst", regelart: "besetzungsregel", parameter: { anforderungen: [{ art: "anzahlMit", merkmal: "fachkraft", min: 1 }] } },
  paarregel: { id: "azubi-paar", name: "Auszubildende nie allein", regelart: "paarregel", parameter: { wenn: "azubi", dann: "fachkraft", min: 1 } },
  musterregel: { id: "nach-nacht", name: "Nach Nachtdienst kein Frühdienst", regelart: "musterregel", parameter: { art: "verbotenFolge", von: ["N"], dann: ["F"] } },
  blockregel: { id: "we-block", name: "Wochenende gleiche Dienstart", regelart: "blockregel", parameter: { wochentage: [5, 6], gruppen: { F: "tag", S: "tag" } } },
  verteilungsregel: { id: "naechte-gleich", name: "Nächte gleichmäßig", regelart: "verteilungsregel", parameter: { groesse: "Nächte im Quartal", maxAbweichung: 1 } },
  wunschregel: { id: "dienstag-frei", name: "Dienstag frei", regelart: "wunschregel", staerke: "wunsch", parameter: { wunsch: "frei", wochentage: [1] } },
};
const vorgabe = (art, extra = {}) => ({ ...BASIS, ...V[art], ...extra });

describe("Form und Parameter", () => {
  it("jede der acht Regelarten hat eine gültige Beispielvorgabe", () => {
    expect(Object.keys(V).sort()).toEqual([...VORGABEN_REGELARTEN].sort());
    for (const art of VORGABEN_REGELARTEN) expect(pruefeVorgabe(vorgabe(art)), art).toBeNull();
  });
  it("weist Unvollständiges und Unbekanntes ab", () => {
    const f = (aendern, muster) => { const v = kopie(vorgabe("zaehlregel")); aendern(v); expect(pruefeVorgabe(v)).toMatch(muster); };
    f((v) => { v.name = ""; }, /Name/);
    f((v) => { v.id = "Gross Buchstabe"; }, /Kennung/);
    f((v) => { v.regelart = "magie"; }, /Regelart/);
    f((v) => { v.staerke = "vielleicht"; }, /Stärke/);
    f((v) => { v.prioritaet = 0; }, /Priorität/);
    f((v) => { v.prioritaet = 1.5; }, /Priorität/);
    f((v) => { v.bezug = "jahr"; }, /Bezugszeitraum/);
    f((v) => { v.status = "geloescht"; }, /Status/);
    f((v) => { v.gueltigAb = "2026-02-30"; }, /Datum/);
    f((v) => { v.gueltigAb = "2026-05-01"; v.gueltigBis = "2026-04-01"; }, /nach gültig bis/);
    f((v) => { v.geltung = { art: "einheit" }; }, /Einheit/);
    f((v) => { v.geltung = { art: "gruppe", gruppen: [] }; }, /Gruppe/);
    f((v) => { v.geltung = { art: "personen" }; }, /Person/);
    f((v) => { v.geltung = { art: "betrieb", extra: 1 }; }, /unbekannte/);
    f((v) => { v.grundlage = { art: "bauchgefuehl" }; }, /Grundlage/);
    f((v) => { v.ausnahmen = { zeitraeume: [{ von: "2026-02-01", bis: "2026-01-01" }] }; }, /Zeiträume/);
    f((v) => { v.ausnahmen = { teilzeitAnteilig: "ja" }; }, /Teilzeit/);
    f((v) => { v.unbekannt = 1; }, /unbekannte Felder/);
    f((v) => { v.parameter = { ereignis: "x" }; }, /unvollständige Parameter/);
    f((v) => { v.parameter = "text"; }, /Parameter/);
  });
  it("Personenmerkmale in Name, Beschreibung, Gruppe und Parametern werden abgewiesen (Plan 6.3)", () => {
    expect(pruefeVorgabe(vorgabe("zaehlregel", { name: "Keine Krankheitstage" }))).toMatch(/Personenmerkmal/);
    expect(pruefeVorgabe(vorgabe("zaehlregel", { beschreibung: "Wer viele Fehlzeiten hat" }))).toMatch(/Personenmerkmal/);
    expect(pruefeVorgabe(vorgabe("zaehlregel", { geltung: { art: "gruppe", gruppen: ["Leistungsträger"] } }))).toMatch(/Personengruppen/);
    expect(pruefeVorgabe(vorgabe("grenzregel", { parameter: { groesse: "Fehlzeit", hoechstens: 3 } }))).toMatch(/Personenmerkmal/);
  });
  it("gültige Geltung, Ausnahmen und Fundstelle", () => {
    expect(pruefeVorgabe(vorgabe("zaehlregel", { geltung: { art: "gruppe", gruppen: ["Vollzeit"] },
      ausnahmen: { personen: ["p1"], zeitraeume: [{ von: "2026-07-01", bis: "2026-08-31" }], teilzeitAnteilig: true },
      gueltigAb: "2026-01-01", gueltigBis: "2026-12-31", grundlage: { art: "betriebsvereinbarung", fundstelle: "BV Dienstplanung § 4" } }))).toBeNull();
  });
});

describe("Umsetzung in den Regelbaukasten", () => {
  it("nur eine aktive Vorgabe wirkt; Entwurf und inaktiv sind „watchlist“ (nicht anwendbar)", () => {
    const kontext = { ereignisse: [], stichtag: "2026-03-31" };
    expect(pruefeRegel(vorgabeAlsRegel(vorgabe("zaehlregel", { status: "aktiv" })), kontext).status).toBe("verletzt");
    for (const status of ["entwurf", "inaktiv"]) expect(pruefeRegel(vorgabeAlsRegel(vorgabe("zaehlregel", { status })), kontext).status).toBe("nicht_anwendbar");
  });
  it("Muss: Achtung mit Bestätigung; Soll und Wunsch: höchstens Hinweis ohne Folge", () => {
    const kontext = { ereignisse: [], stichtag: "2026-03-31" };
    const b = (staerke) => pruefeRegel(vorgabeAlsRegel(vorgabe("zaehlregel", { status: "aktiv", staerke })), kontext).befund;
    expect(b("muss")).toMatchObject({ stufe: "achtung", folge: "bestaetigung", quelle: "Hausregel", ebene: "intern" });
    expect(b("soll")).toMatchObject({ stufe: "hinweis", folge: "keine" });
    expect(b("wunsch")).toMatchObject({ stufe: "hinweis", folge: "keine" });
  });
  it("die Gültigkeit der Vorgabe begrenzt ihre Wirkung", () => {
    const r = vorgabeAlsRegel(vorgabe("zaehlregel", { status: "aktiv", gueltigAb: "2026-06-01" }));
    expect(pruefeRegel(r, { ereignisse: [], stichtag: "2026-03-31" }).status).toBe("nicht_anwendbar");
    expect(pruefeRegel(r, { ereignisse: [], stichtag: "2026-06-30" }).status).toBe("verletzt");
  });
  it("die Regelkennung hat das Kennungsformat des Bestätigungsprotokolls", () => {
    expect(vorgabeAlsRegel(vorgabe("zaehlregel")).id).toMatch(/^[A-Z0-9][A-Z0-9-]{0,39}$/);
  });
});

describe("Testlauf mit Beispielfällen", () => {
  for (const art of VORGABEN_REGELARTEN) {
    it(`${art}: der erfüllende Fall ist erfüllt, der verletzende verletzt (auch beim Entwurf)`, () => {
      const lauf = vorgabeTestlauf(vorgabe(art));
      expect(lauf.fehler).toBeNull();
      expect(lauf.ergebnisse.map((e) => e.erwartet)).toEqual(["erfuellt", "verletzt"]);
      expect(lauf.ergebnisse.map((e) => e.status)).toEqual(["erfuellt", "verletzt"]);
      expect(lauf.ok).toBe(true);
    });
  }
  it("Höchstgrenzen und Untergrenzen der Zählregel", () => {
    const hoechstens = vorgabeTestlauf(vorgabe("zaehlregel", { parameter: { ereignis: "Nacht", fenster: { art: "kalendermonat" }, richtung: "hoechstens", grenze: 4 } }));
    expect(hoechstens.ergebnisse.map((e) => e.status)).toEqual(["erfuellt", "verletzt"]);
  });
  it("eigene Fälle werden gerechnet; ein Fehler in den Parametern wird zum Ergebnis, nie zur Ausnahme", () => {
    const lauf = vorgabeTestlauf(vorgabe("grenzregel"), [{ id: "a", kontext: { wert: 10 } }, { id: "b", kontext: { wert: 11 } }]);
    expect(lauf.ergebnisse.map((e) => e.status)).toEqual(["erfuellt", "verletzt"]);
    expect(lauf.ergebnisse.every((e) => e.erwartet === null && e.stimmt === null)).toBe(true);
    expect(vorgabeTestlauf({ ...vorgabe("grenzregel"), parameter: {} })).toMatchObject({ ok: false, ergebnisse: [] });
  });
  it("ohne Beispiel für die Parameter: freundliche Meldung statt Ausnahme", () => {
    const v = vorgabe("besetzungsregel", { parameter: { anforderungen: [{ art: "verhaeltnis", zaehler: "a", nenner: "b", min: 0.5 }] } });
    expect(beispielFaelle(v)).toBeNull();
    expect(vorgabeTestlauf(v).fehler).toMatch(/keine Beispielfälle/);
  });
  it("deterministisch: zweimal derselbe Lauf, dasselbe Ergebnis", () => {
    for (const art of VORGABEN_REGELARTEN) expect(vorgabeTestlauf(vorgabe(art))).toEqual(vorgabeTestlauf(vorgabe(art)));
  });
});

describe("Formularfelder ↔ Parameter", () => {
  it("jede Regelart hat Felder; Beispielparameter laufen hin und zurück und bleiben gültig", () => {
    for (const art of VORGABEN_REGELARTEN) {
      expect(PARAMETER_FELDER[art].length, art).toBeGreaterThan(0);
      const werte = felderAusParametern(art, V[art].parameter);
      const zurueck = parameterAusFeldern(art, werte);
      const v = vorgabe(art, { parameter: zurueck });
      expect(pruefeVorgabe(v), art).toBeNull();
      /* Nur die Felder, die die Oberfläche kennt, bleiben erhalten (blockregel.gruppen gehört nicht dazu). */
      const { gruppen, ...ohneGruppen } = V[art].parameter;      expect(zurueck, art).toEqual(ohneGruppen);
    }
  });
  it("leere optionale Felder entfallen, Zahlen und Listen werden gelesen", () => {
    expect(parameterAusFeldern("zaehlregel", { ereignis: "x", "fenster.art": "rollierend", "fenster.laenge": "12", "fenster.einheit": "monate", richtung: "hoechstens", grenze: "26" }))
      .toEqual({ ereignis: "x", fenster: { art: "rollierend", laenge: 12, einheit: "monate" }, richtung: "hoechstens", grenze: 26 });
    expect(parameterAusFeldern("wunschregel", { wunsch: "dienstart", wochentage: "1, 3", klassen: "F, S" })).toEqual({ wunsch: "dienstart", wochentage: [1, 3], klassen: ["F", "S"] });
  });
});

describe("Stufengrenzen (E-21)", () => {
  it("Basis 5, Business 25, Enterprise unbegrenzt; unbekannte Stufe wie die kleinste", () => {
    expect(VORGABEN_STUFENGRENZE).toEqual({ basis: 5, pro: 25, enterprise: Infinity });
    expect(vorgabenGrenze("basis")).toBe(5);
    expect(vorgabenGrenze("pro")).toBe(25);
    expect(vorgabenGrenze("enterprise")).toBe(Infinity);
    expect(vorgabenGrenze("unbekannt")).toBe(5);
    expect(vorgabenGrenze(undefined)).toBe(5);
  });
  const viele = (n, status = "aktiv") => Array.from({ length: n }, (_, i) => vorgabe("grenzregel", { id: `v${i}`, name: `Vorgabe ${i}`, status }));
  const ktx = (tarif) => ({ darfOrgEdit: true, person: "l1", tarif, jetzt: "2026-11-10T08:00:00.000Z" });
  it("die sechste aktive Vorgabe wird in Basis abgewiesen, die fünfte nicht; Entwürfe zählen nicht", () => {
    expect(vorgabenZusammen({}, { vorgaben: viele(5) }, ktx("basis")).grund).toBeUndefined();
    expect(vorgabenZusammen({}, { vorgaben: viele(6) }, ktx("basis")).grund).toMatch(/höchstens 5 aktive/);
    expect(vorgabenZusammen({}, { vorgaben: viele(20, "entwurf") }, ktx("basis")).grund).toBeUndefined();
    expect(vorgabenZusammen({}, { vorgaben: [...viele(5), ...viele(10, "entwurf").map((v) => ({ ...v, id: `e${v.id}` }))] }, ktx("basis")).grund).toBeUndefined();
  });
  it("Business 25, Enterprise ohne Grenze (bis zur Obergrenze der Liste)", () => {
    expect(vorgabenZusammen({}, { vorgaben: viele(25) }, ktx("pro")).grund).toBeUndefined();
    expect(vorgabenZusammen({}, { vorgaben: viele(26) }, ktx("pro")).grund).toMatch(/höchstens 25/);
    expect(vorgabenZusammen({}, { vorgaben: viele(60) }, ktx("enterprise")).grund).toBeUndefined();
    expect(vorgabenZusammen({}, { vorgaben: viele(201) }, ktx("enterprise")).grund).toMatch(/höchstens 200/);
  });
  it("Stufenwechsel nach unten: Bestand bleibt, aber keine weitere aktive Vorgabe", () => {
    const alt = { tarif: "basis", vorgaben: vorgabenZusammen({}, { vorgaben: viele(8) }, ktx("enterprise")).mandant.vorgaben };
    expect(aktiveVorgaben(alt.vorgaben)).toHaveLength(8);
    /* unverändert zurückgeschickt: kein Fehler */
    expect(vorgabenZusammen(alt, { vorgaben: kopie(alt.vorgaben) }, ktx("basis")).grund).toBeUndefined();
    /* eine aktive weniger ist erlaubt (Verringerung), eine mehr nicht */
    expect(vorgabenZusammen(alt, { vorgaben: kopie(alt.vorgaben).slice(1) }, ktx("basis")).grund).toBeUndefined();
    expect(vorgabenZusammen(alt, { vorgaben: [...kopie(alt.vorgaben), vorgabe("grenzregel", { id: "neu", name: "Neu", status: "aktiv" })] }, ktx("basis")).grund).toMatch(/höchstens 5/);
  });
});

describe("Schreibweg: Rechte und Wann/Wer vom Server", () => {
  const grund = (tarif = "pro") => { const g = branchenbestand(); g.mandanten[0].tarif = tarif; return g; };
  const NEU = vorgabe("zaehlregel", { status: "aktiv", geaendertAm: "1999-01-01T00:00:00.000Z", geaendertVon: "fremd" });
  it("Leitung und Kundenrolle (org.edit) legen an und aktivieren; Wann/Wer setzt der Server, Angaben des Clients verfallen", () => {
    for (const r of ["LT", "KD"]) {
      const res = schreibeAls(grund(), r, (m) => { m.vorgaben = [kopie(NEU)]; });
      expect(res.verweigert, r).toBeUndefined();
      const v = res.mandanten[0].vorgaben[0];
      expect(v.id).toBe("freie-we");
      expect(v.geaendertVon).toBe(SITZUNGEN[r].person);
      expect(v.aktiviertVon).toBe(SITZUNGEN[r].person);
      expect(v.geaendertAm).not.toBe("1999-01-01T00:00:00.000Z");
      expect(Date.parse(v.geaendertAm)).toBeGreaterThan(Date.parse("2026-11-01"));
      expect(v.aktiviertAm).toBe(v.geaendertAm);
    }
  });
  it("Planung, Schichtverantwortung, Beschäftigte und Betriebsrat können nichts ändern: das Feld ist wirkungslos, kein 403", () => {
    const angelegt = schreibeAls(grund(), "LT", (m) => { m.vorgaben = [kopie(NEU)]; });
    const vorher = kopie(angelegt.mandanten[0].vorgaben);
    for (const r of ["PL", "SV", "MA", "BR"]) {
      for (const aendern of [(m) => { m.vorgaben = [kopie(NEU), vorgabe("grenzregel", { id: "zwei", name: "Zwei", status: "aktiv" })]; },
        (m) => { m.vorgaben = []; }, (m) => { m.vorgaben = [{ ...kopie(NEU), status: "inaktiv", geaendertVon: "fremd" }]; }, (m) => { m.vorgaben = "x"; }]) {
        const res = schreibeAls(angelegt, r, aendern);
        /* Planung (Voll-Schreibweg): wirkungslos, kein 403. Die anderen Rollen prüft ihr eigener Katalog: entweder abgewiesen
           oder unverändert; geändert wird nie etwas. */
        if (r === "PL") expect(res.verweigert, r).toBeUndefined();
        if (res && !res.verweigert) expect(res.mandanten[0].vorgaben, r).toEqual(vorher);
      }
    }
    /* Ohne bestehende Vorgaben entsteht auch keine. */
    for (const r of ["PL", "SV", "MA", "BR"]) {
      const res = schreibeAls(grund(), r, (m) => { m.vorgaben = [kopie(NEU)]; });
      expect(!res || res.verweigert ? [] : (res.mandanten[0].vorgaben || []), r).toEqual([]);
    }
  });
  it("Version zählt der Server: neu 1, jede Änderung eins höher, eine mitgeschickte Version zählt nie", () => {
    const g1 = schreibeAls(grund(), "LT", (m) => { m.vorgaben = [{ ...kopie(NEU), version: 99 }]; });
    expect(g1.mandanten[0].vorgaben[0].version).toBe(1);
    const g2 = schreibeAls(g1, "LT", (m) => { m.vorgaben[0].prioritaet = 3; m.vorgaben[0].version = 1; });
    expect(g2.mandanten[0].vorgaben[0].version).toBe(2);
    const g3 = schreibeAls(g2, "KD", (m) => { m.vorgaben[0].version = 50; });
    expect(g3.mandanten[0].vorgaben[0].version).toBe(2);
  });
  it("ein Rundweg der Planung (unverändert zurückgeschickt, auch ohne das Feld) ändert nichts", () => {
    const angelegt = schreibeAls(grund(), "LT", (m) => { m.vorgaben = [kopie(NEU)]; });
    const vorher = kopie(angelegt.mandanten[0].vorgaben);
    expect(schreibeAls(angelegt, "PL", () => {}).mandanten[0].vorgaben).toEqual(vorher);
    expect(schreibeAls(angelegt, "PL", (m) => { delete m.vorgaben; }).mandanten[0].vorgaben).toEqual(vorher);
  });
  it("mitgeschickte Stempel einer anderen Person ändern nichts; die Änderung behält den ersten Aktivierer", () => {
    const angelegt = schreibeAls(grund(), "LT", (m) => { m.vorgaben = [kopie(NEU)]; });
    const v0 = angelegt.mandanten[0].vorgaben[0];
    const gefaelscht = schreibeAls(angelegt, "LT", (m) => { m.vorgaben[0].geaendertVon = "fremd"; });
    expect(gefaelscht.mandanten[0].vorgaben[0]).toEqual(v0);
    const geaendert = schreibeAls(angelegt, "KD", (m) => { m.vorgaben[0].prioritaet = 2; });
    expect(geaendert.mandanten[0].vorgaben[0]).toMatchObject({ prioritaet: 2, geaendertVon: "k1", aktiviertVon: "l1", aktiviertAm: v0.aktiviertAm });
  });
  it("Fehlerhaftes wird auch von der Leitung abgewiesen; die Stufengrenze gilt über den echten Weg", () => {
    const kaputt = kopie(NEU); kaputt.parameter = {};
    expect(schreibeAls(grund(), "LT", (m) => { m.vorgaben = [kaputt]; }).verweigert).toMatch(/Parameter/);
    expect(schreibeAls(grund(), "LT", (m) => { m.vorgaben = "keine Liste"; }).verweigert).toMatch(/Liste/);
    const sechs = Array.from({ length: 6 }, (_, i) => vorgabe("grenzregel", { id: `v${i}`, name: `V${i}`, status: "aktiv" }));
    expect(schreibeAls(grund("basis"), "LT", (m) => { m.vorgaben = sechs; }).verweigert).toMatch(/höchstens 5/);
    expect(schreibeAls(grund("pro"), "LT", (m) => { m.vorgaben = sechs; }).verweigert).toBeUndefined();
  });
  it("Löschen durch die Leitung ist möglich", () => {
    const angelegt = schreibeAls(grund(), "LT", (m) => { m.vorgaben = [kopie(NEU)]; });
    expect(schreibeAls(angelegt, "LT", (m) => { m.vorgaben = []; }).mandanten[0].vorgaben).toEqual([]);
  });
});

describe("Lesesicht je Rolle", () => {
  const MARKE = "GEHEIM-PERSON-4711";
  const bestand = () => {
    const g = branchenbestand();
    g.mandanten[0].tarif = "pro";
    g.mandanten[0].vorgaben = [{ ...vorgabe("zaehlregel", { status: "aktiv", beschreibung: "Mindestens zwei freie Wochenende",
      geltung: { art: "personen", personen: [MARKE, "a1"] }, ausnahmen: { personen: [MARKE], zeitraeume: [{ von: "2026-07-01", bis: "2026-07-31" }], teilzeitAnteilig: true },
      grundlage: { art: "betriebsvereinbarung", fundstelle: "BV § 4" } }),
    geaendertAm: "2026-11-01T10:00:00.000Z", geaendertVon: MARKE, aktiviertAm: "2026-11-01T10:00:00.000Z", aktiviertVon: MARKE }];
    return g;
  };
  it("Leitung und Kundenrolle (org.edit) sehen die Vorgaben vollständig", () => {
    for (const r of ["LT", "KD"]) {
      const v = bestandFuerRolle(bestand(), SITZUNGEN[r]).mandanten[0].vorgaben;
      expect(JSON.stringify(v), r).toContain(MARKE);
      expect(v[0].geltung.personen, r).toContain("a1");
    }
  });
  it("Planung, Beschäftigte, Schichtverantwortung und Betriebsrat bekommen die Vorgaben nicht (auch keinen Namen, keine Zahl)", () => {
    for (const r of ["PL", "MA", "SV", "BR"]) {
      const m = bestandFuerRolle(bestand(), SITZUNGEN[r]).mandanten[0];
      expect(m.vorgaben || [], r).toEqual([]);
      expect(JSON.stringify(m), r).not.toContain(MARKE);
      expect(JSON.stringify(m), r).not.toContain("Freie Wochenenden");
    }
  });
});
