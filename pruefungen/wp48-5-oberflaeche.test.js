/* ==========================================================================
   WP-48.5 Teil 2: Teilspeicherung in der Oberfläche — Verdrahtung ohne Browser

   A  Einheit: Ablauf eines Speichervorgangs (src/app/teilweg-steuerung.js)
      gegen einen nachgebauten Server — Rückfall `voll` nur ohne Unklares,
      keine Sendung bei offener Frage (auch nicht beim Schließen, B1),
      Sitzungskennung immer (B4), neuAufsetzen nie beim Schließen und nie aus
      dem Speicher des Dienstarbeiters; Entscheiden; Sicherung als Datei;
      Feldbezeichnungen (src/app/feldbezeichnungen.js) und die Liste des
      Ausstehenden im Fenster (src/ansichten/teilkonflikt.jsx).
   B  Der echte Client (src/speicher.js) gegen den echten Handler: fetch
      wird auf daten() umgeleitet (wie bestand-personalnummer.test.js), je
      Oberfläche eine eigene Modulinstanz mit eigener Sitzung.
      - Schalter aus: kein `teile`, kein Aufruf des Teilwegs, der Voll-PUT
        trägt genau den heutigen Rumpf.
      - Schalter an: Rollen LT/PL/SV/MA — Teil-POST statt PUT, Konflikt je
        Zelle/Feld → Fenster (onTeilLage) statt Voll-Konfliktfenster,
        Entscheidung „fremd"/„meins" → Rest geht von selbst hinaus.
      - Netz weg nach dem Senden, dann neue Sitzung ohne Neuladen (Teil-2-
        Punkt aus 7.6): keine Sendung unter neuer Kennung, sondern GET,
        neuAufsetzen, Frage.
      - Rückfall `voll` (Feld ohne Version) → Voll-PUT, danach Teilweg aus;
        keepalive beim Schließen schickt nichts bei offener Frage.
   Uhr: keine Zeitmessung; Tagesangaben relativ zu heute aus der
   Kalenderrechnung des Servers (wie wp48-5-konflikt.test.js).
   // zeit-ok: Tagesangaben nur relativ zu heute (Kalenderrechnung des Servers), keine Zeitmessung, kein Zeitstempel geprüft
   Aufruf: npx vitest run pruefungen/wp48-5-oberflaeche.test.js
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import * as T from "../src/app/teilkonflikt.js";
import * as W from "../src/app/teilweg-steuerung.js";
import { bezeichne, BENANNTE_FELDER } from "../src/app/feldbezeichnungen.js";
import { ausstehendListe } from "../src/ansichten/teilkonflikt.jsx";

const kopie = (x) => JSON.parse(JSON.stringify(x));
const V = (c) => c.repeat(32);
let kennungNr = 0;
const neueKennung = () => `pruef-${String(++kennungNr).padStart(6, "0")}`;

/* -------------------------------------------------------------------------- */
/* A  Einheit                                                                 */

const betrieb = () => ({ id: "m1", name: "Haus",
  personen: [{ id: "p1", vorname: "Pia", nachname: "Plan" }, { id: "a1", vorname: "Ana", nachname: "Alt" }],
  dienstarten: [{ id: "F", name: "Früh" }, { id: "N", name: "Nacht" }], wuensche: [],
  abweichungen: { "a1|2026-08-14": "F" }, erfassung: {} });
const getAntwort = (m, epoche = "e0e0e0e0") => ({ bestand: { mandanten: [m] }, etag: 7,
  teile: { format: 1, epoche, versionen: { "kern:dienstarten": V("a"), "kern:personen": V("b"), "kern:wuensche": V("c") } } });
const mitSitzung = (m) => ({ version: 9, session: { mandantId: "m1", personId: "p1" }, mandanten: [m] });
const zelleSetzen = (b, k, w) => { const m = { ...b.mandanten[0], abweichungen: { ...b.mandanten[0].abweichungen, [k]: w } }; return { ...b, mandanten: [m] }; };

/** Nachgebauter Server: zählt Aufrufe; Antworten je Aufruf aus einer Liste. */
function attrappe({ posts = [], gets = [] } = {}) {
  const log = { posts: [], gets: 0 };
  return { log,
    senden: async (rumpf) => { log.posts.push(kopie(rumpf)); const a = posts.shift(); return typeof a === "function" ? a(rumpf) : a || { status: 200, daten: { ok: true } }; },
    holen: async () => { log.gets += 1; const g = gets.shift(); return typeof g === "function" ? g() : g || { status: 200, daten: getAntwort(betrieb()) }; } };
}
const start = () => T.teilwegStart(getAntwort(betrieb()), "m1");
const lauf = (z, bestand, srv, mehr = {}) => W.teilSpeichern(z, { bestand, durch: "Pia Plan", sitzung: "s-eins", neueKennung,
  senden: srv.senden, holen: srv.holen, ...mehr });

describe("A1 Ablauf: Senden, Rückfall, Sperren", () => {
  it("eine Zelle → Teil-POST mit Sitzungskennung im Zustand (B4), kein GET", async () => {
    const srv = attrappe();
    const r = await lauf(start(), zelleSetzen(mitSitzung(betrieb()), "a1|2026-08-14", "N"), srv);
    expect(r.ergebnis).toBe("gespeichert");
    expect(srv.log.posts).toHaveLength(1);
    expect(srv.log.posts[0].zellen).toEqual([{ feld: "abweichungen", k: "a1|2026-08-14", alt: "F", neu: "N" }]);
    expect(JSON.stringify(srv.log.posts[0])).not.toMatch(/s-eins/);   // die Sitzungskennung geht nie an den Server
    expect(srv.log.gets).toBe(0);
    expect(T.deltaBilden(r.teil, r.gesendet.mandanten[0])).toEqual({ leer: true });
  });
  it("ohne Sitzungskennung kein Rumpf (wie abgemeldet), nichts gesendet", async () => {
    const srv = attrappe();
    const r = await W.teilSpeichern(start(), { bestand: zelleSetzen(mitSitzung(betrieb()), "a1|2026-08-14", "N"), sitzung: null,
      neueKennung, senden: srv.senden, holen: srv.holen });
    expect(r.ergebnis).toBe("fehler");
    expect(r.antwort.status).toBe(401);
    expect(srv.log.posts).toHaveLength(0);
  });
  it("Feld ohne Version → Rückfall voll, ohne zu senden; mit Unklarem dagegen erst GET und neu aufsetzen", async () => {
    const srv = attrappe();
    const b = { ...mitSitzung({ ...betrieb(), zyklus: ["F"] }) };
    const r = await lauf(start(), b, srv);
    expect(r).toMatchObject({ ergebnis: "voll", grund: "feld:zyklus" });
    expect(srv.log.posts).toHaveLength(0);
    /* Unklar: erst gesendet, Antwort verloren. */
    const srv2 = attrappe({ posts: [{ status: null, netz: true }] });
    const r1 = await lauf(start(), zelleSetzen(mitSitzung(betrieb()), "a1|2026-08-14", "N"), srv2);
    expect(r1.ergebnis).toBe("fehler");
    expect(r1.teil.unklar).toEqual(["z:abweichungen:a1|2026-08-14"]);
    const b2 = zelleSetzen(mitSitzung({ ...betrieb(), zyklus: ["F"] }), "a1|2026-08-14", "N");
    const srv3 = attrappe({ gets: [{ status: 200, daten: getAntwort({ ...betrieb(), abweichungen: { "a1|2026-08-14": "N" } }) }] });
    const r2 = await lauf(r1.teil, b2, srv3);
    expect(srv3.log.gets).toBe(1);
    expect(r2.ergebnis).not.toBe("gespeichert");
    expect(["neuLaden", "voll"]).toContain(r2.ergebnis);
    /* War es „voll", dann erst nach dem Neuaufsetzen (nichts mehr unklar). */
    if (r2.ergebnis === "voll") expect(r2.teil.unklar).toEqual([]);
  });
  it("Ausnahmeweg (vollGewuenscht): ruhig → voll; mit Unklarem erst neu aufsetzen", async () => {
    const srv = attrappe();
    expect((await lauf(start(), mitSitzung(betrieb()), srv, { vollGewuenscht: true })).ergebnis).toBe("voll");
    const z = { ...start(), unklar: ["z:abweichungen:a1|2026-08-14"] };
    const srv2 = attrappe();
    const r = await lauf(z, mitSitzung(betrieb()), srv2, { vollGewuenscht: true });
    expect(srv2.log.gets).toBe(2);   // neu aufsetzen, dann vor dem Voll-PUT noch einmal frisch (Review #348 H1)
    expect(r.teil.unklar).toEqual([]);
  });
  it("offene Frage: nichts senden — auch nicht beim Schließen (B1)", async () => {
    const srv = attrappe({ posts: [{ status: 409, daten: { code: "TEILE_KONFLIKT", konflikt: { zellen: [{ feld: "abweichungen", k: "a1|2026-08-14", aktuell: "S" }], kern: [] } } }] });
    const b = zelleSetzen(mitSitzung(betrieb()), "a1|2026-08-14", "N");
    const r = await lauf(start(), b, srv);
    expect(r.ergebnis).toBe("konflikt");
    const weiter = zelleSetzen(b, "a1|2026-08-14", "-");
    for (const beimSchliessen of [false, true]) {
      const n = await lauf(r.teil, weiter, srv, { beimSchliessen });
      expect(n).toMatchObject({ ergebnis: "gesperrt", grund: "frage-offen" });
    }
    expect(srv.log.posts).toHaveLength(1);
  });
  it("neu aufsetzen nötig beim Schließen → nichts (kein GET), Auftrag bleibt ausstehend", async () => {
    const z = { ...start(), unklar: ["z:abweichungen:a1|2026-08-14"] };
    const srv = attrappe();
    const r = await lauf(z, zelleSetzen(mitSitzung(betrieb()), "a1|2026-08-15", "N"), srv, { beimSchliessen: true });
    expect(r).toMatchObject({ ergebnis: "nichts", grund: "neu-aufsetzen-beim-schliessen" });
    expect(srv.log.gets + srv.log.posts.length).toBe(0);
  });
  it("Antwort aus dem Speicher des Dienstarbeiters ist kein frischer Stand: nichts übernommen", async () => {
    const z = { ...start(), unklar: ["z:abweichungen:a1|2026-08-14"] };
    const srv = attrappe({ gets: [{ status: 200, daten: getAntwort(betrieb()), ausSpeicher: true }] });
    const ueber = [];
    const r = await lauf(z, zelleSetzen(mitSitzung(betrieb()), "a1|2026-08-15", "N"), srv, { uebernehmen: (b) => ueber.push(b) });
    expect(r.ergebnis).toBe("fehler");
    expect(ueber).toEqual([]);
    expect(r.teil.unklar).toEqual(["z:abweichungen:a1|2026-08-14"]);
  });
  it("anderer Betrieb in der Sitzung → aus (Voll-PUT), nie ein Delta über den falschen Betrieb", async () => {
    const b = { ...mitSitzung(betrieb()), session: { mandantId: "m9" } };
    const r = await lauf(start(), b, attrappe());
    expect(r).toMatchObject({ ergebnis: "aus", teil: null });
  });
  it("neu aufgesetzt: übernommen wird der jüngste lokale Stand, sofort und vor dem Senden", async () => {
    const z = { ...start(), unklar: ["z:abweichungen:a1|2026-08-14"] };
    const gesendet = zelleSetzen(zelleSetzen(mitSitzung(betrieb()), "a1|2026-08-14", "N"), "a1|2026-08-15", "N");
    const juenger = zelleSetzen(gesendet, "a1|2026-08-16", "S");   // während des GET eingegeben
    const reihenfolge = [];
    const srv = attrappe({ gets: [{ status: 200, daten: getAntwort({ ...betrieb(), abweichungen: { "a1|2026-08-14": "F" } }) }] });
    const r = await W.teilSpeichern(z, { bestand: gesendet, neuester: () => juenger, sitzung: "s-eins", neueKennung,
      senden: async (rumpf) => { reihenfolge.push("senden"); return srv.senden(rumpf); }, holen: srv.holen,
      uebernehmen: () => reihenfolge.push("uebernehmen") });
    /* Die unklare Zelle steht wieder auf dem Erwartungswert → Frage (ABA-Schutz), nichts gesendet. */
    expect(r.ergebnis).toBe("konflikt");
    expect(reihenfolge).toEqual(["uebernehmen"]);
    expect(r.bestand.mandanten[0].abweichungen["a1|2026-08-16"]).toBe("S");
  });
});

describe("A3 Befund der Modellprüfung: Kernversionen nach 409 nur mit Wert", () => {
  it("Zellkonflikt mit Versionen aller Kernfelder: eine spätere Kernänderung trägt weiter die alte Basisversion", () => {
    const z = start();
    const l = { ...z.basis, abweichungen: { "a1|2026-08-14": "N" } };
    const r = T.rumpfBauen(z, T.deltaBilden(z, l).delta, { neueKennung, sitzung: "s1" });
    const e = T.antwortVerarbeiten(r.zustand, { status: 409, daten: { code: "TEILE_KONFLIKT",
      konflikt: { zellen: [{ feld: "abweichungen", k: "a1|2026-08-14", aktuell: "S" }], kern: [] },
      versionen: { "kern:dienstarten": V("f"), "kern:personen": V("f"), "m1::2026-08": V("9") } } });
    expect(e.zustand.versionen["kern:dienstarten"]).toBe(V("a"));   // Basiswert unverändert → alte Version
    expect(e.zustand.versionen["m1::2026-08"]).toBe(V("9"));
    const a = T.aufloesen(T.waehlen(e.zustand, "z:abweichungen:a1|2026-08-14", "fremd"), l);
    const l2 = { ...a.lokal, dienstarten: [...a.lokal.dienstarten, { id: "S", name: "Spät" }] };
    expect(T.deltaBilden(a.zustand, l2).delta.kern.dienstarten.basis).toBe(V("a"));
  });
  it("200: Versionen nur der eben geschriebenen Kernfelder", () => {
    const z = start();
    const l = { ...z.basis, wuensche: [{ id: "w1" }] };
    const r = T.rumpfBauen(z, T.deltaBilden(z, l).delta, { neueKennung, sitzung: "s1" });
    const e = T.antwortVerarbeiten(r.zustand, { status: 200, daten: { ok: true, versionen: { "kern:wuensche": V("7"), "kern:personen": V("7") } } });
    expect(e.zustand.versionen["kern:wuensche"]).toBe(V("7"));
    expect(e.zustand.versionen["kern:personen"]).toBe(V("b"));
  });
});

describe("A4 vollVorbereiten (Review #348 H1): Neuaufsetzen je Zelle/Feld vor dem Voll-PUT", () => {
  it("meins bleibt, Fremdes kommt dazu, Streit wird Frage; Stempel je Schlüssel, eingefrorenes Ist aus der frischen Sicht", () => {
    const b0 = { ...betrieb(), einstempeln: { "a1|2024-01-01": { start: "06:00" }, "a1|2026-08-01": { start: "06:00" } }, istEingefroren: { x: 1 } };
    const z = T.teilwegStart(getAntwort(b0), "m1");
    const lokal = { ...b0, zyklus: ["F"], abweichungen: { "a1|2026-08-14": "N", "a1|2026-08-15": "N" },
      einstempeln: { "a1|2026-08-01": { start: "06:00" } }, istEingefroren: {} };          // Löschlauf lokal: alter Stempel weg
    const frisch = { ...b0, abweichungen: { "a1|2026-08-14": "F", "a1|2026-08-15": "S", "b1|2026-08-16": "N" },
      einstempeln: { ...b0.einstempeln, "a1|2026-08-02": { start: "07:00" } }, istEingefroren: { x: 2 } };
    const v = W.vollVorbereiten(z, lokal, getAntwort(frisch));
    expect(v.ergebnis).toBe("konflikt");
    expect(v.zustand.konflikte.map((f) => [f.id, f.meins, f.fremd])).toEqual([["z:abweichungen:a1|2026-08-15", "N", "S"]]);
    expect(v.lokal.zyklus).toEqual(["F"]);                                              // meins (ohne Version)
    expect(v.lokal.abweichungen["a1|2026-08-14"]).toBe("N");                           // meins
    expect(v.lokal.abweichungen["b1|2026-08-16"]).toBe("N");                           // fremd dazu
    expect(Object.keys(v.lokal.einstempeln).sort()).toEqual(["a1|2026-08-01", "a1|2026-08-02"]);
    expect(v.lokal.istEingefroren).toEqual({ x: 2 });
    const a = T.aufloesen(T.waehlen(v.zustand, "z:abweichungen:a1|2026-08-15", "fremd"), v.lokal);
    const w = W.vollVorbereiten(a.zustand, a.lokal, getAntwort(frisch));
    expect(w.ergebnis).toBe("voll");
    expect(w.lokal.abweichungen["a1|2026-08-15"]).toBe("S");
  });
  it("Stempel als Frage heißt „Stempel“, nicht „Einteilung“", () => {
    const t = T.frageText({ art: "zelle", feld: "einstempeln", k: "a1|2026-08-01", meins: null, fremd: { start: "06:00", ende: "14:00" } }, betrieb());
    expect(t.titel).toBe("Stempel von Ana Alt am 01.08.2026");
    expect(t.fremd).toBe("06:00–14:00");
  });
  it("andere Epoche → neu laden; offene Frage → gesperrt", () => {
    const z = start();
    expect(W.vollVorbereiten(z, z.basis, getAntwort(betrieb(), "e9e9e9e9")).ergebnis).toBe("neuLaden");
    expect(W.vollVorbereiten({ ...z, konflikte: [{ id: "x" }], phase: "konflikt" }, z.basis, getAntwort(betrieb())).ergebnis).toBe("gesperrt");
  });
});

describe("A2 Entscheiden, Sicherung, Texte", () => {
  const imKonflikt = async () => {
    const srv = attrappe({ posts: [{ status: 409, daten: { code: "TEILE_KONFLIKT", konflikt: {
      zellen: [{ feld: "abweichungen", k: "a1|2026-08-14", aktuell: "S" }], kern: [{ feld: "dienstarten", aktuell: [{ id: "X", name: "Extra" }], version: V("d") }] } } }] });
    const b0 = zelleSetzen(mitSitzung(betrieb()), "a1|2026-08-14", "N");
    const b = { ...b0, mandanten: [{ ...b0.mandanten[0], dienstarten: [...b0.mandanten[0].dienstarten, { id: "S", name: "Spät" }] }] };
    return { r: await lauf(start(), b, srv), b };
  };
  it("teilEntscheiden: null, solange eine Frage offen ist; danach lokaler Stand je Wahl", async () => {
    const { r, b } = await imKonflikt();
    expect(r.teil.konflikte.map((f) => f.id)).toEqual(["k:dienstarten", "z:abweichungen:a1|2026-08-14"]);
    expect(W.teilEntscheiden(r.teil, { "k:dienstarten": "fremd" }, b)).toBeNull();
    const e = W.teilEntscheiden(r.teil, { "k:dienstarten": "fremd", "z:abweichungen:a1|2026-08-14": "meins" }, b);
    expect(e.bestand.mandanten[0].dienstarten).toEqual([{ id: "X", name: "Extra" }]);
    expect(e.bestand.mandanten[0].abweichungen["a1|2026-08-14"]).toBe("N");
    expect(e.bestand.session).toEqual(b.session);
    const d = T.deltaBilden(e.teil, e.bestand.mandanten[0]);
    expect(d.delta.zellen).toEqual([{ feld: "abweichungen", k: "a1|2026-08-14", alt: "S", neu: "N" }]);
    expect(d.delta.kern).toEqual({});
  });
  it("Sicherung als Datei: Ausstehendes und eigener Betrieb, ohne Sitzung", async () => {
    const z = T.antwortVerarbeiten(T.rumpfBauen(start(), T.deltaBilden(start(), { ...betrieb(), abweichungen: { "a1|2026-08-14": "N" } }).delta,
      { neueKennung, sitzung: "s-geheim" }).zustand, { status: 409, daten: { code: "NEU_LADEN" } }).zustand;
    expect(z.phase).toBe("neuLaden");
    const b = zelleSetzen(mitSitzung(betrieb()), "a1|2026-08-14", "N");
    const s = W.sicherungInhalt(z, b, "2026-11-18T10:00:00.000Z");
    expect(s.ausstehend.zellen).toEqual([{ feld: "abweichungen", k: "a1|2026-08-14", alt: "F", neu: "N" }]);
    expect(s.meinBetrieb.abweichungen["a1|2026-08-14"]).toBe("N");
    expect(JSON.stringify(s)).not.toMatch(/s-geheim|session/);
    expect(ausstehendListe(z, betrieb())).toEqual(["Einteilung von Ana Alt am 14.08.2026: Nacht (N)"]);
  });
  it("sitzungsAbdruck: gleich für denselben Zugang, verschieden sonst, enthält den Zugang nicht", () => {
    const t = "zugang-0123456789abcdef";
    expect(W.sitzungsAbdruck(t)).toBe(W.sitzungsAbdruck(t));
    expect(W.sitzungsAbdruck(t)).not.toBe(W.sitzungsAbdruck(`${t}x`));
    expect(W.sitzungsAbdruck(t)).not.toContain(t);
    expect(W.sitzungsAbdruck(null)).toBeNull();
    expect(W.sitzungsAbdruck("")).toBeNull();
  });
  it("Feldbezeichnungen: jedes Kernfeld des Servers lesbar und deutsch, Schlüssel ohne Eintrag groß geschrieben", async () => {
    const { KERNFELDER } = await import("../server/lib/teilweg.mjs");
    for (const f of KERNFELDER) expect(bezeichne(f), f).toMatch(/^[A-ZÄÖÜ]\S/);
    /* Ohne Eintrag nur Felder, deren Schlüssel schon ein deutsches Hauptwort ohne Umschrift ist. */
    for (const f of KERNFELDER.filter((x) => !BENANNTE_FELDER.includes(x))) expect(f, f).toMatch(/^[a-z]+$/);
    for (const f of BENANNTE_FELDER) expect(KERNFELDER, `${f} ist kein Kernfeld des Teilwegs`).toContain(f);
    expect(bezeichne("wuensche")).toBe("Wünsche");
    expect(bezeichne("unbekanntesFeld")).toBe("UnbekanntesFeld");
    /* frageText nutzt die Bezeichnung */
    expect(T.frageText({ art: "kern", feld: "dienstarten" }, betrieb(), bezeichne).titel).toBe("Stammdaten: Dienstarten");
  });
});

/* -------------------------------------------------------------------------- */
/* B  Echter Client gegen den echten Handler                                  */

const WIRT = "127.0.0.1:3000";
let wurzel, laden, daten, B, G, sitzungAnlegen, tag;
let nr = 0;
const ROLLEN = {
  LT: { rolle: "leitung", person: "l1" },
  PL: { rolle: "planer", person: "p1" },
  SV: { rolle: "subplaner", person: "s1", einheit: "e1" },
  MA: { rolle: "mitarbeiter", person: "m0" },
};
const person = (id, rolle, einheit) => ({ id, vorname: "V", nachname: `N${id}`, rolle, bereich: einheit, status: "aktiv",
  geburtstag: "1980-01-01", qualifikationen: [], zugehoerigkeit: [{ ab: "2020-01-01", einheitId: einheit }], telefon: "0", email: `${id}@example.org` });
function bestandC() {
  const plan = {};
  for (const pid of ["m0", "a1", "s1"]) for (const n of [20, 23, 26, 29]) plan[`${pid}|${tag(n)}`] = "F";
  return { version: 9, stand: 1, mandanten: [{ id: "m1", name: "Haus", branche: "pflege", bundesland: "BE", status: "aktiv",
    einheiten: [{ id: "e1", name: "WB 1", versatzTage: 0 }],
    dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00", pause: 30, mindest: { mo_do: 0, fr: 0, sa: 0, so: 0 } }, { id: "N", name: "Nacht", start: "22:00", ende: "06:00", pause: 30, mindest: { mo_do: 0, fr: 0, sa: 0, so: 0 } }],
    zyklus: ["-"], anker: "2026-01-05", zyklusLaenge: 1, gruppen: [], versatzTageVon: {},
    einstellungen: { ruhezeit: 11, maxFolge: 6 },
    personen: [person("m0", "mitarbeiter", "e1"), person("a1", "mitarbeiter", "e1"), person("s1", "subplaner", "e1"),
      person("p1", "planer", "ALLE"), person("l1", "leitung", "ALLE")],
    abweichungen: plan, erfassung: {}, einstempeln: {}, wuensche: [], anfragen: [], nachrichten: [], abwesenheiten: [],
    freigaben: {}, bestaetigungen: [], protokoll: [] }] };
}
let raumNr = 0;
async function raumMit(rollen) {
  const raum = `wp48-5o-${++raumNr}`;
  await B.bestandSchreiben(laden(), raum, G.personenAngleichen(G.uebergabenAngleichen(bestandC())), { durch: "Pruefung" });
  const token = {};
  for (const k of rollen) {
    const r = ROLLEN[k.replace(/\d$/, "")];
    token[k] = (await sitzungAnlegen({ bestand: raum, name: `V N${r.person}`, rolle: r.rolle, person: r.person, betrieb: 0,
      mandantId: "m1", einheit: r.einheit || null }, 2 * 3600 * 1000)).token;
  }
  return { raum, token };
}
const gespeichertM = async (raum) => (await B.bestandLesenStreng(laden(), raum)).bestand.mandanten[0];

const speicherAttrappe = (vorab = {}) => { const m = new Map(Object.entries(vorab)); return { getItem: (k) => (m.has(k) ? m.get(k) : null),
  setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear() }; };
/** Alle Aufrufe aller Oberflächen (Weg, Methode, Rumpf, keepalive, Sitzung) — der Handler bekommt nur, was der Browser schickte. */
const aufrufe = [];
let netzWeg = null;   // (pfad, methode) => "vorher" | "nachher" | null — Netz bricht vor bzw. nach dem Server ab
let anmeldeAntwort = null;   // Antwort auf /api/anmelden (Zugangswechsel ohne Neuladen)
let antwortErsetzen = null;  // (pfad, methode) => { status, daten } | null
let nachGet = null;          // einmalig nach dem nächsten GET /api/bestand ausgeführt
function fetchStub() {
  vi.stubGlobal("fetch", async (url, opt = {}) => {
    nr += 1;
    const methode = opt.method || "GET";
    if (url === "/api/anmelden") return new Response(JSON.stringify(anmeldeAntwort), { status: 200, headers: { "content-type": "application/json" } });
    const kopf = { ...(opt.headers || {}), host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.49.${Math.floor(nr / 250) % 250}.${nr % 250}` };
    aufrufe.push({ url, methode, rumpf: opt.body ? JSON.parse(opt.body) : null, keepalive: !!opt.keepalive, auth: kopf.authorization || null });
    const weg = netzWeg ? netzWeg(url, methode) : null;
    if (weg === "vorher") throw new TypeError("Failed to fetch");
    /* Antwort an Stelle des Servers (nur für Lagen, die der echte Server hier nicht erzeugt: 413 des Teilwegs,
       Fachbefund-409). Der Server wird dann nicht gefragt und schreibt nichts. */
    const ersatz = antwortErsetzen ? antwortErsetzen(url, methode) : null;
    if (ersatz) return new Response(JSON.stringify(ersatz.daten), { status: ersatz.status, headers: { "content-type": "application/json" } });
    const a = await daten(new Request(`http://${WIRT}${url}`, { method: methode, headers: kopf, ...(opt.body ? { body: opt.body } : {}) }), {});
    if (weg === "nachher") throw new TypeError("Failed to fetch");
    /* Rennen: ein Fremdschreiber direkt nach einer Leseantwort (zwischen frischem GET und Voll-PUT). */
    if (nachGet && methode === "GET" && url === "/api/bestand") { const f = nachGet; nachGet = null; await f(); }
    return a;
  });
}
/** Eine Oberfläche: eigene Modulinstanz von src/speicher.js mit eigener Sitzung, geladen wie App.jsx. */
async function oberflaeche(token, pid) {
  vi.resetModules();
  vi.stubGlobal("sessionStorage", speicherAttrappe({ "centric:token": token }));
  vi.stubGlobal("localStorage", speicherAttrappe());
  const SP = await import("../src/speicher.js");
  const g = await SP.lies();
  SP.teilwegUebernehmen(g.teilAntwort);
  const o = { SP, db: { ...g.bestand, session: { mandantId: "m1", personId: pid } }, g, lage: [], konflikt: [], fehler: [], lokal: [] };
  return o;
}
const optionen = (o) => ({ sofort: true, durch: "Pruefung", onKonflikt: (d) => o.konflikt.push(d), onFehler: (l) => o.fehler.push(l),
  onTeilLage: (z) => o.lage.push(z), onTeilLokal: (b) => { o.lokal.push(b); o.db = b; } });
async function fertig(SP) { for (let i = 0; i < 400 && SP.schreibenAusstehend() && !SP.teilwegLage()?.konflikte.length && SP.teilwegLage()?.phase !== "neuLaden"; i++) await new Promise((r) => setTimeout(r, 5)); }
const setze = (o, k, w) => { const m = o.db.mandanten[0]; const abw = { ...m.abweichungen }; if (w === null) delete abw[k]; else abw[k] = w;
  o.db = { ...o.db, mandanten: [{ ...m, abweichungen: abw }] }; };
const speichern = async (o) => { await o.SP.schreib(o.db, optionen(o)); await fertig(o.SP); };

/* Eigenes Zeitbudget je Fall (echter Handler, Dateiablage): unabhängig vom Aufruf (Skript 120 s, lokal oft 60 s). */
describe("B echter Client (src/speicher.js) gegen den echten Handler", { timeout: 120000 }, () => {
  beforeAll(async () => {
    wurzel = await mkdtemp(path.join(tmpdir(), "centric-wp48-5o-"));
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
  afterEach(() => { vi.unstubAllGlobals(); aufrufe.length = 0; netzWeg = null; anmeldeAntwort = null; antwortErsetzen = null; nachGet = null; });
  afterAll(async () => {
    delete process.env.CENTRIC_TEILSPEICHERUNG;
    if (wurzel) await rm(wurzel, { recursive: true, force: true });
  });

  it("Schalter aus: kein `teile`, kein Teilweg, der PUT trägt genau den heutigen Rumpf", async () => {
    delete process.env.CENTRIC_TEILSPEICHERUNG;
    fetchStub();
    const { raum, token } = await raumMit(["PL"]);
    const o = await oberflaeche(token.PL, "p1");
    expect(o.g.teilAntwort).toBeNull();
    expect(o.SP.teilwegAktiv()).toBe(false);
    const etag = (await B.bestandLesenStreng(laden(), raum)).stand;
    setze(o, `a1|${tag(20)}`, "N");
    aufrufe.length = 0;
    await speichern(o);
    expect(aufrufe.map((a) => `${a.methode} ${a.url}`)).toEqual(["PUT /api/bestand"]);
    /* Heutiger Rumpf (speicher.js vor WP-48.5): { bestand: ohne Serverfelder, Sitzung null; etag; durch } */
    expect(aufrufe[0].rumpf).toEqual(JSON.parse(JSON.stringify({ bestand: o.SP.ohneServerFelder({ ...o.db, session: null }), etag, durch: "Pruefung" })));
    expect(Object.keys(aufrufe[0].rumpf)).toEqual(["bestand", "etag", "durch"]);
    expect(aufrufe[0].keepalive).toBe(false);
    expect(o.SP.teilwegLage()).toBeNull();
    expect(o.SP.teilwegGenutzt()).toBe(false);
    expect(o.lage).toEqual([]);
    expect((await gespeichertM(raum)).abweichungen[`a1|${tag(20)}`]).toBe("N");
  });

  const FAELLE = { LT: ["l1", "zelle"], PL: ["p1", "zelle"], SV: ["s1", "zelle"], MA: ["m0", "wunsch"] };
  for (const [rolle, [pid, art]] of Object.entries(FAELLE)) {
    for (const wahl of ["fremd", "meins"]) {
      it(`${rolle}: Teil-POST statt PUT, Konflikt je ${art === "zelle" ? "Zelle" : "Kernfeld"} → Fenster, „${wahl}“, Rest geht hinaus`, async () => {
        process.env.CENTRIC_TEILSPEICHERUNG = "true";
        fetchStub();
        const { raum, token } = await raumMit([rolle, `${rolle}2`]);
        const a = await oberflaeche(token[rolle], pid);
        const b = await oberflaeche(token[`${rolle}2`], pid);
        expect(a.g.teilAntwort && b.g.teilAntwort).toBeTruthy();
        const k = `a1|${tag(20)}`;
        const aendern = (o, wer) => {
          if (art === "zelle") { setze(o, k, wer === "A" ? "N" : "-"); if (wer === "B") setze(o, `m0|${tag(23)}`, "N"); }
          else o.db = { ...o.db, mandanten: [{ ...o.db.mandanten[0], wuensche: [...(o.db.mandanten[0].wuensche || []),
            { id: `w${wer}`, personId: "m0", datum: tag(25 + (wer === "A" ? 0 : 1)), art: "frei" }] }] };
        };
        aendern(a, "A"); aendern(b, "B");
        aufrufe.length = 0;
        await speichern(a);
        expect(aufrufe.map((x) => `${x.methode} ${x.url}`)).toEqual(["POST /api/bestand/teile"]);
        expect(a.fehler).toEqual([]);
        const nachA = await gespeichertM(raum);
        await speichern(b);
        /* Kein Voll-Konfliktfenster, kein PUT: die Frage je Zelle/Feld. */
        expect(b.konflikt).toEqual([]);
        expect(aufrufe.some((x) => x.methode === "PUT")).toBe(false);
        expect(b.lage).toHaveLength(1);
        const fragen = b.lage[0].konflikte;
        expect(fragen.map((f) => f.id)).toEqual([art === "zelle" ? `z:abweichungen:${k}` : "k:wuensche"]);
        expect(await gespeichertM(raum)).toEqual(nachA);
        expect(b.SP.schreibenAusstehend()).toBe(true);   // offene Frage: nichts gilt als gespeichert
        /* Entscheiden wie im Fenster; speicher.js sendet selbst. */
        const neu = b.SP.teilEntscheidungAnwenden(Object.fromEntries(fragen.map((f) => [f.id, wahl])));
        expect(neu).toBeTruthy();
        b.db = neu;
        await fertig(b.SP);
        expect(b.fehler).toEqual([]);
        const g = await gespeichertM(raum);
        if (art === "zelle") {
          expect(g.abweichungen[k]).toBe(wahl === "fremd" ? "N" : "-");
          expect(g.abweichungen[`m0|${tag(23)}`]).toBe("N");   // nicht streitig, ging mit hinaus
        } else {
          const ids = (g.wuensche || []).map((w) => w.id).sort();
          expect(ids).toEqual(wahl === "fremd" ? ["wA"] : ["wB"]);
        }
        expect(aufrufe.some((x) => x.methode === "PUT")).toBe(false);
        expect(b.SP.schreibenAusstehend()).toBe(false);
        expect(T.deltaBilden(b.SP.teilwegLage(), b.db.mandanten[0])).toEqual({ leer: true });
      });
    }
  }

  it("Netz weg nach dem Senden, dann neue Sitzung ohne Neuladen: keine Sendung unter neuer Kennung, sondern GET, neu aufsetzen, Frage (ABA)", async () => {
    process.env.CENTRIC_TEILSPEICHERUNG = "true";
    fetchStub();
    const { raum, token } = await raumMit(["PL", "PL2", "LT"]);
    const o = await oberflaeche(token.PL, "p1");
    const k = `a1|${tag(20)}`;
    setze(o, k, "N");
    netzWeg = (url, m) => (m === "POST" && url === "/api/bestand/teile" ? "nachher" : null);
    await speichern(o);
    netzWeg = null;
    expect(o.fehler.map((l) => l.art)).toEqual(["netz"]);
    expect((await gespeichertM(raum)).abweichungen[k]).toBe("N");   // der Server hatte geschrieben
    expect(o.SP.teilwegLage().unklar).toEqual([`z:abweichungen:${k}`]);
    /* Jemand setzt zurück. */
    const lt = await oberflaeche(token.LT, "l1");
    setze(lt, k, "F");
    await speichern(lt);
    expect((await gespeichertM(raum)).abweichungen[k]).toBe("F");
    /* Dieselbe Oberfläche (Modulinstanz), neu angemeldet — wie NichtGespeichert „Anmelden und senden" (SP.anmelden) —,
       ohne vorher neu zu laden: nur der Zugang wechselt. Die Anmeldeantwort kommt aus der Attrappe (Anmelden ist
       hier nicht geprüft); alles Weitere läuft über den echten Handler mit der neuen Sitzung. */
    anmeldeAntwort = { token: token.PL2, name: "Haus", rolle: "planer", person: "p1", betrieb: 0 };
    await o.SP.anmelden("PRUEF-CODE", false);
    expect(o.SP.angemeldet()).toBe(true);
    setze(o, `a1|${tag(23)}`, "N");
    aufrufe.length = 0;
    await speichern(o);
    /* Kein POST unter neuer Kennung mit dem alten Erwartungswert: erst GET, dann die Frage. */
    expect(aufrufe.map((x) => `${x.methode} ${x.url}`)).toEqual(["GET /api/bestand"]);
    expect(o.lokal).toHaveLength(1);
    const z = o.SP.teilwegLage();
    expect(z.konflikte.map((f) => [f.k, f.meins, f.fremd])).toEqual([[k, "N", "F"]]);
    expect((await gespeichertM(raum)).abweichungen[k]).toBe("F");
    /* „fremd": die zweite Änderung geht hinaus, die streitige Zelle bleibt „F". */
    const neu = o.SP.teilEntscheidungAnwenden({ [z.konflikte[0].id]: "fremd" });
    o.db = neu;
    await fertig(o.SP);
    const g = await gespeichertM(raum);
    expect(g.abweichungen[k]).toBe("F");
    expect(g.abweichungen[`a1|${tag(23)}`]).toBe("N");
  });

  it("Rückfall voll (Feld ohne Version): Voll-PUT, danach Teilweg aus; Konfliktfenster ohne blindes Übernehmen gekennzeichnet", async () => {
    process.env.CENTRIC_TEILSPEICHERUNG = "true";
    fetchStub();
    const { raum, token } = await raumMit(["LT"]);
    const o = await oberflaeche(token.LT, "l1");
    /* Ein Kernfeld, das die Sicht nicht hat: Der Server liefert dafür keine Version → nicht darstellbar. */
    const m = o.db.mandanten[0];
    expect(Object.keys(o.g.teilAntwort.teile.versionen)).not.toContain("kern:notizen");
    expect(m.notizen).toBeUndefined();
    o.db = { ...o.db, mandanten: [{ ...m, notizen: [] }] };
    aufrufe.length = 0;
    await speichern(o);
    /* Erst frisch lesen, dann der Voll-PUT mit dessen ETag (Review #348 H1). */
    expect(aufrufe.map((x) => `${x.methode} ${x.url}`)).toEqual(["GET /api/bestand", "PUT /api/bestand"]);
    expect(Number(aufrufe[1].rumpf.etag)).toBe((await B.bestandLesenStreng(laden(), raum)).stand - 1);
    expect(o.fehler).toEqual([]);
    expect(o.SP.teilwegGenutzt()).toBe(true);
    expect(o.SP.teilwegAktiv()).toBe(false);   // Basis veraltet: Rest der Sitzung Voll-PUT
    setze(o, `a1|${tag(20)}`, "N");
    aufrufe.length = 0;
    await speichern(o);
    expect(aufrufe.map((x) => `${x.methode} ${x.url}`)).toEqual(["PUT /api/bestand"]);
    expect((await gespeichertM(raum)).abweichungen[`a1|${tag(20)}`]).toBe("N");
  });

  /* ---------------- Review #348 H1: Rückfall auf den Voll-PUT nach eigener Teilspeicherung ---------------- */
  const notizen = (o, n) => { const m = o.db.mandanten[0]; o.db = { ...o.db, mandanten: [{ ...m, notizen: n }] }; };
  const Z = (p, n) => `${p}|${tag(n)}`;

  it("P1: Zelle per Teilweg, dann Feld ohne Version + Zelle im selben Monat → Voll-PUT ohne 409 (keine Fremdbeteiligung)", async () => {
    process.env.CENTRIC_TEILSPEICHERUNG = "true";
    fetchStub();
    const { raum, token } = await raumMit(["LT"]);
    const o = await oberflaeche(token.LT, "l1");
    setze(o, Z("a1", 20), "N");
    await speichern(o);
    expect(aufrufe.at(-1).url).toBe("/api/bestand/teile");
    notizen(o, []); setze(o, Z("a1", 23), "N");
    aufrufe.length = 0;
    await speichern(o);
    expect(aufrufe.map((x) => `${x.methode} ${x.url}`)).toEqual(["GET /api/bestand", "PUT /api/bestand"]);
    expect(o.konflikt).toEqual([]);
    expect(o.fehler).toEqual([]);
    const g = await gespeichertM(raum);
    expect([g.abweichungen[Z("a1", 20)], g.abweichungen[Z("a1", 23)], g.notizen]).toEqual(["N", "N", []]);
  });

  it("P3: Kernfeld per Teilweg (Wünsche), dann Feld ohne Version → Voll-PUT ohne 409", async () => {
    process.env.CENTRIC_TEILSPEICHERUNG = "true";
    fetchStub();
    const { raum, token } = await raumMit(["LT"]);
    const o = await oberflaeche(token.LT, "l1");
    o.db = { ...o.db, mandanten: [{ ...o.db.mandanten[0], wuensche: [{ id: "w1", personId: "m0", datum: tag(25), art: "frei" }] }] };
    await speichern(o);
    expect(aufrufe.at(-1).url).toBe("/api/bestand/teile");
    notizen(o, []);
    aufrufe.length = 0;
    await speichern(o);
    expect(aufrufe.map((x) => `${x.methode} ${x.url}`)).toEqual(["GET /api/bestand", "PUT /api/bestand"]);
    expect(o.konflikt).toEqual([]);
    expect(o.fehler).toEqual([]);
    expect((await gespeichertM(raum)).wuensche.map((w) => w.id)).toEqual(["w1"]);
  });

  it("P4: fremde Änderung zwischen eigener Teilspeicherung und Rückfall bleibt erhalten; Streit wird zur Frage, nicht zum 409", async () => {
    process.env.CENTRIC_TEILSPEICHERUNG = "true";
    fetchStub();
    const { raum, token } = await raumMit(["LT", "PL"]);
    const o = await oberflaeche(token.LT, "l1");
    const pl = await oberflaeche(token.PL, "p1");
    setze(o, Z("a1", 20), "N"); await speichern(o);
    setze(pl, Z("s1", 20), "-"); setze(pl, Z("a1", 26), "-"); await speichern(pl);
    expect(pl.fehler).toEqual([]);
    /* O: Feld ohne Version, eigene Zelle im selben Monat und dieselbe Zelle wie PL (anderer Wert). */
    notizen(o, []); setze(o, Z("a1", 23), "N"); setze(o, Z("a1", 26), "N");
    aufrufe.length = 0;
    await speichern(o);
    expect(aufrufe.map((x) => x.methode)).toEqual(["GET"]);   // kein Voll-PUT vor der Entscheidung
    expect(o.konflikt).toEqual([]);
    const z = o.SP.teilwegLage();
    expect(z.konflikte.map((f) => [f.k, f.meins, f.fremd])).toEqual([[Z("a1", 26), "N", "-"]]);
    o.db = o.SP.teilEntscheidungAnwenden({ [z.konflikte[0].id]: "fremd" });
    await fertig(o.SP);
    expect(o.konflikt).toEqual([]);
    expect(o.fehler).toEqual([]);
    const g = await gespeichertM(raum);
    expect(g.abweichungen[Z("s1", 20)]).toBe("-");   // fremde Änderung erhalten
    expect(g.abweichungen[Z("a1", 26)]).toBe("-");   // „fremd“ gewählt
    expect([g.abweichungen[Z("a1", 20)], g.abweichungen[Z("a1", 23)], g.notizen]).toEqual(["N", "N", []]);
  });

  it("P4b: 409 des Voll-PUT (echte Fremdänderung, Teilweg schon aus) übernimmt keinen ETag; „Später“ + Eingabe überschreibt nichts", async () => {
    process.env.CENTRIC_TEILSPEICHERUNG = "true";
    fetchStub();
    const { raum, token } = await raumMit(["LT", "PL"]);
    const o = await oberflaeche(token.LT, "l1");
    const pl = await oberflaeche(token.PL, "p1");
    notizen(o, []); await speichern(o);                  // Rückfall gelungen → Rest der Sitzung Voll-PUT
    expect(o.SP.teilwegAktiv()).toBe(false);
    setze(pl, Z("s1", 20), "-"); await speichern(pl);    // fremd, selber Monat
    setze(o, Z("a1", 20), "N"); await speichern(o);
    expect(o.konflikt).toHaveLength(1);                   // echte Fremdänderung im selben Monat
    /* „Später entscheiden“, dann noch eine Eingabe im selben Monat. */
    setze(o, Z("a1", 23), "N");
    aufrufe.length = 0;
    await speichern(o);
    expect(aufrufe.filter((x) => x.methode === "PUT")).toEqual([]);
    expect(o.fehler.at(-1).art).toBe("vollGesperrt");
    expect((await gespeichertM(raum)).abweichungen[Z("s1", 20)]).toBe("-");   // nicht still auf „F“ zurückgesetzt
  });

  it("Ausnahmeweg (Art. 16/17) nach Teilspeicherung: erst frisch lesen, Voll-PUT ohne 409", async () => {
    process.env.CENTRIC_TEILSPEICHERUNG = "true";
    fetchStub();
    const { raum, token } = await raumMit(["LT"]);
    const o = await oberflaeche(token.LT, "l1");
    setze(o, Z("a1", 20), "N"); await speichern(o);
    /* Angabe, die diesen Stand nicht betrifft (erkennt → false): der Auftrag verlangt trotzdem den Voll-PUT. */
    o.SP.ausnahmeMitschicken("m1", { art: "pruefung" }, () => false);
    setze(o, Z("a1", 23), "N");
    aufrufe.length = 0;
    await speichern(o);
    expect(aufrufe.map((x) => `${x.methode} ${x.url}`)).toEqual(["GET /api/bestand", "PUT /api/bestand"]);
    expect(o.konflikt).toEqual([]);
    expect(o.fehler).toEqual([]);
    expect((await gespeichertM(raum)).abweichungen[Z("a1", 23)]).toBe("N");
  });

  /* ---------------- Delta-Review #348: Sperre aufheben, 413-Rückfall, Fachbefund-ETag ---------------- */
  it("Rennen: Fremdschreiber zwischen frischem GET und Voll-PUT → 409 und Sperre; das nächste Speichern liest frisch, hebt sie auf und speichert ohne Verlust", async () => {
    process.env.CENTRIC_TEILSPEICHERUNG = "true";
    fetchStub();
    const { raum, token } = await raumMit(["LT", "PL"]);
    const o = await oberflaeche(token.LT, "l1");
    const pl = await oberflaeche(token.PL, "p1");
    setze(o, Z("a1", 20), "N"); await speichern(o);
    notizen(o, []); setze(o, Z("a1", 23), "N");
    nachGet = async () => { setze(pl, Z("s1", 23), "-"); await speichern(pl); };
    await speichern(o);
    expect(o.konflikt).toHaveLength(1);                   // echtes Rennen, echte Fremdänderung im selben Monat
    expect((await gespeichertM(raum)).abweichungen[Z("s1", 23)]).toBe("-");
    const fehlerVorher = o.fehler.length;
    setze(o, Z("a1", 26), "N");
    aufrufe.length = 0;
    await speichern(o);
    expect(aufrufe.map((x) => `${x.methode} ${x.url}`)).toEqual(["GET /api/bestand", "PUT /api/bestand"]);
    expect(o.fehler.slice(fehlerVorher)).toEqual([]);
    const g = await gespeichertM(raum);
    expect(g.abweichungen[Z("s1", 23)]).toBe("-");   // fremd erhalten
    expect([g.abweichungen[Z("a1", 23)], g.abweichungen[Z("a1", 26)], g.notizen]).toEqual(["N", "N", []]);
  });

  it("Sperre nach 409 endet mit dem Übernehmen eines gelesenen Stands (teilwegUebernehmen); danach gelingt der Voll-PUT", async () => {
    process.env.CENTRIC_TEILSPEICHERUNG = "true";
    fetchStub();
    const { raum, token } = await raumMit(["LT", "PL"]);
    const o = await oberflaeche(token.LT, "l1");
    const pl = await oberflaeche(token.PL, "p1");
    notizen(o, []); await speichern(o);                  // Rückfall gelungen → Teilweg aus
    setze(pl, Z("s1", 20), "-"); await speichern(pl);
    setze(o, Z("a1", 20), "N"); await speichern(o);       // 409
    setze(o, Z("a1", 23), "N"); await speichern(o);       // gesperrt
    expect(o.fehler.at(-1).art).toBe("vollGesperrt");
    /* Die Oberfläche übernimmt einen gelesenen Stand (wie nach dem Stempeln); hier ohne Schalter: Voll-PUT direkt. */
    delete process.env.CENTRIC_TEILSPEICHERUNG;
    const g0 = await o.SP.lies();
    expect(g0.teilAntwort).toBeNull();
    expect(o.SP.teilwegUebernehmen(g0.teilAntwort)).toBe(true);
    o.db = { ...g0.bestand, session: o.db.session };
    setze(o, Z("a1", 23), "N");
    const fehlerVorher = o.fehler.length;
    aufrufe.length = 0;
    await speichern(o);
    expect(aufrufe.map((x) => `${x.methode} ${x.url}`)).toEqual(["PUT /api/bestand"]);
    expect(o.fehler.slice(fehlerVorher)).toEqual([]);
    const g = await gespeichertM(raum);
    expect([g.abweichungen[Z("s1", 20)], g.abweichungen[Z("a1", 23)]]).toEqual(["-", "N"]);
  });

  it("413 des Teilwegs nach eigener Teilspeicherung: erst frisch lesen, dann Voll-PUT mit frischem ETag (kein 409)", async () => {
    process.env.CENTRIC_TEILSPEICHERUNG = "true";
    fetchStub();
    const { raum, token } = await raumMit(["LT"]);
    const o = await oberflaeche(token.LT, "l1");
    setze(o, Z("a1", 20), "N"); await speichern(o);
    setze(o, Z("a1", 23), "N");
    antwortErsetzen = (u) => (u === "/api/bestand/teile" ? { status: 413, daten: { code: "TEILE_ZU_GROSS", text: "Zu viel auf einmal." } } : null);
    aufrufe.length = 0;
    await speichern(o);
    expect(aufrufe.map((x) => `${x.methode} ${x.url}`)).toEqual(["POST /api/bestand/teile", "GET /api/bestand", "PUT /api/bestand"]);
    expect(o.konflikt).toEqual([]);
    expect(o.fehler).toEqual([]);
    expect((await gespeichertM(raum)).abweichungen[Z("a1", 23)]).toBe("N");
  });

  it("Fachbefund-409 des Voll-PUT in einer Sitzung mit Teilweg: kein ETag aus der Antwort", async () => {
    process.env.CENTRIC_TEILSPEICHERUNG = "true";
    fetchStub();
    const { token } = await raumMit(["LT"]);
    const o = await oberflaeche(token.LT, "l1");
    notizen(o, []); await speichern(o);                  // Rückfall gelungen → Teilweg aus, Voll-PUT direkt
    const eigenerEtag = aufrufe.filter((x) => x.methode === "PUT").at(-1).rumpf.etag;
    setze(o, Z("a1", 20), "N");
    let einmal = true;
    antwortErsetzen = (u, m) => (m === "PUT" && einmal ? ((einmal = false), { status: 409, daten: { fehler: "Diese Änderung braucht eine Bestätigung.",
      fachbefunde: [{ personId: "a1", datum: tag(20), dienstId: "N", befunde: [] }], sammelVorschlag: [], etag: 999999 } }) : null);
    await speichern(o);
    expect(o.fehler.at(-1).art).toBe("bestaetigung");
    aufrufe.length = 0;
    await o.SP.nochmalSchreiben();
    const put = aufrufe.find((x) => x.methode === "PUT");
    expect(put.rumpf.etag).not.toBe(999999);
    expect(Number(put.rumpf.etag)).toBeGreaterThanOrEqual(Number(eigenerEtag));
  });

  it("keepalive beim Schließen: bei offener Frage geht nichts hinaus (B1)", async () => {
    process.env.CENTRIC_TEILSPEICHERUNG = "true";
    fetchStub();
    const { token } = await raumMit(["PL", "PL2"]);
    const a = await oberflaeche(token.PL, "p1");
    const b = await oberflaeche(token.PL2, "p1");
    const k = `a1|${tag(20)}`;
    setze(a, k, "N"); setze(b, k, "-");
    await speichern(a);
    await speichern(b);
    expect(b.lage).toHaveLength(1);
    setze(b, `a1|${tag(23)}`, "N");
    aufrufe.length = 0;
    /* Wie beforeunload/visibilitychange: schreib ohne sofort, dann das Schließen. */
    b.SP.schreib(b.db, { ...optionen(b), sofort: false });
    await b.SP.schreibenAbschliessen();
    expect(aufrufe).toEqual([]);
    expect(b.SP.schreibenAusstehend()).toBe(true);
  });
});

describe("C Quelltext-Verträge (Ergänzung)", () => {
  it("speicher.js: Teilweg nur hinter der Fähigkeit, PUT-Rumpf unverändert", async () => {
    const q = await readFile(new URL("../src/speicher.js", import.meta.url), "utf8");
    expect(q).toMatch(/body: JSON\.stringify\(\{ bestand: hinaus, etag, durch: auftrag\.durch \}\)/);
    expect(q).toMatch(/teilAntwort: !ausSpeicher && daten\.teile \?/);
  });
});
