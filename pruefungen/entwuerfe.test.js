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
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
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

  /* Übergang (Review WP-23, Punkt 3): Der Filter wirkt nur, wenn der Betrieb die Freigabe benutzt
     (mindestens ein freigegebener Monat) oder einstellungen.planFreigabePflicht === true. Sonst sähen
     Beschäftigte eines bestehenden Betriebs ohne Freigaben nach dem Ausrollen keinen Einsatz mehr. */
  describe("wann der Filter wirkt", () => {
    const FUTUR = [`a1|${tag(ENTWURF)}`, `a1|${tag(FREI)}`];
    const fall = [
      ["ohne Freigaben, ohne Pflicht (bestehender Betrieb): altes Verhalten, alles sichtbar", {}, undefined, false],
      ["Pflicht ausdrücklich aus, ohne Freigaben: alles sichtbar", {}, false, false],
      ["Pflicht an, ohne jede Freigabe: Entwürfe verborgen", {}, true, true],
      ["eine Freigabe, Pflicht nie gesetzt: Entwürfe verborgen (der Betrieb benutzt die Freigabe)", { [FREI]: { stand: 1 } }, undefined, true],
      ["eine Freigabe, Pflicht ausdrücklich aus: Entwürfe verborgen", { [FREI]: { stand: 1 } }, false, true],
      ["Pflicht kein Boolean („ja“): zählt nicht, alles sichtbar", {}, "ja", false],
    ];
    for (const [name, freigaben, pflicht, verborgen] of fall) {
      it(name, () => {
        const m = betrieb({ freigaben, einstellungen: pflicht === undefined ? {} : { planFreigabePflicht: pflicht } });
        const roh = { version: 9, mandanten: [m] };
        const ma = rechte.bestandFuerRolle(roh, { rolle: "mitarbeiter", person: "a1", betrieb: 0 }).mandanten[0];
        const bestand = FUTUR.concat([`b1|${tag(ENTWURF, "11")}`]);
        for (const k of bestand) {
          const ist = ma.abweichungen[k] !== undefined;
          const soll = !(verborgen && k.includes(ENTWURF));
          const freigegeben = k.includes(FREI) && (freigaben[FREI] || !verborgen);
          expect(ist, k).toBe(k.includes(ENTWURF) ? !verborgen : (freigegeben || !verborgen) && soll);
        }
        /* Die Oberfläche erfährt es nur, wenn der Filter wirkt (abgeleitet, nie gespeichert). */
        expect(ma.sichtEntwuerfe !== undefined, "sichtEntwuerfe").toBe(verborgen);
        if (verborgen) expect(ma.sichtEntwuerfe).toEqual({ heute: S.laufenderTag() });
        /* Andere Rollen bekommen weder den Filter noch den Hinweis. */
        const br = rechte.bestandFuerRolle(roh, { rolle: "betriebsrat", person: "r1", betrieb: 0 }).mandanten[0];
        expect(br.abweichungen[`a1|${tag(ENTWURF)}`]).toBe("F");
        expect(br.sichtEntwuerfe).toBeUndefined();
        const pl = rechte.bestandFuerRolle(roh, { rolle: "planer", person: "p1", betrieb: 0 }).mandanten[0];
        expect(pl.abweichungen[`a1|${tag(ENTWURF)}`]).toBe("F");
        expect(pl.sichtEntwuerfe).toBeUndefined();
      });
    }
  });

  it("heute und früher sind in Kraft, kein Entwurf: der heutige Dienst bleibt (Einstempeln), morgen im nicht freigegebenen Monat nicht", () => {
    expect(S.laufenderTag(new Date("2026-12-31T23:30:00Z"))).toBe("2027-01-01");     // Berlin schon im neuen Jahr
    expect(S.laufenderTag(new Date("2026-11-03T10:00:00Z"))).toBe("2026-11-03");
    const heute = S.laufenderTag();
    const verschoben = (t, n) => new Date(Date.parse(`${t}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
    const gestern = verschoben(heute, -1), morgen = verschoben(heute, 1);
    /* Ohne Freigabe im Betrieb: gestern und heute sichtbar, morgen (auch im laufenden Monat) Entwurf. */
    const m = betrieb({ abweichungen: { [`a1|${gestern}`]: "F", [`a1|${heute}`]: "F", [`a1|${morgen}`]: "F" }, freigaben: {},
      einstellungen: { planFreigabePflicht: true } });
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

/* Posten- und Bereichsplan (WP-19) tragen ebenfalls „Person|Tag“-Einteilungen; objekte leiten sich aus postenPlan ab.
   Review M1: Auch sie dürfen für Beschäftigte keine Entwurfsmonate verraten. */
describe("Posten, Bereichsplan, Objekte im Entwurf", () => {
  const posten = { [`a1|${tag(ENTWURF)}`]: "p1", [`a1|${tag(FREI)}`]: "p2", [`a1|${tag(VORBEI)}`]: "p3", [`b1|${tag(FREI)}`]: "p2" };
  const bereiche = { [`a1|${tag(ENTWURF)}`]: "b1", [`a1|${tag(FREI)}`]: "b2", [`a1|${tag(VORBEI)}`]: "b3" };
  const objekte = [{ id: "o1", name: "Nur Entwurf", posten: [{ id: "p1" }] }, { id: "o2", name: "Freigegeben", posten: [{ id: "p2" }] },
    { id: "o3", name: "Vergangen", posten: [{ id: "p3" }] }];
  const sicht = (rolle, pid, extra = {}) => rechte.bestandFuerRolle({ version: 9, mandanten: [betrieb({ postenPlan: posten, bereichsPlan: bereiche, objekte, ...extra })] },
    { rolle, person: pid, betrieb: 0 }).mandanten[0];

  it("Beschäftigte: nur eigene freigegebene und vergangene Einteilungen", () => {
    const m = sicht("mitarbeiter", "a1");
    expect(Object.keys(m.postenPlan).sort()).toEqual([`a1|${tag(FREI)}`, `a1|${tag(VORBEI)}`].sort());
    expect(Object.keys(m.bereichsPlan).sort()).toEqual([`a1|${tag(FREI)}`, `a1|${tag(VORBEI)}`].sort());
    expect(JSON.stringify(m.postenPlan) + JSON.stringify(m.bereichsPlan)).not.toContain(ENTWURF);
  });
  it("objekte folgen dem gefilterten Posten-Plan: das Objekt, das nur über einen Entwurf auffindbar wäre, fehlt", () => {
    expect(sicht("mitarbeiter", "a1").objekte.map((o) => o.id).sort()).toEqual(["o2", "o3"]);
    expect(JSON.stringify(sicht("mitarbeiter", "a1"))).not.toContain("Nur Entwurf");
  });
  it("Planung und Leitung sehen alles; der Betriebsrat bekommt Posten und Bereiche nicht (wie bisher)", () => {
    for (const [rolle, pid] of [["planer", "p1"], ["leitung", "l1"]]) {
      const m = sicht(rolle, pid);
      expect(Object.keys(m.postenPlan), rolle).toContain(`a1|${tag(ENTWURF)}`);
      expect(Object.keys(m.bereichsPlan), rolle).toContain(`a1|${tag(ENTWURF)}`);
    }
    const br = sicht("betriebsrat", "r1");
    expect([Object.keys(br.postenPlan || {}).length, Object.keys(br.bereichsPlan || {}).length]).toEqual([0, 0]);
    expect((br.objekte || []).length).toBe(0);
  });
  it("Filter aus (kein Pflicht, keine Freigabe): Beschäftigte sehen wie bisher ihre eigenen Einteilungen", () => {
    const m = sicht("mitarbeiter", "a1", { freigaben: {}, einstellungen: {} });
    expect(Object.keys(m.postenPlan)).toContain(`a1|${tag(ENTWURF)}`);
    expect(m.objekte.map((o) => o.id)).toContain("o1");
  });
  it("Pflicht an, keine Freigabe: auch der Folgemonat ist Entwurf", () => {
    const m = sicht("mitarbeiter", "a1", { freigaben: {}, einstellungen: { planFreigabePflicht: true } });
    expect(Object.keys(m.postenPlan)).toEqual([`a1|${tag(VORBEI)}`]);
    expect(m.objekte.map((o) => o.id)).toEqual(["o3"]);
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

/* ---- Schalter „Planfreigabe“ (Review WP-23, Punkt 3): nur die Leitung, Form und Wann/Wer vom Server ---- */
describe("einstellungen.planFreigabePflicht schreiben", () => {
  const R2 = "wp23-schalter";
  const sitz2 = async (pid, rolle) => (await sitzungAnlegen({ bestand: R2, name: pid, rolle, person: pid, betrieb: 0,
    mandantId: "m1", einheit: null }, 60 * 60 * 1000)).token;
  const setze = async (pid, rolle, wert, extra = {}) => {
    const t = await sitz2(pid, rolle);
    const g = await anfrage("/api/bestand", { token: t });
    const b = JSON.parse(JSON.stringify(g.bestand));
    b.mandanten[0].einstellungen = { ...(b.mandanten[0].einstellungen || {}), ...(wert === undefined ? {} : { planFreigabePflicht: wert }), ...extra };
    const p = await anfrage("/api/bestand", { methode: "PUT", token: t, rumpf: { bestand: b, etag: g.etag } });
    const e = (await B.bestandLesen(laden(), R2)).bestand.mandanten[0].einstellungen || {};
    return { p, e };
  };
  beforeAll(async () => {
    await B.bestandSchreiben(laden(), R2, { version: 9, mandanten: [betrieb({ freigaben: {}, einstellungen: {} })] }, { durch: "Pruefung" });
  });

  it("die Planung darf den Schalter nicht setzen (Wert fällt weg)", async () => {
    const { e } = await setze("p1", "planer", true);
    expect(e.planFreigabePflicht).toBeUndefined();
    expect(e.planFreigabePflichtGeaendertAm).toBeUndefined();
  });
  it("Beschäftigte dürfen den Schalter nicht setzen", async () => {
    const { e } = await setze("a1", "mitarbeiter", true);
    expect(e.planFreigabePflicht).toBeUndefined();
  });
  it("kein Boolean wird abgelehnt, nichts gespeichert", async () => {
    for (const falsch of ["ja", 1, "true", {}, []]) {
      const { p, e } = await setze("l1", "leitung", falsch);
      expect(p.status, JSON.stringify(falsch)).toBeGreaterThanOrEqual(400);
      expect(e.planFreigabePflicht, JSON.stringify(falsch)).toBeUndefined();
    }
  });
  it("die Leitung schaltet ein: Wert gespeichert, Wann und Wer setzt der Server (nicht der Client)", async () => {
    const vor = Date.now();
    const { p, e } = await setze("l1", "leitung", true, { planFreigabePflichtGeaendertAm: "1999-01-01T00:00:00Z", planFreigabePflichtGeaendertVon: "fremd" });
    expect(p.status).toBe(200);
    expect(e.planFreigabePflicht).toBe(true);
    expect(e.planFreigabePflichtGeaendertVon).toBe("l1");
    expect(Date.parse(e.planFreigabePflichtGeaendertAm)).toBeGreaterThanOrEqual(vor - 1000);
  });
  it("danach wirkt der Filter ohne eine einzige Freigabe", async () => {
    const ma = await anfrage("/api/bestand", { token: await sitz2("a1", "mitarbeiter") });
    const m = ma.bestand.mandanten[0];
    expect(m.abweichungen[`a1|${tag(ENTWURF)}`]).toBeUndefined();
    expect(m.sichtEntwuerfe).toBeDefined();
  });
  it("die Planung kann den Schalter danach nicht zurücknehmen", async () => {
    const { e } = await setze("p1", "planer", false);
    expect(e.planFreigabePflicht).toBe(true);
  });
  it("ein ausdrückliches null ändert nichts: Wert, Wann und Wer bleiben", async () => {
    const vorher = (await B.bestandLesen(laden(), R2)).bestand.mandanten[0].einstellungen;
    const { e } = await setze("l1", "leitung", null);
    expect([e.planFreigabePflicht, e.planFreigabePflichtGeaendertAm, e.planFreigabePflichtGeaendertVon])
      .toEqual([vorher.planFreigabePflicht, vorher.planFreigabePflichtGeaendertAm, vorher.planFreigabePflichtGeaendertVon]);
  });
  it("ein unveränderter Wert lässt Wann und Wer unberührt; die Leitung schaltet aus", async () => {
    const vorher = (await B.bestandLesen(laden(), R2)).bestand.mandanten[0].einstellungen;
    const gleich = await setze("l1", "leitung", true);
    expect(gleich.e.planFreigabePflichtGeaendertAm).toBe(vorher.planFreigabePflichtGeaendertAm);
    const aus = await setze("l1", "leitung", false);
    expect(aus.e.planFreigabePflicht).toBe(false);
    expect(aus.e.planFreigabePflichtGeaendertVon).toBe("l1");
  });
});

/* ---- Nachtrag WP-23b (Delta-Review): `einstellungen` weglassen oder ungültig schicken schaltet nichts ab ---- */
describe("einstellungen fehlt oder ist ungültig: der gespeicherte Stand bleibt", () => {
  const R4 = "wp23b-einstellungen";
  const sitz4 = async (pid, rolle) => (await sitzungAnlegen({ bestand: R4, name: pid, rolle, person: pid, betrieb: 0,
    mandantId: "m1", einheit: null }, 60 * 60 * 1000)).token;
  const EINST = { planFreigabePflicht: true, planFreigabePflichtGeaendertAm: "2099-01-01T00:00:00.000Z",
    planFreigabePflichtGeaendertVon: "l1", jugendschutz: { mehrschichtig: true } };
  const zurueck = () => B.bestandSchreiben(laden(), R4, { version: 9,
    mandanten: [betrieb({ freigaben: {}, einstellungen: JSON.parse(JSON.stringify(EINST)) })] }, { durch: "Pruefung" });
  const schreibe = async (pid, rolle, aendere) => {
    const t = await sitz4(pid, rolle);
    const g = await anfrage("/api/bestand", { token: t });
    const b = JSON.parse(JSON.stringify(g.bestand));
    aendere(b.mandanten[0]);
    const p = await anfrage("/api/bestand", { methode: "PUT", token: t, rumpf: { bestand: b, etag: g.etag } });
    const m = (await B.bestandLesen(laden(), R4)).bestand.mandanten[0];
    return { p, m };
  };
  beforeEach(() => zurueck());
  const varianten = [
    ["weggelassen", (m) => { delete m.einstellungen; }],
    ["null", (m) => { m.einstellungen = null; }],
    ["String", (m) => { m.einstellungen = "x"; }],
    ["Zahl", (m) => { m.einstellungen = 5; }],
    ["Array", (m) => { m.einstellungen = []; }],
  ];
  for (const rolle of [["p1", "planer"], ["l1", "leitung"]]) {
    for (const [name, aendere] of varianten) {
      it(`${rolle[1]}: einstellungen ${name} — Pflicht samt Wann/Wer bleibt, fremder Entwurf bleibt verborgen`, async () => {
        const { p, m } = await schreibe(rolle[0], rolle[1], aendere);
        expect(p.status, name).toBeLessThan(500);
        expect(m.einstellungen, name).toMatchObject({ planFreigabePflicht: true,
          planFreigabePflichtGeaendertAm: EINST.planFreigabePflichtGeaendertAm, planFreigabePflichtGeaendertVon: "l1",
          jugendschutz: { mehrschichtig: true } });
        const sicht = (await anfrage("/api/bestand", { token: await sitz4("a1", "mitarbeiter") })).bestand.mandanten[0];
        expect(sicht.abweichungen[`b1|${tag(ENTWURF, "11")}`], name).toBeUndefined();
        expect(sicht.sichtEntwuerfe, name).toBeDefined();
      });
    }
  }
  for (const rolle of [["s1", "subplaner"], ["a1", "mitarbeiter"]]) {
    it(`${rolle[1]}: einstellungen weggelassen oder null — wirkungslos, Pflicht bleibt`, async () => {
      for (const [, aendere] of varianten.slice(0, 2)) {
        await zurueck();
        const { m } = await schreibe(rolle[0], rolle[1], aendere);
        expect(m.einstellungen && m.einstellungen.planFreigabePflicht).toBe(true);
      }
    });
  }
});

/* ---- Neue Betriebe starten mit der Pflicht (Review WP-23, Punkt 3) ---- */
describe("neue Betriebe", () => {
  it("der Leerbetrieb (Provisionierung, Erstbefüllung, Testräume) hat planFreigabePflicht true", async () => {
    const L = await import("../server/lib/leerbetrieb.mjs");
    const m = L.baueLeerenBetrieb({ name: "Prüfung", branche: "pflege", email: "x@example.org", land: "DE", raum: "wp23-neu", laeuftAb: "2099-01-01" });
    const betr = m.mandanten ? m.mandanten[0] : m;
    expect(betr.einstellungen.planFreigabePflicht).toBe(true);
    const roh = { version: 9, mandanten: [{ ...betr, abweichungen: { "x|2099-05-10": "F" }, personen: [person("x")] }] };
    const sicht = rechte.bestandFuerRolle(roh, { rolle: "mitarbeiter", person: "x", betrieb: 0 }).mandanten[0];
    expect(sicht.abweichungen["x|2099-05-10"]).toBeUndefined();
  });
});

/* ---- Zurückspielen einer Sicherung darf den Entwurfsschutz nicht abschalten (Nachprüfung WP-23) ---- */
describe("Wiederherstellen und Planfreigabe", () => {
  const LT = { rolle: "leitung", person: "l1", betrieb: 0, mandantId: "m1" };
  const zurueckspielen = async (jetzt, damals) => {
    const { betriebWiederherstellen } = await import("../server/lib/sicherungen.mjs");
    const w = betriebWiederherstellen({ version: 9, stand: 1, session: null, mandanten: [jetzt] },
      { centric: "sicherung", fassung: 2, umfang: "betrieb", mandantId: "m1", mandant: damals }, LT, { marke: "2026-10-01-08-00-00" });
    expect(w.verweigert, w.verweigert).toBeFalsy();
    return w.bestand.mandanten[0];
  };
  const maSicht = (m) => rechte.bestandFuerRolle({ version: 9, mandanten: [m] }, { rolle: "mitarbeiter", person: "a1", betrieb: 0 }).mandanten[0];

  it("Sicherung ohne Pflicht und ohne Freigabe: die Pflicht samt Wann/Wer bleibt, Entwürfe bleiben verborgen", async () => {
    const jetzt = betrieb({ freigaben: {}, einstellungen: { planFreigabePflicht: true,
      planFreigabePflichtGeaendertAm: "2026-10-20T08:00:00.000Z", planFreigabePflichtGeaendertVon: "l1" } });
    const damals = betrieb({ freigaben: {}, einstellungen: {} });
    const m = await zurueckspielen(jetzt, damals);
    expect(m.einstellungen).toMatchObject({ planFreigabePflicht: true, planFreigabePflichtGeaendertVon: "l1",
      planFreigabePflichtGeaendertAm: "2026-10-20T08:00:00.000Z" });
    expect(maSicht(m).abweichungen[`a1|${tag(ENTWURF)}`]).toBeUndefined();
  });
  it("Sicherung mit Pflicht aus, jetzt an: jetzt gilt", async () => {
    const jetzt = betrieb({ freigaben: {}, einstellungen: { planFreigabePflicht: true } });
    const damals = betrieb({ freigaben: {}, einstellungen: { planFreigabePflicht: false } });
    expect((await zurueckspielen(jetzt, damals)).einstellungen.planFreigabePflicht).toBe(true);
  });
  it("Filter wirkte nur über Freigaben, die Sicherung hat keine: die jetzigen Freigaben bleiben (Vereinigung), Entwürfe verborgen", async () => {
    const jetzt = betrieb({ einstellungen: {} });                         // Freigabe FREI, keine Pflicht
    const damals = betrieb({ freigaben: {}, einstellungen: {} });
    const m = await zurueckspielen(jetzt, damals);
    expect(Object.keys(m.freigaben)).toEqual([FREI]);
    expect(maSicht(m).abweichungen[`a1|${tag(ENTWURF)}`]).toBeUndefined();
  });
  it("Sicherung mit eigenen Freigaben: sie kommen zurück (Plan und Freigabe gehören zusammen), wenn der Filter ohnehin wirkt", async () => {
    const jetzt = betrieb({ einstellungen: { planFreigabePflicht: true } });
    const damals = betrieb({ freigaben: { [ENTWURF]: { stand: 1 } }, einstellungen: {} });
    expect(Object.keys((await zurueckspielen(jetzt, damals)).freigaben)).toEqual([ENTWURF]);
  });
  it("Pflicht samt Wann/Wer der Sicherung ist nicht maßgeblich: die jetzigen Werte bleiben, auch bei abweichender Sicherung", async () => {
    const jetzt = betrieb({ freigaben: {}, einstellungen: { planFreigabePflicht: true,
      planFreigabePflichtGeaendertAm: "2026-10-20T08:00:00.000Z", planFreigabePflichtGeaendertVon: "l1" } });
    const damals = betrieb({ freigaben: {}, einstellungen: { planFreigabePflicht: false,
      planFreigabePflichtGeaendertAm: "2026-01-01T00:00:00.000Z", planFreigabePflichtGeaendertVon: "p1" } });
    expect((await zurueckspielen(jetzt, damals)).einstellungen).toMatchObject({ planFreigabePflicht: true,
      planFreigabePflichtGeaendertAm: "2026-10-20T08:00:00.000Z", planFreigabePflichtGeaendertVon: "l1" });
  });
  it("Betrieb ohne Filter bleibt ohne Filter (altes Verhalten wird nicht erzwungen)", async () => {
    const jetzt = betrieb({ freigaben: {}, einstellungen: {} });
    const m = await zurueckspielen(jetzt, betrieb({ freigaben: {}, einstellungen: {} }));
    expect(maSicht(m).sichtEntwuerfe).toBeUndefined();
  });
});

/* ---- Nachtrag WP-23b (M2): Die Planung kann den Schutz nicht über `freigaben` abschalten ---- */
describe("Freigaben zurücknehmen: der Schutz rastet ein", () => {
  const R3 = "wp23b-freigaben";
  const sitz3 = async (pid, rolle) => (await sitzungAnlegen({ bestand: R3, name: pid, rolle, person: pid, betrieb: 0,
    mandantId: "m1", einheit: null }, 60 * 60 * 1000)).token;
  const zurueck = (extra = {}) => B.bestandSchreiben(laden(), R3, { version: 9,
    mandanten: [betrieb({ einstellungen: {}, ...extra })] }, { durch: "Pruefung" });
  /* aendere(m) verändert den Betrieb, den der Client zurückschickt. */
  const schreibe = async (pid, rolle, aendere) => {
    const t = await sitz3(pid, rolle);
    const g = await anfrage("/api/bestand", { token: t });
    const b = JSON.parse(JSON.stringify(g.bestand));
    aendere(b.mandanten[0]);
    const p = await anfrage("/api/bestand", { methode: "PUT", token: t, rumpf: { bestand: b, etag: g.etag } });
    const m = (await B.bestandLesen(laden(), R3)).bestand.mandanten[0];
    return { p, m };
  };
  const maSichtGespeichert = async () => {
    const t = await sitz3("a1", "mitarbeiter");
    return (await anfrage("/api/bestand", { token: t })).bestand.mandanten[0];
  };
  const keys = (m) => Object.keys(m.freigaben || {});
  beforeEach(() => zurueck());

  const varianten = [
    ["leeres Objekt", (m) => { m.freigaben = {}; }],
    ["leere Liste", (m) => { m.freigaben = []; }],
    ["Feld weggelassen", (m) => { delete m.freigaben; }],
    ["null", (m) => { m.freigaben = null; }],
    ["Freigabe auf false gesetzt", (m) => { m.freigaben = { [FREI]: false }; }],
    ["nur ungültige Schlüssel", (m) => { m.freigaben = { kaputt: { stand: 1 } }; }],
  ];
  for (const [name, aendere] of varianten) {
    it(`Planung: ${name} — die Freigabe bleibt, der Entwurf bleibt verborgen`, async () => {
      const { m } = await schreibe("p1", "planer", aendere);
      expect(keys(m), name).toEqual([FREI]);
      expect(m.freigaben[FREI]).toMatchObject({ stand: 1 });
      const sicht = await maSichtGespeichert();
      expect(sicht.abweichungen[`a1|${tag(ENTWURF)}`], name).toBeUndefined();
      expect(sicht.sichtEntwuerfe, name).toBeDefined();
    });
  }
  it("Planung: ungültige Form (Liste, Schlüssel, Wert) wird abgewiesen, nichts gespeichert", async () => {
    for (const falsch of [[], ["2099-05"], { "2099-5": { stand: 1 } }, { [ENTWURF]: "ja" }, { [ENTWURF]: [] }, { [ENTWURF]: null }, "x", 7]) {
      const { p, m } = await schreibe("p1", "planer", (mm) => { mm.freigaben = falsch; });
      expect(p.status, JSON.stringify(falsch)).toBe(403);
      expect(keys(m), JSON.stringify(falsch)).toEqual([FREI]);
    }
  });
  it("Planung: eine neue Freigabe und das Erneuern der alten gehen weiter", async () => {
    const { m } = await schreibe("p1", "planer", (mm) => { mm.freigaben = { ...mm.freigaben, [ENTWURF]: { stand: 2, zeit: "x", durch: "Pia" }, [FREI]: { stand: 5 } }; });
    expect(keys(m).sort()).toEqual([ENTWURF, FREI].sort());
    expect(m.freigaben[FREI]).toMatchObject({ stand: 5 });
  });
  it("Planung: einen von zwei Monaten entfernen — der entfernte kommt zurück", async () => {
    await zurueck({ freigaben: { [FREI]: { stand: 1 }, "2099-07": { stand: 1 } } });
    const { m } = await schreibe("p1", "planer", (mm) => { mm.freigaben = { "2099-07": { stand: 1 } }; });
    expect(keys(m).sort()).toEqual([FREI, "2099-07"].sort());
  });
  it("Planung mit Pflicht an: Entfernen ändert nichts am Wert; Pflicht bleibt", async () => {
    await zurueck({ einstellungen: { planFreigabePflicht: true } });
    const { m } = await schreibe("p1", "planer", (mm) => { mm.freigaben = {}; });
    expect(keys(m)).toEqual([FREI]);
    expect(m.einstellungen.planFreigabePflicht).toBe(true);
  });
  it("Schichtverantwortung und Beschäftigte: wirkungslos, die Freigabe bleibt", async () => {
    for (const [pid, rolle] of [["s1", "subplaner"], ["a1", "mitarbeiter"]]) {
      for (const [name, aendere] of varianten) {
        const { m } = await schreibe(pid, rolle, aendere);
        expect(keys(m), `${rolle} ${name}`).toEqual([FREI]);
        expect(m.einstellungen.planFreigabePflicht, rolle).toBeUndefined();
      }
    }
  });
  it("Schichtverantwortung: eine Änderung an freigaben wird abgewiesen oder ignoriert, nie angewandt", async () => {
    const { p, m } = await schreibe("s1", "subplaner", (mm) => { mm.freigaben = {}; });
    expect([200, 403]).toContain(p.status);
    expect(keys(m)).toEqual([FREI]);
  });

  it("Leitung nimmt die letzte Freigabe zurück: der Schutz rastet ein (Pflicht true, Wann/Wer vom Server), Entwürfe bleiben verborgen", async () => {
    const vor = Date.now();
    const { m } = await schreibe("l1", "leitung", (mm) => { mm.freigaben = {}; });
    expect(keys(m)).toEqual([]);
    expect(m.einstellungen.planFreigabePflicht).toBe(true);
    expect(m.einstellungen.planFreigabePflichtGeaendertVon).toBe("l1");
    expect(Date.parse(m.einstellungen.planFreigabePflichtGeaendertAm)).toBeGreaterThanOrEqual(vor - 1000);
    expect((await maSichtGespeichert()).abweichungen[`a1|${tag(ENTWURF)}`]).toBeUndefined();
  });
  it("Leitung: Feld weggelassen heißt nicht entfernen; nimmt sie einen von zwei Monaten zurück, bleibt der andere (kein Einrasten nötig)", async () => {
    const a = await schreibe("l1", "leitung", (mm) => { delete mm.freigaben; });
    expect(keys(a.m)).toEqual([FREI]);
    await zurueck({ freigaben: { [FREI]: { stand: 1 }, "2099-07": { stand: 1 } } });
    const b = await schreibe("l1", "leitung", (mm) => { mm.freigaben = { "2099-07": { stand: 1 } }; });
    expect(keys(b.m)).toEqual(["2099-07"]);
    expect(b.m.einstellungen.planFreigabePflicht).toBeUndefined();
  });
  it("Leitung mit Pflicht an: Rücknahme lässt Wann/Wer der Pflicht unberührt", async () => {
    await zurueck({ einstellungen: { planFreigabePflicht: true, planFreigabePflichtGeaendertAm: "2026-10-20T08:00:00.000Z", planFreigabePflichtGeaendertVon: "x1" } });
    const { m } = await schreibe("l1", "leitung", (mm) => { mm.freigaben = {}; });
    expect(keys(m)).toEqual([]);
    expect(m.einstellungen).toMatchObject({ planFreigabePflicht: true, planFreigabePflichtGeaendertVon: "x1" });
  });
  it("Betrieb ohne Filter: freigaben {} ändert nichts am Schutz (es gibt keinen), keine Pflicht wird aufgezwungen", async () => {
    await zurueck({ freigaben: {} });
    const { m } = await schreibe("p1", "planer", (mm) => { mm.freigaben = {}; });
    expect(m.einstellungen.planFreigabePflicht).toBeUndefined();
  });
  it("freigabeRuecknahmen zählt entfernte Monate (für das Betriebsprotokoll, ohne Inhalt)", () => {
    const mk = (f) => ({ mandanten: [{ id: "m1", freigaben: f }] });
    expect(rechte.freigabeRuecknahmen(mk({ a: 1, "2099-05": { stand: 1 }, "2099-06": { stand: 1 } }), mk({ "2099-06": { stand: 2 } }))).toBe(1);
    expect(rechte.freigabeRuecknahmen(mk({}), mk({ "2099-05": { stand: 1 } }))).toBe(0);
    expect(rechte.freigabeRuecknahmen(null, mk({}))).toBe(0);
  });
});
