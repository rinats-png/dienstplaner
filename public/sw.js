/* Dienstarbeiter für Push-Mitteilungen.
   Hält sich absichtlich kurz: entgegennehmen, anzeigen, bei Klick öffnen. */
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
