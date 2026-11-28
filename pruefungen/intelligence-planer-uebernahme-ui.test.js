/* ==========================================================================
   WP-I7 — PLANVORSCHLAG-ÜBERNAHME, Stufe 3: Oberfläche (src/ansichten/planer-vorschlag.jsx, src/lib/planer-aktionen.js,
   src/lib/planer-oberflaeche.js) und ihr Weg zu den Server-Wegen

   Nur synthetische Daten, Uhr fest (vi.useFakeTimers, nur Date). PLANER_AN bleibt im Code AUS; die Prüfung gibt den Planer nur über
   den Prüf-Zugang frei (vi.mock von engine/planer.mjs, nur im Ende-zu-Ende-Teil) — nie über eine Anfrage.
   1. Texte je Kennung: jede Kennung der Server-Tabelle hat einen deutschen Text; keine Rohkennung, kein Servertext; unklar → neu laden.
   2. Sichtbarkeit: nur Leitung und Planung, nie Demo, Schichtverantwortung, Beschäftigte, Betriebsrat; ohne Aktionen nichts.
   3. Ehrlich bei ausgeschaltetem Planer (Produktivzustand): „nicht freigegeben“, Erstellen aus; die Rücknahme bleibt erreichbar (C-4).
   4. Ablauf in der Ansicht: Namen nur aus der eigenen Sicht, offene Lücken und Gründe, „nicht bewertbar“ nie erfüllt, Bestätigung nur nach
      der Prüfung und nur als Klick, keine Rohkennung und kein Person|Tag im Markup, Zielgrößen.
   5. Aktionen: Rumpf nur Kennung/Indizes/Bestätigung; Prüfen nie mit Bestätigung; Mehrfachklick sendet einmal; nach Erfolg Neuladen;
      unklar → neu laden und nie blind wiederholen; 503 wiederholbar.
   6. Ende zu Ende gegen den echten Handler (daten.mjs): Vorschlag → Prüfen → Übernehmen → Liste → Rücknahme; Planer aus.
   Aufruf: TZ=UTC npx vitest run pruefungen/intelligence-planer-uebernahme-ui.test.js
   ========================================================================== */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { baueLeerenBetrieb } from "../server/lib/leerbetrieb.mjs";

/* Der Browser-Speicher: nur der Weg zu den Server-Wegen und die Zugangsdaten sind ersetzt. */
const SPM = vi.hoisted(() => ({ planerWegSenden: null, zugang: () => ({}) }));
vi.mock("../src/speicher.js", () => ({ planerWegSenden: (...a) => SPM.planerWegSenden(...a), zugangsdaten: () => SPM.zugang() }));
/* Prüf-Zugang zur Freigabe des Planers (PLANER_AN bleibt im Code AUS); ohne Schalter gilt die echte Vorgabe (AUS). */
vi.mock("../server/lib/engine/planer.mjs", async (original) => {
  const o = /** @type {any} */ (await original());
  return { ...o, get PLANER_AN() { return globalThis.__uiFreiPruefung === true; } };
});

import { PlanerVorschlag, PlanerVorschlagAnsicht, VORSCHLAG_TEXTE } from "../src/ansichten/planer-vorschlag.jsx";
import { planerAktionen } from "../src/lib/planer-aktionen.js";
import { VORSCHLAG_FEHLER, VORSCHLAG_ABLEHNUNG, planerWegFehler, vorschlagZeilen, ablehnungen, unterbesetztAnzeige, vorschlagErstellenGrund, planerRechte, planerZustand }
  from "../src/lib/planer-oberflaeche.js";
import { ANHEFTEN_ROLLEN } from "../server/lib/anheften.mjs";
import { UEBERNAHME_ROLLEN } from "../server/lib/engine/planer-uebernahme.mjs";
import { PLANER_WEGE } from "../server/lib/planer-aktion.mjs";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lies = (r) => readFile(path.join(WURZEL, r), "utf8");
const T0 = "2026-11-27T10:00:00.000Z";
const YM = "2026-12";
const WIRT = "127.0.0.1:3000";
const st = { am: T0, vonRolle: "leitung" };
const FREI = Object.freeze({ betrieb: { an: true, ...st }, betriebsratFrage: { antwort: "nein", ...st }, planerSchalter: { an: true, ...st } });
const html = (el) => renderToStaticMarkup(el);
const frei = (an) => { globalThis.__uiFreiPruefung = an; };

/* ---- Baum der Elemente: Knöpfe finden, ohne Browser (Muster intelligence-planer-oberflaeche.test.js) ---- */
const finde = (n, test, aus = []) => {
  if (!n || typeof n !== "object") return aus;
  if (Array.isArray(n)) { n.forEach((x) => finde(x, test, aus)); return aus; }
  if (n.props) { if (test(n)) aus.push(n); finde(n.props.children, test, aus); }
  return aus;
};
const textVon = (c) => (Array.isArray(c) ? c.map(textVon).join("") : typeof c === "string" || typeof c === "number" ? String(c) : "");
const knoepfe = (baum) => finde(baum, (n) => typeof n.props.onClick === "function");
const knopf = (baum, text) => knoepfe(baum).find((n) => textVon(n.props.children).trim() === text) || null;

/* ---- Beispielbetrieb (Kennungen bewusst auffällig, damit sie im Markup nie unbemerkt bleiben) ---- */
const betrieb = (steuerung = FREI) => ({ id: "m-a", einstellungen: { kiSteuerung: structuredClone(steuerung) },
  personen: [{ id: "zq-person-7", vorname: "Anna", nachname: "Alt", rolle: "mitarbeiter" }, { id: "zq-person-9", vorname: "Bert", nachname: "Bau", rolle: "mitarbeiter" }],
  dienstarten: [{ id: "zq-dienst-F", name: "Frühdienst" }, { id: "zq-dienst-N", name: "Nachtdienst" }], abweichungen: {} });
const EINTRAEGE = [
  { index: 0, personId: "zq-person-7", datum: "2026-12-03", dienstId: "zq-dienst-F", art: "luecke" },
  { index: 1, personId: "zq-person-9", datum: "2026-12-05", dienstId: "zq-dienst-N", art: "luecke" },
  { index: 2, personId: "zq-person-7", datum: "2026-12-04", dienstId: "zq-dienst-F", art: "luecke" }];
const sitzFuer = (m, rolle, extra = {}) => ({ rolle: "kunde", zugangRolle: rolle, mandant: m, person: { id: "x1", rolle, vorname: "V", nachname: "N" }, ...extra });
const ROHKENNUNG = /pv-[0-9a-f]{8}|pu-[0-9a-f]{8}|zq-person|zq-dienst|zq-person-\d\|/;

beforeAll(() => { vi.useFakeTimers({ now: new Date(T0), toFake: ["Date"] }); });
afterAll(() => { vi.useRealTimers(); frei(false); });
afterEach(() => { frei(false); SPM.zugang = () => ({}); SPM.planerWegSenden = null; });

/* ------------------------------------------------------------------ 1. Texte je Kennung */
describe("1. Texte je Kennung des Servers", () => {
  it("jede Kennung der Statustabelle des Servers hat einen Text; keine Rohkennung und kein Kürzel im Text", async () => {
    const q = await lies("server/lib/planer-aktion.mjs");
    const tabelle = q.slice(q.indexOf("const STATUS = Object.freeze({"), q.indexOf("/** Unbekannte Kennung"));
    const codes = [...tabelle.matchAll(/"([a-z]+(?:-[a-z]+)*)":\s*\d{3}/g)].map((x) => x[1]);
    expect(codes.length).toBeGreaterThan(35);
    expect(codes.filter((c) => !Object.hasOwn(VORSCHLAG_FEHLER, c))).toEqual([]);
    for (const [c, t] of Object.entries(VORSCHLAG_FEHLER)) {
      expect(t.length, c).toBeGreaterThan(20);
      expect(t, c).toMatch(/[a-zäöüß]{4}/);
      expect(t, c).not.toMatch(/\b[a-z]+(?:-[a-z]+)+\b/);   // keine Kennung wie „planer-nicht-freigegeben“
      expect(t, c).not.toMatch(/\b(pv|pu)-|HTTP|Status \d{3}|\b\d{3}\b/);
    }
  });
  it("jede Kennung, die der Kern und die Aktion melden, hat einen Text (außer der inneren patch-ungueltig, die zu anwendung-fehlgeschlagen wird)", async () => {
    const quellen = (await lies("server/lib/planer-aktion.mjs")) + (await lies("server/lib/engine/planer-uebernahme.mjs"));
    const gemeldet = new Set([...quellen.matchAll(/\bnein\("([a-z]+(?:-[a-z]+)*)"/g)].map((x) => x[1]));
    for (const x of quellen.matchAll(/grund: "([a-z]+(?:-[a-z]+)*)"/g)) gemeldet.add(x[1]);
    for (const x of quellen.matchAll(/return "([a-z]+(?:-[a-z]+)+)"/g)) gemeldet.add(x[1]);
    for (const x of quellen.matchAll(/\bweg\("([a-z]+(?:-[a-z]+)*)"/g)) gemeldet.add(x[1]);
    gemeldet.delete("patch-ungueltig");
    expect([...gemeldet].filter((c) => !Object.hasOwn(VORSCHLAG_FEHLER, c) && !Object.hasOwn(VORSCHLAG_ABLEHNUNG, c))).toEqual([]);
    expect(quellen).toContain('nein("anwendung-fehlgeschlagen")');   // Grundlage der Ausnahme oben
  });
  it("bekannte Kennung: Text der Tabelle (nie der Servertext); die Absage trägt die Folgen (neu laden, verbraucht, unklar)", () => {
    const f = planerWegFehler(409, { ok: false, code: "planer-nicht-freigegeben", fehler: "Servertext, der nie erscheint" });
    expect(f.text).toBe(VORSCHLAG_FEHLER["planer-nicht-freigegeben"]);
    expect(f.text).toContain("nicht freigegeben");
    expect(f.text).toContain("zurücknehmen");
    expect(f).toMatchObject({ code: "planer-nicht-freigegeben", unklar: false, neuLaden: false, verbraucht: false });
    expect(planerWegFehler(500, { code: "schreiben-unklar" })).toMatchObject({ unklar: true, neuLaden: true, verbraucht: true });
    expect(planerWegFehler(500, { code: "schreiben-unklar" }).text).toMatch(/nicht erneut absenden[\s\S]*neu laden/);
    expect(planerWegFehler(503, { code: "schreiben-fehlgeschlagen" })).toMatchObject({ unklar: false, neuLaden: false, verbraucht: false });
    expect(planerWegFehler(503, { code: "schreiben-fehlgeschlagen" }).text).toContain("noch einmal versuchen");
    expect(planerWegFehler(409, { code: "konflikt" })).toMatchObject({ neuLaden: true, verbraucht: false });
    expect(planerWegFehler(409, { code: "seit-vorschlag-geaendert" })).toMatchObject({ neuLaden: true, verbraucht: true });
    expect(planerWegFehler(410, { code: "vorschlag-abgelaufen" })).toMatchObject({ verbraucht: true, neuLaden: false });
    expect(planerWegFehler(409, { code: "seit-uebernahme-geaendert" }).text).toContain("von Hand");
    expect(planerWegFehler(429, { code: "zu-viele-vorschlaege" }).text).toBe(VORSCHLAG_FEHLER["zu-viele-vorschlaege"]);
  });
  it("unbekannte Kennung oder keine: Text nach Status (429, 413, 401, 403), sonst der allgemeine Text; nie ein Servertext", () => {
    expect(planerWegFehler(429, { fehler: "Zu viele Anfragen, Wartezeit 30" }).text).toContain("Zu viele Anfragen in kurzer Zeit");
    expect(planerWegFehler(413, { fehler: "Anfrage zu groß." }).text).toContain("zu groß");
    expect(planerWegFehler(401, null).text).toContain("neu anmelden");
    expect(planerWegFehler(403, { code: "unbekannt-neu" }).text).toBe(VORSCHLAG_FEHLER["keine-berechtigung"]);
    const roh = planerWegFehler(409, { code: "neue-kennung-des-servers", fehler: "Servertext ABC" });
    expect(roh.code).toBeNull();
    expect(roh.text).toContain("nichts verändert");
    expect(roh.text).not.toContain("Servertext");
    expect(planerWegFehler(409, { code: "neue-kennung-des-servers" }, { schreibend: true }).unklar).toBe(false);   // ein 409 ist ausdrücklich eine Absage
  });
  it("Bestätigung ohne Antwort oder mit 5xx ohne Kennung: unklar, nie blind wiederholen", () => {
    for (const status of [0, 500, 502, 504]) {
      const f = planerWegFehler(status, null, { schreibend: true });
      expect([f.code, f.unklar, f.neuLaden, f.verbraucht], String(status)).toEqual(["schreiben-unklar", true, true, true]);
    }
    expect(planerWegFehler(502, null).unklar).toBe(false);   // nur lesende Anfragen: nichts geschrieben
  });
  it("abgelehnte Einteilungen: der Index des Servers meint die gesendete Auswahl; Gründe als Text, unbekannt als „nicht bewertbar“", () => {
    const gesendet = [2, 5, 9];
    const a = ablehnungen([{ index: 1, grund: "abwesend" }, { index: 2, grund: "regel", regeln: ["x-y-z"] }, { index: 0, grund: "neuer-grund" }, { index: 7, grund: "abwesend" }, "x"], gesendet);
    expect(a).toEqual([{ index: 5, text: VORSCHLAG_ABLEHNUNG.abwesend }, { index: 9, text: VORSCHLAG_ABLEHNUNG.regel }, { index: 2, text: "nicht möglich (Grund nicht bewertbar)" }]);
    expect(JSON.stringify(a)).not.toContain("x-y-z");
    for (const t of Object.values(VORSCHLAG_ABLEHNUNG)) expect(t).not.toMatch(/\b[a-z]+(?:-[a-z]+)+\b/);
    expect(ablehnungen(null, gesendet)).toEqual([]);
  });
  it("Besetzungshinweis: null und Unlesbares sind „nicht bewertbar“, nur die leere Liste ist „keine Lücke“", () => {
    const m = betrieb();
    expect(unterbesetztAnzeige(null, m).zustand).toBe("nicht_bewertbar");
    expect(unterbesetztAnzeige(undefined, m).zustand).toBe("nicht_bewertbar");
    expect(unterbesetztAnzeige("keine", m).zustand).toBe("nicht_bewertbar");
    expect(unterbesetztAnzeige([{ datum: "2026-12-03", dienstId: "zq-dienst-F", fehlt: 1 }], m).zustand).toBe("nicht_bewertbar");   // qualFehlt fehlt
    expect(unterbesetztAnzeige([{ datum: "kaputt", dienstId: "zq-dienst-F", fehlt: 1, qualFehlt: false }], m).zustand).toBe("nicht_bewertbar");
    expect(unterbesetztAnzeige([], m)).toEqual({ zustand: "keine", zeilen: [] });
    expect(unterbesetztAnzeige([{ datum: "2026-12-03", dienstId: "zq-dienst-F", fehlt: 2, qualFehlt: true }], m))
      .toEqual({ zustand: "luecken", zeilen: [{ datum: "2026-12-03", dienstName: "Frühdienst", fehlt: 2, qualFehlt: true }] });
  });
  it("Namen nur aus der eigenen Sicht; sortiert nach Tag; unbekannte Person ohne Kennung", () => {
    const z = vorschlagZeilen(betrieb(), EINTRAEGE);
    expect(z.map((x) => [x.index, x.personName, x.datum, x.dienstName])).toEqual([[0, "Anna Alt", "2026-12-03", "Frühdienst"], [2, "Anna Alt", "2026-12-04", "Frühdienst"], [1, "Bert Bau", "2026-12-05", "Nachtdienst"]]);
    const fremd = vorschlagZeilen({ personen: [], dienstarten: [] }, [EINTRAEGE[0]]);
    expect(fremd[0]).toMatchObject({ personName: "Person (nicht im Bestand)", dienstName: "Dienst" });
    expect(JSON.stringify(fremd)).not.toMatch(/zq-/);
    expect(vorschlagZeilen(null, "x")).toEqual([]);
  });
});

/* ------------------------------------------------------------------ 2. Sichtbarkeit */
describe("2. Sichtbarkeit: nur Leitung und Planung, nie Demo", () => {
  const aktLeer = () => ({ planerVorschlagErzeugen: vi.fn(), planerAuswahlPruefen: vi.fn(), planerUebernehmen: vi.fn(), planerRueckgaengigListe: vi.fn(), planerRueckgaengigPruefen: vi.fn(), planerRueckgaengigAusfuehren: vi.fn() });
  it("Leitung und Planung sehen den Bereich; Schichtverantwortung, Beschäftigte, Betriebsrat, Betreiber, Kundenrolle ohne Person, Demo und ohne Aktionen nichts", () => {
    const m = betrieb();
    const akt = aktLeer();
    for (const r of ["leitung", "planer"]) expect(html(h(PlanerVorschlag, { m, ym: YM, sitz: sitzFuer(m, r), akt })), r).toContain('data-testid="planer-vorschlag"');
    for (const r of ["subplaner", "mitarbeiter", "betriebsrat", "betreiber", "kunde", "gast", undefined]) expect(html(h(PlanerVorschlag, { m, ym: YM, sitz: sitzFuer(m, r), akt })), String(r)).toBe("");
    expect(html(h(PlanerVorschlag, { m, ym: YM, sitz: sitzFuer(m, "leitung", { demo: true }), akt }))).toBe("");
    SPM.zugang = () => ({ demo: true });
    expect(html(h(PlanerVorschlag, { m, ym: YM, sitz: sitzFuer(m, "planer"), akt }))).toBe("");
    SPM.zugang = () => ({});
    expect(html(h(PlanerVorschlag, { m, ym: YM, sitz: sitzFuer(m, "leitung"), akt: {} }))).toBe("");
    expect(html(h(PlanerVorschlag, { m, ym: YM, sitz: sitzFuer(m, "leitung"), akt: null }))).toBe("");
    expect(html(h(PlanerVorschlag, { m: null, ym: YM, sitz: sitzFuer(m, "leitung"), akt }))).toBe("");
    expect(html(h(PlanerVorschlag, { m, ym: YM, sitz: null, akt }))).toBe("");
  });
  it("Übernehmen und Anheften gelten für dieselben Rollen (die Oberfläche nimmt das Anheft-Recht als Anzeige)", () => {
    expect([...UEBERNAHME_ROLLEN].sort()).toEqual([...ANHEFTEN_ROLLEN].sort());
    const m = betrieb();
    for (const r of ["leitung", "planer"]) expect(planerRechte(sitzFuer(m, r)).anheften, r).toBe(true);
    expect(planerRechte(sitzFuer(m, "leitung"), { demo: true }).anheften).toBe(false);
  });
  it("Rendern und Öffnen stoßen nie eine Anfrage an (auch nicht im Modus „Automatisch“); die Rückgängig-Liste wird erst nach dem Öffnen und im Browser geladen", () => {
    const m = betrieb({ ...FREI, planerModus: { modus: "automatisch", ...st } });
    const akt = aktLeer();
    html(h(PlanerVorschlag, { m, ym: YM, sitz: sitzFuer(m, "leitung"), akt, freigegeben: true }));
    html(h(PlanerVorschlag, { m, ym: YM, sitz: sitzFuer(m, "leitung"), akt, freigegeben: true, startOffen: true }));
    for (const [n, f] of Object.entries(akt)) expect(f, n).not.toHaveBeenCalled();
  });
  it("zu (Vorgabe): nur Überschrift, Hinweis und Öffnen-Knopf", () => {
    const m = betrieb();
    const zu = html(h(PlanerVorschlag, { m, ym: YM, sitz: sitzFuer(m, "leitung"), akt: aktLeer() }));
    expect(zu).toContain(VORSCHLAG_TEXTE.titel);
    expect(zu).toContain('aria-expanded="false"');
    expect(zu).not.toContain(VORSCHLAG_TEXTE.erstellen);
    expect(zu).not.toContain(VORSCHLAG_TEXTE.rueckTitel);
  });
});

/* ------------------------------------------------------------------ 3. Planer aus */
describe("3. Planer nicht freigegeben (Produktivzustand): ehrlich, wirkungslos, Rücknahme bleibt", () => {
  it("PLANER_AN bleibt im Code AUS", async () => {
    const echt = /** @type {any} */ (await vi.importActual("../server/lib/engine/planer.mjs"));
    expect(echt.PLANER_AN).toBe(false);
    const agg = /** @type {any} */ (await vi.importActual("../server/lib/engine/planeraggregate.mjs"));
    expect(agg.PLANER_AGGREGATE_AN).toBe(false);
  });
  it("ohne Freigabe: Text „nicht freigegeben“, der Erstellen-Knopf ist aus; die Rücknahme-Fläche steht trotzdem da", () => {
    const m = betrieb();
    const akt = { planerVorschlagErzeugen: vi.fn(), planerRueckgaengigListe: vi.fn() };
    const seite = html(h(PlanerVorschlag, { m, ym: YM, sitz: sitzFuer(m, "leitung"), akt, startOffen: true }));
    expect(seite).toContain("Der Planer ist nicht freigegeben");
    expect(seite).toMatch(/<button[^>]*disabled=""[^>]*>Vorschlag erstellen<\/button>/);
    expect(seite).toContain(VORSCHLAG_TEXTE.rueckTitel);
    expect(seite).toContain("auch möglich, wenn der Planer ausgeschaltet ist");
    expect(akt.planerVorschlagErzeugen).not.toHaveBeenCalled();
    const z = planerZustand(m.einstellungen, {});
    expect(z.freigegeben).toBe(false);
    expect(vorschlagErstellenGrund(z)).toContain("nicht freigegeben");
  });
  it("freigegeben und im Betrieb wirksam: der Knopf ist an; im Betrieb aus (Schalter fehlt): aus mit eigenem Grund", () => {
    const m = betrieb();
    const z = planerZustand(m.einstellungen, { freigegeben: true });
    expect(z.wirksam).toBe("knopfdruck");
    expect(vorschlagErstellenGrund(z)).toBeNull();
    const an = html(h(PlanerVorschlag, { m, ym: YM, sitz: sitzFuer(m, "leitung"), akt: { planerVorschlagErzeugen: vi.fn() }, startOffen: true, freigegeben: true }));
    expect(an).not.toMatch(/<button[^>]*disabled=""[^>]*>Vorschlag erstellen<\/button>/);
    expect(an).toMatch(/<button[^>]*>Vorschlag erstellen<\/button>/);
    const aus = betrieb({ ...FREI, planerSchalter: { an: false, ...st } });
    const seite = html(h(PlanerVorschlag, { m: aus, ym: YM, sitz: sitzFuer(aus, "leitung"), akt: { planerVorschlagErzeugen: vi.fn() }, startOffen: true, freigegeben: true }));
    expect(seite).toContain("in diesem Betrieb derzeit aus");
    expect(seite).toMatch(/<button[^>]*disabled=""[^>]*>Vorschlag erstellen<\/button>/);
    expect(vorschlagErstellenGrund(null)).toContain("nicht freigegeben");
  });
});

/* ------------------------------------------------------------------ 4. Ablauf in der Ansicht */
const ansichtProps = (extra = {}) => {
  const m = betrieb();
  return { m, ym: YM, offen: true, vorschlag: { zeilen: vorschlagZeilen(m, EINTRAEGE), offen: 4 }, ...extra };
};
describe("4. Ansicht: Vorschlag, Auswahl, Prüfung, Bestätigung", () => {
  it("Einträge mit Namen aus der eigenen Sicht, Tag, Dienst und offenen Lücken; keine Rohkennung, kein Person|Tag, nichts angehakt", () => {
    const seite = html(h(PlanerVorschlagAnsicht, ansichtProps()));
    expect(seite).toContain("Anna Alt");
    expect(seite).toContain("Bert Bau");
    expect(seite).toContain("Do 03.12.");
    expect(seite).toContain("Sa 05.12.");
    expect(seite).toContain("Frühdienst");
    expect(seite).toContain("3 Einteilungen vorgeschlagen.");
    expect(seite).toContain("Offene Lücken nach diesem Vorschlag: 4");
    expect(seite).toContain("0 von 3 ausgewählt");
    expect(seite).not.toMatch(ROHKENNUNG);
    expect(seite).not.toMatch(/\|2026-/);
    expect(seite).not.toContain('aria-pressed="true"');
    expect(seite).not.toContain(VORSCHLAG_TEXTE.bestaetigen);   // erst nach der Prüfung
  });
  it("offene Lücken unbekannt: „nicht bewertbar“, nie eine Zahl oder „keine“", () => {
    const m = betrieb();
    const seite = html(h(PlanerVorschlagAnsicht, ansichtProps({ vorschlag: { zeilen: vorschlagZeilen(m, EINTRAEGE), offen: null } })));
    expect(seite).toContain("Offene Lücken nach diesem Vorschlag: nicht bewertbar");
    expect(seite).not.toContain("Offene Lücken nach diesem Vorschlag: 0");
  });
  it("Auswahl: Prüfen nur mit Auswahl; „Übernahme bestätigen“ nur nach der Prüfung und nur als Klick; Auswahl und Knöpfe melden den Zustand", () => {
    const keine = h(PlanerVorschlagAnsicht, ansichtProps());
    const baum = PlanerVorschlagAnsicht(keine.props);
    expect(knopf(baum, "Auswahl prüfen").props.disabled).toBe(true);
    expect(knopf(baum, "Übernahme bestätigen")).toBeNull();
    const ausgewaehlt = PlanerVorschlagAnsicht(ansichtProps({ auswahl: [0, 2] }));
    expect(knopf(ausgewaehlt, "Auswahl prüfen").props.disabled).toBe(false);
    expect(knopf(ausgewaehlt, "Übernahme bestätigen")).toBeNull();
    const seite = html(h(PlanerVorschlagAnsicht, ansichtProps({ auswahl: [0, 2] })));
    expect([...seite.matchAll(/aria-pressed="true"/g)]).toHaveLength(2);
    expect(seite).toContain("2 von 3 ausgewählt");
    const geprueft = PlanerVorschlagAnsicht(ansichtProps({ auswahl: [0, 2], geprueft: { anzahl: 2 } }));
    const b = knopf(geprueft, "Übernahme bestätigen");
    expect(b).not.toBeNull();
    expect(b.props.disabled).toBe(false);
    const text = html(h(PlanerVorschlagAnsicht, ansichtProps({ auswahl: [0, 2], geprueft: { anzahl: 2 } })));
    expect(text).toContain("Geprüft: 2 Einteilungen können übernommen werden. Bisher wurde nichts geändert.");
    expect(text).toContain("Beschäftigte werden dabei nicht benachrichtigt");
  });
  it("abgelehnte Einteilungen: Grund bei der Einteilung, nie die Rohkennung des Grundes", () => {
    const seite = html(h(PlanerVorschlagAnsicht, ansichtProps({ auswahl: [0, 1], abgelehnt: [{ index: 1, text: VORSCHLAG_ABLEHNUNG.abwesend }],
      status: { ok: false, text: VORSCHLAG_FEHLER["eintrag-abgelehnt"] } })));
    expect(seite).toContain("Nicht möglich: die Person ist an diesem Tag abwesend.");
    expect([...seite.matchAll(/Nicht möglich:/g)]).toHaveLength(1);
    expect(seite).toContain('role="alert"');
    expect(seite).toContain("Es wurde nichts übernommen");
  });
  it("Mehrfachklick: während der Anfrage ist jeder Knopf der Fläche aus (Erstellen, Auswahl, Prüfen, Bestätigen, Rückgängig)", () => {
    const m = betrieb();
    const baum = PlanerVorschlagAnsicht(ansichtProps({ auswahl: [0, 2], geprueft: { anzahl: 2 }, beschaeftigt: true,
      liste: { zustand: "fertig", eintraege: [{ uebernahme: "pu-" + "a".repeat(32), ym: YM, anzahl: 2, von: "2026-12-03", bis: "2026-12-04", rueckgaengigBis: "2027-01-07" }], text: "" },
      rueck: { uebernahme: "pu-" + "a".repeat(32), anzahl: 2, unterbesetzt: [] }, erstellenGrund: null, m }));
    const alle = knoepfe(baum).filter((n) => !n.props["aria-controls"]);   // der Öffnen-Knopf bleibt bedienbar
    expect(alle.length).toBeGreaterThanOrEqual(10);
    expect(alle.filter((n) => n.props.disabled !== true).map((n) => textVon(n.props.children))).toEqual([]);
    const ruhig = PlanerVorschlagAnsicht(ansichtProps({ auswahl: [0, 2], geprueft: { anzahl: 2 }, beschaeftigt: false }));
    expect(knoepfe(ruhig).filter((n) => !n.props["aria-controls"] && n.props.disabled === true).map((n) => textVon(n.props.children))).toEqual([]);
  });
  it("Ergebnis der Übernahme: keine Benachrichtigung versendet (deutlich), Planfreigabe eigener Schritt; Hinweise auf Freigabe und verdrängten Datensatz", () => {
    const e = { anzahl: 2, zeitraum: { von: "2026-12-03", bis: "2026-12-05" }, rueckgaengigBis: "2027-01-07", verdraengt: 0, versandt: false, planFreigegeben: false };
    const seite = html(h(PlanerVorschlagAnsicht, ansichtProps({ vorschlag: null, ergebnis: e })));
    expect(seite).toContain("Übernahme gespeichert: 2 Einteilungen (Do 03.12. bis Sa 05.12.).");
    expect(seite).toContain("Zurücknehmen ist möglich bis 07.01.2027.");
    expect(seite).toContain("Es wurde keine Benachrichtigung an Beschäftigte versendet; die Planfreigabe bleibt ein eigener Schritt.");
    expect(seite).not.toContain("bereits für die Beschäftigten freigegeben");
    expect(seite).not.toContain("älteste gespeicherte Rücknahme-Datensatz");
    const mehr = html(h(PlanerVorschlagAnsicht, ansichtProps({ vorschlag: null, ergebnis: { ...e, verdraengt: 1, planFreigegeben: true } })));
    expect(mehr).toContain("bereits für die Beschäftigten freigegeben");
    expect(mehr).toContain("älteste gespeicherte Rücknahme-Datensatz verworfen");
    const unklar = html(h(PlanerVorschlagAnsicht, ansichtProps({ vorschlag: null, ergebnis: { ...e, versandt: undefined } })));
    expect(unklar).toContain("meldet der Server nicht eindeutig");
    expect(unklar).not.toContain("keine Benachrichtigung an Beschäftigte versendet");
  });
  it("Zustand „nicht planungsreif“: der Grund und was fehlt stehen da, ohne Kennung", () => {
    const seite = html(h(PlanerVorschlagAnsicht, ansichtProps({ vorschlag: null, status: { ok: false, text: VORSCHLAG_FEHLER["nicht-planungsreif"], punkte: ["Bedarf je Dienst ist nicht angegeben.", "Es fehlen Qualifikationen."] } })));
    expect(seite).toContain("noch nicht planungsreif");
    expect(seite).toContain("Bedarf je Dienst ist nicht angegeben.");
    expect(seite).toContain("Was für diesen Monat fehlt");
    expect(seite).not.toContain("nicht-planungsreif");
  });
});

/* ------------------------------------------------------------------ 5. Rücknahme in der Ansicht */
const U1 = `pu-${"1".repeat(32)}`, U2 = `pu-${"2".repeat(32)}`;
const LISTE = { zustand: "fertig", eintraege: [
  { uebernahme: U1, ym: YM, anzahl: 3, von: "2026-12-03", bis: "2026-12-05", rueckgaengigBis: "2027-01-07" },
  { uebernahme: U2, ym: YM, anzahl: 1, von: "2026-12-10", bis: "2026-12-10", rueckgaengigBis: "2027-01-07" }], text: "" };
describe("5. Rücknahme: Liste, Prüfung mit Besetzungshinweis, Bestätigung", () => {
  it("die Liste nennt Zahl, Zeitraum und Frist, je Eintrag „Rückgängig“; keine Kennung im Markup; bei ausgeschaltetem Planer erreichbar", () => {
    const m = betrieb();
    const seite = html(h(PlanerVorschlagAnsicht, { m, ym: YM, offen: true, erstellenGrund: vorschlagErstellenGrund(planerZustand(m.einstellungen, {})), liste: LISTE }));
    expect(seite).toContain("3 Einteilungen, Do 03.12. bis Sa 05.12.; zurücknehmbar bis 07.01.2027");
    expect(seite).toContain("1 Einteilung, Do 10.12.; zurücknehmbar bis 07.01.2027");
    expect([...seite.matchAll(/>Rückgängig<\/button>/g)]).toHaveLength(2);
    expect(seite).not.toMatch(ROHKENNUNG);
    expect(seite).toContain("Der Planer ist nicht freigegeben");   // das Erstellen ist aus, die Rücknahme nicht
    const baum = PlanerVorschlagAnsicht({ m, ym: YM, offen: true, erstellenGrund: "x", liste: LISTE });
    expect(knoepfe(baum).filter((n) => textVon(n.props.children) === "Rückgängig").every((n) => n.props.disabled === false)).toBe(true);
  });
  it("Zustände der Liste: lädt, Fehler mit Neu-laden-Knopf, leer", () => {
    const m = betrieb();
    expect(html(h(PlanerVorschlagAnsicht, { m, ym: YM, offen: true }))).toContain("Die Liste wird geladen");
    const fehler = html(h(PlanerVorschlagAnsicht, { m, ym: YM, offen: true, liste: { zustand: "fehler", eintraege: [], text: VORSCHLAG_FEHLER["pruefung-fehlgeschlagen"] } }));
    expect(fehler).toContain("Die Prüfung ist fehlgeschlagen");
    expect(fehler).toContain("Liste neu laden");
    expect(html(h(PlanerVorschlagAnsicht, { m, ym: YM, offen: true, liste: { zustand: "fertig", eintraege: [], text: "" } }))).toContain("zurzeit nichts zurückzunehmen");
  });
  it("Prüfung vor der Bestätigung: Lücken werden genannt; null heißt „nicht bewertbar“ und nie „keine Lücke“; die leere Liste heißt „keine“", () => {
    const m = betrieb();
    const mit = (unterbesetzt) => html(h(PlanerVorschlagAnsicht, { m, ym: YM, offen: true, liste: LISTE, rueck: { uebernahme: U1, anzahl: 3, unterbesetzt } }));
    const luecken = mit([{ datum: "2026-12-03", dienstId: "zq-dienst-F", fehlt: 1, qualFehlt: false }, { datum: "2026-12-05", dienstId: "zq-dienst-N", fehlt: 0, qualFehlt: true }]);
    expect(luecken).toContain("Nach der Rücknahme fehlt Besetzung");
    expect(luecken).toContain("Do 03.12. · Frühdienst: 1 fehlt");
    expect(luecken).toContain("Sa 05.12. · Nachtdienst: Qualifikation fehlt");
    expect(luecken).toContain("Prüfung der Rücknahme: 3 Einteilungen werden auf den Stand vor der Übernahme zurückgesetzt. Bisher wurde nichts geändert.");
    expect(luecken).toContain("Rücknahme bestätigen");
    expect(luecken).not.toMatch(ROHKENNUNG);
    const unbekannt = mit(null);
    expect(unbekannt).toContain("Nicht bewertbar: Ob nach der Rücknahme Besetzungslücken entstehen");
    expect(unbekannt).not.toContain(VORSCHLAG_TEXTE.keineLuecke);
    expect(mit([])).toContain(VORSCHLAG_TEXTE.keineLuecke);
  });
  it("nur der Eintrag, der geprüft wird, trägt die Bestätigung; ohne Prüfung gibt es keinen Bestätigungsknopf", () => {
    const m = betrieb();
    const ohne = PlanerVorschlagAnsicht({ m, ym: YM, offen: true, liste: LISTE });
    expect(knopf(ohne, "Rücknahme bestätigen")).toBeNull();
    const mit = html(h(PlanerVorschlagAnsicht, { m, ym: YM, offen: true, liste: LISTE, rueck: { uebernahme: U2, anzahl: 1, unterbesetzt: [] } }));
    expect([...mit.matchAll(/Prüfung der Rücknahme/g)]).toHaveLength(1);
    expect(mit.indexOf("Prüfung der Rücknahme")).toBeGreaterThan(mit.indexOf("1 Einteilung, Do 10.12."));
  });
  it("nach der Rücknahme: Ergebnis mit Besetzungshinweis und dem Hinweis, dass niemand benachrichtigt wurde", () => {
    const m = betrieb();
    const seite = html(h(PlanerVorschlagAnsicht, { m, ym: YM, offen: true, liste: { zustand: "fertig", eintraege: [], text: "" },
      rueckErgebnis: { anzahl: 3, zeitraum: { von: "2026-12-03", bis: "2026-12-05" }, unterbesetzt: null } }));
    expect(seite).toContain("Rücknahme gespeichert: 3 Einteilungen (Do 03.12. bis Sa 05.12.).");
    expect(seite).toContain("Beschäftigte wurden dabei nicht benachrichtigt.");
    expect(seite).toContain("Nicht bewertbar: Ob nach der Rücknahme");
  });
});

/* ------------------------------------------------------------------ 6. Aktionen (gespielte Antworten des Servers) */
const antwort = (status, daten) => ({ status, daten });
function aktionen() {
  const nachgeladen = vi.fn(async () => {});
  const meldungen = [];
  const a = planerAktionen({ melde: (t) => meldungen.push(t), ref: { current: null }, upd: () => {}, serverstandNachladen: nachgeladen });
  return { a, nachgeladen, meldungen };
}
describe("6. Aktionen: Rumpf, Mehrfachklick, Neuladen, Fehlerwege", () => {
  it("jede Aktion sendet nur Kennung, Indizes, Monat und die ausdrückliche Bestätigung — Prüfen nie mit Bestätigung; kein Person|Tag, kein Name", async () => {
    const { a } = aktionen();
    const gesendet = [];
    SPM.planerWegSenden = vi.fn(async (weg, rumpf) => {
      gesendet.push([weg, rumpf]);
      return antwort(200, { ok: true, eintraege: [], vorschlag: "pv-" + "a".repeat(32), geprueft: true, geschrieben: weg.endsWith("liste") ? undefined : gesendet.at(-1)[1].bestaetigt === true });
    });
    const V = "pv-" + "a".repeat(32), U = "pu-" + "b".repeat(32);
    await a.planerVorschlagErzeugen(YM);
    await a.planerAuswahlPruefen(V, [0, 2]);
    await a.planerUebernehmen(V, [0, 2]);
    await a.planerRueckgaengigListe(YM);
    await a.planerRueckgaengigPruefen(U);
    await a.planerRueckgaengigAusfuehren(U);
    expect(gesendet).toEqual([
      ["planer-vorschlag", { ym: YM }],
      ["planer-uebernahme", { vorschlag: V, auswahl: [0, 2] }],
      ["planer-uebernahme", { vorschlag: V, auswahl: [0, 2], bestaetigt: true }],
      ["planer-rueckgaengig-liste", { ym: YM }],
      ["planer-rueckgaengig", { uebernahme: U }],
      ["planer-rueckgaengig", { uebernahme: U, bestaetigt: true }],
    ]);
    expect(JSON.stringify(gesendet)).not.toMatch(/\|20\d\d-|Anna|Alt/);
    for (const [weg] of gesendet) expect(PLANER_WEGE).toContain(weg);
  });
  it("Mehrfachklick: eine Bestätigung ist unterwegs, die zweite sendet nichts und sagt es; die Liste ist ausgenommen", async () => {
    const { a } = aktionen();
    let frei1;
    SPM.planerWegSenden = vi.fn((weg) => new Promise((ok) => { if (weg === "planer-uebernahme") frei1 = () => ok(antwort(200, { ok: true, geschrieben: true })); else ok(antwort(200, { ok: true, eintraege: [] })); }));
    const erste = a.planerUebernehmen("pv-" + "a".repeat(32), [0]);
    const zweite = await a.planerUebernehmen("pv-" + "a".repeat(32), [0]);
    expect(zweite).toMatchObject({ ok: false, code: "laeuft" });
    expect(zweite.text).toContain("läuft gerade schon eine Anfrage");
    const dritte = await a.planerRueckgaengigAusfuehren("pu-" + "b".repeat(32));   // auch kein anderer Schreibweg dazwischen
    expect(dritte).toMatchObject({ ok: false, code: "laeuft" });
    expect((await a.planerRueckgaengigListe(YM)).ok).toBe(true);
    expect(SPM.planerWegSenden.mock.calls.filter(([w]) => w === "planer-uebernahme")).toHaveLength(1);
    expect(SPM.planerWegSenden.mock.calls.filter(([w]) => w === "planer-rueckgaengig")).toHaveLength(0);
    frei1();
    expect((await erste).ok).toBe(true);
    SPM.planerWegSenden = vi.fn(async () => antwort(200, { ok: true, geschrieben: true }));
    expect((await a.planerUebernehmen("pv-" + "a".repeat(32), [0])).ok).toBe(true);   // danach wieder frei
  });
  it("nach Erfolg wird der Stand neu geladen (einmal); beim Prüfen, Erzeugen und der Liste nicht", async () => {
    const { a, nachgeladen } = aktionen();
    SPM.planerWegSenden = vi.fn(async () => antwort(200, { ok: true, eintraege: [], geprueft: true, geschrieben: false }));
    await a.planerVorschlagErzeugen(YM);
    await a.planerAuswahlPruefen("pv-" + "a".repeat(32), [0]);
    await a.planerRueckgaengigListe(YM);
    await a.planerRueckgaengigPruefen("pu-" + "b".repeat(32));
    expect(nachgeladen).not.toHaveBeenCalled();
    SPM.planerWegSenden = vi.fn(async () => antwort(200, { ok: true, geschrieben: true, anzahl: 2 }));
    expect((await a.planerUebernehmen("pv-" + "a".repeat(32), [0, 1])).ok).toBe(true);
    expect(nachgeladen).toHaveBeenCalledTimes(1);
    expect((await a.planerRueckgaengigAusfuehren("pu-" + "b".repeat(32))).ok).toBe(true);
    expect(nachgeladen).toHaveBeenCalledTimes(2);
  });
  it("Erfolg heißt nur: ausdrückliche, passende Antwort. 200 ohne „geschrieben“ ist kein Erfolg (unklar); ein Prüfergebnis ist keine Übernahme", async () => {
    const { a, nachgeladen } = aktionen();
    SPM.planerWegSenden = vi.fn(async () => antwort(200, { ok: true, geprueft: true, geschrieben: false, anzahl: 2 }));
    const r = await a.planerUebernehmen("pv-" + "a".repeat(32), [0]);
    expect(r).toMatchObject({ ok: false, code: "schreiben-unklar", unklar: true, verbraucht: true });
    expect(nachgeladen).toHaveBeenCalledTimes(1);
    SPM.planerWegSenden = vi.fn(async () => antwort(200, { ok: true, geschrieben: true }));
    expect((await a.planerAuswahlPruefen("pv-" + "a".repeat(32), [0])).ok).toBe(false);   // „geschrieben: true“ ist keine Prüfantwort
    SPM.planerWegSenden = vi.fn(async () => antwort(200, "kaputt"));
    expect((await a.planerRueckgaengigListe(YM))).toMatchObject({ ok: false });
    expect((await a.planerRueckgaengigListe(YM)).text).toContain("nicht eindeutig");
  });
  it("Absagen: Text aus der Tabelle, nie Servertext; unklar und Konflikt laden neu, ein 503 nicht und bleibt wiederholbar", async () => {
    const { a, nachgeladen, meldungen } = aktionen();
    const V = "pv-" + "a".repeat(32);
    const FALL = [[409, "planer-nicht-freigegeben", false, false], [409, "konflikt", true, false], [409, "seit-vorschlag-geaendert", true, true], [410, "vorschlag-abgelaufen", false, true],
      [422, "eintrag-abgelehnt", false, false], [500, "schreiben-unklar", true, true], [503, "schreiben-fehlgeschlagen", false, false], [413, "auswahl-zu-gross", false, false]];
    for (const [status, code, neu, verbraucht] of FALL) {
      nachgeladen.mockClear();
      SPM.planerWegSenden = vi.fn(async () => antwort(status, { ok: false, code, fehler: "Servertext XYZ", abgelehnt: [{ index: 0, grund: "abwesend" }] }));
      const r = await a.planerUebernehmen(V, [0]);
      expect(r, code).toMatchObject({ ok: false, code, text: VORSCHLAG_FEHLER[code], verbraucht });
      expect(r.text, code).not.toContain("Servertext");
      expect(nachgeladen.mock.calls.length, code).toBe(neu ? 1 : 0);
      expect(meldungen.at(-1), code).toBe(VORSCHLAG_FEHLER[code]);
    }
    expect(planerWegFehler(500, { code: "schreiben-unklar" }).unklar).toBe(true);
  });
  it("keine Verbindung: bei der Bestätigung unklar (neu laden), beim Prüfen nur ein Fehler; Abmeldung: Anmeldetext", async () => {
    const { a, nachgeladen } = aktionen();
    SPM.planerWegSenden = vi.fn(async () => { throw new Error("Failed to fetch"); });
    const best = await a.planerUebernehmen("pv-" + "a".repeat(32), [0]);
    expect(best).toMatchObject({ ok: false, code: "schreiben-unklar", unklar: true });
    expect(best.text).not.toContain("Failed");
    expect(nachgeladen).toHaveBeenCalledTimes(1);
    nachgeladen.mockClear();
    const pruef = await a.planerAuswahlPruefen("pv-" + "a".repeat(32), [0]);
    expect(pruef.ok).toBe(false);
    expect(pruef.unklar).toBeFalsy();
    expect(nachgeladen).not.toHaveBeenCalled();
    SPM.planerWegSenden = vi.fn(async () => { throw new Error("nicht-angemeldet"); });
    const ab = await a.planerUebernehmen("pv-" + "a".repeat(32), [0]);
    expect(ab.text).toContain("neu anmelden");
    expect(ab.unklar).toBeFalsy();
  });
});

/* ------------------------------------------------------------------ 7. Ende zu Ende gegen den echten Handler */
describe("7. Ende zu Ende: Aktionen → echter Handler (daten.mjs)", { timeout: 300000 }, () => {
  let wurzel, S, nr = 0, token, raumName;
  const STAB = [["l1", "leitung"], ["pl1", "planer"]];
  function bestandFuer() {
    const g = baueLeerenBetrieb({ name: "T", branche: "pflege", email: "x@example.org", land: "HE", raum: "r" });
    const m = g.mandanten[0];
    m.id = "m1"; m.status = "aktiv";
    const e1 = m.einheiten[0].id;
    m.personen = [
      ...[1, 2, 3, 4].map((i) => ({ id: `p${i}`, vorname: "Vorname", nachname: `Zuname${i}`, eintritt: "2020-01-01", zugehoerigkeit: [{ einheitId: e1, ab: "2020-01-01" }], wochenstunden: 40, status: "aktiv", qualifikationen: [] })),
      ...STAB.map(([pid, rolle]) => ({ id: pid, vorname: "Stab", nachname: `Stabname-${pid}`, rolle, status: "aktiv", wochenstunden: 40, bereich: "ALLE", qualifikationen: [] })),
    ];
    m.dienstarten = m.dienstarten.map((d) => (d.id === "F" ? { ...d, mindest: { mo_do: 1, fr: 1, sa: 1, so: 1 } } : d));
    m.einstellungen = { ...m.einstellungen, kiSteuerung: structuredClone(FREI) };
    g.version = 9;
    return g;
  }
  async function senden(weg, rumpf) {
    nr += 1;
    const kopf = { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.83.${Math.floor(nr / 250) % 250}.${nr % 250}`, "content-type": "application/json", authorization: `Bearer ${token}` };
    const a = await S.daten(new Request(`http://${WIRT}/api/${weg}`, { method: "POST", headers: kopf, body: JSON.stringify(rumpf) }), {});
    let d = {}; try { d = await a.json(); } catch { /* leer */ }
    return { status: a.status, daten: d };
  }
  const gespeichert = async () => (await S.B.bestandLesenStreng(S.laden(), raumName)).bestand.mandanten[0];
  beforeAll(async () => {
    wurzel = await mkdtemp(path.join(tmpdir(), "centric-wpi7ui-"));
    process.env.CENTRIC_DATEN = wurzel;
    process.env.CENTRIC_ABLAGE = "dateien";
    process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
    const schutz = await import("../server/lib/schutz.mjs");
    for (const art of Object.keys(schutz.GRENZEN)) schutz.GRENZEN[art] = { ...schutz.GRENZEN[art], versuche: 1000000 };
    const { getStore } = await import("../server/lib/ablage.mjs");
    S = { laden: () => getStore({ name: "centric", consistency: "strong" }), daten: (await import("../server/funktionen/daten.mjs")).default,
      B: await import("../server/lib/bestand.mjs"), G: await import("../server/lib/gestalt.mjs"), sitzungAnlegen: (await import("../server/lib/sitzungen.mjs")).sitzungAnlegen };
    raumName = "wpi7ui-1";
    await S.B.bestandSchreiben(S.laden(), raumName, S.G.personenAngleichen(bestandFuer()), { durch: "Pruefung" });
    token = (await S.sitzungAnlegen({ bestand: raumName, name: "Stab l1", rolle: "leitung", person: "l1", betrieb: 0, mandantId: "m1", einheit: null }, 30 * 24 * 3600 * 1000)).token;
    SPM.planerWegSenden = null;
  }, 180000);
  afterAll(async () => { if (wurzel) await rm(wurzel, { recursive: true, force: true }); });

  it("Planer aus: der Vorschlag wird abgewiesen (Text der Tabelle), Liste und Rücknahme bleiben erreichbar", async () => {
    const { a, nachgeladen } = aktionen();
    SPM.planerWegSenden = senden;
    frei(false);
    const v = await a.planerVorschlagErzeugen(YM);
    expect(v).toMatchObject({ ok: false, code: "planer-nicht-freigegeben", text: VORSCHLAG_FEHLER["planer-nicht-freigegeben"] });
    const l = await a.planerRueckgaengigListe(YM);
    expect(l.ok).toBe(true);
    expect(l.daten.eintraege).toEqual([]);
    const r = await a.planerRueckgaengigPruefen(`pu-${"c".repeat(32)}`);
    expect(r).toMatchObject({ ok: false, code: "rueckgaengig-unbekannt" });   // nicht „Planer aus“: die Rücknahme hängt nicht an der Freigabe
    expect(nachgeladen).not.toHaveBeenCalled();
  });
  it("Vorschlag → Prüfen → Übernehmen → Liste → Prüfen der Rücknahme → Rücknahme, jeweils mit den Formen des Servers", async () => {
    const { a, nachgeladen } = aktionen();
    SPM.planerWegSenden = senden;
    frei(true);
    const v = await a.planerVorschlagErzeugen(YM);
    expect(v.ok, JSON.stringify(v).slice(0, 300)).toBe(true);
    expect(v.daten.vorschlag).toMatch(/^pv-[0-9a-f]{32}$/);
    expect(Number.isInteger(v.daten.offen)).toBe(true);
    const zeilen = vorschlagZeilen(betrieb(), v.daten.eintraege);
    expect(zeilen.length).toBe(v.daten.eintraege.length);
    const auswahl = v.daten.eintraege.slice(0, 3).map((e) => e.index);
    const vor = JSON.stringify(await gespeichert());
    const p = await a.planerAuswahlPruefen(v.daten.vorschlag, auswahl);
    expect(p, JSON.stringify(p).slice(0, 300)).toMatchObject({ ok: true, daten: { geprueft: true, geschrieben: false, anzahl: 3 } });
    expect(JSON.stringify(await gespeichert())).toBe(vor);   // Prüfen schreibt nichts
    expect(nachgeladen).not.toHaveBeenCalled();
    const u = await a.planerUebernehmen(v.daten.vorschlag, auswahl);
    expect(u, JSON.stringify(u).slice(0, 300)).toMatchObject({ ok: true, daten: { geschrieben: true, anzahl: 3, mitteilungen: { versandt: false }, rueckgaengigVerdraengt: 0 } });
    expect(nachgeladen).toHaveBeenCalledTimes(1);
    frei(false);   // Planer aus: die Rücknahme geht trotzdem
    const l = await a.planerRueckgaengigListe(YM);
    expect(l.daten.eintraege).toHaveLength(1);
    expect(l.daten.eintraege[0]).toMatchObject({ uebernahme: u.daten.uebernahme, ym: YM, anzahl: 3 });
    const rp = await a.planerRueckgaengigPruefen(u.daten.uebernahme);
    expect(rp, JSON.stringify(rp).slice(0, 300)).toMatchObject({ ok: true, daten: { geprueft: true, geschrieben: false, anzahl: 3 } });
    expect(Object.hasOwn(rp.daten, "unterbesetzt")).toBe(true);
    expect(["nicht_bewertbar", "keine", "luecken"]).toContain(unterbesetztAnzeige(rp.daten.unterbesetzt, betrieb()).zustand);
    const z = await a.planerRueckgaengigAusfuehren(u.daten.uebernahme);
    expect(z, JSON.stringify(z).slice(0, 300)).toMatchObject({ ok: true, daten: { geschrieben: true, anzahl: 3 } });
    expect(nachgeladen).toHaveBeenCalledTimes(2);
    expect((await a.planerRueckgaengigListe(YM)).daten.eintraege).toEqual([]);
    const nochmal = await a.planerRueckgaengigAusfuehren(u.daten.uebernahme);
    expect(nochmal).toMatchObject({ ok: false, code: "rueckgaengig-unbekannt", text: VORSCHLAG_FEHLER["rueckgaengig-unbekannt"] });
  });
  it("ungültige Auswahl und doppelte Übernahme: Text der Tabelle, der Vorschlag gilt als verbraucht, nichts wird geschrieben", async () => {
    const { a } = aktionen();
    SPM.planerWegSenden = senden;
    frei(true);
    const v = await a.planerVorschlagErzeugen(YM);
    expect(v.ok).toBe(true);
    const e = v.daten.eintraege;
    /* Ein fremder Index gehört nicht zum Vorschlag: der Server lehnt ab, nichts wird geschrieben. */
    const vor = JSON.stringify(await gespeichert());
    const bad = await a.planerAuswahlPruefen(v.daten.vorschlag, [e.length + 5]);
    expect(bad).toMatchObject({ ok: false, code: "auswahl-ungueltig", text: VORSCHLAG_FEHLER["auswahl-ungueltig"], verbraucht: true });
    expect(JSON.stringify(await gespeichert())).toBe(vor);
    const v2 = await a.planerVorschlagErzeugen(YM);
    const erst = await a.planerUebernehmen(v2.daten.vorschlag, [v2.daten.eintraege[0].index]);
    expect(erst.ok).toBe(true);
    const doppelt = await a.planerUebernehmen(v2.daten.vorschlag, [v2.daten.eintraege[0].index]);
    expect(doppelt).toMatchObject({ ok: false, code: "bereits-uebernommen", verbraucht: true });
  });
});

/* ------------------------------------------------------------------ 8. Quelltext (sparsam) */
describe("8. Quelltext: Bausteine, Einbindung, Server-Wege", () => {
  it("planer-vorschlag.jsx: keine rohen Bedienelemente, keine Inline-Stile, kein Netz, keine Rollenstrings, Bestätigung nie in der Ansicht", async () => {
    const roh = await lies("src/ansichten/planer-vorschlag.jsx");
    const q = roh.replace(/\/\*[\s\S]*?\*\//g, "");   // ohne Kommentare
    expect(q).not.toMatch(/<summary|<details|<button|<a [^>]*href|<input|<select|<textarea/);
    expect(q).not.toMatch(/style=\{/);
    expect(q).not.toMatch(/fetch\(|\/api\/|localStorage|sessionStorage/);
    expect(q).not.toMatch(/rolle === "|\.rolle ===/);
    expect(q).not.toMatch(/bestaetigt: true|bestaetigt=\{true\}/);
    expect(roh).not.toMatch(/garantier|sicher gelöst|ohne Risiko|fehlerfrei/i);
    expect(q).toMatch(/if \(sperre\.current\) return;\s*sperre\.current = true;/);   // Mehrfachklick: vor dem ersten await
    expect(q).toMatch(/geprueft\.schluessel !== schluessel\) return;/);                 // nur genau die geprüfte Auswahl
    const html_ = html(h(PlanerVorschlagAnsicht, ansichtProps({ auswahl: [0], geprueft: { anzahl: 1 }, liste: LISTE, rueck: { uebernahme: U1, anzahl: 3, unterbesetzt: null }, erstellenGrund: null })));
    const knoepfeAnzahl = [...html_.matchAll(/<button/g)].length;
    expect(knoepfeAnzahl).toBeGreaterThanOrEqual(12);
    expect([...html_.matchAll(/<button[^>]*class="btn /g)]).toHaveLength(knoepfeAnzahl);   // alles Btn: Mindestgröße (axe target-size)
  });
  it("Einbindung: eine Zeile im Monatsplan; die Wege des Browsers sind genau die des Servers", async () => {
    expect(await lies("src/ansichten/monatsplan.jsx")).toContain("<PlanerVorschlag m={m} ym={ym} sitz={sitz} akt={akt} />");
    const sp = await lies("src/speicher.js");
    const liste = sp.slice(sp.indexOf("const PLANER_WEGE_CLIENT"), sp.indexOf("export async function planerWegSenden"));
    expect([...liste.matchAll(/"(planer-[a-z-]+)"/g)].map((x) => x[1]).sort()).toEqual([...PLANER_WEGE].sort());
    const ak = await lies("src/lib/planer-aktionen.js");
    expect(ak).toContain("SP.planerWegSenden(weg, rumpf)");
    expect(ak.match(/bestaetigt: true/g)).toHaveLength(2);   // nur Übernehmen und Rücknahme ausführen
  });
});
