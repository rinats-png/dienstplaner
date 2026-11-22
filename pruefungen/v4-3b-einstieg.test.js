/* ==========================================================================
   V4-3b (neunter Schnitt) — Hauptansicht Einstieg: Form-Literale auf Radiusstufen, Farbliterale auf Tokens

   Akzeptanz (docs/acc45/work-packages.json, V4-3b): Inline-borderRadius/boxShadow-Literale der Hauptansicht durch
   Tokens ersetzt; keine Änderung an Fachlogik, Rollen, Accessible Names oder Klassennamen.
   Nur das bestehende V4-System: Radiusstufen V4_RADIEN (src/v4/tokens.js) als var(--v4-r-…), Farben nur auf
   bestehende Tokens. Keine Neugestaltung.
   Zuordnung wie Plan bis Telefonschale (pruefungen/v4-radiusstufen.mjs): gleicher Wert → gleiche Stufe, sonst die
   nächste (Gleichstand: die größere), pille nur bei Radius >= halbe kleinere Kante.

   Die Hauptansicht umfasst laut Inventar (HAUPTANSICHT_DATEIEN.Einstieg) neun Dateien: main.jsx (Startseite,
   Anmeldung mit Code, Registrierung „Selbst starten“, Preise), betreiber-2fa.jsx (zweiter Faktor), verlustweg.jsx
   (Geräteverlust), rechtstexte.jsx (Rechtsfenster), marke.jsx, startbild.jsx, anmeldung.jsx (Rollenwahl im
   Demo-Betrieb), mailbestaetigung.jsx, ladefehler.jsx.

   Anmeldung und Registrierung sind sicherheitsrelevant. Beleg „nichts außer Radius und Farbe“: Rückrechnung je Datei —
   der heutige Quelltext, mit den alten Werten aus den festen Tabellen zurückgesetzt, ergibt byte-gleich den
   Basis-Quelltext (SHA-256 aus der Fixture, ohne Git). Damit sind Formularfelder, Attribute (id, name, type,
   autoComplete, aria-*), Texte, Klassen, Reihenfolge, Fokus und Validierung nachweislich unverändert.

   Keine Uhr im Prüfwert, kein Netz.
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { inventar, jeHauptansicht, hauptansicht, ohneKommentare, HAUPTANSICHT_DATEIEN } from "../werkzeug/v4-inventar.mjs";
import { RechtFenster } from "../src/rechtstexte.jsx";
import { kontrastVon } from "../src/gestalt/lesbar.js";
import { v4AlsAltePalette, V4_UEBERLAGERUNG, V4_SCHATTEN } from "../src/v4/tokens.js";
import { regelStufe, stufenIn, ladeBasisFixture, abgleichMitFixture, gitGegenprobe, sha256 } from "./v4-radiusstufen.mjs";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lies = (d) => readFileSync(path.join(WURZEL, d), "utf8").replace(/\r\n/g, "\n");

/** Basis des Schnitts (origin/integration/release-v4 mit V4-3b Plan bis Telefonschale, #459). */
const BASIS = "b9ab081a";
const SCHNITT = "Einstieg";
const MAIN = "src/main.jsx";
const ZF = "src/betreiber-2fa.jsx";
const VERLUST = "src/verlustweg.jsx";
const RECHT = "src/rechtstexte.jsx";
const ANMELDUNG = "src/ansichten/anmeldung.jsx";
const MARKE = "src/marke.jsx";
const STARTBILD = "src/startbild.jsx";

/** Feste Zuordnung je Stelle (Quelltextreihenfolge). alt = Radius vorher (px); kante = kleinere Kante, falls fest. */
const EINSTIEG_ZUORDNUNG = {
  [MAIN]: [
    { wo: "KARTE (Karte des Einstiegs)", alt: 18, stufe: "gross" },
    { wo: "Preise: Rechner", alt: 16, stufe: "gross" },
    { wo: "Preise: Feld Personen je Standort", alt: 8, stufe: "klein" },
    { wo: "Preise: Standort hinzufügen", alt: 8, stufe: "klein" },
    { wo: "Preise: Paketzeile", alt: 10, stufe: "mittel" },
    { wo: "Preise: Stufenkarte", alt: 16, stufe: "gross" },
    { wo: "Preise: Standortzuschlag", alt: 14, stufe: "mittel" },
    { wo: "Preise: Standortband", alt: 11, stufe: "mittel" },
    { wo: "Preise: Betrieb anlegen und testen", alt: 999, stufe: "pille" },
    { wo: "Registrierung fertig: Erfolgskasten", alt: 14, stufe: "mittel" },
    { wo: "Registrierung fertig: Zugangscode", alt: 8, stufe: "klein" },
    { wo: "Registrierung fertig: Als Datei sichern", alt: 999, stufe: "pille" },
    { wo: "Registrierung fertig: Mit der Organisationsleitung anmelden", alt: 999, stufe: "pille" },
    { wo: "Registrierung: Feld Betriebsname", alt: 12, stufe: "mittel" },
    { wo: "Registrierung: Branche", alt: 11, stufe: "mittel" },
    { wo: "Registrierung: Rollen", alt: 10, stufe: "mittel" },
    { wo: "Registrierung: Feld E-Mail", alt: 12, stufe: "mittel" },
    { wo: "Registrierung: Fehlermeldung", alt: 10, stufe: "mittel" },
    { wo: "Registrierung: Betrieb anlegen", alt: 999, stufe: "pille" },
    { wo: "Start: Selbst starten", alt: 999, stufe: "pille" },
    { wo: "Start: Testzugang", alt: 18, stufe: "gross" },
    { wo: "Start: Rollenkürzel 40×40", alt: 12, kante: 40, stufe: "mittel" },
    { wo: "Anmeldung: Feld Zugangscode", alt: 12, stufe: "mittel" },
    { wo: "Anmeldung: Anmelden", alt: 999, stufe: "pille" },
  ],
  [ZF]: [
    { wo: "ZCard (Karte zweiter Faktor)", alt: 14, stufe: "mittel" },
    { wo: "ZInp (Feld)", alt: 10, stufe: "mittel" },
    { wo: "ZBtn (Knopf)", alt: 999, stufe: "pille" },
    { wo: "ZweifaktorFeld: Feld Code", alt: 12, stufe: "mittel" },
  ],
  [VERLUST]: [
    { wo: "KASTEN (Verlustweg)", alt: 10, stufe: "mittel" },
    { wo: "TAST (Knopf, Höhe ab 36)", alt: 999, stufe: "pille" },
  ],
  [RECHT]: [
    { wo: "Tabelle (Rahmen)", alt: 10, stufe: "mittel" },
    { wo: "Vorformatierter Block", alt: 10, stufe: "mittel" },
    { wo: "Rechtsfenster: Schließen", alt: 8, stufe: "klein" },
  ],
  [ANMELDUNG]: [
    { wo: "Hinweis Demo: Ecke oben rechts (0 8px 8px 0)", alt: 8, stufe: "klein" },
    { wo: "Hinweis Demo: Ecke unten rechts (0 8px 8px 0)", alt: 8, stufe: "klein" },
    { wo: "Betreiberkonsole: Kürzel 46×46", alt: 14, kante: 46, stufe: "mittel" },
    { wo: "Rollenwahl: Kürzel 30×30", alt: 10, kante: 30, stufe: "mittel" },
  ],
};

/** Farbliterale: wörtlich vorher/nachher (je genau einmal). Messung unten (kontrastVon, v4AlsAltePalette). */
const FARB_ZUORDNUNG = [
  { datei: RECHT, wo: "Rechtsfenster: Überlagerung (Rückfall ohne --c-ueberlagerung, Einstieg)",
    vorher: 'background: "var(--c-ueberlagerung, rgba(7,19,23,.36))"',
    nachher: 'background: "var(--c-ueberlagerung, var(--v4-ueberlagerung))"' },
  { datei: RECHT, wo: "Rechtsfenster: Schatten (Rückfall ohne --schatten-blatt, Einstieg)",
    vorher: 'boxShadow: "var(--schatten-blatt, 0 20px 48px rgba(7,19,23,.18))"',
    nachher: 'boxShadow: "var(--schatten-blatt, var(--v4-schatten-blatt))"' },
  { datei: ANMELDUNG, wo: "Rollenwahl: Karte im Hover (E3)",
    vorher: 'e.currentTarget.style.boxShadow = "0 10px 26px rgba(16,16,24,.12)";',
    nachher: 'e.currentTarget.style.boxShadow = "var(--schatten-hoch)";' },
];

/** Begründete Ausnahmen (bleiben Literal; V4-3d). */
const AUSNAHMEN = [
  { datei: MAIN, art: "form", stelle: "{{ height: 15, borderRadius: 6, background: C.bg, marginBottom: 12,",
    grund: "Ladeplatzhalter 15 px hoch: klein (8) >= halbe Höhe 7,5 machte den Balken zur Kapsel" },
  { datei: RECHT, art: "form", stelle: 'background: C.flaecheStill, padding: "1px 5px", borderRadius: 4 }}',
    grund: "Code-Auszeichnung im Fließtext, Höhe aus der Schrift (Browser: 17 px): klein (8) läge bei 94 % der halben "
      + "Höhe, die Marke würde fast zur Kapsel (wie die Normmarke in pruefung.jsx, Schnitt 4)" },
  { datei: MARKE, art: "farbe", stelle: 'const MARKENFARBE = { grund: "#10222A", c: "#FFFFFF", punkt: "#0B7C7C" };',
    grund: "Bildmarke mit festen Markenfarben, folgt nicht dem Farbschema; zugleich Canvas-Quelle der Startsequenz" },
  { datei: STARTBILD, art: "farbe", stelle: "ctx.fillStyle = `rgb(${p.r},${p.g},${p.b})`;",
    grund: "kein Farbliteral: zur Laufzeit abgetastete Pixelfarbe der Bildmarke (Canvas)" },
];

/** Feld- und ARIA-Attribute in Quelltextreihenfolge (Name=Wert). */
const RE_ATTRIBUT = /\b(id|htmlFor|type|name|autoComplete|autoFocus|autoCapitalize|inputMode|role|aria-[a-z]+|placeholder|disabled|required|pattern|maxLength|minLength|tabIndex|onSubmit|onKeyDown)=(\{[^}]*\}|"[^"]*")/g;
const attributeIn = (text) => [...text.matchAll(RE_ATTRIBUT)].map((m) => `${m[1]}=${m[2]}`);
/** Basis b9ab081a (git show, LF): Anzahl und SHA-256 der Attributliste je sicherheitsrelevanter Datei. */
const ATTRIBUTE_BASIS = {
  [MAIN]: [39, "35dafb58599dca7109602bc23e780c0f3c7b0bde5fb2f5443fbda1117fb9c24e"],
  [ZF]: [9, "160120425a451d265dcf1d316e5daf5414327b96a66652497e35313923a16802"],
  [VERLUST]: [50, "0379880bc936563cb43690c2ee6b442e41466e717630268878ebf7b3d8db0931"],
  [ANMELDUNG]: [1, "1bef8392e6dae3a3727c6548c17c852965d385dd2a019294291344e070c54cb2"],
};

/** Basis b9ab081a: Anzahl „transition“ je Datei (ohne Kommentare). */
const UEBERGAENGE = { [MAIN]: 2, [ANMELDUNG]: 1 };

/** Heutiger Quelltext einer Datei mit den alten Werten der Tabellen zurückgesetzt. Der Hinweis der Rollenwahl
 *  (anmeldung.jsx, vorher "0 8px 8px 0") trägt die Stufe in den zwei Langformen der rechten Ecken: Die Kurzform
 *  "0 var(…) var(…) 0" begänne nicht mit var( und zählte im Inventar weiter als Literal (RE_FORM_LITERAL). */
const RE_STUFE = /borderTopRightRadius: "var\(--v4-r-([a-z]+)\)", borderBottomRightRadius: "var\(--v4-r-([a-z]+)\)"|borderRadius: "([^"]*var\(--v4-r-[a-z]+\)[^"]*)"/g;
function rueckgerechnet(datei, tabelle = EINSTIEG_ZUORDNUNG, farben = FARB_ZUORDNUNG) {
  const stellen = tabelle[datei] || [];
  let i = 0;
  let text = lies(datei).replace(RE_STUFE, (m, oben, unten, inhalt) => {
    if (oben) {
      const a = stellen[i++], b = stellen[i++];
      return a && b && a.stufe === oben && b.stufe === unten ? `borderRadius: "0 ${a.alt}px ${b.alt}px 0"` : m;
    }
    const teile = inhalt.split(" ").map((t) => {
      const s = /^var\(--v4-r-([a-z]+)\)$/.exec(t);
      if (!s) return t;
      const st = stellen[i++];
      return st && st.stufe === s[1] ? `${st.alt}px` : t;   // Fehler fällt über die Prüfsumme auf
    });
    return teile.length === 1 ? `borderRadius: ${parseFloat(teile[0])}` : `borderRadius: "${teile.join(" ")}"`;
  });
  for (const f of farben.filter((x) => x.datei === datei)) text = text.split(f.nachher).join(f.vorher);
  return { text, ersetzt: i };
}

/* Farbmessung: deckende Mischung eines rgba-Werts über einer Fläche (#rrggbb). */
const mische = (rgba, grund) => {
  const m = /rgba\((\d+),(\d+),(\d+),([\d.]+)\)/.exec(rgba);
  const a = Number(m[4]);
  const g = [1, 3, 5].map((k) => parseInt(grund.slice(k, k + 2), 16));
  return `#${[m[1], m[2], m[3]].map((v, k) => Math.round(Number(v) * a + g[k] * (1 - a)).toString(16).padStart(2, "0")).join("")}`;
};
/** Kräftigste Schicht eines Schattens (höchste Deckkraft). */
const kraeftigste = (schatten) => [...schatten.matchAll(/rgba\([^)]*\)/g)].map((x) => x[0])
  .sort((a, b) => parseFloat(b.split(",")[3]) - parseFloat(a.split(",")[3]))[0];
/** Kante der Fläche gegen die Überlagerung bzw. den Schatten über dem Seitengrund. */
const kanteGegen = (thema, rgba) => { const C = v4AlsAltePalette(thema); return kontrastVon(C.flaeche, mische(rgba, C.bg)); };

describe("V4-3b Einstieg: Messung", () => {
  it("Form-Literale 38 → 2, Farbliterale 7 → 4; Form 7/9, „voll V4“ 5/9; Inline-Stile und Dialogstellen unverändert", async () => {
    const inv = await inventar();
    const e = jeHauptansicht(inv)[SCHNITT];
    expect(e.dateien).toBe(9);
    expect(e.sichtbar).toBe(9);
    expect(e.formLiterale).toBe(2);
    expect(e.farbLiterale).toBe(4);
    expect(e.formErreicht).toBe(7);
    expect(e.ohneForm).toEqual([MARKE, STARTBILD]);
    expect(e.farbrein).toBe(7);
    /* „voll V4“ = Form und Farbe ohne Literale; Inline-Stile zählen nicht (separat: 289, V4-3d). */
    expect(e.voll).toBe(5);
    expect(e.inlineStil).toBe(289);
    expect(e.dialog).toBe(5);
    expect(inv.eintraege.filter((x) => hauptansicht(x) === SCHNITT).map((x) => x.datei).sort())
      .toEqual([...HAUPTANSICHT_DATEIEN.Einstieg].sort());
    /* Je Datei: übrig nur die begründeten Ausnahmen. */
    const je = Object.fromEntries(inv.eintraege.filter((x) => hauptansicht(x) === SCHNITT).map((x) => [x.datei, x]));
    expect(je[MAIN].formLiterale).toBe(1);
    expect(je[RECHT].formLiterale).toBe(1);
    expect(je[RECHT].rgb + je[RECHT].hex).toBe(0);
    expect(je[ANMELDUNG].rgb + je[ANMELDUNG].hex + je[ANMELDUNG].formLiterale).toBe(0);
    expect(je[MARKE].hex).toBe(3);
    expect(je[STARTBILD].rgb).toBe(1);
    for (const d of [ZF, VERLUST]) expect(je[d].formLiterale, d).toBe(0);
  }, 60000);

  it("feste Tabelle: jede Stelle trägt genau die Stufe der Zuordnungsregel; Dateien der Tabelle in der Zeile", async () => {
    const inv = await inventar();
    const dateien = inv.eintraege.filter((x) => hauptansicht(x) === SCHNITT).map((x) => x.datei);
    for (const [datei, stellen] of Object.entries(EINSTIEG_ZUORDNUNG)) {
      expect(dateien, datei).toContain(datei);
      for (const s of stellen) expect(regelStufe(s.alt, s.kante), `${datei}: ${s.wo} (${s.alt})`).toBe(s.stufe);
      expect(stufenIn(lies(datei)), datei).toEqual(stellen.map((s) => s.stufe));
    }
    expect(Object.values(EINSTIEG_ZUORDNUNG).flat()).toHaveLength(37);
    /* Dateien ohne Tabelle tragen keine Radiusstufe. */
    for (const d of dateien.filter((x) => !EINSTIEG_ZUORDNUNG[x])) expect(stufenIn(lies(d)), d).toEqual([]);
  }, 60000);

  it("Tabellenwerte alt/kante stimmen mit der Basis überein, ohne Git aus der Fixture", () => {
    const fx = ladeBasisFixture(WURZEL);
    expect(fx.schnitte[SCHNITT].basis.startsWith(BASIS)).toBe(true);
    expect(Object.keys(fx.schnitte[SCHNITT].dateien).sort()).toEqual([...HAUPTANSICHT_DATEIEN.Einstieg].sort());
    expect(abgleichMitFixture(fx, SCHNITT, EINSTIEG_ZUORDNUNG, lies)).toEqual([]);
  });

  it("Gegenprobe: Fixture gleich dem Basis-Quelltext (git show); ohne Git-Verlauf übersprungen", (ctx) => {
    const fx = ladeBasisFixture(WURZEL);
    const g = gitGegenprobe(WURZEL, fx, SCHNITT);
    if (g === null) return ctx.skip("kein Git-Verlauf: der Fixture-Abgleich oben hat geprüft");
    expect(g).toEqual([]);
  });

  it("Rückrechnung: nur Radius- und Farbwerte geändert, sonst byte-gleich zur Basis (alle neun Dateien, ohne Git)", () => {
    const fx = ladeBasisFixture(WURZEL).schnitte[SCHNITT];
    for (const d of HAUPTANSICHT_DATEIEN.Einstieg) {
      const r = rueckgerechnet(d);
      expect(r.ersetzt, `Anzahl Stufen in ${d}`).toBe((EINSTIEG_ZUORDNUNG[d] || []).length);
      expect(sha256(r.text), `${d} zurückgerechnet = Basis`).toBe(fx.dateien[d].sha256);
    }
    for (const f of FARB_ZUORDNUNG) expect(lies(f.datei).split(f.nachher), f.wo).toHaveLength(2);
  });

  it("Anmeldung, Registrierung, zweiter Faktor, Verlustweg: Feld- und ARIA-Attribute in Reihenfolge wie auf der Basis", () => {
    /* Unabhängig von der Rückrechnung: Prüfsumme der Attributliste (id, htmlFor, type, name, autoComplete, autoFocus,
       autoCapitalize, inputMode, role, aria-*, placeholder, disabled, required, pattern, maxLength, minLength,
       tabIndex, onSubmit, onKeyDown), auf der Basis b9ab081a mit git show gemessen und hier fest eingetragen. */
    for (const [d, [n, summe]] of Object.entries(ATTRIBUTE_BASIS)) {
      const a = attributeIn(lies(d));
      expect(a, d).toHaveLength(n);
      expect(sha256(JSON.stringify(a)), `${d}: Attribute gleich der Basis`).toBe(summe);
    }
  });

  it("Mutation der Tabelle (alt, kante, Stufe, Farbe) fällt ohne Git auf; Kreise und Ausnahmen bleiben", () => {
    const fx = ladeBasisFixture(WURZEL);
    const mit = (datei, i, x) => ({ ...EINSTIEG_ZUORDNUNG, [datei]: EINSTIEG_ZUORDNUNG[datei].map((s, j) => (j === i ? { ...s, ...x } : s)) });
    expect(abgleichMitFixture(fx, SCHNITT, mit(MAIN, 6, { alt: 12 }), lies))
      .toEqual([`${MAIN}: Preise: Standortzuschlag: Basis 14, Tabelle alt 12`]);
    expect(abgleichMitFixture(fx, SCHNITT, mit(ANMELDUNG, 2, { kante: 48 }), lies))
      .toEqual([`${ANMELDUNG}: Betreiberkonsole: Kürzel 46×46: kante 48 nicht im Stilobjekt der Basis`]);
    expect(abgleichMitFixture(fx, SCHNITT, { ...EINSTIEG_ZUORDNUNG, [ZF]: EINSTIEG_ZUORDNUNG[ZF].slice(1) }, lies)[0])
      .toBe(`${ZF}: Anzahl: Basis 4, Tabelle 3`);
    /* Eine falsche Stufe in der Tabelle ergibt nicht die Basis. */
    const falsch = mit(VERLUST, 0, { stufe: "klein" });
    expect(sha256(rueckgerechnet(VERLUST, falsch).text)).not.toBe(fx.schnitte[SCHNITT].dateien[VERLUST].sha256);
    /* Eine falsche alte Farbe ergibt nicht die Basis. */
    const farbeFalsch = FARB_ZUORDNUNG.map((f, i) => (i === 0 ? { ...f, vorher: f.vorher.replace(".36", ".40") } : f));
    expect(sha256(rueckgerechnet(RECHT, EINSTIEG_ZUORDNUNG, farbeFalsch).text)).not.toBe(fx.schnitte[SCHNITT].dateien[RECHT].sha256);
    /* Regel: 14 → mittel, 11/10 → mittel (Gleichstand 8/12 → größere), 16 → gross; Ausnahmen wären Kapseln. */
    expect(regelStufe(14, 46)).toBe("mittel");
    expect(regelStufe(10, 30)).toBe("mittel");
    expect(regelStufe(10)).toBe("mittel");
    expect(regelStufe(16)).toBe("gross");
    expect(regelStufe(6, 15)).toBe("klein");
    expect(parseFloat("8px") >= 15 / 2).toBe(true);
  });

  it("begründete Ausnahmen stehen unverändert im Quelltext (Form 2, Farbe 4)", () => {
    for (const a of AUSNAHMEN) {
      expect(ohneKommentare(lies(a.datei)).split(a.stelle), `${a.datei}: ${a.grund}`).toHaveLength(2);
      expect(a.grund.length).toBeGreaterThan(30);
    }
    expect(AUSNAHMEN.filter((a) => a.art === "form")).toHaveLength(2);
    const farbe = AUSNAHMEN.filter((a) => a.art === "farbe")
      .reduce((n, a) => n + (a.stelle.match(/rgba?\(|#[0-9a-fA-F]{3,8}\b/g) || []).length, 0);
    expect(farbe).toBe(4);
  });

  it("kein neuer Übergang (V4-2d): Anzahl „transition“ je Datei wie auf der Basis", () => {
    for (const d of HAUPTANSICHT_DATEIEN.Einstieg) {
      expect((ohneKommentare(lies(d)).match(/transition/g) || []).length, d).toBe(UEBERGAENGE[d] || 0);
    }
  });
});

describe("V4-3b Einstieg: Farbe (Kontrast hell und dunkel nicht schlechter)", () => {
  it("Überlagerung des Rechtsfensters: V4_UEBERLAGERUNG hebt die Kante der Fensterfläche hell und dunkel", () => {
    for (const [thema, vorher, nachher] of [["hell", 2.572, 2.734], ["dunkel", 1.268, 1.403]]) {
      expect(kanteGegen(thema, "rgba(7,19,23,.36)"), `${thema} vorher`).toBeCloseTo(vorher, 3);
      expect(kanteGegen(thema, V4_UEBERLAGERUNG[thema]), `${thema} nachher`).toBeCloseTo(nachher, 3);
      expect(nachher).toBeGreaterThan(vorher);
    }
  });

  it("Schatten des Rechtsfensters (E5) und Hover der Rollenwahl (E3): kräftigste Schicht hell und dunkel nicht schwächer", () => {
    const faelle = [
      ["blatt", "rgba(7,19,23,.18)", { hell: [1.631, 1.688], dunkel: [1.247, 1.396] }],
      ["hoch", "rgba(16,16,24,.12)", { hell: [1.426, 1.477], dunkel: [1.244, 1.323] }],
    ];
    for (const [ebene, alt, werte] of faelle) {
      for (const thema of ["hell", "dunkel"]) {
        const [vorher, nachher] = werte[thema];
        expect(kanteGegen(thema, alt), `${ebene} ${thema} vorher`).toBeCloseTo(vorher, 3);
        expect(kanteGegen(thema, kraeftigste(V4_SCHATTEN[thema][ebene])), `${ebene} ${thema} nachher`).toBeCloseTo(nachher, 3);
        expect(nachher).toBeGreaterThanOrEqual(vorher);
      }
    }
  });

  it("Farbliterale: rechtstexte.jsx und anmeldung.jsx ohne rgba(…); nur die Ausnahmen bleiben", () => {
    for (const d of [RECHT, ANMELDUNG]) expect(ohneKommentare(lies(d)).match(/rgba?\([^)]*\)|#[0-9a-fA-F]{3,8}\b/g) || [], d).toEqual([]);
    for (const f of FARB_ZUORDNUNG) expect(lies(f.datei), f.wo).toContain(f.nachher);
  });
});

describe("V4-3b Einstieg: Darstellung", () => {
  it("Rechtsfenster: Rolle, Name und Schließen unverändert; Überlagerung und Schatten aus V4-Tokens; Schließen klein", () => {
    const x = renderToStaticMarkup(h(RechtFenster, { start: "impressum", onClose() {} }));
    expect(x).toContain('role="dialog" aria-modal="true" aria-label="Rechtliche Angaben"');
    expect(x).toContain("background:var(--c-ueberlagerung, var(--v4-ueberlagerung))");
    expect(x).toContain("box-shadow:var(--schatten-blatt, var(--v4-schatten-blatt))");
    expect(x).toMatch(/aria-label="Schließen" style="[^"]*border-radius:var\(--v4-r-klein\)/);
    expect(x).not.toMatch(/rgba\(/);
  });

  it("Quelltext: Kürzel und Knöpfe tragen die Stufe im selben Stilobjekt wie vorher", () => {
    const q = ohneKommentare(lies(MAIN));
    expect(q).toContain('<span style={{ width: 40, height: 40, borderRadius: "var(--v4-r-mittel)", flexShrink: 0,');
    expect(q).toContain('const KARTE = { background: "var(--v4-flaeche)", border: "1px solid var(--v4-line)", borderRadius: "var(--v4-r-gross)",');
    expect(q).toContain('style={{ width: "100%", padding: "13px 15px", fontSize: 17, borderRadius: "var(--v4-r-mittel)",');
    const a = ohneKommentare(lies(ANMELDUNG));
    expect(a).toContain('borderLeft: `3px solid ${C.warn}`,\n            borderTopRightRadius: "var(--v4-r-klein)", borderBottomRightRadius: "var(--v4-r-klein)" }}');
    expect(a).toContain('{{ width: 46, height: 46, borderRadius: "var(--v4-r-mittel)", background: C.accent,');
    expect(a).toContain('{{ width: 30, height: 30, borderRadius: "var(--v4-r-mittel)", background: `${r.farbe}1E`,');
    expect(ohneKommentare(lies(VERLUST))).toContain('const TAST = { padding: "8px 14px", minHeight: 36, fontSize: 14, fontWeight: 600, borderRadius: "var(--v4-r-pille)",');
  });
});
