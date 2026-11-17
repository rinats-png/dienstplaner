/* WP-33 Rest: axe-core (WCAG 2.2 AA) auf weiteren Oberflächen (e2e/weitere-flaechen.mjs), je Viewport der Gerätematrix.
   Gleiches Gate wie e2e/barrierefreiheit.spec.mjs: serious und critical schlagen fehl, außer begründet in
   e2e/axe-ausnahmen.json. Nur lesend (Anmelden und Navigieren).

   Eine Anmeldung je Rolle und Viewport, nicht je Fläche: Der Server begrenzt gelungene Anmeldungen je Zugangscode auf
   20 je 5 Minuten, danach 5 Minuten Sperre (server/lib/schutz.mjs, „anmelden-code“). Mit einer Anmeldung je Fläche
   überschritt die Leitung in der CI die Grenze (844x390: hilfe-leitung, rechtliches-leitung und die Tests danach wurden
   abgewiesen; die Anmeldung kam nie zustande). Die Bremse bleibt unverändert; die Suite meldet sich seltener an.
   Jede Fläche behält ihren Namen (axe-Ergebnisdatei, Ausnahmeliste); ein Fund auf einer Fläche bricht die übrigen
   der Rolle nicht ab, am Ende schlägt der Test mit allen Funden fehl. */
import { test, anmelden, geheZu, axePruefen } from "./hilfen.mjs";
import { WEITERE_FLAECHEN } from "./weitere-flaechen.mjs";

const JE_ROLLE = new Map();
for (const f of WEITERE_FLAECHEN) JE_ROLLE.set(f[1], [...(JE_ROLLE.get(f[1]) || []), f]);

test.describe("Barrierefreiheit weiterer Flächen (axe, WCAG 2.2 AA)", () => {
  for (const [rolle, flaechen] of JE_ROLLE) {
    test(`${rolle}: ${flaechen.map((f) => f[0]).join(", ")}`, async ({ page }, testInfo) => {
      // Ein Test je Rolle fasst mehrere Flächen zusammen (je ca. 20 s mit axe); die globalen 90 s reichten für die Leitung mit
      // fünf Flächen nicht (CI 6b3b942c: Zeitüberschreitung bei 430x932 und 740x360, danach "Target page ... has been closed").
      // Das Zeitbudget wächst mit der Zahl der Flächen; das axe-Gate selbst bleibt unverändert.
      test.setTimeout(60_000 + 40_000 * flaechen.length);
      await anmelden(page, rolle);
      const fehler = [];
      for (const [flaeche, , ansicht] of flaechen) {
        try {
          await geheZu(page, ansicht);
          await axePruefen(page, testInfo, flaeche);
        } catch (e) {
          fehler.push(`${flaeche}: ${String(e && e.message || e).split("\n").slice(0, 12).join("\n")}`);
        }
      }
      if (fehler.length) throw new Error(`${fehler.length} von ${flaechen.length} Flächen @ ${testInfo.project.name} fehlgeschlagen:\n${fehler.join("\n---\n")}`);
    });
  }
});
