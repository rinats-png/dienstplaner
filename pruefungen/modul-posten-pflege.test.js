/* ==========================================================================
   WP-19.1 — Modul Posten: Pflege, Einteilung, Alleinarbeit, Übernahme (Rest nach #49)

   Geprüft wird, was nach dem Server-Teilumfang (modul-posten.test.js) fehlte:
   - Alleinarbeit je Posten (P4): Feld, Form, Hinweis bei Einzelbesetzung, ohne Personenbezug und ohne
     Zusage eines Notsignals;
   - unbekannter Posten im Postenplan wird bei neuen oder geänderten Einträgen abgewiesen;
   - Übernahme der Posten-Dienstarten des Bestands als Vorschlag (G10 a), ohne Pflicht;
   - reine Pflegefunktionen (Objekt, Posten, Einteilung, Entfernen nur ohne Einteilung);
   - Aufwandsbudget: Lage in einem Durchlauf über die Personen;
   - Oberfläche: Pflege und Einteilung nur mit Schreibweg (Leitung, Planung), sonst nur Lesen;
   - Einhängepunkte (src/module/index.js) und Rollen am Server (Planung ja, Schichtverantwortung/Beschäftigte nein).
   Das Modul bleibt „geplant“; geschrieben wird im Prüfmodus (Registry-Kopie „vorlaeufig“ nur im Test).
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  pruefeObjekte, postenZusammen, postenLage, POSTEN_GRENZEN, alleinarbeitHinweis, objekteAusDienstarten,
  einteilungSetzen, objektHinzufuegen, postenHinzufuegen, postenAendern, sollSetzen, objektEntfernen, postenEntfernen,
} from "../server/lib/modul-posten.mjs";
import { BRANCHENMODULE } from "../server/lib/branchenmodule.mjs";
import { branchenbestand, schreibeAls as schreibeAlsEcht, SITZUNGEN } from "./hilfen/branchenbetrieb.mjs";
import { bestandFuerRolle } from "../server/lib/rechte.mjs";
import { PostenHinweise, PostenEinteilung, PostenPflege, postenSchreibeVon } from "../src/module/posten-pflege.js";
import { MODUL_OBERFLAECHEN, pruefeOberflaechen } from "../src/module/index.js";
import { modulKontext, postenSchreibenFuer } from "../src/module/zugriff.js";

const AKTIV = BRANCHENMODULE.map((x) => (x.id === "posten" ? { ...x, status: "vorlaeufig" } : x));
const schreibeAls = (g, r, aendern) => schreibeAlsEcht(g, r, aendern, { liste: AKTIV });
// zeit-ok: die Laufzeitgrenze des Aufwandsbudgets misst echte Zeit; der Server prüft Tage gegen die echte Uhr (±2 Jahre), die Testtage sind fest.
const heuteIso = "2026-11-25";
const OBJEKTE = [{ id: "o1", name: "Objekt Nord", posten: [
  { id: "po1", name: "Pforte", soll: { F: 1 }, qualifikationen: [], alleinarbeit: true, gefaehrdungsbeurteilung: "GB-2026-04" },
  { id: "po2", name: "Rundgang", soll: { F: 2 }, qualifikationen: [] }] }];
const pers = (id) => ({ id, vorname: "Vera", nachname: `Muster${id}` });
const gesamt = () => {
  const g = branchenbestand({ pakete: ["sicherheit"], branchenmodule: { posten: { an: true } } });
  g.mandanten[0].objekte = JSON.parse(JSON.stringify(OBJEKTE));
  g.mandanten[0].postenPlan = {};
  return g;
};

describe("Alleinarbeit je Posten (P4)", () => {
  it("Feld alleinarbeit (Wahrheitswert) und Verweis auf die Gefährdungsbeurteilung sind gültig", () => {
    expect(pruefeObjekte(OBJEKTE)).toBeNull();
  });
  it("weist falsche Typen und zu lange Verweise ab", () => {
    const mit = (extra) => [{ id: "o1", name: "O", posten: [{ id: "p", name: "P", ...extra }] }];
    expect(pruefeObjekte(mit({ alleinarbeit: "ja" }))).toMatch(/Alleinarbeit/);
    expect(pruefeObjekte(mit({ alleinarbeit: 1 }))).toMatch(/Alleinarbeit/);
    expect(pruefeObjekte(mit({ gefaehrdungsbeurteilung: 5 }))).toMatch(/Gefährdungsbeurteilung/);
    expect(pruefeObjekte(mit({ gefaehrdungsbeurteilung: "x".repeat(POSTEN_GRENZEN.textMax + 1) }))).toMatch(/Gefährdungsbeurteilung/);
    expect(pruefeObjekte(mit({ alleinarbeit: false, gefaehrdungsbeurteilung: "" }))).toBeNull();
  });
  it("Hinweis nur bei Alleinarbeitsposten mit genau einer Person; ohne Namen, ohne Zusage eines Notsignals", () => {
    const p = OBJEKTE[0].posten[0];
    const text = alleinarbeitHinweis(p, 1);
    expect(text).toMatch(/Gefährdungsbeurteilung/);
    expect(text).toMatch(/GB-2026-04/);
    expect(text).not.toMatch(/notsignal|notruf|garantiert/i);
    expect(alleinarbeitHinweis(p, 2)).toBeNull();
    expect(alleinarbeitHinweis(p, 0)).toBeNull();
    expect(alleinarbeitHinweis({ ...p, alleinarbeit: false }, 1)).toBeNull();
    expect(alleinarbeitHinweis({ id: "x", name: "X" }, 1)).toBeNull();
  });
  it("die Lage trägt den Hinweis, der Hinweis nennt keine Person", () => {
    const m = { objekte: OBJEKTE, postenPlan: { [`a1|${heuteIso}`]: "po1" } };
    const lage = postenLage(m, heuteIso, "F", [pers("a1"), pers("a2")]);
    const po1 = lage.find((x) => x.posten === "po1");
    expect(po1.alleinarbeitHinweis).toMatch(/Gefährdungsbeurteilung/);
    expect(po1.alleinarbeitHinweis).not.toMatch(/Vera|Muster/);
    expect(lage.find((x) => x.posten === "po2").alleinarbeitHinweis).toBeNull();
  });
});

describe("Aufwandsbudget der Lage", () => {
  it("große Betriebe (viele Posten und Personen) werden in einem Durchlauf über die Personen gerechnet", () => {
    const posten = Array.from({ length: 200 }, (_, i) => ({ id: `p${i}`, name: `P${i}`, soll: { F: 1 } }));
    const objekte = Array.from({ length: 100 }, (_, o) => ({ id: `o${o}`, name: `O${o}`, posten: posten.map((p) => ({ ...p, id: `${p.id}-${o}` })) }));
    const personen = Array.from({ length: 1000 }, (_, i) => pers(`x${i}`));
    const plan = Object.fromEntries(personen.map((p, i) => [`${p.id}|${heuteIso}`, `p${i % 200}-${i % 100}`]));
    const t0 = Date.now();
    const lage = postenLage({ objekte, postenPlan: plan }, heuteIso, "F", personen);
    expect(Date.now() - t0).toBeLessThan(1500);
    expect(lage).toHaveLength(20000);
    expect(lage.reduce((s, x) => s + x.ist.length, 0)).toBe(1000);
  });
  it("Ist behält die Reihenfolge der Personen im Dienst", () => {
    const m = { objekte: OBJEKTE, postenPlan: { [`b|${heuteIso}`]: "po2", [`a|${heuteIso}`]: "po2" } };
    expect(postenLage(m, heuteIso, "F", [pers("b"), pers("a")]).find((x) => x.posten === "po2").ist).toEqual(["b", "a"]);
  });
});

describe("Unbekannter Posten im Postenplan (Server)", () => {
  const T = "2026-11-10";
  it("ein neuer oder geänderter Eintrag auf einen unbekannten Posten wird abgewiesen", () => {
    const alt = { objekte: OBJEKTE, postenPlan: {} };
    expect(postenZusammen({ ...alt, postenPlan: { [`a1|${T}`]: "po9" } }, alt).grund).toMatch(/Posten/);
    expect(postenZusammen({ ...alt, postenPlan: { [`a1|${T}`]: "po1" } }, alt)).toEqual({});
    const alt2 = { objekte: OBJEKTE, postenPlan: { [`a1|${T}`]: "po1" } };
    expect(postenZusammen({ ...alt2, postenPlan: { [`a1|${T}`]: "po9" } }, alt2).grund).toMatch(/Posten/);
  });
  it("Altbestand blockiert nicht: ein unveränderter Eintrag auf einen längst entfernten Posten bleibt", () => {
    const alt = { objekte: [], postenPlan: { [`a1|${T}`]: "poAlt" } };
    expect(postenZusammen({ ...alt, postenPlan: { ...alt.postenPlan, [`a2|${T}`]: "poAlt" } }, alt).grund).toMatch(/Posten/);
    expect(postenZusammen({ ...alt }, alt)).toEqual({});
    expect(postenZusammen({ objekte: [], postenPlan: {} }, alt)).toEqual({});
  });
  it("neue Objekte und Einteilung im selben Speichern: der neue Posten ist bekannt", () => {
    const neu = { objekte: OBJEKTE, postenPlan: { [`a1|${T}`]: "po2" } };
    expect(postenZusammen(neu, { objekte: [], postenPlan: {} })).toEqual({});
  });
});

describe("Ausnahmeweg und verwaiste Einteilungen (Server)", () => {
  const T = "2026-11-10";
  it("auf dem Ausnahmeweg Art. 16/17 prüft das Wertschema der Berichtigung, nicht der bekannte Posten (F6)", () => {
    const alt = { objekte: OBJEKTE, postenPlan: { [`a1|${T}`]: "po1" } };
    const neu = { ...alt, postenPlan: { [`a1|${T}`]: "GARBAGE" } };
    expect(postenZusammen(neu, alt).grund).toMatch(/gibt es im Betrieb nicht/);
    expect(postenZusammen(neu, alt, { bekannt: false })).toEqual({});
  });
  it("ein Posten, der aus den Objekten entfällt, darf keine Einteilung zurücklassen", () => {
    const alt = { objekte: OBJEKTE, postenPlan: { [`a1|${T}`]: "po2" } };
    const ohnePo2 = [{ ...OBJEKTE[0], posten: [OBJEKTE[0].posten[0]] }];
    expect(postenZusammen({ objekte: ohnePo2, postenPlan: alt.postenPlan }, alt).grund).toMatch(/entfernter Posten/);
    expect(postenZusammen({ objekte: ohnePo2, postenPlan: {} }, alt)).toEqual({});
    /* ein Posten ohne Einteilung darf entfallen; Altbestand auf längst unbekannte Posten blockiert nicht */
    expect(postenZusammen({ objekte: ohnePo2, postenPlan: { [`a1|${T}`]: "poAlt" } }, { objekte: ohnePo2, postenPlan: { [`a1|${T}`]: "poAlt" } })).toEqual({});
  });
});

describe("Übernahme der Posten-Dienstarten des Bestands (G10 a, nur Vorschlag)", () => {
  const dienstarten = [
    { id: "F", name: "Früh", start: "06:00", ende: "14:00" },
    { id: "PF", name: "Objektwache Tag", ort: "Objekt Nord", posten: true, quelle: "F", mindest: { mo_do: 4, fr: 4, sa: 4, so: 4 } },
    { id: "PS", name: "Torwache", ort: "Objekt Nord", posten: true, quelle: "S", mindest: { mo_do: 2 } },
    { id: "PX", name: "Parkplatz", ort: "Objekt Süd", posten: true, quelle: null, mindest: {} }];
  it("legt je Ort ein Objekt und je Posten-Dienstart einen Posten an; Soll aus dem Mindestwert; gültig", () => {
    const r = objekteAusDienstarten({ dienstarten, objekte: [] });
    expect(r.neu).toBe(3);
    expect(r.objekte.map((o) => o.name)).toEqual(["Objekt Nord", "Objekt Süd"]);
    const nord = r.objekte[0];
    expect(nord.posten.map((p) => p.name)).toEqual(["Objektwache Tag", "Torwache"]);
    expect(nord.posten[0].soll).toEqual({ F: 4 });
    expect(nord.posten[1].soll).toEqual({ S: 2 });
    expect(r.objekte[1].posten[0].soll).toBeUndefined();
    expect(pruefeObjekte(r.objekte)).toBeNull();
  });
  it("ist wiederholbar ohne Doppelte und lässt Vorhandenes unverändert", () => {
    const eins = objekteAusDienstarten({ dienstarten, objekte: [] });
    const zwei = objekteAusDienstarten({ dienstarten, objekte: eins.objekte });
    expect(zwei.neu).toBe(0);
    expect(zwei.objekte).toEqual(eins.objekte);
    const eigen = [{ id: "o1", name: "objekt nord", posten: [{ id: "x", name: "Eigener Posten", soll: { F: 9 } }] }];
    const drei = objekteAusDienstarten({ dienstarten, objekte: eigen });
    expect(drei.objekte[0].posten.map((p) => p.name)).toEqual(["Eigener Posten", "Objektwache Tag", "Torwache"]);
    expect(drei.objekte[0].posten[0].soll).toEqual({ F: 9 });
  });
  it("ohne Posten-Dienstarten: nichts; Eingabe wird nicht verändert; Obergrenzen gelten", () => {
    const m = { dienstarten: [{ id: "F" }], objekte: [] };
    expect(objekteAusDienstarten(m)).toEqual({ objekte: [], neu: 0 });
    const kopie = JSON.stringify({ dienstarten, objekte: [] });
    const eingabe = { dienstarten, objekte: [] };
    objekteAusDienstarten(eingabe);
    expect(JSON.stringify(eingabe)).toBe(kopie);
    const viele = Array.from({ length: 700 }, (_, i) => ({ id: `D${i}`, name: `W${i}`, ort: `Ort ${i}`, posten: true, mindest: { mo_do: 1 } }));
    const r = objekteAusDienstarten({ dienstarten: viele, objekte: [] });
    expect(r.objekte.length).toBeLessThanOrEqual(POSTEN_GRENZEN.objekte);
    expect(pruefeObjekte(r.objekte)).toBeNull();
  });
});

describe("Reine Pflegefunktionen", () => {
  it("Objekt und Posten anlegen: eindeutige Kennungen, nichts wird verändert", () => {
    const o0 = [];
    const o1 = objektHinzufuegen(o0, "Objekt Ost");
    const o2 = objektHinzufuegen(o1, "Objekt West");
    expect(o0).toEqual([]);
    expect(new Set(o2.map((o) => o.id)).size).toBe(2);
    const o3 = postenHinzufuegen(o2, o2[0].id, "Pforte");
    expect(o3[0].posten).toHaveLength(1);
    expect(o2[0].posten).toEqual([]);
    expect(pruefeObjekte(o3)).toBeNull();
    expect(postenHinzufuegen(o2, "unbekannt", "X")).toBe(o2);
  });
  it("Posten ändern: nur bekannte Felder; Soll je Dienstart setzen und entfernen", () => {
    const o = postenAendern(OBJEKTE, "o1", "po2", { name: "Streife", alleinarbeit: true, id: "geaendert", beliebig: 1 });
    const p = o[0].posten[1];
    expect(p).toMatchObject({ id: "po2", name: "Streife", alleinarbeit: true });
    expect(p.beliebig).toBeUndefined();
    expect(OBJEKTE[0].posten[1].name).toBe("Rundgang");
    expect(sollSetzen({ F: 2 }, "S", 3)).toEqual({ F: 2, S: 3 });
    expect(sollSetzen({ F: 2 }, "F", undefined)).toEqual({});
    expect(sollSetzen(undefined, "F", 1)).toEqual({ F: 1 });
    expect(pruefeObjekte(postenAendern(OBJEKTE, "o1", "po1", { soll: sollSetzen({ F: 1 }, "F", 1.5) }))).toMatch(/Sollbesetzung/);
  });
  it("Entfernen ist nur ohne Einteilung im Postenplan möglich (sonst bleibt der Plan ohne Posten)", () => {
    const m = { objekte: OBJEKTE, postenPlan: { [`a1|${heuteIso}`]: "po1" } };
    expect(postenEntfernen(m, "po1").grund).toMatch(/1 Einteilung/);
    expect(postenEntfernen(m, "po2").objekte[0].posten.map((p) => p.id)).toEqual(["po1"]);
    expect(objektEntfernen(m, "o1").grund).toMatch(/Einteilung/);
    expect(objektEntfernen({ objekte: OBJEKTE, postenPlan: {} }, "o1").objekte).toEqual([]);
    expect(postenEntfernen(m, "gibtsnicht").grund).toMatch(/unbekannt/i);
  });
  it("Einteilung setzen und lösen: neuer Plan, Prüfung von Tag und Posten, Eingabe bleibt unverändert", () => {
    const m = { objekte: OBJEKTE, postenPlan: {} };
    const r = einteilungSetzen(m, "a1", heuteIso, "po1");
    expect(r.plan).toEqual({ [`a1|${heuteIso}`]: "po1" });
    expect(m.postenPlan).toEqual({});
    expect(einteilungSetzen({ ...m, postenPlan: r.plan }, "a1", heuteIso, "").plan).toEqual({});
    expect(einteilungSetzen(m, "a1", heuteIso, "po9").grund).toMatch(/Posten/);
    expect(einteilungSetzen(m, "a1", "morgen", "po1").grund).toMatch(/Tag/);
    expect(einteilungSetzen(m, "a1", "2099-01-01", "po1").grund).toMatch(/zwei Jahre/);
    expect(einteilungSetzen(m, "", heuteIso, "po1").grund).toMatch(/Person/);
    expect(einteilungSetzen(m, "a|b", heuteIso, "po1").grund).toMatch(/Person/);
  });
});

describe("Oberfläche", () => {
  const m = { objekte: OBJEKTE, postenPlan: { [`a1|${heuteIso}`]: "po1" }, dienstarten: [{ id: "F", name: "Früh" }], qualifikationen: [{ id: "q34a", name: "Sachkunde" }] };
  const personen = [pers("a1"), pers("a2")];
  const markup = (el) => renderToStaticMarkup(el);
  it("Übersicht zeigt den Alleinarbeitshinweis in Worten", () => {
    const html = markup(h(PostenHinweise, { m, datum: heuteIso, dienstId: "F", personenImDienst: personen }));
    expect(html).toMatch(/Alleinarbeit/);
    expect(html).toMatch(/Gefährdungsbeurteilung/);
    expect(html).not.toMatch(/notsignal|notruf/i);
  });
  it("ohne Schreibweg keine Einteilungsfelder; mit Schreibweg je Person ein beschriftetes Auswahlfeld", () => {
    const lesen = markup(h(PostenEinteilung, { m, datum: heuteIso, personenImDienst: personen, schreibe: null }));
    expect(lesen).not.toMatch(/<select/);
    const schreiben = markup(h(PostenEinteilung, { m, datum: heuteIso, personenImDienst: personen, schreibe: () => {} }));
    expect(schreiben.match(/<select/g)).toHaveLength(2);
    expect(schreiben).toMatch(/aria-label="Posten für Vera Musteraa?1/);
    expect(schreiben).toMatch(/<option value="po1" selected/);
    expect(schreiben).toMatch(/Objekt Nord: Pforte/);
  });
  it("Pflege ohne Schreibweg: nur der Hinweis, keine Eingabefelder", () => {
    const html = markup(h(PostenPflege, { m, schreibe: null }));
    expect(html).toMatch(/Leitung oder die Planung/);
    expect(html).not.toMatch(/<input|<button|<select|<textarea/);
  });
  it("Pflege mit Schreibweg: Objekte und Posten bearbeitbar, Soll je Dienstart, Alleinarbeit, Übernahme-Vorschlag", () => {
    const html = markup(h(PostenPflege, { m, schreibe: () => {} }));
    expect(html).toMatch(/Objekt Nord/);
    expect(html).toMatch(/Pforte/);
    expect(html).toMatch(/Früh/);
    expect(html).toMatch(/Alleinarbeit/);
    expect(html).toMatch(/Sachkunde/);
    expect(html).toMatch(/Objekt hinzufügen/);
    expect(html).toMatch(/Aus den Posten-Dienstarten vorschlagen/);
    expect(html).toMatch(/Änderungen übernehmen/);
    expect(html).not.toMatch(/width:\s*\d{3,}px/);
  });
  it("Schreibweg aus dem Kontext: nur mit Recht der Rolle und Aktion; nur die beiden Postenfelder", () => {
    const gesetzt = [];
    const akt = { setzeFeld: (feld, wert) => gesetzt.push([feld, wert]) };
    expect(postenSchreibeVon({ postenSchreiben: false, akt })).toBeNull();
    expect(postenSchreibeVon({ postenSchreiben: true })).toBeNull();
    expect(postenSchreibeVon({ postenSchreiben: true, akt: {} })).toBeNull();
    expect(postenSchreibeVon(null)).toBeNull();
    const w = postenSchreibeVon({ postenSchreiben: true, akt });
    w("name", "x"); w("einstellungen", {}); w("objekte", []); w("postenPlan", {});
    expect(gesetzt).toEqual([["objekte", []], ["postenPlan", {}]]);
  });
  it("Einhängepunkt: genau eine Oberfläche (Tag) mit Übersicht, Einteilung und Pflege; ohne Schreibweg nur Lesen", () => {
    expect(pruefeOberflaechen()).toEqual([]);
    const e = MODUL_OBERFLAECHEN.filter((x) => x.modul === "posten");
    expect(e.map((x) => x.ort)).toEqual(["tag"]);
    const k = { m, datum: heuteIso, dienstId: "F", personenImDienst: personen };
    const mit = markup(e[0].ansicht({ ...k, postenSchreiben: true, akt: { setzeFeld: () => {} } }));
    expect(mit).toMatch(/Einteilung am/);
    expect(mit).toMatch(/Objekt hinzufügen/);
    const ohne = markup(e[0].ansicht(k));
    expect(ohne).not.toMatch(/<select|<input|<button/);
    expect(ohne).toMatch(/Leitung oder die Planung/);
  });
});

describe("Rollen (Schreibweg der Oberfläche und Server)", () => {
  it("nur Leitung und Planung bekommen einen Schreibweg in der Oberfläche; unbekannt und Altrollen nicht", () => {
    expect(postenSchreibenFuer("leitung")).toBe(true);
    expect(postenSchreibenFuer("planer")).toBe(true);
    for (const r of ["subplaner", "mitarbeiter", "betriebsrat", "kunde", "betreiber", "", null, undefined, "LT"]) expect(postenSchreibenFuer(r), String(r)).toBe(false);
    expect(modulKontext({ sitz: { rolle: "planer", person: { id: "p1" }, mandant: {} } }).postenSchreiben).toBe(true);
    expect(modulKontext({ sitz: { rolle: "subplaner", person: { id: "s1", bereich: "e1" }, mandant: {} } }).postenSchreiben).toBe(false);
    expect(modulKontext({}).postenSchreiben).toBe(false);
  });
  it("Server: Planung speichert Alleinarbeit und Einteilung; Schichtverantwortung und Beschäftigte nicht; Betriebsrat nichts", () => {
    const T = "2026-11-10";
    const mit = (m) => {
      const o = JSON.parse(JSON.stringify(OBJEKTE));
      o[0].posten[1] = { ...o[0].posten[1], alleinarbeit: true, gefaehrdungsbeurteilung: "GB-7" };
      m.objekte = o;
      m.postenPlan = { ...m.postenPlan, [`a1|${T}`]: "po2" };
    };
    const g = gesamt();
    const pl = schreibeAls(g, "PL", mit);
    expect(pl.verweigert).toBeUndefined();
    expect(pl.mandanten[0].objekte[0].posten[1].alleinarbeit).toBe(true);
    expect(pl.mandanten[0].postenPlan[`a1|${T}`]).toBe("po2");
    for (const r of ["SV", "MA", "BR"]) {
      const res = schreibeAls(gesamt(), r, mit);
      const aenderte = res && !res.verweigert && res.mandanten[0].objekte[0].posten[1].alleinarbeit === true;
      expect(aenderte, r).toBeFalsy();
    }
  });
  it("Server: Planung kann keine Einteilung auf einen unbekannten Posten speichern", () => {
    const res = schreibeAls(gesamt(), "PL", (m) => { m.postenPlan = { "a1|2026-11-10": "po9" }; });
    expect(res.verweigert).toMatch(/Posten/);
  });
  it("Server: Beschäftigte sehen Objekt samt Alleinarbeit nur mit eigener Einteilung, der Betriebsrat nichts", () => {
    const g = gesamt();
    g.mandanten[0].postenPlan = { [`a1|${heuteIso}`]: "po1" };
    const sicht = (r) => bestandFuerRolle(g, SITZUNGEN[r]).mandanten[0];
    expect(sicht("MA").objekte[0].posten[0].alleinarbeit).toBe(true);
    g.mandanten[0].postenPlan = {};
    expect(sicht("MA").objekte || []).toEqual([]);
    expect(sicht("BR").objekte || []).toEqual([]);
  });
});
