/* ==========================================================================
   WP-S1 — Staging-Vorbereitung (nur lokal geprüft)

   Diese Prüfung läuft nie gegen Staging oder den VPS. Sie prüft:
   - die Proben (werkzeug/staging-smoke.mjs, pruefungen/staging-proben.mjs)
     sind fest auf 127.0.0.1:3000 verdrahtet, nehmen keine Argumente und
     lassen kein Ziel aus der Umgebung zu;
   - die Abnahme-Checkliste für den Betreiber deckt Testplan 3.1–3.4 ab.

   Die Proben selbst laufen lokal über `node pruefungen/staging-proben.mjs`
   (Ergebnis im Nachweis docs/acc45/wp-s1-nachweis.md).
   ========================================================================== */

import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";

const lies = (p) => readFile(new URL(`../${p}`, import.meta.url), "utf8");

describe("WP-S1: Staging-Smoke ist fest verdrahtet", () => {
  it("das Ziel ist fest 127.0.0.1:3000, Argumente werden abgewiesen", async () => {
    const s = await lies("werkzeug/staging-smoke.mjs");
    expect(s).toMatch(/const BASIS = "http:\/\/127\.0\.0\.1:3000";/);
    expect(s).toMatch(/process\.argv\.length > 2/);
  });

  it("Ziel-Umgebungsvariablen werden abgelehnt, und Geheimnisse werden geschwärzt", async () => {
    const s = await lies("werkzeug/staging-smoke.mjs");
    for (const v of ["CENTRIC_PROBE_BASIS", "STAGING_PROBE_BASIS", "PROBE_BASIS", "PROBE_URL"])
      expect(s).toContain(`"${v}"`);
    expect(s).toMatch(/const geheim = new Set\(\[VERWALTUNG\]\)/);
    expect(s).toMatch(/Exit 0: alle Prüfungen bestanden/);
  });
});

describe("WP-S1: Staging-Proben laufen nur lokal", () => {
  it("pruefungen/staging-proben.mjs startet nur den lokalen Server auf 127.0.0.1:3000", async () => {
    const p = await lies("pruefungen/staging-proben.mjs");
    expect(p).toMatch(/const BASIS = "http:\/\/127\.0\.0\.1:3000";/);
    /* Die fremden Adressen im Text sind Probeziele der Ablehnung (192.0.2.1, staging.example.invalid),
       nie Ziele eines Aufrufs. */
    expect(p).not.toMatch(/fetch\(\s*["'`]https?:/);
    expect(p).toMatch(/probe\(datei, \[\], \{ CENTRIC_PROBE_BASIS:/);
  });
});

describe("WP-S1: Abnahme-Checkliste für den Betreiber", () => {
  it("deckt Testplan 3.1 bis 3.4 ab und trägt keinen Lauf als erledigt ein", async () => {
    const c = await lies("docs/acc45/STAGING-ABNAHME-CHECKLISTE.md");
    for (const t of ["Testplan 3.1", "Testplan 3.2", "Testplan 3.3", "Testplan 3.4"])
      expect(c, t).toContain(t);
    expect(c).toMatch(/nicht gegen Staging gelaufen/);
    expect(c).not.toMatch(/- \[x\]/i);
    expect(c).toMatch(/keine Freigabe für Production/);
  });
});
