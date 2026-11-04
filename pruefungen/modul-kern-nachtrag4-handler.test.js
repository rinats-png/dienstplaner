/* ==========================================================================
   WP-19.0 — NACHTRAG ZUM VIERTEN UNABHÄNGIGEN OPUS-DELTA-REVIEW (Handler)

   N-1: Löschvermerk und automatische Sicherung „vor Verlust" im selben PUT.
   Der Vermerk entsteht beim Zusammenführen, die Sicherung (Stand VOR der
   Löschung) wurde danach mit neuer Uhrzeit abgelegt — der Vermerk galt dann
   als älter als die Sicherung und wirkte beim Wiederherstellen nicht.
   ========================================================================== */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const WIRT = "127.0.0.1:3000";
const RAUM = "wp190n4raum";
const EIN = "2026-10-01T08:00:00.000Z";
const AUS = { an: false, eingeschaltetAm: EIN, geaendertAm: EIN, geaendertVon: "l1" };
let wurzel, laden, daten, B, token, vorLoeschung;
let nr = 0;

const anfrage = async (pfad, { methode = "POST", rumpf } = {}) => {
  nr += 1;
  const kopf = { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.40.${Math.floor(nr / 250)}.${nr % 250}` };
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

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-wp190n4-"));
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
  await B.bestandSchreiben(laden(), RAUM, { version: 9, mandanten: [{
    id: "m-a", name: "A", status: "aktiv", pakete: ["sicherheit"],
    einstellungen: { branchenmodule: { posten: AUS } },
    einheiten: [{ id: "e1" }], dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00" }],
    objekte: [{ id: "ob1", name: "Werk", posten: [{ id: "po1", name: "Tor", soll: { F: 1 } }] }],
    postenPlan: { "a1|2026-11-02": "po1", "a1|2026-11-03": "po1" },
    personen: [person("l1", "leitung"), person("a1", "mitarbeiter")],
    abweichungen: abw(), einstempeln: {}, erfassung: {}, anfragen: [], notrufe: [], nachrichten: [], abwesenheiten: [],
  }] }, { durch: "Pruefung" });
  const code = "WPN4-AAAA-0001";
  await kontoSchreiben(laden(), ablageSchluessel(code), { name: "l1", bestand: RAUM, rolle: "leitung", person: "l1", betrieb: 0,
    mandantId: "m-a", angelegt: "2026-01-01T00:00:00.000Z" });
  token = (await anfrage("/api/anmelden", { rumpf: { zugangscode: code } })).token;
  expect(token).toBeTruthy();
}, 120000);
afterAll(async () => { await rm(wurzel, { recursive: true, force: true }); });

describe("N-1 — Löschvermerk gegen die automatische Sicherung im selben Speichervorgang", () => {
  it("Sonde: Art.-17-Löschung und ≥ 34 % Listenverlust in einem PUT; Modul später wieder an; Zurückspielen der automatischen Sicherung bringt den Eintrag nicht zurück", async () => {
    vorLoeschung = (await B.bestandLesen(laden(), RAUM)).bestand;
    const r = await anfrage("/api/bestand", { methode: "GET" });
    const b = JSON.parse(JSON.stringify(r.bestand));
    const m = b.mandanten[0];
    delete m.postenPlan["a1|2026-11-02"];
    m.moduldatenAusnahme = { modul: "posten", art: "loeschung", grund: "art17", eintraege: { postenPlan: ["a1|2026-11-02"] } };
    for (const k of Object.keys(m.abweichungen).slice(0, 5)) delete m.abweichungen[k];     // 5 von 12 ≥ 34 %
    const w = await anfrage("/api/bestand", { methode: "PUT", rumpf: { bestand: b, etag: r.etag, durch: "Test" } });
    expect(w.status, w.roh).toBe(200);
    expect((await gespeichert()).postenPlan).toEqual({ "a1|2026-11-03": "po1" });

    const liste = (await laden().list({ prefix: `sicherung:${RAUM}:` })).blobs.map((x) => x.key);
    const auto = [];
    for (const key of liste) {
      const md = await laden().getMetadata(key);
      if (md?.metadata?.automatisch === "ja") auto.push(key.slice(`sicherung:${RAUM}:`.length));
    }
    expect(auto).toHaveLength(1);
    /* Die Sicherung trägt die Lesezeit VOR der Änderung — nie eine Zeit nach dem Vermerk. */
    const am = (await gespeichert()).einstellungen.moduldatenLoeschvermerke.at(-1).am;
    const zeit = (await laden().getMetadata(`sicherung:${RAUM}:${auto[0]}`)).metadata.zeit;
    expect(Date.parse(zeit)).toBeLessThanOrEqual(Date.parse(am));

    /* Das Modul gilt später wieder als eingeschaltet. */
    const roh = (await B.bestandLesen(laden(), RAUM)).bestand;
    delete roh.mandanten[0].einstellungen.branchenmodule;
    await B.bestandSchreiben(laden(), RAUM, roh, { durch: "Pruefung" });
    const stand = (await B.bestandLesen(laden(), RAUM)).stand;

    const z = await anfrage("/api/wiederherstellen", { rumpf: { marke: auto[0], etag: stand } });
    expect(z.status, z.roh).toBe(200);
    const nach = await gespeichert();
    expect(Object.keys(nach.postenPlan)).not.toContain("a1|2026-11-02");
    expect(nach.postenPlan["a1|2026-11-03"]).toBe("po1");
  });

  it("robust: eine automatische Sicherung mit späterer abgelegter Zeit (Vermerk + 5000 ms) bringt den Eintrag ebenfalls nicht zurück", async () => {
    const am = (await gespeichert()).einstellungen.moduldatenLoeschvermerke.at(-1).am;
    const marke = "2026-11-04-12-00-00-0042";
    await laden().setJSON(`sicherung:${RAUM}:${marke}`, vorLoeschung,
      { metadata: { zeit: new Date(Date.parse(am) + 5000).toISOString(), durch: "automatisch vor Verlust von 40 %", automatisch: "ja" } });
    const stand = (await B.bestandLesen(laden(), RAUM)).stand;
    const z = await anfrage("/api/wiederherstellen", { rumpf: { marke, etag: stand } });
    expect(z.status, z.roh).toBe(200);
    expect(Object.keys((await gespeichert()).postenPlan)).not.toContain("a1|2026-11-02");
  });
});
