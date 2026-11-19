/* Migrationsprobe: RC-Code gegen eine KOPIE der Produktionssicherung 2026-11-02 (nur Wegwerfkopie, nur 127.0.0.1). */
import path from "node:path"; import { pathToFileURL } from "node:url";
const APP = process.env.CENTRIC_APP, DATEN = process.env.CENTRIC_DATEN, BASIS = "http://127.0.0.1:3012";
if (!/scratchpad[\/]+daten-mig/.test(DATEN) || process.env.CENTRIC_BASIS) { console.log("ABBRUCH Isolation"); process.exit(3); }
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
  const vorher = JSON.stringify(voll.d.bestand);
  const w = await http("/api/bestand", { m: "PUT", t: token, b: { bestand: voll.d.bestand, etag: voll.d.etag, durch: "MIGRATIONSPROBE" } });
  const nach = await http("/api/bestand?voll=1", { t: token });
  t(`${raum}: unveränderter Schreibzyklus akzeptiert, Daten bitgleich`, (w.s === 200 || w.s === 409) && JSON.stringify(nach.d.bestand) === vorher, `PUT ${w.s}${w.d.fehler ? " " + w.d.fehler + " " + (w.d.text || "").slice(0, 120) : ""}`);
}
console.log(`\nMIGRATIONSPROBE: ${ok}/${n}`); process.exit(ok === n ? 0 : 1);
