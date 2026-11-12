/* ==========================================================================
   INTELLIGENCE — F15 ÄNDERUNGSÜBERSICHT (WP-I24 Teil 1)

   Geprüft über den echten serverseitigen Kern (aenderungsuebersicht) und die reine Rechnung
   (planAenderungen): Schalter aus (Vorgabe), Rollenmatrix, Freigabe, Anfrageform, kein Anbieteraufruf
   (Quelltextprüfung), keine Gesundheitsdaten (offene Krankmeldungen im Bestand), deterministische Ausgabe, begrenzte
   Eingabe, Entwurfskennzeichnung, Oberfläche (nur Planung/Leitung, kein "KI"-Anspruch).
   ========================================================================== */
import { describe, it, expect, vi } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { planAenderungen, AENDERUNGEN_GRENZEN } from "../server/lib/engine/aenderungen.mjs";
import { aenderungsuebersicht, F15_ZUSAMMENFASSUNG_TEXT } from "../server/lib/intelligence/funktionen/aenderungsuebersicht.mjs";
import { Aenderungsuebersicht, AENDERUNG_TEXTE } from "../src/ansichten/intelligence/Aenderungsuebersicht.jsx";
import { betrieb, bestand, S, sitzung } from "./intelligence-gateway-fixture.mjs";
import { deepFreeze } from "../server/lib/intelligence/felder.mjs";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const AN = { prozess: () => "an", laufzeit: () => "an" };
const ZR = { von: "2026-11-01", bis: "2026-11-30" };
const HEUTE = "2026-11-02";

const alt = () => betrieb();
const neu = () => {
  const b = betrieb();
  b.abweichungen = { ...b.abweichungen, "a1|2026-11-03": "S", "a1|2026-11-04": "F", "a2|2026-11-03": "-", "a3|2026-11-04": "S" };
  b.dienstarten[1] = { ...b.dienstarten[1], ende: "22:00" };
  return b;
};
function lauf(o = {}) {
  const ladeBestand = vi.fn(async () => bestand(neu()));
  const ladeVergleich = vi.fn(async () => bestand(alt()));
  const args = { sitzung: S.leitung, anfrage: { zeitraum: ZR }, heute: HEUTE, ladeBestand, ladeVergleich, schalter: AN, funktionenFreigegeben: ["F15"], ...o };
  return { ladeBestand, ladeVergleich, ruf: () => aenderungsuebersicht(args) };
}
const fehlerCode = async (p) => { try { await p; } catch (e) { return e.code; } return null; };

describe("reine Rechnung planAenderungen", () => {
  const sicht = (b) => ({ ...b });
  it("neu, geändert, entfernt und geänderte Dienstzeiten", () => {
    const r = planAenderungen(sicht(alt()), sicht(neu()), { ...ZR, heute: HEUTE });
    expect(r.zaehler).toEqual({ neu: 1, geaendert: 2, entfernt: 1 });
    const e = (p, d) => r.ereignisse.find((x) => x.personId === p && x.datum === d);
    expect(e("a1", "2026-11-03")).toMatchObject({ art: "geaendert", von: "F", nach: "S" });
    expect(e("a2", "2026-11-03")).toMatchObject({ art: "entfernt", von: "N", nach: null });
    expect(e("a1", "2026-11-04")).toMatchObject({ art: "neu", von: null, nach: "F" });
    expect(e("a3", "2026-11-04").zeiten).toEqual({ vorher: { beginn: "13:30", ende: "21:30" }, nachher: { beginn: "13:30", ende: "22:00" } });
  });
  it("gleiche Stände: keine Ereignisse", () => {
    expect(planAenderungen(sicht(alt()), sicht(alt()), { ...ZR, heute: HEUTE }).ereignisse).toEqual([]);
  });
  it("deterministisch: zweimal gleich, unabhängig von der Reihenfolge der Personen; Eingabe unverändert", () => {
    const a = deepFreeze(sicht(alt())), n = deepFreeze(sicht(neu()));
    const r1 = planAenderungen(a, n, { ...ZR, heute: HEUTE });
    const r2 = planAenderungen(a, n, { ...ZR, heute: HEUTE });
    expect(r2).toEqual(r1);
    const umgekehrt = { ...neu(), personen: neu().personen.reverse() };
    expect(planAenderungen(a, umgekehrt, { ...ZR, heute: HEUTE }).ereignisse).toEqual(r1.ereignisse);
    const schluessel = r1.ereignisse.map((x) => x.datum + x.personId);
    expect(schluessel).toEqual([...schluessel].sort());
  });
  it("Abwesenheiten (auch Krankheit) sind nie eine Planänderung: Ergebnis identisch zu einem Bestand ohne Abwesenheiten", () => {
    const ohne = (x) => ({ ...x, abwesenheiten: [], krankmeldungen: [] });
    const basis = planAenderungen(ohne(alt()), ohne(neu()), { ...ZR, heute: HEUTE });
    const n = neu();
    n.abwesenheiten = [...n.abwesenheiten,
      { id: "x", personId: "a3", von: "2026-11-04", bis: "2026-11-08", art: "krank", grund: "Grippe" },
      { id: "y", personId: "a1", von: "2026-11-03", bis: "2026-11-05", art: "urlaub", notiz: "Reise" }];
    n.krankmeldungen = [{ id: "k1", personId: "a3", von: "2026-11-04", status: "offen" }];
    const mit = planAenderungen(alt(), n, { ...ZR, heute: HEUTE });
    expect(mit).toEqual(basis);
    const e = (p, d) => mit.ereignisse.filter((x) => x.personId === p && x.datum === d);
    expect(e("a3", "2026-11-04")).toEqual([{ personId: "a3", datum: "2026-11-04", art: "geaendert", von: "S", nach: "S",
      zeiten: { vorher: { beginn: "13:30", ende: "21:30" }, nachher: { beginn: "13:30", ende: "22:00" } } }]);
    expect(e("a1", "2026-11-10")).toEqual([]);
    expect(mit.ereignisse.some((x) => x.art === "entfernt" && x.personId === "a3")).toBe(false);
  });
  it("geplant und dann krank/abwesend, Plan unverändert: keine Ereignisse", () => {
    const n = alt();
    n.abwesenheiten = [
      { id: "s1", personId: "a1", von: "2026-11-03", bis: "2026-11-03", art: "krank", grund: "Grippe", anmerkung: "AU" },
      { id: "s2", personId: "a2", von: "2026-11-03", bis: "2026-11-03", art: "urlaub" },
      { id: "s3", personId: "a3", von: "2026-11-04", bis: "2026-11-04", art: "mutterschutz", nachweis: "Attest" }];
    n.krankmeldungen = [{ id: "k9", personId: "a1", von: "2026-11-03", status: "offen" }];
    const r = planAenderungen(alt(), n, { ...ZR, heute: HEUTE });
    expect(r.ereignisse).toEqual([]);
    expect(r.zaehler).toEqual({ neu: 0, geaendert: 0, entfernt: 0 });
  });
  it("Personen nur in einem Stand: nicht verglichen, gezählt", () => {
    const n = neu();
    n.personen = [...n.personen, { id: "neu1", vorname: "Neu", nachname: "Person", rolle: "mitarbeiter", bereich: "e1", wochenstunden: 20 }];
    const r = planAenderungen(alt(), n, { ...ZR, heute: HEUTE });
    expect(r.ohneVergleich).toBe(1);
    expect(r.ereignisse.some((x) => x.personId === "neu1")).toBe(false);
  });
  it("Eingabe ist begrenzt: Zeitraum, Personen, ungültige Daten", () => {
    expect(() => planAenderungen(alt(), neu(), { von: "2026-01-01", bis: "2026-12-31", heute: HEUTE })).toThrow();
    expect(AENDERUNGEN_GRENZEN.tage).toBe(62);
    const viele = { ...alt(), personen: Array.from({ length: AENDERUNGEN_GRENZEN.personen + 1 }, (_, i) => ({ id: `p${i}` })) };
    expect(() => planAenderungen(viele, neu(), { ...ZR, heute: HEUTE })).toThrow();
    expect(() => planAenderungen(alt(), neu(), { von: "2026-11-30", bis: "2026-11-01", heute: HEUTE })).toThrow();
    expect(() => planAenderungen(alt(), neu(), { ...ZR, heute: "morgen" })).toThrow();
    expect(() => planAenderungen(null, neu(), { ...ZR, heute: HEUTE })).toThrow();
  });
});

describe("serverseitiger Kern", () => {
  it("Schalter aus (Vorgabe): KI_AUS, nichts wird geladen; ein einzelner Schalter zählt als aus", async () => {
    for (const schalter of [undefined, { prozess: () => "aus", laufzeit: () => "aus" }, { prozess: () => "an", laufzeit: () => "aus" },
      { prozess: () => "an", laufzeit: () => true }, { prozess: () => { throw new Error("x"); }, laufzeit: () => "an" }]) {
      const l = lauf({ schalter });
      expect(await fehlerCode(l.ruf())).toBe("KI_AUS");
      expect(l.ladeBestand).not.toHaveBeenCalled();
      expect(l.ladeVergleich).not.toHaveBeenCalled();
    }
  });
  it("Rollenmatrix: Leitung und Planung ja; alle anderen KI_ROLLE ohne Laden", async () => {
    for (const rolle of ["leitung", "planer"]) {
      const r = await lauf({ sitzung: sitzung(rolle, rolle === "leitung" ? "l1" : "pl1") }).ruf();
      expect(r.status).toBe("ok");
      expect(r.ereignisse.length).toBeGreaterThan(0);
    }
    for (const rolle of ["mitarbeiter", "subplaner", "betriebsrat", "betreiber", "kunde", "admin"]) {
      const l = lauf({ sitzung: { ...S.leitung, rolle } });
      expect(await fehlerCode(l.ruf())).toBe("KI_ROLLE");
      expect(l.ladeBestand).not.toHaveBeenCalled();
    }
    for (const s of [null, { ...S.leitung, rolle: "" }, { ...S.leitung, rolle: undefined }]) expect(["KI_NICHT_ANGEMELDET", "KI_ROLLE"]).toContain(await fehlerCode(lauf({ sitzung: s }).ruf()));
  });
  it("ohne Freigabe der Funktion F15: KI_FUNKTION", async () => {
    expect(await fehlerCode(lauf({ funktionenFreigegeben: ["F1", "F2"] }).ruf())).toBe("KI_FUNKTION");
    expect(await fehlerCode(lauf({ funktionenFreigegeben: undefined }).ruf())).toBe("KI_FUNKTION");
  });
  it("Anfrage: Rolle, Raum, Betrieb, Zusatzschlüssel und zu lange Zeiträume werden abgelehnt", async () => {
    for (const anfrage of [{ zeitraum: ZR, rolle: "leitung" }, { zeitraum: ZR, bestand: "raum-b" }, { zeitraum: { ...ZR, betrieb: 1 } },
      { zeitraum: { von: "2026-01-01", bis: "2026-12-31" } }, { zeitraum: { von: "2026-11-30", bis: "2026-11-01" } }, { zeitraum: { von: "x", bis: "y" } },
      {}, null, "text"]) {
      expect(await fehlerCode(lauf({ anfrage }).ruf())).toBe("KI_EINGABE");
    }
  });
  it("kein Anbieteraufruf: die Funktion hat keinen Weg zu Gateway oder Anbieter (Quelltext); die Zusammenfassung ist nicht verfügbar", async () => {
    const r = await lauf().ruf();
    expect(r.zusammenfassung).toEqual({ verfuegbar: false, text: F15_ZUSAMMENFASSUNG_TEXT });
    expect(r.quelle).toBe("berechnet");
    const quelle = readFileSync(path.join(WURZEL, "server/lib/intelligence/funktionen/aenderungsuebersicht.mjs"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(quelle).not.toMatch(/anbieter-live|fetch\(|process\.env|from "node:(http|https|net)"|gateway\.mjs|ausfuehren/);
  });
  it("Modulgrenze der Funktionsebene (intelligence/funktionen): nur diese Importe, nie src/, nie Anbieter, kein Schreibweg", () => {
    const erlaubt = ["../../rechte.mjs", "../../engine/aenderungen.mjs", "../../planfreigabe.mjs", "../positivliste.mjs", "../alias.mjs",
      "../gateway/schalter.mjs", "../gateway/codes.mjs", "../fehler.mjs"];
    const q = readFileSync(path.join(WURZEL, "server/lib/intelligence/funktionen/aenderungsuebersicht.mjs"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const ziele = [...q.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
    expect(ziele.length).toBeGreaterThan(0);
    for (const z of ziele) expect(erlaubt, z).toContain(z);
    expect(q).not.toMatch(/bestandSchreiben|zusammenfuehren|setJSON|\/src\//);
  });
  it("keine Gesundheitsdaten: offene Krankmeldungen, Gründe und Notizen kommen nicht heraus", async () => {
    const n = neu();
    n.abwesenheiten.push({ id: "ab9", personId: "a3", von: "2026-11-04", bis: "2026-11-09", art: "krank", grund: "Bandscheibenvorfall", anmerkung: "Diagnose M51" });
    n.krankmeldungen = [{ id: "k1", personId: "a3", von: "2026-11-04", status: "offen", notiz: "Bandscheibenvorfall" }];
    const r = await lauf({ ladeBestand: async () => bestand(n) }).ruf();
    const ohne = neu(); ohne.abwesenheiten = []; 
    const basis = await lauf({ ladeBestand: async () => bestand(ohne), ladeVergleich: async () => bestand({ ...alt(), abwesenheiten: [] }) }).ruf();
    expect(r.ereignisse).toEqual(basis.ereignisse);
    expect(r.zaehler).toEqual({ neu: 1, geaendert: 2, entfernt: 1 });
    expect(r.ereignisse.filter((x) => x.personId === "a3")).toEqual([expect.objectContaining({ art: "geaendert", datum: "2026-11-04" })]);
    const s = JSON.stringify(r).toLowerCase();
    for (const v of ["krank", "grippe", "bandscheibe", "diagnose", "m51", "mutterschutz", "schwanger", "attest", "urlaub", "grund", "anmerkung", "notiz",
      "email", "@", "iban", "geburtsdatum", "telefon", "personalnummer", "kinderwunsch", "insulin", "rückenschmerz"]) expect(s).not.toContain(v);
    expect(Object.keys(r).sort()).toEqual(["ereignisse", "funktion", "gekuerzt", "ohneVergleich", "quelle", "status", "zaehler", "zeitraum", "zusammenfassung"]);
    for (const e of r.ereignisse) expect(Object.keys(e).every((k) => ["art", "datum", "entwurf", "nach", "name", "personId", "von", "zeiten"].includes(k))).toBe(true);
  });
  it("deterministisch: zwei Aufrufe liefern dieselbe Antwort", async () => {
    const a = await lauf().ruf();
    const b = await lauf().ruf();
    expect(b).toEqual(a);
  });
  it("kein Vergleichsstand oder fremder Betrieb: kein_vergleich", async () => {
    for (const v of [null, undefined, { mandanten: [] }, { mandanten: [betrieb("m-anders")] }]) {
      const r = await lauf({ ladeVergleich: async () => v }).ruf();
      expect(r.status).toBe("kein_vergleich");
      expect(r.ereignisse).toEqual([]);
    }
  });
  it("Entwurf: Tage nach heute in nicht freigegebenen Monaten sind gekennzeichnet", async () => {
    const n = neu();
    n.einstellungen = { planFreigabePflicht: true };
    n.freigaben = {};
    const r = await lauf({ ladeBestand: async () => bestand(n) }).ruf();
    expect(r.ereignisse.length).toBeGreaterThan(0);
    expect(r.ereignisse.every((e) => e.entwurf === true)).toBe(true);
    n.freigaben = { "2026-11": true };
    const r2 = await lauf({ ladeBestand: async () => bestand(n) }).ruf();
    expect(r2.ereignisse.every((e) => e.entwurf === false)).toBe(true);
  });
  it("Betrieb kommt aus der Sitzung: ein fremder Index findet nichts", async () => {
    expect(await fehlerCode(lauf({ sitzung: { ...S.leitung, betrieb: 5 } }).ruf())).toBe("KI_NICHT_GEFUNDEN");
  });
});

describe("Oberfläche", () => {
  const u = async () => lauf().ruf();
  it("nur Planung und Leitung sehen etwas; alle anderen Rollen nichts", async () => {
    const uebersicht = await u();
    for (const rolle of ["leitung", "planer"]) expect(renderToStaticMarkup(h(Aenderungsuebersicht, { rolle, uebersicht }))).toContain(AENDERUNG_TEXTE.titel);
    for (const rolle of ["mitarbeiter", "subplaner", "betriebsrat", "betreiber", "kunde", "", undefined])
      expect(renderToStaticMarkup(h(Aenderungsuebersicht, { rolle, uebersicht }))).toBe("");
  });
  it("zeigt Zeilen, Zähler und den Hinweis zur Zusammenfassung; behauptet keine KI", async () => {
    const m = renderToStaticMarkup(h(Aenderungsuebersicht, { rolle: "leitung", uebersicht: await u() }));
    expect(m).toContain("03.11.2026");
    expect(m).toContain("1 neu eingeplant");
    expect(m).toContain(F15_ZUSAMMENFASSUNG_TEXT);
    expect(m).not.toMatch(/\bKI\b|Intelligence|künstlich|Sprachmodell/i);
  });
  it("Zustände: leer, kein Vergleich, Fehler; Namen werden escaped", () => {
    const k = { verfuegbar: false, text: "t" };
    expect(renderToStaticMarkup(h(Aenderungsuebersicht, { rolle: "planer", uebersicht: { status: "ok", ereignisse: [], zaehler: {}, zusammenfassung: k } }))).toContain(AENDERUNG_TEXTE.leer);
    expect(renderToStaticMarkup(h(Aenderungsuebersicht, { rolle: "planer", uebersicht: { status: "kein_vergleich", ereignisse: [] } }))).toContain(AENDERUNG_TEXTE.keinVergleich);
    expect(renderToStaticMarkup(h(Aenderungsuebersicht, { rolle: "planer", uebersicht: { kaputt: 1 } }))).toContain(AENDERUNG_TEXTE.fehler);
    const x = renderToStaticMarkup(h(Aenderungsuebersicht, { rolle: "planer", uebersicht: { status: "ok", zaehler: { neu: 1 },
      ereignisse: [{ personId: "p", name: "<img src=x onerror=alert(1)>", datum: "2026-11-03", art: "neu", von: null, nach: { id: "F", kurz: "F" }, entwurf: false }] } }));
    expect(x).not.toContain("<img");
    expect(x).toContain("&lt;img");
  });
  it("Quelltext der Ansicht: kein console, kein Netz", () => {
    const q = readFileSync(path.join(WURZEL, "src/ansichten/intelligence/Aenderungsuebersicht.jsx"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(q).not.toMatch(/console\.|fetch\(|XMLHttpRequest|dangerouslySetInnerHTML/);
  });
});
