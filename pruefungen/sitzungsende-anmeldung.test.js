/* ==========================================================================
   Befund B-L4 — nach dem Sitzungsende beim Server erscheint die Anmeldung

   Lokale E2E-Abnahme 2026-11-19 (docs/acc45/LOKALE-E2E-ABNAHME-2026-11-19.md §4, e2e L4a): Sitzung beim Server
   beendet, Seite neu geladen → dauerhaft das Ladegerüst „CENTRIC wird geladen", erst ein zweites Neuladen zeigte die
   Anmeldung. Ursache: src/speicher.js ruf() räumte bei 401 nur das Merkmal (abmelden(true)) und sagte der Oberfläche
   nichts; src/App.jsx verschluckt „nicht-angemeldet" (db bleibt leer → Ladegerüst); src/main.jsx blieb bei „an".

     N  Neuladen mit toter Sitzung: 401 beim Laden → Hörer → Neuladen mit Hinweis-Merker; kein Merkmal, kein Zugang
        mehr im Speicher; nach dem Neuladen genau einmal der Hinweis (Anmeldung mit Code).
     O  Sitzung endet bei offener Seite mit ausstehender Eingabe: KEIN Neuladen (die Eingabe liegt nur im Reiter);
        der Schreibvorgang scheitert mit Lage „abgemeldet", der Auftrag bleibt (ausstehenderBestand), die Leiste
        „nicht gespeichert" bietet Anmeldung mit Code in diesem Reiter und „Als Datei sichern". Auf dem Server ändert
        sich nichts.
     O  (B-L4c) Senden nach erneuter Anmeldung: dieselbe Person → mit dem alten ETag (passt: gespeichert; veraltet:
        gewöhnlicher 409); anderer Inhaber (Person oder Datenraum) → nichts gesendet, alles der vorherigen Sitzung
        verworfen; absichtliches Abmelden löscht den Merker; endet auch die neue Sitzung, bleibt er.
     K  Kein Kreislauf: Eine weitere 401 ohne Merkmal meldet nichts mehr.
     F  Entscheidungstafel sitzungsendeFolge.
     Q  Quelltext-Verträge (speicher.js, main.jsx, App.jsx).

   Echter Client (src/speicher.js, eigene Modulinstanz je Laden) gegen den echten Handler (fetch auf daten()
   umgeleitet, Dateiablage); das Sitzungsende ist echt (server/lib/sitzungen.mjs sitzungBeenden, wie Abmelden an
   anderer Stelle oder Ablauf). Kein Browser nötig; L4a/L4b in e2e/lokale-abnahme-luecken.spec.mjs prüfen dasselbe im Browser.
   Aufruf: npx vitest run pruefungen/sitzungsende-anmeldung.test.js --maxWorkers=1
   ========================================================================== */
// zeit-ok: keine Uhr der Prüfung; der echte Handler setzt Sitzungs- und Speicherzeiten selbst.

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const WIRT = "127.0.0.1:3000";
let wurzel, laden, daten, B, S;
let raumNr = 0, RAUM = "", nr = 0, TOKEN = "";

const person = (id, rolle) => ({ id, vorname: "V", nachname: `N${id}`, rolle, bereich: rolle === "mitarbeiter" ? "e1" : "ALLE",
  status: "aktiv", geburtstag: "1980-01-01", eintritt: "2020-01-01", urlaubsanspruch: 30, wochenstunden: 39,
  zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }], qualifikationen: [] });
const bestand = () => ({ version: 9, mandanten: [{
  id: "m1", name: "Haus", status: "aktiv", branche: "produktion",
  einheiten: [{ id: "e1", name: "WB 1", versatzTage: 0 }],
  dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00", pause: 30 }], qualifikationen: [],
  einstellungen: { ruhezeit: 11, maxFolge: 6 },
  personen: [person("a1", "mitarbeiter"), person("l1", "leitung")],
  abweichungen: {}, abwesenheiten: [], erfassung: {}, einstempeln: {}, anfragen: [], nachrichten: [], bestaetigungen: [],
}] });

let PUTS = [];
async function neuerRaum() {
  RAUM = `sitzungsende-${++raumNr}`;
  PUTS = [];
  await B.bestandSchreiben(laden(), RAUM, bestand(), { durch: "Prüfung" });
  TOKEN = (await S.sitzungAnlegen({ bestand: RAUM, name: "V Nl1", rolle: "leitung", person: "l1", betrieb: 0,
    mandantId: "m1", einheit: null }, 2 * 3600 * 1000)).token;
}
const gespeichert = async () => (await B.bestandLesen(laden(), RAUM)).bestand.mandanten[0];

const speicherAttrappe = (vorab = {}) => { const m = new Map(Object.entries(vorab)); return { getItem: (k) => (m.has(k) ? m.get(k) : null),
  setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear(), m }; };

/** Ein Laden der Seite: eigene Modulinstanz von speicher.js (+ sitzungsende.js), Merkmal im Reiter, fetch → Handler. */
async function seite({ ablage } = {}) {
  vi.resetModules();
  const sitzung = ablage || speicherAttrappe({ "centric:token": TOKEN });
  vi.stubGlobal("sessionStorage", sitzung);
  vi.stubGlobal("localStorage", speicherAttrappe());
  vi.stubGlobal("window", { addEventListener: () => {} });
  vi.stubGlobal("document", { visibilityState: "visible", addEventListener: () => {} });
  const r = { sitzung, neuGeladen: 0, fehler: [], gespeichert: [], tor: null, amTor: 0, putTor: null, amPutTor: 0, putNetzWeg: false, lesenErsatz: null, lesenAnpassen: null, anmeldeToken: null };
  vi.stubGlobal("fetch", async (url, opt = {}) => {
    nr += 1;
    /* A1: die Anmeldung liefert ein vorgegebenes (echt angelegtes) Merkmal; Lesen kann an einem Tor warten. */
    if (url === "/api/anmelden") return new Response(JSON.stringify({ token: r.anmeldeToken, name: "Haus", rolle: "leitung",
      person: "l1", betrieb: 0 }), { status: 200, headers: { "content-type": "application/json" } });
    if (r.tor && String(url).includes("bestand")) { r.amTor += 1; await r.tor; }
    /* Review #381: gestörte Antwort auf das Lesen (Speicher des Dienstarbeiters, Serverfehler). */
    if (r.lesenErsatz && String(url) === "/api/bestand" && !(opt.method && opt.method !== "GET")) return r.lesenErsatz();
    const kopf = { ...(opt.headers || {}), host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.52.${Math.floor(nr / 250) % 250}.${nr % 250}` };
    const methode = opt.method || "GET";
    /* Folgepaket #381 (2): Netz weg vor dem Server — der PUT kommt nicht an. */
    if (methode === "PUT" && r.putNetzWeg) throw new TypeError("Failed to fetch");
    if (methode === "PUT") PUTS.push(JSON.parse(opt.body));
    /* Delta-Review #381 (7): Der Server verarbeitet den PUT sofort, die Antwort kommt erst nach dem Tor an. */
    if (methode === "PUT" && r.putTor) {
      const antwort = await daten(new Request(`http://${WIRT}${url}`, { method: methode, headers: kopf, body: opt.body }), {});
      r.amPutTor += 1; await r.putTor;
      return antwort;
    }
    const antwort = await daten(new Request(`http://${WIRT}${url}`, { method: methode, headers: kopf, ...(opt.body ? { body: opt.body } : {}) }), {});
    /* Review #382: Leseantwort verändern (etwa ohne Inhaber, wie bei Sitzungen ohne Person). */
    if (r.lesenAnpassen && String(url) === "/api/bestand" && methode === "GET" && antwort.status === 200)
      return new Response(JSON.stringify(r.lesenAnpassen(await antwort.json())), { status: 200, headers: { "content-type": "application/json" } });
    return antwort;
  });
  const SP = await import("../src/speicher.js");
  const E = await import("../src/app/sitzungsende.js");
  Object.assign(r, { SP, E });
  r.ab = E.sitzungsendeBeobachten({ neuLaden: () => { r.neuGeladen += 1; }, ablage: sitzung });
  return r;
}
const opt = (r) => ({ durch: "Pruefung", onKonflikt: () => {}, onFehler: (l) => r.fehler.push(l), onGespeichert: (b) => r.gespeichert.push(b) });

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-sitzungsende-"));
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
  S = await import("../server/lib/sitzungen.mjs");
}, 120000);
afterEach(() => { vi.unstubAllGlobals(); });
afterAll(async () => { if (wurzel) await rm(wurzel, { recursive: true, force: true }); });

describe("N Neuladen mit toter Sitzung", { timeout: 120000 }, () => {
  it("401 beim Laden → Neuladen mit Hinweis; kein Merkmal, kein Zugang; danach genau einmal der Hinweis", async () => {
    await neuerRaum();
    expect(await S.sitzungBeenden(TOKEN), "Sitzung beim Server beendet").toBe(true);
    const r = await seite();
    expect(r.SP.angemeldet(), "Start: Merkmal aus dem Reiter").toBe(true);
    /* Was App.jsx beim Laden tut: SP.lies(). */
    await expect(r.SP.lies()).rejects.toThrow("nicht-angemeldet");
    expect(r.neuGeladen, "kontrolliert in den abgemeldeten Zustand (Neuladen wie beim Abmelden)").toBe(1);
    expect(r.SP.angemeldet()).toBe(false);
    expect(r.sitzung.getItem("centric:token"), "Merkmal geräumt").toBeNull();
    expect([r.SP.zugangsdaten(), r.SP.betriebsname()], "kein Zugang/Betrieb mehr im Speicher").toEqual([null, null]);
    expect(r.sitzung.getItem(r.E.SITZUNGSENDE_MERKER)).toBe("ja");
    expect(PUTS, "nichts gesendet").toEqual([]);

    /* Nach dem Neuladen: ohne Merkmal → main.jsx zeigt die Anmeldung (an = false) mit dem Hinweis, genau einmal. */
    const danach = await seite({ ablage: r.sitzung });
    expect(danach.SP.angemeldet(), "ohne Merkmal: Anmeldung statt Ladegerüst").toBe(false);
    expect(danach.E.sitzungsendeHinweisAbholen(r.sitzung)).toBe(danach.E.SITZUNGSENDE_HINWEIS);
    expect(danach.E.sitzungsendeHinweisAbholen(r.sitzung), "nur einmal").toBeNull();
  });
});

describe("O Sitzung endet bei offener Seite mit ausstehender Eingabe", { timeout: 120000 }, () => {
  it("Eingabe wartet, Sitzung endet, eine Anfrage bekommt 401: kein Neuladen, Eingabe bleibt, Leiste mit Anmeldung", async () => {
    await neuerRaum();
    const r = await seite();
    const g = await r.SP.lies();
    expect(r.neuGeladen).toBe(0);
    const db = { ...g.bestand, session: { mandantId: "m1", personId: "l1" } };
    const neu = { ...db, mandanten: db.mandanten.map((m) => ({ ...m, einstellungen: { ...m.einstellungen, ruhezeit: 13 } })) };
    r.SP.schreib(neu, opt(r));                       // wartet im Zeitgeber (noch nicht gesendet)
    expect(r.SP.schreibenAusstehend()).toBe(true);
    await S.sitzungBeenden(TOKEN);                    // Ablauf / Abmelden an anderer Stelle
    await expect(r.SP.lies()).rejects.toThrow("nicht-angemeldet");
    expect(r.neuGeladen, "mit Ausstehendem kein Neuladen — die Eingabe liegt nur in diesem Reiter").toBe(0);
    expect(r.sitzung.getItem(r.E.SITZUNGSENDE_MERKER)).toBeNull();
    expect(r.SP.angemeldet()).toBe(false);

    await r.SP.schreibenAbschliessen();               // wie der Zeitgeber
    expect(r.fehler.map((l) => l.art), "Leiste „nicht gespeichert“, Lage abgemeldet").toEqual(["abgemeldet"]);
    expect(r.SP.ausstehend().art).toBe("abgemeldet");
    expect(r.SP.ausstehenderBestand().mandanten[0].einstellungen.ruhezeit, "Eingabe nicht still verworfen").toBe(13);
    expect(r.SP.schreibenAusstehend(), "beforeunload fragt weiter").toBe(false);
    expect(r.neuGeladen, "die 401 des Schreibens (ohne Merkmal) meldet nichts mehr").toBe(0);
    expect((await gespeichert()).einstellungen.ruhezeit, "auf dem Server unverändert").toBe(11);
    expect(r.gespeichert).toEqual([]);

    /* Die Leiste zur Lage: Anmeldung mit Code in diesem Reiter und der Ausweg „Als Datei sichern". */
    const { NichtGespeichert, SPEICHERLAGE } = await import("../src/ansichten/speicherlage.jsx");
    expect(SPEICHERLAGE.abgemeldet.neuAnmelden).toBe(true);
    const html = renderToStaticMarkup(h(NichtGespeichert, { lage: r.SP.ausstehend(), melde: () => {}, aufGeloest: () => {} }));
    expect(html).toContain('aria-label="Zugangscode"');
    expect(html).toContain("Anmelden und senden");
    expect(html).toContain("Als Datei sichern");
  });

  it("401 direkt auf das Senden: kein Neuladen, Auftrag bleibt ausstehend", async () => {
    await neuerRaum();
    const r = await seite();
    const g = await r.SP.lies();
    const db = { ...g.bestand, session: { mandantId: "m1", personId: "l1" } };
    await S.sitzungBeenden(TOKEN);
    const neu = { ...db, mandanten: db.mandanten.map((m) => ({ ...m, name: "Haus neu" })) };
    await r.SP.schreib(neu, { ...opt(r), sofort: true });
    expect(r.neuGeladen).toBe(0);
    expect(r.fehler.map((l) => l.art)).toEqual(["abgemeldet"]);
    expect(r.SP.ausstehenderBestand().mandanten[0].name).toBe("Haus neu");
    expect((await gespeichert()).name).toBe("Haus");
  });

  it("ohne Ausstehendes bei offener Seite: 401 → Neuladen (kein Bestand bleibt angezeigt)", async () => {
    await neuerRaum();
    const r = await seite();
    await r.SP.lies();
    await S.sitzungBeenden(TOKEN);
    await expect(r.SP.lies()).rejects.toThrow("nicht-angemeldet");
    expect(r.neuGeladen).toBe(1);
    expect(r.SP.zugangsdaten()).toBeNull();
  });
});

/* Befund B-L4c: Nach dem Sitzungsende ging „Anmelden und senden" ohne Versionsangabe hinaus (abmelden(true) räumte den
   ETag) — 409 „ohne Versionsangabe nicht überschreibbar", Konfliktfenster ohne fremde Änderung. Jetzt bleibt der ETag
   über das Sitzungsende, wirkt aber nur, wenn die neue Anmeldung denselben Inhaber (Raum, Betrieb, Person) hat. */
const neueSitzung = async ({ raum = RAUM, person: p = "l1", rolle = "leitung", betrieb = 0, mandantId = "m1" } = {}) => (await S.sitzungAnlegen({
  bestand: raum, name: `V N${p}`, rolle, person: p, betrieb, mandantId, einheit: null }, 2 * 3600 * 1000)).token;
const warte = () => new Promise((ja) => { setTimeout(ja, 5); });
/** Bis zur Leiste „nicht gespeichert" wie in O: Eingabe ruhezeit 13, Sitzung beendet, Auftrag gescheitert (abgemeldet). */
async function bisZurLeiste(r) {
  const g = await r.SP.lies();
  r.inhaber = g.zugang.inhaber;
  const db = { ...g.bestand, session: { mandantId: "m1", personId: "l1" } };
  r.konflikte = [];
  const o = { ...opt(r), onKonflikt: (d) => r.konflikte.push(d) };
  r.SP.schreib({ ...db, mandanten: db.mandanten.map((m) => ({ ...m, einstellungen: { ...m.einstellungen, ruhezeit: 13 } })) }, o);
  await S.sitzungBeenden(TOKEN);
  await expect(r.SP.lies()).rejects.toThrow("nicht-angemeldet");
  await r.SP.schreibenAbschliessen();
  expect(r.SP.ausstehend().art).toBe("abgemeldet");
  /* Der Versuch ohne Merkmal (401) zählt nicht; ab hier nur die Versuche nach der neuen Anmeldung. */
  expect(PUTS.every((p) => p.etag === null)).toBe(true);
  PUTS = [];
  return (await B.bestandLesen(laden(), RAUM)).stand;
}

describe("O Senden nach erneuter Anmeldung (B-L4c)", { timeout: 120000 }, () => {
  it("dieselbe Person meldet sich in diesem Reiter an: gesendet MIT dem alten ETag, gespeichert, kein Konflikt", async () => {
    await neuerRaum();
    const r = await seite();
    const stand = await bisZurLeiste(r);
    r.anmeldeToken = await neueSitzung();
    await r.SP.anmelden("CODE-NEU", false);
    const erg = await r.SP.nochmalSchreiben();
    expect(erg).toEqual({ ok: true });
    expect(PUTS.length).toBe(1);
    expect(PUTS[0].etag, "mit der Versionsangabe von vor dem Sitzungsende").toBeTruthy();
    expect(PUTS[0].etag).toBe(stand);
    expect(r.konflikte, "kein Konfliktfenster").toEqual([]);
    expect(r.SP.konfliktLage()).toBeNull();
    expect(r.SP.ausstehend()).toBeNull();
    expect((await gespeichert()).einstellungen.ruhezeit).toBe(13);
    expect(r.neuGeladen).toBe(0);
  });

  it("inzwischen fremd geändert: gesendet mit dem alten ETag → gewöhnlicher 409, die fremde Änderung bleibt", async () => {
    await neuerRaum();
    const r = await seite();
    const stand = await bisZurLeiste(r);
    const fremd = bestand(); fremd.mandanten[0].name = "Haus fremd";
    await B.bestandSchreiben(laden(), RAUM, fremd, { durch: "Andere" });
    r.anmeldeToken = await neueSitzung();
    await r.SP.anmelden("CODE-NEU", false);
    const erg = await r.SP.nochmalSchreiben();
    expect(erg.ok).toBe(false);
    expect(PUTS.map((p) => p.etag), "der alte ETag, nicht null").toEqual([stand]);
    expect(r.konflikte.length, "Konfliktfenster mit dem Stand des Servers").toBe(1);
    expect(r.SP.konfliktLage(), "Konfliktsperre gesetzt").not.toBeNull();
    expect(JSON.stringify(r.konflikte[0])).not.toMatch(/ohne Versionsangabe/);
    const m = await gespeichert();
    expect([m.name, m.einstellungen.ruhezeit], "fremde Änderung bleibt, nichts überschrieben").toEqual(["Haus fremd", 11]);
    expect(r.SP.ausstehenderBestand().mandanten[0].einstellungen.ruhezeit, "Eingabe bleibt ausstehend").toBe(13);
  });

  for (const [titel, andere] of [
    ["andere Person im selben Raum", async () => neueSitzung({ person: "a1", rolle: "mitarbeiter" })],
    /* Der Betrieb einer Sitzung ist ihr Mandant (server/funktionen/daten.mjs betriebsteil): zweiter Mandant im Raum. */
    ["anderer Betrieb im selben Raum", async () => {
      const zwei = bestand();
      zwei.mandanten.push({ ...bestand().mandanten[0], id: "m2", name: "Haus zwei" });
      await B.bestandSchreiben(laden(), RAUM, zwei, { durch: "Prüfung" });
      return neueSitzung({ betrieb: 1, mandantId: "m2" });
    }],
    ["dieselbe Person-Kennung in einem anderen Datenraum", async () => {
      const raum2 = `${RAUM}-zwei`;
      await B.bestandSchreiben(laden(), raum2, bestand(), { durch: "Prüfung" });
      return neueSitzung({ raum: raum2 });
    }],
  ]) {
    it(`Benutzerwechsel (${titel}): nichts gesendet, ETag und Eingabe der vorherigen Sitzung verworfen`, async () => {
      await neuerRaum();
      const r = await seite();
      await bisZurLeiste(r);
      r.anmeldeToken = await andere();
      await r.SP.anmelden("CODE-ANDERS", false);
      const erg = await r.SP.nochmalSchreiben();
      expect(erg).toEqual({ ok: false, fremd: true });
      expect(PUTS, "kein Schreibversuch mit Eingabe oder ETag der vorherigen Sitzung").toEqual([]);
      expect(r.SP.ausstehend()).toBeNull();
      expect(r.SP.ausstehenderBestand()).toBeNull();
      expect(r.SP.konfliktLage()).toBeNull();
      expect(r.SP.schreibenAusstehend()).toBe(false);
      expect(r.konflikte).toEqual([]);
      expect((await gespeichert()).einstellungen.ruhezeit, "Raum der vorherigen Sitzung unverändert").toBe(11);
      /* Ein weiterer Aufruf meldet nichts mehr (der Hinweis gilt einmal). */
      expect(await r.SP.nochmalSchreiben()).toEqual({ ok: true, nichts: true });
    });
  }

  it("Review #381 (1): Anmeldung wechselt während der Prüfung — die Antwort für die alte Anmeldung zählt nicht", async () => {
    await neuerRaum();
    const r = await seite();
    await bisZurLeiste(r);
    const raum2 = `${RAUM}-zwei`;
    await B.bestandSchreiben(laden(), raum2, bestand(), { durch: "Prüfung" });
    r.anmeldeToken = await neueSitzung();                 // dieselbe Person wie vor dem Sitzungsende
    await r.SP.anmelden("CODE-A", false);
    let auf; r.tor = new Promise((ja) => { auf = ja; });
    const laeuft = r.SP.nochmalSchreiben();               // Prüf-GET mit dem Merkmal von A, Antwort wartet
    while (r.amTor === 0) await warte();
    r.anmeldeToken = await neueSitzung({ raum: raum2 });  // inzwischen B (anderer Datenraum)
    await r.SP.anmelden("CODE-B", false);
    r.tor = null; auf();
    const erg = await laeuft;
    expect(erg.ok).toBe(false);
    expect(PUTS, "kein PUT mit Merkmal von B und Bestand/ETag von A").toEqual([]);
    expect(r.SP.ausstehenderBestand().mandanten[0].einstellungen.ruhezeit, "Auftrag bleibt").toBe(13);
    /* Der nächste Versuch prüft für B: anderer Inhaber → verworfen, nichts gesendet. */
    expect(await r.SP.nochmalSchreiben()).toEqual({ ok: false, fremd: true });
    expect(PUTS).toEqual([]);
    expect((await B.bestandLesen(laden(), raum2)).bestand.mandanten[0].einstellungen.ruhezeit).toBe(11);
    expect((await gespeichert()).einstellungen.ruhezeit).toBe(11);
  });

  for (const [titel, ersatz] of [
    ["Antwort aus dem Speicher des Dienstarbeiters", (inhaber) => new Response(JSON.stringify({ inhaber, etag: "x" }),
      { status: 200, headers: { "content-type": "application/json", "x-centric-offline": "ja" } })],
    ["Serverfehler beim Lesen", () => new Response(JSON.stringify({ fehler: "kaputt" }),
      { status: 500, headers: { "content-type": "application/json" } })],
  ]) {
    it(`Prüfung unklar (${titel}): nichts gesendet, Auftrag bleibt, späterer Versuch gelingt`, async () => {
      await neuerRaum();
      const r = await seite();
      const stand = await bisZurLeiste(r);
      r.anmeldeToken = await neueSitzung();
      await r.SP.anmelden("CODE-NEU", false);
      r.lesenErsatz = () => ersatz(r.inhaber);   // auch mit dem passenden Inhaber nicht vertraut
      expect((await r.SP.nochmalSchreiben()).ok).toBe(false);
      expect(PUTS).toEqual([]);
      expect(r.SP.ausstehend().art).toBe("netz");
      expect(r.SP.ausstehenderBestand().mandanten[0].einstellungen.ruhezeit).toBe(13);
      r.lesenErsatz = null;
      expect(await r.SP.nochmalSchreiben()).toEqual({ ok: true });
      expect(PUTS.map((p) => p.etag)).toEqual([stand]);
    });
  }

  it("Konfliktsperre der vorherigen Sitzung + anderer Inhaber: Sperre und Eingabe verworfen, nichts gesendet", async () => {
    await neuerRaum();
    const r = await seite();
    const g = await r.SP.lies();
    const db = { ...g.bestand, session: { mandantId: "m1", personId: "l1" } };
    const fremd = bestand(); fremd.mandanten[0].name = "Haus fremd";
    await B.bestandSchreiben(laden(), RAUM, fremd, { durch: "Andere" });
    const konflikte = [];
    await r.SP.schreib({ ...db, mandanten: db.mandanten.map((m) => ({ ...m, einstellungen: { ...m.einstellungen, ruhezeit: 13 } })) },
      { ...opt(r), onKonflikt: (d) => konflikte.push(d), sofort: true });
    expect(konflikte.length).toBe(1);
    expect(r.SP.konfliktLage()).not.toBeNull();
    await S.sitzungBeenden(TOKEN);
    await expect(r.SP.lies()).rejects.toThrow("nicht-angemeldet");
    expect(r.neuGeladen, "offene Konfliktfrage hält die Seite").toBe(0);
    PUTS = [];
    r.anmeldeToken = await neueSitzung({ person: "a1", rolle: "mitarbeiter" });
    await r.SP.anmelden("CODE-ANDERS", false);
    expect(await r.SP.nochmalSchreiben()).toEqual({ ok: false, fremd: true });
    expect(PUTS).toEqual([]);
    expect(r.SP.konfliktLage(), "Absage der vorherigen Sitzung nicht mehr abrufbar").toBeNull();
    expect(r.SP.ausstehenderBestand()).toBeNull();
    expect(r.SP.schreibenAusstehend()).toBe(false);
  });

  it("Review #381 (2): Verwerfen auf dem Zeitgeberweg meldet die Lage „fremd“ (Leiste lädt neu)", async () => {
    await neuerRaum();
    const r = await seite();
    const g = await r.SP.lies();
    const db = { ...g.bestand, session: { mandantId: "m1", personId: "l1" } };
    await S.sitzungBeenden(TOKEN);
    await expect(r.SP.lies()).rejects.toThrow("nicht-angemeldet");   // ohne Ausstehendes: Neuladen (hier Attrappe)
    r.SP.schreib({ ...db, mandanten: db.mandanten.map((m) => ({ ...m, name: "Haus neu" })) }, opt(r));   // wartet im Zeitgeber
    r.anmeldeToken = await neueSitzung({ person: "a1", rolle: "mitarbeiter" });
    await r.SP.anmelden("CODE-ANDERS", false);
    await r.SP.schreibenAbschliessen();
    expect(PUTS).toEqual([]);
    expect(r.fehler.map((l) => l.art)).toEqual(["fremd"]);
    expect(await r.SP.nochmalSchreiben()).toEqual({ ok: false, fremd: true });
    const { NichtGespeichert, SPEICHERLAGE } = await import("../src/ansichten/speicherlage.jsx");
    expect(SPEICHERLAGE.fremd.automatischNeuladen).toBe(true);
    const html = renderToStaticMarkup(h(NichtGespeichert, { lage: r.fehler[0], melde: () => {}, aufGeloest: () => {} }));
    expect(html).toContain("Mit einem anderen Zugang angemeldet");
    expect((await gespeichert()).name).toBe("Haus");
  });

  it("Delta-Review #381 (7): verspätete PUT-Antwort nach Wechsel der Anmeldung räumt den Merker nicht und setzt keinen ETag", async () => {
    await neuerRaum();
    const r = await seite();
    await bisZurLeiste(r);
    const b = await neueSitzung();                      // dieselbe Person: Prüfung „gleich“
    r.anmeldeToken = b;
    await r.SP.anmelden("CODE-B", false);
    let auf; r.putTor = new Promise((ja) => { auf = ja; });
    const laeuft = r.SP.nochmalSchreiben();             // PUT unter B, vom Server angenommen, Antwort wartet
    while (r.amPutTor === 0) await warte();
    expect((await gespeichert()).einstellungen.ruhezeit, "unter B gespeichert").toBe(13);
    await S.sitzungBeenden(b);
    await expect(r.SP.lies()).rejects.toThrow("nicht-angemeldet");   // B endet (eine andere Anfrage bekommt 401)
    r.anmeldeToken = await neueSitzung({ person: "a1", rolle: "mitarbeiter" });   // C
    await r.SP.anmelden("CODE-C", false);
    r.putTor = null; auf();
    expect((await laeuft).ok, "für C ist nichts gespeichert").toBe(false);
    /* Nichts aus der Antwort für B übernommen: C wird vor jedem Senden geprüft (anderer Inhaber → verworfen). */
    expect(await r.SP.nochmalSchreiben()).toEqual({ ok: false, fremd: true });
    expect(PUTS.length, "nur der PUT unter B").toBe(1);
    /* Empfehlung (10): bis zum Neuladen keine neuen Aufträge. */
    const fehler = [];
    expect(await r.SP.schreib(bestand(), { durch: "x", onFehler: (l) => fehler.push(l.art), sofort: true })).toEqual({ ok: false, gesperrt: true });
    expect(fehler).toEqual(["fremd"]);
    expect(PUTS.length).toBe(1);
  });

  it("Absicherung: Wiederanmeldung, Senden, lies(), weiteres Sitzungsende — gesendet mit dem frischen ETag (unterscheidend für (9) ist Folgepaket (2))", async () => {
    await neuerRaum();
    const r = await seite();
    await bisZurLeiste(r);
    r.anmeldeToken = await neueSitzung();
    await r.SP.anmelden("CODE-NEU", false);
    expect(await r.SP.nochmalSchreiben()).toEqual({ ok: true });
    const g = await r.SP.lies();
    const frisch = (await B.bestandLesen(laden(), RAUM)).stand;
    /* Zweite Eingabe, zweites Sitzungsende, dritte Anmeldung: gesendet mit dem frischen ETag, gespeichert. */
    const db = { ...g.bestand, session: { mandantId: "m1", personId: "l1" } };
    r.SP.schreib({ ...db, mandanten: db.mandanten.map((m) => ({ ...m, einstellungen: { ...m.einstellungen, ruhezeit: 14 } })) }, opt(r));
    await S.sitzungBeenden(r.anmeldeToken);
    await expect(r.SP.lies()).rejects.toThrow("nicht-angemeldet");
    await r.SP.schreibenAbschliessen();
    PUTS = [];
    r.anmeldeToken = await neueSitzung();
    await r.SP.anmelden("CODE-DREI", false);
    expect(await r.SP.nochmalSchreiben()).toEqual({ ok: true });
    expect(PUTS.map((p) => p.etag)).toEqual([frisch]);
    expect((await gespeichert()).einstellungen.ruhezeit).toBe(14);
  });

  it("Folgepaket #381 (2): Prüfung „gleich“ ohne PUT, dann lies() — ein weiteres Sitzungsende sendet mit dem frischen ETag", async () => {
    await neuerRaum();
    const r = await seite();
    const alt = await bisZurLeiste(r);
    const b = await neueSitzung();
    r.anmeldeToken = b;
    await r.SP.anmelden("CODE-B", false);
    r.putNetzWeg = true;                                 // Prüfung „gleich“, der PUT erreicht den Server nicht
    expect((await r.SP.nochmalSchreiben()).ok).toBe(false);
    expect(r.SP.ausstehend().art).toBe("netz");
    expect(PUTS).toEqual([]);
    const fremd = bestand(); fremd.mandanten[0].name = "Haus fremd";
    await B.bestandSchreiben(laden(), RAUM, fremd, { durch: "Andere" });
    const frisch = (await B.bestandLesen(laden(), RAUM)).stand;
    expect(frisch).not.toBe(alt);
    /* Die Oberfläche liest neu (unter B) und speichert ihre Eingabe auf diesem Stand — der PUT scheitert wieder am Netz. */
    const g = await r.SP.lies();
    const db = { ...g.bestand, session: { mandantId: "m1", personId: "l1" } };
    await r.SP.schreib({ ...db, mandanten: db.mandanten.map((m) => ({ ...m, einstellungen: { ...m.einstellungen, ruhezeit: 14 } })) },
      { ...opt(r), sofort: true });
    expect(r.SP.ausstehend().art).toBe("netz");
    /* B endet, dieselbe Person meldet sich wieder an: gesendet mit dem ETag des frischen Lesens, nicht mit dem alten. */
    await S.sitzungBeenden(b);
    await expect(r.SP.lies()).rejects.toThrow("nicht-angemeldet");
    r.putNetzWeg = false;
    r.anmeldeToken = await neueSitzung();
    await r.SP.anmelden("CODE-C", false);
    expect(await r.SP.nochmalSchreiben()).toEqual({ ok: true });
    expect(PUTS.map((x) => x.etag)).toEqual([frisch]);
    const m = await gespeichert();
    expect([m.name, m.einstellungen.ruhezeit]).toEqual(["Haus fremd", 14]);
  });

  it("Review #382 A2: direkte Anmeldung ohne bekannten Inhaber bei offener Konfliktfrage — weder ETag noch Absage wirken in Raum B", async () => {
    await neuerRaum();
    const r = await seite();
    r.lesenAnpassen = (d) => { const { inhaber: _weg, ...rest } = d; return rest; };   // Sitzung ohne Inhaber
    const g = await r.SP.lies();
    expect(g.zugang.inhaber).toBeNull();
    const db = { ...g.bestand, session: { mandantId: "m1", personId: "l1" } };
    const fremd = bestand(); fremd.mandanten[0].name = "Haus fremd";
    await B.bestandSchreiben(laden(), RAUM, fremd, { durch: "Andere" });
    await r.SP.schreib({ ...db, mandanten: db.mandanten.map((m) => ({ ...m, einstellungen: { ...m.einstellungen, ruhezeit: 13 } })) },
      { ...opt(r), sofort: true });
    expect(r.SP.konfliktLage(), "Konfliktfrage offen").not.toBeNull();
    const etagA = (await B.bestandLesen(laden(), RAUM)).stand;
    /* Raum B mit demselben Zählerstand wie Raum A (ETags sind Zähler). */
    const raum2 = `${RAUM}-zwei`;
    for (let i = 0; i < 20 && (await B.bestandLesen(laden(), raum2))?.stand !== etagA; i++) {
      const zwei = bestand(); zwei.mandanten[0].name = `Haus zwei ${i}`;
      await B.bestandSchreiben(laden(), raum2, zwei, { durch: "Prüfung" });
    }
    const vorB = await B.bestandLesen(laden(), raum2);
    expect(vorB.stand, "gleicher Stand in beiden Räumen").toBe(etagA);
    r.anmeldeToken = await neueSitzung({ raum: raum2 });
    await r.SP.anmelden("CODE-B", false);              // direkt, ohne Sitzungsende
    expect(r.SP.konfliktLage(), "keine Absage aus Raum A mehr abrufbar").toBeNull();
    PUTS = [];
    /* „Meinen Stand übernehmen“: die Oberfläche schickt ihren Stand (aus Raum A) erneut. */
    expect(r.SP.konfliktLoesen("meins")).toBe(true);
    await r.SP.schreib({ ...db, mandanten: db.mandanten.map((m) => ({ ...m, einstellungen: { ...m.einstellungen, ruhezeit: 13 } })) },
      { ...opt(r), sofort: true });
    expect(PUTS.map((x) => x.etag), "ohne Versionsangabe aus Raum A").toEqual([null]);
    const nachB = await B.bestandLesen(laden(), raum2);
    expect([nachB.stand, nachB.bestand.mandanten[0].einstellungen.ruhezeit], "Raum B nicht überschrieben").toEqual([vorB.stand, 11]);
  });

  it("Folgepaket #381 (1): verspätete Leseantwort nach Wechsel der Anmeldung — nichts übernommen (ETag, Zugang)", async () => {
    await neuerRaum();
    const r = await seite();
    await r.SP.lies();
    const raum2 = `${RAUM}-zwei`;
    const zwei = bestand(); zwei.mandanten[0].name = "Haus zwei";
    await B.bestandSchreiben(laden(), raum2, zwei, { durch: "Prüfung" });
    let auf; r.tor = new Promise((ja) => { auf = ja; });
    const spaet = r.SP.lies();                           // unter A, Antwort wartet
    while (r.amTor === 0) await warte();
    r.anmeldeToken = await neueSitzung({ raum: raum2 });
    await r.SP.anmelden("CODE-B", false);
    r.tor = null; auf();
    await expect(spaet).rejects.toThrow("nicht-angemeldet");
    expect(r.SP.angemeldet(), "die neue Anmeldung bleibt").toBe(true);
    expect(r.SP.zugangsdaten().inhaber, "kein Inhaber aus der Antwort für A").toBeUndefined();
    expect(r.neuGeladen).toBe(0);
    /* Eine Eingabe unter B geht mit dem ETag von B hinaus (nicht mit dem von A). */
    const g = await r.SP.lies();
    expect(g.bestand.mandanten[0].name).toBe("Haus zwei");
    const db = { ...g.bestand, session: { mandantId: "m1", personId: "l1" } };
    const e2 = (await B.bestandLesen(laden(), raum2)).stand;
    await r.SP.schreib({ ...db, mandanten: db.mandanten.map((m) => ({ ...m, einstellungen: { ...m.einstellungen, ruhezeit: 12 } })) },
      { ...opt(r), sofort: true });
    expect(PUTS.map((x) => x.etag)).toEqual([e2]);
    expect((await B.bestandLesen(laden(), raum2)).bestand.mandanten[0].einstellungen.ruhezeit).toBe(12);
    expect((await gespeichert()).einstellungen.ruhezeit, "Raum von A unverändert").toBe(11);
  });

  it("absichtliches Abmelden löscht den Merker: danach kein alter ETag mehr", async () => {
    await neuerRaum();
    const r = await seite();
    await bisZurLeiste(r);
    r.SP.abmelden();
    r.anmeldeToken = await neueSitzung();
    await r.SP.anmelden("CODE-NEU", false);
    await r.SP.nochmalSchreiben();
    expect(PUTS.map((p) => p.etag), "ohne Merker keine Versionsangabe der vorherigen Sitzung").toEqual([null]);
    expect((await gespeichert()).einstellungen.ruhezeit).toBe(11);
  });

  it("die neue Sitzung endet vor der Prüfung: der Merker bleibt, die nächste Anmeldung sendet mit dem alten ETag", async () => {
    await neuerRaum();
    const r = await seite();
    const stand = await bisZurLeiste(r);
    const zwischen = await neueSitzung();
    r.anmeldeToken = zwischen;
    await r.SP.anmelden("CODE-1", false);
    await S.sitzungBeenden(zwischen);
    const erste = await r.SP.nochmalSchreiben();
    expect(erste.ok).toBe(false);
    expect(r.SP.ausstehend().art).toBe("abgemeldet");
    r.anmeldeToken = await neueSitzung();
    await r.SP.anmelden("CODE-2", false);
    expect(await r.SP.nochmalSchreiben()).toEqual({ ok: true });
    expect(PUTS.map((p) => p.etag)).toEqual([stand]);
  });
});

describe("K kein Kreislauf", { timeout: 120000 }, () => {
  it("eine weitere 401 ohne Merkmal meldet nichts; abgemeldete Hörer hören nichts", async () => {
    await neuerRaum();
    await S.sitzungBeenden(TOKEN);
    const r = await seite();
    let zweiter = 0;
    const ab = r.SP.beiSitzungsende(() => { zweiter += 1; });
    ab();
    await expect(r.SP.lies()).rejects.toThrow("nicht-angemeldet");
    await expect(r.SP.lies()).rejects.toThrow("nicht-angemeldet");
    expect([r.neuGeladen, zweiter]).toEqual([1, 0]);
  });
});

describe("A1 verspätete 401 einer alten Anfrage (Review #378)", { timeout: 120000 }, () => {
  it("räumt das inzwischen neue Merkmal nicht und meldet kein Sitzungsende", async () => {
    await neuerRaum();
    const alt = TOKEN;
    const r = await seite();
    r.anmeldeToken = (await S.sitzungAnlegen({ bestand: RAUM, name: "V Nl1", rolle: "leitung", person: "l1", betrieb: 0,
      mandantId: "m1", einheit: null }, 2 * 3600 * 1000)).token;
    await S.sitzungBeenden(alt);
    let auf; r.tor = new Promise((ja) => { auf = ja; });
    const spaet = r.SP.lies();                         // geht mit dem alten Merkmal hinaus, Antwort verzögert
    await r.SP.anmelden("CODE-NEU", false);           // inzwischen neu angemeldet
    expect(r.sitzung.getItem("centric:token")).toBe(r.anmeldeToken);
    r.tor = null; auf();
    await expect(spaet).rejects.toThrow("nicht-angemeldet");
    expect(r.SP.angemeldet(), "neues Merkmal bleibt").toBe(true);
    expect(r.sitzung.getItem("centric:token")).toBe(r.anmeldeToken);
    expect(r.neuGeladen, "kein Sitzungsende gemeldet").toBe(0);
    const g = await r.SP.lies();
    expect(g.bestand.mandanten[0].name, "mit dem neuen Merkmal lesbar").toBe("Haus");
  });
});

describe("F Entscheidungstafel", () => {
  it("nur ohne Ausstehendes zur Anmeldung", async () => {
    const { sitzungsendeFolge, sitzungsendeBehandeln } = await import("../src/app/sitzungsende.js");
    expect(sitzungsendeFolge({ schreibenAusstehend: false, ausstehend: false })).toBe("anmeldung");
    expect(sitzungsendeFolge({ schreibenAusstehend: true, ausstehend: false })).toBe("halten");
    expect(sitzungsendeFolge({ schreibenAusstehend: false, ausstehend: true })).toBe("halten");
    let n = 0;
    const sp = (s, a) => ({ schreibenAusstehend: () => s, ausstehend: () => (a ? { art: "netz" } : null) });
    expect(sitzungsendeBehandeln({ sp: sp(false, true), neuLaden: () => { n += 1; }, ablage: null })).toBe("halten");
    expect(n, "gescheiterter Auftrag (z. B. Netz) hält die Seite").toBe(0);
  });
});

describe("Q Quelltext-Verträge", () => {
  const lies = async (p) => (await readFile(new URL(p, import.meta.url), "utf8")).replace(/\r\n/g, "\n");
  it("speicher.js meldet das Ende bei 401; main.jsx beobachtet und zeigt die Anmeldung mit Hinweis", async () => {
    const sp = await lies("../src/speicher.js");
    expect(sp).toMatch(/const gesendet = token;\n  const a = await fetch/);
    expect(sp).toMatch(/if \(a\.status === 401\) \{ sitzungEndet\(gesendet\); throw new Error\("nicht-angemeldet"\); \}/);
    expect(sp).toMatch(/if \(gesendet !== token\) return;\n[\s\S]{0,400}?abmelden\(true\);\n  vorSitzungsende = merker;\n  if \(!gesendet\) return;/);
    /* B-L4c: abmelden räumt den Merker; nur sitzungEndet setzt ihn danach; das Räumen von abmelden bleibt. */
    expect(sp).toMatch(/token = null; etag = null; name = null; zugang = null;\n[^\n]*\n  vorSitzungsende = null; vorgaengerVerworfen = false;/);
    const main = await lies("../src/main.jsx");
    expect(main).toMatch(/\nsitzungsendeBeobachten\(\);\n/);
    expect(main).toMatch(/const SITZUNGSENDE_BEIM_START = sitzungsendeHinweisAbholen\(\);/);
    expect(main).toMatch(/useState\(!!SITZUNGSENDE_BEIM_START\)/);
    expect(main).toMatch(/<p id="sitzungsende-hinweis" role="status"[^>]*>\n\s*\{SITZUNGSENDE_BEIM_START\}/);
    /* Review #378 A3: das Codefeld verweist auf den Hinweis. */
    expect(main).toMatch(/aria-describedby=\{SITZUNGSENDE_BEIM_START \? "sitzungsende-hinweis" : undefined\}/);
    /* App.jsx: Ladefehler „nicht-angemeldet" bleibt still — die Anmeldung kommt über das Neuladen, nicht über die Fehlerseite. */
    const app = await lies("../src/App.jsx");
    expect(app).toContain('if (lebt && String(e.message) !== "nicht-angemeldet") setLadefehler(String(e.message));');
  });
});
