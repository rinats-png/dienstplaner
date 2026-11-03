/* ==========================================================================
   /gesund — STUFEN, FEHLERZÄHLUNG, ALARM (WP-05)

   Bis WP-05 kannte /gesund nur „ok“ oder „gestört“ (Raumsperre). Volle
   Platte, nicht beschreibbare Ablage, alte Sicherung, gehäufte Fehler
   blieben unsichtbar; einen Alarm gab es nicht.

   Geprüft:
     - Stufen ok/warnung/kritisch je Prüfung, Grenzwerte über die Umgebung
     - nach außen nur {"status": …}, 503 nur bei kritisch
     - Einzelheiten nur direkt von der eigenen Maschine
     - gleitende Fehlerzählung (5xx, unlesbare Räume)
     - Alarm: Entprellung, Verschärfung, Entwarnung, Erinnerung, ≤ 5 min,
       keine personenbezogenen Daten — mit Fake-Timern
     - Healthcheck aus dem Dockerfile: warnung bleibt healthy, kritisch nicht

   Rot vorher: server/lib/gesund.mjs und gesund-zaehler.mjs fehlten.
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let wurzel, G, Z;

const UMGEBUNG = ["CENTRIC_GESUND_PLATZ_WARNUNG_PROZENT", "CENTRIC_GESUND_PLATZ_KRITISCH_PROZENT",
  "CENTRIC_GESUND_PLATZ_KRITISCH_MB", "CENTRIC_SICHERUNG_STATUS", "CENTRIC_GESUND_5XX_WARNUNG", "CENTRIC_AUFRAEUMEN"];

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-gesund-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_GESUND_PLATZ_KRITISCH_MB = "0";
  G = await import("../server/lib/gesund.mjs");
  Z = await import("../server/lib/gesund-zaehler.mjs");
});
afterAll(async () => { await rm(wurzel, { recursive: true, force: true }); });
afterEach(() => {
  for (const n of UMGEBUNG) if (n !== "CENTRIC_GESUND_PLATZ_KRITISCH_MB") delete process.env[n];
  process.env.CENTRIC_GESUND_PLATZ_KRITISCH_MB = "0";
  Z.zaehlungLeeren();
  G.zustandVergessen();
});

describe("Stufen", () => {
  it("alles in Ordnung: ok, nach außen genau {status: ok}, 200", async () => {
    const e = await G.zustand({ frisch: true });
    expect(e.stufe, JSON.stringify(e)).toBe("ok");
    for (const n of ["sperre", "ablage", "platz", "sicherung", "loeschlauf", "fehler"]) expect(e.pruefungen[n].stufe, n).toBe("ok");
    expect(G.oeffentlich(e)).toEqual({ status: 200, inhalt: { status: "ok" } });
  });

  it("Platz: Warnschwelle → warnung; Kritisch-Schwelle → Alarmstufe kritisch, nach außen aber warnung/200 (N1)", async () => {
    process.env.CENTRIC_GESUND_PLATZ_WARNUNG_PROZENT = "101";
    let e = await G.zustand({ frisch: true });
    expect(e.pruefungen.platz.stufe).toBe("warnung");
    expect(G.oeffentlich(e)).toEqual({ status: 200, inhalt: { status: "warnung" } });
    process.env.CENTRIC_GESUND_PLATZ_KRITISCH_PROZENT = "101";
    e = await G.zustand({ frisch: true });
    expect(e.pruefungen.platz.stufe).toBe("kritisch");
    expect(e.stufe).toBe("kritisch");                       // für den Alarm
    expect(G.oeffentlich(e)).toEqual({ status: 200, inhalt: { status: "warnung" } });
  });

  it("Ablage nicht beschreibbar → kritisch, nach außen 503", async () => {
    const ort = path.join(wurzel, ".gesund");
    await rm(ort, { recursive: true, force: true });
    await writeFile(ort, "kein Verzeichnis");
    try {
      const e = await G.zustand({ frisch: true });
      expect(e.pruefungen.ablage.stufe).toBe("kritisch");
      expect(G.oeffentlich(e)).toEqual({ status: 503, inhalt: { status: "kritisch" } });
    } finally { await rm(ort, { force: true }); }
  });

  it("H1: 25 parallele Prüfungen — eine geteilte Probe, keine kritisch, keine Probedatei bleibt liegen", async () => {
    const alle = await Promise.all(Array.from({ length: 25 }, (_, i) => G.zustand({ frisch: i % 2 === 0 })));
    expect(alle.filter((e) => e.pruefungen.ablage.stufe !== "ok")).toEqual([]);
    expect(new Set(alle).size).toBe(1);
    for (let runde = 0; runde < 5; runde++) {
      G.zustandVergessen();
      const r = await Promise.all(Array.from({ length: 25 }, () => G.zustand({ frisch: true })));
      expect(r.filter((e) => e.stufe === "kritisch")).toEqual([]);
    }
    const { readdir } = await import("node:fs/promises");
    expect((await readdir(path.join(wurzel, ".gesund"))).filter((n) => n.startsWith("probe"))).toEqual([]);
  });

  it("M2: die Probe ist kein Store — ablage-sicherung von 6e6d582 (vor WP-05) sichert die Ablage weiter", async () => {
    const { execFileSync } = await import("node:child_process");
    let alt;
    try { alt = execFileSync("git", ["show", "6e6d582:werkzeug/ablage-sicherung.mjs"], { cwd: WURZEL, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }); }
    catch { return; }                                        // ohne Verlauf nicht prüfbar
    await G.zustand({ frisch: true });                       // legt .gesund an
    const werkzeug = await mkdtemp(path.join(tmpdir(), "centric-altsich-"));
    const ziel = await mkdtemp(path.join(tmpdir(), "centric-altsich-ziel-"));
    try {
      await writeFile(path.join(werkzeug, "ablage-sicherung.mjs"), alt);
      const lauf = (quelle, nach = ziel) => spawnSync(process.execPath, [path.join(werkzeug, "ablage-sicherung.mjs"), "sichern",
        "--quelle", quelle, "--ziel", nach], { encoding: "utf8", env: { ...process.env, CENTRIC_PFEFFER: "g" } });
      const r = lauf(wurzel);
      expect(r.status, r.stdout + r.stderr).toBe(0);
      /* Befund belegt: ein Store-Ordner centric-gesund (Stand 01b55ba) ließ die alte Fassung abbrechen. */
      const mitStore = await mkdtemp(path.join(tmpdir(), "centric-altsich-q-"));
      await mkdir(path.join(mitStore, "centric-gesund"));
      await writeFile(path.join(mitStore, "centric-gesund", "probe.json"), "{}");
      const r2 = lauf(mitStore, await mkdtemp(path.join(tmpdir(), "centric-altsich-ziel2-")));
      expect(r2.status).not.toBe(0);
      expect(r2.stderr + r2.stdout).toMatch(/nicht eingeordnet/);
      await rm(mitStore, { recursive: true, force: true });
    } finally {
      await rm(werkzeug, { recursive: true, force: true });
      await rm(ziel, { recursive: true, force: true });
    }
  });

  it("Sicherung: jung ok, alt warnung, unlesbar warnung, nicht eingerichtet ok", async () => {
    const datei = path.join(wurzel, "letzte-erfolgreiche.json");
    process.env.CENTRIC_SICHERUNG_STATUS = datei;
    await writeFile(datei, JSON.stringify({ zeit: new Date(Date.now() - 3600000).toISOString(), dateien: 5 }));
    expect((await G.zustand({ frisch: true })).pruefungen.sicherung.stufe).toBe("ok");
    await writeFile(datei, JSON.stringify({ zeit: new Date(Date.now() - 30 * 3600000).toISOString() }));
    const e = await G.zustand({ frisch: true });
    expect(e.pruefungen.sicherung).toMatchObject({ stufe: "warnung" });
    expect(e.stufe).toBe("warnung");
    await writeFile(datei, "{kaputt");
    expect((await G.zustand({ frisch: true })).pruefungen.sicherung.stufe).toBe("warnung");
    delete process.env.CENTRIC_SICHERUNG_STATUS;
    expect((await G.zustand({ frisch: true })).pruefungen.sicherung.stufe).toBe("ok");
  });

  it("Löschlauf: alter Vermerk oder Fehler im Vermerk → warnung; abgeschaltet → ok", async () => {
    const { getStore } = await import("../server/lib/ablage.mjs");
    const s = getStore({ name: "centric", consistency: "strong" });
    await s.setJSON("aufraeumen:letzter", { zeit: new Date(Date.now() - 50 * 3600000).toISOString(), fehler: [] });
    expect((await G.zustand({ frisch: true })).pruefungen.loeschlauf.stufe).toBe("warnung");
    await s.setJSON("aufraeumen:letzter", { zeit: new Date().toISOString(), fehler: [{ raum: "x", grund: "y" }] });
    const e = await G.zustand({ frisch: true });
    expect(e.pruefungen.loeschlauf.stufe).toBe("warnung");
    expect(JSON.stringify(e.pruefungen.loeschlauf)).not.toContain("\"x\"");   // kein Raumname im Detail
    process.env.CENTRIC_AUFRAEUMEN = "aus";
    expect((await G.zustand({ frisch: true })).pruefungen.loeschlauf.stufe).toBe("ok");
    await s.delete("aufraeumen:letzter");
  });

  it("R2: hängt die Prüfung, gilt nach der Zeitgrenze „Ablage kritisch“; danach ist das Promise frei", async () => {
    process.env.CENTRIC_GESUND_ZEITGRENZE_MS = "200";
    let loslassen;
    G.pruefHaken.vorher = () => new Promise((f) => { loslassen = f; });
    try {
      const a = Date.now();
      const e = await G.zustand({ frisch: true });
      expect(Date.now() - a).toBeLessThan(5000);
      expect(e.pruefungen.ablage).toMatchObject({ stufe: "kritisch", text: "Zeitgrenze" });
      expect(G.oeffentlich(e).status).toBe(503);
      /* Zweiter Aufruf, die hängende Prüfung läuft noch: wieder nach der Grenze, kein Aufstauen. */
      const b = Date.now();
      const e2 = await G.zustand({ frisch: true });
      expect(Date.now() - b).toBeLessThan(5000);
      expect(e2.pruefungen.ablage.text).toBe("Zeitgrenze");
    } finally {
      G.pruefHaken.vorher = null;
      loslassen();
      delete process.env.CENTRIC_GESUND_ZEITGRENZE_MS;
    }
    await new Promise((w) => setTimeout(w, 50));
    G.zustandVergessen();
    expect((await G.zustand({ frisch: true })).stufe).toBe("ok");
  });

  it("R3: liegengebliebene Proben älter als 1 h werden entfernt, junge bleiben", async () => {
    const { utimes, readdir } = await import("node:fs/promises");
    const ordner = path.join(wurzel, ".gesund");
    await mkdir(ordner, { recursive: true });
    const alt = path.join(ordner, "probe-aaaaaaaaaaaaaaaaaaaaaaaa.json");
    const jung = path.join(ordner, "probe-bbbbbbbbbbbbbbbbbbbbbbbb.json");
    const fremd = path.join(ordner, "notiz.txt");
    for (const d of [alt, jung, fremd]) await writeFile(d, "{}");
    const zweiStunden = (Date.now() - 2 * 3600000) / 1000;
    await utimes(alt, zweiStunden, zweiStunden);
    await utimes(fremd, zweiStunden, zweiStunden);
    await G.zustand({ frisch: true });
    const rest = await readdir(ordner);
    expect(rest).not.toContain("probe-aaaaaaaaaaaaaaaaaaaaaaaa.json");
    expect(rest).toContain("probe-bbbbbbbbbbbbbbbbbbbbbbbb.json");
    expect(rest).toContain("notiz.txt");
    await rm(jung, { force: true });
    await rm(fremd, { force: true });
  });

  it("zwischengespeichert: innerhalb der Cachezeit keine neue Probe", async () => {
    const a = await G.zustand({ frisch: true });
    const b = await G.zustand();
    expect(b).toBe(a);
  });
});

describe("Fehlerzählung (gleitend)", () => {
  it("5xx ab der Schwelle → warnung; nach dem Fenster wieder ok", async () => {
    const t0 = Date.now();
    for (let i = 0; i < 9; i++) Z.ereignis("5xx", t0);
    expect((await G.zustand({ frisch: true, jetzt: t0 })).pruefungen.fehler.stufe).toBe("ok");
    Z.ereignis("5xx", t0);
    const e = await G.zustand({ frisch: true, jetzt: t0 + 1000 });
    expect(e.pruefungen.fehler).toMatchObject({ stufe: "warnung", "5xx": 10 });
    expect(Z.zaehlung(t0 + Z.FENSTER_MS + 1)["5xx"]).toBe(0);
  });

  it("ein unlesbarer Raum zählt — über den Haken in bestand.mjs", async () => {
    const { getStore } = await import("../server/lib/ablage.mjs");
    const B = await import("../server/lib/bestand.mjs");
    const s = getStore({ name: "centric", consistency: "strong" });
    await s.setJSON("journal:kaputtraum", { schritte: [] });
    await writeFile(path.join(wurzel, "centric", "journal%3Akaputtraum.json"), "{kein json");
    await expect(B.bestandLesenStreng(s, "kaputtraum")).rejects.toThrow();
    expect(Z.zaehlung().unlesbar).toBeGreaterThanOrEqual(1);
    expect((await G.zustand({ frisch: true })).pruefungen.fehler.stufe).toBe("warnung");
    await s.delete("journal:kaputtraum").catch(() => {});
  });

  it("unbekannte Arten werden ignoriert, keine Zusatzdaten", () => {
    Z.ereignis("raum-nordwacht");
    expect(Object.keys(Z.zaehlung()).sort()).toEqual(["429-last", "5xx", "bremse-ausfall", "journal", "unlesbar"]);
  });

  it("429-last (Lastgrenze lehnte ehrliche Anfragen ab) ab der Schwelle → warnung; vorher ok; nach dem Fenster wieder ok (WP-47)", async () => {
    Z.zaehlungLeeren();
    const t0 = Date.now();
    for (let i = 0; i < 19; i++) Z.ereignis("429-last", t0);
    expect((await G.zustand({ frisch: true, jetzt: t0 })).pruefungen.fehler.stufe).toBe("ok");
    Z.ereignis("429-last", t0);
    const e = await G.zustand({ frisch: true, jetzt: t0 + 1000 });
    expect(e.pruefungen.fehler).toMatchObject({ stufe: "warnung", "429-last": 20 });
    expect(Z.zaehlung(t0 + Z.FENSTER_MS + 1)["429-last"]).toBe(0);
  });
});

describe("Einzelheiten nur lokal", () => {
  it("nur Gegenstelle 127.0.0.1/::1 ohne Weiterleitungskopf", () => {
    expect(G.detailErlaubt("127.0.0.1", {})).toBe(true);
    expect(G.detailErlaubt("::1", {})).toBe(true);
    expect(G.detailErlaubt("::ffff:127.0.0.1", {})).toBe(true);
    expect(G.detailErlaubt("127.0.0.1", { "x-forwarded-for": "203.0.113.5" })).toBe(false);
    expect(G.detailErlaubt("127.0.0.1", { forwarded: "for=1.2.3.4" })).toBe(false);
    expect(G.detailErlaubt("172.18.0.2", {})).toBe(false);
    expect(G.detailErlaubt(undefined, {})).toBe(false);
  });
});

describe("Alarm", () => {
  afterEach(() => { vi.useRealTimers(); });

  const ergebnis = (stufe, betroffen = []) => ({ stufe,
    pruefungen: Object.fromEntries(["sperre", "ablage", "platz", "sicherung", "loeschlauf", "fehler"]
      .map((n) => [n, { stufe: betroffen.includes(n) ? stufe : "ok" }])) });

  it("Entprellung, Verschärfung, Entwarnung, Erinnerung — mit Fake-Timern", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.UTC(2026, 10, 3, 8, 0, 0));
    const gesendet = [];
    const g = G.alarmGeber({ entprellungMs: 120000, wiederholungMs: 6 * 3600000, senden: async (n) => { gesendet.push(n); } });
    const schritt = async (e, ms = 60000) => { vi.advanceTimersByTime(ms); return g.beobachten(e, Date.now()); };

    expect(await g.beobachten(ergebnis("ok"), Date.now())).toBeNull();
    /* Ein einzelner Ausreißer, danach stabil ok: kein Alarm, die Störung endet. */
    expect(await schritt(ergebnis("warnung", ["platz"]))).toBeNull();
    expect(await schritt(ergebnis("ok"))).toBeNull();
    expect(await schritt(ergebnis("ok"))).toBeNull();
    expect(await schritt(ergebnis("ok"))).toBeNull();
    expect(gesendet).toEqual([]);
    /* Anhaltend: Alarm nach ≥ 120 s. */
    expect(await schritt(ergebnis("warnung", ["platz"]))).toBeNull();
    expect(await schritt(ergebnis("warnung", ["platz"]))).toBeNull();
    expect(await schritt(ergebnis("warnung", ["platz"]))).toBe("alarm");
    expect(gesendet.at(-1)).toMatchObject({ dienst: "CENTRIC", art: "alarm", stufe: "warnung", betroffen: ["platz"] });
    /* Gleichbleibend: nichts Neues. */
    expect(await schritt(ergebnis("warnung", ["platz"]))).toBeNull();
    /* Verschärfung während der laufenden Störung: sofort erneut (die Störung
       ist längst entprellt), mit allen bisher betroffenen Prüfungen. */
    expect(await schritt(ergebnis("kritisch", ["ablage"]))).toBe("alarm");
    expect(gesendet.at(-1)).toMatchObject({ stufe: "kritisch", betroffen: ["ablage", "platz"] });
    /* Zurück auf warnung: keine neue Meldung (schlimmste bleibt kritisch). */
    expect(await schritt(ergebnis("warnung", ["platz"]))).toBeNull();
    /* Erinnerung nach 6 h. */
    expect(await schritt(ergebnis("kritisch", ["ablage"]), 6 * 3600000)).toBe("erinnerung");
    /* Entwarnung nach stabiler Rückkehr. */
    expect(await schritt(ergebnis("ok"))).toBeNull();
    expect(await schritt(ergebnis("ok"))).toBeNull();
    expect(await schritt(ergebnis("ok"))).toBe("entwarnung");
    expect(gesendet.map((n) => n.art)).toEqual(["alarm", "alarm", "erinnerung", "entwarnung"]);
    /* Keine personenbezogenen Daten: nur diese Schlüssel, nur Prüfungsnamen. */
    for (const n of gesendet) {
      expect(Object.keys(n).sort()).toEqual(["art", "betroffen", "dienst", "stufe", "zeit"]);
      for (const b of n.betroffen) expect(["sperre", "ablage", "platz", "sicherung", "loeschlauf", "fehler"]).toContain(b);
    }
  });

  it("M1: Pendeln warnung ↔ kritisch gibt einen Alarm (schlimmste Stufe), nicht keinen", async () => {
    const gesendet = [];
    const g = G.alarmGeber({ entprellungMs: 120000, wiederholungMs: 6 * 3600000, senden: async (n) => { gesendet.push(n); } });
    let t = 1_000_000;
    await g.beobachten(ergebnis("ok"), t);
    for (let i = 0; i < 60; i++) {
      t += 60000;
      await g.beobachten(i % 2 ? ergebnis("kritisch", ["ablage"]) : ergebnis("warnung", ["platz"]), t);
    }
    expect(gesendet.length).toBeGreaterThanOrEqual(1);
    expect(gesendet[0]).toMatchObject({ art: "alarm", stufe: "kritisch" });
    expect(gesendet[0].zeit <= new Date(1_000_000 + 5 * 60000).toISOString()).toBe(true);
  });

  it("R1: Pendeln ok ↔ kritisch jede Minute alarmiert (Hysterese), binnen 5 min", async () => {
    const gesendet = [];
    const g = G.alarmGeber({ entprellungMs: 120000, wiederholungMs: 6 * 3600000, senden: async (n) => { gesendet.push(n); } });
    const t0 = 1_000_000;
    let t = t0;
    await g.beobachten(ergebnis("ok"), t);
    for (let i = 0; i < 60; i++) {
      t += 60000;
      await g.beobachten(i % 2 === 0 ? ergebnis("kritisch", ["ablage"]) : ergebnis("ok"), t);
    }
    expect(gesendet.length).toBeGreaterThanOrEqual(1);
    expect(gesendet[0]).toMatchObject({ art: "alarm", stufe: "kritisch" });
    expect(Date.parse(gesendet[0].zeit) - (t0 + 60000)).toBeLessThanOrEqual(5 * 60000);
    expect(gesendet.filter((n) => n.art === "entwarnung")).toEqual([]);   // pendelnd: keine Entwarnung
  });

  it("≤ 5 min: mit Vorgabe-Takt (60 s) und -Entprellung (120 s), Eintritt zu ungünstigster Zeit", async () => {
    const a = G.alarmEinstellungen();
    expect(a.taktMs).toBe(60000);
    expect(a.entprellungMs).toBe(120000);
    expect(a.webhook).toBe("");                     // Vorgabe: kein Kanal
    for (const versatz of [1, 30000, 59999]) {
      const gesendet = [];
      const g = G.alarmGeber({ entprellungMs: a.entprellungMs, wiederholungMs: a.wiederholungMs,
        senden: async (n) => { gesendet.push(n); } });
      const t0 = 1_000_000;
      await g.beobachten(ergebnis("ok"), t0);
      const eintritt = t0 + versatz;                // zwischen zwei Prüfungen
      let t = t0;
      while (!gesendet.length && t < t0 + 3600000) {
        t += a.taktMs;
        await g.beobachten(t >= eintritt ? ergebnis("kritisch", ["ablage"]) : ergebnis("ok"), t);
      }
      expect(t - eintritt, `Versatz ${versatz}`).toBeLessThanOrEqual(5 * 60000);
    }
  });

  it("Webhook-Sender: POST JSON an die URL, Fehler werfen nicht", async () => {
    const { createServer } = await import("node:http");
    const empfangen = [];
    const srv = createServer((q, a) => { let t = ""; q.on("data", (d) => { t += d; }); q.on("end", () => { empfangen.push({ m: q.method, t }); a.end("ok"); }); });
    await new Promise((f) => srv.listen(0, "127.0.0.1", f));
    try {
      await G.webhookSender(`http://127.0.0.1:${srv.address().port}/haken`)({ dienst: "CENTRIC", art: "alarm" });
      expect(empfangen).toHaveLength(1);
      expect(empfangen[0].m).toBe("POST");
      expect(JSON.parse(empfangen[0].t)).toEqual({ dienst: "CENTRIC", art: "alarm" });
      await G.webhookSender("http://127.0.0.1:1/nix")({ a: 1 });   // wirft nicht
    } finally { await new Promise((f) => srv.close(f)); }
  });

  it("N2: der Webhook folgt keiner Umleitung", async () => {
    const { createServer } = await import("node:http");
    let umgeleitetErreicht = 0;
    const ziel = createServer((_q, a) => { umgeleitetErreicht++; a.end("ok"); });
    await new Promise((f) => ziel.listen(0, "127.0.0.1", f));
    const umleiter = createServer((_q, a) => { a.writeHead(307, { location: `http://127.0.0.1:${ziel.address().port}/x` }); a.end(); });
    await new Promise((f) => umleiter.listen(0, "127.0.0.1", f));
    try {
      await G.webhookSender(`http://127.0.0.1:${umleiter.address().port}/haken`)({ dienst: "CENTRIC" });
      expect(umgeleitetErreicht).toBe(0);
    } finally {
      await new Promise((f) => ziel.close(f));
      await new Promise((f) => umleiter.close(f));
    }
  });
});

/* ---------- über den echten Server ---------- */

describe("server.mjs: /gesund und Healthcheck", () => {
  let statik, daten;
  const kinder = [];
  afterAll(async () => {
    for (const k of kinder) k.kill();
    for (const d of [statik, daten]) if (d) await rm(d, { recursive: true, force: true });
  });

  async function starten(env, { probeKaputt = false } = {}) {
    const port = 30000 + Math.floor(Math.random() * 20000);
    const datenOrt = await mkdtemp(path.join(tmpdir(), "centric-gesund-d-"));
    if (probeKaputt) await writeFile(path.join(datenOrt, ".gesund"), "kein Verzeichnis");
    const k = spawn(process.execPath, ["server.mjs"], { cwd: WURZEL, stdio: "ignore",
      env: { ...process.env, PORT: String(port), CENTRIC_STATIK: statik, CENTRIC_DATEN: datenOrt,
        CENTRIC_ABLAGE: "dateien", CENTRIC_PFEFFER: "g", NODE_ENV: "production", CENTRIC_AUFRAEUMEN: "aus",
        CENTRIC_GESUND_PLATZ_KRITISCH_MB: "0", ...env } });
    kinder.push(k);
    for (let i = 0; i < 100; i++) {
      const ok = await fetch(`http://127.0.0.1:${port}/gesund`).then(() => true).catch(() => false);
      if (ok) return port;
      await new Promise((w) => setTimeout(w, 100));
    }
    throw new Error("Server startet nicht");
  }
  const healthcheck = async (port) => {
    const docker = await readFile(path.join(WURZEL, "Dockerfile"), "utf8");
    const befehl = docker.match(/CMD node -e "(.*)"\s*$/m)[1];
    /* Unter Windows bricht node bei process.exit() mit offenem fetch-Handle ab
       (libuv-Assertion) — der Exit-Code ist dort nicht aussagekräftig. */
    if (process.platform === "win32") return "windows";
    return spawnSync(process.execPath, ["-e", befehl], { env: { ...process.env, PORT: String(port) } }).status;
  };

  beforeAll(async () => {
    statik = await mkdtemp(path.join(tmpdir(), "centric-gesund-s-"));
    await mkdir(path.join(statik, "assets"));
    await writeFile(path.join(statik, "index.html"), "<!doctype html>");
  });

  it("ok: {status: ok}, no-store; Einzelheiten nur lokal ohne XFF", async () => {
    const port = await starten({});
    const r = await fetch(`http://127.0.0.1:${port}/gesund`);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ status: "ok" });
    expect(r.headers.get("cache-control")).toBe("no-store");
    const d = await (await fetch(`http://127.0.0.1:${port}/gesund?detail=1`)).json();
    expect(d.stufe).toBe("ok");
    expect(Object.keys(d.pruefungen)).toContain("platz");
    const ueberProxy = await (await fetch(`http://127.0.0.1:${port}/gesund?detail=1`,
      { headers: { "x-forwarded-for": "203.0.113.9" } })).json();
    expect(ueberProxy).toEqual({ status: "ok" });
    expect([0, "windows"]).toContain(await healthcheck(port));
  }, 30000);

  it("warnung und Platz kritisch: 200, Healthcheck grün; Ablage kritisch: 503, Healthcheck rot — ohne Einzelheiten", async () => {
    const pw = await starten({ CENTRIC_GESUND_PLATZ_WARNUNG_PROZENT: "101" });
    const w = await fetch(`http://127.0.0.1:${pw}/gesund`);
    expect(w.status).toBe(200);
    expect(await w.json()).toEqual({ status: "warnung" });
    expect([0, "windows"]).toContain(await healthcheck(pw));
    const pp = await starten({ CENTRIC_GESUND_PLATZ_KRITISCH_PROZENT: "101" });
    const pl = await fetch(`http://127.0.0.1:${pp}/gesund`);
    expect(pl.status).toBe(200);
    expect(await pl.json()).toEqual({ status: "warnung" });
    expect([0, "windows"]).toContain(await healthcheck(pp));
    const pk = await starten({}, { probeKaputt: true });
    const k = await fetch(`http://127.0.0.1:${pk}/gesund`);
    expect(k.status).toBe(503);
    expect(await k.json()).toEqual({ status: "kritisch" });
    expect([1, "windows"]).toContain(await healthcheck(pk));
  }, 30000);

  it("deploy-smoke.mjs bleibt grün bei Stufe warnung", async () => {
    const pw = await starten({ CENTRIC_GESUND_PLATZ_WARNUNG_PROZENT: "101" });
    const r = spawnSync(process.execPath, ["--input-type=module", "-"], {
      input: await readFile(path.join(WURZEL, "deploy", "deploy-smoke.mjs")), encoding: "utf8",
      env: { ...process.env, CENTRIC_SMOKE_BASIS: `http://127.0.0.1:${pw}` } });
    expect(r.stdout).toContain("ok      GET /gesund: 200");
  }, 30000);
});
