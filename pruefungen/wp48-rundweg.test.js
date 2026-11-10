/* ==========================================================================
   WP-48.1 PRÜFNETZ — RUNDWEG-INVARIANTE JE ROLLE

   Der Teilweg (WP-48.3) ist definiert als Voll-PUT von Sicht(gespeichert) ⊕ Δ
   (docs/acc45/WP48-TEILSPEICHERUNG.md, 2.1). Das trägt nur, wenn für jede
   Rolle gilt:

       GET → dieselbe Sicht unverändert zurück (PUT) ist wirkungslos.

   Sonst erbt der virtuelle Vollrumpf den Fehler (Risiko 4.6 Nr. 1). Geprüft
   wird über den echten Handler (daten.mjs) mit Dateiablage, Rolle für
   Rolle, auf einem Betrieb, der jedes Feld des Positivkatalogs (sicht.mjs
   BETRIEB) trägt, Monatsdaten in mehreren Monaten (Plan, Ist, Stempel)
   und Personen in eigenem und fremdem Bereich.

   „Wirkungslos" heißt: Der gespeicherte Bestand ist danach gleich (tief),
   dieselben Scherben liegen da, und die Antwort ist 200 (schreibende
   Rollen) bzw. 403 (Betriebsrat, der nicht schreibt).

   Zusätzlich je Rolle: unverändert zurück mit einem veralteten Stand, wenn
   inzwischen ein Stempel im laufenden Monat dazukam (Normalfall im Betrieb).
   Auch das darf nichts ändern — und vor allem den Stempel nicht verlieren.

   Aufruf: npx vitest run pruefungen/wp48-rundweg.test.js
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ABGELEITETE_PERSONENFELDER as ABGELEITET } from "../server/lib/planungsregeln.mjs";

const WIRT = "127.0.0.1:3000";
let wurzel, laden, daten, B, sitzungAnlegen, Z, G, S;
const kopie = (x) => JSON.parse(JSON.stringify(x));

let nr = 0;
async function anfrage(pfad, { methode = "GET", rumpf, token } = {}) {
  nr += 1;
  const kopf = { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.48.${Math.floor(nr / 250) % 250}.${nr % 250}` };
  if (methode !== "GET") kopf["content-type"] = "application/json";
  if (token) kopf.authorization = `Bearer ${token}`;
  const a = await daten(new Request(`http://${WIRT}${pfad}`, { method: methode, headers: kopf,
    ...(methode === "GET" ? {} : { body: JSON.stringify(rumpf || {}) }) }), {});
  let d = {}; try { d = await a.json(); } catch { /* leer */ }
  return { status: a.status, ...d };
}

/* Rollen und ihre Sitzungen. Der Kunde und der Betreiber tragen keine Person. */
const ROLLEN = {
  LT: { rolle: "leitung", person: "l1", schreibt: true },
  PL: { rolle: "planer", person: "p1", schreibt: true },
  KU: { rolle: "kunde", person: null, schreibt: true },
  SV: { rolle: "subplaner", person: "s1", einheit: "e1", schreibt: true },
  MA: { rolle: "mitarbeiter", person: "m0", schreibt: true },
  BR: { rolle: "betriebsrat", person: "r1", schreibt: false },
  BT: { rolle: "betreiber", person: null, schreibt: true },
};

let HEUTE, tag, MONAT_JETZT;

const person = (id, rolle, einheit, extra = {}) => ({ id, vorname: "V", nachname: `N${id}`, rolle, bereich: einheit,
  status: "aktiv", geburtstag: "1980-01-01", qualifikationen: [], zugehoerigkeit: [{ ab: "2020-01-01", einheitId: einheit }],
  telefon: "0", email: `${id}@example.org`, ...extra });

/** Eine Person mit jedem Feld aus sicht.mjs PERSONENFELDER (Schutzmerkmale, Kalender, Lohn …). */
const vollePerson = (id, einheit) => person(id, "mitarbeiter", einheit, {
  funktion: "Pflege", eintritt: "2020-01-01", austritt: null, imSchichtdienst: true, springer: false, teilzeit: false,
  wochenstunden: 39, anonym: false, qualNachweise: [], kompetenzNachweise: [], einschraenkungen: {},
  verfuegbarkeit: {}, wunschfrei: [], stundenuebertrag: 0, urlaubsanspruch: 30, urlaubsuebertrag: 0, mobil: "0",
  anschrift: "Weg 2", notfallkontakt: "Kontakt", zustellung: { mail: true }, pushSchluessel: null,
  kalenderVerweis: `kv-${id}`, kalenderGeheim: `kg-${id}`, kalenderStand: 1, weckzeit: null, benachrichtigung: {},
  kontrastmodus: false, feldmodus: false, thema: "hell", dichte: "normal", tour: null, einfuehrung: null,
  handbuch: null, startansicht: null, wenigerBewegung: false, beschaeftigungsmodell: "vollzeit",
  stundenGrenzeMonat: null, mutterschutzEinwilligungen: [{ art: "nacht", ab: "2026-01-01", bis: "2027-12-31", genehmigung: true,
    geaendertAm: "2026-01-01T00:00:00.000Z", geaendertVon: "l1" }], mutterschutz: true, schwerbehindert: true,
  notiz: "vertraulich", notizen: "vertraulich", emailVorher: null, emailGeaendert: null, nachtvorsorge: null,
  rolleSeit: "2020-01-01", rolleVerlauf: [], urlaubshinweis: "", geburtsdatum: "1990-01-01", personalnummer: "4711",
  iban: "DE00", steuerId: "1", sozialversicherung: "1", notfall: "n", lohn: 1, gehalt: 1, zuschlaege: [],
  einarbeitung: [], nachweise: [], neuerZugang: null, anonymSeit: null, schutz: null,
});

/** Ein Betrieb mit jedem Feld des Positivkatalogs und Monatsdaten in vier Monaten. */
function reicherBestand() {
  const p = (n) => tag(n);
  const plan = {}; const ist = {}; const stempel = {};
  for (const pid of ["m0", "a1", "b1", "s1", "r1", "x1", "y1"]) {
    for (const n of [-40, -35, -3, -1, 0, 2, 20, 40]) plan[`${pid}|${p(n)}`] = n % 2 ? "F" : "N";
    for (const n of [-40, -3, -1]) {
      ist[`${pid}|${p(n)}`] = { start: "06:00", ende: "14:05", bestaetigt: true, grund: pid === "b1" ? "Stau" : "" };
      stempel[`${pid}|${p(n)}`] = { start: "05:58", ende: "14:05", quelle: "app" };
    }
  }
  stempel[`m0|${p(0)}`] = { start: "05:59", quelle: "app" };
  /* WP-16: ein abgeschlossener Monat (vor 40 Tagen) mit eingefrorenem Ist je Person und Tag (Dienst und Abwesenheit). */
  const abgeschlossen = p(-40).slice(0, 7);
  const monatsabschluss = { [abgeschlossen]: { abgeschlossen: true, am: "2026-01-02T08:00:00.000Z", wer: "l1",
    verlauf: [{ id: "v1", art: "abschluss", am: "2026-01-02T08:00:00.000Z", wer: "l1", grund: "" }] } };
  const istEingefroren = {
    [`m0|${p(-40)}`]: { d: "F", std: 7.5, e: 1 },
    [`b1|${p(-40)}`]: { d: "F", std: 7.5, e: 1, p: 1 },
    [`a1|${p(-40)}`]: { a: ["krank"], pl: 1, w: 39 },
  };
  return { version: 9, stand: 1, mandanten: [{
    id: "m1", name: "Haus", branche: "pflege", bundesland: "BE", einheitLabel: "Wohnbereich", status: "aktiv",
    stichtag: null, laeuftAb: null, pakete: [], matrix: null,
    einheiten: [{ id: "e1", name: "WB 1", versatzTage: 0 }, { id: "e2", name: "WB 2", versatzTage: 0 }],
    dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00", pause: 30 },
      { id: "N", name: "Nacht", start: "22:00", ende: "06:00", pause: 30 }],
    zyklus: ["F", "F", "N", "N", "-", "-"], anker: "2026-01-05", zyklusLaenge: 6, gruppen: [], versatzTageVon: {},
    zuschlaege: [], einstellungen: { ruhezeit: 11, maxFolge: 6 }, rollennamen: {}, briefing: [], aufgaben: [],
    qualifikationen: [], genehmigungsstufen: [], tarifwerk: null, version: 9, stand: 1,
    personen: [person("m0", "mitarbeiter", "e1"), person("a1", "mitarbeiter", "e1", { notiz: "privat", iban: "DE00" }),
      person("b1", "mitarbeiter", "e2"), person("r1", "betriebsrat", "ALLE"), person("s1", "subplaner", "e1"),
      person("p1", "planer", "ALLE"), person("l1", "leitung", "ALLE"), vollePerson("x1", "e1"), vollePerson("y1", "e2")],
    abweichungen: plan, monatsabschluss, istEingefroren, planstaende: {}, freigaben: {}, unterschreitungen: [], belegung: {}, therapie: {}, aushang: [],
    standorte: [], einsatzorte: [], einsatzorteGeaendertAm: null, einsatzorteGeaendertVon: null, abwesenheiten: [
      { id: "abw4", personId: "x1", art: "krank", von: p(1), bis: p(3), notiz: "Befund" },
      { id: "abw1", personId: "a1", art: "krank", von: p(5), bis: p(6), notiz: "Grippe" },
      { id: "abw2", personId: "m0", art: "urlaub", von: p(10), bis: p(12), notiz: "" },
      { id: "abw3", personId: "b1", art: "urlaub", von: p(-10), bis: p(-8), notiz: "" }],
    anfragen: [{ id: "an1", personId: "m0", art: "urlaub", von: p(30), bis: p(31), status: "offen", zeit: "2026-01-01" },
      { id: "an2", personId: "b1", art: "tausch", von: p(32), bis: p(32), status: "offen", zeit: "2026-01-01" }],
    wuensche: [], einspruenge: [], ausschreibungen: [], urlaubsrunde: null, selbstplanung: [],
    nachrichten: [{ id: "n1", an: "m0", von: "p1", text: "Hallo", zeit: "2026-01-01" },
      { id: "n2", an: "b1", von: "p1", text: "Hallo b", zeit: "2026-01-01" }],
    notrufe: [], erfassung: ist, einstempeln: stempel, fahrzeiten: {}, checks: {}, ansichten: {},
    kompetenzen: [], einarbeitung: [], objekte: [], postenPlan: {}, bereichsPlan: {}, betriebsmittel: [],
    /* WP-19-Module (Positivkatalog sicht.mjs): im Prüfbestand belegt, damit ein neues Katalogfeld auffällt */
    wachbuch: {}, bereitschaftStufen: [], bereitschaft: {}, funktionsbereiche: [], funktionsPlan: {}, rotationen: {}, pflegeNiveaus: [],
    sondereinsaetze: [], aenderungen: [], bestaetigungen: [], dienstbuch: [], uebergaben: [], protokoll: [],
    notizen: {}, tagesnotizen: {}, adressAenderungen: [],
    tarif: "basis", seit: "2026-01-01", bis: null, testTage: 0, selbstAngelegt: false, preisgestaltung: {},
    rabattGrund: "", kontakt: "k@example.org", kontaktName: "K", anschrift: "Weg 1", ustId: "", notiz: "",
    raum: null, lohnarten: [], aufbewahrung: null, aushaenge: [], checklisten: [], listeneintraege: [], vorgaben: [],
  }] };
}

let raumNr = 0;
async function neuerRaum({ angeglichen = true } = {}) {
  const raum = `wp48-rundweg-${++raumNr}`;
  const b = reicherBestand();
  /* Ein Altbestand (vor WP-12) trägt Personen ohne qualifikationen — GET gleicht nur in der Antwort an. */
  if (!angeglichen) for (const x of b.mandanten[0].personen) delete x.qualifikationen;
  await B.bestandSchreiben(laden(), raum, angeglichen ? G.personenAngleichen(G.uebergabenAngleichen(b)) : b, { durch: "Pruefung" });
  const token = {};
  for (const [k, r] of Object.entries(ROLLEN)) {
    token[k] = (await sitzungAnlegen({ bestand: raum, name: `V N${r.person}`, rolle: r.rolle, person: r.person, betrieb: 0,
      mandantId: "m1", einheit: r.einheit || null }, 2 * 3600 * 1000)).token;
  }
  return { raum, token };
}

/** Pfade, an denen sich a und b unterscheiden (für eine lesbare Fehlermeldung). */
function pfadeVerschieden(a, b, pfad = "", aus = []) {
  if (aus.length > 20) return aus;
  if (a && b && typeof a === "object" && typeof b === "object" && Array.isArray(a) === Array.isArray(b)) {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) pfadeVerschieden(a[k], b[k], `${pfad}.${k}`, aus);
  } else if (JSON.stringify(a) !== JSON.stringify(b)) aus.push(`${pfad}: ${JSON.stringify(a)?.slice(0, 60)} → ${JSON.stringify(b)?.slice(0, 60)}`);
  return aus;
}

/** Was auf der Platte liegt: Bestand (ohne Stand) und Scherbenkennungen. */
async function gespeichert(raum) {
  const g = await B.bestandLesenStreng(laden(), raum);
  const { blobs } = await laden().list({ prefix: `scherbe:${raum}:` });
  return { bestand: g.bestand, scherben: blobs.map((b) => b.key).sort() };
}

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-wp48-rundweg-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
  const { getStore } = await import("../server/lib/ablage.mjs");
  laden = () => getStore({ name: "centric", consistency: "strong" });
  daten = (await import("../server/funktionen/daten.mjs")).default;
  B = await import("../server/lib/bestand.mjs");
  G = await import("../server/lib/gestalt.mjs");
  S = await import("../server/lib/sicht.mjs");
  ({ sitzungAnlegen } = await import("../server/lib/sitzungen.mjs"));
  Z = await import("../server/lib/zeiterfassung.mjs");
  HEUTE = Z.heuteBerlin();
  tag = (n) => Z.tagePlus(HEUTE, n);
  MONAT_JETZT = HEUTE.slice(0, 7);
});
afterAll(async () => { if (wurzel) await rm(wurzel, { recursive: true, force: true }); });

describe("Prüfbestand deckt den Positivkatalog ab", () => {
  it("jedes Feld aus sicht.mjs BETRIEB (außer session) ist im Prüfbetrieb belegt", () => {
    const m = reicherBestand().mandanten[0];
    const fehlt = Object.keys(S.BETRIEB).filter((f) => f !== "session" && !(f in m));
    expect(fehlt, "neues Katalogfeld: bitte im Prüfbestand belegen").toEqual([]);
  });
  it("jedes Feld aus sicht.mjs PERSONENFELDER ist an einer Prüfperson belegt", () => {
    const p = reicherBestand().mandanten[0].personen.find((x) => x.id === "x1");
    expect(S.PERSONENFELDER.filter((f) => !(f in p) && !ABGELEITET.includes(f))).toEqual([]);
  });
  it("jede Rolle der Rechteprüfung kommt vor (BEKANNTE_ROLLEN)", async () => {
    const R = await import("../server/lib/rechte.mjs");
    const geprueft = new Set(Object.values(ROLLEN).map((r) => r.rolle));
    expect(R.BEKANNTE_ROLLEN.filter((r) => !geprueft.has(r))).toEqual([]);
  });
});

describe("GET → unverändert zurück ist wirkungslos (je Rolle)", { timeout: 120000 }, () => {
  for (const [k, r] of Object.entries(ROLLEN)) {
    it(`${k} (${r.rolle}): aktueller Stand`, async () => {
      const { raum, token } = await neuerRaum();
      const vorher = await gespeichert(raum);
      const g = await anfrage("/api/bestand", { token: token[k] });
      expect(g.status).toBe(200);
      const p = await anfrage("/api/bestand", { methode: "PUT", token: token[k],
        rumpf: { bestand: g.bestand, etag: g.etag, durch: "Pruefung" } });
      expect(p.status, `${k}: ${JSON.stringify(p).slice(0, 300)}`).toBe(r.schreibt ? 200 : 403);
      const nachher = await gespeichert(raum);
      expect(nachher.scherben).toEqual(vorher.scherben);
      expect(pfadeVerschieden(vorher.bestand, nachher.bestand)).toEqual([]);
    });

    if (!r.schreibt) continue;
    it(`${k} (${r.rolle}): veralteter Stand, inzwischen ein Stempel im laufenden Monat`, async () => {
      const { raum, token } = await neuerRaum();
      const g = await anfrage("/api/bestand", { token: token[k] });
      expect(g.status).toBe(200);
      /* Ein Stempel kommt über den Speicherkern dazu (wie /api/stempeln): laufender Monat, Person a1. */
      const jetzt = await B.bestandLesenStreng(laden(), raum);
      const neu = kopie(jetzt.bestand);
      neu.mandanten[0].einstempeln[`a1|${HEUTE}`] = { start: "06:01", quelle: "app" };
      expect((await B.bestandSchreiben(laden(), raum, neu, { erwarteterStand: jetzt.stand, durch: "Stempel" })).ok).toBe(true);
      const vorher = await gespeichert(raum);
      const p = await anfrage("/api/bestand", { methode: "PUT", token: token[k],
        rumpf: { bestand: g.bestand, etag: g.etag, durch: "Pruefung" } });
      /* Heute: Der Monat gilt als „von beiden geändert" → 409 ist erlaubt (Grenze 1.3), aber nie ein Verlust. */
      expect([200, 409], `${k}: ${JSON.stringify(p).slice(0, 300)}`).toContain(p.status);
      const nachher = await gespeichert(raum);
      expect(nachher.bestand.mandanten[0].einstempeln[`a1|${HEUTE}`]).toEqual({ start: "06:01", quelle: "app" });
      expect(nachher.scherben).toEqual(vorher.scherben);
      expect(pfadeVerschieden(vorher.bestand, nachher.bestand)).toEqual([]);
    });
  }
});

describe("GET → unverändert zurück auf einem Altbestand (Personen ohne qualifikationen)", { timeout: 120000 }, () => {
  /* Die Lehre aus WP-12: Die Schichtverantwortung bekam beim unveränderten Zurückschreiben 403, weil GET
     angleicht, der gespeicherte Stand aber nicht. Wirkungslos heißt hier: nichts außer der Angleichung selbst. */
  for (const [k, r] of Object.entries(ROLLEN)) {
    it(`${k} (${r.rolle})`, async () => {
      const { raum, token } = await neuerRaum({ angeglichen: false });
      const vorher = await gespeichert(raum);
      const g = await anfrage("/api/bestand", { token: token[k] });
      const p = await anfrage("/api/bestand", { methode: "PUT", token: token[k],
        rumpf: { bestand: g.bestand, etag: g.etag, durch: "Pruefung" } });
      expect(p.status, `${k}: ${JSON.stringify(p).slice(0, 300)}`).toBe(r.schreibt ? 200 : 403);
      const nachher = await gespeichert(raum);
      expect(nachher.scherben).toEqual(vorher.scherben);
      expect(pfadeVerschieden(G.personenAngleichen(vorher.bestand), G.personenAngleichen(nachher.bestand))).toEqual([]);
    });
  }
});

describe("Befund WP-48.1: gespeichertes abgeleitetes Personenfeld (Altinhalt)", { timeout: 120000 }, () => {
  /* Abgeleitete Felder (planungsregeln, sichtbereich) entstehen nur in der Antwort und werden beim Schreiben
     entfernt (rechte.mjs abgeleiteteEntfernen). Trägt ein gespeicherter Altinhalt eines davon, ist das
     unveränderte Zurückschreiben NICHT wirkungslos (gemessen 2026-11-03): Planung, Leitung und Kundenrolle
     entfernen das Feld (200), die Schichtverantwortung bekommt 403 („Angaben anderer Personen ändert die
     Leitung."); Beschäftigte und Betreiber bleiben wirkungslos. Hier liegt die Rundweg-Invariante heute nicht vor. Sicher ist es trotzdem — geprüft wird: Außer dem abgeleiteten Feld ändert sich nichts.
     Für WP-48.3 heißt das: Der virtuelle Rumpf darf solche Altinhalte nicht als Änderung der Rolle werten
     (Nachweis in docs/acc45/WP48-TEILSPEICHERUNG.md, Fortschritt 48.1). */
  for (const [k, r] of Object.entries(ROLLEN)) {
    it(`${k} (${r.rolle}): höchstens das abgeleitete Feld verschwindet`, async () => {
      const { raum, token } = await neuerRaum();
      const alt = await B.bestandLesenStreng(laden(), raum);
      const mitAlt = kopie(alt.bestand);
      for (const p of mitAlt.mandanten[0].personen) if (p.id === "x1" || p.id === "y1") p.sichtbereich = null;
      await B.bestandSchreiben(laden(), raum, mitAlt, { erwarteterStand: alt.stand, durch: "Altinhalt" });
      const vorher = await gespeichert(raum);
      const g = await anfrage("/api/bestand", { token: token[k] });
      const p = await anfrage("/api/bestand", { methode: "PUT", token: token[k],
        rumpf: { bestand: g.bestand, etag: g.etag, durch: "Pruefung" } });
      expect([200, 403], `${k}: ${JSON.stringify(p).slice(0, 300)}`).toContain(p.status);
      const nachher = await gespeichert(raum);
      const ohneAbgeleitet = (b) => G.personenAngleichen({ ...b, mandanten: b.mandanten.map((m) => ({ ...m,
        personen: m.personen.map((x) => Object.fromEntries(Object.entries(x).filter(([f]) => !ABGELEITET.includes(f)))) })) });
      expect(nachher.scherben).toEqual(vorher.scherben);
      expect(pfadeVerschieden(ohneAbgeleitet(vorher.bestand), ohneAbgeleitet(nachher.bestand))).toEqual([]);
    });
  }
});

describe("Rundweg über einen Monat ohne Daten der Rolle", { timeout: 120000 }, () => {
  it("MA: die Sicht trägt fremde Ist-Zeiten nicht — Zurückschreiben löscht sie nicht", async () => {
    const { raum, token } = await neuerRaum();
    const g = await anfrage("/api/bestand", { token: token.MA });
    const sichtIst = Object.keys(g.bestand.mandanten[0].erfassung || {});
    expect(sichtIst.every((k2) => k2.startsWith("m0|")), "nur eigene Ist-Zeiten in der Sicht").toBe(true);
    await anfrage("/api/bestand", { methode: "PUT", token: token.MA, rumpf: { bestand: g.bestand, etag: g.etag } });
    const nach = (await gespeichert(raum)).bestand.mandanten[0];
    expect(Object.keys(nach.erfassung).filter((k2) => k2.startsWith("b1|")).length).toBe(3);
    expect(Object.keys(nach.einstempeln).filter((k2) => k2.startsWith("b1|")).length).toBe(3);
    expect(MONAT_JETZT).toMatch(/^\d{4}-\d{2}$/);
  });
});
