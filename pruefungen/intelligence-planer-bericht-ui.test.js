/* ==========================================================================
   WP-I8 — ERFÜLLUNGSBERICHT IM PLANVORSCHLAG, Oberfläche (Leitung und Planung)
   src/lib/planer-bericht.js (reine Texte) und src/ansichten/planer-vorschlag.jsx (Abschnitt „Erfüllungsbericht“).

   Im Repository gibt es keinen Browser und kein jsdom. Wie intelligence-planer-monatswechsel.test.js betreibt diese Prüfung die ECHTE
   Behälter-Komponente mit einem kleinen Ersatz für die Hooks und gespielten Antworten; die Darstellung wird mit renderToStaticMarkup geprüft.
   Nur synthetische Daten, kein Netz, keine Uhr.
   1. Texte je Status und Kategorie; Pflichttext; „nicht bewertbar“ nie „erfüllt“; Rangfolge; maßgeblich und erstes Problem.
   2. Offene Stellen: Wo, Warum, Wege; jede Kennung des Kerns hat einen Text; unbekannte Kennung ⇒ neutraler Platzhalter, nie der Rohtext.
   3. Kein Bericht: ehrlicher Hinweis mit Grund; falscher Monat; alter Server ohne Feld.
   4. Markup: Liste und Überschriften semantisch, keine rohen Bedienelemente, keine Inline-Stile, keine Rohkennungen, keine Namen von Personen.
   5. Lebensdauer: der Bericht gehört zum Vorschlag (Monatswechsel, Verwerfen, Übernahme, neuer Vorschlag).
   Aufruf: TZ=UTC npx vitest run pruefungen/intelligence-planer-bericht-ui.test.js
   ========================================================================== */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const RT = vi.hoisted(() => ({ aktiv: false, i: 0, slots: [], wartend: [], dirty: false }));
vi.mock("react", async (original) => {
  const R = /** @type {any} */ (await original());
  const slot = (neu) => { const i = RT.i++; if (!(i in RT.slots)) RT.slots[i] = neu(); return RT.slots[i]; };
  const gleich = (a, b) => !!a && !!b && a.length === b.length && a.every((x, k) => Object.is(x, b[k]));
  const useState = (init) => {
    if (!RT.aktiv) return R.useState(init);
    const s = slot(() => ({ w: typeof init === "function" ? init() : init }));
    return [s.w, (x) => { s.w = typeof x === "function" ? x(s.w) : x; RT.dirty = true; }];
  };
  const useRef = (init) => (RT.aktiv ? slot(() => ({ current: init })) : R.useRef(init));
  const useMemo = (fn, deps) => {
    if (!RT.aktiv) return R.useMemo(fn, deps);
    const s = slot(() => ({ deps: null, w: undefined }));
    if (!gleich(s.deps, deps)) { s.w = fn(); s.deps = deps; }
    return s.w;
  };
  const useEffect = (fn, deps) => {
    if (!RT.aktiv) return R.useEffect(fn, deps);
    const s = slot(() => ({ deps: null }));
    if (!gleich(s.deps, deps)) { s.deps = deps; RT.wartend.push(fn); }
  };
  return { ...R, useState, useRef, useMemo, useEffect, default: { ...(R.default || R), useState, useRef, useMemo, useEffect } };
});
vi.mock("../src/speicher.js", () => ({ zugangsdaten: () => ({}) }));

import { PlanerVorschlag, PlanerVorschlagAnsicht } from "../src/ansichten/planer-vorschlag.jsx";
import { berichtAnzeige, berichtNichtVerfuegbar, pflichtText, BERICHT_TEXTE, BERICHT_KATEGORIE_NAME, BERICHT_STATUS_TEXT, BERICHT_GRUND_TEXT, BERICHT_URSACHE_TEXT,
  BERICHT_STELLE_GRUND_TEXT, BERICHT_NICHT_VERFUEGBAR } from "../src/lib/planer-bericht.js";
import { BERICHT_RANGFOLGE, BERICHT_URSACHEN, BERICHT_GRUENDE, AUSSAGE_VORSCHLAG } from "../server/lib/engine/erfuellungsbericht.mjs";
import { BERICHT_FEHLER } from "../server/lib/planer-aktion.mjs";

const DEZ = "2026-12", JAN = "2027-01";
const st = { am: "2026-11-27T10:00:00.000Z", vonRolle: "leitung" };
const FREI = { betrieb: { an: true, ...st }, betriebsratFrage: { antwort: "nein", ...st }, planerSchalter: { an: true, ...st } };
const m = { id: "m-a", einstellungen: { kiSteuerung: FREI },
  personen: [{ id: "zq-person-7", vorname: "Anna", nachname: "Alt", rolle: "mitarbeiter" }, { id: "zq-person-9", vorname: "Bert", nachname: "Bau", rolle: "mitarbeiter" }],
  dienstarten: [{ id: "zq-dienst-F", name: "Frühdienst" }, { id: "zq-dienst-N", name: "Nachtdienst" }],
  qualifikationen: [{ id: "zq-qual-1", name: "Fachkraft" }], vorgaben: [{ id: "zq-vorgabe-1", name: "Nachtdienste fair verteilen" }], abweichungen: {} };
const sitz = { rolle: "kunde", zugangRolle: "leitung", mandant: m, person: { id: "x1", rolle: "leitung", vorname: "V", nachname: "N" } };
const EINTRAEGE = [
  { index: 0, personId: "zq-person-7", datum: "2026-12-03", dienstId: "zq-dienst-F", art: "luecke" },
  { index: 1, personId: "zq-person-9", datum: "2026-12-05", dienstId: "zq-dienst-N", art: "luecke" }];
const nachlauf = () => new Promise((r) => setTimeout(r, 0));
const aufschub = () => { let los; const p = new Promise((r) => { los = r; }); return { p, los }; };

/* ---------------------------- ein Bericht in der Form des Servers ---------------------------- */
const kat = (name, extra) => ({ kategorie: name, rang: BERICHT_RANGFOLGE.indexOf(name), ...extra });
const nachpruef = (name, status, extra = {}) => kat(name, { umfang: "vorschlag", bestandGeprueft: false, geprueft: 33, verletzt: 0, status, ...extra });
const konflikt = (extra) => ({ datum: "2026-12-03", dienstId: "zq-dienst-F", art: "besetzung", fehlt: 2, qualFehlt: false, fehlendeQualifikationen: [], ursache: "direktMoeglich",
  regeln: [], wegeStatus: "keine", wege: [], ...extra });
function bericht(o = {}) {
  const kategorien = o.kategorien || [
    nachpruef("gesetz", "erfuellt", { aussage: AUSSAGE_VORSCHLAG }),
    kat("qualifikation", { stellen: 4, offen: 1, status: "offen" }),
    kat("besetzung", { stellen: 31, voll: 29, offen: 2, bedarf: 60, fehlt: 3, bedarfOffen: 0, status: "offen" }),
    nachpruef("muss", "erfuellt", { vorgaben: 2, aussage: AUSSAGE_VORSCHLAG }),
    nachpruef("soll", "verletzt", { verletzt: 2, vorgaben: 1 }),
    kat("verteilung", { nachgelagert: true, status: "nicht-bewertbar", erfuellt: 0, verletzt: 0, nichtBewertbar: 1, summeUeberschreitung: null, grund: "keine_vorgabe",
      vorgaben: [{ vorgabeId: "zq-vorgabe-1", staerke: "soll", groesse: "nachtdienste", status: "nicht-bewertbar", grund: "weniger_als_zwei", maxAbweichung: 1, spannweite: null,
        ueberschreitung: null, personen: 1, nichtBewertbar: 0, ausserhalb: 0 }] }),
    kat("wunsch", { status: "nicht-bewertbar", grund: "nicht_bewertet", vorgaben: 3 }),
  ];
  return { ok: true, ym: DEZ, startwert: 1, massgeblich: { kategorie: "qualifikation", status: "offen" }, erstesProblem: { kategorie: "qualifikation", status: "offen" },
    zusammenfassung: { konflikte: { gesamt: 2, gelistet: 2, abgeschnitten: false, mitWegen: 1, wegeUnvollstaendig: 0, ursacheUnvollstaendig: 0 } }, kategorien,
    konflikte: o.konflikte || [konflikt(), konflikt({ datum: "2026-12-05", dienstId: "zq-dienst-N", art: "besetzung_und_qualifikation", fehlt: 1, qualFehlt: true,
      fehlendeQualifikationen: [{ qid: "zq-qual-1", noetig: 2, ist: 1 }], ursache: "hindernisse", regeln: ["abwesend"], wegeStatus: "berechnet",
      wege: [{ regeln: ["abwesend"], personen: 2, deckt: 1 }, { regeln: ["ruhezeitGesetz", "folge"], personen: 1, deckt: 1 }] })] };
}
const modell = (b = bericht(), ym = DEZ) => berichtAnzeige(b, null, m, ym);
const kategorie = (mo, name) => mo.kategorien.find((k) => k.kategorie === name);
/** Eine Kategorie allein, mit Status und Zahlen. */
const einzeln = (k) => berichtAnzeige(bericht({ kategorien: [k], konflikte: [] }), null, m, DEZ);
/** Alle Texte, die die Fläche zeigt (ohne die inneren Schlüssel des Modells). */
const anzeigeTexte = (mo) => JSON.stringify([mo.massgeblich && [mo.massgeblich.name, mo.massgeblich.statusText], mo.erstesProblem && [mo.erstesProblem.name, mo.erstesProblem.statusText],
  mo.kategorien.map((k) => [k.name, k.statusText, k.zeilen, k.hinweis]), mo.konflikte.map((x) => [x.wo, x.was, x.warum, x.wege, x.wegeText]), mo.notizen]);
const SNAKE = /[A-Za-z]_[A-Za-z]/;   // Rohkennungen des Kerns (aussage, grund, ursache …) haben einen Unterstrich oder sind camelCase
const CAMEL = /\b(?:direktMoeglich|keinPersonal|qualifikationFehlt|folgeVorwaerts|ruhezeitGesetz|schutzOffen|qualifikationGesetzlich)\b/;

describe("1. Status und Texte je Kategorie", () => {
  it("die Rangfolge der Anzeige ist die des Rechenkerns; jede Kategorie hat Namen und Statustext; maßgeblich und erstes Problem sind markiert", () => {
    const mo = modell();
    expect(mo.verfuegbar).toBe(true);
    expect(mo.kategorien.map((k) => k.kategorie)).toEqual([...BERICHT_RANGFOLGE]);
    expect(Object.keys(BERICHT_KATEGORIE_NAME)).toEqual([...BERICHT_RANGFOLGE]);
    for (const k of mo.kategorien) expect([typeof k.name, typeof k.statusText]).toEqual(["string", "string"]);
    expect(mo.massgeblich).toMatchObject({ name: "Qualifikation", statusText: "Offen" });
    expect(mo.erstesProblem).toMatchObject({ name: "Qualifikation", statusText: "Offen" });
    expect(mo.kategorien.filter((k) => k.massgeblich).map((k) => k.kategorie)).toEqual(["qualifikation"]);
    expect(mo.kategorien.filter((k) => k.erstesProblem).map((k) => k.kategorie)).toEqual(["qualifikation"]);
    /* Ohne Problem: ehrlicher Satz, dass das nicht „alles erfüllt“ heißt. */
    const ohne = berichtAnzeige({ ...bericht(), erstesProblem: null, massgeblich: { kategorie: "gesetz", status: "nicht-bewertbar" } }, null, m, DEZ);
    expect(ohne.erstesProblem).toBeNull();
    expect(ohne.massgeblich.kategorie).toBe("gesetz");
  });
  it("Gesetz, Muss und Soll: „erfüllt“ heißt nur „im Vorschlag ohne Befund“ und trägt immer den Pflichttext mit N und dem Hinweis auf den Bestand", () => {
    const mo = modell();
    expect(kategorie(mo, "gesetz")).toMatchObject({ status: "erfuellt_im_vorschlag", statusText: "Im Vorschlag ohne Befund", hinweis: "Keine Gesetzesbefunde in den 33 vorgeschlagenen Einteilungen – Bestand nicht geprüft" });
    expect(kategorie(mo, "muss").hinweis).toBe("Keine Befunde zu Muss-Vorgaben in den 33 vorgeschlagenen Einteilungen – Bestand nicht geprüft");
    expect(kategorie(einzeln(nachpruef("soll", "erfuellt", { aussage: AUSSAGE_VORSCHLAG, vorgaben: 1 })), "soll").hinweis)
      .toBe("Keine Befunde zu Soll-Vorgaben in den 33 vorgeschlagenen Einteilungen – Bestand nicht geprüft");
    expect(pflichtText("gesetz", 1)).toBe("Keine Gesetzesbefunde in der 1 vorgeschlagenen Einteilung – Bestand nicht geprüft");
    /* Auch ohne das Feld `aussage` nie ein „Erfüllt“ allein bei diesen drei. */
    for (const n of ["gesetz", "muss", "soll"]) {
      const k = kategorie(einzeln(nachpruef(n, "erfuellt", { vorgaben: 1 })), n);
      expect([k.status, k.statusText]).toEqual(["erfuellt_im_vorschlag", "Im Vorschlag ohne Befund"]);
      expect(k.hinweis).toMatch(/Bestand nicht geprüft$/);
    }
  });
  it("verletzt, offen und erfüllt (Besetzung, Qualifikation, Verteilung) mit Zählwerten; der Pflichttext steht nur bei „im Vorschlag ohne Befund“", () => {
    const mo = modell();
    expect(kategorie(mo, "soll")).toMatchObject({ status: "verletzt", statusText: "Verletzt", hinweis: null });
    expect(kategorie(mo, "soll").zeilen).toContain("2 Befunde in den 33 vorgeschlagenen Einteilungen; Bestand nicht geprüft.");
    expect(kategorie(mo, "qualifikation")).toMatchObject({ status: "offen", statusText: "Offen", zeilen: ["4 Stellen mit Qualifikationsbedarf, davon 1 ohne die nötige Qualifikation."] });
    expect(kategorie(mo, "besetzung").zeilen).toEqual(["29 von 31 Stellen voll besetzt.", "2 Stellen offen; insgesamt fehlen 3 Personen."]);
    const voll = kategorie(einzeln(kat("besetzung", { stellen: 31, voll: 31, offen: 0, bedarf: 60, fehlt: 0, bedarfOffen: 0, status: "erfuellt" })), "besetzung");
    expect([voll.status, voll.statusText, voll.hinweis]).toEqual(["erfuellt", "Erfüllt", null]);
    const vt = kategorie(einzeln(kat("verteilung", { nachgelagert: true, status: "erfuellt", erfuellt: 1, verletzt: 0, nichtBewertbar: 0, vorgaben: [{ vorgabeId: "zq-vorgabe-1", status: "erfuellt",
      spannweite: 1, maxAbweichung: 2, personen: 5, nichtBewertbar: 0, ausserhalb: 0 }] })), "verteilung");
    expect(vt.statusText).toBe("Erfüllt");
    expect(vt.zeilen).toEqual(["1 erfüllt, 0 verletzt, 0 nicht bewertbar.", "Nachtdienste fair verteilen: Erfüllt. Spannweite 1, erlaubt höchstens 2."]);
    expect(kategorie(einzeln(kat("besetzung", { stellen: 31, voll: 29, offen: 0, bedarf: 60, fehlt: 0, bedarfOffen: 2, status: "nicht-bewertbar", grund: "bedarf_nicht_festgelegt" })), "besetzung").zeilen)
      .toContain("Bei 2 Diensten ist der Bedarf nicht festgelegt.");
  });
  it("„nicht bewertbar“ wird nie als „erfüllt“ gezeigt: Grundtext je Grund; unlesbare Zahlen und unbekannter Status machen aus „erfüllt“ „nicht bewertbar“", () => {
    for (const g of Object.keys(BERICHT_GRUND_TEXT)) {
      const k = kategorie(einzeln(kat("wunsch", { status: "nicht-bewertbar", grund: g })), "wunsch");
      expect([k.status, k.statusText, k.hinweis]).toEqual(["nicht-bewertbar", "Nicht bewertbar", BERICHT_GRUND_TEXT[g]]);
    }
    const unbekannt = kategorie(einzeln(kat("wunsch", { status: "nicht-bewertbar", grund: "was_ganz_anderes" })), "wunsch");
    expect(unbekannt.hinweis).toBe(BERICHT_TEXTE.grundUnbekannt);
    expect(unbekannt.hinweis).not.toMatch(/was_ganz_anderes/);
    for (const k of [nachpruef("gesetz", "erfuellt", { geprueft: -1 }), nachpruef("muss", "erfuellt", { verletzt: "0" }), kat("besetzung", { status: "erfuellt" }),
      kat("qualifikation", { status: "erfuellt", stellen: 3 }), kat("verteilung", { status: "erfuellt", vorgaben: [] })]) {
      const x = kategorie(einzeln(k), k.kategorie);
      expect([x.status, x.statusText], k.kategorie).toEqual(["nicht-bewertbar", "Nicht bewertbar"]);
    }
    for (const s of ["erfuellt_im_vorschlag", "ok", "", null, undefined, 3]) {
      const x = kategorie(einzeln(kat("wunsch", { status: s, vorgaben: 1 })), "wunsch");
      expect([x.status, x.statusText], String(s)).toEqual(["nicht-bewertbar", "Nicht bewertbar"]);
    }
  });
  it("kleine Gruppe (Verteilung): keine Zahlen der Gruppe, der Hinweis steht da; die nullbaren Felder bleiben null", () => {
    const k = kategorie(einzeln(kat("verteilung", { nachgelagert: true, status: "verletzt", erfuellt: 0, verletzt: 1, nichtBewertbar: 0, summeUeberschreitung: null,
      vorgaben: [{ vorgabeId: "zq-vorgabe-1", status: "verletzt", maxAbweichung: 1, spannweite: null, ueberschreitung: null, kleineGruppe: true, personen: 2, nichtBewertbar: 0, ausserhalb: 1 }] })), "verteilung");
    expect(k.status).toBe("verletzt");
    expect(k.zeilen.join(" ")).toContain(BERICHT_TEXTE.kleineGruppe);
    expect(k.zeilen.join(" ")).not.toMatch(/Spannweite|außerhalb/);
  });
  it("unbekannte Kategorien fehlen, bekannte stehen in der Rangfolge der Liste (nicht der Reihenfolge der Antwort)", () => {
    const b = bericht();
    const mo = berichtAnzeige({ ...b, kategorien: [{ kategorie: "geheim", status: "erfuellt" }, ...[...b.kategorien].reverse()] }, null, m, DEZ);
    expect(mo.kategorien.map((k) => k.kategorie)).toEqual([...BERICHT_RANGFOLGE]);
  });
  it("jeder Text kommt aus einer Tabelle: keine Rohkennung, keine Snake-Case-Kennung in irgendeinem Anzeigetext", () => {
    const mo = modell();
    const alle = anzeigeTexte(mo);
    expect(alle).not.toMatch(SNAKE);
    expect(alle).not.toMatch(CAMEL);
    for (const t of [BERICHT_GRUND_TEXT, BERICHT_URSACHE_TEXT, BERICHT_STELLE_GRUND_TEXT, BERICHT_NICHT_VERFUEGBAR, BERICHT_STATUS_TEXT, BERICHT_TEXTE])
      for (const [k, v] of Object.entries(t)) expect(String(v), k).not.toMatch(SNAKE);
  });
});

describe("2. Offene Stellen: Wo, Warum, Wege", () => {
  it("Wo (Tag, Dienstname, was fehlt), Warum (Ursache, kleinste Regel) und Wege (Zählungen mit Regeltexten) stehen als Text", () => {
    const [a, b] = modell().konflikte;
    expect(a.wo).toBe("Do 03.12. · Frühdienst");
    expect(a.was).toBe("2 Personen fehlen.");
    expect(a.warum).toEqual([BERICHT_URSACHE_TEXT.direktMoeglich]);
    expect(a.wege).toEqual([]);
    expect(a.wegeText).toBe(BERICHT_TEXTE.keineWege);
    expect(b.wo).toBe("Sa 05.12. · Nachtdienst");
    expect(b.was).toBe("1 Person fehlt; Qualifikation fehlt: Fachkraft (nötig 2, vorhanden 1).");
    expect(b.warum).toEqual([BERICHT_URSACHE_TEXT.hindernisse, "Kleinste Ursache: die Regel „abwesend“."]);
    expect(b.wege).toEqual(["Wenn die Regel „abwesend“ nicht gälte, kämen 2 Personen in Frage; das deckt höchstens 1 von 1 fehlenden.",
      "Wenn die Regeln „Ruhezeit unter 11 Stunden“ (bindend) und „Höchstzahl Dienste in Folge erreicht“ nicht gälte, kämen 1 Person in Frage; das deckt höchstens 1 von 1 fehlenden."]);
  });
  it("jede Ursache und jeder Grund des Rechenkerns hat einen Text; die Tabellen haben keine überzähligen oder fehlenden Kennungen", () => {
    expect(Object.keys(BERICHT_URSACHE_TEXT).sort()).toEqual([...BERICHT_URSACHEN].sort());
    expect(Object.keys(BERICHT_STELLE_GRUND_TEXT).sort()).toEqual([...BERICHT_GRUENDE].sort());
    expect(Object.keys(BERICHT_NICHT_VERFUEGBAR).filter((k) => k !== "anderer_monat").sort()).toEqual([...BERICHT_FEHLER].sort());
    for (const u of BERICHT_URSACHEN) expect(modell(bericht({ konflikte: [konflikt({ ursache: u })] })).konflikte[0].warum[0]).toBe(BERICHT_URSACHE_TEXT[u]);
    for (const g of BERICHT_GRUENDE) expect(modell(bericht({ konflikte: [konflikt({ ursache: "grund", grund: g })] })).konflikte[0].warum[0]).toBe(BERICHT_STELLE_GRUND_TEXT[g]);
  });
  it("unbekannte Kennungen (Ursache, Grund, Regel, Dienst, Qualifikation) geben einen neutralen Platzhalter, nie den Rohtext", () => {
    const mo = modell(bericht({ konflikte: [
      konflikt({ ursache: "ganzNeueUrsache" }),
      konflikt({ ursache: "grund", grund: "neuer_grund_x" }),
      konflikt({ ursache: "hindernisse", regeln: ["neueRegelY"], wegeStatus: "berechnet", wege: [{ regeln: ["neueRegelY"], personen: 1, deckt: 1 }] }),
      konflikt({ dienstId: "fremder-dienst-z", qualFehlt: true, fehlendeQualifikationen: [{ qid: "fremde-qual-q", noetig: 1, ist: 0 }] })] }));
    const text = anzeigeTexte(mo);
    for (const roh of ["ganzNeueUrsache", "neuer_grund_x", "neueRegelY", "fremder-dienst-z", "fremde-qual-q"]) expect(text, roh).not.toMatch(new RegExp(roh));
    expect(mo.konflikte[0].warum).toEqual(["Ursache nicht bezeichnet."]);
    expect(mo.konflikte[1].warum).toEqual(["Grund nicht bezeichnet."]);
    expect(mo.konflikte[2].warum[1]).toBe("Kleinste Ursache: die Regel „Regel nicht bezeichnet“.");
    expect(mo.konflikte[2].wege[0]).toContain("„Regel nicht bezeichnet“");
    expect(mo.konflikte[3].wo).toMatch(/· Dienst$/);
    expect(mo.konflikte[3].was).toContain("Qualifikation fehlt: Qualifikation (nötig 1, vorhanden 0)");
  });
  it("Regeln einer Vorgabe des Betriebs (VORGABE-<ID>) erscheinen mit dem Namen der Vorgabe; unbekannte Vorgabe: neutraler Platzhalter, nie die Rohkennung", () => {
    const mo = modell(bericht({ konflikte: [
      konflikt({ ursache: "hindernisse", regeln: ["VORGABE-ZQ-VORGABE-1"], wegeStatus: "berechnet", wege: [{ regeln: ["VORGABE-ZQ-VORGABE-1", "abwesend"], personen: 2, deckt: 1 }] }),
      konflikt({ ursache: "hindernisse", regeln: ["VORGABE-GIBT-ES-NICHT"], wegeStatus: "berechnet", wege: [{ regeln: ["VORGABE-GIBT-ES-NICHT"], personen: 1, deckt: 1 }] })] }));
    expect(mo.konflikte[0].warum[1]).toBe("Kleinste Ursache: die Regel „Vorgabe: Nachtdienste fair verteilen“.");
    expect(mo.konflikte[0].wege[0]).toContain("die Regeln „Vorgabe: Nachtdienste fair verteilen“ und „abwesend“");
    expect(mo.konflikte[1].warum[1]).toBe("Kleinste Ursache: die Regel „Vorgabe nicht bezeichnet“.");
    expect(anzeigeTexte(mo)).not.toMatch(/VORGABE-|ZQ-VORGABE|GIBT-ES-NICHT/);
    const ohne = berichtAnzeige(bericht({ konflikte: [konflikt({ ursache: "hindernisse", regeln: ["VORGABE-ZQ-VORGABE-1"] })] }), null, { ...m, vorgaben: [] }, DEZ);
    expect(ohne.konflikte[0].warum[1]).toContain("Vorgabe nicht bezeichnet");
  });
  it("Wege ehrlich: nicht berechnet, unvollständig, leer oder unbekannt — nie ein erfundener Weg; Notizen zu abgeschnittenen und unvollständigen Stellen", () => {
    const w = (extra) => modell(bericht({ konflikte: [konflikt({ ursache: "hindernisse", regeln: ["abwesend"], ...extra })] })).konflikte[0];
    expect(w({ wegeStatus: "unvollstaendig" })).toMatchObject({ wege: [], wegeText: BERICHT_TEXTE.wegeUnvollstaendig });
    expect(w({ wegeStatus: "berechnet", wege: [] })).toMatchObject({ wege: [], wegeText: BERICHT_TEXTE.wegeLeer });
    expect(w({ wegeStatus: "weiss_nicht" })).toMatchObject({ wege: [], wegeText: BERICHT_TEXTE.wegeUnvollstaendig });
    expect(w({ wegeStatus: undefined })).toMatchObject({ wege: [], wegeText: BERICHT_TEXTE.wegeUnvollstaendig });
    expect(w({ vorgabenUnvollstaendig: true, wegeStatus: "keine" }).warum).toContain(BERICHT_GRUND_TEXT.vorgaben_nicht_vollstaendig_geprueft);
    const b = bericht();
    const mo = berichtAnzeige({ ...b, zusammenfassung: { konflikte: { gesamt: 600, gelistet: 500, abgeschnitten: true, mitWegen: 3, wegeUnvollstaendig: 4, ursacheUnvollstaendig: 1 } } }, null, m, DEZ);
    expect(mo.notizen).toEqual(["Es werden 500 von 600 offenen Stellen aufgeführt.", "Bei 1 Stelle ließ sich die Ursache nicht vollständig bestimmen.", "Bei 4 Stellen sind die Wege nicht vollständig."]);
    expect(modell().notizen).toEqual([]);
  });
});

describe("3. Kein Bericht", () => {
  it("bericht null: „Erfüllungsbericht nicht verfügbar (Grund)“ mit dem Grundtext der festen Kennung; der Vorschlag bleibt unberührt", () => {
    for (const g of BERICHT_FEHLER) {
      const mo = berichtAnzeige(null, g, m, DEZ);
      expect(mo.verfuegbar).toBe(false);
      expect(mo.text).toBe(`Erfüllungsbericht nicht verfügbar (${BERICHT_NICHT_VERFUEGBAR[g]}). Der Vorschlag selbst bleibt davon unberührt.`);
      expect(mo.text).not.toMatch(SNAKE);
    }
    for (const g of [undefined, null, "", "Anna Alt", "neu_unbekannt", 7]) {
      const mo = berichtAnzeige(null, g, m, DEZ);
      expect(mo.text, String(g)).toBe("Erfüllungsbericht nicht verfügbar (Grund nicht bekannt). Der Vorschlag selbst bleibt davon unberührt.");
    }
    expect(berichtAnzeige(undefined, undefined, m, DEZ).verfuegbar).toBe(false);   // alter Server ohne das Feld
    expect(berichtNichtVerfuegbar("aufwand").text).toContain("Rechenaufwand");
  });
  it("unlesbarer Bericht, falscher Monat, kaputte Form: nie ein halber Bericht, nie eine Ausnahme", () => {
    for (const b of [{}, [], "text", 5, { ok: false }, { ok: true }, { ok: true, kategorien: [], konflikte: [] }, { ok: true, kategorien: "x", konflikte: [] }]) {
      const mo = berichtAnzeige(b, "aufwand", m, DEZ);
      expect(mo.verfuegbar, JSON.stringify(b)).toBe(false);
      expect(mo.text).toContain("Der Bericht war nicht lesbar");
    }
    expect(berichtAnzeige(bericht(), null, m, JAN).text).toContain("Der Bericht gehört zu einem anderen Monat");
    expect(() => berichtAnzeige(bericht(), null, null, DEZ)).not.toThrow();
    expect(berichtAnzeige({ ...bericht(), konflikte: [null, 3, { datum: "kein Datum" }, konflikt()] }, null, m, DEZ).konflikte).toHaveLength(1);
  });
});

/** Der Markup-Ausschnitt des Berichts. */
const bereich = (html) => { const a = html.indexOf('data-testid="planer-bericht"'); expect(a).toBeGreaterThan(-1); return html.slice(a, html.indexOf("</section>", a)); };
const markup = (props) => renderToStaticMarkup(h(PlanerVorschlagAnsicht, { m, ym: DEZ, offen: true, ...props }));

describe("4. Markup: semantisch, ohne rohe Bedienelemente, Inline-Stile und Rohkennungen", () => {
  it("Überschriften h3 (Bericht) und h4 (Kategorien, Stellen); Kategorien als nummerierte Liste, Stellen als Liste; Status und Hervorhebung als Text", () => {
    const html = markup({ bericht: modell() });
    const b = bereich(html);
    expect(b).toMatch(/<h3 id="planer-bericht-titel">Erfüllungsbericht<\/h3>/);
    /* Der Abschnitt wird über seine Überschrift benannt (kein doppelter Name aus aria-label und Überschrift). */
    expect(html).toMatch(/<section aria-labelledby="planer-bericht-titel" data-testid="planer-bericht">/);
    expect(html).not.toMatch(/<section aria-label="Erfüllungsbericht"/);
    expect([...b.matchAll(/<(h[1-6])[ >]/g)].map((x) => x[1])).toEqual(["h3", "h4", "h4"]);
    expect(b.match(/<ol aria-label="Ergebnis je Kategorie">/)).not.toBeNull();
    expect(b.match(/<ol[^>]*>[\s\S]*?<\/ol>/)[0].match(/<li[ >]/g)).toHaveLength(7);
    expect(b).toContain("<strong>Maßgeblich: Qualifikation (Offen)</strong>");
    expect(b).toContain("<strong>Erstes Problem: Qualifikation (Offen)</strong>");
    expect(b).toMatch(/<strong>Qualifikation: Offen<\/strong> – Maßgeblich – Erstes Problem/);
    expect(b).toContain("<strong>Gesetz und Schutzvorschriften: Im Vorschlag ohne Befund</strong>");
    expect(b).toContain("Keine Gesetzesbefunde in den 33 vorgeschlagenen Einteilungen – Bestand nicht geprüft");
    expect(b).toContain('<ul aria-label="Offene Stellen: Wo, Warum, Wege">');
    expect(b).toContain("<strong>Do 03.12. · Frühdienst</strong>: 2 Personen fehlen.");
    expect(b).toContain("Warum: Es gibt Personen ohne Regelhindernis");
    expect(b).toContain('<ul aria-label="Wege: Sa 05.12. · Nachtdienst">');
    expect(b).toContain("(bindend)");
    expect(b).toContain("keine Gesamtnote und keine Bewertung einzelner Personen");
  });
  it("der Bericht steht über der Liste der Einteilungen; ohne Vorschlag (0 Einteilungen) steht er trotzdem da", () => {
    const html = markup({ bericht: modell(), vorschlag: { zeilen: [{ index: 0, personName: "Anna Alt", datum: "2026-12-03", dienstName: "Frühdienst" }], offen: 2 } });
    expect(html.indexOf('data-testid="planer-bericht"')).toBeGreaterThan(-1);
    expect(html.indexOf('data-testid="planer-bericht"')).toBeLessThan(html.indexOf('aria-label="Vorgeschlagene Einteilungen"'));
    expect(markup({ bericht: modell() })).toContain('data-testid="planer-bericht"');
    expect(markup({})).not.toContain('data-testid="planer-bericht"');
  });
  it("keine rohen Bedienelemente und keine Inline-Stile im Bericht, keine Kennungen, keine Namen von Personen, keine Prozente", () => {
    const b = bereich(markup({ bericht: modell() }));
    expect(b).not.toMatch(/<(button|input|select|textarea|details|summary|a|table)[ >]/);
    expect(b).not.toMatch(/ style=/);
    expect(b).not.toMatch(SNAKE);
    expect(b).not.toMatch(CAMEL);
    expect(b).not.toMatch(/zq-|Anna|Bert|Alt\b|Bau\b|%|Prozent|Punkte|Note\b/);
    for (const p of m.personen) expect(b.includes(p.id) || b.includes(p.vorname), p.id).toBe(false);
  });
  it("nicht verfügbar: ein Absatz mit Grund, kein Kategorienblock, keine Listen", () => {
    const b = bereich(markup({ bericht: berichtAnzeige(null, "ergebnis_passt_nicht", m, DEZ) }));
    expect(b).toContain("Erfüllungsbericht nicht verfügbar (Das Ergebnis passt nicht zum aktuellen Plan.)");
    expect(b).not.toMatch(/<(ol|ul|h4)[ >]/);
  });
  it("„nicht bewertbar“ erscheint im Markup nie als „Erfüllt“: jede Zeile mit diesem Status trägt „Nicht bewertbar“", () => {
    const b = bereich(markup({ bericht: modell(bericht({ kategorien: [nachpruef("gesetz", "nicht-bewertbar", { geprueft: 0, grund: "keine_einteilung_im_vorschlag" })], konflikte: [] })) }));
    expect(b).toContain("<strong>Gesetz und Schutzvorschriften: Nicht bewertbar</strong>");
    expect(b).toContain("Der Vorschlag enthält keine Einteilung, die sich prüfen ließ.");
    expect(b).not.toMatch(/Erfüllt|ohne Befund/);
    expect(b).toContain("Es gibt keine offene Stelle.");
  });
});

/* ----------------------- Lebensdauer: Behälter mit gespielten Antworten ----------------------- */
const UD = `pu-${"d".repeat(32)}`;
const vorschlagAntwort = (extra = {}) => ({ ok: true, text: "", status: 201, daten: { ok: true, vorschlag: `pv-${"a".repeat(32)}`, eintraege: EINTRAEGE, offen: 3, bericht: bericht(), berichtGrund: null, ...extra } });
const uebernahmeAntwort = { ok: true, text: "", status: 200, daten: { ok: true, geschrieben: true, anzahl: 1, zeitraum: { von: "2026-12-03", bis: "2026-12-03" },
  rueckgaengigBis: "2027-01-07", rueckgaengigVerdraengt: 0, mitteilungen: { versandt: false, planFreigegeben: false } } };
function aufbau(extra = {}) {
  const akt = { planerVorschlagErzeugen: vi.fn(async () => vorschlagAntwort()), planerAuswahlPruefen: vi.fn(async () => ({ ok: true, text: "", daten: { ok: true, geprueft: true, geschrieben: false, anzahl: 1 } })),
    planerUebernehmen: vi.fn(async () => uebernahmeAntwort), planerRueckgaengigListe: vi.fn(async (ym) => ({ ok: true, daten: { eintraege: [{ uebernahme: UD, ym, anzahl: 1, von: `${ym}-10`, bis: `${ym}-10`, rueckgaengigBis: "2027-02-07" }] } })),
    planerRueckgaengigPruefen: vi.fn(), planerRueckgaengigAusfuehren: vi.fn(), ...extra };
  let eigenschaften = { m, ym: DEZ, sitz, akt, startOffen: true, freigegeben: true };
  const rendere = (neu = {}) => {
    eigenschaften = { ...eigenschaften, ...neu };
    let ansicht = null;
    for (let n = 0; n < 12; n++) {
      RT.aktiv = true; RT.i = 0; RT.dirty = false;
      try { ansicht = PlanerVorschlag(eigenschaften).props; } finally { RT.aktiv = false; }
      RT.wartend.splice(0).forEach((f) => f());
      if (!RT.dirty) break;
    }
    return ansicht;
  };
  return { akt, rendere, sicht: async (neu) => { await nachlauf(); return rendere(neu); } };
}
beforeEach(() => { RT.slots = []; RT.wartend = []; RT.i = 0; RT.dirty = false; RT.aktiv = false; });
async function mitVorschlag(a) { await a.sicht(); await a.rendere().onErstellen(); return a.sicht(); }

describe("5. Der Bericht gehört zum Vorschlag", () => {
  it("nach „Vorschlag erstellen“ steht der Bericht im Markup der Fläche; „Vorschlag verwerfen“ nimmt ihn mit weg", async () => {
    const a = aufbau();
    let p = await mitVorschlag(a);
    expect(p.bericht).toMatchObject({ verfuegbar: true });
    expect(bereich(markup(p))).toContain("Keine Gesetzesbefunde in den 33 vorgeschlagenen Einteilungen – Bestand nicht geprüft");
    p.onVerwerfen(); p = a.rendere();
    expect(p.vorschlag).toBeNull();
    expect(p.bericht).toBeNull();
  });
  it("Monatswechsel nach dem Erstellen: Bericht und Vorschlag sind weg; Rückkehr in den alten Monat zeigt keinen alten Bericht", async () => {
    const a = aufbau();
    let p = await mitVorschlag(a);
    expect(p.bericht).not.toBeNull();
    p = a.rendere({ ym: JAN });
    expect([p.vorschlag, p.bericht]).toEqual([null, null]);
    p = await a.sicht({ ym: DEZ });
    expect([p.vorschlag, p.bericht]).toEqual([null, null]);
  });
  it("Monatswechsel während der Anfrage: die Antwort mit Bericht kommt nach dem Wechsel und steht nirgends im neuen Monat", async () => {
    const warten = aufschub();
    const a = aufbau({ planerVorschlagErzeugen: vi.fn(() => warten.p) });
    await a.sicht();
    const laeuft = a.rendere().onErstellen();
    a.rendere({ ym: JAN });
    warten.los(vorschlagAntwort());
    await laeuft;
    const p = await a.sicht();
    expect([p.ym, p.vorschlag, p.bericht, p.status]).toEqual([JAN, null, null, null]);
  });
  it("der Bericht gilt nur für den Monat, für den er gerechnet wurde: ein Bericht eines anderen Monats wird nie als Bericht dieses Monats gezeigt", async () => {
    const a = aufbau({ planerVorschlagErzeugen: vi.fn(async () => vorschlagAntwort({ bericht: { ...bericht(), ym: JAN } })) });
    const p = await mitVorschlag(a);
    expect(p.bericht.verfuegbar).toBe(false);
    expect(p.bericht.text).toContain("anderen Monat");
  });
  it("Antwort ohne Bericht (bericht null mit Grund oder altes Format): ehrlicher Hinweis, der Vorschlag bleibt wählbar", async () => {
    for (const [extra, grund] of [[{ bericht: null, berichtGrund: "aufwand" }, "Der Rechenaufwand"], [{ bericht: undefined, berichtGrund: undefined }, "Grund nicht bekannt"], [{ bericht: null, berichtGrund: "neu_unbekannt" }, "Grund nicht bekannt"]]) {
      RT.slots = [];
      const a = aufbau({ planerVorschlagErzeugen: vi.fn(async () => vorschlagAntwort(extra)) });
      const p = await mitVorschlag(a);
      expect(p.bericht.verfuegbar).toBe(false);
      expect(p.bericht.text).toContain(grund);
      expect(p.vorschlag.zeilen).toHaveLength(2);
    }
  });
  it("keine Einteilung vorgeschlagen: der Bericht steht beim Hinweis; ein neuer Klick ersetzt ihn; ein Fehler nimmt ihn weg", async () => {
    let n = 0;
    const antworten = [vorschlagAntwort({ vorschlag: null, eintraege: [], offen: 0 }), { ok: false, text: "Der Planer konnte keinen gültigen Vorschlag erstellen.", daten: {}, code: "vorschlag-ungueltig" }];
    const a = aufbau({ planerVorschlagErzeugen: vi.fn(async () => antworten[n++]) });
    let p = await mitVorschlag(a);
    expect(p.vorschlag).toBeNull();
    expect(p.status.ok).toBe(true);
    expect(p.bericht).toMatchObject({ verfuegbar: true });
    expect(markup(p)).toContain('data-testid="planer-bericht"');
    await p.onErstellen(); p = await a.sicht();
    expect(p.status.ok).toBe(false);
    expect(p.bericht).toBeNull();
  });
  it("nach der bestätigten Übernahme ist der Bericht weg (er gehörte zum übernommenen Vorschlag); ein neuer Vorschlag bringt einen neuen", async () => {
    const a = aufbau();
    let p = await mitVorschlag(a);
    p.onToggle(0); p = a.rendere();
    await p.onPruefen(); p = await a.sicht();
    await p.onBestaetigen(); p = await a.sicht();
    expect(p.ergebnis).toMatchObject({ anzahl: 1 });
    expect([p.vorschlag, p.bericht]).toEqual([null, null]);
    await p.onErstellen(); p = await a.sicht();
    expect(p.bericht).toMatchObject({ verfuegbar: true });
  });
  it("Eigenschaften der Ansicht: ohne `bericht` kein Abschnitt (alte Aufrufer bleiben unverändert); der Bericht ändert Auswahl und Prüfung nie", async () => {
    expect(markup({})).not.toMatch(/Erfüllungsbericht/);
    const a = aufbau();
    let p = await mitVorschlag(a);
    p.onToggle(1); p = a.rendere();
    expect(p.auswahl).toEqual([1]);
    expect(p.geprueft).toBeNull();
  });
});
