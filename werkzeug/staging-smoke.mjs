/* ==========================================================================
   STAGING-SMOKE — feste Probe für das Pre-Production-Gate

   Läuft ausschließlich im Staging-Container gegen den eigenen Server:
     node /app/werkzeug/staging-smoke.mjs

   Ziel ist fest http://127.0.0.1:3000. Es gibt keine Argumente, keine
   Basis-URL aus der Umgebung und keine Weiterleitungen. Wer etwas anderes
   übergeben will, bekommt einen Abbruch — die Probe läuft nur so, wie sie
   hier steht.

   Wegwerfdaten: genau zwei Räume, ppg-gate-a und ppg-gate-b, jeder mit
   einem Betrieb. Alle Namen tragen die Kennzeichnung „PPG-GATE". Weg
   damit nur über werkzeug/staging-aufraeumen.mjs.

   Liegen von einem früheren Lauf noch Reste in diesen beiden Räumen, bricht
   die Probe vor jedem Schreibvorgang ab (Exit 3) — sie übernimmt nichts
   und räumt nichts selbst weg.

   Für die Anlage braucht die Probe den Verwaltungsschlüssel des Servers
   (CENTRIC_ADMIN, im Container ohnehin gesetzt). Er wird nie ausgegeben;
   ebenso keine Zugangscodes, Sitzungsmerkmale oder Feed-Geheimnisse.

   Exit 0: alle Prüfungen bestanden · 1: mindestens eine fehlgeschlagen ·
   2: falscher Aufruf · 3: Altlasten oder unklare Lage, nichts geschrieben.
   ========================================================================== */

import { getStore } from "../server/lib/ablage.mjs";
import { raumBelegt } from "../server/lib/bestand.mjs";

const BASIS = "http://127.0.0.1:3000";
const RAUM_A = "ppg-gate-a";
const RAUM_B = "ppg-gate-b";
const MARKE = "PPG-GATE";
const NAME = "STAGING-SMOKE";

/* --------------------------- Aufruf absichern --------------------------- */

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

/* ------------------------- Geheimnisse schwärzen ------------------------ */

const geheim = new Set([VERWALTUNG]);
const merken = (x) => { if (typeof x === "string" && x.length >= 6) geheim.add(x); return x; };
function sauber(s) {
  let t = String(s);
  for (const g of geheim) t = t.split(g).join("[geschwärzt]");
  return t.replace(/\b[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}\b/g, "[code]")
    .replace(/[A-Za-z0-9_-]{40,}/g, "[merkmal]").slice(0, 300);
}

/* ------------------------------ HTTP fest ------------------------------- */

async function http(pfad, { methode = "GET", token = null, rumpf, kopf = {} } = {}) {
  if (typeof pfad !== "string" || !pfad.startsWith("/") || pfad.startsWith("//"))
    await abbruch(2, "interner Fehler: ungültiger Pfad");
  const url = new URL(pfad, BASIS);
  if (url.origin !== BASIS) await abbruch(2, "interner Fehler: fremdes Ziel");
  const a = await fetch(url, { method: methode, redirect: "manual",
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(rumpf !== undefined ? { "content-type": "application/json" } : {}), ...kopf },
    body: rumpf === undefined ? undefined : (typeof rumpf === "string" ? rumpf : JSON.stringify(rumpf)) });
  const text = await a.text();
  let d = {}; try { d = JSON.parse(text); } catch { /* ICS oder leer */ }
  return { status: a.status, text, d: d && typeof d === "object" ? d : {} };
}

/* ------------------------------- Prüfen --------------------------------- */

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
const HEUTE = tag(0), GESTERN = tag(-1), MORGEN = tag(1), UEBERMORGEN = tag(2);

/* ------------------------------ Altlasten ------------------------------- */

async function altlasten() {
  const store = getStore({ name: "centric", consistency: "strong" });
  const funde = [];
  for (const raum of [RAUM_A, RAUM_B]) if (await raumBelegt(store, raum)) funde.push(`Raum ${raum}`);
  const { blobs } = await store.list({ prefix: "konto:" });
  let konten = 0;
  for (const b of blobs) {
    const k = await store.get(b.key, { type: "json" }).catch(() => null);
    if (k && (k.bestand === RAUM_A || k.bestand === RAUM_B)) konten++;
  }
  if (konten) funde.push(`${konten} Zugang/Zugänge`);
  const feeds = await store.list({ prefix: "feed:" });
  let f = 0;
  for (const b of feeds.blobs) {
    const e = await store.get(b.key, { type: "json" }).catch(() => null);
    if (e && (e.bestand === RAUM_A || e.bestand === RAUM_B)) f++;
  }
  if (f) funde.push(`${f} Kalenderfeed(s)`);
  return funde;
}

/* ------------------------------ Testdaten ------------------------------- */

const person = (id, rolle, extra = {}) => ({ id, vorname: "PPG", nachname: `Gate-${id}`, rolle,
  bereich: rolle === "leitung" || rolle === "planer" || rolle === "betriebsrat" ? "ALLE" : "e1",
  status: "aktiv", zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }], ...extra });
const betrieb = (id, name, personen, extra = {}) => ({ id, name, status: "aktiv", einstellungen: {},
  einheitLabel: "Wohnbereich", einheiten: [{ id: "e1", name: "WB 1" }],
  dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00" }],
  personen, abweichungen: {}, einstempeln: {}, erfassung: {}, anfragen: [], nachrichten: [], protokoll: [], ...extra });

const BETRIEB_A = betrieb(`${RAUM_A}-m`, `${MARKE} Betrieb A (Wegwerf)`,
  [person("l", "leitung"), person("p", "planer"), person("m1", "mitarbeiter", { notfallkontakt: `${MARKE}-NOTFALL-ALT` }),
    person("m2", "mitarbeiter", { email: "ppg-gate-m2@example.invalid", geburtstag: "1990-01-01" }),
    person("f", "mitarbeiter"), person("r", "betriebsrat")],
  { tarif: "pro", preisgestaltung: { sonderpreis: { betrag: 1 } }, rabattGrund: `${MARKE} Rabatt`,
    notiz: `${MARKE}-INTERN-ALT`,
    abweichungen: { [`m1|${HEUTE}`]: "F", [`m2|${HEUTE}`]: "F" },
    einstempeln: { [`m1|${GESTERN}`]: { start: "06:01", ende: "14:02" }, [`m2|${GESTERN}`]: { start: "06:03", ende: "14:04" } },
    erfassung: { [`m1|${GESTERN}`]: { start: "06:01", ende: "14:02", bestaetigt: true, grund: "" },
      [`m2|${GESTERN}`]: { start: "06:03", ende: "14:04", bestaetigt: true, grund: "" } } });
const BETRIEB_B = betrieb(`${RAUM_B}-m`, `${MARKE} Betrieb B (Wegwerf)`, [person("lb", "leitung"), person("mb", "mitarbeiter")]);
const raumInhalt = (m) => ({ version: 9, stand: 1, session: null, mandanten: [m] });

/* ================================ Lauf ================================== */

console.log(`${NAME} gegen ${BASIS} — Räume ${RAUM_A}, ${RAUM_B}`);

const gesund = await http("/gesund").catch(() => null);
if (!gesund || gesund.status !== 200) await abbruch(1, "/gesund antwortet nicht mit 200.");

const reste = await altlasten();
if (reste.length) await abbruch(3, `Altlasten aus einem früheren Lauf (${reste.join(", ")}). `
  + "Nichts angelegt. Erst die Aufräumprobe ausführen (centric-staging-probe cleanup).");

pruef("/gesund: 200, status ok", gesund.status === 200 && gesund.d.status === "ok", gesund.text);

const T = {};
const anmelden = async (code) => {
  const a = await http("/api/anmelden", { methode: "POST", rumpf: { zugangscode: code } });
  return { status: a.status, token: merken(a.d.token || null), rolle: a.d.rolle || null };
};
const lies = (t, q = "") => http(`/api/bestand${q}`, { token: t });
const schreib = (t, bestand, etag) => http("/api/bestand", { methode: "PUT", token: t, rumpf: { bestand, etag, durch: MARKE } });
const C = {};

await abschnitt("Anlage der Wegwerfbetriebe", async () => {
  const e = await http("/einrichten", { methode: "POST", rumpf: { verwaltung: VERWALTUNG,
    name: `${MARKE} Betreiber`, bestand: RAUM_A, rolle: "betreiber", person: null, betrieb: 0 } });
  merken(e.d.zugangscode);
  pruef("Betreiberzugang für den Wegwerfraum angelegt", e.status === 200 && !!e.d.zugangscode, `Status ${e.status}`);
  T.betr = (await anmelden(e.d.zugangscode)).token;
  const a = await http("/api/bestand-anlegen", { methode: "POST", token: T.betr, rumpf: { inhalt: raumInhalt(BETRIEB_A) } });
  const b = await http("/api/bestand-anlegen", { methode: "POST", token: T.betr, rumpf: { bestand: RAUM_B, inhalt: raumInhalt(BETRIEB_B) } });
  pruef("Raum A und Raum B angelegt", a.status === 200 && b.status === 200, `A ${a.status} ${a.text} · B ${b.status} ${b.text}`);
  const za = await http("/api/zugaenge", { methode: "POST", token: T.betr, rumpf: { bestand: RAUM_A, eintraege: [
    ["leitung", "l"], ["leitung", "l"], ["planer", "p"], ["mitarbeiter", "m1"], ["mitarbeiter", "m2"],
    ["mitarbeiter", "f"], ["betriebsrat", "r"]].map(([rolle, personId]) => ({ rolle, personId, name: `${MARKE} A ${rolle} ${personId}` })) } });
  const zb = await http("/api/zugaenge", { methode: "POST", token: T.betr, rumpf: { bestand: RAUM_B, eintraege: [
    ["leitung", "lb"], ["mitarbeiter", "mb"]].map(([rolle, personId]) => ({ rolle, personId, name: `${MARKE} B ${rolle} ${personId}` })) } });
  for (const z of [...(za.d.zugaenge || []), ...(zb.d.zugaenge || [])]) merken(z.code);
  pruef("Zugänge für A (7) und B (2) angelegt", za.status === 200 && zb.status === 200
    && (za.d.zugaenge || []).length === 7 && (zb.d.zugaenge || []).length === 2, `A ${za.status} · B ${zb.status}`);
  const [l, l2, p, m1, m2, f, r] = za.d.zugaenge.map((z) => z.code);
  const [lb, mb] = zb.d.zugaenge.map((z) => z.code);
  Object.assign(C, { l, l2, p, m1, m2, f, r, lb, mb });
});
if (!C.l) await abbruch(1, "Die Anlage ist gescheitert — weitere Prüfungen ergeben keinen Sinn. Aufräumprobe ausführen.");

await abschnitt("Code-Anmeldung, Login und Logout (F1)", async () => {
  const a = await anmelden(C.l);
  pruef("Code-Anmeldung der Leitung: 200, Rolle leitung", a.status === 200 && !!a.token && a.rolle === "leitung", `Status ${a.status}`);
  T.l = a.token;
  for (const k of ["p", "m1", "m2", "f", "r", "lb", "mb"]) T[k] = (await anmelden(C[k])).token;
  pruef("Anmeldung aller Rollen (Planung, Beschäftigte, Betriebsrat, Leitung B)",
    ["p", "m1", "m2", "f", "r", "lb", "mb"].every((k) => !!T[k]));
  const falsch = await anmelden("PPGX-PPGX-PPGX");
  pruef("unbekannter Zugangscode: 401", falsch.status === 401 && !falsch.token, `Status ${falsch.status}`);

  const g1 = (await anmelden(C.l2)).token;
  const g2 = (await anmelden(C.l2)).token;
  const ab = await http("/api/abmelden", { methode: "POST", token: g1, rumpf: {} });
  const nach = await lies(g1);
  const kal = await http("/kalender/einrichten", { methode: "POST", token: g1, rumpf: {} });
  const zweit = await lies(g2);
  pruef("Abmelden: 200, danach 401 auf /api/bestand und /kalender/einrichten", ab.status === 200 && nach.status === 401
    && kal.status === 401, `abmelden ${ab.status} · bestand ${nach.status} · kalender ${kal.status}`);
  pruef("… zweites Gerät derselben Anmeldung bleibt gültig", zweit.status === 200, `Status ${zweit.status}`);
});

await abschnitt("Unbekannte Rolle und unbekanntes Merkmal (F3)", async () => {
  const z = await http("/api/zugaenge", { methode: "POST", token: T.betr, rumpf: { bestand: RAUM_A,
    eintraege: [{ rolle: "ppg-fantasie", personId: null, name: `${MARKE} A unbekannte Rolle` }] } });
  const code = merken((z.d.zugaenge || [])[0] && z.d.zugaenge[0].code);
  const an = code ? await anmelden(code) : { status: z.status, token: null };
  pruef("unbekannte Rolle: Anlage abgewiesen oder Anmeldung ohne Sitzung", !an.token && an.status >= 400,
    `zugaenge ${z.status} · anmelden ${an.status}`);
  const erfunden = "ppg" + "0".repeat(61);
  const b = await lies(erfunden);
  const k = await http("/kalender/einrichten", { methode: "POST", token: erfunden, rumpf: {} });
  const s = await http("/api/stempeln", { methode: "POST", token: erfunden, rumpf: { datum: HEUTE, art: "start" } });
  pruef("unbekanntes Merkmal: 401 auf Bestand, Kalender und Stempeln", b.status === 401 && k.status === 401 && s.status === 401,
    `${b.status}/${k.status}/${s.status}`);
});

await abschnitt("Rollen", async () => {
  const sP = await http("/api/sicherung", { methode: "POST", token: T.p, rumpf: {} });
  pruef("Planung: keine Sicherung (403)", sP.status === 403, `Status ${sP.status}`);
  const vM = await http("/api/vollausgabe", { token: T.m1 });
  pruef("Beschäftigte: keine Vollausgabe (403)", vM.status === 403, `Status ${vM.status}`);
  const zP = await http("/api/zugang-sperren", { methode: "POST", token: T.p, rumpf: { kennung: "00000000" } });
  pruef("Planung: keine Zugänge zurückziehen (403)", zP.status === 403, `Status ${zP.status}`);
  const rl = await http("/api/raum-loeschen", { methode: "POST", token: T.l, rumpf: { bestand: RAUM_B, bestaetigung: RAUM_B } });
  const zu = await http("/api/zugaenge", { methode: "POST", token: T.l, rumpf: { bestand: RAUM_B, eintraege: [{ rolle: "leitung", personId: "lb" }] } });
  pruef("Leitung A: Raum B löschen und Zugänge für B anlegen abgewiesen (403)", rl.status === 403 && zu.status === 403,
    `löschen ${rl.status} · zugaenge ${zu.status}`);
  const r = await lies(T.m1);
  const pers = ((r.d.bestand || {}).mandanten || [{}])[0].personen || [];
  const fremd = pers.find((x) => x.id === "m2");
  const fuerLeitung = (await lies(T.l)).d.bestand.mandanten[0].personen.find((x) => x.id === "m2");
  pruef("Beschäftigte lesen 200 ohne fremde Stammdaten (E-Mail, Geburtstag); die Leitung sieht sie",
    r.status === 200 && !!fremd && fremd.email === undefined && fremd.geburtstag === undefined
      && fuerLeitung.email === "ppg-gate-m2@example.invalid", `Status ${r.status}`);
  const w = kopie(r.d.bestand);
  const ich = w.mandanten[0].personen.find((x) => x.id === "m1");
  if (ich) ich.rolle = "leitung";
  await schreib(T.m1, w, r.d.etag);
  const nachher = (await lies(T.l)).d.bestand.mandanten[0].personen.find((x) => x.id === "m1");
  pruef("Beschäftigte können sich nicht zur Leitung machen", nachher && nachher.rolle === "mitarbeiter", nachher && nachher.rolle);
});

await abschnitt("Lesen und erlaubtes Speichern", async () => {
  const r = await lies(T.l);
  pruef("Leitung liest den eigenen Betrieb", r.status === 200 && r.d.bestand.mandanten.length === 1
    && r.d.bestand.mandanten[0].id === BETRIEB_A.id, `Status ${r.status}`);
  const b = kopie(r.d.bestand);
  b.mandanten[0].personen.push(person("neu", "mitarbeiter", { vorname: "Ömer-Jürgen", nachname: "Äßling-Weiß" }));
  b.mandanten[0].abweichungen[`neu|${MORGEN}`] = "F";
  const w = await schreib(T.l, b, r.d.etag);
  const wieder = (await lies(T.l)).d.bestand.mandanten[0];
  const neu = wieder.personen.find((x) => x.id === "neu");
  pruef("Person mit Umlauten anlegen und Dienst eintragen: 200, nach dem Neuladen byte-gleich",
    w.status === 200 && neu && neu.vorname === "Ömer-Jürgen" && neu.nachname === "Äßling-Weiß"
      && wieder.abweichungen[`neu|${MORGEN}`] === "F", `Status ${w.status} ${w.text}`);
});

await abschnitt("Mandantentrennung (zwei Wegwerfbetriebe)", async () => {
  const bVorher = (await lies(T.lb)).text;
  const fremdQ = await lies(T.l, `?bestand=${RAUM_B}`);
  pruef("Lesen mit fremdem Raum: bleibt in A", fremdQ.status === 200
    && fremdQ.d.bestand.mandanten.every((m) => m.id === BETRIEB_A.id), fremdQ.d.bestand && fremdQ.d.bestand.mandanten.map((m) => m.id).join(","));
  const rA = await lies(T.l);
  const rB = await lies(T.lb);
  const angriff = kopie(rA.d.bestand);
  angriff.mandanten = [{ ...kopie(rB.d.bestand.mandanten[0]), name: `${MARKE} GEKAPERT` }];
  const w = await schreib(T.l, angriff, rA.d.etag);
  pruef("Leitung A schreibt Betrieb B: abgewiesen", w.status === 403 || w.status === 422, `Status ${w.status}`);
  const v = await http("/api/vollausgabe", { token: T.l });
  pruef("Vollausgabe der Leitung A ohne Betrieb B", v.status === 200 && !v.text.includes("Betrieb B") && !v.text.includes(RAUM_B + "-m"),
    `Status ${v.status}`);
  const gB = merken((await http("/kalender/einrichten", { methode: "POST", token: T.mb, rumpf: {} })).d.geheim);
  await http("/kalender/daten", { methode: "POST", token: T.mb, rumpf: { geheim: gB, name: "B-Original", betrieb: "B",
    termine: [{ id: "b-1", datum: MORGEN, von: "06:00", endDatum: MORGEN, bisZeit: "14:00", ganztags: false, titel: "B-Original", text: "", ort: "" }] } });
  const dFremd = await http("/kalender/daten", { methode: "POST", token: T.m1, rumpf: { geheim: gB, name: "X", betrieb: "X",
    termine: [{ id: "x-1", datum: MORGEN, von: "06:00", endDatum: MORGEN, bisZeit: "14:00", ganztags: false, titel: "ÜBERSCHRIEBEN", text: "", ort: "" }] } });
  const feedB = await http(`/kalender/feed/${gB}.ics`);
  pruef("Kalenderdaten mit fremdem Verweis: 404, Feed von B unverändert", dFremd.status === 404
    && feedB.status === 200 && feedB.text.includes("B-Original") && !feedB.text.includes("ÜBERSCHRIEBEN"), `Status ${dFremd.status}`);
  const bNachher = (await lies(T.lb)).text;
  pruef("Betrieb B nach allen Versuchen bit-gleich", bVorher === bNachher);
});

await abschnitt("Zeiterfassung Start/Ende und E1-Datenschutz", async () => {
  const s = await http("/api/stempeln", { methode: "POST", token: T.m2, rumpf: { datum: HEUTE, art: "start" } });
  const e = await http("/api/stempeln", { methode: "POST", token: T.m2, rumpf: { datum: HEUTE, art: "ende" } });
  pruef("Beschäftigte stempelt Start und Ende: 200, Erfassung entsteht", s.status === 200 && e.status === 200
    && !!e.d.erfassung && e.d.erfassung.bestaetigt === true, `${s.status}/${e.status}`);
  const nochmal = await http("/api/stempeln", { methode: "POST", token: T.m2, rumpf: { datum: HEUTE, art: "start" } });
  pruef("zweiter Start am selben Tag: 409, Gestempeltes bleibt", nochmal.status === 409, `Status ${nochmal.status}`);
  const leitung = (await lies(T.l)).d.bestand.mandanten[0];
  pruef("Leitung sieht die Erfassung der Beschäftigten", !!(leitung.erfassung || {})[`m2|${HEUTE}`]
    && !!(leitung.einstempeln || {})[`m2|${HEUTE}`]);
  const m1 = (await lies(T.m1)).d.bestand.mandanten[0];
  const schluessel = [...Object.keys(m1.erfassung || {}), ...Object.keys(m1.einstempeln || {})];
  pruef("E1: Beschäftigte sieht nur die eigene Ist-Zeit", schluessel.length > 0 && schluessel.every((k) => k.startsWith("m1|")),
    schluessel.join(","));
  const r = (await lies(T.r)).d.bestand.mandanten[0];
  const rk = [...Object.keys(r.erfassung || {}), ...Object.keys(r.einstempeln || {})];
  pruef("E1: Betriebsrat sieht keine personenbezogene Ist-Zeit", rk.length === 0, rk.join(","));
  const plan = (await lies(T.m1)).d.bestand.mandanten[0].abweichungen || {};
  pruef("E1: keine Plan-Zeit als Ist-Zeit (eigener Dienst heute geplant, ohne Stempel keine Erfassung)",
    plan[`m1|${HEUTE}`] === "F" && !(m1.erfassung || {})[`m1|${HEUTE}`] && !(m1.einstempeln || {})[`m1|${HEUTE}`],
    JSON.stringify({ plan: plan[`m1|${HEUTE}`] }));
});

await abschnitt("Kalender gültig", async () => {
  T.gM1 = merken((await http("/kalender/einrichten", { methode: "POST", token: T.m1, rumpf: {} })).d.geheim);
  const termine = [
    { id: "g-dienst", datum: MORGEN, von: "06:00", endDatum: MORGEN, bisZeit: "14:00", ganztags: false, titel: "Frühdienst Übergabe", text: "Größe Ä", ort: "Wohnbereich Süd" },
    { id: "g-nacht", datum: MORGEN, von: "22:00", endDatum: UEBERMORGEN, bisZeit: "06:00", ganztags: false, titel: "Nachtdienst", text: "", ort: "" },
    { id: "g-ganz", datum: MORGEN, bis: UEBERMORGEN, ganztags: true, titel: "Urlaub", text: "", ort: "" },
    { id: "g-24", datum: UEBERMORGEN, von: "16:00", endDatum: UEBERMORGEN, bisZeit: "24:00", ganztags: false, titel: "Spätdienst", text: "", ort: "" },
  ];
  const d = await http("/kalender/daten", { methode: "POST", token: T.m1, rumpf: { geheim: T.gM1, name: "PPG Gate", betrieb: "Gate A", termine } });
  const f = await http(`/kalender/feed/${T.gM1}.ics`);
  T.feedM1 = f.text;
  const folgetag = new Date(`${UEBERMORGEN}T00:00:00Z`); folgetag.setUTCDate(folgetag.getUTCDate() + 1);
  const mitternacht = `DTEND;TZID=Europe/Berlin:${folgetag.toISOString().slice(0, 10).replace(/-/g, "")}T000000`;
  pruef("Dienst, Nachtdienst, ganztägig, 24:00: 200 und im Feed", d.status === 200 && f.status === 200
    && f.text.includes("BEGIN:VCALENDAR") && (f.text.match(/BEGIN:VEVENT/g) || []).length === 4, `daten ${d.status} · feed ${f.status}`);
  pruef("24:00 wird 00:00 des Folgetags", f.text.includes(mitternacht));
  pruef("Nachtdienst endet am Folgetag", f.text.includes(`DTEND;TZID=Europe/Berlin:${UEBERMORGEN.replace(/-/g, "")}T060000`));
  pruef("ICS mit Umlauten (UTF-8)", f.text.includes("Frühdienst Übergabe") && f.text.includes("Wohnbereich Süd"));
});

await abschnitt("Kalender ungültig", async () => {
  const basis = { id: "u-1", datum: MORGEN, von: "06:00", endDatum: MORGEN, bisZeit: "14:00", ganztags: false, titel: "U", text: "", ort: "" };
  const faelle = [
    ["fehlender Titel", { ...basis, titel: "" }, "titel"],
    ["30. Februar", { ...basis, datum: "2027-02-30", endDatum: "2027-02-30" }, "datum"],
    ["Monat 13", { ...basis, datum: "2027-13-01", endDatum: "2027-13-01" }, "datum"],
    ["Datum als Wort", { ...basis, datum: "morgen" }, "datum"],
    ["25:00", { ...basis, bisZeit: "25:00" }, "bisZeit"],
    ["Minute 60", { ...basis, von: "06:60" }, "von"],
    ["Kennung mit Zeilenumbruch", { ...basis, id: "u\n1" }, "id"],
    ["ungültiger Termin (Zahl)", 42, "termin"],
  ];
  const ergebnis = [];
  for (const [name, t, feld] of faelle) {
    const a = await http("/kalender/daten", { methode: "POST", token: T.m1, rumpf: { geheim: T.gM1, name: "PPG Gate", betrieb: "Gate A", termine: [t] } });
    ergebnis.push([name, a.status === 400 && a.d.feld === feld, `${a.status} ${a.d.feld || ""}`]);
  }
  const ohne = await http("/kalender/daten", { methode: "POST", token: T.m1, rumpf: { name: "PPG Gate", betrieb: "Gate A", termine: [basis] } });
  ergebnis.push(["fehlendes Geheimnis", ohne.status === 400, `${ohne.status}`]);
  const kaputt = await http("/kalender/daten", { methode: "POST", token: T.m1, rumpf: "{ kaputt" });
  ergebnis.push(["kaputtes JSON", kaputt.status === 400, `${kaputt.status}`]);
  const falsch = ergebnis.filter(([, ok]) => !ok);
  pruef(`${ergebnis.length} ungültige Eingaben: jeweils 400 mit Feld`, falsch.length === 0, falsch.map(([n, , d]) => `${n}: ${d}`).join("; "));
  const f = await http(`/kalender/feed/${T.gM1}.ics`);
  pruef("… der gespeicherte Feed bleibt unverändert", f.status === 200
    && f.text.replace(/DTSTAMP:\S+/g, "") === T.feedM1.replace(/DTSTAMP:\S+/g, ""));
});

await abschnitt("Kalender-Manipulation", async () => {
  const t = { id: "m-1", datum: MORGEN, von: "06:00", endDatum: MORGEN, bisZeit: "14:00", ganztags: false,
    titel: "Dienst\r\nBEGIN:VEVENT\r\nSUMMARY:Eingeschleust", text: "a\rb", ort: "Ort\nATTENDEE:mailto:x@example.org" };
  const d = await http("/kalender/daten", { methode: "POST", token: T.m1, rumpf: { geheim: T.gM1, name: "PPG Gate", betrieb: "Gate A", termine: [t] } });
  const f = await http(`/kalender/feed/${T.gM1}.ics`);
  const zeilen = f.text.split("\r\n");
  pruef("Zeilenumbrüche in Titel, Text und Ort maskiert, keine eingeschleusten ICS-Zeilen", d.status === 200 && f.status === 200
    && !zeilen.some((z) => z.startsWith("SUMMARY:Eingeschleust") || z.startsWith("ATTENDEE"))
    && zeilen.filter((z) => z === "BEGIN:VEVENT").length === 1 && f.text.includes("Dienst\\nBEGIN:VEVENT\\nSUMMARY:Eingeschleust"),
  `daten ${d.status}`);
});

await abschnitt("D1g: Feed-Widerruf bei Autoritätsentzug, Reaktivierung", async () => {
  const termine = [{ id: "f-1", datum: MORGEN, von: "06:00", endDatum: MORGEN, bisZeit: "14:00", ganztags: false, titel: "Früh", text: "", ort: "" }];
  const alt = merken((await http("/kalender/einrichten", { methode: "POST", token: T.f, rumpf: {} })).d.geheim);
  await http("/kalender/daten", { methode: "POST", token: T.f, rumpf: { geheim: alt, name: "F", betrieb: "Gate A", termine } });
  pruef("aktiver Feed: 200", (await http(`/kalender/feed/${alt}.ics`)).status === 200);
  const status = async (wert) => {
    const r = await lies(T.l);
    const b = kopie(r.d.bestand);
    b.mandanten[0].personen.find((x) => x.id === "f").status = wert;
    return (await schreib(T.l, b, r.d.etag)).status;
  };
  const sperren = await status("gesperrt");
  const nachSperre = await http(`/kalender/feed/${alt}.ics`);
  pruef("Person gesperrt: Feed 404", sperren === 200 && nachSperre.status === 404, `sperren ${sperren} · feed ${nachSperre.status}`);
  const aktiv = await status("aktiv");
  const nachReakt = await http(`/kalender/feed/${alt}.ics`);
  pruef("wieder aktiv: der alte Verweis bleibt 404", aktiv === 200 && nachReakt.status === 404, `aktiv ${aktiv} · feed ${nachReakt.status}`);
  T.f = (await anmelden(C.f)).token;
  const neu = merken((await http("/kalender/einrichten", { methode: "POST", token: T.f, rumpf: {} })).d.geheim);
  await http("/kalender/daten", { methode: "POST", token: T.f, rumpf: { geheim: neu, name: "F", betrieb: "Gate A", termine } });
  const fNeu = await http(`/kalender/feed/${neu}.ics`);
  pruef("neuer Feed nach Reaktivierung: 200, alter weiter 404", !!neu && neu !== alt && fNeu.status === 200
    && (await http(`/kalender/feed/${alt}.ics`)).status === 404, `feed ${fNeu.status}`);
  const unbekannt = await http(`/kalender/feed/${"0".repeat(32)}.ics`);
  pruef("Antwort für widerrufen gleich der für unbekannt", unbekannt.status === nachReakt.status && unbekannt.text === nachReakt.text);
});

await abschnitt("B2: Preisansicht (API)", async () => {
  const l = (await lies(T.l)).d.bestand.mandanten[0];
  const p = (await lies(T.p)).d.bestand.mandanten[0];
  pruef("Leitung liest die Preisgrundlage (tarif, preisgestaltung, rabattGrund)", l.tarif === "pro"
    && !!l.preisgestaltung && l.rabattGrund === `${MARKE} Rabatt`, JSON.stringify({ t: l.tarif, r: l.rabattGrund }));
  pruef("Planung liest keine Preisgrundlage", p.tarif === undefined && p.preisgestaltung === undefined && p.rabattGrund === undefined,
    JSON.stringify({ t: p.tarif, r: p.rabattGrund }));
  pruef("weder Leitung noch Planung lesen die interne Betreibernotiz", l.notiz === undefined && p.notiz === undefined);
});

await abschnitt("B1: Wiederherstellung schützt Verborgenes", async () => {
  const s = await http("/api/sicherung", { methode: "POST", token: T.l, rumpf: {} });
  pruef("Leitung legt eine Sicherung an", s.status === 200 && !!s.d.marke, `Status ${s.status}`);
  /* Der Notfallkontakt ist ein Selbstservice-Feld, das die Leitung nicht
     sieht (VOLL_PERSON_WEG). Die Beschäftigte ändert ihn nach der Sicherung;
     die Wiederherstellung durch die Leitung darf ihn nicht zurückdrehen. */
  const rm = await lies(T.m1);
  const bm = kopie(rm.d.bestand);
  bm.mandanten[0].personen.find((x) => x.id === "m1").notfallkontakt = `${MARKE}-NOTFALL-NEU`;
  const wm = await schreib(T.m1, bm, rm.d.etag);
  const jetzt = (await lies(T.m1)).d.bestand.mandanten[0].personen.find((x) => x.id === "m1");
  const leitungSieht = (await lies(T.l)).d.bestand.mandanten[0].personen.find((x) => x.id === "m1");
  pruef("Beschäftigte ändert danach ihren Notfallkontakt; die Leitung sieht ihn nicht", wm.status === 200
    && jetzt.notfallkontakt === `${MARKE}-NOTFALL-NEU` && leitungSieht.notfallkontakt === undefined, `Status ${wm.status}`);
  const rl = await lies(T.l);
  const bl = kopie(rl.d.bestand);
  bl.mandanten[0].name = `${MARKE} Betrieb A (verändert)`;
  await schreib(T.l, bl, rl.d.etag);
  const w = await http("/api/wiederherstellen", { methode: "POST", token: T.l, rumpf: { marke: s.d.marke, etag: (await lies(T.l)).d.etag } });
  const nachL = (await lies(T.l)).d.bestand.mandanten[0];
  pruef("Wiederherstellung: 200, Name aus der Sicherung", w.status === 200 && nachL.name === BETRIEB_A.name, `Status ${w.status} ${w.text}`);
  const nachM = (await lies(T.m1)).d.bestand.mandanten[0].personen.find((x) => x.id === "m1");
  pruef("… der verborgene Notfallkontakt bleibt beim jetzigen Stand (nicht zurückgedreht)",
    nachM.notfallkontakt === `${MARKE}-NOTFALL-NEU`, String(nachM.notfallkontakt));
  pruef("… Vertragsfelder unverändert (tarif)", nachL.tarif === "pro", String(nachL.tarif));
});

/* ------------------------------ Ergebnis -------------------------------- */

console.log("\nNICHT DURCH DIESE PROBE ABGEDECKT (braucht Browser oder Eingriff in die Ablage):");
for (const z of [
  "Oberfläche: Dialog „Person hinzufügen“ (Fokus, Tab-Reihenfolge, Fokus zurück), Ansichten ohne Fehlerseite und ohne Konsolenfehler",
  "Mobilansicht 390 px, Service Worker, Manifest",
  "Konto-Anmeldung mit E-Mail und Passwort (braucht eine bestätigte Adresse)",
  "R1/F4: Sitzungsinterna (as:, t:, az:, ta:) — nur über die Ablage sichtbar",
  "Kalender-Fehlerlogging (500) — braucht eine absichtlich beschädigte Ablage",
  "Ablage-Sicherung mit werkzeug/ablage-sicherung.mjs — eigener Gate-Schritt (centric-staging-backup)",
]) console.log(`  - ${z}`);

const bestanden = ergebnisse.filter((x) => x.ok).length;
console.log(`\n${NAME}: ${bestanden}/${ergebnisse.length} bestanden`);
console.log(`Wegwerfdaten liegen in ${RAUM_A} und ${RAUM_B} — entfernen mit werkzeug/staging-aufraeumen.mjs.`);
process.exit(bestanden === ergebnisse.length && ergebnisse.length > 0 ? 0 : 1);
