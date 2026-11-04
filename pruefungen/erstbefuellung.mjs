/* ==========================================================================
   ERSTBEFÜLLUNG — gegen einen laufenden Server

   Bis Oktober 2026 entstand ein Zugangscode auch für einen Raum, den es
   noch nicht gab, und der erste Client, der sich damit anmeldete, befüllte
   ihn mit einem selbst gebauten Bestand. Jetzt richtet nur der Betreiber
   einen leeren Raum ein (/api/bestand-anlegen), mit serverseitiger Prüfung;
   Codes für Kundenrollen entstehen erst danach und tragen die Kennung ihres
   Betriebs.

   Aufruf: node pruefungen/serverlauf.mjs erstbefuellung
   Schreibt in die Räume "erst-leer" und "erst-demo".
   ========================================================================== */

const BASIS = process.env.CENTRIC_BASIS || "http://localhost:5173";
const GEHEIM = process.env.CENTRIC_ADMIN || "testgeheim";
const HERKUNFT = process.env.CENTRIC_HERKUNFT || "10.6.6.";

/* Jeder Aufruf von /einrichten von einer eigenen Herkunft — die Bremse zählt
   je Herkunft fünf, insgesamt zwanzig je zehn Minuten. */
let nr = 0;
async function einrichten(raum, rolle, person, betrieb) {
  nr += 1;
  const a = await fetch(`${BASIS}/einrichten`, { method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": `${HERKUNFT}${nr}` },
    body: JSON.stringify({ verwaltung: GEHEIM, name: `Erstprobe ${rolle}`, bestand: raum, rolle, person, betrieb }) });
  let d = {}; try { d = await a.json(); } catch { /* leer */ }
  return { status: a.status, ...d };
}
const anmeldung = async (code) => {
  const a = await fetch(`${BASIS}/api/anmelden`, { method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": `${HERKUNFT}200` },
    body: JSON.stringify({ zugangscode: code }) });
  let d = {}; try { d = await a.json(); } catch { /* leer */ }
  return { status: a.status, ...d };
};
const rufe = async (t, pfad, methode = "GET", rumpf) => {
  const a = await fetch(`${BASIS}/api/${pfad}`, { method: methode,
    headers: { authorization: `Bearer ${t}`, "content-type": "application/json" },
    body: rumpf === undefined ? undefined : JSON.stringify(rumpf) });
  let d = {}; try { d = await a.json(); } catch { /* leer */ }
  return { status: a.status, ...d };
};
const uebersicht = async (raum) => (await fetch(`${BASIS}/einrichten/uebersicht?bestand=${raum}`,
  { headers: { authorization: `Bearer ${GEHEIM}`, "x-forwarded-for": `${HERKUNFT}201` } })).json();

const ergebnisse = [];
const pruef = (name, bedingung, detail) => {
  ergebnisse.push({ name, ok: !!bedingung, detail });
  console.log(`${bedingung ? "  BESTANDEN" : "  FEHLGESCHLAGEN"}  ${name}${detail ? ` — ${detail}` : ""}`);
};
const kopie = (x) => JSON.parse(JSON.stringify(x));

const person = (id, rolle) => ({ id, vorname: id, nachname: id, rolle, bereich: "ALLE",
  zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }] });
const betrieb = (id, name, personen) => ({ id, name, einheitLabel: "Wohnbereich",
  einheiten: [{ id: "e1", name: "WB 1" }], dienstarten: [{ id: "F", name: "Früh" }],
  personen, abweichungen: {}, erfassung: {}, anfragen: [], nachrichten: [], protokoll: [] });
const demo = () => ({ version: 9, stand: 1, session: null, mandanten: [
  betrieb("m-nordwacht", "Nordwacht", [person("a-l", "leitung")]),
  betrieb("m-lindenhof", "Lindenhof", [person("b-l", "leitung")]),
  betrieb("m-steinbach", "Steinbach", [person("c-l", "leitung")]),
] });

/* --- 1. Leerer Raum: keine Codes für Kundenrollen --- */
for (const [rolle, p] of [["leitung", null], ["planer", null], ["kunde", null],
  ["subplaner", "p1"], ["mitarbeiter", "p1"], ["betriebsrat", "p1"]]) {
  const e = await einrichten("erst-leer", rolle, p, 0);
  pruef(`Leerer Raum: kein Code für ${rolle} (409)`, e.status === 409 && /nicht eingerichtet/.test(e.fehler || ""),
    `Status ${e.status} · ${e.fehler || ""}`);
}

/* --- 2. Der Betreiber darf vorher einen Code bekommen --- */
const eB = await einrichten("erst-leer", "betreiber", null, 0);
pruef("Leerer Raum: Betreibercode entsteht", eB.status === 200 && !!eB.zugangscode, `Status ${eB.status}`);
const aB = await anmeldung(eB.zugangscode);
const tB = aB.token;
pruef("… und meldet sich an", !!tB, `Status ${aB.status}`);

/* --- 3. Auch der Betreiber befüllt nicht über PUT --- */
const pB = await rufe(tB, "bestand", "PUT", { bestand: demo(), etag: null, durch: "Test" });
pruef("Betreiber: PUT auf leeren Raum abgewiesen (403)", pB.status === 403, `Status ${pB.status}`);
const lB = await rufe(tB, "bestand");
pruef("… der Raum ist weiter leer", lB.status === 200 && !lB.bestand, `Status ${lB.status}`);

/* --- 4. Vorlage leer, serverseitig gebaut --- */
const vL = await rufe(tB, "bestand-anlegen", "POST", { vorlage: "leer", name: "Haus Erstprobe" });
pruef("Betreiber richtet den Raum mit der Vorlage leer ein", vL.status === 200
  && JSON.stringify(vL.mandanten) === JSON.stringify(["erst-leer"]), `Status ${vL.status} · ${JSON.stringify(vL.mandanten)}`);
const vL2 = await rufe(tB, "bestand-anlegen", "POST", { vorlage: "leer" });
pruef("… ein zweites Mal: Raum belegt (409)", vL2.status === 409, `Status ${vL2.status}`);
const vU = await rufe(tB, "bestand-anlegen", "POST", { bestand: "erst-unbekannt", vorlage: "irgendwas" });
pruef("Unbekannte Vorlage: abgewiesen (400)", vU.status === 400, `Status ${vU.status}`);

/* --- 5. Danach entstehen Codes, gebunden an die Kennung --- */
const eL = await einrichten("erst-leer", "leitung", null, 0);
pruef("Eingerichteter Raum: Leitungscode entsteht", eL.status === 200 && !!eL.zugangscode, `Status ${eL.status}`);
const ueL = await uebersicht("erst-leer");
const zL = (ueL.zugaenge || []).find((z) => z.rolle === "leitung");
pruef("… mit Position und Kennung des Betriebs", zL && zL.betrieb === 0 && zL.mandantId === "erst-leer", JSON.stringify(zL));
const tL = (await anmeldung(eL.zugangscode)).token;
pruef("… und die Leitung liest ihren Betrieb", (await rufe(tL, "bestand")).bestand?.mandanten?.[0]?.name === "Haus Erstprobe");
const xL = await rufe(tL, "bestand-anlegen", "POST", { bestand: "erst-fremd", vorlage: "leer" });
pruef("Leitung: kein Raum anlegen (403)", xL.status === 403, `Status ${xL.status}`);
const eP = await einrichten("erst-leer", "planer", null, 5);
pruef("Code für eine Position ohne Betrieb: abgewiesen (409)", eP.status === 409, `Status ${eP.status} · ${eP.fehler || ""}`);

/* --- 6. Demo: genau drei feste Kennungen in fester Reihenfolge --- */
const eD = await einrichten("erst-demo", "betreiber", null, 0);
const tD = (await anmeldung(eD.zugangscode)).token;
const anlegen = (inhalt) => rufe(tD, "bestand-anlegen", "POST", { inhalt, vorlage: "demo" });
{
  const falsch = demo(); falsch.mandanten.reverse();
  pruef("Demo in falscher Reihenfolge: abgewiesen (422)", (await anlegen(falsch)).status === 422);
  const doppelt = demo(); doppelt.mandanten[2] = { ...kopie(doppelt.mandanten[0]) };
  pruef("Demo mit doppelter Kennung: abgewiesen (422)", (await anlegen(doppelt)).status === 422);
  const fremd = demo(); fremd.mandanten[1].id = "m-anders";
  pruef("Demo mit unbekannter Kennung: abgewiesen (422)", (await anlegen(fremd)).status === 422);
  const zwei = demo(); zwei.mandanten.pop();
  pruef("Demo mit zwei Betrieben: abgewiesen (422)", (await anlegen(zwei)).status === 422);
  const leer = await rufe(tD, "bestand");
  pruef("… nach allen Fehlversuchen ist der Raum weiter leer", !leer.bestand);
  const ok = await anlegen(demo());
  pruef("Demo in richtiger Gestalt: angelegt", ok.status === 200
    && JSON.stringify(ok.mandanten) === JSON.stringify(["m-nordwacht", "m-lindenhof", "m-steinbach"]), `Status ${ok.status}`);
}

/* --- 7. Bindung: Code für Betrieb 1 trägt m-lindenhof --- */
const eL1 = await einrichten("erst-demo", "leitung", "b-l", 1);
const zL1 = ((await uebersicht("erst-demo")).zugaenge || []).find((z) => z.rolle === "leitung");
pruef("Leitungscode für Betrieb 1 trägt m-lindenhof", zL1 && zL1.betrieb === 1 && zL1.mandantId === "m-lindenhof", JSON.stringify(zL1));
const tL1 = (await anmeldung(eL1.zugangscode)).token;
const r1 = await rufe(tL1, "bestand");
pruef("… die Leitung sieht genau Lindenhof", r1.status === 200 && r1.bestand.mandanten.length === 1
  && r1.bestand.mandanten[0].id === "m-lindenhof", (r1.bestand?.mandanten || []).map((m) => m.id).join(","));

/* --- 8. Der Betreiber vertauscht die Reihenfolge: der Code passt nicht mehr --- */
{
  const r = await rufe(tD, "bestand");
  const b = kopie(r.bestand);
  b.mandanten = [b.mandanten[1], b.mandanten[0], b.mandanten[2]];
  const w = await rufe(tD, "bestand", "PUT", { bestand: b, etag: r.etag, durch: "Test" });
  pruef("Betreiber vertauscht Betrieb 0 und 1", w.status === 200, `Status ${w.status} · ${w.text || w.fehler || ""}`);
  const nach = await rufe(tL1, "bestand");
  pruef("… die laufende Sitzung der Leitung endet (401) statt Nordwacht zu zeigen", nach.status === 401,
    `Status ${nach.status} · ${(nach.bestand?.mandanten || []).map((m) => m.id).join(",")}`);
  const neu = await anmeldung(eL1.zugangscode);
  pruef("… und eine neue Anmeldung wird abgewiesen (403)", neu.status === 403 && !neu.token, `Status ${neu.status}`);
}

const bestanden = ergebnisse.filter((r) => r.ok).length;
console.log(`\n${bestanden} von ${ergebnisse.length} Prüfungen bestanden.`);
if (bestanden !== ergebnisse.length) {
  console.log("Fehlgeschlagen:");
  for (const r of ergebnisse.filter((x) => !x.ok)) console.log(`  - ${r.name} (${r.detail})`);
  process.exit(1);
}
