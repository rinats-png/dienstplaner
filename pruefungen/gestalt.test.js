/* ==========================================================================
   GESTALT — Strukturprüfung für den Leitstand-Stil

   Prüft, was sich beim Umbau leicht einschleicht und später niemandem mehr
   auffällt:
     - keine externen Ressourcen (Schrift, Bild, Skript, Stil) in der
       Anwendung — die CSP erlaubt nur 'self', und Inter liegt lokal
     - keine Textzeichen als Icons; der Satz in src/gestalt/icons.jsx gilt
     - keine neuen harten Hexfarben in App.jsx (die Zahl darf sinken, nie
       steigen); Farben gehören nach src/farben.js
     - der neue Code unter src/gestalt/ enthält gar keine
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import { Icon, ICON_NAMEN } from "../src/gestalt/icons.jsx";

const WURZEL = join(import.meta.dirname, "..");
const alle = (dir, endungen, aus = []) => {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) alle(p, endungen, aus);
    else if (endungen.some((e) => n.endsWith(e))) aus.push(p);
  }
  return aus;
};
const QUELLEN = alle(join(WURZEL, "src"), [".js", ".jsx", ".css"]);
const lies = (p) => readFileSync(p, "utf8");
const rel = (p) => relative(WURZEL, p).replaceAll("\\", "/");
/** Zeilen ohne reine Kommentare */
const codezeilen = (t) => t.split("\n").map((z, i) => [i + 1, z])
  .filter(([, z]) => !/^\s*(\/\/|\/?\*)/.test(z));

describe("Keine externen Ressourcen", () => {
  it("keine Google-Fonts, kein @import url(), keine CDN-Adresse", () => {
    const dateien = [...QUELLEN, join(WURZEL, "index.html")];
    for (const p of dateien) {
      const t = lies(p);
      expect(t, rel(p)).not.toMatch(/fonts\.googleapis|fonts\.gstatic|@import\s+url\(|cdn\.jsdelivr|unpkg\.com|cdnjs\./i);
    }
  });

  it("Adressen mit https:// stehen nur, wo sie hingehören", () => {
    /* Erlaubt: Quellenangaben in Kommentaren und Regeldaten, die App-Adresse in
       kontakt.js, Rechts- und Handbuchtexte, der XML-Namensraum im Auswahl-
       Pfeil (data:-URI, lädt nichts) und der Teilen-Verweis auf wa.me, den
       nur ein Klick öffnet. Alles andere wäre eine Ressource, die die CSP
       ohnehin abweist. */
    const ERLAUBT_DATEI = ["src/kontakt.js", "src/tarifwerke.js", "src/rechtstexte.jsx",
      "src/handbuch-inhalt.js", "src/tour-inhalt.js",
      /* Regelmodule nennen ihre Rechtsquellen im Kopfkommentar */
      "src/fahrzeit.js", "src/ppprl.js", "src/ppugv.js"];
    const funde = [];
    for (const p of QUELLEN) {
      if (ERLAUBT_DATEI.includes(rel(p))) continue;
      for (const [nr, z] of codezeilen(lies(p))) {
        if (!/https?:\/\//.test(z)) continue;
        if (/xmlns=['"]http:\/\/www\.w3\.org/.test(z)) continue;
        if (/wa\.me/.test(z)) continue;
        funde.push(`${rel(p)}:${nr}: ${z.trim().slice(0, 100)}`);
      }
    }
    expect(funde).toEqual([]);
  });

  it("der neue Code unter src/gestalt/ kennt gar keine Adresse", () => {
    for (const p of alle(join(WURZEL, "src", "gestalt"), [".js", ".jsx"])) {
      expect(lies(p), rel(p)).not.toMatch(/https?:\/\//);
    }
  });
});

describe("Icons", () => {
  const SYMBOLE = "⌕✉☰⏻◉▤✎◌◧◈∑✚›‹";
  it("kein Textzeichen dient als Symbol", () => {
    const funde = [];
    for (const p of QUELLEN) {
      for (const [nr, z] of codezeilen(lies(p))) {
        for (const c of SYMBOLE) if (z.includes(c)) funde.push(`${rel(p)}:${nr}: „${c}"`);
      }
    }
    expect(funde).toEqual([]);
  });

  it("jedes <Icon n=\"…\"> nennt ein Icon aus dem Satz", () => {
    const bekannt = new Set([...ICON_NAMEN, "chevron-l", "chevron-r", "chevron-u", "chevron-o", "kreuz", "zurueck"]);
    const unbekannt = [];
    for (const p of QUELLEN) {
      for (const m of lies(p).matchAll(/<Icon\s+n="([a-z-]+)"/g)) {
        if (!bekannt.has(m[1])) unbekannt.push(`${rel(p)}: ${m[1]}`);
      }
    }
    expect(unbekannt).toEqual([]);
  });

  it("die sechs Bereiche haben ein Icon aus dem Satz", () => {
    for (const n of ["raster", "kalender", "pruefliste", "personen", "saeulen", "zahnrad"]) {
      expect(ICON_NAMEN).toContain(n);
    }
  });

  it("jedes Icon ist ein SVG, das Vorlesesoftware überspringt", () => {
    for (const n of ICON_NAMEN) {
      const html = renderToStaticMarkup(React.createElement(Icon, { n }));
      expect(html, n).toContain("<svg");
      expect(html, n).toContain('aria-hidden="true"');
      expect(html, n).toContain('stroke="currentColor"');
    }
  });
});

describe("Farben", () => {
  const HEX = /#[0-9A-Fa-f]{6}\b/g;

  /* Stand nach P1/P2. Die Zahl darf sinken; wer sie erhöht, muss die Farbe
     in src/farben.js anlegen — oder begründen, warum sie Daten ist (eine
     Dienstart, eine Rollenfarbe, eine Druckvorlage). */
  const OBERGRENZE_APP = 128;

  it("App.jsx hat nicht mehr harte Hexfarben als bisher", () => {
    const n = (lies(join(WURZEL, "src", "App.jsx")).match(HEX) || []).length;
    expect(n, `harte Hexfarben in App.jsx: ${n} (Obergrenze ${OBERGRENZE_APP})`).toBeLessThanOrEqual(OBERGRENZE_APP);
  });

  it("der neue Code unter src/gestalt/ hat keine harte Hexfarbe", () => {
    for (const p of alle(join(WURZEL, "src", "gestalt"), [".js", ".jsx"])) {
      expect(lies(p).match(HEX) || [], rel(p)).toEqual([]);
    }
  });
});
