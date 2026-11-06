/* ==========================================================================
   ROLLENLOSE ZUGÄNGE FINDEN — ausschließlich lesend (PR #93)

   Findet Zugangscodes und Betriebsmitgliedschaften OHNE gültige Rolle. Nach PR #93
   melden sie sich nicht mehr an. Das Skript liest nur (get, list); es schreibt, ändert,
   migriert und löscht nichts. Es gibt weder Codes noch Prüfsummen aus: Ein Zugang
   erscheint nur mit den letzten 8 Zeichen seiner Kennung, Betrieb und Name.

   Aufruf im laufenden Container (CENTRIC_DATEN und CENTRIC_ABLAGE sind dort gesetzt):
     docker exec -i <container> node --input-type=module < rollenlose-zugaenge-lesen.mjs
   Oder gegen eine KOPIE der Daten (empfohlen, wenn die Ablage nicht angefasst werden soll):
     CENTRIC_DATEN=/pfad/zur/kopie CENTRIC_ABLAGE=dateien node rollenlose-zugaenge-lesen.mjs
   Anderes Anwendungsverzeichnis: CENTRIC_APP=/app (Vorgabe).
   Ausgabe: lesbarer Bericht. Rückgabewert immer 0.
   ========================================================================== */
import path from "node:path";
import { pathToFileURL } from "node:url";
const APP = process.env.CENTRIC_APP || "/app";
const laden = (rel) => import(pathToFileURL(path.join(APP, rel)).href);
const { getStore } = await laden("server/lib/ablage.mjs");
const { alleKonten } = await laden("server/lib/konten.mjs");
const { BEKANNTE_ROLLEN } = await laden("server/lib/rechte.mjs");

const gueltig = (r) => typeof r === "string" && BEKANNTE_ROLLEN.includes(r);
const store = getStore({ name: "centric", consistency: "strong" });

const konten = await alleKonten(store);
const eintraege = Object.entries(konten).filter(([, k]) => k && typeof k === "object");
const ohneRolle = eintraege.filter(([, k]) => !gueltig(k.rolle));

const { blobs } = await store.list({ prefix: "mitglied:" });
const ohneRolleMitglied = [];
let mitgliedGesamt = 0;
for (const b of blobs) {
  const m = await store.get(b.key, { type: "json" });
  if (!m || typeof m !== "object") continue;
  mitgliedGesamt += 1;
  if (!gueltig(m.rolle)) ohneRolleMitglied.push({ schluessel: b.key, raum: m.raum || null, status: m.status || null, rolle: m.rolle });
}

const rolleText = (r) => (r === undefined ? "(fehlt)" : r === null ? "(null)" : JSON.stringify(r));
const zeilen = [];
zeilen.push("ROLLENLOSE ZUGÄNGE — nur lesend, nichts verändert");
zeilen.push(`Zugangscodes gesamt: ${eintraege.length}, ohne gültige Rolle: ${ohneRolle.length}`);
for (const [h, k] of ohneRolle)
  zeilen.push(`  Code …${String(h).slice(-8)}  Betrieb ${k.bestand ?? "?"}  Name ${k.name ?? "?"}  Rolle ${rolleText(k.rolle)}  gesperrt ${!!k.gesperrt}  angelegt ${k.angelegt ?? "?"}`);
zeilen.push(`Betriebsmitgliedschaften gesamt: ${mitgliedGesamt}, ohne gültige Rolle: ${ohneRolleMitglied.length}`);
for (const m of ohneRolleMitglied)
  zeilen.push(`  Mitgliedschaft ${m.schluessel}  Raum ${m.raum ?? "?"}  Status ${m.status ?? "?"}  Rolle ${rolleText(m.rolle)}`);
zeilen.push(ohneRolle.length + ohneRolleMitglied.length === 0
  ? "Ergebnis: Keine rollenlosen Zugänge. PR #93 hat keine Auswirkung auf bestehende Codes."
  : "Ergebnis: Betroffene Zugänge siehe oben. Vor dem Wechsel mit ausdrücklicher Rolle neu ausstellen (keine automatische Änderung).");
console.log(zeilen.join("\n"));
