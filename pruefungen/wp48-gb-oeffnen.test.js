/* ==========================================================================
   WP-48-GB — Öffnen des Plans schreibt nicht (Befund WP-33, Nebenbefund)

   Mehrere Sitzungen verschiedener Rollen öffnen denselben Betrieb, niemand
   gibt etwas ein — und eine sieht „Gleichzeitig bearbeitet" (409 auf
   PUT /api/bestand). Geprüft wird mit dem echten Handler
   (server/funktionen/daten.mjs) und der echten Entscheidungslogik der
   Oberfläche (src/app/oeffnen.js, von App.jsx benutzt):

     A  Reproduktion: der alte Ablauf (Tour-Selbststart schrieb, Konflikt
        immer als Dialog) erzeugt den 409 ohne jede Eingabe.
     B  Beide untätig, nichts fällig: kein einziger PUT, Stand unverändert.
     C  Urlaubshinweis fällig, Leitung und Planung öffnen gleichzeitig: genau
        eine Sitzung schreibt, die andere übernimmt still (kein Dialog),
        keine doppelten Mitteilungen, der Hinweis ist da.
     D  Echte gleichzeitige Änderungen bleiben ein Konflikt (Dialog), auch
        wenn der automatische Lauf vorher lief und die Person danach etwas
        geändert hat.
     E  Verdrahtung: App.jsx schreibt beim Öffnen keinen Tourzustand mehr und
        benutzt die Logik aus app/oeffnen.js.

   Aufruf: npx vitest run pruefungen/wp48-gb-oeffnen.test.js
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { abbildVon, schreibAbbild, urlaubshinweiseAnwenden, automatikKonfliktLoesen } from "../src/app/oeffnen.js";
import { urlaubshinweiseAnlegen } from "../src/app/navigation.js";
import { migriere } from "../src/migration.js";

const HIER = path.dirname(fileURLToPath(import.meta.url));
const WIRT = "127.0.0.1:3000";
let wurzel, laden, daten, B, sitzungAnlegen;
let raumNr = 0, RAUM = "";
const kopie = (x) => JSON.parse(JSON.stringify(x));

let nr = 0;
/** Jeder PUT /api/bestand wird gezählt — die Prüfgröße „Öffnen schreibt nicht". */
let puts = 0;
async function anfrage(pfad, { methode = "GET", rumpf, token } = {}) {
  nr += 1;
  if (methode === "PUT" && pfad === "/api/bestand") puts += 1;
  const kopf = { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.14.${Math.floor(nr / 250) % 250}.${nr % 250}` };
  if (methode !== "GET") kopf["content-type"] = "application/json";
  if (token) kopf.authorization = `Bearer ${token}`;
  const a = await daten(new Request(`http://${WIRT}${pfad}`, { method: methode, headers: kopf,
    ...(methode === "GET" ? {} : { body: JSON.stringify(rumpf || {}) }) }), {});
  let d = {}; try { d = await a.json(); } catch { /* leer */ }
  return { status: a.status, ...d };
}

const person = (id, rolle, einheit, mehr = {}) => ({ id, vorname: "V", nachname: `N${id}`, rolle, bereich: einheit, status: "aktiv",
  geburtstag: "1980-01-01", eintritt: "2020-01-01", urlaubsanspruch: 30, wochenstunden: 39,
  zugehoerigkeit: [{ ab: "2020-01-01", einheitId: einheit === "ALLE" ? "e1" : einheit }], qualifikationen: [], ...mehr });

const ROLLEN = {
  PL: { rolle: "planer", person: "p1" },
  LT: { rolle: "leitung", person: "l1" },
  BR: { rolle: "betriebsrat", person: "b1" },
};
const TOKEN = {};

const bestand = () => ({ version: 9, mandanten: [{
  id: "m1", name: "Haus", status: "aktiv", einheiten: [{ id: "e1", name: "WB 1", versatzTage: 0 }],
  dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00", pause: 30 }], qualifikationen: [],
  einstellungen: { ruhezeit: 11, maxFolge: 6 },
  personen: [person("m0", "mitarbeiter", "e1"), person("a1", "mitarbeiter", "e1"),
    person("p1", "planer", "ALLE"), person("l1", "leitung", "ALLE"), person("b1", "betriebsrat", "ALLE")],
  abweichungen: {}, abwesenheiten: [], erfassung: {}, einstempeln: {}, anfragen: [], nachrichten: [], bestaetigungen: [],
}] });

async function neuerRaum() {
  RAUM = `wp48-gb-${++raumNr}`;
  await B.bestandSchreiben(laden(), RAUM, bestand(), { durch: "Prüfung" });
  for (const [k, r] of Object.entries(ROLLEN)) {
    TOKEN[k] = (await sitzungAnlegen({ bestand: RAUM, name: `V N${r.person}`, rolle: r.rolle, person: r.person, betrieb: 0,
      mandantId: "m1", einheit: null }, 2 * 3600 * 1000)).token;
  }
  puts = 0;
}

/**
 * Eine Sitzung der Oberfläche, so wie App.jsx sie führt: laden (GET, Migration,
 * Sitzung), Abbild als „zuletzt geschrieben" merken (erster Bestand), dann die
 * automatischen Läufe beim Öffnen, dann der Speicher-Effekt (schreibAbbild →
 * PUT) mit derselben Konfliktbehandlung (automatikKonfliktLoesen → still,
 * sonst Dialog).
 */
async function oeffne(k) {
  const r = await anfrage("/api/bestand", { token: TOKEN[k] });
  expect(r.status).toBe(200);
  const mig = migriere(r.bestand);
  expect(mig.ok).toBe(true);
  const pid = ROLLEN[k].person;
  const db = { ...mig.bestand, session: { rolle: "kunde", mandantId: "m1", personId: pid } };
  return { k, etag: r.etag, zugang: { rolle: r.rolle, schreiben: r.schreiben || "voll" }, db,
    zuletzt: abbildVon(db), automatik: null, dialog: null, laeufe: 0 };
}
function sitzVon(s) {
  const m = s.db.mandanten.find((x) => x.id === "m1");
  return { rolle: "kunde", db: s.db, mandant: m, person: m.personen.find((p) => p.id === s.db.session.personId), zugangRolle: s.zugang.rolle };
}
/** Der Urlaubshinweis-Effekt aus App.jsx. */
function urlaubsLauf(s, stichtag) {
  if (!urlaubshinweiseAnlegen(sitzVon(s), s.zugang)) return;
  const erg = urlaubshinweiseAnwenden(s.db, "m1", stichtag);
  if (!erg) return;
  s.laeufe += 1;
  s.automatik = abbildVon(erg.bestand);
  s.db = erg.bestand;
}
/** Der Speicher-Effekt aus App.jsx (ohne Verzögerung). */
async function speichern(s, { stichtag, alt = false } = {}) {
  const abbild = schreibAbbild(s.db, s.zuletzt);
  if (abbild === null) return null;
  s.zuletzt = abbild;
  const automatisch = s.automatik; s.automatik = null;
  const { session, ...ohne } = s.db;
  const a = await anfrage("/api/bestand", { methode: "PUT", token: TOKEN[s.k], rumpf: { bestand: { ...ohne, session: null }, etag: s.etag, durch: s.k } });
  if (a.status === 200) { s.etag = a.etag; return a; }
  if (a.status === 409) {
    s.etag = a.etag;   // speicher.js übernimmt den ETag der Absage
    const uebernehmen = alt ? null : automatikKonfliktLoesen({ automatisch, geschrieben: abbild, lokal: s.db, antwort: a, migriere });
    if (uebernehmen) {
      s.db = { ...uebernehmen, session: s.db.session };
      s.zuletzt = abbildVon(s.db);
      if (s.laeufe < 2 && stichtag) { urlaubsLauf(s, stichtag); await speichern(s, { stichtag }); }
      return a;
    }
    s.dialog = a;   // „Gleichzeitig bearbeitet"
    return a;
  }
  throw new Error(`${s.k}: unerwartet ${a.status} ${JSON.stringify(a).slice(0, 200)}`);
}
/** Der entfernte Tour-Effekt (alter Ablauf, nur für die Reproduktion). */
function alterTourStart(s) {
  const pid = s.db.session.personId;
  s.db = { ...s.db, mandanten: s.db.mandanten.map((x) => x.id !== "m1" ? x
    : { ...x, personen: x.personen.map((y) => y.id !== pid ? y : { ...y, tour: { ...(y.tour || {}), offen: true, schritt: 0 } }) }) };
}

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-wp48-gb-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
  const { getStore } = await import("../server/lib/ablage.mjs");
  laden = () => getStore({ name: "centric", consistency: "strong" });
  daten = (await import("../server/funktionen/daten.mjs")).default;
  B = await import("../server/lib/bestand.mjs");
  ({ sitzungAnlegen } = await import("../server/lib/sitzungen.mjs"));
});
afterAll(async () => { if (wurzel) await rm(wurzel, { recursive: true, force: true }); });

const FAELLIG = "2026-11-13";      // ab Oktober: Hinweis fällig
const NICHT_FAELLIG = "2026-06-01";

describe("WP-48-GB: Öffnen schreibt nicht", { timeout: 120000 }, () => {
  it("A Reproduktion: alter Ablauf — zwei Sitzungen öffnen ohne Eingabe, eine bekommt 409", async () => {
    await neuerRaum();
    const pl = await oeffne("PL"), lt = await oeffne("LT");
    for (const s of [pl, lt]) { alterTourStart(s); urlaubsLauf(s, FAELLIG); }
    await speichern(pl, { alt: true });
    await speichern(lt, { alt: true });
    expect(puts, "beide schrieben beim bloßen Öffnen").toBe(2);
    expect(lt.dialog && lt.dialog.status, "„Gleichzeitig bearbeitet“ ohne Eingabe").toBe(409);
  });

  it("A2 Reproduktion: schon der Tour-Selbststart allein (nichts fällig) löste den 409 aus", async () => {
    await neuerRaum();
    const pl = await oeffne("PL"), lt = await oeffne("LT");
    for (const s of [pl, lt]) { alterTourStart(s); urlaubsLauf(s, NICHT_FAELLIG); }
    await speichern(pl, { alt: true });
    await speichern(lt, { alt: true });
    expect(puts).toBe(2);
    expect(lt.dialog && lt.dialog.status).toBe(409);
  });

  it("B beide untätig, nichts fällig: kein PUT, kein Konflikt, Stand unverändert", async () => {
    await neuerRaum();
    const pl = await oeffne("PL"), lt = await oeffne("LT"), br = await oeffne("BR");
    const vorher = pl.etag;
    for (const s of [pl, lt, br]) urlaubsLauf(s, NICHT_FAELLIG);
    for (const s of [pl, lt, br]) await speichern(s);
    expect(puts, "Öffnen ohne Eingabe schreibt nicht").toBe(0);
    for (const s of [pl, lt, br]) expect(s.dialog).toBeNull();
    expect((await anfrage("/api/bestand", { token: TOKEN.PL })).etag).toBe(vorher);
    /* Die Tour startet trotzdem: Die Personen tragen keinen Tourzustand, tourStartet() entscheidet beim Darstellen. */
    const { tourStartet } = await import("../src/lib/tour.js");
    expect(tourStartet(sitzVon(pl).person, "planer")).toBe(true);
    expect(sitzVon(pl).person.tour).toBeUndefined();
  });

  it("B2 Betriebsrat schreibt nie von selbst (schreibAbbild null), auch bei geändertem Abbild", async () => {
    await neuerRaum();
    const br = await oeffne("BR");
    const geaendert = { ...br.db, mandanten: br.db.mandanten.map((m) => ({ ...m, name: "Anders" })) };
    expect(schreibAbbild(geaendert, br.zuletzt)).toBeNull();
    expect(schreibAbbild(br.db, br.zuletzt), "unverändert: nichts zu schreiben").toBeNull();
  });

  it("C Urlaubshinweis fällig, Leitung und Planung öffnen gleichzeitig: ein Schreibvorgang, kein Dialog, keine Doppel", async () => {
    await neuerRaum();
    const pl = await oeffne("PL"), lt = await oeffne("LT");
    for (const s of [pl, lt]) urlaubsLauf(s, FAELLIG);
    expect(pl.automatik && lt.automatik, "beide legen den Hinweis an (beide voller Schreibumfang)").toBeTruthy();
    await speichern(pl, { stichtag: FAELLIG });
    await speichern(lt, { stichtag: FAELLIG });
    expect(pl.dialog, "Planung: kein Dialog").toBeNull();
    expect(lt.dialog, "Leitung: kein Dialog").toBeNull();
    expect(puts, "ein gelungener Schreibvorgang und ein abgewiesener, still übernommen — kein dritter").toBe(2);
    const m = (await B.bestandLesen(laden(), RAUM)).bestand.mandanten[0];
    const hinweise = m.nachrichten.filter((n) => n.art === "urlaubVerfaellt");
    const je = new Map();
    for (const n of hinweise) je.set(n.personId, (je.get(n.personId) || 0) + 1);
    expect(je.size, "der Hinweis ist für jede Person mit Resturlaub da").toBeGreaterThanOrEqual(4);
    for (const [pid, n] of je) expect(n, `genau ein Hinweis für ${pid}`).toBe(1);
    for (const p of m.personen.filter((x) => je.has(x.id))) expect(p.urlaubshinweis).toBe(FAELLIG);
    /* Die stille Übernahme hat den Stand des Servers samt ETag: Beide Sitzungen stehen auf demselben Stand. */
    expect(lt.etag).toBe(pl.etag);
    expect(abbildVon(lt.db)).toBe(abbildVon({ ...pl.db }));
    /* Ein zweites Öffnen schreibt nichts mehr (Hinweis vermerkt). */
    const lt2 = await oeffne("LT");
    urlaubsLauf(lt2, FAELLIG);
    await speichern(lt2);
    expect(puts).toBe(2);
  });

  it("D echte gleichzeitige Änderungen bleiben ein Konflikt (Dialog)", async () => {
    await neuerRaum();
    const pl = await oeffne("PL"), lt = await oeffne("LT");
    pl.db = { ...pl.db, mandanten: pl.db.mandanten.map((m) => ({ ...m, name: "Haus Planung" })) };
    lt.db = { ...lt.db, mandanten: lt.db.mandanten.map((m) => ({ ...m, name: "Haus Leitung" })) };
    await speichern(pl);
    await speichern(lt);
    expect(pl.dialog).toBeNull();
    expect(lt.dialog && lt.dialog.status, "echter Konflikt wird gemeldet").toBe(409);
    expect((await B.bestandLesen(laden(), RAUM)).bestand.mandanten[0].name).toBe("Haus Planung");
  });

  it("D2 automatischer Lauf + danach eine eigene Änderung: Konflikt bleibt ein Dialog", async () => {
    await neuerRaum();
    const pl = await oeffne("PL"), lt = await oeffne("LT");
    urlaubsLauf(pl, FAELLIG);
    await speichern(pl);
    urlaubsLauf(lt, FAELLIG);
    /* Die Leitung ändert im selben Zug etwas (vor dem verzögerten Schreiben): kein reiner Automatiklauf mehr. */
    lt.db = { ...lt.db, mandanten: lt.db.mandanten.map((m) => ({ ...m, name: "Haus Leitung" })) };
    await speichern(lt, { stichtag: FAELLIG });
    expect(lt.dialog && lt.dialog.status).toBe(409);
  });

  it("D3 automatikKonfliktLoesen: nur reiner Automatiklauf ohne spätere Eingabe, nur mit Bestand", () => {
    const db = { version: 9, mandanten: [{ id: "m1", personen: [] }], session: { personId: "x" } };
    const ab = abbildVon(db);
    const antwort = { bestand: { version: 9, mandanten: [{ id: "m1", personen: [], name: "neu" }] } };
    const mig = (b) => migriere(b);
    expect(automatikKonfliktLoesen({ automatisch: ab, geschrieben: ab, lokal: db, antwort, migriere: mig })).toBeTruthy();
    expect(automatikKonfliktLoesen({ automatisch: null, geschrieben: ab, lokal: db, antwort, migriere: mig }), "kein Automatiklauf").toBeNull();
    expect(automatikKonfliktLoesen({ automatisch: "anders", geschrieben: ab, lokal: db, antwort, migriere: mig }), "Lauf + Eingabe").toBeNull();
    expect(automatikKonfliktLoesen({ automatisch: ab, geschrieben: ab, lokal: { ...db, x: 1 }, antwort, migriere: mig }), "danach geändert").toBeNull();
    expect(automatikKonfliktLoesen({ automatisch: ab, geschrieben: ab, lokal: db, antwort: {}, migriere: mig }), "ohne Bestand").toBeNull();
  });

  it("E Verdrahtung: App.jsx schreibt beim Öffnen keinen Tourzustand und nutzt app/oeffnen.js", async () => {
    const app = (await readFile(path.join(HIER, "..", "src", "App.jsx"), "utf8")).replace(/\r\n/g, "\n");
    /* Kein Effekt mehr, der den Tourzustand ohne Eingabe setzt (die Aktionen in app/aktionen bleiben). */
    expect(app).not.toMatch(/tour:\s*\{\s*\.\.\.\(y\.tour \|\| \{\}\),\s*offen:\s*true,\s*schritt:\s*0\s*\}/);
    expect(app).not.toMatch(/tourGeprueft/);
    /* Die Tour startet weiter über die Darstellung. */
    expect(app).toMatch(/tourStartet\(sitz\.person, sitz\.person\.rolle \|\| "mitarbeiter"\)\) && \(\s*<TourLeiste/);
    /* Speicher-Effekt und Konfliktbehandlung aus app/oeffnen.js. */
    expect(app).toMatch(/schreibAbbild\(db, zuletztGeschrieben\.current\)/);
    expect(app).toMatch(/automatikKonfliktLoesen\(\{ automatisch, geschrieben: abbild, lokal: ref\.current/);
    expect(app).toMatch(/urlaubshinweiseAnwenden\(s2, m\.id, heute\(\)\)/);
    expect(app).toMatch(/automatikAbbild\.current = abbildVon\(erg\.bestand\)/);
    /* Kein zweiter, lokaler abbildVon. */
    expect(app).not.toMatch(/const abbildVon = /);
  });
});
