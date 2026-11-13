/* ==========================================================================
   ABNAHME V4, A-3 — DIFFERENZGARANTIE FÜR BESTANDSBETRIEBE (PR #281)

   Frage des Betreibers (2026-11-14): Lässt sich #281 in integration/release-v4
   einbringen, ohne die strengeren Regeln für BESTEHENDE Betriebe vorzeitig zu
   aktivieren?

   Beweisweg: Der Szenarienkatalog (pruefungen/hilfen/erstleitung-bestand-
   szenarien.mjs) lief gegen die Basis OHNE #281; die maskierten Ausgaben
   stehen in pruefungen/fixtures/erstleitung-bestand-differenz.golden.json
   (Erzeugung: pruefungen/hilfen/erstleitung-bestand-golden.mjs). Hier läuft
   derselbe Katalog gegen DIESE Fassung, je Schalterwert (ungesetzt, „1“,
   „TRUE“, „ true“, „true “ — alle aus), und wird verglichen:
     gleich  Statuscodes, Antwortrümpfe, angelegte/geänderte/entfernte
             Ablagedateien (Bestand, Zugänge, Sitzungen, Protokoll, Marken,
             Sicherungen) müssen der Basis entsprechen — bis auf die unten
             einzeln benannten, dokumentierten Abweichungen (B-1, B-2).
     kipp    die Vorgänge, die einen Betrieb auf das strenge Regime stellen,
             werden ausdrücklich geprüft (Marke, Wirkung).
   Dazu B-3 (Oberfläche, ohne Server): der bisherige Ablauf für die erste
   Person eines leeren Bestandsbetriebs, Feld für Feld gegen die Fassung vor
   #281.
   Bericht: docs/acc45/ABNAHME-V4-A3-BESTAND-GARANTIE.md

   Aufruf: npx vitest run pruefungen/erstleitung-bestand-differenz.test.js --testTimeout=600000 --hookTimeout=900000
   ========================================================================== */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { lauf, SCHALTER } from "./hilfen/erstleitung-bestand-szenarien.mjs";
import { sitzungAltweg } from "../src/app/zugangssitzung.js";
import { ROLLENBEZEICHNUNG } from "../src/lib/rollen.js";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GOLDEN = JSON.parse(readFileSync(new URL("./fixtures/erstleitung-bestand-differenz.golden.json", import.meta.url), "utf8"));
const kopie = (x) => JSON.parse(JSON.stringify(x));
const NAMEN = Object.keys(GOLDEN.szenarien);
const GLEICH = NAMEN.filter((k) => GOLDEN.szenarien[k].klasse === "gleich");
const kipp = (praefix) => { const n = NAMEN.find((k) => k.startsWith(praefix)); if (!n) throw new Error(`Szenario ${praefix} fehlt`); return n; };
const OHNE_PERSON = "Ihr Zugang ist keiner Person zugeordnet.";

/* --------------------------------------------------------------------------
   BEKANNTE, DOKUMENTIERTE ABWEICHUNGEN (Bericht, Abschnitt „Befunde“).
   Jede wird nur in genau der beschriebenen Form toleriert; jede andere Form
   bleibt ein Unterschied und lässt die Prüfung scheitern.
   -------------------------------------------------------------------------- */
/** B-1: GET /api/bestand meldet zusätzlich `erstleitungStreng` — für Bestandsbetriebe bei Schalter aus genau `false`. */
function ohneStrengAngabe(szenario, x) {
  for (const s of x.schritte) {
    const r = s.rumpf;
    if (r && typeof r === "object" && !Array.isArray(r) && Object.prototype.hasOwnProperty.call(r, "erstleitungStreng")) {
      expect(r.erstleitungStreng, `${szenario} / ${s.schritt}: erstleitungStreng`).toBe(false);
      delete r.erstleitungStreng;
    }
  }
}

/** B-2: Umschlüsseln eines Altcodes ohne Betriebskennung — #281 behält die beim Anmelden geschriebene Bindung
 *  (mandantId, gebunden) am alten und am neuen Eintrag; die Basis überschrieb sie mit einer vorher gelesenen Kopie. */
const B2_SZENARIO = "Altcode unter alter Prüfsumme ohne Kennung: Bindung und Umschlüsseln";
/* Der neue Eintrag des Codes MIT Person wird in der Basis bei der zweiten Anmeldung erneut gebunden und gleicht dann #281. */
const B2_SCHLUESSEL = ["centric/konto:<KA:alt-leitung>", "centric/konto:<KA:alt-ohne>", "centric/konto:<KS:alt-ohne>"];
function bindungBeimUmschluesseln(szenario, x) {
  if (szenario !== B2_SZENARIO) return;
  let n = 0;
  for (const e of x.ablage) {
    const d = e.wert && e.wert.daten;
    if (!B2_SCHLUESSEL.includes(e.schluessel) || !d || typeof d !== "object") continue;
    if (d.mandantId === "bd-alt" && d.gebunden === "<ZEIT>" && (d.ersetztDurch || d.umgeschluesselt)) {
      d.mandantId = null; delete d.gebunden; n += 1;
    }
  }
  /* Genau drei Einträge: alter Schlüssel (Person), alter und neuer Schlüssel (ohne Person). */
  expect(n, "B-2: Zahl der Einträge mit erhaltener Bindung").toBe(3);
  x.ablage = x.ablage.map((e) => JSON.stringify(e)).sort().map((e) => JSON.parse(e));
}

function bereinigt(szenario, ist) {
  const x = kopie(ist);
  ohneStrengAngabe(szenario, x);
  bindungBeimUmschluesseln(szenario, x);
  return x;
}

const marken = (e) => e.ablage.filter((a) => /^centric\/erstleitung-(regime|marke):/.test(a.schluessel));
const schritt = (e, name) => { const s = e.schritte.find((x) => x.schritt === name); if (!s) throw new Error(`Schritt ${name} fehlt`); return s; };
/** Für die Kipp-Szenarien: die bekannte Marke, Vermerk und Kennzeichen herausnehmen — der Rest muss der Basis gleichen. */
function ohneRegime(x) {
  const y = kopie(x);
  y.ablage = y.ablage.filter((a) => !/^centric\/erstleitung-regime:/.test(a.schluessel)).map((a) => {
    if (a.wert && a.wert.daten && a.wert.daten.erstleitung) { const c = kopie(a); delete c.wert.daten.erstleitung; return c; }
    return a;
  }).map((e) => JSON.stringify(e)).sort().map((e) => JSON.parse(e));
  for (const s of y.schritte) if (s.rumpf && Array.isArray(s.rumpf.zugaenge))
    for (const z of s.rumpf.zugaenge) delete z.erstanmeldung;
  ohneStrengAngabe("kipp", y);
  return y;
}

describe.each(SCHALTER)("Bestandsbetriebe, Schalter %s", (_name, wert) => {
  /** @type {Record<string, any>} */
  let ist;
  beforeAll(async () => { ist = await lauf({ wurzel: WURZEL, schalter: wert }); }, 900_000);

  it("Katalog vollständig: dieselben Szenarien wie die Golden-Aufzeichnung", () => {
    expect(Object.keys(ist).sort()).toEqual([...NAMEN].sort());
  });

  it.each(GLEICH)("gleich: %s", (name) => {
    const g = GOLDEN.szenarien[name];
    const i = bereinigt(name, ist[name]);
    /* Kein Bestandsbetrieb bekommt eine Marke. */
    expect(marken(i)).toEqual([]);
    expect(i.schritte).toEqual(g.schritte);
    expect(i.ablage).toEqual(g.ablage);
  });

  /* ---------------- KIPP: was einen Betrieb streng macht ---------------- */
  it("KIPP-1 /api/zugaenge (nur Betreiber): leerer Bestandsbetrieb ohne Zugänge — Regime-Marke, Erstanmeldecode", () => {
    const n = kipp("KIPP-1"); const g = GOLDEN.szenarien[n]; const i = ist[n];
    expect(marken(g)).toEqual([]);
    expect(marken(i).map((m) => [m.schluessel, m.wert.daten.durch])).toEqual([["centric/erstleitung-regime:bd-k1:bd-k1", "Erstanmeldecode"]]);
    expect(schritt(i, "Zugänge").rumpf.zugaenge[0].erstanmeldung).toBe(true);
    expect(ohneRegime(i)).toEqual(g);
  });

  it("KIPP-2 /api/zugaenge im offenen Fenster: ein schon ausgegebener Leitungscode ohne Person wird abgewiesen (Aussperrung)", () => {
    const n = kipp("KIPP-2"); const g = GOLDEN.szenarien[n]; const i = ist[n];
    expect(marken(g)).toEqual([]);
    expect(marken(i).map((m) => m.schluessel)).toEqual(["centric/erstleitung-regime:bd-k2:bd-k2"]);
    expect(schritt(g, "anmelden alter Leitungscode").status).toBe(200);
    expect(schritt(i, "anmelden alter Leitungscode").status).toBe(403);
    expect(schritt(i, "anmelden alter Leitungscode").rumpf.fehler).toBe(OHNE_PERSON);
    /* Nur der Leitungscode ohne Person wird Erstanmeldecode, der Planungscode nicht. */
    expect(schritt(i, "Zugänge").rumpf.zugaenge.map((z) => z.erstanmeldung === true)).toEqual([false, true]);
  });

  it("KIPP-3 /einrichten (Verwaltungsgeheimnis/Verwalter): leerer Bestandsbetrieb ohne Zugänge — Regime-Marke", () => {
    const n = kipp("KIPP-3"); const g = GOLDEN.szenarien[n]; const i = ist[n];
    expect(marken(g)).toEqual([]);
    expect(marken(i).map((m) => [m.schluessel, m.wert.daten.durch])).toEqual([["centric/erstleitung-regime:bd-k3:bd-k3", "Erstanmeldecode"]]);
    expect(ohneRegime(i)).toEqual(g);
  });

  it("KIPP-4 Betreiber-PUT: Betrieb entfernt und mit derselben Kennung wieder eingefügt — streng, Leitungscode ohne Person ausgesperrt", () => {
    const n = kipp("KIPP-4"); const g = GOLDEN.szenarien[n]; const i = ist[n];
    expect(schritt(g, "PUT B wieder").status).toBe(200);
    expect(schritt(i, "PUT B wieder").status).toBe(200);
    expect(marken(g)).toEqual([]);
    expect(marken(i).map((m) => [m.schluessel, m.wert.daten.durch])).toEqual([["centric/erstleitung-regime:bd-k4:bd-k4-b", "Betreiber"]]);
    expect(schritt(g, "anmelden Leitung B nachher").status).toBe(200);
    expect(schritt(i, "anmelden Leitung B nachher").status).toBe(403);
    expect(schritt(i, "anmelden Leitung B nachher").rumpf.fehler).toBe(OHNE_PERSON);
  });

  it("KIPP-5 Betreiber-PUT: neuer Betrieb im Bestandsraum — nur er wird streng, der Bestandsbetrieb bleibt", () => {
    const n = kipp("KIPP-5"); const g = GOLDEN.szenarien[n]; const i = ist[n];
    expect(marken(i).map((m) => m.schluessel)).toEqual(["centric/erstleitung-regime:bd-k5:bd-k5-neu"]);
    expect(schritt(i, "anmelden Leitung A (Bestandsbetrieb)")).toEqual(schritt(g, "anmelden Leitung A (Bestandsbetrieb)"));
    expect(ohneRegime(i)).toEqual(g);
  });

  it("KIPP-6 /api/bestand-anlegen: ein neuer Raum ist streng ab der Anlage (kein Bestandsbetrieb)", () => {
    const n = kipp("KIPP-6"); const g = GOLDEN.szenarien[n]; const i = ist[n];
    expect(marken(i).map((m) => m.schluessel)).toEqual(["centric/erstleitung-regime:bd-k6:bd-k6"]);
    expect(ohneRegime(i)).toEqual(g);
  });
});

/* --------------------------------------------------------------------------
   B-3 (Oberfläche): Die erste Person eines leeren Bestandsbetriebs entsteht
   im bisherigen Ablauf (sitzungAltweg) Feld für Feld wie vor #281 (inline in
   src/App.jsx der Basis, hier abgeschrieben) — mit EINER Abweichung: `email`
   ist leer statt der Kontaktadresse des Betriebs (Betreiberentscheidung
   E-Mail, 2026-11-13).
   -------------------------------------------------------------------------- */
describe("B-3: bisheriger Ablauf der Oberfläche für Bestandsbetriebe", () => {
  /** Der Ablauf vor #281 (src/App.jsx, integration/release-v4 bcddf680), nur der Zweig „Betrieb ohne Personen“. */
  function basisErstePerson(mand, zugang, tag, id) {
    const ersteEinheit = (mand.einheiten || [])[0];
    return { id, vorname: "", nachname: ROLLENBEZEICHNUNG[zugang.rolle] || "Leitung", funktion: ROLLENBEZEICHNUNG[zugang.rolle] || "Leitung",
      email: mand.kontakt || "", zugehoerigkeit: ersteEinheit ? [{ ab: mand.seit || tag, einheitId: ersteEinheit.id }] : [],
      eintritt: mand.seit || tag, austritt: null, wochenstunden: (mand.einstellungen || {}).wochenstunden || 40,
      urlaubsanspruch: (mand.einstellungen || {}).urlaubsanspruch || 30, urlaubsuebertrag: 0, stundenuebertrag: 0,
      qualifikationen: [], teilzeit: null, springer: false, einschraenkungen: {}, rolle: zugang.rolle, rolleSeit: tag,
      rolleVerlauf: [], bereich: "ALLE", status: "aktiv", imSchichtdienst: false };
  }
  it.each(["leitung", "planer", "betriebsrat"])("Code %s ohne Person, Betrieb leer: gleich bis auf email", (rolle) => {
    const mand = { id: "m1", name: "Haus", kontakt: "kontakt@beispiel.invalid", seit: "2026-01-01", einheiten: [{ id: "e1" }],
      einstellungen: {}, personen: [] };
    const zugang = { rolle, person: null, betrieb: 0, demo: false, erstleitungStreng: false };
    const r = sitzungAltweg({ mandanten: [mand] }, zugang, "2026-11-14", () => "p_fest01");
    expect(r.fehler).toBeNull();
    const p = r.bestand.mandanten[0].personen[0];
    const basis = basisErstePerson(mand, zugang, "2026-11-14", "p_fest01");
    expect(p.email).toBe("");
    expect(basis.email).toBe("kontakt@beispiel.invalid");
    expect({ ...p, email: null }).toEqual({ ...basis, email: null });
    expect(r.bestand.session).toEqual({ rolle: "kunde", mandantId: "m1", personId: "p_fest01" });
  });
});
