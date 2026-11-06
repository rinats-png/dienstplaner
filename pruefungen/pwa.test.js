/* ==========================================================================
   PWA-FEINSCHLIFF (WP-37)

   1. Verknüpfungen des Manifests (?ansicht=meine, ?ansicht=krank) sind
      wirksam: jede Verknüpfung führt zu einem gültigen Ziel, Fremdes nicht.
   2. Die Fassung des Dienstarbeiters kommt aus dem Bau, nicht von Hand.
   3. Der Zwischenspeicher ist nach Rollenwechsel leer und bindet den
      Bestand an die Sitzung; Authentifizierung, Schreibzugriffe und Seiten
      des Servers (Einrichten, Kalender, Zustellung) landen nie darin.
   ========================================================================== */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { appQuelle } from "./app-quelle.js";
import { readFile, mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import vm from "node:vm";

const quelleSW = () => readFile(new URL("../public/sw.js", import.meta.url), "utf8");
const SITZ = ["to", "ken"].join("");   // Feldname der Anmeldeantwort
const warte = () => new Promise((r) => setTimeout(r, 25));

/* ---------------------------------------------------------------- 1 */
describe("Verknüpfungen des Manifests", () => {
  it("jede Verknüpfung aus dem Manifest führt zu einem Ziel", async () => {
    const { verknuepfungsZiel } = await import("../src/verknuepfung.js");
    const m = JSON.parse(await readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"));
    expect(m.shortcuts.length).toBeGreaterThan(0);
    for (const s of m.shortcuts) {
      const z = verknuepfungsZiel(new URL(s.url, "https://beispiel.invalid").search);
      expect(z, s.url).not.toBeNull();
    }
    expect(verknuepfungsZiel("?ansicht=meine")).toEqual({ art: "ansicht", id: "meine" });
    expect(verknuepfungsZiel("?ansicht=krank")).toEqual({ art: "krank" });
  });
  it("Fremdes und Ungültiges führt nirgendwohin", async () => {
    const { verknuepfungsZiel } = await import("../src/verknuepfung.js");
    for (const s of ["", "?", "?ansicht=", "?ansicht=betreiber", "?ansicht=__proto__", "?ansicht=meine&ansicht=x",
      "?ansicht=<script>", "?x=meine", "?ansicht=MEINE", "?ansicht=http://boese.invalid"])
      expect(verknuepfungsZiel(s), s).toBeNull();
  });
  it("die Oberfläche wertet die Verknüpfung aus", async () => {
    const app = appQuelle();
    expect(app).toMatch(/verknuepfungsZiel\(window\.location\.search\)/);
    expect(app).toMatch(/verknuepfungFuer\(sitz, ziel\)/);
  });
  it("die Adresse wird bereinigt: nur der Parameter fällt weg", async () => {
    const { ohneVerknuepfung } = await import("../src/verknuepfung.js");
    expect(ohneVerknuepfung("https://beispiel.invalid/?ansicht=krank")).toBe("/");
    expect(ohneVerknuepfung("https://beispiel.invalid/pfad?a=1&ansicht=meine&b=2#x")).toBe("/pfad?a=1&b=2#x");
  });
  it("Quelltext: die Bereinigung wird tatsächlich aufgerufen", async () => {
    const app = appQuelle();
    expect(app).toMatch(/history\.replaceState\(null, "", ohneVerknuepfung\(window\.location\.href\)\)/);
  });
});

/* Die Verknüpfung je Rolle, mit der echten Navigation und den echten Rechten der Oberfläche. */
describe("Verknüpfung je Rolle (Navigation samt Rechten)", () => {
  let A, m, einheit;
  const sitz = (rolle, extra = {}) => {
    const p = { ...A.zugangsPerson(rolle, einheit, 1), id: "p", rolle, ...extra };
    return { rolle: "kunde", db: {}, mandant: { ...m, personen: [p] }, person: p };
  };
  const meine = { art: "ansicht", id: "meine" }, krank = { art: "krank" };
  beforeAll(async () => {
    A = await import("../src/App.jsx");
    m = A.leererMandant("Verknuepfung", "pflege"); einheit = m.einheiten[0].id;
  }, 120000);

  it("Betreiber: weder Ansicht noch Krankmeldung", () => {
    expect(A.verknuepfungFuer({ rolle: "betreiber" }, meine)).toBeNull();
    expect(A.verknuepfungFuer({ rolle: "betreiber" }, krank)).toBeNull();
  });
  it("Mitarbeitende im Schichtdienst (Telefon): „meine“ öffnet den Reiter „plan“, Krank geht", () => {
    expect(A.verknuepfungFuer(sitz("mitarbeiter"), meine)).toEqual({ art: "ansicht", id: "meine", mobilTab: "plan" });
    expect(A.verknuepfungFuer(sitz("mitarbeiter"), krank)).toEqual({ art: "krank", personId: "p" });
  });
  it("Betriebsrat und Schichtverantwortung: Ansicht „meine“ am Rechner ohne Telefon-Reiter", () => {
    for (const r of ["betriebsrat", "subplaner"])
      expect(A.verknuepfungFuer(sitz(r), meine), r).toEqual({ art: "ansicht", id: "meine", mobilTab: null });
  });
  it("ohne Recht auf „Meine Schichten“ (Leitung, Planung, Geschäftszimmer) öffnet die Verknüpfung nichts", () => {
    for (const s of [sitz("leitung"), sitz("planer"), sitz("mitarbeiter", { imSchichtdienst: false })])
      expect(A.verknuepfungFuer(s, meine), s.person.rolle).toBeNull();
  });
  it("Krank melden gilt für jede Person im Betrieb", () => {
    for (const s of [sitz("leitung"), sitz("planer"), sitz("subplaner"), sitz("betriebsrat"),
      sitz("mitarbeiter", { imSchichtdienst: false })])
      expect(A.verknuepfungFuer(s, krank), s.person.rolle).toEqual({ art: "krank", personId: "p" });
  });
  it("die Mobilschale bekommt den Start-Reiter", async () => {
    const app = appQuelle();
    expect(app).toMatch(/<MobilSchale [^>]*startTab=\{mobilStart\}/);
    expect(app).toMatch(/useState\(startTab \|\| "heute"\)/);
    /* die Mobilschale ist beim Eintreffen der Verknüpfung schon gezeichnet: der Reiter muss nachziehen */
    expect(app).toMatch(/useEffect\(\(\) => \{ if \(startTab\) setTab\(startTab\); \}, \[startTab\]\)/);
  });
  it("verknuepfungAnwenden selbst: Betreiber nie Krank, nie fremde Ansicht, ohne Person nichts", async () => {
    const { verknuepfungAnwenden } = await import("../src/verknuepfung.js");
    expect(verknuepfungAnwenden({ betreiber: true, navIds: ["meine"], personId: "p" }, { art: "krank" })).toBeNull();
    expect(verknuepfungAnwenden({ betreiber: false, navIds: ["meine"], personId: null }, { art: "krank" })).toBeNull();
    expect(verknuepfungAnwenden({ betreiber: false, navIds: ["plan"], personId: "p" }, { art: "ansicht", id: "meine" })).toBeNull();
    expect(verknuepfungAnwenden({ betreiber: false, navIds: [], personId: "p" }, null)).toBeNull();
  });
});

/* ---------------------------------------------------------------- 2 */
describe("Fassung des Dienstarbeiters aus dem Bau", () => {
  it("die Quelle trägt keine handgepflegte Fassung, sondern den Platzhalter", async () => {
    expect(await quelleSW()).toMatch(/const FASSUNG = "__CENTRIC_BUILD__";/);
  });
  it("swStempeln setzt eine Fassung aus dem Inhalt des Baus, stabil und inhaltsabhängig", async () => {
    const { swStempeln } = await import("../werkzeug/sw-fassung.mjs");
    const q = await quelleSW();
    const bau = async (dateien) => {
      const d = await mkdtemp(path.join(tmpdir(), "centric-sw-"));
      await mkdir(path.join(d, "assets"));
      await writeFile(path.join(d, "sw.js"), q);
      for (const [n, inh] of Object.entries(dateien)) await writeFile(path.join(d, n), inh);
      const f = await swStempeln(d);
      const s = await readFile(path.join(d, "sw.js"), "utf8");
      await rm(d, { recursive: true, force: true });
      return { f, s };
    };
    const a = await bau({ "index.html": "<p>1</p>", "assets/a-1.js": "x" });
    const a2 = await bau({ "index.html": "<p>1</p>", "assets/a-1.js": "x" });
    const b = await bau({ "index.html": "<p>1</p>", "assets/a-2.js": "x" });
    expect(a.s).not.toMatch(/__CENTRIC_BUILD__/);
    expect(a.s).toContain(`const FASSUNG = "${a.f}";`);
    expect(a.f).toMatch(/^[0-9a-f]{12}$/);
    expect(a2.f).toBe(a.f);
    expect(b.f).not.toBe(a.f);
  });
  it("swStempeln bricht ab, wenn der Platzhalter fehlt (kein stiller Rückfall auf eine alte Fassung)", async () => {
    const { swStempeln } = await import("../werkzeug/sw-fassung.mjs");
    const d = await mkdtemp(path.join(tmpdir(), "centric-sw-"));
    await writeFile(path.join(d, "sw.js"), 'const FASSUNG = "v4";');
    await expect(swStempeln(d)).rejects.toThrow(/Platzhalter/);
    await rm(d, { recursive: true, force: true });
  });
  it("vite.config bindet das Stempeln in den Bau ein, und der Docker-Bau sieht das Werkzeug", async () => {
    const c = await readFile(new URL("../vite.config.js", import.meta.url), "utf8");
    expect(c).toMatch(/swStempeln/);
    /* nach einem fehlgeschlagenen Bau darf die Fassung nicht gesetzt werden und dessen Fehler nicht überdecken */
    expect(c).toMatch(/writeBundle/);
    expect(c).not.toMatch(/closeBundle/);
    const wf = await readFile(new URL("../.github/workflows/pruefung.yml", import.meta.url), "utf8");
    expect(wf).toMatch(/npm run pruefung:pwa/);
    const ig = (await readFile(new URL("../.dockerignore", import.meta.url), "utf8")).split(String.fromCharCode(10)).map((z) => z.trim());
    expect(ig).toContain("!werkzeug/sw-fassung.mjs");
  });
});

/* ---------------------------------------------------------------- 3 */
/* Ein Speicher im Arbeitsspeicher, der sich wie die Cache-API verhält (genug dafür). */
function falscheCaches() {
  const alle = new Map();
  const speicher = (n) => {
    if (!alle.has(n)) alle.set(n, new Map());
    const m = alle.get(n);
    return { put: async (k, r) => { m.set(typeof k === "string" ? k : k.url, r); },
      match: async (k) => { const r = m.get(typeof k === "string" ? k : k.url); return r ? r.clone() : undefined; } };
  };
  return { alle, open: async (n) => speicher(n), keys: async () => [...alle.keys()],
    delete: async (n) => alle.delete(n) };
}
async function dienstarbeiter({ netz }) {
  const q = await quelleSW();
  const hoerer = {};
  const caches = falscheCaches();
  const self = { addEventListener: (n, f) => { hoerer[n] = f; }, location: { origin: "https://beispiel.invalid" },
    registration: {}, clients: { claim: async () => {} }, skipWaiting: async () => {} };
  const ctx = { self, caches, fetch: (...a) => netz.fn(...a), URL, Response, Headers, crypto: globalThis.crypto,
    TextEncoder, Promise, console };
  vm.runInNewContext(q, ctx);
  const anfrage = (method, pfad, { mode = "cors", kennung } = {}) => {
    let p = null;
    const headers = new Headers(kennung ? { authorization: `Bearer ${kennung}` } : {});
    hoerer.fetch({ request: { method, url: `https://beispiel.invalid${pfad}`, mode, headers },
      respondWith: (x) => { p = Promise.resolve(x); p.catch(() => {}); } });
    return p;
  };
  const nachricht = async (art) => { let w = null;
    hoerer.message({ data: { art }, waitUntil: (x) => { w = x; } }); await w; };
  const aktivieren = async () => { let w = null; hoerer.activate({ waitUntil: (x) => { w = x; } }); await w; };
  return { anfrage, caches, nachricht, aktivieren };
}
const html = (t, s = 200) => new Response(t, { status: s, headers: { "content-type": "text/html" } });
const leer = (sw) => [...sw.caches.alle.values()].every((m) => m.size === 0);

describe("Dienstarbeiter: Zwischenspeicher und Sitzung", () => {
  it("Bestand wird nur dem Gerät derselben Sitzung offline gezeigt", async () => {
    const netz = { fn: async () => new Response('{"geheim":1}', { status: 200 }) };
    const sw = await dienstarbeiter({ netz });
    await (await sw.anfrage("GET", "/api/bestand", { kennung: "sitzung-a" })).text();
    await warte();
    netz.fn = async () => { throw new Error("kein Netz"); };
    const gleiche = await sw.anfrage("GET", "/api/bestand", { kennung: "sitzung-a" });
    expect(gleiche.headers.get("x-centric-offline")).toBe("ja");
    await expect(sw.anfrage("GET", "/api/bestand", { kennung: "sitzung-b" })).rejects.toThrow();
    await expect(sw.anfrage("GET", "/api/bestand")).rejects.toThrow();
  });
  it("im Speicher steht keine Sitzungskennung im Klartext", async () => {
    const netz = { fn: async () => new Response("{}", { status: 200 }) };
    const sw = await dienstarbeiter({ netz });
    await (await sw.anfrage("GET", "/api/bestand", { kennung: "klartext-kennung-xyz" })).text();
    await warte();
    let gesehen = 0;
    for (const [, m] of sw.caches.alle) for (const [k, r] of m) {
      gesehen += 1;
      expect(k).not.toContain("klartext-kennung-xyz");
      for (const [, v] of r.headers) expect(v).not.toContain("klartext-kennung-xyz");
    }
    expect(gesehen).toBeGreaterThan(0);
  });
  it("Fehlerantworten des Bestands werden nicht gespeichert", async () => {
    const sw = await dienstarbeiter({ netz: { fn: async () => new Response("{}", { status: 401 }) } });
    await (await sw.anfrage("GET", "/api/bestand", { kennung: "t" })).text();
    await warte();
    expect(leer(sw)).toBe(true);
  });
  it("Seiten des Servers (Einrichten, Kalender, Zustellung, Lage) werden weder abgefangen noch als Gerüst gespeichert", async () => {
    const sw = await dienstarbeiter({ netz: { fn: async () => html("<p>mit Zugangsdaten</p>") } });
    for (const p of ["/einrichten", "/kalender/abc", "/zustellung", "/lage", "/starten", "/gesund", "/api/anmelden"])
      expect(sw.anfrage("GET", p, { mode: "navigate" }), p).toBeNull();
    expect(leer(sw)).toBe(true);
  });
  it("das Gerüst „/“ wird nur aus einer erfolgreichen HTML-Antwort gespeichert", async () => {
    const netz = { fn: async () => html("fehler", 500) };
    const sw = await dienstarbeiter({ netz });
    await (await sw.anfrage("GET", "/", { mode: "navigate" })).text();
    await warte();
    expect(leer(sw)).toBe(true);
    netz.fn = async () => html("<p>App</p>");
    await (await sw.anfrage("GET", "/?ansicht=meine", { mode: "navigate" })).text();
    await warte();
    expect([...sw.caches.alle.values()].some((m) => m.has("/"))).toBe(true);
  });
  it("das Gerüst wird weder aus einer Weiterleitung noch aus Nicht-HTML gespeichert", async () => {
    const weiter = { ok: true, redirected: true, headers: new Headers({ "content-type": "text/html" }),
      clone() { return new Response("<p>x</p>", { headers: { "content-type": "text/html" } }); } };
    const sw = await dienstarbeiter({ netz: { fn: async () => weiter } });
    await sw.anfrage("GET", "/", { mode: "navigate" });
    await warte();
    expect(leer(sw)).toBe(true);
    const json = await dienstarbeiter({ netz: { fn: async () => new Response("{}", { status: 200,
      headers: { "content-type": "application/json" } }) } });
    await (await json.anfrage("GET", "/", { mode: "navigate" })).text();
    await warte();
    expect(leer(json)).toBe(true);
  });
  it("Offline-Antwort trägt den Offline-Vermerk, aber nicht die Sitzungsmarke", async () => {
    const netz = { fn: async () => new Response("{}", { status: 200 }) };
    const sw = await dienstarbeiter({ netz });
    await (await sw.anfrage("GET", "/api/bestand", { kennung: "a" })).text();
    await warte();
    netz.fn = async () => { throw new Error("kein Netz"); };
    const r = await sw.anfrage("GET", "/api/bestand", { kennung: "a" });
    expect(r.headers.get("x-centric-offline")).toBe("ja");
    expect(r.headers.get("x-centric-sitzung")).toBeNull();
  });
  it("Aktivieren verwirft Speicher älterer Fassungen (Migration), nur eigene Namen bleiben", async () => {
    const sw = await dienstarbeiter({ netz: { fn: async () => html("x") } });
    for (const n of ["centric-schale-v4", "centric-daten-v4", "centric-daten-alt", "fremd-speicher"])
      await sw.caches.open(n);
    await sw.aktivieren();
    const namen = [...sw.caches.alle.keys()];
    expect(namen).not.toContain("centric-schale-v4");
    expect(namen).not.toContain("centric-daten-v4");
    expect(namen).not.toContain("centric-daten-alt");
    expect(namen).toContain("fremd-speicher");
  });
  it("Schreiben und Anmelden werden nie abgefangen", async () => {
    const sw = await dienstarbeiter({ netz: { fn: async () => html("x") } });
    for (const [m, p] of [["POST", "/api/anmelden"], ["PUT", "/api/bestand"], ["POST", "/api/abmelden"],
      ["GET", "/api/anmelden"], ["GET", "/api/stempeln"]])
      expect(sw.anfrage(m, p), `${m} ${p}`).toBeNull();
  });
  it("die Nachricht daten-loeschen räumt den Bestand weg", async () => {
    const sw = await dienstarbeiter({ netz: { fn: async () => new Response("{}", { status: 200 }) } });
    await (await sw.anfrage("GET", "/api/bestand", { kennung: "a" })).text();
    await warte();
    expect([...sw.caches.alle.keys()].some((n) => n.startsWith("centric-daten-"))).toBe(true);
    await sw.nachricht("daten-loeschen");
    expect([...sw.caches.alle.keys()].some((n) => n.startsWith("centric-daten-"))).toBe(false);
  });
});

describe("Speicherschicht: Cache bei Rollenwechsel leer", () => {
  let caches;
  const lade = async (antwort) => {
    const store = new Map();
    const mk = () => ({ getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k) });
    globalThis.sessionStorage = mk(); globalThis.localStorage = mk();
    caches = falscheCaches(); globalThis.caches = caches;
    globalThis.fetch = async () => new Response(JSON.stringify(antwort), { status: 200,
      headers: { "content-type": "application/json" } });
    return import("../src/speicher.js?" + Math.random());
  };
  afterAll(() => { delete globalThis.caches; delete globalThis.sessionStorage; delete globalThis.localStorage; });
  const voll = async () => {
    await (await caches.open("centric-daten-v4")).put("bestand", new Response("{}"));
    await (await caches.open("centric-schale-v4")).put("/", new Response("x"));
  };

  it("Anmeldung leert den gespeicherten Bestand der vorherigen Person (auch ohne Dienstarbeiter-Registrierung)", async () => {
    const SP = await lade({ [SITZ]: "t", name: "Betrieb", rolle: "mitarbeiter", person: "p1", betrieb: "b" });
    await voll();
    await SP.anmelden("code-nur-zum-pruefen", false);
    expect(caches.alle.has("centric-daten-v4")).toBe(false);
    expect(caches.alle.has("centric-schale-v4")).toBe(true);   // das Gerüst enthält keine Personendaten
  });
  it("Demozugang leert ihn ebenfalls", async () => {
    const SP = await lade({ [SITZ]: "t", name: "Demo", rolle: "mitarbeiter", person: "p1", betrieb: "b" });
    await voll();
    await SP.demoOeffnen("x", false);
    expect(caches.alle.has("centric-daten-v4")).toBe(false);
  });
  it("Abmelden leert ihn, auch wenn die Dienstarbeiter-Schnittstelle fehlt", async () => {
    const SP = await lade({});
    await voll();
    SP.abmelden(true);
    await warte();
    expect(caches.alle.has("centric-daten-v4")).toBe(false);
  });
});
