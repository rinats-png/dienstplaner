/* ==========================================================================
   E-9 / Review-Auflage M1 — Abmelden erreicht den Server auch bei sofortigem
   Neuladen (src/speicher.js, src/app/abmelden.js)

   abmeldenMitHinweis() lädt direkt nach SP.abmelden() neu. Die Anfrage an
   /api/abmelden muss deshalb synchron starten (keepalive), mit dem vorher
   gemerkten Endpunkt dieses Geräts — nicht erst nach einer asynchronen
   Abfrage beim Browser.
   ========================================================================== */
// zeit-ok: keine Uhr — es wird nur die Reihenfolge von Aufrufen geprüft.

import { describe, it, expect, beforeEach, vi } from "vitest";

const lokalerSpeicher = () => { const d = new Map(); return { getItem: (k) => (d.has(k) ? d.get(k) : null),
  setItem: (k, v) => d.set(k, String(v)), removeItem: (k) => d.delete(k),
  key: (i) => [...d.keys()][i] ?? null, get length() { return d.size; } }; };
const antwortVon = (status, d) => ({ status, ok: status < 400, json: async () => d, headers: { get: () => null } });

let ereignisse, abmeldeRumpf;
function umgebung({ push = false, erlaubnis = "granted", gemerkt } = {}) {
  ereignisse = []; abmeldeRumpf = undefined;
  globalThis.localStorage = lokalerSpeicher();
  globalThis.sessionStorage = lokalerSpeicher();
  if (gemerkt !== undefined) globalThis.localStorage.setItem("centric:pushgeraet", gemerkt);
  Object.defineProperty(globalThis, "navigator", { configurable: true, writable: true,
    value: push ? { serviceWorker: { getRegistration: () => Promise.resolve(null), ready: Promise.resolve(null), register: () => Promise.resolve(null) } } : {} });
  globalThis.window = { ...(push ? { PushManager: function PushManager() {} } : {}),
    addEventListener: () => {}, removeEventListener: () => {},
    confirm: () => true, location: { reload: () => ereignisse.push("reload") } };
  globalThis.Notification = { permission: erlaubnis };
  globalThis.document = { addEventListener: () => {}, removeEventListener: () => {}, visibilityState: "visible" };
  globalThis.fetch = (url, opt = {}) => {
    if (url === "/api/anmelden") return Promise.resolve(antwortVon(200, { token: "t-nur-zum-pruefen", name: "B", rolle: "mitarbeiter" }));
    if (url === "/api/abmelden") {
      ereignisse.push("abmelden");
      abmeldeRumpf = { body: JSON.parse(opt.body), keepalive: opt.keepalive, auth: (opt.headers || {}).authorization };
      return Promise.resolve(antwortVon(200, {}));
    }
    return Promise.resolve(antwortVon(404, {}));
  };
}

beforeEach(() => { vi.resetModules(); });

describe("SP.abmelden startet die Anfrage synchron", () => {
  it("ohne Push-Fähigkeit: sofort, mit {geraet: null} und dem Sitzungsmerkmal", async () => {
    umgebung();
    const SP = await import("../src/speicher.js");
    await SP.anmelden("code-nur-zum-pruefen", false);
    SP.abmelden();
    expect(ereignisse).toEqual(["abmelden"]);                          // vor jedem await
    expect(abmeldeRumpf).toEqual({ body: { geraet: null }, keepalive: true, auth: "Bearer t-nur-zum-pruefen" });
  });
  it("mit gemerktem Endpunkt: {geraet: {endpoint}} — ohne auf den Browser zu warten", async () => {
    umgebung({ push: true, gemerkt: JSON.stringify({ endpoint: "https://push.example/dieses" }) });
    const SP = await import("../src/speicher.js");
    await SP.anmelden("code-nur-zum-pruefen", false);
    SP.abmelden();
    expect(abmeldeRumpf.body).toEqual({ geraet: { endpoint: "https://push.example/dieses" } });
  });
  it("gemerkt „keins“ oder keine Erlaubnis: {geraet: null}; nichts gemerkt: ohne Angabe (bisheriges Verhalten)", async () => {
    for (const [fall, erwartet] of [[{ push: true, gemerkt: "keins" }, { geraet: null }],
      [{ push: true, erlaubnis: "default", gemerkt: JSON.stringify({ endpoint: "https://push.example/x" }) }, { geraet: null }],
      [{ push: true }, {}]]) {
      vi.resetModules();
      umgebung(fall);
      const SP = await import("../src/speicher.js");
      await SP.anmelden("code-nur-zum-pruefen", false);
      SP.abmelden();
      expect(abmeldeRumpf && abmeldeRumpf.body, JSON.stringify(fall)).toEqual(erwartet);
    }
  });
});

describe("abmeldenMitHinweis: die Anfrage ist gestartet, bevor neu geladen wird", () => {
  it("Reihenfolge abmelden → reload", async () => {
    umgebung({ push: true, gemerkt: JSON.stringify({ endpoint: "https://push.example/dieses" }) });
    const SP = await import("../src/speicher.js");
    await SP.anmelden("code-nur-zum-pruefen", false);
    const { abmeldenMitHinweis } = await import("../src/app/abmelden.js");
    abmeldenMitHinweis();
    expect(ereignisse).toEqual(["abmelden", "reload"]);
    expect(abmeldeRumpf.keepalive).toBe(true);
  });
});
