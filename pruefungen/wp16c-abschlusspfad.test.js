/* ==========================================================================
   WP-16c — Nachweis Abschlusspfad (Datenintegrität, HTTP): Abschluss sperrt Ist-Änderungen, Export aus eingefrorenem
   Stand, Absage lässt den Bestand unverändert, Mandantentrennung. Ergänzt wp16c-korrekturrevision.test.js.
   ========================================================================== */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { VERSION } from "../src/migration.js";
import { abschliessen, lohnexportBestaetigen, exportZeilenFuer } from "../server/lib/monatsabschluss.mjs";

const WIRT = "127.0.0.1:3000";
const JETZT = "2026-11-05T09:00:00Z";
const OKT = "2026-10";
const TROTZ = { trotzVormonat: true, vormonatKategorie: "vor_inbetriebnahme", vormonatGrund: "Vormonate ohne Zeitdaten vor dem Start" };
const WER_L1 = { personId: "l1", name: "L1", rolle: "leitung" };
const ROLLEN = { l1: "leitung", l2: "leitung", p1: "planer", a1: "mitarbeiter" };
let wurzel, laden, daten, B, sitzungAnlegen, A, FL;

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-wp16c-pfad-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
  const { getStore } = await import("../server/lib/ablage.mjs");
  laden = () => getStore({ name: "centric", consistency: "strong" });
  const schutz = await import("../server/lib/schutz.mjs");
  for (const art of Object.keys(schutz.GRENZEN)) schutz.GRENZEN[art] = { ...schutz.GRENZEN[art], versuche: 100000 };
  daten = (await import("../server/funktionen/daten.mjs")).default;
  B = await import("../server/lib/bestand.mjs");
  ({ sitzungAnlegen } = await import("../server/lib/sitzungen.mjs"));
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(JETZT));
  A = await import("../src/App.jsx");
  FL = await import("../src/lib/fachlogik.js");
}, 120000);
afterAll(async () => {
  vi.useRealTimers();
  if (wurzel) await rm(wurzel, { recursive: true, force: true });
});

function betrieb(id) {
  const m = A.leererMandant(`Betrieb ${id}`, "pflege");
  const e1 = m.einheiten[0].id;
  const F = { ...m.dienstarten[0], mindest: { mo_do: 0, fr: 0, sa: 0, so: 0 }, mindestQual: {}, id: "F", name: "Früh", kurz: "F", start: "06:00", ende: "14:00", pause: 30, form: "regel" };
  m.id = id;
  m.bundesland = "BY";
  m.dienstarten = [F];
  m.einstellungen = { ...m.einstellungen, nachtVon: "23:00", nachtBis: "06:00", ruhezeit: 11 };
  m.zuschlaege = [{ id: "z-sa", art: "samstag", name: "Samstag", prozent: 10, aktiv: true }];
  m.personen = Object.keys(ROLLEN).map((p, i) => ({ ...A.zugangsPerson(ROLLEN[p], e1, i + 1), id: p, vorname: "V", nachname: p.toUpperCase(),
    personalnummer: `P${i + 1}`, rolle: ROLLEN[p], eintritt: "2020-01-01", zugehoerigkeit: [{ ab: "2020-01-01", einheitId: e1 }],
    imSchichtdienst: false, wochenstunden: 39, geburtstag: "1985-01-01" }));
  m.abweichungen = {}; m.erfassung = {};
  for (const t of ["05", "06", "07", "31"]) {
    m.abweichungen[`a1|2026-10-${t}`] = "F";
    m.erfassung[`a1|2026-10-${t}`] = { start: null, ende: null, bestaetigt: true, grund: "" };
  }
  m.einstempeln = {}; m.abwesenheiten = []; m.anfragen = []; m.nachrichten = []; m.monatsabschluss = {};
  m.lohnarten = undefined;
  return m;
}

let nr = 0;
const anfrage = async (pfad, { methode = "POST", rumpf, token } = {}) => {
  nr += 1;
  const kopf = { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.31.${Math.floor(nr / 250) % 250}.${nr % 250}` };
  if (methode !== "GET") kopf["content-type"] = "application/json";
  if (token) kopf.authorization = `Bearer ${token}`;
  const a = await daten(new Request(`http://${WIRT}/api/${pfad}`, { method: methode, headers: kopf,
    ...(methode === "GET" ? {} : { body: JSON.stringify(rumpf || {}) }) }), {});
  const text = await a.text();
  let d = {}; try { d = JSON.parse(text); } catch { /* leer */ }
  return { status: a.status, roh: text, ...d };
};
const token = async (id, raum, mandantId, betrieb = 0) => (await sitzungAnlegen({ bestand: raum, name: `V ${id.toUpperCase()}`, rolle: ROLLEN[id], person: id,
  betrieb, mandantId, einheit: null }, 24 * 3600 * 1000)).token;
const mandant = async (raum, id) => (await B.bestandLesen(laden(), raum)).bestand.mandanten.find((m) => m.id === id);
const abschlussPost = (t, rumpf) => anfrage("monatsabschluss", { token: t, rumpf: { monat: OKT, ...rumpf } });
const kopie = (x) => JSON.parse(JSON.stringify(x));

describe("WP-16c Abschlusspfad: Sperre, eingefrorener Export, Absage, Mandantentrennung", { timeout: 240000 }, () => {
  it("Abschluss sperrt Ist-Änderungen; der Export kommt aus dem eingefrorenen Stand; Absagen lassen den Bestand unverändert", async () => {
    const raum = "wp16c-pfad";
    await B.bestandSchreiben(laden(), raum, { version: VERSION, mandanten: [betrieb("m1")] }, { durch: "Pruefung" });
    const [tL1, tL2, tP, tA] = [await token("l1", raum, "m1"), await token("l2", raum, "m1"), await token("p1", raum, "m1"), await token("a1", raum, "m1")];
    expect((await abschlussPost(tL1, { aktion: "abschliessen", trotzPrueffaellen: true })).status).toBe(200);
    const sicht = (await anfrage("bestand", { methode: "GET", token: tL1 })).bestand.mandanten[0];
    const ex = await abschlussPost(tL1, { aktion: "lohnexport", ...FL.lohnexportStand(sicht, OKT), ...TROTZ });
    expect(ex.status, ex.roh).toBe(200);
    const nachExport = await mandant(raum, "m1");
    const eingefroren = exportZeilenFuer(nachExport, OKT).zeilen;
    expect(eingefroren.length).toBeGreaterThan(0);

    /* Ist-Änderung im abgeschlossenen Monat per PUT: abgewiesen, nichts geschrieben */
    const g = await anfrage("bestand", { methode: "GET", token: tL1 });
    const b = kopie(g.bestand);
    delete b.mandanten[0].abweichungen["a1|2026-10-31"];
    delete b.mandanten[0].erfassung["a1|2026-10-31"];
    const vorPut = JSON.stringify((await B.bestandLesen(laden(), raum)).bestand);
    const put = await anfrage("bestand", { methode: "PUT", token: tL1, rumpf: { bestand: b, etag: g.etag } });
    expect(put.status, put.roh).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify((await B.bestandLesen(laden(), raum)).bestand)).toBe(vorPut);

    /* Der Export bleibt aus dem Freeze: auch ein (hypothetisch) verändertes Ist ändert die Exportzeilen nicht */
    const verfaelscht = kopie(nachExport);
    delete verfaelscht.abweichungen["a1|2026-10-31"];
    delete verfaelscht.erfassung["a1|2026-10-31"];
    expect(exportZeilenFuer(verfaelscht, OKT).zeilen).toEqual(eingefroren);

    /* Absagen: unberechtigt, unvollständig, Wiederöffnen nach Export, Freigabe ohne Korrektur, ohne Anmeldung */
    const rumpfB = { aktion: "korrektur-beginnen", anlass: "fehler", grund: "Samstagsdienst war länger als eingetragen" };
    const absagen = [
      await abschlussPost(tP, rumpfB), await abschlussPost(tA, rumpfB),
      await abschlussPost(tL1, { ...rumpfB, anlass: undefined }),
      await abschlussPost(tL1, { aktion: "wiederoeffnen", grund: "Nachtrag eines vergessenen Dienstes" }),
      await abschlussPost(tL2, { aktion: "korrektur-freigeben" }),
      await anfrage("monatsabschluss", { rumpf: { monat: OKT, ...rumpfB } }),
    ];
    for (const a of absagen) expect(a.status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify((await B.bestandLesen(laden(), raum)).bestand)).toBe(vorPut);
    expect((await mandant(raum, "m1")).monatsabschluss[OKT]).toMatchObject({ abgeschlossen: true });
  });

  it("Mandantentrennung: Leitung eines anderen Betriebs derselben Ablage verändert Abschluss und Export des ersten nicht", async () => {
    const raum = "wp16c-pfad-mandanten";
    await B.bestandSchreiben(laden(), raum, { version: VERSION, mandanten: [betrieb("m1"), betrieb("m2")] }, { durch: "Pruefung" });
    const t1 = await token("l1", raum, "m1");
    const t2 = await token("l1", raum, "m2", 1);
    expect((await abschlussPost(t1, { aktion: "abschliessen", trotzPrueffaellen: true })).status).toBe(200);
    const sicht1 = (await anfrage("bestand", { methode: "GET", token: t1 })).bestand.mandanten.find((m) => m.id === "m1");
    expect((await abschlussPost(t1, { aktion: "lohnexport", ...FL.lohnexportStand(sicht1, OKT), ...TROTZ })).status).toBe(200);
    const m1Vor = JSON.stringify(await mandant(raum, "m1"));

    /* Betrieb 2 wirkt nur auf sich selbst: Korrektur beginnen scheitert (dort kein Export), Abschluss/Wiederöffnen betreffen m2 */
    const fremd = await abschlussPost(t2, { aktion: "korrektur-beginnen", anlass: "fehler", grund: "Samstagsdienst war länger als eingetragen" });
    expect(fremd.status, fremd.roh).toBe(409);   // m2: Monat nicht abgeschlossen/exportiert; m1 bleibt unberührt
    expect((await abschlussPost(t2, { aktion: "abschliessen", trotzPrueffaellen: true })).status).toBe(200);
    expect((await abschlussPost(t2, { aktion: "wiederoeffnen", grund: "Nachtrag eines vergessenen Dienstes" })).status).toBe(200);
    expect(JSON.stringify(await mandant(raum, "m1"))).toBe(m1Vor);
    expect((await mandant(raum, "m1")).monatsabschluss[OKT]).toMatchObject({ abgeschlossen: true });
    expect((await mandant(raum, "m2")).monatsabschluss[OKT]).toMatchObject({ abgeschlossen: false });

    /* Bibliothek: Export ohne Abschluss im zweiten Betrieb wird abgewiesen, der erste bleibt gültig */
    const a = abschliessen(betrieb("m1"), { monat: OKT, trotzPrueffaellen: true }, WER_L1, new Date(JETZT), "ma-a", "2026-11-05");
    const ohne = lohnexportBestaetigen(betrieb("m2"), { monat: OKT, ...TROTZ }, WER_L1, new Date(JETZT), "le-x");
    expect("status" in a).toBe(false);
    expect("status" in ohne).toBe(true);
  });
});
