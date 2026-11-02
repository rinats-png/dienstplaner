/* ==========================================================================
   SESSION IST KEIN BESTANDSFELD — gegen einen laufenden Server (D1b)

   Bis D1b speicherte PUT /api/bestand ein beliebiges Objekt `session` ganz
   oben und gab es allen Rollen außer dem Betreiber zurück — auch Betrieb B,
   wenn Betrieb A es geschrieben hatte. Jetzt: verworfen beim Schreiben,
   null beim Lesen, auch in der 409-Antwort. Den Altbestand (direkt in der
   Ablage) prüft pruefungen/session-kanal.test.js.

   Aufruf: node pruefungen/serverlauf.mjs session-kanal
   Schreibt in den Raum "session-probe".
   ========================================================================== */

const BASIS = process.env.CENTRIC_BASIS || "http://localhost:5173";
const GEHEIM = process.env.CENTRIC_ADMIN || "testgeheim";
const HERKUNFT = process.env.CENTRIC_HERKUNFT || "10.0.14.";
const RAUM = "session-probe";

let nr = 0;
async function zugang(rolle, person, betrieb) {
  nr += 1;
  const a = await fetch(`${BASIS}/einrichten`, { method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": `${HERKUNFT}${nr}` },
    body: JSON.stringify({ verwaltung: GEHEIM, name: `Sessionprobe ${rolle} ${person}`, bestand: RAUM, rolle, person, betrieb }) });
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

const SESSION = () => ({ marker: "DARF-NICHT-ZU-B", personId: "p-secret", email: "secret@example.test", token: "secret-token" });
const MARKER = ["DARF-NICHT-ZU-B", "p-secret", "secret@example.test", "secret-token"];
const funde = (text) => MARKER.filter((m) => String(text).includes(m));

const person = (id, rolle, extra = {}) => ({ id, vorname: `V${id}`, nachname: `N${id}`, rolle, bereich: "e1",
  status: "aktiv", zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }], ...extra });
const betrieb = (id, p) => ({
  id, name: `Betrieb ${id}`, status: "aktiv", tarif: "pro", einheiten: [{ id: "e1", name: "WB" }], standorte: [],
  dienstarten: [{ id: "F", name: "Früh" }],
  personen: [person(`${p}l`, "leitung", { bereich: "ALLE" }), person(`${p}p`, "planer", { bereich: "ALLE" }), person(`${p}m`, "mitarbeiter")],
  abweichungen: {}, anfragen: [], notrufe: [], nachrichten: [], abwesenheiten: [],
});

const tBetr = await anmelden(await zugang("betreiber", null, 0));
const anl = await rufe(tBetr, "/api/bestand-anlegen", "POST", { inhalt: {
  version: 9, stand: 1, session: SESSION(), mandanten: [betrieb("m-a", "a"), betrieb("m-b", "b")] } });
pruef("Raum mit zwei Betrieben angelegt (Anlegen mit session im Inhalt)", anl.status === 200, `Status ${anl.status} ${anl.text}`);
const tAL = await anmelden(await zugang("leitung", "al", 0));
const tAP = await anmelden(await zugang("planer", "ap", 0));
const tAM = await anmelden(await zugang("mitarbeiter", "am", 0));
const tBL = await anmelden(await zugang("leitung", "bl", 1));
const tBM = await anmelden(await zugang("mitarbeiter", "bm", 1));

{
  const r = await rufe(tAL, "/api/bestand", "GET");
  pruef("Anlegen: session nicht gespeichert", r.status === 200 && r.bestand.session === null && funde(r.roh).length === 0);
}

/* Betrieb A legt Daten in session ab und ändert zulässig etwas */
const rA = await rufe(tAL, "/api/bestand", "GET");
const bA = JSON.parse(JSON.stringify(rA.bestand));
bA.session = SESSION();
bA.mandanten[0].abweichungen = { ...bA.mandanten[0].abweichungen, "am|2026-11-03": "F" };
const wA = await rufe(tAL, "/api/bestand", "PUT", { bestand: bA, etag: rA.etag, durch: "Test" });
pruef("Leitung A: PUT mit session-Marker und zulässiger Änderung wird nicht abgelehnt", wA.status === 200, `Status ${wA.status} ${wA.text}`);

const nachA = await rufe(tAL, "/api/bestand", "GET");
pruef("… die zulässige Änderung ist gespeichert", nachA.bestand.mandanten[0].abweichungen["am|2026-11-03"] === "F");
pruef("… Leitung A liest session: null, kein Marker", nachA.bestand.session === null && funde(nachA.roh).length === 0, funde(nachA.roh).join(", "));
for (const [name, t] of [["Planung A", tAP], ["Beschäftigte A", tAM], ["Leitung B", tBL], ["Beschäftigte B", tBM], ["Betreiber", tBetr]]) {
  const x = await rufe(t, "/api/bestand", "GET");
  pruef(`… ${name} liest session: null, kein Marker`, x.status === 200 && x.bestand.session === null && funde(x.roh).length === 0,
    `Status ${x.status} ${funde(x.roh).join(", ")}`);
}

/* 409: veralteter Stand, beide Seiten im Kern */
{
  const r1 = await rufe(tAL, "/api/bestand", "GET");
  const b2 = JSON.parse(JSON.stringify(r1.bestand));
  b2.mandanten[0].dienstarten = [...b2.mandanten[0].dienstarten, { id: "S", name: "Spät" }];
  const w2 = await rufe(tAP, "/api/bestand", "PUT", { bestand: b2, etag: r1.etag, durch: "Test" });
  const b1 = JSON.parse(JSON.stringify(r1.bestand));
  b1.session = SESSION();
  b1.mandanten[0].dienstarten = [...b1.mandanten[0].dienstarten, { id: "N", name: "Nacht" }];
  const w1 = await rufe(tAL, "/api/bestand", "PUT", { bestand: b1, etag: r1.etag, durch: "Test" });
  pruef("409: Antwort trägt den Bestand mit session: null und ohne Marker",
    w2.status === 200 && w1.status === 409 && !!w1.bestand && w1.bestand.session === null && funde(w1.roh).length === 0,
    `Status ${w2.status}/${w1.status} ${funde(w1.roh).join(", ")}`);
}

const bestanden = ergebnisse.filter((x) => x.ok).length;
console.log(`\n${bestanden} von ${ergebnisse.length} Prüfungen bestanden.`);
if (bestanden !== ergebnisse.length) {
  console.log("Fehlgeschlagen:");
  for (const x of ergebnisse.filter((y) => !y.ok)) console.log(`  - ${x.name} (${x.detail})`);
  process.exit(1);
}
