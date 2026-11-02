/* ==========================================================================
   DSGVO SERVERSEITIG (WP-26) — Auskunft nach Art. 15, Löschlauf nach
   Aufbewahrungsfristen, Ausdünnung von Sicherungen und Spur (F-26)

   Bis November 2026 baute die Oberfläche die Auskunft selbst — ohne
   Stempeldaten, ohne Protokoll, als Text —, und der Löschlauf nach den
   Aufbewahrungsfristen lief nur, wenn jemand in der Oberfläche darauf
   drückte. Hier: GET /api/auskunft und datenschutzLauf auf dem Server.
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WIRT = "127.0.0.1:3000";
const RAUM = "dsgvo-raum";
let wurzel, laden, daten, sitzungAnlegen, B, D;

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
  const { getStore } = await import("../server/lib/ablage.mjs");
  laden = () => getStore({ name: "centric", consistency: "strong" });
  daten = (await import("../server/funktionen/daten.mjs")).default;
  ({ sitzungAnlegen } = await import("../server/lib/sitzungen.mjs"));
  B = await import("../server/lib/bestand.mjs");
  D = await import("../server/lib/datenschutzlauf.mjs");
  const HEUTE = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());
  await B.bestandSchreiben(laden(), RAUM, { version: 9, mandanten: [
    betrieb("m1", [person("a1", "mitarbeiter", { notfallkontakt: "Mutter 0151", iban: "DE00 1234" }),
      person("b1"), person("l1", "leitung")], {
      abweichungen: { [`a1|${HEUTE}`]: "F", [`b1|${HEUTE}`]: "F" },
      erfassung: { "a1|2026-10-05": { start: "06:00", ende: "14:10", bestaetigt: true, grund: "" } },
      einstempeln: { "a1|2026-10-05": { start: "06:00", ende: "14:10", geoStart: { status: "INNERHALB", entfernungGerundet: "20" } },
        "b1|2026-10-05": { start: "07:00" } },
      abwesenheiten: [{ id: "w1", personId: "a1", art: "krank", von: "2026-10-20", bis: "2026-10-21", notiz: "Grippe" },
        { id: "w2", personId: "b1", art: "urlaub", von: "2026-10-20", bis: "2026-10-21" }],
      anfragen: [{ id: "q1", personId: "a1", typ: "urlaub", von: "2026-12-01", bis: "2026-12-02", status: "offen" }],
      aenderungen: [{ personId: "a1", datum: "2026-10-05", von: "-", nach: "F", vorlauf: 3, zeit: "2026-10-02" }],
    }),
    betrieb("m2", [person("x1")]),
  ] }, { durch: "Pruefung" });
});
afterAll(async () => { await rm(wurzel, { recursive: true, force: true }); });

describe("Art. 15: GET /api/auskunft", () => {
  it("die Person über sich selbst: vollständig, maschinenlesbar, mit Stempeln samt Ortsbefund und Protokoll", async () => {
    const t = await sitzung(RAUM, "a1", "mitarbeiter", "m1");
    /* Ein Vorgang, der im Protokoll zur Person landet. */
    expect((await anfrage("/api/stempeln", { methode: "POST", token: t, rumpf: { art: "start",
      datum: new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date()) } })).status).toBe(200);
    const a = await anfrage("/api/auskunft", { token: t });
    expect(a.status, JSON.stringify(a).slice(0, 300)).toBe(200);
    expect(a.kopf.get("content-disposition")).toMatch(/attachment; filename="auskunft-a1-/);
    expect([a.format, a.fassung, a.umfang]).toEqual(["centric-auskunft", 1, "selbst"]);
    expect(a.person).toMatchObject({ id: "a1", notfallkontakt: "Mutter 0151", iban: "DE00 1234" });
    expect(a.stempel.find((x) => x.datum === "2026-10-05")).toMatchObject({ start: "06:00", geoStart: { status: "INNERHALB" } });
    expect(a.stempel.every((x) => x.datum)).toBe(true);
    expect(a.istZeiten).toEqual([{ datum: "2026-10-05", start: "06:00", ende: "14:10", bestaetigt: true, grund: "" }]);
    expect(a.abwesenheiten).toEqual([expect.objectContaining({ id: "w1", notiz: "Grippe" })]);
    expect(a.antraege.map((x) => x.id)).toEqual(["q1"]);
    expect(a.planaenderungen).toHaveLength(1);
    expect(a.planabweichungen.length).toBeGreaterThan(0);
    expect(a.aufbewahrung).toMatchObject({ plandatenMonate: 24, stammdatenMonateNachAustritt: 6, abwesenheitsgruendeMonate: 3 });
    expect(a.protokoll.some((r) => r.art === "schreiben" && /stempeln start/.test(r.zusatz || ""))).toBe(true);
    /* Nichts von anderen. */
    const roh = JSON.stringify(a);
    expect(roh).not.toContain("b1|");
    expect(a.abwesenheiten.some((x) => x.personId === "b1")).toBe(false);
    expect(a.stempel.some((x) => x.start === "07:00")).toBe(false);
  });

  it("Auskunft über eine andere Person: als Mitarbeiterin 403", async () => {
    const t = await sitzung(RAUM, "a1", "mitarbeiter", "m1");
    expect((await anfrage("/api/auskunft?person=b1", { token: t })).status).toBe(403);
  });

  it("die Leitung auf Anfrage: Person des eigenen Betriebs 200 in ihrer Sicht; fremder Betrieb 404", async () => {
    const t = await sitzung(RAUM, "l1", "leitung", "m1");
    const a = await anfrage("/api/auskunft?person=a1", { token: t });
    expect(a.status, JSON.stringify(a).slice(0, 300)).toBe(200);
    expect(a.umfang).toBe("leitung");
    expect(a.person.id).toBe("a1");
    expect(a.stempel.length).toBeGreaterThan(0);
    expect((await anfrage("/api/auskunft?person=x1", { token: t })).status).toBe(404);
  });

  it("der Betreiber erstellt keine Auskunft", async () => {
    const { token } = await sitzungAnlegen({ bestand: RAUM, name: "Betreiber", rolle: "betreiber", person: null,
      betrieb: 0, einheit: null }, 60 * 60 * 1000);
    expect((await anfrage("/api/auskunft?person=a1", { token })).status).toBe(403);
  });
});

describe("Löschlauf nach Aufbewahrungsfristen auf dem Server", () => {
  const JETZT = new Date("2026-11-02T03:00:00Z");
  it("löscht alte Plan-, Zeit- und Stempeldaten, Gründe, anonymisiert Ausgeschiedene — unter Sperre, mit Protokoll", async () => {
    const R = "dsgvo-loeschlauf";
    await B.bestandSchreiben(laden(), R, { version: 9, mandanten: [betrieb("m1", [
      person("p1"), person("p2", "mitarbeiter", { austritt: "2025-12-31", email: "p2@example.org", telefon: "0151" })], {
      abweichungen: { "p1|2024-09-01": "F", "p1|2026-10-01": "F" },
      erfassung: { "p1|2024-09-01": { start: "06:00", ende: "14:00", bestaetigt: true, grund: "" } },
      einstempeln: { "p1|2024-09-01": { start: "06:00", ende: "14:00" }, "p1|2026-10-01": { start: "06:00" } },
      abwesenheiten: [{ id: "w1", personId: "p1", art: "krank", von: "2026-06-01", bis: "2026-06-03", notiz: "Grippe" },
        { id: "w2", personId: "p1", art: "krank", von: "2026-10-20", bis: "2026-10-21", notiz: "Erkältung" }],
    })] }, { durch: "Pruefung" });

    const v = await D.datenschutzLauf(laden(), { jetzt: JETZT, spur: false });
    expect(v.fehler).toEqual([]);
    expect(v.geaendert.map((x) => `${x.raum}/${x.betrieb}`)).toContain(`${R}/m1`);
    const m = (await B.bestandLesen(laden(), R)).bestand.mandanten[0];
    expect(Object.keys(m.abweichungen)).toEqual(["p1|2026-10-01"]);
    expect(m.erfassung["p1|2024-09-01"]).toBeUndefined();
    expect(Object.keys(m.einstempeln)).toEqual(["p1|2026-10-01"]);
    expect(m.abwesenheiten.find((a) => a.id === "w1").notiz).toBe("");
    expect(m.abwesenheiten.find((a) => a.id === "w2").notiz).toBe("Erkältung");
    const p2 = m.personen.find((p) => p.id === "p2");
    expect([p2.anonym, p2.email, p2.telefon, p2.vorname]).toEqual([true, "", "", ""]);
    expect(m.aufbewahrung.zuletztGeraeumt).toBe("2026-11-02");

    /* Ein zweiter Lauf am selben Tag ändert nichts — und schreibt auch nichts. */
    const vorher = (await B.bestandLesen(laden(), R)).stand;
    const v2 = await D.datenschutzLauf(laden(), { jetzt: JETZT, spur: false });
    expect(v2.geaendert.filter((x) => x.raum === R)).toEqual([]);
    expect((await B.bestandLesen(laden(), R)).stand).toBe(vorher);
  });

  it("ein Raum mit unlesbarer Datei wird übersprungen und gemeldet, nicht ohne die Lücke geschrieben", async () => {
    const R = "dsgvo-kaputt";
    await B.bestandSchreiben(laden(), R, { version: 9, mandanten: [betrieb("m1", [person("p1")], {
      abweichungen: { "p1|2024-09-01": "F", "p1|2026-10-01": "F" } })] }, { durch: "Pruefung" });
    const { writeFile } = await import("node:fs/promises");
    const { dateiname } = await import("../server/lib/ablage.mjs");
    await writeFile(path.join(wurzel, "centric", dateiname(`scherbe:${R}:m1:2026-10`)), "{kaputt");
    const v = await D.datenschutzLauf(laden(), { jetzt: JETZT, spur: false });
    expect(v.fehler.map((f) => f.raum)).toContain(R);
    expect(await readFile(path.join(wurzel, "centric", dateiname(`scherbe:${R}:m1:2024-09`)), "utf8")).toContain("p1|2024-09-01");
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
    for (let i = 0; i < 25; i++) liste.push(e(0, i));         // 25 von heute
    liste.push(e(5, 0), e(5, 1));                            // zwei am selben Tag vor 5 Tagen
    liste.push(e(40, 0), e(41, 0));                          // zwei in derselben Woche vor ~40 Tagen
    liste.push(e(120, 0));                                   // zu alt
    const { weg } = D.sicherungsPlan(liste, JETZT);
    expect(weg).toContain("sicherung:r:120-0");
    expect(weg.filter((k) => k.startsWith("sicherung:r:0-"))).toHaveLength(4);   // 25 heute: 20 + 1 für den Tag bleiben
    expect(weg.filter((k) => k.startsWith("sicherung:r:5-"))).toHaveLength(1);
    expect(weg.filter((k) => /sicherung:r:4[01]-/.test(k)).length).toBeLessThanOrEqual(1);
  });
  it("Kontingente getrennt; ohne erkennbares Alter bleibt eine Sicherung liegen", () => {
    const { weg, ohneAlter } = D.sicherungsPlan([e(120, 0, { mandantId: "m1" }),
      { key: "sicherung:r:vor-zerlegung", marke: "vor-zerlegung", meta: {} }], JETZT);
    expect(weg).toEqual(["sicherung:r:120-0"]);
    expect(ohneAlter).toEqual(["sicherung:r:vor-zerlegung"]);
  });
  it("der Lauf löscht in der Ablage, was der Plan wegnimmt", async () => {
    const alt = "2026-06-01-10-00-00-0001";
    await laden().setJSON(`sicherung:${RAUM}:${alt}`, { x: 1 }, { metadata: { zeit: "2026-06-01T10:00:00.000Z", automatisch: "ja" } });
    await laden().setJSON(`sicherung:${RAUM}:2026-11-01-10-00-00-0001`, { x: 2 },
      { metadata: { zeit: "2026-11-01T10:00:00.000Z", automatisch: "ja" } });
    await D.datenschutzLauf(laden(), { jetzt: JETZT, spur: false });
    expect(await laden().get(`sicherung:${RAUM}:${alt}`, { type: "json" })).toBeNull();
    expect(await laden().get(`sicherung:${RAUM}:2026-11-01-10-00-00-0001`, { type: "json" })).toEqual({ x: 2 });
  });
});

describe("Spur und Zeitsteuerung", () => {
  it("die Spur wird nach 30 Tagen gelöscht", async () => {
    const { getStore } = await import("../server/lib/ablage.mjs");
    const spur = getStore({ name: "centric-spur" });
    await spur.setJSON("2020-01-01/schreiben/alt", { zeit: "2020-01-01T00:00:00Z" });
    await D.datenschutzLauf(laden(), { spur: true });
    expect(await spur.get("2020-01-01/schreiben/alt", { type: "json" })).toBeNull();
  });
  it("server.mjs führt den Datenschutzlauf täglich aus (mit dem Löschlauf)", async () => {
    const quelle = await readFile(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "server.mjs"), "utf8");
    expect(quelle).toMatch(/import \{ datenschutzLauf \} from "\.\/server\/lib\/datenschutzlauf\.mjs"/);
    expect(quelle).toMatch(/await datenschutzLauf\(/);
  });
});
