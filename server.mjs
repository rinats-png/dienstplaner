/* ==========================================================================
   SERVER — Betrieb ohne Netlify

   Ein einzelner Node-Prozess übernimmt, was bisher Netlify tat:

     1. die gebaute Oberfläche aus dist/ ausliefern
     2. Verweise, die keine Datei sind, auf index.html lenken (die Anwendung
        entscheidet im Browser, was sie zeigt)
     3. die sechs Funktionen aus netlify/functions/ unter genau den Pfaden
        aufrufen, die sie selbst in `export const config = { path }` nennen
     4. die Sicherheitsköpfe aus netlify.toml auf jede Antwort setzen

   Die Funktionen bleiben unverändert: Sie bekommen ein Web-`Request` und
   geben ein Web-`Response` zurück. Diese Datei übersetzt zwischen Node und
   diesem Standard — mehr nicht.

   Umgebung
     PORT            Vorgabe 3000
     CENTRIC_DATEN   Ablage der Daten, Vorgabe /data (siehe netlify/lib/ablage.mjs)
     CENTRIC_STATIK  Ordner der gebauten Oberfläche, Vorgabe dist/ (nur für Prüfungen)

   Start:  node server.mjs
   Prüfen: GET /gesund  ->  200 {"status":"ok"}
   ========================================================================== */

import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { Readable } from "node:stream";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const PORT = Number(process.env.PORT) || 3000;
const WURZEL = path.dirname(fileURLToPath(import.meta.url));
/* CENTRIC_STATIK gibt es nur, damit die Prüfung einen eigenen, kleinen
   Ordner statt dist/ unterschieben kann. Im Betrieb bleibt es bei dist/. */
const DIST = path.resolve(WURZEL, process.env.CENTRIC_STATIK || "dist");
const FUNKTIONEN = path.join(WURZEL, "netlify", "functions");

/* Sechs Megabyte — dieselbe Grenze wie in daten.mjs (RUMPF_MAX). Hier wird
   sie schon beim Einlesen durchgesetzt, damit ein zu großer Rumpf gar nicht
   erst im Speicher landet. */
const RUMPF_MAX = 6 * 1024 * 1024;

/* Die Köpfe aus netlify.toml, Wort für Wort. Sie gelten für jede Antwort,
   die nicht selbst einen gleichnamigen Kopf setzt. */
const SICHERHEIT = {
  "x-frame-options": "SAMEORIGIN",
  "x-content-type-options": "nosniff",
  "strict-transport-security": "max-age=31536000; includeSubDomains",
  "referrer-policy": "strict-origin-when-cross-origin",
  "content-security-policy":
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
    + "img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; "
    + "frame-ancestors 'self'; base-uri 'none'; form-action 'self'; object-src 'none'",
  "permissions-policy": "geolocation=(self), camera=(), microphone=(), payment=(), usb=()",
};

const INHALT = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".pdf": "application/pdf",
};

/* ---------------------------------------------------------------------------
   Funktionen laden — die Pfade kommen aus den Dateien selbst
   --------------------------------------------------------------------------- */

/**
 * @typedef {{ name: string, muster: string, exakt: string|null, praefix: string|null,
 *             handler: (req: Request, context: object) => Promise<Response>|Response }} Route
 */

/** @returns {Promise<Route[]>} */
async function funktionenLaden() {
  const routen = [];
  const dateien = (await readdir(FUNKTIONEN)).filter((d) => d.endsWith(".mjs")).sort();
  for (const datei of dateien) {
    const modul = await import(pathToFileURL(path.join(FUNKTIONEN, datei)).href);
    const pfade = [].concat(modul.config && modul.config.path ? modul.config.path : []);
    if (typeof modul.default !== "function" || !pfade.length) {
      console.warn(`Funktion ${datei}: kein Handler oder kein Pfad — übersprungen`);
      continue;
    }
    for (const muster of pfade) {
      if (typeof muster !== "string" || !muster.startsWith("/"))
        throw new Error(`Funktion ${datei}: unerwartetes Pfadmuster ${JSON.stringify(muster)}`);
      routen.push({
        name: datei.replace(/\.mjs$/, ""),
        muster,
        exakt: muster.endsWith("/*") ? null : muster,
        praefix: muster.endsWith("/*") ? muster.slice(0, -1) : null,   // "/api/*" -> "/api/"
        handler: modul.default,
      });
    }
  }
  return routen;
}

/**
 * @param {Route[]} routen
 * @param {string} pfad
 */
function routeFuer(routen, pfad) {
  for (const r of routen) {
    if (r.exakt !== null && pfad === r.exakt) return r;
    if (r.praefix !== null && pfad.startsWith(r.praefix)) return r;
  }
  return null;
}

/* ---------------------------------------------------------------------------
   Node -> Web Request
   --------------------------------------------------------------------------- */

/**
 * Liest den Rumpf ganz ein, bricht aber ab, sobald die Grenze reißt.
 * @param {import("node:http").IncomingMessage} req
 * @returns {Promise<Buffer|null>}  null = zu groß
 */
function rumpfEinlesen(req) {
  return new Promise((erfuellt, verworfen) => {
    const teile = [];
    let groesse = 0;
    const beiDaten = (stueck) => {
      groesse += stueck.length;
      if (groesse > RUMPF_MAX) {
        /* Ab hier wird nichts mehr behalten, aber weiter gelesen und
           verworfen. Nur so bleibt der HTTP-Parser bis zum Ende der
           Nachricht im Takt, und dieselbe Verbindung kann danach die nächste
           Anfrage tragen. Ein Anhalten (pause) ließe den Rest liegen — die
           Verbindung wäre für den Aufrufer bis zum Zeitablauf verloren. */
        req.off("data", beiDaten);
        req.on("data", () => {});
        teile.length = 0;
        erfuellt(null);
        return;
      }
      teile.push(stueck);
    };
    req.on("data", beiDaten);
    req.on("end", () => erfuellt(Buffer.concat(teile)));
    req.on("error", verworfen);
  });
}

/**
 * 413 senden, ohne die Verbindung zu kappen: Ein Client, der noch sendet,
 * bekommt so die Antwort zu sehen statt einer abgerissenen Leitung. Den Rest
 * des Rumpfs liest Node zu Ende und verwirft ihn (bei bekannter Länge von
 * selbst, sonst über den Verwerfer in rumpfEinlesen). Endlose Uploads
 * beendet requestTimeout; die harte Grenze davor setzt der Reverse Proxy.
 * @param {import("node:http").ServerResponse} res
 */
function zuGross(res) {
  json(res, 413, { fehler: "Anfrage zu groß." });
}

/* Was ein Host-Kopf enthalten darf: Name oder Adresse, wahlweise mit Port.
   Alles andere — Leerzeichen, Steuerzeichen, Pfade — ist keine Adresse und
   führt sonst tief in `new Request()` zu einer Ausnahme statt zu einer 400. */
const HOST_FORM = /^(\[[0-9a-fA-F:.]+\]|[A-Za-z0-9](?:[A-Za-z0-9.-]{0,252}))(?::\d{1,5})?$/;

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {URL} url   bereits zerlegter Pfad samt Query
 * @param {Buffer|undefined} rumpf
 * @returns {Request|null}   null = Host unbrauchbar
 */
function webRequest(req, url, rumpf) {
  const kopf = new Headers();
  for (const [name, wert] of Object.entries(req.headers)) {
    if (wert === undefined) continue;
    if (Array.isArray(wert)) for (const w of wert) kopf.append(name, w);
    else kopf.set(name, wert);
  }
  /* Hinter Caddy steht die Adresse des Aufrufers in x-forwarded-for. Läuft
     der Server einmal ohne Proxy — in der Prüfung etwa — trägt er sie selbst
     ein, damit die Bremse in schutz.mjs etwas zum Zählen hat. */
  if (!kopf.has("x-forwarded-for") && req.socket.remoteAddress)
    kopf.set("x-forwarded-for", req.socket.remoteAddress);

  const proto = String(kopf.get("x-forwarded-proto") || "http").split(",")[0].trim();
  const host = String(kopf.get("host") || `localhost:${PORT}`).split(",")[0].trim();
  if (!HOST_FORM.test(host) || (proto !== "http" && proto !== "https")) return null;

  /* Pfad und Query aus der bereits zerlegten Adresse — nicht aus req.url.
     So landet ein Ziel in absoluter Form (GET http://x/pfad) oder eines,
     das mit // beginnt, genau dort, wo auch das Routing es gesehen hat. */
  return new Request(`${proto}://${host}${url.pathname}${url.search}`, {
    method: req.method,
    headers: kopf,
    body: rumpf && rumpf.length ? /** @type {any} */ (rumpf) : undefined,
  });
}

/**
 * @param {Response} antwort
 * @param {import("node:http").ServerResponse} res
 * @param {boolean} nurKopf
 */
async function antwortSenden(antwort, res, nurKopf) {
  /** @type {import("node:http").OutgoingHttpHeaders} */
  const kopf = {};
  for (const [name, wert] of antwort.headers) {
    if (name === "set-cookie") continue;
    kopf[name] = wert;
  }
  const kekse = typeof antwort.headers.getSetCookie === "function" ? antwort.headers.getSetCookie() : [];
  if (kekse.length) kopf["set-cookie"] = kekse;
  for (const [name, wert] of Object.entries(SICHERHEIT)) if (!(name in kopf)) kopf[name] = wert;

  res.writeHead(antwort.status, kopf);
  if (nurKopf || !antwort.body) { res.end(); return; }
  await new Promise((erfuellt, verworfen) => {
    const strom = Readable.fromWeb(/** @type {any} */ (antwort.body));
    strom.on("error", verworfen);
    /* Geht der Aufrufer vorher, darf der Quellstrom nicht offen bleiben. */
    res.on("close", () => { strom.destroy(); erfuellt(); });
    res.on("error", verworfen);
    strom.pipe(res);
  });
}

/**
 * @param {import("node:http").ServerResponse} res
 * @param {number} status
 * @param {object} inhalt
 */
function json(res, status, inhalt) {
  const text = JSON.stringify(inhalt);
  res.writeHead(status, {
    ...SICHERHEIT,
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(text),
    "cache-control": "no-store",
  });
  res.end(text);
}

/* ---------------------------------------------------------------------------
   Statische Dateien und der Rückfall auf index.html
   --------------------------------------------------------------------------- */

/** @param {string} rel  Pfad relativ zu dist/, beginnt mit "/" */
function zwischenspeicher(rel) {
  if (rel === "/index.html" || rel === "/sw.js") return "no-cache";
  if (rel.startsWith("/assets/")) return "public, max-age=31536000, immutable";
  if (/^\/icon-[^/]*\.png$/.test(rel)) return "public, max-age=31536000, immutable";   // netlify.toml
  if (rel === "/manifest.webmanifest") return "public, max-age=3600";                   // netlify.toml
  return "public, max-age=0, must-revalidate";
}

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {string} pfad   URL-Pfad ohne Query
 */
async function statisch(req, res, pfad) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { ...SICHERHEIT, allow: "GET, HEAD" });
    res.end();
    return;
  }
  let rel;
  try { rel = decodeURIComponent(pfad); } catch { json(res, 400, { fehler: "Ungültiger Pfad." }); return; }
  if (rel.includes("\0")) { json(res, 400, { fehler: "Ungültiger Pfad." }); return; }

  let datei = path.normalize(path.join(DIST, rel));
  if (datei !== DIST && !datei.startsWith(DIST + path.sep)) { json(res, 404, { fehler: "Nicht gefunden." }); return; }

  let info = await stat(datei).catch(() => null);
  if (info && info.isDirectory()) { datei = path.join(datei, "index.html"); info = await stat(datei).catch(() => null); }

  if (!info) {
    /* Kein Dateiname mit Endung -> eine Adresse der Anwendung -> index.html.
       Mit Endung -> eine Datei, die es nicht gibt -> 404, keine HTML-Seite
       an Stelle eines fehlenden Skripts. */
    if (path.extname(rel)) { json(res, 404, { fehler: "Nicht gefunden." }); return; }
    datei = path.join(DIST, "index.html");
    info = await stat(datei).catch(() => null);
    if (!info) { json(res, 404, { fehler: "Nicht gefunden." }); return; }
    rel = "/index.html";
  } else if (datei.endsWith(`${path.sep}index.html`)) {
    rel = "/index.html";
  }

  const etag = `W/"${info.size.toString(16)}-${Math.floor(info.mtimeMs).toString(16)}"`;
  const kopf = {
    ...SICHERHEIT,
    "content-type": INHALT[path.extname(datei).toLowerCase()] || "application/octet-stream",
    "cache-control": zwischenspeicher(rel),
    "last-modified": info.mtime.toUTCString(),
    etag,
  };
  const gesehen = String(req.headers["if-none-match"] || "").split(",").map((e) => e.trim());
  if (gesehen.includes(etag) || gesehen.includes("*")) { res.writeHead(304, kopf); res.end(); return; }
  kopf["content-length"] = info.size;
  res.writeHead(200, kopf);
  if (req.method === "HEAD") { res.end(); return; }
  await new Promise((erfuellt, verworfen) => {
    const strom = createReadStream(datei);
    strom.on("error", verworfen);
    res.on("close", () => { strom.destroy(); erfuellt(); });
    strom.pipe(res);
  });
}

/* ---------------------------------------------------------------------------
   Zusammenbau
   --------------------------------------------------------------------------- */

const routen = await funktionenLaden();
console.log("Funktionen: " + routen.map((r) => `${r.name} ${r.muster}`).join(", "));

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", "http://x");
    const pfad = url.pathname;

    if (pfad === "/gesund") { json(res, 200, { status: "ok" }); return; }

    const route = routeFuer(routen, pfad);
    if (route) {
      let rumpf;
      if (req.method !== "GET" && req.method !== "HEAD") {
        const laenge = Number(req.headers["content-length"] || 0);
        if (laenge > RUMPF_MAX) { zuGross(res); return; }
        rumpf = await rumpfEinlesen(req);
        if (rumpf === null) { zuGross(res); return; }
      }
      const anfrage = webRequest(req, url, rumpf);
      if (!anfrage) { json(res, 400, { fehler: "Ungültiger Host." }); return; }
      const kontext = { ip: anfrage.headers.get("x-forwarded-for") };
      const antwort = await route.handler(anfrage, kontext);
      if (!(antwort instanceof Response)) throw new Error(`Funktion ${route.name}: keine Response`);
      await antwortSenden(antwort, res, req.method === "HEAD");
      return;
    }

    await statisch(req, res, pfad);
  } catch (e) {
    /* Hat der Aufrufer selbst aufgelegt, gibt es niemanden mehr, dem eine
       Antwort oder ein Protokolleintrag nützen würde. */
    if (req.destroyed || res.destroyed) return;
    console.error(`${new Date().toISOString()} ${req.method} ${req.url}:`, e && e.stack ? e.stack : e);
    if (!res.headersSent) json(res, 500, { fehler: "Interner Fehler." });
    else res.destroy();
  }
});

/* Fehler an der Verbindung selbst (Reset, kaputte Kopfzeilen) sind kein
   Grund, den Prozess zu verlieren — Node beantwortet kaputte Anfragen mit
   400, hier wird nur verhindert, dass ein Reset als Ausnahme hochsteigt. */
server.on("clientError", (fehler, socket) => {
  if (/** @type {any} */ (fehler).code === "ECONNRESET" || !socket.writable) { socket.destroy(); return; }
  socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
});

server.requestTimeout = 60_000;
server.headersTimeout = 20_000;
server.keepAliveTimeout = 65_000;

server.listen(PORT, "0.0.0.0", () => {
  console.log(`CENTRIC läuft auf Port ${PORT}, Daten: ${process.env.CENTRIC_DATEN || "/data"}`);
});

/* Sauber aufhören: keine neuen Verbindungen, laufende zu Ende, dann Schluss.
   Docker schickt SIGTERM und wartet zehn Sekunden — wir sind früher fertig. */
let beendet = false;
function beenden(signal) {
  if (beendet) return;
  beendet = true;
  console.log(`${signal}: Server wird beendet`);
  server.close(() => process.exit(0));
  if (typeof server.closeIdleConnections === "function") server.closeIdleConnections();
  setTimeout(() => { console.warn("Beenden erzwungen"); process.exit(0); }, 8_000).unref();
}
process.on("SIGTERM", () => beenden("SIGTERM"));
process.on("SIGINT", () => beenden("SIGINT"));
