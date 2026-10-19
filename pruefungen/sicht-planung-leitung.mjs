/* ==========================================================================
   SICHT VON PLANUNG UND LEITUNG — gegen einen laufenden Server (1e.3)

   Der Betreiber richtet einen Raum mit zwei Betrieben ein, mit Rechnungen,
   Preisliste, Kalendergeheimnissen, Bank- und Lohnfeldern, Notfallkontakt
   und Vertragsangaben. Planung und Leitung von Betrieb 0 lesen: nichts
   davon im Payload (außer den Zustellfeldern bis Commit 4). Dann speichern
   sie normal, und der Betreiber liest alles unverändert.

   Aufruf: node pruefungen/serverlauf.mjs sicht-planung-leitung
   Schreibt in den Raum "sicht-pl".
   ========================================================================== */

const BASIS = process.env.CENTRIC_BASIS || "http://localhost:5173";
const GEHEIM = process.env.CENTRIC_ADMIN || "testgeheim";
const HERKUNFT = process.env.CENTRIC_HERKUNFT || "10.1.1.";
const RAUM = "sicht-pl";

let nr = 0;
async function zugang(rolle, person, betrieb = 0) {
  nr += 1;
  const a = await fetch(`${BASIS}/einrichten`, { method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": `${HERKUNFT}${nr}` },
    body: JSON.stringify({ verwaltung: GEHEIM, name: `Sichtprobe ${rolle}`, bestand: RAUM, rolle, person, betrieb }) });
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
const lies = (t) => rufe(t, "bestand");
const schreib = (t, bestand, etag) => rufe(t, "bestand", "PUT", { bestand, etag, durch: "Test" });

const ergebnisse = [];
const pruef = (name, bedingung, detail) => {
  ergebnisse.push({ name, ok: !!bedingung, detail });
  console.log(`${bedingung ? "  BESTANDEN" : "  FEHLGESCHLAGEN"}  ${name}${detail ? ` — ${detail}` : ""}`);
};
const kopie = (x) => JSON.parse(JSON.stringify(x));

const person = (id, rolle) => ({ id, vorname: "V", nachname: `N${id}`, rolle, bereich: "ALLE",
  zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }], email: `${id}@x.de`, pushSchluessel: { endpoint: `push-${id}` },
  zustellung: { planGeaendert: { mail: true } }, kalenderGeheim: `kal-geheim-${id}`, kalenderVerweis: `https://kal/${id}`,
  emailVorher: `alt-${id}@x.de`, iban: `IBAN-${id}`, steuerId: `ST-${id}`, lohn: 3100, notfallkontakt: `Mutter von ${id}`,
  personalnummer: `PN-${id}`, mutterschutz: true, neuesGeheimesFeld: "darf-nicht-raus" });
const start = { version: 9, stand: 1, session: null,
  betreiber: { firma: "CENTRIC", iban: "BETREIBER-IBAN" }, tarife: [{ id: "t1", preis: 99 }],
  rechnungen: [{ id: "rg-eigen", mandantId: "sicht-pl", brutto: 100 }, { id: "rg-fremd", mandantId: "m-zwei", brutto: 200 }],
  selbststarts: [{ raum: "t-1" }],
  mandanten: [{ id: "sicht-pl", name: "Haus Eins", einheiten: [{ id: "e1" }], dienstarten: [{ id: "F", name: "Früh" }],
    personen: [person("l1", "leitung"), person("p1", "planer"), person("a1", "mitarbeiter")],
    abweichungen: {}, anfragen: [], nachrichten: [], notrufe: [],
    preisgestaltung: { sonder: 10 }, kontakt: "kontakt@kunde.de", anschrift: "Kundenweg 1", ustId: "DE123",
    notiz: "interne Betreibernotiz", lohnarten: [{ id: "lz", nr: "100" }], neuesGeheimesFeld: "darf-nicht-raus" },
  { id: "m-zwei", name: "Haus Zwei", einheiten: [{ id: "e1" }], personen: [person("f1", "leitung")] }] };

const tB = await anmelden(await zugang("betreiber", null));
pruef("Raum mit zwei Betrieben über den Betreiber eingerichtet",
  (await rufe(tB, "bestand-anlegen", "POST", { inhalt: start })).status === 200);
const vorher = (await lies(tB)).bestand;

for (const [name, rolle, ich] of [["Planung", "planer", "p1"], ["Leitung", "leitung", "l1"]]) {
  const t = await anmelden(await zugang(rolle, ich));
  const r = await lies(t);
  const text = JSON.stringify(r);
  const a = r.bestand.mandanten[0].personen.find((x) => x.id === "a1");
  const lecks = ["darf-nicht-raus", "kal-geheim-a1", "https://kal/a1", "alt-a1@", "IBAN-a1", "ST-a1", "Mutter von a1",
    "BETREIBER-IBAN", "rg-fremd", "rg-eigen", "interne Betreibernotiz", "Kundenweg", "DE123", "t-1"].filter((s) => text.includes(s));
  pruef(`${name}: keine Geheimnisse, Lohn-/Bankfelder, Notfallkontakte, Betreiber- und Rechnungsdaten`, lecks.length === 0, lecks.join(", "));
  pruef(`${name}: personalnummer und lohnarten bleiben`, a.personalnummer === "PN-a1"
    && JSON.stringify(r.bestand.mandanten[0].lohnarten) === JSON.stringify([{ id: "lz", nr: "100" }]));
  pruef(`${name}: ÜBERGANG bis Commit 4 — pushSchluessel, zustellung, email fremder Personen vorhanden`,
    a.email === "a1@x.de" && a.pushSchluessel && a.pushSchluessel.endpoint === "push-a1" && a.zustellung && a.zustellung.planGeaendert);
  pruef(`${name}: oben nur Zähler, Sitzungsmarke, Betrieb`, JSON.stringify(Object.keys(r.bestand).sort())
    === JSON.stringify(["mandanten", "session", "stand", "version"]));
  pruef(`${name}: eigene Person vollständig`, r.bestand.mandanten[0].personen.find((x) => x.id === ich).kalenderGeheim === `kal-geheim-${ich}`);

  /* Rundweg und Angriff */
  const b = kopie(r.bestand);
  b.mandanten[0].abweichungen[`a1|2026-12-0${name === "Planung" ? 1 : 2}`] = "F";
  Object.assign(b.mandanten[0].personen.find((x) => x.id === "a1"), { kalenderGeheim: "mein-geheimnis", iban: "DE00" });
  b.mandanten[0].notiz = "überschrieben";
  b.tarife = [];
  const w = await schreib(t, b, r.etag);
  pruef(`${name}: gekürzt gespeichert (mit Plan und eingeschleusten Werten): 200`, w.status === 200, `Status ${w.status} ${w.text || ""}`);
  const jetzt = (await lies(tB)).bestand;
  const pv = vorher.mandanten[0].personen, pj = jetzt.mandanten[0].personen;
  pruef(`${name}: Betreiber liest alle Personen wertgleich`, JSON.stringify(pj) === JSON.stringify(pv));
  const felder = ["preisgestaltung", "kontakt", "anschrift", "ustId", "notiz", "lohnarten", "neuesGeheimesFeld"]
    .filter((f) => JSON.stringify(jetzt.mandanten[0][f]) !== JSON.stringify(vorher.mandanten[0][f]));
  pruef(`${name}: Betreiber liest Betriebsfelder unverändert`, felder.length === 0, felder.join(", "));
  pruef(`${name}: oben und der andere Betrieb unverändert`, JSON.stringify(jetzt.tarife) === JSON.stringify(vorher.tarife)
    && JSON.stringify(jetzt.rechnungen) === JSON.stringify(vorher.rechnungen)
    && JSON.stringify(jetzt.mandanten[1]) === JSON.stringify(vorher.mandanten[1]));
}

const bestanden = ergebnisse.filter((r) => r.ok).length;
console.log(`\n${bestanden} von ${ergebnisse.length} Prüfungen bestanden.`);
if (bestanden !== ergebnisse.length) {
  console.log("Fehlgeschlagen:");
  for (const r of ergebnisse.filter((x) => !x.ok)) console.log(`  - ${r.name} (${r.detail})`);
  process.exit(1);
}
