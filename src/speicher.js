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

/** Wartet ein Schreibvorgang oder ist einer unterwegs? Dann ist der lokale
    Stand nicht der gespeicherte. */
export const schreibenAusstehend = () => !!offen || unterwegs > 0;
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

export function abmelden(still = false) {
  if (!still && token) ruf("abmelden", { method: "POST" }).catch(() => {});
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
    inhaber: typeof daten.inhaber === "string" ? daten.inhaber : null };
  stempelPufferMelden().catch(() => {});
  /* Jetzt ist der Inhaber bekannt: Wartendes senden — beim Start der
     Anwendung der Weg, auf dem ein offline erfasster Stempel nach einem
     Neustart hinausgeht. */
  if (!ausSpeicher && quittungsAbnehmer) stempelSenden().catch(() => {});
  return { bestand: daten.bestand, zugang, geaendert: daten.geaendert, durch: daten.durch,
    ausSpeicher: !!ausSpeicher, geholt };
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
export function schreib(bestand, { durch, onKonflikt, onFehler, onGespeichert, onFachbefunde, onServerstand, sofort } = {}) {
  offen = { bestand, durch, onKonflikt, onFehler, onGespeichert, onFachbefunde, onServerstand };
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
  const a = gescheitert;
  gescheitert = null;
  offen = a.auftrag;
  await jetztSchreiben();
  return { ok: !gescheitert };
}

/** Der ausstehende Bestand, um ihn notfalls als Datei zu sichern. */
export const ausstehenderBestand = () => (gescheitert ? gescheitert.auftrag.bestand : null);

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

async function schreibenAusfuehren(beimSchliessen) {
  if (!offen) return;
  const auftrag = offen; offen = null; uhr = null;
  let status = null;
  unterwegs += 1;
  /* Fünfter Review B-2: Ohne Zeitgrenze hielte ein hängender Request die Schreibkette (jetztSchreiben) dauerhaft. */
  const abbruch = typeof AbortController !== "undefined" ? new AbortController() : null;
  const zeitgeber = abbruch ? setTimeout(() => abbruch.abort(), SCHREIBEN_ZEITGRENZE) : null;
  try {
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
    /* Abgewiesen (403/409): Angabe verwerfen, lokale Änderung zurücknehmen — Neuladen (F2). */
    const ausnahmeAbgewiesen = (text) => {
      if (einmalig === auftrag.ausnahme) einmalig = null;
      auftrag.ausnahme = null;
      gescheitert = { auftrag, lage: { art: "ausnahmeZurueck", text, status, zeit: new Date().toISOString() } };
      if (auftrag.onFehler) auftrag.onFehler(gescheitert.lage);
    };
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
      if (daten.etag) etag = daten.etag;
      gescheitert = { auftrag, lage: { art: "bestaetigung", text: String(daten.fehler || "Bestätigung nötig."), status,
        zeit: new Date().toISOString() } };
      if (auftrag.onFachbefunde) auftrag.onFachbefunde(daten);
      else if (auftrag.onFehler) auftrag.onFehler(gescheitert.lage);
      return;
    }
    if (status === 409) {
      etag = daten.etag;
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
    if (!offen) return;
    jetztSchreiben(true);
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

/** Was steht zur Verfügung? Push braucht einen Schlüssel, Mail einen Dienst. */
export async function zustellwerte() {
  try {
    const a = await fetch("/zustellung/schluessel");
    if (!a.ok) return { vapid: null, mail: false };
    return await a.json();
  } catch { return { vapid: null, mail: false }; }
}

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

  /* Die Person kommt aus der Sitzung des Servers, nicht von hier — sonst
     ließe sich die Anmeldung einer Kollegin überschreiben. */
  const a = await fetch("/zustellung/anmelden", { method: "POST", headers: kopf(),
    body: JSON.stringify({ anmeldung: anmeldung.toJSON() }) });
  if (!a.ok) throw new Error("Die Anmeldung konnte nicht gespeichert werden.");
  return anmeldung.toJSON();
}

export async function pushAusschalten() {
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const s = reg && await reg.pushManager.getSubscription();
    if (s) await s.unsubscribe();
  } catch { /* egal */ }
  try {
    await fetch("/zustellung/abmelden", { method: "POST", headers: kopf() });
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
export async function einladungAusstellen(personId) {
  const a = await fetch("/api/einladung", { method: "POST", headers: kopf(), body: JSON.stringify({ personId }) });
  const d = await a.json().catch(() => ({}));
  if (!a.ok) throw new Error(d.fehler || "Die Einladung konnte nicht ausgestellt werden.");
  return d;
}

export async function einladungAnnehmen(einladung) {
  const a = await fetch("/api/einladung/annehmen", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ einladung }) });
  const d = await a.json().catch(() => ({}));
  if (!a.ok) throw new Error(d.fehler || "Die Einladung konnte nicht eingelöst werden.");
  return d;
}
