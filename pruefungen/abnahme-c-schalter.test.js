/* ==========================================================================
   ABNAHME V4 STRANG C (Bereich 16 + produktionsähnlicher Start) —
   ausgeschaltete KI-, Import- und Zusatzwege bleiben aus, auch bei
   verstümmelten Umgebungswerten

   Echter Server (node server.mjs als Kindprozess, NODE_ENV=production,
   eigene Wegwerf-Ablage, nur synthetische Daten). Geprüft wird:

     A  Vorgabe (keiner der Schalter gesetzt) gegen jede Verstümmelung
        („1", „TRUE", „ true", „true ", „yes", „on", „an", „True") aller
        Schalter zugleich: Jede Probe antwortet Wort für Wort wie in der
        Vorgabe. Gegenprobe: mit den genau dokumentierten Werten („true",
        „suche") antworten dieselben Proben ANDERS — die Proben sind also
        empfindlich, eine zu weite Auslegung eines Schalters fiele auf.
     B  Kein Weg /ki, /api/ki, /api/intelligence…, keine Debug-Wege; ohne
        Endung liefert der Server nur die Oberfläche (index.html), nie JSON
        eines Handlers. Die Startzeile „Funktionen:" nennt keinen KI-,
        Gateway- oder Intelligence-Weg.
     C  Kein ausgehender Netzverkehr: Eine Vorlade-Wache (--import) meldet
        jeden Verbindungsversuch des Servers zu einer Adresse außerhalb der
        eigenen Maschine (net/tls/http/https/fetch/dns) und blockiert ihn.
        Auch mit CENTRIC_KI_MODUS=an und CENTRIC_HILFE_ASSISTENT=an kommt
        keiner vor.
     D  Statischer Importgraph: Von server.mjs und server/funktionen/* aus ist
        kein Modul des Intelligence-Gateways (Anbieter, Live-Anbieter,
        Attrappe, Router …) erreichbar.
     E  Produktionsähnlicher Start: Sicherheitsköpfe (CSP, HSTS, nosniff,
        Rahmen, Referrer, Permissions) auf JSON, Oberfläche und 404; kein
        x-powered-by; /gesund nach außen genau {status}; das Startprotokoll
        enthält keine Geheimnisse; öffentliche Registrierung, Selbststart und
        Demo bleiben aus; eine ungültige CENTRIC_VERTRAUTE_PROXYS verweigert
        den Start (Exit ≠ 0, kein Port).

   Aufruf: npx vitest run pruefungen/abnahme-c-schalter.test.js --testTimeout=120000
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { serverStarten, freierPort } from "./hilfen/port.mjs";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PFEFFER = "pfeffer-nur-zum-pruefen-abnahme-c-0123456789";
const ADMIN = "admin-nur-zum-pruefen-abnahme-c-9876543210";
const INDEX = "<!doctype html><title>Abnahme C</title><p>Oberflaeche";

/* Alle Schalter, die einen gesperrten Weg öffnen könnten. */
const SCHALTER = ["CENTRIC_IMPORT_AKTIV", "CENTRIC_TEILSPEICHERUNG", "CENTRIC_HILFE_ASSISTENT", "CENTRIC_DEMO",
  "CENTRIC_PUBLIC_REGISTRATION", "CENTRIC_SELBSTSTART", "CENTRIC_KI_MODUS"];
/* „an" und „suche" fehlen bewusst: sie sind für CENTRIC_HILFE_ASSISTENT dokumentierte Werte (Gegenprobe unten). */
const VERSTUEMMELT = ["1", "TRUE", " true", "true ", "yes", "on", "AN", "True", "SUCHE", " suche", "An "];
/* Die dokumentierten Einschaltwerte (Gegenprobe). CENTRIC_KI_MODUS ist nirgends verdrahtet (D). */
const GENAU = { CENTRIC_IMPORT_AKTIV: "true", CENTRIC_TEILSPEICHERUNG: "true", CENTRIC_HILFE_ASSISTENT: "suche",
  CENTRIC_DEMO: "true", CENTRIC_PUBLIC_REGISTRATION: "true", CENTRIC_SELBSTSTART: "true", CENTRIC_KI_MODUS: "an" };

let statik, wache, B, sitzungAnlegen;
const aufraeumen = [];

/* Vorlade-Wache für den Kindprozess: jede Verbindung nach außen wird gemeldet und abgewiesen. */
const WACHE = `
import net from "node:net"; import tls from "node:tls"; import dns from "node:dns";
const lokal = (h) => !h || h === "localhost" || /^127\\./.test(h) || h === "::1" || h === "0.0.0.0" || h === "::ffff:127.0.0.1";
const melden = (wo, h) => { process.stderr.write("NETZWACHE " + wo + " " + h + "\\n"); };
const altConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...a) {
  const o = a[0] && typeof a[0] === "object" ? a[0] : { port: a[0], host: a[1] };
  const h = o.host || o.path || "";
  if (!o.path && !lokal(h)) { melden("net", h); throw new Error("NETZWACHE: ausgehend verboten"); }
  return altConnect.apply(this, a);
};
const altTls = tls.connect;
tls.connect = function (...a) { const o = a[0] && typeof a[0] === "object" ? a[0] : { host: a[1] };
  if (!lokal(o.host || o.servername)) { melden("tls", o.host || o.servername); throw new Error("NETZWACHE"); } return altTls.apply(this, a); };
const altLookup = dns.lookup;
dns.lookup = function (h, ...r) { if (!lokal(h)) melden("dns", h); return altLookup.call(this, h, ...r); };
const altFetch = globalThis.fetch;
globalThis.fetch = async (u, ...r) => { const h = new URL(String(u && u.url ? u.url : u)).hostname;
  if (!lokal(h)) { melden("fetch", h); throw new Error("NETZWACHE"); } return altFetch(u, ...r); };
`;

const person = (id, rolle, einheit) => ({ id, vorname: `V${id}`, nachname: `N${id}`, rolle, bereich: einheit, status: "aktiv",
  email: "", funktion: "Fachkraft", eintritt: "2020-01-01", wochenstunden: 38.5, urlaubsanspruch: 30, qualifikationen: [],
  zugehoerigkeit: [{ ab: "2020-01-01", einheitId: einheit }] });

/** Eine eigene Ablage mit einem synthetischen Betrieb und Sitzungen für Leitung und Beschäftigte. */
async function ablageAnlegen() {
  const daten = await mkdtemp(path.join(tmpdir(), "centric-abnahme-c-schalter-"));
  aufraeumen.push(daten);
  const vorher = process.env.CENTRIC_DATEN;
  process.env.CENTRIC_DATEN = daten;
  try {
    const { getStore } = await import("../server/lib/ablage.mjs");
    const store = getStore({ name: "centric", consistency: "strong" });
    const m1 = { id: "m1", name: "Haus C", status: "aktiv", einheiten: [{ id: "e1", name: "WB 1", versatz: 0 }], standorte: [],
      zyklus: { wochen: 1, tage: ["-", "-", "-", "-", "-", "-", "-"] }, dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00", pause: 30 }],
      qualifikationen: [], einstellungen: { ruhezeit: 11, maxFolge: 6 },
      personen: [person("l1", "leitung", "ALLE"), person("a1", "mitarbeiter", "e1")],
      abweichungen: {}, abwesenheiten: [], erfassung: {}, einstempeln: {}, anfragen: [], nachrichten: [], bestaetigungen: [] };
    await B.bestandSchreiben(store, "abnahme-c", { version: 9, mandanten: [m1] }, { durch: "Abnahme C" });
    const t = {};
    t.LT = (await sitzungAnlegen({ bestand: "abnahme-c", name: "Leitung", rolle: "leitung", person: "l1", betrieb: 0, mandantId: "m1", einheit: null }, 3600_000)).token;
    t.MA = (await sitzungAnlegen({ bestand: "abnahme-c", name: "MA", rolle: "mitarbeiter", person: "a1", betrieb: 0, mandantId: "m1", einheit: null }, 3600_000)).token;
    return { daten, t };
  } finally {
    if (vorher === undefined) delete process.env.CENTRIC_DATEN; else process.env.CENTRIC_DATEN = vorher;
  }
}

/** Server mit eigener Ablage und genau den angegebenen Schalterwerten (alle anderen entfernt). */
async function starten(schalter) {
  const { daten, t } = await ablageAnlegen();
  const env = { CENTRIC_STATIK: statik, CENTRIC_DATEN: daten, CENTRIC_ABLAGE: "dateien", CENTRIC_PFEFFER: PFEFFER,
    CENTRIC_ADMIN: ADMIN, NODE_ENV: "production", CENTRIC_AUFRAEUMEN: "aus", CENTRIC_ZUSTELL_TAKT: "aus",
    CENTRIC_UEBERWACHUNG: "aus", CENTRIC_ZUSTAND: path.join(daten, "..", path.basename(daten) + "-zustand"),
    CENTRIC_VERTRAUTE_PROXYS: undefined, CENTRIC_ALARM_WEBHOOK: undefined, RESEND_API_KEY: undefined,
    REDIS_REST_URL: undefined, REDIS_REST_TOKEN: undefined, CENTRIC_ROLLEN_ZWEIFAKTOR_PFLICHT: undefined,
    NODE_OPTIONS: `--import=${pathToFileURL(wache).href}` };
  for (const n of SCHALTER) env[n] = undefined;
  Object.assign(env, schalter);
  const s = await serverStarten({ cwd: WURZEL, env, wartenMs: 30_000 });
  return { ...s, t };
}
const stoppen = async (s) => {
  if (s && s.kind.exitCode === null) { s.kind.kill("SIGKILL"); await new Promise((r) => s.kind.once("exit", r)); }
};

/** Alle Proben. Ergebnis je Probe: Status und Rumpf (JSON oder Text), damit Vorgabe und Variante Wort für Wort vergleichbar sind. */
async function proben(s) {
  const { basis, t } = s;
  const h = (token, extra = {}) => ({ origin: basis, ...(token ? { authorization: `Bearer ${token}` } : {}), ...extra });
  const holen = async (pfad, o = {}) => {
    const a = await fetch(basis + pfad, { redirect: "manual", ...o });
    const text = await a.text();
    let rumpf; try { rumpf = JSON.parse(text); } catch { rumpf = text; }
    return { status: a.status, rumpf };
  };
  const json = (token, rumpf) => ({ method: "POST", headers: h(token, { "content-type": "application/json" }), body: JSON.stringify(rumpf) });
  const r = {};
  /* Import (CENTRIC_IMPORT_AKTIV) — mit und ohne Sitzung, jeder Weg. */
  for (const w of ["upload", "analyse", "vorschau", "uebernahme", "verwerfen"]) {
    r[`import/${w} LT`] = await holen(`/api/import/${w}`, { method: "POST", headers: h(t.LT, { "content-type": w === "upload" ? "application/octet-stream" : "application/json" }), body: w === "upload" ? "Personalnummer;Nachname\n1;X" : "{}" });
    r[`import/${w} ohne`] = await holen(`/api/import/${w}`, { method: "POST", headers: h(null, { "content-type": "application/json" }), body: "{}" });
  }
  /* Teilspeicherung (CENTRIC_TEILSPEICHERUNG) und GET ohne `teile`. */
  r["bestand/teile LT"] = await holen("/api/bestand/teile", json(t.LT, { teile: [] }));
  const g = await holen("/api/bestand", { headers: h(t.LT) });
  r["bestand GET hat teile"] = { status: g.status, rumpf: g.rumpf && typeof g.rumpf === "object" && "teile" in g.rumpf };
  /* Hilfe-Assistent (CENTRIC_HILFE_ASSISTENT). */
  r["hilfe/status MA"] = await holen("/api/hilfe/status", { headers: h(t.MA) });
  r["hilfe/frage MA"] = await holen("/api/hilfe/frage", json(t.MA, { frage: "Wie stemple ich ein?" }));
  /* Demo, Registrierung, Selbststart. */
  r["demos"] = await holen("/api/demos");
  r["demo POST"] = await holen("/api/demo", json(null, { id: "pflege" }));
  r["registrierung"] = await holen("/api/registrierung", json(null, { email: "probe@example.invalid", passwort: "x".repeat(16) }));
  r["starten GET"] = await holen("/starten");
  r["starten POST"] = await holen("/starten", json(null, { name: "Probe" }));
  /* KI/Intelligence/Debug: ohne und mit Leitungssitzung. */
  for (const p of ["/api/ki", "/api/ki/frage", "/api/intelligence", "/api/intelligence/gateway", "/api/gateway", "/api/debug",
    "/api/umgebung", "/api/version", "/api/hilfe/gateway"]) {
    r[`${p} LT`] = await holen(p, { headers: h(t.LT) });
    r[`${p} POST LT`] = await holen(p, json(t.LT, { frage: "x" }));
  }
  return r;
}

beforeAll(async () => {
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = PFEFFER;
  B = await import("../server/lib/bestand.mjs");
  ({ sitzungAnlegen } = await import("../server/lib/sitzungen.mjs"));
  statik = await mkdtemp(path.join(tmpdir(), "centric-abnahme-c-statik-"));
  aufraeumen.push(statik);
  await mkdir(path.join(statik, "assets"));
  await writeFile(path.join(statik, "index.html"), INDEX);
  wache = path.join(statik, "..", path.basename(statik) + "-netzwache.mjs");
  await writeFile(wache, WACHE);
}, 60_000);
afterAll(async () => {
  for (const d of aufraeumen) await rm(d, { recursive: true, force: true }).catch(() => {});
  if (wache) await rm(wache, { force: true }).catch(() => {});
});

describe("A/B/C — Vorgabe gegen Verstümmelung, Gegenprobe mit genauen Werten", { timeout: 600_000 }, () => {
  let vorgabe, vorgabeLog;
  beforeAll(async () => {
    const s = await starten({});
    try { vorgabe = await proben(s); vorgabeLog = s.log(); } finally { await stoppen(s); }
  }, 120_000);

  it("Vorgabe: jeder gesperrte Weg ist zu (404/Liste leer/aus), kein KI-, Debug- oder Gateway-Weg antwortet", () => {
    for (const w of ["upload", "analyse", "vorschau", "uebernahme", "verwerfen"]) {
      expect(vorgabe[`import/${w} LT`], w).toEqual({ status: 404, rumpf: { fehler: "Gibt es nicht." } });
      expect(vorgabe[`import/${w} ohne`].status, w).toBe(404);
    }
    expect(vorgabe["bestand/teile LT"].status).toBe(404);
    expect(vorgabe["bestand GET hat teile"]).toEqual({ status: 200, rumpf: false });
    expect(vorgabe["hilfe/status MA"]).toEqual({ status: 200, rumpf: { modus: "aus", modell: false } });
    expect(vorgabe["hilfe/frage MA"].status).toBe(404);
    expect(vorgabe["demos"]).toEqual({ status: 200, rumpf: { demos: [] } });
    expect(vorgabe["demo POST"].status).toBe(403);
    expect([403, 404]).toContain(vorgabe["registrierung"].status);
    expect([403, 404]).toContain(vorgabe["starten POST"].status);
    for (const [k, v] of Object.entries(vorgabe).filter(([k]) => /\/(ki|intelligence|gateway|debug|umgebung|version)/.test(k)))
      expect(v.status, k).toBe(404);
    /* Startprotokoll: keine KI-/Gateway-Route, keine Geheimnisse. */
    const funktionen = (vorgabeLog.match(/Funktionen: [^\n]*/) || [""])[0];
    expect(funktionen).toMatch(/daten \/api\/\*/);
    expect(funktionen).not.toMatch(/\bki\b|intelligence|gateway/i);
    expect(vorgabeLog).not.toContain(PFEFFER);
    expect(vorgabeLog).not.toContain(ADMIN);
    expect(vorgabeLog, "kein ausgehender Netzversuch").not.toMatch(/NETZWACHE/);
  });

  for (const wert of VERSTUEMMELT) {
    it(`alle Schalter = ${JSON.stringify(wert)}: jede Probe antwortet wie die Vorgabe, kein Netzversuch`, async () => {
      const s = await starten(Object.fromEntries(SCHALTER.map((n) => [n, wert])));
      try {
        const r = await proben(s);
        for (const k of Object.keys(vorgabe)) expect(r[k], `${k} bei ${JSON.stringify(wert)}`).toEqual(vorgabe[k]);
        expect(s.log()).not.toMatch(/NETZWACHE/);
      } finally { await stoppen(s); }
    });
  }

  it("Gegenprobe: genau die dokumentierten Werte öffnen Import, Teilweg, Hilfe-Suche und Demo — die Proben sind empfindlich", async () => {
    const s = await starten(GENAU);
    try {
      const r = await proben(s);
      expect(r["import/upload ohne"].status, "Import an: Sitzung fehlt → 401 statt 404").toBe(401);
      expect(r["bestand/teile LT"].status, "Teilweg an: nicht mehr 404").not.toBe(404);
      expect(r["bestand GET hat teile"].rumpf, "Teilweg an: GET trägt teile").toBe(true);
      expect(r["hilfe/status MA"].rumpf).toEqual({ modus: "suche", modell: false });
      expect(r["hilfe/frage MA"].status).toBe(200);
      expect(r["demo POST"]).not.toEqual(vorgabe["demo POST"]);
      /* Auch eingeschaltet: kein Modell, kein KI-Weg, kein Netz — CENTRIC_KI_MODUS=an ist nirgends verdrahtet. */
      for (const [k, v] of Object.entries(r).filter(([k]) => /\/(ki|intelligence|gateway|debug|umgebung|version)/.test(k)))
        expect(v.status, k).toBe(404);
      expect(s.log()).not.toMatch(/NETZWACHE/);
    } finally { await stoppen(s); }
  });

  it("Hilfe-Assistent „an“ (mit KI-Modus an): weiterhin kein Modell, keine Netzverbindung", async () => {
    const s = await starten({ CENTRIC_HILFE_ASSISTENT: "an", CENTRIC_KI_MODUS: "an" });
    try {
      const r = await proben(s);
      expect(r["hilfe/status MA"].rumpf).toEqual({ modus: "an", modell: false });
      expect(r["hilfe/frage MA"].status).toBe(200);
      /* Ohne eingehängtes Gateway meldet die Antwort das Modell als nicht verfügbar — es gibt nur die Hilfetexte. */
      expect(r["hilfe/frage MA"].rumpf.modell).toEqual({ status: "nicht_verfuegbar", text: "nicht verfügbar" });
      expect(JSON.stringify(r["hilfe/frage MA"].rumpf)).not.toMatch(/anbieter|claude|gpt|antwortText/i);
      expect(s.log()).not.toMatch(/NETZWACHE/);
    } finally { await stoppen(s); }
  });

  it("die Netzwache wirkt (Selbstprobe): ein Kindprozess mit der Wache, der nach außen will, wird gemeldet", async () => {
    const kind = spawn(process.execPath, [`--import=${pathToFileURL(wache).href}`, "-e",
      "fetch('http://192.0.2.1:9/').catch(()=>{}).finally(()=>setTimeout(()=>process.exit(0),50))"], { stdio: ["ignore", "pipe", "pipe"] });
    let log = ""; kind.stderr.on("data", (d) => { log += d; }); kind.stdout.on("data", (d) => { log += d; });
    await new Promise((r) => kind.once("exit", r));
    expect(log).toMatch(/NETZWACHE fetch 192\.0\.2\.1/);
  });
});

describe("D — statischer Importgraph: kein Gateway-Modul vom Server aus erreichbar", () => {
  it("von server.mjs und server/funktionen/* erreicht kein Import server/lib/intelligence/gateway/*", async () => {
    const start = [path.join(WURZEL, "server.mjs"),
      ...(await readdir(path.join(WURZEL, "server", "funktionen"))).filter((d) => d.endsWith(".mjs")).map((d) => path.join(WURZEL, "server", "funktionen", d))];
    const gesehen = new Set();
    const offen = [...start];
    while (offen.length) {
      const datei = offen.pop();
      if (gesehen.has(datei)) continue;
      gesehen.add(datei);
      const text = await readFile(datei, "utf8").catch(() => "");
      const muster = /(?:import|export)\s[^;]*?from\s*["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)|^\s*import\s*["']([^"']+)["']/gm;
      for (const t of text.matchAll(muster)) {
        const ziel = t[1] || t[2] || t[3];
        if (!ziel || !ziel.startsWith(".")) continue;
        offen.push(path.resolve(path.dirname(datei), ziel));
      }
    }
    const rel = [...gesehen].map((d) => path.relative(WURZEL, d).split(path.sep).join("/"));
    expect(rel.length, "Graph wurde tatsächlich durchlaufen").toBeGreaterThan(50);
    expect(rel).toContain("server/funktionen/hilfe.mjs");
    expect(rel.filter((d) => d.startsWith("server/lib/intelligence/gateway/")), "Gateway-Module im Servergraph").toEqual([]);
    expect(rel.filter((d) => /anbieter-live|attrappe/.test(d))).toEqual([]);
  });
});

describe("E — produktionsähnlicher Start", { timeout: 300_000 }, () => {
  let s;
  beforeAll(async () => { s = await starten({}); }, 120_000);
  afterAll(async () => { await stoppen(s); });

  const KOEPFE = {
    "content-security-policy": /default-src 'self'; script-src 'self';.*frame-ancestors 'self'; base-uri 'none';.*object-src 'none'/,
    "strict-transport-security": /^max-age=31536000; includeSubDomains$/,
    "x-content-type-options": /^nosniff$/,
    "x-frame-options": /^SAMEORIGIN$/,
    "referrer-policy": /^strict-origin-when-cross-origin$/,
    "permissions-policy": /camera=\(\), microphone=\(\)/,
  };
  it("Sicherheitsköpfe auf /gesund, Oberfläche, 404, API-Antwort; kein x-powered-by", async () => {
    for (const p of ["/gesund", "/", "/irgendwo/tief", "/fehlt.js", "/api/bestand"]) {
      const a = await fetch(s.basis + p);
      for (const [k, m] of Object.entries(KOEPFE)) expect(a.headers.get(k), `${p} ${k}`).toMatch(m);
      expect(a.headers.get("x-powered-by"), p).toBeNull();
      await a.arrayBuffer();
    }
  });
  it("/gesund nach außen genau {status: ok} — keine Fassung, kein Pfad, keine Umgebung", async () => {
    const a = await fetch(s.basis + "/gesund");
    expect(a.status).toBe(200);
    expect(await a.json()).toEqual({ status: "ok" });
  });
  it("Pfade ohne Endung liefern nur die Oberfläche; Quelltext, .env und Paketdateien gibt es nicht", async () => {
    for (const p of ["/ki", "/debug", "/__debug", "/intelligence", "/admin"]) {
      const a = await fetch(s.basis + p);
      expect(a.status, p).toBe(200);
      expect(await a.text(), p).toBe(INDEX);
    }
    for (const p of ["/.env", "/server.mjs", "/package.json", "/server/lib/schalter.mjs", "/../server.mjs", "/%2e%2e/server.mjs", "/metrics.json"]) {
      /* „/.env" hat für path.extname keine Endung → Rückfall auf index.html (die Oberfläche), nie die Datei. */
      const a = await fetch(s.basis + p);
      const text = await a.text();
      expect(a.status === 404 || (a.status === 200 && text === INDEX), `${p}: ${a.status}`).toBe(true);
      expect(text, p).not.toMatch(/PFEFFER|import |process\.env/);
    }
  });
  it("Startprotokoll: Port und Funktionen; keine Geheimnisse; Registrierung/Demo/Selbststart aus", async () => {
    const log = s.log();
    expect(log).toMatch(/CENTRIC läuft auf Port \d+/);
    expect(log).toMatch(/Funktionen: /);
    expect(log).not.toContain(PFEFFER);
    expect(log).not.toContain(ADMIN);
    const reg = await fetch(s.basis + "/api/registrierung", { method: "POST", headers: { origin: s.basis, "content-type": "application/json" }, body: "{}" });
    expect([403, 404]).toContain(reg.status);
    await reg.arrayBuffer();
  });
  it("ungültige CENTRIC_VERTRAUTE_PROXYS: Start verweigert (Exit ≠ 0), kein Port", async () => {
    const { daten } = await ablageAnlegen();
    const port = await freierPort();
    const env = { ...process.env, PORT: String(port), CENTRIC_DATEN: daten, CENTRIC_ABLAGE: "dateien", CENTRIC_STATIK: statik,
      NODE_ENV: "production", CENTRIC_VERTRAUTE_PROXYS: "kein-netz", CENTRIC_AUFRAEUMEN: "aus" };
    const kind = spawn(process.execPath, ["server.mjs"], { cwd: WURZEL, env, stdio: ["ignore", "pipe", "pipe"] });
    let log = ""; kind.stdout.on("data", (d) => { log += d; }); kind.stderr.on("data", (d) => { log += d; });
    const code = await new Promise((r) => kind.once("exit", (c) => r(c)));
    expect(code).not.toBe(0);
    expect(log).toMatch(/CENTRIC_VERTRAUTE_PROXYS/);
    expect(log).not.toMatch(/läuft auf Port/);
  });
});
