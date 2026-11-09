/* ==========================================================================
   SERVER — der Node-Prozess hinter Caddy

   Ein einzelner Node-Prozess im Container tut vier Dinge:

     1. die gebaute Oberfläche aus dist/ ausliefern
     2. Verweise, die keine Datei sind, auf index.html lenken (die Anwendung
        entscheidet im Browser, was sie zeigt)
     3. die sechs Funktionen aus server/funktionen/ unter genau den Pfaden
        aufrufen, die sie selbst in `export const config = { path }` nennen
     4. die Sicherheitsköpfe (SICHERHEIT, unten) auf jede Antwort setzen

   Die Funktionen bleiben unverändert: Sie bekommen ein Web-`Request` und
   geben ein Web-`Response` zurück. Diese Datei übersetzt zwischen Node und
   diesem Standard — mehr nicht.

   Umgebung
     PORT                Vorgabe 3000
     CENTRIC_DATEN       Ablage der Daten, Vorgabe /data (siehe server/lib/ablage.mjs);
                         beim Start belegt mit CENTRIC_DATEN/.prozess — ein
                         Prozess je Ablage (server/lib/prozesssperre.mjs)
     CENTRIC_STATIK      Ordner der gebauten Oberfläche, Vorgabe dist/ (nur für Prüfungen)
     CENTRIC_AUFRAEUMEN  „aus" schaltet den täglichen Löschlauf für abgelaufene
                         Testbetriebe ab (Vorgabe: an, siehe server/lib/aufraeumen.mjs)

   Start:  node server.mjs
   Prüfen: GET /gesund  ->  200 {"status":"ok"}
   ========================================================================== */

import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { Readable } from "node:stream";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { getStore, ablageWurzel } from "./server/lib/ablage.mjs";
import { ablageBelegen, VERLUST_WARTEN_MS } from "./server/lib/prozesssperre.mjs";
import { betreiberSitzungenOhneFaktorBeenden } from "./server/lib/betreiber-zweifaktor.mjs";
import { schreibstopp, alleFrei } from "./server/lib/raumsperre.mjs";
import { testbetriebeAufraeumen } from "./server/lib/aufraeumen.mjs";
import { datenschutzLauf, modusAusUmgebung } from "./server/lib/datenschutzlauf.mjs";
import { zustand, oeffentlich, detailErlaubt, ueberwachungStarten } from "./server/lib/gesund.mjs";
import { nachfassen, zustellungAufraeumen } from "./server/lib/versand.mjs";
import { ereignis } from "./server/lib/gesund-zaehler.mjs";
import { voruebergehend } from "./server/lib/bestand.mjs";
import { bindungErneuern, zustandPruefen, zustandsVerzeichnis } from "./server/lib/schluesselepoche.mjs";
import { kanalStarten, haltObergrenze, HALT_ORDNER } from "./server/lib/schreibhalt.mjs";
import { vertrauteListe, herkunftBestimmen, xffOhneVertrauenMelden, adresseFuersProtokoll } from "./server/lib/schutz.mjs";

const PORT = Number(process.env.PORT) || 3000;

/* Wem glaubt der Server X-Forwarded-For? (B-XFF-1, docs/CADDY-UND-XFF.md)
   Eine ungültige Liste hält den Start an — lieber kein Dienst als einer,
   der still jedem oder niemandem vertraut. */
const VERTRAUT = vertrauteListe(process.env.CENTRIC_VERTRAUTE_PROXYS);
if (!VERTRAUT.anzahl)
  console.warn("Herkunft: CENTRIC_VERTRAUTE_PROXYS ist leer — X-Forwarded-For wird ignoriert, es zählt "
    + "die Adresse der Gegenstelle. Hinter Caddy MUSS das Netz des Caddy-Containers eingetragen sein.");
else console.log(`Herkunft: X-Forwarded-For wird von ${VERTRAUT.anzahl} vertrauten Einträgen angenommen.`);
const WURZEL = path.dirname(fileURLToPath(import.meta.url));
/* CENTRIC_STATIK gibt es nur, damit die Prüfung einen eigenen, kleinen
   Ordner statt dist/ unterschieben kann. Im Betrieb bleibt es bei dist/. */
const DIST = path.resolve(WURZEL, process.env.CENTRIC_STATIK || "dist");
const FUNKTIONEN = path.join(WURZEL, "server", "funktionen");

/* Sechs Megabyte — dieselbe Grenze wie in daten.mjs (RUMPF_MAX). Hier wird
   sie schon beim Einlesen durchgesetzt, damit ein zu großer Rumpf gar nicht
   erst im Speicher landet. */
const RUMPF_MAX = 6 * 1024 * 1024;
/* IMP-3: Eine Funktion darf mit `config.rumpfMax` eine eigene Grenze nennen (der Import nimmt
   Dateien bis 10 MB an, server/funktionen/import.mjs). Obergrenze 16 MB; ohne Angabe RUMPF_MAX. */
const RUMPF_HOECHST = 16 * 1024 * 1024;

/* Die Sicherheitsköpfe der Anwendung. Sie gelten für jede Antwort, die
   nicht selbst einen gleichnamigen Kopf setzt; Caddy ergänzt davor HSTS
   und nosniff noch einmal für alles, was er ausliefert. */
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
 * @typedef {{ name: string, muster: string, exakt: string|null, praefix: string|null, rumpfMax: number,
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
        rumpfMax: Number.isInteger(modul.config.rumpfMax) && modul.config.rumpfMax > 0
          ? Math.min(modul.config.rumpfMax, RUMPF_HOECHST) : RUMPF_MAX,   // IMP-3
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
  /* Erst alle genauen Pfade, dann die Präfixe.

     Vorher entschied die Reihenfolge der Dateien: `daten.mjs` beansprucht
     `/api/*` und wird alphabetisch vor allem anderen geladen, also hätte ein
     genauer Pfad wie `/api/registrierung` sie nie erreicht. Wer eine solche
     Route anlegt, soll nicht darauf angewiesen sein, seine Datei passend zu
     benennen — das ist eine Falle, die genau einmal auffällt.

     Für den Bestand ändert sich nichts: Kein genauer Pfad liegt unter einem
     fremden Präfix (`/einrichten`, `/lage`, `/starten` gegen `/api/`,
     `/kalender/`, `/zustellung/`). */
  for (const r of routen) if (r.exakt !== null && pfad === r.exakt) return r;
  for (const r of routen) if (r.praefix !== null && pfad.startsWith(r.praefix)) return r;
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
function rumpfEinlesen(req, grenze = RUMPF_MAX) {
  return new Promise((erfuellt, verworfen) => {
    const teile = [];
    let groesse = 0;
    const beiDaten = (stueck) => {
      groesse += stueck.length;
      if (groesse > grenze) {
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
  /* Die Herkunft bestimmt der Server, nicht der Client (B-XFF-1). Ein
     mitgeschicktes x-forwarded-for zählt nur, wenn die Gegenstelle in
     CENTRIC_VERTRAUTE_PROXYS steht, und dann von rechts gelesen. Danach
     steht im Kopf genau eine Adresse — die, die Bremse und Protokoll
     (schutz.mjs, herkunft()) verwenden. */
  const xff = kopf.get("x-forwarded-for");
  if (xff && !VERTRAUT.anzahl) xffOhneVertrauenMelden();
  kopf.set("x-forwarded-for", herkunftBestimmen(req.socket.remoteAddress, xff, VERTRAUT));

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
  if (/^\/icon-[^/]*\.png$/.test(rel)) return "public, max-age=31536000, immutable";   // Symbole ändern sich nie
  if (rel === "/manifest.webmanifest") return "public, max-age=3600";                   // Manifest selten
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
  /* WP-18 (B4): Die Einlöseseite einer Einladung gibt ihre Adresse nirgends weiter. Das Token steht im Fragment
     (nie im Referrer), die Seite wird es sofort los — und ein Referrer wird hier gar nicht erst gesendet. Caddy
     ergänzt nur fehlende Köpfe (`?Referrer-Policy`), dieser bleibt. */
  if (pfad === "/einladung") kopf["referrer-policy"] = "no-referrer";
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

/* Erst die Ablage belegen, dann alles andere (server/lib/prozesssperre.mjs).
   Die Sperre je Raum, die verlorene Änderungen verhindert, gilt nur in
   diesem Prozess — ein zweiter auf derselben Ablage höbe sie wieder auf.
   Hält ein lebender Prozess die Ablage, startet dieser hier nicht: kein
   Port, kein Löschlauf, kein einziger Schreibvorgang. Geht die Sperre im
   Betrieb verloren (übernommen, weil der Puls ausblieb), beendet sich der
   Prozess lieber, als neben einem zweiten weiterzuschreiben.

   Aber nicht mitten in einem Schreibvorgang: Ein sofortiges process.exit
   zwischen Kern und Standzeiger hinterließ einen halben Stand. Deshalb in
   drei Schritten — keine neuen Schreibvorgänge mehr (503, raumsperre.mjs
   schreibstopp), die laufenden höchstens VERLUST_WARTEN_MS lang zu Ende
   kommen lassen, dann beenden. Die Prozesssperre selbst wartet ohnehin
   drei Fehlschläge ab, bevor sie „verloren" meldet (prozesssperre.mjs). */
const ablagesperre = await ablageBelegen(ablageWurzel(), {
  verloren: async (grund) => {
    console.error(`Ablagesperre verloren (${grund}) — keine neuen Schreibvorgänge, `
      + "laufende werden abgewartet, dann wird der Prozess beendet.");
    schreibstopp(`Ablagesperre verloren: ${grund}`);
    const frei = await alleFrei(VERLUST_WARTEN_MS);
    if (!frei) console.error(`Nach ${VERLUST_WARTEN_MS} ms noch Schreibvorgänge offen — Beenden trotzdem.`);
    process.exit(1);
  },
});
if (!ablagesperre.ok) {
  console.error(`${ablagesperre.grund} Start verweigert — es darf nur ein Prozess je Ablage laufen.`);
  process.exit(1);
}
if (ablagesperre.uebernommen) console.log("Ablagesperre: veraltete Sperre eines beendeten Prozesses übernommen");
process.on("exit", () => ablagesperre.freigebenSofort());

/* Schreib-Halt für die Sicherung unter Last (server/lib/schreibhalt.mjs, WP-28c): ein kleiner Dateikanal im
   Zustandsverzeichnis (außerhalb der Ablage, kein Netz). Erst nach der Ablagesperre: nur der Prozess, der die Ablage
   hält, darf halten. Ohne Kanal läuft alles wie bisher; die Sicherung fällt dann auf ihre Ruhezeit zurück. */
try {
  const k = await kanalStarten({ verzeichnis: path.join(zustandsVerzeichnis(), HALT_ORDNER) });
  if (k.ok) console.log(`Schreibhalt: Kanal bereit (höchstens ${haltObergrenze()} ms je Halt)`);
  else console.log(`Schreibhalt: kein Kanal — ${k.grund}. Sicherung unter Last nur mit Ruhezeit.`);
} catch (e) {
  console.error("Schreibhalt: kein Kanal —", e && e.message ? e.message : e, "Sicherung unter Last nur mit Ruhezeit.");
}

/* WP-32d: Betreibersitzungen ohne zweiten Faktor enden beim Start der Auslieferung. */
try {
  const r = await betreiberSitzungenOhneFaktorBeenden(getStore({ name: "centric", consistency: "strong" }));
  if (r.beendet || r.fehler) console.log(`Betreibersitzungen ohne zweiten Faktor: ${r.beendet} beendet, ${r.fehler} Fehler`);
} catch (e) { console.error("Betreibersitzungen ohne zweiten Faktor ließen sich nicht prüfen:", e && e.message); }

const routen = await funktionenLaden();
console.log("Funktionen: " + routen.map((r) => `${r.name} ${r.muster}`).join(", "));

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", "http://x");
    const pfad = url.pathname;

    /* /gesund (WP-05, server/lib/gesund.mjs): Stufen ok/warnung/kritisch.
       Nach außen nur die Stufe; 503 nur bei kritisch (Raumsperre hängt,
       Schreibstopp, Ablage nicht beschreibbar, Platz kritisch). Die
       Einzelheiten (?detail=1) nur direkt von der eigenen Maschine. */
    if (pfad === "/gesund") {
      const e = await zustand();
      if (url.searchParams.get("detail") === "1" && detailErlaubt(req.socket.remoteAddress, req.headers)) {
        json(res, oeffentlich(e).status, e);
        return;
      }
      const o = oeffentlich(e);
      json(res, o.status, o.inhalt);
      return;
    }

    const route = routeFuer(routen, pfad);
    if (route) {
      let rumpf;
      if (req.method !== "GET" && req.method !== "HEAD") {
        const laenge = Number(req.headers["content-length"] || 0);
        if (laenge > route.rumpfMax) { zuGross(res); return; }
        rumpf = await rumpfEinlesen(req, route.rumpfMax);
        if (rumpf === null) { zuGross(res); return; }
      }
      const anfrage = webRequest(req, url, rumpf);
      if (!anfrage) { json(res, 400, { fehler: "Ungültiger Host." }); return; }
      const kontext = { ip: anfrage.headers.get("x-forwarded-for") };
      const antwort = await route.handler(anfrage, kontext);
      if (!(antwort instanceof Response)) throw new Error(`Funktion ${route.name}: keine Response`);
      if (antwort.status >= 500) ereignis("5xx");
      await antwortSenden(antwort, res, req.method === "HEAD");
      return;
    }

    await statisch(req, res, pfad);
  } catch (e) {
    /* Hat der Aufrufer selbst aufgelegt, gibt es niemanden mehr, dem eine
       Antwort oder ein Protokolleintrag nützen würde. */
    if (req.destroyed || res.destroyed) return;
    ereignis("5xx");
    /* Nie die rohe Adresse: Der Pfad eines Kalender-Feeds trägt dessen Geheimnis (WP-24, Befund 9). */
    console.error(`${new Date().toISOString()} ${req.method} ${adresseFuersProtokoll(req.url)}:`, e && e.stack ? e.stack : e);
    /* Vorübergehend nicht lesbar oder gerade gesperrt (lib/bestand.mjs,
       voruebergehend): 503 mit Wiederholungshinweis, nicht 500 — und erst
       recht nicht „gibt es nicht". Für alle Funktionen, die solche Fehler
       nicht selbst beantworten (Kalender, Zustellung, Anmeldung …). */
    if (!res.headersSent && voruebergehend(e)) {
      json(res, 503, { fehler: "Gerade nicht verfügbar.", text: "Bitte in einigen Sekunden noch einmal versuchen.",
        code: e.code });
      return;
    }
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

/* Wiederherstellungsschutz der Sicherungsschlüssel (server/lib/schluesselepoche.mjs): Beim Start, jede Minute und beim
   Beenden wird die Bindung zwischen Ablage und Zustandsverzeichnis erneuert. Eine Kopie der Ablage, die älter ist als
   die letzte Erneuerung, passt danach nicht mehr: Es beginnt eine neue Epoche, und alle früheren Schlüssel werden sofort
   widerrufen. Nur wenn es schon eine Epoche oder Bindung gibt. Ein Fehler betrifft allein die Sicherungsschlüssel
   (sie gelten dann nicht), nie den übrigen Betrieb. */
let bindungFehlerGemeldet = false;
const bindungTakt = () => bindungErneuern({ nurWennVorhanden: true }).then(() => { bindungFehlerGemeldet = false; }, (e) => {
  if (!bindungFehlerGemeldet) console.error("Sicherungsschlüssel: Schlüsselepoche nicht prüfbar, Schlüssel gelten nicht:", e && e.message ? e.message : e);
  bindungFehlerGemeldet = true;
});
zustandPruefen().then((z) => {
  if (z.stufe !== "ok") console.error(`WARNUNG Sicherungsschlüssel: ${z.text} (CENTRIC_ZUSTAND). Bis zur Behebung gilt kein Sicherungsschlüssel; alles andere läuft.`);
  else console.log(`Sicherungsschlüssel: Zustandsverzeichnis nutzbar${z.text ? ` (${z.text})` : ""}`);
}, () => {});
bindungTakt();
setInterval(bindungTakt, 60_000).unref();

/* Regelmäßige Zustandsprüfung mit Alarm (WP-05). Vorgabe: prüfen und im Log
   vermerken; ein Alarmkanal erst mit CENTRIC_ALARM_WEBHOOK. */
if ((process.env.CENTRIC_UEBERWACHUNG || "an").trim().toLowerCase() !== "aus") ueberwachungStarten();

/* ---------------------------------------------------------------------------
   Täglicher Löschlauf für abgelaufene Testbetriebe

   Kein Cron, kein zweiter Container: Der Prozess, der die Daten hält, räumt
   sie auch auf. Erster Lauf eine Minute nach dem Start — damit läuft er nach
   jedem Neustart erneut und holt nach, was ein Ausfall ausgelassen hat —,
   danach alle vierundzwanzig Stunden. Der Lauf selbst wirft nie; hier wird
   trotzdem noch einmal abgefangen, damit ein Fehler im Aufräumen unter
   keinen Umständen den Server mitnimmt. Was geschah, steht im Protokoll und
   im Vermerk aufraeumen:letzter.
   --------------------------------------------------------------------------- */
const AUFRAEUMEN_START_MS = 60_000;
const AUFRAEUMEN_TAKT_MS = 24 * 60 * 60 * 1000;
if ((process.env.CENTRIC_AUFRAEUMEN || "an").trim().toLowerCase() !== "aus") {
  const lauf = async () => {
    try {
      const v = await testbetriebeAufraeumen(
        getStore({ name: "centric", consistency: "strong" }),
        getStore({ name: "centric-sitzungen", consistency: "strong" }));
      if (v.uebersprungen) console.log("Löschlauf: übersprungen, ein anderer läuft noch");
      else console.log(`Löschlauf: ${v.geprueft} Testräume geprüft, ${v.geloescht.length} gelöscht, `
        + `${v.fehler.length} Fehler`);
    } catch (e) {
      console.error("Löschlauf fehlgeschlagen:", e && e.message ? e.message : e);
    }
    /* Datenschutzlauf (WP-26, server/lib/datenschutzlauf.mjs): Aufbewahrungs-
       fristen jedes Betriebs, In-App-Sicherungen nach festem Plan, Spur nach
       30 Tagen — auf dem Server, nicht erst, wenn jemand in der Oberfläche
       den Löschlauf anstößt. */
    try {
      /* Schalter CENTRIC_DATENSCHUTZLAUF: aus | vorschau (Vorgabe) | an. In
         der Vorschau wird nur berichtet — gelöscht wird erst nach bewusster
         Aktivierung (.env.example). */
      const modus = modusAusUmgebung();
      const d = await datenschutzLauf(getStore({ name: "centric", consistency: "strong" }), { modus });
      if (d.uebersprungen) console.log(`Datenschutzlauf: ${modus === "aus" ? "abgeschaltet" : "übersprungen, ein anderer läuft noch"}`);
      else console.log(`Datenschutzlauf (${modus}): ${d.raeume} Räume, ${d.geaendert.length} Betriebe bereinigt, `
        + `${d.faellig.length} fällig (Vorschau), ${d.sicherungenGeloescht} Sicherungen entfernt, `
        + `${d.sicherungenFaellig} Sicherungen fällig (Vorschau), ${d.sicherungenAelterHoechstalter} Sicherungen älter als 90 Tage `
        + `(${d.sicherungenAelterHoechstalterBehalten} davon behalten), `
        + `${d.feeddatenGeloescht} alte Kalender-Termine entfernt (${d.feeddatenFaellig} fällig), ${d.fehler.length} Fehler`);
    } catch (e) {
      console.error("Datenschutzlauf fehlgeschlagen:", e && e.message ? e.message : e);
    }
    /* Zustellprotokoll, Kontingentplätze, verwaiste Push-Anmeldungen (WP-30).
       Gleicher Schalter wie der Datenschutzlauf: aus | vorschau | an. Frist:
       CENTRIC_ZUSTELLPROTOKOLL_TAGE (Vorgabe 30, höchstens 365). */
    try {
      const modus = modusAusUmgebung();
      if (modus !== "aus") {
        const t = Number(process.env.CENTRIC_ZUSTELLPROTOKOLL_TAGE);
        const tage = Number.isInteger(t) && t >= 1 && t <= 365 ? t : 30;
        const z = await zustellungAufraeumen(getStore({ name: "centric", consistency: "strong" }),
          { tage, trocken: modus !== "an",
            /* Betreiberschalter nach einem Konfigurationsfix (Absender, Domain):
               alle Adresssperren aufheben (docs/MAIL-PUSH-EINRICHTUNG.md). */
            sperrenAufheben: (process.env.CENTRIC_ZUSTELL_SPERREN_AUFHEBEN || "").trim().toLowerCase() === "ja" });
        console.log(`Zustellaufräumen (${modus}): ${z.protokoll} Protokolleinträge, ${z.kontingent} Kontingentplätze, `
          + `${z.waisen} verwaiste Anmeldungen, ${z.sperren} Adresssperren aufgehoben, ${z.fehler} Fehler`);
      }
    } catch (e) {
      console.error("Zustellaufräumen fehlgeschlagen:", e && e.message ? e.message : e);
    }
  };
  setTimeout(lauf, AUFRAEUMEN_START_MS).unref();
  setInterval(lauf, AUFRAEUMEN_TAKT_MS).unref();
} else {
  console.log("Löschlauf: abgeschaltet (CENTRIC_AUFRAEUMEN=aus)");
}

/* ---------------------------------------------------------------------------
   Zustell-Warteschlange (WP-30): Wiederholungen nach einem Fehler holt der
   Server selbst ab, nicht erst, wenn eine Oberfläche nachfragt. Alle 60
   Sekunden, höchstens ein Lauf zugleich; ein Fehler nimmt den Server nicht mit.
   Schalter CENTRIC_ZUSTELL_TAKT=aus (nur für Wartung).
   --------------------------------------------------------------------------- */
if ((process.env.CENTRIC_ZUSTELL_TAKT || "an").trim().toLowerCase() !== "aus") {
  let nachfassenLaeuft = false;
  const takt = async () => {
    if (nachfassenLaeuft) return;
    nachfassenLaeuft = true;
    /* Nachtrag 2 (F2): Ein Durchgang beginnt nach 50 s keinen Satz mehr; Mail
       und Push haben eigene Fristen. Der Merker fällt in jedem Fall (finally). */
    try { await nachfassen(getStore({ name: "centric", consistency: "strong" }), { bis: Date.now() + 50_000 }); }
    catch (e) { console.error("Zustell-Warteschlange fehlgeschlagen:", e && e.message ? e.message : e); }
    finally { nachfassenLaeuft = false; }
  };
  setInterval(takt, 60_000).unref();
}

/* Sauber aufhören: keine neuen Verbindungen, laufende zu Ende, dann Schluss.
   Docker schickt SIGTERM und wartet zehn Sekunden — wir sind früher fertig. */
let beendet = false;
function beenden(signal) {
  if (beendet) return;
  beendet = true;
  console.log(`${signal}: Server wird beendet`);
  /* Wiederherstellungsschutz: Bindung noch einmal erneuern, damit eine Kopie aus diesem Lauf nach dem Zurückspielen
     erkannt wird. Bei SIGKILL oder Absturz fehlt dieser Schritt; dann bleibt der Minutentakt. */
  const bindungFertig = bindungErneuern({ nurWennVorhanden: true }).catch((e) =>
    console.error("Sicherungsschlüssel: Bindung beim Beenden nicht erneuert:", e && e.message ? e.message : e));
  server.close(() => { bindungFertig.finally(() => process.exit(0)); });
  if (typeof server.closeIdleConnections === "function") server.closeIdleConnections();
  setTimeout(() => { console.warn("Beenden erzwungen"); process.exit(0); }, 8_000).unref();
}
process.on("SIGTERM", () => beenden("SIGTERM"));
process.on("SIGINT", () => beenden("SIGINT"));
