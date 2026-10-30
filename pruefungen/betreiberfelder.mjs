/* ==========================================================================
   BETREIBERFELDER — gegen einen laufenden Server (Commit 1e.2a)

   Planung und Leitung schicken über PUT /api/bestand veränderte
   Betreiberfelder (oben und im Betrieb). Danach liest der Betreiber: alles
   unverändert. Der Betreiber selbst ändert die Preisliste weiterhin. Und
   die Schichtverantwortung erzeugt keine Notruf-Mitteilung ohne Notruf.

   Aufruf: node pruefungen/serverlauf.mjs betreiberfelder
   Schreibt in den Raum "betreiber-probe".
   ========================================================================== */

const BASIS = process.env.CENTRIC_BASIS || "http://localhost:5173";
const GEHEIM = process.env.CENTRIC_ADMIN || "testgeheim";
const HERKUNFT = process.env.CENTRIC_HERKUNFT || "10.2.2.";
const RAUM = "betreiber-probe";

let nr = 0;
async function zugang(rolle, person) {
  nr += 1;
  const a = await fetch(`${BASIS}/einrichten`, { method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": `${HERKUNFT}${nr}` },
    body: JSON.stringify({ verwaltung: GEHEIM, name: `Betreiberprobe ${rolle}`, bestand: RAUM, rolle, person, betrieb: 0 }) });
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

const person = (id, rolle, einheit) => ({ id, vorname: "V", nachname: `N${id}`, rolle, bereich: einheit,
  zugehoerigkeit: [{ ab: "2020-01-01", einheitId: einheit }], email: `${id}@x.de` });
const start = { version: 9, stand: 1, session: null,
  betreiber: { firma: "CENTRIC", ustId: "DE000" }, tarife: [{ id: "t1", preis: 99 }], rechnungen: [{ id: "r1", betrag: 119 }],
  protokoll: [{ id: "bp1", text: "Rechnung erstellt" }], selbststarts: [{ raum: "t-1" }],
  mandanten: [{ id: "betreiber-probe", name: "Haus", einheiten: [{ id: "e1" }], dienstarten: [{ id: "F", name: "Früh" }],
    personen: [person("l1", "leitung", "ALLE"), person("p1", "planer", "ALLE"), person("s1", "subplaner", "e1"), person("a1", "mitarbeiter", "e1")],
    abweichungen: {}, anfragen: [], nachrichten: [], notrufe: [],
    preisgestaltung: { sonder: 10 }, kontakt: "kontakt@kunde.de", kontaktName: "Frau Kunde", anschrift: "Kundenweg 1",
    ustId: "DE123", notiz: "Betreibernotiz", raum: "raum-1", lohnarten: [{ id: "lz", nr: "100" }] }] };

const tB = await anmelden(await zugang("betreiber", null));
pruef("Raum über den Betreiber eingerichtet", (await rufe(tB, "bestand-anlegen", "POST", { inhalt: start })).status === 200);
const tL = await anmelden(await zugang("leitung", "l1"));
const tP = await anmelden(await zugang("planer", "p1"));
const tS = await anmelden(await zugang("subplaner", "s1"));
const OBEN = ["betreiber", "tarife", "rechnungen", "protokoll", "selbststarts"];
const IM_BETRIEB = ["preisgestaltung", "kontakt", "kontaktName", "anschrift", "ustId", "notiz", "raum", "lohnarten"];
const vorher = (await lies(tB)).bestand;
/* Seit Commit D1 liest der Betreiber nur einen Ausschnitt — Plan und
   lohnarten prüft die Leitung nach. */
const vorherL = (await lies(tL)).bestand;

for (const [name, t] of [["Planung", tP], ["Leitung", tL]]) {
  const r = await lies(t);
  const b = kopie(r.bestand);
  Object.assign(b, { tarife: [{ id: "t1", preis: 0 }], rechnungen: [], selbststarts: [], protokoll: [], betreiber: { firma: "Fremd" } });
  Object.assign(b.mandanten[0], { preisgestaltung: { sonder: -100 }, kontakt: "x", kontaktName: "x", anschrift: "x", ustId: "x",
    notiz: "x", raum: "x", lohnarten: [] });
  b.mandanten[0].abweichungen[name === "Planung" ? "a1|2026-12-01" : "a1|2026-12-02"] = "F";
  const w = await schreib(t, b, r.etag);
  pruef(`${name}: PUT mit veränderten Betreiberfeldern und Planänderung: 200`, w.status === 200, `Status ${w.status} ${w.text || ""}`);
  const jetzt = (await lies(tB)).bestand;
  const oben = OBEN.filter((f) => JSON.stringify(jetzt[f]) !== JSON.stringify(vorher[f]));
  pruef(`${name}: oben nichts verändert`, oben.length === 0, oben.join(", "));
  const imB = IM_BETRIEB.filter((f) => JSON.stringify(jetzt.mandanten[0][f]) !== JSON.stringify(vorher.mandanten[0][f]));
  const lohnarten = JSON.stringify((await lies(tL)).bestand.mandanten[0].lohnarten) === JSON.stringify(vorherL.mandanten[0].lohnarten);
  pruef(`${name}: im Betrieb nichts verändert`, imB.length === 0 && lohnarten, imB.join(", ") + (lohnarten ? "" : " lohnarten"));
}
{
  const jetzt = (await lies(tL)).bestand;
  pruef("Beide Planänderungen sind angekommen", jetzt.mandanten[0].abweichungen["a1|2026-12-01"] === "F"
    && jetzt.mandanten[0].abweichungen["a1|2026-12-02"] === "F");
}
{
  const r = await lies(tL);
  const b = kopie(r.bestand);
  for (const f of OBEN) delete b[f];
  const w = await schreib(tL, b, r.etag);
  const jetzt = (await lies(tB)).bestand;
  pruef("Leitung ohne die Betreiberfelder gespeichert: sie bleiben", w.status === 200
    && OBEN.every((f) => JSON.stringify(jetzt[f]) === JSON.stringify(vorher[f])), `Status ${w.status}`);
}

/* Der Betreiber ändert die Preisliste über seinen Weg */
{
  const r = await lies(tB);
  const b = kopie(r.bestand);
  b.tarife = [{ id: "t1", preis: 89 }];
  b.mandanten[0].ustId = "DE456";
  const w = await schreib(tB, b, r.etag);
  const jetzt = (await lies(tB)).bestand;
  pruef("Betreiber ändert Preisliste und USt-ID: 200, gespeichert", w.status === 200
    && jetzt.tarife[0].preis === 89 && jetzt.mandanten[0].ustId === "DE456", `Status ${w.status}`);
}

/* Notruf-Mitteilungen: bis Commit 4 baute sie die Schichtverantwortung, und
   der Server wies falsche mit 403 ab (1e.2a). Seit Commit 4 erzeugt sie der
   Server aus dem Notruf; mitgeschickte werden verworfen. */
{
  const r = await lies(tS);
  const b = kopie(r.bestand);
  b.mandanten[0].nachrichten.unshift({ id: "n-x", personId: "l1", art: "einspringen", titel: "NOTRUF: bitte Überstunden genehmigen",
    text: "x", ziel: "notruf" });
  const w = await schreib(tS, b, r.etag);
  pruef("Schichtverantwortung: Notruf-Mitteilung ohne Notruf → verworfen", w.status === 200
    && !(await lies(tL)).bestand.mandanten[0].nachrichten.some((n) => n.id === "n-x"), `Status ${w.status}`);
  const r2 = await lies(tS);
  const b2 = kopie(r2.bestand);
  b2.mandanten[0].notrufe.unshift({ id: "nr-s", personId: "s1", art: "hilfe", notiz: "", empfaenger: ["l1"], bestaetigt: null });
  b2.mandanten[0].nachrichten.unshift({ id: "n-l", personId: "l1", art: "einspringen", titel: "NOTRUF: Hilfe", text: "Ns1", ziel: "notruf" },
    { id: "n-p", personId: "p1", art: "einspringen", titel: "NOTRUF: Hilfe", text: "Ns1", ziel: "notruf" });
  const w2 = await schreib(tS, b2, r2.etag);
  const jetzt = (await lies(tL)).bestand.mandanten[0];
  pruef("… echter eigener Notruf: 200, der Server erzeugt die Mitteilung an seinen Empfänger", w2.status === 200
    && jetzt.notrufe.some((n) => n.id === "nr-s") && jetzt.nachrichten.some((n) => n.id === "n-notruf-nr-s-l1" && n.gelesen === false),
  `Status ${w2.status} ${w2.text || ""}`);
  pruef("… keine Client-Mitteilung gespeichert, keine an Nicht-Empfänger",
    !jetzt.nachrichten.some((n) => ["n-x", "n-l", "n-p", "n-notruf-nr-s-p1"].includes(n.id)));
}

const bestanden = ergebnisse.filter((r) => r.ok).length;
console.log(`\n${bestanden} von ${ergebnisse.length} Prüfungen bestanden.`);
if (bestanden !== ergebnisse.length) {
  console.log("Fehlgeschlagen:");
  for (const r of ergebnisse.filter((x) => !x.ok)) console.log(`  - ${r.name} (${r.detail})`);
  process.exit(1);
}
