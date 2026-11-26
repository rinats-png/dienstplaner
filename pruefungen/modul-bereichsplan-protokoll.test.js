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
import { BRANCHENMODULE, MODULPROTOKOLL_GRENZE, modulProtokollZeilen, moduleinstellungenSicht, modulprotokollBelegt, branchenmoduleZusammen,
  GRUNDLAGE_MAX, MODULPROTOKOLL_BYTES, modulprotokollBelegtBytes, modulprotokollUeberGrenze }
  from "../server/lib/branchenmodule.mjs";
import { bereichsprotokollEintrag, bereichsprotokollAnhaengen, BEREICH_PROTOKOLL_ART, BEREICH_GRENZEN, BEREICH_PROTOKOLL_GRENZEN, protokollBytes,
  bereichsprotokollVoll, bereichsprotokollExport, bereichsprotokollArchivieren, bereichsprotokollPruefsumme, BEREICH_LUECKE_ART, BEREICH_LUECKE_GRENZE,
  bereichsprotokollLueckeOffen, bereichsprotokollLueckeHoechstzahl } from "../server/lib/modul-bereichsplan.mjs";
import { createHash } from "node:crypto";
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
    /* E1: Das Gespeicherte bleibt byte-gleich davor; dazu genau ein Eintrag der Leitung/Planung (eigenes Kontingent). */
    expect(protokollVon(w).slice(0, -1), r).toEqual(protokollVon(g));
    expect(protokollVon(w).at(-1), r).toMatchObject({ art: BEREICH_PROTOKOLL_ART, rolle: r === "LT" ? "leitung" : "planung", anzahl: 1 });
  }
}
const neueEintraege = (g) => protokollVon(g).filter((x) => x.art === BEREICH_PROTOKOLL_ART);
/** n kleine Einträge von Leitung/Planung (eigenes Kontingent, Review #590 B-2). */
const fuellVoll = (n) => Array.from({ length: n }, (_, i) => ({ art: BEREICH_PROTOKOLL_ART, modul: "bereichsplan", am: "2026-10-01T08:00:00.000Z",
  von: "l1", rolle: "leitung", einheit: "e1", anzahl: 1, zuordnungen: [{ person: "a1", tag: MO, vorher: `v${i}`, nachher: null }] }));
const luecken = (g) => protokollVon(g).filter((x) => x.art === BEREICH_LUECKE_ART);

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
  }, 120000);

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
  }, 120000);

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

  /* Vorher „Stand E1 (Entscheidung offen)“: erwartete KEINEN Eintrag für Planung und Leitung. Gekippt durch die Betreiberentscheidung E1
     (2026-11-26): auch Leitung und Planung werden protokolliert — die Erwartung ist jetzt genau ein Eintrag mit Rolle (Teil E1 unten). */
  it("E1 (entschieden): Planung, Leitung und Kundenrolle schreiben Zuordnungen → genau ein Eintrag mit Rolle", () => {
    for (const [r, rolle, von] of [["PL", "planung", "p1"], ["LT", "leitung", "l1"], ["KD", "kunde", "k1"]]) {
      const w = schreibeAls(bestand(), r, (m) => { m.bereichsPlan = { [`a1|${MO}`]: "b1" }; });
      expect(w.verweigert, r).toBeFalsy();
      expect(protokollVon(w), r).toEqual([ALTEINTRAG, expect.objectContaining({ art: BEREICH_PROTOKOLL_ART, rolle, von })]);
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

describe("Teil E1 — Leitung und Planung (Betreiberentscheidung 2026-11-26; Invarianten L1–L10, WP19-MODULPLAN.md 17.1)", () => {
  const vollEintraege = (g) => neueEintraege(g).filter((x) => x.rolle !== undefined);
  /** n Einträge der Leitung (eigenes Kontingent), Kennungen auf Länge `lang` gestreckt. */
  const fuellLeitung = (n, { zuordnungen = 1, lang = 2 } = {}) => Array.from({ length: n }, (_, i) => ({ art: BEREICH_PROTOKOLL_ART, modul: "bereichsplan",
    am: "2026-10-01T08:00:00.000Z", von: "l1".padEnd(lang, "x"), rolle: "leitung", einheit: "e1".padEnd(lang, "x"), anzahl: zuordnungen,
    zuordnungen: Array.from({ length: zuordnungen }, (_, j) => ({ person: "a1".padEnd(lang, "x"), tag: MO, vorher: `v${i}-${j}`.padEnd(lang, "x"), nachher: null })) }));

  it("L2: Form — gleiche Art und gleicher Inhalt wie bei der SV, dazu `rolle`; nur Kennungen; Gespeichertes byte-gleich davor", () => {
    const vorher = Date.now();
    const g = bestand({ plan: { [`a1|${MO}`]: "b1" } });
    const r = schreibeAls(g, "PL", (m) => { m.bereichsPlan = { [`a1|${MO}`]: "b2", [`s1|${DI}`]: "b1" }; });
    expect(r.verweigert).toBeFalsy();
    const p = protokollVon(r);
    expect(p[0]).toEqual(ALTEINTRAG);
    expect(p).toHaveLength(2);
    expect(Object.keys(p[1]).sort()).toEqual(["am", "anzahl", "art", "einheit", "modul", "rolle", "von", "zuordnungen"]);
    expect(p[1]).toMatchObject({ art: "bereich-zuordnung", modul: "bereichsplan", von: "p1", rolle: "planung", einheit: "e1", anzahl: 2,
      zuordnungen: [{ person: "a1", tag: MO, vorher: "b1", nachher: "b2" }, { person: "s1", tag: DI, vorher: null, nachher: "b1" }] });
    expect(Date.parse(p[1].am)).toBeGreaterThanOrEqual(vorher - 1000);
    expect(JSON.stringify(p[1])).not.toMatch(/Wohnbereich|Na1|Ns1|Np1/);
  });

  it("L2: unverändertes Speichern und Speichern anderer Felder → kein Eintrag; über mehrere Einheiten → einheit null", () => {
    const g = bestand({ plan: { [`a1|${MO}`]: "b1" } });
    for (const r of ["LT", "PL"]) {
      expect(protokollVon(schreibeAls(g, r, () => {})), r).toEqual([ALTEINTRAG]);
      expect(protokollVon(schreibeAls(g, r, (m) => { m.abweichungen = { [`a1|${MO}`]: "F" }; })), r).toEqual([ALTEINTRAG]);
    }
    const quer = schreibeAls(g, "LT", (m) => { m.bereichsPlan = { [`a1|${MO}`]: "b1", [`x2|${MO}`]: "b3", [`a1|${DI}`]: "b2" }; });
    expect(vollEintraege(quer)[0]).toMatchObject({ einheit: null, anzahl: 2 });
  });

  it("L4: jede Absage im vollen Weg → kein Ergebnis; Zuordnung und Protokoll bleiben, wie sie sind", () => {
    const faelle = {
      "unbekannter Bereich": (m) => { m.bereichsPlan = { [`a1|${MO}`]: "b9" }; },
      "Schlüssel ungültig": (m) => { m.bereichsPlan = { "a1|2026-02-30": "b1" }; },
      "Bereich mit Zuordnung entfernt": (m) => { m.bereichsPlan = { [`a1|${MO}`]: "b2" }; m.einheiten[0].bereiche = m.einheiten[0].bereiche.filter((b) => b.id !== "b2"); },
    };
    for (const [was, fn] of Object.entries(faelle)) for (const r of ["LT", "PL"]) {
      const g = bestand({ plan: { [`s1|${MO}`]: "b1" } });
      const vorher = kopie(g);
      const w = schreibeAls(g, r, fn);
      expect(w.verweigert, `${was} ${r}`).toBeTruthy();
      expect(w.mandanten, was).toBeUndefined();
      expect(g, was).toEqual(vorher);
    }
  });

  it("L5: mehr als 100 Zuordnungen in einem Speichern → nie abgewiesen, ein verdichteter Eintrag (Anzahl, Prüfsumme, keine Einzelwerte)", () => {
    const J = BEREICH_PROTOKOLL_GRENZEN.jeSpeichern;
    const plan = (n) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`a1|${tagPlus(-300 + i)}`, "b1"]));
    const genau = schreibeAls(bestand(), "LT", (m) => { m.bereichsPlan = plan(J); });
    expect(vollEintraege(genau)[0].zuordnungen).toHaveLength(J);
    const g = bestand();
    const r = schreibeAls(g, "LT", (m) => { m.bereichsPlan = plan(J + 1); });
    expect(r.verweigert).toBeFalsy();
    expect(Object.keys(r.mandanten[0].bereichsPlan)).toHaveLength(J + 1);
    const e = vollEintraege(r)[0];
    expect(Object.keys(e).sort()).toEqual(["am", "anzahl", "art", "einheit", "modul", "pruefsumme", "rolle", "verdichtet", "von"]);
    expect(e).toMatchObject({ anzahl: J + 1, verdichtet: true, rolle: "leitung", einheit: "e1" });
    const liste = bereichsprotokollEintrag(g.mandanten[0].bereichsPlan, r.mandanten[0].bereichsPlan, { am: "x", von: "l1", einheit: null }).zuordnungen;
    expect(e.pruefsumme).toBe(createHash("sha256").update(JSON.stringify(liste), "utf8").digest("hex"));
    expect(JSON.stringify(e)).not.toMatch(/a1\||"tag"|"zuordnungen"|"vorher"/);
    /* Alles gelöscht (die Leitung lässt bereichsPlan weg, Modul wirkt): eine Änderung je Zuordnung, verdichtet. */
    const weg = schreibeAls(r, "PL", (m) => { delete m.bereichsPlan; });
    expect(weg.verweigert).toBeFalsy();
    expect(weg.mandanten[0].bereichsPlan).toBeUndefined();
    expect(vollEintraege(weg).at(-1)).toMatchObject({ rolle: "planung", anzahl: J + 1, verdichtet: true });
  });

  it("L6: SV-Art voll (2000 SV-Einträge) → SV abgewiesen, Leitung und Planung speichern und protokollieren weiter", () => {
    const g = bestand({ protokoll: fuellBereich(BEREICH_PROTOKOLL_GRENZEN.eintraege) });
    expect(schreibeAls(g, "SV", (m) => { m.bereichsPlan = { [`a1|${MO}`]: "b1" }; }).verweigert).toMatch(/voll/);
    for (const r of ["LT", "PL"]) {
      const w = schreibeAls(g, r, (m) => { m.bereichsPlan = { [`a1|${MO}`]: "b1" }; });
      expect(w.verweigert, r).toBeFalsy();
      expect(vollEintraege(w), r).toHaveLength(1);
    }
  });

  it("L6/L7: Kontingent von Leitung/Planung erschöpft → Speichern geht durch, kein Einzeleintrag, ein Lückenvermerk (Review #590 B-2); SV bleibt frei", () => {
    const G = BEREICH_PROTOKOLL_GRENZEN.eintraege;
    const platz = schreibeAls(bestand({ protokoll: fuellLeitung(G - 1) }), "PL", (m) => { m.bereichsPlan = { [`a1|${MO}`]: "b1" }; });
    expect(vollEintraege(platz)).toHaveLength(G);
    const g = bestand({ protokoll: fuellLeitung(G) });
    const vorher = kopie(protokollVon(g));
    for (const r of ["LT", "PL"]) {
      const w = schreibeAls(g, r, (m) => { m.bereichsPlan = { [`a1|${MO}`]: "b1" }; });
      expect(w.verweigert, r).toBeFalsy();
      expect(w.mandanten[0].bereichsPlan, r).toEqual({ [`a1|${MO}`]: "b1" });
      /* Vorher (vor #590 B-2): Protokoll unverändert, Spur nur die Zeile. Jetzt: dauerhafter Lückenvermerk im selben Schreiben. */
      expect(protokollVon(w).slice(0, -1), r).toEqual(vorher);
      expect(protokollVon(w).at(-1), r).toEqual({ art: BEREICH_LUECKE_ART, modul: "bereichsplan", am: expect.any(String), von: r === "LT" ? "l1" : "p1", rolle: r === "LT" ? "leitung" : "planung" });
      expect(modulProtokollZeilen(g, w), r).toEqual([`Branchenmodul bereichsplan: Änderungsprotokoll von Leitung und Planung erschöpft (Lückenvermerk durch die ${r === "LT" ? "Leitung" : "Planung"}) — bitte archivieren`,
        "Branchenmodul bereichsplan: 1 Zuordnung ohne Eintrag im Änderungsprotokoll geändert"]);
    }
    /* Die SV wird von Einträgen der Leitung nie ausgesperrt (eigene Zählung). */
    const sv = schreibeAls(g, "SV", (m) => { m.bereichsPlan = { [`a1|${MO}`]: "b2" }; });
    expect(sv.verweigert).toBeFalsy();
    expect(neueEintraege(sv).at(-1)).toMatchObject({ von: "s1", einheit: "e1" });
    expect(neueEintraege(sv).at(-1)).not.toHaveProperty("rolle");
    /* Gesamtbytes des Kontingents ebenso (rein): genau passend gespeichert, ein Byte weniger → voll. */
    const alt = { bereichsPlan: {} }, neu = { bereichsPlan: { [`a1|${MO}`]: "b1" }, einstellungen: { modulprotokoll: fuellLeitung(2) } };
    const e = bereichsprotokollVoll(alt, neu, { am: "x", von: "l1", rolle: "leitung" }).eintrag;
    const grenze = protokollBytes(fuellLeitung(2)) + protokollBytes(e);
    expect(bereichsprotokollVoll(alt, neu, { am: "x", von: "l1", rolle: "leitung", grenzen: { ...BEREICH_PROTOKOLL_GRENZEN, gesamtBytes: grenze } }).voll).toBeUndefined();
    expect(bereichsprotokollVoll(alt, neu, { am: "x", von: "l1", rolle: "leitung", grenzen: { ...BEREICH_PROTOKOLL_GRENZEN, gesamtBytes: grenze - 1 } }).voll).toBe(true);
  });

  /* Review #590 B-1: vorher mit dem KLEINSTEN gemeinsamen Eintragstyp gemessen (fuellAndere, ≈ 88 B) — falsch. Jetzt der größte Typ
     (Mitbestimmung, Grundlage GRUNDLAGE_MAX Zeichen) in drei Zeichenklassen, alle eigenen Grenzen voll, Lückenvermerke bis zur Höchstzahl. */
  for (const [klasse, z] of [["ASCII", "x"], ["Umlaut", "ä"], ["3-Byte", "€"]]) it(`L6 Worst Case (gemessen, ${klasse}): alle Grenzen mit größten Einträgen voll — Modulprotokoll < 45 % RUMPF_MAX; Leitung speichert`, () => {
    const RUMPF_MAX = 6 * 1024 * 1024;
    const k = () => z.repeat(60);
    const gross = (rolle, n) => ({ art: BEREICH_PROTOKOLL_ART, modul: "bereichsplan", am: "2026-11-26T10:00:00.000Z", von: k(), ...(rolle ? { rolle } : {}),
      einheit: k(), anzahl: n, zuordnungen: Array.from({ length: n }, () => ({ person: k(), tag: MO, vorher: k(), nachher: k() })) });
    const fuell = (rolle) => { let n = 100; while (protokollBytes(gross(rolle, n)) > BEREICH_PROTOKOLL_GRENZEN.eintragBytes) n--;
      const l = []; while (protokollBytes([...l, gross(rolle, n)]) <= BEREICH_PROTOKOLL_GRENZEN.gesamtBytes) l.push(gross(rolle, n)); return l; };
    const sv = fuell(null), lt = fuell("leitung");
    const mb = { art: "mitbestimmung", modul: "bereichsplan", am: "2026-11-26T10:00:00.000Z", von: k(), grundlage: z.repeat(GRUNDLAGE_MAX) };
    const andere = []; while (modulprotokollBelegtBytes([...andere, mb]) <= MODULPROTOKOLL_BYTES) andere.push(mb);
    const lu = Array.from({ length: BEREICH_LUECKE_GRENZE }, () => ({ art: BEREICH_LUECKE_ART, modul: "bereichsplan", am: "2026-11-26T10:00:00.000Z", von: k(), rolle: "planung" }));
    /* An der Bytegrenze: eine weitere Bestätigung passt nicht mehr (die Grenze greift vor der Zahl 2000). */
    expect(modulprotokollUeberGrenze(andere, [mb], "Ausschalten")).toMatch(/Größengrenze/);
    expect(andere.length).toBeLessThan(MODULPROTOKOLL_GRENZE);
    const g = bestand({ protokoll: [...andere, ...sv, ...lt, ...lu] });
    const w = schreibeAls(g, "LT", (m) => { m.bereichsPlan = { [`a1|${MO}`]: "b1" }; });
    expect(w.verweigert).toBeFalsy();
    expect(w.mandanten[0].bereichsPlan[`a1|${MO}`]).toBe("b1");
    /* Nicht abgewiesen; Gespeichertes byte-gleich davor, höchstens ein kleiner Eintrag dazu (passt er nicht mehr: keiner). */
    expect(protokollVon(w).slice(0, protokollVon(g).length)).toEqual(protokollVon(g));
    expect(protokollVon(w).length - protokollVon(g).length).toBeLessThanOrEqual(1);
    expect(protokollBytes(vollEintraege(w))).toBeLessThanOrEqual(BEREICH_PROTOKOLL_GRENZEN.gesamtBytes);
    /* Gemessen (WP19-MODULPLAN.md 17.1 L6, e1-groesse): Modulprotokoll ≤ 2 731 042 B (3-Byte) = 43 % RUMPF_MAX. */
    expect(protokollBytes(protokollVon(w))).toBeLessThan(0.45 * RUMPF_MAX);
    expect(protokollBytes(sv)).toBeLessThanOrEqual(BEREICH_PROTOKOLL_GRENZEN.gesamtBytes);
    expect(protokollBytes(lt)).toBeLessThanOrEqual(BEREICH_PROTOKOLL_GRENZEN.gesamtBytes);
    expect(protokollBytes(w.mandanten[0])).toBeLessThan(RUMPF_MAX / 2);
  }, 120000);

  it("L1/L3: mitgeschicktes Protokoll zählt nicht — Leitung leert oder fälscht es im selben Speichern: Gespeichertes plus genau ein Eintrag des Servers", () => {
    const g = schreibeAls(bestand(), "SV", (m) => { m.bereichsPlan = { [`a1|${MO}`]: "b1" }; });
    const vorher = kopie(protokollVon(g));
    for (const fn of [(m) => { m.einstellungen.modulprotokoll = []; }, (m) => { m.einstellungen.modulprotokoll.push({ art: BEREICH_PROTOKOLL_ART, rolle: "leitung", von: "x" }); }]) {
      const r = schreibeAls(g, "LT", (m) => { fn(m); m.bereichsPlan = { [`a1|${MO}`]: "b2" }; });
      expect(r.verweigert).toBeFalsy();
      expect(protokollVon(r).slice(0, -1)).toEqual(vorher);
      expect(protokollVon(r).at(-1)).toMatchObject({ rolle: "leitung", von: "l1", zuordnungen: [{ person: "a1", tag: MO, vorher: "b1", nachher: "b2" }] });
    }
  });

  it("L8: Modul geplant (echte Registry) oder aus → Leitung/Planung abgewiesen, kein Eintrag; Ausnahmeweg Art. 17 → kein Zuordnungseintrag, eigene Spur", () => {
    for (const r of ["LT", "PL"]) {
      const g = bestand();
      const vorher = kopie(g);
      expect(schreibeAlsEcht(g, r, (m) => { m.bereichsPlan = { [`a1|${MO}`]: "b1" }; }).verweigert, r).toMatch(/wirkt in diesem Betrieb nicht/);
      expect(g).toEqual(vorher);
    }
    const EIN = "2026-10-01T08:00:00.000Z";
    const aus = bestand({ plan: { [`a1|${MO}`]: "b1", [`s1|${MO}`]: "b2" } });
    aus.mandanten[0].einstellungen.branchenmodule = { bereichsplan: { an: false, eingeschaltetAm: EIN, geaendertAm: EIN, geaendertVon: "l1" } };
    expect(schreibeAls(aus, "LT", (m) => { m.bereichsPlan = { [`a1|${MO}`]: "b2" }; }).verweigert).toMatch(/nur lesbar/);
    const loesch = { modul: "bereichsplan", art: "loeschung", grund: "art17", eintraege: { bereichsPlan: [`a1|${MO}`] } };
    const art17 = schreibeAls(aus, "LT", (m) => { delete m.bereichsPlan[`a1|${MO}`]; m.moduldatenAusnahme = loesch; });
    expect(art17.verweigert, art17.verweigert).toBeFalsy();
    expect(art17.mandanten[0].bereichsPlan).toEqual({ [`s1|${MO}`]: "b2" });
    expect(neueEintraege(art17)).toEqual([]);
    expect(JSON.stringify(protokollVon(art17))).not.toContain(`a1|${MO}`);
    expect(protokollVon(art17).at(-1)).toMatchObject({ art: "moduldaten-loeschung", modul: "bereichsplan", feld: "bereichsPlan", anzahl: 1 });
    expect(modulProtokollZeilen(aus, art17)).toContain("Branchenmodul bereichsplan: 1 Zuordnung ohne Eintrag im Änderungsprotokoll geändert");
  });

  it("L8: Löschlauf der Leitung (Fristablauf, optionen.loeschlauf) → kein Zuordnungseintrag; Zeile „ohne Eintrag“", () => {
    const g = bestand({ plan: { [`a1|${MO}`]: "b1" } });
    const s = kopie(bestandFuerRolle(g, SITZUNGEN.LT));
    delete s.mandanten[0].bereichsPlan[`a1|${MO}`];
    const r = zusammenfuehren(g, s, SITZUNGEN.LT, { liste: AKTIV, loeschlauf: true });
    expect(r.verweigert).toBeFalsy();
    expect(r.mandanten[0].bereichsPlan).toEqual({});
    expect(protokollVon(r)).toEqual([ALTEINTRAG]);
    expect(modulProtokollZeilen(g, r)).toEqual(["Branchenmodul bereichsplan: 1 Zuordnung ohne Eintrag im Änderungsprotokoll geändert"]);
  });

  it("L9: Leitungssitzung ohne Person → von null (keine erfundene Kennung), Eintrag mit Rolle; Mandantentrennung byte-gleich", () => {
    const g = bestand();
    const zweiter = kopie(g.mandanten[0]);
    zweiter.id = "m2"; zweiter.name = "Anderer Betrieb";
    g.mandanten.push(zweiter);
    const sitzung = { ...SITZUNGEN.LT, person: null };
    const s = kopie(bestandFuerRolle(g, sitzung));
    s.mandanten[0].bereichsPlan = { [`a1|${MO}`]: "b1" };
    const r = zusammenfuehren(g, s, sitzung, { liste: AKTIV });
    expect(r.verweigert).toBeFalsy();
    expect(vollEintraege(r)).toEqual([expect.objectContaining({ von: null, rolle: "leitung" })]);
    expect(r.mandanten.find((m) => m.id === "m2")).toEqual(zweiter);
  });

  it("L10: Lesen — Leitung/Planung vollständig, Betriebsrat nichts davon, SV/Beschäftigte kein Modulprotokoll; Auskunft nur Positivkatalog; Betriebsprotokoll nur Zahl", () => {
    const vorher = bestand();
    const g = schreibeAls(vorher, "LT", (m) => { m.bereichsPlan = { [`a1|${MO}`]: "b1", [`s1|${MO}`]: "b2" }; });
    for (const r of ["LT", "PL"]) expect(neueEintraege(bestandFuerRolle(g, SITZUNGEN[r])), r).toEqual(neueEintraege(g));
    for (const r of ["SV", "MA"]) expect(bestandFuerRolle(g, SITZUNGEN[r]).mandanten[0].einstellungen.modulprotokoll, r).toBeUndefined();
    const br = bestandFuerRolle(g, SITZUNGEN.BR).mandanten[0].einstellungen.modulprotokoll || [];
    expect(br).toEqual([ALTEINTRAG]);
    expect(JSON.stringify(br)).not.toMatch(/zuordnungen|rolle|a1\|/);
    const m = g.mandanten[0];
    const a = auskunftBauen(m, m.personen.find((p) => p.id === "l1"), { raum: "r", erstellt: "2026-11-26T10:00:00.000Z", umfang: "selbst" });
    expect(a.modulhandlungen.filter((x) => x.art === BEREICH_PROTOKOLL_ART).map((x) => Object.keys(x).sort()))
      .toEqual([["am", "anzahl", "art", "modul", "von"]]);
    expect(modulProtokollZeilen(vorher, g)).toEqual(["Branchenmodul bereichsplan: 2 Zuordnungen durch die Leitung geändert"]);
    const viele = Object.fromEntries(Array.from({ length: 101 }, (_, i) => [`a1|${tagPlus(-200 + i)}`, "b1"]));
    const v = schreibeAls(g, "PL", (x) => { x.bereichsPlan = { ...x.bereichsPlan, ...viele }; });
    expect(modulProtokollZeilen(g, v)).toEqual(["Branchenmodul bereichsplan: 101 Zuordnungen durch die Planung geändert (zusammengefasst)"]);
  });

  it("A1/E1: Archivierung greift für Einträge von Leitung und Planung (gleiche Art) — Export und Entfernen der ältesten n", async () => {
    let g = schreibeAls(bestand(), "SV", (m) => { m.bereichsPlan = { [`a1|${MO}`]: "b1" }; });
    g = schreibeAls(g, "LT", (m) => { m.bereichsPlan = { [`a1|${MO}`]: "b2" }; });
    g = schreibeAls(g, "PL", (m) => { m.bereichsPlan = { [`a1|${MO}`]: "b1" }; });
    const e = g.mandanten[0].einstellungen;
    const ex = bereichsprotokollExport(e);
    expect(ex.eintraege.map((x) => x.rolle ?? "sv")).toEqual(["sv", "leitung", "planung"]);
    const r = await bereichsprotokollArchivieren(e, { anzahl: 3, bytes: ex.bytes, pruefsumme: await bereichsprotokollPruefsumme(ex.text), exportGespeichert: true },
      { am: "2026-11-26T10:00:00.000Z", von: "l1" });
    expect(r).not.toHaveProperty("status");
    expect(r.einstellungen.modulprotokoll.filter((x) => x.art === BEREICH_PROTOKOLL_ART)).toEqual([]);
    expect(r.einstellungen.modulprotokoll[0]).toEqual(ALTEINTRAG);
  });
});

describe("Review #590 B-1 — Bytegrenze der gemeinsamen Einträge", () => {
  const EIN = "2026-10-01T08:00:00.000Z";
  const mb = (z = "€") => ({ art: "mitbestimmung", modul: "bereichsplan", am: EIN, von: "l1", grundlage: z.repeat(GRUNDLAGE_MAX) });
  /** Größte Einträge bis kurz vor die Grenze, dann ein Füllstück, sodass die Bytes GENAU die Grenze treffen. */
  const anDerGrenze = () => {
    const l = []; while (modulprotokollBelegtBytes([...l, mb()]) <= MODULPROTOKOLL_BYTES) l.push(mb());
    const leer = modulprotokollBelegtBytes([...l, { art: "parameter", modul: "bereichsplan", von: "" }]);
    l.push({ art: "parameter", modul: "bereichsplan", von: "x".repeat(MODULPROTOKOLL_BYTES - leer) });
    expect(modulprotokollBelegtBytes(l)).toBe(MODULPROTOKOLL_BYTES);
    return l;
  };
  const vorgabe = { id: "v1", name: "Vorgabe v1", beschreibung: "x", regelart: "grenzregel", parameter: { groesse: "Überstunden im Monat", hoechstens: 10 },
    geltung: { art: "betrieb" }, bezug: "monat", staerke: "muss", prioritaet: 1, grundlage: { art: "hausregel" }, status: "entwurf" };

  it("genau an der Grenze (±1 Byte): gleich der Grenze passt, ein Byte mehr nicht; Mehrbyte zählt nach UTF-8", () => {
    const leer = modulprotokollBelegtBytes([{ art: "parameter", modul: "x", von: "" }]);
    const mit = (n, z = "x") => ({ art: "parameter", modul: "x", von: z.repeat(n) });
    const n = MODULPROTOKOLL_BYTES - leer;
    expect(modulprotokollBelegtBytes([mit(n)])).toBe(MODULPROTOKOLL_BYTES);
    expect(modulprotokollUeberGrenze([], [mit(n)], "Ausschalten")).toBeNull();
    expect(modulprotokollUeberGrenze([], [mit(n + 1)], "Ausschalten")).toMatch(/Größengrenze von 512 KiB/);
    expect(modulprotokollUeberGrenze([], [mit(Math.floor(n / 3) + 1, "€")], "Ausschalten")).toMatch(/Größengrenze/);
    /* Zuordnungen und Lückenvermerke zählen nicht mit (eigene Grenzen). */
    expect(modulprotokollBelegtBytes([...fuellVoll(50), { art: BEREICH_LUECKE_ART }])).toBe(2);
    expect(modulprotokollBelegt([...fuellVoll(50), { art: BEREICH_LUECKE_ART }])).toBe(0);
  });

  it("an der Bytegrenze (größter Typ, 3-Byte): Einschalten und Vorgabe anlegen abgewiesen, Ausschalten geht; Zuordnen nie blockiert", () => {
    const voll = anDerGrenze();
    expect(voll.length).toBeLessThan(MODULPROTOKOLL_GRENZE);                          // vorher (nur Zahl) wäre hier noch Platz gewesen
    const g = bestand({ protokoll: voll });
    const m = g.mandanten[0];
    const ein = branchenmoduleZusammen({ ...m, einstellungen: { ...m.einstellungen, branchenmodule: {} } },
      { ...m, einstellungen: { ...m.einstellungen, branchenmodule: { bereichsplan: { an: true } } } }, { person: "l1" }, true, AKTIV);
    expect(ein.grund).toMatch(/Größengrenze von 512 KiB ist erreicht\. Ausschalten geht weiter/);
    const aus = branchenmoduleZusammen(m, { ...m, einstellungen: { ...m.einstellungen, branchenmodule: { bereichsplan: { an: false } } } }, { person: "l1" }, true, AKTIV);
    expect(aus.grund).toBeUndefined();
    expect(aus.mandant.einstellungen.modulprotokoll.at(-1)).toMatchObject({ art: "ausgeschaltet" });
    const vg = vorgabenZusammen(m, { ...m, vorgaben: [vorgabe] }, { darfOrgEdit: true, person: "l1", tarif: "pro", jetzt: "2026-11-26T10:00:00.000Z" });
    expect(vg.grund).toMatch(/Größengrenze von 512 KiB ist erreicht\. Deaktivieren geht weiter/);
    /* Altbestand darüber (zwei Bestätigungen mehr): kein Datenverlust, nur die Sperre neuer gemeinsamer Einträge; Zuordnen geht. */
    const alt = bestand({ protokoll: [...voll, mb(), mb()] });
    const vorher = kopie(alt);
    for (const r of ["LT", "PL"]) {
      const w = schreibeAls(alt, r, (x) => { x.bereichsPlan = { [`a1|${MO}`]: "b1" }; });
      expect(w.verweigert, r).toBeFalsy();
      expect(protokollVon(w).slice(0, -1), r).toEqual(protokollVon(alt));
      expect(protokollVon(w).at(-1), r).toMatchObject({ art: BEREICH_PROTOKOLL_ART, rolle: r === "LT" ? "leitung" : "planung" });
    }
    expect(alt).toEqual(vorher);
  });
});

describe("Review #590 B-2 — Lückenvermerk bei erschöpftem Kontingent", () => {
  const G = BEREICH_PROTOKOLL_GRENZEN.eintraege;
  const zuordnen = (g, r, bereich = "b1", tag = MO) => schreibeAls(g, r, (m) => { m.bereichsPlan = { ...m.bereichsPlan, [`a1|${tag}`]: bereich }; });

  it("Erschöpfung → genau ein Lückenvermerk atomar mit der Änderung; weitere Änderungen derselben Periode → kein zweiter; nie abgewiesen", () => {
    const g = bestand({ protokoll: fuellVoll(G) });
    expect(bereichsprotokollLueckeOffen(protokollVon(g))).toBeNull();
    const w1 = zuordnen(g, "PL");
    expect(w1.verweigert).toBeFalsy();
    expect(w1.mandanten[0].bereichsPlan[`a1|${MO}`]).toBe("b1");
    expect(luecken(w1)).toEqual([{ art: BEREICH_LUECKE_ART, modul: "bereichsplan", am: expect.any(String), von: "p1", rolle: "planung" }]);
    expect(bereichsprotokollLueckeOffen(protokollVon(w1))).toEqual(luecken(w1)[0]);
    const w2 = zuordnen(w1, "LT", "b2");
    expect(w2.verweigert).toBeFalsy();
    expect(w2.mandanten[0].bereichsPlan[`a1|${MO}`]).toBe("b2");
    expect(protokollVon(w2)).toEqual(protokollVon(w1));
    expect(modulProtokollZeilen(w1, w2)).toEqual(["Branchenmodul bereichsplan: 1 Zuordnung ohne Eintrag im Änderungsprotokoll geändert"]);
    /* Absage im selben Schreiben (unbekannter Bereich) → weder Zuordnung noch Lückenvermerk. */
    const vorher = kopie(g);
    expect(zuordnen(g, "PL", "b9").verweigert).toBeTruthy();
    expect(g).toEqual(vorher);
    /* Die Leitung kann den Vermerk über den vollen Weg weder entfernen noch ändern. */
    const weg = schreibeAls(w1, "LT", (m) => { m.einstellungen.modulprotokoll = m.einstellungen.modulprotokoll.filter((x) => x.art !== BEREICH_LUECKE_ART); });
    expect(weg.verweigert).toBeFalsy();
    expect(luecken(weg)).toEqual(luecken(w1));
  });

  it("Archivierung beendet die Periode: Vermerk bleibt (nicht archivierbar), Einzeleinträge laufen wieder, erneute Erschöpfung → neuer Vermerk", async () => {
    const w1 = zuordnen(bestand({ protokoll: fuellVoll(G) }), "PL");
    const e = w1.mandanten[0].einstellungen;
    expect(bereichsprotokollExport(e).eintraege.some((x) => x.art === BEREICH_LUECKE_ART)).toBe(false);
    const ex = bereichsprotokollExport(e, { anzahl: 1 });
    const a = await bereichsprotokollArchivieren(e, { anzahl: 1, bytes: ex.bytes, pruefsumme: await bereichsprotokollPruefsumme(ex.text), exportGespeichert: true },
      { am: "2026-11-26T11:00:00.000Z", von: "l1" });
    expect(a).not.toHaveProperty("status");
    const g2 = kopie(w1); g2.mandanten[0].einstellungen = a.einstellungen;
    expect(luecken(g2)).toEqual(luecken(w1));                                          // Vermerk bleibt als Nachweis
    expect(bereichsprotokollLueckeOffen(protokollVon(g2))).toBeNull();                 // Periode beendet
    const w2 = zuordnen(g2, "LT", "b2");                                               // ein Platz frei → Einzeleintrag
    expect(protokollVon(w2).at(-1)).toMatchObject({ art: BEREICH_PROTOKOLL_ART, rolle: "leitung" });
    const w3 = zuordnen(w2, "PL", "b1");                                               // wieder erschöpft → neue Periode
    expect(luecken(w3)).toHaveLength(2);
    expect(protokollVon(w3).at(-1)).toMatchObject({ art: BEREICH_LUECKE_ART, rolle: "planung" });
  });

  /* Review #590 B-3: Der frühere Test hielt den stillen Zustand an der Höchstzahl für erwartet (kein Vermerk, kein Hinweis). Jetzt: der letzte
     Vermerk trägt hoechstzahl, und die Oberfläche zeigt den Zustand dauerhaft, auch wenn danach kein Vermerk mehr entstehen kann. */
  const geschlossen = (n) => Array.from({ length: n }, () => [{ art: BEREICH_LUECKE_ART, modul: "bereichsplan", am: "2026-10-01T08:00:00.000Z", von: "l1", rolle: "leitung" },
    { art: "bereich-zuordnung-archiviert", modul: "bereichsplan", am: "2026-10-01T09:00:00.000Z", von: "l1", anzahl: 1 }]).flat();
  it("Höchstzahl exakt (±1): Vermerk Nr. GRENZE-1 gewöhnlich, Nr. GRENZE mit hoechstzahl; danach kein Vermerk, aber dauerhaft sichtbar; nie abgewiesen", () => {
    const vor = zuordnen(bestand({ protokoll: [...fuellVoll(G), ...geschlossen(BEREICH_LUECKE_GRENZE - 2)] }), "LT");
    expect(luecken(vor)).toHaveLength(BEREICH_LUECKE_GRENZE - 1);
    expect(luecken(vor).at(-1)).not.toHaveProperty("hoechstzahl");
    expect(bereichsprotokollLueckeHoechstzahl(protokollVon(vor))).toBe(false);
    const g = bestand({ protokoll: [...fuellVoll(G), ...geschlossen(BEREICH_LUECKE_GRENZE - 1)] });
    const w = zuordnen(g, "LT");
    expect(w.verweigert).toBeFalsy();
    expect(luecken(w)).toHaveLength(BEREICH_LUECKE_GRENZE);
    expect(luecken(w).at(-1)).toMatchObject({ rolle: "leitung", hoechstzahl: true });
    expect(bereichsprotokollLueckeHoechstzahl(protokollVon(w))).toBe(true);
    expect(modulProtokollZeilen(g, w)[0]).toMatch(/bitte archivieren; Höchstzahl der Lückenvermerke erreicht$/);
    /* Archivierung beendet die Periode; neue Erschöpfung: kein Vermerk mehr möglich — Speichern geht, der Hinweis bleibt sichtbar. */
    const g2 = kopie(w); g2.mandanten[0].einstellungen.modulprotokoll.push({ art: "bereich-zuordnung-archiviert", modul: "bereichsplan", am: "2026-11-26T11:00:00.000Z", von: "l1", anzahl: 1 });
    const w2 = zuordnen(g2, "PL", "b2");
    expect(w2.verweigert).toBeFalsy();
    expect(w2.mandanten[0].bereichsPlan[`a1|${MO}`]).toBe("b2");
    expect(protokollVon(w2)).toEqual(protokollVon(g2));
    expect(bereichsprotokollLueckeOffen(protokollVon(w2))).toBeNull();
    const html = renderToStaticMarkup(h(BereichsProtokoll, { m: w2.mandanten[0], einheitId: "e1" }));
    expect(html).toContain("Höchstzahl der Lückenvermerke erreicht – ist das Kontingent von Leitung und Planung erschöpft, entstehen Änderungen ohne Einzelnachweis");
    expect(renderToStaticMarkup(h(BereichsProtokoll, { m: vor.mandanten[0], einheitId: "e1" }))).not.toContain("Höchstzahl");
  });

  it("Gegenprobe B-3: Wechsel großer und kleiner Änderungen bei fast vollem Kontingent → EIN Vermerk je Periode; kleine bekommen Einzeleinträge", () => {
    /* Kontingent nach Bytes fast voll: Platz für kleine (1 Zuordnung), nicht für große (40 Zuordnungen). */
    const pad = (n) => ({ art: BEREICH_PROTOKOLL_ART, modul: "bereichsplan", am: "2026-10-01T08:00:00.000Z", von: "l1", rolle: "leitung", einheit: "e1", anzahl: 1,
      zuordnungen: [{ person: "a1", tag: MO, vorher: "x".repeat(n), nachher: null }] });
    const liste = []; while (protokollBytes([...liste, pad(30000)]) <= BEREICH_PROTOKOLL_GRENZEN.gesamtBytes - 40000) liste.push(pad(30000));
    const ziel = BEREICH_PROTOKOLL_GRENZEN.gesamtBytes - 1500;
    liste.push(pad(0)); liste[liste.length - 1] = pad(ziel - protokollBytes(liste));
    expect(protokollBytes(liste)).toBe(ziel);
    let g = bestand({ protokoll: liste });
    const gross = (b) => (m) => { m.bereichsPlan = { ...m.bereichsPlan, ...Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`a1|${tagPlus(-100 + i)}`, b])) }; };
    let klein = 0;
    for (let i = 0; i < 6; i++) {
      const gr = schreibeAls(g, i % 2 ? "LT" : "PL", gross(i % 2 ? "b1" : "b2"));
      expect(gr.verweigert, String(i)).toBeFalsy();
      g = gr;
      const kl = schreibeAls(g, "PL", (m) => { m.bereichsPlan = { ...m.bereichsPlan, [`s1|${tagPlus(i)}`]: "b1" }; });
      expect(kl.verweigert, String(i)).toBeFalsy();
      if (protokollVon(kl).length > protokollVon(g).length) { klein += 1; expect(protokollVon(kl).at(-1)).toMatchObject({ art: BEREICH_PROTOKOLL_ART, rolle: "planung" }); }
      g = kl;
    }
    expect(klein).toBeGreaterThan(1);                                                 // kleine Änderungen werden weiter einzeln protokolliert
    expect(luecken(g)).toHaveLength(1);                                                // … und beenden die Periode nicht
    expect(bereichsprotokollLueckeOffen(protokollVon(g))).not.toBeNull();
  }, 120000);

  it("Sicht: Leitung/Planung sehen den Vermerk, Betriebsrat nicht, SV/Beschäftigte kein Modulprotokoll; keine Personendaten außer von", () => {
    const w = zuordnen(bestand({ protokoll: [ALTEINTRAG, ...fuellVoll(G)] }), "PL");
    for (const r of ["LT", "PL"]) expect(luecken(bestandFuerRolle(w, SITZUNGEN[r])), r).toHaveLength(1);
    expect(bestandFuerRolle(w, SITZUNGEN.BR).mandanten[0].einstellungen.modulprotokoll).toEqual([ALTEINTRAG]);
    for (const r of ["SV", "MA"]) expect(bestandFuerRolle(w, SITZUNGEN[r]).mandanten[0].einstellungen.modulprotokoll, r).toBeUndefined();
    expect(Object.keys(luecken(w)[0]).sort()).toEqual(["am", "art", "modul", "rolle", "von"]);
  });

  it("Oberfläche: laufende Periode als Hinweis in jeder Einheit; ein Einzeleintrag beendet sie nicht, erst die Archivierung", () => {
    const w = zuordnen(bestand({ protokoll: fuellVoll(G) }), "PL");
    for (const einheitId of ["e1", "e2"]) {
      const html = renderToStaticMarkup(h(BereichsProtokoll, { m: w.mandanten[0], einheitId }));
      expect(html).toContain("Kontingent erschöpft – Änderungen von Leitung und Planung ab ");
      expect(html).toContain("ohne Einzelnachweis, bitte archivieren.");
    }
    const m = kopie(w.mandanten[0]);
    m.einstellungen.modulprotokoll.push(fuellVoll(1)[0]);
    expect(renderToStaticMarkup(h(BereichsProtokoll, { m, einheitId: "e1" }))).toContain("Kontingent erschöpft");     // vorher (vor B-3): beendet
    m.einstellungen.modulprotokoll.push({ art: "bereich-zuordnung-archiviert", modul: "bereichsplan", am: "2026-11-26T11:00:00.000Z", von: "l1", anzahl: 1 });
    expect(renderToStaticMarkup(h(BereichsProtokoll, { m, einheitId: "e1" }))).not.toContain("Kontingent erschöpft");
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
    /* E1: Überschrift „Änderungsprotokoll der Zuordnungen“ (vorher „Änderungen der Schichtverantwortung“), die Rolle steht am Eintrag. */
    for (const t of ["Änderungsprotokoll der Zuordnungen", "V Ns1 (Schichtverantwortung)", "V Na1", MO, "Wohnbereich Nord → Wohnbereich Süd"]) expect(html).toContain(t);
    expect(renderToStaticMarkup(h(BereichsProtokoll, { m, einheitId: "e2" }))).toContain("Keine Änderungen");
  });
  it("Schichtverantwortung (einheit) sieht die Liste nicht; Leitung/Planung (voll) sehen sie", () => {
    const m = g().mandanten[0];
    const k = (recht) => ({ m, einheitId: "e1", datum: MO, personenImDienst: [], bereichSchreiben: recht, eigeneEinheit: "e1", akt: { setzeFeld: () => {} } });
    expect(renderToStaticMarkup(h(BereichsErgaenzung, { k: k("einheit") }))).not.toContain("Änderungsprotokoll der Zuordnungen");
    expect(renderToStaticMarkup(h(BereichsErgaenzung, { k: k("voll") }))).toContain("Änderungsprotokoll der Zuordnungen");
  });
  it("E1: Einträge von Leitung und Planung mit Rolle in Worten; über mehrere Einheiten in jeder Einheit; verdichtet nur die Anzahl", () => {
    const g1 = schreibeAls(bestand({ plan: { [`a1|${MO}`]: "b1" } }), "PL", (m) => { m.bereichsPlan = { [`a1|${MO}`]: "b2" }; });
    const g2 = schreibeAls(g1, "LT", (m) => { m.bereichsPlan = { ...m.bereichsPlan, [`x2|${MO}`]: "b3", [`a1|${DI}`]: "b1" }; });
    const viele = Object.fromEntries(Array.from({ length: BEREICH_PROTOKOLL_GRENZEN.jeSpeichern + 1 }, (_, i) => [`a1|${tagPlus(-200 + i)}`, "b1"]));
    const g3 = schreibeAls(g2, "LT", (m) => { m.bereichsPlan = { ...m.bereichsPlan, ...viele }; });
    expect(g3.verweigert).toBeFalsy();
    const m = g3.mandanten[0];
    const e1 = renderToStaticMarkup(h(BereichsProtokoll, { m, einheitId: "e1" }));
    expect(e1).toContain("V Np1 (Planung)");
    expect(e1).toContain("Wohnbereich Nord → Wohnbereich Süd");
    expect(e1).toContain("V Nl1 (Leitung, mehrere oder keine Einheit)");
    expect(e1).toContain(`${BEREICH_PROTOKOLL_GRENZEN.jeSpeichern + 1} Zuordnungen geändert (zusammengefasst, ohne Einzelangaben)`);
    const e2 = renderToStaticMarkup(h(BereichsProtokoll, { m, einheitId: "e2" }));
    expect(e2).toContain("Station 3");                                                // Eintrag über e1 und e2 erscheint auch in e2
    expect(e2).not.toContain("(Planung)");                                            // der Eintrag der Planung betrifft nur e1
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
      /* E1: Gespeichertes byte-gleich davor, dazu genau der Eintrag der Leitung (eigenes Kontingent, die volle SV-Art sperrt ihn nicht). */
      expect(nachL.einstellungen.modulprotokoll.slice(0, -1)).toEqual(vorher.einstellungen.modulprotokoll);
      expect(nachL.einstellungen.modulprotokoll.at(-1)).toMatchObject({ art: BEREICH_PROTOKOLL_ART, rolle: "leitung", von: "l1", anzahl: 1 });
    });

    it(`${weg}: #590 B-2 Kontingent erschöpft → Leitung 200, Zuordnung und genau ein Lückenvermerk auf der Platte`, async () => {
      const r = await raum([ALTEINTRAG, ...fuellVoll(BEREICH_PROTOKOLL_GRENZEN.eintraege)]);
      const vorher = await gespeichert(r.name);
      const w = await svSchreibt(r, weg, (p) => ({ ...p, [`a1|${tag(2)}`]: "b2" }), r.lt);
      expect(w.status, JSON.stringify(w).slice(0, 300)).toBe(200);
      const m = await gespeichert(r.name);
      expect(m.bereichsPlan[`a1|${tag(2)}`]).toBe("b2");
      expect(m.einstellungen.modulprotokoll.slice(0, -1)).toEqual(vorher.einstellungen.modulprotokoll);
      expect(m.einstellungen.modulprotokoll.at(-1)).toMatchObject({ art: BEREICH_LUECKE_ART, rolle: "leitung", von: "l1" });
      const w2 = await svSchreibt(r, weg, (p) => ({ ...p, [`a1|${tag(3)}`]: "b1" }), r.lt);
      expect(w2.status).toBe(200);
      expect((await gespeichert(r.name)).einstellungen.modulprotokoll).toEqual(m.einstellungen.modulprotokoll);
    }, 120000);

    it(`${weg}: E1 Leitung — angenommen → Zuordnung und Eintrag mit Rolle gespeichert; abgewiesen → Platte unverändert`, async () => {
      const r = await raum();
      const w = await svSchreibt(r, weg, (p) => ({ ...p, [`a1|${tag(3)}`]: "b1", [`x2|${tag(3)}`]: "b3" }), r.lt);
      expect(w.status, JSON.stringify(w).slice(0, 300)).toBe(200);
      const m = await gespeichert(r.name);
      expect(m.einstellungen.modulprotokoll[0]).toEqual(ALTEINTRAG);
      expect(m.einstellungen.modulprotokoll.filter((x) => x.art === BEREICH_PROTOKOLL_ART)).toEqual([expect.objectContaining({ rolle: "leitung", von: "l1",
        einheit: null, anzahl: 2, zuordnungen: [{ person: "a1", tag: tag(3), vorher: null, nachher: "b1" }, { person: "x2", tag: tag(3), vorher: null, nachher: "b3" }] })]);
      const vorher = await gespeichert(r.name);
      const nein = await svSchreibt(r, weg, (p) => ({ ...p, [`a1|${tag(4)}`]: "b9" }), r.lt);
      expect(nein.status).toBe(403);
      const nachher = await gespeichert(r.name);
      expect(nachher.bereichsPlan).toEqual(vorher.bereichsPlan);
      expect(nachher.einstellungen.modulprotokoll).toEqual(vorher.einstellungen.modulprotokoll);
    });
  }
});
