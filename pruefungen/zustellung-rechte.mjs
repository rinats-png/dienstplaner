/* ==========================================================================
   VERSAND UND ZUSTELLUNG — gegen einen laufenden Server (Commit 4)

   Ein Raum, zwei Betriebe. Prüft über HTTP, was von außen sichtbar ist:
   kein freier Versand (altes Auftragsformat, Betriebsrat, Betreiber),
   gleiche Antworten für unbekannte, fremde und zugestellte Mitteilungen,
   Notruf und Tauschmeldung erzeugen Servermitteilungen, Client-Notruf- und
   Tauschmitteilungen werden verworfen, Zustellwege und -status vom Client
   wirkungslos, keine Push-Daten fremder Personen in der Sicht der Leitung,
   Beschäftigte ändern an eigenen Mitteilungen nur „gelesen“.
   Wie oft tatsächlich versandt wurde, prüft zustellung-rechte.test.js.

   Aufruf: node pruefungen/serverlauf.mjs zustellung-rechte
   Schreibt in den Raum "zustellung-probe".
   ========================================================================== */

const BASIS = process.env.CENTRIC_BASIS || "http://localhost:5173";
const GEHEIM = process.env.CENTRIC_ADMIN || "testgeheim";
const HERKUNFT = process.env.CENTRIC_HERKUNFT || "10.0.8.";
const RAUM = "zustellung-probe";

let nr = 0;
async function zugang(rolle, person, betrieb) {
  nr += 1;
  const a = await fetch(`${BASIS}/einrichten`, { method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": `${HERKUNFT}${nr}` },
    body: JSON.stringify({ verwaltung: GEHEIM, name: `Zustellprobe ${rolle} ${person}`, bestand: RAUM, rolle, person, betrieb }) });
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
const senden = (t, rumpf) => rufe(t, "/zustellung/senden", "POST", rumpf);
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

const person = (id, rolle, extra = {}) => ({ id, vorname: `V${id}`, nachname: `N${id}`, rolle, bereich: rolle === "leitung" || rolle === "planer" ? "ALLE" : "e1",
  zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }], email: `${id}@x.de`, ...extra });
const mitteilung = (id, an, extra = {}) => ({ id, personId: an, art: "planGeaendert", titel: `T ${id}`, text: "x", ziel: "meine",
  zeit: "x", erstellt: new Date().toISOString(), gelesen: false, dringend: true, ...extra });

const tBetr = await anmelden(await zugang("betreiber", null, 0));
pruef("Raum mit zwei Betrieben eingerichtet", (await rufe(tBetr, "/api/bestand-anlegen", "POST", { inhalt: {
  version: 9, stand: 1, session: null, mandanten: [
    { id: "m-a", name: "A", einheiten: [{ id: "e1" }], personen: [person("a1", "mitarbeiter"), person("a2", "mitarbeiter", { zustellung: { planGeaendert: { mail: false } } }),
      person("p1", "planer"), person("l1", "leitung", { pushSchluessel: { endpoint: "https://push.example/l1-geheim" } }), person("r1", "betriebsrat")],
    abweichungen: {}, notrufe: [], nachrichten: [mitteilung("n-a1", "a1")],
    anfragen: [{ id: "t-a2", personId: "a2", typ: "tausch", art: "tausch", status: "offen", von: "2026-12-01", bis: "2026-12-01", interessenten: [] }] },
    { id: "m-b", name: "B", einheiten: [{ id: "e1" }], personen: [person("b1", "mitarbeiter")], abweichungen: {}, anfragen: [], notrufe: [],
      nachrichten: [mitteilung("n-b1", "b1")] }] } })).status === 200);
const tA1 = await anmelden(await zugang("mitarbeiter", "a1", 0));
const tP1 = await anmelden(await zugang("planer", "p1", 0));
const tL1 = await anmelden(await zugang("leitung", "l1", 0));
const tR1 = await anmelden(await zugang("betriebsrat", "r1", 0));

/* Z1 */
const alt = await senden(tP1, { auftraege: [{ id: "x", personId: "a2", betreff: "frei", text: "frei", titel: "frei" }] });
pruef("Z1 altes Auftragsformat mit freiem Text: 400", alt.status === 400, `Status ${alt.status}`);
pruef("Z1 Betriebsrat: 403", (await senden(tR1, { nachrichten: ["n-a1"] })).status === 403);
pruef("Z1 Betreiber: 403", (await senden(tBetr, { nachrichten: ["n-a1"] })).status === 403);
const ma = await senden(tA1, { nachrichten: ["n-a1"] });
pruef("Z1 Beschäftigte stoßen keine Mitteilung der Planung an (Antwort wie unbekannt)", ma.status === 200
  && JSON.stringify(ma.ergebnis) === JSON.stringify([{ id: "n-a1", stand: "erledigt" }]), ma.text);

/* Z3 */
await schreibe(tP1, (m) => { m.nachrichten.unshift(mitteilung("n-zu", "l1")); });
await senden(tP1, { nachrichten: ["n-zu"] });
const o = await senden(tP1, { nachrichten: ["gibt-es-nicht", "n-b1", "n-zu"] });
pruef("Z3 unbekannt, fremder Betrieb, schon zugestellt: gleiche Antwort", o.status === 200
  && o.ergebnis.every((x) => x.stand === "erledigt") && o.ergebnis.length === 3, o.text);

/* Z5 (von außen): gleichzeitige Anstöße — alle beantwortet, keiner scheitert */
await schreibe(tP1, (m) => { m.nachrichten.unshift(mitteilung("n-par", "l1")); });
const par = await Promise.all(Array.from({ length: 8 }, () => senden(tP1, { nachrichten: ["n-par"] })));
pruef("Z5 acht gleichzeitige Anstöße: alle 200", par.every((x) => x.status === 200), par.map((x) => x.status).join(","));

/* Z4 */
const nr1 = await schreibe(tA1, (m) => {
  m.notrufe = [{ id: "nr-a1", personId: "a1", art: "hilfe", notiz: "", empfaenger: ["l1"], bestaetigt: null }, ...(m.notrufe || [])];
  m.nachrichten.unshift(mitteilung("n-fake", "p1", { ziel: "notruf", titel: "NOTRUF: frei" }));
});
pruef("Z4 Notruf der Beschäftigten gespeichert", nr1.status === 200, nr1.text);
const mL = await betriebVon(tL1);
pruef("Z4 der Server hat die Notrufmitteilung erzeugt", mL.nachrichten.some((n) => n.id === "n-notruf-nr-a1-l1" && n.titel === "NOTRUF: Hilfe angefordert"));
pruef("Z4 die Client-Notrufmitteilung ist verworfen", !mL.nachrichten.some((n) => n.id === "n-fake"));

/* Z6 */
await schreibe(tP1, (m) => { m.nachrichten.unshift(mitteilung("n-z6", "l1", { wege: { mail: "angreifer@x.de" }, zugestellt: { mail: "gesendet" } })); });
const z6 = (await betriebVon(tL1)).nachrichten.find((n) => n.id === "n-z6");
pruef("Z6 Zustellwege und -status vom Client nicht gespeichert", z6 && z6.wege === undefined && z6.zugestellt === undefined);
const lang = await schreibe(tP1, (m) => { m.nachrichten.unshift(mitteilung("n-lang", "l1", { titel: "x".repeat(121) })); });
pruef("E3 Titel über 120 Zeichen: abgewiesen", lang.status === 403, `Status ${lang.status}`);

/* Z7 */
const mP = await betriebVon(tP1);
const a2 = mP.personen.find((p) => p.id === "a2"), l1 = mP.personen.find((p) => p.id === "l1");
pruef("Z7 Planung: keine Zustelleinstellungen und Push-Anmeldung fremder Personen", a2.zustellung === undefined && l1.pushSchluessel === undefined
  && !JSON.stringify(mP).includes("l1-geheim"));
pruef("Z7 Planung: E-Mail als Kontaktangabe bleibt", a2.email === "a2@x.de");

/* Z8 */
await schreibe(tA1, (m) => {
  const n = m.nachrichten.find((x) => x.id === "n-a1"); n.titel = "umgeschrieben"; n.gelesen = true;
  m.nachrichten.unshift(mitteilung("n-selbst", "a1"));
});
const z8 = (await betriebVon(tL1)).nachrichten;
pruef("Z8 Beschäftigte: Titel bleibt, gelesen kommt an, neue eigene verworfen",
  z8.find((n) => n.id === "n-a1").titel === "T n-a1" && z8.find((n) => n.id === "n-a1").gelesen === true && !z8.some((n) => n.id === "n-selbst"));

/* Tausch */
await schreibe(tA1, (m) => { m.nachrichten.unshift(mitteilung("n-spam", "l1", { art: "tauschAngebot", titel: "frei" })); });
pruef("Tausch: selbst gebautes Tauschangebot an beliebige Person verworfen", !(await betriebVon(tL1)).nachrichten.some((n) => n.id === "n-spam"));
await schreibe(tA1, (m) => { m.anfragen.find((a) => a.id === "t-a2").interessenten.push("a1"); });
const t = (await betriebVon(tL1)).nachrichten.filter((n) => n.art === "tauschAngebot");
pruef("Tausch: Meldung auf offenes Gesuch erzeugt genau eine Servermitteilung an die Person des Gesuchs",
  t.length === 1 && t[0].id === "n-tausch-t-a2-a1" && t[0].personId === "a2", JSON.stringify(t.map((n) => n.id)));

/* Push-Anmeldung */
pruef("Push-Anmeldung: nur https-Endpunkt", (await rufe(tA1, "/zustellung/anmelden", "POST", { anmeldung: { endpoint: "http://intern/" } })).status === 400);
pruef("Push-Anmeldung: eigene Person 200", (await rufe(tA1, "/zustellung/anmelden", "POST", { anmeldung: { endpoint: "https://push.example/a1", keys: {} } })).status === 200);

const bestanden = ergebnisse.filter((r) => r.ok).length;
console.log(`\n${bestanden} von ${ergebnisse.length} Prüfungen bestanden.`);
if (bestanden !== ergebnisse.length) {
  console.log("Fehlgeschlagen:");
  for (const r of ergebnisse.filter((x) => !x.ok)) console.log(`  - ${r.name} (${r.detail})`);
  process.exit(1);
}
