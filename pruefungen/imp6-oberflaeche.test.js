/* ==========================================================================
   IMP-6 Oberfläche — Schichtmodelle und Zuordnungen je Person (Pflege für Planung, Leitung, Kundenrolle)

   Geprüft ohne Browser:
     A  Hilfen (src/lib/schichtmodelle-pflege.js): Folge lesen, Zykluslänge (keine feste Länge), Kennungen, Lage am Tag.
     B  Vorprüfung = Server: entwurfPruefen liefert für jeden Fall denselben Befund wie die Serverkette
        (schichtzuordnungZusammen, danach modellKuerzungFehler) — Überschneidung, rückwirkend, freigegebener Monat,
        Modell noch verwendet, Dienstart fehlt, Modell verkürzt (422), gültige Änderung ab morgen.
     C  „Nicht gespeichert“: 422 MODELL_VERKUERZT_VERSATZ und die inhaltlichen 403 der Schichtmodelle werden zur Lage
        „schichtmodell“ mit dem Text des Servers; jede andere 403 bleibt „keinRecht“ (Differenz). Die Erkennung der 403
        ist gegen die echten Texte der Bibliothek festgeschrieben.
     D  Ansicht: nur für Rollen mit (org.edit oder pattern.edit) und staff.edit; Hinweis „ohne Wirkung auf den
        Dienstplan“; Zykluslängen; Zuordnungen; zugängliche Namen; keine eigenen Farben/Radien/Schatten.
     E  Verdrahtung: Schichtfolge bindet die Ansicht ein; Aktionen setzen nur die Felder; Dienstart im Modell sperrt Löschen.
   Interaktion im Browser: e2e/imp6-schichtmodelle.spec.mjs.
   Aufruf: npx vitest run pruefungen/imp6-oberflaeche.test.js
   ========================================================================== */
// zeit-ok: Feste Tage als Zeichenketten; die Uhr fließt nur in lage.zeit von src/speicher.js (nicht verglichen).
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  folgeLesen, folgeText, unbekannteKennungen, zykluslaengeText, neueKennung, nutzerDesModells, modelleMitDienstart,
  entwurfPruefen, mitModellen, mitZuordnungen, lageAm, zeitraumText, zuordnungBegonnen, alleZuordnungsKennungen, personName,
} from "../src/lib/schichtmodelle-pflege.js";
import { schichtzuordnungZusammen, modellKuerzungFehler, schichtmodellAbsageCode, SCHICHTMODELL_CODE_PRAEFIX } from "../server/lib/schichtzuordnung.mjs";
import { Schichtmodelle, darfSchichtmodelle, ZuordnungsZeile } from "../src/ansichten/schichtmodelle.jsx";
import { wirksamePerson } from "../src/lib/schichtmodelle-pflege.js";
import { darf as serverDarf } from "../server/lib/rechte.mjs";
import { schichtmodellPflegeSetzen, schichtmodellPflegeAn } from "../src/lib/schichtmodell-schalter.js";

const HEUTE = "2026-11-20";
const quelle = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const kopie = (x) => JSON.parse(JSON.stringify(x));

const DIENSTARTEN = [
  { id: "F", kurz: "F", name: "Frühdienst", start: "06:00", ende: "14:00", farbe: "#2f6fdf" },
  { id: "S", kurz: "S", name: "Spätdienst", start: "14:00", ende: "22:00", farbe: "#c77d12" },
  { id: "N", kurz: "N", name: "Nachtdienst", start: "22:00", ende: "06:00", farbe: "#6b4fd8" },
];
/** Betrieb mit zwei Modellen unterschiedlicher Länge (9 und 14 Tage) und drei Personen. */
const betrieb = () => ({
  id: "m1", dienstarten: kopie(DIENSTARTEN), freigaben: {}, monatsabschluss: {},
  schichtmodelle: [
    { id: "sm-neun", name: "Neun-Tage-Folge", tage: ["F", "F", "S", "S", "N", "N", "-", "-", "-"] },
    { id: "sm-zwei", name: "Zwei Wochen", tage: ["F", "F", "F", "F", "F", "-", "-", "S", "S", "S", "S", "S", "-", "-"] },
  ],
  personen: [
    { id: "p1", name: "Anna Probe", rolle: "mitarbeiter",
      schichtmodellZuordnungen: [{ id: "sz-a", modellId: "sm-neun", gueltigAb: "2026-11-01", gueltigBis: null, versatz: 2 }] },
    { id: "p2", name: "Bert Probe", rolle: "mitarbeiter" },
    { id: "p3", name: "Leitung Probe", rolle: "leitung", bereich: "ALLE" },
  ],
});
/** Der Befund der Serverkette (rechte.mjs → schichtzuordnungZusammen, daten.mjs → modellKuerzungFehler). */
function server(altM, neuM) {
  const r = schichtzuordnungZusammen(altM, neuM, { darf: true, person: "p3", jetzt: "2026-11-20T09:00:00.000Z", heute: HEUTE });
  if (r.grund) return { code: r.code, text: r.grund };
  const k = modellKuerzungFehler(r.mandant, altM);
  return k ? { code: k.code, text: k.grund } : null;
}

describe("A Hilfen", () => {
  it("A1 Folge lesen: Leerzeichen, Komma, Semikolon; „frei“ und „-“ sind frei; Rundweg", () => {
    expect(folgeLesen(" F F,S;S  frei - N ")).toEqual(["F", "F", "S", "S", "-", "-", "N"]);
    expect(folgeLesen("")).toEqual([]);
    expect(folgeText(["F", "-", "N"])).toBe("F - N");
    expect(folgeLesen(folgeText(["F", "-", "N"]))).toEqual(["F", "-", "N"]);
  });
  it("A2 unbekannte Kürzel werden genannt (je einmal), Dienstarten und frei nicht", () => {
    expect(unbekannteKennungen(["F", "X", "-", "X", "Q"], DIENSTARTEN)).toEqual(["X", "Q"]);
    expect(unbekannteKennungen(["F", "S", "N", "-"], DIENSTARTEN)).toEqual([]);
  });
  it("A3 keine feste Zykluslänge: jede Länge 1 … n, Wochen nur bei Vielfachen von 7", () => {
    const soll = { 1: "1 Tag", 5: "5 Tage", 7: "7 Tage (1 Woche)", 9: "9 Tage", 14: "14 Tage (2 Wochen)", 21: "21 Tage (3 Wochen)",
      28: "28 Tage (4 Wochen)", 42: "42 Tage (6 Wochen)", 1000: "1000 Tage" };
    for (const [n, t] of Object.entries(soll)) expect(zykluslaengeText(Number(n))).toBe(t);
    expect(zykluslaengeText(0)).toBe("keine Zyklustage");
  });
  it("A4 neue Kennung: Format des Servers, nie „betrieb“, nie belegt", () => {
    let i = 0; const folge = [0.5, 0.5, 0.25];
    const z = () => folge[i++ % folge.length];
    const a = neueKennung("sm", [], z);
    expect(a).toMatch(/^[A-Za-z0-9_-]{1,40}$/);
    const b = neueKennung("sm", [a], () => 0.5);   // dieselbe Zufallszahl ist belegt → Ausweichzähler
    expect(b).not.toBe(a);
    expect(b).toMatch(/^sm-/);
  });
  it("A5 Nutzer, Dienstart im Modell, Kennungen des Betriebs", () => {
    const m = betrieb();
    expect(nutzerDesModells(m, "sm-neun").map((p) => p.id)).toEqual(["p1"]);
    expect(nutzerDesModells(m, "sm-zwei")).toEqual([]);
    expect(modelleMitDienstart(m, "N").map((x) => x.id)).toEqual(["sm-neun"]);
    expect(modelleMitDienstart(m, "S").map((x) => x.id)).toEqual(["sm-neun", "sm-zwei"]);
    expect(alleZuordnungsKennungen(m)).toEqual(["sz-a"]);
  });
  it("A6 Lage am Tag: Modell mit Zyklustag, Betriebsmodell, kein Modell (Lücke), mehrdeutig, ungültig — nie still", () => {
    const m = betrieb();
    /* 2026-11-01 = Zyklustag versatz+1 = 3; am 20.11. sind 19 Tage vergangen: (19 + 2) mod 9 = 3 → Tag 4 */
    expect(lageAm(m, m.personen[0], "2026-11-01")).toEqual({ ton: "ok", text: "Neun-Tage-Folge — Zyklustag 3 von 9" });
    expect(lageAm(m, m.personen[0], HEUTE)).toEqual({ ton: "ok", text: "Neun-Tage-Folge — Zyklustag 4 von 9" });
    expect(lageAm(m, m.personen[1], HEUTE)).toEqual({ ton: "ok", text: "Schichtfolge des Betriebs" });
    const luecke = { id: "x", schichtmodellZuordnungen: [{ id: "a", modellId: "sm-zwei", gueltigAb: "2026-12-01", gueltigBis: null }] };
    expect(lageAm(m, luecke, HEUTE)).toEqual({ ton: "info", text: "kein Schichtmodell" });
    const doppelt = { id: "x", schichtmodellZuordnungen: [{ id: "a", modellId: "betrieb", gueltigAb: null, gueltigBis: null },
      { id: "b", modellId: "sm-zwei", gueltigAb: "2026-11-01", gueltigBis: null }] };
    expect(lageAm(m, doppelt, HEUTE).ton).toBe("danger");
    expect(lageAm(m, doppelt, HEUTE).text).toMatch(/mehrere Zuordnungen/);
    const versatz = { id: "x", schichtmodellZuordnungen: [{ id: "a", modellId: "sm-neun", gueltigAb: "2026-11-01", gueltigBis: null, versatz: 9 }] };
    expect(lageAm(m, versatz, HEUTE)).toEqual({ ton: "danger", text: "Startpunkt passt nicht zur Zykluslänge — bitte klären" });
  });
  it("A7 Zeitraum als Text; begonnen = Beginn bis einschließlich heute (oder offen)", () => {
    expect(zeitraumText({ gueltigAb: null, gueltigBis: null })).toBe("unbefristet");
    expect(zeitraumText({ gueltigAb: "2026-12-01", gueltigBis: null })).toBe("ab 2026-12-01");
    expect(zeitraumText({ gueltigAb: "2026-12-01", gueltigBis: "2026-12-31" })).toBe("2026-12-01 bis 2026-12-31");
    expect(zuordnungBegonnen({ gueltigAb: HEUTE }, HEUTE)).toBe(true);
    expect(zuordnungBegonnen({ gueltigAb: null }, HEUTE)).toBe(true);
    expect(zuordnungBegonnen({ gueltigAb: "2026-11-21" }, HEUTE)).toBe(false);
  });
});

describe("A8 Anzeigename", () => {
  it("Nachname, Vorname; sonst Name oder Kennung", () => {
    expect(personName({ id: "x", vorname: "Lia", nachname: "Probe" })).toBe("Probe, Lia");
    expect(personName({ id: "x", nachname: "Probe" })).toBe("Probe");
    expect(personName({ id: "x", name: "Anna Probe" })).toBe("Anna Probe");
    expect(personName({ id: "x" })).toBe("x");
    expect(personName(null)).toBe("");
  });
});

describe("B Vorprüfung in der Oberfläche = Befund des Servers", () => {
  const faelle = () => {
    const m = betrieb();
    const p1 = (liste) => mitZuordnungen(m, "p1", liste);
    const lauf = m.personen[0].schichtmodellZuordnungen[0];
    return [
      ["gültig: zweites Modell ab morgen, erstes endet heute", p1([{ ...lauf, gueltigBis: HEUTE },
        { id: "sz-b", modellId: "sm-zwei", gueltigAb: "2026-11-21", gueltigBis: null, versatz: 0 }]), null],
      ["gültig: Lücke (kein Schichtmodell) zulässig", p1([{ ...lauf, gueltigBis: "2026-11-30" },
        { id: "sz-b", modellId: "sm-zwei", gueltigAb: "2026-12-10", gueltigBis: null, versatz: 13 }]), null],
      ["Überschneidung", p1([lauf, { id: "sz-b", modellId: "sm-zwei", gueltigAb: "2026-12-01", gueltigBis: null }]), "UEBERSCHNEIDUNG"],
      ["rückwirkend (ab heute)", p1([{ ...lauf, gueltigBis: "2026-11-19" },
        { id: "sz-b", modellId: "sm-zwei", gueltigAb: HEUTE, gueltigBis: null }]), "RUECKWIRKEND"],
      ["laufende Zuordnung entfernt", p1([]), "RUECKWIRKEND"],
      ["Versatz außerhalb der Zykluslänge", p1([{ ...lauf, gueltigBis: HEUTE },
        { id: "sz-b", modellId: "sm-neun", gueltigAb: "2026-11-21", gueltigBis: null, versatz: 9 }]), "VERSATZ"],
      ["eigenes Modell ohne Beginn", mitZuordnungen(m, "p2", [{ id: "sz-c", modellId: "sm-zwei", gueltigAb: null, gueltigBis: null }]), "ANKER"],
      ["unbekanntes Modell", mitZuordnungen(m, "p2", [{ id: "sz-c", modellId: "sm-weg", gueltigAb: "2026-12-01", gueltigBis: null }]), "MODELL_UNBEKANNT"],
      ["Ende vor Beginn", mitZuordnungen(m, "p2", [{ id: "sz-c", modellId: "sm-zwei", gueltigAb: "2026-12-10", gueltigBis: "2026-12-01" }]), "REIHENFOLGE"],
      ["verwendetes Modell entfernt", mitModellen(m, m.schichtmodelle.filter((x) => x.id !== "sm-neun")), "MODELL_VERWENDET"],
      ["Modell mit unbekannter Dienstart", mitModellen(m, [...m.schichtmodelle, { id: "sm-x", name: "X", tage: ["Q"] }]), "DIENSTART"],
      ["Modell ohne Name", mitModellen(m, [...m.schichtmodelle, { id: "sm-x", name: " ", tage: ["F"] }]), "NAME"],
      ["Tage eines laufenden Modells geändert (wirkt ab heute)", mitModellen(m, m.schichtmodelle.map((x) => (x.id === "sm-neun"
        ? { ...x, tage: [...x.tage.slice(0, 8), "F"] } : x))), "RUECKWIRKEND"],
      ["neues Modell, unbenutztes Modell entfernt", mitModellen(m, [m.schichtmodelle[0], { id: "sm-7", name: "Woche", tage: ["F", "F", "F", "F", "F", "-", "-"] }]), null],
      /* Erste eigene Zuordnung einer Person ohne Liste: Vorher galt das Betriebsmodell unbefristet. Ohne ausdrückliche
         Fortsetzung bis zum Vortag wären die Tage davor „kein Schichtmodell“ — rückwirkend, abgewiesen. Die Oberfläche legt
         deshalb beim ersten Hinzufügen die Fortsetzung sichtbar in den Entwurf (ZuordnungenJePerson.hinzufuegen). */
      ["erste eigene Zuordnung ohne Fortsetzung des Betriebsmodells", mitZuordnungen(m, "p2", [{ id: "sz-c", modellId: "sm-zwei", gueltigAb: "2026-12-01", gueltigBis: null, versatz: 0 }]), "RUECKWIRKEND"],
      ["erste eigene Zuordnung mit Fortsetzung des Betriebsmodells bis heute", mitZuordnungen(m, "p2", [{ id: "sz-0", modellId: "betrieb", gueltigAb: null, gueltigBis: HEUTE },
        { id: "sz-c", modellId: "sm-zwei", gueltigAb: "2026-11-21", gueltigBis: null, versatz: 0 }]), null],
      ["Dienstart gelöscht, die ein Modell nennt", { ...m, dienstarten: m.dienstarten.filter((d) => d.id !== "N") }, "DIENSTART_VERWENDET"],
    ];
  };
  for (const [titel, neu, code] of faelle()) {
    it(`B ${titel}`, () => {
      const m = betrieb();
      const ui = entwurfPruefen(m, neu, HEUTE);
      const srv = server(m, neu);
      expect(ui ? ui.code : null).toBe(code);
      expect(ui).toEqual(srv);
    });
  }
  it("B Modell verkürzt, Zuordnung ab morgen mit Versatz ≥ neue Länge: 422-Befund MODELL_VERKUERZT_VERSATZ (wie daten.mjs)", () => {
    const m = betrieb();
    m.personen[1].schichtmodellZuordnungen = [{ id: "sz-k", modellId: "sm-zwei", gueltigAb: "2026-12-01", gueltigBis: null, versatz: 12 }];
    const neu = mitModellen(m, m.schichtmodelle.map((x) => (x.id === "sm-zwei" ? { ...x, tage: x.tage.slice(0, 7) } : x)));
    const ui = entwurfPruefen(m, neu, HEUTE);
    expect(ui && ui.code).toBe("MODELL_VERKUERZT_VERSATZ");
    expect(ui).toEqual(server(m, neu));
    expect(ui.text).toContain("erlaubt 0 bis 6");
  });
  it("B die Vorprüfung verändert den Betrieb nicht (rein)", () => {
    const m = betrieb(); const vorher = kopie(m);
    const neu = mitZuordnungen(m, "p2", [{ id: "sz-0", modellId: "betrieb", gueltigAb: null, gueltigBis: "2026-11-30" },
      { id: "sz-c", modellId: "sm-zwei", gueltigAb: "2026-12-01", gueltigBis: null, versatz: 3 }]);
    expect(entwurfPruefen(m, neu, HEUTE)).toBeNull();
    expect(m).toEqual(vorher);
  });
});

/* ---------- C „Nicht gespeichert“ ---------- */
const speicherAttrappe = (vorab = {}) => { const s = new Map(Object.entries(vorab)); return { getItem: (k) => (s.has(k) ? s.get(k) : null),
  setItem: (k, v) => s.set(k, String(v)), removeItem: (k) => s.delete(k), clear: () => s.clear() }; };
async function absage(antwort) {
  vi.resetModules();
  vi.stubGlobal("sessionStorage", speicherAttrappe({ "centric:token": "t-pruefung" }));
  vi.stubGlobal("localStorage", speicherAttrappe());
  vi.stubGlobal("fetch", async () => new Response(JSON.stringify(antwort.daten), { status: antwort.status, headers: { "content-type": "application/json" } }));
  const SP = await import("../src/speicher.js");
  const fehler = [];
  await SP.schreib({ version: 9, stand: 3, mandanten: [betrieb()] }, { sofort: true, onFehler: (l) => fehler.push(l) });
  return { SP, fehler };
}
const ohneZeit = (l) => { const { zeit, fehler: _f, ...rest } = l; void _f; expect(typeof zeit).toBe("string"); return rest; };
/** Echte Texte der Bibliothek zu jedem inhaltlichen Code (so, wie rechte.mjs sie als 403 weitergibt). */
function echteGruende() {
  const m = betrieb();
  return [
    entwurfPruefen(m, mitZuordnungen(m, "p1", [m.personen[0].schichtmodellZuordnungen[0], { id: "b", modellId: "sm-zwei", gueltigAb: "2026-12-01", gueltigBis: null }]), HEUTE),
    entwurfPruefen(m, mitZuordnungen(m, "p1", []), HEUTE),
    entwurfPruefen(m, mitModellen(m, m.schichtmodelle.slice(1)), HEUTE),
    entwurfPruefen(m, mitModellen(m, [...m.schichtmodelle, { id: "sm-x", name: "X", tage: ["Q"] }]), HEUTE),
    entwurfPruefen(m, { ...m, dienstarten: m.dienstarten.filter((d) => d.id !== "N") }, HEUTE),
    entwurfPruefen(m, { ...m, schichtmodelle: "kaputt" }, HEUTE),
    entwurfPruefen(m, mitZuordnungen(m, "p2", "kaputt"), HEUTE),
  ];
}

afterEach(() => { vi.unstubAllGlobals(); });

describe("C Nicht gespeichert: Absagen zu Schichtmodellen", () => {
  it("C1 Erkennung am stabilen Code des Servers (Präfix SCHICHTMODELL_), nie am Text", async () => {
    const { istSchichtmodellCode } = await import("../src/speicher.js");
    const gruende = echteGruende();
    expect(gruende.every(Boolean)).toBe(true);
    expect(gruende.map((g) => g.code)).toEqual(["UEBERSCHNEIDUNG", "RUECKWIRKEND", "MODELL_VERWENDET", "DIENSTART", "DIENSTART_VERWENDET", "FORM", "FORM"]);
    expect(SCHICHTMODELL_CODE_PRAEFIX).toBe("SCHICHTMODELL_");
    for (const g of gruende) expect(istSchichtmodellCode(schichtmodellAbsageCode(g.code)), g.code).toBe(true);
    expect(schichtmodellAbsageCode(undefined)).toBe("SCHICHTMODELL_ABGEWIESEN");
    expect(schichtmodellAbsageCode("x<y")).toBe("SCHICHTMODELL_ABGEWIESEN");
    /* Texte zählen nicht mehr (Folgepunkt 1 aus #423), auch nicht der echte Text; fremde und verstümmelte Codes nicht */
    for (const t of [...gruende.map((g) => g.text), "STEMPEL_UNVERAENDERLICH", "UEBERSCHNEIDUNG", "schichtmodell_x", " SCHICHTMODELL_X",
      `SCHICHTMODELL_${"A".repeat(60)}`, "SCHICHTMODELL_ü", "", null, undefined, 7])
      expect(istSchichtmodellCode(t), String(t)).toBe(false);
  });
  it("C2 422 MODELL_VERKUERZT_VERSATZ: eigene Lage mit Text und Feld des Servers, Bereich „Schichtmodelle“", async () => {
    const text = "Schichtmodelle: Das Schichtmodell sm-zwei hätte nur noch 7 Zyklustage … Es wurde nichts geändert.";
    const { SP, fehler } = await absage({ status: 422, daten: { fehler: "Das Schichtmodell ist für eine Zuordnung zu kurz.",
      code: "MODELL_VERKUERZT_VERSATZ", text, feld: "mandanten[0].schichtmodelle" } });
    expect(fehler).toHaveLength(1);
    expect(ohneZeit(fehler[0])).toEqual({ art: "schichtmodell", text, status: 422, feld: "mandanten[0].schichtmodelle", bereich: "Schichtmodelle" });
    expect(SP.ausstehend()).not.toBeNull();   // der Stand bleibt zum Sichern/Korrigieren
  });
  it("C3 inhaltliche 403 (Überschneidung): Lage „schichtmodell“ mit dem Grund als Text — nicht „keinRecht“", async () => {
    const g = echteGruende()[0];
    const { fehler } = await absage({ status: 403, daten: { fehler: "Keine Schreibberechtigung.", text: g.text, code: "SCHICHTMODELL_UEBERSCHNEIDUNG" } });
    expect(ohneZeit(fehler[0])).toEqual({ art: "schichtmodell", text: g.text, status: 403, feld: null, bereich: "Schichtmodelle" });
  });
  it("C3b rückwärtskompatibel (fail-safe): 403 mit Schichtmodell-Text, aber ohne Code bleibt „keinRecht“ mit Begründung", async () => {
    const g = echteGruende()[0];
    const { fehler } = await absage({ status: 403, daten: { fehler: "Keine Schreibberechtigung.", text: g.text } });
    expect(ohneZeit(fehler[0])).toEqual({ art: "keinRecht", text: "Keine Schreibberechtigung.", status: 403, grund: g.text });
  });
  it("C4 Differenz: andere 403 und andere 422 bleiben wie bisher", async () => {
    const faelle = [
      [{ status: 403, daten: { fehler: "Keine Schreibberechtigung.", text: "Einteilung am 2026-11-21 nicht möglich: Ruhezeit." } },
        { art: "keinRecht", text: "Keine Schreibberechtigung.", status: 403, grund: "Einteilung am 2026-11-21 nicht möglich: Ruhezeit." }],
      [{ status: 403, daten: { fehler: "Keine Schreibberechtigung." } }, { art: "keinRecht", text: "Keine Schreibberechtigung.", status: 403 }],
      [{ status: 422, daten: { fehler: "Die Dienstart ist unvollständig.", code: "ANDERS", text: "x" } }, { art: "unbekannt", text: "Die Dienstart ist unvollständig.", status: 422 }],
    ];
    for (const [antwort, lage] of faelle) {
      const { fehler } = await absage(antwort);
      expect(ohneZeit(fehler[0]), JSON.stringify(antwort)).toEqual(lage);
    }
  });
  it("C5 Leiste: Titel, Text des Servers mit Bereich, Verwerfen und Sichern — kein „Noch einmal senden“, keine Rollenmeldung", async () => {
    const { NichtGespeichert, SPEICHERLAGE } = await import("../src/ansichten/speicherlage.jsx");
    const text = "Schichtmodell-Zuordnung (Person p1): Die Zuordnungen sz-a und b überschneiden sich.";
    const html = renderToStaticMarkup(React.createElement(NichtGespeichert, { lage: { art: "schichtmodell", text, status: 403,
      zeit: "2026-11-20T08:00:00.000Z", feld: null, bereich: "Schichtmodelle" }, melde: () => {}, aufGeloest: () => {} }));
    expect(SPEICHERLAGE.schichtmodell).toMatchObject({ verwerfen: true });
    expect(SPEICHERLAGE.schichtmodell.nochmal).toBeUndefined();
    expect(html).toContain("Schichtmodell oder Zuordnung nicht gespeichert");
    expect(html).toContain("Bereich: <strong>Schichtmodelle</strong>");
    expect(html).toContain("überschneiden sich");
    expect(html).toContain("Änderungen verwerfen und neu laden");
    expect(html).toContain("Als Datei sichern");
    expect(html).not.toContain("Noch einmal senden");
    expect(html).not.toContain("mit deiner Rolle nicht zulässig");
  });
});

/* ---------- D Ansicht ---------- */
const sitzung = (rolle, mandant = betrieb()) => ({ rolle, mandant, person: { id: "p3", name: "Probe", rolle, bereich: "ALLE" } });
const html = (sitz) => renderToStaticMarkup(React.createElement(Schichtmodelle, { sitz, akt: {}, heuteTag: HEUTE }));

describe("S Schalter CENTRIC_SCHICHTMODELL_PFLEGE (P2-24 B, Vorgabe aus)", () => {
  it("S1 Vorgabe aus: auch die Leitung sieht keinen Abschnitt", () => {
    schichtmodellPflegeSetzen(false);
    expect(schichtmodellPflegeAn()).toBe(false);
    expect(html(sitzung("leitung"))).toBe("");
    for (const w of ["true", 1, "1", {}, null, undefined]) { schichtmodellPflegeSetzen(w); expect(schichtmodellPflegeAn(), String(w)).toBe(false); }
    schichtmodellPflegeSetzen(true);
    expect(html(sitzung("leitung"))).toContain("Schichtmodelle je Person");
    schichtmodellPflegeSetzen(false);
  });
  /** Echter Client: lies() mit der gegebenen GET-Antwort; danach der Merker. */
  async function gelesen(zusatz) {
    vi.resetModules();
    vi.stubGlobal("sessionStorage", speicherAttrappe({ "centric:token": "t-pruefung" }));
    vi.stubGlobal("localStorage", speicherAttrappe());
    const m = betrieb();
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ bestand: { version: 9, mandanten: [m] }, etag: "1", rolle: "leitung",
      person: "p3", betrieb: 0, name: "L", schreiben: "voll", ...zusatz }), { status: 200, headers: { "content-type": "application/json" } }));
    const SP = await import("../src/speicher.js");
    const S = await import("../src/lib/schichtmodell-schalter.js");
    S.schichtmodellPflegeSetzen(zusatz.schichtmodellPflege !== true);   // Gegenteil vorbelegen: lies() muss setzen
    const r = await SP.lies();
    return { an: S.schichtmodellPflegeAn(), r, m };
  }
  it("S2 die Quelle ist allein der Server: GET mit schichtmodellPflege: true → an; ohne Angabe oder anderer Wert → aus", async () => {
    expect((await gelesen({ schichtmodellPflege: true })).an).toBe(true);
    expect((await gelesen({})).an).toBe(false);
    expect((await gelesen({ schichtmodellPflege: "true" })).an).toBe(false);
  });
  it("S3 Schalter aus: Modelle und Zuordnungen bleiben im gelesenen Zustand (kein Datenverlust beim nächsten Speichern)", async () => {
    const { an, r, m } = await gelesen({});
    expect(an).toBe(false);
    expect(r.bestand.mandanten[0].schichtmodelle).toEqual(m.schichtmodelle);
    expect(r.bestand.mandanten[0].personen[0].schichtmodellZuordnungen).toEqual(m.personen[0].schichtmodellZuordnungen);
  });
  it("S4 Schalter aus + Speichern anderer Daten: der gesendete Bestand trägt Modelle und Zuordnungen unverändert", async () => {
    vi.resetModules();
    vi.stubGlobal("sessionStorage", speicherAttrappe({ "centric:token": "t-pruefung" }));
    vi.stubGlobal("localStorage", speicherAttrappe());
    const puts = [];
    vi.stubGlobal("fetch", async (url, opt = {}) => {
      if ((opt.method || "GET") === "PUT") puts.push(JSON.parse(opt.body));
      return new Response(JSON.stringify({ ok: true, etag: "2" }), { status: 200, headers: { "content-type": "application/json" } });
    });
    const SP = await import("../src/speicher.js");
    const S = await import("../src/lib/schichtmodell-schalter.js");
    expect(S.schichtmodellPflegeAn()).toBe(false);
    const m = betrieb();
    const geaendert = { ...m, personen: m.personen.map((p) => (p.id === "p2" ? { ...p, telefon: "123" } : p)) };
    await SP.schreib({ version: 9, stand: 3, mandanten: [geaendert] }, { sofort: true });
    expect(puts).toHaveLength(1);
    const gesendet = puts[0].bestand.mandanten[0];
    expect(gesendet.schichtmodelle).toEqual(m.schichtmodelle);
    expect(gesendet.personen[0].schichtmodellZuordnungen).toEqual(m.personen[0].schichtmodellZuordnungen);
  });
});

describe("D Ansicht", () => {
  /* Die Ansicht selbst prüfen: Schalter gezielt an (wie in Entwicklung und isolierten Prüfungen). */
  beforeEach(() => { schichtmodellPflegeSetzen(true); });
  afterEach(() => { schichtmodellPflegeSetzen(false); });
  it("D1 Rechte wie der Server: Leitung und Planung ja; Beschäftigte, Schichtverantwortung, Betriebsrat, Betreiber nein", () => {
    expect(darfSchichtmodelle(sitzung("leitung"))).toBe(true);
    expect(darfSchichtmodelle(sitzung("planer"))).toBe(true);
    for (const r of ["mitarbeiter", "subplaner", "betriebsrat"]) {
      expect(darfSchichtmodelle(sitzung(r)), r).toBe(false);
      expect(html(sitzung(r)), r).toBe("");
    }
    expect(darfSchichtmodelle({ rolle: "betreiber", mandant: betrieb(), person: { id: "x", rolle: "leitung" } })).toBe(false);
    expect(darfSchichtmodelle(null)).toBe(false);
  });
  it("D1b Review #423 A1: Rechte aus der festen Matrix des Servers, nie aus der Betriebsmatrix", () => {
    /* Betriebsmatrix gibt der Schichtverantwortung staff.edit + pattern.edit: der Server verwürfe still → keine Pflege */
    const m = betrieb();
    m.matrix = { subplaner: ["staff.edit", "pattern.edit", "org.edit"], leitung: [], planer: [] };
    expect(darfSchichtmodelle({ rolle: "subplaner", mandant: m, person: { id: "s", rolle: "subplaner", bereich: "e1" } })).toBe(false);
    expect(html({ rolle: "subplaner", mandant: m, person: { id: "s", rolle: "subplaner", bereich: "e1" } })).toBe("");
    /* Betriebsmatrix nimmt Leitung/Planung die Rechte: der Server erlaubt es weiter → Pflege bleibt */
    for (const r of ["leitung", "planer"]) expect(darfSchichtmodelle({ rolle: r, mandant: m, person: { id: "x", rolle: r, bereich: "ALLE" } }), r).toBe(true);
    /* Zugang der Altrolle „kunde“ (Server: alle Rechte außer plan.publish) */
    expect(darfSchichtmodelle({ rolle: "leitung", zugangRolle: "kunde", mandant: m, person: { id: "x", rolle: "mitarbeiter" } })).toBe(true);
    /* Delta-Review H-a: Es zählt die Rolle der Sitzung (Zugang, Server: sitzung.rolle), nicht die der angezeigten Person */
    expect(darfSchichtmodelle({ rolle: "kunde", zugangRolle: "mitarbeiter", mandant: m, person: { id: "x", rolle: "leitung", bereich: "ALLE" } })).toBe(false);
    expect(darfSchichtmodelle({ rolle: "kunde", zugangRolle: "subplaner", mandant: m, person: { id: "x", rolle: "planer", bereich: "ALLE" } })).toBe(false);
    expect(darfSchichtmodelle({ rolle: "kunde", zugangRolle: "planer", mandant: m, person: { id: "x", rolle: "mitarbeiter", bereich: "e1" } })).toBe(true);
    expect(darfSchichtmodelle({ rolle: "kunde", zugangRolle: "betriebsrat", mandant: m, person: { id: "x", rolle: "leitung", bereich: "ALLE" } })).toBe(false);
    expect(darfSchichtmodelle({ rolle: "kunde", zugangRolle: "betreiber", mandant: m, person: { id: "x", rolle: "leitung", bereich: "ALLE" } })).toBe(false);
    for (const r of ["leitung", "planer", "subplaner", "mitarbeiter", "betriebsrat"])
      expect(darfSchichtmodelle({ rolle: "kunde", zugangRolle: r, mandant: m, person: { id: "x", rolle: "mitarbeiter", bereich: "ALLE" } }), `Zugang ${r}`)
        .toBe(serverDarf(r, "staff.edit") && (serverDarf(r, "org.edit") || serverDarf(r, "pattern.edit")));
    /* Gleichlauf mit der Serverregel (rechte.mjs darf, feste MATRIX) für jede Rolle */
    const server = (r) => serverDarf(r, "staff.edit") && (serverDarf(r, "org.edit") || serverDarf(r, "pattern.edit"));
    for (const r of ["leitung", "planer", "subplaner", "mitarbeiter", "betriebsrat"])
      expect(darfSchichtmodelle({ rolle: r, mandant: m, person: { id: "x", rolle: r, bereich: "ALLE" } }), r).toBe(server(r));
  });
  it("D1c Review #423 H1: eine neue Zeile mit geleertem „Gültig ab“ bleibt bearbeitbar; nur die Fortsetzung gilt als begonnen", () => {
    const m = betrieb();
    const z = { id: "n1", modellId: "sm-neun", gueltigAb: null, gueltigBis: null, versatz: 0 };
    const zeile = (fortsetzung) => renderToStaticMarkup(React.createElement(ZuordnungsZeile, { z, i: 0, m, heute: HEUTE, alt: null,
      fortsetzung, onAendern() {}, onEntfernen() {} }));
    const tag = (h, label) => (h.match(new RegExp(`<(?:input|select)\\b[^>]*aria-label="${label}"[^>]*>`)) || [""])[0];
    const neu = zeile(false);
    expect(tag(neu, "Gültig ab, Zuordnung 1")).not.toContain(`disabled=""`);
    expect(tag(neu, "Schichtmodell der Zuordnung 1")).not.toContain(`disabled=""`);
    expect(neu).toContain("Zuordnung 1 entfernen");
    const fort = zeile(true);
    expect(tag(fort, "Gültig ab, Zuordnung 1")).toContain(`disabled=""`);
    expect(fort).not.toContain("Zuordnung 1 entfernen");
  });
  it("D1d Review #423 H4: Personenauswahl robust bei leerer oder geänderter Liste", () => {
    const l = [{ id: "a" }, { id: "b" }];
    expect(wirksamePerson(l, null)).toBe("a");
    expect(wirksamePerson(l, "b")).toBe("b");
    expect(wirksamePerson(l, "weg")).toBe("a");
    expect(wirksamePerson([], "b")).toBe("");
    expect(wirksamePerson(undefined, null)).toBe("");
    const m = betrieb(); m.personen = [];
    expect(html(sitzung("leitung", m))).not.toContain("Zuordnungen je Person");
  });
  it("D2 Leitung: Hinweis ohne Planwirkung, beide Modelle mit eigener Zykluslänge, Nutzerzahl, Folge als Text", () => {
    const h = html(sitzung("leitung"));
    expect(h).toContain("Schichtmodelle je Person");
    expect(h).toContain("Noch ohne Wirkung auf den Dienstplan");
    expect(h).toContain("frühestens ab morgen");
    expect(h).toContain("Neun-Tage-Folge");
    expect(h).toContain("9 Tage · 1 Person zugeordnet");
    expect(h).toContain("14 Tage (2 Wochen) · 0 Personen zugeordnet");
    expect(h).toMatch(/aria-label="Folge: F, F, S, S, N, N, frei, frei, frei"/);
    expect(h).toContain("Neues Schichtmodell");
  });
  it("D3 Zuordnungen: erste Person (alphabetisch), heutige Lage, laufende Zuordnung gesperrt außer „Gültig bis“", () => {
    const h = html(sitzung("leitung"));
    expect(h).toContain("Heute: <b>Neun-Tage-Folge — Zyklustag 4 von 9</b>");
    expect(h).toContain("Ab morgen: <b>Neun-Tage-Folge — Zyklustag 5 von 9</b>");
    expect(h).toContain("ab 2026-11-01 · begonnen, nur „Gültig bis“ ab heute änderbar");
    const tag = (label) => (h.match(new RegExp(`<(?:input|select)\\b[^>]*aria-label="${label}"[^>]*>`)) || [""])[0];
    expect(tag("Schichtmodell der Zuordnung 1")).toContain(`disabled=""`);
    expect(tag("Gültig ab, Zuordnung 1")).toContain(`disabled=""`);
    expect(tag("Startpunkt im Zyklus, Zuordnung 1")).toContain(`disabled=""`);
    expect(tag("Gültig bis, Zuordnung 1")).toMatch(/^<input/);
    expect(tag("Gültig bis, Zuordnung 1")).not.toContain(`disabled=""`);
    expect(h).not.toContain("Zuordnung 1 entfernen");     // begonnen: nicht entfernbar (wäre rückwirkend)
    expect(h).toContain("Übernehmen");
  });
  it("D4 ohne Modelle: Leertext; Person ohne Zuordnung: Betriebsmodell unbefristet", () => {
    const m = betrieb(); m.schichtmodelle = []; m.personen = [{ id: "p2", name: "Bert Probe", rolle: "mitarbeiter" }];
    const h = html(sitzung("leitung", m));
    expect(h).toContain("Noch kein eigenes Schichtmodell");
    expect(h).toContain("Keine eigene Zuordnung — es gilt unbefristet die Schichtfolge des Betriebs.");
    expect(h).toContain("Heute: <b>Schichtfolge des Betriebs</b>");
  });
  it("D5 Klärungsfälle werden sichtbar benannt (mehrdeutig, Versatz ungültig)", () => {
    const m = betrieb();
    m.personen[0].schichtmodellZuordnungen[0].versatz = 20;
    expect(html(sitzung("leitung", m))).toContain("Startpunkt passt nicht zur Zykluslänge — bitte klären");
  });
  it("D6 WP-40: jedes Eingabefeld und jede Auswahl hat einen zugänglichen Namen; Knöpfe tragen Text", () => {
    const h = html(sitzung("leitung"));
    const felder = [...h.matchAll(/<(input|select)\b[^>]*>/g)].map((x) => x[0]);
    expect(felder.length).toBeGreaterThan(3);
    for (const f of felder) {
      const id = (/\sid="([^"]+)"/.exec(f) || [])[1];
      const benannt = /aria-label="[^"]+"/.test(f) || (id && h.includes(`for="${id}"`));
      expect(benannt, f).toBe(true);
    }
    for (const b of [...h.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)]) expect(b[1].replace(/<[^>]+>/g, "").trim() || /aria-label=/.test(b[0]), b[0]).toBeTruthy();
  });
  it("D7 nur vorhandene Bausteine und Tokens: keine festen Farben, Radien, Schatten; Klassen .m-tabs/.bpille unberührt", () => {
    const q = quelle("../src/ansichten/schichtmodelle.jsx");
    expect(q).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(q).not.toMatch(/rgba?\(/);
    expect(q).not.toMatch(/borderRadius|boxShadow|box-shadow/);
    expect(q).toMatch(/from "\.\.\/ui\/bausteine\.jsx"/);
    expect(q).toMatch(/from "\.\.\/farben\.js"/);
    expect(q).not.toMatch(/m-tabs|bpille/);
  });
});

/* ---------- E Verdrahtung ---------- */
describe("E Verdrahtung", () => {
  it("E0 Schalter: Server meldet ihn nur bei genau „true“, Vorgabe aus; .env.example dokumentiert ihn auskommentiert", async () => {
    const { schichtmodellPflegeAn: serverAn } = await import("../server/lib/schalter.mjs");
    const vorher = process.env.CENTRIC_SCHICHTMODELL_PFLEGE;
    try {
      delete process.env.CENTRIC_SCHICHTMODELL_PFLEGE; expect(serverAn()).toBe(false);
      for (const w of ["1", "TRUE", " true", "true ", "yes", "an"]) { process.env.CENTRIC_SCHICHTMODELL_PFLEGE = w; expect(serverAn(), w).toBe(false); }
      process.env.CENTRIC_SCHICHTMODELL_PFLEGE = "true"; expect(serverAn()).toBe(true);
    } finally { if (vorher === undefined) delete process.env.CENTRIC_SCHICHTMODELL_PFLEGE; else process.env.CENTRIC_SCHICHTMODELL_PFLEGE = vorher; }
    const env = quelle("../.env.example");
    expect(env).toMatch(/^# CENTRIC_SCHICHTMODELL_PFLEGE=true$/m);
    expect(env).not.toMatch(/^CENTRIC_SCHICHTMODELL_PFLEGE=/m);
    expect(quelle("../server/funktionen/daten.mjs")).toContain("...(schichtmodellPflegeAn() ? { schichtmodellPflege: true } : {})");
  });
  it("E1 Schichtfolge bindet die Ansicht ein", () => {
    const q = quelle("../src/ansichten/schichtfolge.jsx");
    expect(q).toContain('import { Schichtmodelle } from "./schichtmodelle.jsx";');
    expect(q).toContain("<Schichtmodelle sitz={sitz} akt={akt} />");
  });
  it("E2 Aktionen setzen nur die beiden Felder über mUpd; Dienstart im Modell sperrt das Löschen in der Oberfläche", () => {
    const q = quelle("../src/app/aktionen/plan.js");
    expect(q).toMatch(/setzeSchichtmodelle: \(liste, text\) => mUpd\(\(m\) => mitModellen\(m, liste\)/);
    expect(q).toMatch(/setzeSchichtmodellZuordnungen: \(pid, liste, text\) => mUpd\(\(m\) => mitZuordnungen\(m, pid, liste\)/);
    expect(q).toContain("const sm = modelleMitDienstart(m, id);");
    expect(q).toContain("Dienstart wird noch im Schichtmodell");
    /* die Hilfen setzen genau das eine Feld, alles andere bleibt (auch fremde Personen) */
    const m = betrieb();
    const n = mitZuordnungen(m, "p2", []);
    expect(n.personen[1]).toEqual({ ...m.personen[1], schichtmodellZuordnungen: [] });
    expect(n.personen[0]).toBe(m.personen[0]);
    expect(mitModellen(m, [])).toEqual({ ...m, schichtmodelle: [] });
  });
  it("E3 die Pflegehilfe rechnet nichts in den Plan (keine Planwirkung, P2-4 Punkt 6 offen)", () => {
    const q = quelle("../src/lib/schichtmodelle-pflege.js");
    expect(q).not.toMatch(/dienstAm|modellDienstAm|fachlogik/);
    expect(quelle("../src/lib/fachlogik.js")).not.toMatch(/schichtmodellZuordnungen|schichtmodelle-pflege/);
    /* nur die Ansicht und die Aktionen nutzen die Pflegehilfe — keine Rechen- oder Planmodule */
    const alle = (rel) => readdirSync(new URL(`../${rel}/`, import.meta.url), { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? alle(`${rel}/${e.name}`) : /\.(js|jsx|mjs)$/.test(e.name) ? [`${rel}/${e.name}`] : []);
    const nutzer = alle("src").filter((r) => r !== "src/lib/schichtmodelle-pflege.js" && quelle(`../${r}`).includes("schichtmodelle-pflege"));
    expect(nutzer.sort()).toEqual(["src/ansichten/schichtmodelle.jsx", "src/app/aktionen/plan.js"]);
    /* Delta-Review H-b: anzuwendendesModell/modellDienstAm nur als reine Anzeige — einzige Stelle der Oberfläche ist lageAm
       in der Pflegehilfe, und lageAm wird nur von der Ansicht als Text gezeigt (kein Rechen- oder Planmodul). */
    const pflege = quelle("../src/lib/schichtmodelle-pflege.js");
    expect(pflege.match(/anzuwendendesModell\(/g) || []).toHaveLength(1);
    expect(pflege).toMatch(/export function lageAm\([^)]*\) \{\n {2}const r = anzuwendendesModell\(m, p, datum\);/);
    const rechnet = alle("src").filter((r) => /anzuwendendesModell|modellDienstAm/.test(quelle(`../${r}`)));
    expect(rechnet).toEqual(["src/lib/schichtmodelle-pflege.js"]);
    const lageNutzer = alle("src").filter((r) => r !== "src/lib/schichtmodelle-pflege.js" && /\blageAm\b/.test(quelle(`../${r}`)));
    expect(lageNutzer).toEqual(["src/ansichten/schichtmodelle.jsx"]);
    /* die Ansicht verwendet nur .text und .ton (Anzeige), nichts davon geht in eine Aktion */
    const ansicht = quelle("../src/ansichten/schichtmodelle.jsx");
    expect([...ansicht.matchAll(/(heuteLage|morgenLage)\.(\w+)/g)].map((x) => x[2]).every((k) => k === "text" || k === "ton")).toBe(true);
    expect(ansicht).not.toMatch(/akt\.[\w]+\([^)]*(heuteLage|morgenLage)/);
  });
});
