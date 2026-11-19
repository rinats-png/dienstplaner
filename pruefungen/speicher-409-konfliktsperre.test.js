/* ==========================================================================
   Folgepaket #365 — Konfliktsperre nach 409 in src/speicher.js (ohne Teilweg)

   Befund (Review #365, docs/acc45/WP-48-GB-ANALYSE.md §6 Restrisiko 2): Nach
   einem 409 „Gleichzeitig bearbeitet" übernahm speicher.js sofort den ETag der
   Absage. Jede danach gesendete eigene Eingabe ging mit diesem ETag hinaus.
   Der Server schreibt bei aktuellem ETag OHNE Abgleich (server/lib/bestand.mjs,
   „Kein Stand mitgeschickt: schreiben ohne Abgleich") — die fremde Änderung war
   still verloren, obwohl der Dialog offen war.

     S  Server: Drei-Wege-Abgleich nur bei veraltetem ETag; mit aktuellem ETag
        schreibt er den ganzen geschickten Stand (der Verlust ist echt, nicht
        hypothetisch).
     V1 Eingabe wartet im Zeitgeber, während der 409 kommt
     V2 Eingabe wartet in der Schreibkette hinter dem abgewiesenen Auftrag
     V3 gescheiterter Auftrag (Netz) → „Noch einmal senden" → 409
     V4 Dialog offen (oder „Später entscheiden") und weitere Eingabe
     V6 zwei Reiter derselben Sitzung (eigene Modulinstanzen)
        (V5 Teilweg: pruefungen/wp48-5-oberflaeche.test.js P4b, unverändert)
     E  Entscheidungen: „meins" (ETag der Absage, eigener Stand gewinnt),
        „server" (automatische Lösung WP-48-GB), verwerfen (Neu laden)
     D  Differenz alt/neu: konfliktfreie Abläufe senden dieselben Requests in
        derselben Reihenfolge mit denselben Rümpfen und ETags
     Q  Quelltext-Verträge (App.jsx, speicherlage.jsx)
     P  P2-20 (Restrisiko, belegt): „Meinen Stand übernehmen" ersetzt auch
        fremde Änderungen außerhalb der genannten Monate; Karte und Rückfrage
        sagen das (Hinweis, Verhalten unverändert)

   Echter Client (src/speicher.js, eigene Modulinstanz je Reiter) gegen den
   echten Handler (fetch auf daten() umgeleitet, Dateiablage).
   Aufruf: npx vitest run pruefungen/speicher-409-konfliktsperre.test.js --maxWorkers=1
   ========================================================================== */
// zeit-ok: keine Uhr der Prüfung; der echte Handler setzt Sitzungs- und Speicherzeiten selbst, Tagesschlüssel sind feste Kalendertage ohne Bezug zu heute.

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HIER = path.dirname(fileURLToPath(import.meta.url));
const WIRT = "127.0.0.1:3000";
let wurzel, laden, daten, B, sitzungAnlegen;
let raumNr = 0, RAUM = "";
let nr = 0;

const kopie = (x) => JSON.parse(JSON.stringify(x));
const person = (id, rolle) => ({ id, vorname: "V", nachname: `N${id}`, rolle, bereich: rolle === "mitarbeiter" ? "e1" : "ALLE",
  status: "aktiv", geburtstag: "1980-01-01", eintritt: "2020-01-01", urlaubsanspruch: 30, wochenstunden: 39,
  zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }], qualifikationen: [] });
const bestand = () => ({ version: 9, mandanten: [{
  id: "m1", name: "Haus", status: "aktiv", branche: "produktion",
  einheiten: [{ id: "e1", name: "WB 1", versatzTage: 0 }],
  dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00", pause: 30 }], qualifikationen: [],
  einstellungen: { ruhezeit: 11, maxFolge: 6 },
  personen: [person("m0", "mitarbeiter"), person("a1", "mitarbeiter"), person("p1", "planer"), person("l1", "leitung")],
  abweichungen: {}, abwesenheiten: [], erfassung: {}, einstempeln: {}, anfragen: [], nachrichten: [], bestaetigungen: [],
}] });
const TOKEN = {};

let PUTS = [];
async function neuerRaum() {
  RAUM = `speicher-409-${++raumNr}`;
  PUTS = [];
  await B.bestandSchreiben(laden(), RAUM, bestand(), { durch: "Prüfung" });
  for (const [k, p, rolle] of [["PL", "p1", "planer"], ["LT", "l1", "leitung"]]) {
    TOKEN[k] = (await sitzungAnlegen({ bestand: RAUM, name: `V N${p}`, rolle, person: p, betrieb: 0,
      mandantId: "m1", einheit: null }, 2 * 3600 * 1000)).token;
  }
}
const gespeichert = async () => (await B.bestandLesen(laden(), RAUM)).bestand.mandanten[0];

/* Ein Netzausfall für den nächsten Aufruf (V3). */
let netzWegEinmal = false;
const speicherAttrappe = (vorab = {}) => { const m = new Map(Object.entries(vorab)); return { getItem: (k) => (m.has(k) ? m.get(k) : null),
  setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear() }; };
/** Ein Reiter: eigene Modulinstanz von src/speicher.js mit eigener Sitzung; fetch → echter Handler. */
async function reiter(k) {
  vi.resetModules();
  vi.stubGlobal("sessionStorage", speicherAttrappe({ "centric:token": TOKEN[k] }));
  vi.stubGlobal("localStorage", speicherAttrappe());
  /* fetch ist global (für alle Reiter derselbe); die PUTs eines Reiters erkennt man an seiner Sitzung. Zwei Reiter
     derselben Sitzung (V6) teilen sich daher die Liste. */
  const tok = TOKEN[k];
  const r = { get puts() { return PUTS.filter((x) => x.token === tok).map((x) => x.rumpf); },
    konflikt: [], fehler: [], gespeichert: [] };
  /* Fenster und Dokument je Reiter (Muster modul-kern-nachtrag5-speicher): beforeunload und visibilitychange auslösbar. */
  const lauscher = {}, sicht = {};
  vi.stubGlobal("window", { addEventListener: (art, f) => { lauscher[art] = f; } });
  vi.stubGlobal("document", { visibilityState: "visible", addEventListener: (art, f) => { sicht[art] = f; } });
  r.schliessen = () => { const e = { verhindert: false, preventDefault() { this.verhindert = true; }, returnValue: "x" };
    lauscher.beforeunload(e); return e; };
  r.verbergen = () => { globalThis.document.visibilityState = "hidden"; sicht.visibilitychange(); };
  vi.stubGlobal("fetch", async (url, opt = {}) => {
    nr += 1;
    if (netzWegEinmal) { netzWegEinmal = false; throw new TypeError("Failed to fetch"); }
    const kopf = { ...(opt.headers || {}), host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.49.${Math.floor(nr / 250) % 250}.${nr % 250}` };
    const methode = opt.method || "GET";
    if (methode === "PUT") PUTS.push({ token: String(new Headers(opt.headers || {}).get("authorization") || "").replace(/^Bearer /, ""),
      rumpf: JSON.parse(opt.body) });
    return daten(new Request(`http://${WIRT}${url}`, { method: methode, headers: kopf, ...(opt.body ? { body: opt.body } : {}) }), {});
  });
  r.SP = await import("../src/speicher.js");
  const g = await r.SP.lies();
  r.SP.teilwegUebernehmen(g.teilAntwort);
  r.db = { ...g.bestand, session: { mandantId: "m1", personId: k === "PL" ? "p1" : "l1" } };
  r.etag0 = String((await B.bestandLesenStreng(laden(), RAUM)).stand);
  return r;
}
const opt = (r, mehr = {}) => ({ durch: "Pruefung", onKonflikt: (d) => r.konflikt.push(d), onFehler: (l) => r.fehler.push(l),
  onGespeichert: (b) => r.gespeichert.push(b), ...mehr });
const aendere = (r, fn) => { r.db = { ...r.db, mandanten: r.db.mandanten.map((m) => (m.id === "m1" ? fn(m) : m)) }; return r.db; };
const ruhezeit = (r, h) => aendere(r, (m) => ({ ...m, einstellungen: { ...m.einstellungen, ruhezeit: h } }));
/** Die fremde Änderung X der Planung (eigener Reiter, Stammdaten). */
async function fremdX(name = "Haus Planung") {
  const pl = await reiter("PL");
  aendere(pl, (m) => ({ ...m, name }));
  await pl.SP.schreib(pl.db, { ...opt(pl), sofort: true });
  expect(pl.gespeichert, "X gespeichert").toHaveLength(1);
  return pl;
}

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-speicher-409-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
  delete process.env.CENTRIC_TEILSPEICHERUNG;
  const schutz = await import("../server/lib/schutz.mjs");
  for (const art of Object.keys(schutz.GRENZEN)) schutz.GRENZEN[art] = { ...schutz.GRENZEN[art], versuche: 100000 };
  const { getStore } = await import("../server/lib/ablage.mjs");
  laden = () => getStore({ name: "centric", consistency: "strong" });
  daten = (await import("../server/funktionen/daten.mjs")).default;
  B = await import("../server/lib/bestand.mjs");
  ({ sitzungAnlegen } = await import("../server/lib/sitzungen.mjs"));
});
afterEach(() => { netzWegEinmal = false; vi.unstubAllGlobals(); });
afterAll(async () => { if (wurzel) await rm(wurzel, { recursive: true, force: true }); });

describe("S Server: Abgleich nur bei veraltetem ETag", { timeout: 120000 }, () => {
  it("veralteter ETag, andere Monate → zusammengeführt; Überschneidung → 409; aktueller ETag → ohne Abgleich (X weg)", async () => {
    await neuerRaum();
    const lt = await reiter("LT");
    await fremdX();
    /* Eigene Änderung nur in einem Monat (Scherbe), X nur in den Stammdaten: kein Streit, beides bleibt. */
    aendere(lt, (m) => ({ ...m, abweichungen: { "a1|2026-03-02": "F" } }));
    await lt.SP.schreib(lt.db, { ...opt(lt), sofort: true });
    expect(lt.konflikt).toEqual([]);
    let s = await gespeichert();
    expect([s.name, s.abweichungen["a1|2026-03-02"]]).toEqual(["Haus Planung", "F"]);
    /* Direkt am Handler: der alte Stand (ohne X) mit dem AKTUELLEN ETag wird ohne Abgleich geschrieben. */
    const aktuell = (await B.bestandLesenStreng(laden(), RAUM)).stand;
    const alt = { ...bestand(), mandanten: bestand().mandanten.map((m) => ({ ...m, einstellungen: { ...m.einstellungen, ruhezeit: 12 } })) };
    const w = await B.bestandSchreiben(laden(), RAUM, alt, { durch: "Pruefung", erwarteterStand: aktuell });
    expect(w.ok, JSON.stringify(w).slice(0, 200)).toBe(true);
    s = await gespeichert();
    expect(s.name, "mit aktuellem ETag: X still überschrieben").toBe("Haus");
  });
});

describe("V Varianten: nach dem 409 geht nichts hinaus, X bleibt", { timeout: 120000 }, () => {
  it("V1 Eingabe wartet im Zeitgeber, als der 409 kommt: kein PUT, X bleibt, Auftrag ausstehend", async () => {
    await neuerRaum();
    const lt = await reiter("LT");
    await fremdX();
    const p1 = lt.SP.schreib(ruhezeit(lt, 12), { ...opt(lt), sofort: true });
    lt.SP.schreib(ruhezeit(lt, 13), opt(lt));   // wartet im Zeitgeber
    await p1;
    expect(lt.konflikt, "Dialog").toHaveLength(1);
    await lt.SP.schreibenAbschliessen();         // wie der Zeitgeber: das Wartende jetzt
    expect(lt.puts.map((p) => String(p.etag)), "nur der abgewiesene PUT").toEqual([lt.etag0]);
    const s = await gespeichert();
    expect([s.name, s.einstellungen.ruhezeit]).toEqual(["Haus Planung", 11]);
    expect(lt.SP.ausstehend()).toMatchObject({ art: "konfliktOffen", status: 409 });
    expect(lt.SP.ausstehenderBestand().mandanten[0].einstellungen.ruhezeit, "jüngste Eingabe nicht verworfen").toBe(13);
    expect(lt.SP.schreibenAusstehend(), "nichts gilt als gespeichert").toBe(true);
    expect(lt.fehler.at(-1).art).toBe("konfliktOffen");
  });

  it("V2 Eingabe wartet in der Schreibkette hinter dem abgewiesenen Auftrag: kein zweiter PUT", async () => {
    await neuerRaum();
    const lt = await reiter("LT");
    await fremdX();
    const p1 = lt.SP.schreib(ruhezeit(lt, 12), { ...opt(lt), sofort: true });
    const p2 = lt.SP.schreib(ruhezeit(lt, 14), { ...opt(lt), sofort: true });
    await Promise.all([p1, p2]);
    expect(lt.konflikt).toHaveLength(1);
    expect(lt.puts).toHaveLength(1);
    expect((await gespeichert()).name).toBe("Haus Planung");
    expect(lt.SP.ausstehenderBestand().mandanten[0].einstellungen.ruhezeit).toBe(14);
  });

  it("V3 gescheitert (Netz), dann „Noch einmal senden“ → 409: nicht „gespeichert“, danach kein PUT", async () => {
    await neuerRaum();
    const lt = await reiter("LT");
    netzWegEinmal = true;
    await lt.SP.schreib(ruhezeit(lt, 12), { ...opt(lt), sofort: true });
    expect(lt.SP.ausstehend()).toMatchObject({ art: "netz" });
    await fremdX();
    const erg = await lt.SP.nochmalSchreiben();
    expect(erg.ok, "ein 409 ist kein Erfolg").toBe(false);
    expect(lt.konflikt).toHaveLength(1);
    expect(lt.SP.ausstehend()).toMatchObject({ art: "konfliktOffen" });
    await lt.SP.schreib(ruhezeit(lt, 13), { ...opt(lt), sofort: true });
    expect(lt.puts.map((p) => String(p.etag))).toEqual([lt.etag0]);
    expect((await gespeichert()).name).toBe("Haus Planung");
  });

  it("V4 Dialog offen bzw. „Später entscheiden“, weitere Eingaben: nichts geht hinaus, Leiste „konfliktOffen“", async () => {
    await neuerRaum();
    const lt = await reiter("LT");
    await fremdX();
    await lt.SP.schreib(ruhezeit(lt, 12), { ...opt(lt), sofort: true });
    expect(lt.konflikt).toHaveLength(1);
    expect(lt.SP.konfliktLage()).toBe(lt.konflikt[0]);
    for (const h of [13, 14]) await lt.SP.schreib(ruhezeit(lt, h), { ...opt(lt), sofort: true });
    expect(lt.puts).toHaveLength(1);
    expect(lt.fehler.map((f) => f.art)).toEqual(["konfliktOffen", "konfliktOffen"]);
    expect((await gespeichert()).name).toBe("Haus Planung");
    const r = await lt.SP.wiederherstellen("egal");
    expect(r.status, "Zurückspielen wartet auf die Entscheidung").toBe(0);
    expect(lt.puts).toHaveLength(1);
  });

  it("V7 Schließen (beforeunload) und Verbergen (visibilitychange) bei Sperre: kein PUT, beforeunload fragt nach", async () => {
    await neuerRaum();
    const lt = await reiter("LT");
    await fremdX();
    await lt.SP.schreib(ruhezeit(lt, 12), { ...opt(lt), sofort: true });
    expect(lt.konflikt).toHaveLength(1);
    /* N1: gleich nach dem 409 (ohne weitere Eingabe) liegt die Lage für die Leiste vor („Später entscheiden“). */
    expect(lt.SP.ausstehend()).toMatchObject({ art: "konfliktOffen" });
    /* Nichts wartet, aber Ungesichertes ist gehalten: nachfragen. */
    expect(lt.schliessen().verhindert, "beforeunload fragt ohne wartende Eingabe").toBe(true);
    /* Mit wartender Eingabe: nichts hinaus (auch nicht per keepalive), aber nachfragen. */
    lt.SP.schreib(ruhezeit(lt, 13), opt(lt));
    expect(lt.schliessen().verhindert).toBe(true);
    await lt.SP.schreibenAbschliessen();
    lt.SP.schreib(ruhezeit(lt, 14), opt(lt));
    lt.verbergen();
    await lt.SP.schreibenAbschliessen();
    expect(lt.puts, "nur der abgewiesene PUT").toHaveLength(1);
    expect(lt.SP.ausstehenderBestand().mandanten[0].einstellungen.ruhezeit).toBe(14);
    expect((await gespeichert()).name).toBe("Haus Planung");
    /* Als Datei gesichert: keine Nachfrage mehr (wie nach einem Löschlauf). */
    lt.SP.ausstehendGesichert();
    expect(lt.schliessen().verhindert).toBe(false);
  });

  it("V6 zwei Reiter derselben Sitzung: jeder hält nach seinem 409 an, der Server sichert über den ETag ab", async () => {
    await neuerRaum();
    const a = await reiter("LT");
    const b = await reiter("LT");
    await fremdX();
    await a.SP.schreib(ruhezeit(a, 12), { ...opt(a), sofort: true });
    await b.SP.schreib(ruhezeit(b, 15), { ...opt(b), sofort: true });
    expect([a.konflikt.length, b.konflikt.length]).toEqual([1, 1]);
    await a.SP.schreib(ruhezeit(a, 13), { ...opt(a), sofort: true });
    await b.SP.schreib(ruhezeit(b, 16), { ...opt(b), sofort: true });
    expect(a.puts.map((p) => p.bestand.mandanten[0].einstellungen.ruhezeit), "je Reiter nur der abgewiesene PUT").toEqual([12, 15]);
    const s = await gespeichert();
    expect([s.name, s.einstellungen.ruhezeit]).toEqual(["Haus Planung", 11]);
  });
});

describe("E Entscheidungen", { timeout: 120000 }, () => {
  it("„meins“: erst danach ein PUT, mit dem ETag der Absage und dem jüngsten Stand; Sperre aufgehoben", async () => {
    await neuerRaum();
    const lt = await reiter("LT");
    await fremdX();
    await lt.SP.schreib(ruhezeit(lt, 12), { ...opt(lt), sofort: true });
    await lt.SP.schreib(ruhezeit(lt, 13), { ...opt(lt), sofort: true });   // wartet (gehalten)
    expect(lt.puts).toHaveLength(1);
    const etagAbsage = lt.konflikt[0].etag;
    expect(String(etagAbsage)).not.toBe(lt.etag0);
    expect(lt.SP.konfliktLoesen("meins")).toBe(true);
    expect(lt.SP.ausstehend(), "überholter Auftrag nicht mehr ausstehend").toBeNull();
    await lt.SP.schreib(lt.db, { durch: "Übernahme nach Konflikt", sofort: true, onFehler: (l) => lt.fehler.push(l) });
    expect(lt.puts).toHaveLength(2);
    expect(String(lt.puts[1].etag)).toBe(String(etagAbsage));
    expect(lt.puts[1].bestand.mandanten[0].einstellungen.ruhezeit).toBe(13);
    const s = await gespeichert();
    expect([s.name, s.einstellungen.ruhezeit], "ausdrücklich gewählt: der eigene Stand ersetzt X").toEqual(["Haus", 13]);
    expect(lt.SP.konfliktLoesen("meins"), "nichts mehr offen").toBe(false);
    expect(lt.SP.schreibenAusstehend()).toBe(false);
    /* Danach wieder gewöhnlich: die nächste Eingabe geht mit dem neuen ETag hinaus. */
    await lt.SP.schreib(ruhezeit(lt, 10), { ...opt(lt), sofort: true });
    expect(lt.puts).toHaveLength(3);
    expect((await gespeichert()).einstellungen.ruhezeit).toBe(10);
  });

  it("„meins“, aber der Server hat sich inzwischen wieder geändert: erneut 409 und Sperre, nichts überschrieben", async () => {
    await neuerRaum();
    const lt = await reiter("LT");
    await fremdX();
    await lt.SP.schreib(ruhezeit(lt, 12), { ...opt(lt), sofort: true });
    await fremdX("Haus Planung 2");
    lt.SP.konfliktLoesen("meins");
    await lt.SP.schreib(lt.db, { durch: "Übernahme nach Konflikt", sofort: true, onFehler: (l) => lt.fehler.push(l) });
    expect(lt.fehler.at(-1).art, "ohne onKonflikt: die Leiste").toBe("konfliktOffen");
    expect(lt.SP.konfliktLage()).toBeTruthy();
    expect((await gespeichert()).name).toBe("Haus Planung 2");
  });

  it("„server“ (automatische Lösung, WP-48-GB): kein PUT; die nächste Eingabe auf dem Serverstand bewahrt X", async () => {
    await neuerRaum();
    const lt = await reiter("LT");
    await fremdX();
    let geloest = null;
    await lt.SP.schreib(ruhezeit(lt, 12), { ...opt(lt), sofort: true, onKonflikt: (d) => {
      /* wie App.jsx: Stand der Absage übernehmen, im selben Rückruf entscheiden */
      lt.SP.konfliktLoesen("server");
      lt.db = { ...d.bestand, session: lt.db.session };
      geloest = d;
    } });
    expect(geloest).toBeTruthy();
    expect(lt.SP.ausstehend()).toBeNull();
    expect(lt.SP.schreibenAusstehend()).toBe(false);
    await lt.SP.schreib(ruhezeit(lt, 9), { ...opt(lt), sofort: true });
    expect(lt.puts.map((p) => String(p.etag))).toEqual([lt.etag0, String(geloest.etag)]);
    const s = await gespeichert();
    expect([s.name, s.einstellungen.ruhezeit]).toEqual(["Haus Planung", 9]);
  });

  it("verwerfen (Neu laden): wartender und gehaltener Auftrag weg, nichts gesendet", async () => {
    await neuerRaum();
    const lt = await reiter("LT");
    await fremdX();
    await lt.SP.schreib(ruhezeit(lt, 12), { ...opt(lt), sofort: true });
    lt.SP.schreib(ruhezeit(lt, 13), opt(lt));
    lt.SP.allesAusstehendeVerwerfen();
    expect(lt.SP.ausstehend()).toBeNull();
    await lt.SP.schreibenAbschliessen();
    expect(lt.puts).toHaveLength(1);
    expect((await gespeichert()).name).toBe("Haus Planung");
  });
});

describe("D Differenz alt/neu: konfliktfreie Abläufe unverändert", { timeout: 120000 }, () => {
  it("gleiche PUTs in gleicher Reihenfolge, gleiche Rümpfe und ETags (Zeitgeber, Kette, sofort, Netzfehler + nochmal)", async () => {
    await neuerRaum();
    const lt = await reiter("LT");
    const e0 = lt.etag0;
    await lt.SP.schreib(ruhezeit(lt, 12), { ...opt(lt), sofort: true });
    lt.SP.schreib(ruhezeit(lt, 13), opt(lt));
    await lt.SP.schreibenAbschliessen();
    const p1 = lt.SP.schreib(ruhezeit(lt, 14), { ...opt(lt), sofort: true });
    const p2 = lt.SP.schreib(ruhezeit(lt, 15), { ...opt(lt), sofort: true });
    await Promise.all([p1, p2]);
    netzWegEinmal = true;
    await lt.SP.schreib(ruhezeit(lt, 16), { ...opt(lt), sofort: true });
    expect((await lt.SP.nochmalSchreiben()).ok).toBe(true);
    const erwartet = (h) => ({ bestand: lt.SP.ohneServerFelder({ ...ruhezeitStand(lt.db, h), session: null }), durch: "Pruefung" });
    /* Erwartete Folge (alter wie neuer Code): ETags zählen je angenommenem PUT um eins weiter. */
    expect(lt.puts.map((p) => ({ bestand: p.bestand, durch: p.durch }))).toEqual([12, 13, 14, 15, 16].map((h) => kopie(erwartet(h))));
    expect(lt.puts.map((p) => Object.keys(p))).toEqual(Array(5).fill(["bestand", "etag", "durch"]));
    expect(lt.puts.map((p) => Number(p.etag) - Number(e0))).toEqual([0, 1, 2, 3, 4]);
    expect([lt.konflikt.length, lt.fehler.length, lt.gespeichert.length]).toEqual([0, 1, 5]);
    expect(lt.SP.ausstehend()).toBeNull();
    expect(lt.SP.schreibenAusstehend()).toBe(false);
    expect((await gespeichert()).einstellungen.ruhezeit).toBe(16);
  });
});
const ruhezeitStand = (db, h) => ({ ...db, mandanten: db.mandanten.map((m) => ({ ...m, einstellungen: { ...m.einstellungen, ruhezeit: h } })) });

describe("P P2-20 Restrisiko (belegt, Entscheidung offen)", { timeout: 120000 }, () => {
  it("„Meinen Stand übernehmen“ ersetzt auch eine fremde Änderung in einem anderen Monat, den der Dialog nicht nennt", async () => {
    await neuerRaum();
    const lt = await reiter("LT");
    const pl = await reiter("PL");
    aendere(pl, (m) => ({ ...m, name: "Haus Planung", abweichungen: { "a1|2026-03-02": "F" } }));
    await pl.SP.schreib(pl.db, { ...opt(pl), sofort: true });
    await lt.SP.schreib(ruhezeit(lt, 12), { ...opt(lt), sofort: true });
    expect(lt.konflikt[0].monate, "der Dialog nennt nur die Stammdaten").toEqual([]);
    expect(lt.konflikt[0].kernBetroffen).toBe(true);
    lt.SP.konfliktLoesen("meins");
    await lt.SP.schreib(lt.db, { durch: "Übernahme nach Konflikt", sofort: true });
    const s = await gespeichert();
    expect(s.abweichungen["a1|2026-03-02"], "Ist-Stand: auch der März der Planung ist weg (P2-20)").toBeUndefined();
  });
  /* P2-20 Hinweis: Das Verhalten bleibt (oben belegt); der Dialog sagt es jetzt ehrlich — in der Karte und in der
     Rückfrage vor dem Übernehmen. Der Knopfname bleibt „Meinen Stand übernehmen". */
  const HINWEIS = "Auch was andere seit deinem letzten Laden in anderen Monaten geändert haben, kann dabei ersetzt werden.";
  it("Dialog: die Karte „Meinen Stand nehmen“ nennt auch fremde Änderungen in anderen Monaten (gerendert)", async () => {
    const { createElement } = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { Konfliktfenster } = await import("../src/ansichten/speicherlage.jsx");
    const html = renderToStaticMarkup(createElement(Konfliktfenster, {
      lage: { monate: ["März 2026"], durch: "Pat Planung" }, onSchliessen: () => {}, onUebernehmen: () => {}, melde: () => {} }));
    expect(html).toContain("Was Pat Planung in März 2026 geändert hat, ist danach weg. " + HINWEIS
      + " Bitte vorher kurz Rücksprache halten.");
    expect(html).toMatch(/<button[^>]*>Meinen Stand übernehmen<\/button>/);
    /* Mit Teilweg gibt es kein Übernehmen — dann auch keinen Hinweis darauf. */
    const ohne = renderToStaticMarkup(createElement(Konfliktfenster, {
      lage: { monate: ["März 2026"], ohneUebernehmen: true }, onSchliessen: () => {}, onUebernehmen: () => {}, melde: () => {} }));
    expect(ohne).not.toContain(HINWEIS);
  });
  it("Dialog: die Rückfrage vor dem Übernehmen nennt denselben Hinweis (Quelltext-Vertrag)", async () => {
    const q = (await readFile(path.join(HIER, "..", "src", "ansichten", "speicherlage.jsx"), "utf8")).replace(/\r\n/g, "\n");
    expect(q).toContain(`const ANDERE_MONATE_ERSETZT = "Auch was andere seit deinem letzten Laden in anderen Monaten geändert haben, "\n`
      + `  + "kann dabei ersetzt werden.";`);
    expect(q).toMatch(/window\.confirm\(`Die Änderungen von \$\{wer\}`\n[^\n]*werden überschrieben\. `\n\s*\+ `\$\{ANDERE_MONATE_ERSETZT\} `\n\s*\+ "Das lässt sich nicht rückgängig machen\."\)\) onUebernehmen\(\);/);
  });
});

describe("Q Quelltext-Verträge", () => {
  it("App.jsx: jede Lösung entscheidet ausdrücklich (server/meins), die Leiste öffnet das Fenster wieder", async () => {
    const app = (await readFile(path.join(HIER, "..", "src", "App.jsx"), "utf8")).replace(/\r\n/g, "\n");
    expect(app).toMatch(/if \(e\.art === "uebernehmen"\) \{\s*SP\.konfliktLoesen\("server"\);/);
    expect(app).toMatch(/if \(uebernehmen\) \{\s*\/\*[^]*?\*\/\s*SP\.konfliktLoesen\("server"\);/);
    expect(app).toMatch(/SP\.konfliktLoesen\("meins"\);\s*setNichtGespeichert\([^\n]*\);\s*SP\.schreib\(ref\.current, \{ durch: "Übernahme nach Konflikt"/);
    expect(app).toMatch(/onKonflikt=\{\(\) => \{ const d = SP\.konfliktLage\(\); if \(d\) setKonflikt\(\{ \.\.\.d, meiner: ref\.current \}\); \}\}/);
    expect(app.match(/SP\.konfliktLoesen\(/g)).toHaveLength(3);
    /* Review #374 N1: „Später entscheiden“ zeigt die Leiste sofort, nicht erst mit der nächsten Eingabe. */
    expect(app).toMatch(/onSchliessen=\{\(\) => \{ setKonflikt\(false\); if \(SP\.konfliktLage\(\)\) setNichtGespeichert\(SP\.ausstehend\(\)\); \}\}/);
  });
  it("speicherlage.jsx: Lage „konfliktOffen“ mit Entscheiden; Neu laden ohne Teilweg verwirft nach Rückfrage", async () => {
    const q = (await readFile(path.join(HIER, "..", "src", "ansichten", "speicherlage.jsx"), "utf8")).replace(/\r\n/g, "\n");
    expect(q).toMatch(/konfliktOffen: \{[^}]*konflikt: true,\s*\}/);
    /* Review #374 M2: Wegwischen am Telefon löst kein beforeunload aus — der Hinweis steht in der Leiste. */
    expect(q).toMatch(/Am Telefon "\s*\+ "vor dem Schließen der App entscheiden oder als Datei sichern/);
    expect(q).toMatch(/\{l\.konflikt && onKonflikt && <Btn[^>]*onClick=\{onKonflikt\}>Konflikt entscheiden<\/Btn>\}/);
    expect(q).toMatch(/if \(lage && lage\.ohneUebernehmen\) window\.location\.reload\(\); else verwerfenMitRueckfrage\(\);/);
  });
  it("speicher.js: Sperre nur ohne Teilweg; der PUT-Rumpf ist unverändert", async () => {
    const q = (await readFile(path.join(HIER, "..", "src", "speicher.js"), "utf8")).replace(/\r\n/g, "\n");
    expect(q).toMatch(/if \(teilGenutzt\) vollSperre = true;\n\s*else konfliktSperre = \{ etag: daten \? daten\.etag : undefined, daten \};/);
    expect(q).toMatch(/body: JSON\.stringify\(\{ bestand: hinaus, etag, durch: auftrag\.durch \}\)/);
    expect(q, "kein ETag aus einer Konfliktabsage ohne Entscheidung").not.toMatch(/else etag = daten\.etag;/);
  });
});
