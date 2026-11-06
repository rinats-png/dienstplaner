/* ==========================================================================
   MODUL ROTATION — geplanter Wechsel zwischen Einheiten (WP-19, Strang B)

   Vorläufig nach der Entscheidungsmatrix: Einsatz und Zugehörigkeitswechsel
   getrennt und zeitlich nachvollziehbar (X2 a), kein Umbuchen durch einen
   Dienstplaneintrag (X2), Überschneidungen als Hinweis, Ziele als Checkliste
   (X3 b). Das Modul bleibt „geplant“; der Positivkatalog ist fail-closed.
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ROTATION_ARTEN, pruefeRotationEintrag, rotationZusammen, einheitAm, rotationUeberschneidungen, rotationZiele, rotationBefunde, rotationListe,
} from "../server/lib/modul-rotation.mjs";
import { BRANCHENMODULE, modulVon, pruefeModulRegistry, pruefeModulStatus } from "../server/lib/branchenmodule.mjs";
import { REGELN_BRANCHEN, pruefeBranchenkatalog } from "../server/lib/branchenkatalog.mjs";
import { BETRIEB } from "../server/lib/sicht.mjs";
import { pruefeRegister } from "../src/regelregister.js";
import { RotationUebersicht } from "../src/module/rotation.jsx";

const EINHEITEN = [{ id: "ch", name: "Chirurgie" }, { id: "in", name: "Innere" }, { id: "nt", name: "Notaufnahme" }];
const K = (liste) => Object.fromEntries(liste.map((e) => [`${e.id}|${e.von}`, e]));
const EIN = (extra = {}) => ({ id: "r1", personId: "pers-anna", art: "einsatz", einheitId: "in", von: "2026-11-02", bis: "2026-11-10", ...extra });
const ZUG = (extra = {}) => ({ id: "z1", personId: "pers-anna", art: "zugehoerigkeit", einheitId: "ch", von: "2026-01-01", bis: null, ...extra });
const AKTIV = BRANCHENMODULE.map((x) => (x.id === "rotation" ? { ...x, status: "vorlaeufig" } : x));
const betrieb = ({ an = true, rot = [] } = {}) => ({
  id: "b1", pakete: ["klinik"], einheiten: EINHEITEN, rotationen: K(rot),
  einstellungen: { branchenmodule: an ? { rotation: { an: true } } : {} },
});

describe("Registry, Katalog und Felder", () => {
  it("Modul „geplant“, Klinik, Personenfeld, Regel; Registry stimmig", () => {
    expect(modulVon("rotation")).toMatchObject({ pakete: ["klinik"], status: "geplant", datenfelder: ["rotationen"], personenfelder: ["rotationen"],
      regelIds: ["ROTATION-UEBERSCHNEIDUNG-01"] });
    expect(pruefeModulRegistry()).toEqual([]);
    expect(pruefeBranchenkatalog()).toEqual([]);
    expect(pruefeRegister()).toEqual([]);
    expect(REGELN_BRANCHEN.find((r) => r.id === "ROTATION-UEBERSCHNEIDUNG-01")).toMatchObject({ modul: "rotation", hoechsteStufe: "hinweis" });
  });
  it("Feld im Positivkatalog, fail-closed; Datenschutzgate verlangt Ausnahmeweg und Schema", () => {
    expect(BETRIEB.rotationen[1]).toBe("weg");
    expect(BETRIEB.rotationen[0].art).toBe("reduziert");
    const abgenommen = { ...modulVon("rotation"), status: "vorlaeufig", abnahme: { datum: "2026-12-01", nachweis: "docs/acc45/x.md" } };
    expect(pruefeModulStatus([abgenommen])).toEqual([]);
    expect(pruefeModulStatus([{ ...abgenommen, berichtigungsWerte: undefined }]).join()).toMatch(/Wertschema/);
  });
});

describe("Einträge prüfen (X2 a, X3 b)", () => {
  const o = { einheiten: EINHEITEN };
  it("Einsatz braucht Ende, Zugehörigkeit darf offen sein, Ziel hat kein Ende", () => {
    expect(pruefeRotationEintrag(EIN(), o)).toBeNull();
    expect(pruefeRotationEintrag(ZUG(), o)).toBeNull();
    expect(pruefeRotationEintrag(EIN({ bis: null }), o)).toMatch(/braucht ein Ende/);
    expect(pruefeRotationEintrag({ id: "z2", personId: "pers-anna", art: "ziel", einheitId: "nt", von: "2026-11-02", pflicht: true }, o)).toBeNull();
    expect(pruefeRotationEintrag({ id: "z2", personId: "pers-anna", art: "ziel", einheitId: "nt", von: "2026-11-02", bis: "2026-12-01" }, o)).toMatch(/kein Ende/);
  });
  it("Art, Einheit, Datum, Reihenfolge und Felder werden geprüft", () => {
    expect(pruefeRotationEintrag(EIN({ art: "schicht" }), o)).toMatch(/Art/);
    expect(pruefeRotationEintrag(EIN({ einheitId: "gibtsnicht" }), o)).toMatch(/Einheit unbekannt/);
    expect(pruefeRotationEintrag(EIN({ von: "2026-02-31" }), o)).toMatch(/Beginn/);
    expect(pruefeRotationEintrag(EIN({ bis: "2026-11-01" }), o)).toMatch(/vor dem Beginn/);
    expect(pruefeRotationEintrag(EIN({ pflicht: true }), o)).toMatch(/nur für Ziele/);
    expect(pruefeRotationEintrag(EIN({ geheim: 1 }), o)).toMatch(/unbekannte Felder/);
    expect(ROTATION_ARTEN).toEqual(["einsatz", "zugehoerigkeit", "ziel"]);
  });
  it("Schreibweg: Schlüssel passt zu Kennung und Beginn", () => {
    expect(rotationZusammen({ einheiten: EINHEITEN, rotationen: K([EIN()]) })).toEqual({});
    expect(rotationZusammen({ einheiten: EINHEITEN, rotationen: { "x|2026-11-02": EIN() } }).grund).toMatch(/Schlüssel/);
    expect(rotationZusammen({ einheiten: EINHEITEN, rotationen: [EIN()] }).grund).toMatch(/erwartet/);
    expect(rotationZusammen({})).toEqual({});
  });
});

describe("Zugehörigkeit und Einsatz am Tag (X2)", () => {
  const W = K([ZUG(), EIN()]);
  it("ein Einsatz geht vor der Zugehörigkeit, solange er läuft; danach gilt die Zugehörigkeit", () => {
    expect(einheitAm(W, "pers-anna", "2026-11-05")).toBe("in");
    expect(einheitAm(W, "pers-anna", "2026-11-11")).toBe("ch");
    expect(einheitAm(W, "pers-anna", "2025-12-31")).toBeNull();
  });
  it("eine Zugehörigkeit ändert sich nur durch einen eigenen Eintrag, nicht durch den Einsatz", () => {
    const vorher = JSON.stringify(W);
    einheitAm(W, "pers-anna", "2026-11-05");
    expect(JSON.stringify(W)).toBe(vorher);
    const neuZug = K([ZUG({ bis: "2026-11-03" }), ZUG({ id: "z2", einheitId: "nt", von: "2026-11-04", bis: null })]);
    expect(einheitAm(neuZug, "pers-anna", "2026-11-04")).toBe("nt");
    expect(einheitAm(neuZug, "pers-anna", "2026-11-03")).toBe("ch");
  });
  it("für eine andere Person ist die Zuordnung leer", () => {
    expect(einheitAm(W, "pers-ben", "2026-11-05")).toBeNull();
  });
});

describe("Überschneidungen (X2): Hinweis, kein stiller Eingriff", () => {
  it("zwei Einsätze derselben Person am selben Tag werden gemeldet, andere nicht", () => {
    const W = K([EIN(), EIN({ id: "r2", einheitId: "nt", von: "2026-11-08", bis: "2026-11-12" }), EIN({ id: "r3", personId: "pers-ben", einheitId: "nt" })]);
    const u = rotationUeberschneidungen(W);
    expect(u).toEqual([{ personId: "pers-anna", datum: "2026-11-08", einheiten: ["in", "nt"] }]);
  });
  it("nebeneinander ohne Tagesüberlappung: keine Meldung", () => {
    const W = K([EIN({ bis: "2026-11-05" }), EIN({ id: "r2", einheitId: "nt", von: "2026-11-06", bis: "2026-11-10" })]);
    expect(rotationUeberschneidungen(W)).toEqual([]);
  });
  it("Befund über die Registry: Hinweis, sperrt nicht, nennt keine Person", () => {
    const m = betrieb({ rot: [EIN(), EIN({ id: "r2", einheitId: "nt", von: "2026-11-08", bis: "2026-11-12" })] });
    const b = rotationBefunde(m, { module: AKTIV });
    expect(b).toHaveLength(1);
    expect(b[0]).toMatchObject({ regelId: "ROTATION-UEBERSCHNEIDUNG-01", stufe: "hinweis", art: "branche" });
    expect(JSON.stringify(b)).not.toMatch(/pers-anna/);
    expect(rotationBefunde(betrieb({ an: false, rot: [EIN(), EIN({ id: "r2", einheitId: "nt" })] }))).toEqual([]);
  });
});

describe("Ziele als Checkliste (X3 b)", () => {
  it("Ziel gilt als erfüllt, wenn ein abgeschlossener Einsatz in der Einheit liegt", () => {
    const W = K([EIN({ einheitId: "nt", von: "2026-01-05", bis: "2026-02-10" }),
      { id: "z1", personId: "pers-anna", art: "ziel", einheitId: "nt", von: "2026-01-01", pflicht: true },
      { id: "z2", personId: "pers-anna", art: "ziel", einheitId: "ch", von: "2026-01-01" }]);
    const z = rotationZiele(W, "pers-anna", "2026-11-06");
    expect(z).toEqual([
      { id: "z1", einheitId: "nt", pflicht: true, erfuellt: true },
      { id: "z2", einheitId: "ch", pflicht: true, erfuellt: false },
    ]);
  });
  it("ein laufender Einsatz erfüllt noch kein Ziel", () => {
    const W = K([EIN({ einheitId: "nt", von: "2026-11-01", bis: "2026-11-30" }),
      { id: "z1", personId: "pers-anna", art: "ziel", einheitId: "nt", von: "2026-10-01" }]);
    expect(rotationZiele(W, "pers-anna", "2026-11-06")[0].erfuellt).toBe(false);
  });
  it("Liste ist leer ohne Ziele; Ziele zählen nicht als Einsatz oder Überschneidung", () => {
    expect(rotationZiele(K([]), "pers-anna", "2026-11-06")).toEqual([]);
    expect(rotationListe(K([{ id: "z1", personId: "pers-anna", art: "ziel", einheitId: "nt", von: "2026-10-01" }])).length).toBe(1);
    expect(rotationUeberschneidungen(K([{ id: "z1", personId: "pers-anna", art: "ziel", einheitId: "nt", von: "2026-10-01" }]))).toEqual([]);
  });
});

describe("Darstellung", () => {
  const m = { einheiten: EINHEITEN, rotationen: K([ZUG(), EIN(), EIN({ id: "r2", einheitId: "nt", von: "2026-11-08", bis: "2026-11-12" }),
    { id: "z1", personId: "pers-anna", art: "ziel", einheitId: "nt", von: "2026-10-01", pflicht: true }]) };
  it("zeigt Einheit am Tag, Überschneidung als Hinweis und Ziel-Stand, ohne Kennungen", () => {
    const html = renderToStaticMarkup(h(RotationUebersicht, { m, datum: "2026-11-05", heute: "2026-11-06", personen: { "pers-anna": "Anna" } }));
    expect(html).toMatch(/Anna/);
    expect(html).toMatch(/eingesetzt in Innere/);
    expect(html).toMatch(/Überschneidung/);
    expect(html).toMatch(/Notaufnahme \(Pflicht\): offen/);
    expect(html).not.toMatch(/pers-anna/);
  });
  it("ohne Rotation: Leerhinweis", () => {
    expect(renderToStaticMarkup(h(RotationUebersicht, { m: {}, datum: "2026-11-05", heute: "2026-11-06" }))).toMatch(/Noch keine Rotation/);
  });
});
