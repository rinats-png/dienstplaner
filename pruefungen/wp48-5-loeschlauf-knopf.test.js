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
  return { version: 9, stand: 1, mandanten: [{ id: "m1", name: "Haus", branche: "pflege", bundesland: "BE", status: "aktiv",
    einheiten: [{ id: "e1", name: "WB 1", versatzTage: 0 }],
    dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00", pause: 30, mindest: { mo_do: 0, fr: 0, sa: 0, so: 0 } }],
    zyklus: ["-"], anker: "2026-01-05", zyklusLaenge: 1, gruppen: [], versatzTageVon: {},
    einstellungen: { ruhezeit: 11, maxFolge: 6 },
    personen: [person("m0", "mitarbeiter", "e1"), person("a1", "mitarbeiter", "e1"), person("p1", "planer", "ALLE"), person("l1", "leitung", "ALLE")],
    abweichungen: plan, erfassung: {}, einstempeln: {}, wuensche: [], anfragen: [], nachrichten: [], abwesenheiten: [],
    freigaben: {}, bestaetigungen: [], protokoll: [] }] };
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
function fetchStub() {
  vi.stubGlobal("fetch", async (url, opt = {}) => {
    nr += 1;
    const methode = opt.method || "GET";
    const kopf = { ...(opt.headers || {}), host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.51.${Math.floor(nr / 250) % 250}.${nr % 250}` };
    aufrufe.push({ url, methode, rumpf: opt.body ? JSON.parse(opt.body) : null });
    return daten(new Request(`http://${WIRT}${url}`, { method: methode, headers: kopf, ...(opt.body ? { body: opt.body } : {}) }), {});
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
    serverstandNachladen: async () => { o.nachgeladen += 1; } });
  /* Rückfragen bestätigen (nach dem Import: speicher.js meldet sich nur an einem echten window an). */
  vi.stubGlobal("window", { confirm: () => true });
  return o;
}
const wege = () => aufrufe.map((a) => `${a.methode} ${a.url}`);

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
  afterEach(() => { vi.unstubAllGlobals(); aufrufe.length = 0; });
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
    expect(wege()).toEqual(["POST /api/loeschlauf", "POST /api/loeschlauf"]);
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
    const { token } = await raumMit(["KU"]);
    const o = await oberflaeche(token.KU, "l1");
    expect(o.SP.teilwegAktiv()).toBe(true);
    aufrufe.length = 0;
    o.akt.loeschlauf();
    expect(o.mUpd).toHaveLength(1);
    expect(wege()).toEqual([]);
    await o.SP.schreib(o.ref.current, { sofort: true, durch: "Pruefung" });
    expect(wege()).toEqual(["PUT /api/bestand"]);
    /* Danach (Rückfall gelungen) bleibt die Sitzung beim Voll-PUT; die Vorgabe „voll" ist verbraucht. */
    expect(o.SP.teilwegAktiv()).toBe(false);
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
});
