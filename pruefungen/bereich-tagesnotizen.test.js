/* ==========================================================================
   TAGESNOTIZEN — Einheitsbezug (Commit C3)

   Bis Commit C3 bekam die Schichtverantwortung alle Tagesnotizen des
   Betriebs (notizen["tag|…"]) und das tote Feld `tagesnotizen`; schreiben
   durfte sie keine (403), obwohl ihre Oberfläche es anbot. Die Rückfüllung
   kannte keine Listen je Schlüssel: Mit einer gekürzten Tagesliste wären
   verborgene Notizen desselben Tages verloren gegangen.

   Jetzt trägt jeder Eintrag `einheitId` (bekannte Einheit oder null) und
   `vonId`. Die Schichtverantwortung sieht und schreibt nur ihre eigene
   Einheit; fremde, Pool-, null- und Altbestand-Notizen bleiben ihr
   verborgen. `tagesnotizen` geht ihr nicht hinaus. Planung und Leitung
   arbeiten betriebsweit.
   ========================================================================== */

import { describe, it, expect } from "vitest";
import { bestandFuerRolle, zusammenfuehren, schichtRueckfuellen } from "../server/lib/rechte.mjs";

const D = "tag|2026-10-15", D2 = "tag|2026-10-16", D3 = "tag|2026-10-17";
const person = (id, rolle, einheit) => ({ id, vorname: `V${id}`, nachname: `N${id}`, rolle, bereich: einheit,
  zugehoerigkeit: einheit === "ALLE" ? [] : [{ ab: "2020-01-01", einheitId: einheit }] });
const notiz = (id, einheitId, vonId = "pl") => ({ id, text: `NZ-${id}`, von: "Planung", vonId, zeit: "x",
  ...(einheitId === undefined ? {} : { einheitId }) });
const bestand = (ich = person("s1", "subplaner", "eA")) => ({
  version: 9, stand: 1, session: null,
  mandanten: [{
    id: "m1", name: "Haus", einheiten: [{ id: "eA", name: "A" }, { id: "eB", name: "B" }, { id: "ePool", name: "Pool", pool: true }],
    dienstarten: [{ id: "F" }],
    personen: [ich, person("a1", "mitarbeiter", "eA"), person("b1", "mitarbeiter", "eB"),
      person("pl", "planer", "ALLE"), person("l1", "leitung", "ALLE"), person("r1", "betriebsrat", "ALLE")],
    abweichungen: {}, aenderungen: [], nachrichten: [], anfragen: [],
    notizen: {
      [D]: [notiz("n-A", "eA", "s1"), notiz("n-A2", "eA", "pl"), notiz("n-B", "eB"), notiz("n-P", "ePool"), notiz("n-N", null), notiz("n-L", undefined)],
      [D2]: [notiz("n-B2", "eB")],
      "person|b1": [{ id: "pn", text: "PERSONENNOTIZ", von: "Leitung", zeit: "x" }],
    },
    tagesnotizen: { "2026-10-15": "MK-TOTFELD" },
  }],
});
const SUB = { rolle: "subplaner", person: "s1", betrieb: 0 };
const MA = { rolle: "mitarbeiter", person: "a1", betrieb: 0 };
const BR = { rolle: "betriebsrat", person: "r1", betrieb: 0 };
const PL = { rolle: "planer", person: "pl", betrieb: 0 };
const LT = { rolle: "leitung", person: "l1", betrieb: 0 };

const sicht = (s, g = bestand()) => bestandFuerRolle(g, s).mandanten[0];
const ids = (l) => (l || []).map((e) => e.id);
function schreibe(s, aendern, g = bestand()) {
  const gelesen = JSON.parse(JSON.stringify(bestandFuerRolle(g, s)));
  aendern(gelesen.mandanten[0]);
  const e = zusammenfuehren(g, gelesen, s);
  return { g, e, m: e && e.mandanten ? e.mandanten[0] : null };
}
const roh = () => bestand().mandanten[0];
const neu = (id, extra = {}) => ({ id, text: `NEU-${id}`, ...extra });

describe("Sicht", () => {
  it("Schichtverantwortung A: nur Notizen der Einheit A; Tage ohne solche fallen weg", () => {
    const m = sicht(SUB);
    expect(Object.keys(m.notizen)).toEqual([D]);
    expect(ids(m.notizen[D])).toEqual(["n-A", "n-A2"]);
    const text = JSON.stringify(m);
    for (const s of ["NZ-n-B", "NZ-n-P", "NZ-n-N", "NZ-n-L", "NZ-n-B2", "PERSONENNOTIZ", "MK-TOTFELD"]) expect(text).not.toContain(s);
  });
  it("totes Feld tagesnotizen: für die Schichtverantwortung leer", () => {
    expect(sicht(SUB).tagesnotizen === undefined || Object.keys(sicht(SUB).tagesnotizen).length === 0).toBe(true);
  });
  it("ohne gültigen eigenen Bereich oder mit Pool als eigener Einheit: keine Tagesnotizen", () => {
    expect(sicht(SUB, bestand(person("s1", "subplaner", "ALLE"))).notizen).toEqual({});
    expect(sicht(SUB, bestand(person("s1", "subplaner", "ePool"))).notizen).toEqual({});
  });
  it("Planung und Leitung: vollständig, auch tagesnotizen", () => {
    for (const s of [PL, LT]) {
      expect(sicht(s).notizen).toEqual(roh().notizen);
      expect(sicht(s).tagesnotizen).toEqual(roh().tagesnotizen);
    }
  });
  it("Beschäftigte und Betriebsrat: unverändert keine Notizen", () => {
    for (const s of [MA, BR]) {
      expect(Object.keys(sicht(s).notizen || {})).toEqual([]);
      expect(JSON.stringify(sicht(s))).not.toContain("MK-TOTFELD");
    }
  });
});

describe("Rundweg und Rückfüllung", () => {
  it("gekürzt lesen, unverändert zurückschreiben: alle verborgenen Notizen und tagesnotizen exakt gespeichert", () => {
    const { e, m } = schreibe(SUB, (mm) => { mm.abweichungen["a1|2026-10-15"] = "F"; });
    expect(e.verweigert).toBeFalsy();
    expect(m.notizen).toEqual(roh().notizen);
    expect(m.tagesnotizen).toEqual(roh().tagesnotizen);
  });
  it("Rückfüllung allein: gekürzte Tagesliste mit neuer Notiz — B, Pool, null und Altbestand desselben Tages bleiben", () => {
    const g = bestand();
    const gesendet = { ...g.mandanten[0], notizen: { [D]: [neu("n-x"), notiz("n-A", "eA", "s1"), notiz("n-A2", "eA", "pl")] } };
    const r = schichtRueckfuellen(g.mandanten[0], gesendet, SUB);
    expect(ids(r.notizen[D])).toEqual(["n-x", "n-A", "n-A2", "n-B", "n-P", "n-N", "n-L"]);
    expect(r.notizen[D2]).toEqual(roh().notizen[D2]);
    expect(r.notizen["person|b1"]).toEqual(roh().notizen["person|b1"]);
  });
});

describe("Schreiben der Schichtverantwortung", () => {
  it("neue Notiz: Einheit A, Autor und Zeit vom Server — Clientwerte zählen nicht; Verborgenes bleibt", () => {
    const { e, m } = schreibe(SUB, (mm) => { mm.notizen[D].unshift(neu("n-neu", { einheitId: "eB", vonId: "b1", von: "Fremd", zeit: "1999" })); });
    expect(e.verweigert).toBeFalsy();
    expect(m.notizen[D][0]).toMatchObject({ id: "n-neu", text: "NEU-n-neu", einheitId: "eA", vonId: "s1", von: "Vs1 Ns1" });
    expect(m.notizen[D][0].zeit).not.toBe("1999");
    expect(m.notizen[D].slice(1)).toEqual(roh().notizen[D]);
  });
  it("neue Notiz an einem Tag mit nur verborgenen Notizen und an einem neuen Tag", () => {
    const { e, m } = schreibe(SUB, (mm) => { mm.notizen[D2] = [neu("n-d2")]; mm.notizen[D3] = [neu("n-d3")]; });
    expect(e.verweigert).toBeFalsy();
    expect(ids(m.notizen[D2])).toEqual(["n-d2", "n-B2"]);
    expect(m.notizen[D3]).toEqual([expect.objectContaining({ id: "n-d3", einheitId: "eA" })]);
  });
  it("eigene Notiz löschen: erlaubt; Notiz einer anderen Person der Einheit A löschen: abgewiesen", () => {
    const { e, m } = schreibe(SUB, (mm) => { mm.notizen[D] = mm.notizen[D].filter((x) => x.id !== "n-A"); });
    expect(e.verweigert).toBeFalsy();
    expect(ids(m.notizen[D])).toEqual(["n-A2", "n-B", "n-P", "n-N", "n-L"]);
    expect(schreibe(SUB, (mm) => { mm.notizen[D] = mm.notizen[D].filter((x) => x.id !== "n-A2"); }).e.verweigert).toBeTruthy();
  });
  it("bestehende Notiz ändern: abgewiesen", () => {
    expect(schreibe(SUB, (mm) => { mm.notizen[D][0].text = "anders"; }).e.verweigert).toBeTruthy();
    expect(schreibe(SUB, (mm) => { mm.notizen[D][0].einheitId = "eB"; }).e.verweigert).toBeTruthy();
  });
  it("Angriffe auf B, Pool, null, Altbestand: abgewiesen bzw. wirkungslos", () => {
    const fremd = (x) => schreibe(SUB, (mm) => { mm.notizen[D].push(x); }).e.verweigert;
    expect(fremd({ ...notiz("n-B", "eB"), text: "GEÄNDERT" }), "B ändern").toBeTruthy();
    expect(fremd({ ...notiz("n-B", "eB"), einheitId: "eA" }), "B → A").toBeTruthy();
    expect(fremd({ ...notiz("n-L", undefined), einheitId: "eA" }), "Altbestand übernehmen").toBeTruthy();
    expect(fremd({ ...notiz("n-N", null), einheitId: "eA" }), "null übernehmen").toBeTruthy();
    expect(fremd({ ...notiz("n-P", "ePool"), einheitId: "eA" }), "Pool übernehmen").toBeTruthy();
    /* B löschen: verborgen, also nicht mitgeschickt — bleibt */
    const weg = schreibe(SUB, (mm) => { mm.notizen = {}; mm.abweichungen["a1|2026-10-15"] = "F"; });
    expect(weg.e.verweigert).toBeFalsy();
    expect(weg.m.notizen).toEqual(roh().notizen);
    /* fremde Notiz mit neuer Kennung einschleusen: wird eine eigene Notiz der Einheit A */
    const ein = schreibe(SUB, (mm) => { mm.notizen[D].unshift({ id: "n-fake", text: "FAKE", einheitId: "eB", vonId: "pl", von: "Planung" }); });
    expect(ein.m.notizen[D][0]).toMatchObject({ id: "n-fake", einheitId: "eA", vonId: "s1" });
    expect(ein.m.notizen[D].some((x) => x.einheitId === "eB" && x.id === "n-fake")).toBe(false);
  });
  it("Personennotizen und das tote Feld: abgewiesen", () => {
    expect(schreibe(SUB, (mm) => { mm.notizen["person|a1"] = [neu("pn2")]; }).e.verweigert).toBeTruthy();
    expect(schreibe(SUB, (mm) => { mm.tagesnotizen = { "2026-10-15": "überschrieben" }; }).e.verweigert).toBeTruthy();
  });
  it("ohne gültigen eigenen Bereich (Pool): keine neue Notiz", () => {
    expect(schreibe(SUB, (mm) => { mm.notizen[D3] = [neu("n-p")]; }, bestand(person("s1", "subplaner", "ePool"))).e.verweigert).toBeTruthy();
  });
});

describe("Planung und Leitung", () => {
  it("legen Notizen für A, B, Pool und betriebsweit an; vonId vom Server; unbekannte Einheit abgewiesen", () => {
    const { e, m } = schreibe(PL, (mm) => {
      mm.notizen[D3] = ["eA", "eB", "ePool", null].map((eid, i) => neu(`n-pl${i}`, { einheitId: eid, von: "Planung", zeit: "z", vonId: "s1" }));
    });
    expect(e.verweigert).toBeFalsy();
    expect(m.notizen[D3].map((x) => [x.einheitId, x.vonId])).toEqual([["eA", "pl"], ["eB", "pl"], ["ePool", "pl"], [null, "pl"]]);
    expect(schreibe(LT, (mm) => { mm.notizen[D3] = [neu("n-x", { einheitId: "eX" })]; }).e.verweigert).toBeTruthy();
  });
  it("sehen nach dem Anlegen durch die SV alles", () => {
    const { e } = schreibe(SUB, (mm) => { mm.notizen[D].unshift(neu("n-neu")); });
    expect(ids(bestandFuerRolle(e, PL).mandanten[0].notizen[D])).toEqual(["n-neu", "n-A", "n-A2", "n-B", "n-P", "n-N", "n-L"]);
  });
});
