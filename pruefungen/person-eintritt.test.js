/* ==========================================================================
   Eintrittsdatum — keine stille Ersetzung durch das heutige Datum (Freigabe 2026-11-09)

   Regeln:
   - leer und fachlich optional      -> null (nie heute)
   - gültige Eingabe                 -> übernommen
   - ungültige Eingabe               -> Fehler mit verständlicher Meldung
   - fachlich erforderlich, fehlt    -> Aufforderung zur Eingabe (Fehler, kein Standardwert)
   - Bearbeitung, Feld leer          -> bestehendes Datum bleibt
   - Lesekompatibilität: Bestand ohne Feld, mit heutigem Altwert oder mit
     zugehoerigkeit.ab = null rechnet unverändert und ohne falsche Zugehörigkeit.
   Aufruf: npx vitest run pruefungen/person-eintritt.test.js --testTimeout=60000
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { demobestand, importParsen, importZuordnen, importPruefen, eintrittPruefen, eintrittUebernehmen,
  rolleAm, besetzung } from "../src/lib/fachlogik.js";
import { imDienst, einheitAm } from "../server/lib/fachpruefung.mjs";

const m0 = demobestand().mandanten[0];
const einheit = m0.einheiten[0].name;
const heute = new Date().toISOString().slice(0, 10);
const KOPF = "Nachname;Vorname;Personalnummer;Einheit;Eintritt";
const lauf = (text) => {
  const { kopf, daten } = importParsen(text);
  const { zu } = importZuordnen(kopf, daten);
  return importPruefen(m0, kopf, daten, zu);
};

describe("Eintritt: Eingabeprüfung", () => {
  for (const leer of ["", "   ", null, undefined]) {
    it(`E-leer ${JSON.stringify(leer)} -> null, kein Fehler, nicht heute`, () => {
      const r = eintrittPruefen(leer);
      expect(r.ok).toBe(true);
      expect(r.wert).toBeNull();
      expect(r.wert).not.toBe(heute);
    });
  }
  it("E-gültig: deutsches und ISO-Datum werden übernommen", () => {
    expect(eintrittPruefen("01.03.2024")).toMatchObject({ ok: true, wert: "2024-03-01" });
    expect(eintrittPruefen("2024-03-01")).toMatchObject({ ok: true, wert: "2024-03-01" });
    expect(eintrittPruefen("29.02.2024").wert).toBe("2024-02-29");
  });
  it("E-ungültig: 31.02. ist ein Fehler mit verständlicher Meldung", () => {
    const r = eintrittPruefen("31.02.2024");
    expect(r.ok).toBe(false);
    expect(r.wert).toBeNull();
    expect(r.fehler).toMatch(/Eintrittsdatum/);
    expect(r.fehler).toMatch(/31\.02\.2024/);
  });
  it("E-ungültig: Text und Monat 13 sind Fehler", () => {
    expect(eintrittPruefen("irgendwann").ok).toBe(false);
    expect(eintrittPruefen("01.13.2024").ok).toBe(false);
  });
  it("E-Pflicht: fehlt ein fachlich erforderliches Datum, wird zur Eingabe aufgefordert", () => {
    const r = eintrittPruefen("", { pflicht: true });
    expect(r.ok).toBe(false);
    expect(r.wert).toBeNull();
    expect(r.fehler).toMatch(/eingeben/i);
  });
  it("E-Pflicht: gültiges Datum bleibt auch bei Pflicht gültig", () => {
    expect(eintrittPruefen("01.03.2024", { pflicht: true })).toMatchObject({ ok: true, wert: "2024-03-01" });
  });
});

describe("Eintritt: Import", () => {
  it("I-leer: Zeile mit leerer Zelle -> null, übernehmbar", () => {
    const z = lauf(`${KOPF}\nNeumann;Ida;P1;${einheit};`).zeilen[0];
    expect(z.eintritt).toBeNull();
    expect(z.eintritt).not.toBe(heute);
    expect(z.ok).toBe(true);
  });
  it("I-Spalte fehlt: kein Eintritt -> null", () => {
    const z = lauf(`Nachname;Vorname;Personalnummer;Einheit\nNeumann;Ida;P1;${einheit}`).zeilen[0];
    expect(z.eintritt).toBeNull();
    expect(z.ok).toBe(true);
  });
  it("I-gültig: Datum wird übernommen", () => {
    expect(lauf(`${KOPF}\nNeumann;Ida;P1;${einheit};01.03.2024`).zeilen[0].eintritt).toBe("2024-03-01");
  });
  it("I-ungültig: 31.02. -> Fehler, nicht übernehmbar, Meldung nennt den Wert", () => {
    const z = lauf(`${KOPF}\nNeumann;Ida;P1;${einheit};31.02.2024`).zeilen[0];
    expect(z.ok).toBe(false);
    expect(z.fehler.join(" ")).toMatch(/Eintritt.*31\.02\.2024/);
  });
});

describe("Eintritt: Bearbeitung einer vorhandenen Person", () => {
  const person = { ...m0.personen[0], eintritt: "2019-05-01" };
  it("B-leer: leeres Feld überschreibt das bestehende Datum nicht", () => {
    for (const leer of ["", "  ", null, undefined]) {
      const r = eintrittUebernehmen(person, leer);
      expect(r.ok).toBe(true);
      expect(r.wert).toBe("2019-05-01");
    }
  });
  it("B-gültig: neues Datum wird übernommen", () => {
    expect(eintrittUebernehmen(person, "01.02.2020")).toMatchObject({ ok: true, wert: "2020-02-01" });
  });
  it("B-ungültig: Fehler, bestehendes Datum bleibt", () => {
    const r = eintrittUebernehmen(person, "31.02.2020");
    expect(r.ok).toBe(false);
    expect(r.wert).toBe("2019-05-01");
  });
  it("B-ohne Bestand: leer bleibt null", () => {
    expect(eintrittUebernehmen({ ...person, eintritt: null }, "").wert).toBeNull();
  });
});

describe("Eintritt: Lesekompatibilität (null und Altbestand)", () => {
  const eid = m0.einheiten[0].id;
  const basis = { ...m0.personen[0], austritt: null, status: "aktiv" };
  const ohneFeld = (() => { const p = { ...basis, zugehoerigkeit: [{ ab: "2020-01-01", einheitId: eid }] }; delete p.eintritt; return p; })();
  const nullAb = { ...basis, eintritt: null, zugehoerigkeit: [{ ab: null, einheitId: eid }], rolleSeit: null, rolle: "planer" };
  const altHeute = { ...basis, eintritt: heute, zugehoerigkeit: [{ ab: heute, einheitId: eid }] };

  it("L1 imDienst: null und fehlendes Feld bedeuten keine Beschränkung", () => {
    expect(imDienst(nullAb, "2026-01-15")).toBe(true);
    expect(imDienst(ohneFeld, "2026-01-15")).toBe(true);
  });
  it("L2 imDienst: alter Standardwert heute bleibt unverändert wirksam", () => {
    expect(imDienst(altHeute, "2000-01-01")).toBe(false);
    expect(imDienst(altHeute, heute)).toBe(true);
  });
  it("L3 einheitAm: zugehoerigkeit.ab = null ergibt die Einheit, keine falsche Zugehörigkeit", () => {
    expect(einheitAm(nullAb, "2026-01-15")).toBe(eid);
    expect(einheitAm(ohneFeld, "2026-01-15")).toBe(eid);
  });
  it("L4 einheitAm: Verlauf mit Datum bleibt unverändert", () => {
    const zwei = { ...basis, zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "a" }, { ab: "2024-06-01", einheitId: "b" }] };
    expect(einheitAm(zwei, "2024-05-31")).toBe("a");
    expect(einheitAm(zwei, "2024-06-01")).toBe("b");
    expect(einheitAm({ ...basis, zugehoerigkeit: [{ ab: "2030-01-01", einheitId: "a" }] }, "2026-01-01")).toBeNull();
  });
  it("L5 rolleAm: Verlauf ohne Datum fällt nicht auf Mitarbeiter zurück", () => {
    const p = { ...nullAb, rolleVerlauf: [{ ab: null, rolle: "planer" }] };
    expect(rolleAm(p, "2026-01-15")).toBe("planer");
    expect(rolleAm(nullAb, "2026-01-15")).toBe("planer");
  });
  it("L6 Planrechnung: Person mit null wird wie dieselbe Person mit frühem Datum geplant", () => {
    const vorlage = m0.personen.find((q) => q.imSchichtdienst !== false && !q.springer && q.status !== "gesperrt");
    const heimat = vorlage.zugehoerigkeit[0].einheitId;
    const tage = Array.from({ length: 28 }, (_, i) => `2026-01-${String(i + 1).padStart(2, "0")}`);
    const mit = (p) => ({ ...m0, personen: [...m0.personen, { ...vorlage, austritt: null, ...p, id: "p-test" }] });
    const zaehle = (m) => tage.map((t) => Object.values(besetzung(m, t))
      .reduce((n, x) => n + (x.personen || []).filter((q) => q.id === "p-test").length, 0));
    const mN = mit({ eintritt: null, zugehoerigkeit: [{ ab: null, einheitId: heimat }] });
    const mD = mit({ eintritt: "2000-01-01", zugehoerigkeit: [{ ab: "2000-01-01", einheitId: heimat }] });
    let a, b;
    expect(() => { a = zaehle(mN); b = zaehle(mD); }).not.toThrow();
    expect(a).toEqual(b);
    expect(a.some((n) => n > 0)).toBe(true);
  });
});
