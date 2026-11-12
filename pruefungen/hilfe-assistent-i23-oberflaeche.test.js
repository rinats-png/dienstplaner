/* ==========================================================================
   HILFE-FRAGE, OBERFLÄCHE (WP-I23, F9)

   Gerendert wird mit renderToStaticMarkup (wie intelligence-oberflaeche.test.js).
   Geprüft: aus zeigt nichts; Beschriftung und Hinweis hängen am Feld; der Fehler
   hängt per aria-describedby am Feld und ist role=alert; die Antwort steht in einer
   Region mit aria-live; ohne formulierte Antwort steht nirgends „KI“; der Entwurf
   trägt die Kennzeichnung; Hilfetexte werden maskiert (XSS); die Ansicht Hilfe
   bindet die Frage ein; der Client spricht nur /api/hilfe/….
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { HilfeFrageAnsicht, HilfeFrage, HILFE_TEXTE, HILFE_FRAGE_MAX } from "../src/ansichten/hilfe-frage.jsx";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lies = (p) => readFileSync(path.join(WURZEL, p), "utf8");
const html = (props) => renderToStaticMarkup(h(HilfeFrageAnsicht, { frage: "", setFrage() {}, zustand: "leer", fehler: null, onSenden() {}, ...props }));

const PASSAGEN = [{ id: "h-stempeln", titel: "Ein- und Ausstempeln", text: "Im Reiter „Heute“ steht der Knopf." },
  { id: "h-tausch", titel: "Einen Dienst tauschen", text: "Öffne „Mein Plan“." }];

describe("Sichtbarkeit nach Modus", () => {
  it("aus und alles Unbekannte zeigt nichts", () => {
    for (const modus of ["aus", "", "irgendwas", undefined]) expect(html({ modus }), String(modus)).toBe("");
  });
  it("HilfeFrage ohne Antwort des Servers (vor dem ersten Abruf) zeigt nichts", () => {
    expect(renderToStaticMarkup(h(HilfeFrage, { status: () => new Promise(() => {}), fragen: async () => ({}) }))).toBe("");
  });
  it("suche und an zeigen die Karte mit je eigener Überschrift", () => {
    expect(html({ modus: "suche" })).toContain(HILFE_TEXTE.titelSuche);
    expect(html({ modus: "an" })).toContain(HILFE_TEXTE.titelAn);
  });
});

describe("Barrierefreiheit", () => {
  const m = html({ modus: "suche", frage: "Wie stemple ich?" });
  it("das Feld hat eine sichtbare Beschriftung (for/id) und den Hinweis als Beschreibung", () => {
    const id = /<input[^>]*\sid="([^"]+)"/.exec(m)[1];
    expect(m).toMatch(new RegExp(`<label[^>]*for="${id.replace(/[:.]/g, "\\$&")}"[^>]*>${HILFE_TEXTE.label}</label>`));
    const hinweis = /aria-describedby="([^"]+)"/.exec(m)[1];
    expect(m).toContain(`id="${hinweis}"`);
    expect(m).toContain(HILFE_TEXTE.hinweis);
    expect(m).toContain(`maxLength="${HILFE_FRAGE_MAX}"`);
    expect(m).toContain('type="submit"');
  });
  it("der Fehlertext hängt per aria-describedby am Feld, ist role=alert und markiert das Feld als ungültig", () => {
    const f = html({ modus: "suche", fehler: HILFE_TEXTE.fehlerLeer });
    const beschr = /<input[^>]*aria-describedby="([^"]+)"/.exec(f)[1].split(" ");
    const fehlerId = /<div id="([^"]+)" role="alert"/.exec(f)[1];
    expect(beschr).toContain(fehlerId);
    expect(f).toContain('aria-invalid="true"');
    expect(f).toContain(HILFE_TEXTE.fehlerLeer);
    expect(html({ modus: "suche" })).not.toContain('role="alert"');
    expect(html({ modus: "suche" })).not.toContain("aria-invalid");
  });
  it("die Antwortregion ist immer da, höflich (polite), benannt und meldet „beschäftigt“ beim Suchen", () => {
    const leer = html({ modus: "suche" });
    expect(leer).toMatch(/role="region"[^>]*aria-live="polite"|aria-live="polite"[^>]*role="region"/);
    expect(leer).toContain('aria-label="Antwort der Hilfe"');
    expect(leer).toContain('aria-busy="false"');
    const laedt = html({ modus: "suche", zustand: "laedt" });
    expect(laedt).toContain('aria-busy="true"');
    expect(laedt).toContain(HILFE_TEXTE.laedt);
    expect(laedt).toContain("disabled");
  });
  it("jeder Hilfetext ist ein benannter Abschnitt mit Überschrift", () => {
    const r = html({ modus: "suche", zustand: "fertig", ergebnis: { ok: true, passagen: PASSAGEN, keinTreffer: false, modell: { status: "aus" } } });
    for (const p of PASSAGEN) {
      const id = new RegExp(`<section aria-labelledby="([^"]+-${p.id})"`).exec(r)[1];
      expect(r).toContain(`<h3 id="${id}"`);
      expect(r).toContain(p.titel);
    }
  });
});

describe("Zustände und Kennzeichnung", () => {
  const nichts = /\bKI\b|künstliche|Sprachmodell/i;
  it("ohne formulierte Antwort (Modell aus oder nicht verfügbar) steht nirgends „KI“", () => {
    for (const modell of [{ status: "aus" }, { status: "nicht_verfuegbar", text: "nicht verfügbar" }]) {
      const r = html({ modus: "an", zustand: "fertig", ergebnis: { ok: true, passagen: PASSAGEN, keinTreffer: false, modell } });
      expect(r).not.toMatch(nichts);
      for (const p of PASSAGEN) expect(r).toContain(p.titel);
    }
    expect(html({ modus: "an", zustand: "fertig", ergebnis: { ok: true, passagen: PASSAGEN, keinTreffer: false, modell: { status: "nicht_verfuegbar" } } }))
      .toContain(HILFE_TEXTE.modellNichtVerfuegbar);
    for (const t of [HILFE_TEXTE.titelSuche, HILFE_TEXTE.titelAn, HILFE_TEXTE.label, HILFE_TEXTE.hinweis, HILFE_TEXTE.knopf, HILFE_TEXTE.laedt,
      HILFE_TEXTE.gefunden, HILFE_TEXTE.keinTreffer, HILFE_TEXTE.modellNichtVerfuegbar]) expect(t).not.toMatch(nichts);
  });
  it("mit formulierter Antwort: Entwurfskennzeichnung vor dem Text, die Hilfetexte darunter", () => {
    const r = html({ modus: "an", zustand: "fertig", ergebnis: { ok: true, passagen: PASSAGEN, keinTreffer: false,
      modell: { status: "fertig", text: "Antworttext", kennzeichnung: { kiGestuetzt: true, entwurf: true, geprueft: true } } } });
    expect(r.indexOf(HILFE_TEXTE.entwurf)).toBeGreaterThan(-1);
    expect(r.indexOf(HILFE_TEXTE.entwurf)).toBeLessThan(r.indexOf("Antworttext"));
    expect(r.indexOf("Antworttext")).toBeLessThan(r.indexOf(PASSAGEN[0].titel));
  });
  it("kein Treffer: fester Satz, Hinweis auf Kontakt, keine Treffer-Liste", () => {
    const r = html({ modus: "suche", zustand: "fertig", ergebnis: { ok: true, passagen: [], keinTreffer: true, hinweis: "Das steht nicht in der Hilfe.", modell: { status: "aus" } } });
    expect(r).toContain("Das steht nicht in der Hilfe.");
    expect(r).toContain(HILFE_TEXTE.keinTrefferWeiter);
    expect(r).not.toContain("<section");
  });
  it("Texte vom Server werden maskiert", () => {
    const boese = "<img src=x onerror=alert(1)>";
    const r = html({ modus: "an", zustand: "fertig", ergebnis: { ok: true, keinTreffer: false, passagen: [{ id: "h-x", titel: boese, text: boese }],
      modell: { status: "fertig", text: boese, kennzeichnung: { kiGestuetzt: true, entwurf: true } } } });
    expect(r).not.toContain("<img");
    expect(r).toContain("&lt;img");
  });
});

describe("Einbindung", () => {
  it("die Ansicht Hilfe zeigt die Frage; der Client spricht nur /api/hilfe/status und /api/hilfe/frage und schreibt nicht auf die Konsole", () => {
    expect(lies("src/ansichten/hilfe.jsx")).toMatch(/import \{ HilfeFrage \} from "\.\/hilfe-frage\.jsx"[\s\S]*<HilfeFrage \/>/);
    const sp = lies("src/speicher.js");
    const teil = sp.slice(sp.indexOf("Hilfe-Assistent (WP-I23)"), sp.indexOf("Was steht zur Verfügung? Push"));
    expect(teil).toContain('ruf("hilfe/status")');
    expect(teil).toContain('ruf("hilfe/frage"');
    expect(teil).not.toMatch(/console\.|localStorage|sessionStorage|fetch\(/);
    const q = lies("src/ansichten/hilfe-frage.jsx");
    expect(q).not.toMatch(/console\.|localStorage|sessionStorage|dangerouslySetInnerHTML/);
  });
});
