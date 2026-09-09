/* ==========================================================================
   PPP-RL

   Minuten je Patient und Woche, aufgeteilt auf Berufsgruppen. Zwei Dinge
   müssen stimmen: die Unterscheidung zwischen „unter der Vorgabe" und
   „unter der Mindesterfüllung" — an der hängen die Abschläge — und das
   Schweigen, wo nichts erfasst ist.
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { BEREICHE, ARTEN, BERUFSGRUPPEN, bereichVon, satzAm, richtwerte,
  pruefeWoche, MINDESTERFUELLUNG } from "../src/ppprl.js";

const heute = "2026-09-09";

describe("Stammdaten", () => {
  it("kennt Bereiche, Arten und Berufsgruppen", () => {
    expect(BEREICHE.length).toBe(3);
    expect(ARTEN.length).toBe(2);
    expect(BERUFSGRUPPEN.length).toBe(5);
  });

  it("für jede Kombination gibt es Richtwerte", () => {
    for (const b of BEREICHE) {
      for (const a of ARTEN) {
        const rw = richtwerte(b.id, a.id, heute, null);
        expect(rw, `${b.id}/${a.id}`).toBeTruthy();
        for (const g of BERUFSGRUPPEN) {
          expect(rw.werte[g.id], `${b.id}/${a.id}/${g.id}`).toBeGreaterThan(0);
        }
      }
    }
  });

  it("eigene Werte schlagen die Ausgangswerte", () => {
    const eigen = { "psych_erwachsene|vollstationaer": { pflege: 999 } };
    const rw = richtwerte("psych_erwachsene", "vollstationaer", heute, eigen);
    expect(rw.werte.pflege).toBe(999);
    expect(rw.eigen).toBe(true);
    /* Was die Einrichtung nicht überschreibt, bleibt stehen. */
    expect(rw.werte.aerzte).toBeGreaterThan(0);
  });

  it("der Regelsatz ist datiert", () => {
    expect(satzAm(heute)).toBeTruthy();
    expect(satzAm("2019-01-01")).toBe(null);
  });

  it("bereichVon findet und gibt sonst null", () => {
    expect(bereichVon("psychosomatik").name).toContain("Psychosomatik");
    expect(bereichVon("gibtesnicht")).toBe(null);
  });
});

describe("Eine Woche prüfen", () => {
  const basis = { bereich: "psych_erwachsene", art: "vollstationaer", datum: heute };
  const soll = richtwerte("psych_erwachsene", "vollstationaer", heute, null).werte;
  const volles = (pat, faktor = 1) => Object.fromEntries(
    BERUFSGRUPPEN.map((g) => [g.id, Math.round(soll[g.id] * pat * faktor)]));

  it("alles erfüllt ist grün", () => {
    const r = pruefeWoche({ ...basis, patienten: 20, minuten: volles(20) });
    expect(r.urteil).toBe("gruen");
  });

  it("knapp darunter ist gelb, nicht rot", () => {
    const r = pruefeWoche({ ...basis, patienten: 20, minuten: volles(20, 0.95) });
    expect(r.urteil).toBe("gelb");
    expect(r.text).toContain("über der Mindesterfüllung");
  });

  it("unter der Mindesterfüllung ist rot", () => {
    const r = pruefeWoche({ ...basis, patienten: 20, minuten: volles(20, 0.8) });
    expect(r.urteil).toBe("rot");
    expect(r.text).toContain("Abschläge");
  });

  it("die Schwelle liegt bei neunzig Prozent", () => {
    expect(MINDESTERFUELLUNG).toBe(0.9);
    const knapp = pruefeWoche({ ...basis, patienten: 20, minuten: volles(20, 0.90) });
    expect(knapp.urteil).toBe("gelb");
    const drunter = pruefeWoche({ ...basis, patienten: 20, minuten: volles(20, 0.89) });
    expect(drunter.urteil).toBe("rot");
  });

  it("eine einzelne Gruppe unter der Schwelle genügt für rot", () => {
    const min = volles(20);
    min.psychologen = Math.round(min.psychologen * 0.5);
    const r = pruefeWoche({ ...basis, patienten: 20, minuten: min });
    expect(r.urteil).toBe("rot");
    expect(r.text).toContain("Psycholog");
  });

  it("ohne Patientenzahl ist nichts bewertbar", () => {
    for (const wert of [null, undefined, "", NaN]) {
      const r = pruefeWoche({ ...basis, patienten: wert, minuten: volles(20) });
      expect(r.urteil, String(wert)).toBe("grau");
      expect(r.grund).toBe("keinePatientenzahl");
    }
  });

  it("ohne erfasste Minuten ist nichts bewertbar", () => {
    const r = pruefeWoche({ ...basis, patienten: 20, minuten: {} });
    expect(r.urteil).toBe("grau");
    expect(r.grund).toBe("keineMinuten");
  });

  it("nicht erfasste Gruppen werden benannt, nicht geraten", () => {
    const r = pruefeWoche({ ...basis, patienten: 20, minuten: { pflege: soll.pflege * 20 } });
    expect(r.luecken.length).toBe(4);
    /* Was erfasst ist, wird bewertet — der Rest steht als Lücke da. */
    expect(r.zeilen.find((z) => z.gruppe.id === "pflege").erfuellt).toBe(true);
    expect(r.zeilen.find((z) => z.gruppe.id === "aerzte").erfuellt).toBe(null);
  });

  it("ohne Bereich ist nichts bewertbar", () => {
    const r = pruefeWoche({ bereich: null, art: "vollstationaer", datum: heute, patienten: 5 });
    expect(r.urteil).toBe("grau");
    expect(r.grund).toBe("keinBereich");
  });

  it("das Soll skaliert mit der Belegung", () => {
    const zehn = pruefeWoche({ ...basis, patienten: 10, minuten: volles(10) });
    const zwanzig = pruefeWoche({ ...basis, patienten: 20, minuten: volles(20) });
    const p = (r) => r.zeilen.find((z) => z.gruppe.id === "pflege").soll;
    expect(p(zwanzig)).toBe(p(zehn) * 2);
  });

  it("das Urteil nennt seine Quelle", () => {
    const r = pruefeWoche({ ...basis, patienten: 20, minuten: volles(20) });
    expect(r.quelle).toBeTruthy();
  });

  it("die Kinder- und Jugendpsychiatrie verlangt mehr als die Erwachsenenpsychiatrie", () => {
    const e = richtwerte("psych_erwachsene", "vollstationaer", heute, null).werte;
    const k = richtwerte("psych_kjp", "vollstationaer", heute, null).werte;
    expect(k.pflege).toBeGreaterThan(e.pflege);
    expect(k.psychologen).toBeGreaterThan(e.psychologen);
  });
});
