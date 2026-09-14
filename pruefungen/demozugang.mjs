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

/* --- Derselbe Zugang ein zweites Mal: abgewiesen ---

   Das Bereitstellungsskript lief einmal zweimal, und jeder Demobetrieb
   stand doppelt auf der Startseite. Der Server hält jetzt dagegen: Ein
   zweiter aktiver Demozugang für denselben Betrieb und dieselbe Rolle
   bekommt 409 und den Verweis auf den vorhandenen.                       */
const nochmalAnlegen = await fetch(`${BASIS}/einrichten`, {
  method: "POST", headers: kopf({ authorization: `Bearer ${ADMIN}` }),
  body: JSON.stringify({ name: "Prüfbetrieb", bestand: "demo-pruefung",
    rolle: "leitung", betrieb: 0, demo: true, gruppe: "Prüfung" }),
});
const doppeltD = await nochmalAnlegen.json();
pruef("ein zweiter gleicher Demozugang wird mit 409 abgewiesen",
  nochmalAnlegen.status === 409, `Status ${nochmalAnlegen.status}`);
pruef("und nennt den vorhandenen", !!(doppeltD.vorhanden && doppeltD.vorhanden.id),
  doppeltD.vorhanden?.id);
pruef("ohne einen Code zu erzeugen", !doppeltD.zugangscode);

/* Ein anderer Betrieb im selben Raum ist kein Duplikat. */
const zweiter = await (await fetch(`${BASIS}/einrichten`, {
  method: "POST", headers: kopf({ authorization: `Bearer ${ADMIN}` }),
  body: JSON.stringify({ name: "Prüfbetrieb Zwei", bestand: "demo-pruefung",
    rolle: "leitung", betrieb: 1, demo: true, gruppe: "Prüfung" }),
})).json();
pruef("ein anderer Betrieb im selben Raum geht durch", !!zweiter.zugangscode, zweiter.fehler || "");

/* --- Er steht in der öffentlichen Liste --- */
const liste1 = await (await fetch(`${BASIS}/api/demos`,
  { headers: { "x-forwarded-for": HERKUNFT } })).json();
const meiner = (liste1.demos || []).find((d) => d.bestand === "demo-pruefung" && d.betrieb === 0);
const anderer = (liste1.demos || []).find((d) => d.bestand === "demo-pruefung" && d.betrieb === 1);
pruef("erscheint in der öffentlichen Liste", !!meiner, meiner?.id);
pruef("der zweite Betrieb ebenso", !!anderer, anderer?.id);
pruef("die Liste nennt keinen Code und keine Prüfsumme",
  !/zugangscode|pruefsumme|[0-9a-f]{64}/i.test(JSON.stringify(liste1)));

/* --- Und lässt sich ohne Code öffnen --- */
const auf = await fetch(`${BASIS}/api/demo`, { method: "POST",
  headers: kopf(), body: JSON.stringify({ id: meiner?.id }) });
const aufD = await auf.json();
pruef("lässt sich ohne Code öffnen", auf.status === 200 && !!aufD.token, aufD.fehler || "");
pruef("die Sitzung trägt die Rolle des Zugangs", aufD.rolle === "leitung", aufD.rolle);

/* --- Genau einen Eintrag über seine öffentliche Kennung zurückziehen ---

   Das ist der Weg der Betreiberkonsole: Sie sieht dieselbe Liste wie die
   Startseite und zieht den einen Eintrag zurück, der zu viel ist — ohne
   den Code, den nach dem Anlegen niemand mehr hat.                       */
const aufB = await (await fetch(`${BASIS}/api/demo`, { method: "POST",
  headers: kopf(), body: JSON.stringify({ id: anderer?.id }) })).json();
const sperrId = await (await fetch(`${BASIS}/api/zugang-sperren`, {
  method: "POST", headers: kopf({ authorization: `Bearer ${aufD.token}` }),
  body: JSON.stringify({ id: anderer?.id }),
})).json();
pruef("ein Demozugang lässt sich über seine Kennung zurückziehen",
  sperrId.ok === true && sperrId.gesperrt === 1, JSON.stringify(sperrId));
pruef("seine laufende Sitzung endet mit", sperrId.sitzungenBeendet === 1,
  `${sperrId.sitzungenBeendet} beendet`);
const listeId = await (await fetch(`${BASIS}/api/demos`,
  { headers: { "x-forwarded-for": HERKUNFT } })).json();
pruef("er fehlt danach in der Liste", !(listeId.demos || []).some((d) => d.id === anderer?.id));
pruef("der andere steht noch drin", (listeId.demos || []).some((d) => d.id === meiner?.id));
const nachId = await fetch(`${BASIS}/api/bestand`, { headers: kopf({ authorization: `Bearer ${aufB.token}` }) });
pruef("seine Sitzung ist wertlos", nachId.status === 401, `Status ${nachId.status}`);
const nochEinmal = await (await fetch(`${BASIS}/api/zugang-sperren`, {
  method: "POST", headers: kopf({ authorization: `Bearer ${aufD.token}` }),
  body: JSON.stringify({ id: anderer?.id }),
})).json();
pruef("ein zweites Zurückziehen sperrt nichts mehr", nochEinmal.gesperrt === 0,
  `${nochEinmal.gesperrt} gesperrt`);
const erfunden = await (await fetch(`${BASIS}/api/zugang-sperren`, {
  method: "POST", headers: kopf({ authorization: `Bearer ${aufD.token}` }),
  body: JSON.stringify({ id: "d00000000" }),
})).json();
pruef("eine unbekannte Kennung trifft nichts", erfunden.fehler === "Kein Zugang angegeben."
  || erfunden.gesperrt === 0, JSON.stringify(erfunden));
/* Nach dem Zurückziehen darf für diesen Betrieb wieder angelegt werden —
   ein gesperrter Eintrag ist kein Duplikat. */
const wieder = await (await fetch(`${BASIS}/einrichten`, {
  method: "POST", headers: kopf({ authorization: `Bearer ${ADMIN}` }),
  body: JSON.stringify({ name: "Prüfbetrieb Zwei", bestand: "demo-pruefung",
    rolle: "leitung", betrieb: 1, demo: true, gruppe: "Prüfung" }),
})).json();
pruef("nach dem Zurückziehen geht Neuanlegen wieder", !!wieder.zugangscode, wieder.fehler || "");

/* --- Alle Zugänge des Raums zurückziehen — aus einer anderen Sitzung ---

   Der eigene Zugang bleibt dabei bestehen, sonst sperrt man sich selbst
   aus. Das galt für Demositzungen bisher nur auf dem Papier: Sie trugen
   keine Kontoprüfsumme, also wusste der Server nicht, welcher der eigene
   ist — und sperrte ihn mit. Jetzt trägt sie ihn; deshalb läuft dieser
   Schritt aus der Sitzung des zweiten Betriebs und trifft den ersten.    */
const listeW = await (await fetch(`${BASIS}/api/demos`,
  { headers: { "x-forwarded-for": HERKUNFT } })).json();
const wiederEintrag = (listeW.demos || []).find((d) => d.bestand === "demo-pruefung" && d.betrieb === 1);
const aufW = await (await fetch(`${BASIS}/api/demo`, { method: "POST",
  headers: kopf(), body: JSON.stringify({ id: wiederEintrag?.id }) })).json();
const sperr = await (await fetch(`${BASIS}/api/zugang-sperren`, {
  method: "POST", headers: kopf({ authorization: `Bearer ${aufW.token}` }),
  body: JSON.stringify({ alleDesBetriebs: true }),
})).json();
pruef("Zugänge lassen sich zurückziehen", sperr.ok === true && sperr.gesperrt >= 1,
  `${sperr.gesperrt} gesperrt`);
const eigeneNoch = await fetch(`${BASIS}/api/bestand`, { headers: kopf({ authorization: `Bearer ${aufW.token}` }) });
pruef("die eigene Sitzung bleibt dabei bestehen", eigeneNoch.status === 200, `Status ${eigeneNoch.status}`);

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

/* --- Aufräumen: den letzten über seine Kennung, aus der eigenen Sitzung ---
   So bleibt kein aktiver Prüfzugang zurück, und ein zweiter Lauf gegen
   denselben Server läuft nicht in den 409.                               */
const letzter = await (await fetch(`${BASIS}/api/zugang-sperren`, {
  method: "POST", headers: kopf({ authorization: `Bearer ${aufW.token}` }),
  body: JSON.stringify({ id: wiederEintrag?.id }),
})).json();
pruef("der eigene Zugang lässt sich über die Kennung zurückziehen", letzter.gesperrt === 1,
  JSON.stringify(letzter));
const liste3 = await (await fetch(`${BASIS}/api/demos`,
  { headers: { "x-forwarded-for": HERKUNFT } })).json();
pruef("der Prüfraum ist danach leer",
  !(liste3.demos || []).some((d) => d.bestand === "demo-pruefung"));

console.log(`\n${ok} von ${ok + fehl} Prüfungen bestanden.`);
process.exit(fehl ? 1 : 0);
