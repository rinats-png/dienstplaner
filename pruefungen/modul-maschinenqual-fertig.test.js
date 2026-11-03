/* ==========================================================================
   MODUL MASCHINENQUALIFIKATION — Fertigstellung (WP-19.11, M1–M3)

   Akzeptanzkriterien als Tests, vor der Umsetzung geschrieben:

   AK-1  M2: Unterweisungsintervall als Regelwert. 12 Monate sind nur der zu
         prüfende Ausgangswert; kürzer geht immer; länger gibt einen Hinweis
         („Quelle prüfen“); mit geprüfter Höchstgrenze (Quelle + Fundstelle)
         weist der Server das Verlängern darüber ab (422). Die Vorlage
         verlängert nie über die Höchstgrenze.
   AK-2  M3: Qualifikationsgrundlage (Nachweisart, Bezug, Datum) am Nachweis der
         „zur Prüfung befähigten Person“; ohne Grundlage „nicht belegt“; die
         befähigte Person zählt nicht als Bedienung.
   AK-3  M1: Matrix Person × Anlage je Rolle — voll (Planung, Leitung, Kunde),
         eigene Zeile (Beschäftigte, Schichtverantwortung), Aggregat ohne
         Kleinstgruppen (Betriebsrat), sonst nichts (fail-closed). Ablaufliste.
   AK-4  Rollensicht: die Qualifikationsgrundlage sehen nur Planung, Leitung,
         Kunde und die Person selbst.
   AK-5  Betriebsprotokoll nur mit Anzahlen; Anonymisierung entfernt die Grundlage.
   AK-6  Hinweis statt Sperre (G4, G5); Befunde bleiben „hinweis“.
   AK-7  Oberfläche: Matrix mobil (Karten) und breit (Tabelle), Listen, Regelwert.
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  maschinenKompetenzVorlage, pruefeMaschinenKompetenz, maschinenqualBefunde, maschinenqualZusammen, qualifikationsMatrix,
  intervallBewertung, intervallHinweise, QUAL_GRUNDLAGE_ARTEN, pruefeQualifikationsgrundlage, qualifikationsgrundlageText,
  befaehigtePersonenListe, matrixAnsicht, ablaufListe, maschinenqualAuskunft, MASCHQUAL_WIEDERHOLUNG_MONATE,
} from "../server/lib/modul-maschinenqual.mjs";
import { industrieProtokoll } from "../server/lib/modul-industrie-protokoll.mjs";
import { anonymisiere } from "../server/lib/aufbewahrung.mjs";
import { BRANCHENMODULE } from "../server/lib/branchenmodule.mjs";
import { pruefeRegel } from "../src/regelbaukasten.js";
import { kompetenzStand } from "../src/regelwerk.js";
import { branchenbestand, schreibeAls, SITZUNGEN } from "./hilfen/branchenbetrieb.mjs";
import { bestandFuerRolle } from "../server/lib/rechte.mjs";
import { QualifikationsMatrix, BefaehigtePersonen, AblaufHinweise, IntervallHinweise } from "../src/module/maschinenqual.jsx";
import { RegelwertFeld } from "../src/module/regelwerte.jsx";

const HEUTE = "2026-11-02";
const LAEUFT = { wochentage: [true, true, true, true, true, false, false] };
const PRESSE = { id: "bm1", art: "anlage", name: "Presse 3", personId: null, mindestBesetzung: { F: 2 }, laufzeit: LAEUFT };
const FRAESE = { id: "bm2", art: "anlage", name: "Fräse", personId: null, mindestBesetzung: { F: 1 }, laufzeit: LAEUFT };
const K_PRESSE = { id: "k1", name: "Bedienung Presse 3", art: "geraet", betriebsmittelId: "bm1", wiederholungMonate: 12, pflichtFuer: [], zugedacht: [] };
const K_BEFAEHIGT = { id: "k9", name: "Befähigte Person Presse 3", art: "geraet", betriebsmittelId: "bm1", wiederholungMonate: 36, befaehigtePerson: true, pflichtFuer: [], zugedacht: [] };
const GRUND = { art: "berufsausbildung", bezug: "Zeugnis Industriemechaniker 2014", datum: "2014-07-01" };
const person = (id, nachweise = [], extra = {}) => ({ id, vorname: "V", nachname: id, status: "aktiv", kompetenzNachweise: nachweise, ...extra });
/* Presse 3, Unterweisung am Stichtag + 12 Monate − 14 Tage: „läuft ab“. */
const P_LAEUFT_AB = person("a", [{ kompetenzId: "k1", ab: "2025-11-16" }]);
const P_ABGELAUFEN = person("b", [{ kompetenzId: "k1", ab: "2024-01-01" }]);
const P_GUELTIG = person("c", [{ kompetenzId: "k1", ab: "2026-09-01" }, { kompetenzId: "k9", ab: "2026-01-01", qualifikationsgrundlage: GRUND }]);
const P_OHNE = person("d");
const P_BEFAEHIGT_OHNE_GRUND = person("e", [{ kompetenzId: "k9", ab: "2026-01-01" }]);
const AKTIV = BRANCHENMODULE.map((x) => (x.id === "anlagen" || x.id === "maschinenqual" ? { ...x, status: "vorlaeufig" } : x));
const betrieb = ({ regelwerte, personen = [P_LAEUFT_AB, P_ABGELAUFEN, P_GUELTIG, P_OHNE, P_BEFAEHIGT_OHNE_GRUND], kompetenzen = [K_PRESSE, K_BEFAEHIGT] } = {}) => {
  const m = { ...branchenbestand({ pakete: ["industrie"], branchenmodule: { anlagen: { an: true }, maschinenqual: { an: true } } }).mandanten[0],
    betriebsmittel: [PRESSE, FRAESE], kompetenzen, personen, dienstarten: [{ id: "F", name: "Früh" }] };
  if (regelwerte) m.einstellungen = { ...m.einstellungen, regelwerte };
  return m;
};
const GEPRUEFT = (wert, extra = {}) => ({ wert, quelle: "Gefährdungsbeurteilung Halle 2", fundstelle: "Abschnitt 4.2", pruefstatus: "geprueft", geprueftAm: "2026-10-01", geprueftVon: "l1", ...extra });
const VORLAEUFIG = (wert) => ({ wert, pruefstatus: "provisional", quelle: "interne Absprache" });
const RW = "MASCHQUAL-INTERVALL-01";

describe("AK-1 M2: Unterweisungsintervall als Regelwert", () => {
  it("12 Monate bleiben der Ausgangswert der Konstante und der Vorlage — ohne Betrieb", () => {
    expect(MASCHQUAL_WIEDERHOLUNG_MONATE).toBe(12);
    expect(maschinenKompetenzVorlage(PRESSE).wiederholungMonate).toBe(12);
  });
  it("die Vorlage folgt dem Regelwert des Betriebs, verlängert aber nie über eine geprüfte Höchstgrenze", () => {
    expect(maschinenKompetenzVorlage(PRESSE, { m: betrieb({ regelwerte: { [RW]: GEPRUEFT(6) } }) }).wiederholungMonate).toBe(6);
    expect(maschinenKompetenzVorlage(PRESSE, { m: betrieb({ regelwerte: { [RW]: VORLAEUFIG(18) } }) }).wiederholungMonate).toBe(18);
    expect(maschinenKompetenzVorlage(PRESSE, { m: betrieb() }).wiederholungMonate).toBe(12);
  });
  it("intervallBewertung: Ausgangswert, kürzer, länger (Hinweis), über der geprüften Höchstgrenze, ohne Frist", () => {
    const m = betrieb();
    expect(intervallBewertung(m, { ...K_PRESSE, wiederholungMonate: 12 }, HEUTE)).toMatchObject({ status: "gleich", referenz: 12, herkunft: "ausgangswert" });
    expect(intervallBewertung(m, { ...K_PRESSE, wiederholungMonate: 6 }, HEUTE)).toMatchObject({ status: "kuerzer", referenz: 12 });
    const l = intervallBewertung(m, { ...K_PRESSE, wiederholungMonate: 24, grundlage: "BA 7" }, HEUTE);
    expect(l).toMatchObject({ status: "laenger", referenz: 12, geprueft: false });
    expect(l.hinweis).toMatch(/Ausgangswert.*12/);
    expect(l.hinweis).toMatch(/FN-26/);
    expect(l.hinweis).toContain("BA 7");
    expect(l.hinweis).not.toMatch(/Versto|unzul|verboten/i);
    expect(intervallBewertung(m, { ...K_PRESSE, wiederholungMonate: undefined }, HEUTE).status).toBe("ohne");
    expect(intervallBewertung(m, { ...K_PRESSE, wiederholungMonate: "" }, HEUTE).status).toBe("ohne");
    const g = betrieb({ regelwerte: { [RW]: GEPRUEFT(12) } });
    expect(intervallBewertung(g, { ...K_PRESSE, wiederholungMonate: 24 }, HEUTE)).toMatchObject({ status: "ueberschreitet-hoechstgrenze", geprueft: true });
    expect(intervallBewertung(g, { ...K_PRESSE, wiederholungMonate: 12 }, HEUTE)).toMatchObject({ status: "gleich", herkunft: "betrieb", geprueft: true });
    expect(intervallBewertung(g, { ...K_PRESSE, wiederholungMonate: 9 }, HEUTE).status).toBe("kuerzer");
  });
  it("ein vorläufiger Betriebswert ist eine Angabe des Betriebs — länger gibt weiter nur einen Hinweis", () => {
    const m = betrieb({ regelwerte: { [RW]: VORLAEUFIG(18) } });
    expect(intervallBewertung(m, { ...K_PRESSE, wiederholungMonate: 24 }, HEUTE)).toMatchObject({ status: "laenger", referenz: 18, geprueft: false });
    expect(intervallBewertung(m, { ...K_PRESSE, wiederholungMonate: 18 }, HEUTE).status).toBe("gleich");
  });
  it("intervallHinweise: nur Anlagenkompetenzen über der Referenz; andere Kompetenzen bleiben außen vor", () => {
    const m = betrieb({ kompetenzen: [{ ...K_PRESSE, wiederholungMonate: 24 }, { id: "k5", name: "Tor", art: "taetigkeit", betriebsmittelId: null, wiederholungMonate: 60 },
      { ...K_PRESSE, id: "k6", name: "Fräse", betriebsmittelId: "bm2", wiederholungMonate: 6 }] });
    const l = intervallHinweise(m, HEUTE);
    expect(l.map((x) => `${x.kompetenzId}:${x.status}`)).toEqual(["k1:laenger"]);
    const g = betrieb({ regelwerte: { [RW]: GEPRUEFT(12) }, kompetenzen: [{ ...K_PRESSE, wiederholungMonate: 24 }] });
    expect(intervallHinweise(g, HEUTE)[0].status).toBe("ueberschreitet-hoechstgrenze");
  });
  it("Server: über der geprüften Höchstgrenze 422, darunter und vorläufig erlaubt, andere Kompetenzen unberührt", () => {
    const geprueft = betrieb({ regelwerte: { [RW]: GEPRUEFT(12) } });
    const neu = (k, m = geprueft) => ({ ...m, kompetenzen: [k] });
    const z = maschinenqualZusammen(neu({ ...K_PRESSE, wiederholungMonate: 24 }), geprueft);
    expect(z).toMatchObject({ status: 422 });
    expect(z.grund).toMatch(/Höchstgrenze/);
    expect(z.grund).toContain("Gefährdungsbeurteilung Halle 2");
    expect(z.grund).toContain("Abschnitt 4.2");
    expect(maschinenqualZusammen(neu({ ...K_PRESSE, wiederholungMonate: 12 }), geprueft).grund).toBeUndefined();
    expect(maschinenqualZusammen(neu({ ...K_PRESSE, wiederholungMonate: 6 }), geprueft).grund).toBeUndefined();
    expect(maschinenqualZusammen(neu({ ...K_BEFAEHIGT, wiederholungMonate: 36 }), geprueft).grund).toBeUndefined();   // gilt nur für die Unterweisung der Bedienung
    expect(maschinenqualZusammen(neu({ id: "k5", name: "Tor", art: "taetigkeit", betriebsmittelId: null, wiederholungMonate: 60 }), geprueft).grund).toBeUndefined();
    const vorl = betrieb({ regelwerte: { [RW]: VORLAEUFIG(12) } });
    expect(maschinenqualZusammen(neu({ ...K_PRESSE, wiederholungMonate: 24 }, vorl), vorl).grund).toBeUndefined();
    expect(maschinenqualZusammen(neu({ ...K_PRESSE, wiederholungMonate: 24 }, betrieb()), betrieb()).grund).toBeUndefined();
  });
  it("Server: ein unveränderter alter Eintrag über der Höchstgrenze blockiert nicht (Altbestand)", () => {
    const g = betrieb({ regelwerte: { [RW]: GEPRUEFT(12) }, kompetenzen: [{ ...K_PRESSE, wiederholungMonate: 24 }] });
    expect(maschinenqualZusammen(g, g).grund).toBeUndefined();
  });
  it("Server: Leitung setzt die geprüfte Höchstgrenze und die Planung kann sie danach nicht umgehen", () => {
    const g = branchenbestand({ pakete: ["industrie"] }); g.mandanten[0].betriebsmittel = [PRESSE];
    const mit = schreibeAls(g, "LT", (m) => { m.einstellungen.regelwerte = { [RW]: { wert: 12, quelle: "GB Halle 2", fundstelle: "4.2", pruefstatus: "geprueft" } };
      m.kompetenzen = [K_PRESSE]; });
    expect(mit.verweigert).toBeFalsy();
    expect(mit.mandanten[0].einstellungen.regelwerte[RW]).toMatchObject({ pruefstatus: "geprueft", geprueftVon: "l1" });
    const zu = schreibeAls(mit, "PL", (m) => { m.kompetenzen = [{ ...K_PRESSE, wiederholungMonate: 36 }]; });
    expect(zu).toMatchObject({ status: 422 });
    const planerRegel = schreibeAls(mit, "PL", (m) => { m.einstellungen.regelwerte = {}; m.kompetenzen = [{ ...K_PRESSE, wiederholungMonate: 36 }]; });
    expect(planerRegel).toMatchObject({ status: 422 });             // Löschen der Grenze durch die Planung wirkt nicht
  });
  it("maschinenqualAuskunft: Regel-ID, Ausgangswert, Herkunft, Prüfstatus, Fachnachweis — keine Rechtsbehauptung", () => {
    const a = maschinenqualAuskunft(betrieb());
    expect(a).toMatchObject({ regelId: RW, wert: 12, herkunft: "ausgangswert", pruefstatus: "provisional", fachnachweis: "FN-26", hoechsteStufe: "hinweis" });
    expect(a.hinweis).toMatch(/zu prüfen/);
    const g = maschinenqualAuskunft(betrieb({ regelwerte: { [RW]: GEPRUEFT(6) } }));
    expect(g).toMatchObject({ wert: 6, herkunft: "betrieb", pruefstatus: "geprueft", quelle: "Gefährdungsbeurteilung Halle 2", fundstelle: "Abschnitt 4.2" });
  });
});

describe("AK-2 M3: Qualifikationsgrundlage der befähigten Person", () => {
  it("die Nachweisarten sind festgelegt, ohne Rechtsbehauptung", () => {
    expect(QUAL_GRUNDLAGE_ARTEN).toEqual(["berufsausbildung", "berufserfahrung", "zeitnahe_taetigkeit", "schulung", "sonstige"]);
  });
  it("pruefeQualifikationsgrundlage: gültig mit und ohne Datum; Fehler bei Art, Bezug, Datum, Form", () => {
    expect(pruefeQualifikationsgrundlage(GRUND)).toBeNull();
    expect(pruefeQualifikationsgrundlage({ art: "schulung", bezug: "Lehrgang 5" })).toBeNull();
    for (const k of [null, "x", [], { art: "gesetz", bezug: "x" }, { art: "schulung" }, { art: "schulung", bezug: " " }, { art: "schulung", bezug: "x".repeat(121) },
      { art: "schulung", bezug: "x", datum: "2026-02-30" }, { art: "schulung", bezug: "x", extra: 1 }])
      expect(pruefeQualifikationsgrundlage(k), JSON.stringify(k)).toMatch(/Qualifikationsgrundlage/);
  });
  it("qualifikationsgrundlageText in Worten; ohne Grundlage null", () => {
    expect(qualifikationsgrundlageText(GRUND)).toBe("Berufsausbildung „Zeugnis Industriemechaniker 2014“ vom 01.07.2014");
    expect(qualifikationsgrundlageText(undefined)).toBeNull();
  });
  it("Server: Grundlage nur an Nachweisen einer befähigten-Person-Kompetenz; ungültige Form 422", () => {
    const alt = betrieb();
    const mitGrund = (nachweis) => ({ ...alt, personen: [person("x", [nachweis])] });
    expect(maschinenqualZusammen(mitGrund({ kompetenzId: "k9", ab: "2026-01-01", qualifikationsgrundlage: GRUND }), alt).grund).toBeUndefined();
    const falscheArt = maschinenqualZusammen(mitGrund({ kompetenzId: "k9", ab: "2026-01-01", qualifikationsgrundlage: { art: "x", bezug: "y" } }), alt);
    expect(falscheArt).toMatchObject({ status: 422 });
    expect(falscheArt.grund).toMatch(/Qualifikationsgrundlage/);
    const anBedienung = maschinenqualZusammen(mitGrund({ kompetenzId: "k1", ab: "2026-01-01", qualifikationsgrundlage: GRUND }), alt);
    expect(anBedienung).toMatchObject({ status: 422 });
    expect(anBedienung.grund).toMatch(/befähigte/i);
    expect(maschinenqualZusammen(mitGrund({ kompetenzId: "k1", ab: "2026-01-01" }), alt).grund).toBeUndefined();   // ohne Grundlage: nichts zu prüfen
  });
  it("Server: ein unveränderter fehlerhafter Altbestand blockiert nicht", () => {
    const kaputt = { ...betrieb(), personen: [person("x", [{ kompetenzId: "k9", ab: "2026-01-01", qualifikationsgrundlage: { art: "x" } }])] };
    expect(maschinenqualZusammen(kaputt, kaputt).grund).toBeUndefined();
  });
  it("befaehigtePersonenListe: belegt mit Grundlage, sonst „nicht belegt“; Stand je Person; die Bedienung bleibt außen vor", () => {
    const l = befaehigtePersonenListe(betrieb(), HEUTE, kompetenzStand);
    const c = l.find((x) => x.personId === "c"), e = l.find((x) => x.personId === "e");
    expect(c).toMatchObject({ anlageId: "bm1", belegt: true, stand: "gueltig", grundlage: "Berufsausbildung „Zeugnis Industriemechaniker 2014“ vom 01.07.2014" });
    expect(e).toMatchObject({ belegt: false, grundlage: null, hinweis: "Grundlage nicht belegt" });
    expect(l.map((x) => x.personId).sort()).toEqual(["c", "e"]);
  });
  it("die befähigte Person zählt nicht als Bedienung (Befund bleibt)", () => {
    const m = betrieb({ personen: [P_BEFAEHIGT_OHNE_GRUND] });
    const b = maschinenqualBefunde(m, HEUTE, "F", m.personen, { auswerten: (r, k) => pruefeRegel(r, k), stand: kompetenzStand, module: AKTIV });
    expect(b.some((x) => x.regelId === "MASCHQUAL-BESETZUNG-01")).toBe(true);
  });
});

describe("AK-3 M1: Matrix je Rolle und Ablaufliste", () => {
  const m = betrieb();
  it("Planung, Leitung und Kundenrolle sehen die volle Matrix mit den Tagen bis zum Ablauf", () => {
    for (const rolle of ["planer", "leitung", "kunde"]) {
      const a = matrixAnsicht(m, HEUTE, kompetenzStand, { rolle, ich: "p1" });
      expect(a.art, rolle).toBe("voll");
      expect(a.zeilen.length).toBe(5);
      const za = a.zeilen.find((z) => z.personId === "a").zellen.bm1;
      expect(za).toMatchObject({ stand: "laeuft_ab" });
      expect(typeof za.tage).toBe("number");
    }
  });
  it("Beschäftigte und Schichtverantwortung: nur die eigene Zeile", () => {
    for (const rolle of ["mitarbeiter", "subplaner"]) {
      const a = matrixAnsicht(m, HEUTE, kompetenzStand, { rolle, ich: "a" });
      expect(a.art).toBe("eigen");
      expect(a.zeilen.map((z) => z.personId)).toEqual(["a"]);
    }
    expect(matrixAnsicht(m, HEUTE, kompetenzStand, { rolle: "mitarbeiter", ich: "ohne" }).zeilen).toEqual([]);
    expect(matrixAnsicht(m, HEUTE, kompetenzStand, { rolle: "mitarbeiter" }).zeilen).toEqual([]);
  });
  it("Betriebsrat: nur Zahlen je Anlage, Kleinstgruppen „<3“, keine Person", () => {
    const a = matrixAnsicht(m, HEUTE, kompetenzStand, { rolle: "betriebsrat" });
    expect(a.art).toBe("aggregat");
    expect(JSON.stringify(a)).not.toMatch(/"a"|"b"|personId|Person/);
    const p3 = a.anlagen.find((x) => x.id === "bm1");
    expect(p3.personen).toBe(5);
    expect(p3.gueltig).toBe("<3");              // eine Person
    expect(p3.abgelaufen).toBe("<3");
    const viele = betrieb({ personen: ["1", "2", "3", "4"].map((i) => person(`x${i}`, [{ kompetenzId: "k1", ab: "2026-09-01" }])) });
    expect(matrixAnsicht(viele, HEUTE, kompetenzStand, { rolle: "betriebsrat" }).anlagen.find((x) => x.id === "bm1")).toMatchObject({ gueltig: 4, laeuftAb: 0, abgelaufen: 0, fehlt: 0, personen: 4 });
    const klein = betrieb({ personen: [P_GUELTIG, P_OHNE] });
    expect(matrixAnsicht(klein, HEUTE, kompetenzStand, { rolle: "betriebsrat" }).anlagen[0]).toMatchObject({ gueltig: "<3", personen: "<3" });
  });
  it("unbekannte oder fehlende Rolle: nichts (fail-closed)", () => {
    for (const rolle of [undefined, "", "betreiber", "gast", "LEITUNG"]) {
      const a = matrixAnsicht(m, HEUTE, kompetenzStand, { rolle, ich: "a" });
      expect(a).toEqual({ art: "keine", anlagen: [], zeilen: [] });
    }
  });
  it("Ablaufliste: „läuft ab“ und „abgelaufen“ mit Person, Anlage und Datum — „fehlt“ gehört nicht dazu", () => {
    const l = ablaufListe(m, HEUTE, kompetenzStand);
    expect(l.map((x) => `${x.personId}:${x.anlageId}:${x.stand}`)).toEqual(["b:bm1:abgelaufen", "a:bm1:laeuft_ab"]);
    expect(l[1]).toMatchObject({ bis: expect.stringMatching(/^2026-11-\d\d$/), tage: expect.any(Number) });
    expect(ablaufListe(betrieb({ personen: [P_OHNE] }), HEUTE, kompetenzStand)).toEqual([]);
  });
  it("Matrix: Zelle mit Tagen bis zum Ablauf; Unterweisung am Stichtag − 14 Tage vor Ablauf ist „läuft ab“", () => {
    const mx = qualifikationsMatrix(m, HEUTE, kompetenzStand);
    expect(mx.zeilen.find((z) => z.personId === "a").zellen.bm1.stand).toBe("laeuft_ab");
  });
});

describe("AK-4 Rollensicht der Qualifikationsgrundlage", () => {
  const g = () => { const b = branchenbestand({ pakete: ["industrie"] });
    b.mandanten[0].personen.push(person("x9", [{ kompetenzId: "k9", ab: "2026-01-01", qualifikationsgrundlage: { art: "schulung", bezug: "FREMD-GRUND" } }], { bereich: "e1", zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }] }));
    b.mandanten[0].personen.find((p) => p.id === "a1").kompetenzNachweise = [{ kompetenzId: "k9", ab: "2026-01-01", qualifikationsgrundlage: { art: "schulung", bezug: "EIGENER-GRUND" } }];
    b.mandanten[0].kompetenzen = [K_BEFAEHIGT]; return b; };
  const sicht = (r) => JSON.stringify(bestandFuerRolle(g(), SITZUNGEN[r]));
  it("Planung, Leitung und Kundenrolle sehen sie", () => { for (const r of ["PL", "LT", "KD"]) expect(sicht(r), r).toContain("FREMD-GRUND"); });
  it("Betriebsrat und Schichtverantwortung sehen die fremde Grundlage nicht (der Rest des Nachweises bleibt wie bisher)", () => {
    for (const r of ["BR", "SV"]) {
      expect(sicht(r), r).not.toContain("FREMD-GRUND");
      expect(sicht(r), r).toContain("k9");
    }
  });
  it("die Person sieht ihre eigene Grundlage; Beschäftigte die fremde nicht", () => {
    expect(sicht("MA")).not.toContain("FREMD-GRUND");
    const eigen = JSON.stringify(bestandFuerRolle(g(), { rolle: "mitarbeiter", person: "a1", betrieb: 0 }));
    expect(eigen).toContain("EIGENER-GRUND");
    expect(eigen).not.toContain("FREMD-GRUND");
  });
});

describe("AK-5 Betriebsprotokoll und Anonymisierung", () => {
  const bestand = (m) => ({ mandanten: [{ id: "m1", betriebsmittel: [PRESSE], ...m }] });
  it("Kompetenzänderungen, Grundlagenänderungen und Regelwerte nur als Anzahl — ohne Namen, Personen, Werte", () => {
    const alt = bestand({ kompetenzen: [K_PRESSE], personen: [person("a", [{ kompetenzId: "k9", ab: "2026-01-01" }])], einstellungen: {} });
    const neu = bestand({ kompetenzen: [{ ...K_PRESSE, wiederholungMonate: 6 }, K_BEFAEHIGT],
      personen: [person("a", [{ kompetenzId: "k9", ab: "2026-01-01", qualifikationsgrundlage: GRUND }])], einstellungen: { regelwerte: { [RW]: GEPRUEFT(6) } } });
    const e = industrieProtokoll(alt, neu);
    expect(e).toEqual(expect.arrayContaining([
      { ereignis: "maschinenkompetenz-geaendert", detail: "2 Kompetenz(en): 1 geändert, 1 neu, 0 entfernt" },
      { ereignis: "qualifikationsgrundlage-geaendert", detail: "1 Nachweis(e)" },
      { ereignis: "regelwert-geaendert", detail: "1 Regelwert(e)" },
    ]));
    const text = JSON.stringify(e);
    expect(text).not.toMatch(/Presse|Zeugnis|Halle|Abschnitt|"a"|2014|\|/);
    expect(industrieProtokoll(alt, JSON.parse(JSON.stringify(alt)))).toEqual([]);
  });
  it("nur Kompetenzen zu Anlagen oder befähigter Person zählen", () => {
    const alt = bestand({ kompetenzen: [{ id: "k5", name: "Tor", art: "taetigkeit", betriebsmittelId: null }] });
    const neu = bestand({ kompetenzen: [{ id: "k5", name: "Tor 2", art: "taetigkeit", betriebsmittelId: null }] });
    expect(industrieProtokoll(alt, neu)).toEqual([]);
    /* Eine Geräteeinweisung zu einem Betriebsmittel, das keine Anlage ist (Schlüssel, Fahrzeug), gehört nicht zum Modul. */
    const g1 = bestand({ betriebsmittel: [PRESSE, { id: "s1", art: "schluessel", name: "Tor", personId: null }],
      kompetenzen: [{ id: "k6", name: "Schlüssel", art: "geraet", betriebsmittelId: "s1", wiederholungMonate: 12 }] });
    const g2 = bestand({ betriebsmittel: g1.mandanten[0].betriebsmittel,
      kompetenzen: [{ id: "k6", name: "Schlüssel", art: "geraet", betriebsmittelId: "s1", wiederholungMonate: 24 }] });
    expect(industrieProtokoll(g1, g2)).toEqual([]);
  });
  it("Anonymisierung entfernt die Qualifikationsgrundlage, lässt aber Kompetenz und Zeitraum stehen", () => {
    const a = anonymisiere(person("p77", [{ kompetenzId: "k9", ab: "2026-01-01", bis: "2029-01-01", qualifikationsgrundlage: GRUND }]));
    expect(a.kompetenzNachweise).toEqual([{ kompetenzId: "k9", ab: "2026-01-01", bis: "2029-01-01" }]);
    expect(JSON.stringify(a)).not.toContain("Zeugnis");
    expect(anonymisiere(person("p78")).kompetenzNachweise).toEqual([]);
  });
});

describe("AK-6 Hinweis statt Sperre (G4, G5)", () => {
  it("Befunde der qualifizierten Besetzung bleiben Hinweise der Befundart „branche“", () => {
    const m = betrieb({ personen: [P_ABGELAUFEN] });
    const b = maschinenqualBefunde(m, HEUTE, "F", m.personen, { auswerten: (r, k) => pruefeRegel(r, k), stand: kompetenzStand, module: AKTIV });
    expect(b.length).toBeGreaterThan(0);
    for (const x of b) expect(x).toMatchObject({ stufe: "hinweis", art: "branche" });
  });
  it("Kompetenzfeld Wiederholung bleibt 1 bis 120 Monate", () => {
    expect(pruefeMaschinenKompetenz({ ...K_PRESSE, wiederholungMonate: 0 })).toBeTruthy();
    expect(pruefeMaschinenKompetenz({ ...K_PRESSE, wiederholungMonate: 121 })).toBeTruthy();
    expect(pruefeMaschinenKompetenz({ ...K_PRESSE, wiederholungMonate: 120 })).toBeNull();
  });
});

describe("AK-7 Oberfläche", () => {
  const html = (el) => renderToStaticMarkup(el);
  const m = betrieb();
  it("Matrix: Karten für schmale und Tabelle für breite Bildschirme; Stände in Worten; „läuft ab“ mit Datum", () => {
    const t = html(h(QualifikationsMatrix, { m, datum: HEUTE, stand: kompetenzStand, rolle: "planer", ich: "p1" }));
    expect(t).toMatch(/<table/);
    expect(t).toMatch(/role="list"/);
    expect(t).toMatch(/läuft ab/);
    expect(t).toMatch(/abgelaufen/);
    expect(t).toMatch(/<style>[^<]*@media/);
    expect(t).not.toMatch(/(?<![-\w])width:\s*\d{3,}px/);        // keine feste Breite (min-width im Stilblock ist erlaubt)
    expect(t).toContain("Presse 3");
  });
  it("Matrix für Beschäftigte: nur die eigene Zeile; für den Betriebsrat: Zahlen, keine Namen", () => {
    const ma = html(h(QualifikationsMatrix, { m, datum: HEUTE, stand: kompetenzStand, rolle: "mitarbeiter", ich: "a" }));
    expect(ma).toContain("Meine Qualifikationen");
    for (const fremd of ["V b", "V c", "V d", "V e"]) expect(ma, fremd).not.toContain(fremd);
    const br = html(h(QualifikationsMatrix, { m, datum: HEUTE, stand: kompetenzStand, rolle: "betriebsrat" }));
    expect(br).toMatch(/Anzahl|Personen/);
    expect(br).toMatch(/&lt;3/);
    expect(html(h(QualifikationsMatrix, { m, datum: HEUTE, stand: kompetenzStand, rolle: "unbekannt" }))).toMatch(/keine Ansicht|nicht freigegeben/i);
  });
  it("Befähigte Personen: Grundlage oder „nicht belegt“; Ablauf- und Intervallhinweise", () => {
    const b = html(h(BefaehigtePersonen, { m, datum: HEUTE, stand: kompetenzStand }));
    expect(b).toContain("Berufsausbildung");
    expect(b).toMatch(/nicht belegt/);
    const a = html(h(AblaufHinweise, { m, datum: HEUTE, stand: kompetenzStand }));
    expect(a).toMatch(/läuft ab/);
    expect(a).toMatch(/abgelaufen/);
    const i = html(h(IntervallHinweise, { m: betrieb({ kompetenzen: [{ ...K_PRESSE, wiederholungMonate: 24 }] }), heute: HEUTE }));
    expect(i).toMatch(/Ausgangswert/);
    expect(i).toMatch(/Prüfstatus|zu prüfen/);
  });
  it("Regelwertfeld: Ausgangswert, Wert, Quelle, Fundstelle, Version, Gültigkeit, Prüfstatus — beschriftet, ohne feste Breite", () => {
    const t = html(h(RegelwertFeld, { regelId: RW, m, onAendern: () => {} }));
    for (const w of ["Ausgangswert", "Quelle", "Fundstelle", "Version", "Gültig ab", "Gültig bis", "geprüft"]) expect(t, w).toContain(w);
    expect(t).toContain("FN-26");
    expect(t).not.toMatch(/width:\s*\d{3,}px/);
    expect((t.match(/<label/g) || []).length).toBeGreaterThanOrEqual(6);
  });
});
