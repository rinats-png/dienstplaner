/* ==========================================================================
   WP-I7 — PLANVORSCHLAG-ÜBERNAHME, SERVER-AKTION (Stufe 2): server/lib/planer-aktion.mjs über den echten Handler (daten.mjs)
   POST /api/planer-vorschlag, /api/planer-uebernahme, /api/planer-rueckgaengig

   Nur synthetische Daten, Uhr fest (vi.useFakeTimers, nur Date). PLANER_AN bleibt im Code AUS; die Prüfung gibt den Planer nur über
   den Prüf-Zugang frei (vi.mock von engine/planer.mjs, Schalter globalThis.__planerFreiPruefung) — nie über die Anfrage.
   1. Planer aus: Vorschlag und Übernahme `planer-nicht-freigegeben`, nichts gerechnet (Zähler der Planerläufe), nichts geschrieben;
      Rückgängig geht trotzdem (C-4).
   2. Rollenmatrix: Leitung, Planung ja; Schichtverantwortung, Betriebsrat, Beschäftigte, Kundenrolle, Demo (Leitung/Planung) nie; ohne
      Sitzung 401. Eingeschleuste Felder (freigabe, basis, gesetzt, rolle, demo, Patch) wirken nie.
   3. Ablauf: erzeugen → ansehen → prüfen (nichts geschrieben) → übernehmen (nur gewählte Schlüssel, Anheftungen byte-gleich,
      Änderungseinträge, Modulprotokoll ohne Person|Tag/Namen, Rückgängig-Datensatz nur am Server, keine Rolle sieht ihn).
   4. Doppelt/parallel: genau eine Übernahme gewinnt. Konflikt (409) und Fehler mitten im Schreiben: nichts bzw. alles.
   5. Rückgängig: Prüfung mit Unterbesetzungshinweis, einmalig (Replay 404), nach zwischenzeitlicher Änderung abgelehnt.
   6. Ablauf von Vorschlag und Rückgängig-Datensatz; Aufbewahrungslauf; Mandantentrennung; Größenlimit; Vergangenheit/Abschluss;
      Pause; Modus automatisch übernimmt nie selbst; PUT /api/bestand lässt die Rückgängig-Daten unberührt.
   9. Vor Freigabe von PLANER_AN: Grenze der gehaltenen Vorschläge je Besitzer (Raum, Betrieb, Person) mit Verdrängung des ältesten eigenen
      statt prozessweit 50/5 je Raum; nie ein laufender, nie ein fremder Vorschlag; Obergrenzen nach Zahl, Größe und Raum bleiben.
   Aufruf: TZ=UTC npx vitest run pruefungen/intelligence-planer-uebernahme-aktion.test.js
   ========================================================================== */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { baueLeerenBetrieb } from "../server/lib/leerbetrieb.mjs";

/* Prüf-Zugang zur Freigabe des Planers (PLANER_AN bleibt im Code AUS) und Zähler der Planerläufe. */
vi.mock("../server/lib/engine/planer.mjs", async (original) => {
  const o = /** @type {any} */ (await original());
  return { ...o, get PLANER_AN() { return globalThis.__planerFreiPruefung === true; },
    planerEinstieg: (...a) => { globalThis.__planerLaeufe = (globalThis.__planerLaeufe || 0) + 1;
      return typeof globalThis.__planerErsatz === "function" ? globalThis.__planerErsatz(...a) : o.planerEinstieg(...a); } };
});

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const T0 = "2026-11-27T10:00:00.000Z";
const YM = "2026-12";
const WIRT = "127.0.0.1:3000";
const st = { am: T0, vonRolle: "leitung" };
const FREI = Object.freeze({ betrieb: { an: true, ...st }, betriebsratFrage: { antwort: "nein", ...st }, planerSchalter: { an: true, ...st } });
const kopie = (x) => JSON.parse(JSON.stringify(x));
const frei = (an) => { globalThis.__planerFreiPruefung = an; };
const laeufe = () => globalThis.__planerLaeufe || 0;

let wurzel, S, nr = 0, raumNr = 0;

beforeAll(async () => {
  vi.useFakeTimers({ now: new Date(T0), toFake: ["Date"] });
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-wpi7pua-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
  const schutz = await import("../server/lib/schutz.mjs");
  for (const art of Object.keys(schutz.GRENZEN)) schutz.GRENZEN[art] = { ...schutz.GRENZEN[art], versuche: 1000000 };
  const { getStore } = await import("../server/lib/ablage.mjs");
  S = { laden: () => getStore({ name: "centric", consistency: "strong" }), daten: (await import("../server/funktionen/daten.mjs")).default,
    B: await import("../server/lib/bestand.mjs"), G: await import("../server/lib/gestalt.mjs"), sitzungAnlegen: (await import("../server/lib/sitzungen.mjs")).sitzungAnlegen,
    A: await import("../server/lib/planer-aktion.mjs"), R: await import("../server/lib/planer-rueckgaengig.mjs"), AUF: await import("../server/lib/aufbewahrung.mjs") };
}, 180000);
afterAll(async () => {
  vi.useRealTimers();
  frei(false);
  if (wurzel) await rm(wurzel, { recursive: true, force: true });
});
afterEach(() => {
  S.A._pruefhaken.nachlesen = null;
  globalThis.__planerErsatz = undefined;
  S.A._pruefhaken.ablage = null;
  S.A._pruefhaken.vorSchreiben = null;
  S.A._pruefhaken.hoechst = null;
  vi.setSystemTime(new Date(T0));
  frei(false);
});

/* ---------------------------------- Betrieb ---------------------------------- */
const STAB = [["l1", "leitung"], ["l2", "leitung"], ["pl1", "planer"], ["s1", "subplaner"], ["a1", "mitarbeiter"], ["b1", "betriebsrat"], ["k1", "kunde"]];
/** Kleiner Betrieb wie in der Kern-Prüfung: vier planbare Personen, Frühdienst je Tag eine Person, Planer im Betrieb frei (Knopfdruck). */
function bestandFuer(id = "m1", { steuerung = FREI } = {}) {
  const g = baueLeerenBetrieb({ name: "T", branche: "pflege", email: "x@example.org", land: "HE", raum: "r" });
  const m = g.mandanten[0];
  m.id = id;
  m.status = "aktiv";
  const e1 = m.einheiten[0].id;
  m.personen = [
    ...[1, 2, 3, 4].map((i) => ({ id: `p${i}`, vorname: "Vorname", nachname: `Zuname${i}`, eintritt: "2020-01-01", zugehoerigkeit: [{ einheitId: e1, ab: "2020-01-01" }], wochenstunden: 40, status: "aktiv", qualifikationen: [] })),
    ...STAB.map(([pid, rolle]) => ({ id: pid, vorname: "Stab", nachname: `Stabname-${pid}`, rolle, status: "aktiv", wochenstunden: 40, bereich: rolle === "subplaner" ? e1 : "ALLE", qualifikationen: [] })),
  ];
  m.dienstarten = m.dienstarten.map((d) => (d.id === "F" ? { ...d, mindest: { mo_do: 1, fr: 1, sa: 1, so: 1 } } : d));
  m.einstellungen = { ...m.einstellungen, kiSteuerung: structuredClone(steuerung) };
  /* Eine Anheftung außerhalb der Auswahl: muss byte-gleich bleiben. */
  m.abweichungen = { ...(m.abweichungen || {}), "p4|2026-12-20": "-" };
  m.angeheftet = { "p4|2026-12-20": { am: T0, vonRolle: "leitung" } };
  g.version = 9;
  return g;
}
const SITZ = { LT: ["l1", "leitung"], LT2: ["l2", "leitung"], PL: ["pl1", "planer"], SV: ["s1", "subplaner"], MA: ["a1", "mitarbeiter"], BR: ["b1", "betriebsrat"],
  KD: ["k1", "kunde"], DLT: ["l1", "leitung", true], DPL: ["pl1", "planer", true] };
/** Ein Raum mit einem Betrieb und Sitzungen je Rolle (Demo-Sitzungen mit demo: true). */
async function raum(o = {}) {
  const name = `wpi7pua-${++raumNr}`;
  const g = o.bestand || bestandFuer(o.id || "m1", o);
  await S.B.bestandSchreiben(S.laden(), name, S.G.personenAngleichen(g), { durch: "Pruefung" });
  const r = { name, t: {}, mid: g.mandanten[0].id, einheit: g.mandanten[0].einheiten[0].id };
  await frisch(r);
  return r;
}
/** Neue Sitzungen je Rolle zur aktuellen (festen) Uhr — nach einem Sprung der Uhr wären die alten abgelaufen. */
async function frisch(r) {
  for (const [k, [person, rolle, demo]] of Object.entries(SITZ))
    r.t[k] = (await S.sitzungAnlegen({ bestand: r.name, name: `Stab ${person}`, rolle, person, betrieb: 0, mandantId: r.mid, einheit: rolle === "subplaner" ? r.einheit : null,
      ...(demo ? { demo: true } : {}) }, 30 * 24 * 3600 * 1000)).token;
  return r;
}
async function anfrage(pfad, { methode = "GET", rumpf, token } = {}) {
  nr += 1;
  const kopf = { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.81.${Math.floor(nr / 250) % 250}.${nr % 250}` };
  if (methode !== "GET") kopf["content-type"] = "application/json";
  if (token) kopf.authorization = `Bearer ${token}`;
  const a = await S.daten(new Request(`http://${WIRT}${pfad}`, { method: methode, headers: kopf,
    ...(methode === "GET" ? {} : { body: JSON.stringify(rumpf === undefined ? {} : rumpf) }) }), {});
  let d = {}; try { d = await a.json(); } catch { /* leer */ }
  return { status: a.status, ...d };
}
/** Die drei Wege (Sonden für routen-inventar.test.js). */
const WEGE = Object.freeze({ "planer-vorschlag": "/api/planer-vorschlag", "planer-uebernahme": "/api/planer-uebernahme", "planer-rueckgaengig": "/api/planer-rueckgaengig" });
const post = (weg, rumpf, token) => anfrage(WEGE[weg], { methode: "POST", token, rumpf });
const lesen = async (name) => S.B.bestandLesenStreng(S.laden(), name);
const gespeichert = async (name) => (await lesen(name)).bestand.mandanten[0];
/** Byte-Abdruck des ganzen gespeicherten Bestands (mit Stand). */
const abdruck = async (name) => { const l = await lesen(name); return JSON.stringify({ stand: l.stand, bestand: l.bestand }); };
const vorschlag = async (r, token = r.t.LT, ym = YM) => post("planer-vorschlag", { ym }, token);
const uebernehmen = (id, auswahl, token, bestaetigt = true) => post("planer-uebernahme", { vorschlag: id, auswahl, bestaetigt }, token);
const zuruecknehmen = (id, token, bestaetigt = true) => post("planer-rueckgaengig", { uebernahme: id, bestaetigt }, token);
/** Planer frei, Vorschlag erzeugt, die ersten n Einträge übernommen. */
async function uebernommen(r, n = 3, token = r.t.LT) {
  frei(true);
  const v = await vorschlag(r, token);
  expect(v.status, JSON.stringify(v).slice(0, 300)).toBe(201);
  const auswahl = v.eintraege.slice(0, n).map((e) => e.index);
  const u = await uebernehmen(v.vorschlag, auswahl, token);
  expect(u.status, JSON.stringify(u).slice(0, 300)).toBe(200);
  return { v, u, gewaehlt: v.eintraege.slice(0, n) };
}

describe("0. Grundlage", { timeout: 300000 }, () => {
  it("PLANER_AN bleibt im Code AUS; der Vorschlag liefert Einträge ohne Namen", async () => {
    const echt = /** @type {any} */ (await vi.importActual("../server/lib/engine/planer.mjs"));
    expect(echt.PLANER_AN).toBe(false);
    const r = await raum();
    frei(true);
    const v = await vorschlag(r);
    expect(v.status, JSON.stringify(v).slice(0, 400)).toBe(201);
    expect(v.vorschlag).toMatch(/^pv-[0-9a-f]{32}$/);
    expect(v.eintraege.length).toBeGreaterThan(3);
    expect(JSON.stringify(v)).not.toMatch(/Zuname|Stabname|Vorname/);
    for (const e of v.eintraege) expect(e.datum.slice(0, 7)).toBe(YM);
  });
});

describe("1. Planer nicht freigegeben: nichts gerechnet, nichts geschrieben; Rückgängig geht (C-4)", { timeout: 300000 }, () => {
  it("Vorschlag und Übernahme: planer-nicht-freigegeben vor jedem Lesen/Rechnen; Freigabe im Rumpf wirkt nie", async () => {
    const r = await raum();
    frei(false);
    const vorher = await abdruck(r.name);
    const n0 = laeufe();
    for (const rumpf of [{ ym: YM }, { ym: YM, freigabe: true }, { ym: YM, freigabe: true, knopf: true, PLANER_AN: true }]) {
      const v = await post("planer-vorschlag", rumpf, r.t.LT);
      expect(v.status, JSON.stringify(rumpf)).toBe(409);
      expect(v.code).toBe("planer-nicht-freigegeben");
    }
    const u = await uebernehmen(`pv-${"0".repeat(32)}`, [0], r.t.LT);
    expect([u.status, u.code]).toEqual([409, "planer-nicht-freigegeben"]);
    expect(laeufe()).toBe(n0);
    expect(await abdruck(r.name)).toBe(vorher);
  });
  it("ein gehaltener Vorschlag wird nach dem Ausschalten nicht übernommen; die Rücknahme einer Übernahme geht ohne Freigabe", async () => {
    const r = await raum();
    const { u } = await uebernommen(r, 2);
    frei(true);
    const v2 = await vorschlag(r);
    expect(v2.status).toBe(201);
    frei(false);
    const vorher = await abdruck(r.name);
    const u2 = await uebernehmen(v2.vorschlag, [0], r.t.LT);
    expect([u2.status, u2.code]).toEqual([409, "planer-nicht-freigegeben"]);
    expect(await abdruck(r.name)).toBe(vorher);
    const z = await zuruecknehmen(u.uebernahme, r.t.LT);
    expect(z.status, JSON.stringify(z)).toBe(200);
    expect(z.anzahl).toBe(2);
  });
});

describe("2. Rollen und eingeschleuste Felder", { timeout: 300000 }, () => {
  it("Leitung und Planung ja; Schichtverantwortung, Beschäftigte, Betriebsrat, Kundenrolle und Demo nie (alle drei Wege); ohne Sitzung 401", async () => {
    const r = await raum();
    frei(true);
    expect((await vorschlag(r, r.t.PL)).status).toBe(201);
    const { v, u } = await uebernommen(r, 2);
    const vorher = await abdruck(r.name);
    const n0 = laeufe();
    for (const k of ["SV", "MA", "BR", "KD", "DLT", "DPL"]) {
      const a = await vorschlag(r, r.t[k]);
      const b = await uebernehmen(v.vorschlag, [2], r.t[k]);
      const c = await zuruecknehmen(u.uebernahme, r.t[k]);
      for (const x of [a, b, c]) expect([x.status, x.code], k).toEqual([403, "keine-berechtigung"]);
    }
    for (const x of [await post("planer-vorschlag", { ym: YM }), await post("planer-uebernahme", { vorschlag: v.vorschlag, auswahl: [2], bestaetigt: true }),
      await post("planer-rueckgaengig", { uebernahme: u.uebernahme, bestaetigt: true })]) expect(x.status).toBe(401);
    expect(laeufe()).toBe(n0);
    expect(await abdruck(r.name)).toBe(vorher);
  });
  it("Rolle, Demo, Freigabe, basis, gesetzt, Patch aus dem Rumpf: abgewiesen (400 bzw. 403), nichts gerechnet oder geschrieben", async () => {
    const r = await raum();
    frei(true);
    const v = await vorschlag(r);
    const vorher = await abdruck(r.name);
    const n0 = laeufe();
    const e0 = v.eintraege[0];
    expect((await post("planer-vorschlag", { ym: YM, rolle: "leitung" }, r.t.SV)).status).toBe(403);
    expect((await post("planer-vorschlag", { ym: YM, demo: false }, r.t.DLT)).status).toBe(403);
    for (const rumpf of [{ ym: YM, freigabe: true }, { ym: YM, rolle: "leitung" }, { ym: YM, demo: false }, { ym: YM, basis: "sha256:00" }, { ym: 202612 }, { ym: "2026-13" }, []]) {
      const x = await post("planer-vorschlag", rumpf, r.t.LT);
      expect(x.status, JSON.stringify(rumpf)).toBe(400);
    }
    const gut = { vorschlag: v.vorschlag, auswahl: [0], bestaetigt: true };
    for (const mehr of [{ gesetzt: [e0] }, { basis: "sha256:00" }, { patch: { abweichungen: { [`${e0.personId}|${e0.datum}`]: "F" } } }, { rolle: "leitung" }, { demo: false },
      { freigabe: true }, { rueckgaengig: { eintraege: [] } }, { bestaetigt: "ja" }, { bestaetigt: 1 }]) {
      const x = await post("planer-uebernahme", { ...gut, ...mehr }, r.t.LT);
      expect([x.status, x.code], JSON.stringify(mehr)).toEqual([400, "anfrage-ungueltig"]);
    }
    for (const auswahl of [[{ personId: e0.personId, datum: e0.datum, dienstId: e0.dienstId }], [`${e0.personId}|${e0.datum}`], ["0"], [0.5], [-1], [99999], "0"]) {
      const x = await post("planer-uebernahme", { ...gut, auswahl }, r.t.LT);
      expect([x.status, x.code], JSON.stringify(auswahl)).toEqual([400, "auswahl-ungueltig"]);
    }
    expect((await post("planer-uebernahme", { ...gut, auswahl: [0, 0] }, r.t.LT)).code).toBe("auswahl-doppelt");
    expect((await post("planer-uebernahme", { ...gut, auswahl: [] }, r.t.LT)).code).toBe("auswahl-leer");
    expect(laeufe()).toBe(n0);
    expect(await abdruck(r.name)).toBe(vorher);
  });
});

describe("3. Erzeugen → ansehen → prüfen → übernehmen", { timeout: 300000 }, () => {
  it("Prüfen schreibt nichts; Übernahme setzt genau die gewählten Schlüssel, Anheftungen byte-gleich, Protokoll ohne Person|Tag", async () => {
    const r = await raum();
    frei(true);
    const v = await vorschlag(r);
    const vor = await gespeichert(r.name);
    const vorher = await abdruck(r.name);
    const gewaehlt = [v.eintraege[0], v.eintraege[2], v.eintraege[4]];
    const p = await uebernehmen(v.vorschlag, gewaehlt.map((e) => e.index), r.t.LT, false);
    expect(p, JSON.stringify(p)).toMatchObject({ status: 200, ok: true, geprueft: true, geschrieben: false, anzahl: 3 });
    expect(await abdruck(r.name)).toBe(vorher);
    const u = await uebernehmen(v.vorschlag, gewaehlt.map((e) => e.index), r.t.LT);
    expect(u, JSON.stringify(u)).toMatchObject({ status: 200, ok: true, geschrieben: true, anzahl: 3, rueckgaengigBis: "2027-01-07",
      mitteilungen: { versandt: false } });
    expect(u.uebernahme).toMatch(/^pu-[0-9a-f]{32}$/);
    expect(JSON.stringify(u)).not.toMatch(/Zuname|Stabname|"p\d\|/);
    const nach = await gespeichert(r.name);
    const schl = gewaehlt.map((e) => `${e.personId}|${e.datum}`);
    /* Nur die gewählten Schlüssel geändert; alles andere der Einteilungen gleich. */
    const erwartet = { ...vor.abweichungen };
    for (const e of gewaehlt) erwartet[`${e.personId}|${e.datum}`] = e.dienstId;
    expect(nach.abweichungen).toEqual(erwartet);
    expect(JSON.stringify(nach.angeheftet)).toBe(JSON.stringify(vor.angeheftet));
    expect(nach.aenderungen.length).toBe((vor.aenderungen || []).length + 3);
    expect(nach.aenderungen.slice(-3).map((a) => `${a.personId}|${a.datum}`).sort()).toEqual([...schl].sort());
    const prot = nach.einstellungen.modulprotokoll.at(-1);
    const tage = gewaehlt.map((e) => e.datum).sort();
    expect(prot).toEqual({ modul: "planer", art: "planer-uebernommen", am: T0, von: "leitung", anzahl: 3, zeitraum: { von: tage[0], bis: tage[2] } });
    expect(JSON.stringify(prot)).not.toMatch(/\||Zuname|Stabname|"p[1-4]"/);
    const saetze = nach.planerRueckgaengig;
    expect(saetze.map((x) => x.id)).toEqual([u.uebernahme]);
    expect(saetze[0]).toMatchObject({ vorschlag: v.vorschlag, art: "planer-uebernahme", ym: YM, aufbewahrenBis: "2027-01-07" });
    expect(saetze[0].eintraege.map((e) => e.schluessel).sort()).toEqual([...schl].sort());
    /* Keine Rolle bekommt die Rückgängig-Daten zu sehen; Betriebsrat, Beschäftigte und Schichtverantwortung auch nicht den Protokolleintrag. */
    for (const k of ["LT", "PL", "SV", "MA", "BR", "KD"]) {
      const g = await anfrage("/api/bestand", { token: r.t[k] });
      expect(g.status, k).toBe(200);
      const text = JSON.stringify(g);
      expect(text.includes("planerRueckgaengig"), k).toBe(false);
      expect(text.includes(u.uebernahme), k).toBe(false);
      expect(text.includes(v.vorschlag), k).toBe(false);
      if (k === "BR" || k === "MA" || k === "SV") expect(text.includes("planer-uebernommen"), k).toBe(false);
    }
    /* Ein zweiter Versuch derselben Kennung: bereits übernommen, nichts doppelt. */
    const nochmal = await uebernehmen(v.vorschlag, [gewaehlt[0].index], r.t.LT);
    expect([nochmal.status, nochmal.code]).toEqual([409, "bereits-uebernommen"]);
    expect((await gespeichert(r.name)).aenderungen.length).toBe(nach.aenderungen.length);
  });
  it("Modus automatisch: Erzeugen schreibt nichts; ohne ausdrückliche Bestätigung nur Prüfung (keine Auto-Übernahme)", async () => {
    const r = await raum({ steuerung: { ...FREI, planerModus: { modus: "automatisch", ...st } } });
    frei(true);
    const vorher = await abdruck(r.name);
    const v = await vorschlag(r);
    expect(v.status, JSON.stringify(v).slice(0, 300)).toBe(201);
    expect(v.modus).toBe("automatisch");
    expect(await abdruck(r.name)).toBe(vorher);
    for (const rumpf of [{ vorschlag: v.vorschlag, auswahl: [0, 1] }, { vorschlag: v.vorschlag, auswahl: [0, 1], bestaetigt: false }]) {
      const x = await post("planer-uebernahme", rumpf, r.t.LT);
      expect(x).toMatchObject({ status: 200, geprueft: true, geschrieben: false });
    }
    expect(await abdruck(r.name)).toBe(vorher);
  });
  it("ein Vorschlag gehört der Person: eine andere Leitung desselben Betriebs bekommt 404; eine Rücknahme darf jede berechtigte Rolle des Betriebs", async () => {
    const r = await raum();
    frei(true);
    const v = await vorschlag(r);
    const x = await uebernehmen(v.vorschlag, [0], r.t.LT2);
    expect([x.status, x.code]).toEqual([404, "vorschlag-unbekannt"]);
    const u = await uebernehmen(v.vorschlag, [0, 1], r.t.LT);
    expect(u.status).toBe(200);
    const z = await zuruecknehmen(u.uebernahme, r.t.PL);
    expect(z.status, JSON.stringify(z)).toBe(200);
    expect((await gespeichert(r.name)).einstellungen.modulprotokoll.at(-1)).toMatchObject({ art: "planer-rueckgaengig", von: "planer", anzahl: 2 });
  });
});

/** Ablage, deren n-ter schreibender Zugriff (set/setJSON/delete) mit einer Ausnahme endet. */
function kaputtAb(n) {
  return (store) => {
    let i = 0;
    return new Proxy(store, { get(t, k) {
      const f = t[k];
      if (typeof f !== "function") return f;
      if (k === "set" || k === "setJSON" || k === "delete") return async (...a) => { i += 1; if (i >= n) throw new Error("Platte voll (Pruefung)"); return f.apply(t, a); };
      return f.bind(t);
    } });
  };
}

describe("4. Doppelklick, Konflikt, Fehler mitten im Schreiben", { timeout: 300000 }, () => {
  it("zwei gleichzeitige Übernahmen derselben Kennung: genau eine gewinnt", async () => {
    const r = await raum();
    frei(true);
    const v = await vorschlag(r);
    const vor = await gespeichert(r.name);
    const [a, b] = await Promise.all([uebernehmen(v.vorschlag, [0, 1, 2], r.t.LT), uebernehmen(v.vorschlag, [0, 1, 2], r.t.LT)]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(["uebernahme-laeuft", "bereits-uebernommen"]).toContain((a.status === 409 ? a : b).code);
    const nach = await gespeichert(r.name);
    expect(nach.planerRueckgaengig).toHaveLength(1);
    expect(nach.aenderungen.length).toBe((vor.aenderungen || []).length + 3);
    expect(nach.einstellungen.modulprotokoll.filter((x) => x.art === "planer-uebernommen")).toHaveLength(1);
  });
  it("Konflikt beim Schreiben (anderer Schreiber dazwischen): 409, nichts geschrieben; der nächste Versuch rechnet auf dem neuen Stand", async () => {
    const r = await raum();
    frei(true);
    const v = await vorschlag(r);
    S.A._pruefhaken.vorSchreiben = async ({ store, raum: rm0 }) => {
      const l = await S.B.bestandLesenStreng(store, rm0);
      const b = kopie(l.bestand);
      b.mandanten[0].name = "T fremd gespeichert";
      await S.B.bestandSchreiben(store, rm0, b, { durch: "Pruefung" });
    };
    const x = await uebernehmen(v.vorschlag, [0, 1], r.t.LT);
    expect([x.status, x.code]).toEqual([409, "konflikt"]);
    S.A._pruefhaken.vorSchreiben = null;
    const m = await gespeichert(r.name);
    expect(m.name).toBe("T fremd gespeichert");
    expect(m.planerRueckgaengig).toBeUndefined();
    for (const e of v.eintraege.slice(0, 2)) expect(Object.prototype.hasOwnProperty.call(m.abweichungen, `${e.personId}|${e.datum}`)).toBe(false);
    const y = await uebernehmen(v.vorschlag, [0, 1], r.t.LT);
    expect(y.status, JSON.stringify(y)).toBe(200);
    expect((await gespeichert(r.name)).name).toBe("T fremd gespeichert");
  });
  it("Einteilung im Monat dazwischen geändert: 409 seit-vorschlag-geaendert, Vorschlag verworfen (nie alter Patch auf neuem Stand)", async () => {
    const r = await raum();
    frei(true);
    const v = await vorschlag(r);
    const b = kopie((await lesen(r.name)).bestand);
    b.mandanten[0].abweichungen["p4|2026-12-29"] = "-";
    await S.B.bestandSchreiben(S.laden(), r.name, b, { durch: "Pruefung" });
    const vorher = await abdruck(r.name);
    const x = await uebernehmen(v.vorschlag, [0], r.t.LT);
    expect([x.status, x.code]).toEqual([409, "seit-vorschlag-geaendert"]);
    expect((await uebernehmen(v.vorschlag, [0], r.t.LT)).code).toBe("vorschlag-unbekannt");
    expect(await abdruck(r.name)).toBe(vorher);
  });
  it("Fehler beim ersten Schreibzugriff: nichts geschrieben (503), der Vorschlag bleibt nutzbar", async () => {
    const r = await raum();
    frei(true);
    const v = await vorschlag(r);
    const vorher = await abdruck(r.name);
    S.A._pruefhaken.ablage = kaputtAb(1);
    const x = await uebernehmen(v.vorschlag, [0, 1], r.t.LT);
    expect([x.status, x.code]).toEqual([503, "schreiben-fehlgeschlagen"]);
    S.A._pruefhaken.ablage = null;
    expect(await abdruck(r.name)).toBe(vorher);
    expect((await uebernehmen(v.vorschlag, [0, 1], r.t.LT)).status).toBe(200);
  });
  it("Fehler mitten im Schreiben (2./3./4./6. Zugriff): alles oder nichts — Patch, Änderungen, Protokoll und Rückgängig-Datensatz zusammen", async () => {
    for (const ab of [2, 3, 4, 6]) {
      const r = await raum();
      frei(true);
      const v = await vorschlag(r);
      const vor = await gespeichert(r.name);
      S.A._pruefhaken.ablage = kaputtAb(ab);
      const x = await uebernehmen(v.vorschlag, [0, 1], r.t.LT);
      S.A._pruefhaken.ablage = null;
      const m = await gespeichert(r.name);
      const teile = [
        v.eintraege.slice(0, 2).every((e) => m.abweichungen[`${e.personId}|${e.datum}`] === e.dienstId),
        (m.aenderungen || []).length === (vor.aenderungen || []).length + 2,
        (m.einstellungen.modulprotokoll || []).some((p) => p.art === "planer-uebernommen"),
        Array.isArray(m.planerRueckgaengig) && m.planerRueckgaengig.length === 1,
      ];
      expect(new Set(teile).size, `Zugriff ${ab}: ${JSON.stringify(teile)}`).toBe(1);
      expect(x.status === 200, `Zugriff ${ab}: Antwort ${x.status} ${x.code}`).toBe(teile[0]);
    }
  });
});

describe("5. Rückgängig", { timeout: 300000 }, () => {
  it("Prüfung zeigt die entstehende Unterbesetzung (nichts geschrieben); Rücknahme stellt die Vorwerte her; ein zweites Mal: 404 (einmalig)", async () => {
    const r = await raum();
    const vor = await gespeichert(r.name);
    const { u, gewaehlt } = await uebernommen(r, 3);
    const nachU = await abdruck(r.name);
    const p = await zuruecknehmen(u.uebernahme, r.t.LT, false);
    expect(p, JSON.stringify(p)).toMatchObject({ status: 200, geprueft: true, geschrieben: false, anzahl: 3 });
    expect(Array.isArray(p.unterbesetzt)).toBe(true);
    expect(p.unterbesetzt.map((x) => x.datum).sort()).toEqual([...new Set(gewaehlt.map((e) => e.datum))].sort());
    expect(JSON.stringify(p.unterbesetzt)).not.toMatch(/personId|Zuname/);
    expect(await abdruck(r.name)).toBe(nachU);
    const z = await zuruecknehmen(u.uebernahme, r.t.LT);
    expect(z, JSON.stringify(z)).toMatchObject({ status: 200, geschrieben: true, anzahl: 3 });
    const m = await gespeichert(r.name);
    expect(m.abweichungen).toEqual(vor.abweichungen);
    expect(JSON.stringify(m.angeheftet)).toBe(JSON.stringify(vor.angeheftet));
    expect(m.planerRueckgaengig).toBeUndefined();
    expect(m.einstellungen.modulprotokoll.at(-1)).toMatchObject({ modul: "planer", art: "planer-rueckgaengig", von: "leitung", anzahl: 3 });
    const nachZ = await abdruck(r.name);
    const replay = await zuruecknehmen(u.uebernahme, r.t.LT);
    expect([replay.status, replay.code]).toEqual([404, "rueckgaengig-unbekannt"]);
    expect(await abdruck(r.name)).toBe(nachZ);
  });
  it("nach zwischenzeitlicher Änderung oder Anheftung eines Schlüssels: abgelehnt, nichts geschrieben, Datensatz bleibt", async () => {
    for (const art of ["geaendert", "angeheftet"]) {
      const r = await raum();
      const { u, gewaehlt } = await uebernommen(r, 3);
      const b = kopie((await lesen(r.name)).bestand);
      const k = `${gewaehlt[1].personId}|${gewaehlt[1].datum}`;
      const index = b.mandanten[0].planerRueckgaengig[0].eintraege.findIndex((e) => e.schluessel === k);
      if (art === "geaendert") b.mandanten[0].abweichungen[k] = "-";
      else b.mandanten[0].angeheftet[k] = { am: T0, vonRolle: "leitung" };
      await S.B.bestandSchreiben(S.laden(), r.name, b, { durch: "Pruefung" });
      const vorher = await abdruck(r.name);
      const z = await zuruecknehmen(u.uebernahme, r.t.LT);
      expect([z.status, z.code], art).toEqual([422, "eintrag-abgelehnt"]);
      expect(z.abgelehnt, art).toEqual([{ index, grund: art === "geaendert" ? "seit-uebernahme-geaendert" : "angeheftet" }]);
      expect(await abdruck(r.name)).toBe(vorher);
    }
  });
  it("PUT /api/bestand (Rundweg und mitgeschickte Rückgängig-Daten) lässt den Datensatz unberührt; die Rücknahme geht danach", async () => {
    const r = await raum();
    const { u } = await uebernommen(r, 2);
    const satz = (await gespeichert(r.name)).planerRueckgaengig;
    for (const k of ["LT", "PL"]) {
      const g = await anfrage("/api/bestand", { token: r.t[k] });
      const b = kopie(g.bestand);
      b.mandanten[0].planerRueckgaengig = [{ id: `pu-${"a".repeat(32)}`, ym: YM, art: "planer-uebernahme", eintraege: [] }];
      const p = await anfrage("/api/bestand", { methode: "PUT", token: r.t[k], rumpf: { bestand: b, etag: g.etag, durch: "Pruefung" } });
      expect(p.status, `${k} ${JSON.stringify(p).slice(0, 300)}`).toBe(200);
      expect((await gespeichert(r.name)).planerRueckgaengig, k).toEqual(satz);
    }
    expect((await zuruecknehmen(`pu-${"a".repeat(32)}`, r.t.LT)).code).toBe("rueckgaengig-unbekannt");
    expect((await zuruecknehmen(u.uebernahme, r.t.LT)).status).toBe(200);
  });
});

describe("6. Fristen, Abschluss, Vergangenheit, Pause, Mandanten, Grenzen", { timeout: 300000 }, () => {
  it("Vorschlag nach 24 h: 410 abgelaufen, danach unbekannt; nichts geschrieben", async () => {
    const r = await raum();
    frei(true);
    const v = await vorschlag(r);
    expect(Date.parse(v.gueltigBis) - Date.parse(T0)).toBe(S.A.VORSCHLAG_FRIST.hoechstMs);
    const vorher = await abdruck(r.name);
    vi.setSystemTime(new Date(Date.parse(T0) + S.A.VORSCHLAG_FRIST.hoechstMs + 1000));
    await frisch(r);
    expect((await uebernehmen(v.vorschlag, [0], r.t.LT)).code).toBe("vorschlag-abgelaufen");
    expect((await uebernehmen(v.vorschlag, [0], r.t.LT)).code).toBe("vorschlag-unbekannt");
    expect(await abdruck(r.name)).toBe(vorher);
  });
  it("Rückgängig-Datensatz: nach Monatsende + Nachfrist 410; abgeschlossener Monat 409 monat-abgeschlossen", async () => {
    const r = await raum();
    const { u } = await uebernommen(r, 2);
    vi.setSystemTime(new Date("2027-01-08T12:00:00.000Z"));
    await frisch(r);
    expect((await zuruecknehmen(u.uebernahme, r.t.LT)).code).toBe("rueckgaengig-abgelaufen");
    vi.setSystemTime(new Date(T0));
    const r2 = await raum();
    const { u: u2 } = await uebernommen(r2, 2);
    const b = kopie((await lesen(r2.name)).bestand);
    b.mandanten[0].monatsabschluss = { [YM]: { abgeschlossen: true } };
    await S.B.bestandSchreiben(S.laden(), r2.name, b, { durch: "Pruefung" });
    const vorher = await abdruck(r2.name);
    expect((await zuruecknehmen(u2.uebernahme, r2.t.LT)).code).toBe("monat-abgeschlossen");
    expect((await vorschlag(r2)).code).toBe("monat-abgeschlossen");
    expect(await abdruck(r2.name)).toBe(vorher);
  });
  it("B-1 greift durch: vergangener Monat, Monat nach dem Vorschlag abgeschlossen, Tag inzwischen vergangen", async () => {
    const r = await raum();
    frei(true);
    expect((await vorschlag(r, r.t.LT, "2026-10")).code).toBe("vergangen");
    const v = await vorschlag(r);
    const b = kopie((await lesen(r.name)).bestand);
    b.mandanten[0].monatsabschluss = { [YM]: { abgeschlossen: true } };
    await S.B.bestandSchreiben(S.laden(), r.name, b, { durch: "Pruefung" });
    const vorher = await abdruck(r.name);
    expect((await uebernehmen(v.vorschlag, [0], r.t.LT)).code).toBe("monat-abgeschlossen");
    expect(await abdruck(r.name)).toBe(vorher);
    /* Laufender Monat am Abend erzeugt, nach Mitternacht übernommen: der Vortag ist vergangen. */
    vi.setSystemTime(new Date("2026-11-27T21:00:00.000Z"));
    const r2 = await raum();
    const v2 = await vorschlag(r2, r2.t.LT, "2026-11");
    expect(v2.status, JSON.stringify(v2).slice(0, 300)).toBe(201);
    const heute = v2.eintraege.filter((e) => e.datum === "2026-11-27");
    expect(heute.length).toBeGreaterThan(0);
    vi.setSystemTime(new Date("2026-11-28T00:30:00.000Z"));
    await frisch(r2);
    const vorher2 = await abdruck(r2.name);
    const x = await uebernehmen(v2.vorschlag, [heute[0].index], r2.t.LT);
    expect([x.status, x.code, x.abgelehnt]).toEqual([422, "eintrag-abgelehnt", [{ index: 0, grund: "vergangen" }]]);
    expect(await abdruck(r2.name)).toBe(vorher2);
  });
  it("Pause (auch unlesbar) und Planer-Schalter aus: kein Vorschlag, keine Übernahme eines gehaltenen Vorschlags (fail closed)", async () => {
    const r = await raum();
    frei(true);
    const v = await vorschlag(r);
    const b = kopie((await lesen(r.name)).bestand);
    b.mandanten[0].einstellungen.kiSteuerung = { ...structuredClone(FREI), pause: { aktiv: true, ...st } };
    await S.B.bestandSchreiben(S.laden(), r.name, b, { durch: "Pruefung" });
    const vorher = await abdruck(r.name);
    expect((await uebernehmen(v.vorschlag, [0], r.t.LT)).code).toBe("planer-pausiert");
    expect((await vorschlag(r)).code).toBe("planer-pausiert");
    for (const steuerung of [{ ...structuredClone(FREI), pause: { aktiv: true } }, { ...structuredClone(FREI), planerSchalter: { an: false, ...st } }, "kaputt"]) {
      const r2 = await raum({ steuerung });
      const x = await vorschlag(r2);
      expect(x.status, JSON.stringify(steuerung)).toBe(409);
      expect(["planer-pausiert", "planer-im-betrieb-aus"]).toContain(x.code);
    }
    expect(await abdruck(r.name)).toBe(vorher);
  });
  it("Mandantentrennung: Betrieb B kann Vorschlag und Rückgängig-Datensatz von Betrieb A nie nutzen", async () => {
    const a = await raum({ id: "m-a" });
    const b = await raum({ id: "m-b" });
    frei(true);
    const vA = await vorschlag(a);
    const vorherB = await abdruck(b.name);
    expect((await uebernehmen(vA.vorschlag, [0], b.t.LT)).code).toBe("vorschlag-unbekannt");
    const uA = await uebernehmen(vA.vorschlag, [0, 1], a.t.LT);
    expect(uA.status).toBe(200);
    for (const bestaetigt of [false, true]) expect((await zuruecknehmen(uA.uebernahme, b.t.LT, bestaetigt)).code).toBe("rueckgaengig-unbekannt");
    expect(await abdruck(b.name)).toBe(vorherB);
    expect((await gespeichert(a.name)).planerRueckgaengig.map((x) => x.id)).toEqual([uA.uebernahme]);
  });
  it("Mandantentrennung im selben Raum: gleiche Person-Kennung in Betrieb B kann Vorschlag und Datensatz von Betrieb A nicht nutzen", async () => {
    const g = bestandFuer("m-a");
    g.mandanten.push(bestandFuer("m-b").mandanten[0]);
    const r = await raum({ bestand: g });
    const tB = (await S.sitzungAnlegen({ bestand: r.name, name: "Stab l1", rolle: "leitung", person: "l1", betrieb: 1, mandantId: "m-b", einheit: null }, 30 * 24 * 3600 * 1000)).token;
    frei(true);
    const vA = await vorschlag(r);
    expect(vA.status).toBe(201);
    const vorher = await abdruck(r.name);
    expect((await uebernehmen(vA.vorschlag, [0], tB)).code).toBe("vorschlag-unbekannt");
    expect(await abdruck(r.name)).toBe(vorher);
    const uA = await uebernehmen(vA.vorschlag, [0], r.t.LT);
    expect(uA.status).toBe(200);
    const nachA = await abdruck(r.name);
    expect((await zuruecknehmen(uA.uebernahme, tB)).code).toBe("rueckgaengig-unbekannt");
    expect(await abdruck(r.name)).toBe(nachA);
    expect((await lesen(r.name)).bestand.mandanten[1].planerRueckgaengig).toBeUndefined();
  });
  it("Größenlimit: mehr als 2000 gewählte Einträge → 413; höchstens zehn Rückgängig-Datensätze je Betrieb, der älteste fällt weg", async () => {
    const r = await raum();
    frei(true);
    const v = await vorschlag(r);
    const x = await uebernehmen(v.vorschlag, Array.from({ length: 2001 }, (_, i) => i), r.t.LT);
    expect([x.status, x.code]).toEqual([413, "auswahl-zu-gross"]);
    const ids = [];
    for (let i = 0; i < S.R.RUECKGAENGIG_GRENZE.saetze + 1; i++) {
      vi.setSystemTime(new Date(Date.parse(T0) + i * 60000));
      const w = await vorschlag(r);
      const u = await uebernehmen(w.vorschlag, [0], r.t.LT);
      expect(u.status, JSON.stringify(u).slice(0, 200)).toBe(200);
      expect(u.rueckgaengigVerdraengt, `Übernahme ${i}`).toBe(i < S.R.RUECKGAENGIG_GRENZE.saetze ? 0 : 1);
      ids.push(u.uebernahme);
    }
    const m = await gespeichert(r.name);
    expect(m.planerRueckgaengig.map((s) => s.id)).toEqual(ids.slice(1));
    expect((await zuruecknehmen(ids[0], r.t.LT)).code).toBe("rueckgaengig-unbekannt");
  });
  it("Aufbewahrungslauf: zählt fällige Datensätze und räumt sie nach Datum; ohne Feld unverändert", async () => {
    const r = await raum();
    await uebernommen(r, 2);
    const m = await gespeichert(r.name);
    expect(S.R.rueckgaengigRaeumen(m, "2027-01-07")).toBe(m);
    expect(S.AUF.vorschau(m, "2027-01-07").planerRueckgaengig).toBe(0);
    expect(S.AUF.vorschau(m, "2027-01-08").planerRueckgaengig).toBe(1);
    const g = S.AUF.raeumen(m, "2027-01-08");
    expect(Object.prototype.hasOwnProperty.call(g.mandant, "planerRueckgaengig")).toBe(false);
    expect(S.AUF.berichtstext(g.bericht)).toMatch(/1 Rückgängig-Datensatz/);
    const ohne = { ...m };
    delete ohne.planerRueckgaengig;
    expect(S.R.rueckgaengigRaeumen(ohne, "2027-01-08")).toBe(ohne);
    expect(S.AUF.vorschau(ohne, "2027-01-08").planerRueckgaengig).toBe(0);
  });
});

describe("7. Verdrahtung und Quelltext-Leitplanken", () => {
  it("eigene Aktion: kein zusammenfuehren/anheftenZusammen/PUT, kein Feld aus dem Rumpf außer Kennung, Auswahl, Monat und Bestätigung", async () => {
    const q = (await readFile(path.join(WURZEL, "server/lib/planer-aktion.mjs"), "utf8")).replace(/\/\*[\s\S]*?\*\//g, "");
    for (const x of ["zusammenfuehren(", "anheftenZusammen", "...rumpf", "rumpf.freigabe", "rumpf.rolle", "rumpf.demo", "rumpf.basis", "rumpf.gesetzt", "Math.random"])
      expect(q.includes(x), x).toBe(false);
    expect(q).toContain("rumpf.bestaetigt === true");
    expect(q).toContain("(PLANER_AN) === true");
    const T = await import("../server/lib/teilweg.mjs");
    expect(T.NUR_SERVER).toContain("planerRueckgaengig");
    expect(T.KERNFELDER.includes("planerRueckgaengig")).toBe(false);
    const sicht = await import("../server/lib/sicht.mjs");
    expect(Object.prototype.hasOwnProperty.call(sicht.BETRIEB, "planerRueckgaengig")).toBe(false);
    const d = await readFile(path.join(WURZEL, "server/funktionen/daten.mjs"), "utf8");
    const block = d.slice(d.indexOf('pfad === "planer-vorschlag"'), d.indexOf('pfad === "abmelden" && req.method === "POST") {', d.indexOf('pfad === "planer-vorschlag"')));
    expect(block.indexOf("planerAktionErlaubt(s)")).toBeLessThan(block.indexOf('bremse("schreiben"'));
    expect(block.indexOf('bremse("schreiben"')).toBeLessThan(block.indexOf("planerAktion(pfad"));
    expect(block.includes("bestandSchreiben")).toBe(false);
  });
});

describe("8. Nachträge Review #614 (C-2, C-3, C-7)", { timeout: 300000 }, () => {
  it("C-3: Vorschlag mit mehr als 2000 Einträgen → 413 vorschlag-zu-gross, nichts gehalten", async () => {
    const r = await raum();
    frei(true);
    globalThis.__planerErsatz = (m, ym) => ({ status: "ok", modus: "knopfdruck", offen: [],
      gesetzt: Array.from({ length: 2001 }, (_, i) => ({ personId: `p${(i % 4) + 1}`, datum: `${ym}-${String((i % 28) + 1).padStart(2, "0")}`, dienstId: "F", art: "luecke" })) });
    const n0 = S.A._vorschlaege.anzahl();
    const x = await vorschlag(r);
    expect([x.status, x.code]).toEqual([413, "vorschlag-zu-gross"]);
    expect(S.A._vorschlaege.anzahl()).toBe(n0);
  });
  it("C-3: Schreiben scheitert und das Nachlesen auch → 500 schreiben-unklar; nichts geschrieben", async () => {
    const r = await raum();
    frei(true);
    const v = await vorschlag(r);
    const vorher = await abdruck(r.name);
    S.A._pruefhaken.ablage = kaputtAb(1);
    S.A._pruefhaken.nachlesen = (store) => new Proxy(store, { get(t, k) { const f = t[k]; return typeof f === "function" ? async () => { throw new Error("Lesen gestört (Pruefung)"); } : f; } });
    const x = await uebernehmen(v.vorschlag, [0], r.t.LT);
    expect([x.status, x.code]).toEqual([500, "schreiben-unklar"]);
    S.A._pruefhaken.ablage = null;
    S.A._pruefhaken.nachlesen = null;
    expect(await abdruck(r.name)).toBe(vorher);
  });
  it("C-3: bestand-anlegen und die Neuanlage eines Betriebs durch den Betreiber verwerfen mitgebrachte Rückgängig-Daten", async () => {
    const name = `wpi7pua-anlegen-${++raumNr}`;
    const tB = (await S.sitzungAnlegen({ bestand: name, name: "Betreiber", rolle: "betreiber", person: null, betrieb: 0, mandantId: null, einheit: null }, 3600e3)).token;
    const g = bestandFuer("m-x");
    g.mandanten[0].planerRueckgaengig = [{ id: `pu-${"b".repeat(32)}`, ym: YM, art: "planer-uebernahme", eintraege: [] }];
    const a = await anfrage("/api/bestand-anlegen", { methode: "POST", token: tB, rumpf: { bestand: name, inhalt: S.G.personenAngleichen(g) } });
    expect(a.status, JSON.stringify(a).slice(0, 300)).toBe(200);
    expect(Object.prototype.hasOwnProperty.call(await gespeichert(name), "planerRueckgaengig")).toBe(false);
    const RE = await import("../server/lib/rechte.mjs");
    const alt = bestandFuer("m-alt");
    const neuM = { ...bestandFuer("m-neu").mandanten[0], planerRueckgaengig: [{ id: `pu-${"c".repeat(32)}`, ym: YM, art: "planer-uebernahme", eintraege: [] }] };
    const z = RE.zusammenfuehren(alt, { ...alt, mandanten: [...alt.mandanten, neuM] }, { rolle: "betreiber", person: null, betrieb: 0 });
    const angelegt = z.mandanten.find((x) => x && x.id === "m-neu");
    expect(angelegt, JSON.stringify(z).slice(0, 200)).toBeTruthy();
    expect(Object.prototype.hasOwnProperty.call(angelegt, "planerRueckgaengig")).toBe(false);
  });
  it("C-7: ohne vitest-Umgebung sind die Prüf-Haken wirkungslos (Produktivpfad schreibt trotz gesetztem Fehlerhaken)", async () => {
    const r = await raum();
    frei(true);
    const v = await vorschlag(r);
    const alt = process.env.VITEST;
    S.A._pruefhaken.ablage = kaputtAb(1);
    delete process.env.VITEST;
    let x;
    try { x = await uebernehmen(v.vorschlag, [0], r.t.LT); } finally { process.env.VITEST = alt; S.A._pruefhaken.ablage = null; }
    expect(x.status, JSON.stringify(x)).toBe(200);
    expect(() => { /** @type {any} */ (S.A._pruefhaken).freigabe = true; }).toThrow();
  });
  it("C-2: eine Prüfung (ohne Bestätigung) löscht nie die Marke einer laufenden Übernahme", async () => {
    const r = await raum();
    frei(true);
    const v = await vorschlag(r);
    let freiSperre, freiHaken;
    const sperre = new Promise((ok) => { freiSperre = ok; });
    const halt = new Promise((ok) => { freiHaken = ok; });
    const gehalten = S.B.unterRaumsperre(r.name, () => sperre);
    const pruefung = uebernehmen(v.vorschlag, [0], r.t.LT, false);
    await new Promise((ok) => setTimeout(ok, 50));
    S.A._pruefhaken.vorSchreiben = () => halt;
    const echt = uebernehmen(v.vorschlag, [0], r.t.LT);
    await new Promise((ok) => setTimeout(ok, 50));
    freiSperre();
    await gehalten;
    const p = await pruefung;
    expect(p.status).toBe(200);
    const dritte = await uebernehmen(v.vorschlag, [0], r.t.LT);
    expect([dritte.status, dritte.code]).toEqual([409, "uebernahme-laeuft"]);
    freiHaken();
    expect((await echt).status).toBe(200);
  });
});

describe("9. Vor Freigabe von PLANER_AN: Grenze der Vorschläge je Besitzer statt prozessweit (Review #614 C-1)", { timeout: 300000 }, () => {
  const MONATE = ["2026-12", "2027-01", "2027-02", "2027-03", "2027-04", "2027-05"];
  const roh = (id) => S.A._vorschlaege.roh(id);
  let uhr = Date.parse(T0);
  const tick = () => { uhr += 60000; vi.setSystemTime(new Date(uhr)); };   // jeder Vorschlag hat eine eigene Entstehungszeit
  const frischeGrenzen = (extra = {}) => { S.A._pruefhaken.hoechst = { ...S.A.VORSCHLAG_HOECHST, ...extra }; };
  /** Vorschläge für n Monate ab Index `ab`; jeder muss entstehen (201). */
  async function mehrere(r, token, n, ab = 0) {
    const ids = [];
    for (const ym of MONATE.slice(ab, ab + n)) {
      tick();
      const v = await vorschlag(r, token, ym);
      expect(v.status, `${ym}: ${JSON.stringify(v).slice(0, 200)}`).toBe(201);
      ids.push(v.vorschlag);
    }
    return ids;
  }
  const vorbereiten = async () => { uhr = Date.parse(T0); S.A._vorschlaege.leeren(); S.A._pruefhaken.hoechst = null; frei(true); return raum(); };
  afterEach(() => { S.A._pruefhaken.hoechst = null; });

  it("Grenzen: je Besitzer 5, je Raum 30, gesamt 2000 Vorschläge und 100000 Einteilungen — nicht mehr 5 je Raum und 50 gesamt", () => {
    expect(S.A.VORSCHLAG_HOECHST).toEqual({ jeBesitzer: 5, jeRaum: 30, jeRaumEintraege: 10000, gesamt: 2000, gesamtEintraege: 100000 });
    expect(S.A.VORSCHLAG_HOECHST.jeRaumEintraege * 10).toBeLessThanOrEqual(S.A.VORSCHLAG_HOECHST.gesamtEintraege);   // Raum höchstens ein Zehntel der Gesamtgröße
    expect(Object.isFrozen(S.A.VORSCHLAG_HOECHST)).toBe(true);
  });
  it("zwei Besitzer (Leitung, Planung) im selben Raum und ein zweiter Raum blockieren sich nicht", async () => {
    const r = await vorbereiten();
    const r2 = await raum();
    const a = await mehrere(r, r.t.LT, 5);
    const b = await mehrere(r, r.t.LT2, 3);          // früher 429: je Raum höchstens 5
    const c = await mehrere(r, r.t.PL, 2);
    const d = await mehrere(r2, r2.t.LT, 5);         // früher bei 50 gesamt von wenigen Räumen blockierbar
    for (const id of [...a, ...b, ...c, ...d]) expect(roh(id), id).not.toBeNull();
    expect(S.A._vorschlaege.anzahl()).toBe(15);
  });
  it("der sechste Vorschlag desselben Besitzers verdrängt den ÄLTESTEN eigenen (statt 429); die übrigen vier und der neue bleiben benutzbar", async () => {
    const r = await vorbereiten();
    const ids = await mehrere(r, r.t.LT, 5);
    tick();                                                // der neue ist jünger
    const sechs = await vorschlag(r, r.t.LT, MONATE[5]);
    expect(sechs.status, JSON.stringify(sechs).slice(0, 200)).toBe(201);
    expect(roh(ids[0])).toBeNull();
    for (const id of [...ids.slice(1), sechs.vorschlag]) expect(roh(id), id).not.toBeNull();
    expect(S.A._vorschlaege.anzahl()).toBe(5);
    const weg = await uebernehmen(ids[0], [0], r.t.LT, false);
    expect([weg.status, weg.code]).toEqual([404, "vorschlag-unbekannt"]);
    const bleibt = await uebernehmen(ids[1], [0], r.t.LT, false);
    expect(bleibt.status, JSON.stringify(bleibt).slice(0, 200)).toBe(200);
    /* Derselbe Monat ersetzt den eigenen alten wie bisher (kein zusätzlicher Platz). */
    const nochmal = await vorschlag(r, r.t.LT, MONATE[5]);
    expect(nochmal.status).toBe(201);
    expect(roh(sechs.vorschlag)).toBeNull();
    expect(S.A._vorschlaege.anzahl()).toBe(5);
  });
  it("Verdrängung nie über Besitzer hinweg: der sechste Vorschlag der Planung lässt die fünf der Leitung unberührt", async () => {
    const r = await vorbereiten();
    const leitung = await mehrere(r, r.t.LT, 5);
    const planung = await mehrere(r, r.t.PL, 5);
    const sechs = await vorschlag(r, r.t.PL, MONATE[5]);
    expect(sechs.status).toBe(201);
    expect(roh(planung[0])).toBeNull();
    for (const id of leitung) expect(roh(id), id).not.toBeNull();
    for (const id of [...planung.slice(1), sechs.vorschlag]) expect(roh(id), id).not.toBeNull();
    expect(S.A._vorschlaege.anzahl()).toBe(10);
  });
  it("ein laufender Vorschlag (läuft) wird nie verdrängt; sind alle fünf laufend, gibt es 429 und nichts geht verloren", async () => {
    const r = await vorbereiten();
    const ids = await mehrere(r, r.t.LT, 5);
    roh(ids[0]).laeuft = true;                              // der älteste läuft gerade
    const x = await vorschlag(r, r.t.LT, MONATE[5]);
    expect(x.status).toBe(201);
    expect(roh(ids[0])).not.toBeNull();                     // geblieben
    expect(roh(ids[1])).toBeNull();                         // der älteste NICHT laufende ist weg
    const rest = [ids[0], ...ids.slice(2), x.vorschlag];
    for (const id of rest) expect(roh(id), id).not.toBeNull();
    for (const id of rest) roh(id).laeuft = true;           // alle laufend: nichts zu verdrängen
    const vorher = S.A._vorschlaege.anzahl();
    const y = await vorschlag(r, r.t.LT, MONATE[1]);
    expect([y.status, y.code]).toEqual([429, "zu-viele-vorschlaege"]);
    expect(S.A._vorschlaege.anzahl()).toBe(vorher);
    for (const id of rest) { expect(roh(id), id).not.toBeNull(); roh(id).laeuft = false; }
  });
  it("Verdrängt wird erst, wenn der neue Vorschlag wirklich entsteht: schlägt der Planlauf fehl, bleiben alle fünf", async () => {
    const r = await vorbereiten();
    const ids = await mehrere(r, r.t.LT, 5);
    globalThis.__planerErsatz = () => { throw new Error("Planlauf gestört (Prüfung)"); };
    const x = await vorschlag(r, r.t.LT, MONATE[5]);
    expect([x.status, x.code]).toEqual([500, "pruefung-fehlgeschlagen"]);
    globalThis.__planerErsatz = undefined;
    for (const id of ids) expect(roh(id), id).not.toBeNull();
    expect(S.A._vorschlaege.anzahl()).toBe(5);
  });
  it("die globale Obergrenze (Zahl) greift weiter: 429, ohne dass ein fremder Vorschlag verdrängt wird", async () => {
    const r = await vorbereiten();
    frischeGrenzen({ gesamt: 3 });
    const a = await mehrere(r, r.t.LT, 1), b = await mehrere(r, r.t.LT2, 1), c = await mehrere(r, r.t.PL, 1);
    const r2 = await raum();
    const x = await vorschlag(r2, r2.t.LT, MONATE[0]);
    expect([x.status, x.code]).toEqual([429, "zu-viele-vorschlaege"]);
    for (const id of [...a, ...b, ...c]) expect(roh(id), id).not.toBeNull();
    expect(S.A._vorschlaege.anzahl()).toBe(3);
    /* Wer schon einen Vorschlag für den Monat hält, ersetzt ihn auch an der Grenze. */
    const ersetzt = await vorschlag(r, r.t.LT, MONATE[0]);
    expect(ersetzt.status).toBe(201);
    expect(S.A._vorschlaege.anzahl()).toBe(3);
  });
  it("die globale Obergrenze nach Größe (Summe der Einteilungen) greift weiter; ein Ersatz im selben Monat passt trotzdem hinein", async () => {
    const r = await vorbereiten();
    const r2 = await raum();
    const erst = await vorschlag(r, r.t.LT, MONATE[0]);
    expect(erst.status).toBe(201);
    frischeGrenzen({ gesamtEintraege: erst.eintraege.length });
    const x = await vorschlag(r2, r2.t.LT, MONATE[0]);
    expect([x.status, x.code]).toEqual([429, "zu-viele-vorschlaege"]);
    expect(roh(erst.vorschlag)).not.toBeNull();
    const ersatz = await vorschlag(r, r.t.LT, MONATE[0]);
    expect(ersatz.status).toBe(201);
    expect(roh(erst.vorschlag)).toBeNull();
  });
  it("die Grenze je Raum greift weiter (mehrere Planende); ein anderer Raum bleibt frei", async () => {
    const r = await vorbereiten();
    frischeGrenzen({ jeRaum: 2 });
    await mehrere(r, r.t.LT, 1);
    await mehrere(r, r.t.LT2, 1);
    const x = await vorschlag(r, r.t.PL, MONATE[0]);
    expect([x.status, x.code]).toEqual([429, "zu-viele-vorschlaege"]);
    const r2 = await raum();
    expect((await vorschlag(r2, r2.t.LT, MONATE[0])).status).toBe(201);
  });
  it("Größe je Raum (Review #616 B-1): ein Raum an der Grenze sperrt nur sich selbst, ein anderer Raum bleibt frei; kein fremder Vorschlag wird verdrängt", async () => {
    const r = await vorbereiten();
    const r2 = await raum();
    const erst = await vorschlag(r, r.t.LT, MONATE[0]);
    expect(erst.status).toBe(201);
    frischeGrenzen({ jeRaumEintraege: erst.eintraege.length });   // der Raum ist damit voll
    const voll = await vorschlag(r, r.t.LT2, MONATE[1]);          // anderer Besitzer im selben Raum: nur abweisen, nie den fremden verdrängen
    expect([voll.status, voll.code]).toEqual([429, "zu-viele-vorschlaege"]);
    expect(roh(erst.vorschlag)).not.toBeNull();
    const frei2 = await vorschlag(r2, r2.t.LT, MONATE[0]);        // der andere Raum ist nicht betroffen
    expect(frei2.status).toBe(201);
    expect(S.A._vorschlaege.anzahl()).toBe(2);
    const ersatz = await vorschlag(r, r.t.LT, MONATE[0]);         // der eigene Ersatz im selben Monat passt in den Platz des alten
    expect(ersatz.status).toBe(201);
    expect(roh(erst.vorschlag)).toBeNull();
    expect(roh(frei2.vorschlag)).not.toBeNull();
  });
  it("Raumgrenze gilt je Raum UND Betrieb (Review #616 C-1): ein zweiter Betrieb desselben Raums wird vom ersten nicht gesperrt", async () => {
    S.A._vorschlaege.leeren();
    frei(true);
    const g = bestandFuer("m-a");
    g.mandanten.push(bestandFuer("m-b").mandanten[0]);
    const r = await raum({ bestand: g });
    const tB = (await S.sitzungAnlegen({ bestand: r.name, name: "Stab l1", rolle: "leitung", person: "l1", betrieb: 1, mandantId: "m-b", einheit: null }, 30 * 24 * 3600 * 1000)).token;
    frischeGrenzen({ jeRaum: 1 });
    expect((await vorschlag(r, r.t.LT, MONATE[0])).status).toBe(201);
    const zwei = await vorschlag(r, r.t.LT2, MONATE[0]);          // gleicher Betrieb: voll
    expect([zwei.status, zwei.code]).toEqual([429, "zu-viele-vorschlaege"]);
    const b = await vorschlag(r, tB, MONATE[0]);                  // anderer Betrieb im selben Raum: frei
    expect(b.status, JSON.stringify(b).slice(0, 200)).toBe(201);
  });
  it("Gleichstand der Entstehungszeit (Review #616 D-2): bei gleicher Zeit fällt der zuerst angelegte eigene Vorschlag weg", async () => {
    const r = await vorbereiten();
    const ids = [];
    for (const ym of MONATE.slice(0, 5)) {                         // ohne tick(): alle fünf mit derselben Serveruhr
      const v = await vorschlag(r, r.t.LT, ym);
      expect(v.status).toBe(201);
      ids.push(v.vorschlag);
    }
    expect(new Set(ids.map((id) => roh(id).angelegt)).size).toBe(1);
    const sechs = await vorschlag(r, r.t.LT, MONATE[5]);
    expect(sechs.status).toBe(201);
    expect(roh(ids[0])).toBeNull();
    for (const id of [...ids.slice(1), sechs.vorschlag]) expect(roh(id), id).not.toBeNull();
  });
});
