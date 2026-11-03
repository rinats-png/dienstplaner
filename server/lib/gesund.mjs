/* ==========================================================================
   /gesund — ZUSTAND DES DIENSTES UND ALARM (WP-05)

   Bis WP-05 sagte /gesund nur: Prozess läuft, Raumsperre frei, kein
   Schreibstopp. Eine volle Platte, eine Ablage, in die nichts mehr geht,
   eine Sicherung, die seit einer Woche fehlt — davon erfuhr niemand.

   Drei Stufen:
     ok        alles in Ordnung
     warnung   Aufmerksamkeit nötig, der Dienst arbeitet (HTTP 200)
     kritisch  Alarmstufe; HTTP 503 und unhealthy NUR, wenn Sperre oder
               Ablage kritisch sind — dann arbeitet der Dienst nicht
               verlässlich. Eine kritisch volle Platte alarmiert als
               „kritisch“, nach außen steht „warnung“ mit 200: Ein Neustart
               schafft keinen Platz, und eine Neustart-Schleife oder ein R0
               im Deploy machte es schlimmer. Alte Sicherung und gehäufte
               Fehler sind Warnungen.

   Nach außen (anmeldefrei, über Caddy) steht nur die Stufe:
     {"status":"ok"} · {"status":"warnung"} · {"status":"kritisch"}
   Keine Pfade, Raumnamen, Versionen, Zahlen oder Fehlermeldungen.
   Die Einzelheiten (?detail=1) gibt es nur für Anfragen, die direkt von
   der eigenen Maschine kommen (Gegenstelle 127.0.0.1/::1, kein
   X-Forwarded-For) — also per `docker exec` im Container oder vom Host bei
   lokal gebundenem Port. Begründung in docs/BETRIEB-UEBERWACHUNG.md.

   Prüfungen:
     sperre      Raumsperre ohne hängende Arbeit, kein Schreibstopp  → kritisch
     ablage      Probe schreiben, zurücklesen, löschen in <Daten>/.gesund
                 (keine Kundendaten, keine Raumsperre, kein Store)       → kritisch
     platz       freier Platz unter CENTRIC_DATEN — Warn-/Kritisch-Schwelle;
                 kritisch alarmiert als kritisch, nach außen aber „warnung“
     sicherung   Alter der letzten erfolgreichen Sicherung (WP-04), wenn
                 CENTRIC_SICHERUNG_STATUS auf deren Statusdatei zeigt  → warnung
     loeschlauf  letzter Lauf des Löschlaufs (aufraeumen:letzter)      → warnung
     fehler      gleitende Fehlerzählung (gesund-zaehler.mjs)          → warnung

   Ergebnisse werden CACHE_MS lang wiederverwendet — /gesund ist
   anmeldefrei, und ein Ansturm soll nicht je Anfrage eine Probe schreiben.
   ========================================================================== */

import { statfs, readFile, writeFile, mkdir, unlink, open, readdir, stat } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { getStore, ablageWurzel } from "./ablage.mjs";
import { sperrZustand } from "./raumsperre.mjs";
import { zaehlung, FENSTER_MS } from "./gesund-zaehler.mjs";

export const STUFEN = ["ok", "warnung", "kritisch"];
const rang = (s) => STUFEN.indexOf(s);
const schlimmer = (a, b) => (rang(a) >= rang(b) ? a : b);

const zahl = (name, vorgabe) => {
  const w = Number(process.env[name]);
  return Number.isFinite(w) && w >= 0 ? w : vorgabe;
};

/** Grenzwerte — alle über die Umgebung einstellbar. */
export function grenzwerte() {
  return {
    platzWarnungProzent: zahl("CENTRIC_GESUND_PLATZ_WARNUNG_PROZENT", 15),
    platzKritischProzent: zahl("CENTRIC_GESUND_PLATZ_KRITISCH_PROZENT", 3),
    platzKritischMb: zahl("CENTRIC_GESUND_PLATZ_KRITISCH_MB", 200),
    sicherungWarnungStunden: zahl("CENTRIC_GESUND_SICHERUNG_WARNUNG_STUNDEN", 26),
    loeschlaufWarnungStunden: zahl("CENTRIC_GESUND_LOESCHLAUF_WARNUNG_STUNDEN", 26),
    fehler5xxWarnung: zahl("CENTRIC_GESUND_5XX_WARNUNG", 10),
    cacheMs: zahl("CENTRIC_GESUND_CACHE_MS", 10000),
    zeitgrenzeMs: zahl("CENTRIC_GESUND_ZEITGRENZE_MS", 15000),
  };
}

const START = Date.now();

/* ------------------------------------------------------------------ */

/* Die Probe liegt in <CENTRIC_DATEN>/.gesund/ — einem Punkt-Ordner, kein
   Store. Ältere und neue Fassungen von werkzeug/ablage-sicherung.mjs
   überspringen Punkt-Einträge im Wurzelverzeichnis; ein neuer Store-Ordner
   hätte die Sicherung eines älteren Bildes abbrechen lassen (Review M2).
   Je Lauf ein eigener Dateiname (schreiben, synchronisieren, zurücklesen,
   löschen): Parallele Läufe stören sich nicht (Review H1). */
const PROBE_ORDNER = () => path.join(ablageWurzel(), ".gesund");

async function ablageEinmal() {
  const marke = randomBytes(12).toString("hex");
  const datei = path.join(PROBE_ORDNER(), `probe-${marke}.json`);
  try {
    await mkdir(PROBE_ORDNER(), { recursive: true, mode: 0o700 });
    await writeFile(datei, JSON.stringify({ marke }), { mode: 0o600 });
    const h = await open(datei, "r+");
    try { await h.sync(); } finally { await h.close(); }
    const zurueck = JSON.parse(await readFile(datei, "utf8"));
    if (!zurueck || zurueck.marke !== marke) return { stufe: "kritisch", text: "Probe nicht zurückgelesen" };
    return { stufe: "ok" };
  } catch (e) {
    return { stufe: "kritisch", text: `Probe gescheitert (${String(e && /** @type {any} */ (e).code || "Fehler")})` };
  } finally {
    await unlink(datei).catch(() => {});
  }
}

/** Proben, die ein abgebrochener Lauf liegen ließ (Absturz zwischen
    Schreiben und Löschen), nach einer Stunde entfernen (WP-05b R3). */
const PROBE_ALT_MS = 60 * 60 * 1000;
async function probenAufraeumen(jetzt = Date.now()) {
  let namen;
  try { namen = await readdir(PROBE_ORDNER()); } catch { return; }
  for (const n of namen) {
    if (!/^probe-[0-9a-f]+\.json$/.test(n)) continue;
    const d = path.join(PROBE_ORDNER(), n);
    try { if (jetzt - (await stat(d)).mtimeMs > PROBE_ALT_MS) await unlink(d); } catch { /* nächstes Mal */ }
  }
}

/** Einmal wiederholen, bevor „kritisch“ gilt — ein einzelner Ausreißer soll
    nicht 10 s lang als kritisch zwischengespeichert werden. */
async function ablagePruefen() {
  await probenAufraeumen();
  const erst = await ablageEinmal();
  return erst.stufe === "ok" ? erst : ablageEinmal();
}

async function platzPruefen(g) {
  try {
    const s = await statfs(ablageWurzel());
    const frei = Number(s.bavail) * Number(s.bsize);
    const gesamt = Number(s.blocks) * Number(s.bsize);
    const prozent = gesamt > 0 ? (frei / gesamt) * 100 : 0;
    const mb = Math.floor(frei / 1048576);
    const werte = { freiMb: mb, freiProzent: Math.round(prozent * 10) / 10 };
    if (prozent < g.platzKritischProzent || mb < g.platzKritischMb) return { stufe: "kritisch", ...werte };
    if (prozent < g.platzWarnungProzent) return { stufe: "warnung", ...werte };
    return { stufe: "ok", ...werte };
  } catch {
    return { stufe: "warnung", text: "freier Platz nicht ermittelbar" };
  }
}

async function sicherungPruefen(g, jetzt) {
  const datei = (process.env.CENTRIC_SICHERUNG_STATUS || "").trim();
  if (!datei) return { stufe: "ok", text: "nicht eingerichtet (CENTRIC_SICHERUNG_STATUS)" };
  try {
    const st = JSON.parse(await readFile(datei, "utf8"));
    const zeit = Date.parse(st && st.zeit);
    if (!Number.isFinite(zeit)) return { stufe: "warnung", text: "Statusdatei ohne Zeit" };
    const stunden = Math.round(((jetzt - zeit) / 3600000) * 10) / 10;
    return { stufe: stunden > g.sicherungWarnungStunden ? "warnung" : "ok", alterStunden: stunden };
  } catch {
    return { stufe: "warnung", text: "Statusdatei nicht lesbar" };
  }
}

async function loeschlaufPruefen(g, jetzt) {
  if ((process.env.CENTRIC_AUFRAEUMEN || "an").trim().toLowerCase() === "aus")
    return { stufe: "ok", text: "abgeschaltet" };
  let v;
  try { v = await getStore({ name: "centric", consistency: "strong" }).get("aufraeumen:letzter", { type: "json" }); }
  catch { return { stufe: "warnung", text: "Vermerk nicht lesbar" }; }
  const zeit = v && Date.parse(v.zeit);
  /* Der erste Lauf kommt eine Minute nach dem Start; vorher ist „keiner“
     kein Befund. */
  if (!Number.isFinite(zeit)) {
    const laeuftStunden = (jetzt - START) / 3600000;
    return { stufe: laeuftStunden > g.loeschlaufWarnungStunden ? "warnung" : "ok", text: "noch kein Lauf" };
  }
  const stunden = Math.round(((jetzt - zeit) / 3600000) * 10) / 10;
  const fehler = Array.isArray(v.fehler) ? v.fehler.length : 0;
  return { stufe: stunden > g.loeschlaufWarnungStunden || fehler > 0 ? "warnung" : "ok",
    alterStunden: stunden, fehler };
}

function fehlerPruefen(g, jetzt) {
  const z = zaehlung(jetzt);
  const warn = z["5xx"] >= g.fehler5xxWarnung || z.unlesbar > 0 || z["bremse-ausfall"] > 0 || z.journal > 0;
  return { stufe: warn ? "warnung" : "ok", fensterMinuten: FENSTER_MS / 60000, ...z };
}

/* ------------------------------------------------------------------ */

let letzte = null;
/** Die gerade laufende Prüfung — alle gleichzeitigen Aufrufer teilen sie
    (single-flight, Review H1), auch die mit frisch = true. */
let laufend = null;

/**
 * Alle Prüfungen. Ergebnis: { stufe, pruefungen: { name: {stufe, …} } }.
 * Zwischengespeichert für cacheMs (frisch = true erzwingt eine neue Prüfung,
 * teilt aber eine schon laufende).
 */
export async function zustand({ jetzt = Date.now(), frisch = false } = {}) {
  const g = grenzwerte();
  if (!frisch && letzte && jetzt - letzte.zeit < g.cacheMs) return letzte.ergebnis;
  if (laufend) return laufend;
  laufend = mitZeitgrenze(g, jetzt).finally(() => { laufend = null; });
  return laufend;
}

/* Zeitgrenze (WP-05b R2): Hängt das Dateisystem, hinge sonst jede Prüfung —
   und mit ihr der Alarmtakt, der gerade dann alarmieren soll. Nach
   zeitgrenzeMs gilt die Ablage als kritisch („Zeitgrenze“); das geteilte
   Promise ist danach frei. Die hängende Prüfung selbst läuft im Hintergrund
   weiter; solange sie hängt, wird keine zweite gestartet (kein Aufstauen),
   jede weitere Anfrage bekommt nach der Zeitgrenze dieselbe Antwort. */
/** @type {Promise<any>|null} */
let innen = null;
/** Nur für Prüfungen: wird vor den Prüfungen abgewartet. */
export const pruefHaken = { vorher: /** @type {null|(() => Promise<void>)} */ (null) };

function zeitgrenzeErgebnis(jetzt) {
  return { stufe: "kritisch", zeit: new Date(jetzt).toISOString(),
    pruefungen: { ablage: { stufe: "kritisch", text: "Zeitgrenze" } } };
}

function mitZeitgrenze(g, jetzt) {
  if (!innen) {
    innen = (async () => {
      if (pruefHaken.vorher) await pruefHaken.vorher();
      return pruefenAlle(g, jetzt);
    })().finally(() => { innen = null; });
  }
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let uhr;
  const grenze = new Promise((fertig) => {
    uhr = setTimeout(() => fertig(zeitgrenzeErgebnis(jetzt)), g.zeitgrenzeMs);
  });
  return Promise.race([innen, grenze]).finally(() => clearTimeout(uhr));
}

async function pruefenAlle(g, jetzt) {
  const sp = sperrZustand();
  const pruefungen = {
    sperre: sp.gesund ? { stufe: "ok" }
      : { stufe: "kritisch", haengend: sp.haengend.length, schreibstopp: !!sp.gestoppt },
    ablage: await ablagePruefen(),
    platz: await platzPruefen(g),
    sicherung: await sicherungPruefen(g, jetzt),
    loeschlauf: await loeschlaufPruefen(g, jetzt),
    fehler: fehlerPruefen(g, jetzt),
  };
  const stufe = Object.values(pruefungen).reduce((a, p) => schlimmer(a, p.stufe), "ok");
  const ergebnis = { stufe, pruefungen, zeit: new Date(jetzt).toISOString() };
  letzte = { zeit: jetzt, ergebnis };
  return ergebnis;
}

/** Nur für Prüfungen. */
export function zustandVergessen() { letzte = null; }

/** Prüfungen, deren „kritisch“ den Dienst wirklich stört — nur sie machen
    /gesund 503 und den Container unhealthy (Review N1). Eine kritisch volle
    Platte alarmiert als „kritisch“, nach außen aber „warnung“ mit 200: ein
    Neustart schafft keinen Platz, und ein R0 im Deploy wäre die falsche
    Antwort darauf. */
const STOERT_DIENST = ["sperre", "ablage"];

/** Was nach außen geht: nur die Stufe. HTTP 503 nur bei kritischer Sperre oder Ablage. */
export function oeffentlich(ergebnis) {
  const p = ergebnis.pruefungen || {};
  const dienstKritisch = STOERT_DIENST.some((n) => p[n] && p[n].stufe === "kritisch");
  if (dienstKritisch) return { status: 503, inhalt: { status: "kritisch" } };
  return { status: 200, inhalt: { status: ergebnis.stufe === "ok" ? "ok" : "warnung" } };
}

/** Darf diese Anfrage die Einzelheiten sehen? Nur direkt von der eigenen Maschine. */
export function detailErlaubt(gegenstelle, koepfe) {
  if (koepfe && (koepfe["x-forwarded-for"] || koepfe["forwarded"])) return false;
  const a = String(gegenstelle || "");
  return a === "127.0.0.1" || a === "::1" || a === "::ffff:127.0.0.1";
}

/* --------------------------------------------------------------------------
   ALARM

   Vorgabe AUS. Ein Kanal wird erst mit CENTRIC_ALARM_WEBHOOK (https-URL)
   aktiv; welcher Dienst dahinter steht (Mail-Brücke, Chat, Pager), ist
   Entscheidung des Betreibers (WP-30/WP-04). Gesendet wird JSON:
     {"dienst":"CENTRIC","stufe":"warnung","betroffen":["platz"],
      "zeit":"…","art":"alarm"|"entwarnung"}
   Keine personenbezogenen Daten, keine Raumnamen, keine Fehlertexte.

   Entprellung: Eine Stufe über „ok“ muss ENTPRELLUNG_MS lang anhalten, bevor
   alarmiert wird; ebenso die Rückkehr zu „ok“ vor der Entwarnung. Eine
   Verschärfung (warnung → kritisch) alarmiert nach derselben Frist erneut.
   Bleibt es schlecht, wird nach WIEDERHOLUNG_MS erinnert.
   Mit Takt 60 s und Entprellung 120 s liegt ein Alarm höchstens ~3 min
   nach Eintritt beim Kanal — unter den geforderten 5 Minuten.
   -------------------------------------------------------------------------- */

export function alarmEinstellungen() {
  return {
    webhook: (process.env.CENTRIC_ALARM_WEBHOOK || "").trim(),
    entprellungMs: zahl("CENTRIC_ALARM_ENTPRELLUNG_S", 120) * 1000,
    wiederholungMs: zahl("CENTRIC_ALARM_WIEDERHOLUNG_S", 6 * 3600) * 1000,
    taktMs: zahl("CENTRIC_GESUND_TAKT_S", 60) * 1000,
  };
}

/**
 * Zustandsmaschine des Alarms — rein, ohne Netz. `senden` wird mit der
 * Nachricht aufgerufen, wenn alarmiert werden soll.
 */
export function alarmGeber({ entprellungMs, wiederholungMs, senden }) {
  /* Entprellt wird „ok“ gegen „nicht ok“, nicht die genaue Stufe — sonst
     gäbe ein Pendeln warnung ↔ kritisch nie einen Alarm (Review M1).
     Gemeldet wird die schlimmste Stufe der laufenden Störung.

     Hysterese (WP-05b R1): Eine Störung beginnt mit der ersten schlechten
     Messung und endet erst, wenn „ok“ entprellungMs lang ununterbrochen
     anhält. Ein kurzes „ok“ setzt die Entprellung also nicht zurück —
     sonst gäbe ein Pendeln ok ↔ kritisch nie einen Alarm. Alarmiert wird,
     wenn die Störung entprellungMs alt ist UND die aktuelle Messung schlecht
     ist; ein einzelner Ausreißer, auf den nur noch „ok“ folgt, alarmiert
     nicht. */
  let gemeldet = "ok";          // zuletzt gesendete Stufe
  let gemeldetUm = 0;
  let stoerungSeit = null;      // Beginn der laufenden Störung (oder null)
  let okSeit = null;            // seit wann ununterbrochen „ok“ (in einer Störung)
  let schlimmste = "ok";        // schlimmste Stufe seit Beginn der Störung
  /** @type {Set<string>} */
  let betroffenAlle = new Set();

  return {
    /** @param {{stufe: string, pruefungen: Record<string, {stufe: string}>}} e */
    async beobachten(e, jetzt = Date.now()) {
      const schlecht = e.stufe !== "ok";
      if (schlecht) {
        if (stoerungSeit === null) { stoerungSeit = jetzt; schlimmste = "ok"; betroffenAlle = new Set(); }
        okSeit = null;
        schlimmste = schlimmer(schlimmste, e.stufe);
        for (const [n, p] of Object.entries(e.pruefungen || {})) if (p.stufe !== "ok") betroffenAlle.add(n);
      } else if (stoerungSeit !== null) {
        if (okSeit === null) okSeit = jetzt;
        if (jetzt - okSeit >= entprellungMs) stoerungSeit = null;   // erholt
      }
      const nachricht = (art, stufe) => ({ dienst: "CENTRIC", art, stufe,
        betroffen: art === "entwarnung" ? [] : [...betroffenAlle].sort(), zeit: new Date(jetzt).toISOString() });
      const gestoert = stoerungSeit !== null && jetzt - stoerungSeit >= entprellungMs && schlecht;
      if (gestoert && rang(schlimmste) > rang(gemeldet)) {
        gemeldet = schlimmste; gemeldetUm = jetzt;
        await senden(nachricht("alarm", schlimmste));
        return "alarm";
      }
      if (stoerungSeit === null && gemeldet !== "ok") {
        gemeldet = "ok"; gemeldetUm = jetzt;
        await senden(nachricht("entwarnung", "ok"));
        return "entwarnung";
      }
      if (gestoert && gemeldet !== "ok" && jetzt - gemeldetUm >= wiederholungMs) {
        gemeldetUm = jetzt;
        await senden(nachricht("erinnerung", gemeldet));
        return "erinnerung";
      }
      return null;
    },
  };
}

/** Webhook-Sender: POST JSON, 10 s Zeitgrenze, Fehler werden nur geloggt. */
export function webhookSender(url) {
  return async (nachricht) => {
    try {
      /* redirect: "error" (Review N2) — ein Alarm folgt keiner Umleitung zu
         einem anderen Ziel. */
      const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify(nachricht), redirect: "error", signal: AbortSignal.timeout(10000) });
      if (!r.ok) console.error(`Alarm: Webhook antwortete ${r.status}`);
    } catch (e) {
      console.error(`Alarm: Webhook nicht erreichbar (${e && /** @type {any} */ (e).name || "Fehler"})`);
    }
  };
}

/**
 * Startet die regelmäßige Prüfung mit Alarm (server.mjs). Ohne Webhook wird
 * nur geprüft und eine Stufe über „ok“ im Log vermerkt — kein Versand.
 */
export function ueberwachungStarten() {
  const a = alarmEinstellungen();
  const kanalAn = /^https:\/\//i.test(a.webhook);
  if (a.webhook && !kanalAn) console.error("Alarm: CENTRIC_ALARM_WEBHOOK muss mit https:// beginnen — Kanal aus.");
  const senden = kanalAn ? webhookSender(a.webhook)
    : async (n) => { console.warn(`Zustand: ${n.art} ${n.stufe} (${n.betroffen.join(", ") || "—"}) — kein Alarmkanal eingerichtet`); };
  const geber = alarmGeber({ entprellungMs: a.entprellungMs, wiederholungMs: a.wiederholungMs, senden });
  const takt = async () => {
    try { await geber.beobachten(await zustand({ frisch: true })); }
    catch (e) { console.error("Zustandsprüfung fehlgeschlagen:", e && /** @type {any} */ (e).message || e); }
  };
  const t = setInterval(takt, a.taktMs);
  t.unref();
  console.log(`Überwachung: Prüfung alle ${a.taktMs / 1000} s, Alarmkanal ${kanalAn ? "Webhook" : "aus"}`);
  return () => clearInterval(t);
}
