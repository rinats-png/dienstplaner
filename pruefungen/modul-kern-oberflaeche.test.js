/* ==========================================================================
   WP-19.0 — GEMEINSAMER KERN DER ZWÖLF BRANCHENMODULE (Oberfläche, Pakete)

     G1/G2  Einschalt-Oberfläche in der Betriebsverwaltung: nur mit org.edit
            bedienbar; die Planung sieht den Stand, schaltet nicht.
     G6     Bestätigungsdialog mit dem Hinweis, dass er keine Mitbestimmung
            ersetzt.
     G9     Pakete werben nicht mit Modulen, die noch nicht nutzbar sind;
            sie stehen dort „in Vorbereitung“ (aus dem Registry-Status).
     G10    Bestehende Funktionen hängen an keinem der zwölf Module.
     Einhängepunkte: src/module/index.js ist die eine Liste; App.jsx liest
            sie an genau einer Stelle (Komponente BranchenModule).

   Gerendert wird mit react-dom/server, wie in oberflaeche-render.test.js.
   ========================================================================== */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PAKETE } from "../src/stufen.js";
import { BRANCHENMODULE } from "../server/lib/branchenmodule.mjs";
import { berlinZeitpunkt } from "../server/lib/zeiterfassung.mjs";
import { bestandFuerRolle } from "../server/lib/rechte.mjs";
import { migriere } from "../src/migration.js";
import { personenAngleichen } from "../server/lib/gestalt.mjs";

const HIER = path.dirname(fileURLToPath(import.meta.url));
const lies = (datei) => readFileSync(path.join(HIER, "..", datei), "utf8");
const APP = lies("src/App.jsx");
const ZWOELF = BRANCHENMODULE.map((x) => x.id);
const JSX_MODULE = ["posten", "bereichsplan", "geteilterdienst", "anlagen", "maschinenqual", "kontimodelle"];

/* Neue Dateien des Kerns — fehlen sie, ist jeder Fall damit rot, nicht die ganze Datei. */
const IDX = await import("../src/module/index.js").catch(() => ({}));
const KERN = await import("../src/module/kern.jsx").catch(() => ({}));

let A;
beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(berlinZeitpunkt("2026-11-04", "11:00")));
  A = await import("../src/App.jsx");
}, 120000);
afterAll(() => { vi.useRealTimers(); });

const text = (el) => renderToStaticMarkup(el).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const akt = new Proxy({}, { get: () => () => {} });
function sitzFuer(m, rolle) {
  const mig = migriere({ version: 5, stand: 1, mandanten: [m] });
  if (!mig.ok) throw new Error(`Migration: ${mig.grund}`);
  const ms = bestandFuerRolle(personenAngleichen(mig.bestand), { rolle, person: rolle, betrieb: 0 }).mandanten[0];
  return { rolle: "kunde", db: { mandanten: [ms], session: { mandantId: ms.id, personId: rolle, rolle } }, mandant: ms,
    person: ms.personen.find((p) => p.id === rolle) };
}
function betrieb(pakete = ["sicherheit", "industrie"]) {
  const m = A.leererMandant("Modulkern", "sicherheit");
  const e = m.einheiten[0].id;
  m.personen = ["leitung", "planer", "subplaner", "mitarbeiter", "betriebsrat"]
    .map((rolle, i) => ({ ...A.zugangsPerson(rolle, e, i + 1), id: rolle, vorname: "Test", nachname: rolle }));
  m.pakete = pakete;
  return m;
}

/* ------------------------------------------------------------------------ */
describe("G9 — Pakete werben nur mit Nutzbarem; Module „in Vorbereitung“", () => {
  /* Woran man ein Modul in einer Paketbeschreibung erkennt. */
  const STICHWORTE = { posten: /posten/i, wachbuch: /wachbuch/i, objektbericht: /objektbericht/i, bereichsplan: /bereichs|wachabteilung/i,
    pflegequal: /betreuungskr|pflegequal|qualifikationsniveau/i, bereitschaftsdienst: /bereitschaft|rufbereitschaft/i,
    geteilterdienst: /geteilte/i, funktionsdienst: /funktionsdienst/i, rotation: /rotation/i, anlagen: /anlage/i,
    maschinenqual: /maschinen/i, kontimodelle: /konti/i };
  it("jedes Paket nennt geplante Module nur im Teil „In Vorbereitung“", () => {
    for (const p of PAKETE.filter((x) => !x.pflicht)) {
      const geplant = BRANCHENMODULE.filter((x) => x.status === "geplant" && p.merkmale.includes(x.merkmal));
      const [verfuegbar, vorbereitung = ""] = p.beschreibung.split("In Vorbereitung:");
      for (const mod of geplant) {
        expect(verfuegbar, `${p.id}: ${mod.id} als verfügbar beworben`).not.toMatch(STICHWORTE[mod.id]);
        expect(vorbereitung, `${p.id}: ${mod.id} fehlt in „In Vorbereitung“`).toContain(mod.name);
      }
      expect(p.inVorbereitung, p.id).toEqual(geplant.map((x) => x.id));
    }
  });
  it("die Kennzeichnung folgt dem Registry-Status, nicht einer zweiten Liste", () => {
    const S = /** @type {any} */ (PAKETE);
    expect(S.find((p) => p.id === "industrie").inVorbereitung).toEqual(["anlagen", "maschinenqual", "kontimodelle"]);
    expect(S.find((p) => p.id === "kern").inVorbereitung || []).toEqual([]);
  });
  it("Preise und Merkmale bleiben (keine Zahlungs- oder Paywall-Änderung)", () => {
    expect(PAKETE.filter((p) => !p.pflicht).map((p) => [p.id, p.aufpreis, p.merkmale.length])).toEqual([
      ["sicherheit", 79, 5], ["pflege", 89, 4], ["klinik", 129, 6], ["industrie", 59, 3]]);
  });
});

/* ------------------------------------------------------------------------ */
describe("G10 — bestehende Funktionen hängen an keinem Modul", () => {
  it("keine Ansicht und keine Prüfung in App.jsx fragt eines der zwölf Merkmale ab", () => {
    for (const id of ZWOELF) {
      expect(APP, id).not.toMatch(new RegExp(`PAKET:${id}\\b`));
      expect(APP, id).not.toMatch(new RegExp(`kann\\([^)]*["']${id}["']\\)`));
    }
  });
  it("App.jsx bindet die Moduloberflächen nur über den Kern ein — kein direkter Import eines Moduls", () => {
    const importe = [...APP.matchAll(/from "\.\/module\/([^"]+)"/g)].map((x) => x[1]);
    expect(importe).toEqual(["kern.jsx"]);
    expect((APP.match(/<BranchenModule\b/g) || []).length).toBe(2);         // Planung und Leitung, eine Komponente
  });
});

/* ------------------------------------------------------------------------ */
describe("Einhängepunkte: src/module/index.js", () => {
  it("jede Moduloberfläche in src/module steht genau einmal in der Liste, mit bekanntem Modul und Ort", () => {
    expect(Array.isArray(IDX.MODUL_OBERFLAECHEN)).toBe(true);
    expect(IDX.pruefeOberflaechen()).toEqual([]);
    expect(IDX.MODUL_OBERFLAECHEN.map((x) => x.modul).sort()).toEqual([...JSX_MODULE].sort());
    for (const x of IDX.MODUL_OBERFLAECHEN) {
      expect(ZWOELF, x.modul).toContain(x.modul);
      expect(IDX.EINHAENGEORTE, x.modul).toContain(x.ort);
    }
    expect(IDX.pruefeOberflaechen([{ modul: "gibtsnicht", ort: "betrieb", titel: "x", ansicht: () => null }]).join()).toMatch(/gibtsnicht/);
    expect(IDX.pruefeOberflaechen([{ modul: "posten", ort: "irgendwo", titel: "x", ansicht: () => null }]).join()).toMatch(/irgendwo/);
  });
  it("geplante Module zeigen keine Oberfläche — auch eingeschaltet nicht", () => {
    const m = { pakete: ["sicherheit", "industrie"], einstellungen: { branchenmodule: Object.fromEntries(ZWOELF.map((id) => [id, { an: true }])) } };
    for (const ort of IDX.EINHAENGEORTE) expect(IDX.oberflaechenFuer(m, ort, { darf: () => true }), ort).toEqual([]);
  });
  it("aktiv: „aktiv“; ausgeschaltet mit Daten: „nur lesen“ nur mit export.data; ohne Daten: nichts", () => {
    const liste = BRANCHENMODULE.map((x) => (x.id === "posten" ? { ...x, status: "vorlaeufig" } : x));
    const an = { pakete: ["sicherheit"], einstellungen: { branchenmodule: { posten: { an: true } } }, objekte: [] };
    expect(IDX.oberflaechenFuer(an, "tag", { darf: () => false, liste }).map((x) => [x.eintrag.modul, x.modus])).toEqual([["posten", "aktiv"]]);
    const aus = { pakete: ["sicherheit"], einstellungen: { branchenmodule: { posten: { an: false, eingeschaltetAm: "t0" } } }, objekte: [{ id: "o" }] };
    expect(IDX.oberflaechenFuer(aus, "tag", { darf: (r) => r === "export.data", liste }).map((x) => [x.eintrag.modul, x.modus])).toEqual([["posten", "nurLesen"]]);
    expect(IDX.oberflaechenFuer(aus, "tag", { darf: () => false, liste })).toEqual([]);
    expect(IDX.oberflaechenFuer({ ...aus, objekte: [] }, "tag", { darf: () => true, liste })).toEqual([]);
  });
  it("Export der Moduldaten (nur lesend, für Berechtigte): genau die Datenfelder des Moduls", () => {
    const m = { id: "m1", objekte: [{ id: "o" }], postenPlan: { "a|2026-11-02": "p" }, personen: [{ id: "a", iban: "GEHEIM" }] };
    const x = IDX.moduldatenExport(m, "posten");
    expect(x).toMatchObject({ modul: "posten", betrieb: "m1", daten: { objekte: m.objekte, postenPlan: m.postenPlan } });
    expect(JSON.stringify(x)).not.toContain("GEHEIM");
  });
});

/* ------------------------------------------------------------------------ */
describe("G1/G2/G6 — Einschalt-Oberfläche (BranchenModule)", () => {
  it("Leitung: alle zwölf Module mit ehrlichem Stand; geplante „in Vorbereitung“ ohne Schalter", () => {
    const sitz = sitzFuer(betrieb(), "leitung");
    const t = text(h(KERN.BranchenModule, { sitz, akt, darf: () => true }));
    for (const mod of BRANCHENMODULE) expect(t, mod.id).toContain(mod.name);
    expect((t.match(/in Vorbereitung/g) || []).length).toBeGreaterThanOrEqual(12);
    expect(renderToStaticMarkup(h(KERN.BranchenModule, { sitz, akt, darf: () => true }))).not.toMatch(/>Einschalten</);
  });
  it("Leitung mit einschaltbarem, mitbestimmungsrelevantem Modul: Bestätigung mit dem Hinweis „ersetzt keine Mitbestimmung“", () => {
    const liste = BRANCHENMODULE.map((x) => (x.id === "wachbuch" ? { ...x, status: "vorlaeufig" } : x));
    const sitz = sitzFuer(betrieb(), "leitung");
    const t = text(h(KERN.BranchenModule, { sitz, akt, darf: () => true, liste }));
    expect(t).toContain("Einschalten");
    expect(t).toMatch(/ersetzt keine Mitbestimmung/);
  });
  it("Planung: sieht den Stand, schaltet nicht; Hinweis, wer schaltet", () => {
    const liste = BRANCHENMODULE.map((x) => (x.id === "anlagen" ? { ...x, status: "vorlaeufig" } : x));
    const sitz = sitzFuer(betrieb(), "planer");
    const html = renderToStaticMarkup(h(KERN.BranchenModule, { sitz, akt, darf: (r) => r !== "org.edit", liste }));
    expect(html).not.toMatch(/>Einschalten</);
    expect(html.replace(/<[^>]+>/g, " ")).toMatch(/Organisationsleitung/);
  });
  it("Regelwerte: ungeprüfte Werte erscheinen nie als geltendes Recht", () => {
    const m = betrieb(["industrie"]);
    m.einstellungen = { ...m.einstellungen, regelwerte: { "ANLAGEN-BESETZUNG-01": { pruefstatus: "vorlaeufig", stufe: "hinweis", quelle: "Eigene Vorgabe" } } };
    const t = text(h(KERN.BranchenModule, { sitz: sitzFuer(m, "leitung"), akt, darf: () => true }));
    expect(t).toMatch(/ungeprüft/);
    expect(t).toMatch(/kein geltendes Recht|nicht als geltendes Recht/);
  });
  it("die echte Betriebsverwaltung rendert den Kern für Leitung und Planung", () => {
    for (const rolle of ["leitung", "planer"]) {
      const t = text(h(A.Betrieb, { sitz: sitzFuer(betrieb(), rolle), akt }));
      expect(t, rolle).toContain("Branchenmodule");
    }
  });
});
