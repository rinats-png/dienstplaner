/* ==========================================================================
   DIENSTARBEITER

   Bis hierher tat diese Datei genau eines: Push-Mitteilungen entgegennehmen.
   Registriert wurde sie nur, wenn jemand Benachrichtigungen einschaltete.
   Ohne Netz zeigte die Anwendung die Fehlerseite des Browsers.

   Das trifft genau die Lage, für die CENTRIC gebaut ist. Ein Kellergeschoss
   im Pflegeheim, ein Parkhaus im Objektschutz, ein Funkloch auf der Fahrt
   zur Wache — und die Frage ist immer dieselbe: Wann fange ich an, und mit
   wem?

   Was jetzt ohne Netz geht:
     die Anwendung startet
     der zuletzt geladene Plan ist lesbar
     die Anwendung sagt, dass sie offline ist und wie alt der Stand ist

   Stempeln geht ohne Netz (WP-07) — aber nicht über diese Datei. Die
   Anwendung legt jedes Stempeln als Ereignis mit eigener Kennung im
   Stempelpuffer ab (src/stempelpuffer.js, IndexedDB) und sendet es selbst,
   sobald Netz da ist: beim Start, bei „online", im Vordergrund. Hier wird
   /api/stempeln nie abgefangen und nie aus einem Speicher beantwortet — eine
   gespeicherte Antwort wäre eine Quittung für einen Stempel, den der Server
   nie gesehen hat. Hintergrundsynchronisation (Background Sync) wird nicht
   genutzt: Safari/iOS kennt sie nicht, und der Dienstarbeiter müsste dafür
   den Zugang selbst halten.

   Was sonst nicht geht, und zwar mit Absicht: schreiben. Ein Schichttausch, der
   offline „gespeichert" aussieht und beim nächsten Netz mit dem Stand von
   drei anderen kollidiert, richtet mehr Schaden an als eine ehrliche
   Absage. Wer offline etwas ändert, sichert es als Datei — dafür gibt es
   die Leiste „Nicht gespeichert".

   ---------------------------------------------------------------------------
   Zwei Speicher, zwei Regeln

   schale  — Gerüst und Bauteile. Die Dateinamen tragen einen Hashwert des
             Inhalts, sind also unveränderlich: einmal geholt, für immer gültig.
   daten   — die letzte Antwort auf GET /api/bestand. Sie enthält
             Personaldaten und wird beim Abmelden gelöscht.
   ========================================================================== */

/* Die Fassungsnummer ist der einzige Hebel, mit dem sich ein festsitzender
   Zwischenspeicher lösen lässt. Der Browser holt sich diese Datei neu, wenn
   sich ihr Inhalt ändert — und beim Aktivieren wirft der Dienstarbeiter dann
   jeden Speicher weg, der nicht auf die neue Fassung lautet.

   Die Fassung wird nicht von Hand gezählt (WP-37): Beim Bauen ersetzt
   werkzeug/sw-fassung.mjs den Platzhalter durch einen Hashwert über den
   gesamten Bau (Dateinamen der Bauteile, Startseite, diese Datei). Jede neue
   Auslieferung ist damit eine neue Fassung, und jeder Speicher der alten
   wird beim Aktivieren verworfen. Im Entwicklungsbetrieb bleibt der
   Platzhalter stehen — er ist ein gültiger Name. */
const FASSUNG = "__CENTRIC_BUILD__";
const SCHALE = `centric-schale-${FASSUNG}`;
const DATEN = `centric-daten-${FASSUNG}`;

/* Was schon beim Einrichten geholt wird. Die Bauteile kommen beim ersten
   Aufruf dazu — ihre Namen kennt niemand vorher, sie entstehen beim Bauen. */
const GERUEST = [
  "/",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/favicon-32.png",
];

/**
 * Welche Bauteile lädt die Seite? Steht in der Startseite.
 *
 * Die Namen entstehen erst beim Bauen — sie tragen einen Hashwert des
 * Inhalts. Statt sie in einer zweiten Liste zu pflegen, die irgendwann
 * abweicht, wird die Startseite gelesen und ausgewertet. Eine Quelle.
 *
 * Ohne diesen Schritt war die Schale zwar gespeichert, die Bauteile aber
 * nicht: Beim allerersten Aufruf holt der Browser sie, bevor der
 * Dienstarbeiter die Kontrolle hat. Ohne Netz blieb die Seite dann leer.
 */
async function bauteileAusStartseite() {
  try {
    const a = await fetch("/", { cache: "reload" });
    if (!a.ok) return [];
    const html = await a.text();
    const aus = new Set();
    for (const m of html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)) aus.add(m[1]);
    return [...aus];
  } catch { return []; }
}

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(SCHALE);
    /* Einzeln, nicht als addAll: Fehlt eine Datei, soll nicht die ganze
       Einrichtung scheitern. */
    const alles = [...GERUEST, ...(await bauteileAusStartseite())];
    await Promise.all(alles.map((u) => c.add(u).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const name of await caches.keys())
      if (name.startsWith("centric-") && name !== SCHALE && name !== DATEN)
        await caches.delete(name);
    await self.clients.claim();
  })());
});

/** Die Oberfläche bittet ums Aufräumen — beim Abmelden. */
self.addEventListener("message", (e) => {
  if (e.data && e.data.art === "daten-loeschen") {
    e.waitUntil(caches.delete(DATEN));
  }
});

/* Wem gehört ein gespeicherter Bestand? Abgelegt wird nur ein Hashwert der
   Sitzungskennung, nie die Kennung selbst. */
const SITZUNGSKOPF = "x-centric-sitzung";
async function sitzungsmarke(req) {
  try {
    const a = req.headers && req.headers.get("authorization");
    if (!a) return null;
    const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(a));
    return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch { return null; }
}

const istBauteil = (url) =>
  url.pathname.startsWith("/assets/") || url.pathname.endsWith(".woff2");

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;                 // Schreiben nie abfangen
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;  // Fremdes nie anfassen
  /* Von der Schnittstelle nur der Bestand — /api/stempeln und alles andere
     geht immer unmittelbar ans Netz (WP-07). */
  if (url.pathname.startsWith("/api/") && url.pathname !== "/api/bestand") return;

  /* --- Gerüst: Netz zuerst, sonst die gespeicherte Seite ---------------
     Netz zuerst, damit eine neue Fassung sofort ankommt. Der Rückfall
     greift nur, wenn wirklich nichts geht. */
  if (req.mode === "navigate") {
    /* Nur die Anwendung selbst. Seiten, die der Server erzeugt (Einrichten,
       Kalender-Feed, Zustellung, Lage, Starten), gehen unmittelbar ans Netz:
       sie können Zugangsdaten oder Personendaten enthalten und dürfen weder
       als Gerüst gespeichert noch offline an ihrer Stelle gezeigt werden. */
    if (url.pathname !== "/" && url.pathname !== "/index.html") return;
    e.respondWith((async () => {
      try {
        const netz = await fetch(req);
        /* Nur eine erfolgreiche, unveränderte HTML-Antwort wird zum Gerüst —
           keine Fehlerseite, keine Weiterleitung. */
        if (netz.ok && !netz.redirected && /text\/html/i.test(netz.headers.get("content-type") || "")) {
          const c = await caches.open(SCHALE);
          c.put("/", netz.clone()).catch(() => {});
        }
        return netz;
      } catch {
        const c = await caches.open(SCHALE);
        return (await c.match("/")) || Response.error();
      }
    })());
    return;
  }

  /* --- Bauteile: Speicher zuerst --------------------------------------
     Der Dateiname trägt einen Hashwert des Inhalts. Ändert sich der
     Inhalt, ändert sich der Name — eine gespeicherte Datei kann deshalb
     nie veraltet sein. */
  if (istBauteil(url)) {
    e.respondWith((async () => {
      const c = await caches.open(SCHALE);
      const da = await c.match(req);
      if (da) return da;
      const netz = await fetch(req);
      if (netz.ok) c.put(req, netz.clone()).catch(() => {});
      return netz;
    })());
    return;
  }

  /* --- Der Bestand: Netz zuerst, sonst der letzte Stand ----------------
     Und wenn er aus dem Speicher kommt, steht das in der Antwort. Ein
     Plan, der aussieht wie der aktuelle und drei Tage alt ist, wäre
     schlimmer als gar keiner. */
  if (url.pathname === "/api/bestand") {
    e.respondWith((async () => {
      const sitzung = await sitzungsmarke(req);
      try {
        const netz = await fetch(req);
        /* Nur eine erfolgreiche Antwort auf eine Anfrage mit Sitzung. */
        if (netz.ok && sitzung) {
          const c = await caches.open(DATEN);
          const kopie = netz.clone();
          const kopf = new Headers(kopie.headers);
          kopf.set("x-centric-geholt", new Date().toISOString());
          kopf.set(SITZUNGSKOPF, sitzung);
          c.put("bestand", new Response(await kopie.blob(), {
            status: kopie.status, headers: kopf })).catch(() => {});
        }
        return netz;
      } catch (fehler) {
        const c = await caches.open(DATEN);
        const alt = await c.match("bestand");
        /* Der Stand gehört der Sitzung, mit der er geholt wurde. Wer sich mit
           einem anderen Zugang meldet (Rollenwechsel), bekommt ihn nie zu
           sehen — auch dann nicht, wenn das Aufräumen beim Abmelden ausblieb. */
        if (!alt || !sitzung || alt.headers.get(SITZUNGSKOPF) !== sitzung) throw fehler;
        const kopf = new Headers(alt.headers);
        kopf.delete(SITZUNGSKOPF);
        kopf.set("x-centric-offline", "ja");
        return new Response(await alt.blob(), { status: 200, headers: kopf });
      }
    })());
  }
});

/* ==========================================================================
   PUSH-MITTEILUNGEN
   Entgegennehmen, anzeigen, bei Klick öffnen.
   ========================================================================== */
/* WP-30: Der Server schickt nur einen Hinweis {titel, text, ziel} ohne
   Personen- und Inhaltsdaten (server/lib/zustellregeln.mjs). Dieser Teil der
   Datei ist von der Zwischenspeicherung oben getrennt: Er liest und schreibt
   keinen Speicher (caches), fängt keine Anfrage ab und hält den Inhalt einer
   Benachrichtigung nirgends fest — er zeigt sie an und ist fertig. Beim
   Klick wird nur ein Pfad der eigenen Herkunft geöffnet, nie eine fremde
   Adresse, die jemand in die Nutzlast geschrieben hätte. */
const kurz = (t, n) => String(t == null ? "" : t).slice(0, n);
/* Kein „//…“ am Anfang: das wäre eine protokollrelative fremde Adresse (Nachtrag Opus-Review B5). */
const eigenerPfad = (z) => (typeof z === "string" && /^\/(?!\/)[A-Za-z0-9/_-]{0,80}$/.test(z) ? z : "/");

self.addEventListener("push", (e) => {
  if (!e.data) return;
  let d = {};
  try { d = e.data.json(); } catch { d = { titel: "CENTRIC", text: "" }; }
  if (!d || typeof d !== "object") d = {};
  e.waitUntil(self.registration.showNotification(kurz(d.titel, 120) || "CENTRIC", {
    body: kurz(d.text, 200),
    icon: "/icon-192.png",
    badge: "/favicon-32.png",
    tag: typeof d.ziel === "string" && /^[a-z]{1,20}$/.test(d.ziel) ? d.ziel : "centric",
    data: { ziel: eigenerPfad(d.ziel) },
    lang: "de",
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const ziel = eigenerPfad(e.notification.data && e.notification.data.ziel);
  e.waitUntil((async () => {
    const fenster = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const f of fenster) if (f.url.startsWith(self.location.origin)) return f.focus();
    return self.clients.openWindow(ziel);
  })());
});
