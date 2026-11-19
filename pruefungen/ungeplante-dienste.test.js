/* ==========================================================================
   STEMPELN OHNE PLAN — ungeplante Dienste im Ist (WP-13)

   Bis November 2026 ergab ein Stempel an einem Tag ohne geplanten Dienst
   zwar einen Eintrag (UNGEPLANTER_DIENST) und eine „bestätigte" Erfassung —
   aber Stundenkonto, Zuschläge und Lohnausgabe schlossen den Tag aus: Sie
   rechnen nur über die geplanten Dienste. Acht Stunden gearbeitet, null
   Stunden gezählt, ohne dass es jemand sah.

   Jetzt (Vorgaben des Koordinators):
   - Ein Dienst ohne Plan entsteht nur über /api/stempeln (der Stempel bleibt
     das unveränderliche Original, WP-06).
   - Aus Beginn und Ende wird eine Erfassung zur Prüfung (`ungeplant`,
     bestaetigt: false). Es gibt keine Planzeit, auf die sie zurückfallen
     könnte; sie zählt deshalb erst nach der Bestätigung durch die Leitung
     (Stempelkorrektur mit Grund) — dann mit der gestempelten Dauer, in
     Konto, Zuschlägen und Lohnausgabe.
   - Bis dahin steht der Fall im Hinweis (Abrechnungsdaten, Konto, Lohnblatt,
     Warnung vor der CSV) — nicht still.
   - Datenschutz (H8+) bleibt: Die Schichtverantwortung sieht für ihren
     Bereich die Ist-Zeit wie bisher, dazu nur die Marke `ungeplant`.
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { appQuelle } from "./app-quelle.js";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ungeplanterDienst, zurPruefung, istUngeplant, pruefHinweis, erfassungenZurPruefung, istZeitFuer, bestaetigungsGrund,
  UNGEPLANT_PRUEFUNG_TEXT, ZUR_PRUEFUNG_TEXT, pruefFallText } from "../src/istdaten.js";
import { berlinZeitpunkt } from "../server/lib/zeiterfassung.mjs";
import { bestandFuerRolle } from "../server/lib/rechte.mjs";
import { migriere } from "../src/migration.js";
import { personenAngleichen } from "../server/lib/gestalt.mjs";

const TAG = "2026-11-08";                    // ein Sonntag
const MONAT = "2026-11";
const WIRT = "127.0.0.1:3000";
const RAUM = "wp13-ungeplant";
let wurzel, laden, daten, sitzungAnlegen, B, A;

let nr = 0;
const anfrage = async (pfad, { methode = "POST", rumpf, token } = {}) => {
  nr += 1;
  const kopf = { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.13.${Math.floor(nr / 250) % 250}.${nr % 250}` };
  if (methode !== "GET") kopf["content-type"] = "application/json";
  if (token) kopf.authorization = `Bearer ${token}`;
  const a = await daten(new Request(`http://${WIRT}${pfad}`, { method: methode, headers: kopf,
    ...(methode === "GET" ? {} : { body: JSON.stringify(rumpf || {}) }) }), {});
  const text = await a.text();
  let d = {}; try { d = JSON.parse(text); } catch { /* leer */ }
  return { status: a.status, roh: text, ...d };
};
const person = (id, rolle = "mitarbeiter") => ({ id, vorname: "V", nachname: id.toUpperCase(), rolle, bereich: "e1",
  wochenstunden: 38.5, zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }] });
const sitzung = async (id, rolle) => (await sitzungAnlegen({ bestand: RAUM, name: id, rolle, person: id, betrieb: 0,
  mandantId: "m1", einheit: null }, 24 * 60 * 60 * 1000)).token;
const mandant = async () => (await B.bestandLesen(laden(), RAUM)).bestand.mandanten[0];
const zeitAuf = (iso) => vi.setSystemTime(new Date(iso));

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-wp13-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
  const { getStore } = await import("../server/lib/ablage.mjs");
  laden = () => getStore({ name: "centric", consistency: "strong" });
  const schutz = await import("../server/lib/schutz.mjs");
  for (const art of Object.keys(schutz.GRENZEN)) schutz.GRENZEN[art] = { ...schutz.GRENZEN[art], versuche: 100000 };
  daten = (await import("../server/funktionen/daten.mjs")).default;
  ({ sitzungAnlegen } = await import("../server/lib/sitzungen.mjs"));
  B = await import("../server/lib/bestand.mjs");
  vi.useFakeTimers({ toFake: ["Date"] });
  zeitAuf("2026-11-08T12:00:00Z");
  A = await import("../src/App.jsx");
  await B.bestandSchreiben(laden(), RAUM, { version: 9, mandanten: [{ id: "m1", name: "Haus",
    einheiten: [{ id: "e1", name: "WB 1" }],
    dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00" }],
    personen: [person("l1", "leitung"), person("s1", "subplaner"), person("a1"), person("a2"), person("a3")],
    /* a1 und a3: nichts geplant („-"), a2: Frühdienst. */
    abweichungen: { [`a1|${TAG}`]: "-", [`a3|${TAG}`]: "-", [`a2|${TAG}`]: "F" },
    abwesenheiten: [], erfassung: {}, einstempeln: {}, einstellungen: {} }] }, { durch: "Pruefung" });
}, 120000);
afterAll(async () => {
  vi.useRealTimers();
  await rm(wurzel, { recursive: true, force: true });
});

const erfassungUngeplant = (extra = {}) => ({ start: "06:00", ende: "14:00", bestaetigt: false, ungeplant: true,
  grund: "UNGEPLANT: 8 Stunden ohne geplanten Dienst — Leitung bestätigt", ...extra });

describe("istdaten: ungeplanter Dienst, Prüffall, Hinweis (Unit)", () => {
  const p = { id: "a1", zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }] };
  const mit = (e) => ({ id: "m1", erfassung: { [`a1|${TAG}`]: e } });

  it("ungeplanterDienst: nur bestätigt, nur mit der Serve-Marke, mit den gestempelten Zeiten und ohne Pause", () => {
    expect(ungeplanterDienst(mit(erfassungUngeplant({ bestaetigt: true })), p, TAG))
      .toMatchObject({ id: "_ungeplant", start: "06:00", ende: "14:00", pause: 0, ungeplant: true });
    expect(ungeplanterDienst(mit(erfassungUngeplant()), p, TAG)).toBeNull();                       // noch zur Prüfung
    expect(ungeplanterDienst(mit({ start: "06:00", ende: "14:00", bestaetigt: true, grund: "" }), p, TAG)).toBeNull();   // alte Erfassung ohne Marke (etwa nach Tausch)
    expect(ungeplanterDienst(mit(erfassungUngeplant({ bestaetigt: true, ende: "später" })), p, TAG)).toBeNull();
    expect(ungeplanterDienst(mit(erfassungUngeplant({ bestaetigt: true })), p, "2026-11-09")).toBeNull();
  });
  it("ohne Zugang zu den Ist-Daten (Rollenschutz): nicht verfügbar, nie ein ungeplanter Dienst", () => {
    const m = { ...mit(erfassungUngeplant({ bestaetigt: true })), sichtIstDaten: { umfang: "keine" } };
    expect(ungeplanterDienst(m, p, TAG)).toBeNull();
    const eigene = { ...mit(erfassungUngeplant({ bestaetigt: true })), sichtIstDaten: { umfang: "eigene", person: "a9" } };
    expect(ungeplanterDienst(eigene, p, TAG)).toBeNull();
  });
  it("zurPruefung / istUngeplant: ungeplant und lang sind Prüffälle, ein bestätigter nicht", () => {
    expect(zurPruefung(erfassungUngeplant())).toBe(true);
    expect(zurPruefung(erfassungUngeplant({ bestaetigt: true }))).toBe(false);
    expect(zurPruefung({ start: "06:00", ende: "20:30", bestaetigt: false, grund: "LANGER_DIENST: 14,5" })).toBe(true);
    expect(zurPruefung({ start: "06:00", ende: "14:00", bestaetigt: false, grund: "irgendwas" })).toBe(false);
    expect(istUngeplant(erfassungUngeplant())).toBe(true);
    expect(istUngeplant({ start: "06:00" })).toBe(false);
  });
  it("pruefHinweis: ungeplant gezählt und in Worten (nicht gezählt, keine Planzeit), gemischt mit lang", () => {
    const m = { id: "m1", erfassung: {
      [`a1|${TAG}`]: erfassungUngeplant(),
      "a2|2026-11-02": { start: "06:00", ende: "20:30", bestaetigt: false, grund: "LANGER_DIENST: 14,5 Stunden" },
      "a3|2026-11-03": { start: "06:00", ende: "14:00", bestaetigt: true, grund: "" } } };
    const hinweis = pruefHinweis(m, MONAT);
    expect(hinweis).toMatchObject({ anzahl: 2, lang: 1, ungeplant: 1,
      faelle: [{ personId: "a2", art: "lang" }, { personId: "a1", art: "ungeplant" }] });
    expect(hinweis.text).toMatch(/1 ungeplanter Dienst im November 2026 zur Prüfung/);
    expect(hinweis.text).toMatch(/nicht im Stundenkonto und nicht in der Lohnausgabe/);
    expect(hinweis.text).toMatch(/vorläufig die Planzeiten/);
    const nurUngeplant = pruefHinweis({ id: "m1", erfassung: { [`a1|${TAG}`]: erfassungUngeplant() } }, MONAT, "a1");
    expect(nurUngeplant.text).not.toMatch(/Planzeiten/);
    expect(pruefHinweis(m, MONAT, "a3")).toBeNull();
    expect(pruefFallText("ungeplant")).toBe(UNGEPLANT_PRUEFUNG_TEXT);
    expect(pruefFallText("lang")).toBe(ZUR_PRUEFUNG_TEXT);
    expect(erfassungenZurPruefung(m, MONAT).map((x) => x.personId)).toEqual(["a2", "a1"]);
  });
  it("istZeitFuer: unbestätigt ungeplant an einem Tag MIT Plan bleibt Planzeit + zurPruefung", () => {
    const da = { start: "06:00", ende: "14:00" };
    expect(istZeitFuer(mit(erfassungUngeplant()), p, TAG, da)).toMatchObject({ std: 8, erfasst: false, zurPruefung: true });
  });
});

describe("Server: /api/stempeln ohne Plan (Ereignisweg) und Bestätigung durch die Leitung", { timeout: 60000 }, () => {
  it("Beginn und Ende ohne geplanten Dienst: Stempel + Erfassung zur Prüfung (ungeplant, unbestätigt), geplanter Dienst unverändert bestätigt", async () => {
    zeitAuf("2026-11-08T05:00:00Z");                                  // 06:00 Berlin
    expect((await anfrage("/api/stempeln", { token: await sitzung("a1", "mitarbeiter"), rumpf: { art: "start" } })).status).toBe(200);
    expect((await anfrage("/api/stempeln", { token: await sitzung("a2", "mitarbeiter"), rumpf: { art: "start" } })).status).toBe(200);
    zeitAuf("2026-11-08T13:00:00Z");                                  // 14:00 Berlin
    const e1 = await anfrage("/api/stempeln", { token: await sitzung("a1", "mitarbeiter"), rumpf: { art: "ende" } });
    expect(e1.status, e1.roh).toBe(200);
    expect(e1.markierungen).toContain("UNGEPLANTER_DIENST");
    expect(e1.erfassung).toMatchObject({ start: "06:00", ende: "14:00", bestaetigt: false, ungeplant: true });
    expect(e1.erfassung.grund).toMatch(/^UNGEPLANT: 8 Stunden/);
    const e2 = await anfrage("/api/stempeln", { token: await sitzung("a2", "mitarbeiter"), rumpf: { art: "ende" } });
    expect(e2.erfassung).toEqual({ start: "06:00", ende: "14:00", bestaetigt: true, grund: "" });
    const m = await mandant();
    expect(m.erfassung[`a1|${TAG}`]).toEqual(e1.erfassung);
    expect(m.einstempeln[`a1|${TAG}`]).toMatchObject({ start: "06:00", ende: "14:00" });
  });

  it("Beschäftigte und Schichtverantwortung können den ungeplanten Dienst nicht bestätigen (403), über das Speichern auch die Leitung nicht (WP-06)", async () => {
    const korr = { personId: "a1", datum: TAG, start: "06:00", ende: "14:00", grund: "Ich war da" };
    expect((await anfrage("/api/stempel-korrektur", { token: await sitzung("a1", "mitarbeiter"), rumpf: korr })).status).toBe(403);
    expect((await anfrage("/api/stempel-korrektur", { token: await sitzung("s1", "subplaner"), rumpf: korr })).status).toBe(403);
    const r = await anfrage("/api/bestand", { methode: "GET", token: await sitzung("l1", "leitung") });
    const b = JSON.parse(JSON.stringify(r.bestand));
    b.mandanten[0].erfassung[`a1|${TAG}`] = { ...b.mandanten[0].erfassung[`a1|${TAG}`], bestaetigt: true };
    const w = await anfrage("/api/bestand", { methode: "PUT", token: await sitzung("l1", "leitung"), rumpf: { bestand: b, etag: r.etag } });
    expect([w.status, w.code]).toEqual([403, "STEMPEL_UNVERAENDERLICH"]);
    expect((await mandant()).erfassung[`a1|${TAG}`].bestaetigt).toBe(false);
  });

  it("Schichtverantwortung (H8+): Ist-Zeit des Bereichs mit Marke ungeplant, ohne Grund, ohne fremden Stempel", async () => {
    const r = await anfrage("/api/bestand", { methode: "GET", token: await sitzung("s1", "subplaner") });
    const m = r.bestand.mandanten[0];
    expect(m.erfassung[`a1|${TAG}`]).toEqual({ start: "06:00", ende: "14:00", bestaetigt: false, ungeplant: true });
    expect((m.einstempeln || {})[`a1|${TAG}`]).toBeUndefined();
    expect(r.roh).not.toMatch(/UNGEPLANT: 8 Stunden/);
  });

  it("Leitung bestätigt über die Stempelkorrektur: Marke bleibt, bestätigt, Original unverändert, Ereignis mit Grund", async () => {
    const vorher = (await mandant()).einstempeln[`a1|${TAG}`];
    const w = await anfrage("/api/stempel-korrektur", { token: await sitzung("l1", "leitung"),
      rumpf: { personId: "a1", datum: TAG, start: "06:00", ende: "14:00", grund: "Ungeplanten Dienst geprüft" } });
    expect(w.status, w.roh).toBe(200);
    const m = await mandant();
    expect(m.erfassung[`a1|${TAG}`]).toMatchObject({ start: "06:00", ende: "14:00", bestaetigt: true, ungeplant: true, korrigiert: true });
    const { korrekturen, ...original } = m.einstempeln[`a1|${TAG}`];
    expect(original).toEqual(vorher);
    expect(korrekturen).toHaveLength(1);
    expect(korrekturen[0]).toMatchObject({ vorher: { start: "06:00", ende: "14:00", bestaetigt: false },
      nachher: { start: "06:00", ende: "14:00" }, grund: "Ungeplanten Dienst geprüft", wer: { personId: "l1" } });
  });
});

describe("Konto, Zuschläge, CSV (Ist-Dauer des ungeplanten Dienstes)", () => {
  /* Ein Betrieb, wie ihn die Oberfläche anlegt; die Erfassung stammt vom Server
     (vorheriger Block) — nicht von Hand gebaut. */
  function betrieb(erfassung) {
    const m = A.leererMandant("WP-13", "pflege");
    const e = m.einheiten[0].id;
    m.personen = [{ ...A.zugangsPerson("mitarbeiter", e, 1), id: "a1", vorname: "Anna", nachname: "Ungeplant", personalnummer: "4711" }];
    m.abweichungen = { [`a1|${TAG}`]: "-" };
    m.erfassung = erfassung;
    m.einstempeln = {};
    return m;
  }
  const werte = (m) => {
    const p = m.personen[0];
    return { ist: A.istStunden(m, p, MONAT), konto: A.stundenkonto(m, p, MONAT), zus: A.zuschlagStunden(m, p, MONAT),
      saetze: A.datevSaetze(m, MONAT) };
  };
  let bestaetigt, offen;
  beforeAll(async () => {
    bestaetigt = (await mandant()).erfassung[`a1|${TAG}`];
    offen = erfassungUngeplant();
  });

  it("ohne die Erfassung: nichts gezählt (Ausgangswert)", () => {
    const w = werte(betrieb({}));
    expect(w.ist.gesamt).toBe(0);
    expect(w.zus.sonntag).toBe(0);
    expect(w.saetze.filter((s) => s.lohnart === "1410")).toEqual([]);
  });
  it("bestätigt (vom Server): 8 Stunden im Ist, im Konto, als Sonntagsstunden — und als Zeile in Lohnausgabe und CSV", () => {
    const m = betrieb({ [`a1|${TAG}`]: bestaetigt });
    const w = werte(m);
    const null0 = werte(betrieb({}));
    expect(w.ist.gesamt - null0.ist.gesamt).toBe(8);
    expect(w.ist.ungeplant).toBe(1);
    expect(Math.round((w.konto - null0.konto) * 10) / 10).toBe(8);
    expect(w.zus.sonntag).toBe(8);
    expect(w.zus.gesamt).toBe(8);
    expect(w.saetze).toContainEqual(expect.objectContaining({ personalnummer: "4711", lohnart: "1410", stunden: 8, monat: MONAT }));
    const csv = A.datevCSV(m, MONAT);
    expect(csv).toMatch(/4711;Ungeplant;Anna;1410;[^;]*;8,00;11;2026/);
    expect(A.lohnausgabeText(m, MONAT)).not.toMatch(/ACHTUNG/);
  });
  it("noch zur Prüfung: zählt nicht — aber nicht still: Hinweis, Kennzeichnung je Tag im Lohnblatt", () => {
    const m = betrieb({ [`a1|${TAG}`]: offen });
    const w = werte(m);
    expect(w.ist.gesamt).toBe(0);
    expect(w.zus.sonntag).toBe(0);
    expect(w.saetze.filter((s) => s.lohnart === "1410")).toEqual([]);
    expect(pruefHinweis(m, MONAT)).toMatchObject({ ungeplant: 1, lang: 0 });
    const blatt = A.lohnausgabeText(m, MONAT);
    expect(blatt).toMatch(/ACHTUNG: 1 ungeplanter Dienst im November 2026 zur Prüfung/);
    expect(blatt).toContain(`${TAG}  Ungeplant, Anna: ${UNGEPLANT_PRUEFUNG_TEXT}`);
  });
  it("eine alte bestätigte Erfassung an einem freien Tag ohne Marke (etwa nach einem Tausch) zählt nicht", () => {
    const w = werte(betrieb({ [`a1|${TAG}`]: { start: "06:00", ende: "14:00", bestaetigt: true, grund: "" } }));
    expect(w.ist.gesamt).toBe(0);
    expect(w.saetze.filter((s) => s.lohnart === "1410")).toEqual([]);
  });
  it("nach einer Abwesenheit an dem Tag zählt der ungeplante Dienst nicht zusätzlich", () => {
    const m = betrieb({ [`a1|${TAG}`]: bestaetigt });
    m.abwesenheiten = [{ id: "x", personId: "a1", art: "urlaub", von: TAG, bis: TAG }];
    const mit = werte(m).ist.gesamt;
    m.erfassung = {};
    expect(mit).toBe(werte(m).ist.gesamt);
  });
});

describe("Oberfläche: der gestempelte Dienst ohne Plan (UI)", () => {
  const HEUTE = TAG;
  function sitzFuer(m) {
    const mig = migriere({ version: 5, stand: 1, mandanten: [m] });
    if (!mig.ok) throw new Error(`Migration: ${mig.grund}`);
    const ms = bestandFuerRolle(personenAngleichen(mig.bestand), { rolle: "mitarbeiter", person: "a1", betrieb: 0 }).mandanten[0];
    const person = ms.personen.find((x) => x.id === "a1");
    return { rolle: "kunde", db: { mandanten: [ms], session: { mandantId: ms.id, personId: "a1", rolle: "mitarbeiter" } }, mandant: ms, person };
  }
  const text = (el) => renderToStaticMarkup(el).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const akt = new Proxy({}, { get: () => () => {} });
  function betrieb(erfassung) {
    const m = A.leererMandant("WP-13", "pflege");
    const e = m.einheiten[0].id;
    m.personen = [{ ...A.zugangsPerson("mitarbeiter", e, 1), id: "a1", vorname: "Anna", nachname: "Ungeplant" }];
    m.abweichungen = { [`a1|${HEUTE}`]: "-" };
    m.erfassung = erfassung;
    m.einstempeln = { [`a1|${HEUTE}`]: { start: "06:00", ende: "14:00" } };
    return m;
  }
  beforeAll(() => { zeitAuf(new Date(berlinZeitpunkt(HEUTE, "16:00")).toISOString()); });

  it("MHeute: nach dem Ausstempeln ohne Plan — Zeiten und „Die Leitung prüft“ (nicht „Heute frei“)", () => {
    const t = text(h(A.MHeute, { sitz: sitzFuer(betrieb({ [`a1|${HEUTE}`]: erfassungUngeplant() })), akt, setTab() {}, oeffnen() {} }));
    expect(t).toContain("Ungeplanter Dienst");
    expect(t).toContain("06:00–14:00");
    expect(t).toMatch(/Die Leitung prüft die Zeit; erst nach ihrer Bestätigung zählt sie im Stundenkonto/);
    expect(t).not.toContain("Heute frei");
  });
  it("MHeute: bestätigt — 8 h und „zählt im Stundenkonto“", () => {
    const t = text(h(A.MHeute, { sitz: sitzFuer(betrieb({ [`a1|${HEUTE}`]: erfassungUngeplant({ bestaetigt: true }) })), akt, setTab() {}, oeffnen() {} }));
    expect(t).toContain("06:00–14:00 · 8,0 h");
    expect(t).toContain("Von der Leitung bestätigt — zählt im Stundenkonto.");
  });
  it("Tagesstart (Rechner): dieselbe Aussage", () => {
    const t = text(h(A.Tagesstart, { sitz: sitzFuer(betrieb({ [`a1|${HEUTE}`]: erfassungUngeplant() })), akt, gehZu() {}, oeffneTag() {} }));
    expect(t).toContain("Ungeplanter Dienst");
    expect(t).toContain("06:00–14:00");
  });
  it("C1: an einem Tag mit Abwesenheit sagt der Hinweis ausdrücklich, dass der Dienst nicht zählt (vorher und nachher)", () => {
    const mitAbw = (erfassung) => {
      const m = betrieb(erfassung);
      m.abwesenheiten = [{ id: "x", personId: "a1", art: "urlaub", von: HEUTE, bis: HEUTE }];
      return m;
    };
    const offen = text(h(A.MHeute, { sitz: sitzFuer(mitAbw({ [`a1|${HEUTE}`]: erfassungUngeplant() })), akt, setTab() {}, oeffnen() {} }));
    expect(offen).toContain("an einem Tag mit Abwesenheit");
    expect(offen).toContain("zählt auch nach der Bestätigung nicht im Stundenkonto");
    expect(offen).not.toContain("zählt im Stundenkonto.");
    const bestaetigt = text(h(A.MHeute, { sitz: sitzFuer(mitAbw({ [`a1|${HEUTE}`]: erfassungUngeplant({ bestaetigt: true }) })), akt, setTab() {}, oeffnen() {} }));
    expect(bestaetigt).toContain("zählt wegen der Abwesenheit an diesem Tag nicht im Stundenkonto");
    expect(bestaetigt).not.toContain("Von der Leitung bestätigt — zählt im Stundenkonto.");
    expect(bestaetigt).not.toContain("8,0 h");
  });
  it("C1: Stempelbefunde der Leitung — Prüffall an einem Abwesenheitstag trägt die Warnung neben „Bestätigen“", () => {
    const m = betrieb({ [`a1|${HEUTE}`]: erfassungUngeplant() });
    m.abwesenheiten = [{ id: "x", personId: "a1", art: "urlaub", von: HEUTE, bis: HEUTE }];
    m.personen.push({ ...A.zugangsPerson("leitung", m.einheiten[0].id, 2), id: "leitung", vorname: "Lei", nachname: "Tung" });
    const mig = migriere({ version: 5, stand: 1, mandanten: [m] });
    const ms = bestandFuerRolle(personenAngleichen(mig.bestand), { rolle: "leitung", person: "leitung", betrieb: 0 }).mandanten[0];
    const sitz = { rolle: "kunde", db: { mandanten: [ms], session: { mandantId: ms.id, personId: "leitung", rolle: "leitung" } },
      mandant: ms, person: ms.personen.find((x) => x.id === "leitung") };
    const t = text(h(A.StempelBefunde, { sitz, ym: HEUTE.slice(0, 7), akt }));
    expect(t).toContain("Bestätigen");
    expect(t).toContain("Abwesenheit an diesem Tag — zählt wegen der Abwesenheit an diesem Tag nicht im Stundenkonto, auch nach der Bestätigung");
  });
  it("C2: der Grund im Korrekturereignis nennt den ungeplanten Dienst, bei einem langen Dienst den langen", () => {
    expect(bestaetigungsGrund(erfassungUngeplant())).toBe("Ungeplanter Dienst geprüft und bestätigt");
    expect(bestaetigungsGrund({ start: "06:00", ende: "20:30", bestaetigt: false, grund: "LANGER_DIENST: 14,5 Stunden" }))
      .toBe("Langer Dienst geprüft und bestätigt");
  });
  it("C2: langerDienstBestaetigen übergibt diesen Grund an den Server-Weg", async () => {
    const app = appQuelle();
    expect(app).toMatch(/return akt\.stempelKorrigieren\(pid, d, e\.start, e\.ende, bestaetigungsGrund\(e\)\);/);
  });
  it("kein Hinweis an einem Tag ohne ungeplanten Dienst", () => {
    const t = text(h(A.MHeute, { sitz: sitzFuer(betrieb({})), akt, setTab() {}, oeffnen() {} }));
    expect(t).not.toContain("Ungeplanter Dienst");
  });
  it("Stempelbefunde: der Prüffall hat seinen eigenen Text und „Bestätigen“ für die Leitung", async () => {
    const app = appQuelle();
    expect(app).toMatch(/istUngeplant\(erfassung\) \? MARKIERUNG_TEXT\.UNGEPLANT_PRUEFUNG : MARKIERUNG_TEXT\.LANGER_DIENST/);
    expect(app).toMatch(/const da = t\.dienstId \? m\.dienstarten\.find\(\(x\) => x\.id === t\.dienstId\) : ungeplantAm\(m, p, d\);/);
  });
});
