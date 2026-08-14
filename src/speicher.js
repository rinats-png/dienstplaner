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
const SCHLUESSEL = "centric:token";
const GEMERKT = "centric:gemerkt";
const WARTE = 1200;          // Millisekunden, bis nach der letzten Änderung geschrieben wird

let token = null;
let etag = null;
let offen = null;            // ausstehender Schreibvorgang
let uhr = null;
let name = null;
let zugang = null;         // Rolle, Person und Betrieb aus dem Zugangscode

try {
  /* Erst die Sitzung dieses Reiters, dann der gemerkte Zugang. */
  token = sessionStorage.getItem(SCHLUESSEL);
  if (!token && localStorage.getItem(GEMERKT) === "ja")
    token = localStorage.getItem(SCHLUESSEL);
} catch { /* privater Modus */ }

const kopf = () => ({ "content-type": "application/json",
  ...(token ? { authorization: `Bearer ${token}` } : {}) });

async function ruf(pfad, opt = {}) {
  const a = await fetch(`/api/${pfad}`, { ...opt, headers: { ...kopf(), ...(opt.headers || {}) } });
  let d = null;
  try { d = await a.json(); } catch { /* leere Antwort */ }
  if (a.status === 401) { abmelden(true); throw new Error("nicht-angemeldet"); }
  return { status: a.status, daten: d };
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

export async function anmelden(zugangscode, merken) {
  const a = await fetch("/api/anmelden", { method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ zugangscode }) });
  const d = await a.json();
  if (!a.ok) throw new Error(d.fehler || "Anmeldung fehlgeschlagen.");
  token = d.token; name = d.name;
  zugang = { rolle: d.rolle, person: d.person, betrieb: d.betrieb, name: d.name, hinweis: d.hinweis };
  tokenAblegen(token, merken);
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
  token = d.token; name = d.name;
  zugang = { rolle: d.rolle, person: d.person, betrieb: d.betrieb, name: d.name };
  tokenAblegen(token, merken);
  return d;
}

export function abmelden(still = false) {
  if (!still && token) ruf("abmelden", { method: "POST" }).catch(() => {});
  token = null; etag = null; name = null; zugang = null;
  try {
    sessionStorage.removeItem(SCHLUESSEL);
    localStorage.removeItem(SCHLUESSEL);
    localStorage.removeItem(GEMERKT);
  } catch { /* egal */ }
}

/* ------------------------------- Lesen ----------------------------------- */
export async function lies() {
  const { status, daten } = await ruf("bestand");
  if (status !== 200) throw new Error(daten?.fehler || "Laden fehlgeschlagen.");
  etag = daten.etag;
  /* schreiben: "voll" | "eigenes" | "nein" — der Server sagt, was diese
     Rolle darf. Die Oberfläche darf weniger anbieten, niemals mehr. */
  zugang = { rolle: daten.rolle, person: daten.person, betrieb: daten.betrieb,
    name: daten.name, schreiben: daten.schreiben || "voll" };
  return { bestand: daten.bestand, zugang, geaendert: daten.geaendert, durch: daten.durch };
}

/* ------------------------------ Schreiben -------------------------------- */
/**
 * Schreibt verzögert. Mehrere Änderungen kurz hintereinander werden zu einem
 * einzigen Aufruf zusammengefasst — sonst ginge bei jedem Tastendruck ein
 * Netzaufruf hinaus.
 *
 * onKonflikt wird gerufen, wenn jemand anderes inzwischen gespeichert hat.
 * Die Anwendung entscheidet dann, was geschieht — stillschweigend überschreiben
 * wäre die schlechteste aller Möglichkeiten.
 */
export function schreib(bestand, { durch, onKonflikt, onFehler, sofort } = {}) {
  offen = { bestand, durch, onKonflikt, onFehler };
  if (uhr) clearTimeout(uhr);
  if (sofort) return jetztSchreiben();
  uhr = setTimeout(jetztSchreiben, WARTE);
  return Promise.resolve();
}

async function jetztSchreiben(beimSchliessen) {
  if (!offen) return;
  const auftrag = offen; offen = null; uhr = null;
  try {
    /* keepalive lässt die Anfrage das Schließen des Reiters überleben.
       Ohne das bricht der Browser sie ab, und die letzte Änderung ist
       verloren — genau in dem Moment, in dem niemand mehr hinsieht. */
    const { status, daten } = await ruf("bestand", { method: "PUT",
      ...(beimSchliessen ? { keepalive: true } : {}),
      body: JSON.stringify({ bestand: auftrag.bestand, etag, durch: auftrag.durch }) });
    if (status === 409) {
      etag = daten.etag;
      if (auftrag.onKonflikt) auftrag.onKonflikt(daten);
      return;
    }
    if (status !== 200) throw new Error(daten?.fehler || "Speichern fehlgeschlagen.");
    etag = daten.etag;
  } catch (e) {
    if (e.message === "nicht-angemeldet") return;
    if (auftrag.onFehler) auftrag.onFehler(e);
  }
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
  const { daten } = await ruf("sicherung", { method: "POST" });
  return daten;
}
export async function sicherungen() {
  const { daten } = await ruf("sicherungen");
  return daten?.sicherungen || [];
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

/** Aufträge an den Server geben. Fehler werden gemeldet, nicht geworfen. */
export async function zustellen(auftraege) {
  if (!auftraege || !auftraege.length) return { ergebnis: [] };
  try {
    const a = await fetch("/zustellung/senden", { method: "POST", headers: kopf(),
      body: JSON.stringify({ auftraege }) });
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

export const pushMoeglich = () =>
  typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;
export const pushErlaubt = () =>
  typeof Notification !== "undefined" && Notification.permission === "granted";

/* --------------------------------------------------------------------------
   BETREIBER
   Zugänge erzeugen und einen leeren Betrieb anlegen. Beides nur mit
   Betreiber-Sitzung; der Server prüft das noch einmal.
   -------------------------------------------------------------------------- */

export async function zugaengeErzeugen(bestand, eintraege) {
  const a = await fetch("/api/zugaenge", { method: "POST", headers: kopf(),
    body: JSON.stringify({ bestand, eintraege }) });
  const d = await a.json();
  if (!a.ok) throw new Error(d.fehler || "Zugänge konnten nicht erzeugt werden.");
  return d.zugaenge;
}

/**
 * Einen Zugang zurückziehen. Bis zu dieser Fassung gab es dafür keinen Weg:
 * Codes ließen sich anlegen, aber nie wieder abschalten.
 *
 * Entweder den Code selbst übergeben, seine Prüfsumme, oder mit
 * alleDesBetriebs sämtliche Zugänge des Betriebs auf einmal — der eigene
 * bleibt dabei bestehen.
 */
export async function zugangSperren({ code, pruefsumme, alleDesBetriebs } = {}) {
  const a = await fetch("/api/zugang-sperren", { method: "POST", headers: kopf(),
    body: JSON.stringify({ code, pruefsumme, alleDesBetriebs: !!alleDesBetriebs }) });
  const d = await a.json();
  if (!a.ok) throw new Error(d.fehler || "Der Zugang konnte nicht gesperrt werden.");
  return d;
}

export async function bestandAnlegen(bestand, inhalt) {
  const a = await fetch("/api/bestand-anlegen", { method: "POST", headers: kopf(),
    body: JSON.stringify({ bestand, inhalt }) });
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

/** Betriebslage und Selbststarts — nur für den Betreiber. */
export async function lage(tage) {
  const a = await fetch(`/lage?tage=${tage || 30}`, { headers: kopf() });
  const d = await a.json();
  if (!a.ok) throw new Error(d.fehler || "Die Lage konnte nicht geladen werden.");
  return d;
}
