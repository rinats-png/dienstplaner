/* ==========================================================================
   SICHERUNG UND WIEDERHERSTELLUNG — gegen einen laufenden Server

   Bis Oktober 2026 durfte jede Rolle Sicherungen anlegen und auflisten,
   gesichert, ausgegeben und zurückgespielt wurde der ganze Raum — in einem
   Raum mit mehreren Betrieben also auch die fremden. Die Wiederherstellung
   ging an jeder Prüfung des Schreibwegs vorbei und überschrieb blind, was
   inzwischen gespeichert war.

   Aufruf: node pruefungen/serverlauf.mjs sicherungen
   Schreibt in den Raum "sicherungen-probe".
   ========================================================================== */

const BASIS = process.env.CENTRIC_BASIS || "http://localhost:5173";
const GEHEIM = process.env.CENTRIC_ADMIN || "testgeheim";
const HERKUNFT = process.env.CENTRIC_HERKUNFT || "10.4.4.1";
const RAUM = "sicherungen-probe";

/* Jeder Zugang von einer eigenen Herkunft — die Bremse für /einrichten
   zählt je Herkunft fünf, insgesamt zwanzig je zehn Minuten. */
let nr = 0;
async function zugang(rolle, person, betrieb) {
  nr += 1;
  const a = await fetch(`${BASIS}/einrichten`, { method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": `${HERKUNFT}${nr}` },
    body: JSON.stringify({ verwaltung: GEHEIM, name: "Sicherungsprobe", bestand: RAUM, rolle, person, betrieb }) });
  const d = await a.json();
  if (!d.zugangscode) throw new Error(`Zugang ${rolle}/${betrieb} nicht angelegt: ${JSON.stringify(d)}`);
  return d.zugangscode;
}
const anmelden = async (code) => {
  const a = await fetch(`${BASIS}/api/anmelden`, { method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": `${HERKUNFT}0` },
    body: JSON.stringify({ zugangscode: code }) });
  const d = await a.json();
  if (!d.token) throw new Error(`Anmeldung fehlgeschlagen: ${JSON.stringify(d)}`);
  return d.token;
};
const kopf = (t) => ({ authorization: `Bearer ${t}`, "content-type": "application/json" });
const rufe = async (t, pfad, methode = "GET", rumpf) => {
  const a = await fetch(`${BASIS}/api/${pfad}`, { method: methode, headers: kopf(t),
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

const person = (id, rolle) => ({ id, vorname: id, nachname: id, rolle, bereich: rolle === "subplaner" ? "e1" : "ALLE",
  zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }] });
const betrieb = (id, name, personen) => ({ id, name, einheitLabel: "Wohnbereich",
  einheiten: [{ id: "e1", name: "WB 1" }], dienstarten: [{ id: "F", name: "Früh" }],
  personen, abweichungen: {}, erfassung: {}, anfragen: [], nachrichten: [], protokoll: [] });
const start = { version: 9, stand: 1, session: null, mandanten: [
  betrieb("m-nordwacht", "Nordwacht", [person("a-l", "leitung")]),
  betrieb("m-lindenhof", "Lindenhof", [person("b-l", "leitung"), person("b-p", "planer"),
    person("b-s", "subplaner"), person("b-x", "mitarbeiter"), person("b-r", "betriebsrat")]),
  betrieb("m-steinbach", "Steinbach", [person("c-l", "leitung")]),
] };

/* Den Raum richtet der Betreiber ein (seit Oktober 2026), mit der Demo-Prüfung:
   genau diese drei Kennungen in dieser Reihenfolge. */
const tBetreiber = await anmelden(await zugang("betreiber", null, 0));
const w0 = await fetch(`${BASIS}/api/bestand-anlegen`, { method: "POST",
  headers: { authorization: `Bearer ${tBetreiber}`, "content-type": "application/json" },
  body: JSON.stringify({ inhalt: start, vorlage: "demo" }) });
pruef("Raum mit drei Betrieben über den Betreiber angelegt (Demo-Gestalt)", w0.status === 200, `Status ${w0.status}`);
const tA = await anmelden(await zugang("leitung", "a-l", 0));
const tB = await anmelden(await zugang("leitung", "b-l", 1));
const tC = await anmelden(await zugang("leitung", "c-l", 2));
const ohne = {
  planer: await anmelden(await zugang("planer", "b-p", 1)),
  subplaner: await anmelden(await zugang("subplaner", "b-s", 1)),
  mitarbeiter: await anmelden(await zugang("mitarbeiter", "b-x", 1)),
  betriebsrat: await anmelden(await zugang("betriebsrat", "b-r", 1)),
};
const name = async (t) => (await lies(t)).bestand.mandanten.map((m) => m.name).join(",");

/* --- Rollen --- */
for (const [rolle, t] of Object.entries(ohne)) {
  const s = await rufe(t, "sicherung", "POST", {});
  pruef(`${rolle}: keine Sicherung anlegen`, s.status === 403, `Status ${s.status}`);
  const l = await rufe(t, "sicherungen");
  pruef(`${rolle}: keine Liste`, l.status === 403, `Status ${l.status}`);
}
const wP = await rufe(ohne.planer, "wiederherstellen", "POST", { marke: "2026-10-18-00-00-00", etag: 1 });
pruef("Planung: nicht wiederherstellen", wP.status === 403, `Status ${wP.status}`);

/* --- Leitung B sichert ihren Betrieb --- */
const sB = await rufe(tB, "sicherung", "POST", {});
pruef("Leitung legt eine Sicherung ihres Betriebs an", sB.status === 200 && !!sB.marke, `Status ${sB.status}`);
const sA = await rufe(tA, "sicherung", "POST", {});
const listeB = await rufe(tB, "sicherungen");
const eintragB = (listeB.sicherungen || []).find((x) => x.marke === sB.marke);
pruef("… sie steht in ihrer Liste, betriebsbezogen", eintragB && eintragB.umfang === "betrieb", JSON.stringify(eintragB));
pruef("… die Sicherung von Betrieb A steht nicht darin", !(listeB.sicherungen || []).some((x) => x.marke === sA.marke));
const listeA = await rufe(tA, "sicherungen");
pruef("… und in der Liste von A steht die von B nicht", !(listeA.sicherungen || []).some((x) => x.marke === sB.marke));

/* --- Vollausgabe --- */
const vB = await rufe(tB, "vollausgabe");
pruef("Vollausgabe der Leitung: genau der eigene Betrieb",
  vB.status === 200 && vB.bestand.mandanten.length === 1 && vB.bestand.mandanten[0].id === "m-lindenhof"
    && vB.umfang === "betrieb", `${(vB.bestand?.mandanten || []).map((m) => m.id).join(",")}`);
pruef("… ohne fremde Betriebe", !JSON.stringify(vB).includes("Nordwacht") && !JSON.stringify(vB).includes("Steinbach"));

/* --- Wiederherstellen --- */
{
  const r = await lies(tB);
  const b = kopie(r.bestand);
  b.mandanten[0].name = "Lindenhof (verändert)";
  await schreib(tB, b, r.etag);
  const rA = await lies(tA);
  const bA = kopie(rA.bestand);
  bA.mandanten[0].name = "Nordwacht (nach der Sicherung)";
  await schreib(tA, bA, rA.etag);

  const ohneStand = await rufe(tB, "wiederherstellen", "POST", { marke: sB.marke });
  pruef("Ohne Stand: abgewiesen (409)", ohneStand.status === 409, `Status ${ohneStand.status}`);
  const alt = await rufe(tB, "wiederherstellen", "POST", { marke: sB.marke, etag: r.etag });
  pruef("Mit veraltetem Stand: abgewiesen (409)", alt.status === 409, `Status ${alt.status}`);

  const fremd = await rufe(tB, "wiederherstellen", "POST", { marke: sA.marke, etag: (await lies(tB)).etag });
  pruef("Die Sicherung von Betrieb A passt nicht zu B (404)", fremd.status === 404, `Status ${fremd.status}`);

  const aktuell = await lies(tB);
  const w = await rufe(tB, "wiederherstellen", "POST", { marke: sB.marke, etag: aktuell.etag });
  pruef("Leitung stellt ihren Betrieb wieder her", w.status === 200, `Status ${w.status} · ${w.text || ""}`);
  pruef("… B hat den alten Namen", (await name(tB)) === "Lindenhof", await name(tB));
  pruef("… A behält den Stand nach der Sicherung", (await name(tA)) === "Nordwacht (nach der Sicherung)", await name(tA));
  pruef("… C unverändert", (await name(tC)) === "Steinbach", await name(tC));
  const proto = (await lies(tB)).bestand.mandanten[0].protokoll || [];
  pruef("… und im Protokoll des Betriebs vermerkt", proto.some((p) => /wiederhergestellt/.test(p.text || "")));
}

/* --- Bremse: je Betrieb, nicht je Raum --- */
{
  let gebremst = false;
  for (let i = 0; i < 8 && !gebremst; i++) gebremst = (await rufe(tB, "sicherung", "POST", {})).status === 429;
  pruef("Die Bremse greift für Sicherungen von B", gebremst);
  const nochA = await rufe(tA, "sicherung", "POST", {});
  pruef("… Betrieb A kann weiter sichern", nochA.status === 200, `Status ${nochA.status}`);
}

/* --- Protokoll --- */
{
  const lage = await fetch(`${BASIS}/lage?tage=1`, { headers: kopf(tBetreiber) }).then((a) => a.json()).catch(() => ({}));
  const zeilen = lage.letzte || [];
  pruef("Anlegen einer Sicherung steht im Protokoll", zeilen.some((z) => z.art === "sicherung" && z.ergebnis !== "abgewiesen"),
    `${zeilen.filter((z) => z.art === "sicherung").length} Zeilen`);
  pruef("Die Wiederherstellung steht im Protokoll", zeilen.some((z) => z.art === "schreiben"
    && /wiederhergestellt aus/.test(JSON.stringify(z))));
}

const bestanden = ergebnisse.filter((r) => r.ok).length;
console.log(`\n${bestanden} von ${ergebnisse.length} Prüfungen bestanden.`);
if (bestanden !== ergebnisse.length) {
  console.log("Fehlgeschlagen:");
  for (const r of ergebnisse.filter((x) => !x.ok)) console.log(`  - ${r.name} (${r.detail})`);
  process.exit(1);
}
