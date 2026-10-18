/* ==========================================================================
   SCHICHTVERANTWORTUNG — gegen einen laufenden Server

   Zwei Wohnbereiche, eine Schichtverantwortung in e1, eine Beschäftigte in
   e1 und eine in e2. Über den echten Schreibweg (PUT /api/bestand) darf
   sie ihren Bereich planen und dessen Anliegen entscheiden — aber keine
   fremden Anträge löschen, keine Stempelzeiten setzen, kein Protokoll
   verändern. Danach liest die Leitung nach: Fremdes ist unverändert.

   Aufruf: node pruefungen/serverlauf.mjs schichtverantwortung
   Schreibt in den Raum "schicht-probe".
   ========================================================================== */

const BASIS = process.env.CENTRIC_BASIS || "http://localhost:5173";
const GEHEIM = process.env.CENTRIC_ADMIN || "testgeheim";
const HERKUNFT = process.env.CENTRIC_HERKUNFT || "10.5.5.";
const RAUM = "schicht-probe";

let nr = 0;
async function zugang(rolle, person) {
  nr += 1;
  const a = await fetch(`${BASIS}/einrichten`, { method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": `${HERKUNFT}${nr}` },
    body: JSON.stringify({ verwaltung: GEHEIM, name: `Schichtprobe ${rolle}`, bestand: RAUM, rolle, person, betrieb: 0 }) });
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

const person = (id, nachname, rolle, einheit) => ({ id, vorname: "V", nachname, rolle, bereich: einheit,
  zugehoerigkeit: [{ ab: "2020-01-01", einheitId: einheit }] });
const start = { version: 9, stand: 1, session: null, mandanten: [{
  id: "schicht-probe", name: "Haus Schicht", einheitLabel: "Wohnbereich",
  einheiten: [{ id: "e1", name: "WB 1" }, { id: "e2", name: "WB 2" }],
  dienstarten: [{ id: "F", name: "Früh" }],
  personen: [person("s1", "Sami", "subplaner", "e1"), person("a1", "Anna", "mitarbeiter", "e1"),
    person("b1", "Bert", "mitarbeiter", "e2"), person("l1", "Lea", "leitung", "ALLE")],
  abweichungen: { "b1|2026-11-01": "F" }, abwesenheiten: [],
  anfragen: [{ id: "an-a", personId: "a1", typ: "abwesenheit", art: "urlaub", status: "offen", von: "2026-11-10", bis: "2026-11-11" },
    { id: "an-b", personId: "b1", typ: "abwesenheit", art: "urlaub", status: "offen", von: "2026-11-10", bis: "2026-11-11" }],
  erfassung: { "b1|2026-10-01": { start: "06:00", ende: "14:00", bestaetigt: false } },
  einstempeln: { "b1|2026-10-01": { start: "06:00", ortStart: "Ort unbekannt", innerhalbStart: false } },
  nachrichten: [{ id: "n-b", personId: "b1", art: "info", titel: "an Bert" }],
  dienstbuch: [{ id: "db1", datum: "2026-10-01", art: "info", text: "Übergabe", durch: "Lea" }],
  protokoll: [{ id: "l2", zeit: "2", text: "zweiter" }, { id: "l1", zeit: "1", text: "erster" }],
  aenderungen: [], einspruenge: [],
}] };

const tBetr = await anmelden(await zugang("betreiber", null));
const ein = await rufe(tBetr, "bestand-anlegen", "POST", { inhalt: start });
pruef("Raum mit zwei Bereichen über den Betreiber eingerichtet", ein.status === 200, `Status ${ein.status}`);
const tL = await anmelden(await zugang("leitung", "l1"));
const tS = await anmelden(await zugang("subplaner", "s1"));
const vorher = (await lies(tL)).bestand.mandanten[0];

/* Ein Schritt: lesen, ändern, schreiben — als Schichtverantwortung. */
async function versuch(aendern) {
  const r = await lies(tS);
  const b = kopie(r.bestand);
  aendern(b.mandanten[0]);
  return schreib(tS, b, r.etag);
}

const wA = await versuch((m) => { m.abweichungen["a1|2026-11-02"] = "F"; });
pruef("Planänderung im eigenen Bereich (e1): erlaubt", wA.status === 200, `Status ${wA.status} ${wA.text || ""}`);
const wB = await versuch((m) => { m.abweichungen["b1|2026-11-02"] = "F"; });
pruef("Planänderung im fremden Bereich (e2): 403", wB.status === 403, `Status ${wB.status}`);
const wG = await versuch((m) => {
  m.anfragen.find((a) => a.id === "an-a").status = "genehmigt";
  m.abwesenheiten.push({ id: "abw-a", personId: "a1", art: "urlaub", von: "2026-11-10", bis: "2026-11-11" });
});
pruef("Urlaub im eigenen Bereich genehmigen: erlaubt", wG.status === 200, `Status ${wG.status} ${wG.text || ""}`);
const wDel = await versuch((m) => { m.anfragen = m.anfragen.filter((a) => a.id !== "an-b"); });
pruef("Fremden Antrag löschen: 403", wDel.status === 403, `Status ${wDel.status}`);
const wUm = await versuch((m) => { m.anfragen.find((a) => a.id === "an-b").personId = "a1"; });
pruef("Fremden Antrag auf andere Person umhängen: 403", wUm.status === 403, `Status ${wUm.status}`);
const wSt = await versuch((m) => { m.einstempeln["b1|2026-10-01"].innerhalbStart = true; });
pruef("Fremde Stempelzeit manipulieren: 403", wSt.status === 403, `Status ${wSt.status}`);
const wStE = await versuch((m) => { m.einstempeln["s1|2026-10-02"] = { start: "06:00", ortStart: "Am Einsatzort", innerhalbStart: true }; });
pruef("Eigene Stempelzeit über PUT setzen: 403", wStE.status === 403, `Status ${wStE.status}`);
const wEr = await versuch((m) => { m.erfassung["b1|2026-10-01"].bestaetigt = true; });
pruef("Erfassung bestätigen über PUT: 403", wEr.status === 403, `Status ${wEr.status}`);
const wPr = await versuch((m) => { m.protokoll = m.protokoll.slice(1); });
pruef("Protokolleintrag löschen: 403", wPr.status === 403, `Status ${wPr.status}`);
const wPr2 = await versuch((m) => { m.protokoll[1].text = "gefälscht"; });
pruef("Protokolleintrag ändern: 403", wPr2.status === 403, `Status ${wPr2.status}`);
const wN = await versuch((m) => { m.nachrichten = []; });
pruef("Fremde Nachricht löschen: 403", wN.status === 403, `Status ${wN.status}`);
const wDb = await versuch((m) => { m.dienstbuch[0].text = "anders"; });
pruef("Dienstbuch ändern: 403", wDb.status === 403, `Status ${wDb.status}`);
const wR = await versuch((m) => { m.personen.find((p) => p.id === "a1").rolle = "planer"; });
pruef("Rolle einer anderen Person ändern: 403", wR.status === 403, `Status ${wR.status}`);
const wK = await versuch((m) => { m.abwesenheiten.push({ id: "k-s", personId: "s1", art: "krank", von: "2026-10-20", bis: "2026-10-20" }); });
pruef("Eigene Krankmeldung: erlaubt", wK.status === 200, `Status ${wK.status} ${wK.text || ""}`);
const st = await rufe(tS, "stempeln", "POST", { datum: "2026-10-18", art: "start" });
pruef("Die Stempeluhr selbst bleibt offen (/api/stempeln)", st.status === 200, `Status ${st.status}`);

/* Neu lesen als Leitung: Fremdes unverändert, Erlaubtes da. */
const nach = (await lies(tL)).bestand.mandanten[0];
pruef("Leitung: Plan von e2 unverändert", nach.abweichungen["b1|2026-11-01"] === "F" && !nach.abweichungen["b1|2026-11-02"]);
pruef("… Antrag von Bert unverändert", JSON.stringify(nach.anfragen.find((a) => a.id === "an-b"))
  === JSON.stringify(vorher.anfragen.find((a) => a.id === "an-b")));
pruef("… Stempelzeit und Erfassung von Bert unverändert",
  JSON.stringify(nach.einstempeln["b1|2026-10-01"]) === JSON.stringify(vorher.einstempeln["b1|2026-10-01"])
  && JSON.stringify(nach.erfassung["b1|2026-10-01"]) === JSON.stringify(vorher.erfassung["b1|2026-10-01"]));
pruef("… Protokoll: nichts verloren, nichts verändert",
  ["l2", "l1"].every((id) => JSON.stringify(nach.protokoll.find((l) => l.id === id))
    === JSON.stringify(vorher.protokoll.find((l) => l.id === id))));
pruef("… Nachricht und Dienstbuch unverändert", nach.nachrichten.some((n) => n.id === "n-b")
  && nach.dienstbuch[0].text === "Übergabe");
pruef("… erlaubte Schritte sind da", nach.abweichungen["a1|2026-11-02"] === "F"
  && nach.anfragen.find((a) => a.id === "an-a").status === "genehmigt"
  && nach.abwesenheiten.some((a) => a.id === "abw-a") && nach.abwesenheiten.some((a) => a.id === "k-s"));
pruef("… Rolle von Anna unverändert", nach.personen.find((p) => p.id === "a1").rolle === "mitarbeiter");

const bestanden = ergebnisse.filter((r) => r.ok).length;
console.log(`\n${bestanden} von ${ergebnisse.length} Prüfungen bestanden.`);
if (bestanden !== ergebnisse.length) {
  console.log("Fehlgeschlagen:");
  for (const r of ergebnisse.filter((x) => !x.ok)) console.log(`  - ${r.name} (${r.detail})`);
  process.exit(1);
}
