/* ==========================================================================
   DER SELBSTTEST DER ANWENDUNG

   src/pruefung.jsx trägt über fünfhundert Zusicherungen zu Rechenkern,
   Rechten, Preisen und Farben — und war bisher nur über die Oberfläche
   auszulösen, hinter Anmeldung und Navigation. Damit lief er in keinem
   automatischen Durchgang mit, ausgerechnet die Datei, die an vielen
   Stellen eigene Kopien aus App.jsx hält und deshalb am leichtesten
   auseinanderläuft.

   Hier wird die exportierte Funktion direkt aufgerufen.

   Aufruf: npx vitest run pruefungen/selbsttest.test.js
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { selbsttest } from "../src/pruefung.jsx";

describe("Selbsttest der Anwendung", () => {
  const ergebnis = selbsttest();

  it("liefert überhaupt Zusicherungen", () => {
    expect(Array.isArray(ergebnis)).toBe(true);
    expect(ergebnis.length).toBeGreaterThan(400);
  });

  it("besteht alle", () => {
    const schlecht = ergebnis.filter((t) => !t.ok);
    /* Bei einem Fehlschlag soll dastehen, welcher — nicht bloß eine Zahl. */
    const bericht = schlecht.map((t) => `${t.name}: erwartet ${t.erwartet}, ist ${t.ist}`);
    expect(bericht).toEqual([]);
    expect(schlecht.length).toBe(0);
  });
});
