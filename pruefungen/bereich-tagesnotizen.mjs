/* ==========================================================================
   TAGESNOTIZEN — Einheitsbezug gegen einen laufenden Server (Commit C3)

   Sicht der Schichtverantwortung nur für die eigene Einheit (auch innerhalb
   desselben Tages), totes Feld tagesnotizen nicht ausgeliefert, Anlegen mit
   serverseitiger Einheit, eigene löschen, fremde nicht manipulierbar,
   Rundweg ohne Verlust; Planung wählt Einheit oder betriebsweit.

   Aufruf: node pruefungen/serverlauf.mjs bereich-tagesnotizen
   Schreibt in den Raum "tagesnotiz-probe".
   ========================================================================== */

const BASIS = process.env.CENTRIC_BASIS || "http://localhost:5173";
const GEHEIM = process.env.CENTRIC_ADMIN || "testgeheim";
const HERKUNFT = process.env.CENTRIC_HERKUNFT || "10.0.11.";
const RAUM = "tagesnotiz-probe";

let nr = 0;
async function zugang(rolle, person, betrieb) {
  nr += 1;
  const a = await fetch(`${BASIS}/einrichten`, { method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": `${HERKUNFT}${nr}` },
    body: JSON.stringify({ verwaltung: GEHEIM, name: `Tagesnotizprobe ${rolle} ${person}`, bestand: RAUM, rolle, person, betrieb }) });
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
const rufe = async (t, pfad, methode = "POST", rumpf) => {
  const a = await fetch(`${BASIS}${pfad}`, { method: methode,
    headers: { ...(t ? { authorization: `Bearer ${t}` } : {}), "content-type": "application/json" },
    body: rumpf === undefined ? undefined : JSON.stringify(rumpf) });
  const text = await a.text();
  let d = {}; try { d = JSON.parse(text); } catch { /* leer */ }
  return { status: a.status, text, ...d };
};
async function schreibe(t, aendern) {
  const r = await rufe(t, "/api/bestand", "GET");
  const b = JSON.parse(JSON.stringify(r.bestand));
  aendern(b.mandanten[0]);
  return rufe(t, "/api/bestand", "PUT", { bestand: b, etag: r.etag, durch: "Test" });
}
const betriebVon = async (t) => (await rufe(t, "/api/bestand", "GET")).bestand.mandanten[0];

const ergebnisse = [];
const pruef = (name, bedingung, detail) => {
  ergebnisse.push({ name, ok: !!bedingung, detail });
  console.log(`${bedingung ? "  BESTANDEN" : "  FEHLGESCHLAGEN"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

const D = "tag|2026-10-15";
const person = (id, rolle, einheit) => ({ id, vorname: `V${id}`, nachname: `N${id}`, rolle, bereich: einheit,
  zugehoerigkeit: einheit === "ALLE" ? [] : [{ ab: "2020-01-01", einheitId: einheit }] });
const notiz = (id, einheitId, vonId = "pl") => ({ id, text: `NZ-${id}`, von: "Planung", vonId, zeit: "x",
  ...(einheitId === undefined ? {} : { einheitId }) });

const tBetr = await anmelden(await zugang("betreiber", null, 0));
pruef("Raum eingerichtet", (await rufe(tBetr, "/api/bestand-anlegen", "POST", { inhalt: {
  version: 9, stand: 1, session: null, mandanten: [{
    id: "m-a", name: "A", einheiten: [{ id: "eA" }, { id: "eB" }, { id: "ePool", pool: true }], dienstarten: [{ id: "F", mindest: { mo_do: 0, fr: 0, sa: 0, so: 0 } }],
    personen: [person("s1", "subplaner", "eA"), person("a1", "mitarbeiter", "eA"), person("pl", "planer", "ALLE"), person("l1", "leitung", "ALLE")],
    abweichungen: {}, aenderungen: [], nachrichten: [], anfragen: [], notrufe: [],
    notizen: { [D]: [notiz("n-A", "eA", "s1"), notiz("n-B", "eB"), notiz("n-P", "ePool"), notiz("n-N", null), notiz("n-L", undefined)] },
    tagesnotizen: { "2026-10-15": "MK-TOTFELD" } }] } })).status === 200);
/* SI-P6: Alle Kundencodes entstehen im Fenster der Ersteinrichtung, bevor sich jemand anmeldet —
   nach der ersten Kundenanmeldung legt der Betreiber für diesen Raum keine neuen Codes mehr an. */
const codeTS = await zugang("subplaner", "s1", 0);
const codeTP = await zugang("planer", "pl", 0);
const codeTL = await zugang("leitung", "l1", 0);
const tS = await anmelden(codeTS);
const tP = await anmelden(codeTP);
const tL = await anmelden(codeTL);
const vorher = await betriebVon(tP);

const mS = await betriebVon(tS);
pruef("SV: am selben Tag nur die Notiz der Einheit A", JSON.stringify((mS.notizen[D] || []).map((x) => x.id)) === JSON.stringify(["n-A"]));
pruef("SV: totes Feld tagesnotizen nicht ausgeliefert", !JSON.stringify(mS).includes("MK-TOTFELD"));
pruef("Leitung: alles", (await betriebVon(tL)).notizen[D].length === 5 && JSON.stringify(await betriebVon(tL)).includes("MK-TOTFELD"));

const rw = await schreibe(tS, (m) => { m.abweichungen["a1|2026-10-15"] = "F"; });
const nachRw = await betriebVon(tP);
pruef("Rundweg SV: verborgene Notizen und tagesnotizen exakt gespeichert", rw.status === 200
  && JSON.stringify(nachRw.notizen) === JSON.stringify(vorher.notizen)
  && JSON.stringify(nachRw.tagesnotizen) === JSON.stringify(vorher.tagesnotizen), `Status ${rw.status}`);

const neu = await schreibe(tS, (m) => { m.notizen[D].unshift({ id: "n-neu", text: "Neu", einheitId: "eB", vonId: "pl" }); });
const mP = await betriebVon(tP);
const nNeu = mP.notizen[D].find((x) => x.id === "n-neu");
pruef("SV: neue Notiz — Einheit A und Autor vom Server; die übrigen des Tages bleiben", neu.status === 200
  && nNeu && nNeu.einheitId === "eA" && nNeu.vonId === "s1" && mP.notizen[D].length === 6, `Status ${neu.status} ${neu.text || ""}`);
const loesch = await schreibe(tS, (m) => { m.notizen[D] = m.notizen[D].filter((x) => x.id !== "n-A"); });
pruef("SV: eigene Notiz löschen: 200", loesch.status === 200 && !(await betriebVon(tP)).notizen[D].some((x) => x.id === "n-A"), `Status ${loesch.status}`);
/* Folgepaket #361 (Existenzorakel): bis dahin 403 „Bestehende Tagesnotizen sind nicht änderbar" für die verborgene
   Kennung, für eine unbekannte mit denselben Angaben 200. Jetzt dieselbe Antwort wie für die unbekannte Kennung —
   geändert oder übernommen wird trotzdem nichts: die verborgene Notiz bleibt byte-gleich. */
/* Antwortbild ohne den neuen Stand (etag; bei 200 steht der Rohtext mit etag in `text`). */
const antwortBild = (w) => JSON.stringify({ ...w, etag: undefined, text: w.status === 200 ? undefined : w.text });
let unbekanntNr = 0;
const wieUnbekannt = async (name, x) => {
  const vorherN = JSON.stringify((await betriebVon(tP)).notizen[D].find((y) => y.id === x.id));
  const v = await schreibe(tS, (m) => { m.notizen[D].push(x); });
  const nachN = JSON.stringify((await betriebVon(tP)).notizen[D].find((y) => y.id === x.id));
  unbekanntNr += 1;
  const u = await schreibe(tS, (m) => { m.notizen[D].push({ ...x, id: `${x.id}-unbekannt-${unbekanntNr}` }); });
  pruef(`SV: ${name}: Antwort wie unbekannte Kennung, Notiz unverändert`,
    antwortBild(v) === antwortBild(u) && !!vorherN && nachN === vorherN, `Status ${v.status}/${u.status}`);
};
await wieUnbekannt("B-Notiz ändern", { ...notiz("n-B", "eB"), text: "GEÄNDERT" });
await wieUnbekannt("B-Notiz → A", { ...notiz("n-B", "eB"), einheitId: "eA" });
await wieUnbekannt("Altbestand übernehmen", { ...notiz("n-L", undefined), einheitId: "eA" });
await wieUnbekannt("null-Notiz übernehmen", { ...notiz("n-N", null), einheitId: "eA" });
await wieUnbekannt("Pool-Notiz übernehmen", { ...notiz("n-P", "ePool"), einheitId: "eA" });
const bLoesch = await schreibe(tS, (m) => { m.notizen = {}; });
pruef("SV: B-, Pool-, null-, Altbestand-Notizen löschen (nicht mitgeschickt): wirkungslos", bLoesch.status === 200
  && (await betriebVon(tP)).notizen[D].filter((x) => ["n-B", "n-P", "n-N", "n-L"].includes(x.id)).length === 4);

const pl = await schreibe(tP, (m) => { m.notizen["tag|2026-10-17"] = [{ id: "n-pl", text: "x", einheitId: "eB" }, { id: "n-pl2", text: "y", einheitId: null }]; });
const mP2 = await betriebVon(tP);
pruef("Planung: Notizen für B und betriebsweit: 200", pl.status === 200
  && mP2.notizen["tag|2026-10-17"].map((x) => x.einheitId).join(",") === "eB,", `Status ${pl.status} ${pl.text || ""}`);
const plX = await schreibe(tP, (m) => { m.notizen["tag|2026-10-18"] = [{ id: "n-x", text: "x", einheitId: "eX" }]; });
pruef("Planung: unbekannte Einheit: abgewiesen", plX.status === 403);

const bestanden = ergebnisse.filter((r) => r.ok).length;
console.log(`\n${bestanden} von ${ergebnisse.length} Prüfungen bestanden.`);
if (bestanden !== ergebnisse.length) {
  console.log("Fehlgeschlagen:");
  for (const r of ergebnisse.filter((x) => !x.ok)) console.log(`  - ${r.name} (${r.detail})`);
  process.exit(1);
}
