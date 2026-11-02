/* ==========================================================================
   WP-22 — FACHPRÜFUNGEN AUF DEM SERVER, gegen einen laufenden Server

   Über echte Anmeldung und PUT /api/bestand: Dienstarten nur mit org.edit,
   sperrende Befunde 403, warnende 409 mit neutraler Befundliste, mit
   Bestätigung im selben Speichervorgang angenommen (Wer und Zeit vom Server).

   Aufruf: node pruefungen/serverlauf.mjs fachpruefung-server
   Schreibt in den Raum "fachpruefung-probe".
   ========================================================================== */

const BASIS = process.env.CENTRIC_BASIS || "http://localhost:5173";
const GEHEIM = process.env.CENTRIC_ADMIN || "testgeheim";
const HERKUNFT = process.env.CENTRIC_HERKUNFT || "10.0.13.";
const RAUM = "fachpruefung-probe";

let nr = 0;
async function zugang(rolle, person, betrieb) {
  nr += 1;
  const a = await fetch(`${BASIS}/einrichten`, { method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": `${HERKUNFT}${nr}` },
    body: JSON.stringify({ verwaltung: GEHEIM, name: `Fachprobe ${rolle} ${person}`, bestand: RAUM, rolle, person, betrieb }) });
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

const tagPlus = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const T1 = tagPlus(10), T2 = tagPlus(11);
const person = (id, rolle, einheit, extra = {}) => ({ id, vorname: `V${id}`, nachname: `N${id}`, rolle, bereich: einheit, status: "aktiv",
  geburtstag: "1980-01-01", zugehoerigkeit: einheit === "ALLE" ? [] : [{ ab: "2020-01-01", einheitId: einheit }], qualifikationen: [], ...extra });

const tBetr = await anmelden(await zugang("betreiber", null, 0));
pruef("Raum eingerichtet", (await rufe(tBetr, "/api/bestand-anlegen", "POST", { inhalt: {
  version: 9, stand: 1, session: null, mandanten: [{
    id: "m-f", name: "F", einheiten: [{ id: "e1" }],
    dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00", pause: 30 },
      { id: "S", name: "Spät", start: "14:00", ende: "22:00", pause: 30 },
      { id: "L", name: "Lang", start: "07:00", ende: "19:30", pause: 45 }],
    zyklus: { tage: ["-", "-", "-", "-", "-", "-", "-"] }, anker: "2026-01-05",
    qualifikationen: [{ id: "qG", name: "Pflegefachkraft", harteSperre: true, ebene: "bund", grundlage: "PflBG § 4" },
      { id: "qB", name: "Hausschulung", harteSperre: true, ebene: "betrieb", grundlage: "Dienstanweisung" }],
    einstellungen: { ruhezeit: 11, maxFolge: 6 },
    personen: [person("a1", "mitarbeiter", "e1", { qualifikationen: ["qG", "qB"] }), person("oq", "mitarbeiter", "e1"),
      person("oB", "mitarbeiter", "e1", { qualifikationen: ["qG"] }),
      person("mu", "mitarbeiter", "e1", { mutterschutz: true, qualifikationen: ["qG", "qB"] }),
      person("s1", "subplaner", "e1"), person("pl", "planer", "ALLE"), person("l1", "leitung", "ALLE")],
    abweichungen: {}, aenderungen: [], nachrichten: [], anfragen: [], notrufe: [], bestaetigungen: [] }] } })).status === 200);
const tP = await anmelden(await zugang("planer", "pl", 0));
const tL = await anmelden(await zugang("leitung", "l1", 0));
const tS = await anmelden(await zugang("subplaner", "s1", 0));

/* Dienstarten nur mit org.edit */
const plDa = await schreibe(tP, (m) => { m.dienstarten[0].name = "Früh neu"; });
pruef("Planung: Dienstart umbenennen — 403", plDa.status === 403 && /org\.edit/.test(plDa.text || ""), `Status ${plDa.status}`);
const ltDa = await schreibe(tL, (m) => { m.dienstarten[0].name = "Früh neu"; });
pruef("Leitung: Dienstart umbenennen — 200", ltDa.status === 200 && (await betriebVon(tL)).dienstarten[0].name === "Früh neu", `Status ${ltDa.status}`);

/* Sperrend: 403 */
const q = await schreibe(tP, (m) => { m.abweichungen[`oq|${T1}`] = "F"; });
pruef("gesetzliche Qualifikation fehlt — 403", q.status === 403 && /Qualifikation/.test(q.text || ""), `Status ${q.status}`);
const mu = await schreibe(tP, (m) => { m.abweichungen[`mu|${T1}`] = "S"; });
pruef("Schutzregel — 403, neutral", mu.status === 403 && !/MuSchG|Mutter|Schwanger/.test(mu.text || ""), `Status ${mu.status}`);

/* Warnend: 409 mit Befundliste, dann mit Bestätigung */
const l1 = await schreibe(tP, (m) => { m.abweichungen[`a1|${T2}`] = "L"; });
pruef("Dienst über zehn Stunden — 409 mit Befundliste", l1.status === 409 && Array.isArray(l1.fachbefunde)
  && l1.fachbefunde[0].befunde[0].regel === "tagesgrenze" && typeof l1.etag === "string", `Status ${l1.status}`);
pruef("… nichts gespeichert", (await betriebVon(tP)).abweichungen[`a1|${T2}`] === undefined);
const l2 = await schreibe(tP, (m) => { m.abweichungen[`a1|${T2}`] = "L";
  m.bestaetigungen.push({ id: "b-probe-1", personId: "a1", datum: T2, dienstId: "L", aktion: "einteilen", stufe: "recht", gelesen: true,
    befunde: [{ regel: "tagesgrenze", stufe: "recht" }], durch: "Angreifer", zeit: "2000-01-01T00:00:00Z" }); });
const nach = await betriebVon(tP);
const eintrag = (nach.bestaetigungen || []).find((b) => b.id === "b-probe-1");
pruef("… mit Bestätigung — 200, gespeichert", l2.status === 200 && nach.abweichungen[`a1|${T2}`] === "L", `Status ${l2.status}`);
pruef("… Wer und Zeit setzt der Server", !!eintrag && eintrag.durch !== "Angreifer" && eintrag.zeit !== "2000-01-01T00:00:00Z");

/* Schichtverantwortung: 409 neutral */
const sv = await schreibe(tS, (m) => { m.abweichungen[`oB|${T1}`] = "F"; });
pruef("Schichtverantwortung: betriebliche Qualifikation — 409", sv.status === 409 && sv.fachbefunde[0].befunde[0].regel === "qualifikationBetrieblich", `Status ${sv.status}`);
pruef("… Befundliste ohne Merkmal", !/mutterschutz|geburtstag|MuSchG|JArbSchG/i.test(JSON.stringify(sv.fachbefunde || [])));

const bestanden = ergebnisse.filter((r) => r.ok).length;
console.log(`\n${bestanden} von ${ergebnisse.length} Prüfungen bestanden.`);
if (bestanden !== ergebnisse.length) {
  console.log("Fehlgeschlagen:");
  for (const r of ergebnisse.filter((x) => !x.ok)) console.log(`  - ${r.name} (${r.detail})`);
  process.exit(1);
}
