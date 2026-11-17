/* Prädikat-Beleg für das Zufallsmuster der Bestandsdifferenz-Maskierung (siehe erstleitung-bestand-szenarien.mjs). */
import { describe, it, expect } from "vitest";
import { istZufall, maskieren } from "./hilfen/erstleitung-bestand-szenarien.mjs";

describe("Zufallsmuster der Maskierung", () => {
  it("maskiert die beobachtete Einladungskennung (CI-Lauf 44031380657)", () => {
    expect(istZufall("KqejpjhBcDwy-Lq-")).toBe(true);
    expect(maskieren({ id: "KqejpjhBcDwy-Lq-" }, new Map())).toEqual({ id: "<ZUFALL>" });
  });
  it("maskiert die bisherigen Formen weiterhin", () => {
    expect(istZufall("IPs_uewFyvnfbntG")).toBe(true);
    expect(istZufall("abc123def456ghi7")).toBe(true);
  });
  it.each([
    "X-Forwarded-Host", "sitzungenBeendet", "toHaveBeenCalled", "In-App-Sicherung", "Wiederherstellen",
    "ablageSchluessel", "max.muster@beispiel-betrieb.example",
  ])("lässt %s unverändert", (w) => {
    const maskiert = maskieren({ k: w }, new Map());
    expect(maskiert).toEqual({ k: w });
  });
  it("Gegenprobe: sitzungenBeendet und sitzungenBeendeX bleiben unmaskiert", () => {
    expect(istZufall("sitzungenBeendet")).toBe(false);
    expect(istZufall("sitzungenBeendeX")).toBe(false);
  });
});
