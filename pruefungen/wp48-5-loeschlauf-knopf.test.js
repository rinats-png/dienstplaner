/* ==========================================================================
   WP-48.5 Teil 2 (3): Löschlauf-Knopf der Ansicht Datenschutz

   Mit aktivem Teilweg (Fähigkeit `teile`, Schalter CENTRIC_TEILSPEICHERUNG
   an) löst die Leitung den Löschlauf über POST /api/loeschlauf aus
   (WP-48.4): Vorschau → Bestätigung mit der Kennung → Nachladen. Ohne
   Teilweg (Vorgabe) und für alle anderen Rollen bleibt der heutige Weg
   (Löschen im lokalen Stand, Speichern). Die Kundenrolle behält ihn auch
   mit Teilweg — dann als Voll-PUT, weil Stempel nie im Delta stehen.

   Geprüft mit dem echten Client (src/speicher.js) und der echten Aktion
   (src/app/aktionen/ausgaben.js) gegen den echten Handler (fetch auf
   daten() umgeleitet), je Oberfläche eine eigene Modulinstanz.
   // zeit-ok: Tagesangaben nur relativ zu heute (Kalenderrechnung des Servers), keine Zeitmessung
   Aufruf: npx vitest run pruefungen/wp48-5-loeschlauf-knopf.test.js
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const WIRT = "127.0.0.1:3000";
let wurzel, laden, daten, B, G, sitzungAnlegen, tag;
let nr = 0;
const ROLLEN = {
  LT: { rolle: "leitung", person: "l1" },
  PL: { rolle: "planer", person: "p1" },
  /* Altrolle ohne Person (mit Person gälte die wirksame Rolle der Person, rechte.mjs wirksameRolle). */
  KU: { rolle: "kunde", person: null },
};
const person = (id, rolle, einheit) => ({ id, vorname: "V", nachname: `N${id}`, rolle, bereich: einheit, status: "aktiv",
  geburtstag: "1980-01-01", qualifikationen: [], zugehoerigkeit: [{ ab: "2020-01-01", einheitId: einheit }], telefon: "0", email: `${id}@example.org` });
function bestandC({ alt = true } = {}) {
  const plan = {};
  for (const pid of ["m0", "a1"]) for (const n of [20, 23]) plan[`${pid}|${tag(n)}`] = "F";
  /* Jenseits der Plandatenfrist (Vorgabe 24 Monate): fällig für den Löschlauf. */
  if (alt) for (const n of [-1000, -900]) plan[`a1|${tag(n)}`] = "F";
  const stempel = { [`a1|${tag(-1)}`]: { start: "06:01", ende: "14:00", quelle: "app" },
    ...(alt ? { [`a1|${tag(-1000)}`]: { start: "06:02", ende: "14:00", quelle: "app" } } : {}) };
  return { version: 9, stand: 1, mandanten: [{ id: "m1", name: "Haus", branche: "pflege", bundesland: "BE", status: "aktiv",
    einheiten: [{ id: "e1", name: "WB 1", versatzTage: 0 }],
    dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00", pause: 30, mindest: { mo_do: 0, fr: 0, sa: 0, so: 0 } }],
    zyklus: ["-"], anker: "2026-01-05", zyklusLaenge: 1, gruppen: [], versatzTageVon: {},
    einstellungen: { ruhezeit: 11, maxFolge: 6 },
    personen: [person("m0", "mitarbeiter", "e1"), person("a1", "mitarbeiter", "e1"), person("p1", "planer", "ALLE"), person("l1", "leitung", "ALLE")],
    abweichungen: plan, erfassung: {}, einstempeln: stempel, wuensche: [], anfragen: [], nachrichten: [], abwesenheiten: [],
    /* aufbewahrung und aenderungen im Bestand (raeumen setzt beide): Der Löschlauf ändert dann nur Felder mit Version, Zellen und Stempel — ohne Vorgabe
       „voll“ ginge er als Delta (Stempel blieben). So trennt die Kundenprüfung (Review #350 M1). */
    aufbewahrung: {}, aenderungen: [], freigaben: {}, bestaetigungen: [], protokoll: [] }] };
}
let raumNr = 0;
async function raumMit(rollen, opt) {
  const raum = `wp48-5l-${++raumNr}`;
  await B.bestandSchreiben(laden(), raum, G.personenAngleichen(G.uebergabenAngleichen(bestandC(opt))), { durch: "Pruefung" });
  const token = {};
  for (const k of rollen) {
    const r = ROLLEN[k];
    token[k] = (await sitzungAnlegen({ bestand: raum, name: `V N${r.person || "kunde"}`, rolle: r.rolle, person: r.person, betrieb: 0,
      mandantId: "m1", einheit: null }, 2 * 3600 * 1000)).token;
  }
  return { raum, token };
}
const gespeichertM = async (raum) => (await B.bestandLesenStreng(laden(), raum)).bestand.mandanten[0];

const speicherAttrappe = (vorab = {}) => { const m = new Map(Object.entries(vorab)); return { getItem: (k) => (m.has(k) ? m.get(k) : null),
  setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear() }; };
const aufrufe = [];
let antwortErsetzen = null;   // (pfad, methode) => { status, daten } | null — Antwort an Stelle des Servers
let nachAntwort = null;      // (pfad, methode, rumpf) => Promise | null — läuft nach einer Antwort (Verzahnung)
let netzNach = null;         // (pfad, methode, rumpf) => boolean — der Server hat geantwortet, die Antwort geht verloren
function fetchStub() {
  vi.stubGlobal("fetch", async (url, opt = {}) => {
    nr += 1;
    const methode = opt.method || "GET";
    const kopf = { ...(opt.headers || {}), host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.51.${Math.floor(nr / 250) % 250}.${nr % 250}` };
    const rumpf = opt.body ? JSON.parse(opt.body) : null;
    aufrufe.push({ url, methode, rumpf });
    const ersatz = antwortErsetzen ? antwortErsetzen(url, methode, rumpf) : null;
    if (ersatz && ersatz.warten) await ersatz.warten;   // hängende Anfrage (antwortet erst später)
    const a = ersatz ? new Response(JSON.stringify(ersatz.daten), { status: ersatz.status, headers: { "content-type": "application/json" } })
      : await daten(new Request(`http://${WIRT}${url}`, { method: methode, headers: kopf, ...(opt.body ? { body: opt.body } : {}) }), {});
    if (netzNach && netzNach(url, methode, rumpf)) throw new TypeError("Failed to fetch");
    if (nachAntwort) { const f = nachAntwort(url, methode, rumpf); if (f) { nachAntwort = null; await f(); } }
    return a;
  });
}
/** Eine Oberfläche mit der echten Aktion: eigene Modulinstanz, Bestand wie App.jsx, Kontext k wie aktKontext. */
async function oberflaeche(token, pid) {
  vi.resetModules();
  vi.stubGlobal("window", undefined);   // speicher.js meldet beforeunload nur an einem echten window an
  vi.stubGlobal("sessionStorage", speicherAttrappe({ "centric:token": token }));
  vi.stubGlobal("localStorage", speicherAttrappe());
  const SP = await import("../src/speicher.js");
  const { aktionenAusgaben } = await import("../src/app/aktionen/ausgaben.js");
  const g = await SP.lies();
  SP.teilwegUebernehmen(g.teilAntwort);
  const o = { SP, g, meldungen: [], mUpd: [], nachgeladen: 0,
    ref: { current: { ...g.bestand, session: { mandantId: "m1", personId: pid } } } };
  o.akt = aktionenAusgaben({ melde: (t) => o.meldungen.push(t), ref: o.ref, setAusgabe: () => {}, ym: tag(0).slice(0, 7),
    mUpd: (fn, text) => { o.mUpd.push(text); const s = o.ref.current; o.ref.current = { ...s, mandanten: s.mandanten.map((m) => (m.id === "m1" ? fn(m) : m)) }; },
    /* Wie App.jsx serverstandNachladen: nur ohne Ausstehendes den gelesenen Stand übernehmen (neue Basis des Teilwegs). */
    serverstandNachladen: async () => {
      o.nachgeladen += 1;
      if (o.SP.schreibenAusstehend()) return;
      const n = await o.SP.lies();
      o.SP.teilwegUebernehmen(n.teilAntwort);
      o.ref.current = { ...n.bestand, session: o.ref.current.session };
    } });
  /* Rückfragen bestätigen (nach dem Import: speicher.js meldet sich nur an einem echten window an). */
  vi.stubGlobal("window", { confirm: () => true });
  return o;
}
const wege = () => aufrufe.map((a) => `${a.methode} ${a.url}`);
/** Bestand mit geänderter Zelle a1|tag. */
const setzeAuf = (b, t, w) => ({ ...b, mandanten: [{ ...b.mandanten[0], abweichungen: { ...b.mandanten[0].abweichungen, [`a1|${t}`]: w } }] });
/** Gelöschtes jenseits der Frist ist gelöscht (Zellen und Stempel). */
const geloescht = async (raum) => { const m = await gespeichertM(raum);
  return [m.abweichungen[`a1|${tag(-1000)}`], m.abweichungen[`a1|${tag(-900)}`], m.einstempeln[`a1|${tag(-1000)}`]]; };

describe("WP-48.5 (3) Löschlauf-Knopf", () => {
  beforeAll(async () => {
    wurzel = await mkdtemp(path.join(tmpdir(), "centric-wp48-5l-"));
    process.env.CENTRIC_DATEN = wurzel;
    process.env.CENTRIC_ABLAGE = "dateien";
    process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
    const schutz = await import("../server/lib/schutz.mjs");
    for (const art of Object.keys(schutz.GRENZEN)) schutz.GRENZEN[art] = { ...schutz.GRENZEN[art], versuche: 100000 };
    const { getStore } = await import("../server/lib/ablage.mjs");
    laden = () => getStore({ name: "centric", consistency: "strong" });
    daten = (await import("../server/funktionen/daten.mjs")).default;
    B = await import("../server/lib/bestand.mjs");
    G = await import("../server/lib/gestalt.mjs");
    ({ sitzungAnlegen } = await import("../server/lib/sitzungen.mjs"));
    const Z = await import("../server/lib/zeiterfassung.mjs");
    const HEUTE = Z.heuteBerlin();
    tag = (n) => Z.tagePlus(HEUTE, n);
  });
  afterEach(() => { vi.unstubAllGlobals(); aufrufe.length = 0; antwortErsetzen = null; nachAntwort = null; netzNach = null; });
  afterAll(async () => {
    delete process.env.CENTRIC_TEILSPEICHERUNG;
    if (wurzel) await rm(wurzel, { recursive: true, force: true });
  });

  it("Leitung mit Teilweg: Vorschau → Bestätigung mit Kennung → Server löscht, Oberfläche lädt nach; kein Speichern", async () => {
    process.env.CENTRIC_TEILSPEICHERUNG = "true";
    fetchStub();
    const { raum, token } = await raumMit(["LT"]);
    const o = await oberflaeche(token.LT, "l1");
    expect(o.SP.teilwegAktiv()).toBe(true);
    aufrufe.length = 0;
    const r = await o.akt.loeschlauf();
    expect(r).toEqual({ ergebnis: "ausgefuehrt" });
    expect(wege()).toEqual(["POST /api/loeschlauf", "POST /api/loeschlauf", "GET /api/bestand"]);   // danach nachgeladen
    expect(aufrufe[0].rumpf).toEqual({ vorschau: true });
    expect(Object.keys(aufrufe[1].rumpf)).toEqual(["bestaetigt"]);
    expect(aufrufe[1].rumpf.bestaetigt).toMatch(/^[0-9a-f]{32}$/);
    expect(o.mUpd).toEqual([]);                     // die Oberfläche löscht nichts selbst
    expect(o.nachgeladen).toBe(1);
    const m = await gespeichertM(raum);
    expect(m.abweichungen[`a1|${tag(-1000)}`]).toBeUndefined();
    expect(m.abweichungen[`a1|${tag(-900)}`]).toBeUndefined();
    expect(m.abweichungen[`a1|${tag(20)}`]).toBe("F");
  });

  it("Leitung mit Teilweg, nichts fällig: nur die Vorschau, keine Bestätigung", async () => {
    process.env.CENTRIC_TEILSPEICHERUNG = "true";
    fetchStub();
    const { token } = await raumMit(["LT"], { alt: false });
    const o = await oberflaeche(token.LT, "l1");
    aufrufe.length = 0;
    expect(await o.akt.loeschlauf()).toEqual({ ergebnis: "nichts" });
    expect(wege()).toEqual(["POST /api/loeschlauf"]);
    expect(o.meldungen).toEqual(["Nichts fällig — alle Fristen eingehalten."]);
  });

  it("Leitung mit Teilweg, Rückfrage abgelehnt: nichts bestätigt, nichts gelöscht", async () => {
    process.env.CENTRIC_TEILSPEICHERUNG = "true";
    fetchStub();
    const { raum, token } = await raumMit(["LT"]);
    const o = await oberflaeche(token.LT, "l1");
    vi.stubGlobal("window", { confirm: () => false });
    aufrufe.length = 0;
    expect(await o.akt.loeschlauf()).toEqual({ ergebnis: "abgebrochen" });
    expect(wege()).toEqual(["POST /api/loeschlauf"]);
    expect((await gespeichertM(raum)).abweichungen[`a1|${tag(-1000)}`]).toBe("F");
  });

  it("Schalter aus: heutiger Weg (Löschen im lokalen Stand), kein Aufruf von /api/loeschlauf", async () => {
    delete process.env.CENTRIC_TEILSPEICHERUNG;
    fetchStub();
    const { token } = await raumMit(["LT"]);
    const o = await oberflaeche(token.LT, "l1");
    expect(o.SP.teilwegAktiv()).toBe(false);
    aufrufe.length = 0;
    o.akt.loeschlauf();
    expect(o.mUpd).toHaveLength(1);
    expect(o.mUpd[0]).toMatch(/^Löschlauf: /);
    expect(o.ref.current.mandanten[0].abweichungen[`a1|${tag(-1000)}`]).toBeUndefined();
    expect(wege()).toEqual([]);
    /* Das Speichern danach ist der heutige Voll-PUT. */
    await o.SP.schreib(o.ref.current, { sofort: true, durch: "Pruefung" });
    expect(wege()).toEqual(["PUT /api/bestand"]);
  });

  it("Kundenrolle mit Teilweg: heutiger Weg, das Speichern geht als Voll-PUT (Stempel stehen nie im Delta)", async () => {
    process.env.CENTRIC_TEILSPEICHERUNG = "true";
    fetchStub();
    const { raum, token } = await raumMit(["KU"]);
    const o = await oberflaeche(token.KU, "l1");
    o.fehler = [];
    expect(o.SP.teilwegAktiv()).toBe(true);
    aufrufe.length = 0;
    o.akt.loeschlauf();
    expect(o.mUpd).toHaveLength(1);
    expect(wege()).toEqual([]);
    await o.SP.schreib(o.ref.current, { sofort: true, durch: "Pruefung", onFehler: (l) => o.fehler.push(l) });
    /* Vor dem Voll-PUT frisch lesen (Review #348 H1), dann der Voll-PUT. */
    expect(wege()).toEqual(["GET /api/bestand", "PUT /api/bestand"]);
    const m = await gespeichertM(raum);
    expect(m.abweichungen[`a1|${tag(-1000)}`]).toBeUndefined();
    expect(m.einstempeln[`a1|${tag(-1000)}`]).toBeUndefined();   // Stempel jenseits der Frist gelöscht (nur über den Voll-PUT)
    expect(m.einstempeln[`a1|${tag(-1)}`]).toBeTruthy();
    /* Review #350: Auch der Kundenweg verlangt danach Neuladen — es geht nichts mehr hinaus. */
    expect(o.SP.neuLadenNoetig()).toBe(true);
    expect(o.fehler.map((l) => l.art)).toEqual(["neuLadenPflicht"]);
    aufrufe.length = 0;
    expect(await o.SP.schreib(setzeAuf(o.ref.current, tag(23), "-"), { sofort: true, durch: "Pruefung" })).toEqual({ ok: false, gesperrt: true });
    expect(wege()).toEqual([]);
  });

  it("M12: Die Vorgabe „voll“ gilt nur für den nächsten Auftrag", async () => {
    process.env.CENTRIC_TEILSPEICHERUNG = "true";
    fetchStub();
    const { token } = await raumMit(["LT"]);
    const o = await oberflaeche(token.LT, "l1");
    o.SP.naechstesSpeichernVoll();
    await o.SP.schreib(setzeAuf(o.ref.current, tag(20), "-"), { sofort: true });
    expect(aufrufe.filter((x) => x.methode === "PUT")).toHaveLength(1);
    const n = await o.SP.lies();
    o.SP.teilwegUebernehmen(n.teilAntwort);
    aufrufe.length = 0;
    await o.SP.schreib(setzeAuf({ ...n.bestand, session: o.ref.current.session }, tag(23), "-"), { sofort: true });
    expect(wege()).toEqual(["POST /api/bestand/teile"]);
  });

  it("Kundenrolle: Vorgabe „voll“ hängt am Auftrag — ein älterer Voll-Auftrag, der während des Löschlaufs scheitert, verbraucht sie nicht", async () => {
    process.env.CENTRIC_TEILSPEICHERUNG = "true";
    fetchStub();
    const { raum, token } = await raumMit(["KU"]);
    const o = await oberflaeche(token.KU, "l1");
    const fehler = [];
    const opt = { durch: "Pruefung", onFehler: (l) => fehler.push(l) };
    /* Älterer Auftrag: eine Zelle; der Teilweg antwortet 413 → Rückfall voll, der Auftrag wartet auf sein frisches GET.
       In diesem Moment löst die Person den Löschlauf aus; dessen Auftrag reiht sich ein und geht im älteren auf. Dessen
       Voll-PUT scheitert (500). „Noch einmal senden“ muss dann voll gehen — sonst ginge der Löschlauf als Delta, und die
       Stempel blieben stehen. */
    const s0 = o.ref.current;
    o.ref.current = { ...s0, mandanten: [{ ...s0.mandanten[0], abweichungen: { ...s0.mandanten[0].abweichungen, [`a1|${tag(20)}`]: "-" } }] };
    let postNr = 0, putNr = 0;
    antwortErsetzen = (u, m) => (u === "/api/bestand/teile" && ++postNr === 1 ? { status: 413, daten: { code: "TEILE_ZU_GROSS", text: "zu groß" } }
      : m === "PUT" && ++putNr === 1 ? { status: 429, daten: { fehler: "Gerade wird sehr viel gespeichert." } } : null);
    nachAntwort = (u, m) => (m === "GET" && u === "/api/bestand" ? async () => {
      o.akt.loeschlauf();
      o.SP.schreib(o.ref.current, opt);
    } : null);
    await o.SP.schreib(o.ref.current, { ...opt, sofort: true });
    await o.SP.schreibenAbschliessen();
    expect(o.mUpd).toHaveLength(1);
    expect(fehler.map((l) => l.art)).toEqual(["unbekannt"]);
    aufrufe.length = 0;
    expect((await o.SP.nochmalSchreiben()).ok).toBe(true);
    expect(wege()).toEqual(["GET /api/bestand", "PUT /api/bestand"]);   // der Löschlauf geht als Voll-PUT, nicht als Delta
    const m = await gespeichertM(raum);
    expect(m.abweichungen[`a1|${tag(-1000)}`]).toBeUndefined();
    expect(m.einstempeln[`a1|${tag(-1000)}`]).toBeUndefined();
    expect(m.einstempeln[`a1|${tag(-1)}`]).toBeTruthy();
  });

  it("Leitung: gescheiterter Auftrag vor dem Löschlauf → kein Lauf, bis er gespeichert ist; danach bleibt Gelöschtes gelöscht", async () => {
    process.env.CENTRIC_TEILSPEICHERUNG = "true";
    fetchStub();
    const { raum, token } = await raumMit(["LT"]);
    const o = await oberflaeche(token.LT, "l1");
    const s0 = o.ref.current;
    o.ref.current = { ...s0, mandanten: [{ ...s0.mandanten[0], abweichungen: { ...s0.mandanten[0].abweichungen, [`a1|${tag(20)}`]: "-" } }] };
    antwortErsetzen = (u) => (u === "/api/bestand/teile" ? { status: 500, daten: { fehler: "Serverfehler" } } : null);
    await o.SP.schreib(o.ref.current, { sofort: true });
    expect(o.SP.ausstehend()).toBeTruthy();
    expect(o.SP.schreibenAusstehend()).toBe(false);       // die Leiste „nicht gespeichert“, sonst nichts in Arbeit
    aufrufe.length = 0;
    expect(await o.akt.loeschlauf()).toEqual({ ergebnis: "ausstehend" });
    expect(wege().filter((w) => w.endsWith("/api/loeschlauf"))).toEqual([]);
    /* Nochmal senden gelingt jetzt, danach der Löschlauf. */
    antwortErsetzen = null;
    expect((await o.SP.nochmalSchreiben()).ok).toBe(true);
    expect(await o.akt.loeschlauf()).toEqual({ ergebnis: "ausgefuehrt" });
    const m = await gespeichertM(raum);
    expect([m.abweichungen[`a1|${tag(-1000)}`], m.abweichungen[`a1|${tag(20)}`]]).toEqual([undefined, "-"]);
  });

  it("Leitung: scheitert ein Auftrag WÄHREND des Löschlaufs, sendet „Noch einmal“ ihn nie (Gelöschtes käme zurück, Art. 17)", async () => {
    process.env.CENTRIC_TEILSPEICHERUNG = "true";
    fetchStub();
    const { raum, token } = await raumMit(["LT"]);
    const o = await oberflaeche(token.LT, "l1");
    const lagen = [];
    /* Nach der Vorschau: eine Eingabe, deren Speichern scheitert (500) — ihr Bestand enthält die alten Einträge. */
    nachAntwort = (u, m, rumpf) => (u === "/api/loeschlauf" && rumpf && rumpf.vorschau ? async () => {
      antwortErsetzen = (u2) => (u2 === "/api/bestand/teile" ? { status: 500, daten: { fehler: "Serverfehler" } } : null);
      const s = o.ref.current;
      o.ref.current = { ...s, mandanten: [{ ...s.mandanten[0], abweichungen: { ...s.mandanten[0].abweichungen, [`a1|${tag(20)}`]: "-" } }] };
      await o.SP.schreib(o.ref.current, { sofort: true, onFehler: (l) => lagen.push(l.art) });
      antwortErsetzen = null;
    } : null);
    expect(await o.akt.loeschlauf()).toEqual({ ergebnis: "ausgefuehrt" });
    expect(lagen).toEqual(["server", "neuLadenPflicht"]);   // die Leiste bietet dann nur Datei sichern und neu laden
    aufrufe.length = 0;
    expect(await o.SP.nochmalSchreiben()).toEqual({ ok: false, gesperrt: true });
    expect(wege()).toEqual([]);
    const m = await gespeichertM(raum);
    expect(m.abweichungen[`a1|${tag(-1000)}`]).toBeUndefined();
    expect(m.abweichungen[`a1|${tag(-900)}`]).toBeUndefined();
    expect(m.einstempeln[`a1|${tag(-1000)}`]).toBeUndefined();
    expect(o.SP.ausstehenderBestand()).toBeTruthy();       // zum Sichern als Datei weiter vorhanden
  });

  it("Leitung: Doppelklick startet keinen zweiten Lauf", async () => {
    process.env.CENTRIC_TEILSPEICHERUNG = "true";
    fetchStub();
    const { token } = await raumMit(["LT"]);
    const o = await oberflaeche(token.LT, "l1");
    aufrufe.length = 0;
    const [a, b] = await Promise.all([o.akt.loeschlauf(), o.akt.loeschlauf()]);
    expect([a.ergebnis, b.ergebnis]).toEqual(["ausgefuehrt", "laeuft"]);
    expect(wege().filter((w) => w.endsWith("/api/loeschlauf"))).toHaveLength(2);   // eine Vorschau, eine Bestätigung
    expect(o.meldungen[0]).toBe("Der Löschlauf läuft bereits.");
  });

  it("Planung mit Teilweg: heutiger Weg (kein /api/loeschlauf, das der Server nur der Leitung erlaubt)", async () => {
    process.env.CENTRIC_TEILSPEICHERUNG = "true";
    fetchStub();
    const { token } = await raumMit(["PL"]);
    const o = await oberflaeche(token.PL, "p1");
    aufrufe.length = 0;
    o.akt.loeschlauf();
    expect(o.mUpd).toHaveLength(1);
    expect(wege()).toEqual([]);
  });

  it("Ausstehendes wird erst gespeichert; mit offener Frage startet der Löschlauf nicht", async () => {
    process.env.CENTRIC_TEILSPEICHERUNG = "true";
    fetchStub();
    const { token } = await raumMit(["LT", "PL"]);
    const o = await oberflaeche(token.LT, "l1");
    const pl = await oberflaeche(token.PL, "p1");
    const k = `a1|${tag(20)}`;
    const setze = (x, w) => { const s = x.ref.current; const abw = { ...s.mandanten[0].abweichungen }; if (w === null) delete abw[k]; else abw[k] = w;
      x.ref.current = { ...s, mandanten: [{ ...s.mandanten[0], abweichungen: abw }] }; };
    setze(pl, "-"); await pl.SP.schreib(pl.ref.current, { sofort: true });
    setze(o, null); await o.SP.schreib(o.ref.current, { sofort: true, onTeilLage: () => {} });
    expect(o.SP.teilwegLage().konflikte).toHaveLength(1);
    vi.stubGlobal("window", { confirm: () => true });
    aufrufe.length = 0;
    expect(await o.akt.loeschlauf()).toEqual({ ergebnis: "ausstehend" });
    expect(wege().filter((w) => w.endsWith("/api/loeschlauf"))).toEqual([]);
  });

  /* ---------------- Delta-Review #350: neu laden Pflicht nach dem Löschlauf ---------------- */
  it("H1-a: Teil-POST hängt während der Bestätigung, scheitert danach; nach Basis-Erneuerung sendet „Noch einmal“ nichts", async () => {
    process.env.CENTRIC_TEILSPEICHERUNG = "true";
    fetchStub();
    const { raum, token } = await raumMit(["LT"]);
    const o = await oberflaeche(token.LT, "l1");
    const lagen = [];
    let loesen;
    const haengt = new Promise((j) => { loesen = j; });
    let eingabe = null;
    nachAntwort = (u, m, rumpf) => (u === "/api/loeschlauf" && rumpf && rumpf.vorschau ? async () => {
      antwortErsetzen = (u2) => (u2 === "/api/bestand/teile" ? { status: 500, daten: { fehler: "Serverfehler" }, warten: haengt } : null);
      o.ref.current = setzeAuf(o.ref.current, tag(20), "-");
      eingabe = o.SP.schreib(o.ref.current, { sofort: true, onFehler: (l) => lagen.push(l.art) });   // hängt
    } : null);
    expect(await o.akt.loeschlauf()).toEqual({ ergebnis: "ausgefuehrt" });
    expect(o.SP.neuLadenNoetig()).toBe(true);
    loesen();                                   // der hängende POST scheitert jetzt (500)
    await eingabe;
    antwortErsetzen = null;
    expect(lagen.at(-1)).toBe("neuLadenPflicht");
    /* Basis-Erneuerung wie nach einem Stempel, dann „Noch einmal senden“ und eine neue Eingabe. */
    const n = await o.SP.lies();
    o.SP.teilwegUebernehmen(n.teilAntwort);
    aufrufe.length = 0;
    expect(await o.SP.nochmalSchreiben()).toEqual({ ok: false, gesperrt: true });
    expect(await o.SP.schreib(setzeAuf({ ...n.bestand, session: o.ref.current.session }, tag(23), "-"), { sofort: true })).toEqual({ ok: false, gesperrt: true });
    expect(wege()).toEqual([]);
    expect(await geloescht(raum)).toEqual([undefined, undefined, undefined]);
    expect(o.SP.ausstehenderBestand().hinweis).toMatch(/VOR dem Löschlauf/);
  });

  it("H1-b: Netzfehler bei der Bestätigung (Server hat gelöscht): Ausgang unklar, neu laden Pflicht, nichts mehr gesendet", async () => {
    process.env.CENTRIC_TEILSPEICHERUNG = "true";
    fetchStub();
    const { raum, token } = await raumMit(["LT"]);
    const o = await oberflaeche(token.LT, "l1");
    netzNach = (u, m, rumpf) => u === "/api/loeschlauf" && !!rumpf && !!rumpf.bestaetigt;
    expect(await o.akt.loeschlauf()).toEqual({ ergebnis: "unklar" });
    expect(o.meldungen.at(-1)).toMatch(/Ausgang unklar/);
    expect(await geloescht(raum)).toEqual([undefined, undefined, undefined]);   // der Server hatte gelöscht
    expect(o.SP.neuLadenNoetig()).toBe(true);
    aufrufe.length = 0;
    expect(await o.SP.schreib(setzeAuf(o.ref.current, tag(20), "-"), { sofort: true })).toEqual({ ok: false, gesperrt: true });
    expect(await o.SP.nochmalSchreiben()).toEqual({ ok: false, gesperrt: true });
    expect(wege()).toEqual([]);
    expect(await geloescht(raum)).toEqual([undefined, undefined, undefined]);
  });

  it("P4: Eingaben nach dem Löschlauf überschreiben den gesperrten Auftrag nicht — er bleibt als Datei zu sichern", async () => {
    process.env.CENTRIC_TEILSPEICHERUNG = "true";
    fetchStub();
    const { token } = await raumMit(["LT"]);
    const o = await oberflaeche(token.LT, "l1");
    nachAntwort = (u, m, rumpf) => (u === "/api/loeschlauf" && rumpf && rumpf.vorschau ? async () => {
      antwortErsetzen = (u2) => (u2 === "/api/bestand/teile" ? { status: 500, daten: { fehler: "Serverfehler" } } : null);
      o.ref.current = setzeAuf(o.ref.current, tag(20), "-");
      await o.SP.schreib(o.ref.current, { sofort: true });
      antwortErsetzen = null;
    } : null);
    await o.akt.loeschlauf();
    await o.SP.schreib(setzeAuf(o.ref.current, tag(23), "N"), { sofort: true });
    const b = o.SP.ausstehenderBestand();
    expect(b.ausstehend.mandanten[0].abweichungen[`a1|${tag(20)}`]).toBe("-");
    expect(b.zuletzt.mandanten[0].abweichungen[`a1|${tag(23)}`]).toBe("N");
  });

  it("M2-Rest: Löschlauf-Speichern der Kundenrolle sicher abgewiesen (429), dann neue Eingabe: erbt „voll“, Stempel werden gelöscht", async () => {
    process.env.CENTRIC_TEILSPEICHERUNG = "true";
    fetchStub();
    const { raum, token } = await raumMit(["KU"]);
    const o = await oberflaeche(token.KU, "l1");
    o.akt.loeschlauf();
    let putNr = 0;
    antwortErsetzen = (u, m) => (m === "PUT" && ++putNr === 1 ? { status: 429, daten: { fehler: "Gerade wird sehr viel gespeichert." } } : null);
    await o.SP.schreib(o.ref.current, { sofort: true });
    expect(o.SP.ausstehend()).toBeTruthy();
    expect(o.SP.neuLadenNoetig()).toBe(false);          // sicher abgewiesen: nichts gelöscht
    aufrufe.length = 0;
    await o.SP.schreib(setzeAuf(o.ref.current, tag(23), "-"), { sofort: true });
    expect(wege()).toEqual(["GET /api/bestand", "PUT /api/bestand"]);
    expect(await geloescht(raum)).toEqual([undefined, undefined, undefined]);
    expect(o.SP.neuLadenNoetig()).toBe(true);
  });

  it("f: Eingabe innerhalb der Wartezeit nach dem Löschlauf (Kunde) ersetzt den Auftrag und erbt „voll“", async () => {
    process.env.CENTRIC_TEILSPEICHERUNG = "true";
    fetchStub();
    const { raum, token } = await raumMit(["KU"]);
    const o = await oberflaeche(token.KU, "l1");
    aufrufe.length = 0;
    o.akt.loeschlauf();
    o.SP.schreib(o.ref.current, {});                                     // wartet (WARTE)
    await o.SP.schreib(setzeAuf(o.ref.current, tag(23), "-"), { sofort: true });   // ersetzt den wartenden
    expect(wege()).toEqual(["GET /api/bestand", "PUT /api/bestand"]);   // ein Auftrag, als Voll-PUT
    expect(await geloescht(raum)).toEqual([undefined, undefined, undefined]);
  });

  it("g: Konfliktfrage beim Löschlauf-Speichern (Kunde): nach der Entscheidung geht es weiter als Voll-PUT", async () => {
    process.env.CENTRIC_TEILSPEICHERUNG = "true";
    fetchStub();
    const { raum, token } = await raumMit(["KU", "PL"]);
    const o = await oberflaeche(token.KU, "l1");
    const pl = await oberflaeche(token.PL, "p1");
    await pl.SP.schreib(setzeAuf(pl.ref.current, tag(20), "-"), { sofort: true });   // fremd
    o.ref.current = setzeAuf(o.ref.current, tag(20), "N");                              // eigene, ungespeichert
    o.akt.loeschlauf();
    await o.SP.schreib(o.ref.current, { sofort: true, onTeilLage: () => {} });
    const z = o.SP.teilwegLage();
    expect(z.konflikte.map((f) => f.k)).toEqual([`a1|${tag(20)}`]);
    aufrufe.length = 0;
    o.SP.teilEntscheidungAnwenden({ [z.konflikte[0].id]: "fremd" });
    await o.SP.schreibenAbschliessen();
    expect(wege()).toEqual(["GET /api/bestand", "PUT /api/bestand"]);
    expect(await geloescht(raum)).toEqual([undefined, undefined, undefined]);
    expect((await gespeichertM(raum)).abweichungen[`a1|${tag(20)}`]).toBe("-");
  });
});
