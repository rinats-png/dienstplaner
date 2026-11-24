// WEBSITE-W2: Prüfsatz der Website, ohne Browser. Prüft die Hilfen (e2e/website.mjs), die Ausnahmeliste, die Verdrahtung in
// playwright.config.mjs und die Auflage A2: Ohne Python 3 darf der Bau der Website in der CI nicht still übersprungen werden
// (pruefungen/website-quelle.test.js). Den Lauf im Browser zeigt die Browserabnahme (Projekt "website", npm run e2e).
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import konfiguration from "../playwright.config.mjs";
import { ZONEN_SPEC } from "../e2e/zonen.mjs";
import {
  WEBSITE_SPEC, WEB_BREITEN, pythonFinden, istCi, bauModus, PYTHON_FEHLT_TEXT, ausnahmenLaden, scrollAusnahmenLaden,
  ausnahmenFormFehler, ausnahmeFuer, scrollAusnahmeFuer, klartext,
} from "../e2e/website.mjs";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lies = (p) => readFileSync(path.join(WURZEL, p), "utf8");
const SEITEN = ["404.html", "agb.html", "barrierefreiheit.html", "branchen.html", "datenschutz.html", "faq.html", "funktionen.html",
  "impressum.html", "index.html", "kontakt.html", "preise.html", "sicherheit.html", "ueber-uns.html", "wissen-rotation.html", "wissen.html"];

describe("A2: Python fehlt in der CI, kein stilles Überspringen", () => {
  it("bauModus: mit Python lauf; ohne Python in der CI fehler; ohne Python lokal skip", () => {
    expect(bauModus("python3", { CI: "true" })).toBe("lauf");
    expect(bauModus("python3", {})).toBe("lauf");
    expect(bauModus(null, { CI: "true" })).toBe("fehler");
    expect(bauModus(null, { CI: "1" })).toBe("fehler");
    expect(bauModus(null, {})).toBe("skip");
    for (const aus of ["", "0", "false", "FALSE"]) expect(bauModus(null, { CI: aus }), `CI=${aus}`).toBe("skip");
  });

  it("istCi liest die Umgebungsvariable CI", () => {
    expect(istCi({ CI: "true" })).toBe(true);
    expect(istCi({})).toBe(false);
  });

  it("pythonFinden: WEBSITE_PYTHON_NUR sperrt die Suche; ein unbrauchbarer Interpreter liefert null", () => {
    expect(pythonFinden({ WEBSITE_PYTHON_NUR: "1" })).toBeNull();
    expect(pythonFinden({ WEBSITE_PYTHON_NUR: "1", WEBSITE_PYTHON: "gibt-es-nicht-xyz" })).toBeNull();
    expect(pythonFinden({}, [])).toBeNull();
  });

  function website_quelle_lauf(umgebung) {
    const env = { ...process.env, ...umgebung };
    for (const k of Object.keys(env)) if (env[k] === undefined) delete env[k];
    delete env.VITEST;
    delete env.VITEST_WORKER_ID;
    delete env.VITEST_POOL_ID;
    const vitest = path.join(WURZEL, "node_modules", "vitest", "vitest.mjs");
    return spawnSync(process.execPath, [vitest, "run", "pruefungen/website-quelle.test.js"], { cwd: WURZEL, env, encoding: "utf8", timeout: 55000 });
  }

  it("Eigenlauf von website-quelle.test.js: CI gesetzt und kein Python => rot mit klarem Text", () => {
    const r = website_quelle_lauf({ CI: "true", WEBSITE_PYTHON: undefined, WEBSITE_PYTHON_NUR: "1" });
    const aus = `${r.stdout}\n${r.stderr}`;
    expect(r.status, aus).not.toBe(0);
    expect(aus).toContain("Python 3 nicht gefunden");
  }, 60000);

  it("Eigenlauf von website-quelle.test.js: lokal ohne Python => skip mit Hinweis, Lauf grün", () => {
    const r = website_quelle_lauf({ CI: undefined, WEBSITE_PYTHON: undefined, WEBSITE_PYTHON_NUR: "1" });
    const aus = `${r.stdout}\n${r.stderr}`;
    expect(r.status, aus).toBe(0);
    expect(aus).toMatch(/skipped/);
  }, 60000);

  it("website-quelle.test.js nutzt bauModus und nennt WEBSITE_PYTHON im Text", () => {
    const q = lies("pruefungen/website-quelle.test.js");
    expect(q).toContain("bauModus");
    expect(q).not.toMatch(/const bauprobe = PY \? it : it\.skip;/);
    expect(PYTHON_FEHLT_TEXT).toContain("WEBSITE_PYTHON");
  });
});

describe("Ausnahmeliste und Hilfen", () => {
  it("die ausgelieferte Liste ist formgerecht (V3-Bestand, W5, Obergrenzen)", () => {
    expect(ausnahmenFormFehler(ausnahmenLaden(), SEITEN, scrollAusnahmenLaden())).toEqual([]);
  });

  it("die Formprüfung weist fehlende Begründung, fremde Seiten und fehlende Obergrenzen ab", () => {
    const gut = { regel: "color-contrast", seite: "index.html", knotenMax: 3, grund: "V3-Bestand, V4-Migration W5: Beispiel mit Grund", wp: "W5" };
    expect(ausnahmenFormFehler([gut], SEITEN)).toEqual([]);
    expect(ausnahmenFormFehler([{ ...gut, grund: "kurz" }], SEITEN).length).toBeGreaterThan(0);
    expect(ausnahmenFormFehler([{ ...gut, grund: "Ohne den Herkunftsvermerk steht hier ein langer Text" }], SEITEN).length).toBeGreaterThan(0);
    expect(ausnahmenFormFehler([{ ...gut, seite: "nicht-da.html" }], SEITEN).length).toBeGreaterThan(0);
    expect(ausnahmenFormFehler([{ ...gut, knotenMax: undefined }], SEITEN).length).toBeGreaterThan(0);
    expect(ausnahmenFormFehler([{ ...gut, wp: "WP-1" }], SEITEN).length).toBeGreaterThan(0);
    expect(ausnahmenFormFehler([{ ...gut, breiten: [999] }], SEITEN).length).toBeGreaterThan(0);
    expect(ausnahmenFormFehler([], SEITEN, [{ seite: "agb.html", breiten: [320], scrollMax: 100, grund: "V3-Bestand, W5 Beispiel", wp: "W5" }]).length).toBeGreaterThan(0);
  });

  it("ausnahmeFuer trifft nur Regel, Seite, Modus und Breite der Ausnahme", () => {
    const l = [{ regel: "r", seite: "a.html", modus: "hell", breiten: [320], knotenMax: 1 }, { regel: "s", seite: "*", knotenMax: 1 }];
    expect(ausnahmeFuer(l, { regel: "r", seite: "a.html", modus: "hell", breite: 320 })).toBe(l[0]);
    expect(ausnahmeFuer(l, { regel: "r", seite: "a.html", modus: "dunkel", breite: 320 })).toBeNull();
    expect(ausnahmeFuer(l, { regel: "r", seite: "a.html", modus: "hell", breite: 390 })).toBeNull();
    expect(ausnahmeFuer(l, { regel: "r", seite: "b.html", modus: "hell", breite: 320 })).toBeNull();
    expect(ausnahmeFuer(l, { regel: "s", seite: "b.html", modus: "dunkel", breite: 1280 })).toBe(l[1]);
    expect(scrollAusnahmeFuer([{ seite: "agb.html", breiten: [320] }], { seite: "agb.html", breite: 768 })).toBeNull();
  });

  it("jede Ausnahme nennt eine Breite aus der Prüfmenge", () => {
    for (const a of [...ausnahmenLaden(), ...scrollAusnahmenLaden()]) for (const b of a.breiten || []) expect(WEB_BREITEN).toContain(b);
  });

  it("klartext entfernt Skripte, Stile und Tags", () => {
    expect(klartext("<p>Basis&nbsp;89 €</p><script>var x=1;</script><style>a{}</style> <b>je Monat</b>")).toBe("Basis 89 € je Monat");
  });
});

describe("Verdrahtung in playwright.config.mjs", () => {
  it("Projekt website nimmt nur die Website-Spec; die Viewport-Projekte lassen sie aus", () => {
    const projekte = konfiguration.projects;
    const w = projekte.find((p) => p.name === "website");
    expect(w, "Projekt website").toBeTruthy();
    expect(w.testMatch).toBe(WEBSITE_SPEC);
    expect(w.use.browserName).toBe("chromium");
    for (const p of projekte.filter((x) => x.name !== "website")) {
      if (p.testMatch === ZONEN_SPEC) continue;
      expect([p.testIgnore].flat(), p.name).toContain(WEBSITE_SPEC);
    }
    expect(ZONEN_SPEC.test("e2e/website-pruefsatz.spec.mjs")).toBe(false);
    expect(WEBSITE_SPEC.test("e2e/website-pruefsatz.spec.mjs")).toBe(true);
    expect(WEBSITE_SPEC.test("e2e/barrierefreiheit.spec.mjs")).toBe(false);
  });

  it("die Spec prüft die vier Breiten, hell und dunkel, und braucht keine Anwendung", () => {
    const s = lies("e2e/website-pruefsatz.spec.mjs");
    expect(WEB_BREITEN).toEqual([320, 390, 768, 1280]);
    expect(s).toContain('colorScheme: "dark"');
    expect(s).toContain("AXE_TAGS");
    expect(s).not.toMatch(/anmelden|zugangscode/);
  });

  it("keine Wanduhr-Zeichenkette in den neuen Dateien", () => {
    for (const f of ["e2e/website.mjs", "e2e/website-pruefsatz.spec.mjs", "pruefungen/website-pruefsatz.test.js"])
      expect(lies(f).includes("new " + "Date()"), f).toBe(false);
  });
});
