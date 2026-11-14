/* ==========================================================================
   ABNAHME V4, A-3 — Leitungscode ohne Person zeigt nicht den Vorführ-Rollenwähler

   Befund: Ein Leitungscode OHNE Person in einem Betrieb, der Personen, aber
   keine aktive Leitungsperson hat, landete auf dem Rollenwähler der
   Vorführfassung („Vorführfassung — du bist bereits angemeldet", „Zur
   Betreiberkonsole", „Als Planer anmelden …"), obwohl der Zugang kein
   Demozugang ist. Ursache in der Oberfläche: ohne passende Person keine
   Sitzung → App.jsx rendert `Anmeldung`, und die ist für einen Bestand ohne
   Sitzung der Rollenwähler. Serverseitig keine Rechteausweitung (das Token
   bleibt „leitung"); der Server bleibt unverändert.

   Regel (src/app/zugangssitzung.js):
   - Code ohne Person, Personen vorhanden, keine aktive der Rolle → klare
     Meldung (Ladefehler-Bildschirm), keine Sitzung, keine Person angelegt,
     auch keine im Bestand mitgebrachte fremde Sitzung.
   - Betrieb ganz ohne Personen → die Oberfläche legt KEINE Person mehr an
     (auch nicht im Arbeitsspeicher). Die erste Leitungsperson legt seit
     2026-11-13 der Server an, nur für einen Erstanmeldecode
     (server/lib/erstleitung.mjs, pruefungen/erstleitung.test.js); die
     Anmeldung meldet ihre Kennung, die Oberfläche löst sie nur auf.
   - Demozugang, Altrolle „kunde", Betreiber, personengebundene Codes →
     unverändert.

   Geprüft wird die echte Auflösung und das, was React tatsächlich rendert
   (Ladefehlerseite, Anmeldung) — ohne Browser.

   Aufruf: npx vitest run pruefungen/leitungscode-ohne-person.test.js
   ========================================================================== */
import { describe, it, expect, beforeAll } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { sitzungAusZugang, OHNE_PERSON_TITEL } from "../src/app/zugangssitzung.js";
import { Ladefehlerseite } from "../src/ansichten/ladefehler.jsx";
import { imDienst } from "../server/lib/fachpruefung.mjs";
import { ROLLENBEZEICHNUNG } from "../src/lib/rollen.js";

const HEUTE = "2026-11-13";
const text = (el) => renderToStaticMarkup(el).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const kopie = (x) => JSON.parse(JSON.stringify(x));
const VORFUEHRUNG = ["Vorführfassung", "Zur Betreiberkonsole", "Sicht einer Rolle im Betrieb"];

let Anmeldung;
beforeAll(async () => { ({ Anmeldung } = await import("../src/ansichten/anmeldung.jsx")); }, 120000);

const person = (id, rolle, extra = {}) => ({ id, vorname: "V", nachname: `N${id}`, rolle, bereich: "ALLE", status: "aktiv",
  qualifikationen: [], eintritt: "2020-01-01", austritt: null, zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }], ...extra });
const bestand = (personen, extra = {}) => ({ version: 9, stand: 3, mandanten: [{ id: "m1", name: "Haus Linde", status: "aktiv",
  einheiten: [{ id: "e1", name: "WB 1" }], dienstarten: [], einstellungen: {}, personen, ...extra }] });
const OHNE_LEITUNG = () => bestand([person("p1", "planer"), person("m0", "mitarbeiter")]);
/* Der Server meldet für den Betrieb das strenge Regime (GET /api/bestand, erstleitungStreng; server/lib/erstleitung.mjs).
   Ohne diese Meldung gilt der bisherige Ablauf — siehe „nicht streng“ unten. */
const LEITUNG = { rolle: "leitung", person: null, betrieb: 0, demo: false, erstleitungStreng: true };

describe("A-3: Code ohne Person, Personen da, keine aktive Person der Rolle", () => {
  const faelle = [
    ["keine Leitungsperson", OHNE_LEITUNG],
    ["einzige Leitung ausgeschieden", () => bestand([person("l1", "leitung", { austritt: "2026-01-31" }), person("m0", "mitarbeiter")])],
    ["einzige Leitung inaktiv", () => bestand([person("l1", "leitung", { status: "inaktiv" }), person("m0", "mitarbeiter")])],
    ["einzige Leitung tritt erst später ein", () => bestand([person("l1", "leitung", { eintritt: "2027-01-01" }), person("m0", "mitarbeiter")])],
  ];
  it.each(faelle)("%s: Meldung, keine Sitzung, keine Person angelegt, Bestand sonst unverändert", (_n, bau) => {
    const b = bau();
    const vorher = kopie(b);
    const r = sitzungAusZugang(b, LEITUNG, HEUTE);
    expect(r.fehler).toBeTruthy();
    expect(r.fehler.titel).toBe(OHNE_PERSON_TITEL);
    expect(r.fehler.text).toContain("Haus Linde");
    expect(r.fehler.text).toMatch(/Betreiber oder die Verwaltung/);
    expect(r.bestand.session).toBeNull();
    expect(r.bestand.mandanten).toEqual(vorher.mandanten);
    expect(b).toEqual(vorher);
  });
  it("gilt für jede Rolle eines Codes ohne Person (z. B. Planung ohne Planungsperson)", () => {
    const r = sitzungAusZugang(bestand([person("l1", "leitung"), person("m0", "mitarbeiter")]), { ...LEITUNG, rolle: "planer" }, HEUTE);
    expect(r.fehler && r.fehler.titel).toBe(OHNE_PERSON_TITEL);
    expect(r.bestand.session).toBeNull();
  });
  it("eine im Bestand mitgebrachte Sitzung einer anderen Person wird nicht übernommen", () => {
    const b = { ...OHNE_LEITUNG(), session: { rolle: "kunde", mandantId: "m1", personId: "p1" } };
    const r = sitzungAusZugang(b, LEITUNG, HEUTE);
    expect(r.bestand.session).toBeNull();
    expect(r.fehler).toBeTruthy();
  });
  it("gerendert: klare Meldung mit Abmelden — kein Rollenwähler, keine Betreiberkonsole, kein Rollenwechsel", () => {
    const r = sitzungAusZugang(OHNE_LEITUNG(), LEITUNG, HEUTE);
    const t = text(h(Ladefehlerseite, { ladefehler: r.fehler, onNeuLaden: () => {}, onDemoAnlegen: () => {}, onAbmelden: () => {} }));
    expect(t).toContain(OHNE_PERSON_TITEL);
    expect(t).toContain("Abmelden");
    for (const v of [...VORFUEHRUNG, "Als Planer", "anmelden …", "Demo-Bestand anlegen", "Neu laden"]) expect(t).not.toContain(v);
    expect(renderToStaticMarkup(h(Ladefehlerseite, { ladefehler: r.fehler, onAbmelden: () => {} }))).toContain('role="alert"');
  });
  it("Gegenprobe: ohne Meldung rendert dieselbe Lage den Rollenwähler der Vorführfassung (der Befund)", () => {
    const db = { ...OHNE_LEITUNG(), session: null };
    const t = text(h(Anmeldung, { db, onLogin: () => {} }));
    for (const v of VORFUEHRUNG) expect(t).toContain(v);
  });
  it("App.jsx: der Ladefehler-Bildschirm hat Vorrang vor der Anmeldung (ohne Sitzung)", () => {
    const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
    const fehler = app.indexOf("if (ladefehler) {");
    const anm = app.indexOf("if (!db.session) return");
    expect(fehler).toBeGreaterThan(0);
    expect(anm).toBeGreaterThan(fehler);
    expect(app).toMatch(/const aufgeloest = sitzungAusZugang\(b, zugang\);[\s\S]{0,120}if \(aufgeloest\.fehler\) setLadefehler\(aufgeloest\.fehler\);/);
  });
});

describe("A-3: unverändert", () => {
  it("leerer Betrieb: die Oberfläche legt keine Person an — Meldung statt Rollenwähler (jede Rolle, auch Leitung)", () => {
    for (const rolle of ["leitung", "planer", "betriebsrat"]) {
      const b = bestand([], { seit: "2026-11-01", kontakt: "l@example.org" });
      const vorher = kopie(b);
      const r = sitzungAusZugang(b, { ...LEITUNG, rolle }, HEUTE);
      expect(r.fehler && r.fehler.titel, rolle).toBe(OHNE_PERSON_TITEL);
      expect(r.bestand.mandanten[0].personen).toEqual([]);
      expect(r.bestand.session).toBeNull();
      expect(b).toEqual(vorher);
    }
  });
  it("erste Anmeldung der Leitung im leeren Betrieb: die vom Server angelegte Person wird über zugang.person aufgelöst", () => {
    /* So kommt der Bestand nach der Erstanmeldung an: Person vom Server angelegt, Code an sie gebunden. */
    const b = bestand([person("p_abc1234", "leitung", { vorname: "", nachname: "Organisationsleitung" })]);
    const r = sitzungAusZugang(b, { ...LEITUNG, person: "p_abc1234" }, HEUTE);
    expect(r.fehler).toBeNull();
    expect(r.bestand.session).toEqual({ rolle: "kunde", mandantId: "m1", personId: "p_abc1234" });
    expect(r.bestand.mandanten).toEqual(b.mandanten);
  });
  it("Quelltext: im strengen Ablauf hat die Oberfläche keinen Weg, eine Person aus dem Zugang anzulegen", () => {
    const q = readFileSync(new URL("../src/app/zugangssitzung.js", import.meta.url), "utf8");
    const streng = q.slice(q.indexOf("export function sitzungAusZugang"));
    expect(streng.length).toBeGreaterThan(200);
    expect(streng).not.toMatch(/uid\(|personen: \[p\]|erstePerson\(|neueId/);
    /* Und nur bei ausdrücklichem „streng“ des Servers — alles andere geht in den bisherigen Ablauf. */
    expect(streng).toMatch(/if \(zugang\.erstleitungStreng !== true\) return sitzungAltweg\(b, zugang, tag\);/);
  });
  it("aktive Leitung vorhanden: Code ohne Person meldet die erste aktive Leitung an", () => {
    const b = bestand([person("l0", "leitung", { austritt: "2026-01-31" }), person("l1", "leitung"), person("m0", "mitarbeiter")]);
    const r = sitzungAusZugang(b, LEITUNG, HEUTE);
    expect(r.fehler).toBeNull();
    expect(r.bestand.session).toEqual({ rolle: "kunde", mandantId: "m1", personId: "l1" });
    expect(r.bestand.mandanten).toEqual(b.mandanten);
  });
  it("personengebundener Code: Kennung, dann Index; unbekannte Person → bisherige Meldung, nie eine andere Person", () => {
    const b = bestand([person("l1", "leitung"), person("m0", "mitarbeiter")]);
    const MA = { rolle: "mitarbeiter", erstleitungStreng: true };
    expect(sitzungAusZugang(b, { ...MA, person: "m0" }, HEUTE).bestand.session.personId).toBe("m0");
    expect(sitzungAusZugang(b, { ...MA, person: 1 }, HEUTE).bestand.session.personId).toBe("m0");
    const weg = sitzungAusZugang(b, { ...MA, person: "x9" }, HEUTE);
    expect(weg.fehler).toMatch(/gehört zu einer Person, die es in „Haus Linde" nicht mehr gibt/);
    expect(weg.bestand.session).toBeNull();
  });
  it("Demozugang und Altrolle „kunde“: Bestand unverändert, der Rollenwähler bleibt (Vorführfassung)", () => {
    for (const zugang of [{ ...LEITUNG, demo: true }, { rolle: "kunde" }, null]) {
      const b = OHNE_LEITUNG();
      const r = sitzungAusZugang(b, zugang, HEUTE);
      expect(r.bestand).toBe(b);
      expect(r.fehler).toBeNull();
      const t = text(h(Anmeldung, { db: r.bestand, onLogin: () => {} }));
      for (const v of VORFUEHRUNG) expect(t, JSON.stringify(zugang)).toContain(v);
    }
  });
  it("Betreiber: Sitzung der Betreiberkonsole, keine Meldung", () => {
    const r = sitzungAusZugang(OHNE_LEITUNG(), { rolle: "betreiber" }, HEUTE);
    expect(r.bestand.session).toEqual({ rolle: "betreiber" });
    expect(r.fehler).toBeNull();
  });
});

/* --------------------------------------------------------------------------
   Delta-Review e8b9b93d, Punkt 3: Meldet der Server NICHT „streng“ (Bestandsbetrieb bei ausgeschaltetem
   CENTRIC_ERSTLEITUNG_STRENG, oder die Angabe fehlt), bleibt die Oberfläche beim bisherigen Ablauf. Referenz ist der
   Ablauf, wie er auf integration/release-v4 inline in src/App.jsx stand (hier wörtlich nachgebildet; nur
   `setLadefehler` → Rückgabe und `uid` → feste Kennung). Einzige gewollte Abweichung: E-Mail (Betreiberentscheidung
   2026-11-13) — die angelegte Person übernimmt `mand.kontakt` nicht.
   -------------------------------------------------------------------------- */
function referenzAltweg(b, zugang, heute, uid) {
  let ladefehler = null;
  const setLadefehler = (x) => { ladefehler = x; };
  if (zugang && zugang.rolle && zugang.rolle !== "kunde" && zugang.demo !== true) {
    if (zugang.rolle === "betreiber") b = { ...b, session: { rolle: "betreiber" } };
    else {
      const mand = b.mandanten[zugang.betrieb || 0] || b.mandanten[0];
      if (mand) {
        const kand = mand.personen.filter((p) => p.rolle === zugang.rolle && imDienst(p, heute()));
        let p = null;
        if (zugang.person == null) p = kand[0];
        else {
          p = mand.personen.find((x) => x.id === zugang.person)
            || (Number.isInteger(zugang.person) ? mand.personen[zugang.person] : null)
            || null;
          if (!p && mand.personen.length)
            setLadefehler(`Der Zugangscode gehört zu einer Person, die es in „${mand.name}" nicht mehr gibt. `
              + "Bitte einen neuen Code ausstellen lassen.");
        }
        if (!p && !mand.personen.length) {
          const ersteEinheit = (mand.einheiten || [])[0];
          p = {
            id: uid("p"), vorname: "",
            nachname: ROLLENBEZEICHNUNG[zugang.rolle] || "Leitung",
            funktion: ROLLENBEZEICHNUNG[zugang.rolle] || "Leitung",
            email: mand.kontakt || "",
            zugehoerigkeit: ersteEinheit ? [{ ab: mand.seit || heute(), einheitId: ersteEinheit.id }] : [],
            eintritt: mand.seit || heute(), austritt: null,
            wochenstunden: (mand.einstellungen || {}).wochenstunden || 40,
            urlaubsanspruch: (mand.einstellungen || {}).urlaubsanspruch || 30,
            urlaubsuebertrag: 0, stundenuebertrag: 0, qualifikationen: [], teilzeit: null, springer: false,
            einschraenkungen: {}, rolle: zugang.rolle, rolleSeit: heute(), rolleVerlauf: [],
            bereich: "ALLE", status: "aktiv", imSchichtdienst: false,
          };
          const mitPerson = { ...mand, personen: [p] };
          b = { ...b, mandanten: b.mandanten.map((x) => x.id === mand.id ? mitPerson : x) };
        }
        if (p) b = { ...b, session: { rolle: "kunde", mandantId: mand.id, personId: p.id } };
      }
    }
  }
  return { bestand: b, fehler: ladefehler };
}

describe("nicht streng (Bestandsbetrieb, Schalter aus): bisheriger Ablauf der Oberfläche", () => {
  const ohneStreng = (z) => { const { erstleitungStreng: _x, ...rest } = z; void _x; return rest; };
  const lagen = () => [
    ["leerer Betrieb (Z1)", bestand([], { seit: "2026-11-01", kontakt: "kontakt@example.org", einstellungen: { wochenstunden: 39 } })],
    ["keine Leitungsperson", OHNE_LEITUNG()],
    ["Leitung ausgeschieden", bestand([person("l1", "leitung", { austritt: "2026-01-31" }), person("m0", "mitarbeiter")])],
    ["Leitung inaktiv (Z2: aktivePerson-Filter gilt hier nicht)", bestand([person("l1", "leitung", { status: "inaktiv" }), person("m0", "mitarbeiter")])],
    ["aktive Leitung", bestand([person("l0", "leitung", { austritt: "2026-01-31" }), person("l1", "leitung")])],
    ["mitgebrachte Sitzung", { ...OHNE_LEITUNG(), session: { rolle: "kunde", mandantId: "m1", personId: "p1" } }],
  ];
  const zugaenge = [
    ["Leitung ohne Person", { rolle: "leitung", person: null, betrieb: 0, demo: false }],
    ["Leitung, Angabe „streng: false“", { rolle: "leitung", person: null, betrieb: 0, demo: false, erstleitungStreng: false }],
    ["Planung ohne Person", { rolle: "planer", person: null, betrieb: 0 }],
    ["Betriebsrat ohne Person", { rolle: "betriebsrat", person: null, betrieb: 0 }],
    ["personengebunden (Kennung)", { rolle: "mitarbeiter", person: "m0" }],
    ["personengebunden (Index)", { rolle: "mitarbeiter", person: 1 }],
    ["personengebunden, unbekannt", { rolle: "mitarbeiter", person: "x9" }],
    ["Demozugang", { rolle: "leitung", person: null, demo: true }],
    ["Altrolle kunde", { rolle: "kunde" }],
    ["Betreiber", { rolle: "betreiber" }],
  ];
  for (const [zn, z] of zugaenge) {
    it(`${zn}: wie bisher in jeder Lage`, () => {
      for (const [ln, b] of lagen()) {
        const vorher = kopie(b);
        const neu = sitzungAusZugang(kopie(b), z, HEUTE);
        const ref = referenzAltweg(kopie(b), ohneStreng(z), () => HEUTE, () => "p_fest01");
        /* Die neu angelegte Person bekommt eine Zufallskennung — sie ist die einzige Stelle, an der sich die Fälle
           unterscheiden dürfen; vereinheitlicht wird sie über die Sitzung. */
        const pid = neu.bestand.session && neu.bestand.session.personId;
        const neuGleich = JSON.parse(JSON.stringify(neu).replaceAll(pid && pid.startsWith("p_") && !b.mandanten[0].personen.some((p) => p.id === pid) ? pid : "\u0000", "p_fest01"));
        /* E-Mail: einzige gewollte Abweichung. */
        const refOhneKontakt = JSON.parse(JSON.stringify(ref).replaceAll("kontakt@example.org\",\"zugehoerigkeit", "\",\"zugehoerigkeit"));
        expect(neuGleich, `${zn} / ${ln}`).toEqual(refOhneKontakt);
        expect(b, ln).toEqual(vorher);
      }
    });
  }
  it("leerer Betrieb, Schalter aus: die Oberfläche legt wie bisher die erste Person an (kein Aussperren) — ohne Kontaktadresse", () => {
    const b = bestand([], { seit: "2026-11-01", kontakt: "kontakt@example.org" });
    const r = sitzungAusZugang(b, { rolle: "leitung", person: null, betrieb: 0, demo: false }, HEUTE);
    expect(r.fehler).toBeNull();
    expect(r.bestand.mandanten[0].personen).toHaveLength(1);
    expect(r.bestand.mandanten[0].personen[0]).toMatchObject({ rolle: "leitung", bereich: "ALLE", email: "", eintritt: "2026-11-01" });
    expect(r.bestand.session).toEqual({ rolle: "kunde", mandantId: "m1", personId: r.bestand.mandanten[0].personen[0].id });
    /* Dieselbe Lage, Server meldet streng: Meldung, keine Person. */
    const s = sitzungAusZugang(b, { rolle: "leitung", person: null, betrieb: 0, demo: false, erstleitungStreng: true }, HEUTE);
    expect(s.fehler && s.fehler.titel).toBe(OHNE_PERSON_TITEL);
    expect(s.bestand.mandanten[0].personen).toEqual([]);
  });
  it("speicher.js übernimmt die Angabe des Servers nur als ausdrückliches true", () => {
    const q = readFileSync(new URL("../src/speicher.js", import.meta.url), "utf8");
    expect(q).toMatch(/erstleitungStreng: daten\.erstleitungStreng === true/);
  });
});
