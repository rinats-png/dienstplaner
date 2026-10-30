/* ==========================================================================
   STAGING-AUFRAEUMEN — entfernt genau die Wegwerfdaten der Gate-Proben

   Läuft ausschließlich im Staging-Container:
     node /app/werkzeug/staging-aufraeumen.mjs

   Keine Argumente, keine Muster, keine Suche nach „allem, was so ähnlich
   heißt". Die Liste der Räume steht hier fest:

     ppg-gate-a    Betrieb ppg-gate-a-m     (staging-smoke.mjs)
     ppg-gate-b    Betrieb ppg-gate-b-m     (staging-smoke.mjs)
     ppg-gate-geo  Betrieb ppg-gate-geo-m   (staging-geo.mjs)

   Vor dem Löschen wird jeder dieser Räume geprüft:
     - gibt es einen Bestand, enthält er genau den erwarteten Betrieb, und
       dessen Name beginnt mit „PPG-GATE“;
     - jeder Zugang des Raums trägt einen Namen mit „PPG-GATE“;
     - es gibt keine persönlichen Mitgliedschaften (Accounts) im Raum — die
       Proben legen keine an.
   Weicht irgendetwas ab, wird NICHTS gelöscht, in keinem der Räume (Exit 3).

   Gelöscht wird mit der Funktion des Produkts (lib/raumloeschung.mjs),
   dazu der Kalender-Index feedperson:<raum>:*, den sie nicht kennt.
   Danach wird nachgewiesen: Räume, Zugänge, Feeds, Sitzungen weg — und
   alle anderen Räume und Zugänge unverändert vorhanden.

   Ausgegeben werden nur Raumnamen und Anzahlen, keine Codes, Prüfsummen,
   Sitzungsmerkmale oder Feed-Geheimnisse.

   Exit 0: aufgeräumt und nachgewiesen (oder nichts zu tun) ·
   1: Löschen oder Nachweis gescheitert · 2: falscher Aufruf ·
   3: unklare Lage, nichts gelöscht.
   ========================================================================== */

import { getStore } from "../server/lib/ablage.mjs";
import { bestandLesen, raumBelegt } from "../server/lib/bestand.mjs";
import { raumLoeschen } from "../server/lib/raumloeschung.mjs";
import { sitzungsSpeicher } from "../server/lib/sitzungen.mjs";

const NAME = "STAGING-AUFRAEUMEN";
const MARKE = "PPG-GATE";
const RAEUME = Object.freeze({
  "ppg-gate-a": "ppg-gate-a-m",
  "ppg-gate-b": "ppg-gate-b-m",
  "ppg-gate-geo": "ppg-gate-geo-m",
});
const LISTE = Object.keys(RAEUME);

function abbruch(code, text) {
  console.error(`${NAME}: ABBRUCH — ${text}`);
  process.exit(code);
}
if (process.argv.length > 2) abbruch(2, "Dieses Werkzeug nimmt keine Argumente.");

const store = getStore({ name: "centric", consistency: "strong" });
const sitzungen = sitzungsSpeicher();
const gekennzeichnet = (s) => typeof s === "string" && s.startsWith(MARKE);

/** Alle Einträge eines Präfixes samt Inhalt. Lesefehler werfen. */
async function eintraege(ablage, praefix) {
  const { blobs } = await ablage.list({ prefix: praefix });
  const aus = [];
  for (const b of blobs) aus.push({ key: b.key, wert: await ablage.get(b.key, { type: "json" }) });
  return aus;
}

/** Was es außerhalb der Gate-Räume gibt — vorher und nachher zu vergleichen. */
async function fremdbestand() {
  const kerne = (await store.list({ prefix: "kern:" })).blobs.map((b) => b.key)
    .filter((k) => !LISTE.includes(k.slice("kern:".length))).sort();
  const konten = {};
  for (const { wert } of await eintraege(store, "konto:")) {
    const r = wert && wert.bestand;
    if (r && !LISTE.includes(r)) konten[r] = (konten[r] || 0) + 1;
  }
  return JSON.stringify({ kerne, konten });
}

/** Bestandsaufnahme eines Gate-Raums; Gründe, warum nicht gelöscht werden darf. */
async function aufnahme(raum, konten, feeds, mitglieder, sammel) {
  const gruende = [];
  const gelesen = await bestandLesen(store, raum);
  const belegt = await raumBelegt(store, raum);
  if (gelesen) {
    const m = Array.isArray(gelesen.bestand && gelesen.bestand.mandanten) ? gelesen.bestand.mandanten : [];
    if (m.length !== 1 || !m[0] || m[0].id !== RAEUME[raum])
      gruende.push(`erwartet genau Betrieb ${RAEUME[raum]}, gefunden: ${m.map((x) => x && x.id).join(", ") || "keinen"}`);
    else if (!gekennzeichnet(m[0].name)) gruende.push(`Betriebsname ohne Kennzeichnung ${MARKE}`);
  } else if (belegt) gruende.push("Raum belegt, Bestand aber nicht lesbar");
  const eigeneKonten = konten.filter((k) => k.wert && k.wert.bestand === raum);
  const ohneMarke = eigeneKonten.filter((k) => !gekennzeichnet(k.wert.name)).length;
  if (ohneMarke) gruende.push(`${ohneMarke} Zugang/Zugänge ohne Kennzeichnung ${MARKE}`);
  const sammelFremd = Object.values(sammel || {}).filter((k) => k && k.bestand === raum && !gekennzeichnet(k.name)).length;
  if (sammelFremd) gruende.push(`${sammelFremd} Altzugang/Altzugänge ohne Kennzeichnung`);
  const mitgl = mitglieder.filter((k) => k.split(":").length === 3 && k.split(":")[2] === raum).length;
  if (mitgl) gruende.push(`${mitgl} persönliche Mitgliedschaft(en) — die legen die Proben nie an`);
  const eigeneFeeds = feeds.filter((f) => f.wert && f.wert.bestand === raum).map((f) => f.key.slice("feed:".length));
  return { raum, gruende, vorhanden: !!gelesen || belegt || eigeneKonten.length > 0 || eigeneFeeds.length > 0,
    konten: eigeneKonten.length, feeds: eigeneFeeds };
}

const ergebnisse = [];
function pruef(name, ok, detail = "") {
  ergebnisse.push({ name, ok: !!ok });
  console.log(`  ${ok ? "BESTANDEN     " : "FEHLGESCHLAGEN"}  ${name}${!ok && detail ? ` — ${String(detail).slice(0, 300)}` : ""}`);
}

/* ================================ Lauf ================================== */

console.log(`${NAME} — feste Liste: ${LISTE.join(", ")}`);

let aufnahmen, vorher;
try {
  const konten = await eintraege(store, "konto:");
  const feeds = await eintraege(store, "feed:");
  const mitglieder = (await store.list({ prefix: "mitglied:" })).blobs.map((b) => b.key);
  const sammel = await store.get("konten", { type: "json" });
  aufnahmen = [];
  for (const raum of LISTE) aufnahmen.push(await aufnahme(raum, konten, feeds, mitglieder, sammel));
  vorher = await fremdbestand();
} catch (e) {
  abbruch(3, `Bestandsaufnahme nicht möglich (${String(e && e.message || e).slice(0, 160)}). Nichts gelöscht.`);
}

for (const a of aufnahmen)
  console.log(`  ${a.raum}: ${a.vorhanden ? `vorhanden, ${a.konten} Zugang/Zugänge, ${a.feeds.length} Feed(s)` : "nichts vorhanden"}`);
const unklar = aufnahmen.filter((a) => a.gruende.length);
if (unklar.length) {
  for (const a of unklar) for (const g of a.gruende) console.error(`  STOPP ${a.raum}: ${g}`);
  abbruch(3, "Mindestens ein Raum sieht nicht wie Gate-Wegwerfdaten aus. Nichts gelöscht — bitte von Hand ansehen.");
}

console.log("\nLöschen");
for (const a of aufnahmen.filter((x) => x.vorhanden)) {
  const r = await raumLoeschen(store, sitzungen, a.raum);
  let index = 0;
  for (const b of (await store.list({ prefix: `feedperson:${a.raum}:` })).blobs) { await store.delete(b.key); index++; }
  pruef(`${a.raum}: gelöscht (${r.geloescht} Einträge, ${index} Kalender-Index)`, r.vollstaendig,
    `${r.fehler.length} Fehler`);
}
if (!aufnahmen.some((x) => x.vorhanden)) console.log("  nichts zu tun");

console.log("\nNachweis");
const kontenNachher = await eintraege(store, "konto:");
const feedsNachher = await eintraege(store, "feed:");
const tNachher = await eintraege(sitzungen, "t:");
for (const a of aufnahmen) {
  pruef(`${a.raum}: kein Betrieb mehr`, !(await raumBelegt(store, a.raum)));
  pruef(`${a.raum}: keine Zugänge mehr`, !kontenNachher.some((k) => k.wert && k.wert.bestand === a.raum));
  const feedsWeg = !feedsNachher.some((f) => f.wert && f.wert.bestand === a.raum);
  let datenWeg = true;
  for (const h of a.feeds) if (await store.get(`feeddaten:${h}`, { type: "json" })) datenWeg = false;
  const indexWeg = (await store.list({ prefix: `feedperson:${a.raum}:` })).blobs.length === 0;
  pruef(`${a.raum}: keine Kalenderfeeds, Feeddaten oder Feed-Index mehr`, feedsWeg && datenWeg && indexWeg);
  pruef(`${a.raum}: keine Sitzungen mehr`, !tNachher.some((s) => s.wert && s.wert.bestand === a.raum));
  let reste = 0;
  for (const p of ["scherbe:", "stand:", "sicherung:", "raummitglied:", "push:", "zustellung:", "zustellclaim:"])
    reste += (await store.list({ prefix: `${p}${a.raum}:` })).blobs.length;
  pruef(`${a.raum}: keine Monatsscherben, Stände, Sicherungen oder Zustellvermerke mehr`, reste === 0, `${reste} Reste`);
}
pruef("alle anderen Räume und Zugänge unverändert vorhanden", (await fremdbestand()) === vorher);

const bestanden = ergebnisse.filter((x) => x.ok).length;
console.log(`\n${NAME}: ${bestanden}/${ergebnisse.length} bestanden`);
process.exit(bestanden === ergebnisse.length ? 0 : 1);
