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
import { imDienst as imDienstZeit } from "../server/lib/zeiterfassung.mjs";
import { abschlussLuecke, sollMonat } from "../server/lib/isteinfrieren.mjs";
import { sollStunden, istStunden, stundenkonto } from "../server/lib/engine/plan.mjs";
import { planungsreife } from "../server/lib/engine/planungsreife.mjs";
import { aktionenPlan } from "../src/app/aktionen/plan.js";
import { neuePersonFormular } from "../src/ansichten/personal.jsx";
import { readFileSync } from "node:fs";

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

  /* Angepasste Erwartung (Datenreview PR #130, Entscheidung 1): L1 schrieb fest, dass eintritt null „keine
     Beschränkung“ bedeutet (rückwirkende Beschäftigung). Jetzt: null ist an keinem Tag im Dienst. Der Teil zum
     fehlenden Feld (Altbestand) bleibt unverändert. */
  it("L1 imDienst: null heißt nicht im Dienst (angepasst PR #130), fehlendes Feld bedeutet keine Beschränkung", () => {
    expect(imDienst(nullAb, "2026-01-15")).toBe(false);
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
  /* Angepasste Erwartung (Datenreview PR #130, Entscheidung 1): L6 schrieb fest, dass eine Person mit eintritt null
     wie mit frühem Datum geplant wird. Jetzt: ohne Eintritt kein Dienst; die Rechnung läuft weiter ohne Fehler, und
     dieselbe Person mit Datum wird geplant (Gegenprobe). */
  it("L6 Planrechnung: Person mit null wird nicht geplant, mit frühem Datum schon (angepasst PR #130)", () => {
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
    expect(a.every((n) => n === 0)).toBe(true);
    expect(b.some((n) => n > 0)).toBe(true);
  });
});

/* ==========================================================================
   Auflagen aus dem Datenreview PR #130 (Entscheidungen 2026-11-09)
   1 Eintritt null/leer ergibt keine rückwirkende Beschäftigung: imDienst ist für jeden Tag false,
     keine Soll-/Ist-/Abschlussrechnung; planungsreife meldet „Eintritt fehlt“ als Hinweis mit Behebung.
   2 Bearbeitungsweg: setzeEintritt über eintrittUebernehmen (leer behält, gültig übernimmt, ungültig Fehler).
   4 Einzelanlage: keine Vorbelegung heute/Fachkraft; geleertes Datum speichert null, nicht "".
   ========================================================================== */

/** Aktionsfabrik mit einem Mandanten: mUpd wendet die Änderung an, melde sammelt Meldungen. */
const mitAktionen = (fabrik, m) => {
  const st = { m, meldungen: [] };
  const k = new Proxy({
    mUpd: (fn) => { st.m = fn(st.m); },
    melde: (t) => { st.meldungen.push(t); },
    sitz: { person: { id: "l1", vorname: "L", nachname: "L", rolle: "leitung" } },
    ref: { current: null },
  }, { get: (z, key) => (key in z ? z[key] : () => {}) });
  return { akt: fabrik(k), st };
};

describe("Auflage 1 (PR #130): Eintritt null ergibt keine rückwirkende Beschäftigung", () => {
  const vorlage = m0.personen.find((q) => q.imSchichtdienst !== false && !q.springer && q.status !== "gesperrt");
  const ohne = (eintritt) => ({ ...vorlage, id: "p-ohne", austritt: null, status: "aktiv", eintritt,
    zugehoerigkeit: [{ ab: null, einheitId: vorlage.zugehoerigkeit[0].einheitId }], rolleSeit: null });
  const tage = ["1990-01-01", "2020-06-15", "2025-12-31", "2026-01-15", heute, "2099-12-31"];

  it("A1-1 imDienst (Server, Zeiterfassung) ist für eintritt null und \"\" an jedem Tag false", () => {
    for (const e of [null, ""]) for (const d of tage) {
      expect(imDienst(ohne(e), d)).toBe(false);
      expect(imDienstZeit(ohne(e), d)).toBe(false);
    }
  });
  it("A1-2 Kontrolle: gesetzter Eintritt und Altbestand ohne Feld bleiben wie bisher", () => {
    expect(imDienst(ohne("2020-01-01"), "2026-01-15")).toBe(true);
    expect(imDienst(ohne("2020-01-01"), "2019-12-31")).toBe(false);
    const alt = ohne(null); delete alt.eintritt;
    expect(imDienst(alt, "2026-01-15")).toBe(true);
    expect(imDienstZeit(alt, "2026-01-15")).toBe(true);
  });
  it("A1-3 Kopie src/pruefung.jsx: imDienst behandelt null/leer gleich (Quelltext im Gleichlauf)", () => {
    const q = readFileSync(new URL("../src/pruefung.jsx", import.meta.url), "utf8");
    const i = q.indexOf("function imDienst(p, d)");
    expect(i).toBeGreaterThanOrEqual(0);
    expect(q.slice(i, i + 300)).toMatch(/p\.eintritt === null \|\| p\.eintritt === ""/);
  });
  it("A1-4 keine Soll-, Ist- oder Kontorechnung für die Person ohne Eintritt (offene Monate)", () => {
    const p = ohne(null);
    const m = { ...m0, personen: [...m0.personen, p] };
    for (const ym of ["2025-03", "2026-01"]) {
      expect(sollMonat(m, p, ym)).toBe(0);
      expect(sollStunden(m, p, ym)).toBe(0);
      const ist = istStunden(m, p, ym);
      expect(ist.gesamt).toBe(0);
      expect(ist.dienste).toBe(0);
    }
    expect(stundenkonto(m, p, "2026-01")).toBe(p.stundenuebertrag || 0);
  });
  it("A1-5 keine abschlussLuecke für vergangene, abgeschlossene Monate", () => {
    const mon = "2025-10";
    const m = { ...m0, monatsabschluss: { ...(m0.monatsabschluss || {}), [mon]: { abgeschlossen: true } } };
    const p = ohne(null);
    const mit = { ...m, personen: [...m.personen, p] };
    /* Kontrolle: dieselbe Person mit Eintritt ist im Altabschluss ohne Freeze ein Prüffall. */
    expect(abschlussLuecke(mit, ohne("2020-01-01"), mon)).toBe(true);
    expect(abschlussLuecke(mit, p, mon)).toBe(false);
    expect(abschlussLuecke(mit, ohne(""), mon)).toBe(false);
  });
  it("A1-6 Planrechnung: Person ohne Eintritt wird an keinem Tag eingeplant", () => {
    const mN = { ...m0, personen: [...m0.personen, ohne(null)] };
    const tageJan = Array.from({ length: 28 }, (_, i) => `2026-01-${String(i + 1).padStart(2, "0")}`);
    const n = tageJan.map((t) => Object.values(besetzung(mN, t))
      .reduce((s, x) => s + (x.personen || []).filter((q) => q.id === "p-ohne").length, 0));
    expect(n.every((x) => x === 0)).toBe(true);
  });
  it("A1-7 planungsreife: „Eintritt fehlt“ ist eigene Lücke als Hinweis mit Behebung, keine Blockade", () => {
    const person = (id, eintritt) => ({ id, status: "aktiv", eintritt, austritt: null, wochenstunden: 40,
      zugehoerigkeit: [{ ab: "2024-01-01", einheitId: "e1" }], qualifikationen: [] });
    const daten = {
      personen: [person("p1", "2024-01-01"), person("p2", "2024-01-01"), person("p3", null)],
      qualifikationen: [], abwesenheiten: [], freigaben: {}, vorgaben: [],
      dienstarten: [{ id: "F", start: "06:00", ende: "14:00", mindest: { mo_do: 1, fr: 1, sa: 1, so: 1 }, mindestQual: {} }],
    };
    const e = planungsreife(daten, { von: "2026-12-01", bis: "2026-12-31", heute: "2026-11-09" });
    expect(e.bereit).toBe(true);
    expect(e.urteil).toBe("bereit_mit_hinweisen");
    const l = e.luecken.find((x) => /Eintritt/.test(x.text));
    expect(l).toBeTruthy();
    expect(l.punkt).toBe("personal");
    expect(l.hinweis).toBe(true);
    expect(l.ids).toEqual(["p3"]);
    expect(l.behebung).toMatch(/Eintrittsdatum/);
    expect(e.punkte.find((x) => x.id === "personal").status).toBe("hinweis");
    /* Die Person ohne Eintritt zählt nicht als einsetzbar; ohne andere Personen bleibt es eine Blockade. */
    expect(e.zaehler.personen).toBe(2);
    const nur = planungsreife({ ...daten, personen: [person("p3", null)] }, { von: "2026-12-01", bis: "2026-12-31" });
    expect(nur.bereit).toBe(false);
    expect(nur.gruende).toContain("Im Planungszeitraum ist keine Person einsetzbar.");
  });
});

describe("Auflage 2 (PR #130): Eintritt bearbeiten (setzeEintritt über eintrittUebernehmen)", () => {
  const basis = (eintritt) => ({ ...m0, personen: m0.personen.map((p, i) => (i === 0 ? { ...p, eintritt } : p)) });
  const pid = m0.personen[0].id;
  const eintrittVon = (st) => st.m.personen.find((p) => p.id === pid).eintritt;
  it("A2-1 leeres Feld überschreibt kein bestehendes Datum", () => {
    for (const leer of ["", "  ", null]) {
      const { akt, st } = mitAktionen(aktionenPlan, basis("2019-05-01"));
      akt.setzeEintritt(pid, leer);
      expect(eintrittVon(st)).toBe("2019-05-01");
    }
  });
  it("A2-2 gültiges Datum wird übernommen (ISO und deutsch), auch wenn bisher null", () => {
    const a = mitAktionen(aktionenPlan, basis(null));
    a.akt.setzeEintritt(pid, "2024-03-01");
    expect(eintrittVon(a.st)).toBe("2024-03-01");
    const b = mitAktionen(aktionenPlan, basis("2019-05-01"));
    b.akt.setzeEintritt(pid, "01.02.2020");
    expect(eintrittVon(b.st)).toBe("2020-02-01");
  });
  it("A2-3 ungültiges Datum: Fehler gemeldet, Bestand unverändert", () => {
    const { akt, st } = mitAktionen(aktionenPlan, basis("2019-05-01"));
    akt.setzeEintritt(pid, "31.02.2020");
    expect(eintrittVon(st)).toBe("2019-05-01");
    expect(st.meldungen.join(" ")).toMatch(/Eintrittsdatum.*31\.02\.2020/);
  });
  it("A2-4 Bearbeiten-Formular (Personalakte) bindet das Feld Eintrittsdatum an setzeEintritt und eintrittUebernehmen", () => {
    const q = readFileSync(new URL("../src/ansichten/personalakte.jsx", import.meta.url), "utf8");
    expect(q).toMatch(/label="Eintrittsdatum"/);
    expect(q).toMatch(/akt\.setzeEintritt\(p\.id,/);
    expect(q).toMatch(/eintrittUebernehmen\(p,/);
  });
});

describe("Auflage 4 (PR #130): Einzelanlage ohne stille Vorbelegung", () => {
  const m = { ...m0, einstellungen: { ...m0.einstellungen, sollWochenstunden: 38.5 } };
  it("A4-1 Formularvorgabe: Eintritt leer (nicht heute), Funktion leer (nicht Fachkraft)", () => {
    const f = neuePersonFormular(m);
    expect(f.eintritt).toBe("");
    expect(f.eintritt).not.toBe(heute);
    expect(f.funktion).toBe("");
  });
  it("A4-2 Urlaub und Wochenstunden bleiben sichtbare Betriebsvorgaben", () => {
    const f = neuePersonFormular(m);
    expect(f.wochenstunden).toBe(38.5);
    expect(f.urlaubsanspruch).toBe(30);
  });
  it("A4-3 geleertes Datumsfeld speichert null, nicht \"\" (eintritt, zugehoerigkeit.ab)", () => {
    const { akt, st } = mitAktionen(aktionenPlan, m);
    akt.neuePerson({ ...neuePersonFormular(m), vorname: "Ida", nachname: "Neu", eintritt: "" });
    const p = st.m.personen[st.m.personen.length - 1];
    expect(p.nachname).toBe("Neu");
    expect(p.eintritt).toBeNull();
    expect(p.zugehoerigkeit[0].ab).toBeNull();
    expect(p.funktion).toBe("");
    expect(imDienst(p, heute)).toBe(false);
  });
  it("A4-4 gesetztes Datum wird gespeichert; ungültiges wird abgewiesen", () => {
    const a = mitAktionen(aktionenPlan, m);
    a.akt.neuePerson({ ...neuePersonFormular(m), vorname: "Ida", nachname: "Neu", eintritt: "2026-02-01" });
    const p = a.st.m.personen[a.st.m.personen.length - 1];
    expect(p.eintritt).toBe("2026-02-01");
    expect(p.zugehoerigkeit[0].ab).toBe("2026-02-01");
    const b = mitAktionen(aktionenPlan, m);
    b.akt.neuePerson({ ...neuePersonFormular(m), vorname: "Ida", nachname: "Neu", eintritt: "2026-02-30" });
    expect(b.st.m.personen).toHaveLength(m.personen.length);
    expect(b.st.meldungen.join(" ")).toMatch(/Eintrittsdatum/);
  });
});
