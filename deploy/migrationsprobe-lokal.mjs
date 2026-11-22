/* Migrationsprobe (G5, Produktionsweg §4 K4): Kandidaten-Code gegen eine WEGWERFKOPIE einer Ablage, nur 127.0.0.1.
   Daten: Kopie einer Produktionssicherung nur mit Freigabe, sonst synthetisch mit 274bfa0 erzeugt.

     CENTRIC_APP=<Kandidat> CENTRIC_DATEN=<…/scratchpad/daten-mig…> CENTRIC_PFEFFER=<wie der Server> \
       node deploy/migrationsprobe-lokal.mjs

   Voraussetzung: der Kandidat läuft auf genau dieser Ablage unter http://127.0.0.1:3012. CENTRIC_BASIS darf nicht
   gesetzt sein. Je Raum: Lesen über die API, dann unverändert zurückschreiben; der Inhalt muss danach gleich sein
   (Schlüsselreihenfolge in Objekten zählt nicht, Reihenfolge in Listen schon). Exit 0 nur, wenn mindestens ein Raum
   geprüft und alles bestanden ist; 1 sonst; 3 bei verletzter Isolation. */
import path from "node:path"; import { pathToFileURL } from "node:url";

/** Isolation: Ablage unter scratchpad/daten-mig… (Schrägstrich oder Backslash), kein CENTRIC_BASIS. */
export function isolationGeprueft(daten, env = process.env) {
  return typeof daten === "string" && /scratchpad[\\/]+daten-mig/.test(daten) && !env.CENTRIC_BASIS;
}

/** JSON-Wert mit sortierten Objektschlüsseln (Listen bleiben in ihrer Reihenfolge). */
const kanonisch = (x) => Array.isArray(x) ? x.map(kanonisch)
  : x && typeof x === "object" ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, kanonisch(x[k])])) : x;

/** Inhaltsgleich: gleiche Werte; nur die Reihenfolge der Schlüssel in Objekten darf abweichen. */
export function inhaltGleich(a, b) {
  return JSON.stringify(kanonisch(a)) === JSON.stringify(kanonisch(b));
}

async function probe() {
  const APP = process.env.CENTRIC_APP, DATEN = process.env.CENTRIC_DATEN, BASIS = "http://127.0.0.1:3012";
  if (!APP || !isolationGeprueft(DATEN)) { console.log("ABBRUCH Isolation"); return 3; }
  const L = (r) => import(pathToFileURL(path.join(APP, r)).href);
  const { getStore } = await L("server/lib/ablage.mjs"); const { bestandLesen } = await L("server/lib/bestand.mjs");
  const { sitzungAnlegen } = await L("server/lib/sitzungen.mjs");
  const store = getStore({ name: "centric", consistency: "strong" });
  const http = async (p, o = {}) => { const a = await fetch(BASIS + p, { method: o.m || "GET", headers: { ...(o.t ? { authorization: "Bearer " + o.t } : {}), ...(o.b ? { "content-type": "application/json" } : {}) }, body: o.b ? JSON.stringify(o.b) : undefined }); const x = await a.text(); let d = {}; try { d = JSON.parse(x); } catch {} return { s: a.status, d, x }; };
  const raeume = (await store.list({ prefix: "kern:" })).blobs.map((b) => b.key.slice(5));
  const alt = (await store.list({ prefix: "bestand:" })).blobs.map((b) => b.key.slice(8));
  console.log(`Räume (kern:): ${raeume.length} · Altform bestand:: ${alt.length}`);
  let ok = 0, n = 0; const t = (name, c, d = "") => { n++; if (c) ok++; console.log(`${c ? "BESTANDEN      " : "FEHLGESCHLAGEN "} ${name} ${d}`); };
  for (const raum of [...new Set([...raeume, ...alt])]) {
    const lib = await bestandLesen(store, raum);
    const mand = lib?.bestand?.mandanten || [];
    const zahlen = mand.map((m) => `${(m.personen || []).length}P/${Object.keys(m.abweichungen || {}).length}A/${Object.keys(m.erfassung || {}).length}E`).join(",");
    const { token } = await sitzungAnlegen({ bestand: raum, name: "MIGRATIONSPROBE", rolle: "leitung", person: null, betrieb: 0 }, 600000);
    const g = await http("/api/bestand", { t: token });
    const voll = await http("/api/bestand?voll=1", { t: token });
    const gleich = g.s === 200 && (g.d.bestand?.mandanten || []).length >= 1 && (voll.d.bestand?.mandanten || []).length === mand.length;
    t(`${raum}: lesbar über die API (200), ${mand.length} Betrieb(e) [${zahlen}]`, gleich, `HTTP ${g.s}`);
    if (g.s !== 200) continue;
    const vorher = voll.d.bestand;
    const w = await http("/api/bestand", { m: "PUT", t: token, b: { bestand: vorher, etag: voll.d.etag, durch: "MIGRATIONSPROBE" } });
    const nach = await http("/api/bestand?voll=1", { t: token });
    const bitgleich = JSON.stringify(nach.d.bestand) === JSON.stringify(vorher);
    const inhalt = inhaltGleich(nach.d.bestand, vorher);
    t(`${raum}: unveränderter Schreibzyklus akzeptiert, Inhalt gleich${inhalt && !bitgleich ? " (nur Schlüsselreihenfolge anders)" : ""}`,
      (w.s === 200 || w.s === 409) && inhalt, `PUT ${w.s}${w.d.fehler ? " " + w.d.fehler + " " + (w.d.text || "").slice(0, 120) : ""}`);
  }
  console.log(`\nMIGRATIONSPROBE: ${ok}/${n}`);
  return n > 0 && ok === n ? 0 : 1;   // keine Räume = nichts belegt (fail-closed)
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) process.exit(await probe());
