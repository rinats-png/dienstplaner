// V4-4: Verdrahtung des Playwright-Projekts "v4-visuell" (visuelle QA hell/dunkel), ohne Browser.
// Den Lauf selbst zeigt die Browserabnahme (CI-Job browser-abnahme, npm run e2e; lokal: npx playwright test --project=v4-visuell).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import konfiguration from "../playwright.config.mjs";
import { ZONEN_SPEC } from "../e2e/zonen.mjs";
import { WEBSITE_SPEC } from "../e2e/website.mjs";
import { VIEWPORTS } from "../e2e/umgebung.mjs";
import { BEREICHE, NAV_BETREIBER } from "../src/app/navigation.js";
import { VISUELL_SPEC, VISUELL_BREITEN, VISUELL_THEMEN, VISUELL_ANSICHTEN, VISUELL_BETREIBER_ANSICHT, VISUELL_BEKANNT, VISUELL_BESCHAEFTIGTE_BREITEN, VISUELL_BESCHAEFTIGTE_ANSICHTEN,
  bekannterBefund, befundeTrennen, ungenutzteEintraege, KEIN_FUND_BEWERTET, FOKUS_AUSWAHL, fokusMessen } from "../e2e/v4-visuell.mjs";

const lies = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

describe("Projekt v4-visuell in playwright.config.mjs", () => {
  const projekte = konfiguration.projects;
  it("eigener Eintrag nimmt nur die eigene Spec; alle Viewport-Projekte lassen sie aus", () => {
    const p = projekte.find((x) => x.name === "v4-visuell");
    expect(p, "Projekt v4-visuell").toBeTruthy();
    expect(p.testMatch).toBe(VISUELL_SPEC);
    expect(p.use.browserName).toBe("chromium");
    for (const v of VIEWPORTS) expect([projekte.find((x) => x.name === v.id).testIgnore].flat(), v.id).toContain(VISUELL_SPEC);
    expect(VISUELL_SPEC.test("e2e/v4-visuell.spec.mjs")).toBe(true);
    for (const andere of ["e2e/v4-variablen.spec.mjs", "e2e/v4-visuell.mjs", "e2e/barrierefreiheit.spec.mjs", "e2e/v4-visuell.spec.mjs.bak"])
      expect(VISUELL_SPEC.test(andere), andere).toBe(false);
    expect(ZONEN_SPEC.test("e2e/v4-visuell.spec.mjs")).toBe(false);
    expect(WEBSITE_SPEC.test("e2e/v4-visuell.spec.mjs")).toBe(false);
  });

  it("läuft in der bestehenden Schiene: npm run e2e (ohne --project) fährt alle Projekte, auch dieses", () => {
    const skripte = JSON.parse(lies("package.json")).scripts;
    expect(skripte.e2e).toBe("playwright test");
    expect(projekte.some((x) => x.name === "v4-visuell")).toBe(true);
  });
});

describe("Prüfumfang", () => {
  it("375 und 1280 px, hell und dunkel, mit passendem Systemthema", () => {
    expect(VISUELL_BREITEN.map((b) => b.w)).toEqual([375, 1280]);
    expect(VISUELL_THEMEN.map((t) => [t.thema, t.system])).toEqual([["hell", "light"], ["dunkel", "dark"]]);
  });

  it("jede Ansicht gibt es in der Navigation (Beschriftung und Bereich), Pakete bei der Betreiberrolle", () => {
    const kunde = new Set(BEREICHE.flatMap((b) => b.views.map((v) => v[1])));
    for (const [flaeche, rolle, ansicht] of VISUELL_ANSICHTEN) {
      expect(kunde.has(ansicht), `${flaeche}: ${ansicht}`).toBe(true);
      expect(rolle).toBe("leitung");
    }
    expect(VISUELL_ANSICHTEN.map((a) => a[0])).toEqual(["dienstplan", "mitarbeiter", "abwesenheiten", "einstellungen"]);
    expect(NAV_BETREIBER.some((n) => n[1] === VISUELL_BETREIBER_ANSICHT[2])).toBe(true);
  });

  it("Fokusauswahl ist gezielt und klein: erstes, erstes im Hauptinhalt, letztes", () => {
    expect([...FOKUS_AUSWAHL]).toEqual(["erstes", "haupt", "letztes"]);
  });
  it("Fokusmessung schließt für „haupt“ feste und klebende Leisten aus (Code und Kommentar stimmen überein)", () => {
    const q = String(fokusMessen);
    expect(q).toContain("fixiert");
    expect(q).toContain("frei.find(");
    expect(q).toContain('closest("main")');
  });
});

describe("Rolle Beschäftigte (Telefonschale)", () => {
  it("Breiten 375 und 1024 px; je Fläche ein Reiter der Telefonschale, jeder Reiter gibt es in M_TABS", () => {
    expect(VISUELL_BESCHAEFTIGTE_BREITEN.map((b) => b.w)).toEqual([375, 1024]);
    const quelle = lies("src/ansichten/mobil.jsx");
    expect(VISUELL_BESCHAEFTIGTE_ANSICHTEN.length).toBeGreaterThanOrEqual(3);
    for (const [flaeche, reiter] of VISUELL_BESCHAEFTIGTE_ANSICHTEN) {
      expect(flaeche, flaeche).toMatch(/^beschaeftigte-/);
      expect(quelle, reiter).toContain(`label: "${reiter}"`);
    }
  });
  it("Flächennamen der Beschäftigten sind eigen (kollidieren nicht mit der Leitung)", () => {
    const leitung = new Set(VISUELL_ANSICHTEN.map((a) => a[0]));
    for (const [flaeche] of VISUELL_BESCHAEFTIGTE_ANSICHTEN) expect(leitung.has(flaeche)).toBe(false);
  });
  it("die Spec meldet die Rolle an und prüft sie je Thema", () => {
    const spec = lies("e2e/v4-visuell.spec.mjs");
    expect(spec).toContain('anmelden(page, "mitarbeiter")');
    expect(spec).toContain("VISUELL_BESCHAEFTIGTE_BREITEN");
  });
});

describe("bekannte Befunde", () => {
  it("passt nach Regel, Fläche, Breite und Thema; Stern gilt für alle", () => {
    const liste = [{ regel: "kontrast", flaeche: "pakete", viewport: "*", thema: "dunkel", befund: "B1" }];
    expect(bekannterBefund("kontrast", "pakete", "telefon-375", "dunkel", liste)).toBe(liste[0]);
    expect(bekannterBefund("kontrast", "pakete", "telefon-375", "hell", liste)).toBeNull();
    expect(bekannterBefund("fokus", "pakete", "telefon-375", "dunkel", liste)).toBeNull();
    expect(bekannterBefund("kontrast", "einstellungen", "desktop-1280", "dunkel", liste)).toBeNull();
  });
  it("ein Eintrag mit Muster gilt nur für Funde mit diesem Muster; ein anderer Verstoß auf derselben Fläche bleibt offen", () => {
    const liste = [{ regel: "kontrast", flaeche: "dienstplan", viewport: "desktop-1280", thema: "hell", muster: ".unten", befund: "B1" }];
    const funde = ['td > .planzelle > .unten: zu blass', "h1.titel: zu blass"];
    const t = befundeTrennen("kontrast", "dienstplan", "desktop-1280", "hell", funde, liste);
    expect(t.bekannt.map((x) => x.fund)).toEqual([funde[0]]);
    expect(t.offen).toEqual([funde[1]]);
    expect(befundeTrennen("kontrast", "dienstplan", "telefon-375", "hell", funde, liste).offen).toEqual(funde);
  });
  it("„keine Knoten bewertet“ gilt nie als bekannt, auch nicht bei Stern und passendem Muster", () => {
    const liste = [{ regel: "kontrast", flaeche: "*", viewport: "*", thema: "*", muster: "bewertet", befund: "B9" }];
    const fund = `${KEIN_FUND_BEWERTET} (axe incomplete 3)`;
    expect(befundeTrennen("kontrast", "dienstplan", "desktop-1280", "hell", [fund], liste).offen).toEqual([fund]);
  });
  it("ein Eintrag ohne Treffer in seinem Geltungsbereich wird gemeldet (Reparatur zwingt zum Entfernen)", () => {
    const a = { regel: "kontrast", flaeche: "dienstplan", viewport: "desktop-1280", thema: "hell", muster: ".unten", befund: "B1" };
    const b = { regel: "kontrast", flaeche: "pakete", viewport: "desktop-1280", thema: "hell", muster: ".x", befund: "B2" };
    const w = { flaechen: ["dienstplan"], viewports: ["desktop-1280", "telefon-375"], thema: "hell" };
    expect(ungenutzteEintraege([a, b], new Set([a]), w)).toEqual([]);          // b liegt außerhalb des Geltungsbereichs
    expect(ungenutzteEintraege([a, b], new Set(), w)).toEqual([a]);            // a ohne Treffer
    expect(ungenutzteEintraege([a], new Set(), { ...w, thema: "dunkel" })).toEqual([]);
  });
  it("jeder Eintrag hat ein Muster (nie die ganze Fläche) und ist in docs/acc45/V4-4-BEFUNDE.md benannt", () => {
    for (const b of VISUELL_BEKANNT) expect(typeof b.muster === "string" && b.muster.length > 0, JSON.stringify(b)).toBe(true);
    const doku = lies("docs/acc45/V4-4-BEFUNDE.md");
    for (const b of VISUELL_BEKANNT) {
      expect(typeof b.befund === "string" && b.befund.length > 0, JSON.stringify(b)).toBe(true);
      expect(doku, b.befund).toContain(b.befund);
    }
  });
});

describe("Spec", () => {
  const spec = lies("e2e/v4-visuell.spec.mjs");
  const hilfen = lies("e2e/v4-visuell.mjs");
  it("prüft Kontrast, Bildlauf, Außerhalb, Abschneiden, Überlappung und Fokus und beweist jede per Mutation", () => {
    for (const regel of ["kontrast", "bildlauf", "ausserhalb", "abgeschnitten", "ueberlappung", "fokus"]) {
      expect(spec, regel).toContain(`sammeln("${regel}"`);
      expect(spec, `Mutation ${regel}`).toContain(regel === "fokus" ? `startsWith("fokus:")` : `"${regel}")`);
    }
    expect(spec).toContain('values: ["color-contrast"]');
    expect(spec).toContain("Ausgangslage sauber");
  });
  it("Kontrast ist nicht blind: zählt bewertete Knoten, blendet den Verlauf aus, beweist die Mutation auch angemeldet", () => {
    expect(spec).toContain('resultTypes: ["violations", "passes", "incomplete"]');
    expect(spec).toContain("keine Knoten bewertet");
    expect(spec).toContain(".inhalt::before,.m-schale::before{display:none !important;}");
    expect(spec).toContain("Mutation kontrast auf angemeldeter Fläche");
    expect(spec).toContain('fokusMessen("haupt")');
    expect(spec).toContain("ungenutzteEintraege(");
    expect(spec).toContain("befundeTrennen(");
  });
  it("Bilder nur auf Anforderung und nie im Repo; Quelle ohne new Date, ohne feste Wartezeit-Gates", () => {
    expect(spec).toContain("V4_VISUELL_BILDER");
    expect(spec).not.toMatch(/screenshot\s*:\s*["']on|toHaveScreenshot|toMatchSnapshot/);
    for (const q of [spec, hilfen]) { expect(q).not.toMatch(/new Date\(/); expect(q).not.toMatch(/test\.only|test\.skip|\.fixme/); }
    expect(spec).toContain('from "./hilfen.mjs"');
  });
});
