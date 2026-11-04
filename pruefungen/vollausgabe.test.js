/* ==========================================================================
   VOLLAUSGABE — Datenexport in zwei Umfängen (Commit 1e.4a)

   Bis Oktober 2026 ging der eigene Betrieb über /api/vollausgabe roh
   hinaus: Kalender- und Push-Geheimnisse aller Personen, interne
   Betreibernotiz, Konditionen, unbekannte Felder — für die Leitung ein
   Umweg an ihrer Lesesicht (1e.3) vorbei.

   Jetzt: leitung = Lesesicht der Leitung ohne Zustellfelder; sicherung =
   dazu die Personaldaten des Kunden. In keinem Umfang technische
   Geheimnisse oder Betreiberinterna.
   ========================================================================== */

import { describe, it, expect } from "vitest";
import { vollausgabeBetrieb, exportBetrieb, EXPORT_PERSON, EXPORT_GEHEIMNISSE } from "../server/lib/sicherungen.mjs";

const GEHEIM = "darf-nicht-raus";
const person = (id, rolle) => ({ id, vorname: "V", nachname: `N${id}`, rolle, email: `${id}@x.de`, telefon: `0151-${id}`,
  kalenderGeheim: `kal-geheim-${id}`, kalenderVerweis: `https://kal/${id}`, kalenderStand: "2026-10-01",
  pushSchluessel: { endpoint: `push-${id}` }, zustellung: { planGeaendert: { mail: true } },
  iban: `IBAN-${id}`, steuerId: `ST-${id}`, sozialversicherung: `SV-${id}`, lohn: 3100, gehalt: 3200,
  notfallkontakt: `Mutter von ${id}`, emailVorher: `alt-${id}@x.de`, emailGeaendert: "2026-09-01",
  personalnummer: `PN-${id}`, notiz: `Planungswissen-${id}`, mutterschutz: true, neuesGeheimesFeld: GEHEIM });
const raum = () => ({ version: 9, stand: 3, tarife: [{ id: "t1" }], rechnungen: [{ id: "r1", mandantId: "m1" }],
  betreiber: { firma: "CENTRIC", iban: "BETREIBER-IBAN" },
  mandanten: [{
    id: "m1", name: "Haus", einheiten: [{ id: "e1" }], personen: [person("l1", "leitung"), person("a1", "mitarbeiter")],
    abweichungen: { "a1|2026-12-01": "F" }, abwesenheiten: [{ id: "ab", personId: "a1", art: "krank", von: "2026-12-01", bis: "2026-12-01", notiz: "Grippe" }],
    anfragen: [{ id: "an", personId: "a1", text: "Hochzeit" }], nachrichten: [{ id: "n", personId: "a1", titel: "x" }],
    dienstbuch: [{ id: "db", text: "Übergabe" }], uebergaben: [{ id: "ue", text: "Bewohner" }],
    ausschreibungen: [{ id: "as", bewerbungen: [{ personId: "a1", text: "gern" }] }], notizen: { "tag|2026-12-01": [{ text: "Tag" }] },
    erfassung: { "a1|2026-10-01": { start: "06:00", grund: "x" } }, lohnarten: [{ id: "lz" }],
    status: "aktiv", stichtag: "2027-01-01", pakete: ["pflege"],
    tarif: "pro", preisgestaltung: { sonder: 10 }, rabattGrund: "Freund", seit: "2025-01-01", bis: "2027-01-01",
    testTage: 30, selbstAngelegt: false, kontakt: "kontakt@kunde.de", kontaktName: "Frau Kunde", anschrift: "Kundenweg 1",
    ustId: "DE123", notiz: "interne Betreibernotiz", raum: "raum-1", neuesGeheimesFeld: GEHEIM,
  }, { id: "m2", name: "Fremd", personen: [person("f1", "leitung")] }],
});
const LEITUNG = { rolle: "leitung", person: "l1", betrieb: 0 };
const SCHLUESSEL = { nurSicherung: true, mandantId: "m1" };
const BETREIBERINTERNA = ["tarif", "preisgestaltung", "rabattGrund", "seit", "bis", "testTage", "selbstAngelegt",
  "kontakt", "kontaktName", "anschrift", "ustId", "notiz", "raum"];
const HR = ["iban", "steuerId", "sozialversicherung", "lohn", "gehalt", "notfallkontakt", "emailVorher"];

for (const [name, sitz, modus] of [["Leitung", LEITUNG, "leitung"], ["Sicherungsschlüssel", SCHLUESSEL, "sicherung"]]) {
  describe(name, () => {
    const va = vollausgabeBetrieb(raum(), sitz);
    const b = va.betrieb;
    it(`Umfang ${modus}, nur der eigene Betrieb`, () => {
      expect(va.modus).toBe(modus);
      expect(b.id).toBe("m1");
      expect(JSON.stringify(b)).not.toContain("f1");
    });
    it("keine technischen Geheimnisse — an keiner Person, auch nicht an der eigenen", () => {
      for (const p of b.personen) for (const f of EXPORT_GEHEIMNISSE) expect(p[f], `${p.id}/${f}`).toBeUndefined();
      const text = JSON.stringify(b);
      for (const s of ["kal-geheim-", "https://kal/", "push-"]) expect(text, s).not.toContain(s);
    });
    it("keine Betreiberinterna, keine Betreiber- oder Preisdaten", () => {
      for (const f of BETREIBERINTERNA) expect(b[f], f).toBeUndefined();
      const text = JSON.stringify(b);
      for (const s of ["interne Betreibernotiz", "Kundenweg", "DE123", "BETREIBER-IBAN", "Freund"]) expect(text, s).not.toContain(s);
    });
    it("keine unbekannten Felder (Person, Betrieb)", () => {
      expect(JSON.stringify(b)).not.toContain(GEHEIM);
    });
    it("Sammlungen, Plan und Regelwerk vollständig (auch Freitexte)", () => {
      const roh = raum().mandanten[0];
      for (const f of ["abweichungen", "abwesenheiten", "anfragen", "nachrichten", "dienstbuch", "uebergaben",
        "ausschreibungen", "notizen", "erfassung", "lohnarten", "einheiten", "status", "stichtag", "pakete", "name"])
        expect(b[f], f).toEqual(roh[f]);
    });
    it("Planungsdaten der Personen bleiben", () => {
      const a = b.personen.find((p) => p.id === "a1");
      expect(a).toMatchObject({ personalnummer: "PN-a1", notiz: "Planungswissen-a1", mutterschutz: true, email: "a1@x.de", telefon: "0151-a1" });
    });
  });
}

describe("Unterschied: Personaldaten des Kunden", () => {
  it("Leitung: keine Bank-, Steuer-, Sozialversicherungs-, Lohnangaben, kein Notfallkontakt, keine frühere Adresse — für niemanden", () => {
    const b = vollausgabeBetrieb(raum(), LEITUNG).betrieb;
    for (const p of b.personen) for (const f of [...HR, "emailGeaendert"]) expect(p[f], `${p.id}/${f}`).toBeUndefined();
  });
  it("Sicherungsschlüssel: diese Personaldaten sind enthalten", () => {
    const a = vollausgabeBetrieb(raum(), SCHLUESSEL).betrieb.personen.find((p) => p.id === "a1");
    expect(a).toMatchObject({ iban: "IBAN-a1", steuerId: "ST-a1", sozialversicherung: "SV-a1", lohn: 3100, gehalt: 3200,
      notfallkontakt: "Mutter von a1", emailVorher: "alt-a1@x.de" });
  });
  it("die Kataloge sind ausdrücklich und enthalten keine Geheimnisse", () => {
    for (const k of ["leitung", "sicherung"]) for (const f of EXPORT_GEHEIMNISSE) expect(EXPORT_PERSON[k]).not.toContain(f);
    for (const f of HR) { expect(EXPORT_PERSON.leitung).not.toContain(f); expect(EXPORT_PERSON.sicherung).toContain(f); }
    expect(() => exportBetrieb(raum().mandanten[0], { modus: "roh" })).toThrow();
  });
  it("die Ausgabe verändert den gespeicherten Bestand nicht", () => {
    const g = raum();
    const vorher = JSON.stringify(g);
    vollausgabeBetrieb(g, LEITUNG);
    vollausgabeBetrieb(g, SCHLUESSEL);
    expect(JSON.stringify(g)).toBe(vorher);
    expect(g.mandanten[0].personen[1].kalenderGeheim).toBe("kal-geheim-a1");
  });
});
