/* ==========================================================================
   MODUL KONTIMODELLE — Fertigstellung (WP-19.12, K1–K3)

   Akzeptanzkriterien als Tests, vor der Umsetzung geschrieben:

   AK-1  K2: Sollzeit und Freischichtdauer sind Angaben des Betriebs mit Quelle,
         nie ein stiller Standard. 40 Wochenstunden und 8 Stunden je Freischicht
         stehen zwar noch als „vorläufige Vorgabe“ in der Modul-Registry, wirken
         aber nirgends. Ohne Sollzeit kein Abgleich; ohne Freischichtdauer kein
         Vorschlag; Freischichten werden nur vorgeschlagen, die Übernahme braucht
         eine ausdrückliche Bestätigung.
   AK-2  K1: Kennzahlen zu Nachtarbeit, Schichtrotation und Erholungszeiten;
         Richtwert-Hinweise aus Regelwerten (Ausgangswert „ungeprüft“, Betrieb
         kann Wert mit Quelle eintragen), mit Regel-ID und Prüfstatus.
   AK-3  K3: Sonn- und Feiertagsarbeit: neutraler Hinweis, keine Aussage zur
         Zulässigkeit (FN-30).
   AK-4  Eine Rechnung statt zwei: modellPruefen in src/App.jsx liefert exakt die
         Zahlen des früheren Stands (Referenz: pruefungen/hilfen/konti-modelle-
         referenz.json, aus dem Code vor der Zusammenführung erzeugt) und rechnet
         nicht mehr selbst.
   AK-5  Rollen: Regelwerte nur mit org.edit; Betriebsprotokoll nur Anzahlen.
   AK-6  Oberfläche: Parameterfelder, Assistent ohne stille Vorgaben, Übernahme
         mit Bestätigung, 360 px ohne feste Breiten.
   ========================================================================== */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  kontiKennzahlen, jahresabgleich, kontiHinweise, KONTI_RICHTWERTE, kontiParameter, kontiAbgleich, freischichtUebernahme,
  kontiAuskunft,
} from "../server/lib/modul-kontimodelle.mjs";
import { INDUSTRIE_REGELWERTE } from "../server/lib/modul-regelwerte.mjs";
import { modulVon, modulParameter } from "../server/lib/branchenmodule.mjs";
import { industrieProtokoll } from "../server/lib/modul-industrie-protokoll.mjs";
import { branchenbestand, schreibeAls } from "./hilfen/branchenbetrieb.mjs";
import { KontiAssistent, KontiRegelwerte } from "../src/module/kontimodelle.jsx";
import { MODELLE, modellPruefen } from "../src/App.jsx";

const DA = {
  F: { start: "06:00", ende: "14:00" }, S: { start: "14:00", ende: "22:00" }, N: { start: "22:00", ende: "06:00" },
  T12: { start: "06:00", ende: "18:00" }, N12: { start: "18:00", ende: "06:00" },
};
const VIER_X_VIER = { gruppen: 4, versatzTage: 4, vollkonti: true, dienste: ["F", "S", "N"],
  tage: ["F", "F", "F", "F", "S", "S", "S", "S", "N", "N", "N", "N", "-", "-", "-", "-"] };
const PANAMA = { gruppen: 4, versatzTage: 7, vollkonti: true, dienste: ["T12", "N12"],
  tage: ["T12", "T12", "-", "-", "T12", "T12", "T12", "-", "-", "T12", "T12", "-", "-", "-",
    "N12", "N12", "-", "-", "N12", "N12", "N12", "-", "-", "N12", "N12", "-", "-", "-"] };
const ZWEI_WOCHE = { gruppen: 2, versatzTage: 7, vollkonti: false, dienste: ["F", "S"],
  tage: ["F", "F", "F", "F", "F", "-", "-", "S", "S", "S", "S", "S", "-", "-"] };
const HEUTE = "2026-11-03";
const betrieb = (regelwerte, branchenmodule) => ({ pakete: ["industrie"],
  einstellungen: { ...(regelwerte ? { regelwerte } : {}), ...(branchenmodule ? { branchenmodule } : {}) } });
const BETRIEB_WERT = (wert, extra = {}) => ({ wert, quelle: "Tarifvertrag Metall NRW", fundstelle: "§ 3", version: "2026", pruefstatus: "provisional", ...extra });
const GEPRUEFT = (wert) => ({ wert, quelle: "Betriebsvereinbarung Konti 2026", fundstelle: "Anlage 2", pruefstatus: "geprueft", geprueftAm: "2026-10-01", geprueftVon: "l1" });
const SOLL = "KONTI-ARBEITSZEIT-01", FS = "KONTI-FREISCHICHT-01";

describe("AK-1 K2: keine stille Vorgabe", () => {
  it("die Registry nennt 40 und 8 weiter als vorläufige Vorgabe — wirksam sind sie nicht", () => {
    const reg = modulVon("kontimodelle").parameter;
    expect(reg.sollWochenstunden).toMatchObject({ standard: 40, vorlaeufig: true });
    expect(reg.stundenJeFreischicht).toMatchObject({ standard: 8, vorlaeufig: true });
    expect(modulParameter(betrieb(), "kontimodelle").sollWochenstunden).toBe(40);     // so liest sie die Registry
    const p = kontiParameter(betrieb(), HEUTE);
    expect(p.sollWochenstunden).toMatchObject({ wert: null, herkunft: "nicht-gesetzt" });
    expect(p.stundenJeFreischicht).toMatchObject({ wert: null, herkunft: "nicht-gesetzt" });
  });
  it("Regelwert des Betriebs gilt, mit Quelle, Fundstelle und Prüfstatus; geprüft braucht den Serververmerk", () => {
    const p = kontiParameter(betrieb({ [SOLL]: BETRIEB_WERT(35), [FS]: GEPRUEFT(7.5) }), HEUTE);
    expect(p.sollWochenstunden).toMatchObject({ wert: 35, herkunft: "betrieb", pruefstatus: "provisional", quelle: "Tarifvertrag Metall NRW", fundstelle: "§ 3", geprueft: false });
    expect(p.stundenJeFreischicht).toMatchObject({ wert: 7.5, herkunft: "betrieb", pruefstatus: "geprueft", geprueft: true });
  });
  it("ein ausdrücklich gespeicherter Modulparameter (Altweg) zählt als Angabe ohne Quelle; der Regelwert geht vor", () => {
    const alt = kontiParameter(betrieb(null, { kontimodelle: { an: true, parameter: { sollWochenstunden: 38 } } }), HEUTE);
    expect(alt.sollWochenstunden).toMatchObject({ wert: 38, herkunft: "modulparameter", quelle: null, pruefstatus: "provisional" });
    expect(alt.sollWochenstunden.hinweis).toMatch(/ohne Quelle/);
    expect(alt.stundenJeFreischicht.wert).toBeNull();                                // nur ausdrücklich Gespeichertes zählt
    const beide = kontiParameter(betrieb({ [SOLL]: BETRIEB_WERT(35) }, { kontimodelle: { an: true, parameter: { sollWochenstunden: 38 } } }), HEUTE);
    expect(beide.sollWochenstunden).toMatchObject({ wert: 35, herkunft: "betrieb" });
  });
  it("ohne Sollzeit: kein Abgleich, keine Zahl, Hinweis „Sollzeit nicht hinterlegt“", () => {
    const k = kontiKennzahlen(VIER_X_VIER, DA);
    const a = kontiAbgleich(betrieb(), k, HEUTE);
    expect(a).toMatchObject({ offen: true, grund: "sollzeit-fehlt", eingetragen: false });
    expect(a.text).toMatch(/Sollzeit nicht hinterlegt/);
    expect(a).not.toHaveProperty("differenzJahr");
    expect(a).not.toHaveProperty("freischichtenVorschlag");
  });
  it("mit Sollzeit, ohne Freischichtdauer: Abweichung ja, Vorschlag nein", () => {
    const a = kontiAbgleich(betrieb({ [SOLL]: BETRIEB_WERT(40) }), kontiKennzahlen(VIER_X_VIER, DA), HEUTE);
    expect(a).toMatchObject({ offen: false, differenzJahr: 104, freischichtenVorschlag: null, eingetragen: false, verbindlich: false });
    expect(a.freischichtHinweis).toMatch(/Dauer einer Freischicht nicht hinterlegt/);
  });
  it("mit beiden Werten: Vorschlag, nie verbindlich, mit Herkunft; „nicht geprüft“ bei vorläufigen Angaben", () => {
    const k = kontiKennzahlen(VIER_X_VIER, DA);
    const a = kontiAbgleich(betrieb({ [SOLL]: BETRIEB_WERT(40), [FS]: BETRIEB_WERT(8) }), k, HEUTE);
    expect(a).toMatchObject({ differenzJahr: 104, freischichtenVorschlag: 13, stundenJeFreischicht: 8, sollWochenstunden: 40,
      eingetragen: false, verbindlich: false, wochenJeJahr: 52, geprueft: false });
    expect(a.hinweis).toMatch(/Angaben des Betriebs, nicht geprüft\.$/);
    expect(a.hinweis).toContain("Tarifvertrag Metall NRW");
    const g = kontiAbgleich(betrieb({ [SOLL]: GEPRUEFT(40), [FS]: GEPRUEFT(8) }), k, HEUTE);
    expect(g).toMatchObject({ geprueft: true, freischichtenVorschlag: 13 });
    expect(g.hinweis).not.toMatch(/nicht geprüft/);
    expect(g.hinweis).not.toMatch(/Angaben des Betriebs/);
    expect(g.hinweis).toContain("Betriebsvereinbarung Konti 2026");
  });
  it("Freischichten werden abgerundet: 104 Stunden bei 7,5 Stunden je Freischicht sind 13, nicht 14", () => {
    const a = kontiAbgleich(betrieb({ [SOLL]: BETRIEB_WERT(40), [FS]: BETRIEB_WERT(7.5) }), kontiKennzahlen(VIER_X_VIER, DA), HEUTE);
    expect(a.freischichtenVorschlag).toBe(13);
  });
  it("ein unsinniger Altwert im Modulparameter (außerhalb der Grenzen) zählt nicht", () => {
    for (const v of [0, -3, 500, "40", NaN, null]) {
      const p = kontiParameter(betrieb(null, { kontimodelle: { an: true, parameter: { sollWochenstunden: v } } }), HEUTE);
      expect(p.sollWochenstunden, String(v)).toMatchObject({ wert: null, herkunft: "nicht-gesetzt" });
    }
  });
  it("unter Soll: Minusstunden, kein Vorschlag; genau getroffen: null", () => {
    const k = kontiKennzahlen(ZWEI_WOCHE, DA);
    expect(kontiAbgleich(betrieb({ [SOLL]: BETRIEB_WERT(42), [FS]: BETRIEB_WERT(8) }), k, HEUTE)).toMatchObject({ differenzJahr: -104, freischichtenVorschlag: 0 });
    expect(kontiAbgleich(betrieb({ [SOLL]: BETRIEB_WERT(40), [FS]: BETRIEB_WERT(8) }), k, HEUTE)).toMatchObject({ differenzJahr: 0, freischichtenVorschlag: 0 });
  });
  it("Übernahme nur auf ausdrückliche Bestätigung, nur mit Vorschlag > 0, nie bei offenem Abgleich", () => {
    const k = kontiKennzahlen(VIER_X_VIER, DA);
    const a = kontiAbgleich(betrieb({ [SOLL]: BETRIEB_WERT(40), [FS]: BETRIEB_WERT(8) }), k, HEUTE);
    expect(freischichtUebernahme(a, { bestaetigt: false })).toMatchObject({ ok: false });
    expect(freischichtUebernahme(a, {})).toMatchObject({ ok: false });
    expect(freischichtUebernahme(a, { bestaetigt: "ja" })).toMatchObject({ ok: false });
    const ok = freischichtUebernahme(a, { bestaetigt: true });
    expect(ok).toMatchObject({ ok: true, vorschlag: { anzahl: 13, stundenJeFreischicht: 8, sollWochenstunden: 40, differenzJahr: 104 } });
    expect(freischichtUebernahme(kontiAbgleich(betrieb(), k, HEUTE), { bestaetigt: true })).toMatchObject({ ok: false });
    const kein = kontiAbgleich(betrieb({ [SOLL]: BETRIEB_WERT(42), [FS]: BETRIEB_WERT(8) }), kontiKennzahlen(ZWEI_WOCHE, DA), HEUTE);
    expect(freischichtUebernahme(kein, { bestaetigt: true })).toMatchObject({ ok: false });
    expect(freischichtUebernahme(null, { bestaetigt: true })).toMatchObject({ ok: false });
  });
  it("die reine Funktion jahresabgleich bleibt wie sie war", () => {
    expect(jahresabgleich(kontiKennzahlen(VIER_X_VIER, DA), 40, 8)).toMatchObject({ differenzJahr: 104, freischichtenVorschlag: 13, eingetragen: false });
    expect(jahresabgleich(kontiKennzahlen(VIER_X_VIER, DA), null, 8)).toMatchObject({ offen: true });
  });
});

describe("AK-2 K1: Kennzahlen und Richtwerte aus Regelwerten", () => {
  it("Richtwerte sind die Ausgangswerte der Regelwerte — kein zweiter Satz Zahlen", () => {
    expect(KONTI_RICHTWERTE).toEqual({ serie: INDUSTRIE_REGELWERTE["KONTI-RICHTWERT-SERIE-01"].ausgangswert, nachtserie: INDUSTRIE_REGELWERTE["KONTI-RICHTWERT-NACHT-01"].ausgangswert });
  });
  it("neue Kennzahlen: Nachtstunden je Woche, Nachtdienste, kürzeste Ruhe, Rotation", () => {
    const a = kontiKennzahlen(VIER_X_VIER, DA);
    expect(a).toMatchObject({ nachtDienste: 4, kuerzesteRuhe: 16, rotation: "vorwaerts", vorwaerts: 2, rueckwaerts: 0 });
    expect(a.nachtStundenWoche).toBe(12.25);              // 4 Nächte à 7 Stunden im Fenster 23–6 Uhr, 16-Tage-Zyklus
    const p = kontiKennzahlen(PANAMA, DA);
    expect(p).toMatchObject({ kuerzesteRuhe: 12, rotation: "keine", nachtDienste: 7 });
    const rueck = kontiKennzahlen({ gruppen: 1, versatzTage: 0, vollkonti: true, dienste: ["F", "S", "N"], tage: ["S", "F", "N", "-"] }, DA);
    expect(rueck).toMatchObject({ kuerzesteRuhe: 8, rotation: "gemischt" });
    expect(kontiKennzahlen({ gruppen: 1, versatzTage: 0, vollkonti: true, dienste: ["F", "S", "N"], tage: ["N", "S", "F", "-"] }, DA)).toMatchObject({ rotation: "rueckwaerts" });
    expect(kontiKennzahlen({ ...ZWEI_WOCHE, tage: ["X", "X", "-"] }, DA).kuerzesteRuhe).toBeNull();     // unbekannte Dienstzeiten: nicht bewertbar
  });
  it("Hinweise folgen dem Regelwert: Ausgangswert „ungeprüft“ mit FN-28, Wert des Betriebs mit Quelle", () => {
    const k = kontiKennzahlen(VIER_X_VIER, DA);
    const std = kontiHinweise(k, VIER_X_VIER).find((x) => x.kennung === "serie");
    expect(std.text).toMatch(/ungeprüft/);
    expect(std.text).toMatch(/FN-28/);
    expect(std).toMatchObject({ regelId: "KONTI-RICHTWERT-SERIE-01", pruefstatus: "provisional" });
    const betr = kontiHinweise(k, VIER_X_VIER, { m: betrieb({ "KONTI-RICHTWERT-SERIE-01": BETRIEB_WERT(8) }), heute: HEUTE }).find((x) => x.kennung === "serie");
    expect(betr.text).toContain("Tarifvertrag Metall NRW");
    expect(betr.text).toContain("8");
    const geprueft = kontiHinweise(k, VIER_X_VIER, { m: betrieb({ "KONTI-RICHTWERT-SERIE-01": GEPRUEFT(8) }), heute: HEUTE }).find((x) => x.kennung === "serie");
    expect(geprueft).toMatchObject({ pruefstatus: "geprueft" });
    expect(geprueft.text).not.toMatch(/ungeprüft/);
    const lang = kontiHinweise(k, VIER_X_VIER, { m: betrieb({ "KONTI-RICHTWERT-SERIE-01": BETRIEB_WERT(12) }), heute: HEUTE });
    expect(lang.some((x) => x.kennung === "serie")).toBe(false);                      // 12 Dienste liegen nicht über dem Wert 12
  });
  it("Nachtserie-Richtwert aus dem eigenen Regelwert", () => {
    const k = kontiKennzahlen(VIER_X_VIER, DA);          // vier Nächte am Stück
    expect(kontiHinweise(k, VIER_X_VIER).some((x) => x.kennung === "nachtserie")).toBe(true);
    expect(kontiHinweise(k, VIER_X_VIER, { m: betrieb({ "KONTI-RICHTWERT-NACHT-01": BETRIEB_WERT(4) }), heute: HEUTE }).some((x) => x.kennung === "nachtserie")).toBe(false);
  });
  it("Hinweise sind Text ohne Stufe und ohne Wertung als Rechtsverstoß", () => {
    for (const x of kontiHinweise(kontiKennzahlen(VIER_X_VIER, DA), VIER_X_VIER)) {
      expect(x.stufe).toBeUndefined();
      expect(x.text).not.toMatch(/Versto|rechtswidrig|verboten|unzul/i);
    }
  });
  it("kontiAuskunft: die fünf Regelwerte mit Regel-ID, Wert, Herkunft, Prüfstatus, Fachnachweis", () => {
    const a = kontiAuskunft(betrieb({ [SOLL]: GEPRUEFT(38) }), HEUTE);
    expect(a.map((x) => x.regelId)).toEqual(["KONTI-ARBEITSZEIT-01", "KONTI-FREISCHICHT-01", "KONTI-RICHTWERT-NACHT-01", "KONTI-RICHTWERT-SERIE-01"]);
    expect(a.find((x) => x.regelId === SOLL)).toMatchObject({ wert: 38, pruefstatus: "geprueft", fachnachweis: "FN-29", quelle: "Betriebsvereinbarung Konti 2026" });
    expect(a.find((x) => x.regelId === FS)).toMatchObject({ wert: null, herkunft: "nicht-gesetzt" });
    expect(a.find((x) => x.regelId === "KONTI-RICHTWERT-NACHT-01")).toMatchObject({ wert: 3, herkunft: "ausgangswert", fachnachweis: "FN-28" });
  });
});

describe("AK-3 K3: Sonn- und Feiertagsarbeit — neutraler Hinweis", () => {
  it("benennt, dass eine Ausnahme, Bewilligung oder ein Ausgleich nötig sein kann, und sagt nichts zur Zulässigkeit", () => {
    const hw = kontiHinweise(kontiKennzahlen(VIER_X_VIER, DA), VIER_X_VIER).find((x) => x.kennung === "sonntag");
    expect(hw.text).toMatch(/kann/);
    expect(hw.text).toMatch(/Ausnahme/);
    expect(hw.text).toMatch(/Bewilligung/);
    expect(hw.text).toMatch(/prüfen/);
    expect(hw.text).toContain("FN-30");
    expect(hw.text).not.toMatch(/nur mit|zulässig|erlaubt|verboten|nicht gestattet/i);
    expect(hw.text).not.toMatch(/§§ 10, 13/);
  });
  it("Zweischicht ohne Wochenende bleibt ohne Sonntagshinweis", () => {
    expect(kontiHinweise(kontiKennzahlen(ZWEI_WOCHE, DA), ZWEI_WOCHE).map((x) => x.kennung)).not.toContain("sonntag");
  });
});

describe("AK-4 Eine Rechnung statt zwei", () => {
  const referenz = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "hilfen", "konti-modelle-referenz.json"), "utf8"));
  it("die Referenz deckt alle Modellvorlagen ab", () => {
    expect(Object.keys(referenz).filter((k) => k !== "_synthetisch").sort()).toEqual(MODELLE.map((m) => m.id).sort());
    expect(MODELLE.length).toBeGreaterThanOrEqual(8);
  });
  it("modellPruefen liefert für jede Vorlage genau die Zahlen des früheren Stands", () => {
    for (const mo of MODELLE) expect(modellPruefen(mo), mo.id).toEqual(referenz[mo.id]);
  });
  it("auch für Modelle mit kurzer Ruhe, Lücken, Einzeldiensten und 24-Stunden-Diensten (die Vorlagen haben dort nur Nullen)", () => {
    const syn = Object.entries(referenz._synthetisch);
    expect(syn.length).toBe(5);
    expect(syn.some(([, s]) => s.erwartet.ruhe > 0)).toBe(true);
    expect(syn.some(([, s]) => s.erwartet.luecken > 0)).toBe(true);
    expect(syn.some(([, s]) => s.erwartet.einzel > 0)).toBe(true);
    for (const [k, s] of syn) expect(modellPruefen(s.modell), k).toEqual(s.erwartet);
  });
  it("modellPruefen rechnet nicht mehr selbst: der Funktionskörper ruft die Modulrechnung", () => {
    const quelle = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "App.jsx"), "utf8").replace(/\r\n/g, "\n");
    const start = quelle.indexOf("function modellPruefen(");
    const ende = quelle.indexOf("\n}\n", start);
    const rumpf = quelle.slice(start, ende);
    expect(rumpf).toContain("kontiKennzahlen(");
    expect(rumpf.split("\n").length).toBeLessThan(16);
    expect(rumpf).not.toMatch(/for \(/);
    expect(rumpf).not.toContain("[[0, 360]");                       // das Nachtfenster steht nur noch im Modul
  });
});

describe("AK-5 Rollen und Betriebsprotokoll", () => {
  const g = () => branchenbestand({ pakete: ["industrie"] });
  const W = { wert: 37.5, quelle: "Arbeitsvertrag-Muster", fundstelle: "§ 4", pruefstatus: "provisional" };
  it("Leitung speichert die Sollzeit; Planung, Schichtverantwortung, Beschäftigte und Betriebsrat können es nicht", () => {
    const lt = schreibeAls(g(), "LT", (m) => { m.einstellungen.regelwerte = { [SOLL]: W }; });
    expect(lt.mandanten[0].einstellungen.regelwerte[SOLL]).toMatchObject({ wert: 37.5, geaendertVon: "l1", quelle: "Arbeitsvertrag-Muster" });
    for (const r of ["PL", "SV", "MA", "BR"]) {
      const neu = schreibeAls(g(), r, (m) => { m.einstellungen.regelwerte = { [SOLL]: W }; });
      const stand = neu && !neu.verweigert ? neu : g();
      expect(stand.mandanten[0].einstellungen.regelwerte, r).toBeUndefined();
    }
  });
  it("Formfehler: 422", () => {
    const r = schreibeAls(g(), "LT", (m) => { m.einstellungen.regelwerte = { [SOLL]: { ...W, wert: 90 } }; });
    expect(r).toMatchObject({ status: 422 });
    expect(r.verweigert).toMatch(/Sollwochenarbeitszeit/);
  });
  it("Betriebsprotokoll: nur die Anzahl der geänderten Regelwerte, ohne Werte und Quellen", () => {
    const alt = { mandanten: [{ id: "m1", einstellungen: {} }] };
    const neu = { mandanten: [{ id: "m1", einstellungen: { regelwerte: { [SOLL]: W, [FS]: W } } }] };
    const e = industrieProtokoll(alt, neu);
    expect(e).toEqual([{ ereignis: "regelwert-geaendert", detail: "2 Regelwert(e)" }]);
    expect(JSON.stringify(e)).not.toMatch(/37|Arbeitsvertrag/);
  });
});

describe("AK-6 Oberfläche", () => {
  const html = (el) => renderToStaticMarkup(el);
  const kein = /(?<![-\w])width:\s*\d{3,}px/;
  it("Assistent ohne Sollzeit: „Sollzeit nicht hinterlegt“, kein stiller Wert 40, keine Freischicht-Zahl", () => {
    const t = html(h(KontiAssistent, { dienstarten: DA, start: VIER_X_VIER }));
    expect(t).toMatch(/Sollzeit nicht hinterlegt/);
    expect(t).not.toMatch(/40 Wochenstunden|40,/);
    expect(t).not.toMatch(/Vorschlag, nicht eingetragen/);
    expect(t).toContain("Wochenstunden");
    expect(t).toContain("Nachtstunden");
    expect(t).toContain("Rotation");
    expect(t).toMatch(/kürzeste Ruhe/i);
  });
  it("Assistent mit Parametern: Vorschlag „nicht eingetragen“ mit Herkunft; Übernahme gesperrt, bis bestätigt", () => {
    const m = betrieb({ [SOLL]: BETRIEB_WERT(40), [FS]: BETRIEB_WERT(8) });
    const t = html(h(KontiAssistent, { dienstarten: DA, start: VIER_X_VIER, m, heute: HEUTE, onFreischichten: () => {} }));
    expect(t).toMatch(/Vorschlag, nicht eingetragen/);
    expect(t).toContain("13");
    expect(t).toContain("Tarifvertrag Metall NRW");
    expect(t).toMatch(/nicht geprüft/);
    expect(t).toMatch(/<input[^>]*type="checkbox"/);
    expect(t).toMatch(/<button[^>]*disabled[^>]*>[^<]*Vorschlag übernehmen/);
    expect(t).not.toMatch(kein);
  });
  it("ohne Übernahme-Rückruf gibt es keinen Übernahmeknopf; der Rückruf der Schichtfolge bleibt wie bisher", () => {
    const t = html(h(KontiAssistent, { dienstarten: DA, start: VIER_X_VIER, m: betrieb({ [SOLL]: BETRIEB_WERT(40), [FS]: BETRIEB_WERT(8) }), heute: HEUTE }));
    expect(t).not.toMatch(/Vorschlag übernehmen/);
    let u = null;
    const t2 = html(h(KontiAssistent, { dienstarten: DA, start: VIER_X_VIER, onUebernehmen: (x) => { u = x; } }));
    expect(t2).toMatch(/Als Schichtfolge übernehmen/);
    expect(u).toBeNull();
  });
  it("Hinweise nennen Regel-ID und Prüfstatus; der Sonntagshinweis ist neutral", () => {
    const t = html(h(KontiAssistent, { dienstarten: DA, start: VIER_X_VIER }));
    expect(t).toMatch(/KONTI-RICHTWERT-SERIE-01/);
    expect(t).toMatch(/vorläufig/);
    expect(t).toMatch(/Bewilligung/);
    expect(t).not.toMatch(/nur mit einer Ausnahme/);
  });
  it("Regelwertfelder: vier Fieldsets, beschriftet, ohne feste Breite", () => {
    const t = html(h(KontiRegelwerte, { m: betrieb(), onAendern: () => {} }));
    expect((t.match(/<fieldset/g) || []).length).toBe(4);
    for (const id of ["KONTI-ARBEITSZEIT-01", "KONTI-FREISCHICHT-01", "KONTI-RICHTWERT-SERIE-01", "KONTI-RICHTWERT-NACHT-01"]) expect(t).toContain(id);
    expect(t).not.toMatch(kein);
    expect(t).toMatch(/kein Wert/);
  });
});
