/* ==========================================================================
   MODUL PFLEGEQUALIFIKATION — Auflage A1 (Delta-Review M-PQ1, 2026-11-22)

   FN-14 / Q2 a (entschieden 2026-11-14): Betreuungskräfte nach § 43b SGB XI
   getrennt ausweisen, nie auf Pflege- oder Fachkraft anrechnen.

   A1 fand zwei Lücken:
     1. Die Erkennung war zu schmal („Betreuungsassistent § 87b“, „43b SGB XI“
        ohne Paragrafzeichen, „Paragraf 43b“, Merkmal „Betreuung“, „Alltags-
        begleiter“ wurden nicht erkannt).
     2. Der Prüfweg lief nur bei geänderten Niveaus. Wurde eine erkannte
        Qualifikation umbenannt (oder ihre Grundlage geändert, oder gelöscht),
        zählte die Person still als Pflegekraft.

   Abwägung: Fehlerkennung als Betreuung nimmt eine echte Pflegekraft aus der
   Zählung (Gegenrichtung ebenso schädlich). Deshalb eine kleine Positivliste
   und Gegenproben (Pflegefachkraft, Pflegehelfer, Altenpfleger, § 43, 43c,
   § 87a). Das Modul bleibt „geplant“; geschrieben wird im Prüfmodus.
   ========================================================================== */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { istBetreuungsQualifikation, pflegeVerteilung, pflegeQualAenderung, pruefePflegeNiveaus } from "../server/lib/modul-pflegequal.mjs";
import { modulVon } from "../server/lib/branchenmodule.mjs";
import { branchenbestand, schreibeAls, vorlaeufigListe, schalterAn } from "./hilfen/branchenbetrieb.mjs";

const FEST = "2026-11-06T10:00:00.000Z";
beforeAll(() => { vi.useFakeTimers({ now: new Date(FEST), toFake: ["Date"] }); });
afterAll(() => { vi.useRealTimers(); });

const kopie = (x) => JSON.parse(JSON.stringify(x));
const NBSP = " ";
const NNBSP = " ";

describe("Erkennung: Positivliste (A1)", () => {
  const ERKANNT = [
    ["Betreuungsassistent § 87b SGB XI", "Name, alte Bezeichnung (§ 87b)"],
    ["Zusatzkraft nach § 87b", "§ 87b ohne Gesetz"],
    ["Zusatzkraft 43b SGB XI", "43b ohne Paragrafzeichen, mit SGB XI"],
    ["Zusatzkraft 43 b SGB XI", "43 b ohne Paragrafzeichen"],
    ["Zusatzkraft 87b SGB XI", "87b ohne Paragrafzeichen"],
    ["Zusatzkraft Paragraf 43b", "Paragraf ausgeschrieben"],
    ["Zusatzkraft Paragraph 43b SGB XI", "Paragraph ausgeschrieben"],
    ["Zusatzkraft PARAGRAF 43B", "Großschreibung"],
    ["Zusatzkraft § 43b", "§ 43b"],
    ["Zusatzkraft §43b", "§43b"],
    ["Zusatzkraft § 43 b", "§ 43 b"],
    ["Zusatzkraft §§ 43b", "§§ 43b"],
    ["Zusatzkraft § 43B SGB XI", "Großschreibung B"],
    [`Zusatzkraft §${NBSP}43b`, "NBSP"],
    [`Zusatzkraft §${NNBSP}43b`, "NNBSP"],
    ["Zusatzkraft § 43b Abs. 1 SGB XI", "mit Absatz"],
    ["Zusatzkraft 43b Abs. 1 SGB XI", "ohne §, mit Absatz"],
    ["Alltagsbegleiter", "Alltagsbegleiter"],
    ["Alltagsbegleiterin", "Alltagsbegleiterin"],
    ["Alltagsbegleitung", "Alltagsbegleitung"],
    ["Betreuungsassistent", "Betreuungsassistent ohne Norm"],
    ["Betreuungsassistenz", "Betreuungsassistenz"],
    ["Betreuungskraft", "Betreuungskraft ohne Norm"],
    ["Zusätzliche Betreuungskräfte", "Betreuungskräfte"],
    ["Betreuungskraefte", "Umschrift ae"],
    ["BETREUUNGSKRAFT", "Großschreibung"],
    ["Zusatzkraft § ４３ｂ", "Vollbreite Ziffern (NFKC)"],
    ["Betreuungskräfte", "zerlegter Umlaut (NFKC)"],
  ];
  for (const [name, wie] of ERKANNT) {
    it(`erkannt im Namen: ${wie}`, () => { expect(istBetreuungsQualifikation({ name, fachkraft: false }), name).toBe(true); });
  }
  it("erkannt in der Grundlage (auch ohne Paragrafzeichen, Paragraf ausgeschrieben, § 87b)", () => {
    for (const grundlage of ["43b SGB XI", "Paragraf 43b SGB XI", "§ 87b SGB XI", `§${NBSP}43${NNBSP}b SGB XI`, "§ 43b Abs. 1 SGB XI"])
      expect(istBetreuungsQualifikation({ name: "Zusatzkraft", grundlage }), grundlage).toBe(true);
  });
  it("Merkmal „betreuung“ ohne Rücksicht auf Groß-/Kleinschreibung und Leerraum", () => {
    for (const merkmal of ["betreuung", "Betreuung", "BETREUUNG", " Betreuung ", `${NBSP}betreuung`])
      expect(istBetreuungsQualifikation({ name: "Haus", merkmal }), JSON.stringify(merkmal)).toBe(true);
  });
});

describe("Erkennung: Gegenproben (keine echte Pflegekraft aus der Zählung nehmen)", () => {
  const NICHT = [
    "Pflegefachkraft", "Pflegefachfrau", "Pflegehelfer", "Pflegehelferin", "Altenpfleger", "Altenpflegerin", "Pflegeassistenz",
    "Gesundheits- und Krankenpfleger", "Wohnbereichsleitung", "Praxisanleitung",
    "Zusatzkraft § 43 SGB XI", "Zusatzkraft § 43", "Kurs 43c", "Kurs § 43c SGB XI", "Kurs 43c SGB XI", "Zusatzkraft § 87a", "Zusatzkraft 87a SGB XI",
    "Zusatzkraft § 43ba", "Zusatzkraft § 143b", "Zusatzkraft 143b SGB XI", "Raum 43b", "Zusatzkraft 43b SGB XII", "Zusatzkraft § 87",
    "Betreuung (Haus)", "Betreuer", "Pflege und Betreuung",
  ];
  for (const name of NICHT) {
    it(`nicht erkannt: ${name}`, () => { expect(istBetreuungsQualifikation({ name, fachkraft: false }), name).toBe(false); });
  }
  it("andere Merkmale und andere Datentypen", () => {
    for (const merkmal of ["fachkraft", "betreuer", "betreuungx", "", null, 1, ["betreuung"]])
      expect(istBetreuungsQualifikation({ name: "Haus", merkmal }), JSON.stringify(merkmal)).toBe(false);
    for (const q of [null, undefined, "Betreuungskraft § 43b", ["§ 43b"], { name: 43 }, { grundlage: {} }])
      expect(istBetreuungsQualifikation(q), JSON.stringify(q)).toBe(false);
  });
});

describe("H-1 (Review #485): rechtliche Betreuung ist keine Betreuungskraft", () => {
  for (const name of ["Betreuungsrecht", "Rechtliche Betreuung", "Rechtlicher Betreuer", "Rechtliche Betreuerin", "Berufsbetreuer",
    "Berufsbetreuerin", "Betreuungsrecht (Fortbildung)", "Betreuungsverfahren", "Betreuungsgericht"]) {
    it(`nicht erkannt: ${name}`, () => {
      expect(istBetreuungsQualifikation({ name, fachkraft: false }), name).toBe(false);
      expect(istBetreuungsQualifikation({ name: "Zusatzkurs", grundlage: name, fachkraft: false }), `Grundlage ${name}`).toBe(false);
    });
  }
});

describe("A-1 (Review #485): Fachkraft-Flag hat Vorrang vor der Erkennung über Name oder Grundlage", () => {
  const FK_NAMEN = ["Pflegefachkraft (Zusatzqualifikation Betreuungsassistent)", "Pflegefachkraft, Anleitung Betreuungskräfte",
    "Pflegefachkraft § 43b-Koordination", "Pflegefachkraft mit Weiterbildung Alltagsbegleitung", "Fachkraft 87b SGB XI (Anleitung)"];
  for (const name of FK_NAMEN) {
    it(`fachkraft: true bleibt Fachkraft: ${name}`, () => {
      expect(istBetreuungsQualifikation({ name, fachkraft: true }), name).toBe(false);
      expect(istBetreuungsQualifikation({ name: "Pflegefachkraft", grundlage: name, fachkraft: true }), `Grundlage ${name}`).toBe(false);
      /* ohne Fachkraft-Flag greift die Erkennung (Gegenprobe der Gegenprobe) */
      expect(istBetreuungsQualifikation({ name, fachkraft: false }), `${name} ohne Flag`).toBe(true);
    });
  }
  /* Erwartung geändert (Folgebefund A-1, Review 2026-11-22): früher „ohne Hinweis“ — genau das war der Befund (zählt
     still als Fachkraft). Die Zählung bleibt unverändert; neu kommt ein weicher Hinweis (art „fachkraftflag“) dazu,
     nie ein Betreuungs-Fehlzuordnungshinweis. Beleg: pruefungen/modul-pflegequal-folge.test.js. */
  it("Lesepfad: die Fachkraft zählt als Fachkraft, mit weichem Flag-Hinweis (A-1 Folge), ohne Fehlzuordnungshinweis", () => {
    const quals = FK_NAMEN.map((name, i) => ({ id: `f${i}`, name, fachkraft: true }));
    const m = { qualifikationen: quals, pflegeNiveaus: [{ id: "n-fk", name: "Fachkraft", gruppe: "fachkraft", versorgung: null, qualifikationen: quals.map((q) => q.id) }] };
    const v = pflegeVerteilung(m, quals.map((q) => ({ id: `p-${q.id}`, qualifikationen: [q.id] })), { qualGueltig: () => true, heute: "2026-11-06" });
    expect(v).toMatchObject({ fachkraefte: FK_NAMEN.length, pflegekraefte: FK_NAMEN.length, betreuung: 0, ohneNiveau: 0 });
    expect(v.hinweise).toEqual([expect.objectContaining({ niveau: "n-fk", art: "fachkraftflag", qualifikationen: quals.map((q) => q.id) })]);
  });
  it("Schreibweg: die Fachkraft passt in die Gruppe fachkraft", () => {
    const quals = FK_NAMEN.map((name, i) => ({ id: `f${i}`, name, fachkraft: true }));
    expect(pruefePflegeNiveaus([{ id: "n-fk", name: "Fachkraft", gruppe: "fachkraft", qualifikationen: quals.map((q) => q.id) }], quals)).toBeNull();
  });
  it("das ausdrückliche Merkmal „betreuung“ gilt auch bei fachkraft: true (Konflikt wird gemeldet, nie Fachkraft)", () => {
    const q = { id: "z", name: "Pflegefachkraft", fachkraft: true, merkmal: "Betreuung" };
    expect(istBetreuungsQualifikation(q)).toBe(true);
    expect(pruefePflegeNiveaus([{ id: "x", name: "X", gruppe: "fachkraft", qualifikationen: ["z"] }], [q])).toMatch(/nur in die Gruppe betreuung/);
    expect(pruefePflegeNiveaus([{ id: "x", name: "X", gruppe: "betreuung", qualifikationen: ["z"] }], [q])).toMatch(/Fachkraft-Qualifikation/);
  });
  it("fachkraft nur bei true (nicht \"true\", 1): sonst gilt die Erkennung", () => {
    for (const fachkraft of ["true", 1, undefined, null])
      expect(istBetreuungsQualifikation({ name: "Betreuungskraft § 43b", fachkraft }), JSON.stringify(fachkraft)).toBe(true);
  });
});

/* ------------------------------------------------------------------ Prüfung bei geänderten Qualifikationen */
const QUALS = [
  { id: "pfk", name: "Pflegefachkraft", fachkraft: true },
  { id: "pa", name: "Pflegeassistenz", fachkraft: false },
  { id: "bk", name: "Betreuungskraft § 43b", fachkraft: false },
  { id: "bkg", name: "Zusatzkraft", fachkraft: false, grundlage: "§ 43b SGB XI" },
  { id: "eh", name: "Erste Hilfe", fachkraft: false },
];
const N_FK = { id: "n-fk", name: "Fachkraft", gruppe: "fachkraft", versorgung: null, qualifikationen: ["pfk"] };
const N_PA = { id: "n-pa", name: "Assistenz", gruppe: "assistenz", versorgung: null, qualifikationen: ["pa"] };
const N_BK = { id: "n-bk", name: "Betreuung", gruppe: "betreuung", versorgung: null, qualifikationen: ["bk"] };
const ALT = { id: "n-alt", name: "Assistenz alt", gruppe: "assistenz", versorgung: null, qualifikationen: ["bk", "bkg"] };   // Altbestand (Probe D)
const mit = (quals, niveaus) => ({ qualifikationen: kopie(quals), pflegeNiveaus: kopie(niveaus) });
const umbenannt = (quals, id, aenderung) => quals.map((q) => (q.id === id ? { ...q, ...aenderung } : q));
const V = (m, personen) => pflegeVerteilung(m, personen, { qualGueltig: () => true, heute: "2026-11-06" });

describe("pflegeQualAenderung: Umbenennung, Grundlage, Löschung (A1)", () => {
  const altM = mit(QUALS, [N_FK, N_PA, ALT]);
  it("Probe des Reviewers: erkannte Betreuungsqualifikation im Altniveau umbenannt → abgewiesen", () => {
    const neuM = mit(umbenannt(QUALS, "bk", { name: "Hilfskraft" }), [N_FK, N_PA, ALT]);
    expect(pflegeQualAenderung(neuM, altM).grund).toMatch(/Betreuungsqualifikation/);
    /* ohne die Prüfung zählte die Person still als Pflegekraft: */
    expect(V(neuM, [{ id: "c", qualifikationen: ["bk"] }]).pflegekraefte).toBe(1);
    expect(V(altM, [{ id: "c", qualifikationen: ["bk"] }]).pflegekraefte).toBe(0);
  });
  it("Grundlage geändert (§ 43b entfernt) → abgewiesen", () => {
    const neuM = mit(umbenannt(QUALS, "bkg", { grundlage: "Betriebliche Festlegung" }), [N_FK, N_PA, ALT]);
    expect(pflegeQualAenderung(neuM, altM).grund).toMatch(/Betreuungsqualifikation/);
  });
  it("erkannte Betreuungsqualifikation aus dem Katalog gelöscht, Altniveau verweist noch darauf → abgewiesen", () => {
    const neuM = mit(QUALS.filter((q) => q.id !== "bk"), [N_FK, N_PA, ALT]);
    expect(pflegeQualAenderung(neuM, altM).grund).toMatch(/Betreuungsqualifikation/);
  });
  it("Pflegeassistenz in Gruppe assistenz zu „Betreuungsassistent § 87b“ umbenannt → abgewiesen", () => {
    const alt = mit(QUALS, [N_FK, N_PA]);
    const neuM = mit(umbenannt(QUALS, "pa", { name: "Betreuungsassistent § 87b" }), [N_FK, N_PA]);
    expect(pflegeQualAenderung(neuM, alt).grund).toMatch(/Betreuungsqualifikation/);
  });
  it("Merkmal „betreuung“ an einer Qualifikation der Gruppe assistenz gesetzt → abgewiesen", () => {
    const alt = mit(QUALS, [N_FK, N_PA]);
    const neuM = mit(umbenannt(QUALS, "pa", { merkmal: "Betreuung" }), [N_FK, N_PA]);
    expect(pflegeQualAenderung(neuM, alt).grund).toMatch(/Betreuungsqualifikation/);
  });
  it("Rückwärtskompatibel: unveränderter Altbestand bleibt speicherbar", () => {
    expect(pflegeQualAenderung(mit(QUALS, [N_FK, N_PA, ALT]), altM)).toEqual({});
    /* eine andere Qualifikation ändern, neue hinzufügen: kein Einfluss auf das Altniveau */
    expect(pflegeQualAenderung(mit([...umbenannt(QUALS, "eh", { name: "Erste Hilfe (neu)" }), { id: "neu", name: "Hygiene" }], [N_FK, N_PA, ALT]), altM)).toEqual({});
    /* auch eine unveränderte, erst jetzt erkannte Bezeichnung im Altniveau (Erkennung erweitert): speicherbar, Lesepfad mit Hinweis */
    const q2 = [...QUALS, { id: "ab", name: "Alltagsbegleiter", fachkraft: false }];
    const n2 = [N_FK, { ...N_PA, qualifikationen: ["pa", "ab"] }];
    expect(pflegeQualAenderung(mit(umbenannt(q2, "eh", { name: "EH" }), n2), mit(q2, n2))).toEqual({});
    const v = V(mit(q2, n2), [{ id: "x", qualifikationen: ["ab"] }]);
    expect(v.pflegekraefte).toBe(0);
    expect(v.hinweise).toHaveLength(1);
    expect(v.hinweise[0]).toMatchObject({ niveau: "n-pa", qualifikationen: ["ab"] });
  });
  it("in der Gruppe betreuung darf eine erkannte Qualifikation umbenannt werden (zählt weiter als Betreuung)", () => {
    const alt = mit(QUALS, [N_FK, N_PA, N_BK]);
    const neuM = mit(umbenannt(QUALS, "bk", { name: "Hilfe im Alltag" }), [N_FK, N_PA, N_BK]);
    expect(pflegeQualAenderung(neuM, alt)).toEqual({});
    expect(V(neuM, [{ id: "c", qualifikationen: ["bk"] }])).toMatchObject({ betreuung: 1, pflegekraefte: 0 });
  });
  it("Pflegekraft umbenennen bleibt möglich (keine Fehlerkennung)", () => {
    const alt = mit(QUALS, [N_FK, N_PA]);
    for (const name of ["Pflegehelfer", "Altenpfleger", "Pflegeassistenz (1-jährig)"])
      expect(pflegeQualAenderung(mit(umbenannt(QUALS, "pa", { name }), [N_FK, N_PA]), alt), name).toEqual({});
  });
  it("ohne Niveaus oder ohne Datensatz: nichts zu prüfen", () => {
    expect(pflegeQualAenderung({ qualifikationen: [] }, { qualifikationen: QUALS })).toEqual({});
    expect(pflegeQualAenderung(null, null)).toEqual({});
    expect(pflegeQualAenderung({ qualifikationen: QUALS, pflegeNiveaus: [{ id: "kaputt" }, null] }, { qualifikationen: QUALS })).toEqual({});
  });
});

/* ------------------------------------------------------------------ echter Schreibweg (Server) */
const LISTE = vorlaeufigListe("pflegequal");
function betrieb(niveaus, { aktiv = true } = {}) {
  const g = branchenbestand({ pakete: ["pflege"], branche: "pflege", branchenmodule: aktiv ? schalterAn("pflegequal") : undefined });
  g.mandanten[0].qualifikationen = kopie(QUALS);
  if (niveaus) g.mandanten[0].pflegeNiveaus = kopie(niveaus);
  return g;
}
const abgewiesen = (r) => !!r && typeof r.verweigert === "string";
const nenne = (m, id, name) => { m.qualifikationen = m.qualifikationen.map((q) => (q.id === id ? { ...q, name } : q)); };

describe("Schreibweg: Prüfung auch bei geänderten Qualifikationen (Registry bleibt „geplant“)", () => {
  it("Registry unverändert: pflegequal „geplant“", () => {
    expect(modulVon("pflegequal").status).toBe("geplant");
  });
  for (const [titel, opt] of [["Prüfmodus (vorlaeufig)", { liste: LISTE }], ["Registry echt (geplant)", {}]]) {
    it(`${titel}: Umbenennen der erkannten Betreuungsqualifikation im Altniveau abgewiesen, Zustand byte-gleich`, () => {
      const g = betrieb([N_FK, ALT]);
      const vorher = JSON.stringify(g);
      const res = schreibeAls(g, "LT", (m) => nenne(m, "bk", "Hilfskraft"), opt);
      expect(abgewiesen(res)).toBe(true);
      expect(res.verweigert).toMatch(/Betreuungsqualifikation/);
      expect(JSON.stringify(g)).toBe(vorher);
    });
    it(`${titel}: Altbestand bleibt speicherbar (unverändert; andere Qualifikation umbenannt; anderes Feld geändert)`, () => {
      const g = betrieb([N_FK, ALT]);
      const a = schreibeAls(g, "LT", () => {}, opt);
      expect(abgewiesen(a)).toBe(false);
      const b = schreibeAls(g, "LT", (m) => nenne(m, "eh", "Erste Hilfe 2026"), opt);
      expect(abgewiesen(b), b && b.verweigert).toBe(false);
      expect(b.mandanten[0].qualifikationen.find((q) => q.id === "eh").name).toBe("Erste Hilfe 2026");
      expect(JSON.stringify(b.mandanten[0].pflegeNiveaus)).toBe(JSON.stringify([N_FK, ALT]));
      const c = schreibeAls(g, "LT", (m) => { m.einstellungen = { ...m.einstellungen, ruhezeit: 12 }; }, opt);
      expect(abgewiesen(c), c && c.verweigert).toBe(false);
    });
  }
  it("Betrieb ohne Pflegeniveaus und ohne Modul: Qualifikationen frei änderbar (wie bisher)", () => {
    const g = betrieb(null, { aktiv: false });
    const res = schreibeAls(g, "LT", (m) => nenne(m, "bk", "Hilfskraft"));
    expect(abgewiesen(res), res && res.verweigert).toBe(false);
  });
  it("Qualifikation und Niveau im selben Speichern: Umbenennen im unveränderten Altniveau abgewiesen", () => {
    const g = betrieb([N_FK, ALT]);
    const res = schreibeAls(g, "LT", (m) => { nenne(m, "bk", "Hilfskraft"); m.pflegeNiveaus = [N_FK, ALT, N_PA]; }, { liste: LISTE });
    expect(abgewiesen(res)).toBe(true);
    expect(res.verweigert).toMatch(/Betreuungsqualifikation/);
  });
});
