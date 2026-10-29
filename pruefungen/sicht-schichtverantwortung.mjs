/* ==========================================================================
   SICHT DER SCHICHTVERANTWORTUNG — gegen einen laufenden Server (1e.1, 1e.2)

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
const ohnePlan = (m) => Object.fromEntries(Object.entries(m).filter(([k]) => k !== "abweichungen"));

const privat = (id) => ({ email: `${id}@privat.de`, telefon: `0151-${id}`, mobil: `0171-${id}`,
  anschrift: `Gartenweg ${id}`, notfallkontakt: `Mutter von ${id}`, iban: `IBAN-DE89-${id}`, notiz: `interne Leitungsnotiz-${id}`,
  kalenderGeheim: `geheim-kal-${id}`, pushSchluessel: { endpoint: `push-${id}` }, mutterschutz: true,
  geburtstag: "2009-05-01", stundenuebertrag: 7, darfNichtRaus: `darf-nicht-raus-${id}` });
const person = (id, rolle, einheit, extra = {}) => ({ id, vorname: "V", nachname: `N${id}`, rolle, bereich: einheit,
  zugehoerigkeit: [{ ab: "2020-01-01", einheitId: einheit }], ...privat(id), ...extra });
const start = { version: 9, stand: 1, session: null, mandanten: [{
  id: "sicht-schicht", name: "Haus Sicht", einheiten: [{ id: "e1" }, { id: "e2" }, { id: "pool", pool: true }],
  dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00" }],
  personen: [person("s1", "subplaner", "e1"), person("a1", "mitarbeiter", "e1"), person("b1", "mitarbeiter", "e2"),
    person("sp1", "mitarbeiter", "pool", { springer: true }), person("l1", "leitung", "ALLE")],
  abweichungen: {},
  /* Sammlungen mit Markern (1e.2) */
  abwesenheiten: [{ id: "ab-a", personId: "a1", art: "krank", von: "2026-12-01", bis: "2026-12-02", notiz: "Migräne" },
    { id: "ab-b", personId: "b1", art: "krank", von: "2026-12-01", bis: "2026-12-02", notiz: "Psychotherapie" },
    { id: "ab-sp", personId: "sp1", art: "krank", von: "2026-12-01", bis: "2026-12-02", notiz: "Kind krank" }],
  anfragen: [{ id: "an-a", personId: "a1", typ: "abwesenheit", art: "urlaub", status: "offen", von: "2026-12-20", bis: "2026-12-21", text: "Hochzeit" },
    { id: "an-b", personId: "b1", typ: "abwesenheit", art: "urlaub", status: "offen", von: "2026-12-20", bis: "2026-12-21", text: "Scheidung" }],
  nachrichten: [{ id: "n-a", personId: "a1", art: "info", titel: "fremde Nachricht" }, { id: "n-s", personId: "s1", art: "info", titel: "an mich" }],
  erfassung: { "a1|2026-10-01": { start: "06:00", ende: "15:00", bestaetigt: true, grund: "Korrekturgrund geheim", geheimesZusatzfeld: "darf-nicht-raus" },
    "b1|2026-10-01": { start: "06:00", ende: "14:00", bestaetigt: true, grund: "x" } },
  einstempeln: { "a1|2026-10-01": { start: "06:00", ortStart: "Abweichend, 4 km", innerhalbStart: false, geprueftStart: true } },
  protokoll: [{ id: "l1", zeit: "1", text: "Lohn geändert" }],
  notizen: { "tag|2026-12-01": [{ id: "tn", text: "Tagesnotiz", einheitId: "e1" }, { id: "tn-alt", text: "Tagesnotiz ohne Einheit" }], "person|a1": [{ id: "pn", text: "interne Leitungsnotiz zur Person" }] },
  preisgestaltung: { sonder: 0 }, kontaktName: "Chef", ustId: "DE123",
  standorte: [{ id: "st1", name: "Haupthaus", lat: 50.1, lon: 8.6, radius: 150 }],
  geheimeSammlung: [{ x: "darf-nicht-raus" }],
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
/* Seit Commit S1 statt der Schutzmerkmale abgeleitete Einsatzregeln. */
pruef("Eigener Bereich: Telefon, Mobil, Einsatzregeln statt Schutzmerkmal, Konto", pers(rS, "a1").telefon === "0151-a1"
  && pers(rS, "a1").mobil === "0171-a1" && pers(rS, "a1").mutterschutz === undefined
  && pers(rS, "a1").planungsregeln.some((x) => x.regel === "sonntagNurMitFreigabe") && pers(rS, "a1").stundenuebertrag === 7);
pruef("Pool: Telefon und Einsatzregeln, kein Schutzmerkmal, kein Konto", pers(rS, "sp1").telefon === "0151-sp1"
  && pers(rS, "sp1").mutterschutz === undefined && Array.isArray(pers(rS, "sp1").planungsregeln)
  && pers(rS, "sp1").stundenuebertrag === undefined);
pruef("Anderer Bereich: keine Schutzmerkmale, kein Telefon", pers(rS, "b1").mutterschutz === undefined
  && pers(rS, "b1").geburtstag === undefined && pers(rS, "b1").telefon === undefined);
for (const s of ["Migräne", "Psychotherapie", "Kind krank", "IBAN", "Scheidung", "interne Leitungsnotiz",
  "Korrekturgrund geheim", "fremde Nachricht", "Abweichend, 4 km", "Lohn geändert", "DE123"])
  pruef(`Marker „${s}" nicht im Payload`, !text.includes(s));
pruef("„geheim\" nur am eigenen Kalendergeheimnis", (text.match(/geheim/g) || []).length === 1 && text.includes("geheim-kal-s1"));
{
  const m = rS.bestand.mandanten[0];
  pruef("Abwesenheit im Bereich: Kategorie ohne Anmerkung", JSON.stringify(m.abwesenheiten.find((a) => a.id === "ab-a"))
    === JSON.stringify({ id: "ab-a", personId: "a1", art: "krank", von: "2026-12-01", bis: "2026-12-02" }));
  pruef("Fremder Antrag nicht sichtbar, Antrag im Bereich mit Text", !m.anfragen.some((a) => a.id === "an-b")
    && m.anfragen.find((a) => a.id === "an-a").text === "Hochzeit");
  pruef("Nachrichten: nur eigene", JSON.stringify(m.nachrichten.map((n) => n.id)) === JSON.stringify(["n-s"]));
  pruef("Erfassung: Bereich ohne Grund, fremd weg", JSON.stringify(m.erfassung) === JSON.stringify({ "a1|2026-10-01": { start: "06:00", ende: "15:00", bestaetigt: true } }));
  pruef("Stempelzeiten anderer nicht sichtbar", JSON.stringify(m.einstempeln) === "{}");
  /* Seit Commit C3 nur Tagesnotizen der eigenen Einheit (die ohne Einheit nicht). */
  pruef("Protokoll leer, Personennotiz weg, Tagesnotiz der eigenen Einheit da, ohne Einheit nicht", m.protokoll.length === 0
    && JSON.stringify(Object.keys(m.notizen)) === JSON.stringify(["tag|2026-12-01"])
    && JSON.stringify(m.notizen["tag|2026-12-01"].map((x) => x.id)) === JSON.stringify(["tn"]));
  pruef("Standort ohne Koordinaten", JSON.stringify(m.standorte) === JSON.stringify([{ id: "st1", name: "Haupthaus" }]));
  pruef("Kaufmännisches weg", m.preisgestaltung === undefined && m.ustId === undefined && m.kontaktName === undefined);
  pruef("Oben nur Zähler, Sitzungsmarke, Betrieb", JSON.stringify(Object.keys(rS.bestand).sort())
    === JSON.stringify(["mandanten", "session", "stand", "version"]));
}
pruef("Eigene Person: eigene Angaben vollständig", pers(rS, "s1").email === "s1@privat.de"
  && pers(rS, "s1").kalenderGeheim === "geheim-kal-s1");

/* --- Rundweg: dieselbe gekürzte Sicht mit erlaubter Änderung zurück --- */
const vorherM = (await lies(tL)).bestand.mandanten[0];
const vorher = vorherM.personen;
const b = kopie(rS.bestand);
b.mandanten[0].abweichungen["a1|2026-12-01"] = "F";
const w = await schreib(tS, b, rS.etag);
pruef("Gekürzte Sicht mit Planänderung zurückgeschrieben: 200", w.status === 200, `Status ${w.status} ${w.text || ""}`);
const rL = await lies(tL);
pruef("Leitung: Planänderung angekommen", rL.bestand.mandanten[0].abweichungen["a1|2026-12-01"] === "F");
pruef("Leitung: alle Personen wertgleich, nichts Verborgenes verloren",
  JSON.stringify(rL.bestand.mandanten[0].personen) === JSON.stringify(vorher));
pruef("Leitung: kein sichtbereich im Bestand", !JSON.stringify(rL).includes("sichtbereich"));
{
  const restVorher = ohnePlan(vorherM);
  const restNachher = ohnePlan(rL.bestand.mandanten[0]);
  pruef("Leitung: alle Sammlungen und Felder außer dem Plan wertgleich", JSON.stringify(restNachher) === JSON.stringify(restVorher),
    Object.keys(restVorher).filter((k) => JSON.stringify(restVorher[k]) !== JSON.stringify(restNachher[k])).join(", "));
}
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
for (const [name, f] of [
  ["Anmerkung einer Abwesenheit im Bereich setzen", (m) => { m.abwesenheiten.find((a) => a.id === "ab-a").notiz = "anders"; }],
  ["fremden Antrag genehmigt einschleusen", (m) => { m.anfragen.push({ id: "an-b", personId: "b1", typ: "abwesenheit", art: "urlaub", status: "genehmigt", von: "2026-12-20", bis: "2026-12-21" }); }],
  ["Korrekturgrund setzen", (m) => { m.erfassung["a1|2026-10-01"].grund = "anders"; }],
  ["fremde Nachricht ändern", (m) => { m.nachrichten.push({ id: "n-a", personId: "a1", art: "info", titel: "geändert" }); }],
  ["Protokoll fälschen", (m) => { m.protokoll = [{ id: "l1", zeit: "1", text: "gefälscht" }]; }],
]) {
  const r = await lies(tS);
  const x = kopie(r.bestand);
  f(x.mandanten[0]);
  const a = await schreib(tS, x, r.etag);
  pruef(`Angriff „${name}": 403`, a.status === 403, `Status ${a.status}`);
}
{
  const restVorher = ohnePlan(vorherM);
  const restNachher = ohnePlan((await lies(tL)).bestand.mandanten[0]);
  pruef("Nach allen Angriffen: Sammlungen unverändert", JSON.stringify(restNachher) === JSON.stringify(restVorher));
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
