/* ==========================================================================
   MODUL KONTIMODELLE (WP-19, Strang C)

   Assistent für Schichtgruppen, Versatz und Jahresarbeitszeit im
   kontinuierlichen Betrieb. Nach der Entscheidungsmatrix (Empfehlungen):
   K1 a — arbeitswissenschaftliche Empfehlungen nur als Kennzahlen, keine
   Registerregel; K2 c — Abweichung ausweisen UND Freischichten vorschlagen,
   nie automatisch eintragen; K3 a — Hinweis auf die Ausnahmegrundlage für
   Sonn- und Feiertagsarbeit. Das Modul bleibt „geplant".
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  kontiKennzahlen, versatzVorschlag, kontiSchichtfolge, jahresabgleich, kontiHinweise, pruefeKontiModell,
} from "../server/lib/modul-kontimodelle.mjs";
import { modulVon, pruefeModulRegistry } from "../server/lib/branchenmodule.mjs";
import { KontiAssistent } from "../src/module/kontimodelle.jsx";

/* Dienstarten wie DIENST_VORLAGEN in src/App.jsx (Ausschnitt). */
const DA = {
  F: { start: "06:00", ende: "14:00" }, S: { start: "14:00", ende: "22:00" }, N: { start: "22:00", ende: "06:00" },
  T12: { start: "06:00", ende: "18:00" }, N12: { start: "18:00", ende: "06:00" },
};
/* Zwei Modelle aus MODELLE (src/App.jsx) mit ihren dort dokumentierten, berechneten Kennzahlen. */
const VIER_X_VIER = { gruppen: 4, versatzTage: 4, vollkonti: true, dienste: ["F", "S", "N"],
  tage: ["F", "F", "F", "F", "S", "S", "S", "S", "N", "N", "N", "N", "-", "-", "-", "-"] };
const PANAMA = { gruppen: 4, versatzTage: 7, vollkonti: true, dienste: ["T12", "N12"],
  tage: ["T12", "T12", "-", "-", "T12", "T12", "T12", "-", "-", "T12", "T12", "-", "-", "-",
    "N12", "N12", "-", "-", "N12", "N12", "N12", "-", "-", "N12", "N12", "-", "-", "-"] };
const ZWEI_WOCHE = { gruppen: 2, versatzTage: 7, vollkonti: false, dienste: ["F", "S"],
  tage: ["F", "F", "F", "F", "F", "-", "-", "S", "S", "S", "S", "S", "-", "-"] };

describe("Registry", () => {
  it("das Modul ist registriert, gehört zur Industrie und bleibt bis zur Nutzerentscheidung „geplant“", () => {
    const mod = modulVon("kontimodelle");
    expect(mod.pakete).toEqual(["industrie"]);
    expect(mod.status).toBe("geplant");
    expect(mod.regelIds).toEqual([]);        // K1 a: keine Registerregel
    expect(mod.parameter.sollWochenstunden).toMatchObject({ typ: "zahl", vorlaeufig: true });
    expect(pruefeModulRegistry()).toEqual([]);
  });
});

describe("Kennzahlen (dieselben Zahlen wie die Modellvorlagen)", () => {
  it("4x4 klassisch: 42 Wochenstunden, zwölf Dienste am Stück, vier Nächte, lückenlos", () => {
    const k = kontiKennzahlen(VIER_X_VIER, DA);
    expect(k).toMatchObject({ zyklus: 16, wochenstunden: 42, maxSerie: 12, maxNacht: 4, luecken: 0 });
    expect(k.mindestJeDienst).toEqual({ F: 1, S: 1, N: 1 });
  });
  it("Panama: 42 Wochenstunden, Serie drei, Nachtserie drei", () => {
    expect(kontiKennzahlen(PANAMA, DA)).toMatchObject({ zyklus: 28, wochenstunden: 42, maxSerie: 3, maxNacht: 3, luecken: 0 });
  });
  it("Wochenende bei nicht vollkontinuierlichen Modellen ist keine Lücke", () => {
    expect(kontiKennzahlen(ZWEI_WOCHE, DA)).toMatchObject({ wochenstunden: 40, luecken: 0 });
  });
  it("zu kurze Ruhezeit beim Wechsel und Rückwärtswechsel werden gezählt", () => {
    const rueck = { gruppen: 1, versatzTage: 0, vollkonti: true, dienste: ["F", "S", "N"], tage: ["S", "F", "N", "-"] };
    const k = kontiKennzahlen(rueck, DA);
    expect(k.ruheUnter11).toBe(1);           // Spät 22:00 → Früh 06:00: 8 Stunden
    expect(k.rueckwaerts).toBeGreaterThanOrEqual(1);
    expect(k.luecken).toBeGreaterThan(0);     // eine Gruppe deckt nicht jeden Tag
  });
  it("unbekannte Dienstart: nicht bewertbar statt still null", () => {
    const k = kontiKennzahlen({ ...ZWEI_WOCHE, tage: ["X", "-", "-", "-", "-", "-", "-"] }, DA);
    expect(k.unbekannteDienste).toEqual(["X"]);
  });
});

describe("Assistent: Versatz und Schichtfolge", () => {
  it("schlägt den Versatz vor, der jeden Dienst gleich oft besetzt", () => {
    expect(versatzVorschlag(VIER_X_VIER.tage, 4)).toMatchObject({ versatzTage: 4, gleichmaessig: true });
    expect(versatzVorschlag(["F", "F", "S", "S", "N", "N", "-", "-"], 8)).toMatchObject({ versatzTage: 1, gleichmaessig: true });
    const schief = versatzVorschlag(["F", "F", "S", "-", "-"], 3);
    expect(schief.gleichmaessig).toBe(false);
    expect(schief.grund).toBeTruthy();
  });
  it("erzeugt aus Folge, Gruppen und Versatz die Zeilen je Gruppe", () => {
    const z = kontiSchichtfolge({ tage: ["F", "S", "N", "-"], gruppen: 2, versatzTage: 2 }, 4);
    expect(z).toEqual([["F", "S", "N", "-"], ["N", "-", "F", "S"]]);
  });
  it("prüft die Eingaben des Assistenten streng", () => {
    expect(pruefeKontiModell(VIER_X_VIER)).toBeNull();
    for (const kaputt of [null, { ...VIER_X_VIER, gruppen: 0 }, { ...VIER_X_VIER, gruppen: 41 }, { ...VIER_X_VIER, tage: [] },
      { ...VIER_X_VIER, versatzTage: -1 }, { ...VIER_X_VIER, tage: new Array(400).fill("F") }, { ...VIER_X_VIER, tage: [5] }])
      expect(pruefeKontiModell(kaputt), JSON.stringify(kaputt)).toBeTruthy();
  });
});

describe("Jahresarbeitszeit (K2 c: ausweisen und vorschlagen, nie eintragen)", () => {
  it("42 statt 40 Stunden: Mehrstunden im Jahr und vorgeschlagene Freischichten", () => {
    const j = jahresabgleich(kontiKennzahlen(VIER_X_VIER, DA), 40, 8);
    expect(j.differenzJahr).toBe(104);        // 2 h × 52 Wochen
    expect(j.freischichtenVorschlag).toBe(13); // 104 / 8
    expect(j.eingetragen).toBe(false);
  });
  it("genau getroffen: keine Freischicht; zu wenig: Minusstunden, keine Freischicht", () => {
    expect(jahresabgleich(kontiKennzahlen(ZWEI_WOCHE, DA), 40, 8)).toMatchObject({ differenzJahr: 0, freischichtenVorschlag: 0 });
    expect(jahresabgleich(kontiKennzahlen(ZWEI_WOCHE, DA), 42, 8)).toMatchObject({ differenzJahr: -104, freischichtenVorschlag: 0 });
  });
  it("ohne Sollzeit: nicht bewertbar", () => {
    expect(jahresabgleich(kontiKennzahlen(ZWEI_WOCHE, DA), null, 8)).toMatchObject({ offen: true });
  });
});

describe("Hinweise (K1 a, K3 a) — nur Text, keine Stufe, kein Befund", () => {
  it("lange Serien, Nachtserien, Rückwärtswechsel und Sonntagsarbeit erzeugen Hinweise", () => {
    const hw = kontiHinweise(kontiKennzahlen(VIER_X_VIER, DA), VIER_X_VIER);
    const kennungen = hw.map((x) => x.kennung);
    expect(kennungen).toContain("serie");
    expect(kennungen).toContain("sonntag");
    for (const x of hw) { expect(x.stufe).toBeUndefined(); expect(x.text.length).toBeGreaterThan(10); }
  });
  it("Zweischicht ohne Wochenende: kein Sonntagshinweis", () => {
    expect(kontiHinweise(kontiKennzahlen(ZWEI_WOCHE, DA), ZWEI_WOCHE).map((x) => x.kennung)).not.toContain("sonntag");
  });
});

describe("Oberfläche", () => {
  it("der Assistent zeigt Kennzahlen und schreibt nichts von selbst", () => {
    let uebernommen = null;
    const html = renderToStaticMarkup(h(KontiAssistent, { dienstarten: DA, sollWochenstunden: 40, start: VIER_X_VIER,
      onUebernehmen: (x) => { uebernommen = x; } }));
    expect(html).toContain("Wochenstunden");
    expect(html).toContain("42");
    expect(html).toContain("Freischichten");
    expect(uebernommen).toBeNull();
  });
});
