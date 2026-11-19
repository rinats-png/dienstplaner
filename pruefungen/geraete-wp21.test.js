/* WP-21 Smartphone/Tablet fuer alle Rollen, Teil 1: Vertragspruefung ohne Browser.
   Die Messung selbst (Viewports, Seitenbreite, Zielgroessen, Navigation) macht pruefungen/browser/geraete-wp21.mjs von Hand;
   diese Datei haelt fest, dass die Mittel dafuer im Quelltext stehen: die Zahlen der Matrix, die Stilregeln der Seitenleiste
   (zugeklappt unsichtbar fuer Tastatur und Vorlesesoftware, offen mit Abdunkelung und Escape), der Querscroll-Bereich mit
   Fokus, Namen und Hinweis, die 24-px-Ziele und die Matrix-Datei mit allen Rollen. */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { GERAETE_VIEWPORTS, UMBRUCH, ZIEL_MINDEST, SEITENLEISTE_SCHLIESSEN, scrollHinweisNoetig, geraeteStil } from "../src/ui/geraete.js";
import { ROLLEN } from "../src/lib/rollen.js";

const lies = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const app = lies("src/App.jsx");
const css = geraeteStil();

describe("WP-21: Geraetematrix", () => {
  it("drei Telefone im Hochformat und das Tablet hoch und quer", () => {
    expect(GERAETE_VIEWPORTS.map((v) => v.id)).toEqual(["360x740", "390x844", "430x932", "768x1024", "1024x768"]);
    for (const v of GERAETE_VIEWPORTS.filter((x) => x.art === "telefon")) expect(v.h).toBeGreaterThan(v.w);
    const [hoch, quer] = GERAETE_VIEWPORTS.filter((x) => x.art === "tablet");
    expect(hoch.w).toBe(quer.h); expect(hoch.h).toBe(quer.w);
  });
  it("die benannten Umbruchpunkte stehen so in den Stilregeln der Anwendung", () => {
    expect(UMBRUCH).toEqual({ telefon: 560, schmal: 820, seitenleiste: 1024 });
    expect(app).toContain(`@media (max-width: ${UMBRUCH.seitenleiste}px){\n  .seitenleiste{transform:translateX(-100%)`);
    expect(app).toContain(`@media (max-width: ${UMBRUCH.telefon}px){`);
    expect(app).toContain(`window.matchMedia("(max-width: ${UMBRUCH.schmal}px)")`);
  });
  it("Zielgroesse nach WCAG 2.5.8", () => { expect(ZIEL_MINDEST).toBe(24); });
  it("scrollHinweisNoetig: nur bei echtem Ueberstand, Rundung bleibt ohne Hinweis", () => {
    expect(scrollHinweisNoetig(1179, 338)).toBe(true);
    expect(scrollHinweisNoetig(338, 338)).toBe(false);
    expect(scrollHinweisNoetig(339, 338)).toBe(false);
    expect(scrollHinweisNoetig(340, 338)).toBe(true);
    expect(scrollHinweisNoetig(undefined, 338)).toBe(false);
    expect(scrollHinweisNoetig("x", 1)).toBe(false);
  });
});

describe("WP-21: Seitenleiste auf Telefon und Tablet", () => {
  const schmalBlock = css.match(/@media \(max-width: 1024px\)\{([\s\S]*?)\n\}/);
  it("zugeklappt unsichtbar (Tastatur, Vorlesesoftware), offen sichtbar, nur unter 1025 px", () => {
    expect(schmalBlock).not.toBeNull();
    expect(schmalBlock[1]).toMatch(/\.seitenleiste\{visibility:hidden;/);
    expect(schmalBlock[1]).toMatch(/\.seitenleiste\.offen\{visibility:visible;/);
    /* auf dem Rechner (ab 1025 px) aendert sich nichts: keine Seitenleistenregel ausserhalb des Schmal-Blocks */
    const ausserhalb = css.replace(schmalBlock[0], "");
    expect(ausserhalb).not.toMatch(/\.seitenleiste/);
    expect(ausserhalb).toMatch(/@media \(min-width: 1025px\)\{ \.seiten-abdunkelung\{display:none !important;\} \}/);
  });
  it("die Abdunkelung deckt den Bildschirm hinter der Leiste ab und liegt darunter", () => {
    expect(schmalBlock[1]).toMatch(/\.seiten-abdunkelung\{position:fixed; inset:0; z-index:39;/);
    expect(app).toMatch(/\.seitenleiste\{\n[\s\S]{0,300}?z-index:40;/);
  });
  it("die Anwendung zeigt die Abdunkelung nur bei offener Leiste und schliesst per Antippen und Escape", () => {
    expect(app).toMatch(/\{seiteOffen && <button type="button" tabIndex=\{-1\} className="seiten-abdunkelung nur-schmal"\n\s+aria-label=\{SEITENLEISTE_SCHLIESSEN\} onClick=\{\(\) => setSeiteOffen\(false\)\} \/>\}/);
    expect(SEITENLEISTE_SCHLIESSEN).toBe("Navigation schließen");
    expect(app).toMatch(/if \(e\.key === "Escape"\) setSeiteOffen\(false\);/);
    expect(app).toMatch(/\$\{geraeteStil\(\)\}/);
  });
});

describe("WP-21: Bereiche mit eigenem Querscroll", () => {
  const baustein = lies("src/ui/scrollbereich.jsx");
  it("der Bereich ist nur bei Ueberstand fokussierbar, benannt und mit Hinweis versehen", () => {
    expect(baustein).toMatch(/scrollHinweisNoetig\(el\.scrollWidth, el\.clientWidth\)/);
    expect(baustein).toMatch(/\{\.\.\.\(ragt \? \{ tabIndex: 0, role: "region", "aria-label": label \} : \{\}\)\}/);
    expect(baustein).toMatch(/className="scrollhinweis"/);
    expect(baustein).toMatch(/ResizeObserver/);
  });
  it("Fokusrahmen und Hinweis stehen in den Stilregeln", () => {
    expect(css).toMatch(/\.scrollbereich\{overflow-x:auto;/);
    expect(css).toMatch(/\.scrollbereich:focus-visible\{outline:2px solid /);
    /* der Hinweis steht nur auf Telefon und Tablet; die Rechneransicht (ab 1025 px) bleibt unveraendert */
    expect(css).toMatch(/\.scrollhinweis\{display:none;/);
    expect(css.match(/@media \(max-width: 1024px\)\{([\s\S]*?)\n\}/)[1]).toMatch(/\.scrollhinweis\{display:block;\}/);
    expect(css.indexOf(".scrollhinweis{display:none;")).toBeLessThan(css.indexOf(".scrollhinweis{display:block;"));
  });
  const stellen = [
    ["src/ansichten/einsatzplan.jsx", "Personaleinsatz, Tabelle mit allen Tagen des Monats"],
    ["src/ansichten/personal.jsx", "Personal, Tabelle mit Zugangsart, Qualifikationen und Konten"],
    ["src/ansichten/monatsplan.jsx", "Monatsplan, Tabelle mit allen Tagen des Monats"],
    ["src/ansichten/lagebild.jsx", "Schichtfolge der kommenden zwei Wochen"],
    ["src/App.jsx", "Auswertung für den Betriebsrat, Tabelle je Monat und Einheit"],
  ];
  for (const [datei, label] of stellen) {
    it(`${datei}: Tabelle liegt im Scrollbereich mit Namen`, () => {
      const q = lies(datei);
      expect(q).toContain(`<Scrollbereich label="${label}"`);
      expect(q).toMatch(/<\/Scrollbereich>/);
      expect(q).toMatch(/import \{ Scrollbereich \} from "(\.\.\/ui|\.\/ui)\/scrollbereich\.jsx";/);
    });
  }
  it("die Karten dieser Tabellen scrollen nicht mehr selbst (sonst sitzt der Fokus am falschen Element)", () => {
    for (const d of ["src/ansichten/einsatzplan.jsx", "src/ansichten/personal.jsx", "src/ansichten/monatsplan.jsx", "src/ansichten/lagebild.jsx"]) {
      expect(lies(d)).not.toMatch(/overflowX: "auto"/);
    }
    expect(app).not.toMatch(/<Card style=\{\{ overflowX: "auto" \}\}>\n\s+<Scrollbereich/);
  });
});

describe("WP-21: Zielgroessen und Umbruch der Filter", () => {
  it("das Auswahlkaestchen der Sammelentscheidung wird auf Telefon und Tablet 24 px gross", () => {
    expect(lies("src/ansichten/antraegegeteilt.jsx")).toMatch(/className="ziel-haken"/);
    expect(css).toMatch(/@media \(max-width: 1024px\)\{ \.ziel-haken\{width:24px !important; height:24px !important;\} \}/);
  });
  it("das Haekchen der Tour (Nächstes Mal nicht mehr anzeigen) ist mindestens 24 px hoch", () => {
    expect(lies("src/ansichten/tourleiste.jsx")).toMatch(/fontSize: 12\.5, minHeight: 24,/);
  });
  it("Filter der Antraege und der Personenliste umbrechen bis 480 px statt innen zu scrollen", () => {
    expect(lies("src/ansichten/antraegegeteilt.jsx").match(/className="seg-umbruch"/g).length).toBe(2);
    expect(lies("src/ansichten/personal.jsx")).toMatch(/className="seg-umbruch"/);
    expect(app).toMatch(/\.seg-umbruch \.seg\{flex-wrap:wrap; overflow-x:visible;\}/);
  });
});

describe("WP-21: Matrix-Datei und Messskript", () => {
  const doc = existsSync(new URL("../docs/acc45/WP-21-GERAETEMATRIX.md", import.meta.url)) ? lies("docs/acc45/WP-21-GERAETEMATRIX.md") : "";
  const skript = lies("pruefungen/browser/geraete-wp21.mjs");
  it("die Matrix nennt jede Rolle des Rollenwerks und jeden Viewport", () => {
    expect(doc.length).toBeGreaterThan(2000);
    for (const r of ROLLEN) expect(doc, r.id).toContain(r.label);
    for (const v of GERAETE_VIEWPORTS) expect(doc, v.id).toContain(v.id);
    for (const s of ["bereits ohne Querscrollen", "Befund", "noch nicht geprüft"]) expect(doc).toContain(s);
    expect(doc).toContain("Für Tablet und Rechner ausgelegt");
  });
  it("das Skript nimmt die Viewports aus dem Quelltext, laeuft nur lokal und misst Seitenbreite, Ziele und Navigation", () => {
    expect(skript).toMatch(/import \{ GERAETE_VIEWPORTS, ZIEL_MINDEST \} from "\.\.\/\.\.\/src\/ui\/geraete\.js";/);
    expect(skript).toMatch(/127\.0\.0\.1/);
    expect(skript).toMatch(/Math\.random\(\)\.toString\(36\)/);
    expect(skript).not.toMatch(/readFile|STAGING-KETTE|dotenv|\.env["']/i);
    /* seit Teil 2 steht die Messfunktion in pruefungen/browser/geraete-messung.mjs (beide Skripte benutzen sie) */
    expect(skript).toMatch(/import \{ messeSeite \} from "\.\/geraete-messung\.mjs";/);
    expect(lies("pruefungen/browser/geraete-messung.mjs")).toMatch(/scrollWidth/);
    expect(skript).toMatch(/ZIEL_MINDEST/);
    expect(skript).toMatch(/\.kopf-menue/);
    for (const r of ROLLEN.map((x) => x.id)) expect(skript, r).toContain(`${r}: {`);
  });
});
