/* ==========================================================================
   WP-I5 — INTERNE VORGABEN WIRKEN IM PLAN

   Geprüft (nur synthetische Daten, kein KI-Anteil):
   1. Einzelne Vorgabe gegen eine Einteilung (vorgabenBefunde, reine Funktion): Muster-, Block-, Zählregel; Muss = Achtung, Soll = Hinweis,
      Wunsch nichts; Status, Gültigkeit, Geltung (Betrieb, Einheit, Personen), Ausnahmen (Person, Zeitraum); vorbestehende Verletzung wird der
      Einteilung nicht angelastet; Schreibweise der Dienstart (Kürzel, Kennung, Name).
   2. Eine Stelle für die Planwirkung (vorgabePlanwirkung): was wirkt, was nur im Testlauf rechnet.
   3. Rechenlast: Obergrenze aktiver Vorgaben, kumuliertes Budget (deterministisch), Hinweis statt stilles Weglassen, nie ein Wurf.
   4. Einbindung: hindernisBefunde (Warndialog), Ersatzsuche (ein Budget für alle Personen), Planungsassistent (planeMonat),
      Selbstplanung (Kennung des Grunds), Befundkatalog (sperrt nie), Betriebsrat sieht nichts davon, Bestätigung über den Serverweg.
   5. Prüffall Wochenend-Regel: Samstag und Sonntag gleich; Nachtdienst-Wochenende erzeugt den Ruhezeit-Befund für den Montag.
   6. Rest-Befunde aus dem Delta von #561: Art und Einheit des Zeitraums werden beim Entwurf geprüft; der Ausnahmezweig des Testlaufs.

   Aufruf: npx vitest run pruefungen/intelligence-vorgaben-wirkung.test.js
   ========================================================================== */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { readFileSync } from "node:fs";
import { vorgabenBefunde, vorgabePlanwirkung, neuesVorgabenBudget, VORGABEN_BEFUNDART, VORGABEN_PLANARTEN, teilzeitQuote, tagesklasse, VORGABEN_ZAEHLUNG_OHNE } from "../server/lib/vorgabenwirkung.mjs";
import { pruefeVorgabe, vorgabeTestlauf, VORGABEN_WIRKUNG_GRENZE } from "../server/lib/vorgaben.mjs";
import { BEFUND_KATALOG, sperrtBefund } from "../server/lib/bestaetigungen.mjs";
import { SPERR_REGELN } from "../src/warnstufen.js";
import { NICHT_UEBERNOMMEN_GRUENDE, grundKennung, nichtUebernommenEintrag } from "../server/lib/selbstplanung.mjs";
import { bestaetigungenBetriebsrat } from "../server/lib/sicht.mjs";
import { bestandFuerRolle, zusammenfuehren } from "../server/lib/rechte.mjs";
import { FEST, zufall, betriebe } from "./engine-golden.fixture.mjs";

const TAG = "2026-11-17";   // Dienstag
const add = (t, n) => { const x = new Date(`${t}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const DA = [{ id: "F", name: "Frühdienst", kurz: "F", start: "06:00", ende: "15:45" }, { id: "S", name: "Spätdienst", kurz: "S", start: "13:45", ende: "23:30" },
  { id: "N", name: "Nachtdienst", kurz: "N", start: "21:30", ende: "07:15" }];
const dienst = (id) => DA.find((d) => d.id === id);
const V = (id, extra = {}) => ({ id, name: `Vorgabe ${id}`, regelart: "musterregel", parameter: { art: "verbotenFolge", von: ["N"], dann: ["F"] },
  geltung: { art: "betrieb" }, bezug: "monat", staerke: "muss", prioritaet: 1, grundlage: { art: "hausregel" }, status: "aktiv", ...extra });
const P = { id: "pp" };
/** Eine reine Prüfung: Plan der Person als Karte Tag → Dienstkennung. */
const pruefe = (vorgaben, plan, { d = TAG, da = "F", p = P, einheitAm, budget } = {}) =>
  vorgabenBefunde({ dienstarten: DA, vorgaben }, p, d, dienst(da), { dienstAm: (x, t) => plan[t] || null, einheitAm, budget });
const nurVorgabe = (l) => l.filter((b) => b.art === "vorgabe" && b.regel !== "vorgabeOffen");

describe("1. Eine Vorgabe gegen eine Einteilung", () => {
  it("Muss: Frühdienst am Tag nach einem Nachtdienst verletzt „nach Nachtdienst kein Frühdienst“ — Achtung, mit Regelkennung, ohne Sperre", () => {
    expect(pruefeVorgabe(V("keinf"))).toBeNull();
    const b = nurVorgabe(pruefe([V("keinf")], { [add(TAG, -1)]: "N" }));
    expect(b).toHaveLength(1);
    expect(b[0]).toMatchObject({ regel: "vorgabeMuss", stufe: "achtung", art: "vorgabe", regelId: "VORGABE-KEINF" });
    expect(b[0].text).toMatch(/Vorgabe keinf/);
    expect(sperrtBefund(b[0].regel)).toBe(false);
  });
  it("Soll ist ein Hinweis, Wunsch erzeugt keinen Befund", () => {
    const plan = { [add(TAG, -1)]: "N" };
    expect(nurVorgabe(pruefe([V("a", { staerke: "soll" })], plan)).map((b) => [b.regel, b.stufe])).toEqual([["vorgabeSoll", "hinweis"]]);
    expect(pruefe([V("a", { staerke: "wunsch" })], plan)).toEqual([]);
  });
  it("keine Verletzung, kein Befund: Spätdienst statt Früh, oder der Vortag war kein Nachtdienst", () => {
    expect(pruefe([V("a")], { [add(TAG, -1)]: "N" }, { da: "S" })).toEqual([]);
    expect(pruefe([V("a")], { [add(TAG, -1)]: "S" })).toEqual([]);
    expect(pruefe([V("a")], {})).toEqual([]);
  });
  it("Entwurf und inaktive Vorgabe wirken nicht", () => {
    const plan = { [add(TAG, -1)]: "N" };
    expect(pruefe([V("a", { status: "entwurf" }), V("b", { status: "inaktiv" })], plan)).toEqual([]);
  });
  it("Gültigkeitszeitraum: davor und danach keine Wirkung, am Rand schon", () => {
    const plan = { [add(TAG, -1)]: "N" };
    expect(nurVorgabe(pruefe([V("a", { gueltigAb: TAG })], plan))).toHaveLength(1);
    expect(pruefe([V("a", { gueltigAb: add(TAG, 1) })], plan)).toEqual([]);
    expect(nurVorgabe(pruefe([V("a", { gueltigBis: TAG })], plan))).toHaveLength(1);
    expect(pruefe([V("a", { gueltigBis: add(TAG, -1) })], plan)).toEqual([]);
  });
  it("Geltung: Betrieb alle, Einheit nur die genannte, Personen nur die genannten; Qualifikationsgruppe nur mit der Qualifikation (Betrieb ohne sie: offen)", () => {
    const plan = { [add(TAG, -1)]: "N" };
    expect(nurVorgabe(pruefe([V("a", { geltung: { art: "einheit", einheiten: ["e1"] } })], plan, { einheitAm: () => "e1" }))).toHaveLength(1);
    expect(pruefe([V("a", { geltung: { art: "einheit", einheiten: ["e1"] } })], plan, { einheitAm: () => "e2" })).toEqual([]);
    expect(pruefe([V("a", { geltung: { art: "einheit", einheiten: ["e1"] } })], plan)).toEqual([]);   // Einheit unbekannt: nicht raten
    expect(nurVorgabe(pruefe([V("a", { geltung: { art: "personen", personen: ["pp"] } })], plan))).toHaveLength(1);
    expect(pruefe([V("a", { geltung: { art: "personen", personen: ["andere"] } })], plan)).toEqual([]);
    /* Gruppenname unbekannt im Betrieb: nie still „gilt nicht“, sondern offen (Hinweis). */
    expect(pruefe([V("a", { geltung: { art: "gruppe", gruppen: ["Nachtwache"] } })], plan).map((b) => b.regel)).toEqual(["vorgabeOffen"]);
  });
  it("Ausnahmen: genannte Person und genannter Zeitraum sind ausgenommen", () => {
    const plan = { [add(TAG, -1)]: "N" };
    expect(pruefe([V("a", { ausnahmen: { personen: ["pp"] } })], plan)).toEqual([]);
    expect(pruefe([V("a", { ausnahmen: { zeitraeume: [{ von: add(TAG, -2), bis: add(TAG, 2) }] } })], plan)).toEqual([]);
    expect(nurVorgabe(pruefe([V("a", { ausnahmen: { zeitraeume: [{ von: add(TAG, 1), bis: add(TAG, 5) }], personen: ["x"] } })], plan))).toHaveLength(1);
  });
  it("die Schreibweise der Dienstart darf Kürzel, Kennung oder Name sein", () => {
    const plan = { [add(TAG, -1)]: "N" };
    for (const [von, dann] of [["Nachtdienst", "Frühdienst"], ["n", "f"], ["N", "Frühdienst"]]) {
      const v = V("a", { parameter: { art: "verbotenFolge", von: [von], dann: [dann] } });
      expect(nurVorgabe(pruefe([v], plan)), `${von}/${dann}`).toHaveLength(1);
    }
    expect(pruefe([V("a", { parameter: { art: "verbotenFolge", von: ["Unbekannt"], dann: ["F"] } })], plan)).toEqual([]);
  });
  it("Höchstens in Folge: der dritte Frühdienst in Folge verletzt „höchstens 2 in Folge“, der zweite nicht", () => {
    const v = V("folge", { parameter: { art: "hoechstensFolge", klassen: ["F"], max: 2, danachFrei: 0 } });
    expect(pruefe([v], { [add(TAG, -1)]: "F" })).toEqual([]);
    expect(nurVorgabe(pruefe([v], { [add(TAG, -1)]: "F", [add(TAG, -2)]: "F" }))).toHaveLength(1);
    expect(nurVorgabe(pruefe([v], { [add(TAG, -1)]: "F", [add(TAG, 1)]: "F" }))).toHaveLength(1);   // schließt eine Lücke zum Block von drei
  });
  it("Zählregel: der vierte Nachtdienst im Monat verletzt „höchstens 3 im Kalendermonat“", () => {
    const v = V("naechte", { regelart: "zaehlregel", parameter: { ereignis: "Nachtdienst", fenster: { art: "kalendermonat" }, richtung: "hoechstens", grenze: 3 } });
    expect(pruefeVorgabe(v)).toBeNull();
    const drei = { "2026-11-02": "N", "2026-11-03": "N", "2026-11-04": "N" };
    expect(pruefe([v], { "2026-11-02": "N", "2026-11-03": "N" }, { da: "N" })).toEqual([]);
    expect(nurVorgabe(pruefe([v], drei, { da: "N" }))).toHaveLength(1);
    expect(pruefe([v], drei, { da: "F" })).toEqual([]);                        // ein Frühdienst zählt nicht mit
    expect(pruefe([v], drei, { da: "N", d: "2026-12-02" })).toEqual([]);        // anderer Monat
  });
  it("Mindestens-Zählregel wird durch eine Einteilung nie verschlechtert und erzeugt hier keinen Befund", () => {
    const v = V("min", { regelart: "zaehlregel", parameter: { ereignis: "Nachtdienst", fenster: { art: "kalendermonat" }, richtung: "mindestens", grenze: 5 } });
    expect(pruefe([v], {}, { da: "N" })).toEqual([]);
    expect(pruefe([v], {}, { da: "F" })).toEqual([]);
  });
  it("Blockregel: Samstag und Sonntag gleich — der Sonntag mit anderer Dienstart verletzt, die gleiche nicht; ein noch leerer Samstag ist offen, nicht „frei“", () => {
    const v = V("wochenende", { regelart: "blockregel", parameter: { wochentage: [5, 6] } });
    const SA = "2026-11-21", SO = "2026-11-22";
    expect(nurVorgabe(pruefe([v], { [SA]: "N" }, { d: SO, da: "F" }))).toHaveLength(1);
    expect(pruefe([v], { [SA]: "N" }, { d: SO, da: "N" })).toEqual([]);
    expect(pruefe([v], {}, { d: SO, da: "F" })).toEqual([]);                         // Samstag noch leer: im Plan offen, kein Befund
    expect(pruefe([v], { [SA]: "N" }, { d: add(SO, 1), da: "F" })).toEqual([]);      // Montag liegt im anderen Block
  });
  it("eine schon bestehende Verletzung an anderer Stelle wird der neuen Einteilung nicht angelastet", () => {
    const v = V("naechte", { regelart: "zaehlregel", parameter: { ereignis: "N", fenster: { art: "kalendermonat" }, richtung: "hoechstens", grenze: 1 } });
    const schon = { "2026-11-02": "N", "2026-11-03": "N" };   // schon zwei: der Monat ist verletzt
    expect(pruefe([v], schon, { da: "F" })).toEqual([]);                      // ein Frühdienst ändert daran nichts
    expect(nurVorgabe(pruefe([v], schon, { da: "N" }))).toHaveLength(1);       // ein weiterer Nachtdienst verschlimmert
  });
  it("die Eingabe wird nicht verändert (tief eingefroren) und die Reihenfolge ist fest: gleiche Eingabe, gleiche Ausgabe", () => {
    const frost = (o) => { if (o && typeof o === "object" && !Object.isFrozen(o)) { Object.freeze(o); Object.values(o).forEach(frost); } return o; };
    const vs = frost([V("b", { prioritaet: 2 }), V("a", { prioritaet: 2 }), V("c", { prioritaet: 1 })]);
    const plan = frost({ [add(TAG, -1)]: "N" });
    const a = pruefe(vs, plan), b = pruefe(vs, plan);
    expect(b).toEqual(a);
    expect(a.map((x) => x.regelId)).toEqual(["VORGABE-C", "VORGABE-A", "VORGABE-B"]);
  });
  it("Mandantengrenze: es zählen nur die Vorgaben des übergebenen Betriebs, eine fremde Personenkennung bewirkt nichts", () => {
    const plan = { [add(TAG, -1)]: "N" };
    expect(pruefe([V("fremd", { geltung: { art: "personen", personen: ["z-fremd"] } })], plan)).toEqual([]);
    expect(vorgabenBefunde({ dienstarten: DA }, P, TAG, dienst("F"), { dienstAm: () => "N" })).toEqual([]);
    expect(vorgabenBefunde({ dienstarten: DA, vorgaben: "kaputt" }, P, TAG, dienst("F"), { dienstAm: () => "N" })).toEqual([]);
    expect(vorgabenBefunde({ dienstarten: DA, vorgaben: [null, 3, "x"] }, P, TAG, dienst("F"), { dienstAm: () => "N" })).toEqual([]);
  });
});

describe("2. Was im Plan wirkt (eine Stelle für Rechnung und Verwaltung)", () => {
  it("Muster, Block, Zählregel wirken; die übrigen Regelarten rechnen nur im Testlauf", () => {
    expect(VORGABEN_PLANARTEN).toEqual(["musterregel", "blockregel", "zaehlregel"]);
    expect(vorgabePlanwirkung(V("a")).wirkt).toBe(true);
    for (const regelart of ["grenzregel", "besetzungsregel", "paarregel", "verteilungsregel", "wunschregel"]) {
      const w = vorgabePlanwirkung({ ...V("a"), regelart });
      expect(w.wirkt, regelart).toBe(false);
      expect(w.grund).toMatch(/Testlauf/);
    }
  });
  it("Qualifikationsgruppen wirken; große Zeiträume wirken nicht, mit Grund", () => {
    expect(vorgabePlanwirkung(V("a", { geltung: { art: "gruppe", gruppen: ["x"] } })).wirkt).toBe(true);
    const z = (fenster) => V("z", { regelart: "zaehlregel", parameter: { ereignis: "N", fenster, richtung: "hoechstens", grenze: 3 } });
    expect(vorgabePlanwirkung(z({ art: "kalendermonat" })).wirkt).toBe(true);
    expect(vorgabePlanwirkung(z({ art: "kalenderjahr" })).wirkt).toBe(false);
    expect(vorgabePlanwirkung(z({ art: "rollierend", laenge: 8, einheit: "wochen" })).wirkt).toBe(true);
    expect(vorgabePlanwirkung(z({ art: "rollierend", laenge: 9, einheit: "wochen" })).wirkt).toBe(false);
    expect(vorgabePlanwirkung(z({ art: "rollierend", laenge: 3, einheit: "monate" })).wirkt).toBe(false);
    expect(vorgabePlanwirkung(V("m", { parameter: { art: "hoechstensFolge", klassen: ["F"], max: 40, danachFrei: 0 } })).wirkt).toBe(false);
    expect(vorgabePlanwirkung(null).wirkt).toBe(false);
  });
});

describe("3. Rechenlast: Obergrenzen, kumuliertes Budget, nie still", () => {
  const viele = (n, extra = {}) => Array.from({ length: n }, (_, i) => V(`v${String(i).padStart(3, "0")}`, { prioritaet: 1, ...extra }));
  it("mehr aktive Vorgaben als die Obergrenze: die ersten (nach Priorität, Kennung) werden geprüft, der Rest wird ausdrücklich gemeldet", () => {
    const n = VORGABEN_WIRKUNG_GRENZE.aktive + 5;
    const b = pruefe(viele(n), { [add(TAG, -1)]: "N" });
    expect(b.filter((x) => x.regel === "vorgabeMuss")).toHaveLength(VORGABEN_WIRKUNG_GRENZE.aktive);
    expect(b.filter((x) => x.regel === "vorgabeOffen")).toHaveLength(1);
    expect(b.find((x) => x.regel === "vorgabeOffen")).toMatchObject({ stufe: "hinweis", art: "vorgabe" });
  });
  it("Budget aufgebraucht: Hinweis statt Befund, kein Wurf, gleiche Eingabe → gleiches Ergebnis", () => {
    const plan = { [add(TAG, -1)]: "N" };
    const lauf = () => pruefe(viele(10), plan, { budget: neuesVorgabenBudget(40) });
    const a = lauf();
    expect(a.filter((x) => x.regel === "vorgabeMuss").length).toBeLessThan(10);
    expect(a.some((x) => x.regel === "vorgabeOffen")).toBe(true);
    expect(lauf()).toEqual(a);
  });
  it("ein geteiltes Budget bleibt aufgebraucht: spätere Prüfungen derselben Anfrage melden es sofort", () => {
    const budget = neuesVorgabenBudget(20);
    const plan = { [add(TAG, -1)]: "N" };
    const erste = pruefe(viele(5), plan, { budget });
    const zweite = pruefe(viele(5), plan, { budget });
    expect(erste.some((x) => x.regel === "vorgabeOffen")).toBe(true);
    expect(zweite.filter((x) => x.regel === "vorgabeMuss")).toHaveLength(0);
    expect(zweite.some((x) => x.regel === "vorgabeOffen")).toBe(true);
  });
  it("ein Fehler beim Rechnen (unbrauchbare Parameter im Altbestand) wirft nie, sondern meldet „nicht vollständig geprüft“", () => {
    const kaputt = V("k", { parameter: { art: "verbotenFolge", von: [], dann: ["F"] } });   // der Baukasten wirft bei leeren Listen
    expect(() => pruefe([kaputt], {})).not.toThrow();
    expect(pruefe([kaputt], { [add(TAG, -1)]: "N" }).map((b) => b.regel)).toEqual(["vorgabeOffen"]);
  });
  it("ohne aktive Vorgabe kostet die Prüfung nichts (kein Aufruf des Plans) und das Budget bleibt unberührt", () => {
    const budget = neuesVorgabenBudget(100);
    let aufrufe = 0;
    vorgabenBefunde({ dienstarten: DA, vorgaben: [V("a", { status: "entwurf" })] }, P, TAG, dienst("F"), { dienstAm: () => { aufrufe++; return null; }, budget });
    expect(aufrufe).toBe(0);
    expect(budget.rest).toBe(100);
  });
  it("die Grenzen stehen zentral und sind sinnvoll klein", () => {
    expect(VORGABEN_WIRKUNG_GRENZE).toEqual({ aktive: 50, fensterTage: 62, aufwand: 200000 });
    expect(Object.isFrozen(VORGABEN_WIRKUNG_GRENZE)).toBe(true);
  });
});

describe("4. Einbindung: Befundkatalog, Selbstplanung, Betriebsrat, Bestätigung", () => {
  it("die Befundarten stehen im Katalog: Muss Achtung, Soll und Offen Hinweis, keine sperrt (auch nicht in der Oberfläche)", () => {
    expect(BEFUND_KATALOG.vorgabeMuss).toMatchObject({ stufe: "achtung", sperrt: false });
    expect(BEFUND_KATALOG.vorgabeSoll).toMatchObject({ stufe: "hinweis", sperrt: false });
    expect(BEFUND_KATALOG.vorgabeOffen).toMatchObject({ stufe: "hinweis", sperrt: false });
    for (const k of Object.keys(VORGABEN_BEFUNDART)) { expect(sperrtBefund(k), k).toBe(false); expect(SPERR_REGELN[k], k).toBe(false); }
  });
  it("Selbstplanung: ein Befund einer Vorgabe hat eine eigene Grund-Kennung (nie Text), der Server nimmt sie an", () => {
    expect(grundKennung({ art: "vorgabe" })).toBe("vorgabe");
    expect(NICHT_UEBERNOMMEN_GRUENDE.vorgabe).toMatch(/Vorgabe/);
    expect(nichtUebernommenEintrag({ personId: "a", datum: TAG, grund: "vorgabe" }).grund).toBe("vorgabe");
    expect(grundKennung({ art: "regel" })).toBe("befund");
  });
  it("Betriebsrat: Bestätigungen zu Vorgaben erscheinen nur als „sonstiges“, nie mit der Vorgabe-Kennung (Entscheidung 1.2)", () => {
    const eintrag = (regel) => ({ datum: `${TAG}`, stufe: "achtung", befunde: [{ regel, stufe: "achtung" }] });
    const w = [1, 2, 3].map(() => eintrag("vorgabeMuss"));
    const z = bestaetigungenBetriebsrat(w);
    expect(z.map((x) => x.regel)).toEqual(["sonstiges"]);
    expect(JSON.stringify(z)).not.toMatch(/vorgabe/i);
  });
  it("Serverweg: die Planung kann eine Einteilung mit Vorgabe-Befund bestätigen (Achtung, kein Sperren); der Betriebsrat schreibt nichts", () => {
    const betrieb = { id: "m1", einheiten: [{ id: "e1", versatzTage: 0 }], dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00", pause: 30 }],
      zyklus: { tage: ["-", "-", "-", "-", "-", "-", "-"] }, anker: "2026-01-05", einstellungen: { ruhezeit: 11, maxFolge: 6 },
      personen: [{ id: "a1", vorname: "V", nachname: "N", rolle: "mitarbeiter", bereich: "e1", status: "aktiv", geburtstag: "1980-01-01", zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }], qualifikationen: [] },
        { id: "p1", vorname: "V", nachname: "P", rolle: "planer", bereich: "ALLE", status: "aktiv", geburtstag: "1980-01-01", zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }], qualifikationen: [] },
        { id: "r1", vorname: "V", nachname: "R", rolle: "betriebsrat", bereich: "ALLE", status: "aktiv", geburtstag: "1980-01-01", zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }], qualifikationen: [] }],
      abweichungen: {}, nachrichten: [], anfragen: [], abwesenheiten: [], bestaetigungen: [] };
    const gg = { version: 1, stand: 1, mandanten: [betrieb] };
    const tagN = add(new Date().toISOString().slice(0, 10), 3);
    const schreiben = (rolle, sitz) => { const s = JSON.parse(JSON.stringify(bestandFuerRolle(gg, sitz)));
      s.mandanten[0].abweichungen[`a1|${tagN}`] = "F";
      s.mandanten[0].bestaetigungen.push({ id: "b-vorgabe-1", personId: "a1", datum: tagN, dienstId: "F", aktion: "einteilen", stufe: "achtung",
        befunde: [{ regel: "vorgabeMuss", stufe: "achtung" }], regelIds: ["VORGABE-KEINF"], gelesen: false });
      return zusammenfuehren(gg, s, sitz); };
    const pl = schreiben("PL", { rolle: "planer", person: "p1", betrieb: 0 });
    expect(pl && pl.verweigert, pl && pl.verweigert).toBeFalsy();
    const gespeichert = (pl.bestand || pl).mandanten[0].bestaetigungen;
    expect(gespeichert.find((x) => x.id === "b-vorgabe-1")).toMatchObject({ stufe: "achtung", regelIds: ["VORGABE-KEINF"] });
    const br = schreiben("BR", { rolle: "betriebsrat", person: "r1", betrieb: 0 });
    expect(br === null || !JSON.stringify(br).includes("b-vorgabe-1")).toBe(true);
  });
});

/* Die Planungsfunktionen laufen auf dem Demobetrieb (fachlogik, feste Uhr). */
describe("5. Ersatzsuche, Planungsassistent, Warndialog und der Prüffall Wochenend-Regel", () => {
  let F, E, B;
  beforeAll(async () => {
    vi.useFakeTimers({ now: new Date(FEST), toFake: ["Date"] });
    vi.spyOn(Math, "random").mockImplementation(zufall(20261125));
    F = await import("../src/lib/fachlogik.js");
    E = await import("../server/lib/engine/einsatz.mjs");
    B = betriebe(F);
  }, 120000);
  afterAll(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  /** Demobetrieb mit einer freigeräumten Person: alle Tage im Umfeld frei, danach gesetzte Dienste. */
  function werkstatt(vorgaben, plan = {}) {
    const m = structuredClone(B.find(([n]) => n.startsWith("demo1"))[1]);
    m.abwesenheiten = [];
    m.vorgaben = vorgaben;
    const p = m.personen.find((x) => x.rolle === "mitarbeiter" && !(x.teilzeit && x.teilzeit.aktiv) && !x.springer);
    for (let i = -20; i <= 20; i++) m.abweichungen[`${p.id}|${add(TAG, i)}`] = "-";
    for (const [t, id] of Object.entries(plan)) m.abweichungen[`${p.id}|${t}`] = id;
    return { m, p };
  }
  const fruehDa = (m) => m.dienstarten.find((x) => x.id === "F");
  const vorgabeBefunde = (l) => l.filter((b) => b.art === "vorgabe");

  it("Warndialog: hindernisBefunde nennt den Vorgabe-Befund mit Stufe, Quelle und Regelkennung; ohne Vorgabe nichts davon", () => {
    const { m, p } = werkstatt([V("keinf", { parameter: { art: "verbotenFolge", von: ["S"], dann: ["F"] } })], { [add(TAG, -1)]: "S" });
    const b = vorgabeBefunde(E.hindernisBefunde(m, p, TAG, fruehDa(m)));
    expect(b).toHaveLength(1);
    expect(b[0]).toMatchObject({ regel: "vorgabeMuss", stufe: "achtung", sperrt: false, regelId: "VORGABE-KEINF" });
    const { m: o, p: po } = werkstatt([], { [add(TAG, -1)]: "S" });
    expect(vorgabeBefunde(E.hindernisBefunde(o, po, TAG, fruehDa(o)))).toEqual([]);
  });
  it("Ersatzsuche: bei einer Muss-Vorgabe ist die Person nicht „möglich“ (Hindernis mit Text), bei Soll bleibt sie möglich und der Grund steht als Hinweis", () => {
    const plan = { [add(TAG, -1)]: "F" };
    const folge = { art: "hoechstensFolge", klassen: ["F"], max: 1, danachFrei: 0 };
    const muss = werkstatt([V("keinf", { parameter: folge })], plan);
    const km = E.ersatzVorschlaege(muss.m, TAG, "F").find((k) => k.person.id === muss.p.id);
    expect(km.moeglich).toBe(false);
    expect(km.hindernisse.join(" ")).toMatch(/Interne Vorgabe/);
    const soll = werkstatt([V("keinf", { staerke: "soll", parameter: folge })], plan);
    const ks = E.ersatzVorschlaege(soll.m, TAG, "F").find((k) => k.person.id === soll.p.id);
    expect(ks.moeglich).toBe(true);
    expect(ks.gruende.join(" | ")).toMatch(/Hinweis: Interne Vorgabe/);
  });
  it("Ersatzsuche: ein Budget für alle Personen der Suche — ist es aufgebraucht, melden die späteren Kandidaten es als Hinweis", () => {
    const grosse = Array.from({ length: 50 }, (_, i) => V(`g${String(i).padStart(2, "0")}`, { parameter: { art: "hoechstensFolge", klassen: ["F"], max: 29, danachFrei: 0 } }));
    const { m } = werkstatt(grosse);
    const liste = E.ersatzVorschlaege(m, TAG, "F");
    const offen = liste.map((k) => k.gruende.some((g) => /Interne Vorgaben konnten hier nicht vollständig geprüft/.test(g)));
    expect(m.personen.length).toBeGreaterThan(60);
    expect(offen.some(Boolean), "irgendwann ist das Budget aufgebraucht").toBe(true);
    expect(offen.some((x) => !x), "die ersten Kandidaten wurden noch geprüft").toBe(true);   // (die Ausgabe ist nach Eignung sortiert, nicht nach Prüfreihenfolge)
  });
  it("Planungsassistent: berücksichtigt eine Muss-Vorgabe („höchstens 1 Frühdienst in Folge“), lässt Plätze lieber offen und meldet sie", () => {
    const lauf = (vorgaben) => {
      /* Vier Personen, nur der Frühdienst, der ganze November leer: Ohne Vorgabe teilt der Assistent dieselbe Person mehrere Tage hintereinander ein. */
      const m = structuredClone(B.find(([n]) => n.startsWith("demo1"))[1]);
      m.abwesenheiten = []; m.vorgaben = vorgaben;
      m.dienstarten = m.dienstarten.filter((x) => x.id === "F");
      m.personen = m.personen.filter((x) => x.rolle === "mitarbeiter" && !(x.teilzeit && x.teilzeit.aktiv) && !x.springer).slice(0, 4);
      m.abweichungen = {};
      for (const p of m.personen) for (let i = 1; i <= 30; i++) m.abweichungen[`${p.id}|2026-11-${String(i).padStart(2, "0")}`] = "-";
      const e = F.planeMonat(m, "2026-11", { maxProPerson: 31 });
      const arbeit = { ...m, abweichungen: e.abweichungen };
      let laengste = 0;
      for (const p of m.personen) { let l = 0; for (let i = 1; i <= 30; i++) { const id = F.personTag(arbeit, p, `2026-11-${String(i).padStart(2, "0")}`).dienstId; l = id === "F" ? l + 1 : 0; laengste = Math.max(laengste, l); } }
      return { e, laengste };
    };
    const ohne = lauf([]);
    expect(ohne.laengste, "ohne Vorgabe gibt es Frühdienste in Folge").toBeGreaterThanOrEqual(2);
    const mit = lauf([V("folge", { parameter: { art: "hoechstensFolge", klassen: ["F"], max: 1, danachFrei: 0 } })]);
    expect(mit.laengste).toBe(1);
    expect(mit.e.gesetzt.length).toBeLessThan(ohne.e.gesetzt.length);
    expect(mit.e.offen.length, "was nicht regelkonform zu besetzen ist, bleibt sichtbar offen").toBeGreaterThan(0);
  }, 120000);
  it("Prüffall Wochenend-Regel: Samstag und Sonntag gleich (Muss); das Nachtdienst-Wochenende erzeugt für den Montag den Ruhezeit-Befund", () => {
    const SA = "2026-11-21", SO = "2026-11-22", MO = "2026-11-23";
    const wochenende = V("wochenende", { name: "Wochenend-Rotation", regelart: "blockregel", parameter: { wochentage: [5, 6] } });
    expect(pruefeVorgabe(wochenende)).toBeNull();
    const { m, p } = werkstatt([wochenende], { [SA]: "N" });
    // Sonntag Frühdienst nach Nachtdienst am Samstag: die Wochenend-Regel schlägt an.
    expect(vorgabeBefunde(E.hindernisBefunde(m, p, SO, fruehDa(m))).map((b) => b.regel)).toEqual(["vorgabeMuss"]);
    // Sonntag ebenfalls Nachtdienst: die Regel ist erfüllt …
    const nacht = m.dienstarten.find((x) => x.id === "N");
    expect(vorgabeBefunde(E.hindernisBefunde(m, p, SO, nacht))).toEqual([]);
    // … und der Frühdienst am Montag danach wird als Ruhezeitverstoß gemeldet (Nachtdienst endet Montag 07:15).
    m.abweichungen[`${p.id}|${SO}`] = "N";
    const montag = E.hindernisBefunde(m, p, MO, fruehDa(m));
    expect(montag.some((b) => b.regel === "ruhezeitGesetz" && /Ruhezeit/.test(b.text))).toBe(true);
    expect(vorgabeBefunde(montag)).toEqual([]);   // Montag liegt nicht im Wochenende: die Wochenend-Vorgabe schweigt
    // Ersatzsuche für den Montag: die Person ist nicht möglich.
    expect(E.ersatzVorschlaege(m, MO, "F").find((k) => k.person.id === p.id).moeglich).toBe(false);
  });
  it("ein Betrieb ohne Vorgaben rechnet unverändert (Golden der Planrechnung steht in engine-einsatz.test.js)", () => {
    const m = structuredClone(B.find(([n]) => n.startsWith("demo1"))[1]);
    const a = E.ersatzVorschlaege(m, TAG, "F").map((k) => [k.person.id, k.punkte, k.moeglich]);
    m.vorgaben = [];
    expect(E.ersatzVorschlaege(m, TAG, "F").map((k) => [k.person.id, k.punkte, k.moeglich])).toEqual(a);
  });
});

describe("6. Rest-Befunde aus dem Delta von #561", () => {
  const Z = (fenster) => V("z", { regelart: "zaehlregel", parameter: { ereignis: "N", fenster, richtung: "hoechstens", grenze: 3 } });
  it("Art und Einheit des Zeitraums werden schon beim Entwurf geprüft (nicht erst beim Aktivieren)", () => {
    expect(pruefeVorgabe(Z({ art: "kalendermonat" }))).toBeNull();
    expect(pruefeVorgabe(Z({ art: "rollierend", laenge: 4, einheit: "wochen" }))).toBeNull();
    expect(pruefeVorgabe(Z({ art: "rollierend", laenge: 4, einheit: "jahre" }))).toMatch(/Einheit/);
    expect(pruefeVorgabe(Z({ art: "taeglich" }))).toMatch(/Art/);
    expect(pruefeVorgabe(Z({ art: "rollierend", laenge: 4 }))).toMatch(/Einheit/);
    expect(pruefeVorgabe(Z("monat"))).toMatch(/Zeitraum/);
    expect(pruefeVorgabe(V("z", { status: "entwurf", regelart: "zaehlregel", parameter: { ereignis: "N", fenster: { art: "rollierend", laenge: 3, einheit: "x" }, richtung: "hoechstens", grenze: 3 } }))).toMatch(/Einheit/);
  });
  it("Testlauf: scheitert die Rechnung der Fälle, wird das zum Ergebnis „fehler“, nie zur Ausnahme (Zweig catch)", () => {
    const v = Z({ art: "kalendermonat" });
    expect(pruefeVorgabe(v)).toBeNull();
    let e;
    expect(() => { e = vorgabeTestlauf(v, /** @type {any} */ ("keine-liste")); }).not.toThrow();   // der Baukasten wirft „Fälle fehlen“
    expect(e).toMatchObject({ ok: false, ergebnisse: [] });
    expect(e.fehler).toMatch(/nicht gerechnet/);
  });
});

describe("7. Review-Befunde PR #566: ein Budget je Einstieg, fail-closed, Fenster, Maß, Mandantengrenze", () => {
  let F, E, K, B;
  beforeAll(async () => {
    vi.useFakeTimers({ now: new Date(FEST), toFake: ["Date"] });
    vi.spyOn(Math, "random").mockImplementation(zufall(20261125));
    F = await import("../src/lib/fachlogik.js");
    E = await import("../server/lib/engine/einsatz.mjs");
    K = await import("../server/lib/engine/ersatzfakten.mjs");
    B = betriebe(F);
  }, 120000);
  afterAll(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  /** Demobetrieb mit einer freigeräumten Person (alle Tage im Umfeld frei), danach gesetzte Dienste. */
  function werkstatt(vorgaben, plan = {}) {
    const m = structuredClone(B.find(([n]) => n.startsWith("demo1"))[1]);
    m.abwesenheiten = [];
    m.vorgaben = vorgaben;
    const p = m.personen.find((x) => x.rolle === "mitarbeiter" && !(x.teilzeit && x.teilzeit.aktiv) && !x.springer);
    for (let i = -20; i <= 20; i++) m.abweichungen[`${p.id}|${add(TAG, i)}`] = "-";
    for (const [t, id] of Object.entries(plan)) m.abweichungen[`${p.id}|${t}`] = id;
    return { m, p };
  }
  const grosse = (n = 50) => Array.from({ length: n }, (_, i) => V(`g${String(i).padStart(2, "0")}`, { parameter: { art: "hoechstensFolge", klassen: ["F"], max: 29, danachFrei: 0 } }));
  const vorgabeBef = (l) => l.filter((b) => b.art === "vorgabe");

  describe("Befund 2: ein Budget je äußerem Einstieg, kein stilles Neuanlegen", () => {
    it("ersatzKandidaten: mehrere Aufrufe mit EINEM Budget verbrauchen zusammen nie mehr als das Budget (Suche und Nachprüfung teilen es)", () => {
      const { m } = werkstatt(grosse());
      const start = 20000;
      const budget = neuesVorgabenBudget(start);
      for (let i = 0; i < 4; i++) K.ersatzKandidaten(m, TAG, "F", { vorgabenBudget: budget });
      expect(budget.rest).toBeGreaterThanOrEqual(0);
      expect(budget.ausgeschoepft, "das gemeinsame Budget wurde wirklich verbraucht (kein zweites angelegt)").toBe(true);
    });
    it("ersatzVorschlaege und hindernisBefunde benutzen ein übergebenes Budget, statt es durch ein neues zu ersetzen", () => {
      const { m } = werkstatt(grosse());
      const a = neuesVorgabenBudget(30000);
      E.ersatzVorschlaege(m, TAG, "F", undefined, { vorgabenBudget: a });
      expect(a.rest).toBeLessThan(30000);
      const c = neuesVorgabenBudget(30000);
      E.ersatzVorschlaege(m, TAG, "F", { vorgabenBudget: c, konten: new Map(), einspruenge: {}, nachtAnzahl: new Map(), median: 0, nachtMittel: 0 });
      expect(c.rest).toBeLessThan(30000);
      const b = neuesVorgabenBudget(30000);
      E.hindernisBefunde(m, m.personen[0], TAG, m.dienstarten.find((x) => x.id === "F"), { vorgabenBudget: b });
      expect(b.rest).toBeLessThan(30000);
    });
    it("planeMonat: ein Budget für den ganzen Monat — ist es verbraucht, wird nichts mehr eingeteilt (nicht je Suchschritt frisch)", () => {
      const lauf = (vorgaben) => {
        const m = structuredClone(B.find(([n]) => n.startsWith("demo1"))[1]);
        m.abwesenheiten = []; m.vorgaben = vorgaben;
        m.dienstarten = m.dienstarten.filter((x) => x.id === "F");
        m.personen = m.personen.filter((x) => x.rolle === "mitarbeiter" && !(x.teilzeit && x.teilzeit.aktiv) && !x.springer).slice(0, 4);
        m.abweichungen = {};
        for (const p of m.personen) for (let i = 1; i <= 30; i++) m.abweichungen[`${p.id}|2026-11-${String(i).padStart(2, "0")}`] = "-";
        return F.planeMonat(m, "2026-11", { maxProPerson: 31 });
      };
      const ohne = lauf([]);
      const mit = lauf(grosse());
      expect(ohne.gesetzt.length).toBeGreaterThan(10);
      expect(mit.gesetzt.length, "nach Verbrauch des Monatsbudgets bleibt der Rest offen").toBeLessThan(ohne.gesetzt.length);
      expect(mit.offen.length).toBeGreaterThan(0);
    }, 120000);
    it("Vorbereitung einmal je Einstieg: Dienstart-Abbildung und Regeln werden über Aufrufe und Personen wiederverwendet", () => {
      const budget = neuesVorgabenBudget();
      const vorgaben = [V("a")];
      const m = { dienstarten: DA, vorgaben };
      const k = { dienstAm: () => null, budget };
      vorgabenBefunde(m, P, TAG, dienst("F"), k);
      const erste = budget.vorbereitet.get(vorgaben);
      expect(erste).toBeTruthy();
      vorgabenBefunde(m, { id: "andere" }, add(TAG, 3), dienst("F"), k);
      expect(budget.vorbereitet.get(vorgaben)).toBe(erste);
      /* neue Dienstarten (anderer Betriebsstand) → neu vorbereitet */
      vorgabenBefunde({ dienstarten: [...DA], vorgaben }, P, TAG, dienst("F"), k);
      expect(budget.vorbereitet.get(vorgaben)).not.toBe(erste);
    });
  });

  describe("Befund 3: Automatik fail-closed, Mensch entscheidet mit Kennzeichnung, stabile Prüfreihenfolge", () => {
    const viele = (n) => Array.from({ length: n }, (_, i) => V(`v${String(i).padStart(3, "0")}`));
    const plan = { [add(TAG, -1)]: "S" };
    const offenBefund = (automatisch, vorgaben) => vorgabenBefunde({ dienstarten: DA, vorgaben }, P, TAG, dienst("F"),
      { dienstAm: (x, t) => plan[t] || null, budget: neuesVorgabenBudget(10), automatisch }).find((b) => b.regel === "vorgabeOffen");
    it("Automatik + ungeprüfte Muss-Vorgabe = Achtung (Grund-Kennung „vorgabe“); ohne Automatik nur Hinweis, deutlich „nicht vollständig geprüft“", () => {
      const hart = offenBefund(true, viele(10));
      expect(hart).toMatchObject({ stufe: "achtung", art: "vorgabe" });
      expect(grundKennung(hart)).toBe("vorgabe");
      expect(sperrtBefund(hart.regel)).toBe(false);
      const weich = offenBefund(false, viele(10));
      expect(weich.stufe).toBe("hinweis");
      expect(weich.text).toMatch(/nicht vollständig geprüft/);
      expect(weich.text).toMatch(/bitte selbst/);
    });
    it("Automatik: nur ungeprüfte Soll-Vorgaben bleiben ein Hinweis (nichts Verbindliches blieb offen)", () => {
      expect(offenBefund(true, viele(10).map((v) => ({ ...v, staerke: "soll" }))).stufe).toBe("hinweis");
    });
    it("Automatik: eine fehlerhaft rechnende Muss-Vorgabe oder die Überschreitung der Obergrenze lässt nicht einteilen", () => {
      const kaputt = V("k", { parameter: { art: "verbotenFolge", von: [], dann: ["F"] } });
      const o1 = vorgabenBefunde({ dienstarten: DA, vorgaben: [kaputt] }, P, TAG, dienst("F"), { dienstAm: () => null, automatisch: true });
      expect(o1.map((b) => [b.regel, b.stufe])).toEqual([["vorgabeOffen", "achtung"]]);
      const o2 = vorgabenBefunde({ dienstarten: DA, vorgaben: viele(VORGABEN_WIRKUNG_GRENZE.aktive + 3) }, P, TAG, dienst("F"), { dienstAm: () => null, automatisch: true });
      expect(o2.find((b) => b.regel === "vorgabeOffen").stufe).toBe("achtung");
    });
    it("Ersatzsuche: Automatik teilt niemanden ein, dessen Muss-Vorgaben ungeprüft blieben; der Mensch sieht „möglich“ mit Kennzeichnung", () => {
      const { m } = werkstatt(grosse());
      const mensch = E.ersatzVorschlaege(m, TAG, "F");
      const auto = E.ersatzVorschlaege(m, TAG, "F", undefined, { vorgabenAutomatisch: true });
      const moegl = (l) => l.filter((k) => k.moeglich).length;
      expect(moegl(auto)).toBeLessThan(moegl(mensch));
      expect(auto.some((k) => k.hindernisse.some((h) => /nicht automatisch ein/.test(h)))).toBe(true);
      expect(mensch.some((k) => k.moeglich && k.gruende.some((g) => /nicht vollständig geprüft; bitte selbst/.test(g)))).toBe(true);
    });
    it("Ersatzsuche prüft nach stabilem Schlüssel (Personenkennung), nicht nach Eingabereihenfolge: dieselben Personen bleiben ungeprüft", () => {
      const { m } = werkstatt(grosse());
      const ungeprueft = (mm) => new Set(E.ersatzVorschlaege(mm, TAG, "F").filter((k) => k.gruende.some((g) => /nicht vollständig geprüft/.test(g))).map((k) => String(k.person.id)));
      const a = ungeprueft(m);
      expect(a.size, "das Budget reicht nur für einen Teil").toBeGreaterThan(0);
      expect(a.size).toBeLessThan(m.personen.length);
      const umgekehrt = { ...m, personen: [...m.personen].reverse() };
      expect([...ungeprueft(umgekehrt)].sort()).toEqual([...a].sort());
    });
    it("Selbstplanung: die Übernahme prüft mit einem Budget und fail-closed ohne ausdrückliche Auswahl (Quelle)", () => {
      const q = readFileSync("src/app/aktionen/planung.js", "utf8");
      expect(q).toContain("const vorgabenBudget = neuesVorgabenBudget();");
      expect(q).toContain("hindernisBefunde(m, p, e.datum, da, { vorgabenBudget, vorgabenAutomatisch: !gewaehlt })");
    });
  });

  describe("Befund 4: Zählregel mit rollierendem Fenster prüft jedes Fenster, das die Einteilung enthält", () => {
    const Z = (grenze = 3, fenster = { art: "rollierend", laenge: 7, einheit: "tage" }) =>
      V("z", { regelart: "zaehlregel", parameter: { ereignis: "N", fenster, richtung: "hoechstens", grenze } });
    it("„höchstens 3 N in 7 Tagen“: N am 18.–20. geplant, N am 17. wird eingeteilt → Befund (späteres Fenster)", () => {
      expect(pruefeVorgabe(Z())).toBeNull();
      const plan = { [add(TAG, 1)]: "N", [add(TAG, 2)]: "N", [add(TAG, 3)]: "N" };
      expect(nurVorgabe(pruefe([Z()], plan, { da: "N" })).map((b) => b.regel)).toEqual(["vorgabeMuss"]);
    });
    it("liegen dieselben drei N davor, gibt es den Befund wie bisher; nur zwei danach: keiner; 7 Tage später liegt in keinem Fenster mit dem Tag", () => {
      expect(nurVorgabe(pruefe([Z()], { [add(TAG, -1)]: "N", [add(TAG, -2)]: "N", [add(TAG, -3)]: "N" }, { da: "N" }))).toHaveLength(1);
      expect(nurVorgabe(pruefe([Z()], { [add(TAG, 1)]: "N", [add(TAG, 2)]: "N" }, { da: "N" }))).toEqual([]);
      expect(nurVorgabe(pruefe([Z()], { [add(TAG, 7)]: "N", [add(TAG, 8)]: "N", [add(TAG, 9)]: "N" }, { da: "N" }))).toEqual([]);
    });
    it("eine schon bestehende Verletzung wird der Einteilung nicht angelastet; die Mehr-Last durch sie schon", () => {
      const vor = { [add(TAG, 1)]: "N", [add(TAG, 2)]: "N", [add(TAG, 3)]: "N", [add(TAG, 4)]: "N" };   // 4 N in einem Fenster: schon verletzt
      expect(nurVorgabe(pruefe([Z()], vor, { da: "F" }))).toEqual([]);
      expect(nurVorgabe(pruefe([Z()], vor, { da: "N" }))).toHaveLength(1);   // ein weiteres N macht es schlimmer
    });
    it("Kalendermonat ist unverändert (ein Fenster); die Fensterlänge bleibt begrenzt, das Budget wird für alle Stichtage belastet", () => {
      const km = Z(3, { art: "kalendermonat" });
      const plan = { "2026-11-01": "N", "2026-11-02": "N", "2026-11-03": "N" };
      expect(nurVorgabe(pruefe([km], plan, { da: "N" }))).toHaveLength(1);
      const budget = neuesVorgabenBudget();
      pruefe([Z()], {}, { da: "N", budget });
      /* 7 Tage rollierend: Plan von d−6 bis d+6 (13 Tage, je zweimal) plus 6 weitere Stichtage */
      expect(VORGABEN_WIRKUNG_GRENZE.aufwand - budget.rest).toBe(2 * 13 + 2 * 6);
      expect(vorgabePlanwirkung(Z(3, { art: "rollierend", laenge: 63, einheit: "tage" })).wirkt).toBe(false);
    });
  });

  describe("Befund 5: das Maß der Verletzung ist die Länge, nicht die Zahl der Verstöße", () => {
    const folge = V("folge", { parameter: { art: "hoechstensFolge", klassen: ["F"], max: 3, danachFrei: 0 } });
    const lauf = (tage, d) => nurVorgabe(pruefe([folge], Object.fromEntries(tage.map((t) => [t, "F"])), { d, da: "F" }));
    it("verbindet eine Einteilung zwei zu lange Folgen (4 + 4) zu einer längeren (9), gibt es einen Befund, obwohl die Zahl der Verstöße sinkt", () => {
      const d = TAG;
      const vor = [-4, -3, -2, -1].map((i) => add(d, i));
      const nach = [1, 2, 3, 4].map((i) => add(d, i));
      expect(lauf([...vor, ...nach], d)).toHaveLength(1);
    });
    it("verbindet die Einteilung nichts und verlängert sie keine zu lange Folge, bleibt es ohne Befund", () => {
      const d = TAG;
      expect(lauf([add(d, -3), add(d, -2)], d)).toEqual([]);
      expect(lauf([add(d, 5), add(d, 6), add(d, 7), add(d, 8), add(d, 9)], d)).toEqual([]);
    });
  });

  describe("Mandantengrenze: Vorgaben wirken nur im eigenen Betrieb", () => {
    const folge = { art: "hoechstensFolge", klassen: ["F"], max: 1, danachFrei: 0 };
    const daF = (m) => m.dienstarten.find((x) => x.id === "F");
    it("Vorgaben eines anderen Betriebs haben keine Wirkung, auch nicht über ein geteiltes Budget oder dieselbe Personenkennung", () => {
      const plan = { [add(TAG, -1)]: "F" };
      const fremd = werkstatt([V("fremd", { parameter: folge })], plan);
      const eigen = werkstatt([], plan);
      const budget = neuesVorgabenBudget();
      expect(vorgabeBef(E.hindernisBefunde(fremd.m, fremd.p, TAG, daF(fremd.m), { vorgabenBudget: budget })).map((b) => b.regel)).toEqual(["vorgabeMuss"]);
      expect(fremd.p.id, "gleiche Personenkennung in beiden Betrieben (Klon)").toBe(eigen.p.id);
      expect(vorgabeBef(E.hindernisBefunde(eigen.m, eigen.p, TAG, daF(eigen.m), { vorgabenBudget: budget }))).toEqual([]);
      expect(vorgabeBef(E.hindernisBefunde(eigen.m, eigen.p, TAG, daF(eigen.m)))).toEqual([]);
    });
    it("Vorgabe mit fremder Personenkennung (Geltung „Personen“) trifft niemanden des Betriebs", () => {
      const { m, p } = werkstatt([V("fremd", { geltung: { art: "personen", personen: ["gibt-es-hier-nicht"] }, parameter: folge })], { [add(TAG, -1)]: "F" });
      expect(vorgabeBef(E.hindernisBefunde(m, p, TAG, daF(m)))).toEqual([]);
      for (const k of E.ersatzVorschlaege(m, TAG, "F")) expect(k.hindernisse.join(" ")).not.toMatch(/Interne Vorgabe des Betriebs/);
    });
    it("ohne eigenes Feld m.vorgaben wird nichts gerechnet", () => {
      const { m, p } = werkstatt([], { [add(TAG, -1)]: "F" });
      delete m.vorgaben;
      expect(vorgabenBefunde(m, p, TAG, daF(m), { dienstAm: () => "F" })).toEqual([]);
    });
  });
});

describe("8. Entscheidungen 26.11.: Qualifikationsgruppe, Teilzeit anteilig, Abwesenheit, Zeiträume über der Grenze", () => {
  const QUALS = [{ id: "q1", name: "Fachkraft", kurz: "FK" }, { id: "q2", name: "Praxisanleitung", kurz: "PA" }];
  /** Prüfung mit Betrieb (Dienstarten, Qualifikationen, Soll-Wochenstunden) und Person mit eigenen Feldern. */
  const pruefeM = (vorgaben, plan, { p = P, da = "F", d = TAG, abw = {}, automatisch, quals = QUALS } = {}) =>
    vorgabenBefunde({ dienstarten: DA, qualifikationen: quals, vorgaben, einstellungen: { sollWochenstunden: 40 } }, p, d, dienst(da),
      { dienstAm: (x, t) => plan[t] || null, abwesendAm: (x, t) => abw[t] || null, automatisch });
  const nachtFrueh = { [add(TAG, -1)]: "N" };   // verletzt „nach Nachtdienst kein Frühdienst“ (V-Standard)
  const regeln = (l) => l.map((b) => b.regel);

  describe("Qualifikationsgruppe (Geltung „Personengruppe“ über die strukturierten Qualifikationen der Person)", () => {
    const gr = (...gruppen) => V("g", { geltung: { art: "gruppe", gruppen } });
    it("die Vorgabe gilt für Personen mit der Qualifikation (Name, Kürzel oder Kennung, ohne Groß-/Kleinschreibung), nicht für Personen ohne sie", () => {
      const mit = { id: "pp", qualifikationen: ["q1"] }, ohne = { id: "pp", qualifikationen: ["q2"] }, keine = { id: "pp" };
      for (const name of ["Fachkraft", "fk", "Q1"]) {
        expect(regeln(pruefeM([gr(name)], nachtFrueh, { p: mit })), name).toEqual(["vorgabeMuss"]);
        expect(pruefeM([gr(name)], nachtFrueh, { p: ohne }), name).toEqual([]);
        expect(pruefeM([gr(name)], nachtFrueh, { p: keine }), name).toEqual([]);
      }
    });
    it("unbekannter Gruppenname: nie still „gilt nicht“, sondern offen (Hinweis; Automatik bei Muss: Achtung); eine bekannte Gruppe der Person gilt trotzdem", () => {
      const p = { id: "pp", qualifikationen: ["q2"] };
      const h = pruefeM([gr("Gibt-es-nicht")], nachtFrueh, { p });
      expect(h).toHaveLength(1);
      expect(h[0]).toMatchObject({ regel: "vorgabeOffen", stufe: "hinweis" });
      expect(h[0].text).toMatch(/Qualifikationsgruppe im Betrieb unbekannt/);
      expect(pruefeM([gr("Gibt-es-nicht")], nachtFrueh, { p, automatisch: true })[0]).toMatchObject({ regel: "vorgabeOffen", stufe: "achtung" });
      expect(pruefeM([{ ...gr("Gibt-es-nicht"), staerke: "soll" }], nachtFrueh, { p, automatisch: true })[0].stufe).toBe("hinweis");
      expect(regeln(pruefeM([gr("Gibt-es-nicht", "Praxisanleitung")], nachtFrueh, { p }))).toEqual(["vorgabeMuss"]);
      expect(regeln(pruefeM([gr("Gibt-es-nicht", "Fachkraft")], nachtFrueh, { p }))).toEqual(["vorgabeOffen"]);   // Person nicht in der bekannten Gruppe: unbekannte könnte sie enthalten
    });
    it("Betrieb ohne Qualifikationen: jede Gruppe ist unbekannt (offen); Oberfläche und Meldungen sagen „Qualifikationsgruppe“, nie eine allgemeine Gruppierung", () => {
      expect(regeln(pruefeM([gr("Fachkraft")], nachtFrueh, { p: { id: "pp", qualifikationen: ["q1"] }, quals: [] }))).toEqual(["vorgabeOffen"]);
      const ui = readFileSync("src/ansichten/vorgaben.jsx", "utf8");
      expect(ui).toContain("Qualifikationsgruppe(n)");
      expect(ui).toContain("Qualifikationsgruppen");
      expect(ui).toMatch(/keine allgemeine Gruppierung/);
      expect(ui).not.toContain("Personengruppe");
    });
  });

  describe("Teilzeit anteilig (Zählregel; keine Rundung; Schutzvorschriften unberührt)", () => {
    const Z = (richtung, grenze, extra = {}) => V("z", { regelart: "zaehlregel", parameter: { ereignis: richtung === "mindestens" ? "frei" : "N", fenster: { art: "rollierend", laenge: 7, einheit: "tage" }, richtung, grenze }, ...extra });
    const tz = (stunden) => ({ id: "pp", teilzeit: { aktiv: true }, wochenstunden: stunden });
    const arbeit = { [add(TAG, 1)]: "S", [add(TAG, 2)]: "S", [add(TAG, 3)]: "S", [add(TAG, 4)]: "S" };   // „mindestens 4 freie Tage in 7“ reißt mit der Einteilung am Tag
    it("Ohne ausdrückliches „Teilzeit anteilig: ja“ wird nie skaliert (auch nicht die Untergrenze); eine Mindestzahl freier Tage wird nie nach unten gesetzt, auch nicht bei „ja“", () => {
      expect(regeln(pruefeM([Z("mindestens", 4)], arbeit))).toEqual(["vorgabeMuss"]);
      expect(regeln(pruefeM([Z("mindestens", 4)], arbeit, { p: tz(20) }))).toEqual(["vorgabeMuss"]);                  // Teilzeit, kein Flag: Grenze 4 bleibt
      expect(regeln(pruefeM([Z("mindestens", 4, { ausnahmen: { teilzeitAnteilig: true } })], arbeit, { p: tz(20) }))).toEqual(["vorgabeMuss"]);   // frei: nie nach unten
      expect(pruefeVorgabe(Z("mindestens", 4, { ausnahmen: { teilzeitAnteilig: true } }))).toMatch(/Mindestzahl freier Tage gilt nie anteilig/);
      expect(pruefeVorgabe(Z("mindestens", 4, { ausnahmen: { teilzeitAnteilig: false } }))).toBeNull();
      expect(pruefeVorgabe(Z("hoechstens", 3, { ausnahmen: { teilzeitAnteilig: true } }))).toBeNull();
    });
    it("nicht ganzzahlige Grenze (60 % von 3 = 1,8, nur bei „ja“): kein stilles Runden — knapp daneben ist offen, deutlich darüber ein Befund mit dem Hinweis „anteilig, nicht ganzzahlig“", () => {
      const ja = { ausnahmen: { teilzeitAnteilig: true } };
      const knapp = pruefeM([Z("hoechstens", 3, ja)], { [add(TAG, 1)]: "N" }, { da: "N", p: tz(24) });   // 2 bei Grenze 1,8
      expect(regeln(knapp)).toEqual(["vorgabeOffen"]);
      expect(knapp[0].text).toMatch(/anteilig, nicht ganzzahlig/);
      const b = pruefeM([Z("hoechstens", 3, ja)], { [add(TAG, 1)]: "N", [add(TAG, 2)]: "N" }, { da: "N", p: tz(24) });   // 3 bei Grenze 1,8
      expect(regeln(b)).toEqual(["vorgabeMuss"]);
      expect(b[0].text).toMatch(/anteilig: Grenze 1.8, nicht ganzzahlig/);
    });
    it("Formular: ein nicht angehaktes Kästchen „Teilzeit anteilig“ speichert nichts und wirkt als „nicht anteilig“ — keine stille Lockerung", async () => {
      const { formularZuVorgabe } = await import("../src/ansichten/vorgaben.jsx");
      const m0 = { einheiten: [], personen: [] };
      const basis = (anteilig) => ({ id: "tz-form", name: "Formular", beschreibung: "", regelart: "zaehlregel", parameter: {}, geltung: { art: "betrieb" }, bezug: "monat", staerke: "muss",
        prioritaet: 1, grundlage: { art: "hausregel", fundstelle: "" }, ausnahmen: { personen: [], teilzeitAnteilig: anteilig }, status: "entwurf" });
      const aus = (anteilig) => formularZuVorgabe(basis(anteilig), {}, m0).ausnahmen;
      expect((aus(false) || {}).teilzeitAnteilig).toBeUndefined();
      expect((aus(true) || {}).teilzeitAnteilig).toBe(true);
      const nacht = { [add(TAG, 1)]: "N", [add(TAG, 2)]: "N" };
      const mitAusnahmen = (anteilig) => Z("hoechstens", 3, { ausnahmen: aus(anteilig) || {} });
      expect(pruefeM([mitAusnahmen(false)], nacht, { da: "N", p: tz(20) })).toEqual([]);                             // nicht angehakt: Grenze 3 gilt unverändert
      expect(regeln(pruefeM([mitAusnahmen(true)], nacht, { da: "N", p: tz(20) }))).toEqual(["vorgabeMuss"]);         // angehakt: anteilig 1,5
    });
    it("Vorgabe schließt „anteilig“ aus (teilzeitAnteilig: nein): keine Skalierung, auch bei Untergrenzen", () => {
      expect(regeln(pruefeM([Z("mindestens", 4, { ausnahmen: { teilzeitAnteilig: false } })], arbeit, { p: tz(20) }))).toEqual(["vorgabeMuss"]);
    });
    it("Teilzeitquote nicht bestimmbar (aktive Teilzeit ohne Wochenstunden, Vorgabe gilt anteilig): offen, in der Automatik Achtung — nie geraten", () => {
      const p = { id: "pp", teilzeit: { aktiv: true } };
      const v = Z("hoechstens", 3, { ausnahmen: { teilzeitAnteilig: true } });
      const nacht = { [add(TAG, 1)]: "N", [add(TAG, 2)]: "N" };
      expect(pruefeM([v], nacht, { da: "N", p }).map((b) => [b.regel, b.stufe])).toEqual([["vorgabeOffen", "hinweis"]]);
      expect(pruefeM([v], nacht, { da: "N", p, automatisch: true })[0].stufe).toBe("achtung");
    });
    it("Teilzeitquote: ohne Teilzeit 1, sonst Wochenstunden zur Soll-Wochenarbeitszeit, ohne Rundung und ohne Untergrenze", () => {
      expect(teilzeitQuote({}, { id: "x" })).toBe(1);
      expect(teilzeitQuote({ einstellungen: { sollWochenstunden: 38.5 } }, { teilzeit: { aktiv: true }, wochenstunden: 19.25 })).toBe(0.5);
      expect(teilzeitQuote({}, { teilzeit: { aktiv: true }, wochenstunden: 2 })).toBe(0.05);
      expect(teilzeitQuote({}, { teilzeit: { aktiv: true }, wochenstunden: 1 })).toBe(0.025);
      expect(teilzeitQuote({}, { teilzeit: { aktiv: true }, wochenstunden: 50 })).toBe(1);
      expect(teilzeitQuote({}, { teilzeit: { aktiv: true } })).toBeNull();
    });
    it("Schutzvorschriften bleiben unberührt: die Ruhezeitprüfung der Einteilung ist mit und ohne Vorgabe dieselbe", async () => {
      const F = await import("../src/lib/fachlogik.js");
      const E = await import("../server/lib/engine/einsatz.mjs");
      const B = betriebe(F);
      const bauen = (vorgaben) => {
        const m = structuredClone(B.find(([n]) => n.startsWith("demo1"))[1]);
        m.abwesenheiten = []; m.vorgaben = vorgaben;
        const p = m.personen.find((x) => x.rolle === "mitarbeiter" && !(x.teilzeit && x.teilzeit.aktiv) && !x.springer);
        p.teilzeit = { aktiv: true, modus: "quote" }; p.wochenstunden = 20;
        for (let i = -20; i <= 20; i++) m.abweichungen[`${p.id}|${add(TAG, i)}`] = "-";
        m.abweichungen[`${p.id}|${add(TAG, -1)}`] = "N";
        return { m, p };
      };
      const ohne = bauen([]), mit = bauen([Z("mindestens", 4, { ausnahmen: { teilzeitAnteilig: true } })]);
      const nurSchutz = (x) => E.hindernisBefunde(x.m, x.p, TAG, x.m.dienstarten.find((d) => d.id === "F")).filter((b) => b.art !== "vorgabe").map((b) => [b.regel, b.stufe, b.sperrt]);
      expect(nurSchutz(mit)).toEqual(nurSchutz(ohne));
      expect(nurSchutz(mit).some((b) => b[0] === "ruhezeitGesetz")).toBe(true);
    });
  });

  describe("Abwesenheit: Urlaub und Krankheit aus der Zählung genommen, nie als Ruhezeit oder Freizeit gewertet", () => {
    const Zf = (extra = {}) => V("z", { regelart: "zaehlregel", parameter: { ereignis: "frei", fenster: { art: "rollierend", laenge: 7, einheit: "tage" }, richtung: "mindestens", grenze: 4 }, ...extra });
    const plan = { [add(TAG, 4)]: "S", [add(TAG, 5)]: "S" };
    const urlaub = { [add(TAG, 1)]: "urlaub", [add(TAG, 2)]: "krank", [add(TAG, 3)]: "urlaub" };
    it("Urlaub/Krankheit zählen nicht als freie Tage, und die Vergleichsgrundlage sinkt mit (Zähler und Grenze aus demselben Zeitraum): Befund nennt es", () => {
      const b = pruefeM([Zf()], plan, { abw: urlaub });
      expect(regeln(b)).toEqual(["vorgabeMuss"]);
      expect(b[0].text).toMatch(/ohne Urlaub und Krankheit/);
      expect(b[0].text).toMatch(/anteilig: Grenze 2\.2857/);
    });
    it("derselbe Plan mit einer anderen Abwesenheit (Schulung) bleibt ohne Herausnahme (keine Skalierung der Grenze)", () => {
      const schulung = Object.fromEntries(Object.keys(urlaub).map((t) => [t, "schulung"]));
      const b = pruefeM([Zf()], plan, { abw: schulung });
      expect(regeln(b)).toEqual(["vorgabeMuss"]);
      expect(b[0].text).not.toMatch(/ohne Urlaub und Krankheit/);
    });
    it("Verdrahtung: hindernisBefunde reicht die Abwesenheiten des Betriebs an die Prüfung (Urlaub im Plan wird herausgenommen)", async () => {
      const F = await import("../src/lib/fachlogik.js");
      const E = await import("../server/lib/engine/einsatz.mjs");
      const B = betriebe(F);
      const m = structuredClone(B.find(([n]) => n.startsWith("demo1"))[1]);
      m.vorgaben = [Zf()];
      const p = m.personen.find((x) => x.rolle === "mitarbeiter" && !(x.teilzeit && x.teilzeit.aktiv) && !x.springer);
      m.abwesenheiten = [{ id: "u-test", personId: p.id, art: "urlaub", von: add(TAG, 1), bis: add(TAG, 3) }];
      for (let i = -20; i <= 20; i++) m.abweichungen[`${p.id}|${add(TAG, i)}`] = "-";
      m.abweichungen[`${p.id}|${add(TAG, 4)}`] = "S"; m.abweichungen[`${p.id}|${add(TAG, 5)}`] = "S";
      const b = E.hindernisBefunde(m, p, TAG, m.dienstarten.find((x) => x.id === "F")).filter((x) => x.art === "vorgabe");
      expect(b.map((x) => x.regel)).toEqual(["vorgabeMuss"]);
      expect(b[0].text).toMatch(/ohne Urlaub und Krankheit/);
    });
    it("Tagesklasse: ein abwesender Tag hat keine Klasse (unbekannt), nie „frei“; ohne Abwesenheit ohne Dienst „frei“", () => {
      expect(tagesklasse(null, true)).toBeUndefined();
      expect(tagesklasse("F", true)).toBeUndefined();
      expect(tagesklasse(null, false)).toBe("frei");
      expect(tagesklasse("", false)).toBe("frei");
      expect(tagesklasse("N", false)).toBe("N");
      expect(VORGABEN_ZAEHLUNG_OHNE).toEqual(["urlaub", "krank"]);
    });
    it("Muster: ein abwesender Tag nach dem Block gilt nicht als freier Tag — das Ergebnis bleibt offen statt erfüllt (kein Befund, aber auch kein stilles „bestanden“)", () => {
      const folge = V("folge", { parameter: { art: "hoechstensFolge", klassen: ["F"], max: 2, danachFrei: 1 } });
      expect(pruefeM([folge], { [add(TAG, 1)]: "S" }, { da: "F" }).map((b) => b.regel)).toEqual(["vorgabeMuss"]);   // Einteilung F, danach Dienst S statt frei
      expect(pruefeM([folge], {}, { da: "F", abw: { [add(TAG, 1)]: "urlaub" } })).toEqual([]);                       // Urlaub danach: unbekannt, kein Befund
    });
  });

  describe("Zählregeln und Muster über der Grenze (62 Tage) gelten nie still als bestanden", () => {
    const jahr = (extra = {}) => V("j", { regelart: "zaehlregel", parameter: { ereignis: "N", fenster: { art: "kalenderjahr" }, richtung: "hoechstens", grenze: 60 }, ...extra });
    it("wirkt im Plan nicht (WP-I7, Aggregate) — die Prüfung meldet es als „nicht vollständig geprüft“ mit Grund, in der Automatik bei Muss als Achtung", () => {
      const b = pruefeM([jahr()], {});
      expect(b.map((x) => [x.regel, x.stufe])).toEqual([["vorgabeOffen", "hinweis"]]);
      expect(b[0].text).toMatch(/Zeitraum über 62 Tage/);
      expect(pruefeM([jahr()], {}, { automatisch: true })[0].stufe).toBe("achtung");
      expect(pruefeM([jahr({ staerke: "soll" })], {}, { automatisch: true })[0].stufe).toBe("hinweis");
      const lang = V("m", { parameter: { art: "hoechstensFolge", klassen: ["F"], max: 40, danachFrei: 0 } });
      expect(regeln(pruefeM([lang], {}))).toEqual(["vorgabeOffen"]);
    });
    it("gilt die Vorgabe für die Person gar nicht (andere Person, Ausnahme), bleibt es still; Testlauf-Regelarten bleiben wie dokumentiert nur im Testlauf", () => {
      expect(pruefeM([jahr({ geltung: { art: "personen", personen: ["andere"] } })], {})).toEqual([]);
      expect(pruefeM([jahr({ ausnahmen: { personen: ["pp"] } })], {})).toEqual([]);
      expect(pruefeM([V("g", { regelart: "grenzregel", parameter: { groesse: "x", hoechstens: 3 } })], {})).toEqual([]);
    });
  });
});

describe("9. Zählregeln rechnen mit Präfixsummen: gleiches Ergebnis wie der Regelbaukasten", () => {
  const rng = (seed) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  it("300 Zufallsfälle (Richtung, Grenze, Fenster in Tagen/Wochen, Ereignis, Plan): Befund genau dann, wenn der Baukasten in einem der Fenster mit der Einteilung verletzt und die Einteilung die Verletzung herbeiführt oder vergrößert", async () => {
    const { zaehlregel } = await import("../server/lib/regelbaukasten.mjs");
    const { vorgabeAlsRegel } = await import("../server/lib/vorgaben.mjs");
    const r = rng(20261126);
    const wahl = (l) => l[Math.floor(r() * l.length)];
    let befunde = 0;
    for (let i = 0; i < 300; i++) {
      const einheit = wahl(["tage", "wochen"]);
      const laenge = einheit === "tage" ? 2 + Math.floor(r() * 9) : 1 + Math.floor(r() * 2);
      const n = einheit === "tage" ? laenge : 7 * laenge;
      const richtung = wahl(["hoechstens", "mindestens"]);
      const ereignis = wahl(["N", "F", "frei"]);
      const grenze = 1 + Math.floor(r() * 4);
      const v = V("z", { regelart: "zaehlregel", parameter: { ereignis, fenster: { art: "rollierend", laenge, einheit }, richtung, grenze } });
      const plan = {};
      for (let o = -(n - 1); o <= n - 1; o++) if (o !== 0 && r() < 0.45) plan[add(TAG, o)] = wahl(["F", "S", "N"]);
      const da = wahl(["F", "S", "N"]);
      const regel = vorgabeAlsRegel(v, { wirkend: true });
      const massDe = (e) => (richtung === "mindestens" ? -e.fakten.anzahl : e.fakten.anzahl);
      let erwartet = false;
      for (let so = 0; so < n && !erwartet; so++) {
        const mitL = [], ohneL = [];
        for (let o = -(n - 1); o <= n - 1; o++) {
          const t = add(TAG, o);
          const ohne = o === 0 ? "frei" : (plan[t] || "frei");
          const mit = o === 0 ? da : ohne;
          if (ohne === ereignis) ohneL.push(t);
          if (mit === ereignis) mitL.push(t);
        }
        const st = add(TAG, so);
        const mitE = zaehlregel(regel, { ereignisse: mitL, stichtag: st });
        if (mitE.status !== "verletzt") continue;
        const ohneE = zaehlregel(regel, { ereignisse: ohneL, stichtag: st });
        if (!(ohneE.status === "verletzt" && massDe(mitE) <= massDe(ohneE))) erwartet = true;
      }
      const echt = nurVorgabe(pruefe([v], plan, { da })).length > 0;
      expect(echt, `Fall ${i}: ${richtung} ${grenze} ${ereignis} ${laenge} ${einheit}, Dienst ${da}`).toBe(erwartet);
      if (erwartet) befunde++;
    }
    expect(befunde, "die Fälle enthalten Befunde und Nicht-Befunde").toBeGreaterThan(20);
    expect(befunde).toBeLessThan(280);
  }, 120000);
  it("Kalendermonat und Monate-Fenster laufen über denselben Weg (ein bzw. mehrere Stichtage, Fenster aus dem Baukasten)", () => {
    const km = V("z", { regelart: "zaehlregel", parameter: { ereignis: "N", fenster: { art: "kalendermonat" }, richtung: "hoechstens", grenze: 2 } });
    expect(nurVorgabe(pruefe([km], { "2026-11-01": "N", "2026-11-02": "N" }, { da: "N" }))).toHaveLength(1);
    expect(nurVorgabe(pruefe([km], { "2026-11-01": "N" }, { da: "N" }))).toEqual([]);
    const mo = V("z", { regelart: "zaehlregel", parameter: { ereignis: "N", fenster: { art: "rollierend", laenge: 1, einheit: "monate" }, richtung: "hoechstens", grenze: 2 } });
    expect(nurVorgabe(pruefe([mo], { [add(TAG, -3)]: "N", [add(TAG, -9)]: "N" }, { da: "N" }))).toHaveLength(1);
    expect(nurVorgabe(pruefe([mo], { [add(TAG, -3)]: "N" }, { da: "N" }))).toEqual([]);
  });
  it("ein ungültiger Zeitraum oder ein ungültiges Muster wird nicht als „über 62 Tage“ gemeldet, fällt aber nicht still weg (WP-I7 Teil 5, Review #587 C1): nicht vollständig geprüft", () => {
    /* Bis WP-I7 Teil 5 erwartet: kein Befund (still weg). Betreiberentscheidung 26.11.: ungültige/nicht bewertbare Muss-Muster dürfen nicht still wegfallen. */
    const kaputt = V("z", { regelart: "zaehlregel", parameter: { ereignis: "N", fenster: { art: "unsinn" }, richtung: "hoechstens", grenze: 2 } });
    const kaputtMuster = V("m", { parameter: { art: "hoechstensFolge", klassen: ["F"], max: "x", danachFrei: 0 } });
    for (const [v, da] of [[kaputt, "N"], [kaputtMuster, "F"]]) {
      const b = pruefe([v], {}, { da });
      expect(b.map((x) => [x.regel, x.stufe])).toEqual([["vorgabeOffen", "hinweis"]]);
      expect(b[0].text).toContain("nicht auswertbar beschrieben");
      expect(b[0].text).not.toContain("62 Tage");
      const auto = vorgabenBefunde({ dienstarten: DA, vorgaben: [v] }, P, TAG, dienst(da), { dienstAm: () => null, automatisch: true });
      expect(auto.map((x) => [x.regel, x.stufe]), "Automatik: Muss offen = Achtung").toEqual([["vorgabeOffen", "achtung"]]);
      expect(pruefe([{ ...v, staerke: "soll" }], {}, { da }).map((x) => x.regel)).toEqual(["vorgabeOffen"]);
      expect(pruefe([{ ...v, geltung: { art: "personen", personen: ["andere"] } }], {}, { da }), "gilt nicht für die Person: nichts").toEqual([]);
    }
  });
});

describe("10. „Montag frei“ nach einem Wochenende mit gewählten Diensten (WP-I7 Teil 5, konfigurierbare betriebliche Vorgabe)", () => {
  /* 2026-11-21 Samstag, 22. Sonntag, 23. Montag. */
  const SA = "2026-11-21", SO = "2026-11-22", MO = "2026-11-23";
  const MF = (extra = {}) => V("mofrei", { name: "Montag frei nach Nachtwochenende", parameter: { art: "montagFrei", klassen: ["N"] }, ...extra });
  it("Verwaltung: gültig beschrieben, Selbsttest (Testlauf) grün; ohne Dienstarten abgewiesen", () => {
    expect(pruefeVorgabe(MF())).toBeNull();
    const t = vorgabeTestlauf(MF());
    expect(t.ok, JSON.stringify(t).slice(0, 300)).toBe(true);
    expect(t.ergebnisse.length).toBe(2);
    expect(pruefeVorgabe(MF({ parameter: { art: "montagFrei", klassen: [] } }))).not.toBeNull();
  });
  it("Muss: Dienst am Montag nach Samstag- und Sonntagsnacht = Achtung; Montag frei, nur eine Nacht am Wochenende oder andere Dienste = nichts", () => {
    const b = nurVorgabe(pruefe([MF()], { [SA]: "N", [SO]: "N" }, { d: MO, da: "F" }));
    expect(b.map((x) => [x.regel, x.stufe])).toEqual([["vorgabeMuss", "achtung"]]);
    expect(pruefe([MF()], { [SA]: "S", [SO]: "N" }, { d: MO, da: "F" })).toEqual([]);
    expect(pruefe([MF()], { [SA]: "N", [SO]: "F" }, { d: MO, da: "F" })).toEqual([]);
    expect(pruefe([MF()], { [SA]: "N", [SO]: "N" }, { d: "2026-11-24", da: "F" }), "Dienstag").toEqual([]);
  });
  it("auch die Einteilung am Wochenende wird geprüft (Sonntagsnacht, wenn Samstag N und Montag schon Dienst hat); Vorbestand nicht angelastet", () => {
    expect(nurVorgabe(pruefe([MF()], { [SA]: "N", [MO]: "F" }, { d: SO, da: "N" })).map((x) => x.regel)).toEqual(["vorgabeMuss"]);
    expect(nurVorgabe(pruefe([MF()], { [SO]: "N", [MO]: "F" }, { d: SA, da: "N" })).map((x) => x.regel)).toEqual(["vorgabeMuss"]);
    expect(pruefe([MF()], { [SA]: "N", [MO]: "F" }, { d: SO, da: "F" }), "Sonntag Frühdienst löst nicht aus").toEqual([]);
  });
  it("Stärke und Geltung aus der Vorgabe: Soll = Hinweis; Geltung einzelne Personen; abwesender Montag = nicht vollständig, nie „frei“", () => {
    expect(nurVorgabe(pruefe([MF({ staerke: "soll" })], { [SA]: "N", [SO]: "N" }, { d: MO, da: "F" })).map((x) => [x.regel, x.stufe])).toEqual([["vorgabeSoll", "hinweis"]]);
    expect(pruefe([MF({ geltung: { art: "personen", personen: ["andere"] } })], { [SA]: "N", [SO]: "N" }, { d: MO, da: "F" })).toEqual([]);
    expect(vorgabePlanwirkung(MF()).wirkt).toBe(true);
  });
  it("Planer und Planungsassistent: keine Nacht am Montag nach einem Nachtwochenende der Person (Muss), offen statt Verletzung; ohne Vorgabe eingeteilt", async () => {
    const F = await import("../src/lib/fachlogik.js");
    const { baueLeerenBetrieb } = await import("../server/lib/leerbetrieb.mjs");
    const { planeVorschlag } = await import("../server/lib/engine/planer.mjs");
    const m = baueLeerenBetrieb({ name: "T", branche: "pflege", email: "x@example.org", land: "HE", raum: "r" }).mandanten[0];
    m.personen = [{ id: "p1", vorname: "A", nachname: "B", eintritt: "2020-01-01", zugehoerigkeit: [{ einheitId: m.einheiten[0].id, ab: "2020-01-01" }], wochenstunden: 40, status: "aktiv", qualifikationen: [] }];
    m.dienstarten = m.dienstarten.map((d) => (d.id === "N" ? { ...d, mindest: { mo_do: 1, fr: 0, sa: 0, so: 0 } } : d));
    m.abweichungen = { [`p1|${SA}`]: "N", [`p1|${SO}`]: "N" };
    m.vorgaben = [MF()];
    const ym = "2026-11";
    const a = F.planeMonat(structuredClone(m), ym, { maxProPerson: 31 });
    expect(a.gesetzt.some((g) => g.datum === MO)).toBe(false);
    expect(a.offen.some((x) => x.datum === MO && x.dienstId === "N")).toBe(true);
    const r = planeVorschlag(structuredClone(m), ym, { freigabe: true, zuege: 0, maxProPerson: 31 });
    expect(r.gesetzt.some((g) => g.datum === MO)).toBe(false);
    const o = r.offen.find((x) => x.datum === MO && x.dienstId === "N");
    expect(o).toBeTruthy();
    expect(o.grund || (o.regeln || []).join(",")).toContain("vorgabe");
    /* Gegenprobe ohne Vorgabe: am Montag eingeteilt (sonst prüfte der Test nichts). */
    const ohne = F.planeMonat({ ...structuredClone(m), vorgaben: [] }, ym, { maxProPerson: 31 });
    expect(ohne.gesetzt.some((g) => g.datum === MO)).toBe(true);
  }, 300000);
});
