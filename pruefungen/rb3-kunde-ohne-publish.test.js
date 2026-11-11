/* ==========================================================================
   RB-3 — DIE ALTROLLE „kunde" OHNE plan.publish UND OHNE ENDGÜLTIGE
   KRANKMELDUNGSBESTÄTIGUNG

   Betreiberentscheidung 2026-11-11 (wörtlich): „Die Rolle 'kunde' erhält auch
   im Probierraum keine Sonderrechte für 'plan.publish' oder die endgültige
   Krankmeldungsbestätigung. Ausschließlich Betriebsleiter und Planer sind dazu
   berechtigt. Demo-Funktionen sind über ausdrücklich zugewiesene Demo-Rollen
   bereitzustellen."

   Geprüft (synthetische Daten, echter Handler server/funktionen/daten.mjs):
   - Katalog: kunde = Leitung ohne plan.publish; krankSchrittErlaubt.
   - HTTP PUT /api/bestand mit manipuliertem Rumpf: kunde gibt nicht frei, gibt
     nicht erneut frei, nimmt nicht zurück, schreibt keinen Planstand, trägt
     keine Krankheit unmittelbar ein; Leitung und Planung weiterhin.
   - HTTP POST /api/krankmeldung: kunde bestätigt nicht endgültig und lehnt
     nicht ab (auch mit Rolle im Rumpf); Leitung und Planung weiterhin.
   - Demo: ein Demozugang mit ausdrücklicher Rolle leitung/planer (demo: true)
     gibt weiterhin frei und bestätigt endgültig.
   - Oberfläche: Zugang „kunde" mit im Rollenwähler gewählter Leitungsperson
     bekommt weder „Plan freigeben" noch „endgültig"/„ablehnen" angeboten.
   ========================================================================== */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MATRIX, KUNDE_OHNE, darfPlanFreigeben, zusammenfuehren, schreibumfang, PLAN_FREIGEBEN_GRUND, KRANK_ENDGUELTIG_GRUND }
  from "../server/lib/rechte.mjs";
import { krankSchrittErlaubt, KRANK_STATUS } from "../server/lib/krankmeldung.mjs";
import { darf as darfClient, krankRolle, KUNDE_OHNE as KUNDE_OHNE_CLIENT } from "../src/lib/berechtigung.js";
import { krankSchritteFuer } from "../src/ansichten/krankmeldungen-offen.jsx";
import { heuteBerlin, tagePlus } from "../server/lib/zeiterfassung.mjs";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const quelle = (p) => readFile(path.join(WURZEL, p), "utf8");
const HEUTE = heuteBerlin();
const T = (n) => tagePlus(HEUTE, n);
const ENTWURF = "2099-05", FREI = "2099-06";
const person = (id, rolle = "mitarbeiter", extra = {}) => ({ id, vorname: `V${id}`, nachname: `N${id}`, rolle, bereich: "e1",
  status: "aktiv", zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }], ...extra });
const betrieb = (extra = {}) => ({ id: "m1", name: "Haus", einheiten: [{ id: "e1", name: "WB" }],
  dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00" }],
  personen: [person("a1"), person("a2"), person("s1", "subplaner"), person("p1", "planer", { bereich: "ALLE" }),
    person("l1", "leitung", { bereich: "ALLE" })],
  abweichungen: { [`a1|${ENTWURF}-10`]: "F", [`a1|${FREI}-10`]: "F" },
  freigaben: { [FREI]: { stand: 1, zeit: "01.05.2099", durch: "Lea Leitung" } },
  planstaende: { [FREI]: { "a1|2099-06-10": "F" } },
  einstellungen: {}, abwesenheiten: [{ id: "u1", personId: "a2", art: "urlaub", von: T(20), bis: T(21), notiz: "" }],
  krankmeldungen: [], erfassung: {}, einstempeln: {}, anfragen: [], aenderungen: [], nachrichten: [],
  ...extra });
const bestand = (m = betrieb()) => ({ version: 9, stand: 1, mandanten: [m] });
const kopie = (x) => JSON.parse(JSON.stringify(x));

/* ---------------------------- Katalog ---------------------------- */
describe("Katalog: kunde ohne plan.publish und ohne endgültige Krankmeldungsschritte", () => {
  it("MATRIX.kunde = MATRIX.leitung ohne plan.publish; Schreibumfang unverändert voll", () => {
    expect([...KUNDE_OHNE]).toEqual(["plan.publish"]);
    expect([...KUNDE_OHNE_CLIENT]).toEqual(["plan.publish"]);
    expect(MATRIX.kunde).not.toContain("plan.publish");
    expect(MATRIX.kunde).toEqual(MATRIX.leitung.filter((r) => r !== "plan.publish"));
    expect(schreibumfang("kunde")).toBe("voll");
    expect(darfPlanFreigeben("kunde")).toBe(false);
    for (const r of ["leitung", "planer"]) expect(darfPlanFreigeben(r), r).toBe(true);
  });
  it("krankSchrittErlaubt: kunde meldet und zieht zurück, bestätigt aber weder endgültig noch lehnt ab", () => {
    expect(krankSchrittErlaubt("kunde", "melden")).toBe(true);
    expect(krankSchrittErlaubt("kunde", "zurueckziehen")).toBe(true);
    for (const s of ["vorlaeufig", "endgueltig", "ablehnen"]) expect(krankSchrittErlaubt("kunde", s), s).toBe(false);
    for (const r of ["leitung", "planer"]) for (const s of ["endgueltig", "ablehnen"]) expect(krankSchrittErlaubt(r, s), `${r} ${s}`).toBe(true);
  });
});

/* ------------------- zusammenführen: unmittelbar eingetragene Krankheit ------------------- */
describe("PUT-Kern: Krank-Abwesenheit unmittelbar eintragen", () => {
  const SITZ = { kunde: { rolle: "kunde", person: null, betrieb: 0, mandantId: "m1" },
    leitung: { rolle: "leitung", person: "l1", betrieb: 0, mandantId: "m1" },
    planer: { rolle: "planer", person: "p1", betrieb: 0, mandantId: "m1" } };
  const schreibe = (rolle, aendere, alt = bestand()) => {
    const neu = kopie(alt); aendere(neu.mandanten[0]);
    return zusammenfuehren(alt, neu, SITZ[rolle]);
  };
  const KRANK = { id: "k-neu", personId: "a1", art: "krank", von: T(2), bis: T(3), notiz: "" };
  it("Leitung und Planung: neue Krankheit gespeichert (das ist die endgültige Bestätigung)", () => {
    for (const r of ["leitung", "planer"]) {
      const e = schreibe(r, (m) => { m.abwesenheiten.push({ ...KRANK }); });
      expect(e.verweigert, r).toBeFalsy();
      expect(e.mandanten[0].abwesenheiten.some((a) => a.id === "k-neu"), r).toBe(true);
    }
  });
  it("kunde: neue Krankheit, verlängerte Krankheit, Urlaub zu krank — Absage mit Grund", () => {
    expect(schreibe("kunde", (m) => { m.abwesenheiten.push({ ...KRANK }); }).verweigert).toBe(KRANK_ENDGUELTIG_GRUND);
    expect(schreibe("kunde", (m) => { m.abwesenheiten[0].art = "krank"; }).verweigert).toBe(KRANK_ENDGUELTIG_GRUND);
    const mitKrank = bestand(betrieb({ abwesenheiten: [{ ...KRANK, id: "k-alt" }] }));
    expect(schreibe("kunde", (m) => { m.abwesenheiten[0].bis = T(9); }, mitKrank).verweigert).toBe(KRANK_ENDGUELTIG_GRUND);
    expect(schreibe("kunde", (m) => { m.abwesenheiten[0].personId = "a2"; }, mitKrank).verweigert).toBe(KRANK_ENDGUELTIG_GRUND);
  });
  /* Review PR #206 (L): eine wirksame Krankheit mittelbar aufheben ist wie der Endschritt nur Planung und Leitung. */
  const KRANK_WIRKSAM = { ...KRANK, id: "k-alt", halbtag: false, stunden: 8 };
  const AUFHEBEN = [
    ["entfernt", (m) => { m.abwesenheiten = m.abwesenheiten.filter((a) => a.id !== "k-alt"); }],
    ["Art krank → urlaub", (m) => { m.abwesenheiten.find((a) => a.id === "k-alt").art = "urlaub"; }],
    ["halber Tag geändert", (m) => { m.abwesenheiten.find((a) => a.id === "k-alt").halbtag = true; }],
    ["Stunden geändert", (m) => { m.abwesenheiten.find((a) => a.id === "k-alt").stunden = 4; }],
    ["Feld entfernt", (m) => { delete m.abwesenheiten.find((a) => a.id === "k-alt").stunden; }],
    ["Feld hinzugefügt", (m) => { m.abwesenheiten.find((a) => a.id === "k-alt").ende = "12:00"; }],
    ["von verschoben", (m) => { m.abwesenheiten.find((a) => a.id === "k-alt").von = T(1); }],
  ];
  for (const [name, aendere] of AUFHEBEN) {
    it(`wirksame Krankheit ${name}: kunde Absage, Leitung und Planung gespeichert`, () => {
      const alt = bestand(betrieb({ abwesenheiten: [{ ...KRANK_WIRKSAM }, { id: "u1", personId: "a2", art: "urlaub", von: T(20), bis: T(21), notiz: "" }] }));
      expect(schreibe("kunde", aendere, alt).verweigert, name).toBe(KRANK_ENDGUELTIG_GRUND);
      for (const r of ["leitung", "planer"]) expect(schreibe(r, aendere, alt).verweigert, `${r} ${name}`).toBeFalsy();
    });
  }
  it("kunde: übrige Rechte unverändert — Urlaub anlegen/ändern/entfernen, Krankheit unverändert, Anmerkung, Feldreihenfolge", () => {
    expect(schreibe("kunde", (m) => { m.abwesenheiten[0].bis = T(22); }).verweigert).toBeFalsy();
    expect(schreibe("kunde", (m) => { m.abwesenheiten.push({ id: "u2", personId: "a1", art: "urlaub", von: T(30), bis: T(31), notiz: "" }); }).verweigert).toBeFalsy();
    const mitKrank = bestand(betrieb({ abwesenheiten: [{ ...KRANK_WIRKSAM }, { id: "u1", personId: "a2", art: "urlaub", von: T(20), bis: T(21), notiz: "" }] }));
    expect(schreibe("kunde", () => {}, mitKrank).verweigert).toBeFalsy();
    expect(schreibe("kunde", (m) => { m.abwesenheiten[0].notiz = "geändert"; }, mitKrank).verweigert).toBeFalsy();
    expect(schreibe("kunde", (m) => { const a = m.abwesenheiten[0]; m.abwesenheiten[0] = Object.fromEntries(Object.entries(a).reverse()); }, mitKrank).verweigert).toBeFalsy();
    const weg = schreibe("kunde", (m) => { m.abwesenheiten = m.abwesenheiten.filter((a) => a.id !== "u1"); }, mitKrank);
    expect(weg.verweigert).toBeFalsy();
    expect(weg.mandanten[0].abwesenheiten.map((a) => a.id)).toEqual(["k-alt"]);
  });
});

/* Review PR #206 (M): einstellungen.planFreigabePflicht entscheidet, ob Entwürfe vor Beschäftigten verborgen sind. */
describe("PUT-Kern: Planfreigabe-Pflicht umlegen nur mit plan.publish", () => {
  const SITZ = { kunde: { rolle: "kunde", person: null, betrieb: 0, mandantId: "m1" },
    leitung: { rolle: "leitung", person: "l1", betrieb: 0, mandantId: "m1" },
    planer: { rolle: "planer", person: "p1", betrieb: 0, mandantId: "m1" } };
  const mit = (pflicht, freigaben = {}) => bestand(betrieb({ einstellungen: { planFreigabePflicht: pflicht }, freigaben, planstaende: {} }));
  const umlegen = (rolle, alt, wert) => {
    const neu = kopie(alt); neu.mandanten[0].einstellungen.planFreigabePflicht = wert;
    return zusammenfuehren(alt, neu, SITZ[rolle]);
  };
  it("kunde: aus- und einschalten → Absage mit Grund; die Entwürfe bleiben verborgen", async () => {
    const { planFreigabeAktiv } = await import("../server/lib/planfreigabe.mjs");
    const aus = umlegen("kunde", mit(true), false);
    expect(aus.verweigert).toBe(PLAN_FREIGEBEN_GRUND);
    expect(umlegen("kunde", mit(false), true).verweigert).toBe(PLAN_FREIGEBEN_GRUND);
    expect(planFreigabeAktiv(mit(true).mandanten[0])).toBe(true);
  });
  it("kunde: unveränderter Schalter stört nicht", () => {
    expect(umlegen("kunde", mit(true), true).verweigert).toBeFalsy();
  });
  it("Leitung schaltet weiterhin aus und ein; Planung (ohne org.edit) wie bisher ohne Wirkung", () => {
    const aus = umlegen("leitung", mit(true), false);
    expect(aus.verweigert).toBeFalsy();
    expect(aus.mandanten[0].einstellungen.planFreigabePflicht).toBe(false);
    expect(umlegen("leitung", mit(false), true).mandanten[0].einstellungen.planFreigabePflicht).toBe(true);
    const p = umlegen("planer", mit(true), false);
    expect(p.verweigert).toBeFalsy();
    expect(p.mandanten[0].einstellungen.planFreigabePflicht).toBe(true);
  });
  it("Oberfläche: Schalter und Aufgabe nur mit plan.publish", async () => {
    const { PlanFreigabeSchalter } = await import("../src/ansichten/planfreigabeschalter.jsx");
    const M = mit(false).mandanten[0];
    const s = (z) => ({ rolle: "kunde", mandant: M, zugangRolle: z, person: person("x", "leitung", { bereich: "ALLE" }) });
    const html = (z) => renderToStaticMarkup(h(PlanFreigabeSchalter, { sitz: s(z), akt: { setzePlanFreigabePflicht: () => {} } }));
    expect(html("kunde")).not.toContain("Planfreigabe aktivieren");
    expect(html("leitung")).toContain("Planfreigabe aktivieren");
    expect(await quelle("src/lib/fachlogik.js")).toMatch(/darf\(sitz, "org\.edit"\) && darf\(sitz, "plan\.publish"\) && !planFreigabeAktiv\(m\)/);
  });
});

/* ---------------------------- HTTP ---------------------------- */
describe("HTTP über den Handler: PUT /api/bestand und POST /api/krankmeldung", () => {
  const WIRT = "127.0.0.1:3000", R = "rb3-raum";
  let wurzel, laden, daten, sitzungAnlegen, B, nr = 0;
  const anfrage = async (pfad, { methode = "GET", rumpf, token } = {}) => {
    nr += 1;
    const kopf = { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.73.${Math.floor(nr / 250) % 250}.${nr % 250}` };
    if (methode !== "GET") kopf["content-type"] = "application/json";
    if (token) kopf.authorization = `Bearer ${token}`;
    const a = await daten(new Request(`http://${WIRT}${pfad}`, { method: methode, headers: kopf,
      ...(methode === "GET" ? {} : { body: JSON.stringify(rumpf || {}) }) }), {});
    let d = {}; try { d = await a.json(); } catch { /* leer */ }
    return { status: a.status, ...d };
  };
  /* kunde ohne Person: die Rolle des Zugangs gilt (wirksameRolle); mit Person gälte deren Rolle. */
  const tok = async (pid, rolle, extra = {}) => (await sitzungAnlegen({ bestand: R, name: pid || "kunde", rolle, person: pid,
    betrieb: 0, mandantId: "m1", einheit: null, ...extra }, 60 * 60 * 1000)).token;
  const gespeichert = async () => (await B.bestandLesen(laden(), R)).bestand.mandanten[0];
  const zuruecksetzen = (m = betrieb()) => B.bestandSchreiben(laden(), R, bestand(m), { durch: "Pruefung" });
  const put = async (t, aendere) => {
    const g = await anfrage("/api/bestand", { token: t });
    expect(g.status, JSON.stringify(g).slice(0, 200)).toBe(200);
    const b = kopie(g.bestand);
    aendere(b.mandanten[0]);
    return anfrage("/api/bestand", { methode: "PUT", token: t, rumpf: { bestand: b, etag: g.etag } });
  };
  const MANIPULATIONEN = [
    ["neuer Monat freigegeben", (m) => { m.freigaben = { ...m.freigaben, [ENTWURF]: { stand: 1, zeit: "x", durch: "Fremd" } }; }],
    ["erneut freigegeben (Stand 2)", (m) => { m.freigaben = { ...m.freigaben, [FREI]: { stand: 2, zeit: "x", durch: "Fremd" } }; }],
    ["Planstand geschrieben", (m) => { m.planstaende = { ...m.planstaende, [ENTWURF]: { "a1|2099-05-10": "F" } }; }],
    ["Freigabe zurückgenommen", (m) => { m.freigaben = {}; }],
  ];

  beforeAll(async () => {
    wurzel = await mkdtemp(path.join(tmpdir(), "centric-rb3-"));
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

  for (const demo of [false, true]) {
    for (const [name, aendere] of MANIPULATIONEN) {
      it(`kunde${demo ? " (Demozugang)" : ""}: ${name} — nicht gespeichert`, async () => {
        await zuruecksetzen();
        const p = await put(await tok(null, "kunde", demo ? { demo: true } : {}), aendere);
        expect([200, 403]).toContain(p.status);
        const m = await gespeichert();
        expect(Object.keys(m.freigaben)).toEqual([FREI]);
        expect(m.freigaben[FREI]).toMatchObject({ stand: 1, durch: "Lea Leitung" });
        expect(Object.keys(m.planstaende)).toEqual([FREI]);
      });
    }
  }
  it("kunde: Freigabe und erneute Freigabe bekommen 403 mit Grund", async () => {
    await zuruecksetzen();
    const t = await tok(null, "kunde");
    for (const [, aendere] of MANIPULATIONEN.slice(0, 3)) {
      const p = await put(t, aendere);
      expect(p.status).toBe(403);
      expect(JSON.stringify(p)).toContain(PLAN_FREIGEBEN_GRUND);
    }
  });
  for (const [pid, rolle, demo] of [["l1", "leitung", false], ["p1", "planer", false], ["l1", "leitung", true], ["p1", "planer", true]]) {
    it(`${rolle}${demo ? " (Demozugang, ausdrückliche Rolle)" : ""}: gibt frei und erneut frei — 200, gespeichert`, async () => {
      await zuruecksetzen();
      const t = await tok(pid, rolle, demo ? { demo: true } : {});
      const p = await put(t, (m) => { m.freigaben = { ...m.freigaben, [ENTWURF]: { stand: 1, zeit: "x", durch: pid },
        [FREI]: { stand: 2, zeit: "y", durch: pid } }; });
      expect(p.status, JSON.stringify(p).slice(0, 300)).toBe(200);
      const m = await gespeichert();
      expect(Object.keys(m.freigaben).sort()).toEqual([ENTWURF, FREI]);
      expect(m.freigaben[FREI].stand).toBe(2);
    });
  }
  it("Leitung nimmt eine Freigabe weiterhin zurück", async () => {
    await zuruecksetzen();
    const p = await put(await tok("l1", "leitung"), (m) => { m.freigaben = {}; });
    expect(p.status, JSON.stringify(p).slice(0, 300)).toBe(200);
    expect((await gespeichert()).freigaben).toEqual({});
  });
  it("kunde: Krankheit unmittelbar eintragen — 403, keine Abwesenheit; Leitung: 200", async () => {
    await zuruecksetzen();
    const KRANK = { id: "k-http", personId: "a1", art: "krank", von: T(2), bis: T(3), notiz: "" };
    const p = await put(await tok(null, "kunde"), (m) => { m.abwesenheiten = [...m.abwesenheiten, { ...KRANK }]; });
    expect(p.status).toBe(403);
    expect((await gespeichert()).abwesenheiten.some((a) => a.art === "krank")).toBe(false);
    const l = await put(await tok("l1", "leitung"), (m) => { m.abwesenheiten = [...m.abwesenheiten, { ...KRANK }]; });
    expect(l.status, JSON.stringify(l).slice(0, 300)).toBe(200);
    expect((await gespeichert()).abwesenheiten.some((a) => a.id === "k-http" && a.art === "krank")).toBe(true);
  });

  it("Planfreigabe-Pflicht ausschalten: kunde 403 (Entwürfe bleiben verborgen), Leitung 200", async () => {
    const m0 = betrieb({ einstellungen: { planFreigabePflicht: true } });
    await zuruecksetzen(m0);
    const k = await put(await tok(null, "kunde"), (m) => { m.einstellungen = { ...m.einstellungen, planFreigabePflicht: false }; });
    expect(k.status).toBe(403);
    expect((await gespeichert()).einstellungen.planFreigabePflicht).toBe(true);
    const l = await put(await tok("l1", "leitung"), (m) => { m.einstellungen = { ...m.einstellungen, planFreigabePflicht: false }; });
    expect(l.status, JSON.stringify(l).slice(0, 300)).toBe(200);
    expect((await gespeichert()).einstellungen.planFreigabePflicht).toBe(false);
  });
  it("wirksame Krankheit entfernen oder zu Urlaub machen: kunde 403, Planung 200", async () => {
    const KR = { id: "k-w", personId: "a1", art: "krank", von: T(2), bis: T(3), notiz: "" };
    for (const aendere of [(m) => { m.abwesenheiten = m.abwesenheiten.filter((a) => a.id !== "k-w"); },
      (m) => { m.abwesenheiten.find((a) => a.id === "k-w").art = "urlaub"; }]) {
      await zuruecksetzen(betrieb({ abwesenheiten: [{ ...KR }] }));
      expect((await put(await tok(null, "kunde"), aendere)).status).toBe(403);
      expect((await gespeichert()).abwesenheiten).toEqual([KR]);
      const p = await put(await tok("p1", "planer"), aendere);
      expect(p.status, JSON.stringify(p).slice(0, 300)).toBe(200);
      expect((await gespeichert()).abwesenheiten.some((a) => a.id === "k-w" && a.art === "krank")).toBe(false);
    }
  });

  const fall = (id, status = KRANK_STATUS.EINGEGANGEN) =>({ id, personId: "a1", von: T(2), bis: T(2), notiz: "", status,
    erstellt: new Date().toISOString(), verlauf: [{ schritt: "eingegangen", von: "a1", rolle: "mitarbeiter", zeit: new Date().toISOString() }] });
  const km = async (t, rumpf) => anfrage("/api/krankmeldung", { methode: "POST", token: t, rumpf });

  for (const aktion of ["endgueltig", "ablehnen"]) {
    it(`kunde: ${aktion} — 403 auch mit manipuliertem Rumpf; Fall bleibt offen, keine Abwesenheit`, async () => {
      await zuruecksetzen(betrieb({ krankmeldungen: [fall("km-1"), fall("km-2", KRANK_STATUS.VORLAEUFIG)] }));
      for (const demo of [false, true]) {
        const t = await tok(null, "kunde", demo ? { demo: true } : {});
        for (const id of ["km-1", "km-2"]) {
          const r = await km(t, { aktion, id, rolle: "leitung", status: "endgueltig_bestaetigt", personId: "l1" });
          expect(r.status, `${aktion} ${id} demo=${demo}`).toBe(403);
        }
      }
      const m = await gespeichert();
      expect(m.krankmeldungen.map((f) => f.status)).toEqual([KRANK_STATUS.EINGEGANGEN, KRANK_STATUS.VORLAEUFIG]);
      expect(m.abwesenheiten.some((a) => a.art === "krank")).toBe(false);
    });
  }
  for (const [pid, rolle, demo] of [["l1", "leitung", false], ["p1", "planer", false], ["l1", "leitung", true], ["p1", "planer", true]]) {
    it(`${rolle}${demo ? " (Demozugang)" : ""}: bestätigt endgültig und lehnt ab — 200`, async () => {
      await zuruecksetzen(betrieb({ krankmeldungen: [fall("km-1"), fall("km-2")] }));
      const t = await tok(pid, rolle, demo ? { demo: true } : {});
      const e = await km(t, { aktion: "endgueltig", id: "km-1" });
      expect(e.status, JSON.stringify(e).slice(0, 300)).toBe(200);
      const a = await km(t, { aktion: "ablehnen", id: "km-2" });
      expect(a.status, JSON.stringify(a).slice(0, 300)).toBe(200);
      const m = await gespeichert();
      expect(m.krankmeldungen.map((f) => f.status)).toEqual([KRANK_STATUS.ENDGUELTIG, KRANK_STATUS.ABGELEHNT]);
      expect(m.abwesenheiten.some((x) => x.art === "krank" && x.personId === "a1")).toBe(true);
    });
  }
});

/* ---------------------------- Oberfläche ---------------------------- */
describe("Oberfläche: Zugang „kunde\" mit gewählter Leitungsperson", () => {
  const M = betrieb();
  const sitzFuer = (personRolle, zugangRolle) => ({ rolle: "kunde", mandant: M, zugangRolle,
    person: person("x", personRolle, { bereich: "ALLE" }) });
  it("darf(): plan.publish nein für den Kundenzugang, alle übrigen Rechte der Leitung ja", () => {
    for (const z of ["kunde"]) {
      expect(darfClient(sitzFuer("leitung", z), "plan.publish")).toBe(false);
      expect(darfClient(sitzFuer("planer", z), "plan.publish")).toBe(false);
      for (const recht of ["org.edit", "staff.edit", "plan.edit.all", "roles.assign"]) expect(darfClient(sitzFuer("leitung", z), recht), recht).toBe(true);
    }
    for (const z of ["leitung", "planer", null, undefined]) expect(darfClient(sitzFuer("leitung", z), "plan.publish"), String(z)).toBe(true);
    expect(darfClient(sitzFuer("planer", "planer"), "plan.publish")).toBe(true);
  });
  it("krankRolle: kunde für den Kundenzugang, sonst die Rolle der Person", () => {
    expect(krankRolle(sitzFuer("leitung", "kunde"))).toBe("kunde");
    expect(krankRolle(sitzFuer("leitung", "leitung"))).toBe("leitung");
    expect(krankRolle(sitzFuer("planer", undefined))).toBe("planer");
    expect(krankRolle(null)).toBe(null);
  });
  it("Freigabeleiste: keine Schaltfläche „Plan freigeben\" für den Kundenzugang; Leitung und Planung ja", async () => {
    const { Freigabeleiste } = await import("../src/ansichten/freigabeleiste.jsx");
    const zeig = (s) => renderToStaticMarkup(h(Freigabeleiste, { sitz: s, ym: ENTWURF, akt: { freigeben: () => {} } }));
    expect(zeig(sitzFuer("leitung", "kunde"))).not.toContain("Plan freigeben");
    expect(zeig(sitzFuer("leitung", "leitung"))).toContain("Plan freigeben");
    expect(zeig(sitzFuer("planer", "planer"))).toContain("Plan freigeben");
  });
  it("offene Krankmeldungen: dem Kundenzugang weder „endgültig“ noch „ablehnen“; Leitung und Planung beides", () => {
    const f = (status) => ({ id: "km", personId: "a1", status, von: T(2), bis: T(2) });
    for (const st of [KRANK_STATUS.EINGEGANGEN, KRANK_STATUS.VORLAEUFIG]) {
      expect(krankSchritteFuer(sitzFuer("leitung", "kunde"), f(st))).toEqual([]);
      expect(krankSchritteFuer(sitzFuer("leitung", "leitung"), f(st))).toEqual(["endgueltig", "ablehnen"]);
      expect(krankSchritteFuer(sitzFuer("planer", "planer"), f(st))).toEqual(["endgueltig", "ablehnen"]);
    }
  });
  it("die Rolle des Zugangs kommt in die Sitzung; Krankmeldung, Aufgaben und Melden fragen krankRolle", async () => {
    expect(await quelle("src/App.jsx")).toMatch(/person: p, zugangRolle: \(SP\.zugangsdaten\(\) \|\| \{\}\)\.rolle \|\| null/);
    expect(await quelle("src/ansichten/krankmeldung.jsx")).toMatch(/krankSchrittErlaubt\(krankRolle\(sitz\), "endgueltig"\)/);
    expect(await quelle("src/app/aktionen/plan.js")).toMatch(/krankmelden: [^\n]*krankSchrittErlaubt\(krankRolle\(sitz\), "endgueltig"\)/);
    const fl = await quelle("src/lib/fachlogik.js");
    expect(fl).toMatch(/krankSchrittErlaubt\(krankRolle\(sitz\), "endgueltig"\)/);
    expect(fl).toMatch(/krankSchrittErlaubt\(krankRolle\(sitz\), "vorlaeufig"\)/);
    expect(fl).not.toMatch(/krankSchrittErlaubt\(sitz\.person && sitz\.person\.rolle/);
  });
});
