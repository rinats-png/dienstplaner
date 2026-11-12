/* ==========================================================================
   NACHTDIENST VON GESTERN OHNE EINSTEMPELN — der Pfad „Dienstende stempeln“

   Seit #213 zeigen Tagesaufgaben, Startseite (Rechner, Telefon) und
   Dienstkarte für { vortag: true, st: null, nachtEnde: true } „Nachtdienst
   von gestern ohne Einstempeln“ mit der Aktion „Dienstende stempeln“. Hier
   wird belegt, was diese Aktion durch den echten Handler (/api/stempeln)
   bewirkt — Entwurf aus src/stempelvorgang.js (nachtEnde) und
   server/lib/zeiterfassung.mjs (stempelZiel, Schritt 4, F1):

   - Das Ende landet beim Nachtdienst von GESTERN (nicht als loses Ende am
     Folgetag), mit endeDatum = heute und START_FEHLT.
   - Kein Beginn wird erfunden: kein start, kein startAm, keine Erfassung
     (also keine bestätigte Ist-Dauer, keine negative Dauer). Bis zur
     Korrektur zählt wie bei jedem Tag ohne bestätigte Erfassung die Planzeit
     — nicht still: Der Monatsabschluss zählt den Stempel als offen.
   - Der Weg zur vollständigen Zeit ist der Korrekturantrag der Person am
     Stempel (korrekturworkflow.mjs: „START_FEHLT … ist der Weg, ihn aufzulösen“).
   - Danach bietet die Oberfläche kein zweites „Dienstende stempeln“ an.
   - Negativfälle: andere Person, anderer Betrieb, kein Nachtdienst gestern,
     Toleranz vorbei — nie Schreiben auf den Nachtdienst eines anderen.

   Dazu zwei Befunde aus der Prüfung, hier behoben:
   B1  Die Stempelfläche schickte beim „Dienstende stempeln“ die vorbelegte
       Pause der Dienstart mit, obwohl dort kein Pausenfeld steht — eine nie
       gesehene „genommene Pause“ im unveränderlichen Original (WP-06). Jetzt
       geht ohne Beginn keine Pause hinaus (pauseZumStempel).
   B2  Am Rechner fehlte die Stempeluhr, wenn heute kein Dienst geplant ist
       (nach einem Nachtdienst der Regelfall): DienstKarte gab null zurück,
       die Aufgabe versprach „Dienstende stempeln“ ohne Knopf dafür.

   Aufruf: npm run pruefung:nachtdienst-ohne-einstempeln
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { istZeitFuer } from "../src/istdaten.js";
import { stempelVorgang } from "../src/stempelvorgang.js";
import { offenePunkte } from "../server/lib/monatsabschluss.mjs";

const WIRT = "127.0.0.1:3000";
let wurzel, laden, daten, sitzungAnlegen, B;

let nr = 0;
const anfrage = async (pfad, { methode = "POST", rumpf, token } = {}) => {
  nr += 1;
  const kopf = { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.7.${Math.floor(nr / 250) % 250}.${nr % 250}` };
  if (methode !== "GET") kopf["content-type"] = "application/json";
  if (token) kopf.authorization = `Bearer ${token}`;
  const a = await daten(new Request(`http://${WIRT}${pfad}`, { method: methode, headers: kopf,
    ...(methode === "GET" ? {} : { body: JSON.stringify(rumpf || {}) }) }), {});
  let d = {}; try { d = await a.json(); } catch { /* leer */ }
  return { status: a.status, ...d };
};

const person = (id) => ({ id, vorname: "V", nachname: id, rolle: "mitarbeiter", bereich: "e1",
  zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }] });
const DIENSTARTEN = [{ id: "F", name: "Früh", start: "06:00", ende: "14:00", pause: 30 },
  { id: "N", name: "Nacht", start: "22:00", ende: "06:00", pause: 30 }];
const mandantVon = (id, ids, extra = {}) => ({ id, name: `Haus ${id}`, einheiten: [{ id: "e1", name: "WB 1" }],
  dienstarten: DIENSTARTEN, personen: ids.map(person), abweichungen: {}, abwesenheiten: [], erfassung: {}, einstempeln: {}, ...extra });

async function raumAnlegen(raum, mandanten) {
  await B.bestandSchreiben(laden(), raum, { version: 9, mandanten }, { durch: "Pruefung" });
}
const sitzung = async (raum, id, betrieb = 0, mandantId = "m1") => (await sitzungAnlegen({ bestand: raum, name: id, rolle: "mitarbeiter",
  person: id, betrieb, mandantId, einheit: null }, 24 * 60 * 60 * 1000)).token;
const stempeln = async (raum, id, rumpf, betrieb = 0, mandantId = "m1") =>
  anfrage("/api/stempeln", { token: await sitzung(raum, id, betrieb, mandantId), rumpf });
const zeitAuf = (iso) => vi.setSystemTime(new Date(iso));
const bestand = async (raum) => (await B.bestandLesen(laden(), raum)).bestand;

const GESTERN = "2026-11-01", HEUTE = "2026-11-02";
const NACHT = DIENSTARTEN[1];

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-nachtende-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
  const { getStore } = await import("../server/lib/ablage.mjs");
  laden = () => getStore({ name: "centric", consistency: "strong" });
  daten = (await import("../server/funktionen/daten.mjs")).default;
  ({ sitzungAnlegen } = await import("../server/lib/sitzungen.mjs"));
  B = await import("../server/lib/bestand.mjs");
  vi.useFakeTimers({ toFake: ["Date"] });
}, 120000);
afterAll(async () => {
  vi.useRealTimers();
  await rm(wurzel, { recursive: true, force: true });
});

describe("„Dienstende stempeln“ mit st null durch den echten Handler", () => {
  it("die Oberfläche bietet es an (Ausgangslage, dieselbe Regel wie der Server)", async () => {
    await raumAnlegen("nd-ja", [mandantVon("m1", ["a1"], { abweichungen: { [`a1|${GESTERN}`]: "N" } })]);
    zeitAuf("2026-11-02T05:05:00Z");                                   // 02.11. 06:05 Berlin
    const m = (await bestand("nd-ja")).mandanten[0];
    expect(stempelVorgang(m, m.personen[0], HEUTE, new Date(), [])).toMatchObject({ datum: GESTERN, st: null, vortag: true, nachtEnde: true });
  });

  it("Ende beim Nachtdienst von gestern: START_FEHLT, endeDatum heute — kein erfundener Beginn, keine Erfassung", async () => {
    zeitAuf("2026-11-02T05:05:00Z");
    /* Wie die Stempelfläche: Gerätedatum gestern (vorgang.datum), Geo aus — eine mitgeschickte Messung bleibt unbeachtet. */
    const e = await stempeln("nd-ja", "a1", { art: "ende", datum: GESTERN, lat: 52.5, lon: 13.4, accuracy: 20,
      clientEventId: "11111111-1111-4111-8111-111111111111" });
    expect(e.status, JSON.stringify(e)).toBe(200);
    expect(e.datum).toBe(GESTERN);
    expect(e.zeit).toBe("06:05");
    expect(e.erfassung).toBeNull();
    expect(e.markierungen).toContain("START_FEHLT");
    expect(e.markierungen).not.toContain("GERAETEDATUM_ABWEICHEND");   // das Gerät schickte den Tag, den der Server wählt
    expect(e.eintrag.start).toBeUndefined();
    expect(e.eintrag.startAm).toBeUndefined();
    expect(e.eintrag).toMatchObject({ ende: "06:05", endeDatum: HEUTE });
    expect(e.eintrag.geoEnde).toMatchObject({ grund: "pruefung_aus" });

    const m = (await bestand("nd-ja")).mandanten[0];
    expect(Object.keys(m.einstempeln)).toEqual([`a1|${GESTERN}`]);      // nichts auf heute, nichts doppelt
    expect(m.einstempeln[`a1|${GESTERN}`].start).toBeUndefined();
    expect((m.erfassung || {})[`a1|${GESTERN}`]).toBeUndefined();
    /* Ist-Zeit: keine gestempelte Dauer (weder erfunden noch negativ); bis zur Korrektur die Planzeit wie an jedem
       Tag ohne bestätigte Erfassung — nicht still, der Monatsabschluss zählt den Stempel als offen. */
    const ist = istZeitFuer(m, m.personen[0], GESTERN, NACHT);
    expect(ist).toMatchObject({ erfasst: false, abweichung: 0 });
    expect(ist.std).toBeGreaterThan(0);
    expect(offenePunkte(m, "2026-11").offeneStempel).toBe(1);
  });

  it("dieselbe Kennung noch einmal (verlorene Antwort): kein zweiter Stempel, dieselbe Antwort", async () => {
    zeitAuf("2026-11-02T05:06:00Z");
    const w = await stempeln("nd-ja", "a1", { art: "ende", datum: GESTERN, clientEventId: "11111111-1111-4111-8111-111111111111" });
    expect(w.status).toBe(200);
    expect(w.wiederholt).toBe(true);
    expect(w.datum).toBe(GESTERN);
    expect(w.zeit).toBe("06:05");
    const m = (await bestand("nd-ja")).mandanten[0];
    expect(Object.keys(m.einstempeln)).toEqual([`a1|${GESTERN}`]);
  });

  it("danach bietet die Oberfläche kein zweites „Dienstende stempeln“ an, sondern Einstempeln für heute", async () => {
    const m = (await bestand("nd-ja")).mandanten[0];
    const v = stempelVorgang(m, m.personen[0], HEUTE, new Date("2026-11-02T05:07:00Z"), []);
    expect(v).toMatchObject({ datum: HEUTE, st: null, vortag: false });
    expect(v.nachtEnde).toBeUndefined();
  });

  it("der Beginn kommt über den Korrekturantrag der Person an diesem Stempel", async () => {
    zeitAuf("2026-11-02T05:10:00Z");
    const a = await anfrage("/api/korrektur-antrag", { token: await sitzung("nd-ja", "a1"),
      rumpf: { datum: GESTERN, start: "22:00", ende: "06:05", grund: "Einstempeln am Abend vergessen" } });
    expect(a.status, JSON.stringify(a)).toBe(200);
    expect(a.antrag).toMatchObject({ status: "offen", vorschlag: { start: "22:00", ende: "06:05" } });
    const m = (await bestand("nd-ja")).mandanten[0];
    /* Das Original bleibt unverändert, die Ist-Zeit ändert erst die Genehmigung. */
    expect(m.einstempeln[`a1|${GESTERN}`].start).toBeUndefined();
    expect((m.erfassung || {})[`a1|${GESTERN}`]).toBeUndefined();
  });

  it("ein zweites, neues Ende wird nicht an gestern gehängt und überschreibt nichts: eigenes START_FEHLT auf heute", async () => {
    zeitAuf("2026-11-02T05:20:00Z");
    const z = await stempeln("nd-ja", "a1", { art: "ende" });
    expect(z.status).toBe(200);
    expect(z.datum).toBe(HEUTE);
    expect(z.markierungen).toContain("START_FEHLT");
    const m = (await bestand("nd-ja")).mandanten[0];
    expect(m.einstempeln[`a1|${GESTERN}`].ende).toBe("06:05");
  });
});

describe("Negativfälle: nie auf den Nachtdienst eines anderen", () => {
  it("andere Person: die Sitzung bestimmt die Person, eine Personenangabe im Rumpf wirkt nicht", async () => {
    await raumAnlegen("nd-andere", [mandantVon("m1", ["a1", "a2"], { abweichungen: { [`a1|${GESTERN}`]: "N" } })]);
    zeitAuf("2026-11-02T05:05:00Z");
    const e = await stempeln("nd-andere", "a2", { art: "ende", datum: GESTERN, person: "a1", personId: "a1" });
    expect(e.status).toBe(200);
    expect(e.datum).toBe(HEUTE);                                        // a2 hatte gestern keinen Nachtdienst
    const m = (await bestand("nd-andere")).mandanten[0];
    expect(m.einstempeln[`a1|${GESTERN}`]).toBeUndefined();
    expect(Object.keys(m.einstempeln)).toEqual([`a2|${HEUTE}`]);
    /* a1 bekommt weiter „Dienstende stempeln“ angeboten — der Stempel von a2 zählt nicht für a1. */
    expect(stempelVorgang(m, m.personen[0], HEUTE, new Date(), []).nachtEnde).toBe(true);
  });

  it("anderer Betrieb: dieselbe Kennung im zweiten Betrieb stempelt nur dort, auf heute", async () => {
    await raumAnlegen("nd-betrieb", [mandantVon("m1", ["a1"], { abweichungen: { [`a1|${GESTERN}`]: "N" } }),
      mandantVon("m2", ["a1"])]);
    zeitAuf("2026-11-02T05:05:00Z");
    const e = await stempeln("nd-betrieb", "a1", { art: "ende", datum: GESTERN, betrieb: 0, mandantId: "m1" }, 1, "m2");
    expect(e.status).toBe(200);
    expect(e.datum).toBe(HEUTE);
    const [m1, m2] = (await bestand("nd-betrieb")).mandanten;
    expect(m1.einstempeln).toEqual({});
    expect(Object.keys(m2.einstempeln)).toEqual([`a1|${HEUTE}`]);
  });

  it("kein Nachtdienst gestern (frei oder Frühdienst): kein Angebot, ein Ende geht auf heute", async () => {
    await raumAnlegen("nd-kein", [mandantVon("m1", ["a1", "a2"], { abweichungen: { [`a2|${GESTERN}`]: "F" } })]);
    zeitAuf("2026-11-02T05:05:00Z");
    const m0 = (await bestand("nd-kein")).mandanten[0];
    for (const p of m0.personen) expect(stempelVorgang(m0, p, HEUTE, new Date(), []).nachtEnde).toBeUndefined();
    for (const id of ["a1", "a2"]) {
      const e = await stempeln("nd-kein", id, { art: "ende", datum: GESTERN });
      expect(e.status).toBe(200);
      expect(e.datum).toBe(HEUTE);
      expect(e.markierungen).toContain("START_FEHLT");
    }
    const m = (await bestand("nd-kein")).mandanten[0];
    expect(Object.keys(m.einstempeln).sort()).toEqual([`a1|${HEUTE}`, `a2|${HEUTE}`]);
  });

  it("Toleranz vorbei (Dienstende + 4 h): kein Angebot mehr, ein Ende geht auf heute", async () => {
    await raumAnlegen("nd-spaet", [mandantVon("m1", ["a1"], { abweichungen: { [`a1|${GESTERN}`]: "N" } })]);
    zeitAuf("2026-11-02T09:30:00Z");                                   // 10:30 Berlin
    const m0 = (await bestand("nd-spaet")).mandanten[0];
    expect(stempelVorgang(m0, m0.personen[0], HEUTE, new Date(), []).nachtEnde).toBeUndefined();
    const e = await stempeln("nd-spaet", "a1", { art: "ende", datum: GESTERN });
    expect(e.datum).toBe(HEUTE);
    expect(e.markierungen).toEqual(expect.arrayContaining(["START_FEHLT", "GERAETEDATUM_ABWEICHEND"]));
  });

  it("ohne Anmeldung: 401, nichts gespeichert", async () => {
    await raumAnlegen("nd-anon", [mandantVon("m1", ["a1"], { abweichungen: { [`a1|${GESTERN}`]: "N" } })]);
    zeitAuf("2026-11-02T05:05:00Z");
    const e = await anfrage("/api/stempeln", { rumpf: { art: "ende", datum: GESTERN } });
    expect(e.status).toBe(401);
    expect((await bestand("nd-anon")).mandanten[0].einstempeln).toEqual({});
  });
});

describe("B1: ohne Beginn geht keine ungesehene Pause hinaus", () => {
  it("pauseZumStempel: nur beim Ausstempeln eines gestempelten Beginns", async () => {
    const { pauseZumStempel } = await import("../src/ansichten/stempeluhr.jsx");
    expect(pauseZumStempel("ende", null, "30")).toBeNull();            // nachtEnde: kein Pausenfeld, keine Angabe
    expect(pauseZumStempel("ende", { start: "22:00" }, "30")).toBe("30");
    expect(pauseZumStempel("start", null, "30")).toBeNull();
    expect(pauseZumStempel("start", { start: "22:00" }, "30")).toBeNull();
  });
  it("Stempeluhr und mobile Stempelfläche schicken die Pause nur über pauseZumStempel", () => {
    for (const datei of ["stempeluhr.jsx", "mobil.jsx"]) {
      const q = readFileSync(new URL(`../src/ansichten/${datei}`, import.meta.url), "utf8");
      expect(q, datei).toMatch(/const pz = pauseZumStempel\(art, st, pause\);/);
      expect(q, datei).toMatch(/akt\.stempeln\(p\.id, tag, art, ort, pz\)/);
      expect(q, datei).not.toMatch(/art === "ende" \? pause : null/);
    }
  });
});

describe("B2: Dienstkarte am Rechner auch ohne Dienst heute", () => {
  const m = mandantVon("m1", ["a1"], { abweichungen: { [`a1|${GESTERN}`]: "N" } });
  const sitz = { rolle: "kunde", mandant: m, person: m.personen[0], db: { mandanten: [m], session: { mandantId: "m1", personId: "a1", rolle: "mitarbeiter" } } };
  const akt = new Proxy({}, { get: () => () => {} });
  it("nachtEnde ohne heutigen Dienst: Karte mit Hinweis, „Dienstende stempeln“ und „Einstempeln“", async () => {
    const { DienstKarte } = await import("../src/ansichten/dienstkarte.jsx");
    const v = stempelVorgang(m, m.personen[0], HEUTE, new Date("2026-11-02T05:05:00Z"), []);
    expect(v.nachtEnde).toBe(true);
    const html = renderToStaticMarkup(h(DienstKarte, { sitz, akt, vorgang: v, meineDa: null }));
    expect(html).toContain("Nachtdienst von gestern ohne Einstempeln");
    expect(html).toContain("Dienstende stempeln");
    expect(html).toContain("den Beginn ergänzt die Leitung");
    expect(html).not.toMatch(/Eingestempelt gestern (null|undefined)/);
  });
  it("ohne Vorgang und ohne Dienst heute bleibt die Karte weg (Regression)", async () => {
    const { DienstKarte } = await import("../src/ansichten/dienstkarte.jsx");
    const v = stempelVorgang(mandantVon("m1", ["a1"]), m.personen[0], HEUTE, new Date("2026-11-02T05:05:00Z"), []);
    expect(renderToStaticMarkup(h(DienstKarte, { sitz, akt, vorgang: v, meineDa: null }))).toBe("");
  });
});
