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

   Was nicht geht, und zwar mit Absicht: schreiben. Ein Schichttausch, der
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

const FASSUNG = "v3";
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

const istBauteil = (url) =>
  url.pathname.startsWith("/assets/") || url.pathname.endsWith(".woff2");

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;                 // Schreiben nie abfangen
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;  // Fremdes nie anfassen

  /* --- Gerüst: Netz zuerst, sonst die gespeicherte Seite ---------------
     Netz zuerst, damit eine neue Fassung sofort ankommt. Der Rückfall
     greift nur, wenn wirklich nichts geht. */
  if (req.mode === "navigate") {
    e.respondWith((async () => {
      try {
        const netz = await fetch(req);
        const c = await caches.open(SCHALE);
        c.put("/", netz.clone()).catch(() => {});
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
      try {
        const netz = await fetch(req);
        if (netz.ok) {
          const c = await caches.open(DATEN);
          const kopie = netz.clone();
          const kopf = new Headers(kopie.headers);
          kopf.set("x-centric-geholt", new Date().toISOString());
          c.put("bestand", new Response(await kopie.blob(), {
            status: kopie.status, headers: kopf })).catch(() => {});
        }
        return netz;
      } catch (fehler) {
        const c = await caches.open(DATEN);
        const alt = await c.match("bestand");
        if (!alt) throw fehler;
        const kopf = new Headers(alt.headers);
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
self.addEventListener("push", (e) => {
  if (!e.data) return;
  let d = {};
  try { d = e.data.json(); } catch { d = { titel: "CENTRIC", text: e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.titel || "CENTRIC", {
    body: d.text || "",
    icon: "/icon-192.png",
    badge: "/favicon-32.png",
    tag: d.ziel || "centric",
    data: { ziel: d.ziel || "/" },
    lang: "de",
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const ziel = (e.notification.data && e.notification.data.ziel) || "/";
  e.waitUntil((async () => {
    const fenster = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const f of fenster) if (f.url.includes(self.location.origin)) return f.focus();
    return self.clients.openWindow(ziel.startsWith("/") ? ziel : "/");
  })());
});
