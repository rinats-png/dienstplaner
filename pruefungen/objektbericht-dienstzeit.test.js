/* ==========================================================================
   OBJEKTBERICHT: DIENSTZEIT AUS DER BESTÄTIGTEN IST-ZEIT (WP-19.3, OB-2)

   `kontext.dienstzeit` lieferte immer null (src/module/zugriff.js). Jetzt kommt
   sie aus der bestätigten Erfassung (src/module/dienstzeit.js) — nie aus dem
   Plan; ohne bestätigte Erfassung null mit Grundcode. Rollen: dieselbe Regel
   wie überall (istVerfuegbar auf der Serversicht, bestandFuerRolle); die
   Quelle des Berichts nur bei Berichtszugriff „voll“ (Planung, Leitung) und
   nur für den eigenen Betrieb. Das Modul bleibt „geplant“ (keine Wirkung).

   Rot vor der Änderung: src/module/dienstzeit.js fehlte, modulKontext gab eine
   übergebene Quelle jeder Rolle weiter.

   Aufruf: npm run pruefung:objektbericht-dienstzeit
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { bestandFuerRolle } from "../server/lib/rechte.mjs";
import { heuteBerlin, tagePlus } from "../server/lib/zeiterfassung.mjs";
import { objektberichtDaten } from "../server/lib/modul-objektbericht.mjs";
import { BRANCHENMODULE, modulVon, pruefeModulRegistry } from "../server/lib/branchenmodule.mjs";
import { oberflaechenFuer } from "../src/module/index.js";
import { modulKontext } from "../src/module/zugriff.js";
import { bestaetigteDienstzeit, dienstzeitStand, objektberichtDienstzeit, DIENSTZEIT_GRUND as G } from "../src/module/dienstzeit.js";

const TAG = "2026-11-02";
const person = (id, rolle, einheit = "e1", extra = {}) => ({ id, vorname: "V", nachname: `N${id}`, rolle, bereich: einheit,
  status: "aktiv", eintritt: "2020-01-01", zugehoerigkeit: [{ ab: "2020-01-01", einheitId: einheit }], ...extra });

/** Ein Betrieb: a1, b1 Früh (06–14) auf Posten po1; n1 Nacht (22–06) auf po2. */
const betrieb = (tag = TAG, extra = {}) => ({
  id: "m1", name: "Betrieb",
  einheiten: [{ id: "e1", name: "Bereich 1" }, { id: "e2", name: "Bereich 2" }],
  personen: [person("l1", "leitung"), person("pl", "planer"), person("s1", "subplaner"), person("br", "betriebsrat"),
    person("a1", "mitarbeiter"), person("b1", "mitarbeiter"), person("n1", "mitarbeiter", "e2"), person("k1", "mitarbeiter")],
  dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00", pause: 30 },
    { id: "N", name: "Nacht", start: "22:00", ende: "06:00", pause: 30 }],
  abweichungen: { [`a1|${tag}`]: "F", [`b1|${tag}`]: "F", [`n1|${tag}`]: "N", [`k1|${tag}`]: "F" },
  abwesenheiten: [{ id: "ab1", personId: "k1", art: "krank", von: tag, bis: tag, diagnose: "Grippe-geheim" }],
  erfassung: {
    [`a1|${tag}`]: { start: "06:02", ende: "14:07", bestaetigt: true, pause: 30, grund: "Übergabe-geheim" },
    [`b1|${tag}`]: { start: "05:58", ende: "13:55", bestaetigt: true },
    [`n1|${tag}`]: { start: "21:55", ende: "06:10", bestaetigt: true },
  },
  objekte: [{ id: "o1", name: "Objekt Nord", posten: [
    { id: "po1", name: "Pforte", soll: { F: 2 }, qualifikationen: [] },
    { id: "po2", name: "Streife", soll: { N: 1 }, qualifikationen: [] }] }],
  postenPlan: { [`a1|${tag}`]: "po1", [`b1|${tag}`]: "po1", [`n1|${tag}`]: "po2" },
  wachbuch: {},
  ...extra,
});
const sitzFuer = (m, rolle) => ({ rolle, mandant: m, person: m.personen.find((p) => p.rolle === rolle) || null });
const sicht = (b, rolle, pid) => bestandFuerRolle({ mandanten: [b] }, { rolle, person: pid, betrieb: 0 }).mandanten[0];

describe("bestätigte Dienstzeit einer Person (Beginn und Ende der bestätigten Erfassung)", () => {
  it("bestätigte Erfassung → Beginn und Ende genau wie bestätigt", () => {
    expect(bestaetigteDienstzeit(betrieb(), "a1", TAG)).toEqual({ grund: null,
      dienstzeit: { beginn: `${TAG}T06:02`, ende: `${TAG}T14:07`, von: "06:02", bis: "14:07", endeTag: TAG, anwesenheitStd: 8.08 } });
  });
  it("keine Erfassung → null mit Grund, nie die Planzeit", () => {
    const m = betrieb(); delete m.erfassung[`b1|${TAG}`];
    const r = bestaetigteDienstzeit(m, "b1", TAG);
    expect(r).toEqual({ dienstzeit: null, grund: G.KEINE_ERFASSUNG });
    expect(JSON.stringify(r)).not.toMatch(/06:00|14:00/);
  });
  it("unbestätigte Erfassung (zur Prüfung) → null mit Grund, nie die Planzeit", () => {
    const m = betrieb(); m.erfassung[`a1|${TAG}`] = { start: "06:02", ende: "18:30", bestaetigt: false, grund: "LANGER_DIENST" };
    expect(bestaetigteDienstzeit(m, "a1", TAG)).toEqual({ dienstzeit: null, grund: G.NICHT_BESTAETIGT });
    m.erfassung[`a1|${TAG}`] = { start: "06:02", ende: "14:00" };
    expect(bestaetigteDienstzeit(m, "a1", TAG)).toEqual({ dienstzeit: null, grund: G.NICHT_BESTAETIGT });
    m.erfassung[`a1|${TAG}`] = { start: "06:02", ende: "14:00", bestaetigt: "true" };
    expect(bestaetigteDienstzeit(m, "a1", TAG).grund).toBe(G.NICHT_BESTAETIGT);
  });
  it("bestätigt, aber Beginn oder Ende fehlt → kein Rückfall auf die Dienstart (anders als istZeitFuer)", () => {
    const m = betrieb(); m.erfassung[`a1|${TAG}`] = { start: "06:02", bestaetigt: true };
    expect(bestaetigteDienstzeit(m, "a1", TAG)).toEqual({ dienstzeit: null, grund: G.ZEITEN_UNVOLLSTAENDIG });
    m.erfassung[`a1|${TAG}`] = { start: "6:02", ende: "25:00", bestaetigt: true };
    expect(bestaetigteDienstzeit(m, "a1", TAG).grund).toBe(G.ZEITEN_UNVOLLSTAENDIG);
  });
  it("ungültiger Tag und fremde Person (anderer Betrieb, ähnliche Kennung) → null", () => {
    expect(bestaetigteDienstzeit(betrieb(), "a1", "2026-02-31").grund).toBe(G.TAG_UNGUELTIG);
    expect(bestaetigteDienstzeit(betrieb(), "a10", TAG).grund).toBe(G.PERSON_UNBEKANNT);
    expect(bestaetigteDienstzeit(betrieb(), null, TAG).grund).toBe(G.PERSON_UNBEKANNT);
    const fremd = betrieb(); fremd.id = "m2"; fremd.erfassung[`x9|${TAG}`] = { start: "06:00", ende: "14:00", bestaetigt: true };
    expect(bestaetigteDienstzeit(betrieb(), "x9", TAG).grund).toBe(G.PERSON_UNBEKANNT);
  });
  it("keine Gesundheits- oder Abwesenheitsangabe, keine Pause, kein Korrekturgrund im Ergebnis", () => {
    const m = betrieb(); m.erfassung[`k1|${TAG}`] = { start: "06:00", ende: "08:00", bestaetigt: true, grund: "krank-geheim" };
    const r = bestaetigteDienstzeit(m, "a1", TAG), k = bestaetigteDienstzeit(m, "k1", TAG);
    expect(Object.keys(r.dienstzeit).sort()).toEqual(["anwesenheitStd", "beginn", "ende", "endeTag", "bis", "von"].sort());
    expect(JSON.stringify([r, k])).not.toMatch(/krank|Grippe|geheim|pause|abwes/i);
  });
});

describe("Nachtdienst über Mitternacht und Zeitumstellung", () => {
  it("Ende vor dem Beginn liegt am Folgetag", () => {
    expect(bestaetigteDienstzeit(betrieb(), "n1", TAG).dienstzeit)
      .toEqual({ beginn: `${TAG}T21:55`, ende: "2026-11-03T06:10", von: "21:55", bis: "06:10", endeTag: "2026-11-03", anwesenheitStd: 8.25 });
  });
  it("Monatswechsel und Jahreswechsel", () => {
    const m = betrieb("2026-12-31");
    m.erfassung["n1|2026-12-31"] = { start: "22:00", ende: "06:00", bestaetigt: true };
    expect(bestaetigteDienstzeit(m, "n1", "2026-12-31").dienstzeit).toMatchObject({ ende: "2027-01-01T06:00", endeTag: "2027-01-01" });
  });
  it("Frühjahr (29.03.2026): die Nacht hat 7 Stunden Anwesenheit; Herbst (25.10.2026): 9", () => {
    const f = betrieb("2026-03-28");
    f.erfassung["n1|2026-03-28"] = { start: "22:00", ende: "06:00", bestaetigt: true };
    expect(bestaetigteDienstzeit(f, "n1", "2026-03-28").dienstzeit).toMatchObject({ ende: "2026-03-29T06:00", anwesenheitStd: 7 });
    const h = betrieb("2026-10-24");
    h.erfassung["n1|2026-10-24"] = { start: "22:00", ende: "06:00", bestaetigt: true };
    expect(bestaetigteDienstzeit(h, "n1", "2026-10-24").dienstzeit).toMatchObject({ ende: "2026-10-25T06:00", anwesenheitStd: 9 });
  });
  it("Nachtdienst im Bericht: bestätigt über Mitternacht zählt im Nachtdienst des Beginntags", () => {
    const m = betrieb();
    expect(dienstzeitStand(m, sitzFuer(m, "leitung"), TAG, "N")).toEqual({ personen: ["n1"], grund: null });
    const f = betrieb("2026-03-28");
    expect(dienstzeitStand(f, sitzFuer(f, "planer"), "2026-03-28", "N")).toEqual({ personen: ["n1"], grund: null });
  });
});

describe("Quelle des Objektberichts: Dienst und Tag", () => {
  it("alle Eingeteilten bestätigt → Personen; Bericht zählt Ist aus der bestätigten Zeit", () => {
    const m = betrieb(), s = sitzFuer(m, "leitung");
    expect(dienstzeitStand(m, s, TAG, "F")).toEqual({ personen: ["a1", "b1"], grund: null });
    const b = objektberichtDaten(m, { objektId: "o1", von: TAG, bis: TAG, zugriff: "voll", dienstzeit: objektberichtDienstzeit(m, s) });
    expect(b.tage[0].zeilen.map((z) => [z.dienst, z.posten, z.soll, z.ist, z.status]))
      .toEqual([["F", "po1", 2, 2, "ok"], ["N", "po2", 1, 1, "ok"]]);
  });
  it("eine Eingeteilte ohne bestätigte Erfassung → der Dienst ist „ungeklärt“, nie Plan, nie 0", () => {
    const m = betrieb(); m.erfassung[`b1|${TAG}`].bestaetigt = false;
    const s = sitzFuer(m, "leitung");
    expect(dienstzeitStand(m, s, TAG, "F")).toEqual({ personen: null, grund: G.NICHT_BESTAETIGT });
    delete m.erfassung[`b1|${TAG}`];
    expect(dienstzeitStand(m, s, TAG, "F")).toEqual({ personen: null, grund: G.KEINE_ERFASSUNG });
    const b = objektberichtDaten(m, { objektId: "o1", von: TAG, bis: TAG, zugriff: "voll", dienstzeit: objektberichtDienstzeit(m, s) });
    expect(b.tage[0].zeilen[0]).toMatchObject({ dienst: "F", ist: null, fehlt: null, status: "ungeklärt" });
    expect(b.tage[0].zeilen[1]).toMatchObject({ dienst: "N", ist: 1, status: "ok" });
  });
  it("bestätigte Zeit ohne Überschneidung mit dem Dienst → „ungeklärt“", () => {
    const m = betrieb(); m.erfassung[`a1|${TAG}`] = { start: "15:00", ende: "20:00", bestaetigt: true };
    expect(dienstzeitStand(m, sitzFuer(m, "leitung"), TAG, "F")).toEqual({ personen: null, grund: G.AUSSERHALB_DIENST });
  });
  it("Abwesende (krank) sind nicht eingeteilt; das Ergebnis nennt keine Abwesenheit", () => {
    const m = betrieb(), r = dienstzeitStand(m, sitzFuer(m, "leitung"), TAG, "F");
    expect(r.personen).not.toContain("k1");
    expect(JSON.stringify(r)).not.toMatch(/krank|Grippe|abwes/i);
  });
  it("unbekannter Dienst, ungültiger Tag → null mit Grund", () => {
    const m = betrieb(), s = sitzFuer(m, "leitung");
    expect(dienstzeitStand(m, s, TAG, "X").grund).toBe(G.DIENST_UNBEKANNT);
    expect(dienstzeitStand(m, s, "2026-13-01", "F").grund).toBe(G.TAG_UNGUELTIG);
  });
});

describe("Rollen (Rollenschutz der Ist-Zeiten, H8+)", () => {
  it("Berichtsquelle: nur Planung und Leitung; alle anderen Rollen immer null", () => {
    const m = betrieb();
    for (const rolle of ["leitung", "planer"]) expect(dienstzeitStand(m, sitzFuer(m, rolle), TAG, "F").personen).toEqual(["a1", "b1"]);
    for (const rolle of ["subplaner", "mitarbeiter", "betriebsrat", "kunde", "betreiber", "auftraggeber", "", null, undefined]) {
      const s = { rolle, mandant: m, person: m.personen[0] };
      expect(dienstzeitStand(m, s, TAG, "F")).toEqual({ personen: null, grund: G.KEIN_ZUGRIFF });
      expect(objektberichtDienstzeit(m, s)(TAG, "F")).toBeNull();
    }
    expect(dienstzeitStand(m, null, TAG, "F").grund).toBe(G.KEIN_ZUGRIFF);
  });
  it("anderer Betrieb: Sitzung in m2 bekommt für m1 keine Dienstzeit", () => {
    const m = betrieb(), m2 = { ...betrieb(), id: "m2" };
    expect(dienstzeitStand(m, { rolle: "leitung", mandant: m2 }, TAG, "F").grund).toBe(G.KEIN_ZUGRIFF);
    expect(dienstzeitStand(m, { rolle: "leitung" }, TAG, "F").grund).toBe(G.KEIN_ZUGRIFF);
    const ohneId = { ...betrieb() }; delete ohneId.id;
    expect(dienstzeitStand(ohneId, { rolle: "leitung", mandant: { ...ohneId } }, TAG, "F").grund).toBe(G.KEIN_ZUGRIFF);
  });
  it("modulKontext gibt die Quelle nur bei Berichtszugriff „voll“ weiter (vorher: jeder Rolle)", () => {
    const m = betrieb(), quelle = () => ["a1"];
    expect(modulKontext({ sitz: { rolle: "leitung", mandant: m }, kontext: { dienstzeit: quelle } }).dienstzeit).toBe(quelle);
    expect(modulKontext({ sitz: { rolle: "planer", mandant: m }, kontext: { dienstzeit: quelle } }).dienstzeit).toBe(quelle);
    for (const rolle of ["subplaner", "mitarbeiter", "betriebsrat", "kunde", "betreiber"])
      expect(modulKontext({ sitz: { rolle, mandant: m }, kontext: { dienstzeit: quelle } }).dienstzeit(TAG, "F")).toBeNull();
  });
  it("der Kern (kern.jsx) gibt den Ansichten die Quelle aus der bestätigten Ist-Zeit, durch modulKontext", () => {
    const kern = readFileSync(new URL("../src/module/kern.jsx", import.meta.url), "utf8");
    expect(kern).toMatch(/import \{ objektberichtDienstzeit \} from "\.\/dienstzeit\.js";/);
    expect(kern).toMatch(/modulKontext\(\{ sitz, kontext: \{ \.\.\.\(kontext \|\| \{\}\), dienstzeit: objektberichtDienstzeit\(m, sitz\) \} \}\)/);
  });
  it("Serversicht Planung/Leitung: alle bestätigten Zeiten", () => {
    for (const [rolle, pid] of [["leitung", "l1"], ["planer", "pl"]]) {
      const m = sicht(betrieb(), rolle, pid);
      expect(bestaetigteDienstzeit(m, "a1", TAG).dienstzeit).toMatchObject({ von: "06:02", bis: "14:07" });
      expect(bestaetigteDienstzeit(m, "n1", TAG).dienstzeit).toMatchObject({ endeTag: "2026-11-03" });
    }
  });
  it("Serversicht Beschäftigte: nur die eigene; fremde „nicht verfügbar“, nie Plan", () => {
    const m = sicht(betrieb(), "mitarbeiter", "a1");
    expect(bestaetigteDienstzeit(m, "a1", TAG).dienstzeit).toMatchObject({ von: "06:02" });
    expect(bestaetigteDienstzeit(m, "b1", TAG)).toEqual({ dienstzeit: null, grund: G.IST_NICHT_VERFUEGBAR });
    expect(bestaetigteDienstzeit(m, "n1", TAG).grund).toBe(G.IST_NICHT_VERFUEGBAR);
  });
  it("Serversicht Betriebsrat: keine, auch nicht die eigene", () => {
    const b = betrieb(); b.abweichungen[`br|${TAG}`] = "F"; b.erfassung[`br|${TAG}`] = { start: "06:00", ende: "14:00", bestaetigt: true };
    const m = sicht(b, "betriebsrat", "br");
    for (const pid of ["a1", "b1", "n1", "br"]) expect(bestaetigteDienstzeit(m, pid, TAG).dienstzeit).toBeNull();
  });
  it("Serversicht Schichtverantwortung: sie selbst und der eigene Bereich, nicht der fremde Bereich", () => {
    const tag = tagePlus(heuteBerlin(), -1);
    const b = betrieb(tag); b.abweichungen[`s1|${tag}`] = "F"; b.erfassung[`s1|${tag}`] = { start: "06:00", ende: "14:00", bestaetigt: true };
    const m = sicht(b, "subplaner", "s1");
    expect(bestaetigteDienstzeit(m, "s1", tag).dienstzeit).toMatchObject({ von: "06:00" });
    expect(bestaetigteDienstzeit(m, "a1", tag).dienstzeit).toMatchObject({ von: "06:02" });
    const n = bestaetigteDienstzeit(m, "n1", tag);
    expect(n.dienstzeit).toBeNull();
    expect([G.IST_NICHT_VERFUEGBAR, G.PERSON_UNBEKANNT]).toContain(n.grund);
    /* Die Berichtsquelle bleibt für die Schichtverantwortung zu (R-5: „Vorschlag: nein“). */
    expect(dienstzeitStand(m, { rolle: "subplaner", mandant: m }, tag, "F").grund).toBe(G.KEIN_ZUGRIFF);
  });
});

describe("Modul bleibt „geplant“, keine Wirkung, Schreiben zu", () => {
  it("Registry unverändert: objektbericht geplant, ohne Datenfelder; Registry stimmig", () => {
    expect(modulVon("objektbericht")).toMatchObject({ status: "geplant", abhaengigVon: ["posten"], datenfelder: [] });
    expect(pruefeModulRegistry()).toEqual([]);
    expect(BRANCHENMODULE.length).toBe(12);
  });
  it("auch eingeschaltet erscheint keine Oberfläche des Objektberichts (geplant wirkt nicht)", () => {
    const m = betrieb(TAG, { einstellungen: { branchenmodule: { posten: { an: true }, objektbericht: { an: true } } } });
    const ids = oberflaechenFuer(m, "betrieb", { darf: () => true }).map((x) => x.eintrag.modul);
    expect(ids).not.toContain("objektbericht");
  });
});
