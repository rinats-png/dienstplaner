/* ==========================================================================
   IMP-9 — KI-Schnittstelle für den Import (austauschbar, ohne Aktivierung)

   Akzeptanz (docs/acc45/work-packages.json, IMP-9):
     A1  Der deterministische Import funktioniert ohne KI (und ist mit und ohne Port identisch).
     A2  Keine Übertragung personenbezogener Daten an nicht freigegebene Dienste:
         Port standardmäßig aus; ein Anbieter wird nur bei vollständiger Freigabe (Notschalter,
         Freigabe-Gate, protokollierter Vermerk E-25/E-26) angefasst; selbst dann gehen nur
         minimierte, leckgeprüfte Spaltenüberschriften hinaus, nie Personendaten.
     A3  Fehlerhafte oder übergroße Anbieterausgabe wird verworfen; ein Vorschlag wird nie
         automatisch angewendet.

   Nur synthetische Daten, kein Netz, keine Umgebung. Aufruf:
     npx vitest run pruefungen/import-ki-schnittstelle-imp9.test.js --testTimeout=120000
   ========================================================================== */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { analysieren, planen } from "../server/lib/import/personen.mjs";
import { sperrlisteBilden } from "../server/lib/intelligence/leckpruefung.mjs";
import { AnbieterFehler, ANBIETER_EINGABE_FELDER } from "../server/lib/intelligence/gateway/anbieter.mjs";
import {
  KI_PORT_AUS, KI_GRENZEN, KI_TEXTE, KI_CODES_IMPORT, PRODUKTIV_VORAUSSETZUNGEN,
  erzeugeKiPort, kiFreigabe, kiVorschlagEinholen, eingabeMinimieren, maskieren, ergebnisPruefen,
  vorschlagBilden, vorschlagUebernehmen,
} from "../server/lib/import/ki-schnittstelle.mjs";

const WURZEL = path.resolve(import.meta.dirname, "..");
const eingefroren = (o) => { Object.freeze(o); for (const v of Object.values(o)) if (v && typeof v === "object" && !Object.isFrozen(v)) eingefroren(v); return o; };
const kopie = (o) => JSON.parse(JSON.stringify(o));

/* --------------------------------------------------------------------------
   Synthetischer Betrieb und Datei (keine echten Personendaten)
   -------------------------------------------------------------------------- */
const MANDANT = () => ({ id: "m1", name: "Haus Seltenstein",
  einheiten: [{ id: "e1", name: "Wohnbereich Sonnenschein" }], standorte: [], qualifikationen: [],
  personen: [
    { id: "p1", vorname: "Erika", nachname: "Musterfrau", personalnummer: "4711", email: "erika.musterfrau@example.test", funktion: "Fachkraft", qualifikationen: [] },
    { id: "p2", vorname: "Otto", nachname: "Normalverbraucher", personalnummer: "4712", email: "", funktion: "Fachkraft", qualifikationen: [] }] });
const RAUM = "raum-imp9-pruefung";
const SPERRLISTE = () => sperrlisteBilden(MANDANT(), { raum: RAUM });
/* Spalten: 0-2 werden erkannt; 3 „Kontakt“, 4 „Bemerkung“, 7 „Mitarbeiter-Ref“ bleiben offen; 5 trägt einen NAMEN als Überschrift
   (fehlende Kopfzeile), 6 eine Telefonnummer. */
const ZEILEN = () => [
  ["Nachname", "Vorname", "Einheit", "Kontakt", "Bemerkung", "Musterfrau", "Tel 0151 2345678", "Mitarbeiter-Ref"],
  ["Normalverbraucher", "Otto", "Wohnbereich Sonnenschein", "erika.musterfrau@example.test", "schwanger seit Mai", "x", "y", "R-0042"],
  ["Musterfrau", "Erika", "Wohnbereich Sonnenschein", "otto@example.test", "Krankmeldung 01.02.2026", "x", "y", "R-0043"]];
const HEUTE = "2026-11-10";
const analyse = (zuordnung) => analysieren({ mandant: MANDANT(), zeilen: ZEILEN(), heute: HEUTE, ...(zuordnung ? { zuordnung } : {}) });
/* Alles, was an personenbezogenen Zeichenketten in der Datei oder im Betrieb vorkommt. */
const GEHEIM = /Musterfrau|Normalverbraucher|Otto|Erika|4711|4712|erika\.|otto@|schwanger|Krankmeldung|Sonnenschein|Seltenstein|0151|2345678|R-004|raum-imp9|example\.test|Fachkraft/i;

/* --------------------------------------------------------------------------
   Anbieter-Attrappe (zählt Aufrufe, hält die Eingabe fest) und volle Freigabe
   -------------------------------------------------------------------------- */
const gutAusgabe = () => ({ version: "1", vorschlaege: [{ spalte: 4, feld: "funktion", konfidenz: 0.9 }],
  unsicherheiten: [{ spalte: 3, grund: "mehrdeutig", alternativen: ["email", "funktion"] }], validierungsfehler: [] });
function stub(antwort, { id = "stub-test", ort = "lokal" } = {}) {
  const aufrufe = [];
  return { aufrufe, anbieter: { id, modellOrt: ort, async erzeuge(e) {
    aufrufe.push(e);
    return typeof antwort === "function" ? antwort(e) : antwort;
  } } };
}
const gut = () => ({ ausgabe: gutAusgabe(), nutzung: { eingabeToken: 5, ausgabeToken: 50 } });
const JETZT = () => Date.parse("2026-11-10T12:00:00Z");
const KONFIG = () => ({ freigabe: true, monatsbudget: 5, avv: { status: "bestaetigt", datum: "2026-01-15" }, modellKennung: "stub-modell-1",
  vermerk: { e25: "erteilt", e26: "erteilt", zweck: "import-spaltenzuordnung", anbieterId: "stub-test", modellOrt: "lokal", datum: "2026-02-01" } });
const AN = () => ({ prozess: () => "an", laufzeit: () => "an" });
const port = (s, mehr = {}) => erzeugeKiPort({ anbieter: s.anbieter, konfig: KONFIG(), schalter: AN(), jetzt: JETZT, ...mehr });
const anfrage = (mehr = {}) => { const a = analyse(); return { spalten: a.spalten, zeilen: ZEILEN(), sperrliste: SPERRLISTE(), ...mehr }; };

/* ==========================================================================
   A1 — deterministischer Import ohne KI
   ========================================================================== */
describe("IMP-9 A1: der deterministische Import funktioniert ohne KI", () => {
  it("Analyse und Plan sind mit und ohne Port identisch (aus, voll freigegeben, Fehler) und werden nie verändert", async () => {
    const lauf = () => {
      const m = eingefroren(MANDANT());
      const z = eingefroren(ZEILEN());
      const a = analysieren({ mandant: m, zeilen: z, heute: HEUTE });
      const p = planen({ mandant: m, analyse: a, orgEdit: false });
      return { a, p };
    };
    const ohne = lauf();
    expect(ohne.a.ok).toBe(true);
    const aus = await kiVorschlagEinholen({ spalten: ohne.a.spalten, zeilen: ZEILEN(), sperrliste: SPERRLISTE() });
    expect(aus).toMatchObject({ ok: false, code: "KI_AUS" });
    const s = stub(gut);
    const aktiv = await kiVorschlagEinholen({ port: port(s), ...anfrage(), zuordnung: ohne.a.zuordnung });
    expect(aktiv.ok).toBe(true);
    expect(s.aufrufe).toHaveLength(1);
    const kaputt = await kiVorschlagEinholen({ port: port(stub(() => { throw new Error("Absturz"); })), ...anfrage() });
    expect(kaputt.ok).toBe(false);
    /* nach allen Versuchen: dasselbe Ergebnis wie vorher */
    const nachher = lauf();
    expect(nachher).toEqual(ohne);
    expect(nachher.p.hash).toBe(ohne.p.hash);
  });

  it("die Zuordnung der Analyse ändert sich durch einen KI-Vorschlag NICHT (nur eine Bestätigung ändert sie)", async () => {
    const a = analyse();
    const s = stub(gut);
    const v = await kiVorschlagEinholen({ port: port(s), ...anfrage(), zuordnung: a.zuordnung });
    expect(v.ok).toBe(true);
    expect(v.vorschlag).toMatchObject({ quelle: "ki", status: "vorschlag", bestaetigt: false, autoAnwenden: false });
    expect(analyse()).toEqual(a);
    expect(a.spalten.find((x) => x.index === 4).feld).toBe(null);
  });

  it("Import-Module kennen die KI-Schnittstelle nicht (keine Abhängigkeit, kein Aufruf); es gibt keine Verdrahtung", () => {
    const ohneKommentare = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    const dateien = [];
    const sammeln = (d) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        if (e.name === "node_modules" || e.name.startsWith(".")) continue;
        const p = path.join(d, e.name);
        if (e.isDirectory()) sammeln(p); else if (/\.(mjs|js|jsx)$/.test(e.name)) dateien.push(p);
      }
    };
    for (const d of ["server", "src", "werkzeug"]) sammeln(path.join(WURZEL, d));
    dateien.push(path.join(WURZEL, "server.mjs"));
    expect(dateien.length).toBeGreaterThan(50);
    const eigene = path.join(WURZEL, "server/lib/import/ki-schnittstelle.mjs");
    for (const f of dateien) {
      if (f === eigene) continue;
      expect(ohneKommentare(readFileSync(f, "utf8")), path.relative(WURZEL, f)).not.toMatch(/ki-schnittstelle|erzeugeKiPort|kiVorschlagEinholen|KI_PORT_AUS/);
    }
  });

  it("das Modul selbst: kein Netz, keine Umgebung, kein Kindprozess, keine Datei, nur Importe aus intelligence/ und personen.mjs", () => {
    const q = readFileSync(path.join(WURZEL, "server/lib/import/ki-schnittstelle.mjs"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(q).not.toMatch(/\bfetch\s*\(|node:https?|node:net|node:tls|node:dgram|node:child_process|node:fs|node:dns|XMLHttpRequest|WebSocket/);
    expect(q).not.toMatch(/process\.env|process\s*\[\s*["']env|\beval\s*\(|new\s+Function\s*\(/);
    expect(q).not.toMatch(/anthropic|openai|bedrock|api\.\w+\.com|https?:\/\//i);
    expect(q).not.toMatch(/bestandSchreiben|zusammenfuehren|setJSON|\.set\(/);
    const erlaubt = ["../intelligence/gateway/anbieter.mjs", "../intelligence/gateway/schalter.mjs", "../intelligence/gateway/anbieter-live.mjs",
      "../intelligence/kapsel.mjs", "../intelligence/leckpruefung.mjs", "./personen.mjs"];
    const importe = [...q.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
    expect(importe.length).toBeGreaterThan(3);
    for (const i of importe) expect(erlaubt, i).toContain(i);
  });
});

/* ==========================================================================
   A2 — standardmäßig aus; Freigabe alles oder nichts
   ========================================================================== */
describe("IMP-9 A2: Port standardmäßig aus, Anbieter nur bei vollständiger Freigabe", () => {
  it("Vorgabe: aus, ohne Anbieter, ohne Konfiguration, ohne Schalter", async () => {
    expect(KI_PORT_AUS.status()).toEqual({ aktiv: false, grund: "schalter" });
    expect(erzeugeKiPort().status().aktiv).toBe(false);
    expect(await KI_PORT_AUS.vorschlagen(anfrage())).toMatchObject({ ok: false, code: "KI_AUS", text: KI_TEXTE.KI_AUS });
    const s = stub(gut);
    /* Anbieter da, aber weder Schalter noch Konfiguration: aus, Anbieter unberührt */
    for (const p of [erzeugeKiPort({ anbieter: s.anbieter }), erzeugeKiPort({ anbieter: s.anbieter, konfig: KONFIG() }),
      erzeugeKiPort({ anbieter: s.anbieter, schalter: AN() })]) {
      expect(p.status().aktiv).toBe(false);
      expect((await p.vorschlagen(anfrage())).ok).toBe(false);
    }
    expect(s.aufrufe).toHaveLength(0);
  });

  it("kiVorschlagEinholen ohne Port, mit fremdem Objekt, mit Attrappe ohne erzeugeKiPort: aus", async () => {
    expect(await kiVorschlagEinholen({ ...anfrage() })).toMatchObject({ ok: false, code: "KI_AUS" });
    const fremd = { vorschlagen: async () => ({ ok: true, ergebnis: gutAusgabe() }) };
    expect(await kiVorschlagEinholen({ port: fremd, ...anfrage() })).toMatchObject({ ok: false, code: "KI_AUS" });
    expect(await kiVorschlagEinholen({ port: null, ...anfrage() })).toMatchObject({ ok: false, code: "KI_AUS" });
  });

  it("Positivkontrolle: mit voller Freigabe wird der Anbieter genau einmal aufgerufen", async () => {
    const s = stub(gut);
    const p = port(s);
    expect(p.status()).toEqual({ aktiv: true, grund: null });
    const r = await p.vorschlagen(anfrage());
    expect(r.ok).toBe(true);
    expect(s.aufrufe).toHaveLength(1);
  });

  /* Jede Abweichung von der vollständigen Freigabe → KEIN Aufruf, KEINE Aufbereitung. */
  const abweichungen = {
    "nur Prozessschalter an": (c) => { c.schalter = { prozess: () => "an", laufzeit: () => "aus" }; },
    "nur Laufzeitschalter an": (c) => { c.schalter = { prozess: () => "aus", laufzeit: () => "an" }; },
    "Schalter „AN“ statt „an“": (c) => { c.schalter = { prozess: () => "AN", laufzeit: () => "an" }; },
    "Schalter true": (c) => { c.schalter = { prozess: () => true, laufzeit: () => true }; },
    "Schalter wirft": (c) => { c.schalter = { prozess: () => { throw new Error("x"); }, laufzeit: () => "an" }; },
    "Schalter liefert Promise": (c) => { c.schalter = { prozess: async () => "an", laufzeit: () => "an" }; },
    "freigabe fehlt": (c) => { delete c.konfig.freigabe; },
    "freigabe \"true\" (Text)": (c) => { c.konfig.freigabe = "true"; },
    "freigabe false": (c) => { c.konfig.freigabe = false; },
    "Monatsbudget 0": (c) => { c.konfig.monatsbudget = 0; },
    "Monatsbudget fehlt": (c) => { delete c.konfig.monatsbudget; },
    "Monatsbudget NaN": (c) => { c.konfig.monatsbudget = NaN; },
    "AVV fehlt": (c) => { delete c.konfig.avv; },
    "AVV offen": (c) => { c.konfig.avv.status = "offen"; },
    "AVV-Datum in der Zukunft": (c) => { c.konfig.avv.datum = "2026-12-24"; },
    "AVV-Datum unmöglich": (c) => { c.konfig.avv.datum = "2026-02-30"; },
    "Modellkennung fehlt": (c) => { delete c.konfig.modellKennung; },
    "Modellkennung ist eine Adresse": (c) => { c.konfig.modellKennung = "https://anbieter.example/modell"; },
    "Vermerk fehlt": (c) => { delete c.konfig.vermerk; },
    "Vermerk ohne E-25": (c) => { delete c.konfig.vermerk.e25; },
    "Vermerk ohne E-26": (c) => { delete c.konfig.vermerk.e26; },
    "E-25 nur true statt erteilt": (c) => { c.konfig.vermerk.e25 = true; },
    "E-26 „offen“": (c) => { c.konfig.vermerk.e26 = "offen"; },
    "Vermerk für anderen Anbieter": (c) => { c.konfig.vermerk.anbieterId = "anderer-anbieter"; },
    "Vermerk für anderen Modellort": (c) => { c.konfig.vermerk.modellOrt = "extern"; },
    "Vermerk für anderen Zweck": (c) => { c.konfig.vermerk.zweck = "plan-erklaerer"; },
    "Vermerk ohne Datum": (c) => { delete c.konfig.vermerk.datum; },
    "Vermerk datiert in der Zukunft": (c) => { c.konfig.vermerk.datum = "2027-01-01"; },
    "Vermerk als Text": (c) => { c.konfig.vermerk = "erteilt"; },
    "Vermerk mit Prototyp geerbt": (c) => { c.konfig.vermerk = Object.create({ e25: "erteilt", e26: "erteilt", zweck: "import-spaltenzuordnung",
      anbieterId: "stub-test", modellOrt: "lokal", datum: "2026-02-01" }); },
    "Konfiguration geerbt statt eigen": (c) => { c.konfig = Object.create(KONFIG()); },
    "Konfiguration fehlt": (c) => { c.konfig = undefined; },
  };
  for (const [name, aendern] of Object.entries(abweichungen)) {
    it(`kein Aufruf bei: ${name}`, async () => {
      const s = stub(gut);
      const c = { konfig: KONFIG(), schalter: AN(), anbieter: s.anbieter };
      aendern(c);
      const p = erzeugeKiPort({ anbieter: c.anbieter, konfig: c.konfig, schalter: c.schalter, jetzt: JETZT });
      expect(p.status().aktiv).toBe(false);
      const r = await p.vorschlagen(anfrage());
      expect(r.ok).toBe(false);
      expect(["KI_AUS", "KI_NICHT_FREIGEGEBEN"]).toContain(r.code);
      expect(s.aufrufe).toHaveLength(0);
    });
  }

  it("ein ungültiger Anbieter macht den Port zu (kein Wurf, kein Aufruf)", async () => {
    for (const a of [{}, { id: "x", modellOrt: "lokal" }, { id: "X Y", modellOrt: "lokal", erzeuge: async () => ({}) },
      { id: "ok", modellOrt: "irgendwo", erzeuge: async () => ({}) }, "anbieter", 42]) {
      const p = erzeugeKiPort({ anbieter: a, konfig: KONFIG(), schalter: AN(), jetzt: JETZT });
      expect(p.status().aktiv).toBe(false);
      expect((await p.vorschlagen(anfrage())).ok).toBe(false);
    }
  });

  it("die Freigabe wird bei JEDEM Aufruf neu geprüft: Notschalter „aus“ nach dem Start wirkt sofort", async () => {
    const s = stub(gut);
    let an = "an";
    const p = port(s, { schalter: { prozess: () => an, laufzeit: () => "an" } });
    expect((await p.vorschlagen(anfrage())).ok).toBe(true);
    an = "aus";
    expect(await p.vorschlagen(anfrage())).toMatchObject({ ok: false, code: "KI_AUS" });
    expect(s.aufrufe).toHaveLength(1);
  });

  it("kiFreigabe ist rein: keine Umgebung, nennt nur feste Gründe; E-25 und E-26 sind benannte Voraussetzungen", () => {
    expect(PRODUKTIV_VORAUSSETZUNGEN).toEqual(["E-25", "E-26"]);
    const a = { id: "stub-test", modellOrt: "lokal" };
    expect(kiFreigabe({ konfig: KONFIG(), schalter: AN(), anbieter: a, jetzt: JETZT })).toEqual({ offen: true, grund: null });
    expect(kiFreigabe({ konfig: {}, schalter: AN(), anbieter: a, jetzt: JETZT })).toEqual({ offen: false, grund: "gate" });
    expect(kiFreigabe({ konfig: KONFIG(), schalter: undefined, anbieter: a, jetzt: JETZT })).toEqual({ offen: false, grund: "schalter" });
    const k = KONFIG(); delete k.vermerk;
    expect(kiFreigabe({ konfig: k, schalter: AN(), anbieter: a, jetzt: JETZT })).toEqual({ offen: false, grund: "vermerk" });
  });
});

/* ==========================================================================
   A2 (Fortsetzung) — Datenschutz: Personendaten erreichen den Anbieter nie
   ========================================================================== */
describe("IMP-9 A2: Minimierung und Leck-Prüfung — Personendaten erreichen den Anbieter nie", () => {
  it("selbst mit voller Freigabe gehen nur Überschriften und Formmasken der OFFENEN Spalten hinaus", async () => {
    const s = stub(gut);
    const r = await port(s).vorschlagen(anfrage({ proben: 3 }));
    expect(r.ok).toBe(true);
    const e = s.aufrufe[0];
    expect(Object.keys(e).sort()).toEqual([...ANBIETER_EINGABE_FELDER, "signal"].sort());
    expect(e.fremdtext).toBeNull();
    const text = JSON.stringify(e);
    expect(text).not.toMatch(GEHEIM);
    /* 0-2 sind schon zugeordnet; offen bleiben 3-7. Seit der Allowlist (Folgeauftrag zu PR #187) trägt KEINE davon ihre Überschrift im Klartext:
       weder „Kontakt“ noch der Name in Spalte 5 noch die Telefonnummer in Spalte 6 — alles Platzhalter. */
    expect(e.paket.spalten.map((x) => x.index)).toEqual([3, 4, 5, 6, 7]);
    expect(e.paket.spalten.map((x) => x.ueberschrift)).toEqual(["Spalte 4", "Spalte 5", "Spalte 6", "Spalte 7", "Spalte 8"]);
    for (const sp of e.paket.spalten) for (const pr of sp.proben) expect(pr).toMatch(/^[Aa9 .,:;\-/()#+%?]+$/);
    expect(e.paket.spalten[1].proben).toEqual(["a a Aa", "Aa 9.9.9"]);
    /* keine Zeilen, keine Zellwerte, kein Betrieb, keine Alias-Karte, keine Sitzung */
    expect(Object.keys(e.paket).sort()).toEqual(["funktion", "schemaVersion", "spalten", "ziele"]);
  });

  it("ohne ausdrücklich verlangte Proben gibt es keine Proben (Vorgabe 0); mehr als 3 werden auf 3 begrenzt", async () => {
    const m0 = eingabeMinimieren(anfrage());
    expect(m0.ok).toBe(true);
    for (const sp of m0.paket.spalten) expect(sp.proben).toBeUndefined();
    const z = ZEILEN();
    for (let i = 0; i < 6; i++) z.push(["N", "V", "Wohnbereich Sonnenschein", "k", `Wert${"x".repeat(i)} ${i}`, "x", "y", "r"]);
    const m = eingabeMinimieren({ ...anfrage({ zeilen: z }), proben: 99 });
    expect(m.paket.spalten.find((x) => x.index === 4).proben.length).toBeLessThanOrEqual(KI_GRENZEN.proben);
  });

  it("maskieren: Form statt Inhalt (Name, Datum, E-Mail, Zahl, Datumszelle)", () => {
    expect(maskieren("Müller, Erika")).toBe("Aa, Aa");
    expect(maskieren("01.02.1990")).toBe("9.9.9");
    expect(maskieren("erika@example.test")).toBe("a?a.a");
    expect(maskieren(4711)).toBe("9");
    expect(maskieren({ typ: "datum", roh: 45000, text: "15.03.2023" })).toBe("9.9.9");
    expect(maskieren(null)).toBe("");
    expect(maskieren("x".repeat(500)).length).toBeLessThanOrEqual(KI_GRENZEN.probeZeichen);
    expect(maskieren("<script>alert(1)</script>")).toBe("?a?a(9)?/a?");
  });

  it("ohne Sperrliste oder mit ungültiger Sperrliste: kein Aufruf (KI_LECK)", async () => {
    for (const sperrliste of [undefined, null, {}, { luecke: false }, "liste"]) {
      const s = stub(gut);
      const r = await port(s).vorschlagen(anfrage({ sperrliste }));
      expect(r, JSON.stringify(sperrliste)).toMatchObject({ ok: false, code: "KI_LECK" });
      expect(s.aufrufe).toHaveLength(0);
    }
  });

  it("tragen alle offenen Überschriften Namen oder Nummern, geht nur ein Platzhalter hinaus (nie der Wert)", async () => {
    const s = stub(() => ({ ausgabe: { version: "1", vorschlaege: [] }, nutzung: { eingabeToken: 1, ausgabeToken: 1 } }));
    const a = analysieren({ mandant: MANDANT(), heute: HEUTE, zeilen: [["Nachname", "Vorname", "Einheit", "Musterfrau", "Erika", "4711"],
      ["N", "V", "Wohnbereich Sonnenschein", "a", "b", "c"]] });
    const r = await port(s).vorschlagen({ spalten: a.spalten, zeilen: [], sperrliste: SPERRLISTE() });
    expect(r.ok).toBe(true);
    expect(JSON.stringify(s.aufrufe[0])).not.toMatch(GEHEIM);
    expect(s.aufrufe[0].paket.spalten.map((x) => x.ueberschrift)).toEqual(["Spalte 4", "Spalte 5", "Spalte 6"]);
  });

  it("keine offenen Spalten: kein Aufruf (KI_EINGABE)", async () => {
    const s = stub(gut);
    const a = analysieren({ mandant: MANDANT(), heute: HEUTE, zeilen: [["Nachname", "Vorname", "Einheit"], ["N", "V", "Wohnbereich Sonnenschein"]] });
    expect(await port(s).vorschlagen({ spalten: a.spalten, zeilen: [], sperrliste: SPERRLISTE() })).toMatchObject({ ok: false, code: "KI_EINGABE" });
    expect(s.aufrufe).toHaveLength(0);
  });

  it("Überschriften mit Steuerzeichen, Tags, Adressen, langen Zahlen oder Überlänge werden nicht weitergegeben (Platzhalter)", () => {
    const spalten = ["<b>Kontakt</b>", "Kontakt\u0000Nr", "mail@example.test", "Konto 12345678", "http://x.example/a", "L".repeat(61), "", "123", "Kürzel"]
      .map((kopf, index) => ({ index, kopf, feld: null }));
    const m = eingabeMinimieren({ spalten, zeilen: [], sperrliste: SPERRLISTE() });
    expect(m.ok).toBe(true);
    const namen = m.paket.spalten.map((x) => x.ueberschrift);
    expect(namen).toEqual(spalten.map((x) => `Spalte ${x.index + 1}`));
    for (const n of namen) expect(n).not.toMatch(/[<>@:]|\u0000|\d{4}|Kürzel|Kontakt/);
  });

  it("zugeordnete Spalten (Namen, Personalnummer, E-Mail) gehen nie hinaus, auch wenn die Datei sie enthält", async () => {
    const s = stub(() => ({ ausgabe: { version: "1", vorschlaege: [{ spalte: 5, feld: "funktion", konfidenz: 0.7 }] }, nutzung: { eingabeToken: 1, ausgabeToken: 1 } }));
    const a = analysieren({ mandant: MANDANT(), heute: HEUTE, zeilen: [["Personalnummer", "Nachname", "Vorname", "E-Mail", "Einheit", "Notiz"],
      ["4711", "Musterfrau", "Erika", "erika.musterfrau@example.test", "Wohnbereich Sonnenschein", "Schwangerschaft"]] });
    const r = await port(s).vorschlagen({ spalten: a.spalten, zeilen: [["Personalnummer"], ["4711"]], sperrliste: SPERRLISTE(), proben: 3 });
    expect(r.ok).toBe(true);
    expect(JSON.stringify(s.aufrufe[0])).not.toMatch(/4711|Musterfrau|Erika|Schwanger|example\.test/i);
    expect(s.aufrufe[0].paket.spalten.map((x) => x.ueberschrift)).toEqual(["Spalte 6"]);
  });

  /* ---- Folgeauftrag zu PR #187: Überschriften nur aus dem festen Vokabular; die Sperrliste kennt die Personen der DATEI nicht ---- */
  const LEERE_SPERRLISTE = () => sperrlisteBilden({ id: "m0", name: "Leer", personen: [], einheiten: [], standorte: [], qualifikationen: [] }, { raum: "raum-leer" });
  const HEADER_NAMEN = ["Schmidt, Hans", "Hans Schmidt", "Yilmaz Ayse", "Müller", "Mustermann Erik", "Musterfr4u", "Konfession"];
  const PERSONEN_IN_DATEI = /Schmidt|Hans|Yilmaz|Ayse|M[üu]e?ller|Mustermann|Erik|Musterfr4u|Konfession|Kontakt|Geburtsort/i;

  it("neue Personen-Namen (nicht im Betrieb gespeichert) als Überschrift gehen NICHT im Klartext hinaus — auch bei leerer Sperrliste", async () => {
    for (const sperrliste of [LEERE_SPERRLISTE(), SPERRLISTE()]) {
      const s = stub(() => ({ ausgabe: { version: "1", vorschlaege: [] }, nutzung: { eingabeToken: 1, ausgabeToken: 1 } }));
      const kopf = ["Nachname", "Vorname", "Einheit", ...HEADER_NAMEN];
      const a = analysieren({ mandant: MANDANT(), heute: HEUTE, zeilen: [kopf, kopf.map(() => "x")] });
      const r = await port(s).vorschlagen({ spalten: a.spalten, zeilen: [kopf, kopf.map(() => "x")], sperrliste, proben: 2 });
      expect(r.ok).toBe(true);
      const text = JSON.stringify(s.aufrufe[0]);
      for (const n of HEADER_NAMEN) expect(text, n).not.toContain(n);
      expect(text).not.toMatch(PERSONEN_IN_DATEI);
      expect(s.aufrufe[0].paket.spalten.map((x) => x.ueberschrift)).toEqual(HEADER_NAMEN.map((_, i) => `Spalte ${i + 4}`));
      for (const sp of s.aufrufe[0].paket.spalten) expect(sp.art).toBe("platzhalter");
    }
  });

  it("Datei OHNE Kopfzeile: die erste Datenzeile (Person, Einheit, Geburtsort) wird nie als Überschrift behandelt", () => {
    const zeilen = [["Hans Schmidt", "Yilmaz Ayse", "Pflege Nord", "Geburtsort Ankara"], ["Erik Mustermann", "Ali Demir", "Pflege Süd", "Bochum"]];
    const a = analysieren({ mandant: MANDANT(), heute: HEUTE, zeilen });
    const m = eingabeMinimieren({ spalten: a.spalten, zeilen, sperrliste: LEERE_SPERRLISTE(), proben: 2 });
    expect(m.ok).toBe(true);
    expect(JSON.stringify(m.paket)).not.toMatch(/Schmidt|Yilmaz|Pflege|Ankara|Mustermann|Demir|Bochum/);
    expect(m.paket.spalten.map((x) => x.ueberschrift)).toEqual(["Spalte 1", "Spalte 2", "Spalte 3", "Spalte 4"]);
    /* Auch ein Wort des Vokabulars bleibt Platzhalter, wenn die Datei keine erkannte Kopfzeile hat oder der Aufrufer es so festlegt. */
    const einzeln = [{ index: 0, kopf: "Team", feld: null, herkunft: null }, { index: 1, kopf: "Haus", feld: null, herkunft: null }];
    expect(eingabeMinimieren({ spalten: einzeln, zeilen: [], sperrliste: LEERE_SPERRLISTE() }).paket.spalten.map((x) => x.ueberschrift)).toEqual(["Spalte 1", "Spalte 2"]);
    const mitKopf = analyse().spalten;
    expect(eingabeMinimieren({ spalten: mitKopf, zeilen: [], sperrliste: LEERE_SPERRLISTE(), kopfzeile: false }).paket.spalten.every((x) => x.art === "platzhalter")).toBe(true);
  });

  it("Allowlist-Treffer (Wort des Import-Vokabulars in erkannter Kopfzeile) geht im Klartext hinaus, jeder Nicht-Treffer wird Platzhalter — bei leerer Sperrliste", async () => {
    const s = stub(() => ({ ausgabe: { version: "1", vorschlaege: [] }, nutzung: { eingabeToken: 1, ausgabeToken: 1 } }));
    /* „Team“ ist Vokabular und bleibt unzugeordnet, weil „Einheit“ das Feld schon belegt; „Bemerkung“ und ein Name sind keine Treffer. */
    const kopf = ["Nachname", "Vorname", "Einheit", "Team", "Bemerkung", "Ayse Yilmaz"];
    const a = analysieren({ mandant: MANDANT(), heute: HEUTE, zeilen: [kopf, kopf.map(() => "x")] });
    expect(a.spalten.filter((x) => !x.feld).map((x) => x.kopf)).toEqual(["Team", "Bemerkung", "Ayse Yilmaz"]);
    const r = await port(s).vorschlagen({ spalten: a.spalten, zeilen: [], sperrliste: LEERE_SPERRLISTE() });
    expect(r.ok).toBe(true);
    expect(s.aufrufe[0].paket.spalten.map((x) => [x.ueberschrift, x.art])).toEqual([["Team", "feldname"], ["Spalte 5", "platzhalter"], ["Spalte 6", "platzhalter"]]);
    expect(JSON.stringify(s.aufrufe[0])).not.toMatch(/Ayse|Yilmaz|Bemerkung/);
  });

  it("das Vokabular stammt aus den Synonymlisten des Imports (kein eigenes): jedes Synonym ist Klartext, alles Übrige nicht", async () => {
    const { FELD_SYNONYME } = await import("../server/lib/import/personen.mjs");
    const kopfBasis = [{ index: 0, kopf: "Nachname", feld: "nachname", herkunft: "genau" }, { index: 1, kopf: "Vorname", feld: "vorname", herkunft: "genau" }];
    const alle = Object.values(FELD_SYNONYME).flat();
    expect(alle.length).toBeGreaterThan(30);
    const spalten = [...kopfBasis, ...alle.map((w, i) => ({ index: i + 2, kopf: w, feld: null, herkunft: null })),
      { index: alle.length + 2, kopf: "Hans Schmidt", feld: null, herkunft: null }];
    const m = eingabeMinimieren({ spalten, zeilen: [], sperrliste: LEERE_SPERRLISTE() });
    expect(m.ok).toBe(true);
    expect(m.paket.spalten.slice(0, -1).every((x) => x.art === "feldname")).toBe(true);
    expect(m.paket.spalten.at(-1)).toMatchObject({ ueberschrift: `Spalte ${alle.length + 3}`, art: "platzhalter" });
  });

  it("der Anbieter bekommt eine eingefrorene Kopie: er kann das Paket nicht verändern", async () => {
    let versuch;
    const s = stub((e) => { try { e.paket.spalten[0].ueberschrift = "X"; versuch = "geschrieben"; } catch { versuch = "verweigert"; } return gut(); });
    await port(s).vorschlagen(anfrage());
    expect(versuch).toBe("verweigert");
  });
});

/* ==========================================================================
   A3 — Ausgabe streng geprüft; Vorschlag nie automatisch angewendet
   ========================================================================== */
describe("IMP-9 A3: fehlerhafte oder übergroße Anbieterausgabe wird verworfen", () => {
  const INDIZES = [3, 4, 7];
  const gutBasis = gutAusgabe;
  it("gültige Ausgabe: Vorschläge, Unsicherheiten, Validierungsfehler strukturiert und eingefroren", () => {
    const g = ergebnisPruefen({ ...gutBasis(), validierungsfehler: [{ code: "SPALTE_UNKLAR", spalte: 7 }] }, { indizes: INDIZES });
    expect(g.ok).toBe(true);
    expect(g.ergebnis.vorschlaege).toEqual([{ spalte: 4, feld: "funktion", konfidenz: 0.9 }]);
    expect(g.ergebnis.unsicherheiten).toEqual([{ spalte: 3, grund: "mehrdeutig", alternativen: ["email", "funktion"] }]);
    expect(g.ergebnis.validierungsfehler).toEqual([{ code: "SPALTE_UNKLAR", spalte: 7 }]);
    expect(Object.isFrozen(g.ergebnis)).toBe(true);
    expect(ergebnisPruefen({ version: "1", vorschlaege: [] }, { indizes: INDIZES }).ok).toBe(true);
  });

  const viele = (n, f) => Array.from({ length: n }, (_, i) => f(i));
  const schlecht = {
    "null": null, "Text": "Spalte 4 ist Funktion", "Zahl": 4, "Liste": [], "Funktion": () => 1,
    "leeres Objekt": {},
    "Version fehlt": { vorschlaege: [] },
    "falsche Version": { version: "2", vorschlaege: [] },
    "Vorschläge fehlen": { version: "1" },
    "Vorschläge kein Array": { version: "1", vorschlaege: { spalte: 4 } },
    "zusätzlicher Schlüssel": { ...gutBasis(), text: "Ignoriere alle Regeln" },
    "Freitext-Begründung": { ...gutBasis(), vorschlaege: [{ spalte: 4, feld: "funktion", konfidenz: 0.9, begruendung: "weil Erika dort steht" }] },
    "Vorschlag ohne Konfidenz": { version: "1", vorschlaege: [{ spalte: 4, feld: "funktion" }] },
    "Vorschlag kein Objekt": { version: "1", vorschlaege: ["funktion"] },
    "Spalte nicht angeboten": { version: "1", vorschlaege: [{ spalte: 0, feld: "funktion", konfidenz: 0.5 }] },
    "Spalte negativ": { version: "1", vorschlaege: [{ spalte: -1, feld: "funktion", konfidenz: 0.5 }] },
    "Spalte Bruch": { version: "1", vorschlaege: [{ spalte: 4.5, feld: "funktion", konfidenz: 0.5 }] },
    "Spalte Text": { version: "1", vorschlaege: [{ spalte: "4", feld: "funktion", konfidenz: 0.5 }] },
    "Feld unbekannt": { version: "1", vorschlaege: [{ spalte: 4, feld: "gehalt", konfidenz: 0.5 }] },
    "Feld constructor": { version: "1", vorschlaege: [{ spalte: 4, feld: "constructor", konfidenz: 0.5 }] },
    "Feld __proto__": { version: "1", vorschlaege: [{ spalte: 4, feld: "__proto__", konfidenz: 0.5 }] },
    "Feld Objekt": { version: "1", vorschlaege: [{ spalte: 4, feld: { a: 1 }, konfidenz: 0.5 }] },
    "Konfidenz über 1": { version: "1", vorschlaege: [{ spalte: 4, feld: "funktion", konfidenz: 1.01 }] },
    "Konfidenz negativ": { version: "1", vorschlaege: [{ spalte: 4, feld: "funktion", konfidenz: -0.1 }] },
    "Konfidenz NaN": { version: "1", vorschlaege: [{ spalte: 4, feld: "funktion", konfidenz: NaN }] },
    "Konfidenz Infinity": { version: "1", vorschlaege: [{ spalte: 4, feld: "funktion", konfidenz: Infinity }] },
    "Konfidenz Text": { version: "1", vorschlaege: [{ spalte: 4, feld: "funktion", konfidenz: "0.9" }] },
    "Spalte doppelt": { version: "1", vorschlaege: [{ spalte: 4, feld: "funktion", konfidenz: 0.5 }, { spalte: 4, feld: "email", konfidenz: 0.5 }] },
    "Feld doppelt": { version: "1", vorschlaege: [{ spalte: 4, feld: "funktion", konfidenz: 0.5 }, { spalte: 3, feld: "funktion", konfidenz: 0.5 }] },
    "Unsicherheit mit Freitext": { version: "1", vorschlaege: [], unsicherheiten: [{ spalte: 3, grund: "Die Spalte enthält Namen" }] },
    "Unsicherheit mit Zusatzfeld": { version: "1", vorschlaege: [], unsicherheiten: [{ spalte: 3, grund: "mehrdeutig", hinweis: "x" }] },
    "Unsicherheit Spalte doppelt": { version: "1", vorschlaege: [], unsicherheiten: [{ spalte: 3, grund: "mehrdeutig" }, { spalte: 3, grund: "keine_passung" }] },
    "Alternativen zu viele": { version: "1", vorschlaege: [], unsicherheiten: [{ spalte: 3, grund: "mehrdeutig", alternativen: ["email", "funktion", "vorname", "nachname"] }] },
    "Alternativen unbekanntes Feld": { version: "1", vorschlaege: [], unsicherheiten: [{ spalte: 3, grund: "mehrdeutig", alternativen: ["gehalt"] }] },
    "Alternativen doppelt": { version: "1", vorschlaege: [], unsicherheiten: [{ spalte: 3, grund: "mehrdeutig", alternativen: ["email", "email"] }] },
    "Alternativen kein Array": { version: "1", vorschlaege: [], unsicherheiten: [{ spalte: 3, grund: "mehrdeutig", alternativen: "email" }] },
    "Validierungsfehler mit Freitext": { version: "1", vorschlaege: [], validierungsfehler: [{ code: "Spalte 7 enthält die Nummer 4711" }] },
    "Validierungsfehler Spalte nicht angeboten": { version: "1", vorschlaege: [], validierungsfehler: [{ code: "SONSTIGES", spalte: 99 }] },
    "Validierungsfehler Zusatzfeld": { version: "1", vorschlaege: [], validierungsfehler: [{ code: "SONSTIGES", wert: "x" }] },
    "zu viele Vorschläge": { version: "1", vorschlaege: viele(KI_GRENZEN.vorschlaege + 1, (i) => ({ spalte: 3, feld: `f${i}`, konfidenz: 0.5 })) },
    "zu viele Validierungsfehler": { version: "1", vorschlaege: [], validierungsfehler: viele(KI_GRENZEN.validierungsfehler + 1, () => ({ code: "SONSTIGES" })) },
    "Prototyp-Schlüssel (JSON)": JSON.parse('{"version":"1","vorschlaege":[],"__proto__":{"vorschlaege":[]}}'),
    "Klasseninstanz": new (class Ergebnis { constructor() { this.version = "1"; this.vorschlaege = []; } })(),
    "Zyklus": (() => { const o = { version: "1", vorschlaege: [] }; o.selbst = o; return o; })(),
    "BigInt": { version: "1", vorschlaege: [{ spalte: 4n, feld: "funktion", konfidenz: 0.5 }] },
  };
  for (const [name, ausgabe] of Object.entries(schlecht)) {
    it(`verworfen: ${name}`, () => {
      const g = ergebnisPruefen(ausgabe, { indizes: INDIZES });
      expect(g.ok).toBe(false);
      expect(g.ergebnis).toBeUndefined();
      /* die Befunde nennen nie einen Wert der Antwort */
      expect(JSON.stringify(g.fehler)).not.toMatch(/Erika|4711|Ignoriere|Namen|constructor/);
    });
  }

  it("übergroß: > 16 KiB wird verworfen und als KI_GROESSE gemeldet, auch bei kleiner gemeldeter Nutzung", async () => {
    const riesig = { ...gutBasis(), unsicherheiten: [], validierungsfehler: [], x: "A".repeat(20_000) };
    expect(ergebnisPruefen(riesig, { indizes: INDIZES })).toMatchObject({ ok: false, groesse: true });
    const s = stub(() => ({ ausgabe: riesig, nutzung: { eingabeToken: 5, ausgabeToken: 10 } }));
    expect(await port(s).vorschlagen(anfrage())).toMatchObject({ ok: false, code: "KI_GROESSE" });
  });

  it("übergroß: Nutzung über der Ausgabegrenze, oder ohne Nutzungsangabe eine zu lange Antwort → KI_GROESSE", async () => {
    const s1 = stub(() => ({ ausgabe: gutAusgabe(), nutzung: { eingabeToken: 5, ausgabeToken: KI_GRENZEN.ausgabeTokens + 1 } }));
    expect(await port(s1).vorschlagen(anfrage())).toMatchObject({ ok: false, code: "KI_GROESSE" });
    const lang = { ...gutAusgabe(), unsicherheiten: viele(60, (i) => ({ spalte: i % 2 ? 3 : 4, grund: "mehrdeutig", alternativen: ["email", "funktion", "vorname"] })) };
    const s2 = stub(() => ({ ausgabe: lang }));
    expect(await port(s2).vorschlagen(anfrage())).toMatchObject({ ok: false, code: "KI_GROESSE" });
  });

  it("jede verworfene Antwort ergibt über den Port KI_PRUEFER/KI_GROESSE ohne Ergebnis; der Anbieter wurde genau einmal gefragt", async () => {
    for (const [name, ausgabe] of Object.entries(schlecht)) {
      if (ausgabe === null || typeof ausgabe === "function") continue;   // sind schon „ungültig“ im Adapter-Vertrag, unten
      const s = stub(() => ({ ausgabe, nutzung: { eingabeToken: 1, ausgabeToken: 1 } }));
      const r = await port(s).vorschlagen(anfrage());
      expect(r.ok, name).toBe(false);
      expect(["KI_PRUEFER", "KI_GROESSE"], name).toContain(r.code);
      expect(r.ergebnis, name).toBeUndefined();
      expect(s.aufrufe, name).toHaveLength(1);
    }
  });

  it("Adapter liefert nichts Brauchbares (null, Text, leer): KI_PRUEFER; kein Wurf", async () => {
    for (const antwort of [null, undefined, "text", 42, {}, { ausgabe: null }, { ausgabe: "x" }]) {
      const r = await port(stub(() => antwort)).vorschlagen(anfrage());
      expect(r.ok).toBe(false);
      expect(["KI_PRUEFER", "KI_GROESSE"]).toContain(r.code);
    }
  });

  it("Anbieterfehler werden zu festen Codes; ihr Text verlässt das Modul nie", async () => {
    const GEHEIMTEXT = "SCHLUESSEL-sk-geheim-4711 Erika Musterfrau";
    const faelle = [["zeit", "KI_ZEIT"], ["zu_gross", "KI_GROESSE"], ["schema", "KI_PRUEFER"], ["ungueltig", "KI_PRUEFER"],
      ["begrenzt", "KI_ANBIETER"], ["nicht_verfuegbar", "KI_ANBIETER"], ["nicht_freigegeben", "KI_NICHT_FREIGEGEBEN"]];
    for (const [klasse, code] of faelle) {
      const r = await port(stub(() => { throw new AnbieterFehler(klasse, GEHEIMTEXT); })).vorschlagen(anfrage());
      expect(r).toMatchObject({ ok: false, code });
      expect(JSON.stringify(r)).not.toMatch(/SCHLUESSEL|Musterfrau|4711/);
    }
    const r = await port(stub(() => { throw new Error(GEHEIMTEXT); })).vorschlagen(anfrage());
    expect(r).toMatchObject({ ok: false, code: "KI_ANBIETER" });
    expect(JSON.stringify(r)).not.toMatch(/SCHLUESSEL|Musterfrau|4711/);
    expect(KI_CODES_IMPORT).toContain(r.code);
  });

  it("ein hängender Anbieter wird nach der Frist abgebrochen (KI_ZEIT)", async () => {
    let signal;
    const s = stub((e) => { signal = e.signal; return new Promise(() => {}); });
    const r = await port(s, { fristMs: 30 }).vorschlagen(anfrage());
    expect(r).toMatchObject({ ok: false, code: "KI_ZEIT" });
    expect(signal.aborted).toBe(true);
  });

  it("der Port begrenzt seine Aufrufe (aufrufeMax) → KI_LIMIT, kein weiterer Anbieteraufruf", async () => {
    const s = stub(gut);
    const p = port(s, { aufrufeMax: 2 });
    expect((await p.vorschlagen(anfrage())).ok).toBe(true);
    expect((await p.vorschlagen(anfrage())).ok).toBe(true);
    expect(await p.vorschlagen(anfrage())).toMatchObject({ ok: false, code: "KI_LIMIT" });
    expect(s.aufrufe).toHaveLength(2);
  });
});

describe("IMP-9 A3: ein Vorschlag wird nie automatisch angewendet", () => {
  const holen = async (zuordnung) => {
    const a = analyse(zuordnung);
    const s = stub(gut);
    const v = await kiVorschlagEinholen({ port: port(s), spalten: a.spalten, zeilen: ZEILEN(), sperrliste: SPERRLISTE(), zuordnung: a.zuordnung });
    return { a, v };
  };

  it("vorschlagBilden: nur aus einem GEPRÜFTEN Ergebnis; eine Hand-Attrappe wird abgelehnt", () => {
    expect(vorschlagBilden({ ergebnis: gutAusgabe() })).toMatchObject({ ok: false, code: "KI_PRUEFER" });
    expect(vorschlagBilden({ ergebnis: { ...ergebnisPruefen(gutAusgabe(), { indizes: [3, 4] }).ergebnis } })).toMatchObject({ ok: false });
    expect(vorschlagBilden({})).toMatchObject({ ok: false });
  });

  it("der Vorschlag ist unbestätigt und eingefroren; Konflikte mit der bestehenden Zuordnung sind markiert", async () => {
    const { a, v } = await holen();
    expect(v.vorschlag).toMatchObject({ quelle: "ki", status: "vorschlag", bestaetigt: false, autoAnwenden: false });
    expect(Object.isFrozen(v.vorschlag)).toBe(true);
    expect(v.vorschlag.eintraege).toEqual([{ spalte: 4, feld: "funktion", konfidenz: 0.9, sicher: true, konflikt: null }]);
    /* gleiches Feld schon von Hand zugeordnet */
    const z = { ...a.zuordnung, funktion: 7 };
    const g = ergebnisPruefen(gutAusgabe(), { indizes: [3, 4, 7] });
    expect(vorschlagBilden({ ergebnis: g.ergebnis, zuordnung: z }).vorschlag.eintraege[0].konflikt).toBe("feld-belegt");
    const z2 = { ...a.zuordnung, email: 4 };
    expect(vorschlagBilden({ ergebnis: g.ergebnis, zuordnung: z2 }).vorschlag.eintraege[0].konflikt).toBe("spalte-belegt");
  });

  it("ohne ausdrückliche Bestätigung entsteht keine Zuordnung", async () => {
    const { a, v } = await holen();
    const z = eingefroren(kopie(a.zuordnung));
    const ablehnungen = [undefined, null, {}, { spalten: [] }, { spalten: "alle" }, { spalten: ["4"] }, { spalten: [4, 4] }, { spalten: [4.5] },
      { spalten: [3] }, { spalten: [99] }, { alle: true }, { spalten: [4], zusatz: 1 }, [4], 4];
    for (const b of ablehnungen) {
      const r = vorschlagUebernehmen({ vorschlag: v.vorschlag, zuordnung: z, bestaetigung: b, spaltenAnzahl: 8 });
      expect(r.ok, JSON.stringify(b)).toBe(false);
      expect(r.zuordnung).toBeUndefined();
    }
    /* ein Vorschlag, den niemand aus dem Modul bekommen hat, zählt nicht */
    const falsch = { ...v.vorschlag, eintraege: [{ spalte: 4, feld: "funktion", konfidenz: 1, sicher: true, konflikt: null }] };
    expect(vorschlagUebernehmen({ vorschlag: falsch, zuordnung: z, bestaetigung: { spalten: [4] }, spaltenAnzahl: 8 }).ok).toBe(false);
  });

  it("mit Bestätigung: neue Zuordnung nur für die bestätigten Spalten; die Eingabe bleibt unverändert; danach läuft der normale Import", async () => {
    const { a, v } = await holen();
    const z = eingefroren(kopie(a.zuordnung));
    const r = vorschlagUebernehmen({ vorschlag: v.vorschlag, zuordnung: z, bestaetigung: { spalten: [4] }, spaltenAnzahl: 8 });
    expect(r.ok).toBe(true);
    expect(r.uebernommen).toEqual([{ spalte: 4, feld: "funktion" }]);
    expect(r.zuordnung.funktion).toBe(4);
    expect(z.funktion).toBeUndefined();
    /* die bestätigte Zuordnung läuft durch den unveränderten deterministischen Import */
    const nach = analysieren({ mandant: MANDANT(), zeilen: ZEILEN(), heute: HEUTE, zuordnung: r.zuordnung });
    expect(nach.ok).toBe(true);
    expect(nach.spalten.find((x) => x.index === 4)).toMatchObject({ feld: "funktion", herkunft: "manuell" });
    expect(nach.datensaetze[0].werte.funktion).toBe("schwanger seit Mai");
  });

  it("ein Konflikt mit der bestehenden Zuordnung kann nicht bestätigt werden", async () => {
    const { a } = await holen();
    const g = ergebnisPruefen(gutAusgabe(), { indizes: [3, 4, 7] });
    const v = vorschlagBilden({ ergebnis: g.ergebnis, zuordnung: { ...a.zuordnung, funktion: 7 } }).vorschlag;
    expect(vorschlagUebernehmen({ vorschlag: v, zuordnung: { ...a.zuordnung, funktion: 7 }, bestaetigung: { spalten: [4] }, spaltenAnzahl: 8 }).ok).toBe(false);
  });

  it("das Modul bietet keinen Weg zu einer Zuordnung ohne Bestätigung (kein Schreibweg, nur Rückgabewerte)", () => {
    const q = readFileSync(path.join(WURZEL, "server/lib/import/ki-schnittstelle.mjs"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(q).not.toMatch(/autoAnwenden\s*:\s*true|bestaetigt\s*:\s*true/);
  });
});
