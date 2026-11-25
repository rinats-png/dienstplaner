/* ==========================================================================
   MODINERT-L4 — Rechnungen serverseitig validieren und unveränderlich
   (Audit Modul-inert 2026-11-24, Lücke L-4; G9: serverseitige, unveränderliche
   Abrechnung, Zustimmung vor Abrechnung, kein Auto-Pilot, keine Auto-Buchung)

   Angriffsliste (A1–A17) gegen den Betreiber-Schreibweg PUT /api/bestand und
   POST /api/bestand-anlegen, einmal rein (server/lib/rechnungsausgang.mjs),
   einmal über den echten Handler. Vor dem Fix speicherte der Server jeden
   dieser Inhalte ungeprüft (siehe PR-Beschreibung, Stand origin 66ad2a20).

   Nur synthetische Daten. Reiner Teil mit festen Tagen; der Handler setzt den
   Servertag selbst, geprüft wird nur, dass er nicht der mitgeschickte ist.
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { rechnungenPruefen, altformFehler, RECHNUNG_CODE, RECHNUNG_GRENZEN, SERVERFELDER } from "../server/lib/rechnungsausgang.mjs";
import { BRANCHENMODULE } from "../server/lib/branchenmodule.mjs";

const HEUTE = "2026-11-25";
const JETZT = "2026-11-25T10:00:00.000Z";
const kopie = (x) => JSON.parse(JSON.stringify(x));
const BETRIEB = { id: "m1", name: "Testbetrieb Synth GmbH", status: "aktiv", pakete: [] };
const FREMD = { id: "m2", name: "Fremdbetrieb Synth", status: "aktiv", pakete: [] };

/** Eine gültige Rechnung, wie baueRechnung sie baut (synthetisch). */
const rg = (nummer = "202610-SYN1", extra = {}) => ({
  nummer, datum: "2026-11-25", faellig: "2026-12-09", zeitraum: "Oktober 2026", monat: "2026-10",
  mandantId: "m1", mandant: "Testbetrieb Synth GmbH", anschrift: "Synthweg 1\n00000 Prüfstadt",
  betreiber: { firma: "Betreiber Synth", anschrift: "Musterweg 1\n00000 Ort", ustId: "DE000000000", iban: "DE00 0000", steuersatz: 19, zahlungsziel: 14 },
  positionen: [{ text: "Grundgebühr Basis", menge: "1 Planer, 1 Standort inklusive", einzel: "89,00 €", betrag: "89,00 €" }],
  netto: 89, rabattBetrag: 0, rabattText: "", steuersatz: 19, steuer: 16.91, brutto: 105.91, standorte: 1, personen: 12, tarif: "Basis",
  ...extra });
const PAKETPOS = { text: "Branchenpaket Sicherheitsdienst", menge: "", einzel: "79,00 €", betrag: "79,00 €", paketId: "sicherheit" };
const O = (x = {}) => ({ mandanten: [BETRIEB, FREMD], heute: HEUTE, jetzt: JETZT, ...x });
const code = (e) => ("fehler" in e ? e.fehler.code : "ok");

/* Zustand 5 nur im Test (eingespritzt, wie g9-nachtrag.test.js). */
const ABNAHME = { datum: "2026-12-01", nachweis: "docs/acc45/abnahme-test.md" };
const z5 = (id) => ({ liste: BRANCHENMODULE.map((m) => (m.pakete.includes(id) ? { ...m, status: "vorlaeufig", abnahme: ABNAHME, ausnahmeUi: true } : m)),
  freigaben: { [id]: { stufe: "buchbar", datum: "2026-12-15", von: "Betreiber", nachweis: "docs/acc45/freigabe-test.md" } } });

/* ======================================================================== */
describe("L-4 rein: rechnungenPruefen", () => {
  it("gültige neue Rechnung: angenommen; lfd, erstellt, datum, faellig vom Server", () => {
    const e = rechnungenPruefen([rg("202610-SYN1", { datum: "2020-01-01", faellig: "2020-01-15" })], [], O());
    expect(code(e)).toBe("ok");
    expect(e.rechnungen[0]).toMatchObject({ lfd: 1, erstellt: JETZT, datum: HEUTE, faellig: "2026-12-09" });
    expect(e).toMatchObject({ neu: 1, lfdVon: 1, lfdBis: 1 });
  });
  it("A1 Paketposition mit Kennung bei Zustand 1 (heute jedes Paket): abgewiesen", () => {
    for (const id of ["sicherheit", "pflege", "klinik", "industrie", "kern"]) {
      const e = rechnungenPruefen([rg("R-1", { positionen: [{ ...PAKETPOS, paketId: id }] })], [], O());
      expect(code(e), id).toBe(RECHNUNG_CODE.PAKET);
    }
  });
  it("A2 Paketposition ohne Kennung (nur Text „Branchenpaket …“): abgewiesen", () => {
    const { paketId: _w, ...ohne } = PAKETPOS; void _w;
    expect(code(rechnungenPruefen([rg("R-1", { positionen: [ohne] })], [], O()))).toBe(RECHNUNG_CODE.PAKET);
    expect(code(rechnungenPruefen([rg("R-1", { positionen: [{ ...ohne, text: "branchenpaket pflege" }] })], [], O()))).toBe(RECHNUNG_CODE.PAKET);
  });
  it("A1 Gegenprobe Zustand 5: nur mit Abrechnungsgrund vor dem Monat und ohne Pilot im Monat", () => {
    const o = { ...z5("sicherheit"), heute: "2027-02-10", jetzt: JETZT };
    const r = rg("R-5", { monat: "2027-01", positionen: [PAKETPOS] });
    const mit = { ...BETRIEB, pakete: ["sicherheit"], paketZustimmungen: [{ paket: "sicherheit", datum: "2026-12-20", preis: 79, intervall: "monatlich", von: "Kunde" }] };
    expect(code(rechnungenPruefen([r], [], { ...o, mandanten: [{ ...BETRIEB, pakete: ["sicherheit"] }] })), "ohne Grund").toBe(RECHNUNG_CODE.PAKET);
    expect(code(rechnungenPruefen([r], [], { ...o, mandanten: [mit] })), "mit Grund").toBe("ok");
    const pilot = { ...mit, preisgestaltung: { pilot: { seit: "2026-12-01", von: "Betreiber", grund: "Pilot" } } };
    expect(code(rechnungenPruefen([r], [], { ...o, mandanten: [pilot] })), "Pilot").toBe(RECHNUNG_CODE.PAKET);
    const { monat: _m, ...ohneMonat } = r; void _m;
    expect(code(rechnungenPruefen([ohneMonat], [], { ...o, mandanten: [mit] })), "ohne Monat").toBe(RECHNUNG_CODE.PAKET);
    /* „in der Stufe enthalten“: buchbar genügt, kein Preis, kein Grund */
    const frei = rg("R-6", { monat: "2027-01", positionen: [{ ...PAKETPOS, einzel: "0,00 €", betrag: "0,00 €", frei: true }] });
    expect(code(rechnungenPruefen([frei], [], { ...o, mandanten: [{ ...BETRIEB, pakete: ["sicherheit"] }] }))).toBe("ok");
    expect(code(rechnungenPruefen([{ ...rg("R-7"), positionen: [{ text: "x", frei: true }] }], [], O()))).toBe(RECHNUNG_CODE.FORM);
  });
  it("A3 gespeicherte Rechnung ändern (Betrag, Name, Position): abgewiesen", () => {
    const alt = [{ ...rg("R-1"), lfd: 1, erstellt: JETZT }];
    for (const f of [(x) => { x.brutto = 1; }, (x) => { x.mandant = "Anders"; }, (x) => { x.positionen[0].betrag = "0,00 €"; }, (x) => { x.mandantId = "m2"; }]) {
      const neu = kopie(alt); f(neu[0]);
      expect(code(rechnungenPruefen(neu, alt, O()))).toBe(RECHNUNG_CODE.UNVERAENDERLICH);
    }
  });
  it("A4 gespeicherte Rechnung löschen (auch alle): abgewiesen", () => {
    const alt = [{ ...rg("R-1"), lfd: 1 }, { ...rg("R-2"), lfd: 2 }];
    expect(code(rechnungenPruefen([], alt, O()))).toBe(RECHNUNG_CODE.UNVERAENDERLICH);
    expect(code(rechnungenPruefen([alt[1]], alt, O()))).toBe(RECHNUNG_CODE.UNVERAENDERLICH);
    expect(code(rechnungenPruefen(null, alt, O()))).toBe(RECHNUNG_CODE.FORM);
  });
  it("A5 Status „bezahlt“/„storniert“ an gespeicherter oder neuer Rechnung: abgewiesen", () => {
    const alt = [{ ...rg("R-1"), lfd: 1 }];
    expect(code(rechnungenPruefen([{ ...alt[0], status: "bezahlt" }], alt, O()))).toBe(RECHNUNG_CODE.UNVERAENDERLICH);
    expect(code(rechnungenPruefen([rg("R-2", { status: "storniert" }), ...alt], alt, O()))).toBe(RECHNUNG_CODE.FORM);
    expect(code(rechnungenPruefen([rg("R-2", { bezahlt: true }), ...alt], alt, O()))).toBe(RECHNUNG_CODE.FORM);
  });
  it("A6 Umordnen: wirkungslos — der Server hält die gespeicherte Reihenfolge, neue vorn", () => {
    const alt = [{ ...rg("R-1"), lfd: 1 }, { ...rg("R-2"), lfd: 2 }];
    const e = rechnungenPruefen([alt[1], rg("R-3"), alt[0]], alt, O());
    expect(code(e)).toBe("ok");
    expect(e.rechnungen.map((x) => x.nummer)).toEqual(["R-3", "R-1", "R-2"]);
    expect(e.rechnungen[0].lfd).toBe(3);
  });
  it("A7 unbekanntes Feld und Prototyp-Schlüssel: abgewiesen, Object.prototype unberührt", () => {
    for (const roh of ['{"__proto__":{"vergiftet":1}}', '{"constructor":{"prototype":{"vergiftet":1}}}', '{"zusatz":1}']) {
      const r = { ...rg("R-1"), ...JSON.parse(roh) };
      const r2 = Object.assign(JSON.parse(roh), rg("R-1"));
      expect(code(rechnungenPruefen([r2], [], O())), roh).toBe(RECHNUNG_CODE.FORM);
      void r;
    }
    const pos = JSON.parse('{"text":"x","__proto__":{"vergiftet":1}}');
    expect(code(rechnungenPruefen([rg("R-1", { positionen: [pos] })], [], O()))).toBe(RECHNUNG_CODE.FORM);
    const bt = JSON.parse('{"firma":"x","__proto__":{"vergiftet":1}}');
    expect(code(rechnungenPruefen([rg("R-1", { betreiber: bt })], [], O()))).toBe(RECHNUNG_CODE.FORM);
    expect(/** @type {any} */ ({}).vergiftet).toBeUndefined();
  });
  it("A8 Beträge als Text, negativ, krumm, unstimmig; Steuersatz außerhalb: abgewiesen", () => {
    const faelle = [{ brutto: "105.91" }, { netto: -89, steuer: -16.91, brutto: -105.91 }, { netto: 89.001 }, { brutto: 1 },
      { steuer: 0 }, { steuersatz: 150 }, { steuersatz: null }, { netto: 1e9 }, { rabattBetrag: -1 }, { standorte: 1.5 }, { personen: -1 }];
    for (const f of faelle) expect(code(rechnungenPruefen([rg("R-1", f)], [], O())), JSON.stringify(f)).toBe(RECHNUNG_CODE.FORM);
  });
  it("A9 übergroß: langer Text, zu viele Positionen, zu viele neue Einträge, zu großer Eintrag", () => {
    expect(code(rechnungenPruefen([rg("R-1", { mandant: "x".repeat(RECHNUNG_GRENZEN.text + 1) })], [], O()))).toBe(RECHNUNG_CODE.FORM);
    const viele = Array.from({ length: RECHNUNG_GRENZEN.positionen + 1 }, () => ({ text: "x" }));
    expect(code(rechnungenPruefen([rg("R-1", { positionen: viele })], [], O()))).toBe(RECHNUNG_CODE.FORM);
    const lauf = Array.from({ length: RECHNUNG_GRENZEN.neuJeVorgang + 1 }, (_, i) => rg(`R-${i}`));
    expect(code(rechnungenPruefen(lauf, [], O()))).toBe(RECHNUNG_CODE.FORM);
    const gross = Array.from({ length: RECHNUNG_GRENZEN.positionen }, () => ({ text: "y".repeat(RECHNUNG_GRENZEN.text) }));
    expect(code(rechnungenPruefen([rg("R-1", { positionen: gross })], [], O()))).toBe(RECHNUNG_CODE.FORM);
    expect(code(rechnungenPruefen([rg("R-1", { mandant: "a\u0000b" })], [], O()))).toBe(RECHNUNG_CODE.FORM);
  });
  it("A10 Rückdatieren: datum/faellig vom Server; lfd und erstellt mitgeschickt: abgewiesen; Monat in der Zukunft: abgewiesen", () => {
    const e = rechnungenPruefen([rg("R-1", { datum: "2001-01-01", faellig: "2001-01-15" })], [], O());
    expect(e.rechnungen[0]).toMatchObject({ datum: HEUTE, faellig: "2026-12-09" });
    expect(code(rechnungenPruefen([rg("R-1", { lfd: 7 })], [], O()))).toBe(RECHNUNG_CODE.SERVERFELD);
    expect(code(rechnungenPruefen([rg("R-1", { erstellt: "2001-01-01T00:00:00.000Z" })], [], O()))).toBe(RECHNUNG_CODE.SERVERFELD);
    expect(code(rechnungenPruefen([rg("R-1", { monat: "2026-12" })], [], O()))).toBe(RECHNUNG_CODE.FORM);
    expect(code(rechnungenPruefen([rg("R-1", { datum: "2026-02-30" })], [], O()))).toBe(RECHNUNG_CODE.FORM);
    /* Serverfelder einer gespeicherten Rechnung: Mitgeschicktes zählt nicht, der gespeicherte Wert bleibt */
    const alt = [{ ...rg("R-1"), lfd: 1, erstellt: JETZT, datum: HEUTE }];
    const e2 = rechnungenPruefen([{ ...alt[0], lfd: 99, datum: "2001-01-01", erstellt: "x" }], alt, O());
    expect(code(e2)).toBe("ok");
    expect(e2.rechnungen).toEqual(alt);
    expect(SERVERFELDER).toEqual(["lfd", "erstellt", "datum", "faellig"]);
  });
  it("A11 Mandantentrennung: Rechnung für einen Betrieb außerhalb des Raums: abgewiesen", () => {
    expect(code(rechnungenPruefen([rg("R-1", { mandantId: "m-unbekannt" })], [], O()))).toBe(RECHNUNG_CODE.FORM);
  });
  it("A12 doppelte Nummer (gegen gespeichert und im selben Vorgang): abgewiesen", () => {
    const alt = [{ ...rg("R-1"), lfd: 1 }];
    expect(code(rechnungenPruefen([rg("R-1", { brutto: 105.91, netto: 89 , mandant: "Neu" }), ...alt], alt, O()))).toBe(RECHNUNG_CODE.UNVERAENDERLICH);
    expect(code(rechnungenPruefen([rg("R-2"), rg("R-2", { mandant: "zwei" })], [], O()))).toBe(RECHNUNG_CODE.UNVERAENDERLICH);
  });
  it("A13 Storno nur als Gegenbuchung: genau umgekehrt, einmal, gleicher Betrieb", () => {
    const alt = [{ ...rg("R-1"), lfd: 1 }];
    const st = (x = {}) => rg("S-1", { art: "storno", bezug: "R-1", netto: -89, steuer: -16.91, brutto: -105.91, ...x });
    const ok = rechnungenPruefen([st(), ...alt], alt, O());
    expect(code(ok)).toBe("ok");
    expect(ok.rechnungen[0]).toMatchObject({ art: "storno", bezug: "R-1", lfd: 2 });
    expect(code(rechnungenPruefen([st({ netto: -80, steuer: -15.2, brutto: -95.2 }), ...alt], alt, O()))).toBe(RECHNUNG_CODE.STORNO);
    expect(code(rechnungenPruefen([st({ bezug: "R-9" }), ...alt], alt, O()))).toBe(RECHNUNG_CODE.STORNO);
    expect(code(rechnungenPruefen([st({ mandantId: "m2" }), ...alt], alt, O()))).toBe(RECHNUNG_CODE.STORNO);
    const nach = ok.rechnungen;
    expect(code(rechnungenPruefen([rg("S-2", { art: "storno", bezug: "R-1", netto: -89, steuer: -16.91, brutto: -105.91 }), ...nach], nach, O()))).toBe(RECHNUNG_CODE.STORNO);
    expect(code(rechnungenPruefen([rg("R-2", { bezug: "R-1" }), ...alt], alt, O()))).toBe(RECHNUNG_CODE.FORM);
    expect(code(rechnungenPruefen([rg("R-2", { art: "gutschrift" }), ...alt], alt, O()))).toBe(RECHNUNG_CODE.FORM);
  });
  it("A15 Alteinträge ohne Schema (Testdaten vor der Regel) bleiben unverändert speicherbar", () => {
    const alt = [{ id: "r1", betrag: 119 }, { nr: 1 }, "kaputt", null];
    const e = rechnungenPruefen([rg("R-1"), ...kopie(alt)], alt, O());
    expect(code(e)).toBe("ok");
    expect(e.rechnungen.slice(1)).toEqual(alt);
    expect(code(rechnungenPruefen(kopie(alt).reverse(), alt, O()))).toBe("ok");
    expect(code(rechnungenPruefen(undefined, alt, O()))).toBe("ok");
  });
  it("A16 Fehlertexte nennen keinen Wert aus der Rechnung", () => {
    const geheim = "Geheimname-4711";
    for (const r of [rg("R-1", { mandant: geheim, brutto: "x" }), rg("R-1", { mandantId: geheim }), rg("R-1", { [geheim]: 1 }),
      rg("R-1", { anschrift: geheim, positionen: [{ ...PAKETPOS, text: `Branchenpaket ${geheim}`, paketId: undefined }] })]) {
      const e = rechnungenPruefen([r], [], O());
      expect(code(e)).not.toBe("ok");
      expect(JSON.stringify(e)).not.toContain(geheim);
    }
  });
});

/* ======================================================================== */
const WIRT = "127.0.0.1:3000";
const EIN = "2026-01-01T00:00:00.000Z";
let wurzel, laden, daten, B, sitzungAnlegen, kontoSchreiben, ablageSchluessel, spurLesen;
let nr = 0, raumNr = 0;

async function anfrage(pfad, { methode = "GET", rumpf, token } = {}) {
  nr += 1;
  const kopf = { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.91.${Math.floor(nr / 250) % 250}.${nr % 250}` };
  if (methode !== "GET") kopf["content-type"] = "application/json";
  if (token) kopf.authorization = `Bearer ${token}`;
  const a = await daten(new Request(`http://${WIRT}${pfad}`, { method: methode, headers: kopf,
    ...(methode === "GET" ? {} : { body: JSON.stringify(rumpf || {}) }) }), {});
  const roh = await a.text();
  let d = {}; try { d = JSON.parse(roh); } catch { /* leer */ }
  return { status: a.status, roh, ...d };
}
const person = (id, rolle) => ({ id, vorname: "V", nachname: `N${id}`, rolle, bereich: "ALLE", status: "aktiv", geburtstag: "1980-01-01",
  qualifikationen: [], zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }] });
const betrieb = (id, name) => ({ id, name, status: "aktiv", branche: "sonstiges", pakete: [], einheiten: [{ id: "e1", name: "WB 1", versatzTage: 0 }],
  dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00", pause: 30, mindest: { mo_do: 0, fr: 0, sa: 0, so: 0 } }],
  qualifikationen: [], zyklus: { tage: ["F", "-", "-", "-", "-", "-", "-"] }, anker: "2026-01-05", einstellungen: { ruhezeit: 11, maxFolge: 6 },
  personen: [person("l1", "leitung")], abweichungen: {}, abwesenheiten: [], erfassung: {}, einstempeln: {}, anfragen: [], nachrichten: [], bestaetigungen: [] });
const ALT = [{ id: "r-alt", betrag: 119 }];
const grund = () => ({ version: 9, stand: 1, betreiber: { firma: "Betreiber Synth" }, tarife: [], protokoll: [], rechnungen: kopie(ALT),
  mandanten: [betrieb("m1", "Testbetrieb Synth GmbH"), betrieb("m2", "Fremdbetrieb Synth")] });

async function raum() {
  const name = `rechnung-l4-${++raumNr}`;
  await B.bestandSchreiben(laden(), name, grund(), { durch: "Pruefung" });
  const bt = (await sitzungAnlegen({ bestand: name, name: "Betreiber", rolle: "betreiber", person: null, betrieb: 0, mandantId: "m1", einheit: null }, 2 * 3600 * 1000)).token;
  const lt = (await sitzungAnlegen({ bestand: name, name: "V Nl1", rolle: "leitung", person: "l1", betrieb: 0, mandantId: "m1", einheit: null }, 2 * 3600 * 1000)).token;
  return { name, bt, lt };
}
async function put(token, fn) {
  const g = await anfrage("/api/bestand", { token });
  const b = kopie(g.bestand);
  fn(b);
  return anfrage("/api/bestand", { methode: "PUT", token, rumpf: { bestand: b, etag: g.etag, durch: "Pruefung" } });
}
const gespeichert = async (name) => (await B.bestandLesenStreng(laden(), name)).bestand.rechnungen;

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-rechnung-l4-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
  const schutz = await import("../server/lib/schutz.mjs");
  for (const art of Object.keys(schutz.GRENZEN)) schutz.GRENZEN[art] = { ...schutz.GRENZEN[art], versuche: 1000000 };
  spurLesen = schutz.spurLesen;
  const { getStore } = await import("../server/lib/ablage.mjs");
  laden = () => getStore({ name: "centric", consistency: "strong" });
  daten = (await import("../server/funktionen/daten.mjs")).default;
  B = await import("../server/lib/bestand.mjs");
  ({ sitzungAnlegen } = await import("../server/lib/sitzungen.mjs"));
  ({ kontoSchreiben } = await import("../server/lib/konten.mjs"));
  ({ ablageSchluessel } = await import("../server/lib/codes.mjs"));
}, 120000);
afterAll(async () => { if (wurzel) await rm(wurzel, { recursive: true, force: true }); });

describe("L-4 Handler: PUT /api/bestand des Betreibers", { timeout: 120000 }, () => {
  it("gültige neue Rechnung: 200, Serverfelder gesetzt, Altbestand unverändert, Protokoll ohne Namen", async () => {
    const { name, bt } = await raum();
    const r = await put(bt, (b) => { b.rechnungen = [rg("R-1", { datum: "2001-01-01", faellig: "2001-01-15" }), ...b.rechnungen]; });
    expect(r.status, r.roh.slice(0, 300)).toBe(200);
    const g = await gespeichert(name);
    expect(g.slice(1)).toEqual(ALT);
    expect(g[0]).toMatchObject({ nummer: "R-1", lfd: 1 });
    expect(g[0].datum).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(g[0].datum).not.toBe("2001-01-01");
    expect(typeof g[0].erstellt).toBe("string");
    /* ein zweites Speichern mit der lokalen Kopie (ohne Serverfelder, Client-Datum) bleibt möglich */
    const r2 = await put(bt, (b) => { b.rechnungen = [rg("R-1", { datum: "2001-01-01", faellig: "2001-01-15" }), ...kopie(ALT)]; b.betreiber.firma = "Neu"; });
    expect(r2.status, r2.roh.slice(0, 300)).toBe(200);
    expect(await gespeichert(name)).toEqual(g);
    const spur = (await spurLesen(2)).filter((z) => z.art === "schreiben" && z.ausgang === "rechnung");
    expect(spur.some((z) => /^1 neu, lfd 1–1$/.test(z.zusatz))).toBe(true);
    expect(JSON.stringify(spur)).not.toContain("Testbetrieb Synth");
  });
  const faelle = [
    ["A1 Paketposition „Branchenpaket Sicherheitsdienst“ bei Zustand 1", (b) => { b.rechnungen = [rg("R-1", { positionen: [PAKETPOS] }), ...b.rechnungen]; }, RECHNUNG_CODE.PAKET],
    ["A2 Paketposition ohne Kennung", (b) => { b.rechnungen = [rg("R-1", { positionen: [{ text: "Branchenpaket Sicherheitsdienst", betrag: "79,00 €" }] }), ...b.rechnungen]; }, RECHNUNG_CODE.PAKET],
    ["A3 gespeicherte Rechnung ändern", (b) => { b.rechnungen[0].betrag = 0; }, RECHNUNG_CODE.UNVERAENDERLICH],
    ["A4 alle Rechnungen löschen", (b) => { b.rechnungen = []; }, RECHNUNG_CODE.UNVERAENDERLICH],
    ["A5 Status bezahlt an gespeicherter Rechnung", (b) => { b.rechnungen[0].status = "bezahlt"; }, RECHNUNG_CODE.UNVERAENDERLICH],
    ["A7 unbekanntes Feld", (b) => { b.rechnungen = [rg("R-1", { hinten: "x" }), ...b.rechnungen]; }, RECHNUNG_CODE.FORM],
    ["A8 Betrag als Text", (b) => { b.rechnungen = [rg("R-1", { brutto: "105,91" }), ...b.rechnungen]; }, RECHNUNG_CODE.FORM],
    ["A9 übergroßer Text", (b) => { b.rechnungen = [rg("R-1", { anschrift: "x".repeat(50000) }), ...b.rechnungen]; }, RECHNUNG_CODE.FORM],
    ["A10 laufende Nummer mitgeschickt", (b) => { b.rechnungen = [rg("R-1", { lfd: 1 }), ...b.rechnungen]; }, RECHNUNG_CODE.SERVERFELD],
    ["A11 fremder Betrieb", (b) => { b.rechnungen = [rg("R-1", { mandantId: "m-x" }), ...b.rechnungen]; }, RECHNUNG_CODE.FORM],
    ["A12 Rechnungen keine Liste", (b) => { b.rechnungen = { "0": rg("R-1") }; }, RECHNUNG_CODE.FORM],
  ];
  for (const [titel, fn, erwartet] of faelle) {
    it(`${titel}: 422 ${erwartet}, nichts gespeichert, Antwort ohne Werte`, async () => {
      const { name, bt } = await raum();
      const vorher = await B.bestandLesenStreng(laden(), name);
      const r = await put(bt, (b) => { fn(b); b.betreiber.firma = "Wäre-geändert"; });
      expect(r.status, r.roh.slice(0, 300)).toBe(422);
      expect(r.code).toBe(erwartet);
      expect(r.roh).not.toContain("Testbetrieb Synth");
      expect(r.roh).not.toContain("Synthweg");
      const nach = await B.bestandLesenStreng(laden(), name);
      expect(nach.bestand.rechnungen).toEqual(ALT);
      expect(nach.bestand.betreiber).toEqual(vorher.bestand.betreiber);
    });
  }
  it("A6 Umordnen: 200, gespeicherte Reihenfolge bleibt", async () => {
    const { name, bt } = await raum();
    await put(bt, (b) => { b.rechnungen = [rg("R-1"), ...b.rechnungen]; });
    const vorher = await gespeichert(name);
    const r = await put(bt, (b) => { b.rechnungen.reverse(); });
    expect(r.status, r.roh.slice(0, 300)).toBe(200);
    expect(await gespeichert(name)).toEqual(vorher);
  });
  it("A13 Storno als Gegenbuchung: 200; zweites Storno: 422", async () => {
    const { name, bt } = await raum();
    await put(bt, (b) => { b.rechnungen = [rg("R-1"), ...b.rechnungen]; });
    const st = (n) => rg(n, { art: "storno", bezug: "R-1", netto: -89, steuer: -16.91, brutto: -105.91 });
    expect((await put(bt, (b) => { b.rechnungen = [st("S-1"), ...b.rechnungen]; })).status).toBe(200);
    const r = await put(bt, (b) => { b.rechnungen = [st("S-2"), ...b.rechnungen]; });
    expect(r.status).toBe(422);
    expect(r.code).toBe(RECHNUNG_CODE.STORNO);
    expect((await gespeichert(name)).map((x) => x.nummer || x.id)).toEqual(["S-1", "R-1", "r-alt"]);
  });
  it("A14 Leitung: mitgeschickte Rechnungen bleiben wirkungslos (gespeicherter Stand)", async () => {
    const { name, lt } = await raum();
    const r = await put(lt, (b) => { b.rechnungen = [rg("R-1", { positionen: [PAKETPOS] })]; });
    expect(r.status).toBeLessThan(500);
    expect(await gespeichert(name)).toEqual(ALT);
  });
});

describe("L-4 Handler: POST /api/bestand-anlegen mit eigenem Inhalt", { timeout: 120000 }, () => {
  let token;
  beforeAll(async () => {
    const zc = "RGL4-AAAA-0001";
    await kontoSchreiben(laden(), ablageSchluessel(zc), { name: "betr", bestand: "rechnung-l4-betreiber", rolle: "betreiber", person: null, betrieb: 0, angelegt: EIN });
    token = (await anfrage("/api/anmelden", { methode: "POST", rumpf: { zugangscode: zc } })).token;
    expect(token).toBeTruthy();
  });
  const inhalt = (rechnungen) => ({ version: 9, stand: 1, session: null, rechnungen, mandanten: [betrieb("m1", "Testbetrieb Synth GmbH")] });
  it("A1 Paketposition im Inhalt: 422; gültige Rechnung: Serverfelder gesetzt", async () => {
    const r = await anfrage("/api/bestand-anlegen", { methode: "POST", token, rumpf: { bestand: "rechnung-l4-neu1", inhalt: inhalt([rg("R-1", { positionen: [PAKETPOS] })]) } });
    expect(r.status, r.roh.slice(0, 300)).toBe(422);
    expect(r.code).toBe(RECHNUNG_CODE.PAKET);
    const ok = await anfrage("/api/bestand-anlegen", { methode: "POST", token, rumpf: { bestand: "rechnung-l4-neu2", inhalt: inhalt([rg("R-1", { datum: "2001-01-01" })]) } });
    expect(ok.status, ok.roh.slice(0, 300)).toBe(200);
    const g = await gespeichert("rechnung-l4-neu2");
    expect(g[0]).toMatchObject({ nummer: "R-1", lfd: 1 });
    expect(g[0].datum).not.toBe("2001-01-01");
  });
});

describe("L-4 Handler: bestand-anlegen, Prüfstände in Altform", { timeout: 120000 }, () => {
  it("A15 Altform-Einträge ({ nr, betrag }) im Inhalt: 200, unverändert gespeichert; eine Paketposition daneben: 422", async () => {
    const zc = "RGL4-AAAA-0002";
    await kontoSchreiben(laden(), ablageSchluessel(zc), { name: "betr", bestand: "rechnung-l4-betreiber2", rolle: "betreiber", person: null, betrieb: 0, angelegt: EIN });
    const token = (await anfrage("/api/anmelden", { methode: "POST", rumpf: { zugangscode: zc } })).token;
    const inhalt = (rechnungen) => ({ version: 9, stand: 1, session: null, rechnungen, mandanten: [betrieb("m1", "Testbetrieb Synth GmbH")] });
    const ok = await anfrage("/api/bestand-anlegen", { methode: "POST", token, rumpf: { bestand: "rechnung-l4-alt1", inhalt: inhalt([{ nr: "R-1", betrag: 199 }]) } });
    expect(ok.status, ok.roh.slice(0, 300)).toBe(200);
    expect(await gespeichert("rechnung-l4-alt1")).toEqual([{ nr: "R-1", betrag: 199 }]);
    const boese = await anfrage("/api/bestand-anlegen", { methode: "POST", token, rumpf: { bestand: "rechnung-l4-alt2",
      inhalt: inhalt([{ nr: "R-1", betrag: 199 }, { nr: "R-2", positionen: [PAKETPOS] }]) } });
    expect(boese.status).toBe(422);
  });
});

/* ======================================================================== */
/* Review PR #542 (Auflagen A1, A2): laufende Nummer nur aus Rechnungen in Schemaform, Altform begrenzt, Storno centgenau. */
describe("L-4 Review A1: laufende Nummer und Altform", () => {
  it("Altform mit lfd zählt nicht: die nächste neue Rechnung bekommt 1 (keine Lücke)", () => {
    const alt = [{ nr: "X", lfd: 5 }];
    const e = rechnungenPruefen([rg("R-1"), ...alt], alt, O());
    expect(e.rechnungen[0].lfd).toBe(1);
  });
  it("Altform mit lfd 2^53 vergiftet den Zähler nicht: zwei neue Rechnungen bekommen 1 und 2", () => {
    const alt = [{ nr: "X", lfd: 2 ** 53 }];
    const e = rechnungenPruefen([rg("R-1"), rg("R-2"), ...alt], alt, O());
    expect(e.rechnungen.slice(0, 2).map((x) => x.lfd)).toEqual([1, 2]);
  });
  it("Zähler nach Rechnungen in Schemaform: lückenlos weiter; ein unsicherer Wert zählt nicht", () => {
    const alt = [{ ...rg("R-1"), lfd: 1 }, { ...rg("R-2"), lfd: 2 }, { ...rg("R-3"), lfd: 2 ** 53 }];
    const e = rechnungenPruefen([rg("R-4"), ...alt], alt, O());
    expect(e.rechnungen[0].lfd).toBe(3);
  });
  it("doppelte Nummer im selben Anlegen: abgewiesen", () => {
    expect(code(rechnungenPruefen([rg("R-1"), rg("R-1", { mandant: "b" })], [], O()))).toBe(RECHNUNG_CODE.UNVERAENDERLICH);
  });
  it("Altform in bestand-anlegen: Serverfelder, Status, Prototyp-Schlüssel, übergroß, HTML, verschachtelt, riesige Zahl: abgewiesen", () => {
    const boese = [{ nr: "X", lfd: 1 }, { nr: "X", erstellt: "x" }, { nr: "X", datum: "2020-01-01" }, { nr: "X", status: "bezahlt" },
      { nr: "X", bezahlt: true }, { nr: "X", storniert: true }, JSON.parse('{"nr":"X","__proto__":{"a":1}}'), { nr: "x".repeat(300000) },
      { nr: "<img src=x onerror=alert(1)>" }, { nr: "X", tiefe: { a: 1 } }, { nr: "X", brutto: 1e308 }, { nr: "X", art: "storno" }];
    for (const b of boese) expect(altformFehler(b), JSON.stringify(b).slice(0, 80)).not.toBeNull();
    for (const ok of [{ nr: "R-1", betrag: 199 }, { id: "r1", betrag: 119 }, { id: "rg-eigen", mandantId: "m1", brutto: 100 }, { nr: 1 }])
      expect(altformFehler(ok), JSON.stringify(ok)).toBeNull();
  });
});

describe("L-4 Review A2: Storno centgenau", () => {
  it("Storno mit einem Cent Abweichung: abgewiesen", () => {
    const alt = [{ ...rg("R-1"), lfd: 1 }];
    const st = rg("S-1", { art: "storno", bezug: "R-1", netto: -89.01, steuer: -16.91, brutto: -105.92 });
    expect(code(rechnungenPruefen([st, ...alt], alt, O()))).toBe(RECHNUNG_CODE.STORNO);
  });
});

describe("L-4 Review A1: Handler bestand-anlegen mit vergifteter Altform", { timeout: 120000 }, () => {
  it("Altform mit lfd 2^53: 422, nichts angelegt; Altform ohne Serverfelder: neue Rechnungen lfd 1 und 2", async () => {
    const zc = "RGL4-AAAA-0003";
    await kontoSchreiben(laden(), ablageSchluessel(zc), { name: "betr", bestand: "rechnung-l4-betreiber3", rolle: "betreiber", person: null, betrieb: 0, angelegt: EIN });
    const token = (await anfrage("/api/anmelden", { methode: "POST", rumpf: { zugangscode: zc } })).token;
    const inhalt = (rechnungen) => ({ version: 9, stand: 1, session: null, rechnungen, mandanten: [betrieb("m1", "Testbetrieb Synth GmbH")] });
    const r = await anfrage("/api/bestand-anlegen", { methode: "POST", token, rumpf: { bestand: "rechnung-l4-gift1", inhalt: inhalt([rg("R-1"), rg("R-2"), { nr: "X", lfd: 2 ** 53 }]) } });
    expect(r.status, r.roh.slice(0, 300)).toBe(422);
    expect(r.code).toBe(RECHNUNG_CODE.FORM);
    const ok = await anfrage("/api/bestand-anlegen", { methode: "POST", token, rumpf: { bestand: "rechnung-l4-gift2", inhalt: inhalt([rg("R-1"), rg("R-2"), { nr: "X", betrag: 1 }]) } });
    expect(ok.status, ok.roh.slice(0, 300)).toBe(200);
    expect((await gespeichert("rechnung-l4-gift2")).map((x) => x.lfd)).toEqual([1, 2, undefined]);
  });
});
