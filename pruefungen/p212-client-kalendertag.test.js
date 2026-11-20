/* ==========================================================================
   P2-12 Folgepunkt (1) aus Review #344 — Client-Behandlung von 422 UNGUELTIGER_KALENDERTAG

   Bisher wurde die Absage im Client zur Fehlerart „unbekannt": Rat „Noch einmal senden" (derselbe Stand, dasselbe
   422), ohne Bereich und ohne den Text des Servers. Jetzt: eigene Lage „kalendertag" mit Bereich (aus `feld`) und dem
   Text des Servers; kein „Noch einmal senden", sondern der bestehende Verwerfen-Weg (ausstehendVerwerfen) und neu
   laden, dazu wie immer „Als Datei sichern". Ein Zurücknehmen genau des einen Eintrags gibt es bewusst nicht (siehe
   src/speicher.js: der Client kennt Schlüssel/gespeicherten Wert nicht sicher — neuer Datenverlustweg).
   Differenz: alle anderen Absagen (auch andere 422) ergeben dieselbe Lage wie vorher (Zustand, nicht nur Status).
   Aufruf: npx vitest run pruefungen/p212-client-kalendertag.test.js
   ========================================================================== */
// zeit-ok: Die Uhr fließt nur in lage.zeit (ISO-Zeitstempel der Absage); die Prüfung vergleicht ihn nicht inhaltlich.
import { describe, it, expect, afterEach, beforeAll, afterAll, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const speicherAttrappe = (vorab = {}) => { const m = new Map(Object.entries(vorab)); return { getItem: (k) => (m.has(k) ? m.get(k) : null),
  setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear() }; };
const BESTAND = { version: 9, stand: 3, mandanten: [{ id: "m-a", abwesenheiten: [{ id: "x", personId: "p1", art: "urlaub", von: "2026-02-28", bis: "2026-02-30" }] }] };

/** Echter Client (src/speicher.js), fetch liefert die gegebene Antwort auf das PUT. */
async function client(antwort) {
  vi.resetModules();
  vi.stubGlobal("sessionStorage", speicherAttrappe({ "centric:token": "t-pruefung" }));
  vi.stubGlobal("localStorage", speicherAttrappe());
  const puts = [];
  vi.stubGlobal("fetch", async (url, opt = {}) => {
    if ((opt.method || "GET") === "PUT") puts.push(JSON.parse(opt.body));
    return new Response(JSON.stringify(antwort.daten), { status: antwort.status, headers: { "content-type": "application/json" } });
  });
  const SP = await import("../src/speicher.js");
  return { SP, puts };
}
async function absage(antwort) {
  const { SP, puts } = await client(antwort);
  const fehler = [], konflikt = [], gespeichert = [];
  await SP.schreib(JSON.parse(JSON.stringify(BESTAND)), { sofort: true, onFehler: (l) => fehler.push(l),
    onKonflikt: (d) => konflikt.push(d), onGespeichert: (x) => gespeichert.push(x) });
  return { SP, puts, fehler, konflikt, gespeichert };
}
const ohneZeit = (l) => { const { zeit, fehler: _f, ...rest } = l; void _f; expect(typeof zeit).toBe("string"); return rest; };

const KT = { status: 422, daten: { fehler: "Diesen Kalendertag gibt es nicht.", code: "UNGUELTIGER_KALENDERTAG",
  text: "Den Kalendertag 2026-02-30 gibt es nicht. Es wurde nichts geändert.", feld: "mandanten[0].abwesenheiten[0].bis" } };

afterEach(() => { vi.unstubAllGlobals(); });

describe("kalendertagBereich", () => {
  it("Bereich aus dem Feld des Servers; Unbekanntes → null", async () => {
    const { SP } = await client(KT);
    const soll = { "mandanten[0].erfassung": "Zeiterfassung (Ist-Zeiten)", "mandanten[0].abweichungen": "Dienstplan (Einteilungen)",
      "mandanten[0].abwesenheiten[2].bis": "Abwesenheiten", "mandanten[1].anfragen[0].von": "Anträge",
      "mandanten[0].ausschreibungen[0].datum": "Ausschreibungen", "mandanten[0].krankmeldungen[0].von": "Krankmeldungen" };
    for (const [feld, bereich] of Object.entries(soll)) expect(SP.kalendertagBereich(feld), feld).toBe(bereich);
    for (const x of [undefined, null, "", "erfassung", "mandanten[0].personen", "mandanten[0].constructor", "mandanten[0].__proto__", 42])
      expect(SP.kalendertagBereich(x), String(x)).toBeNull();
  });
});

describe("Voll-PUT: 422 UNGUELTIGER_KALENDERTAG", () => {
  it("eigene Lage mit Bereich, Feld und Text des Servers; Auftrag bleibt zum Sichern; verwerfen räumt ihn", async () => {
    const { SP, puts, fehler, konflikt, gespeichert } = await absage(KT);
    expect(puts).toHaveLength(1);
    expect(konflikt).toEqual([]);
    expect(gespeichert).toEqual([]);
    expect(fehler).toHaveLength(1);
    expect(ohneZeit(fehler[0])).toEqual({ art: "kalendertag", text: KT.daten.text, status: 422,
      feld: "mandanten[0].abwesenheiten[0].bis", bereich: "Abwesenheiten" });
    expect(fehler[0].fehler.code).toBe("UNGUELTIGER_KALENDERTAG");
    expect(ohneZeit(SP.ausstehend())).toEqual(ohneZeit({ ...fehler[0], fehler: undefined }));
    /* Sichern als Datei: der nicht gespeicherte Stand, unverändert (der ungültige Eintrag wird nicht still entfernt) */
    expect(SP.ausstehenderBestand()).toEqual(BESTAND);
    SP.ausstehendVerwerfen();
    expect(SP.ausstehend()).toBeNull();
    expect(SP.ausstehenderBestand()).toBeNull();
  });
  it("Feld/Text fehlen oder sind keine Zeichenketten: Lage ohne Bereich, Text aus `fehler`", async () => {
    const { fehler } = await absage({ status: 422, daten: { fehler: "Diesen Kalendertag gibt es nicht.", code: "UNGUELTIGER_KALENDERTAG", feld: { x: 1 }, text: 7 } });
    expect(ohneZeit(fehler[0])).toEqual({ art: "kalendertag", text: "Diesen Kalendertag gibt es nicht.", status: 422, feld: null, bereich: null });
  });
  it("Differenz: andere Absagen ergeben genau die Lage wie bisher (Art, Text, Status — keine Zusatzfelder)", async () => {
    const faelle = [
      [{ status: 422, daten: { fehler: "Die Dienstart ist unvollständig.", text: "x", feld: "mandanten[0].dienstarten[0].mindest" } }, { art: "unbekannt", text: "Die Dienstart ist unvollständig.", status: 422 }],
      [{ status: 422, daten: { fehler: "Teile ungültig.", code: "TEILE_UNGUELTIG", feld: "mandanten[0].erfassung" } }, { art: "unbekannt", text: "Teile ungültig.", status: 422 }],
      [{ status: 400, daten: { fehler: "Kaputt.", code: "UNGUELTIGER_KALENDERTAG", feld: "mandanten[0].erfassung" } }, { art: "unbekannt", text: "Kaputt.", status: 400 }],
      [{ status: 403, daten: { fehler: "Keine Schreibberechtigung." } }, { art: "keinRecht", text: "Keine Schreibberechtigung.", status: 403 }],
      [{ status: 413, daten: { fehler: "Zu groß." } }, { art: "zuGross", text: "Zu groß.", status: 413 }],
      [{ status: 500, daten: { fehler: "Serverfehler." } }, { art: "server", text: "Serverfehler.", status: 500 }],
    ];
    for (const [antwort, lage] of faelle) {
      const { fehler } = await absage(antwort);
      expect(fehler, JSON.stringify(antwort)).toHaveLength(1);
      expect(ohneZeit(fehler[0]), JSON.stringify(antwort)).toEqual(lage);
    }
  });
  it("200: gespeichert, keine Lage (unverändert)", async () => {
    const { SP, fehler, gespeichert } = await absage({ status: 200, daten: { ok: true, etag: "4" } });
    expect(fehler).toEqual([]);
    expect(gespeichert).toHaveLength(1);
    expect(SP.ausstehend()).toBeNull();
  });
});

describe("Leiste „nicht gespeichert“", () => {
  const rendern = async (lage) => {
    const { NichtGespeichert, SPEICHERLAGE } = await import("../src/ansichten/speicherlage.jsx");
    return { html: renderToStaticMarkup(React.createElement(NichtGespeichert, { lage, melde: () => {}, aufGeloest: () => {} })), SPEICHERLAGE };
  };
  it("kalendertag: Bereich und Text des Servers, Verwerfen-Weg und Sichern — kein „Noch einmal senden“", async () => {
    const { html, SPEICHERLAGE } = await rendern({ art: "kalendertag", text: KT.daten.text, status: 422, zeit: "2026-03-01T08:00:00.000Z",
      feld: "mandanten[0].abwesenheiten[0].bis", bereich: "Abwesenheiten" });
    expect(SPEICHERLAGE.kalendertag).toMatchObject({ verwerfen: true });
    expect(SPEICHERLAGE.kalendertag.nochmal).toBeUndefined();
    expect(html).toContain("Ein Datum gibt es nicht");
    expect(html).toContain("ungültiges Datum");
    expect(html).toContain("Bereich: <strong>Abwesenheiten</strong>");
    expect(html).toContain("Den Kalendertag 2026-02-30 gibt es nicht. Es wurde nichts geändert.");
    expect(html).toContain("Änderungen verwerfen und neu laden");
    expect(html).toContain("Als Datei sichern");
    expect(html).not.toContain("Noch einmal senden");
    /* Review #354 (4): Korrektur des Datums genügt — der Text sagt es; der Text des Servers steht genau einmal da */
    expect(html).toContain("Korrigiere das Datum des Eintrags");
    expect(html.split("Den Kalendertag 2026-02-30 gibt es nicht.").length - 1).toBe(1);
  });
  it("Differenz: die übrigen Lagen zeigen weder Bereichszeile noch Verwerfen-Knopf", async () => {
    const { SPEICHERLAGE } = await rendern(null);
    /* IMP-6 Oberfläche: „schichtmodell“ ist die zweite Lage mit Verwerfen-Weg und Bereichszeile (gleiche Begründung wie
       hier: ein zweiter Versuch schickte denselben Stand); geprüft in pruefungen/imp6-oberflaeche.test.js (C5). */
    for (const art of Object.keys(SPEICHERLAGE).filter((a) => a !== "kalendertag" && a !== "schichtmodell")) {
      const { html } = await rendern({ art, text: "XQZ-Lagetext", status: 500, zeit: "2026-03-01T08:00:00.000Z" });
      expect(html, art).not.toContain("Änderungen verwerfen und neu laden");
      expect(html, art).not.toContain("Bereich:");
      expect(html.split(">XQZ-Lagetext</span>").length - 1, art).toBe(1);   // die kleine Textzeile bleibt wie bisher
      expect(SPEICHERLAGE[art].verwerfen, art).toBeUndefined();
    }
  });
});

/* ---------- Review #354, Auflagen 1 und 3: Rückfrage vor dem Verwerfen; auch der wartende Auftrag ---------- */
describe("Verwerfen mit Rückfrage", () => {
  /** Client mit gescheitertem Auftrag (422) und — optional — einer neuen Eingabe in der Wartezeit. */
  const lage = async ({ wartend = false } = {}) => {
    const o = await absage(KT);
    const LG = await import("../src/ansichten/speicherlage.jsx");   // dieselbe Modulinstanz von speicher.js
    if (wartend) {
      vi.useFakeTimers();
      await o.SP.schreib({ ...JSON.parse(JSON.stringify(BESTAND)), stand: 4 }, { onFehler: () => {} });
      expect(o.SP.schreibenAusstehend()).toBe(true);
    }
    /* erst nach den Importen: speicher.js meldet beforeunload nur an einem echten window an */
    const neuGeladen = [];
    const fragen = [];
    const antworten = (ja) => vi.stubGlobal("window", { confirm: (t) => { fragen.push(t); return ja; }, location: { reload: () => neuGeladen.push(1) } });
    return { ...o, LG, neuGeladen, fragen, antworten };
  };
  afterEach(() => { vi.useRealTimers(); });
  it("Abbrechen: nichts verworfen, kein Neuladen — der Auftrag bleibt ausstehend und sicherbar", async () => {
    const o = await lage();
    o.antworten(false);
    expect(o.LG.verwerfenMitRueckfrage()).toBe(false);
    expect(o.fragen).toHaveLength(1);
    expect(o.fragen[0]).toContain("Jetzt verwerfen?");
    expect(o.neuGeladen).toEqual([]);
    expect(o.SP.ausstehend()).toMatchObject({ art: "kalendertag" });
    expect(o.SP.ausstehenderBestand()).toEqual(BESTAND);
  });
  it("Bestätigen: verworfen, dann neu geladen", async () => {
    const o = await lage();
    o.antworten(true);
    expect(o.LG.verwerfenMitRueckfrage()).toBe(true);
    expect(o.fragen).toHaveLength(1);
    expect(o.neuGeladen).toEqual([1]);
    expect(o.SP.ausstehend()).toBeNull();
    expect(o.SP.ausstehenderBestand()).toBeNull();
  });
  it("wartende Eingabe in der Wartezeit: Abbrechen lässt sie stehen; Bestätigen verwirft auch sie — nichts geht mehr hinaus", async () => {
    const o = await lage({ wartend: true });
    o.antworten(false);
    o.LG.verwerfenMitRueckfrage();
    expect(o.SP.schreibenAusstehend()).toBe(true);
    o.antworten(true);
    o.LG.verwerfenMitRueckfrage();
    expect(o.SP.schreibenAusstehend()).toBe(false);    // beforeunload sendet nichts und fragt nicht
    expect(o.SP.ausstehend()).toBeNull();
    await vi.advanceTimersByTimeAsync(5000);
    expect(o.puts).toHaveLength(1);                     // nur der erste, abgewiesene Versuch
  });
  it("Differenz: ausstehendVerwerfen (bestehend) räumt wie bisher nur den gescheiterten Auftrag", async () => {
    const o = await lage({ wartend: true });
    o.SP.ausstehendVerwerfen();
    expect(o.SP.ausstehend()).toBeNull();
    expect(o.SP.schreibenAusstehend()).toBe(true);
  });
});

/* ---------- Review #354, Auflage 2: der Teilweg (echter Handler, Schalter nur in dieser Prüfung an) ---------- */
describe("Teilweg: 422 UNGUELTIGER_KALENDERTAG trägt Feld und Bereich", () => {
  const WIRT = "127.0.0.1:3000", RAUM = "p212-client-teilweg";
  let wurzel, daten, token, nr = 0;
  const wege = [];
  beforeAll(async () => {
    wurzel = await mkdtemp(path.join(tmpdir(), "centric-p212-client-"));
    Object.assign(process.env, { CENTRIC_DATEN: wurzel, CENTRIC_ABLAGE: "dateien", CENTRIC_PFEFFER: "pfeffer-nur-zum-pruefen-0123456789",
      CENTRIC_TEILSPEICHERUNG: "true" });
    const schutz = await import("../server/lib/schutz.mjs");
    for (const art of Object.keys(schutz.GRENZEN)) schutz.GRENZEN[art] = { ...schutz.GRENZEN[art], versuche: 100000 };
    const { getStore } = await import("../server/lib/ablage.mjs");
    daten = (await import("../server/funktionen/daten.mjs")).default;
    const B = await import("../server/lib/bestand.mjs");
    const { sitzungAnlegen } = await import("../server/lib/sitzungen.mjs");
    const person = (id, rolle) => ({ id, vorname: "V", nachname: `N${id}`, rolle, bereich: "ALLE", status: "aktiv", qualifikationen: [],
      zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }] });
    await B.bestandSchreiben(getStore({ name: "centric", consistency: "strong" }), RAUM, { version: 9, mandanten: [{ id: "m-a", name: "A", status: "aktiv",
      einstellungen: {}, einheiten: [{ id: "e1", name: "E" }],
      dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00", mindest: { mo_do: 0, fr: 0, sa: 0, so: 0 } }],
      personen: [person("l1", "leitung"), person("m1", "mitarbeiter")], abweichungen: {}, einstempeln: {}, erfassung: {}, anfragen: [], abwesenheiten: [] }] },
    { durch: "Pruefung" });
    token = (await sitzungAnlegen({ bestand: RAUM, name: "V Nl1", rolle: "leitung", person: "l1", betrieb: 0, mandantId: "m-a", einheit: null }, 2 * 3600 * 1000)).token;
  });
  afterAll(async () => {
    delete process.env.CENTRIC_TEILSPEICHERUNG;
    if (wurzel) await rm(wurzel, { recursive: true, force: true });
  });
  it("Kern abwesenheiten mit 2026-11-31 über bestand/teile: Lage kalendertag mit Feld und Bereich, kein Voll-PUT", async () => {
    vi.resetModules();
    vi.stubGlobal("sessionStorage", speicherAttrappe({ "centric:token": token }));
    vi.stubGlobal("localStorage", speicherAttrappe());
    vi.stubGlobal("fetch", async (url, opt = {}) => {
      nr += 1;
      const methode = opt.method || "GET";
      wege.push(`${methode} ${url}`);
      const kopf = { ...(opt.headers || {}), host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.63.${Math.floor(nr / 250) % 250}.${nr % 250}` };
      return daten(new Request(`http://${WIRT}${url}`, { method: methode, headers: kopf, ...(opt.body ? { body: opt.body } : {}) }), {});
    });
    const SP = await import("../src/speicher.js");
    const g = await SP.lies();
    expect(g.teilAntwort, "Teilweg angeboten").toBeTruthy();
    expect(SP.teilwegUebernehmen(g.teilAntwort)).toBe(true);
    const b = { ...JSON.parse(JSON.stringify(g.bestand)), session: { mandantId: "m-a", personId: "l1" } };
    b.mandanten[0].abwesenheiten.push({ id: "abw-t", personId: "m1", art: "urlaub", von: "2026-11-30", bis: "2026-11-31" });
    const fehler = [];
    wege.length = 0;
    await SP.schreib(b, { sofort: true, onFehler: (l) => fehler.push(l), onTeilLage: () => {}, onTeilLokal: () => {} });
    expect(wege.filter((w) => w.startsWith("POST /api/bestand/teile")).length, wege.join(", ")).toBeGreaterThan(0);
    expect(wege.some((w) => w.startsWith("PUT ")), wege.join(", ")).toBe(false);
    expect(fehler).toHaveLength(1);
    expect(ohneZeit(fehler[0])).toEqual({ art: "kalendertag", status: 422, text: "Den Kalendertag 2026-11-31 gibt es nicht. Es wurde nichts geändert.",
      feld: "mandanten[0].abwesenheiten[0].bis", bereich: "Abwesenheiten" });
  });
});
