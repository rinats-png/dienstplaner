/* ==========================================================================
   Selbsttest ist vom Kalendertag unabhängig (Regression, 2026-11-28)

   Befund: Ab dem 28.11.2026 schlug pruefungen/selbsttest.test.js (CI-Check „pruefen-c“) auf jedem Zweig fehl:
   „Freischicht senkt das Stundenkonto: erwartet true, ist false“. Ursache (belegt, siehe Nachweis in
   docs/acc45/QS-ZEITABHAENGIGKEIT.md, Abschnitt 1.4): Die Zusicherung nahm den ersten Ausgleichstag AB heute()
   (`ausgleichTage(m, pA, heute(), 5)[0]`), prüfte das Stundenkonto aber für den Monat `ym` = Monat von heute().
   Hat die Person ab heute bis Monatsende keinen Diensttag, liegt der erste Ausgleichstag im Folgemonat
   (28.–30.11. → 01.12.; 31.10. → 03.11.) und senkt das Konto des geprüften Monats nicht.
   Zweiter, noch nicht ausgelöster Fehler gleicher Klasse: „Teilzeit trifft das Sollkonto über ein Quartal“
   bildete das Quartal mit Monat modulo 12, aber ohne Jahreswechsel (Dezember 2026 + Januar/Februar 2026) → ab 01.12.2026 rot.

   Hier läuft der gesamte Selbsttest mit festen Uhren (nur Date, lokale Zeit, zonenstabil), darunter die Tage, an denen
   er rot war oder würde (Monatsende, 01.12., Jahresende). Jeder Lauf dauert einige Sekunden bis Minuten; die Tage sind
   deshalb bewusst wenige und gezielt gewählt.

   Aufruf: npx vitest run pruefungen/selbsttest-datumsstabil.test.js
   ========================================================================== */
import { describe, it, expect, vi, afterEach } from "vitest";
import { selbsttest } from "../src/pruefung.jsx";

/** [Jahr, Monat 1–12, Tag, Grund] */
const TAGE = [
  [2026, 11, 28, "Tag des Befunds: erster Diensttag liegt im Dezember"],
  [2026, 11, 30, "Monatsende November"],
  [2026, 12, 1, "Quartal über den Jahreswechsel"],
  [2026, 12, 31, "Jahresende"],
];

describe("Selbsttest ist vom Kalendertag unabhängig", () => {
  afterEach(() => { vi.useRealTimers(); });

  for (const [j, mo, t, grund] of TAGE) {
    const tag = `${j}-${String(mo).padStart(2, "0")}-${String(t).padStart(2, "0")}`;
    it(`besteht alle Zusicherungen am ${tag} (${grund})`, () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date(j, mo - 1, t, 12, 0, 0));
      const ergebnis = selbsttest();
      expect(ergebnis.length).toBeGreaterThan(400);
      const bericht = ergebnis.filter((x) => !x.ok).map((x) => `${tag}: ${x.name}: erwartet ${x.erwartet}, ist ${x.ist}`);
      expect(bericht).toEqual([]);
    }, 300000);
  }
});
