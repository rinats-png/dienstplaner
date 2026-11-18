/* Prädikat-Beleg für das Zufallsmuster der Bestandsdifferenz-Maskierung (siehe erstleitung-bestand-szenarien.mjs). */
import { describe, it, expect } from "vitest";
import { istZufall, maskieren, zufallAusAntwort } from "./hilfen/erstleitung-bestand-szenarien.mjs";

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

describe("Zufallswerte bekannter Erzeuger: exakt aus der Antwort statt Heuristik (Flake 18.11.)", () => {
  const ID = "et_zyppiMxAy_dnf";   // beobachtete Einladungskennung: keine Ziffer, kein Großbuchstabenpaar
  it("die Heuristik allein fängt die beobachtete Kennung nicht (Ursache des Flakes)", () => {
    expect(istZufall(ID)).toBe(false);
  });
  it("aus der Einladungsantwort übernommen, wird sie überall maskiert — auch in Schlüsseln", () => {
    const werte = zufallAusAntwort("/api/einladung", 200, { ok: true, id: ID, einladung: "x" });
    expect(werte).toEqual([ID]);
    const register = werte.map((w) => [w, "<ZUFALL>"]);
    expect(maskieren({ id: ID, [`centric/einladungsstatus:${ID}`]: { id: ID } }, register))
      .toEqual({ id: "<ZUFALL>", "centric/einladungsstatus:<ZUFALL>": { id: "<ZUFALL>" } });
  });
  it("Form des Erzeugers ist Pflicht: andere Länge, fremdes Zeichen, anderer Weg oder Fehlerantwort werden nicht übernommen", () => {
    expect(zufallAusAntwort("/api/einladung", 200, { id: `${ID}x` })).toEqual([]);
    expect(zufallAusAntwort("/api/einladung", 200, { id: "et_zyppiMxAy.dnf" })).toEqual([]);
    expect(zufallAusAntwort("/api/einladung/liste", 200, { id: ID })).toEqual([]);
    expect(zufallAusAntwort("/api/einladung", 403, { id: ID })).toEqual([]);
    expect(zufallAusAntwort("/api/sicherungsschluessel", 200, { schluessel: "a".repeat(32) })).toEqual(["a".repeat(32)]);
    expect(zufallAusAntwort("/api/sicherungsschluessel", 200, { schluessel: "a".repeat(31) })).toEqual([]);
  });
});
