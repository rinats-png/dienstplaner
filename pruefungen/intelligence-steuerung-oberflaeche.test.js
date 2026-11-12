/* ==========================================================================
   WP-I16 Teil 1 — Transparenzansicht und Oberfläche „Intelligence: Steuerung und Transparenz“

   - Prozessschalter aus (Vorgabe, nicht verdrahtet): je Rolle nur „nicht verfügbar“, keine Funktionsliste,
     keine „KI“-Behauptung; Beschäftigte, Schichtverantwortung, Betreiber: nichts
   - Prozessschalter an: Leitung bedient, Betriebsrat nur die Pause, Planung liest
   - Transparenz: Funktionen, Zustand, Wer/Wann (nur Rolle), Datenkategorien aus der Positivliste — kein Dateninhalt
   - Quelltext: nichts am Server verdrahtet, kein Netz, kein Prozessschalter-Name in der Oberfläche
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { KiSteuerung, KI_STEUERUNG_PROZESS, KI_STEUERUNG_TEXTE } from "../src/ansichten/ki-steuerung.jsx";
import { transparenz, TRANSPARENZ_ROLLEN, KATEGORIE_TEXT } from "../server/lib/intelligence/transparenz.mjs";
import { kiSteuerungLesen } from "../server/lib/ki-steuerung.mjs";
import { FUNKTIONEN_IDS } from "../server/lib/intelligence/schemas.mjs";
import { FUNKTIONEN } from "../server/lib/intelligence/positivliste.mjs";
import { FELDER } from "../server/lib/intelligence/felder.mjs";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lies = (p) => readFileSync(path.join(WURZEL, p), "utf8");

const STAND = { kiSteuerung: {
  betrieb: { an: true, am: "2026-11-10T10:00:00.000Z", vonRolle: "leitung", vonPerson: "l1" },
  funktionen: { F3: { an: true, am: "2026-11-10T10:01:00.000Z", vonRolle: "leitung", vonPerson: "l1" } },
  betriebsratFrage: { antwort: "ja", am: "2026-11-10T09:00:00.000Z", vonRolle: "leitung", vonPerson: "l1" },
  pause: { aktiv: true, am: "2026-11-11T08:00:00.000Z", vonRolle: "betriebsrat", vonPerson: "r1" },
  protokoll: [{ art: "betrieb-an", ziel: "betrieb", wert: true, am: "2026-11-10T10:00:00.000Z", vonRolle: "leitung", vonPerson: "l1" }],
} };
const sitz = (rolle, einstellungen = STAND) => ({ rolle, person: { id: "x", rolle, vorname: "V", nachname: "N" },
  mandant: { id: "m1", einstellungen, personen: [] } });
const AKT = { setzeKiSteuerung: () => {}, setzeKiPause: () => {} };
const rendere = (rolle, prozess, einstellungen) => renderToStaticMarkup(h(KiSteuerung, { sitz: sitz(rolle, einstellungen), akt: AKT, ...(prozess === undefined ? {} : { prozess }) }));
const knoepfe = (html) => [...html.matchAll(/<button[^>]*>(.*?)<\/button>/g)].map((m) => m[1].replace(/<[^>]+>/g, "").trim());

describe("Vorgabe: Prozessschalter aus", () => {
  it("die Oberfläche steht auf „aus“ (nicht verdrahtet)", () => {
    expect(KI_STEUERUNG_PROZESS).toBe("aus");
  });
  for (const rolle of TRANSPARENZ_ROLLEN) {
    it(`${rolle}: nur „nicht verfügbar“ — keine Funktionsliste, keine Schalter, keine „KI“-Behauptung`, () => {
      const html = rendere(rolle);
      expect(html).toContain(KI_STEUERUNG_TEXTE.titel);
      expect(html).toContain("nicht verfügbar");
      expect(html).not.toMatch(/<button|role="switch"|F\d+ /);
      expect(html).not.toMatch(/\bKI\b|künstlich|Modell|Anbieter|Token/);
      expect(html).not.toContain("pausiert");
    });
  }
  for (const rolle of ["mitarbeiter", "subplaner", "betreiber", "kunde", "gast", undefined]) {
    it(`${String(rolle)}: kein Abschnitt, auch nicht mit eingeschaltetem Prozessschalter`, () => {
      expect(rendere(rolle, "an")).toBe("");
      expect(rendere(rolle)).toBe("");
    });
  }
  it("jeder Wert außer genau „an“ bleibt „nicht verfügbar“ (fail closed)", () => {
    for (const p of ["AN", true, 1, "an ", "", null, {}]) expect(rendere("leitung", p), String(p)).toContain("nicht verfügbar");
  });
});

describe("Prozessschalter an (nur im Test)", () => {
  it("Leitung bedient: Hauptschalter, Frage, Funktionen — die Pause nur lesend", () => {
    const html = rendere("leitung", "an");
    expect(html).toContain(KI_STEUERUNG_TEXTE.haupt);
    expect(html).toContain('role="switch"');
    expect(knoepfe(html)).toEqual(expect.arrayContaining(["Ja", "Nein"]));
    expect(knoepfe(html)).not.toContain(KI_STEUERUNG_TEXTE.pauseAufheben);
    expect(knoepfe(html)).not.toContain(KI_STEUERUNG_TEXTE.pauseSetzen);
    expect(html).toContain("pausiert");
    expect(html).toContain(KI_STEUERUNG_TEXTE.pauseHinweisAndere);
  });
  it("Betriebsrat: ausschließlich die Pause (aufheben bei aktiver Pause), kein Schalter", () => {
    const html = rendere("betriebsrat", "an");
    expect(knoepfe(html)).toEqual([KI_STEUERUNG_TEXTE.pauseAufheben]);
    expect(html).not.toContain('role="switch"');
    const ohne = rendere("betriebsrat", "an", { kiSteuerung: { ...STAND.kiSteuerung, pause: { aktiv: false, am: "2026-11-12T08:00:00.000Z", vonRolle: "betriebsrat" } } });
    expect(knoepfe(ohne)).toEqual([KI_STEUERUNG_TEXTE.pauseSetzen]);
  });
  it("Planung: nur lesen — keine Bedienelemente außer den Aufklappbereichen", () => {
    const html = rendere("planer", "an");
    expect(knoepfe(html)).toEqual([]);
    expect(html).not.toContain('role="switch"');
    expect(html).toContain(KI_STEUERUNG_TEXTE.nurLesen);
  });
  it("alle 18 Funktionen stehen da, Zustand als Text; F7A ist nicht freischaltbar", () => {
    const html = rendere("leitung", "an");
    for (const id of FUNKTIONEN_IDS) expect(html, id).toContain(`${id} ${FUNKTIONEN[id].name}: `);
    expect(html).toContain("F3 Ausfall-Vorschlag: an");
    expect(html).toContain("F1 Plan-Erklärer: aus");
    expect(html).toContain(KI_STEUERUNG_TEXTE.gesperrt);
    expect(html.match(/role="switch"/g).length).toBe(1 + FUNKTIONEN_IDS.length - 1);   // Hauptschalter + alle außer F7A
  });
  it("Wer/Wann nur als Rolle und Datum — keine Personenkennung in der Anzeige", () => {
    for (const rolle of TRANSPARENZ_ROLLEN) {
      const html = rendere(rolle, "an");
      expect(html, rolle).toContain("(Leitung)");
      expect(html, rolle).not.toMatch(/\bl1\b|\br1\b/);
    }
  });
  it("Bedienziele und Beschriftung: Schalter mit Namen, Knöpfe mit Mindestgröße 24 px", () => {
    const html = rendere("leitung", "an");
    for (const m of html.matchAll(/<button[^>]*role="switch"[^>]*>/g)) expect(m[0]).toMatch(/aria-label="[^"]+"/);
    for (const m of html.matchAll(/<button[^>]*class="btn[^>]*>/g)) expect(m[0]).toMatch(/min-width:24px;min-height:24px/);
    expect(html).toMatch(/role="status"/);
  });
});

describe("Transparenzdaten", () => {
  const zustand = kiSteuerungLesen(STAND);
  it("nur Leitung, Planung, Betriebsrat; ohne Prozessschalter nur „nicht verfügbar“", () => {
    for (const r of ["mitarbeiter", "subplaner", "betreiber", "kunde", "x", undefined, null]) expect(transparenz(zustand, r, { prozess: "an" }), String(r)).toBeNull();
    for (const r of TRANSPARENZ_ROLLEN) {
      expect(transparenz(zustand, r)).toEqual({ verfuegbar: false });
      expect(transparenz(zustand, r, { prozess: "aus" })).toEqual({ verfuegbar: false });
    }
  });
  it("Stand: Hauptschalter, Frage, Pause, je Funktion Zustand und Stempel (nur Rolle und Zeit)", () => {
    const t = transparenz(zustand, "betriebsrat", { prozess: "an" });
    expect(t.verfuegbar).toBe(true);
    expect(t.betrieb).toEqual({ an: true, am: "2026-11-10T10:00:00.000Z", vonRolle: "leitung" });
    expect(t.pause).toEqual({ aktiv: true, am: "2026-11-11T08:00:00.000Z", vonRolle: "betriebsrat" });
    expect(t.betriebsratFrage.antwort).toBe("ja");
    expect(t.funktionen.map((f) => f.id)).toEqual([...FUNKTIONEN_IDS]);
    expect(t.funktionen.find((f) => f.id === "F3")).toMatchObject({ an: true, vonRolle: "leitung" });
    expect(t.funktionen.find((f) => f.id === "F1")).toMatchObject({ an: false, am: null, vonRolle: null });
    expect(JSON.stringify(t)).not.toMatch(/vonPerson|"l1"|"r1"/);
  });
  it("ohne Stand: alles aus; ein unlesbarer Pausenstand zeigt Pause", () => {
    const leer = transparenz(null, "leitung", { prozess: "an" });
    expect(leer.betrieb.an).toBe(false);
    expect(leer.pause.aktiv).toBe(false);
    expect(leer.funktionen.every((f) => f.an === false)).toBe(true);
    const kaputt = transparenz(kiSteuerungLesen({ kiSteuerung: { pause: { aktiv: "x" } } }), "leitung", { prozess: "an" });
    expect(kaputt.pause.aktiv).toBe(true);
  });
  it("Datenkategorien kommen aus der Positivliste — jede Funktion nennt genau ihre Felder, nie Inhalt", () => {
    const t = transparenz(zustand, "leitung", { prozess: "an" });
    for (const f of t.funktionen) {
      const erwartet = new Set(FUNKTIONEN[f.id].felder);
      const gefunden = new Set(f.datenkategorien.flatMap((k) => k.felder.map((x) => x.feld)));
      expect([...gefunden].sort(), f.id).toEqual([...erwartet].sort());
      for (const k of f.datenkategorien) {
        expect(typeof k.text).toBe("string");
        for (const x of k.felder) expect(x.zweck, x.feld).toBe(FELDER[x.feld].zweck);
      }
      expect(f.personenbezug, f.id).toBe(FUNKTIONEN[f.id].personenbezug);
    }
    const f5 = t.funktionen.find((f) => f.id === "F5");
    expect(f5.datenkategorien).toEqual([]);
    expect(f5.fremdtext).toBe(true);
  });
  it("jedes Präfix im Feldkatalog hat einen Klartext", () => {
    const pre = new Set(Object.keys(FELDER).map((k) => k.split(".")[0]));
    for (const p of pre) expect(Object.hasOwn(KATEGORIE_TEXT, p), p).toBe(true);
  });
  it("keine Gesundheits- oder Namensbegriffe in den Kategorietexten", () => {
    expect(JSON.stringify(KATEGORIE_TEXT)).not.toMatch(/krank|diagnose|gesundheit|schwanger|behinder|name\b|geburt/i);
  });
});

describe("Quelltext", () => {
  it("die Oberfläche kennt weder Umgebung noch Prozessschalter-Namen noch Netz noch Anbieter", () => {
    for (const p of ["src/ansichten/ki-steuerung.jsx", "src/app/aktionen/ki-steuerung.js"]) {
      const q = lies(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      expect(q, p).not.toMatch(/process\.env|CENTRIC_|fetch\s*\(|XMLHttpRequest|anthropic|openai|claude/i);
    }
  });
  it("server.mjs kennt die Steuerung nicht — der Prozessschalter ist nicht verdrahtet", () => {
    expect(lies("server.mjs")).not.toMatch(/ki-steuerung|kiSteuerung|intelligenceErlaubt|CENTRIC_KI_MODUS|intelligence\/gateway/);
  });
  it("die bestehenden Funktionen (F3, F6, F7A, F9, F15) rufen die Steuerung noch nicht — Verdrahtung ist Folgearbeit", () => {
    for (const p of ["server/lib/intelligence/funktionen", "server/funktionen"]) {
      const dir = path.join(WURZEL, p);
      for (const f of readdirSyncSafe(dir)) expect(readFileSync(path.join(dir, f), "utf8"), f).not.toMatch(/intelligenceErlaubt|intelligenceEntscheidung/);
    }
  });
  it("Einstellungen hängt den Abschnitt für alle außer dem Betreiber ein; die Oberfläche entscheidet je Rolle selbst", () => {
    const q = lies("src/ansichten/einstellungen.jsx");
    expect(q).toMatch(/<KiSteuerung sitz=\{sitz\} akt=\{akt\} \/>/);
  });
});

import { readdirSync } from "node:fs";
function readdirSyncSafe(d) { try { return readdirSync(d).filter((f) => /\.(mjs|js)$/.test(f)); } catch { return []; } }
