/* ==========================================================================
   WP-I7 Teil 6, Stufe B — Anheften (Vorlage PR #595, Betreiberentscheidungen 26./27.11.)

   1. Lesen: Karte `angeheftet` streng; unlesbar = alles gesperrt (fail closed), nie still weggelassen.
   2. Wirkung: Planer, Verbessern und planeMonat setzen an angehefteten Tagen nichts und ändern Angeheftetes nie (auch nicht über
      Posten); Zufallsvergleich gegen eine naive Referenz (Dienst jeder angehefteten Person-Tag vorher = nachher, keine eigene
      Einteilung darauf); mit und ohne Aggregate dasselbe; unlesbare Karte: Planer „ungueltig“, Ersatzsuche niemand.
   3. Schreibweg (anheftenZusammen, zusammenfuehren): Rechte wie Planungsrechte (Leitung, Planung; nicht Demo, nicht SV/BR/MA/Kunde),
      Stempel vom Server, nur eingetragene Einteilungen, manuelle Änderung hebt NUR die betroffene Anheftung auf (Vermerk + Protokoll
      ohne Person|Tag), veraltete Kopie heftet nicht neu an, Grenzen (Karte, Modulprotokoll), SV ändert Angeheftetes nicht, Sicht.

   Aufruf: TZ=UTC npx vitest run pruefungen/intelligence-anheften.test.js
   ========================================================================== */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { planeVorschlag, nachpruefen } from "../server/lib/engine/planer.mjs";
import { anheftungenLesen, anheftungSperrt, ANGEHEFTET_GRENZE } from "../server/lib/engine/anheften.mjs";
import { anheftenZusammen, ANHEFTEN_PROTOKOLL } from "../server/lib/anheften.mjs";
import { ersatzVorschlaege } from "../server/lib/engine/einsatz.mjs";
import { neuesVorgabenBudget } from "../server/lib/vorgabenwirkung.mjs";
import { zusammenfuehren, bestandFuerRolle } from "../server/lib/rechte.mjs";
import { modulProtokollZeilen, moduleinstellungenSicht, MODULPROTOKOLL_GRENZE } from "../server/lib/branchenmodule.mjs";
import { raeumen } from "../server/lib/aufbewahrung.mjs";
import { baueLeerenBetrieb } from "../server/lib/leerbetrieb.mjs";
import { anheftungenImMonat } from "../src/ansichten/anheftungen.jsx";
import { FEST, zufall, betriebe } from "./engine-golden.fixture.mjs";

const add = (t, n) => { const x = new Date(`${t}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };   // zeit-ok: reine Datumsrechnung
const YM = "2026-12";
const TAGE = []; for (let t = "2026-12-01"; t <= "2026-12-31"; t = add(t, 1)) TAGE.push(t);
const T0 = "2026-11-27T10:00:00.000Z";
const ST = { am: T0, vonRolle: "leitung" };

let F, B;
beforeAll(async () => {
  vi.useFakeTimers({ now: new Date(FEST), toFake: ["Date"] });   // zeit-ok: feste Uhr der Prüfung
  vi.spyOn(Math, "random").mockImplementation(zufall(20261127));
  F = await import("../src/lib/fachlogik.js");
  B = betriebe(F);
}, 120000);
afterAll(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

/** Kleiner Betrieb: n Personen, Frühdienst je Tag `bedarf` Personen. */
const klein = (n = 4, bedarf = 1) => {
  const m = baueLeerenBetrieb({ name: "T", branche: "pflege", email: "x@example.org", land: "HE", raum: "r" }).mandanten[0];
  m.personen = Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, vorname: "A", nachname: `B${i + 1}`, eintritt: "2020-01-01",
    zugehoerigkeit: [{ einheitId: m.einheiten[0].id, ab: "2020-01-01" }], wochenstunden: 40, status: "aktiv", qualifikationen: [] }));
  m.dienstarten = m.dienstarten.map((d) => (d.id === "F" ? { ...d, mindest: { mo_do: bedarf, fr: bedarf, sa: bedarf, so: bedarf } } : d));
  return m;
};
/** Demobetrieb mit Lücken (alle Nachtdienste im Dezember frei, wie planer-kern). */
const mitLuecken = (name) => {
  const m = structuredClone(B.find(([n]) => n.startsWith(name))[1]);
  m.personen.forEach((p) => { for (const t of TAGE) if (F.personTag(m, p, t).dienstId === "N") m.abweichungen[`${p.id}|${t}`] = "-"; });
  return structuredClone(m);
};
/** Naive Referenz: an jedem angehefteten Person-Tag derselbe Dienst wie vorher, derselbe Eintrag, keine eigene Einteilung. */
const referenzFehler = (m, r) => {
  const f = [];
  const nachher = { ...m, abweichungen: r.abweichungen };
  for (const k of Object.keys(m.angeheftet || {})) {
    const [pid, d] = [k.slice(0, k.lastIndexOf("|")), k.slice(k.lastIndexOf("|") + 1)];
    const p = m.personen.find((x) => String(x.id) === pid);
    if (r.abweichungen[k] !== m.abweichungen[k]) f.push(`${k}: Eintrag geändert`);
    if (r.gesetzt.some((g) => `${g.personId}|${g.datum}` === k)) f.push(`${k}: eigene Einteilung`);
    if (p && (F.personTag(nachher, p, d).dienstId || null) !== (F.personTag(m, p, d).dienstId || null)) f.push(`${k}: Dienst geändert`);
  }
  return f;
};

describe("1. Lesen (fail closed)", () => {
  it("fehlend = nichts angeheftet; gültige Karte; jede Unlesbarkeit sperrt alles", () => {
    expect(anheftungenLesen({}).ok).toBe(true);
    expect(anheftSperrtNie({})).toBe(true);
    const l = anheftungenLesen({ angeheftet: { "p1|2026-12-01": ST, "p2|2026-12-02": { ...ST, aufgehobenAm: T0, aufgehobenVonRolle: "planer" } } });
    expect(l.ok && [...l.aktiv]).toEqual(["p1|2026-12-01"]);
    expect(l.ok && [...l.aufgehoben]).toEqual(["p2|2026-12-02"]);
    expect(anheftungSperrt(l, "p1", "2026-12-01")).toBe(true);
    expect(anheftungSperrt(l, "p2", "2026-12-02"), "aufgehoben sperrt nicht").toBe(false);
    const viele = Object.fromEntries(Array.from({ length: ANGEHEFTET_GRENZE.eintraege + 1 }, (_, i) => [`p${i}|2026-12-01`, ST]));
    for (const [name, k] of [["Text", "x"], ["Liste", []], ["null", null], ["Zahl", 3], ["Schlüssel ohne Tag", { p1: ST }], ["Tag ungültig", { "p1|2026-1-1": ST }],
      ["Eintrag kein Objekt", { "p1|2026-12-01": true }], ["ohne Stempel", { "p1|2026-12-01": {} }], ["halb aufgehoben", { "p1|2026-12-01": { ...ST, aufgehobenAm: T0 } }],
      ["zu viele", viele]]) {
      const x = anheftungenLesen({ angeheftet: k });
      expect(x.ok, name).toBe(false);
      expect(anheftungSperrt(x, "beliebig", "2026-12-09"), name).toBe(true);
    }
  });
});
/** Ohne Karte sperrt kein Tag. */
function anheftSperrtNie(m) { const l = anheftungenLesen(m); return TAGE.every((d) => !anheftungSperrt(l, "p1", d)); }

describe("2. Wirkung auf Planer, Verbessern, planeMonat", () => {
  it("angeheftet „frei“ bleibt frei, angeheftete Dienste bleiben; Nachprüfung lehnt eine eigene Einteilung an einem angehefteten Tag ab", () => {
    const m = klein(1, 1);
    /* p1 (einzige Person) am 1.–3.12. frei, danach angeheftet */
    for (const d of ["2026-12-01", "2026-12-02", "2026-12-03"]) { m.abweichungen[`p1|${d}`] = "-"; }
    const ohne = planeVorschlag(m, YM, { freigabe: true, zuege: 0, maxProPerson: 31 });
    expect(ohne.gesetzt.some((g) => g.personId === "p1" && g.datum === "2026-12-02"), "ohne Anheften setzt der Planer p1").toBe(true);
    m.angeheftet = { "p1|2026-12-01": ST, "p1|2026-12-02": ST, "p1|2026-12-03": ST };
    for (const zuege of [0, 50]) {
      const r = planeVorschlag(m, YM, { freigabe: true, zuege, startwert: 7, maxProPerson: 31 });
      expect(r.status).toBe("ok");
      expect(referenzFehler(m, r), `zuege ${zuege}`).toEqual([]);
      expect(r.angeheftet).toBe(3);
      expect(r.offen.some((x) => x.datum === "2026-12-02"), "Stelle bleibt offen statt Angeheftetes zu ändern").toBe(true);
    }
    /* Nachprüfung: eine eigene Einteilung an einem angehefteten Tag besteht nie. */
    const stand = { ...m, abweichungen: { ...m.abweichungen, "p1|2026-12-02": "F" } };
    expect(nachpruefen(m, stand, [{ personId: "p1", datum: "2026-12-02", dienstId: "F" }], neuesVorgabenBudget()).durch).toBe(false);
    /* Ersatzsuche: angeheftete Person nicht möglich, mit Grund. */
    const e = ersatzVorschlaege(m, "2026-12-02", "F", null).find((x) => x.person.id === "p1");
    expect(e.moeglich).toBe(false);
    expect(e.hindernisse).toContain("Einteilung an diesem Tag angeheftet");
    /* planeMonat (Planungsassistent) ebenso. */
    const pm = F.planeMonat(m, YM);
    expect(pm.gesetzt.filter((g) => m.angeheftet[`${g.personId}|${g.datum}`])).toEqual([]);
  }, 300000);

  it("unlesbare Karte: Planer rechnet nicht (ungueltig), Ersatzsuche und planeMonat setzen niemanden", () => {
    const m = klein(3, 1);
    for (const kaputt of ["x", [], { "p1|2026-12-01": {} }]) {
      const k = { ...m, angeheftet: kaputt };
      const r = planeVorschlag(k, YM, { freigabe: true });
      expect([r.status, r.gesetzt.length], JSON.stringify(kaputt)).toEqual(["ungueltig", 0]);
      expect(r.grund).toContain("Anheftungen nicht lesbar");
      expect(ersatzVorschlaege(k, "2026-12-05", "F", null).filter((x) => x.moeglich)).toEqual([]);
      expect(F.planeMonat(k, YM).gesetzt).toEqual([]);
    }
  }, 300000);

  it("Zufallsvergleich gegen die naive Referenz (kleine Betriebe, 12 Startwerte, begrenzt): Planer verändert nie Angeheftetes", () => {
    let geprueft = 0, angeheftet = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const rnd = zufall(9000 + seed);
      const m = klein(3 + (seed % 3), 1 + (seed % 2));
      m.angeheftet = {};
      for (const p of m.personen) for (const d of TAGE) {
        const x = rnd();
        if (x < 0.15) { m.abweichungen[`${p.id}|${d}`] = "-"; if (rnd() < 0.6) m.angeheftet[`${p.id}|${d}`] = ST; }
        else if (x < 0.2) { m.abweichungen[`${p.id}|${d}`] = "F"; if (rnd() < 0.6) m.angeheftet[`${p.id}|${d}`] = ST; }
      }
      angeheftet += Object.keys(m.angeheftet).length;
      for (const aggregate of [false, true]) {
        const r = planeVorschlag(m, YM, { freigabe: true, zuege: 30, startwert: seed, aggregate });
        expect(r.status, `seed ${seed}`).toBe("ok");
        expect(referenzFehler(m, r), `seed ${seed} aggregate ${aggregate}`).toEqual([]);
        geprueft++;
      }
      /* mit und ohne Aggregate dasselbe Ergebnis (Angeheftetes steht im Bestand, keine veralteten Aggregate) */
      const a = planeVorschlag(m, YM, { freigabe: true, zuege: 30, startwert: seed, aggregate: true });
      const b = planeVorschlag(m, YM, { freigabe: true, zuege: 30, startwert: seed, aggregate: false });
      expect(a.abweichungen, `seed ${seed}`).toEqual(b.abweichungen);
    }
    expect(geprueft).toBe(24);
    expect(angeheftet).toBeGreaterThan(50);
  }, 600000);

  it("Demobetriebe mit Posten/Lücken (2 Betriebe, je 1 Lauf): Referenz hält, auch über Verdrängung", () => {
    let n = 0;
    for (const name of ["demo1", "demo2"]) {
      if (!B.some(([x]) => x.startsWith(name))) continue;
      const m = mitLuecken(name);
      const rnd = zufall(4711 + n);
      m.angeheftet = {};
      for (const k of Object.keys(m.abweichungen).filter((k) => k.slice(-10, -3) === YM)) if (rnd() < 0.3) m.angeheftet[k] = ST;
      const r = planeVorschlag(m, YM, { freigabe: true, zuege: 20, startwert: 3 });
      expect(["ok", "nachpruefung"], name).toContain(r.status);
      expect(referenzFehler(m, r), name).toEqual([]);
      n++;
    }
    expect(n, "beide Demobetriebe geprüft").toBe(2);
  }, 600000);
});

describe("3. Schreibweg und Sicht", () => {
  const person = (id, rolle, extra = {}) => ({ id, vorname: `V${id}`, nachname: `N${id}`, rolle, bereich: "e1", status: "aktiv",
    zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }], ...extra });
  const betrieb = () => ({ id: "m1", name: "Haus", einheiten: [{ id: "e1", name: "WB" }], dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00" }],
    personen: [person("a1", "mitarbeiter"), person("s1", "subplaner"), person("r1", "betriebsrat"), person("p1", "planer"), person("l1", "leitung")],
    abweichungen: { "a1|2026-12-01": "F", "a1|2026-12-02": "-", "p1|2026-12-01": "F" }, einstellungen: {}, abwesenheiten: [], erfassung: {}, einstempeln: {},
    anfragen: [], aenderungen: [], nachrichten: [] });
  const bestand = (m = betrieb()) => ({ version: 9, stand: 1, mandanten: [m] });
  const SITZ = {
    leitung: { rolle: "leitung", person: "l1", betrieb: 0, mandantId: "m1" }, planer: { rolle: "planer", person: "p1", betrieb: 0, mandantId: "m1" },
    kunde: { rolle: "kunde", person: null, betrieb: 0, mandantId: "m1" }, subplaner: { rolle: "subplaner", person: "s1", betrieb: 0, mandantId: "m1" },
    mitarbeiter: { rolle: "mitarbeiter", person: "a1", betrieb: 0, mandantId: "m1" }, betriebsrat: { rolle: "betriebsrat", person: "r1", betrieb: 0, mandantId: "m1" },
    leitungDemo: { rolle: "leitung", person: "l1", betrieb: 0, mandantId: "m1", demo: true },
  };
  const schreibe = (k, aendere, alt = bestand()) => {
    const neu = structuredClone(alt); aendere(neu.mandanten[0]);
    const e = zusammenfuehren(alt, neu, SITZ[k]);
    if (!e || e.verweigert) return { abgewiesen: true, grund: e && e.verweigert, bestand: alt, m: alt.mandanten[0] };
    return { abgewiesen: false, bestand: e, m: e.mandanten[0] };
  };
  const anheften = (...k) => (m) => { m.angeheftet = { ...(m.angeheftet || {}), ...Object.fromEntries(k.map((x) => [x, {}])) }; };
  const prot = (m) => ((m.einstellungen && m.einstellungen.modulprotokoll) || []).filter((x) => x.modul === "anheften");

  it("Leitung und Planung heften an (Stempel vom Server, Protokoll ohne Person|Tag); andere Rollen und Demo wirkungslos", () => {
    for (const k of ["leitung", "planer"]) {
      const r = schreibe(k, (m) => { m.angeheftet = { "a1|2026-12-01": { am: "gefälscht", vonRolle: "betreiber", vonPerson: "X" } }; });
      expect(r.abgewiesen, r.grund).toBe(false);
      expect(r.m.angeheftet).toEqual({ "a1|2026-12-01": { am: expect.any(String), vonRolle: k } });
      expect(r.m.angeheftet["a1|2026-12-01"].am).not.toBe("gefälscht");
      expect(prot(r.m).map((x) => [x.art, x.anzahl, x.von])).toEqual([[ANHEFTEN_PROTOKOLL.gesetzt, 1, k]]);
      expect(JSON.stringify(prot(r.m))).not.toMatch(/a1|2026-12-01/);
    }
    for (const k of ["kunde", "leitungDemo"]) {
      const r = schreibe(k, anheften("a1|2026-12-01"));
      expect(r.abgewiesen ? undefined : r.m.angeheftet, k).toBeUndefined();
    }
    for (const k of ["subplaner", "mitarbeiter", "betriebsrat"]) {
      const r = schreibe(k, anheften("a1|2026-12-01"));
      expect(r.abgewiesen ? undefined : r.m.angeheftet, k).toBeUndefined();
    }
  });

  it("nur eingetragene Einteilungen, nur Personen des Betriebs, gültige Schlüssel", () => {
    expect(schreibe("leitung", anheften("a1|2026-12-03")).grund).toContain("eingetragene Einteilung");
    expect(schreibe("leitung", (m) => { m.abweichungen["x9|2026-12-03"] = "F"; anheften("x9|2026-12-03")(m); }).grund).toBeTruthy();
    expect(schreibe("leitung", (m) => { m.angeheftet = { "a1-2026-12-01": {} }; }).grund).toContain("Schlüssel");
    expect(schreibe("leitung", (m) => { m.angeheftet = "alles"; }).grund).toContain("Anheften");
  });

  it("manuelle Änderung hebt NUR die betroffene Anheftung auf (Vermerk sichtbar, Protokoll); andere bleiben; veraltete Kopie heftet nicht neu an", () => {
    const a = schreibe("leitung", anheften("a1|2026-12-01", "a1|2026-12-02", "p1|2026-12-01"));
    expect(a.abgewiesen, a.grund).toBe(false);
    const stale = structuredClone(a.bestand.mandanten[0].angeheftet);
    const b = schreibe("planer", (m) => { m.abweichungen["a1|2026-12-02"] = "F"; }, a.bestand);
    expect(b.abgewiesen, b.grund).toBe(false);
    const k = b.m.angeheftet;
    expect(k["a1|2026-12-02"]).toMatchObject({ vonRolle: "leitung", aufgehobenVonRolle: "planer" });
    expect(k["a1|2026-12-01"]).toEqual(a.m.angeheftet["a1|2026-12-01"]);
    expect(k["p1|2026-12-01"]).toEqual(a.m.angeheftet["p1|2026-12-01"]);
    expect(prot(b.m).at(-1)).toMatchObject({ art: ANHEFTEN_PROTOKOLL.aufgehoben, anzahl: 1, von: "planer" });
    /* Eintrag entfernt (auch eine Änderung) */
    const c = schreibe("leitung", (m) => { delete m.abweichungen["a1|2026-12-01"]; }, b.bestand);
    expect(c.m.angeheftet["a1|2026-12-01"]).toHaveProperty("aufgehobenAm");
    expect(c.m.angeheftet["p1|2026-12-01"]).not.toHaveProperty("aufgehobenAm");
    /* Veraltete Kopie (alter aktiver Eintrag mit altem Stempel) heftet nicht neu an; ein frischer Eintrag schon. */
    const d = schreibe("leitung", (m) => { m.angeheftet = { ...m.angeheftet, "a1|2026-12-02": stale["a1|2026-12-02"] }; }, c.bestand);
    expect(d.m.angeheftet["a1|2026-12-02"]).toHaveProperty("aufgehobenAm");
    const e = schreibe("leitung", (m) => { m.angeheftet = { ...m.angeheftet, "a1|2026-12-02": {} }; }, d.bestand);
    expect(e.m.angeheftet["a1|2026-12-02"]).not.toHaveProperty("aufgehobenAm");
    /* Lösen: Eintrag nicht mehr mitgeschickt */
    const f = schreibe("leitung", (m) => { delete m.angeheftet["p1|2026-12-01"]; }, e.bestand);
    expect(f.m.angeheftet).not.toHaveProperty("p1|2026-12-01");
    expect(prot(f.m).at(-1)).toMatchObject({ art: ANHEFTEN_PROTOKOLL.geloest, anzahl: 1 });
    /* Betriebsprotokoll: Zahl und Rolle, kein Person|Tag */
    const z = modulProtokollZeilen(a.bestand, b.bestand);
    expect(z).toContain("Anheften: 1 Einteilung durch Änderung nicht mehr angeheftet (die Planung)");
    expect(z.join(" ")).not.toMatch(/a1|2026-12/);
    /* Sichtbar: Anzeige des Monats */
    const s = anheftungenImMonat(b.m, "2026-12");
    expect(s.aktiv.map((x) => x.schluessel)).toEqual(["a1|2026-12-01", "p1|2026-12-01"]);
    expect(s.aufgehoben.map((x) => [x.schluessel, x.rolle])).toEqual([["a1|2026-12-02", "Planung"]]);
    expect(anheftungenImMonat({ angeheftet: "x" }, "2026-12").unlesbar).toBe(true);
  });

  it("Schichtverantwortung: ändert Angeheftetes nicht, schreibt die Karte nicht, sieht sie nicht; Beschäftigte und Betriebsrat sehen sie nicht", () => {
    const a = schreibe("leitung", anheften("a1|2026-12-01"));
    const sv = schreibe("subplaner", (m) => { m.abweichungen["a1|2026-12-01"] = "-"; }, a.bestand);
    expect(sv.abgewiesen).toBe(true);
    expect(sv.grund).toContain("angeheftet");
    const sv2 = schreibe("subplaner", (m) => { m.abweichungen["a1|2026-12-05"] = "F"; }, a.bestand);
    expect(sv2.abgewiesen, sv2.grund).toBe(false);
    expect(sv2.m.angeheftet).toEqual(a.m.angeheftet);
    for (const k of ["subplaner", "mitarbeiter", "betriebsrat"]) {
      const g = bestandFuerRolle(a.bestand, SITZ[k]).mandanten[0];
      expect(g, k).not.toHaveProperty("angeheftet");
    }
    expect(bestandFuerRolle(a.bestand, SITZ.planer).mandanten[0].angeheftet).toEqual(a.m.angeheftet);
    const br = moduleinstellungenSicht(a.m.einstellungen, "betriebsrat");
    expect((br.modulprotokoll || []).filter((x) => x.modul === "anheften")).toEqual([]);
    /* Unlesbare Karte: SV-Änderungen gesperrt (fail closed). */
    const kaputt = structuredClone(a.bestand); kaputt.mandanten[0].angeheftet = "x";
    expect(schreibe("subplaner", (m) => { m.abweichungen["a1|2026-12-05"] = "F"; }, kaputt).grund).toContain("nicht lesbar");
  });

  it("Grenzen: Karte (Einträge) und Modulprotokoll — neues Anheften scheitert, Aufheben durch Änderung geht immer; neuer Betrieb ohne Karte", () => {
    const voll = betrieb();
    voll.angeheftet = {};
    for (let i = 0; i < ANGEHEFTET_GRENZE.eintraege; i++) { const k = `a1|${add("2020-01-01", i)}`; voll.abweichungen[k] = "F"; voll.angeheftet[k] = ST; }
    const r = anheftenZusammen(voll, { ...structuredClone(voll), angeheftet: { ...voll.angeheftet, "p1|2026-12-01": {} } }, SITZ.leitung, { jetzt: T0 });
    expect(r.grund).toContain(`höchstens ${ANGEHEFTET_GRENZE.eintraege}`);
    /* Modulprotokoll an der Grenze */
    const mp = betrieb();
    mp.einstellungen = { modulprotokoll: Array.from({ length: MODULPROTOKOLL_GRENZE }, (_, i) => ({ art: "parameter", modul: "posten", am: T0, von: `x${i}` })) };
    mp.angeheftet = { "a1|2026-12-01": ST };
    const neu = anheftenZusammen(mp, { ...structuredClone(mp), angeheftet: { ...mp.angeheftet, "p1|2026-12-01": {} } }, SITZ.leitung, { jetzt: T0 });
    expect(neu.grund).toContain("Modulprotokoll");
    const auf = anheftenZusammen(mp, { ...structuredClone(mp), abweichungen: { ...mp.abweichungen, "a1|2026-12-01": "-" } }, SITZ.planer, { jetzt: T0 });
    expect(auf.grund).toBeUndefined();
    expect(auf.mandant.angeheftet["a1|2026-12-01"]).toHaveProperty("aufgehobenAm", T0);
    /* Neuer Betrieb bringt keine Karte mit */
    const b0 = bestand();
    const nb = structuredClone(b0); nb.mandanten.push({ ...betrieb(), id: "m9", angeheftet: { "a1|2026-12-01": ST } });
    const e = zusammenfuehren(b0, nb, { rolle: "betreiber", person: null });
    expect(e && !e.verweigert, "Betreiber legt den Betrieb an").toBe(true);
    const m9 = e.mandanten.find((x) => x.id === "m9");
    expect(m9, "neuer Betrieb vorhanden").toBeTruthy();
    expect(m9).not.toHaveProperty("angeheftet");
    /* Review #602 C2: Lösen und Aufheben an der Kartengrenze gehen immer. */
    const loesen = anheftenZusammen(voll, { ...structuredClone(voll), angeheftet: Object.fromEntries(Object.entries(voll.angeheftet).slice(1)) }, SITZ.leitung, { jetzt: T0 });
    expect(loesen.grund).toBeUndefined();
    expect(Object.keys(loesen.mandant.angeheftet).length).toBe(ANGEHEFTET_GRENZE.eintraege - 1);
    const k0 = Object.keys(voll.angeheftet)[0];
    const aufheben = anheftenZusammen(voll, { ...structuredClone(voll), abweichungen: { ...voll.abweichungen, [k0]: "-" } }, SITZ.planer, { jetzt: T0 });
    expect(aufheben.grund).toBeUndefined();
    expect(aufheben.mandant.angeheftet[k0]).toHaveProperty("aufgehobenAm", T0);
  });

  it("Review #602 B-1: verwaiste Anheftung (Einteilung fehlt) sperrt nie das Speichern — wird als aufgehoben vermerkt; Datenschutzlauf kürzt die Karte", () => {
    /* Gegenbeispiel des Reviewers 1:1: Karte mit aktiver Anheftung ohne Abweichung, Leitung ändert nur den Namen. */
    const b = bestand(); b.mandanten[0].angeheftet = { "a1|2020-01-01": ST, "a1|2026-12-01": ST };
    for (const k of ["leitung", "planer", "kunde"]) {
      const r = schreibe(k, (m) => { m.name = "Haus neu"; }, b);
      expect(r.abgewiesen, `${k}: ${r.grund}`).toBe(false);
      expect(r.m.name).toBe("Haus neu");
      expect(r.m.angeheftet["a1|2020-01-01"]).toMatchObject({ aufgehobenAm: expect.any(String), aufgehobenVonRolle: "system" });
      expect(r.m.angeheftet["a1|2026-12-01"], "die andere bleibt").toEqual(ST);
      expect(prot(r.m).at(-1)).toMatchObject({ art: ANHEFTEN_PROTOKOLL.aufgehoben, anzahl: 1 });
    }
    /* Neu Anheften ohne Einteilung bleibt abgewiesen. */
    expect(schreibe("leitung", anheften("a1|2026-12-09"), b).grund).toContain("eingetragene Einteilung");
    /* Datenschutzlauf: raeumen entfernt Abweichung UND Anheftung jenseits der Plandatenfrist; danach speichert die Leitung. */
    const alt = betrieb(); alt.abweichungen["a1|2020-01-01"] = "F"; alt.angeheftet = { "a1|2020-01-01": ST, "a1|2026-12-01": ST };
    const { mandant } = raeumen(alt, "2026-11-27");
    expect(mandant.abweichungen).not.toHaveProperty("a1|2020-01-01");
    expect(mandant.angeheftet).toEqual({ "a1|2026-12-01": ST });
    expect(raeumen({ ...alt, angeheftet: "x" }, "2026-11-27").mandant.angeheftet, "unlesbar bleibt liegen").toBe("x");
    const nachLauf = schreibe("leitung", (m) => { m.name = "X"; }, bestand(mandant));
    expect(nachLauf.abgewiesen, nachLauf.grund).toBe(false);
  });

  it("Review #602 B-2: unlesbare Karte, unverändert zurückgeschickt, sperrt das Speichern nicht; Reparatur mit gültiger Zuordnung; unlesbarer Eintrag nie still neu angeheftet", () => {
    for (const kaputt of ["x", [], 3, { "a1|2026-12-01": {} }]) {
      const b = bestand(); b.mandanten[0].angeheftet = kaputt;
      for (const k of ["leitung", "planer"]) {
        const r = schreibe(k, (m) => { m.name = "Haus neu"; }, b);
        expect(r.abgewiesen, `${JSON.stringify(kaputt)} ${k}: ${r.grund}`).toBe(false);
        expect(r.m.angeheftet, "bleibt unlesbar").toEqual(kaputt);
        expect(anheftungenLesen(r.m).ok).toBe(false);
      }
      /* SV bleibt gesperrt, der Planer rechnet nicht (fail closed). */
      expect(schreibe("subplaner", (m) => { m.abweichungen["a1|2026-12-05"] = "F"; }, b).grund).toContain("nicht lesbar");
      /* Reparatur: gültige Zuordnung ersetzt die Karte. */
      const rep = schreibe("leitung", (m) => { m.angeheftet = { "a1|2026-12-01": {} }; }, b);
      if (JSON.stringify(kaputt) === JSON.stringify({ "a1|2026-12-01": {} })) {
        /* derselbe unlesbare Eintrag unverändert = kein Schreiben (Karte bleibt) — nie still neu angeheftet */
        expect(rep.abgewiesen).toBe(false);
        expect(rep.m.angeheftet).toEqual(kaputt);
        const mitNeu = schreibe("leitung", (m) => { m.angeheftet = { "a1|2026-12-01": {}, "p1|2026-12-01": {} }; }, b);
        expect(mitNeu.grund).toContain("nicht lesbar");
      } else {
        expect(rep.abgewiesen, rep.grund).toBe(false);
        expect(rep.m.angeheftet).toEqual({ "a1|2026-12-01": { am: expect.any(String), vonRolle: "leitung" } });
        expect(anheftungenLesen(rep.m).ok).toBe(true);
      }
    }
  });
});
