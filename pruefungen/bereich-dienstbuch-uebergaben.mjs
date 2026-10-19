/* ==========================================================================
   DIENSTBUCH UND ÜBERGABEN — Einheitsbezug gegen einen laufenden Server (C2)

   Sicht der Schichtverantwortung nur für die eigene Einheit; Anlegen mit
   serverseitiger Einheit; Ergänzen nur eigener Übergaben; Eindeutigkeit je
   Tag, Dienst und Einheit; Rundweg ohne Verlust; Planung wählt Einheit
   oder betriebsweit.

   Aufruf: node pruefungen/serverlauf.mjs bereich-dienstbuch-uebergaben
   Schreibt in den Raum "dienstbuch-probe".
   ========================================================================== */

const BASIS = process.env.CENTRIC_BASIS || "http://localhost:5173";
const GEHEIM = process.env.CENTRIC_ADMIN || "testgeheim";
const HERKUNFT = process.env.CENTRIC_HERKUNFT || "10.0.10.";
const RAUM = "dienstbuch-probe";

let nr = 0;
async function zugang(rolle, person, betrieb) {
  nr += 1;
  const a = await fetch(`${BASIS}/einrichten`, { method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": `${HERKUNFT}${nr}` },
    body: JSON.stringify({ verwaltung: GEHEIM, name: `Dienstbuchprobe ${rolle} ${person}`, bestand: RAUM, rolle, person, betrieb }) });
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
const finde = (l, id) => (l || []).find((e) => e.id === id);

const ergebnisse = [];
const pruef = (name, bedingung, detail) => {
  ergebnisse.push({ name, ok: !!bedingung, detail });
  console.log(`${bedingung ? "  BESTANDEN" : "  FEHLGESCHLAGEN"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

const D = "2026-10-15";
const person = (id, rolle, einheit) => ({ id, vorname: `V${id}`, nachname: `N${id}`, rolle, bereich: einheit,
  zugehoerigkeit: [{ ab: "2020-01-01", einheitId: einheit }] });
const db = (id, einheitId) => ({ id, datum: D, art: "hinweis", text: `DB-${id}`, zeit: "07:00", durch: "Planung",
  ...(einheitId === undefined ? {} : { einheitId }) });
const ue = (id, dienstId, einheitId) => ({ id, datum: D, dienstId, ...(einheitId === undefined ? {} : { einheitId }),
  lage: `UE-${id}`, offen: "", vorkommnis: "", material: "", von: "Planung", an: null, zeit: "x", personen: [], ergaenzungen: [] });

const tBetr = await anmelden(await zugang("betreiber", null, 0));
pruef("Raum eingerichtet", (await rufe(tBetr, "/api/bestand-anlegen", "POST", { inhalt: {
  version: 9, stand: 1, session: null, mandanten: [{
    id: "m-a", name: "A", einheiten: [{ id: "eA" }, { id: "eB" }, { id: "ePool", pool: true }],
    dienstarten: [{ id: "F", name: "Früh" }, { id: "S", name: "Spät" }],
    personen: [person("s1", "subplaner", "eA"), person("a1", "mitarbeiter", "eA"), person("b1", "mitarbeiter", "eB"),
      person("pl", "planer", "ALLE"), person("l1", "leitung", "ALLE")],
    abweichungen: {}, aenderungen: [], nachrichten: [], anfragen: [], notrufe: [],
    dienstbuch: [db("db-A", "eA"), db("db-B", "eB"), db("db-P", "ePool"), db("db-N", null), db("db-L", undefined)],
    uebergaben: [ue("u-A", "F", "eA"), ue("u-B", "F", "eB"), ue("u-P", "F", "ePool"), ue("u-N", "F", null), ue("u-L", "S", undefined)] }] } })).status === 200);
const tS = await anmelden(await zugang("subplaner", "s1", 0));
const tP = await anmelden(await zugang("planer", "pl", 0));
const tL = await anmelden(await zugang("leitung", "l1", 0));
const vorher = await betriebVon(tP);

const mS = await betriebVon(tS);
pruef("SV: Dienstbuch nur A", JSON.stringify(mS.dienstbuch.map((e) => e.id)) === JSON.stringify(["db-A"]));
pruef("SV: Übergaben nur A", JSON.stringify(mS.uebergaben.map((e) => e.id)) === JSON.stringify(["u-A"]));
pruef("Leitung: alles", (await betriebVon(tL)).dienstbuch.length === 5 && (await betriebVon(tL)).uebergaben.length === 5);

const rw = await schreibe(tS, (m) => { m.abweichungen[`a1|${D}`] = "S"; });
const nachRw = await betriebVon(tP);
pruef("Rundweg SV: B, Pool, null, Altbestand exakt gespeichert", rw.status === 200
  && JSON.stringify(nachRw.dienstbuch) === JSON.stringify(vorher.dienstbuch)
  && JSON.stringify(nachRw.uebergaben) === JSON.stringify(vorher.uebergaben), `Status ${rw.status}`);

const dbNeu = await schreibe(tS, (m) => { m.dienstbuch.unshift({ id: "db-neu", datum: D, art: "vorkommnis", text: "Sturz", einheitId: "eB", vonId: "b1" }); });
const dbN = finde((await betriebVon(tP)).dienstbuch, "db-neu");
pruef("SV: Dienstbucheintrag — Einheit A und Autor vom Server", dbNeu.status === 200 && dbN && dbN.einheitId === "eA" && dbN.vonId === "s1", `Status ${dbNeu.status} ${dbNeu.text || ""}`);
const uNeu = await schreibe(tS, (m) => { m.uebergaben.unshift({ id: "u-neu", datum: D, dienstId: "S", lage: "ruhig", einheitId: "eB", personen: [] }); });
const uN = finde((await betriebVon(tP)).uebergaben, "u-neu");
pruef("SV: Übergabe — Einheit A vom Server", uNeu.status === 200 && uN && uN.einheitId === "eA", `Status ${uNeu.status} ${uNeu.text || ""}`);
const doppelt = await schreibe(tS, (m) => { m.uebergaben.unshift({ id: "u-A2", datum: D, dienstId: "F", lage: "x", personen: [] }); });
pruef("SV: zweite Übergabe A am selben Tag und Dienst: abgewiesen", doppelt.status === 403, `Status ${doppelt.status}`);
const erg = await schreibe(tS, (m) => { finde(m.uebergaben, "u-A").ergaenzungen.push({ text: "Nachtrag" }); });
pruef("SV: eigene Übergabe ergänzen: 200", erg.status === 200 && finde((await betriebVon(tP)).uebergaben, "u-A").ergaenzungen.length === 1);
const fremdErg = await schreibe(tS, (m) => { m.uebergaben.push({ ...ue("u-B", "F", "eB"), ergaenzungen: [{ text: "FAKE" }] }); });
pruef("SV: Ergänzung an fremde Übergabe: abgewiesen", fremdErg.status === 403, `Status ${fremdErg.status}`);
const legacy = await schreibe(tS, (m) => { m.dienstbuch.push({ ...db("db-L", undefined), einheitId: "eA" }); });
pruef("SV: Altbestand mit einheitId A übernehmen: abgewiesen", legacy.status === 403);
const umschreiben = await schreibe(tS, (m) => { finde(m.uebergaben, "u-A").einheitId = "eB"; });
pruef("SV: einheitId der eigenen Übergabe umschreiben: abgewiesen", umschreiben.status === 403);

const pB = await schreibe(tP, (m) => { m.uebergaben.unshift({ ...ue("u-SB", "S", "eB") }); m.dienstbuch.unshift({ ...db("db-pl", null) }); });
const mP = await betriebVon(tP);
pruef("Planung: Übergabe B (S) neben A und Altbestand, Dienstbuch betriebsweit: 200", pB.status === 200
  && finde(mP.uebergaben, "u-SB").einheitId === "eB" && finde(mP.dienstbuch, "db-pl").einheitId === null, `Status ${pB.status} ${pB.text || ""}`);
const pX = await schreibe(tP, (m) => { m.dienstbuch.unshift({ ...db("db-x", "eX") }); });
pruef("Planung: unbekannte Einheit: abgewiesen", pX.status === 403);
const pN = await schreibe(tP, (m) => { m.uebergaben.unshift({ ...ue("u-N2", "F", null) }); });
pruef("Planung: zweite betriebsweite Übergabe am selben Tag und Dienst: abgewiesen", pN.status === 403);

const bestanden = ergebnisse.filter((r) => r.ok).length;
console.log(`\n${bestanden} von ${ergebnisse.length} Prüfungen bestanden.`);
if (bestanden !== ergebnisse.length) {
  console.log("Fehlgeschlagen:");
  for (const r of ergebnisse.filter((x) => !x.ok)) console.log(`  - ${r.name} (${r.detail})`);
  process.exit(1);
}
