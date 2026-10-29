/* ==========================================================================
   SCHUTZMERKMALE — Einsatzregeln statt Rohdaten, gegen einen laufenden
   Server (Commit S1)

   Die Schichtverantwortung bekommt für ihren Bereich und den Pool keine
   Schutzmerkmale mehr, sondern planungsregeln; Planung und Leitung sehen
   die Rohdaten unverändert. Rundweg ohne Verlust, abgeleitete Felder nie
   gespeichert, Rohfelder nicht überschreibbar.

   Aufruf: node pruefungen/serverlauf.mjs schutzmerkmale-sicht
   Schreibt in den Raum "schutz-probe".
   ========================================================================== */

const BASIS = process.env.CENTRIC_BASIS || "http://localhost:5173";
const GEHEIM = process.env.CENTRIC_ADMIN || "testgeheim";
const HERKUNFT = process.env.CENTRIC_HERKUNFT || "10.0.12.";
const RAUM = "schutz-probe";

let nr = 0;
async function zugang(rolle, person, betrieb) {
  nr += 1;
  const a = await fetch(`${BASIS}/einrichten`, { method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": `${HERKUNFT}${nr}` },
    body: JSON.stringify({ verwaltung: GEHEIM, name: `Schutzprobe ${rolle} ${person}`, bestand: RAUM, rolle, person, betrieb }) });
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
const pers = (m, id) => m.personen.find((p) => p.id === id);

const ergebnisse = [];
const pruef = (name, bedingung, detail) => {
  ergebnisse.push({ name, ok: !!bedingung, detail });
  console.log(`${bedingung ? "  BESTANDEN" : "  FEHLGESCHLAGEN"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

const tagPlus = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const GEB = (() => { const d = new Date(`${tagPlus(30)}T00:00:00Z`); d.setUTCFullYear(d.getUTCFullYear() - 18); return d.toISOString().slice(0, 10); })();
const VORSORGE = "2025-03-03";
const person = (id, rolle, einheit, extra = {}) => ({ id, vorname: `V${id}`, nachname: `N${id}`, rolle, bereich: einheit,
  zugehoerigkeit: einheit === "ALLE" ? [] : [{ ab: "2020-01-01", einheitId: einheit }], ...extra });

const tBetr = await anmelden(await zugang("betreiber", null, 0));
pruef("Raum eingerichtet", (await rufe(tBetr, "/api/bestand-anlegen", "POST", { inhalt: {
  version: 9, stand: 1, session: null, mandanten: [{
    id: "m-a", name: "A", einheiten: [{ id: "e1" }, { id: "e2" }, { id: "ePool", pool: true }],
    dienstarten: [{ id: "N", name: "Nacht", start: "22:00", ende: "06:00", pause: 30 }],
    personen: [person("s1", "subplaner", "e1"), person("mu", "mitarbeiter", "e1", { mutterschutz: true }),
      person("sb", "mitarbeiter", "e1", { schwerbehindert: true }), person("ju", "mitarbeiter", "e1", { geburtstag: GEB }),
      person("vo", "mitarbeiter", "e1", { nachtvorsorge: VORSORGE }),
      person("we", "mitarbeiter", "e1", { einschraenkungen: { keineNacht: true, wiedereingliederung: { von: tagPlus(-5), bis: tagPlus(30), maxStundenWoche: 17.25 } } }),
      person("po", "mitarbeiter", "ePool", { mutterschutz: true }), person("fr", "mitarbeiter", "e2", { schwerbehindert: true }),
      person("pl", "planer", "ALLE")],
    abweichungen: {}, aenderungen: [], nachrichten: [], anfragen: [], notrufe: [] }] } })).status === 200);
const tS = await anmelden(await zugang("subplaner", "s1", 0));
const tP = await anmelden(await zugang("planer", "pl", 0));
const vorher = await betriebVon(tP);

const mS = await betriebVon(tS);
const text = JSON.stringify(mS);
const verboten = ["mutterschutz", "schwerbehindert", "nachtvorsorge", "wiedereingliederung", "geburtstag", GEB, VORSORGE].filter((s) => text.includes(s));
pruef("SV: keine Rohmarker", verboten.length === 0, verboten.join(", "));
pruef("SV: planungsregeln für Bereich und Pool", ["mu", "sb", "ju", "vo", "we", "po"].every((id) => Array.isArray(pers(mS, id).planungsregeln))
  && pers(mS, "fr").planungsregeln === undefined);
pruef("SV: Mutterschutz-Person — Nacht und Sonntag als Einsatzregel", JSON.stringify(pers(mS, "mu").planungsregeln.map((r) => r.regel).sort())
  === JSON.stringify(["nachtNichtZulaessig", "sonntagNurMitFreigabe"]));
pruef("SV: Wochenstundengrenze neutral, keineNacht bleibt", pers(mS, "we").planungsregeln[0].regel === "stundengrenzeWoche"
  && pers(mS, "we").planungsregeln[0].wert === 17.25 && pers(mS, "we").einschraenkungen.keineNacht === true);
pruef("Planung: Rohdaten unverändert", pers(vorher, "mu").mutterschutz === true && pers(vorher, "ju").geburtstag === GEB
  && pers(vorher, "vo").nachtvorsorge === VORSORGE && !vorher.personen.some((p) => "planungsregeln" in p));

const rw = await schreibe(tS, (m) => { m.abweichungen[`vo|${tagPlus(3)}`] = "N"; });
pruef("Rundweg SV: alle Rohwerte exakt gespeichert", rw.status === 200
  && JSON.stringify((await betriebVon(tP)).personen) === JSON.stringify(vorher.personen), `Status ${rw.status}`);
const dr = await schreibe(tS, (m) => { pers(m, "mu").planungsregeln = []; pers(m, "vo").planungsregeln = [{ regel: "frei" }]; });
pruef("SV: planungsregeln manipulieren — nichts gespeichert", dr.status === 200
  && JSON.stringify((await betriebVon(tP)).personen) === JSON.stringify(vorher.personen), `Status ${dr.status}`);
const roh = await schreibe(tS, (m) => { pers(m, "mu").mutterschutz = false; });
pruef("SV: Rohfeld setzen — abgewiesen", roh.status === 403, `Status ${roh.status}`);
pruef("… Mutterschutz unverändert gespeichert", pers(await betriebVon(tP), "mu").mutterschutz === true);

const bestanden = ergebnisse.filter((r) => r.ok).length;
console.log(`\n${bestanden} von ${ergebnisse.length} Prüfungen bestanden.`);
if (bestanden !== ergebnisse.length) {
  console.log("Fehlgeschlagen:");
  for (const r of ergebnisse.filter((x) => !x.ok)) console.log(`  - ${r.name} (${r.detail})`);
  process.exit(1);
}
