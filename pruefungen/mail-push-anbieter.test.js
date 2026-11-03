/* ==========================================================================
   WP-30 — ANBIETERANTWORTEN UND PUSH-ENDPUNKTE (gegen Attrappen)

   Hier läuft der ECHTE Code von lib/post.mjs und lib/webpush.mjs; nur der
   Netzzugriff ist ersetzt (fetch, web-push). Nichts geht hinaus, kein Schlüssel
   und kein Host stehen im Code.

   - HTTP-Status des Mailanbieters → Klasse (dauerhaft / Konfiguration /
     vorübergehend), Idempotenzschlüssel, Trockenlauf.
   - Antwort des Push-Dienstes → Klasse (erloschen / dauerhaft / Konfiguration /
     vorübergehend); im Ergebnis steht nur der Statuscode, nie der Endpunkt.
   - Der Endpunkt kommt vom Gerät: Nur https-Adressen der Push-Dienste
     (SSRF-Schutz), nie interne Ziele.
   - Zusammen mit versand.mjs: 422 sperrt die Adresse, 503 stellt zurück.
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const wp = vi.hoisted(() => ({ gesendet: [], antwort: null }));
vi.mock("web-push", () => ({
  default: {
    setVapidDetails: () => {},
    sendNotification: async (anmeldung, nutzlast, opt) => {
      wp.gesendet.push({ anmeldung, nutzlast, opt });
      if (wp.antwort) throw wp.antwort;
      return { statusCode: 201 };
    },
  },
}));

let wurzel, P, W, V, store;
const UMGEBUNG = { ...process.env };
const echtesFetch = globalThis.fetch;
const JETZT = Date.parse("2026-12-10T10:00:00.000Z");

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-anbieter-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  P = await import("../server/lib/post.mjs");
  W = await import("../server/lib/webpush.mjs");
  V = await import("../server/lib/versand.mjs");
  const { getStore } = await import("../server/lib/ablage.mjs");
  store = getStore({ name: "centric", consistency: "strong" });
});
afterAll(async () => {
  globalThis.fetch = echtesFetch;
  await rm(wurzel, { recursive: true, force: true });
  for (const k of Object.keys(process.env)) if (!(k in UMGEBUNG)) delete process.env[k];
  Object.assign(process.env, UMGEBUNG);
});
beforeEach(() => {
  globalThis.fetch = echtesFetch;
  wp.gesendet.length = 0; wp.antwort = null;
  for (const k of ["RESEND_API_KEY", "CENTRIC_ABSENDER", "VAPID_PUBLIC", "VAPID_PRIVATE", "CENTRIC_PUSH_HOSTS", "NODE_ENV"]) delete process.env[k];
});

const mailEinrichten = () => { process.env.RESEND_API_KEY = "schluessel-nur-zum-pruefen"; process.env.CENTRIC_ABSENDER = "CENTRIC <post@absender.example>"; };
const pushEinrichten = () => { process.env.VAPID_PUBLIC = "oeffentlich-nur-zum-pruefen"; process.env.VAPID_PRIVATE = "privat-nur-zum-pruefen"; };
const fetchMit = (status, rumpf = {}) => {
  const gesehen = [];
  globalThis.fetch = async (url, o) => { gesehen.push({ url, o }); return { ok: status >= 200 && status < 300, status, json: async () => rumpf, text: async () => JSON.stringify(rumpf) }; };
  return gesehen;
};

describe("Mail: Antwort des Anbieters → Klasse", () => {
  it.each([[400, "dauerhaft"], [422, "dauerhaft"], [401, "konfiguration"], [403, "konfiguration"],
    [408, "temporaer"], [409, "temporaer"], [429, "temporaer"], [500, "temporaer"], [502, "temporaer"], [503, "temporaer"]])(
    "HTTP %i ist %s", async (status, klasse) => {
      mailEinrichten(); fetchMit(status, { name: "x" });
      const r = await P.sendeMail("a@kunde.example", "B", "T");
      expect(r).toMatchObject({ ok: false, klasse, status });
    });

  it("Netzfehler und kaputte Antwort: vorübergehend", async () => {
    mailEinrichten();
    globalThis.fetch = async () => { throw new Error("ECONNRESET"); };
    expect(await P.sendeMail("a@kunde.example", "B", "T")).toMatchObject({ ok: false, klasse: "temporaer" });
    globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => { throw new Error("kein JSON"); } });
    expect(await P.sendeMail("a@kunde.example", "B", "T")).toMatchObject({ ok: false, klasse: "temporaer" });
  });

  it("Erfolg: Idempotency-Key geht als Kopfzeile hinaus, nur eine Anfrage, Schlüssel nur im Authorization-Kopf", async () => {
    mailEinrichten();
    const g = fetchMit(200, { id: "m-1" });
    const r = await P.sendeMail("a@kunde.example", "Betreff", "Text", { idempotenz: "abc-mail-1" });
    expect(r).toEqual({ ok: true, id: "m-1" });
    expect(g).toHaveLength(1);
    expect(g[0].o.headers["idempotency-key"]).toBe("abc-mail-1");
    expect(JSON.stringify(g[0].o.body)).not.toContain("schluessel-nur-zum-pruefen");
  });

  it("Trockenlauf ohne Schlüssel: nichts geht hinaus", async () => {
    let n = 0; globalThis.fetch = () => { n++; throw new Error("nie"); };
    expect(await P.sendeMail("a@kunde.example", "B", "T", { idempotenz: "x" })).toMatchObject({ ok: true, trocken: true });
    expect(n).toBe(0);
  });

  it("mailKlasse: unbekannter Status ist vorübergehend, nie dauerhaft (sicher gegen Verlust)", () => {
    for (const s of [0, 200, 404, 418, 451, 504, 599]) expect(P.mailKlasse(s)).toBe("temporaer");
  });
});

describe("Push: Antwort des Dienstes → Klasse", () => {
  const anm = (host = "fcm.googleapis.com") => ({ endpoint: `https://${host}/send/GEHEIMER-ENDPUNKT`, keys: { p256dh: "k", auth: "a" } });

  it.each([[404, "erloschen"], [410, "erloschen"], [400, "dauerhaft"], [413, "dauerhaft"], [401, "konfiguration"],
    [403, "konfiguration"], [429, "temporaer"], [500, "temporaer"], [503, "temporaer"]])("HTTP %i ist %s", async (status, klasse) => {
    pushEinrichten(); wp.antwort = Object.assign(new Error("Push-Dienst: https://fcm.googleapis.com/send/GEHEIMER-ENDPUNKT"), { statusCode: status });
    const r = await W.sendePush(anm(), "T", "X", null);
    expect(r).toMatchObject({ ok: false, klasse, status, erloschen: klasse === "erloschen" });
    expect(JSON.stringify(r)).not.toContain("GEHEIMER-ENDPUNKT");              // nur der Statuscode
  });

  it("Netzfehler ohne Statuscode: vorübergehend", async () => {
    pushEinrichten(); wp.antwort = new Error("getaddrinfo ENOTFOUND");
    expect(await W.sendePush(anm(), "T", "X", null)).toMatchObject({ ok: false, klasse: "temporaer", erloschen: false });
  });

  it("Erfolg: minimale Nutzlast {titel,text,ziel}, topic und TTL als Optionen", async () => {
    pushEinrichten();
    expect(await W.sendePush(anm(), "Titel", "Text", "tausch", { topic: "abc123" })).toEqual({ ok: true });
    expect(JSON.parse(wp.gesendet[0].nutzlast)).toEqual({ titel: "Titel", text: "Text", ziel: "tausch" });
    expect(wp.gesendet[0].opt).toMatchObject({ topic: "abc123", TTL: 86400 });
  });

  it("ohne VAPID-Paar: Trockenlauf, nichts geht hinaus", async () => {
    expect(await W.sendePush(anm(), "T", "X", null)).toMatchObject({ ok: true, trocken: true });
    expect(wp.gesendet).toHaveLength(0);
  });

  it("ein nicht erlaubter Endpunkt wird nie angefragt (auch nicht, wenn er schon im Register steht)", async () => {
    pushEinrichten();
    for (const e of ["https://127.0.0.1/x", "https://169.254.169.254/latest", "https://intern.lokal/x", "http://fcm.googleapis.com/x"]) {
      const r = await W.sendePush({ endpoint: e, keys: {} }, "T", "X", null);
      expect(r).toMatchObject({ ok: false, erloschen: true });
    }
    expect(wp.gesendet).toHaveLength(0);
  });
});

describe("Push-Endpunkt vom Gerät: nur Dienste der Browserhersteller (SSRF)", () => {
  const ok = (u) => W.pushEndpunktErlaubt(u);
  it("erlaubt: Chrome/Edge/Firefox/Safari/Windows", () => {
    for (const u of ["https://fcm.googleapis.com/fcm/send/abc", "https://updates.push.services.mozilla.com/wpush/v2/abc",
      "https://web.push.apple.com/abc", "https://eu.push.apple.com/abc", "https://db5p.notify.windows.com/?token=abc"])
      expect(ok(u), u).toBe(true);
  });
  it("abgelehnt: http, interne und Metadaten-Ziele, fremde Hosts, Tricks mit Host und Zugangsdaten, Port", () => {
    for (const u of ["http://fcm.googleapis.com/x", "https://127.0.0.1/x", "https://localhost/x", "https://[::1]/x",
      "https://169.254.169.254/latest/meta-data", "https://10.0.0.5/x", "https://evil.com/x",
      "https://fcm.googleapis.com.evil.com/x", "https://evilfcm.googleapis.com.evil.net/x", "https://push.services.mozilla.com.evil.com/",
      "https://user:pw@fcm.googleapis.com/x", "https://fcm.googleapis.com:8443/x", "file:///etc/passwd", "javascript:alert(1)",
      "", "x", null, undefined, 42, {}, "https://" + "a".repeat(2000) + ".apple.com/"])
      expect(ok(u), String(u)).toBe(false);
  });
  it("„.example“ gilt nur außerhalb der Auslieferung; in der Auslieferung nie", () => {
    expect(ok("https://push.example/abc")).toBe(true);
    process.env.NODE_ENV = "production";
    expect(ok("https://push.example/abc")).toBe(false);
    expect(ok("https://fcm.googleapis.com/abc")).toBe(true);
  });
  it("weitere Dienste nur über CENTRIC_PUSH_HOSTS, ausdrücklich", () => {
    expect(ok("https://push.meinebehoerde.test/x")).toBe(false);
    process.env.CENTRIC_PUSH_HOSTS = "push.meinebehoerde.test, *.push2.test";
    expect(ok("https://push.meinebehoerde.test/x")).toBe(true);
    expect(ok("https://a.push2.test/x")).toBe(true);
    expect(ok("https://push2.test/x")).toBe(false);
    expect(ok("https://evilpush2.test/x")).toBe(false);
  });
});

describe("Zusammen mit der Zustellkette (echter Code, Attrappe nur beim Netz)", () => {
  const person = (id, rolle, extra = {}) => ({ id, vorname: "V", nachname: "N", rolle, email: `${id}@kunde.example`, ...extra });
  const n = (id, an, extra = {}) => ({ id, personId: an, art: "planFreigegeben", titel: "T", text: "X", ziel: "meine", zeit: "x",
    erstellt: new Date(JETZT).toISOString(), gelesen: false, dringend: false, ...extra });
  const m = (nachrichten) => ({ id: "m-e", name: "Betrieb", personen: [person("l1", "leitung")], nachrichten });
  const stelleZu = (mm, ids) => V.zustellen(store, { raum: "e2e", bestand: { mandanten: [mm] }, m: mm, ids, jetzt: JETZT });
  const status = (mm, nid, kanal) => store.get(V.statusSchluessel("e2e", mm.id, nid, kanal), { type: "json" });

  it("422 vom Anbieter: endgültig, Adresse gesperrt, kein zweiter Aufruf; 503: zurückgestellt", async () => {
    mailEinrichten();
    process.env.CENTRIC_ZUSTELL_BACKOFF = "60,120";
    const mm = m([n("e1", "l1"), n("e2", "l1", { art: "planGeaendert" })]);
    let g = fetchMit(422, { name: "validation_error", message: "Invalid `to` field l1@kunde.example" });
    await stelleZu(mm, ["e1"]);
    expect(g).toHaveLength(1);
    expect(await status(mm, "e1", "mail")).toMatchObject({ status: "gescheitert", grund: "dauerhaft", code: "http-422" });
    expect(JSON.stringify(await status(mm, "e1", "mail"))).not.toContain("kunde.example");
    await stelleZu(mm, ["e1", "e2"]);
    expect(g).toHaveLength(1);
    expect(await status(mm, "e2", "mail")).toMatchObject({ grund: "unzustellbar" });
    await store.delete(V.sperrSchluessel("e2e", mm.id, "l1"));
    g = fetchMit(503);
    await stelleZu(mm, ["e2"].map((x) => x));
    expect(await status(mm, "e2", "mail")).toMatchObject({ status: "uebersprungen" });   // Status endgültig: bleibt
    const mm2 = m([n("e3", "l1")]);
    await stelleZu(mm2, ["e3"]);
    expect(await status(mm2, "e3", "mail")).toMatchObject({ status: "fehler", code: "http-503", klasse: "temporaer" });
    expect(Date.parse((await status(mm2, "e3", "mail")).naechster)).toBe(JETZT + 60_000);
  });

  it("Push 410 über den echten Pfad: Anmeldung gelöscht; Idempotenz für Mail ist an die Mitteilung gebunden, nicht an den Versuch", async () => {
    pushEinrichten();
    const mm = { ...m([n("e4", "l1", { art: "offeneSchicht" })]) };
    await store.setJSON(V.pushSchluessel("e2e", mm.id, "l1"), { endpoint: "https://fcm.googleapis.com/send/abc", keys: {} });
    wp.antwort = Object.assign(new Error("gone"), { statusCode: 410 });
    await stelleZu(mm, ["e4"]);
    expect(await store.getMetadata(V.pushSchluessel("e2e", mm.id, "l1"))).toBeNull();
    expect(await status(mm, "e4", "push")).toMatchObject({ status: "uebersprungen", grund: "erloschen" });
    expect(wp.gesendet[0].opt.topic).toMatch(/^[0-9a-f]{24}$/);
  });
});

describe("Dienstarbeiter: Push-Handler getrennt, ohne Zwischenspeicher, nur eigene Pfade (WP-37-Vertrag bleibt)", () => {
  /** Führt public/sw.js mit Attrappen aus; liefert die registrierten Ereignisfunktionen. */
  async function sw() {
    const { readFile } = await import("node:fs/promises");
    const quelle = await readFile(path.join(process.cwd(), "public/sw.js"), "utf8");
    const handler = {};
    const gezeigt = [];
    const geoeffnet = [];
    const zugriffe = [];
    const self = { location: { origin: "https://app.example" }, addEventListener: (t, f) => { (handler[t] ||= []).push(f); },
      registration: { showNotification: async (titel, opt) => { gezeigt.push({ titel, opt }); } },
      clients: { matchAll: async () => [], openWindow: async (u) => { geoeffnet.push(u); }, claim: async () => {} },
      skipWaiting: () => {} };
    const caches = new Proxy({}, { get: (_, k) => { zugriffe.push(String(k)); throw new Error("Zwischenspeicher im Push-Handler"); } });
    new Function("self", "caches", "fetch", quelle)(self, caches, async () => { zugriffe.push("fetch"); throw new Error("Netz im Push-Handler"); });
    const ereignis = (daten, extra = {}) => { const warten = []; return { ev: { data: daten, waitUntil: (p) => warten.push(p), ...extra }, warten }; };
    return { handler, gezeigt, geoeffnet, zugriffe, ereignis };
  }

  it("push und notificationclick sind eigene Ereignisse; der Push-Teil berührt weder Speicher noch Netz noch /api/ (Quelltext)", async () => {
    const { handler } = await sw();
    expect(handler.push).toHaveLength(1);
    expect(handler.notificationclick).toHaveLength(1);
    const { readFile } = await import("node:fs/promises");
    const quelle = await readFile(path.join(process.cwd(), "public/sw.js"), "utf8");
    const pushTeil = quelle.slice(quelle.indexOf("self.addEventListener(\"push\""));
    expect(pushTeil).not.toMatch(/caches\.|fetch\(|\/api\//);
  });

  it("zeigt die minimale Nutzlast an, kürzt Übergroßes, berührt weder Speicher noch Netz", async () => {
    const s = await sw();
    const { ev, warten } = s.ereignis({ json: () => ({ titel: "T".repeat(500), text: "X".repeat(900), ziel: "tausch" }) });
    s.handler.push[0](ev);
    await Promise.all(warten);
    expect(s.gezeigt).toHaveLength(1);
    expect(s.gezeigt[0].titel).toHaveLength(120);
    expect(s.gezeigt[0].opt.body).toHaveLength(200);
    expect(s.gezeigt[0].opt.tag).toBe("tausch");
    expect(s.zugriffe).toEqual([]);
  });

  it("kaputte oder fremde Nutzlast: neutral „CENTRIC“, nie der Rohtext", async () => {
    const s = await sw();
    for (const daten of [{ json: () => { throw new Error("kein JSON"); }, text: () => "ROHTEXT-MIT-PERSONENDATEN" }, { json: () => null }, { json: () => "text" }]) {
      const { ev, warten } = s.ereignis(daten);
      s.handler.push[0](ev); await Promise.all(warten);
    }
    expect(s.gezeigt.map((g) => g.titel)).toEqual(["CENTRIC", "CENTRIC", "CENTRIC"]);
    expect(JSON.stringify(s.gezeigt)).not.toContain("ROHTEXT");
  });

  it("ohne Daten: nichts angezeigt", async () => {
    const s = await sw();
    const { ev } = s.ereignis(null);
    s.handler.push[0](ev);
    expect(s.gezeigt).toEqual([]);
  });

  it("Klick öffnet nur einen Pfad der eigenen Herkunft; eine fremde Adresse in der Nutzlast führt zu „/“", async () => {
    const s = await sw();
    for (const ziel of ["https://evil.example/", "//evil.example/x", "javascript:alert(1)", "/ok/pfad", undefined, "tausch"]) {
      const { ev, warten } = s.ereignis(null, { notification: { close: () => {}, data: { ziel } } });
      s.handler.notificationclick[0](ev); await Promise.all(warten);
    }
    expect(s.geoeffnet).toEqual(["/", "/", "/", "/ok/pfad", "/", "/"]);
    expect(s.zugriffe).toEqual([]);
  });
});

/* ==========================================================================
   NACHTRAG OPUS-REVIEW WP-30 (B2, B5)
   ========================================================================== */

describe("Nachtrag B2: 422 ist ein Validierungsfehler der Anfrage — Klasse nach Fehlercode", () => {
  it.each([
    [422, { name: "invalid_from_address", message: "Invalid `from` field." }, "konfiguration", "absender"],
    [422, { name: "validation_error", message: "Invalid `from` field. The email address needs to follow the `email@example.com` format." }, "konfiguration", "absender"],
    [403, { name: "validation_error", message: "The example.com domain is not verified." }, "konfiguration", "absender"],
    [422, { name: "invalid_parameter", message: "Invalid `subject` field." }, "dauerhaft", undefined],
    [422, { name: "missing_required_field", message: "Missing `subject` field." }, "dauerhaft", undefined],
    [422, { name: "x" }, "dauerhaft", undefined],
    [422, { name: "validation_error", message: "Invalid `to` field. The email address needs to follow the `email@example.com` format." }, "dauerhaft", "empfaenger"],
    [400, { name: "validation_error", message: "Invalid `to` field." }, "dauerhaft", "empfaenger"],
  ])("HTTP %i mit %o: Klasse %s, Ursache %s", async (status, rumpf, klasse, ursache) => {
    mailEinrichten(); fetchMit(status, rumpf);
    const r = await P.sendeMail("a@kunde.example", "B", "T");
    expect(r).toMatchObject({ ok: false, klasse, status });
    expect(r.ursache).toBe(ursache);
  });

  it("Absender falsch eingerichtet (echter Pfad): keine Empfängersperre, zurückgestellt; die nächste Mitteilung wird versucht", async () => {
    mailEinrichten();
    process.env.CENTRIC_ZUSTELL_BACKOFF = "60,120";
    const person = (id) => ({ id, vorname: "V", nachname: "N", rolle: "leitung", email: `${id}@kunde.example` });
    const n = (id) => ({ id, personId: "l1", art: "planFreigegeben", titel: "T", text: "X", ziel: "meine", zeit: "x",
      erstellt: new Date(JETZT).toISOString(), gelesen: false, dringend: false });
    const mm = { id: "m-k", name: "Betrieb", personen: [person("l1")], nachrichten: [n("k1"), n("k2")] };
    const g = fetchMit(422, { name: "invalid_from_address", message: "Invalid `from` field." });
    await V.zustellen(store, { raum: "e2e", bestand: { mandanten: [mm] }, m: mm, ids: ["k1", "k2"], jetzt: JETZT });
    expect(g).toHaveLength(2);
    expect(await store.getMetadata(V.sperrSchluessel("e2e", mm.id, "l1"))).toBeNull();
    expect(await store.get(V.statusSchluessel("e2e", mm.id, "k1", "mail"), { type: "json" })).toMatchObject({ status: "fehler", klasse: "konfiguration" });
  });
});

describe("Nachtrag B5: Dienstarbeiter — keine protokollrelativen Ziele", () => {
  it("„//evil“, „//2130706433“, „///“ führen zu „/“; ein Pfad mit doppeltem Schrägstrich in der Mitte bleibt ein eigener Pfad", async () => {
    const { readFile } = await import("node:fs/promises");
    const quelle = await readFile(path.join(process.cwd(), "public/sw.js"), "utf8");
    const geoeffnet = [];
    const handler = {};
    const self = { location: { origin: "https://app.example" }, addEventListener: (t, f) => { (handler[t] ||= []).push(f); },
      registration: { showNotification: async () => {} },
      clients: { matchAll: async () => [], openWindow: async (u) => { geoeffnet.push(u); }, claim: async () => {} }, skipWaiting: () => {} };
    new Function("self", "caches", "fetch", quelle)(self, {}, async () => { throw new Error("nie"); });
    for (const ziel of ["//evil", "//2130706433", "///", "/a//b", "//", "/ok"]) {
      const warten = [];
      handler.notificationclick[0]({ notification: { close: () => {}, data: { ziel } }, waitUntil: (p) => warten.push(p) });
      await Promise.all(warten);
    }
    expect(geoeffnet).toEqual(["/", "/", "/", "/a//b", "/", "/ok"]);
  });
});
