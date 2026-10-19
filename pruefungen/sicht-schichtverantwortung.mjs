/* ==========================================================================
   SICHT DER SCHICHTVERANTWORTUNG — gegen einen laufenden Server (1e.1)

   Die Schichtverantwortung liest über GET /api/bestand. Private Angaben,
   Lohnfelder, Leitungsnotizen und Geheimnisse anderer Personen dürfen nicht
   im Payload stehen; Schutzmerkmale nur im eigenen Bereich und Pool. Dann
   schreibt sie die gekürzte Sicht mit einer erlaubten Planänderung zurück:
   200, und die Leitung liest alles Verborgene unverändert.

   Aufruf: node pruefungen/serverlauf.mjs sicht-schichtverantwortung
   Schreibt in den Raum "sicht-schicht".
   ========================================================================== */

const BASIS = process.env.CENTRIC_BASIS || "http://localhost:5173";
const GEHEIM = process.env.CENTRIC_ADMIN || "testgeheim";
const HERKUNFT = process.env.CENTRIC_HERKUNFT || "10.3.3.";
const RAUM = "sicht-schicht";

let nr = 0;
async function zugang(rolle, person) {
  nr += 1;
  const a = await fetch(`${BASIS}/einrichten`, { method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": `${HERKUNFT}${nr}` },
    body: JSON.stringify({ verwaltung: GEHEIM, name: `Sichtprobe ${rolle}`, bestand: RAUM, rolle, person, betrieb: 0 }) });
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

const privat = (id) => ({ email: `${id}@privat.de`, telefon: `0151-${id}`, mobil: `0171-${id}`,
  anschrift: `Gartenweg ${id}`, notfallkontakt: `Mutter von ${id}`, iban: `DE89-${id}`, notiz: `Leitungsnotiz-${id}`,
  kalenderGeheim: `geheim-kal-${id}`, pushSchluessel: { endpoint: `push-${id}` }, mutterschutz: true,
  geburtstag: "2009-05-01", stundenuebertrag: 7, darfNichtRaus: `darf-nicht-raus-${id}` });
const person = (id, rolle, einheit, extra = {}) => ({ id, vorname: "V", nachname: `N${id}`, rolle, bereich: einheit,
  zugehoerigkeit: [{ ab: "2020-01-01", einheitId: einheit }], ...privat(id), ...extra });
const start = { version: 9, stand: 1, session: null, mandanten: [{
  id: "sicht-schicht", name: "Haus Sicht", einheiten: [{ id: "e1" }, { id: "e2" }, { id: "pool", pool: true }],
  dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00" }],
  personen: [person("s1", "subplaner", "e1"), person("a1", "mitarbeiter", "e1"), person("b1", "mitarbeiter", "e2"),
    person("sp1", "mitarbeiter", "pool", { springer: true }), person("l1", "leitung", "ALLE")],
  abweichungen: {}, abwesenheiten: [], anfragen: [], nachrichten: [], erfassung: {}, einstempeln: {},
}] };

const tBetr = await anmelden(await zugang("betreiber", null));
pruef("Raum eingerichtet", (await rufe(tBetr, "bestand-anlegen", "POST", { inhalt: start })).status === 200);
const tL = await anmelden(await zugang("leitung", "l1"));
const tS = await anmelden(await zugang("subplaner", "s1"));

const rS = await lies(tS);
const text = JSON.stringify(rS);
const pers = (r, id) => r.bestand.mandanten[0].personen.find((p) => p.id === id);
pruef("Schichtverantwortung liest", rS.status === 200, `Status ${rS.status}`);
pruef("Unbekanntes Personenfeld geht nicht hinaus", !text.includes("darf-nicht-raus"));
for (const id of ["a1", "b1", "sp1", "l1"]) {
  const lecks = [`geheim-kal-${id}`, `push-${id}`, `DE89-${id}`, `Gartenweg ${id}`, `Mutter von ${id}`,
    `Leitungsnotiz-${id}`, `${id}@privat.de`].filter((s) => text.includes(s));
  pruef(`Keine privaten Angaben oder Geheimnisse von ${id}`, lecks.length === 0, lecks.join(", "));
}
pruef("Eigener Bereich: Telefon, Mobil, Schutzmerkmale, Konto", pers(rS, "a1").telefon === "0151-a1"
  && pers(rS, "a1").mobil === "0171-a1" && pers(rS, "a1").mutterschutz === true && pers(rS, "a1").stundenuebertrag === 7);
pruef("Pool: Telefon und Schutzmerkmale, kein Konto", pers(rS, "sp1").telefon === "0151-sp1"
  && pers(rS, "sp1").mutterschutz === true && pers(rS, "sp1").stundenuebertrag === undefined);
pruef("Anderer Bereich: keine Schutzmerkmale, kein Telefon", pers(rS, "b1").mutterschutz === undefined
  && pers(rS, "b1").geburtstag === undefined && pers(rS, "b1").telefon === undefined);
pruef("Eigene Person: eigene Angaben vollständig", pers(rS, "s1").email === "s1@privat.de"
  && pers(rS, "s1").kalenderGeheim === "geheim-kal-s1");

/* --- Rundweg: dieselbe gekürzte Sicht mit erlaubter Änderung zurück --- */
const vorher = (await lies(tL)).bestand.mandanten[0].personen;
const b = kopie(rS.bestand);
b.mandanten[0].abweichungen["a1|2026-12-01"] = "F";
const w = await schreib(tS, b, rS.etag);
pruef("Gekürzte Sicht mit Planänderung zurückgeschrieben: 200", w.status === 200, `Status ${w.status} ${w.text || ""}`);
const rL = await lies(tL);
pruef("Leitung: Planänderung angekommen", rL.bestand.mandanten[0].abweichungen["a1|2026-12-01"] === "F");
pruef("Leitung: alle Personen wertgleich, nichts Verborgenes verloren",
  JSON.stringify(rL.bestand.mandanten[0].personen) === JSON.stringify(vorher));
pruef("Leitung: kein sichtbereich im Bestand", !JSON.stringify(rL).includes("sichtbereich"));
const rS2 = await lies(tS);
pruef("Erneut als Schichtverantwortung gelesen: weiter gekürzt", !JSON.stringify(rS2).includes("Leitungsnotiz-a1")
  && !JSON.stringify(rS2).includes("darf-nicht-raus"));

/* --- Angriffe auf verborgene Felder --- */
for (const [name, f] of [
  ["Leitungsnotiz einer Person des Bereichs setzen", (m) => { m.personen.find((p) => p.id === "a1").notiz = "manipuliert"; }],
  ["IBAN einer fremden Person setzen", (m) => { m.personen.find((p) => p.id === "b1").iban = "DE00"; }],
  ["eigene Leitungsnotiz setzen", (m) => { m.personen.find((p) => p.id === "s1").notiz = "selbst"; }],
]) {
  const r = await lies(tS);
  const x = kopie(r.bestand);
  f(x.mandanten[0]);
  const a = await schreib(tS, x, r.etag);
  pruef(`Angriff „${name}": 403`, a.status === 403, `Status ${a.status}`);
}
pruef("Nach den Angriffen: Personen unverändert",
  JSON.stringify((await lies(tL)).bestand.mandanten[0].personen) === JSON.stringify(vorher));

const bestanden = ergebnisse.filter((r) => r.ok).length;
console.log(`\n${bestanden} von ${ergebnisse.length} Prüfungen bestanden.`);
if (bestanden !== ergebnisse.length) {
  console.log("Fehlgeschlagen:");
  for (const r of ergebnisse.filter((x) => !x.ok)) console.log(`  - ${r.name} (${r.detail})`);
  process.exit(1);
}
