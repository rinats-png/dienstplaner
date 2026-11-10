/* ==========================================================================
   KONTOWIEDERHERSTELLUNG — VERLUSTFALL MIT VIER-AUGEN-FREIGABE (WR-3)

   Wer Gerät UND Wiederherstellungscodes verloren hat, kommt nicht mit einem
   Code allein wieder hinein. Der Weg (docs/acc45/KONTO-WIEDERHERSTELLUNG.md,
   Abschnitte E und J; Entscheidungen 1 bis 4 vom 2026-11-09):

     offen ──1. Freigabe──▶ teilfreigegeben ──2. Freigabe──▶ freigegeben ──Einlösen──▶ eingeloest
       │                        │                               │
       ├─ Ablehnung ──▶ abgelehnt                               │
       ├─ 24 h ab Eröffnung ──▶ abgelaufen ◀── Token 15 min ────┘
       └─ Rückzug ──▶ zurueckgezogen (jederzeit vor dem Einlösen)

   Diese Datei ist die Freigabemechanik selbst — ohne HTTP, ohne Wissen
   darüber, woher Träger und Freigebende kommen. Sie wird vom Zugangscode-Weg
   (kontowiederherstellung-zugang.mjs) benutzt und ist für OPT-2
   (nachträglicher Faktor für bestehende Leitungskonten) und das
   Offline-Werkzeug (WR-4) gedacht. Was sie festhält:

   - Antrag höchstens 24 h offen (ANTRAG_FRIST_MS), gemessen ab Eröffnung —
     auch die Frist des Tokens endet spätestens dort.
   - Abschlusstoken 15 min (TOKEN_FRIST_MS), 256 bit, gespeichert nur als
     SHA-256, gebunden an Fall, Träger und Faktorzustand, genau einmal.
   - Zwei Freigaben von zwei verschiedenen Freigebenden: verschiedene
     Kennung UND verschiedene Person; ohne Person keine Freigabe.
   - Freigebende nur mit Rolle `leitung`, im selben Raum, Mandanten und
     Betrieb wie der Fall; nie Träger oder Antragsteller (auch nicht über ein
     zweites Konto derselben Person).
   - Einheitsregel: zwei Freigebende mit gleichem nicht-leerem Einheitswert
     sind nicht unabhängig; betriebsweit (`null`, „ALLE") zählt nicht.
   - Bei jeder weiteren Freigabe werden die bisherigen Freigebenden neu
     geprüft (Rückruf des Aufrufers); wer seine Berechtigung verloren hat,
     dessen Freigabe verfällt.
   - Mandantentrennung: Ein fremder, unbekannter, abgelaufener oder
     unzulässiger Fall ergibt dasselbe „nein" — keine Auskunft über Existenz.
   - Endzustände sind unveränderlich.

   Zeit. Alle Fristen sind absolute Zeitpunkte (Millisekunden der Serveruhr),
   gespeichert beim Entstehen; eine zurückgespielte Ablage verlängert nichts.
   Geht die Uhr um mehr als UHR_TOLERANZ_MS hinter den Beginn zurück, gilt der
   Fall als abgelaufen (fail-closed) — eine zurückgestellte Uhr verlängert
   keine Frist.

   Sicherungsstände. Fälle liegen in der gesicherten Ablage. Damit eine
   zurückgespielte Sicherung keinen abgelaufenen, eingelösten oder
   abgelehnten Fall wiederbelebt, trägt jeder Fall die Schlüsselepoche
   (zweifaktor.mjs, faktorEpoche; liegt außerhalb der Ablage und wechselt mit
   jeder erkannten Wiederherstellung). Ein Fall aus einer anderen Epoche gilt
   als abgelaufen; ist die Epoche nicht feststellbar, geschieht nichts.

   Gleichzeitigkeit. Alles, was einen Fall ändert, läuft unter einer Sperre
   je Träger (eine Reihe im Prozess, wie zweifaktor.mjs; Grenze H1 dort:
   genau ein Prozess je Ablage). Gelesen wird darin frisch, geprüft, dann
   geschrieben; erst nach dem Schreiben gibt es ein Ja. Ein Schreibfehler
   geht an den Aufrufer (503), der Fall bleibt, wie er war.

   Keine Hintertür. Es gibt hier keinen Betreiberweg, keine Ersatzfreigabe
   durch Zeitablauf und keinen Übergang, der ohne zwei Freigaben zu einem
   Token führt. Ein Token allein ergibt nie eine Sitzung: Das Einlösen
   bewirkt nur, was der Aufrufer als `wirkung` übergibt (Zugangscode-Weg:
   eine neue AUSSTEHENDE Einrichtung des Faktors).
   ========================================================================== */

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { vorgang } from "./schreibhalt.mjs";
import { faktorEpoche, WIEDERHERSTELLUNG_ALPHABET } from "./zweifaktor.mjs";

/** Ein Antrag ist höchstens so lange offen (ab Eröffnung). */
export const ANTRAG_FRIST_MS = 24 * 60 * 60 * 1000;
/** Ein Abschlusstoken gilt höchstens so lange (ab der zweiten Freigabe, nie über ANTRAG_FRIST_MS hinaus). */
export const TOKEN_FRIST_MS = 15 * 60 * 1000;
/** Nach einer Ablehnung beginnt für denselben Träger frühestens so viel später ein neuer Fall. */
export const SPERRE_NACH_ABLEHNUNG_MS = 24 * 60 * 60 * 1000;
/** So weit darf die Uhr hinter einen gespeicherten Zeitpunkt zurückgehen, bevor der Fall als abgelaufen gilt. */
export const UHR_TOLERANZ_MS = 5 * 1000;
/** Zwei Freigaben, zwei verschiedene Freigebende (Entscheidung 1). */
export const FREIGABEN_NOETIG = 2;
/** Die einzige Rolle, die freigeben oder ablehnen darf (Entscheidung I.1). */
export const FREIGABE_ROLLE = "leitung";
/** Wie die Identität geprüft wurde — Pflichtangabe jeder Freigabe, feste Liste (I.3). */
export const VERFAHREN = Object.freeze(["persoenlich", "rueckruf", "schriftlich"]);
/** Gründe einer Ablehnung — feste Liste, kein Freitext (J.3). */
export const ABLEHNUNGSGRUENDE = Object.freeze(["identitaet-zweifelhaft", "nicht-veranlasst", "sonstiges"]);
/** Aktenzeichen der Identitätsprüfung (Verweis auf eine externe Akte, keine Personendaten). */
export const AKTENZEICHEN_MUSTER = /^[A-Za-z0-9._/-]{1,40}$/;

/** Zustände, die noch etwas bewirken können. */
const LAUFEND = Object.freeze(["offen", "teilfreigegeben", "freigegeben"]);
/** Endzustände — unveränderlich. */
export const ENDZUSTAENDE = Object.freeze(["eingeloest", "abgelehnt", "abgelaufen", "zurueckgezogen"]);

const FALL_LAENGE = 16;
export const FALL_MUSTER = new RegExp(`^F-[${WIEDERHERSTELLUNG_ALPHABET}]{${FALL_LAENGE}}$`);
const FALL = (f) => `verlustfall:${f}`;
const TRAEGER = (id) => `verlustfall-traeger:${id}`;

/** Eine neue Fallkennung: 80 bit, gleichverteilt (5-Bit-Gruppen wie die Wiederherstellungscodes). */
export function fallKennungNeu() {
  const b = randomBytes(FALL_LAENGE);
  let s = "";
  for (const x of b) s += WIEDERHERSTELLUNG_ALPHABET[x & 31];
  return `F-${s}`;
}

/** Eingabe einer Fallkennung normieren; ungültig: null. */
export function fallKennungLesen(text) {
  const s = String(text ?? "").trim().toUpperCase();
  return FALL_MUSTER.test(s) ? s : null;
}

/** Prüfsumme des Tokens, gebunden an Fall, Träger und Faktorzustand. */
const tokenHash = (fall, traegerId, faktorKennung, token) =>
  createHash("sha256").update(`verlust-token|${fall}|${traegerId}|${faktorKennung}|${String(token)}`).digest();

/* --------------------------------------------------------------------------
   Sperre je Träger
   -------------------------------------------------------------------------- */

/** @type {Map<string, Promise<any>>} */
const sperren = new Map();
/** @template T @param {string} id @param {() => Promise<T>} arbeit @returns {Promise<T>} */
function unterSperre(id, arbeit) {
  return vorgang(() => unterSperreInReihe(id, arbeit));
}
/** @template T @param {string} id @param {() => Promise<T>} arbeit @returns {Promise<T>} */
async function unterSperreInReihe(id, arbeit) {
  const vorher = sperren.get(id) || Promise.resolve();
  /** @type {(v?: any) => void} */
  let frei = () => {};
  const meins = new Promise((r) => { frei = r; });
  const kette = vorher.then(() => meins);
  sperren.set(id, kette);
  await vorher;
  try { return await arbeit(); }
  finally { frei(); if (sperren.get(id) === kette) sperren.delete(id); }
}

/* --------------------------------------------------------------------------
   Zustand und Fristen
   -------------------------------------------------------------------------- */

/** Ist ein Zeitpunkt t0 (ms) noch vor seiner Frist? Eine zurückgegangene Uhr zählt als abgelaufen. */
const innerhalb = (t0, dauer, ms) => Number.isFinite(t0) && ms >= t0 - UHR_TOLERANZ_MS && ms < t0 + dauer;

/**
 * Der wirksame Zustand eines Falls jetzt: Endzustand, wie gespeichert; laufend, aber Frist vorbei, Uhr
 * zurückgestellt, Epoche fremd oder Fall unstimmig: „abgelaufen".
 * @param {any} f
 * @param {number} ms
 * @param {{gebunden: boolean, epoche?: string|null}} ep
 */
export function wirksamerStand(f, ms, ep) {
  if (!f || typeof f !== "object" || typeof f.stand !== "string") return "abgelaufen";
  if (ENDZUSTAENDE.includes(f.stand)) return f.stand;
  if (!LAUFEND.includes(f.stand)) return "abgelaufen";
  if (ep.gebunden && (!ep.epoche || f.epoche !== ep.epoche)) return "abgelaufen";
  if (!innerhalb(f.eroeffnetMs, ANTRAG_FRIST_MS, ms)) return "abgelaufen";
  if (f.stand === "freigegeben") {
    if (!f.token || !innerhalb(f.token.ausgestelltMs, TOKEN_FRIST_MS, ms) || !(ms < f.token.bisMs)) return "abgelaufen";
  }
  return f.stand;
}

const einheitenVon = (x) => new Set((Array.isArray(x && x.einheiten) ? x.einheiten : [])
  .filter((e) => typeof e === "string" && e && e !== "ALLE"));

const leer = (v) => v === null || v === undefined || v === "";

/**
 * Ist dieser Freigebende für diesen Fall überhaupt zulässig (ohne Blick auf andere Freigebende)?
 * Reine Regel, ohne Ablage. Gibt den internen Grund zurück (nie nach außen), oder null.
 * @param {any} f  der Fall
 * @param {any} w  der Freigebende {kennung, schluessel, person, raum, mandantId, betrieb, rolle, einheiten}
 */
export function freigebenderUnzulaessig(f, w) {
  if (!f || !w) return "fehlt";
  const t = f.traeger || {};
  if (leer(w.raum) || leer(w.mandantId) || w.raum !== t.raum || w.mandantId !== t.mandantId
    || Number(w.betrieb ?? 0) !== Number(t.betrieb ?? 0)) return "mandant";
  if (w.rolle !== FREIGABE_ROLLE) return "rolle";
  if (leer(w.person) || leer(w.kennung)) return "ohne-person";
  if (w.kennung === t.kennung || (w.schluessel && w.schluessel === t.schluessel)
    || String(w.person) === String(t.person)) return "selbst";
  const a = f.antragsteller || {};
  if (w.kennung === a.kennung || String(w.person) === String(a.person)) return "antragsteller";
  return null;
}

/**
 * Sind zwei Freigebende voneinander unabhängig? Verschiedene Kennung, verschiedene Person, keine gemeinsame
 * nicht-leere Einheit (Entscheidung I.2). Gibt den internen Grund zurück oder null.
 * @param {any} a @param {any} b
 */
export function nichtUnabhaengig(a, b) {
  if (a.kennung === b.kennung || (a.schluessel && a.schluessel === b.schluessel)) return "gleiches-konto";
  if (String(a.person) === String(b.person)) return "gleiche-person";
  const ea = einheitenVon(a);
  for (const e of einheitenVon(b)) if (ea.has(e)) return "gleiche-einheit";
  return null;
}

/* --------------------------------------------------------------------------
   Lesen
   -------------------------------------------------------------------------- */

async function fallLesen(store, fall) {
  const k = fallKennungLesen(fall);
  if (!k) return null;
  const f = await store.get(FALL(k), { type: "json" });
  return f && f.fall === k ? f : null;
}

async function fallDesTraegers(store, traegerId) {
  const z = await store.get(TRAEGER(traegerId), { type: "json" });
  if (!z || typeof z.fall !== "string") return null;
  const f = await fallLesen(store, z.fall);
  return f && f.traeger && f.traeger.id === traegerId ? f : null;
}

/**
 * Der laufende Fall eines Trägers, falls es einen gibt (offen, teilfreigegeben oder freigegeben, Frist und Epoche
 * gültig). Nur lesen. Ein Lesefehler wirft — der Aufrufer muss dann abweisen.
 * @returns {Promise<{fall: string, stand: string}|null>}
 */
export async function laufenderFall(store, traegerId, ms = Date.now()) {
  const f = await fallDesTraegers(store, traegerId);
  if (!f) return null;
  const st = wirksamerStand(f, ms, await faktorEpoche());
  return LAUFEND.includes(st) ? { fall: f.fall, stand: st } : null;
}

/** Ein abgelaufener, laufender Fall wird beim nächsten Anfassen unter der Sperre als „abgelaufen" festgeschrieben. */
async function ablaufFesthalten(store, f, ms, st) {
  if (st === "abgelaufen" && LAUFEND.includes(f.stand)) {
    await store.setJSON(FALL(f.fall), { ...f, stand: "abgelaufen", token: null, ende: new Date(ms).toISOString() });
  }
}

/* --------------------------------------------------------------------------
   Eröffnen
   -------------------------------------------------------------------------- */

/**
 * Einen Fall eröffnen. Der Antragsteller ist der Träger selbst (ein stellvertretender Antrag ist nicht gebaut).
 * @param {any} store
 * @param {{traeger: {id: string, kennung: string, schluessel?: string, person: string, raum: string,
 *   mandantId: string, betrieb: number, rolle: string}, faktorKennung: string|null, ms?: number}} a
 * @returns {Promise<{ok: true, fall: string, bisMs: number}|{ok: false, grund: string}>}
 */
export async function fallEroeffnen(store, { traeger, faktorKennung, ms = Date.now() }) {
  const t = traeger || /** @type {any} */ ({});
  if (leer(t.id) || leer(t.kennung) || leer(t.person) || leer(t.raum) || leer(t.mandantId))
    return { ok: false, grund: "traeger" };
  if (typeof faktorKennung !== "string" || !faktorKennung) return { ok: false, grund: "kein-faktor" };
  const ep = await faktorEpoche();
  if (ep.gebunden && !ep.epoche) return { ok: false, grund: "epoche" };
  return unterSperre(t.id, async () => {
    const alt = await fallDesTraegers(store, t.id);
    if (alt) {
      const st = wirksamerStand(alt, ms, ep);
      if (LAUFEND.includes(st)) return { ok: false, grund: "offen" };
      await ablaufFesthalten(store, alt, ms, st);
      /* Nach einer Ablehnung (in dieser Epoche) erst nach der Sperrfrist ein neuer Fall. */
      if (alt.stand === "abgelehnt" && (!ep.gebunden || alt.epoche === ep.epoche)
        && innerhalb(Date.parse(alt.ende), SPERRE_NACH_ABLEHNUNG_MS, ms)) return { ok: false, grund: "gesperrt" };
    }
    const fall = fallKennungNeu();
    const f = {
      v: 1, fall, stand: "offen",
      traeger: { id: t.id, kennung: t.kennung, schluessel: t.schluessel || null, person: String(t.person),
        raum: t.raum, mandantId: t.mandantId, betrieb: Number(t.betrieb ?? 0), rolle: t.rolle || null },
      antragsteller: { kennung: t.kennung, person: String(t.person) },
      faktorKennung,
      eroeffnet: new Date(ms).toISOString(), eroeffnetMs: ms,
      ...(ep.gebunden ? { epoche: ep.epoche } : {}),
      freigaben: [], token: null, ablehnung: null, ende: null,
    };
    /* Erst der Fall, dann der Verweis: Ohne Verweis ist ein Fall für den Träger nicht einlösbar. */
    await store.setJSON(FALL(fall), f);
    await store.setJSON(TRAEGER(t.id), { fall });
    return { ok: true, fall, bisMs: ms + ANTRAG_FRIST_MS };
  });
}

/* --------------------------------------------------------------------------
   Freigeben und Ablehnen
   -------------------------------------------------------------------------- */

/**
 * Freigeben. Der Aufrufer hat den Freigebenden VORHER vollständig authentifiziert (eigener erster Faktor und
 * frischer TOTP). `nochGueltig(freigabe)` prüft eine frühere Freigabe gegen den jetzigen Bestand (Rolle, Mandant,
 * aktiver Faktor, kein eigener Verlustfall …); ein Fehler darin wirft (→ 503, nichts geschrieben).
 * Antwort ohne Grund nach außen: `ok: false` heißt immer dasselbe.
 * @param {any} store
 * @param {{fall: string, freigebender: any, verfahren: string, aktenzeichen?: string|null, ms?: number,
 *   nochGueltig: (f: any) => Promise<boolean>}} a
 * @returns {Promise<{ok: true, stand: "teilfreigegeben"}|{ok: true, stand: "freigegeben", token: string, bisMs: number}
 *   |{ok: false, grund: string}>}
 */
export async function fallFreigeben(store, { fall, freigebender, verfahren, aktenzeichen = null, ms = Date.now(),
  nochGueltig }) {
  if (!VERFAHREN.includes(verfahren)) return { ok: false, grund: "verfahren" };
  if (aktenzeichen !== null && aktenzeichen !== undefined && !AKTENZEICHEN_MUSTER.test(String(aktenzeichen)))
    return { ok: false, grund: "aktenzeichen" };
  return fallAendern(store, fall, freigebender, ms, async (f) => {
    if (typeof nochGueltig !== "function") return { ok: false, grund: "pruefung" };
    /* J.2f: die bisherigen Freigaben neu prüfen; wer seine Berechtigung verloren hat, dessen Freigabe verfällt. */
    const bleiben = [];
    for (const fr of Array.isArray(f.freigaben) ? f.freigaben : []) {
      if (!freigebenderUnzulaessig(f, fr) && (await nochGueltig(fr)) === true) bleiben.push(fr);
    }
    for (const fr of bleiben) { if (nichtUnabhaengig(fr, freigebender)) return { ok: false, grund: "nicht-unabhaengig" }; }
    const neu = { kennung: freigebender.kennung, schluessel: freigebender.schluessel || null,
      person: String(freigebender.person), rolle: freigebender.rolle, raum: freigebender.raum,
      mandantId: freigebender.mandantId, betrieb: Number(freigebender.betrieb ?? 0),
      einheiten: [...einheitenVon(freigebender)], verfahren, ...(aktenzeichen ? { aktenzeichen: String(aktenzeichen) } : {}),
      zeit: new Date(ms).toISOString() };
    const freigaben = [...bleiben, neu];
    if (freigaben.length < FREIGABEN_NOETIG) {
      await store.setJSON(FALL(f.fall), { ...f, stand: "teilfreigegeben", freigaben, token: null });
      return { ok: true, stand: "teilfreigegeben", verfallen: (f.freigaben || []).length - bleiben.length };
    }
    const token = randomBytes(32).toString("base64url");
    const bisMs = Math.min(ms + TOKEN_FRIST_MS, f.eroeffnetMs + ANTRAG_FRIST_MS);
    await store.setJSON(FALL(f.fall), { ...f, stand: "freigegeben", freigaben,
      token: { hash: tokenHash(f.fall, f.traeger.id, f.faktorKennung, token).toString("hex"), ausgestelltMs: ms, bisMs } });
    return { ok: true, stand: "freigegeben", token, bisMs };
  }, ["offen", "teilfreigegeben"]);
}

/**
 * Ablehnen (Endzustand). Dieselben Voraussetzungen an den Ablehnenden wie an einen Freigebenden.
 * @param {any} store
 * @param {{fall: string, freigebender: any, grund: string, ms?: number}} a
 * @returns {Promise<{ok: true, stand: "abgelehnt"}|{ok: false, grund: string}>}
 */
export async function fallAblehnen(store, { fall, freigebender, grund, ms = Date.now() }) {
  if (!ABLEHNUNGSGRUENDE.includes(grund)) return { ok: false, grund: "grund" };
  return fallAendern(store, fall, freigebender, ms, async (f) => {
    await store.setJSON(FALL(f.fall), { ...f, stand: "abgelehnt", token: null, freigaben: f.freigaben || [],
      ablehnung: { kennung: freigebender.kennung, person: String(freigebender.person), grund, zeit: new Date(ms).toISOString() },
      ende: new Date(ms).toISOString() });
    return { ok: true, stand: "abgelehnt" };
  }, ["offen", "teilfreigegeben"]);
}

/**
 * Gemeinsamer Rahmen für Freigeben und Ablehnen: Fall auflösen (nur im eigenen Mandanten), unter der Sperre des
 * Trägers frisch lesen, Frist/Epoche/Zustand und die Regeln an den Handelnden prüfen, dann `arbeit`.
 * @param {any} store @param {string} fall @param {any} w @param {number} ms
 * @param {(f: any, ep: any) => Promise<any>} arbeit @param {string[]} erlaubt
 */
async function fallAendern(store, fall, w, ms, arbeit, erlaubt) {
  const ep = await faktorEpoche();
  if (ep.gebunden && !ep.epoche) return { ok: false, grund: "epoche" };
  const vorab = await fallLesen(store, fall);
  /* Mandantentrennung VOR der Sperre: ein fremder Fall wird nicht einmal angefasst. */
  if (!vorab || freigebenderUnzulaessig(vorab, w) === "mandant") return { ok: false, grund: "unbekannt" };
  return unterSperre(vorab.traeger.id, async () => {
    const f = await fallLesen(store, fall);
    if (!f || f.traeger.id !== vorab.traeger.id) return { ok: false, grund: "unbekannt" };
    const st = wirksamerStand(f, ms, ep);
    if (!erlaubt.includes(st)) { await ablaufFesthalten(store, f, ms, st); return { ok: false, grund: `stand:${st}` }; }
    const unzul = freigebenderUnzulaessig(f, w);
    if (unzul) return { ok: false, grund: unzul };
    /* Dieselbe Person darf nicht zweimal handeln (auch nicht mit einem zweiten Konto). */
    for (const fr of Array.isArray(f.freigaben) ? f.freigaben : []) {
      if (nichtUnabhaengig(fr, w) === "gleiches-konto" || nichtUnabhaengig(fr, w) === "gleiche-person")
        return { ok: false, grund: "schon-freigegeben" };
    }
    return arbeit(f, ep);
  });
}

/* --------------------------------------------------------------------------
   Rückzug und Einlösen
   -------------------------------------------------------------------------- */

/**
 * Den laufenden Fall eines Trägers zurückziehen (Träger mit erstem Faktor, oder automatisch bei einer Anmeldung mit
 * gültigem TOTP). Kein laufender Fall: nichts zu tun.
 * @returns {Promise<{ok: true, fall: string|null}>}
 */
export async function fallZurueckziehen(store, { traegerId, ms = Date.now() }) {
  const ep = await faktorEpoche();
  return unterSperre(traegerId, async () => {
    const f = await fallDesTraegers(store, traegerId);
    if (!f) return { ok: true, fall: null };
    const st = wirksamerStand(f, ms, ep);
    if (!LAUFEND.includes(st)) { await ablaufFesthalten(store, f, ms, st); return { ok: true, fall: null }; }
    await store.setJSON(FALL(f.fall), { ...f, stand: "zurueckgezogen", token: null, ende: new Date(ms).toISOString() });
    return { ok: true, fall: f.fall };
  });
}

/**
 * Das Abschlusstoken einlösen. Unter der Sperre des Trägers: Fall frisch lesen, Frist, Epoche, Zustand, Token und
 * Faktorzustand prüfen, den Fall als „eingeloest" SCHREIBEN (das Token gilt danach nie wieder) — erst dann die
 * `wirkung`. Scheitert sie, bleibt der Fall eingelöst (neuer Fall nötig) und der Faktor, wie die Wirkung ihn
 * hinterlässt (Zugangscode-Weg: unverändert).
 * @param {any} store
 * @param {{traegerId: string, token: unknown, faktorKennung: string|null, ms?: number,
 *   wirkung: (fall: string) => Promise<{ok: boolean}>}} a
 * @returns {Promise<{ok: true, fall: string, ergebnis: any}|{ok: false, grund: string, ergebnis?: any}>}
 */
export async function fallEinloesen(store, { traegerId, token, faktorKennung, ms = Date.now(), wirkung }) {
  const t = typeof token === "string" ? token.trim() : "";
  if (!/^[A-Za-z0-9_-]{43}$/.test(t)) return { ok: false, grund: "form" };
  const ep = await faktorEpoche();
  if (ep.gebunden && !ep.epoche) return { ok: false, grund: "epoche" };
  return unterSperre(traegerId, async () => {
    const f = await fallDesTraegers(store, traegerId);
    if (!f) return { ok: false, grund: "kein-fall" };
    const st = wirksamerStand(f, ms, ep);
    if (st !== "freigegeben") { await ablaufFesthalten(store, f, ms, st); return { ok: false, grund: `stand:${st}` }; }
    if (typeof faktorKennung !== "string" || faktorKennung !== f.faktorKennung) return { ok: false, grund: "faktor" };
    const soll = Buffer.from(String(f.token.hash || ""), "hex");
    const ist = tokenHash(f.fall, traegerId, faktorKennung, t);
    if (soll.length !== ist.length || !timingSafeEqual(soll, ist)) return { ok: false, grund: "token" };
    const eingeloest = { ...f, stand: "eingeloest", token: null, ende: new Date(ms).toISOString() };
    await store.setJSON(FALL(f.fall), eingeloest);
    let ergebnis;
    try { ergebnis = await wirkung(f.fall); }
    catch { ergebnis = { ok: false, fehler: "wirkung" }; }
    if (!ergebnis || ergebnis.ok !== true) {
      await store.setJSON(FALL(f.fall), { ...eingeloest, wirkung: "gescheitert" }).catch(() => {});
      return { ok: false, grund: "wirkung", ergebnis };
    }
    return { ok: true, fall: f.fall, ergebnis };
  });
}
