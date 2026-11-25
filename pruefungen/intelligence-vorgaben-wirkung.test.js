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
import { vorgabenBefunde, vorgabePlanwirkung, neuesVorgabenBudget, VORGABEN_BEFUNDART, VORGABEN_PLANARTEN } from "../server/lib/vorgabenwirkung.mjs";
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
  it("Geltung: Betrieb alle, Einheit nur die genannte, Personen nur die genannten; Personengruppe wirkt (noch) nicht", () => {
    const plan = { [add(TAG, -1)]: "N" };
    expect(nurVorgabe(pruefe([V("a", { geltung: { art: "einheit", einheiten: ["e1"] } })], plan, { einheitAm: () => "e1" }))).toHaveLength(1);
    expect(pruefe([V("a", { geltung: { art: "einheit", einheiten: ["e1"] } })], plan, { einheitAm: () => "e2" })).toEqual([]);
    expect(pruefe([V("a", { geltung: { art: "einheit", einheiten: ["e1"] } })], plan)).toEqual([]);   // Einheit unbekannt: nicht raten
    expect(nurVorgabe(pruefe([V("a", { geltung: { art: "personen", personen: ["pp"] } })], plan))).toHaveLength(1);
    expect(pruefe([V("a", { geltung: { art: "personen", personen: ["andere"] } })], plan)).toEqual([]);
    expect(pruefe([V("a", { geltung: { art: "gruppe", gruppen: ["Nachtwache"] } })], plan)).toEqual([]);
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
  it("Personengruppen und große Zeiträume wirken nicht, mit Grund", () => {
    expect(vorgabePlanwirkung(V("a", { geltung: { art: "gruppe", gruppen: ["x"] } })).wirkt).toBe(false);
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
