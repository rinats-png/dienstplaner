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

  it("Auflage M4: Streuung ~20 % auf Retry-After — nie kürzer als Retry-After, höchstens 20 % länger", () => {
    const r = new Response("", { status: 429, headers: { "retry-after": "10" } });
    expect(SP.wartezeitMitStreuung(r, () => 0)).toBe(10000);
    expect(SP.wartezeitMitStreuung(r, () => 0.5)).toBe(11000);
    expect(SP.wartezeitMitStreuung(r, () => 0.999999)).toBeLessThanOrEqual(12000);
    expect(SP.wartezeitMitStreuung(r, () => 0.999999)).toBeGreaterThan(11900);
    /* Auch an der Obergrenze von 15 s wird gestreut — sonst kämen alle Geräte nach einer Sperre gleichzeitig wieder. */
    const gross = new Response("", { status: 429, headers: { "retry-after": "300" } });
    expect(SP.wartezeitMitStreuung(gross, () => 0.5)).toBe(16500);
  });

  it("Auflage M4: stempeln wartet mit Streuung (Math.random), nicht mit festem Zuschlag", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(1 - 1e-9);
    const aufrufe = [];
    vi.stubGlobal("fetch", vi.fn(async () => {
      aufrufe.push(Date.now());
      return aufrufe.length < 2 ? antwort(429, { fehler: "zu viele Anfragen" }, { "retry-after": "10" })
        : antwort(200, { ok: true, zeit: "06:00", ort: "ok", eintrag: { start: "06:00" } });
    }));
    const p = SP.stempeln("2026-11-03", "start", null);
    await vi.advanceTimersByTimeAsync(60000);
    await p;
    vi.restoreAllMocks();
    expect(aufrufe).toHaveLength(2);
    /* 10 s Retry-After + fast 20 % = knapp 12 s (vorher: 10 s + höchstens 1 s). */
    expect(aufrufe[1] - aufrufe[0]).toBeGreaterThan(11500);
    expect(aufrufe[1] - aufrufe[0]).toBeLessThanOrEqual(12000);
  });

  it("Auflage N1: der Stempelknopf bleibt gesperrt, bis das Stempeln samt Wiederholungen fertig ist (Stempeluhr und mobile Fläche)", async () => {
    const { readFile } = await import("node:fs/promises");
    const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
    /* Früher: akt.stempeln(...) ohne Warten, sofort setLaeuft(false) — während der
       Wiederholungen nach 429 (bis ≈ 36 s) war der Knopf wieder frei. */
    expect(app).not.toMatch(/akt\.stempeln\([^)]*\);\s*setLaeuft\(false\)/);
    /* WP-16: der fünfte Wert ist die Pause beim Ausstempeln — die Sperre bis zum Ende bleibt dieselbe. */
    const warten = app.match(/Promise\.resolve\(akt\.stempeln\(p\.id, tag, art, \w+(?:, [^)]*)?\)\)\.finally\(\(\) => setLaeuft\(false\)\)/g) || [];
    expect(warten, "Stempeluhr und MStempel").toHaveLength(2);
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

/* Review WP-16 (niedrig): Eine Pause, die keine Zahl ist, wird nicht als NaN (im JSON: null) gesendet. */
describe("speicher.stempeln: Pause beim Ausstempeln", () => {
  const rumpf = async (art, pause) => {
    const f = vi.fn(async () => antwort(200, { ok: true, zeit: "14:00", ort: "ok", eintrag: { ende: "14:00" } }));
    vi.stubGlobal("fetch", f);
    await SP.stempeln("2026-11-03", art, null, pause);
    return JSON.parse(f.mock.calls[0][1].body);
  };
  it("keine Zahl → keine Angabe; Zahl → gesendet; beim Beginn nie", async () => {
    for (const x of ["abc", "", null, undefined, "3x"]) expect("pause" in (await rumpf("ende", x)), String(x)).toBe(false);
    expect((await rumpf("ende", "30")).pause).toBe(30);
    expect((await rumpf("ende", 0)).pause).toBe(0);
    expect("pause" in (await rumpf("start", 30))).toBe(false);
  });
});
