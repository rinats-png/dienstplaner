/* ==========================================================================
   MODUL PFLEGEQUALIFIKATION — Folgebefunde A-1, A-2, H-1 (Reviews Opus 2026-11-22)

   A-1 (niedrig): Eine Qualifikation „Betreuungskraft § 43b“ mit fachkraft: true
       steht in der Gruppe fachkraft und zählt als Fachkraft (das Flag hat seit
       #485 Vorrang, wie die Kernquote fachkraftLage). Bisher ohne Hinweis.
       Auflage: weicher Hinweis in `hinweise`, nicht abweisen.
   A-2 (niedrig–mittel): Bei Modul „geplant“ oder aus war eine fehl einsortierte,
       erkannte Betreuungsqualifikation im Altniveau gesperrt: auch eine
       Umbenennung, die Betreuung bleibt, wurde abgewiesen; die Meldung „erst das
       Niveau berichtigen“ war nicht ausführbar. Jetzt: Änderungen, die die
       Einordnung nicht ändern (Betreuung → Betreuung), gehen durch; Änderungen,
       die die Einordnung ändern, bleiben abgewiesen; die Meldung nennt den
       ausführbaren Ausweg (Ausnahmeweg der Leitung: Altniveau löschen).
   H-1 (niedrig): Der Kern liest fachkraft truthy, das Modul nur === true.
       Typprüfung im Schreibweg der Qualifikationen: fachkraft ist true, false
       oder fehlt — nur für neue oder geänderte Einträge; Altbestand bleibt
       speicherbar (keine Migration).

   Das Modul bleibt „geplant“ (Registry unverändert); geschrieben wird im
   Prüfmodus „vorlaeufig“ (nur Test) und gegen die echte Registry.
   ========================================================================== */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { pflegeVerteilung, pflegeQualAenderung, pruefePflegeNiveaus, istBetreuungsQualifikation } from "../server/lib/modul-pflegequal.mjs";
import { modulVon } from "../server/lib/branchenmodule.mjs";
import { branchenbestand, schreibeAls, vorlaeufigListe, schalterAn } from "./hilfen/branchenbetrieb.mjs";

const FEST = "2026-11-06T10:00:00.000Z";
beforeAll(() => { vi.useFakeTimers({ now: new Date(FEST), toFake: ["Date"] }); });
afterAll(() => { vi.useRealTimers(); });

const kopie = (x) => JSON.parse(JSON.stringify(x));
const V = (m, personen) => pflegeVerteilung(m, personen, { qualGueltig: () => true, heute: "2026-11-06" });
const LISTE = vorlaeufigListe("pflegequal");
const abgewiesen = (r) => !!r && typeof r.verweigert === "string";

/* ------------------------------------------------------------------ A-1 */
describe("A-1: Fachkraft-Flag gegen erkannten Betreuungsnamen — weicher Hinweis, keine Abweisung", () => {
  /* Genau das Fixture des Reviewers. */
  const BK_FK = { id: "bkfk", name: "Betreuungskraft § 43b", fachkraft: true };
  const QUALS = [{ id: "pfk", name: "Pflegefachkraft", fachkraft: true }, BK_FK];
  const N_FK = { id: "n-fk", name: "Fachkraft", gruppe: "fachkraft", versorgung: null, qualifikationen: ["pfk", "bkfk"] };

  it("Schreibweg: das Niveau wird angenommen (nicht abgewiesen)", () => {
    expect(istBetreuungsQualifikation(BK_FK)).toBe(false);
    expect(pruefePflegeNiveaus([N_FK], QUALS)).toBeNull();
  });
  it("Lesepfad: zählt als Fachkraft (wie die Kernquote) und meldet genau einen Hinweis für diese Qualifikation", () => {
    const m = { qualifikationen: kopie(QUALS), pflegeNiveaus: [kopie(N_FK)] };
    const v = V(m, [{ id: "p1", qualifikationen: ["bkfk"] }]);
    expect(v).toMatchObject({ fachkraefte: 1, pflegekraefte: 1, betreuung: 0, ohneNiveau: 0 });
    expect(v.hinweise).toHaveLength(1);
    expect(v.hinweise[0]).toMatchObject({ niveau: "n-fk", gruppe: "fachkraft", art: "fachkraftflag", qualifikationen: ["bkfk"] });
    expect(v.hinweise[0].text).toMatch(/Betreuungskraft § 43b/);
    expect(v.hinweise[0].text).toMatch(/als Fachkraft/);
    /* keine Personenkennung im Hinweis */
    expect(JSON.stringify(v.hinweise)).not.toMatch(/p1/);
  });
  it("Gegenprobe: ohne erkannten Namen kein Hinweis; ohne Flag gilt die alte Regel (Betreuung, Hinweis auf Fehlzuordnung)", () => {
    const ohneName = { qualifikationen: [{ id: "pfk", name: "Pflegefachkraft", fachkraft: true }], pflegeNiveaus: [{ ...N_FK, qualifikationen: ["pfk"] }] };
    expect(V(ohneName, [{ id: "p1", qualifikationen: ["pfk"] }]).hinweise).toBeUndefined();
    const ohneFlag = { qualifikationen: [{ ...BK_FK, fachkraft: false }], pflegeNiveaus: [{ ...N_FK, gruppe: "assistenz", qualifikationen: ["bkfk"] }] };
    const v = V(ohneFlag, [{ id: "p1", qualifikationen: ["bkfk"] }]);
    expect(v.pflegekraefte).toBe(0);
    expect(v.hinweise).toHaveLength(1);
    expect(v.hinweise[0].art).toBeUndefined();
  });
  it("Grundlage § 43b mit Flag: ebenfalls Hinweis; Merkmal „betreuung“: kein Flag-Hinweis (dort gilt die Betreuungsregel)", () => {
    const g = { id: "g", name: "Zusatzkraft", grundlage: "§ 43b SGB XI", fachkraft: true };
    const v = V({ qualifikationen: [g], pflegeNiveaus: [{ ...N_FK, qualifikationen: ["g"] }] }, []);
    expect(v.hinweise).toHaveLength(1);
    expect(v.hinweise[0]).toMatchObject({ art: "fachkraftflag", qualifikationen: ["g"] });
    const mk = { id: "mk", name: "Betreuungskraft § 43b", fachkraft: true, merkmal: "betreuung" };
    const w = V({ qualifikationen: [mk], pflegeNiveaus: [{ ...N_FK, qualifikationen: ["mk"] }] }, []);
    expect(w.hinweise.map((h) => h.art)).toEqual([undefined]);
  });
  it("echter Schreibweg (Prüfmodus): Leitung legt die Qualifikation an und ordnet sie der Gruppe fachkraft zu — gespeichert", () => {
    const g = branchenbestand({ pakete: ["pflege"], branche: "pflege", branchenmodule: schalterAn("pflegequal") });
    const res = schreibeAls(g, "LT", (m) => { m.qualifikationen = kopie(QUALS); m.pflegeNiveaus = [kopie(N_FK)]; }, { liste: LISTE });
    expect(abgewiesen(res), res && res.verweigert).toBe(false);
    expect(res.mandanten[0].pflegeNiveaus).toEqual([N_FK]);
  });
});

/* ------------------------------------------------------------------ A-2 */
const QUALS = [
  { id: "pfk", name: "Pflegefachkraft", fachkraft: true },
  { id: "pa", name: "Pflegeassistenz", fachkraft: false },
  { id: "bk", name: "Betreuungskraft § 43b", fachkraft: false },
  { id: "bkg", name: "Zusatzkraft", fachkraft: false, grundlage: "§ 43b SGB XI" },
  { id: "eh", name: "Erste Hilfe", fachkraft: false },
];
const N_FK = { id: "n-fk", name: "Fachkraft", gruppe: "fachkraft", versorgung: null, qualifikationen: ["pfk"] };
const N_PA = { id: "n-pa", name: "Assistenz", gruppe: "assistenz", versorgung: null, qualifikationen: ["pa"] };
const ALT = { id: "n-alt", name: "Assistenz alt", gruppe: "assistenz", versorgung: null, qualifikationen: ["bk", "bkg"] };   // Altbestand (Probe D)
const mit = (quals, niveaus) => ({ qualifikationen: kopie(quals), pflegeNiveaus: kopie(niveaus) });
const aendere = (quals, id, aenderung) => quals.map((q) => (q.id === id ? { ...q, ...aenderung } : q));

describe("A-2: Änderungen ohne Wechsel der Einordnung im Altniveau zugelassen (pflegeQualAenderung)", () => {
  const altM = mit(QUALS, [N_FK, N_PA, ALT]);
  it("Betreuung → Betreuung: Tippfehler-Korrektur, Umbenennung, Grundlage präzisiert — zugelassen", () => {
    for (const [id, aenderung] of [
      ["bk", { name: "Betreuungskraft § 43b SGB XI" }],
      ["bk", { name: "Alltagsbegleiterin" }],
      ["bk", { name: "Betreuungskraft", grundlage: "§ 43b SGB XI" }],
      ["bkg", { grundlage: "§ 43b Abs. 1 SGB XI" }],
      ["bkg", { name: "Zusatzkraft (Haus 2)" }],
    ]) {
      const neuM = mit(aendere(QUALS, id, aenderung), [N_FK, N_PA, ALT]);
      expect(pflegeQualAenderung(neuM, altM), JSON.stringify(aenderung)).toEqual({});
    }
  });
  it("die Verteilung zählt sie danach weiter nicht als Pflegekraft und meldet den Hinweis", () => {
    const neuM = mit(aendere(QUALS, "bk", { name: "Betreuungskraft § 43b SGB XI" }), [N_FK, N_PA, ALT]);
    const v = V(neuM, [{ id: "c", qualifikationen: ["bk"] }]);
    expect(v.pflegekraefte).toBe(0);
    expect(v.hinweise).toHaveLength(1);
    expect(v.hinweise[0]).toMatchObject({ niveau: "n-alt", qualifikationen: ["bk", "bkg"] });
  });
  it("Einordnung ändert sich: weiter abgewiesen (Betreuung → Pflegename, Grundlage entfernt, Löschung, Fachkraft-Flag gesetzt, Merkmal entfernt)", () => {
    const mk = [...QUALS, { id: "mk", name: "Hauskraft", fachkraft: false, merkmal: "betreuung" }];
    const nMk = [N_FK, N_PA, { ...ALT, qualifikationen: ["bk", "bkg", "mk"] }];
    const faelle = [
      [mit(aendere(QUALS, "bk", { name: "Pflegehelferin" }), [N_FK, N_PA, ALT]), altM],
      [mit(aendere(QUALS, "bkg", { grundlage: "Betriebliche Festlegung" }), [N_FK, N_PA, ALT]), altM],
      [mit(QUALS.filter((q) => q.id !== "bk"), [N_FK, N_PA, ALT]), altM],
      [mit(aendere(QUALS, "bk", { fachkraft: true }), [N_FK, N_PA, ALT]), altM],
      [mit(aendere(mk, "mk", { merkmal: undefined }), nMk), mit(mk, nMk)],
    ];
    for (const [neuM, alt] of faelle) {
      const r = pflegeQualAenderung(neuM, alt);
      expect(r.grund, JSON.stringify(neuM.qualifikationen)).toMatch(/Betreuungsqualifikation/);
      /* die Meldung nennt einen ausführbaren Ausweg */
      expect(r.grund).toMatch(/Ausnahmeweg/);
    }
  });
  it("Pflegename → Betreuung im Niveau außerhalb betreuung: weiter abgewiesen, mit Ausweg", () => {
    const alt = mit(QUALS, [N_FK, N_PA]);
    const r = pflegeQualAenderung(mit(aendere(QUALS, "pa", { name: "Betreuungsassistent § 87b" }), [N_FK, N_PA]), alt);
    expect(r.grund).toMatch(/Betreuungsqualifikation/);
    expect(r.grund).toMatch(/Ausnahmeweg/);
  });
  it("unveränderter Altbestand: nie abgewiesen", () => {
    expect(pflegeQualAenderung(mit(QUALS, [N_FK, N_PA, ALT]), altM)).toEqual({});
    expect(pflegeQualAenderung(mit(aendere(QUALS, "eh", { name: "EH" }), [N_FK, N_PA, ALT]), altM)).toEqual({});
  });
});

function betrieb(niveaus, { aktiv = true } = {}) {
  const g = branchenbestand({ pakete: ["pflege"], branche: "pflege", branchenmodule: aktiv ? schalterAn("pflegequal") : undefined });
  g.mandanten[0].qualifikationen = kopie(QUALS);
  if (niveaus) g.mandanten[0].pflegeNiveaus = kopie(niveaus);
  return g;
}

describe("A-2: echter Schreibweg bei Registry „geplant“ (Modul wirkt nicht)", () => {
  it("Registry unverändert: pflegequal „geplant“", () => {
    expect(modulVon("pflegequal").status).toBe("geplant");
  });
  for (const [titel, opt, aktiv] of [["Registry echt (geplant)", {}, true], ["Modul aus (Prüfmodus)", { liste: LISTE }, false]]) {
    it(`${titel}: Tippfehler-Korrektur der Betreuungsqualifikation im Altniveau gespeichert, Niveaus byte-gleich`, () => {
      const g = betrieb([N_FK, ALT], { aktiv });
      const res = schreibeAls(g, "LT", (m) => { m.qualifikationen = aendere(m.qualifikationen, "bk", { name: "Betreuungskraft § 43b SGB XI" }); }, opt);
      expect(abgewiesen(res), res && res.verweigert).toBe(false);
      expect(res.mandanten[0].qualifikationen.find((q) => q.id === "bk").name).toBe("Betreuungskraft § 43b SGB XI");
      expect(JSON.stringify(res.mandanten[0].pflegeNiveaus)).toBe(JSON.stringify([N_FK, ALT]));
    });
    it(`${titel}: Umbenennen zu einem Pflegenamen abgewiesen, Zustand byte-gleich`, () => {
      const g = betrieb([N_FK, ALT], { aktiv });
      const vorher = JSON.stringify(g);
      const res = schreibeAls(g, "LT", (m) => { m.qualifikationen = aendere(m.qualifikationen, "bk", { name: "Pflegehelferin" }); }, opt);
      expect(abgewiesen(res)).toBe(true);
      expect(res.verweigert).toMatch(/Ausnahmeweg/);
      expect(JSON.stringify(g)).toBe(vorher);
    });
  }
  it("der genannte Ausweg ist ausführbar: Leitung löscht das Altniveau über den Ausnahmeweg, danach ist die Qualifikation frei", () => {
    const g = betrieb([N_FK, ALT]);
    const a = schreibeAls(g, "LT", (m) => {
      m.pflegeNiveaus = m.pflegeNiveaus.filter((n) => n.id !== "n-alt");
      m.moduldatenAusnahme = { modul: "pflegequal", art: "loeschung", grund: "art17", eintraege: { pflegeNiveaus: ["n-alt"] } };
    });
    expect(abgewiesen(a), a && a.verweigert).toBe(false);
    expect(a.mandanten[0].pflegeNiveaus.map((n) => n.id)).toEqual(["n-fk"]);
    const b = schreibeAls(a, "LT", (m) => { m.qualifikationen = m.qualifikationen.filter((q) => q.id !== "bk"); });
    expect(abgewiesen(b), b && b.verweigert).toBe(false);
    expect(b.mandanten[0].qualifikationen.some((q) => q.id === "bk")).toBe(false);
  });
});

/* ------------------------------------------------------------------ H-1 */
describe("H-1: Typprüfung fachkraft (true, false oder fehlt) nur für neue oder geänderte Qualifikationen", () => {
  const SCHLECHT = [1, "true", "ja", 0, null, {}, []];
  it("neue Qualifikation mit fachkraft nicht boolesch: abgewiesen (auch ohne Niveaus)", () => {
    for (const fachkraft of SCHLECHT) {
      const neuM = { qualifikationen: [...kopie(QUALS), { id: "neu", name: "Neu", fachkraft }] };
      const r = pflegeQualAenderung(neuM, { qualifikationen: kopie(QUALS) });
      expect(r.grund, JSON.stringify(fachkraft)).toMatch(/fachkraft/);
    }
  });
  it("geänderte Qualifikation mit fachkraft nicht boolesch: abgewiesen", () => {
    const r = pflegeQualAenderung({ qualifikationen: aendere(QUALS, "pa", { fachkraft: 1 }) }, { qualifikationen: kopie(QUALS) });
    expect(r.grund).toMatch(/fachkraft/);
  });
  it("true, false und fehlend gehen durch", () => {
    for (const q of [{ id: "n1", name: "A", fachkraft: true }, { id: "n2", name: "B", fachkraft: false }, { id: "n3", name: "C" }])
      expect(pflegeQualAenderung({ qualifikationen: [...kopie(QUALS), q] }, { qualifikationen: kopie(QUALS) }), JSON.stringify(q)).toEqual({});
  });
  it("Altbestand: eine unverändert gespeicherte Qualifikation mit fachkraft 1 bleibt speicherbar (keine Migration)", () => {
    const alt = [...kopie(QUALS), { id: "x", name: "Alt", fachkraft: 1 }];
    expect(pflegeQualAenderung({ qualifikationen: kopie(alt) }, { qualifikationen: kopie(alt) })).toEqual({});
    /* eine andere Qualifikation ändern: der Altbestand stört nicht */
    expect(pflegeQualAenderung({ qualifikationen: aendere(alt, "eh", { name: "EH" }) }, { qualifikationen: kopie(alt) })).toEqual({});
  });
  it("echter Schreibweg (jeder Betrieb, Modul ohne Wirkung): neue Qualifikation mit fachkraft \"true\" abgewiesen; Altbestand speicherbar", () => {
    const g = branchenbestand({ pakete: [], branche: "sonstiges" });
    g.mandanten[0].qualifikationen = [{ id: "alt", name: "Alt", fachkraft: 1 }];
    const vorher = JSON.stringify(g);
    const r = schreibeAls(g, "LT", (m) => { m.qualifikationen = [...m.qualifikationen, { id: "neu", name: "Neu", fachkraft: "true" }]; });
    expect(abgewiesen(r)).toBe(true);
    expect(r.verweigert).toMatch(/fachkraft/);
    expect(JSON.stringify(g)).toBe(vorher);
    const ok = schreibeAls(g, "LT", (m) => { m.qualifikationen = [...m.qualifikationen, { id: "neu", name: "Neu", fachkraft: true }]; });
    expect(abgewiesen(ok), ok && ok.verweigert).toBe(false);
    expect(ok.mandanten[0].qualifikationen.find((q) => q.id === "alt").fachkraft).toBe(1);
    const unv = schreibeAls(g, "LT", (m) => { m.einstellungen = { ...m.einstellungen, ruhezeit: 12 }; });
    expect(abgewiesen(unv), unv && unv.verweigert).toBe(false);
  });
});
