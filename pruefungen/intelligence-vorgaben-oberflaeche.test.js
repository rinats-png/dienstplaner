/* ==========================================================================
   WP-I4 — OBERFLÄCHE „INTERNE VORGABEN" (gerendert) und Einhängung

   Rendert die Komponente mit echten React-Elementen (renderToStaticMarkup) und
   prüft, was die Leitung und was die Planung (nurLesen) sehen, dazu die
   Aktionen und die Einhängepunkte in der Betriebsverwaltung. Synthetische Daten.
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { InterneVorgaben } from "../src/ansichten/vorgaben.jsx";
import { vorgabenGrenze, VORGABEN_STUFENGRENZE } from "../src/stufen.js";
import { appQuelle } from "./app-quelle.js";

const V = (id, status, extra = {}) => ({ id, name: `Vorgabe ${id}`, regelart: "grenzregel", parameter: { groesse: "Überstunden", hoechstens: 10 },
  geltung: { art: "betrieb" }, bezug: "monat", staerke: "muss", prioritaet: 1, grundlage: { art: "hausregel" }, status, ...extra });
const sitz = (vorgaben, tarif = "basis") => ({ mandant: { tarif, vorgaben, einheiten: [{ id: "e1", name: "Station 1" }], personen: [{ id: "p1", vorname: "Test", nachname: "Person", rolle: "mitarbeiter", status: "aktiv" }] } });
const AKT = { vorgabeSpeichern() {}, vorgabeStatus() {}, vorgabeLoeschen() {} };
const render = (s, nurLesen = false) => renderToStaticMarkup(h(InterneVorgaben, { sitz: s, akt: AKT, nurLesen }));

describe("Oberfläche", () => {
  it("ohne Vorgaben: Leerzustand, Knopf „Neue Vorgabe“ und die Grenze der Stufe", () => {
    const t = render(sitz([]));
    expect(t).toContain("Noch keine Vorgaben");
    expect(t).toContain("Neue Vorgabe");
    expect(t).toContain("0 von 5 aktiv");
  });
  it("Enterprise zeigt keine Obergrenze, Business 25", () => {
    expect(render(sitz([], "enterprise"))).not.toContain(" von ");
    expect(render(sitz([V("a", "aktiv")], "pro"))).toContain("1 von 25 aktiv");
  });
  it("Liste: Name, Status, Stärke, Priorität, Grundlage; Aktivieren ist ohne Test gesperrt", () => {
    const t = render(sitz([V("a", "entwurf"), V("b", "aktiv", { staerke: "soll" })]));
    for (const x of ["Vorgabe a", "Entwurf", "Muss", "Vorgabe b", "aktiv", "Soll", "Priorität 1", "Hausregel", "Testen", "Bearbeiten", "Löschen", "Deaktivieren"]) expect(t, x).toContain(x);
    expect(t).toMatch(/<button[^>]*disabled=""[^>]*>Aktivieren<\/button>/);
    expect(t).toContain("Zuerst testen.");
  });
  it("Planung (nurLesen): die Liste, aber keine Knöpfe zum Ändern", () => {
    const t = render(sitz([V("a", "aktiv")]), true);
    expect(t).toContain("Vorgabe a");
    for (const x of ["Neue Vorgabe", "Testen", "Bearbeiten", "Löschen", "Aktivieren", "Deaktivieren"]) expect(t, x).not.toContain(x);
  });
  it("der Text verspricht keine Wirkung im Plan, die es noch nicht gibt", () => {
    const t = render(sitz([]));
    expect(t).toContain("folgt in einem eigenen Schritt");
    expect(t).toContain("nicht den echten Plan");
  });
  it("Stufengrenzen aus stufen.js entsprechen dem Server", () => {
    expect(VORGABEN_STUFENGRENZE).toEqual({ basis: 5, pro: 25, enterprise: Infinity });
    expect(vorgabenGrenze("pro")).toBe(25);
  });
});

describe("Einhängung in die Betriebsverwaltung", () => {
  const APP = appQuelle().replace(/\r\n/g, "\n");
  it("Leitung bekommt die volle Ansicht, Planung die lesende; beide aus einer Komponente", () => {
    expect(APP).toContain('import { InterneVorgaben } from "./ansichten/vorgaben.jsx";');
    expect(APP).toContain("<InterneVorgaben sitz={sitz} akt={akt} />");
    expect(APP).toContain("<InterneVorgaben sitz={sitz} akt={akt} nurLesen />");
    /* Die volle Ansicht steht hinter der org.edit-Schranke von Betrieb(): vor ihr kommt der frühe Rückgabezweig. */
    const i = APP.indexOf("<InterneVorgaben sitz={sitz} akt={akt} />");
    const sperre = APP.indexOf('if (!darf(sitz, "org.edit")) {');
    expect(sperre).toBeGreaterThan(0);
    expect(i).toBeGreaterThan(sperre);
  });
  it("Aktionen stehen im Aktionsobjekt und gehen über mUpd (der Server prüft)", () => {
    const q = readFileSync(new URL("../src/app/aktionen/stammdaten.js", import.meta.url), "utf8");
    for (const a of ["vorgabeSpeichern", "vorgabeStatus", "vorgabeLoeschen"]) expect(q, a).toMatch(new RegExp(`${a}: \\(`));
  });
});
