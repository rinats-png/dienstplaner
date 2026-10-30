/* ==========================================================================
   STAGING-GEO — feste Probe für Geo V1 im Pre-Production-Gate

   Läuft ausschließlich im Staging-Container gegen den eigenen Server:
     node /app/werkzeug/staging-geo.mjs

   Ziel ist fest http://127.0.0.1:3000 — keine Argumente, keine Basis-URL
   aus der Umgebung, keine Weiterleitungen. Wegwerfdaten: genau ein Raum,
   ppg-gate-geo, mit einem Betrieb, alle Namen mit „PPG-GATE". Weg damit
   nur über werkzeug/staging-aufraeumen.mjs. Reste eines früheren Laufs:
   Abbruch vor jedem Schreibvorgang (Exit 3).

   Geprüft wird nur die API. Die Anzeige in der Oberfläche (Stempeluhr,
   Befunde, Nachtdienst nach Mitternacht) prüft diese Probe nicht.

   Exit 0: alle Prüfungen bestanden · 1: mindestens eine fehlgeschlagen ·
   2: falscher Aufruf · 3: Altlasten, nichts geschrieben.
   ========================================================================== */

import { getStore } from "../server/lib/ablage.mjs";
import { raumBelegt } from "../server/lib/bestand.mjs";

const BASIS = "http://127.0.0.1:3000";
const RAUM = "ppg-gate-geo";
const MARKE = "PPG-GATE";
const NAME = "STAGING-GEO";

function abbruch(code, text) {
  console.error(`${NAME}: ABBRUCH — ${text}`);
  /* Kurz warten, damit offene HTTP-Verbindungen sauber schließen (unter
     Windows bricht libuv sonst beim sofortigen Beenden ab). */
  return new Promise(() => setTimeout(() => process.exit(code), 100));
}
if (process.argv.length > 2) await abbruch(2, "Diese Probe nimmt keine Argumente.");
/* Das Ziel kommt aus keiner Umgebungsvariable. CENTRIC_BASIS gehört dem Server
   (Adresse in Einladungs- und Rücksetzlinks) und wird hier nicht gelesen;
   abgebrochen wird, wenn jemand versucht, der Probe ein Ziel unterzuschieben. */
for (const v of ["CENTRIC_PROBE_BASIS", "STAGING_PROBE_BASIS", "PROBE_BASIS", "PROBE_URL", "NODE_USE_ENV_PROXY"])
  if (process.env[v] !== undefined) await abbruch(2, `${v} ist gesetzt — das Ziel dieser Probe ist fest ${BASIS}.`);
const VERWALTUNG = process.env.CENTRIC_ADMIN;
if (!VERWALTUNG) await abbruch(2, "CENTRIC_ADMIN fehlt in der Umgebung des Servers.");

const geheim = new Set([VERWALTUNG]);
const merken = (x) => { if (typeof x === "string" && x.length >= 6) geheim.add(x); return x; };
function sauber(s) {
  let t = String(s);
  for (const g of geheim) t = t.split(g).join("[geschwärzt]");
  return t.replace(/\b[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}\b/g, "[code]")
    .replace(/[A-Za-z0-9_-]{40,}/g, "[merkmal]").slice(0, 300);
}

async function http(pfad, { methode = "GET", token = null, rumpf } = {}) {
  if (typeof pfad !== "string" || !pfad.startsWith("/") || pfad.startsWith("//"))
    await abbruch(2, "interner Fehler: ungültiger Pfad");
  const url = new URL(pfad, BASIS);
  if (url.origin !== BASIS) await abbruch(2, "interner Fehler: fremdes Ziel");
  const a = await fetch(url, { method: methode, redirect: "manual",
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(rumpf !== undefined ? { "content-type": "application/json" } : {}) },
    body: rumpf === undefined ? undefined : JSON.stringify(rumpf) });
  const text = await a.text();
  let d = {}; try { d = JSON.parse(text); } catch { /* leer */ }
  return { status: a.status, text, d: d && typeof d === "object" ? d : {} };
}

const ergebnisse = [];
function pruef(name, ok, detail = "") {
  ergebnisse.push({ name, ok: !!ok });
  console.log(`  ${ok ? "BESTANDEN     " : "FEHLGESCHLAGEN"}  ${name}${!ok && detail ? ` — ${sauber(detail)}` : ""}`);
}
async function abschnitt(titel, fn) {
  console.log(`\n${titel}`);
  try { await fn(); } catch (e) { pruef(`${titel}: ohne Ausnahme durchgelaufen`, false, e && e.message); }
}
const kopie = (x) => JSON.parse(JSON.stringify(x));
const tag = (versatz) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" })
  .format(new Date(Date.now() + versatz * 86400000));
const HEUTE = tag(0), GESTERN = tag(-1);

async function altlasten() {
  const store = getStore({ name: "centric", consistency: "strong" });
  const funde = [];
  if (await raumBelegt(store, RAUM)) funde.push(`Raum ${RAUM}`);
  let konten = 0;
  for (const b of (await store.list({ prefix: "konto:" })).blobs) {
    const k = await store.get(b.key, { type: "json" }).catch(() => null);
    if (k && k.bestand === RAUM) konten++;
  }
  if (konten) funde.push(`${konten} Zugang/Zugänge`);
  return funde;
}

/* ------------------------------ Testdaten ------------------------------- */

const REF = { lat: 50, lon: 8 };
const nord = (m) => REF.lat + m / ((2 * Math.PI * 6371000) / 360);
const MA = ["a1", "a2", "a3", "a4", "a5", "a6", "a7", "a8", "a9", "a10", "a11"];
const person = (id, rolle) => ({ id, vorname: "PPG", nachname: `Gate-${id}`, rolle, bereich: rolle === "mitarbeiter" ? "e1" : "ALLE",
  status: "aktiv", zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }] });
const BETRIEB = { id: `${RAUM}-m`, name: `${MARKE} Geobetrieb (Wegwerf)`, status: "aktiv", einstellungen: {},
  einheitLabel: "Wohnbereich", einheiten: [{ id: "e1", name: "WB", standortId: "st1" }],
  standorte: [{ id: "st1", name: `${MARKE} Zentrale`, bundesland: "HE", lat: REF.lat, lon: REF.lon, radius: 200 }],
  dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00" }, { id: "N", name: "Nacht", start: "22:00", ende: "06:00" }],
  personen: [person("l1", "leitung"), person("p1", "planer"), ...MA.map((i) => person(i, "mitarbeiter"))],
  /* a8 ohne Dienst (UNGEPLANTER_DIENST), a10 Nachtdienst seit gestern mit offenem Beginn,
     a11 ein alter Stempel von gestern ohne geoStart/geoEnde. */
  abweichungen: { ...Object.fromEntries(MA.filter((i) => i !== "a8" && i !== "a10" && i !== "a11").map((i) => [`${i}|${HEUTE}`, "F"])),
    [`a10|${GESTERN}`]: "N", [`a11|${GESTERN}`]: "F" },
  einstempeln: { [`a10|${GESTERN}`]: { start: "22:01" },
    [`a11|${GESTERN}`]: { start: "06:02", ende: "14:03", ortStart: "Am Standort", innerhalbStart: true, geprueftStart: true } },
  erfassung: { [`a11|${GESTERN}`]: { start: "06:02", ende: "14:03", bestaetigt: true, grund: "" } },
  anfragen: [], notrufe: [], nachrichten: [], abwesenheiten: [], protokoll: [] };

/* ================================ Lauf ================================== */

console.log(`${NAME} gegen ${BASIS} — Raum ${RAUM}`);
const gesund = await http("/gesund").catch(() => null);
if (!gesund || gesund.status !== 200) await abbruch(1, "/gesund antwortet nicht mit 200.");
const reste = await altlasten();
if (reste.length) await abbruch(3, `Altlasten aus einem früheren Lauf (${reste.join(", ")}). `
  + "Nichts angelegt. Erst die Aufräumprobe ausführen (centric-staging-probe cleanup).");

const T = {};
const anmelden = async (code) => merken((await http("/api/anmelden", { methode: "POST", rumpf: { zugangscode: code } })).d.token || null);
const lies = (t) => http("/api/bestand", { token: t });
const schreib = (t, bestand, etag) => http("/api/bestand", { methode: "PUT", token: t, rumpf: { bestand, etag, durch: MARKE } });
const stempeln = (t, rumpf) => http("/api/stempeln", { methode: "POST", token: t, rumpf: { datum: HEUTE, ...rumpf } });
const antworten = [];
const merke = (x) => { antworten.push(x.text); return x; };
const geoVon = (x) => (x.d.eintrag && (x.d.eintrag.geoStart || x.d.eintrag.geoEnde)) || {};

await abschnitt("Anlage", async () => {
  const e = await http("/einrichten", { methode: "POST", rumpf: { verwaltung: VERWALTUNG,
    name: `${MARKE} Geo-Betreiber`, bestand: RAUM, rolle: "betreiber", person: null, betrieb: 0 } });
  merken(e.d.zugangscode);
  T.betr = await anmelden(e.d.zugangscode);
  const a = await http("/api/bestand-anlegen", { methode: "POST", token: T.betr, rumpf: { inhalt: { version: 9, stand: 1, session: null, mandanten: [BETRIEB] } } });
  pruef("Wegwerfbetrieb mit Standort angelegt", e.status === 200 && a.status === 200, `einrichten ${e.status} · anlegen ${a.status} ${a.text}`);
  const z = await http("/api/zugaenge", { methode: "POST", token: T.betr, rumpf: { bestand: RAUM,
    eintraege: [["leitung", "l1"], ["planer", "p1"], ...MA.map((i) => ["mitarbeiter", i])]
      .map(([rolle, personId]) => ({ rolle, personId, name: `${MARKE} Geo ${rolle} ${personId}` })) } });
  const codes = (z.d.zugaenge || []).map((x) => merken(x.code));
  pruef("Zugänge angelegt (Leitung, Planung, 11 Beschäftigte)", z.status === 200 && codes.length === 13, `Status ${z.status}`);
  const ids = ["l1", "p1", ...MA];
  for (let i = 0; i < codes.length; i++) T[ids[i]] = await anmelden(codes[i]);
});
if (!T.l1) await abbruch(1, "Die Anlage ist gescheitert — Aufräumprobe ausführen.");

await abschnitt("Geo AUS (Vorgabe)", async () => {
  const aus = merke(await stempeln(T.a1, { art: "start", lat: nord(10), lon: REF.lon, accuracy: 5 }));
  pruef("Geo AUS: Zeit gespeichert", aus.status === 200 && !!aus.d.eintrag && !!aus.d.eintrag.start, `Status ${aus.status}`);
  const g = geoVon(aus);
  pruef("Geo AUS: keine Auswertung (pruefung_aus, keine Entfernung, nicht geprüft)", g.grund === "pruefung_aus"
    && g.entfernungGerundet === null && aus.d.innerhalb === null && aus.d.geprueft === false, JSON.stringify(g));
});

await abschnitt("Einschalten", async () => {
  const schalten = async (t, extra) => {
    const r = await lies(t);
    const b = kopie(r.d.bestand);
    b.mandanten[0].einstellungen = { ...(b.mandanten[0].einstellungen || {}), geoPruefung: true, ...extra };
    return schreib(t, b, r.d.etag);
  };
  const planung = await schalten(T.p1, { geoPruefungBestaetigt: true });
  const nachPlanung = (await lies(T.l1)).d.bestand.mandanten[0].einstellungen || {};
  pruef("Planung kann nicht einschalten", nachPlanung.geoPruefung !== true, `Status ${planung.status}`);
  const ohne = await schalten(T.l1, {});
  pruef("Leitung ohne Bestätigung: abgelehnt (403), bleibt aus", ohne.status === 403
    && ((await lies(T.l1)).d.bestand.mandanten[0].einstellungen || {}).geoPruefung !== true, `Status ${ohne.status}`);
  const mit = await schalten(T.l1, { geoPruefungBestaetigt: true, geoPruefungAktiviertAm: "1999-01-01T00:00:00.000Z", geoPruefungAktiviertVon: "p1" });
  const e = (await lies(T.l1)).d.bestand.mandanten[0].einstellungen || {};
  pruef("Leitung mit Bestätigung: eingeschaltet", mit.status === 200 && e.geoPruefung === true, `Status ${mit.status}`);
  pruef("Server setzt AktiviertAm (heute) und AktiviertVon (l1); mitgeschickte Werte zählen nicht",
    e.geoPruefungAktiviertVon === "l1" && String(e.geoPruefungAktiviertAm || "").slice(0, 10) === new Date().toISOString().slice(0, 10),
    JSON.stringify({ am: e.geoPruefungAktiviertAm, von: e.geoPruefungAktiviertVon }));
  pruef("Bestätigung wird nicht gespeichert", !("geoPruefungBestaetigt" in e));
});

await abschnitt("Standortvalidierung", async () => {
  const setze = async (felder) => {
    const r = await lies(T.l1);
    const b = kopie(r.d.bestand);
    b.mandanten[0].standorte = b.mandanten[0].standorte.map((s) => ({ ...s, ...felder }));
    return (await schreib(T.l1, b, r.d.etag)).status;
  };
  for (const [name, f] of [["lat 450", { lat: 450 }], ["lon -220", { lon: -220 }], ["radius 0", { radius: 0 }], ["radius 10000", { radius: 10000 }]]) {
    const s = await setze(f);
    pruef(`${name}: 422`, s === 422, `Status ${s}`);
  }
  const st = (await lies(T.l1)).d.bestand.mandanten[0].standorte[0];
  pruef("… gespeicherter Standort unverändert", st.lat === REF.lat && st.lon === REF.lon && st.radius === 200, JSON.stringify(st));
});

const E = {};
await abschnitt("Urteile beim Stempeln (Geo AN)", async () => {
  E.innen = merke(await stempeln(T.a2, { art: "start", lat: nord(43), lon: REF.lon, accuracy: 10 }));
  pruef("INNERHALB (43 m, Genauigkeit 10 m)", E.innen.status === 200 && geoVon(E.innen).status === "INNERHALB" && E.innen.d.innerhalb === true,
    JSON.stringify(geoVon(E.innen)));
  E.aussen = merke(await stempeln(T.a3, { art: "start", lat: nord(2137), lon: REF.lon, accuracy: 20 }));
  pruef("AUSSERHALB (2137 m), Zeit trotzdem gespeichert", E.aussen.status === 200 && geoVon(E.aussen).status === "AUSSERHALB"
    && !!E.aussen.d.eintrag.start, JSON.stringify(geoVon(E.aussen)));
  E.grenze = merke(await stempeln(T.a4, { art: "start", lat: nord(251), lon: REF.lon, accuracy: 80 }));
  pruef("NICHT_BEWERTBAR (Grenzfall 251 m ± 80 m)", E.grenze.status === 200 && geoVon(E.grenze).status === "NICHT_BEWERTBAR",
    JSON.stringify(geoVon(E.grenze)));
  E.warn = merke(await stempeln(T.a5, { art: "start", lat: nord(3000), lon: REF.lon, accuracy: 150 }));
  pruef("Genauigkeit über 100 m: Warnung, Urteil bleibt (AUSSERHALB bei 3000 m)", E.warn.status === 200
    && geoVon(E.warn).genauigkeitWarnung === true && geoVon(E.warn).status === "AUSSERHALB", JSON.stringify(geoVon(E.warn)));
  E.grob = merke(await stempeln(T.a6, { art: "start", lat: nord(0), lon: REF.lon, accuracy: 1500 }));
  pruef("Genauigkeit über 1000 m: NICHT_BEWERTBAR, auch am Standort", E.grob.status === 200
    && geoVon(E.grob).status === "NICHT_BEWERTBAR" && geoVon(E.grob).genauigkeitWarnung === true, JSON.stringify(geoVon(E.grob)));
  E.kaputt = merke(await stempeln(T.a7, { art: "start", lat: REF.lat + 360, lon: REF.lon, accuracy: 5 }));
  pruef("ungültige Koordinate: NICHT_BEWERTBAR, Zeit gespeichert", E.kaputt.status === 200
    && geoVon(E.kaputt).status === "NICHT_BEWERTBAR" && !!E.kaputt.d.eintrag.start, JSON.stringify(geoVon(E.kaputt)));
});

await abschnitt("Markierungen", async () => {
  const u = merke(await stempeln(T.a8, { art: "start", lat: nord(10), lon: REF.lon, accuracy: 5 }));
  pruef("ohne geplanten Dienst: UNGEPLANTER_DIENST, Zeit gespeichert", u.status === 200
    && (u.d.markierungen || []).includes("UNGEPLANTER_DIENST"), JSON.stringify(u.d.markierungen));
  const s = merke(await stempeln(T.a9, { art: "ende", lat: nord(10), lon: REF.lon, accuracy: 5 }));
  pruef("Ende ohne Start: START_FEHLT, keine Erfassung erfunden", s.status === 200
    && (s.d.markierungen || []).includes("START_FEHLT") && s.d.erfassung === null && !s.d.eintrag.start, JSON.stringify(s.d.markierungen));
  const danach = await stempeln(T.a9, { art: "start", lat: nord(10), lon: REF.lon, accuracy: 5 });
  pruef("… Start danach: 409 STEMPEL_SCHON_AUSGESTEMPELT", danach.status === 409 && danach.d.code === "STEMPEL_SCHON_AUSGESTEMPELT",
    `Status ${danach.status}`);
});

await abschnitt("Nachtdienst und Altbestand", async () => {
  const n = merke(await stempeln(T.a10, { datum: GESTERN, art: "ende", lat: nord(10), lon: REF.lon, accuracy: 5 }));
  pruef("offener Beginn von gestern (Nachtdienst): Ausstempeln für gestern 200, Erfassung entsteht", n.status === 200
    && !!n.d.erfassung && n.d.erfassung.start === "22:01" && geoVon(n).status === "INNERHALB", `Status ${n.status} ${n.text}`);
  const m = (await lies(T.l1)).d.bestand.mandanten[0];
  const alt = (m.einstempeln || {})[`a11|${GESTERN}`];
  pruef("alter Stempel ohne geoStart/geoEnde bleibt für die Leitung lesbar", !!alt && alt.start === "06:02" && alt.ende === "14:03"
    && alt.geoStart === undefined && alt.geoEnde === undefined, JSON.stringify(alt));
  const eigen = ((await lies(T.a11)).d.bestand.mandanten[0].einstempeln || {})[`a11|${GESTERN}`];
  pruef("… und für die Person selbst", !!eigen && eigen.start === "06:02", JSON.stringify(eigen));
});

await abschnitt("Datenschutz", async () => {
  const gespeichert = (await lies(T.l1)).text;
  const alle = [...antworten, gespeichert].join("\n");
  const roh = [nord(43), nord(2137), nord(251), nord(3000), REF.lat + 360].map((x) => String(x).slice(0, 9));
  pruef("keine Rohkoordinate in Antworten und im gespeicherten Stand", roh.every((x) => !alle.includes(x)),
    roh.filter((x) => alle.includes(x)).join(", "));
  pruef("Entfernung nur gerundet (2137 m → 2100, 43 m → 50), keine exakte Meterzahl",
    geoVon(E.aussen).entfernungGerundet === "2100" && geoVon(E.innen).entfernungGerundet === "50"
      && !alle.includes("2137") && !/\(\d+ m\)/.test(alle),
    `${geoVon(E.aussen).entfernungGerundet} / ${geoVon(E.innen).entfernungGerundet}`);
});

console.log("\nNICHT DURCH DIESE PROBE ABGEDECKT (braucht Browser):");
for (const z of [
  "Stempeluhr in der Oberfläche: Standortabfrage des Browsers, Anzeige von Urteil und Warnung",
  "Reiter „Stempel-Befunde“ und Schalter mit Bestätigungsdialog in der Oberfläche",
  "Anzeige eines offenen Nachtdienstes nach Mitternacht in der Oberfläche (React)",
]) console.log(`  - ${z}`);

const bestanden = ergebnisse.filter((x) => x.ok).length;
console.log(`\n${NAME}: ${bestanden}/${ergebnisse.length} bestanden`);
console.log(`Wegwerfdaten liegen in ${RAUM} — entfernen mit werkzeug/staging-aufraeumen.mjs.`);
process.exit(bestanden === ergebnisse.length && ergebnisse.length > 0 ? 0 : 1);
