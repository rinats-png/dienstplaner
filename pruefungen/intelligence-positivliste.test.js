/* ==========================================================================
   INTELLIGENCE — POSITIVLISTEN-REGISTRY (WP-I11)

   Die Positivliste je Funktion und der Feldkatalog sind Sicherheitsgrenzen.
   Dieser Test hält beide als ABDRUCK fest: Jede Änderung (neues Feld, neue
   Rolle, Freitext erlaubt, Personenbezug) macht ihn rot und muss hier im
   Code-Review sichtbar mitgeändert werden. Dazu Vollständigkeit und die
   festen Grenzen (Betriebsrat und Betreiber nie, Beschäftigte nur F9,
   Schichtverantwortung Default nein, kein Freitext ohne Zulassung).
   ========================================================================== */

import { describe, it, expect } from "vitest";
import { FELDER, FELDNAMEN } from "../server/lib/intelligence/felder.mjs";
import { FUNKTIONEN, POSITIVLISTE_VERSION, NIE_AUSLOESEN, ROLLEN_ERLAUBT, funktionEintrag, rolleDarf, feldErlaubt }
  from "../server/lib/intelligence/positivliste.mjs";
import { FUNKTIONEN_IDS, FAKT_ARTEN, EINHEITEN } from "../server/lib/intelligence/schemas.mjs";
import { BEKANNTE_ROLLEN } from "../server/lib/rechte.mjs";

/* ---- ABDRUCK: bei jeder gewollten Änderung hier mitändern (Code-Review) ---- */
const P = ["leitung", "planer"];
const DA = ["dienstart.beginn", "dienstart.ende", "dienstart.dauer"];
const BEF = ["befund.regel", "befund.stufe"];
const BES = ["besetzung.ist", "besetzung.soll"];
const ABDRUCK = {
  version: "1.0",
  funktionen: {
    F1: { rollen: P, personenbezug: true, fremdtext: false, felder: ["schicht.dienst", "schicht.frei", ...DA, "person.vorhanden",
      "person.einheit", "person.qualifikation", "person.wochenstunden", "abwesenheit.zeitraum", "einheit.vorhanden", ...BEF] },
    F2: { rollen: P, personenbezug: true, fremdtext: false, felder: [...BEF, "schicht.dienst", ...DA, "person.vorhanden",
      "ruhezeit.ist", "konto.saldo"] },
    F3: { rollen: P, personenbezug: true, fremdtext: false, felder: ["schicht.dienst", "schicht.frei", ...DA, "person.vorhanden",
      "person.einheit", "person.qualifikation", "person.wochenstunden", "person.teilzeit", "person.springer",
      "person.schichtdienst", "abwesenheit.zeitraum", "einheit.vorhanden", "einheit.pool", ...BEF, "kandidat.zulaessig",
      "kandidat.spielraum", "kandidat.hinderung", "konto.saldo", "ruhezeit.ist"] },
    F4: { rollen: ["leitung"], personenbezug: false, fremdtext: false, felder: ["kennzahl.wert", ...BES, "befund.stufe", "einheit.vorhanden"] },
    F5: { rollen: P, personenbezug: false, fremdtext: true, felder: [] },
    F6: { rollen: P, personenbezug: false, fremdtext: true, felder: ["kennzahl.wert"] },
    F7A: { rollen: P, personenbezug: false, fremdtext: true, felder: [...DA, "qualifikation.vorhanden"] },
    F8: { rollen: P, personenbezug: false, fremdtext: false, felder: [...DA, "zyklus.tag", "kennzahl.wert", "einheit.vorhanden"] },
    F9: { rollen: ["leitung", "planer", "mitarbeiter"], personenbezug: false, fremdtext: true, felder: [] },
    F10: { rollen: P, personenbezug: false, fremdtext: false, felder: ["kennzahl.wert", ...BES, "einheit.vorhanden", "einheit.pool"] },
    F11: { rollen: P, personenbezug: false, fremdtext: false, felder: ["kennzahl.wert", ...BES, ...BEF, "einheit.vorhanden"] },
    F12: { rollen: P, personenbezug: true, fremdtext: false, felder: ["konto.saldo", ...BEF, "schicht.dienst", "person.vorhanden", "kennzahl.wert"] },
    F13: { rollen: P, personenbezug: true, fremdtext: false, felder: ["schicht.dienst", "schicht.frei", ...DA, "person.vorhanden",
      "person.einheit", "person.qualifikation", "person.wochenstunden", "person.teilzeit", "abwesenheit.zeitraum", ...BEF,
      "kennzahl.wert", "einheit.vorhanden", "einheit.pool"] },
    F14: { rollen: P, personenbezug: true, fremdtext: false, felder: ["kennzahl.wert", ...BEF, "schicht.dienst", ...BES, "person.vorhanden"] },
    F15: { rollen: P, personenbezug: true, fremdtext: false, felder: ["aenderung.art", "person.vorhanden", "dienstart.beginn", "dienstart.ende"] },
    F16: { rollen: P, personenbezug: false, fremdtext: true, felder: ["regel.art", "dienstart.beginn", "dienstart.ende", "qualifikation.vorhanden"] },
    F17: { rollen: P, personenbezug: false, fremdtext: false, felder: [...BEF, "regel.art", "kennzahl.wert"] },
    F18: { rollen: P, personenbezug: false, fremdtext: false, felder: ["kennzahl.wert", ...BEF, ...BES, ...DA] },
  },
  felder: {
    "dienstart.beginn": "zeit/sache/sicht", "dienstart.ende": "zeit/sache/sicht", "dienstart.dauer": "zahl/sache/sicht/min",
    "zyklus.tag": "kennung/sache/sicht", "qualifikation.vorhanden": "wahr/sache/sicht",
    "einheit.vorhanden": "wahr/einheit/sicht", "einheit.pool": "wahr/einheit/sicht",
    "person.vorhanden": "wahr/person/sicht", "person.einheit": "wahr/person/sicht", "person.wochenstunden": "zahl/person/sicht/h",
    "person.teilzeit": "wahr/person/sicht", "person.springer": "wahr/person/sicht", "person.schichtdienst": "wahr/person/sicht",
    "person.qualifikation": "kennung/person/sicht", "schicht.dienst": "kennung/person/sicht", "schicht.frei": "wahr/person/sicht",
    "abwesenheit.zeitraum": "zustand/person/sicht",
    "befund.regel": "kennung/sache/berechnet/personOptional", "befund.stufe": "zustand/sache/berechnet/personOptional",
    "kandidat.zulaessig": "wahr/person/berechnet", "kandidat.spielraum": "zahl/person/berechnet/min",
    "kandidat.hinderung": "kennung/person/berechnet", "konto.saldo": "zahl/person/berechnet/h",
    "ruhezeit.ist": "zahl/person/berechnet/min", "aenderung.art": "zustand/person/berechnet",
    "besetzung.ist": "zahl/einheit/berechnet/personen", "besetzung.soll": "zahl/einheit/berechnet/personen",
    "kennzahl.wert": "zahl/sache/berechnet", "regel.art": "kennung/sache/berechnet",
  },
};

const abdruckIst = () => ({
  version: POSITIVLISTE_VERSION,
  funktionen: Object.fromEntries(Object.entries(FUNKTIONEN).map(([k, e]) =>
    [k, { rollen: [...e.rollen], personenbezug: e.personenbezug, fremdtext: e.fremdtext, felder: [...e.felder] }])),
  felder: Object.fromEntries(Object.entries(FELDER).map(([k, d]) =>
    [k, [d.art, d.subjekt, d.herkunft, d.einheit, d.personOptional ? "personOptional" : undefined].filter(Boolean).join("/")])),
});

describe("Abdruck der Positivliste (Änderung nur per Code-Review)", () => {
  it("Registry und Feldkatalog entsprechen genau dem Abdruck", () => {
    expect(abdruckIst()).toEqual(ABDRUCK);
  });
});

describe("Vollständigkeit der Registry", () => {
  it("jede Funktion des Vertrags hat einen Eintrag, und es gibt keinen weiteren", () => {
    expect(Object.keys(FUNKTIONEN).sort()).toEqual([...FUNKTIONEN_IDS].sort());
  });
  it("jeder Eintrag hat Name, Zweck, Klasse, Rollen, Felder", () => {
    for (const [k, e] of Object.entries(FUNKTIONEN)) {
      expect(e.name.length, k).toBeGreaterThan(3);
      expect(e.zweck.length, k).toBeGreaterThan(10);
      expect(["A", "B", "C", "D"], k).toContain(e.klasse);
      expect(e.rollen.length, k).toBeGreaterThan(0);
      expect(new Set(e.felder).size, `${k}: doppelte Felder`).toBe(e.felder.length);
    }
  });
  it("jedes Feld einer Funktion steht im Katalog; jedes Katalogfeld wird von mindestens einer Funktion benutzt", () => {
    const benutzt = new Set();
    for (const [k, e] of Object.entries(FUNKTIONEN)) for (const f of e.felder) {
      expect(FELDNAMEN, `${k}: ${f}`).toContain(f);
      benutzt.add(f);
    }
    expect(FELDNAMEN.filter((f) => !benutzt.has(f))).toEqual([]);
  });
  it("jedes Katalogfeld: gültige Art, Einheit nur bei Zahlen, Herkunft und Subjekt bekannt, Zweck genannt", () => {
    for (const [f, d] of Object.entries(FELDER)) {
      expect(FAKT_ARTEN, f).toContain(d.art);
      if (d.einheit !== undefined) { expect(d.art, f).toBe("zahl"); expect(EINHEITEN, f).toContain(d.einheit); }
      expect(["sicht", "berechnet"], f).toContain(d.herkunft);
      expect(["person", "einheit", "objekt", "sache"], f).toContain(d.subjekt);
      expect(d.zweck.length, f).toBeGreaterThan(5);
      expect(f, f).toMatch(/^[a-z]+\.[a-z]+$/);
    }
  });
  it("Registry und Katalog sind tief eingefroren", () => {
    expect(Object.isFrozen(FUNKTIONEN)).toBe(true);
    expect(Object.isFrozen(FUNKTIONEN.F3)).toBe(true);
    expect(Object.isFrozen(FUNKTIONEN.F3.felder)).toBe(true);
    expect(Object.isFrozen(FUNKTIONEN.F3.rollen)).toBe(true);
    expect(Object.isFrozen(FELDER["person.wochenstunden"])).toBe(true);
    expect(() => { "use strict"; /** @type {any} */ (FUNKTIONEN.F3.felder).push("person.email"); }).toThrow();
  });
});

describe("Feste Grenzen der Registry", () => {
  it("kein Feldname benennt ein verbotenes Merkmal", () => {
    const verboten = /name|vorname|kuerzel|email|mail|telefon|mobil|anschrift|adresse|geburt|personalnummer|iban|notiz|grund|anmerkung|text|kommentar|krank|diagnose|mutterschutz|schwanger|schwerbehind|einschraenk|planungsregel|einwilligung|alter|jugend|minderj|stempel|ist\.|erfassung|geo|koordinate|standort|token|code|push|kalender|lohn|gehalt|vertrag|austritt|eintritt/i;
    for (const f of FELDNAMEN) expect(f, f).not.toMatch(verboten);
  });
  it("Betriebsrat, Betreiber, Schichtverantwortung und Kundenrolle lösen keine Funktion aus", () => {
    for (const e of Object.values(FUNKTIONEN))
      for (const r of ["betriebsrat", "betreiber", "subplaner", "kunde"]) {
        expect(e.rollen).not.toContain(r);
        expect(rolleDarf(e, r)).toBe(false);
      }
    expect(NIE_AUSLOESEN).toEqual(["betriebsrat", "betreiber"]);
  });
  it("alle genannten Rollen gibt es im Rollenmodell; nur Leitung, Planung, Beschäftigte kommen vor", () => {
    for (const r of ROLLEN_ERLAUBT) expect(BEKANNTE_ROLLEN).toContain(r);
    for (const e of Object.values(FUNKTIONEN)) for (const r of e.rollen) expect(ROLLEN_ERLAUBT).toContain(r);
  });
  it("Beschäftigte nur F9, und F9 trägt keine Betriebsdaten", () => {
    const mit = Object.entries(FUNKTIONEN).filter(([, e]) => e.rollen.includes("mitarbeiter")).map(([k]) => k);
    expect(mit).toEqual(["F9"]);
    expect(FUNKTIONEN.F9.felder).toEqual([]);
  });
  it("ohne Personenbezug keine Felder, die immer eine Person tragen", () => {
    for (const [k, e] of Object.entries(FUNKTIONEN)) if (!e.personenbezug)
      for (const f of e.felder) expect(FELDER[f].subjekt, `${k}: ${f}`).not.toBe("person");
  });
  it("Freitext nur dort, wo die Funktion ohne Eingabe der Nutzerin nicht arbeitet", () => {
    expect(Object.entries(FUNKTIONEN).filter(([, e]) => e.fremdtext).map(([k]) => k).sort()).toEqual(["F16", "F5", "F6", "F7A", "F9"]);
  });
  it("Default verweigern: unbekannte Funktionen und Prototyp-Namen haben keinen Eintrag", () => {
    for (const f of ["F7B", "F19", "f3", "", "__proto__", "constructor", "toString", "hasOwnProperty", null, undefined, 3, {}])
      expect(funktionEintrag(f), String(f)).toBeNull();
    expect(rolleDarf(null, "leitung")).toBe(false);
    expect(rolleDarf(FUNKTIONEN.F3, undefined)).toBe(false);
    expect(feldErlaubt(FUNKTIONEN.F3, "person.email")).toBe(false);
    expect(feldErlaubt(FUNKTIONEN.F3, "__proto__")).toBe(false);
    expect(feldErlaubt(FUNKTIONEN.F4, "person.wochenstunden")).toBe(false);
  });
});
