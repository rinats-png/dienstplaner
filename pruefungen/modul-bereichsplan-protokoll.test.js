/* ==========================================================================
   WP-19.4 — Änderungsprotokoll im Schreibweg der Schichtverantwortung (Matrix B2 b)

   Invarianten: docs/acc45/WP19-MODULPLAN.md Abschnitt 17 (P1–P9). Kurz:
     P1  Ort: das bestehende Modulprotokoll (einstellungen.modulprotokoll), nur der Server schreibt.
     P2  Je angenommenem Speichern der Schichtverantwortung mit Änderung genau EIN Eintrag: wer, wann, eigene Einheit,
         Anzahl, je Änderung Person (Kennung), Tag, Bereich vorher → nachher (Kennung oder null). Keine Namen.
     P3  Nur anhängen; Bestehendes bleibt byte-gleich; kein Rollenweg schreibt oder löscht Einträge.
     P4  Atomar/fail-closed: jede Absage lässt Zuordnung UND Protokoll unverändert; Grenze erreicht → kein Speichern.
     P5  Lesen: Leitung und Planung; nicht Schichtverantwortung, Beschäftigte, Betriebsrat; Auskunft nur Positivkatalog.
     P6  Modul geplant/aus: nichts geöffnet. P7 Mandantentrennung.
   Schreibfälle im Prüfmodus (Registry-Kopie „vorlaeufig“ nur im Test), das Geschlossene mit der echten Registry.
   Teil B über die echten Handler (PUT /api/bestand und POST /api/bestand/teile).
   ========================================================================== */
// zeit-ok: Der Server stempelt den Eintrag mit der echten Uhr (geprüft wird nur „nicht vor Testbeginn“), und das Tagesfenster des
// Bereichsplans (± zwei Jahre um heute) wird wie in modul-bereichsplan.test.js relativ zu heute geprüft.
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BRANCHENMODULE, MODULPROTOKOLL_GRENZE, modulProtokollZeilen, moduleinstellungenSicht, modulprotokollBelegt, branchenmoduleZusammen }
  from "../server/lib/branchenmodule.mjs";
import { bereichsprotokollEintrag, bereichsprotokollAnhaengen, BEREICH_PROTOKOLL_ART, BEREICH_GRENZEN, BEREICH_PROTOKOLL_GRENZEN, protokollBytes }
  from "../server/lib/modul-bereichsplan.mjs";
import { vorgabenZusammen } from "../server/lib/vorgaben.mjs";
import { bestandFuerRolle, zusammenfuehren } from "../server/lib/rechte.mjs";
import { auskunftBauen } from "../server/lib/auskunft.mjs";
import { branchenbestand, schreibeAls as schreibeAlsEcht, SITZUNGEN } from "./hilfen/branchenbetrieb.mjs";
import { BereichsProtokoll, BereichsErgaenzung } from "../src/module/bereichsplan-pflege.js";

const MO = "2026-11-02", DI = "2026-11-03";
const AKTIV = BRANCHENMODULE.map((x) => (x.id === "bereichsplan" ? { ...x, status: "vorlaeufig" } : x));
const schreibeAls = (g, r, aendern) => schreibeAlsEcht(g, r, aendern, { liste: AKTIV });
const kopie = (x) => JSON.parse(JSON.stringify(x));
const ALTEINTRAG = Object.freeze({ art: "eingeschaltet", modul: "bereichsplan", am: "2026-10-01T08:00:00.000Z", von: "l1" });

/** Ein Betrieb mit zwei Einheiten (e1 der SV, e2 fremd), Bereichen und einem Alteintrag im Modulprotokoll. */
function bestand({ plan = {}, protokoll = [ALTEINTRAG] } = {}) {
  const g = branchenbestand({ pakete: ["pflege"], branchenmodule: { bereichsplan: { an: true } } });
  const m = g.mandanten[0];
  m.einheiten = [{ id: "e1", versatzTage: 0, bereiche: [{ id: "b1", name: "Wohnbereich Nord" }, { id: "b2", name: "Wohnbereich Süd" }] },
    { id: "e2", versatzTage: 0, bereiche: [{ id: "b3", name: "Station 3" }] }];
  m.personen.push({ ...m.personen[0], id: "x2", rolle: "mitarbeiter", bereich: "e2", zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e2" }] });
  m.bereichsPlan = plan;
  m.einstellungen.modulprotokoll = kopie(protokoll);
  return g;
}
const protokollVon = (g) => g.mandanten[0].einstellungen.modulprotokoll;
const tagPlus = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
/** n Einträge anderer Art (gemeinsame Grenze) bzw. n Altbestand-Einträge der Bereichszuordnung. */
const fuellAndere = (n) => Array.from({ length: n }, (_, i) => ({ art: "parameter", modul: "bereichsplan", am: "2026-10-01T08:00:00.000Z", von: `l${i}` }));
const fuellBereich = (n) => Array.from({ length: n }, (_, i) => ({ art: BEREICH_PROTOKOLL_ART, modul: "bereichsplan", am: "2026-10-01T08:00:00.000Z",
  von: "s1", einheit: "e1", anzahl: 1, zuordnungen: [{ person: "a1", tag: MO, vorher: i % 2 ? "b1" : null, nachher: i % 2 ? null : "b1" }] }));
/** Bei gefüllter Zuordnungsart: Leitung schaltet ein Modul ein, legt eine Vorgabe an, ordnet zu und speichert — alles wie vorher. */
function leitungGegenprobe(g) {
  const m = g.mandanten[0];
  const ein = branchenmoduleZusammen({ ...m, einstellungen: { ...m.einstellungen, branchenmodule: {} } },
    { ...m, einstellungen: { ...m.einstellungen, branchenmodule: { bereichsplan: { an: true } } } }, { person: "l1" }, true, AKTIV);
  expect(ein.grund).toBeUndefined();
  expect(ein.mandant.einstellungen.modulprotokoll.at(-1)).toMatchObject({ art: "eingeschaltet", modul: "bereichsplan" });
  const v = { id: "v1", name: "Vorgabe v1", beschreibung: "x", regelart: "grenzregel", parameter: { groesse: "Überstunden im Monat", hoechstens: 10 },
    geltung: { art: "betrieb" }, bezug: "monat", staerke: "muss", prioritaet: 1, grundlage: { art: "hausregel" }, status: "entwurf" };
  const vg = vorgabenZusammen(m, { ...m, vorgaben: [v] }, { darfOrgEdit: true, person: "l1", tarif: "pro", jetzt: "2026-11-26T10:00:00.000Z" });
  expect(vg.grund).toBeUndefined();
  expect(vg.mandant.einstellungen.modulprotokoll.at(-1)).toMatchObject({ art: "vorgabe-angelegt" });
  for (const r of ["LT", "PL"]) {
    const w = schreibeAls(g, r, (x) => { x.bereichsPlan = { ...x.bereichsPlan, [`s1|${DI}`]: "b2" }; });
    expect(w.verweigert, r).toBeFalsy();
    expect(w.mandanten[0].bereichsPlan[`s1|${DI}`], r).toBe("b2");
    expect(protokollVon(w), r).toEqual(protokollVon(g));
  }
}
const neueEintraege = (g) => protokollVon(g).filter((x) => x.art === BEREICH_PROTOKOLL_ART);

describe("Teil A — Schreibweg der Schichtverantwortung (zusammenfuehren)", () => {
  it("P2: eine neue Zuordnung → genau ein Eintrag mit wer, wann, Einheit, Person, Tag, vorher → nachher; Alteintrag byte-gleich davor", () => {
    const vorher = Date.now();
    const r = schreibeAls(bestand(), "SV", (m) => { m.bereichsPlan = { ...m.bereichsPlan, [`a1|${MO}`]: "b2" }; });
    expect(r.verweigert).toBeFalsy();
    expect(r.mandanten[0].bereichsPlan).toEqual({ [`a1|${MO}`]: "b2" });
    const p = protokollVon(r);
    expect(p).toHaveLength(2);
    expect(p[0]).toEqual(ALTEINTRAG);
    const e = p[1];
    expect(Object.keys(e).sort()).toEqual(["am", "anzahl", "art", "einheit", "modul", "von", "zuordnungen"]);
    expect(e).toMatchObject({ art: "bereich-zuordnung", modul: "bereichsplan", von: "s1", einheit: "e1", anzahl: 1,
      zuordnungen: [{ person: "a1", tag: MO, vorher: null, nachher: "b2" }] });
    expect(Date.parse(e.am)).toBeGreaterThanOrEqual(vorher - 1000);
    expect(e.am).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    /* Keine Namen: weder Person noch Bereich im Klartext. */
    expect(JSON.stringify(e)).not.toMatch(/Wohnbereich|Na1|Ns1/);
  });

  it("P2: mehrere Änderungen in einem Speichern (setzen, ändern, lösen) → EIN Eintrag, sortiert, Anzahl stimmt", () => {
    const g = bestand({ plan: { [`a1|${MO}`]: "b1", [`s1|${MO}`]: "b1" } });
    const r = schreibeAls(g, "SV", (m) => { m.bereichsPlan = { [`a1|${MO}`]: "b2", [`a1|${DI}`]: "b1" }; });
    expect(r.verweigert).toBeFalsy();
    const neu = neueEintraege(r);
    expect(neu).toHaveLength(1);
    expect(neu[0].anzahl).toBe(3);
    expect(neu[0].zuordnungen).toEqual([
      { person: "a1", tag: MO, vorher: "b1", nachher: "b2" },
      { person: "a1", tag: DI, vorher: null, nachher: "b1" },
      { person: "s1", tag: MO, vorher: "b1", nachher: null },
    ]);
  });

  it("P2/P3: Rückgängig-Machen ist eine neue Änderung (zweiter Eintrag), der erste bleibt unverändert", () => {
    const g1 = schreibeAls(bestand({ plan: { [`a1|${MO}`]: "b1" } }), "SV", (m) => { delete m.bereichsPlan[`a1|${MO}`]; });
    expect(g1.verweigert).toBeFalsy();
    const erster = kopie(neueEintraege(g1)[0]);
    expect(erster.zuordnungen).toEqual([{ person: "a1", tag: MO, vorher: "b1", nachher: null }]);
    const g2 = schreibeAls(g1, "SV", (m) => { m.bereichsPlan = { ...m.bereichsPlan, [`a1|${MO}`]: "b1" }; });
    expect(g2.verweigert).toBeFalsy();
    const beide = neueEintraege(g2);
    expect(beide).toHaveLength(2);
    expect(beide[0]).toEqual(erster);
    expect(beide[1].zuordnungen).toEqual([{ person: "a1", tag: MO, vorher: null, nachher: "b1" }]);
  });

  it("P2: unverändertes Speichern und Speichern anderer Felder → kein Eintrag, Protokoll byte-gleich", () => {
    const g = bestand({ plan: { [`a1|${MO}`]: "b1" } });
    const gleich = schreibeAls(g, "SV", () => {});
    expect(gleich.verweigert).toBeFalsy();
    expect(protokollVon(gleich)).toEqual([ALTEINTRAG]);
    const anderes = schreibeAls(g, "SV", (m) => { m.abweichungen = { [`a1|${MO}`]: "F" }; });
    expect(anderes.verweigert).toBeFalsy();
    expect(protokollVon(anderes)).toEqual([ALTEINTRAG]);
  });

  it("P2/Sichtgrenze: unsichtbare Einträge fremder Einheiten bleiben und erscheinen nicht im Protokoll", () => {
    const g = bestand({ plan: { [`x2|${MO}`]: "b3" } });
    const r = schreibeAls(g, "SV", (m) => { m.bereichsPlan = { ...m.bereichsPlan, [`a1|${MO}`]: "b1" }; });
    expect(r.verweigert).toBeFalsy();
    expect(r.mandanten[0].bereichsPlan).toEqual({ [`x2|${MO}`]: "b3", [`a1|${MO}`]: "b1" });
    expect(neueEintraege(r)[0].zuordnungen).toEqual([{ person: "a1", tag: MO, vorher: null, nachher: "b1" }]);
    expect(JSON.stringify(neueEintraege(r))).not.toMatch(/x2|b3/);
  });

  it("P4: jede Absage der Schichtverantwortung → kein Ergebnis (Zuordnung und Protokoll bleiben gespeichert, wie sie sind)", () => {
    const tagPlus = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
    const viele = Object.fromEntries(Array.from({ length: BEREICH_GRENZEN.aenderungenSchicht + 1 }, (_, i) => [`${i % 2 ? "a1" : "s1"}|${tagPlus(-300 + i)}`, "b1"]));
    const faelle = {
      "fremde Person": (m) => { m.bereichsPlan = { [`x2|${MO}`]: "b1" }; },
      "fremder Bereich": (m) => { m.bereichsPlan = { [`a1|${MO}`]: "b3" }; },
      "zu viele Änderungen": (m) => { m.bereichsPlan = viele; },
      "Tag außerhalb": (m) => { m.bereichsPlan = { [`a1|${tagPlus(5000)}`]: "b1" }; },
    };
    for (const [was, fn] of Object.entries(faelle)) {
      const g = bestand();
      const vorher = kopie(g);
      const r = schreibeAls(g, "SV", fn);
      expect(r.verweigert, was).toBeTruthy();
      expect(r.mandanten, was).toBeUndefined();
      expect(g, was).toEqual(vorher);
    }
  });

  it("P1/P3: ein von der Schichtverantwortung mitgeschicktes Protokoll zählt nicht — mit und ohne Zuordnungsänderung", () => {
    const faelschen = [(m) => { m.einstellungen = { ...m.einstellungen, modulprotokoll: [] }; },
      (m) => { m.einstellungen = { ...m.einstellungen, modulprotokoll: [{ ...ALTEINTRAG, von: "s1" }, { art: BEREICH_PROTOKOLL_ART, modul: "bereichsplan", von: "l1" }] }; }];
    /* Leere Liste: die Rückfüllung setzt das (für die SV verborgene) Gespeicherte wieder ein — gespeichert bleibt das Gespeicherte, dazu
       allenfalls der eine Eintrag des Servers. Eigene Einträge: Einstellungen sind der Leitung vorbehalten (einheitZusammen) → abgewiesen. */
    const [leer, eigene] = faelschen;
    const ohne = schreibeAls(bestand(), "SV", leer);
    expect(ohne.verweigert).toBeFalsy();
    expect(protokollVon(ohne)).toEqual([ALTEINTRAG]);
    const mit = schreibeAls(bestand(), "SV", (m) => { leer(m); m.bereichsPlan = { [`a1|${MO}`]: "b1" }; });
    expect(mit.verweigert).toBeFalsy();
    const p = protokollVon(mit);
    expect(p).toHaveLength(2);
    expect(p[0]).toEqual(ALTEINTRAG);
    expect(p[1]).toMatchObject({ art: BEREICH_PROTOKOLL_ART, von: "s1", zuordnungen: [{ person: "a1", tag: MO, vorher: null, nachher: "b1" }] });
    expect(schreibeAls(bestand(), "SV", eigene).verweigert).toMatch(/einstellungen sind der Leitung vorbehalten/);
    expect(schreibeAls(bestand(), "SV", (m) => { eigene(m); m.bereichsPlan = { [`a1|${MO}`]: "b1" }; }).verweigert).toMatch(/einstellungen sind der Leitung vorbehalten/);
  });

  it("P6: Registry echt (Modul „geplant“) → abgewiesen, kein Protokoll; Modul im Betrieb aus → ebenso", () => {
    const g = bestand();
    const r = schreibeAlsEcht(g, "SV", (m) => { m.bereichsPlan = { [`a1|${MO}`]: "b1" }; });
    expect(r.verweigert).toMatch(/wirkt in diesem Betrieb nicht/);
    const aus = bestand();
    aus.mandanten[0].einstellungen.branchenmodule = { bereichsplan: { an: false, eingeschaltetAm: "2026-10-01T08:00:00.000Z" } };
    expect(schreibeAls(aus, "SV", (m) => { m.bereichsPlan = { [`a1|${MO}`]: "b1" }; }).verweigert).toBeTruthy();
  });

  it("B-1: die gemeinsame Grenze (andere Einträge voll) sperrt die SV nicht — die Zuordnung hat eigene Grenzen", () => {
    const voll = schreibeAls(bestand({ protokoll: fuellAndere(MODULPROTOKOLL_GRENZE) }), "SV", (m) => { m.bereichsPlan = { [`a1|${MO}`]: "b1" }; });
    expect(voll.verweigert).toBeFalsy();
    expect(protokollVon(voll)).toHaveLength(MODULPROTOKOLL_GRENZE + 1);
    expect(modulprotokollBelegt(protokollVon(voll))).toBe(MODULPROTOKOLL_GRENZE);
  });

  it("B-1/(c): Zahl der Einträge dieser Art — genau an der Grenze gespeichert, darüber abgewiesen (nichts gespeichert); Altbestand darüber ebenso", () => {
    const G = BEREICH_PROTOKOLL_GRENZEN.eintraege;
    const platz = schreibeAls(bestand({ protokoll: fuellBereich(G - 1) }), "SV", (m) => { m.bereichsPlan = { [`a1|${MO}`]: "b1" }; });
    expect(platz.verweigert).toBeFalsy();
    expect(neueEintraege(platz)).toHaveLength(G);
    for (const n of [G, G + 5]) {
      const g = bestand({ protokoll: fuellBereich(n) });
      const vorher = kopie(g);
      const r = schreibeAls(g, "SV", (m) => { m.bereichsPlan = { [`a1|${MO}`]: "b1" }; });
      expect(r.verweigert, String(n)).toMatch(/Änderungsprotokoll der Zuordnungen ist voll/);
      expect(g, String(n)).toEqual(vorher);
    }
  });

  it("(b): höchstens 100 Zuordnungen je Speichern — 100 gespeichert, 101 abgewiesen; Eintragsgröße begrenzt", () => {
    const J = BEREICH_PROTOKOLL_GRENZEN.jeSpeichern;
    const plan = (n) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`a1|${tagPlus(-200 + i)}`, "b1"]));
    const genau = schreibeAls(bestand(), "SV", (m) => { m.bereichsPlan = plan(J); });
    expect(genau.verweigert).toBeFalsy();
    expect(neueEintraege(genau)[0].anzahl).toBe(J);
    const zuViel = schreibeAls(bestand(), "SV", (m) => { m.bereichsPlan = plan(J + 1); });
    expect(zuViel.verweigert).toMatch(/höchstens 100 Änderungen je Speichern \(Änderungsprotokoll\)/);
    /* Größter möglicher Eintrag (Kennungen 60 Zeichen) passt unter eintragBytes; darüber: abgewiesen. */
    const k = (c) => c.repeat(60);
    const gross = { art: BEREICH_PROTOKOLL_ART, modul: "bereichsplan", am: "2026-11-26T10:00:00.000Z", von: k("s"), einheit: k("e"), anzahl: J,
      zuordnungen: Array.from({ length: J }, () => ({ person: k("p"), tag: "2026-11-02", vorher: k("v"), nachher: k("n") })) };
    expect(protokollBytes(gross)).toBeLessThanOrEqual(BEREICH_PROTOKOLL_GRENZEN.eintragBytes);
    expect(bereichsprotokollAnhaengen({}, gross)).not.toHaveProperty("grund");
    expect(bereichsprotokollAnhaengen({}, gross, { grenzen: { ...BEREICH_PROTOKOLL_GRENZEN, eintragBytes: protokollBytes(gross) - 1 } }).grund).toMatch(/zu groß/);
  });

  it("(c): Gesamtgröße dieser Art — über gesamtBytes abgewiesen; Worst Case ≪ RUMPF_MAX", () => {
    const voll = { modulprotokoll: fuellBereich(3) };
    const klein = { art: BEREICH_PROTOKOLL_ART, zuordnungen: [] };
    const grenze = protokollBytes(voll.modulprotokoll) + protokollBytes(klein);
    expect(bereichsprotokollAnhaengen(voll, klein, { grenzen: { ...BEREICH_PROTOKOLL_GRENZEN, gesamtBytes: grenze } })).not.toHaveProperty("grund");
    expect(bereichsprotokollAnhaengen(voll, klein, { grenzen: { ...BEREICH_PROTOKOLL_GRENZEN, gesamtBytes: grenze - 1 } }).grund).toMatch(/voll/);
    /* Worst Case je Betrieb: die Art belegt höchstens gesamtBytes = 1 MiB, unabhängig von Einheiten; RUMPF_MAX 6 MiB. */
    expect(BEREICH_PROTOKOLL_GRENZEN.gesamtBytes * 5).toBeLessThanOrEqual(6 * 1024 * 1024);
  });

  it("DoS 1: 2000 Hin-und-her-Speichern der SV füllen nur die eigene Art; danach SV abgewiesen, Leitung schaltet, legt Vorgaben an und ordnet zu", () => {
    let g = bestand({ protokoll: [ALTEINTRAG] });
    for (let i = 0; i < BEREICH_PROTOKOLL_GRENZEN.eintraege - 1; i++) {
      const r = schreibeAls(g, "SV", (m) => { m.bereichsPlan = { [`a1|${MO}`]: i % 2 ? "b1" : "b2" }; });
      expect(r.verweigert, String(i)).toBeFalsy();
      g = r;
    }
    const letzter = schreibeAls(g, "SV", (m) => { m.bereichsPlan = { [`a1|${MO}`]: "b1" }; });
    expect(letzter.verweigert).toBeFalsy();
    g = letzter;
    expect(neueEintraege(g)).toHaveLength(BEREICH_PROTOKOLL_GRENZEN.eintraege);
    const vorher = kopie(g);
    expect(schreibeAls(g, "SV", (m) => { m.bereichsPlan = { [`a1|${MO}`]: "b2" }; }).verweigert).toMatch(/voll/);
    expect(g).toEqual(vorher);
    leitungGegenprobe(g);
  });

  it("DoS 2: 190 SV-Speichern mit je höchstens 100 Änderungen — gemessen bleibt der Betrieb weit unter RUMPF_MAX; Leitung unberührt", () => {
    let g = bestand();
    const tage = Array.from({ length: BEREICH_PROTOKOLL_GRENZEN.jeSpeichern }, (_, i) => `a1|${tagPlus(-300 + i)}`);
    let abgewiesen = 0;
    for (let i = 0; i < 190; i++) {
      /* Je Versuch ein Wechsel aller 100 Tage gegen den gespeicherten Stand — also immer 100 echte Änderungen. */
      const jetzt = g.mandanten[0].bereichsPlan[tage[0]];
      const r = schreibeAls(g, "SV", (m) => { m.bereichsPlan = Object.fromEntries(tage.map((k) => [k, jetzt === "b2" ? "b1" : "b2"])); });
      if (r.verweigert) { abgewiesen += 1; expect(r.verweigert).toMatch(/voll/); continue; }
      expect(neueEintraege(r)).toHaveLength(neueEintraege(g).length + 1);
      g = r;
    }
    expect(abgewiesen).toBeGreaterThan(0);                                            // die Gesamtgrenze greift vor 190
    const art = neueEintraege(g);
    expect(art.length + abgewiesen).toBe(190);
    /* Fehlte nur noch der Platz für den nächsten Eintrag: die Grenze ist ausgeschöpft, nicht vorzeitig gesperrt. */
    expect(protokollBytes(art) + protokollBytes(art.at(-1))).toBeGreaterThan(BEREICH_PROTOKOLL_GRENZEN.gesamtBytes - 200);
    expect(protokollBytes(art)).toBeLessThanOrEqual(BEREICH_PROTOKOLL_GRENZEN.gesamtBytes);
    expect(protokollBytes(g)).toBeLessThan(2 * 1024 * 1024);                          // ganzer Bestand, gemessen
    leitungGegenprobe(g);
  });

  it("P3: Leitung kann das Protokoll über den vollen Weg weder leeren noch ändern (Server stellt es wieder her)", () => {
    const g = schreibeAls(bestand(), "SV", (m) => { m.bereichsPlan = { [`a1|${MO}`]: "b1" }; });
    const vorher = kopie(protokollVon(g));
    for (const fn of [(m) => { m.einstellungen.modulprotokoll = []; }, (m) => { m.einstellungen.modulprotokoll[1].von = "l1"; },
      (m) => { delete m.einstellungen.modulprotokoll; }]) {
      const r = schreibeAls(g, "LT", fn);
      expect(r.verweigert).toBeFalsy();
      expect(protokollVon(r)).toEqual(vorher);
    }
  });

  it("Stand E1 (Entscheidung offen): Planung und Leitung schreiben Zuordnungen ohne Eintrag — die Spezifikation nennt nur den Weg der Schichtverantwortung", () => {
    for (const r of ["PL", "LT"]) {
      const w = schreibeAls(bestand(), r, (m) => { m.bereichsPlan = { [`a1|${MO}`]: "b1" }; });
      expect(w.verweigert, r).toBeFalsy();
      expect(protokollVon(w), r).toEqual([ALTEINTRAG]);
    }
  });

  it("P7: Mandantentrennung — nur der eigene Betrieb bekommt den Eintrag", () => {
    const g = bestand();
    const zweiter = kopie(g.mandanten[0]);
    zweiter.id = "m2"; zweiter.name = "Anderer Betrieb";
    g.mandanten.push(zweiter);
    const s = kopie(bestandFuerRolle(g, SITZUNGEN.SV));
    s.mandanten[0].bereichsPlan = { [`a1|${MO}`]: "b1" };
    const r = zusammenfuehren(g, s, SITZUNGEN.SV, { liste: AKTIV });
    expect(r.verweigert).toBeFalsy();
    expect(neueEintraege(r)).toHaveLength(1);
    expect(r.mandanten.find((m) => m.id === "m2")).toEqual(zweiter);
  });
});

describe("Teil A — Lesen (Rechtematrix unverändert)", () => {
  const mitEintrag = () => schreibeAls(bestand(), "SV", (m) => { m.bereichsPlan = { [`a1|${MO}`]: "b1" }; });
  it("P5: Leitung und Planung sehen den Eintrag vollständig; Schichtverantwortung und Beschäftigte kein Modulprotokoll", () => {
    const g = mitEintrag();
    for (const r of ["LT", "PL"]) expect(neueEintraege(bestandFuerRolle(g, SITZUNGEN[r])), r).toEqual(neueEintraege(g));
    for (const r of ["SV", "MA"]) expect(bestandFuerRolle(g, SITZUNGEN[r]).mandanten[0].einstellungen.modulprotokoll, r).toBeUndefined();
  });
  it("P5: der Betriebsrat sieht den Eintrag nicht (keine Einzelzuordnung, keine Person), übrige Einträge wie bisher", () => {
    const g = mitEintrag();
    const br = bestandFuerRolle(g, SITZUNGEN.BR).mandanten[0].einstellungen.modulprotokoll || [];
    expect(br.some((x) => x.art === BEREICH_PROTOKOLL_ART)).toBe(false);
    expect(JSON.stringify(br)).not.toMatch(/zuordnungen|a1\|/);
    expect(br).toEqual([ALTEINTRAG]);
    expect(moduleinstellungenSicht({ modulprotokoll: protokollVon(g) }, "betriebsrat").modulprotokoll).toEqual([ALTEINTRAG]);
  });
  it("P5: Auskunft der Schichtverantwortung nennt die eigene Handlung nur nach Positivkatalog — ohne Personen, Tage, Bereiche", () => {
    const g = mitEintrag();
    const m = g.mandanten[0];
    const a = auskunftBauen(m, m.personen.find((p) => p.id === "s1"), { raum: "r", erstellt: "2026-11-26T10:00:00.000Z", umfang: "selbst" });
    expect(a.modulhandlungen).toHaveLength(1);
    expect(Object.keys(a.modulhandlungen[0]).sort()).toEqual(["am", "anzahl", "art", "modul", "von"]);
    const betroffen = auskunftBauen(m, m.personen.find((p) => p.id === "a1"), { raum: "r", erstellt: "2026-11-26T10:00:00.000Z", umfang: "selbst" });
    expect(betroffen.modulhandlungen).toBeUndefined();
  });
  it("Betriebsprotokoll: nur die Zahl, ohne Person, Tag oder Bereich", () => {
    const vorher = bestand();
    const nachher = schreibeAls(vorher, "SV", (m) => { m.bereichsPlan = { [`a1|${MO}`]: "b1", [`s1|${MO}`]: "b2" }; });
    const z = modulProtokollZeilen(vorher, nachher);
    expect(z).toEqual(["Branchenmodul bereichsplan: 2 Zuordnungen durch die Schichtverantwortung geändert"]);
  });
  it("reine Funktion: ohne Änderung null; nur Zeichenketten zählen als Bereich", () => {
    expect(bereichsprotokollEintrag({ a: "b1" }, { a: "b1" }, { am: "x", von: "s1", einheit: "e1" })).toBeNull();
    expect(bereichsprotokollEintrag(undefined, {}, { am: "x", von: "s1", einheit: "e1" })).toBeNull();
  });
});

describe("Teil A — Oberfläche (nur lesend, nur Leitung und Planung)", () => {
  const g = () => schreibeAls(bestand({ plan: { [`a1|${MO}`]: "b1" } }), "SV", (m) => { m.bereichsPlan = { [`a1|${MO}`]: "b2" }; });
  it("zeigt wer, wann, Person, Tag und Bereich vorher → nachher in Worten; andere Einheit: keine Einträge", () => {
    const m = g().mandanten[0];
    const html = renderToStaticMarkup(h(BereichsProtokoll, { m, einheitId: "e1" }));
    for (const t of ["Änderungen der Schichtverantwortung", "V Ns1", "V Na1", MO, "Wohnbereich Nord → Wohnbereich Süd"]) expect(html).toContain(t);
    expect(renderToStaticMarkup(h(BereichsProtokoll, { m, einheitId: "e2" }))).toContain("Keine Änderungen");
  });
  it("Schichtverantwortung (einheit) sieht die Liste nicht; Leitung/Planung (voll) sehen sie", () => {
    const m = g().mandanten[0];
    const k = (recht) => ({ m, einheitId: "e1", datum: MO, personenImDienst: [], bereichSchreiben: recht, eigeneEinheit: "e1", akt: { setzeFeld: () => {} } });
    expect(renderToStaticMarkup(h(BereichsErgaenzung, { k: k("einheit") }))).not.toContain("Änderungen der Schichtverantwortung");
    expect(renderToStaticMarkup(h(BereichsErgaenzung, { k: k("voll") }))).toContain("Änderungen der Schichtverantwortung");
  });
});

/* ======================================================================== */
const WIRT = "127.0.0.1:3000";
let wurzel, S, nr = 0, raumNr = 0;

async function server() {
  vi.resetModules();
  vi.doMock("../server/lib/branchenmodule.mjs", async (echt) => {
    const e = /** @type {any} */ (await echt());
    return { ...e, BRANCHENMODULE: Object.freeze(e.BRANCHENMODULE.map((x) => (x.id === "bereichsplan" ? { ...x, status: "vorlaeufig" } : x))) };
  });
  const schutz = await import("../server/lib/schutz.mjs");
  for (const art of Object.keys(schutz.GRENZEN)) schutz.GRENZEN[art] = { ...schutz.GRENZEN[art], versuche: 1000000 };
  const { getStore } = await import("../server/lib/ablage.mjs");
  return { laden: () => getStore({ name: "centric", consistency: "strong" }), daten: (await import("../server/funktionen/daten.mjs")).default,
    B: await import("../server/lib/bestand.mjs"), G: await import("../server/lib/gestalt.mjs"), sitzungAnlegen: (await import("../server/lib/sitzungen.mjs")).sitzungAnlegen,
    Z: await import("../server/lib/zeiterfassung.mjs") };
}
async function anfrage(pfad, { methode = "GET", rumpf, token } = {}) {
  nr += 1;
  const kopf = { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.78.${Math.floor(nr / 250) % 250}.${nr % 250}` };
  if (methode !== "GET") kopf["content-type"] = "application/json";
  if (token) kopf.authorization = `Bearer ${token}`;
  const a = await S.daten(new Request(`http://${WIRT}${pfad}`, { method: methode, headers: kopf,
    ...(methode === "GET" ? {} : { body: JSON.stringify(rumpf || {}) }) }), {});
  let d = {}; try { d = await a.json(); } catch { /* leer */ }
  return { status: a.status, ...d };
}
const ROLLEN = { SV: { rolle: "subplaner", person: "s1", einheit: "e1" }, LT: { rolle: "leitung", person: "l1" }, BR: { rolle: "betriebsrat", person: "b1" } };
async function raum(protokoll) {
  const name = `wp194p-${++raumNr}`;
  const g = bestand(protokoll ? { protokoll } : {});
  g.version = 9;
  g.mandanten[0].status = "aktiv";
  await S.B.bestandSchreiben(S.laden(), name, S.G.personenAngleichen(g), { durch: "Pruefung" });
  const token = async (k) => (await S.sitzungAnlegen({ bestand: name, name: `V N${ROLLEN[k].person}`, rolle: ROLLEN[k].rolle, person: ROLLEN[k].person,
    betrieb: 0, mandantId: "m1", einheit: ROLLEN[k].einheit || null }, 2 * 3600 * 1000)).token;
  return { name, sv: await token("SV"), lt: await token("LT"), br: await token("BR") };
}
const gespeichert = async (name) => (await S.B.bestandLesenStreng(S.laden(), name)).bestand.mandanten[0];
/** Schreibt als SV über PUT („voll“) oder den Teilweg („teil“) den neuen Bereichsplan aus der Sicht. */
async function svSchreibt(r, weg, neuerPlan, token = r.sv) {
  const g = await anfrage("/api/bestand", { token });
  const m = g.bestand.mandanten.find((x) => x && x.id === "m1");
  const plan = neuerPlan(kopie(m.bereichsPlan || {}));
  if (weg === "voll") {
    const b = kopie(g.bestand);
    b.mandanten.find((x) => x && x.id === "m1").bereichsPlan = plan;
    return anfrage("/api/bestand", { methode: "PUT", token, rumpf: { bestand: b, etag: g.etag, durch: "Pruefung" } });
  }
  return anfrage("/api/bestand/teile", { methode: "POST", token, rumpf: { format: 1, epoche: g.teile.epoche, durch: "Pruefung",
    kern: { bereichsPlan: { basis: g.teile.versionen["kern:bereichsPlan"] ?? null, wert: plan } } } });
}

describe("Teil B — über die echten Handler (PUT und Teilweg)", { timeout: 300000 }, () => {
  let tag;
  beforeAll(async () => {
    wurzel = await mkdtemp(path.join(tmpdir(), "centric-wp194p-"));
    process.env.CENTRIC_DATEN = wurzel;
    process.env.CENTRIC_ABLAGE = "dateien";
    process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
    process.env.CENTRIC_TEILSPEICHERUNG = "true";
    S = await server();
    const heute = S.Z.heuteBerlin();
    tag = (n) => S.Z.tagePlus(heute, n);
  }, 120000);
  afterAll(async () => {
    delete process.env.CENTRIC_TEILSPEICHERUNG;
    vi.doUnmock("../server/lib/branchenmodule.mjs");
    vi.resetModules();
    if (wurzel) await rm(wurzel, { recursive: true, force: true });
  });

  for (const weg of ["voll", "teil"]) {
    it(`${weg}: angenommen → Zuordnung und Eintrag gespeichert; Leitung liest ihn, Betriebsrat nicht`, async () => {
      const r = await raum();
      const w = await svSchreibt(r, weg, (p) => ({ ...p, [`a1|${tag(2)}`]: "b2" }));
      expect(w.status, JSON.stringify(w).slice(0, 300)).toBe(200);
      const m = await gespeichert(r.name);
      expect(m.bereichsPlan[`a1|${tag(2)}`]).toBe("b2");
      const neu = m.einstellungen.modulprotokoll.filter((x) => x.art === BEREICH_PROTOKOLL_ART);
      expect(neu).toHaveLength(1);
      expect(neu[0]).toMatchObject({ von: "s1", einheit: "e1", anzahl: 1, zuordnungen: [{ person: "a1", tag: tag(2), vorher: null, nachher: "b2" }] });
      expect(m.einstellungen.modulprotokoll[0]).toEqual(ALTEINTRAG);
      const lt = await anfrage("/api/bestand", { token: r.lt });
      expect(lt.bestand.mandanten[0].einstellungen.modulprotokoll.filter((x) => x.art === BEREICH_PROTOKOLL_ART)).toEqual(neu);
      const br = await anfrage("/api/bestand", { token: r.br });
      expect(JSON.stringify(br.bestand.mandanten[0].einstellungen || {})).not.toMatch(/bereich-zuordnung|zuordnungen/);
    });

    it(`${weg}: abgewiesen (fremde Person, fremder Bereich) → Platte unverändert, Zuordnung UND Protokoll`, async () => {
      for (const [was, fn] of [["fremde Person", (p) => ({ ...p, [`x2|${tag(2)}`]: "b1" })], ["fremder Bereich", (p) => ({ ...p, [`a1|${tag(2)}`]: "b3" })]]) {
        const r = await raum();
        const vorher = await gespeichert(r.name);
        const w = await svSchreibt(r, weg, fn);
        expect(w.status, `${was} ${w.status}`).toBe(403);
        const nachher = await gespeichert(r.name);
        expect(nachher.bereichsPlan, was).toEqual(vorher.bereichsPlan);
        expect(nachher.einstellungen.modulprotokoll, was).toEqual(vorher.einstellungen.modulprotokoll);
      }
    });

    it(`${weg}: Zuordnungsart voll (Altbestand) → SV 403, Platte unverändert; Leitung speichert Zuordnung wie vorher`, async () => {
      const r = await raum([ALTEINTRAG, ...fuellBereich(BEREICH_PROTOKOLL_GRENZEN.eintraege)]);
      const vorher = await gespeichert(r.name);
      const w = await svSchreibt(r, weg, (p) => ({ ...p, [`a1|${tag(2)}`]: "b2" }));
      expect(w.status).toBe(403);
      expect(String(w.text || w.fehler)).toMatch(/Änderungsprotokoll der Zuordnungen ist voll/);
      const nachher = await gespeichert(r.name);
      expect(nachher.bereichsPlan).toEqual(vorher.bereichsPlan);
      expect(nachher.einstellungen.modulprotokoll).toEqual(vorher.einstellungen.modulprotokoll);
      const l = await svSchreibt(r, weg, (p) => ({ ...p, [`a1|${tag(2)}`]: "b2" }), r.lt);
      expect(l.status, JSON.stringify(l).slice(0, 300)).toBe(200);
      const nachL = await gespeichert(r.name);
      expect(nachL.bereichsPlan[`a1|${tag(2)}`]).toBe("b2");
      expect(nachL.einstellungen.modulprotokoll).toEqual(vorher.einstellungen.modulprotokoll);
    });
  }
});
