/* ==========================================================================
   WP-I7 — PLANVORSCHLAG: KONTROLLIERTE ÜBERNAHME, KERN (server/lib/engine/planer-uebernahme.mjs, Stufe 1)

   Reine Logik ohne Route und Oberfläche. Geprüft (nur synthetische Daten, Uhr fest, kein KI-Anteil):
   1. Basis-Fingerprint: stabil, nur der Hash, ändert sich mit Einteilung/Anheftung/Abwesenheit/Vorgabe/Schalter, nicht mit Protokoll.
   2. Rolle/Recht: nur Leitung/Planung (plan.edit.all), nie SV, BR, Beschäftigte, Kunde, Demo — Prüfen, Anwenden, Rückgängig.
   3. Planer-Freigabe: PLANER_AN AUS, Pause (auch unlesbar), Hauptschalter/Planer-Schalter aus oder unlesbar, Modus aus; automatisch
      ändert nichts an der Pflicht zur Bestätigung.
   4. Fingerprint-Abweichung, Eingaben (leer, doppelt, fremd, Monatsgrenze, Schaltjahr).
   5. Je Eintrag auf dem echten Stand (belegt, angeheftet, abwesend, harte Regel, keine Lücke, Dienst/Person unbekannt, nicht im Betrieb),
      atomar; Nachprüfung (Vorwärts).
   6. Anwenden: nur gezielte Schlüssel, Teil-Auswahl, Idempotenz, Protokoll ohne Person|Tag/Namen, Änderungseinträge, gleiche Zeitstempel.
   7. Rückgängig: genau die Vorwerte, zwischenzeitliche Änderung oder Anheftung lehnt ab, zweimal = bereits.
   8. Eingaben eingefroren, wirft nie, Quelltext-Leitplanken.

   Aufruf: npx vitest run pruefungen/intelligence-planer-uebernahme.test.js
   ========================================================================== */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { readFileSync } from "node:fs";
import { baueLeerenBetrieb } from "../server/lib/leerbetrieb.mjs";
import * as PL from "../server/lib/engine/planer.mjs";
import { PLANER_AGGREGATE_AN } from "../server/lib/engine/planeraggregate.mjs";
import { mitTagesdatum } from "../server/lib/engine/zeit.mjs";
import { vorschlagBasis, uebernahmePruefen, uebernahmeAnwenden, rueckgaengigPruefen, rueckgaengigAnwenden, patchAnwenden, darfUebernehmen,
  UEBERNAHME_PROTOKOLL } from "../server/lib/engine/planer-uebernahme.mjs";

const T0 = "2026-11-27T10:00:00.000Z";
const HEUTE = "2026-11-27";
const YM = "2026-12";
const st = { am: T0, vonRolle: "leitung" };
const FREI = Object.freeze({ betrieb: { an: true, ...st }, betriebsratFrage: { antwort: "nein", ...st }, planerSchalter: { an: true, ...st } });
const LEIT = Object.freeze({ rolle: "leitung", jetzt: T0, freigabe: true, bestaetigt: true });
const PLAN = Object.freeze({ rolle: "planer", jetzt: T0, freigabe: true, bestaetigt: true });

beforeAll(() => { vi.useFakeTimers({ now: new Date("2031-05-05T12:00:00Z"), toFake: ["Date"] }); });   // Uhr bewusst weit weg: Zeit nur aus dem Kontext
afterAll(() => { vi.useRealTimers(); });

/** Kleiner Betrieb: leerer Betrieb HE, vier Personen, Frühdienst je Tag eine Person, Planer im Betrieb freigeschaltet (Knopfdruck). */
const klein = (steuerung = FREI) => {
  const m = baueLeerenBetrieb({ name: "T", branche: "pflege", email: "x@example.org", land: "HE", raum: "r" }).mandanten[0];
  m.personen = [1, 2, 3, 4].map((i) => ({ id: `p${i}`, vorname: "Vorname", nachname: `Zuname${i}`, eintritt: "2020-01-01", zugehoerigkeit: [{ einheitId: m.einheiten[0].id, ab: "2020-01-01" }], wochenstunden: 40, status: "aktiv", qualifikationen: [] }));
  m.dienstarten = m.dienstarten.map((d) => (d.id === "F" ? { ...d, mindest: { mo_do: 1, fr: 1, sa: 1, so: 1 } } : d));
  m.einstellungen = { ...m.einstellungen, kiSteuerung: structuredClone(steuerung) };
  return m;
};
/** Vorschlag des Planers (Knopfdruck) mit gespeicherter Basis. */
const vorschlagFuer = (m, ym = YM) => {
  const r = mitTagesdatum(HEUTE, () => PL.planerEinstieg(m, ym, { freigabe: true, knopf: true, zuege: 0, maxProPerson: 8, heute: HEUTE }));
  expect(r.status, r.grund).toBe("ok");
  expect(r.gesetzt.length).toBeGreaterThan(0);
  return { ...r, basis: vorschlagBasis(m, ym) };
};
/** Vorschlag mit eigener Auswahl (Gegenprobe der Prüfung je Eintrag: die Basis passt, der Eintrag nicht). */
const fremd = (m, gesetzt, ym = YM) => ({ status: "ok", ym, gesetzt, offen: [], basis: vorschlagBasis(m, ym) });
const tief = (o) => { if (o && typeof o === "object" && !Object.isFrozen(o)) { Object.freeze(o); for (const v of Object.values(o)) tief(v); } return o; };

describe("1. Basis-Fingerprint", () => {
  it("stabil (Schlüsselreihenfolge egal), nur der Hash, ohne Namen; null bei unlesbarer Eingabe", () => {
    const m = klein();
    const b = vorschlagBasis(m, YM);
    expect(b).toMatch(/^sha256:[0-9a-f]{64}$/);
    const umgedreht = { ...Object.fromEntries(Object.entries(m).reverse()), einstellungen: Object.fromEntries(Object.entries(m.einstellungen).reverse()) };
    expect(vorschlagBasis(umgedreht, YM)).toBe(b);
    expect(vorschlagBasis(structuredClone(m), YM)).toBe(b);
    expect(b).not.toContain("Zuname");
    for (const [x, ym] of [[null, YM], ["x", YM], [m, "2026-13"], [m, "26-12"], [m, null]]) expect(vorschlagBasis(x, ym)).toBe(null);
    expect(vorschlagBasis(m, "2027-01")).not.toBe(b);
  });
  it("ändert sich mit Einteilung (Monat und Fenster ± 31 Tage), Anheftung, Abwesenheit, Vorgabe, Schalter, Person; nicht mit Modulprotokoll, Mitteilungen oder fernen Tagen", () => {
    const m = klein();
    const b = vorschlagBasis(m, YM);
    const mit = (f) => { const x = structuredClone(m); f(x); return vorschlagBasis(x, YM); };
    const anders = {
      "Einteilung im Monat": (x) => { x.abweichungen["p1|2026-12-15"] = "S"; },
      "Einteilung im Fenster (Januar)": (x) => { x.abweichungen["p1|2027-01-10"] = "S"; },
      "Einteilung im Fenster (November)": (x) => { x.abweichungen["p1|2026-11-05"] = "S"; },
      "frei eingetragen": (x) => { x.abweichungen["p2|2026-12-03"] = "-"; },
      "Anheftung": (x) => { x.abweichungen["p1|2026-12-15"] = "-"; x.angeheftet = { "p1|2026-12-15": { am: T0, vonRolle: "leitung" } }; },
      "Anheftungen unlesbar": (x) => { x.angeheftet = "kaputt"; },
      "Abwesenheit": (x) => { x.abwesenheiten = [...x.abwesenheiten, { id: "a1", personId: "p2", art: "urlaub", von: "2026-12-20", bis: "2026-12-22" }]; },
      "Vorgabe": (x) => { x.vorgaben = [{ id: "v1", art: "x", staerke: "muss" }]; },
      "Planer-Schalter aus": (x) => { x.einstellungen.kiSteuerung.planerSchalter = { an: false, ...st }; },
      "Pause": (x) => { x.einstellungen.kiSteuerung.pause = { aktiv: true, ...st }; },
      "Mindestbesetzung": (x) => { x.dienstarten[0] = { ...x.dienstarten[0], mindest: { mo_do: 2, fr: 2, sa: 2, so: 2 } }; },
      "Qualifikation einer Person": (x) => { x.personen[0].qualifikationen = ["q"]; },
      "maxFolge": (x) => { x.einstellungen.maxFolge = 5; },
    };
    for (const [n, f] of Object.entries(anders)) expect(mit(f), n).not.toBe(b);
    const gleich = {
      "Modulprotokoll": (x) => { x.einstellungen.modulprotokoll = [{ modul: "anheften", art: "anheften-gesetzt", am: T0, von: "leitung", anzahl: 1 }]; },
      "Mitteilungen": (x) => { x.nachrichten = [{ id: "n1" }]; },
      "Einteilung weit weg": (x) => { x.abweichungen["p1|2027-03-15"] = "S"; },
      "Abwesenheit weit weg": (x) => { x.abwesenheiten = [{ id: "a2", personId: "p2", art: "urlaub", von: "2027-04-01", bis: "2027-04-02" }]; },
    };
    for (const [n, f] of Object.entries(gleich)) expect(mit(f), n).toBe(b);
  });
});

describe("2. Rolle und Recht", () => {
  const ROT = { Schichtverantwortung: { rolle: "subplaner" }, Betriebsrat: { rolle: "betriebsrat" }, Beschaeftigte: { rolle: "mitarbeiter" }, Kunde: { rolle: "kunde" },
    "Demo Leitung": { rolle: "leitung", demo: true }, "Demo Planung": { rolle: "planer", demo: true }, Betreiber: { rolle: "betreiber" }, unbekannt: { rolle: "chef" }, ohne: {} };
  it("nur Leitung und Planung; alle anderen und Demo nie — Prüfen, Anwenden, Rückgängig prüfen und anwenden", () => {
    const m = klein();
    const v = vorschlagFuer(m);
    const ok = uebernahmeAnwenden(m, YM, v, v.gesetzt.slice(0, 2), LEIT);
    expect(ok.ok).toBe(true);
    expect(uebernahmePruefen(m, YM, v, v.gesetzt.slice(0, 2), PLAN).ok).toBe(true);
    const m2 = patchAnwenden(m, ok.patch);
    for (const [n, k] of Object.entries(ROT)) {
      const kontext = { ...k, jetzt: T0, freigabe: true, bestaetigt: true };
      expect(darfUebernehmen(kontext), n).toBe(false);
      expect(uebernahmePruefen(m, YM, v, v.gesetzt, kontext), n).toEqual({ ok: false, grund: "keine-berechtigung" });
      expect(uebernahmeAnwenden(m, YM, v, v.gesetzt, kontext), n).toEqual({ ok: false, grund: "keine-berechtigung" });
      expect(rueckgaengigPruefen(m2, YM, ok.rueckgaengig, kontext), n).toEqual({ ok: false, grund: "keine-berechtigung" });
      expect(rueckgaengigAnwenden(m2, YM, ok.rueckgaengig, kontext), n).toEqual({ ok: false, grund: "keine-berechtigung" });
    }
    for (const k of [null, undefined, "leitung", 5, { rolle: ["leitung"] }]) expect(uebernahmeAnwenden(m, YM, v, v.gesetzt, k).grund).toBe("keine-berechtigung");
  });
});

describe("3. Planer-Freigabe, Schalter, Pause, Modus, Bestätigung", () => {
  it("PLANER_AN und PLANER_AGGREGATE_AN bleiben AUS; ohne ausdrückliche Freigabe (genau true) wird nichts übernommen", () => {
    expect(PL.PLANER_AN).toBe(false);
    expect(PLANER_AGGREGATE_AN).toBe(false);
    const m = klein();
    const v = vorschlagFuer(m);
    for (const f of [undefined, false, "ja", 1]) {
      const k = { ...LEIT, freigabe: f };
      expect(uebernahmePruefen(m, YM, v, v.gesetzt, k).grund, String(f)).toBe("planer-nicht-freigegeben");
      expect(uebernahmeAnwenden(m, YM, v, v.gesetzt, k).grund, String(f)).toBe("planer-nicht-freigegeben");
    }
  });
  it("Pause (gestempelt, ungestempelt), unlesbare Steuerung, Hauptschalter/Frage/Planer-Schalter aus oder unlesbar, Modus aus: ehrliche Kennung, nichts übernommen", () => {
    const m0 = klein();
    const v = vorschlagFuer(m0);
    const fall = (k) => { const m = { ...m0, einstellungen: { ...m0.einstellungen, kiSteuerung: k } }; return uebernahmeAnwenden(m, YM, { ...v, basis: vorschlagBasis(m, YM) }, v.gesetzt, LEIT); };
    const ohne = (f) => { const k = structuredClone(FREI); delete k[f]; return k; };
    const erwartet = [
      ["Pause gestempelt", { ...structuredClone(FREI), pause: { aktiv: true, ...st } }, "planer-pausiert"],
      ["Pause ungestempelt (unlesbar)", { ...structuredClone(FREI), pause: { aktiv: true } }, "planer-pausiert"],
      ["Steuerung kein Objekt", "kaputt", "planer-pausiert"], ["Steuerung Liste", [], "planer-pausiert"], ["Steuerung null", null, "planer-pausiert"],
      ["Hauptschalter fehlt", ohne("betrieb"), "planer-im-betrieb-aus"], ["Frage offen", ohne("betriebsratFrage"), "planer-im-betrieb-aus"],
      ["Planer-Schalter fehlt", ohne("planerSchalter"), "planer-im-betrieb-aus"], ["Planer-Schalter aus", { ...structuredClone(FREI), planerSchalter: { an: false, ...st } }, "planer-im-betrieb-aus"],
      ["Planer-Schalter ungestempelt", { ...structuredClone(FREI), planerSchalter: { an: true } }, "planer-im-betrieb-aus"],
      ["Planer-Schalter Text", { ...structuredClone(FREI), planerSchalter: { an: "true", ...st } }, "planer-im-betrieb-aus"],
      ["Modus aus", { ...structuredClone(FREI), planerModus: { modus: "aus", ...st } }, "planer-im-betrieb-aus"],
      ["Modus unbekannt", { ...structuredClone(FREI), planerModus: { modus: "immer", ...st } }, "planer-im-betrieb-aus"],
    ];
    for (const [n, k, g] of erwartet) expect(fall(k), n).toEqual({ ok: false, grund: g });
  });
  it("keine Auto-Übernahme: auch im Modus automatisch nur mit bestaetigt === true", () => {
    const m = klein({ ...structuredClone(FREI), planerModus: { modus: "automatisch", ...st } });
    const v = vorschlagFuer(m);
    for (const b of [undefined, false, "true", 1]) expect(uebernahmeAnwenden(m, YM, v, v.gesetzt, { ...LEIT, bestaetigt: b }), String(b)).toEqual({ ok: false, grund: "bestaetigung-fehlt" });
    expect(uebernahmeAnwenden(m, YM, v, v.gesetzt, LEIT).ok).toBe(true);
    /* Prüfen allein ist keine Übernahme (für die Vorschau) und braucht die Bestätigung nicht. */
    expect(uebernahmePruefen(m, YM, v, v.gesetzt, { ...LEIT, bestaetigt: false }).ok).toBe(true);
  });
});

describe("4. Fingerprint-Abweichung und Eingaben", () => {
  it("seit dem Vorschlag geändert (Einteilung, Anheftung, Abwesenheit, Vorgabe): nichts übernommen", () => {
    const m = klein();
    const v = vorschlagFuer(m);
    const aus = (f) => { const x = structuredClone(m); f(x); return uebernahmeAnwenden(x, YM, v, v.gesetzt, LEIT); };
    expect(aus((x) => { x.abweichungen["p1|2026-12-30"] = "S"; })).toEqual({ ok: false, grund: "seit-vorschlag-geaendert" });
    expect(aus((x) => { x.abweichungen["p2|2026-12-29"] = "-"; x.angeheftet = { "p2|2026-12-29": { am: T0, vonRolle: "leitung" } }; })).toEqual({ ok: false, grund: "seit-vorschlag-geaendert" });
    expect(aus((x) => { x.abwesenheiten = [{ id: "a1", personId: "p4", art: "krank", von: "2026-12-28", bis: "2026-12-28" }]; })).toEqual({ ok: false, grund: "seit-vorschlag-geaendert" });
    expect(aus((x) => { x.vorgaben = [{ id: "v1", staerke: "muss" }]; })).toEqual({ ok: false, grund: "seit-vorschlag-geaendert" });
    expect(uebernahmeAnwenden(m, YM, { ...v, basis: undefined }, v.gesetzt, LEIT).grund).toBe("vorschlag-ohne-basis");
    expect(uebernahmeAnwenden(m, YM, { ...v, basis: "sha256:00" }, v.gesetzt, LEIT).grund).toBe("seit-vorschlag-geaendert");
  });
  it("leere, doppelte, fremde, monatsfremde und ungültige Auswahl; Vorschlag anderen Monats oder nicht ok", () => {
    const m = klein();
    const v = vorschlagFuer(m);
    const g = v.gesetzt[0];
    const fall = (auswahl, vx = v) => uebernahmeAnwenden(m, YM, vx, auswahl, LEIT).grund;
    expect(fall([])).toBe("auswahl-leer");
    expect(fall(null)).toBe("auswahl-ungueltig");
    expect(fall([g, { ...g }])).toBe("auswahl-doppelt");
    expect(fall([{ ...g, dienstId: "S" }])).toBe("auswahl-nicht-im-vorschlag");
    expect(fall([{ ...g, datum: "2027-01-01" }]), "Monatswechsel").toBe("auswahl-ungueltig");
    expect(fall([{ ...g, datum: "2026-12-32" }])).toBe("auswahl-ungueltig");
    expect(fall([{ ...g, personId: "a|b" }])).toBe("auswahl-ungueltig");
    expect(fall([g], { ...v, ym: "2027-01" })).toBe("vorschlag-ungueltig");
    expect(fall([g], { ...v, status: "aus" })).toBe("vorschlag-ungueltig");
    expect(fall([g], "kaputt")).toBe("vorschlag-ungueltig");
    expect(uebernahmeAnwenden(m, "2026-13", v, [g], LEIT).grund).toBe("monat-ungueltig");
    expect(uebernahmeAnwenden(m, YM, v, [g], { ...LEIT, jetzt: "gestern" }).grund).toBe("zeit-ungueltig");
    expect(uebernahmeAnwenden(m, YM, v, [g], { ...LEIT, jetzt: undefined }).grund).toBe("zeit-ungueltig");
  });
});

describe("5. Je Eintrag auf dem echten aktuellen Stand, atomar", () => {
  /** Stand mit vorbereiteten Hindernissen; die Basis passt (Vorschlag „frisch“), die Einträge nicht. */
  const hindernisse = () => {
    const m = klein();
    m.abweichungen["p1|2026-12-10"] = "S";                                  // belegt
    m.abweichungen["p3|2026-12-12"] = "-";                                  // angeheftet (frei bleibt frei)
    m.angeheftet = { "p3|2026-12-12": { am: T0, vonRolle: "leitung" } };
    m.abwesenheiten = [{ id: "a1", personId: "p2", art: "urlaub", von: "2026-12-11", bis: "2026-12-12" }];
    m.abweichungen["p4|2026-12-14"] = "N";                                  // Nachtdienst, danach Frühdienst: Ruhezeit
    m.abweichungen["p2|2026-12-20"] = "F";                                  // Frühdienst am 20. besetzt
    m.personen.push({ id: "p5", vorname: "Vorname", nachname: "Zuname5", eintritt: "2020-01-01", austritt: "2026-11-30", zugehoerigkeit: [{ einheitId: m.einheiten[0].id, ab: "2020-01-01" }], wochenstunden: 40, status: "aktiv", qualifikationen: [] });
    return m;
  };
  const GUT = { personId: "p1", datum: "2026-12-02", dienstId: "F" };
  it("je Hindernis die Kennung; ein einziger Fehler lehnt alles ab, nur Indizes und Kennungen", () => {
    const m = hindernisse();
    const faelle = [
      [{ personId: "p1", datum: "2026-12-10", dienstId: "F" }, "schluessel-belegt"],
      [{ personId: "p3", datum: "2026-12-12", dienstId: "F" }, "angeheftet"],
      [{ personId: "p2", datum: "2026-12-11", dienstId: "F" }, "abwesend"],
      [{ personId: "p4", datum: "2026-12-15", dienstId: "F" }, "regel"],
      [{ personId: "p3", datum: "2026-12-20", dienstId: "F" }, "keine-luecke"],
      [{ personId: "p1", datum: "2026-12-03", dienstId: "X" }, "dienst-unbekannt"],
      [{ personId: "p9", datum: "2026-12-03", dienstId: "F" }, "person-unbekannt"],
      [{ personId: "p5", datum: "2026-12-03", dienstId: "F" }, "nicht-im-dienst"],
    ];
    expect(uebernahmeAnwenden(m, YM, fremd(m, [GUT]), [GUT], LEIT).ok, "Gegenprobe: der gute Eintrag allein geht").toBe(true);
    for (const [e, grund] of faelle) {
      const r = uebernahmeAnwenden(m, YM, fremd(m, [GUT, e]), [GUT, e], LEIT);
      expect(r.ok, grund).toBe(false);
      expect(r.grund, grund).toBe("eintrag-abgelehnt");
      expect(r.abgelehnt.map((x) => [x.index, x.grund]), grund).toEqual([[1, grund]]);
      expect(r).not.toHaveProperty("patch");
      expect(JSON.stringify(r), grund).not.toMatch(/p\d\|/);
    }
    const regel = uebernahmePruefen(m, YM, fremd(m, [faelle[3][0]]), [faelle[3][0]], LEIT);
    expect(regel.abgelehnt[0].regeln.some((x) => /ruhezeit/i.test(x)), JSON.stringify(regel)).toBe(true);
    /* Alle zugleich: jeder einzeln benannt. */
    const alle = faelle.map(([e]) => e);
    const r = uebernahmePruefen(m, YM, fremd(m, alle), alle, LEIT);
    expect(r.abgelehnt.map((x) => x.grund)).toEqual(faelle.map(([, g]) => g));
  });
  it("unlesbare Anheftungen: nichts übernommen", () => {
    const m = klein();
    m.angeheftet = { kaputt: true };
    expect(uebernahmeAnwenden(m, YM, fremd(m, [GUT]), [GUT], LEIT)).toEqual({ ok: false, grund: "anheftungen-unlesbar" });
  });
  it("Nachprüfung über die ganze Auswahl: Vorwärts (Dienste in Folge an späteren Tagen) lehnt ab, obwohl der Tag selbst besteht", () => {
    const m = klein();
    for (let i = 3; i <= 8; i++) m.abweichungen[`p1|2026-12-0${i}`] = "F";   // sechs Frühdienste ab dem 3.; maxFolge 6
    const e = { personId: "p1", datum: "2026-12-02", dienstId: "F" };
    const r = uebernahmeAnwenden(m, YM, fremd(m, [e]), [e], LEIT);
    expect(r).toEqual({ ok: false, grund: "nachpruefung-nicht-bestanden", abgelehnt: [] });
  });
});

describe("6. Anwenden: Patch, Teil-Auswahl, Idempotenz, Protokoll, Änderungen", () => {
  it("Teil-Auswahl: der Patch enthält genau die gewählten Schlüssel; übrige Einteilungen, Anheftungen und Abwesenheiten bleiben", () => {
    const m = klein();
    m.abweichungen["p1|2027-02-01"] = "S";
    m.abweichungen["p2|2026-12-31"] = "-";
    const v = vorschlagFuer(m);
    const auswahl = [v.gesetzt[0], v.gesetzt[2]];
    const r = uebernahmeAnwenden(m, YM, v, auswahl, PLAN);
    expect(r.ok).toBe(true);
    expect(r.patch).toEqual({ abweichungen: Object.fromEntries(auswahl.map((g) => [`${g.personId}|${g.datum}`, g.dienstId])) });
    expect(Object.keys(r)).toEqual(["ok", "patch", "rueckgaengig", "protokoll", "aenderungen", "mitteilungen"]);
    const m2 = patchAnwenden(m, r.patch);
    const erwartet = { ...m.abweichungen }; for (const g of auswahl) erwartet[`${g.personId}|${g.datum}`] = g.dienstId;
    expect(m2.abweichungen).toEqual(erwartet);
    expect(m2.abweichungen["p1|2027-02-01"]).toBe("S");
    expect({ ...m2, abweichungen: m.abweichungen }).toEqual(m);
    /* Nicht gewählte Vorschläge sind nicht übernommen. */
    for (const g of v.gesetzt.filter((x) => !auswahl.includes(x))) expect(m2.abweichungen[`${g.personId}|${g.datum}`]).toBeUndefined();
  });
  it("Idempotenz: dieselbe Übernahme zweimal = bereits übernommen; überlappend = Abweichung; nie doppelt", () => {
    const m = klein();
    const v = vorschlagFuer(m);
    const r = uebernahmeAnwenden(m, YM, v, v.gesetzt.slice(0, 3), LEIT);
    const m2 = patchAnwenden(m, r.patch);
    expect(uebernahmeAnwenden(m2, YM, v, v.gesetzt.slice(0, 3), LEIT)).toEqual({ ok: false, grund: "bereits-uebernommen" });
    expect(uebernahmeAnwenden(m2, YM, v, v.gesetzt.slice(0, 1), LEIT)).toEqual({ ok: false, grund: "bereits-uebernommen" });
    expect(uebernahmeAnwenden(m2, YM, v, v.gesetzt.slice(2, 5), LEIT)).toEqual({ ok: false, grund: "seit-vorschlag-geaendert" });
    expect(uebernahmeAnwenden(m2, YM, v, v.gesetzt.slice(3, 5), LEIT), "auch der Rest des alten Vorschlags nicht").toEqual({ ok: false, grund: "seit-vorschlag-geaendert" });
  });
  it("Protokoll: Art, Anzahl, Zeitraum, Rolle, Zeit — kein Person|Tag, keine Kennung, kein Name; Mitteilungen nur als Hinweis", () => {
    const m0 = klein();
    const v = vorschlagFuer(m0);
    /* Planfreigabe des Monats (nach dem Vorschlag; gehört nicht zur Basis): nur der Hinweis ändert sich. */
    const m = { ...m0, freigaben: { [YM]: { am: T0 } } };
    const r = uebernahmeAnwenden(m, YM, v, v.gesetzt, LEIT);
    expect(r.ok).toBe(true);
    const tage = v.gesetzt.map((g) => g.datum).sort();
    expect(r.protokoll).toEqual({ modul: "planer", art: UEBERNAHME_PROTOKOLL.uebernommen, am: T0, von: "leitung", anzahl: v.gesetzt.length, zeitraum: { von: tage[0], bis: tage[tage.length - 1] } });
    expect(r.protokoll.art).toBe("planer-uebernommen");
    const text = JSON.stringify(r.protokoll) + JSON.stringify(r.mitteilungen);
    for (const p of m.personen) { expect(text).not.toContain(p.nachname); expect(text).not.toContain(`"${p.id}`); }
    expect(text).not.toMatch(/\|/);
    expect(r.mitteilungen).toEqual({ versandt: false, planFreigegeben: true, betroffenePersonen: new Set(v.gesetzt.map((g) => g.personId)).size });
    expect(uebernahmeAnwenden(klein(), YM, vorschlagFuer(klein()), vorschlagFuer(klein()).gesetzt, LEIT).mitteilungen.planFreigegeben).toBe(false);
  });
  it("Änderungseinträge wie uebernehmeVorschlag (von „-“, nach, Vorlauf, Zeit de-DE) mit stabiler Kennung; gleiche Zeitstempel kollidieren nicht", () => {
    const m = klein();
    const v = vorschlagFuer(m);
    const r = uebernahmeAnwenden(m, YM, v, v.gesetzt.slice(0, 2), LEIT);
    const g = v.gesetzt[0];
    expect(r.aenderungen[0]).toMatchObject({ personId: g.personId, datum: g.datum, von: "-", nach: g.dienstId, quelle: "planer",
      zeit: new Date(T0).toLocaleString("de-DE", { timeZone: "Europe/Berlin" }), vorlauf: Math.round((Date.parse(`${g.datum}T00:00:00Z`) - Date.parse(`${HEUTE}T00:00:00Z`)) / 864e5) });
    expect(r.aenderungen[0].id).toMatch(/^c-pu-[0-9a-f]{16}$/);
    /* deterministisch: gleiche Eingabe, gleiches Ergebnis */
    expect(uebernahmeAnwenden(m, YM, v, v.gesetzt.slice(0, 2), LEIT)).toEqual(r);
    /* andere Auswahl mit derselben Zeit: andere Kennungen */
    const r2 = uebernahmeAnwenden(m, YM, v, v.gesetzt.slice(2, 4), LEIT);
    const ids = [...r.aenderungen, ...r2.aenderungen].map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("Jahreswechsel und Schaltjahr: 31.12. mit Januar im Fenster; 29.2.2028 übernehmbar, 29.2.2027 ungültig", () => {
    const m = klein();
    const v = vorschlagFuer(m);
    const silvester = v.gesetzt.filter((g) => g.datum === "2026-12-31");
    expect(silvester.length).toBe(1);
    const r = uebernahmeAnwenden(m, YM, v, silvester, LEIT);
    expect(r.ok).toBe(true);
    expect(r.aenderungen[0].vorlauf).toBe(34);
    expect(r.protokoll.zeitraum).toEqual({ von: "2026-12-31", bis: "2026-12-31" });
    const s = klein();
    const v28 = vorschlagFuer(s, "2028-02");
    const schalt = v28.gesetzt.filter((g) => g.datum === "2028-02-29");
    expect(schalt.length).toBe(1);
    const r28 = uebernahmeAnwenden(s, "2028-02", v28, schalt, LEIT);
    expect(r28.ok).toBe(true);
    expect(Object.keys(r28.patch.abweichungen)).toEqual([`${schalt[0].personId}|2028-02-29`]);
    const v27 = { ...fremd(s, [{ ...schalt[0], datum: "2027-02-29" }], "2027-02") };
    expect(uebernahmeAnwenden(s, "2027-02", v27, [{ ...schalt[0], datum: "2027-02-29" }], LEIT).grund).toBe("auswahl-ungueltig");
  });
});

describe("7. Rückgängig", () => {
  /** Ein Tag mit „frei“ im Bestand, den der Planer füllt: der Vorwert ist „-“. */
  const ausgangslage = () => {
    const m = klein();
    m.abweichungen["p1|2026-12-01"] = "-";
    m.abweichungen["p2|2026-12-01"] = "-";
    m.abweichungen["p4|2026-12-01"] = "-";
    const v = vorschlagFuer(m);
    const r = uebernahmeAnwenden(m, YM, v, v.gesetzt.slice(0, 4), LEIT);
    expect(r.ok).toBe(true);
    return { m, v, r, m2: patchAnwenden(m, r.patch) };
  };
  it("stellt genau die Vorwerte wieder her (auch „-“ und fehlende Schlüssel); zweites Mal = bereits", () => {
    const { m, r, m2 } = ausgangslage();
    expect(r.rueckgaengig.eintraege.some((e) => e.vorher === "-") || r.rueckgaengig.eintraege.some((e) => e.vorher === null)).toBe(true);
    expect(rueckgaengigAnwenden(m2, YM, r.rueckgaengig, { ...LEIT, bestaetigt: false })).toEqual({ ok: false, grund: "bestaetigung-fehlt" });
    const u = rueckgaengigAnwenden(m2, YM, r.rueckgaengig, PLAN);
    expect(u.ok).toBe(true);
    expect(Object.keys(u.patch.abweichungen).sort()).toEqual(Object.keys(r.patch.abweichungen).sort());
    const m3 = patchAnwenden(m2, u.patch);
    expect(m3.abweichungen).toEqual(m.abweichungen);
    expect(u.protokoll).toMatchObject({ modul: "planer", art: "planer-rueckgaengig", anzahl: 4, von: "planer", am: T0 });
    expect(JSON.stringify(u.protokoll)).not.toMatch(/\||Zuname/);
    expect(u.aenderungen.every((a) => a.quelle === "planer-rueckgaengig" && a.von !== undefined && a.nach !== undefined)).toBe(true);
    expect(rueckgaengigAnwenden(m3, YM, r.rueckgaengig, PLAN)).toEqual({ ok: false, grund: "bereits-rueckgaengig" });
  });
  it("zwischenzeitlich geändert oder angeheftet: ganze Rücknahme abgelehnt, nichts gelöst", () => {
    const { r, m2 } = ausgangslage();
    const k0 = r.rueckgaengig.eintraege[1].schluessel;
    const geaendert = { ...m2, abweichungen: { ...m2.abweichungen, [k0]: "S" } };
    expect(rueckgaengigAnwenden(geaendert, YM, r.rueckgaengig, LEIT)).toEqual({ ok: false, grund: "eintrag-abgelehnt", abgelehnt: [{ index: 1, grund: "seit-uebernahme-geaendert" }] });
    const entfernt = { ...m2, abweichungen: { ...m2.abweichungen } }; delete entfernt.abweichungen[k0];
    expect(rueckgaengigAnwenden(entfernt, YM, r.rueckgaengig, LEIT).abgelehnt).toEqual([{ index: 1, grund: "seit-uebernahme-geaendert" }]);
    const angeheftet = { ...m2, angeheftet: { [k0]: { am: T0, vonRolle: "leitung" } } };
    expect(rueckgaengigAnwenden(angeheftet, YM, r.rueckgaengig, LEIT)).toEqual({ ok: false, grund: "eintrag-abgelehnt", abgelehnt: [{ index: 1, grund: "angeheftet" }] });
    expect(rueckgaengigAnwenden({ ...m2, angeheftet: [] }, YM, r.rueckgaengig, LEIT).grund).toBe("anheftungen-unlesbar");
  });
  it("ungültige Rückgängig-Daten: abgelehnt", () => {
    const { r, m2 } = ausgangslage();
    const rg = r.rueckgaengig;
    for (const x of [null, "x", { ...rg, ym: "2027-01" }, { ...rg, art: "anders" }, { ...rg, eintraege: [] },
      { ...rg, eintraege: [{ ...rg.eintraege[0], schluessel: "p1|2027-01-01" }] }, { ...rg, eintraege: [rg.eintraege[0], rg.eintraege[0]] },
      { ...rg, eintraege: [{ ...rg.eintraege[0], nachher: { x: 1 } }] }, { ...rg, eintraege: [{ ...rg.eintraege[0], vorher: { x: 1 } }] }])
      expect(rueckgaengigAnwenden(m2, YM, x, LEIT).grund, JSON.stringify(x)).toBe("rueckgaengig-ungueltig");
  });
});

describe("8. Eingefroren, wirft nie, Leitplanken im Quelltext", () => {
  it("tief eingefrorene Eingaben: Prüfen, Anwenden, Rückgängig laufen und verändern nichts", () => {
    const m = klein();
    const v = vorschlagFuer(m);
    const vorher = structuredClone(m);
    tief(m); tief(v);
    const auswahl = tief(v.gesetzt.slice(0, 3));
    const k = tief({ ...LEIT });
    expect(uebernahmePruefen(m, YM, v, auswahl, k).ok).toBe(true);
    const r = uebernahmeAnwenden(m, YM, v, auswahl, k);
    expect(r.ok).toBe(true);
    tief(r);
    const m2 = tief(patchAnwenden(m, r.patch));
    expect(rueckgaengigAnwenden(m2, YM, r.rueckgaengig, k).ok).toBe(true);
    expect(m).toEqual(vorher);
  });
  it("wirft nie: unsinnige Eingaben und eine werfende Eingabe ergeben ok: false", () => {
    const m = klein();
    const v = vorschlagFuer(m);
    const boese = new Proxy({}, { get() { throw new Error("boese"); }, ownKeys() { throw new Error("boese"); } });
    for (const args of [[null, YM, v, v.gesetzt, LEIT], [m, YM, null, null, LEIT], [boese, YM, v, v.gesetzt, LEIT], [m, YM, boese, v.gesetzt, LEIT], [m, YM, v, boese, LEIT], [m, YM, v, [boese], LEIT]]) {
      expect(() => uebernahmeAnwenden(...args)).not.toThrow();
      expect(uebernahmeAnwenden(...args).ok).toBe(false);
      expect(uebernahmePruefen(...args).ok).toBe(false);
    }
    expect(rueckgaengigAnwenden(boese, YM, boese, LEIT).ok).toBe(false);
    expect(vorschlagBasis(boese, YM)).toBe(null);
  });
  it("Quelltext: kein Weg über anheftenZusammen, keine Uhr, kein Zufall, Schalter unverändert; nichts verdrahtet", () => {
    const q = readFileSync(new URL("../server/lib/engine/planer-uebernahme.mjs", import.meta.url), "utf8");
    const code = q.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    for (const x of ["anheftenZusammen", "Math.random", "Date.now", "new Date()", "PLANER_AN =", "zusammenfuehren"]) expect(code, x).not.toContain(x);
    expect(PL.PLANER_AN).toBe(false);
    for (const f of ["server/routes", "server/index.mjs", "src/App.jsx", "src/app/aktionen/assistenz.js", "server/lib/rechte.mjs"]) {
      let t = "";
      try { t = readFileSync(new URL(`../${f}`, import.meta.url), "utf8"); } catch { t = ""; }
      expect(t, f).not.toContain("planer-uebernahme");
    }
  });
});
