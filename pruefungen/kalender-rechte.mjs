/* ==========================================================================
   KALENDER — gegen einen laufenden Server (Commit 3)

   Ein Raum, zwei Betriebe. A1 richtet den eigenen Kalender ein — mit
   fremder personId im Rumpf, die nicht zählt. Mit den Geheimnissen von A2
   und B1 lässt sich nichts überschreiben oder abschalten; die Antworten
   gleichen denen für unbekannte Geheimnisse. Erneutes Einrichten und
   Löschen machen das alte Geheimnis ungültig. Die Schichtverantwortung
   speichert ihren Kalenderzustand ohne 403.

   Aufruf: node pruefungen/serverlauf.mjs kalender-rechte
   Schreibt in den Raum "kalender-probe".
   ========================================================================== */

const BASIS = process.env.CENTRIC_BASIS || "http://localhost:5173";
const GEHEIM = process.env.CENTRIC_ADMIN || "testgeheim";
const HERKUNFT = process.env.CENTRIC_HERKUNFT || "10.0.7.";
const RAUM = "kalender-probe";

let nr = 0;
async function zugang(rolle, person, betrieb) {
  nr += 1;
  const a = await fetch(`${BASIS}/einrichten`, { method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": `${HERKUNFT}${nr}` },
    body: JSON.stringify({ verwaltung: GEHEIM, name: `Kalenderprobe ${rolle} ${person}`, bestand: RAUM, rolle, person, betrieb }) });
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
  let d = {}; try { d = JSON.parse(text); } catch { /* ICS */ }
  return { status: a.status, text, ...d };
};
const einrichten = (t, rumpf = {}) => rufe(t, "/kalender/einrichten", "POST", rumpf);
const termine = [{ id: "d-1", datum: "2026-12-01", von: "06:00", endDatum: "2026-12-01", bisZeit: "14:00", ganztags: false, titel: "Früh", text: "", ort: "" }];
const datenSenden = (t, geheim, name) => rufe(t, "/kalender/daten", "POST", { geheim, name, betrieb: name, termine });
const loeschen = (t, rumpf = {}) => rufe(t, "/kalender/loeschen", "POST", rumpf);
const feed = (g) => rufe(null, `/kalender/feed/${g}.ics`, "GET");

const ergebnisse = [];
const pruef = (name, bedingung, detail) => {
  ergebnisse.push({ name, ok: !!bedingung, detail });
  console.log(`${bedingung ? "  BESTANDEN" : "  FEHLGESCHLAGEN"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

const person = (id, rolle) => ({ id, vorname: "V", nachname: `N${id}`, rolle, bereich: "e1",
  zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }] });
const tBetr = await anmelden(await zugang("betreiber", null, 0));
pruef("Raum mit zwei Betrieben eingerichtet", (await rufe(tBetr, "/api/bestand-anlegen", "POST", { inhalt: {
  version: 9, stand: 1, session: null, mandanten: [
    { id: "m-a", name: "A", einheiten: [{ id: "e1" }], personen: [person("a1", "mitarbeiter"), person("a2", "mitarbeiter"),
      person("s1", "subplaner"), { ...person("l1", "leitung"), bereich: "ALLE" }], abweichungen: {}, anfragen: [], nachrichten: [] },
    { id: "m-b", name: "B", einheiten: [{ id: "e1" }], personen: [person("b1", "mitarbeiter")], abweichungen: {}, anfragen: [], nachrichten: [] }] } })).status === 200);
const tA1 = await anmelden(await zugang("mitarbeiter", "a1", 0));
const tA2 = await anmelden(await zugang("mitarbeiter", "a2", 0));
const tB1 = await anmelden(await zugang("mitarbeiter", "b1", 1));
const tS1 = await anmelden(await zugang("subplaner", "s1", 0));
const tL1 = await anmelden(await zugang("leitung", "l1", 0));

/* Fremde Kalender zum Angreifen */
const gA2 = (await einrichten(tA2)).geheim; await datenSenden(tA2, gA2, "A2-Original");
const gB1 = (await einrichten(tB1)).geheim; await datenSenden(tB1, gB1, "B1-Original");

/* A1: eigener Kalender, fremde personId im Rumpf */
const e1 = await einrichten(tA1, { personId: "b1" });
pruef("A1 richtet ein (personId=b1 im Rumpf): 200", e1.status === 200 && !!e1.geheim, `Status ${e1.status}`);
await datenSenden(tA1, e1.geheim, "A1");
const f1 = await feed(e1.geheim);
pruef("… der Feed gehört A1 und funktioniert", f1.status === 200 && f1.text.includes("A1"), `Status ${f1.status}`);
pruef("… der Feed von B1 ist unverändert", (await feed(gB1)).text.includes("B1-Original"));

/* Angriffe mit fremden Geheimnissen */
await einrichten(tA1, { alt: gA2 });
await einrichten(tA1, { alt: gB1 });
pruef("fremdes „alt“ löscht nichts", (await feed(gA2)).status === 200 && (await feed(gB1)).status === 200);
const dFremd = await datenSenden(tA1, gB1, "ÜBERSCHRIEBEN");
const dUnbekannt = await datenSenden(tA1, "u".repeat(32), "ÜBERSCHRIEBEN");
pruef("fremdes Geheimnis bei daten: wie unbekannt, nichts verändert", dFremd.status === dUnbekannt.status
  && dFremd.text === dUnbekannt.text && !(await feed(gB1)).text.includes("ÜBERSCHRIEBEN"), `${dFremd.status}/${dUnbekannt.status}`);
const lFremd = await loeschen(tA1, { geheim: gA2 });
const lUnbekannt = await loeschen(tA1, { geheim: "v".repeat(32) });
pruef("fremdes Geheimnis bei loeschen: wie unbekannt, nichts verändert", lFremd.text === lUnbekannt.text
  && (await feed(gA2)).status === 200, lFremd.text);
await loeschen(tL1, { geheim: gA2 });
await einrichten(tL1, { personId: "a2", alt: gA2 });
pruef("Leitung schaltet den Kalender von A2 nicht ab", (await feed(gA2)).status === 200);
pruef("Betreiber ohne Person: abgewiesen", (await einrichten(tBetr)).status === 403);

/* Rotation und Löschen ohne Geheimnis (wie nach dem Neuladen) */
const aktuell = (await einrichten(tA1)).geheim;
await datenSenden(tA1, aktuell, "A1");
const neu = (await einrichten(tA1)).geheim;
pruef("erneutes Einrichten ohne „alt“: altes Geheimnis ungültig", (await feed(aktuell)).status === 404);
await datenSenden(tA1, neu, "A1");
await loeschen(tA1);
pruef("Löschen ohne Geheimnis: aktives Geheimnis ungültig", (await feed(neu)).status === 404);

/* Schichtverantwortung: Kalenderzustand speichern ohne 403 */
{
  const e = await einrichten(tS1);
  const r = await rufe(tS1, "/api/bestand", "GET");
  const b = JSON.parse(JSON.stringify(r.bestand));
  Object.assign(b.mandanten[0].personen.find((p) => p.id === "s1"),
    { kalenderGeheim: e.geheim, kalenderVerweis: e.verweis, kalenderStand: new Date().toISOString() });
  const w = await rufe(tS1, "/api/bestand", "PUT", { bestand: b, etag: r.etag, durch: "Test" });
  pruef("Schichtverantwortung speichert ihren Kalenderzustand: 200", w.status === 200, `Status ${w.status} ${w.text || ""}`);
}
/* Beschäftigte: Kalenderzustand bleibt nach dem Neuladen */
{
  const e = await einrichten(tA2);
  const r = await rufe(tA2, "/api/bestand", "GET");
  const b = JSON.parse(JSON.stringify(r.bestand));
  Object.assign(b.mandanten[0].personen.find((p) => p.id === "a2"), { kalenderGeheim: e.geheim, kalenderVerweis: e.verweis });
  await rufe(tA2, "/api/bestand", "PUT", { bestand: b, etag: r.etag, durch: "Test" });
  const wieder = await rufe(tA2, "/api/bestand", "GET");
  pruef("Beschäftigte: Geheimnis nach dem Neuladen gespeichert", wieder.bestand.mandanten[0].personen.find((p) => p.id === "a2").kalenderGeheim === e.geheim);
  await loeschen(tA2, { geheim: e.geheim });
  pruef("… und der Widerruf wirkt", (await feed(e.geheim)).status === 404);
}

const bestanden = ergebnisse.filter((r) => r.ok).length;
console.log(`\n${bestanden} von ${ergebnisse.length} Prüfungen bestanden.`);
if (bestanden !== ergebnisse.length) {
  console.log("Fehlgeschlagen:");
  for (const r of ergebnisse.filter((x) => !x.ok)) console.log(`  - ${r.name} (${r.detail})`);
  process.exit(1);
}
