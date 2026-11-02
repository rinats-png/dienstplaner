/* ==========================================================================
   /gesund — ZUSTAND DES DIENSTES UND ALARM (WP-05)

   Bis WP-05 sagte /gesund nur: Prozess läuft, Raumsperre frei, kein
   Schreibstopp. Eine volle Platte, eine Ablage, in die nichts mehr geht,
   eine Sicherung, die seit einer Woche fehlt — davon erfuhr niemand.

   Drei Stufen:
     ok        alles in Ordnung
     warnung   Aufmerksamkeit nötig, der Dienst arbeitet (HTTP 200)
     kritisch  der Dienst arbeitet nicht verlässlich (HTTP 503)
   Nur „kritisch“ macht den Container unhealthy. Eine knappe Platte, eine
   alte Sicherung oder gehäufte Fehler sind Warnungen — ein Neustart hilft
   gegen keines davon, und eine Neustart-Schleife machte es schlimmer.

   Nach außen (anmeldefrei, über Caddy) steht nur die Stufe:
     {"status":"ok"} · {"status":"warnung"} · {"status":"kritisch"}
   Keine Pfade, Raumnamen, Versionen, Zahlen oder Fehlermeldungen.
   Die Einzelheiten (?detail=1) gibt es nur für Anfragen, die direkt von
   der eigenen Maschine kommen (Gegenstelle 127.0.0.1/::1, kein
   X-Forwarded-For) — also per `docker exec` im Container oder vom Host bei
   lokal gebundenem Port. Begründung in docs/BETRIEB-UEBERWACHUNG.md.

   Prüfungen:
     sperre      Raumsperre ohne hängende Arbeit, kein Schreibstopp  → kritisch
     ablage      Probe schreiben und lesen im eigenen Store
                 „centric-gesund“ (keine Kundendaten, keine Raumsperre)  → kritisch
     platz       freier Platz unter CENTRIC_DATEN — Warn-/Kritisch-Schwelle
     sicherung   Alter der letzten erfolgreichen Sicherung (WP-04), wenn
                 CENTRIC_SICHERUNG_STATUS auf deren Statusdatei zeigt  → warnung
     loeschlauf  letzter Lauf des Löschlaufs (aufraeumen:letzter)      → warnung
     fehler      gleitende Fehlerzählung (gesund-zaehler.mjs)          → warnung

   Ergebnisse werden CACHE_MS lang wiederverwendet — /gesund ist
   anmeldefrei, und ein Ansturm soll nicht je Anfrage eine Probe schreiben.
   ========================================================================== */

import { statfs, readFile } from "node:fs/promises";
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
  };
}

const START = Date.now();

/* ------------------------------------------------------------------ */

async function ablagePruefen() {
  try {
    const s = getStore({ name: "centric-gesund", consistency: "strong" });
    const wert = { zeit: Date.now(), zufall: Math.random() };
    await s.setJSON("probe", wert);
    const zurueck = await s.get("probe", { type: "json" });
    if (!zurueck || zurueck.zufall !== wert.zufall) return { stufe: "kritisch", text: "Probe nicht zurückgelesen" };
    return { stufe: "ok" };
  } catch (e) {
    return { stufe: "kritisch", text: `Probe gescheitert (${String(e && /** @type {any} */ (e).code || "Fehler")})` };
  }
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

/**
 * Alle Prüfungen. Ergebnis: { stufe, pruefungen: { name: {stufe, …} } }.
 * Zwischengespeichert für cacheMs (frisch = true erzwingt eine neue Prüfung).
 */
export async function zustand({ jetzt = Date.now(), frisch = false } = {}) {
  const g = grenzwerte();
  if (!frisch && letzte && jetzt - letzte.zeit < g.cacheMs) return letzte.ergebnis;
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

/** Was nach außen geht: nur die Stufe. HTTP 503 nur bei kritisch. */
export function oeffentlich(ergebnis) {
  return { status: ergebnis.stufe === "kritisch" ? 503 : 200, inhalt: { status: ergebnis.stufe } };
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
  let gemeldet = "ok";          // was zuletzt gesendet wurde
  let gemeldetUm = 0;
  let kandidat = "ok";          // was gerade beobachtet wird
  let seit = 0;

  return {
    /** @param {{stufe: string, pruefungen: Record<string, {stufe: string}>}} e */
    async beobachten(e, jetzt = Date.now()) {
      if (e.stufe !== kandidat) { kandidat = e.stufe; seit = jetzt; }
      const stabil = jetzt - seit >= entprellungMs;
      const betroffen = Object.entries(e.pruefungen || {})
        .filter(([, p]) => p.stufe !== "ok").map(([n]) => n).sort();
      const nachricht = (art) => ({ dienst: "CENTRIC", art, stufe: kandidat, betroffen,
        zeit: new Date(jetzt).toISOString() });
      if (stabil && kandidat !== gemeldet) {
        const art = kandidat === "ok" ? "entwarnung" : "alarm";
        gemeldet = kandidat; gemeldetUm = jetzt;
        await senden(nachricht(art));
        return art;
      }
      if (stabil && gemeldet !== "ok" && jetzt - gemeldetUm >= wiederholungMs) {
        gemeldetUm = jetzt;
        await senden(nachricht("erinnerung"));
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
      const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify(nachricht), signal: AbortSignal.timeout(10000) });
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
