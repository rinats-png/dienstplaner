/* ==========================================================================
   WP-I8 — ERFÜLLUNGSBERICHT IN DER ANTWORT DES PLANVORSCHLAGS (Server-Verdrahtung)
   POST /api/planer-vorschlag liefert zusätzlich `bericht` (erfuellungsbericht aus server/lib/engine/erfuellungsbericht.mjs) und `berichtGrund`.

   Nur synthetische Daten, Uhr fest (vi.useFakeTimers, nur Date). PLANER_AN bleibt im Code AUS; die Prüfung gibt den Planer nur über den
   Prüf-Zugang frei (vi.mock von engine/planer.mjs, Schalter globalThis.__planerFreiPruefung) — nie über die Anfrage. Der Zähler der Berichte
   läuft über den Prüf-Haken `_pruefhaken.bericht` (wirkt nur unter vitest).
   1. Antwort: Bericht zum selben Ergebnis (ein Planlauf, ein Bericht), Schlüssel- und Werte-Positivliste, keine Personenkennung, kein Name,
      kein Person|Tag, keine Prozente; Antwort abwärtskompatibel (alle bisherigen Felder unverändert).
   2. Rechte: nur Leitung und Planung; Schichtverantwortung, Betriebsrat, Beschäftigte, Kundenrolle, Demo: 403 ohne Rechnung; Planer aus: nichts gerechnet.
   3. Kein Bericht (aufwand, ergebnis_passt_nicht, fehler, Ausnahme, ungültige Form): `bericht: null` mit fester Kennung, der Vorschlag bleibt gültig.
   4. Der Client kann keinen Bericht einreichen; der Bericht wird am Server nicht gehalten; Mandantentrennung.
   Aufruf: TZ=UTC npx vitest run pruefungen/intelligence-planer-bericht-aktion.test.js
   ========================================================================== */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { baueLeerenBetrieb } from "../server/lib/leerbetrieb.mjs";

vi.mock("../server/lib/engine/planer.mjs", async (original) => {
  const o = /** @type {any} */ (await original());
  return { ...o, get PLANER_AN() { return globalThis.__planerFreiPruefung === true; },
    planerEinstieg: (...a) => { globalThis.__planerLaeufe = (globalThis.__planerLaeufe || 0) + 1; return o.planerEinstieg(...a); } };
});

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const T0 = "2026-11-27T10:00:00.000Z";
const YM = "2026-12";
const WIRT = "127.0.0.1:3000";
const st = { am: T0, vonRolle: "leitung" };
const FREI = Object.freeze({ betrieb: { an: true, ...st }, betriebsratFrage: { antwort: "nein", ...st }, planerSchalter: { an: true, ...st } });
const frei = (an) => { globalThis.__planerFreiPruefung = an; };
const laeufe = () => globalThis.__planerLaeufe || 0;

let wurzel, S, nr = 0, raumNr = 0, echterBericht;
/** Aufrufe des Berichts: { mandant, ym, status } je Aufruf. */
const AUFRUFE = [];
const zaehlen = (ersatz) => (m, e) => { AUFRUFE.push({ mandant: m && m.id, ym: e && e.ym, status: e && e.status }); return ersatz ? ersatz(m, e) : echterBericht(m, e); };

beforeAll(async () => {
  vi.useFakeTimers({ now: new Date(T0), toFake: ["Date"] });
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-wpi8b-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
  const schutz = await import("../server/lib/schutz.mjs");
  for (const art of Object.keys(schutz.GRENZEN)) schutz.GRENZEN[art] = { ...schutz.GRENZEN[art], versuche: 1000000 };
  const { getStore } = await import("../server/lib/ablage.mjs");
  echterBericht = /** @type {any} */ (await vi.importActual("../server/lib/engine/erfuellungsbericht.mjs")).erfuellungsbericht;
  S = { laden: () => getStore({ name: "centric", consistency: "strong" }), daten: (await import("../server/funktionen/daten.mjs")).default,
    B: await import("../server/lib/bestand.mjs"), G: await import("../server/lib/gestalt.mjs"), sitzungAnlegen: (await import("../server/lib/sitzungen.mjs")).sitzungAnlegen,
    A: await import("../server/lib/planer-aktion.mjs") };
}, 180000);
afterAll(async () => {
  vi.useRealTimers();
  frei(false);
  if (S) S.A._pruefhaken.bericht = null;
  if (wurzel) await rm(wurzel, { recursive: true, force: true });
});
afterEach(() => {
  S.A._pruefhaken.bericht = null;
  AUFRUFE.length = 0;
  vi.setSystemTime(new Date(T0));
  frei(false);
});

/* ---------------------------------- Betrieb ---------------------------------- */
const STAB = [["l1", "leitung"], ["l2", "leitung"], ["pl1", "planer"], ["s1", "subplaner"], ["a1", "mitarbeiter"], ["b1", "betriebsrat"], ["k1", "kunde"]];
/** Kleiner Betrieb: vier planbare Personen; `fruehBedarf` Personen je Tag im Frühdienst (mehr als vier ergibt offene Stellen). */
function bestandFuer(id = "m1", { fruehBedarf = 1, verteilung = false, kleineGruppe = false } = {}) {
  const g = baueLeerenBetrieb({ name: "T", branche: "pflege", email: "x@example.org", land: "HE", raum: "r" });
  const m = g.mandanten[0];
  m.id = id;
  m.status = "aktiv";
  const e1 = m.einheiten[0].id;
  m.personen = [
    ...[1, 2, 3, 4].map((i) => ({ id: `p${i}`, vorname: "Vorname", nachname: `Zuname${i}`, eintritt: "2020-01-01", zugehoerigkeit: [{ einheitId: e1, ab: "2020-01-01" }], wochenstunden: 40, status: "aktiv", qualifikationen: [] })),
    ...STAB.map(([pid, rolle]) => ({ id: pid, vorname: "Stab", nachname: `Stabname-${pid}`, rolle, status: "aktiv", wochenstunden: 40, bereich: rolle === "subplaner" ? e1 : "ALLE", qualifikationen: [] })),
  ];
  m.dienstarten = m.dienstarten.map((d) => (d.id === "F" ? { ...d, mindest: { mo_do: fruehBedarf, fr: fruehBedarf, sa: fruehBedarf, so: fruehBedarf } } : d));
  m.einstellungen = { ...m.einstellungen, kiSteuerung: structuredClone(FREI) };
  /* `typ` zusätzlich zu `regelart`: die Planungsreife (planungsreife.mjs) liest `typ`; ohne es gilt jede Vorgabe als unvollständig und der Planer rechnet nicht. */
  if (verteilung) m.vorgaben = [{ id: "vt-1", name: "Nächte gleichmäßig", typ: "verteilungsregel", regelart: "verteilungsregel", parameter: { groesse: "nachtdienste", maxAbweichung: 1 }, geltung: { art: "betrieb" },
    staerke: "soll", prioritaet: 1, status: "aktiv", grundlage: { art: "hausregel" }, bezug: "monat" }];
  /* Kleine Gruppe: nur zwei Personen im Schichtdienst (die übrigen zählen nicht zur Vergleichsgruppe). */
  if (kleineGruppe) m.personen = m.personen.map((p) => (p.id === "p1" || p.id === "p2" ? p : { ...p, imSchichtdienst: false }));
  m.abweichungen = { ...(m.abweichungen || {}), "p4|2026-12-20": "-" };
  m.angeheftet = { "p4|2026-12-20": { am: T0, vonRolle: "leitung" } };
  g.version = 9;
  return g;
}
const SITZ = { LT: ["l1", "leitung"], LT2: ["l2", "leitung"], PL: ["pl1", "planer"], SV: ["s1", "subplaner"], MA: ["a1", "mitarbeiter"], BR: ["b1", "betriebsrat"],
  KD: ["k1", "kunde"], DLT: ["l1", "leitung", true], DPL: ["pl1", "planer", true] };
async function raum(o = {}) {
  const name = `wpi8b-${++raumNr}`;
  const g = o.bestand || bestandFuer(o.id || "m1", o);
  await S.B.bestandSchreiben(S.laden(), name, S.G.personenAngleichen(g), { durch: "Pruefung" });
  const r = { name, t: {}, mid: g.mandanten[0].id, einheit: g.mandanten[0].einheiten[0].id };
  for (const [k, [person, rolle, demo]] of Object.entries(SITZ))
    r.t[k] = (await S.sitzungAnlegen({ bestand: r.name, name: `Stab ${person}`, rolle, person, betrieb: 0, mandantId: r.mid, einheit: rolle === "subplaner" ? r.einheit : null,
      ...(demo ? { demo: true } : {}) }, 30 * 24 * 3600 * 1000)).token;
  return r;
}
async function anfrage(pfad, { rumpf, token } = {}) {
  nr += 1;
  const kopf = { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.82.${Math.floor(nr / 250) % 250}.${nr % 250}`, "content-type": "application/json" };
  if (token) kopf.authorization = `Bearer ${token}`;
  const a = await S.daten(new Request(`http://${WIRT}${pfad}`, { method: "POST", headers: kopf, body: JSON.stringify(rumpf === undefined ? {} : rumpf) }), {});
  let d = {}; try { d = await a.json(); } catch { /* leer */ }
  return { status: a.status, ...d };
}
const post = (weg, rumpf, token) => anfrage(`/api/${weg}`, { token, rumpf });
const vorschlag = (r, token = r.t.LT, ym = YM) => post("planer-vorschlag", { ym }, token);
const lesen = (name) => S.B.bestandLesenStreng(S.laden(), name);
const abdruck = async (name) => { const l = await lesen(name); return JSON.stringify({ stand: l.stand, bestand: l.bestand }); };

/* ----------------------- Positivliste (unabhängig vom Server) ----------------------- */
const RANG = ["gesetz", "qualifikation", "besetzung", "muss", "soll", "verteilung", "wunsch"];
const SCHLUESSEL = new Set(["ok", "ym", "startwert", "massgeblich", "kategorie", "status", "erstesProblem", "zusammenfassung", "kategorien", "erfuellt", "erfuelltImVorschlag",
  "verletzt", "offen", "nichtBewertbar", "stellen", "gesamt", "voll", "bedarfOffen", "qualifikation", "eigeneEinteilungen", "konflikte", "gelistet", "abgeschnitten", "mitWegen",
  "wegeUnvollstaendig", "ursacheUnvollstaendig", "rang", "umfang", "bestandGeprueft", "geprueft", "vorgaben", "aussage", "grund", "bedarf", "fehlt", "nachgelagert",
  "summeUeberschreitung", "vorgabeId", "staerke", "groesse", "maxAbweichung", "spannweite", "ueberschreitung", "kleineGruppe", "personen", "ausserhalb", "datum", "dienstId",
  "art", "qualFehlt", "fehlendeQualifikationen", "qid", "noetig", "ist", "ursache", "regeln", "vorgabenUnvollstaendig", "wegeStatus", "wege", "deckt"]);
/** Alle Schlüssel und alle Zeichenketten eines Berichts, flach. */
function flach(x, aus = { schluessel: [], werte: [] }) {
  if (Array.isArray(x)) x.forEach((y) => flach(y, aus));
  else if (x && typeof x === "object") for (const [k, y] of Object.entries(x)) { aus.schluessel.push(k); flach(y, aus); }
  else if (typeof x === "string") aus.werte.push(x);
  return aus;
}
/** Keine Person, kein Name, kein Person|Tag, kein Prozent, kein Schlüssel außerhalb der Liste. */
function ohnePersonenbezug(bericht, personen) {
  const f = flach(bericht);
  expect(f.schluessel.filter((k) => !SCHLUESSEL.has(k))).toEqual([]);
  const ids = new Set(personen.map((p) => String(p.id)));
  const namen = personen.flatMap((p) => [p.vorname, p.nachname]).filter(Boolean);
  for (const w of f.werte) {
    expect(ids.has(w), `Wert ${w}`).toBe(false);
    expect(/[|%\s]/.test(w), `Wert ${w}`).toBe(false);
    expect(namen.some((n) => w.includes(n)), `Wert ${w}`).toBe(false);
  }
  expect(f.schluessel.some((k) => /prozent|score|punkte|note|name|personId/i.test(k))).toBe(false);
}

describe("1. Antwort des Vorschlags mit Erfüllungsbericht", { timeout: 300000 }, () => {
  it("PLANER_AN bleibt AUS; Leitung bekommt Vorschlag und Bericht aus einem Planlauf und einem Bericht, alle bisherigen Felder unverändert", async () => {
    const echt = /** @type {any} */ (await vi.importActual("../server/lib/engine/planer.mjs"));
    expect(echt.PLANER_AN).toBe(false);
    const r = await raum();
    frei(true);
    S.A._pruefhaken.bericht = zaehlen();
    const n0 = laeufe();
    const v = await vorschlag(r);
    expect(v.status, JSON.stringify(v).slice(0, 400)).toBe(201);
    expect(laeufe() - n0).toBe(1);
    expect(AUFRUFE).toEqual([{ mandant: "m1", ym: YM, status: "ok" }]);
    /* Abwärtskompatibel: die bisherigen Felder in Form und Inhalt, dazu genau die beiden neuen. */
    expect(Object.keys(v).sort()).toEqual(["bericht", "berichtGrund", "eintraege", "gueltigBis", "modus", "offen", "ok", "status", "vorschlag", "ym"]);
    expect(v.vorschlag).toMatch(/^pv-[0-9a-f]{32}$/);
    expect(v.eintraege.length).toBeGreaterThan(3);
    for (const e of v.eintraege) expect(Object.keys(e).sort()).toEqual(["art", "datum", "dienstId", "index", "personId"]);
    expect(Number.isInteger(v.offen)).toBe(true);
    expect(v.berichtGrund).toBeNull();
    expect(v.bericht).toMatchObject({ ok: true, ym: YM });
    expect(v.bericht.kategorien.map((k) => k.kategorie)).toEqual(RANG);
    expect(v.bericht.zusammenfassung.eigeneEinteilungen).toBe(v.eintraege.length);
    expect(Array.isArray(v.bericht.konflikte)).toBe(true);
    /* Gesetz erfüllt nur für die eigenen Einteilungen: die Aussage steht in der Antwort. */
    expect(v.bericht.kategorien[0]).toMatchObject({ kategorie: "gesetz", status: "erfuellt", aussage: "keine_befunde_in_eigenen_einteilungen", geprueft: v.eintraege.length, bestandGeprueft: false });
    expect(v.bericht.kategorien[6]).toMatchObject({ kategorie: "wunsch", status: "nicht-bewertbar" });
    ohnePersonenbezug(v.bericht, (await lesen(r.name)).bestand.mandanten[0].personen);
  });
  it("offene Stellen mit Wo, Warum und Wegen stehen in der Antwort — nur Kennungen und Zahlen", async () => {
    const r = await raum({ fruehBedarf: 6 });
    frei(true);
    const v = await vorschlag(r);
    expect(v.status, JSON.stringify(v).slice(0, 300)).toBe(201);
    const k = v.bericht.konflikte;
    expect(k.length).toBeGreaterThan(5);
    for (const x of k) {
      expect(x.datum).toMatch(/^2026-12-\d{2}$/);
      expect(x.dienstId).toBe("F");
      expect(x.fehlt).toBeGreaterThan(0);
      expect(typeof x.ursache).toBe("string");
      expect(["berechnet", "keine", "unvollstaendig"]).toContain(x.wegeStatus);
    }
    expect(v.bericht.kategorien[2]).toMatchObject({ kategorie: "besetzung", status: "offen" });
    expect(v.bericht.erstesProblem).toEqual({ kategorie: "besetzung", status: "offen" });
    expect(v.bericht.zusammenfassung.konflikte.gesamt).toBe(v.offen);
    ohnePersonenbezug(v.bericht, (await lesen(r.name)).bestand.mandanten[0].personen);
    expect(JSON.stringify(v)).not.toMatch(/Zuname|Stabname|Vorname/);
  });
  it("kein Einteilungsvorschlag (0 Einteilungen): die Antwort trägt trotzdem den Bericht (Ursache der offenen Stellen), nichts wird gehalten", async () => {
    const r = await raum({ fruehBedarf: 0 });
    frei(true);
    S.A._pruefhaken.bericht = zaehlen();
    S.A._vorschlaege.leeren();
    const v = await vorschlag(r);
    expect([v.status, v.vorschlag, v.eintraege]).toEqual([200, null, []]);
    expect(AUFRUFE.length).toBe(1);
    expect(v.berichtGrund).toBeNull();
    expect(v.bericht).toMatchObject({ ok: true, ym: YM, zusammenfassung: { eigeneEinteilungen: 0 } });
    /* Nichts zu prüfen heißt nie „erfüllt“: jede Kategorie ist nicht bewertbar. */
    expect(v.bericht.kategorien.map((k) => k.status)).toEqual(Array(7).fill("nicht-bewertbar"));
    expect(S.A._vorschlaege.anzahl()).toBe(0);
  });
});

describe("2. Rechte und Schalter: nur Leitung und Planung; ohne Freigabe nichts gerechnet", { timeout: 300000 }, () => {
  it("Leitung und Planung bekommen den Bericht; Schichtverantwortung, Beschäftigte, Betriebsrat, Kundenrolle und Demo 403 ohne Rechnung und ohne Berichtsfeld", async () => {
    const r = await raum();
    frei(true);
    S.A._pruefhaken.bericht = zaehlen();
    for (const k of ["LT", "PL"]) { const x = await vorschlag(r, r.t[k]); expect(x.status, k).toBe(201); expect(x.bericht.ok, k).toBe(true); }
    expect(AUFRUFE.length).toBe(2);
    AUFRUFE.length = 0;
    const n0 = laeufe();
    const vorher = await abdruck(r.name);
    for (const k of ["SV", "MA", "BR", "KD", "DLT", "DPL"]) {
      const x = await vorschlag(r, r.t[k]);
      expect([x.status, x.code], k).toEqual([403, "keine-berechtigung"]);
      expect(Object.keys(x).filter((s) => /bericht/i.test(s)), k).toEqual([]);
    }
    expect((await post("planer-vorschlag", { ym: YM })).status).toBe(401);
    expect(AUFRUFE.length).toBe(0);
    expect(laeufe()).toBe(n0);
    expect(await abdruck(r.name)).toBe(vorher);
  });
  it("Planer aus: planer-nicht-freigegeben vor jedem Lesen und Rechnen — weder Planlauf noch Bericht, auch nicht mit eingeschleusten Feldern", async () => {
    const r = await raum();
    frei(false);
    S.A._pruefhaken.bericht = zaehlen();
    const n0 = laeufe();
    const vorher = await abdruck(r.name);
    for (const rumpf of [{ ym: YM }, { ym: YM, freigabe: true }]) {
      const x = await post("planer-vorschlag", rumpf, r.t.LT);
      expect([x.status, x.code]).toEqual([409, "planer-nicht-freigegeben"]);
      expect(Object.keys(x).filter((s) => /bericht/i.test(s))).toEqual([]);
    }
    expect(AUFRUFE.length).toBe(0);
    expect(laeufe()).toBe(n0);
    expect(await abdruck(r.name)).toBe(vorher);
  });
  it("Planer im Betrieb aus, Pause oder nicht planungsreif: kein Vorschlag, kein Bericht gerechnet", async () => {
    const g = bestandFuer("m1");
    g.mandanten[0].einstellungen.kiSteuerung = { ...FREI, planerSchalter: { an: false, ...st } };
    const r = await raum({ bestand: g });
    frei(true);
    S.A._pruefhaken.bericht = zaehlen();
    const x = await vorschlag(r);
    expect(x.status).toBe(409);
    expect(["planer-pausiert", "planer-im-betrieb-aus"]).toContain(x.code);
    expect(AUFRUFE.length).toBe(0);
  });
});

describe("3. Kein Bericht: feste Kennung, der Vorschlag bleibt", { timeout: 300000 }, () => {
  for (const [name, ersatz, erwartet] of [
    ["aufwand", () => ({ ok: false, grund: "aufwand" }), "aufwand"],
    ["ergebnis_passt_nicht", () => ({ ok: false, grund: "ergebnis_passt_nicht", pruefung: "nachpruefung" }), "ergebnis_passt_nicht"],
    ["fehler", () => ({ ok: false, grund: "fehler" }), "fehler"],
    ["Kern wirft", () => { throw new Error("Max Mustermann Zuname1"); }, "fehler"],
    ["Grund des Kerns unbekannt oder Freitext", () => ({ ok: false, grund: "Anna Alt hat Urlaub" }), "fehler"],
    ["anderer Grund des Kerns", () => ({ ok: false, grund: "betrieb_ungueltig" }), "fehler"],
    ["kein Objekt", () => null, "fehler"],
    ["Berichtsform mit Personenkennung", () => ({ ok: true, ym: YM, kategorien: [], konflikte: [{ datum: "2026-12-01", personId: "p1" }] }), "bericht_ungueltig"],
  ]) {
    it(`${name} ⇒ bericht null, berichtGrund ${erwartet}; Vorschlag gültig und prüfbar`, async () => {
      const r = await raum();
      frei(true);
      S.A._pruefhaken.bericht = zaehlen(ersatz);
      const v = await vorschlag(r);
      expect(v.status, JSON.stringify(v).slice(0, 300)).toBe(201);
      expect([v.bericht, v.berichtGrund]).toEqual([null, erwartet]);
      expect(v.eintraege.length).toBeGreaterThan(3);
      expect(JSON.stringify(v)).not.toMatch(/Mustermann|Anna Alt|Urlaub/);
      const vorher = await abdruck(r.name);
      const p = await post("planer-uebernahme", { vorschlag: v.vorschlag, auswahl: [0, 1], bestaetigt: false }, r.t.LT);
      expect(p, JSON.stringify(p)).toMatchObject({ status: 200, geprueft: true, geschrieben: false, anzahl: 2 });
      expect(await abdruck(r.name)).toBe(vorher);
    });
  }
  /* Bestand für die Einzelprüfungen von berichtFuerAntwort: Dienstkennungen und Qualifikationskennungen des Betriebs. */
  const BM = { dienstarten: [{ id: "zq-dienst-F", mindestQual: { "zq-qual-1": 2 } }, { id: "zq-dienst-N" }] };
  const GUT = () => ({ ok: true, ym: YM, startwert: 1, massgeblich: { kategorie: "besetzung", status: "offen" }, erstesProblem: null,
    zusammenfassung: { kategorien: { erfuellt: 0, erfuelltImVorschlag: 1, verletzt: 0, offen: 1, nichtBewertbar: 5 }, stellen: { gesamt: 31, voll: 29, offen: 2, bedarfOffen: 0 },
      qualifikation: { stellen: 1, offen: 1 }, eigeneEinteilungen: 3, konflikte: { gesamt: 1, gelistet: 1, abgeschnitten: false, mitWegen: 1, wegeUnvollstaendig: 0, ursacheUnvollstaendig: 0 } },
    kategorien: [
      { kategorie: "gesetz", rang: 0, umfang: "vorschlag", bestandGeprueft: false, geprueft: 3, verletzt: 0, status: "erfuellt", aussage: "keine_befunde_in_eigenen_einteilungen" },
      { kategorie: "besetzung", rang: 2, stellen: 31, voll: 29, offen: 2, bedarf: 60, fehlt: 3, bedarfOffen: 0, status: "offen" },
      { kategorie: "verteilung", rang: 5, nachgelagert: true, status: "verletzt", erfuellt: 0, verletzt: 1, nichtBewertbar: 0, summeUeberschreitung: null,
        vorgaben: [{ vorgabeId: "vt-1", staerke: "soll", groesse: "nachtdienste", status: "verletzt", maxAbweichung: 1, spannweite: null, ueberschreitung: null, kleineGruppe: true,
          personen: 2, nichtBewertbar: 0, ausserhalb: 1 }] }],
    konflikte: [{ datum: "2026-12-01", dienstId: "zq-dienst-F", art: "besetzung_und_qualifikation", fehlt: 1, qualFehlt: true, fehlendeQualifikationen: [{ qid: "zq-qual-1", noetig: 2, ist: 1 }],
      ursache: "hindernisse", regeln: ["abwesend"], wegeStatus: "berechnet", wege: [{ regeln: ["abwesend"], personen: 2, deckt: 1 }] }] });
  /** Ändert eine Stelle des guten Berichts. */
  const mit = (fn) => { const b = GUT(); fn(b); return b; };
  const grundVon = (b) => S.A.berichtFuerAntwort(BM, {}, () => b).berichtGrund;
  it("berichtFuerAntwort: Schema mit Typ je Schlüssel; jede Abweichung ⇒ bericht_ungueltig, nie ein halber Bericht", () => {
    const f = S.A.berichtFuerAntwort;
    const gut = GUT();
    const r0 = f(BM, {}, () => gut);
    expect(r0).toEqual({ bericht: GUT(), berichtGrund: null });
    expect(r0.bericht).not.toBe(gut);   // eine Kopie, nie das Objekt des Kerns
    expect(r0.bericht.konflikte[0]).not.toBe(gut.konflikte[0]);
    /* Schlüssel außerhalb des Schemas. */
    expect(grundVon({ ...GUT(), bericht: 1 })).toBe("bericht_ungueltig");
    expect(grundVon(mit((b) => { b.kategorien[0].personId = "p1"; }))).toBe("bericht_ungueltig");
    expect(grundVon(mit((b) => { b.konflikte[0].name = "Anna"; }))).toBe("bericht_ungueltig");
    /* Zeichenketten: Freitext, Person|Tag. */
    expect(grundVon({ ...GUT(), ym: "Anna Alt" })).toBe("bericht_ungueltig");
    expect(grundVon({ ...GUT(), ym: "p1|2026-12-01" })).toBe("bericht_ungueltig");
    expect(grundVon(mit((b) => { b.konflikte[0].datum = "p1|2026-12-01"; }))).toBe("bericht_ungueltig");
    expect(grundVon(mit((b) => { b.konflikte[0].ursache = "Anna Alt"; }))).toBe("bericht_ungueltig");
    /* Zahlen: NaN, Infinity, negativ, gebrochen, Text, undefined, Funktion. */
    for (const w of [NaN, Infinity, -1, 1.5, "3", undefined, () => 1, null]) expect(grundVon(mit((b) => { b.kategorien[1].fehlt = w; })), String(w)).toBe("bericht_ungueltig");
    /* Maßzahlen der Verteilung: endliche Zahl ≥ 0 oder null, nie Liste, Text oder NaN. */
    for (const w of [["p1"], "p1", NaN, Infinity, -1, {}, true]) {
      for (const k of ["spannweite", "ueberschreitung", "maxAbweichung"]) expect(grundVon(mit((b) => { b.kategorien[2].vorgaben[0][k] = w; })), `${k} ${JSON.stringify(w)}`).toBe("bericht_ungueltig");
      expect(grundVon(mit((b) => { b.kategorien[2].summeUeberschreitung = w; })), `summe ${JSON.stringify(w)}`).toBe("bericht_ungueltig");
    }
    expect(grundVon(mit((b) => { b.kategorien[2].vorgaben[0].spannweite = 1.5; }))).toBeNull();                         // Maßzahlen dürfen gebrochen sein
    expect(grundVon({ ...GUT(), startwert: NaN })).toBe("bericht_ungueltig");
    expect(grundVon({ ...GUT(), startwert: 1.5 })).toBe("bericht_ungueltig");
    /* Listen nur unter den vorgesehenen Schlüsseln und nur von Kennungen bzw. Objekten; Zählwerte sind nie Listen (Personen-Kennungen). */
    for (const w of [["p1"], ["p1", "p2"], [], { 0: "p1" }, "p1"]) {
      expect(grundVon(mit((b) => { b.kategorien[2].vorgaben[0].personen = w; })), `personen ${JSON.stringify(w)}`).toBe("bericht_ungueltig");
      expect(grundVon(mit((b) => { b.kategorien[2].vorgaben[0].nichtBewertbar = w; })), `nichtBewertbar ${JSON.stringify(w)}`).toBe("bericht_ungueltig");
      expect(grundVon(mit((b) => { b.kategorien[2].vorgaben[0].ausserhalb = w; })), `ausserhalb ${JSON.stringify(w)}`).toBe("bericht_ungueltig");
      expect(grundVon(mit((b) => { b.konflikte[0].wege[0].personen = w; })), `wege personen ${JSON.stringify(w)}`).toBe("bericht_ungueltig");
      expect(grundVon(mit((b) => { b.kategorien[2].nichtBewertbar = w; })), `verteilung nichtBewertbar ${JSON.stringify(w)}`).toBe("bericht_ungueltig");
      expect(grundVon(mit((b) => { b.zusammenfassung.kategorien.nichtBewertbar = w; })), `zusammenfassung ${JSON.stringify(w)}`).toBe("bericht_ungueltig");
    }
    expect(grundVon(mit((b) => { b.kategorien[1].vorgaben = ["p1"]; }))).toBe("bericht_ungueltig");                  // Liste von Kennungen statt Objekten
    expect(grundVon(mit((b) => { b.kategorien[2].vorgaben = [{ personen: ["p1"] }]; }))).toBe("bericht_ungueltig");
    expect(grundVon(mit((b) => { b.konflikte[0].regeln = "abwesend"; }))).toBe("bericht_ungueltig");                  // Text statt Liste
    expect(grundVon(mit((b) => { b.konflikte[0].regeln = [["abwesend"]]; }))).toBe("bericht_ungueltig");
    expect(grundVon(mit((b) => { b.konflikte[0].wege[0].regeln = ["a b"]; }))).toBe("bericht_ungueltig");
    expect(grundVon(mit((b) => { b.konflikte[0].fehlendeQualifikationen = { qid: "zq-qual-1" }; }))).toBe("bericht_ungueltig");
    expect(grundVon(mit((b) => { b.kategorien[0].bestandGeprueft = "false"; }))).toBe("bericht_ungueltig");           // Wahrheitswert statt Text
    expect(grundVon(mit((b) => { b.konflikte[0].qualFehlt = 1; }))).toBe("bericht_ungueltig");
    expect(grundVon(mit((b) => { b.konflikte = {}; }))).toBe("bericht_ungueltig");
    expect(grundVon(mit((b) => { b.ok = "true"; }))).toBe("fehler");                                                  // nur ok === true ist ein Bericht
    /* Dienst- und Qualifikationskennung müssen im Bestand stehen: kein Person|Tag, kein Name, keine fremde Kennung. */
    for (const w of ["p1|2026-12-01", "Anna Alt", "zq-dienst-X", "", "x".repeat(65), 7, null, ["zq-dienst-F"]]) expect(grundVon(mit((b) => { b.konflikte[0].dienstId = w; })), String(w)).toBe("bericht_ungueltig");
    for (const w of ["p1|2026-12-01", "Anna Alt", "zq-qual-9", "", null]) expect(grundVon(mit((b) => { b.konflikte[0].fehlendeQualifikationen[0].qid = w; })), String(w)).toBe("bericht_ungueltig");
    expect(f({}, {}, () => GUT()).berichtGrund).toBe("bericht_ungueltig");                                              // Bestand ohne Dienstarten: keine Kennung passt
    expect(f(null, {}, () => GUT()).berichtGrund).toBe("bericht_ungueltig");
    expect(grundVon(mit((b) => { b.konflikte[0].dienstId = "zq-dienst-N"; }))).toBeNull();                              // eine andere Kennung des Betriebs ist gültig
    /* Listenlängen. */
    expect(grundVon(mit((b) => { b.konflikte = Array.from({ length: 501 }, () => GUT().konflikte[0]); }))).toBe("bericht_ungueltig");
    expect(grundVon(mit((b) => { b.konflikte[0].wege = Array.from({ length: 6 }, () => ({ regeln: [], personen: 1, deckt: 1 })); }))).toBe("bericht_ungueltig");
    expect(grundVon(mit((b) => { b.konflikte[0].regeln = Array.from({ length: 21 }, () => "abwesend"); }))).toBe("bericht_ungueltig");
    expect(grundVon(mit((b) => { b.kategorien = Array.from({ length: 8 }, () => GUT().kategorien[0]); }))).toBe("bericht_ungueltig");
    /* Ausgänge des Kerns. */
    expect(f(BM, {}, () => ({ ...GUT(), ok: false, grund: "aufwand" }))).toEqual({ bericht: null, berichtGrund: "aufwand" });
    expect(f(BM, {}, () => ({ ok: false }))).toEqual({ bericht: null, berichtGrund: "fehler" });
    expect(f(BM, {}, () => { throw new Error("x"); })).toEqual({ bericht: null, berichtGrund: "fehler" });
    expect(S.A.BERICHT_FEHLER).toEqual(["aufwand", "ergebnis_passt_nicht", "fehler", "bericht_ungueltig"]);
  });
  it("Größe: der Fall an den Obergrenzen des Kerns (500 Konflikte mit je 5 Wegen, 20 Regeln, 50 Qualifikationen, 50 Verteilungsvorgaben) besteht; darüber ⇒ aufwand, nicht „nicht lesbar“", () => {
    const f = S.A.berichtFuerAntwort;
    const quals = Array.from({ length: 50 }, (_, i) => `zq-qual-${i}`);
    const bm = { dienstarten: [{ id: "zq-dienst-F", mindestQual: Object.fromEntries(quals.map((q) => [q, 1])) }] };
    const regeln = Array.from({ length: 20 }, () => "abwesend");
    const k = { datum: "2026-12-01", dienstId: "zq-dienst-F", art: "besetzung_und_qualifikation", fehlt: 3, qualFehlt: true, bedarfOffen: true, ursache: "hindernisse", grund: "aufwand", vorgabenUnvollstaendig: true,
      wegeStatus: "berechnet", regeln, fehlendeQualifikationen: quals.map((q) => ({ qid: q, noetig: 2, ist: 1 })), wege: Array.from({ length: 5 }, () => ({ regeln, personen: 3, deckt: 2 })) };
    const v = { vorgabeId: "vt-1", staerke: "soll", groesse: "nachtdienste", status: "verletzt", grund: "weniger_als_zwei", maxAbweichung: 1, spannweite: 2, ueberschreitung: 1, kleineGruppe: false, personen: 5, nichtBewertbar: 0, ausserhalb: 0 };
    const gross = GUT();
    gross.konflikte = Array.from({ length: 500 }, () => k);
    gross.kategorien[2].vorgaben = Array.from({ length: 50 }, () => v);
    const r = f(bm, {}, () => gross);
    expect(r.berichtGrund).toBeNull();
    expect(r.bericht.konflikte).toHaveLength(500);
    expect(S.A.BERICHT_KNOTEN_MAX).toBeGreaterThan(500 * 300);
    /* Die Grenze greift als Aufwand: sehr kleine Grenze ⇒ aufwand (der Vorschlag bleibt, siehe Abschnitt 3). */
    expect(f(BM, {}, () => GUT(), { knoten: 10 })).toEqual({ bericht: null, berichtGrund: "aufwand" });
    expect(f(BM, {}, () => GUT(), { knoten: 1000 }).berichtGrund).toBeNull();
  });
  it("die echte Berichtsform des Kerns besteht das Schema (kein bericht_ungueltig, kein aufwand) — Grün- und Rotfall", async () => {
    for (const o of [{}, { fruehBedarf: 6 }]) {
      const r = await raum(o);
      frei(true);
      const v = await vorschlag(r);
      expect(v.berichtGrund, JSON.stringify(o)).toBeNull();
    }
  });
  it("Verteilungsvorgabe mit dem echten Rechenkern, Gruppe von mindestens drei Personen: Bericht gültig, Zahlen statt Personenlisten, ohne Personenbezug", async () => {
    const r = await raum({ verteilung: true });
    frei(true);
    const v = await vorschlag(r);
    expect(v.status, JSON.stringify(v).slice(0, 300)).toBe(201);
    expect(v.berichtGrund).toBeNull();
    const vt = v.bericht.kategorien.find((k) => k.kategorie === "verteilung");
    expect(vt.vorgaben).toHaveLength(1);
    const x = vt.vorgaben[0];
    expect(x.vorgabeId).toBe("vt-1");
    expect(x.kleineGruppe).toBeUndefined();
    expect(x.personen).toBeGreaterThanOrEqual(3);
    for (const k of ["personen", "nichtBewertbar", "ausserhalb"]) expect(Number.isInteger(x[k]), k).toBe(true);
    ohnePersonenbezug(v.bericht, (await lesen(r.name)).bestand.mandanten[0].personen);
    expect(JSON.stringify(v)).not.toMatch(/Zuname|Stabname|Vorname|\|/);
  });
  it("Verteilungsvorgabe mit dem echten Rechenkern, kleine Gruppe (zwei Personen): kleineGruppe true, Spannweite und Überschreitung null, Summe null, ohne Personenbezug", async () => {
    const r = await raum({ verteilung: true, kleineGruppe: true });
    frei(true);
    const v = await vorschlag(r);
    expect(v.status, JSON.stringify(v).slice(0, 300)).toBe(201);
    expect(v.berichtGrund).toBeNull();
    const vt = v.bericht.kategorien.find((k) => k.kategorie === "verteilung");
    expect(vt.vorgaben).toHaveLength(1);
    const x = vt.vorgaben[0];
    expect(x).toMatchObject({ vorgabeId: "vt-1", kleineGruppe: true, spannweite: null, ueberschreitung: null });
    expect(x.personen).toBeLessThan(3);
    expect(vt.summeUeberschreitung).toBeNull();
    ohnePersonenbezug(v.bericht, (await lesen(r.name)).bestand.mandanten[0].personen);
    expect(JSON.stringify(v)).not.toMatch(/Zuname|Stabname|Vorname|\|/);
  });
});

describe("4. Der Client reicht keinen Bericht ein; der Bericht gehört zum Vorschlag; Mandantentrennung", { timeout: 300000 }, () => {
  it("Berichtsfelder im Rumpf aller Wege: 400 anfrage-ungueltig, nichts gerechnet und nichts verändert", async () => {
    const r = await raum();
    frei(true);
    const v = await vorschlag(r);
    S.A._pruefhaken.bericht = zaehlen();
    const n0 = laeufe();
    const vorher = await abdruck(r.name);
    const fremd = { ok: true, ym: YM, kategorien: [], konflikte: [] };
    for (const rumpf of [{ ym: YM, bericht: fremd }, { ym: YM, berichtGrund: null }, { ym: YM, bericht: null }]) {
      const x = await post("planer-vorschlag", rumpf, r.t.LT);
      expect([x.status, x.code], JSON.stringify(rumpf)).toEqual([400, "anfrage-ungueltig"]);
    }
    for (const mehr of [{ bericht: fremd }, { berichtGrund: "aufwand" }]) {
      const x = await post("planer-uebernahme", { vorschlag: v.vorschlag, auswahl: [0], bestaetigt: true, ...mehr }, r.t.LT);
      expect([x.status, x.code], JSON.stringify(mehr)).toEqual([400, "anfrage-ungueltig"]);
    }
    for (const mehr of [{ bericht: fremd }]) {
      expect((await post("planer-rueckgaengig", { uebernahme: `pu-${"a".repeat(32)}`, bestaetigt: true, ...mehr }, r.t.LT)).code).toBe("anfrage-ungueltig");
      expect((await post("planer-rueckgaengig-liste", { ym: YM, ...mehr }, r.t.LT)).code).toBe("anfrage-ungueltig");
    }
    expect(AUFRUFE.length).toBe(0);
    expect(laeufe()).toBe(n0);
    expect(await abdruck(r.name)).toBe(vorher);
  });
  it("der Bericht steht nur in der Antwort: am gehaltenen Vorschlag liegt kein Bericht (Speicher), Übernahme und Ersetzen bleiben davon unberührt", async () => {
    const r = await raum();
    frei(true);
    const v = await vorschlag(r);
    expect(v.bericht.ok).toBe(true);
    const roh = S.A._vorschlaege.roh(v.vorschlag);
    expect(Object.keys(roh).filter((k) => /bericht/i.test(k))).toEqual([]);
    expect(JSON.stringify(roh)).not.toMatch(/kategorien|konflikte|bericht/);
    expect(roh.besitz.mandantId).toBe("m1");
    expect(roh.ym).toBe(YM);
    const u = await post("planer-uebernahme", { vorschlag: v.vorschlag, auswahl: [0, 1], bestaetigt: true }, r.t.LT);
    expect(u, JSON.stringify(u)).toMatchObject({ status: 200, geschrieben: true, anzahl: 2 });
    expect(Object.keys(u).filter((k) => /bericht/i.test(k))).toEqual([]);
    /* Ein neuer Vorschlag desselben Besitzers und Monats ersetzt den alten. */
    const a = await vorschlag(r);
    const b = await vorschlag(r);
    expect(S.A._vorschlaege.roh(a.vorschlag)).toBeNull();
    expect(Object.keys(S.A._vorschlaege.roh(b.vorschlag)).filter((k) => /bericht/i.test(k))).toEqual([]);
  });
  it("Mandantentrennung: der Bericht wird aus dem Bestand des eigenen Betriebs gerechnet; Betrieb B sieht nie den Bericht oder Vorschlag von Betrieb A", async () => {
    const a = await raum({ id: "m-a" });
    const b = await raum({ id: "m-b", fruehBedarf: 6 });
    frei(true);
    S.A._pruefhaken.bericht = zaehlen();
    const vA = await vorschlag(a);
    const vB = await vorschlag(b);
    expect(AUFRUFE.map((x) => x.mandant)).toEqual(["m-a", "m-b"]);
    expect(vA.bericht.zusammenfassung.konflikte.gesamt).toBe(vA.offen);
    expect(vB.bericht.zusammenfassung.konflikte.gesamt).toBe(vB.offen);
    expect(vA.bericht.zusammenfassung.konflikte.gesamt).not.toBe(vB.bericht.zusammenfassung.konflikte.gesamt);
    expect(S.A._vorschlaege.roh(vA.vorschlag).besitz.mandantId).toBe("m-a");
    expect(S.A._vorschlaege.roh(vB.vorschlag).besitz.mandantId).toBe("m-b");
    /* Betrieb B kann den Vorschlag von A nicht benutzen. */
    const x = await post("planer-uebernahme", { vorschlag: vA.vorschlag, auswahl: [0], bestaetigt: false }, b.t.LT);
    expect([x.status, x.code]).toEqual([404, "vorschlag-unbekannt"]);
    expect(Object.keys(x).filter((s) => /bericht/i.test(s))).toEqual([]);
  });
  it("im selben Raum: gleiche Person-Kennung in Betrieb B bekommt nur den Bericht des eigenen Betriebs", async () => {
    const g = bestandFuer("m-a");
    g.mandanten.push(bestandFuer("m-b", { fruehBedarf: 6 }).mandanten[0]);
    const r = await raum({ bestand: g });
    const tB = (await S.sitzungAnlegen({ bestand: r.name, name: "Stab l1", rolle: "leitung", person: "l1", betrieb: 1, mandantId: "m-b", einheit: null }, 30 * 24 * 3600 * 1000)).token;
    frei(true);
    S.A._pruefhaken.bericht = zaehlen();
    const vA = await vorschlag(r);
    const vB = await post("planer-vorschlag", { ym: YM }, tB);
    expect(AUFRUFE.map((x) => x.mandant)).toEqual(["m-a", "m-b"]);
    expect(vA.bericht.zusammenfassung.konflikte.gesamt).toBe(vA.offen);
    expect(vB.bericht.zusammenfassung.konflikte.gesamt).toBe(vB.offen);
    expect(vA.offen).not.toBe(vB.offen);
  });
});
