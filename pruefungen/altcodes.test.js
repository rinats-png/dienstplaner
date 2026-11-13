/* ==========================================================================
   ALTE ZUGANGSCODES — Bindung an die Kennung des Betriebs

   Codes von vor Oktober 2026 kennen ihren Betrieb nur über die Position.
   Im Raum mit genau einem Betrieb ist die Zuordnung eindeutig: Die
   Anmeldung ergänzt die Kennung selbst. Im Raum mit mehreren Betrieben —
   dem Demoraum — wird nicht geraten: /einrichten/bindung zeigt im
   Trockenlauf, worauf jeder Code heute zeigt, und bindet nur, was ein
   Mensch ausdrücklich bestätigt.

   Alte Codes lassen sich über HTTP nicht mehr anlegen; die Prüfung legt
   sie deshalb direkt in der Ablage an, so wie sie heute dort liegen.
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const WIRT = "127.0.0.1:3000";
const ADMIN = "altcode-verwaltung-0123456789";
let wurzel, laden, daten, einrichten, kontoSchreiben, kontoLesen, ablageSchluessel, bestandSchreiben;

let nr = 0;
const anfrage = async (handler, pfad, { methode = "POST", rumpf, token } = {}) => {
  nr += 1;
  const kopf = { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.9.${Math.floor(nr / 250)}.${nr % 250}` };
  if (methode !== "GET") kopf["content-type"] = "application/json";
  if (token) kopf.authorization = `Bearer ${token}`;
  const a = await handler(new Request(`http://${WIRT}${pfad}`, { method: methode, headers: kopf,
    ...(methode === "GET" ? {} : { body: JSON.stringify(rumpf || {}) }) }), {});
  let d = {}; try { d = await a.json(); } catch { /* leer */ }
  return { status: a.status, ...d };
};
const anmelden = (code) => anfrage(daten, "/api/anmelden", { rumpf: { zugangscode: code } });

const betrieb = (id) => ({ id, name: id, einheiten: [{ id: "e1", name: "WB 1" }], personen: [] });
/* Ein Code, wie er vor Oktober 2026 entstand: Position ohne Kennung. */
const altcode = async (code, raum, rolle, betriebIndex) => {
  await kontoSchreiben(laden(), ablageSchluessel(code), { name: `Alt ${rolle} ${betriebIndex}`, bestand: raum, rolle,
    person: null, betrieb: betriebIndex, demo: false, angelegt: "2026-01-01T00:00:00.000Z" });
  return ablageSchluessel(code);
};

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-altcodes-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
  process.env.CENTRIC_ADMIN = ADMIN;
  const { getStore } = await import("../server/lib/ablage.mjs");
  laden = () => getStore({ name: "centric", consistency: "strong" });
  daten = (await import("../server/funktionen/daten.mjs")).default;
  einrichten = (await import("../server/funktionen/einrichten.mjs")).default;
  ({ kontoSchreiben, kontoLesen } = await import("../server/lib/konten.mjs"));
  ({ ablageSchluessel } = await import("../server/lib/codes.mjs"));
  ({ bestandSchreiben } = await import("../server/lib/bestand.mjs"));
  await bestandSchreiben(laden(), "alt-einzel", { version: 9, mandanten: [betrieb("haus")] }, { durch: "Pruefung" });
  await bestandSchreiben(laden(), "alt-demo", { version: 9,
    mandanten: [betrieb("m-nordwacht"), betrieb("m-lindenhof"), betrieb("m-steinbach")] }, { durch: "Pruefung" });
});

afterAll(async () => {
  await rm(wurzel, { recursive: true, force: true });
});

describe("Raum mit genau einem Betrieb", () => {
  it("die Anmeldung bindet den alten Code an die Kennung", async () => {
    const s = await altcode("ALT1-EINZ-AAAA", "alt-einzel", "leitung", 0);
    expect((await kontoLesen(laden(), s)).mandantId).toBeUndefined();
    const a = await anmelden("ALT1-EINZ-AAAA");
    expect(a.token, JSON.stringify(a)).toBeTruthy();
    const nach = await kontoLesen(laden(), s);
    expect(nach.mandantId).toBe("haus");
    expect(nach.gebunden).toBeTruthy();
    expect(nach.betrieb).toBe(0);
  });
});

describe("Raum mit mehreren Betrieben", () => {
  let sL, sS;
  beforeAll(async () => {
    sL = await altcode("ALT2-LIND-BBBB", "alt-demo", "leitung", 1);
    sS = await altcode("ALT3-STEI-CCCC", "alt-demo", "planer", 2);
  });

  it("die Anmeldung rät nicht: der Code bleibt ungebunden und gilt über die Position", async () => {
    const a = await anmelden("ALT2-LIND-BBBB");
    expect(a.token, JSON.stringify(a)).toBeTruthy();
    expect((await kontoLesen(laden(), sL)).mandantId).toBeUndefined();
  });

  it("Trockenlauf: Position, heutiger Betrieb, nichts geändert", async () => {
    const t = await anfrage(einrichten, "/einrichten/bindung?bestand=alt-demo", { methode: "GET", token: ADMIN });
    expect(t.status).toBe(200);
    expect(t.trockenlauf).toBe(true);
    expect(t.betriebe.map((b) => b.id)).toEqual(["m-nordwacht", "m-lindenhof", "m-steinbach"]);
    const zeile = t.zugaenge.find((z) => z.kennung === sL.slice(-8));
    expect(zeile).toMatchObject({ betrieb: 1, mandantId: null, aktuell: { id: "m-lindenhof" } });
    expect(JSON.stringify(t)).not.toContain("ALT2-LIND-BBBB");
    expect((await kontoLesen(laden(), sL)).mandantId).toBeUndefined();
  });

  it("ohne Verwaltungsschlüssel kein Trockenlauf", async () => {
    const t = await anfrage(einrichten, "/einrichten/bindung?bestand=alt-demo", { methode: "GET", token: "falsch" });
    expect(t.status).toBe(401);
  });

  it("bestätigte Zuordnung wird gebunden, eine nicht passende nicht", async () => {
    const b = await anfrage(einrichten, "/einrichten/bindung", { token: ADMIN, rumpf: { bestand: "alt-demo",
      zuordnung: [{ kennung: sL.slice(-8), mandantId: "m-lindenhof" },
        { kennung: sS.slice(-8), mandantId: "m-nordwacht" }] } });
    expect(b.status).toBe(200);
    expect(b.ergebnis.map((e) => e.gebunden)).toEqual([true, false]);
    expect((await kontoLesen(laden(), sL)).mandantId).toBe("m-lindenhof");
    expect((await kontoLesen(laden(), sS)).mandantId).toBeUndefined();
  });

  it("nach der Bindung schützt die Kennung: verschobene Reihenfolge, keine Anmeldung", async () => {
    await bestandSchreiben(laden(), "alt-demo", { version: 9,
      mandanten: [betrieb("m-lindenhof"), betrieb("m-nordwacht"), betrieb("m-steinbach")] }, { durch: "Pruefung" });
    const a = await anmelden("ALT2-LIND-BBBB");
    expect(a.status).toBe(403);
    expect(a.token).toBeFalsy();
  });

  it("leerer Raum: kein Trockenlauf (409)", async () => {
    const t = await anfrage(einrichten, "/einrichten/bindung?bestand=alt-nichts", { methode: "GET", token: ADMIN });
    expect(t.status).toBe(409);
  });
});

/* --------------------------------------------------------------------------
   A-3 (Betreiberentscheidung E-D1, Befund F-0; Delta-Review e8b9b93d, Punkt 5). Die Fälle oben sind die
   BESTANDSbetriebe bei ausgeschaltetem CENTRIC_ERSTLEITUNG_STRENG — alte Leitungscodes ohne Person verhalten sich dort
   unverändert wie auf integration/release-v4 (Sitzung, Bindung an die Kennung). Hier die strengen Fälle: Schalter an,
   oder ein NEUER Betrieb (Regime-Marke, server/lib/erstleitung.mjs) bei ausgeschaltetem Schalter.
   -------------------------------------------------------------------------- */
describe("alte Leitungscodes ohne Person, streng", () => {
  const LEITUNG = { id: "pl", vorname: "Lea", nachname: "Leitung", rolle: "leitung", bereich: "ALLE", status: "aktiv",
    eintritt: "2020-01-01", austritt: null, qualifikationen: [], zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }] };
  const personengebunden = async (code, raum) => {
    await kontoSchreiben(laden(), ablageSchluessel(code), { name: "Alt leitung 0", bestand: raum, rolle: "leitung",
      person: LEITUNG.id, betrieb: 0, demo: false, angelegt: "2026-01-01T00:00:00.000Z" });
    return ablageSchluessel(code);
  };

  it("Schalter an: Bestandsbetrieb — der alte Code ohne Person bekommt keine Sitzung und wird nicht gebunden", async () => {
    await bestandSchreiben(laden(), "alt-streng", { version: 9, mandanten: [{ ...betrieb("haus2"), personen: [LEITUNG] }] }, { durch: "Pruefung" });
    const s = await altcode("ALT4-STRE-DDDD", "alt-streng", "leitung", 0);
    const p = await personengebunden("ALT5-STRE-EEEE", "alt-streng");
    const vorher = process.env.CENTRIC_ERSTLEITUNG_STRENG;
    process.env.CENTRIC_ERSTLEITUNG_STRENG = "true";
    try {
      const a = await anmelden("ALT4-STRE-DDDD");
      expect(a.status).toBe(403);
      expect(a.fehler).toBe("Ihr Zugang ist keiner Person zugeordnet.");
      expect(a.token).toBeFalsy();
      expect((await kontoLesen(laden(), s)).mandantId).toBeUndefined();
      /* Derselbe alte Code MIT Person: wie bisher — Sitzung und Bindung an die Kennung. */
      const b = await anmelden("ALT5-STRE-EEEE");
      expect(b.token, JSON.stringify(b)).toBeTruthy();
      expect((await kontoLesen(laden(), p)).mandantId).toBe("haus2");
    } finally {
      if (vorher === undefined) delete process.env.CENTRIC_ERSTLEITUNG_STRENG; else process.env.CENTRIC_ERSTLEITUNG_STRENG = vorher;
    }
  });

  it("Schalter aus, NEUER Betrieb (Regime-Marke): der alte Code ohne Person bekommt keine Sitzung", async () => {
    const { erstleitungRegimeVermerken } = await import("../server/lib/erstleitung.mjs");
    expect(process.env.CENTRIC_ERSTLEITUNG_STRENG).toBeUndefined();
    await bestandSchreiben(laden(), "alt-neu", { version: 9, mandanten: [betrieb("haus3")] }, { durch: "Pruefung" });
    await erstleitungRegimeVermerken(laden(), "alt-neu", "haus3", { durch: "Pruefung" });
    await altcode("ALT6-NEUB-FFFF", "alt-neu", "leitung", 0);
    const a = await anmelden("ALT6-NEUB-FFFF");
    expect(a.status).toBe(403);
    expect(a.token).toBeFalsy();
  });
});
