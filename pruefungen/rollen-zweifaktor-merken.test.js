/* ==========================================================================
   SI-P4 — „ZUGANG MERKEN“ IN DER OBERFLÄCHE (src/speicher.js)

   Der Server sagt mit `merkenErlaubt`, ob ein Zugang auf dem Gerät gemerkt
   werden darf (Leitung, Planung, Kunde nur mit aktivem zweitem Faktor,
   Betreiber nie). Die Oberfläche merkt nur bei einem ausdrücklichen true —
   fehlt die Angabe, wird nicht gemerkt (fail-closed). Ein schon gemerkter
   Zugang, für den sie beim Laden nicht (mehr) gilt, verlässt den dauerhaften
   Speicher; die Sitzung des Reiters bleibt.

   Rot auf altem Stand: anmelden() legte den Zugang bei Häkchen immer in
   localStorage, auch für Leitung und Betreiber.
   ========================================================================== */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const antwort = (status, daten, kopf = {}) => new Response(JSON.stringify(daten),
  { status, headers: { "content-type": "application/json", ...kopf } });
const speicherAttrappe = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null),
  setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear(), _m: m }; };

let SP, LS, SS;
beforeEach(async () => {
  vi.resetModules();
  LS = speicherAttrappe(); SS = speicherAttrappe();
  vi.stubGlobal("localStorage", LS);
  vi.stubGlobal("sessionStorage", SS);
  vi.stubGlobal("window", { addEventListener: () => {} });
  vi.stubGlobal("document", { visibilityState: "visible", addEventListener: () => {} });
  SP = await import("../src/speicher.js");
});
afterEach(() => { SP.ausstehendVerwerfen(); vi.unstubAllGlobals(); });

const anmeldung = (felder) => vi.stubGlobal("fetch", vi.fn(async () => antwort(200,
  { token: "tok-1", name: "Probe", person: null, betrieb: 0, ...felder })));

describe("SI-P4 anmelden(): gemerkt nur mit merkenErlaubt === true", () => {
  it("Leitung ohne zweiten Faktor (merkenErlaubt: false): nur dieser Reiter, nichts dauerhaft", async () => {
    anmeldung({ rolle: "leitung", zweifaktor: false, merkenErlaubt: false });
    await SP.anmelden("CODE-LEIT-UNG1", true);
    expect(SS.getItem("centric:token")).toBe("tok-1");
    expect(LS.getItem("centric:token")).toBeNull();
    expect(SP.wirdGemerkt()).toBe(false);
  });

  it("Leitung mit zweitem Faktor (merkenErlaubt: true): gemerkt", async () => {
    anmeldung({ rolle: "leitung", zweifaktor: true, merkenErlaubt: true });
    await SP.anmelden("CODE-LEIT-UNG1", true, "123456");
    expect(LS.getItem("centric:token")).toBe("tok-1");
    expect(SP.wirdGemerkt()).toBe(true);
  });

  it("Angabe fehlt (alter Server, Betreiber): nicht gemerkt", async () => {
    anmeldung({ rolle: "betreiber", zweifaktor: true });
    await SP.anmelden("CODE-BETR-EIB1", true, "123456");
    expect(LS.getItem("centric:token")).toBeNull();
    anmeldung({ rolle: "mitarbeiter", merkenErlaubt: "ja" });
    await SP.anmelden("CODE-MITA-RB01", true);
    expect(LS.getItem("centric:token")).toBeNull();
  });

  it("Mitarbeiter mit merkenErlaubt: true und Häkchen: gemerkt; ohne Häkchen nie", async () => {
    anmeldung({ rolle: "mitarbeiter", merkenErlaubt: true });
    await SP.anmelden("CODE-MITA-RB01", false);
    expect(LS.getItem("centric:token")).toBeNull();
    await SP.anmelden("CODE-MITA-RB01", true);
    expect(LS.getItem("centric:token")).toBe("tok-1");
  });

  it("Demozugang: Leitung, Planung, Kunde, Betreiber werden nie gemerkt", async () => {
    for (const rolle of ["leitung", "planer", "subplaner", "kunde", "betreiber"]) {
      LS.clear();
      vi.stubGlobal("fetch", vi.fn(async () => antwort(200, { token: "demo-1", name: "D", rolle, person: null, betrieb: 0 })));
      await SP.demoOeffnen("d1", true);
      expect(LS.getItem("centric:token"), rolle).toBeNull();
    }
    LS.clear();
    vi.stubGlobal("fetch", vi.fn(async () => antwort(200, { token: "demo-2", name: "D", rolle: "mitarbeiter", person: "p", betrieb: 0 })));
    await SP.demoOeffnen("d2", true);
    expect(LS.getItem("centric:token")).toBe("demo-2");
  });
});

describe("SI-P4 lies(): ein gemerkter Zugang ohne Erlaubnis verlässt den dauerhaften Speicher", () => {
  it("merkenErlaubt: false vom Server — localStorage geleert, Reiter bleibt angemeldet", async () => {
    anmeldung({ rolle: "leitung", zweifaktor: true, merkenErlaubt: true });
    await SP.anmelden("CODE-LEIT-UNG1", true, "123456");
    expect(LS.getItem("centric:token")).toBe("tok-1");
    vi.stubGlobal("fetch", vi.fn(async () => antwort(200, { bestand: null, etag: null, rolle: "leitung",
      person: null, betrieb: 0, name: "Probe", merkenErlaubt: false })));
    await SP.lies();
    expect(LS.getItem("centric:token")).toBeNull();
    expect(SP.wirdGemerkt()).toBe(false);
    expect(SS.getItem("centric:token")).toBe("tok-1");
    expect(SP.angemeldet()).toBe(true);
  });

  it("Antwort aus dem Speicher des Dienstarbeiters entscheidet nicht", async () => {
    anmeldung({ rolle: "mitarbeiter", merkenErlaubt: true });
    await SP.anmelden("CODE-MITA-RB01", true);
    vi.stubGlobal("fetch", vi.fn(async () => antwort(200, { bestand: null, etag: null, rolle: "mitarbeiter",
      person: null, betrieb: 0, name: "Probe" }, { "x-centric-offline": "ja" })));
    await SP.lies();
    expect(LS.getItem("centric:token")).toBe("tok-1");
  });
});
