/* ==========================================================================
   NUR FÜR PRÜFUNGEN (E-M6) — harter Prozessabbruch direkt nach einem Schreibvorgang

   Wird dem echten Server vorgeladen (NODE_OPTIONS=--import <file-URL dieser
   Datei>) und kommt in keinen Produktionscode: Es gibt im Server keine
   Einspeisestelle für Fehler. Umwickelt wird rename() aus node:fs/promises,
   mit dem die Ablage (server/lib/ablage.mjs, atomarSchreiben) und das
   Widerrufbuch (server/lib/widerrufbuch.mjs, buchSchreiben) einen
   Schreibvorgang abschließen.

   Trifft das Ziel das Muster EM6_ABBRUCH_MUSTER (regulärer Ausdruck auf den
   Pfad mit „/“), beendet sich der Prozess beim EM6_ABBRUCH_NR-ten Treffer
   sofort und hart (SIGKILL; unter Windows TerminateProcess) — NACHDEM die
   Datei unter ihrem Zielnamen steht: kein finally, kein exit-Handler, keine
   Antwort. So liegt der Abbruch genau zwischen zwei Schreibvorgängen.
   Ohne EM6_ABBRUCH_MUSTER tut die Datei nichts.

   syncBuiltinESMExports() überträgt die Umwicklung auf die benannten
   Exporte von node:fs/promises; die Datei muss deshalb VOR den Modulen der
   Anwendung geladen werden (--import). Sie meldet sich auf stderr.
   ========================================================================== */
import { createRequire, syncBuiltinESMExports } from "node:module";

const require = createRequire(import.meta.url);
const fsp = require("node:fs/promises");

const roh = process.env.EM6_ABBRUCH_MUSTER;
if (roh) {
  const muster = new RegExp(roh);
  const nr = Math.max(1, Number(process.env.EM6_ABBRUCH_NR || 1));
  let treffer = 0;
  const echt = fsp.rename;
  fsp.rename = async function umwickelt(von, nach, ...rest) {
    const ergebnis = await echt.call(this, von, nach, ...rest);
    const ziel = String(nach).replace(/\\/g, "/");
    if (muster.test(ziel) && ++treffer === nr) {
      process.stderr.write(`[em6-abbruch] harter Abbruch nach Treffer ${treffer}: ${ziel}\n`);
      process.kill(process.pid, "SIGKILL");
      for (;;) { /* warten auf das Ende */ }
    }
    return ergebnis;
  };
  syncBuiltinESMExports();
  process.stderr.write(`[em6-abbruch] aktiv: /${roh}/ Treffer ${nr}\n`);
}
