/* ==========================================================================
   WP-I4 Rest — BEZÜGE DER VORGABEN (Einheiten, Personen) gehören zum eigenen Betrieb

   Eine neue oder geänderte Vorgabe darf nur Einheiten und Personen nennen, die der
   eigene Betrieb kennt (Geltung und Ausnahmen). Fremde oder erfundene Kennungen
   (auch aus einem anderen Betrieb desselben Raums) weist der Server ab; ein
   unveränderter Altbestand bleibt stehen (kein nachträgliches Abweisen).
   Die Rechtefrage (wer schreibt) ist unverändert: nur org.edit; nichts davon hier entschieden.

   Aufruf: npx vitest run pruefungen/intelligence-vorgaben-bezuege.test.js
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { vorgabenZusammen } from "../server/lib/vorgaben.mjs";

const JETZT = "2026-11-25T10:00:00.000Z";
const V = (id, extra = {}) => ({ id, name: `Vorgabe ${id}`, regelart: "grenzregel", parameter: { groesse: "Überstunden", hoechstens: 10 },
  geltung: { art: "betrieb" }, bezug: "monat", staerke: "muss", prioritaet: 1, grundlage: { art: "hausregel" }, status: "entwurf", ...extra });
const betrieb = (vorgaben) => ({ id: "m1", tarif: "pro", einheiten: [{ id: "e1" }, { id: "e2" }], personen: [{ id: "p1" }, { id: "p2" }], ...(vorgaben ? { vorgaben } : {}) });
const schreibe = (alt, vorgaben) => vorgabenZusammen(alt, { ...alt, vorgaben }, { darfOrgEdit: true, person: "l1", tarif: "pro", jetzt: JETZT });

describe("Bezüge zum eigenen Betrieb", () => {
  it("Geltung Einheit: bekannte Einheit geht, unbekannte und fremde nicht", () => {
    const alt = betrieb();
    expect(schreibe(alt, [V("a", { geltung: { art: "einheit", einheiten: ["e1"] } })]).grund).toBeUndefined();
    for (const id of ["e9", "fremd-e1"]) expect(schreibe(alt, [V("a", { geltung: { art: "einheit", einheiten: ["e1", id] } })]).grund, id).toMatch(/Einheit/);
  });
  it("Geltung Personen: bekannte Person geht, unbekannte und fremde nicht", () => {
    const alt = betrieb();
    expect(schreibe(alt, [V("a", { geltung: { art: "personen", personen: ["p1", "p2"] } })]).grund).toBeUndefined();
    expect(schreibe(alt, [V("a", { geltung: { art: "personen", personen: ["p1", "x77"] } })]).grund).toMatch(/Person/);
  });
  it("Ausnahmen Personen: unbekannte Person wird abgewiesen, bekannte geht", () => {
    const alt = betrieb();
    expect(schreibe(alt, [V("a", { ausnahmen: { personen: ["p2"] } })]).grund).toBeUndefined();
    expect(schreibe(alt, [V("a", { ausnahmen: { personen: ["x77"] } })]).grund).toMatch(/Person/);
  });
  it("Kennungen aus einem anderen Betrieb sind für diesen Betrieb unbekannt", () => {
    const betriebA = betrieb();
    const betriebB = { ...betrieb(), einheiten: [{ id: "b-e1" }], personen: [{ id: "b-p1" }] };
    expect(schreibe(betriebA, [V("a", { geltung: { art: "personen", personen: [betriebB.personen[0].id] } })]).grund).toMatch(/Person/);
    expect(schreibe(betriebA, [V("a", { geltung: { art: "einheit", einheiten: [betriebB.einheiten[0].id] } })]).grund).toMatch(/Einheit/);
  });
  it("die neue Einheit oder Person im selben Schreibvorgang gilt als bekannt", () => {
    const alt = betrieb();
    const neu = { ...alt, einheiten: [...alt.einheiten, { id: "e3" }], vorgaben: [V("a", { geltung: { art: "einheit", einheiten: ["e3"] } })] };
    expect(vorgabenZusammen(alt, neu, { darfOrgEdit: true, person: "l1", tarif: "pro", jetzt: JETZT }).grund).toBeUndefined();
  });
  it("die im selben Schritt angelegte Person gilt als bekannt; eine nur im alten Stand vorhandene nicht mehr nötig", () => {
    const alt = betrieb();
    const neu = { ...alt, personen: [...alt.personen, { id: "p3" }], vorgaben: [V("a", { ausnahmen: { personen: ["p3"] } })] };
    expect(vorgabenZusammen(alt, neu, { darfOrgEdit: true, person: "l1", tarif: "pro", jetzt: JETZT }).grund).toBeUndefined();
  });
  it("Altbestand mit verwaister Kennung bleibt stehen und lässt Änderungen zu; neu hinzukommen darf nur Bekanntes", () => {
    const verwaist = { ...V("alt", { geltung: { art: "personen", personen: ["geloescht"] } }), version: 1, geaendertAm: JETZT, geaendertVon: "l1" };
    const alt = betrieb([verwaist]);
    expect(schreibe(alt, [verwaist]).grund).toBeUndefined();
    expect(schreibe(alt, [{ ...verwaist, name: "Neu benannt" }]).grund).toBeUndefined();
    expect(schreibe(alt, [{ ...verwaist, geltung: { art: "personen", personen: ["geloescht", "x77"] } }]).grund).toMatch(/Person/);
    expect(schreibe(alt, [{ ...verwaist, geltung: { art: "personen", personen: ["geloescht", "p1"] } }]).grund).toBeUndefined();
    expect(schreibe(alt, [{ ...verwaist, name: "Neu benannt", geltung: { art: "betrieb" } }]).grund).toBeUndefined();
  });
  it("ohne org.edit bleibt das Feld wirkungslos (unverändert, kein neuer Fehler)", () => {
    const alt = betrieb();
    const r = vorgabenZusammen(alt, { ...alt, vorgaben: [V("a", { geltung: { art: "personen", personen: ["x77"] } })] }, { darfOrgEdit: false, person: "p1", tarif: "pro", jetzt: JETZT });
    expect(r.grund).toBeUndefined();
    expect(r.mandant.vorgaben).toBeUndefined();
  });
});
