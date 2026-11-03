/* ==========================================================================
   MODUL ANLAGEN — Fertigstellung (WP-19.10, Entscheidungen A1–A3)

   Akzeptanzkriterien als Tests, vor der Umsetzung geschrieben (rot bestätigt,
   siehe docs/acc45/wp19-10-nachweis.md):

   AK-1  Grundlage der Mindestbesetzung (A3): Feld `grundlage` (Art, Bezug,
         Datum) wird streng geprüft und im Hinweis genannt; ohne Grundlage
         steht „Vorgabe des Betriebs, Grundlage nicht hinterlegt“.
   AK-2  Laufzeitkalender (A2): echte Kalendertage, keine doppelten Ausnahmen,
         Pflegefunktionen (Wochenmuster, Ausnahme setzen/entfernen, Monat).
   AK-3  Befund bleibt Hinweis, sperrt nie, spricht nie von „Verstoß“ (G4, G5).
   AK-4  Rollenansichten: Beschäftigte, Schichtverantwortung, Betriebsrat sehen
         weder Mindestbesetzung noch Laufzeit noch Grundlage; Planung und
         Leitung sehen alles; fremde Schreibversuche ändern nichts.
   AK-5  Betriebsprotokoll ohne Personendaten (nur Anzahlen).
   AK-6  Abschalten nimmt keine Daten weg (G3); Befunde enden.
   AK-7  Oberfläche: Pflegeansicht, Kalender, 360 px ohne feste Breiten.
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ANLAGE_ART, pruefeAnlage, anlageLaeuft, anlagenBedarf, anlagenBefunde, anlagenZusammen,
  ANLAGEN_GRUNDLAGE_ARTEN, grundlageText, laufzeitMonat, wochenmusterSetzen, ausnahmeSetzen, ausnahmeEntfernen,
  ausnahmenBereinigen, anlagenProbleme, anlagenAuskunft,
} from "../server/lib/modul-anlagen.mjs";
import { industrieProtokoll } from "../server/lib/modul-industrie-protokoll.mjs";
import { BRANCHENMODULE } from "../server/lib/branchenmodule.mjs";
import { pruefeRegel } from "../src/regelbaukasten.js";
import { branchenbestand, schreibeAls, SITZUNGEN } from "./hilfen/branchenbetrieb.mjs";
import { bestandFuerRolle } from "../server/lib/rechte.mjs";
import { AnlagenUebersicht, AnlagenPflege, LaufzeitKalender } from "../src/module/anlagen.jsx";

const MO = "2026-11-02", SA = "2026-11-07", SO = "2026-11-08";
const GB = { art: "gefaehrdungsbeurteilung", bezug: "GB-2026-04 Presse 1", datum: "2026-03-01" };
const PRESSE = { id: "bm1", art: ANLAGE_ART, name: "Presse 1", personId: null, mindestBesetzung: { F: 2, S: 1 }, grundlage: GB,
  laufzeit: { wochentage: [true, true, true, true, true, false, false], ausnahmen: [{ datum: SA, laeuft: true }] } };
const OFEN = { id: "bm2", art: ANLAGE_ART, name: "Ofen", personId: null, mindestBesetzung: { F: 1 },
  laufzeit: { wochentage: [true, true, true, true, true, true, true] } };       // ohne Grundlage
const AKTIV = BRANCHENMODULE.map((x) => (x.id === "anlagen" ? { ...x, status: "vorlaeufig" } : x));
const betrieb = (bm = [PRESSE, OFEN]) => ({ ...branchenbestand({ pakete: ["industrie"], branchenmodule: { anlagen: { an: true } } }).mandanten[0],
  betriebsmittel: bm });
const leute = (n) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, merkmale: [] }));
const auswerten = (r, k) => pruefeRegel(r, k);

describe("AK-1 Grundlage der Mindestbesetzung (A3)", () => {
  it("die Arten sind festgelegt", () => {
    expect(ANLAGEN_GRUNDLAGE_ARTEN).toEqual(["gefaehrdungsbeurteilung", "betriebsanweisung", "betriebsvereinbarung", "sonstige"]);
  });
  it("eine gültige Grundlage wird akzeptiert, auch ohne Datum und ganz ohne", () => {
    expect(pruefeAnlage(PRESSE)).toBeNull();
    expect(pruefeAnlage({ ...PRESSE, grundlage: { art: "sonstige", bezug: "Schichtanweisung 7" } })).toBeNull();
    expect(pruefeAnlage({ ...PRESSE, grundlage: null })).toBeNull();
    expect(pruefeAnlage({ ...PRESSE, grundlage: undefined })).toBeNull();
  });
  it("eine fehlerhafte Grundlage wird abgewiesen (Form, Länge, Art, Datum)", () => {
    for (const k of [
      "text", [], { art: "gesetz", bezug: "x" }, { art: "sonstige" }, { art: "sonstige", bezug: "" }, { art: "sonstige", bezug: "   " },
      { art: "sonstige", bezug: "x".repeat(121) }, { art: "sonstige", bezug: "x", datum: "2026-02-30" },
      { art: "sonstige", bezug: "x", datum: "morgen" }, { art: "sonstige", bezug: "x", extra: 1 },
      { art: "sonstige", bezug: 5 },
    ]) expect(pruefeAnlage({ ...PRESSE, grundlage: k }), JSON.stringify(k)).toMatch(/Grundlage/);
  });
  it("grundlageText nennt Art, Bezug und Datum in Worten", () => {
    expect(grundlageText(GB)).toBe("Gefährdungsbeurteilung „GB-2026-04 Presse 1“ vom 01.03.2026");
    expect(grundlageText({ art: "sonstige", bezug: "Anweisung 7" })).toBe("Sonstige Grundlage „Anweisung 7“");
    expect(grundlageText(null)).toBeNull();
  });
  it("der Hinweis nennt die Grundlage der beteiligten Anlagen", () => {
    const b = anlagenBefunde(betrieb([PRESSE]), MO, "F", leute(1), { auswerten, module: AKTIV });
    expect(b).toHaveLength(1);
    expect(b[0].text).toContain("Gefährdungsbeurteilung „GB-2026-04 Presse 1“");
    expect(b[0].stufe).toBe("hinweis");
  });
  it("ohne Grundlage: „Vorgabe des Betriebs, Grundlage nicht hinterlegt“", () => {
    const b = anlagenBefunde(betrieb([OFEN]), MO, "F", leute(0), { auswerten, module: AKTIV });
    expect(b[0].text).toContain("Vorgabe des Betriebs, Grundlage nicht hinterlegt");
  });
  it("gemischt: die Anlage ohne Grundlage wird beim Namen genannt, die andere nicht als fehlend", () => {
    const b = anlagenBefunde(betrieb(), MO, "F", leute(1), { auswerten, module: AKTIV });
    expect(b[0].text).toContain("Presse 1");
    expect(b[0].text).toMatch(/Ofen: Grundlage nicht hinterlegt/);
    expect(b[0].text).not.toMatch(/Presse 1: Grundlage nicht hinterlegt/);
  });
  it("der Bedarf nennt die Grundlage je Anlage", () => {
    const bed = anlagenBedarf(betrieb(), MO, "F");
    expect(bed.anlagen.find((a) => a.id === "bm1").grundlage).toEqual(GB);
    expect(bed.anlagen.find((a) => a.id === "bm2").grundlage).toBeNull();
  });
});

describe("AK-2 Laufzeitkalender (A2)", () => {
  it("nur echte Kalendertage; doppelte Ausnahmen werden abgewiesen", () => {
    const wt = PRESSE.laufzeit.wochentage;
    expect(pruefeAnlage({ ...PRESSE, laufzeit: { wochentage: wt, ausnahmen: [{ datum: "2026-02-30", laeuft: true }] } })).toBeTruthy();
    expect(pruefeAnlage({ ...PRESSE, laufzeit: { wochentage: wt, ausnahmen: [{ datum: "2026-13-01", laeuft: true }] } })).toBeTruthy();
    expect(pruefeAnlage({ ...PRESSE, laufzeit: { wochentage: wt, ausnahmen: [{ datum: MO, laeuft: false }, { datum: MO, laeuft: true }] } }))
      .toMatch(/doppelt/i);
    expect(pruefeAnlage({ ...PRESSE, laufzeit: { wochentage: wt, ausnahmen: [{ datum: "2028-02-29", laeuft: false }] } })).toBeNull();   // Schaltjahr
  });
  it("laufzeitMonat: jeder Tag mit Wochentag, Lauf-Status und Kennzeichen „Ausnahme“", () => {
    const m = laufzeitMonat(PRESSE, "2026-11");
    expect(m.tage).toHaveLength(30);
    expect(m.tage[0]).toEqual({ datum: "2026-11-01", wochentag: 6, laeuft: false, offen: false, ausnahme: false });
    expect(m.tage[6]).toMatchObject({ datum: SA, wochentag: 5, laeuft: true, ausnahme: true });
    expect(m.tage[1]).toMatchObject({ datum: MO, wochentag: 0, laeuft: true, ausnahme: false });
    expect(laufzeitMonat(PRESSE, "2028-02").tage).toHaveLength(29);
    expect(laufzeitMonat({ id: "x", art: ANLAGE_ART }, "2026-11").tage.every((t) => t.offen && t.laeuft === null)).toBe(true);
    expect(() => laufzeitMonat(PRESSE, "2026-13")).toThrow();
  });
  it("wochenmusterSetzen: neues Muster, Ausnahmen bleiben, Eingabe bleibt unverändert", () => {
    const vorher = JSON.stringify(PRESSE);
    const r = wochenmusterSetzen(PRESSE, [true, true, true, true, true, true, false]);
    expect(r.anlage.laufzeit.wochentage[5]).toBe(true);
    expect(r.anlage.laufzeit.ausnahmen).toEqual(PRESSE.laufzeit.ausnahmen);
    expect(JSON.stringify(PRESSE)).toBe(vorher);
    expect(wochenmusterSetzen(PRESSE, [true]).grund).toBeTruthy();
    expect(wochenmusterSetzen({ id: "n", art: ANLAGE_ART, name: "N" }, new Array(7).fill(false)).anlage.laufzeit.wochentage).toHaveLength(7);
  });
  it("ausnahmeSetzen / ausnahmeEntfernen: ersetzt je Tag, sortiert, prüft, braucht ein Wochenmuster", () => {
    const a = ausnahmeSetzen(PRESSE, SA, false).anlage;
    expect(a.laufzeit.ausnahmen).toEqual([{ datum: SA, laeuft: false }]);
    const b = ausnahmeSetzen(a, "2026-11-01", true).anlage;
    expect(b.laufzeit.ausnahmen.map((x) => x.datum)).toEqual(["2026-11-01", SA]);
    expect(ausnahmeSetzen(PRESSE, "kein-tag", true).grund).toBeTruthy();
    expect(ausnahmeSetzen({ id: "n", art: ANLAGE_ART, name: "N" }, MO, false).grund).toMatch(/Wochenmuster/);
    expect(ausnahmeEntfernen(b, SA).laufzeit.ausnahmen).toEqual([{ datum: "2026-11-01", laeuft: true }]);
    expect(ausnahmeEntfernen(PRESSE, "2030-01-01")).toEqual(PRESSE);
    const voll = { ...PRESSE, laufzeit: { wochentage: PRESSE.laufzeit.wochentage,
      ausnahmen: Array.from({ length: 366 }, (_, i) => ({ datum: new Date(Date.UTC(2027, 0, 1 + i)).toISOString().slice(0, 10), laeuft: false })) } };
    expect(pruefeAnlage(voll)).toBeNull();
    expect(ausnahmeSetzen(voll, "2026-01-01", false).grund).toMatch(/366|zu viele/i);
  });
  it("ausnahmenBereinigen entfernt nur Ausnahmen, die länger als 366 Tage zurückliegen", () => {
    const a = { ...PRESSE, laufzeit: { wochentage: PRESSE.laufzeit.wochentage,
      ausnahmen: [{ datum: "2025-01-01", laeuft: false }, { datum: "2025-10-31", laeuft: false }, { datum: "2025-11-01", laeuft: true }, { datum: "2025-11-02", laeuft: false }, { datum: SA, laeuft: true }] } };
    const r = ausnahmenBereinigen(a, MO);
    expect(r.entfernt).toBe(2);
    expect(r.anlage.laufzeit.ausnahmen.map((x) => x.datum)).toEqual(["2025-11-01", "2025-11-02", SA]);   // genau 366 Tage zurück bleibt
    expect(ausnahmenBereinigen(PRESSE, MO).entfernt).toBe(0);
  });
  it("Feiertag „läuft nicht“ senkt den Bedarf; ohne Laufzeit „nicht bewertbar“, nie erfüllt (Bestandsfall bleibt)", () => {
    const feier = { ...PRESSE, laufzeit: { ...PRESSE.laufzeit, ausnahmen: [{ datum: MO, laeuft: false }] } };
    expect(anlagenBedarf(betrieb([feier]), MO, "F").summe).toBe(0);
    expect(anlageLaeuft({ ...PRESSE, laufzeit: undefined }, MO)).toEqual({ laeuft: null, offen: true });
    expect(anlageLaeuft(PRESSE, SO).laeuft).toBe(false);
  });
});

describe("AK-3 Hinweis statt Sperre (G4, G5)", () => {
  it("Befund ist Hinweis mit Regel-ID und vorläufiger Quelle; kein Wort „Verstoß“ oder „verboten“", () => {
    const b = anlagenBefunde(betrieb(), MO, "S", leute(0), { auswerten, module: AKTIV });
    expect(b[0]).toMatchObject({ regelId: "ANLAGEN-BESETZUNG-01", stufe: "hinweis", art: "branche", quelle: "Vorgabe des Betriebs (vorläufig)" });
    expect(b[0].text).not.toMatch(/Versto|verboten|unzul|rechtswidrig/i);
  });
  it("anlagenAuskunft: Regel-ID, Prüfstatus, Fachnachweis — vorläufig, nichts erfunden", () => {
    const a = anlagenAuskunft();
    expect(a).toMatchObject({ regelId: "ANLAGEN-BESETZUNG-01", pruefstatus: "provisional", hoechsteStufe: "hinweis", fachnachweis: "FN-11" });
    expect(a.quelle).toMatch(/Betrieb/);
    expect(a.fundstelle).toMatch(/Grundlage/);
  });
  it("anlagenProbleme: fehlende Laufzeit, fehlende Grundlage, leerer Bedarf, unbekannte Dienstart", () => {
    const m = { ...betrieb([{ ...OFEN, grundlage: undefined, mindestBesetzung: { ZZ: 1 } },
      { id: "bm9", art: ANLAGE_ART, name: "Kran", personId: null, mindestBesetzung: {} }]),
    dienstarten: [{ id: "F" }, { id: "S" }] };
    const arten = anlagenProbleme(m).map((p) => `${p.anlageId}:${p.art}`);
    expect(arten).toEqual(expect.arrayContaining(["bm2:grundlage-fehlt", "bm2:dienstart-unbekannt", "bm9:laufzeit-fehlt", "bm9:bedarf-leer", "bm9:grundlage-fehlt"]));
    expect(anlagenProbleme({ ...betrieb([PRESSE]), dienstarten: [{ id: "F" }, { id: "S" }] })).toEqual([]);
  });
});

describe("AK-4 Rollenansichten und Schreibrechte (serverbasiert)", () => {
  const gesamt = () => { const g = branchenbestand({ pakete: ["industrie"], branchenmodule: { anlagen: { an: true } } });
    g.mandanten[0].betriebsmittel = [PRESSE, OFEN]; return g; };
  const anlageIn = (g, r) => bestandFuerRolle(g, SITZUNGEN[r]).mandanten[0].betriebsmittel;
  it("Planung, Leitung und Kundenrolle sehen die Anlagenfelder vollständig", () => {
    for (const r of ["PL", "LT", "KD"]) expect(anlageIn(gesamt(), r).find((b) => b.id === "bm1"), r).toMatchObject({ mindestBesetzung: { F: 2, S: 1 }, grundlage: GB, laufzeit: PRESSE.laufzeit });
  });
  it("Beschäftigte und Schichtverantwortung sehen Name und Art, aber weder Mindestbesetzung noch Laufzeit noch Grundlage", () => {
    for (const r of ["MA", "SV"]) {
      const a = anlageIn(gesamt(), r).find((b) => b.id === "bm1");
      expect(a, r).toBeTruthy();
      expect(a.name).toBe("Presse 1");
      for (const f of ["mindestBesetzung", "laufzeit", "grundlage"]) expect(a, `${r}.${f}`).not.toHaveProperty(f);
    }
  });
  it("der Betriebsrat sieht keine Anlagen", () => {
    expect(anlageIn(gesamt(), "BR").filter((b) => b.art === ANLAGE_ART)).toEqual([]);
  });
  it("Schreiben ohne Recht ändert die Anlage nicht; ein gekürzter Rücklauf zerstört nichts", () => {
    for (const r of ["MA", "SV", "BR"]) {
      const g = gesamt();
      const neu = schreibeAls(g, r, (m) => { for (const b of m.betriebsmittel || []) { b.name = "Hacker"; b.mindestBesetzung = { F: 0 }; delete b.grundlage; } });
      const stand = neu && !neu.verweigert ? neu : g;
      const bm = stand.mandanten[0].betriebsmittel.find((b) => b.id === "bm1");
      expect(bm, r).toMatchObject({ name: "Presse 1", mindestBesetzung: { F: 2, S: 1 }, grundlage: GB });
    }
  });
  it("Planung speichert eine gültige Anlage mit Grundlage, Server weist Ungültiges ab (mit Grund)", () => {
    const g = gesamt();
    const ok = schreibeAls(g, "PL", (m) => { m.betriebsmittel = [{ ...PRESSE, grundlage: { art: "betriebsanweisung", bezug: "BA 12" } }]; });
    expect(ok.verweigert).toBeFalsy();
    expect(ok.mandanten[0].betriebsmittel[0].grundlage).toEqual({ art: "betriebsanweisung", bezug: "BA 12" });
    const schlecht = schreibeAls(g, "PL", (m) => { m.betriebsmittel = [{ ...PRESSE, grundlage: { art: "gesetz", bezug: "x" } }]; });
    expect(schlecht.verweigert).toMatch(/Grundlage/);
    expect(schlecht.status).toBe(422);
  });
  it("anlagenZusammen meldet 422 als Status", () => {
    expect(anlagenZusammen({ betriebsmittel: [{ ...PRESSE, grundlage: "x" }] })).toMatchObject({ status: 422 });
  });
});

describe("AK-5 Betriebsprotokoll ohne Personendaten", () => {
  const alt = { mandanten: [{ id: "m1", betriebsmittel: [PRESSE, OFEN] }] };
  it("nichts geändert → kein Eintrag", () => {
    expect(industrieProtokoll(alt, JSON.parse(JSON.stringify(alt)))).toEqual([]);
    expect(industrieProtokoll(null, alt)).toEqual([]);          // Erstanlage des Betriebs ist keine Änderung einer Anlage
  });
  it("geänderte, neue und entfernte Anlagen werden gezählt — nur Anzahlen, keine Namen, Personen, Tage", () => {
    const neu = { mandanten: [{ id: "m1", betriebsmittel: [
      { ...PRESSE, mindestBesetzung: { F: 3 }, laufzeit: { wochentage: new Array(7).fill(true) } },
      { id: "bm5", art: ANLAGE_ART, name: "Kran Hauptstraße 5", personId: null }] }] };
    const e = industrieProtokoll(alt, neu);
    expect(e).toEqual([{ ereignis: "anlage-geaendert", detail: "3 Anlage(n): 1 geändert, 1 neu, 1 entfernt" }]);
    const text = JSON.stringify(e);
    expect(text).not.toMatch(/Presse|Kran|Ofen|Hauptstra|\|/);
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });
  it("ein Betriebsmittel, das keine Anlage ist, zählt nicht", () => {
    const neu = { mandanten: [{ id: "m1", betriebsmittel: [PRESSE, OFEN, { id: "s1", art: "schluessel", name: "Tor", personId: "p1" }] }] };
    expect(industrieProtokoll(alt, neu)).toEqual([]);
  });
});

describe("AK-6 Abschalten (G3) und Aufbewahrung", () => {
  it("Modul ausschalten lässt die Anlagen unberührt, beendet aber die Befunde", () => {
    const g = branchenbestand({ pakete: ["industrie"], branchenmodule: { anlagen: { an: true } } });
    g.mandanten[0].betriebsmittel = [PRESSE];
    const aus = schreibeAls(g, "LT", (m) => { m.einstellungen.branchenmodule = { anlagen: { an: false } }; });
    expect(aus.mandanten[0].betriebsmittel).toEqual([PRESSE]);
    const m = { ...aus.mandanten[0] };
    expect(anlagenBefunde(m, MO, "F", leute(0), { auswerten, module: AKTIV })).toEqual([]);
  });
  it("Anlagen enthalten keine Personendaten: personId bleibt leer, kein Freitext außer Name und Grundlagenbezug", () => {
    const erlaubt = new Set(["id", "art", "name", "personId", "mindestBesetzung", "laufzeit", "grundlage", "notiz"]);
    for (const k of Object.keys(PRESSE)) expect(erlaubt.has(k), k).toBe(true);
    expect(PRESSE.personId).toBeNull();
  });
});

describe("AK-7 Oberfläche", () => {
  const dienstarten = [{ id: "F", name: "Früh" }, { id: "S", name: "Spät" }];
  const html = (el) => renderToStaticMarkup(el);
  it("Übersicht nennt Grundlage oder „Grundlage nicht hinterlegt“ und Laufzeit in Worten", () => {
    const t = html(h(AnlagenUebersicht, { m: { ...betrieb(), dienstarten }, datum: MO }));
    expect(t).toContain("Gefährdungsbeurteilung");
    expect(t).toContain("Grundlage nicht hinterlegt");
    expect(t).toContain("läuft");
  });
  it("Pflegeansicht: Name, Mindestbesetzung je Dienstart, Wochenmuster, Grundlage — beschriftete Felder", () => {
    const t = html(h(AnlagenPflege, { anlage: PRESSE, dienstarten, onAendern: () => {} }));
    expect(t).toMatch(/Mindestbesetzung/);
    expect(t).toMatch(/Früh/);
    expect(t).toMatch(/Wochenmuster/);
    expect(t).toMatch(/Grundlage/);
    for (const wt of ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"]) expect(t).toContain(wt);
    expect((t.match(/<input/g) || []).length).toBeGreaterThan(8);
    expect(t).toMatch(/<label/);
    expect(t).not.toMatch(/width:\s*\d{3,}px/);               // keine festen Breiten (360 px)
  });
  it("Pflegeansicht ohne Laufzeit: Hinweis „nicht bewertbar“", () => {
    const t = html(h(AnlagenPflege, { anlage: { id: "n", art: ANLAGE_ART, name: "Neu", personId: null }, dienstarten, onAendern: () => {} }));
    expect(t).toMatch(/nicht bewertbar/);
  });
  it("Kalender: Monatsraster mit Wochentagsköpfen, Ausnahmen in Worten, ohne feste Breite", () => {
    const t = html(h(LaufzeitKalender, { anlage: PRESSE, monat: "2026-11", onAusnahme: () => {} }));
    expect(t).toMatch(/November 2026/);
    expect(t).toMatch(/Ausnahme/);
    expect(t).toMatch(/läuft nicht|steht/);
    expect(t).not.toMatch(/width:\s*\d{3,}px/);
    expect((t.match(/<button/g) || []).length).toBeGreaterThanOrEqual(30);
  });
});
