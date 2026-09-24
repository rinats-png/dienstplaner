/* ==========================================================================
   ADRESSEN — die Vergleichsform einer E-Mail-Adresse

   Zwei Fehler wären hier teuer, und beide sind still: Eine zu enge
   Normalisierung trennt einen Menschen von seinem Konto, weil das Telefon
   den ersten Buchstaben groß geschrieben hat. Eine zu großzügige führt
   zwei Menschen auf ein Konto zusammen, weil ein Anbieter Punkte ignoriert
   und der nächste nicht.

   Deshalb prüft diese Datei beides: was zusammengeführt werden MUSS und
   was getrennt bleiben MUSS.
   ========================================================================== */

import { describe, it, expect } from "vitest";
import { mailNormieren, mailBrauchbar, mailMaskieren, MAIL_MAX }
  from "../server/lib/adressen.mjs";

describe("Was zusammengeführt wird", () => {
  it("macht aus Groß- und Kleinschreibung dieselbe Adresse", () => {
    expect(mailNormieren("Max.Mueller@Example.DE")).toBe("max.mueller@example.de");
    expect(mailNormieren("MAX@EXAMPLE.ORG")).toBe("max@example.org");
  });

  it("schneidet Leerzeichen am Rand ab — die kommen aus der Zwischenablage", () => {
    expect(mailNormieren("  max@example.org  ")).toBe("max@example.org");
    expect(mailNormieren("\tmax@example.org\n")).toBe("max@example.org");
  });

  it("lässt eine gewöhnliche Adresse unverändert", () => {
    expect(mailNormieren("max@example.org")).toBe("max@example.org");
  });
});

describe("Was getrennt bleibt", () => {
  it("entfernt keine Punkte im örtlichen Teil — das ist keine Gmail-Regel für alle", () => {
    expect(mailNormieren("max.mueller@example.org")).toBe("max.mueller@example.org");
    expect(mailNormieren("max.mueller@gmail.com")).not.toBe("maxmueller@gmail.com");
  });

  it("schneidet keine Plus-Kennzeichnung ab — sie ist eine eigene Adresse", () => {
    expect(mailNormieren("max+centric@example.org")).toBe("max+centric@example.org");
    expect(mailNormieren("max+centric@gmail.com")).not.toBe("max@gmail.com");
  });

  it("behandelt keinen Anbieter besonders", () => {
    for (const domain of ["gmail.com", "googlemail.com", "gmx.de", "web.de", "outlook.com"]) {
      expect(mailNormieren(`a.b+c@${domain}`)).toBe(`a.b+c@${domain}`);
    }
  });
});

describe("Leeres und Unsinn", () => {
  it("gibt für Leeres eine leere Zeichenkette zurück, statt zu werfen", () => {
    for (const x of [undefined, null, "", "   ", 0, false, {}, []]) {
      expect(typeof mailNormieren(x)).toBe("string");
    }
    expect(mailNormieren(undefined)).toBe("");
    expect(mailNormieren(null)).toBe("");
    expect(mailNormieren("   ")).toBe("");
  });
});

describe("Brauchbarkeit", () => {
  it("nimmt gewöhnliche Adressen an", () => {
    for (const m of ["max@example.org", "max.mueller+centric@sub.example.co.uk",
      "a@b.de", "MAX@EXAMPLE.ORG", "  max@example.org "]) {
      expect(mailBrauchbar(m), m).toBe(true);
    }
  });

  it("weist ab, was sich nicht zustellen lässt", () => {
    for (const m of ["", "   ", undefined, null, "max", "max@", "@example.org",
      "max@@example.org", "max@localhost", "max@.de", "max@example.",
      "ma x@example.org", "max@exa mple.org"]) {
      expect(mailBrauchbar(m), String(m)).toBe(false);
    }
  });

  it("weist eine zu lange Adresse ab", () => {
    const lang = "a".repeat(MAIL_MAX) + "@example.org";
    expect(mailBrauchbar(lang)).toBe(false);
    expect(mailBrauchbar("a".repeat(MAIL_MAX - 13) + "@example.org")).toBe(true);
  });
});

describe("Maskieren", () => {
  it("zeigt den ersten Buchstaben und die Domäne", () => {
    expect(mailMaskieren("max.mueller@example.org")).toBe("m***@example.org");
    expect(mailMaskieren("  MAX@Example.ORG ")).toBe("m***@example.org");
  });

  it("gibt für Unbrauchbares nichts aus", () => {
    expect(mailMaskieren("kaputt")).toBe("");
    expect(mailMaskieren(null)).toBe("");
  });
});
