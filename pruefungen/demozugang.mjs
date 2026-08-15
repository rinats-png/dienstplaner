/* ==========================================================================
   DEMOZUGÄNGE UND IHRE SPERRE

   Ein Demozugang steht ohne Code offen: Die Liste ist öffentlich, ein Klick
   genügt. Genau deshalb muss das Zurückziehen wirken — und zwar sofort.

   Es wirkte nicht. `zugang-sperren` setzte `gesperrt: true` auf dem Konto,
   und `anmelden` prüfte das auch. Die beiden Demopfade taten es nicht:
   `/api/demos` listete gesperrte Zugänge weiter auf, `/api/demo` ließ sie
   weiter herein. Wer einen Demozugang zurückzog, sah ihn danach unverändert
   auf der Startseite stehen.

   Aufgefallen ist es beim Aufräumen doppelt angelegter Demobetriebe: nach
   vier Sperrungen und drei Neuanlagen standen sieben Einträge in der Liste.

   Geprüft wird die ganze Kette, weil der Fehler in der Lücke zwischen ihren
   Gliedern saß:

     anlegen → listen → öffnen → sperren → nicht mehr listen → nicht mehr öffnen

   Aufruf:
     CENTRIC_ADMIN=<geheim> npx vite --port 5173 &
     npm run pruefung:demo
   ========================================================================== */

const BASIS = process.env.CENTRIC_BASIS || "http://localhost:5173";
const ADMIN = process.env.CENTRIC_ADMIN || "testgeheim";
const HERKUNFT = process.env.CENTRIC_HERKUNFT || "10.7.2.2";

let ok = 0, fehl = 0;
const pruef = (t, b, z) => { if (b) { ok++; console.log("  BESTANDEN ", t, z ? "— " + z : ""); }
  else { fehl++; console.log("  FEHLT     ", t, z ? "— " + z : ""); } };

const kopf = (extra = {}) => ({ "content-type": "application/json",
  "x-forwarded-for": HERKUNFT, ...extra });

/* --- Einen Demozugang anlegen --- */
const anlegen = await (await fetch(`${BASIS}/einrichten`, {
  method: "POST", headers: kopf({ authorization: `Bearer ${ADMIN}` }),
  body: JSON.stringify({ name: "Prüfbetrieb", bestand: "demo-pruefung",
    rolle: "leitung", betrieb: 0, demo: true, gruppe: "Prüfung" }),
})).json();
pruef("Demozugang angelegt", !!anlegen.zugangscode, anlegen.fehler || "");

/* --- Er steht in der öffentlichen Liste --- */
const liste1 = await (await fetch(`${BASIS}/api/demos`,
  { headers: { "x-forwarded-for": HERKUNFT } })).json();
const meiner = (liste1.demos || []).find((d) => d.bestand === "demo-pruefung");
pruef("erscheint in der öffentlichen Liste", !!meiner, meiner?.id);

/* --- Und lässt sich ohne Code öffnen --- */
const auf = await fetch(`${BASIS}/api/demo`, { method: "POST",
  headers: kopf(), body: JSON.stringify({ id: meiner?.id }) });
const aufD = await auf.json();
pruef("lässt sich ohne Code öffnen", auf.status === 200 && !!aufD.token, aufD.fehler || "");
pruef("die Sitzung trägt die Rolle des Zugangs", aufD.rolle === "leitung", aufD.rolle);

/* --- Aus dieser Sitzung heraus alle Zugänge des Raums zurückziehen --- */
const sperr = await (await fetch(`${BASIS}/api/zugang-sperren`, {
  method: "POST", headers: kopf({ authorization: `Bearer ${aufD.token}` }),
  body: JSON.stringify({ alleDesBetriebs: true }),
})).json();
pruef("Zugänge lassen sich zurückziehen", sperr.ok === true && sperr.gesperrt >= 1,
  `${sperr.gesperrt} gesperrt`);

/* --- Der Kern: danach ist er weg, in beiden Richtungen ---

   Vorher schlugen genau diese zwei fehl. Die Liste nannte ihn weiter, und
   das Öffnen ging weiter durch — die Sperre stand im Datensatz und wurde
   an dieser Stelle schlicht nicht gelesen.                              */
const liste2 = await (await fetch(`${BASIS}/api/demos`,
  { headers: { "x-forwarded-for": HERKUNFT } })).json();
pruef("erscheint danach nicht mehr in der Liste",
  !(liste2.demos || []).some((d) => d.id === meiner?.id),
  `${(liste2.demos || []).length} Einträge übrig`);

const nochmal = await fetch(`${BASIS}/api/demo`, { method: "POST",
  headers: kopf(), body: JSON.stringify({ id: meiner?.id }) });
pruef("lässt sich danach nicht mehr öffnen", nochmal.status === 403,
  `Status ${nochmal.status}`);

/* Die Kennung eines gesperrten Zugangs kennt womöglich noch jemand. Dass
   die Liste ihn verschweigt, ist Kosmetik — die Prüfung beim Öffnen ist
   die Sicherung. Deshalb steht sie hier eigenständig. */
const nochmalD = await nochmal.json();
pruef("und sagt auch, warum", /nicht mehr bereit/.test(nochmalD.fehler || ""),
  nochmalD.fehler);

console.log(`\n${ok} von ${ok + fehl} Prüfungen bestanden.`);
process.exit(fehl ? 1 : 0);
