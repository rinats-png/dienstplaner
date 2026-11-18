/* ==========================================================================
   SPEICHERSCHICHT
   Ersetzt window.storage durch den Server. Die Anwendung merkt davon nichts —
   sie ruft weiterhin get und set auf.

   Drei Dinge kommen hinzu, die es lokal nicht gab:
     Anmeldung      — ein Zugangscode je Betrieb
     Konfliktschutz — wer gegen einen veralteten Stand schreibt, wird gestoppt
     Verzögertes Schreiben — nicht jeder Tastendruck geht ins Netz
   ========================================================================== */

/* Zwei Speicherorte mit unterschiedlicher Lebensdauer:

   sessionStorage hält den Zugang nur, solange der Reiter offen ist. Wer die
   Anwendung schließt und neu öffnet, landet wieder bei der Anmeldung — so
   ist es an einem geteilten Rechner im Betrieb richtig.

   localStorage überdauert das Schließen. Das gilt nur, wenn jemand
   ausdrücklich „Zugang merken" gewählt hat — auf dem eigenen Telefon
   sinnvoll, am Stationsrechner nicht. */
import * as PUF from "./stempelpuffer.js";
import { mitEinmaligerAngabe } from "./module/ausnahmeweg.js";
import { teilwegStart } from "./app/teilkonflikt.js";
import { teilSpeichern, teilEntscheiden, sicherungInhalt, sitzungsAbdruck, ruhig as teilRuhig } from "./app/teilweg-steuerung.js";

const SCHLUESSEL = "centric:token";
const GEMERKT = "centric:gemerkt";
const WARTE = 1200;          // Millisekunden, bis nach der letzten Änderung geschrieben wird

let token = null;
let etag = null;
let offen = null;            // ausstehender Schreibvorgang
let uhr = null;
let unterwegs = 0;           // Zahl der abgeschickten PUTs, deren Antwort aussteht (beim Schließen kann es mehr als einer sein)
/** Fünfter Review B-2: Ein PUT, der nicht antwortet, bricht nach dieser Zeit ab (Fehlerart „netz“, Wiederholen möglich). */
export const SCHREIBEN_ZEITGRENZE = 45000;

/* WP-48.5 Teil 2: Teilspeicherung (docs/acc45/WP48-TEILSPEICHERUNG.md 2.4, 7.6). Nur wenn das GET die Fähigkeit
   `teile` meldet (Schalter CENTRIC_TEILSPEICHERUNG an); sonst bleiben teil und teilRoh null, und alles läuft wie
   bisher über den Voll-PUT. teilRoh ist die zuletzt übernommene GET-Antwort; der Zustand entsteht daraus beim ersten
   Speichern (dann ist der Betrieb der Sitzung bekannt). */
let teil = null;
let teilRoh = null;
let teilLaeuft = false;
/** Nach der Sicherung als Datei bis zum Neuladen: nichts mehr senden (teilwegVerwerfen). */
let neuLadenSperre = false;
/** Review #348 H1: nach einem 409 des Voll-PUT (Sitzung mit Teilweg) kein Voll-PUT, bis neu gelesen ist. */
let vollSperre = false;
/** War der Teilweg in dieser Sitzung aktiv? Dann bietet das Konfliktfenster des Voll-PUT kein blindes Übernehmen an. */
let teilGenutzt = false;
/** Rückrufe des letzten Auftrags auf dem Teilweg (Senden nach einer Entscheidung im Konfliktfenster). */
let teilAuftrag = null;
/** Der jüngste lokale Stand, der zum Speichern übergeben wurde. */
let letzterBestand = null;
/** Steht auf dem Teilweg etwas aus, das nicht von selbst hinausgeht (Frage offen, unklar, „neu laden")? */
const teilOffen = () => !!teil && !teilRuhig(teil);

/** Wartet ein Schreibvorgang oder ist einer unterwegs? Dann ist der lokale
    Stand nicht der gespeicherte. */
export const schreibenAusstehend = () => !!offen || unterwegs > 0 || teilOffen();
let name = null;
let zugang = null;         // Rolle, Person und Betrieb aus dem Zugangscode

try {
  /* Erst die Sitzung dieses Reiters, dann der gemerkte Zugang. */
  token = sessionStorage.getItem(SCHLUESSEL);
  if (!token && localStorage.getItem(GEMERKT) === "ja")
    token = localStorage.getItem(SCHLUESSEL);
} catch { /* privater Modus */ }
/* Keine Sitzung, aber noch ein Offline-Bestand im Speicher des Dienstarbeiters
   (Reiter geschlossen statt abgemeldet, etwa am Stationsrechner): Er gehört
   niemandem mehr und wird sofort geräumt (SI-07, interne Prüfung 2026-11).
   Die Funktion fängt jeden Fehler selbst ab. */
if (!token) offlineCacheLeeren();

const kopf = () => ({ "content-type": "application/json",
  ...(token ? { authorization: `Bearer ${token}` } : {}) });

async function ruf(pfad, opt = {}) {
  const a = await fetch(`/api/${pfad}`, { ...opt, headers: { ...kopf(), ...(opt.headers || {}) } });
  let d = null;
  try { d = await a.json(); } catch { /* leere Antwort */ }
  if (a.status === 401) { abmelden(true); throw new Error("nicht-angemeldet"); }
  /* Der Dienstarbeiter kennzeichnet eine Antwort, die aus seinem Speicher
     kommt. Ohne dieses Kennzeichen sähe ein drei Tage alter Plan aus wie
     der aktuelle — und das wäre schlimmer als gar keiner. */
  const ausSpeicher = a.headers.get("x-centric-offline") === "ja";
  return { status: a.status, daten: d, ausSpeicher,
    geholt: a.headers.get("x-centric-geholt") || null };
}

/* ------------------------------ Anmeldung -------------------------------- */
export const angemeldet = () => !!token;
export const betriebsname = () => name;
export const zugangsdaten = () => zugang;

/** Legt den Zugang ab — je nach Wunsch nur für diesen Reiter oder dauerhaft. */
function tokenAblegen(t, merken) {
  try {
    sessionStorage.setItem(SCHLUESSEL, t);
    if (merken) { localStorage.setItem(SCHLUESSEL, t); localStorage.setItem(GEMERKT, "ja"); }
    else { localStorage.removeItem(SCHLUESSEL); localStorage.removeItem(GEMERKT); }
  } catch { /* privater Modus — dann gilt nur der laufende Reiter */ }
}

export const wirdGemerkt = () => {
  try { return localStorage.getItem(GEMERKT) === "ja"; } catch { return false; }
};

/* SI-P4: Leitung, Planung und Kunde dürfen „Zugang merken“ nur mit aktivem zweiten Faktor, der Betreiber nie.
   Entscheidend ist die Angabe des Servers (`merkenErlaubt`); fehlt sie, wird nicht gemerkt (fail-closed).
   Ein schon gemerkter Zugang, für den sie nicht (mehr) gilt, wird beim Laden aus dem dauerhaften Speicher
   genommen — die Sitzung dieses Reiters bleibt. */
export const ROLLEN_OHNE_MERKEN = Object.freeze(["betreiber", "leitung", "planer", "subplaner", "kunde"]);
/** @param {any} antwort  Antwort von /api/anmelden oder /api/bestand */
export const merkenErlaubtLaut = (antwort) => !!antwort && antwort.merkenErlaubt === true;
function gemerktZuruecknehmen() {
  try { localStorage.removeItem(SCHLUESSEL); localStorage.removeItem(GEMERKT); } catch { /* egal */ }
}

export async function anmelden(zugangscode, merken, zweifaktor) {
  const a = await fetch("/api/anmelden", { method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(zweifaktor ? { zugangscode, zweifaktor } : { zugangscode }) });
  const d = await a.json();
  if (!a.ok) {
    /* WP-32b: Betreibercode mit zweitem Faktor — die Maske fragt dann nach dem Code. */
    const f = new Error(d.fehler || "Anmeldung fehlgeschlagen.");
    if (d.zweifaktor) /** @type {any} */ (f).zweifaktor = d.zweifaktor;
    throw f;
  }
  await offlineCacheLeeren();   // Rollenwechsel: nichts von der vorherigen Person bleibt liegen (WP-37)
  token = d.token; name = d.name;
  zugang = { rolle: d.rolle, person: d.person, betrieb: d.betrieb, name: d.name, hinweis: d.hinweis, demo: d.demo === true };
  tokenAblegen(token, merken && merkenErlaubtLaut(d));
  return d;
}

/** Liste der Demozugänge — ohne Anmeldung abrufbar. */
export async function demos() {
  try {
    const a = await fetch("/api/demos");
    if (!a.ok) return [];
    return (await a.json()).demos || [];
  } catch { return []; }
}

/** Öffnet einen Demozugang ohne Code. */
export async function demoOeffnen(id, merken) {
  const a = await fetch("/api/demo", { method: "POST",
    headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) });
  const d = await a.json();
  if (!a.ok) throw new Error(d.fehler || "Demozugang nicht verfügbar.");
  await offlineCacheLeeren();   // Rollenwechsel (WP-37)
  token = d.token; name = d.name;
  zugang = { rolle: d.rolle, person: d.person, betrieb: d.betrieb, name: d.name, demo: true };
  /* Eine Betreibersitzung wird nie über das Schließen des Browsers hinaus
     gemerkt. Wer Datenräume anlegen und Zugänge sperren kann, soll das
     Häkchen gar nicht erst wirksam setzen können — ein liegen gelassener
     Rechner wäre sonst ein offener Betreiberzugang. */
  /* SI-P4: Demozugänge haben keinen zweiten Faktor — Leitung, Planung und Kunde werden auch hier nicht gemerkt. */
  tokenAblegen(token, merken && !ROLLEN_OHNE_MERKEN.includes(d.rolle));
  return d;
}

/**
 * Einen Datenraum endgültig löschen — Betreiber, mit frischer Anmeldung.
 * Der Name muss noch einmal übergeben werden; der Server prüft ihn.
 */
export async function raumLoeschen(raum) {
  const { status, daten } = await ruf("raum-loeschen", { method: "POST",
    body: JSON.stringify({ bestand: raum, bestaetigung: raum }) });
  if (status !== 200) throw new Error(daten?.text || daten?.fehler || "Löschen fehlgeschlagen.");
  return daten;
}

/**
 * Die Push-Anmeldung DIESES Geräts für den Server (E-9): `{endpoint}`, `null`
 * (dieses Gerät hat keine) oder `undefined` (unbekannt — der Server entfernt
 * dann wie bisher die Anmeldung der Person). Höchstens ~1,5 s.
 * @returns {Promise<{endpoint: string}|null|undefined>}
 */
async function diesesGeraet() {
  try {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)
      || typeof window === "undefined" || !("PushManager" in window)) return null;
    const suche = (async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      const s = reg && await reg.pushManager.getSubscription();
      return s && typeof s.endpoint === "string" ? { endpoint: s.endpoint } : null;
    })();
    const frist = new Promise((ja) => { setTimeout(() => ja(undefined), 1500); });
    return await Promise.race([suche, frist]);
  } catch { return undefined; }
}
/** Rumpf für Abmelden: ohne bekannte Angabe kein Feld `geraet` (bisheriges Verhalten). */
const geraetRumpf = (g) => JSON.stringify(g === undefined ? {} : { geraet: g });

/* Review-Auflage M1: Beim Abmelden lädt die Anwendung sofort neu
   (app/abmelden.js). Die Anfrage muss deshalb SYNCHRON starten — der Endpunkt
   dieses Geräts wird vorher gemerkt (beim Einschalten, Ausschalten und beim
   Start, pushGeraetAuffrischen), nicht erst beim Abmelden erfragt. Der Merker
   gehört zum Gerät (Browser), nicht zur Person; er ist kein Geheimnis des
   Servers (der Endpunkt steht ohnehin im Browser). */
const PUSHGERAET = "centric:pushgeraet";
function geraetMerken(endpoint) {
  try { localStorage.setItem(PUSHGERAET, endpoint ? JSON.stringify({ endpoint }) : "keins"); } catch { /* egal */ }
}
/** Synchron: `{endpoint}`, `null` (keine Anmeldung möglich oder bekannt keine) oder `undefined` (unbekannt). */
export function geraetGemerkt() {
  try {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)
      || typeof window === "undefined" || !("PushManager" in window)) return null;
    if (typeof Notification !== "undefined" && Notification.permission !== "granted") return null;
    const w = localStorage.getItem(PUSHGERAET);
    if (w === "keins") return null;
    if (w) {
      const g = JSON.parse(w);
      if (g && typeof g.endpoint === "string" && g.endpoint) return { endpoint: g.endpoint };
    }
  } catch { /* unbekannt */ }
  return undefined;
}
/** Den Merker aus dem Browser nachziehen (beim Start, ohne Warten). */
export async function pushGeraetAuffrischen() {
  const g = await diesesGeraet();
  if (g !== undefined) geraetMerken(g && g.endpoint);
}

export function abmelden(still = false) {
  if (!still && token) {
    /* Synchron gestartet (M1): kein await vor fetch — ein sofortiges Neuladen
       bricht die Anfrage dank keepalive nicht ab. */
    try {
      fetch("/api/abmelden", { method: "POST", headers: kopf(), body: geraetRumpf(geraetGemerkt()), keepalive: true })
        .catch(() => {});
    } catch { /* ohne Netz: die Sitzung läuft serverseitig ab */ }
  }
  /* Der zuletzt geladene Bestand liegt im Speicher des Dienstarbeiters. Er
     gehört nicht dem nächsten Menschen an diesem Gerät. */
  offlineDatenLoeschen(stempelInhaber());
  token = null; etag = null; name = null; zugang = null;
  /* Der Stempelpuffer bleibt auf dem Gerät (WP-07) — wartende Stempel gehen
     nicht verloren. Ohne Inhaber wird aber nichts mehr gesendet und nichts
     mehr angezeigt; eine andere Person, die sich hier anmeldet, sieht ihn
     nicht und sendet ihn nicht. */
  if (pufferUhr) { clearTimeout(pufferUhr); pufferUhr = null; }
  stempelPufferMelden().catch(() => {});
  try {
    sessionStorage.removeItem(SCHLUESSEL);
    localStorage.removeItem(SCHLUESSEL);
    localStorage.removeItem(GEMERKT);
  } catch { /* egal */ }
}

/* ------------------------------- Lesen ----------------------------------- */
export async function lies() {
  const { status, daten, ausSpeicher, geholt } = await ruf("bestand");
  if (status !== 200) throw new Error(daten?.fehler || "Laden fehlgeschlagen.");
  etag = daten.etag;
  /* schreiben: "voll" | "eigenes" | "nein" — der Server sagt, was diese
     Rolle darf. Die Oberfläche darf weniger anbieten, niemals mehr. */
  /* SI-P4: Nur eine echte Antwort des Servers (nicht aus dem Speicher des Dienstarbeiters) entscheidet. */
  if (!ausSpeicher && !merkenErlaubtLaut(daten)) gemerktZuruecknehmen();
  zugang = { rolle: daten.rolle, person: daten.person, betrieb: daten.betrieb,
    name: daten.name, demo: daten.demo === true, schreiben: daten.schreiben || "voll",
    /* WP-07: wem die Offline-Warteschlange gehört (Raum, Betrieb, Person der
       Sitzung als Prüfsumme). Auch aus dem Speicher des Dienstarbeiters — der
       gehört immer der aktuellen Anmeldung, denn Abmelden löscht ihn. */
    inhaber: typeof daten.inhaber === "string" ? daten.inhaber : null,
    /* A-3 (Delta-Review e8b9b93d, Punkt 3): Gilt für den Betrieb das strenge Regime? Nur der Server weiß es
       (server/lib/erstleitung.mjs); fehlt die Angabe, bleibt die Oberfläche beim bisherigen Ablauf
       (src/app/zugangssitzung.js). Rechte bestimmt ohnehin allein der Server. */
    erstleitungStreng: daten.erstleitungStreng === true };
  stempelPufferMelden().catch(() => {});
  /* Jetzt ist der Inhaber bekannt: Wartendes senden — beim Start der
     Anwendung der Weg, auf dem ein offline erfasster Stempel nach einem
     Neustart hinausgeht. */
  if (!ausSpeicher && quittungsAbnehmer) stempelSenden().catch(() => {});
  return { bestand: daten.bestand, zugang, geaendert: daten.geaendert, durch: daten.durch,
    ausSpeicher: !!ausSpeicher, geholt,
    /* WP-48.5: Fähigkeit `teile` (nur mit Schalter, nie aus dem Speicher des Dienstarbeiters). Übernommen wird sie
       erst mit teilwegUebernehmen — dort, wo die Oberfläche diesen Stand als lokalen Stand übernimmt. */
    teilAntwort: !ausSpeicher && daten.teile ? { bestand: daten.bestand, etag: daten.etag, teile: daten.teile } : null };
}

/**
 * WP-48.5: Den eben gelesenen Stand als Basis des Teilwegs übernehmen — nur dort aufrufen, wo die Oberfläche ihn
 * als lokalen Stand übernimmt. Ohne Fähigkeit `teile` (Schalter aus) wird der Teilweg ausgeschaltet: Voll-PUT wie
 * bisher. Steht auf dem Teilweg noch etwas aus (Frage, unklar, „neu laden"), bleibt der Zustand (false).
 * @param {any} teilAntwort  `teilAntwort` aus lies() oder null
 */
export function teilwegUebernehmen(teilAntwort) {
  if (teilOffen()) return false;
  teil = null;
  teilRoh = teilAntwort && teilAntwort.teile ? teilAntwort : null;
  vollSperre = false;   // frisch gelesener Stand: ETag und lokaler Stand gehören wieder zusammen
  return true;
}

/** WP-48.5: Zustand des Teilwegs für das Konfliktfenster (null = Teilweg aus). */
export const teilwegLage = () => teil;
/** WP-48.5: War der Teilweg in dieser Sitzung aktiv? */
export const teilwegGenutzt = () => teilGenutzt;
/** WP-48.5: Bietet der Server den Teilweg an (Fähigkeit `teile` übernommen)? */
export const teilwegAktiv = () => !!teil || !!teilRoh;

/**
 * WP-48.5: Die Fragen des Konfliktfensters entscheiden („fremd" | „meins" je Frage). Gibt den neuen lokalen
 * Bestand zurück (die Oberfläche übernimmt ihn) und sendet den Rest sofort — oder null, solange eine Frage offen ist.
 * @param {Record<string, "fremd"|"meins">} wahl
 */
export function teilEntscheidungAnwenden(wahl) {
  if (neuLadenPflicht || !letzterBestand) return null;
  const r = teilEntscheiden(teil, wahl, letzterBestand);
  if (!r) return null;
  teil = r.teil;
  letzterBestand = r.bestand;
  if (uhr) { clearTimeout(uhr); uhr = null; }
  offen = { ...(teilAuftrag || {}), bestand: r.bestand, ausnahme: null, ...vorgabenAus(teilAuftrag, offen) };
  jetztSchreiben().catch(() => {});
  return r.bestand;
}

/** WP-48.5: Inhalt der Sicherung als Datei (Ausstehendes und eigener Betrieb), ohne Netz. */
export const teilSicherung = () => sicherungInhalt(teil, letzterBestand, new Date().toISOString());

/**
 * WP-48.5 (3): Löschlauf der Leitung über den eigenen Weg POST /api/loeschlauf (WP-48.4) — `{ vorschau: true }` oder
 * `{ bestaetigt: <Kennung> }`. Nur aufrufen, wenn der Teilweg aktiv ist (teilwegAktiv): ohne Schalter gibt es den Weg
 * nicht (404), dann bleibt der Löschlauf beim Speichern.
 * @returns {Promise<{ status: number, daten: any }>}
 */
export async function loeschlaufServer(rumpf) {
  const { status, daten } = await ruf("loeschlauf", { method: "POST", body: JSON.stringify(rumpf) });
  return { status, daten: daten || {} };
}

/** WP-48.5 (3): Der nächste Schreibvorgang geht als Voll-PUT (Löschlauf per Speichern bei aktivem Teilweg, Kundenrolle):
    Stempel stehen nie im Delta, ihr Löschen braucht den ganzen Bestand. Ohne Teilweg wirkungslos. Die Vorgabe geht
    beim nächsten schreib() an DIESEN Auftrag über (Review #350 M2: nicht global — ein älterer Auftrag, der noch auf sein
    frisches GET wartet, verbraucht sie nicht) und bleibt an ihm, auch beim Wiederholen. */
let vollEinmal = false;
let loeschlaufEinmal = false;
/** @param {{ loeschlauf?: boolean }} [o]  loeschlauf: dieser Auftrag ist ein Löschlauf per Speichern (danach neu laden) */
export function naechstesSpeichernVoll({ loeschlauf = false } = {}) {
  if (!teil && !teilRoh) return;
  vollEinmal = true;
  if (loeschlauf) loeschlaufEinmal = true;
}
/** Vorgaben „voll" und „Löschlauf per Speichern" der genannten Aufträge vereinen (Review #350 M2: am Auftrag, nicht
    global; ein neuerer Auftrag übernimmt sie von einem wartenden, laufenden oder gescheiterten). */
function vorgabenAus(...auftraege) {
  const aus = {};
  for (const a of auftraege) {
    if (a && a.vollGewuenscht) aus.vollGewuenscht = true;
    if (a && a.loeschlaufSpeichern) aus.loeschlaufSpeichern = true;
  }
  return aus;
}

/* ---------------- Review #350: Merkmal „neu laden Pflicht" nach einem Löschlauf ----------------
   Sobald die Bestätigung eines Löschlaufs hinausgegangen ist (ausgeführt oder Ausgang unklar) bzw. der Löschlauf per
   Speichern (Kundenrolle) gesendet wurde, geht aus dieser Seite nichts mehr hinaus: kein „Noch einmal senden", keine
   neue Eingabe, kein wartender, gescheiterter oder beim Schließen gesendeter Auftrag. Jeder dieser Stände kann noch
   enthalten, was der Löschlauf gelöscht hat (Art. 17). Die Leiste bietet nur „Als Datei sichern" und „Seite neu laden".
   Das Merkmal liegt nur im Arbeitsspeicher und endet mit dem Neuladen der Seite. Ohne Teilweg wird es nie gesetzt. */
let neuLadenPflicht = false;
/** jüngster lokaler Stand nach Eintritt der Pflicht (für die Datei-Sicherung) */
let pflichtZuletzt = null;
/** Rückruf der Leiste „nicht gespeichert" aus dem letzten Auftrag */
let letzteOnFehler = null;
const pflichtLage = () => ({ art: "neuLadenPflicht", status: null, zeit: new Date().toISOString(),
  text: "Nach dem Löschlauf wird nichts mehr gesendet — bitte die Seite neu laden." });
function pflichtMelden() {
  const f = (gescheitert && gescheitert.auftrag && gescheitert.auftrag.onFehler) || letzteOnFehler;
  if (f) { try { f(gescheitert ? gescheitert.lage : pflichtLage()); } catch { /* Anzeige */ } }
}
/** Einen Auftrag unter der Pflicht aufnehmen: nicht senden, nur zum Sichern als Datei halten. */
function pflichtAufnehmen(auftrag) {
  if (auftrag && auftrag.bestand) { letzterBestand = auftrag.bestand; pflichtZuletzt = auftrag.bestand; }
  /* Ein schon gescheiterter Auftrag bleibt (sein Bestand ginge sonst für die Sicherung verloren, P4). */
  gescheitert = gescheitert ? { ...gescheitert, gesperrt: true, lage: pflichtLage() }
    : (auftrag ? { auftrag, gesperrt: true, lage: pflichtLage() } : null);
  pflichtMelden();
}
/** Merkmal setzen (nach der Bestätigung eines Löschlaufs, auch bei unklarem Ausgang). */
export function neuLadenPflichtSetzen() {
  neuLadenPflicht = true;
  if (uhr) { clearTimeout(uhr); uhr = null; }
  const a = offen; offen = null;
  if (a || gescheitert) pflichtAufnehmen(a);
  else pflichtMelden();
}
/** Ist die Seite nach einem Löschlauf neu zu laden? */
export const neuLadenNoetig = () => neuLadenPflicht;
/** Die Leiste hat den ausstehenden Bestand als Datei gesichert (beforeunload fragt dann nicht mehr). */
export function ausstehendGesichert() { if (gescheitert) gescheitert = { ...gescheitert, gesichert: true }; }

/** WP-48.5: Nach der Sicherung als Datei neu laden — der Teilweg verwirft seinen Zustand (kein Senden, keine Rückfrage). */
export function teilwegVerwerfen() {
  /* Bis zum Neuladen geht nichts mehr hinaus — auch kein Voll-PUT des alten Stands über einen neu aufgesetzten. */
  neuLadenSperre = true;
  teil = null; teilRoh = null; offen = null;
  if (uhr) { clearTimeout(uhr); uhr = null; }
}

/* ----------------------- Offline-Stempeln (WP-07) ------------------------
   Jedes Stempeln wird zuerst im Stempelpuffer des Geräts abgelegt
   (stempelpuffer.js: IndexedDB, sonst localStorage) und dann gesendet. Was
   nicht durchkommt, bleibt liegen, bis der Server quittiert — über Neustart
   und Abmelden hinweg. Gesendet wird nur, was der angemeldeten Person
   gehört (Inhaber), und nur mit ihrer Sitzung; Ereignisse einer anderen
   Person bleiben unberührt und unsichtbar.

   Wann gesendet wird: sofort beim Stempeln, beim Start der Anwendung, wenn
   das Netz zurückkommt (online), wenn die Anwendung wieder in den
   Vordergrund kommt (focus, visibilitychange) und solange etwas wartet nach
   der Wartezeit (2 s, 4 s … 5 min; bei 429/503 nach Retry-After). Die
   Hintergrundsynchronisation des Dienstarbeiters (Background Sync) wird
   bewusst nicht genutzt: Safari/iOS kennt sie nicht, und der Dienstarbeiter
   müsste dafür den Zugang selbst halten. Der Pflichtweg ist deshalb die
   geöffnete Anwendung. */
let pufferSpeicherP = null;
const pufferSpeicher = () => { if (!pufferSpeicherP) pufferSpeicherP = PUF.speicherWaehlen(); return pufferSpeicherP; };
const pufferBeobachter = new Set();
let pufferKette = Promise.resolve();
let pufferUhr = null;
let quittungsAbnehmer = null;

/** Der Inhaber der angemeldeten Sitzung — oder null (abgemeldet, ohne Person, alter Server). */
export const stempelInhaber = () => (zugang && zugang.inhaber) || null;

/** Die eigenen Ereignisse (wartend, bestätigt, abgelehnt), in Erfassungsreihenfolge. */
export async function stempelEreignisse() {
  try { return await PUF.ereignisseVon(await pufferSpeicher(), stempelInhaber()); } catch { return []; }
}

/** Wie viele eigene Stempel warten noch auf das Netz? (Hinweis beim Abmelden) */
export const stempelWartendAnzahl = () => PUF.vorlaeufige().filter((e) => e && e.zustand === "wartet").length;

/** Wird der Puffer dauerhaft gespeichert (IndexedDB/localStorage)? Sonst ginge er beim Neustart verloren. */
export async function stempelPufferDauerhaft() {
  try { return (await pufferSpeicher()).dauerhaft; } catch { return false; }
}

/** Bei jeder Änderung des Puffers benachrichtigt werden. Gibt die Abmeldung zurück. */
export function stempelBeobachten(fn) {
  pufferBeobachter.add(fn);
  return () => pufferBeobachter.delete(fn);
}

async function stempelPufferMelden() {
  const liste = await stempelEreignisse();
  PUF.vorlaeufigeSetzen(liste);
  for (const f of pufferBeobachter) { try { f(liste); } catch { /* Anzeige */ } }
  return liste;
}

async function ereignisSenden(ev) {
  if (!token) return { status: 401, daten: null };
  /* Höchstens 20 Sekunden je Versuch: In einem schwachen Netz hängt eine
     Anfrage sonst minutenlang, und die Reihe dahinter wartet mit. Ein
     abgebrochener Versuch ist ein vorübergehender Fehler — dieselbe Kennung
     kommt wieder, der Server macht trotzdem nur einen Stempel daraus. */
  const ab = typeof AbortController !== "undefined" ? new AbortController() : null;
  const uhr = ab ? setTimeout(() => ab.abort(), 20000) : null;
  let a;
  try {
    a = await fetch("/api/stempeln", { method: "POST", headers: kopf(),
      body: JSON.stringify(PUF.rumpfFuer(ev)), ...(ab ? { signal: ab.signal } : {}) });
  } finally { if (uhr) clearTimeout(uhr); }
  let d = null;
  try { d = await a.json(); } catch { /* leere Antwort */ }
  return { status: a.status, daten: d, warteMs: PUF.retryAfterMs(a.headers.get("retry-after")) };
}

/** Nächsten Versuch planen, solange etwas wartet. */
function pufferPlanen(liste) {
  if (pufferUhr) { clearTimeout(pufferUhr); pufferUhr = null; }
  const wartend = liste.filter((e) => e.zustand === "wartet");
  if (!wartend.length || !stempelInhaber()) return;
  const naechst = Math.min(...wartend.map((e) => e.naechsterVersuchAm || 0));
  const in_ = Math.max(1000, Math.min(PUF.WARTEN_MAX_MS, naechst - Date.now()));
  pufferUhr = setTimeout(() => { stempelSenden().catch(() => {}); }, in_);
}

/**
 * Die eigenen wartenden Stempel senden. Läufe in diesem Reiter stehen
 * hintereinander; zwischen Reitern trennt die Web-Locks-Schnittstelle, wo
 * es sie gibt — und wo nicht, sorgt der Server dafür, dass dasselbe
 * Ereignis nur einen Stempel ergibt. `sofort`: Wartezeiten aufheben (die
 * Person hat gerade gestempelt, oder das Netz ist zurück).
 */
export function stempelSenden({ sofort = false } = {}) {
  const lauf = pufferKette.then(async () => {
    const inhaber = stempelInhaber();
    if (!inhaber) return { ergebnisse: {}, angehalten: "ohne-inhaber" };
    const sp = await pufferSpeicher();
    if (sofort)
      for (const e of await PUF.ereignisseVon(sp, inhaber))
        if (e.zustand === "wartet" && e.naechsterVersuchAm) await sp.setzen({ ...e, naechsterVersuchAm: 0 });
    /* Quittungen eines Laufs gesammelt an die Oberfläche — ein Nachladen
       statt eines je Stempel (Review L6). */
    const quittungen = [];
    const arbeit = () => PUF.abarbeiten(sp, inhaber, ereignisSenden,
      { beiQuittung: (ev, daten) => { quittungen.push({ ev, daten }); } });
    const locks = typeof navigator !== "undefined" && navigator.locks;
    const erg = locks && typeof locks.request === "function"
      ? await locks.request("centric-stempelpuffer", arbeit) : await arbeit();
    pufferPlanen(await stempelPufferMelden());
    if (quittungen.length && quittungsAbnehmer) { try { quittungsAbnehmer(quittungen); } catch { /* Anzeige */ } }
    return erg;
  });
  pufferKette = lauf.catch(() => {});
  return lauf;
}

/**
 * Ein Stempeln ablegen. Gibt das Ereignis zurück — oder null, wenn der
 * Inhaber unbekannt ist (dann stempelt die Oberfläche wie bisher direkt).
 */
export async function stempelErfassen(datum, art, koord, pause = null) {
  const inhaber = stempelInhaber();
  if (!inhaber) return null;
  /* Nicht unter der Sendesperre: Ein hängender Sendeversuch darf das
     Ablegen eines neuen Stempels nicht aufhalten. Jedes Ereignis liegt unter
     eigenem Schlüssel (IndexedDB; im Rückfall je Ereignis ein
     localStorage-Feld), zwei Reiter überschreiben sich also nichts. */
  const ev = await PUF.erfassen(await pufferSpeicher(), { art, datum, koord, positionGrund: koord && koord.grund, inhaber, pause,
    offline: typeof navigator !== "undefined" && navigator.onLine === false });
  await stempelPufferMelden();
  return ev;
}

/** Ein abgelehntes Ereignis erneut senden — auf ausdrücklichen Wunsch. */
export async function stempelErneut(id) {
  const ok = await PUF.erneutSenden(await pufferSpeicher(), id, stempelInhaber());
  if (ok) await stempelSenden({ sofort: true });
  return ok;
}

/** Ein abgelehntes oder bestätigtes Ereignis zur Kenntnis nehmen. Wartende bleiben. */
export async function stempelVerwerfen(id) {
  const ok = await PUF.verwerfen(await pufferSpeicher(), id, stempelInhaber());
  await stempelPufferMelden();
  return ok;
}

/**
 * Senden bei Start, Netz und Vordergrund einrichten. `beiQuittung(liste)`
 * bekommt je Sendelauf die bestätigten Stempel ([{ ev, daten }]) — auch die
 * im Hintergrund gesendeten.
 * Gibt eine Funktion zum Abbauen zurück.
 */
export function stempelSyncEinrichten(beiQuittung) {
  quittungsAbnehmer = beiQuittung || null;
  if (typeof window === "undefined") return () => {};
  const los = () => { stempelSenden({ sofort: true }).catch(() => {}); };
  const sichtbar = () => { if (document.visibilityState === "visible") los(); };
  window.addEventListener("online", los);
  window.addEventListener("focus", los);
  document.addEventListener("visibilitychange", sichtbar);
  los();
  return () => {
    window.removeEventListener("online", los);
    window.removeEventListener("focus", los);
    document.removeEventListener("visibilitychange", sichtbar);
    if (quittungsAbnehmer === beiQuittung) quittungsAbnehmer = null;
    if (pufferUhr) { clearTimeout(pufferUhr); pufferUhr = null; }
  };
}

/* ------------------------------ Schreiben -------------------------------- */
/**
 * Schreibt verzögert. Mehrere Änderungen kurz hintereinander werden zu einem
 * einzigen Aufruf zusammengefasst — sonst ginge bei jedem Tastendruck ein
 * Netzaufruf hinaus.
 *
 * onKonflikt wird gerufen, wenn jemand anderes inzwischen gespeichert hat;
 * onFachbefunde, wenn der Server warnende Befunde bestätigt haben will (WP-22).
 * Die Anwendung entscheidet dann, was geschieht — stillschweigend überschreiben
 * wäre die schlechteste aller Möglichkeiten.
 */
export function schreib(bestand, { durch, onKonflikt, onFehler, onGespeichert, onFachbefunde, onServerstand, sofort,
  onTeilLage, onTeilLokal } = {}) {
  /* onTeilLage(zustand): Konfliktfrage oder „neu laden" auf dem Teilweg (WP-48.5); onTeilLokal(bestand): der Teilweg
     hat den lokalen Stand neu aufgesetzt, die Oberfläche übernimmt ihn. Ohne Teilweg werden beide nie gerufen. */
  if (neuLadenSperre) return Promise.resolve();   // WP-48.5: nach Sicherung als Datei, vor dem Neuladen
  if (onFehler) letzteOnFehler = onFehler;
  /* Review #350: nach einem Löschlauf nichts mehr senden (ohne Teilweg nie gesetzt). */
  if (neuLadenPflicht) {
    pflichtAufnehmen({ bestand, durch, onKonflikt, onFehler, onGespeichert, onFachbefunde, onServerstand, onTeilLage, onTeilLokal });
    return Promise.resolve({ ok: false, gesperrt: true });
  }
  /* Review #350 M2: die Vorgabe „voll“ hängt am Auftrag; ein neuerer Auftrag, der einen wartenden ersetzt, übernimmt sie. */
  const vorgaben = vorgabenAus(offen, gescheitert && gescheitert.auftrag,
    { vollGewuenscht: vollEinmal, loeschlaufSpeichern: loeschlaufEinmal });
  vollEinmal = false; loeschlaufEinmal = false;
  offen = { bestand, durch, onKonflikt, onFehler, onGespeichert, onFachbefunde, onServerstand, onTeilLage, onTeilLokal,
    ...vorgaben };
  letzterBestand = bestand;
  if (uhr) clearTimeout(uhr);
  if (sofort) return jetztSchreiben();
  uhr = setTimeout(jetztSchreiben, WARTE);
  return Promise.resolve();
}

/* Ausnahmeweg Art. 16/17/18 (WP-19.0, zweiter Opus-Review): Die Angabe geht mit jedem Schreibvorgang
   hinaus, dessen Bestand die Änderung enthält (erkennt), und hängt am Auftrag (auftrag.ausnahme) — eine
   Wiederholung nach Netz-, Server- oder Sitzungsfehler (nochmalSchreiben) schickt sie erneut mit.
   Verworfen wird sie erst, wenn der Server annimmt (200), oder wenn er abweist (403, 409): Dann wird die
   lokale Änderung zurückgenommen — die Lage „ausnahmeZurueck" verlangt Neuladen (dritter Review F2;
   vorher war sie schon vor dem Senden verbraucht, und jeder Fehlschlag endete in „nur lesbar").
   Im lokalen Stand steht sie nie (sonst ginge sie mit jedem späteren Speichern wieder mit, H1). */
let einmalig = null;
/* Vierter Review N-2: Angaben, die gerade in einem Auftrag unterwegs sind bzw. schon angenommen wurden. */
const angabenUnterwegs = new WeakSet();
const angenommeneAngaben = new WeakSet();
/** @param {any} mandantId @param {any} angabe @param {(m: any) => boolean} erkennt */
export function ausnahmeMitschicken(mandantId, angabe, erkennt) { einmalig = { mandantId, angabe, erkennt }; }

/* Der letzte Schreibversuch, der nicht durchkam.

   Vorher wurde er weggeworfen: Bei einer abgelaufenen Sitzung kehrte
   jetztSchreiben() wortlos zurück, und die Arbeit war fort. Das trifft
   nicht selten — eine Sitzung endet nach dreißig Minuten Untätigkeit. Wer
   den Monatsplan offen stehen lässt, telefoniert, dann eine Schicht
   umträgt, hatte ohne diesen Zwischenspeicher nichts mehr davon.

   Er liegt im Arbeitsspeicher, nicht im Browser-Speicher. Ein Bestand kann
   mehrere Megabyte groß sein, und localStorage ist auf fünf begrenzt —
   ein halb geschriebener Bestand dort wäre schlimmer als keiner. */
let gescheitert = null;

/** Gibt es Arbeit, die nicht durchkam? */
export const ausstehend = () => (gescheitert ? { ...gescheitert.lage } : null);

/** Nimmt den letzten gescheiterten Versuch noch einmal auf. */
export async function nochmalSchreiben() {
  if (!gescheitert) return { ok: true, nichts: true };
  /* Review #350 H1: Ein Auftrag von vor einem Löschlauf geht nie mehr hinaus (er enthielte Gelöschtes). */
  if (neuLadenPflicht || gescheitert.gesperrt) return { ok: false, gesperrt: true };
  const a = gescheitert;
  gescheitert = null;
  offen = a.auftrag;
  await jetztSchreiben();
  return { ok: !gescheitert };
}

/** Der ausstehende Bestand, um ihn notfalls als Datei zu sichern. */
export const ausstehenderBestand = () => {
  if (!gescheitert) return null;
  if (!neuLadenPflicht) return gescheitert.auftrag.bestand;
  /* Review #350: nach einem Löschlauf mit Hinweis — und mit dem jüngsten Stand, falls danach noch eingegeben wurde. */
  return { hinweis: "Enthält den Stand von VOR dem Löschlauf. Gelöschtes bitte nicht wieder einspielen.",
    ausstehend: gescheitert.auftrag.bestand,
    ...(pflichtZuletzt && pflichtZuletzt !== gescheitert.auftrag.bestand ? { zuletzt: pflichtZuletzt } : {}) };
};

/** Verwirft ihn — nur auf ausdrückliche Ansage. */
export const ausstehendVerwerfen = () => { gescheitert = null; };

/** Woran lag es? Danach richtet sich, was zu tun ist. */
function fehlerart(e, status) {
  if (e && e.message === "nicht-angemeldet") return "abgemeldet";
  /* Ein Stempel ist ein Beleg (WP-06): Die Kopie widerspricht dem gespeicherten Stand — kein Rollenproblem,
     sondern ein veralteter Bestand. Der Rat ist „neu laden", nicht „Rolle prüfen". */
  if (status === 403 && e && e.code === "STEMPEL_UNVERAENDERLICH") return "stempelStand";
  if (status === 403) return "keinRecht";
  if (status === 413) return "zuGross";
  if (status && status >= 500) return "server";
  if (e && (e.name === "AbortError" || e.name === "TimeoutError")) return "netz";   // Zeitgrenze (B-2)
  if (e && e.teilNetz) return "netz";   // WP-48.5: Teilweg ohne Antwort (Ausgang unklar)
  if (e && (e.name === "TypeError" || /fetch|network|Failed to fetch/i.test(String(e.message))))
    return "netz";
  return "unbekannt";
}

/* Der laufende Schreibvorgang, damit man auf ihn warten kann (schreibenAbschliessen). */
let laufend = null;
function jetztSchreiben(beimSchliessen) {
  /* Vierter Review N-2: Schreibvorgänge laufen nacheinander. Ein zweiter, der mit dem alten ETag und
     derselben noch nicht verbrauchten Ausnahmeangabe losginge, bekäme einen 409 und löste einen
     falschen Alarm aus (die eigene Änderung würde verworfen). Er wartet auf den ersten und nimmt
     dann den neuen ETag; was er schreibt, holt er erst dann aus `offen`. */
  const vorher = laufend;
  /* Fünfter Review B-3: Beim Schließen (beforeunload/visibilitychange) wartet nichts auf einen laufenden
     Request — der Seitentod käme vor dessen Antwort. Es geht sofort hinaus (keepalive); eine Ausnahmeangabe,
     die schon unterwegs ist, hängt dank angabenUnterwegs/angenommeneAngaben nicht doppelt an. */
  if (beimSchliessen && vorher) {
    const sofort = schreibenAusfuehren(true);
    sofort.catch(() => {});
    return sofort;
  }
  const lauf = vorher ? vorher.catch(() => {}).then(() => schreibenAusfuehren(beimSchliessen)) : schreibenAusfuehren(beimSchliessen);
  laufend = lauf;
  lauf.finally(() => { if (laufend === lauf) laufend = null; });
  return lauf;
}

/**
 * Schreibt, was noch aussteht, sofort — und wartet auf einen laufenden
 * Vorgang. Vor dem Stempeln: Der Server ändert den Bestand dabei selbst;
 * wartete noch eine eigene Änderung mit dem alten ETag, liefe sie danach
 * in einen 409. Scheitert sie, bleibt sie wie jeder gescheiterte Versuch
 * erhalten (ausstehend, nochmalSchreiben) — das Stempeln hängt nicht davon ab.
 */
export async function schreibenAbschliessen() {
  if (laufend) await laufend.catch(() => {});
  if (offen) {
    if (uhr) { clearTimeout(uhr); uhr = null; }
    await jetztSchreiben().catch(() => {});
  }
}

/**
 * Felder, die nur der Server schreibt (WP-16, Nachtrag H-neu-1): der Monatsabschluss und das eingefrorene
 * Ist abgeschlossener Monate. Der Server übernimmt sie beim Speichern nie (abschlussAusGespeichert) und
 * behandelt „nicht mitgeschickt" als unverändert. Mitgeschickt blähten sie jeden Speichervorgang auf —
 * das eingefrorene Ist wächst mit jedem abgeschlossenen Monat, der Server nimmt höchstens 6 MB an.
 */
export const SERVER_FELDER = Object.freeze(["istEingefroren", "monatsabschluss"]);
export function ohneServerFelder(bestand) {
  if (!bestand || typeof bestand !== "object" || !Array.isArray(bestand.mandanten)) return bestand;
  return { ...bestand, mandanten: bestand.mandanten.map((m) => {
    if (!m || typeof m !== "object") return m;
    const aus = { ...m };
    for (const f of SERVER_FELDER) delete aus[f];
    return aus;
  }) };
}

/** Zufällige Anfragekennung für den Wiederholschutz des Teilwegs ([A-Za-z0-9_-], 24 Zeichen). */
const KENNUNG_ZEICHEN = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
function anfrageKennung() {
  const b = new Uint8Array(24);
  const c = typeof globalThis !== "undefined" ? globalThis.crypto : null;
  if (c && typeof c.getRandomValues === "function") c.getRandomValues(b);
  else for (let i = 0; i < b.length; i++) b[i] = Math.floor(Math.random() * 256);
  return Array.from(b, (x) => KENNUNG_ZEICHEN[x & 63]).join("");
}

/**
 * WP-48.5 Teil 2: ein Auftrag über den Teilweg (src/app/teilweg-steuerung.js). Rückgabe: `weiter` = mit dem Voll-PUT
 * fortfahren; `fehler` = wie ein gescheiterter Voll-PUT behandeln (NichtGespeichert, Wiederholen möglich).
 * @returns {Promise<{ weiter: boolean, status: number|null, fehler?: any }>}
 */
async function teilwegSchreiben(auftrag, beimSchliessen, vollGewuenscht, abbruch) {
  /* Läuft schon ein Teilweg-Auftrag (Schließen wartet nicht auf ihn): nicht dazwischen senden — der Zustand gehört
     dem laufenden. Der Auftrag bleibt ausstehend. */
  if (teilLaeuft) { if (!offen) offen = auftrag; return { weiter: false, status: null }; }
  teilLaeuft = true;
  let r;
  try {
    r = await teilSpeichern(teil, {
      bestand: auftrag.bestand, neuester: () => letzterBestand, durch: auftrag.durch, sitzung: sitzungsAbdruck(token),
      neueKennung: anfrageKennung, beimSchliessen: !!beimSchliessen, vollGewuenscht,
      senden: async (rumpf) => {
        try {
          const a = await ruf("bestand/teile", { method: "POST", ...(beimSchliessen ? { keepalive: true } : {}),
            ...(abbruch ? { signal: abbruch.signal } : {}), body: JSON.stringify(rumpf) });
          return { status: a.status, daten: a.daten || {} };
        } catch (e) {
          /* 401: abgewiesen, bevor etwas geschrieben wurde. Sonst ist der Ausgang unklar (Netz, Zeitgrenze). */
          if (e && e.message === "nicht-angemeldet") return { status: 401, daten: {} };
          return { status: null, netz: true };
        }
      },
      holen: async () => {
        try {
          const a = await ruf("bestand", abbruch ? { signal: abbruch.signal } : {});
          return { status: a.status, daten: a.daten, ausSpeicher: a.ausSpeicher };
        } catch (e) {
          if (e && e.message === "nicht-angemeldet") return { status: 401, daten: {} };
          return { status: null, netz: true };
        }
      },
      /* Neu aufgesetzt: frische Sicht plus eigene ausstehende Segmente. Sofort übernehmen (vor dem Senden), damit
         spätere Eingaben auf dem neuen Stand aufbauen; ein wartender älterer Auftrag ist darin enthalten. */
      uebernehmen: (b, e) => {
        letzterBestand = b;
        vollSperre = false;   // ETag des frischen GET gehört jetzt zum lokalen Stand
        if (e !== undefined && e !== null) etag = e;
        if (offen) {
          /* Review #350 M2: Der wartende Auftrag geht in diesem auf — seine Vorgabe „voll“ auch. */
          Object.assign(auftrag, vorgabenAus(offen));
          offen = null; if (uhr) { clearTimeout(uhr); uhr = null; }
        }
        if (auftrag.onTeilLokal) { try { auftrag.onTeilLokal(b); } catch { /* Anzeige */ } }
      },
    });
  } finally { teilLaeuft = false; }
  teil = r.teil;
  teilAuftrag = auftrag;
  /* `neu`: eine neue Frage bzw. „neu laden" (Fenster öffnen); sonst nur die Lage auffrischen (Frage schon offen). */
  const lage = () => { if (auftrag.onTeilLage && teil) { try { auftrag.onTeilLage(teil, { neu: r.ergebnis !== "gesperrt" }); } catch { /* Anzeige */ } } };
  switch (r.ergebnis) {
    case "gespeichert":
      gescheitert = null;
      if (auftrag.onGespeichert) { try { auftrag.onGespeichert(r.gesendet || auftrag.bestand); } catch { /* egal */ } }
      return { weiter: false, status: 200 };
    case "nichts":
      if (typeof r.grund === "string" && r.grund.endsWith("-beim-schliessen")) { if (!offen) offen = auftrag; }
      else gescheitert = null;
      return { weiter: false, status: null };
    case "konflikt": case "neuLaden": case "gesperrt":
      lage();
      return { weiter: false, status: 409 };
    case "voll": case "aus":
      if (r.bestand) auftrag.bestand = r.bestand;
      auftrag.teilRueckfall = true;
      if (r.ergebnis === "aus") teil = null;
      return { weiter: true, status: null };
    default: break;
  }
  /* fehler: wie ein gescheiterter Voll-PUT (gleiche Lagen in NichtGespeichert). */
  const a = r.antwort || { status: null, netz: true };
  const d = a.daten || {};
  if (a.netz) {
    const f = new Error(r.meldung || "Keine Verbindung.");
    /** @type {any} */ (f).teilNetz = true;
    return { weiter: false, status: null, fehler: f };
  }
  if (a.status === 401) return { weiter: false, status: 401, fehler: new Error("nicht-angemeldet") };
  if (a.status === 409 && Array.isArray(d.fachbefunde)) {
    /* WP-22: warnende Befunde — wie beim Voll-PUT nachfragen; die Bestätigung geht mit dem nächsten Delta hinaus
       (Kernfeld `bestaetigungen`). Den ETag dieser Antwort übernimmt der Teilweg nicht. */
    gescheitert = { auftrag, lage: { art: "bestaetigung", text: String(d.fehler || "Bestätigung nötig."), status: 409,
      zeit: new Date().toISOString() } };
    if (auftrag.onFachbefunde) auftrag.onFachbefunde(d);
    else if (auftrag.onFehler) auftrag.onFehler(gescheitert.lage);
    return { weiter: false, status: 409 };
  }
  const f = new Error(String((d.code === "PERSONALNUMMER_DOPPELT" ? d.text : null) || d.fehler || r.meldung
    || "Speichern fehlgeschlagen."));
  if (typeof d.code === "string") /** @type {any} */ (f).code = d.code;
  return { weiter: false, status: a.status, fehler: f };
}

async function schreibenAusfuehren(beimSchliessen) {
  if (!offen) return;
  /* Review #350: nach einem Löschlauf geht kein wartender Auftrag mehr hinaus (auch nicht beim Schließen). */
  if (neuLadenPflicht) { const a = offen; offen = null; uhr = null; pflichtAufnehmen(a); return; }
  const auftrag = offen; offen = null; uhr = null;
  let status = null;
  unterwegs += 1;
  /* Fünfter Review B-2: Ohne Zeitgrenze hielte ein hängender Request die Schreibkette (jetztSchreiben) dauerhaft. */
  const abbruch = typeof AbortController !== "undefined" ? new AbortController() : null;
  const zeitgeber = abbruch ? setTimeout(() => abbruch.abort(), SCHREIBEN_ZEITGRENZE) : null;
  try {
    /* WP-48.5 Teil 2: Teilweg, nur mit Fähigkeit `teile`. Ohne sie sind teil und teilRoh null — dieser Block wird
       übersprungen, und der Voll-PUT darunter läuft unverändert. Liefert der Teilweg „voll" (nicht darstellbar,
       nichts unklar) oder bietet der Server ihn nicht mehr an, geht es unten mit dem Voll-PUT weiter. */
    if (!teil && teilRoh) {
      const mid = auftrag.bestand && auftrag.bestand.session && auftrag.bestand.session.mandantId;
      if (mid) {
        teil = teilwegStart(teilRoh, mid);
        teilRoh = null;
        if (teil) teilGenutzt = true;
      }
    }
    if (teil) {
      const vollGewuenscht = !!(auftrag.ausnahme || (einmalig && !angabenUnterwegs.has(einmalig)) || auftrag.vollGewuenscht);
      const t = await teilwegSchreiben(auftrag, beimSchliessen, vollGewuenscht, abbruch);
      status = t.status;
      if (t.fehler) throw t.fehler;
      if (!t.weiter) return;
    }
    /* keepalive lässt die Anfrage das Schließen des Reiters überleben.
       Ohne das bricht der Browser sie ab, und die letzte Änderung ist
       verloren — genau in dem Moment, in dem niemand mehr hinsieht. */
    /* Die eigene Sitzung bleibt hier. Sie ist kein Betriebswissen, sondern
       der Zustand eines Browsers: wer gerade angemeldet ist. Mitgeschickt
       landete sie im gemeinsamen Bestand und galt beim nächsten Öffnen für
       jeden — samt der Kennung einer echten Person. Beim nächsten Laden
       entsteht sie ohnehin neu aus dem Zugangscode. */
    /* Eine Angabe, die schon in einem anderen Auftrag unterwegs ist, hängt nicht an einen zweiten.
       Serverfelder (Monatsabschluss, eingefrorenes Ist — WP-16) gehen nicht mit hinaus. */
    const angabe = auftrag.ausnahme || (einmalig && !angabenUnterwegs.has(einmalig) ? einmalig : null);
    const mit = mitEinmaligerAngabe(ohneServerFelder({ ...auftrag.bestand, session: null }), angabe);
    if (mit.verbraucht) { auftrag.ausnahme = angabe; angabenUnterwegs.add(angabe); }
    const hinaus = mit.bestand;
    /* Review #348 H1/P4: Nach einem 409 des Voll-PUT in einer Sitzung mit Teilweg geht kein Voll-PUT mehr hinaus, bis neu
       gelesen ist (frisches GET über den Teilweg oder Neuladen) — sonst überginge er die fremde Änderung ohne Abgleich.
       Ohne Teilweg ist vollSperre nie gesetzt. */
    if (vollSperre) {
      gescheitert = { auftrag, lage: { art: "vollGesperrt", text: "Gleichzeitig bearbeitet — erst neu laden.", status: 409,
        zeit: new Date().toISOString() } };
      if (auftrag.onFehler) auftrag.onFehler(gescheitert.lage);
      return;
    }
    /* Abgewiesen (403/409): Angabe verwerfen, lokale Änderung zurücknehmen — Neuladen (F2). */
    const ausnahmeAbgewiesen = (text) => {
      if (einmalig === auftrag.ausnahme) einmalig = null;
      auftrag.ausnahme = null;
      gescheitert = { auftrag, lage: { art: "ausnahmeZurueck", text, status, zeit: new Date().toISOString() } };
      if (auftrag.onFehler) auftrag.onFehler(gescheitert.lage);
    };
    auftrag.putGesendet = true;
    const antwort = await ruf("bestand", { method: "PUT",
      ...(beimSchliessen ? { keepalive: true } : {}),
      ...(abbruch ? { signal: abbruch.signal } : {}),
      body: JSON.stringify({ bestand: hinaus, etag, durch: auftrag.durch }) });
    status = antwort.status;
    const daten = antwort.daten;
    if (status === 409 && daten && Array.isArray(daten.fachbefunde)) {
      /* WP-22: kein Konflikt mit einem fremden Stand, sondern warnende
         Befunde, die der Server bestätigt haben will. Der Auftrag bleibt
         liegen; die Anwendung fragt nach und speichert mit Bestätigung neu. */
      /* Review #348 H1: In einer Sitzung mit Teilweg wird kein ETag aus einer Absage übernommen. */
      if (daten.etag && !teilGenutzt) etag = daten.etag;
      gescheitert = { auftrag, lage: { art: "bestaetigung", text: String(daten.fehler || "Bestätigung nötig."), status,
        zeit: new Date().toISOString() } };
      if (auftrag.onFachbefunde) auftrag.onFachbefunde(daten);
      else if (auftrag.onFehler) auftrag.onFehler(gescheitert.lage);
      return;
    }
    /* Auflage C (Datenreview PR #130): Personalnummer schon vergeben — kein Versionskonflikt (kein Konfliktfenster),
       sondern eine Absage mit dem Text des Servers. Der ETag wird NICHT aus der Antwort übernommen
       (Review d6c92e0, Befund 1): Die Absage bringt keinen Bestand mit. Bliebe ein neuerer Stand hängen, schriebe
       das nächste Speichern den eigenen veralteten Bestand ohne Konflikt über eine zwischenzeitliche fremde
       Änderung. Der ETag bleibt der Stand, gegen den dieser Client geschrieben hat. */
    if (status === 409 && daten && daten.code === "PERSONALNUMMER_DOPPELT") {
      const f = new Error(String(daten.text || daten.fehler || "Personalnummer schon vergeben."));
      f.code = daten.code;
      throw f;
    }
    if (status === 409) {
      /* Review #348 H1/P4: Mit Teilweg in der Sitzung bleibt der ETag der eigene; weitere Voll-PUTs sind gesperrt, bis
         neu gelesen ist (die Wahl im Konfliktfenster ist nur „Neu laden“ bzw. Datei sichern). Ohne Teilweg wie bisher. */
      if (teilGenutzt) vollSperre = true;
      else etag = daten.etag;
      /* Wurde dieselbe Angabe inzwischen angenommen, ist der 409 ein gewöhnlicher Konflikt (kein Alarm). */
      if (auftrag.ausnahme && angenommeneAngaben.has(auftrag.ausnahme)) auftrag.ausnahme = null;
      if (auftrag.ausnahme) { ausnahmeAbgewiesen(String(daten?.text || daten?.fehler || "Der Bestand hat sich geändert.")); return; }
      if (auftrag.onKonflikt) auftrag.onKonflikt(daten);
      return;
    }
    if (status === 403 && auftrag.ausnahme) { ausnahmeAbgewiesen(String(daten?.fehler || "Abgewiesen.")); return; }
    if (status !== 200) {
      const f = new Error(daten?.fehler || "Speichern fehlgeschlagen.");
      if (daten && typeof daten.code === "string") f.code = daten.code;
      throw f;
    }
    etag = daten.etag;
    gescheitert = null;
    /* WP-48.5: Rückfall vom Teilweg auf den Voll-PUT gelungen — dessen Basis und Versionen sind damit veraltet. Für den
       Rest der Sitzung bleibt es beim Voll-PUT, bis die Oberfläche wieder einen gelesenen Stand übernimmt. */
    if (auftrag.teilRueckfall) { teil = null; teilRoh = null; }
    /* Angenommen: erst jetzt ist die Angabe verbraucht. */
    if (auftrag.ausnahme) angenommeneAngaben.add(auftrag.ausnahme);
    if (auftrag.ausnahme && einmalig === auftrag.ausnahme) einmalig = null;
    /* Der Betreiber bekommt den gespeicherten Vertragsstand der Pakete zurück (Servertag, Pilot, Historie). */
    if (auftrag.onServerstand && daten.vertragsstand) { try { auftrag.onServerstand(daten.vertragsstand); } catch { /* egal */ } }
    if (auftrag.onGespeichert) { try { auftrag.onGespeichert(auftrag.bestand); } catch { /* egal */ } }
  } catch (e) {
    const art = fehlerart(e, status);
    /* Der Auftrag bleibt liegen, damit er sich wiederholen lässt. */
    gescheitert = { auftrag, lage: { art, text: String(e && e.message || e), status,
      zeit: new Date().toISOString() } };
    if (auftrag.onFehler) auftrag.onFehler({ ...gescheitert.lage, fehler: e });
  } finally {
    /* Review #350: Löschlauf per Speichern (Kundenrolle) gesendet und nicht sicher abgewiesen → neu laden Pflicht. */
    if (auftrag.loeschlaufSpeichern && auftrag.putGesendet && !(status && status >= 400 && status < 500) && !neuLadenPflicht) {
      neuLadenPflicht = true;
      if (!gescheitert) pflichtMelden();
    }
    /* Was während der Pflicht noch scheiterte (vorher gesendet, später gescheitert), wird nie wiederholt. */
    if (neuLadenPflicht && gescheitert && !gescheitert.gesperrt) { gescheitert = { ...gescheitert, gesperrt: true, lage: pflichtLage() }; pflichtMelden(); }
    if (auftrag.ausnahme) angabenUnterwegs.delete(auftrag.ausnahme);
    if (zeitgeber) clearTimeout(zeitgeber);
    unterwegs -= 1;
  }
}

/* ------------------------ Sicherung außer Haus --------------------------- */

/** Den vollständigen Bestand als eine Datei holen. */
export async function vollausgabe() {
  const { status, daten } = await ruf("vollausgabe");
  if (status !== 200) throw new Error(daten?.fehler || "Ausgabe fehlgeschlagen.");
  return daten;
}

/** Einen Sicherungsschlüssel anlegen. Er erscheint genau einmal. */
export async function schluesselAnlegen(tage) {
  const { status, daten } = await ruf("sicherungsschluessel",
    { method: "POST", body: JSON.stringify({ tage }) });
  if (status !== 200) throw new Error([daten?.fehler, daten?.text].filter(Boolean).join(" ") || "Anlegen fehlgeschlagen.");
  return daten;
}

/** Alles zur Übersicht der Sicherungsschlüssel: aktive, widerrufene (mit Grund), Zahl, Grenze und die Warnung zum Passwort. */
export async function schluesselUebersicht() {
  const { status, daten } = await ruf("sicherungsschluessel");
  if (status !== 200) throw new Error(daten?.fehler || "Abruf fehlgeschlagen.");
  return { schluessel: daten.schluessel || [], widerrufen: daten.widerrufen || [],
    aktiv: Number(daten.aktiv) || 0, grenze: Number(daten.grenze) || 5,
    standardTage: Number(daten.standardTage) || 90, warnung: String(daten.warnung || "") };
}

export async function schluesselListe() {
  const { status, daten } = await ruf("sicherungsschluessel");
  if (status !== 200) throw new Error(daten?.fehler || "Abruf fehlgeschlagen.");
  return daten.schluessel || [];
}

export async function schluesselWiderrufen(kennung) {
  const { status, daten } = await ruf("sicherungsschluessel",
    { method: "DELETE", body: JSON.stringify({ kennung }) });
  if (status !== 200) throw new Error(daten?.fehler || "Widerruf fehlgeschlagen.");
  return daten;
}

/** Vor dem Schließen des Fensters noch Ausstehendes wegschreiben. */
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", (e) => {
    /* WP-48.5: Auf dem Teilweg kann Ungespeichertes auch ohne wartenden Auftrag liegen (offene Frage, unklarer
       Ausgang, „neu laden") — dann nichts senden, aber nachfragen. Ohne Teilweg ist teilOffen() immer falsch. */
    /* Review #350: nach einem Löschlauf: nichts senden, aber nachfragen, solange Ungesichertes gescheitert ist. */
    const pflichtOffen = neuLadenPflicht && !!gescheitert && !gescheitert.gesichert;
    if (!offen && !teilOffen() && !pflichtOffen) return;
    if (offen && !neuLadenPflicht) jetztSchreiben(true);
    /* Zusätzlich nachfragen: keepalive ist zuverlässig, aber nicht
       garantiert. Bei einem Monatsplan wiegt eine Rückfrage leichter als
       eine verlorene Stunde Arbeit. */
    e.preventDefault();
    e.returnValue = "";
  });
  /* Der verlässlichere Zeitpunkt auf dem Telefon: Wegwischen der Anwendung
     löst kein beforeunload aus, wohl aber visibilitychange. */
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && offen) jetztSchreiben(true);
  });
}

/* --------------------------- Sicherungskopien ---------------------------- */
export async function sicherung() {
  const { status, daten } = await ruf("sicherung", { method: "POST" });
  /* Eine Absage ist keine angelegte Sicherung — vorher meldete die
     Oberfläche „Sicherung angelegt“, gleich was der Server sagte. */
  if (status !== 200) throw new Error(daten?.fehler || "Die Sicherung wurde nicht angelegt.");
  return daten;
}
export async function sicherungen() {
  const { status, daten } = await ruf("sicherungen");
  /* Eine Absage ist keine leere Liste (WP-25). */
  if (status !== 200) throw new Error(daten?.text || daten?.fehler || "Die Sicherungen ließen sich nicht laden.");
  return daten?.sicherungen || [];
}

/**
 * Den eigenen Betrieb aus einer Sicherung zurückspielen (WP-25). Vorher wird
 * Ausstehendes geschrieben — der Server spielt nur auf den Stand zurück, den
 * diese Sitzung zuletzt gesehen hat (ETag). Gibt { status, daten } zurück,
 * auch bei einer Absage; die Deutung steht in sicherungen-ui.js.
 */
export async function wiederherstellen(marke) {
  try { await schreibenAbschliessen(); } catch { /* der Server prüft den Stand ohnehin */ }
  if (schreibenAusstehend())
    return { status: 0, daten: { fehler: "Es wird noch gespeichert. Bitte kurz warten und erneut versuchen." } };
  if (gescheitert)
    return { status: 0, daten: { fehler: "Eine Änderung ist noch nicht gespeichert. Erst speichern oder verwerfen, dann zurückspielen." } };
  const { status, daten } = await ruf("wiederherstellen", { method: "POST", body: JSON.stringify({ marke, etag }) });
  if (status === 200 && daten && daten.etag !== undefined) etag = daten.etag;
  return { status, daten };
}

/* ==========================================================================
   ZUSTELLUNG
   E-Mail und Push. Beides scheitert lautlos, wenn es nicht eingerichtet ist —
   das Postfach in der Anwendung trägt die Mitteilung ohnehin.
   ========================================================================== */

/* --------------------------- Hilfe-Assistent (WP-I23) --------------------------- */

/** Was die Hilfe-Frage zeigen darf: { modus: "aus"|"suche"|"an" }. Jeder Fehler heißt aus. */
export async function hilfeStatus() {
  try {
    const r = await ruf("hilfe/status");
    return r.status === 200 && r.daten && typeof r.daten.modus === "string" ? r.daten : { modus: "aus" };
  } catch { return { modus: "aus" }; }
}

/** Eine Frage zur Bedienung. Die Frage steht nur im Rumpf dieser Anfrage und wird nicht gemerkt. */
export async function hilfeFrage(frage) {
  const r = await ruf("hilfe/frage", { method: "POST", body: JSON.stringify({ frage }) });
  return { status: r.status, daten: r.daten };
}

/** Was steht zur Verfügung? Push braucht einen Schlüssel, Mail einen Dienst. */
export async function zustellwerte() {
  try {
    const a = await fetch("/zustellung/schluessel");
    if (!a.ok) return { vapid: null, mail: false };
    return await a.json();
  } catch { return { vapid: null, mail: false }; }
}

/* E-9: Bestätigung der eigenen E-Mail-Adresse (Server: lib/mailbestaetigung.mjs).
   Ohne Schalter antwortet der Server 404 — dann zeigt die Oberfläche nichts. */
/** @returns {Promise<{modus: string, adresse: boolean, bestaetigt: boolean, ausstehend: boolean}|null>} */
export async function mailBestaetigungStand() {
  try {
    const a = await fetch("/zustellung/mailbestaetigung", { headers: kopf() });
    if (!a.ok) return null;
    return await a.json();
  } catch { return null; }
}
/** @returns {Promise<{ok: boolean, text?: string}>} */
async function mailBestaetigungRuf(weg, rumpf) {
  try {
    const a = await fetch(`/zustellung/mailbestaetigung/${weg}`, { method: "POST", headers: kopf(), body: JSON.stringify(rumpf || {}) });
    let d = null;
    try { d = await a.json(); } catch { /* leer */ }
    return a.ok ? { ok: true } : { ok: false, text: (d && (d.fehler || d.text)) || "Das hat nicht geklappt." };
  } catch { return { ok: false, text: "Keine Verbindung. Bitte später erneut versuchen." }; }
}
export const mailBestaetigungAnfordern = () => mailBestaetigungRuf("anfordern");
export const mailBestaetigen = (code) => mailBestaetigungRuf("bestaetigen", { code: String(code || "").slice(0, 40) });

/** Zustellung gespeicherter Mitteilungen anstoßen — nur ihre Kennungen
    (Commit 4). Empfänger, Wege und Texte bestimmt der Server. Fehler werden
    gemeldet, nicht geworfen. */
export async function zustellen(nachrichten) {
  if (!nachrichten || !nachrichten.length) return { ergebnis: [] };
  try {
    const a = await fetch("/zustellung/senden", { method: "POST", headers: kopf(),
      body: JSON.stringify({ nachrichten }) });
    if (!a.ok) return { ergebnis: [], fehler: `Status ${a.status}` };
    return await a.json();
  } catch (e) { return { ergebnis: [], fehler: String(e.message) }; }
}

const b64 = (s) => {
  const p = "=".repeat((4 - (s.length % 4)) % 4);
  const roh = atob((s + p).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...roh].map((c) => c.charCodeAt(0)));
};

/**
 * Push einschalten. Fragt den Browser um Erlaubnis — das muss aus einer
 * Nutzerhandlung heraus geschehen, sonst lehnen die Browser ab.
 */
export async function pushEinschalten(personId) {
  if (!("serviceWorker" in navigator) || !("PushManager" in window))
    throw new Error("Dieses Gerät unterstützt keine Mitteilungen.");
  const { vapid } = await zustellwerte();
  if (!vapid) throw new Error("Mitteilungen sind für diesen Betrieb noch nicht eingerichtet.");

  const erlaubnis = await Notification.requestPermission();
  if (erlaubnis !== "granted") throw new Error("Du hast Mitteilungen abgelehnt. "
    + "Das lässt sich in den Browsereinstellungen wieder ändern.");

  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  const vorhanden = await reg.pushManager.getSubscription();
  const anmeldung = vorhanden || await reg.pushManager.subscribe({
    userVisibleOnly: true, applicationServerKey: b64(vapid) });
  geraetMerken(anmeldung.endpoint);      // M1: fürs synchrone Abmelden

  /* Die Person kommt aus der Sitzung des Servers, nicht von hier — sonst
     ließe sich die Anmeldung einer Kollegin überschreiben. */
  const a = await fetch("/zustellung/anmelden", { method: "POST", headers: kopf(),
    body: JSON.stringify({ anmeldung: anmeldung.toJSON() }) });
  if (!a.ok) throw new Error("Die Anmeldung konnte nicht gespeichert werden.");
  return anmeldung.toJSON();
}

export async function pushAusschalten() {
  /* E-9: Der Server entfernt nur die Anmeldung dieses Geräts — der Endpunkt
     wird vor dem Abbestellen gelesen. */
  const g = await diesesGeraet();
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const s = reg && await reg.pushManager.getSubscription();
    if (s) await s.unsubscribe();
    geraetMerken(null);
  } catch { /* egal */ }
  try {
    await fetch("/zustellung/abmelden", { method: "POST", headers: kopf(), body: geraetRumpf(g) });
  } catch { /* egal */ }
}

/* --------------------------------------------------------------------------
   OFFLINEBETRIEB

   Der Dienstarbeiter wurde bisher nur registriert, wenn jemand
   Benachrichtigungen einschaltete. Ohne Netz zeigte die Anwendung die
   Fehlerseite des Browsers — im Kellergeschoss, im Parkhaus, im Funkloch.

   Er wird deshalb jetzt immer eingerichtet, still und ohne Nachfrage. Er
   fragt nichts ab und zeigt nichts an; er sorgt nur dafür, dass die
   Anwendung startet und der letzte Stand lesbar bleibt.
   -------------------------------------------------------------------------- */
export async function offlineEinrichten() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return false;
  try {
    await navigator.serviceWorker.register("/sw.js");
    pushGeraetAuffrischen().catch(() => {});   // E-9/M1: Merker für das synchrone Abmelden
    return true;
  } catch { return false; }
}

/** Beim Abmelden: den gespeicherten Bestand wegräumen. */
export async function offlineDatenLoeschen(inhaber = stempelInhaber()) {
  /* Der Stempelpuffer gehört dazu (Review A2): Bestätigtes der Person wird
     entfernt, Wartendes und Abgelehntes bleiben (kein stiller Verlust), ohne
     Standort, sobald quittiert oder abgelehnt. */
  if (inhaber) {
    try { await PUF.abmeldenAufraeumen(await pufferSpeicher(), inhaber); } catch { /* weiter */ }
    stempelPufferMelden().catch(() => {});
  }
  await offlineCacheLeeren();
}

/** Den gespeicherten Bestand wegräumen — beim Abmelden und bei jeder
    Anmeldung (Rollenwechsel, WP-37): Ein Gerät, das ohne Abmelden an eine
    andere Person ging, darf deren Bestand nicht offline zeigen. Beide Wege
    laufen unabhängig voneinander; fehlt der Dienstarbeiter, wird trotzdem
    gelöscht. */
export async function offlineCacheLeeren() {
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const ziel = (reg && (reg.active || reg.waiting)) || navigator.serviceWorker.controller;
    if (ziel) ziel.postMessage({ art: "daten-loeschen" });
  } catch { /* kein Dienstarbeiter — weiter mit dem unmittelbaren Löschen */ }
  /* Unmittelbar — der Dienstarbeiter kann gerade neu starten, und
     Personaldaten sollen dabei nicht liegen bleiben. */
  try {
    if (typeof caches !== "undefined")
      for (const n of await caches.keys()) if (n.startsWith("centric-daten-")) await caches.delete(n);
  } catch { /* egal */ }
}

export const pushMoeglich = () =>
  typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;
export const pushErlaubt = () =>
  typeof Notification !== "undefined" && Notification.permission === "granted";

/* --------------------------------------------------------------------------
   BETREIBER
   Zugänge erzeugen und einen leeren Betrieb anlegen. Beides nur mit
   Betreiber-Sitzung; der Server prüft das noch einmal.
   -------------------------------------------------------------------------- */

/* `zweifaktor`: der aktuelle Code aus der Authenticator-App (SI-P6). Der Server verlangt ihn, sobald für den
   Betreibercode ein zweiter Faktor eingerichtet ist (in der Auslieferung immer); ein Code gilt nur einmal. */
export async function zugaengeErzeugen(bestand, eintraege, zweifaktor = "") {
  const a = await fetch("/api/zugaenge", { method: "POST", headers: kopf(),
    body: JSON.stringify({ bestand, eintraege, ...(zweifaktor ? { zweifaktor } : {}) }) });
  const d = await a.json();
  if (!a.ok) {
    const e = new Error(d.fehler || "Zugänge konnten nicht erzeugt werden.");
    if (d.zweifaktor) e.zweifaktor = d.zweifaktor;
    if (d.grund) e.grund = d.grund;
    throw e;
  }
  return d.zugaenge;
}

/**
 * Ein- oder ausstempeln.
 *
 * Hinaus geht höchstens eine Messung (Breite, Länge, Genauigkeit) — und nur,
 * wenn die Geo-Prüfung im Betrieb eingeschaltet ist (sonst koord = null).
 * Standort, Radius, Uhrzeit und das Urteil liegen auf dem Server — im
 * Browser wäre alles davon manipulierbar, und eine Zeiterfassung, die sich
 * manipulieren lässt, belegt nichts.
 */
export async function stempeln(datum, art, koord, pause = null) {
  /* Ohne Position kann koord nur den Grund als Code tragen ({ grund }: keine_freigabe, timeout, nicht_verfuegbar);
     der Server prüft ihn gegen die Liste. Eine Koordinate geht nie zusammen mit einem Grund hinaus. */
  const ort = koord && typeof koord.lat === "number" && typeof koord.lon === "number" ? koord : null;
  /* Keine Zahl (etwa „abc" im Pausenfeld): keine Angabe senden — nicht NaN, das als null ankäme (Review WP-16). */
  const pauseZahl = pause !== null && pause !== undefined && pause !== "" ? Number(pause) : NaN;
  const body = JSON.stringify({ datum, art,
    ...(art === "ende" && Number.isFinite(pauseZahl) ? { pause: pauseZahl } : {}),
    lat: ort ? ort.lat : null, lon: ort ? ort.lon : null,
    accuracy: ort && typeof ort.accuracy === "number" ? ort.accuracy : null,
    ...(!ort && koord && typeof koord.grund === "string" ? { positionGrund: koord.grund } : {}) });
  /* 429 (WP-47): Der Server hat die Lastgrenze erreicht und NICHTS gespeichert.
     Das ist kein Fehler des Stempels, sondern eine Spitze (Schichtwechsel). Die
     Anfrage wird mit Retry-After höchstens zweimal wiederholt (je bis zu 15 s
     plus 0–20 % Streuung); die Stempelzeit ist die des Servers beim
     erfolgreichen Eintreffen, also höchstens ≈ 36 s später als das Tippen.
     Die Sperre je Person auf dem Server dauert 15 s (schutz.mjs) — eine
     Wiederholung kommt also nach ihrem Ende an. Bleibt es dabei, sagt die
     Meldung ehrlich, dass der Stempel noch NICHT erfasst ist. */
  let wiederholt = 0;
  for (;;) {
    const a = await fetch("/api/stempeln", { method: "POST", headers: kopf(), body });
    if (a.status === 429 && wiederholt < STEMPEL_429_WIEDERHOLUNGEN) {
      wiederholt += 1;
      await new Promise((r) => setTimeout(r, wartezeitMitStreuung(a)));
      continue;
    }
    let d = {};
    try { d = await a.json(); } catch { /* keine Antwort */ }
    if (a.status === 429)
      throw new Error("Gerade stempeln sehr viele gleichzeitig. Dein Stempel ist noch NICHT erfasst — bitte in einigen Sekunden noch einmal tippen.");
    if (!a.ok) throw new Error(d.text || d.fehler || "Das Stempeln hat nicht geklappt.");
    return d;
  }
}

/** Wiederholungen bei 429 (Lastgrenze) und die Wartezeit nach Retry-After, höchstens 15 s. */
export const STEMPEL_429_WIEDERHOLUNGEN = 2;
export function wartezeit429(antwort) {
  const s = Number(antwort && antwort.headers && antwort.headers.get && antwort.headers.get("retry-after"));
  return Math.min(15, Math.max(1, Number.isFinite(s) && s > 0 ? s : 5)) * 1000;
}

/** Streuung auf die Wartezeit (Review-Auflage M4): 0 bis 20 % länger, nie kürzer
    als Retry-After. Ohne Streuung kämen alle Geräte, die dieselbe Sperre traf,
    im selben Augenblick wieder — und liefen gemeinsam in die nächste. */
export const STEMPEL_429_STREUUNG = 0.2;
export function wartezeitMitStreuung(antwort, zufall = Math.random) {
  const z = Math.min(1, Math.max(0, Number(zufall()) || 0));
  return Math.round(wartezeit429(antwort) * (1 + STEMPEL_429_STREUUNG * z));
}

/**
 * Die eigene Zeit für einen vergangenen Diensttag bestätigen — „wie geplant"
 * (start und ende null) oder abweichend. Der Server prüft und antwortet
 * ausdrücklich; eine verworfene Angabe kommt als Fehler mit Grund zurück,
 * statt im allgemeinen Speichern still zu verschwinden.
 */
export async function zeitBestaetigen(datum, start, ende, grund, pause) {
  const a = await fetch("/api/zeit-bestaetigen", { method: "POST", headers: kopf(),
    body: JSON.stringify({ datum, start: start || null, ende: ende || null, grund: grund || "",
      ...(pause === undefined || pause === null || pause === "" ? {} : { pause: Number(pause) }) }) });
  let d = {};
  try { d = await a.json(); } catch { /* keine Antwort */ }
  if (!a.ok) throw new Error(d.text || d.fehler || "Die Zeit ließ sich nicht bestätigen.");
  return d;
}

/**
 * Die Ist-Zeit eines gestempelten Tages korrigieren (WP-06) — nur Leitung und
 * Planung. Der Stempel bleibt unverändert; die Korrektur wird mit Grund als
 * Ereignis angehängt. Antwort: der gespeicherte Stempel (eintrag) und die
 * abgeleitete Ist-Zeit (erfassung).
 */
/**
 * Krankmeldung in zwei Stufen (RB-2): aktion "melden" ({ personId, von, bis, notiz }), "vorlaeufig" oder
 * "endgueltig" ({ id }). Der Server prüft Rolle, Bereich und Status; die Antwort nennt Kennung und Status.
 */
export async function krankmeldung(aktion, angaben) {
  const a = await fetch("/api/krankmeldung", { method: "POST", headers: kopf(),
    body: JSON.stringify({ ...(angaben || {}), aktion }) });
  let d = {};
  try { d = await a.json(); } catch { /* keine Antwort */ }
  if (!a.ok) throw new Error(d.text || d.fehler || "Die Krankmeldung ließ sich nicht speichern.");
  return d;
}

export async function stempelKorrektur(personId, datum, start, ende, grund, pause) {
  const a = await fetch("/api/stempel-korrektur", { method: "POST", headers: kopf(),
    body: JSON.stringify({ personId, datum, start, ende, grund: grund || "",
      ...(pause === undefined || pause === null || pause === "" ? {} : { pause: Number(pause) }) }) });
  let d = {};
  try { d = await a.json(); } catch { /* keine Antwort */ }
  if (!a.ok) throw new Error(d.text || d.fehler || "Die Korrektur ließ sich nicht speichern.");
  return d;
}

/**
 * Einen Korrekturantrag stellen (WP-14): für den eigenen Stempel eines der letzten Tage
 * gewünschter Beginn, gewünschtes Ende, Pause (optional) und Grund.
 */
export async function korrekturAntrag(datum, start, ende, pause, grund) {
  const a = await fetch("/api/korrektur-antrag", { method: "POST", headers: kopf(),
    body: JSON.stringify({ datum, start, ende, grund: grund || "",
      ...(pause === undefined || pause === null || pause === "" ? {} : { pause: Number(pause) }) }) });
  let d = {};
  try { d = await a.json(); } catch { /* keine Antwort */ }
  if (!a.ok) throw new Error(d.text || d.fehler || "Der Antrag ließ sich nicht stellen.");
  return d;
}

/**
 * Monatsabschluss (WP-16): "abschliessen" (Leitung, Planung; bei offenen Prüffällen nur mit trotzPrueffaellen)
 * oder "wiederoeffnen" (nur Leitung, mit Grund). Antwort: der Eintrag des Monats und das Ereignis im Verlauf.
 * Ein Fehler trägt code und offen (Zahlen der offenen Punkte), damit die Oberfläche nachfragen kann, beim Lohnexport
 * dazu vormonate ({ offen, geaendert }: VORMONAT_OFFEN / VORMONAT_GEAENDERT, WP-16 Nachtrag vierter Review A-1).
 * trotzVormonat: { kategorie, grund } — die ausdrückliche Überstimmung offener oder geänderter Vormonate.
 */
export async function monatsabschluss(aktion, monat, { grund = "", trotzPrueffaellen = false, exportStand = null, trotzVormonat = null,
  anlass = "", differenz = null } = {}) {
  /* Lohnexport bestätigen (WP-16, Nachtrag dritter Review H-2): der Stand der ausgegebenen Datei. */
  const stand = exportStand && typeof exportStand === "object"
    ? { abdruck: exportStand.abdruck, stand: exportStand.stand, revision: exportStand.revision, zeilen: exportStand.zeilen } : {};
  const trotz = trotzVormonat && typeof trotzVormonat === "object"
    ? { trotzVormonat: true, vormonatKategorie: trotzVormonat.kategorie, vormonatGrund: trotzVormonat.grund } : {};
  const a = await fetch("/api/monatsabschluss", { method: "POST", headers: kopf(),
    body: JSON.stringify({ aktion, monat, grund: grund || "", ...(trotzPrueffaellen ? { trotzPrueffaellen: true } : {}), ...stand, ...trotz,
      /* Korrekturrevision (WP-16c): Anlass und die gesehene Differenz (Prüfsumme). */
      ...(anlass ? { anlass } : {}), ...(differenz ? { differenz } : {}) }) });
  let d = {};
  try { d = await a.json(); } catch { /* keine Antwort */ }
  if (!a.ok) {
    const f = new Error(d.text || d.fehler || "Der Monatsabschluss ließ sich nicht speichern.");
    f.code = d.code || null; f.offen = d.offen || null; f.vormonate = d.vormonate || null; f.differenz = d.differenz || null;
    throw f;
  }
  return d;
}

/**
 * Einen Korrekturantrag entscheiden (WP-14): "genehmigt" und "abgelehnt" (Leitung, Planung;
 * Ablehnung mit Begründung) oder "zurueckgezogen" (die antragstellende Person).
 */
export async function korrekturEntscheiden(personId, datum, antragId, entscheidung, begruendung) {
  const a = await fetch("/api/korrektur-entscheiden", { method: "POST", headers: kopf(),
    body: JSON.stringify({ personId, datum, antragId, entscheidung, begruendung: begruendung || "" }) });
  let d = {};
  try { d = await a.json(); } catch { /* keine Antwort */ }
  if (!a.ok) throw new Error(d.text || d.fehler || "Die Entscheidung ließ sich nicht speichern.");
  return d;
}

/**
 * Eine Selbstauskunft (Antrag, WP-15) entscheiden: "genehmigt" oder "abgelehnt" (Leitung, Planung; Ablehnung
 * mit Begründung) oder "zurueckgezogen" (die Person selbst). Antwort: antrag, eintrag (neuer Stand von
 * erfassung[Person|Tag]) und bei der Freigabe die Regelhinweise.
 */
export async function selbstauskunftEntscheiden(personId, datum, antragId, entscheidung, begruendung) {
  const a = await fetch("/api/selbstauskunft-entscheiden", { method: "POST", headers: kopf(),
    body: JSON.stringify({ personId, datum, antragId, entscheidung, begruendung: begruendung || "" }) });
  let d = {};
  try { d = await a.json(); } catch { /* keine Antwort */ }
  if (!a.ok) throw new Error(d.text || d.fehler || "Die Entscheidung ließ sich nicht speichern.");
  return d;
}

/**
 * Einen Zugang zurückziehen. Bis zu dieser Fassung gab es dafür keinen Weg:
 * Codes ließen sich anlegen, aber nie wieder abschalten.
 *
 * Entweder den Code selbst übergeben, seine Prüfsumme, die öffentliche
 * Demo-Kennung (id aus /api/demos), die gekürzte Kennung aus der
 * Verwalterübersicht, oder mit alleDesBetriebs sämtliche Zugänge des
 * Betriebs auf einmal — der eigene bleibt dabei bestehen.
 */
export async function zugangSperren({ code, pruefsumme, id, kennung, alleDesBetriebs } = {}) {
  const a = await fetch("/api/zugang-sperren", { method: "POST", headers: kopf(),
    body: JSON.stringify({ code, pruefsumme, id, kennung, alleDesBetriebs: !!alleDesBetriebs }) });
  const d = await a.json();
  /* `text` trägt den Satz, der weiterhilft — etwa, dass die Anmeldung
     jünger als zwanzig Minuten sein muss. */
  if (!a.ok) throw new Error(d.text || d.fehler || "Der Zugang konnte nicht gesperrt werden.");
  return d;
}

/**
 * Die Zugänge eines Raums — Betreiber, über die Sitzung. Ohne Codes, ohne
 * Prüfsummen; die gekürzte Kennung genügt zum Sperren, der eigene Zugang
 * ist als `eigen` markiert.
 */
export async function zugaengeUebersicht(raum) {
  /* Ohne Raum nimmt der Server den Raum der Sitzung — den Demoraum. */
  const { status, daten } = await ruf(`zugaenge-uebersicht${raum ? `?bestand=${encodeURIComponent(raum)}` : ""}`);
  if (status !== 200) throw new Error(daten?.text || daten?.fehler || "Die Übersicht konnte nicht geladen werden.");
  return daten;
}

export async function bestandAnlegen(bestand, inhalt, vorlage) {
  const a = await fetch("/api/bestand-anlegen", { method: "POST", headers: kopf(),
    body: JSON.stringify({ bestand, inhalt, vorlage }) });
  const d = await a.json();
  if (!a.ok) throw new Error(d.fehler || "Der Betrieb konnte nicht angelegt werden.");
  return d;
}

/* --------------------------------------------------------------------------
   KALENDER-FEED
   Der Verweis trägt ein eigenes Geheimnis, nicht die Sitzung — ein Kalender
   kann sich nicht anmelden.
   -------------------------------------------------------------------------- */

export async function kalenderEinrichten(personId, alt) {
  const a = await fetch("/kalender/einrichten", { method: "POST", headers: kopf(),
    body: JSON.stringify({ personId, alt: alt || null }) });
  const d = await a.json();
  if (!a.ok) throw new Error(d.fehler || "Der Kalender konnte nicht eingerichtet werden.");
  return d;
}

export async function kalenderDaten(geheim, name, betrieb, termine) {
  const a = await fetch("/kalender/daten", { method: "POST", headers: kopf(),
    body: JSON.stringify({ geheim, name, betrieb, termine }) });
  const d = await a.json();
  if (!a.ok) throw new Error(d.fehler || "Die Termine konnten nicht übertragen werden.");
  return d;
}

export async function kalenderLoeschen(geheim) {
  await fetch("/kalender/loeschen", { method: "POST", headers: kopf(),
    body: JSON.stringify({ geheim }) });
}

/** Auswertung für den Betriebsrat (WP-27): { status: "fertig", auswertung } oder { status: "berechnet", retryNachMs }. */
export async function brAuswertung() {
  const a = await fetch("/api/br-auswertung", { headers: kopf() });
  const d = await a.json().catch(() => ({}));
  if (!a.ok && a.status !== 202) throw new Error(d.fehler || "Die Auswertung konnte nicht geladen werden.");
  return d;
}

/** Betriebslage und Selbststarts — nur für den Betreiber. */
export async function lage(tage) {
  const a = await fetch(`/lage?tage=${tage || 30}`, { headers: kopf() });
  const d = await a.json();
  if (!a.ok) throw new Error(d.fehler || "Die Lage konnte nicht geladen werden.");
  return d;
}

/* WP-18: Einladungen. Die Leitung stellt für eine Person ihres Betriebs eine Einladung aus (mit Sitzung); die Person
   löst sie ohne Sitzung ein und bekommt dabei einmal ihren persönlichen Zugangscode. Geprüft wird serverseitig
   (server/lib/einladungen.mjs). */
export async function einladungAusstellen(personId, bestaetigung) {
  const a = await fetch("/api/einladung", { method: "POST", headers: kopf(), body: JSON.stringify({ personId,
    ...(bestaetigung ? { bestaetigung } : {}) }) });
  const d = await a.json().catch(() => ({}));
  /* B1: 403 mit `bestaetigung` heißt „frische Bestätigung nötig" — die Ansicht fragt danach. */
  if (!a.ok) throw Object.assign(new Error(d.fehler || "Die Einladung konnte nicht ausgestellt werden."),
    { status: a.status, bestaetigung: d.bestaetigung || null });
  return d;
}

/* WP-18 (B2): Liste der Einladungen des eigenen Betriebs — nur Metadaten, nie das Token. */
export async function einladungenListe() {
  const a = await fetch("/api/einladung/liste", { method: "POST", headers: kopf(), body: "{}" });
  const d = await a.json().catch(() => ({}));
  if (!a.ok) throw new Error(d.fehler || "Die Einladungen konnten nicht geladen werden.");
  return d;
}

export async function einladungWiderrufen(id) {
  const a = await fetch("/api/einladung/widerrufen", { method: "POST", headers: kopf(), body: JSON.stringify({ id }) });
  const d = await a.json().catch(() => ({}));
  if (!a.ok) throw new Error(d.fehler || "Die Einladung konnte nicht widerrufen werden.");
  return d;
}

export async function einladungAnnehmen(einladung) {
  /* B4: kein Referrer — die Einlöseseite gibt ihre Adresse nirgends weiter (das Token stand ohnehin nur im Fragment). */
  const a = await fetch("/api/einladung/annehmen", { method: "POST", headers: { "content-type": "application/json" },
    referrerPolicy: "no-referrer", body: JSON.stringify({ einladung }) });
  const d = await a.json().catch(() => ({}));
  if (!a.ok) throw new Error(d.fehler || "Die Einladung konnte nicht eingelöst werden.");
  return d;
}
