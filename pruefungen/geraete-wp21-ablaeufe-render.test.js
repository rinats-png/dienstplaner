/* WP-21 Teil 3: Bedienablaeufe auf kleinen Bildschirmen, Nachweis ohne Browser.
   Geprueft wird, was ohne Layout-Engine belegbar ist: die echten Komponenten werden gerendert (react-dom/server) und die echten
   Stilregeln der Anwendung (bauStyles) fuer jede Viewportbreite ausgewertet (max-width/min-width). Layout, Antippen und
   Vorlesesoftware bleiben der Messung im Browser (pruefungen/browser/geraete-wp21-ablaeufe.mjs) und echten Geraeten vorbehalten.
   Je Ablauf und Viewport (alle acht Pruefviewports aus src/ui/geraete.js: 360x740, 390x844, 430x932, 768x1024, 1024x768 und quer 740x360, 844x390, 932x430):
     - die Hauptaktion ist im Dokument und nicht deaktiviert,
     - Zielgroessen aus den Stilregeln: mindestens ZIEL_MINDEST (24 px); Stempelflaeche der Telefonansicht 56 px (ueber 44 px),
     - kein Signal fuer Querscroll der Seite (Umbruch aktiv, Seitenleiste ausserhalb, Blatt hoechstens Viewport, keine feste
       Breite im gerenderten Ablauf ueber dem Viewport),
     - Rollenregeln: Plan freigeben nur Leitung und Planung (RB-1/RB-3); Krankmeldung endgueltig nur Planung und Leitung,
       Schichtverantwortung und Beschaeftigte vorlaeufig (RB-2); Klaerungsmarker nur Planung, Leitung, zustaendige
       Schichtverantwortung (RB-5).
   Aufruf: npm run pruefung:geraete-ablaeufe-render */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { GERAETE_VIEWPORTS, GERAETE_VIEWPORTS_QUER, UMBRUCH, ZIEL_MINDEST, TELEFON_ANSICHTEN, TELEFON_ANSICHTEN_BETREIBER } from "../src/ui/geraete.js";
import { berlinZeitpunkt, tagePlus } from "../server/lib/zeiterfassung.mjs";
import { bestandFuerRolle, bestandFuerAntwort } from "../server/lib/rechte.mjs";
import { migriere } from "../src/migration.js";
import { personenAngleichen } from "../server/lib/gestalt.mjs";
import { Freigabeleiste } from "../src/ansichten/freigabeleiste.jsx";
import { Krankmeldung } from "../src/ansichten/krankmeldung.jsx";
import { KrankmeldungenOffen, klaerungFuer } from "../src/ansichten/krankmeldungen-offen.jsx";
import { Schichtuebergabe } from "../src/ansichten/schichtuebergabe.jsx";
import { Tagesdetail } from "../src/ansichten/tagesdetail.jsx";
import { KLAERUNG_HINWEIS } from "../server/lib/klaerung.mjs";
import { KRANK_STATUS } from "../server/lib/krankmeldung.mjs";

const HEUTE = "2026-11-04", MONAT = "2026-11";
let A;
beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(berlinZeitpunkt(HEUTE, "11:00")));
  A = await import("../src/App.jsx");
}, 120000);
afterAll(() => { vi.useRealTimers(); });

/* Alle acht Pruefviewports der Geraetematrix (WP-21 Teil 4: vorher nur vier). */
const VIEWPORTS = [...GERAETE_VIEWPORTS, ...GERAETE_VIEWPORTS_QUER];

/* ---------- Stilregeln je Viewport auswerten ---------- */
function bloecke(css) {
  const aus = []; let i = 0;
  while (i < css.length) {
    const auf = css.indexOf("{", i); if (auf < 0) break;
    const kopf = css.slice(i, auf).replace(/\/\*[\s\S]*?\*\//g, "").trim();
    let tiefe = 1, j = auf + 1;
    while (j < css.length && tiefe) { if (css[j] === "{") tiefe++; else if (css[j] === "}") tiefe--; j++; }
    aus.push({ kopf, inhalt: css.slice(auf + 1, j - 1) }); i = j;
  }
  return aus;
}
function regelnFuer(css, breite) {
  const regeln = [];
  const sammle = (text) => {
    for (const b of bloecke(text)) {
      if (!b.kopf.startsWith("@")) { for (const sel of b.kopf.split(",")) regeln.push({ sel: sel.trim(), dekl: b.inhalt }); continue; }
      const mq = /^@media\s*\(\s*(max|min)-width:\s*(\d+)px\s*\)$/.exec(b.kopf);
      if (!mq) continue;                                   /* print, prefers-*: gelten hier nicht */
      if (mq[1] === "max" ? breite <= +mq[2] : breite >= +mq[2]) sammle(b.inhalt);
    }
  };
  sammle(css);
  return regeln;
}
/** Letzter Wert der Eigenschaft fuer genau diesen Selektor (spaetere Regeln gewinnen; !important gewinnt). */
function wert(regeln, sel, eig) {
  let treffer = null, imp = false;
  for (const r of regeln) {
    if (r.sel !== sel) continue;
    const m = new RegExp(`(?:^|[;{\\s])${eig}\\s*:\\s*([^;}]+)`).exec(r.dekl);
    if (!m) continue;
    const istImp = /!important/.test(m[1]); const v = m[1].replace(/!important/, "").trim();
    if (istImp || !imp) { treffer = v; imp = istImp; }
  }
  return treffer;
}
const px = (v) => (v == null ? null : parseFloat(v));

/* ---------- Betrieb, Sitz je Rolle, Rendern ---------- */
function betrieb() {
  const m = A.leererMandant("Ablauf-Pruefung", "pflege");
  const e = m.einheiten[0].id;
  m.personen = ["leitung", "planer", "subplaner", "mitarbeiter", "betriebsrat"]
    .map((rolle, i) => ({ ...A.zugangsPerson(rolle, e, i + 1), id: rolle, vorname: "Test", nachname: rolle }));
  m.abweichungen = { [`mitarbeiter|${HEUTE}`]: "F", [`subplaner|${HEUTE}`]: "F" };
  m.einstempeln = {};
  return m;
}
function sitzFuer(m, rolle) {
  const mig = migriere({ version: 5, stand: 1, mandanten: [m] });
  if (!mig.ok) throw new Error(`Migration: ${mig.grund}`);
  const ms = bestandFuerRolle(personenAngleichen(mig.bestand), { rolle, person: rolle, betrieb: 0 }).mandanten[0];
  const person = ms.personen.find((p) => p.id === rolle);
  return { rolle: "kunde", db: { mandanten: [ms], session: { mandantId: ms.id, personId: rolle, rolle } }, mandant: ms, person };
}
const akt = new Proxy({}, { get: () => () => {} });
const html = (el) => renderToStaticMarkup(el);
const knoepfe = (s) => [...s.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].map((m) => ({ attr: m[1], text: m[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim() }));
const hat = (s, text) => knoepfe(s).filter((k) => k.text === text);
/** Feste Breiten in Pixel (width, min-width) im gerenderten Markup; Prozentangaben zaehlen nicht. */
const festeBreiten = (s) => [...s.matchAll(/(?:min-)?width:(\d+(?:\.\d+)?)px/g)].map((m) => +m[1]);

const ROLLEN = ["leitung", "planer", "subplaner", "mitarbeiter", "betriebsrat"];
const CSS = () => A.bauStyles();

describe("WP-21 Teil 3: Viewports und Auswertung der Stilregeln", () => {
  it("alle acht Pruefviewports; Querformat sind die gedrehten Telefone", () => {
    expect(VIEWPORTS.map((v) => v.id)).toEqual(["360x740", "390x844", "430x932", "768x1024", "1024x768", "740x360", "844x390", "932x430"]);
    expect(VIEWPORTS.filter((v) => v.art === "telefon-quer").map((v) => [v.w, v.h])).toEqual([[740, 360], [844, 390], [932, 430]]);
  });
  it("die Auswertung unterscheidet die Breiten (Probe an bekannten Regeln)", () => {
    const css = CSS();
    expect(wert(regelnFuer(css, 360), ".btn", "white-space")).toBe("normal");
    expect(wert(regelnFuer(css, 768), ".btn", "white-space")).not.toBe("normal");
    expect(wert(regelnFuer(css, 844), ".seitenleiste", "transform")).toBe("translateX(-100%)");
    expect(wert(regelnFuer(css, 1280), ".seitenleiste", "transform")).toBeNull();
  });
});

for (const vp of VIEWPORTS) {
  describe(`WP-21 Teil 3 bei ${vp.id}${vp.art === "telefon-quer" ? " (Querformat)" : ""}`, () => {
    const regeln = () => regelnFuer(CSS(), vp.w);

    it("Seite: keine Signale fuer Querscroll (Umbruch, Seitenleiste ausserhalb, Scrollbereiche innen, Blatt hoechstens Viewport)", () => {
      const r = regeln();
      if (vp.w <= UMBRUCH.telefon) {
        expect(wert(r, ".btn", "white-space")).toBe("normal");
        expect(wert(r, ".btn", "max-width")).toBe("100%");
        expect(wert(r, ".reiterreihe-umbruch", "flex-wrap")).toBe("wrap");
      } else {
        expect(wert(r, ".reiterreihe-umbruch", "flex-wrap")).toBeNull();     /* ab 561 px passt die Reihe in eine Zeile */
      }
      if (vp.w <= UMBRUCH.seitenleiste) {
        expect(wert(r, ".inhalt", "margin-left")).toBe("0");
        expect(wert(r, ".seitenleiste", "transform")).toBe("translateX(-100%)");
        expect(wert(r, ".seitenleiste", "visibility")).toBe("hidden");
      }
      expect(wert(r, ".scrollbereich", "overflow-x")).toBe("auto");
      expect(wert(r, ".scrollbereich", "max-width")).toBe("100%");
      expect(wert(r, ".sheet-back > .blatt", "width")).toBe("100%");
      expect(wert(r, ".sheet-back > .blatt", "margin")).toBe("auto");
    });

    it("Zielgroesse: Meldungsstreifen und Schalter mindestens 24 px, Planzelle auf dem Telefon 44 px, Stempelflaeche 56 px", () => {
      const r = regeln();
      expect(px(wert(r, ".toast button", "min-height"))).toBeGreaterThanOrEqual(ZIEL_MINDEST);
      expect(px(wert(r, ".toast button", "min-width"))).toBeGreaterThanOrEqual(ZIEL_MINDEST);
      expect(px(wert(r, ".schalter", "height"))).toBeGreaterThanOrEqual(vp.w <= UMBRUCH.seitenleiste ? ZIEL_MINDEST : 23);
      if (vp.w <= UMBRUCH.telefon) expect(px(wert(r, ".planzelle", "min-height"))).toBeGreaterThanOrEqual(44);
      const stempel = html(h(A.MStempel, { sitz: sitzFuer(betrieb(), "mitarbeiter"), akt }));
      const hoehen = [...stempel.matchAll(/<button[^>]*class="btn btn-(?:primary|ok|quiet)"[^>]*style="[^"]*height:(\d+)px/g)].map((m) => +m[1]);
      expect(hoehen.length).toBeGreaterThan(0);
      for (const x of hoehen) expect(x).toBeGreaterThanOrEqual(44);
    });

    /* ---- 1 Stempeln ---- */
    it("Stempeln: Hauptaktion im Dokument, nicht gesperrt, volle Breite; keine feste Breite ueber dem Viewport", () => {
      const s = html(h(A.MStempel, { sitz: sitzFuer(betrieb(), "mitarbeiter"), akt }));
      const k = hat(s, "Einstempeln");
      expect(k).toHaveLength(1);
      expect(k[0].attr).not.toMatch(/\bdisabled\b/);
      expect(s).toMatch(/width:100%;height:56px/);
      for (const b of festeBreiten(s)) expect(b, "feste Breite").toBeLessThanOrEqual(vp.w);
    });

    /* ---- 2 Plan freigeben ---- */
    it("Plan freigeben: Schaltflaeche nur bei Leitung und Planung (RB-1/RB-3); Leiste bricht um", () => {
      const m = betrieb();
      for (const rolle of ROLLEN) {
        const s = html(h(Freigabeleiste, { sitz: sitzFuer(m, rolle), ym: MONAT, akt }));
        const da = hat(s, "Plan freigeben");
        expect(da.length === 1, `${rolle} bei ${vp.id}`).toBe(rolle === "leitung" || rolle === "planer");
        expect(s).toMatch(/flex-wrap:wrap/);
        for (const b of festeBreiten(s)) expect(b).toBeLessThanOrEqual(vp.w);
        if (da.length) expect(da[0].attr).not.toMatch(/\bdisabled\b/);
      }
    });

    /* ---- 3 Tag oeffnen ---- */
    it("Tag oeffnen: das Tagesblatt rendert als Dialog mit Dienstreitern; keine feste Breite ueber dem Viewport ausser der Blattbreite (begrenzt durch width:100%)", () => {
      for (const rolle of ["planer", "subplaner"]) {
        const s = html(h(Tagesdetail, { sitz: sitzFuer(betrieb(), rolle), datum: HEUTE, akt, onClose: () => {} }));
        expect(s).toContain('role="dialog"');
        expect(s).toMatch(/aria-modal="true"/);
        expect(s).toContain('class="reiterreihe"');
        expect(knoepfe(s).length).toBeGreaterThan(0);
      }
    });

    /* ---- 4 Uebergabe ---- */
    it("Uebergabe: Felder und Schaltflaechen da; Kopfzeile (Einheit, Datum, Dienst) bricht um", () => {
      const s = html(h(Schichtuebergabe, { sitz: sitzFuer(betrieb(), "subplaner"), akt }));
      expect(s).toMatch(/flex-wrap:wrap/);
      expect(s).toMatch(/<textarea/);
      expect(knoepfe(s).length).toBeGreaterThan(0);
    });

    /* ---- 5 Krankmeldung ---- */
    it("Krankmeldung: Hauptaktion da; Planung und Leitung wirken sofort, Schichtverantwortung und Beschaeftigte nur vorlaeufig (RB-2)", () => {
      const m = betrieb();
      for (const rolle of ROLLEN.filter((x) => x !== "betriebsrat")) {
        const s = html(h(Krankmeldung, { sitz: sitzFuer(m, rolle), akt, vorauswahl: rolle, onClose: () => {} }));
        const k = hat(s, "Krank melden");
        expect(k, `${rolle} ${vp.id}`).toHaveLength(1);
        expect(k[0].attr).not.toMatch(/\bdisabled\b/);
        const vorlaeufig = rolle === "subplaner" || rolle === "mitarbeiter";
        expect(s.includes("Wirksam wird sie mit deren endgültiger Bestätigung"), rolle).toBe(vorlaeufig);
        expect(s.includes("Die Meldung wirkt sofort"), rolle).toBe(!vorlaeufig);
        expect(s).toContain('role="dialog"');
      }
    });
  });
}

/* ---------- RB-5: Markierung nur fuer die erlaubten Rollen ---------- */
describe("WP-21 Teil 3: RB-5 Klaerungsmarker auf allen Viewports nur fuer Planung, Leitung, zustaendige Schichtverantwortung", () => {
  const T = (n) => tagePlus(HEUTE, n);
  const person = (id, rolle, einheit, extra = {}) => ({ id, vorname: `V${id}`, nachname: `N${id}`, rolle, bereich: einheit, status: "aktiv",
    qualifikationen: [], zugehoerigkeit: [{ ab: "2020-01-01", einheitId: einheit }], ...extra });
  const mandant = () => ({ id: "m1", name: "Haus", einheiten: [{ id: "e1", name: "WB1" }, { id: "e2", name: "WB2" }, { id: "pool", pool: true }],
    dienstarten: [{ id: "F", name: "Früh", kurz: "F", start: "06:00", ende: "14:00", mindest: { mo_do: 2, fr: 2, sa: 2, so: 2 } }], qualifikationen: [],
    personen: [person("a1", "mitarbeiter", "e1"), person("a2", "mitarbeiter", "e1"), person("b1", "mitarbeiter", "e2"),
      person("s1", "subplaner", "e1"), person("s2", "subplaner", "e2"), person("p1", "planer", "ALLE"), person("l1", "leitung", "ALLE"),
      person("r1", "betriebsrat", "ALLE")],
    abweichungen: { [`a1|${T(2)}`]: "F", [`a2|${T(2)}`]: "F" }, abwesenheiten: [],
    krankmeldungen: [{ id: "km-a1", personId: "a1", von: T(2), bis: T(2), status: KRANK_STATUS.EINGEGANGEN, notiz: "NOTIZ-SYNTH",
      verlauf: [{ schritt: "eingegangen", von: "a1", rolle: "mitarbeiter", zeit: "2026-11-11T08:00:00.000Z" }] }],
    anfragen: [], nachrichten: [], erfassung: {}, einstempeln: {}, einspruenge: [], einstellungen: { maxFolge: 6 } });
  const sitz = (rolle, id) => {
    const ms = bestandFuerAntwort({ version: 9, stand: 1, mandanten: [mandant()] }, { rolle, person: id, betrieb: 0, mandantId: "m1" }).mandanten[0];
    return { rolle: "kunde", person: ms.personen.find((p) => p.id === id), mandant: ms };
  };
  const FAELLE = [["planer", "p1", true], ["leitung", "l1", true], ["subplaner", "s1", true], ["subplaner", "s2", false],
    ["mitarbeiter", "a1", false], ["mitarbeiter", "a2", false], ["betriebsrat", "r1", false]];
  for (const vp of VIEWPORTS) {
    it(`${vp.id}: Marker sichtbar genau fuer Planung, Leitung und die zustaendige Schichtverantwortung`, () => {
      for (const [rolle, id, soll] of FAELLE) {
        const s = sitz(rolle, id);
        const out = html(h(KrankmeldungenOffen, { sitz: s, akt: {}, oeffneTag: () => {} }));
        expect(out.includes(KLAERUNG_HINWEIS), `${rolle}/${id}`).toBe(soll);
        expect(klaerungFuer(s).length > 0, `${rolle}/${id}`).toBe(soll);
        for (const b of festeBreiten(out)) expect(b).toBeLessThanOrEqual(vp.w);
      }
    });
  }
});

/* ---------- Hinweis "Fuer Tablet und Rechner ausgelegt" ---------- */
describe("WP-21 Teil 3: Hinweisliste und Beleg", () => {
  const doc = readFileSync(new URL("../docs/acc45/WP-21-GERAETEMATRIX.md", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const abschnitt = doc.slice(doc.indexOf("## 10 "));
  it("die Liste ohne Hinweis ist genau die in Abschnitt 10 der Matrix belegte Liste (Betreiber getrennt)", () => {
    expect(abschnitt.length).toBeGreaterThan(500);
    const marker = (name) => ((abschnitt.match(new RegExp(`<!-- ${name}: ([a-z, ]*) -->`)) || [])[1] ?? null);
    expect(marker("TELEFON_ANSICHTEN"), "Belegmarker").not.toBeNull();
    expect(marker("TELEFON_ANSICHTEN").split(",").map((x) => x.trim()).filter(Boolean)).toEqual([...TELEFON_ANSICHTEN]);
    expect(marker("TELEFON_ANSICHTEN_BETREIBER").split(",").map((x) => x.trim()).filter(Boolean)).toEqual([...TELEFON_ANSICHTEN_BETREIBER]);
    for (const v of TELEFON_ANSICHTEN) expect(abschnitt, v).toContain("`" + v + "`");
  });
});
