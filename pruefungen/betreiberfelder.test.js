/* ==========================================================================
   BETREIBERFELDER — Schreibschutz (Commit 1e.2a)

   Bis Oktober 2026 kam die oberste Ebene des Bestands bei Leitung, Planung
   und Kundenrolle aus der Übermittlung: Preisliste, Rechnungen,
   Selbststarts, Pakete, Adressänderungen, Firmenstamm des Betreibers und
   sein Protokoll ließen sich mit einem PUT überschreiben. Im Betrieb waren
   Rechnungsangaben, Betreibernotiz, Raum und Lohnarten ungeschützt.

   Jetzt: für alle Rollen außer dem Betreiber wirkungslos (der gespeicherte
   Stand gilt), fehlende Felder bleiben, der Betreiber schreibt wie bisher.
   Dazu die Bindung der Notruf-Mitteilungen der Schichtverantwortung an
   einen tatsächlich angelegten Notruf.
   ========================================================================== */

import { describe, it, expect } from "vitest";
import { bestandFuerRolle, zusammenfuehren } from "../server/lib/rechte.mjs";

const person = (id, rolle, einheit, extra = {}) => ({ id, vorname: "V", nachname: `N${id}`, rolle, bereich: einheit,
  zugehoerigkeit: [{ ab: "2020-01-01", einheitId: einheit }], email: `${id}@x.de`, ...extra });
const bestand = () => ({
  version: 9, stand: 1, session: null,
  betreiber: { firma: "CENTRIC", ustId: "DE000" }, tarife: [{ id: "t1", preis: 99 }],
  rechnungen: [{ id: "r1", betrag: 119 }], protokoll: [{ id: "bp1", text: "Rechnung erstellt" }],
  pakete: [{ id: "pflege" }], adressaenderungen: [{ alt: "a@x", neu: "b@x" }], selbststarts: [{ raum: "t-1" }],
  mandanten: [{
    id: "m1", name: "Haus", einheiten: [{ id: "e1" }, { id: "e2" }],
    personen: [person("l1", "leitung", "ALLE"), person("p1", "planer", "ALLE"), person("s1", "subplaner", "e1"),
      person("a1", "mitarbeiter", "e1"), person("b1", "mitarbeiter", "e2")],
    abweichungen: {}, anfragen: [], nachrichten: [], notrufe: [],
    status: "aktiv", tarif: "pro", preisgestaltung: { sonder: 10 }, rabattGrund: "Freund", testTage: 30, selbstAngelegt: false,
    kontakt: "kontakt@kunde.de", kontaktName: "Frau Kunde", anschrift: "Kundenweg 1", ustId: "DE123",
    notiz: "Betreibernotiz", raum: "raum-1", lohnarten: [{ id: "lz", nr: "100" }],
  }],
});
const LEITUNG = { rolle: "leitung", person: "l1", betrieb: 0 };
const PLANER = { rolle: "planer", person: "p1", betrieb: 0 };
const KUNDE = { rolle: "kunde", person: "l1", betrieb: 0 };
const SUB = { rolle: "subplaner", person: "s1", betrieb: 0 };
const BETREIBER = { rolle: "betreiber", person: null, betrieb: 0 };
const OBEN = ["betreiber", "tarife", "rechnungen", "protokoll", "pakete", "adressaenderungen", "selbststarts"];
const IM_BETRIEB = ["kontakt", "kontaktName", "anschrift", "ustId", "notiz", "raum", "lohnarten",
  "status", "tarif", "preisgestaltung", "rabattGrund", "testTage", "selbstAngelegt"];

/** Die Übermittlung einer Rolle: was sie liest, und darin verändert. */
function schreibe(sitz, aendern, g = bestand()) {
  const gelesen = JSON.parse(JSON.stringify(bestandFuerRolle(g, sitz)));
  aendern(gelesen, gelesen.mandanten[0]);
  return { g, e: zusammenfuehren(g, gelesen, sitz) };
}

describe("oberste Ebene: wirkungslos für alle außer dem Betreiber", () => {
  for (const [name, sitz] of [["Planung", PLANER], ["Leitung", LEITUNG], ["Kundenrolle", KUNDE], ["Schichtverantwortung", SUB]]) {
    it(`${name}: tarife, rechnungen, selbststarts, protokoll, betreiber, pakete, adressaenderungen ändern bleibt wirkungslos`, () => {
      const { g, e } = schreibe(sitz, (b) => {
        b.tarife = [{ id: "t1", preis: 0 }]; b.rechnungen = []; b.selbststarts = []; b.protokoll = [];
        b.betreiber = { firma: "Fremd" }; b.pakete = []; b.adressaenderungen = [];
      });
      expect(e.verweigert, name).toBeFalsy();
      for (const f of OBEN) expect(e[f], `${name}/${f}`).toEqual(g[f]);
    });
    it(`${name}: fehlende Betreiberfelder bleiben gespeichert`, () => {
      const { g, e } = schreibe(sitz, (b) => { for (const f of OBEN) delete b[f]; });
      for (const f of OBEN) expect(e[f], `${name}/${f}`).toEqual(g[f]);
    });
  }
  it("Zähler und Sitzungsmarke kommen weiter aus der Übermittlung", () => {
    const { e } = schreibe(LEITUNG, (b) => { b.stand = 7; b.version = 9; });
    expect(e.stand).toBe(7);
  });
});

describe("im Betrieb: Rechnungsangaben, Betreibernotiz, Raum, Lohnarten, Vertrag — wirkungslos", () => {
  for (const [name, sitz] of [["Planung", PLANER], ["Leitung", LEITUNG], ["Kundenrolle", KUNDE]]) {
    it(`${name}: ändern wirkungslos, normaler Plan-PUT angenommen`, () => {
      const { g, e } = schreibe(sitz, (b, m) => {
        Object.assign(m, { kontakt: "x", kontaktName: "x", anschrift: "x", ustId: "x", notiz: "x", raum: "x",
          lohnarten: [], status: "test", tarif: "frei", preisgestaltung: { sonder: -100 }, rabattGrund: "x",
          testTage: 999, selbstAngelegt: true });
        m.abweichungen["a1|2026-12-01"] = "F";
      });
      expect(e.verweigert, name).toBeFalsy();
      for (const f of IM_BETRIEB) expect(e.mandanten[0][f], `${name}/${f}`).toEqual(g.mandanten[0][f]);
      expect(e.mandanten[0].abweichungen["a1|2026-12-01"]).toBe("F");
    });
    it(`${name}: fehlende Felder bleiben gespeichert`, () => {
      const { g, e } = schreibe(sitz, (b, m) => { for (const f of IM_BETRIEB) delete m[f]; });
      for (const f of IM_BETRIEB) expect(e.mandanten[0][f], `${name}/${f}`).toEqual(g.mandanten[0][f]);
    });
  }
  it("Leitung pflegt weiter Name und Branche", () => {
    const { e } = schreibe(LEITUNG, (b, m) => { m.name = "Neues Haus"; m.branche = "pflege"; });
    expect(e.mandanten[0].name).toBe("Neues Haus");
    expect(e.mandanten[0].branche).toBe("pflege");
  });
});

describe("Betreiber: unverändert", () => {
  it("ändert Preisliste, Rechnungen, Protokoll und kaufmännische Felder", () => {
    const g = bestand();
    const u = JSON.parse(JSON.stringify(g));
    u.tarife = [{ id: "t1", preis: 89 }]; u.rechnungen = [{ id: "r2" }, ...u.rechnungen];
    u.protokoll = [{ id: "bp2", text: "neu" }, ...u.protokoll];
    Object.assign(u.mandanten[0], { kontakt: "neu@kunde.de", ustId: "DE456", notiz: "neu", preisgestaltung: { sonder: 5 } });
    const e = zusammenfuehren(g, u, BETREIBER);
    expect(e.verweigert).toBeFalsy();
    expect(e.tarife).toEqual([{ id: "t1", preis: 89 }]);
    expect(e.rechnungen.map((x) => x.id)).toEqual(["r2", "r1"]);
    expect(e.protokoll.map((x) => x.id)).toEqual(["bp2", "bp1"]);
    expect(e.mandanten[0]).toMatchObject({ kontakt: "neu@kunde.de", ustId: "DE456", notiz: "neu", preisgestaltung: { sonder: 5 } });
  });
});

describe("Notruf-Mitteilungen der Schichtverantwortung: nur mit eigenem Notruf", () => {
  const NOTRUF = { id: "nr-s", personId: "s1", art: "hilfe", notiz: "", empfaenger: ["l1", "p1"], bestaetigt: null };
  const mitteilung = (id, an, extra = {}) => ({ id, personId: an, art: "einspringen", titel: "NOTRUF: Hilfe",
    text: "V Ns1", ziel: "notruf", wege: { mail: `${an}@x.de`, push: null }, ...extra });
  it("ohne Notruf: 403", () => {
    const { e } = schreibe(SUB, (b, m) => { m.nachrichten.unshift(mitteilung("n1", "l1", { titel: "NOTRUF: Gehaltserhöhung bitte" })); });
    expect(e.verweigert).toBeTruthy();
  });
  it("mit Notruf, aber an eine Person außerhalb seiner Empfänger: 403", () => {
    const { e } = schreibe(SUB, (b, m) => {
      m.notrufe.unshift({ ...NOTRUF, empfaenger: ["l1"] });
      m.nachrichten.unshift(mitteilung("n1", "l1"), mitteilung("n2", "p1"));
    });
    expect(e.verweigert).toBeTruthy();
  });
  it("zwei Mitteilungen an denselben Empfänger: 403", () => {
    const { e } = schreibe(SUB, (b, m) => {
      m.notrufe.unshift({ ...NOTRUF });
      m.nachrichten.unshift(mitteilung("n1", "l1"), mitteilung("n2", "l1"));
    });
    expect(e.verweigert).toBeTruthy();
  });
  it("Titel ohne „NOTRUF:\", zu lang, Text zu lang: 403", () => {
    for (const extra of [{ titel: "Info" }, { titel: `NOTRUF: ${"x".repeat(120)}` }, { text: "x".repeat(301) }]) {
      const { e } = schreibe(SUB, (b, m) => { m.notrufe.unshift({ ...NOTRUF }); m.nachrichten.unshift(mitteilung("n1", "l1", extra)); });
      expect(e.verweigert, JSON.stringify(extra).slice(0, 40)).toBeTruthy();
    }
  });
  it("ein Notruf, der notrufeZusammen nicht besteht (unbekannte Art), trägt keine Mitteilung: 403", () => {
    const { e } = schreibe(SUB, (b, m) => { m.notrufe.unshift({ ...NOTRUF, art: "erfunden" }); m.nachrichten.unshift(mitteilung("n1", "l1")); });
    expect(e.verweigert).toBeTruthy();
  });
  it("ein schon gespeicherter Notruf trägt keine neue Mitteilung: 403", () => {
    const g = bestand(); g.mandanten[0].notrufe = [{ ...NOTRUF, zeit: "z", datum: "2026-10-01", dienst: null, ort: null }];
    const { e } = schreibe(SUB, (b, m) => { m.nachrichten.unshift(mitteilung("n1", "l1")); }, g);
    expect(e.verweigert).toBeTruthy();
  });
  it("echter eigener Notruf mit je einer Mitteilung an seine Empfänger: angenommen und bereinigt", () => {
    const { e } = schreibe(SUB, (b, m) => {
      m.notrufe.unshift({ ...NOTRUF });
      m.nachrichten.unshift(mitteilung("n1", "l1", { gelesen: true, zugestellt: { mail: "ok" }, geheim: "x", wege: { mail: "angreifer@x.de" } }),
        mitteilung("n2", "p1"));
    });
    expect(e.verweigert).toBeFalsy();
    const n1 = e.mandanten[0].nachrichten.find((n) => n.id === "n1");
    expect(n1).toMatchObject({ personId: "l1", art: "einspringen", titel: "NOTRUF: Hilfe", ziel: "notruf", gelesen: false,
      wege: { mail: null, push: null }, zugestellt: { mail: null, push: null } });
    expect(n1.geheim).toBeUndefined();
    expect(e.mandanten[0].nachrichten.find((n) => n.id === "n2").wege.mail).toBe("p1@x.de");
    expect(e.mandanten[0].notrufe.find((n) => n.id === "nr-s").empfaenger).toEqual(["l1", "p1"]);
  });
});
