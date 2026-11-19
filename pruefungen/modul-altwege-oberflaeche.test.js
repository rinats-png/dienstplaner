/* WP-19 B5: Die Kernansichten Betriebsmittel und Kompetenzen bieten für Daten der fünf älteren Branchenmodule
   (Anlagen, Maschinenqualifikation; Posten, Bereichsplan, geteilter Dienst haben keine Schreibansicht im Kern) keine
   Schreibaktion an, solange das Modul nicht wirkt — der Server weist sie mit 403 ab (server/lib/modul-altwege.mjs).
   Echte Komponenten, Registry-Kopie der Testhilfe (PRUEF_LISTE: „vorlaeufig“ nur hier), Sicht je Rolle wie der Server sie liefert.
   - Registry „geplant“ (echte Registry): in den Zeilen der Altdaten ist keine Schreibaktion aktiviert, der Grund
     „Modul noch nicht verfügbar“ steht und ist über aria-describedby verknüpft; die Altdaten bleiben lesbar.
   - Registry „vorlaeufig“: die Aktionen sind für Rollen mit staff.edit (Betriebsmittel auch org.edit) aktiv.
   - Kernbetriebsmittel (kein Anlagen-Eintrag) und Kernkompetenzen bleiben in beiden Fällen unverändert bedienbar.
   Aufruf: npm run pruefung:modul-altwege-oberflaeche */
import { describe, it, expect, beforeAll } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BRANCHENMODULE } from "../server/lib/branchenmodule.mjs";
import { Betriebsmittel } from "../src/ansichten/betriebsmittel.jsx";
import { Kompetenzen } from "../src/ansichten/kompetenzen.jsx";
import { MODUL_NICHT_VERFUEGBAR, mittelSchreibbar, kompetenzSchreibbar, istMaschinenKompetenz } from "../src/module/altmodul-schreiben.js";
import { ROLLEN, PRUEF_LISTE, betriebMitDaten, sitzungFuerOberflaeche } from "./hilfen/modulabnahme.mjs";

let A;
beforeAll(async () => { A = await import("../src/App.jsx"); }, 120000);

const akt = new Proxy({}, { get: () => () => {} });
const kopie = (x) => JSON.parse(JSON.stringify(x));
import { darf } from "../src/lib/berechtigung.js";
const UI_ROLLEN = ROLLEN.filter((r) => r.betrieb === 0 && r.rolle !== "betreiber" && !r.demo);

/** Sitzung je Rolle; zusätzlich ein Kern-Betriebsmittel und eine Kernkompetenz (nie Modul-Daten). */
function sitzung(r) {
  const g = betriebMitDaten();
  const m = g.mandanten[0];
  m.betriebsmittel.push({ id: "bm-k", art: "schluessel", name: "Generalschlüssel", kennung: "S-1", personId: null });
  m.kompetenzen = [...(m.kompetenzen || []), { id: "k-kern", name: "Kernkompetenz Beatmung", art: "taetigkeit", betriebsmittelId: null,
    wiederholungMonate: 12, pflichtFuer: [], zugedacht: [] }];
  return sitzungFuerOberflaeche(g, r);
}
const darfStaff = (r) => darf(sitzung(r), "staff.edit");
const darfMittel = (r) => { const sz = sitzung(r); return darf(sz, "staff.edit") || darf(sz, "org.edit"); };
const knoepfe = (s) => [...s.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].map((x) => ({ attr: x[1], text: x[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim() }));
const aktiv = (b) => !/\bdisabled\b/.test(b.attr);
const selects = (s) => [...s.matchAll(/<select\b([^>]*)>/g)].map((x) => ({ attr: x[1] }));
/** Der Teil des Markups, der zu einer Zeile gehört (ab Namen bis zum nächsten Zeilenanfang). */
const zeile = (s, name) => {
  const i = s.indexOf(name); if (i < 0) return "";
  const von = s.lastIndexOf('class="row', i);
  const bis = s.indexOf('class="row', i);
  return s.slice(von < 0 ? 0 : von, bis < 0 ? s.length : bis);
};

const mittelAnsicht = (r, liste) => { const sitz = sitzung(r); return { sitz, html: renderToStaticMarkup(h(Betriebsmittel, { sitz, akt, ...(liste ? { liste } : {}) })) }; };

describe("WP-19 B5: Hilfsfunktionen folgen dem Server (modulAktiv), keine zweite Liste", () => {
  const g = betriebMitDaten(); const m = g.mandanten[0];
  const anlage = m.betriebsmittel[0];
  it("Status „geplant“ (echte Registry): Anlage und Maschinenkompetenz nicht schreibbar, Kernmittel schon", () => {
    expect(BRANCHENMODULE.find((x) => x.id === "anlagen").status).toBe("geplant");
    expect(mittelSchreibbar(m, anlage)).toBe(false);
    expect(mittelSchreibbar(m, { id: "x", art: "schluessel" })).toBe(true);
    const k = m.kompetenzen[0];
    expect(istMaschinenKompetenz(m, k)).toBe(true);
    expect(kompetenzSchreibbar(m, k)).toBe(false);
    expect(kompetenzSchreibbar(m, { id: "y", art: "taetigkeit", betriebsmittelId: null })).toBe(true);
  });
  it("Prüfmodus „vorlaeufig“: schreibbar; Schalter aus oder Modul nicht gebucht: nicht schreibbar", () => {
    expect(mittelSchreibbar(m, anlage, PRUEF_LISTE)).toBe(true);
    expect(kompetenzSchreibbar(m, m.kompetenzen[0], PRUEF_LISTE)).toBe(true);
    const aus = kopie(m); aus.einstellungen.branchenmodule = {};
    expect(mittelSchreibbar(aus, anlage, PRUEF_LISTE)).toBe(false);
    const ohnePaket = kopie(m); ohnePaket.pakete = [];
    expect(mittelSchreibbar(ohnePaket, anlage, PRUEF_LISTE)).toBe(false);
  });
});

describe("WP-19 B5: Betriebsmittel, Modul „geplant“ (echte Registry)", () => {
  for (const r of UI_ROLLEN) {
    it(`${r.name}: keine aktive Schreibaktion an der Anlage, Grund steht da, Kernmittel unverändert`, () => {
      const { html } = mittelAnsicht(r);
      if (!html.includes("Presse 1")) { expect(r.rolle).toBe("betriebsrat"); return; }   // Sicht des Betriebsrats enthält keine Betriebsmittel
      expect(html).toContain("Presse 1");                       // Lesen bleibt
      const darfPflegen = darfMittel(r);
      const z = zeile(html, "Presse 1");
      expect(z).not.toMatch(/<select\b/);                        // keine Ausgabe-Auswahl
      expect(knoepfe(z).filter(aktiv)).toEqual([]);              // kein aktiver Knopf
      expect(z).not.toMatch(/draggable|data-zieh/);
      if (darfPflegen) {
        expect(z).toContain(MODUL_NICHT_VERFUEGBAR);
        expect(z).toMatch(/aria-describedby="mittel-grund-bm1"/);
        expect(z).toMatch(/id="mittel-grund-bm1"/);
      }
      /* Kernmittel: für Rollen mit Recht weiter bedienbar */
      const k = zeile(html, "Generalschlüssel");
      expect(k).not.toContain(MODUL_NICHT_VERFUEGBAR);
      if (darfPflegen) { expect(selects(k).length).toBe(1); expect(knoepfe(k).filter(aktiv).length).toBeGreaterThan(0); }
    });
  }
});

describe("WP-19 B5: Betriebsmittel, Prüfmodus „vorlaeufig“", () => {
  for (const r of UI_ROLLEN) {
    it(`${r.name}: Anlage wie ein Kernmittel bedienbar (soweit das Recht reicht), kein Sperrgrund`, () => {
      const { html } = mittelAnsicht(r, PRUEF_LISTE);
      const z = zeile(html, "Presse 1");
      expect(z).not.toContain(MODUL_NICHT_VERFUEGBAR);
      const kern = zeile(html, "Generalschlüssel");
      expect(selects(z).length).toBe(selects(kern).length);
      expect(knoepfe(z).filter(aktiv).length).toBe(knoepfe(kern).filter(aktiv).length);
    });
  }
});

describe("WP-19 B5: Kompetenzen, Maschinenkompetenz bei „geplant“", () => {
  /* Die Karte klappt erst nach Klick auf; für die Prüfung startet die Ansicht mit einer offenen Karte (Prüf-Prop startOffen). */
  const karte = (r, id, liste) => { const sitz = sitzung(r);
    return renderToStaticMarkup(h(Kompetenzen, { sitz, akt, startOffen: id, ...(liste ? { liste } : {}) })); };
  const btn = (s, t) => knoepfe(s).filter((b) => b.text === t);
  for (const r of UI_ROLLEN) {
    it(`${r.name}: Bearbeiten und Löschen der Maschinenkompetenz gesperrt (Grund verknüpft), Kernkompetenz bedienbar`, () => {
      const darfPflegen = darfStaff(r);
      const masch = karte(r, "k-m1"), kern = karte(r, "k-kern");
      expect(masch).toContain("3 angelegt");                       // Lesen bleibt
      if (darfPflegen) {
        for (const t of ["Bearbeiten", "Löschen"]) {
          const b = btn(masch, t);
          expect(b.length, `${t} sichtbar (gesperrt)`).toBe(1);
          expect(aktiv(b[0]), `${t} deaktiviert`).toBe(false);
          expect(b[0].attr).toMatch(/aria-describedby="kompetenz-grund-k-m1"/);
        }
        expect(masch).toContain(MODUL_NICHT_VERFUEGBAR);
        for (const t of ["Bearbeiten", "Löschen"]) expect(aktiv(btn(kern, t)[0])).toBe(true);
      } else {
        expect(btn(masch, "Bearbeiten")).toEqual([]);
        expect(btn(masch, "Löschen")).toEqual([]);
      }
    });
    it(`${r.name}: Prüfmodus „vorlaeufig“ — Maschinenkompetenz bedienbar wie die Kernkompetenz`, () => {
      const masch = karte(r, "k-m1", PRUEF_LISTE);
      expect(masch).not.toContain(MODUL_NICHT_VERFUEGBAR);
      for (const t of ["Bearbeiten", "Löschen"]) {
        const b = btn(masch, t);
        expect(b.length).toBe(darfStaff(r) ? 1 : 0);
        if (b.length) expect(aktiv(b[0])).toBe(true);
      }
    });
  }
  it("Neue Kompetenz: die Alt-Anlage ist bei „geplant“ keine Auswahl (sonst 403 beim Speichern)", () => {
    const m = sitzung(UI_ROLLEN[0]).mandant;
    expect(kompetenzSchreibbar(m, { betriebsmittelId: "bm1" })).toBe(false);
    expect(kompetenzSchreibbar(m, { betriebsmittelId: "bm-k" })).toBe(true);
    expect(kompetenzSchreibbar(m, { betriebsmittelId: "bm1" }, PRUEF_LISTE)).toBe(true);
  });
});
