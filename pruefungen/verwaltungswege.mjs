/* ==========================================================================
   VERWALTUNGSWEGE — gegen einen laufenden Server (Commit 1e.4b)

   Ein Raum, zwei Betriebe. Die Leitungen von A und B legen je einen
   Sicherungsschlüssel an. Die Leitung von A listet, versucht den Schlüssel
   von B zu widerrufen (auch über ein Präfix), sperrt „alle des Betriebs"
   und einzeln einen Code von B. B bleibt unberührt; der Betreiber sperrt
   weiterhin raumweit.

   Aufruf: node pruefungen/serverlauf.mjs verwaltungswege
   Schreibt in den Raum "verwaltung-probe".
   ========================================================================== */

const BASIS = process.env.CENTRIC_BASIS || "http://localhost:5173";
const GEHEIM = process.env.CENTRIC_ADMIN || "testgeheim";
const HERKUNFT = process.env.CENTRIC_HERKUNFT || "10.0.8.";
const RAUM = "verwaltung-probe";

let nr = 0;
const codes = {};
async function zugang(name, rolle, person, betrieb) {
  nr += 1;
  const a = await fetch(`${BASIS}/einrichten`, { method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": `${HERKUNFT}${nr}` },
    body: JSON.stringify({ verwaltung: GEHEIM, name, bestand: RAUM, rolle, person, betrieb }) });
  const d = await a.json();
  if (!d.zugangscode) throw new Error(`Zugang ${name} nicht angelegt: ${JSON.stringify(d)}`);
  codes[name] = d.zugangscode;
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

const ergebnisse = [];
const pruef = (name, bedingung, detail) => {
  ergebnisse.push({ name, ok: !!bedingung, detail });
  console.log(`${bedingung ? "  BESTANDEN" : "  FEHLGESCHLAGEN"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

const betrieb = (id) => ({ id, name: id, einheiten: [{ id: "e1" }],
  personen: [{ id: "l", rolle: "leitung", bereich: "ALLE" }, { id: "x", rolle: "mitarbeiter", bereich: "e1",
    zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }] }], abweichungen: {}, anfragen: [], nachrichten: [] });
const tBetr = await anmelden(await zugang("Betreiber", "betreiber", null, 0));
pruef("Raum mit zwei Betrieben eingerichtet", (await rufe(tBetr, "bestand-anlegen", "POST",
  { inhalt: { version: 9, stand: 1, session: null, mandanten: [betrieb("m-a"), betrieb("m-b")] } })).status === 200);
const tA = await anmelden(await zugang("Leitung A", "leitung", "l", 0));
const tB = await anmelden(await zugang("Leitung B", "leitung", "l", 1));
const tMA = await anmelden(await zugang("Beschäftigte A", "mitarbeiter", "x", 0));
const tMB = await anmelden(await zugang("Beschäftigte B", "mitarbeiter", "x", 1));
const lesbar = async (t) => (await rufe(t, "bestand")).status === 200;

/* --- D1 --- */
const skA = await rufe(tA, "sicherungsschluessel", "POST", { tage: 30 });
const skB = await rufe(tB, "sicherungsschluessel", "POST", { tage: 30 });
pruef("A und B legen je einen Sicherungsschlüssel an", !!skA.schluessel && !!skB.schluessel);
const listeA = await rufe(tA, "sicherungsschluessel");
const listeB = await rufe(tB, "sicherungsschluessel");
const kA = listeA.schluessel && listeA.schluessel[0] && listeA.schluessel[0].kennung;
const kB = listeB.schluessel && listeB.schluessel[0] && listeB.schluessel[0].kennung;
pruef("A listet genau den eigenen Schlüssel", listeA.schluessel.length === 1 && !JSON.stringify(listeA).includes(kB),
  JSON.stringify(listeA.schluessel.map((x) => x.kennung)));
const fremd = await rufe(tA, "sicherungsschluessel", "DELETE", { kennung: kB });
const unbekannt = await rufe(tA, "sicherungsschluessel", "DELETE", { kennung: "0000ffff" });
pruef("A widerruft den Schlüssel von B: kein Treffer, wie bei unbekannter Kennung",
  fremd.status === 200 && fremd.widerrufen === 0 && JSON.stringify(fremd) === JSON.stringify(unbekannt), JSON.stringify(fremd));
const praefix = await rufe(tA, "sicherungsschluessel", "DELETE", { kennung: kB.slice(0, 2) });
pruef("Präfix-Widerruf: abgewiesen", praefix.status === 400, `Status ${praefix.status}`);
pruef("B kann mit seinem Schlüssel weiter ausgeben", (await rufe(skB.schluessel, "vollausgabe")).status === 200);
pruef("B sieht seinen Schlüssel weiterhin", (await rufe(tB, "sicherungsschluessel")).schluessel.length === 1);
const eigen = await rufe(tA, "sicherungsschluessel", "DELETE", { kennung: kA });
pruef("A widerruft den eigenen: erfolgreich", eigen.widerrufen === 1);
pruef("… dessen Ausgabe ist danach gesperrt", (await rufe(skA.schluessel, "vollausgabe")).status === 401);

/* --- D2 --- */
const einzelnB = await rufe(tA, "zugang-sperren", "POST", { code: codes["Beschäftigte B"] });
const einzelnUnbekannt = await rufe(tA, "zugang-sperren", "POST", { code: "GIBT-ESNI-CHT0" });
pruef("A sperrt einen Code von B: nichts gesperrt, Antwort wie unbekannt", einzelnB.gesperrt === 0
  && JSON.stringify(einzelnB) === JSON.stringify(einzelnUnbekannt), JSON.stringify(einzelnB));
pruef("… die Sitzung der Beschäftigten B läuft", await lesbar(tMB));
const alle = await rufe(tA, "zugang-sperren", "POST", { alleDesBetriebs: true });
pruef("A sperrt alle des Betriebs: nur der eigene Betrieb", alle.status === 200 && alle.gesperrt === 1, JSON.stringify(alle));
pruef("… Beschäftigte A gesperrt, Sitzung beendet", !(await lesbar(tMA)));
pruef("… Leitung B, Beschäftigte B und Leitung A arbeiten weiter", (await lesbar(tB)) && (await lesbar(tMB)) && (await lesbar(tA)));
pruef("… der Betreibercode ist unberührt", await lesbar(tBetr));
const betr = await rufe(tBetr, "zugang-sperren", "POST", { code: codes["Beschäftigte B"] });
pruef("Betreiber sperrt weiterhin raumweit", betr.gesperrt === 1 && !(await lesbar(tMB)), JSON.stringify(betr));

const bestanden = ergebnisse.filter((r) => r.ok).length;
console.log(`\n${bestanden} von ${ergebnisse.length} Prüfungen bestanden.`);
if (bestanden !== ergebnisse.length) {
  console.log("Fehlgeschlagen:");
  for (const r of ergebnisse.filter((x) => !x.ok)) console.log(`  - ${r.name} (${r.detail})`);
  process.exit(1);
}
