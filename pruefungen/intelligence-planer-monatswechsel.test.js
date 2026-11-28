/* ==========================================================================
   WP-I7 — PLANVORSCHLAG-ÜBERNAHME, Oberfläche: Monatswechsel während einer Anfrage, Fokus und Ansage-Region
   (Nacharbeit vor Freigabe von PLANER_AN, Review #615 C-1 und D-5)

   Im Repository gibt es keinen Browser und kein jsdom. Diese Prüfung betreibt die ECHTE Behälter-Komponente `PlanerVorschlag` mit einem
   kleinen Ersatz für die Hooks (useState, useRef, useMemo, useEffect: Zustand je Aufruf-Platz, Effekte nach dem Rendern, Neurendern bei
   Zustandsänderung) und ruft die Handler genau so auf, wie sie das jeweils letzte Rendern ausgibt. Die Aktionen sind gespielte Antworten mit
   Verzögerung; der Monatswechsel geschieht, während die Anfrage noch läuft. Nur synthetische Daten, kein Netz.
   1. Monatswechsel: Vorschlag, Prüfung, bestätigte Übernahme und Rücknahme, die erst nach dem Wechsel antworten, stehen nie im neuen Monat;
      eine bestätigte Übernahme/Rücknahme wird ehrlich gemeldet (nicht still verworfen); die Liste des neuen Monats wird nicht überholt;
      beim Zurückwechseln wird die Liste des Ursprungsmonats neu gelesen.
   2. Fokus nach der Bestätigung: die Ergebnisüberschrift (tabindex -1) bekommt ihn, nur dann.
   3. Eine einzige Ansage-Region (role="status"), immer vorhanden, zuerst leer, mit dem Text des jeweiligen Schritts.
   Aufruf: TZ=UTC npx vitest run pruefungen/intelligence-planer-monatswechsel.test.js
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
import { andererMonatHinweis } from "../src/lib/planer-oberflaeche.js";

const DEZ = "2026-12", JAN = "2027-01";
const st = { am: "2026-11-27T10:00:00.000Z", vonRolle: "leitung" };
const FREI = { betrieb: { an: true, ...st }, betriebsratFrage: { antwort: "nein", ...st }, planerSchalter: { an: true, ...st } };
const m = { id: "m-a", einstellungen: { kiSteuerung: FREI },
  personen: [{ id: "zq-person-7", vorname: "Anna", nachname: "Alt", rolle: "mitarbeiter" }, { id: "zq-person-9", vorname: "Bert", nachname: "Bau", rolle: "mitarbeiter" }],
  dienstarten: [{ id: "zq-dienst-F", name: "Frühdienst" }, { id: "zq-dienst-N", name: "Nachtdienst" }], abweichungen: {} };
const EINTRAEGE = [
  { index: 0, personId: "zq-person-7", datum: "2026-12-03", dienstId: "zq-dienst-F", art: "luecke" },
  { index: 1, personId: "zq-person-9", datum: "2026-12-05", dienstId: "zq-dienst-N", art: "luecke" }];
const sitz = { rolle: "kunde", zugangRolle: "leitung", mandant: m, person: { id: "x1", rolle: "leitung", vorname: "V", nachname: "N" } };
const UD = `pu-${"d".repeat(32)}`, UJ = `pu-${"j".repeat(32)}`;

const nachlauf = () => new Promise((r) => setTimeout(r, 0));
const aufschub = () => { let los; const p = new Promise((r) => { los = r; }); return { p, los }; };
const listeVon = (ym) => ({ ok: true, daten: { eintraege: [{ uebernahme: ym === JAN ? UJ : UD, ym, anzahl: 1, von: `${ym}-10`, bis: `${ym}-10`, rueckgaengigBis: "2027-02-07" }] } });
const vorschlagAntwort = { ok: true, text: "", status: 201, daten: { ok: true, vorschlag: `pv-${"a".repeat(32)}`, eintraege: EINTRAEGE, offen: 3 } };
const uebernahmeAntwort = { ok: true, text: "", status: 200, daten: { ok: true, geschrieben: true, anzahl: 1, zeitraum: { von: "2026-12-03", bis: "2026-12-03" },
  rueckgaengigBis: "2027-01-07", rueckgaengigVerdraengt: 0, mitteilungen: { versandt: false, planFreigegeben: false } } };

/** Ein Aufbau: die Aktionen sind gespielt (mit Aufschub für die, bei denen der Monat wechseln soll). */
function aufbau(extra = {}) {
  const akt = { planerVorschlagErzeugen: vi.fn(async () => vorschlagAntwort), planerAuswahlPruefen: vi.fn(async () => ({ ok: true, text: "", daten: { ok: true, geprueft: true, geschrieben: false, anzahl: 1 } })),
    planerUebernehmen: vi.fn(async () => uebernahmeAntwort), planerRueckgaengigListe: vi.fn(async (ym) => listeVon(ym)),
    planerRueckgaengigPruefen: vi.fn(async () => ({ ok: true, text: "", daten: { ok: true, geprueft: true, geschrieben: false, anzahl: 1, unterbesetzt: [] } })),
    planerRueckgaengigAusfuehren: vi.fn(async () => ({ ok: true, text: "", status: 200, daten: { ok: true, geschrieben: true, anzahl: 1, zeitraum: { von: "2026-12-10", bis: "2026-12-10" }, unterbesetzt: [] } })), ...extra };
  let eigenschaften = { m, ym: DEZ, sitz, akt, startOffen: true, freigegeben: true };
  /** Rendern wie React: Aufruf, Effekte, Neurendern solange Zustand geändert wurde. Gibt die Eigenschaften der Ansicht zurück. */
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
  const sicht = async (neu) => { await nachlauf(); return rendere(neu); };
  return { akt, rendere, sicht };
}
beforeEach(() => { RT.slots = []; RT.wartend = []; RT.i = 0; RT.dirty = false; RT.aktiv = false; });

/** Bis zur Prüfung: Vorschlag erstellen, die erste Einteilung wählen, prüfen. Danach steht „Übernahme bestätigen“ bereit. */
async function bisGeprueft(a) {
  await a.sicht();
  let p = a.rendere();
  await p.onErstellen(); p = await a.sicht();
  p.onToggle(0); p = a.rendere();
  await p.onPruefen(); return a.sicht();
}

describe("1. Monatswechsel während einer laufenden Anfrage", () => {
  it("Kontrolle ohne Wechsel: Vorschlag, Prüfung, Übernahme und Liste laufen im selben Monat durch", async () => {
    const a = aufbau();
    let p = await bisGeprueft(a);
    expect(p.vorschlag.zeilen).toHaveLength(2);
    expect(p.geprueft).toMatchObject({ anzahl: 1 });
    await p.onBestaetigen(); p = await a.sicht();
    expect(p.ergebnis).toMatchObject({ anzahl: 1, versandt: false });
    expect(p.status).toBeNull();
    expect(p.liste.eintraege.map((e) => e.uebernahme)).toEqual([UD]);
    expect(a.akt.planerRueckgaengigListe).toHaveBeenLastCalledWith(DEZ);
  });

  it("Vorschlag erstellen: kommt die Antwort erst nach dem Wechsel auf Januar, steht sie nicht in der Januar-Fläche", async () => {
    const warten = aufschub();
    const a = aufbau({ planerVorschlagErzeugen: vi.fn(() => warten.p) });
    await a.sicht();
    const laeuft = a.rendere().onErstellen();
    let p = a.rendere({ ym: JAN });                 // Monatswechsel, die Anfrage ist noch unterwegs
    warten.los(vorschlagAntwort);
    await laeuft; p = await a.sicht();
    expect(p.ym).toBe(JAN);
    expect(p.vorschlag).toBeNull();
    expect(p.status).toBeNull();
    expect(p.auswahl).toEqual([]);
    expect(p.beschaeftigt).toBe(false);              // die Sperre ist wieder frei
    expect(a.akt.planerVorschlagErzeugen).toHaveBeenCalledWith(DEZ);   // der Monat der Anfrage ist der beim Klick
  });

  it("Auswahl prüfen: eine Prüfung, die erst nach dem Wechsel antwortet, wird verworfen (kein „Geprüft“ im Januar)", async () => {
    const warten = aufschub();
    const a = aufbau({ planerAuswahlPruefen: vi.fn(() => warten.p) });
    await a.sicht();
    let p = a.rendere(); await p.onErstellen(); p = await a.sicht(); p.onToggle(0); p = a.rendere();
    const laeuft = p.onPruefen();
    a.rendere({ ym: JAN });
    warten.los({ ok: true, text: "", daten: { ok: true, geprueft: true, geschrieben: false, anzahl: 1 } });
    await laeuft; p = await a.sicht();
    expect(p.geprueft).toBeNull();
    expect(p.ansageArt).toBeNull();
  });

  it("Übernahme bestätigen: das Dezember-Ergebnis steht nicht in der Januar-Fläche, die Januar-Liste wird nicht überholt, der Hinweis ist ehrlich", async () => {
    const warten = aufschub();
    const a = aufbau({ planerUebernehmen: vi.fn(() => warten.p) });
    let p = await bisGeprueft(a);
    const laeuft = p.onBestaetigen();
    a.rendere({ ym: JAN });
    await nachlauf();                                   // die Januar-Liste ist geladen
    const listenAufrufe = a.akt.planerRueckgaengigListe.mock.calls.length;
    warten.los(uebernahmeAntwort);
    await laeuft; p = await a.sicht();
    expect(p.ym).toBe(JAN);
    expect(p.ergebnis).toBeNull();                      // nicht dem Januar zugeschrieben
    expect(p.rueckErgebnis).toBeNull();
    expect(p.vorschlag).toBeNull();
    expect(p.status.ok).toBe(true);                     // aber auch nicht still verworfen
    expect(p.status.text).toContain("Die Übernahme für 12/2026 wurde ausgeführt");
    expect(p.status.text).toContain("Beschäftigte wurden nicht benachrichtigt");
    expect(p.ansageArt).toBe("status");
    expect(a.akt.planerRueckgaengigListe.mock.calls.length).toBe(listenAufrufe);   // kein nachlaufendes Laden der Dezember-Liste
    expect(a.akt.planerRueckgaengigListe).toHaveBeenLastCalledWith(JAN);
    expect(p.liste.zustand).toBe("fertig");
    expect(p.liste.eintraege.map((e) => e.uebernahme)).toEqual([UJ]);   // die Liste des Januars
  });

  it("Übernahme bestätigen, Antwort mit Fehler nach dem Wechsel: Text der Kennung, mit Monat, ohne Erfolgsbehauptung", async () => {
    const warten = aufschub();
    const a = aufbau({ planerUebernehmen: vi.fn(() => warten.p) });
    let p = await bisGeprueft(a);
    const laeuft = p.onBestaetigen();
    a.rendere({ ym: JAN });
    warten.los({ ok: false, text: "Es wurde nichts übernommen (Test).", daten: {}, code: "konflikt" });
    await laeuft; p = await a.sicht();
    expect(p.ergebnis).toBeNull();
    expect(p.status).toEqual({ ok: false, text: "Zur Übernahme für 12/2026: Es wurde nichts übernommen (Test)." });
    expect(p.ansageArt).toBeNull();
  });

  it("Rücknahme prüfen und bestätigen nach dem Wechsel: Prüfung verworfen; bestätigte Rücknahme ehrlich gemeldet, nichts im Januar eingetragen", async () => {
    const w1 = aufschub(), w2 = aufschub();
    const a = aufbau({ planerRueckgaengigPruefen: vi.fn(() => w1.p), planerRueckgaengigAusfuehren: vi.fn(() => w2.p) });
    await a.sicht();
    let p = a.rendere();
    const pruefung = p.onRueckPruefen(UD);
    a.rendere({ ym: JAN });
    w1.los({ ok: true, text: "", daten: { ok: true, geprueft: true, geschrieben: false, anzahl: 1, unterbesetzt: [] } });
    await pruefung; p = await a.sicht();
    expect(p.rueck).toBeNull();
    /* Zurück im Dezember: Rücknahme prüfen (jetzt ohne Aufschub), bestätigen, währenddessen nach Januar. */
    a.akt.planerRueckgaengigPruefen.mockImplementation(async () => ({ ok: true, text: "", daten: { ok: true, geprueft: true, geschrieben: false, anzahl: 1, unterbesetzt: [] } }));
    p = await a.sicht({ ym: DEZ });
    await p.onRueckPruefen(UD); p = await a.sicht();
    expect(p.rueck).toMatchObject({ uebernahme: UD });
    const bestaetigung = p.onRueckBestaetigen();
    a.rendere({ ym: JAN });
    w2.los({ ok: true, text: "", status: 200, daten: { ok: true, geschrieben: true, anzahl: 1, zeitraum: { von: "2026-12-10", bis: "2026-12-10" }, unterbesetzt: [] } });
    await bestaetigung; p = await a.sicht();
    expect(p.rueckErgebnis).toBeNull();
    expect(p.rueck).toBeNull();
    expect(p.status.ok).toBe(true);
    expect(p.status.text).toContain("Die Rücknahme für 12/2026 wurde ausgeführt");
    expect(p.liste.eintraege.map((e) => e.uebernahme)).toEqual([UJ]);
  });

  it("zurück in den Ursprungsmonat: die Liste wird neu gelesen (der Datensatz geht nicht verloren), der Hinweis ist weg", async () => {
    const warten = aufschub();
    const a = aufbau({ planerUebernehmen: vi.fn(() => warten.p) });
    let p = await bisGeprueft(a);
    const laeuft = p.onBestaetigen();
    a.rendere({ ym: JAN });
    warten.los(uebernahmeAntwort);
    await laeuft; await a.sicht();
    a.akt.planerRueckgaengigListe.mockClear();
    p = await a.sicht({ ym: DEZ });
    await nachlauf(); p = a.rendere();
    expect(a.akt.planerRueckgaengigListe).toHaveBeenCalledWith(DEZ);
    expect(p.liste.eintraege.map((e) => e.uebernahme)).toEqual([UD]);
    expect(p.status).toBeNull();
  });

  it("Dezember → Januar → Dezember während einer laufenden Prüfung: das Ergebnis gilt nicht (anderer Stand), keine Ansage „Geprüft“", async () => {
    const warten = aufschub();
    const a = aufbau({ planerAuswahlPruefen: vi.fn(() => warten.p) });
    await a.sicht();
    let p = a.rendere(); await p.onErstellen(); p = await a.sicht(); p.onToggle(0); p = a.rendere();
    const laeuft = p.onPruefen();
    await a.sicht({ ym: JAN });
    p = await a.sicht({ ym: DEZ });                 // wieder derselbe Monat, aber die Fläche wurde dazwischen zurückgesetzt
    warten.los({ ok: true, text: "", daten: { ok: true, geprueft: true, geschrieben: false, anzahl: 1 } });
    await laeuft; p = await a.sicht();
    expect(p.ym).toBe(DEZ);
    expect(p.geprueft).toBeNull();
    expect(p.ansageArt).toBeNull();
    expect(p.vorschlag).toBeNull();
  });

  it("Dezember → Januar → Dezember während der bestätigten Übernahme: Hinweis ohne „bitte wechseln“, die Liste wird neu gelesen", async () => {
    const warten = aufschub();
    const a = aufbau({ planerUebernehmen: vi.fn(() => warten.p) });
    let p = await bisGeprueft(a);
    const laeuft = p.onBestaetigen();
    await a.sicht({ ym: JAN });
    await a.sicht({ ym: DEZ });
    a.akt.planerRueckgaengigListe.mockClear();
    warten.los(uebernahmeAntwort);
    await laeuft; p = await a.sicht();
    expect(p.ergebnis).toBeNull();                   // der Dezember von vorher ist nicht dieser Stand
    expect(p.status.ok).toBe(true);
    expect(p.status.text).toContain("Die Übernahme für 12/2026 wurde ausgeführt");
    expect(p.status.text).toContain("Die Liste der Rücknahmen ist aktualisiert.");
    expect(p.status.text).not.toContain("Bitte wieder zu");
    expect(a.akt.planerRueckgaengigListe).toHaveBeenCalledWith(DEZ);
    expect(p.liste.eintraege.map((e) => e.uebernahme)).toEqual([UD]);
  });

  it("eine späte Liste des alten Monats überschreibt die Liste des neuen nicht", async () => {
    const alt = aufschub();
    const a = aufbau({ planerRueckgaengigListe: vi.fn((ym) => (ym === DEZ ? alt.p : Promise.resolve(listeVon(ym)))) });
    await a.sicht();                                   // Öffnen: Dezember-Liste unterwegs
    a.rendere({ ym: JAN });                            // Wechsel: Januar-Liste kommt sofort
    await nachlauf();
    alt.los(listeVon(DEZ));                            // die Dezember-Liste trifft zuletzt ein
    await nachlauf();
    expect(a.rendere().liste.eintraege.map((e) => e.uebernahme)).toEqual([UJ]);
  });
});

describe("1b. Hinweistext (rein)", () => {
  it("Erfolg nennt Monat und Aktion; Fehler trägt den Text der Kennung; ohne Text ehrlich unklar; Rücknahme ohne Mitteilung", () => {
    expect(andererMonatHinweis("uebernahme", DEZ, { ok: true, daten: { mitteilungen: { versandt: false } } }))
      .toMatchObject({ ok: true, text: expect.stringContaining("Die Übernahme für 12/2026 wurde ausgeführt") });
    expect(andererMonatHinweis("uebernahme", DEZ, { ok: true, daten: { mitteilungen: {} } }).text).not.toContain("nicht benachrichtigt");
    expect(andererMonatHinweis("rueckgaengig", JAN, { ok: true, daten: {} }).text).toContain("Die Rücknahme für 01/2027 wurde ausgeführt");
    expect(andererMonatHinweis("uebernahme", DEZ, { ok: false, text: "Text X." })).toEqual({ ok: false, text: "Zur Übernahme für 12/2026: Text X." });
    expect(andererMonatHinweis("uebernahme", DEZ, null).ok).toBe(false);
    expect(andererMonatHinweis("uebernahme", DEZ, { ok: false }).text).toContain("nicht eindeutig");
    const kaputt = andererMonatHinweis("uebernahme", "kaputt", { ok: true, daten: {} }).text;
    expect(kaputt).toContain("Die Übernahme für den vorigen Monat wurde ausgeführt");   // Akkusativ nach „für“
    expect(kaputt).toContain("Bitte wieder zu dem vorigen Monat wechseln");               // Dativ nach „zu“
    expect(kaputt).not.toContain("für dem");
    expect(andererMonatHinweis("uebernahme", "kaputt", { ok: false, text: "T." }).text).toBe("Zur Übernahme für den vorigen Monat: T.");
    const hier = andererMonatHinweis("uebernahme", DEZ, { ok: true, daten: {} }, true).text;   // wieder im selben Monat
    expect(hier).toContain("Die Liste der Rücknahmen ist aktualisiert.");
    expect(hier).not.toContain("Bitte wieder zu");
    expect(andererMonatHinweis("uebernahme", DEZ, { ok: "ja" }).ok).toBe(false);   // nur ausdrücklich true
  });
});

describe("2. Fokus nach der Bestätigung", () => {
  const mitKopf = (a) => { const ref = a.rendere().ergebnisRef; ref.current = { focus: vi.fn() }; return ref.current.focus; };
  it("nach „Übernahme bestätigen“ bekommt die Ergebnisüberschrift den Fokus — genau einmal; Prüfen und Erstellen setzen ihn nicht", async () => {
    const a = aufbau();
    await a.sicht();
    const fokus = mitKopf(a);
    let p = a.rendere();
    await p.onErstellen(); p = await a.sicht(); p.onToggle(0); p = a.rendere(); await p.onPruefen(); p = await a.sicht();
    expect(fokus).not.toHaveBeenCalled();
    await p.onBestaetigen(); p = await a.sicht();
    expect(p.ergebnis).not.toBeNull();
    expect(fokus).toHaveBeenCalledTimes(1);
    a.rendere(); a.rendere();                          // weiteres Rendern holt den Fokus nicht noch einmal
    expect(fokus).toHaveBeenCalledTimes(1);
  });
  it("nach „Rücknahme bestätigen“ bekommt die Überschrift der Rücknahme den Fokus", async () => {
    const a = aufbau();
    await a.sicht();
    const ref = a.rendere().rueckRef; ref.current = { focus: vi.fn() };
    let p = a.rendere(); await p.onRueckPruefen(UD); p = await a.sicht();
    expect(ref.current.focus).not.toHaveBeenCalled();
    await p.onRueckBestaetigen(); p = await a.sicht();
    expect(p.rueckErgebnis).not.toBeNull();
    expect(ref.current.focus).toHaveBeenCalledTimes(1);
  });
  it("bei einer Absage (nichts bestätigt) wird kein Fokus gesetzt", async () => {
    const a = aufbau({ planerUebernehmen: vi.fn(async () => ({ ok: false, text: "Nichts übernommen.", daten: {}, code: "konflikt" })) });
    let p = await bisGeprueft(a);
    const ref = p.ergebnisRef; ref.current = { focus: vi.fn() };
    await p.onBestaetigen(); p = await a.sicht();
    expect(p.ergebnis).toBeNull();
    expect(ref.current.focus).not.toHaveBeenCalled();
  });
  it("die Überschriften sind per Skript fokussierbar (tabindex -1), kein Tab-Stopp", () => {
    const e = { anzahl: 1, zeitraum: { von: "2026-12-03", bis: "2026-12-03" }, rueckgaengigBis: "2027-01-07", verdraengt: 0, versandt: false, planFreigegeben: false };
    const seite = renderToStaticMarkup(h(PlanerVorschlagAnsicht, { m, ym: DEZ, offen: true, ergebnis: e, rueckErgebnis: { anzahl: 1, zeitraum: null, unterbesetzt: [] } }));
    expect(seite).toMatch(/<h3 tabindex="-1">Übernahme gespeichert: 1 Einteilung \(Do 03\.12\.\)\.<\/h3>/);
    expect(seite).toMatch(/<h4 tabindex="-1">Rücknahme gespeichert: 1 Einteilung\.<\/h4>/);
  });
});

describe("3. Eine Ansage-Region je Fläche", () => {
  const region = (seite) => { const t = seite.match(/<div class="nurLeser" role="status" aria-live="polite" aria-atomic="true" data-testid="planer-vorschlag-ansage">([^<]*)<\/div>/); return t ? t[1] : null; };
  const anzahlStatus = (seite) => [...seite.matchAll(/role="status"/g)].length;
  const html = (p) => renderToStaticMarkup(h(PlanerVorschlagAnsicht, p));

  it("immer genau eine Region mit role=status, auch bei geschlossener Fläche und zuerst leer; sonst nirgends role=status", async () => {
    const zu = html({ m, ym: DEZ, offen: false });
    expect(anzahlStatus(zu)).toBe(1);
    expect(region(zu)).toBe("");
    const a = aufbau();
    let p = await bisGeprueft(a);
    for (const stufe of [p]) { const s = html(stufe); expect(anzahlStatus(s)).toBe(1); expect(region(s)).toContain("Geprüft: 1 Einteilung"); }
    await p.onBestaetigen(); p = await a.sicht();
    const s = html(p);
    expect(anzahlStatus(s)).toBe(1);
    expect(region(s)).not.toContain("Übernahme gespeichert");      // die Überschrift bekommt den Fokus und wird dort gelesen: nicht doppelt ansagen
    expect(s).toContain("Übernahme gespeichert: 1 Einteilung (Do 03.12.).");   // sichtbar (als Überschrift) bleibt sie
    expect(region(s)).toContain("Zurücknehmen ist möglich bis 07.01.2027.");
    expect(region(s)).toContain("keine Benachrichtigung an Beschäftigte versendet");
  });
  it("jeder Schritt setzt den Text der Region: Vorschlag, Prüfung der Rücknahme (mit Besetzung), Rücknahme, Hinweis ohne Vorschlag", async () => {
    const a = aufbau();
    await a.sicht();
    let p = a.rendere();
    expect(region(html(p))).toBe("");
    await p.onErstellen(); p = await a.sicht();
    expect(region(html(p))).toBe("2 Einteilungen vorgeschlagen. Offene Lücken nach diesem Vorschlag: 3");
    p.onToggle(0); p = a.rendere();
    expect(region(html(p))).toBe("");                  // eine Änderung der Auswahl nimmt die Ansage zurück
    await p.onRueckPruefen(UD); p = await a.sicht();
    expect(region(html(p))).toContain("Prüfung der Rücknahme: 1 Einteilung");
    expect(region(html(p))).toContain("keine Besetzungslücke");
    await p.onRueckBestaetigen(); p = await a.sicht();
    expect(region(html(p))).not.toContain("Rücknahme gespeichert");
    expect(html(p)).toContain("Rücknahme gespeichert: 1 Einteilung (Do 10.12.).");
    expect(region(html(p))).toContain("nicht benachrichtigt");
    expect(anzahlStatus(html(p))).toBe(1);
    const b = aufbau({ planerVorschlagErzeugen: vi.fn(async () => ({ ok: true, text: "", daten: { ok: true, vorschlag: null, eintraege: [], offen: 2 } })) });
    await b.sicht(); let q = b.rendere(); await q.onErstellen(); q = await b.sicht();
    expect(region(html(q))).toContain("keine Einteilung vorgeschlagen");
    expect(q.status.ok).toBe(true);
    expect(anzahlStatus(html(q))).toBe(1);   // auch mit sichtbarem Hinweistext keine zweite Region
  });
  it("Fehler stehen als Warnung (role=alert), nicht in der Ansage-Region", async () => {
    const a = aufbau({ planerVorschlagErzeugen: vi.fn(async () => ({ ok: false, text: "Nichts passiert (Test).", daten: {}, code: "x" })) });
    await a.sicht(); let p = a.rendere(); await p.onErstellen(); p = await a.sicht();
    const s = html(p);
    expect(s).toContain('role="alert"');
    expect(region(s)).toBe("");
    expect(anzahlStatus(s)).toBe(1);
  });
});
