/* ==========================================================================
   AUSLIEFERUNG — was ins Produkt geht (Review WP-10, N2)

   Design-Entwürfe (design/), Marketing (marketing/), Spezifikationen
   (docs/, auch .docx) und Vergleichsbasen (pruefungen/basis) gehören zum
   Repository, nicht zum ausgelieferten Produkt. Geprüft wird:
   - das Laufzeitbild (Dockerfile, Stufe „bild") kopiert nur dist, server,
     server.mjs, package.json, node_modules und benannte Werkzeuge;
   - dist entsteht aus index.html und public/; public/ enthält nur Icons,
     Manifest, Service Worker und das Vorschaubild — keine Entwürfe, keine
     Dokumente.

   Aufruf: npx vitest run pruefungen/auslieferung.test.js
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const WURZEL = process.cwd();
const lies = (f) => readFileSync(path.join(WURZEL, f), "utf8").replace(/\r\n/g, "\n");

describe("Auslieferung ohne Entwürfe und Dokumente", () => {
  it("das Laufzeitbild kopiert nur, was der Betrieb braucht", () => {
    const d = lies("Dockerfile");
    const bild = d.slice(d.indexOf("AS bild"));
    const kopien = [...bild.matchAll(/^COPY\s+(.+)$/gm)].map((x) => x[1]);
    const erlaubt = [/^--from=laufzeit \/app\/node_modules /, /^--from=bauen \/app\/dist /, /^server \.\/server$/,
      /^server\.mjs package\.json \.\/$/, /^vendor \.\/vendor$/, /^werkzeug\/[\w.-]+\.mjs( werkzeug\/[\w.-]+\.mjs)* \.\/werkzeug\/$/];
    for (const k of kopien) expect(erlaubt.some((r) => r.test(k)), k).toBe(true);
    const ohneKommentar = bild.split("\n").filter((z) => !z.trim().startsWith("#")).join("\n");
    expect(ohneKommentar).not.toMatch(/design|marketing|docs|\.docx/);
  });
  it("public/ enthält nur Icons, Manifest, Service Worker und Vorschau", () => {
    const erlaubt = /\.(png|svg|webmanifest|ico)$|^sw\.js$/;
    for (const f of readdirSync(path.join(WURZEL, "public"))) expect(erlaubt.test(f), f).toBe(true);
  });
  it("der Bau-Kontext lässt Marketing und Prüfungen draußen", () => {
    const ig = lies(".dockerignore").split("\n").map((z) => z.trim());
    for (const x of ["marketing", "pruefungen", ".git"]) expect(ig, x).toContain(x);
  });
  it("die Oberfläche bindet keine Entwürfe oder Dokumente ein", () => {
    const quellen = [];
    const gehe = (dir) => { for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) gehe(p); else if (/\.(js|jsx|mjs)$/.test(e.name)) quellen.push(p); } };
    gehe(path.join(WURZEL, "src"));
    for (const p of quellen) {
      const s = readFileSync(p, "utf8");
      expect(s, p).not.toMatch(/from\s+["'][^"']*(design\/|marketing\/|docs\/|\.docx)/);
      expect(s, p).not.toMatch(/import\(\s*["'][^"']*(design\/|marketing\/|docs\/)/);
    }
  });
});
