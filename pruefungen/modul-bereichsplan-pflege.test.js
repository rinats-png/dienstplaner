/* ==========================================================================
   WP-19.4 — Modul Bereichsplan: Zuordnung und Pflege der Bereiche (Pflege)

   Geprüft wird, was nach dem Server-Teilumfang (modul-bereichsplan.test.js) fehlte:
   - Server: neue oder geänderte Zuordnungen müssen auf einen Bereich des Betriebs zeigen, ein Bereich, der
     verschwindet, darf keine Zuordnung zurücklassen; Altbestand blockiert nicht; Ausnahmeweg Art. 16/17 wie beim Postenplan;
   - reine Pflegefunktionen (Bereich anlegen, ändern, Soll setzen, entfernen nur ohne Zuordnung, Zuordnung setzen und lösen);
   - Oberfläche: Zuordnung je Person (Leitung, Planung überall; Schichtverantwortung nur in der eigenen Einheit),
     Pflege der Bereiche nur Leitung und Planung, sonst nur Lesen; Beschäftigte und Betriebsrat sehen kein Feld;
   - Einhängepunkt (src/module/index.js) und Rollen am Server.
   Das Modul bleibt „geplant“; geschrieben wird im Prüfmodus (Registry-Kopie „vorlaeufig“ nur im Test).
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  pruefeBereiche, bereichsplanZusammen, BEREICH_GRENZEN, bereichHinzufuegen, bereichAendern, bereichSollSetzen,
  bereichEntfernen, zuordnungSetzen,
} from "../server/lib/modul-bereichsplan.mjs";
import { BRANCHENMODULE, modulVon } from "../server/lib/branchenmodule.mjs";
import { bestandFuerRolle } from "../server/lib/rechte.mjs";
import { branchenbestand, schreibeAls as schreibeAlsEcht, SITZUNGEN } from "./hilfen/branchenbetrieb.mjs";
import { BereichsZuordnung, BereichsPflege, bereichsSchreibeVon, darfZuordnen } from "../src/module/bereichsplan-pflege.js";
import { MODUL_OBERFLAECHEN, pruefeOberflaechen } from "../src/module/index.js";
import { modulKontext, bereichSchreibenFuer } from "../src/module/zugriff.js";

const AKTIV = BRANCHENMODULE.map((x) => (x.id === "bereichsplan" ? { ...x, status: "vorlaeufig" } : x));
const schreibeAls = (g, r, aendern) => schreibeAlsEcht(g, r, aendern, { liste: AKTIV });
// zeit-ok: der Server prüft Tage gegen die echte Uhr (±2 Jahre); die Testtage sind fest und liegen im Fenster.
const T = "2026-11-10";
const E1 = [{ id: "b1", name: "Wohnbereich Nord", soll: { F: 2 } }, { id: "b2", name: "Wohnbereich Süd", soll: { F: 1 } }];
const E2 = [{ id: "b3", name: "Station 3", soll: { F: 1 } }];
const einheiten = () => [{ id: "e1", versatzTage: 0, bereiche: JSON.parse(JSON.stringify(E1)) }, { id: "e2", versatzTage: 0, bereiche: JSON.parse(JSON.stringify(E2)) }];
const pers = (id) => ({ id, vorname: "Vera", nachname: `Muster${id}` });
const gesamt = () => {
  const g = branchenbestand({ pakete: ["pflege"], branchenmodule: { bereichsplan: { an: true } } });
  const m = g.mandanten[0];
  m.einheiten = einheiten();
  m.dienstarten = [{ id: "F", name: "Früh", start: "06:00", ende: "14:00" }];
  m.bereichsPlan = {};
  return g;
};

describe("Zuordnung auf einen unbekannten Bereich (Server)", () => {
  const alt = { einheiten: einheiten(), bereichsPlan: {} };
  it("ein neuer oder geänderter Eintrag auf einen unbekannten Bereich wird abgewiesen", () => {
    expect(bereichsplanZusammen({ ...alt, bereichsPlan: { [`a1|${T}`]: "b9" } }, alt).grund).toMatch(/gibt es im Betrieb nicht/);
    expect(bereichsplanZusammen({ ...alt, bereichsPlan: { [`a1|${T}`]: "b1" } }, alt)).toEqual({});
    const alt2 = { ...alt, bereichsPlan: { [`a1|${T}`]: "b1" } };
    expect(bereichsplanZusammen({ ...alt2, bereichsPlan: { [`a1|${T}`]: "b9" } }, alt2).grund).toMatch(/gibt es im Betrieb nicht/);
  });
  it("Altbestand blockiert nicht: ein unveränderter Eintrag auf einen längst entfernten Bereich bleibt", () => {
    const a = { einheiten: [{ id: "e1", bereiche: [] }], bereichsPlan: { [`a1|${T}`]: "bAlt" } };
    expect(bereichsplanZusammen({ ...a, bereichsPlan: { ...a.bereichsPlan, [`a2|${T}`]: "bAlt" } }, a).grund).toMatch(/gibt es im Betrieb nicht/);
    expect(bereichsplanZusammen({ ...a }, a)).toEqual({});
    expect(bereichsplanZusammen({ einheiten: a.einheiten, bereichsPlan: {} }, a)).toEqual({});
  });
  it("neue Bereiche und Zuordnung im selben Speichern: der neue Bereich ist bekannt", () => {
    const neu = { einheiten: einheiten(), bereichsPlan: { [`a1|${T}`]: "b2" } };
    expect(bereichsplanZusammen(neu, { einheiten: [{ id: "e1" }], bereichsPlan: {} })).toEqual({});
  });
  it("auf dem Ausnahmeweg Art. 16/17 prüft das Wertschema der Berichtigung, nicht der bekannte Bereich", () => {
    const a = { ...alt, bereichsPlan: { [`a1|${T}`]: "b1" } };
    const neu = { ...a, bereichsPlan: { [`a1|${T}`]: "GARBAGE" } };
    expect(bereichsplanZusammen(neu, a).grund).toMatch(/gibt es im Betrieb nicht/);
    expect(bereichsplanZusammen(neu, a, { bekannt: false })).toEqual({});
  });
  it("ein Bereich, der entfällt, darf keine Zuordnung zurücklassen", () => {
    const a = { einheiten: einheiten(), bereichsPlan: { [`a1|${T}`]: "b2" } };
    const ohneB2 = [{ id: "e1", versatzTage: 0, bereiche: [E1[0]] }, a.einheiten[1]];
    expect(bereichsplanZusammen({ einheiten: ohneB2, bereichsPlan: a.bereichsPlan }, a).grund).toMatch(/entfernter Bereich/);
    expect(bereichsplanZusammen({ einheiten: ohneB2, bereichsPlan: {} }, a)).toEqual({});
  });
  it("B-1: eine ganze Einheit zu löschen bleibt erlaubt, auch mit Altzuordnung auf ihre Bereiche; ein Bereich einer bleibenden Einheit nicht", () => {
    const a = { einheiten: einheiten(), bereichsPlan: { [`a1|${T}`]: "b3" } };
    const ohneE2 = [a.einheiten[0]];
    expect(bereichsplanZusammen({ einheiten: ohneE2, bereichsPlan: a.bereichsPlan }, a)).toEqual({});
    expect(bereichsplanZusammen({ einheiten: ohneE2, bereichsPlan: { ...a.bereichsPlan, [`a2|${T}`]: "b3" } }, a).grund).toMatch(/gibt es im Betrieb nicht/);
    const b = { einheiten: einheiten(), bereichsPlan: { [`a1|${T}`]: "b3" } };
    const ohneB3 = [b.einheiten[0], { ...b.einheiten[1], bereiche: [] }];
    expect(bereichsplanZusammen({ einheiten: ohneB3, bereichsPlan: b.bereichsPlan }, b).grund).toMatch(/entfernter Bereich/);
  });
});

describe("Reine Pflegefunktionen", () => {
  it("Bereich anlegen: eindeutige Kennung über alle Einheiten, Standardname, nichts wird verändert; Grenzen", () => {
    const e = einheiten();
    const kopie = JSON.stringify(e);
    const n = bereichHinzufuegen(e, "e1", "");
    expect(JSON.stringify(e)).toBe(kopie);
    const neu = n[0].bereiche[n[0].bereiche.length - 1];
    expect(neu).toEqual({ id: expect.any(String), name: "Neuer Bereich", soll: {} });
    expect(["b1", "b2", "b3"]).not.toContain(neu.id);
    expect(pruefeBereiche(n)).toBeNull();
    const zwei = bereichHinzufuegen(n, "e2", "Wache  ");
    const ids = zwei.flatMap((x) => x.bereiche.map((b) => b.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(zwei[1].bereiche.at(-1).name).toBe("Wache");
    expect(bereichHinzufuegen(e, "unbekannt", "X")).toBe(e);
    const voll = [{ id: "e1", bereiche: Array.from({ length: BEREICH_GRENZEN.bereicheJeEinheit }, (_, i) => ({ id: `v${i}`, name: "V" })) }];
    expect(bereichHinzufuegen(voll, "e1", "X")).toBe(voll);
  });
  it("Bereich ändern: nur Name und Soll, die Kennung nie; Soll je Dienstart setzen und entfernen", () => {
    const e = einheiten();
    const n = bereichAendern(e, "e1", "b1", { name: "Nord 2", id: "böse", soll: bereichSollSetzen(E1[0].soll, "S", 3), fremd: 1 });
    expect(n[0].bereiche[0]).toEqual({ id: "b1", name: "Nord 2", soll: { F: 2, S: 3 } });
    expect(n[0].bereiche[1]).toEqual(E1[1]);
    expect(n[1]).toEqual(e[1]);
    expect(bereichSollSetzen({ F: 2 }, "F", undefined)).toEqual({});
    expect(bereichSollSetzen({ F: 2 }, "F", Number.NaN)).toEqual({});
    expect(bereichSollSetzen(undefined, "F", 1)).toEqual({ F: 1 });
    expect(pruefeBereiche(bereichAendern(e, "e1", "b1", { soll: { F: -1 } }))).toMatch(/Sollbesetzung/);
  });
  it("Entfernen ist nur ohne Zuordnung im Bereichsplan möglich (sonst bleibt der Plan ohne Bereich)", () => {
    const m = { einheiten: einheiten(), bereichsPlan: { [`a1|${T}`]: "b1", [`a2|${T}`]: "b1" } };
    expect(bereichEntfernen(m, "b1")).toEqual({ grund: expect.stringMatching(/noch 2 Zuordnungen/) });
    expect(bereichEntfernen({ ...m, bereichsPlan: { [`a1|${T}`]: "b1" } }, "b1")).toEqual({ grund: expect.stringMatching(/noch 1 Zuordnung im/) });
    expect(bereichEntfernen(m, "b9")).toEqual({ grund: "Bereich unbekannt." });
    const frei = bereichEntfernen(m, "b2");
    expect(frei.einheiten[0].bereiche.map((b) => b.id)).toEqual(["b1"]);
    expect(frei.einheiten[1].bereiche.map((b) => b.id)).toEqual(["b3"]);
    expect(m.einheiten[0].bereiche).toHaveLength(2);
  });
  it("Zuordnung setzen und lösen: neuer Plan, Prüfung von Person, Tag, Bereich und Einheit, Eingabe bleibt unverändert", () => {
    const m = { einheiten: einheiten(), bereichsPlan: { [`a1|${T}`]: "b1" } };
    expect(zuordnungSetzen(m, "a2", T, "b2", "e1")).toEqual({ plan: { [`a1|${T}`]: "b1", [`a2|${T}`]: "b2" } });
    expect(zuordnungSetzen(m, "a1", T, "", "e1")).toEqual({ plan: {} });
    expect(zuordnungSetzen(m, "a1", T, null)).toEqual({ plan: {} });
    expect(m.bereichsPlan).toEqual({ [`a1|${T}`]: "b1" });
    expect(zuordnungSetzen(m, "a2", T, "b9", "e1")).toEqual({ grund: "Bereich unbekannt." });
    expect(zuordnungSetzen(m, "a2", T, "b3", "e1")).toEqual({ grund: "Der Bereich gehört nicht zu dieser Einheit." });
    expect(zuordnungSetzen(m, "a2", T, "b3")).toEqual({ plan: expect.any(Object) });
    expect(zuordnungSetzen(m, "a|2", T, "b1")).toEqual({ grund: "Person ungültig." });
    expect(zuordnungSetzen(m, "", T, "b1")).toEqual({ grund: "Person ungültig." });
    expect(zuordnungSetzen(m, "a2", "2026-13-40", "b1")).toEqual({ grund: expect.stringMatching(/Tag ungültig/) });
    expect(zuordnungSetzen(m, "a2", "2031-01-01", "b1")).toEqual({ grund: expect.stringMatching(/zwei Jahre/) });
  });
});

describe("Oberfläche", () => {
  const m = { einheiten: einheiten(), bereichsPlan: { [`a1|${T}`]: "b1" }, dienstarten: [{ id: "F", name: "Früh" }] };
  const personen = [pers("a1"), pers("a2")];
  const markup = (el) => renderToStaticMarkup(el);
  it("ohne Schreibweg keine Zuordnungsfelder; mit Schreibweg je Person ein beschriftetes Auswahlfeld nur mit den Bereichen der Einheit", () => {
    const lesen = markup(h(BereichsZuordnung, { m, einheitId: "e1", datum: T, personenImDienst: personen, schreibe: null }));
    expect(lesen).not.toMatch(/<select/);
    const html = markup(h(BereichsZuordnung, { m, einheitId: "e1", datum: T, personenImDienst: personen, schreibe: () => {} }));
    expect(html.match(/<select/g)).toHaveLength(2);
    expect(html).toMatch(/aria-label="Bereich für Vera Musteraa?1/);
    expect(html).toMatch(/<option value="b1" selected/);
    expect(html).toMatch(/Wohnbereich Süd/);
    expect(html).not.toMatch(/Station 3/);
    expect(markup(h(BereichsZuordnung, { m, einheitId: "e9", datum: T, personenImDienst: personen, schreibe: () => {} }))).toBe("");
  });
  it("Pflege ohne Schreibweg: nur der Hinweis, keine Eingabefelder", () => {
    const html = markup(h(BereichsPflegeOhne()));
    expect(html).toMatch(/Leitung oder die Planung/);
    expect(html).not.toMatch(/<input|<button|<select|<textarea/);
  });
  it("Pflege mit Schreibweg: Bereiche der Einheit bearbeitbar, Soll je Dienstart; fremde Einheit nicht", () => {
    const html = markup(h(BereichsPflege, { m, einheitId: "e1", schreibe: () => {} }));
    expect(html).toMatch(/Wohnbereich Nord/);
    expect(html).toMatch(/Soll im Dienst Früh/);
    expect(html).toMatch(/Bereich hinzufügen/);
    expect(html).toMatch(/Änderungen übernehmen/);
    expect(html).not.toMatch(/Station 3/);
    expect(html).not.toMatch(/width:\s*\d{3,}px/);
    expect(html).not.toMatch(/#[0-9a-f]{3,6}\b|rgb\(/i);
  });
  it("Schreibweg aus dem Kontext: nur mit Recht der Rolle und Aktion; einheiten nur mit vollem Recht", () => {
    const gesetzt = [];
    const akt = { setzeFeld: (feld, wert) => gesetzt.push([feld, wert]) };
    expect(bereichsSchreibeVon({ bereichSchreiben: null, akt })).toBeNull();
    expect(bereichsSchreibeVon({ bereichSchreiben: "voll" })).toBeNull();
    expect(bereichsSchreibeVon({ bereichSchreiben: "voll", akt: {} })).toBeNull();
    expect(bereichsSchreibeVon({ bereichSchreiben: "alle", akt })).toBeNull();
    expect(bereichsSchreibeVon(null)).toBeNull();
    const voll = bereichsSchreibeVon({ bereichSchreiben: "voll", akt });
    voll("name", "x"); voll("objekte", []); voll("einheiten", [1]); voll("bereichsPlan", {});
    expect(gesetzt).toEqual([["einheiten", [1]], ["bereichsPlan", {}]]);
    gesetzt.length = 0;
    const sv = bereichsSchreibeVon({ bereichSchreiben: "einheit", akt });
    sv("einheiten", [1]); sv("bereichsPlan", { a: 1 });
    expect(gesetzt).toEqual([["bereichsPlan", { a: 1 }]]);
  });
  it("Schichtverantwortung ordnet nur in der eigenen Einheit zu; Leitung und Planung überall; sonst nie", () => {
    expect(darfZuordnen({ bereichSchreiben: "voll" }, "e2")).toBe(true);
    expect(darfZuordnen({ bereichSchreiben: "einheit", eigeneEinheit: "e1" }, "e1")).toBe(true);
    expect(darfZuordnen({ bereichSchreiben: "einheit", eigeneEinheit: "e1" }, "e2")).toBe(false);
    expect(darfZuordnen({ bereichSchreiben: "einheit", eigeneEinheit: null }, "e1")).toBe(false);
    expect(darfZuordnen({ bereichSchreiben: "einheit", eigeneEinheit: "" }, "")).toBe(false);
    expect(darfZuordnen({ bereichSchreiben: null, eigeneEinheit: "e1" }, "e1")).toBe(false);
    expect(darfZuordnen(null, "e1")).toBe(false);
  });
  it("Einhängepunkt: genau eine Oberfläche (Tag) mit Übersicht, Zuordnung und Pflege; Rollen sehen nur, was sie dürfen", () => {
    expect(pruefeOberflaechen()).toEqual([]);
    const e = MODUL_OBERFLAECHEN.filter((x) => x.modul === "bereichsplan");
    expect(e.map((x) => x.ort)).toEqual(["tag"]);
    const k = { m, einheitId: "e1", datum: T, dienstId: "F", personenImDienst: personen, akt: { setzeFeld: () => {} } };
    const lt = markup(e[0].ansicht({ ...k, bereichSchreiben: "voll" }));
    expect(lt).toMatch(/Zuordnung am/);
    expect(lt).toMatch(/Bereich hinzufügen/);
    const sv = markup(e[0].ansicht({ ...k, bereichSchreiben: "einheit", eigeneEinheit: "e1" }));
    expect(sv).toMatch(/Zuordnung am/);
    expect(sv).not.toMatch(/Bereich hinzufügen|Änderungen übernehmen/);
    const svFremd = markup(e[0].ansicht({ ...k, bereichSchreiben: "einheit", eigeneEinheit: "e2" }));
    expect(svFremd).not.toMatch(/<select|<input|<button/);
    const ohne = markup(e[0].ansicht({ ...k, bereichSchreiben: null }));
    expect(ohne).not.toMatch(/<select|<input|<button/);
    expect(ohne).toMatch(/Wohnbereich Nord/);
  });
});
function BereichsPflegeOhne() { return () => h(BereichsPflege, { m: { einheiten: einheiten() }, einheitId: "e1", schreibe: null }); }

describe("Rollen (Schreibweg der Oberfläche und Server)", () => {
  it("Leitung und Planung voll, Schichtverantwortung nur Einheit; Beschäftigte, Betriebsrat, Altrollen und Unbekanntes nichts", () => {
    expect(bereichSchreibenFuer("leitung")).toBe("voll");
    expect(bereichSchreibenFuer("planer")).toBe("voll");
    expect(bereichSchreibenFuer("subplaner")).toBe("einheit");
    for (const r of ["mitarbeiter", "betriebsrat", "kunde", "betreiber", "", null, undefined, "LT", "SV"]) expect(bereichSchreibenFuer(r), String(r)).toBeNull();
    expect(modulKontext({ sitz: { rolle: "planer", person: { id: "p1" }, mandant: {} } }).bereichSchreiben).toBe("voll");
    expect(modulKontext({ sitz: { rolle: "subplaner", person: { id: "s1", bereich: "e1" }, mandant: {} } })).toMatchObject({ bereichSchreiben: "einheit", eigeneEinheit: "e1" });
    expect(modulKontext({ sitz: { rolle: "mitarbeiter", person: { id: "a1" }, mandant: {} } }).bereichSchreiben).toBeNull();
    expect(modulKontext({}).bereichSchreiben).toBeNull();
  });
  it("Server: Planung speichert Bereiche und Zuordnung; Beschäftigte und Betriebsrat nicht", () => {
    const g = gesamt();
    const pl = schreibeAls(g, "PL", (m) => {
      m.einheiten[0].bereiche = [...m.einheiten[0].bereiche, { id: "b7", name: "Neu", soll: { F: 1 } }];
      m.bereichsPlan = { [`a1|${T}`]: "b7" };
    });
    expect(pl.verweigert).toBeUndefined();
    expect(pl.mandanten[0].bereichsPlan).toEqual({ [`a1|${T}`]: "b7" });
    expect(pl.mandanten[0].einheiten[0].bereiche.map((b) => b.id)).toContain("b7");
    for (const r of ["MA", "BR"]) {
      const v = schreibeAls(g, r, (m) => { m.bereichsPlan = { [`a1|${T}`]: "b1" }; });
      expect(v === null || !!v.verweigert || Object.keys(v.mandanten[0].bereichsPlan || {}).length === 0, r).toBe(true);
    }
  });
  it("Server: Planung kann keine Zuordnung auf einen unbekannten Bereich speichern und keinen zugeordneten Bereich entfernen", () => {
    const g = gesamt();
    expect(schreibeAls(g, "PL", (m) => { m.bereichsPlan = { [`a1|${T}`]: "b9" }; }).verweigert).toMatch(/gibt es im Betrieb nicht/);
    const mit = schreibeAls(g, "LT", (m) => { m.bereichsPlan = { [`a1|${T}`]: "b2" }; });
    expect(mit.verweigert).toBeUndefined();
    expect(schreibeAls(mit, "LT", (m) => { m.einheiten[0].bereiche = [m.einheiten[0].bereiche[0]]; }).verweigert).toMatch(/entfernter Bereich/);
    const frei = schreibeAls(mit, "LT", (m) => { m.einheiten[0].bereiche = [m.einheiten[0].bereiche[0]]; m.bereichsPlan = {}; });
    expect(frei.verweigert).toBeUndefined();
  });
  it("B-1 Server: Die Leitung löscht eine Einheit samt Bereichen und Altzuordnung, mit wirkendem und mit geplantem Modul", () => {
    const g = gesamt();
    g.mandanten[0].bereichsPlan = { [`a1|${T}`]: "b3" };
    const weg = (m) => { m.einheiten = m.einheiten.filter((e) => e.id !== "e2"); };
    const an = schreibeAls(g, "LT", weg);
    expect(an && an.verweigert, an && an.verweigert).toBeFalsy();
    expect(an.mandanten[0].einheiten.map((e) => e.id)).toEqual(["e1"]);
    const geplant = schreibeAlsEcht(g, "LT", weg);
    expect(geplant && geplant.verweigert, geplant && geplant.verweigert).toBeFalsy();
    expect(geplant.mandanten[0].einheiten.map((e) => e.id)).toEqual(["e1"]);
    const bleibt = schreibeAls(g, "LT", (m) => { m.einheiten[1].bereiche = []; });
    expect(bleibt.verweigert).toMatch(/entfernter Bereich/);
  });
  it("Server: Bei Status geplant bleibt der Schreibweg geschlossen (Platte unverändert)", () => {
    const g = gesamt();
    const vorher = JSON.stringify(g);
    for (const r of ["PL", "LT"]) {
      const v = schreibeAlsEcht(g, r, (m) => { m.bereichsPlan = { [`a1|${T}`]: "b1" }; });
      expect(v.verweigert, r).toMatch(/wirkt in diesem Betrieb nicht/);
    }
    expect(JSON.stringify(g)).toBe(vorher);
    expect(modulVon("bereichsplan").status).toBe("geplant");
  });
  it("Server: Die Sicht der Beschäftigten bleibt unverändert (kein fremder Bereichsplan)", () => {
    const g = gesamt();
    g.mandanten[0].bereichsPlan = { [`a1|${T}`]: "b1", [`a2|${T}`]: "b2" };
    const a1 = bestandFuerRolle(g, SITZUNGEN.MA).mandanten[0].bereichsPlan || {};
    expect(Object.keys(a1).filter((k) => !k.startsWith("a1|"))).toEqual([]);
  });
});
