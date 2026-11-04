/* ==========================================================================
   WP-19.0 — NACHTRAG ZUM DRITTEN UNABHÄNGIGEN OPUS-DELTA-REVIEW

   Je Befund ein Block; die Sonde des Reviewers steht als erster Fall.
   Zuordnung Befund ↔ Test: docs/acc45/wp19-0-nachweis.md, Abschnitt 13.

     F1  Löschvermerk löscht beim Wiederherstellen legitime SPÄTERE Daten
     F2  Ausnahmeangabe wird bei Fehlschlag verbraucht (speicher.js)
     F3  Berichtigungsvermerk hängt am alten Wert
     F4  Löschvermerke pseudonym (Durchprobieren Person × Tag)
     F5  Aktenzeichen-Muster ließ Namen zu („Mueller-1")
     F6  Berichtigung lässt beliebige Werte zu (Wertschema des Moduls)
     R2 R3 R5 R7 R11  Testlücken (überlebende Mutanten des Reviewers)
   ========================================================================== */
import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import * as BM from "../server/lib/branchenmodule.mjs";
import { BRANCHENMODULE } from "../server/lib/branchenmodule.mjs";
import * as AUF from "../server/lib/aufbewahrung.mjs";
import * as RS from "../server/lib/regelstatus.mjs";
import * as MS from "../server/lib/modulschreibwege.mjs";
import { bestandFuerRolle } from "../server/lib/rechte.mjs";
import { betriebWiederherstellen } from "../server/lib/sicherungen.mjs";
import { branchenbestand, schreibeAls, SITZUNGEN } from "./hilfen/branchenbetrieb.mjs";

const kopie = (x) => JSON.parse(JSON.stringify(x));
const EIN = "2026-10-01T08:00:00.000Z";
const AUS = { an: false, eingeschaltetAm: EIN, geaendertAm: EIN, geaendertVon: "l1" };
const PLAN = { "a1|2026-11-02": "po1", "a1|2026-11-03": "po1", "s1|2026-11-02": "po2" };
const OBJ = [{ id: "ob1", name: "Werk", posten: [{ id: "po1", name: "Tor", soll: { F: 1 } }, { id: "po2", name: "Halle", soll: { F: 1 } }] }];
const LOESCH = { modul: "posten", art: "loeschung", grund: "art17", eintraege: { postenPlan: ["a1|2026-11-02"] } };
const BERICHT = { modul: "posten", art: "berichtigung", grund: "art16", eintraege: { postenPlan: ["a1|2026-11-03"] } };
/** Ein Betrieb mit ausgeschaltetem Posten-Modul (Daten nur lesbar). */
const gesamt = (bm = { posten: AUS }) => {
  const g = branchenbestand({ pakete: ["sicherheit"], branchenmodule: bm });
  g.mandanten[0].postenPlan = { ...PLAN };
  g.mandanten[0].objekte = kopie(OBJ);
  return g;
};
/** Das Modul gilt wieder als eingeschaltet (Schalter entfernt) — Vermerke müssen trotzdem wirken. */
const wiederAn = (g) => { const x = kopie(g); delete x.mandanten[0].einstellungen.branchenmodule; return x; };
const HEUTE = new Date("2026-11-04T10:00:00Z");
const zurueck = (heute, sicherung, sicherungsZeit) => betriebWiederherstellen(heute, sicherung, SITZUNGEN.LT,
  { marke: "x", heute: HEUTE, datenschutz: "aus", ...(sicherungsZeit !== undefined ? { sicherungsZeit } : {}) });
const um = (iso, ms) => new Date(Date.parse(iso) + ms).toISOString();
const vermerkAm = (g) => g.mandanten[0].einstellungen.moduldatenLoeschvermerke.at(-1).am;

const TM = Object.freeze({ id: "testmodul", merkmal: "testmodul", name: "Testmodul", pakete: ["sicherheit"], status: "vorlaeufig",
  abhaengigVon: [], mitbestimmung: false, datenfelder: ["testDaten", "testListe"], personenfelder: ["testDaten"], sachfelder: ["testListe"],
  regelIds: [], parameter: {}, ausnahmeUi: true, berichtigungsWerte: { testDaten: (w) => typeof w === "string" && /^[A-Z]$/.test(w) },
  abnahme: { datum: "2026-12-01", nachweis: "docs/acc45/wp19-13-nachweis.md" } });
const LISTE = [...BRANCHENMODULE, TM];

/* Der Pfeffer des Servers (CENTRIC_PFEFFER) — je Fall gesetzt oder entfernt, danach wie vorher. */
const PFEFFER_VORHER = process.env.CENTRIC_PFEFFER;
const pfeffer = (w) => { if (w === undefined) delete process.env.CENTRIC_PFEFFER; else process.env.CENTRIC_PFEFFER = w; };
afterEach(() => pfeffer(PFEFFER_VORHER));

/* ======================================================================== */
describe("F1 — Löschvermerk wirkt nur auf Sicherungen, die vor der Löschung entstanden", () => {
  it("Sonde: Art. 17 löscht a1|2026-11-02, Modul wieder an, derselbe Schlüssel legitim neu geplant, Sicherung, Wiederherstellen → neuer Eintrag bleibt", () => {
    const v = schreibeAls(gesamt(), "LT", (m) => { delete m.postenPlan["a1|2026-11-02"]; m.moduldatenAusnahme = LOESCH; });
    expect(v.verweigert).toBeFalsy();
    const am = vermerkAm(v);
    const spaeter = wiederAn(v); spaeter.mandanten[0].postenPlan["a1|2026-11-02"] = "po2";       // legitime Neuplanung
    const sicherung = kopie(spaeter);
    const w = zurueck(spaeter, sicherung, um(am, 60000));
    expect(w.verweigert).toBeFalsy();
    expect(w.bestand.mandanten[0].postenPlan["a1|2026-11-02"]).toBe("po2");
    /* Auch über das Feld `erzeugt` einer Betriebssicherung (ohne Metadaten-Zeit). */
    const fassung2 = { umfang: "betrieb", mandantId: "m1", mandant: kopie(spaeter.mandanten[0]), erzeugt: um(am, 60000) };
    expect(zurueck(spaeter, fassung2).bestand.mandanten[0].postenPlan["a1|2026-11-02"]).toBe("po2");
  });
  it("eine Sicherung von vor der Löschung bringt den gelöschten Eintrag weiterhin nicht zurück", () => {
    const vorher = gesamt();
    const v = schreibeAls(vorher, "LT", (m) => { delete m.postenPlan["a1|2026-11-02"]; m.moduldatenAusnahme = LOESCH; });
    const am = vermerkAm(v);
    const spaeter = wiederAn(v); spaeter.mandanten[0].postenPlan["a1|2026-11-02"] = "po2";
    for (const zeit of [um(am, -60000), am]) {
      const heute = wiederAn(v);
      expect(zurueck(heute, vorher, zeit).bestand.mandanten[0].postenPlan["a1|2026-11-02"], zeit).toBeUndefined();
    }
    /* Sicherungszeit unbekannt oder unlesbar: der Vermerk wirkt (Datenschutz vor Verfügbarkeit). */
    for (const zeit of [null, "kaputt"]) expect(zurueck(wiederAn(v), vorher, zeit).bestand.mandanten[0].postenPlan["a1|2026-11-02"]).toBeUndefined();
  });
  it("erneute Löschung nach Neuplanung: eine Sicherung zwischen beiden Löschungen bringt den neuen Wert nicht zurück", () => {
    const v1 = schreibeAls(gesamt(), "LT", (m) => { delete m.postenPlan["a1|2026-11-02"]; m.moduldatenAusnahme = LOESCH; });
    const t1 = vermerkAm(v1);
    /* Neuplanung, dann zweite Löschung (Vermerk mit späterem Zeitpunkt, von Hand nachgebildet). */
    const zwischen = wiederAn(v1); zwischen.mandanten[0].postenPlan["a1|2026-11-02"] = "po2";
    const v2 = kopie(zwischen); delete v2.mandanten[0].postenPlan["a1|2026-11-02"];
    const vm = v2.mandanten[0].einstellungen.moduldatenLoeschvermerke;
    vm.push({ ...vm[0], am: um(t1, 3600000) });
    expect(zurueck(v2, zwischen, um(t1, 60000)).bestand.mandanten[0].postenPlan["a1|2026-11-02"]).toBeUndefined();
    expect(zurueck(v2, zwischen, um(t1, 7200000)).bestand.mandanten[0].postenPlan["a1|2026-11-02"]).toBe("po2");
  });
});

/* ======================================================================== */
describe("F3 — Berichtigungsvermerk über den Schlüssel (mit Zeitbedingung)", () => {
  it("Sonde: eine noch ältere Sicherung mit anderem falschen Wert wird ebenfalls auf den jetzigen Wert gesetzt", () => {
    const vorher = gesamt();
    const v = schreibeAls(vorher, "LT", (m) => { m.postenPlan["a1|2026-11-03"] = "po2"; m.moduldatenAusnahme = BERICHT; });
    expect(v.verweigert).toBeFalsy();
    const am = vermerkAm(v);
    const heute = wiederAn(v);
    for (const alterWert of ["po1", "po9-noch-aelter"]) {
      const s = kopie(vorher); s.mandanten[0].postenPlan["a1|2026-11-03"] = alterWert;
      expect(zurueck(heute, s, um(am, -60000)).bestand.mandanten[0].postenPlan["a1|2026-11-03"], alterWert).toBe("po2");
    }
    /* Kein Wert im Vermerk (auch nicht gehasht): er hängt nur an Betrieb, Feld und Schlüssel. */
    const h = v.mandanten[0].einstellungen.moduldatenLoeschvermerke[0].h;
    expect(h).toBe(MS.loeschvermerkHash("m1", "postenPlan", "a1|2026-11-03"));
  });
  it("in einer älteren Sicherung gilt der jetzige Wert; eine spätere Sicherung behält ihren Wert", () => {
    const v = schreibeAls(gesamt(), "LT", (m) => { m.postenPlan["a1|2026-11-03"] = "po2"; m.moduldatenAusnahme = BERICHT; });
    const am = vermerkAm(v);
    const heute = wiederAn(v); heute.mandanten[0].postenPlan["a1|2026-11-03"] = "po1";              // später legitim geändert
    const alt = kopie(gesamt()); alt.mandanten[0].postenPlan["a1|2026-11-03"] = "po2";
    expect(zurueck(heute, alt, um(am, -60000)).bestand.mandanten[0].postenPlan["a1|2026-11-03"]).toBe("po1");
    const neu = kopie(heute); neu.mandanten[0].postenPlan["a1|2026-11-03"] = "po2";
    expect(zurueck(heute, neu, um(am, 60000)).bestand.mandanten[0].postenPlan["a1|2026-11-03"]).toBe("po2");
    /* Fehlt der Schlüssel heute, fällt er aus der älteren Sicherung weg. */
    const ohne = kopie(heute); delete ohne.mandanten[0].postenPlan["a1|2026-11-03"];
    expect(zurueck(ohne, alt, um(am, -60000)).bestand.mandanten[0].postenPlan["a1|2026-11-03"]).toBeUndefined();
  });
});

/* ======================================================================== */
describe("F4 — Löschvermerke mit dem Serverschlüssel (CENTRIC_PFEFFER), sonst pseudonym", () => {
  const durchprobieren = (ziel, hash) => {
    for (const p of ["l1", "k1", "p1", "s1", "a1", "b1"]) for (let d = 0; d < 400; d++) {
      const t = new Date(Date.UTC(2026, 0, 1) + d * 864e5).toISOString().slice(0, 10);
      if (hash(`${p}|${t}`) === ziel) return `${p}|${t}`;
    }
    return null;
  };
  it("Sonde: ohne Pfeffer findet Durchprobieren Person × Tag den Schlüssel (pseudonym, dokumentiert)", () => {
    pfeffer(undefined);
    const v = schreibeAls(gesamt(), "LT", (m) => { delete m.postenPlan["a1|2026-11-02"]; m.moduldatenAusnahme = LOESCH; });
    const h = v.mandanten[0].einstellungen.moduldatenLoeschvermerke[0].h;
    expect(h).not.toMatch(/^k1:/);
    expect(durchprobieren(h, (k) => MS.loeschvermerkHash("m1", "postenPlan", k))).toBe("a1|2026-11-02");
  });
  it("mit Pfeffer: geschlüsselter Vermerk (k1:), Durchprobieren ohne den Schlüssel findet nichts; Wiederherstellen wirkt", () => {
    pfeffer("pfeffer-nur-zum-pruefen-0123456789");
    const vorher = gesamt();
    const v = schreibeAls(vorher, "LT", (m) => { delete m.postenPlan["a1|2026-11-02"]; m.moduldatenAusnahme = LOESCH; });
    const h = v.mandanten[0].einstellungen.moduldatenLoeschvermerke[0].h;
    expect(h).toMatch(/^k1:[0-9a-f]{8}:[0-9a-f]{32}$/);   // seit N-3 mit Schlüsselkennung
    expect(durchprobieren(h, (k) => MS.loeschvermerkHash("m1", "postenPlan", k, null))).toBeNull();
    expect(zurueck(wiederAn(v), vorher).bestand.mandanten[0].postenPlan["a1|2026-11-02"]).toBeUndefined();
    /* Ein anderer Pfeffer erzeugt einen anderen Vermerk. */
    pfeffer("ein-anderer-pfeffer-0123456789");
    expect(MS.loeschvermerkHash("m1", "postenPlan", "a1|2026-11-02")).not.toBe(h);
  });
  it("geschlüsselte Vermerke, aber der Pfeffer fehlt beim Wiederherstellen: abgewiesen (fail-closed)", () => {
    pfeffer("pfeffer-nur-zum-pruefen-0123456789");
    const vorher = gesamt();
    const v = schreibeAls(vorher, "LT", (m) => { delete m.postenPlan["a1|2026-11-02"]; m.moduldatenAusnahme = LOESCH; });
    pfeffer(undefined);
    const w = zurueck(wiederAn(v), vorher);
    expect(w.verweigert).toMatch(/CENTRIC_PFEFFER|Löschvermerk/);
    /* Ungeschlüsselte Altvermerke (vor dem Pfeffer) wirken weiter, auch mit Pfeffer. */
    pfeffer(undefined);
    const v0 = schreibeAls(gesamt(), "LT", (m) => { delete m.postenPlan["a1|2026-11-02"]; m.moduldatenAusnahme = LOESCH; });
    pfeffer("pfeffer-nur-zum-pruefen-0123456789");
    expect(zurueck(wiederAn(v0), gesamt()).bestand.mandanten[0].postenPlan["a1|2026-11-02"]).toBeUndefined();
  });
});

/* ======================================================================== */
describe("F5 — Aktenzeichen: zwei bis fünf Buchstaben vorweg (nach N-5), keine Namen", () => {
  const mit = (az) => schreibeAls(gesamt(), "LT", (m) => { delete m.postenPlan["a1|2026-11-02"]; m.moduldatenAusnahme = { ...LOESCH, aktenzeichen: az }; });
  it("Sonde: „Mueller-1\" und andere Namen mit Ziffer werden abgewiesen", () => {
    for (const az of ["Mueller-1", "MaxMustermann2", "Schulz-2026-1", "Abcde-1", "1-Meier", "DS-1a", "<script>1"])
      expect(mit(az).verweigert, az).toMatch(/Aktenzeichen/);
  });
  it("übliche Aktenzeichen gehen", () => {
    for (const az of ["DS-2026-014", "AZ-12", "2026-3", "ABCD12", "DS-7", "1"]) expect(mit(az).verweigert, az).toBeFalsy();
    expect(BM.AKTENZEICHEN_MUSTER.test("A".repeat(4) + "-" + "1".repeat(16))).toBe(false);   // höchstens 20 Zeichen
  });
});

/* ======================================================================== */
describe("F6 — Berichtigung nur über das Wertschema des Moduls", () => {
  it("Sonde: Berichtigung auf einen unbekannten Posten oder einen Objektwert wird abgewiesen", () => {
    for (const wert of ["GARBAGE<>", "po9"]) {
      const r = schreibeAls(gesamt(), "LT", (m) => { m.postenPlan["a1|2026-11-03"] = wert; m.moduldatenAusnahme = BERICHT; });
      expect(r.verweigert, wert).toMatch(/nicht zulässig/);
    }
    /* Objekt- und Zahlwerte: abgewiesen (schon von der Formprüfung des Posten-Schreibwegs oder vom Wertschema). */
    for (const wert of [{ x: "y".repeat(1000) }, 7]) {
      const r = schreibeAls(gesamt(), "LT", (m) => { m.postenPlan["a1|2026-11-03"] = wert; m.moduldatenAusnahme = BERICHT; });
      expect(r.verweigert, JSON.stringify(wert).slice(0, 30)).toBeTruthy();
    }
    /* Das Wertschema selbst weist sie ebenfalls ab. */
    for (const wert of [{ x: "y" }, 7, "", null]) expect(BM.modulVon("posten").berichtigungsWerte.postenPlan(wert, gesamt().mandanten[0])).toBe(false);
    const ok = schreibeAls(gesamt(), "LT", (m) => { m.postenPlan["a1|2026-11-03"] = "po2"; m.moduldatenAusnahme = BERICHT; });
    expect(ok.verweigert).toBeFalsy();
  });
  it("ohne Wertschema für das Feld: keine Berichtigung, nur Löschung (fail-closed)", () => {
    const ohne = { ...TM, berichtigungsWerte: {} };
    const alt = { id: "m", pakete: ["sicherheit"], einstellungen: { branchenmodule: { testmodul: { ...AUS } } }, testDaten: { "a1|2026-11-02": "A" } };
    const aus = { modul: "testmodul", art: "berichtigung", grund: "art16", eintraege: { testDaten: ["a1|2026-11-02"] } };
    const neu = { ...kopie(alt), testDaten: { "a1|2026-11-02": "B" } };
    const k = { darfOrgEdit: true, sitzung: { person: "l1" }, ausnahme: aus };
    expect(MS.moduldatenZusammen(alt, neu, [...BRANCHENMODULE, ohne], k).grund).toMatch(/Wertschema/);
    expect(MS.moduldatenZusammen(alt, neu, LISTE, k).grund).toBeUndefined();
    expect(MS.moduldatenZusammen(alt, { ...kopie(alt), testDaten: { "a1|2026-11-02": "zu lang" } }, LISTE, k).grund).toMatch(/nicht zulässig/);
  });
  it("Statusvertrag: ein Personenfeld ohne Wertschema hält das Modul in „geplant\"", () => {
    expect(BM.pruefeModulStatus([TM])).toEqual([]);
    expect(BM.pruefeModulStatus([{ ...TM, berichtigungsWerte: undefined }]).join("\n")).toMatch(/Wertschema/);
    expect(BM.pruefeModulStatus([{ ...TM, berichtigungsWerte: { testDaten: "kein Prüfer" } }]).join("\n")).toMatch(/Wertschema/);
    /* Die beiden Module mit Personenfeldern bringen ihr Wertschema schon mit. */
    for (const id of ["posten", "bereichsplan"]) for (const f of BM.modulVon(id).personenfelder)
      expect(typeof BM.modulVon(id).berichtigungsWerte[f], `${id}.${f}`).toBe("function");
  });
  it("Oberfläche: die Angabe prüft den berichtigten Wert gegen dasselbe Schema", async () => {
    const W = await import("../src/module/ausnahmeweg.js");
    const m = kopie(bestandFuerRolle(gesamt(), SITZUNGEN.LT)).mandanten[0];
    const mod = BM.modulVon("posten");
    const f = (wert) => W.ausnahmeAngabe(m, mod, { ...W.leeresFormular(), art: "berichtigung", grund: "art16",
      auswahl: { postenPlan: { "a1|2026-11-03": true } }, neu: { postenPlan: { "a1|2026-11-03": wert } } });
    expect(f("po9").fehler).toMatch(/nicht zulässig/);
    expect(f("po2").fehler).toBeUndefined();
  });
});

/* ======================================================================== */
describe("F2 — speicher.js: die Ausnahmeangabe übersteht einen Fehlschlag", () => {
  let SP;
  beforeAll(async () => {
    const speicher = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null),
      setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear() }; };
    vi.stubGlobal("localStorage", speicher());
    vi.stubGlobal("sessionStorage", speicher());
    SP = await import("../src/speicher.js");
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.stubGlobal("localStorage", { getItem: () => null, setItem() {}, removeItem() {} });
    vi.stubGlobal("sessionStorage", { getItem: () => null, setItem() {}, removeItem() {} }); SP.ausstehendVerwerfen(); });

  const antwort = (status, daten) => new Response(JSON.stringify(daten), { status, headers: { "content-type": "application/json" } });
  const ANGABE = { modul: "posten", art: "loeschung", grund: "art17", eintraege: { postenPlan: ["a1|2026-11-02"] } };
  const mitAenderung = () => ({ mandanten: [{ id: "m1", postenPlan: { "a1|2026-11-03": "po1" } }] });
  const erkennt = (m) => !!m && !!m.postenPlan && !("a1|2026-11-02" in m.postenPlan);
  const koerper = (aufruf) => JSON.parse(aufruf[1].body).bestand.mandanten[0];

  for (const [name, fehlschlag] of [["Netzfehler", () => { throw new TypeError("Failed to fetch"); }],
    ["Serverfehler 500", () => antwort(500, { fehler: "kaputt" })]]) {
    it(`Sonde (${name}): die Wiederholung (nochmalSchreiben) schickt die Angabe mit; erst nach 200 ist sie verbraucht`, async () => {
      const aufrufe = [];
      let n = 0;
      vi.stubGlobal("fetch", vi.fn(async (...a) => { aufrufe.push(a); n++; return n === 1 ? fehlschlag() : antwort(200, { etag: `e${n}` }); }));
      const lagen = [];
      SP.ausnahmeMitschicken("m1", ANGABE, erkennt);
      await SP.schreib(mitAenderung(), { sofort: true, onFehler: (l) => lagen.push(l) });
      expect(lagen).toHaveLength(1);
      expect(koerper(aufrufe[0]).moduldatenAusnahme).toEqual(ANGABE);
      const erg = await SP.nochmalSchreiben();
      expect(erg.ok).toBe(true);
      expect(koerper(aufrufe[1]).moduldatenAusnahme).toEqual(ANGABE);
      /* Nach der Annahme: das nächste Speichern geht ohne Angabe (H1). */
      await SP.schreib(mitAenderung(), { sofort: true });
      expect("moduldatenAusnahme" in koerper(aufrufe[2])).toBe(false);
    });
  }
  it("Fehlschlag, dann neue Änderung (neuer Auftrag): die Angabe geht weiterhin mit, solange die Änderung drin ist", async () => {
    const aufrufe = [];
    vi.stubGlobal("fetch", vi.fn(async (...a) => { aufrufe.push(a); if (aufrufe.length === 1) throw new TypeError("Failed to fetch"); return antwort(200, { etag: "e" }); }));
    SP.ausnahmeMitschicken("m1", ANGABE, erkennt);
    await SP.schreib(mitAenderung(), { sofort: true, onFehler: () => {} });
    const weiter = mitAenderung(); weiter.mandanten[0].name = "Neu";
    await SP.schreib(weiter, { sofort: true });
    expect(koerper(aufrufe[1]).moduldatenAusnahme).toEqual(ANGABE);
    await SP.schreib(mitAenderung(), { sofort: true });
    expect("moduldatenAusnahme" in koerper(aufrufe[2])).toBe(false);
  });
  it("die Angabe hängt am Auftrag: eine inzwischen neu gesetzte Angabe ersetzt sie bei der Wiederholung nicht", async () => {
    const aufrufe = [];
    vi.stubGlobal("fetch", vi.fn(async (...a) => { aufrufe.push(a); if (aufrufe.length === 1) throw new TypeError("Failed to fetch"); return antwort(200, { etag: "e" }); }));
    SP.ausnahmeMitschicken("m1", ANGABE, erkennt);
    await SP.schreib(mitAenderung(), { sofort: true, onFehler: () => {} });
    /* Eine zweite Angabe für eine andere Änderung (passt nicht zum gescheiterten Bestand). */
    const andere = { ...ANGABE, eintraege: { postenPlan: ["a1|2026-11-03"] } };
    SP.ausnahmeMitschicken("m1", andere, (m) => !!m && !!m.postenPlan && !("a1|2026-11-03" in m.postenPlan));
    expect((await SP.nochmalSchreiben()).ok).toBe(true);
    expect(koerper(aufrufe[1]).moduldatenAusnahme).toEqual(ANGABE);
  });
  for (const [status, daten] of [[403, { fehler: "nur lesbar" }], [409, { fehler: "konflikt", etag: "e9" }]]) {
    it(`Abweisung ${status}: Angabe verworfen, Lage „ausnahmeZurueck\" (neu laden), kein Konfliktfenster`, async () => {
      const aufrufe = [];
      vi.stubGlobal("fetch", vi.fn(async (...a) => { aufrufe.push(a); return aufrufe.length === 1 ? antwort(status, daten) : antwort(200, { etag: "e" }); }));
      const lagen = []; const konflikte = [];
      SP.ausnahmeMitschicken("m1", ANGABE, erkennt);
      await SP.schreib(mitAenderung(), { sofort: true, onFehler: (l) => lagen.push(l), onKonflikt: (d) => konflikte.push(d) });
      expect(lagen.map((l) => l.art)).toEqual(["ausnahmeZurueck"]);
      expect(konflikte).toEqual([]);
      await SP.schreib(mitAenderung(), { sofort: true });
      expect("moduldatenAusnahme" in koerper(aufrufe[1])).toBe(false);
    });
  }
});

/* ======================================================================== */
describe("Testlücken des dritten Reviews (überlebende Mutanten)", () => {
  it("R2: Antrag nennt zwei Felder, nur eines ändert sich → abgewiesen", () => {
    const r = schreibeAls(gesamt(), "LT", (m) => { delete m.postenPlan["a1|2026-11-02"];
      m.moduldatenAusnahme = { ...LOESCH, eintraege: { postenPlan: ["a1|2026-11-02"], objekte: ["ob1"] } }; });
    expect(r.verweigert).toMatch(/benanntes Feld ist unverändert/);
  });
  it("R3: Löschvermerke sieht keine eingeschränkte Rolle (Sicht)", () => {
    const g = schreibeAls(gesamt(), "LT", (m) => { delete m.postenPlan["a1|2026-11-02"]; m.moduldatenAusnahme = LOESCH; });
    expect(g.mandanten[0].einstellungen.moduldatenLoeschvermerke).toHaveLength(1);
    for (const ro of ["SV", "MA", "BR"]) {
      const s = bestandFuerRolle(g, SITZUNGEN[ro]);
      const e = s && s.mandanten && s.mandanten[0] && s.mandanten[0].einstellungen;
      expect(e && "moduldatenLoeschvermerke" in e, ro).toBe(false);
    }
    expect("moduldatenLoeschvermerke" in BM.moduleinstellungenSicht({ moduldatenLoeschvermerke: [{ h: "x" }] }, "betriebsrat")).toBe(false);
    expect("moduldatenLoeschvermerke" in BM.moduleinstellungenSicht({ moduldatenLoeschvermerke: [{ h: "x" }] }, "mitarbeiter")).toBe(false);
  });
  it("R5: geprüfte Aufbewahrungsregel vor ihrem gueltigAb löscht nicht", () => {
    const regel = { ...BM.MODULDATEN_AUFBEWAHRUNG, pruefstatus: "geprueft", geprueftAm: "2026-11-01T00:00:00.000Z", geprueftVon: "fach",
      quelle: "Q", fundstelle: "F", fassung: "1", gueltigAb: "2027-01-01" };
    expect(RS.regelGeprueft(regel, { heute: "2026-11-03" })).toBe(false);
    expect(RS.regelGeprueft({ ...regel, gueltigAb: "2026-01-01" }, { heute: "2026-11-03" })).toBe(true);
    const m0 = () => ({ id: "m1", aufbewahrung: {}, personen: [{ id: "a2", nachname: "B" }], abweichungen: {},
      postenPlan: { "a2|2023-09-01": "po1", "a2|2026-10-01": "po1" } });
    expect(AUF.raeumen(m0(), "2026-11-03", { regeln: { moduldaten: regel } }).mandant.postenPlan["a2|2023-09-01"]).toBe("po1");
    expect(AUF.raeumen(m0(), "2026-11-03", { regeln: { moduldaten: { ...regel, gueltigAb: "2026-01-01" } } }).mandant.postenPlan["a2|2023-09-01"]).toBeUndefined();
  });
  it("R7: die einmalige Angabe hängt nur am eigenen Betrieb", async () => {
    const W = await import("../src/module/ausnahmeweg.js");
    const bestand = { mandanten: [{ id: "fremd", postenPlan: {} }, { id: "m1", postenPlan: {} }] };
    const mit = W.mitEinmaligerAngabe(bestand, { mandantId: "m1", angabe: LOESCH, erkennt: () => true });
    expect(mit.verbraucht).toBe(true);
    expect("moduldatenAusnahme" in mit.bestand.mandanten[0]).toBe(false);
    expect(mit.bestand.mandanten[1].moduldatenAusnahme).toEqual(LOESCH);
    const keiner = W.mitEinmaligerAngabe(bestand, { mandantId: "m9", angabe: LOESCH, erkennt: () => true });
    expect(keiner.verbraucht).toBe(false);
    expect(keiner.bestand.mandanten.some((m) => "moduldatenAusnahme" in m)).toBe(false);
  });
  it("R11: unbekannte Herkunft wird nie „geprueft\" (fail-closed)", () => {
    const voll = { quelle: "Q", fundstelle: "F", fassung: "1", gueltigAb: "2026-01-01", geprueftAm: "2026-02-01", pruefstatus: "geprueft" };
    expect(RS.kanonischerStatus(voll, { herkunft: "kanonisch", heute: "2026-11-03" })).toBe("geprueft");
    for (const herkunft of ["unbekannt", "industrie-neu", "__proto__", "toString"]) {
      expect(RS.kanonischerStatus(voll, { herkunft, heute: "2026-11-03" }), herkunft).toBe("vorlaeufig");
      expect(RS.regelGeprueft(voll, { herkunft, heute: "2026-11-03" }), herkunft).toBe(false);
    }
  });
});
