/* ==========================================================================
   SI-P4 — ZWEITER FAKTOR FÜR LEITUNG, PLANUNG UND KUNDE (Befund P4, mittel)

   Bis SI-P4 genügte für Leitung, Planung und Kunde der Zugangscode allein;
   einen zweiten Faktor gab es nur für Betreiber und Verwalterschlüssel, und
   „Zugang merken“ hielt auch einen Leitungszugang über das Schließen des
   Browsers hinaus offen.

   Geprüft wird der echte Handler (/api/anmelden, /api/bestand):
     - Anmeldung ohne zweiten Faktor (nicht eingerichtet): Sitzung, aber
       merkenErlaubt: false.
     - Einrichten, Bestätigen (falscher/richtiger Code), alte Sitzungen enden.
     - Anmeldung mit eingerichtetem Faktor: ohne Code 401, falscher Code 401,
       derselbe Code zweimal 401 (Wiederholungsschutz), richtiger Code 200 und
       merkenErlaubt: true; Wiederherstellungscode genau einmal.
     - Bremse je Code (fail-closed, 429).
     - Planer, Subplaner, Kunde; Mitarbeitercode mit wirksamer Rolle Leitung.
     - Mitarbeiter: keine Aktion (400), merken erlaubt. Betreiber: nie merken.
     - Pflicht (CENTRIC_ROLLEN_ZWEIFAKTOR_PFLICHT=1): ohne Faktor keine Sitzung.

   Rot auf altem Stand: Leitung „beginnen“ gab 400, die Antworten trugen kein
   merkenErlaubt, eine Leitung meldete sich ohne zweiten Faktor an.
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { hotp, base32Dekodieren, schrittZu } from "../server/lib/zweifaktor.mjs";
import { merkenErlaubt, zweifaktorRolle, rollenZweifaktorId, betreiberZweifaktorId, rollenPflicht,
  ZWEIFAKTOR_ROLLEN } from "../server/lib/betreiber-zweifaktor.mjs";

const WIRT = "127.0.0.1:3000";
const T0 = Date.UTC(2026, 10, 9, 9, 0, 15);
const RAUM = "si-p4-probe";
const C = {
  LEITUNG: "SIP4-LEIT-UNG1",
  PLANER: "SIP4-PLAN-ER01",
  SUBPLANER: "SIP4-SUBP-LAN1",
  KUNDE: "SIP4-KUND-E001",
  MITARBEITER: "SIP4-MITA-RB01",
  MA_ALS_LEITUNG: "SIP4-MALE-ITG1",
  BREMSE: "SIP4-BREM-SE01",
  PFLICHT: "SIP4-PFLI-CHT1",
  BETREIBER: "SIP4-BETR-EIB1",
  /* Auflagen aus dem Review (PR #120) */
  MA_LEIT_FAKTOR: "SIP4-AUFL-MLF1",
  MA_LEIT_OHNE: "SIP4-AUFL-MLO1",
  LEIT_PERS_MA: "SIP4-AUFL-LPM1",
  M2_HOCH: "SIP4-AUFL-M2H1",
  M2_OHNE_PFLICHT: "SIP4-AUFL-M2O1",
  ALT_SITZUNG: "SIP4-AUFL-ALT1",
  SPEICHER: "SIP4-AUFL-SPE1",
  PFEFFER_FEHLT: "SIP4-AUFL-PFF1",
  PFEFFER_WECHSEL: "SIP4-AUFL-PFW1",
  PFEFFER_PFLICHT: "SIP4-AUFL-PFP1",
  NUR_NEU: "SIP4-AUFL-NNE1",
};
const PFEFFER = "pfeffer-si-p4-0123456789abcdef";
let wurzel, laden, daten, B, K, CODES, ABLAGE;
let nr = 0;
let jetzt = T0;
const uhr = (ms) => { jetzt = ms; vi.setSystemTime(ms); };
const weiter = () => uhr(jetzt + 30_000);   // nächster TOTP-Schritt

const anmelden = async (rumpf) => {
  nr += 1;
  const a = await daten(new Request(`http://${WIRT}/api/anmelden`, { method: "POST",
    headers: { host: WIRT, origin: `http://${WIRT}`, "content-type": "application/json",
      "x-forwarded-for": `10.44.${Math.floor(nr / 250)}.${nr % 250}` },
    body: JSON.stringify(rumpf) }), {});
  const roh = await a.text();
  let d = {}; try { d = JSON.parse(roh); } catch { /* leer */ }
  return { status: a.status, roh, ...d };
};
const bestandHolen = async (token) => {
  nr += 1;
  const a = await daten(new Request(`http://${WIRT}/api/bestand`, { method: "GET",
    headers: { host: WIRT, origin: `http://${WIRT}`, authorization: `Bearer ${token}`,
      "x-forwarded-for": `10.45.${Math.floor(nr / 250)}.${nr % 250}` } }), {});
  let d = {}; try { d = await a.json(); } catch { /* leer */ }
  return { status: a.status, ...d };
};
const code = (b32, d = 0) => hotp(base32Dekodieren(b32), schrittZu(jetzt) + d);

/** Einrichten und bestätigen; gibt Geheimnis und Wiederherstellungscodes zurück. */
async function einrichten(zugangscode) {
  const b = await anmelden({ zugangscode, zweifaktorAktion: "beginnen" });
  expect(b.status, b.roh).toBe(200);
  const f = await anmelden({ zugangscode, zweifaktorAktion: "bestaetigen", zweifaktor: code(b.geheimnis) });
  expect(f.status, f.roh).toBe(200);
  weiter();
  return { geheimnis: b.geheimnis, wiederherstellung: f.wiederherstellung };
}

/** Der Probebestand; `rollen` überschreibt die Rolle einzelner Personen (M2: Hochstufung nach der Anmeldung). */
async function bestandSetzen(rollen) {
  const r = (id, vorgabe) => rollen[id] || vorgabe;
  await B.bestandSchreiben(laden(), RAUM, { version: 9, mandanten: [{
    id: "m1", name: "Haus", status: "aktiv", einheiten: [{ id: "e1", name: "WB 1", versatzTage: 0 }],
    dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00", pause: 30 }], qualifikationen: [],
    einstellungen: { ruhezeit: 11, maxFolge: 6 },
    personen: [person("m0", r("m0", "mitarbeiter")), person("l9", r("l9", "leitung")),
      person("m2", r("m2", "mitarbeiter")), person("m3", r("m3", "mitarbeiter"))],
    abweichungen: {}, abwesenheiten: [], erfassung: {}, einstempeln: {}, anfragen: [], nachrichten: [], bestaetigungen: [],
  }] }, { durch: "SI-P4" });
}

const person = (id, rolle) => ({ id, vorname: "V", nachname: `N${id}`, rolle, bereich: "ALLE", status: "aktiv",
  geburtstag: "1980-01-01", zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }] });

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  uhr(T0);
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-si-p4-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = PFEFFER;
  delete process.env.CENTRIC_ROLLEN_ZWEIFAKTOR_PFLICHT;
  delete process.env.CENTRIC_BETREIBER_ZWEIFAKTOR_PFLICHT;
  const { getStore } = await import("../server/lib/ablage.mjs");
  laden = () => getStore({ name: "centric", consistency: "strong" });
  const schutz = await import("../server/lib/schutz.mjs");
  /* Die Anmeldebremse ist hier nicht Gegenstand — die Zwei-Faktor-Bremse schon. */
  schutz.GRENZEN.anmelden = { ...schutz.GRENZEN.anmelden, versuche: 100000 };
  schutz.WEITERE.anmelden = { ziel: { versuche: 100000, fenster: 300 }, gesamt: { versuche: 100000, fenster: 300 } };
  schutz.NOTGRENZEN.anmelden = { versuche: 100000, fenster: 300, gesamt: 100000 };
  daten = (await import("../server/funktionen/daten.mjs")).default;
  B = await import("../server/lib/bestand.mjs");
  K = await import("../server/lib/konten.mjs");
  CODES = await import("../server/lib/codes.mjs");
  ABLAGE = await import("../server/lib/ablage.mjs");
  await bestandSetzen({});
  const { kontoSchreiben } = K;
  const { ablageSchluessel } = CODES;
  const konto = (c, rolle, person = null) => kontoSchreiben(laden(), ablageSchluessel(c), { name: `${rolle} Probe`,
    bestand: rolle === "betreiber" ? "betreiber-si-p4" : RAUM, rolle, person, betrieb: 0,
    mandantId: rolle === "betreiber" ? null : "m1", angelegt: "2026-01-01T00:00:00.000Z" });
  await konto(C.LEITUNG, "leitung");
  await konto(C.PLANER, "planer");
  await konto(C.SUBPLANER, "subplaner");
  await konto(C.KUNDE, "kunde");
  await konto(C.MITARBEITER, "mitarbeiter", "m0");
  await konto(C.MA_ALS_LEITUNG, "mitarbeiter", "l9");
  await konto(C.BREMSE, "leitung");
  await konto(C.PFLICHT, "leitung");
  await konto(C.BETREIBER, "betreiber");
  await konto(C.MA_LEIT_FAKTOR, "mitarbeiter", "l9");
  await konto(C.MA_LEIT_OHNE, "mitarbeiter", "l9");
  await konto(C.LEIT_PERS_MA, "leitung", "m0");
  await konto(C.M2_HOCH, "mitarbeiter", "m2");
  await konto(C.M2_OHNE_PFLICHT, "mitarbeiter", "m3");
  await konto(C.ALT_SITZUNG, "leitung");
  await konto(C.SPEICHER, "leitung");
  await konto(C.NUR_NEU, "leitung");
  /* N2: Zugänge aus der Zeit vor dem Pfeffer — unter dem alten, ungepfefferten Schlüssel. */
  const altKonto = (c) => kontoSchreiben(laden(), CODES.altHash(c), { name: "leitung Probe", bestand: RAUM,
    rolle: "leitung", person: null, betrieb: 0, mandantId: "m1", angelegt: "2026-01-01T00:00:00.000Z" });
  await altKonto(C.PFEFFER_FEHLT);
  await altKonto(C.PFEFFER_WECHSEL);
  await altKonto(C.PFEFFER_PFLICHT);
});
afterAll(async () => {
  vi.useRealTimers();
  delete process.env.CENTRIC_ROLLEN_ZWEIFAKTOR_PFLICHT;
  await rm(wurzel, { recursive: true, force: true });
});

describe("SI-P4 Bausteine", () => {
  it("Rollen mit zweitem Faktor: Leitung, Planung (planer, subplaner), Kunde — sonst keine", () => {
    expect([...ZWEIFAKTOR_ROLLEN].sort()).toEqual(["kunde", "leitung", "planer", "subplaner"]);
    for (const r of ["leitung", "planer", "subplaner", "kunde"]) expect(zweifaktorRolle(r), r).toBe(true);
    for (const r of ["mitarbeiter", "betriebsrat", "betreiber", "", null, undefined, "LEITUNG"])
      expect(zweifaktorRolle(r), String(r)).toBe(false);
  });

  it("merkenErlaubt: Leitung/Planung/Kunde nur mit Faktor, Betreiber nie, ohne Rolle nie", () => {
    for (const r of ZWEIFAKTOR_ROLLEN) {
      expect(merkenErlaubt([r], false), r).toBe(false);
      expect(merkenErlaubt([r], true), r).toBe(true);
    }
    expect(merkenErlaubt(["betreiber"], true)).toBe(false);
    expect(merkenErlaubt(["betreiber"], false)).toBe(false);
    expect(merkenErlaubt(["mitarbeiter"], false)).toBe(true);
    expect(merkenErlaubt(["betriebsrat"], false)).toBe(true);
    /* Code-Rolle Mitarbeiter, wirksame Rolle Leitung: eine genügt zum Nein. */
    expect(merkenErlaubt(["mitarbeiter", "leitung"], false)).toBe(false);
    expect(merkenErlaubt([], true)).toBe(false);
    expect(merkenErlaubt([null, undefined, ""], true)).toBe(false);
    expect(merkenErlaubt(/** @type {any} */ (null), true)).toBe(false);
    /* Nur ein echtes true zählt. */
    expect(merkenErlaubt(["leitung"], /** @type {any} */ ("ja"))).toBe(false);
  });

  it("eigene Ablage-Kennung, getrennt vom Betreibercode", () => {
    expect(rollenZweifaktorId("x")).toMatch(/^[0-9a-f]{64}$/);
    expect(rollenZweifaktorId("x")).not.toBe(betreiberZweifaktorId("x"));
  });

  it("Pflicht nur mit CENTRIC_ROLLEN_ZWEIFAKTOR_PFLICHT=1", () => {
    expect(rollenPflicht({})).toBe(false);
    expect(rollenPflicht({ CENTRIC_ROLLEN_ZWEIFAKTOR_PFLICHT: "0" })).toBe(false);
    expect(rollenPflicht({ CENTRIC_ROLLEN_ZWEIFAKTOR_PFLICHT: "ja" })).toBe(false);
    expect(rollenPflicht({ CENTRIC_ROLLEN_ZWEIFAKTOR_PFLICHT: "1" })).toBe(true);
    expect(rollenPflicht({ CENTRIC_ROLLEN_ZWEIFAKTOR_PFLICHT: " 1 " })).toBe(true);
  });
});

describe("SI-P4 Leitung über /api/anmelden", () => {
  let geheimnis, wiederherstellung, tokenVorher;

  it("ohne zweiten Faktor: Anmeldung, aber „Zugang merken“ gesperrt (Anmeldung und Bestand)", async () => {
    const a = await anmelden({ zugangscode: C.LEITUNG });
    expect(a.status, a.roh).toBe(200);
    expect(a.token).toBeTruthy();
    expect(a.zweifaktor).toBe(false);
    expect(a.merkenErlaubt).toBe(false);
    tokenVorher = a.token;
    const b = await bestandHolen(a.token);
    expect(b.status).toBe(200);
    expect(b.merkenErlaubt).toBe(false);
    expect(await anmelden({ zugangscode: C.LEITUNG, zweifaktorAktion: "stand" }))
      .toMatchObject({ status: 200, aktiv: false, pflicht: false });
  });

  it("Einrichten: Geheimnis genau einmal, keine Sitzung", async () => {
    const a = await anmelden({ zugangscode: C.LEITUNG, zweifaktorAktion: "beginnen" });
    expect(a.status, a.roh).toBe(200);
    expect(a.geheimnis).toMatch(/^[A-Z2-7]{32}$/);
    expect(a.otpauth).toContain("otpauth://totp/");
    expect(a.token).toBeUndefined();
    geheimnis = a.geheimnis;
    const s = await anmelden({ zugangscode: C.LEITUNG, zweifaktorAktion: "stand" });
    expect(s.geheimnis).toBeUndefined();
    expect(s.ausstehend).toBe(true);
  });

  it("Bestätigen: falscher Code 401, richtiger aktiviert, zehn Wiederherstellungscodes, alte Sitzung endet", async () => {
    const f = await anmelden({ zugangscode: C.LEITUNG, zweifaktorAktion: "bestaetigen", zweifaktor: code(geheimnis, 5) });
    expect(f.status).toBe(401);
    expect(f.wiederherstellung).toBeUndefined();
    const r = await anmelden({ zugangscode: C.LEITUNG, zweifaktorAktion: "bestaetigen", zweifaktor: code(geheimnis) });
    expect(r.status, r.roh).toBe(200);
    expect(r.aktiv).toBe(true);
    expect(r.token).toBeUndefined();
    expect(r.wiederherstellung).toHaveLength(10);
    expect(r.sitzungenBeendet).toBeGreaterThanOrEqual(1);
    wiederherstellung = r.wiederherstellung;
    expect((await bestandHolen(tokenVorher)).status).toBe(401);
    weiter();
  });

  it("Anmeldung ohne Code: 401, keine Sitzung", async () => {
    const a = await anmelden({ zugangscode: C.LEITUNG });
    expect(a.status).toBe(401);
    expect(a.zweifaktor).toBe("erforderlich");
    expect(a.token).toBeUndefined();
  });

  it("Anmeldung mit falschem Code: 401, keine Sitzung", async () => {
    const a = await anmelden({ zugangscode: C.LEITUNG, zweifaktor: code(geheimnis, 7) });
    expect(a.status).toBe(401);
    expect(a.zweifaktor).toBe("falsch");
    expect(a.token).toBeUndefined();
    /* Höchstens vier Fehlversuche: der fünfte setzt die Bremse je Code (eigener Test unten). */
    for (const falsch of ["", "12345", "1234567", "abcdef"]) {
      const b = await anmelden({ zugangscode: C.LEITUNG, zweifaktor: falsch });
      expect(b.status, falsch).toBe(401);
      expect(b.token, falsch).toBeUndefined();
    }
  });

  it("Anmeldung mit richtigem Code: Sitzung, zweifaktor: true, merkenErlaubt: true (auch im Bestand)", async () => {
    const a = await anmelden({ zugangscode: C.LEITUNG, zweifaktor: code(geheimnis) });
    expect(a.status, a.roh).toBe(200);
    expect(a.token).toBeTruthy();
    expect(a.zweifaktor).toBe(true);
    expect(a.merkenErlaubt).toBe(true);
    const b = await bestandHolen(a.token);
    expect(b.status).toBe(200);
    expect(b.merkenErlaubt).toBe(true);
  });

  it("Wiederholungsschutz: derselbe Code ein zweites Mal — 401, auch innerhalb seiner Gültigkeit", async () => {
    const a = await anmelden({ zugangscode: C.LEITUNG, zweifaktor: code(geheimnis) });
    expect(a.status).toBe(401);
    expect(a.fehler).toMatch(/schon verwendet/);
    expect(a.token).toBeUndefined();
    /* Auch ein älterer Schritt im Fenster nicht. */
    const b = await anmelden({ zugangscode: C.LEITUNG, zweifaktor: code(geheimnis, -1) });
    expect(b.status).toBe(401);
    expect(b.token).toBeUndefined();
    weiter();
  });

  it("Wiederherstellungscode: gilt genau einmal", async () => {
    const a = await anmelden({ zugangscode: C.LEITUNG, zweifaktor: wiederherstellung[0] });
    expect(a.status, a.roh).toBe(200);
    expect(a.token).toBeTruthy();
    const b = await anmelden({ zugangscode: C.LEITUNG, zweifaktor: wiederherstellung[0] });
    expect(b.status).toBe(401);
    expect(b.token).toBeUndefined();
    expect(await anmelden({ zugangscode: C.LEITUNG, zweifaktorAktion: "stand" }))
      .toMatchObject({ aktiv: true, wiederherstellungUebrig: 9 });
  });

  it("kein zweites Einrichten über das bestehende, Abschalten nur mit frischem Code", async () => {
    /* Auch Zwei-Faktor-Aktionen zählen zur Lastgrenze je gültigem Code (20 je 5 min, WP-47) — neues Fenster. */
    uhr(jetzt + 6 * 60_000);
    expect((await anmelden({ zugangscode: C.LEITUNG, zweifaktorAktion: "beginnen" })).status).toBe(409);
    const ohne = await anmelden({ zugangscode: C.LEITUNG, zweifaktorAktion: "abschalten" });
    expect(ohne.status).toBe(401);
    const ab = await anmelden({ zugangscode: C.LEITUNG, zweifaktorAktion: "abschalten", zweifaktor: code(geheimnis) });
    expect(ab.status, ab.roh).toBe(200);
    expect(ab.aktiv).toBe(false);
    weiter();
    const a = await anmelden({ zugangscode: C.LEITUNG });
    expect(a.status).toBe(200);
    expect(a.merkenErlaubt).toBe(false);
  });

  it("die Antworten tragen das Geheimnis nie außerhalb von „beginnen“", async () => {
    const s = await anmelden({ zugangscode: C.LEITUNG, zweifaktorAktion: "stand" });
    expect(s.roh).not.toContain(geheimnis);
  });
});

describe("SI-P4 Bremse je Code (fail-closed)", () => {
  it("nach wenigen falschen Codes 429 — auch der richtige kommt dann nicht durch", async () => {
    const { geheimnis } = await einrichten(C.BREMSE);
    let gebremst = false;
    for (let i = 0; i < 12 && !gebremst; i++) {
      const a = await anmelden({ zugangscode: C.BREMSE, zweifaktor: code(geheimnis, 9) });
      expect(a.token).toBeUndefined();
      if (a.status === 429) gebremst = true; else expect(a.status).toBe(401);
    }
    expect(gebremst).toBe(true);
    const r = await anmelden({ zugangscode: C.BREMSE, zweifaktor: code(geheimnis) });
    expect(r.status).toBe(429);
    expect(r.token).toBeUndefined();
    /* Zeitgrenze: jeder falsche Code wartet 400 ms; im Gesamtlauf unter Last reichten 5 s nicht immer. */
  }, 30_000);
});

describe("SI-P4 weitere Rollen", () => {
  for (const [name, zc] of [["Planer", C.PLANER], ["Subplaner", C.SUBPLANER], ["Kunde", C.KUNDE]]) {
    it(`${name}: ohne Faktor nicht merken; mit Faktor Pflicht beim Anmelden`, async () => {
      const vor = await anmelden({ zugangscode: zc });
      expect(vor.status, vor.roh).toBe(200);
      expect(vor.merkenErlaubt).toBe(false);
      const { geheimnis } = await einrichten(zc);
      const ohne = await anmelden({ zugangscode: zc });
      expect(ohne.status).toBe(401);
      expect(ohne.token).toBeUndefined();
      const mit = await anmelden({ zugangscode: zc, zweifaktor: code(geheimnis) });
      expect(mit.status, mit.roh).toBe(200);
      expect(mit.merkenErlaubt).toBe(true);
      weiter();
    });
  }

  it("Mitarbeitercode, dessen Person Leitung ist: zweiter Faktor möglich, ohne ihn nicht merken", async () => {
    const vor = await anmelden({ zugangscode: C.MA_ALS_LEITUNG });
    expect(vor.status, vor.roh).toBe(200);
    expect(vor.merkenErlaubt).toBe(false);
    expect((await bestandHolen(vor.token)).merkenErlaubt).toBe(false);
    const b = await anmelden({ zugangscode: C.MA_ALS_LEITUNG, zweifaktorAktion: "beginnen" });
    expect(b.status, b.roh).toBe(200);
    expect(b.geheimnis).toBeTruthy();
  });

  it("Mitarbeiter: keine Zwei-Faktor-Aktion (400), merken erlaubt", async () => {
    expect((await anmelden({ zugangscode: C.MITARBEITER, zweifaktorAktion: "beginnen" })).status).toBe(400);
    const a = await anmelden({ zugangscode: C.MITARBEITER });
    expect(a.status, a.roh).toBe(200);
    expect(a.zweifaktor).toBeUndefined();
    expect(a.merkenErlaubt).toBe(true);
    expect((await bestandHolen(a.token)).merkenErlaubt).toBe(true);
  });

  it("Betreiber: nie merken, auch nicht ohne Pflicht", async () => {
    const a = await anmelden({ zugangscode: C.BETREIBER });
    expect(a.status, a.roh).toBe(200);
    expect(a.merkenErlaubt).toBe(false);
  });
});

describe("SI-P4 Pflicht (CENTRIC_ROLLEN_ZWEIFAKTOR_PFLICHT=1)", () => {
  it("ohne eingerichteten Faktor keine Sitzung; Einrichten bleibt möglich; danach nur mit Code", async () => {
    process.env.CENTRIC_ROLLEN_ZWEIFAKTOR_PFLICHT = "1";
    try {
      const a = await anmelden({ zugangscode: C.PFLICHT });
      expect(a.status).toBe(403);
      expect(a.zweifaktor).toBe("einrichten");
      expect(a.token).toBeUndefined();
      const { geheimnis } = await einrichten(C.PFLICHT);
      expect((await anmelden({ zugangscode: C.PFLICHT })).status).toBe(401);
      const mit = await anmelden({ zugangscode: C.PFLICHT, zweifaktor: code(geheimnis) });
      expect(mit.status, mit.roh).toBe(200);
      expect(mit.merkenErlaubt).toBe(true);
      weiter();
      /* Unter Pflicht kein Abschalten über das Netz. */
      const ab = await anmelden({ zugangscode: C.PFLICHT, zweifaktorAktion: "abschalten", zweifaktor: code(geheimnis) });
      expect(ab.status).toBe(409);
      expect(ab.zweifaktor).toBe("pflicht");
    } finally {
      delete process.env.CENTRIC_ROLLEN_ZWEIFAKTOR_PFLICHT;
    }
  });
});

/* ==========================================================================
   AUFLAGEN AUS DEM REVIEW VON PR #120 (M2, N2, N4, Negativtests)
   M1 (Konto/Betriebsauswahl) steht in betriebsauswahl.test.js.
   ========================================================================== */

/** Pflicht für die Dauer eines Blocks. */
async function mitPflicht(arbeit) {
  process.env.CENTRIC_ROLLEN_ZWEIFAKTOR_PFLICHT = "1";
  try { return await arbeit(); } finally { delete process.env.CENTRIC_ROLLEN_ZWEIFAKTOR_PFLICHT; }
}
/** Ein anderer Pfeffer (oder keiner) für die Dauer eines Blocks. */
async function mitPfeffer(wert, arbeit) {
  if (wert === null) delete process.env.CENTRIC_PFEFFER; else process.env.CENTRIC_PFEFFER = wert;
  try { return await arbeit(); } finally { process.env.CENTRIC_PFEFFER = PFEFFER; }
}

describe("SI-P4 Auflagen: Rolle des Codes und wirksame Rolle", () => {
  it("Mitarbeitercode, wirksame Rolle Leitung, Faktor eingerichtet: ohne Code 401 — mit und ohne Pflicht", async () => {
    const { geheimnis } = await einrichten(C.MA_LEIT_FAKTOR);
    const ohne = await anmelden({ zugangscode: C.MA_LEIT_FAKTOR });
    expect(ohne.status).toBe(401);
    expect(ohne.zweifaktor).toBe("erforderlich");
    expect(ohne.token).toBeUndefined();
    await mitPflicht(async () => {
      const p = await anmelden({ zugangscode: C.MA_LEIT_FAKTOR });
      expect(p.status).toBe(401);
      expect(p.token).toBeUndefined();
      const mit = await anmelden({ zugangscode: C.MA_LEIT_FAKTOR, zweifaktor: code(geheimnis) });
      expect(mit.status, mit.roh).toBe(200);
      /* Die Sitzung trägt den bestandenen Faktor und besteht die Prüfung je Anfrage. */
      expect((await bestandHolen(mit.token)).status).toBe(200);
    });
    weiter();
  });

  it("Mitarbeitercode, wirksame Rolle Leitung, KEIN Faktor: unter Pflicht 403 (einrichten), ohne Pflicht 200", async () => {
    await mitPflicht(async () => {
      const a = await anmelden({ zugangscode: C.MA_LEIT_OHNE });
      expect(a.status).toBe(403);
      expect(a.zweifaktor).toBe("einrichten");
      expect(a.token).toBeUndefined();
    });
    const b = await anmelden({ zugangscode: C.MA_LEIT_OHNE });
    expect(b.status, b.roh).toBe(200);
    expect(b.merkenErlaubt).toBe(false);
  });

  it("Coderolle Leitung, Person im Bestand Mitarbeiter: der Faktor gilt trotzdem", async () => {
    const { geheimnis } = await einrichten(C.LEIT_PERS_MA);
    const ohne = await anmelden({ zugangscode: C.LEIT_PERS_MA });
    expect(ohne.status).toBe(401);
    expect(ohne.token).toBeUndefined();
    const mit = await anmelden({ zugangscode: C.LEIT_PERS_MA, zweifaktor: code(geheimnis) });
    expect(mit.status, mit.roh).toBe(200);
    expect(mit.zweifaktor).toBe(true);
    weiter();
  });
});

describe("SI-P4 Auflage M2: Hochstufung nach der Anmeldung", () => {
  it("als Mitarbeiter angemeldet, danach Leitung: unter Pflicht 401 und die Sitzung ist beendet", async () => {
    const a = await anmelden({ zugangscode: C.M2_HOCH });
    expect(a.status, a.roh).toBe(200);
    expect(a.zweifaktor).toBeUndefined();
    expect((await bestandHolen(a.token)).rolle).toBe("mitarbeiter");
    await bestandSetzen({ m2: "leitung" });
    try {
      await mitPflicht(async () => {
        const b = await bestandHolen(a.token);
        expect(b.status).toBe(401);
        expect(b.zweifaktor).toBe("neu-anmelden");
        expect(b.bestand).toBeUndefined();
      });
      /* Beendet, nicht nur abgewiesen: auch ohne Pflicht und nach der Rückstufung gilt die Sitzung nicht mehr. */
      await bestandSetzen({});
      expect((await bestandHolen(a.token)).status).toBe(401);
    } finally { await bestandSetzen({}); }
  });

  it("ohne Pflicht: Hochstufung wie bisher (Rechte aus der Personalliste, Sitzung bleibt)", async () => {
    const a = await anmelden({ zugangscode: C.M2_OHNE_PFLICHT });
    expect(a.status, a.roh).toBe(200);
    await bestandSetzen({ m3: "leitung" });
    try {
      const b = await bestandHolen(a.token);
      expect(b.status).toBe(200);
      expect(b.rolle).toBe("leitung");
      expect(b.merkenErlaubt).toBe(false);
    } finally { await bestandSetzen({}); }
  });

  it("Leitungssitzung aus der Zeit vor der Pflicht (ohne Faktor): mit der Pflicht beendet", async () => {
    const a = await anmelden({ zugangscode: C.ALT_SITZUNG });
    expect(a.status, a.roh).toBe(200);
    expect((await bestandHolen(a.token)).status).toBe(200);
    await mitPflicht(async () => {
      expect((await bestandHolen(a.token)).status).toBe(401);
    });
    expect((await bestandHolen(a.token)).status).toBe(401);
  });

  it("Baustein rollenSitzungOhneFaktor: Ausnahmen und Grenzen", async () => {
    const { rollenSitzungOhneFaktor, demoSitzung } = await import("../server/lib/betreiber-zweifaktor.mjs");
    const P = { CENTRIC_ROLLEN_ZWEIFAKTOR_PFLICHT: "1" };
    expect(rollenSitzungOhneFaktor({ rolle: "leitung" }, null, {})).toBe(false);          // Pflicht aus
    expect(rollenSitzungOhneFaktor({ rolle: "leitung" }, null, P)).toBe(true);
    expect(rollenSitzungOhneFaktor({ rolle: "leitung", zweifaktor: true }, null, P)).toBe(false);
    expect(rollenSitzungOhneFaktor({ rolle: "mitarbeiter" }, "leitung", P)).toBe(true);    // M2
    expect(rollenSitzungOhneFaktor({ rolle: "mitarbeiter" }, "mitarbeiter", P)).toBe(false);
    expect(rollenSitzungOhneFaktor({ rolle: "kunde" }, null, P)).toBe(true);
    expect(rollenSitzungOhneFaktor({ rolle: "leitung", zweifaktor: "ja" }, null, P)).toBe(true);
    expect(rollenSitzungOhneFaktor({ rolle: "betreiber" }, null, P)).toBe(false);
    expect(rollenSitzungOhneFaktor({ rolle: "leitung", nurSicherung: true }, null, P)).toBe(false);
    expect(rollenSitzungOhneFaktor({ rolle: "leitung", demo: true, bestand: "demo-x" }, null, P)).toBe(false);
    /* Ein demo-Kennzeichen allein öffnet keinen echten Raum. */
    expect(rollenSitzungOhneFaktor({ rolle: "leitung", demo: true, bestand: "echt" }, null, P)).toBe(true);
    expect(demoSitzung({ demo: "true", bestand: "demo-x" })).toBe(false);
  });
});

describe("SI-P4 Auflage: /api/demo unter Pflicht (Ausnahme für Demoräume)", () => {
  const DEMORAUM = "demo-si-p4";
  beforeAll(async () => {
    await B.bestandSchreiben(laden(), DEMORAUM, { version: 9, mandanten: [{ id: "m1", name: "Demohaus", status: "aktiv",
      einheiten: [{ id: "e1", name: "WB 1", versatzTage: 0 }], dienstarten: [], qualifikationen: [],
      einstellungen: { ruhezeit: 11, maxFolge: 6 }, personen: [],
      abweichungen: {}, abwesenheiten: [], erfassung: {}, einstempeln: {}, anfragen: [], nachrichten: [], bestaetigungen: [],
    }] }, { durch: "SI-P4" });
    await K.kontoSchreiben(laden(), CODES.ablageSchluessel("SIP4-DEMO-LEIT"), { id: "demo-sip4-leitung",
      name: "Demo Leitung", bestand: DEMORAUM, rolle: "leitung", person: null, betrieb: 0, mandantId: "m1",
      demo: true, angelegt: "2026-01-01T00:00:00.000Z" });
  });

  it("Demozugang Leitung: Sitzung und Bestand auch unter Pflicht (Demoraum, keine echten Daten)", async () => {
    process.env.CENTRIC_DEMO = "true";
    try {
      await mitPflicht(async () => {
        nr += 1;
        const a = await daten(new Request(`http://${WIRT}/api/demo`, { method: "POST",
          headers: { host: WIRT, origin: `http://${WIRT}`, "content-type": "application/json",
            "x-forwarded-for": `10.46.0.${nr % 250}` }, body: JSON.stringify({ id: "demo-sip4-leitung" }) }), {});
        const d = await a.json();
        expect(a.status, JSON.stringify(d)).toBe(200);
        expect(d.token).toBeTruthy();
        expect(d.rolle).toBe("leitung");
        const b = await bestandHolen(d.token);
        expect(b.status).toBe(200);
        expect(b.demo).toBe(true);
        /* Nie gemerkt: der Demozugang trägt keinen Faktor. */
        expect(b.merkenErlaubt).toBe(false);
      });
    } finally { delete process.env.CENTRIC_DEMO; }
  });
});

describe("SI-P4 Auflage: Fehler im Faktor-Speicher", () => {
  it("unlesbarer Eintrag des Faktors: 503, keine Sitzung — mit und ohne Pflicht", async () => {
    const id = rollenZweifaktorId(CODES.ablageSchluessel(C.SPEICHER));
    const datei = path.join(wurzel, "centric", ABLAGE.dateiname(`zweifaktor:${id}`));
    await writeFile(datei, "kein gültiger Umschlag");
    const a = await anmelden({ zugangscode: C.SPEICHER });
    expect(a.status).toBe(503);
    expect(a.token).toBeUndefined();
    await mitPflicht(async () => {
      const b = await anmelden({ zugangscode: C.SPEICHER });
      expect(b.status).toBe(503);
      expect(b.token).toBeUndefined();
    });
  });
});

describe("SI-P4 Auflage N2: fehlender oder gewechselter Pfeffer", () => {
  it("Faktor eingerichtet, Pfeffer fehlt: 503 — kein stilles Weiterarbeiten mit dem alten Schlüssel", async () => {
    const { geheimnis } = await einrichten(C.PFEFFER_FEHLT);
    /* Mit Pfeffer gilt der Faktor (und der Zugang wird dabei umgeschlüsselt). */
    const mit = await anmelden({ zugangscode: C.PFEFFER_FEHLT, zweifaktor: code(geheimnis) });
    expect(mit.status, mit.roh).toBe(200);
    weiter();
    await mitPfeffer(null, async () => {
      const a = await anmelden({ zugangscode: C.PFEFFER_FEHLT });
      expect(a.status, a.roh).toBe(503);
      expect(a.zweifaktor).toBe("pfeffer");
      expect(a.token).toBeUndefined();
      const b = await anmelden({ zugangscode: C.PFEFFER_FEHLT, zweifaktor: code(geheimnis) });
      expect(b.status).toBe(503);
      expect(b.token).toBeUndefined();
      /* Auch kein Neueinrichten mit dem Code allein. */
      const c = await anmelden({ zugangscode: C.PFEFFER_FEHLT, zweifaktorAktion: "beginnen" });
      expect(c.status).toBe(503);
      expect(c.geheimnis).toBeUndefined();
    });
  });

  it("Faktor eingerichtet, Pfeffer gewechselt: 503, keine Sitzung, kein Neueinrichten", async () => {
    const { geheimnis } = await einrichten(C.PFEFFER_WECHSEL);
    expect((await anmelden({ zugangscode: C.PFEFFER_WECHSEL, zweifaktor: code(geheimnis) })).status).toBe(200);
    weiter();
    await mitPfeffer("ein-ganz-anderer-pfeffer-9876543210", async () => {
      const a = await anmelden({ zugangscode: C.PFEFFER_WECHSEL });
      expect(a.status, a.roh).toBe(503);
      expect(a.token).toBeUndefined();
      const c = await anmelden({ zugangscode: C.PFEFFER_WECHSEL, zweifaktorAktion: "beginnen" });
      expect(c.status).toBe(503);
      expect(c.geheimnis).toBeUndefined();
    });
    /* Mit dem richtigen Pfeffer ist alles wie vorher. */
    const zurueck = await anmelden({ zugangscode: C.PFEFFER_WECHSEL, zweifaktor: code(geheimnis) });
    expect(zurueck.status, zurueck.roh).toBe(200);
    weiter();
  });

  it("unter Pflicht ohne Pfeffer: 503 statt Einrichtungsaufforderung (kein Faktor prüf- oder einrichtbar)", async () => {
    await mitPflicht(() => mitPfeffer(null, async () => {
      const a = await anmelden({ zugangscode: C.PFEFFER_PFLICHT });
      expect(a.status, a.roh).toBe(503);
      expect(a.token).toBeUndefined();
    }));
  });

  it("Abschalten entfernt den Vermerk: danach wieder der Code allein", async () => {
    const { geheimnis } = await einrichten(C.NUR_NEU);
    const vorher = await K.kontoLesen(laden(), CODES.ablageSchluessel(C.NUR_NEU));
    expect(vorher.zweiterFaktor).toBe(true);
    uhr(jetzt + 6 * 60_000);
    const ab = await anmelden({ zugangscode: C.NUR_NEU, zweifaktorAktion: "abschalten", zweifaktor: code(geheimnis) });
    expect(ab.status, ab.roh).toBe(200);
    const nachher = await K.kontoLesen(laden(), CODES.ablageSchluessel(C.NUR_NEU));
    expect(nachher.zweiterFaktor).toBeUndefined();
    weiter();
    const a = await anmelden({ zugangscode: C.NUR_NEU });
    expect(a.status, a.roh).toBe(200);
  });

  it("N4: unerwarteter Schalterwert wird erkannt (Warnung im Umgebungsbericht)", async () => {
    const { rollenPflichtUnerwartet } = await import("../server/lib/betreiber-zweifaktor.mjs");
    expect(rollenPflichtUnerwartet({})).toBe(false);
    expect(rollenPflichtUnerwartet({ CENTRIC_ROLLEN_ZWEIFAKTOR_PFLICHT: "1" })).toBe(false);
    expect(rollenPflichtUnerwartet({ CENTRIC_ROLLEN_ZWEIFAKTOR_PFLICHT: " 1 " })).toBe(false);
    for (const w of ["ja", "true", "an", "0", "2"])
      expect(rollenPflichtUnerwartet({ CENTRIC_ROLLEN_ZWEIFAKTOR_PFLICHT: w }), w).toBe(true);
  });
});
