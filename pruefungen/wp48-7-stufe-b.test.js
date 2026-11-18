/* ==========================================================================
   WP-48.7 (Stufe b): MONATSABSCHLUSS — RECHNEN OHNE RAUMSPERRE

   docs/acc45/WP48-TEILSPEICHERUNG.md Abschnitt 5 und 7.7. Schalter
   CENTRIC_ABSCHLUSS_OHNE_SPERRE (nur zusammen mit
   CENTRIC_ABSCHLUSS_SEGMENTWEISE; Vorgabe aus). Abschließen, Wiederöffnen und
   Lohnexport lesen einen Schnappschuss (Kern + Jahr bis zum Monat, Stand,
   Epoche) ohne Sperre und rechnen dort; unter der Sperre nur Vergleich und
   Schreiben (compare-and-set). Bei Änderung neuer Schnappschuss, höchstens
   3, danach der gesperrte Weg der Stufe a.

   - Differenzialtest auf dem echten Handler: drei gleiche Räume — voller
     Weg (Schalter aus), Stufe a, Stufe b — mit einer festen, aus einem
     Startwert erzeugten Folge (kein Math.random) über mehrere Monate,
     zwei Betriebe, Rollen Leitung/Planung/Mitarbeiter, Wiederholungen,
     ungültige und außerhalb 2000–2999 liegende Monate (P2-12), falsche
     Prüfsummen, fremde Schreiber zwischen den Schritten. Status, Antwort
     und Platte (Kern-Inhalt und -Metadaten außer der Epoche, jede Scherbe,
     Vermerk, Zeiger) bytegleich. Nach jeder Absage: alle Dateien des Raums
     bytegleich wie vorher (Zustand, nicht nur Status).
   - Verzahnung mit festen Haken (kein Zufall, keine Uhr): ein fremder
     Schreiber zwischen Schnappschuss und Schreiben → neuer Schnappschuss,
     Ergebnis gleich „erst fremd, dann Abschluss" auf dem vollen Weg; drei
     Mal → gesperrter Weg; eine Absage, die der fremde Schreiber hinfällig
     macht, wird nicht ausgeliefert; Epochenwechsel; „unbestimmt" → Rückfall.
   - Schnappschuss: zerrissenes Lesen (Schreiber mitten im Lesen, liegendes
     Journal, Lesefehler) → null, nie ein gemischter Stand.
   - Schalter: nur genau „true" und nur mit Stufe a.

   Feste Zeitbasis: nur Date gefälscht (05.11.2026, 10:00 Berlin).
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { mkdtemp, rm, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

/* Kennungen der Abschlussereignisse (randomBytes(6) → ma-…) gehen in den Freeze und die Prüfsumme. Während eines
   Schritts liefert randomBytes(6) eine feste Folge (globalThis.__wp487bid), sonst der echte Zufall. */
vi.mock("node:crypto", async (original) => {
  const echt = await original();
  const randomBytes = (n, ...rest) => (n === 6 && globalThis.__wp487bid !== undefined
    ? Buffer.from(String(globalThis.__wp487bid++).padStart(12, "0").slice(-12), "hex") : echt.randomBytes(n, ...rest));
  return { ...echt, randomBytes, default: { ...(echt.default || echt), randomBytes } };
});
/* Haken (deterministische Verzahnung): nach dem Schnappschuss, bevor der Endpunkt rechnet und die Sperre nimmt, läuft
   globalThis.__wp487bHaken (await). Gezählt werden Schnappschüsse und das gesperrte Auswahl-Lesen (Stufe a). */
vi.mock("../server/lib/bestand.mjs", async (original) => {
  const echt = await original();
  return { ...echt,
    bestandSchnappschussAuswahl: async (...a) => {
      globalThis.__wp487bSchnapp = (globalThis.__wp487bSchnapp || 0) + 1;
      const r = await echt.bestandSchnappschussAuswahl(...a);
      if (globalThis.__wp487bHaken) await globalThis.__wp487bHaken(r, a[1]);
      return r;
    },
    bestandLesenAuswahlStreng: async (...a) => {
      globalThis.__wp487bGesperrt = (globalThis.__wp487bGesperrt || 0) + 1;
      return echt.bestandLesenAuswahlStreng(...a);
    } };
});

const WIRT = "127.0.0.1:3000";
let wurzel, laden, daten, B, S, MA, RS, sitzungAnlegen, dateiname;

let nr = 0;
const anfrage = async (pfad, { methode = "POST", rumpf, token } = {}) => {
  nr += 1;
  const kopf = { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.49.${Math.floor(nr / 250) % 250}.${nr % 250}` };
  if (methode !== "GET") kopf["content-type"] = "application/json";
  if (token) kopf.authorization = `Bearer ${token}`;
  const a = await daten(new Request(`http://${WIRT}/api/${pfad}`, { method: methode, headers: kopf,
    ...(methode === "GET" ? {} : { body: JSON.stringify(rumpf || {}) }) }), {});
  const text = await a.text();
  let d = {}; try { d = JSON.parse(text); } catch { /* leer */ }
  return { status: a.status, roh: text, ...d };
};

const JETZT = "2026-11-05T09:00:00Z";
const person = (id, pnr, rolle, extra = {}) => ({ id, vorname: "V", nachname: id.toUpperCase(), rolle, bereich: "e1",
  status: "aktiv", geburtstag: "1985-01-01", wochenstunden: 39, eintritt: "2024-01-01", personalnummer: pnr,
  zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }], ...extra });
const stempel = (tag, start, ende, extra = {}) => ({ start, startAm: `${tag}T05:00:00.000Z`, ortStart: "Ohne Standortfreigabe erfasst",
  innerhalbStart: null, geprueftStart: false, ...(ende ? { ende, endeAm: `${tag}T13:00:00.000Z`, ortEnde: "Ohne Standortfreigabe erfasst",
    innerhalbEnde: null, geprueftEnde: false } : {}), ...extra });
const MONATE = ["2024-06", "2025-11", "2025-12", "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11"];

function betrieb(id, pre) {
  const abweichungen = {}, einstempeln = {}, erfassung = {};
  const tag = (pid, t, s, e, x = {}) => { abweichungen[`${pid}|${t}`] = "F"; einstempeln[`${pid}|${t}`] = stempel(t, s, e, x);
    if (s && e) erfassung[`${pid}|${t}`] = { start: s, ende: e, bestaetigt: true, grund: "" }; };
  for (const mon of MONATE) {
    tag(`${pre}a1`, `${mon}-10`, "06:00", "14:00");
    tag(`${pre}a2`, `${mon}-12`, "06:00", "14:30");
    erfassung[`${pre}a1|${mon}-11`] = { start: "06:00", ende: "15:00", bestaetigt: true, grund: "länger geblieben" };
    abweichungen[`${pre}a1|${mon}-11`] = "F";
  }
  einstempeln[`${pre}a2|2026-03-20`] = stempel("2026-03-20", "06:00", null); abweichungen[`${pre}a2|2026-03-20`] = "F";
  einstempeln[`${pre}a2|2026-10-31`] = stempel("2026-10-31", "22:00", null, { startAm: "2026-10-31T21:00:00.000Z" });
  abweichungen[`${pre}a2|2026-10-31`] = "N";
  for (const [t, an, ab] of [["2026-03-28", "2026-03-28T21:00:00.000Z", "2026-03-29T04:00:00.000Z"],
    ["2025-12-31", "2025-12-31T21:00:00.000Z", "2026-01-01T05:00:00.000Z"]]) {
    abweichungen[`${pre}a1|${t}`] = "N";
    einstempeln[`${pre}a1|${t}`] = stempel(t, "22:00", "06:00", { startAm: an, endeAm: ab });
    erfassung[`${pre}a1|${t}`] = { start: "22:00", ende: "06:00", bestaetigt: true, grund: "" };
  }
  abweichungen["ohne-datum"] = "F";
  return { id, name: `Haus ${id}`, einheiten: [{ id: "e1", name: "WB 1" }], einstellungen: { ruhezeit: 11 },
    dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00", pause: 30 }, { id: "N", name: "Nacht", start: "22:00", ende: "06:00", pause: 30 }],
    personen: [person(`${pre}l1`, `${pre}9001`, "leitung"), person(`${pre}p1`, `${pre}9002`, "planer"),
      person(`${pre}a1`, `${pre}1001`, "mitarbeiter", { stundenuebertrag: 4 }), person(`${pre}a2`, `${pre}1002`, "mitarbeiter")],
    abweichungen, abwesenheiten: [{ id: "u1", personId: `${pre}a1`, art: "urlaub", von: "2026-04-20", bis: "2026-04-24" }],
    erfassung, einstempeln, anfragen: [], nachrichten: [], monatsabschluss: {} };
}
const raumAnlegen = async (raum) =>
  B.bestandSchreiben(laden(), raum, { version: 9, mandanten: [betrieb("m1", ""), betrieb("m2", "b")] }, { durch: "Pruefung" });
const ZUGANG = { "m1-leitung": ["l1", "leitung", 0, "m1"], "m1-planer": ["p1", "planer", 0, "m1"],
  "m1-mitarbeiter": ["a1", "mitarbeiter", 0, "m1"], "m2-leitung": ["bl1", "leitung", 1, "m2"] };
const token = async (raum, wer) => {
  const [p, rolle, betriebNr, mandantId] = ZUGANG[wer];
  return (await sitzungAnlegen({ bestand: raum, name: `V ${p}`, rolle, person: p, betrieb: betriebNr, mandantId, einheit: null }, 24 * 3600 * 1000)).token;
};
const mandant = async (raum, i = 0) => (await B.bestandLesen(laden(), raum)).bestand.mandanten[i];

/* Schalterstellungen der drei Wege. */
const WEGE = {
  voll: {},
  stufeA: { CENTRIC_ABSCHLUSS_SEGMENTWEISE: "true" },
  stufeB: { CENTRIC_ABSCHLUSS_SEGMENTWEISE: "true", CENTRIC_ABSCHLUSS_OHNE_SPERRE: "true" },
};
const SCHALTER = ["CENTRIC_ABSCHLUSS_SEGMENTWEISE", "CENTRIC_ABSCHLUSS_OHNE_SPERRE"];
const schalten = (werte = {}) => { for (const k of SCHALTER) { if (k in werte) process.env[k] = werte[k]; else delete process.env[k]; } };

/** Die Platte eines Raums, vergleichbar über Räume: Kern-Inhalt, Kern-Metadaten ohne Epoche, Scherben, Vermerk, Zeiger-Nr. */
async function platte(raum) {
  const store = laden();
  const kern = await store.getWithMetadata(S.kernSchluessel(raum), { type: "json" });
  const { epoche: _e, ...kernMeta } = kern.metadata;
  const zeiger = await store.get(`stand:${raum}:aktuell`, { type: "json" });
  const { blobs } = await store.list({ prefix: `scherbe:${raum}:` });
  const scherben = {};
  for (const b of blobs.map((x) => x.key).sort()) scherben[b.slice(`scherbe:${raum}:`.length)] = await store.get(b, { type: "json" });
  /* Vermerk: Inhalt gleich; die REIHENFOLGE der Abdrücke ist es nicht immer — der Segmentschreiber (teileSchreiben, seit
     Stufe a und WP-48.3) hängt eine neue Scherbe hinten an, der volle Weg ordnet nach zerlegen. Verglichen wird deshalb
     sortiert (dieselben Schlüssel, dieselben Abdrücke, dieselbe Zeit, derselbe Schreiber). */
  const v = await store.get(`stand:${raum}:${zeiger.nr}`, { type: "json" });
  const vermerk = { ...v, abdruecke: Object.fromEntries(Object.entries(v.abdruecke).sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0))) };
  return JSON.stringify({ kern: kern.data, kernMeta, nr: zeiger.nr, vermerk,
    scherben, journal: await store.get(`journal:${raum}`, { type: "json" }) });
}

/** Erster abweichender Pfad zweier JSON-Werte (für lesbare Meldungen) oder null. */
function unterschied(a, b, pfad = "") {
  if (JSON.stringify(a) === JSON.stringify(b)) return null;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return `${pfad}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`.slice(0, 600);
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.join() !== kb.join()) return `${pfad}: Schlüssel ${ka.join()} ≠ ${kb.join()}`.slice(0, 600);
  for (const k of ka) { const u = unterschied(a[k], b[k], `${pfad}.${k}`); if (u) return u; }
  return null;
}

/** Alle Dateien eines Raums wörtlich (Kern, Scherben, Vermerke, Zeiger, Journal) — für „nichts verändert". */
async function roh(raum) {
  const verz = path.join(wurzel, "centric");
  const praefixe = [`scherbe:${raum}:`, `stand:${raum}:`].map((p) => dateiname(p).slice(0, -".json".length));
  const genau = [`journal:${raum}`, S.kernSchluessel(raum)].map(dateiname);
  const aus = {};
  for (const n of (await readdir(verz)).sort())
    if (genau.includes(n) || praefixe.some((p) => n.startsWith(p))) aus[n] = await readFile(path.join(verz, n), "utf8");
  expect(Object.keys(aus).length).toBeGreaterThan(3);
  return aus;
}

/** Der Vermerk des aktuellen Stands passt zur Platte. */
async function vermerkPasst(raum) {
  const store = laden();
  const zeiger = await store.get(`stand:${raum}:aktuell`, { type: "json" });
  const kernMeta = await store.getWithMetadata(S.kernSchluessel(raum), { type: "json" });
  expect(Number(kernMeta.metadata.stand)).toBe(zeiger.nr);
  expect(kernMeta.metadata.epoche).toBe(zeiger.epoche);
  const v = await store.get(`stand:${raum}:${zeiger.nr}`, { type: "json" });
  expect(v.abdruecke.kern).toBe(S.kernAbdruck(kernMeta.data));
  const { blobs } = await store.list({ prefix: `scherbe:${raum}:` });
  const ids = [];
  for (const b of blobs) {
    const s = await store.get(b.key, { type: "json" });
    ids.push(`${s.mandantId}::${s.monat}`);
    expect(v.abdruecke[`${s.mandantId}::${s.monat}`]).toBe(S.abdruck(s));
  }
  expect(Object.keys(v.abdruecke).filter((x) => x !== "kern").sort()).toEqual(ids.sort());
  expect(await store.get(`journal:${raum}`, { type: "json" })).toBeNull();
}

/** Prüfsummen aller abgeschlossenen Monate stimmen mit dem eingefrorenen Ist überein (beide Betriebe). */
async function pruefsummenStimmen(raum) {
  for (const i of [0, 1]) {
    const m = await mandant(raum, i);
    for (const [mon, e] of Object.entries(m.monatsabschluss || {}))
      if (e && e.abgeschlossen) expect(MA.istAbdruck(m, mon), `${raum} ${m.id} ${mon}`).toBe(e.abdruck);
  }
}

/** Ein fremder Schreiber (unter der Raumsperre über bestandSchreiben): fn ändert den Betrieb i an Ort und Stelle. */
async function fremd(raum, fn, i = 0, opt = {}) {
  const g = await B.bestandLesen(laden(), raum);
  const b = structuredClone(g.bestand);
  fn(b.mandanten[i]);
  const e = await B.bestandSchreiben(laden(), raum, b, { erwarteterStand: g.stand, durch: "Fremd", ...opt });
  expect(e.ok).toBe(true);
}

/** Rumpf für den Lohnexport aus dem gespeicherten Abschluss (wie die Oberfläche). */
async function exportRumpf(raum, monat, i, extra = {}) {
  const m = await mandant(raum, i);
  const e = (m.monatsabschluss || {})[monat] || {};
  return { aktion: "lohnexport", monat, abdruck: e.abdruck, stand: e.stand, revision: e.revision ?? 1,
    zeilen: MA.datevZeilenAbdruck(MA.exportZeilenFuer(m, monat).zeilen), ...extra };
}

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-wp487b-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
  const { getStore } = await import("../server/lib/ablage.mjs");
  ({ dateiname } = await import("../server/lib/ablage.mjs"));
  laden = () => getStore({ name: "centric", consistency: "strong" });
  const schutz = await import("../server/lib/schutz.mjs");
  for (const art of Object.keys(schutz.GRENZEN)) schutz.GRENZEN[art] = { ...schutz.GRENZEN[art], versuche: 100000 };
  daten = (await import("../server/funktionen/daten.mjs")).default;
  B = await import("../server/lib/bestand.mjs");
  S = await import("../server/lib/scherben.mjs");
  MA = await import("../server/lib/monatsabschluss.mjs");
  RS = await import("../server/lib/raumsperre.mjs");
  ({ sitzungAnlegen } = await import("../server/lib/sitzungen.mjs"));
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(JETZT));
}, 60000);
afterEach(() => {
  schalten({});
  delete globalThis.__wp487bHaken; delete globalThis.__wp487bid;
  globalThis.__wp487bSchnapp = 0; globalThis.__wp487bGesperrt = 0;
});
afterAll(async () => {
  schalten({});
  vi.useRealTimers();
  if (wurzel) await rm(wurzel, { recursive: true, force: true });
});

/* Feste Folge aus einem Startwert (LCG), kein Math.random. */
function folge(start) {
  let z = start >>> 0;
  return (n) => { z = (Math.imul(z, 1664525) + 1013904223) >>> 0; return z % n; };
}

/* ------------------------------------------------------------------------ */
describe("Differenzialtest: voller Weg, Stufe a und Stufe b ergeben dieselbe Platte", { timeout: 600000 }, () => {
  const MON = ["2025-11", "2025-12", "2026-01", "2026-02", "2026-03", "2026-04", "2026-06", "2026-07", "2026-09", "2026-10", "2026-11", "1999-12", "3000-01", "2026-13"];
  const WER = ["m1-leitung", "m1-leitung", "m1-leitung", "m1-planer", "m1-mitarbeiter", "m2-leitung", "m2-leitung"];

  /** Ein Schritt der Folge: Anfrage oder fremder Schreiber, für alle drei Räume gleich. */
  function schritt(w) {
    const art = w(10);
    const monat = MON[w(MON.length)];
    const wer = WER[w(WER.length)];
    if (art === 0) return { fremd: w(3), monat };
    if (art <= 4) return { wer, rumpf: { aktion: "abschliessen", monat, ...(w(4) ? { trotzPrueffaellen: true } : {}), ...(w(3) === 0 ? { grund: "Lohnlauf" } : {}) } };
    if (art <= 6) return { wer, rumpf: { aktion: "wiederoeffnen", monat, grund: w(4) ? "Nachtrag zur Prüfung" : "kurz" } };
    return { wer, lohnexport: monat, falsch: w(5) === 0, extra: w(2) ? { trotzVormonat: true, vormonatKategorie: "abgestimmt", vormonatGrund: "Mit dem Lohnbüro abgestimmt" } : {} };
  }

  async function fremdSchritt(raum, x) {
    const i = x.monat.startsWith("2026") ? 0 : 1;
    if (x.fremd === 0) await fremd(raum, (m) => { m.erfassung[`${i ? "b" : ""}a2|2026-10-30`] = { start: "06:00", ende: "14:00", bestaetigt: true, grund: "" }; }, i);
    else if (x.fremd === 1) await fremd(raum, (m) => { m.personen[2].stundenuebertrag = (m.personen[2].stundenuebertrag || 0) + 1; }, i);
    else await fremd(raum, (m) => { m.abweichungen[`${i ? "b" : ""}a1|2026-02-14`] = "N"; }, i);
  }

  for (const start of [4807, 20261118]) {
    it(`Folge ${start}: 36 Schritte, Status, Antwort, Platte gleich; Absagen ändern keine Datei`, async () => {
      const raeume = Object.fromEntries(Object.keys(WEGE).map((w) => [w, `wp487b-d${start}-${w}`]));
      for (const r of Object.values(raeume)) await raumAnlegen(r);
      const tokens = {};
      for (const [w, r] of Object.entries(raeume)) { tokens[w] = {}; for (const z of Object.keys(ZUGANG)) tokens[w][z] = await token(r, z); }
      const w = folge(start);
      let erfolge = 0, absagen = 0;
      for (let i = 0; i < 36; i++) {
        const x = schritt(w);
        if (x.fremd !== undefined) {
          for (const r of Object.values(raeume)) await fremdSchritt(r, x);
          continue;
        }
        const ergebnisse = {};
        for (const [weg, r] of Object.entries(raeume)) {
          const bi = x.wer.startsWith("m2") ? 1 : 0;
          const rumpf = x.lohnexport ? await exportRumpf(r, x.lohnexport, bi, { ...x.extra, ...(x.falsch ? { abdruck: "0".repeat(64) } : {}) }) : x.rumpf;
          const vorher = await roh(r);
          schalten(WEGE[weg]);
          globalThis.__wp487bid = 1000 * (i + 1);
          globalThis.__wp487bSchnapp = 0;
          const a = await anfrage("monatsabschluss", { token: tokens[weg][x.wer], rumpf });
          const schnapp = globalThis.__wp487bSchnapp;
          delete globalThis.__wp487bid;
          schalten({});
          ergebnisse[weg] = a;
          if (a.status !== 200) expect(await roh(r), `Schritt ${i} ${weg}: Absage ${a.status} hat Dateien verändert`).toEqual(vorher);
          /* Stufe b läuft wirklich über den Schnappschuss (nur zulässige Aktionen mit gültigem Monat und Recht). */
          if (weg !== "stufeB") expect(schnapp, `Schritt ${i} ${weg}`).toBe(0);
        }
        const [av, aa, ab] = [ergebnisse.voll, ergebnisse.stufeA, ergebnisse.stufeB];
        expect(aa.status, `Schritt ${i} ${JSON.stringify(x)}: ${aa.roh}`).toBe(av.status);
        expect(ab.status, `Schritt ${i} ${JSON.stringify(x)}: ${ab.roh}`).toBe(av.status);
        expect(ab.roh, `Schritt ${i}`).toBe(av.roh);
        expect(aa.roh, `Schritt ${i}`).toBe(av.roh);
        const pv = await platte(raeume.voll);
        expect(await platte(raeume.stufeA), `Schritt ${i}: Platte Stufe a`).toBe(pv);
        expect(await platte(raeume.stufeB), `Schritt ${i}: Platte Stufe b`).toBe(pv);
        await vermerkPasst(raeume.stufeB);
        if (av.status === 200) erfolge++; else absagen++;
      }
      await pruefsummenStimmen(raeume.stufeB);
      /* Die Folge hat beides wirklich durchlaufen. */
      expect(erfolge, "Erfolge").toBeGreaterThan(3);
      expect(absagen, "Absagen").toBeGreaterThan(3);
    });
  }

  it("feste Grenzfälle: Wiederholung, Jahreswechsel, leerer Monat, P2-12 (1999-12, 3000-01), Rollen, zweiter Betrieb", async () => {
    const raeume = Object.fromEntries(Object.keys(WEGE).map((w) => [w, `wp487b-g-${w}`]));
    for (const r of Object.values(raeume)) await raumAnlegen(r);
    const SCHRITTE = [
      ["m1-leitung", { aktion: "abschliessen", monat: "2026-03" }, 409],
      ["m1-leitung", { aktion: "abschliessen", monat: "2026-03", trotzPrueffaellen: true, grund: "Lohnlauf März" }, 200],
      ["m1-leitung", { aktion: "abschliessen", monat: "2026-03", trotzPrueffaellen: true }, 409],     // Wiederholung
      ["m1-planer", { aktion: "abschliessen", monat: "2026-01", trotzPrueffaellen: true }, 200],
      ["m1-planer", { aktion: "wiederoeffnen", monat: "2026-01", grund: "Planung darf nicht" }, 403],
      ["m1-mitarbeiter", { aktion: "abschliessen", monat: "2026-02" }, 403],
      ["m1-leitung", { lohnexport: "2026-03" }, 409],
      ["m1-leitung", { lohnexport: "2026-03", extra: { trotzVormonat: true, vormonatKategorie: "abgestimmt", vormonatGrund: "Mit dem Lohnbüro abgestimmt" } }, 200],
      ["m1-leitung", { lohnexport: "2026-03", extra: { trotzVormonat: true, vormonatKategorie: "abgestimmt", vormonatGrund: "Mit dem Lohnbüro abgestimmt" } }, null], // Wiederholung
      ["m1-leitung", { aktion: "wiederoeffnen", monat: "2026-03", grund: "Nachtrag nach dem Export" }, 409],
      ["m1-leitung", { aktion: "abschliessen", monat: "2025-12", trotzPrueffaellen: true }, 200],
      ["m1-leitung", { aktion: "abschliessen", monat: "2026-06", trotzPrueffaellen: true }, 200],
      ["m1-leitung", { aktion: "wiederoeffnen", monat: "2026-06", grund: "Leeren Monat neu prüfen" }, 200],
      ["m1-leitung", { aktion: "abschliessen", monat: "1999-12", trotzPrueffaellen: true }, 422],
      ["m1-leitung", { aktion: "abschliessen", monat: "3000-01", trotzPrueffaellen: true }, 422],
      ["m1-leitung", { aktion: "wiederoeffnen", monat: "1999-12", grund: "außerhalb des Bereichs" }, 409],
      ["m1-leitung", { lohnexport: "1999-12" }, 422],
      ["m1-leitung", { aktion: "abschliessen", monat: "2026-11" }, 422],
      ["m2-leitung", { aktion: "abschliessen", monat: "2026-10", trotzPrueffaellen: true }, 200],
      ["m2-leitung", { aktion: "wiederoeffnen", monat: "2026-10", grund: "Nachtdienst prüfen" }, 200],
      ["m1-leitung", { aktion: "wiederoeffnen", monat: "2025-12", grund: "Nachtdienst Silvester prüfen" }, 200],
      ["m1-leitung", { aktion: "abschliessen", monat: "2025-12", trotzPrueffaellen: true }, 200],
    ];
    const tokens = {};
    for (const [w, r] of Object.entries(raeume)) { tokens[w] = {}; for (const z of Object.keys(ZUGANG)) tokens[w][z] = await token(r, z); }
    const m2davor = JSON.stringify(await mandant(raeume.stufeB, 1));
    for (const [i, [wer, x, erwartet]] of SCHRITTE.entries()) {
      const aus = {};
      for (const [weg, r] of Object.entries(raeume)) {
        const rumpf = x.lohnexport ? await exportRumpf(r, x.lohnexport, wer.startsWith("m2") ? 1 : 0, x.extra) : x;
        const vorher = await roh(r);
        schalten(WEGE[weg]);
        globalThis.__wp487bid = 7000 + 100 * i;
        aus[weg] = await anfrage("monatsabschluss", { token: tokens[weg][wer], rumpf });
        delete globalThis.__wp487bid;
        schalten({});
        if (aus[weg].status !== 200) expect(await roh(r), `Schritt ${i} ${weg}`).toEqual(vorher);
      }
      if (erwartet !== null) expect(aus.voll.status, `Schritt ${i}: ${aus.voll.roh}`).toBe(erwartet);
      expect(aus.stufeB.roh, `Schritt ${i}`).toBe(aus.voll.roh);
      expect(aus.stufeB.status).toBe(aus.voll.status);
      expect(aus.stufeA.roh, `Schritt ${i}`).toBe(aus.voll.roh);
      expect(unterschied(JSON.parse(await platte(raeume.stufeB)), JSON.parse(await platte(raeume.voll))), `Schritt ${i}`).toBe(null);
      expect(await platte(raeume.stufeA), `Schritt ${i}`).toBe(await platte(raeume.voll));
      /* Mandantentrennung: Bis Schritt 18 hat niemand den zweiten Betrieb berührt. */
      if (i < 18) expect(JSON.stringify(await mandant(raeume.stufeB, 1)), `Schritt ${i}`).toBe(m2davor);
    }
    await vermerkPasst(raeume.stufeB);
    await pruefsummenStimmen(raeume.stufeB);
  });
});

/* ------------------------------------------------------------------------ */
describe("Verzahnung: fremder Schreiber zwischen Schnappschuss und Schreiben (feste Haken)", { timeout: 300000 }, () => {
  /**
   * Stufe b mit einem Haken nach dem Schnappschuss Nr. 1..n gegen den vollen Weg, auf dem dieselben fremden Schreiber
   * VOR dem Abschluss laufen (die einzige gültige Reihenfolge, wenn der Abschluss nach ihnen schreibt).
   */
  async function verzahnt(name, rumpf, fremdeSchreiber, { erwartetStatus = 200, nachRuecklauf = false, vorab = null } = {}) {
    const rv = `wp487b-v-${name}-voll`, rb = `wp487b-v-${name}-b`;
    await raumAnlegen(rv); await raumAnlegen(rb);
    if (vorab) { await vorab(rv); await vorab(rb); }
    for (const f of fremdeSchreiber) await f(rv);
    schalten({});
    const tv = await token(rv, "m1-leitung"), tb = await token(rb, "m1-leitung");
    globalThis.__wp487bid = 42000;
    const av = await anfrage("monatsabschluss", { token: tv, rumpf });
    let n = 0;
    const freiDabei = [];
    globalThis.__wp487bHaken = async (schnapp, raum) => {
      if (raum !== rb || n >= fremdeSchreiber.length) return;
      expect(schnapp, "Schnappschuss stimmig").toBeTruthy();
      /* Ohne Raumsperre gerechnet: Ein fremder Schreiber kommt hier durch (sonst stünde er bis zur Zeitgrenze). */
      freiDabei.push(!RS.sperreGehalten(raum));
      await fremdeSchreiber[n++](raum);
    };
    schalten(WEGE.stufeB);
    globalThis.__wp487bid = 42000;
    globalThis.__wp487bSchnapp = 0; globalThis.__wp487bGesperrt = 0;
    const ab = await anfrage("monatsabschluss", { token: tb, rumpf });
    const zahlen = { schnapp: globalThis.__wp487bSchnapp, gesperrt: globalThis.__wp487bGesperrt };
    delete globalThis.__wp487bHaken; delete globalThis.__wp487bid;
    schalten({});
    expect(av.status, av.roh).toBe(erwartetStatus);
    expect(JSON.parse(ab.roh)).toEqual(JSON.parse(av.roh));
    expect(ab.roh).toBe(av.roh);
    expect(await platte(rb)).toBe(await platte(rv));
    await vermerkPasst(rb);
    await pruefsummenStimmen(rb);
    expect(freiDabei.every(Boolean)).toBe(true);
    expect(n, "alle fremden Schreiber liefen dazwischen").toBe(fremdeSchreiber.length);
    if (nachRuecklauf) {
      expect(zahlen.schnapp, "drei Schnappschüsse, dann der gesperrte Weg").toBe(3);
      expect(zahlen.gesperrt, "gesperrter Weg (Stufe a)").toBe(1);
    } else {
      expect(zahlen.schnapp).toBe(fremdeSchreiber.length + 1);
      expect(zahlen.gesperrt, "kein gesperrter Weg").toBe(0);
    }
    return { av, ab };
  }
  const OKT = { aktion: "abschliessen", monat: "2026-10", trotzPrueffaellen: true };
  const nachtEnde = (raum) => fremd(raum, (m) => { m.einstempeln["a2|2026-10-31"] = { ...m.einstempeln["a2|2026-10-31"], ende: "06:00", endeAm: "2026-11-01T05:00:00.000Z" }; });
  const erfassungOkt = (raum) => fremd(raum, (m) => { m.erfassung["a1|2026-10-29"] = { start: "06:00", ende: "14:00", bestaetigt: true, grund: "" }; });
  const kernAenderung = (raum) => fremd(raum, (m) => { m.personen[2].stundenuebertrag = 9; });
  const andererBetrieb = (raum) => fremd(raum, (m) => { m.erfassung["ba1|2026-10-29"] = { start: "06:00", ende: "14:00", bestaetigt: true, grund: "" }; }, 1);

  it("ein Stempel im Monat dazwischen: neuer Schnappschuss, Prüfsumme über den Stempel, gleich „erst Stempel, dann Abschluss“", async () => {
    await verzahnt("stempel", OKT, [nachtEnde]);
  });
  it("Kernänderung (Stundenübertrag) dazwischen: Freeze mit neuem Konto, gleich dem vollen Weg", async () => {
    await verzahnt("kern", OKT, [kernAenderung]);
  });
  it("Schreiber im anderen Betrieb dazwischen: neuer Schnappschuss (Stand), Ergebnis gleich", async () => {
    await verzahnt("betrieb", OKT, [andererBetrieb]);
  });
  it("dreimal dazwischen: nach 3 Schnappschüssen der gesperrte Weg, keine neue Absage, Ergebnis gleich", async () => {
    await verzahnt("dreimal", OKT, [nachtEnde, erfassungOkt, kernAenderung], { nachRuecklauf: true });
  });
  it("eine Absage, die der Schreiber dazwischen hinfällig macht, wird nicht ausgeliefert (409 → 200)", async () => {
    /* März ohne trotzPrueffaellen: 409 wegen des offenen Stempels am 20.03. — der fremde Schreiber schließt ihn. */
    const zu = (raum) => fremd(raum, (m) => { m.einstempeln["a2|2026-03-20"] = { ...m.einstempeln["a2|2026-03-20"], ende: "14:00", endeAm: "2026-03-20T13:00:00.000Z" };
      m.erfassung["a2|2026-03-20"] = { start: "06:00", ende: "14:00", bestaetigt: true, grund: "" }; });
    await verzahnt("absage", { aktion: "abschliessen", monat: "2026-03" }, [zu], { erwartetStatus: 200 });
  });
  it("ein Erfolg, den der Schreiber dazwischen unmöglich macht, schreibt nicht (200 → 409, Platte wie voll)", async () => {
    /* Der fremde Schreiber schließt den Oktober selbst ab (wie ein zweiter Abschluss) — danach „schon abgeschlossen“. */
    const fremderAbschluss = async (raum) => {
      const vorher = process.env.CENTRIC_ABSCHLUSS_OHNE_SPERRE;
      schalten({});
      const t = await token(raum, "m1-leitung");
      globalThis.__wp487bid = 50000;
      const a = await anfrage("monatsabschluss", { token: t, rumpf: OKT });
      expect(a.status, a.roh).toBe(200);
      if (vorher) schalten(WEGE.stufeB);
      globalThis.__wp487bid = 42000;
    };
    const rv = "wp487b-v-doppelt-voll", rb = "wp487b-v-doppelt-b";
    await raumAnlegen(rv); await raumAnlegen(rb);
    await fremderAbschluss(rv);
    const tv = await token(rv, "m1-leitung"), tb = await token(rb, "m1-leitung");
    globalThis.__wp487bid = 42000;
    const av = await anfrage("monatsabschluss", { token: tv, rumpf: OKT });
    let n = 0;
    globalThis.__wp487bHaken = async (s, raum) => { if (raum === rb && n++ === 0) await fremderAbschluss(raum); };
    schalten(WEGE.stufeB);
    globalThis.__wp487bid = 42000;
    const ab = await anfrage("monatsabschluss", { token: tb, rumpf: OKT });
    delete globalThis.__wp487bHaken; schalten({});
    expect([av.status, ab.status], ab.roh).toEqual([409, 409]);
    expect(ab.roh).toBe(av.roh);
    expect(await platte(rb)).toBe(await platte(rv));
    await vermerkPasst(rb);
    await pruefsummenStimmen(rb);
  });
  it("Epochenwechsel dazwischen (Wiederherstellen): neuer Schnappschuss mit neuer Epoche, Ergebnis gleich", async () => {
    const epoche = (raum) => fremd(raum, (m) => { m.name = `${m.name} (wiederhergestellt)`; }, 0, { neueEpoche: true });
    await verzahnt("epoche", OKT, [epoche]);
  });
  it("„unbestimmt“ (Scherbe ohne Vermerk dazwischen): Rückfall auf den gesperrten Weg, gleich dem vollen Weg", async () => {
    const fremdeScherbe = async (raum) => {
      await laden().setJSON(S.scherbenSchluessel(raum, "m1", "2023-02"), { mandantId: "m1", monat: "2023-02",
        felder: { abweichungen: { "a1|2023-02-01": "F" }, erfassung: {}, einstempeln: {}, istEingefroren: {} } });
    };
    const rv = "wp487b-v-unbestimmt-voll", rb = "wp487b-v-unbestimmt-b";
    await raumAnlegen(rv); await raumAnlegen(rb);
    await fremdeScherbe(rv);
    schalten({});
    const tv = await token(rv, "m1-leitung"), tb = await token(rb, "m1-leitung");
    globalThis.__wp487bid = 43000;
    const av = await anfrage("monatsabschluss", { token: tv, rumpf: OKT });
    let n = 0;
    globalThis.__wp487bHaken = async (s, raum) => { if (raum === rb && n++ === 0) await fremdeScherbe(raum); };
    schalten(WEGE.stufeB);
    globalThis.__wp487bid = 43000;
    globalThis.__wp487bSchnapp = 0; globalThis.__wp487bGesperrt = 0;
    const ab = await anfrage("monatsabschluss", { token: tb, rumpf: OKT });
    const zahlen = [globalThis.__wp487bSchnapp, globalThis.__wp487bGesperrt];
    delete globalThis.__wp487bHaken; schalten({});
    expect([av.status, ab.status], ab.roh).toEqual([200, 200]);
    expect(zahlen, "ein Schnappschuss, dann der gesperrte Weg").toEqual([1, 1]);
    expect(ab.roh).toBe(av.roh);
    expect(await platte(rb)).toBe(await platte(rv));
  });
  it("Absage unter unverändertem Stand: genau ein Schnappschuss, Dateien unverändert", async () => {
    const raum = "wp487b-v-absage-fest";
    await raumAnlegen(raum);
    const t = await token(raum, "m1-leitung");
    const vorher = await roh(raum);
    schalten(WEGE.stufeB);
    globalThis.__wp487bSchnapp = 0; globalThis.__wp487bGesperrt = 0;
    const a = await anfrage("monatsabschluss", { token: t, rumpf: { aktion: "abschliessen", monat: "2026-03" } });
    schalten({});
    expect(a.status, a.roh).toBe(409);
    expect([globalThis.__wp487bSchnapp, globalThis.__wp487bGesperrt]).toEqual([1, 0]);
    expect(await roh(raum)).toEqual(vorher);
  });
  it("Absage, dreimal ein Schreiber dazwischen: gesperrter Weg entscheidet; Dateien gleich dem Stand nach den Schreibern", async () => {
    const rumpf = { aktion: "abschliessen", monat: "2026-11" };    // nicht vergangen → 422
    const r = await verzahnt("absage3", rumpf, [kernAenderung, erfassungOkt, andererBetrieb], { erwartetStatus: 422, nachRuecklauf: true });
    expect(r.ab.status).toBe(422);
  });
});

/* ------------------------------------------------------------------------ */
describe("Schnappschuss: nie ein gemischter Stand", { timeout: 120000 }, () => {
  /** Ablage, die beim n-ten Lesen eines Schlüssels mit dem Präfix einmal `vorher` ausführt. */
  function mitHaken(store, praefix, vorher) {
    let fertig = false;
    const vor = async (k) => { if (!fertig && String(k).startsWith(praefix)) { fertig = true; await vorher(); } };
    return { ...store,
      get: async (k, o) => { await vor(k); return store.get(k, o); },
      getWithMetadata: async (k, o) => { await vor(k); return store.getWithMetadata(k, o); },
      list: (o) => store.list(o), getMetadata: (k) => store.getMetadata(k) };
  }
  const waehle = (kern) => (kern.mandanten[0] ? ["m1::2026-01", "m1::2026-02", "m1::2026-03"] : null);

  it("ruhig: stimmig, Stand und Epoche des Zeigers, Inhalt gleich dem gesperrten Auswahl-Lesen", async () => {
    const raum = "wp487b-s-ruhig";
    await raumAnlegen(raum);
    const s = await B.bestandSchnappschussAuswahl(laden(), raum, waehle);
    const z = await laden().get(`stand:${raum}:aktuell`, { type: "json" });
    expect([s.stand, s.epoche]).toEqual([String(z.nr), z.epoche]);
    const g = await B.unterRaumsperre(raum, () => B.bestandLesenAuswahlStreng(laden(), raum, waehle));
    expect(JSON.stringify(s)).toBe(JSON.stringify(g));
  });
  it("ein ganzer Schreibvorgang mitten im Lesen (nach dem Kern, vor den Scherben) → null", async () => {
    const raum = "wp487b-s-mitten";
    await raumAnlegen(raum);
    const st = mitHaken(laden(), `scherbe:${raum}:`, () => fremd(raum, (m) => { m.abweichungen["a1|2026-02-03"] = "N"; }));
    expect(await B.bestandSchnappschussAuswahl(st, raum, waehle)).toBeNull();
    /* Danach wieder stimmig, mit dem neuen Inhalt. */
    const s = await B.bestandSchnappschussAuswahl(laden(), raum, waehle);
    expect(s.bestand.mandanten[0].abweichungen["a1|2026-02-03"]).toBe("N");
  });
  it("ein Schreibvorgang zwischen erstem Zeiger und Journal → null", async () => {
    const raum = "wp487b-s-journal";
    await raumAnlegen(raum);
    const st = mitHaken(laden(), `journal:${raum}`, () => fremd(raum, (m) => { m.personen[2].stundenuebertrag = 1; }));
    expect(await B.bestandSchnappschussAuswahl(st, raum, waehle)).toBeNull();
  });
  it("liegendes Journal → null; Lesefehler → null (nie 503 ohne Sperre)", async () => {
    const raum = "wp487b-s-fehler";
    await raumAnlegen(raum);
    const journal = { ...laden(), get: async (k, o) => (k === `journal:${raum}` ? { id: "x", schritte: [], pruefsumme: "falsch" } : laden().get(k, o)),
      getWithMetadata: (k, o) => laden().getWithMetadata(k, o), list: (o) => laden().list(o) };
    expect(await B.bestandSchnappschussAuswahl(journal, raum, waehle)).toBeNull();
    const kaputt = { ...laden(), get: async (k, o) => { if (String(k).startsWith(`scherbe:${raum}:`)) throw new Error("EIO"); return laden().get(k, o); },
      getWithMetadata: (k, o) => laden().getWithMetadata(k, o), list: (o) => laden().list(o) };
    expect(await B.bestandSchnappschussAuswahl(kaputt, raum, waehle)).toBeNull();
  });
  it("standUnveraendert: nur unter der Sperre; Stand, Epoche, Journal", async () => {
    const raum = "wp487b-s-stand";
    await raumAnlegen(raum);
    const z = await laden().get(`stand:${raum}:aktuell`, { type: "json" });
    await expect(B.standUnveraendert(laden(), raum, z.nr, z.epoche)).rejects.toThrow(/Raumsperre/);
    const unter = (stand, epoche) => B.unterRaumsperre(raum, () => B.standUnveraendert(laden(), raum, stand, epoche));
    expect(await unter(z.nr, z.epoche)).toBe(true);
    expect(await unter(z.nr + 1, z.epoche)).toBe(false);
    expect(await unter(z.nr, "0".repeat(16))).toBe(false);
    expect(await unter(z.nr, null)).toBe(false);
    await fremd(raum, (m) => { m.name = "neu"; });
    expect(await unter(z.nr, z.epoche)).toBe(false);
  });
});

/* ------------------------------------------------------------------------ */
describe("Schalter", { timeout: 120000 }, () => {
  it("Stufe b nur bei genau „true“ UND mit Stufe a; sonst kein Schnappschuss", async () => {
    const raum = "wp487b-schalter";
    await raumAnlegen(raum);
    const t = await token(raum, "m1-leitung");
    const faelle = [
      [{ CENTRIC_ABSCHLUSS_OHNE_SPERRE: "true" }, 0],
      ...["TRUE", "1", "", "true "].map((w) => [{ CENTRIC_ABSCHLUSS_SEGMENTWEISE: "true", CENTRIC_ABSCHLUSS_OHNE_SPERRE: w }, 0]),
      [WEGE.stufeB, 1],
    ];
    for (const [werte, schnapp] of faelle) {
      schalten(werte);
      globalThis.__wp487bSchnapp = 0;
      const a = await anfrage("monatsabschluss", { token: t, rumpf: { aktion: "abschliessen", monat: "2026-03" } });
      schalten({});
      expect(a.status, a.roh).toBe(409);
      expect(globalThis.__wp487bSchnapp, JSON.stringify(werte)).toBe(schnapp);
    }
  });
  it("Korrekturaktionen und ungültiger Monat: kein Schnappschuss", async () => {
    const raum = "wp487b-schalter-korr";
    await raumAnlegen(raum);
    const t = await token(raum, "m1-leitung");
    schalten(WEGE.stufeB);
    globalThis.__wp487bSchnapp = 0;
    await anfrage("monatsabschluss", { token: t, rumpf: { aktion: "korrektur-beginnen", monat: "2026-03", grund: "Nachtrag Stunden", anlass: "nachtrag" } });
    await anfrage("monatsabschluss", { token: t, rumpf: { aktion: "abschliessen", monat: "2026-13" } });
    schalten({});
    expect(globalThis.__wp487bSchnapp).toBe(0);
  });
});
