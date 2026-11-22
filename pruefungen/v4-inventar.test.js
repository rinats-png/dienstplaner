/* ==========================================================================
   V4-1: Inventar der Oberflächendateien (werkzeug/v4-inventar.mjs, docs/acc45/V4-INVENTAR.md).

   Geprüft: die Zählfunktionen an kleinen Beispielen (auch Gegenproben), die Ableitung von Ansicht → Datei aus App.jsx,
   die Rollenordnung, Determinismus des Gesamtlaufs, Nenner-Invariante, keine toten ZUORDNUNG-Einträge.
   Nur Warnung (console.warn), nicht rot: neue Oberflächendatei ohne ZUORDNUNG (Familie „offen“) und im Dokument
   genannte, inzwischen verschwundene Datei (das Dokument ist ein datierter Schnappschuss). Hart prüfen das
   `node werkzeug/v4-inventar.mjs --streng` (Exit 1) für V4-Wellen und Koordinator.
   Rein lesend: kein Netz, keine Uhr, keine Kindprozesse.
   Aufruf: npx vitest run pruefungen/v4-inventar.test.js
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  kennzahlen, tokenStufe, aufwandsklasse, ordneRollen, ansichtenAusApp, inventar, zusammenfassung, alsMarkdown,
  ZUORDNUNG, FAMILIEN, dateiliste, dokumentDateien, strengeBefunde, strengerAusgang,
} from "../werkzeug/v4-inventar.mjs";
import { NAV_KUNDE, NAV_BETREIBER } from "../src/app/navigation.js";

const WURZEL = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const lies = (p) => readFileSync(join(WURZEL, p), "utf8").replace(/\r\n/g, "\n");

describe("Zählfunktionen", () => {
  it("Farbliterale: rgb/rgba und Hex, aber keine HTML-Entität und kein Teil eines Bezeichners", () => {
    const k = kennzahlen('a{color:rgba(0,0,0,.5)} b{color:rgb(1,2,3)} c="#0b6058" d="#fff" e="&#039;" f="x#abc" g="#12"');
    expect(k.rgb).toBe(2);
    expect(k.hex).toBe(2);
  });

  it("Glas ohne Rückfall nur bei gesetzter Eigenschaft; mit reduced-transparency oder @supports gilt der Rückfall", () => {
    expect(kennzahlen("x{backdrop-filter: blur(8px)}").backdropOhneRueckfall).toBe(1);
    expect(kennzahlen("style={{ backdropFilter: 'blur(4px)' }}").backdropOhneRueckfall).toBe(1);
    expect(kennzahlen("x{backdrop-filter: blur(8px)} @media (prefers-reduced-transparency: reduce){x{backdrop-filter:none}}").backdropOhneRueckfall).toBe(0);
    expect(kennzahlen("/* kein backdrop-filter hier */").backdrop).toBe(0);
  });

  it("Overlay-Klassen werden nur in className gezählt, Vorlagenausdrücke ausgenommen", () => {
    const k = kennzahlen('<div className="karte btn x" /><b className={`btn ${on ? "karte" : ""}`} /><i title="karte" />', ["karte", "btn"]);
    expect(k.klassenAttr).toBe(2);
    expect(k.overlay).toBe(3);
  });

  it("V4-Bausteine, Dialogstellen, Zustände, aria", () => {
    const k = kennzahlen('import { V4Knopf } from "../v4/komponenten.jsx"; <V4Knopf/> <V4Dialog titel="t"/> <Fenster/> <div role="dialog" aria-modal="true"/> <Leer/> <Laden/>');
    expect(k.v4Import).toBe(true);
    expect(k.v4Baustein).toBe(2);
    expect(k.dialog).toBe(3);
    expect(k.zustand).toBe(2);
    expect(k.aria).toBe(1);
    expect(k.rolle).toBe(1);
  });

  it("Token-Stufen in fester Rangfolge", () => {
    expect(tokenStufe(kennzahlen("x{color:var(--v4-ink)}"))).toBe("direkt");
    expect(tokenStufe(kennzahlen('import { C } from "../farben.js";'))).toBe("Palette");
    expect(tokenStufe(kennzahlen('import { Btn } from "../ui/bausteine.jsx";'))).toBe("Bausteine");
    expect(tokenStufe(kennzahlen("const a = 1;"))).toBe("keine");
  });

  it("Aufwandsklasse wächst mit Zeilen und Farbliteralen", () => {
    expect(aufwandsklasse(kennzahlen("a\n".repeat(50)))).toBe("S");
    expect(aufwandsklasse(kennzahlen("a\n".repeat(400)))).toBe("M");
    expect(aufwandsklasse(kennzahlen("a\n".repeat(250) + "rgb(1,2,3)\n".repeat(10)))).toBe("M");
    expect(aufwandsklasse(kennzahlen("a\n".repeat(3000)))).toBe("XL");
  });

  it("Rollen: eindeutig, feste Reihenfolge, Paketvermerk entfällt neben der Rolle selbst", () => {
    expect(ordneRollen(["betriebsrat", "leitung", "leitung+Paket", "planer+Paket", "leitung"]))
      .toEqual(["leitung", "planer+Paket", "betriebsrat"]);
  });
});

describe("Ansicht → Datei aus App.jsx", () => {
  it("Rahmen aus ui/ (H1, Card) zählen nicht, die Ansicht dahinter schon; lokale Funktionen gehören zu App.jsx", () => {
    const app = [
      'import { H1, Card } from "./ui/bausteine.jsx";',
      'import { Planstand } from "./ansichten/planstand.jsx";',
      "function Betrieb() { return null; }",
      '{aktiveView === "planstand" && <div><H1>x</H1><Card><Planstand /></Card></div>}',
      '{aktiveView === "betrieb" && <Betrieb />}',
    ].join("\n");
    expect(ansichtenAusApp(app)).toEqual([
      { id: "planstand", komponente: "Planstand", datei: "src/ansichten/planstand.jsx" },
      { id: "betrieb", komponente: "Betrieb", datei: "src/App.jsx" },
    ]);
  });

  it("jeder Navigationseintrag ist in App.jsx einer Datei zugeordnet", () => {
    const routen = ansichtenAusApp(lies("src/App.jsx"));
    for (const [id] of [...NAV_KUNDE, ...NAV_BETREIBER]) {
      const r = routen.filter((a) => a.id === id);
      expect(r.length, id).toBeGreaterThan(0);
      for (const a of r) expect(a.datei && existsSync(join(WURZEL, a.datei)), id).toBe(true);
    }
  });
});

describe("Gesamtlauf", () => {
  it("deterministisch, ohne tote Zuordnung; ZUORDNUNG nennt nur Familien aus FAMILIEN", async () => {
    const a = await inventar(), b = await inventar();
    expect(alsMarkdown(a)).toBe(alsMarkdown(b));
    const z = zusammenfassung(a);
    expect(z.dateien).toBe(dateiliste().length);
    for (const x of a.eintraege) expect(Object.keys(FAMILIEN), x.datei).toContain(x.familie);
    for (const d of Object.keys(ZUORDNUNG)) expect(existsSync(join(WURZEL, d)), `tote Zuordnung: ${d}`).toBe(true);
    for (const [fam] of Object.values(ZUORDNUNG)) {
      expect(Object.keys(FAMILIEN)).toContain(fam);
      expect(fam).not.toBe("offen");
    }
  });

  it("neue Datei ohne Zuordnung: nur Warnung, Familie „offen“", async () => {
    const inv = await inventar();
    const ohne = zusammenfassung(inv).ohneFamilie;
    if (ohne.length) console.warn(`V4-Inventar: ohne ZUORDNUNG (Familie „offen“, werkzeug/v4-inventar.mjs ergänzen): ${ohne.join(", ")}`);
    for (const d of ohne) expect(inv.eintraege.find((x) => x.datei === d).familie).toBe("offen");
  });

  it("Anteile haben einen Nenner: Summe der Token-Stufen ist die Dateizahl", async () => {
    const z = zusammenfassung(await inventar());
    expect(Object.values(z.tokens).reduce((s, n) => s + n, 0)).toBe(z.dateien);
    expect(z.ohneV4.dateien).toBe(z.dateien - (z.jeGruppe.V4 || 0));
    expect(z.ohneV4.farbrein).toBeLessThanOrEqual(z.ohneV4.dateien);
  });
});

describe("Inventardokument", () => {
  const doc = lies("docs/acc45/V4-INVENTAR.md");
  it("nennt Werkzeug und Test; verschwundene Dateien nur als Warnung (datierter Schnappschuss)", () => {
    expect(doc).toContain("werkzeug/v4-inventar.mjs");
    expect(doc).toContain("pruefungen/v4-inventar.test.js");
    const genannt = dokumentDateien(doc);
    expect(genannt.length).toBeGreaterThan(0);
    const weg = genannt.filter((d) => !existsSync(join(WURZEL, d)));
    if (weg.length) console.warn(`V4-Inventar: im Dokument genannt, aber nicht mehr vorhanden: ${weg.join(", ")}`);
  });

  it("--streng: Exit 1 bei Datei ohne Zuordnung oder verschwundener Dokumentdatei, sonst 0", () => {
    const inv = { eintraege: [{ datei: "src/ansichten/lagebild.jsx" }, { datei: "src/ansichten/neu-ohne.jsx" }] };
    const dok = "| ansichten/lagebild.jsx | x |\n| ansichten/weg.jsx | y |\n| App.jsx | z |";
    expect(dokumentDateien(dok)).toEqual(["src/ansichten/lagebild.jsx", "src/ansichten/weg.jsx", "src/App.jsx"]);
    const gibtEs = (d) => d !== "src/ansichten/weg.jsx";
    const b = strengeBefunde(inv, dok, gibtEs);
    expect(b).toEqual({ ohneZuordnung: ["src/ansichten/neu-ohne.jsx"], verschwundenImDokument: ["src/ansichten/weg.jsx"] });
    expect(strengerAusgang(b)).toBe(1);
    expect(strengerAusgang(strengeBefunde({ eintraege: [{ datei: "src/ansichten/lagebild.jsx" }] }, "| ansichten/lagebild.jsx | x |", () => true))).toBe(0);
    expect(strengerAusgang({ ohneZuordnung: [], verschwundenImDokument: ["src/x.jsx"] })).toBe(1);
  });

  it("keine Binärdateien als Bildbasis im Repository (Baseline liegt außerhalb)", () => {
    expect(doc).toMatch(/keine Binärdateien/i);
    expect(existsSync(join(WURZEL, "e2e/__screenshots__"))).toBe(false);
  });
});
