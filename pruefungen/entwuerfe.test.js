/* ==========================================================================
   ENTWÜRFE NICHT AN BESCHÄFTIGTE AUSLIEFERN (WP-23)

   Ein Monatsplan ist ein Entwurf, bis die Planung ihn freigibt. Bis hierher
   bekamen Beschäftigte die Einteilungen aller Monate. Jetzt fehlen die
   Einteilungen eines nicht freigegebenen Monats in der Antwort an
   Beschäftigte (server/lib/sicht.mjs, planOhneEntwurf).

   Sonde je Rolle: Beschäftigte sehen nur freigegebene und vergangene
   Monate; Betriebsrat, Schichtverantwortung, Planung, Leitung und
   Kundenrolle behalten den Entwurf. Dazu der Weg über den Handler (GET) und
   das Speichern (eine Beschäftigte schreibt den Plan nicht, der gespeicherte
   Entwurf bleibt), und die Freigabe macht den Monat sichtbar.
   ========================================================================== */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const WIRT = "127.0.0.1:3000";
const R = "wp23-raum";
/* Feste Monate weit in der Zukunft bzw. Vergangenheit: unabhängig vom Testtag. */
const ENTWURF = "2099-05", FREI = "2099-06", VORBEI = "2020-03";
const tag = (monat, t = "10") => `${monat}-${t}`;
let wurzel, laden, daten, sitzungAnlegen, B, S, rechte;

let nr = 0;
const anfrage = async (pfad, { methode = "GET", rumpf, token } = {}) => {
  nr += 1;
  const kopf = { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.23.${Math.floor(nr / 250) % 250}.${nr % 250}` };
  if (methode !== "GET") kopf["content-type"] = "application/json";
  if (token) kopf.authorization = `Bearer ${token}`;
  const a = await daten(new Request(`http://${WIRT}${pfad}`, { method: methode, headers: kopf,
    ...(methode === "GET" ? {} : { body: JSON.stringify(rumpf || {}) }) }), {});
  let d = {}; try { d = await a.json(); } catch { /* leer */ }
  return { status: a.status, ...d };
};
const person = (id, rolle = "mitarbeiter") => ({ id, vorname: `V${id}`, nachname: `N${id}`, rolle, bereich: "e1",
  zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }] });
const betrieb = (extra = {}) => ({ id: "m1", name: "Haus", einheiten: [{ id: "e1", name: "WB" }],
  dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00" }],
  personen: [person("a1"), person("b1"), person("s1", "subplaner"), person("r1", "betriebsrat"),
    person("p1", "planer"), person("l1", "leitung")],
  abweichungen: {
    [`a1|${tag(ENTWURF)}`]: "F", [`b1|${tag(ENTWURF, "11")}`]: "F",       // Entwurf
    [`a1|${tag(FREI)}`]: "F", [`b1|${tag(FREI, "11")}`]: "F",             // freigegeben
    [`a1|${tag(VORBEI)}`]: "F",                                            // vorbei
    "a1|kein-tag": "F",                                                    // kein gültiger Tag
  },
  freigaben: { [FREI]: { stand: 1, zeit: "01.05.2099", durch: "Lea Leitung" } },
  abwesenheiten: [], erfassung: {}, einstempeln: {}, anfragen: [], aenderungen: [], nachrichten: [], ...extra });

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-wp23-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
  const { getStore } = await import("../server/lib/ablage.mjs");
  laden = () => getStore({ name: "centric", consistency: "strong" });
  daten = (await import("../server/funktionen/daten.mjs")).default;
  ({ sitzungAnlegen } = await import("../server/lib/sitzungen.mjs"));
  B = await import("../server/lib/bestand.mjs");
  S = await import("../server/lib/sicht.mjs");
  rechte = await import("../server/lib/rechte.mjs");
  await B.bestandSchreiben(laden(), R, { version: 9, mandanten: [betrieb()] }, { durch: "Pruefung" });
}, 60000);
afterAll(async () => { await rm(wurzel, { recursive: true, force: true }); });

const sitzung = async (pid, rolle) => (await sitzungAnlegen({ bestand: R, name: pid, rolle, person: pid, betrieb: 0,
  mandantId: "m1", einheit: null }, 60 * 60 * 1000)).token;
const schluessel = (m) => Object.keys(m.abweichungen).sort();

describe("Sonde je Rolle (bestandFuerRolle)", () => {
  const roh = () => ({ version: 9, mandanten: [betrieb()] });
  const sicht = (rolle, pid) => rechte.bestandFuerRolle(roh(), { rolle, person: pid, betrieb: 0 }).mandanten[0];
  const alle = [`a1|${tag(ENTWURF)}`, `a1|${tag(FREI)}`, `a1|${tag(VORBEI)}`, `a1|kein-tag`,
    `b1|${tag(ENTWURF, "11")}`, `b1|${tag(FREI, "11")}`].sort();

  it("Beschäftigte: nur freigegebene und vergangene Monate — weder eigener noch fremder Entwurf, kein Eintrag ohne Tag", () => {
    expect(schluessel(sicht("mitarbeiter", "a1"))).toEqual([`a1|${tag(FREI)}`, `a1|${tag(VORBEI)}`, `b1|${tag(FREI, "11")}`].sort());
  });

  for (const [rolle, pid] of [["betriebsrat", "r1"], ["subplaner", "s1"], ["planer", "p1"], ["leitung", "l1"], ["kunde", "l1"]]) {
    it(`${rolle}: behält den Entwurf`, () => {
      const m = sicht(rolle, pid);
      for (const k of [`a1|${tag(ENTWURF)}`, `b1|${tag(ENTWURF, "11")}`, `a1|${tag(FREI)}`]) expect(m.abweichungen[k], k).toBe("F");
    });
  }

  it("Betriebsrat sieht den ganzen Plan (Mitbestimmung vor der Freigabe)", () => {
    expect(schluessel(sicht("betriebsrat", "r1"))).toEqual(alle);
  });

  it("ohne freigaben im Betrieb: Beschäftigte sehen die Zukunft nicht, die Vergangenheit schon", () => {
    const m = { ...betrieb(), freigaben: undefined };
    delete m.freigaben;
    const aus = rechte.bestandFuerRolle({ version: 9, mandanten: [m] }, { rolle: "mitarbeiter", person: "a1", betrieb: 0 }).mandanten[0];
    expect(schluessel(aus)).toEqual([`a1|${tag(VORBEI)}`]);
  });

  it("heute und früher sind in Kraft, kein Entwurf: der heutige Dienst bleibt (Einstempeln), morgen im nicht freigegebenen Monat nicht", () => {
    expect(S.laufenderTag(new Date("2026-12-31T23:30:00Z"))).toBe("2027-01-01");     // Berlin schon im neuen Jahr
    expect(S.laufenderTag(new Date("2026-11-03T10:00:00Z"))).toBe("2026-11-03");
    const heute = S.laufenderTag();
    const verschoben = (t, n) => new Date(Date.parse(`${t}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
    const gestern = verschoben(heute, -1), morgen = verschoben(heute, 1);
    /* Ohne Freigabe im Betrieb: gestern und heute sichtbar, morgen (auch im laufenden Monat) Entwurf. */
    const m = betrieb({ abweichungen: { [`a1|${gestern}`]: "F", [`a1|${heute}`]: "F", [`a1|${morgen}`]: "F" }, freigaben: {} });
    const aus = rechte.bestandFuerRolle({ version: 9, mandanten: [m] }, { rolle: "mitarbeiter", person: "a1", betrieb: 0 }).mandanten[0];
    expect(schluessel(aus)).toEqual([`a1|${gestern}`, `a1|${heute}`].sort());
    /* Ist der Monat von morgen freigegeben, sieht sie auch morgen. */
    const frei = betrieb({ abweichungen: { [`a1|${morgen}`]: "F" }, freigaben: { [morgen.slice(0, 7)]: { stand: 1 } } });
    const aus2 = rechte.bestandFuerRolle({ version: 9, mandanten: [frei] }, { rolle: "mitarbeiter", person: "a1", betrieb: 0 }).mandanten[0];
    expect(schluessel(aus2)).toEqual([`a1|${morgen}`]);
  });

  it("freigaben/planstaende bleiben wie bisher (nur freigegebene Monate stehen dort)", () => {
    const m = sicht("mitarbeiter", "a1");
    expect(Object.keys(m.freigaben)).toEqual([FREI]);
  });

  it("die Eingabe wird nicht verändert (keine Mutation des gespeicherten Betriebs)", () => {
    const eingabe = roh();
    const vorher = JSON.stringify(eingabe);
    rechte.bestandFuerRolle(eingabe, { rolle: "mitarbeiter", person: "a1", betrieb: 0 });
    expect(JSON.stringify(eingabe)).toBe(vorher);
  });
});

describe("über den Handler", () => {
  it("GET /api/bestand: Beschäftigte ohne Entwurf, Planung mit", async () => {
    const ma = await anfrage("/api/bestand", { token: await sitzung("a1", "mitarbeiter") });
    expect(ma.status).toBe(200);
    expect(schluessel(ma.bestand.mandanten[0])).toEqual([`a1|${tag(FREI)}`, `a1|${tag(VORBEI)}`, `b1|${tag(FREI, "11")}`].sort());
    expect(JSON.stringify(ma)).not.toContain(ENTWURF);
    const pl = await anfrage("/api/bestand", { token: await sitzung("p1", "planer") });
    expect(pl.bestand.mandanten[0].abweichungen[`a1|${tag(ENTWURF)}`]).toBe("F");
  });

  it("eine Beschäftigte speichert (z. B. einen Wunsch): der gespeicherte Entwurf bleibt unberührt", async () => {
    const t = await sitzung("a1", "mitarbeiter");
    const g = await anfrage("/api/bestand", { token: t });
    const b = JSON.parse(JSON.stringify(g.bestand));
    b.mandanten[0].wuensche = [{ id: "wu1", personId: "a1", datum: tag(FREI, "20"), art: "frei" }];
    const p = await anfrage("/api/bestand", { methode: "PUT", token: t, rumpf: { bestand: b, etag: g.etag } });
    expect(p.status, JSON.stringify(p).slice(0, 300)).toBe(200);
    const gespeichert = (await B.bestandLesen(laden(), R)).bestand.mandanten[0];
    expect(gespeichert.abweichungen[`a1|${tag(ENTWURF)}`]).toBe("F");
    expect(gespeichert.abweichungen[`b1|${tag(ENTWURF, "11")}`]).toBe("F");
    expect(gespeichert.wuensche.map((x) => x.id)).toEqual(["wu1"]);
  });

  it("die Planung gibt den Monat frei: danach sehen ihn die Beschäftigten", async () => {
    const tp = await sitzung("p1", "planer");
    const g = await anfrage("/api/bestand", { token: tp });
    const b = JSON.parse(JSON.stringify(g.bestand));
    b.mandanten[0].freigaben = { ...b.mandanten[0].freigaben, [ENTWURF]: { stand: 1, zeit: "02.05.2099", durch: "Paul Planer" } };
    const p = await anfrage("/api/bestand", { methode: "PUT", token: tp, rumpf: { bestand: b, etag: g.etag } });
    expect(p.status, JSON.stringify(p).slice(0, 300)).toBe(200);
    const ma = await anfrage("/api/bestand", { token: await sitzung("a1", "mitarbeiter") });
    expect(ma.bestand.mandanten[0].abweichungen[`a1|${tag(ENTWURF)}`]).toBe("F");
  });
});
