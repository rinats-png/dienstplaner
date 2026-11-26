/* ==========================================================================
   MANUELLE SICHERUNG IN DER OBERFLÄCHE: kein „Sicherung angelegt.“ nach einem Fehler
   (Betreiberentscheidung 2026-11-26 A, Klasse ii; Review #586 B-1)

   Der Server meldet einen Fehler der manuellen Sicherung sichtbar (503 SICHERUNG_FEHLGESCHLAGEN). Die Oberfläche
   zeigte trotzdem „Sicherung angelegt.“: Die Aktion fing den Fehler (Hinweis oben) und die Einstellungen meldeten
   danach immer Erfolg. Wer dann glaubt, es gebe einen Rückweg, löscht womöglich viel.

   Geprüft: (1) die Aktion sicherungAnlegen gibt true/false zurück und meldet den Fehlertext; (2) der Knopf
   „Jetzt sichern“ der echten Komponente Einstellungen meldet den Erfolg nur bei true. Ohne DOM: gerendert wird
   serverseitig, der Knopf (Btn) zeichnet seine Eigenschaften auf, useState zeichnet gesetzte Werte auf.
   ========================================================================== */
import { describe, it, expect, beforeAll, vi } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const spur = vi.hoisted(() => ({ /** @type {any[]} */ gesetzt: [], /** @type {any[]} */ knoepfe: [],
  /** @type {null | "fehler" | "ok"} */ sicherung: null }));

vi.mock("react", async (importOriginal) => {
  /** @type {any} */
  const o = await importOriginal();
  const useState = (init) => { const [w, setze] = o.useState(init); return [w, (x) => { spur.gesetzt.push(x); return setze(x); }]; };
  return { ...o, useState, default: { ...o, useState } };
});
vi.mock("../src/ui/bausteine.jsx", async (importOriginal) => {
  /** @type {any} */
  const o = await importOriginal();
  const Btn = (props) => { spur.knoepfe.push(props); return o.Btn(props); };
  return { ...o, Btn };
});
vi.mock("../src/speicher.js", async (importOriginal) => {
  /** @type {any} */
  const o = await importOriginal();
  return { ...o, sicherung: async () => {
    if (spur.sicherung === "fehler") throw new Error("Die Sicherung konnte nicht angelegt werden.");
    return { ok: true, marke: "2026-11-26-10-00-00-0001" };
  } };
});

let App, E, sitz;
const textVon = (k) => {
  const c = k.children;
  return (Array.isArray(c) ? c : [c]).filter((x) => typeof x === "string").join("").trim();
};

beforeAll(async () => {
  App = await import("../src/App.jsx");
  E = await import("../src/app/aktionen/einstellungen.js");
  const m = App.leererMandant("Sicherung-UI-Prüfung", "pflege");
  const e = m.einheiten[0].id;
  m.personen = [{ ...App.zugangsPerson("leitung", e, 1), id: "leitung", vorname: "Lea", nachname: "Leitung" }];
  /* Die Karte „Für den Betrieb“ hängt an darf(sitz, "mandant.edit"). Dieses Recht steht in keiner
     Standardtabelle (src/lib/rollen.js) — sichtbar nur mit einer betriebseigenen Tabelle, die es führt. */
  const R = await import("../src/lib/rollen.js");
  m.matrix = { ...R.MATRIX_STD, leitung: [...R.MATRIX_STD.leitung, "mandant.edit"] };
  sitz = { rolle: "leitung", db: { mandanten: [m], session: { mandantId: m.id, personId: "leitung", rolle: "leitung" } },
    mandant: m, person: m.personen[0] };
}, 120000);

describe("Aktion sicherungAnlegen", () => {
  const aktion = (meldungen) => E.aktionenEinstellungen({ mUpd: () => {}, melde: (x) => meldungen.push(x),
    ref: { current: null }, sitz }).sicherungAnlegen;
  it("Erfolg: true, keine Fehlermeldung", async () => {
    const meldungen = [];
    spur.sicherung = "ok";
    expect(await aktion(meldungen)()).toBe(true);
    expect(meldungen).toEqual([]);
  });
  it("Fehler (503 SICHERUNG_FEHLGESCHLAGEN): false, der Fehlertext des Servers wird gemeldet", async () => {
    const meldungen = [];
    spur.sicherung = "fehler";
    expect(await aktion(meldungen)()).toBe(false);
    expect(meldungen).toEqual(["Die Sicherung konnte nicht angelegt werden."]);
  });
});

describe("Knopf „Jetzt sichern“ in den Einstellungen", () => {
  const drueckenMit = async (ergebnis) => {
    spur.knoepfe = [];
    renderToStaticMarkup(h(App.Einstellungen, { sitz, akt: { sicherungAnlegen: async () => ergebnis,
      sicherungenLaden: async () => [], zurueckspielen: async () => ({}) }, gehZu: () => {} }));
    const k = spur.knoepfe.find((x) => textVon(x) === "Jetzt sichern");
    expect(k, "Knopf „Jetzt sichern“ nicht gerendert").toBeTruthy();
    spur.gesetzt = [];
    await k.onClick();
    return spur.gesetzt;
  };
  it("nach einem Fehler kein „Sicherung angelegt.“", async () => {
    expect(await drueckenMit(false)).not.toContain("Sicherung angelegt.");
  }, 120000);
  it("nach Erfolg „Sicherung angelegt.“", async () => {
    expect(await drueckenMit(true)).toContain("Sicherung angelegt.");
  }, 120000);
});
