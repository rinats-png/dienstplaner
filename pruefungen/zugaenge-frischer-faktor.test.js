/* ==========================================================================
   SI-P6 (Befund P6, HOCH) — Betreiber-Leitungscodes nur mit frischer
   Anmeldung und frischem zweiten Faktor

   Vorher: POST /api/zugaenge verlangte nur eine Betreibersitzung (bis zu
   zwei Stunden alt). Eine einzige abgegriffene Sitzung prägte damit
   dauerhafte Leitung-Codes für beliebige Kundenräume — voller Zugriff auf
   deren Personendaten, entgegen der Zusage in AV §3.

   Jetzt:
     1. Die Anmeldung ist jünger als 20 Minuten (frisch).
     2. Ist für den Betreibercode ein zweiter Faktor eingerichtet, gehört ein
        FRISCHER Code aus der App in den Rumpf (`zweifaktor`) — nie ein
        Nachweis, nie ein schon verbrauchter Code. Unter Pflicht (Auslieferung)
        ohne eingerichteten Faktor: 403, nichts entsteht.
     3. Neue Zugänge für bestehende Kundenräume: siehe kundenraumschutz.test.js
        (Betreiberentscheidung G.2; löst die frühere Leitung-Regel ab).

   Rot auf altem Stand: jede der Prüfungen unten außer dem Gegenstück
   „Erstanlage" und „ohne Pflicht, ohne Faktor".
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { hotp, base32Dekodieren, schrittZu } from "../server/lib/zweifaktor.mjs";

const WIRT = "127.0.0.1:3000";
const T0 = Date.UTC(2026, 10, 7, 9, 0, 15);
const OP_MIT = "P6OP-MITF-0001";        // Betreibercode MIT zweitem Faktor
const OP_OHNE = "P6OP-OHNE-0002";       // Betreibercode OHNE zweiten Faktor
let wurzel, laden, daten, schutz, konten, accounts, ablageSchluesselFn;
let jetzt = T0;
let nr = 0;
const uhr = (ms) => { jetzt = ms; vi.setSystemTime(ms); };
const code = (b32, d = 0) => hotp(base32Dekodieren(b32), schrittZu(jetzt) + d);

const rufen = async (pfad, rumpf, token) => {
  nr += 1;
  const kopf = { host: WIRT, origin: `http://${WIRT}`, "content-type": "application/json",
    "x-forwarded-for": `10.61.${Math.floor(nr / 250)}.${nr % 250}` };
  if (token) kopf.authorization = `Bearer ${token}`;
  const a = await daten(new Request(`http://${WIRT}${pfad}`, { method: "POST", headers: kopf,
    body: JSON.stringify(rumpf) }), {});
  const text = await a.text(); let d = {}; try { d = JSON.parse(text); } catch { /* leer */ }
  return { status: a.status, text, ...d };
};
const zugaenge = (token, rumpf) => rufen("/api/zugaenge", rumpf, token);
const anzahlKonten = async (raum) => (await konten.raumUebersicht(laden(), raum)).zugaenge.length;
const bestandFuer = (id) => ({ version: 9, mandanten: [{ id, name: id, einheiten: [{ id: "e1" }],
  personen: [{ id: "p1", vorname: "V", nachname: "N", rolle: "leitung", bereich: "ALLE",
    zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }] }], nachrichten: [], notrufe: [], anfragen: [] }] });

async function raumAnlegen(raum) {
  const B = await import("../server/lib/bestand.mjs");
  await B.bestandSchreiben(laden(), raum, bestandFuer(`m-${raum}`), { durch: "Pruefung" });
}
async function kontoAnlegen(raum, rolle, extra = {}) {
  const c = `P6${rolle.slice(0, 3).toUpperCase()}-${raum.toUpperCase().slice(0, 4)}-${String(++nr).padStart(4, "0")}`;
  await konten.kontoSchreiben(laden(), ablageSchluesselFn(c), { name: `${rolle} ${raum}`, bestand: raum, rolle,
    person: "p1", betrieb: 0, mandantId: `m-${raum}`, angelegt: "2026-01-01T00:00:00.000Z", ...extra });
  return c;
}

let tokenMit, geheimnis;      // frische Betreibersitzung mit Faktor
beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  uhr(T0);
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-p6-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-p6-0123456789";
  delete process.env.CENTRIC_BETREIBER_ZWEIFAKTOR_PFLICHT;
  const { getStore } = await import("../server/lib/ablage.mjs");
  laden = () => getStore({ name: "centric", consistency: "strong" });
  schutz = await import("../server/lib/schutz.mjs");
  schutz.GRENZEN.anmelden = { ...schutz.GRENZEN.anmelden, versuche: 100000 };
  schutz.WEITERE.anmelden = { ziel: { versuche: 100000, fenster: 300 }, gesamt: { versuche: 100000, fenster: 300 } };
  schutz.NOTGRENZEN.anmelden = { versuche: 100000, fenster: 300, gesamt: 100000 };
  /* Die Bremse der Zugangsanlage ist nicht Gegenstand — die Zwei-Faktor-Bremse schon. */
  schutz.GRENZEN.zugaenge = { ...schutz.GRENZEN.zugaenge, versuche: 100000 };
  schutz.WEITERE.zugaenge = { gesamt: { versuche: 100000, fenster: 600 } };
  daten = (await import("../server/funktionen/daten.mjs")).default;
  konten = await import("../server/lib/konten.mjs");
  accounts = await import("../server/lib/accounts.mjs");
  ablageSchluesselFn = (await import("../server/lib/codes.mjs")).ablageSchluessel;
  for (const c of [OP_MIT, OP_OHNE])
    await konten.kontoSchreiben(laden(), ablageSchluesselFn(c), { name: "Betreiber P6", bestand: "p6-betreiber",
      rolle: "betreiber", person: null, betrieb: 0, mandantId: null, angelegt: "2026-01-01T00:00:00.000Z" });
  for (const r of ["p6-neu", "p6-alt", "p6-gesperrt", "p6-demo", "p6-mitglied", "p6-abgelaufen", "p6-ohne-faktor"])
    await raumAnlegen(r);

  /* Faktor für OP_MIT einrichten, wie es ein Betreiber täte: beginnen, bestätigen, anmelden. */
  const b = await rufen("/api/anmelden", { zugangscode: OP_MIT, zweifaktorAktion: "beginnen" });
  geheimnis = b.geheimnis;
  expect(geheimnis).toBeTruthy();
  const f = await rufen("/api/anmelden", { zugangscode: OP_MIT, zweifaktorAktion: "bestaetigen", zweifaktor: code(geheimnis) });
  expect(f.status).toBe(200);
  const l = await rufen("/api/anmelden", { zugangscode: OP_MIT, zweifaktor: code(geheimnis, 1) });
  expect(l.token).toBeTruthy();
  tokenMit = l.token;
  uhr(jetzt + 60_000);          // frische Schritte für die Prüfungen unten
}, 120000);
afterAll(async () => { vi.useRealTimers(); await rm(wurzel, { recursive: true, force: true }); });
beforeEach(async () => {
  delete process.env.CENTRIC_BETREIBER_ZWEIFAKTOR_PFLICHT;
  /* Die Zwei-Faktor-Bremse ist in einem eigenen Test Gegenstand, sonst nicht. */
  const { createHash } = await import("node:crypto");
  const id = createHash("sha256").update(`betreiber-code:${ablageSchluesselFn(OP_MIT)}`).digest("hex");
  await schutz.entlasten("zweifaktor", `b:${id.slice(0, 16)}`);
  await schutz.entlasten("zweifaktor", `bf:${id.slice(0, 16)}`);
  await schutz.entlasten("zweifaktor", schutz.kennung(null, { bestand: "p6-betreiber" }));   // gemeinsame Herkunftskennung der Betreibersitzungen
  for (let i = 0; i < 4; i++) await schutz.entlasten("zweifaktor", `10.61.${Math.floor(nr / 250)}.${nr % 250}`);
});

describe("SI-P6 frische Anmeldung", () => {
  it("eine Betreibersitzung, die älter als 20 Minuten ist, bekommt „Bitte neu anmelden“ — es entsteht kein Code", async () => {
    const l = await rufen("/api/anmelden", { zugangscode: OP_OHNE });
    expect(l.token).toBeTruthy();
    const vorher = await anzahlKonten("p6-neu");
    const davor = jetzt;
    uhr(jetzt + 21 * 60_000);
    try {
      const r = await zugaenge(l.token, { bestand: "p6-neu", eintraege: [{ rolle: "planer" }] });
      expect(r.status).toBe(403);
      expect(r.neuAnmelden).toBe(true);
    } finally { uhr(davor); }      // die übrigen Prüfungen brauchen ihre frische Sitzung
    expect(await anzahlKonten("p6-neu")).toBe(vorher);
  });

  it("Gegenprobe: dieselbe Sitzung, frisch, ohne eingerichteten Faktor und ohne Pflicht (Entwicklung) → 200", async () => {
    const l = await rufen("/api/anmelden", { zugangscode: OP_OHNE });
    const r = await zugaenge(l.token, { bestand: "p6-ohne-faktor", eintraege: [{ rolle: "planer" }] });
    expect(r.status).toBe(200);
    expect(r.zugaenge).toHaveLength(1);
  });
});

describe("SI-P6 frischer zweiter Faktor", () => {
  it("mit eingerichtetem Faktor: ohne Code → 401 „erforderlich“, es entsteht nichts", async () => {
    const vorher = await anzahlKonten("p6-neu");
    const r = await zugaenge(tokenMit, { bestand: "p6-neu", eintraege: [{ rolle: "planer" }] });
    expect(r.status).toBe(401);
    expect(r.zweifaktor).toBe("erforderlich");
    expect(await anzahlKonten("p6-neu")).toBe(vorher);
  });

  it("ein falscher Code → 401 „falsch“; ein Code aus einem fernen Schritt zählt nicht", async () => {
    const vorher = await anzahlKonten("p6-neu");
    for (const falsch of ["000000", code(geheimnis, 10), 123456, { a: 1 }]) {
      const r = await zugaenge(tokenMit, { bestand: "p6-neu", eintraege: [{ rolle: "planer" }], zweifaktor: falsch });
      expect(r.status, JSON.stringify(falsch)).toBe(401);
      expect(r.zugaenge).toBeUndefined();
    }
    expect(await anzahlKonten("p6-neu")).toBe(vorher);
  });

  it("ein Nachweis oder der Code der Anmeldung genügt nicht: der Code der Anmeldung ist verbraucht", async () => {
    const vorher = await anzahlKonten("p6-neu");
    /* Der Schritt, der bei der Anmeldung verbraucht wurde (T0-Schritt + 1). */
    const r = await zugaenge(tokenMit, { bestand: "p6-neu", eintraege: [{ rolle: "planer" }],
      zweifaktor: hotp(base32Dekodieren(geheimnis), schrittZu(T0) + 1) });
    expect(r.status).toBe(401);
    expect(await anzahlKonten("p6-neu")).toBe(vorher);
  });

  it("ein frischer Code → 200; derselbe Code ein zweites Mal → 401 „schon verwendet“", async () => {
    const c = code(geheimnis);
    const ok = await zugaenge(tokenMit, { bestand: "p6-neu", eintraege: [{ rolle: "planer" }], zweifaktor: c });
    expect(ok.status).toBe(200);
    expect(ok.zugaenge[0].code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    const nochmal = await zugaenge(tokenMit, { bestand: "p6-neu", eintraege: [{ rolle: "planer" }], zweifaktor: c });
    expect(nochmal.status).toBe(401);
    expect(String(nochmal.fehler)).toMatch(/schon verwendet/);
  });

  it("die Antwort nennt weder Geheimnis noch Code des Betreibers", async () => {
    uhr(jetzt + 31_000);
    const r = await zugaenge(tokenMit, { bestand: "p6-neu", eintraege: [{ rolle: "planer" }], zweifaktor: code(geheimnis) });
    expect(r.status).toBe(200);
    expect(r.text).not.toContain(geheimnis);
    expect(r.text).not.toContain(OP_MIT);
  });

  it("Pflicht (Auslieferung) ohne eingerichteten Faktor → 403 „einrichten“, nichts entsteht", async () => {
    const l = await rufen("/api/anmelden", { zugangscode: OP_OHNE });   // Sitzung entstand vor der Pflicht
    expect(l.token).toBeTruthy();
    process.env.CENTRIC_BETREIBER_ZWEIFAKTOR_PFLICHT = "1";
    const vorher = await anzahlKonten("p6-ohne-faktor");
    const r = await zugaenge(l.token, { bestand: "p6-ohne-faktor", eintraege: [{ rolle: "planer" }] });
    expect(r.status).toBe(403);
    expect(r.zweifaktor).toBe("einrichten");
    expect(await anzahlKonten("p6-ohne-faktor")).toBe(vorher);
  });

  it("zu viele falsche Codes werden gebremst (429), danach auch der richtige Code nicht sofort", async () => {
    let letzter;
    for (let i = 0; i < 8; i++) {
      letzter = await zugaenge(tokenMit, { bestand: "p6-neu", eintraege: [{ rolle: "planer" }], zweifaktor: "000000" });
      if (letzter.status === 429) break;
    }
    expect(letzter.status).toBe(429);
    uhr(jetzt + 31_000);
    const r = await zugaenge(tokenMit, { bestand: "p6-neu", eintraege: [{ rolle: "planer" }], zweifaktor: code(geheimnis) });
    expect(r.status).toBe(429);
  });
});

describe("SI-P6 Review (Opus): Altschlüssel, Bremse, Reihenfolge, Raumanlage", () => {
  let tok;
  beforeAll(async () => { tok = (await rufen("/api/anmelden", { zugangscode: OP_OHNE })).token; });

  it("Reihenfolge: mit eingerichtetem Faktor erfährt man ohne Code NICHTS über den Raum (401 statt 409)", async () => {
    const r = await zugaenge(tokenMit, { bestand: "p6-alt", eintraege: [{ rolle: "leitung" }] });
    expect(r.status).toBe(401);
    expect(r.grund).toBeUndefined();
  });

  it("eine Sitzung ohne Kontoschlüssel bekommt nie Codes (403)", async () => {
    const { sitzungAnlegen } = await import("../server/lib/sitzungen.mjs");
    const { token } = await sitzungAnlegen({ bestand: "p6-betreiber", name: "ohne konto", rolle: "betreiber", person: null,
      betrieb: 0, mandantId: null }, 600000);
    const r = await zugaenge(token, { bestand: "p6-ohne-faktor", eintraege: [{ rolle: "planer" }] });
    expect(r.status).toBe(403);
    expect(r.zugaenge).toBeUndefined();
  });

  it("B2: Sitzung über den ALTEN Schlüssel (Konto trägt `ersetztDurch`): der Faktor des neuen Schlüssels gilt", async () => {
    const { altHash } = await import("../server/lib/codes.mjs");
    const altS = altHash("P6-ALTCODE-0001");
    const neuS = ablageSchluesselFn(OP_MIT);
    await konten.kontoSchreiben(laden(), altS, { name: "Betreiber alt", bestand: "p6-betreiber", rolle: "betreiber", person: null,
      betrieb: 0, mandantId: null, ersetztDurch: neuS, angelegt: "2026-01-01T00:00:00.000Z" });
    const { sitzungAnlegen } = await import("../server/lib/sitzungen.mjs");
    const { token } = await sitzungAnlegen({ bestand: "p6-betreiber", name: "alt", rolle: "betreiber", person: null, betrieb: 0,
      mandantId: null, konto: altS }, 600000);
    const ohne = await zugaenge(token, { bestand: "p6-ohne-faktor", eintraege: [{ rolle: "planer" }] });
    expect(ohne.status).toBe(401);
    expect(ohne.zweifaktor).toBe("erforderlich");
    uhr(jetzt + 31_000);
    const mit = await zugaenge(token, { bestand: "p6-ohne-faktor", eintraege: [{ rolle: "planer" }], zweifaktor: code(geheimnis) });
    expect(mit.status).toBe(200);
  });

  it("B3: falsche Codes bei der Zugangsanlage verbrauchen NICHT das Budget der Anmeldung (eigener Zähler)", async () => {
    const { createHash } = await import("node:crypto");
    const id16 = createHash("sha256").update(`betreiber-code:${ablageSchluesselFn(OP_MIT)}`).digest("hex").slice(0, 16);
    let letzter;
    for (let i = 0; i < 8; i++) {
      letzter = await zugaenge(tokenMit, { bestand: "p6-neu", eintraege: [{ rolle: "planer" }], zweifaktor: "000000" });
      if (letzter.status === 429) break;
    }
    expect(letzter.status).toBe(429);
    /* Der Zähler, den die Anmeldung dieses Betreibercodes benutzt, ist unberührt (die Abfrage selbst zählt einen Versuch). */
    const anmeldeZaehler = await schutz.bremse("zweifaktor", `b:${id16}`);
    expect(anmeldeZaehler.frei).toBe(true);
    await schutz.entlasten("zweifaktor", `b:${id16}`);
  });

  it("B4: bestand-anlegen verlangt ebenfalls eine frische Anmeldung — es entsteht kein Raum ohne die Möglichkeit, Codes zu holen", async () => {
    const l = await rufen("/api/anmelden", { zugangscode: OP_OHNE });
    const davor = jetzt;
    uhr(jetzt + 21 * 60_000);
    try {
      const r = await rufen("/api/bestand-anlegen", { bestand: "p6-spaeter", art: "leer" }, l.token);
      expect(r.status).toBe(403);
      expect(r.neuAnmelden).toBe(true);
    } finally { uhr(davor); }
    const { bestandLesen } = await import("../server/lib/bestand.mjs");
    expect(await bestandLesen(laden(), "p6-spaeter")).toBeFalsy();
  });
});

describe("SI-P6 Pflicht im Deploy und Oberfläche (Quelltext-Belege)", () => {
  it("die Auslieferung läuft mit NODE_ENV=production, und production erzwingt den Faktor ohne Abschalter", async () => {
    const { betreiberPflicht } = await import("../server/lib/betreiber-zweifaktor.mjs");
    expect(betreiberPflicht({ NODE_ENV: "production" })).toBe(true);
    for (const aus of ["0", "aus", "", "false"])
      expect(betreiberPflicht({ NODE_ENV: "production", CENTRIC_BETREIBER_ZWEIFAKTOR_PFLICHT: aus }), aus).toBe(true);
    const docker = await readFile(new URL("../Dockerfile", import.meta.url), "utf8");
    expect(docker).toMatch(/NODE_ENV=production/);
    const compose = await readFile(new URL("../deploy/compose.yml", import.meta.url), "utf8");
    expect(compose).toMatch(/NODE_ENV:\s*production/);
  });

  it("die Oberfläche schickt den Code mit: speicher.js sendet `zweifaktor`, die Mandanten-Anlage fragt ihn ab", async () => {
    const sp = await readFile(new URL("../src/speicher.js", import.meta.url), "utf8");
    expect(sp).toMatch(/zugaengeErzeugen\(bestand, eintraege, zweifaktor/);
    expect(sp).toMatch(/JSON\.stringify\(\{ bestand, eintraege(, zweifaktor)? \}\)|zweifaktor/);
    const { appQuelle } = await import("./app-quelle.js");
    const app = appQuelle();
    expect(app).toMatch(/zugaengeErzeugen\((zielRaum|raum),[\s\S]{0,300}faktor/);
    expect(app).toMatch(/Code aus der Authenticator-App|zweiten Faktor/);
  });
});
