/* ==========================================================================
   POST-SMTP — ein deaktivierter zweiter Versandweg (IONOS-Postfach)

   Betreiberentscheidung: Mail bevorzugt über das vorhandene IONOS-Postfach,
   kein weiterer Anbieter. Diese Datei ist ein minimaler SMTP-Client mit
   Node-Bordmitteln (node:net, node:tls) — keine Abhängigkeit.

   AUS BIS ZUR AUSDRÜCKLICHEN AKTIVIERUNG. Der Weg wird nur gewählt, wenn
   CENTRIC_MAIL_WEG=smtp gesetzt ist. Die SMTP-Variablen allein schalten
   nichts um. Ist zugleich RESEND_API_KEY gesetzt, ist das ein
   Konfigurationsfehler (kein stilles Umschalten).

   Sicherheitsgrundsätze:
   - TLS-Zertifikatsprüfung ist immer an; es gibt keinen Abschalter.
   - Kein Klartext-Login: Implizites TLS (465) oder STARTTLS (587); fehlt
     STARTTLS beim Server, wird abgebrochen (kein Herabstufen).
   - Das Passwort erscheint in keinem Fehlertext, keiner Statusanzeige.
   - CR/LF in Adressen und Betreff werden abgewiesen (Header-Injection).
   - Fehlerklassen wie post.mjs: Konfigurationsfehler sperren keine
     Empfänger; nur ein ungültiger Empfänger (ursache "empfaenger") darf.
   ========================================================================== */

import net from "node:net";
import tls from "node:tls";
import { randomUUID } from "node:crypto";

const VORGABE_FRIST_MS = 15_000;
const NAMEN = ["CENTRIC_SMTP_HOST", "CENTRIC_SMTP_BENUTZER", "CENTRIC_SMTP_PASSWORT", "CENTRIC_SMTP_ABSENDER"];

/** Ein Fehler mit Klasse (und Ursache) im Sinne von post.mjs/mailFehler. */
class SmtpFehler extends Error {
  /** @param {string} meldung @param {"dauerhaft"|"konfiguration"|"temporaer"} klasse @param {string} [ursache] */
  constructor(meldung, klasse, ursache) {
    super(meldung);
    this.klasse = klasse;
    this.ursache = ursache;
  }
}

/* ------------------------------------------------------------ Konfiguration */

/**
 * Liest die Umgebung. Gibt nie einen Fehlertext mit Werten zurück — nur
 * Variablennamen.
 * @param {Record<string, string|undefined>} [env]
 * @returns {{zustand: "standard"} | {zustand: "fehler", fehler: string}
 *   | {zustand: "smtp", host: string, port: number, sicher: "tls"|"starttls",
 *      benutzer: string, passwort: string, absender: string}}
 */
export function smtpKonfig(env = process.env) {
  const g = (k) => String(env[k] ?? "").trim();
  const weg = g("CENTRIC_MAIL_WEG").toLowerCase();
  if (weg === "" || weg === "resend") return { zustand: "standard" };
  const fehler = (t) => ({ zustand: /** @type {"fehler"} */ ("fehler"), fehler: t });
  if (weg !== "smtp") return fehler("CENTRIC_MAIL_WEG hat einen unbekannten Wert (erlaubt: smtp, resend oder leer).");
  if (g("RESEND_API_KEY"))
    return fehler("CENTRIC_MAIL_WEG=smtp und RESEND_API_KEY sind beide gesetzt. Es gibt kein stilles Umschalten: eines entfernen.");
  const fehlt = NAMEN.filter((n) => !g(n));
  if (fehlt.length) return fehler(`SMTP unvollständig, es fehlt: ${fehlt.join(", ")}.`);
  const host = g("CENTRIC_SMTP_HOST").toLowerCase();
  if (!/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/.test(host)) return fehler("CENTRIC_SMTP_HOST ist kein gültiger Hostname.");
  const portRoh = g("CENTRIC_SMTP_PORT");
  const port = portRoh ? Number(portRoh) : null;
  if (port !== null && !(Number.isInteger(port) && port > 0 && port < 65536)) return fehler("CENTRIC_SMTP_PORT ist keine gültige Portnummer.");
  const sicherRoh = g("CENTRIC_SMTP_SICHER").toLowerCase();
  if (sicherRoh && sicherRoh !== "tls" && sicherRoh !== "starttls") return fehler("CENTRIC_SMTP_SICHER muss tls oder starttls sein.");
  const sicher = /** @type {"tls"|"starttls"} */ (sicherRoh || (port === 587 ? "starttls" : "tls"));
  const absender = g("CENTRIC_SMTP_ABSENDER");
  if (/[\r\n]/.test(absender) || !zerlegeAbsender(absender)) return fehler("CENTRIC_SMTP_ABSENDER ist keine gültige Absenderadresse.");
  // Benutzer/Passwort: unverändert (kein trim des Passworts über g() hinaus ist nötig; Zeilenumbrüche nie)
  const benutzer = g("CENTRIC_SMTP_BENUTZER");
  const passwort = String(env.CENTRIC_SMTP_PASSWORT);
  if (/[\r\n\0]/.test(benutzer) || /[\r\n\0]/.test(passwort)) return fehler("SMTP-Zugangsdaten enthalten unzulässige Steuerzeichen.");
  return { zustand: "smtp", host, port: port ?? (sicher === "starttls" ? 587 : 465), sicher, benutzer, passwort, absender };
}

/** Hat der Betreiber einen anderen Weg als den Standard eingetragen (auch fehlerhaft)? */
export const smtpGewaehlt = (env = process.env) => {
  const w = String(env.CENTRIC_MAIL_WEG ?? "").trim().toLowerCase();
  return w !== "" && w !== "resend"; // auch ein Tippfehler zählt als gewählt (Konfigurationsfehler, nie offener Prüflink)
};

/** Statusanzeige: nur ein Stichwort, nie ein Wert. */
export function smtpStatus(env = process.env) {
  const k = smtpKonfig(env);
  return k.zustand === "smtp" ? "konfiguriert" : k.zustand === "fehler" ? "fehlerhaft" : "aus";
}

/* ------------------------------------------------------------ Kodierung */

const ADRESSE = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$/;

/** Reine Adresse prüfen: ASCII, ein @, keine Steuer-/Trennzeichen. */
export const adresseGueltig = (a) => typeof a === "string" && a.length <= 254 && ADRESSE.test(a);

/** „Name <adresse>“ oder „adresse“ zerlegen. */
function zerlegeAbsender(roh) {
  const m = /^(.*)<([^<>]*)>\s*$/.exec(roh);
  const adresse = (m ? m[2] : roh).trim();
  const name = m ? m[1].trim().replace(/^"(.*)"$/, "$1") : "";
  if (!adresseGueltig(adresse) || /["\\]/.test(name)) return null;
  return { adresse, name };
}

const b64 = (s) => Buffer.from(s, "utf8").toString("base64");

/** RFC 2047: Betreff (oder Anzeigename) als encoded-words, wenn nötig. */
export function kodiereKopfzeile(text) {
  if (/^[\x20-\x7e]*$/.test(text) && text.length <= 70) return text;
  const worte = [];
  let aktuell = "";
  for (const zeichen of text) {
    if (Buffer.byteLength(aktuell + zeichen, "utf8") > 42) { worte.push(aktuell); aktuell = ""; }
    aktuell += zeichen;
  }
  if (aktuell) worte.push(aktuell);
  return worte.map((w) => `=?UTF-8?B?${b64(w)}?=`).join("\r\n ");
}

/** Quoted-printable (RFC 2045) für UTF-8-Text; Zeilenenden als CRLF. */
export function kodiereQp(text) {
  const zeilen = text.replace(/\r\n|\r|\n/g, "\n").split("\n");
  const aus = [];
  for (const zeile of zeilen) {
    const bytes = Buffer.from(zeile, "utf8");
    const teile = [];
    for (let i = 0; i < bytes.length; i++) {
      const b = bytes[i];
      const letztes = i === bytes.length - 1;
      if (b === 0x3d || b < 0x20 && b !== 0x09 || b > 0x7e || ((b === 0x20 || b === 0x09) && letztes))
        teile.push("=" + b.toString(16).toUpperCase().padStart(2, "0"));
      else teile.push(String.fromCharCode(b));
    }
    let linie = "";
    for (let i = 0; i < teile.length; i++) {
      // 76 Zeichen inkl. abschließendem "=": Platz für ein Zeichen lassen, außer beim letzten Teil
      const rest = i === teile.length - 1 ? 0 : 1;
      if (linie.length + teile[i].length + rest > 76) { aus.push(linie + "="); linie = ""; }
      linie += teile[i];
    }
    aus.push(linie);
  }
  return aus.join("\r\n");
}

/** Dot-Stuffing (RFC 5321 4.5.2): Zeilen mit führendem Punkt verdoppeln. */
export const punktPolsterung = (daten) => daten.replace(/(^|\r\n)\./g, "$1..");

/** Die vollständige Nachricht (Kopf + Rumpf), noch ohne Dot-Stuffing. */
export function baueNachricht({ von, an, betreff, text, jetzt = new Date(), id = randomUUID() }) {
  const absender = zerlegeAbsender(von);
  if (!absender) throw new SmtpFehler("Absenderadresse ungültig.", "konfiguration", "absender");
  const domain = absender.adresse.split("@")[1];
  const sonder = /^[\x20-\x7e]*$/.test(absender.name) && /[^A-Za-z0-9 !#$%&'*+\-/=?^_`{|}~]/.test(absender.name);
  const anzeige = sonder ? `"${absender.name}"` : kodiereKopfzeile(absender.name);
  const vonZeile = absender.name ? `${anzeige} <${absender.adresse}>` : absender.adresse;
  const messageId = `<${id}@${domain}>`;
  const kopf = [
    `From: ${vonZeile}`,
    `To: ${an}`,
    `Subject: ${kodiereKopfzeile(betreff)}`,
    `Date: ${jetzt.toUTCString().replace("GMT", "+0000")}`,
    `Message-ID: ${messageId}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: quoted-printable",
  ].join("\r\n");
  return { daten: `${kopf}\r\n\r\n${kodiereQp(text)}`, messageId, domain, absenderAdresse: absender.adresse };
}

/* ------------------------------------------------------------ Verbindung */

/** TLS-Optionen — Zertifikatsprüfung ist fest an. */
export const tlsOptionen = (host) => ({ servername: host, rejectUnauthorized: true, minVersion: /** @type {"TLSv1.2"} */ ("TLSv1.2") });

const zertFehler = (e) => /CERT|SELF_SIGNED|UNABLE_TO_VERIFY|ERR_TLS_|HOSTNAME_MISMATCH|ALTNAME/i.test(String(e && e.code || e && e.message || ""));

/** Netz-/TLS-Fehler → SmtpFehler: Zertifikatsfehler sind Konfiguration (kein endloses Wiederholen). */
const netzFehler = (e) => zertFehler(e)
  ? new SmtpFehler("TLS-Zertifikat des Mailservers nicht vertrauenswürdig.", "konfiguration")
  : new SmtpFehler("Netzwerkfehler zum Mailserver.", "temporaer");

/** Standard-Verbindung: immer TLS-geprüft (implizit) bzw. Klartext nur bis STARTTLS. */
function standardVerbinden({ host, port, sicher, frist }) {
  return new Promise((ok, nein) => {
    const s = sicher === "tls"
      ? tls.connect({ host, port, ...tlsOptionen(host) })
      : net.connect({ host, port });
    if (frist) s.setTimeout(frist, () => s.destroy());
    s.once(sicher === "tls" ? "secureConnect" : "connect", () => ok(s));
    s.once("error", (e) => nein(netzFehler(e)));
    s.once("close", () => nein(new SmtpFehler("Verbindung vom Mailserver beendet.", "temporaer")));
  });
}

function standardAufruesten(socket, { host }) {
  return new Promise((ok, nein) => {
    const s = tls.connect({ socket, ...tlsOptionen(host) });
    s.once("secureConnect", () => ok(s));
    s.once("error", (e) => nein(netzFehler(e)));
    s.once("close", () => nein(new SmtpFehler("Verbindung vom Mailserver beendet.", "temporaer")));
  });
}

/** Grenzen für Serverantworten (Schutz vor Flutung). */
export const PUFFER_MAX = 64 * 1024;
export const ZEILE_MAX = 1000;
const ZEILEN_MAX = 100;

/** Antwortzeilen-Leser über einen (austauschbaren) Socket; durchsucht nur neue Daten. */
function leser() {
  let puffer = "";
  let socket = null;
  let wartet = null;
  let akku = [];
  const fertig = [];
  let defekt = null;
  const liefere = () => {
    if (!wartet) return;
    if (fertig.length) { const w = wartet; wartet = null; w.ok(fertig.shift()); }
    else if (defekt) { const w = wartet; wartet = null; w.nein(defekt); }
  };
  const verarbeite = () => {
    for (;;) {
      const i = puffer.indexOf("\r\n");
      if (i < 0) {
        if (puffer.length > ZEILE_MAX) defekt = defekt || new SmtpFehler("Antwortzeile des Mailservers zu lang.", "temporaer");
        break;
      }
      const z = puffer.slice(0, i);
      puffer = puffer.slice(i + 2);
      if (z.length > ZEILE_MAX || akku.length >= ZEILEN_MAX) { defekt = defekt || new SmtpFehler("Antwort des Mailservers zu groß.", "temporaer"); break; }
      akku.push(z);
      if (/^\d{3}( |$)/.test(z)) {
        fertig.push({ code: Number(akku[0].slice(0, 3)), zeilen: akku.map((x) => x.slice(4)) });
        akku = [];
      }
    }
    liefere();
  };
  let datenHoerer = null;
  const an = (s) => {
    if (s === socket) return;
    if (socket && datenHoerer) socket.removeListener("data", datenHoerer);
    socket = s;
    datenHoerer = (d) => {
      if (defekt) return;
      puffer += d.toString("utf8");
      if (puffer.length > PUFFER_MAX) { defekt = new SmtpFehler("Antwort des Mailservers zu groß.", "temporaer"); puffer = ""; s.destroy(); liefere(); return; }
      verarbeite();
    };
    s.on("data", datenHoerer);
    const aus = (e) => { if (socket === s) { defekt = defekt || e; liefere(); } };
    s.on("error", (e) => aus(netzFehler(e)));
    s.on("close", () => aus(new SmtpFehler("Verbindung vom Mailserver beendet.", "temporaer")));
  };
  return {
    an,
    antwort: () => new Promise((ok, nein) => { wartet = { ok, nein }; liefere(); }),
    schreibe: (t) => socket.write(t),
    leer: () => puffer === "" && fertig.length === 0 && akku.length === 0,
  };
}

/* ------------------------------------------------------------ Versand */

const schwaerze = (text, geheimnisse) => {
  let t = String(text);
  for (const g of geheimnisse) if (g) t = t.split(g).join("***");
  return t;
};

/** Alles, was nie in einer Ausgabe erscheinen darf: Passwort und seine Base64-Formen samt AUTH-Blöcken. */
const geheimnisListe = (k) => {
  const plain = b64(`\0${k.benutzer}\0${k.passwort}`);
  // längste Formen zuerst, damit nichts als Rest stehen bleibt
  return [plain, b64(`${k.benutzer}\0${k.passwort}`), b64(k.passwort), b64(k.benutzer), k.passwort];
};

/* Höchstens zwei Verbindungen zugleich; weitere warten (keine Mail geht verloren). */
export const SMTP_PARALLEL_MAX = 2;
let aktiv = 0;
const warteschlange = [];
const platzNehmen = async () => {
  if (aktiv < SMTP_PARALLEL_MAX) { aktiv += 1; return; }
  await new Promise((r) => warteschlange.push(r));
};
const platzGeben = () => {
  const n = warteschlange.shift();
  if (n) n(); else aktiv -= 1;
};

/**
 * Schickt eine Nachricht über SMTP. Wirft nicht (wie sendeMail).
 * @param {string} an
 * @param {string} betreff
 * @param {string} text
 * @param {{idempotenz?: string}} [_opt]
 * @param {{konfig?: any, frist?: number, verbinden?: Function, aufruesten?: Function, env?: any}} [ctx]
 */
export async function sendeSmtp(an, betreff, text, _opt = {}, ctx = {}) {
  const konfig = ctx.konfig || smtpKonfig(ctx.env || process.env);
  if (konfig.zustand !== "smtp")
    return { ok: false, fehler: konfig.fehler || "SMTP nicht aktiv.", klasse: "konfiguration" };
  const geheimnisse = geheimnisListe(konfig);
  await platzNehmen();
  try {
    return await versende(an, betreff, text, konfig, ctx, geheimnisse);
  } catch (e) {
    const klasse = e instanceof SmtpFehler ? e.klasse : "temporaer";
    const meldung = e instanceof SmtpFehler ? e.message : "Unerwarteter Fehler beim SMTP-Versand.";
    return { ok: false, fehler: schwaerze(meldung, geheimnisse).slice(0, 200), klasse,
      ...(e instanceof SmtpFehler && e.ursache ? { ursache: e.ursache } : {}) };
  } finally {
    platzGeben();
  }
}

async function versende(an, betreff, text, konfig, ctx, geheimnisse) {
  /* Header-Injection: vor jeder Verbindung abweisen. */
  if (typeof an !== "string" || /[\r\n]/.test(an) || !adresseGueltig(an))
    throw new SmtpFehler("Empfängeradresse ungültig.", "dauerhaft", "empfaenger");
  if (typeof betreff !== "string" || /[\r\n\0]/.test(betreff))
    throw new SmtpFehler("Betreff enthält unzulässige Zeilenumbrüche.", "dauerhaft");
  const nachricht = baueNachricht({ von: konfig.absender, an, betreff, text: String(text ?? "") });

  const frist = ctx.frist ?? VORGABE_FRIST_MS;
  const verbinden = ctx.verbinden || standardVerbinden;
  const aufruesten = ctx.aufruesten || standardAufruesten;
  const sockets = [];
  let abgebrochen = false;
  const abbruch = () => { if (abgebrochen) throw new SmtpFehler("Zeitüberschreitung beim Mailserver.", "temporaer"); };
  const registriere = (s) => {
    sockets.push(s);
    if (abgebrochen) { try { s.destroy(); } catch { /* egal */ } return; }
    try { s.setTimeout?.(frist, () => s.destroy()); } catch { /* egal */ }
  };
  let zeitgeber;
  const zeit = new Promise((_, nein) => {
    zeitgeber = setTimeout(() => {
      abgebrochen = true;
      for (const s of sockets) { try { s.destroy(); } catch { /* egal */ } }
      nein(new SmtpFehler("Zeitüberschreitung beim Mailserver.", "temporaer"));
    }, frist);
  });
  const l = leser();
  /* Fehler einer (auch eingespeisten) Verbindungsfabrik: Zertifikat → konfiguration, sonst temporaer. */
  const netz = async (versprechen) => {
    try { return await versprechen; } catch (e) { throw e instanceof SmtpFehler ? e : netzFehler(e); }
  };

  const lauf = async () => {
    let s = await netz(verbinden({ host: konfig.host, port: konfig.port, sicher: konfig.sicher, frist }));
    registriere(s);
    abbruch(); // kam die Verbindung nach Fristablauf: nichts mehr senden
    l.an(s);
    const erwarte = async (ok, was, stufe) => {
      const a = await l.antwort();
      abbruch();
      if (a.code >= 200 && a.code < 400 && (!ok || ok.includes(a.code))) return a;
      throw antwortFehler(a, stufe || was, geheimnisse);
    };
    const befehl = async (zeile, ok, stufe) => { abbruch(); l.schreibe(zeile + "\r\n"); return erwarte(ok, zeile.split(" ")[0], stufe); };

    const gruss = await l.antwort();
    abbruch();
    if (gruss.code !== 220) throw new SmtpFehler(`Mailserver meldet sich nicht bereit (${gruss.code}).`, "temporaer");
    const ehlo = async () => {
      const a = await befehl(`EHLO ${nachricht.domain}`, [250]);
      return a.zeilen.map((z) => z.toUpperCase());
    };
    let f = await ehlo();
    if (konfig.sicher === "starttls") {
      if (!f.some((z) => z === "STARTTLS")) throw new SmtpFehler("Mailserver bietet kein STARTTLS an; Versand abgebrochen.", "konfiguration");
      await befehl("STARTTLS", [220]);
      if (!l.leer()) throw new SmtpFehler("Unerwartete Daten vor TLS-Start.", "temporaer");
      s = await netz(aufruesten(s, { host: konfig.host, frist }));
      registriere(s);
      abbruch();
      l.an(s);
      f = await ehlo();
    }
    // Anmeldung (nur auf gesicherter Verbindung)
    const mech = f.find((z) => z.startsWith("AUTH ") || z.startsWith("AUTH="));
    const mechs = mech ? mech.slice(5).split(/\s+/) : [];
    if (mechs.includes("PLAIN")) {
      await befehl(`AUTH PLAIN ${b64(`\0${konfig.benutzer}\0${konfig.passwort}`)}`, [235], "auth");
    } else if (mechs.includes("LOGIN")) {
      await befehl("AUTH LOGIN", [334], "auth");
      await befehl(b64(konfig.benutzer), [334], "auth");
      await befehl(b64(konfig.passwort), [235], "auth");
    } else {
      throw new SmtpFehler("Mailserver bietet weder AUTH PLAIN noch AUTH LOGIN an.", "konfiguration");
    }
    await befehl(`MAIL FROM:<${nachricht.absenderAdresse}>`, [250], "absender");
    await befehl(`RCPT TO:<${an}>`, [250, 251], "empfaenger");
    await befehl("DATA", [354], "daten");
    abbruch();
    l.schreibe(`${punktPolsterung(nachricht.daten)}\r\n.\r\n`);
    await erwarte([250], "DATA", "daten");
    try { l.schreibe("QUIT\r\n"); } catch { /* egal */ }
    return { ok: true, id: nachricht.messageId };
  };

  try {
    return await Promise.race([lauf(), zeit]);
  } finally {
    abgebrochen = true;
    clearTimeout(zeitgeber);
    for (const s of sockets) { try { s.destroy(); } catch { /* egal */ } }
  }
}

/** SMTP-Antwort → Fehlerklasse (kompatibel zu mailFehler). Bei der Anmeldung nie Servertext. */
function antwortFehler(a, stufe, geheimnisse = []) {
  const roh = stufe === "auth" ? "" : schwaerze(a.zeilen.join(" "), geheimnisse).slice(0, 120);
  const meldung = stufe === "auth" ? `SMTP ${a.code} bei Anmeldung` : `SMTP ${a.code} bei ${stufe}: ${roh}`;
  if (a.code >= 400 && a.code < 500) return new SmtpFehler(meldung, "temporaer");
  const erweitert = /^(\d\.\d{1,3}\.\d{1,3})\b/.exec(a.zeilen.join(" "))?.[1] || "";
  const richtlinie = erweitert.startsWith("5.7.") || /relay|spam|block|reputation|policy|authenticat/i.test(roh);
  if (stufe === "auth") return new SmtpFehler(meldung, "konfiguration");
  if (stufe === "absender") return new SmtpFehler(meldung, "konfiguration", "absender");
  if (stufe === "empfaenger") {
    if (richtlinie) return new SmtpFehler(meldung, "konfiguration");
    if ([550, 551, 553, 501].includes(a.code)) return new SmtpFehler(meldung, "dauerhaft", "empfaenger");
    return new SmtpFehler(meldung, "dauerhaft");
  }
  if (stufe === "daten" && richtlinie) return new SmtpFehler(meldung, "konfiguration");
  return new SmtpFehler(meldung, "dauerhaft");
}
