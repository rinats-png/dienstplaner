/* STAGING-Fassung der Probe zu Abnahmepunkt 7 und 9. NUR im Staging-Container ausführen:
     docker exec -i centric-staging-web node --input-type=module < abnahme-7-9-staging.mjs
   Schreibt ausschließlich in den Raum ppg-gate-a (Namen mit PPG-GATE); entfernen mit werkzeug/staging-aufraeumen.mjs.
   Bricht vor jedem Schreibvorgang ab, wenn CENTRIC_BASIS nicht nach Staging aussieht, Gate-Räume schon existieren
   oder CENTRIC_ADMIN fehlt. */
import path from "node:path";
import fs from "node:fs";
import { pathToFileURL } from "node:url";

const APP = process.env.CENTRIC_APP || "/app", DATEN = process.env.CENTRIC_DATEN, ADMIN = process.env.CENTRIC_ADMIN;
const PORT = process.env.PORT || "3000";
const BASIS = `http://127.0.0.1:${PORT}`;
const ergebnisse = []; const log = [];
const pruef = (name, ok, ist = "") => { ergebnisse.push(ok); console.log(`${ok ? "BESTANDEN      " : "FEHLGESCHLAGEN "} ${name}${ist ? "  | " + ist : ""}`); };

/* ---------- Schutz: nur Staging, nur Gate-Raum ---------- */
const iso = [];
iso.push(["Ziel ist der eigene Server (127.0.0.1)", new URL(BASIS).hostname === "127.0.0.1"]);
iso.push(["CENTRIC_BASIS dieses Containers nennt eine Staging-Adresse (staging.…)", (process.env.CENTRIC_BASIS || "").toLowerCase().startsWith("https://staging.")]);
iso.push(["CENTRIC_ADMIN gesetzt", !!ADMIN]);
let isoOk = true;
for (const [n, ok] of iso) { pruef("SCHUTZ: " + n, ok); if (!ok) isoOk = false; }
if (!isoOk) { console.log("ABBRUCH: Schutzprüfung nicht bestanden, nichts geschrieben."); process.exit(3); }

const laden = (rel) => import(pathToFileURL(path.join(APP, rel)).href);
const { getStore } = await laden("server/lib/ablage.mjs");
const { ablageSchluessel } = await laden("server/lib/codes.mjs");
const { sitzungAnlegen } = await laden("server/lib/sitzungen.mjs");
const store = getStore({ name: "centric", consistency: "strong" });
{ const k = (await store.list({ prefix: "kern:ppg-gate" })).blobs; if (k.length) { console.log("ABBRUCH: Gate-Räume existieren schon (" + k.length + "). Erst staging-aufraeumen.mjs. Nichts geschrieben."); process.exit(3); } }

/* ------------------------------ HTTP (nur lokal) ------------------------------ */
let xz = 0;
async function http(pfad, { methode = "GET", token = null, rumpf } = {}) {
  const url = new URL(pfad, BASIS);
  if (url.origin !== BASIS) throw new Error("fremdes Ziel");
  for (let v = 0; v < 6; v++) {
    const a = await fetch(url, { method: methode, redirect: "manual",
      headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(rumpf !== undefined ? { "content-type": "application/json" } : {}) },
      body: rumpf === undefined ? undefined : JSON.stringify(rumpf) });
    if (a.status === 429) { const w = Number(a.headers.get("retry-after")) || 5; await new Promise((r) => setTimeout(r, Math.min(w, 400) * 1000 + 500)); continue; }
    const text = await a.text(); let d = {}; try { d = JSON.parse(text); } catch { /* leer */ }
    return { status: a.status, text, d: d && typeof d === "object" ? d : {} };
  }
  throw new Error("dauerhaft gebremst");
}
const anmelden = (code) => http("/api/anmelden", { methode: "POST", rumpf: { zugangscode: code } });

if ((await http("/gesund")).status !== 200) { console.log("Server nicht erreichbar"); process.exit(1); }

/* ------------------------------ Anlage Wegwerfraum ------------------------------ */
const RAUM = "ppg-gate-a", MARKE = "PPG-GATE";
const berlin = (v) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date(Date.now() + v * 86400000));
const person = (id, rolle) => ({ id, vorname: "LOKAL", nachname: `Probe-${id}`, rolle,
  bereich: rolle === "leitung" ? "ALLE" : "e1", status: "aktiv", zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }] });
const betrieb = { id: `${RAUM}-m`, name: `${MARKE} Betrieb`, status: "aktiv", einstellungen: {}, einheitLabel: "Wohnbereich",
  einheiten: [{ id: "e1", name: "WB 1" }], dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00" }],
  personen: [person("l", "leitung"), person("m1", "mitarbeiter"), person("m2", "mitarbeiter")],
  abweichungen: {}, einstempeln: {}, erfassung: {}, anfragen: [], nachrichten: [], protokoll: [] };
const e = await http("/einrichten", { methode: "POST", rumpf: { verwaltung: ADMIN, name: `${MARKE} Betreiber`, bestand: RAUM, rolle: "betreiber", person: null, betrieb: 0 } });
const betr = (await anmelden(e.d.zugangscode)).d.token;
const an = await http("/api/bestand-anlegen", { methode: "POST", token: betr, rumpf: { inhalt: { version: 9, stand: 1, session: null, mandanten: [betrieb] } } });
const zu = await http("/api/zugaenge", { methode: "POST", token: betr, rumpf: { bestand: RAUM, eintraege: [
  ["leitung", "l"], ["leitung", "l"], ["mitarbeiter", "m1"]].map(([rolle, personId]) => ({ rolle, personId, name: `${MARKE} ${rolle} ${personId}` })) } });
pruef("Anlage: Raum und 3 Zugänge (lokal)", e.status === 200 && an.status === 200 && zu.status === 200 && (zu.d.zugaenge || []).length === 3, `${e.status}/${an.status}/${zu.status}`);
const [cL1, cL2, cM1] = zu.d.zugaenge.map((z) => z.code);

/* ============================ PUNKT 7 ============================ */
console.log("\n=== PUNKT 7: Zugangscode / Sitzung ohne gültige Rolle ===");
const kontoMit = async (code, felder) => {            // direkter Schreibzugriff in die LOKALE Wegwerfablage
  const k = { bestand: RAUM, name: `${MARKE} Rolle-Test`, person: null, betrieb: 0, ...felder };
  await store.setJSON("konto:" + ablageSchluessel(code), k);
};
const faelle = [
  ["Feld rolle fehlt", {}, 403],
  ["rolle = null", { rolle: null }, 403],
  ["rolle = \"ppg-fantasie\" (unbekannt)", { rolle: "ppg-fantasie" }, 403],
  ["rolle = {} (Objekt)", { rolle: {} }, 403],
  ["Kontrolle: rolle = \"kunde\" (ausdrücklich)", { rolle: "kunde" }, 200],
];
let n = 0;
for (const [name, felder, erwartet] of faelle) {
  const code = `LOKAL-P7-${String(++n).padStart(2, "0")}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  await kontoMit(code, felder);
  const a = await anmelden(code);
  const keineSitzung = erwartet === 200 ? !!a.d.token : !a.d.token && a.d.rolle === undefined;
  pruef(`Code, ${name}: HTTP ${erwartet} erwartet`, a.status === erwartet && keineSitzung, `ist ${a.status}${a.d.token ? " MIT Token" : ""}${a.d.rolle ? " rolle=" + a.d.rolle : ""}`);
  if (erwartet === 200) await http("/api/abmelden", { methode: "POST", token: a.d.token, rumpf: {} });
}
/* Sammelblob „konten“ (Altform): Eintrag ohne Rolle */
{
  const code = `LOKAL-P7-SAMMEL-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const sammel = (await store.get("konten", { type: "json" })) || {};
  sammel[ablageSchluessel(code)] = { bestand: RAUM, name: `${MARKE} Sammel ohne Rolle`, person: null, betrieb: 0 };
  await store.setJSON("konten", sammel);
  const a = await anmelden(code);
  pruef("Code im Altspeicher (Sammelblob) ohne rolle: 403 erwartet", a.status === 403 && !a.d.token, `ist ${a.status}`);
  const nachher = await store.get("konto:" + ablageSchluessel(code), { type: "json" }).catch(() => null);
  pruef("… die Abweisung legt keinen Einzeleintrag mit Ersatzrolle an", !nachher || nachher.rolle === undefined, nachher ? JSON.stringify(Object.keys(nachher)) : "kein Eintrag");
}
/* Bestehende Sitzungen ohne gültige Rolle (Altsitzungen) */
const sitzFaelle = [["Feld rolle fehlt", {}], ["rolle = \"ppg-fantasie\"", { rolle: "ppg-fantasie" }]];
for (const [name, felder] of sitzFaelle) {
  const { token } = await sitzungAnlegen({ bestand: RAUM, name: `${MARKE} Altsitzung`, person: null, betrieb: 0, ...felder }, 600000);
  const lies = await http("/api/bestand", { token });
  const voll = await http("/api/bestand?voll=1", { token });
  const put = await http("/api/bestand", { methode: "PUT", token, rumpf: { bestand: { mandanten: [betrieb] }, etag: null, durch: MARKE } });
  const stemp = await http("/api/stempeln", { methode: "POST", token, rumpf: { datum: berlin(0), art: "start" } });
  const kal = await http("/kalender/einrichten", { methode: "POST", token, rumpf: {} });
  const sich = await http("/api/sicherung", { methode: "POST", token, rumpf: {} });
  const st = [lies, voll, put, stemp, kal, sich].map((x) => x.status);
  const keinBestand = !lies.text.includes(betrieb.name) && !voll.text.includes(betrieb.name);
  pruef(`Altsitzung, ${name}: Bestand/Vollausgabe/Schreiben/Stempeln/Kalender/Sicherung alle 401 oder 403, kein Bestandsinhalt`,
    st.every((s) => s === 401 || s === 403) && keinBestand, `Status ${st.join("/")}`);
}

/* ============================ PUNKT 9 ============================ */
console.log("\n=== PUNKT 9: ETag, parallele Sitzungen, Konflikt, Rückgängig ===");
const A = (await anmelden(cL1)).d.token, B = (await anmelden(cL2)).d.token;
pruef("zwei getrennte Sitzungen (A, B) derselben Rolle im selben Betrieb", !!A && !!B && A !== B);
const lesen = async (t) => { const r = await http("/api/bestand", { token: t }); return { etag: r.d.etag, m: r.d.bestand.mandanten[0], status: r.status, text: r.text }; };
const person1 = (m, id) => m.personen.find((p) => p.id === id);
const speichern = (t, bestand, etag) => http("/api/bestand", { methode: "PUT", token: t, rumpf: { bestand, etag, durch: MARKE } });
const klon = (x) => JSON.parse(JSON.stringify(x));
const mitSchema = (m) => ({ version: 9, stand: 1, session: null, mandanten: [m] });

const a0 = await lesen(A), b0 = await lesen(B);
pruef("A und B lesen denselben Ausgangsstand (gleicher ETag)", a0.status === 200 && b0.status === 200 && a0.etag && a0.etag === b0.etag, `ETag gleich: ${a0.etag === b0.etag}`);
const original = klon(a0.m);

/* 9a gültiger ETag */
const mA = klon(a0.m); person1(mA, "m1").nachname = "Probe-A-ZUERST";
const rA = await speichern(A, mitSchema(mA), a0.etag);
pruef("A speichert mit gültigem ETag: HTTP 200, neuer ETag", rA.status === 200 && rA.d.etag && rA.d.etag !== a0.etag, `ist ${rA.status}`);
const nachA = await lesen(A);
pruef("Nach A: Daten tragen die Änderung von A", person1(nachA.m, "m1").nachname === "Probe-A-ZUERST");

/* 9b veralteter ETag, gleiches Feld (Stammdaten) */
const mB = klon(b0.m); person1(mB, "m1").nachname = "Probe-B-SPAETER";
const rB = await speichern(B, mitSchema(mB), b0.etag);
const nachB = await lesen(A);
pruef("B speichert mit veraltetem ETag (gleiches Feld): HTTP 409 „konflikt“", rB.status === 409 && rB.d.fehler === "konflikt", `ist ${rB.status} ${rB.d.fehler || ""}`);
pruef("kein stilles Überschreiben: Daten tragen weiter die Änderung von A", person1(nachB.m, "m1").nachname === "Probe-A-ZUERST", person1(nachB.m, "m1").nachname);
pruef("Absage nennt den aktuellen Stand (ETag) zum Neuladen oder erklärt den Konflikt", !!rB.d.text || rB.d.etag !== undefined, (rB.d.text || "").slice(0, 100));

/* 9c veralteter ETag, anderes Feld (Stammdaten) — Kern ist ein Ganzes */
const mB2 = klon(b0.m); person1(mB2, "m2").nachname = "Probe-B-ANDERE-PERSON";
const rB2 = await speichern(B, mitSchema(mB2), b0.etag);
const nB2 = await lesen(A);
const beide = person1(nB2.m, "m2").nachname === "Probe-B-ANDERE-PERSON" && person1(nB2.m, "m1").nachname === "Probe-A-ZUERST";
const keinVerlust = person1(nB2.m, "m1").nachname === "Probe-A-ZUERST";
pruef("B mit veraltetem ETag, andere Stammdaten: kein Datenverlust (A bleibt erhalten)", keinVerlust,
  `HTTP ${rB2.status}${rB2.status === 200 ? " (zusammengeführt, beide Änderungen: " + beide + ")" : ""}`);
log.push(`9c Verhalten bei anderer Person im Kern: HTTP ${rB2.status}`);

/* 9d veralteter ETag, anderer Monat (Planung je Monat) */
const bFrisch = await lesen(B);
const tagM1 = berlin(0), tagM2 = berlin(45);
const monat = (d) => d.slice(0, 7);
const mA3 = klon(bFrisch.m); mA3.abweichungen[`m1|${tagM1}`] = "F";
const rA3 = await speichern(A, mitSchema(mA3), bFrisch.etag);
const mB3 = klon(bFrisch.m); mB3.abweichungen[`m1|${tagM2}`] = "F";
const rB3 = await speichern(B, mitSchema(mB3), bFrisch.etag);          // B hat denselben Ausgangsstand wie A, A war zuerst
const nB3 = await lesen(A);
const hatA = nB3.m.abweichungen[`m1|${tagM1}`] === "F", hatB = nB3.m.abweichungen[`m1|${tagM2}`] === "F";
pruef(`Planung, A (${monat(tagM1)}) zuerst, B (${monat(tagM2)}) mit veraltetem ETag: A bleibt erhalten`, rA3.status === 200 && hatA,
  `A ${rA3.status}, B ${rB3.status}, Datenstand A:${hatA} B:${hatB}`);
log.push(`9d anderer Monat: B HTTP ${rB3.status}, B-Änderung gespeichert: ${hatB}`);
/* 9e veralteter ETag, gleicher Monat */
const bF2 = await lesen(B);
const mA4 = klon(bF2.m); mA4.abweichungen[`m2|${tagM1}`] = "F";
const rA4 = await speichern(A, mitSchema(mA4), bF2.etag);
const mB4 = klon(bF2.m); delete mB4.abweichungen[`m1|${tagM1}`];       // B löscht, was A (früher) gesetzt hat, auf altem Stand
mB4.abweichungen[`m2|${tagM1}`] = "";                                   // und kollidiert im selben Monat
const rB4 = await speichern(B, mitSchema(mB4), bF2.etag);
const nB4 = await lesen(A);
pruef("Planung, gleicher Monat, B mit veraltetem ETag: HTTP 409 und A bleibt erhalten", rA4.status === 200 && rB4.status === 409 && nB4.m.abweichungen[`m2|${tagM1}`] === "F",
  `A ${rA4.status}, B ${rB4.status}, Datenstand m2: ${nB4.m.abweichungen[`m2|${tagM1}`]}`);

/* 9f Rückgängig: Ausgangszustand mit aktuellem ETag zurück */
const jetzt = await lesen(A);
const rueck = klon(original);
const rr = await speichern(A, mitSchema(rueck), jetzt.etag);
const nachRueck = await lesen(B);
const gleich = JSON.stringify({ n: person1(nachRueck.m, "m1").nachname, a: nachRueck.m.abweichungen }) === JSON.stringify({ n: person1(original, "m1").nachname, a: original.abweichungen });
pruef("Rückgängig (Ausgangsstand mit aktuellem ETag): HTTP 200", rr.status === 200, `ist ${rr.status} ${rr.d.fehler || ""}`);
pruef("Rückgängig: nach Neuladen (durch B) entspricht der Datenstand dem Ausgangszustand", gleich,
  `Nachname m1: ${person1(nachRueck.m, "m1").nachname}, Abweichungen: ${Object.keys(nachRueck.m.abweichungen).length}`);
/* Rückgängig mit veraltetem ETag: B (Ausgangsstand = jetzt.etag) ändert die Stammdaten, die der Rückgang inzwischen zurückgesetzt hat */
const nachRueckLesen = await lesen(A);
const mB5 = klon(jetzt.m); person1(mB5, "m1").nachname = "Probe-B-NACH-RUECKGANG";
const rr2 = await speichern(B, mitSchema(mB5), jetzt.etag);
const nRr2 = await lesen(A);
pruef("Stale ETag (vor dem Rückgängig) mit geänderten Stammdaten: HTTP 409, Stand bleibt wie nach Rückgängig", rr2.status === 409 && JSON.stringify(nRr2.m) === JSON.stringify(nachRueckLesen.m), `ist ${rr2.status}`);
/* Drei-Wege-Abgleich: B schickt mit altem ETag einen Stand, der gegenüber SEINER Basis nichts ändert, was inzwischen zurückgesetzt wurde */
const rr3 = await speichern(B, mitSchema(klon(mA)), jetzt.etag);
const nRr3 = await lesen(A);
log.push(`9f Stale-Speichern ohne eigene Änderung gegenüber der Basis: HTTP ${rr3.status}; m1.nachname danach: ${person1(nRr3.m, "m1").nachname} (Erwartung des Drei-Wege-Abgleichs: Stand des Rückgängig bleibt)`);
pruef("Drei-Wege-Abgleich: Stale-Speichern ohne eigene Änderung setzt das Rückgängig nicht zurück", person1(nRr3.m, "m1").nachname === person1(original, "m1").nachname, person1(nRr3.m, "m1").nachname);

/* 9g Randfälle des ETag */
const aktuell = await lesen(A);
/* Ohne ETag auf vorhandenem Bestand: erst A ändert mit gültigem ETag, dann schreibt C ohne ETag etwas anderes */
const mAk = klon(aktuell.m); person1(mAk, "m1").nachname = "OHNE-ETAG-A"; const rAk = await speichern(A, mitSchema(mAk), aktuell.etag);
const mC = klon(aktuell.m); person1(mC, "m1").nachname = "OHNE-ETAG-C-UEBERSCHREIBT";
const ohneEtag = await speichern(A, mitSchema(mC), null);
const nOhne = await lesen(A);
log.push(`9g Speichern OHNE ETag nach fremder Änderung: HTTP ${ohneEtag.status}; m1.nachname danach: ${person1(nOhne.m, "m1").nachname} (A hatte OHNE-ETAG-A gespeichert, HTTP ${rAk.status})`);
const falscherEtag = await speichern(A, mitSchema(klon(aktuell.m)), "kein-gueltiger-etag");
const nochAktuell = await lesen(A);
pruef("Speichern ohne ETag auf vorhandenem Bestand nach fremder Änderung: kein stilles Überschreiben (4xx)", ohneEtag.status >= 400 && ohneEtag.status < 500 && person1(nOhne.m, "m1").nachname === "OHNE-ETAG-A", `ist ${ohneEtag.status} ${ohneEtag.d.fehler || ""}`);
pruef("Speichern mit ungültigem ETag: kein stilles Überschreiben (4xx)", falscherEtag.status >= 400 && falscherEtag.status < 500, `ist ${falscherEtag.status} ${falscherEtag.d.fehler || ""}`);
pruef("… ungültiger ETag ändert den Datenstand nicht", person1(nochAktuell.m, "m1").nachname === person1(nOhne.m, "m1").nachname);
const ohneBestand = await http("/api/bestand", { methode: "PUT", token: A, rumpf: { etag: aktuell.etag } });
pruef("Speichern ohne Bestand: HTTP 400", ohneBestand.status === 400, `ist ${ohneBestand.status}`);
const frisch = await lesen(A); const unver = await speichern(A, mitSchema(klon(frisch.m)), frisch.etag);
pruef("erneutes Speichern unveränderter Daten mit gültigem ETag: HTTP 200", unver.status === 200, `ist ${unver.status}`);

/* Ablage nach Abschluss: nur Wegwerfraum */
const kerne = (await store.list({ prefix: "kern:ppg-gate" })).blobs.map((b) => b.key);
pruef("Gate-Räume: nur ppg-gate-a angelegt", kerne.length === 1 && kerne[0] === `kern:${RAUM}`, kerne.join(","));
console.log("AUFRÄUMEN NICHT VERGESSEN: node /app/werkzeug/staging-aufraeumen.mjs (löscht ppg-gate-a/-b/-geo)");

console.log("\nBeobachtungen:\n  " + log.join("\n  "));
const ok = ergebnisse.filter(Boolean).length;
console.log(`\nABNAHME-7-9 (Staging-Fassung): ${ok}/${ergebnisse.length} bestanden`);
process.exit(ok === ergebnisse.length ? 0 : 1);
