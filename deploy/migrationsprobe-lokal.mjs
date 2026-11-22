/* Migrationsprobe (G5, Produktionsweg §4 K4): Kandidaten-Code gegen eine WEGWERFKOPIE einer Ablage, nur 127.0.0.1.
   Daten: Kopie einer Produktionssicherung nur mit Freigabe, sonst synthetisch mit 274bfa0 erzeugt.

     CENTRIC_APP=<Kandidat> CENTRIC_DATEN=<…/scratchpad/daten-mig…> CENTRIC_PFEFFER=<wie der Server> \
       node deploy/migrationsprobe-lokal.mjs

   Voraussetzung: der Kandidat läuft auf genau dieser Ablage unter http://127.0.0.1:3012. CENTRIC_BASIS darf nicht
   gesetzt sein. Je Raum: Lesen über die API, dann unverändert zurückschreiben; der Inhalt muss danach gleich sein
   (Schlüsselreihenfolge in Objekten zählt nicht, Reihenfolge in Listen schon). Exit 0 nur, wenn mindestens ein Raum
   geprüft und alles bestanden ist; 1 sonst; 3 bei verletzter Isolation. PUT 409 = „nicht geschrieben“ = FEHLGESCHLAGEN.
   Isolation: CENTRIC_DATEN liegt segmentgenau unter …/scratchpad/daten-mig[-…] (echter Pfad, ohne `..`, ohne UNC,
   ohne toten Link; unter Linux ohne „\“ in der Angabe).
   Frist: jeder HTTP-Aufruf endet nach CENTRIC_PROBE_FRIST_MS (Vorgabe 30000 ms); Ablauf = FEHLGESCHLAGEN, kein Hängen.
   CENTRIC_PROBE_PORT ändert nur den Port (Vorgabe 3012); der Rechner bleibt 127.0.0.1.
   Regeln in deploy/migrationsprobe-regeln.mjs. Das Skript läuft immer (kein Direktaufruf-Wächter, auch über Link).
   Betriebskennungen (K4-Zusatzpunkt) prüft deploy/betriebskennungen-pruefen.mjs (nur lesend, vor dem Kandidatenstart).
   Nicht ersetzt: K4 auf einer echten Kopie; K5, K9, K10 und Bild-Digests prüft diese Probe nicht. */
import path from "node:path"; import { pathToFileURL } from "node:url";
import { isolationGeprueft, inhaltGleich, schreibErgebnis, gesamtExit, holenMitFrist, fristAus, portAus }
  from "./migrationsprobe-regeln.mjs";

async function probe() {
  const APP = process.env.CENTRIC_APP, DATEN = process.env.CENTRIC_DATEN, BASIS = `http://127.0.0.1:${portAus()}`;
  const FRIST = fristAus();
  if (!APP || !isolationGeprueft(DATEN)) { console.log("ABBRUCH Isolation"); return 3; }
  const L = (r) => import(pathToFileURL(path.join(APP, r)).href);
  const { getStore } = await L("server/lib/ablage.mjs"); const { bestandLesen } = await L("server/lib/bestand.mjs");
  const { sitzungAnlegen } = await L("server/lib/sitzungen.mjs");
  const store = getStore({ name: "centric", consistency: "strong" });
  const http = async (p, o = {}) => { const { s, x } = await holenMitFrist(BASIS + p, { method: o.m || "GET", headers: { ...(o.t ? { authorization: "Bearer " + o.t } : {}), ...(o.b ? { "content-type": "application/json" } : {}) }, body: o.b ? JSON.stringify(o.b) : undefined }, FRIST); let d = {}; try { d = JSON.parse(x); } catch {} return { s, d, x }; };
  const raeume = (await store.list({ prefix: "kern:" })).blobs.map((b) => b.key.slice(5));
  const alt = (await store.list({ prefix: "bestand:" })).blobs.map((b) => b.key.slice(8));
  console.log(`Räume (kern:): ${raeume.length} · Altform bestand:: ${alt.length}`);
  let ok = 0, n = 0; const t = (name, c, d = "") => { n++; if (c) ok++; console.log(`${c ? "BESTANDEN      " : "FEHLGESCHLAGEN "} ${name} ${d}`); };
  for (const raum of [...new Set([...raeume, ...alt])]) {
    const lib = await bestandLesen(store, raum);
    const mand = lib?.bestand?.mandanten || [];
    const zahlen = mand.map((m) => `${(m.personen || []).length}P/${Object.keys(m.abweichungen || {}).length}A/${Object.keys(m.erfassung || {}).length}E`).join(",");
    const { token } = await sitzungAnlegen({ bestand: raum, name: "MIGRATIONSPROBE", rolle: "leitung", person: null, betrieb: 0 }, 600000);
    let g, voll;
    try { g = await http("/api/bestand", { t: token }); voll = await http("/api/bestand?voll=1", { t: token }); }
    catch (e) { t(`${raum}: lesbar über die API (200)`, false, String(e && e.message || e)); continue; }   // H6: kein Hängen
    const gleich = g.s === 200 && (g.d.bestand?.mandanten || []).length >= 1 && (voll.d.bestand?.mandanten || []).length === mand.length;
    t(`${raum}: lesbar über die API (200), ${mand.length} Betrieb(e) [${zahlen}]`, gleich, `HTTP ${g.s}`);
    if (g.s !== 200) continue;
    const vorher = voll.d.bestand;
    let w, nach;
    try {
      w = await http("/api/bestand", { m: "PUT", t: token, b: { bestand: vorher, etag: voll.d.etag, durch: "MIGRATIONSPROBE" } });
      nach = await http("/api/bestand?voll=1", { t: token });
    } catch (e) { t(`${raum}: unveränderter Schreibzyklus`, false, String(e && e.message || e)); continue; }
    const bitgleich = JSON.stringify(nach.d.bestand) === JSON.stringify(vorher);
    const inhalt = inhaltGleich(nach.d.bestand, vorher);
    const e = schreibErgebnis(w.s, inhalt);
    t(`${raum}: unveränderter Schreibzyklus geschrieben (PUT 200), Inhalt gleich${inhalt && !bitgleich ? " (nur Schlüsselreihenfolge anders)" : ""}`,
      e.bestanden, `${e.text}${w.d.fehler ? " " + w.d.fehler + " " + (w.d.text || "").slice(0, 120) : ""}`);
  }
  console.log(`\nMIGRATIONSPROBE: ${ok}/${n}`);
  return gesamtExit(ok, n);   // keine Räume = nichts belegt (fail-closed)
}

// Läuft immer (kein Direktaufruf-Wächter, Review #471 B1); Tests laden nur deploy/migrationsprobe-regeln.mjs.
process.exit(await probe());
