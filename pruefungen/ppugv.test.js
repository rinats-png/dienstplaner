/* ==========================================================================
   PFLEGEPERSONALUNTERGRENZEN

   Die Rechnung ist einfach, die Fallstricke sind es nicht: Aufrunden statt
   Abrunden, der gedeckelte Hilfskraftanteil, und vor allem der Unterschied
   zwischen „eingehalten" und „nicht bewertbar".
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { BEREICHE, bereichVon, satzAm, grenzeFuer, pruefeSchicht, monatslage }
  from "../src/ppugv.js";

const heute = "2026-09-09";

describe("Bereiche und Regelsätze", () => {
  it("kennt die pflegesensitiven Bereiche mit Paragraf", () => {
    expect(BEREICHE.length).toBeGreaterThanOrEqual(15);
    for (const b of BEREICHE) {
      expect(b.id).toBeTruthy();
      expect(b.name).toBeTruthy();
      expect(b.paragraf).toMatch(/PpUGV/);
    }
  });

  it("die Kennungen sind eindeutig", () => {
    const ids = BEREICHE.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("findet den Regelsatz zum Stichtag", () => {
    expect(satzAm(heute)).toBeTruthy();
    expect(satzAm("2020-01-01")).toBe(null);
  });

  it("Intensivmedizin: 2:1 am Tag, 3:1 in der Nacht", () => {
    expect(grenzeFuer("intensiv", "tag", heute).patientenJeKraft).toBe(2);
    expect(grenzeFuer("intensiv", "nacht", heute).patientenJeKraft).toBe(3);
  });

  it("jeder Bereich hat Werte für Tag und Nacht", () => {
    for (const b of BEREICHE) {
      for (const schicht of ["tag", "nacht"]) {
        const g = grenzeFuer(b.id, schicht, heute);
        expect(g, `${b.id}/${schicht}`).toBeTruthy();
        expect(g.patientenJeKraft).toBeGreaterThan(0);
        expect(g.hilfskraftAnteil).toBeGreaterThanOrEqual(0);
        expect(g.hilfskraftAnteil).toBeLessThan(1);
      }
    }
  });

  it("die Nacht ist nie strenger als der Tag", () => {
    for (const b of BEREICHE) {
      expect(grenzeFuer(b.id, "nacht", heute).patientenJeKraft,
        b.id).toBeGreaterThanOrEqual(grenzeFuer(b.id, "tag", heute).patientenJeKraft);
    }
  });

  it("nennt Fassung und Paragraf", () => {
    const g = grenzeFuer("intensiv", "tag", heute);
    expect(g.fassung).toMatch(/PpUGV/);
    expect(g.paragraf).toBe("§ 6 PpUGV");
  });

  it("bereichVon findet und gibt sonst null", () => {
    expect(bereichVon("geriatrie").name).toBe("Geriatrie");
    expect(bereichVon("gibtesnicht")).toBe(null);
  });
});

describe("Eine Schicht prüfen", () => {
  const basis = { bereich: "intensiv", schicht: "tag", datum: heute };

  it("genug Personal ist grün", () => {
    const r = pruefeSchicht({ ...basis, patienten: 8, fachkraefte: 4, hilfskraefte: 0 });
    expect(r.urteil).toBe("gruen");
    expect(r.noetig).toBe(4);
  });

  it("zu wenig Personal ist rot und beziffert die Lücke", () => {
    const r = pruefeSchicht({ ...basis, patienten: 8, fachkraefte: 2, hilfskraefte: 0 });
    expect(r.urteil).toBe("rot");
    expect(r.noetig).toBe(4);
    expect(r.fehlend).toBe(2);
    expect(r.text).toContain("Es fehlen 2");
  });

  it("wird aufgerundet — ein halber Mensch steht nicht im Dienst", () => {
    const r = pruefeSchicht({ ...basis, patienten: 9, fachkraefte: 4, hilfskraefte: 0 });
    expect(r.noetig).toBe(5);
    expect(r.urteil).toBe("rot");
  });

  it("Hilfskräfte zählen nur bis zum gedeckelten Anteil", () => {
    /* Intensiv: höchstens 8 Prozent. Bei zehn Köpfen ist das genau einer. */
    const r = pruefeSchicht({ ...basis, patienten: 20, fachkraefte: 5, hilfskraefte: 5 });
    expect(r.hilfskraefteAnrechenbar).toBe(0);
    expect(r.angerechnet).toBe(5);
    expect(r.urteil).toBe("rot");
    expect(r.text).toContain("konnten nicht angerechnet werden");
  });

  it("in der Geriatrie zählt mehr Hilfskraft mit", () => {
    /* 15 Prozent von 20 Köpfen sind drei. */
    const r = pruefeSchicht({ bereich: "geriatrie", schicht: "tag", datum: heute,
      patienten: 100, fachkraefte: 10, hilfskraefte: 10 });
    expect(r.hilfskraefteAnrechenbar).toBe(3);
    expect(r.angerechnet).toBe(13);
    expect(r.noetig).toBe(10);
    expect(r.urteil).toBe("gruen");
  });

  it("nachts gilt der andere Schlüssel", () => {
    const tag = pruefeSchicht({ ...basis, patienten: 9, fachkraefte: 3, hilfskraefte: 0 });
    const nacht = pruefeSchicht({ ...basis, schicht: "nacht", patienten: 9, fachkraefte: 3, hilfskraefte: 0 });
    expect(tag.urteil).toBe("rot");
    expect(nacht.urteil).toBe("gruen");
  });

  it("ohne Patientenzahl ist nichts bewertbar — nicht grün", () => {
    for (const wert of [null, undefined, "", NaN]) {
      const r = pruefeSchicht({ ...basis, patienten: wert, fachkraefte: 4 });
      expect(r.urteil, String(wert)).toBe("grau");
      expect(r.grund).toBe("keinePatientenzahl");
      expect(r.text).toContain("nicht dasselbe wie eingehalten");
    }
  });

  it("ohne hinterlegten Bereich ist nichts bewertbar", () => {
    const r = pruefeSchicht({ bereich: null, schicht: "tag", datum: heute, patienten: 10 });
    expect(r.urteil).toBe("grau");
    expect(r.grund).toBe("keinBereich");
  });

  it("vor Inkrafttreten der Fassung ist nichts bewertbar", () => {
    const r = pruefeSchicht({ ...basis, datum: "2019-05-05", patienten: 4, fachkraefte: 2 });
    expect(r.urteil).toBe("grau");
    expect(r.grund).toBe("keinRegelsatz");
  });

  it("das Urteil nennt seine Quelle", () => {
    const r = pruefeSchicht({ ...basis, patienten: 8, fachkraefte: 4 });
    expect(r.quelle).toContain("§ 6 PpUGV");
  });

  it("null Patienten ist eine Zahl, keine fehlende Angabe", () => {
    const r = pruefeSchicht({ ...basis, patienten: 0, fachkraefte: 0 });
    expect(r.urteil).toBe("gruen");
    expect(r.noetig).toBe(0);
  });
});

describe("Monatslage", () => {
  it("zählt und hebt die roten heraus", () => {
    const p = [
      pruefeSchicht({ bereich: "intensiv", schicht: "tag", datum: heute, patienten: 8, fachkraefte: 4 }),
      pruefeSchicht({ bereich: "intensiv", schicht: "tag", datum: heute, patienten: 8, fachkraefte: 1 }),
      pruefeSchicht({ bereich: "intensiv", schicht: "tag", datum: heute, patienten: null, fachkraefte: 4 }),
    ];
    const l = monatslage(p);
    expect(l.gesamt).toBe(3);
    expect(l.gruen).toBe(1);
    expect(l.rot).toBe(1);
    expect(l.grau).toBe(1);
    expect(l.rote.length).toBe(1);
  });

  it("verträgt eine leere Liste", () => {
    expect(monatslage([]).gesamt).toBe(0);
    expect(monatslage(undefined).quote).toBe(null);
  });
});
