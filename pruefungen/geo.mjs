/* ==========================================================================
   GEO V1 — gegen einen laufenden Server (HTTP, echter daten-Handler)

   Schalter aus: Zeit erfasst, keine Prüfung. Einschalten nur durch die
   Leitung mit Bestätigung. Schalter an: INNERHALB, AUSSERHALB,
   NICHT_BEWERTBAR (Grenzfall, Genauigkeit > 1000 m, ungültige Koordinate) —
   die Arbeitszeit wird in jedem Fall gespeichert. Ungültige Standortwerte
   am Schreibweg vorbei: 422. Datenschutz: keine Rohkoordinate, keine exakte
   Entfernung in Antworten und im gespeicherten Stand. Vergessenes
   Ausstempeln: Ein offener Beginn, der mehr als 20 Stunden zurückliegt,
   wird nicht zur bestätigten Erfassung (Geo-Spezifikation B6).

   Aufruf: node pruefungen/serverlauf.mjs geo
   Schreibt in den Raum "geo-probe".
   ========================================================================== */

const BASIS = process.env.CENTRIC_BASIS || "http://localhost:5173";
const GEHEIM = process.env.CENTRIC_ADMIN || "testgeheim";
const HERKUNFT = process.env.CENTRIC_HERKUNFT || "10.0.15.";
const RAUM = "geo-probe";

let nr = 0;
async function zugang(rolle, person, betrieb) {
  nr += 1;
  const a = await fetch(`${BASIS}/einrichten`, { method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": `${HERKUNFT}${nr}` },
    body: JSON.stringify({ verwaltung: GEHEIM, name: `Geoprobe ${rolle} ${person}`, bestand: RAUM, rolle, person, betrieb }) });
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
  return { status: a.status, text, ...d, roh: text };
};

const ergebnisse = [];
const pruef = (name, bedingung, detail) => {
  ergebnisse.push({ name, ok: !!bedingung, detail });
  console.log(`${bedingung ? "  BESTANDEN" : "  FEHLGESCHLAGEN"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

const HEUTE = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());
const REF = { lat: 50, lon: 8 };
const nord = (m) => REF.lat + m / ((2 * Math.PI * 6371000) / 360);
const IDS = ["a1", "a2", "a3", "a4", "a5", "a6"];
/* Offene Beginne relativ zur Serverzeit: v1 vor 24 Stunden (vergessen), v2 vor einer Stunde. */
const BERLIN = (d) => ({ tag: new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(d),
  zeit: d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" }) });
const VOR24 = BERLIN(new Date(Date.now() - 24 * 3600000));
const VOR1 = BERLIN(new Date(Date.now() - 3600000));
const person = (id, rolle) => ({ id, vorname: `V${id}`, nachname: `N${id}`, rolle, bereich: rolle === "leitung" ? "ALLE" : "e1",
  status: "aktiv", zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }] });

const tBetr = await anmelden(await zugang("betreiber", null, 0));
const anl = await rufe(tBetr, "/api/bestand-anlegen", "POST", { inhalt: { version: 9, stand: 1, mandanten: [{
  id: "m-a", name: "Geobetrieb", status: "aktiv", einstellungen: {},
  einheiten: [{ id: "e1", name: "WB", standortId: "st1" }], standorte: [{ id: "st1", name: "Zentrale", bundesland: "HE", lat: REF.lat, lon: REF.lon, radius: 200 }],
  dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00" }],
  personen: [person("l1", "leitung"), person("p1", "planer"), ...[...IDS, "v1", "v2"].map((i) => person(i, "mitarbeiter"))],
  /* v2: an den Tagen des Stempels Frühdienst geplant — kein ungeplanter Dienst (WP-13). */
  abweichungen: Object.fromEntries([...IDS.map((i) => [`${i}|${HEUTE}`, "F"]), [`v2|${HEUTE}`, "F"], [`v2|${VOR1.tag}`, "F"]]),
  anfragen: [], notrufe: [], nachrichten: [], abwesenheiten: [], einstempeln: { [`v1|${VOR24.tag}`]: { start: VOR24.zeit }, [`v2|${VOR1.tag}`]: { start: VOR1.zeit } }, erfassung: {},
}] } });
pruef("Raum mit Standort angelegt", anl.status === 200, `Status ${anl.status} ${anl.text}`);
const T = {};
T.l1 = await anmelden(await zugang("leitung", "l1", 0));
for (const id of [...IDS, "v1", "v2"]) T[id] = await anmelden(await zugang("mitarbeiter", id, 0));

const stempeln = (t, rumpf) => rufe(t, "/api/stempeln", "POST", { datum: HEUTE, ...rumpf });
const antworten = [];
const merke = (x) => { antworten.push(x.roh); return x; };

/* Schalter aus (Vorgabe) */
const aus = merke(await stempeln(T.a1, { art: "start", lat: nord(10), lon: REF.lon, accuracy: 5 }));
pruef("Geo aus: Zeit gespeichert, keine Prüfung", aus.status === 200 && !!aus.eintrag && !!aus.eintrag.start
  && aus.eintrag.geoStart.grund === "pruefung_aus" && aus.innerhalb === null, `Status ${aus.status} ${aus.text}`);

/* Einschalten: nur mit Bestätigung */
const schalten = async (extra) => {
  const r = await rufe(T.l1, "/api/bestand", "GET");
  const b = JSON.parse(JSON.stringify(r.bestand));
  b.mandanten[0].einstellungen = { ...(b.mandanten[0].einstellungen || {}), geoPruefung: true, ...extra };
  return rufe(T.l1, "/api/bestand", "PUT", { bestand: b, etag: r.etag, durch: "Test" });
};
const ohne = await schalten({});
pruef("Einschalten ohne Bestätigung: 403", ohne.status === 403, `Status ${ohne.status}`);
const mit = await schalten({ geoPruefungBestaetigt: true });
const nachher = (await rufe(T.l1, "/api/bestand", "GET")).bestand.mandanten[0].einstellungen;
pruef("Einschalten mit Bestätigung: an, Zeitpunkt und Person vom Server, Merkmal nicht gespeichert", mit.status === 200
  && nachher.geoPruefung === true && nachher.geoPruefungAktiviertVon === "l1" && !("geoPruefungBestaetigt" in nachher),
  `Status ${mit.status} ${JSON.stringify(nachher)}`);

/* Schalter an */
const innen = merke(await stempeln(T.a2, { art: "start", lat: nord(43), lon: REF.lon, accuracy: 10 }));
pruef("Geo an, innerhalb: INNERHALB", innen.status === 200 && innen.eintrag.geoStart.status === "INNERHALB" && innen.innerhalb === true,
  `${innen.status} ${JSON.stringify(innen.eintrag && innen.eintrag.geoStart)}`);
const aussen = merke(await stempeln(T.a3, { art: "start", lat: nord(2137), lon: REF.lon, accuracy: 20 }));
pruef("Geo an, außerhalb: AUSSERHALB, Zeit gespeichert", aussen.status === 200 && aussen.eintrag.geoStart.status === "AUSSERHALB"
  && !!aussen.eintrag.start, JSON.stringify(aussen.eintrag && aussen.eintrag.geoStart));
const grenze = merke(await stempeln(T.a4, { art: "start", lat: nord(251), lon: REF.lon, accuracy: 80 }));
pruef("Grenzfall der Genauigkeit: NICHT_BEWERTBAR", grenze.status === 200 && grenze.eintrag.geoStart.status === "NICHT_BEWERTBAR"
  && grenze.eintrag.geoStart.grund === "genauigkeit_zu_schlecht", JSON.stringify(grenze.eintrag && grenze.eintrag.geoStart));
const ungenau = merke(await stempeln(T.a5, { art: "start", lat: nord(0), lon: REF.lon, accuracy: 1500 }));
pruef("Genauigkeit über 1000 m: zwingend NICHT_BEWERTBAR, Warnung", ungenau.status === 200
  && ungenau.eintrag.geoStart.status === "NICHT_BEWERTBAR" && ungenau.eintrag.geoStart.genauigkeitWarnung === true,
  JSON.stringify(ungenau.eintrag && ungenau.eintrag.geoStart));
const ungueltig = merke(await stempeln(T.a6, { art: "start", lat: REF.lat + 360, lon: REF.lon, accuracy: 5 }));
pruef("ungültige Koordinate (lat + 360°): nie INNERHALB, Zeit gespeichert", ungueltig.status === 200
  && ungueltig.eintrag.geoStart.status === "NICHT_BEWERTBAR" && ungueltig.innerhalb !== true && !!ungueltig.eintrag.start,
  JSON.stringify(ungueltig.eintrag && ungueltig.eintrag.geoStart));

/* Standortwerte am Schreibweg vorbei */
const setze = async (felder) => {
  const r = await rufe(T.l1, "/api/bestand", "GET");
  const b = JSON.parse(JSON.stringify(r.bestand));
  b.mandanten[0].standorte = b.mandanten[0].standorte.map((s) => ({ ...s, ...felder }));
  return rufe(T.l1, "/api/bestand", "PUT", { bestand: b, etag: r.etag, durch: "Test" });
};
const abgewiesen = [];
for (const f of [{ lat: 450 }, { lon: -220 }, { radius: 0 }, { radius: 10000 }]) abgewiesen.push([(await setze(f)).status, JSON.stringify(f)]);
const st = (await rufe(T.l1, "/api/bestand", "GET")).bestand.mandanten[0].standorte[0];
pruef("Ungültige Standortwerte: 422, nichts gespeichert", abgewiesen.every(([s]) => s === 422)
  && st.lat === REF.lat && st.lon === REF.lon && st.radius === 200, JSON.stringify(abgewiesen));

/* Vergessenes Ausstempeln: 20-Stunden-Grenze */
const vergessen = merke(await stempeln(T.v1, { datum: VOR24.tag, art: "ende" }));
const nachV = (await rufe(T.l1, "/api/bestand", "GET")).bestand.mandanten[0];
/* Seit WP-17 (B6.3): nie still angehängt. Das Ende wird ein eigenes Ereignis
   auf dem Server-Tag (START_FEHLT), der alte Vorgang bleibt offen und trägt
   KONFLIKT für die Korrektur durch die Leitung. */
const heuteV = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());
pruef("Beginn vor 24 h: Ende als eigenes Ereignis (START_FEHLT), alter Vorgang KONFLIKT und offen, keine bestätigte Erfassung",
  vergessen.status === 200 && vergessen.datum === heuteV
  && (vergessen.markierungen || []).includes("START_FEHLT") && vergessen.erfassung === null
  && nachV.einstempeln[`v1|${VOR24.tag}`].start === VOR24.zeit && !nachV.einstempeln[`v1|${VOR24.tag}`].ende
  && (nachV.einstempeln[`v1|${VOR24.tag}`].markierungen || []).includes("KONFLIKT")
  && nachV.erfassung[`v1|${VOR24.tag}`] === undefined, `${vergessen.status} ${vergessen.text}`);
const frisch = merke(await stempeln(T.v2, { datum: VOR1.tag, art: "ende" }));
pruef("Beginn vor 1 h: zugeordnet, bestätigte Erfassung", frisch.status === 200
  && !(frisch.markierungen || []).includes("START_VERALTET") && !!frisch.erfassung && frisch.erfassung.start === VOR1.zeit
  && frisch.erfassung.bestaetigt === true, `${frisch.status} ${frisch.text}`);

/* Datenschutz */
const gespeichert = (await rufe(T.l1, "/api/bestand", "GET")).roh;
const alle = [...antworten, gespeichert].join("\n");
const roh = [nord(43), nord(2137), nord(251), REF.lat + 360].map((x) => String(x).slice(0, 9));
pruef("keine Rohkoordinate in Antworten und gespeichertem Stand", roh.every((x) => !alle.includes(x)), roh.filter((x) => alle.includes(x)).join(", "));
pruef("keine exakte Meterzahl: nur gerundete Entfernung", !/\(\d+ m\)/.test(alle) && !alle.includes("2137") && !alle.includes("\"43\"")
  && aussen.eintrag.geoStart.entfernungGerundet === "2100" && innen.eintrag.geoStart.entfernungGerundet === "50",
  `${aussen.eintrag.geoStart.entfernungGerundet} / ${innen.eintrag.geoStart.entfernungGerundet}`);

const bestanden = ergebnisse.filter((x) => x.ok).length;
console.log(`\n${bestanden} von ${ergebnisse.length} Prüfungen bestanden.`);
if (bestanden !== ergebnisse.length) {
  console.log("Fehlgeschlagen:");
  for (const x of ergebnisse.filter((y) => !y.ok)) console.log(`  - ${x.name} (${x.detail})`);
  process.exit(1);
}
