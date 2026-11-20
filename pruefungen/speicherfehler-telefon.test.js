/* ==========================================================================
   B-P3 (docs/acc45/LOKALE-E2E-ABNAHME-2026-11-20.md): Speicherfehler-Leiste auch am Telefon

   Die Leiste „Nicht gespeichert“ (NichtGespeichert, src/ansichten/speicherlage.jsx) stand wie früher die Offlineleiste
   (B-P2, #410) nur im Hauptbereich der Rechneransicht. Scheiterte am Telefon (MobilSchale) ein Speichervorgang —
   Sitzungsende, Netz, 403, Konflikt —, sahen Beschäftigte keine stehende Leiste mit Ausweg. Jetzt reicht App.jsx sie
   wie die Offlineleiste als `hinweise` in die Schale; das Konfliktfenster („Konflikt entscheiden“) steht in beiden
   Schalen. Feste Zeitangaben (keine Uhr): die Lagen tragen eine feste Zeit als Datenwert.
   ========================================================================== */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { createElement as h, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const lies = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const text = (html) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const ZEIT = "2026-11-20T09:30:00.000Z";

describe("B-P3: Speicherfehler-Leiste auch in der Telefonschale", () => {
  let A, M, L;
  beforeAll(async () => {
    A = await import("../src/App.jsx");
    M = await import("../src/ansichten/mobil.jsx");
    L = await import("../src/ansichten/speicherlage.jsx");
  }, 120000);

  const schale = (lage, extra = {}) => {
    const m = A.leererMandant("Speicher-Probe", "pflege");
    const ich = { id: "p1", vorname: "Alex", nachname: "Probe", rolle: "mitarbeiter", aktiv: true, qualifikationen: [] };
    m.personen = [...(m.personen || []), ich];
    const sitz = { rolle: "mitarbeiter", db: { mandanten: [m] }, mandant: m, person: ich };
    const akt = new Proxy({}, { get: () => () => {} });
    return renderToStaticMarkup(h(M.MobilSchale, { sitz, akt, dialoge: null, aufRechner: () => {},
      hinweise: h(Fragment, null, h(L.Offlineleiste, { lage: null }),
        h(L.NichtGespeichert, { lage, melde: () => {}, aufGeloest: () => {}, onKonflikt: () => {}, ...extra })) }));
  };
  const imHauptbereich = (html) => html.slice(html.indexOf("<main"));

  it("Quelltext: dieselbe Leiste in Rechneransicht und Telefonschale, Konfliktfenster in beiden Schalen", () => {
    const app = lies("../src/App.jsx");
    /* Eine Definition, zweimal eingehängt — die Schalen können nicht auseinanderlaufen. */
    expect(app.match(/<NichtGespeichert /g), "genau eine NichtGespeichert-Stelle").toHaveLength(1);
    expect(app.match(/<Konfliktfenster /g), "genau eine Konfliktfenster-Stelle").toHaveLength(1);
    expect(app).toMatch(/const nichtGespeichertLeiste = \(\s*<NichtGespeichert lage=\{nichtGespeichert\}/);
    expect(app).toMatch(/const konfliktBlock = konflikt \? \(\s*<Konfliktfenster lage=\{konflikt\}/);
    const aufruf = app.match(/<MobilSchale [\s\S]*?aufRechner=\{[^}]*\}\s*\/>/);
    expect(aufruf, "Aufruf der MobilSchale").toBeTruthy();
    expect(aufruf[0]).toMatch(/hinweise=\{<><Offlineleiste lage=\{offline\} \/>\{nichtGespeichertLeiste\}<\/>\}/);
    /* Telefonschale: das Konfliktfenster nach der Schale; Rechneransicht: Leiste im Hauptbereich nach der Offlineleiste. */
    const mobil = app.slice(app.indexOf("if (zeigeMobil) return ("), app.indexOf("if (zeigeMobil) return (") + 1200);
    expect(mobil).toMatch(/aufRechner=\{\(\) => setRechnerAnsicht\(true\)\} \/>\s*<\/div>\s*\{konfliktBlock\}/);
    expect(app).toMatch(/<main className="bereich"[\s\S]*?<Offlineleiste lage=\{offline\} \/>\s*\{nichtGespeichertLeiste\}/);
    expect(app.match(/\{konfliktBlock\}/g), "Konfliktfenster in beiden Schalen").toHaveLength(2);
  });

  it("403 am Telefon: Leiste (role=alert) im Hauptbereich mit Begründung, Datei sichern und Neuladen", () => {
    const html = schale({ art: "keinRecht", text: "Keine Schreibberechtigung.", status: 403, zeit: ZEIT,
      grund: "Diese Rolle speichert über den vollständigen Weg." });
    const main = imHauptbereich(html);
    expect(main).toContain('role="alert"');
    const t = text(main);
    expect(t).toContain("Diese Änderung ist mit deiner Rolle nicht zulässig");
    expect(t).toContain("Begründung: Diese Rolle speichert über den vollständigen Weg.");
    expect(t).toContain("Als Datei sichern");
    expect(t).toContain("Seite neu laden");
  });

  it("Sitzungsende am Telefon: Codefeld mit zugänglichem Namen und „Anmelden und senden“", () => {
    const main = imHauptbereich(schale({ art: "abgemeldet", text: "nicht-angemeldet", status: 401, zeit: ZEIT }));
    expect(main).toMatch(/<input[^>]*aria-label="Zugangscode"/);
    expect(text(main)).toContain("Anmelden und senden");
    expect(text(main)).toContain("Die Sitzung ist abgelaufen");
  });

  it("Netz und Konflikt am Telefon: „Noch einmal senden“ bzw. „Konflikt entscheiden“", () => {
    expect(text(schale({ art: "netz", text: "Failed to fetch", status: null, zeit: ZEIT }))).toContain("Noch einmal senden");
    const k = text(schale({ art: "konfliktOffen", text: "Gleichzeitig bearbeitet — erst entscheiden.", status: 409, zeit: ZEIT }));
    expect(k).toContain("Gleichzeitig bearbeitet — bis zur Entscheidung wird nichts gespeichert");
    expect(k).toContain("Konflikt entscheiden");
  });

  it("ohne Lage keine Leiste in der Telefonschale", () => {
    const main = imHauptbereich(schale(null));
    expect(main).not.toContain('role="alert"');
    expect(text(main)).not.toContain("Als Datei sichern");
  });

  it("Konfliktfenster: Dialog mit Namen, am Telefon in sich rollbar (nicht abgeschnitten)", () => {
    const html = renderToStaticMarkup(h(L.Konfliktfenster, { lage: { monate: ["2026-11"], durch: "Pia Plan", zeit: ZEIT },
      onSchliessen: () => {}, onUebernehmen: () => {}, melde: () => {} }));
    expect(html).toMatch(/role="dialog" aria-modal="true" aria-label="Gleichzeitig bearbeitet"/);
    expect(html).toContain("max-height:100%;overflow-y:auto");
  });
});
