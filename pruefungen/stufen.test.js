/* ==========================================================================
   DAS PREISMODELL — die eine Fassung

   Diese Zahlen stehen an zwei Orten: hier in stufen.js und, als
   Python-Fassung, im Erzeuger der Website. Ein Preis, den die Website
   nennt und die Abrechnung nicht einhält, ist schlimmer als ein zu hoher
   Preis. Die Prüfung hier hält deshalb nicht nur die Rechenwege fest,
   sondern auch die Zahlen selbst — wer sie ändert, muss hier vorbei und
   erinnert sich an die zweite Fassung.
   ========================================================================== */

import { describe, it, expect } from "vitest";
import { STUFEN, stufeVon, ZUSATZ_PLANER, KONTAKT_AB_PLANER,
  KONTAKT_AB_ZUSCHLAGSSTANDORTE, PAKETE, paketkosten, preisFuer, passendeStufe }
  from "../src/stufen.js";

describe("Die Zahlen selbst", () => {
  it("nennt drei Stufen mit den vereinbarten Grundgebühren", () => {
    expect(STUFEN.map((s) => [s.id, s.name, s.grund])).toEqual([
      ["basis", "Basis", 89],
      ["pro", "Business", 159],
      ["enterprise", "Enterprise", 279],
    ]);
  });

  it("hält die Kontingente fest", () => {
    expect(STUFEN.map((s) => [s.planerInklusive, s.standorteInklusive, s.paketeFrei]))
      .toEqual([[1, 1, 0], [3, 2, 0], [8, 4, 2]]);
  });

  it("hält Pauschale und Kontaktschwellen fest", () => {
    expect(ZUSATZ_PLANER).toBe(25);
    expect(KONTAKT_AB_PLANER).toBe(16);
    expect(KONTAKT_AB_ZUSCHLAGSSTANDORTE).toBe(9);
  });

  it("nennt vier zahlende Branchenpakete", () => {
    expect(PAKETE.filter((p) => !p.pflicht).map((p) => [p.id, p.aufpreis])).toEqual([
      ["sicherheit", 79], ["pflege", 89], ["klinik", 129], ["industrie", 59],
    ]);
  });

  it("gibt für eine unbekannte Kennung die kleinste Stufe zurück", () => {
    expect(stufeVon("gibtsnicht").id).toBe("basis");
  });
});

describe("Der Preis eines Betriebs", () => {
  it("ist im Kontingent die nackte Grundgebühr", () => {
    expect(preisFuer(stufeVon("basis"), 1, [25]).gesamt).toBe(89);
    expect(preisFuer(stufeVon("pro"), 3, [200, 40]).gesamt).toBe(159);
  });

  it("zählt jeden Planer über dem Kontingent einzeln", () => {
    const p = preisFuer(stufeVon("basis"), 4, [10]);
    expect(p.zusatzPlaner).toBe(3);
    expect(p.summePlaner).toBe(75);
    expect(p.gesamt).toBe(89 + 75);
  });

  it("lässt die größten Standorte ins Kontingent, nicht die zuerst genannten", () => {
    /* Basis trägt einen Standort. Der große muss der freie sein — sonst
       bestraft die Reihenfolge der Eingabe. */
    const p = preisFuer(stufeVon("basis"), 1, [30, 200]);
    expect(p.zuschlaege.posten.length).toBe(1);
    expect(p.zuschlaege.summe).toBe(29);      // der 30er, Band 15–40
  });

  it("stuft jeden Zuschlagsstandort nach seiner eigenen Größe ein", () => {
    const p = preisFuer(stufeVon("basis"), 1, [500, 200, 60, 10]);
    // 500 frei; 200 → 119, 60 → 49, 10 → 0
    expect(p.zuschlaege.summe).toBe(168);
    expect(p.gesamt).toBe(89 + 168);
  });

  it("nimmt die Zahl der Beschäftigten nicht in die Rechnung auf", () => {
    const klein = preisFuer(stufeVon("pro"), 2, [20, 20]);
    const gross = preisFuer(stufeVon("pro"), 2, [4000, 4000]);
    expect(gross.gesamt).toBe(klein.gesamt);
  });

  it("rät ab der Enterprise-Kapazität zum Gespräch", () => {
    expect(preisFuer(stufeVon("enterprise"), 17, [50]).kontaktEmpfohlen).toBe(true);
    expect(preisFuer(stufeVon("enterprise"), 8,
      Array(14).fill(50)).kontaktEmpfohlen).toBe(true);
    expect(preisFuer(stufeVon("enterprise"), 8, [50, 50]).kontaktEmpfohlen).toBe(false);
  });
});

describe("Branchenpakete", () => {
  it("werden je Betrieb aufgeschlagen", () => {
    const p = preisFuer(stufeVon("basis"), 1, [10], ["pflege", "klinik"]);
    expect(p.summePakete).toBe(89 + 129);
    expect(p.gesamt).toBe(89 + 89 + 129);
  });

  it("sind in Enterprise zweimal frei — und zwar die teuersten", () => {
    const k = paketkosten(["industrie", "pflege", "klinik"], 2);
    expect(k.frei.map((p) => p.id)).toEqual(["klinik", "pflege"]);
    expect(k.summe).toBe(59);
  });

  it("bestrafen kein zusätzliches Paket", () => {
    /* Wer Pflege und Klinik hat und Industrie dazunimmt, darf nicht
       schlechter dastehen als vorher. */
    const zwei = paketkosten(["pflege", "klinik"], 2).summe;
    const drei = paketkosten(["pflege", "klinik", "industrie"], 2).summe;
    expect(zwei).toBe(0);
    expect(drei).toBeGreaterThanOrEqual(zwei);
  });

  it("zählt die Kernplattform nie mit", () => {
    expect(paketkosten(["kern"], 0).summe).toBe(0);
  });
});

describe("Die vorgeschlagene Stufe", () => {
  it("ist die kleinste, die die Planer-Zugänge ohne Aufpreis trägt", () => {
    expect(passendeStufe(1).id).toBe("basis");
    expect(passendeStufe(2).id).toBe("pro");
    expect(passendeStufe(3).id).toBe("pro");
    expect(passendeStufe(4).id).toBe("enterprise");
  });

  it("bleibt jenseits aller Kontingente bei der größten", () => {
    expect(passendeStufe(99).id).toBe("enterprise");
  });
});
