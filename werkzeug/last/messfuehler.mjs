/* ==========================================================================
   Messfühler für den Lasttest (WP-28) — wird dem Server vorgeladen:

     node --import ./werkzeug/last/messfuehler.mjs server.mjs

   Schreibt jede Sekunde eine JSON-Zeile in CENTRIC_LAST_MESSDATEI:
     { t, eldP50, eldP99, eldMax (ms), rss, heap (MB), cpu (% eines Kerns),
       fs: { <Operation>: { n, ms } } }          (Summe in dieser Sekunde)
   `fs` zeigt, wie viel Zeit in Dateizugriffen steckt (fsync, rename, …) —
   daran lässt sich unterscheiden, ob eine Antwortzeit an der Sperre, an der
   Platte oder am Prozessor hängt. Ohne die Variable tut er nichts. Er
   ändert am Verhalten des Servers nichts (nur Zeitmessung um die Aufrufe);
   im Bild und in der Produktion wird er nie geladen.
   ========================================================================== */
import { monitorEventLoopDelay } from "node:perf_hooks";
import { appendFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import fsp from "node:fs/promises";

const datei = process.env.CENTRIC_LAST_MESSDATEI;
if (datei) {
  /** @type {Record<string, {n: number, ms: number}>} */
  let zaehler = {};
  const messen = (name, f) => function gemessen(...a) {
    const t0 = performance.now();
    const fertig = () => { const z = (zaehler[name] ||= { n: 0, ms: 0 }); z.n++; z.ms += performance.now() - t0; };
    const r = f.apply(this, a);
    if (r && typeof r.then === "function") return r.finally(fertig);
    fertig();
    return r;
  };
  for (const n of ["rename", "readFile", "readdir", "mkdir", "link", "unlink", "writeFile", "stat"])
    if (typeof fsp[n] === "function") fsp[n] = messen(n, fsp[n]);
  const origOpen = fsp.open;
  let patched = false;
  fsp.open = async function open(...a) {
    const fh = await origOpen.apply(this, a);
    if (!patched) {
      patched = true;
      const proto = Object.getPrototypeOf(fh);
      for (const n of ["sync", "write", "writeFile", "close", "readFile"])
        if (typeof proto[n] === "function") proto[n] = messen(`fh.${n}`, proto[n]);
    }
    return fh;
  };
  syncBuiltinESMExports();

  const h = monitorEventLoopDelay({ resolution: 10 });
  h.enable();
  const ms = (ns) => Math.round((ns / 1e6) * 10) / 10;
  const mb = (b) => Math.round(b / 1048576);
  let cpuVorher = process.cpuUsage(), tVorher = performance.now();
  setInterval(() => {
    const m = process.memoryUsage();
    const c = process.cpuUsage(), jetzt = performance.now();
    const cpu = Math.round(((c.user - cpuVorher.user + c.system - cpuVorher.system) / 1000 / (jetzt - tVorher)) * 100);
    cpuVorher = c; tVorher = jetzt;
    const fs = {};
    for (const [k, v] of Object.entries(zaehler)) fs[k] = { n: v.n, ms: Math.round(v.ms) };
    zaehler = {};
    appendFileSync(datei, JSON.stringify({ t: Date.now(), eldP50: ms(h.percentile(50)), eldP99: ms(h.percentile(99)),
      eldMax: ms(h.max), rss: mb(m.rss), heap: mb(m.heapUsed), cpu, fs }) + "\n");
    h.reset();
  }, 1000).unref();
}
