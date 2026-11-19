/* ==========================================================================
   Bestände lesbar zählen — im Probe-Container (docker exec), gegen die
   wiederhergestellte Ablage unter CENTRIC_DATEN (/data).

   Nutzt dieselbe Leseschicht wie der Server (server/lib/bestand.mjs im
   Bild): Ein Bestand gilt als lesbar, wenn Kern und Scherben sich wieder
   zusammensetzen lassen. Zählt außerdem Mandanten und Konten.

   Ausgabe: letzte Zeile ist JSON. Exit 0 nur ohne Lesefehler.
   ========================================================================== */
const { getStore } = await import("/app/server/lib/ablage.mjs");
const { bestandLesen } = await import("/app/server/lib/bestand.mjs");

const store = getStore({ name: "centric", consistency: "strong" });
const raeume = new Set();
for (const p of ["kern:", "bestand:"]) {
  const { blobs } = await store.list({ prefix: p });
  for (const b of blobs) raeume.add(b.key.slice(p.length));
}

let lesbar = 0, fehler = 0, mandanten = 0;
for (const r of raeume) {
  try {
    const b = await bestandLesen(store, r);
    if (b && b.bestand && Array.isArray(b.bestand.mandanten)) {
      lesbar++;
      mandanten += b.bestand.mandanten.length;
    } else fehler++;
  } catch { fehler++; }
}
const { blobs: konten } = await store.list({ prefix: "account:" });

console.log(JSON.stringify({ bestaende: raeume.size, lesbar, fehler, mandanten,
  konten: konten.length }));
process.exit(fehler ? 1 : 0);
