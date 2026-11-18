/* ==========================================================================
   WP-48.6 SEGMENTPROPORTIONALE KETTE — Differenzialtest alt gegen neu

   docs/acc45/WP48-TEILSPEICHERUNG.md 2.8 / Paketplan WP-48.6: Stempel-,
   Abschluss- und Schrumpfprüfung kürzen dort ab, wo der Eintrag DASSELBE
   Objekt ist wie gespeichert; bestandSchreiben übernimmt Abdrücke
   unveränderter Scherben aus dem strengen Lesen; unveraenderteScherben
   zählt bei aktuellem Stand nur Kennungen; der Teilweg liest ohne
   Lesecache (kein zweites Lesen, keine Kopie). Harte Grenze: Ergebnisse
   (Fehlercodes, Abdrücke, Antworten, gespeicherter Stand) bit-identisch
   zum bisherigen Weg. Geprüft wird das hier gegen zwei Orakel:

   1. Wörtliche Kopie der alten Funktionen (pruefungen/hilfen/wp48-6-referenz.mjs:
      tagVon, monatVon, stempelWiderspruch, stempelSichern) gegen die neuen —
      Zufalls- und Grenzfälle mit festem Startwert, darunter gemeinsame
      Objekte (Abkürzung greift), kaputte Listenfelder, Selbstauskunft,
      Löschlauf, Fristen, Teilmengen unveränderter Monate.
   2. Schalter kette.mjs (KETTE.an = false ist der volle Weg, Zeile für Zeile
      der alte Code): abschlussWiderspruch; bestandSchreiben mit/ohne
      gelesene Abdrücke auf echter Dateiablage (Vermerk, Scherben, Antwort);
      und der echte Handler (Teil-PUT und Voll-PUT, Rollen LT/PL/SV/MA,
      feste und zufällige Deltas): Status, Antwort und gespeicherter Stand
      zweier gleicher Räume, einer mit, einer ohne Abkürzungen.

   Aufruf: npx vitest run pruefungen/wp48-6-kette.test.js
   ========================================================================== */
// zeit-ok: Der Handler rechnet mit dem Berliner Tag der echten Uhr (Sitzungen, Fristen); die Einheitsprüfungen nutzen den festen Tag HEUTE_FEST.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import * as REF from "./hilfen/wp48-6-referenz.mjs";
import { KETTE } from "../server/lib/kette.mjs";
import { stempelWiderspruch, stempelSichern, tagVonFuerPruefung } from "../server/lib/stempelintegritaet.mjs";
import { abschlussWiderspruch } from "../server/lib/monatsabschluss.mjs";
import { monatVon, zerlegen, abdruck, scherbenKennungen, gleicheEintraege } from "../server/lib/scherben.mjs";

const HEUTE_FEST = "2026-11-18";
const kopie = (x) => JSON.parse(JSON.stringify(x));
const text = (x) => JSON.stringify(x === undefined ? "__undefined__" : x);
/** Ergebnis oder Ausnahme — beide Fassungen müssen auch an denselben Stellen und mit derselben Meldung scheitern. */
const ergebnis = (fn) => { try { return text(fn()); } catch (e) { return `FEHLER ${e && e.constructor && e.constructor.name}: ${e && e.message}`; } };

/** Zufall mit festem Startwert (reproduzierbar). */
function zufall(start) {
  let z = start >>> 0;
  const r = () => { z = (z * 1664525 + 1013904223) >>> 0; return z / 2 ** 32; };
  return { r, wahl: (l) => l[Math.floor(r() * l.length)], ja: (p = 0.5) => r() < p, int: (n) => Math.floor(r() * n) };
}
function mitSchalter(an, fn) {
  const vorher = KETTE.an;
  KETTE.an = an;
  try { return fn(); } finally { KETTE.an = vorher; }
}
async function mitSchalterAsync(an, fn) {
  const vorher = KETTE.an;
  KETTE.an = an;
  try { return await fn(); } finally { KETTE.an = vorher; }
}

/* -------------------------------------------------------------------------- */
describe("tagVon / monatVon: neue Fassung = alte (Zufall + Grenzfälle)", () => {
  it("über 200 000 Schlüssel gleich", () => {
    const Z = zufall(0x486001);
    const zeichen = ["0", "1", "2", "9", "-", "|", "a", "\n", " ", "~", "٣"];
    const faelle = ["", "|", "||", "p|", "p|2026-11-18", "p|2026-11-18|", "p|2026-11-18|x", "p|2026-11-1", "p|2026-11-188",
      "p|2026-1-18", "2026-11-18", "|2026-11-18", "p||2026-11-18", "p|2026-11", "p|2026-1", "p|20261-1-18", "p|2026-11-18\n",
      "p|٢٠٢٦-11-18", "p|2026–11-18", "p|2026-11-18 ", "a|b|c", "p|9999-99-99", "p|0000-00-00x", "x|2026-11-18|2026-12-01"];
    for (let i = 0; i < 200000; i++) {
      const n = Z.int(16);
      let s = "";
      if (Z.ja(0.5)) {
        /* nah an der echten Form */
        s = `${Z.wahl(["p1", "", "a|b", "x"])}|${Z.int(10000).toString().padStart(Z.wahl([3, 4, 5]), "0")}-${Z.int(13)}`.replace(/-(\d)$/, Z.ja() ? "-0$1" : "-$1")
          + (Z.ja(0.8) ? `-${String(Z.int(40)).padStart(Z.wahl([1, 2, 3]), "0")}` : "") + (Z.ja(0.2) ? Z.wahl(["|", "|x", "x", "\n"]) : "");
      } else for (let j = 0; j < n; j++) s += Z.wahl(zeichen);
      faelle.push(s);
    }
    const abweichend = [];
    let gueltig = 0;
    for (const k of [...faelle, 123, null, undefined]) {
      if (tagVonFuerPruefung(k) !== REF.tagVonAlt(k) || monatVon(k) !== REF.monatVonAlt(k)) abweichend.push(String(k));
      if (REF.tagVonAlt(k)) gueltig++;
    }
    expect(abweichend.slice(0, 20)).toEqual([]);
    expect(gueltig).toBeGreaterThan(10000);       // auch gültige Tage kamen reichlich vor
  });
});

/* -------------------------------------------------------------------------- */
/* Zufällige Betriebspaare für die Stempel- und Abschlussprüfung. */
const PERSONEN = ["p1", "p2", "p3"];
const MONATE = ["2023-02", "2024-06", "2024-11", "2025-03", "2026-10", "2026-11"];
function schluessel(Z) {
  if (Z.ja(0.05)) return Z.wahl(["ohne", "p1|2026-13-99", "p1|2026-11-05|x", "p1||2026-11-05", "p1|2026-11", "__proto__|2026-11-02"]);
  return `${Z.wahl(PERSONEN)}|${Z.wahl(MONATE)}-${String(1 + Z.int(28)).padStart(2, "0")}`;
}
function stempelEintrag(Z) {
  if (Z.ja(0.04)) return Z.wahl([null, "kaputt", 7, []]);
  const e = { start: "06:00", startAm: "2026-11-01T05:00:00.000Z", ortStart: "innerhalb", ende: "14:00", endeAm: "2026-11-01T13:00:00.000Z" };
  if (Z.ja(0.3)) e.ortEnde = "aussen";
  if (Z.ja(0.5)) e.markierungen = Z.ja(0.08) ? "kaputt" : Z.wahl([[], ["UNGEPLANTER_DIENST"], ["A", "B"]]);
  if (Z.ja(0.3)) e.konfliktGrund = Z.wahl(["x", null, "y"]);
  if (Z.ja(0.4)) e.korrekturen = Z.ja(0.08) ? { kaputt: 1 } : Array.from({ length: Z.int(3) }, (_, i) => ({ id: `k${i}`,
    vorher: { start: "06:00", ende: "14:00", bestaetigt: true }, nachher: { start: "06:1" + i, ende: "14:00" } }));
  if (Z.ja(0.2)) e.antraege = Z.ja(0.08) ? "kaputt" : [{ id: "a1", von: "p1", gestellt: "x", vorschlag: {}, grund: "g", status: "offen" }];
  return e;
}
function istEintrag(Z) {
  if (Z.ja(0.04)) return Z.wahl([null, "kaputt"]);
  const e = { start: Z.wahl(["06:00", "06:10", "06:11"]), ende: "14:00", bestaetigt: Z.ja() };
  if (Z.ja(0.15)) e.selbstauskunft = { id: "s1", von: "p1", gestellt: "x", vorschlag: {}, grund: "g", wieGeplant: true, abweichung: null,
    status: Z.wahl(["offen", "genehmigt", "abgelehnt"]), entschieden: Z.wahl([null, { wer: "l1" }]) };
  return e;
}
function altBetrieb(Z) {
  const m = { id: Z.wahl(["m1", "m2"]), einstempeln: {}, erfassung: {}, istEingefroren: {} };
  if (Z.ja(0.3)) m.aufbewahrung = Z.wahl([{ planMonate: 24 }, { planMonate: 36, gruendeMonate: 6 }, { planMonate: "x" }, null]);
  for (let i = 0, n = Z.int(25); i < n; i++) m.einstempeln[schluessel(Z)] = stempelEintrag(Z);
  for (let i = 0, n = Z.int(25); i < n; i++) m.erfassung[schluessel(Z)] = istEintrag(Z);
  for (const k of Object.keys(m.einstempeln)) if (Z.ja(0.6)) m.erfassung[k] = istEintrag(Z);
  for (let i = 0, n = Z.int(6); i < n; i++) m.istEingefroren[schluessel(Z)] = { d: "F", std: 7.5 };
  if (Z.ja(0.7)) m.monatsabschluss = Object.fromEntries(MONATE.filter(() => Z.ja(0.4)).map((mon) => [mon, { abgeschlossen: Z.ja(0.9) }]));
  if (Z.ja(0.05)) m.einstempeln = Z.wahl([null, "kaputt"]);
  return m;
}
/** Eine Übermittlung zum gespeicherten Betrieb: dasselbe Objekt, gemeinsame Einträge, Kopien, Änderungen. */
function feldVariante(Z, alt, eintrag) {
  const w = Z.r();
  if (w < 0.25) return alt;                                    // dasselbe Objekt (Abkürzung)
  if (w < 0.3) return Z.wahl([undefined, null, "kaputt", {}]);
  if (!alt || typeof alt !== "object" || Array.isArray(alt)) return Z.ja() ? alt : {};
  const aus = {};
  for (const [k, v] of Object.entries(alt)) {
    const x = Z.r();
    if (x < 0.55) aus[k] = v;                                  // derselbe Eintrag
    else if (x < 0.75) aus[k] = v === undefined ? v : kopie(v);
    else if (x < 0.82) continue;                               // weggelassen
    else if (x < 0.86) aus[k] = null;
    else if (x < 0.95 && v && typeof v === "object" && !Array.isArray(v)) {
      const c = kopie(v);
      const f = Z.wahl(Object.keys(c).concat(["neu"]));
      if (Z.ja(0.3)) delete c[f]; else c[f] = Z.wahl(["07:00", null, [], ["A"], { x: 1 }]);
      aus[k] = c;
    } else aus[k] = eintrag(Z);
  }
  for (let i = 0, n = Z.int(3); i < n; i++) aus[schluessel(Z)] = eintrag(Z);
  return aus;
}
function gesendetBetrieb(Z, altM) {
  if (!altM || Z.ja(0.03)) return Z.wahl([null, "kaputt", { id: "neu" }]);
  const g = { ...altM };
  for (const [feld, eintrag] of [["einstempeln", stempelEintrag], ["erfassung", istEintrag], ["istEingefroren", () => ({ d: "N" })]]) {
    if (Z.ja(0.08)) { delete g[feld]; continue; }
    g[feld] = feldVariante(Z, altM[feld], eintrag);
  }
  return g;
}
function optionen(Z, altM) {
  const o = {};
  if (Z.ja(0.6)) o.loeschlauf = true;
  if (Z.ja(0.6)) o.vollSicht = true;
  if (Z.ja(0.85)) o.heute = HEUTE_FEST;
  if (Z.ja(0.7)) o.unveraendert = new Set(MONATE.filter(() => Z.ja(0.6)).map((mon) => `${altM && altM.id}::${mon}`));
  return o;
}

describe("Stempel-Integrität: neue Fassung = wörtliche alte Fassung", () => {
  it("stempelWiderspruch und stempelSichern über 6 000 Zufallsfälle gleich (Ergebnis, Grund, Schlüssel, Reihenfolge)", () => {
    const Z = zufall(0x486002);
    let abgekuerzt = 0, abgewiesen = 0;
    for (let i = 0; i < 6000; i++) {
      const altM = Z.ja(0.03) ? null : altBetrieb(Z);
      const neuM = gesendetBetrieb(Z, altM);
      const o = optionen(Z, altM);
      const neu = ergebnis(() => stempelWiderspruch(altM, neuM, o));
      const alt = ergebnis(() => REF.stempelWiderspruch(altM, neuM, o));
      expect(neu, `Fall ${i}`).toBe(alt);
      if (alt.startsWith("{")) abgewiesen++;
      if (altM && neuM && neuM.einstempeln === altM.einstempeln) abgekuerzt++;
      /* stempelSichern: Ziel ist die Übermittlung (wie nach zusammenfuehren), gesendet dieselbe oder eine andere. */
      const ziel = Z.ja(0.7) ? neuM : gesendetBetrieb(Z, altM);
      const sNeu = ergebnis(() => stempelSichern(altM, neuM, ziel, o));
      const sAlt = ergebnis(() => REF.stempelSichern(altM, neuM, ziel, o));
      expect(sNeu, `Sichern ${i}`).toBe(sAlt);
    }
    /* Die Abkürzung wurde tatsächlich geprüft, und beide Ausgänge kamen vor. */
    expect(abgekuerzt).toBeGreaterThan(500);
    expect(abgewiesen).toBeGreaterThan(500);
    expect(6000 - abgewiesen).toBeGreaterThan(500);
  });

  it("Grenzfälle: dasselbe Objekt mit kaputtem Listenfeld wird weiter abgewiesen; Selbstauskunft offen mit Entscheidung ebenso", () => {
    for (const kaputt of [{ korrekturen: { x: 1 } }, { antraege: "x" }, { markierungen: "x" }]) {
      const e = { start: "06:00", ende: "14:00", ...kaputt };
      const altM = { id: "m1", einstempeln: { "p1|2026-11-02": e }, erfassung: {} };
      const neuM = { id: "m1", einstempeln: { "p1|2026-11-02": e }, erfassung: {} };
      const neu = stempelWiderspruch(altM, neuM, { vollSicht: true });
      expect(neu).not.toBe(null);
      expect(text(neu)).toBe(text(REF.stempelWiderspruch(altM, neuM, { vollSicht: true })));
    }
    const sa = { start: "06:00", ende: "14:00", bestaetigt: true, selbstauskunft: { id: "s", status: "offen", entschieden: { wer: "x" } } };
    const altM = { id: "m1", einstempeln: {}, erfassung: { "p1|2026-11-02": sa } };
    const neuM = { id: "m1", einstempeln: {}, erfassung: altM.erfassung };
    expect(stempelWiderspruch(altM, neuM, {})).not.toBe(null);
    expect(text(stempelWiderspruch(altM, neuM, {}))).toBe(text(REF.stempelWiderspruch(altM, neuM, {})));
    /* Ein gespeicherter null-Stempel, unverändert zurück: weiter „lässt sich nicht löschen" (keine Abkürzung). */
    const altN = { id: "m1", einstempeln: { "p1|2026-11-02": null }, erfassung: {} };
    expect(text(stempelWiderspruch(altN, { ...altN }, {}))).toBe(text(REF.stempelWiderspruch(altN, { ...altN }, {})));
    expect(stempelWiderspruch(altN, { ...altN }, {})).not.toBe(null);
  });
});

describe("Monatsabschluss: abschlussWiderspruch mit Abkürzung = ohne (voller Weg)", () => {
  it("über 6 000 Zufallsfälle gleich", () => {
    const Z = zufall(0x486003);
    let treffer = 0;
    for (let i = 0; i < 6000; i++) {
      const altM = Z.ja(0.03) ? null : altBetrieb(Z);
      const neuM = gesendetBetrieb(Z, altM);
      const o = optionen(Z, altM);
      const an = mitSchalter(true, () => ergebnis(() => abschlussWiderspruch(altM, neuM, o)));
      const aus = mitSchalter(false, () => ergebnis(() => abschlussWiderspruch(altM, neuM, o)));
      expect(an, `Fall ${i}`).toBe(aus);
      if (aus.startsWith("{")) treffer++;
    }
    expect(treffer).toBeGreaterThan(300);
  });
});

/* -------------------------------------------------------------------------- */
describe("Scherben: Kennungen und Abdruckgleichheit", () => {
  it("scherbenKennungen = Kennungen von zerlegen; gleicheEintraege ⇒ derselbe Abdruck", () => {
    const Z = zufall(0x486004);
    for (let i = 0; i < 1500; i++) {
      const m = altBetrieb(Z);
      const b = { mandanten: [m, Z.ja(0.3) ? { ...altBetrieb(Z), id: m.id } : altBetrieb(Z), null, "x"] };
      if (Z.ja(0.1)) m.abweichungen = { [schluessel(Z)]: "F", "ohne-datum": "N" };
      expect([...scherbenKennungen(b)].sort()).toEqual([...zerlegen(b).scherben.keys()].sort());
      /* Eine zweite Zerlegung mit teils denselben, teils kopierten oder geänderten Einträgen. */
      const b2 = { mandanten: b.mandanten.map((x) => (x && typeof x === "object" ? gesendetBetrieb(Z, x) : x)) };
      const z1 = zerlegen(b), z2 = zerlegen(b2);
      for (const [id, s2] of z2.scherben) {
        const s1 = z1.scherben.get(id);
        if (s1 && gleicheEintraege(s2, s1)) expect(abdruck(s2)).toBe(abdruck(s1));
      }
      for (const [, s1] of z1.scherben) expect(gleicheEintraege(s1, s1)).toBe(true);
    }
  });
});

/* -------------------------------------------------------------------------- */
const WIRT = "127.0.0.1:3000";
let wurzel, laden, daten, B, G, sitzungAnlegen, Zt, HEUTE, tag;

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-wp48-6-kette-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
  process.env.CENTRIC_TEILSPEICHERUNG = "true";
  const schutz = await import("../server/lib/schutz.mjs");
  for (const art of Object.keys(schutz.GRENZEN)) schutz.GRENZEN[art] = { ...schutz.GRENZEN[art], versuche: 100000 };
  const { getStore } = await import("../server/lib/ablage.mjs");
  laden = () => getStore({ name: "centric", consistency: "strong" });
  daten = (await import("../server/funktionen/daten.mjs")).default;
  B = await import("../server/lib/bestand.mjs");
  G = await import("../server/lib/gestalt.mjs");
  ({ sitzungAnlegen } = await import("../server/lib/sitzungen.mjs"));
  Zt = await import("../server/lib/zeiterfassung.mjs");
  HEUTE = Zt.heuteBerlin();
  tag = (n) => Zt.tagePlus(HEUTE, n);
});
afterAll(async () => {
  delete process.env.CENTRIC_TEILSPEICHERUNG;
  KETTE.an = true;
  if (wurzel) await rm(wurzel, { recursive: true, force: true });
});

/** Zeitpunkte, Epochen und Raumnamen maskiert — sie entstehen beim Schreiben bzw. sind je Raum verschieden. */
const maske = (x, raum) => JSON.parse(JSON.stringify(x === undefined ? null : x)
  .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z/g, "ZEIT")
  .replace(/\d{2}\.\d{2}\.\d{4}, \d{2}:\d{2}(:\d{2})?/g, "ZEIT")
  .replace(/"epoche":"[0-9a-f]{8,64}"/g, "\"epoche\":\"E\"")
  .split(raum).join("RAUM"));

/** Alles, was ein Schreibvorgang auf der Platte hinterlässt: Kern (mit Stand), Scherben, Vermerke, Zeiger, Sicherungen. */
async function platte(raum) {
  const s = laden();
  const aus = {};
  for (const praefix of [`kern:${raum}`, `scherbe:${raum}:`, `stand:${raum}:`]) {
    const { blobs } = await s.list({ prefix: praefix });
    for (const b of blobs) {
      if (praefix.startsWith("kern") && b.key !== `kern:${raum}`) continue;
      const g = await s.getWithMetadata(b.key, { type: "json" });
      const meta = { ...(g.metadata || {}) };
      aus[b.key.split(raum).join("RAUM")] = maske({ wert: g.data, meta: { stand: meta.stand ?? null, durch: meta.durch ?? null } }, raum);
    }
  }
  const { blobs: sich } = await s.list({ prefix: `sicherung:${raum}:` });
  aus.sicherungen = sich.length;
  return aus;
}

describe("bestandSchreiben: Abdrücke aus dem Lesen = alles gerechnet (echte Dateiablage)", { timeout: 300000 }, () => {
  it("Zufallsfolgen mit gemeinsamen, kopierten, geänderten, verschobenen und gelöschten Einträgen", async () => {
    const Z = zufall(0x486005);
    for (let lauf = 0; lauf < 6; lauf++) {
      const raeume = [`wp486-schreiben-a-${lauf}`, `wp486-schreiben-b-${lauf}`];
      const start = { version: 9, mandanten: [{ id: "m1", name: "Haus", personen: [], abweichungen: {}, erfassung: {}, einstempeln: {} },
        { id: "m2", name: "Zwei", personen: [], abweichungen: {}, erfassung: {}, einstempeln: {} }] };
      for (const m of start.mandanten) for (let i = 0; i < 300; i++) {
        m[Z.wahl(["abweichungen", "erfassung", "einstempeln"])][schluessel(Z)] = Z.ja(0.5) ? Z.wahl(["F", "N", "S"]) : istEintrag(Z);
      }
      for (const raum of raeume) await B.bestandSchreiben(laden(), raum, kopie(start), { durch: "Pruefung" });
      for (let schritt = 0; schritt < 8; schritt++) {
        const plan = { veraltet: Z.ja(0.25), seed: Z.int(1e9) };
        const ergebnisse = [];
        for (const [i, raum] of raeume.entries()) {
          const an = i === 0;
          ergebnisse.push(await mitSchalterAsync(an, () => B.unterRaumsperre(raum, async () => {
            const g = await B.bestandLesenStreng(laden(), raum, { segmente: true, merken: false });
            const Zs = zufall(plan.seed);
            const neu = { ...g.bestand, mandanten: g.bestand.mandanten.map((m) => {
              const x = { ...m };
              for (const feld of ["abweichungen", "erfassung", "einstempeln"]) {
                if (Zs.ja(0.3)) continue;                                     // Feld unverändert (dasselbe Objekt)
                const w = { ...(m[feld] || {}) };
                for (const k of Object.keys(w)) {
                  const r = Zs.r();
                  if (r < 0.01) delete w[k];
                  else if (r < 0.02) w[k] = kopie(w[k]);                      // gleicher Inhalt, anderes Objekt
                  else if (r < 0.025) w[k] = Zs.ja() ? "F" : istEintrag(Zs);
                }
                if (Zs.ja(0.3)) w[schluessel(Zs)] = "N";
                x[feld] = w;
              }
              if (Zs.ja(0.1)) x.name = `Haus ${Zs.int(9)}`;
              return x;
            }) };
            const erwartet = plan.veraltet ? String(Math.max(1, Number(g.stand) - 1)) : g.stand;
            const e = await B.bestandSchreiben(laden(), raum, neu, { erwarteterStand: erwartet, durch: "Pruefung", gelesen: g });
            return { ...e, bestand: e.bestand ? maske(e.bestand, raum) : undefined, epoche: undefined, zeit: undefined };
          })));
        }
        expect(maske(ergebnisse[0], raeume[0]), `Lauf ${lauf}, Schritt ${schritt}`).toEqual(maske(ergebnisse[1], raeume[1]));
        expect(await platte(raeume[0]), `Lauf ${lauf}, Schritt ${schritt}: Platte`).toEqual(await platte(raeume[1]));
      }
    }
  });
});

/* -------------------------------------------------------------------------- */
let nr = 0;
async function anfrage(pfad, { methode = "GET", rumpf, token } = {}) {
  nr += 1;
  const kopf = { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.86.${Math.floor(nr / 250) % 250}.${nr % 250}` };
  if (methode !== "GET") kopf["content-type"] = "application/json";
  if (token) kopf.authorization = `Bearer ${token}`;
  const a = await daten(new Request(`http://${WIRT}${pfad}`, { method: methode, headers: kopf,
    ...(methode === "GET" ? {} : { body: JSON.stringify(rumpf || {}) }) }), {});
  let d = {}; try { d = await a.json(); } catch { /* leer */ }
  return { status: a.status, ...d };
}
const ROLLEN = {
  LT: { rolle: "leitung", person: "l1" },
  PL: { rolle: "planer", person: "p1" },
  SV: { rolle: "subplaner", person: "s1", einheit: "e1" },
  MA: { rolle: "mitarbeiter", person: "m0" },
};
const person = (id, rolle, einheit, extra = {}) => ({ id, vorname: "V", nachname: `N${id}`, rolle, bereich: einheit,
  status: "aktiv", geburtstag: "1980-01-01", qualifikationen: [], zugehoerigkeit: [{ ab: "2020-01-01", einheitId: einheit }],
  telefon: "0", email: `${id}@example.org`, ...extra });
function pruefbetrieb() {
  const plan = {}; const ist = {}; const stempel = {};
  for (const pid of ["m0", "a1", "b1", "s1"]) {
    for (const n of [-70, -40, -35, -3, -1, 0, 2, 20, 40]) plan[`${pid}|${tag(n)}`] = n % 2 ? "F" : "N";
    for (const n of [-70, -40, -3, -1]) {
      ist[`${pid}|${tag(n)}`] = { start: "06:00", ende: "14:05", bestaetigt: true, grund: "" };
      stempel[`${pid}|${tag(n)}`] = { start: "05:58", ende: "14:05", quelle: "app", markierungen: [] };
    }
  }
  return { version: 9, stand: 1, mandanten: [{
    id: "m1", name: "Haus", branche: "pflege", bundesland: "BE", einheitLabel: "Wohnbereich", status: "aktiv",
    stichtag: null, laeuftAb: null, pakete: [], matrix: null,
    einheiten: [{ id: "e1", name: "WB 1", versatzTage: 0 }, { id: "e2", name: "WB 2", versatzTage: 0 }],
    dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00", pause: 30 },
      { id: "N", name: "Nacht", start: "22:00", ende: "06:00", pause: 30 }],
    zyklus: ["F", "F", "N", "N", "-", "-"], anker: "2026-01-05", zyklusLaenge: 6, gruppen: [], versatzTageVon: {},
    zuschlaege: [], einstellungen: { ruhezeit: 11, maxFolge: 6 }, rollennamen: {}, briefing: [], aufgaben: [],
    qualifikationen: [], genehmigungsstufen: [], tarifwerk: null, version: 9, stand: 1,
    personen: [person("m0", "mitarbeiter", "e1"), person("a1", "mitarbeiter", "e1"), person("b1", "mitarbeiter", "e2"),
      person("s1", "subplaner", "e1"), person("p1", "planer", "ALLE"), person("l1", "leitung", "ALLE")],
    abweichungen: plan, planstaende: {}, freigaben: {}, unterschreitungen: [], belegung: {}, therapie: {}, aushang: [],
    monatsabschluss: { [tag(-40).slice(0, 7)]: { abgeschlossen: true, am: "2026-01-02T08:00:00.000Z", wer: "l1",
      verlauf: [{ id: "v1", art: "abschluss", am: "2026-01-02T08:00:00.000Z", wer: "l1", grund: "" }] } },
    istEingefroren: { [`m0|${tag(-40)}`]: { d: "F", std: 7.5, e: 1 } },
    standorte: [], abwesenheiten: [], krankmeldungen: [], anfragen: [], wuensche: [], einspruenge: [], ausschreibungen: [],
    selbstplanung: [], nachrichten: [], notrufe: [], erfassung: ist, einstempeln: stempel, fahrzeiten: {}, checks: {},
    ansichten: {}, kompetenzen: [], einarbeitung: [], aenderungen: [], bestaetigungen: [], dienstbuch: [], uebergaben: [],
    protokoll: [], notizen: {}, tagesnotizen: {}, tarif: "basis", seit: "2026-01-01", preisgestaltung: {}, kontakt: "k@example.org",
  }] };
}

/** Feste Änderungen je Weg: Plan, Ist (gestempelt, abgeschlossen), Stempel fälschen/löschen, Schrumpfen, veralteter Stand. */
function aenderungen(k) {
  const selbst = ROLLEN[k].person;
  const ist = { start: "06:00", ende: "14:00", bestaetigt: false, grund: "" };
  return [
    ["Plan eigene Person", { zellen: [{ feld: "abweichungen", k: `${selbst}|${tag(21)}`, neu: "F" }] }],
    ["Plan a1 zwei Monate", { zellen: [{ feld: "abweichungen", k: `a1|${tag(22)}`, neu: "N" }, { feld: "abweichungen", k: `a1|${tag(55)}`, neu: "F" }] }],
    ["Plan b1 löschen", { zellen: [{ feld: "abweichungen", k: `b1|${tag(20)}`, neu: null }] }],
    ["Ist neu ungestempelt", { zellen: [{ feld: "erfassung", k: `${selbst}|${tag(-2)}`, neu: ist }] }],
    ["Ist gestempelter Tag ändern", { zellen: [{ feld: "erfassung", k: `a1|${tag(-3)}`, neu: { ...ist, start: "07:00" } }] }],
    ["Ist gestempelter Tag löschen", { zellen: [{ feld: "erfassung", k: `m0|${tag(-1)}`, neu: null }] }],
    ["Ist im abgeschlossenen Monat", { zellen: [{ feld: "erfassung", k: `a1|${tag(-40)}`, neu: ist }] }],
    ["Kern einstellungen", { kern: { einstellungen: (w) => ({ ...(w || {}), ruhezeit: 12 }) } }],
    ["Voll: Stempel fälschen", { voll: (m) => { m.einstempeln[`a1|${tag(-3)}`] = { ...m.einstempeln[`a1|${tag(-3)}`], start: "04:00" }; } }],
    ["Voll: Stempel weglassen", { voll: (m) => { delete m.einstempeln[`b1|${tag(-1)}`]; } }],
    ["Voll: Stempel im abgeschlossenen Monat weglassen", { voll: (m) => { delete m.einstempeln[`a1|${tag(-40)}`]; delete m.erfassung[`a1|${tag(-40)}`]; } }],
    ["Voll: eingefrorenes Ist ändern", { voll: (m) => { m.istEingefroren = { ...(m.istEingefroren || {}), [`m0|${tag(-40)}`]: { d: "N", std: 1, e: 1 } }; } }],
    ["Voll: viel Plan löschen (Schrumpfen)", { voll: (m) => { m.abweichungen = {}; } }],
    ["Voll: veralteter Stand", { voll: (m) => { m.abweichungen[`a1|${tag(23)}`] = "F"; }, veraltet: true }],
  ];
}
function zufaelligeAenderungen(k, anzahl) {
  const Z = zufall(0x486006 + k.charCodeAt(0) * 7 + k.charCodeAt(1));
  const aus = [];
  for (let i = 0; i < anzahl; i++) {
    const zellen = []; const gesehen = new Set();
    for (let j = 0, n = 1 + Z.int(3); j < n; j++) {
      const pid = Z.wahl(["m0", "a1", "b1", "s1", "l1"]);
      const feld = Z.ja(0.7) ? "abweichungen" : "erfassung";
      const d = feld === "abweichungen" ? Z.wahl([2, 3, 20, 21, 33, 40, -35]) : Z.wahl([-1, -2, -3, -4, -40, -70]);
      const key = `${pid}|${tag(d)}`;
      if (gesehen.has(feld + key)) continue;
      gesehen.add(feld + key);
      zellen.push({ feld, k: key, neu: feld === "abweichungen" ? Z.wahl(["F", "N", null]) : Z.wahl([null, { start: "06:00", ende: "14:00", bestaetigt: false, grund: "" }]) });
    }
    aus.push([`Zufall ${i + 1}`, { zellen, alsVoll: Z.ja(0.4) }]);
  }
  return aus;
}

async function raumPaar(nrPaar) {
  const paar = [];
  for (const seite of ["neu", "alt"]) {
    const raum = `wp486-kette-${seite}-${nrPaar}`;
    await B.bestandSchreiben(laden(), raum, G.personenAngleichen(G.uebergabenAngleichen(pruefbetrieb())), { durch: "Pruefung" });
    const token = {};
    for (const [k, r] of Object.entries(ROLLEN)) {
      token[k] = (await sitzungAnlegen({ bestand: raum, name: `V N${r.person}`, rolle: r.rolle, person: r.person, betrieb: 0,
        mandantId: "m1", einheit: r.einheit || null }, 2 * 3600 * 1000)).token;
    }
    paar.push({ raum, token, an: seite === "neu" });
  }
  return paar;
}

/** Eine Änderung auf einer Seite ausführen: Teil-PUT (Δ) oder Voll-PUT (GET-Sicht ⊕ Δ bzw. Eingriff). */
async function ausfuehren(seite, k, besch) {
  return mitSchalterAsync(seite.an, async () => {
    const token = seite.token[k];
    const g = await anfrage("/api/bestand", { token });
    const m = g.bestand.mandanten.find((x) => x.id === "m1");
    if (besch.voll || besch.alsVoll || !g.teile) {
      const b = kopie(g.bestand);
      const mb = b.mandanten.find((x) => x.id === "m1");
      for (const [feld, fn] of Object.entries(besch.kern || {})) mb[feld] = fn(kopie(mb[feld]));
      for (const z of besch.zellen || []) {
        mb[z.feld] = { ...(mb[z.feld] || {}) };
        if (z.neu === null) delete mb[z.feld][z.k]; else mb[z.feld][z.k] = z.neu;
      }
      if (besch.voll) besch.voll(mb);
      const etag = besch.veraltet ? String(Math.max(1, Number(g.etag) - 1)) : g.etag;
      return anfrage("/api/bestand", { methode: "PUT", token, rumpf: { bestand: b, etag, durch: "Pruefung" } });
    }
    const kern = {};
    for (const [feld, fn] of Object.entries(besch.kern || {}))
      kern[feld] = { basis: g.teile.versionen[`kern:${feld}`], wert: fn(kopie(m[feld])) };
    const zellen = (besch.zellen || []).map((z) => ({ feld: z.feld, k: z.k,
      alt: Object.prototype.hasOwnProperty.call(m[z.feld] || {}, z.k) ? m[z.feld][z.k] : null, neu: z.neu }));
    return anfrage("/api/bestand/teile", { methode: "POST", token, rumpf: { format: 1, epoche: g.teile.epoche, durch: "Pruefung",
      ...(Object.keys(kern).length ? { kern } : {}), ...(zellen.length ? { zellen } : {}) } });
  });
}

describe("Handler: Teil-PUT und Voll-PUT mit Abkürzungen = ohne (alt gegen neu)", { timeout: 600000 }, () => {
  let paarNr = 0;
  for (const k of Object.keys(ROLLEN)) {
    it(`${k} (${ROLLEN[k].rolle}): feste und zufällige Änderungen — Status, Antwort, Platte gleich`, async () => {
      const [neu, alt] = await raumPaar(++paarNr);
      const codes = new Set();
      for (const [name, besch] of [...aenderungen(k), ...zufaelligeAenderungen(k, 8)]) {
        const a = await ausfuehren(neu, k, besch);
        const b = await ausfuehren(alt, k, besch);
        codes.add(`${a.status}${a.code ? ` ${a.code}` : ""}`);
        expect(maske(a, neu.raum), `${k} ${name}: Antwort`).toEqual(maske(b, alt.raum));
        expect(await platte(neu.raum), `${k} ${name}: Platte`).toEqual(await platte(alt.raum));
      }
      /* Die Folge erreicht Erfolg und die Absagen der Kette (je nach Rolle). */
      expect([...codes].some((c) => c.startsWith("200")), [...codes].join(" | ")).toBe(true);
      if (k === "LT" || k === "PL") {
        expect(codes.has("403 STEMPEL_UNVERAENDERLICH"), [...codes].join(" | ")).toBe(true);
        expect(codes.has("403 MONAT_ABGESCHLOSSEN"), [...codes].join(" | ")).toBe(true);
      }
    });
  }
});
