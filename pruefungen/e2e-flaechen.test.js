/* ==========================================================================
   WP-33 Rest: Vertrag der axe-Flächen der Playwright-Suite (e2e/weitere-flaechen.mjs), ohne Browser.
   Ohne diese Prüfung scheitert ein umbenannter Navigationseintrag erst im CI-Job browser-abnahme.
   Geprüft: eindeutige Namen, bekannte Rolle der Suite, Navigationseintrag existiert, Ausnahmen in e2e/axe-ausnahmen.json nennen nur bekannte Flächen (kein Platzhalter „*“).
   Rein deterministisch: kein Datum, keine Uhr, kein Netz.
   Aufruf: npx vitest run pruefungen/e2e-flaechen.test.js
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { BEREICHE } from "../src/app/navigation.js";
import { ROLLEN } from "../e2e/umgebung.mjs";
import { WEITERE_FLAECHEN } from "../e2e/weitere-flaechen.mjs";
import { ABNAHME_B_FLAECHEN } from "../e2e/abnahme-b-flaechen.mjs";

const EINTRAEGE = BEREICHE.flatMap((b) => b.views);
/** Wie geheZu() (e2e/hilfen.mjs): voller Name, optional mit Zähler („Anträge 3“); der Name geht als Text ein (escaped). */
export const alsRegex = (ansicht) => new RegExp("^\\s*" + ansicht.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*\\d*\\s*$");
const AUSNAHMEN = JSON.parse(readFileSync(new URL("../e2e/axe-ausnahmen.json", import.meta.url), "utf8")).ausnahmen;

describe("WP-33 Rest: weitere axe-Flächen", () => {
  it("Flächen sind nicht leer und eindeutig benannt", () => {
    expect(WEITERE_FLAECHEN.length).toBeGreaterThan(0);
    const namen = WEITERE_FLAECHEN.map((f) => f[0]);
    expect(new Set(namen).size).toBe(namen.length);
    for (const n of namen) expect(n).toMatch(/^[a-z][a-z0-9-]*$/);
  });

  it("keine Fläche doppelt zu den Flächen der Abnahme B und der Grundsuite", () => {
    const grund = ["anmeldung", "einstellungen-leitung", "plan-mitarbeiter", "plan-subplaner", "plan-planer", "plan-leitung",
      "plan-betriebsrat", ...Object.values(ABNAHME_B_FLAECHEN)];
    for (const [n] of WEITERE_FLAECHEN) expect(grund, n).not.toContain(n);
  });

  it("Rolle gehört zur Suite und der Navigationseintrag besteht", () => {
    for (const [flaeche, rolle, ansicht] of WEITERE_FLAECHEN) {
      expect(ROLLEN, `${flaeche}: Rolle`).toContain(rolle);
      expect(EINTRAEGE.filter(([, name]) => name === ansicht).length, `${flaeche}: Eintrag „${ansicht}“`).toBe(1);
    }
  });

  it("Ansichtsname trifft genau einen Eintrag (wie geheZu: voller Name, optional mit Zähler)", () => {
    /* geheZu() sucht den Eintrag per Teiltext und schränkt dann auf genau diesen Namen (mit Zähler) ein. */
    for (const [flaeche, , ansicht] of WEITERE_FLAECHEN) {
      expect(EINTRAEGE.filter(([, name]) => alsRegex(ansicht).test(name)).length, flaeche).toBe(1);
    }
  });

  it("Namensmuster: Zähler und Leerraum passen, falscher Text und Teiltreffer nicht (Mutationsprobe)", () => {
    const r = alsRegex("Anträge");
    expect(r.test("Anträge")).toBe(true);
    expect(r.test("Anträge 3")).toBe(true);
    expect(r.test("  Anträge  12 ")).toBe(true);
    expect(r.test("Antraege")).toBe(false);
    expect(r.test("Anträge und mehr")).toBe(false);
    expect(r.test("Alle Anträge")).toBe(false);
    expect(alsRegex("Auswertung (Betriebsrat)").test("Auswertung (Betriebsrat) 2")).toBe(true);
    expect(alsRegex("a.c").test("abc")).toBe(false);
  });

  it("Ausnahmen nennen nur bekannte Flächen und keinen Platzhalter", () => {
    const bekannt = new Set(["anmeldung", "einstellungen-leitung", "plan-mitarbeiter", "plan-subplaner", "plan-planer",
      "plan-leitung", "plan-betriebsrat", ...Object.values(ABNAHME_B_FLAECHEN), ...WEITERE_FLAECHEN.map((f) => f[0])]);
    for (const a of AUSNAHMEN) {
      expect(bekannt.has(a.flaeche), `Fläche ${a.flaeche}`).toBe(true);
      expect(a.flaeche, "kein Platzhalter").not.toBe("*");
    }
  });
});

/* Befund CI #423 (2026-11-20): Herkunft je Test. Die frühere Formel `(h >> 8) % 240` ergab für rund die Hälfte der Tests
   eine ungültige Adresse (negatives Oktett); der Server verwirft sie und zählt alle diese Tests unter 127.0.0.1 — die
   gemeinsame Demo-Bremse auf /api/demos lief voll (429), und networkidle wartete je Schritt 15 s. */
describe("Herkunft je Test (e2e/herkunft.mjs)", () => {
  it("jede erzeugte Adresse ist gültig und wird vom Server als eigene Herkunft gelesen, nie 127.0.0.1", async () => {
    const { herkunftFuerTest } = await import("../e2e/herkunft.mjs");
    const { herkunftBestimmen, vertrauteListe } = await import("../server/lib/schutz.mjs");
    const { isIP } = await import("node:net");
    const v = vertrauteListe("127.0.0.1,::1");
    const alt = (id, r) => { let h = 7; for (const z of `${id}:${r}`) h = (h * 31 + z.charCodeAt(0)) >>> 0; return `10.33.${(h >> 8) % 240}.${(h % 254) + 1}`; };
    let altUngueltig = 0;
    for (let i = 0; i < 2000; i++) {
      const id = `a707cd05005453af93c6-${i.toString(16).padStart(20, "0")}`;
      for (const r of [0, 1]) {
        const ip = herkunftFuerTest(id, r);
        expect(isIP(ip), ip).toBe(4);
        expect(herkunftBestimmen("127.0.0.1", ip, v), ip).toBe(ip);
        expect(herkunftFuerTest(id, r)).toBe(ip);                 // stabil je Test und Wiederholung
        if (!isIP(alt(id, r))) altUngueltig++;
      }
    }
    /* Gegenprobe: die alte Formel traf genau diesen Fehler (Rückfall auf die Gegenstelle) */
    expect(altUngueltig).toBeGreaterThan(1000);
    expect(herkunftBestimmen("127.0.0.1", "10.33.-164.113", v)).toBe("127.0.0.1");
  });
  it("die Testhilfe nutzt die Herkunftsfunktion (keine eigene Formel)", () => {
    const q = readFileSync(new URL("../e2e/hilfen.mjs", import.meta.url), "utf8");
    expect(q).toContain("herkunftFuerTest(testInfo.testId, testInfo.retry)");
    expect(q).not.toMatch(/\(h >> 8\)/);
  });
});

/* Befund CI #423 (2026-11-20, zweiter Lauf): Lastbremse „anmelden-code“ (20 gelungene Anmeldungen je Code in 5 Minuten).
   Die Suite verteilt die Anmeldungen einer Rolle auf einen Pool von Codes derselben Person (umgebung.mjs ZUGANG_POOL). */
describe("Code-Pool je Rolle (e2e/herkunft.mjs codeSchluessel)", () => {
  it("stabil je Test, nur Schlüssel des Pools, ohne Pool der Rollenzugang; gleichmäßig genug verteilt", async () => {
    const { codeSchluessel } = await import("../e2e/herkunft.mjs");
    const { ZUGANG_POOL, ROLLEN } = await import("../e2e/umgebung.mjs");
    expect(ZUGANG_POOL).toBeGreaterThanOrEqual(4);
    const codes = Object.fromEntries(ROLLEN.flatMap((r) => [[r, `C-${r}`], ...Array.from({ length: ZUGANG_POOL - 1 }, (_, i) => [`${r}~${i + 2}`, `C-${r}-${i + 2}`])]));
    const zaehler = {};
    for (let i = 0; i < 4000; i++) {
      const id = `a707cd05005453af93c6-${i.toString(16).padStart(20, "0")}`;
      const k = codeSchluessel(codes, "planer", id, ZUGANG_POOL);
      expect(k === "planer" || /^planer~[2-9]$/.test(k), k).toBe(true);
      expect(codeSchluessel(codes, "planer", id, ZUGANG_POOL)).toBe(k);
      zaehler[k] = (zaehler[k] || 0) + 1;
    }
    expect(Object.keys(zaehler).sort()).toEqual(["planer", ...Array.from({ length: ZUGANG_POOL - 1 }, (_, i) => `planer~${i + 2}`)].sort());
    for (const n of Object.values(zaehler)) expect(n).toBeGreaterThan(4000 / ZUGANG_POOL / 2);   // keine Häufung auf einem Code
    expect(codeSchluessel({ planer: "C" }, "planer", "x-1", ZUGANG_POOL)).toBe("planer");       // ohne Pool: Rollenzugang
    expect(codeSchluessel(codes, "planer", "", 1)).toBe("planer");
  });
  it("Testhilfe, Abnahme B und Aufbau nutzen den Pool", () => {
    const lies = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
    expect(lies("../e2e/hilfen.mjs")).toContain("codeSchluessel(alle, rolle, id, id ? ZUGANG_POOL : 1)");
    expect(lies("../e2e/abnahme-b-ablaeufe.spec.mjs")).toContain("const code = zugangscode(rolle);");
    expect(lies("../e2e/global-setup.mjs")).toContain("for (let n = 2; n <= ZUGANG_POOL; n++)");
  });
});

/* WP-48-GB (Akzeptanz „e2e-Suite ohne die Notlösung workers: 1“): je Arbeiter ein eigener Raum. Zwei Arbeiter im selben
   Raum bearbeiten denselben Bestand (Tour schließen, Abläufe) — echte Konflikte, kein Fehler des Öffnens. */
describe("WP-48-GB: je Arbeiter ein eigener Raum (e2e/umgebung.mjs arbeiterRaumWaehlen)", () => {
  it("wählt die Codes des eigenen Raums; fehlt er, werden die Variablen geleert statt fremd geteilt; außerhalb eines Testprozesses nichts", async () => {
    const { arbeiterRaumWaehlen, ZUGAENGE_VAR, BETREIBER_VAR, RAEUME_VAR } = await import("../e2e/umgebung.mjs");
    const basis = { [RAEUME_VAR]: "2", [ZUGAENGE_VAR]: "R0", [BETREIBER_VAR]: "B0",
      [`${ZUGAENGE_VAR}_0`]: "R0", [`${BETREIBER_VAR}_0`]: "B0", [`${ZUGAENGE_VAR}_1`]: "R1", [`${BETREIBER_VAR}_1`]: "B1" };
    const u1 = { ...basis, TEST_PARALLEL_INDEX: "1" };
    expect(arbeiterRaumWaehlen(u1)).toBe(1);
    expect([u1[ZUGAENGE_VAR], u1[BETREIBER_VAR]]).toEqual(["R1", "B1"]);
    const u0 = { ...basis, TEST_PARALLEL_INDEX: "0" };
    expect(arbeiterRaumWaehlen(u0)).toBe(0);
    expect([u0[ZUGAENGE_VAR], u0[BETREIBER_VAR]]).toEqual(["R0", "B0"]);
    const u2 = { ...basis, TEST_PARALLEL_INDEX: "2" };                    // mehr Arbeiter als Räume
    arbeiterRaumWaehlen(u2);
    expect(u2[ZUGAENGE_VAR]).toBeUndefined();
    expect(u2[BETREIBER_VAR]).toBeUndefined();
    const ohne = { ...basis };                                          // Konfiguration, global-setup.mjs
    expect(arbeiterRaumWaehlen(ohne)).toBeNull();
    expect(ohne[ZUGAENGE_VAR]).toBe("R0");
  });
  it("Konfiguration ohne workers: 1; Aufbau legt je Arbeiter einen Raum an und reicht die Codes je Index", async () => {
    const lies = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
    const konf = lies("../playwright.config.mjs");
    expect(konf).not.toMatch(/^\s*workers:\s*1\s*,/m);
    expect(konf).toMatch(/^\s*workers:\s*Math\.min\(RAEUME_HOECHSTENS,/m);
    const { RAEUME_HOECHSTENS } = await import("../e2e/umgebung.mjs");
    const { default: konfiguration } = await import("../playwright.config.mjs");
    expect(konfiguration.workers).toBeGreaterThanOrEqual(2);
    expect(konfiguration.workers).toBeLessThanOrEqual(RAEUME_HOECHSTENS);
    const auf = lies("../e2e/global-setup.mjs");
    expect(auf).toContain("export default async function globalSetup(config)");
    expect(auf).toMatch(/const raeume = Math\.max\(1, Math\.min\(RAEUME_HOECHSTENS, Number\(config && config\.workers\) \|\| 1\)\);/);
    expect(auf).toContain("const raum = nr === 0 ? RAUM : `${RAUM}-w${nr}`;");
    expect(auf).toContain("process.env[`${ZUGAENGE_VAR}_${k}`] = JSON.stringify(r.codes);");
    expect(auf).toContain("process.env[`${BETREIBER_VAR}_${k}`] = r.betreiber;");
    /* Jeder Raum bekommt seinen eigenen Betreiber und seine Zugänge (kein Rest des festen Raumnamens im Rumpf). */
    expect(auf).toContain('bestand: raum, rolle: "betreiber"');
    expect(auf).toContain('"/api/zugaenge", { bestand: raum, eintraege }');
    expect(auf).not.toMatch(/bestand: RAUM\b/);
  });
});
