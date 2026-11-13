/* ==========================================================================
   NUR FÜR PRÜFUNGEN — harter Prozessabbruch mitten in einem Schreibvorgang

   Wird dem echten Server vorgeladen (node --import <diese Datei> server.mjs,
   hier über NODE_OPTIONS) und kommt in keinen Produktionscode: Es gibt im
   Server keine Einspeisestelle für Fehler. Diese Datei umwickelt die beiden
   Dateisystemaufrufe, mit denen die Ablage (server/lib/ablage.mjs) einen
   Schreibvorgang abschließt:

     rename(tmp, ziel)  atomarSchreiben — setJSON/set (Konten, Kern, Journal …)
     link(tmp, ziel)    atomarAnlegen   — setJSONWennNeu (einmal anlegbare Marken)

   Trifft das Ziel das Muster PRUEF_KILL_MUSTER (regulärer Ausdruck auf den
   Dateipfad), zählt der Aufruf. Beim PRUEF_KILL_NR-ten Treffer beendet sich
   der Prozess sofort und hart (SIGKILL; unter Windows TerminateProcess über
   process.kill) — kein finally, kein exit-Handler, keine Antwort:
     PRUEF_KILL_ZEITPUNKT=nach  (Vorgabe) nachdem die Datei geschrieben ist
     PRUEF_KILL_ZEITPUNKT=vor   bevor sie unter dem Zielnamen steht (die
                                Zwischendatei bleibt liegen wie nach einem
                                Absturz; der Neustart räumt sie weg)
   Ohne PRUEF_KILL_MUSTER tut die Datei nichts.

   Die Ablage importiert rename/link als benannte Exporte von
   node:fs/promises. syncBuiltinESMExports() überträgt die Umwicklung auf
   diese Bindungen; die Datei muss deshalb VOR der Ablage geladen werden
   (--import). Ob sie gegriffen hat, meldet sie auf stderr.
   ========================================================================== */
import { createRequire, syncBuiltinESMExports } from "node:module";

const require = createRequire(import.meta.url);
const fsp = require("node:fs/promises");

const roh = process.env.PRUEF_KILL_MUSTER;
if (roh) {
  const muster = new RegExp(roh);
  const nr = Math.max(1, Number(process.env.PRUEF_KILL_NR || 1));
  const vorher = process.env.PRUEF_KILL_ZEITPUNKT === "vor";
  let treffer = 0;
  const abbrechen = (ziel) => {
    process.stderr.write(`[kill-nach-schreiben] harter Abbruch ${vorher ? "vor" : "nach"} Treffer ${treffer}: ${ziel}\n`);
    process.kill(process.pid, "SIGKILL");
    /* Falls SIGKILL nicht sofort greift: nichts mehr tun. */
    for (;;) { /* warten auf das Ende */ }
  };
  for (const name of ["rename", "link"]) {
    const echt = fsp[name];
    fsp[name] = async function umwickelt(von, nach, ...rest) {
      const ziel = String(nach);
      const trifft = muster.test(ziel.replace(/\\/g, "/"));
      if (trifft && vorher && treffer + 1 === nr) { treffer += 1; abbrechen(ziel); }
      const ergebnis = await echt.call(this, von, nach, ...rest);
      if (trifft && !vorher && ++treffer === nr) abbrechen(ziel);
      if (trifft && vorher) treffer += 1;
      return ergebnis;
    };
  }
  syncBuiltinESMExports();
  process.stderr.write(`[kill-nach-schreiben] aktiv: /${roh}/ Treffer ${nr} ${vorher ? "vor" : "nach"} dem Schreiben\n`);
}
