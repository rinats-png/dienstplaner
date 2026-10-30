/* ==========================================================================
   VOLLAUSGABE — gegen einen laufenden Server (Commit 1e.4a)

   Der Betreiber richtet einen Raum mit zwei Betrieben ein, mit Kalender-
   und Push-Geheimnissen, Personaldaten, Konditionen und interner Notiz.
   Die Leitung von Betrieb 0 holt die Vollausgabe, legt einen
   Sicherungsschlüssel an und holt sie damit noch einmal. Geprüft wird je
   Umfang, was darin steht — und dass gespeichert nichts verändert ist.

   Aufruf: node pruefungen/serverlauf.mjs vollausgabe
   Schreibt in den Raum "export-probe".
   ========================================================================== */

const BASIS = process.env.CENTRIC_BASIS || "http://localhost:5173";
const GEHEIM = process.env.CENTRIC_ADMIN || "testgeheim";
const HERKUNFT = process.env.CENTRIC_HERKUNFT || "10.0.9.";
const RAUM = "export-probe";

let nr = 0;
async function zugang(rolle, person) {
  nr += 1;
  const a = await fetch(`${BASIS}/einrichten`, { method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": `${HERKUNFT}${nr}` },
    body: JSON.stringify({ verwaltung: GEHEIM, name: `Exportprobe ${rolle}`, bestand: RAUM, rolle, person, betrieb: 0 }) });
  const d = await a.json();
  if (!d.zugangscode) throw new Error(`Zugang ${rolle} nicht angelegt: ${JSON.stringify(d)}`);
  return d.zugangscode;
}
const anmelden = async (code) => {
  const a = await fetch(`${BASIS}/api/anmelden`, { method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": `${HERKUNFT}200` },
    body: JSON.stringify({ zugangscode: code }) });
  const d = await a.json();
  if (!d.token) throw new Error(`Anmeldung fehlgeschlagen: ${JSON.stringify(d)}`);
  return d.token;
};
const rufe = async (t, pfad, methode = "GET", rumpf) => {
  const a = await fetch(`${BASIS}/api/${pfad}`, { method: methode,
    headers: { authorization: `Bearer ${t}`, "content-type": "application/json" },
    body: rumpf === undefined ? undefined : JSON.stringify(rumpf) });
  let d = {}; try { d = await a.json(); } catch { /* leer */ }
  return { status: a.status, ...d };
};

const ergebnisse = [];
const pruef = (name, bedingung, detail) => {
  ergebnisse.push({ name, ok: !!bedingung, detail });
  console.log(`${bedingung ? "  BESTANDEN" : "  FEHLGESCHLAGEN"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

const person = (id, rolle) => ({ id, vorname: "V", nachname: `N${id}`, rolle, email: `${id}@x.de`,
  kalenderGeheim: `kal-geheim-${id}`, kalenderVerweis: `https://kal/${id}`, pushSchluessel: { endpoint: `push-${id}` },
  zustellung: { planGeaendert: { mail: true } }, iban: `IBAN-${id}`, steuerId: `ST-${id}`, sozialversicherung: `SV-${id}`,
  lohn: 3100, notfallkontakt: `Mutter von ${id}`, emailVorher: `alt-${id}@x.de`, personalnummer: `PN-${id}`,
  neuesGeheimesFeld: "darf-nicht-raus" });
const start = { version: 9, stand: 1, session: null, betreiber: { firma: "CENTRIC", iban: "BETREIBER-IBAN" },
  tarife: [{ id: "t1", preis: 99 }], rechnungen: [{ id: "rg-eigen", mandantId: "export-probe" }],
  mandanten: [{ id: "export-probe", name: "Haus Export", einheiten: [{ id: "e1" }], dienstarten: [{ id: "F", name: "Früh" }],
    personen: [person("l1", "leitung"), person("a1", "mitarbeiter")],
    abweichungen: { "a1|2026-12-01": "F" }, abwesenheiten: [{ id: "ab", personId: "a1", art: "krank", von: "2026-12-01", bis: "2026-12-01", notiz: "Grippe" }],
    anfragen: [], nachrichten: [], notrufe: [], lohnarten: [{ id: "lz" }],
    preisgestaltung: { sonder: 10 }, kontakt: "kontakt@kunde.de", anschrift: "Kundenweg 1", ustId: "DE123",
    notiz: "interne Betreibernotiz", raum: "raum-intern", neuesGeheimesFeld: "darf-nicht-raus" },
  { id: "m-zwei", name: "Haus Zwei", einheiten: [{ id: "e1" }], personen: [person("f1", "leitung")] }] };

const tB = await anmelden(await zugang("betreiber", null));
pruef("Raum über den Betreiber eingerichtet", (await rufe(tB, "bestand-anlegen", "POST", { inhalt: start })).status === 200);
const vorher = JSON.stringify((await rufe(tB, "bestand")).bestand);
const tL = await anmelden(await zugang("leitung", "l1"));
/* Seit Commit D1 sieht der Betreiber nur einen Ausschnitt; was sonst
   gespeichert ist, prüfen Leitung und die Person selbst nach. */
const vorherL = JSON.stringify((await rufe(tL, "bestand")).bestand);
const tA1 = await anmelden(await zugang("mitarbeiter", "a1"));

const NIE = ["kal-geheim-", "https://kal/", "push-", "interne Betreibernotiz", "Kundenweg", "DE123", "BETREIBER-IBAN",
  "raum-intern", "darf-nicht-raus", "f1@x.de", "Haus Zwei", "rg-eigen"];
async function ausgabe(name, token, inhalt, hr) {
  const v = await rufe(token, "vollausgabe");
  pruef(`${name}: Vollausgabe 200, Umfang ${inhalt}`, v.status === 200 && v.inhalt === inhalt, `Status ${v.status} ${v.fehler || ""}`);
  const text = JSON.stringify(v);
  const lecks = NIE.filter((s) => text.includes(s));
  pruef(`${name}: keine Kalender-/Push-Geheimnisse, keine Betreiberinterna, keine anderen Betriebe, nichts Unbekanntes`,
    lecks.length === 0, lecks.join(", "));
  const a = v.bestand && v.bestand.mandanten[0].personen.find((p) => p.id === "a1");
  const hrDa = ["IBAN-a1", "ST-a1", "SV-a1", "Mutter von a1", "alt-a1@"].filter((s) => text.includes(s));
  pruef(`${name}: Personaldaten ${hr ? "enthalten" : "nicht enthalten"}`, hr ? hrDa.length === 5 : hrDa.length === 0, hrDa.join(", "));
  pruef(`${name}: Planungsdaten, Sammlungen und lohnarten vollständig`, a && a.personalnummer === "PN-a1"
    && v.bestand.mandanten[0].abwesenheiten[0].notiz === "Grippe" && v.bestand.mandanten[0].lohnarten.length === 1
    && v.bestand.mandanten[0].abweichungen["a1|2026-12-01"] === "F");
}

await ausgabe("Leitung", tL, "leitung", false);
const sk = await rufe(tL, "sicherungsschluessel", "POST", { tage: 30 });
pruef("Leitung legt einen Sicherungsschlüssel an", sk.status === 200 && !!sk.schluessel, `Status ${sk.status}`);
await ausgabe("Sicherungsschlüssel", sk.schluessel, "sicherung", true);
pruef("Gespeicherter Bestand unverändert (Betreiber und Leitung lesen nach)", JSON.stringify((await rufe(tB, "bestand")).bestand) === vorher
  && JSON.stringify((await rufe(tL, "bestand")).bestand) === vorherL);
const b = (await rufe(tA1, "bestand")).bestand;
pruef("… das Kalendergeheimnis liegt weiter gespeichert (die Person selbst liest nach)",
  b.mandanten[0].personen.find((p) => p.id === "a1").kalenderGeheim === "kal-geheim-a1");

const bestanden = ergebnisse.filter((r) => r.ok).length;
console.log(`\n${bestanden} von ${ergebnisse.length} Prüfungen bestanden.`);
if (bestanden !== ergebnisse.length) {
  console.log("Fehlgeschlagen:");
  for (const r of ergebnisse.filter((x) => !x.ok)) console.log(`  - ${r.name} (${r.detail})`);
  process.exit(1);
}
