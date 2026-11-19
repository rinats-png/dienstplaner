/* ==========================================================================
   NUR FÜR PRÜFUNGEN (BE-2 A1) — der zweite Faktor eines Kontos als eigener, echter Prozess

   Ruft die echte Bibliothek (server/lib/kontofaktor.mjs) auf der Ablage unter
   CENTRIC_DATEN / CENTRIC_ZUSTAND auf, bei stehendem Server:

     node pruefungen/hilfen/be2-faktor.mjs beginnen    <accountId>
     node pruefungen/hilfen/be2-faktor.mjs bestaetigen <accountId> <code>
     node pruefungen/hilfen/be2-faktor.mjs pruefen     <accountId> <code>

   Ausgabe: das Ergebnis als JSON auf stdout (Geheimnis und Codes nur hier, nur
   für die Prüfung). Zusammen mit pruefungen/hilfen/em6-abbruch.mjs
   (NODE_OPTIONS=--import …) endet der Prozess hart direkt nach dem Schreiben
   der Ablage — vor dem Eintrag ins Konto-Widerrufbuch. Kommt in keinen
   Produktionscode.
   ========================================================================== */
import { getStore } from "../../server/lib/ablage.mjs";
import { kontoFaktorBeginnen, kontoFaktorBestaetigen, kontoFaktorPruefen } from "../../server/lib/kontofaktor.mjs";

const [art, accountId, code] = process.argv.slice(2);
const store = getStore({ name: "centric", consistency: "strong" });
let erg;
if (art === "beginnen") erg = await kontoFaktorBeginnen(store, accountId);
else if (art === "bestaetigen") erg = await kontoFaktorBestaetigen(store, accountId, code);
else if (art === "pruefen") erg = await kontoFaktorPruefen(store, accountId, code);
else { process.stderr.write("Aufruf: beginnen <accountId> | bestaetigen <accountId> <code> | pruefen <accountId> <code>\n"); process.exit(2); }
process.stdout.write(`${JSON.stringify(erg)}\n`);
