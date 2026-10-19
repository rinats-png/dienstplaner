/* ==========================================================================
   SICHT VON PLANUNG UND LEITUNG (Commit 1e.3)

   Bis Oktober 2026 bekamen Planung, Leitung und Kundenrolle den eigenen
   Betrieb roh — Kalendergeheimnisse, Bank-, Steuer- und Lohnfelder,
   Notfallkontakte und frühere Anmeldeadressen aller Personen, Vertrag und
   Rechnungsangaben samt interner Betreibernotiz, oben die Preisliste und
   die Rechnungen aller Betriebe des Raums. Jetzt ein Positivkatalog.

   Übergang bis Commit 4: pushSchluessel, zustellung und email fremder
   Personen bleiben (die Oberfläche stellt heute selbst zu) — hier
   ausdrücklich festgeschrieben, damit Commit 4 die Stelle bewusst ändert.
   ========================================================================== */

import { describe, it, expect } from "vitest";
import { bestandFuerRolle, zusammenfuehren } from "../server/lib/rechte.mjs";

const GEHEIM = "darf-nicht-raus";
const person = (id, rolle, extra = {}) => ({ id, vorname: "V", nachname: `N${id}`, rolle, bereich: "ALLE",
  zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }], rolleSeit: "2020-01-01", rolleVerlauf: [{ ab: "2020-01-01", rolle }],
  email: `${id}@x.de`, telefon: `0151-${id}`, pushSchluessel: { endpoint: `push-${id}` }, zustellung: { planGeaendert: { mail: true } },
  kalenderGeheim: `kal-geheim-${id}`, kalenderVerweis: `https://kal/${id}`, kalenderStand: "2026-10-01",
  emailVorher: `alt-${id}@x.de`, emailGeaendert: "2026-09-01", iban: `IBAN-${id}`, steuerId: `ST-${id}`,
  sozialversicherung: `SV-${id}`, lohn: 3100, gehalt: 3200, notfallkontakt: `Mutter von ${id}`, personalnummer: `PN-${id}`,
  notiz: `Planungswissen-${id}`, mutterschutz: true, schwerbehindert: true, geburtstag: "2000-01-01",
  stundenuebertrag: 5, qualifikationen: ["pfk"], qualNachweise: [{ qualId: "pfk", ablauf: "2030-01-01" }],
  einschraenkungen: { keineNacht: true }, neuesGeheimesFeld: GEHEIM, ...extra });
const bestand = () => ({
  version: 9, stand: 1, session: null,
  betreiber: { firma: "CENTRIC", iban: "BETREIBER-IBAN" }, tarife: [{ id: "t1", preis: 99 }],
  rechnungen: [{ id: "r1", mandantId: "m1", brutto: 100 }, { id: "r2", mandantId: "m2", brutto: 200 }],
  protokoll: [{ id: "bp", text: "Betreiberprotokoll" }], pakete: [{ id: "x" }], adressaenderungen: [{ alt: "a" }],
  selbststarts: [{ raum: "t-1" }], neuesGeheimesFeld: GEHEIM,
  mandanten: [{
    id: "m1", name: "Haus", branche: "pflege", einheiten: [{ id: "e1" }], dienstarten: [{ id: "F" }],
    personen: [person("l1", "leitung"), person("p1", "planer"), person("a1", "mitarbeiter")],
    abweichungen: { "a1|2026-12-01": "F" }, abwesenheiten: [{ id: "ab", personId: "a1", art: "krank", von: "2026-12-01", bis: "2026-12-01", notiz: "Grippe" }],
    nachrichten: [{ id: "n1", personId: "a1", titel: "x" }], notizen: { "person|a1": [{ id: "pn", text: "Planungsnotiz" }] },
    protokoll: [{ id: "bl", text: "Betriebsprotokoll" }],
    status: "aktiv", stichtag: "2027-01-01", laeuftAb: null, pakete: ["pflege"],
    tarif: "pro", preisgestaltung: { sonder: 10 }, rabattGrund: "Freund", seit: "2025-01-01", bis: "2027-12-31",
    testTage: 30, selbstAngelegt: false, kontakt: "kontakt@kunde.de", kontaktName: "Frau Kunde", anschrift: "Kundenweg 1",
    ustId: "DE123", notiz: "interne Betreibernotiz", raum: "raum-1",
    lohnarten: [{ id: "lz", nr: "100" }], adressAenderungen: [{ personId: "l1", von: "a@x", nach: "b@x" }],
    neuesGeheimesFeld: GEHEIM,
  }, { id: "m2", name: "Anderes Haus", personen: [person("f1", "leitung")] }],
});
const PLANER = { rolle: "planer", person: "p1", betrieb: 0 };
const LEITUNG = { rolle: "leitung", person: "l1", betrieb: 0 };
const KUNDE = { rolle: "kunde", person: "l1", betrieb: 0 };
const BETREIBER = { rolle: "betreiber", person: null, betrieb: 0 };
const FREMD_WEG = ["kalenderGeheim", "kalenderVerweis", "kalenderStand", "emailVorher", "emailGeaendert",
  "iban", "steuerId", "sozialversicherung", "lohn", "gehalt", "notfallkontakt", "neuesGeheimesFeld"];
const BETRIEB_WEG = ["tarif", "preisgestaltung", "rabattGrund", "seit", "bis", "testTage", "selbstAngelegt",
  "kontakt", "kontaktName", "anschrift", "ustId", "notiz", "raum", "neuesGeheimesFeld"];
const OBEN_WEG = ["betreiber", "tarife", "rechnungen", "protokoll", "pakete", "adressaenderungen", "selbststarts", "neuesGeheimesFeld"];
const pers = (b, id) => b.mandanten[0].personen.find((x) => x.id === id);

for (const [name, sitz, ich] of [["Planung", PLANER, "p1"], ["Leitung", LEITUNG, "l1"], ["Kundenrolle", KUNDE, "l1"]]) {
  describe(name, () => {
    const b = bestandFuerRolle(bestand(), sitz);
    const fremd = pers(b, "a1");
    it("fremde Personen: keine Kalendergeheimnisse, kein Bank/Steuer/Sozialversicherung/Lohn/Gehalt, kein Notfallkontakt, kein emailVorher, nichts Unbekanntes", () => {
      for (const f of FREMD_WEG) expect(fremd[f], f).toBeUndefined();
    });
    it("fremde Personen: was Planung und Personalarbeit brauchen, bleibt", () => {
      expect(fremd).toMatchObject({ personalnummer: "PN-a1", notiz: "Planungswissen-a1", mutterschutz: true, schwerbehindert: true,
        geburtstag: "2000-01-01", stundenuebertrag: 5, qualifikationen: ["pfk"], einschraenkungen: { keineNacht: true },
        rolleSeit: "2020-01-01", telefon: "0151-a1" });
      expect(fremd.rolleVerlauf).toEqual([{ ab: "2020-01-01", rolle: "mitarbeiter" }]);
      expect(fremd.qualNachweise).toEqual([{ qualId: "pfk", ablauf: "2030-01-01" }]);
    });
    /* Bis Commit 4 blieben die drei Felder (Übergang). Seit Commit 4 löst
       der Server Empfänger und Wege auf; die E-Mail bleibt als Kontaktangabe. */
    it("Commit 4: pushSchluessel und zustellung fremder Personen nicht mehr, email bleibt", () => {
      expect(fremd.pushSchluessel).toBeUndefined();
      expect(fremd.zustellung).toBeUndefined();
      expect(fremd.email).toBe("a1@x.de");
    });
    it("eigene Person vollständig (ohne Unbekanntes)", () => {
      const eigen = pers(b, ich);
      expect(eigen).toMatchObject({ kalenderGeheim: `kal-geheim-${ich}`, iban: `IBAN-${ich}`, notfallkontakt: `Mutter von ${ich}`,
        emailVorher: `alt-${ich}@x.de` });
      expect(eigen.neuesGeheimesFeld).toBeUndefined();
    });
    it("Betrieb: kein Vertrag, keine Rechnungsangaben, keine Betreibernotiz, nichts Unbekanntes", () => {
      for (const f of BETRIEB_WEG) expect(b.mandanten[0][f], f).toBeUndefined();
    });
    it("Betrieb: lohnarten, Testphase, Pakete, Adressänderungen, Plan und Sammlungen bleiben", () => {
      const m = b.mandanten[0], roh = bestand().mandanten[0];
      for (const f of ["lohnarten", "status", "stichtag", "laeuftAb", "pakete", "adressAenderungen", "abweichungen",
        "abwesenheiten", "nachrichten", "notizen", "protokoll", "einheiten", "dienstarten", "name", "branche"])
        expect(m[f], f).toEqual(roh[f]);
    });
    it("oben: nur Zähler, Sitzungsmarke und der eigene Betrieb — keine Rechnungen anderer Betriebe", () => {
      expect(Object.keys(b).sort()).toEqual(["mandanten", "session", "stand", "version"]);
      for (const f of OBEN_WEG) expect(b[f], f).toBeUndefined();
      expect(JSON.stringify(b)).not.toContain("r2");
      expect(b.mandanten.map((x) => x.id)).toEqual(["m1"]);
    });
    it("Marker erscheinen nicht", () => {
      const text = JSON.stringify(b);
      for (const s of [GEHEIM, "kal-geheim-a1", "IBAN-a1", "ST-a1", "SV-a1", "Mutter von a1", "alt-a1@", "BETREIBER-IBAN",
        "interne Betreibernotiz", "Kundenweg", "DE123", "Betreiberprotokoll"])
        expect(text, s).not.toContain(s);
    });

    function rundweg(aendern) {
      const g = bestand();
      const gelesen = JSON.parse(JSON.stringify(bestandFuerRolle(g, sitz)));
      aendern(gelesen, gelesen.mandanten[0]);
      return { g, e: zusammenfuehren(g, gelesen, sitz) };
    }
    it("Rundweg: gekürzt lesen, Plan ändern, Person bearbeiten und anlegen — alles Verborgene gespeichert", () => {
      const { g, e } = rundweg((x, m) => {
        m.abweichungen["a1|2026-12-02"] = "F";
        pers(x, "a1").telefon = "0160-neu";
        m.personen.push({ id: "neu", vorname: "N", nachname: "Neu", rolle: "mitarbeiter", zugehoerigkeit: [{ ab: "2026-11-01", einheitId: "e1" }] });
      });
      expect(e.verweigert).toBeFalsy();
      const roh = g.mandanten[0], neu = e.mandanten[0];
      expect(neu.abweichungen["a1|2026-12-02"]).toBe("F");
      const a = neu.personen.find((x) => x.id === "a1");
      expect(a.telefon).toBe("0160-neu");
      expect({ ...a, telefon: undefined }).toEqual({ ...roh.personen.find((x) => x.id === "a1"), telefon: undefined });
      expect(neu.personen.find((x) => x.id === "neu")).toBeTruthy();
      for (const f of BETRIEB_WEG) expect(neu[f], f).toEqual(roh[f]);
      for (const f of OBEN_WEG) expect(e[f], f).toEqual(g[f]);
      expect(e.mandanten[1]).toEqual(g.mandanten[1]);
      /* Gespeichert direkt prüfen — seit Commit D1 sieht auch der Betreiber
         nur einen Ausschnitt. */
      expect(e.mandanten[0].personen.find((x) => x.id === "a1").iban).toBe("IBAN-a1");
      expect(e.rechnungen).toEqual(g.rechnungen);
    });
    it("Angriff: fremdes kalenderGeheim, iban, steuerId, Betreiberfeld gezielt mitschicken — wirkungslos", () => {
      const { g, e } = rundweg((x, m) => {
        Object.assign(pers(x, "a1"), { kalenderGeheim: "mein-geheimnis", iban: "DE00", steuerId: "0", notfallkontakt: "x" });
        m.notiz = "überschrieben"; m.ustId = "DE000"; m.neuesGeheimesFeld = "neu";
        x.tarife = []; x.rechnungen = [];
        m.personen.push({ id: "neu2", vorname: "N", nachname: "Neu", rolle: "mitarbeiter", iban: "DE11", kalenderGeheim: "k" });
      });
      expect(e.verweigert).toBeFalsy();
      const roh = g.mandanten[0].personen.find((x) => x.id === "a1");
      const a = e.mandanten[0].personen.find((x) => x.id === "a1");
      for (const f of ["kalenderGeheim", "iban", "steuerId", "notfallkontakt"]) expect(a[f], f).toEqual(roh[f]);
      expect(e.mandanten[0].notiz).toBe("interne Betreibernotiz");
      expect(e.mandanten[0].ustId).toBe("DE123");
      expect(e.mandanten[0].neuesGeheimesFeld).toBe(GEHEIM);
      expect(e.tarife).toEqual(g.tarife);
      const n2 = e.mandanten[0].personen.find((x) => x.id === "neu2");
      expect(n2.iban).toBeUndefined();
      expect(n2.kalenderGeheim).toBeUndefined();
    });
    it("die eigene Person darf ihre eigenen Angaben weiter ändern (eigener Kalender)", () => {
      const { e } = rundweg((x) => { pers(x, ich).kalenderGeheim = "eigenes-neu"; });
      expect(e.mandanten[0].personen.find((x) => x.id === ich).kalenderGeheim).toBe("eigenes-neu");
    });
  });
}

/* Bis Commit D1 bekam der Betreiber den ganzen Bestand. Seit D1 eine eigene
   Positivliste (pruefungen/betreiber-sicht.test.js). */
describe("Betreiber: eigene Positivliste, nicht der ganze Bestand", () => {
  it("oben seine Felder, im Betrieb keine Personaldaten", () => {
    const b = bestandFuerRolle(bestand(), BETREIBER);
    expect(b.rechnungen).toEqual(bestand().rechnungen);
    expect(b.betreiber).toEqual(bestand().betreiber);
    const text = JSON.stringify(b.mandanten);
    for (const s of ["IBAN-a1", "kal-geheim-a1", "Mutter von a1"]) expect(text).not.toContain(s);
  });
});
