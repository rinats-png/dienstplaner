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

/* Störstelle für die Protokoll-Prüfungen der Sicherheitssperre (Nachtrag Nr. 1): Jeder setJSON-Aufruf der Ablage geht durch
   `globalThis.__ablageBeobachter(name, schluessel, daten)`; wirft der Beobachter, scheitert der Schreibvorgang wie bei einer
   gestörten Ablage. Ohne Beobachter (alle übrigen Tests) unverändert durchgereicht. */
vi.mock("../server/lib/ablage.mjs", async (importOriginal) => {
  const echt = /** @type {any} */ (await importOriginal());
  return { ...echt, getStore: (angabe) => {
    const s = echt.getStore(angabe);
    const name = typeof angabe === "string" ? angabe : angabe && angabe.name;
    return new Proxy(s, { get(t, p) {
      if (p === "setJSON") return async (schluessel, daten, ...rest) => {
        const b = /** @type {any} */ (globalThis).__ablageBeobachter;
        if (b) b(name, schluessel, daten);
        return t.setJSON(schluessel, daten, ...rest);
      };
      const v = t[p];
      return typeof v === "function" ? v.bind(t) : v;
    } });
  } };
});

const WIRT = "127.0.0.1:3000";
const RAUM = "wpi16zugang";
let wurzel, laden, daten, kontoSchreiben, alleKonten, ablageSchluessel, B, E, nr = 0;
const T = {};
const CODE = { l1: "WZ01-AAAA-0001", r1: "WZ02-AAAA-0002", a1: "WZ03-AAAA-0003", a2: "WZ04-AAAA-0004", r3: "WZ05-AAAA-0005",
  b1: "WZ06-AAAA-0006", r5: "WZ07-AAAA-0007", r6: "WZ08-AAAA-0008", a7: "WZ09-AAAA-0009", r8: "WZ10-AAAA-0010" };

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
    const rolle = id.startsWith("l") ? "leitung" : id.startsWith("r") ? "betriebsrat" : id.startsWith("b") ? "betreiber" : "mitarbeiter";
    await kontoSchreiben(laden(), ablageSchluessel(code), { name: id, bestand: RAUM, rolle, person: rolle === "betreiber" ? null : id.slice(0, 2).replace(/[56789]/, "1"), betrieb: 0, mandantId: "m-a",
      angelegt: "2026-01-01T00:00:00.000Z" });
  }
  T.l1 = (await anfrage("/api/anmelden", { rumpf: { zugangscode: CODE.l1 } })).token;
  expect(T.l1).toBeTruthy();
  T.b1 = (await anfrage("/api/anmelden", { rumpf: { zugangscode: CODE.b1 } })).token;
  expect(T.b1).toBeTruthy();
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
    expect(spur).not.toContain("Vr1"); // kollision-ok: Kennung Vr1 ist im Testbestand eindeutig (keine Teilkette anderer Kennungen)
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

/* ---------------------------------------------------------------------------------------------------------------
   Betreiberentscheidungen 2026-11-26 (WP-I16 Teil 2), Nr. 1, 3 und 5
   --------------------------------------------------------------------------------------------------------------- */
const betreiberSperren = (rumpf) => anfrage("/api/zugang-sperren", { token: T.b1, rumpf });
const pauseJetzt = async () => (await bestandJetzt()).mandanten[0].einstellungen?.kiSteuerung?.pause;
const spurText = async () => { const { spurLesen } = await import("../server/lib/schutz.mjs"); return JSON.stringify(await spurLesen(80)); };
const konto = (code, name) => kontoSchreiben(laden(), ablageSchluessel(code), { name, bestand: RAUM, rolle: "betriebsrat", person: "r1", betrieb: 0,
  mandantId: "m-a", angelegt: "2026-01-01T00:00:00.000Z" });

describe("Nr. 1: der Betreiber sperrt kompromittierte Betriebsrat-Zugänge aus Sicherheitsgründen, auch bei aktiver Pause; die Pause bleibt", () => {
  it("einzeln: 200, gesperrt, die Pause bleibt unverändert aktiv; im Protokoll nur Art und Zahl, keine Person", async () => {
    await setzePause(PAUSE);
    const vorher = await pauseJetzt();
    const e = await betreiberSperren({ code: CODE.r5 });
    expect(e.status, e.roh).toBe(200);
    expect(await gesperrt(CODE.r5)).toBe(true);
    expect(await pauseJetzt()).toEqual(vorher);
    expect(vorher).toMatchObject({ aktiv: true, nr: 1 });
    const spur = await spurText();
    expect(spur).toContain("Sicherheitssperre durch Betreiber: 1 Betriebsrat-Zugang");
    expect(spur).not.toContain("Vr5"); // kollision-ok: Kennung Vr5 ist im Testbestand eindeutig
    expect(spur).not.toContain(CODE.r5);
  });
  it("auch bei unlesbarem Pausenstand; die Sperre bleibt ein reines Sperren (der Stand wird nicht verändert)", async () => {
    await konto("WZ13-AAAA-0013", "z");
    await setzePause("kaputt");
    const vorher = JSON.stringify((await bestandJetzt()).mandanten[0].einstellungen);
    const e = await betreiberSperren({ code: "WZ13-AAAA-0013" });
    expect(e.status, e.roh).toBe(200);
    expect(await gesperrt("WZ13-AAAA-0013")).toBe(true);
    expect(JSON.stringify((await bestandJetzt()).mandanten[0].einstellungen)).toBe(vorher);
  });
  it("die Leitung bleibt bei aktiver Pause gesperrt (403, nichts gesperrt), auch für einen anderen Betriebsrat-Zugang", async () => {
    await konto("WZ11-AAAA-0011", "x");
    await setzePause(PAUSE);
    const e = await sperren({ code: "WZ11-AAAA-0011" });
    expect(e.status, e.roh).toBe(403);
    expect(await gesperrt("WZ11-AAAA-0011")).toBe(false);
  });
  it("ohne Pause ist es eine gewöhnliche Sperre: keine Zeile Sicherheitssperre", async () => {
    await konto("WZ12-AAAA-0012", "y");
    await setzePause(null);
    const e = await betreiberSperren({ code: "WZ12-AAAA-0012" });
    expect(e.status, e.roh).toBe(200);
    expect(await gesperrt("WZ12-AAAA-0012")).toBe(true);
    /* genau die zwei Sicherheitssperren der vorigen Tests (einzeln, unlesbarer Stand) — diese Sperre ohne Pause kommt nicht dazu */
    expect((await spurText()).split("Sicherheitssperre durch Betreiber").length - 1).toBe(2);
  });
  it("alle des Betriebs durch den Betreiber: alle (nicht der eigene) werden gesperrt, die Pause bleibt; ohne den Schalter ebenso", async () => {
    delete process.env.CENTRIC_KI_BR_PAUSE;
    await setzePause(PAUSE);
    const vorher = await pauseJetzt();
    const e = await betreiberSperren({ alleDesBetriebs: true });
    expect(e.status, e.roh).toBe(200);
    expect(await gesperrt(CODE.r6)).toBe(true);
    expect(await gesperrt(CODE.a7)).toBe(true);
    expect(await gesperrt(CODE.b1)).toBe(false);          // der eigene Zugang bleibt
    expect(await pauseJetzt()).toEqual(vorher);
    expect(await spurText()).toContain("Sicherheitssperre durch Betreiber");
  });
});

describe("Nr. 3: POST /api/zugaenge (Betreiberweg) hält die Pausenschutzregeln für Betriebsrat-Zugänge ein", () => {
  const ZRAUM = "wpi16neu";
  const zBestand = (kiSteuerung) => ({ version: 9, mandanten: [{
    id: "m-z", name: "Z", status: "aktiv", einstellungen: kiSteuerung === undefined ? {} : { kiSteuerung },
    einheiten: [{ id: "e1" }], dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00" }],
    personen: [person("l9", "leitung"), person("r9", "betriebsrat"), person("a9", "mitarbeiter")],
    abweichungen: {}, einstempeln: {}, erfassung: {}, anfragen: [], notrufe: [], nachrichten: [], abwesenheiten: [] }] });
  const zSetzen = async (ki) => { await B.bestandSchreiben(laden(), ZRAUM, zBestand(ki), { durch: "Pruefung" }); };
  const zugaenge = (eintraege) => anfrage("/api/zugaenge", { token: T.b1, rumpf: { bestand: ZRAUM, eintraege } });
  const zKonten = async () => Object.values(await alleKonten(laden())).filter((k) => k && k.bestand === ZRAUM);
  const BR = { rolle: "betriebsrat", personId: "r9" };

  it("bei aktiver Pause: neuer Betriebsrat-Code 403, kein Konto entsteht; auch ohne den Schalter und bei unlesbarem Pausenstand", async () => {
    delete process.env.CENTRIC_KI_BR_PAUSE;
    for (const stand of [{ betrieb: { an: true }, pause: PAUSE }, { betrieb: { an: true }, pause: "kaputt" }]) {
      await zSetzen(stand);
      const e = await zugaenge([BR]);
      expect(e.status, e.roh).toBe(403);
      expect(await zKonten()).toHaveLength(0);
    }
  });
  it("auch gemischt (Beschäftigte und Betriebsrat): die ganze Anfrage wird abgewiesen, es entsteht nichts; im Protokoll nur die Zahl", async () => {
    await zSetzen({ betrieb: { an: true }, pause: PAUSE });
    const e = await zugaenge([{ rolle: "mitarbeiter", personId: "a9" }, BR]);
    expect(e.status, e.roh).toBe(403);
    expect(await zKonten()).toHaveLength(0);
    expect(await spurText()).toContain("Neue Betriebsrat-Zugänge bei aktiver Pause: 1");
  });
  it("andere Rollen und ein aufgehobener Pausenstand: wie bisher (Gegenprobe)", async () => {
    await zSetzen({ betrieb: { an: true }, pause: PAUSE });
    const a = await zugaenge([{ rolle: "mitarbeiter", personId: "a9" }]);
    expect(a.status, a.roh).toBe(200);
    await zSetzen({ betrieb: { an: true }, pause: { ...PAUSE, aktiv: false, nr: 2, vonRolle: "leitung", vonPerson: "l9" } });
    const b = await zugaenge([BR]);
    expect(b.status, b.roh).toBe(200);
    expect((await zKonten()).some((k) => k.rolle === "betriebsrat")).toBe(true);
  });
});

describe("Nr. 5: kein Betreiberweg hebt die Pause im laufenden Betrieb auf", () => {
  it("der Betreiber kann über PUT /api/bestand weder die Pause entfernen noch Betriebsrat-Personen ändern", async () => {
    await setzePause(PAUSE);
    const g = await B.bestandLesen(laden(), RAUM);
    const neu = JSON.parse(JSON.stringify(g.bestand));
    neu.mandanten[0].einstellungen = {};
    neu.mandanten[0].personen = neu.mandanten[0].personen.filter((p) => p.rolle !== "betriebsrat");
    await anfrage("/api/bestand", { token: T.b1, rumpf: { bestand: neu, etag: g.stand, durch: "Test" } });
    const jetzt = (await bestandJetzt()).mandanten[0];
    expect(jetzt.einstellungen.kiSteuerung.pause).toMatchObject({ aktiv: true, nr: 1 });
    expect(jetzt.personen.filter((p) => p.rolle === "betriebsrat").length).toBeGreaterThan(0);
  });
  it("bestand-anlegen ersetzt keinen belegten Raum (409), die Pause bleibt", async () => {
    await setzePause(PAUSE);
    const e = await anfrage("/api/bestand-anlegen", { token: T.b1, rumpf: { bestand: RAUM, vorlage: "leer", name: "Neu" } });
    expect(e.status).toBe(409);
    expect(await pauseJetzt()).toMatchObject({ aktiv: true, nr: 1 });
  });
});

describe("Nr. 2: die Konten-Sperre wird nur von der Betriebsrat-Pause ausgelöst, nicht von einer Leitungspause (Wege: zugang-sperren, POST /api/zugaenge, Einladungen)", () => {
  const LEIT_PAUSE = { aktiv: true, nr: 1, am: "2026-11-26T08:00:00.000Z", vonRolle: "leitung", vonPerson: "l1" };
  const setzeSteuerung = async (st) => {
    const b = (await B.bestandLesen(laden(), RAUM)).bestand;
    b.mandanten[0].einstellungen = { kiSteuerung: { betrieb: STEUERUNG().betrieb, ...st } };
    await B.bestandSchreiben(laden(), RAUM, b, { durch: "Pruefung" });
  };
  let tl;
  it("nur Leitungspause: die Leitung sperrt einen Betriebsrat-Zugang (200); mit Betriebsrat-Pause (auch zusätzlich) 403", async () => {
    await kontoSchreiben(laden(), ablageSchluessel("WZ14-AAAA-0014"), { name: "l", bestand: RAUM, rolle: "leitung", person: "l1", betrieb: 0, mandantId: "m-a",
      angelegt: "2026-01-01T00:00:00.000Z" });
    tl = (await anfrage("/api/anmelden", { rumpf: { zugangscode: "WZ14-AAAA-0014" } })).token;
    expect(tl).toBeTruthy();
    await konto("WZ15-AAAA-0015", "p");
    await konto("WZ16-AAAA-0016", "q");
    await setzeSteuerung({ leitungPause: LEIT_PAUSE });
    const e = await anfrage("/api/zugang-sperren", { token: tl, rumpf: { code: "WZ15-AAAA-0015" } });
    expect(e.status, e.roh).toBe(200);
    expect(await gesperrt("WZ15-AAAA-0015")).toBe(true);
    await setzeSteuerung({ leitungPause: LEIT_PAUSE, pause: PAUSE });
    const e2 = await anfrage("/api/zugang-sperren", { token: tl, rumpf: { code: "WZ16-AAAA-0016" } });
    expect(e2.status, e2.roh).toBe(403);
    expect(await gesperrt("WZ16-AAAA-0016")).toBe(false);
    /* die Leitungspause wird aufgehoben, die Betriebsrat-Pause besteht: weiter 403 */
    await setzeSteuerung({ leitungPause: { ...LEIT_PAUSE, aktiv: false, nr: 2 }, pause: PAUSE });
    expect((await anfrage("/api/zugang-sperren", { token: tl, rumpf: { code: "WZ16-AAAA-0016" } })).status).toBe(403);
  });
  it("nur Leitungspause: Einladung für eine Betriebsrat-Person und neuer Betriebsrat-Code über POST /api/zugaenge gehen; mit Betriebsrat-Pause nicht", async () => {
    await setzeSteuerung({ leitungPause: LEIT_PAUSE });
    const ein = await E.einladungAusstellen(laden(), { sitzung: SITZ, bestand: await bestandJetzt(), personId: "r2" });
    expect(ein.ok, JSON.stringify(ein)).toBe(true);
    await setzeSteuerung({ leitungPause: LEIT_PAUSE, pause: PAUSE });
    const ein2 = await E.einladungAusstellen(laden(), { sitzung: SITZ, bestand: await bestandJetzt(), personId: "r4" });
    expect(ein2.status).toBe(403);
    /* POST /api/zugaenge (Betreiber) mit reiner Leitungspause */
    const ZR = "wpi16neu3";
    const zb = (st) => ({ version: 9, mandanten: [{ id: "m-y", name: "Y", status: "aktiv", einstellungen: { kiSteuerung: st },
      einheiten: [{ id: "e1" }], dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00" }],
      personen: [person("l9", "leitung"), person("r9", "betriebsrat")],
      abweichungen: {}, einstempeln: {}, erfassung: {}, anfragen: [], notrufe: [], nachrichten: [], abwesenheiten: [] }] });
    await B.bestandSchreiben(laden(), ZR, zb({ betrieb: { an: true }, leitungPause: LEIT_PAUSE }), { durch: "Pruefung" });
    const ok = await anfrage("/api/zugaenge", { token: T.b1, rumpf: { bestand: ZR, eintraege: [{ rolle: "betriebsrat", personId: "r9" }] } });
    expect(ok.status, ok.roh).toBe(200);
    await B.bestandSchreiben(laden(), ZR, zb({ betrieb: { an: true }, leitungPause: LEIT_PAUSE, pause: PAUSE }), { durch: "Pruefung" });
    const nein = await anfrage("/api/zugaenge", { token: T.b1, rumpf: { bestand: ZR, eintraege: [{ rolle: "betriebsrat", personId: "r9" }] } });
    expect(nein.status, nein.roh).toBe(403);
  });
});

describe("„ja“ der Leitung ist eine Leitung-Pause (Betreiberentscheidung 2026-11-26, spät): keine Konten-Sperre; Altbestand in `pause` sperrt weiter", () => {
  const setzeSteuerung = async (st) => {
    const b = (await B.bestandLesen(laden(), RAUM)).bestand;
    b.mandanten[0].einstellungen = { kiSteuerung: { betrieb: STEUERUNG().betrieb, ...st } };
    await B.bestandSchreiben(laden(), RAUM, b, { durch: "Pruefung" });
  };
  it("Stand aus dem echten Schreibweg (Antwort „ja“): Leitung sperrt einen Betriebsrat-Zugang (200), Einladung geht; die alte „ja“-Pause in `pause` sperrt (403)", async () => {
    const { kiSteuerungZusammen } = await import("../server/lib/ki-steuerung.mjs");
    const alt = { einstellungen: { kiSteuerung: { betrieb: STEUERUNG().betrieb, betriebsratFrage: { antwort: "nein", am: "2026-11-25T07:00:00.000Z", vonRolle: "leitung" } } } };
    const neu = { einstellungen: { kiSteuerung: { betriebsratFrage: { antwort: "ja" } } } };
    const r = kiSteuerungZusammen(alt, neu, { rolle: "leitung", person: "l1" }, { jetzt: "2026-11-26T09:00:00.000Z" });
    const st = r.mandant.einstellungen.kiSteuerung;
    expect(st.leitungPause).toMatchObject({ aktiv: true, vonRolle: "leitung" });
    expect(st.pause).toBeUndefined();
    const { betrieb: _b, ...rest } = st;
    await setzeSteuerung(rest);
    await kontoSchreiben(laden(), ablageSchluessel("WZ19-AAAA-0019"), { name: "lj", bestand: RAUM, rolle: "leitung", person: "l1", betrieb: 0, mandantId: "m-a",
      angelegt: "2026-01-01T00:00:00.000Z" });
    const tj = (await anfrage("/api/anmelden", { rumpf: { zugangscode: "WZ19-AAAA-0019" } })).token;
    expect(tj).toBeTruthy();
    const leitungSperrt = (code) => anfrage("/api/zugang-sperren", { token: tj, rumpf: { code } });
    await konto("WZ17-AAAA-0017", "j1");
    const e = await leitungSperrt("WZ17-AAAA-0017");
    expect(e.status, e.roh).toBe(200);
    expect(await gesperrt("WZ17-AAAA-0017")).toBe(true);
    const ein = await E.einladungAusstellen(laden(), { sitzung: SITZ, bestand: await bestandJetzt(), personId: "r4" });
    expect(ein.ok, JSON.stringify(ein)).toBe(true);
    /* Altbestand: die früher durch „ja“ gesetzte Pause liegt in `pause` (Stempel der Leitung) — Schutzwirkung unverändert */
    await setzeSteuerung({ betriebsratFrage: { antwort: "ja", am: "2026-11-20T08:00:00.000Z", vonRolle: "leitung" },
      pause: { aktiv: true, nr: 1, am: "2026-11-20T08:00:00.000Z", vonRolle: "leitung", vonPerson: "l1" } });
    await konto("WZ18-AAAA-0018", "j2");
    const e2 = await leitungSperrt("WZ18-AAAA-0018");
    expect(e2.status, e2.roh).toBe(403);
    expect(await gesperrt("WZ18-AAAA-0018")).toBe(false);
  });
});

/* ---------------------------------------------------------------------------------------------------------------
   Nachtrag Nr. 1 (Betreiberentscheidung 2026-11-26): Sicherheitssperre — „begonnen“ VOR dem Sperren, das tatsächliche
   Ergebnis DANACH; ein fehlgeschlagener Vorgang steht nie als Erfolg im Protokoll (Invarianten S1–S8, WP-I16-nachweis.md)
   --------------------------------------------------------------------------------------------------------------- */
describe("Nachtrag Nr. 1: Protokoll der Sicherheitssperre — begonnen vorher, Ergebnis danach, nie Erfolg ohne Sperre", () => {
  const VORGANG = /Vorgang ([0-9a-f]{8})/;
  const zeilen = async () => { const { spurLesen } = await import("../server/lib/schutz.mjs"); return spurLesen(80); };
  /** Alle Zeilen eines Vorgangs (nur Art `zugaenge`), älteste zuerst. */
  const vorgangZeilen = async (v) => (await zeilen()).filter((z) => z.art === "zugaenge" && typeof z.zusatz === "string"
    && (z.zusatz.match(VORGANG) || [])[1] === v).sort((a, b) => a.zeit.localeCompare(b.zeit));
  const begonnenSeit = async (vorher) => (await zeilen()).filter((z) => z.ausgang === "begonnen" && !vorher.has(z.zeit + z.zusatz));
  const schnappschuss = async () => new Set((await zeilen()).filter((z) => z.ausgang === "begonnen").map((z) => z.zeit + z.zusatz));
  const ohne = () => { delete (/** @type {any} */ (globalThis)).__ablageBeobachter; };
  const beobachte = (f) => { /** @type {any} */ (globalThis).__ablageBeobachter = f; };
  const brKonto = (code, extra = {}) => kontoSchreiben(laden(), ablageSchluessel(code), { name: "s", bestand: RAUM, rolle: "betriebsrat",
    person: "r1", betrieb: 0, mandantId: "m-a", angelegt: "2026-01-01T00:00:00.000Z", ...extra });

  it("Erfolg: begonnen → Sperre in der Ablage → erfolg, in dieser Reihenfolge; Ergebnis nennt „1 von 1“; keine Person, kein Code", async () => {
    await brKonto("WZ21-AAAA-0021");
    await setzePause(PAUSE);
    const vorher = await schnappschuss();
    const folge = [];
    beobachte((name, schl, d) => {
      if (name === "centric-spur" && d && d.art === "zugaenge") folge.push(`spur:${d.ausgang}`);
      if (schl === `konto:${ablageSchluessel("WZ21-AAAA-0021")}` && d && d.gesperrt) folge.push("sperre");
    });
    try {
      const e = await betreiberSperren({ code: "WZ21-AAAA-0021" });
      expect(e.status, e.roh).toBe(200);
      expect(e.ok).toBe(true);
    } finally { ohne(); }
    expect(await gesperrt("WZ21-AAAA-0021")).toBe(true);
    const b = await begonnenSeit(vorher);
    expect(b).toHaveLength(1);
    const v = b[0].zusatz.match(VORGANG)[1];
    const zz = await vorgangZeilen(v);
    expect(zz.map((z) => z.ausgang)).toEqual(["begonnen", "erfolg"]);
    expect(zz[1].zusatz).toContain("1 von 1 Betriebsrat-Zugang gesperrt");
    /* Reihenfolge an der Ablage selbst: die Zeile „begonnen“ vor dem Sperren, „erfolg“ erst danach */
    expect(folge.indexOf("spur:begonnen")).toBeGreaterThanOrEqual(0);
    expect(folge.indexOf("spur:begonnen")).toBeLessThan(folge.indexOf("sperre"));
    expect(folge.indexOf("sperre")).toBeLessThan(folge.indexOf("spur:erfolg"));
    const text = JSON.stringify(zz);
    expect(text).not.toContain("WZ21-AAAA-0021");
    expect(text).not.toContain(ablageSchluessel("WZ21-AAAA-0021").slice(-8));
  });

  it("Ablagefehler beim Sperren: 503, nicht gesperrt; Protokoll begonnen + fehler „0 von 1 … abgebrochen“, nie erfolg", async () => {
    await brKonto("WZ22-AAAA-0022");
    await setzePause(PAUSE);
    const vorher = await schnappschuss();
    const ziel = `konto:${ablageSchluessel("WZ22-AAAA-0022")}`;
    beobachte((name, schl) => { if (schl === ziel) throw new Error("Ablage gestört (Prüfung)"); });
    let e;
    try { e = await betreiberSperren({ code: "WZ22-AAAA-0022" }); } finally { ohne(); }
    expect(e.status, e.roh).toBe(503);
    expect(e.ok).toBeUndefined();
    expect(e).toMatchObject({ betriebsratGesperrt: 0, betriebsratAngefragt: 1 });
    expect(await gesperrt("WZ22-AAAA-0022")).toBe(false);
    const b = await begonnenSeit(vorher);
    expect(b).toHaveLength(1);
    const zz = await vorgangZeilen(b[0].zusatz.match(VORGANG)[1]);
    expect(zz.map((z) => z.ausgang)).toEqual(["begonnen", "fehler"]);
    expect(zz[1].zusatz).toContain("0 von 1 Betriebsrat-Zugang gesperrt");
    expect(zz[1].zusatz).toContain("abgebrochen");
    /* Wiederholung (idempotent): jetzt wirksam, eigener Vorgang mit erfolg */
    const vorher2 = await schnappschuss();
    const w = await betreiberSperren({ code: "WZ22-AAAA-0022" });
    expect(w.status, w.roh).toBe(200);
    expect(await gesperrt("WZ22-AAAA-0022")).toBe(true);
    const b2 = await begonnenSeit(vorher2);
    expect(b2).toHaveLength(1);
    expect((await vorgangZeilen(b2[0].zusatz.match(VORGANG)[1])).map((z) => z.ausgang)).toEqual(["begonnen", "erfolg"]);
  });

  it("Teilergebnis (Kette ersetztDurch, zweites Glied scheitert): 503; Ergebnis fehler „1 von 2“, das erste bleibt gesperrt", async () => {
    await brKonto("WZ24-AAAA-0024");
    await brKonto("WZ23-AAAA-0023", { ersetztDurch: ablageSchluessel("WZ24-AAAA-0024") });
    await setzePause(PAUSE);
    const vorher = await schnappschuss();
    const zweites = `konto:${ablageSchluessel("WZ24-AAAA-0024")}`;
    beobachte((name, schl) => { if (schl === zweites) throw new Error("Ablage gestört (Prüfung)"); });
    let e;
    try { e = await betreiberSperren({ code: "WZ23-AAAA-0023" }); } finally { ohne(); }
    expect(e.status, e.roh).toBe(503);
    expect(e).toMatchObject({ betriebsratGesperrt: 1, betriebsratAngefragt: 2 });
    expect(await gesperrt("WZ23-AAAA-0023")).toBe(true);
    expect(await gesperrt("WZ24-AAAA-0024")).toBe(false);
    const b = await begonnenSeit(vorher);
    expect(b).toHaveLength(1);
    expect(b[0].zusatz).toContain("Sicherheitssperre durch Betreiber: 2 Betriebsrat-Zugang");
    const zz = await vorgangZeilen(b[0].zusatz.match(VORGANG)[1]);
    expect(zz.map((z) => z.ausgang)).toEqual(["begonnen", "fehler"]);
    expect(zz[1].zusatz).toContain("1 von 2 Betriebsrat-Zugang gesperrt");
  });

  it("Ergebnis-Protokoll nicht schreibbar: Sperre bleibt wirksam (Sitzung beendet), Antwort 503 statt ok; „begonnen“ bleibt offen, nie erfolg", async () => {
    await brKonto("WZ25-AAAA-0025");
    const t = (await anfrage("/api/anmelden", { rumpf: { zugangscode: "WZ25-AAAA-0025" } })).token;
    expect(t).toBeTruthy();
    await setzePause(PAUSE);
    const vorher = await schnappschuss();
    beobachte((name, schl, d) => {
      if (name === "centric-spur" && d && typeof d.zusatz === "string" && d.zusatz.startsWith("Sicherheitssperre Ergebnis"))
        throw new Error("Protokoll gestört (Prüfung)");
    });
    let e;
    try { e = await betreiberSperren({ code: "WZ25-AAAA-0025" }); } finally { ohne(); }
    expect(e.status, e.roh).toBe(503);
    expect(e).toMatchObject({ widerrufWirksam: true, protokollVollstaendig: false });
    expect(e.vorgang).toMatch(/^[0-9a-f]{8}$/);
    expect(await gesperrt("WZ25-AAAA-0025")).toBe(true);
    expect(e.sitzungenBeendet).toBeGreaterThanOrEqual(1);
    const b = await begonnenSeit(vorher);
    expect(b).toHaveLength(1);
    expect(b[0].zusatz).toContain(e.vorgang);
    const zz = await vorgangZeilen(e.vorgang);
    expect(zz.map((z) => z.ausgang)).toEqual(["begonnen"]);
  });

  it("„begonnen“ nicht schreibbar: die Sicherheitssperre unterbleibt nicht; Ergebnis erfolg steht, Antwort 503 (Protokoll unvollständig)", async () => {
    await brKonto("WZ26-AAAA-0026");
    await setzePause(PAUSE);
    beobachte((name, schl, d) => { if (name === "centric-spur" && d && d.ausgang === "begonnen") throw new Error("Protokoll gestört (Prüfung)"); });
    let e;
    try { e = await betreiberSperren({ code: "WZ26-AAAA-0026" }); } finally { ohne(); }
    expect(e.status, e.roh).toBe(503);
    expect(e).toMatchObject({ widerrufWirksam: true, protokollVollstaendig: false });
    expect(await gesperrt("WZ26-AAAA-0026")).toBe(true);
    const zz = await vorgangZeilen(e.vorgang);
    expect(zz.map((z) => z.ausgang)).toEqual(["erfolg"]);
    expect(zz[0].zusatz).toContain("1 von 1 Betriebsrat-Zugang gesperrt");
  });

  it("Leitung bei aktiver Pause und schon gesperrte Zugänge: kein Vorgang (keine Zeile „begonnen“)", async () => {
    await setzePause(PAUSE);
    await brKonto("WZ27-AAAA-0027");
    await kontoSchreiben(laden(), ablageSchluessel("WZ28-AAAA-0028"), { name: "l", bestand: RAUM, rolle: "leitung", person: "l1", betrieb: 0, mandantId: "m-a",
      angelegt: "2026-01-01T00:00:00.000Z" });
    const tl = (await anfrage("/api/anmelden", { rumpf: { zugangscode: "WZ28-AAAA-0028" } })).token;
    expect(tl).toBeTruthy();
    const vorher = await schnappschuss();
    const l = await anfrage("/api/zugang-sperren", { token: tl, rumpf: { code: "WZ27-AAAA-0027" } });
    expect(l.status, l.roh).toBe(403);
    /* schon gesperrt (WZ21 aus dem ersten Test): Betreiber wiederholt — nichts anzufragen, kein Vorgang */
    const w = await betreiberSperren({ code: "WZ21-AAAA-0021" });
    expect(w.status, w.roh).toBe(200);
    expect(await begonnenSeit(vorher)).toHaveLength(0);
  });
});
