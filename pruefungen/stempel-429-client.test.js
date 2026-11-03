/* ==========================================================================
   STEMPELN BEI 429 (WP-47) — die Oberfläche wiederholt, statt zu verlieren

   Bei einer Lastgrenze (Schichtwechsel) antwortet der Server mit 429 und
   Retry-After und speichert NICHTS. speicher.js wiederholt dann höchstens
   zweimal (je bis zu 15 s) und sagt am Ende ehrlich, dass der Stempel noch
   nicht erfasst ist. Andere Fehler werden nicht wiederholt (ein Stempel, der
   abgewiesen wurde, wird nicht erzwungen).

   Aufruf: npx vitest run pruefungen/stempel-429-client.test.js
   ========================================================================== */

import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";

let SP;
beforeAll(async () => {
  const speicher = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear() }; };
  vi.stubGlobal("localStorage", speicher());
  vi.stubGlobal("sessionStorage", speicher());
  SP = await import("../src/speicher.js");
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

const antwort = (status, daten, kopf = {}) => new Response(JSON.stringify(daten), { status, headers: { "content-type": "application/json", ...kopf } });

describe("speicher.stempeln bei 429", () => {
  it("wiederholt nach Retry-After und liefert den Stempel, sobald der Server ihn annimmt", async () => {
    vi.useFakeTimers();
    const aufrufe = [];
    vi.stubGlobal("fetch", vi.fn(async () => {
      aufrufe.push(Date.now());
      return aufrufe.length < 3 ? antwort(429, { fehler: "zu viele Anfragen" }, { "retry-after": "4" })
        : antwort(200, { ok: true, zeit: "06:00", ort: "ok", eintrag: { start: "06:00" } });
    }));
    const p = SP.stempeln("2026-11-03", "start", null);
    await vi.advanceTimersByTimeAsync(60000);
    const erg = await p;
    expect(erg.ok).toBe(true);
    expect(aufrufe).toHaveLength(3);
    /* Mindestens Retry-After (4 s) zwischen den Versuchen. */
    expect(aufrufe[1] - aufrufe[0]).toBeGreaterThanOrEqual(4000);
    expect(aufrufe[2] - aufrufe[1]).toBeGreaterThanOrEqual(4000);
  });

  it("wartet höchstens 15 s je Wiederholung, auch bei großem Retry-After", () => {
    expect(SP.wartezeit429(new Response("", { status: 429, headers: { "retry-after": "300" } }))).toBe(15000);
    expect(SP.wartezeit429(new Response("", { status: 429, headers: { "retry-after": "3" } }))).toBe(3000);
    expect(SP.wartezeit429(new Response("", { status: 429 }))).toBe(5000);          // ohne Kopf: Vorgabe
    expect(SP.wartezeit429(new Response("", { status: 429, headers: { "retry-after": "0" } }))).toBe(5000);
    expect(SP.STEMPEL_429_WIEDERHOLUNGEN).toBe(2);
  });

  it("bleibt es bei 429, sagt die Meldung ehrlich, dass der Stempel NICHT erfasst ist — nach genau drei Anfragen", async () => {
    vi.useFakeTimers();
    const f = vi.fn(async () => antwort(429, { fehler: "zu viele Anfragen" }, { "retry-after": "2" }));
    vi.stubGlobal("fetch", f);
    const p = SP.stempeln("2026-11-03", "start", null);
    const fehler = p.catch((e) => e);
    await vi.advanceTimersByTimeAsync(60000);
    const e = await fehler;
    expect(e).toBeInstanceOf(Error);
    expect(e.message).toMatch(/NICHT erfasst/);
    expect(f).toHaveBeenCalledTimes(3);
  });

  it("andere Fehler werden nicht wiederholt (z. B. schon gestempelt)", async () => {
    const f = vi.fn(async () => antwort(409, { fehler: "Schon gestempelt." }));
    vi.stubGlobal("fetch", f);
    await expect(SP.stempeln("2026-11-03", "start", null)).rejects.toThrow(/Schon gestempelt/);
    expect(f).toHaveBeenCalledTimes(1);
  });
});
