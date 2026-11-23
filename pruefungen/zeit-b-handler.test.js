/* ==========================================================================
   WP-ZEIT, ZEIT-B Stufe 1, Schritt 1 — Golden-Anker TEIL B: Handler-Abläufe, AUS-Neutralität
   (docs/acc45/ZEIT-B-STUFE1-PLAN.md § 3.2 Teil B, § 6.2)

   Was: Ablaufskripte gegen den echten Handler (server/funktionen/daten.mjs, /api/stempeln, /api/stempel-korrektur,
   /api/korrektur-antrag, /api/monatsabschluss) mit fester Uhr (vi.setSystemTime, nur Date): Tagdienst mit Korrektur
   und Antrag; Nachtdienst über Mitternacht (T-MN-1/2); 20-h-Grenze (B6.3, angehängt und Konflikt); F1 (Ende ohne
   Beginn nach geplantem Nachtdienst); Offline mit Versatz innerhalb/außerhalb der Toleranz, Zukunft, ohne
   gesendetAm, älter als 48 h; Begrenzung eines Offline-Endes auf den Beginn (daten.mjs, Review L3);
   Frühjahrsnacht 2026-03-29, Herbstnacht 2026-10-25 (T-DST-F1/H2); Monatsgrenze 31.10.→1.11.; Stempel in einen
   geschlossenen Monat (409 + `abgewiesen`); Wiederholung mit derselben clientEventId; Exporte OFFENER Monate
   (Lohnausgabe-Zeilen und Datei aus src/lib/fachlogik.js datevSaetze/datevCSV).
   Festgehalten: SHA-256 von `einstempeln`, `erfassung`, `monatsabschluss` je Ablauf, istAbdruck je Monat, die
   Antwortcodes und die Export-Prüfsummen offener Monate.
   Prozesszonen: UTC (CI), Europe/Berlin, Pacific/Kiritimati, America/Los_Angeles — Ergebnis überall gleich.

   Determinismus: Zufalls-Kennungen aus randomBytes (`ma-…` Monatsabschluss, `k-…` Stempelkorrektur, `ka-…`
   Korrekturantrag) werden vor dem Hashen durch Platzhalter in Reihenfolge des Auftretens ersetzt (auch innerhalb
   von Texten). Der Speicherstand (`stand`/`etag` des Bestands, W-9) und das Protokoll (UTC-Tagespräfix,
   server/lib/schutz.mjs protokoll) gehören nicht in den Hash: gehasht werden nur `einstempeln`, `erfassung`,
   `monatsabschluss` und `istEingefroren` (über istAbdruck) des Testbetriebs. Alle Uhren fest; keine Uhrzeit liegt
   an einer Wanduhrgrenze, die nicht ausdrücklich geprüft wird.

   REGEL TEIL B — AUS-Neutralität gegen denselben Basis-Commit (Plan § 3.2 Nr. 4):
   - Jeder ZEIT-B-Schritt-PR (2–5) zeigt, dass diese Werte bei Schalter AUS (CENTRIC_ZEITMODELL unset, "1", "true",
     " 2", "2 ") gleich den Werten auf seinem eigenen Basis-Commit sind. Ein ZEIT-B-PR ändert die Erwartungswerte
     in dieser Datei NIE.
   - Ändert ein Nachbarpaket (WP-07b, WP-14c, WP-16c, WP-48 o. a.) legitim das Handler-Ergebnis, aktualisiert NUR
     der PR dieses Pakets die Werte unten — mit Begründung im PR-Text (welcher Ablauf, welches Feld, warum) und mit
     Teil A (pruefungen/zeit-b-altdaten.test.js) unverändert grün.
   Erwartungswerte erhoben auf origin/integration/release-v4 @ ec9d5605.
   ========================================================================== */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { istAbdruck, monatAbgeschlossen, datevZeilenAbdruck } from "../server/lib/monatsabschluss.mjs";
import { datevCSV, datevSaetze } from "../src/lib/fachlogik.js";

const WIRT = "127.0.0.1:3000";
let wurzel, laden, daten, sitzungAnlegen, B;

const ZONEN = ["UTC", "Europe/Berlin", "Pacific/Kiritimati", "America/Los_Angeles"];
const VERSATZ = { UTC: 0, "Europe/Berlin": -60, "Pacific/Kiritimati": -840, "America/Los_Angeles": 480 };
const TZ_VORHER = process.env.TZ;
const SCHALTER_VORHER = process.env.CENTRIC_ZEITMODELL;
const zurueck = (name, wert) => { if (wert === undefined) delete process.env[name]; else process.env[name] = wert; };
afterEach(() => { zurueck("TZ", TZ_VORHER); zurueck("CENTRIC_ZEITMODELL", SCHALTER_VORHER); });

let nr = 0;
const anfrage = async (pfad, { methode = "POST", rumpf, token } = {}) => {
  nr += 1;
  const kopf = { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.9.${Math.floor(nr / 250) % 250}.${nr % 250}` };
  if (methode !== "GET") kopf["content-type"] = "application/json";
  if (token) kopf.authorization = `Bearer ${token}`;
  const a = await daten(new Request(`http://${WIRT}${pfad}`, { method: methode, headers: kopf,
    ...(methode === "GET" ? {} : { body: JSON.stringify(rumpf || {}) }) }), {});
  let d = {}; try { d = await a.json(); } catch { /* leer */ }
  return { status: a.status, ...d };
};

const person = (id, rolle = "mitarbeiter") => ({ id, vorname: "V", nachname: id, rolle, bereich: "e1", personalnummer: `P-${id}`,
  eintritt: "2020-01-01", wochenstunden: 20, zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }] });
const ROLLE = { l1: "leitung" };
async function raumAnlegen(raum, ids, abweichungen = {}) {
  await B.bestandSchreiben(laden(), raum, { version: 9, mandanten: [{ id: "m1", name: "Haus", bundesland: "BY",
    einheiten: [{ id: "e1", name: "WB 1" }],
    dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00", pause: 30 }, { id: "N", name: "Nacht", start: "22:00", ende: "06:00", pause: 30 }],
    personen: [...ids, "l1"].map((id) => person(id, ROLLE[id])), abweichungen, abwesenheiten: [], erfassung: {}, einstempeln: {} }] },
  { durch: "Pruefung" });
}
const sitzung = async (raum, id) => (await sitzungAnlegen({ bestand: raum, name: id, rolle: ROLLE[id] || "mitarbeiter",
  person: id, betrieb: 0, mandantId: "m1", einheit: null }, 24 * 60 * 60 * 1000)).token;
const zeitAuf = (iso) => vi.setSystemTime(new Date(iso));
const mandant = async (raum) => (await B.bestandLesen(laden(), raum)).bestand.mandanten[0];
const ID = (n) => `${String(n).padStart(8, "0")}-0000-4000-8000-${String(n).padStart(12, "0")}`;
const sha = (x) => createHash("sha256").update(JSON.stringify(x)).digest("hex").slice(0, 32);

/* Zufalls-Kennungen (randomBytes(6) → 12 Hex-Zeichen) durch Platzhalter in Reihenfolge des Auftretens ersetzen;
   Schlüssel geordnet, damit die Reihenfolge nicht von der Einfügefolge abhängt. */
const ZUFALL = /\b(ma|ka|k)-[0-9a-f]{12}\b/g;
function normalisieren(x) {
  const ersatz = new Map();
  const text = (s) => s.replace(ZUFALL, (t, art) => {
    if (!ersatz.has(t)) ersatz.set(t, `${art}-#${ersatz.size + 1}`);
    return ersatz.get(t);
  });
  const lauf = (v) => (typeof v === "string" ? text(v)
    : Array.isArray(v) ? v.map(lauf)
      : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, lauf(v[k])])) : v);
  return lauf(x);
}

/* ---- Abläufe: je Ablauf ein eigener Raum; jeder Schritt mit fester Uhr und frischer Sitzung ------------------------ */
const ABLAEUFE = {
  async tagdienst(raum, a) {
    await raumAnlegen(raum, ["a1"], { "a1|2026-11-02": "F" });
    zeitAuf("2026-11-02T04:55:00Z"); await a("a1", "/api/stempeln", { art: "start" });                    // 05:55 MEZ
    zeitAuf("2026-11-02T13:07:00Z"); await a("a1", "/api/stempeln", { art: "ende", pause: 30 });          // 14:07
    zeitAuf("2026-11-02T15:00:00Z");
    await a("l1", "/api/stempel-korrektur", { personId: "a1", datum: "2026-11-02", start: "06:00", ende: "14:05", grund: "Laut Dienstbuch (Golden Teil B)" });
    zeitAuf("2026-11-03T08:00:00Z");
    await a("a1", "/api/korrektur-antrag", { datum: "2026-11-02", start: "05:55", ende: "14:20", grund: "Übergabe dauerte länger (Golden)" });
  },
  async nacht(raum, a) {
    await raumAnlegen(raum, ["a1"], { "a1|2026-11-01": "N" });
    zeitAuf("2026-11-01T20:58:00Z"); await a("a1", "/api/stempeln", { art: "start", datum: "2026-11-01" }); // 21:58 MEZ
    zeitAuf("2026-11-02T05:03:00Z"); await a("a1", "/api/stempeln", { art: "ende", datum: "2026-11-02" });  // 06:03
  },
  async grenze20h(raum, a) {
    await raumAnlegen(raum, ["a1", "a2"]);
    zeitAuf("2026-11-01T10:00:00Z"); await a("a1", "/api/stempeln", { art: "start" });                    // 11:00
    zeitAuf("2026-11-01T05:00:00Z"); await a("a2", "/api/stempeln", { art: "start" });                    // 06:00
    zeitAuf("2026-11-02T05:30:00Z"); await a("a1", "/api/stempeln", { art: "ende" });                     // 19,5 h → angehängt
    zeitAuf("2026-11-02T04:00:00Z"); await a("a2", "/api/stempeln", { art: "ende" });                     // 23 h → B6.3 Konflikt
  },
  async f1(raum, a) {
    await raumAnlegen(raum, ["a1"], { "a1|2026-11-01": "N" });
    zeitAuf("2026-11-02T05:05:00Z"); await a("a1", "/api/stempeln", { art: "ende" });                     // 06:05, ohne Beginn
  },
  async offline(raum, a) {
    await raumAnlegen(raum, ["o1", "o2", "o3", "o4", "o5", "o6"]);
    zeitAuf("2026-11-04T05:00:00Z");
    await a("o1", "/api/stempeln", { art: "start", offline: true, clientEventId: ID(1), erfasstAm: "2026-11-04T04:10:00.000Z", gesendetAm: "2026-11-04T04:59:00.000Z" });
    await a("o2", "/api/stempeln", { art: "start", offline: true, clientEventId: ID(2), erfasstAm: "2026-11-04T04:10:00.000Z", gesendetAm: "2026-11-04T04:40:00.000Z" });
    await a("o3", "/api/stempeln", { art: "start", offline: true, clientEventId: ID(3), erfasstAm: "2026-11-04T05:20:00.000Z", gesendetAm: "2026-11-04T04:59:30.000Z" });
    await a("o4", "/api/stempeln", { art: "start", offline: true, clientEventId: ID(4), erfasstAm: "2026-11-04T04:20:00.000Z" });
    await a("o5", "/api/stempeln", { art: "start", offline: true, clientEventId: ID(5), erfasstAm: "2026-11-01T05:00:00.000Z", gesendetAm: "2026-11-04T04:59:30.000Z" });
    zeitAuf("2026-11-04T06:00:00Z"); await a("o6", "/api/stempeln", { art: "start", clientEventId: ID(6) });
    /* Begrenzung (Review L3): Offline-Ende 2 min vor dem offenen Beginn → auf den Beginn geklemmt. */
    zeitAuf("2026-11-04T06:10:00Z");
    await a("o6", "/api/stempeln", { art: "ende", offline: true, clientEventId: ID(7), erfasstAm: "2026-11-04T05:58:00.000Z", gesendetAm: "2026-11-04T06:10:00.000Z" });
    zeitAuf("2026-11-04T13:00:00Z");
    await a("o1", "/api/stempeln", { art: "ende", clientEventId: ID(8) });
    await a("o2", "/api/stempeln", { art: "ende", offline: true, clientEventId: ID(9), erfasstAm: "2026-11-04T12:40:00.000Z", gesendetAm: "2026-11-04T12:59:00.000Z" });
  },
  async fruehjahr(raum, a) {
    await raumAnlegen(raum, ["a1"], { "a1|2026-03-28": "N" });
    zeitAuf("2026-03-28T21:00:00Z"); await a("a1", "/api/stempeln", { art: "start" });                    // 22:00 MEZ
    zeitAuf("2026-03-29T04:00:00Z"); await a("a1", "/api/stempeln", { art: "ende" });                     // 06:00 MESZ (7 h)
  },
  async herbst(raum, a) {
    await raumAnlegen(raum, ["a1"], { "a1|2026-10-24": "N" });
    zeitAuf("2026-10-24T20:00:00Z"); await a("a1", "/api/stempeln", { art: "start" });                    // 22:00 MESZ
    zeitAuf("2026-10-25T05:00:00Z"); await a("a1", "/api/stempeln", { art: "ende" });                     // 06:00 MEZ (9 h)
  },
  async monatsgrenze(raum, a) {
    await raumAnlegen(raum, ["a1"], { "a1|2026-10-31": "N" });
    zeitAuf("2026-10-31T21:00:00Z"); await a("a1", "/api/stempeln", { art: "start" });                    // 31.10. 22:00 MEZ
    zeitAuf("2026-11-01T05:00:00Z"); await a("a1", "/api/stempeln", { art: "ende" });                     // 01.11. 06:00
  },
  async geschlossen(raum, a) {
    await raumAnlegen(raum, ["g1", "g2"], { "g1|2026-10-30": "F", "g2|2026-10-31": "N" });
    zeitAuf("2026-10-30T05:00:00Z"); await a("g1", "/api/stempeln", { art: "start" });
    zeitAuf("2026-10-30T13:00:00Z"); await a("g1", "/api/stempeln", { art: "ende" });
    zeitAuf("2026-10-31T21:00:00Z"); await a("g2", "/api/stempeln", { art: "start" });
    zeitAuf("2026-11-01T04:00:00Z");                                                                       // 05:00 MEZ
    await a("l1", "/api/monatsabschluss", { aktion: "abschliessen", monat: "2026-10", trotzPrueffaellen: true, grund: "Golden Teil B" });
    zeitAuf("2026-11-01T05:00:00Z"); await a("g2", "/api/stempeln", { art: "ende", clientEventId: ID(20) });  // gehört zum 31.10. → 409
    zeitAuf("2026-11-01T06:00:00Z");
    await a("g1", "/api/stempeln", { art: "start", offline: true, clientEventId: ID(21), erfasstAm: "2026-10-31T09:00:00.000Z", gesendetAm: "2026-11-01T06:00:00.000Z" });
  },
  async wiederholung(raum, a) {
    await raumAnlegen(raum, ["w1"]);
    zeitAuf("2026-11-05T07:00:00Z"); await a("w1", "/api/stempeln", { art: "start", clientEventId: ID(30) });
    zeitAuf("2026-11-05T07:00:20Z"); await a("w1", "/api/stempeln", { art: "start", clientEventId: ID(30) });
    zeitAuf("2026-11-05T15:00:00Z"); await a("w1", "/api/stempeln", { art: "ende", clientEventId: ID(31) });
    zeitAuf("2026-11-05T15:00:30Z"); await a("w1", "/api/stempeln", { art: "ende", clientEventId: ID(31) });
    zeitAuf("2026-11-05T15:01:00Z"); await a("w1", "/api/stempeln", { art: "ende", clientEventId: ID(30) });  // andere Art → 422
  },
};

async function ablaeufeRechnen(praefix) {
  const aus = {};
  for (const [name, f] of Object.entries(ABLAEUFE)) {
    const raum = `${praefix}-${name}`;
    const antworten = [];
    const a = async (wer, pfad, rumpf) => {
      const r = await anfrage(pfad, { token: await sitzung(raum, wer), rumpf });
      antworten.push(`${pfad.slice(5)} ${r.status}${r.code ? ` ${r.code}` : ""}`);
      return r;
    };
    await f(raum, a);
    const m = await mandant(raum);
    const n = normalisieren({ einstempeln: m.einstempeln || {}, erfassung: m.erfassung || {},
      istEingefroren: m.istEingefroren || {}, monatsabschluss: m.monatsabschluss || {} });
    const monate = [...new Set(Object.keys(n.einstempeln).map((k) => k.split("|")[1].slice(0, 7)))].sort();
    aus[name] = {
      antworten,
      einstempeln: sha(n.einstempeln), erfassung: sha(n.erfassung), monatsabschluss: sha(n.monatsabschluss),
      abdruck: Object.fromEntries(monate.map((mon) => [mon, istAbdruck(n, mon)])),
      /* Exporte offener Monate (Plan § 3.2 Teil B): Zeilen-Prüfsumme der Lohnausgabe und Datei. */
      exporte: Object.fromEntries(monate.filter((mon) => !monatAbgeschlossen(m, mon))
        .map((mon) => [mon, { zeilen: datevZeilenAbdruck(datevSaetze(m, mon)), datei: sha(datevCSV(m, mon)) }])),
    };
  }
  return aus;
}

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-zeit-b-handler-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
  const { getStore } = await import("../server/lib/ablage.mjs");
  laden = () => getStore({ name: "centric", consistency: "strong" });
  daten = (await import("../server/funktionen/daten.mjs")).default;
  ({ sitzungAnlegen } = await import("../server/lib/sitzungen.mjs"));
  B = await import("../server/lib/bestand.mjs");
  vi.useFakeTimers({ toFake: ["Date"] });
});
afterAll(async () => {
  vi.useRealTimers();
  if (wurzel) {
    await rm(wurzel, { recursive: true, force: true });
    /* Zustandsverzeichnis: Vorgabe <CENTRIC_DATEN>-zustand (Geschwister, server/lib/schluesselepoche.mjs) — sonst
       bliebe je Lauf ein Ordner im Temp-Verzeichnis zurück (Review #494, H3). */
    await rm(`${wurzel}-zustand`, { recursive: true, force: true });
  }
});

/* ---- Erwartungswerte (erhoben auf ec9d5605). Aktualisieren NUR durch den PR eines Nachbarpakets mit Begründung —
   nie durch einen ZEIT-B-Schritt-PR (Regel Teil B, Kopf). ------------------------------------------------------- */
const ERWARTET = {
  tagdienst: {
    antworten: ["stempeln 200", "stempeln 200", "stempel-korrektur 200", "korrektur-antrag 200"],
    einstempeln: "af61236fc959af3bd81816e2e53c0369", erfassung: "dd6f42bedc10df8efb20a346aca82c9f", monatsabschluss: "44136fa355b3678a1146ad16f7e8649e",
    abdruck: {"2026-11": "81daad124bec8a5ca345923d58dcb14a"},
    exporte: {"2026-11": {"zeilen": "4f53cda18c2baa0c0354bb5f9a3ecbe5", "datei": "1a52e5f5a989665130a2af241816b261"}},
  },
  nacht: {
    antworten: ["stempeln 200", "stempeln 200"],
    einstempeln: "c7cbc4bff0664359491452dbe9518bdf", erfassung: "2b5eb58b8ce9fd92993bfc51610381f6", monatsabschluss: "44136fa355b3678a1146ad16f7e8649e",
    abdruck: {"2026-11": "e143d9056f0435d0a65d431eabd39234"},
    exporte: {"2026-11": {"zeilen": "5508320a336a0ca848388709799a0fbd", "datei": "c4229ee214e56c90e3c6867f33c2026c"}},
  },
  grenze20h: {
    antworten: ["stempeln 200", "stempeln 200", "stempeln 200", "stempeln 200"],
    einstempeln: "0532d5ad226c25c4eae80eb6e429ed85", erfassung: "665f5d4a3c5557730cd70de0f06a817d", monatsabschluss: "44136fa355b3678a1146ad16f7e8649e",
    abdruck: {"2026-11": "c09a136f8be5bcaa4f9fa0d3c4262c7b"},
    exporte: {"2026-11": {"zeilen": "4f53cda18c2baa0c0354bb5f9a3ecbe5", "datei": "1a52e5f5a989665130a2af241816b261"}},
  },
  f1: {
    antworten: ["stempeln 200"],
    einstempeln: "1abb41e6996dc4541d43dbc16ac322f2", erfassung: "44136fa355b3678a1146ad16f7e8649e", monatsabschluss: "44136fa355b3678a1146ad16f7e8649e",
    abdruck: {"2026-11": "b1309e88b2df24d88f35094c1d889d84"},
    exporte: {"2026-11": {"zeilen": "5508320a336a0ca848388709799a0fbd", "datei": "c4229ee214e56c90e3c6867f33c2026c"}},
  },
  offline: {
    antworten: ["stempeln 200", "stempeln 200", "stempeln 200", "stempeln 200", "stempeln 200", "stempeln 200", "stempeln 200", "stempeln 200", "stempeln 200"],
    einstempeln: "c88d0e86e525e46d195b47b33c4a81cb", erfassung: "ba4f4b2b07e81307e2bc20465d1d4d88", monatsabschluss: "44136fa355b3678a1146ad16f7e8649e",
    abdruck: {"2026-11": "484217ecf5bd90b95a3a899527b8465b"},
    exporte: {"2026-11": {"zeilen": "4f53cda18c2baa0c0354bb5f9a3ecbe5", "datei": "1a52e5f5a989665130a2af241816b261"}},
  },
  fruehjahr: {
    antworten: ["stempeln 200", "stempeln 200"],
    einstempeln: "a71536e828112337396d1a5ab642b15a", erfassung: "7ed633c26ff19e616d579a38d90bb0bf", monatsabschluss: "44136fa355b3678a1146ad16f7e8649e",
    abdruck: {"2026-03": "745c655208b61e06e6d1f81b9e3eb060"},
    exporte: {"2026-03": {"zeilen": "a924113907f258e1242e2068cd94d300", "datei": "f713398aeb1c20b38c68f349659eee06"}},
  },
  herbst: {
    antworten: ["stempeln 200", "stempeln 200"],
    einstempeln: "543c43be62f36b4201b64caf51ce17ec", erfassung: "c6112db5dfac74cb1eb6cf904bc11e19", monatsabschluss: "44136fa355b3678a1146ad16f7e8649e",
    abdruck: {"2026-10": "8017feda42d7dfed1558dbbe308669e2"},
    exporte: {"2026-10": {"zeilen": "92b749daf8ee7c609e935676eaa2613b", "datei": "e1fc9c601451f30bb2f6995852563c13"}},
  },
  monatsgrenze: {
    antworten: ["stempeln 200", "stempeln 200"],
    einstempeln: "37756e68314c3ee23d0bce141fd9b827", erfassung: "284c2428d692c1832adf3780d8864c1d", monatsabschluss: "44136fa355b3678a1146ad16f7e8649e",
    abdruck: {"2026-10": "f7a4bd494aeda892a31991293470d1f8"},
    exporte: {"2026-10": {"zeilen": "70bc28af5f2bbd16732dc4f68590b8c5", "datei": "5ff6acabe9781fb237ed8fea9b4116c0"}},
  },
  geschlossen: {
    antworten: ["stempeln 200", "stempeln 200", "stempeln 200", "monatsabschluss 200", "stempeln 409 MONAT_ABGESCHLOSSEN", "stempeln 409 MONAT_ABGESCHLOSSEN"],
    einstempeln: "3e97a126905fd07a38a34aa6966af421", erfassung: "f6ab0d16a90375e34a1afb401393b6fe", monatsabschluss: "c91d57c43b4fa22900c690045efab83a",
    abdruck: {"2026-10": "b5f2742e502a41132d9d9fedb7184a80"},
    exporte: {},
  },
  wiederholung: {
    antworten: ["stempeln 200", "stempeln 200", "stempeln 200", "stempeln 200", "stempeln 422 STEMPEL_EREIGNIS_WIDERSPRUCH"],
    einstempeln: "098eae08f3dfd312348c5019b2e3fb26", erfassung: "9541ff9223599d25ffbcdfc8a7117b1e", monatsabschluss: "44136fa355b3678a1146ad16f7e8649e",
    abdruck: {"2026-11": "3614b678d16d4118a58628475de9aec2"},
    exporte: {"2026-11": {"zeilen": "4f53cda18c2baa0c0354bb5f9a3ecbe5", "datei": "1a52e5f5a989665130a2af241816b261"}},
  },
};

/* Prozesszonen und Schalterwerte: Jede Prozesszone läuft einmal; die Schalterwerte, die Modell 1 bedeuten (Plan § 6.4:
   nur genau "2" ist Modell 2), sind über die Zonen verteilt — so läuft jeder Wert und jede Zone mindestens einmal, bei
   fünf statt acht Läufen (Laufzeit). Heute liest kein Code CENTRIC_ZEITMODELL; ab Schritt 4 beweisen diese Fälle die
   AUS-Neutralität jedes Nicht-"2"-Werts. */
const LAEUFE = [["UTC", undefined], ["Europe/Berlin", "1"], ["Pacific/Kiritimati", "true"], ["America/Los_Angeles", " 2"], ["UTC", "2 "]];

describe("ZEIT-B Golden-Anker Teil B: Handler-Abläufe, AUS-neutral gegen den Basis-Commit", () => {
  it("die Läufe decken alle vier Prozesszonen und alle AUS-Werte ab", () => {
    expect(new Set(LAEUFE.map(([z]) => z))).toEqual(new Set(ZONEN));
    expect(LAEUFE.map(([, w]) => w)).toEqual([undefined, "1", "true", " 2", "2 "]);
  });

  LAEUFE.forEach(([zone, wert], i) => {
    it(`Prozesszone ${zone}, CENTRIC_ZEITMODELL=${wert === undefined ? "unset" : JSON.stringify(wert)}: alle Abläufe gleich den Erwartungswerten`, async () => {
      zurueck("CENTRIC_ZEITMODELL", wert);
      process.env.TZ = zone;
      expect(new Date("2026-01-15T12:00:00Z").getTimezoneOffset(), `Prozesszone ${zone} wirkt nicht`).toBe(VERSATZ[zone]);
      const w = await ablaeufeRechnen(`zb-${i}`);
      expect(w).toEqual(ERWARTET);
    });
  });
});
