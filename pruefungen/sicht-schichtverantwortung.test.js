/* ==========================================================================
   SICHT DER SCHICHTVERANTWORTUNG — Personen (Commit 1e.1)

   Bis Oktober 2026 bekam die Schichtverantwortung jede Person des Betriebs
   vollständig. Jetzt gestuft und als Positivliste:
   eigene Person · eigener Bereich (im Sichtfenster) · Springer-Pool · fremd.

   Und der Schreibweg: Die gekürzte Sicht geht unverändert zurück, nichts
   Verborgenes geht verloren (Rückfüllung), und ein verborgenes Feld lässt
   sich nicht durchschreiben.
   ========================================================================== */

import { describe, it, expect } from "vitest";
import { bestandFuerRolle, zusammenfuehren, einheitZusammen, personenRueckfuellen } from "../server/lib/rechte.mjs";
import { SICHTFENSTER, schichtKontext, schichtPersonSicht } from "../server/lib/sicht.mjs";
import { heuteBerlin, tagePlus } from "../server/lib/zeiterfassung.mjs";

const HEUTE = heuteBerlin();
const tag = (n) => tagePlus(HEUTE, n);

/* Alles, was eine Person an Privatem, Gesundheitlichem und Geheimem tragen kann. */
const privat = (id) => ({
  email: `${id}@privat.de`, telefon: `0151-${id}`, mobil: `0171-${id}`,
  anschrift: `Gartenweg ${id}`, notfallkontakt: `Mutter von ${id}`, iban: `DE89-${id}`,
  steuerId: `ST-${id}`, sozialversicherung: `SV-${id}`, personalnummer: `PN-${id}`, lohn: 3100,
  notiz: `Leitungsnotiz-${id}`, emailVorher: `alt-${id}@privat.de`, rolleVerlauf: [{ rolle: "x" }],
  kalenderGeheim: `geheim-kal-${id}`, kalenderVerweis: `kal-${id}`, pushSchluessel: { endpoint: `push-${id}` },
  zustellung: { mail: true }, mutterschutz: true, schwerbehindert: true, geburtstag: "2009-05-01",
  nachtvorsorge: "2025-01-01", einschraenkungen: { keineNacht: true }, verfuegbarkeit: { aktiv: true },
  wunschfrei: [`${id}-wunsch`], stundenuebertrag: 12.5, urlaubsanspruch: 30, urlaubsuebertrag: 2,
  einarbeitung: { bis: tag(30) }, kompetenzNachweise: [], darfNichtRaus: `darf-nicht-raus-${id}`,
  qualNachweise: [{ qualId: "pfk", ablauf: "2030-01-01", datei: `scan-${id}.pdf` },
    { qualId: "masern", vorhanden: true, datei: `impf-${id}.pdf` }],
  qualifikationen: ["pfk", "masern"],
});
const person = (id, rolle, einheit, zug, extra = {}) => ({ id, vorname: "V", nachname: `N${id}`, rolle,
  bereich: einheit, status: "aktiv", funktion: "Fachkraft", wochenstunden: 38.5,
  zugehoerigkeit: zug || [{ ab: "2020-01-01", einheitId: einheit }], ...privat(id), ...extra });

/* s1 Schichtverantwortung e1 · a1 in e1 · b1 in e2 · sp1 im Pool · v1 bis vor
   30 Tagen in e1, jetzt e2 · alt1 bis vor 100 Tagen in e1 · k1 kommt in 30
   Tagen nach e1 · l1 Leitung. */
const bestand = () => ({ version: 9, stand: 1, session: null, mandanten: [{
  id: "m1", name: "Haus", einheiten: [{ id: "e1" }, { id: "e2" }, { id: "pool", pool: true }],
  qualifikationen: [{ id: "pfk", name: "PFK" }, { id: "masern", name: "Masern", nurStatus: true }],
  dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00" }],
  personen: [
    person("s1", "subplaner", "e1"), person("a1", "mitarbeiter", "e1"), person("b1", "mitarbeiter", "e2"),
    person("sp1", "mitarbeiter", "pool", null, { springer: true }),
    person("v1", "mitarbeiter", "e2", [{ ab: "2020-01-01", einheitId: "e1" }, { ab: tag(-30), einheitId: "e2" }]),
    person("alt1", "mitarbeiter", "e2", [{ ab: "2020-01-01", einheitId: "e1" }, { ab: tag(-100), einheitId: "e2" }]),
    person("k1", "mitarbeiter", "e2", [{ ab: "2020-01-01", einheitId: "e2" }, { ab: tag(30), einheitId: "e1" }]),
    person("l1", "leitung", "ALLE"),
  ],
  abweichungen: {}, abwesenheiten: [], anfragen: [], nachrichten: [], erfassung: {}, einstempeln: {},
}] });
const SUB = { rolle: "subplaner", person: "s1", betrieb: 0 };
const LEITUNG = { rolle: "leitung", person: "l1", betrieb: 0 };
const PLANER = { rolle: "planer", person: "l1", betrieb: 0 };
const sichtPersonen = (g = bestand(), s = SUB) => bestandFuerRolle(g, s).mandanten[0].personen;
const p = (liste, id) => liste.find((x) => x.id === id);

describe("eigene Person", () => {
  it("wie Beschäftigte (EIGENE_PERSON), mit eigener E-Mail und Kontakten, ohne Leitungsnotiz und Lohnfelder", () => {
    const ich = p(sichtPersonen(), "s1");
    expect(ich.sichtbereich).toBe("eigen");
    expect(ich).toMatchObject({ email: "s1@privat.de", telefon: "0151-s1", anschrift: "Gartenweg s1",
      kalenderGeheim: "geheim-kal-s1", stundenuebertrag: 12.5 });
    for (const f of ["notiz", "emailVorher", "iban", "lohn", "personalnummer", "mutterschutz", "darfNichtRaus"])
      expect(ich[f], f).toBeUndefined();
  });
});

describe("eigener Bereich", () => {
  it("Plan, Qualifikation, Einschränkungen, Konten, Schutzmerkmale, Telefon und Mobil", () => {
    const a = p(sichtPersonen(), "a1");
    expect(a.sichtbereich).toBe("bereich");
    expect(a).toMatchObject({ telefon: "0151-a1", mobil: "0171-a1", mutterschutz: true, schwerbehindert: true,
      geburtstag: "2009-05-01", nachtvorsorge: "2025-01-01", stundenuebertrag: 12.5, urlaubsanspruch: 30,
      einschraenkungen: { keineNacht: true }, wunschfrei: ["a1-wunsch"], qualifikationen: ["pfk", "masern"] });
    expect(a.qualNachweise).toEqual([{ qualId: "pfk", ablauf: "2030-01-01" }, { qualId: "masern", vorhanden: true }]);
  });
  it("ohne E-Mail, Anschrift, Notfallkontakt, Lohn, Leitungsnotiz, Geheimnisse, Verlauf", () => {
    const a = p(sichtPersonen(), "a1");
    for (const f of ["email", "anschrift", "notfallkontakt", "iban", "steuerId", "sozialversicherung",
      "personalnummer", "lohn", "notiz", "emailVorher", "rolleVerlauf", "kalenderGeheim", "kalenderVerweis",
      "pushSchluessel", "zustellung", "darfNichtRaus"])
      expect(a[f], f).toBeUndefined();
  });
  it("Sichtfenster: kürzlich versetzt und demnächst kommend gehören dazu, lange her nicht", () => {
    const l = sichtPersonen();
    expect(p(l, "v1").sichtbereich).toBe("bereich");
    expect(p(l, "k1").sichtbereich).toBe("bereich");
    expect(p(l, "alt1").sichtbereich).toBe("fremd");
  });
  it("das Fenster ist zentral und lässt sich übergeben", () => {
    expect(SICHTFENSTER).toEqual({ vorTage: 60, nachTage: 90 });
    const m = bestand().mandanten[0];
    const eng = schichtKontext(m, SUB, "e1", HEUTE, { vorTage: 10, nachTage: 10 });
    expect(schichtPersonSicht(p(m.personen, "v1"), eng).sichtbereich).toBe("fremd");
    expect(schichtPersonSicht(p(m.personen, "k1"), eng).sichtbereich).toBe("fremd");
    const weit = schichtKontext(m, SUB, "e1", HEUTE, { vorTage: 200, nachTage: 10 });
    expect(schichtPersonSicht(p(m.personen, "alt1"), weit).sichtbereich).toBe("bereich");
  });
});

describe("Springer-Pool", () => {
  it("planungsrelevant mit Schutzmerkmalen und Telefon — ohne Konten und Wünsche", () => {
    const sp = p(sichtPersonen(), "sp1");
    expect(sp.sichtbereich).toBe("pool");
    expect(sp).toMatchObject({ telefon: "0151-sp1", mobil: "0171-sp1", mutterschutz: true,
      einschraenkungen: { keineNacht: true }, verfuegbarkeit: { aktiv: true } });
    for (const f of ["stundenuebertrag", "urlaubsanspruch", "urlaubsuebertrag", "wunschfrei", "email", "anschrift",
      "notfallkontakt", "notiz", "kalenderGeheim", "pushSchluessel", "iban", "lohn", "darfNichtRaus"])
      expect(sp[f], f).toBeUndefined();
  });
});

describe("andere Bereiche", () => {
  it("nur, was Beschäftigte sehen — keine Schutzmerkmale, kein Telefon", () => {
    const b = p(sichtPersonen(), "b1");
    const wieBeschaeftigte = p(bestandFuerRolle(bestand(), { rolle: "mitarbeiter", person: "a1", betrieb: 0 })
      .mandanten[0].personen, "b1");
    expect({ ...b, sichtbereich: undefined }).toEqual({ ...wieBeschaeftigte, sichtbereich: undefined });
    expect(b.sichtbereich).toBe("fremd");
    for (const f of ["mutterschutz", "schwerbehindert", "geburtstag", "nachtvorsorge", "telefon", "mobil",
      "einschraenkungen", "stundenuebertrag"])
      expect(b[f], f).toBeUndefined();
    expect(b.qualifikationen).toEqual(["pfk"]);            // Status-Qualifikation fällt heraus
  });
  it("ohne gültigen eigenen Bereich ist jede andere Person fremd — auch der Pool", () => {
    const g = bestand();
    const s = p(g.mandanten[0].personen, "s1");
    s.bereich = "gibt-es-nicht"; s.zugehoerigkeit = [{ ab: "2020-01-01", einheitId: "gibt-es-nicht" }];
    const l = sichtPersonen(g);
    expect(l.filter((x) => x.id !== "s1").every((x) => x.sichtbereich === "fremd")).toBe(true);
  });
});

describe("fail-closed", () => {
  it("ein unbekanntes neues Personenfeld geht an niemanden hinaus", () => {
    const text = JSON.stringify(bestandFuerRolle(bestand(), SUB));
    expect(text).not.toContain("darf-nicht-raus");
  });
  it("kein Fremdgeheimnis, keine fremde Lohn- oder Privatangabe im ganzen Payload", () => {
    const text = JSON.stringify(bestandFuerRolle(bestand(), SUB));
    for (const id of ["a1", "b1", "sp1", "v1", "alt1", "k1", "l1"])
      for (const s of [`geheim-kal-${id}`, `push-${id}`, `DE89-${id}`, `Gartenweg ${id}`, `Mutter von ${id}`,
        `Leitungsnotiz-${id}`, `alt-${id}@`, `${id}@privat.de`, `PN-${id}`, `scan-${id}.pdf`])
        expect(text, s).not.toContain(s);
  });
  it("Schutzmerkmale nur im eigenen Bereich und im Pool", () => {
    const l = sichtPersonen();
    for (const x of l) {
      const darf = ["bereich", "pool"].includes(x.sichtbereich);
      expect(x.mutterschutz !== undefined, `${x.id}`).toBe(darf);
    }
  });
});

describe("Rundweg und Rückfüllung", () => {
  function rundweg(aendern) {
    const g = bestand();
    const gelesen = JSON.parse(JSON.stringify(bestandFuerRolle(g, SUB)));
    aendern(gelesen.mandanten[0]);
    return { g, e: zusammenfuehren(g, gelesen, SUB) };
  }
  it("gekürzte Sicht lesen, im Bereich planen, zurückschreiben: angenommen, nichts Verborgenes verloren", () => {
    const { g, e } = rundweg((m) => { m.abweichungen[`a1|${tag(3)}`] = "F"; });
    expect(e.verweigert).toBeFalsy();
    expect(e.mandanten[0].abweichungen[`a1|${tag(3)}`]).toBe("F");
    expect(e.mandanten[0].personen).toEqual(g.mandanten[0].personen);           // wertgleich
    expect(JSON.stringify(e.mandanten[0].personen)).not.toContain("sichtbereich");
    const leitung = bestandFuerRolle(e, LEITUNG).mandanten[0].personen;
    expect(leitung).toEqual(g.mandanten[0].personen);
    expect(JSON.stringify(bestandFuerRolle(e, SUB))).not.toContain("Leitungsnotiz-a1");   // weiter gekürzt
  });
  it("die eigene Telefonnummer ändern: angenommen, Verborgenes bleibt", () => {
    const { g, e } = rundweg((m) => { p(m.personen, "s1").telefon = "0160-neu"; });
    expect(e.verweigert).toBeFalsy();
    const s = p(e.mandanten[0].personen, "s1");
    expect(s.telefon).toBe("0160-neu");
    expect(s.notiz).toBe(p(g.mandanten[0].personen, "s1").notiz);
    expect(s.iban).toBe("DE89-s1");
  });
  it("ohne Rückfüllung scheitert derselbe Rundweg — mit ihr nicht", () => {
    const g = bestand();
    const sicht = JSON.parse(JSON.stringify(bestandFuerRolle(g, SUB))).mandanten[0];
    sicht.abweichungen[`a1|${tag(3)}`] = "F";
    expect(einheitZusammen(g.mandanten[0], sicht, SUB).ok).toBe(false);
    expect(einheitZusammen(g.mandanten[0], personenRueckfuellen(g.mandanten[0], sicht, SUB), SUB).ok).toBe(true);
  });
});

describe("Angriffe auf verborgene Felder: kein Durchschreiben", () => {
  const versuche = {
    "Leitungsnotiz an einer Person des Bereichs setzen": (m) => { p(m.personen, "a1").notiz = "manipuliert"; },
    "IBAN an einer fremden Person setzen": (m) => { p(m.personen, "b1").iban = "DE00"; },
    "Kalendergeheimnis einer Person des Bereichs setzen": (m) => { p(m.personen, "a1").kalenderGeheim = "mein-geheimnis"; },
    "Mutterschutz einer fremden Person setzen": (m) => { p(m.personen, "b1").mutterschutz = false; },
    "Telefon einer Person des Bereichs ändern": (m) => { p(m.personen, "a1").telefon = "0000"; },
    "sichtbare Angabe einer Person des Bereichs entfernen": (m) => { delete p(m.personen, "a1").einschraenkungen; },
    "eigene IBAN setzen": (m) => { p(m.personen, "s1").iban = "DE00"; },
    "eigene Leitungsnotiz setzen": (m) => { p(m.personen, "s1").notiz = "selbst"; },
    "sichtbereich umschreiben": (m) => { p(m.personen, "b1").sichtbereich = "bereich"; },
  };
  for (const [name, f] of Object.entries(versuche)) {
    it(`${name}: abgewiesen`, () => {
      const g = bestand();
      const gelesen = JSON.parse(JSON.stringify(bestandFuerRolle(g, SUB)));
      f(gelesen.mandanten[0]);
      expect(zusammenfuehren(g, gelesen, SUB).verweigert).toBeTruthy();
    });
  }
});

describe("Planung und Leitung unverändert", () => {
  it("bekommen die Personen vollständig, ohne sichtbereich", () => {
    for (const s of [LEITUNG, PLANER]) expect(sichtPersonen(bestand(), s)).toEqual(bestand().mandanten[0].personen);
  });
});
