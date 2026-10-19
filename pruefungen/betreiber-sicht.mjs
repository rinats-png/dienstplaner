/* ==========================================================================
   BETREIBERSICHT ALS POSITIVKATALOG — gegen einen laufenden Server (D1)

   GET /api/bestand und die 409-Antwort von PUT geben dem Betreiber keine
   Personaldaten mehr, nur das Gerüst für Abrechnung und Konsole. Rundweg:
   kaufmännische Änderung, alles andere bleibt gespeichert; neuer Betrieb
   anlegbar, Betrieb löschbar.

   Aufruf: node pruefungen/serverlauf.mjs betreiber-sicht
   Schreibt in den Raum "betreiber-probe".
   ========================================================================== */

const BASIS = process.env.CENTRIC_BASIS || "http://localhost:5173";
const GEHEIM = process.env.CENTRIC_ADMIN || "testgeheim";
const HERKUNFT = process.env.CENTRIC_HERKUNFT || "10.0.13.";
const RAUM = "betreiber-probe";

let nr = 0;
async function zugang(rolle, person, betrieb) {
  nr += 1;
  const a = await fetch(`${BASIS}/einrichten`, { method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": `${HERKUNFT}${nr}` },
    body: JSON.stringify({ verwaltung: GEHEIM, name: `Betreiberprobe ${rolle} ${person}`, bestand: RAUM, rolle, person, betrieb }) });
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
  /* roh: der ganze Antwortkörper — ein Feld "text" in der Antwort überschriebe sonst den Text. */
  return { status: a.status, text, ...d, roh: text };
};

const ergebnisse = [];
const pruef = (name, bedingung, detail) => {
  ergebnisse.push({ name, ok: !!bedingung, detail });
  console.log(`${bedingung ? "  BESTANDEN" : "  FEHLGESCHLAGEN"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

const person = (id, rolle, extra = {}) => ({ id, vorname: `MK-VORNAME-${id}`, nachname: `MK-NACHNAME-${id}`, rolle, bereich: "e1",
  status: "aktiv", zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }], ...extra });
const MARKER = ["MK-VORNAME", "MK-NACHNAME", "mutterschutz", "MK-IBAN", "MK-STEUER", "MK-LOHN", "MK-KRANKNOTIZ", "MK-KALGEHEIM",
  "MK-NACHRICHT", "MK-DIENSTBUCH", "MK-PLAN", "MK-UNBEKANNT", "MK-TEL", "MK-NOTFALL", "MK-WIEDER"];
const betrieb = (id, name) => ({
  id, name, status: "aktiv", tarif: "pro", einheiten: [{ id: "e1", name: "WB", standortId: "st1", geheim: "MK-UNBEKANNT-E" }],
  standorte: [{ id: "st1", name: "Haus" }], dienstarten: [{ id: "F", name: "Früh" }],
  personen: [person("l1", "leitung", { bereich: "ALLE" }), person("a1", "mitarbeiter", { mutterschutz: true, iban: "MK-IBAN", steuerId: "MK-STEUER",
    lohn: "MK-LOHN", telefon: "MK-TEL", notfallkontakt: "MK-NOTFALL", kalenderGeheim: "MK-KALGEHEIM",
    einschraenkungen: { wiedereingliederung: { von: "2026-01-01", bis: "2026-12-31", maxStundenWoche: 20, x: "MK-WIEDER" } },
    unbekannt: "MK-UNBEKANNT-P" })],
  abweichungen: { "a1|2026-12-01": "MK-PLAN" }, anfragen: [], notrufe: [],
  abwesenheiten: [{ id: "ab", personId: "a1", art: "krank", von: "2026-12-01", bis: "2026-12-01", notiz: "MK-KRANKNOTIZ" }],
  nachrichten: [{ id: "n", personId: "a1", titel: "MK-NACHRICHT" }], dienstbuch: [{ id: "db", text: "MK-DIENSTBUCH" }],
  protokoll: [{ id: "p", zeit: "2026-10-18", text: "MK-NACHNAME-l1 hat geplant" }], unbekanntImBetrieb: "MK-UNBEKANNT-B",
});

const tBetr = await anmelden(await zugang("betreiber", null, 0));
pruef("Raum mit zwei Betrieben eingerichtet", (await rufe(tBetr, "/api/bestand-anlegen", "POST", { inhalt: {
  version: 9, stand: 1, session: null, mandanten: [betrieb("m-a", "A"), betrieb("m-b", "B")] } })).status === 200);
const tL = await anmelden(await zugang("leitung", "l1", 0));

const r = await rufe(tBetr, "/api/bestand", "GET");
const funde = MARKER.filter((s) => r.roh.includes(s));
pruef("Betreiber GET: kein sensibler Marker, kein unbekanntes Feld", r.status === 200 && funde.length === 0, funde.join(", "));
pruef("Betreiber GET: beide Betriebe, Personen nur als Gerüst", r.bestand.mandanten.length === 2
  && r.bestand.mandanten.every((m) => m.personen.every((p) => Object.keys(p).every((k) =>
    ["id", "rolle", "rolleSeit", "rolleVerlauf", "status", "eintritt", "austritt", "zugehoerigkeit"].includes(k)))));
pruef("Betreiber GET: letzte Änderung als Zeitpunkt", JSON.stringify(r.bestand.mandanten[0].protokoll) === JSON.stringify([{ zeit: "2026-10-18" }]));

/* 409: veralteter Stand */
const b0 = JSON.parse(JSON.stringify(r.bestand));
b0.mandanten[0].tarif = "enterprise";
const w1 = await rufe(tBetr, "/api/bestand", "PUT", { bestand: b0, etag: r.etag, durch: "Betreiber" });
pruef("Betreiber PUT kaufmännisch: 200", w1.status === 200, `Status ${w1.status} ${w1.text}`);
const w2 = await rufe(tBetr, "/api/bestand", "PUT", { bestand: { ...b0, mandanten: b0.mandanten.map((m, i) => (i === 0 ? { ...m, notiz: "x" } : m)) }, etag: r.etag, durch: "Betreiber" });
const funde409 = MARKER.filter((s) => w2.roh.includes(s));
pruef("Betreiber 409: ebenfalls kein Marker (Antwort trägt den Bestand)", w2.status === 409 && !!w2.bestand && funde409.length === 0, `Status ${w2.status} ${funde409.join(", ")}`);

/* Rundweg: was die Leitung sieht, ist unverändert */
const mL = (await rufe(tL, "/api/bestand", "GET")).bestand.mandanten[0];
pruef("… Mutterschutz, Krankmeldungsnotiz, Plan, Nachricht, Dienstbuch noch da", mL.personen.find((p) => p.id === "a1").mutterschutz === true
  && mL.abwesenheiten[0].notiz === "MK-KRANKNOTIZ" && mL.abweichungen["a1|2026-12-01"] === "MK-PLAN"
  && mL.nachrichten.some((n) => n.titel === "MK-NACHRICHT") && mL.dienstbuch.some((d) => d.text === "MK-DIENSTBUCH")
  && mL.personen.find((p) => p.id === "a1").telefon === "MK-TEL" && mL.personen.length === 2);
const rB = await rufe(tBetr, "/api/bestand", "GET");
pruef("… der Betreiber sieht den neuen Tarif", rB.bestand.mandanten[0].tarif === "enterprise");

/* neuer Betrieb, Betrieb löschen */
const neu = JSON.parse(JSON.stringify(rB.bestand));
neu.mandanten.push({ id: "m-c", name: "C", status: "test", tarif: "pro", einheiten: [{ id: "e1" }], personen: [person("c1", "leitung")], dienstarten: [] });
const w3 = await rufe(tBetr, "/api/bestand", "PUT", { bestand: neu, etag: rB.etag, durch: "Betreiber" });
const rC = await rufe(tBetr, "/api/bestand", "GET");
pruef("neuer Betrieb anlegbar", w3.status === 200 && rC.bestand.mandanten.some((m) => m.id === "m-c"), `Status ${w3.status} ${w3.text}`);
const weg = { ...rC.bestand, mandanten: rC.bestand.mandanten.filter((m) => m.id !== "m-c") };
const w4 = await rufe(tBetr, "/api/bestand", "PUT", { bestand: weg, etag: rC.etag, durch: "Betreiber" });
const rD = await rufe(tBetr, "/api/bestand", "GET");
pruef("Betrieb löschbar, die anderen unverändert", w4.status === 200 && !rD.bestand.mandanten.some((m) => m.id === "m-c")
  && rD.bestand.mandanten.length === 2, `Status ${w4.status}`);
const mL2 = (await rufe(tL, "/api/bestand", "GET")).bestand.mandanten[0];
pruef("… Betrieb A danach weiter vollständig (Sicht der Leitung)", mL2.personen.find((p) => p.id === "a1").mutterschutz === true
  && mL2.abwesenheiten[0].notiz === "MK-KRANKNOTIZ");

const bestanden = ergebnisse.filter((x) => x.ok).length;
console.log(`\n${bestanden} von ${ergebnisse.length} Prüfungen bestanden.`);
if (bestanden !== ergebnisse.length) {
  console.log("Fehlgeschlagen:");
  for (const x of ergebnisse.filter((y) => !y.ok)) console.log(`  - ${x.name} (${x.detail})`);
  process.exit(1);
}
