/* ==========================================================================
   BREMSENKONZEPT FÜR DEN ECHTBETRIEB (WP-47)

   Befunde aus dem Lasttest (WP-28, docs/acc45/wp28-nachweis.md):
     1  Die Schreibbremse (120/min je Raum) teilte sich der Schichtwechsel
        mit der Planung: Ab dem 121. Stempel gab es 429.
     3  Die Grenzen „ziel“ (40 je Betrieb) und „gesamt“ (400 dienstweit) beim
        Anmelden zählten auch GELUNGENE Anmeldungen: Von 277 ehrlichen
        Anmeldungen in einen Betrieb kamen 40 durch.

   Jetzt:
     - Stempeln hat eigene Bremsarten: je Person (10/min) und als Raumdeckel
       nach Betriebsgröße; „schreiben“ bleibt für Planänderungen.
     - Gelungene Anmeldungen nehmen ihre Versuchsvermerke bei Ziel und Gesamt
       zurück; FEHLVERSUCHE bleiben gezählt (Brute-Force-Schutz unverändert).
       Eine großzügige Lastgrenze je Betrieb für gelungene Anmeldungen kommt dazu.
     - Jede Abweisung durch eine Lastgrenze trägt Retry-After und wird für
       /gesund gezählt („429-last“).

   Die Tests mit Grenzwerten verkleinern sie vorübergehend (die Zahlen stehen
   in Objekten, die der Test ändert und danach zurücksetzt); die Mechanik ist
   dieselbe. Mutanten, die diese Tests rot machen müssen, stehen im Nachweis
   (docs/acc45/wp47-nachweis.md).

   Aufruf: npx vitest run pruefungen/bremse-wp47.test.js
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

vi.setConfig({ testTimeout: 60000 });

/* Lesezugriffe auf den Bestand mitzählen (Auflage M3): bestandLesen bleibt
   unverändert und wird nur gezählt — so lässt sich zeigen, dass die
   Lastgrenze der Anmeldung VOR dem teuren Lesen greift. */
vi.mock("../server/lib/bestand.mjs", async (original) => {
  const m = await original();
  return { ...m, bestandLesen: vi.fn(m.bestandLesen) };
});

/* Zugriffe auf die Ablage mitzählen (Flake-Bremse): Der Test „schreibt nichts in
   die Ablage“ zählte früher Dateien in centric-takt; dort schreiben aber auch
   andere, noch laufende Vorgänge dieser Datei (bremse() ist asynchron). Der
   Zugriff selbst ist stattdessen die Messgröße: getStore bleibt unverändert und
   wird nur gezählt. Ein synchroner Block ohne await kann nicht von fremden
   Schreibern unterbrochen werden. */
vi.mock("../server/lib/ablage.mjs", async (original) => {
  const m = await original();
  return { ...m, getStore: vi.fn(m.getStore) };
});

let wurzel, S, Z, daten, B, store, sitzungAnlegen, kontoSchreiben, ablageSchluessel;
const WIRT = "127.0.0.1:3000";
const HEUTE = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());
/** Der Tag zur (gegebenenfalls festgehaltenen) Uhr. */
const heuteJetzt = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-wp47-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
  delete process.env.REDIS_REST_URL;
  S = await import("../server/lib/schutz.mjs");
  Z = await import("../server/lib/gesund-zaehler.mjs");
  const { getStore } = await import("../server/lib/ablage.mjs");
  store = getStore({ name: "centric", consistency: "strong" });
  daten = (await import("../server/funktionen/daten.mjs")).default;
  B = await import("../server/lib/bestand.mjs");
  ({ sitzungAnlegen } = await import("../server/lib/sitzungen.mjs"));
  ({ kontoSchreiben } = await import("../server/lib/konten.mjs"));
  ({ ablageSchluessel } = await import("../server/lib/codes.mjs"));
});
afterEach(() => { vi.useRealTimers(); });
afterAll(async () => { if (wurzel) await rm(wurzel, { recursive: true, force: true }); });

/** Ein fester Zeitpunkt kurz nach einer Fenstergrenze (5 min und 1 min), nur Date wird ersetzt. */
function imFrischenFenster(versatzFenster = 0) {
  const basis = Math.ceil((Date.now() + 3600_000) / 300_000) * 300_000 + versatzFenster * 600_000 + 1000;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(basis);
}

/** Grenzen vorübergehend ändern. */
function aendern(objekt, werte) {
  const alt = {};
  for (const k of Object.keys(werte)) { alt[k] = objekt[k]; objekt[k] = werte[k]; }
  return () => { for (const k of Object.keys(alt)) objekt[k] = alt[k]; };
}

/* ------------------------------------------------------------------------ */
describe("WP-47 · Anmelden: gelungene Anmeldungen zählen nicht gegen Ziel und Gesamt", () => {
  let zurueck;
  beforeAll(() => {
    const z1 = aendern(S.WEITERE.anmelden.ziel, { versuche: 5 });
    const z2 = aendern(S.WEITERE.anmelden.gesamt, { versuche: 12 });
    zurueck = () => { z1(); z2(); };
  });
  afterAll(() => zurueck && zurueck());

  it("30 gelungene Anmeldungen in einen Betrieb (Grenze 5) — alle frei", async () => {
    imFrischenFenster(1);
    for (let i = 0; i < 30; i++) {
      const k = `a:erfolg-${i}`;
      const b = await S.bremse("anmelden", k, "raum-erfolg");
      expect(b.frei, `Anmeldung ${i + 1}: ${JSON.stringify(b)}`).toBe(true);
      await S.entlasten("anmelden", k, b);
    }
  });

  it("danach zählen Fehlversuche weiter: der sechste in denselben Betrieb wird gebremst (Ziel)", async () => {
    imFrischenFenster(1);
    for (let i = 0; i < 5; i++)
      expect((await S.bremse("anmelden", `a:fehl-${i}`, "raum-erfolg")).frei, `Fehlversuch ${i + 1}`).toBe(true);
    const sechs = await S.bremse("anmelden", "a:fehl-5", "raum-erfolg");
    expect(sechs.frei).toBe(false);
    expect(sechs.dimension).toBe("ziel");
    expect(sechs.wartet).toBeGreaterThan(0);
  });

  it("ein Erfolg dazwischen nimmt FEHLVERSUCHE nicht zurück (nur den eigenen Versuch)", async () => {
    imFrischenFenster(2);
    for (let i = 0; i < 3; i++) expect((await S.bremse("anmelden", `a:mix-f${i}`, "raum-mix")).frei).toBe(true);
    const k = "a:mix-erfolg";
    const b = await S.bremse("anmelden", k, "raum-mix");
    expect(b.frei).toBe(true);
    await S.entlasten("anmelden", k, b);
    for (let i = 3; i < 5; i++) expect((await S.bremse("anmelden", `a:mix-f${i}`, "raum-mix")).frei, `Fehlversuch ${i + 1}`).toBe(true);
    const sechs = await S.bremse("anmelden", "a:mix-f5", "raum-mix");
    expect(sechs.frei, "fünf Fehlversuche stehen, der Erfolg hat sie nicht gelöscht").toBe(false);
    expect(sechs.dimension).toBe("ziel");
  });

  it("Gesamtgrenze: 40 gelungene Anmeldungen in 40 Betriebe frei; dann sind es 12 Fehlversuche, der 13. wird gebremst", async () => {
    imFrischenFenster(3);
    for (let i = 0; i < 40; i++) {
      const k = `a:ges-ok-${i}`;
      const b = await S.bremse("anmelden", k, `raum-ges-${i}`);
      expect(b.frei, `Anmeldung ${i + 1}`).toBe(true);
      await S.entlasten("anmelden", k, b);
    }
    for (let i = 0; i < 12; i++)
      expect((await S.bremse("anmelden", `a:ges-f-${i}`, `raum-gesf-${i}`)).frei, `Fehlversuch ${i + 1}`).toBe(true);
    const dreizehn = await S.bremse("anmelden", "a:ges-f-12", "raum-gesf-12");
    expect(dreizehn.frei).toBe(false);
    expect(dreizehn.dimension).toBe("gesamt");
  });

  it("die Grenze je Herkunft ist unverändert streng: acht Fehlversuche, der neunte gebremst", async () => {
    imFrischenFenster(4);
    const k = "a:herkunft-streng";
    for (let i = 1; i <= S.GRENZEN.anmelden.versuche; i++) expect((await S.bremse("anmelden", k)).frei, `Versuch ${i}`).toBe(true);
    expect((await S.bremse("anmelden", k)).frei).toBe(false);
    expect(S.GRENZEN.anmelden.versuche).toBe(8);
  });

  it("entlasten ohne Vermerke (Altaufrufer) wirkt wie bisher auf die Herkunft", async () => {
    imFrischenFenster(5);
    /* Ohne Vermerke (kein b) bleiben Ziel und Gesamt wie bisher unberührt — hier nur die Herkunft prüfen. */
    const gesamtHoch = aendern(S.WEITERE.anmelden.gesamt, { versuche: 1000 });
    const k = "a:alt";
    for (let i = 0; i < 7; i++) await S.bremse("anmelden", k);
    await S.entlasten("anmelden", k);
    for (let i = 0; i < 8; i++) expect((await S.bremse("anmelden", k)).frei).toBe(true);
    gesamtHoch();
  });
});

/* ------------------------------------------------------------------------ */
describe("WP-47 · Stempeln: eigene Bremsarten", () => {
  it("je Person 10 je Minute, der elfte wird gebremst; eine andere Person im selben Betrieb bleibt frei", async () => {
    imFrischenFenster(6);
    const p1 = S.kennungPerson({ bestand: "raum-s", mandantId: "m1", person: "p1", rolle: "mitarbeiter" });
    const p2 = S.kennungPerson({ bestand: "raum-s", mandantId: "m1", person: "p2", rolle: "mitarbeiter" });
    for (let i = 1; i <= 10; i++) expect(S.lastbremse("stempeln", p1).frei, `Stempel ${i}`).toBe(true);
    const elf = S.lastbremse("stempeln", p1);
    expect(elf.frei).toBe(false);
    expect(elf.wartet).toBeGreaterThan(0);
    expect(S.lastbremse("stempeln", p2).frei).toBe(true);
  });

  it("die Kennung je Person trägt keinen Klartext und unterscheidet Person und Raum", () => {
    const a = S.kennungPerson({ bestand: "raum-geheim", mandantId: "m1", person: "p7", rolle: "mitarbeiter" });
    const b = S.kennungPerson({ bestand: "raum-geheim", mandantId: "m1", person: "p8", rolle: "mitarbeiter" });
    const c = S.kennungPerson({ bestand: "anderer-raum", mandantId: "m1", person: "p7", rolle: "mitarbeiter" });
    expect(new Set([a, b, c]).size).toBe(3);
    expect(a).not.toMatch(/raum-geheim|p7/);
    expect(S.kennungPerson({ bestand: "raum-geheim", mandantId: "m1", person: "p7", rolle: "mitarbeiter" })).toBe(a);
  });

  it("der Raumdeckel nimmt die vorgegebene Zahl: n frei, danach gebremst; nach Ablauf der Sperre wieder frei", async () => {
    imFrischenFenster(7);
    for (let i = 1; i <= 5; i++) expect(S.lastbremse("stempeln-raum", "b:deckel", 5).frei, `Stempel ${i}`).toBe(true);
    const sechs = S.lastbremse("stempeln-raum", "b:deckel", 5);
    expect(sechs.frei).toBe(false);
    expect(sechs.wartet).toBeGreaterThan(0);
    expect(S.lastbremse("stempeln-raum", "b:deckel", 5).frei, "noch gesperrt").toBe(false);
    vi.setSystemTime(Date.now() + (S.GRENZEN["stempeln-raum"].sperre + 1) * 1000);
    expect(S.lastbremse("stempeln-raum", "b:deckel", 5).frei, "nach der Sperre frei").toBe(true);
  });

  it("die Lastbremse schreibt nichts in die Ablage (kein Vermerk je Stempel)", async () => {
    const A = await import("../server/lib/ablage.mjs");
    /* Kein await zwischen Nullstellen und Auswerten: kein fremder Schreiber kann dazwischenfunken. */
    A.getStore.mockClear();
    for (let i = 0; i < 20; i++) S.lastbremse("stempeln", `p:ohne-platte-${i}`);
    for (let i = 0; i < 20; i++) S.lastbremse("stempeln-raum", `b:ohne-platte-${i}`, 5);
    expect(A.getStore.mock.calls, "lastbremse darf die Ablage gar nicht ansprechen").toEqual([]);
  });

  it("der Raumdeckel richtet sich nach der Betriebsgröße — Hälfte der kleinsten gemessenen Obergrenze", () => {
    expect(S.stempelDeckel(250)).toBe(900);
    expect(S.stempelDeckel(1000)).toBe(900);
    expect(S.stempelDeckel(1001)).toBe(240);
    expect(S.stempelDeckel(2000)).toBe(240);
    expect(S.stempelDeckel(2001)).toBe(200);
    expect(S.stempelDeckel(4000)).toBe(200);
    expect(S.stempelDeckel(undefined)).toBe(240);   // Größe noch unbekannt: vorsichtig
    expect(S.stempelDeckel(0)).toBe(240);
    /* Schichtwechsel eines 2000-Personen-Betriebs (ein Drittel in 5 min ≈ 133/min) passt darunter. */
    expect(Math.ceil(2000 / 3 / 5)).toBeLessThan(S.stempelDeckel(2000));
  });

  it("Stempeln und Planen teilen kein Kontingent mehr: die Schreibbremse ist unberührt", () => {
    expect(S.GRENZEN.schreiben).toMatchObject({ versuche: 120, fenster: 60 });
    expect(S.GRENZEN.stempeln).toMatchObject({ versuche: 10, fenster: 60 });
    expect(S.GRENZEN["stempeln-raum"]).toBeTruthy();
    expect(S.GRENZEN["anmelden-erfolg"].versuche).toBeGreaterThanOrEqual(1000);
  });
});

/* ------------------------------------------------------------------------ */
const person = (id, rolle = "mitarbeiter") => ({ id, vorname: "V", nachname: id, rolle, bereich: "e1", status: "aktiv",
  zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }] });
const betrieb = (personen) => ({ version: 9, mandanten: [{ id: "m1", name: "Haus", status: "aktiv",
  einheiten: [{ id: "e1", name: "WB 1" }], dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00" }],
  personen, abweichungen: {}, abwesenheiten: [], erfassung: {}, einstempeln: {}, anfragen: [], nachrichten: [] }] });

let nr = 0;
async function anfrage(pfad, { methode = "POST", rumpf, token, xff } = {}) {
  nr += 1;
  const kopf = { host: WIRT, origin: `http://${WIRT}`,
    "x-forwarded-for": xff || `10.47.${Math.floor(nr / 250) % 250}.${nr % 250}` };
  if (methode !== "GET") kopf["content-type"] = "application/json";
  if (token) kopf.authorization = `Bearer ${token}`;
  const a = await daten(new Request(`http://${WIRT}${pfad}`, { method: methode, headers: kopf,
    ...(methode === "GET" ? {} : { body: JSON.stringify(rumpf || {}) }) }), {});
  let d = {}; try { d = await a.json(); } catch { /* leer */ }
  return { status: a.status, retryAfter: a.headers.get("retry-after"), ...d };
}

/** Sitzungen in kleinen Gruppen anlegen (jede ist eine Datei mit fsync). */
async function sitzungen(raum, ids, rolle = "mitarbeiter") {
  const aus = new Array(ids.length);
  for (let i = 0; i < ids.length; i += 10) {
    await Promise.all(ids.slice(i, i + 10).map(async (id, k) => {
      aus[i + k] = (await sitzungAnlegen({ bestand: raum, name: id, rolle, person: id, betrieb: 0, mandantId: "m1",
        einheit: null }, 2 * 3600 * 1000)).token;
    }));
  }
  return aus;
}

describe("WP-47 · Stempeln über HTTP", () => {
  it("Schichtwechsel: 130 Personen eines Betriebs stempeln hintereinander — alle 200 (vorher ab dem 121. 429), und die Planung wird nicht gebremst", async () => {
    /* Auflage N4: Die Uhr steht still (nur Date, wie in den Einzeltests
       oben). Vorher lief der Test in Echtzeit; fiel er über eine
       Minutengrenze, sank der gleitende Zähler der alten Schreibbremse, und
       der Test war gegen den Stand vor WP-47 nicht sicher rot. Jetzt liegen
       alle 130 Stempel im selben Fenster. */
    imFrischenFenster(8);
    const start = Date.now();
    const DATUM = heuteJetzt();
    const raum = "w47-schicht";
    const ids = Array.from({ length: 130 }, (_, i) => `p${i + 1}`);
    await B.bestandSchreiben(store, raum, betrieb([...ids.map((i) => person(i)), person("pl1", "planer")]), { durch: "Pruefung" });
    const tokens = await sitzungen(raum, ids);
    const [planer] = await sitzungen(raum, ["pl1"], "planer");
    const stati = [];
    for (let i = 0; i < tokens.length; i += 10) {
      const gruppe = await Promise.all(tokens.slice(i, i + 10).map((t) =>
        anfrage("/api/stempeln", { token: t, rumpf: { datum: DATUM, art: "start" } })));
      stati.push(...gruppe.map((g) => g.status));
    }
    expect(Date.now(), "die Uhr stand während des ganzen Laufs still").toBe(start);
    expect(stati.filter((s) => s === 200), JSON.stringify(stati.filter((s) => s !== 200))).toHaveLength(130);
    /* Die Schreibbremse der Planung ist unberührt: ein PUT geht durch. */
    const g = await anfrage("/api/bestand", { methode: "GET", token: planer });
    expect(g.status).toBe(200);
    const p = await anfrage("/api/bestand", { methode: "PUT", token: planer, rumpf: { bestand: g.bestand, etag: g.etag } });
    expect(p.status, JSON.stringify(p).slice(0, 200)).toBe(200);
  }, 400000);

  it("je Person: wer immer wieder stempelt, bekommt ab dem elften Versuch 429 mit Retry-After; die Kolleginnen nicht; gezählt für /gesund", async () => {
    const raum = "w47-person";
    await B.bestandSchreiben(store, raum, betrieb([person("p1"), person("p2")]), { durch: "Pruefung" });
    const [t1, t2] = await sitzungen(raum, ["p1", "p2"]);
    Z.zaehlungLeeren();
    const stati = [];
    for (let i = 0; i < 12; i++) stati.push(await anfrage("/api/stempeln", { token: t1, rumpf: { datum: HEUTE, art: "start" } }));
    expect(stati[0].status).toBe(200);
    expect(stati.slice(1, 10).every((s) => s.status !== 429 && s.status !== 200)).toBe(true);   // schon gestempelt, aber nicht gebremst
    expect(stati[10].status).toBe(429);
    expect(Number(stati[10].retryAfter), "Retry-After").toBeGreaterThan(0);
    expect(stati[11].status).toBe(429);
    expect((await anfrage("/api/stempeln", { token: t2, rumpf: { datum: HEUTE, art: "start" } })).status).toBe(200);
    expect(Z.zaehlung()["429-last"]).toBeGreaterThanOrEqual(2);
  });

  it("Auflage M2: viele 429 derselben Sperre schreiben höchstens EINE Protokollzeile; /gesund zählt jede", async () => {
    imFrischenFenster(9);
    const raum = "w47-protokoll";
    await B.bestandSchreiben(store, raum, betrieb([person("p1")]), { durch: "Pruefung" });
    const [t1] = await sitzungen(raum, ["p1"]);
    Z.zaehlungLeeren();
    const zeilen = async () => (await S.spurLesen(1)).filter((z) => z.zusatz === "stempeln (Person)"
      && z.kennung === S.kennung(new Request(`http://${WIRT}/x`), { bestand: raum })).length;
    const vorher = await zeilen();
    const stati = [];
    for (let i = 0; i < 40; i++) stati.push((await anfrage("/api/stempeln", { token: t1, rumpf: { datum: heuteJetzt(), art: "start" } })).status);
    const gebremst = stati.filter((s) => s === 429).length;
    expect(gebremst, JSON.stringify(stati)).toBe(30);
    expect(await zeilen() - vorher, "eine Zeile je neu gesetzter Sperre").toBe(1);
    expect(Z.zaehlung()["429-last"], "jede Abweisung bleibt für /gesund gezählt").toBe(30);
  }, 120000);

  it("Auflage M4: die Sperre je Person ist nicht länger als die Wartezeit des Clients (15 s) und nicht steigend", () => {
    expect(S.GRENZEN.stempeln.sperre).toBeLessThanOrEqual(15);
    expect(S.GRENZEN.stempeln.steigend).toBeFalsy();
    expect(S.GRENZEN["stempeln-raum"].sperre).toBeLessThanOrEqual(15);
  });

  it("der Raumdeckel schützt: ist er erreicht, kommt 429 mit Retry-After, gestempelt wird nichts", async () => {
    const raum = "w47-deckel";
    await B.bestandSchreiben(store, raum, betrieb(["p1", "p2", "p3", "p4"].map((i) => person(i))), { durch: "Pruefung" });
    const tokens = await sitzungen(raum, ["p1", "p2", "p3", "p4"]);
    /* Die Größe des Raums ist dem Server noch unbekannt: Deckel 240. Den Zähler des Raums
       vorab über die Deckelgrenze füllen (mit großzügigerer Grenze, damit das Füllen selbst frei bleibt). */
    {
      const k = S.kennung(new Request(`http://${WIRT}/x`, { headers: { "x-forwarded-for": "10.0.0.1" } }), { bestand: raum });
      for (let i = 0; i < 250; i++) S.lastbremse("stempeln-raum", k, 900);
      const r = await anfrage("/api/stempeln", { token: tokens[0], rumpf: { datum: HEUTE, art: "start" } });
      expect(r.status, JSON.stringify(r).slice(0, 200)).toBe(429);
      expect(Number(r.retryAfter)).toBeGreaterThan(0);
      const lesen = (await B.bestandLesen(store, raum)).bestand.mandanten[0];
      expect(lesen.einstempeln || {}).toEqual({});
    }
  }, 120000);
});

/* ------------------------------------------------------------------------ */
describe("WP-47 · Anmelden über HTTP", () => {
  const raum = "w47-anmeldung";
  let codes = [];
  const code = (i) => `W47X-${String(i).padStart(4, "0")}-CODE`;

  beforeAll(async () => {
    await B.bestandSchreiben(store, raum, betrieb(Array.from({ length: 5 }, (_, i) => person(`p${i + 1}`))), { durch: "Pruefung" });
    for (let i = 0; i < 40; i += 10) {
      await Promise.all(Array.from({ length: 10 }, async (_, k) => {
        const n = i + k;
        await kontoSchreiben(store, ablageSchluessel(code(n)), { name: `q${n}`, bestand: raum, rolle: "mitarbeiter",
          person: "p1", betrieb: 0, mandantId: "m1", angelegt: new Date().toISOString() });
        codes.push(code(n));
      }));
    }
    for (let n = 100; n < 112; n++)
      await kontoSchreiben(store, ablageSchluessel(code(n)), { name: `g${n}`, bestand: raum, rolle: "mitarbeiter",
        person: "p1", betrieb: 0, mandantId: "m1", gesperrt: true, angelegt: new Date().toISOString() });
  });

  it("Anmeldewelle: 40 gelungene Anmeldungen in einen Betrieb (Betriebsgrenze 10) — alle 200", async () => {
    const zurueck = aendern(S.WEITERE.anmelden.ziel, { versuche: 10 });
    try {
      const stati = [];
      for (const c of codes) stati.push((await anfrage("/api/anmelden", { rumpf: { zugangscode: c } })).status);
      expect(stati.filter((s) => s === 200), JSON.stringify(stati)).toHaveLength(40);
    } finally { zurueck(); }
  }, 120000);

  it("danach bleiben Fehlversuche gezählt: zehn zurückgezogene Zugänge des Betriebs gehen durch (403), der elfte wird gebremst (429, Retry-After)", async () => {
    const zurueck = aendern(S.WEITERE.anmelden.ziel, { versuche: 10 });
    try {
      const stati = [];
      for (let n = 100; n < 112; n++) stati.push(await anfrage("/api/anmelden", { rumpf: { zugangscode: code(n) } }));
      expect(stati.slice(0, 10).map((s) => s.status)).toEqual(Array(10).fill(403));
      expect(stati[10].status).toBe(429);
      expect(Number(stati[10].retryAfter)).toBeGreaterThan(0);
    } finally { zurueck(); }
  }, 120000);

  it("falsche Codes aus einer Herkunft: acht werden geprüft (401), der neunte gebremst — unverändert", async () => {
    const stati = [];
    for (let i = 0; i < 10; i++)
      stati.push(await anfrage("/api/anmelden", { rumpf: { zugangscode: `FALS-${String(i).padStart(4, "0")}-XXXX` }, xff: "10.47.250.1" }));
    expect(stati.slice(0, 8).map((s) => s.status)).toEqual(Array(8).fill(401));
    expect(stati[8].status).toBe(429);
    expect(Number(stati[8].retryAfter)).toBeGreaterThan(0);
  }, 120000);

  it("Lastgrenze gelungener Anmeldungen je Betrieb: ist sie erreicht, 429 mit Retry-After und gezählt für /gesund — ohne Sitzung", async () => {
    const zurueck = aendern(S.GRENZEN["anmelden-erfolg"], { versuche: 3 });
    const zielAlt = aendern(S.WEITERE.anmelden.ziel, { versuche: 1000 });
    try {
      Z.zaehlungLeeren();
      /* Eigener Betrieb mit frischem Zähler (die Welle oben hat den Betrieb "w47-anmeldung" schon belastet). */
      const lastRaum = "w47-last";
      await B.bestandSchreiben(store, lastRaum, betrieb([person("p1")]), { durch: "Pruefung" });
      for (let i = 0; i < 5; i++)
        await kontoSchreiben(store, ablageSchluessel(`W47L-000${i}-CODE`), { name: `l${i}`, bestand: lastRaum, rolle: "mitarbeiter",
          person: "p1", betrieb: 0, mandantId: "m1", angelegt: new Date().toISOString() });
      const stati = [];
      for (let i = 0; i < 5; i++) stati.push(await anfrage("/api/anmelden", { rumpf: { zugangscode: `W47L-000${i}-CODE` } }));
      expect(stati.map((s) => s.status)).toEqual([200, 200, 200, 429, 429]);
      expect(Number(stati[3].retryAfter)).toBeGreaterThan(0);
      expect(stati[3].token).toBeUndefined();
      expect(Z.zaehlung()["429-last"]).toBe(2);
    } finally { zurueck(); zielAlt(); }
  }, 120000);

  /* Auflage M1: Die Lastgrenze je Betrieb ließ sich von EINEM Code-Inhaber
     ausschöpfen — eine Skriptschleife mit dem eigenen Code sperrte den ganzen
     Betrieb. Jetzt zählt zuerst jeder Code für sich. */
  it("Auflage M1: ein Code in der Schleife sperrt nur sich selbst — andere Codes und die Leitung desselben Betriebs bleiben frei", async () => {
    imFrischenFenster(10);
    const r1 = aendern(S.GRENZEN["anmelden-erfolg"], { versuche: 30 });
    const r2 = aendern(S.WEITERE.anmelden.ziel, { versuche: 30 });
    try {
      const raumC = "w47-code";
      await B.bestandSchreiben(store, raumC, betrieb([person("p1"), person("p2"), person("l1", "leitung")]), { durch: "Pruefung" });
      const konto = (c, name, p, rolle = "mitarbeiter") => kontoSchreiben(store, ablageSchluessel(c), { name, bestand: raumC, rolle,
        person: p, betrieb: 0, mandantId: "m1", angelegt: new Date().toISOString() });
      await konto("W47C-SCHL-EIFE", "schleife", "p1");
      await konto("W47C-ANDE-RERC", "andere", "p2");
      await konto("W47C-LEIT-UNGC", "leitung", "l1", "leitung");
      const stati = [];
      for (let i = 0; i < 60; i++) stati.push(await anfrage("/api/anmelden", { rumpf: { zugangscode: "W47C-SCHL-EIFE" } }));
      const grenze = S.GRENZEN["anmelden-code"].versuche;
      expect(grenze).toBeLessThanOrEqual(20);
      expect(stati.slice(0, grenze).map((s) => s.status)).toEqual(Array(grenze).fill(200));
      expect(stati.slice(grenze).every((s) => s.status === 429 && Number(s.retryAfter) > 0 && !s.token),
        JSON.stringify(stati.map((s) => s.status))).toBe(true);
      expect((await anfrage("/api/anmelden", { rumpf: { zugangscode: "W47C-ANDE-RERC" } })).status, "anderer Code desselben Betriebs").toBe(200);
      expect((await anfrage("/api/anmelden", { rumpf: { zugangscode: "W47C-LEIT-UNGC" } })).status, "Leitung desselben Betriebs").toBe(200);
    } finally { r1(); r2(); }
  }, 120000);

  it("Auflage M1 (seit SI-P7): die Abweisung je Code entlastet die Herkunft NICHT und belastet sie auch nicht — vorhandene Fehlversuche bleiben stehen", async () => {
    imFrischenFenster(11);
    const r1 = aendern(S.GRENZEN["anmelden-code"], { versuche: 1 });
    try {
      const raumH = "w47-code-herkunft";
      await B.bestandSchreiben(store, raumH, betrieb([person("p1")]), { durch: "Pruefung" });
      await kontoSchreiben(store, ablageSchluessel("W47H-HERK-UNFT"), { name: "h", bestand: raumH, rolle: "mitarbeiter",
        person: "p1", betrieb: 0, mandantId: "m1", angelegt: new Date().toISOString() });
      expect((await anfrage("/api/anmelden", { rumpf: { zugangscode: "W47H-HERK-UNFT" } })).status).toBe(200);
      const xff = "10.47.251.7";
      /* Drei Fehlversuche aus dieser Herkunft … */
      for (let i = 0; i < 3; i++)
        expect((await anfrage("/api/anmelden", { rumpf: { zugangscode: `W47H-FEHL-000${i}` }, xff })).status).toBe(401);
      /* … dann acht Versuche mit dem GÜLTIGEN Code, die die Lastgrenze je Code abweist. */
      const stati = [];
      for (let i = 0; i < S.GRENZEN.anmelden.versuche; i++)
        stati.push((await anfrage("/api/anmelden", { rumpf: { zugangscode: "W47H-HERK-UNFT" }, xff })).status);
      expect(stati).toEqual(Array(S.GRENZEN.anmelden.versuche).fill(429));
      /* Gültige Versuche zählen nicht gegen die Herkunft (SI-P7: nur Fehlversuche zählen) … */
      const k = S.kennung(new Request(`http://${WIRT}/api/anmelden`, { headers: { host: WIRT, "x-forwarded-for": xff } }), null);
      const b = await S.bremse("anmelden", k);
      expect(b.frei, "die Herkunft ist nicht gesperrt").toBe(true);
      /* … und die drei Fehlversuche stehen noch (drei + dieser Prüfaufruf = vier gezählt). */
      expect(b.uebrig, "Fehlversuche bleiben erhalten").toBe(S.GRENZEN.anmelden.versuche - 4);
    } finally { r1(); }
  }, 120000);

  it("Auflage M3: die Lastgrenze greift VOR dem Lesen des Bestands", async () => {
    imFrischenFenster(12);
    const r1 = aendern(S.GRENZEN["anmelden-erfolg"], { versuche: 2 });
    try {
      const raumL = "w47-vorlesen";
      await B.bestandSchreiben(store, raumL, betrieb([person("p1")]), { durch: "Pruefung" });
      for (let i = 0; i < 3; i++)
        await kontoSchreiben(store, ablageSchluessel(`W47V-000${i}-CODE`), { name: `v${i}`, bestand: raumL, rolle: "mitarbeiter",
          person: "p1", betrieb: 0, mandantId: "m1", angelegt: new Date().toISOString() });
      expect((await anfrage("/api/anmelden", { rumpf: { zugangscode: "W47V-0000-CODE" } })).status).toBe(200);
      expect((await anfrage("/api/anmelden", { rumpf: { zugangscode: "W47V-0001-CODE" } })).status).toBe(200);
      B.bestandLesen.mockClear();
      const r = await anfrage("/api/anmelden", { rumpf: { zugangscode: "W47V-0002-CODE" } });
      expect(r.status).toBe(429);
      expect(B.bestandLesen.mock.calls.filter((c) => c[1] === raumL), "kein Lesen des Bestands bei Lastabweisung").toHaveLength(0);
    } finally { r1(); }
  }, 120000);
});
