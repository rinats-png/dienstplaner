/* ==========================================================================
   EINLADUNGEN — Oberfläche (WP-18)

   Gerendert wird, was React tatsächlich ausgibt (renderToStaticMarkup), mit
   erfundenen Personen. Die Bedienung im Browser (Knopf drücken, Code
   ablesen, damit anmelden) bleibt ein Schritt für einen Menschen; hier wird
   festgehalten, was die Ansichten zeigen und wo sie eingehängt sind.
   ========================================================================== */
import { describe, it, expect, beforeAll } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFile } from "node:fs/promises";

let V;
beforeAll(async () => { V = await import("../src/ansichten/einladungen.jsx"); }, 60000);

const person = (id, rolle, extra = {}) => ({ id, vorname: `Test${id}`, nachname: "Person", rolle, status: "aktiv", ...extra });
const mandant = () => ({ id: "m-a", name: "Testbetrieb", personen: [person("al", "leitung"), person("al2", "leitung"),
  person("ap", "planer"), person("am", "mitarbeiter"), person("aw", "mitarbeiter", { status: "ausgeschieden" }),
  person("ar", "betriebsrat"), person("an", "mitarbeiter", { anonym: true })] });
const sitz = (id) => { const m = mandant(); return { rolle: "kunde", mandant: m, person: m.personen.find((p) => p.id === id) }; };

describe("Einladungen (Leitung)", () => {
  it("bietet nur aktive Personen unterhalb der eigenen Rolle an — keine Leitung, nicht sich selbst", () => {
    const ids = V.einladbarePersonen(sitz("al")).map((p) => p.id).sort();
    expect(ids).toEqual(["am", "ap", "ar"]);
  });
  it("rendert Auswahl und Knopf, ohne Einladung oder Code vorab", () => {
    const html = renderToStaticMarkup(h(V.Einladungen, { sitz: sitz("al"), api: {} }));
    expect(html).toContain("Zugang einladen");
    expect(html).toContain("Einladung ausstellen");
    expect(html).toContain("Testam Person · Beschäftigte");
    expect(html).not.toContain("Testal2");
    expect(html).not.toContain("Testaw");
    expect(html).not.toMatch(/data-einladung|data-zugangscode/);
  });
  it("Beschäftigte sehen nichts davon", () => {
    expect(renderToStaticMarkup(h(V.Einladungen, { sitz: sitz("am"), api: {} }))).toBe("");
  });
});

describe("Einladung einlösen (Anmeldeseite)", () => {
  it("zeigt zuerst nur den Verweis, aufgeklappt Feld und Knopf", () => {
    const zu = renderToStaticMarkup(h(V.EinladungEinstieg, { api: {} }));
    expect(zu).toContain("Ich habe eine Einladung");
    expect(zu).not.toContain("id=\"einladung\"");
    const auf = renderToStaticMarkup(h(V.EinladungAnnehmen, { api: {} }));
    expect(auf).toContain("id=\"einladung\"");
    expect(auf).toContain("Einladung einlösen");
  });
});

describe("Eingehängt", () => {
  it("App.jsx: im Personalbereich, nur mit Rollenvergabe und nicht im Demozugang", async () => {
    const t = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
    expect(t).toMatch(/aktiveView === "personal" && darf\(sitz, "roles\.assign"\) && !\(SP\.zugangsdaten\(\) \|\| \{\}\)\.demo\s*&& <Einladungen sitz=\{sitz\} \/>/);
  });
  it("main.jsx: auf der Anmeldeseite", async () => {
    const t = await readFile(new URL("../src/main.jsx", import.meta.url), "utf8");
    expect(t).toContain("<EinladungEinstieg F={C} />");
  });
  it("speicher.js: beide Wege gehen an die Serverpfade", async () => {
    const t = await readFile(new URL("../src/speicher.js", import.meta.url), "utf8");
    expect(t).toContain("fetch(\"/api/einladung\", { method: \"POST\", headers: kopf()");
    expect(t).toContain("fetch(\"/api/einladung/annehmen\"");
  });
});
