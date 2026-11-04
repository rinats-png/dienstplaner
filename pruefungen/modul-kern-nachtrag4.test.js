/* ==========================================================================
   WP-19.0 — NACHTRAG ZUM VIERTEN UNABHÄNGIGEN OPUS-DELTA-REVIEW

     N-1  Löschvermerk gegen die automatische Sicherung im selben Speichervorgang
          (Handler-Weg: modul-kern-nachtrag4-handler.test.js; hier die Zeitfälle)
     N-2  zwei gleichzeitige Speichervorgänge verbrauchen dieselbe Ausnahmeangabe (speicher.js)
     N-3  geänderter CENTRIC_PFEFFER macht Vermerke still unwirksam (Schlüsselkennung)
     N-4  Testlücken: Vermerk ohne lesbares `am`; Reihenfolge der Zeitquellen
     N-5  Aktenzeichen-Muster zu weit
   ========================================================================== */
import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import * as BM from "../server/lib/branchenmodule.mjs";
import * as MS from "../server/lib/modulschreibwege.mjs";
import { betriebWiederherstellen } from "../server/lib/sicherungen.mjs";
import { branchenbestand, schreibeAls, SITZUNGEN } from "./hilfen/branchenbetrieb.mjs";

const kopie = (x) => JSON.parse(JSON.stringify(x));
const EIN = "2026-10-01T08:00:00.000Z";
const AUS = { an: false, eingeschaltetAm: EIN, geaendertAm: EIN, geaendertVon: "l1" };
const PLAN = { "a1|2026-11-02": "po1", "a1|2026-11-03": "po1", "s1|2026-11-02": "po2" };
const OBJ = [{ id: "ob1", name: "Werk", posten: [{ id: "po1", name: "Tor", soll: { F: 1 } }, { id: "po2", name: "Halle", soll: { F: 1 } }] }];
const LOESCH = { modul: "posten", art: "loeschung", grund: "art17", eintraege: { postenPlan: ["a1|2026-11-02"] } };
const gesamt = () => {
  const g = branchenbestand({ pakete: ["sicherheit"], branchenmodule: { posten: AUS } });
  g.mandanten[0].postenPlan = { ...PLAN };
  g.mandanten[0].objekte = kopie(OBJ);
  return g;
};
const wiederAn = (g) => { const x = kopie(g); delete x.mandanten[0].einstellungen.branchenmodule; return x; };
const HEUTE = new Date("2026-11-04T10:00:00Z");
const zurueck = (heute, sicherung, opt = {}) => betriebWiederherstellen(heute, sicherung, SITZUNGEN.LT,
  { marke: "x", heute: HEUTE, datenschutz: "aus", ...opt });
const um = (iso, ms) => new Date(Date.parse(iso) + ms).toISOString();
const vermerke = (g) => g.mandanten[0].einstellungen.moduldatenLoeschvermerke;
const eintrag = (w) => w.bestand.mandanten[0].postenPlan["a1|2026-11-02"];

const PFEFFER_VORHER = process.env.CENTRIC_PFEFFER;
const pfeffer = (w) => { if (w === undefined) delete process.env.CENTRIC_PFEFFER; else process.env.CENTRIC_PFEFFER = w; };
afterEach(() => pfeffer(PFEFFER_VORHER));

/* Eine Sicherung „vor Verlust" zeigt den Stand VOR der Löschung. */
const loeschen = () => {
  const vorher = gesamt();
  const v = schreibeAls(vorher, "LT", (m) => { delete m.postenPlan["a1|2026-11-02"]; m.moduldatenAusnahme = LOESCH; });
  expect(v.verweigert).toBeFalsy();
  return { vorher, nachher: wiederAn(v), am: vermerke(v).at(-1).am };
};

describe("N-1 — automatische Sicherung OHNE Zeitquellen-Markierung (Altbestand): der Vermerk wirkt unabhängig von der abgelegten Zeit", () => {
  for (const delta of [-40, 0, 40, 5000]) {
    it(`Altsicherung (automatisch, keine zeitquelle), Sicherungszeit = Vermerk ${delta >= 0 ? "+" : "−"} ${Math.abs(delta)} ms → Eintrag bleibt gelöscht`, () => {
      const { vorher, nachher, am } = loeschen();
      expect(eintrag(zurueck(nachher, vorher, { sicherungsZeit: um(am, delta), automatisch: true }))).toBeUndefined();
    });
  }
  it("Gegenprobe: eine manuelle Sicherung nach dem Vermerk bleibt unberührt (F1 gilt weiter)", () => {
    const { vorher, nachher, am } = loeschen();
    const spaeter = kopie(nachher); spaeter.mandanten[0].postenPlan["a1|2026-11-02"] = "po2";
    expect(eintrag(zurueck(nachher, spaeter, { sicherungsZeit: um(am, 5000), automatisch: false }))).toBe("po2");
    expect(eintrag(zurueck(nachher, vorher, { sicherungsZeit: um(am, -40) }))).toBeUndefined();
  });
});

describe("N-1 / B-1 — automatische Sicherung MIT zeitquelle \"lesezeit\": die Lesezeit gilt wie eine echte Sicherungszeit", () => {
  for (const delta of [-40, 0]) {
    it(`Lesezeit = Vermerk ${delta >= 0 ? "+" : "−"} ${Math.abs(delta)} ms (Sicherung nicht jünger als der Vermerk) → Eintrag bleibt gelöscht`, () => {
      const { vorher, nachher, am } = loeschen();
      expect(eintrag(zurueck(nachher, vorher, { sicherungsZeit: um(am, delta), automatisch: true, zeitquelle: "lesezeit" }))).toBeUndefined();
    });
  }
  for (const delta of [40, 5000]) {
    it(`Lesezeit = Vermerk + ${delta} ms (Sicherung jünger als der Vermerk) → der Vermerk wirkt nicht, der Stand der Sicherung bleibt`, () => {
      const { nachher, am } = loeschen();
      const spaeter = kopie(nachher); spaeter.mandanten[0].postenPlan["a1|2026-11-02"] = "po2";
      expect(eintrag(zurueck(nachher, spaeter, { sicherungsZeit: um(am, delta), automatisch: true, zeitquelle: "lesezeit" }))).toBe("po2");
    });
  }
});

describe("N-4 — Testlücken", () => {
  it("Vermerk ohne lesbares `am` wirkt (fehlt, kaputt, kein Text)", () => {
    const { nachher, am } = loeschen();
    for (const kaputt of [undefined, "kein-datum", "", 42, null]) {
      const x = kopie(nachher);
      vermerke(x).forEach((v) => { if (kaputt === undefined) delete v.am; else v.am = kaputt; });
      /* Sicherung eindeutig NACH dem eigentlichen Vermerk — wirkt nur, weil `am` unlesbar ist. */
      const spaeter = kopie(x); spaeter.mandanten[0].postenPlan["a1|2026-11-02"] = "po2";
      expect(eintrag(zurueck(x, spaeter, { sicherungsZeit: um(am, 3600000) })), String(kaputt)).toBeUndefined();
    }
  });
  it("Reihenfolge der Zeitquellen: die Metadaten-Zeit geht der `erzeugt` der Sicherung vor (beide Richtungen)", () => {
    const { nachher, am } = loeschen();
    const spaeter = kopie(nachher); spaeter.mandanten[0].postenPlan["a1|2026-11-02"] = "po2";
    const a = { umfang: "betrieb", mandantId: "m1", mandant: kopie(spaeter.mandanten[0]), erzeugt: um(am, 3600000) };
    /* Metadaten: vor dem Vermerk (wirkt); erzeugt: danach (würde nicht wirken). */
    expect(eintrag(zurueck(nachher, a, { sicherungsZeit: um(am, -3600000) }))).toBeUndefined();
    /* Metadaten: nach dem Vermerk (wirkt nicht); erzeugt: davor (würde wirken). */
    const b = { ...a, erzeugt: um(am, -3600000) };
    expect(eintrag(zurueck(nachher, b, { sicherungsZeit: um(am, 3600000) }))).toBe("po2");
    /* Ohne Metadaten-Zeit gilt `erzeugt`. */
    expect(eintrag(zurueck(nachher, a))).toBe("po2");
    expect(eintrag(zurueck(nachher, b))).toBeUndefined();
  });
});

describe("N-3 — Schlüsselkennung im geschlüsselten Vermerk", () => {
  const P1 = "pfeffer-nur-zum-pruefen-0123456789";
  const P2 = "ein-anderer-pfeffer-0123456789-xx";
  it("Vermerk trägt k1:<kennung>:<hash>; die Kennung verrät den Schlüssel nicht", () => {
    pfeffer(P1);
    const h = MS.loeschvermerkHash("m1", "postenPlan", "a1|2026-11-02");
    expect(h).toMatch(/^k1:[0-9a-f]{8}:[0-9a-f]{32}$/);
    expect(Buffer.from(MS.loeschvermerkSchluessel()).toString("hex")).not.toContain(h.split(":")[1]);
    pfeffer(P2);
    expect(MS.loeschvermerkHash("m1", "postenPlan", "a1|2026-11-02").split(":")[1]).not.toBe(h.split(":")[1]);
  });
  it("geänderter Pfeffer: Wiederherstellen wird abgewiesen (wie fehlender Pfeffer), nicht still wirkungslos", () => {
    pfeffer(P1);
    const { vorher, nachher } = loeschen();
    expect(vermerke(nachher)[0].h).toMatch(/^k1:/);
    expect(eintrag(zurueck(nachher, vorher))).toBeUndefined();
    pfeffer(P2);
    expect(zurueck(nachher, vorher).verweigert).toMatch(/CENTRIC_PFEFFER|Löschvermerk/);
    pfeffer(undefined);
    expect(zurueck(nachher, vorher).verweigert).toMatch(/CENTRIC_PFEFFER|Löschvermerk/);
    pfeffer(P1);
    expect(zurueck(nachher, vorher).verweigert).toBeFalsy();
  });
  it("Rückwärtskompatibilität: ein alter Vermerk k1:<hash> ohne Kennung wirkt weiter (gleicher Pfeffer)", () => {
    pfeffer(P1);
    const { vorher, nachher } = loeschen();
    const alt = kopie(nachher);
    vermerke(alt)[0].h = MS.loeschvermerkHashOhneKennung("m1", "postenPlan", "a1|2026-11-02");
    expect(vermerke(alt)[0].h).toMatch(/^k1:[0-9a-f]{32}$/);
    expect(eintrag(zurueck(alt, vorher))).toBeUndefined();
    pfeffer(undefined);
    expect(zurueck(alt, vorher).verweigert).toMatch(/CENTRIC_PFEFFER|Löschvermerk/);
  });
});

describe("N-5 — Aktenzeichen: 2–5 Großbuchstaben vorweg oder reine Ziffernfolge", () => {
  const mit = (az) => schreibeAls(gesamt(), "LT", (m) => { delete m.postenPlan["a1|2026-11-02"]; m.moduldatenAusnahme = { ...LOESCH, aktenzeichen: az }; });
  it("Namen und Randformen werden abgewiesen (Muster und Server)", () => {
    for (const az of ["Anna-1", "Ute1", "Max-2026", "Kai-12-3", "-1", "1-", "A1--------", "A-1", "ds-7", "DS--1", "ABCDEF-1", "DS-1-", "1--2", "Mueller-1", "Abcde-1", "1-Meier"]) {
      expect(BM.AKTENZEICHEN_MUSTER.test(az), az).toBe(false);
      expect(mit(az).verweigert, az).toMatch(/Aktenzeichen/);
    }
  });
  it("übliche Aktenzeichen bleiben gültig", () => {
    for (const az of ["DS-2026-014", "DSGVO-2026-1", "AZ-12", "2026-3", "ABCD12", "DS-7", "1", "12345678901234567890"]) {
      expect(BM.AKTENZEICHEN_MUSTER.test(az), az).toBe(true);
      expect(mit(az).verweigert, az).toBeFalsy();
    }
    expect(BM.AKTENZEICHEN_MUSTER.test("1".repeat(21))).toBe(false);
  });
});

/* ======================================================================== */
describe("N-2 — speicher.js: zwei gleichzeitige Speichervorgänge", () => {
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
  const erkennt = (m) => !!m && !!m.postenPlan && !("a1|2026-11-02" in m.postenPlan);
  const stand = (name) => ({ mandanten: [{ id: "m1", name, postenPlan: { "a1|2026-11-03": "po1" } }] });
  const koerper = (aufruf) => JSON.parse(aufruf[1].body);

  it("Sonde: A noch unterwegs, B startet mit derselben Angabe → B wartet, nimmt den neuen ETag, trägt die Angabe nicht, kein Alarm", async () => {
    /* Ein Server mit Konfliktschutz: nur der aktuelle ETag wird angenommen. */
    let aktuell = null, n = 0;
    const aufrufe = [];
    let freigeben;
    const erste = new Promise((r) => { freigeben = r; });
    vi.stubGlobal("fetch", vi.fn(async (...a) => {
      const k = koerper(a); aufrufe.push(k); n++;
      if (n === 1) await erste;
      if ((k.etag ?? null) !== aktuell) return antwort(409, { fehler: "konflikt", text: "Jemand anderes", etag: aktuell });
      aktuell = `e${n}`;
      return antwort(200, { etag: aktuell });
    }));
    const lagen = [], konflikte = [];
    SP.ausnahmeMitschicken("m1", ANGABE, erkennt);
    const a = SP.schreib(stand("A"), { sofort: true, onFehler: (l) => lagen.push(l), onKonflikt: (d) => konflikte.push(d) });
    const b = SP.schreib(stand("B"), { sofort: true, onFehler: (l) => lagen.push(l), onKonflikt: (d) => konflikte.push(d) });
    await new Promise((r) => setTimeout(r, 20));
    expect(aufrufe).toHaveLength(1);                       // B hat nicht parallel gesendet
    freigeben();
    await Promise.all([a, b]);
    expect(lagen).toEqual([]);
    expect(konflikte).toEqual([]);
    expect(aufrufe).toHaveLength(2);
    expect(aufrufe[0].bestand.mandanten[0].moduldatenAusnahme).toEqual(ANGABE);
    expect("moduldatenAusnahme" in aufrufe[1].bestand.mandanten[0]).toBe(false);
    expect(aufrufe[1].etag).toBe("e1");
    expect(aufrufe[1].bestand.mandanten[0].name).toBe("B");   // B-Änderung nicht verworfen
    expect(SP.ausstehend()).toBeNull();
  });
});
