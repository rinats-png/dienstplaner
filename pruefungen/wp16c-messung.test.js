/* ==========================================================================
   WP-16c — MESSUNG DES KORREKTURPFADS: kleine CI-Stichprobe

   Die volle Matrix (60/150/400 Personen × 12/24/36 Monate) steht in werkzeug/wp16c-messung.mjs
   (`node werkzeug/wp16c-messung.mjs`, Ergebnisse in docs/acc45/WP-16c-MESSUNG.md). Hier läuft dieselbe Prüfung im
   kleinen Maßstab: Korrektur beginnen → Änderung → Freigabe → Abschluss → Export, zweite Runde, verwerfen.
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { zelleKorrektur, betriebMitZuschlaegen, istAendern } from "../werkzeug/wp16c-messung.mjs";
import { monateVor, HEUTE } from "../werkzeug/wp16-messung.mjs";
import { abschliessen, lohnexportBestaetigen, korrekturBeginnen, exportZeilenFuer, KORREKTUR_FREIGABE_ERFORDERLICH } from "../server/lib/monatsabschluss.mjs";
import { datevAusFreeze } from "../server/lib/isteinfrieren.mjs";
import { lohnexportStand } from "../src/lib/fachlogik.js";

const JETZT = new Date(`${HEUTE}T09:00:00Z`);
const L1 = { personId: "p1", name: "L1", rolle: "leitung" };
const TROTZ = { trotzVormonat: true, vormonatKategorie: "vor_inbetriebnahme", vormonatGrund: "Vormonate ohne Zeitdaten vor dem Start" };

describe("WP-16c Messung Korrekturpfad (kleiner Maßstab)", { timeout: 120000 }, () => {
  for (const [n, monate] of [[12, 2], [30, 3]]) {
    it(`${n} Personen × ${monate} Monate: Differenz, Export, Revisionen, Reproduzierbarkeit ohne Befund`, () => {
      const z = zelleKorrektur(n, monate);
      expect(z.befunde).toEqual([]);
      expect(z.zeilenR1).toBeGreaterThan(0);                                  // Revision 1 hat Lohnzeilen
      expect(z.diffN.every((k) => k > 0)).toBe(true);                         // jede Korrektur hat eine echte Differenz
      expect(z.nullen).toMatchObject({ nullStd: 0, ohneZeileOhneEintrag: 0 }); // keine stille Null
      expect(z.verlaufN).toBeLessThanOrEqual(20);                             // kompakter Verlauf
      /* Wachstum je Revision: der Monatseintrag wächst, aber begrenzt (linear in den Lohnzeilen, kein Sprung). */
      const e = z.bytes.map((b) => b.eintrag);
      expect(e[1]).toBeGreaterThan(e[0]);
      const sprung = e.slice(1).map((v, i) => v - e[i]);
      expect(sprung.every((s) => s > 0 && s <= 3 * sprung[0] + 2048)).toBe(true);
    });
  }

  it("Änderung des Plans ändert die Lohnzeilen; Abschluss ohne zweite Person wird abgewiesen, nicht still geschlossen", () => {
    const monate = monateVor(HEUTE.slice(0, 7), 1);
    const monat = monate[0];
    let m = betriebMitZuschlaegen(12, monate);
    m = abschliessen(m, { monat, trotzPrueffaellen: true }, L1, JETZT, "ma-1", HEUTE).mandant;
    m = lohnexportBestaetigen(m, { monat, ...lohnexportStand(m, monat), ...TROTZ }, L1, JETZT, "le-1").mandant;
    const vorher = datevAusFreeze(m, monat);
    const b = korrekturBeginnen(m, { monat, anlass: "fehler", grund: "Nachtdienst entfällt rückwirkend" }, L1, JETZT, "kb-1");
    const { mandant, geaendert } = istAendern(b.mandant, monat, 3);
    expect(geaendert).toBe(3);
    const z = abschliessen(mandant, { monat, trotzPrueffaellen: true }, L1, JETZT, "ma-2", HEUTE);
    expect(z.code).toBe(KORREKTUR_FREIGABE_ERFORDERLICH);
    expect(z.differenz.n).toBeGreaterThan(0);
    expect(vorher.length).toBeGreaterThan(0);
  });

  it("Beobachtung: eine reine Ist-Zeit-Änderung ohne Plan-/Zuschlagswirkung erzeugt eine leere Differenz (ausdrücklich n = 0), keine stille Lücke", () => {
    const monate = monateVor(HEUTE.slice(0, 7), 1);
    const monat = monate[0];
    let m = betriebMitZuschlaegen(12, monate);
    m = abschliessen(m, { monat, trotzPrueffaellen: true }, L1, JETZT, "ma-1", HEUTE).mandant;
    m = lohnexportBestaetigen(m, { monat, ...lohnexportStand(m, monat), ...TROTZ }, L1, JETZT, "le-1").mandant;
    const b = korrekturBeginnen(m, { monat, anlass: "fehler", grund: "Ist-Zeit einer Nacht korrigiert" }, L1, JETZT, "kb-1");
    const erf = { ...b.mandant.erfassung };
    const k = Object.keys(erf).find((x) => x.split("|")[1].startsWith(monat) && erf[x].start === "21:15");
    erf[k] = { ...erf[k], start: "23:30", grund: "Korrektur" };
    const z = abschliessen({ ...b.mandant, erfassung: erf }, { monat, trotzPrueffaellen: true }, L1, JETZT, "ma-2", HEUTE);
    expect("status" in z, JSON.stringify(z)).toBe(false);
    expect(z.differenz).toMatchObject({ n: 0, summe: 0 });
    expect(z.eintrag.abdruck).not.toBe(m.monatsabschluss[monat].abdruck);       // die Ist-Änderung ist im Abdruck des Abschlusses festgehalten
    expect(exportZeilenFuer(z.mandant, monat)).toMatchObject({ zeilen: [], revision: 2, korrekturZu: 1 });
  });
});
