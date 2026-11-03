/* ==========================================================================
   INTELLIGENCE — DATENVERTRÄGE (WP-I11)

   Faktenpaket, Anfrage, Antwort, Prüfergebnis als JSON Schema 2020-12 mit
   strenger Prüfung: unbekannte Felder verworfen, Typen, Längen, Tiefe,
   Größe, keine Prototyp-Schlüssel, keine Zugriffsfunktionen. Dazu die
   Modulgrenzen von server/lib/intelligence/ (kein Netz, keine Umgebung,
   kein App.jsx, kein Schreiben in den Bestand).
   ========================================================================== */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  SCHEMATA, SCHEMA_VERSION, FUNKTIONEN_IDS, validieren, strukturPruefen, pruefeFaktenpaket, pruefeAnfrage,
  pruefeAntwort, pruefePruefergebnis, STRUKTUR_GRENZEN,
} from "../server/lib/intelligence/schemas.mjs";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const INTEL = path.join(WURZEL, "server/lib/intelligence");

const paket = (aend = {}) => ({
  schemaVersion: SCHEMA_VERSION, funktion: "F3",
  versionen: { schema: SCHEMA_VERSION, positivliste: "1.0", engine: "0.1.0", regelstand: "r-2026-11", tarifstand: "t1" },
  zeitraum: { von: "2026-11-01", bis: "2026-11-30" },
  fakten: [
    { id: "f.0", feld: "dienstart.beginn", art: "zeit", wert: "06:00", ref: "F" },
    { id: "f.1", feld: "person.wochenstunden", art: "zahl", wert: 38.5, einheit: "h", alias: "P_BCDFGHJK" },
    { id: "f.2", feld: "abwesenheit.zeitraum", art: "zustand", wert: "abwesend", alias: "P_BCDFGHJK", datum: "2026-11-03", bis: "2026-11-04" },
    { id: "f.3", feld: "befund.regel", art: "kennung", wert: "ruhezeitGesetz", alias: "P_BCDFGHJK", datum: "2026-11-05",
      regel: { regelId: "ruhezeitGesetz", pruefstatus: "geprueft", fundstelle: "§ 5 ArbZG" } },
  ],
  ...aend,
});

describe("Faktenpaket-Vertrag", () => {
  it("ein gültiges Paket besteht", () => {
    expect(pruefeFaktenpaket(paket())).toEqual({ ok: true, fehler: [] });
  });
  it("unbekannte Felder werden verworfen — oben, in versionen, im Fakt, in regel", () => {
    expect(pruefeFaktenpaket({ ...paket(), raum: "x" }).ok).toBe(false);
    expect(pruefeFaktenpaket(paket({ versionen: { ...paket().versionen, extra: "1" } })).ok).toBe(false);
    const p = paket();
    p.fakten[0] = { ...p.fakten[0], name: "Weber" };
    expect(pruefeFaktenpaket(p).ok).toBe(false);
    const q = paket();
    q.fakten[3] = { ...q.fakten[3], regel: { ...q.fakten[3].regel, text: "x" } };
    expect(pruefeFaktenpaket(q).ok).toBe(false);
  });
  it("Feldnamen nur aus dem Katalog, Arten und Einheiten nur aus dem Vokabular", () => {
    for (const f of [{ feld: "person.email" }, { art: "freitext" }, { einheit: "euro" }]) {
      const p = paket();
      p.fakten[1] = { ...p.fakten[1], ...f };
      expect(pruefeFaktenpaket(p).ok, JSON.stringify(f)).toBe(false);
    }
  });
  it("Wert muss zur Art passen (kein Freitext als Zustand, keine Zeit als Kennung mit Leerzeichen)", () => {
    for (const [art, wert] of [["zeit", "6 Uhr"], ["zustand", "krank"], ["kennung", "zwei Wörter"], ["datum", "2026-02-30"],
      ["zahl", "38"], ["wahr", "ja"]]) {
      const p = paket();
      p.fakten[0] = { id: "f.0", feld: "dienstart.beginn", art, wert };
      expect(pruefeFaktenpaket(p).ok, `${art}=${wert}`).toBe(false);
    }
  });
  it("Alias nur in der festen Form (Präfix + 8 Konsonanten)", () => {
    for (const a of ["P1", "Alias_04", "P_ABCDEFGH", "P_bcdfghjk", "X_BCDFGHJK", "P_BCDFGHJ", "Weber"]) {
      const p = paket();
      p.fakten[1] = { ...p.fakten[1], alias: a };
      expect(pruefeFaktenpaket(p).ok, a).toBe(false);
    }
  });
  it("Grenzen: höchstens 500 Fakten, Kennungen ≤ 64 Zeichen, Fremdtext ≤ 4000 Zeichen und ≤ 20 Blöcke", () => {
    const viele = Array.from({ length: 501 }, (_, i) => ({ id: `f.${i}`, feld: "dienstart.beginn", art: "zeit", wert: "06:00", ref: "F" }));
    expect(pruefeFaktenpaket(paket({ fakten: viele })).ok).toBe(false);
    const p = paket();
    p.fakten[0] = { ...p.fakten[0], ref: "x".repeat(65) };
    expect(pruefeFaktenpaket(p).ok).toBe(false);
    expect(pruefeFaktenpaket(paket({ fremdtext: [{ kapselId: "k0", text: "a".repeat(4001) }] })).ok).toBe(false);
    expect(pruefeFaktenpaket(paket({ fremdtext: Array.from({ length: 21 }, (_, i) => ({ kapselId: `k${i}`, text: "a" })) })).ok).toBe(false);
    expect(pruefeFaktenpaket(paket({ fremdtext: [{ kapselId: "k0", text: "a".repeat(4000) }] })).ok).toBe(true);
  });
  it("doppelte Fakt-Kennung, bis vor datum, Einheit an Nicht-Zahl → abgelehnt", () => {
    const p = paket(); p.fakten[1] = { ...p.fakten[1], id: "f.0" };
    expect(pruefeFaktenpaket(p).ok).toBe(false);
    const q = paket(); q.fakten[2] = { ...q.fakten[2], bis: "2026-11-01" };
    expect(pruefeFaktenpaket(q).ok).toBe(false);
    const r = paket(); r.fakten[0] = { ...r.fakten[0], einheit: "min" };
    expect(pruefeFaktenpaket(r).ok).toBe(false);
  });
  it("Pflichtfelder: Versionen (auch positivliste und schema) und zeitraum (null erlaubt)", () => {
    const { versionen: _v, ...ohne } = paket();
    expect(pruefeFaktenpaket(ohne).ok).toBe(false);
    const p = paket(); delete p.versionen.positivliste;
    expect(pruefeFaktenpaket(p).ok).toBe(false);
    expect(pruefeFaktenpaket(paket({ zeitraum: null, fakten: [] })).ok).toBe(true);
    expect(pruefeFaktenpaket(paket({ funktion: "F7B" })).ok).toBe(false);
  });
});

describe("Strukturprüfung (vor jedem Schema)", () => {
  it("Prototyp-Schlüssel, Zugriffsfunktionen, Klassen, Symbole, NaN/Infinity, Funktionen → abgelehnt", () => {
    const proto = JSON.parse('{"schemaVersion":"1.0","__proto__":{"x":1}}');
    expect(strukturPruefen(proto).length).toBeGreaterThan(0);
    const getter = {}; Object.defineProperty(getter, "a", { get: () => 1, enumerable: true });
    expect(strukturPruefen(getter).length).toBeGreaterThan(0);
    expect(strukturPruefen({ d: new Date() }).length).toBeGreaterThan(0);
    expect(strukturPruefen({ m: new Map() }).length).toBeGreaterThan(0);
    expect(strukturPruefen({ [Symbol("s")]: 1 }).length).toBeGreaterThan(0);
    expect(strukturPruefen({ n: NaN }).length).toBeGreaterThan(0);
    expect(strukturPruefen({ n: Infinity }).length).toBeGreaterThan(0);
    expect(strukturPruefen({ f: () => 1 }).length).toBeGreaterThan(0);
    expect(strukturPruefen({ b: 10n }).length).toBeGreaterThan(0);
    const verborgen = {}; Object.defineProperty(verborgen, "x", { value: 1, enumerable: false });
    expect(strukturPruefen(verborgen).length).toBeGreaterThan(0);
    const luecke = [1, 2, 3]; delete luecke[1];
    expect(strukturPruefen(luecke).length).toBeGreaterThan(0);
  });
  it("Tiefe, Knotenzahl und Größe sind begrenzt; Zyklen enden an der Tiefe", () => {
    let tief = {}; const wurzel = tief;
    for (let i = 0; i < STRUKTUR_GRENZEN.tiefe + 2; i++) { tief.a = {}; tief = tief.a; }
    expect(strukturPruefen(wurzel)).toContain("$.a.a.a.a.a.a.a.a.a: zu tief verschachtelt");
    const zyklus = { a: {} }; zyklus.a.b = zyklus;
    expect(strukturPruefen(zyklus).length).toBeGreaterThan(0);
    expect(strukturPruefen({ l: Array.from({ length: STRUKTUR_GRENZEN.knoten + 1 }, () => 1) }).length).toBeGreaterThan(0);
    expect(strukturPruefen({ s: "x".repeat(STRUKTUR_GRENZEN.bytes + 1) })).toContain("$: zu groß");
  });
  it("Fehlermeldungen nennen nie den geprüften Wert", () => {
    const p = paket(); p.fakten[0] = { ...p.fakten[0], wert: "Anna Weber, anna@example.org" };
    const v = pruefeFaktenpaket(p);
    expect(v.ok).toBe(false);
    expect(JSON.stringify(v)).not.toMatch(/Weber|anna@/);
  });
});

describe("Anfrage, Antwort, Prüfergebnis", () => {
  const anfrage = { funktion: "F3", eingabe: { zeitraum: { von: "2026-11-01", bis: "2026-11-07" } },
    bezug: { datum: "2026-11-03", personId: "p1", schichtId: "F" }, sprache: "de", idempotenz: "abc-123" };
  it("Anfrage: gültig; Raum, Rolle, Betrieb, Faktenpaket vom Client werden verworfen", () => {
    expect(pruefeAnfrage(anfrage).ok).toBe(true);
    for (const extra of [{ raum: "r" }, { rolle: "leitung" }, { betrieb: 0 }, { faktenpaket: {} }, { mandant: "m1" }])
      expect(pruefeAnfrage({ ...anfrage, ...extra }).ok, JSON.stringify(extra)).toBe(false);
    expect(pruefeAnfrage({ ...anfrage, eingabe: { ...anfrage.eingabe, raum: "x" } }).ok).toBe(false);
    expect(pruefeAnfrage({ ...anfrage, bezug: { ...anfrage.bezug, raum: "x" } }).ok).toBe(false);
    expect(pruefeAnfrage({ ...anfrage, funktion: "F99" }).ok).toBe(false);
    expect(pruefeAnfrage({ ...anfrage, sprache: "en" }).ok).toBe(false);
  });
  const antwort = { status: "fertig", auftragId: "auftrag-0001", ergebnis: { bausteine: [{ id: "ersatz.kandidat",
    parameter: [{ name: "person", wert: "{{person:P_BCDFGHJK}}" }, { name: "stunden", wert: 4 }] }] },
  kennzeichnung: { kiGestuetzt: true, entwurf: true, veroeffentlicht: false, geprueft: true } };
  it("Antwort: Kennzeichnung Pflicht und unveränderlich (KI-gestützt, Entwurf, nicht veröffentlicht)", () => {
    expect(pruefeAntwort(antwort).ok).toBe(true);
    const { kennzeichnung: _k, ...ohne } = antwort;
    expect(pruefeAntwort(ohne).ok).toBe(false);
    for (const k of [{ kiGestuetzt: false }, { entwurf: false }, { veroeffentlicht: true }])
      expect(pruefeAntwort({ ...antwort, kennzeichnung: { ...antwort.kennzeichnung, ...k } }).ok, JSON.stringify(k)).toBe(false);
  });
  it("Antwort: kein Feld, mit dem ein Plan geschrieben oder veröffentlicht würde", () => {
    for (const extra of [{ plan: {} }, { schreiben: true }, { veroeffentlichen: true }, { aenderungen: [] }])
      expect(pruefeAntwort({ ...antwort, ...extra }).ok).toBe(false);
    expect(pruefeAntwort({ ...antwort, ergebnis: { ...antwort.ergebnis, plan: {} } }).ok).toBe(false);
    expect(pruefeAntwort({ ...antwort, rueckfall: { code: "nicht_ki" } }).ok).toBe(false);
  });
  it("Prüfergebnis: höchstens zwei Versuche, Codes P-01…P-10, Verstöße als Kennungen", () => {
    const pe = { version: SCHEMA_VERSION, ergebnis: "bestanden", versuche: 1, regeln: [{ code: "P-02", ok: true }],
      gegenrechnung: { geprueft: 3, abweichungen: 0 } };
    expect(pruefePruefergebnis(pe).ok).toBe(true);
    expect(pruefePruefergebnis({ ...pe, versuche: 3 }).ok).toBe(false);
    expect(pruefePruefergebnis({ ...pe, regeln: [{ code: "P-11", ok: true }] }).ok).toBe(false);
    expect(pruefePruefergebnis({ ...pe, regeln: [{ code: "P-02", ok: false, verstoesse: ["Anna Weber hat 12,5 h"] }] }).ok).toBe(false);
    expect(pruefePruefergebnis({ ...pe, regeln: [{ code: "P-02", ok: false, verstoesse: ["fakten[3].wert"] }] }).ok).toBe(true);
  });
});

describe("Schemata selbst", () => {
  const alle = Object.entries(SCHEMATA);
  it("JSON Schema 2020-12, JSON-darstellbar, eingefroren", () => {
    for (const [n, s] of alle) {
      expect(s.$schema, n).toBe("https://json-schema.org/draft/2020-12/schema");
      expect(JSON.parse(JSON.stringify(s)), n).toEqual(s);
      expect(Object.isFrozen(s), n).toBe(true);
    }
  });
  it("jedes Objekt mit additionalProperties: false, jede Zeichenkette begrenzt, jede Liste begrenzt", () => {
    const lauf = (s, pfad) => {
      if (!s || typeof s !== "object") return;
      const typen = Array.isArray(s.type) ? s.type : s.type ? [s.type] : [];
      if (typen.includes("object") || s.properties) expect(s.additionalProperties, `${pfad} additionalProperties`).toBe(false);
      if (typen.includes("string")) expect(s.maxLength !== undefined || s.enum || s.const, `${pfad} maxLength`).toBeTruthy();
      if (typen.includes("array")) expect(s.maxItems, `${pfad} maxItems`).toBeGreaterThan(0);
      for (const [k, v] of Object.entries(s.properties || {})) lauf(v, `${pfad}.${k}`);
      if (s.items) lauf(s.items, `${pfad}[]`);
    };
    for (const [n, s] of alle) lauf(s, n);
  });
  it("ein unbekanntes Schlüsselwort im Schema wirft (nichts wird still ignoriert)", () => {
    expect(() => validieren({ type: "object", additionalProperties: false, properties: {}, oneOf: [] }, {})).toThrow(/unbekanntes Schlüsselwort/);
    expect(() => validieren({ type: "object", properties: { a: { type: "string", maxLength: 1 } } }, {})).toThrow(/additionalProperties/);
  });
  it("F7B (Dokumente) ist kein Faktenpaket-Fall", () => {
    expect(FUNKTIONEN_IDS).not.toContain("F7B");
  });
});

describe("Modulgrenzen von server/lib/intelligence/", () => {
  const dateien = readdirSync(INTEL).filter((f) => f.endsWith(".mjs"));
  const quelle = (f) => readFileSync(path.join(INTEL, f), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  it("die erwarteten Dateien von WP-I11 sind da", () => {
    for (const f of ["schemas.mjs", "felder.mjs", "positivliste.mjs", "alias.mjs", "leckpruefung.mjs", "kapsel.mjs",
      "faktenpaket.mjs", "fehler.mjs"]) expect(dateien).toContain(f);
  });
  it("kein Netz, kein Anbieter, keine Umgebungsvariable, kein Kindprozess, kein Dateischreiben", () => {
    for (const f of dateien) {
      const q = quelle(f);
      expect(q, f).not.toMatch(/\bfetch\s*\(|node:https?|node:net|node:tls|node:dgram|node:child_process|node:fs|XMLHttpRequest|WebSocket/);
      expect(q, f).not.toMatch(/process\.env|process\s*\[\s*["']env/);
      expect(q, f).not.toMatch(/anthropic|openai|bedrock|api\.\w+\.com/i);
    }
  });
  it("kein Import aus src/ (App.jsx) und kein Schreibweg in den Bestand", () => {
    for (const f of dateien) {
      const q = quelle(f);
      expect(q, f).not.toMatch(/from\s+["'][^"']*\/src\//);
      expect(q, f).not.toMatch(/bestandSchreiben|zusammenfuehren|setJSON|\.set\(\s*["'`]ki:/);
      for (const m of q.matchAll(/from\s+["']([^"']+)["']/g)) {
        const ziel = m[1];
        expect(ziel.startsWith("./") || ziel.startsWith("../") || ziel.startsWith("node:"), `${f}: ${ziel}`).toBe(true);
        if (ziel.startsWith("../")) expect(["../rechte.mjs", "../sicht.mjs", "../bestaetigungen.mjs"], `${f}: ${ziel}`).toContain(ziel);
        if (ziel.startsWith("node:")) expect(["node:crypto"], `${f}: ${ziel}`).toContain(ziel);
      }
    }
  });
  it("der Rechenkern (server/lib/*.mjs) importiert nichts aus intelligence/", () => {
    const kern = readdirSync(path.join(WURZEL, "server/lib")).filter((f) => f.endsWith(".mjs"));
    for (const f of kern) expect(readFileSync(path.join(WURZEL, "server/lib", f), "utf8"), f).not.toMatch(/intelligence\//);
  });
});
