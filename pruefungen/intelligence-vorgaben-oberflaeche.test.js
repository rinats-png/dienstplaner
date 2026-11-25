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
import { pruefeVorgabe } from "../server/lib/vorgaben.mjs";
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
  it("Schichtverantwortung, Beschäftigte und Betriebsrat bekommen den Abschnitt nicht (kein Markup, auch nicht bei vorhandenen Vorgaben)", () => {
    for (const rolle of ["subplaner", "mitarbeiter", "betriebsrat"]) expect(render(sitz([V("a", "aktiv")], "basis", rolle)), rolle).toBe("");
    /* Ohne das Feld (der Server liefert es nicht): nichts, auch nicht für die Planung. */
    expect(render(sitz(undefined, "basis", "planer"))).toBe("");
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

describe("WP-I4 Teil 3: Planung liest, Leitung ändert; deaktivieren statt löschen", () => {
  const DEAKT = (t) => t.includes(">Deaktivieren</button>");
  it("Planung sieht die Vorgaben schreibgeschützt: kein Bearbeiten, Testen, Aktivieren, Löschen, Neu", () => {
    const t = render(sitz([V("a", "entwurf"), V("b", "aktiv")], "pro", "planer"));
    for (const x of ["Vorgabe a", "Vorgabe b", "Entwurf", "aktiv", "Priorität 1", "Hausregel"]) expect(t, x).toContain(x);
    for (const x of ["Bearbeiten", "Testen", "Aktivieren", "Deaktivieren", "Löschen", "Neue Vorgabe"]) expect(t, x).not.toContain(x);
    expect(t).toContain("nur die Leitung");
  });
  it("Planung ohne Vorgaben (Liste leer): Leerzustand ohne Knopf", () => {
    const t = render(sitz([], "pro", "planer"));
    expect(t).toContain("Noch keine Vorgaben");
    expect(t).not.toContain("Neue Vorgabe");
  });
  it("die Leitung kann nur einen nie aktiven Entwurf löschen; aktive und früher aktive Vorgaben nur deaktivieren", () => {
    const t = (v) => render(sitz([v]));
    expect(t(V("e", "entwurf"))).toContain("Löschen");
    expect(t(V("a", "aktiv", { aktiviertAm: "2026-11-01T00:00:00.000Z" }))).not.toContain("Löschen");
    expect(DEAKT(t(V("a", "aktiv")))).toBe(true);
    expect(t(V("i", "inaktiv", { aktiviertAm: "2026-11-01T00:00:00.000Z" }))).not.toContain("Löschen");
    expect(t(V("i", "inaktiv"))).toContain("Löschen");
  });
});

describe("Einhängung in die Einstellungen", () => {
  const lies = (pfad) => readFileSync(new URL(pfad, import.meta.url), "utf8").replace(/\r\n/g, "\n");
  it("die Einstellungen binden den Abschnitt hinter org.edit ein; die Betriebsverwaltung nicht", () => {
    const q = lies("../src/ansichten/einstellungen.jsx");
    expect(q).toContain('import { InterneVorgaben } from "./vorgaben.jsx";');
    expect(q).toContain('{sitz.mandant && <InterneVorgaben sitz={sitz} akt={akt} />}');
    expect(lies("../src/App.jsx")).not.toContain("InterneVorgaben");
  });
  it("Aktionen stehen in der Einstellungs-Fabrik (keine 13. Fabrik) und gehen über mUpd (der Server prüft)", () => {
    const q = lies("../src/app/aktionen/einstellungen.js");
    for (const a of ["vorgabeSpeichern", "vorgabeStatus", "vorgabeLoeschen"]) expect(q.includes(a + ": ("), a).toBe(true);
    expect(lies("../src/app/aktionen/stammdaten.js")).not.toContain("vorgabe");
  });
});

describe("WP-I4 Rest: Ausnahmezeiträume und verwaiste Bezüge", () => {
  it("das Formular bietet Ausnahmezeiträume (Von/Bis) an", async () => {
    const t = renderToStaticMarkup(h(InterneVorgaben, { sitz: sitz([V("a", "entwurf")]), akt: { ...AKT } }));
    expect(t).not.toContain("Zeitraum hinzufügen"); /* nur im Formular, nicht in der Liste */
    const { Formular } = await import("../src/ansichten/vorgaben.jsx");
    const f = renderToStaticMarkup(h(Formular, { m: sitz([]).mandant, start: V("a", "entwurf"), onSpeichern() {}, onAbbruch() {} }));
    expect(f).toContain("Zeitraum hinzufügen");
  });
  it("bestehende Ausnahmezeiträume werden angezeigt und gehen beim Speichern nicht verloren", async () => {
    const { Formular } = await import("../src/ansichten/vorgaben.jsx");
    const start = V("a", "entwurf", { ausnahmen: { zeitraeume: [{ von: "2026-12-24", bis: "2026-12-26" }] } });
    const f = renderToStaticMarkup(h(Formular, { m: sitz([]).mandant, start, onSpeichern() {}, onAbbruch() {} }));
    expect(f).toContain('value="2026-12-24"');
    expect(f).toContain('value="2026-12-26"');
  });
  it("gespeichert wird die bereinigte Vorgabe: verwaiste Kennungen entfernt, Ausnahmezeiträume und Teilzeit bleiben", async () => {
    const { formularZuVorgabe } = await import("../src/ansichten/vorgaben.jsx");
    const m = sitz([]).mandant;
    const zr = [{ von: "2026-12-24", bis: "2026-12-26" }];
    const v = V("a", "entwurf", { geltung: { art: "personen", personen: ["p1", "weg"] }, ausnahmen: { personen: ["weg"], zeitraeume: zr, teilzeitAnteilig: true } });
    const r = formularZuVorgabe(v, { groesse: "Überstunden", hoechstens: "10" }, m);
    expect(r.geltung).toEqual({ art: "personen", personen: ["p1"] });
    expect(r.ausnahmen).toEqual({ zeitraeume: zr, teilzeitAnteilig: true });
    expect(pruefeVorgabe(r)).toBeNull();
    const nurVerwaist = formularZuVorgabe(V("b", "entwurf", { geltung: { art: "einheit", einheiten: ["weg"] } }), { groesse: "Überstunden", hoechstens: "10" }, m);
    expect(pruefeVorgabe(nurVerwaist), "nichts übrig: Speichern bleibt gesperrt").toMatch(/Einheit/);
  });
  it("verwaiste Kennungen (gelöschte Einheit oder Person) werden bereinigt", async () => {
    const { bezuegeBereinigen } = await import("../src/ansichten/vorgaben.jsx");
    const m = sitz([]).mandant;
    const v = V("a", "entwurf", { geltung: { art: "personen", personen: ["p1", "weg"] }, ausnahmen: { personen: ["weg"], teilzeitAnteilig: true } });
    const r = bezuegeBereinigen(v, m);
    expect(r.geltung.personen).toEqual(["p1"]);
    expect(r.ausnahmen.personen).toEqual([]);
    expect(r.ausnahmen.teilzeitAnteilig).toBe(true);
    const e = bezuegeBereinigen(V("b", "entwurf", { geltung: { art: "einheit", einheiten: ["e1", "weg"] } }), m);
    expect(e.geltung.einheiten).toEqual(["e1"]);
  });
});
