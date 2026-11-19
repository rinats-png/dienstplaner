/* WP-19.13 (Teil): Oberflaechen der zwoelf Branchenmodule je Rolle und Viewport, Nachweis ohne Browser.
   Die echte Komponente (BranchenModule aus src/module/kern.jsx, die alle zwoelf Moduloberflaechen einhaengt) wird mit den echten
   Stilregeln der Anwendung (bauStyles) fuer 360x740, 390x844 und 768x1024 ausgewertet. Der Pruefmodus: NUR in diesem Test bekommt
   die Komponente per liste-Parameter eine Registry, in der die Module „vorlaeufig“ stehen; die Registry in
   server/lib/branchenmodule.mjs bleibt „geplant“, in Produktionscode ist nichts eingeschaltet.
   Je Rolle (Sicht des Servers: bestandFuerRolle) und Viewport:
     - kein Absturz, alle zwoelf Oberflaechen vorhanden (benannte Region), Aktion „Ausschalten“ je Modul genau bei org.edit,
     - Zielgroessen aus den Stilregeln mindestens 24 px (Schaltflaechen, Eingaben, Auswahlkaestchen im Bereich Branchenmodule),
     - kein Signal fuer Querscroll (keine feste Breite ueber dem Viewport, kein nowrap, Wurzel max-width 100 %),
     - keine Gesundheitsdaten (Koeder in Krankmeldung und Abwesenheit stehen nie im Markup),
     - deutsche Beschriftungen, keine Platzhalterreste, zugaengliche Namen fuer Schaltflaechen und Felder.
   Was ohne Layout-Engine, Browser und Geraete nicht belegbar ist, steht in docs/acc45/WP-19-MODULABNAHME.md (Abschnitt „Nicht geprueft“).
   Aufruf: npm run pruefung:modulabnahme-oberflaeche */
import { describe, it, expect, beforeAll } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GERAETE_VIEWPORTS, ZIEL_MINDEST } from "../src/ui/geraete.js";
import { BranchenModule } from "../src/module/kern.jsx";
import { MODUL_OBERFLAECHEN } from "../src/module/index.js";
import { BRANCHENMODULE } from "../server/lib/branchenmodule.mjs";
import { ROLLEN, PRUEF_LISTE, GESUNDHEITSKOEDER, betriebMitDaten, sitzungFuerOberflaeche, darfRolle, blockPruefen } from "./hilfen/modulabnahme.mjs";

let A;
beforeAll(async () => { A = await import("../src/App.jsx"); }, 120000);

const VIEWPORTS = ["360x740", "390x844", "768x1024"].map((id) => GERAETE_VIEWPORTS.find((v) => v.id === id));

/* ---------- Stilregeln je Viewport auswerten (wie pruefungen/geraete-wp21-ablaeufe-render.test.js) ---------- */
function bloecke(css) {
  const aus = []; let i = 0;
  while (i < css.length) {
    const auf = css.indexOf("{", i); if (auf < 0) break;
    const kopf = css.slice(i, auf).replace(/\/\*[\s\S]*?\*\//g, "").trim();
    let tiefe = 1, j = auf + 1;
    while (j < css.length && tiefe) { if (css[j] === "{") tiefe++; else if (css[j] === "}") tiefe--; j++; }
    aus.push({ kopf, inhalt: css.slice(auf + 1, j - 1) }); i = j;
  }
  return aus;
}
function regelnFuer(css, breite) {
  const regeln = [];
  const sammle = (text) => {
    for (const b of bloecke(text)) {
      if (!b.kopf.startsWith("@")) { for (const sel of b.kopf.split(",")) regeln.push({ sel: sel.trim(), dekl: b.inhalt }); continue; }
      const mq = /^@media\s*\(\s*(max|min)-width:\s*(\d+)px\s*\)$/.exec(b.kopf);
      if (!mq) continue;
      if (mq[1] === "max" ? breite <= +mq[2] : breite >= +mq[2]) sammle(b.inhalt);
    }
  };
  sammle(css);
  return regeln;
}
/** Letzter Wert der Eigenschaft ueber alle Regeln, deren Selektor die Teile enthaelt (spaetere Regeln gewinnen; !important gewinnt). */
function wertFuer(regeln, teile, eig) {
  let treffer = null, imp = false;
  for (const r of regeln) {
    if (!teile.every((t) => r.sel.includes(t))) continue;
    const m = new RegExp(`(?:^|[;{\\s])${eig}\\s*:\\s*([^;}]+)`).exec(r.dekl);
    if (!m) continue;
    const istImp = /!important/.test(m[1]); const v = m[1].replace(/!important/, "").trim();
    if (istImp || !imp) { treffer = v; imp = istImp; }
  }
  return treffer;
}
const px = (v) => (v == null ? null : parseFloat(v));

/* ---------- Rendern ---------- */
const akt = { setzeEinstellung: () => {}, moduldatenAusnahme: () => {} };
const rendere = (g, r) => {
  const sitz = sitzungFuerOberflaeche(g, r);
  return renderToStaticMarkup(h(BranchenModule, { sitz, akt, darf: darfRolle(r.rolle), liste: PRUEF_LISTE,
    kontext: { personenImDienst: () => (sitz.mandant ? sitz.mandant.personen.filter((p) => p.rolle === "mitarbeiter") : []) } }));
};
const knoepfe = (s) => [...s.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].map((m) => ({ attr: m[1], text: m[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim() }));
const festeBreiten = (s) => [...s.matchAll(/(?:min-)?width:(\d+(?:\.\d+)?)px/g)].map((m) => +m[1]);
const entityOff = (t) => t.replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&#x27;/g, "'");
/** Artikel (Modulzeilen) je Modulname. */
const artikel = (s) => Object.fromEntries([...s.matchAll(/<article[^>]*aria-label="([^"]*)"[^>]*>([\s\S]*?)<\/article>/g)].map((m) => [entityOff(m[1]), m[2]]));

const UI_ROLLEN = ROLLEN.filter((r) => r.betrieb === 0);
const MIT_SCHALTEN = (r) => darfRolle(r.rolle)("org.edit");
const GESUNDHEIT = /krankmeld|krankheit|diagnos|attest|gesundheitsdat|schwangerschaft|mutterschutz|arbeitsunf/i;
const ENGLISCH = /\b(Submit|Cancel|Save|Delete|Loading|Enable|Disable|Settings|Please|Click here|Undefined|Error)\b/;
/** Region (section) mit diesem Namen; die Modulzeile (article) heisst oft gleich und zaehlt nicht. */
const hatFlaeche = (s, t) => s.includes(`aria-label="${t}"`) && s.split("<section").some((x) => x.startsWith(" ") && x.slice(0, x.indexOf(">")).includes(`aria-label="${t}"`));
/** Welche Oberflaeche eine Rolle sieht: modulAktiv liest die Sicht der Rolle. Schichtverantwortung und Beschaeftigte haben die
    Mitbestimmungsbestaetigung nicht in ihrer Sicht, also zeigt die Komponente ihnen Wachbuch und Objektbericht nicht (fail-closed,
    Befund B3 im Dokument); der Betreiber hat keine Betriebssicht mit Moduleinstellungen und sieht keine. */
const OHNE_FLAECHE = { SV: ["wachbuch", "objektbericht"], MA: ["wachbuch", "objektbericht"], BT: BRANCHENMODULE.map((x) => x.id) };
const flaecheDa = (r, modul) => !(OHNE_FLAECHE[r.k] || []).includes(modul);
const MODULNAMEN = BRANCHENMODULE.map((x) => x.name);
const TITEL = MODUL_OBERFLAECHEN.map((o) => o.titel);

describe("Pruefmodus: nur im Test, Registry unveraendert", () => {
  it("die Registry steht auf „geplant“ ohne Abnahme; die Pruefliste ist eine Kopie", () => {
    for (const x of BRANCHENMODULE) { expect(x.status, x.id).toBe("geplant"); expect(x.abnahme, x.id).toBeUndefined(); }
    expect(PRUEF_LISTE.every((x) => x.status === "vorlaeufig")).toBe(true);
    expect(PRUEF_LISTE).not.toBe(BRANCHENMODULE);
  });
  it("mit der echten Registry („geplant“) zeigt die Komponente keine Moduloberflaeche, nur den Stand „in Vorbereitung“", () => {
    const g = betriebMitDaten();
    const r = ROLLEN[0];
    const sitz = sitzungFuerOberflaeche(g, r);
    const s = renderToStaticMarkup(h(BranchenModule, { sitz, akt, darf: darfRolle(r.rolle), kontext: { personenImDienst: () => [] } }));
    expect(s).toContain("Keine Moduloberfläche: Kein Branchenmodul wirkt in diesem Betrieb.");
    for (const t of TITEL) expect(hatFlaeche(s, t), t).toBe(false);
    expect(s).toContain("in Vorbereitung");
    expect(knoepfe(s).filter((k) => k.text === "Ausschalten" || k.text === "Einschalten")).toHaveLength(0);
  });
});

for (const vp of VIEWPORTS) {
  describe(`Module je Rolle bei ${vp.id}`, () => {
    for (const r of UI_ROLLEN) {
      it(`${r.k} (${r.name}): rendert, alle zwölf Oberflächen, Aktion nur bei org.edit, keine Gesundheitsdaten, Namen`, () => {
        const g = betriebMitDaten();
        const s = rendere(g, r);
        expect(s.length).toBeGreaterThan(1000);
        expect(s).toContain('aria-label="Branchenmodule"');
        for (const o of MODUL_OBERFLAECHEN) expect(hatFlaeche(s, o.titel), `${r.k} Oberfläche ${o.modul}`).toBe(flaecheDa(r, o.modul));
        if (r.k === "BT") expect(s).toContain("Keine Moduloberfläche");
        const art = artikel(s);
        for (const n of MODULNAMEN) {
          expect(Object.keys(art), `${r.k} Modulzeile ${n}`).toContain(n);
          const aus = knoepfe(art[n]).filter((k) => k.text === "Ausschalten");
          expect(aus.length, `${r.k} Ausschalten ${n}`).toBe(MIT_SCHALTEN(r) ? 1 : 0);
          for (const k of aus) expect(k.attr).not.toMatch(/\bdisabled\b/);
        }
        /* Keine Gesundheitsdaten, weder Koeder noch Begriffe. */
        for (const k of GESUNDHEITSKOEDER) expect(s, k).not.toContain(k);
        expect(GESUNDHEIT.test(entityOff(s).replace(/<[^>]+>/g, " ")), `${r.k} Gesundheitsbegriff`).toBe(false);
        /* Deutsch, ohne Platzhalter. */
        const text = entityOff(s).replace(/<[^>]+>/g, " ");
        expect(ENGLISCH.test(text), `${r.k} englischer Rest`).toBe(false);
        for (const bad of ["undefined", "[object", "NaN", "null"]) expect(text, `${r.k} ${bad}`).not.toContain(bad);
        /* Zugaengliche Namen: jede Schaltflaeche mit Text oder Name, jedes Feld in einem Label oder mit aria-label. */
        for (const k of knoepfe(s)) expect(k.text.length > 0 || /aria-label="[^"]+"/.test(k.attr), `${r.k} Schaltfläche ohne Namen`).toBe(true);
        const ohneLabel = s.replace(/<label\b[\s\S]*?<\/label>/g, "");
        for (const f of ohneLabel.matchAll(/<(input|select|textarea)\b([^>]*)>/g))
          expect(/aria-label(ledby)?="[^"]+"/.test(f[2]), `${r.k} unbenanntes Feld ${f[1]}`).toBe(true);
        for (const sec of s.matchAll(/<section\b([^>]*)>/g)) expect(sec[1], `${r.k} section`).toMatch(/aria-label(ledby)?="[^"]+"/);
        /* Kein Querscroll-Signal. */
        for (const b of festeBreiten(s)) expect(b, `${r.k} feste Breite`).toBeLessThanOrEqual(vp.w);
        expect(s).not.toMatch(/white-space:\s*nowrap/);
        expect(s).toMatch(/aria-label="Branchenmodule" style="[^"]*max-width:100%/);
      });
    }
    it("Schalter aus: Einschalten je Modul genau bei org.edit; Mitbestimmungsmodule mit Bestaetigung (Auswahlkaestchen, Grundlage)", () => {
      for (const r of UI_ROLLEN) {
        const s = rendere(betriebMitDaten({ aus: true }), r);
        const art = artikel(s);
        for (const x of BRANCHENMODULE) {
          const ein = knoepfe(art[x.name]).filter((k) => k.text === "Einschalten");
          expect(ein.length, `${r.k} Einschalten ${x.id}`).toBe(MIT_SCHALTEN(r) ? 1 : 0);
          expect(/type="checkbox"/.test(art[x.name]), `${r.k} Bestätigung ${x.id}`).toBe(MIT_SCHALTEN(r) && x.mitbestimmung);
          if (x.mitbestimmung && MIT_SCHALTEN(r)) for (const k of knoepfe(art[x.name]).filter((b) => b.text === "Einschalten")) expect(k.attr).toMatch(/\bdisabled\b/);
        }
        expect(s).toContain("Keine Moduloberfläche");
      }
    });
    it("Kontischicht-Assistent rechnet nur: keine Schaltflaeche „Als Schichtfolge uebernehmen“ eingehaengt", () => {
      const s = rendere(betriebMitDaten(), ROLLEN[0]);
      expect(hatFlaeche(s, "Kontischicht-Assistent")).toBe(true);
      expect(knoepfe(s).filter((k) => /Als Schichtfolge/.test(k.text))).toHaveLength(0);
    });
    it("Zielgroesse aus den Stilregeln: Schaltflaechen, Eingaben, Auswahlkaestchen im Bereich Branchenmodule mindestens 24 px", () => {
      const r = regelnFuer(A.bauStyles(), vp.w);
      const bereich = ['aria-label="Branchenmodule"'];
      expect(px(wertFuer(r, [...bereich, "button"], "min-height")), "Schaltfläche Höhe").toBeGreaterThanOrEqual(ZIEL_MINDEST);
      expect(px(wertFuer(r, [...bereich, "button"], "min-width")), "Schaltfläche Breite").toBeGreaterThanOrEqual(ZIEL_MINDEST);
      expect(px(wertFuer(r, [...bereich, "select"], "min-height")), "Auswahlfeld").toBeGreaterThanOrEqual(ZIEL_MINDEST);
      expect(px(wertFuer(r, [...bereich, "checkbox"], "width")), "Kästchen Breite").toBeGreaterThanOrEqual(ZIEL_MINDEST);
      expect(px(wertFuer(r, [...bereich, "checkbox"], "height")), "Kästchen Höhe").toBeGreaterThanOrEqual(ZIEL_MINDEST);
    });
  });
}

describe("Oberflaechenmatrix im Dokument", () => {
  it("die Tabelle in docs/acc45/WP-19-MODULABNAHME.md ist genau die Rechnung dieses Tests", () => {
    const zeile = (zellen) => `| ${zellen.join(" | ")} |`;
    const spalten = UI_ROLLEN;
    const aus = [zeile(["Oberfläche (Registerkarte Betrieb)", ...spalten.map((r) => r.k), "Titel der Oberfläche"]), zeile(["---", ...spalten.map(() => "---"), "---"])];
    const eingehaengt = (r) => (MIT_SCHALTEN(r) || r.rolle === "planer" ? "ja" : "nein");
    aus.push(zeile(["in App.jsx eingehängt (org.edit oder Planung)", ...spalten.map(eingehaengt), "Betriebsverwaltung"]));
    const render = Object.fromEntries(spalten.map((r) => [r.k, rendere(betriebMitDaten(), r)]));
    for (const mod of BRANCHENMODULE) {
      const titel = MODUL_OBERFLAECHEN.find((o) => o.modul === mod.id).titel;
      const zellen = spalten.map((r) => {
        const s = render[r.k];
        const f = hatFlaeche(s, titel);
        if (f !== flaecheDa(r, mod.id)) throw new Error(`Fläche ${mod.id}/${r.k}`);
        const a = knoepfe(artikel(s)[mod.name] || "").some((k) => k.text === "Ausschalten");
        return `${f ? "F" : "nicht gezeigt"}${a ? "+A" : ""}`;
      });
      aus.push(zeile([mod.id, ...zellen, titel]));
    }
    aus.push("", "F = Oberfläche gerendert (benannte Region, kein Absturz bei 360, 390 und 768 px); A = Aktion „Ausschalten“ in der Modulzeile (org.edit); „nicht gezeigt“ = Region fehlt in der Sicht dieser Rolle (Befund B3, Betreiber: keine Moduleinstellungen in der Sicht). "
      + "„eingehängt: nein“ heißt: In App.jsx erreicht die Rolle die Betriebsverwaltung nicht; gerendert wurde trotzdem (Gegenprobe: keine Daten- oder Gesundheitsleckage).");
    expect(blockPruefen("MATRIX-UI", aus.join("\n"))).toBe(aus.join("\n"));
  });
});
