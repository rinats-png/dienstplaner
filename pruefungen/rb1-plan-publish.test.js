/* ==========================================================================
   RB-1 — VERBINDLICHE DIENSTPLANVERÖFFENTLICHUNG (plan.publish)

   Betreiberentscheidung 2026-11-11: Ausschließlich Leitung und Planung dürfen
   Dienstpläne verbindlich veröffentlichen. Andere Rollen erhalten dadurch
   keine zusätzlichen Rechte. Serverseitige Rollenprüfung, Negativtests.

   Geprüft:
   - Rechtetabelle: plan.publish nur bei leitung und planer — nie bei der Altrolle
     kunde (RB-3, Betreiberentscheidung 2026-11-11, Ergänzung), nie bei
     subplaner, mitarbeiter, betriebsrat, betreiber.
   - Jeder Schreibweg einer Freigabe (m.freigaben, m.planstaende):
     PUT /api/bestand (zusammenfuehren) je Rolle, auch mit manipuliertem
     Rumpf, und das Zurückspielen einer Sicherung.
   - Oberfläche: „Plan freigeben" erscheint genau mit dem Recht — auch in
     einem Betrieb mit gespeicherter eigener Tabelle (m.matrix), die das
     Recht nicht kennt oder es einer anderen Rolle gibt.
   ========================================================================== */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MATRIX, darf as darfServer, darfPlanFreigeben, zusammenfuehren, PLAN_FREIGEBEN_GRUND }
  from "../server/lib/rechte.mjs";
import { betriebWiederherstellen } from "../server/lib/sicherungen.mjs";
import { MATRIX_STD, ALLE_RECHTE, FESTE_RECHTE, rechteDerRolle } from "../src/lib/rollen.js";
import { darf as darfClient } from "../src/lib/berechtigung.js";

const ENTWURF = "2099-05", FREI = "2099-06";
const person = (id, rolle = "mitarbeiter", extra = {}) => ({ id, vorname: `V${id}`, nachname: `N${id}`, rolle, bereich: "e1",
  status: "aktiv", zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }], ...extra });
/* s1 ist Schichtverantwortung als Funktion an einem Tag: Rolle subplaner bzw. mitarbeiter mit Dienst. */
const betrieb = (extra = {}) => ({ id: "m1", name: "Haus", einheiten: [{ id: "e1", name: "WB" }],
  dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00" }],
  personen: [person("a1"), person("s1", "subplaner"), person("r1", "betriebsrat"), person("p1", "planer"),
    person("l1", "leitung")],
  abweichungen: { [`a1|${ENTWURF}-10`]: "F", [`s1|${ENTWURF}-10`]: "F", [`a1|${FREI}-10`]: "F" },
  freigaben: { [FREI]: { stand: 1, zeit: "01.05.2099", durch: "Lea Leitung" } },
  planstaende: { [FREI]: { "a1|2099-06-10": "F" } },
  einstellungen: {}, abwesenheiten: [], erfassung: {}, einstempeln: {}, anfragen: [], aenderungen: [], nachrichten: [],
  ...extra });
const bestand = (m = betrieb()) => ({ version: 9, stand: 1, mandanten: [m] });
const kopie = (x) => JSON.parse(JSON.stringify(x));

const SITZ = {
  leitung: { rolle: "leitung", person: "l1", betrieb: 0, mandantId: "m1" },
  planer: { rolle: "planer", person: "p1", betrieb: 0, mandantId: "m1" },
  kunde: { rolle: "kunde", person: null, betrieb: 0, mandantId: "m1" },
  subplaner: { rolle: "subplaner", person: "s1", betrieb: 0, mandantId: "m1" },
  mitarbeiter: { rolle: "mitarbeiter", person: "a1", betrieb: 0, mandantId: "m1" },
  betriebsrat: { rolle: "betriebsrat", person: "r1", betrieb: 0, mandantId: "m1" },
  betreiber: { rolle: "betreiber", person: null },
};
const NEGATIV = ["subplaner", "mitarbeiter", "betriebsrat", "betreiber", "kunde"];

/* Die manipulierten Rümpfe: neue Freigabe, erneute Freigabe (Stand erhöht), Planstand, Rücknahme. */
const MANIPULATIONEN = [
  ["neuer Monat freigegeben", (m) => { m.freigaben = { ...m.freigaben, [ENTWURF]: { stand: 1, zeit: "x", durch: "Fremd" } }; }],
  ["erneut freigegeben (Stand 2)", (m) => { m.freigaben = { ...m.freigaben, [FREI]: { stand: 2, zeit: "x", durch: "Fremd" } }; }],
  ["Planstand geschrieben", (m) => { m.planstaende = { ...m.planstaende, [ENTWURF]: { "a1|2099-05-10": "F" } }; }],
  ["Freigabe zurückgenommen", (m) => { m.freigaben = {}; }],
  ["Freigabe und Mitteilung „Plan freigegeben\" zusammen", (m) => {
    m.freigaben = { ...m.freigaben, [ENTWURF]: { stand: 1 } };
    m.planstaende = { ...m.planstaende, [ENTWURF]: {} }; }],
];

/** Das Ergebnis eines Schreibversuchs: gespeicherte Freigaben/Planstände (oder der alte Stand bei Absage). */
function schreibe(rolle, aendere) {
  const alt = bestand();
  const neu = kopie(alt);
  aendere(neu.mandanten[0]);
  const e = zusammenfuehren(alt, neu, SITZ[rolle]);
  if (!e || e.verweigert) return { abgewiesen: true, grund: e && e.verweigert, m: alt.mandanten[0] };
  return { abgewiesen: false, m: e.mandanten[0] };
}

describe("Rechtetabelle: plan.publish", () => {
  it("Server und Oberfläche kennen das Recht; dieselbe Reihenfolge in beiden Katalogen", () => {
    expect(ALLE_RECHTE).toContain("plan.publish");
    expect(MATRIX.leitung).toContain("plan.publish");
    expect(MATRIX.leitung.length).toBe(ALLE_RECHTE.length);
    expect([...MATRIX.leitung]).toEqual([...ALLE_RECHTE]);
  });
  it("nur Leitung und Planung tragen es (die Altrolle kunde nicht, RB-3)", () => {
    const mit = Object.keys(MATRIX).filter((r) => MATRIX[r].includes("plan.publish")).sort();
    expect(mit).toEqual(["leitung", "planer"]);
    const client = Object.keys(MATRIX_STD).filter((r) => MATRIX_STD[r].includes("plan.publish")).sort();
    expect(client).toEqual(["leitung", "planer"]);
  });
  it("keine andere Rolle bekommt dadurch ein Recht dazu (Listen unverändert)", () => {
    expect(MATRIX.subplaner).toEqual(["plan.view.own", "plan.view.unit", "plan.edit.unit", "req.create",
      "req.approve.unit", "staff.view", "account.view.own", "account.view.all"]);
    expect(MATRIX.mitarbeiter).toEqual(["plan.view.own", "plan.view.unit", "req.create", "account.view.own"]);
    expect(MATRIX.betriebsrat).toEqual(["plan.view.own", "plan.view.unit", "plan.view.all", "staff.view",
      "audit.view", "export.data"]);
    expect(MATRIX.planer).not.toContain("org.edit");
  });
  it("darfPlanFreigeben: ja für leitung, planer; nein für kunde, alle anderen und Unbekanntes", () => {
    for (const r of ["leitung", "planer"]) expect(darfPlanFreigeben(r), r).toBe(true);
    for (const r of [...NEGATIV, undefined, null, "", "Leitung", "__proto__", "gast"]) expect(darfPlanFreigeben(r), String(r)).toBe(false);
  });
  it("Riegel des Betriebsrats greift auch, wenn ihm jemand plan.publish in die Tabelle schreibt", () => {
    const vorher = MATRIX.betriebsrat;
    MATRIX.betriebsrat = [...vorher, "plan.publish"];
    try {
      expect(darfServer("betriebsrat", "plan.publish")).toBe(false);
      expect(darfPlanFreigeben("betriebsrat")).toBe(false);
    } finally { MATRIX.betriebsrat = vorher; }
  });
  it("auch eine versehentlich erweiterte Tabelle gibt einer Rolle ohne Vollschreibrecht keine Freigabe", () => {
    const vorher = MATRIX.subplaner;
    MATRIX.subplaner = [...vorher, "plan.publish"];
    try {
      expect(darfPlanFreigeben("subplaner")).toBe(false);
      const { abgewiesen, m } = (() => {
        const alt = bestand(); const neu = kopie(alt);
        neu.mandanten[0].freigaben[ENTWURF] = { stand: 1 };
        const e = zusammenfuehren(alt, neu, SITZ.subplaner);
        return { abgewiesen: !e || !!e.verweigert, m: e && !e.verweigert ? e.mandanten[0] : alt.mandanten[0] };
      })();
      expect(abgewiesen).toBe(true);
      expect(Object.keys(m.freigaben)).toEqual([FREI]);
    } finally { MATRIX.subplaner = vorher; }
  });
});

describe("Server: Positivfälle Leitung und Planung", () => {
  for (const rolle of ["leitung", "planer"]) {
    it(`${rolle}: gibt einen Monat frei, erneuert die Freigabe und schreibt den Planstand`, () => {
      const { abgewiesen, grund, m } = schreibe(rolle, (mm) => {
        mm.freigaben = { ...mm.freigaben, [ENTWURF]: { stand: 1, zeit: "x", durch: "Pia" }, [FREI]: { stand: 2, zeit: "y", durch: "Pia" } };
        mm.planstaende = { ...mm.planstaende, [ENTWURF]: { "a1|2099-05-10": "F" } };
      });
      expect(abgewiesen, grund).toBe(false);
      expect(Object.keys(m.freigaben).sort()).toEqual([ENTWURF, FREI]);
      expect(m.freigaben[FREI].stand).toBe(2);
      expect(m.planstaende[ENTWURF]).toEqual({ "a1|2099-05-10": "F" });
    });
  }
  it("Leitung nimmt eine Freigabe zurück (org.edit und plan.publish); die Planung nicht (bleibt wie WP-23b)", () => {
    expect(schreibe("leitung", (mm) => { mm.freigaben = {}; }).m.freigaben).toEqual({});
    expect(Object.keys(schreibe("planer", (mm) => { mm.freigaben = {}; }).m.freigaben)).toEqual([FREI]);
  });
  it("kunde (Altrolle, Probierraum): keine Freigabe mehr — ausdrückliche Absage (RB-3)", () => {
    const { abgewiesen, grund, m } = schreibe("kunde", (mm) => { mm.freigaben = { ...mm.freigaben, [ENTWURF]: { stand: 1 } }; });
    expect(abgewiesen).toBe(true);
    expect(grund).toBe(PLAN_FREIGEBEN_GRUND);
    expect(Object.keys(m.freigaben)).toEqual([FREI]);
  });
});

describe("Server: Negativfälle mit manipuliertem Rumpf — nie angewandt", () => {
  for (const rolle of NEGATIV) {
    for (const [name, aendere] of MANIPULATIONEN) {
      it(`${rolle}: ${name}`, () => {
        const { m } = schreibe(rolle, aendere);
        expect(Object.keys(m.freigaben || {}), name).toEqual([FREI]);
        expect(m.freigaben[FREI]).toMatchObject({ stand: 1, durch: "Lea Leitung" });
        expect(Object.keys(m.planstaende || {}), name).toEqual([FREI]);
      });
    }
  }
  it("Schichtverantwortung (subplaner mit Dienst am Tag, eigener Bereich): ausdrückliche Absage mit Grund", () => {
    const { abgewiesen, grund } = schreibe("subplaner", (mm) => { mm.freigaben = { ...mm.freigaben, [ENTWURF]: { stand: 1 } }; });
    expect(abgewiesen).toBe(true);
    expect(grund).toBe(PLAN_FREIGEBEN_GRUND);
    const p = schreibe("subplaner", (mm) => { mm.planstaende = { [ENTWURF]: {} }; });
    expect(p.abgewiesen).toBe(true);
    expect(p.grund).toBe(PLAN_FREIGEBEN_GRUND);
  });
  it("Beschäftigte mit Schichtverantwortung als Funktion am Tag: Freigabe ohne Wirkung", () => {
    const alt = bestand(betrieb({ personen: [person("a1"), person("s1", "mitarbeiter", { schichtverantwortung: true }),
      person("l1", "leitung")] }));
    const neu = kopie(alt);
    neu.mandanten[0].freigaben[ENTWURF] = { stand: 1 };
    neu.mandanten[0].planstaende[ENTWURF] = {};
    const e = zusammenfuehren(alt, neu, { rolle: "mitarbeiter", person: "s1", betrieb: 0, mandantId: "m1" });
    const m = !e || e.verweigert ? alt.mandanten[0] : e.mandanten[0];
    expect(Object.keys(m.freigaben)).toEqual([FREI]);
    expect(Object.keys(m.planstaende)).toEqual([FREI]);
  });
  it("Betriebsrat schreibt gar nicht; Betreiber nur Kaufmännisches", () => {
    expect(schreibe("betriebsrat", MANIPULATIONEN[0][1]).abgewiesen).toBe(true);
    const b = schreibe("betreiber", MANIPULATIONEN[0][1]);
    expect(Object.keys(b.m.freigaben)).toEqual([FREI]);
  });
  it("eine Rolle mit Vollschreibrecht, aber ohne plan.publish, bekommt eine Absage (Absicherung)", () => {
    const vorher = MATRIX.planer;
    MATRIX.planer = vorher.filter((r) => r !== "plan.publish");
    try {
      for (const [name, aendere] of MANIPULATIONEN.filter(([n]) => n !== "Freigabe zurückgenommen")) {
        const r = schreibe("planer", aendere);
        expect(r.abgewiesen, name).toBe(true);
        expect(r.grund, name).toBe(PLAN_FREIGEBEN_GRUND);
      }
      /* Zurücknehmen: der gespeicherte Eintrag kommt zurück. */
      expect(Object.keys(schreibe("planer", (mm) => { mm.freigaben = {}; }).m.freigaben)).toEqual([FREI]);
      /* Eine unveränderte Kopie stört nicht. */
      expect(schreibe("planer", () => {}).abgewiesen).toBe(false);
    } finally { MATRIX.planer = vorher; }
  });
});

describe("Server: Zurückspielen einer Sicherung", () => {
  const damals = () => betrieb({ freigaben: { [ENTWURF]: { stand: 7 } }, planstaende: { [ENTWURF]: { x: "F" } },
    einstellungen: { planFreigabePflicht: true } });
  const zurueck = (sitz) => betriebWiederherstellen(bestand(betrieb({ einstellungen: { planFreigabePflicht: true } })),
    { centric: "sicherung", fassung: 2, umfang: "betrieb", mandantId: "m1", mandant: damals() }, sitz, { marke: "2026-11-11-08-00-00" });
  it("Leitung (plan.publish): Freigaben und Planstände kommen aus der Sicherung", () => {
    const w = zurueck(SITZ.leitung);
    expect(w.verweigert, w.verweigert).toBeFalsy();
    expect(w.bestand.mandanten[0].freigaben).toEqual({ [ENTWURF]: { stand: 7 } });
  });
  it("ohne plan.publish bleiben die heutigen Freigaben und Planstände", () => {
    for (const rolle of NEGATIV) {
      const w = zurueck(SITZ[rolle]);
      if (w.verweigert) continue;
      expect(w.bestand.mandanten[0].freigaben, rolle).toEqual({ [FREI]: { stand: 1, zeit: "01.05.2099", durch: "Lea Leitung" } });
      expect(Object.keys(w.bestand.mandanten[0].planstaende), rolle).toEqual([FREI]);
    }
  });
});

/* ---- HTTP: PUT /api/bestand über den Handler ---- */
describe("HTTP PUT /api/bestand", () => {
  const WIRT = "127.0.0.1:3000", R = "rb1-raum";
  let wurzel, laden, daten, sitzungAnlegen, B, nr = 0;
  const anfrage = async (pfad, { methode = "GET", rumpf, token } = {}) => {
    nr += 1;
    const kopf = { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.71.${Math.floor(nr / 250) % 250}.${nr % 250}` };
    if (methode !== "GET") kopf["content-type"] = "application/json";
    if (token) kopf.authorization = `Bearer ${token}`;
    const a = await daten(new Request(`http://${WIRT}${pfad}`, { method: methode, headers: kopf,
      ...(methode === "GET" ? {} : { body: JSON.stringify(rumpf || {}) }) }), {});
    let d = {}; try { d = await a.json(); } catch { /* leer */ }
    return { status: a.status, ...d };
  };
  beforeAll(async () => {
    wurzel = await mkdtemp(path.join(tmpdir(), "centric-rb1-"));
    process.env.CENTRIC_DATEN = wurzel;
    process.env.CENTRIC_ABLAGE = "dateien";
    process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
    const { getStore } = await import("../server/lib/ablage.mjs");
    laden = () => getStore({ name: "centric", consistency: "strong" });
    daten = (await import("../server/funktionen/daten.mjs")).default;
    ({ sitzungAnlegen } = await import("../server/lib/sitzungen.mjs"));
    B = await import("../server/lib/bestand.mjs");
  }, 60000);
  afterAll(async () => { await rm(wurzel, { recursive: true, force: true }); });

  const versuche = async (pid, rolle) => {
    await B.bestandSchreiben(laden(), R, bestand(), { durch: "Pruefung" });
    const t = (await sitzungAnlegen({ bestand: R, name: pid, rolle, person: pid, betrieb: 0, mandantId: "m1", einheit: null },
      60 * 60 * 1000)).token;
    const g = await anfrage("/api/bestand", { token: t });
    const b = JSON.parse(JSON.stringify(g.bestand));
    b.mandanten[0].freigaben = { ...(b.mandanten[0].freigaben || {}), [ENTWURF]: { stand: 1, zeit: "x", durch: pid } };
    const p = await anfrage("/api/bestand", { methode: "PUT", token: t, rumpf: { bestand: b, etag: g.etag } });
    return { p, m: (await B.bestandLesen(laden(), R)).bestand.mandanten[0] };
  };
  for (const [pid, rolle] of [["l1", "leitung"], ["p1", "planer"]]) {
    it(`${rolle}: 200, die Freigabe ist gespeichert`, async () => {
      const { p, m } = await versuche(pid, rolle);
      expect(p.status, JSON.stringify(p).slice(0, 300)).toBe(200);
      expect(Object.keys(m.freigaben).sort()).toEqual([ENTWURF, FREI]);
    });
  }
  for (const [pid, rolle] of [["s1", "subplaner"], ["a1", "mitarbeiter"], ["r1", "betriebsrat"]]) {
    it(`${rolle}: nichts gespeichert`, async () => {
      const { p, m } = await versuche(pid, rolle);
      expect([200, 403]).toContain(p.status);
      expect(Object.keys(m.freigaben)).toEqual([FREI]);
    });
  }
});

/* ---- Oberfläche: Schaltfläche genau mit dem Recht ---- */
describe("Oberfläche: „Plan freigeben\" genau mit plan.publish", () => {
  const sitzFuer = (rolle, matrix) => ({ rolle, person: person("x", rolle, { bereich: "ALLE" }),
    mandant: { ...betrieb({ freigaben: {} }), ...(matrix === undefined ? {} : { matrix }) } });
  /* Eine gespeicherte Tabelle aus der Zeit vor RB-1 — ohne das Recht, dafür einer Schichtverantwortung angekreuzt. */
  const alteTabelle = () => {
    const t = kopie(MATRIX_STD);
    for (const r of Object.keys(t)) t[r] = t[r].filter((x) => x !== "plan.publish");
    t.subplaner = [...t.subplaner, "plan.publish"];
    t.mitarbeiter = [...t.mitarbeiter, "plan.publish"];
    return t;
  };
  it("plan.publish ist ein festes Recht", () => {
    expect(FESTE_RECHTE).toEqual(["plan.publish"]);
    expect(rechteDerRolle(alteTabelle(), "leitung")).toContain("plan.publish");
    expect(rechteDerRolle(alteTabelle(), "subplaner")).not.toContain("plan.publish");
  });
  for (const matrix of [undefined, null, "alt"]) {
    const name = matrix === "alt" ? "gespeicherte Tabelle ohne/mit falschem Recht" : `ohne Tabelle (${matrix})`;
    it(`darf(): ${name}`, () => {
      const t = matrix === "alt" ? alteTabelle() : matrix;
      for (const r of ["leitung", "planer"]) expect(darfClient(sitzFuer(r, t), "plan.publish"), r).toBe(true);
      for (const r of ["subplaner", "mitarbeiter", "betriebsrat", "kunde"]) expect(darfClient(sitzFuer(r, t), "plan.publish"), r).toBe(false);
      expect(darfClient({ ...sitzFuer("leitung", t), rolle: "betreiber" }, "plan.publish")).toBe(false);
    });
  }
  it("die Freigabeleiste zeigt die Schaltfläche genau Leitung und Planung", async () => {
    const { Freigabeleiste } = await import("../src/ansichten/freigabeleiste.jsx");
    for (const r of ["leitung", "planer", "subplaner", "mitarbeiter", "betriebsrat"]) {
      const html = renderToStaticMarkup(h(Freigabeleiste, { sitz: sitzFuer(r, alteTabelle()), ym: ENTWURF, akt: { freigeben: () => {} } }));
      expect(html.includes("Plan freigeben"), r).toBe(["leitung", "planer"].includes(r));
    }
  });
});

/* Review-Befund zu RB-1: Ein Subplaner konnte neue Mitteilungen der Art planFreigegeben ("Der Plan ist ab sofort
   verbindlich", Mail und Push an die Beschäftigten) anlegen, obwohl er den Plan nicht freigeben darf. Die Mitteilung
   darf nur schreiben, wer den Plan wirklich verbindlich freigeben darf. */
describe("gefälschte Veröffentlichungsmitteilung (Art planFreigegeben)", () => {
  const MELDUNG = { id: "n-fake-1", personId: "a1", art: "planFreigegeben", titel: "Monatsplan freigegeben", text: "Der Plan ist verbindlich." };
  const gespeichert = (rolle) => {
    const { m } = schreibe(rolle, (mm) => { mm.nachrichten = [...(mm.nachrichten || []), { ...MELDUNG }]; });
    return (m.nachrichten || []).some((n) => n.id === MELDUNG.id);
  };

  it("Leitung und Planung dürfen die Mitteilung schreiben (wie bisher)", () => {
    for (const r of ["leitung", "planer"]) expect(gespeichert(r), r).toBe(true);
  });

  it("alle übrigen Rollen: die neue Mitteilung wird nicht gespeichert", () => {
    for (const r of NEGATIV) expect(gespeichert(r), r).toBe(false);
  });

  it("andere Mitteilungsarten des Subplaners bleiben unberührt (kein Kollateralschaden)", () => {
    const { m, abgewiesen } = schreibe("subplaner", (mm) => {
      mm.nachrichten = [...(mm.nachrichten || []), { id: "n-ok-1", personId: "a1", art: "info", titel: "Hinweis" }];
    });
    expect(abgewiesen).toBe(false);
    expect((m.nachrichten || []).some((n) => n.id === "n-ok-1")).toBe(true);
  });

  it("mitteilungenVorfiltern: ohne ausdrückliche Erlaubnis gilt 'nicht erlaubt' (fail-closed)", async () => {
    const { mitteilungenVorfiltern } = await import("../server/lib/mitteilungen.mjs");
    const neu = { nachrichten: [{ ...MELDUNG }] };
    expect(mitteilungenVorfiltern({ nachrichten: [] }, neu).mandant.nachrichten).toEqual([]);
    expect(mitteilungenVorfiltern({ nachrichten: [] }, neu, { planFreigegebenErlaubt: false }).mandant.nachrichten).toEqual([]);
    expect(mitteilungenVorfiltern({ nachrichten: [] }, neu, { planFreigegebenErlaubt: true }).mandant.nachrichten).toHaveLength(1);
  });
});
