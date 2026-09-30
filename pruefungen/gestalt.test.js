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

  /* Stand nach P6 (P1/P2: 102; nach P7: 95; die Rollenfarben des Ablaufs und der Befehlsblock
     der Sicherung laufen jetzt über Tokens). Die Zahl darf sinken; wer sie erhöht, muss die Farbe
     in src/farben.js anlegen — oder begründen, warum sie Daten ist (eine
     Dienstart, eine Rollenfarbe, eine Druckvorlage). */
  const OBERGRENZE_APP = 95;

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

describe("Ansichten der Arbeitsebene und der Formulare", () => {
  /* Diese Ansichten (P5 und P6) zeigen Haken, Kreuze und Pfeile als Icon.
     Die übrigen Fundstellen von ✓ und ✕ liegen in anderen Blättern und
     kommen mit späteren Phasen. */
  const ANSICHTEN = ["Monatsplan", "Einsatzplan", "Jahresansicht", "Zeitachse", "Bereitschaft", "Selbstplanung",
    "Sondereinsaetze", "Schichtfolge", "Personal", "Qualifikationsmatrix", "Nachweise", "Kompetenzen",
    "Einarbeitung", "Betriebsmittel", "MeineSchichten", "Betrieb", "Tarifwerk", "Standorte", "Dienstarten",
    "Einstellungen", "Datenmitnahme", "SicherungAusserHaus", "Datenschutz", "Handbuch", "Hilfe",
    "Ablaufansicht", "Ablaufdiagramm", "Schichtuebergabe"];
  const quelle = lies(join(WURZEL, "src", "App.jsx"));
  const koerper = (name) => {
    const a = quelle.search(new RegExp(`^function ${name}\\(`, "m"));
    if (a < 0) return null;
    const rest = quelle.slice(a + 10);
    const b = rest.search(/^(function|const) \w+/m);
    return b < 0 ? rest : rest.slice(0, b);
  };

  it("jede Ansicht ist im Quelltext zu finden", () => {
    for (const n of ANSICHTEN) expect(koerper(n), n).not.toBeNull();
  });

  it("keine dieser Ansichten setzt ✓, ✕ oder → als Symbol", () => {
    const funde = [];
    for (const n of ANSICHTEN) {
      for (const [nr, z] of codezeilen(koerper(n))) {
        /* Erlaubt: Pfeile im Fließtext (»von → nach«, »Verwaltung → Datenschutz«) */
        if (/[✓✕]/.test(z)) funde.push(`${n}: ${z.trim().slice(0, 90)}`);
        if (/>\s*→\s*</.test(z)) funde.push(`${n} (Pfeil als Symbol): ${z.trim().slice(0, 90)}`);
        void nr;
      }
    }
    expect(funde).toEqual([]);
  });

  it("die Rollenfarben des Ablaufs folgen dem Erscheinungsbild (Zugriffsfunktionen, keine festen Werte)", () => {
    expect(quelle).toMatch(/const ROLLE_FARBE = \{\s*get leitung\(\)/);
  });
});

describe("Bausteine der Ansichten", async () => {
  const { Pille } = await import("../src/gestalt/bausteine.jsx");
  const { Kennzahlen, Balkenzeile, Zeitwahl, Statuszeile, Fehlerband } = await import("../src/gestalt/ansichten.jsx");
  const html = (el) => renderToStaticMarkup(el);

  it("die Pille versteht den bisherigen Namen `tone` — App.jsx ruft sie überall so auf", () => {
    /* Bis P3 las sie nur `ton`; jeder Aufruf mit `tone` wurde still neutral. */
    expect(html(React.createElement(Pille, { tone: "warn" }, "x"))).toContain("pille-warn");
    expect(html(React.createElement(Pille, { ton: "danger" }, "x"))).toContain("pille-danger");
    expect(html(React.createElement(Pille, { tone: null }, "x"))).toContain("pille-neutral");
    expect(html(React.createElement(Pille, { ton: "ok", tone: "warn" }, "x"))).toContain("pille-ok");
  });

  it("Kennzahlen lässt fehlende Karten und fehlende Trends einfach weg", () => {
    const h = html(React.createElement(Kennzahlen, { kacheln: [false, null,
      { label: "Offen", wert: 3, ton: "warn", sub: "Plätze" },
      { label: "Ruhe", wert: 0, trend: undefined }] }));
    expect(h.match(/class="karte kachel/g)).toHaveLength(2);
    expect(h).not.toContain("pille");           // kein Trend ohne beide Zeiträume
    expect(h).toContain("Plätze");
  });

  it("Zeitwahl behält die Beschriftungen der Knöpfe davor und lässt fehlende Knöpfe weg", () => {
    const voll = html(React.createElement(Zeitwahl, { onZurueck() {}, onWeiter() {}, onHeute() {}, mitte: "2026" }));
    expect(voll).toContain('aria-label="Zurück"');
    expect(voll).toContain('aria-label="Weiter"');
    expect(voll).toContain(">Heute<");
    expect(voll).toContain("2026");
    const ohneHeute = html(React.createElement(Zeitwahl, { onZurueck() {}, onWeiter() {} }));
    expect(ohneHeute).not.toContain("Heute");
  });

  it("Fehlerband wird vorgelesen, Statuszeile nicht gedruckt", () => {
    expect(html(React.createElement(Fehlerband, null, "Das Ende liegt vor dem Beginn."))).toContain('role="alert"');
    expect(html(React.createElement(Statuszeile, null, "x"))).toContain("noprint");
  });

  it("Balkenzeile kürzt den Anteil auf 0 bis 100", () => {
    const h = html(React.createElement(Balkenzeile, { label: "A", wert: 9, anteil: 250 }));
    expect(h).toContain('aria-valuenow="100"');
  });
});

describe("Textzeichen als Symbole (nach P7 überall ersetzt)", () => {
  it("✓ und ✕ kommen im Quelltext der Oberfläche nicht mehr vor", () => {
    const funde = [];
    for (const p of alle(join(WURZEL, "src"), [".js", ".jsx"])) {
      if (/(handbuch-inhalt|tour-inhalt|rechtstexte|pruefung)\./.test(p)) continue;
      lies(p).split("\n").forEach((z, i) => { if (/[✓✕]/.test(z)) funde.push(`${rel(p)}:${i + 1}`); });
    }
    expect(funde).toEqual([]);
  });
  it("kein Knopf trägt nur ein × als Beschriftung", () => {
    const t = lies(join(WURZEL, "src", "App.jsx"));
    expect(t.match(/>×<\/(Btn|button)>/g) || []).toEqual([]);
  });
});
