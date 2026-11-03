/* ==========================================================================
   Messfühler für den Lasttest (WP-28) — wird dem Server vorgeladen:

     node --import ./werkzeug/last/messfuehler.mjs server.mjs

   Schreibt jede Sekunde eine JSON-Zeile in CENTRIC_LAST_MESSDATEI:
     { t, eldP50, eldP99, eldMax (ms), rss, heap (MB) }
   Ohne die Variable tut er nichts. Er ändert am Server nichts; im Bild und
   in der Produktion wird er nie geladen.
   ========================================================================== */
import { monitorEventLoopDelay } from "node:perf_hooks";
import { appendFileSync } from "node:fs";

const datei = process.env.CENTRIC_LAST_MESSDATEI;
if (datei) {
  const h = monitorEventLoopDelay({ resolution: 10 });
  h.enable();
  const ms = (ns) => Math.round((ns / 1e6) * 10) / 10;
  const mb = (b) => Math.round(b / 1048576);
  setInterval(() => {
    const m = process.memoryUsage();
    appendFileSync(datei, JSON.stringify({ t: Date.now(), eldP50: ms(h.percentile(50)), eldP99: ms(h.percentile(99)),
      eldMax: ms(h.max), rss: mb(m.rss), heap: mb(m.heapUsed) }) + "\n");
    h.reset();
  }, 1000).unref();
}
