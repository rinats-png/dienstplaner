/* ==========================================================================
   DSGVO SERVERSEITIG (WP-26) — Auskunft nach Art. 15, Löschlauf nach
   Aufbewahrungsfristen, Ausdünnung von Sicherungen und Spur (F-26)

   Bis November 2026 baute die Oberfläche die Auskunft selbst — ohne
   Stempeldaten, ohne Protokoll, als Text —, und der Löschlauf nach den
   Aufbewahrungsfristen lief nur, wenn jemand in der Oberfläche darauf
   drückte. Hier: GET /api/auskunft und datenschutzLauf auf dem Server.

   Dazu die Auflagen aus dem Review (2c1aa8e): ungültige Fristen (Infinity,
   negativ, Bruch) dürfen weder gespeichert werden noch den Lauf hängen
   lassen (H1); Plan-, Zeit- und Stempeldaten nie unter 24 Monaten, Sicherung
   vor jedem löschenden Schreiben (H2); Zurückspielen nach einem Lauf geht
   und holt Gelöschtes nicht zurück, Schalter mit Vorgabe Vorschau, keine
   Doppelausführung (H3); die Leitung bekommt kein Protokoll (M1); in einem
   Raum mit mehreren Betrieben nichts Fremdes (M2); fremde Anträge nur im
   Gerüst (M3); die eigenen Sammlungen und das Konto (M4); eigene Bremse (M5);
   die 20 neuesten Sicherungen bleiben immer (N1).
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { appQuelle } from "./app-quelle.js";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WIRT = "127.0.0.1:3000";
const RAUM = "dsgvo-raum";
let wurzel, laden, daten, sitzungAnlegen, B, D, A;
const HEUTE = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());

let nr = 0;
const anfrage = async (pfad, { methode = "GET", rumpf, token } = {}) => {
  nr += 1;
  const kopf = { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.3.${Math.floor(nr / 250) % 250}.${nr % 250}` };
  if (methode !== "GET") kopf["content-type"] = "application/json";
  if (token) kopf.authorization = `Bearer ${token}`;
  const a = await daten(new Request(`http://${WIRT}${pfad}`, { method: methode, headers: kopf,
    ...(methode === "GET" ? {} : { body: JSON.stringify(rumpf || {}) }) }), {});
  let d = {}; try { d = await a.json(); } catch { /* leer */ }
  return { status: a.status, kopf: a.headers, ...d };
};
const person = (id, rolle = "mitarbeiter", extra = {}) => ({ id, vorname: `V${id}`, nachname: `N${id}`, rolle, bereich: "e1",
  zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }], ...extra });
const betrieb = (id, personen, extra = {}) => ({ id, name: `Betrieb ${id}`, einheiten: [{ id: "e1", name: "WB" }],
  dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00" }], personen,
  abweichungen: {}, abwesenheiten: [], erfassung: {}, einstempeln: {}, anfragen: [], aenderungen: [], nachrichten: [], ...extra });
const sitzung = async (raum, pid, rolle, mandantId, betriebNr = 0) => (await sitzungAnlegen({ bestand: raum, name: pid, rolle,
  person: pid, betrieb: betriebNr, mandantId, einheit: null }, 60 * 60 * 1000)).token;

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-dsgvo-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
  delete process.env.CENTRIC_DATENSCHUTZLAUF;
  const { getStore } = await import("../server/lib/ablage.mjs");
  laden = () => getStore({ name: "centric", consistency: "strong" });
  daten = (await import("../server/funktionen/daten.mjs")).default;
  ({ sitzungAnlegen } = await import("../server/lib/sitzungen.mjs"));
  B = await import("../server/lib/bestand.mjs");
  D = await import("../server/lib/datenschutzlauf.mjs");
  A = await import("../server/lib/aufbewahrung.mjs");
  await B.bestandSchreiben(laden(), RAUM, { version: 9, mandanten: [
    betrieb("m1", [person("a1", "mitarbeiter", { notfallkontakt: "Mutter 0151", iban: "DE00 1234" }),
      person("b1"), person("l1", "leitung"), person("s1", "subplaner"), person("r1", "betriebsrat"), person("p1", "planer")], {
      abweichungen: { [`a1|${HEUTE}`]: "F", [`b1|${HEUTE}`]: "F" },
      erfassung: { "a1|2026-10-05": { start: "06:00", ende: "14:10", bestaetigt: true, grund: "" } },
      einstempeln: { "a1|2026-10-05": { start: "06:00", ende: "14:10", geoStart: { status: "INNERHALB", entfernungGerundet: "20" } },
        "b1|2026-10-05": { start: "07:00" } },
      abwesenheiten: [{ id: "w1", personId: "a1", art: "krank", von: "2026-10-20", bis: "2026-10-21", notiz: "Grippe" },
        { id: "w2", personId: "b1", art: "urlaub", von: "2026-10-20", bis: "2026-10-21" }],
      anfragen: [{ id: "q1", personId: "a1", typ: "urlaub", von: "2026-12-01", bis: "2026-12-02", status: "offen" },
        { id: "q2", personId: "b1", partnerId: "a1", typ: "tausch", von: "2026-12-05", bis: "2026-12-05", status: "offen",
          text: "privat: Arzttermin", antwort: "Leitung: geht klar", interessenten: ["s1"] }],
      aenderungen: [{ personId: "a1", datum: "2026-10-05", von: "-", nach: "F", vorlauf: 3, zeit: "2026-10-02" }],
      wuensche: [{ id: "wu1", personId: "a1", datum: "2026-12-24", art: "frei" }, { id: "wu2", personId: "b1", datum: "2026-12-24", art: "frei" }],
      protokoll: [{ id: "pr1", personId: "a1", zeit: "2026-10-01", text: "Qualifikation geprüft" }, { id: "pr2", zeit: "2026-10-01", text: "Allgemein" }],
    }),
    betrieb("m2", [person("x1"), person("a1")]),
  ] }, { durch: "Pruefung" });
});
afterAll(async () => { await rm(wurzel, { recursive: true, force: true }); });

describe("Art. 15: GET /api/auskunft", () => {
  it("die Person über sich selbst: maschinenlesbar, mit Stempeln samt Ortsbefund, eigenen Sammlungen und Protokoll", async () => {
    const t = await sitzung(RAUM, "a1", "mitarbeiter", "m1");
    /* Ein Vorgang, der im Protokoll zur Person landet. */
    expect((await anfrage("/api/stempeln", { methode: "POST", token: t, rumpf: { art: "start", datum: HEUTE } })).status).toBe(200);
    const a = await anfrage("/api/auskunft", { token: t });
    expect(a.status, JSON.stringify(a).slice(0, 300)).toBe(200);
    expect(a.kopf.get("content-disposition")).toMatch(/attachment; filename="auskunft-a1-/);
    expect([a.format, a.umfang]).toEqual(["centric-auskunft", "selbst"]);
    expect(a.hinweis).toMatch(/Nicht enthalten:/);
    expect(a.hinweis).not.toMatch(/Vollständige/);
    expect(a.person).toMatchObject({ id: "a1", notfallkontakt: "Mutter 0151", iban: "DE00 1234" });
    expect(a.stempel.find((x) => x.datum === "2026-10-05")).toMatchObject({ start: "06:00", geoStart: { status: "INNERHALB" } });
    expect(a.istZeiten).toEqual([{ datum: "2026-10-05", start: "06:00", ende: "14:10", bestaetigt: true, grund: "" }]);
    expect(a.abwesenheiten).toEqual([expect.objectContaining({ id: "w1", notiz: "Grippe" })]);
    expect(a.planaenderungen).toHaveLength(1);
    expect(a.plan.some((x) => x.datum === HEUTE && x.dienst === "F")).toBe(true);
    expect(a.wuensche.map((x) => x.id)).toEqual(["wu1"]);
    expect(a.betriebsprotokoll.map((x) => x.id)).toEqual(["pr1"]);
    expect(a.aufbewahrung).toMatchObject({ plandatenMonate: 24, stammdatenMonateNachAustritt: 6, abwesenheitsgruendeMonate: 3 });
    expect(a.protokoll.some((r) => r.art === "schreiben" && /stempeln start/.test(r.zusatz || ""))).toBe(true);
    expect(a.protokoll.every((r) => r.mandantId === "m1")).toBe(true);
    /* Nichts von anderen. */
    const roh = JSON.stringify(a);
    expect(roh).not.toContain("b1|");
    expect(a.abwesenheiten.some((x) => x.personId === "b1")).toBe(false);
    expect(a.stempel.some((x) => x.start === "07:00")).toBe(false);
  });

  it("M3: als Tauschpartner einen fremden Antrag nur im Gerüst — ohne Text, Antwort, Interessenten", async () => {
    const a = await anfrage("/api/auskunft", { token: await sitzung(RAUM, "a1", "mitarbeiter", "m1") });
    const q2 = a.antraege.find((x) => x.id === "q2");
    expect(q2).toEqual({ id: "q2", typ: "tausch", von: "2026-12-05", bis: "2026-12-05", status: "offen", personId: "b1", partnerId: "a1" });
    expect(JSON.stringify(a)).not.toContain("Arzttermin");
    expect(a.antraege.find((x) => x.id === "q1")).toMatchObject({ typ: "urlaub" });
  });

  it("M2: dieselbe Kennung in einem anderen Betrieb des Raums — dessen Protokoll erscheint nicht", async () => {
    const t2 = await sitzung(RAUM, "a1", "mitarbeiter", "m2", 1);
    const a2 = await anfrage("/api/auskunft", { token: t2 });
    expect(a2.status, JSON.stringify(a2).slice(0, 200)).toBe(200);
    expect(a2.verantwortlicher.betriebId).toBe("m2");
    expect(a2.protokoll.some((r) => /stempeln/.test(r.zusatz || ""))).toBe(false);   // der Stempel war in m1
    expect(a2.stempel).toEqual([]);
  });

  it("Auskunft über eine andere Person: Mitarbeiterin, Schichtverantwortung, Betriebsrat und Planung 403", async () => {
    for (const [pid, rolle] of [["a1", "mitarbeiter"], ["s1", "subplaner"], ["r1", "betriebsrat"], ["p1", "planer"]]) {
      const t = await sitzung(RAUM, pid, rolle, "m1");
      expect((await anfrage("/api/auskunft?person=b1", { token: t })).status, rolle).toBe(403);
    }
  });

  it("M1: die Leitung auf Anfrage — eigener Betrieb in ihrer Sicht, ohne Protokoll, Push, Kalender, Konto; fremder Betrieb 404", async () => {
    const t = await sitzung(RAUM, "l1", "leitung", "m1");
    const a = await anfrage("/api/auskunft?person=a1", { token: t });
    expect(a.status, JSON.stringify(a).slice(0, 300)).toBe(200);
    expect(a.umfang).toBe("leitung");
    expect(a.person.id).toBe("a1");
    expect(a.stempel.length).toBeGreaterThan(0);
    for (const f of ["protokoll", "pushAnmeldung", "kalenderverweis", "konto"]) expect(a[f], f).toBeUndefined();
    expect((await anfrage("/api/auskunft?person=x1", { token: t })).status).toBe(404);
    /* Die Person sieht in ihrer eigenen Auskunft, dass die Leitung Auskunft erteilt hat (Empfänger). */
    const selbst = await anfrage("/api/auskunft", { token: await sitzung(RAUM, "a1", "mitarbeiter", "m1") });
    /* N-2: nur Rolle, Zeit und Art — keine Kennung, keine Herkunft der Leitung. */
    const ueberMich = selbst.protokoll.filter((r) => r.art === "auskunft" && r.rolle === "leitung");
    expect(ueberMich.length).toBeGreaterThan(0);
    for (const r of ueberMich) expect(Object.keys(r).sort()).toEqual(["art", "rolle", "zeit"]);
  });

  it("der Betreiber erstellt keine Auskunft", async () => {
    const { token } = await sitzungAnlegen({ bestand: RAUM, name: "Betreiber", rolle: "betreiber", person: null,
      betrieb: 0, einheit: null }, 60 * 60 * 1000);
    expect((await anfrage("/api/auskunft?person=a1", { token })).status).toBe(403);
  });

  it("M5: eigene Bremse — nach 30 Auskünften je Stunde und Person ist Schluss, andere Personen bleiben frei", async () => {
    const R = "dsgvo-bremse";
    await B.bestandSchreiben(laden(), R, { version: 9, mandanten: [betrieb("m1", [person("a1"), person("b1")])] }, { durch: "Pruefung" });
    const t = await sitzung(R, "a1", "mitarbeiter", "m1");
    let letzter;
    for (let i = 0; i < 31; i++) letzter = await anfrage("/api/auskunft", { token: t });
    expect(letzter.status).toBe(429);
    /* M5-Rest: Eine Person sperrt nicht den Betrieb. */
    const b = await anfrage("/api/auskunft", { token: await sitzung(R, "b1", "mitarbeiter", "m1") });
    expect(b.status, JSON.stringify(b).slice(0, 200)).toBe(200);
  }, 60000);
});

describe("H1: Fristen — gültig gespeichert, nie ein hängender Lauf", () => {
  it("PUT mit Infinity, negativ, Bruch oder riesig wird abgewiesen; gültige Werte gehen durch", async () => {
    const t = await sitzung(RAUM, "l1", "leitung", "m1");
    for (const w of ["Infinity", -3, 2.5, 1e12, "x"]) {
      const g = await anfrage("/api/bestand", { token: t });
      const b = JSON.parse(JSON.stringify(g.bestand));
      b.mandanten[0].aufbewahrung = { plandatenMonate: w };
      const p = await anfrage("/api/bestand", { methode: "PUT", token: t, rumpf: { bestand: b, etag: g.etag } });
      expect(p.status, String(w)).toBe(422);
    }
    const g = await anfrage("/api/bestand", { token: t });
    const b = JSON.parse(JSON.stringify(g.bestand));
    b.mandanten[0].aufbewahrung = { plandatenMonate: 36, stammdatenMonate: 6, gruendeMonate: 3 };
    expect((await anfrage("/api/bestand", { methode: "PUT", token: t, rumpf: { bestand: b, etag: g.etag } })).status).toBe(200);
  });

  it("minusMonate rechnet ohne Schleife: Infinity wirft sofort, große Werte enden sofort", () => {
    expect(() => A.minusMonate("2026-11-02", Infinity)).toThrow();
    const t0 = Date.now();
    expect(A.minusMonate("2026-11-02", 12000)).toBe("1026-11-02");
    expect(Date.now() - t0).toBeLessThan(50);
  });

  it("ein Betrieb mit ungültiger Frist in der Ablage wird übersprungen und gemeldet, der Lauf endet", async () => {
    const R = "dsgvo-ungueltig";
    await B.bestandSchreiben(laden(), R, { version: 9, mandanten: [betrieb("m1", [person("p1")], {
      aufbewahrung: { plandatenMonate: "Infinity" }, einstempeln: { "p1|2020-01-01": { start: "06:00" } } })] }, { durch: "Pruefung" });
    const v = await D.datenschutzLauf(laden(), { jetzt: new Date("2026-11-02T03:00:00Z"), spur: false, modus: "an" });
    expect(v.fehler.some((f) => f.raum === R && /plandatenMonate/.test(f.grund))).toBe(true);
    expect((await B.bestandLesen(laden(), R)).bestand.mandanten[0].einstempeln["p1|2020-01-01"]).toBeTruthy();
  });
});

describe("Löschlauf nach Aufbewahrungsfristen auf dem Server", () => {
  const JETZT = new Date("2026-11-02T03:00:00Z");
  const alterBetrieb = (extra = {}) => ({ version: 9, mandanten: [betrieb("m1", [
    person("p1"), person("p2", "mitarbeiter", { austritt: "2025-12-31", email: "p2@example.org", telefon: "0151" })], {
    abweichungen: { "p1|2024-09-01": "F", "p1|2026-10-01": "F" },
    erfassung: { "p1|2024-09-01": { start: "06:00", ende: "14:00", bestaetigt: true, grund: "" },
      "p1|2025-02-01": { start: "06:00", ende: "14:00", bestaetigt: true, grund: "" } },
    einstempeln: { "p1|2024-09-01": { start: "06:00", ende: "14:00" }, "p1|2026-10-01": { start: "06:00" } },
    abwesenheiten: [{ id: "w1", personId: "p1", art: "krank", von: "2026-06-01", bis: "2026-06-03", notiz: "Grippe" },
      { id: "w2", personId: "p1", art: "krank", von: "2026-10-20", bis: "2026-10-21", notiz: "Erkältung" }],
    ...extra })] });

  it("Vorgabe ist Vorschau: berichtet, löscht nichts", async () => {
    const R = "dsgvo-vorschau";
    await B.bestandSchreiben(laden(), R, alterBetrieb(), { durch: "Pruefung" });
    expect(D.modusAusUmgebung(undefined)).toBe("vorschau");
    expect(D.modusAusUmgebung("unsinn")).toBe("vorschau");
    const v = await D.datenschutzLauf(laden(), { jetzt: JETZT, spur: false });
    expect(v.modus).toBe("vorschau");
    expect(v.faellig.map((x) => x.raum)).toContain(R);
    expect(v.geaendert).toEqual([]);
    expect((await B.bestandLesen(laden(), R)).bestand.mandanten[0].einstempeln["p1|2024-09-01"]).toBeTruthy();
    expect((await D.datenschutzLauf(laden(), { jetzt: JETZT, modus: "aus" })).uebersprungen).toBe(true);
  });

  it("an: löscht nach den Fristen, mit Sicherung vorher, unter Sperre, mit Protokoll; zweiter Lauf schreibt nichts", async () => {
    const R = "dsgvo-loeschlauf";
    await B.bestandSchreiben(laden(), R, alterBetrieb(), { durch: "Pruefung" });
    const v = await D.datenschutzLauf(laden(), { jetzt: JETZT, spur: false, modus: "an" });
    expect(v.fehler.filter((f) => f.raum === R)).toEqual([]);
    expect(v.geaendert.map((x) => `${x.raum}/${x.betrieb}`)).toContain(`${R}/m1`);
    const m = (await B.bestandLesen(laden(), R)).bestand.mandanten[0];
    expect(Object.keys(m.abweichungen)).toEqual(["p1|2026-10-01"]);
    expect(m.erfassung["p1|2024-09-01"]).toBeUndefined();
    expect(m.erfassung["p1|2025-02-01"]).toBeTruthy();                       // jünger als 24 Monate
    expect(Object.keys(m.einstempeln)).toEqual(["p1|2026-10-01"]);
    expect(m.abwesenheiten.find((a) => a.id === "w1").notiz).toBe("");
    expect(m.abwesenheiten.find((a) => a.id === "w2").notiz).toBe("Erkältung");
    const p2 = m.personen.find((p) => p.id === "p2");
    expect([p2.anonym, p2.email, p2.telefon, p2.vorname]).toEqual([true, "", "", ""]);
    /* Schutzsicherung vor dem Löschen (H2). */
    const { blobs } = await laden().list({ prefix: `sicherung:${R}:` });
    expect(blobs).toHaveLength(1);
    const meta = await laden().getMetadata(blobs[0].key);
    expect(meta.metadata.durch).toMatch(/vor dem Datenschutzlauf/);
    expect(JSON.stringify(await laden().get(blobs[0].key, { type: "json" }))).toContain("p1|2024-09-01");

    const vorher = (await B.bestandLesen(laden(), R)).stand;
    const v2 = await D.datenschutzLauf(laden(), { jetzt: JETZT, spur: false, modus: "an" });
    expect(v2.geaendert.filter((x) => x.raum === R)).toEqual([]);
    expect((await B.bestandLesen(laden(), R)).stand).toBe(vorher);
  });

  it("H2: Frist 1 Monat (in der Ablage) löscht trotzdem keine Plan-, Zeit- oder Stempeldaten unter 24 Monaten", async () => {
    const R = "dsgvo-untergrenze";
    await B.bestandSchreiben(laden(), R, alterBetrieb({ aufbewahrung: { plandatenMonate: 1 } }), { durch: "Pruefung" });
    await D.datenschutzLauf(laden(), { jetzt: JETZT, spur: false, modus: "an" });
    const m = (await B.bestandLesen(laden(), R)).bestand.mandanten[0];
    expect(m.erfassung["p1|2025-02-01"]).toBeTruthy();
    expect(m.einstempeln["p1|2026-10-01"]).toBeTruthy();
    expect(m.abweichungen["p1|2026-10-01"]).toBe("F");
    expect(m.einstempeln["p1|2024-09-01"]).toBeUndefined();                  // älter als 24 Monate
  });

  it("H3: nach einem Lauf lässt sich eine ältere Sicherung zurückspielen — Fristabgelaufenes kommt nicht zurück", async () => {
    const R = "dsgvo-zurueck";
    await B.bestandSchreiben(laden(), R, alterBetrieb(), { durch: "Pruefung" });
    const { markeNeu } = await import("../server/lib/sicherungen.mjs");
    const marke = markeNeu(new Date("2026-10-01T08:00:00Z"));
    await laden().setJSON(`sicherung:${R}:${marke}`, (await B.bestandLesen(laden(), R)).bestand,
      { metadata: { zeit: "2026-10-01T08:00:00.000Z", durch: "Leitung" } });
    await D.datenschutzLauf(laden(), { jetzt: new Date(), spur: false, modus: "an" });
    const t = await sitzung(R, null, "leitung", "m1");
    const g = await anfrage("/api/bestand", { token: t });
    expect(g.status).toBe(200);
    /* Seit N-3 löscht das Zurückspielen nur, wenn der Lauf auf „an" steht. */
    process.env.CENTRIC_DATENSCHUTZLAUF = "an";
    let w;
    try { w = await anfrage("/api/wiederherstellen", { methode: "POST", token: t, rumpf: { marke, etag: g.etag } }); }
    finally { delete process.env.CENTRIC_DATENSCHUTZLAUF; }
    /* Die Leitung muss frisch angemeldet sein; die Prüfsitzung ist es. */
    expect(w.status, JSON.stringify(w).slice(0, 300)).toBe(200);
    const m = (await B.bestandLesen(laden(), R)).bestand.mandanten[0];
    expect(m.einstempeln["p1|2024-09-01"]).toBeUndefined();
    expect(m.einstempeln["p1|2026-10-01"]).toBeTruthy();
    expect(m.personen.find((p) => p.id === "p2").anonym).toBe(true);
  });

  it("ein Raum mit unlesbarer Datei wird übersprungen und gemeldet, nicht ohne die Lücke geschrieben", async () => {
    const R = "dsgvo-kaputt";
    await B.bestandSchreiben(laden(), R, { version: 9, mandanten: [betrieb("m1", [person("p1")], {
      abweichungen: { "p1|2024-09-01": "F", "p1|2026-10-01": "F" } })] }, { durch: "Pruefung" });
    const { dateiname } = await import("../server/lib/ablage.mjs");
    await writeFile(path.join(wurzel, "centric", dateiname(`scherbe:${R}:m1:2026-10`)), "{kaputt");
    const v = await D.datenschutzLauf(laden(), { jetzt: JETZT, spur: false, modus: "an" });
    expect(v.fehler.map((f) => f.raum)).toContain(R);
    expect(await readFile(path.join(wurzel, "centric", dateiname(`scherbe:${R}:m1:2024-09`)), "utf8")).toContain("p1|2024-09-01");
  });

  it("nie zweimal gleichzeitig: ein zweiter Aufruf während eines Laufs wird übersprungen", async () => {
    const [x, y] = await Promise.all([
      D.datenschutzLauf(laden(), { jetzt: JETZT, spur: false, modus: "vorschau" }),
      D.datenschutzLauf(laden(), { jetzt: JETZT, spur: false, modus: "vorschau" })]);
    expect([x.uebersprungen, y.uebersprungen].sort()).toEqual([false, true]);
  });
});

describe("In-App-Sicherungen nach festem Plan (F-26)", () => {
  const JETZT = new Date("2026-11-02T12:00:00Z");
  const e = (tageAlt, nr, meta = { automatisch: "ja" }) => {
    const z = new Date(JETZT.getTime() - tageAlt * 86400000 - nr * 60000);
    return { key: `sicherung:r:${tageAlt}-${nr}`, marke: "x", meta: { ...meta, zeit: z.toISOString() } };
  };
  it("die 20 neuesten bleiben, danach eine je Tag (14 Tage), eine je Woche (90 Tage), nichts älter als 90 Tage", () => {
    const liste = [];
    for (let i = 0; i < 25; i++) liste.push(e(0, i));
    liste.push(e(5, 0), e(5, 1));
    liste.push(e(40, 0), e(41, 0));
    liste.push(e(120, 0));
    const { weg } = D.sicherungsPlan(liste, JETZT);
    expect(weg).toContain("sicherung:r:120-0");
    expect(weg.filter((k) => k.startsWith("sicherung:r:0-"))).toHaveLength(4);
    expect(weg.filter((k) => k.startsWith("sicherung:r:5-"))).toHaveLength(1);
    expect(weg.filter((k) => /sicherung:r:4[01]-/.test(k)).length).toBeLessThanOrEqual(1);
  });
  it("N1: die 20 neuesten je Kontingent bleiben immer, auch wenn sie älter als 90 Tage sind", () => {
    const liste = Array.from({ length: 25 }, (_, i) => e(120 + i, 0));
    const { weg } = D.sicherungsPlan(liste, JETZT);
    expect(weg.sort()).toEqual(Array.from({ length: 5 }, (_, i) => `sicherung:r:${140 + i}-0`).sort());
  });
  it("Kontingente getrennt; ohne erkennbares Alter bleibt eine Sicherung liegen", () => {
    const { weg, ohneAlter } = D.sicherungsPlan([e(120, 0, { mandantId: "m1" }),
      { key: "sicherung:r:vor-zerlegung", marke: "vor-zerlegung", meta: {} }], JETZT);
    expect(weg).toEqual([]);                                   // die einzige des Kontingents bleibt (N1)
    expect(ohneAlter).toEqual(["sicherung:r:vor-zerlegung"]);
  });
  it("der Lauf löscht in der Ablage, was der Plan wegnimmt — nur im Modus „an“", async () => {
    const R = "dsgvo-plan";
    await B.bestandSchreiben(laden(), R, { version: 9, mandanten: [betrieb("m1", [person("p1")])] }, { durch: "Pruefung" });
    for (let i = 0; i < 21; i++) {
      const tag = new Date(Date.UTC(2026, 10, 1, 10, i)).toISOString();
      await laden().setJSON(`sicherung:${R}:2026-11-01-10-${String(i).padStart(2, "0")}-00-0001`, { i },
        { metadata: { zeit: tag, automatisch: "ja" } });
    }
    const alt = "2026-06-01-10-00-00-0001";
    await laden().setJSON(`sicherung:${R}:${alt}`, { x: 1 }, { metadata: { zeit: "2026-06-01T10:00:00.000Z", automatisch: "ja" } });
    await D.datenschutzLauf(laden(), { jetzt: JETZT, spur: false, modus: "vorschau" });
    expect(await laden().get(`sicherung:${R}:${alt}`, { type: "json" })).toEqual({ x: 1 });
    await D.datenschutzLauf(laden(), { jetzt: JETZT, spur: false, modus: "an" });
    expect(await laden().get(`sicherung:${R}:${alt}`, { type: "json" })).toBeNull();
  }, 30000);                 // zwei Läufe über alle Räume dieser Ablage, unter Windows-Last über 5 s
  it("T-15: der Plan zählt Sicherungen über 90 Tage — auch die, die als neueste behalten werden", () => {
    const liste = [...Array.from({ length: 22 }, (_, i) => e(100 + i, 0)), e(3, 0)];
    const p = D.sicherungsPlan(liste, JETZT);
    expect(p.aelterAlsHoechstalter).toHaveLength(22);
    expect(p.behaltenTrotzAlter).toHaveLength(19);              // 20 neueste: e(3) und 19 über 90 Tage
    expect(p.weg).toHaveLength(3);
    for (const k of p.weg) expect(p.aelterAlsHoechstalter).toContain(k);
    expect(D.sicherungsPlan([e(10, 0)], JETZT).aelterAlsHoechstalter).toEqual([]);
  });
  it("T-15: die Vorschau weist die Zahl im Vermerk aus und löscht nichts", async () => {
    const R = "dsgvo-alter90";
    await B.bestandSchreiben(laden(), R, { version: 9, mandanten: [betrieb("m1", [person("p1")])] }, { durch: "Pruefung" });
    const alt = "2026-05-01-10-00-00-0001";
    await laden().setJSON(`sicherung:${R}:${alt}`, { x: 1 }, { metadata: { zeit: "2026-05-01T10:00:00.000Z", mandantId: "m-alt90" } });
    const v = await D.datenschutzLauf(laden(), { jetzt: JETZT, spur: false, modus: "vorschau" });
    expect(v.sicherungenAelterHoechstalter).toBeGreaterThanOrEqual(1);
    expect(v.sicherungenAelterHoechstalterBehalten).toBeGreaterThanOrEqual(1);   // einzige ihres Kontingents
    expect(v.sicherungenGeloescht).toBe(0);
    expect(await laden().get(`sicherung:${R}:${alt}`, { type: "json" })).toEqual({ x: 1 });
  }, 30000);
});

describe("Spur und Zeitsteuerung", () => {
  it("die Spur wird nach 30 Tagen gelöscht (im Modus „an“)", async () => {
    const { getStore } = await import("../server/lib/ablage.mjs");
    const spur = getStore({ name: "centric-spur" });
    await spur.setJSON("2020-01-01/schreiben/alt", { zeit: "2020-01-01T00:00:00Z" });
    await D.datenschutzLauf(laden(), { spur: true, modus: "vorschau" });
    expect(await spur.get("2020-01-01/schreiben/alt", { type: "json" })).toBeTruthy();
    await D.datenschutzLauf(laden(), { spur: true, modus: "an" });
    expect(await spur.get("2020-01-01/schreiben/alt", { type: "json" })).toBeNull();
  }, 30000);
  it("server.mjs führt den Datenschutzlauf täglich aus, gesteuert über CENTRIC_DATENSCHUTZLAUF", async () => {
    const wurzelRepo = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
    const quelle = await readFile(path.join(wurzelRepo, "server.mjs"), "utf8");
    expect(quelle).toMatch(/import \{ datenschutzLauf, modusAusUmgebung \} from "\.\/server\/lib\/datenschutzlauf\.mjs"/);
    expect(quelle).toMatch(/await datenschutzLauf\(/);
    expect(await readFile(path.join(wurzelRepo, ".env.example"), "utf8")).toMatch(/# CENTRIC_DATENSCHUTZLAUF=vorschau/);
  });
});

describe("Review-Auflagen der Nachprüfung (N-1 bis N-4, M5-Rest)", () => {
  it("N-1: ein ungültiger Altwert in Betrieb m2 sperrt das Speichern für m1 nicht; eigene ungültige Werte schon", async () => {
    const R = "dsgvo-n1";
    await B.bestandSchreiben(laden(), R, { version: 9, mandanten: [betrieb("m1", [person("l1", "leitung")]),
      betrieb("m2", [person("x1")], { aufbewahrung: { plandatenMonate: 1.5 } })] }, { durch: "Pruefung" });
    const t = await sitzung(R, "l1", "leitung", "m1");
    const g = await anfrage("/api/bestand", { token: t });
    const b = JSON.parse(JSON.stringify(g.bestand));
    b.mandanten[0].name = "Betrieb m1 neu";
    const p = await anfrage("/api/bestand", { methode: "PUT", token: t, rumpf: { bestand: b, etag: g.etag } });
    expect(p.status, JSON.stringify(p).slice(0, 300)).toBe(200);
    /* Der Altwert bleibt, wie er ist — nie still gelöscht. */
    expect((await B.bestandLesen(laden(), R)).bestand.mandanten[1].aufbewahrung).toEqual({ plandatenMonate: 1.5 });
    const g2 = await anfrage("/api/bestand", { token: t });
    const b2 = JSON.parse(JSON.stringify(g2.bestand));
    b2.mandanten[0].aufbewahrung = { plandatenMonate: 2.5 };
    expect((await anfrage("/api/bestand", { methode: "PUT", token: t, rumpf: { bestand: b2, etag: g2.etag } })).status).toBe(422);
    /* Der Lauf überspringt und meldet ihn. */
    const v = await D.datenschutzLauf(laden(), { jetzt: new Date("2026-11-02T03:00:00Z"), spur: false, modus: "vorschau" });
    expect(v.fehler.some((f) => f.raum === R && f.betrieb === "m2")).toBe(true);
  }, 30000);

  it("N-1: Lesen zeigt einen Altwert als Vorgabe; die Oberfläche speichert nur ganze Monate von 1 bis 600", async () => {
    expect(A.fristen({ aufbewahrung: { plandatenMonate: 1.5, gruendeMonate: 4 } }))
      .toMatchObject({ plandatenMonate: A.VORGABE.plandatenMonate, gruendeMonate: 4 });
    expect([A.fristWert(1.5), A.fristWert(0), A.fristWert(-3), A.fristWert(1e9), A.fristWert("x"), A.fristWert("36")])
      .toEqual([2, 1, 1, 600, 1, 36]);
    const app = appQuelle();
    expect(app).toMatch(/\[k\]: fristWert\(v\)/);
    expect(app).toMatch(/min=\{FRIST_GRENZEN\.min\} max=\{FRIST_GRENZEN\.max\} step="1"/);
    expect(app).not.toMatch(/Math\.max\(1, Number\(v\) \|\| 1\)/);
  });

  it("N-4: Bestätigungen über die Person — selbst ohne Namen der bestätigenden Person, die Leitung in ihrer Sicht", async () => {
    const R = "dsgvo-n4";
    const eintrag = (id, pid) => ({ id, personId: pid, datum: "2026-10-05", dienstId: "F", stufe: "achtung",
      befunde: [{ id: "ruhezeit", stufe: "achtung" }], grundArt: "personal", durch: "Lea Leitung", durchId: "l1",
      rolle: "leitung", zeit: "2026-10-04T10:00:00.000Z", regelstand: "2026-10" });
    await B.bestandSchreiben(laden(), R, { version: 9, mandanten: [betrieb("m1",
      [person("a1"), person("b1"), person("l1", "leitung")], { bestaetigungen: [eintrag("bs1", "a1"), eintrag("bs2", "b1")] })] },
    { durch: "Pruefung" });
    const s = await anfrage("/api/auskunft", { token: await sitzung(R, "a1", "mitarbeiter", "m1") });
    expect(s.status, JSON.stringify(s).slice(0, 300)).toBe(200);
    expect(s.bestaetigungen.map((x) => x.id)).toEqual(["bs1"]);
    expect(s.bestaetigungen[0]).toMatchObject({ stufe: "achtung", rolle: "leitung", datum: "2026-10-05" });
    expect(s.bestaetigungen[0].durch).toBeUndefined();
    expect(s.bestaetigungen[0].durchId).toBeUndefined();
    expect(JSON.stringify(s)).not.toContain("Lea Leitung");
    expect(s.hinweis).toMatch(/Betriebsrat enthalten keine Einzeldaten/);
    const l = await anfrage("/api/auskunft?person=a1", { token: await sitzung(R, "l1", "leitung", "m1") });
    expect(l.bestaetigungen.map((x) => x.id)).toEqual(["bs1"]);
  });

  it("M5-Rest: die Spur wird je Tag über ein Präfix gelesen, nie als ganze Liste", async () => {
    const { protokollZurPerson } = await import("../server/lib/auskunft.mjs");
    const aufrufe = [];
    const spur = { list: async (o) => { aufrufe.push(o && o.prefix); return { blobs: [] }; }, get: async () => null };
    await protokollZurPerson(spur, { raumKennung: "s:x", mandantId: "m1", personId: "a1", einBetrieb: true,
      jetzt: new Date("2026-11-02T12:00:00Z") });
    expect(aufrufe.length).toBe(31);
    expect(aufrufe.every((p) => typeof p === "string" && /^\d{4}-\d{2}-\d{2}\/$/.test(p))).toBe(true);
    expect(aufrufe[0]).toBe("2026-11-02/");
  });

  it("N-3: Zurückspielen bei Datenschutzlauf „vorschau“ — nichts gelöscht, Fälliges gemeldet", async () => {
    const R = "dsgvo-n3";
    await B.bestandSchreiben(laden(), R, { version: 9, mandanten: [betrieb("m1", [person("l1", "leitung"), person("p1")], {
      einstempeln: { "p1|2023-01-05": { start: "06:00", ende: "14:00" }, "p1|2026-10-01": { start: "06:00" } } })] },
    { durch: "Pruefung" });
    const { markeNeu } = await import("../server/lib/sicherungen.mjs");
    const marke = markeNeu(new Date("2026-10-01T08:00:00Z"));
    await laden().setJSON(`sicherung:${R}:${marke}`, (await B.bestandLesen(laden(), R)).bestand,
      { metadata: { zeit: "2026-10-01T08:00:00.000Z", durch: "Leitung" } });
    const t = await sitzung(R, "l1", "leitung", "m1");
    const g = await anfrage("/api/bestand", { token: t });
    process.env.CENTRIC_DATENSCHUTZLAUF = "vorschau";
    let w;
    try { w = await anfrage("/api/wiederherstellen", { methode: "POST", token: t, rumpf: { marke, etag: g.etag } }); }
    finally { delete process.env.CENTRIC_DATENSCHUTZLAUF; }
    expect(w.status, JSON.stringify(w).slice(0, 300)).toBe(200);
    expect(w.fristen).toMatchObject({ modus: "vorschau", geloescht: false });
    expect(w.fristen.faellig).toBeGreaterThan(0);
    expect((await B.bestandLesen(laden(), R)).bestand.mandanten[0].einstempeln["p1|2023-01-05"]).toBeTruthy();
  }, 30000);
});
