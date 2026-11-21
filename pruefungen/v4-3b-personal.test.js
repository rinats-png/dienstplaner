/* ==========================================================================
   V4-3b (zweiter Schnitt) — Hauptansicht Personal: Form- und Farbliterale auf Tokens

   Akzeptanz (docs/acc45/work-packages.json, V4-3b): Inline-borderRadius/boxShadow-Literale der Hauptansicht durch
   Tokens ersetzt; keine Änderung an Fachlogik, Rollen, Accessible Names oder Klassennamen.
   Nur das bestehende V4-System: Radiusstufen V4_RADIEN (src/v4/tokens.js) als var(--v4-r-…), Farben aus der
   Palette C (src/farben.js, aus den Tokens). Keine Neugestaltung. Zuordnung wie im Plan-Schnitt
   (pruefungen/v4-radiusstufen.mjs).

   Geprüft:
     - Messung (werkzeug/v4-inventar.mjs): Personal ohne Farbliterale, Form-Literale nur die begründete Ausnahme
       (Legendenquadrate der Verfügbarkeit: 15 px, Radius 5; die kleinste Stufe 8 px wäre >= halbe Kante und machte
       das Quadrat zum Kreis);
     - feste Tabelle je Datei: Stufe jeder Stelle (Review #440, Befund 1); die Regel prüft die Tabelle;
     - kein neuer Übergang (V4-2d): Anzahl `transition` je Datei wie vorher (Personalakte: 1, der Nachtbalken);
     - Personalakte: Palette statt rgba-Literal (Nachtbalken, Arbeitstage); Kontrast hell und dunkel nicht schlechter
       (1.4.11 Balken gegen Fläche; Schrift auf der Arbeitstag-Fläche >= 7:1; gewählt gegen frei nicht schwächer).

   Keine Uhr, kein Netz.
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inventar, jeHauptansicht, hauptansicht, ohneKommentare } from "../werkzeug/v4-inventar.mjs";
import { v4AlsAltePalette } from "../src/v4/tokens.js";
import { kontrastVon } from "../src/gestalt/lesbar.js";
import { regelStufe, stufenIn, ladeBasisFixture, abgleichMitFixture, gitGegenprobe } from "./v4-radiusstufen.mjs";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Personalakte } from "../src/ansichten/personalakte.jsx";
import { demobestand, istStunden } from "../src/lib/fachlogik.js";
import { aktionenStammdaten } from "../src/app/aktionen/stammdaten.js";
import { DOW, MON } from "../src/lib/datum.js";
import { n1 } from "../src/lib/format.js";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lies = (d) => readFileSync(path.join(WURZEL, d), "utf8").replace(/\r\n/g, "\n");

/** Begründete Ausnahme (kein passender Token): Legendenquadrate 15×15 px mit Radius 5 in der Verfügbarkeit. Sie
 *  bilden die gerundeten Rasterzellen (46 px hoch) ab; die kleinste Stufe (8 px) ist >= halbe Kante und machte sie
 *  zu Kreisen — das wäre Neugestaltung. Folgepaket V4-3d. */
const AUSNAHMEN = { "src/ansichten/verfuegbarkeit.jsx": 2 };

/** Feste Zuordnung je Stelle (Quelltextreihenfolge). alt = Radius vorher (px); kante = kleinere Kante, falls fest. */
const PERSONAL_ZUORDNUNG = {
  "src/ansichten/einarbeitung.jsx": [],
  "src/ansichten/kompetenzen.jsx": [],
  "src/ansichten/personal.jsx": [],
  "src/ansichten/verteilung.jsx": [],
  "src/ansichten/nachweise.jsx": [{ wo: "Leiste Breite 4", alt: 2, kante: 4, stufe: "pille" }],
  "src/ansichten/nachweispflege.jsx": [{ wo: "Hinweis abgelaufen", alt: 12, stufe: "mittel" }],
  "src/ansichten/personalakte.jsx": [
    { wo: "Nachtbalken oben links", alt: 5, stufe: "klein" }, { wo: "Nachtbalken oben rechts", alt: 5, stufe: "klein" },
    { wo: "Hinweis Schutzvorschriften", alt: 8, stufe: "klein" }],
  "src/ansichten/qualifikationsmatrix.jsx": [{ wo: "Punkt 9×9", alt: 5, kante: 9, stufe: "pille" }],
  "src/ansichten/selbstauskunft.jsx": [{ wo: "Begründungsfeld", alt: 6, stufe: "klein" }],
  "src/ansichten/verfuegbarkeit.jsx": [{ wo: "Rasterzelle 46 hoch", alt: 12, kante: 46, stufe: "mittel" },
    { wo: "Hinweis inaktiv", alt: 12, stufe: "mittel" }],
};

/** Übergänge je Datei vor V4-3b (Personal), wörtlich; dürfen sich nicht ändern (Review #442, B1: auch der Wert). */
const UEBERGAENGE = { "src/ansichten/personalakte.jsx": ['transition: "height .4s"'] };

/** Basis des Schnitts Personal (Review #442, B2: alt/kante gegen diesen Quelltext). */
const BASIS = "7d659b55";

describe("V4-3b Personal: Messung", () => {
  it("keine Datei ohne V4-Form, keine Farbliterale, Form-Literale nur die begründete Ausnahme", async () => {
    const inv = await inventar();
    const personal = jeHauptansicht(inv)["Personal"];
    expect(personal.ohneForm).toEqual([]);
    expect(personal.farbLiterale).toBe(0);
    expect(personal.formErreicht).toBe(personal.sichtbar);
    const mitLiteral = Object.fromEntries(inv.eintraege
      .filter((x) => hauptansicht(x) === "Personal" && x.formLiterale > 0).map((x) => [x.datei, x.formLiterale]));
    expect(mitLiteral).toEqual(AUSNAHMEN);
    expect(personal.voll).toBe(personal.sichtbar - Object.keys(AUSNAHMEN).length);
  }, 60000);

  it("feste Tabelle: jede Stelle trägt genau die Stufe der Zuordnungsregel (Review #440)", async () => {
    const inv = await inventar();
    const dateien = inv.eintraege.filter((e) => hauptansicht(e) === "Personal").map((e) => e.datei).sort();
    expect(Object.keys(PERSONAL_ZUORDNUNG).sort()).toEqual(dateien);
    for (const [datei, stellen] of Object.entries(PERSONAL_ZUORDNUNG)) {
      for (const s of stellen) expect(regelStufe(s.alt, s.kante), `${datei}: ${s.wo} (${s.alt})`).toBe(s.stufe);
      expect(stufenIn(lies(datei)), datei).toEqual(stellen.map((s) => s.stufe));
    }
    expect(Object.values(PERSONAL_ZUORDNUNG).flat()).toHaveLength(9);
  }, 60000);

  it("Ausnahme bleibt begründet: Legendenquadrat 15 px mit kleinster Stufe wäre ein Kreis", () => {
    expect(parseFloat("8px")).toBeGreaterThanOrEqual(15 / 2);
    const q = ohneKommentare(lies("src/ansichten/verfuegbarkeit.jsx"));
    expect(q.match(/width: 15, height: 15, borderRadius: 5\b/g)).toHaveLength(2);
  });

  it("kein neuer Übergang (V4-2d)", () => {
    for (const datei of Object.keys(PERSONAL_ZUORDNUNG)) {
      const q = ohneKommentare(lies(datei));
      const n = (q.match(/transition/gi) || []).length;
      expect(n, datei).toBe((UEBERGAENGE[datei] || []).length);
      /* B1: der Wert wörtlich; "height .4s, background .2s" wäre ein neuer Übergang bei gleicher Anzahl. */
      expect(q.match(/transition:\s*("[^"]*"|'[^']*'|`[^`]*`)/g) || [], datei).toEqual(UEBERGAENGE[datei] || []);
    }
  });

  /* Review #443 (B1): immer gegen die eingecheckte Fixture (auch im flachen CI-Checkout); git show nur als Gegenprobe. */
  it("Tabellenwerte alt/kante stimmen mit der Basis überein, ohne Git aus der Fixture (Review #442 B2, #443 B1)", () => {
    const fx = ladeBasisFixture(WURZEL);
    expect(fx.schnitte.Personal.basis.startsWith(BASIS)).toBe(true);
    expect(abgleichMitFixture(fx, "Personal", PERSONAL_ZUORDNUNG, lies)).toEqual([]);
  });

  it("Gegenprobe: Fixture gleich dem Basis-Quelltext (git show); ohne Git-Verlauf sichtbar übersprungen", (ctx) => {
    const g = gitGegenprobe(WURZEL, ladeBasisFixture(WURZEL), "Personal");
    if (g === null) return ctx.skip("kein Git-Verlauf: der Fixture-Abgleich oben hat geprüft");
    expect(g).toEqual([]);
  });
});

describe("V4-3b Personal: Farbe der Personalakte", () => {
  const q = () => ohneKommentare(lies("src/ansichten/personalakte.jsx"));
  /** Deckende Mischung von rgba(43,52,64,a) auf `grund` (Hex), wie vorher dargestellt. */
  const altMisch = (a, grund) => {
    const g = [1, 3, 5].map((i) => parseInt(grund.slice(i, i + 2), 16));
    return "#" + [43, 52, 64].map((c, i) => Math.round(c * a + g[i] * (1 - a)).toString(16).padStart(2, "0")).join("");
  };

  /* A11Y-1: Der Nachtbalken trägt seit A11Y-1 C.steuer (Rand von Bedienelementen, >= 3:1) statt C.lineStark. */
  it("keine rgba-Literale mehr; Nachtbalken C.steuer (A11Y-1), Arbeitstag C.lineSoft", () => {
    expect(q()).not.toMatch(/rgba?\(/);
    expect(q()).toMatch(/\?\s*C\.accent\s*:\s*C\.steuer/);
    expect(q()).toMatch(/background:\s*an\s*\?\s*C\.lineSoft\s*:\s*C\.bg/);
  });

  it("Nachtbalken: Kontrast gegen die Fläche hell und dunkel nicht schlechter als vorher (1.4.11)", () => {
    for (const thema of ["hell", "dunkel"]) {
      const p = v4AlsAltePalette(thema);
      const vorher = kontrastVon(altMisch(0.24, p.flaeche), p.flaeche);
      expect(kontrastVon(p.steuer, p.flaeche), thema).toBeGreaterThan(vorher);
      expect(kontrastVon(p.steuer, p.flaeche), `${thema}: nicht schlechter als V4-3b (lineStark)`)
        .toBeGreaterThan(kontrastVon(p.lineStark, p.flaeche));
      expect(kontrastVon(p.accent, p.steuer), `${thema}: aktueller Monat unterscheidbar`).toBeGreaterThan(1.5);
    }
  });

  it("Arbeitstag: Schrift auf der Fläche >= 7:1; gewählt und frei nicht schwerer zu unterscheiden als vorher", () => {
    for (const thema of ["hell", "dunkel"]) {
      const p = v4AlsAltePalette(thema);
      expect(kontrastVon(p.text, p.lineSoft), thema).toBeGreaterThanOrEqual(7);
      const vorher = kontrastVon(altMisch(0.12, p.flaeche), p.bg);
      expect(kontrastVon(p.lineSoft, p.bg), `${thema}: gewählt gegen frei`).toBeGreaterThanOrEqual(vorher);
    }
  });
});

/* ==========================================================================
   A11Y-1 (Review #442, Folgepunkt F1): Arbeitstag-Knöpfe und Nachtbalken der Personalakte

   Akzeptanz (docs/acc45/work-packages.json, A11Y-1):
     - jeder Arbeitstag-Knopf trägt aria-pressed mit dem Zustand gewählt/frei (WCAG 4.1.2);
     - gewählt und frei unterscheiden sich nicht nur über die Fläche: gewählt zeigt das Haken-Icon wie bei den
       Qualifikationen (1.4.1, 1.4.11); der Haken (currentColor = C.text) hat gegen die Fläche >= 3:1, hell und dunkel;
     - Nachtbalken >= 3:1 gegen die Fläche, hell und dunkel (1.4.11);
     - Accessible Name (Wochentag) und Fachlogik (akt.toggleWochentag) unverändert; kein neuer Übergang (oben).
   Gerendert wird die echte Personalakte (react-dom/server); umgeschaltet wird mit der echten Aktion
   (aktionenStammdaten.toggleWochentag), die der Knopf aufruft. Keine Uhr im Test, kein Netz.
   ========================================================================== */
describe("A11Y-1: Arbeitstage und Nachtbalken der Personalakte", () => {
  const HAKEN = 'd="m4.6 12.4 4.8 4.8L19.4 6.6"';
  const q = () => ohneKommentare(lies("src/ansichten/personalakte.jsx"));

  /** Bestand mit Leitung (staff.edit) und einer Person in Teilzeit „feste Wochentage“. */
  const aufbau = (wochentage) => {
    const m = structuredClone(demobestand().mandanten[0]);
    const leitung = m.personen.find((p) => p.rolle === "leitung");
    const ziel = m.personen.find((p) => p.rolle === "mitarbeiter" && !p.springer);
    ziel.teilzeit = { aktiv: true, modus: "wochentage", wochentage };
    return { m, leitung, ziel };
  };
  const rendern = (m, leitung, ziel) => renderToStaticMarkup(h(Personalakte, {
    sitz: { rolle: "kunde", mandant: m, person: leitung,
      db: { mandanten: [m], session: { mandantId: m.id, personId: leitung.id, rolle: "leitung" } } },
    personId: ziel.id, ym: "2026-11", onClose: () => {}, akt: new Proxy({}, { get: () => () => {} }) }));
  /** Die sieben Knöpfe unter „Arbeitstage“: Name (Text ohne Tags), aria-pressed, Haken. */
  const arbeitstage = (html) => {
    const ab = html.indexOf(">Arbeitstage<");
    expect(ab, "Abschnitt Arbeitstage gerendert").toBeGreaterThan(0);
    return [...html.slice(ab).matchAll(/<button([^>]*)>([\s\S]*?)<\/button>/g)].slice(0, 7).map(([, attr, inhalt]) => ({
      name: inhalt.replace(/<[^>]+>/g, "").trim(),
      gedrueckt: (attr.match(/aria-pressed="(true|false)"/) || [])[1] ?? null,
      haken: inhalt.includes(HAKEN),
    }));
  };

  it("aria-pressed je Zustand, Name = Wochentag, Haken nur bei gewählt (4.1.2, 1.4.1)", () => {
    const { m, leitung, ziel } = aufbau([0, 2, 4]);
    const k = arbeitstage(rendern(m, leitung, ziel));
    expect(k.map((x) => x.name)).toEqual([...DOW]);
    expect(k.map((x) => x.gedrueckt)).toEqual(["true", "false", "true", "false", "true", "false", "false"]);
    expect(k.map((x) => x.haken)).toEqual([true, false, true, false, true, false, false]);
  }, 60000);

  it("Umschalten mit der echten Aktion wechselt aria-pressed und Haken", () => {
    const st = aufbau([0, 2, 4]);
    const akt = aktionenStammdaten({ mUpd: (fn) => { st.m = fn(st.m); }, melde: () => {}, sitz: { person: st.leitung } });
    akt.toggleWochentag(st.ziel.id, 1);
    akt.toggleWochentag(st.ziel.id, 2);
    const ziel = st.m.personen.find((p) => p.id === st.ziel.id);
    const k = arbeitstage(rendern(st.m, st.leitung, ziel));
    expect(k.map((x) => x.gedrueckt)).toEqual(["true", "true", "false", "false", "true", "false", "false"]);
    expect(k.map((x) => x.haken)).toEqual([true, true, false, false, true, false, false]);
  }, 60000);

  it("Quelltext: Handler, Klasse und Mindestbreite unverändert; Haken wie bei Qualifikationen", () => {
    const t = q();
    expect(t).toMatch(/onClick=\{\(\) => akt\.toggleWochentag\(p\.id, i\)\} className="btn btn-sm"/);
    expect(t).toMatch(/aria-pressed=\{an\}/);
    expect(t).toMatch(/minWidth: 44/);
    expect(t.match(/\{an && <Icon n="haken" size=\{13\} strokeWidth=\{2\.4\} \/>\}/g)).toHaveLength(2);
  });

  it("Kontrast hell und dunkel: Haken gegen gewählte Fläche >= 3:1, Nachtbalken gegen Fläche >= 3:1 (1.4.11)", () => {
    const werte = {};
    for (const thema of ["hell", "dunkel"]) {
      const p = v4AlsAltePalette(thema);
      const haken = kontrastVon(p.text, p.lineSoft), balken = kontrastVon(p.steuer, p.flaeche);
      expect(haken, `${thema}: Haken`).toBeGreaterThanOrEqual(3);
      expect(balken, `${thema}: Nachtbalken`).toBeGreaterThanOrEqual(3);
      werte[thema] = { haken: Math.round(haken * 100) / 100, balken: Math.round(balken * 100) / 100 };
    }
    /* Festgeschrieben (Stand A11Y-1); vorher Nachtbalken 2,25 hell / 2,07 dunkel (C.lineStark). */
    expect(werte).toEqual({ hell: { haken: 10.61, balken: 4.14 }, dunkel: { haken: 10.79, balken: 4.41 } });
  });
});

/* ==========================================================================
   A11Y-2 (Review #445): Nachtbalken der Personalakte – aktueller Monat nicht nur über Farbe, Monatswerte als Text

   Akzeptanz (docs/acc45/work-packages.json, A11Y-2):
     - der aktuelle Monat (Monat der Ansicht, ym) ist ohne Farbe erkennbar: Monatsbuchstabe fett und unterstrichen
       (1.4.1); C.accent gegen C.steuer bleibt zulässig, ist aber nicht mehr das einzige Merkmal;
     - die zwölf Monatswerte sind für Vorlesesoftware erreichbar, nicht nur über title: Gruppe role="img" mit
       aria-label (Jahr, alle zwölf Monate mit Stunden, markierter Monat); die zwölf Spalten (Balken und Buchstabe)
       aria-hidden, damit nichts doppelt angesagt wird (1.3.1, 4.1.2);
     - Fachlogik (nm, maxN), Klassennamen, Übergang unverändert (V4-2d, oben); Kontrast Balken und Marker >= 3:1
       gegen die Fläche, hell und dunkel (1.4.11), festgeschrieben.
   Gerendert wird die echte Personalakte (react-dom/server). Erwartete Werte rechnet der Test unabhängig vom Markup
   über istStunden aus der Fachlogik. Keine Uhr im Test, kein Netz.
   ========================================================================== */
describe("A11Y-2: Nachtbalken der Personalakte", () => {
  const q = () => ohneKommentare(lies("src/ansichten/personalakte.jsx"));
  const aufbau = () => {
    const m = structuredClone(demobestand().mandanten[0]);
    const leitung = m.personen.find((p) => p.rolle === "leitung");
    const ziel = m.personen.find((p) => p.rolle === "mitarbeiter" && !p.springer);
    return { m, leitung, ziel };
  };
  const rendern = (m, leitung, ziel, ym) => renderToStaticMarkup(h(Personalakte, {
    sitz: { rolle: "kunde", mandant: m, person: leitung,
      db: { mandanten: [m], session: { mandantId: m.id, personId: leitung.id, rolle: "leitung" } } },
    personId: ziel.id, ym, onClose: () => {}, akt: new Proxy({}, { get: () => () => {} }) }));
  /** Abschnitt „Nachtarbeit im Jahresverlauf“ bis zur Überschrift „Qualifikationen“. */
  const abschnitt = (html) => {
    const ab = html.indexOf(">Nachtarbeit im Jahresverlauf<");
    expect(ab, "Abschnitt Nachtbalken gerendert").toBeGreaterThan(0);
    return html.slice(ab, html.indexOf(">Qualifikationen<", ab));
  };
  const entitaeten = (s) => s.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, "&");
  /** Erwarteter Text je Monat aus der Fachlogik (nicht aus dem Markup). */
  const erwartet = (m, ziel, jahr) => MON.map((name, i) => {
    const v = istStunden(m, ziel, `${jahr}-${String(i + 1).padStart(2, "0")}`).nacht;
    return `${name} ${v === null || v === undefined ? "keine Angabe" : `${n1(v)} Stunden`}`;
  });

  it("Gruppe role=img mit aria-label: Jahr, alle zwölf Monatswerte, markierter Monat (1.3.1, 4.1.2)", () => {
    const { m, leitung, ziel } = aufbau();
    const a = abschnitt(rendern(m, leitung, ziel, "2026-11"));
    const gruppen = [...a.matchAll(/<div[^>]*role="img"[^>]*>/g)];
    expect(gruppen, "genau eine Grafik mit Namen").toHaveLength(1);
    const label = entitaeten((gruppen[0][0].match(/aria-label="([^"]*)"/) || [])[1] || "");
    expect(label).toContain("2026");
    const monate = erwartet(m, ziel, 2026);
    for (const t of monate) expect(label, t).toContain(t);
    const pos = monate.map((t) => label.indexOf(t));
    expect([...pos].sort((x, y) => x - y), "Reihenfolge Januar … Dezember").toEqual(pos);
    expect(label).toMatch(/markiert: November/);
    /* mindestens ein Monat mit Nachtstunden, sonst prüfte der Test nur Nullen */
    expect(monate.some((t) => !/ 0 Stunden$/.test(t) && !/keine Angabe$/.test(t)), monate.join("; ")).toBe(true);
  }, 60000);

  it("keine doppelte Ansage: die zwölf Spalten (Balken und Buchstabe) sind aria-hidden", () => {
    const { m, leitung, ziel } = aufbau();
    const a = abschnitt(rendern(m, leitung, ziel, "2026-11"));
    const innen = a.slice(a.search(/role="img"/));
    expect([...innen.matchAll(/<div aria-hidden="true"/g)], "zwölf Spalten aria-hidden").toHaveLength(12);
  }, 60000);

  for (const [ym, idx] of [["2026-11", 10], ["2026-03", 2]]) {
    it(`aktueller Monat ${ym} ohne Farbe erkennbar: Buchstabe fett und unterstrichen, nur dieser (1.4.1)`, () => {
      const { m, leitung, ziel } = aufbau();
      const a = abschnitt(rendern(m, leitung, ziel, ym));
      const buchstaben = [...a.matchAll(/<div style="([^"]*font-size:10px[^"]*)">([^<]*)<\/div>/g)];
      expect(buchstaben.map((b) => b[2])).toEqual(MON.map((x) => x.slice(0, 1)));
      const merkmal = buchstaben.map((b) => /font-weight:700/.test(b[1]) && /text-decoration:underline/.test(b[1]));
      expect(merkmal).toEqual(MON.map((_, i) => i === idx));
    }, 60000);
  }

  it("Quelltext: Fachlogik nm/maxN und Balkenfarbe unverändert; Wert weiter im title (Maus)", () => {
    const t = q();
    expect(t).toMatch(/const nm = Array\.from\(\{ length: 12 \}, \(_, i\) => istStunden\(m, p, `\$\{jahr\}-\$\{pad\(i \+ 1\)\}`\)\.nacht\);/);
    expect(t).toMatch(/const maxN = Math\.max\(1, \.\.\.nm\);/);
    expect(t).toMatch(/\?\s*C\.accent\s*:\s*C\.steuer/);
    expect(t).toMatch(/title=\{`\$\{MON\[i\]\}: \$\{n1Ist\(v\)\} h`\}/);
  });

  it("Kontrast hell und dunkel: Balken und Marker >= 3:1 gegen die Fläche (1.4.11), festgeschrieben", () => {
    const werte = {};
    const r = (a, b) => Math.round(kontrastVon(a, b) * 100) / 100;
    for (const thema of ["hell", "dunkel"]) {
      const p = v4AlsAltePalette(thema);
      const w = { balken: r(p.steuer, p.flaeche), aktuell: r(p.accent, p.flaeche), marker: r(p.text, p.flaeche),
        buchstabe: r(p.dimmer, p.flaeche), aktuellGegenBalken: r(p.accent, p.steuer) };
      for (const k of ["balken", "aktuell", "marker", "buchstabe"]) expect(w[k], `${thema}: ${k}`).toBeGreaterThanOrEqual(3);
      werte[thema] = w;
    }
    /* aktuellGegenBalken bleibt unter 3:1 (1,78/2,50); deshalb das Merkmal ohne Farbe (Buchstabe fett, unterstrichen). */
    expect(werte).toEqual({
      hell: { balken: 4.14, aktuell: 7.36, marker: 14.74, buchstabe: 7.55, aktuellGegenBalken: 1.78 },
      dunkel: { balken: 4.41, aktuell: 11.03, marker: 12.98, buchstabe: 8.71, aktuellGegenBalken: 2.5 },
    });
  });

  it("Quelltext: Marker des Buchstabens nutzt C.text (Kontrast oben), keine neue Farbe", () => {
    expect(q()).toMatch(/color:\s*i === mAkt \? C\.text : C\.dimmer/);
  });
});
