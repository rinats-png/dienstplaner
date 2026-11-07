/* ==========================================================================
   MODUL WACHBUCH — Einträge je Objekt (WP-19, Strang A)

   Vorläufig nach der Entscheidungsmatrix: eigene Einträge mit Uhrzeit und
   Objekt (W1 a), Nachtrag statt Änderung und Löschen (W2 a), Lesen nach
   Zugriffsstufe (W4 a+b), Kontrollgang-Lücken nur mit Intervall (W5 b).
   Das Modul bleibt „geplant“; der Positivkatalog ist fail-closed.
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  WACHBUCH_ARTEN, WACHBUCH_ZUGRIFF, pruefeWachbuchEintrag, wachbuchZusammen, wachbuchSicht, wachbuchAusgabe, kontrollgangLuecken, wachbuchListe,
} from "../server/lib/modul-wachbuch.mjs";
import { BRANCHENMODULE, modulVon, pruefeModulRegistry, pruefeModulStatus } from "../server/lib/branchenmodule.mjs";
import { pruefeModulSchreibwege, MODUL_SCHREIBWEGE } from "../server/lib/modulschreibwege.mjs";
import { BETRIEB, WEG } from "../server/lib/sicht.mjs";
import { WachbuchTages } from "../src/module/wachbuch.jsx";

const DATUM = "2026-11-02";
const OBJEKTE = [{ id: "o1", name: "Objekt Nord", standortId: null, posten: [] }, { id: "o2", name: "Objekt Süd", standortId: null, posten: [] }];
const EINTRAG = (extra = {}) => ({ id: "w1", datum: DATUM, uhrzeit: "08:15", objektId: "o1", art: "vorkommnis", text: "Tor klemmt",
  einheitId: "e1", vonId: "p1", erfasst: "2026-11-02T08:20:00.000Z", ...extra });
/** Die gespeicherte Form { "Kennung|Tag": Eintrag } (Löschlauf- und Ausnahmeweg-Form). */
const K = (liste) => Object.fromEntries(liste.map((e) => [`${e.id}|${e.datum}`, e]));
const JETZT = "2026-11-02T09:00:00.000Z";
const ktx = (extra = {}) => ({ person: "p1", jetzt: JETZT, darfEintragen: () => true, ...extra });

describe("Registry und Katalog", () => {
  it("Modul registriert, Sicherheit, „geplant“, Personenfeld, Kontrollintervall-Vorgabe 0 (aus)", () => {
    expect(modulVon("wachbuch")).toMatchObject({ pakete: ["sicherheit"], status: "geplant", datenfelder: ["wachbuch"],
      personenfelder: ["wachbuch"], mitbestimmung: true });
    expect(modulVon("wachbuch").parameter.kontrollIntervallMinuten).toMatchObject({ standard: 0, min: 0 });
    expect(pruefeModulRegistry()).toEqual([]);
    expect(pruefeModulSchreibwege(MODUL_SCHREIBWEGE, BRANCHENMODULE)).toEqual([]);
  });
  it("das Feld steht im Positivkatalog, fail-closed (nichts geht hinaus)", () => {
    expect(BETRIEB.wachbuch[1]).toBe(WEG);
    expect(BETRIEB.wachbuch[0].art).toBe("reduziert");
  });
  it("Datenschutzgate: mit Personenfeld, Ausnahmeweg-Oberfläche und Berichtigungsschema verlässt das Modul „geplant“ ohne Befund", () => {
    const abgenommen = { ...modulVon("wachbuch"), status: "vorlaeufig", abnahme: { datum: "2026-12-01", nachweis: "docs/acc45/x.md" } };
    expect(pruefeModulStatus([abgenommen])).toEqual([]);
    expect(pruefeModulStatus([{ ...abgenommen, berichtigungsWerte: undefined }]).join()).toMatch(/Wertschema/);
  });
});

describe("Eintrag prüfen (W1 a)", () => {
  const opt = { objekte: OBJEKTE, liste: [] };
  it("ein gültiger Eintrag besteht", () => {
    expect(pruefeWachbuchEintrag(EINTRAG(), opt)).toBeNull();
  });
  it("Ereignisarten sind genau die vier des Konzepts", () => {
    expect(WACHBUCH_ARTEN).toEqual(["vorkommnis", "kontrollgang", "uebergabe", "hinweis"]);
    expect(pruefeWachbuchEintrag(EINTRAG({ art: "sonstiges" }), opt)).toMatch(/Ereignisart/);
  });
  it("Pflichtangaben: Datum, Uhrzeit, Objekt, Text, Verfasser, Erfassungszeit", () => {
    expect(pruefeWachbuchEintrag(EINTRAG({ datum: "2026-02-30" }), opt)).toMatch(/Datum/);
    expect(pruefeWachbuchEintrag(EINTRAG({ datum: "2026-11-2" }), opt)).toMatch(/Datum/);
    expect(pruefeWachbuchEintrag(EINTRAG({ uhrzeit: "24:00" }), opt)).toMatch(/Uhrzeit/);
    expect(pruefeWachbuchEintrag(EINTRAG({ uhrzeit: undefined }), opt)).toMatch(/Uhrzeit/);
    expect(pruefeWachbuchEintrag(EINTRAG({ objektId: "gibtsnicht" }), opt)).toMatch(/Objekt unbekannt/);
    expect(pruefeWachbuchEintrag(EINTRAG({ text: "   " }), opt)).toMatch(/Text/);
    expect(pruefeWachbuchEintrag(EINTRAG({ text: "x".repeat(1001) }), opt)).toMatch(/Text/);
    expect(pruefeWachbuchEintrag(EINTRAG({ vonId: "" }), opt)).toMatch(/Verfasser/);
    expect(pruefeWachbuchEintrag(EINTRAG({ erfasst: "" }), opt)).toMatch(/Erfassungszeit/);
  });
  it("unbekannte Felder und Nicht-Objekte werden abgewiesen", () => {
    expect(pruefeWachbuchEintrag(EINTRAG({ geheim: 1 }), opt)).toMatch(/unbekannte Felder/);
    expect(pruefeWachbuchEintrag("x", opt)).toMatch(/Eintrag/);
  });
  it("Nachtrag: nur zu einem bestehenden Eintrag, nicht zu einem Nachtrag, gleicher Tag und gleiches Objekt", () => {
    const basis = EINTRAG();
    const nach = EINTRAG({ id: "w2", nachtragZu: "w1", text: "Tor ist repariert", uhrzeit: "08:40" });
    expect(pruefeWachbuchEintrag(nach, { objekte: OBJEKTE, liste: [basis] })).toBeNull();
    expect(pruefeWachbuchEintrag(nach, { objekte: OBJEKTE, liste: [] })).toMatch(/unbekanntem Eintrag/);
    const zweit = EINTRAG({ id: "w3", nachtragZu: "w2", text: "x" });
    expect(pruefeWachbuchEintrag(zweit, { objekte: OBJEKTE, liste: [basis, nach] })).toMatch(/Nachtrag zu einem Nachtrag/);
    expect(pruefeWachbuchEintrag({ ...nach, datum: "2026-11-03" }, { objekte: OBJEKTE, liste: [basis] })).toMatch(/Datum und Objekt/);
    expect(pruefeWachbuchEintrag({ ...nach, objektId: "o2" }, { objekte: OBJEKTE, liste: [basis] })).toMatch(/Datum und Objekt/);
  });
});

describe("Schreibweg: anhängen, nie ändern oder löschen (W2 a)", () => {
  const alt = { objekte: OBJEKTE, wachbuch: K([EINTRAG()]) };
  it("ohne Feld im Schreibweg bleibt der Betrieb unverändert", () => {
    expect(wachbuchZusammen(alt, { objekte: OBJEKTE })).toEqual({ mandant: { objekte: OBJEKTE } });
    expect(wachbuchZusammen(alt, null)).toEqual({ mandant: null });
  });
  it("Verfasser und Erfassungszeit setzt der Server, auch gegen die Übermittlung", () => {
    const neu = K([EINTRAG(), EINTRAG({ id: "w5", vonId: "fremd", erfasst: "2000-01-01T00:00:00Z", uhrzeit: "10:00" })]);
    const r = wachbuchZusammen(alt, { objekte: OBJEKTE, wachbuch: neu }, ktx());
    expect(r.grund).toBeUndefined();
    expect(r.mandant.wachbuch["w5|2026-11-02"]).toMatchObject({ id: "w5", vonId: "p1", erfasst: JETZT, uhrzeit: "10:00" });
  });
  it("Eintragen nur für, wer an diesem Tag im Dienst für das Objekt steht", () => {
    const r = wachbuchZusammen(alt, { objekte: OBJEKTE, wachbuch: K([EINTRAG(), EINTRAG({ id: "w6" })]) },
      ktx({ darfEintragen: () => false }));
    expect(r.grund).toMatch(/im Dienst/);
    expect(r.mandant).toBeUndefined();
  });
  it("der Schlüssel muss zu Kennung und Datum passen", () => {
    const r = wachbuchZusammen(alt, { objekte: OBJEKTE, wachbuch: { ...K([EINTRAG()]), "w9|2026-11-02": EINTRAG({ id: "w7" }) } }, ktx());
    expect(r.grund).toMatch(/Schlüssel/);
  });
  it("ein gespeicherter Eintrag darf nicht geändert werden", () => {
    const r = wachbuchZusammen(alt, { objekte: OBJEKTE, wachbuch: K([EINTRAG({ text: "anders" })]) }, ktx());
    expect(r.grund).toMatch(/Nachtrag/);
  });
  it("ein gespeicherter Eintrag darf nicht entfernt werden", () => {
    expect(wachbuchZusammen(alt, { objekte: OBJEKTE, wachbuch: {} }, ktx()).grund).toMatch(/Nachtrag/);
  });
  it("ein Nachtrag wird angehängt, der Eintrag bleibt wörtlich gleich", () => {
    const nach = EINTRAG({ id: "w2", nachtragZu: "w1", text: "repariert", uhrzeit: "08:40" });
    const r = wachbuchZusammen(alt, { objekte: OBJEKTE, wachbuch: { ...K([EINTRAG()]), "w2|2026-11-02": nach } }, ktx());
    expect(r.grund).toBeUndefined();
    expect(Object.keys(r.mandant.wachbuch)).toHaveLength(2);
    expect(r.mandant.wachbuch["w1|2026-11-02"]).toEqual(EINTRAG());
    expect(r.mandant.wachbuch["w2|2026-11-02"]).toMatchObject({ id: "w2", nachtragZu: "w1", vonId: "p1", erfasst: JETZT });
  });
  it("Form: Objekt mit Schlüsseln; Liste oder Text wird abgewiesen; Höchstzahl", () => {
    expect(wachbuchZusammen(alt, { objekte: OBJEKTE, wachbuch: "x" }, ktx()).grund).toMatch(/erwartet/);
    expect(wachbuchZusammen(alt, { objekte: OBJEKTE, wachbuch: [EINTRAG()] }, ktx()).grund).toMatch(/erwartet/);
  });
  it("eine Liste wird beim Lesen als leer behandelt (keine Fehlinterpretation)", () => {
    expect(wachbuchListe([EINTRAG()])).toEqual([]);
    expect(wachbuchListe(undefined)).toEqual([]);
    expect(wachbuchListe(K([EINTRAG()]))).toHaveLength(1);
  });
});

describe("Lesen nach Zugriffsstufe (W4 a+b)", () => {
  const LISTE = [
    EINTRAG({ id: "a", vonId: "p1", einheitId: "e1" }),
    EINTRAG({ id: "b", vonId: "p2", einheitId: "e1" }),
    EINTRAG({ id: "c", vonId: "p3", einheitId: "e2" }),
    EINTRAG({ id: "d", vonId: "p2", einheitId: null }),
  ];
  const W = K(LISTE);
  it("Planung und Leitung sehen alle Einträge", () => {
    for (const r of ["PL", "LT"]) expect(wachbuchSicht(W, { zugriff: WACHBUCH_ZUGRIFF[r], person: "p1", eigeneEinheit: "e1" })).toHaveLength(4);
  });
  it("Schichtverantwortung sieht nur die eigene Einheit", () => {
    const ids = wachbuchSicht(W, { zugriff: WACHBUCH_ZUGRIFF.SV, person: "p9", eigeneEinheit: "e1" }).map((x) => x.id).sort();
    expect(ids).toEqual(["a", "b"]);
    expect(wachbuchSicht(W, { zugriff: "einheit", eigeneEinheit: null })).toEqual([]);
  });
  it("Beschäftigte sehen nur die eigenen Einträge, nie die von anderen", () => {
    const ids = wachbuchSicht(W, { zugriff: WACHBUCH_ZUGRIFF.MA, person: "p2" }).map((x) => x.id).sort();
    expect(ids).toEqual(["b", "d"]);
    expect(wachbuchSicht(W, { zugriff: "eigene", person: null })).toEqual([]);
  });
  it("Betriebsrat und Kunde sehen nichts; unbekannte Rollen auch nicht", () => {
    expect(WACHBUCH_ZUGRIFF.BR).toBe("keiner");
    expect(WACHBUCH_ZUGRIFF.Auftraggeber).toBe("keiner");
    expect(wachbuchSicht(W, { zugriff: WACHBUCH_ZUGRIFF.BR, person: "p1", eigeneEinheit: "e1" })).toEqual([]);
    expect(wachbuchSicht(W, { zugriff: WACHBUCH_ZUGRIFF.XY ?? "unbekannt" })).toEqual([]);
  });
  it("leere oder fehlende Angabe ist leer, kein Fehler", () => {
    expect(wachbuchSicht(undefined, { zugriff: "voll" })).toEqual([]);
    expect(wachbuchSicht(null, { zugriff: "voll" })).toEqual([]);
  });
});

describe("Ausgabe je Objekt und Zeitraum", () => {
  const LISTE = [
    EINTRAG({ id: "k2", uhrzeit: "10:00", art: "kontrollgang", vonId: "p1" }),
    EINTRAG({ id: "k1", uhrzeit: "08:00", art: "kontrollgang", vonId: "p2" }),
    EINTRAG({ id: "n1", nachtragZu: "k1", uhrzeit: "08:00", text: "Nachtrag von p1", vonId: "p1", erfasst: "2026-11-02T09:00:00Z" }),
    EINTRAG({ id: "n2", nachtragZu: "k1", uhrzeit: "08:00", text: "Nachtrag von p2", vonId: "p2", erfasst: "2026-11-02T09:30:00Z" }),
    EINTRAG({ id: "fremd", objektId: "o2", uhrzeit: "07:00" }),
    EINTRAG({ id: "tag2", datum: "2026-11-03", uhrzeit: "07:00" }),
  ];
  const W = K(LISTE);
  const aus = (extra = {}) => wachbuchAusgabe(W, { objektId: "o1", von: DATUM, bis: DATUM, zugriff: "voll", ...extra });
  it("sortiert nach Datum und Uhrzeit, Objekt und Zeitraum eingegrenzt, Nachträge unter dem Eintrag", () => {
    const { eintraege } = aus();
    expect(eintraege.map((e) => e.id)).toEqual(["k1", "k2"]);
    expect(wachbuchAusgabe(W, { objektId: "o1", von: DATUM, bis: "2026-11-03", zugriff: "voll" }).eintraege.map((e) => e.id))
      .toEqual(["k1", "k2", "tag2"]);
    expect(eintraege[0].nachtraege.map((n) => n.id)).toEqual(["n1", "n2"]);
    expect(eintraege[1].nachtraege).toEqual([]);
  });
  it("ist reproduzierbar: gleiche Daten, gleiches Ergebnis", () => {
    expect(JSON.stringify(aus())).toBe(JSON.stringify(aus()));
  });
  it("Beschäftigte sehen nur ihre Einträge; fremde Nachträge an eigenen Einträgen bleiben verborgen", () => {
    const { eintraege } = aus({ zugriff: "eigene", person: "p1" });
    expect(eintraege.map((e) => e.id)).toEqual(["k2"]);
    const p2 = aus({ zugriff: "eigene", person: "p2" }).eintraege;
    expect(p2.map((e) => e.id)).toEqual(["k1"]);
    expect(p2[0].nachtraege.map((n) => n.id)).toEqual(["n2"]);
  });
  it("Zeitraum: Anfang nach Ende, ungültiges Datum und mehr als 366 Tage werden abgewiesen", () => {
    expect(aus({ von: "2026-11-05", bis: "2026-11-01" }).grund).toMatch(/Anfang/);
    expect(aus({ von: "2026-02-31" }).grund).toMatch(/Datum/);
    expect(aus({ von: "2026-01-01", bis: "2027-06-01" }).grund).toMatch(/366/);
  });
  it("ohne Einträge: leere Liste", () => {
    expect(wachbuchAusgabe(undefined, { objektId: "o1", von: DATUM, bis: DATUM, zugriff: "voll" })).toEqual({ eintraege: [] });
  });
});

describe("Kontrollgang-Lücken (W5 b, standardmäßig aus)", () => {
  const KG = K([
    EINTRAG({ id: "a", art: "kontrollgang", uhrzeit: "08:00" }),
    EINTRAG({ id: "b", art: "kontrollgang", uhrzeit: "08:30" }),
    EINTRAG({ id: "c", art: "kontrollgang", uhrzeit: "10:30" }),
    EINTRAG({ id: "d", art: "vorkommnis", uhrzeit: "11:00" }),
  ]);
  const lk = (extra) => kontrollgangLuecken(KG, { objektId: "o1", datum: DATUM, ...extra });
  it("ohne Intervall (0, fehlend, null) keine Meldung", () => {
    expect(lk({ intervallMinuten: 0 })).toEqual([]);
    expect(lk({})).toEqual([]);
    expect(lk({ intervallMinuten: null })).toEqual([]);
  });
  it("Lücke über dem Intervall wird gemeldet, andere nicht", () => {
    expect(lk({ intervallMinuten: 60 })).toEqual([{ von: "08:30", bis: "10:30", minuten: 120 }]);
    expect(lk({ intervallMinuten: 120 })).toEqual([]);
  });
  it("mit Dienstzeit: Lücken am Anfang und Ende zählen", () => {
    expect(lk({ intervallMinuten: 60, von: "06:00", bis: "14:00" })).toEqual([
      { von: "06:00", bis: "08:00", minuten: 120 }, { von: "08:30", bis: "10:30", minuten: 120 }, { von: "10:30", bis: "14:00", minuten: 210 }]);
  });
  it("nur Kontrollgänge dieses Objekts und Tages zählen", () => {
    expect(kontrollgangLuecken(KG, { objektId: "o2", datum: DATUM, intervallMinuten: 10 })).toEqual([]);
  });
});

describe("Darstellung (Ansicht, 360 px tauglich)", () => {
  const m = { objekte: OBJEKTE, wachbuch: K([EINTRAG({ id: "w1", uhrzeit: "08:15" }),
    EINTRAG({ id: "w2", nachtragZu: "w1", text: "Nachtrag-Text", vonId: "p1", erfasst: "2026-11-02T09:00:00Z" })]) };
  it("leer, ohne Objekte", () => {
    expect(renderToStaticMarkup(h(WachbuchTages, { m: {}, datum: DATUM }))).toMatch(/Noch keine Objekte/);
  });
  it("zeigt Einträge und Nachträge für die Zugriffsstufe", () => {
    const html = renderToStaticMarkup(h(WachbuchTages, { m, datum: DATUM, zugriff: "voll" }));
    expect(html).toMatch(/Tor klemmt/);
    expect(html).toMatch(/Nachtrag-Text/);
    expect(html).toMatch(/Objekt Nord/);
  });
  it("ohne Zugriff: keine Einträge, kein Hinweis auf fremde Daten", () => {
    const html = renderToStaticMarkup(h(WachbuchTages, { m, datum: DATUM }));
    expect(html).toMatch(/Keine sichtbaren Einträge/);
    expect(html).not.toMatch(/Tor klemmt/);
  });
  it("ohne Umbruchfehler: keine feste Breite", () => {
    const html = renderToStaticMarkup(h(WachbuchTages, { m, datum: DATUM, zugriff: "voll" }));
    expect(html).not.toMatch(/width:\s*\d{3,}px/);
  });
});
