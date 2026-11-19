/* ==========================================================================
   WP-19.0 — NACHTRAG ZUM FÜNFTEN UNABHÄNGIGEN OPUS-DELTA-REVIEW (speicher.js)

   B-2: Ein hängender PUT hielt die Schreibkette dauerhaft (schreibenAusstehend blieb wahr).
        Jetzt bricht er nach SCHREIBEN_ZEITGRENZE (45 s) ab, endet als Fehlerart „netz“, die Kette ist frei.
   B-3: Die keepalive-Speicherung beim Schließen (beforeunload/visibilitychange) hing hinter dem
        laufenden Request in der Kette und wurde bei Seitentod nie gesendet. Jetzt geht sie sofort hinaus;
        eine Ausnahmeangabe, die schon unterwegs ist, hängt nicht doppelt an.
   ========================================================================== */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const antwort = (status, daten) => new Response(JSON.stringify(daten), { status, headers: { "content-type": "application/json" } });
const ANGABE = { modul: "posten", art: "loeschung", grund: "art17", eintraege: { postenPlan: ["a1|2026-11-02"] } };
const erkennt = (m) => !!m && !!m.postenPlan && !("a1|2026-11-02" in m.postenPlan);
const stand = (name) => ({ mandanten: [{ id: "m1", name, postenPlan: { "a1|2026-11-03": "po1" } }] });
const koerper = (aufruf) => JSON.parse(aufruf[1].body);
const speicherAttrappe = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null),
  setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear() }; };

let SP, beimSchliessen, sichtbarkeit;
beforeEach(async () => {
  vi.resetModules();
  vi.stubGlobal("localStorage", speicherAttrappe());
  vi.stubGlobal("sessionStorage", speicherAttrappe());
  const lauscher = {};
  vi.stubGlobal("window", { addEventListener: (art, f) => { lauscher[art] = f; } });
  let sicht = {};
  vi.stubGlobal("document", { visibilityState: "visible", addEventListener: (art, f) => { sicht[art] = f; } });
  SP = await import("../src/speicher.js");
  beimSchliessen = () => lauscher.beforeunload({ preventDefault() {}, returnValue: "" });
  sichtbarkeit = () => { globalThis.document.visibilityState = "hidden"; sicht.visibilitychange(); };
});
afterEach(() => { SP.ausstehendVerwerfen(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("B-2 — Zeitgrenze für den PUT", () => {
  it("hängender PUT: nach 45 s Abbruch als Fehlerart „netz“, die Schreibkette ist frei, ein weiterer Vorgang geht durch", async () => {
    vi.useFakeTimers();
    let n = 0;
    const aufrufe = [];
    vi.stubGlobal("fetch", vi.fn((url, opt) => {
      n += 1; aufrufe.push(opt);
      if (n === 1) return new Promise((_, nein) => {                       // hängt, bis das Signal abbricht
        opt.signal.addEventListener("abort", () => nein(Object.assign(new Error("aborted"), { name: "AbortError" })));
      });
      return Promise.resolve(antwort(200, { etag: "e2" }));
    }));
    const lagen = [];
    const a = SP.schreib(stand("A"), { sofort: true, onFehler: (l) => lagen.push(l) });
    await vi.advanceTimersByTimeAsync(10);
    expect(SP.schreibenAusstehend()).toBe(true);
    expect(aufrufe[0].signal).toBeTruthy();
    await vi.advanceTimersByTimeAsync(SP.SCHREIBEN_ZEITGRENZE - 100);
    expect(SP.schreibenAusstehend()).toBe(true);                           // noch innerhalb der Grenze
    await vi.advanceTimersByTimeAsync(200);
    await a;
    expect(lagen).toHaveLength(1);
    expect(lagen[0].art).toBe("netz");
    expect(SP.schreibenAusstehend()).toBe(false);
    expect(SP.SCHREIBEN_ZEITGRENZE).toBe(45000);
    /* Die Kette ist frei: wiederholen sendet sofort, ohne auf den hängenden Request zu warten. */
    const nochmal = SP.nochmalSchreiben();
    await vi.advanceTimersByTimeAsync(10);
    await nochmal;
    expect(n).toBe(2);
    expect(SP.schreibenAusstehend()).toBe(false);
  });

  it("ein Request, der rechtzeitig antwortet, wird nicht abgebrochen", async () => {
    vi.useFakeTimers();
    let signal;
    vi.stubGlobal("fetch", vi.fn(async (url, opt) => { signal = opt.signal; return antwort(200, { etag: "e1" }); }));
    const lagen = [];
    await SP.schreib(stand("A"), { sofort: true, onFehler: (l) => lagen.push(l) });
    await vi.advanceTimersByTimeAsync(SP.SCHREIBEN_ZEITGRENZE + 1000);
    expect(signal.aborted).toBe(false);
    expect(lagen).toEqual([]);
  });
});

describe("B-3 — Speichern beim Schließen geht an der Kette vorbei", () => {
  for (const [name, ausloeser] of [["beforeunload", () => beimSchliessen()], ["visibilitychange (hidden)", () => sichtbarkeit()]]) {
    it(`${name}: während ein PUT hängt, wird die ausstehende Änderung sofort mit keepalive gesendet; die Angabe hängt nicht doppelt an`, async () => {
      const aufrufe = [];
      let freigeben;
      const erste = new Promise((r) => { freigeben = r; });
      vi.stubGlobal("fetch", vi.fn(async (...a) => {
        aufrufe.push(a);
        if (aufrufe.length === 1) await erste;
        return antwort(200, { etag: `e${aufrufe.length}` });
      }));
      SP.ausnahmeMitschicken("m1", ANGABE, erkennt);
      const a = SP.schreib(stand("A"), { sofort: true });
      await new Promise((r) => setTimeout(r, 20));
      expect(aufrufe).toHaveLength(1);
      expect(koerper(aufrufe[0]).bestand.mandanten[0].moduldatenAusnahme).toEqual(ANGABE);

      SP.schreib(stand("B"));                                                // ausstehend, Zeitgeber läuft
      ausloeser();
      await new Promise((r) => setTimeout(r, 20));
      /* Ohne Warten auf den ersten Request: */
      expect(aufrufe).toHaveLength(2);
      expect(aufrufe[1][1].keepalive).toBe(true);
      expect(koerper(aufrufe[1]).bestand.mandanten[0].name).toBe("B");
      expect("moduldatenAusnahme" in koerper(aufrufe[1]).bestand.mandanten[0]).toBe(false);   // angabenUnterwegs wirkt
      freigeben();
      await a;
      await new Promise((r) => setTimeout(r, 20));
      expect(SP.schreibenAusstehend()).toBe(false);
    });
  }

  it("ohne laufenden Request bleibt es ein einzelner keepalive-PUT", async () => {
    const aufrufe = [];
    vi.stubGlobal("fetch", vi.fn(async (...a) => { aufrufe.push(a); return antwort(200, { etag: "e1" }); }));
    SP.schreib(stand("A"));
    beimSchliessen();
    await new Promise((r) => setTimeout(r, 20));
    expect(aufrufe).toHaveLength(1);
    expect(aufrufe[0][1].keepalive).toBe(true);
  });

  it("der normale Weg (nicht beim Schließen) bleibt hintereinander: B wartet auf A", async () => {
    const aufrufe = [];
    let freigeben;
    const erste = new Promise((r) => { freigeben = r; });
    vi.stubGlobal("fetch", vi.fn(async (...a) => {
      aufrufe.push(a);
      if (aufrufe.length === 1) await erste;
      return antwort(200, { etag: `e${aufrufe.length}` });
    }));
    const a = SP.schreib(stand("A"), { sofort: true });
    const b = SP.schreib(stand("B"), { sofort: true });
    await new Promise((r) => setTimeout(r, 20));
    expect(aufrufe).toHaveLength(1);
    freigeben();
    await Promise.all([a, b]);
    expect(aufrufe).toHaveLength(2);
    expect(koerper(aufrufe[1]).etag).toBe("e1");
  });
});
