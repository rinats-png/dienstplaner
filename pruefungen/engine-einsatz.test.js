/* ==========================================================================
   WP-I12a — Decision Engine, Rest: Einsatzprüfung und Ersatzsuche im Rechenkern, Near-Miss-Fakten

   Geprüft:
   E1  Verhaltensgleiche Extraktion: hindernisBefunde, ersatzVorschlaege, nachtJahr, verfuegbarFuer rechnen
       bit-gleich zur Fassung vor der Extraktion (Golden fixtures/engine-einsatz-golden.json, leerer Betrieb und
       drei Demobetriebe).
   E2  Eine Implementierung: fachlogik definiert die Funktionen nicht mehr, reicht dieselben Objekte weiter.
   E3  Der Kern liegt ohne src/ vor (Importregeln stehen in engine-rechenkern.test.js, hier der Ladetest) und
       rechnet auf dem Server ohne Regelregister (Haken: keine Regelkennung); der Client hängt sie ein.
   E4  Rangtabelle der Stufen gleich der der Oberfläche.
   E5  Near-Miss: Spielraum und Hinderung gegen eine unabhängige Rechnung (Dienstende/-beginn), Reihenfolge,
       Abgrenzung (nur Ruhezeit hindert), Rufbereitschaft, Grenze aus der Einstellung.
   E6  rechnen(): Option `ausfaelle`, Fakten mit person, ref (Dienstart), datum; ruhezeit.ist zu jedem
       Ruhezeitbefund (gleiche Zahl wie der Befundtext); Determinismus; keine Mutation.
   E7  Anschluss an das Faktenpaket: Dienst-Bezug nur als Alias, F3 erlaubt die Felder, keine Klarnamen;
       Gegenrechnung bestätigt und erkennt eine falsche Zahl.
   ========================================================================== */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { readFileSync } from "node:fs";
import { FEST, zufall, betriebe } from "./engine-golden.fixture.mjs";
import { messenEinsatz } from "./engine-einsatz.fixture.mjs";
import golden from "./fixtures/engine-einsatz-golden.json" with { type: "json" };
import * as K from "../server/lib/engine/rechenkern.mjs";
import { n1 } from "../server/lib/engine/textformat.mjs";
import * as Einsatz from "../server/lib/engine/einsatz.mjs";
import * as Ersatz from "../server/lib/engine/ersatzfakten.mjs";
import { faktenpaketBilden } from "../server/lib/intelligence/faktenpaket.mjs";
import { FUNKTIONEN } from "../server/lib/intelligence/positivliste.mjs";

vi.setConfig({ testTimeout: 280000 });
const lies = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const deepFreeze = (o) => { if (o && typeof o === "object" && !Object.isFrozen(o)) { Object.freeze(o); for (const k of Object.getOwnPropertyNames(o)) deepFreeze(o[k]); } return o; };

let F, B;
const demo = () => structuredClone(B.find(([n]) => n.startsWith("demo1"))[1]);
beforeAll(async () => {
  vi.useFakeTimers({ now: new Date(FEST), toFake: ["Date"] });
  vi.spyOn(Math, "random").mockImplementation(zufall(20261106));
  F = await import("../src/lib/fachlogik.js");
  B = betriebe(F);
}, 120000);
afterAll(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

const D = "2026-11-17";   // Dienstag; Vortag Montag 16.
/** Ein Betrieb, in dem sechs freie Personen am Vortag den Spätdienst (13:45–23:30) haben: Ruhe zum Frühdienst (06:00) = 6,5 h. */
function mitSpaetdienstAmVortag(m) {
  const fr = m.dienstarten.find((x) => x.id === "F"), sp = m.dienstarten.find((x) => x.id === "S");
  let n = 0;
  for (const p of m.personen) if (!F.personTag(m, p, D).dienstId && n < 6) { m.abweichungen[`${p.id}|2026-11-16`] = sp.id; n++; }
  return { m, fr, sp };
}

/* ------------------------------------------------------------------------ */
describe("E1/E2: verhaltensgleiche Extraktion (Golden aus der Fassung vor WP-I12a)", () => {
  it("hindernisBefunde, ersatzVorschlaege, nachtJahr, verfuegbarFuer: Betrieb für Betrieb bit-gleich", () => {
    for (const [name, m] of B) {
      const ist = messenEinsatz(F, m);
      expect(ist, name).toEqual(golden[name]);
    }
    expect(Object.keys(golden)).toEqual(B.map(([n]) => n));
  });
  it("das Golden ist nicht leer: viele Kandidaten, Befunde mit Regelkennung aus dem Register", () => {
    expect(golden["demo1-sicherheit"].ersatzVorschlaege.kandidaten).toBeGreaterThan(500);
    const m = demo();
    const bef = Object.values(m.personen).slice(0, 30).flatMap((p) => F.hindernisBefunde(m, p, D, m.dienstarten[0]));
    expect(bef.some((b) => typeof b.regelId === "string")).toBe(true);
  });
  it("eine Implementierung: fachlogik reicht dieselben Funktionen weiter und definiert sie nicht mehr", async () => {
    for (const n of ["hindernisBefunde", "ersatzVorschlaege", "nachtJahr", "wochenStundenGeplant", "verfuegbarFuer", "fensterVon", "einschr"]) {
      expect(F[n], n).toBe(Einsatz[n]);
      expect(lies("src/lib/fachlogik.js"), n).not.toMatch(new RegExp(`^(export )?(function|const) ${n}\\b`, "m"));
    }
    expect(F.FENSTER).toBe(Einsatz.FENSTER);
    expect(F.SCHUTZ_QUELLE_NEUTRAL).toBe(Einsatz.SCHUTZ_QUELLE_NEUTRAL);
    const datum = await import("../src/lib/datum.js");
    expect(datum.DOW).toEqual(["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"]);
  });
});

describe("E3/E4: Kern ohne src/, Haken für die Regelkennung, Stufenrang", () => {
  it("Server-Fassung ohne Haken: gleiche Befunde, aber keine Regelkennung des Registers (null)", () => {
    Einsatz.regelIdHakenSetzen(null);   // wie auf dem Server: kein Regelregister
    try {
      const m = demo();
      const mit = [], ohne = [];
      for (const p of m.personen.slice(0, 40)) for (const b of Einsatz.hindernisBefunde(m, p, D, m.dienstarten[0])) ohne.push(b);
      Einsatz.regelIdHakenSetzen((b) => `R:${b.art}`);
      for (const p of m.personen.slice(0, 40)) for (const b of Einsatz.hindernisBefunde(m, p, D, m.dienstarten[0])) mit.push(b);
      expect(ohne.length).toBe(mit.length);
      expect(ohne.every((b) => b.regelId === null || b.regelId === undefined)).toBe(true);
      expect(mit.some((b) => /^R:/.test(String(b.regelId)))).toBe(true);
      expect(ohne.map((b) => [b.stufe, b.text, b.regel, b.sperrt])).toEqual(mit.map((b) => [b.stufe, b.text, b.regel, b.sperrt]));
    } finally {
      /* Client-Haken wiederherstellen: fachlogik hängt ihn beim Laden ein; hier derselbe Aufruf. */
      import("../src/regelregister.js").then(({ regelIdFuerBefund }) => Einsatz.regelIdHakenSetzen(regelIdFuerBefund));
    }
  });
  it("die Rangtabelle der Stufen ist die der Oberfläche (src/warnstufen.js)", async () => {
    const W = await import("../src/warnstufen.js");
    for (const s of ["hinweis", "achtung", "recht", "unbekannt", undefined, null, ""]) expect(Einsatz.stufeRang(s), String(s)).toBe(W.stufeRang(s));
    /* Eigenschaften von Object zählen nicht als Stufe (die Oberfläche liest dort undefined). */
    expect(Einsatz.stufeRang("constructor")).toBe(1);
  });
});

/* ------------------------------------------------------------------------ */
describe("E5: Near-Miss — Spielraum und Hinderung", () => {
  it("Spielraum = Grenze − kürzeste Ruhe zu den Nachbardiensten, gegen eine unabhängige Rechnung", () => {
    const { m, fr, sp } = mitSpaetdienstAmVortag(demo());
    const e = Ersatz.ersatzKandidaten(m, D, "F");
    const [s, t] = [sp.ende.split(":"), fr.start.split(":")];
    const ruhe = (24 * 60 - (Number(s[0]) * 60 + Number(s[1]))) + (Number(t[0]) * 60 + Number(t[1]));   // 23:30 → 06:00 = 390
    expect(ruhe).toBe(390);
    expect(e.nahe.length).toBeGreaterThan(0);
    const mitVortag = e.nahe.filter((k) => m.abweichungen[`${k.personId}|2026-11-16`] === "S");
    expect(mitVortag.length).toBeGreaterThan(0);
    for (const k of mitVortag) {
      expect(k.hinderung).toBe("ruhezeitGesetz");
      expect(k.ruheVorMin).toBe(390);
      expect(k.spielraumMin).toBe(11 * 60 - 390);   // 270: so viel früher müsste der Spätdienst enden
    }
  });
  it("nur Ruhezeit hindert: Near-Miss und direkte Treffer sind getrennt, jede Person höchstens einmal, Obergrenze eingehalten", () => {
    const { m } = mitSpaetdienstAmVortag(demo());
    const e = Ersatz.ersatzKandidaten(m, D, "F");
    const ids = [...e.direkt, ...e.nahe].map((k) => k.personId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(e.direkt.length).toBeLessThanOrEqual(Ersatz.KANDIDATEN_MAX);
    expect(e.nahe.length).toBeLessThanOrEqual(Ersatz.KANDIDATEN_MAX);
    for (const k of e.nahe) {
      const p = m.personen.find((x) => String(x.id) === k.personId);
      const ernst = F.hindernisBefunde(m, p, D, m.dienstarten.find((x) => x.id === "F")).filter((b) => ["achtung", "recht"].includes(b.stufe));
      expect(ernst.length).toBeGreaterThan(0);
      expect(ernst.every((b) => Ersatz.RUHE_REGELN.includes(b.regel))).toBe(true);
    }
    for (const k of e.direkt) {
      const p = m.personen.find((x) => x.id === k.personId);
      expect(F.hindernisse(m, p, D, m.dienstarten.find((x) => x.id === "F"))).toEqual([]);
    }
  });
  it("Reihenfolge: kleinster Spielraum zuerst, bei gleichem Spielraum die bessere Eignung", () => {
    const { m } = mitSpaetdienstAmVortag(demo());
    const sp = m.dienstarten.find((x) => x.id === "S");
    /* Eine Person mit späterem Nachbardienst (Spielraum kleiner): Frühdienst am Folgetag davor. */
    const e0 = Ersatz.ersatzKandidaten(m, D, "F");
    const kleiner = e0.nahe.find((k) => k.spielraumMin === 270);
    m.abweichungen[`${kleiner.personId}|2026-11-16`] = "S";
    sp.ende = "22:30";   // alle Spätdienste enden eine Stunde früher: Spielraum aller 210
    const e = Ersatz.ersatzKandidaten(m, D, "F");
    for (let i = 1; i < e.nahe.length; i++) {
      const a = e.nahe[i - 1], b = e.nahe[i];
      expect(a.spielraumMin <= b.spielraumMin).toBe(true);
      if (a.spielraumMin === b.spielraumMin) expect(a.punkte >= b.punkte).toBe(true);
    }
    expect(e.nahe.filter((k) => m.abweichungen[`${k.personId}|2026-11-16`] === "S").every((k) => k.spielraumMin === 210)).toBe(true);
  });
  it("Grenze aus der Einstellung des Betriebs: 12 h statt 11 h gibt 60 Minuten mehr Spielraum, Befund bleibt „ruhezeitBetrieb“ oder -Gesetz je Stufe", () => {
    const { m } = mitSpaetdienstAmVortag(demo());
    const a = Ersatz.ersatzKandidaten(m, D, "F").nahe.find((k) => k.ruheVorMin === 390);
    m.einstellungen.ruhezeit = 12;
    const b = Ersatz.ersatzKandidaten(m, D, "F").nahe.find((k) => k.personId === a.personId);
    expect(b.spielraumMin).toBe(a.spielraumMin + 60);
    expect(["ruhezeitGesetz", "ruhezeitBetrieb"]).toContain(b.hinderung);
  });
  it("Rufbereitschaft braucht keine Ruhezeit und unterbricht keine: ruheZuNachbarn liefert nichts", () => {
    const { m } = mitSpaetdienstAmVortag(demo());
    const p = m.personen.find((x) => m.abweichungen[`${x.id}|2026-11-16`] === "S");
    const rb = m.dienstarten.find((x) => x.id === "RB");
    expect(Ersatz.ruheZuNachbarn(m, p, D, rb)).toEqual({ vor: null, kuerzeste: null });
    expect(Ersatz.ruheZuNachbarn(m, p, D, m.dienstarten.find((x) => x.id === "F"))).toEqual({ vor: 390, kuerzeste: 390 });
    expect(Ersatz.ruheZuNachbarn(m, p, D, null)).toEqual({ vor: null, kuerzeste: null });
  });
  it("unbekannte Dienstart: leere Antwort, kein Absturz; Mutation der Eingabe ausgeschlossen (tief eingefroren)", () => {
    const m = demo();
    expect(Ersatz.ersatzKandidaten(m, D, "gibtEsNicht")).toEqual({ datum: D, dienst: "gibtEsNicht", direkt: [], nahe: [], andere: 0 });
    const { m: m2 } = mitSpaetdienstAmVortag(demo());
    const k1 = Ersatz.ersatzKandidaten(m2, D, "F");
    const k2 = Ersatz.ersatzKandidaten(deepFreeze(structuredClone(m2)), D, "F");
    expect(k2).toEqual(k1);
  });
});

/* ------------------------------------------------------------------------ */
describe("E6: rechnen() mit Ausfällen", () => {
  const OPT = { zeitraum: { von: "2026-11-02", bis: "2026-11-30" }, heute: "2026-11-06", ausfaelle: [{ datum: D, dienst: "F" }] };

  it("Fakten kandidat.* und ruhezeit.ist mit person, ref = Dienstart, datum; Zahlen wie der Kandidatenrechner", () => {
    const { m } = mitSpaetdienstAmVortag(demo());
    const r = K.rechnen(m, OPT);
    const von = (feld) => r.fakten.filter((f) => f.feld === feld);
    expect(von("kandidat.zulaessig").length).toBeGreaterThan(0);
    for (const f of von("kandidat.zulaessig")) expect(f).toMatchObject({ wert: true, ref: "F", datum: D });
    const e = r.fakten.filter((f) => f.id.startsWith(`eng:ersatz:${D}:F:kandidat.spielraum:`));
    expect(e.length).toBeGreaterThan(0);
    for (const f of e) {
      expect(f.wert).toBeGreaterThan(0);
      const hind = r.fakten.find((x) => x.feld === "kandidat.hinderung" && x.person === f.person);
      expect(["ruhezeitGesetz", "ruhezeitBetrieb"]).toContain(hind.wert);
      expect(hind).toMatchObject({ ref: "F", datum: D });
    }
    const ruhe = r.fakten.find((f) => f.feld === "ruhezeit.ist" && f.datum === D && f.person && f.ref === "F" && f.id.startsWith("eng:ersatz:"));
    expect(ruhe.wert).toBe(390);
    expect(Object.isFrozen(r.fakten[0])).toBe(true);
    /* Ohne Ausfälle keine Kandidatenfakten (alles wie vorher). */
    const ohne = K.rechnen(m, { ...OPT, ausfaelle: undefined });
    expect(ohne.fakten.some((f) => f.feld.startsWith("kandidat."))).toBe(false);
  });
  it("ruhezeit.ist zu jedem Ruhezeitbefund: dieselbe Zahl wie der Befundtext", () => {
    const { m } = mitSpaetdienstAmVortag(demo());
    for (const p of m.personen) if (m.abweichungen[`${p.id}|2026-11-16`] === "S") m.abweichungen[`${p.id}|${D}`] = "F";   // Spät, dann Früh: 6,5 h
    const r = K.rechnen(m, { ...OPT, ausfaelle: [] });
    const bef = F.pruefen(m, OPT.zeitraum.von, OPT.zeitraum.bis).filter((b) => b.art === "ruhezeit");
    const fak = r.fakten.filter((f) => f.id.startsWith("eng:ruhezeit:"));
    expect(bef.length).toBeGreaterThan(0);
    expect(fak.length).toBeGreaterThan(0);
    for (const f of fak) {
      const b = bef.find((x) => String(x.personId) === f.person && x.datum === f.datum);
      expect(b, f.id).toBeTruthy();
      expect(b.text.startsWith(`${n1(f.wert / 60)} h`)).toBe(true);
    }
  });
  it("Determinismus, Faktenquelle mit Ausfällen und Eingabeprüfung", () => {
    const { m } = mitSpaetdienstAmVortag(demo());
    const sha = (x) => JSON.stringify(x);
    expect(sha(K.rechnen(m, OPT))).toBe(sha(K.rechnen(structuredClone(m), { ...OPT, ausfaelle: [{ ...OPT.ausfaelle[0] }] })));
    const aus = K.faktenquelleErzeugen({ heute: "2026-11-06", ausfaelle: OPT.ausfaelle })({ sicht: deepFreeze(structuredClone(m)), zeitraum: OPT.zeitraum });
    expect(aus.some((f) => f.feld === "kandidat.spielraum")).toBe(true);
    for (const x of aus) expect(Object.keys(x).every((k) => ["feld", "person", "ref", "wert", "datum"].includes(k))).toBe(true);
    expect(() => K.rechnen(m, { ...OPT, ausfaelle: [{ datum: "2026-12-30", dienst: "F" }] })).toThrow(/Ausfall/);
    expect(() => K.rechnen(m, { ...OPT, ausfaelle: [{ datum: D }] })).toThrow(/Ausfall/);
    expect(() => K.rechnen(m, { ...OPT, ausfaelle: "x" })).toThrow(/Ausfälle/);
    expect(() => K.rechnen(m, { ...OPT, ausfaelle: Array(6).fill({ datum: D, dienst: "F" }) })).toThrow(/Ausfälle/);
    expect(K.BERECHNETE_FELDER).toEqual(expect.arrayContaining(["kandidat.zulaessig", "kandidat.hinderung", "kandidat.spielraum", "ruhezeit.ist"]));
  });
});

/* ------------------------------------------------------------------------ */
describe("E7: Faktenpaket (F3) und Gegenrechnung", () => {
  const SCHLUESSEL = Buffer.from("5b0e9c1d7a3f48e26c1b9d0a4e7f3c2b8a6d1e9f0c3b7a5d2e8f1c4b6a9d0e3f", "hex");
  const VERSIONEN = { engine: K.ENGINE_VERSION, regelstand: "r-2026-11", tarifstand: "t-2026" };
  const bild = async (m, funktion = "F3") => {
    m.personen = m.personen.slice(0, 25);   // ein Faktenpaket hat höchstens FAKTEN_MAX Fakten
    const p = m.personen.find((x) => x.rolle === "leitung") || m.personen[0];
    return faktenpaketBilden({ sitzung: { rolle: "leitung", person: p.id, bestand: "raum-a", betrieb: 0 },
      ladeBestand: () => ({ version: 1, stand: 1, session: null, mandanten: [m] }), funktion,
      eingabe: { zeitraum: { von: "2026-11-16", bis: "2026-11-18" } }, kontext: "auftrag-1", aliasSchluessel: SCHLUESSEL, versionen: VERSIONEN,
      faktenquelle: K.faktenquelleErzeugen({ heute: "2026-11-06", ausfaelle: [{ datum: D, dienst: "F" }] }) });
  };
  it("F3 erlaubt die Kandidatenfelder; Person und Dienst nur als Alias, keine Klarnamen, keine Rohkennung des Dienstes", async () => {
    const { m } = mitSpaetdienstAmVortag(demo());
    const { paket } = await bild(m);
    const felder = new Set(paket.fakten.map((f) => f.feld));
    for (const f of ["kandidat.zulaessig", "kandidat.spielraum", "kandidat.hinderung"]) expect(FUNKTIONEN.F3.felder).toContain(f);
    expect(felder.has("kandidat.spielraum")).toBe(true);
    const kand = paket.fakten.filter((f) => f.feld.startsWith("kandidat."));
    for (const f of kand) {
      expect(f.alias).toMatch(/^P_/);
      expect(f.ref, JSON.stringify(f)).not.toBe("F");
      expect(String(f.ref)).toMatch(/^[A-Z]_/);
    }
    const klar = m.personen.slice(0, 40).flatMap((p) => [p.nachname, p.vorname]).filter((x) => x && x.length > 3);
    const text = JSON.stringify(paket);
    for (const k of klar) expect(text, k).not.toContain(k);
  });
  it("F11 (nicht F3) bekommt keine Kandidatenfakten: Positivliste schneidet", async () => {
    const { m } = mitSpaetdienstAmVortag(demo());
    const { paket } = await bild(m, "F11");
    expect(paket.fakten.some((f) => f.feld.startsWith("kandidat."))).toBe(false);
  });
  it("Gegenrechnung bestätigt die eigenen Kandidatenfakten und erkennt eine falsche Zahl", () => {
    const { m } = mitSpaetdienstAmVortag(demo());
    const opt = { zeitraum: { von: "2026-11-02", bis: "2026-11-30" }, heute: "2026-11-06", ausfaelle: [{ datum: D, dienst: "F" }] };
    const fakten = K.rechnen(m, opt).fakten;
    expect(K.gegenrechnen(m, fakten, opt)).toMatchObject({ ok: true, abweichungen: [] });
    const sp = fakten.find((f) => f.feld === "kandidat.spielraum");
    const falsch = K.gegenrechnen(m, [{ ...sp, wert: sp.wert + 1 }], opt);
    expect(falsch.ok).toBe(false);
    expect(falsch.abweichungen[0].grund).toMatch(/weicht ab/);
    const ohneAusfall = K.gegenrechnen(m, [sp], { ...opt, ausfaelle: [] });
    expect(ohneAusfall.ok).toBe(false);
  });
});
