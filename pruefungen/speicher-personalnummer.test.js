/* ==========================================================================
   Review d6c92e0, Befund 2 — Client-Zweig PERSONALNUMMER_DOPPELT (src/speicher.js)

   Eine 409 mit code PERSONALNUMMER_DOPPELT ist eine Absage ohne Bestand, kein
   Versionskonflikt:
   - die Meldung des Servers kommt als Fehlerlage an (onFehler, ausstehend),
   - der ETag des Clients bleibt der, gegen den er geschrieben hat — auch wenn
     die Antwort einen anderen nennt (Befund 1),
   - kein onKonflikt (es gibt keinen fremden Stand, den man zeigen könnte),
     kein onGespeichert.
   Muster wie pruefungen/modul-kern-nachtrag5-speicher.test.js (fetch-Attrappe).
   Aufruf: npx vitest run pruefungen/speicher-personalnummer.test.js
   ========================================================================== */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const antwort = (status, daten) => new Response(JSON.stringify(daten), { status, headers: { "content-type": "application/json" } });
const speicherAttrappe = (vorab = {}) => { const m = new Map(Object.entries(vorab)); return { getItem: (k) => (m.has(k) ? m.get(k) : null),
  setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear() }; };
const stand = (nr) => ({ mandanten: [{ id: "m1", name: "B", personen: [{ id: "p1", personalnummer: nr }] }] });
const TEXT = "Die Personalnummer „P-1“ trägt schon eine andere Person dieses Betriebs. Es wurde nichts geändert.";

let SP, puts, antworten;
beforeEach(async () => {
  vi.resetModules();
  vi.stubGlobal("sessionStorage", speicherAttrappe({ "centric:token": "t-1" }));
  vi.stubGlobal("localStorage", speicherAttrappe());
  puts = []; antworten = [];
  vi.stubGlobal("fetch", vi.fn(async (url, opt = {}) => {
    if (url === "/api/bestand" && (opt.method || "GET") === "GET")
      return antwort(200, { bestand: stand("P-0"), etag: "7", rolle: "leitung", schreiben: "voll" });
    if (url === "/api/bestand" && opt.method === "PUT") { puts.push(JSON.parse(opt.body)); return antworten.shift(); }
    return antwort(404, {});
  }));
  SP = await import("../src/speicher.js");
  await SP.lies();
});
afterEach(() => { SP.ausstehendVerwerfen(); vi.unstubAllGlobals(); });

describe("Befund 2: 409 PERSONALNUMMER_DOPPELT im Client", () => {
  for (const [fall, etagAntwort] of [["mit neuerem ETag in der Antwort", "9"], ["ohne ETag in der Antwort", undefined]]) {
    it(`${fall}: Meldung angezeigt, ETag unverändert, kein onKonflikt, kein onGespeichert`, async () => {
      antworten.push(antwort(409, { fehler: "Personalnummer schon vergeben.", code: "PERSONALNUMMER_DOPPELT", text: TEXT,
        ...(etagAntwort ? { etag: etagAntwort } : {}) }));
      const fehler = [], konflikt = [], gespeichert = [];
      await SP.schreib(stand("P-1"), { sofort: true, onFehler: (l) => fehler.push(l), onKonflikt: (d) => konflikt.push(d),
        onGespeichert: (b) => gespeichert.push(b) });
      expect(puts[0].etag).toBe("7");
      expect(konflikt).toEqual([]);
      expect(gespeichert).toEqual([]);
      expect(fehler).toHaveLength(1);
      expect(fehler[0].text).toBe(TEXT);
      expect(fehler[0].status).toBe(409);
      expect(fehler[0].fehler.code).toBe("PERSONALNUMMER_DOPPELT");
      expect(SP.ausstehend()).toMatchObject({ text: TEXT, status: 409 });
      /* Korrigiert und neu gespeichert: derselbe ETag wie vorher geht hinaus. */
      antworten.push(antwort(200, { etag: "8" }));
      const ok = [];
      await SP.schreib(stand("P-2"), { sofort: true, onGespeichert: (b) => ok.push(b), onKonflikt: (d) => konflikt.push(d) });
      expect(puts[1].etag).toBe("7");
      expect(ok).toHaveLength(1);
      expect(konflikt).toEqual([]);
      expect(SP.ausstehend()).toBeNull();
    });
  }
});
