/* ==========================================================================
   Planer-Oberfläche, Stufe 2 (nur lesen): Verteilung der Nachtdienste im Monatsplan für Leitung und Planung

   Bestandsaufnahme: Der Planer (engine/planer.mjs) ist über keinen Weg der Oberfläche oder der API erreichbar (PLANER_AN = false,
   kein Handler); ein Planvorschlag wird also nicht geliefert. Lesbar ist dagegen die Verteilung des Plans, wie er jetzt ist:
   dieselben Funktionen wie im Planer (engine/verteilung.mjs), im Browser auf dem Betrieb gerechnet. Kein neues Serverfeld.

   1. Zustände: erfüllt / nicht erfüllt / nicht bewertbar; „nicht bewertbar“ nie als erfüllt (unbekannte Personen, Aufwand, Wunsch,
      unbekannter Status); Teilzeit nur bei teilzeitAnteilig === true; Werte aus der Engine, keine zweite Rechnung.
   2. Gründe: jede Kennung der Engine hat einen Text; unbekannter Grund nennt „Grund nicht bewertbar“.
   3. Rechte: nur Leitung und Planung sehen die Fläche; Schichtverantwortung, Beschäftigte, Betriebsrat, Betreiber nichts.
   4. Lesend: Betrieb unverändert; kein Schreibweg, keine Inline-Stile, keine rohen Bedienelemente; Planer-Schalter bleiben AUS.
   Aufruf: TZ=UTC npx vitest run pruefungen/intelligence-planer-verteilung-anzeige.test.js
   ========================================================================== */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PlanerVerteilung, PlanerVerteilungAnsicht, VERTEILUNG_TEXTE } from "../src/ansichten/planer-steuerung.jsx";
import { verteilungErgebnis, verteilungAnzeige, hatVerteilungsvorgabe, zahlDe, VERTEILUNG_VORGABE_GRUND, VERTEILUNG_PERSON_GRUND, planerRechte } from "../src/lib/planer-oberflaeche.js";
import { verteilungVorbereiten, verteilungBewerten, nachtZaehlen, VERTEILUNG_GRUENDE } from "../server/lib/engine/verteilung.mjs";
import { PLANER_AN } from "../server/lib/engine/planer.mjs";
import { PLANER_AGGREGATE_AN } from "../server/lib/engine/planeraggregate.mjs";
import { baueLeerenBetrieb } from "../server/lib/leerbetrieb.mjs";

/* Durchreichender Zähler: dieselbe Rechnung, aber die Aufrufe sind sichtbar (C-1: gerechnet wird erst nach dem Öffnen). */
vi.mock("../src/lib/planer-oberflaeche.js", async (original) => { const o = await original(); return { ...o, verteilungErgebnis: vi.fn(o.verteilungErgebnis) }; });

const wurzel = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lies = (r) => readFileSync(path.join(wurzel, r), "utf8");
const YM = "2026-12";
const TAGE = Array.from({ length: 31 }, (_, i) => `${YM}-${String(i + 1).padStart(2, "0")}`);

const VT = (extra = {}) => ({ id: "vt-1", name: "Nächte gleichmäßig", regelart: "verteilungsregel", parameter: { groesse: "nachtdienste", maxAbweichung: 1 },
  geltung: { art: "betrieb" }, staerke: "soll", prioritaet: 1, status: "aktiv", grundlage: { art: "hausregel" }, bezug: "monat", ...extra });
/** Betrieb mit n Personen und `naechte[i]` Nachtdiensten (Abweichungen) für Person i+1, ab dem 1. des Monats. */
const betrieb = (naechte, vorgaben = [VT()]) => {
  const m = baueLeerenBetrieb({ name: "T", branche: "pflege", email: "x@example.org", land: "HE", raum: "r" }).mandanten[0];
  m.personen = naechte.map((_, i) => ({ id: `p${i + 1}`, vorname: `Vor${i + 1}`, nachname: `Nach${i + 1}`, eintritt: "2020-01-01", rolle: "mitarbeiter",
    zugehoerigkeit: [{ einheitId: m.einheiten[0].id, ab: "2020-01-01" }], wochenstunden: 40, status: "aktiv", qualifikationen: [] }));
  m.abweichungen = {};
  naechte.forEach((n, i) => { for (let t = 0; t < n; t++) m.abweichungen[`p${i + 1}|${TAGE[t * 2]}`] = "N"; });
  m.vorgaben = vorgaben;
  return m;
};
const anzeige = (m) => { const e = verteilungErgebnis(m, YM); expect(e.ok).toBe(true); return verteilungAnzeige(e.bewertung, m); };
const sitz = (m, rolle) => ({ rolle: "kunde", zugangRolle: rolle, mandant: m, person: { id: "x1", rolle, vorname: "V", nachname: "N" } });
const html = (el) => renderToStaticMarkup(el);

describe("1. Zustände: erfüllt / nicht erfüllt / nicht bewertbar", () => {
  it("nicht erfüllt: Spannweite über maxAbweichung, Werte, Abweichung zum niedrigsten und Überschreitung aus der Engine", () => {
    const m = betrieb([6, 2, 0, 0]);
    const a = anzeige(m);
    expect(a).toMatchObject({ erfuellt: 0, nichtErfuellt: 1, nichtBewertbar: 0, gesamtBewertet: true });
    const r = a.regeln[0];
    expect(r).toMatchObject({ zustand: "nicht_erfuellt", zustandText: "nicht erfüllt", grund: null, spannweite: 6, ueberschreitung: 5, staerke: "Soll", maxAbweichung: 1, name: "Nächte gleichmäßig" });
    expect(r.personen.map((p) => [p.name, p.nachtdienste, p.wert, p.abweichung])).toEqual([["Vor1 Nach1", 6, 6, 6], ["Vor2 Nach2", 2, 2, 2], ["Vor3 Nach3", 0, 0, 0], ["Vor4 Nach4", 0, 0, 0]]);
    /* Dieselbe Zahl wie die Engine selbst (keine zweite Rechnung) */
    const vt = verteilungVorbereiten(m, TAGE);
    expect(verteilungErgebnis(m, YM).bewertung).toEqual(verteilungBewerten(vt, nachtZaehlen(m, vt)));
  });

  it("erfüllt nur, wenn der Regelbaukasten erfüllt sagt (Spannweite höchstens maxAbweichung)", () => {
    const a = anzeige(betrieb([3, 3, 4, 3]));
    expect(a).toMatchObject({ erfuellt: 1, nichtErfuellt: 0, nichtBewertbar: 0 });
    expect(a.regeln[0]).toMatchObject({ zustand: "erfuellt", zustandText: "erfüllt", spannweite: 1, ueberschreitung: 0 });
    expect(anzeige(betrieb([3, 3, 5, 3])).regeln[0].zustand).toBe("nicht_erfuellt");
  });

  it("unbekannte Person (Eintritt im Monat): nicht bewertbar, auch wenn die bekannten Werte schon verletzen; nie erfüllt, nie nicht erfüllt", () => {
    const gleich = betrieb([3, 3, 3, 3]);
    gleich.personen[3] = { ...gleich.personen[3], eintritt: "2026-12-15" };
    const a1 = anzeige(gleich);
    expect(a1.erfuellt).toBe(0);
    expect(a1.regeln[0]).toMatchObject({ zustand: "nicht_bewertbar", zustandText: "nicht bewertbar", grund: VERTEILUNG_VORGABE_GRUND.personen_nicht_bewertbar });
    expect(a1.regeln[0].nichtBewertbar.map((p) => [p.name, p.nachtdienste, p.grundText])).toEqual([["Vor4 Nach4", 0, VERTEILUNG_PERSON_GRUND.eintritt_austritt]]);
    expect(a1.gesamtBewertet).toBe(false);
    const schief = betrieb([6, 0, 0, 3]);
    schief.personen[3] = { ...schief.personen[3], eintritt: "2026-12-15" };
    const a2 = anzeige(schief);
    expect(a2.regeln[0].zustand, "verletzt mit unbekannter Person zählt nicht als nicht erfüllt").toBe("nicht_bewertbar");
    expect([a2.erfuellt, a2.nichtErfuellt, a2.nichtBewertbar]).toEqual([0, 0, 1]);
  });

  it("Teilzeit nur bei teilzeitAnteilig === true: Wert / Quote und der Hinweis stehen dabei; sonst unverändert gezählt", () => {
    for (const flag of [undefined, false, true]) {
      const m = betrieb([3, 3, 3], [VT(flag === undefined ? {} : { ausnahmen: { teilzeitAnteilig: flag } })]);
      m.personen[2] = { ...m.personen[2], teilzeit: { aktiv: true, modus: "wochentage", wochentage: [0, 1, 2, 3, 4, 5, 6] }, wochenstunden: 20 };
      const r = anzeige(m).regeln[0];
      expect(r.teilzeitAnteilig, `Flag ${flag}`).toBe(flag === true);
      expect(r.personen.find((p) => p.personId === "p3").wert, `Flag ${flag}`).toBe(flag === true ? 6 : 3);
      expect(r.personen.find((p) => p.personId === "p1").wert).toBe(3);
    }
    /* Quote nicht bestimmbar bei anteiliger Berechnung: nicht bewertbar mit Grund */
    const m = betrieb([3, 3, 3], [VT({ ausnahmen: { teilzeitAnteilig: true } })]);
    m.personen[2] = { ...m.personen[2], teilzeit: { aktiv: true }, wochenstunden: 0 };
    const r = anzeige(m).regeln[0];
    expect(r.zustand).toBe("nicht_bewertbar");
    expect(r.nichtBewertbar.map((p) => p.grundText)).toEqual([VERTEILUNG_PERSON_GRUND.teilzeitquote_offen]);
  });

  it("außerhalb der Vergleichsgruppe wird mit Grund genannt (kein Nachtdienst möglich, nicht im Schichtdienst, ganzer Monat Urlaub)", () => {
    const m = betrieb([3, 3, 3, 3, 3, 3]);
    m.personen[3] = { ...m.personen[3], einschraenkungen: { keineNacht: true } };
    m.personen[4] = { ...m.personen[4], imSchichtdienst: false };
    m.abwesenheiten = [{ id: "u2", personId: "p6", art: "urlaub", von: "2026-12-01", bis: "2026-12-31" }];
    const r = anzeige(m).regeln[0];
    expect(r.zustand).toBe("erfuellt");
    expect(r.ausserhalb.map((p) => [p.name, p.grundText])).toEqual([
      ["Vor4 Nach4", VERTEILUNG_PERSON_GRUND.kein_nachtdienst_moeglich], ["Vor5 Nach5", VERTEILUNG_PERSON_GRUND.nicht_im_schichtdienst], ["Vor6 Nach6", VERTEILUNG_PERSON_GRUND.ganzer_monat_abwesend]]);
  });

  it("Wunsch, Aufwand, unbekannter Status und nicht anwendbar sind nie „erfüllt“", () => {
    const wunsch = anzeige(betrieb([3, 3, 3], [VT({ staerke: "wunsch" })])).regeln[0];
    expect([wunsch.zustand, wunsch.grund]).toEqual(["nicht_bewertbar", VERTEILUNG_VORGABE_GRUND.wunsch]);
    const eins = anzeige(betrieb([3])).regeln[0];
    expect([eins.zustand, eins.grund]).toEqual(["nicht_bewertbar", VERTEILUNG_VORGABE_GRUND.weniger_als_zwei]);
    const roh = (status, grund) => verteilungAnzeige({ bewertet: false, regeln: [{ vorgabeId: "vt-1", status, grund, staerke: "soll", maxAbweichung: 1, personen: [], nichtBewertbar: [], ausserhalb: [] }] }, betrieb([1, 1]));
    expect(roh("nicht_bewertet", "aufwand").regeln[0]).toMatchObject({ zustand: "nicht_bewertbar", grund: VERTEILUNG_VORGABE_GRUND.aufwand });
    for (const s of ["offen", "nicht_anwendbar", "nicht_bewertet", "komisch", undefined, null, 5]) {
      expect(roh(s, "x").regeln[0].zustand, String(s)).toBe("nicht_bewertbar");
      expect(roh(s, "x").regeln[0].grund, String(s)).toBe("Grund nicht bewertbar");
    }
    expect(roh("erfuellt", undefined).regeln[0].zustand).toBe("erfuellt");
    expect(roh("verletzt", undefined).regeln[0].zustand).toBe("nicht_erfuellt");
    expect(roh("verletzt", "personen_nicht_bewertbar").regeln[0].zustand).toBe("nicht_bewertbar");
    /* Unlesbare Eingabe: nichts erfunden */
    for (const x of [null, undefined, {}, { regeln: "x" }, { regeln: [null, 3, "a"] }]) expect(verteilungAnzeige(x, betrieb([1, 1]))).toMatchObject({ regeln: [], erfuellt: 0, nichtErfuellt: 0, nichtBewertbar: 0, gesamtBewertet: false });
  });

  it("fail closed: ohne Verteilungsvorgabe „keine“, ungültiger Monat oder unlesbarer Betrieb „nicht berechenbar“ (wirft nie)", () => {
    expect(hatVerteilungsvorgabe(betrieb([1, 1], []))).toBe(false);
    expect(hatVerteilungsvorgabe(betrieb([1, 1], [VT({ status: "entwurf" })]))).toBe(false);
    expect(hatVerteilungsvorgabe(betrieb([1, 1]))).toBe(true);
    expect(hatVerteilungsvorgabe(null)).toBe(false);
    expect(verteilungErgebnis(betrieb([1, 1], []), YM)).toEqual({ ok: true, keine: true, bewertung: null });
    for (const [m, ym] of [[betrieb([1, 1]), "2026-13"], [betrieb([1, 1]), ""], [null, YM], [{ vorgaben: [VT()], personen: 5 }, YM]]) {
      expect(verteilungErgebnis(m, ym), String(ym)).toEqual({ ok: false });
    }
  });

  it("Rechenaufwand über der Grenze der Vorgaben: nicht bewertet statt gerechnet", () => {
    /* Aufwand = Tage × Personen × (Nachtdienstarten + Vorgaben + 2): 31 × 1700 × (1 + 1 + 2) > 200000 */
    const gross = betrieb(Array.from({ length: 1700 }, () => 0));
    const r = anzeige(gross).regeln[0];
    expect(r).toMatchObject({ zustand: "nicht_bewertbar", grund: VERTEILUNG_VORGABE_GRUND.aufwand, personen: [] });
  });

  it("die Rechnung ändert den Betrieb nicht", () => {
    const m = betrieb([6, 2, 0, 0]);
    const vorher = JSON.stringify(m);
    verteilungAnzeige(verteilungErgebnis(m, YM).bewertung, m);
    expect(JSON.stringify(m)).toBe(vorher);
  });
});

describe("2. Gründe: jede Kennung der Engine hat einen Text", () => {
  it("Personengründe: genau die Kennungen der Engine, jede mit Text; unbekannt: „Grund nicht bewertbar“", () => {
    expect(Object.keys(VERTEILUNG_PERSON_GRUND).sort()).toEqual(Object.values(VERTEILUNG_GRUENDE).sort());
    for (const t of Object.values(VERTEILUNG_PERSON_GRUND)) expect(t.length).toBeGreaterThan(15);
    const a = verteilungAnzeige({ bewertet: false, regeln: [{ vorgabeId: "vt-1", status: "offen", staerke: "soll", maxAbweichung: 1, personen: [],
      nichtBewertbar: [{ personId: "p1", grund: "neu_und_unbekannt", nachtdienste: 1 }, { personId: "p2", grund: undefined, nachtdienste: 0 }], ausserhalb: [{ personId: "p1", grund: "__proto__" }] }] }, betrieb([1, 1]));
    expect(a.regeln[0].nichtBewertbar.map((p) => p.grundText)).toEqual(["Grund nicht bewertbar", "Grund nicht bewertbar"]);
    expect(a.regeln[0].ausserhalb[0].grundText).toBe("Grund nicht bewertbar");
  });
  it("Gründe der Vorgabe: jeder Grund, den die Engine setzt, hat einen Text (Quelltext der Engine abgeglichen)", () => {
    const q = lies("server/lib/engine/verteilung.mjs");
    const gefunden = new Set([...q.matchAll(/nicht\(v, "(?:nicht_bewertet|nicht_anwendbar)", "([a-z_]+)"\)/g)].map((x) => x[1]));
    for (const g of ["weniger_als_zwei", "geltung_teilweise", "personen_nicht_bewertbar"]) { expect(q, g).toContain(`"${g}"`); gefunden.add(g); }
    expect([...gefunden].sort()).toEqual(["aufwand", "geltung_teilweise", "groesse_nicht_bewertet", "keine_nachtdienstart", "nicht_auswertbar", "personen_nicht_bewertbar", "weniger_als_zwei", "wunsch", "zu_viele_vorgaben"]);
    expect(Object.keys(VERTEILUNG_VORGABE_GRUND).sort()).toEqual([...gefunden].sort());
  });
});

describe("3. Rechte: nur Leitung und Planung", () => {
  const m = betrieb([6, 2, 0, 0]);
  const rollen = [["leitung", true], ["planer", true], ["subplaner", false], ["mitarbeiter", false], ["betriebsrat", false], ["betreiber", false], ["kunde", false], [null, false]];
  it("die Fläche erscheint für Leitung und Planung, für alle anderen nicht (Tabellen des Servers)", () => {
    for (const [rolle, soll] of rollen) {
      const s = h(PlanerVerteilung, { m, ym: YM, sitz: sitz(m, rolle) });
      const t = html(s);
      expect(t.includes('data-testid="planer-verteilung"'), String(rolle)).toBe(soll);
      expect(planerRechte(sitz(m, rolle)).sehen, String(rolle)).toBe(soll);
    }
    expect(html(h(PlanerVerteilung, { m, ym: YM, sitz: null }))).toBe("");
    expect(html(h(PlanerVerteilung, { m: null, ym: YM, sitz: sitz(m, "leitung") }))).toBe("");
    /* Die Altrolle „kunde“ als Person gibt ohne Zugangsrolle nichts frei (wie am Server) */
    expect(html(h(PlanerVerteilung, { m, ym: YM, sitz: { rolle: "kunde", mandant: m, person: { id: "x", rolle: "mitarbeiter" } } }))).toBe("");
  });
  it("ohne aktive Verteilungsvorgabe zeigt auch Leitung nichts", () => {
    const o = betrieb([6, 2, 0, 0], []);
    expect(html(h(PlanerVerteilung, { m: o, ym: YM, sitz: sitz(o, "leitung") }))).toBe("");
  });
  it("geschlossen steht nur der Knopf (kein Ergebnis, keine Person); er ist ein Btn mit Namen und aria-expanded", () => {
    const t = html(h(PlanerVerteilung, { m, ym: YM, sitz: sitz(m, "leitung") }));
    expect(t).toContain(VERTEILUNG_TEXTE.oeffnen);
    expect(t).toContain('aria-expanded="false"');
    expect(t).toContain("btn btn-quiet btn-sm");
    expect(t).not.toContain("Vor1");
    expect(t).not.toContain("nicht erfüllt");
  });
});

describe("4. Ansicht: Text statt nur Farbe, ehrlich, nur lesen", () => {
  const m = betrieb([6, 2, 0, 0]);
  const ansicht = (mm, e = verteilungErgebnis(mm, YM), offen = true) => html(h(PlanerVerteilungAnsicht, { m: mm, ym: YM, offen, ergebnis: e }));
  it("nicht erfüllt: Zustand als Wort, Zusammenfassung, Werte je Person, Überschreitung", () => {
    const t = ansicht(m);
    expect(t).toContain("Dezember 2026: 0 erfüllt · 1 nicht erfüllt · 0 nicht bewertbar");
    expect(t).toContain("pille-danger");
    expect(t).toMatch(/<span class="pille pille-danger">nicht erfüllt<\/span>/);
    expect(t).toContain("Vor1 Nach1: 6 Nachtdienste, Vergleichswert 6, 6 über dem niedrigsten");
    expect(t).toContain("davon 5 über der Grenze");
    expect(t).toContain(VERTEILUNG_TEXTE.teilzeitAus);
    expect(t).toContain('role="region"');
    expect(t).toContain('aria-expanded="true"');
  });
  it("nicht bewertbar: Wort „nicht bewertbar“, Grund je Vorgabe und je Person, „insgesamt nicht bewertet“, nie „erfüllt“", () => {
    const u = betrieb([3, 3, 3, 3]);
    u.personen[3] = { ...u.personen[3], eintritt: "2026-12-15" };
    const t = ansicht(u);
    expect(t).toContain("0 erfüllt · 0 nicht erfüllt · 1 nicht bewertbar (insgesamt nicht bewertet)");
    expect(t).toMatch(/<span class="pille pille-warn">nicht bewertbar<\/span>/);
    expect(t).toContain(VERTEILUNG_VORGABE_GRUND.personen_nicht_bewertbar);
    expect(t).toContain(`Vor4 Nach4: 0 Nachtdienste, nicht bewertbar. ${VERTEILUNG_PERSON_GRUND.eintritt_austritt}`);
    expect(t).not.toContain("pille-ok");
    expect(t).not.toMatch(/>erfüllt</);
  });
  it("erfüllt: grüne Pille mit dem Wort „erfüllt“", () => {
    const t = ansicht(betrieb([3, 3, 3]));
    expect(t).toMatch(/<span class="pille pille-ok">erfüllt<\/span>/);
    expect(t).toContain("1 erfüllt · 0 nicht erfüllt · 0 nicht bewertbar");
  });
  it("Fehler und Teilzeit: nicht berechenbar ist eine Warnung (role=alert) und keine Zahl; Teilzeit anteilig steht dabei", () => {
    const t = ansicht(m, { ok: false });
    expect(t).toContain(`role="alert">${VERTEILUNG_TEXTE.fehler}`);
    expect(t).not.toContain("Vor1");
    expect(ansicht(m, null)).toContain('role="alert"');
    const tz = betrieb([3, 3, 3], [VT({ ausnahmen: { teilzeitAnteilig: true } })]);
    expect(ansicht(tz)).toContain(VERTEILUNG_TEXTE.teilzeitAn);
  });
  it("zu: nichts außer Titel, Hinweis und Knopf", () => {
    const t = ansicht(m, verteilungErgebnis(m, YM), false);
    expect(t).not.toContain("planer-verteilung-inhalt\">");
    expect(t).not.toContain("Vor1");
  });
});

describe("5. Lesend und barrierefrei: Quelltext", () => {
  const teil = () => { const q = lies("src/ansichten/planer-steuerung.jsx"); return q.slice(q.indexOf("Verteilung (Stufe 2, nur lesen)")); };
  it("kein Schreibweg, keine Inline-Stile, keine rohen Bedienelemente; nur vorhandene Bausteine", () => {
    const q = teil();
    expect(q.length).toBeGreaterThan(1500);
    expect(q).not.toMatch(/style=/);
    expect(q).not.toMatch(/<(details|summary|button|select|input|textarea)\b/);
    expect(q).not.toMatch(/\bakt\b|setzePlaner|SP\.schreib|schreib\(|fetch\(|localStorage/);
    expect(q).not.toMatch(/dangerouslySetInnerHTML/);
    expect(q).toContain("<Btn size=\"sm\" kind=\"quiet\"");   // Zielgröße wie jeder Btn (axe target-size)
  });
  it("reine Teile: nur lesende Funktionen der Engine, keine Planer-Läufe", () => {
    const q = lies("src/lib/planer-oberflaeche.js");
    const teilq = q.slice(q.indexOf("Verteilung (Stufe 2, nur lesen)"));
    expect(teilq).not.toMatch(/planeVorschlag|planerEinstieg|PLANER_AN\b|freigabe/);
    expect(q).toContain('from "../../server/lib/engine/verteilung.mjs"');
  });
  it("der Monatsplan bindet die Fläche mit Rolle und Betrieb ein; die Planer-Schalter bleiben AUS", () => {
    expect(lies("src/ansichten/monatsplan.jsx")).toContain("<PlanerVerteilung m={m} ym={ym} sitz={sitz} />");
    expect([PLANER_AN, PLANER_AGGREGATE_AN]).toEqual([false, false]);
  });
});

/* ------------------------------------------------------------------ Stufe 2b (Nachträge aus dem Review von #610) */
describe("6. Stufe 2b: gerechnet wird erst nach dem Öffnen (C-1)", () => {
  const m = betrieb([6, 2, 0, 0]);
  it("geschlossen keine Rechnung; geöffnet genau eine; ohne Recht oder ohne Vorgabe auch geöffnet keine", () => {
    verteilungErgebnis.mockClear();
    const zu = html(h(PlanerVerteilung, { m, ym: YM, sitz: sitz(m, "leitung") }));
    expect(zu).toContain(VERTEILUNG_TEXTE.oeffnen);
    expect(verteilungErgebnis, "bloßes Rendern rechnet nicht").not.toHaveBeenCalled();

    const auf = html(h(PlanerVerteilung, { m, ym: YM, sitz: sitz(m, "leitung"), startOffen: true }));
    expect(verteilungErgebnis).toHaveBeenCalledTimes(1);
    expect(auf).toContain("Vor1 Nach1: 6 Nachtdienste");

    verteilungErgebnis.mockClear();
    html(h(PlanerVerteilung, { m, ym: YM, sitz: sitz(m, "mitarbeiter"), startOffen: true }));
    const ohne = betrieb([6, 2, 0, 0], []);
    html(h(PlanerVerteilung, { m: ohne, ym: YM, sitz: sitz(ohne, "leitung"), startOffen: true }));
    expect(verteilungErgebnis, "ohne Recht oder Vorgabe wird nie gerechnet").not.toHaveBeenCalled();
  });
  it("Quelltext: die Rechnung hängt an der Nutzeraktion (offen), die Vorgabe von startOffen ist zu", () => {
    const q = lies("src/ansichten/planer-steuerung.jsx");
    expect(q).toContain("zeigen && offen ? verteilungErgebnis(m, ym) : null");
    expect(q).toMatch(/startOffen = false/);
    expect(q).toContain("useState(startOffen === true)");
  });
});

describe("7. Stufe 2b: Zahlen deutsch, Dezimalkomma (C-2)", () => {
  it("zahlDe: Komma, höchstens zwei Stellen, keine überflüssigen Nullen, nie ein Wert auf 0 gerundet, kein Zahlenwert „–“", () => {
    expect([1.5, 6, 0, 2.25, 10, 100, 1234.5, 0.1 + 0.2, 4.5, 1 / 3].map(zahlDe)).toEqual(["1,5", "6", "0", "2,25", "10", "100", "1234,5", "0,3", "4,5", "0,33"]);
    expect(zahlDe("2.5")).toBe("2,5");
    expect(zahlDe(0.001)).toBe("unter 0,01");
    expect(zahlDe(-0.001)).toBe("über −0,01");
    expect(zahlDe(-1.5)).toBe("−1,5");
    for (const v of [null, undefined, "", NaN, Infinity, "abc", {}]) expect(zahlDe(v), String(v)).toBe("–");
    expect(zahlDe(1.5)).not.toContain(".");
  });
  it("die Ansicht zeigt Vorgabe, Spannweite, Überschreitung und Werte je Person mit Dezimalkomma (nie „1.5“)", () => {
    const m = betrieb([3, 2]);
    const bewertung = { bewertet: true, summe: 1, regeln: [{ vorgabeId: "vt-1", regelId: "r", staerke: "soll", groesse: "nachtdienste", maxAbweichung: 1.5, status: "verletzt",
      spannweite: 2.5, ueberschreitung: 1, nichtBewertbar: [], ausserhalb: [],
      personen: [{ personId: "p1", nachtdienste: 3, wert: 4.5, abweichung: 2.5 }, { personId: "p2", nachtdienste: 2, wert: 2, abweichung: 0 }] }] };
    const t = html(h(PlanerVerteilungAnsicht, { m, ym: YM, offen: true, ergebnis: { ok: true, keine: false, bewertung } }));
    expect(t).toContain("erlaubter Unterschied höchstens 1,5");
    expect(t).toContain("Größter Unterschied im Monat: 2,5, davon 1 über der Grenze.");
    expect(t).toContain("Vor1 Nach1: 3 Nachtdienste, Vergleichswert 4,5, 2,5 über dem niedrigsten");
    expect(t).toContain("Vor2 Nach2: 2 Nachtdienste, Vergleichswert 2, 0 über dem niedrigsten");
    expect(t).not.toMatch(/\d\.\d/);
  });
  it("Quelltext: die Ansicht formatiert über zahlDe (keine Rohzahl aus der Engine im Text)", () => {
    const q = lies("src/ansichten/planer-steuerung.jsx");
    for (const f of ["maxAbweichung", "spannweite", "ueberschreitung", "p.nachtdienste", "p.wert", "p.abweichung"]) expect(q, f).toContain(`zahlDe(${f.startsWith("p.") ? f : "r." + f})`);
    expect(lies("src/lib/planer-oberflaeche.js")).not.toMatch(/function zahlDe[\s\S]{0,600}toLocaleString|Intl\./);
  });
});

describe("8. Stufe 2b: Überschrift und Namen (D-1)", () => {
  const m = betrieb([6, 2, 0, 0]);
  it("der Titel ist eine Überschrift der Ebene 2 (unter der Monatsüberschrift), der Bereich behält einen eindeutigen Namen", () => {
    const t = html(h(PlanerVerteilungAnsicht, { m, ym: YM, offen: false, ergebnis: null }));
    expect(t).toMatch(/<h2 class="abschnitt-titel" id="planer-verteilung-titel">Verteilung der Nachtdienste \(nur lesen\)<\/h2>/);
    expect(t).toContain('role="region"');
    expect(t).toContain('aria-label="Verteilung der Nachtdienste (nur lesen), Dezember 2026"');
    expect((t.match(/<h[1-6]\b/g) || []).length, "genau eine Überschrift in der Fläche").toBe(1);
  });
  it("mehrere Vorgaben: jede Personenliste trägt den Namen der Vorgabe (sonst wären die Listen nicht unterscheidbar)", () => {
    const zwei = betrieb([3, 3, 3], [VT(), VT({ id: "vt-2", name: "Zweite Vorgabe", prioritaet: 2 })]);
    const t = html(h(PlanerVerteilungAnsicht, { m: zwei, ym: YM, offen: true, ergebnis: verteilungErgebnis(zwei, YM) }));
    expect(t).toContain('aria-label="Personen im Vergleich: Nächte gleichmäßig"');
    expect(t).toContain('aria-label="Personen im Vergleich: Zweite Vorgabe"');
  });
  it("nicht bewertbar und außerhalb der Gruppe: die Listen tragen ebenfalls den Namen der Vorgabe", () => {
    const u = betrieb([3, 3, 3, 3]);
    u.personen[3] = { ...u.personen[3], eintritt: "2026-12-15" };
    const t = html(h(PlanerVerteilungAnsicht, { m: u, ym: YM, offen: true, ergebnis: verteilungErgebnis(u, YM) }));
    expect(t).toContain('aria-label="Nicht bewertbar: Nächte gleichmäßig"');
    expect(t).toContain(VERTEILUNG_PERSON_GRUND.eintritt_austritt);
    expect(t).not.toMatch(/>erfüllt</);
  });
});
