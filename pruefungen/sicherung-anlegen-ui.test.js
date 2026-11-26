/* ==========================================================================
   MANUELLE SICHERUNG IN DER OBERFLÄCHE: kein „Sicherung angelegt.“ nach einem Fehler
   (Betreiberentscheidung 2026-11-26 A, Klasse ii; Review #586 B-1)

   Der Server meldet einen Fehler der manuellen Sicherung sichtbar (503 SICHERUNG_FEHLGESCHLAGEN). Die Oberfläche
   zeigte trotzdem „Sicherung angelegt.“: Die Aktion fing den Fehler (Hinweis oben) und die Einstellungen meldeten
   danach immer Erfolg. Wer dann glaubt, es gebe einen Rückweg, löscht womöglich viel.

   Geprüft: (1) die Aktion sicherungAnlegen gibt true/false zurück und meldet den Fehlertext; (2) der Knopf
   „Jetzt sichern“ der echten Komponente Einstellungen meldet den Erfolg nur bei true. Ohne DOM: gerendert wird
   serverseitig, der Knopf (Btn) zeichnet seine Eigenschaften auf, useState zeichnet gesetzte Werte auf.

   Nachtrag (Review #586; Betreiberentscheidung: erreichbar für die berechtigte Leitung, keine pauschale Erweiterung
   von Mandantenrechten): Die Karte hing an darf(sitz, "mandant.edit") — ein Recht, das in keiner Standardtabelle
   steht; mit Standardrechten war der Knopf nie sichtbar. Jetzt gilt dieselbe Regel wie beim Server
   (SICHERUNG_ROLLEN über darfSicherungenSehen, Rolle des Zugangs, angemeldet) und wie bei der Liste darunter.
   Geprüft: (3) sichtbar genau für die vom Server zugelassenen Rollen, nicht offline/Demo; (4) Quelltext und Regel
   laufen nicht auseinander; (5) die Verweise „Zum Betrieb“/„Datenmitnahme“ nur mit org.edit wie die Navigation.
   ========================================================================== */
import { describe, it, expect, beforeAll, vi } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const spur = vi.hoisted(() => ({ /** @type {any[]} */ gesetzt: [], /** @type {any[]} */ knoepfe: [],
  /** @type {null | "fehler" | "ok"} */ sicherung: null, angemeldet: true, /** @type {any} */ zugang: { rolle: "leitung" } }));

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
  return { ...o, angemeldet: () => spur.angemeldet, zugangsdaten: () => spur.zugang, sicherung: async () => {
    if (spur.sicherung === "fehler") throw new Error("Die Sicherung konnte nicht angelegt werden.");
    return { ok: true, marke: "2026-11-26-10-00-00-0001" };
  } };
});

let App, E, R, sitz;
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
  /* Standardrechte, keine betriebseigene Tabelle: Die Karte folgt der Serverregel, nicht einem Sonderrecht. */
  R = await import("../src/lib/rollen.js");
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

/** Rendert die Einstellungen mit Zugangsrolle (Server) und Personenrolle (Plan); Ergebnis: Texte der Knöpfe. */
const knopfTexte = (zugangRolle, personRolle = "leitung", { angemeldet = true, matrix = undefined } = {}) => {
  const p = { ...sitz.mandant.personen[0], rolle: personRolle };
  const m = { ...sitz.mandant, personen: [p], ...(matrix ? { matrix } : {}) };
  spur.angemeldet = angemeldet;
  spur.zugang = zugangRolle ? { rolle: zugangRolle } : null;
  spur.knoepfe = [];
  try {
    renderToStaticMarkup(h(App.Einstellungen, {
      sitz: { ...sitz, rolle: personRolle, mandant: m, person: p, zugangRolle: zugangRolle === "kunde" ? "kunde" : null },
      akt: { sicherungAnlegen: async () => true, sicherungenLaden: async () => [], zurueckspielen: async () => ({}) },
      gehZu: () => {} }));
  } finally { spur.angemeldet = true; spur.zugang = { rolle: "leitung" }; }
  return spur.knoepfe.map(textVon);
};

describe("Wer „Jetzt sichern“ sieht: genau die Rollen, die der Server zulässt (SICHERUNG_ROLLEN)", () => {
  it("Leitung mit Standardrechten (ohne betriebseigene Tabelle) sieht ihn und die Verweise (org.edit)", () => {
    const t = knopfTexte("leitung", "leitung");
    expect(t).toContain("Jetzt sichern");
    expect(t).toContain("Zum Betrieb");
  }, 120000);
  it("Kundenrolle (vom Server zugelassen) sieht ihn; ohne org.edit der Person keine Verweise", () => {
    expect(knopfTexte("kunde", "leitung")).toContain("Jetzt sichern");
    const t = knopfTexte("kunde", "mitarbeiter");
    expect(t).toContain("Jetzt sichern");
    expect(t).not.toContain("Zum Betrieb");
  }, 120000);
  it.each([["mitarbeiter", "mitarbeiter"], ["planer", "planer"], ["subplaner", "subplaner"],
    ["betriebsrat", "betriebsrat"], ["betreiber", "leitung"], [null, "leitung"]])(
    "Zugang %s (Person %s): kein Knopf, keine Karte", (zugang, person) => {
      const t = knopfTexte(zugang, person);
      expect(t).not.toContain("Jetzt sichern");
      expect(t).not.toContain("Zum Betrieb");
    }, 120000);
  it("nicht angemeldet (Probierumgebung/Demo ohne Server): kein Knopf, auch mit Leitungsrolle", () => {
    expect(knopfTexte("leitung", "leitung", { angemeldet: false })).not.toContain("Jetzt sichern");
  }, 120000);
  it("mandant.edit schaltet nichts mehr frei: Planung mit betriebseigener Tabelle samt mandant.edit sieht nichts", () => {
    const matrix = { ...R.MATRIX_STD, planer: [...R.MATRIX_STD.planer, "mandant.edit", "org.edit"] };
    expect(knopfTexte("planer", "planer", { matrix })).not.toContain("Jetzt sichern");
  }, 120000);
});

describe("Regel der Oberfläche == Serverregel (aus den Quellen, damit sie nicht wieder auseinanderlaufen)", () => {
  it("Karte an darfSicherungenSehen(serverRolle); SICHERUNG_SEHEN == SICHERUNG_ROLLEN == Prüfung im POST", async () => {
    const { readFileSync } = await import("node:fs");
    const lies = (d) => readFileSync(new URL(d, import.meta.url), "utf8").replace(/\r\n/g, "\n");
    const ans = lies("../src/ansichten/einstellungen.jsx").split("\n");
    const kopf = ans.findIndex((z) => z.includes("<CardHead>Für den Betrieb</CardHead>"));
    expect(kopf).toBeGreaterThan(1);
    expect(ans[kopf - 2]).toContain("sitz.mandant && SP.angemeldet() && darfSicherungenSehen(serverRolle) && (");
    expect(ans.join("\n")).not.toContain("mandant.edit");
    const liste = (text, name) => {
      const t = new RegExp(`${name}\\s*=\\s*(?:Object\\.freeze\\()?\\[([^\\]]*)\\]`).exec(text);
      return t ? t[1].split(",").map((x) => x.trim().replace(/^"|"$/g, "")).filter(Boolean) : null;
    };
    const server = liste(lies("../server/lib/sicherungen.mjs"), "SICHERUNG_ROLLEN");
    expect(server).toEqual(["leitung", "kunde"]);
    expect(liste(lies("../src/sicherungen-ui.js"), "SICHERUNG_SEHEN")).toEqual(server);
    const U = await import("../src/sicherungen-ui.js");
    const S = await import("../server/lib/sicherungen.mjs");
    expect([...U.SICHERUNG_SEHEN]).toEqual(S.SICHERUNG_ROLLEN);
    const d = lies("../server/funktionen/daten.mjs");
    const post = d.indexOf(`pfad === "sicherung" && req.method === "POST"`);
    expect(post).toBeGreaterThan(0);
    expect(d.slice(post, post + 200)).toContain("if (!SICHERUNG_ROLLEN.includes(s.rolle))");
  });
});
