/* ==========================================================================
   WP-48.7 (Stufe a): MONATSABSCHLUSS SEGMENTWEISE

   docs/acc45/WP48-TEILSPEICHERUNG.md Abschnitt 5 und 7.3. Schalter
   CENTRIC_ABSCHLUSS_SEGMENTWEISE (Vorgabe aus). Mit Schalter lesen
   Abschließen, Wiederöffnen und Lohnexport unter der Raumsperre nur Kern +
   die Scherben des Jahres bis zum Monat und schreiben Kern + die Scherbe
   des Monats über den Segmentschreiber.

   - Gleichwertigkeit: dieselbe Folge von Aktionen (Erfolge und Absagen,
     Jahreswechsel, leerer Monat, Lohnexport mit Vormonat, Wiederöffnen
     eines leeren Monats) in zwei gleichen Räumen — voller Weg gegen
     segmentweise. Status, Antwort, zusammengesetzter Bestand und jede
     einzelne Datei (Kern, Scherben) sind gleich (bis auf die zufälligen
     Kennungen ma-…); der Vermerk des Segmentwegs passt zur Platte.
   - Zugriff: Eine unlesbare Scherbe außerhalb des Jahres stört den
     Segmentweg nicht (sie wird weder gelesen noch geschrieben) — der volle
     Weg bricht an ihr ab (503). Eine unlesbare Scherbe im Jahr bricht beide
     ab, nichts wird geschrieben.
   - Fail-closed zurück auf den vollen Weg bei laufender Korrekturrevision
     in irgendeinem Betrieb des Raums; Schalter nur bei genau „true".
   - Rennen: Abschluss gegen einen Stempel im Monat — Prüfsumme stimmt immer.

   Feste Zeitbasis: nur Date gefälscht (05.11.2026, 10:00 Berlin).
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

/* Kennungen der Abschlussereignisse (randomBytes(6) → ma-…) gehen über die Kennung abgeschlossener Vormonate
   ("vs") in den Freeze und damit in die Prüfsumme. Damit beide Räume dieselben Bytes schreiben, liefert randomBytes(6)
   während eines Schritts eine feste Folge (globalThis.__wp487id); sonst und für alle anderen Längen der echte Zufall. */
vi.mock("node:crypto", async (original) => {
  const echt = await original();
  const randomBytes = (n, ...rest) => (n === 6 && globalThis.__wp487id !== undefined
    ? Buffer.from(String(globalThis.__wp487id++).padStart(12, "0").slice(-12), "hex") : echt.randomBytes(n, ...rest));
  return { ...echt, randomBytes, default: { ...(echt.default || echt), randomBytes } };
});
/* Rückfallpfad (Review PR #322, Auflage 1): abschlussTeile liefert auf Wunsch null — wie bei einer Änderung außerhalb
   des Monats. Gezählt wird, wie oft der Endpunkt abschlussTeile aufruft. */
vi.mock("../server/lib/abschluss-segmentweise.mjs", async (original) => {
  const echt = await original();
  return { ...echt, abschlussTeile: (...a) => {
    globalThis.__wp487teile = (globalThis.__wp487teile || 0) + 1;
    return globalThis.__wp487nichtTeile ? null : echt.abschlussTeile(...a);
  } };
});

const WIRT = "127.0.0.1:3000";
const SCHALTER = "CENTRIC_ABSCHLUSS_SEGMENTWEISE";
let wurzel, laden, daten, B, S, MA, RS, sitzungAnlegen, dateiname;

let nr = 0;
const anfrage = async (pfad, { methode = "POST", rumpf, token } = {}) => {
  nr += 1;
  const kopf = { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.48.${Math.floor(nr / 250) % 250}.${nr % 250}` };
  if (methode !== "GET") kopf["content-type"] = "application/json";
  if (token) kopf.authorization = `Bearer ${token}`;
  const a = await daten(new Request(`http://${WIRT}/api/${pfad}`, { method: methode, headers: kopf,
    ...(methode === "GET" ? {} : { body: JSON.stringify(rumpf || {}) }) }), {});
  const text = await a.text();
  let d = {}; try { d = JSON.parse(text); } catch { /* leer */ }
  return { status: a.status, roh: text, ...d };
};

const JETZT = "2026-11-05T09:00:00Z";
const ID = (n) => `${String(n).padStart(8, "0")}-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ROLLEN = { l1: "leitung", a1: "mitarbeiter", a2: "mitarbeiter" };
const person = (id, pnr, extra = {}) => ({ id, vorname: "V", nachname: id.toUpperCase(), rolle: ROLLEN[id] || "mitarbeiter", bereich: "e1",
  status: "aktiv", geburtstag: "1985-01-01", wochenstunden: 39, eintritt: "2024-01-01", personalnummer: pnr,
  zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }], ...extra });
const stempel = (tag, start, ende, extra = {}) => ({ start, startAm: `${tag}T05:00:00.000Z`, ortStart: "Ohne Standortfreigabe erfasst",
  innerhalbStart: null, geprueftStart: false, ...(ende ? { ende, endeAm: `${tag}T13:00:00.000Z`, ortEnde: "Ohne Standortfreigabe erfasst",
    innerhalbEnde: null, geprueftEnde: false } : {}), ...extra });
/* Monate mit Daten: ein Monat 2024 (außerhalb jedes Jahres, das hier abgeschlossen wird), Nov./Dez. 2025, 2026 ohne Juni. */
const MONATE = ["2024-06", "2025-11", "2025-12", "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11"];

function betrieb(id, pre, extra = {}) {
  const abweichungen = {}, einstempeln = {}, erfassung = {};
  const tag = (pid, t, s, e, x = {}) => { abweichungen[`${pid}|${t}`] = "F"; einstempeln[`${pid}|${t}`] = stempel(t, s, e, x);
    if (s && e) erfassung[`${pid}|${t}`] = { start: s, ende: e, bestaetigt: true, grund: "" }; };
  for (const mon of MONATE) {
    tag(`${pre}a1`, `${mon}-10`, "06:00", "14:00");
    tag(`${pre}a2`, `${mon}-12`, "06:00", "14:30");
    erfassung[`${pre}a1|${mon}-11`] = { start: "06:00", ende: "15:00", bestaetigt: true, grund: "länger geblieben" };
    abweichungen[`${pre}a1|${mon}-11`] = "F";
  }
  /* März: ein unvollständiger Stempel (Prüffall). Oktober: Nachtdienst vom Monatsletzten noch offen. */
  einstempeln[`${pre}a2|2026-03-20`] = stempel("2026-03-20", "06:00", null); abweichungen[`${pre}a2|2026-03-20`] = "F";
  einstempeln[`${pre}a2|2026-10-31`] = stempel("2026-10-31", "22:00", null, { startAm: "2026-10-31T21:00:00.000Z" });
  abweichungen[`${pre}a2|2026-10-31`] = "N";
  /* Nachtdienste über die Zeitumstellung (29.03. 7 h, 25.10. 9 h Wanduhr 22–6) und über den Jahreswechsel 31.12.→01.01.
     (Review PR #322, Auflage 3). Der Schlüssel gehört zum Tag des Beginns. */
  for (const [t, an, ab] of [["2026-03-28", "2026-03-28T21:00:00.000Z", "2026-03-29T04:00:00.000Z"],
    ["2026-10-24", "2026-10-24T20:00:00.000Z", "2026-10-25T05:00:00.000Z"], ["2025-12-31", "2025-12-31T21:00:00.000Z", "2026-01-01T05:00:00.000Z"]]) {
    abweichungen[`${pre}a1|${t}`] = "N";
    einstempeln[`${pre}a1|${t}`] = stempel(t, "22:00", "06:00", { startAm: an, endeAm: ab });
    erfassung[`${pre}a1|${t}`] = { start: "22:00", ende: "06:00", bestaetigt: true, grund: "" };
  }
  /* Ein Eintrag ohne erkennbares Datum bleibt im Kern (scherben.mjs) — muss durch beide Wege gleich laufen. */
  abweichungen["ohne-datum"] = "F";
  return { id, name: `Haus ${id}`, einheiten: [{ id: "e1", name: "WB 1" }], einstellungen: { ruhezeit: 11 },
    dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00", pause: 30 }, { id: "N", name: "Nacht", start: "22:00", ende: "06:00", pause: 30 }],
    personen: [person(`${pre}l1`, `${pre}9001`, { rolle: "leitung" }), person(`${pre}a1`, `${pre}1001`, { stundenuebertrag: 4 }), person(`${pre}a2`, `${pre}1002`)],
    abweichungen, abwesenheiten: [{ id: "u1", personId: `${pre}a1`, art: "urlaub", von: "2026-04-20", bis: "2026-04-24" }],
    erfassung, einstempeln, anfragen: [], nachrichten: [], monatsabschluss: {}, ...extra };
}
const raumAnlegen = async (raum, m2extra = {}, weitere = []) =>
  B.bestandSchreiben(laden(), raum, { version: 9, mandanten: [betrieb("m1", ""), betrieb("m2", "b", m2extra), ...weitere] }, { durch: "Pruefung" });
const token = async (raum, person = "l1", rolle = "leitung", betrieb = 0, mandantId = "m1") =>
  (await sitzungAnlegen({ bestand: raum, name: `V ${person}`, rolle, person, betrieb, mandantId, einheit: null }, 24 * 3600 * 1000)).token;
const mandant = async (raum, i = 0) => (await B.bestandLesen(laden(), raum)).bestand.mandanten[i];
const datei = (schluessel) => path.join(wurzel, "centric", dateiname(schluessel));
const schalter = (wert) => { if (wert === undefined) delete process.env[SCHALTER]; else process.env[SCHALTER] = wert; };

/** Zufällige Kennungen (ma-…) gleichsetzen; sonst nichts. */
const norm = (x) => JSON.stringify(x).replace(/ma-[0-9a-f]{12}/g, "ma-X");

/** Alles, was auf der Platte zum Raum liegt: Kern und Scherben (ohne Raumnamen im Schlüssel). */
async function platte(raum) {
  const store = laden();
  const kern = await store.get(S.kernSchluessel(raum), { type: "json" });
  const { blobs } = await store.list({ prefix: `scherbe:${raum}:` });
  const scherben = {};
  for (const b of blobs.map((x) => x.key).sort()) scherben[b.slice(`scherbe:${raum}:`.length)] = await store.get(b, { type: "json" });
  return { kern: norm(kern), scherben: norm(scherben) };
}

/** Der Vermerk des aktuellen Stands passt zur Platte: je Scherbe derselbe Abdruck, keine fehlt, keine zu viel. */
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
    const id = `${s.mandantId}::${s.monat}`;
    ids.push(id);
    expect(v.abdruecke[id], id).toBe(S.abdruck(s));
  }
  expect(Object.keys(v.abdruecke).filter((x) => x !== "kern").sort()).toEqual(ids.sort());
}

/** Rumpf für den Lohnexport aus dem gespeicherten Abschluss (wie die Oberfläche: Datei erzeugen, dann bestätigen). */
async function exportRumpf(raum, monat, extra = {}) {
  const m = await mandant(raum);
  const e = m.monatsabschluss[monat] || {};
  return { aktion: "lohnexport", monat, abdruck: e.abdruck, stand: e.stand, revision: e.revision ?? 1,
    zeilen: MA.datevZeilenAbdruck(MA.exportZeilenFuer(m, monat).zeilen), ...extra };
}

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-wp487-"));
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
afterEach(() => schalter(undefined));
afterAll(async () => {
  schalter(undefined);
  vi.useRealTimers();
  if (wurzel) await rm(wurzel, { recursive: true, force: true });
});

describe("Gleichwertigkeit: voller Weg und segmentweise ergeben dieselbe Platte", { timeout: 240000 }, () => {
  const SCHRITTE = [
    { rumpf: { aktion: "abschliessen", monat: "2026-03" }, erwartet: 409 },                                   // Prüffall im März
    { rumpf: { aktion: "abschliessen", monat: "2026-03", trotzPrueffaellen: true, grund: "Lohnlauf März" }, erwartet: 200 },
    { rumpf: { aktion: "abschliessen", monat: "2026-03", trotzPrueffaellen: true }, erwartet: 409 },          // schon abgeschlossen
    { rumpf: { aktion: "abschliessen", monat: "2026-01", trotzPrueffaellen: true }, erwartet: 200 },
    { lohnexport: "2026-03", erwartet: 409 },                                                                   // Februar offen
    { lohnexport: "2026-03", extra: { trotzVormonat: true, vormonatKategorie: "abgestimmt", vormonatGrund: "Mit dem Lohnbüro abgestimmt" }, erwartet: 200 },
    { rumpf: { aktion: "wiederoeffnen", monat: "2026-03", grund: "Nachtrag nach dem Export" }, erwartet: 409 }, // Korrektur erforderlich
    { rumpf: { aktion: "abschliessen", monat: "2025-12", trotzPrueffaellen: true }, erwartet: 200 },          // Vorjahr
    { rumpf: { aktion: "abschliessen", monat: "2026-06", trotzPrueffaellen: true }, erwartet: 200 },          // Monat ohne Scherbe
    { rumpf: { aktion: "wiederoeffnen", monat: "2026-06", grund: "Leeren Monat neu prüfen" }, erwartet: 200 }, // Scherbe wird wieder leer
    { rumpf: { aktion: "wiederoeffnen", monat: "2026-01", grund: "Januar erneut prüfen" }, erwartet: 200 },
    { rumpf: { aktion: "abschliessen", monat: "2026-02", trotzPrueffaellen: true }, erwartet: 200 },          // Konto mit wiederoffenem Januar
    { rumpf: { aktion: "abschliessen", monat: "2026-10", trotzPrueffaellen: true }, erwartet: 200 },          // Nachtdienst am Monatsletzten
    { rumpf: { aktion: "wiederoeffnen", monat: "2026-10", grund: "kurz" }, erwartet: 422 },
    { rumpf: { aktion: "abschliessen", monat: "2026-11" }, erwartet: 422 },                                   // nicht vergangen
    { rumpf: { aktion: "abschliessen", monat: "2026-13" }, erwartet: 422 },                                   // ungültig
    { rumpf: { aktion: "wiederoeffnen", monat: "2025-12", grund: "Nachtdienst Silvester prüfen" }, erwartet: 200 }, // Jahreswechsel
    { rumpf: { aktion: "abschliessen", monat: "2025-12", trotzPrueffaellen: true }, erwartet: 200 },
    { rumpf: { aktion: "abschliessen", monat: "2026-04", trotzPrueffaellen: true }, erwartet: 200 },          // nach Sommerzeitbeginn
    { rumpf: { aktion: "wiederoeffnen", monat: "2026-03", grund: "Sommerzeit prüfen" }, erwartet: 409 },        // exportiert
  ];

  it("16 Schritte: Status, Antwort, Bestand und jede Datei gleich; der Vermerk passt; Monate außerhalb unberührt", async () => {
    const voll = "wp487voll", teil = "wp487teil";
    await raumAnlegen(voll); await raumAnlegen(teil);
    const tv = await token(voll), tt = await token(teil);
    const davor2024 = await readFile(datei(S.scherbenSchluessel(teil, "m1", "2024-06")), "utf8");
    const m2davor = norm((await mandant(teil, 1)));
    expect((await platte(voll)).scherben).toBe((await platte(teil)).scherben);
    for (const [i, x] of SCHRITTE.entries()) {
      const rv = x.lohnexport ? await exportRumpf(voll, x.lohnexport, x.extra) : x.rumpf;
      const rt = x.lohnexport ? await exportRumpf(teil, x.lohnexport, x.extra) : x.rumpf;
      schalter(undefined);
      globalThis.__wp487id = 1000 * (i + 1);
      const av = await anfrage("monatsabschluss", { token: tv, rumpf: rv });
      schalter("true");
      globalThis.__wp487id = 1000 * (i + 1);
      const at = await anfrage("monatsabschluss", { token: tt, rumpf: rt });
      delete globalThis.__wp487id;
      schalter(undefined);
      expect(av.status, `Schritt ${i}: ${av.roh}`).toBe(x.erwartet);
      expect(at.status, `Schritt ${i}: ${at.roh}`).toBe(av.status);
      expect(norm(at), `Schritt ${i}`).toBe(norm(av));
      const [pv, pt] = [await platte(voll), await platte(teil)];
      expect(pt.kern, `Schritt ${i}: Kern`).toBe(pv.kern);
      expect(pt.scherben, `Schritt ${i}: Scherben`).toBe(pv.scherben);
      expect(norm((await B.bestandLesen(laden(), teil)).bestand), `Schritt ${i}: Bestand`).toBe(norm((await B.bestandLesen(laden(), voll)).bestand));
      await vermerkPasst(teil);
    }
    /* Die Folge hat wirklich geschrieben: Abschlüsse mit Freeze, Konto über Vorjahr und Monate. */
    const m = await mandant(teil);
    expect(Object.keys(m.monatsabschluss).sort()).toEqual(["2025-12", "2026-01", "2026-02", "2026-03", "2026-04", "2026-06", "2026-10"]);
    /* Zeitumstellung und Jahreswechsel liegen eingefroren am Tag des Beginns (in beiden Wegen gleich, siehe oben). */
    for (const k of ["a1|2026-03-28", "a1|2026-10-24", "a1|2025-12-31"]) expect(m.istEingefroren[k], k).toBeTruthy();
    expect(m.istEingefroren["a1|2026-03-28"].std).not.toBe(m.istEingefroren["a1|2026-10-24"].std);
    expect(m.monatsabschluss["2026-03"].lohnexport).toBeTruthy();
    expect(MA.istAbdruck(m, "2026-02")).toBe(m.monatsabschluss["2026-02"].abdruck);
    expect(m.istEingefroren["a1|2026-02"].k).not.toBeNull();
    expect(Object.keys(m.istEingefroren).some((k) => k.includes("|2026-06"))).toBe(false);
    expect(await laden().get(S.scherbenSchluessel(teil, "m1", "2026-06"), { type: "json" })).toBeNull();
    /* Was außerhalb lag, ist bytegleich: die Scherbe 2024, der andere Betrieb. */
    expect(await readFile(datei(S.scherbenSchluessel(teil, "m1", "2024-06")), "utf8")).toBe(davor2024);
    expect(norm(await mandant(teil, 1))).toBe(m2davor);
  });
});

/**
 * Die Anfrage kommt an der Sitzungsprüfung vorbei (sie liest den ganzen Bestand, außerhalb der Raumsperre) und wartet
 * an der Raumsperre, die die Prüfung hält. Erst dann wird die Scherbe beschädigt und die Sperre freigegeben — so sieht
 * nur das Lesen UNTER der Sperre die Beschädigung: der Unterschied zwischen vollem Weg und segmentweise.
 */
async function beschaedigtAnDerSperre(raum, monat, rumpf, wert) {
  const f = datei(S.scherbenSchluessel(raum, "m1", monat));
  const tl = await token(raum);
  schalter(wert);
  let frei = () => {}, drin = () => {};
  const tor = new Promise((r) => { frei = r; });
  const gehalten = new Promise((r) => { drin = r; });
  const halter = B.unterRaumsperre(raum, async () => { drin(); await tor; });
  await gehalten;
  const vorher = RS.sperrZustand().offen;
  const antwort = anfrage("monatsabschluss", { token: tl, rumpf });
  const bis = performance.now() + 20000;
  for (let ruhig = 0; ruhig < 10;) {
    if (performance.now() > bis) throw new Error("Die Anfrage kam nicht an der Raumsperre an");
    await new Promise((r) => setTimeout(r, 5));
    ruhig = RS.sperrZustand().offen > vorher ? ruhig + 1 : 0;
  }
  await readFile(f);                                          // muss es geben
  await writeFile(f, "{kaputt");
  frei();
  await halter;
  const r = await antwort;
  return { r, f };
}
const MAERZ = { aktion: "abschliessen", monat: "2026-03", trotzPrueffaellen: true };

describe("Zugriff: segmentweise liest unter der Sperre nur das Jahr bis zum Monat", { timeout: 120000 }, () => {
  it("unlesbare Scherbe 2024: segmentweise 200 (nicht gelesen, nicht angefasst), voller Weg 503", async () => {
    for (const [raum, an] of [["wp487z-an", "true"], ["wp487z-aus", undefined]]) {
      await raumAnlegen(raum);
      const { r, f } = await beschaedigtAnDerSperre(raum, "2024-06", MAERZ, an);
      expect(r.status, `${raum}: ${r.roh}`).toBe(an ? 200 : 503);
      expect(await readFile(f, "utf8")).toBe("{kaputt");
    }
  });

  it("unlesbare Scherbe im Jahr (Februar beim März): 503 auch segmentweise, nichts geschrieben", async () => {
    const raum = "wp487z-jahr";
    await raumAnlegen(raum);
    const vorher = await laden().getMetadata(S.kernSchluessel(raum));
    const { r, f } = await beschaedigtAnDerSperre(raum, "2026-02", MAERZ, "true");
    expect(r.status, r.roh).toBe(503);
    expect((await laden().getMetadata(S.kernSchluessel(raum))).metadata.stand).toBe(vorher.metadata.stand);
    expect(await readFile(f, "utf8")).toBe("{kaputt");
  });

  it("Schalter nur bei genau „true“: „TRUE“, „1“, leer, „true “ → voller Weg (503 an der Scherbe 2024)", async () => {
    for (const [i, w] of ["TRUE", "1", "", "true "].entries()) {
      const raum = `wp487z-schalter${i}`;
      await raumAnlegen(raum);
      const { r } = await beschaedigtAnDerSperre(raum, "2024-06", MAERZ, w);
      expect(r.status, `Wert ${JSON.stringify(w)}: ${r.roh}`).toBe(503);
    }
  });

  it("Korrekturaktionen bleiben auf dem vollen Weg (korrektur-beginnen → 503 an der Scherbe 2024)", async () => {
    const raum = "wp487z-korr";
    await raumAnlegen(raum);
    const { r } = await beschaedigtAnDerSperre(raum, "2024-06",
      { aktion: "korrektur-beginnen", monat: "2026-03", grund: "Nachtrag Stunden", anlass: "nachtrag" }, "true");
    expect(r.status, r.roh).toBe(503);
  });
});

describe("Fail-closed zurück auf den vollen Weg", { timeout: 120000 }, () => {
  it("laufende Korrekturrevision im ANDEREN Betrieb des Raums → voller Weg (503 an der Scherbe 2024 des eigenen)", async () => {
    const raum = "wp487k";
    await raumAnlegen(raum, { monatsabschluss: { "2026-02": { abgeschlossen: false, revision: 2, korrektur: { offen: true } } } });
    const { r } = await beschaedigtAnDerSperre(raum, "2024-06", MAERZ, "true");
    expect(r.status, r.roh).toBe(503);
  });

  it("abschlussTeile: Änderung außerhalb des Monats → null (nicht segmentweise); im Monat und undatiert → Teile", async () => {
    const SW = await import("../server/lib/abschluss-segmentweise.mjs");
    expect(SW.jahrBisMonat("2026-03")).toEqual(["2026-01", "2026-02", "2026-03"]);
    expect(SW.jahrBisMonat("2026-13")).toEqual([]);
    const alt = { id: "m1", abweichungen: { "a|2026-02-01": "F", "a|2026-03-01": "F", x: "F" }, istEingefroren: {} };
    const bestand = { version: 9, mandanten: [alt, { id: "m2", abweichungen: {} }] };
    const ok = SW.abschlussTeile(bestand, alt, { ...alt, istEingefroren: { "a|2026-03-01": { std: 8 } }, monatsabschluss: { "2026-03": {} } }, "2026-03");
    expect(ok && ok.scherben.map((s) => `${s.mandantId}::${s.monat}`)).toEqual(["m1::2026-03"]);
    expect(ok.scherben[0].felder.istEingefroren).toEqual({ "a|2026-03-01": { std: 8 } });
    expect(ok.kern.mandanten[0].abweichungen).toEqual({ x: "F" });                       // undatiert bleibt im Kern
    expect(ok.kern.mandanten[0].monatsabschluss).toEqual({ "2026-03": {} });
    const fremd = { ...alt, abweichungen: { ...alt.abweichungen, "a|2026-02-01": "N" } };
    expect(SW.abschlussTeile(bestand, alt, fremd, "2026-03")).toBeNull();
    const neuFremd = { ...alt, istEingefroren: { "a|2026-02-02": {} } };
    expect(SW.abschlussTeile(bestand, alt, neuFremd, "2026-03")).toBeNull();
    const wegFremd = { ...alt, abweichungen: { "a|2026-03-01": "F", x: "F" } };
    expect(SW.abschlussTeile(bestand, alt, wegFremd, "2026-03")).toBeNull();
    const leer = SW.abschlussTeile(bestand, alt, { ...alt, abweichungen: { "a|2026-02-01": "F", x: "F" } }, "2026-03");
    expect(leer && leer.scherben[0].felder.abweichungen).toEqual({});
  });

  it("Rückfall Ende-zu-Ende: abschlussTeile null → voll neu gelesen und gerechnet; Platte gleich dem vollen Weg", async () => {
    const voll = "wp487rf-voll", teil = "wp487rf-teil";
    await raumAnlegen(voll); await raumAnlegen(teil);
    const schritte = [{ aktion: "abschliessen", monat: "2026-03", trotzPrueffaellen: true },
      { aktion: "wiederoeffnen", monat: "2026-03", grund: "Rückfall erneut prüfen" }, { aktion: "abschliessen", monat: "2026-02", trotzPrueffaellen: true }];
    for (const [i, rumpf] of schritte.entries()) {
      schalter(undefined);
      globalThis.__wp487id = 500 * (i + 1);
      const av = await anfrage("monatsabschluss", { token: await token(voll), rumpf });
      schalter("true");
      globalThis.__wp487id = 500 * (i + 1);
      globalThis.__wp487nichtTeile = true; globalThis.__wp487teile = 0;
      const at = await anfrage("monatsabschluss", { token: await token(teil), rumpf });
      const aufrufe = globalThis.__wp487teile;
      delete globalThis.__wp487nichtTeile; delete globalThis.__wp487id;
      schalter(undefined);
      expect(aufrufe, `Schritt ${i}: segmentweise versucht`).toBe(1);
      expect([av.status, at.status], at.roh).toEqual([200, 200]);
      expect(norm(at)).toBe(norm(av));
      const [pv, pt] = [await platte(voll), await platte(teil)];
      expect(pt.kern).toBe(pv.kern);
      expect(pt.scherben).toBe(pv.scherben);
      await vermerkPasst(teil);
    }
  });

  it("Rückfall unter der Sperre: abschlussTeile null → der volle Weg liest die Scherbe 2024 (503)", async () => {
    const raum = "wp487rf-sonde";
    await raumAnlegen(raum);
    globalThis.__wp487nichtTeile = true;
    try {
      const { r } = await beschaedigtAnDerSperre(raum, "2024-06", MAERZ, "true");
      expect(r.status, r.roh).toBe(503);
    } finally { delete globalThis.__wp487nichtTeile; }
  });

  it("zwei Betriebe ohne Kennung im Raum: kein 500, Rückfall auf den vollen Weg (gleich dem vollen Weg; 503 an der Scherbe 2024)", async () => {
    const ohne = [{ name: "ohne Kennung A", personen: [] }, { name: "ohne Kennung B", personen: [] }];
    const voll = "wp487oi-voll", teil = "wp487oi-teil";
    await raumAnlegen(voll, {}, ohne); await raumAnlegen(teil, {}, ohne);
    schalter(undefined);
    globalThis.__wp487id = 9000;
    const av = await anfrage("monatsabschluss", { token: await token(voll), rumpf: MAERZ });
    schalter("true");
    globalThis.__wp487id = 9000;
    const at = await anfrage("monatsabschluss", { token: await token(teil), rumpf: MAERZ });
    delete globalThis.__wp487id;
    expect([av.status, at.status], at.roh).toEqual([200, 200]);
    expect(norm(at)).toBe(norm(av));
    expect((await platte(teil)).scherben).toBe((await platte(voll)).scherben);
    expect((await platte(teil)).kern).toBe((await platte(voll)).kern);
    const sonde = "wp487oi-sonde";
    await raumAnlegen(sonde, {}, ohne);
    const { r } = await beschaedigtAnDerSperre(sonde, "2024-06", MAERZ, "true");
    expect(r.status, r.roh).toBe(503);
    const SW = await import("../server/lib/abschluss-segmentweise.mjs");
    expect(SW.abschlussAuswahl({ betrieb: 0, mandantId: "m1" }, "2026-03")({ mandanten: [{ id: "m1" }, {}, {}] })).toBeNull();
    expect(SW.abschlussAuswahl({ betrieb: 0, mandantId: "m1" }, "2026-03")({ mandanten: [{ id: "m1" }, { id: "m2" }] })).toEqual(["m1::2026-01", "m1::2026-02", "m1::2026-03"]);
  });

  it("bestandLesenAuswahlStreng nur unter der Raumsperre", async () => {
    await expect(B.bestandLesenAuswahlStreng(laden(), "wp487voll", () => [])).rejects.toThrow(/Raumsperre/);
  });
});

describe("Rennen: Abschluss segmentweise gegen das Ausstempeln des Nachtdiensts vom Monatsletzten", { timeout: 240000 }, () => {
  it("in 4 Rennen: Prüfsumme stimmt immer; der Stempel liegt davor oder ist abgewiesen", async () => {
    for (let i = 0; i < 4; i++) {
      const raum = `wp487r${i}`;
      await raumAnlegen(raum);
      const tl = await token(raum), ta = await token(raum, "a2", "mitarbeiter");
      schalter("true");
      const zu = () => anfrage("monatsabschluss", { token: tl, rumpf: { aktion: "abschliessen", monat: "2026-10", trotzPrueffaellen: true } });
      const ende = () => anfrage("stempeln", { token: ta, rumpf: { art: "ende", clientEventId: ID(200 + i), offline: true,
        erfasstAm: "2026-11-01T05:00:00.000Z", gesendetAm: JETZT } });
      const [a, b] = i % 2 ? await Promise.all([zu(), ende()]) : await Promise.all([ende(), zu()]).then(([y, x]) => [x, y]);
      expect(a.status, a.roh).toBe(200);
      const m = await mandant(raum);
      expect(m.monatsabschluss["2026-10"].abgeschlossen).toBe(true);
      expect(MA.istAbdruck(m, "2026-10"), `Rennen ${i}`).toBe(m.monatsabschluss["2026-10"].abdruck);
      if (b.status === 200) expect(m.einstempeln["a2|2026-10-31"].ende).toBeTruthy();
      else {
        expect([b.status, b.code], b.roh).toEqual([409, "MONAT_ABGESCHLOSSEN"]);
        expect(m.einstempeln["a2|2026-10-31"].ende).toBeUndefined();
      }
      await vermerkPasst(raum);
    }
  });
});
