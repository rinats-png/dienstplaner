/* ==========================================================================
   PREISANZEIGE NACH ROLLE (B2)

   Seit der Positivliste für Planung und Leitung (714ee6f) fehlten Tarif und
   Preisgestaltung in der Sicht. preis() rechnete dann mit der ersten Stufe
   ohne Vereinbarung: Die Leitung sah einen falschen Monatspreis, die
   Planung Preise und Zuschläge, die sie nichts angehen.

   Jetzt: Die Leitung (billing.view) liest die Preisgrundlage ihres Betriebs
   (sicht-planung-leitung.test.js); die Ansicht Standorte zeigt Preise,
   Zuschläge und Kontingent nur mit billing.view. Die Planung führt
   Standorte weiterhin, ohne Preisangaben.
   ========================================================================== */

import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";

const quelle = async () => (await readFile(path.join(__dirname, "..", "src", "App.jsx"), "utf8")).replace(/\r\n/g, "\n");
const block = (q, start) => {
  const ab = q.indexOf(start);
  expect(ab, start).toBeGreaterThan(0);
  return q.slice(ab, q.indexOf("\n}\n", ab));
};

const GESCHUETZT = [
  "right={!preiseSichtbar ? null : p.summeStandorte > 0",
  '{preiseSichtbar && (<>{" "}Anlegen kostet nichts',
  '{preiseSichtbar && (<Pill size="sm" tone={zuschlag > 0',
  "{preiseSichtbar && (<div style={{ fontSize: 12.5, color: C.dimmer, marginTop: 8 }}>",
];

describe("Standorte", () => {
  it("Preise nur mit billing.view: Kopf, Erläuterung, je Standort, Hinweis unten", async () => {
    const s = block(await quelle(), "function Standorte({ sitz, akt }) {");
    expect(s).toContain('const preiseSichtbar = darf(sitz, "billing.view");');
    for (const z of GESCHUETZT) expect(s, z).toContain(z);
    /* keine weitere Preisangabe in der Ansicht: genau die zwei geschützten eur(…) */
    expect(s.match(/eur\(/g) || []).toHaveLength(2);
  });
  it("die Rollenrechte der Oberfläche: Planung ohne billing.view", async () => {
    expect(await quelle()).toMatch(/planer: ALLE_RECHTE\.filter\(\(r\) => !\[[^\]]*"billing\.view"[^\]]*\]\.includes\(r\)\)/);
  });
});
