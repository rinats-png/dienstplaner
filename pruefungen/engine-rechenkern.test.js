/* ==========================================================================
   WP-I12 — RECHENKERN (server/lib/engine/*)

   Geprüft:
   - Verhaltensgleichheit: die Planrechnung nach der Extraktion rechnet auf dem leeren Betrieb
     (leerbetrieb.mjs) und den drei Demobetrieben genau wie die Fassung vor der Extraktion (Golden-Datei,
     erzeugt aus bda8b68); EINE Implementierung (fachlogik reicht nur weiter);
   - Rechenkern-Schnittstelle: benannte Fakten mit Herkunft, Determinismus, keine Mutation (tief eingefroren),
     Rollensicht (Kanarienfelder werden nie gelesen), Faktenquelle im Faktenpaket, Gegenrechnung, Haken im
     Ausgabeprüfer (P-10), Leistung;
   - Importregeln: reines ESM, nichts aus intelligence/, kein Dateizugriff, kein React/DOM.
   ========================================================================== */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { FEST, zufall, betriebe, messen, VON, BIS } from "./engine-golden.fixture.mjs";
import golden from "./fixtures/engine-golden.json" with { type: "json" };
import * as K from "../server/lib/engine/rechenkern.mjs";
import * as Plan from "../server/lib/engine/plan.mjs";
import * as Befunde from "../server/lib/engine/befunde.mjs";
import { mitTagesdatum, heute } from "../server/lib/engine/zeit.mjs";
import { faktenpaketBilden } from "../server/lib/intelligence/faktenpaket.mjs";
import { FELDER } from "../server/lib/intelligence/felder.mjs";
import { FUNKTIONEN } from "../server/lib/intelligence/positivliste.mjs";
import { ausgabePruefen } from "../server/lib/intelligence/gateway/pruefer.mjs";
import { sperrlisteBilden } from "../server/lib/intelligence/leckpruefung.mjs";
import { bestand as gatewayBestand } from "./intelligence-gateway-fixture.mjs";
import { bestandFuerRolle } from "../server/lib/rechte.mjs";

const lies = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const deepFreeze = (o) => { if (o && typeof o === "object" && !Object.isFrozen(o)) { Object.freeze(o); for (const k of Object.getOwnPropertyNames(o)) deepFreeze(o[k]); } return o; };
const sha = (x) => createHash("sha256").update(JSON.stringify(x)).digest("hex");

vi.setConfig({ testTimeout: 280000 });
let F;          // src/lib/fachlogik.js (heutige Fassung)
let B;          // Betriebe der Fixture
const demoName = () => B.find(([n]) => n.startsWith("demo1"))[0];
const demo = () => B.find(([n]) => n.startsWith("demo1"))[1];
beforeAll(async () => {
  vi.useFakeTimers({ now: new Date(FEST), toFake: ["Date"] });
  vi.spyOn(Math, "random").mockImplementation(zufall(20261106));
  F = await import("../src/lib/fachlogik.js");
  B = betriebe(F);
}, 120000);
afterAll(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

/* ------------------------------------------------------------------------ */
describe("Verhaltensgleichheit der Planrechnung (Golden aus bda8b68)", () => {
  it("leerer Betrieb und drei Demobetriebe: jede Messung gleich der alten Fassung", { timeout: 280000 }, () => {
    expect(B.map(([n]) => n)).toEqual(Object.keys(golden.betriebe));
    for (const [name, m] of B) expect(JSON.parse(JSON.stringify(messen(F, m))), name).toEqual(golden.betriebe[name]);
  });
  it("die Demobetriebe sind gefüllt (die Fixture prüft etwas): Personen, Befunde", () => {
    const g = golden.betriebe;
    const demos = Object.keys(g).filter((x) => x !== "leer");
    expect(demos.length).toBe(3);
    for (const n of demos) { expect(g[n].personen).toBeGreaterThan(10); expect(g[n].pruefen.anzahl).toBeGreaterThan(0); }
  });
  it("eine Implementierung: fachlogik reicht dieselben Funktionen weiter und definiert sie nicht neu", () => {
    for (const n of Object.keys(Plan)) if (typeof Plan[n] === "function" && n in F) expect(F[n], n).toBe(Plan[n]);
    expect(F.pruefen).toBe(Befunde.pruefen);
    expect(F.fachkraftLage).toBe(Befunde.fachkraftLage);
    const fl = lies("src/lib/fachlogik.js");
    for (const n of ["pruefen", "besetzung", "personTag", "stundenkonto", "istStunden", "sollStunden", "fachkraftLage", "planKennzahlen", "verteilung"])
      expect(fl, n).not.toMatch(new RegExp(`^(export )?function ${n}\\(`, "m"));
  });
  it("heute() und fKurz() des Clients sind die des Rechenkerns", async () => {
    const d = await import("../src/lib/datum.js");
    expect(d.heute).toBe(heute);
    expect(d.fKurz("2026-03-04")).toBe("04.03.");
  });
  it("Merkmalsprüfung der Pakete: im Client eingehängt; ohne Haken gilt kein Merkmal; ungültiger Haken wird verweigert", () => {
    const m = demo();
    const da = m.dienstarten[0].id;
    const mit = F.fachkraftLage(m, "2026-11-03", da);
    expect(Befunde.mitMerkmalen(() => false, () => F.fachkraftLage(m, "2026-11-03", da))).toBeNull();
    expect(F.fachkraftLage(m, "2026-11-03", da)).toEqual(mit);       // Haken wiederhergestellt
    expect(() => Befunde.merkmalPruefungSetzen("kein")).toThrow();
  });
});

/* ------------------------------------------------------------------------ */
describe("Rechenkern: Fakten mit Herkunft", () => {
  const OPT = { zeitraum: { von: VON, bis: BIS }, heute: "2026-11-06", merkmale: [] };

  it("Befunde und Kennzahlen als benannte, typisierte Fakten (Felder aus dem Katalog, Herkunft gesetzt)", () => {
    const r = K.rechnen(demo(), OPT);
    expect(r.version).toBe(K.ENGINE_VERSION);
    const gold = golden.betriebe[demoName()];
    const bef = r.fakten.filter((f) => f.feld === "befund.regel");
    expect(bef.length).toBe(gold.pruefen.anzahl);
    const arten = {}; for (const f of bef) arten[f.wert] = (arten[f.wert] || 0) + 1;
    expect(arten).toEqual(gold.pruefen.arten);
    for (const f of r.fakten) {
      expect(K.BERECHNETE_FELDER).toContain(f.feld);
      expect(FELDER[f.feld].herkunft).toBe("berechnet");
      expect(f.id).toMatch(/^eng:/);
      expect(f.herkunft).toEqual({ berechnung: expect.stringMatching(/^(pruefen|planKennzahlen)$/), version: K.ENGINE_VERSION, von: VON, bis: BIS, heute: "2026-11-06" });
      expect(f.datum === undefined || /^\d{4}-\d{2}-\d{2}$/.test(f.datum)).toBe(true);
    }
    const kz = Object.fromEntries(r.fakten.filter((f) => f.feld === "kennzahl.wert").map((f) => [f.ref, f.wert]));
    expect(kz["plan.befunde"]).toBe(gold.kennzahlen.befunde);
    expect(kz["plan.dienste"]).toBe(gold.kennzahlen.dienste);
    expect(kz["plan.stunden"]).toBe(gold.kennzahlen.stunden);
    expect(Object.keys(kz).sort()).toEqual(Object.keys(K.KENNZAHLEN).sort());
    expect(r.zaehler.fakten).toBe(r.fakten.length);
  });

  it("Determinismus: gleiche Eingabe, gleiche Ausgabe; auch für eine Kopie und mit neuem Optionsobjekt", () => {
    const m = demo();
    const a = K.rechnen(m, OPT), b = K.rechnen(m, OPT);
    expect(sha(a)).toBe(sha(b));
    expect(sha(K.rechnen(structuredClone(m), OPT))).toBe(sha(a));
    expect(sha(K.rechnen(m, { ...OPT, zeitraum: { von: VON, bis: BIS } }))).toBe(sha(a));
  });

  it("keine Mutation: tief eingefrorene Eingabe wird gerechnet (Strict Mode wirft bei jedem Schreibversuch) und bleibt gleich", () => {
    const m = structuredClone(demo());
    const vorher = sha(m);
    deepFreeze(m);
    const r = K.rechnen(m, OPT);
    expect(r.fakten.length).toBeGreaterThan(0);
    expect(sha(m)).toBe(vorher);
    expect(Object.isFrozen(r) && Object.isFrozen(r.fakten) && Object.isFrozen(r.fakten[0])).toBe(true);
  });

  it("das Tagesdatum kommt aus der Eingabe, nicht von der Uhr; danach gilt wieder die Uhr", () => {
    const m = demo();
    const a = K.rechnen(m, { ...OPT, heute: "2026-11-06" });
    vi.setSystemTime(new Date("2027-05-05T10:00:00Z"));
    try {
      expect(sha(K.rechnen(m, { ...OPT, heute: "2026-11-06" }))).toBe(sha(a));
      expect(heute()).toBe("2027-05-05");
      expect(mitTagesdatum("2030-01-01", () => heute())).toBe("2030-01-01");
      expect(() => mitTagesdatum("2030-01-01", () => { throw new Error("x"); })).toThrow();
      expect(heute()).toBe("2027-05-05");
      expect(() => mitTagesdatum("heute", () => 1)).toThrow();
    } finally { vi.setSystemTime(new Date(FEST)); }
  });

  it("ungültige Optionen werden verweigert; ein unvollständiger Betrieb ergibt keine Zahl statt einer falschen", () => {
    for (const o of [null, {}, { ...OPT, heute: "gestern" }, { ...OPT, zeitraum: { von: BIS, bis: VON } },
      { ...OPT, zeitraum: { von: "2026-01-01", bis: "2026-12-31" } }, { ...OPT, merkmale: [1] }]) expect(() => K.rechnen(demo(), o)).toThrow();
    expect(() => K.rechnen(null, OPT)).toThrow();
    const r = K.rechnen({ personen: [{ id: "p" }] }, OPT);
    expect(r.nichtBerechenbar.length).toBeGreaterThan(0);
    expect(r.fakten.filter((f) => f.feld === "kennzahl.wert")).toEqual([]);
  });

  it("Leistung: Demobetrieb mit 86 Personen, ein Monat, in unter 30 Sekunden (Richtwert gegen Ausreißer)", () => {
    const m = structuredClone(demo());
    const t0 = performance.now();
    K.rechnen(m, OPT);
    expect(performance.now() - t0).toBeLessThan(30000);
  });
});

/* ------------------------------------------------------------------------ */
describe("Rollensicht: der Rechenkern liest nur, was die Sicht enthält", () => {
  const OPT = { zeitraum: { von: "2026-11-01", bis: "2026-11-14" }, heute: "2026-11-06" };

  /** Ein Betrieb mit Kanarienfeldern an jeder Person: Felder, die in keiner Sicht stehen dürfen. */
  const kanarien = () => {
    const m = structuredClone(demo());
    for (const p of m.personen) Object.assign(p, { kanarienKontakt: "KANARIE-KONTAKT", kanarienGesundheit: "KANARIE-GESUNDHEIT", kanarienNotiz: "KANARIE-NOTIZ" });
    m.kanarienBetrieb = "KANARIE-BETRIEB";
    return m;
  };
  /** Proxy, der jede gelesene Eigenschaft mitschreibt (Schlüsselnamen, tief). */
  const beobachtet = (wurzel, gelesen) => {
    const huelle = new WeakMap();
    const um = (o) => {
      if (!o || typeof o !== "object") return o;
      if (huelle.has(o)) return huelle.get(o);
      const p = new Proxy(o, { get(z, k, e) { if (typeof k === "string") gelesen.add(k); return um(Reflect.get(z, k, e)); } });
      huelle.set(o, p); return p;
    };
    return um(wurzel);
  };

  it("Kanarienfelder werden nie gelesen und tauchen in keinem Fakt auf", () => {
    const gelesen = new Set();
    const r = K.rechnen(beobachtet(kanarien(), gelesen), OPT);
    expect(r.fakten.length).toBeGreaterThan(0);
    expect(gelesen.size).toBeGreaterThan(20);
    expect([...gelesen].filter((k) => k.startsWith("kanarien"))).toEqual([]);
    expect(JSON.stringify(r)).not.toMatch(/KANARIE/);
  });

  it("gelesene Felder: kein Kontakt-, Konto-, Zugangs- und Freitextfeld", () => {
    const gelesen = new Set();
    K.rechnen(beobachtet(structuredClone(demo()), gelesen), OPT);
    const VERBOTEN = ["email", "telefon", "mobil", "iban", "anschrift", "kontakt", "notiz", "notizen", "grund", "anmerkung", "personalnummer",
      "kalenderGeheim", "pushSchluessel", "passwort", "tagesnotizen", "dienstbuch", "uebergaben", "anfragen", "nachrichten", "protokoll"];
    expect([...gelesen].filter((k) => VERBOTEN.includes(k)).sort()).toEqual([]);
  });

  it("jede Rolle: Rechenkern auf der Sicht der Rolle (bestandFuerRolle) rechnet ohne Absturz; Personen nur aus der Sicht", () => {
    const m = structuredClone(demo());
    const bestand = { version: 1, stand: 1, session: null, mandanten: [m] };
    const leitung = m.personen.find((p) => p.rolle === "leitung") || m.personen[0];
    const planer = m.personen.find((p) => p.rolle === "planer") || leitung;
    const ma = m.personen.find((p) => p.rolle === "mitarbeiter") || m.personen[1];
    for (const [rolle, person] of [["leitung", leitung], ["planer", planer], ["mitarbeiter", ma]]) {
      const aus = bestandFuerRolle(bestand, { rolle, person: person.id, bestand: "raum-a", betrieb: 0 });
      const sicht = aus.mandanten[0];
      const ids = new Set(sicht.personen.map((p) => String(p.id)));
      const r = K.rechnen(deepFreeze(structuredClone(sicht)), OPT);
      for (const f of r.fakten) if (f.person !== undefined) expect(ids.has(f.person), `${rolle} ${f.person}`).toBe(true);
      expect(JSON.stringify(r)).not.toMatch(/geburtsdatum|iban|@/);
    }
  });
});

/* ------------------------------------------------------------------------ */
describe("Anschluss an das Faktenpaket (WP-I11): Faktenquelle des Rechenkerns", () => {
  const SCHLUESSEL = Buffer.from("5b0e9c1d7a3f48e26c1b9d0a4e7f3c2b8a6d1e9f0c3b7a5d2e8f1c4b6a9d0e3f", "hex");
  const VERSIONEN = { engine: K.ENGINE_VERSION, regelstand: "r-2026-11", tarifstand: "t-2026" };
  const bild = async (funktion, rolle = "leitung") => {
    const m = structuredClone(demo());
    const p = m.personen.find((x) => x.rolle === rolle) || m.personen[0];
    return faktenpaketBilden({ sitzung: { rolle, person: p.id, bestand: "raum-a", betrieb: 0 },
      ladeBestand: () => ({ version: 1, stand: 1, session: null, mandanten: [m] }), funktion,
      eingabe: { zeitraum: { von: "2026-11-02", bis: "2026-11-08" } }, kontext: "auftrag-1", aliasSchluessel: SCHLUESSEL, versionen: VERSIONEN,
      faktenquelle: K.faktenquelleErzeugen({ heute: "2026-11-06" }) });
  };
  it("das Paket enthält Rechenkern-Fakten, nur Felder der Positivliste, ohne Klarnamen des Betriebs", async () => {
    const { paket } = await bild("F11");
    const felder = new Set(paket.fakten.map((f) => f.feld));
    expect(felder.has("kennzahl.wert")).toBe(true);
    for (const f of paket.fakten) expect(FUNKTIONEN.F11.felder).toContain(f.feld);
    expect(JSON.stringify(paket)).not.toMatch(/Nordwacht|nordwacht|@|IBAN/);
  });
  it("Funktion ohne Zeitraum: die Quelle liefert nichts", () => {
    expect(K.faktenquelleErzeugen({ heute: "2026-11-06" })({ sicht: {}, zeitraum: null })).toEqual([]);
  });
  it("die Quelle liefert nur die vom Faktenpaket erlaubten Schlüssel", () => {
    const aus = K.faktenquelleErzeugen({ heute: "2026-11-06" })({ sicht: deepFreeze(structuredClone(demo())), zeitraum: { von: VON, bis: "2026-11-07" } });
    expect(aus.length).toBeGreaterThan(0);
    for (const x of aus) expect(Object.keys(x).every((k) => ["feld", "person", "ref", "wert", "datum"].includes(k))).toBe(true);
  });
});

/* ------------------------------------------------------------------------ */
describe("Gegenrechnung und Haken im Ausgabeprüfer", () => {
  const OPT = { zeitraum: { von: VON, bis: BIS }, heute: "2026-11-06" };

  it("bestätigt die eigenen Fakten, erkennt eine falsche Zahl, ein falsches Datum und eine fremde Person", () => {
    const m = demo();
    const fakten = K.rechnen(m, OPT).fakten;
    expect(K.gegenrechnen(m, fakten, OPT)).toMatchObject({ ok: true, abweichungen: [] });
    const kz = fakten.find((f) => f.feld === "kennzahl.wert");
    const falsch = K.gegenrechnen(m, [{ ...kz, wert: kz.wert + 1 }], OPT);
    expect(falsch.ok).toBe(false);
    expect(falsch.abweichungen[0].grund).toMatch(/weicht ab/);
    const bef = fakten.find((f) => f.feld === "befund.regel" && f.person);
    expect(K.gegenrechnen(m, [{ ...bef, wert: "gibtEsNicht" }], OPT).ok).toBe(false);
    expect(K.gegenrechnen(m, [{ ...bef, person: "p-gibt-es-nicht" }], OPT).ok).toBe(false);
  });
  it("Felder, die der Rechenkern nicht kennt, sind „nicht prüfbar“, keine Abweichung; ungültige Fakten sind Abweichung", () => {
    const g = K.gegenrechnen(demo(), [{ feld: "dienstart.beginn", wert: "06:00", ref: "F" }], OPT);
    expect(g).toMatchObject({ ok: true, geprueft: 0, nichtPruefbar: ["dienstart.beginn"] });
    expect(K.gegenrechnen(demo(), [null], OPT).ok).toBe(false);
  });
  it("gegenrechnungErzeugen: ok nur bei Bestätigung; jede Ausnahme ist ok:false", () => {
    const fakten = K.rechnen(demo(), OPT).fakten;
    expect(K.gegenrechnungErzeugen(() => ({ sicht: demo(), fakten, optionen: OPT }))({ ausgabe: {}, paket: {} })).toEqual({ ok: true });
    const kz = fakten.find((f) => f.feld === "kennzahl.wert");
    expect(K.gegenrechnungErzeugen(() => ({ sicht: demo(), fakten: [{ ...kz, wert: -1 }], optionen: OPT }))({})).toEqual({ ok: false });
    expect(K.gegenrechnungErzeugen(() => { throw new Error("x"); })({})).toEqual({ ok: false });
    expect(K.gegenrechnungErzeugen(() => ({ sicht: null, fakten, optionen: OPT }))({})).toEqual({ ok: false });
    expect(() => K.gegenrechnungErzeugen(null)).toThrow();
  });

  describe("pruefer.mjs: optionaler Parameter gegenrechnung (P-10); ohne Haken bleibt alles wie vorher", () => {
    const SPERR = sperrlisteBilden(gatewayBestand().mandanten[0], { raum: "raum-a" });
    const PAKET = { schemaVersion: "1.0", funktion: "F2", zeitraum: { von: "2026-11-01", bis: "2026-11-30" },
      fakten: [{ id: "f.2", feld: "dienstart.beginn", art: "zeit", wert: "06:00", ref: "D_LMNPQRST" }] };
    const pr = (t, o = {}) => ausgabePruefen({ ausgabe: { text: t }, paket: PAKET, bausteinKatalog: {}, sperrliste: SPERR, ...o });
    it("Grundlage: die Antwort ist ohne Haken zulässig", () => {
      expect(pr("Beginn 06:00.").ok).toBe(true);
    });
    it("ohne Haken (fehlt, undefined, null): dieselbe Entscheidung, kein P-10", () => {
      const a = pr("Beginn 06:00.");
      expect(pr("Beginn 06:00.", { gegenrechnung: undefined })).toEqual(a);
      expect(pr("Beginn 06:00.", { gegenrechnung: null })).toEqual(a);
    });
    it("Haken ok:true lässt durch; alles andere verwirft die ganze Antwort mit P-10", () => {
      expect(pr("Beginn 06:00.", { gegenrechnung: () => ({ ok: true }) }).ok).toBe(true);
      for (const h of [() => ({ ok: false }), () => ({}), () => null, () => undefined, () => ({ ok: "ja" }), () => { throw new Error("x"); }, "kein-fn", 42]) {
        const r = pr("Beginn 06:00.", { gegenrechnung: h });
        expect(r.ok).toBe(false);
        expect(r.codes).toEqual(["P-10"]);
      }
    });
    it("der Haken bekommt nur eine eingefrorene Momentaufnahme; eine bereits abgelehnte Antwort ruft ihn nicht auf", () => {
      let n = 0, eingefroren = null, gesehen = null;
      expect(pr("Es sind 999 Fälle.", { gegenrechnung: () => { n++; return { ok: true }; } }).ok).toBe(false);
      expect(n).toBe(0);
      pr("Beginn 06:00.", { gegenrechnung: (a) => { eingefroren = Object.isFrozen(a); gesehen = Object.keys(a).sort(); return { ok: true }; } });
      expect(eingefroren).toBe(true);
      expect(gesehen).toEqual(["ausgabe", "paket"]);
    });
    it("der Prüfer verzichtet auf den Rechenkern: kein Import des Rechenkerns in gateway/ und intelligence/", () => {
      for (const d of ["server/lib/intelligence", "server/lib/intelligence/gateway"])
        for (const f of readdirSync(new URL(`../${d}/`, import.meta.url)).filter((x) => x.endsWith(".mjs")))
          expect(lies(`${d}/${f}`), `${d}/${f}`).not.toMatch(/from\s+["'][^"']*\/engine\//);
    });
  });
});

/* ------------------------------------------------------------------------ */
describe("Importregeln des Rechenkerns", () => {
  const dateien = () => readdirSync(new URL("../server/lib/engine/", import.meta.url)).filter((f) => f.endsWith(".mjs"));
  const code = (f) => lies(`server/lib/engine/${f}`).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  it("kein Import aus intelligence/ oder src/; kein React, DOM, Dateisystem, Netz; kein Zufall", () => {
    for (const f of dateien()) {
      const c = code(f);
      expect(c, f).not.toMatch(/from\s+["'][^"']*intelligence\//);
      expect(c, f).not.toMatch(/from\s+["'](\.\.\/)+src\//);
      expect(c, f).not.toMatch(/from\s+["'](react|react-dom)["']|\bdocument\.|\bwindow\.|localStorage|sessionStorage/);
      expect(c, f).not.toMatch(/node:fs|node:net|node:http|node:child_process|\bfetch\(|process\.env|Math\.random\(/);
    }
  });
  it("alle Dateien laden ohne src/ (Docker-Bild): die Importquellen liegen in server/lib/", async () => {
    for (const f of dateien()) {
      const c = code(f);
      for (const m of c.matchAll(/from\s+["']([^"']+)["']/g)) expect(m[1], `${f}: ${m[1]}`).toMatch(/^\.\.?\//);
      for (const m of c.matchAll(/from\s+["'](\.\.\/[^"']+)["']/g)) expect(m[1], `${f}: ${m[1]}`).not.toMatch(/\.\.\/\.\./);
      await import(/* @vite-ignore */ `../server/lib/engine/${f}`);
    }
  });
  it("src/engine/rechenkern.js reicht nur weiter", () => {
    expect(lies("src/engine/rechenkern.js").replace(/\/\*[\s\S]*?\*\//g, "").trim()).toBe('export * from "../../server/lib/engine/rechenkern.mjs";');
  });
});
