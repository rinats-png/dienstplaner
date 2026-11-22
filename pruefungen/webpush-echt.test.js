/* ==========================================================================
   DEP-1 — WEB PUSH ÜBER DIE ECHTE BIBLIOTHEK (ohne Attrappe von web-push)

   mail-push-anbieter.test.js ersetzt web-push durch eine Attrappe. Damit
   blieb ein Bruch der Exportform unsichtbar: web-push 4 hat nur benannte
   Exporte, `webpush.default` ist dort undefined, der TypeError landete im
   catch als „temporaer/netz“ — Push wäre lautlos nie zugestellt worden.

   Hier läuft lib/webpush.mjs mit der ECHTEN Bibliothek (Verschlüsselung,
   VAPID-Unterschrift, https.request). Ersetzt ist nur der Weg ins Netz:
   https.globalAgent leitet jede Verbindung auf einen lokalen Fake-Push-Dienst
   (127.0.0.1, freier Port, Klartext-HTTP). Nichts geht hinaus.
   - Schlüssel entstehen zur Laufzeit (generateVAPIDKeys, ECDH); keiner steht
     im Code.
   - Der Fake-Dienst entschlüsselt die Nutzlast (RFC 8291/8188) und prüft die
     VAPID-Unterschrift (ES256) — ein Durchlauf ist also echt, nicht nur ein
     Aufruf.
   - Der Agent hält fest, WOHIN web-push verbinden wollte: derselbe Host, den
     pushziel.mjs geprüft hat, Port 443 (SI-01 / Review S1, Parser-Gleichlauf).
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import crypto from "node:crypto";
import { readFile } from "node:fs/promises";

const ENDPUNKT = "https://push.example/sende/geraet-1";
const UMGEBUNG = { ...process.env };
const echterAgent = https.globalAgent;

/** Fake-Push-Dienst: hält jede Anfrage fest, antwortet mit `antwort`. */
const dienst = { anfragen: [], antwort: 201, server: /** @type {any} */ (null), port: 0 };
/** Wohin web-push verbinden wollte (Optionen an createConnection). */
const verbindungen = [];

class UmleitAgent extends https.Agent {
  /** @param {any} opt */
  createConnection(opt) {
    verbindungen.push({ host: opt.host, port: opt.port, servername: opt.servername });
    return net.connect(dienst.port, "127.0.0.1");
  }
}

let W, wp, geraet;

/** Teil eines base64url-Schlüssels → Buffer */
const b64 = (s) => Buffer.from(s, "base64url");

/** RFC 8291 (aes128gcm) — Nutzlast mit dem privaten Schlüssel des Geräts öffnen. */
function oeffnen(rumpf, ecdh, auth) {
  const salz = rumpf.subarray(0, 16);
  const idLaenge = rumpf.readUInt8(20);
  const absender = rumpf.subarray(21, 21 + idLaenge);
  const chiffre = rumpf.subarray(21 + idLaenge);
  const geteilt = ecdh.computeSecret(absender);
  const info = Buffer.concat([Buffer.from("WebPush: info\0"), ecdh.getPublicKey(), absender]);
  const ikm = Buffer.from(crypto.hkdfSync("sha256", geteilt, auth, info, 32));
  const cek = Buffer.from(crypto.hkdfSync("sha256", ikm, salz, Buffer.from("Content-Encoding: aes128gcm\0"), 16));
  const nonce = Buffer.from(crypto.hkdfSync("sha256", ikm, salz, Buffer.from("Content-Encoding: nonce\0"), 12));
  const d = crypto.createDecipheriv("aes-128-gcm", cek, nonce);
  d.setAuthTag(chiffre.subarray(chiffre.length - 16));
  const klar = Buffer.concat([d.update(chiffre.subarray(0, chiffre.length - 16)), d.final()]);
  let ende = klar.length - 1;
  while (ende >= 0 && klar[ende] === 0) ende--;
  expect(klar[ende]).toBe(2);                                         // Trenner des letzten Datensatzes
  return JSON.parse(klar.subarray(0, ende).toString("utf8"));
}

/** VAPID-JWT (ES256) mit dem öffentlichen VAPID-Schlüssel prüfen. */
function vapidPruefen(kopf, oeffentlich) {
  const m = /^vapid t=([^,]+), k=(.+)$/.exec(kopf || "");
  expect(m, "Authorization-Kopf in VAPID-Form").not.toBeNull();
  const [t, k] = [m[1], m[2]];
  expect(k).toBe(oeffentlich);
  const roh = b64(k);
  const schluessel = crypto.createPublicKey({ format: "jwk",
    key: { kty: "EC", crv: "P-256", x: roh.subarray(1, 33).toString("base64url"), y: roh.subarray(33, 65).toString("base64url") } });
  const [h, p, s] = t.split(".");
  const echt = crypto.verify("sha256", Buffer.from(`${h}.${p}`), { key: schluessel, dsaEncoding: "ieee-p1363" }, b64(s));
  expect(echt, "VAPID-Unterschrift").toBe(true);
  return JSON.parse(b64(p).toString("utf8"));
}

beforeAll(async () => {
  dienst.server = http.createServer((req, res) => {
    const teile = [];
    req.on("data", (c) => teile.push(c));
    req.on("end", () => {
      dienst.anfragen.push({ methode: req.method, pfad: req.url, koepfe: req.headers, rumpf: Buffer.concat(teile) });
      res.writeHead(dienst.antwort, { "content-type": "text/plain" });
      res.end(dienst.antwort >= 300 ? "abgelehnt" : "");
    });
  });
  await new Promise((ok) => dienst.server.listen(0, "127.0.0.1", ok));
  dienst.port = dienst.server.address().port;
  https.globalAgent = new UmleitAgent({ keepAlive: false });
  wp = await import("web-push");
  W = await import("../server/lib/webpush.mjs");
  const ecdh = crypto.createECDH("prime256v1");
  ecdh.generateKeys();
  const auth = crypto.randomBytes(16);
  geraet = { ecdh, auth, anmeldung: { endpoint: ENDPUNKT,
    keys: { p256dh: ecdh.getPublicKey().toString("base64url"), auth: auth.toString("base64url") } } };
});
afterAll(async () => {
  https.globalAgent = echterAgent;
  await new Promise((ok) => dienst.server.close(ok));
  for (const k of Object.keys(process.env)) if (!(k in UMGEBUNG)) delete process.env[k];
  Object.assign(process.env, UMGEBUNG);
});
beforeEach(() => {
  dienst.anfragen.length = 0; dienst.antwort = 201; verbindungen.length = 0;
  for (const k of ["CENTRIC_PUSH_HOSTS", "NODE_ENV", "VAPID_KONTAKT"]) delete process.env[k];
  const v = wp.generateVAPIDKeys();
  process.env.VAPID_PUBLIC = v.publicKey;
  process.env.VAPID_PRIVATE = v.privateKey;
});

describe("DEP-1 Exportform der echten Bibliothek", () => {
  it("web-push liefert setVapidDetails, sendNotification und generateVAPIDKeys als benannte Exporte", () => {
    expect(typeof wp.setVapidDetails).toBe("function");
    expect(typeof wp.sendNotification).toBe("function");
    expect(typeof wp.generateVAPIDKeys).toBe("function");
  });
  it("webpush.mjs nutzt die benannten Exporte, nicht `.default`", async () => {
    const q = await readFile(new URL("../server/lib/webpush.mjs", import.meta.url), "utf8");
    expect(q).not.toMatch(/\.default\b/);
    expect(q).toMatch(/setVapidDetails/);
    expect(q).toMatch(/sendNotification/);
  });
});

describe("DEP-1 sendePush über die echte Bibliothek gegen einen lokalen Fake-Push-Dienst", () => {
  it("Zustellung: ok, eine POST-Anfrage, Nutzlast entschlüsselbar, VAPID gültig", async () => {
    const r = await W.sendePush(geraet.anmeldung, "Dienst", "Neuer Plan", "/plan", { topic: "plan-1" });
    expect(r).toEqual({ ok: true });
    expect(dienst.anfragen).toHaveLength(1);
    const a = dienst.anfragen[0];
    expect(a.methode).toBe("POST");
    expect(a.pfad).toBe("/sende/geraet-1");
    expect(a.koepfe["content-encoding"]).toBe("aes128gcm");
    expect(a.koepfe.ttl).toBe(String(24 * 60 * 60));
    expect(a.koepfe.urgency).toBe("normal");
    expect(a.koepfe.topic).toBe("plan-1");
    const jwt = vapidPruefen(a.koepfe.authorization, process.env.VAPID_PUBLIC);
    expect(jwt.aud).toBe("https://push.example");
    expect(jwt.sub).toBe("mailto:kein-kontakt@example.invalid");
    expect(oeffnen(a.rumpf, geraet.ecdh, geraet.auth)).toEqual({ titel: "Dienst", text: "Neuer Plan", ziel: "/plan" });
  });

  it("SI-01/S1: web-push verbindet genau zu dem Host, den pushziel.mjs geprüft hat, Port 443", async () => {
    expect(W.pushEndpunktErlaubt(ENDPUNKT)).toBe(true);
    await W.sendePush(geraet.anmeldung, "T", "X", null);
    expect(verbindungen).toHaveLength(1);
    expect(verbindungen[0].host).toBe(new URL(ENDPUNKT).hostname);
    expect(Number(verbindungen[0].port)).toBe(443);
  });

  it("dringend → Urgency high; ohne topic kein Topic-Kopf", async () => {
    await W.sendePush(geraet.anmeldung, "Notruf", "Bitte melden", null, { dringend: true });
    expect(dienst.anfragen).toHaveLength(1);
    expect(dienst.anfragen[0].koepfe.urgency).toBe("high");
    expect(dienst.anfragen[0].koepfe.topic).toBeUndefined();
  });

  it.each([[410, "erloschen"], [404, "erloschen"], [413, "dauerhaft"], [403, "konfiguration"], [429, "temporaer"], [503, "temporaer"]])(
    "Antwort %i des Dienstes ist %s (Statuscode aus dem echten WebPushError)", async (status, klasse) => {
      dienst.antwort = status;
      const r = await W.sendePush(geraet.anmeldung, "T", "X", null);
      expect(dienst.anfragen).toHaveLength(1);
      expect(r).toEqual({ ok: false, erloschen: klasse === "erloschen", klasse, status, fehler: `http-${status}` });
      expect(JSON.stringify(r)).not.toContain("push.example");
    });

  it("nicht erlaubter Endpunkt: keine Verbindung, kein Aufruf der Bibliothek", async () => {
    const r = await W.sendePush({ ...geraet.anmeldung, endpoint: "https://127.0.0.1/x" }, "T", "X", null);
    expect(r).toMatchObject({ ok: false, klasse: "erloschen", fehler: "push-ziel-nicht-erlaubt" });
    expect(verbindungen).toHaveLength(0);
    expect(dienst.anfragen).toHaveLength(0);
  });

  it("ohne VAPID-Schlüssel trocken: keine Verbindung (Push-Schalter bleibt aus)", async () => {
    delete process.env.VAPID_PUBLIC; delete process.env.VAPID_PRIVATE;
    const r = await W.sendePush(geraet.anmeldung, "T", "X", null);
    expect(r).toEqual({ ok: true, trocken: true });
    expect(verbindungen).toHaveLength(0);
  });
});

/* Zuletzt: eine Bibliothek in fremder Exportform (wie web-push 3 als
   ESM-Standardexport ohne benannte Exporte) darf nicht als „Netzfehler“
   durchgehen, sondern meldet sich als Konfigurationsfehler. */
describe("DEP-1 falsche Exportform wird sichtbar, nicht still „netz“", () => {
  it("Modul ohne benannte Exporte → klasse konfiguration, fehler push-modul", async () => {
    vi.resetModules();
    vi.doMock("web-push", () => ({ default: { setVapidDetails: () => {}, sendNotification: async () => ({ statusCode: 201 }) } }));
    try {
      const W2 = await import("../server/lib/webpush.mjs");
      const r = await W2.sendePush(geraet.anmeldung, "T", "X", null);
      expect(r).toEqual({ ok: false, erloschen: false, klasse: "konfiguration", fehler: "push-modul" });
    } finally {
      vi.doUnmock("web-push");
      vi.resetModules();
    }
  });
});
