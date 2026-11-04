/* ==========================================================================
   WP-19.0 — NACHTRAG ZUM FÜNFTEN UNABHÄNGIGEN OPUS-DELTA-REVIEW (Handler)

   B-1: Die Pauschalregel „automatische Sicherung = Zeit unbekannt = jeder Vermerk wirkt" löschte beim
   Wiederherstellen nach einem Unfall legitime Daten (neu geplant, berichtigt). Jetzt tragen neue
   automatische Sicherungen die Lesezeit des gesicherten Stands (zeitquelle: "lesezeit"); nur
   automatische Sicherungen OHNE diese Markierung (Altbestand) gelten als „Zeit unbekannt".
   Alle Fälle laufen über die echten Handler (PUT /api/bestand, /api/sicherung, /api/wiederherstellen).
   ========================================================================== */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const WIRT = "127.0.0.1:3000";
const RAUM = "wp190n5raum";
const EIN = "2026-10-01T08:00:00.000Z";
const AUS = { an: false, eingeschaltetAm: EIN, geaendertAm: EIN, geaendertVon: "l1" };
const T2 = "a1|2026-11-02";
const T3 = "a1|2026-11-03";
let wurzel, laden, daten, B, token;
let nr = 0;

const pause = (ms = 8) => new Promise((r) => setTimeout(r, ms));
const anfrage = async (pfad, { methode = "POST", rumpf } = {}) => {
  nr += 1;
  const kopf = { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.50.${Math.floor(nr / 250)}.${nr % 250}` };
  if (methode !== "GET") kopf["content-type"] = "application/json";
  if (token) kopf.authorization = `Bearer ${token}`;
  const a = await daten(new Request(`http://${WIRT}${pfad}`, { method: methode, headers: kopf,
    ...(methode === "GET" ? {} : { body: JSON.stringify(rumpf || {}) }) }), {});
  const text = await a.text();
  let d = {}; try { d = JSON.parse(text); } catch { /* leer */ }
  return { status: a.status, roh: text, ...d };
};
const gespeichert = async () => (await B.bestandLesen(laden(), RAUM)).bestand.mandanten[0];
const abw = () => Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`a1|2026-12-${String(i + 1).padStart(2, "0")}`, "F"]));
const person = (id, rolle) => ({ id, vorname: `V${id}`, nachname: `N${id}`, rolle, bereich: "ALLE", status: "aktiv",
  zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }] });
const grundstand = () => ({ version: 9, mandanten: [{
  id: "m-a", name: "A", status: "aktiv", pakete: ["sicherheit"],
  einstellungen: { branchenmodule: { posten: AUS } },
  einheiten: [{ id: "e1" }], dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00" }],
  objekte: [{ id: "ob1", name: "Werk", posten: [{ id: "po1", name: "Tor", soll: { F: 1 } }, { id: "po2", name: "Halle", soll: { F: 1 } }] }],
  postenPlan: { [T2]: "po1", [T3]: "po1" },
  personen: [person("l1", "leitung"), person("a1", "mitarbeiter")],
  abweichungen: abw(), einstempeln: {}, erfassung: {}, anfragen: [], notrufe: [], nachrichten: [], abwesenheiten: [],
}] });
const neuStart = async () => { await B.bestandSchreiben(laden(), RAUM, grundstand(), { durch: "Pruefung" }); await pause(); };
const modulAn = async () => {
  const roh = (await B.bestandLesen(laden(), RAUM)).bestand;
  delete roh.mandanten[0].einstellungen.branchenmodule;
  await B.bestandSchreiben(laden(), RAUM, roh, { durch: "Pruefung" });
  await pause();
};
/** GET, ändern, PUT über den echten Handler. */
const speichern = async (aendern) => {
  const r = await anfrage("/api/bestand", { methode: "GET" });
  const b = JSON.parse(JSON.stringify(r.bestand));
  aendern(b.mandanten[0]);
  const w = await anfrage("/api/bestand", { methode: "PUT", rumpf: { bestand: b, etag: r.etag, durch: "Test" } });
  expect(w.status, w.roh).toBe(200);
  await pause();
};
const sicherungsMarken = async () => (await laden().list({ prefix: `sicherung:${RAUM}:` })).blobs
  .map((x) => x.key.slice(`sicherung:${RAUM}:`.length));
const neueSicherungen = async (vorher) => {
  const jetzt = await sicherungsMarken();
  const out = [];
  for (const marke of jetzt.filter((x) => !vorher.includes(x)))
    out.push({ marke, md: (await laden().getMetadata(`sicherung:${RAUM}:${marke}`)).metadata });
  return out;
};
const wiederherstellen = async (marke) => {
  const stand = (await B.bestandLesen(laden(), RAUM)).stand;
  const z = await anfrage("/api/wiederherstellen", { rumpf: { marke, etag: stand } });
  expect(z.status, z.roh).toBe(200);
  await pause();
};
const art17 = (m) => { delete m.postenPlan[T2];
  m.moduldatenAusnahme = { modul: "posten", art: "loeschung", grund: "art17", eintraege: { postenPlan: [T2] } }; };
const art16 = (m) => { m.postenPlan[T3] = "po2";
  m.moduldatenAusnahme = { modul: "posten", art: "berichtigung", grund: "art16", eintraege: { postenPlan: [T3] } }; };
/** Unfall: Postenplan leer und die Hälfte der Abweichungen weg (Listenverlust ≥ 34 %). */
const unfall = (m) => { m.postenPlan = {}; for (const k of Object.keys(m.abweichungen).slice(0, 8)) delete m.abweichungen[k]; };
/** Sonde des Reviewers bis kurz vor den Unfall. */
const bisVorUnfall = async () => {
  await neuStart();
  await speichern(art17);
  await speichern(art16);
  await modulAn();
  await speichern((m) => { m.postenPlan[T2] = "po2"; });                       // legitime Neuplanung
  expect((await gespeichert()).postenPlan).toEqual({ [T2]: "po2", [T3]: "po2" });
};

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-wp190n5-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
  const { getStore } = await import("../server/lib/ablage.mjs");
  laden = () => getStore({ name: "centric", consistency: "strong" });
  const schutz = await import("../server/lib/schutz.mjs");
  for (const art of Object.keys(schutz.GRENZEN)) schutz.GRENZEN[art] = { ...schutz.GRENZEN[art], versuche: 100000 };
  daten = (await import("../server/funktionen/daten.mjs")).default;
  const { kontoSchreiben } = await import("../server/lib/konten.mjs");
  const { ablageSchluessel } = await import("../server/lib/codes.mjs");
  B = await import("../server/lib/bestand.mjs");
  await neuStart();
  const code = "WPN5-AAAA-0001";
  await kontoSchreiben(laden(), ablageSchluessel(code), { name: "l1", bestand: RAUM, rolle: "leitung", person: "l1", betrieb: 0,
    mandantId: "m-a", angelegt: "2026-01-01T00:00:00.000Z" });
  token = (await anfrage("/api/anmelden", { rumpf: { zugangscode: code } })).token;
  expect(token).toBeTruthy();
}, 120000);
afterAll(async () => { await rm(wurzel, { recursive: true, force: true }); });

describe("B-1 — Wiederherstellen nach einem Unfall behält legitime Neuplanung und Berichtigung", () => {
  it("Sonde des Reviewers: Art.17 + Art.16, Modul wieder an, Neuplanung, Unfall-PUT, Restore der automatischen Sicherung", async () => {
    await bisVorUnfall();
    const vorher = await sicherungsMarken();
    await speichern(unfall);
    expect((await gespeichert()).postenPlan).toEqual({});
    const neu = await neueSicherungen(vorher);
    const auto = neu.filter((x) => x.md.automatisch === "ja");
    expect(auto).toHaveLength(1);
    expect(auto[0].md.zeitquelle).toBe("lesezeit");
    await wiederherstellen(auto[0].marke);
    /* Neu geplanter (11-02) UND berichtigter (11-03) Eintrag sind zurück; die Sicherung hat sie schon. */
    expect((await gespeichert()).postenPlan).toEqual({ [T2]: "po2", [T3]: "po2" });
  });

  it("Gegenprobe F1: eine manuelle Sicherung nach den Vermerken behält die Neuplanung", async () => {
    await bisVorUnfall();
    const vorher = await sicherungsMarken();
    const s = await anfrage("/api/sicherung");
    expect(s.status, s.roh).toBe(200);
    await pause();
    await speichern(unfall);
    expect((await gespeichert()).postenPlan).toEqual({});
    await wiederherstellen(s.marke);
    expect((await gespeichert()).postenPlan).toEqual({ [T2]: "po2", [T3]: "po2" });
    expect(await neueSicherungen(vorher)).not.toHaveLength(0);
  });

  it("Gegenprobe N-1: Art.17-Löschung und ≥ 34 % Listenverlust im selben PUT, Modul später wieder an → gelöschter Eintrag bleibt gelöscht", async () => {
    await neuStart();
    const vorher = await sicherungsMarken();
    await speichern((m) => { art17(m); for (const k of Object.keys(m.abweichungen).slice(0, 8)) delete m.abweichungen[k]; });
    const auto = (await neueSicherungen(vorher)).filter((x) => x.md.automatisch === "ja");
    expect(auto).toHaveLength(1);
    const am = (await gespeichert()).einstellungen.moduldatenLoeschvermerke.at(-1).am;
    expect(Date.parse(auto[0].md.zeit)).toBeLessThanOrEqual(Date.parse(am));      // Lesezeit vor dem Vermerk
    await modulAn();
    await wiederherstellen(auto[0].marke);
    const nach = await gespeichert();
    expect(Object.keys(nach.postenPlan)).not.toContain(T2);
    expect(nach.postenPlan[T3]).toBe("po1");
  });

  it("Sicherung „vor Wiederherstellung“ lässt sich ohne Datenverlust rückgängig machen", async () => {
    await bisVorUnfall();
    const v0 = await sicherungsMarken();
    await speichern(unfall);
    const auto = (await neueSicherungen(v0)).filter((x) => x.md.automatisch === "ja");
    await wiederherstellen(auto[0].marke);                                      // Stand R (Neuplanung + Berichtigung)
    await speichern((m) => { m.postenPlan["a1|2026-11-05"] = "po1"; });          // weitere legitime Arbeit
    const stand = (await gespeichert()).postenPlan;
    expect(stand).toEqual({ [T2]: "po2", [T3]: "po2", "a1|2026-11-05": "po1" });

    const v1 = await sicherungsMarken();
    await wiederherstellen(auto[0].marke);                                      // erneut zurück auf die Unfall-Sicherung
    expect((await gespeichert()).postenPlan).not.toHaveProperty(["a1|2026-11-05"]);
    const vorW = (await neueSicherungen(v1)).filter((x) => /vor Wiederherstellung/.test(x.md.durch));
    expect(vorW).toHaveLength(1);
    expect(vorW[0].md.zeitquelle).toBe("lesezeit");
    await wiederherstellen(vorW[0].marke);                                      // Rückgängig
    expect((await gespeichert()).postenPlan).toEqual(stand);
  });

  it("Altsicherung (automatisch, KEINE zeitquelle-Markierung): Zeit gilt als unbekannt, jeder Vermerk wirkt", async () => {
    await bisVorUnfall();
    const am = (await gespeichert()).einstellungen.moduldatenLoeschvermerke.at(-1).am;
    const marke = "2026-11-04-12-00-00-0077";
    /* Stand vor den Vermerken, abgelegt mit einer Zeit NACH den Vermerken (Altbestand: nicht verlässlich). */
    await laden().setJSON(`sicherung:${RAUM}:${marke}`,
      { version: 9, mandanten: [{ ...grundstand().mandanten[0], einstellungen: {} }] },
      { metadata: { zeit: new Date(Date.parse(am) + 60000).toISOString(), durch: "automatisch vor Verlust von 50 %", automatisch: "ja" } });
    await wiederherstellen(marke);
    const nach = await gespeichert();
    expect(Object.keys(nach.postenPlan)).not.toContain(T2);          // Art.17 wirkt
    expect(nach.postenPlan[T3]).toBe("po2");                         // Art.16: jetziger berichtigter Wert
  });
});
