/* ==========================================================================
   B-P2 (docs/acc45/LOKALE-E2E-ABNAHME-2026-11-20.md): Offline-Hinweis auch am Telefon

   Die Leiste „Keine Verbindung … Stand … geholt“ (Offlineleiste) stand nur in der Rechneransicht. Am Telefon
   (MobilSchale) sahen Beschäftigte einen gespeicherten Stand ohne Hinweis. Jetzt reicht App.jsx die Leiste als
   `hinweise` in die Schale, die sie über jedem Reiter zeigt. Browserseitig: e2e/pwa-dienstarbeiter.spec.mjs (P2).
   ========================================================================== */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const lies = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const text = (html) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

describe("B-P2: Offline-Hinweis auch in der Telefonschale", () => {
  let A, M, L;
  beforeAll(async () => {
    A = await import("../src/App.jsx");
    M = await import("../src/ansichten/mobil.jsx");
    L = await import("../src/ansichten/speicherlage.jsx");
  }, 120000);

  it("Quelltext: App.jsx reicht die Offlineleiste in die MobilSchale, die Schale zeigt `hinweise` im Hauptbereich", () => {
    const app = lies("../src/App.jsx");
    const aufruf = app.match(/<MobilSchale [\s\S]*?aufRechner=\{[^}]*\}\s*\/>/);
    expect(aufruf, "Aufruf der MobilSchale").toBeTruthy();
    /* B-P3: neben der Offlineleiste steht dort auch die Leiste „Nicht gespeichert“ (speicherfehler-telefon.test.js). */
    expect(aufruf[0]).toMatch(/hinweise=\{<><Offlineleiste lage=\{offline\} \/>\{nichtGespeichertLeiste\}<\/>\}/);
    /* Die Rechneransicht behält ihre Leiste. */
    expect(app).toMatch(/<main className="bereich"[\s\S]*?<Offlineleiste lage=\{offline\} \/>/);
    const mobil = lies("../src/ansichten/mobil.jsx");
    expect(mobil).toMatch(/export function MobilSchale\(\{[^}]*\bhinweise\b[^}]*\}\)/);
    expect(mobil).toMatch(/<main style=\{\{ padding: "20px 18px 10px" \}\}>\s*\{\/\*[^*]*\*\/\}\s*\{hinweise\}/);
  });

  it("Render: MobilSchale zeigt die Leiste (role=status) im Hauptbereich, ohne Leiste nichts davon", () => {
    const m = A.leererMandant("Offline-Probe", "pflege");
    const ich = { id: "p1", vorname: "Alex", nachname: "Probe", rolle: "mitarbeiter", aktiv: true, qualifikationen: [] };
    m.personen = [...(m.personen || []), ich];
    const sitz = { rolle: "mitarbeiter", db: { mandanten: [m] }, mandant: m, person: ich };
    const akt = new Proxy({}, { get: () => () => {} });
    const geholt = new Date(Date.now() - 5 * 60000).toISOString();   // zeit-ok: relativer Zeitstempel (jetzt minus 5 Min) nur für die Anzeige „vor 5 Minuten“, keine Kalenderabhängigkeit
    const mit = renderToStaticMarkup(h(M.MobilSchale, { sitz, akt, dialoge: null, aufRechner: () => {},
      hinweise: h(L.Offlineleiste, { lage: { geholt } }) }));
    const t = text(mit);
    expect(t).toContain("Keine Verbindung");
    expect(t).toContain("Änderungen lassen sich nicht speichern");
    expect(t).toMatch(/Stand wurde vor 5 Minuten geholt/);
    const main = mit.slice(mit.indexOf("<main"));
    expect(main.indexOf('role="status"'), "Leiste im Hauptbereich").toBeGreaterThan(-1);
    const ohne = text(renderToStaticMarkup(h(M.MobilSchale, { sitz, akt, dialoge: null, aufRechner: () => {},
      hinweise: h(L.Offlineleiste, { lage: null }) })));
    expect(ohne).not.toContain("Keine Verbindung");
  });

  it("Offlineleiste: Textspalte bricht am schmalen Telefon um (kein fester Mindestwert über der Breite)", () => {
    const html = renderToStaticMarkup(h(L.Offlineleiste, { lage: { geholt: null } }));
    expect(html).toContain("min-width:min(260px, 100%)");
  });
});
