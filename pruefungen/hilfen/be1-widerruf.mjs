/* ==========================================================================
   NUR FÜR PRÜFUNGEN (BE-1) — ein Konto-Widerruf als eigener, echter Prozess

   Ruft die echte Bibliothek (server/lib/accounts.mjs) auf der Ablage unter
   CENTRIC_DATEN / CENTRIC_ZUSTAND auf, bei stehendem Server:

     node pruefungen/hilfen/be1-widerruf.mjs sperren   <accountId>
     node pruefungen/hilfen/be1-widerruf.mjs entziehen <accountId> <raum>

   Ausgabe: das Ergebnis als JSON auf stdout. Zusammen mit
   pruefungen/hilfen/em6-abbruch.mjs (NODE_OPTIONS=--import …) endet der
   Prozess hart direkt nach dem Schreiben der Ablage — vor dem Bucheintrag.
   Kommt in keinen Produktionscode.
   ========================================================================== */
import { getStore } from "../../server/lib/ablage.mjs";
import { accountSperren, mitgliedschaftEntziehen } from "../../server/lib/accounts.mjs";

const [art, accountId, raum] = process.argv.slice(2);
const store = getStore({ name: "centric", consistency: "strong" });
let erg;
if (art === "sperren") erg = await accountSperren(store, accountId);
else if (art === "entziehen") erg = await mitgliedschaftEntziehen(store, accountId, raum);
else { process.stderr.write("Aufruf: sperren <accountId> | entziehen <accountId> <raum>\n"); process.exit(2); }
process.stdout.write(`${JSON.stringify({ ok: !!(erg && erg.ok), kontobuch: erg && erg.kontobuch,
  widerrufWirksam: !!(erg && erg.widerrufWirksam) })}\n`);
