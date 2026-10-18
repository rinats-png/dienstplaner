/* ==========================================================================
   ZEITERFASSUNG — gegen einen laufenden Server

   Eine Beschäftigte bestätigt ihre Zeiten über den echten Schreibweg
   („Wie geplant", „Abweichend") und stempelt über /api/stempeln. Danach
   versucht sie, bestehende und gestempelte Zeiten über PUT zu ändern, zu
   löschen und Tage ohne Dienst oder in der Zukunft einzutragen. Neu lesen:
   Der Serverstand ist unverändert.

   Aufruf: node pruefungen/serverlauf.mjs zeiterfassung
   Schreibt in den Raum "zeit-probe".
   ========================================================================== */

const BASIS = process.env.CENTRIC_BASIS || "http://localhost:5173";
const GEHEIM = process.env.CENTRIC_ADMIN || "testgeheim";
const HERKUNFT = process.env.CENTRIC_HERKUNFT || "10.4.6.";
const RAUM = "zeit-probe";

let nr = 0;
async function zugang(rolle, person) {
  nr += 1;
  const a = await fetch(`${BASIS}/einrichten`, { method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": `${HERKUNFT}${nr}` },
    body: JSON.stringify({ verwaltung: GEHEIM, name: `Zeitprobe ${rolle}`, bestand: RAUM, rolle, person, betrieb: 0 }) });
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

const HEUTE = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());
const tag = (n) => new Date(new Date(`${HEUTE}T00:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);

/* a1 Beschäftigte. Geplant: Früh an den letzten Tagen, frei vor 3 Tagen,
   Nacht gestern für n1, Früh gestern für a1. */
const abw = {};
for (let i = 1; i <= 10; i++) abw[`a1|${tag(-i)}`] = "F";
abw[`a1|${tag(-3)}`] = "-";
abw[`n1|${tag(-1)}`] = "N";
abw[`a1|${tag(1)}`] = "F";
const person = (id, rolle) => ({ id, vorname: "V", nachname: id, rolle, bereich: "e1",
  zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }] });
const start = { version: 9, stand: 1, session: null, mandanten: [{
  id: "zeit-probe", name: "Haus Zeit", einheiten: [{ id: "e1", name: "WB 1" }],
  dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00" }, { id: "N", name: "Nacht", start: "21:00", ende: "06:00" }],
  personen: [person("a1", "mitarbeiter"), person("n1", "mitarbeiter"), person("l1", "leitung")],
  abweichungen: abw, abwesenheiten: [], erfassung: {}, einstempeln: {}, anfragen: [], nachrichten: [],
}] };

const tBetr = await anmelden(await zugang("betreiber", null));
pruef("Raum eingerichtet", (await rufe(tBetr, "bestand-anlegen", "POST", { inhalt: start })).status === 200);
const tA = await anmelden(await zugang("mitarbeiter", "a1"));
const tN = await anmelden(await zugang("mitarbeiter", "n1"));
const tL = await anmelden(await zugang("leitung", "l1"));

async function alsA(aendern) {
  const r = await lies(tA);
  const b = kopie(r.bestand);
  aendern(b.mandanten[0]);
  return schreib(tA, b, r.etag);
}
const erfassungL = async () => (await lies(tL)).bestand.mandanten[0].erfassung || {};

/* --- Legitim: Wie geplant, Abweichend --- */
const w1 = await alsA((m) => { m.erfassung[`a1|${tag(-1)}`] = { start: null, ende: null, bestaetigt: true, grund: "" }; });
pruef("„Wie geplant\" per PUT: 200", w1.status === 200, `Status ${w1.status}`);
pruef("… nach dem Neuladen vorhanden", !!(await erfassungL())[`a1|${tag(-1)}`]);
const ABWEICHEND = { start: "06:00", ende: "15:15", bestaetigt: true, grund: "Übergabe verlängert" };
const w2 = await alsA((m) => { m.erfassung[`a1|${tag(-2)}`] = { ...ABWEICHEND }; });
pruef("„Abweichend\" per PUT: 200", w2.status === 200, `Status ${w2.status}`);
pruef("… nach dem Neuladen vorhanden", JSON.stringify((await erfassungL())[`a1|${tag(-2)}`]) === JSON.stringify(ABWEICHEND));

/* --- Stempeln --- */
const sHeute = await rufe(tA, "stempeln", "POST", { datum: HEUTE, art: "start" });
pruef("/api/stempeln heute: 200", sHeute.status === 200, `Status ${sHeute.status}`);
const sEnde = await rufe(tA, "stempeln", "POST", { datum: HEUTE, art: "ende" });
pruef("/api/stempeln heute Ende: 200", sEnde.status === 200, `Status ${sEnde.status}`);
const sZukunft = await rufe(tA, "stempeln", "POST", { datum: tag(1), art: "start" });
pruef("/api/stempeln morgen: abgewiesen", sZukunft.status === 422, `Status ${sZukunft.status}`);
const sAlt = await rufe(tA, "stempeln", "POST", { datum: tag(-5), art: "start" });
pruef("/api/stempeln vor fünf Tagen: abgewiesen", sAlt.status === 422, `Status ${sAlt.status}`);
const sGesternFrueh = await rufe(tA, "stempeln", "POST", { datum: tag(-1), art: "ende" });
pruef("/api/stempeln gestern ohne Nachtdienst: abgewiesen", sGesternFrueh.status === 422, `Status ${sGesternFrueh.status}`);
const sNacht = await rufe(tN, "stempeln", "POST", { datum: tag(-1), art: "ende" });
pruef("/api/stempeln gestern mit Nachtdienst: 200", sNacht.status === 200, `Status ${sNacht.status}`);

/* --- Autosave nach dem Stempeln: die lokale Kopie ohne geprueftStart --- */
{
  const r = await lies(tA);
  const b = kopie(r.bestand);
  const k = `a1|${HEUTE}`;
  const stand = b.mandanten[0].einstempeln[k];
  b.mandanten[0].einstempeln[k] = { start: stand.start, ortStart: stand.ortStart, innerhalbStart: stand.innerhalbStart,
    ende: stand.ende, ortEnde: stand.ortEnde, innerhalbEnde: stand.innerhalbEnde };
  b.mandanten[0].personen[0].telefon = "0151";
  const w = await schreib(tA, b, r.etag);
  pruef("Speichern nach dem Stempeln mit gekürzter Kopie: kein 403/409", w.status === 200, `Status ${w.status}`);
}

const vorher = await erfassungL();
const stempelVorher = (await lies(tL)).bestand.mandanten[0].einstempeln;

/* --- Angriffe --- */
const angriffe = [
  ["bestehenden Eintrag ändern", (m) => { m.erfassung[`a1|${tag(-2)}`] = { ...ABWEICHEND, ende: "23:00" }; }],
  ["bestehenden Eintrag löschen", (m) => { delete m.erfassung[`a1|${tag(-1)}`]; }],
  ["gestempelte Zeit überschreiben", (m) => { m.erfassung[`a1|${HEUTE}`] = { start: "00:00", ende: "23:59", bestaetigt: true, grund: "" }; }],
  ["künftiger Tag", (m) => { m.erfassung[`a1|${tag(1)}`] = { start: null, ende: null, bestaetigt: true, grund: "" }; }],
  ["Tag ohne Dienst", (m) => { m.erfassung[`a1|${tag(-3)}`] = { start: null, ende: null, bestaetigt: true, grund: "" }; }],
  ["Zusatzfelder", (m) => { m.erfassung[`a1|${tag(-4)}`] = { start: null, ende: null, bestaetigt: true, grund: "", innerhalbStart: true }; }],
  ["fremde Person", (m) => { m.erfassung[`n1|${tag(-1)}`] = { start: null, ende: null, bestaetigt: true, grund: "" }; }],
  ["Stempelzeit über PUT", (m) => { m.einstempeln[`a1|${tag(-4)}`] = { start: "06:00", innerhalbStart: true, geprueftStart: true }; }],
];
for (const [name, f] of angriffe) {
  const w = await alsA(f);
  pruef(`Angriff „${name}": abgewiesen oder wirkungslos`, [200, 403, 422].includes(w.status), `Status ${w.status}`);
}
const nachher = await erfassungL();
const stempelNachher = (await lies(tL)).bestand.mandanten[0].einstempeln;
pruef("Nach allen Angriffen: Zeiterfassung unverändert", JSON.stringify(nachher) === JSON.stringify(vorher),
  `${Object.keys(vorher).length} → ${Object.keys(nachher).length} Einträge`);
pruef("… Stempeluhr unverändert", JSON.stringify(stempelNachher) === JSON.stringify(stempelVorher));
pruef("… gestempelte Zeit vom Server bestätigt", nachher[`a1|${HEUTE}`] && nachher[`a1|${HEUTE}`].bestaetigt === true
  && stempelNachher[`a1|${HEUTE}`].geprueftStart !== undefined);

/* --- Protokoll: die Selbstauskünfte stehen eigens darin --- */
{
  const lage = await fetch(`${BASIS}/lage?tage=1`, { headers: { authorization: `Bearer ${tBetr}` } })
    .then((x) => x.json()).catch(() => ({}));
  const zeilen = JSON.stringify(lage.letzte || []);
  pruef("Protokoll vermerkt die Selbstauskünfte", zeilen.includes("Selbstauskunft Zeiten") && zeilen.includes(tag(-2)));
  pruef("… und abgewiesene Stempelversuche", /stempeln start .*künftig/.test(zeilen) || zeilen.includes("künftigen Tag"));
}

const bestanden = ergebnisse.filter((r) => r.ok).length;
console.log(`\n${bestanden} von ${ergebnisse.length} Prüfungen bestanden.`);
if (bestanden !== ergebnisse.length) {
  console.log("Fehlgeschlagen:");
  for (const r of ergebnisse.filter((x) => !x.ok)) console.log(`  - ${r.name} (${r.detail})`);
  process.exit(1);
}
