/* ==========================================================================
   SERVER — der Node-Prozess statt Netlify

   server.mjs wird so gestartet, wie er im Container läuft, nur mit einem
   kleinen Ordner statt dist/ und einem Wegwerfverzeichnis statt /data.
   Geprüft wird das, was zwischen Netz und Funktionen liegt: Ausliefern,
   Rückfall auf index.html, Routing zu den Funktionen, die 6-MB-Grenze,
   kaputte Anfragen, Köpfe — und dass SIGTERM sauber beendet.
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PORT = 30000 + Math.floor(Math.random() * 20000);
const B = `http://127.0.0.1:${PORT}`;
let kind, statik, daten, ausgabe = "";

/** Eine rohe HTTP/1.1-Anfrage über den Socket — für Formen, die fetch nicht baut. */
function roh(text) {
  return new Promise((erfuellt, verworfen) => {
    const s = connect(PORT, "127.0.0.1", () => s.write(text));
    let antwort = "";
    s.on("data", (d) => { antwort += d; });
    s.on("end", () => erfuellt(antwort));
    s.on("close", () => erfuellt(antwort));
    s.on("error", verworfen);
    setTimeout(() => s.destroy(), 3000);
  });
}

beforeAll(async () => {
  statik = await mkdtemp(path.join(tmpdir(), "centric-statik-"));
  daten = await mkdtemp(path.join(tmpdir(), "centric-daten-"));
  await mkdir(path.join(statik, "assets"));
  await writeFile(path.join(statik, "index.html"), "<!doctype html><title>CENTRIC Probe</title>");
  await writeFile(path.join(statik, "assets", "app-abc123.js"), "console.log('probe')");
  await writeFile(path.join(statik, "sw.js"), "// dienstarbeiter");
  await writeFile(path.join(statik, "manifest.webmanifest"), '{"name":"Probe"}');
  await writeFile(path.join(statik, "icon-192.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));

  kind = spawn(process.execPath, ["server.mjs"], {
    cwd: path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
    env: { ...process.env, PORT: String(PORT), CENTRIC_STATIK: statik, CENTRIC_DATEN: daten,
      CENTRIC_ABLAGE: "dateien", CENTRIC_ADMIN: "probe-geheim", NODE_ENV: "production" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  kind.stdout.on("data", (d) => { ausgabe += d; });
  kind.stderr.on("data", (d) => { ausgabe += d; });
  for (let i = 0; i < 100; i++) {
    if (await fetch(`${B}/gesund`).then((r) => r.ok).catch(() => false)) return;
    await new Promise((w) => setTimeout(w, 100));
  }
  throw new Error(`Server kam nicht hoch:\n${ausgabe}`);
}, 20000);

afterAll(async () => {
  if (kind && kind.exitCode === null) kind.kill("SIGKILL");
  await rm(statik, { recursive: true, force: true });
  await rm(daten, { recursive: true, force: true });
});

describe("Ausliefern", () => {
  it("meldet sich auf /gesund ohne Anmeldung", async () => {
    const r = await fetch(`${B}/gesund`);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ status: "ok" });
    expect(r.headers.get("cache-control")).toBe("no-store");
  });

  it("liefert die Startseite mit allen Sicherheitsköpfen", async () => {
    const r = await fetch(`${B}/`);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(r.headers.get("cache-control")).toBe("no-cache");
    expect(r.headers.get("content-security-policy")).toContain("script-src 'self'");
    expect(r.headers.get("content-security-policy")).toContain("object-src 'none'");
    expect(r.headers.get("strict-transport-security")).toBe("max-age=31536000; includeSubDomains");
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
    expect(r.headers.get("x-frame-options")).toBe("SAMEORIGIN");
    expect(r.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(r.headers.get("permissions-policy")).toContain("camera=()");
    expect(await r.text()).toContain("CENTRIC Probe");
  });

  it("fällt bei Adressen der Anwendung auf index.html zurück", async () => {
    for (const p of ["/verwaltung", "/plan/2026-09?ansicht=meine", "/api", "/tief/er/pfad"]) {
      const r = await fetch(`${B}${p}`);
      expect(r.status, p).toBe(200);
      expect(await r.text(), p).toContain("CENTRIC Probe");
    }
  });

  it("gibt bei fehlenden Dateien mit Endung 404 statt der Startseite", async () => {
    const r = await fetch(`${B}/assets/gibt-es-nicht.js`);
    expect(r.status).toBe(404);
    expect(r.headers.get("content-type")).toContain("application/json");
  });

  it("verlässt den Ordner der Oberfläche nie", async () => {
    for (const p of ["/../../etc/passwd", "/%2e%2e/%2e%2e/etc/passwd", "/assets/../../../../etc/passwd",
      "/assets/..%2f..%2fetc%2fpasswd", "/%00", "/assets/%2e%2e%2f%2e%2e%2fetc%2fhostname"]) {
      const text = await roh(`GET ${p} HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n`);
      expect(text, p).not.toMatch(/root:x:|localhost/);
      expect(text, p).toMatch(/^HTTP\/1\.1 (200|400|404) /);
    }
  });

  it("setzt Zwischenspeicher je nach Art der Datei", async () => {
    const cc = async (p) => (await fetch(`${B}${p}`)).headers.get("cache-control");
    expect(await cc("/assets/app-abc123.js")).toBe("public, max-age=31536000, immutable");
    expect(await cc("/icon-192.png")).toBe("public, max-age=31536000, immutable");
    expect(await cc("/manifest.webmanifest")).toBe("public, max-age=3600");
    expect(await cc("/sw.js")).toBe("no-cache");
    expect(await cc("/index.html")).toBe("no-cache");
    expect((await fetch(`${B}/manifest.webmanifest`)).headers.get("content-type"))
      .toBe("application/manifest+json; charset=utf-8");
  });

  it("antwortet auf HEAD ohne Rumpf und mit Länge", async () => {
    const r = await fetch(`${B}/assets/app-abc123.js`, { method: "HEAD" });
    expect(r.status).toBe(200);
    expect(r.headers.get("content-length")).toBe("20");
    expect(await r.text()).toBe("");
  });

  it("beantwortet If-None-Match mit 304, auch in einer Liste", async () => {
    const etag = (await fetch(`${B}/`)).headers.get("etag");
    expect(etag).toMatch(/^W\/"/);
    expect((await fetch(`${B}/`, { headers: { "if-none-match": etag } })).status).toBe(304);
    expect((await fetch(`${B}/`, { headers: { "if-none-match": `"anders", ${etag}` } })).status).toBe(304);
    expect((await fetch(`${B}/`, { headers: { "if-none-match": '"anders"' } })).status).toBe(200);
  });

  it("lässt auf Dateien nur GET und HEAD zu", async () => {
    const r = await fetch(`${B}/`, { method: "POST", body: "x" });
    expect(r.status).toBe(405);
    expect(r.headers.get("allow")).toBe("GET, HEAD");
  });
});

describe("Funktionen", () => {
  it("erreicht jede der sechs Funktionen unter ihrem Pfad", async () => {
    /* Jede antwortet fachlich — meist 401 oder 405, /zustellung/schluessel
       öffentlich mit 200 — aber eben sie, nicht der Rückfall auf index.html.
       Der Rumpf ist in jedem Fall JSON aus der Funktion. */
    const faelle = [
      ["GET", "/api/bestand", 401], ["POST", "/einrichten", 401], ["GET", "/einrichten/verwalter", 401],
      ["GET", "/starten", 405], ["GET", "/kalender/daten", 401], ["GET", "/zustellung/schluessel", 200],
      ["GET", "/lage", 401],
    ];
    for (const [m, p, status] of faelle) {
      const r = await fetch(`${B}${p}`, { method: m });
      expect(r.status, `${m} ${p}`).toBe(status);
      expect(r.headers.get("content-type"), `${m} ${p}`).toContain("application/json");
      expect(typeof await r.json(), `${m} ${p}`).toBe("object");
    }
  });

  it("reicht den Rumpf durch und meldet kaputtes JSON als 400", async () => {
    const r = await fetch(`${B}/api/anmelden`, { method: "POST",
      headers: { "content-type": "application/json" }, body: "{kaputt" });
    expect(r.status).toBe(400);
    expect((await r.json()).fehler).toMatch(/JSON/);
  });

  it("setzt die Sicherheitsköpfe auch auf Antworten der Funktionen", async () => {
    const r = await fetch(`${B}/api/bestand`);
    expect(r.headers.get("content-security-policy")).toContain("default-src 'self'");
    expect(r.headers.get("cache-control")).toBe("no-store");        // aus der Funktion, nicht überschrieben
  });

  it("weist mehr als sechs Megabyte mit 413 ab — mit und ohne Längenangabe", async () => {
    const gross = JSON.stringify({ zugangscode: "x".repeat(6 * 1024 * 1024 + 1) });
    const mitLaenge = await fetch(`${B}/api/anmelden`, { method: "POST",
      headers: { "content-type": "application/json" }, body: gross });
    expect(mitLaenge.status).toBe(413);

    const strom = new ReadableStream({
      start(c) { for (let i = 0; i < 7; i++) c.enqueue(new TextEncoder().encode("a".repeat(1024 * 1024))); c.close(); },
    });
    const ohneLaenge = await fetch(`${B}/api/anmelden`, { method: "POST",
      headers: { "content-type": "application/json" }, body: strom, duplex: "half" });
    expect(ohneLaenge.status).toBe(413);
    /* Und der Server lebt noch. */
    expect((await fetch(`${B}/gesund`)).status).toBe(200);
  });

  it("nimmt knapp unter der Grenze noch an", async () => {
    const knapp = JSON.stringify({ zugangscode: "x".repeat(6 * 1024 * 1024 - 100) });
    const r = await fetch(`${B}/api/anmelden`, { method: "POST",
      headers: { "content-type": "application/json" }, body: knapp });
    expect(r.status).not.toBe(413);
  });

  it("gibt bei unbrauchbarem Host 400 statt 500", async () => {
    const text = await roh(`GET /api/bestand HTTP/1.1\r\nHost: kein host hier\r\nConnection: close\r\n\r\n`);
    expect(text).toMatch(/^HTTP\/1\.1 400 /);
    expect(text).toContain("Ungültiger Host");
  });

  it("nimmt ein Ziel in absoluter Form und // am Anfang wie einen Pfad", async () => {
    const a = await roh(`GET http://fremd.example/api/bestand HTTP/1.1\r\nHost: eigen\r\nConnection: close\r\n\r\n`);
    expect(a).toMatch(/^HTTP\/1\.1 401 /);            // die Funktion hat geantwortet
    const b = await roh(`GET //fremd.example/api/bestand HTTP/1.1\r\nHost: eigen\r\nConnection: close\r\n\r\n`);
    expect(b).toMatch(/^HTTP\/1\.1 401 /);
  });

  it("überlebt eine abgebrochene Anfrage ohne Protokolleintrag", async () => {
    const vorher = ausgabe.length;
    await new Promise((erfuellt) => {
      const s = connect(PORT, "127.0.0.1", () => {
        s.write(`POST /api/anmelden HTTP/1.1\r\nHost: x\r\nContent-Type: application/json\r\nContent-Length: 100000\r\n\r\n{"a":`);
        setTimeout(() => { s.destroy(); erfuellt(); }, 100);
      });
    });
    await new Promise((w) => setTimeout(w, 200));
    expect((await fetch(`${B}/gesund`)).status).toBe(200);
    expect(ausgabe.slice(vorher)).not.toMatch(/Interner Fehler|Error/);
  });
});

describe("Beenden", () => {
  it("hört auf SIGTERM sauber auf", async () => {
    const ende = new Promise((erfuellt) => kind.on("exit", (code, signal) => erfuellt({ code, signal })));
    kind.kill("SIGTERM");
    const { code, signal } = await ende;
    expect(signal).toBeNull();
    expect(code).toBe(0);
    expect(ausgabe).toContain("SIGTERM: Server wird beendet");
  }, 15000);
});
