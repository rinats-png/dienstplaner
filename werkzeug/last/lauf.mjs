/* ==========================================================================
   LASTTEST (WP-28) — Grenzwerte aus dem Testplan, Abschnitt 3.6

     node werkzeug/last/lauf.mjs [--profil kurz|voll] [--aus ergebnis.json] [--nur S1,S3]

   Läuft NUR lokal: startet einen eigenen server.mjs auf 127.0.0.1 mit einer
   Wegwerfablage und synthetischen Daten (Personen „p1“ …, keine echten
   Menschen). Es gibt keinen Parameter für ein fremdes Ziel — nie gegen
   Produktion oder einen VPS.

   Szenarien:
     S0  Skalierungsreihe: Kosten eines Stempels und eines Lesens je Betriebsgröße
     S1  Schichtwechsel: 200 Stempel/min, Bündel zu 10 (Ziel: p95 < 500 ms, 0 Verluste)
         — auf zwei Betriebe verteilt (Schreibbremse 120/min je Raum) und ein
         Gegenversuch mit einem Betrieb
     S2  50 Planende, PUT alle 30 s, fünf Räume, einer mit 2000 Personen
         (Ziel: p95 < 1,5 s, nur echte 409 — hier getrennte Monate, also 0)
     S3  Bestand nahe RUMPF_MAX (~5,5 MB): GET je Rolle (Ziel: p95 < 2 s, Speicher stabil)
     S4  Anmeldung mit Bremse: gültige Codes aus vielen Herkünften, Rateversuche
     S5  Mischlast mehrerer Mandanten parallel, dazu ein Sicherungslauf (in der Last und danach ruhig)
     S6  Breite: viele kleine Betriebe (50 Personen) — wie verhalten sich Stempeln, Lesen und
         Dateizahl, wenn die Ablage von 50 auf 200 und 600 Betriebe wächst?

   Gemessen: p50/p95/p99, Fehlerquote, Statuscodes, Event-Loop-Verzögerung und
   Speicher des Servers (Messfühler), Dateien und Bytes der Ablage je Store.

   Nach WP-17 (Serverdatum beim Stempeln) unverändert erneut ausführen:
   S1/S5 schicken das Datum weiterhin mit; nimmt der Server es nicht mehr an
   oder ignoriert er es, gilt der Stempel trotzdem als Erfolg, solange 200
   kommt und er gespeichert ist.
   ========================================================================== */

import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile, readFile, readdir, stat } from "node:fs/promises";
import { tmpdir, cpus, totalmem, platform } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const arg = (n, v) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : v; };
const PROFIL = arg("--profil", "kurz");
const AUS = arg("--aus", null);
const NUR = (arg("--nur", "") || "").split(",").filter(Boolean);
const laeuft = (s) => !NUR.length || NUR.includes(s);
const P = PROFIL === "voll"
  ? { s1Min: 10, s2Min: 5, s3Min: 2, s4Sek: 60, s5Min: 3, s3Leser: 20, s6Stufen: [50, 200, 600] }
  : { s1Min: 3, s2Min: 2, s3Min: 1, s4Sek: 30, s5Min: 1, s3Leser: 10, s6Stufen: [50, 150, 300] };

const PFEFFER = "lasttest-pfeffer-nur-synthetisch-0123456789";
const HEUTE = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());
const PLANJAHR = String(Number(HEUTE.slice(0, 4)) + 1);
const warte = (ms) => new Promise((w) => setTimeout(w, ms));

/* ------------------------------------------------------------------ */
/* Statistik                                                           */

function auswerten(proben) {
  const z = proben.map((p) => p.ms).sort((a, b) => a - b);
  const q = (x) => (z.length ? Math.round(z[Math.min(z.length - 1, Math.floor(x * z.length))]) : null);
  const status = {};
  for (const p of proben) status[p.status] = (status[p.status] || 0) + 1;
  const fehler = proben.filter((p) => !(p.status >= 200 && p.status < 300)).length;
  return { n: z.length, p50: q(0.5), p95: q(0.95), p99: q(0.99), max: z.length ? Math.round(z[z.length - 1]) : null,
    fehlerquote: z.length ? Math.round((fehler / z.length) * 10000) / 100 : 0, status };
}

let messdatei;
async function messung(von, bis) {
  let zeilen = [];
  try { zeilen = (await readFile(messdatei, "utf8")).trim().split("\n").map((l) => JSON.parse(l)); } catch { /* leer */ }
  const im = zeilen.filter((m) => m.t >= von && m.t <= bis);
  if (!im.length) return null;
  const max = (k) => Math.max(...im.map((m) => m[k]));
  const fsSumme = {};
  for (const m of im) for (const [k, v] of Object.entries(m.fs || {})) {
    const z = (fsSumme[k] ||= { n: 0, ms: 0 }); z.n += v.n; z.ms += v.ms;
  }
  for (const v of Object.values(fsSumme)) v.msJeAufruf = v.n ? Math.round((v.ms / v.n) * 100) / 100 : 0;
  const cpus = im.map((m) => m.cpu || 0);
  return { eldP99Max: max("eldP99"), eldMax: max("eldMax"), rssStart: im[0].rss, rssEnde: im[im.length - 1].rss,
    rssMax: max("rss"), heapMax: max("heap"), sekunden: im.length,
    cpuMittel: Math.round(cpus.reduce((a, b) => a + b, 0) / cpus.length), cpuMax: Math.max(...cpus), fs: fsSumme };
}

async function ablageGroesse(daten) {
  const aus = {};
  let dateien = 0, bytes = 0;
  for (const e of await readdir(daten, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    let n = 0, b = 0;
    for (const f of await readdir(path.join(daten, e.name))) { n++; b += (await stat(path.join(daten, e.name, f))).size; }
    aus[e.name] = { dateien: n, mb: Math.round((b / 1048576) * 100) / 100 };
    dateien += n; bytes += b;
  }
  return { dateien, mb: Math.round((bytes / 1048576) * 100) / 100, stores: aus };
}

/* ------------------------------------------------------------------ */
/* Synthetische Daten (vor dem Serverstart, direkt in die Ablage)      */

const person = (id, rolle = "mitarbeiter") => ({ id, vorname: "Last", nachname: id, rolle, bereich: "e1", status: "aktiv",
  zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }], qualifikationen: [] });

function betrieb(raum, anzahl, abweichungenTage = 0) {
  const personen = Array.from({ length: anzahl }, (_, i) => person(`p${i + 1}`));
  personen.push(person("leitung1", "leitung"), person("planer1", "planer"), person("sv1", "subplaner"),
    person("br1", "betriebsrat"));
  const abweichungen = {};
  if (abweichungenTage) {
    const start = new Date(`${PLANJAHR}-01-01T00:00:00Z`);
    for (let t = 0; t < abweichungenTage; t++) {
      const tag = new Date(start.getTime() + t * 86400000).toISOString().slice(0, 10);
      for (let i = 1; i <= anzahl; i++) abweichungen[`p${i}|${tag}`] = (i + t) % 3 === 0 ? "S" : "F";
    }
  }
  return { version: 9, mandanten: [{ id: "m1", name: `Lastbetrieb ${raum}`, status: "aktiv", tarif: "pro",
    einheiten: [{ id: "e1", name: "Einheit 1" }], standorte: [],
    dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00", mindest: { mo_do: 0, fr: 0, sa: 0, so: 0 } },
      { id: "S", name: "Spät", start: "14:00", ende: "22:00", mindest: { mo_do: 0, fr: 0, sa: 0, so: 0 } }],
    personen, abweichungen, abwesenheiten: [], erfassung: {}, einstempeln: {}, anfragen: [], nachrichten: [] }] };
}

async function vorbereiten(daten) {
  process.env.CENTRIC_DATEN = daten;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = PFEFFER;
  const { getStore } = await import("../../server/lib/ablage.mjs");
  const B = await import("../../server/lib/bestand.mjs");
  const { sitzungAnlegen } = await import("../../server/lib/sitzungen.mjs");
  const { kontoSchreiben } = await import("../../server/lib/konten.mjs");
  const { ablageSchluessel } = await import("../../server/lib/codes.mjs");
  const store = getStore({ name: "centric", consistency: "strong" });
  const sitzung = async (raum, rolle, personId) => (await sitzungAnlegen({ bestand: raum, name: personId, rolle,
    person: personId, betrieb: 0, mandantId: "m1", einheit: rolle === "subplaner" ? "e1" : null }, 6 * 3600 * 1000)).token;

  const raeume = {
    // S0 Reihe
    "groesse-250": 250, "groesse-1000": 1000, "groesse-2000": 2000, "groesse-4000": 4000,
    // S1 und S5: zwei Betriebe à 1000 (2000 Stempel), dazu einer für den Gegenversuch
    "stempel-a": 1000, "stempel-b": 1000, "stempel-einzel": 400,
    // S2 und S5: fünf Räume, einer groß
    "plan-gross": 2000, "plan-1": 200, "plan-2": 200, "plan-3": 200, "plan-4": 200,
  };
  const t = { stempel: {}, planer: {}, leser: {}, reihe: {}, codes: [], codesB: [] };
  for (const [raum, n] of Object.entries(raeume)) {
    await B.bestandSchreiben(store, raum, betrieb(raum, n), { durch: "Lasttest" });
  }
  /* S3: groß, nahe RUMPF_MAX — 2000 Personen, Abweichungen über 100 Tage. */
  const gross = betrieb("lesen-gross", 2000, 100);
  await B.bestandSchreiben(store, "lesen-gross", gross, { durch: "Lasttest" });
  const grossBytes = Buffer.byteLength(JSON.stringify(gross));

  /* Nur so viele Sitzungen, wie die Szenarien brauchen (jede ist eine Datei
     mit fsync — tausende davon kosten auf Windows Minuten), parallel zu 16. */
  const bedarf = { "stempel-a": Math.ceil((200 * P.s1Min) / 2), "stempel-b": Math.ceil((200 * P.s1Min) / 2), "stempel-einzel": 200 };
  for (const raum of ["stempel-a", "stempel-b", "stempel-einzel"]) {
    const n = Math.min(raeume[raum], bedarf[raum]);
    t.stempel[raum] = new Array(n);
    for (let i = 0; i < n; i += 16) {
      await Promise.all(Array.from({ length: Math.min(16, n - i) }, async (_, k) => {
        const id = `p${i + k + 1}`;
        t.stempel[raum][i + k] = { id, token: await sitzung(raum, "mitarbeiter", id) };
      }));
    }
  }
  for (const raum of ["plan-gross", "plan-1", "plan-2", "plan-3", "plan-4"]) {
    t.planer[raum] = [];
    for (let i = 0; i < 10; i++) t.planer[raum].push(await sitzung(raum, "planer", "planer1"));
  }
  for (const [rolle, pid] of [["leitung", "leitung1"], ["planer", "planer1"], ["subplaner", "sv1"],
    ["mitarbeiter", "p1"], ["betriebsrat", "br1"]]) t.leser[rolle] = await sitzung("lesen-gross", rolle, pid);
  for (const raum of ["groesse-250", "groesse-1000", "groesse-2000", "groesse-4000"]) {
    t.reihe[raum] = { leitung: await sitzung(raum, "leitung", "leitung1"), stempel: [] };
    for (let i = 1; i <= 40; i++) t.reihe[raum].stempel.push(await sitzung(raum, "mitarbeiter", `p${i}`));
  }
  const codes = Math.min(300, Math.ceil((P.s4Sek * 1000) / 200) + 10);
  for (let i = 1; i <= codes; i += 16) {
    await Promise.all(Array.from({ length: Math.min(16, codes - i + 1) }, async (_, k) => {
      const nr = i + k;
      const code = `LAST-${String(nr).padStart(4, "0")}-CODE`;
      await kontoSchreiben(store, ablageSchluessel(code), { name: `p${nr}`, bestand: "plan-1", rolle: "mitarbeiter",
        person: `p${(nr % 200) + 1}`, betrieb: 0, mandantId: "m1", angelegt: new Date().toISOString() });
      t.codes.push(code);
    }));
  }
  /* Phase B der Anmeldung: 13 Betriebe à 35 Zugänge (455 Anmeldungen, je Betrieb unter 40). */
  const raeumeB = [...Object.keys(raeume), "lesen-gross"];
  for (let r = 0; r < raeumeB.length; r++) {
    await Promise.all(Array.from({ length: 35 }, async (_, i) => {
      const code = `LASB-${String(r).padStart(2, "0")}${String(i).padStart(3, "0")}-CODE`;
      await kontoSchreiben(store, ablageSchluessel(code), { name: `q${i}`, bestand: raeumeB[r], rolle: "mitarbeiter",
        person: `p${i + 1}`, betrieb: 0, mandantId: "m1", angelegt: new Date().toISOString() });
      t.codesB.push(code);
    }));
  }
  t.codesB.sort(() => Math.random() - 0.5);
  ablageWerkzeug = { B, store, sitzungAnlegen };
  return { t, grossBytes };
}

let ablageWerkzeug = null;

/* ------------------------------------------------------------------ */
/* Server                                                              */

async function serverStarten(daten, statik, port) {
  messdatei = path.join(path.dirname(daten), "mess.jsonl");
  const kind = spawn(process.execPath, ["--import", "./werkzeug/last/messfuehler.mjs", "server.mjs"], {
    cwd: WURZEL, stdio: ["ignore", "ignore", "pipe"],
    env: { ...process.env, PORT: String(port), CENTRIC_DATEN: daten, CENTRIC_ABLAGE: "dateien", CENTRIC_PFEFFER: PFEFFER,
      CENTRIC_STATIK: statik, NODE_ENV: "production", CENTRIC_AUFRAEUMEN: "aus", CENTRIC_UEBERWACHUNG: "aus",
      CENTRIC_VERTRAUTE_PROXYS: "127.0.0.1,::1", CENTRIC_LAST_MESSDATEI: messdatei } });
  let fehler = "";
  kind.stderr.on("data", (d) => { fehler += d; if (fehler.length > 20000) fehler = fehler.slice(-20000); });
  for (let i = 0; i < 200; i++) {
    if (await fetch(`http://127.0.0.1:${port}/gesund`).then((r) => r.ok).catch(() => false)) return { kind, fehler: () => fehler };
    await warte(100);
  }
  throw new Error(`Server startet nicht:\n${fehler}`);
}

/* ------------------------------------------------------------------ */
/* Anfragen                                                            */

let BASIS, xffNr = 0;
/** Nur das Messergebnis behalten — die geparste Antwort (bis 5 MB) würde sonst in den Ergebnislisten hängen bleiben. */
const schlank = (x) => ({ status: x.status, ms: x.ms, bytes: x.bytes });
async function ruf(pfad, { methode = "GET", token, rumpf, xff } = {}) {
  const h = { origin: BASIS };
  if (token) h.authorization = `Bearer ${token}`;
  if (rumpf) h["content-type"] = "application/json";
  xffNr++;
  h["x-forwarded-for"] = xff || `10.${(xffNr >> 16) & 255}.${(xffNr >> 8) & 255}.${xffNr & 255}`;
  const t0 = performance.now();
  try {
    const r = await fetch(BASIS + pfad, { method: methode, headers: h, body: rumpf ? JSON.stringify(rumpf) : undefined });
    const text = await r.text();
    let d = null; try { d = JSON.parse(text); } catch { /* kein JSON */ }
    return { status: r.status, ms: performance.now() - t0, d, bytes: text.length };
  } catch (e) {
    return { status: 0, ms: performance.now() - t0, d: { fehler: String(e) } };
  }
}

/** Startet `anzahl` Aufträge im Abstand `abstandMs`, in Bündeln zu `buendel` (offenes Modell). */
async function takten(auftraege, abstandMs, buendel, arbeit) {
  return Promise.all(auftraege.map((a, i) => new Promise((fertig) => {
    setTimeout(async () => fertig(await arbeit(a)), Math.floor(i / buendel) * abstandMs);
  })));
}

/* ------------------------------------------------------------------ */
/* Szenarien                                                           */

async function s0(t) {
  const aus = {};
  for (const [raum, z] of Object.entries(t.reihe)) {
    const lesen = [];
    for (let i = 0; i < 10; i++) lesen.push(schlank(await ruf("/api/bestand", { token: z.leitung })));
    const stempel = [];
    const stempeln = (tok) => ruf("/api/stempeln", { methode: "POST", token: tok, rumpf: { datum: HEUTE, art: "start" } });
    const v0 = Date.now();
    for (const tok of z.stempel.slice(0, 20)) stempel.push(await stempeln(tok));
    const v1 = Date.now();
    /* Zwanzig gleichzeitig in EINEM Raum: Sie laufen nacheinander durch die Raumsperre,
       Gesamtdauer / 20 ist also die Haltedauer je Stempel. */
    const burst = await Promise.all(z.stempel.slice(20, 40).map(stempeln));
    const burstMs = Date.now() - v1;
    const mess = await messung(v0, Date.now());
    aus[raum] = { lesen: auswerten(lesen), stempel: auswerten(stempel), bestandKB: Math.round((lesen[0].bytes || 0) / 1024),
      burst20: { ...auswerten(burst), gesamtMs: burstMs, haltedauerMs: Math.round(burstMs / 20),
        stempelProMinute: Math.round(60000 / (burstMs / 20)) }, server: mess };
  }
  return aus;
}

async function stempelLast(listen, jeMinute, minuten, art) {
  const gesamt = Math.round(jeMinute * minuten);
  const auftraege = [];
  const raeume = Object.keys(listen);
  for (let i = 0; auftraege.length < gesamt; i++) {
    const raum = raeume[i % raeume.length];
    const p = listen[raum][Math.floor(i / raeume.length)];
    if (!p) break;
    auftraege.push({ raum, ...p });
  }
  const buendel = 10;
  const ergebnisse = await takten(auftraege, (60000 / jeMinute) * buendel, buendel,
    async (a) => ({ a, r: await ruf("/api/stempeln", { methode: "POST", token: a.token, rumpf: { datum: HEUTE, art } }) }));
  return { auftraege: auftraege.length, ergebnisse };
}

async function verlusteZaehlen(raeume, ergebnisse, art, leserToken) {
  let verloren = 0, falschGespeichert = 0;
  const gespeichert = {};
  for (const raum of raeume) {
    const r = await ruf("/api/bestand", { token: leserToken[raum] });
    gespeichert[raum] = (r.d && r.d.bestand && r.d.bestand.mandanten[0].einstempeln) || {};
  }
  for (const { a, r } of ergebnisse) {
    const steht = gespeichert[a.raum][`${a.id}|${HEUTE}`];
    const hat = steht && (art === "start" ? steht.start : steht.ende);
    if (r.status === 200 && !hat) verloren++;
    if (r.status !== 200 && r.status !== 409 && hat && art === "start") falschGespeichert++;
  }
  return { verloren, falschGespeichert };
}

async function s1(t, leitungFuer) {
  const von = Date.now();
  const { auftraege, ergebnisse } = await stempelLast({ "stempel-a": t.stempel["stempel-a"], "stempel-b": t.stempel["stempel-b"] },
    200, P.s1Min, "start");
  const bis = Date.now();
  const v = await verlusteZaehlen(["stempel-a", "stempel-b"], ergebnisse, "start", leitungFuer);
  /* Gegenversuch: ein einziger Betrieb, 200/min eine Minute lang. */
  const g = await stempelLast({ "stempel-einzel": t.stempel["stempel-einzel"] }, 200, 1, "start");
  return { auftraege, ...auswerten(ergebnisse.map((e) => e.r)), ...v, server: await messung(von, bis),
    einBetrieb: { auftraege: g.auftraege, ...auswerten(g.ergebnisse.map((e) => e.r)) } };
}

async function planerLauf(t, minuten, ergebnisse) {
  const ende = Date.now() + minuten * 60000;
  const laeufe = [];
  for (const [raum, tokens] of Object.entries(t.planer)) {
    tokens.forEach((tok, i) => {
      const monat = `${PLANJAHR}-${String(i + 1).padStart(2, "0")}`;
      laeufe.push((async () => {
        await warte(Math.random() * 30000);
        let k = 0;
        while (Date.now() < ende) {
          const g = await ruf("/api/bestand", { token: tok });
          ergebnisse.get.push(schlank(g));
          if (g.status === 200 && g.d && g.d.bestand) {
            const b = g.d.bestand;
            const m = b.mandanten[0];
            m.abweichungen = { ...(m.abweichungen || {}), [`p${i + 1}|${monat}-${String((k % 27) + 1).padStart(2, "0")}`]: k % 2 ? "S" : "F" };
            const p = await ruf("/api/bestand", { methode: "PUT", token: tok, rumpf: { bestand: b, etag: g.d.etag } });
            ergebnisse.put.push({ ...p, raum });
          }
          k++;
          await warte(30000);
        }
      })());
    });
  }
  await Promise.all(laeufe);
}

async function s2(t) {
  const von = Date.now();
  const e = { get: [], put: [] };
  await planerLauf(t, P.s2Min, e);
  const bis = Date.now();
  const gross = e.put.filter((p) => p.raum === "plan-gross");
  return { put: auswerten(e.put), putGrosserBetrieb: auswerten(gross), get: auswerten(e.get),
    konflikte409: e.put.filter((p) => p.status === 409).length, server: await messung(von, bis) };
}

async function s3(t, grossBytes) {
  const aus = { bestandMB: Math.round((grossBytes / 1048576) * 100) / 100, jeRolle: {} };
  for (const [rolle, tok] of Object.entries(t.leser)) {
    const r = [];
    for (let i = 0; i < 5; i++) r.push(schlank(await ruf("/api/bestand", { token: tok })));
    aus.jeRolle[rolle] = { ...auswerten(r), antwortKB: Math.round((r[0].bytes || 0) / 1024) };
  }
  /* Dauerlast: mehrere Leser, unter der Lesebremse (300/min je Raum): 4/s. */
  const von = Date.now();
  const ende = von + P.s3Min * 60000;
  const proben = [];
  await Promise.all(Array.from({ length: P.s3Leser }, async (_, i) => {
    await warte((i * 250) % 2500);
    while (Date.now() < ende) {
      proben.push(schlank(await ruf("/api/bestand", { token: t.leser.leitung })));
      await warte(P.s3Leser * 250);
    }
  }));
  const bis = Date.now();
  aus.dauerlast = { leser: P.s3Leser, ...auswerten(proben), server: await messung(von, bis) };
  return aus;
}

async function s4(t) {
  const von = Date.now();
  const ende = von + P.s4Sek * 1000;
  const gut = [];
  let i = 0;
  const gueltig = (async () => {
    while (Date.now() < ende && i < t.codes.length) {
      const code = t.codes[i++];
      gut.push(await ruf("/api/anmelden", { methode: "POST", rumpf: { zugangscode: code } }));
      await warte(200);
    }
  })();
  /* Ein Rater von einer Herkunft: 30 falsche Codes. */
  const rater = [];
  for (let k = 0; k < 30; k++) rater.push(await ruf("/api/anmelden", { methode: "POST", rumpf: { zugangscode: `FALS-CH${String(k).padStart(2, "0")}-XXXX` }, xff: "10.250.0.1" }));
  await gueltig;
  const erster429 = rater.findIndex((r) => r.status === 429);
  const phaseA = { gueltig: auswerten(gut), rater: { ...auswerten(rater), erster429: erster429 < 0 ? null : erster429 + 1 },
    ok200: gut.filter((x) => x.status === 200).length, gebremst429: gut.filter((x) => x.status === 429).length };
  /* Phase B: Gesamtaufkommen. Ehrliche Anmeldungen verteilt auf viele Betriebe (je Betrieb unter
     dem Betriebslimit), aus lauter verschiedenen Herkünften — wo schlägt die Gesamtgrenze zu? */
  const vonB = Date.now();
  const antw = [];
  const warteschlange = [...t.codesB];
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (warteschlange.length) antw.push(await ruf("/api/anmelden", { methode: "POST", rumpf: { zugangscode: warteschlange.shift() } }));
  }));
  const ersteB429 = antw.findIndex((x) => x.status === 429);
  const phaseB = { versuche: antw.length, ok200: antw.filter((x) => x.status === 200).length,
    gebremst429: antw.filter((x) => x.status === 429).length, ersteB429: ersteB429 < 0 ? null : ersteB429 + 1,
    sekunden: Math.round((Date.now() - vonB) / 100) / 10 };
  return { ...phaseA, gesamtgrenze: phaseB, server: await messung(von, Date.now()) };
}

async function s6() {
  const { B, store, sitzungAnlegen } = ablageWerkzeug;
  const stufen = P.s6Stufen;
  const aus = {};
  const proben = [];
  let angelegt = 0;
  for (const ziel of stufen) {
    for (; angelegt < ziel; angelegt += 10) {
      await Promise.all(Array.from({ length: Math.min(10, ziel - angelegt) }, async (_, k) => {
        const nr = angelegt + k;
        const raum = `breit-${nr}`;
        await B.bestandSchreiben(store, raum, betrieb(raum, 50), { durch: "Lasttest" });
        /* Nur jeder zehnte Betrieb bekommt Sitzungen zum Messen. */
        if (nr % 10 === 0 && proben.length < 30) {
          const sit = async (rolle, pid) => (await sitzungAnlegen({ bestand: raum, name: pid, rolle, person: pid,
            betrieb: 0, mandantId: "m1", einheit: null }, 6 * 3600 * 1000)).token;
          proben.push({ raum, leitung: await sit("leitung", "leitung1"), ma: [await sit("mitarbeiter", "p1"), await sit("mitarbeiter", "p2"), await sit("mitarbeiter", "p3")], genutzt: 0 });
        }
      }));
    }
    const von = Date.now();
    const stempel = [], lesen = [];
    for (let i = 0; i < 20; i++) {
      const pr = proben[i % proben.length];
      lesen.push(schlank(await ruf("/api/bestand", { token: pr.leitung })));
      const tok = pr.ma[pr.genutzt % 3]; pr.genutzt += 1;
      stempel.push(await ruf("/api/stempeln", { methode: "POST", token: tok, rumpf: { datum: HEUTE, art: pr.genutzt <= 3 ? "start" : "ende" } }));
    }
    const m = await messung(von, Date.now());
    aus[`betriebe_${ziel}`] = { dateienAblage: (await ablageGroesse(daten0)).dateien, lesen: auswerten(lesen),
      stempel: auswerten(stempel), readdirMs: m && m.fs && m.fs.readdir ? m.fs.readdir.msJeAufruf : null,
      readFileMs: m && m.fs && m.fs.readFile ? m.fs.readFile.msJeAufruf : null };
  }
  return aus;
}

async function s5(t, daten, leitungFuer) {
  const von = Date.now();
  const e = { get: [], put: [] };
  const sicherungZiel = await mkdtemp(path.join(tmpdir(), "centric-last-sich-"));
  let sicherung = null, sicherungRuhig = null;
  const sichern = async () => {
    const t0 = Date.now();
    const r = await new Promise((fertig) => {
      const k = spawn(process.execPath, ["werkzeug/ablage-sicherung.mjs", "sichern", "--quelle", daten, "--ziel", sicherungZiel],
        { cwd: WURZEL, env: { ...process.env, CENTRIC_PFEFFER: PFEFFER }, stdio: ["ignore", "pipe", "pipe"] });
      let o = ""; k.stdout.on("data", (d) => { o += d; }); k.stderr.on("data", (d) => { o += d; });
      k.on("close", (code) => fertig({ code, o }));
    });
    return { exit: r.code, sekunden: Math.round((Date.now() - t0) / 100) / 10,
      versuche: (r.o.match(/Versuch \d+\/\d+: /g) || []).length + 1,   // nur verworfene Versuche, nicht die Rundenmeldungen
      anfang: r.o.trim().split("\n").slice(0, 3).join(" | ").slice(0, 300),
      letzteZeile: r.o.trim().split("\n").slice(-2).join(" | ").slice(0, 200) };
  };
  /* Einmal mitten in der Last, einmal danach im Ruhezustand (derselbe Datenbestand). */
  const sicherungLauf = (async () => { await warte(15000); sicherung = await sichern(); })();
  const [stempel] = await Promise.all([
    stempelLast({ "stempel-a": t.stempel["stempel-a"], "stempel-b": t.stempel["stempel-b"] }, 100, P.s5Min, "ende"),
    planerLauf(t, P.s5Min, e),
    sicherungLauf,
  ]);
  const bis = Date.now();
  await warte(2000);
  sicherungRuhig = await sichern();
  await rm(sicherungZiel, { recursive: true, force: true });
  const v = await verlusteZaehlen(["stempel-a", "stempel-b"], stempel.ergebnisse, "ende", leitungFuer);
  return { stempel: { auftraege: stempel.auftraege, ...auswerten(stempel.ergebnisse.map((x) => x.r)), ...v },
    put: auswerten(e.put), konflikte409: e.put.filter((p) => p.status === 409).length, get: auswerten(e.get),
    sicherung, sicherungRuhig, server: await messung(von, bis) };
}

/* ------------------------------------------------------------------ */

const basis = await mkdtemp(path.join(tmpdir(), "centric-lasttest-"));
const daten = path.join(basis, "data");
const statik = path.join(basis, "statik");
await mkdir(daten); await mkdir(path.join(statik, "assets"), { recursive: true });
await writeFile(path.join(statik, "index.html"), "<!doctype html><title>Last</title>");
const umgebung = { profil: PROFIL, plattform: platform(), kerne: cpus().length, cpu: cpus()[0] && cpus()[0].model,
  speicherGB: Math.round(totalmem() / 1073741824), node: process.version, heute: HEUTE, ci: !!process.env.CI };
console.log(`Lasttest ${PROFIL} · ${umgebung.kerne} Kerne · ${umgebung.speicherGB} GB · ${umgebung.node}`);

const t0 = Date.now();
const { t, grossBytes } = await vorbereiten(daten);
console.log(`Daten vorbereitet in ${Math.round((Date.now() - t0) / 1000)} s`);
const port = 30000 + Math.floor(Math.random() * 20000);
BASIS = `http://127.0.0.1:${port}`;
const server = await serverStarten(daten, statik, port);
const daten0 = daten;

/* Leitung je Stempelraum zum Nachzählen. */
process.env.CENTRIC_DATEN = daten;
const { sitzungAnlegen } = await import("../../server/lib/sitzungen.mjs");
const leitungFuer = {};
for (const raum of ["stempel-a", "stempel-b"])
  leitungFuer[raum] = (await sitzungAnlegen({ bestand: raum, name: "leitung1", rolle: "leitung", person: "leitung1",
    betrieb: 0, mandantId: "m1", einheit: null }, 6 * 3600 * 1000)).token;

const ergebnis = { umgebung, ablageVorher: await ablageGroesse(daten) };
try {
  if (laeuft("S0")) { console.log("S0 Skalierungsreihe …"); ergebnis.S0 = await s0(t); }
  if (laeuft("S1")) { console.log(`S1 Schichtwechsel ${P.s1Min} min …`); ergebnis.S1 = await s1(t, leitungFuer); }
  if (laeuft("S2")) { console.log(`S2 Planende ${P.s2Min} min …`); ergebnis.S2 = await s2(t); }
  if (laeuft("S3")) { console.log("S3 großer Bestand …"); ergebnis.S3 = await s3(t, grossBytes); }
  if (laeuft("S4")) { console.log("S4 Anmeldung …"); ergebnis.S4 = await s4(t); }
  if (laeuft("S6")) { console.log(`S6 Breite ${P.s6Stufen.join("/")} Betriebe …`); ergebnis.S6 = await s6(); }
  if (laeuft("S5")) { console.log(`S5 Mischlast + Sicherung ${P.s5Min} min …`); ergebnis.S5 = await s5(t, daten, leitungFuer); }
} finally {
  ergebnis.ablageNachher = await ablageGroesse(daten);
  ergebnis.serverGesamt = await messung(0, Date.now());
  server.kind.kill();
  await warte(500);
  const fehler = server.fehler().split("\n").filter((z) => /Error|Fehler|fehlgeschlagen/.test(z)).slice(-10);
  if (fehler.length) ergebnis.serverFehlerzeilen = fehler;
  await rm(basis, { recursive: true, force: true }).catch(() => {});
}
ergebnis.dauerMin = Math.round((Date.now() - t0) / 6000) / 10;

const text = JSON.stringify(ergebnis, null, 2);
if (AUS) await writeFile(AUS, text);
console.log(text);
