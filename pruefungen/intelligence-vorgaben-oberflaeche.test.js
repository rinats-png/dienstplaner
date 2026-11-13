/* ==========================================================================
   WP-I4 — OBERFLÄCHE „INTERNE VORGABEN" (gerendert) und Einhängung

   Rendert die Komponente mit echten React-Elementen (renderToStaticMarkup) und
   prüft, was die Leitung und die Kundenrolle (org.edit) sehen und dass jede andere Rolle
   nichts bekommt, dazu die Aktionen (Einstellungs-Fabrik, keine 13. Fabrik) und die Einhängung
   in die Einstellungen. Synthetische Daten.
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { InterneVorgaben } from "../src/ansichten/vorgaben.jsx";
import { vorgabenGrenze, VORGABEN_STUFENGRENZE } from "../src/stufen.js";

const V = (id, status, extra = {}) => ({ id, name: `Vorgabe ${id}`, regelart: "grenzregel", parameter: { groesse: "Überstunden", hoechstens: 10 },
  geltung: { art: "betrieb" }, bezug: "monat", staerke: "muss", prioritaet: 1, grundlage: { art: "hausregel" }, status, ...extra });
const sitz = (vorgaben, tarif = "basis", rolle = "leitung", zugangRolle = undefined) => ({ rolle: "kunde", zugangRolle,
  person: { id: "x1", rolle },
  mandant: { tarif, vorgaben, einheiten: [{ id: "e1", name: "Station 1" }], personen: [{ id: "p1", vorname: "Test", nachname: "Person", rolle: "mitarbeiter", status: "aktiv" }] } });
const AKT = { vorgabeSpeichern() {}, vorgabeStatus() {}, vorgabeLoeschen() {} };
const render = (s) => renderToStaticMarkup(h(InterneVorgaben, { sitz: s, akt: AKT }));

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
  it("Planung, Schichtverantwortung, Beschäftigte und Betriebsrat bekommen den Abschnitt nicht (kein Markup, auch nicht bei vorhandenen Vorgaben)", () => {
    for (const rolle of ["planer", "subplaner", "mitarbeiter", "betriebsrat"]) expect(render(sitz([V("a", "aktiv")], "basis", rolle)), rolle).toBe("");
    expect(render({ ...sitz([V("a", "aktiv")]), rolle: "betreiber", person: { id: "b", rolle: "betreiber" } })).toBe("");
  });
  it("Leitung und Kundenrolle (org.edit) bekommen ihn; der Hinweis auf die Mitbestimmung nennt keine Sicht des Betriebsrats", () => {
    expect(render(sitz([V("a", "aktiv")])), "leitung").toContain("Vorgabe a");
    /* Kundenrolle: Person mit Leitungsrolle, Zugang der Altrolle (RB-3). */
    expect(render(sitz([V("a", "aktiv")], "basis", "leitung", "kunde")), "kunde").toContain("Vorgabe a");
    const q = readFileSync(new URL("../src/ansichten/vorgaben.jsx", import.meta.url), "utf8");
    expect(q).toContain("mitbestimmungspflichtig");
    expect(q).not.toMatch(/Betriebsrat sieht/);
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

describe("Einhängung in die Einstellungen", () => {
  const lies = (pfad) => readFileSync(new URL(pfad, import.meta.url), "utf8").replace(/\r\n/g, "\n");
  it("die Einstellungen binden den Abschnitt hinter org.edit ein; die Betriebsverwaltung nicht", () => {
    const q = lies("../src/ansichten/einstellungen.jsx");
    expect(q).toContain('import { InterneVorgaben } from "./vorgaben.jsx";');
    expect(q).toContain('{sitz.mandant && darf(sitz, "org.edit") && <InterneVorgaben sitz={sitz} akt={akt} />}');
    expect(lies("../src/App.jsx")).not.toContain("InterneVorgaben");
  });
  it("Aktionen stehen in der Einstellungs-Fabrik (keine 13. Fabrik) und gehen über mUpd (der Server prüft)", () => {
    const q = lies("../src/app/aktionen/einstellungen.js");
    for (const a of ["vorgabeSpeichern", "vorgabeStatus", "vorgabeLoeschen"]) expect(q.includes(a + ": ("), a).toBe(true);
    expect(lies("../src/app/aktionen/stammdaten.js")).not.toContain("vorgabe");
  });
});
