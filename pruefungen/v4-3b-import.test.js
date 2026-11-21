/* ==========================================================================
   V4-3b (siebter Schnitt) — Hauptansicht Import: Form-Literale und Farbliterale auf Tokens

   Akzeptanz (docs/acc45/work-packages.json, V4-3b): Inline-borderRadius/boxShadow-Literale der Hauptansicht durch
   Tokens ersetzt; keine Änderung an Fachlogik, Rollen, Accessible Names oder Klassennamen.
   Nur das bestehende V4-System: Radiusstufen V4_RADIEN (src/v4/tokens.js) als var(--v4-r-…), Farben aus der Palette C.
   Keine Neugestaltung. Zuordnung wie Plan bis Betreiberkonsole (pruefungen/v4-radiusstufen.mjs).

   Die Hauptansicht umfasst zwei Dateien: den Textimport (src/ansichten/import.jsx, Blatt „Personal importieren“) und
   den Dateiimport (src/ansichten/import-datei.jsx, nur sichtbar mit IMPORT_DATEI_AKTIV = true; heute aus). Datenschutz-
   und Rechteprüfungen laufen serverseitig und sind nicht berührt. Beleg „nichts außer Radius und Farbe“: Rückrechnung
   je Datei — der heutige Quelltext, mit den alten Werten aus der festen Tabelle zurückgesetzt, ergibt byte-gleich den
   Basis-Quelltext (SHA-256 aus der eingecheckten Fixture, ohne Git).

   Farbe: Von den drei Farbliteralen geht eines auf ein Token (Prüfpunkt „ja“ → C.okLight). Die zwei roten Tönungen
   (Prüfpunkt „nein“, Fehlermeldung des Dateiimports) bleiben begründete Ausnahmen (V4-3d): Kein Token der Palette hält
   den Schriftkontrast hell UND dunkel und behält zugleich die Fehlertönung; C.dangerLight senkt ihn hell
   (5,91 → 5,68 und 6,09 → 5,68). Was den Kontrast hält (C.bg, C.flaeche, C.aufAkzent), ist neutral und nähme die
   Fehlertönung weg (Neugestaltung). Die Tabelle der zulässigen Tokens ist unten festgeschrieben.

   Keine Uhr im Prüfwert, kein Netz.
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { inventar, jeHauptansicht, hauptansicht, ohneKommentare } from "../werkzeug/v4-inventar.mjs";
import { v4AlsAltePalette } from "../src/v4/tokens.js";
import { kontrastVon } from "../src/gestalt/lesbar.js";
import { Import } from "../src/ansichten/import.jsx";
import { ImportDateiAnsicht } from "../src/ansichten/import-datei.jsx";
import { erzeugeAblauf } from "../src/lib/import-ablauf.js";
import { erzeugeAttrappe } from "./hilfen/import-schnittstelle-attrappe.mjs";
import { demobestand } from "../src/lib/fachlogik.js";
import { regelStufe, stufenIn, ladeBasisFixture, abgleichMitFixture, gitGegenprobe, sha256 } from "./v4-radiusstufen.mjs";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lies = (d) => readFileSync(path.join(WURZEL, d), "utf8").replace(/\r\n/g, "\n");

/** Basis des Schnitts (origin/integration/release-v4 mit V4-3b Plan bis Betreiberkonsole, A11Y-2 und #456). */
const BASIS = "5f1dc861";
const SCHNITT = "Import";

/** Feste Zuordnung je Stelle (Quelltextreihenfolge). alt = Radius vorher (px); kante = kleinere Kante, falls fest. */
const IMPORT_ZUORDNUNG = {
  "src/ansichten/import-datei.jsx": [{ wo: "Fehlermeldung (role=alert)", alt: 8, stufe: "klein" }],
  "src/ansichten/import.jsx": [{ wo: "Prüfpunkt je Zeile 20×20", alt: 10, kante: 20, stufe: "pille" }],
};

/** Das eine ersetzte Farbliteral (Prüfpunkt „ja“ der Vorschau) und sein Token. */
const FARBE = { datei: "src/ansichten/import.jsx",
  vorher: 'background: z.ok ? "rgba(46,107,79,.14)" : "rgba(179,38,30,.12)",',
  nachher: 'background: z.ok ? C.okLight : "rgba(179,38,30,.12)",' };

/** Begründete Ausnahmen (V4-3d): rote Tönungen ohne Token, das Kontrast UND Fehlertönung hält. */
const AUSNAHMEN = [
  { datei: "src/ansichten/import.jsx", wo: "Prüfpunkt „nein“", literal: "rgba(179,38,30,.12)", rgb: [179, 38, 30], a: 0.12 },
  { datei: "src/ansichten/import-datei.jsx", wo: "Fehlermeldung (role=alert)", literal: "rgba(179,38,30,.10)", rgb: [179, 38, 30], a: 0.10 },
];

/** Deckende Mischung von rgba(r,g,b,a) auf `grund` (Hex), wie vorher dargestellt. */
const altMisch = (rgb, a, grund) => {
  const g = [1, 3, 5].map((i) => parseInt(grund.slice(i, i + 2), 16));
  return "#" + rgb.map((c, i) => Math.round(c * a + g[i] * (1 - a)).toString(16).padStart(2, "0")).join("");
};
const r3 = (x) => Math.round(x * 1000) / 1000;

/** Heutiger Quelltext mit den alten Werten der Tabelle (und dem alten Farbliteral) zurückgesetzt. */
function rueckgerechnet(datei) {
  const stellen = IMPORT_ZUORDNUNG[datei];
  let i = 0;
  let t = lies(datei).replace(/borderRadius: "var\(--v4-r-([a-z]+)\)"/g, (m, stufe) => {
    const s = stellen[i++];
    if (!s || s.stufe !== stufe) return m;          // fällt unten über die Prüfsumme auf
    return `borderRadius: ${s.alt}`;
  });
  if (datei === FARBE.datei) t = t.replace(FARBE.nachher, FARBE.vorher);
  return { text: t, ersetzt: i };
}

describe("V4-3b Import: Messung", () => {
  it("keine Form-Literale; Farbliterale nur die zwei begründeten Ausnahmen; Form 2/2; „voll V4“ ehrlich 0/2", async () => {
    const inv = await inventar();
    const e = jeHauptansicht(inv)[SCHNITT];
    expect(e.sichtbar).toBe(2);
    expect(e.ohneForm).toEqual([]);
    expect(e.formErreicht).toBe(2);
    const mitLiteral = inv.eintraege.filter((x) => hauptansicht(x) === SCHNITT && x.formLiterale > 0).map((x) => x.datei);
    expect(mitLiteral).toEqual([]);
    expect(e.farbLiterale).toBe(AUSNAHMEN.length);
    /* „voll V4“ = Form und Farbe ohne Literale; beide Dateien tragen je eine Ausnahme, also 0/2 (Inline-Stile zählen nicht). */
    expect(e.farbrein).toBe(0);
    expect(e.voll).toBe(0);
  }, 60000);

  it("feste Tabelle: jede Stelle trägt genau die Stufe der Zuordnungsregel", async () => {
    const inv = await inventar();
    const dateien = inv.eintraege.filter((x) => hauptansicht(x) === SCHNITT).map((x) => x.datei).sort();
    expect(Object.keys(IMPORT_ZUORDNUNG).sort()).toEqual(dateien);
    for (const [datei, stellen] of Object.entries(IMPORT_ZUORDNUNG)) {
      for (const s of stellen) expect(regelStufe(s.alt, s.kante), `${datei}: ${s.wo} (${s.alt})`).toBe(s.stufe);
      expect(stufenIn(lies(datei)), datei).toEqual(stellen.map((s) => s.stufe));
    }
    expect(Object.values(IMPORT_ZUORDNUNG).flat()).toHaveLength(2);
  }, 60000);

  it("Tabellenwerte alt/kante stimmen mit der Basis überein, ohne Git aus der Fixture", () => {
    const fx = ladeBasisFixture(WURZEL);
    expect(fx.schnitte[SCHNITT].basis.startsWith(BASIS)).toBe(true);
    expect(abgleichMitFixture(fx, SCHNITT, IMPORT_ZUORDNUNG, lies)).toEqual([]);
  });

  it("Gegenprobe: Fixture gleich dem Basis-Quelltext (git show); ohne Git-Verlauf sichtbar übersprungen", (ctx) => {
    const g = gitGegenprobe(WURZEL, ladeBasisFixture(WURZEL), SCHNITT);
    if (g === null) return ctx.skip("kein Git-Verlauf: der Fixture-Abgleich oben hat geprüft");
    expect(g).toEqual([]);
  });

  it("Rückrechnung: nur Radiuswerte und das eine Farbliteral geändert, sonst byte-gleich zur Basis (ohne Git)", () => {
    const fx = ladeBasisFixture(WURZEL).schnitte[SCHNITT];
    for (const datei of Object.keys(IMPORT_ZUORDNUNG)) {
      const r = rueckgerechnet(datei);
      expect(r.ersetzt, `${datei}: Anzahl Stufen`).toBe(IMPORT_ZUORDNUNG[datei].length);
      expect(sha256(r.text), `${datei}: zurückgerechnet = Basis`).toBe(fx.dateien[datei].sha256);
    }
  });

  it("Mutation der Tabelle (alt, kante, Stufe) fällt ohne Git auf; Kreis bleibt Kreis", () => {
    const fx = ladeBasisFixture(WURZEL);
    const d = "src/ansichten/import.jsx";
    const echt = IMPORT_ZUORDNUNG[d];
    expect(abgleichMitFixture(fx, SCHNITT, { [d]: [{ ...echt[0], alt: 12 }] }, lies))
      .toEqual([`${d}: Prüfpunkt je Zeile 20×20: Basis 10, Tabelle alt 12`]);
    expect(abgleichMitFixture(fx, SCHNITT, { [d]: [{ ...echt[0], kante: 22 }] }, lies))
      .toEqual([`${d}: Prüfpunkt je Zeile 20×20: kante 22 nicht im Stilobjekt der Basis`]);
    /* 10 ist die halbe Kante 20: der Punkt war ein Kreis; pille hält ihn rund (mittel 12 px wäre ebenfalls rund,
       aber nur zufällig; die Regel nimmt pille). Die Meldung (8) bleibt klein. */
    expect(regelStufe(10, 20)).toBe("pille");
    expect(regelStufe(10)).toBe("mittel");
    expect(regelStufe(8)).toBe("klein");
  });

  it("kein neuer Übergang (V4-2d): keine Datei der Hauptansicht hat einen Übergang", () => {
    for (const datei of Object.keys(IMPORT_ZUORDNUNG)) {
      expect((ohneKommentare(lies(datei)).match(/transition/gi) || []).length, datei).toBe(0);
    }
  });
});

describe("V4-3b Import: Farbe", () => {
  it("Prüfpunkt „ja“: C.okLight statt rgba-Literal; die Ausnahmen stehen unverändert und sind die einzigen Literale", () => {
    const q = ohneKommentare(lies(FARBE.datei));
    expect(q.split(FARBE.nachher)).toHaveLength(2);
    expect(q).not.toContain("rgba(46,107,79");
    const rest = Object.keys(IMPORT_ZUORDNUNG).flatMap((d) => (ohneKommentare(lies(d)).match(/rgba?\([^)]*\)|#[0-9a-fA-F]{3,8}\b/g) || [])
      .map((l) => `${d}: ${l}`));
    expect(rest.sort()).toEqual(AUSNAHMEN.map((x) => `${x.datei}: ${x.literal}`).sort());
  });

  it("Prüfpunkt „ja“: Haken (C.ok) auf C.okLight hell und dunkel nicht schlechter als vorher (1.4.3/1.4.11)", () => {
    const werte = {};
    for (const thema of ["hell", "dunkel"]) {
      const p = v4AlsAltePalette(thema);
      const vorher = altMisch([46, 107, 79], 0.14, p.flaeche);
      expect(kontrastVon(p.ok, p.okLight), thema).toBeGreaterThanOrEqual(kontrastVon(p.ok, vorher));
      werte[thema] = { vorher: r3(kontrastVon(p.ok, vorher)), jetzt: r3(kontrastVon(p.ok, p.okLight)),
        punktVorher: r3(kontrastVon(vorher, p.flaeche)), punktJetzt: r3(kontrastVon(p.okLight, p.flaeche)) };
    }
    /* Der Punkt gegen die Kartenfläche war und bleibt eine leichte Tönung (kein 1.4.11-Fall: Bedeutung tragen Haken
       und Lesetext „ja“). */
    expect(werte).toEqual({ hell: { vorher: 5.273, jetzt: 5.432, punktVorher: 1.225, punktJetzt: 1.189 },
      dunkel: { vorher: 7.828, jetzt: 8.343, punktVorher: 1.106, punktJetzt: 1.037 } });
  });

  it("Ausnahmen: kein Token mit Fehlertönung hält den Kontrast; zulässig wären nur neutrale Flächen", () => {
    const H = v4AlsAltePalette("hell"), D = v4AlsAltePalette("dunkel");
    const deckend = Object.keys(H).filter((k) => /^#[0-9a-f]{6}$/i.test(H[k]) && /^#[0-9a-f]{6}$/i.test(D[k]));
    for (const x of AUSNAHMEN) {
      const zulaessig = deckend.filter((k) => [H, D].every((p) =>
        kontrastVon(p.danger, p[k]) >= kontrastVon(p.danger, altMisch(x.rgb, x.a, p.flaeche))));
      /* bg/flaeche/aufAkzent sind die neutralen Grundflächen: Fehlertönung weg = Neugestaltung. */
      expect(zulaessig, x.wo).toEqual(["bg", "flaeche", "aufAkzent"]);
      /* C.dangerLight (der naheliegende Token) senkt hell den Kontrast; dunkel stiege er. */
      const vorherHell = kontrastVon(H.danger, altMisch(x.rgb, x.a, H.flaeche));
      expect(kontrastVon(H.danger, H.dangerLight), x.wo).toBeLessThan(vorherHell);
      expect(kontrastVon(D.danger, D.dangerLight), x.wo).toBeGreaterThan(kontrastVon(D.danger, altMisch(x.rgb, x.a, D.flaeche)));
    }
  });
});

describe("V4-3b Import: Darstellung", () => {
  const sitzung = () => {
    const db = demobestand();
    const m = db.mandanten[0];
    const leitung = (m.personen || []).find((p) => p.rolle === "leitung") || { rolle: "leitung" };
    return { mandant: m, rolle: "kunde", person: leitung };
  };

  it("Textimport: Blatt „Personal importieren“ mit Texten und Knöpfen unverändert, kein fester Radius aus der Datei", () => {
    const x = renderToStaticMarkup(h(Import, { sitz: sitzung(), akt: {}, onClose: () => {} }));
    expect(x).toContain("Personal importieren");
    expect(x).toContain("Beispiel einfügen");
    expect(x).toContain(">Prüfen<");
    expect(x).toContain("Abbrechen");
    expect(x).not.toMatch(/border-radius:10px/);
    expect(x).not.toContain("rgba(46,107,79");
  });

  it("Prüfpunkt der Vorschau im Quelltext: Kreis 20×20 mit Stufe pille, Haken/Kreuz und Lesetext unverändert", () => {
    const q = ohneKommentare(lies("src/ansichten/import.jsx"));
    expect(q).toContain('{{ width: 20, height: 20, borderRadius: "var(--v4-r-pille)", display: "flex"');
    expect(q).toContain('<span className="nurLeser">ja</span>');
    expect(q).toContain('<span className="nurLeser">nein</span>');
    expect(q).toContain("color: z.ok ? C.ok : C.danger");
  });

  it("Dateiimport: Fehlermeldung role=alert mit Stufe klein, Text und Farbe unverändert", async () => {
    const s = erzeugeAttrappe();
    s.upload = async () => ({ ok: false, status: 413, code: "DATEI_ZU_GROSS", fehler: "zu groß" });
    const a = erzeugeAblauf(s);
    await a.hochladen({ name: "personal.csv" });
    const z = a.zustand();
    expect(z.fehler).toMatch(/10 MB/);
    const x = renderToStaticMarkup(h(ImportDateiAnsicht, { z, a, onClose() {} }));
    expect(x).toMatch(/<div role="alert" style="padding:10px 14px;border-radius:var\(--v4-r-klein\);margin-bottom:14px;font-size:13.5px;background:rgba\(179,38,30,.10\)/);
    expect(x).not.toMatch(/border-radius:8px/);
    expect(x).toContain('aria-label="Datei für den Personalimport"');
  });
});
