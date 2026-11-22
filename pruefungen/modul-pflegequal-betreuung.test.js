/* ==========================================================================
   MODUL PFLEGEQUALIFIKATION — Nachbesserung M-PQ1 (Nachholreview WP-19, FN-14)

   Q2 a / FN-14 (entschieden 2026-11-14): Betreuungskräfte nach § 43b SGB XI
   getrennt ausweisen, nie als Pflege- oder Fachkraft zählen. Vorher ließ sich
   eine Betreuungsqualifikation (fachkraft: false) in die Gruppe „assistenz“
   legen und zählte dann in „pflegekraefte“ (Probe D).

   Geprüft: Schreibweg (neue oder geänderte Niveaus abgewiesen, Zustand danach
   byte-gleich), Altbestand (unverändert speicherbar, nicht still umgedeutet,
   in der Verteilung nie Pflegekraft, mit Hinweis), Rollen, und die
   Fachkraftquote des Kerns unverändert (Regression). Das Modul bleibt
   „geplant“; geschrieben wird nur im Prüfmodus (Registry-Kopie im Test).
   ========================================================================== */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { pruefePflegeNiveaus, pflegeVerteilung, pflegeZusammen, istBetreuungsQualifikation } from "../server/lib/modul-pflegequal.mjs";
import { modulVon } from "../server/lib/branchenmodule.mjs";
import { qualifikationenFuer } from "../server/lib/branchen.mjs";
import * as Befunde from "../server/lib/engine/befunde.mjs";
import { besetzung, qualGueltig } from "../server/lib/engine/plan.mjs";
import { PflegeVerteilung } from "../src/module/pflegequal.jsx";
import { branchenbestand, schreibeAls, vorlaeufigListe, schalterAn } from "./hilfen/branchenbetrieb.mjs";

const FEST = "2026-11-06T10:00:00.000Z";
beforeAll(() => { vi.useFakeTimers({ now: new Date(FEST), toFake: ["Date"] }); });
afterAll(() => { vi.useRealTimers(); });

const kopie = (x) => JSON.parse(JSON.stringify(x));
const QUALS = [
  { id: "pfk", name: "Pflegefachkraft", fachkraft: true },
  { id: "pa", name: "Pflegeassistenz", fachkraft: false },
  { id: "bk", name: "Betreuungskraft § 43b", fachkraft: false },
  { id: "bk2", name: "Alltagsbegleitung", fachkraft: false, grundlage: "§ 43b SGB XI" },
  { id: "bk3", name: "Betreuung (Haus)", fachkraft: false, merkmal: "betreuung" },
  { id: "bk4", name: "Betreuungskraft §43b", fachkraft: false, grundlage: "Betriebliche Festlegung" },
];
const N_FK = { id: "n-fk", name: "Fachkraft", gruppe: "fachkraft", versorgung: null, qualifikationen: ["pfk"] };
const N_PA = { id: "n-pa", name: "Assistenz", gruppe: "assistenz", versorgung: null, qualifikationen: ["pa"] };
const N_BK = { id: "n-bk", name: "Betreuung", gruppe: "betreuung", versorgung: null, qualifikationen: ["bk", "bk2", "bk3", "bk4"] };
const N_BK_OHNE = { id: "n-bk", name: "Betreuung", gruppe: "betreuung", versorgung: null, qualifikationen: ["bk2", "bk3", "bk4"] };
const ALT = { id: "n-alt", name: "Assistenz alt", gruppe: "assistenz", versorgung: null, qualifikationen: ["bk"] };   // Probe D
const person = (id, quals) => ({ id, qualifikationen: quals });
const V = (m, personen) => pflegeVerteilung(m, personen, { qualGueltig: () => true, heute: "2026-11-06" });

describe("Erkennung der Betreuungsqualifikation (§ 43b oder Merkmal)", () => {
  it("Grundlage, Name (mit und ohne Leerzeichen) und Merkmal; Pflegeassistenz und Fachkraft nicht", () => {
    expect(QUALS.map((q) => [q.id, istBetreuungsQualifikation(q)])).toEqual([
      ["pfk", false], ["pa", false], ["bk", true], ["bk2", true], ["bk3", true], ["bk4", true]]);
    expect(istBetreuungsQualifikation({ name: "§ 43 b SGB XI" })).toBe(true);
    expect(istBetreuungsQualifikation({ name: "Kurs § 43c" })).toBe(false);
    expect(istBetreuungsQualifikation({ name: "§ 43ba" })).toBe(false);
    expect(istBetreuungsQualifikation(null)).toBe(false);
  });
  it("die Vorlage des Branchenkatalogs (Pflege) wird erkannt", () => {
    const bk = qualifikationenFuer("pflege").find((q) => q.name === "Betreuungskraft § 43b");
    expect(istBetreuungsQualifikation(bk)).toBe(true);
    expect(qualifikationenFuer("pflege").filter(istBetreuungsQualifikation).map((q) => q.name)).toEqual(["Betreuungskraft § 43b"]);
  });
});

describe("Prüfung der Niveaus (M-PQ1)", () => {
  it("Betreuungsqualifikation nur in der Gruppe betreuung — assistenz, sonstige und fachkraft abgewiesen", () => {
    for (const q of ["bk", "bk2", "bk3", "bk4"]) {
      for (const gruppe of ["assistenz", "sonstige"]) {
        expect(pruefePflegeNiveaus([{ id: "x", name: "X", gruppe, qualifikationen: [q] }], QUALS), `${q} ${gruppe}`).toMatch(/nur in die Gruppe betreuung/);
      }
      expect(pruefePflegeNiveaus([{ id: "x", name: "X", gruppe: "fachkraft", qualifikationen: [q] }], QUALS)).toMatch(/nur Fachkraft/);
    }
    /* auch eine als Fachkraft markierte Betreuungsqualifikation gehört nicht in die Gruppe fachkraft — seit A-1 (Review #485)
       gilt gegen das Fachkraft-Flag nur das ausdrückliche Merkmal, nicht der Name (Name allein: modul-pflegequal-erkennung.test.js) */
    const fk43b = [{ id: "z", name: "Betreuungskraft § 43b", fachkraft: true, merkmal: "betreuung" }];
    expect(pruefePflegeNiveaus([{ id: "x", name: "X", gruppe: "fachkraft", qualifikationen: ["z"] }], fk43b)).toMatch(/nur in die Gruppe betreuung/);
  });
  it("gültige Niveaus bleiben gültig (bisheriges Verhalten)", () => {
    expect(pruefePflegeNiveaus([N_FK, N_PA, N_BK], QUALS)).toBeNull();
    expect(pruefePflegeNiveaus([{ ...N_PA, gruppe: "sonstige" }], QUALS)).toBeNull();
    expect(pflegeZusammen({ qualifikationen: QUALS, pflegeNiveaus: [N_FK, N_PA, N_BK] })).toEqual({});
  });
  it("Altbestand: ein unverändert gespeichertes Niveau bleibt speicherbar; jede Änderung daran wird geprüft", () => {
    const alt = { qualifikationen: QUALS, pflegeNiveaus: [N_FK, ALT] };
    expect(pflegeZusammen({ ...kopie(alt), pflegeNiveaus: [N_FK, ALT, N_BK_OHNE] }, alt)).toEqual({});
    expect(pflegeZusammen({ ...kopie(alt), pflegeNiveaus: [N_FK, { ...ALT, name: "umbenannt" }] }, alt).grund).toMatch(/Betreuungsqualifikation/);
    expect(pflegeZusammen({ ...kopie(alt), pflegeNiveaus: [N_FK, { ...ALT, id: "n-neu" }] }, alt).grund).toMatch(/Betreuungsqualifikation/);
    expect(pflegeZusammen({ ...kopie(alt), pflegeNiveaus: [N_FK, ALT] }).grund, "ohne gespeicherten Stand: neu").toMatch(/Betreuungsqualifikation/);
  });
});

describe("Verteilung (Lesepfad): Betreuung nie als Pflegekraft, Altbestand mit Hinweis", () => {
  it("Probe D: Betreuungskraft im Altniveau „assistenz“ zählt nicht als Pflegekraft", () => {
    const v = V({ qualifikationen: QUALS, pflegeNiveaus: [ALT] }, [person("c", ["bk"])]);
    expect(v.pflegekraefte).toBe(0);
    expect(v.fachkraefte).toBe(0);
    expect(v.ohneNiveau).toBe(1);
    expect(v.niveaus).toEqual([{ id: "n-alt", name: "Assistenz alt", gruppe: "assistenz", versorgung: null, anzahl: 0 }]);
    expect(v.hinweise).toHaveLength(1);
    expect(v.hinweise[0]).toMatchObject({ niveau: "n-alt", gruppe: "assistenz", qualifikationen: ["bk"] });
    expect(JSON.stringify(v.hinweise)).not.toMatch(/"c"/);                          // keine Person im Hinweis
  });
  it("mit richtigem Betreuungsniveau zählt sie dort; die übrigen Gruppen bleiben, wie sie sind", () => {
    const v = V({ qualifikationen: QUALS, pflegeNiveaus: [N_FK, N_PA, ALT, N_BK] },
      [person("a", ["pfk"]), person("b", ["pa"]), person("c", ["bk"]), person("d", ["pa", "bk"])]);
    expect(v).toMatchObject({ fachkraefte: 1, pflegekraefte: 3, betreuung: 1, ohneNiveau: 0 });
    expect(v.niveaus.find((n) => n.id === "n-alt").anzahl).toBe(0);
  });
  it("ohne Fehlzuordnung: Ergebnis ohne Hinweisfeld (wie bisher, byte-gleich)", () => {
    const v = V({ qualifikationen: QUALS, pflegeNiveaus: [N_FK, N_PA, N_BK] }, [person("a", ["pfk"]), person("c", ["bk"])]);
    expect(Object.keys(v)).toEqual(["niveaus", "fachkraefte", "pflegekraefte", "betreuung", "ohneNiveau"]);
    expect(JSON.stringify(v)).toBe(JSON.stringify({ niveaus: [
      { id: "n-fk", name: "Fachkraft", gruppe: "fachkraft", versorgung: null, anzahl: 1 },
      { id: "n-pa", name: "Assistenz", gruppe: "assistenz", versorgung: null, anzahl: 0 },
      { id: "n-bk", name: "Betreuung", gruppe: "betreuung", versorgung: null, anzahl: 1 }],
    fachkraefte: 1, pflegekraefte: 1, betreuung: 1, ohneNiveau: 0 }));
  });
  it("die Ansicht zeigt den Hinweis, ohne Kennungen von Personen", () => {
    const html = renderToStaticMarkup(h(PflegeVerteilung, { m: { qualifikationen: QUALS, pflegeNiveaus: [ALT] },
      personenImDienst: [person("pers-c", ["bk"])], qualGueltig: () => true, heute: "2026-11-06" }));
    expect(html).toMatch(/Pflegekräfte insgesamt: 0/);
    expect(html).toMatch(/Hinweis: Niveau „Assistenz alt“ enthält eine Betreuungsqualifikation/);
    expect(html).not.toMatch(/pers-/);
  });
});

/* ------------------------------------------------------------------ echter Schreibweg im Prüfmodus */
const LISTE = vorlaeufigListe("pflegequal");
function betrieb(niveaus) {
  const g = branchenbestand({ pakete: ["pflege"], branche: "pflege", branchenmodule: schalterAn("pflegequal") });
  g.mandanten[0].qualifikationen = kopie(QUALS);
  if (niveaus) g.mandanten[0].pflegeNiveaus = kopie(niveaus);
  return g;
}
const abgewiesen = (r) => !!r && typeof r.verweigert === "string";

describe("Schreibweg je Rolle (Prüfmodus „vorlaeufig“ nur im Test; Registry bleibt „geplant“)", () => {
  it("Registry unverändert: pflegequal „geplant“, ohne Abnahme", () => {
    expect(modulVon("pflegequal").status).toBe("geplant");
    expect(modulVon("pflegequal").abnahme).toBeUndefined();
  });
  it("Leitung und Kundenrolle: Betreuungskraft als Assistenz abgewiesen, Zustand danach byte-gleich", () => {
    for (const r of ["LT", "KD"]) {
      const g = betrieb([N_FK]);
      const vorher = JSON.stringify(g);
      const res = schreibeAls(g, r, (m) => { m.pflegeNiveaus = [N_FK, ALT]; }, { liste: LISTE });
      expect(abgewiesen(res), r).toBe(true);
      expect(res.verweigert).toMatch(/Betreuungsqualifikation \(§ 43b SGB XI\)/);
      expect(JSON.stringify(g), r).toBe(vorher);
    }
  });
  it("Leitung: richtig zugeordnet wird gespeichert", () => {
    const res = schreibeAls(betrieb([N_FK]), "LT", (m) => { m.pflegeNiveaus = [N_FK, N_PA, N_BK]; }, { liste: LISTE });
    expect(abgewiesen(res)).toBe(false);
    expect(res.mandanten[0].pflegeNiveaus).toEqual([N_FK, N_PA, N_BK]);
  });
  it("Altbestand: unverändertes Altniveau bleibt beim Speichern anderer Niveaus byte-gleich erhalten; Änderung daran abgewiesen", () => {
    const g = betrieb([N_FK, ALT]);
    const ok = schreibeAls(g, "LT", (m) => { m.pflegeNiveaus = [N_FK, ALT, N_BK_OHNE]; }, { liste: LISTE });
    expect(abgewiesen(ok)).toBe(false);
    expect(JSON.stringify(ok.mandanten[0].pflegeNiveaus[1])).toBe(JSON.stringify(ALT));
    const vorher = JSON.stringify(g);
    const nein = schreibeAls(g, "LT", (m) => { m.pflegeNiveaus = [N_FK, { ...ALT, versorgung: "ambulant" }]; }, { liste: LISTE });
    expect(abgewiesen(nein)).toBe(true);
    expect(JSON.stringify(g)).toBe(vorher);
  });
  it("Planung, Schichtverantwortung, Beschäftigte, Betriebsrat: keine Wirkung (Zustand byte-gleich)", () => {
    for (const r of ["PL", "SV", "MA", "BR"]) {
      const g = betrieb([N_FK]);
      const vorher = JSON.stringify(g);
      const res = schreibeAls(g, r, (m) => { m.pflegeNiveaus = [N_FK, ALT]; }, { liste: LISTE });
      expect(res === null || abgewiesen(res) || JSON.stringify(res.mandanten[0].pflegeNiveaus) === JSON.stringify([N_FK]), r).toBe(true);
      expect(JSON.stringify(g), r).toBe(vorher);
    }
  });
  it("Registry „geplant“ (echt): auch die richtige Zuordnung bleibt geschlossen", () => {
    const res = schreibeAls(betrieb([N_FK]), "LT", (m) => { m.pflegeNiveaus = [N_FK, N_BK]; });
    expect(res.verweigert).toMatch(/wirkt in diesem Betrieb nicht/);
  });
});

/* ------------------------------------------------------------------ Regression Fachkraftquote (Kern) */
describe("Regression: Fachkraftquote des Kerns unverändert, Betreuungskraft nie Fachkraft", () => {
  let m;
  const tage = Array.from({ length: 10 }, (_, i) => `2026-11-${String(i + 1).padStart(2, "0")}`);
  beforeAll(async () => {
    const F = await import("../src/lib/fachlogik.js");
    m = F.startbestand().mandanten.find((x) => x.branche === "pflege");
  });
  it("der Pflege-Demobetrieb hat eine Betreuungskraft § 43b (nicht Fachkraft) und eine Fachkraftquote", () => {
    const bk = m.qualifikationen.filter(istBetreuungsQualifikation);
    expect(bk.length).toBe(1);
    expect(bk[0].fachkraft).toBe(false);
    expect(m.dienstarten.some((da) => da.fachkraftQuote)).toBe(true);
  });
  it("fachkraftLage gleich mit und ohne Pflegeniveaus (auch mit Altniveau „Betreuung als Assistenz“)", () => {
    const fk = m.qualifikationen.filter((q) => q.fachkraft).map((q) => q.id);
    const bk = m.qualifikationen.filter(istBetreuungsQualifikation).map((q) => q.id);
    const ohne = tage.map((d) => m.dienstarten.map((da) => Befunde.fachkraftLage(m, d, da.id)));
    const mit = kopie(m);
    mit.pflegeNiveaus = [{ id: "n-fk", name: "Fachkraft", gruppe: "fachkraft", versorgung: null, qualifikationen: fk },
      { id: "n-alt", name: "Assistenz alt", gruppe: "assistenz", versorgung: null, qualifikationen: bk }];
    const danach = tage.map((d) => mit.dienstarten.map((da) => Befunde.fachkraftLage(mit, d, da.id)));
    expect(JSON.stringify(danach)).toBe(JSON.stringify(ohne));
    expect(ohne.flat().some((x) => x && x.gesamt > 0)).toBe(true);                // es gibt echte Besetzung
  });
  it("Verteilung: Fachkräfte wie fachkraftLage, Pflegekräfte ohne Betreuungskräfte", () => {
    const fk = m.qualifikationen.filter((q) => q.fachkraft).map((q) => q.id);
    const bk = m.qualifikationen.filter(istBetreuungsQualifikation).map((q) => q.id);
    const mit = kopie(m);
    mit.pflegeNiveaus = [{ id: "n-fk", name: "Fachkraft", gruppe: "fachkraft", versorgung: null, qualifikationen: fk },
      { id: "n-alt", name: "Assistenz alt", gruppe: "assistenz", versorgung: null, qualifikationen: bk }];
    let mitBk = 0;
    for (const d of tage) {
      const b = besetzung(mit, d);
      for (const da of mit.dienstarten) {
        const personen = b[da.id].personen;
        const v = pflegeVerteilung(mit, personen, { qualGueltig: (mm, p, q) => qualGueltig(mm, p, q), heute: "2026-11-06" });
        const lage = Befunde.fachkraftLage(mit, d, da.id);
        if (lage) expect(v.fachkraefte, `${d} ${da.id}`).toBe(lage.fk);
        expect(v.pflegekraefte, `${d} ${da.id}`).toBe(v.fachkraefte);              // Betreuung zählt nie mit
        mitBk += personen.filter((p) => bk.some((q) => qualGueltig(mit, p, q)) && !fk.some((q) => qualGueltig(mit, p, q))).length;
      }
    }
    expect(mitBk, "Probe trägt Betreuungskräfte ohne Fachkraft-Qualifikation").toBeGreaterThan(0);
  });
});
