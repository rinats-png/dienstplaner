/* ==========================================================================
   AUSSCHREIBUNGEN — Bereichsverantwortung gegen einen laufenden Server (C1)

   Sicht der Schichtverantwortung (alle Köpfe; Bewerbungen nur bei der
   eigenen Einheit, sonst nur die eigene), Anlegen mit serverseitiger
   Einheit, Vergeben im eigenen Bereich, kein Übernehmen fremder oder alter
   Ausschreibungen, Rundweg ohne Verlust verborgener Bewerbungen.

   Aufruf: node pruefungen/serverlauf.mjs bereich-ausschreibungen
   Schreibt in den Raum "ausschreibung-probe".
   ========================================================================== */

const BASIS = process.env.CENTRIC_BASIS || "http://localhost:5173";
const GEHEIM = process.env.CENTRIC_ADMIN || "testgeheim";
const HERKUNFT = process.env.CENTRIC_HERKUNFT || "10.0.9.";
const RAUM = "ausschreibung-probe";

let nr = 0;
async function zugang(rolle, person, betrieb) {
  nr += 1;
  const a = await fetch(`${BASIS}/einrichten`, { method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": `${HERKUNFT}${nr}` },
    body: JSON.stringify({ verwaltung: GEHEIM, name: `Ausschreibungsprobe ${rolle} ${person}`, bestand: RAUM, rolle, person, betrieb }) });
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
const as = (m, id) => m.ausschreibungen.find((a) => a.id === id);

const ergebnisse = [];
const pruef = (name, bedingung, detail) => {
  ergebnisse.push({ name, ok: !!bedingung, detail });
  console.log(`${bedingung ? "  BESTANDEN" : "  FEHLGESCHLAGEN"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

const tag = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const T = tag(5);
const person = (id, rolle, einheit) => ({ id, vorname: `V${id}`, nachname: `N${id}`, rolle, bereich: einheit,
  zugehoerigkeit: [{ ab: "2020-01-01", einheitId: einheit }] });
const bew = (pid, a) => ({ personId: pid, zeit: "2026-10-01T08:00:00.000Z", text: `TEXT-${a}-${pid}` });
const ausschreibung = (id, einheitId) => ({ id, datum: T, dienstId: "F", hinweis: "", status: "offen", erstellt: "2026-10-01T07:00:00.000Z",
  durch: "Planung", ...(einheitId === undefined ? {} : { einheitId }), bewerbungen: [bew("a1", id), bew("b1", id), bew("p1", id)], vergebenAn: null });

const tBetr = await anmelden(await zugang("betreiber", null, 0));
pruef("Raum eingerichtet", (await rufe(tBetr, "/api/bestand-anlegen", "POST", { inhalt: {
  version: 9, stand: 1, session: null, mandanten: [{
    id: "m-a", name: "A", einheiten: [{ id: "eA" }, { id: "eB" }, { id: "ePool", pool: true }], dienstarten: [{ id: "F", name: "Früh" }],
    personen: [person("s1", "subplaner", "eA"), person("a1", "mitarbeiter", "eA"), person("b1", "mitarbeiter", "eB"),
      person("p1", "mitarbeiter", "ePool"), person("pl", "planer", "ALLE")],
    abweichungen: {}, aenderungen: [], nachrichten: [], anfragen: [], notrufe: [],
    ausschreibungen: [ausschreibung("as-A", "eA"), ausschreibung("as-B", "eB"), ausschreibung("as-N", null), ausschreibung("as-L", undefined)] }] } })).status === 200);
const tS = await anmelden(await zugang("subplaner", "s1", 0));
const tA = await anmelden(await zugang("mitarbeiter", "a1", 0));
const tP = await anmelden(await zugang("planer", "pl", 0));
const vorher = (await betriebVon(tP)).ausschreibungen;

/* Sicht */
const mS = await betriebVon(tS);
pruef("SV: alle vier Köpfe", JSON.stringify(mS.ausschreibungen.map((a) => a.id)) === JSON.stringify(["as-A", "as-B", "as-N", "as-L"]));
pruef("SV: eigene Einheit — alle Bewerbungen inklusive Pool", as(mS, "as-A").bewerbungen.length === 3);
pruef("SV: B, null, Altbestand — keine fremden Bewerbungstexte", ["as-B", "as-N", "as-L"].every((id) => as(mS, id).bewerbungen.length === 0)
  && !JSON.stringify(mS).includes("TEXT-as-B-a1"));
const mA = await betriebVon(tA);
pruef("Beschäftigte: nur die eigene Bewerbung", mA.ausschreibungen.every((a) => a.bewerbungen.every((b) => b.personId === "a1")));

/* Rundweg */
const rw = await schreibe(tS, (m) => { m.abweichungen[`a1|${tag(6)}`] = "F"; });
pruef("Rundweg der SV: 200, verborgene Bewerbungen exakt gespeichert", rw.status === 200
  && JSON.stringify((await betriebVon(tP)).ausschreibungen) === JSON.stringify(vorher), `Status ${rw.status}`);

/* Anlegen */
const neu = await schreibe(tS, (m) => { m.ausschreibungen.unshift({ id: "as-neu", datum: T, dienstId: "F", hinweis: "", status: "offen",
  einheitId: "eB", bewerbungen: [], vergebenAn: null }); });
const neuP = as(await betriebVon(tP), "as-neu");
pruef("SV legt an: 200, verantwortende Einheit A vom Server (Client schickte B)", neu.status === 200 && neuP && neuP.einheitId === "eA", `Status ${neu.status} ${neu.text || ""}`);

/* Angriffe */
const uebernehmen = await schreibe(tS, (m) => { as(m, "as-L").einheitId = "eA"; });
pruef("Altbestand zu A umkennzeichnen: abgewiesen", uebernehmen.status === 403, `Status ${uebernehmen.status}`);
const bUeber = await schreibe(tS, (m) => { as(m, "as-B").einheitId = "eA"; });
pruef("einheitId einer B-Ausschreibung auf A: abgewiesen", bUeber.status === 403);
await schreibe(tS, (m) => { as(m, "as-B").bewerbungen.push({ personId: "p1", text: "POOL-FAKE" }); });
pruef("Pool-Bewerbung auf fremde Ausschreibung einschleusen: wirkungslos", !JSON.stringify(await betriebVon(tP)).includes("POOL-FAKE"));
await schreibe(tS, (m) => { as(m, "as-A").bewerbungen = as(m, "as-A").bewerbungen.filter((b) => b.personId !== "b1"); });
pruef("B-Bewerbung löschen: wirkungslos", as(await betriebVon(tP), "as-A").bewerbungen.some((b) => b.personId === "b1"));

/* Vergeben */
const anB = await schreibe(tS, (m) => { Object.assign(as(m, "as-A"), { status: "vergeben", vergebenAn: "b1" }); m.abweichungen[`b1|${T}`] = "F"; });
pruef("Vergabe an Person aus B: abgewiesen", anB.status === 403, `Status ${anB.status}`);
const anA = await schreibe(tS, (m) => { Object.assign(as(m, "as-A"), { status: "vergeben", vergebenAn: "a1" }); m.abweichungen[`a1|${T}`] = "F"; });
const asA = as(await betriebVon(tP), "as-A");
pruef("Vergabe der eigenen Ausschreibung an a1: 200", anA.status === 200 && asA.status === "vergeben" && asA.vergebenAn === "a1", `Status ${anA.status} ${anA.text || ""}`);
const zurueck = await schreibe(tS, (m) => { as(m, "as-neu").status = "zurueckgezogen"; });
pruef("Eigene Ausschreibung zurückziehen: 200", zurueck.status === 200 && as(await betriebVon(tP), "as-neu").status === "zurueckgezogen");
const fremd = await schreibe(tS, (m) => { as(m, "as-B").status = "zurueckgezogen"; });
pruef("Fremde Ausschreibung zurückziehen: abgewiesen", fremd.status === 403);
const eigeneB = await schreibe(tS, (m) => { as(m, "as-N").bewerbungen.push({ personId: "s1", zeit: "z", text: "gern" }); });
pruef("Eigene Bewerbung auf null-Ausschreibung: 200, die anderen bleiben", eigeneB.status === 200
  && as(await betriebVon(tP), "as-N").bewerbungen.length === 4);

const bestanden = ergebnisse.filter((r) => r.ok).length;
console.log(`\n${bestanden} von ${ergebnisse.length} Prüfungen bestanden.`);
if (bestanden !== ergebnisse.length) {
  console.log("Fehlgeschlagen:");
  for (const r of ergebnisse.filter((x) => !x.ok)) console.log(`  - ${r.name} (${r.detail})`);
  process.exit(1);
}
