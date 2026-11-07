/* ==========================================================================
   POST-SMTP — der deaktivierte IONOS-Weg, gegen einen lokalen Fake-Server

   Nur 127.0.0.1, ohne TLS und nur über die injizierbare Verbindungsfabrik.
   Der Produktionsweg verbindet immer mit Zertifikatsprüfung (tlsOptionen).
   Kein echter Mailserver, keine echten Zugangsdaten.
   ========================================================================== */

import { describe, it, expect, beforeEach, afterEach, afterAll } from "vitest";
import net from "node:net";
import {
  smtpKonfig, smtpStatus, sendeSmtp, tlsOptionen, kodiereKopfzeile, kodiereQp, punktPolsterung,
} from "../server/lib/post-smtp.mjs";
import { sendeMail, pruefLinkErlaubt } from "../server/lib/post.mjs";

const PW = "geheim-Pa$$w0rt-XYZ";
const UMGEBUNG = { ...process.env };
const SMTP_ENV = {
  CENTRIC_MAIL_WEG: "smtp", CENTRIC_SMTP_HOST: "smtp.beispiel.test", CENTRIC_SMTP_BENUTZER: "dienst@beispiel.test",
  CENTRIC_SMTP_PASSWORT: PW, CENTRIC_SMTP_ABSENDER: "CENTRIC Dienstplan <dienst@beispiel.test>",
};

/** Fake-SMTP-Server. `ver` überschreibt Antworten je Befehlsanfang. */
function fakeServer(ver = {}, { starttls = false, auth = "PLAIN LOGIN", schweigen = false } = {}) {
  const log = { befehle: [], daten: "" };
  const server = net.createServer((s) => {
    let inDaten = false; let puffer = ""; let login = 0;
    s.write("220 fake ESMTP\r\n");
    s.on("data", (d) => {
      puffer += d.toString("utf8");
      for (;;) {
        if (inDaten) {
          const ende = puffer.indexOf("\r\n.\r\n");
          if (ende < 0) return;
          log.daten = puffer.slice(0, ende);
          puffer = puffer.slice(ende + 5);
          inDaten = false;
          s.write(ver.ENDE || "250 2.0.0 queued\r\n");
          continue;
        }
        const i = puffer.indexOf("\r\n");
        if (i < 0) return;
        const z = puffer.slice(0, i); puffer = puffer.slice(i + 2);
        log.befehle.push(z);
        if (schweigen && z.startsWith("EHLO")) continue;
        const k = z.split(" ")[0].toUpperCase();
        if (ver[k]) { s.write(ver[k]); continue; }
        if (k === "EHLO") s.write(`250-fake\r\n${starttls ? "250-STARTTLS\r\n" : ""}${auth ? `250-AUTH ${auth}\r\n` : ""}250 8BITMIME\r\n`);
        else if (k === "STARTTLS") s.write("220 go ahead\r\n");
        else if (login === 1) { login = 2; s.write("334 UGFzc3dvcmQ6\r\n"); }
        else if (login === 2) { login = 0; s.write("235 ok\r\n"); }
        else if (k === "AUTH") {
          if (z.toUpperCase().startsWith("AUTH LOGIN")) { login = 1; s.write("334 VXNlcm5hbWU6\r\n"); } else s.write("235 ok\r\n");
        }
        else if (k === "MAIL" || k === "RCPT") s.write("250 ok\r\n");
        else if (k === "DATA") { s.write("354 go\r\n"); inDaten = true; }
        else if (k === "QUIT") s.end("221 bye\r\n");
        else s.write("334 weiter\r\n"); // LOGIN-Schritte
      }
    });
    s.on("error", () => {});
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok({
    log, port: server.address().port, close: () => new Promise((r) => server.close(r)),
  })));
}

const fabrik = (port) => ({
  verbinden: () => new Promise((ok, nein) => { const s = net.connect(port, "127.0.0.1"); s.once("connect", () => ok(s)); s.once("error", nein); }),
  aufruesten: async (s) => s, // Test: kein TLS; produktiv: tls.connect mit rejectUnauthorized
});

let srv;
afterEach(async () => { if (srv) await srv.close(); srv = null; });
beforeEach(() => { for (const k of Object.keys(SMTP_ENV).concat(["RESEND_API_KEY", "CENTRIC_SMTP_PORT", "CENTRIC_SMTP_SICHER", "CENTRIC_PRUEFLINK", "NODE_ENV"])) delete process.env[k]; });
afterAll(() => { process.env = { ...UMGEBUNG }; });

const senden = (opt = {}, an = "empfaenger@beispiel.test", betreff = "Hallo", text = "Text") =>
  sendeSmtp(an, betreff, text, {}, { env: SMTP_ENV, frist: 2000, ...fabrik(srv.port), ...opt });

describe("Schalter", () => {
  it("Standard: aus, auch wenn SMTP-Variablen gesetzt sind", () => {
    const { CENTRIC_MAIL_WEG: _w, ...ohneWeg } = SMTP_ENV;
    expect(smtpKonfig(ohneWeg).zustand).toBe("standard");
    expect(smtpStatus({})).toBe("aus");
    expect(smtpStatus(ohneWeg)).toBe("aus");
  });
  it("aktiv nur mit Schalter und allen Variablen", () => {
    const k = smtpKonfig(SMTP_ENV);
    expect(k.zustand).toBe("smtp");
    expect(k).toMatchObject({ port: 465, sicher: "tls" });
    expect(smtpStatus(SMTP_ENV)).toBe("konfiguriert");
    expect(smtpKonfig({ ...SMTP_ENV, CENTRIC_SMTP_PORT: "587" })).toMatchObject({ port: 587, sicher: "starttls" });
  });
  it("Konflikt mit Resend, fehlende Werte, ungültige Werte: Konfigurationsfehler", () => {
    expect(smtpKonfig({ ...SMTP_ENV, RESEND_API_KEY: "re_x" }).zustand).toBe("fehler");
    expect(smtpKonfig({ ...SMTP_ENV, CENTRIC_SMTP_HOST: "" })).toMatchObject({ zustand: "fehler" });
    expect(smtpKonfig({ ...SMTP_ENV, CENTRIC_SMTP_SICHER: "klartext" }).zustand).toBe("fehler");
    expect(smtpKonfig({ ...SMTP_ENV, CENTRIC_MAIL_WEG: "irgendwas" }).zustand).toBe("fehler");
    expect(smtpKonfig({ ...SMTP_ENV, CENTRIC_SMTP_HOST: "a b" }).zustand).toBe("fehler");
    expect(smtpStatus({ ...SMTP_ENV, RESEND_API_KEY: "re_x" })).toBe("fehlerhaft");
  });
  it("sendeMail: Konflikt liefert Klasse konfiguration, ohne Netz, ohne Passwort", async () => {
    Object.assign(process.env, SMTP_ENV, { RESEND_API_KEY: "re_x" });
    const r = await sendeMail("a@beispiel.test", "B", "T");
    expect(r).toMatchObject({ ok: false, klasse: "konfiguration" });
    expect(r.ursache).toBeUndefined();
    expect(JSON.stringify(r)).not.toContain(PW);
  });
  it("sendeMail ohne Schalter bleibt Trockenlauf", async () => {
    process.env.CENTRIC_SMTP_HOST = "x.test";
    expect(await sendeMail("a@beispiel.test", "B", "T")).toMatchObject({ ok: true, trocken: true });
  });
  it("Prüflink: schließt sich bei gewähltem SMTP-Weg aus", () => {
    process.env.CENTRIC_PRUEFLINK = "ja";
    expect(pruefLinkErlaubt()).toBe(true);
    process.env.CENTRIC_MAIL_WEG = "smtp";
    expect(pruefLinkErlaubt()).toBe(false);
  });
  it("TLS-Prüfung ist fest an", () => {
    expect(tlsOptionen("h.test")).toMatchObject({ rejectUnauthorized: true, servername: "h.test" });
  });
});

describe("Versand gegen Fake-Server", () => {
  it("Erfolg (PLAIN), Absender und Empfänger im Umschlag", async () => {
    srv = await fakeServer();
    const r = await senden();
    expect(r.ok).toBe(true);
    expect(r.id).toMatch(/^<.+@beispiel\.test>$/);
    expect(srv.log.befehle).toContain("MAIL FROM:<dienst@beispiel.test>");
    expect(srv.log.befehle).toContain("RCPT TO:<empfaenger@beispiel.test>");
    const plain = srv.log.befehle.find((b) => b.startsWith("AUTH PLAIN "));
    expect(Buffer.from(plain.slice(11), "base64").toString()).toBe(`\0dienst@beispiel.test\0${PW}`);
    expect(srv.log.daten).toContain("Content-Type: text/plain; charset=UTF-8");
  });
  it("AUTH LOGIN, wenn PLAIN fehlt", async () => {
    srv = await fakeServer({}, { auth: "LOGIN" });
    expect((await senden()).ok).toBe(true);
    expect(srv.log.befehle).toContain("AUTH LOGIN");
  });
  it("STARTTLS: ohne Angebot kein Versand und kein Login", async () => {
    srv = await fakeServer({}, { starttls: false });
    const r = await senden({ env: { ...SMTP_ENV, CENTRIC_SMTP_SICHER: "starttls" } });
    expect(r).toMatchObject({ ok: false, klasse: "konfiguration" });
    expect(srv.log.befehle.some((b) => b.startsWith("AUTH"))).toBe(false);
  });
  it("STARTTLS: mit Angebot, EHLO danach erneut", async () => {
    srv = await fakeServer({}, { starttls: true });
    const r = await senden({ env: { ...SMTP_ENV, CENTRIC_SMTP_SICHER: "starttls" } });
    expect(r.ok).toBe(true);
    expect(srv.log.befehle.filter((b) => b.startsWith("EHLO")).length).toBe(2);
  });
  it("Auth-Fehler ist Konfigurationsfehler (keine Sperre), ohne Passwort in der Ausgabe", async () => {
    srv = await fakeServer({ AUTH: `535 5.7.8 Authentication failed for ${PW}\r\n` });
    const r = await senden();
    expect(r).toMatchObject({ ok: false, klasse: "konfiguration" });
    expect(r.ursache).toBeUndefined();
    expect(JSON.stringify(r)).not.toContain(PW);
  });
  it("550 beim Empfänger → dauerhaft/empfaenger", async () => {
    srv = await fakeServer({ RCPT: "550 5.1.1 User unknown\r\n" });
    expect(await senden()).toMatchObject({ ok: false, klasse: "dauerhaft", ursache: "empfaenger" });
  });
  it("Relay-/Richtlinienabweisung beim Empfänger ist Konfiguration, keine Sperre", async () => {
    srv = await fakeServer({ RCPT: "550 5.7.1 Relaying denied\r\n" });
    const r = await senden();
    expect(r.klasse).toBe("konfiguration");
    expect(r.ursache).toBeUndefined();
  });
  it("Absender abgewiesen → konfiguration (nie Empfängersperre)", async () => {
    srv = await fakeServer({ MAIL: "553 5.7.1 Sender domain mismatch\r\n" });
    const r = await senden();
    expect(r).toMatchObject({ ok: false, klasse: "konfiguration", ursache: "absender" });
  });
  it("4xx → temporaer", async () => {
    srv = await fakeServer({ RCPT: "451 4.3.0 try later\r\n" });
    expect(await senden()).toMatchObject({ ok: false, klasse: "temporaer" });
  });
  it("Zeitüberschreitung → temporaer", async () => {
    srv = await fakeServer({}, { schweigen: true });
    const t0 = Date.now();
    const r = await senden({ frist: 150 });
    expect(r).toMatchObject({ ok: false, klasse: "temporaer" });
    expect(Date.now() - t0).toBeLessThan(1500);
  });
  it("Verbindung verweigert → temporaer", async () => {
    srv = await fakeServer();
    const port = srv.port; await srv.close(); srv = null;
    const r = await sendeSmtp("a@beispiel.test", "B", "T", {}, { env: SMTP_ENV, frist: 1000, ...fabrik(port) });
    expect(r).toMatchObject({ ok: false, klasse: "temporaer" });
  });
  it("CRLF-Injektion in Empfänger und Betreff wird vor der Verbindung abgewiesen", async () => {
    srv = await fakeServer();
    const a = await senden({}, "x@beispiel.test\r\nBcc: boese@beispiel.test");
    expect(a).toMatchObject({ ok: false, klasse: "dauerhaft", ursache: "empfaenger" });
    const b = await senden({}, "x@beispiel.test", "Hallo\r\nBcc: boese@beispiel.test");
    expect(b).toMatchObject({ ok: false, klasse: "dauerhaft" });
    expect(b.ursache).toBeUndefined();
    expect(srv.log.befehle.length).toBe(0);
  });
  it("Dot-Stuffing: Zeilen mit führendem Punkt werden verdoppelt", async () => {
    srv = await fakeServer();
    expect((await senden({}, "x@beispiel.test", "B", "eins\n.zwei\n..drei\n.")).ok).toBe(true);
    expect(srv.log.daten).toContain("\r\n..zwei\r\n");
    expect(srv.log.daten).toContain("\r\n...drei\r\n");
    expect(srv.log.daten.endsWith("\r\n..")).toBe(true);
    expect(punktPolsterung(".a\r\n.b")).toBe("..a\r\n..b");
  });
  it("UTF-8: Betreff als RFC 2047, Text als quoted-printable", async () => {
    srv = await fakeServer();
    const betreff = "Dienstplan geändert – Frühschicht für Müller";
    expect((await senden({}, "x@beispiel.test", betreff, "Grüße, schöne Tage = gut")).ok).toBe(true);
    const kopf = srv.log.daten.split("\r\n\r\n")[0].replace(/\r\n /g, " ");
    const subj = kopf.split("\r\n").find((z) => z.startsWith("Subject: ")).slice(9);
    const dekodiert = [...subj.matchAll(/=\?UTF-8\?B\?([^?]+)\?=/g)].map((m) => Buffer.from(m[1], "base64").toString("utf8")).join("");
    expect(dekodiert).toBe(betreff);
    expect(srv.log.daten).toContain("Gr=C3=BC=C3=9Fe");
    expect(srv.log.daten).toContain("= gut".replace("=", "=3D"));
    expect(/[^\x00-\x7f]/.test(srv.log.daten)).toBe(false);
  });
  it("Kodierhelfer: langer Betreff, QP-Zeilenlänge", () => {
    for (const z of kodiereKopfzeile("ä".repeat(100)).split("\r\n ")) expect(z.length).toBeLessThanOrEqual(75);
    for (const z of kodiereQp("ü".repeat(200)).split("\r\n")) expect(z.length).toBeLessThanOrEqual(76);
    expect(kodiereQp("Ende \nzwei")).toBe("Ende=20\r\nzwei");
  });
  it("kein Passwort in Ausgaben: Fehlertexte, Status, Konfigurationsfehler", async () => {
    srv = await fakeServer({ AUTH: `454 4.7.0 temporary ${PW} ${Buffer.from(`\0dienst@beispiel.test\0${PW}`).toString("base64")}\r\n` });
    const r = await senden();
    expect(JSON.stringify(r)).not.toContain(PW);
    expect(JSON.stringify(smtpStatus(SMTP_ENV))).not.toContain(PW);
    expect(JSON.stringify(smtpKonfig({ ...SMTP_ENV, CENTRIC_SMTP_HOST: "" }))).not.toContain(PW);
  });
});
