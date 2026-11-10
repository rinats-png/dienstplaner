/* WP-21 Smartphone/Tablet fuer alle Rollen, Teil 2: Vertragspruefung ohne Browser.
   Die Messung der Bedienablaeufe macht pruefungen/browser/geraete-wp21-ablaeufe.mjs von Hand (lokal, Wegwerfdaten); diese Datei
   haelt fest, was daraus im Quelltext steht: Querformat-Viewports, die Pruefung des Abwesenheitsantrags (Telefon und Rechner
   gleich), die Meldung als Live-Region, die Zielgroesse im Meldungsstreifen, der Umbruch der Schnellfilter, die Fokusfuehrung der
   Seitenleiste, die Tabelle "Rollen und Rechte" im Scrollbereich und die Liste der Ansichten ohne Tablet-Hinweis samt Beleg. */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import {
  GERAETE_VIEWPORTS, GERAETE_VIEWPORTS_QUER, UMBRUCH, SEITENLEISTE_ID, geraeteStil, seitenleisteFokus,
  TELEFON_ANSICHTEN, TELEFON_ANSICHTEN_BETREIBER, telefonTauglich,
} from "../src/ui/geraete.js";
import { urlaubAntragFehler } from "../src/lib/antragpruefung.js";

const lies = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const app = lies("src/App.jsx");
const mobil = lies("src/ansichten/mobil.jsx");
const css = geraeteStil();

describe("WP-21 Teil 2: Querformat der Telefone", () => {
  it("drei Querformate, jeweils das gedrehte Hochformat-Telefon", () => {
    expect(GERAETE_VIEWPORTS_QUER.map((v) => v.id)).toEqual(["740x360", "844x390", "932x430"]);
    const hoch = GERAETE_VIEWPORTS.filter((v) => v.art === "telefon");
    GERAETE_VIEWPORTS_QUER.forEach((q, i) => {
      expect(q.w).toBe(hoch[i].h); expect(q.h).toBe(hoch[i].w); expect(q.w).toBeGreaterThan(q.h);
      expect(q.id).toBe(`${q.w}x${q.h}`);
    });
  });
});

describe("WP-21 Teil 2: Abwesenheitsantrag prueft vor dem Absenden (Telefon und Rechner gleich)", () => {
  const m = { abwesenheiten: [{ personId: "p1", art: "urlaub", von: "2026-12-01", bis: "2026-12-05" }, { personId: "p2", art: "krank", von: "2026-12-10", bis: "2026-12-12" }] };
  it("Ende vor Beginn, fehlende Angabe, Ueberschneidung, freier Zeitraum", () => {
    expect(urlaubAntragFehler(m, "p1", { von: "2026-12-20", bis: "2026-12-19" })).toBe("Das Ende liegt vor dem Beginn.");
    expect(urlaubAntragFehler(m, "p1", { von: "", bis: "2026-12-19" })).toMatch(/benötigt/);
    expect(urlaubAntragFehler(m, "p1", undefined)).toMatch(/benötigt/);
    expect(urlaubAntragFehler(m, "p1", { von: "2026-12-04", bis: "2026-12-08" })).toMatch(/^Überschneidet sich mit .+ vom \d+\.\d+\..* bis /);
    expect(urlaubAntragFehler(m, "p1", { von: "2026-12-10", bis: "2026-12-11" })).toBe("");   /* Krank von p2 zaehlt nicht */
    expect(urlaubAntragFehler(m, "p1", { von: "2026-12-20", bis: "2026-12-20" })).toBe("");   /* ein Tag */
    expect(urlaubAntragFehler({}, "p1", { von: "2026-12-20", bis: "2026-12-21" })).toBe("");
  });
  it("Rechner- und Telefonansicht benutzen dieselbe Pruefung", () => {
    expect(lies("src/ansichten/meineschichten.jsx")).toMatch(/urlaubAntragFehler\(m, ich\.id, form\)/);
    expect(mobil).toMatch(/urlaubAntragFehler\(m, p\.id, antrag\)/);
  });
  it("das Telefonblatt zeigt den Fehler als Meldung (role alert), bleibt offen und markiert das Feld", () => {
    expect(mobil).toMatch(/\{antragFehler && <Fehlerband>\{antragFehler\}<\/Fehlerband>\}/);
    expect(mobil).toMatch(/if \(fe\) \{ setAntragFehler\(fe\); return; \}/);
    expect(mobil).toMatch(/aria-invalid=\{antragFehler \? "true" : undefined\}/);
    expect(lies("src/gestalt/ansichten.jsx")).toMatch(/className="fehlerband" role="alert"/);
  });
});

describe("WP-21 Teil 2: Meldungen und Zielgroesse", () => {
  it("die Meldung der Telefonansicht liegt in einer Live-Region, die immer im Dokument steht", () => {
    expect(app).toMatch(/<div role="status" aria-live="polite">\n\s+\{hinweis && <div style=\{\{ position: "fixed", bottom: 104/);
  });
  it("Schaltflaechen im Meldungsstreifen (Rueckgaengig) sind mindestens 24 px, auf Telefon und Tablet 36 px", () => {
    expect(css).toMatch(/\.toast button\{min-height:24px; min-width:24px; padding:4px 8px;\}/);
    expect(css).toContain(`@media (max-width: ${UMBRUCH.seitenleiste}px){ .toast button{min-height:36px; padding:6px 10px;} }`);
  });
  it("die Schnellfilter von Mein Plan umbrechen bis 560 px statt innen zu scrollen; ausserhalb aendert sich nichts", () => {
    const regel = `@media (max-width: ${UMBRUCH.telefon}px){ .reiterreihe-umbruch{flex-wrap:wrap; overflow-x:visible;} }`;
    expect(css).toContain(regel);
    expect(css.replace(regel, "")).not.toMatch(/reiterreihe-umbruch\{/);
    expect(mobil).toMatch(/className="reiterreihe reiterreihe-umbruch"/);
  });
});

describe("WP-21 Teil 2: Fokus der Seitenleiste", () => {
  const knoten = (name, opt = {}) => ({ name, focus() { ersatz.aktiv = this; }, closest: (s) => (opt.inLeiste && s === `#${SEITENLEISTE_ID}` ? knoten("leiste") : null) });
  const ersatz = { aktiv: null };
  const dok = (o) => ({
    body: { name: "body" }, documentElement: { name: "html" },
    get activeElement() { return ersatz.aktiv; },
    querySelector: (s) => {
      if (s === `#${SEITENLEISTE_ID} .slink[aria-current="page"]`) return o.aktuell || null;
      if (s === `#${SEITENLEISTE_ID} .slink`) return o.erster || null;
      if (s === ".kopf-menue") return o.taste || null;
      return null;
    },
  });
  it("offen: Fokus auf den aktuellen Eintrag, sonst auf den ersten", () => {
    const a = knoten("aktuell"), e = knoten("erster"), d = dok({ aktuell: a, erster: e });
    expect(seitenleisteFokus(d, true, false)).toBe("hinein"); expect(ersatz.aktiv).toBe(a);
    expect(seitenleisteFokus(dok({ erster: e }), true, false)).toBe("hinein"); expect(ersatz.aktiv).toBe(e);
    expect(seitenleisteFokus(dok({}), true, false)).toBe("nichts");
  });
  it("geschlossen: Fokus zurueck zur Menuetaste, wenn er in der Leiste lag oder verloren ging", () => {
    const taste = knoten("taste");
    ersatz.aktiv = knoten("eintrag", { inLeiste: true });
    expect(seitenleisteFokus(dok({ taste }), false, true)).toBe("zurueck"); expect(ersatz.aktiv).toBe(taste);
    const d = dok({ taste }); ersatz.aktiv = d.body;
    expect(seitenleisteFokus(d, false, true)).toBe("zurueck");
    ersatz.aktiv = null;
    expect(seitenleisteFokus(dok({ taste }), false, true)).toBe("zurueck");
  });
  it("geschlossen: liegt der Fokus im Inhalt oder war die Leiste nie offen, bleibt er", () => {
    const taste = knoten("taste"), inhalt = knoten("inhalt");
    ersatz.aktiv = inhalt;
    expect(seitenleisteFokus(dok({ taste }), false, true)).toBe("nichts"); expect(ersatz.aktiv).toBe(inhalt);
    ersatz.aktiv = knoten("eintrag", { inLeiste: true });
    expect(seitenleisteFokus(dok({ taste }), false, false)).toBe("nichts");
  });
  it("die Anwendung ruft sie bei jedem Wechsel auf; Menuetaste und Leiste sind verbunden", () => {
    expect(app).toMatch(/seitenleisteFokus\(document, seiteOffen, seiteWarOffen\.current\); seiteWarOffen\.current = seiteOffen;/);
    expect(app).toMatch(/<aside id=\{SEITENLEISTE_ID\} className=/);
    expect(lies("src/gestalt/rahmen.jsx")).toMatch(/aria-expanded=\{!!drawerOffen\} aria-controls=\{SEITENLEISTE_ID\}/);
    expect(SEITENLEISTE_ID).toBe("seitenleiste");
  });
});

describe("WP-21 Teil 2: Betrieb, Rollen und Rechte", () => {
  it("die Tabelle (780 px) liegt im Scrollbereich mit Namen; die Karte scrollt nicht mehr selbst", () => {
    expect(app).toMatch(/<Scrollbereich label="Rollen und Rechte, Tabelle der Berechtigungen je Rolle">\n\s+<table style=\{\{ borderCollapse: "collapse", width: "100%", minWidth: 780/);
    expect(app).toMatch(/<\/table>\n\s+<\/Scrollbereich>\n\s+<\/Card>/);
    expect(app).not.toMatch(/<Card style=\{\{ marginTop: 16, overflowX: "auto" \}\}>/);
  });
});

describe("WP-21 Teil 2: Ansichten ohne Tablet-Hinweis", () => {
  const doc = existsSync(new URL("../docs/acc45/WP-21-GERAETEMATRIX.md", import.meta.url)) ? lies("docs/acc45/WP-21-GERAETEMATRIX.md") : "";
  it("telefonTauglich: Liste, Betreiber getrennt, unbekannt nein", () => {
    for (const v of TELEFON_ANSICHTEN) expect(telefonTauglich(v, false), v).toBe(true);
    for (const v of TELEFON_ANSICHTEN_BETREIBER) expect(telefonTauglich(v, true), v).toBe(true);
    expect(telefonTauglich("plan", true)).toBe(false);                    /* Betreiber hat keinen Monatsplan */
    expect(telefonTauglich("mandanten", false)).toBe(false);              /* und die Betriebe keine Mandantenliste */
    expect(telefonTauglich("abrechnung", false)).toBe(false);             /* nicht gemessen: Hinweis bleibt */
    expect(telefonTauglich("betrieb", false)).toBe(false);
    expect(telefonTauglich(undefined, false)).toBe(false);
  });
  it("die Anwendung entscheidet ueber den Hinweis mit telefonTauglich, nicht mehr mit einer eigenen Liste", () => {
    expect(app).toMatch(/const mobilOk = telefonTauglich\(aktiveView, istBetreiber\);/);
    expect(app).not.toMatch(/const MOBIL = \[/);
  });
  it("jede Ansicht ohne Hinweis ist in der Matrix als gemessen und bestanden belegt", () => {
    expect(doc.length).toBeGreaterThan(2000);
    const teil2 = doc.slice(doc.indexOf("## 9 "));
    expect(teil2.length).toBeGreaterThan(500);
    for (const v of [...TELEFON_ANSICHTEN, ...TELEFON_ANSICHTEN_BETREIBER]) expect(teil2, v).toContain("`" + v + "`");
  });
});

describe("WP-21 Teil 2: Messskript der Ablaeufe", () => {
  const skript = lies("pruefungen/browser/geraete-wp21-ablaeufe.mjs");
  it("lokal, Zufallsschluessel, keine Passwortdatei, Viewports und Messfunktion aus dem Quelltext", () => {
    expect(skript).toMatch(/127\.0\.0\.1/);
    expect(skript).toMatch(/Math\.random\(\)\.toString\(36\)/);
    expect(skript).not.toMatch(/readFile|STAGING-KETTE|dotenv|\.env["']/i);
    expect(skript).toMatch(/import \{ GERAETE_VIEWPORTS, GERAETE_VIEWPORTS_QUER, ZIEL_MINDEST \} from "\.\.\/\.\.\/src\/ui\/geraete\.js";/);
    expect(skript).toMatch(/import \{ messeSeite \} from "\.\/geraete-messung\.mjs";/);
    expect(lies("pruefungen/browser/geraete-wp21.mjs")).toMatch(/import \{ messeSeite \} from "\.\/geraete-messung\.mjs";/);
    expect(lies("pruefungen/browser/geraete-messung.mjs")).toMatch(/export function messeSeite/);
    expect(lies("pruefungen/browser/geraete-messung.mjs")).toMatch(/scrollWidth/);
  });
  it("die Kernaufgaben aller Rollen stehen darin", () => {
    for (const a of ["stempeln", "stempelFehler", "plan", "antrag", "antragFehler", "krank", "freigeben", "tagoeffnen", "antraege", "uebergabe", "boerse"])
      expect(skript, a).toContain(`"${a}"`);
    for (const r of ["subplaner", "planer", "leitung", "betriebsrat", "betreiber"]) expect(skript, r).toContain(`${r}: [`);
    expect(skript).toMatch(/Tastatur- und Vorlesesoftware-Probe/);
  });
});
