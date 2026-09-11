/* ==========================================================================
   BREMSE — der prozesslokale Zähler und entlasten()

   bremse() zählt Versuche an drei Stellen: in der Ablage, optional atomar
   im Fremddienst und in einer Karte im Speicher des Prozesses. entlasten()
   nimmt nach einem Erfolg alle drei zurück — der Speicher wurde dabei
   lange übersehen, was auf kurzlebigen Funktionsinstanzen nicht auffiel.
   Auf einem dauerhaften Server hätte es nach acht Anmeldungen hinter
   derselben Adresse auch die richtigen ausgesperrt. Das darf nicht wieder
   passieren.
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

let wurzel, bremse, entlasten, GRENZEN;

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-bremse-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  delete process.env.REDIS_REST_URL;
  ({ bremse, entlasten, GRENZEN } = await import("../netlify/lib/schutz.mjs"));
});

afterAll(async () => {
  await rm(wurzel, { recursive: true, force: true });
});

describe("Die Bremse für das Anmelden", () => {
  it("lässt so viele Fehlversuche zu, wie die Grenze nennt, und dann keinen mehr", async () => {
    const k = "a:fehlversuche";
    for (let i = 1; i <= GRENZEN.anmelden.versuche; i++)
      expect((await bremse("anmelden", k)).frei, `Versuch ${i}`).toBe(true);
    const zuViel = await bremse("anmelden", k);
    expect(zuViel.frei).toBe(false);
    expect(zuViel.wartet).toBeGreaterThan(0);
  });

  it("hält die Sperre auch über den lokalen Zähler hinaus", async () => {
    /* Einmal gesperrt, bleibt gesperrt — unabhängig davon, welcher der
       drei Zähler die Grenze gerissen hat. */
    expect((await bremse("anmelden", "a:fehlversuche")).frei).toBe(false);
  });

  it("zählt erfolgreiche Anmeldungen nicht gegen die Adresse", async () => {
    /* Das Bild aus dem Betrieb: eine Station, ein Anschluss, ein Dutzend
       Personen, die sich nacheinander mit richtigem Code anmelden. */
    const k = "a:station";
    for (let i = 1; i <= GRENZEN.anmelden.versuche * 2; i++) {
      const b = await bremse("anmelden", k);
      expect(b.frei, `Anmeldung ${i}`).toBe(true);
      await entlasten("anmelden", k);
    }
  });

  it("setzt nach einem Erfolg auch den Speicherzähler zurück", async () => {
    const k = "a:vertippt";
    const fast = GRENZEN.anmelden.versuche - 1;
    for (let i = 0; i < fast; i++) expect((await bremse("anmelden", k)).frei).toBe(true);
    await entlasten("anmelden", k);                       // richtig eingegeben
    for (let i = 0; i < fast; i++)                        // wieder vertippt — von vorn gezählt
      expect((await bremse("anmelden", k)).frei, `nach Erfolg, Versuch ${i + 1}`).toBe(true);
  });

  it("entlastet nur die genannte Kennung", async () => {
    const k1 = "a:eins", k2 = "a:zwei";
    for (let i = 0; i < GRENZEN.anmelden.versuche; i++) { await bremse("anmelden", k1); await bremse("anmelden", k2); }
    await entlasten("anmelden", k1);
    expect((await bremse("anmelden", k1)).frei).toBe(true);
    expect((await bremse("anmelden", k2)).frei).toBe(false);
  });
});
