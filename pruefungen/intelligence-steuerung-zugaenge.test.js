/* ==========================================================================
   WP-I16 — Betriebsrat-Pause: Zugänge sind bei aktiver Pause nicht zu umgehen (Review PR #563, Befund MITTEL)

   Betreiberentscheidung: Die Rollenvergabe darf den Schutz nicht umgehen. Neben roles.assign (PUT /api/bestand,
   intelligence-steuerung*.test.js) gilt bei aktiver Pause auch für
   - POST /api/zugang-sperren (einzeln und „alle des Betriebs“): Betriebsrat-Zugänge werden nicht zurückgezogen (403, nichts gesperrt),
   - Einladung ausstellen und Einladung einlösen für eine Betriebsrat-Person: kein neuer Betriebsrat-Zugang (403).
   Unabhängig vom Betreiberschalter CENTRIC_KI_BR_PAUSE; ein unlesbarer Pausenstand zählt als pausiert; im Protokoll nur eine Zahl.
   Nur erfundene Testdaten.
   ========================================================================== */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

vi.setConfig({ testTimeout: 60000, hookTimeout: 120000 });

const WIRT = "127.0.0.1:3000";
const RAUM = "wpi16zugang";
let wurzel, laden, daten, kontoSchreiben, alleKonten, ablageSchluessel, B, E, nr = 0;
const T = {};
const CODE = { l1: "WZ01-AAAA-0001", r1: "WZ02-AAAA-0002", a1: "WZ03-AAAA-0003", a2: "WZ04-AAAA-0004", r3: "WZ05-AAAA-0005" };

const anfrage = async (pfad, { rumpf, token } = {}) => {
  nr += 1;
  const kopf = { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.17.${Math.floor(nr / 250)}.${nr % 250}`, "content-type": "application/json" };
  if (token) kopf.authorization = `Bearer ${token}`;
  const a = await daten(new Request(`http://${WIRT}${pfad}`, { method: "POST", headers: kopf, body: JSON.stringify(rumpf || {}) }), {});
  const text = await a.text();
  let d = {}; try { d = JSON.parse(text); } catch { /* leer */ }
  return { status: a.status, roh: text, ...d };
};
const person = (id, rolle) => ({ id, vorname: `V${id}`, nachname: `N${id}`, rolle, bereich: "e1", status: "aktiv",
  zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }] });
const PAUSE = { aktiv: true, nr: 1, am: "2026-11-25T08:00:00.000Z", vonRolle: "betriebsrat", vonPerson: "r1" };
const STEUERUNG = (pause) => ({ betrieb: { an: true, am: "2026-11-25T07:00:00.000Z", vonRolle: "leitung", vonPerson: "l1" },
  ...(pause === undefined ? {} : { pause }) });
async function setzePause(pause) {
  const b = (await B.bestandLesen(laden(), RAUM)).bestand;
  const m = b.mandanten[0];
  m.einstellungen = pause === null ? {} : { kiSteuerung: STEUERUNG(pause) };
  await B.bestandSchreiben(laden(), RAUM, b, { durch: "Pruefung" });
}
const gesperrt = async (code) => !!(await alleKonten(laden()))[ablageSchluessel(code)]?.gesperrt;
const sperren = (rumpf) => anfrage("/api/zugang-sperren", { token: T.l1, rumpf });
const SITZ = { rolle: "leitung", person: "l1", bestand: RAUM, betrieb: 0, mandantId: "m-a" };
const bestandJetzt = async () => (await B.bestandLesen(laden(), RAUM)).bestand;
const kontenDerPerson = async (p) => Object.values(await alleKonten(laden())).filter((k) => k && k.bestand === RAUM && String(k.person) === p);

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-wpi16-zug-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
  const { getStore } = await import("../server/lib/ablage.mjs");
  laden = () => getStore({ name: "centric", consistency: "strong" });
  const schutz = await import("../server/lib/schutz.mjs");
  for (const art of Object.keys(schutz.GRENZEN)) schutz.GRENZEN[art] = { ...schutz.GRENZEN[art], versuche: 100000 };
  daten = (await import("../server/funktionen/daten.mjs")).default;
  ({ kontoSchreiben, alleKonten } = await import("../server/lib/konten.mjs"));
  ({ ablageSchluessel } = await import("../server/lib/codes.mjs"));
  B = await import("../server/lib/bestand.mjs");
  E = await import("../server/lib/einladungen.mjs");
  await B.bestandSchreiben(laden(), RAUM, { version: 9, mandanten: [{
    id: "m-a", name: "A", status: "aktiv", einstellungen: {},
    einheiten: [{ id: "e1" }], dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00" }],
    personen: [person("l1", "leitung"), person("r1", "betriebsrat"), person("a1", "mitarbeiter"), person("a2", "mitarbeiter"),
      person("r2", "betriebsrat"), person("r3", "betriebsrat"), person("r4", "betriebsrat"), person("a5", "mitarbeiter")],
    abweichungen: {}, einstempeln: {}, erfassung: {}, anfragen: [], notrufe: [], nachrichten: [], abwesenheiten: [],
  }] }, { durch: "Pruefung" });
  /* Zugänge: l1, r1, a1, a2, r3. r2 und r4 sind Betriebsrat-Personen ohne Zugang (für Einladungen). */
  for (const [id, code] of Object.entries(CODE)) {
    const rolle = id.startsWith("l") ? "leitung" : id.startsWith("r") ? "betriebsrat" : "mitarbeiter";
    await kontoSchreiben(laden(), ablageSchluessel(code), { name: id, bestand: RAUM, rolle, person: id, betrieb: 0, mandantId: "m-a",
      angelegt: "2026-01-01T00:00:00.000Z" });
  }
  T.l1 = (await anfrage("/api/anmelden", { rumpf: { zugangscode: CODE.l1 } })).token;
  expect(T.l1).toBeTruthy();
});
afterAll(async () => { await rm(wurzel, { recursive: true, force: true }); });

describe("Pause aktiv: Betriebsrat-Zugänge lassen sich nicht über zugang-sperren zurückziehen", () => {
  it("einzeln (code): 403, der Zugang bleibt; die Zahl steht im Protokoll, kein Name", async () => {
    await setzePause(PAUSE);
    const e = await sperren({ code: CODE.r1 });
    expect(e.status, e.roh).toBe(403);
    expect(await gesperrt(CODE.r1)).toBe(false);
    const { spurLesen } = await import("../server/lib/schutz.mjs");
    const spur = JSON.stringify(await spurLesen(50));
    expect(spur).toContain("Betriebsrat-Zugängen bei aktiver Pause: 1");
    expect(spur).not.toContain("Vr1");
  });
  it("„alle des Betriebs“: 403, nichts wird gesperrt (auch die übrigen Zugänge nicht)", async () => {
    const e = await sperren({ alleDesBetriebs: true });
    expect(e.status, e.roh).toBe(403);
    for (const c of [CODE.r1, CODE.r3, CODE.a1, CODE.a2]) expect(await gesperrt(c), c).toBe(false);
  });
  it("auch ohne den Schalter CENTRIC_KI_BR_PAUSE und bei unlesbarem Pausenstand", async () => {
    delete process.env.CENTRIC_KI_BR_PAUSE;
    await setzePause(PAUSE);
    expect((await sperren({ code: CODE.r1 })).status).toBe(403);
    await setzePause("kaputt");
    const e = await sperren({ code: CODE.r1 });
    expect(e.status, e.roh).toBe(403);
    expect(await gesperrt(CODE.r1)).toBe(false);
  });
  it("andere Rollen lassen sich weiter sperren (die normale Verwaltung bleibt)", async () => {
    await setzePause(PAUSE);
    const e = await sperren({ code: CODE.a1 });
    expect(e.status, e.roh).toBe(200);
    expect(await gesperrt(CODE.a1)).toBe(true);
  });
  it("ohne Pause (nie gesetzt, oder aufgehoben) gilt das bisherige Verhalten: Betriebsrat-Zugang lässt sich sperren", async () => {
    await setzePause({ ...PAUSE, aktiv: false, nr: 2, vonRolle: "leitung", vonPerson: "l1" });
    const e = await sperren({ code: CODE.r3 });
    expect(e.status, e.roh).toBe(200);
    expect(await gesperrt(CODE.r3)).toBe(true);
  });
});

describe("Pause aktiv: kein neuer Betriebsrat-Zugang über Einladungen", () => {
  it("Einladung ausstellen für eine Betriebsrat-Person: 403; ohne Pause und für andere Rollen geht es", async () => {
    await setzePause(PAUSE);
    const b = await bestandJetzt();
    const e = await E.einladungAusstellen(laden(), { sitzung: SITZ, bestand: b, personId: "r2" });
    expect(e.ok, JSON.stringify(e)).toBe(false);
    expect(e.status).toBe(403);
    expect(await kontenDerPerson("r2")).toHaveLength(0);
    await setzePause("kaputt");
    expect((await E.einladungAusstellen(laden(), { sitzung: SITZ, bestand: await bestandJetzt(), personId: "r2" })).status).toBe(403);
    await setzePause(PAUSE);
    const andere = await E.einladungAusstellen(laden(), { sitzung: SITZ, bestand: await bestandJetzt(), personId: "a5" });
    expect(andere.ok, JSON.stringify(andere)).toBe(true);
    await setzePause({ ...PAUSE, aktiv: false, nr: 2 });
    const frei = await E.einladungAusstellen(laden(), { sitzung: SITZ, bestand: await bestandJetzt(), personId: "r2" });
    expect(frei.ok, JSON.stringify(frei)).toBe(true);
  });
  it("Einladung einlösen: eine vor der Pause ausgestellte Einladung legt bei aktiver Pause keinen Zugang an (403)", async () => {
    await setzePause(null);
    const ein = await E.einladungAusstellen(laden(), { sitzung: SITZ, bestand: await bestandJetzt(), personId: "r4" });
    expect(ein.ok, JSON.stringify(ein)).toBe(true);
    await setzePause(PAUSE);
    const r = await E.einladungEinloesen(laden(), { einladung: ein.einladung, bestandLesen: (raum) => B.bestandLesenStreng(laden(), raum) });
    expect(r.ok, JSON.stringify(r)).toBe(false);
    expect(r.status).toBe(403);
    expect(await kontenDerPerson("r4")).toHaveLength(0);
  });
  it("Einladung einlösen ohne Pause legt den Zugang an (Gegenprobe)", async () => {
    await setzePause(null);
    const ein = await E.einladungAusstellen(laden(), { sitzung: SITZ, bestand: await bestandJetzt(), personId: "r4" });
    expect(ein.ok, JSON.stringify(ein)).toBe(true);
    const r = await E.einladungEinloesen(laden(), { einladung: ein.einladung, bestandLesen: (raum) => B.bestandLesenStreng(laden(), raum) });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    expect(await kontenDerPerson("r4")).toHaveLength(1);
  });
});
