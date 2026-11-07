/* ==========================================================================
   ART.-9-KATALOG (T-11, L-16, R-03)

   Jedes in ART9_FELDER (server/lib/sicht.mjs) markierte Feld einer FREMDEN
   Person fehlt in den Sichten von Beschäftigten, Betriebsrat, Betreiber und
   Schichtverantwortung ohne Bereichsbezug. Für den eigenen Bereich der
   Schichtverantwortung gilt nur die dokumentierte Ausnahme (Kategorie
   „krank“ ohne Anmerkung). Prüft die bestehende Sichtlogik, baut sie nicht um.
   ========================================================================== */

import { describe, it, expect } from "vitest";
import { bestandFuerRolle } from "../server/lib/rechte.mjs";
import { ART9_FELDER, ABWESENHEITSARTEN_SV } from "../server/lib/sicht.mjs";

const tagPlus = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const MARKE = (f) => `MK-ART9-${f}`;

/** Ein Wert je markiertem Feld — Texte mit Marke, damit auch Umbenennungen auffallen. */
function setzen(ziel, pfad, wert) {
  const teile = pfad.split(".");
  let o = ziel;
  for (const t of teile.slice(0, -1)) o = o[t] = o[t] && typeof o[t] === "object" ? o[t] : {};
  o[teile.at(-1)] = wert;
}
function holen(o, pfad) {
  return pfad.split(".").reduce((x, t) => (x && typeof x === "object" && Object.prototype.hasOwnProperty.call(x, t) ? x[t] : undefined), o);
}
const sensibel = () => {
  const p = {};
  for (const { feld } of ART9_FELDER.person) {
    const wert = feld === "mutterschutz" || feld === "schwerbehindert" || feld === "einschraenkungen.keineNacht" ? true
      : feld === "einschraenkungen.wiedereingliederung" ? { von: tagPlus(-5), bis: tagPlus(40), maxStundenWoche: 17, grund: MARKE(feld) }
        : feld === "mutterschutzEinwilligungen" ? [{ art: "nacht", text: MARKE(feld) }]
          : MARKE(feld);
    setzen(p, feld, wert);
  }
  return p;
};
const person = (id, rolle, einheit, extra = {}) => ({ id, vorname: `V${id}`, nachname: `N${id}`, rolle, bereich: einheit,
  status: "aktiv", zugehoerigkeit: [{ ab: "2020-01-01", einheitId: einheit }], ...extra });
const abw = (id, personId, art) => {
  const a = { id, personId, art, von: tagPlus(-2), bis: tagPlus(2) };
  for (const { feld } of ART9_FELDER.abwesenheit) a[feld] = MARKE(`abw-${feld}-${id}`);
  return a;
};
const ARTEN = ART9_FELDER.abwesenheitsarten.map((x) => x.art);

/* x und y: fremde Personen (Einheit e2) mit allen markierten Feldern; b: im Bereich der SV (e1). */
const bestand = () => ({
  version: 9, stand: 1, session: null,
  mandanten: [{
    id: "m1", name: "Haus", einheiten: [{ id: "e1" }, { id: "e2" }],
    dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00", pause: 30 }],
    personen: [person("s1", "subplaner", "e1"), person("ma", "mitarbeiter", "e1"), person("r1", "betriebsrat", "e1"),
      person("x", "mitarbeiter", "e2", sensibel()), person("b", "mitarbeiter", "e1", sensibel()),
      person("pl", "planer", "e1"), person("l1", "leitung", "e1")],
    abwesenheiten: [...ARTEN.map((art, i) => abw(`x${i}`, "x", art)), ...ARTEN.map((art, i) => abw(`b${i}`, "b", art))],
    abweichungen: {}, aenderungen: [], nachrichten: [], anfragen: [],
  }],
});

const ROLLEN = {
  Mitarbeiter: { rolle: "mitarbeiter", person: "ma", betrieb: 0 },
  Betriebsrat: { rolle: "betriebsrat", person: "r1", betrieb: 0 },
  Betreiber: { rolle: "betreiber", person: null, betrieb: 0 },
  Schichtverantwortung: { rolle: "subplaner", person: "s1", betrieb: 0 },
};
const sicht = (s) => {
  const aus = bestandFuerRolle(bestand(), s);
  return aus && Array.isArray(aus.mandanten) ? aus.mandanten[0] || {} : {};
};

describe("Katalog ART9_FELDER", () => {
  it("ist vollständig belegt und eingefroren", () => {
    expect(Object.isFrozen(ART9_FELDER)).toBe(true);
    expect(ART9_FELDER.person.length).toBeGreaterThan(0);
    for (const e of [...ART9_FELDER.person, ...ART9_FELDER.abwesenheit])
      expect(["gesundheit", "schwangerschaft", "freitext"], e.feld).toContain(e.kategorie);
    /* Die Ausnahme der SV ist eine Teilmenge der Arten, die die SV im Klartext sieht. */
    for (const a of ART9_FELDER.ausnahmeSchichtBereich) expect(ABWESENHEITSARTEN_SV).toContain(a);
  });
});

for (const [name, s] of Object.entries(ROLLEN)) {
  describe(`${name}: fremde Person ohne Art.-9-nahe Felder`, () => {
    const m = sicht(s);
    const x = (m.personen || []).find((p) => p && p.id === "x");
    it("die fremde Person ist überhaupt in der Sicht (sonst wäre die Prüfung leer)", () => {
      if (name === "Betreiber") return;                                  // Betreiber: Gerüst, Personen ggf. reduziert
      expect(x, name).toBeDefined();
      expect((m.abwesenheiten || []).filter((a) => a && a.personId === "x").length, name).toBe(ARTEN.length);
    });
    it("kein markiertes Personenfeld", () => {
      for (const { feld } of ART9_FELDER.person) expect(holen(x, feld), `${name}: ${feld}`).toBeUndefined();
    });
    it("keine Abwesenheits-Freitexte und keine verräterische Art", () => {
      for (const a of (m.abwesenheiten || []).filter((a) => a && a.personId === "x")) {
        for (const { feld } of ART9_FELDER.abwesenheit) expect(a[feld], `${name}: abwesenheit.${feld}`).toBeUndefined();
        expect(ARTEN, `${name}: art ${a.art}`).not.toContain(a.art);
      }
    });
    it("keine Marke irgendwo in der Antwort", () => {
      const text = JSON.stringify(bestandFuerRolle(bestand(), s));
      for (const { feld } of ART9_FELDER.person) expect(text, `${name}: ${feld}`).not.toContain(MARKE(feld));
      expect(text).not.toMatch(/MK-ART9-abw-[a-z]+-x/);
    });
  });
}

describe("Schichtverantwortung, eigener Bereich: nur die dokumentierte Ausnahme", () => {
  const m = sicht(ROLLEN.Schichtverantwortung);
  const b = (m.personen || []).find((p) => p && p.id === "b");
  it("Person im Bereich: keine markierten Rohfelder (nur neutrale planungsregeln)", () => {
    expect(b && b.sichtbereich).toBe("bereich");
    for (const { feld } of ART9_FELDER.person) expect(holen(b, feld), feld).toBeUndefined();
  });
  it("Abwesenheiten im Bereich: keine Freitexte; sichtbare Art nur aus der Ausnahme", () => {
    const eigene = (m.abwesenheiten || []).filter((a) => a && a.personId === "b");
    expect(eigene.length).toBe(ARTEN.length);
    for (const a of eigene) {
      for (const { feld } of ART9_FELDER.abwesenheit) expect(a[feld], `abwesenheit.${feld}`).toBeUndefined();
      if (ARTEN.includes(a.art)) expect(ART9_FELDER.ausnahmeSchichtBereich, a.art).toContain(a.art);
    }
  });
});
