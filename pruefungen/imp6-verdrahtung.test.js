/* ==========================================================================
   IMP-6 PLANWIRKUNG PR 2 — VERDRAHTUNG (ENTSCHEIDUNGSLISTE P2-4 Punkt 6)

   Der Schalter CENTRIC_SCHICHTMODELL_WIRKUNG (Vorgabe AUS) ist jetzt mit den
   Wegen verbunden. Geprüft, jeweils AUS = wörtlich bisheriges Verhalten:

   W. Server-Einstieg: server/lib/schichtmodell-wirkung.mjs setzt die Quelle,
      gelesen bei jedem Aufruf; nur genau "true" schaltet ein.
   C. Client: src/speicher.js (lies) setzt den Merker allein aus der Antwort
      des Servers (`schichtmodellWirkung: true`), sonst aus.
   F. schichtfolgeAm: AUS oder Betriebsmodell = der bisherige Ausdruck des
      Aufrufers; AN mit eigenem Modell = Modell; Lücke/Klärung = kein Dienst.
   A. Aktionen: setzeAbweichung (plan.js), mehrfachDienst (begleitung.js).
   U. urlaubskonto, P. planVergleich (fachlogik.js).
   E. Ersatzvorschlag: Lücke/Klärung weder „in der Dienstphase“ noch
      „hätte regulär frei“ (Review #429 Hinweis 3).
   S. Schutzrechnung-Auslöser: geänderte Modelle/Zuordnungen lösen mit AN
      die mittelbare Nachrechnung aus, mit AUS wie bisher nicht.
   H. Anzeige je Einheit (Aushang, Monatsplan, Lagebild): AUS byte-gleich;
      AN mit eigenen Modellen ein Hinweis (nie stilles Betriebsmodell, Q5).
   K. Zwischenspeicher des Modellverzeichnisses (Review #429 Hinweis 2).

   Der Schalter wird nur in der Prüfung gesetzt (afterEach: wieder AUS).
   Aufruf: npx vitest run pruefungen/imp6-verdrahtung.test.js --maxWorkers=1 --testTimeout=60000
   ========================================================================== */
// zeit-ok: Feste Kalendertage als Zeichenketten; Ansichten mit fester Uhr (Fake-Timer, nur Date).
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const kopie = (x) => JSON.parse(JSON.stringify(x));
const tagNach = (s, n) => { const [y, m, d] = s.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const tageVon = (von, bis) => { const aus = []; for (let d = von; d <= bis; d = tagNach(d, 1)) aus.push(d); return aus; };
const quelle = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

let FP, KERN, SD, F, AUSH, aktionenPlan, aktionenBegleitung;
beforeAll(async () => {
  FP = await import("../server/lib/fachpruefung.mjs");
  KERN = await import("../server/lib/schichtmodell-kern.mjs");
  SD = await import("../server/lib/schutzdurchsetzung.mjs");
  F = await import("../src/lib/fachlogik.js");
  AUSH = await import("../src/lib/aushang.js");
  ({ aktionenPlan } = await import("../src/app/aktionen/plan.js"));
  ({ aktionenBegleitung } = await import("../src/app/aktionen/begleitung.js"));
}, 240000);
afterEach(() => { if (FP) FP.schichtmodellWirkungSetzen(false); });
const an = () => FP.schichtmodellWirkungSetzen(true);
const aus = () => FP.schichtmodellWirkungSetzen(false);

/* ------------------------------------------------------------------------
   Kleiner Betrieb: Schichtfolge F S N frei, zwei Einheiten; Modelle Früh, Nacht, FSN.
   a1: Betriebsmodell bis 09.11.2027, Früh 10.–20.11., Lücke 21.–24.11., Nacht ab 25.11.
   a2: ohne Feld (implizit Betriebsmodell). a3: Überschneidung (nur über alte Sicherung speicherbar).
   ------------------------------------------------------------------------ */
const DA = [
  { id: "F", name: "Früh", kurz: "F", start: "06:00", ende: "14:00", farbe: "#2f6fdf", mindest: { mo_do: 1, fr: 1, sa: 1, so: 1 } },
  { id: "S", name: "Spät", kurz: "S", start: "14:00", ende: "22:00", farbe: "#c77d12", mindest: { mo_do: 1, fr: 1, sa: 1, so: 1 } },
  { id: "N", name: "Nacht", kurz: "N", start: "22:00", ende: "06:00", farbe: "#6b4fd8", mindest: { mo_do: 1, fr: 1, sa: 1, so: 1 } },
];
const zu = (id, modellId, gueltigAb, gueltigBis = null, versatz) => ({ id, modellId, gueltigAb, gueltigBis, ...(versatz === undefined ? {} : { versatz }) });
const person = (id, zuordnungen, extra = {}) => ({ id, vorname: "V", nachname: id, eintritt: "2020-01-01", wochenstunden: 40, status: "aktiv",
  rolle: "mitarbeiter", qualifikationen: [], qualNachweise: [], urlaubsanspruch: 30,
  zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }], ...(zuordnungen ? { schichtmodellZuordnungen: zuordnungen } : {}), ...extra });
const A1 = () => [zu("a", "betrieb", null, "2027-11-09"), zu("b", "frueh1", "2027-11-10", "2027-11-20", 0), zu("c", "nacht1", "2027-11-25", null, 0)];
const A3 = () => [zu("x", "frueh1", "2027-11-01", null, 0), zu("y", "nacht1", "2027-11-15", null, 0)];
const betrieb = (personen, extra = {}) => ({
  id: "b1", name: "Testbetrieb", bundesland: "HE", dienstarten: kopie(DA), qualifikationen: [], einspruenge: [],
  schichtmodelle: [{ id: "frueh1", name: "Früh", tage: ["F"] }, { id: "nacht1", name: "Nacht", tage: ["N"] },
    { id: "fsn", name: "FSN frei", tage: ["F", "F", "S", "S", "N", "N", "-", "-"] }],
  zyklus: { tage: ["F", "S", "N", "-"], wochen: 1 }, anker: "2026-01-05",
  einheiten: [{ id: "e1", name: "E1", versatzTage: 0, versatz: 0 }, { id: "e2", name: "E2", versatzTage: 1, versatz: 0 }],
  personen, abweichungen: {}, abwesenheiten: [], einstellungen: { ruhezeit: 11 }, freigaben: {}, planstaende: {}, aenderungen: [], ...extra,
});
const standard = () => betrieb([person("a1", A1()), person("a2", null), person("a3", A3())]);
/** Ohne jedes Modell und jede Zuordnung: der Stand vor IMP-6. */
const ohneModelle = (m) => { const n = kopie(m); delete n.schichtmodelle; n.personen = n.personen.map(({ schichtmodellZuordnungen: _w, ...p }) => p); return n; }; // eslint-disable-line no-unused-vars

/* ======================================================================== */
describe("W. Server-Einstieg: die Quelle der Planwirkung ist CENTRIC_SCHICHTMODELL_WIRKUNG", () => {
  it("W1 schichtmodellWirkungVerbinden liest die Umgebung bei jedem Aufruf; nur genau „true“ schaltet ein", async () => {
    const W = await import("../server/lib/schichtmodell-wirkung.mjs");
    const vorher = process.env.CENTRIC_SCHICHTMODELL_WIRKUNG;
    try {
      W.schichtmodellWirkungVerbinden();
      for (const w of [undefined, "", "1", "TRUE", "yes", " true", "true ", "an"]) {
        if (w === undefined) delete process.env.CENTRIC_SCHICHTMODELL_WIRKUNG; else process.env.CENTRIC_SCHICHTMODELL_WIRKUNG = w;
        expect(FP.schichtmodellWirkungAktiv(), String(w)).toBe(false);
      }
      process.env.CENTRIC_SCHICHTMODELL_WIRKUNG = "true";
      expect(FP.schichtmodellWirkungAktiv()).toBe(true);
      delete process.env.CENTRIC_SCHICHTMODELL_WIRKUNG;
      expect(FP.schichtmodellWirkungAktiv()).toBe(false);                   // ohne Neustart wieder aus
    } finally {
      if (vorher === undefined) delete process.env.CENTRIC_SCHICHTMODELL_WIRKUNG; else process.env.CENTRIC_SCHICHTMODELL_WIRKUNG = vorher;
    }
  });
  it("W2 Server-Prozess und Datenweg binden den Einstieg ein (Quelltext); der Einstieg selbst setzt nur die Quelle", () => {
    expect(quelle("../server.mjs")).toMatch(/import "\.\/server\/lib\/schichtmodell-wirkung\.mjs";/);
    expect(quelle("../server/funktionen/daten.mjs")).toMatch(/import "\.\.\/lib\/schichtmodell-wirkung\.mjs";/);
    const q = quelle("../server/lib/schichtmodell-wirkung.mjs");
    expect(q).toContain("schichtmodellWirkungSetzen(schichtmodellWirkungAn)");
    expect(q).not.toMatch(/schichtmodellWirkungSetzen\(\s*true/);           // nie fest eingeschaltet
  });
  it("W3 Vorgabe bleibt AUS: .env.example nur auskommentiert, kein Workflow setzt den Schalter", () => {
    const env = quelle("../.env.example");
    expect(env).toMatch(/^#\s*CENTRIC_SCHICHTMODELL_WIRKUNG=/m);
    expect(env).not.toMatch(/^CENTRIC_SCHICHTMODELL_WIRKUNG=/m);
    for (const w of ["pruefung.yml", "deploy.yml", "betrieb-deploy.yml"]) {
      let q = ""; try { q = quelle(`../.github/workflows/${w}`); } catch { continue; }
      expect(q, w).not.toMatch(/CENTRIC_SCHICHTMODELL_WIRKUNG/);
    }
  });
});

/* ======================================================================== */
describe("C. Client: der Merker kommt allein aus der Antwort des Servers", () => {
  const speicherAttrappe = (vorab = {}) => { const s = new Map(Object.entries(vorab)); return { getItem: (k) => (s.has(k) ? s.get(k) : null),
    setItem: (k, v) => s.set(k, String(v)), removeItem: (k) => s.delete(k), clear: () => s.clear() }; };
  afterAll(() => { vi.unstubAllGlobals(); });
  async function gelesen(zusatz) {
    vi.resetModules();
    vi.stubGlobal("sessionStorage", speicherAttrappe({ "centric:token": "t-pruefung" }));
    vi.stubGlobal("localStorage", speicherAttrappe());
    const m = standard();
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ bestand: { version: 9, mandanten: [m] }, etag: "1", rolle: "leitung",
      person: "a2", betrieb: 0, name: "L", schreiben: "voll", ...zusatz }), { status: 200, headers: { "content-type": "application/json" } }));
    const SP = await import("../src/speicher.js");
    const FP2 = await import("../server/lib/fachpruefung.mjs");
    FP2.schichtmodellWirkungSetzen(zusatz.schichtmodellWirkung !== true);   // Gegenteil vorbelegen: lies() muss setzen
    const r = await SP.lies();
    const aktiv = FP2.schichtmodellWirkungAktiv();
    FP2.schichtmodellWirkungSetzen(false);
    return { aktiv, r, m };
  }
  it("C1 GET mit schichtmodellWirkung: true → an; ohne Angabe oder anderer Wert → aus (fail-closed)", async () => {
    expect((await gelesen({ schichtmodellWirkung: true })).aktiv).toBe(true);
    expect((await gelesen({})).aktiv).toBe(false);
    for (const w of ["true", 1, {}, null]) expect((await gelesen({ schichtmodellWirkung: w })).aktiv, String(w)).toBe(false);
  });
  it("C2 der Merker ändert den gelesenen Bestand nicht (keine stille Migration)", async () => {
    const { r, m } = await gelesen({ schichtmodellWirkung: true });
    expect(r.bestand.mandanten[0]).toEqual(m);
  });
});

/* ======================================================================== */
describe("F. schichtfolgeAm: eine Stelle für die rohe Schichtfolge der Aktionen und Auswertungen", () => {
  const ALT = "ALT";
  it("F1 AUS: immer der bisherige Ausdruck des Aufrufers, auch mit eigenen Modellen, Lücken, Überschneidungen", () => {
    const m = standard();
    for (const p of m.personen) for (const d of tageVon("2027-11-01", "2027-11-30")) expect(FP.schichtfolgeAm(m, p, d, () => ALT)).toBe(ALT);
  });
  it("F2 AN: Betriebsmodell (implizit oder ausdrücklich), Springer und nicht im Schichtdienst → bisheriger Ausdruck (AN = AUS)", () => {
    const m = betrieb([person("a1", A1()), person("a2", null), person("sp", [zu("s", "frueh1", "2027-11-01", null, 0)], { springer: true }),
      person("ns", [zu("s", "frueh1", "2027-11-01", null, 0)], { imSchichtdienst: false })]);
    an();
    for (const d of tageVon("2027-11-01", "2027-11-09")) expect(FP.schichtfolgeAm(m, m.personen[0], d, () => ALT), d).toBe(ALT);
    for (const p of m.personen.slice(1)) for (const d of tageVon("2027-11-01", "2027-11-30")) expect(FP.schichtfolgeAm(m, p, d, () => ALT), `${p.id} ${d}`).toBe(ALT);
  });
  it("F3 AN: eigenes Modell → Zyklustag des Modells; Lücke, Überschneidung, ungültig → kein Dienst (nie das Betriebsmodell)", () => {
    const m = betrieb([person("a1", A1()), person("a3", A3()), person("u", [zu("u", "gibtsnicht", "2027-11-01", null, 0)])]);
    an();
    for (const d of tageVon("2027-11-10", "2027-11-20")) expect(FP.schichtfolgeAm(m, m.personen[0], d, () => ALT), d).toBe("F");
    for (const d of tageVon("2027-11-21", "2027-11-24")) expect(FP.schichtfolgeAm(m, m.personen[0], d, () => ALT), d).toBe(null);
    for (const d of tageVon("2027-11-25", "2027-11-30")) expect(FP.schichtfolgeAm(m, m.personen[0], d, () => ALT), d).toBe("N");
    expect(FP.schichtfolgeAm(m, m.personen[1], "2027-11-20", () => ALT)).toBe(null);          // uneindeutig
    expect(FP.schichtfolgeAm(m, m.personen[2], "2027-11-05", () => ALT)).toBe(null);          // ungültig
  });
});

/* ======================================================================== */
describe("A. Aktionen: setzeAbweichung (plan.js) und mehrfachDienst (begleitung.js)", () => {
  const mitAktionen = (fabrik, m) => {
    const st = { m, meldungen: [] };
    const k = new Proxy({
      mUpd: (fn) => { st.m = fn(st.m); }, melde: (t) => { st.meldungen.push(t); },
      sitz: { person: { id: "l1", vorname: "L", nachname: "L", rolle: "leitung", bereich: "ALLE" } }, ref: { current: null },
    }, { get: (z, key) => (key in z ? z[key] : () => {}) });
    return { akt: fabrik(k), st };
  };
  /** Ein Tag im Früh-Abschnitt von a1, an dem die Folge der Einheit e1 NICHT Früh ist. */
  const tagOhneFrueh = () => tageVon("2027-11-10", "2027-11-20").find((d) => FP.einheitDienst(standard(), "e1", d) !== "F");
  const kurz = (st) => ({ ab: st.m.abweichungen, aend: st.m.aenderungen.map((x) => [x.personId, x.datum, x.von, x.nach]) });

  it("A1 AUS: wie bisher — Plan ist die Folge der Einheit; Früh am Modell-Tag ist eine Abweichung", () => {
    const d = tagOhneFrueh(), folge = FP.einheitDienst(standard(), "e1", d);
    aus();
    const x = mitAktionen(aktionenPlan, standard());
    x.akt.setzeAbweichung("a1", d, "F");
    expect(kurz(x.st)).toEqual({ ab: { [`a1|${d}`]: "F" }, aend: [["a1", d, folge || "-", "F"]] });
    const y = mitAktionen(aktionenPlan, standard());
    y.akt.setzeAbweichung("a1", d, folge || "-");
    expect(kurz(y.st)).toEqual({ ab: {}, aend: [] });
  });
  it("A2 AN: Plan ist das Modell — Früh am Modell-Tag ist keine Abweichung; die Folge der Einheit ist eine", () => {
    const d = tagOhneFrueh(), folge = FP.einheitDienst(standard(), "e1", d);
    an();
    const x = mitAktionen(aktionenPlan, standard());
    x.akt.setzeAbweichung("a1", d, "F");
    expect(kurz(x.st)).toEqual({ ab: {}, aend: [] });
    const y = mitAktionen(aktionenPlan, standard());
    y.akt.setzeAbweichung("a1", d, folge || "-");
    expect(kurz(y.st)).toEqual({ ab: { [`a1|${d}`]: folge || "-" }, aend: [["a1", d, "F", folge || "-"]] });
  });
  it("A3 AN Lücke (Q5): „frei“ ist der Plan, keine Abweichung; ein Dienst wird Abweichung von „-“", () => {
    an();
    const x = mitAktionen(aktionenPlan, standard());
    x.akt.setzeAbweichung("a1", "2027-11-22", "-");
    expect(kurz(x.st)).toEqual({ ab: {}, aend: [] });
    x.akt.setzeAbweichung("a1", "2027-11-22", "S");
    expect(kurz(x.st)).toEqual({ ab: { "a1|2027-11-22": "S" }, aend: [["a1", "2027-11-22", "-", "S"]] });
  });
  it("A4 Differenz: ohne eigenes Modell (a2) und vor dem ersten Wechsel rechnen AN und AUS gleich — beide Aktionen", () => {
    const lauf = (w, f) => { FP.schichtmodellWirkungSetzen(w); const x = mitAktionen(f === "plan" ? aktionenPlan : aktionenBegleitung, standard());
      if (f === "plan") for (const d of tageVon("2027-11-01", "2027-11-09")) { x.akt.setzeAbweichung("a2", d, "F"); x.akt.setzeAbweichung("a1", d, "S"); }
      else x.akt.mehrfachDienst(["a2"], "2027-11-01", "2027-11-30", "N");
      const r = kurz(x.st); aus(); return JSON.stringify(r); };
    for (const f of ["plan", "begleitung"]) expect(lauf(true, f), f).toBe(lauf(false, f));
  });
  it("A5 mehrfachDienst: AUS wie bisher (Folge der Einheit), AN nach dem Modell — Lücke als frei, Früh-Tage ohne Abweichung", () => {
    const ergebnis = (w) => { FP.schichtmodellWirkungSetzen(w); const x = mitAktionen(aktionenBegleitung, standard());
      x.akt.mehrfachDienst(["a1"], "2027-11-10", "2027-11-24", "F"); aus(); return x.st; };
    const mitAus = ergebnis(false), mitAn = ergebnis(true);
    /* AUS: Abweichung an jedem Tag, an dem die Einheit nicht Früh hat */
    const nichtF = tageVon("2027-11-10", "2027-11-24").filter((d) => FP.einheitDienst(standard(), "e1", d) !== "F");
    expect(Object.keys(mitAus.m.abweichungen).sort()).toEqual(nichtF.map((d) => `a1|${d}`));
    /* AN: Früh-Abschnitt ist schon Früh, nur die Lücke (21.–24.) bekommt eine Abweichung, von „-“ */
    expect(Object.keys(mitAn.m.abweichungen).sort()).toEqual(tageVon("2027-11-21", "2027-11-24").map((d) => `a1|${d}`));
    expect(mitAn.m.aenderungen.every((x) => x.von === "-" && x.nach === "F")).toBe(true);
  });
});

/* ======================================================================== */
describe("U/P. Urlaubskonto und Änderungen gegenüber der Freigabe (fachlogik.js)", () => {
  const mitUrlaub = () => { const m = standard(); m.abwesenheiten = [{ id: "u1", personId: "a1", art: "urlaub", von: "2027-11-05", bis: "2027-11-30" },
    { id: "u2", personId: "a2", art: "urlaub", von: "2027-11-05", bis: "2027-11-30" }]; return m; };
  const konto = (w, pid) => { FP.schichtmodellWirkungSetzen(w); const m = mitUrlaub(); const r = F.urlaubskonto(m, m.personen.find((p) => p.id === pid), 2027); aus(); return r; };
  it("U1 AUS: Urlaubstage = Tage mit Dienst der Einheit (wie bisher, unabhängig von Modellen)", () => {
    const m = mitUrlaub();
    const erwartet = tageVon("2027-11-05", "2027-11-30").filter((d) => FP.einheitDienst(m, "e1", d)).length;
    expect(konto(false, "a1").genommen).toBe(erwartet);
    expect(konto(false, "a1")).toEqual((() => { const o = ohneModelle(mitUrlaub()); return F.urlaubskonto(o, o.personen[0], 2027); })());
  });
  it("U2 AN: Urlaubstage nach dem Modell — Betriebsmodell bis 09.11., Früh-Abschnitt jeder Tag, Lücke keiner, Nacht jeder Tag", () => {
    const m = mitUrlaub();
    const erwartet = tageVon("2027-11-05", "2027-11-09").filter((d) => FP.einheitDienst(m, "e1", d)).length + 11 + 0 + 6;
    expect(konto(true, "a1").genommen).toBe(erwartet);
    expect(konto(true, "a2")).toEqual(konto(false, "a2"));                   // ohne eigenes Modell: AN = AUS
  });
  const vergleich = (w) => {
    FP.schichtmodellWirkungSetzen(w);
    const m = standard();
    m.planstaende = { "2027-11": {} };                                       // freigegeben ohne Abweichungen
    m.freigaben = { "2027-11": { zeit: "x" } };
    const d = tageVon("2027-11-10", "2027-11-20").find((t) => FP.einheitDienst(m, "e1", t) === "S");
    m.abweichungen = { [`a1|${d}`]: "S", [`a2|${d}`]: "N" };
    const r = F.planVergleich(m, "2027-11");
    aus();
    return { d, zeilen: r.zeilen.map((z) => [z.person.id, z.datum, z.von, z.nach, z.richtung]) };
  };
  it("P1 AUS: wie bisher — eine Abweichung gleich der Folge der Einheit ist keine Änderung", () => {
    const { d, zeilen } = vergleich(false);
    expect(zeilen).toEqual([["a2", d, "Spät", "Nacht", "wechsel"]]);
  });
  it("P2 AN: Vergleich gegen das Modell — Früh (Modell) → Spät ist eine Änderung; a2 unverändert wie AUS", () => {
    const { d, zeilen } = vergleich(true);
    expect(zeilen).toEqual([["a1", d, "Früh", "Spät", "wechsel"], ["a2", d, "Spät", "Nacht", "wechsel"]]);
  });
});

/* ======================================================================== */
describe("E. Ersatzvorschlag an Tagen ohne eindeutiges Modell (Review #429 Hinweis 3)", () => {
  const gruende = (w, m, d, pid) => { FP.schichtmodellWirkungSetzen(w); const r = F.ersatzVorschlaege(kopie(m), d, "S"); aus();
    return (r.find((x) => x.person.id === pid) || { gruende: [] }).gruende; };
  it("E1 AN, Lücke (Q5): „kein Schichtmodell an diesem Tag“, weder „in der Dienstphase“ noch „hätte regulär frei“", () => {
    const g = gruende(true, standard(), "2027-11-22", "a1");
    expect(g).toContain("kein Schichtmodell an diesem Tag");
    expect(g).not.toContain("in der Dienstphase");
    expect(g).not.toContain("hätte regulär frei");
  });
  it("E2 AN, Überschneidung: „Schichtmodell unklar (Klärung)“", () => {
    const m = standard(); m.abweichungen = { "a3|2027-11-20": "-" };     // a3 frei gestellt, damit sie Kandidat ist
    const g = gruende(true, m, "2027-11-20", "a3");
    expect(g).toContain("Schichtmodell unklar (Klärung)");
    expect(g.some((x) => x === "in der Dienstphase" || x === "hätte regulär frei")).toBe(false);
  });
  it("E3 AUS unverändert; AN ohne eigenes Modell (a2) wie AUS", () => {
    const m = standard(); m.abweichungen = { "a1|2027-11-22": "-", "a2|2027-11-22": "-" };   // beide frei: Kandidaten
    const d = "2027-11-22";
    expect(gruende(false, m, d, "a1").some((x) => x === "in der Dienstphase" || x === "hätte regulär frei")).toBe(true);
    expect(gruende(true, m, d, "a2")).toEqual(gruende(false, m, d, "a2"));
  });
});

/* ======================================================================== */
describe("S. Auslöser der Schutzrechnung bei geänderten Modellen und Zuordnungen", () => {
  it("S1 nur Modelldefinitionen geändert: AUS keine Strukturänderung (wie bisher), AN eine", () => {
    const alt = standard(), neu = kopie(alt);
    neu.schichtmodelle[0].tage = ["S"];
    aus(); expect(SD.strukturAenderung(alt, neu)).toBe(false);
    an(); expect(SD.strukturAenderung(alt, neu)).toBe(true);
  });
  it("S2 nur Zuordnungen einer Person geändert: AUS keine Strukturänderung, AN eine; unverändert in beiden keine", () => {
    const alt = standard(), neu = kopie(alt);
    neu.personen[0].schichtmodellZuordnungen[2] = zu("c", "fsn", "2027-11-25", null, 3);
    aus(); expect(SD.strukturAenderung(alt, neu)).toBe(false);
    an(); expect(SD.strukturAenderung(alt, neu)).toBe(true);
    expect(SD.strukturAenderung(alt, kopie(alt))).toBe(false);
  });
  it("S3 neuer Zuordnungswechsel Nacht → Früh ergibt Ruhezeit unter 11 h: AN sperrt (§ 5 ArbZG), AUS rechnet wie bisher nichts", () => {
    const p = person("a1", [zu("f", "frueh1", "2027-06-10", null, 0)]);
    const alt = betrieb([p], { zyklus: { tage: ["-"], wochen: 1 } });
    const neu = kopie(alt);
    neu.personen[0].schichtmodellZuordnungen = [zu("n", "nacht1", "2027-06-10", "2027-06-14", 0), zu("f", "frueh1", "2027-06-15", null, 0)];
    an();
    const mit = SD.fachpruefungUebermittlung(alt, neu, "2027-06-01");
    expect(mit && mit.sperre).toMatch(/2027-06-1[45].*Ruhezeit unter 11 Stunden/);
    aus();
    expect(SD.fachpruefungUebermittlung(alt, neu, "2027-06-01")).toBeNull();
  });
  it("S4 der Auslöser nennt die Felder nicht selbst: schutzdurchsetzung.mjs fragt schichtmodellPlanfelder() (eine Stelle)", () => {
    const q = quelle("../server/lib/schutzdurchsetzung.mjs");
    expect(q).toMatch(/schichtmodellPlanfelder\(\)/);
    aus(); expect(FP.schichtmodellPlanfelder()).toEqual({ betrieb: [], person: [] });
    an(); expect(FP.schichtmodellPlanfelder()).toEqual({ betrieb: ["schichtmodelle"], person: ["schichtmodellZuordnungen"] });
  });
});

/* ======================================================================== */
describe("H. Anzeige je Einheit: Aushang, Monatsplan, Lagebild", () => {
  const HINWEIS = /mit eigenem Schichtmodell/;
  const aushang = (w, m) => { FP.schichtmodellWirkungSetzen(w); const r = AUSH.aushangHtml({ m, e: m.einheiten[0], ym2: "2027-11", einheitId: "e1",
    fg: { stand: "1", zeit: "fest" } }); aus(); return r; };
  it("H1 Aushang: AUS mit Modellen byte-gleich zum Stand ohne Modelle; AN ohne eigene Modelle ebenso", () => {
    const ohne = aushang(false, ohneModelle(standard()));
    expect(aushang(false, standard())).toBe(ohne);
    expect(aushang(true, betrieb([person("a2", null), person("b", [zu("b", "betrieb", null, null)])]))).toBe(aushang(false, ohneModelle(standard())));
    expect(ohne).not.toMatch(HINWEIS);
  });
  it("H2 Aushang AN mit eigenen Modellen: Folge der Einheit bleibt, dazu ein Hinweis mit der Zahl der Personen (keine Namen)", () => {
    const html = aushang(true, standard());
    expect(html).toMatch(/2 Personen mit eigenem Schichtmodell/);           // a1 (Früh/Lücke/Nacht), a3 (Überschneidung)
    expect(html).toContain("Schichtfolge des Betriebs");
    expect(html).not.toMatch(/>a1<|>a3</);
    expect(html.replace(/<div class="hinweis"[^>]*>[^<]*<\/div>\n?/, "")).toBe(aushang(false, standard()));
  });
  it("H3 abweichendVomBetriebsmodell: AUS 0 ohne Rechnung; AN zählt Personen der Einheit mit eigenem Modell, Lücke oder Klärung", () => {
    const m = standard();
    const tage = tageVon("2027-11-01", "2027-11-30");
    expect(FP.abweichendVomBetriebsmodell(m, "e1", tage)).toBe(0);
    an();
    expect(FP.abweichendVomBetriebsmodell(m, "e1", tage)).toBe(2);
    expect(FP.abweichendVomBetriebsmodell(m, "e1", tageVon("2027-11-01", "2027-11-09"))).toBe(1);   // nur a3 (Früh ab 01.11.)
    expect(FP.abweichendVomBetriebsmodell(m, "e2", tage)).toBe(0);
  });

  describe("Monatsplan und Lagebild (gerendert)", () => {
    /* Eigene Modulinstanz der Planrechnung: Abschnitt C setzt die Module zurück (vi.resetModules); die Ansichten und
       der hier gesetzte Merker müssen dieselbe Instanz von fachpruefung.mjs sehen. */
    let A, FPn, V = {};
    beforeAll(async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2027-11-17T10:00:00.000Z"));
      FPn = await import("../server/lib/fachpruefung.mjs");
      A = await import("../src/App.jsx");
      ({ Monatsplan: V.Monatsplan } = await import("../src/ansichten/monatsplan.jsx"));
      ({ Lagebild: V.Lagebild } = await import("../src/ansichten/lagebild.jsx"));
    }, 240000);
    afterAll(() => { vi.useRealTimers(); });
    const akt = new Proxy({}, { get: () => () => {} });
    /** Betrieb wie die Oberfläche ihn anlegt; die erste Person der ersten Einheit trägt ein eigenes Modell. */
    const app = (mitModell) => {
      const m = A.leererMandant("Verdrahtung", "pflege");
      const e = m.einheiten[0].id;
      m.personen = ["leitung", "planer", "mitarbeiter"].map((rolle, i) => ({ ...A.zugangsPerson(rolle, e, i + 1), id: rolle, vorname: "T", nachname: rolle }));
      if (mitModell) {
        const da = m.dienstarten.filter((d) => !d.posten).map((d) => d.id);
        m.schichtmodelle = [{ id: "eigen", name: "Eigen", tage: [da[1] || da[0], "-"] }];
        m.personen[2].schichtmodellZuordnungen = [zu("z", "eigen", "2027-11-01", null, 0)];
      }
      return m;
    };
    const sitzFuer = (m) => ({ rolle: "kunde", db: { mandanten: [m], session: { mandantId: m.id, personId: "leitung", rolle: "leitung" } },
      mandant: m, person: m.personen[0] });
    const zeig = (w, m, ansicht) => { FPn.schichtmodellWirkungSetzen(w); const zu0 = () => {};
      try {
        return renderToStaticMarkup(ansicht === "monat" ? h(V.Monatsplan, { sitz: sitzFuer(m), ym: "2027-11", setYm: zu0, oeffneTag: zu0, akt })
          : h(V.Lagebild, { sitz: sitzFuer(m), akt, oeffneTag: zu0 }));
      } finally { FPn.schichtmodellWirkungSetzen(false); } };
    for (const ansicht of ["monat", "lage"]) {
      it(`H4 ${ansicht === "monat" ? "Monatsplan" : "Lagebild"}: AUS mit Modellen byte-gleich; AN ohne eigene Modelle byte-gleich; AN mit eigenem Modell Hinweis`, () => {
        const ohne = zeig(false, app(false), ansicht);
        expect(zeig(false, app(true), ansicht)).toBe(ohne);
        expect(zeig(true, app(false), ansicht)).toBe(ohne);
        expect(ohne).not.toMatch(HINWEIS);
        expect(zeig(true, app(true), ansicht)).toMatch(/1 Person mit eigenem Schichtmodell/);
      }, 120000);
    }
  });
});

/* ======================================================================== */
describe("K. Zwischenspeicher des Modellverzeichnisses (Review #429 Hinweis 2)", () => {
  it("K1 derselbe Bestand: ein Verzeichnis für viele Aufrufe; das exportierte modellVerzeichnis bleibt eine frische Karte", () => {
    const m = standard();
    expect(KERN.modellVerzeichnisGemerkt(m)).toBe(KERN.modellVerzeichnisGemerkt(m));
    expect(KERN.modellVerzeichnis(m)).not.toBe(KERN.modellVerzeichnis(m));
    expect([...KERN.modellVerzeichnisGemerkt(m).keys()]).toEqual([...KERN.modellVerzeichnis(m).keys()]);
  });
  it("K2 jede Änderung der Liste oder eines Eintrags (auch an Ort und Stelle) rechnet neu — nie ein veralteter Stand", () => {
    const m = standard();
    const p = person("x", [zu("z", "frueh1", "2027-11-01", null, 0)]);
    const lage = () => FP.schichtmodellLageAm(m, p, "2027-11-05");
    expect(lage().dienstId).toBe("F");
    m.schichtmodelle[0].tage = ["S"];                                         // an Ort und Stelle: neues Feld tage
    expect(lage().dienstId).toBe("S");
    m.schichtmodelle[0].tage.splice(0, 1, "N");                               // an Ort und Stelle: Inhalt der Folge
    expect(lage().dienstId).toBe("N");
    m.schichtmodelle[0].id = "anders";                                        // Kennung geändert
    expect(lage().art).toBe("ungueltig");
    m.schichtmodelle.push({ id: "frueh1", name: "neu", tage: ["F", "-"] });   // Liste wächst
    expect(lage().dienstId).toBe("F");
    m.schichtmodelle = [{ id: "frueh1", name: "neu", tage: ["S"] }];          // neue Liste
    expect(lage().dienstId).toBe("S");
    m.schichtmodelle = [];
    expect(lage().art).toBe("ungueltig");
  });
  it("K3 Gleichheit mit dem ungespeicherten Weg: 2000 Zufallsabfragen", () => {
    const m = standard();
    let s = 7; const z = () => (s = (s * 48271) % 2147483647) / 2147483647;
    for (let i = 0; i < 2000; i++) {
      const p = m.personen[Math.floor(z() * 3)], d = tagNach("2027-10-20", Math.floor(z() * 60));
      const r = KERN.anzuwendendesModell(m, p, d);
      if (r.art !== "modell" || r.quelle !== "zuordnung") continue;
      const tage = KERN.modellVerzeichnis(m).get(r.modellId).tage;
      expect(KERN.modellLage(m, r, d).tage).toEqual(tage);
    }
  });
});
