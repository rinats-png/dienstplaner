/* ==========================================================================
   MANDANTEN-INTEGRITÄT — gegen einen laufenden Server

   Zwei Fehler mit derselben Ursache: Beim Schreiben kam die Liste der
   Betriebe aus der Übermittlung statt aus dem gespeicherten Stand.

   1. Doppelter Betrieb. Die Schichtverantwortung schickte neben dem eigenen
      Betrieb ein zweites Exemplar mit derselben Kennung und Änderungen in
      einer fremden Einheit. Die Einheitsprüfung sah nur das erste; beim
      Zerlegen in Monatsscherben verschmolzen beide.
   2. Reihenfolge. Nicht mitgeschickte Betriebe wurden hinten angehängt. In
      einem Raum mit mehreren Betrieben — der Demoraum hat drei — sah danach
      die Leitung von Betrieb 0 den Betrieb, der zuletzt gespeichert hatte.

   Aufruf: node pruefungen/serverlauf.mjs mandanten
   Schreibt in den Raum "mandanten-probe" — nicht gegen echte Daten laufen
   lassen.
   ========================================================================== */

const BASIS = process.env.CENTRIC_BASIS || "http://localhost:5173";
const GEHEIM = process.env.CENTRIC_ADMIN || "testgeheim";
const HERKUNFT = process.env.CENTRIC_HERKUNFT || null;
const herkunft = () => (HERKUNFT ? { "x-forwarded-for": HERKUNFT } : {});
const RAUM = "mandanten-probe";

async function zugang(rolle, person, betrieb) {
  const a = await fetch(`${BASIS}/einrichten`, { method: "POST",
    headers: { "content-type": "application/json", ...herkunft() },
    body: JSON.stringify({ verwaltung: GEHEIM, name: "Mandantenprobe", bestand: RAUM,
      rolle, person, betrieb }) });
  const d = await a.json();
  if (!d.zugangscode) throw new Error(`Zugang ${rolle}/${betrieb} nicht angelegt: ${JSON.stringify(d)}`);
  return d.zugangscode;
}
const anmelden = async (code) => {
  const a = await fetch(`${BASIS}/api/anmelden`, { method: "POST",
    headers: { "content-type": "application/json", ...herkunft() }, body: JSON.stringify({ zugangscode: code }) });
  const d = await a.json();
  if (!d.token) throw new Error(`Anmeldung fehlgeschlagen: ${JSON.stringify(d)}`);
  return d.token;
};
const lies = async (t) => {
  const a = await fetch(`${BASIS}/api/bestand`, { headers: { authorization: `Bearer ${t}` } });
  return { status: a.status, ...(await a.json()) };
};
const schreib = async (t, bestand, etag) => {
  const a = await fetch(`${BASIS}/api/bestand`, { method: "PUT",
    headers: { authorization: `Bearer ${t}`, "content-type": "application/json" },
    body: JSON.stringify({ bestand, etag, durch: "Test" }) });
  return { status: a.status, ...(await a.json()) };
};

const ergebnisse = [];
const pruef = (name, bedingung, detail) => {
  ergebnisse.push({ name, ok: !!bedingung, detail });
  console.log(`${bedingung ? "  BESTANDEN" : "  FEHLGESCHLAGEN"}  ${name}${detail ? ` — ${detail}` : ""}`);
};
const kopie = (x) => JSON.parse(JSON.stringify(x));

/* --- Drei Betriebe wie im Demoraum. Betrieb 1 hat zwei Einheiten, eine
       Schichtverantwortung in e1 und eine Beschäftigte in e2. --- */
const betrieb = (id, name, personen) => ({ id, name, einheitLabel: "Wohnbereich",
  einheiten: [{ id: "e1", name: "WB 1" }, { id: "e2", name: "WB 2" }],
  dienstarten: [{ id: "F", name: "Früh", kurz: "F" }],
  personen, abweichungen: {}, erfassung: {}, einstempeln: {}, anfragen: [], nachrichten: [] });
const person = (id, rolle, einheit) => ({ id, vorname: id, nachname: id, rolle, bereich: einheit,
  zugehoerigkeit: [{ ab: "2020-01-01", einheitId: einheit }] });
const start = { version: 9, stand: 1, session: null, mandanten: [
  betrieb("m-nordwacht", "Nordwacht", [person("a-l", "leitung", "ALLE")]),
  betrieb("m-lindenhof", "Lindenhof", [person("b-l", "leitung", "ALLE"),
    person("b-s", "subplaner", "e1"), person("b-x", "mitarbeiter", "e2")]),
  betrieb("m-steinbach", "Steinbach", [person("c-l", "leitung", "ALLE")]),
] };

const tA = await anmelden(await zugang("leitung", "a-l", 0));
/* Erstbefüllung über den vorläufig bestehenden Altpfad (leerer Raum). */
const w0 = await schreib(tA, start, null);
pruef("Raum mit drei Betrieben angelegt (Altpfad Erstbefüllung)", w0.status === 200, `Status ${w0.status}`);
const tB = await anmelden(await zugang("leitung", "b-l", 1));
const tC = await anmelden(await zugang("leitung", "c-l", 2));
const tS = await anmelden(await zugang("subplaner", "b-s", 1));

const name = async (t) => (await lies(t)).bestand.mandanten.map((m) => m.name).join(",");

/* ---------------------------------------------------------------- *
 * A. Doppelter Betrieb (Schichtverantwortung)                      *
 * ---------------------------------------------------------------- */
{
  const r = await lies(tS);
  pruef("Die Schichtverantwortung liest genau ihren Betrieb", r.bestand.mandanten.length === 1
    && r.bestand.mandanten[0].id === "m-lindenhof", r.bestand.mandanten.map((m) => m.id).join(","));

  const eigen = kopie(r.bestand);
  eigen.mandanten[0].abweichungen["b-s|2026-11-02"] = "F";
  const wE = await schreib(tS, eigen, r.etag);
  pruef("Eigene Einheit schreiben geht weiter", wE.status === 200, `Status ${wE.status}`);

  const r2 = await lies(tS);
  const direkt = kopie(r2.bestand);
  direkt.mandanten[0].abweichungen["b-x|2026-11-03"] = "F";
  const wD = await schreib(tS, direkt, r2.etag);
  pruef("Fremde Einheit direkt: abgewiesen", wD.status === 403, `Status ${wD.status}`);

  const angriff = kopie(r2.bestand);
  const zweites = kopie(r2.bestand.mandanten[0]);
  zweites.abweichungen["b-x|2026-11-04"] = "F";
  zweites.erfassung["b-x|2026-10-01"] = { start: "00:00", ende: "23:59", bestaetigt: true };
  angriff.mandanten.push(zweites);
  const wA = await schreib(tS, angriff, r2.etag);
  pruef("Doppelter Betrieb mit fremden Änderungen: abgewiesen (422)", wA.status === 422,
    `Status ${wA.status} · ${wA.text || wA.fehler || ""}`);

  const gleich = kopie(r2.bestand);
  gleich.mandanten.push(kopie(r2.bestand.mandanten[0]));
  const wG = await schreib(tS, gleich, r2.etag);
  pruef("Doppelter Betrieb, identische Kopie: abgewiesen (422)", wG.status === 422, `Status ${wG.status}`);

  const leer = kopie(r2.bestand);
  leer.mandanten.push({ ...kopie(r2.bestand.mandanten[0]), id: " m-lindenhof " });
  const wL = await schreib(tS, leer, r2.etag);
  pruef("Kennung mit Leerzeichen als zweiter Betrieb: abgewiesen (422)", wL.status === 422, `Status ${wL.status}`);

  const fremd = kopie(r2.bestand);
  fremd.mandanten.push({ ...kopie(start.mandanten[2]), name: "GEKAPERT" });
  const wF = await schreib(tS, fremd, r2.etag);
  pruef("Eigener plus fremder Betrieb: abgewiesen (403)", wF.status === 403, `Status ${wF.status}`);

  const leitungB = (await lies(tB)).bestand.mandanten[0];
  pruef("Nach dem Neuladen: fremde Einheit unverändert",
    !leitungB.abweichungen["b-x|2026-11-03"] && !leitungB.abweichungen["b-x|2026-11-04"]
      && !leitungB.erfassung["b-x|2026-10-01"], JSON.stringify(leitungB.abweichungen));
  pruef("… und die eigene Änderung ist da", leitungB.abweichungen["b-s|2026-11-02"] === "F");
  pruef("Steinbach unverändert", (await name(tC)) === "Steinbach");
}

/* ---------------------------------------------------------------- *
 * B. Reihenfolge (drei Betriebe, Betrieb 1 schreibt)               *
 * ---------------------------------------------------------------- */
{
  const r = await lies(tB);
  const b = kopie(r.bestand);
  b.mandanten[0].name = "Lindenhof (geändert)";
  const w = await schreib(tB, b, r.etag);
  pruef("Betrieb 1 schreibt legitim", w.status === 200, `Status ${w.status}`);

  pruef("Sitzung Betrieb 0 sieht weiter Nordwacht", (await name(tA)) === "Nordwacht", await name(tA));
  pruef("Sitzung Betrieb 1 sieht ihren geänderten Betrieb", (await name(tB)) === "Lindenhof (geändert)", await name(tB));
  pruef("Sitzung Betrieb 2 sieht weiter Steinbach", (await name(tC)) === "Steinbach", await name(tC));

  /* Betrieb 0 und 2 schreiben ebenfalls — keiner verschiebt den anderen. */
  for (const [t, neu] of [[tA, "Nordwacht (geändert)"], [tC, "Steinbach (geändert)"]]) {
    const rr = await lies(t);
    const bb = kopie(rr.bestand);
    bb.mandanten[0].name = neu;
    await schreib(t, bb, rr.etag);
  }
  pruef("Nach drei Schreibvorgängen: 0 → Nordwacht", (await name(tA)) === "Nordwacht (geändert)", await name(tA));
  pruef("… 1 → Lindenhof", (await name(tB)) === "Lindenhof (geändert)", await name(tB));
  pruef("… 2 → Steinbach", (await name(tC)) === "Steinbach (geändert)", await name(tC));

  const r3 = await lies(tB);
  const nurFremd = kopie(r3.bestand);
  nurFremd.mandanten = [{ ...kopie(start.mandanten[0]), name: "von B überschrieben" }];
  const wX = await schreib(tB, nurFremd, r3.etag);
  pruef("Leitung von Betrieb 1 schickt nur Betrieb 0: abgewiesen (403)", wX.status === 403, `Status ${wX.status}`);
  pruef("… Nordwacht unverändert", (await name(tA)) === "Nordwacht (geändert)");

  const zwei = kopie(r3.bestand);
  zwei.mandanten.push({ ...kopie(start.mandanten[2]), name: "von B überschrieben" });
  const wY = await schreib(tB, zwei, r3.etag);
  pruef("Leitung von Betrieb 1 schickt Betrieb 1 und 2: abgewiesen (403)", wY.status === 403, `Status ${wY.status}`);
  pruef("… Steinbach unverändert", (await name(tC)) === "Steinbach (geändert)");
}

const bestanden = ergebnisse.filter((r) => r.ok).length;
console.log(`\n${bestanden} von ${ergebnisse.length} Prüfungen bestanden.`);
if (bestanden !== ergebnisse.length) {
  console.log("Fehlgeschlagen:");
  for (const r of ergebnisse.filter((x) => !x.ok)) console.log(`  - ${r.name} (${r.detail})`);
  process.exit(1);
}
