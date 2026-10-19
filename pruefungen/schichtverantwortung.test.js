/* ==========================================================================
   SCHICHTVERANTWORTUNG — Schreiben nur im eigenen Bereich

   Bis Oktober 2026 prüfte der Server bei der Schichtverantwortung nur die
   Tagesfelder; Anfragen, Nachrichten, Dienstbuch, Unterschreitungen,
   Änderungen und Protokoll gingen im Ganzen durch, Stempeluhr und
   Zeiterfassung ebenso. Und „ALLE" am eigenen Eintrag hob jede Grenze auf.

   Jeder Fall läuft den Weg der Anwendung: lesen (bestandFuerRolle),
   ändern, zurückschreiben (zusammenfuehren). Den HTTP-Weg prüft
   pruefungen/schichtverantwortung.mjs.
   ========================================================================== */

import { describe, it, expect } from "vitest";
import { bestandFuerRolle, zusammenfuehren, eigeneEinheit } from "../server/lib/rechte.mjs";
import { pruefeGestalt } from "../server/lib/gestalt.mjs";

const person = (id, nachname, rolle, einheit, extra = {}) => ({
  id, vorname: "V", nachname, rolle, bereich: einheit, status: "aktiv",
  zugehoerigkeit: [{ ab: "2020-01-01", einheitId: einheit }], qualifikationen: [], ...extra });

/* s1 Schichtverantwortung in e1; a1 Beschäftigte in e1; b1 Beschäftigte in e2. */
const bestand = () => ({
  version: 9, stand: 1, session: null,
  mandanten: [{
    id: "m1", name: "Haus", einheiten: [{ id: "e1", name: "WB 1" }, { id: "e2", name: "WB 2" }],
    dienstarten: [{ id: "F", name: "Früh" }],
    personen: [person("s1", "Sami", "subplaner", "e1", { email: "s@x.de" }),
      person("a1", "Anna", "mitarbeiter", "e1", { email: "a@x.de" }),
      person("b1", "Bert", "mitarbeiter", "e2", { email: "b@x.de" }),
      person("l1", "Lea", "leitung", "ALLE"),
      person("p1", "Paul", "planer", "ALLE")],
    abweichungen: { "a1|2026-11-01": "F", "b1|2026-11-01": "F" },
    abwesenheiten: [{ id: "abw-b", personId: "b1", art: "krank", von: "2026-10-01", bis: "2026-10-02" }],
    anfragen: [
      { id: "an-a", personId: "a1", typ: "abwesenheit", art: "urlaub", status: "offen", von: "2026-11-10", bis: "2026-11-12" },
      { id: "an-b", personId: "b1", typ: "abwesenheit", art: "urlaub", status: "offen", von: "2026-11-10", bis: "2026-11-12" },
      { id: "an-s", personId: "s1", typ: "abwesenheit", art: "urlaub", status: "offen", von: "2026-11-20", bis: "2026-11-21" },
      { id: "t-b", personId: "b1", typ: "tausch", status: "offen", partnerId: null, von: "2026-11-05", bis: "2026-11-05", interessenten: [] }],
    nachrichten: [
      { id: "n-b", personId: "b1", art: "info", titel: "B", gelesen: false },
      { id: "n-a", personId: "a1", art: "info", titel: "A", gelesen: false },
      { id: "n-s", personId: "s1", art: "info", titel: "S", gelesen: false }],
    dienstbuch: [{ id: "db1", datum: "2026-10-01", art: "info", text: "Übergabe", durch: "Lea" }],
    unterschreitungen: [{ id: "u1", datum: "2026-10-01", dienstId: "F", grund: "Ausfall" }],
    aenderungen: [{ id: "c2", personId: "a1", datum: "2026-10-02", von: "-", nach: "F" },
      { id: "c1", personId: "b1", datum: "2026-10-01", von: "-", nach: "F" }],
    protokoll: [{ id: "l2", zeit: "2", text: "zweiter" }, { id: "l1", zeit: "1", text: "erster" }],
    einspruenge: [],
    erfassung: { "b1|2026-10-01": { start: "06:00", ende: "14:00", bestaetigt: false } },
    einstempeln: { "b1|2026-10-01": { start: "06:00", ortStart: "Am Einsatzort", innerhalbStart: true } },
    notrufe: [{ id: "nr-a", personId: "a1", art: "medizin", notiz: "", zeit: "z", datum: "2026-10-12", empfaenger: ["s1"], bestaetigt: null }],
    selbstplanung: [{ id: "sp", monat: "2026-11", status: "offen", eintraege: [] }],
    ausschreibungen: [{ id: "as1", datum: "2026-11-25", dienstId: "F", status: "offen", bewerbungen: [] }],
  }, {
    id: "m2", name: "Fremd", einheiten: [{ id: "e1" }], personen: [person("f1", "Fremd", "mitarbeiter", "e1")],
  }],
});

const SUB = { rolle: "subplaner", person: "s1", betrieb: 0 };
const LEITUNG = { rolle: "leitung", person: "l1", betrieb: 0 };
const PLANER = { rolle: "planer", person: "p1", betrieb: 0 };

function schreibe(gespeichert, sitz, aendern) {
  const gelesen = JSON.parse(JSON.stringify(bestandFuerRolle(gespeichert, sitz)));
  aendern(gelesen.mandanten[0], gelesen);
  return zusammenfuehren(gespeichert, gelesen, sitz);
}
/* Seit 1e.2 sieht die Schichtverantwortung fremde Einträge nicht mehr.
   Ein Angriff auf sie heißt deshalb: den gespeicherten Eintrag verändert
   einschleusen. Ein bloßes Weglassen ist wirkungslos (Rückfüllung). */
const gespeichert = (feld, id) => JSON.parse(JSON.stringify(bestand().mandanten[0][feld].find((x) => x.id === id)));
const ok = (e) => { expect(e && !e.verweigert, e && e.verweigert).toBe(true); return e.mandanten[0]; };
const ab = (e) => { expect(e && e.verweigert, "abgewiesen erwartet").toBeTruthy(); return e.verweigert; };

describe("A/K — der eigene Bereich kommt aus der gespeicherten Person", () => {
  it("Zuständigkeitsbereich, sonst Zugehörigkeit von heute", () => {
    const m = bestand().mandanten[0];
    expect(eigeneEinheit(m, m.personen[0])).toBe("e1");
    expect(eigeneEinheit(m, { ...m.personen[0], bereich: undefined })).toBe("e1");
  });
  it("die Einheit aus Code oder Mitgliedschaft zählt nicht", () => {
    const e = schreibe(bestand(), { ...SUB, einheit: "e2" }, (m) => { m.abweichungen["b1|2026-11-02"] = "F"; });
    ab(e);
    ok(schreibe(bestand(), { ...SUB, einheit: "e2" }, (m) => { m.abweichungen["a1|2026-11-02"] = "F"; }));
  });
  it("„ALLE\" ist für die Schichtverantwortung kein Bereich, sondern fällt auf die Zugehörigkeit zurück", () => {
    const g = bestand(); g.mandanten[0].personen[0].bereich = "ALLE";
    ab(schreibe(g, SUB, (m) => { m.abweichungen["b1|2026-11-02"] = "F"; }));
    ok(schreibe(g, SUB, (m) => { m.abweichungen["a1|2026-11-02"] = "F"; }));
  });
  it("ohne gültigen Bereich: kein Schreiben", () => {
    const g = bestand(); g.mandanten[0].personen[0].bereich = "e9";
    g.mandanten[0].personen[0].zugehoerigkeit = [{ ab: "2020-01-01", einheitId: "e9" }];
    expect(ab(schreibe(g, SUB, (m) => { m.abweichungen["a1|2026-11-02"] = "F"; }))).toMatch(/kein Bereich/);
  });
  it("ohne Person: kein Schreiben", () => {
    ab(schreibe(bestand(), { ...SUB, person: "gibtsnicht" }, (m) => { m.abweichungen["a1|2026-11-02"] = "F"; }));
  });
});

describe("B — Plan", () => {
  it("1. eigener Bereich: erlaubt", () => {
    const m = ok(schreibe(bestand(), SUB, (m) => { m.abweichungen["a1|2026-11-02"] = "F"; delete m.abweichungen["a1|2026-11-01"]; }));
    expect(m.abweichungen["a1|2026-11-02"]).toBe("F");
    expect(m.abweichungen["a1|2026-11-01"]).toBeUndefined();
  });
  it("2. fremder Bereich: abgewiesen, auch Löschen", () => {
    ab(schreibe(bestand(), SUB, (m) => { m.abweichungen["b1|2026-11-02"] = "F"; }));
    ab(schreibe(bestand(), SUB, (m) => { delete m.abweichungen["b1|2026-11-01"]; }));
  });
  it("Zugehörigkeit am Tag entscheidet: nach einer Versetzung nicht mehr", () => {
    const g = bestand();
    g.mandanten[0].personen[1].zugehoerigkeit = [{ ab: "2020-01-01", einheitId: "e1" }, { ab: "2026-11-15", einheitId: "e2" }];
    ok(schreibe(g, SUB, (m) => { m.abweichungen["a1|2026-11-10"] = "F"; }));
    ab(schreibe(g, SUB, (m) => { m.abweichungen["a1|2026-11-20"] = "F"; }));
  });
  it("Stammdaten bleiben der Leitung", () => {
    ab(schreibe(bestand(), SUB, (m) => { m.dienstarten.push({ id: "N" }); }));
    ab(schreibe(bestand(), SUB, (m) => { m.einheiten[1].name = "x"; }));
    ab(schreibe(bestand(), SUB, (m) => { m.freigaben = { "2026-11": { stand: 1 } }; }));
  });
});

describe("C — Anträge", () => {
  it("3. fremden Antrag löschen: im eigenen Bereich abgewiesen, im fremden wirkungslos (nicht sichtbar)", () => {
    ab(schreibe(bestand(), SUB, (m) => { m.anfragen = m.anfragen.filter((a) => a.id !== "an-a"); }));
    const m = ok(schreibe(bestand(), SUB, (m) => { m.anfragen = m.anfragen.filter((a) => a.id !== "an-b"); }));
    expect(m.anfragen.find((a) => a.id === "an-b")).toEqual(gespeichert("anfragen", "an-b"));
  });
  it("4. auf eine andere Person umhängen: abgewiesen", () => {
    ab(schreibe(bestand(), SUB, (m) => { m.anfragen.push({ ...gespeichert("anfragen", "an-b"), personId: "a1" }); }));
    ab(schreibe(bestand(), SUB, (m) => { m.anfragen.find((a) => a.id === "an-a").personId = "b1"; }));
  });
  it("… oder Zeitraum und Art umschreiben: abgewiesen", () => {
    ab(schreibe(bestand(), SUB, (m) => { m.anfragen.find((a) => a.id === "an-a").von = "2026-11-01"; }));
    ab(schreibe(bestand(), SUB, (m) => { m.anfragen.find((a) => a.id === "an-a").art = "krank"; }));
  });
  it("fremden Antrag durch neuen mit derselben Kennung ersetzen: abgewiesen", () => {
    ab(schreibe(bestand(), SUB, (m) => {
      m.anfragen.push({ id: "an-b", personId: "a1", typ: "abwesenheit", art: "urlaub", status: "genehmigt", von: "2026-01-01", bis: "2026-12-31" });
    }));
  });
  it("5. Urlaub im eigenen Bereich genehmigen: Antrag und Abwesenheit, Entscheidung vom Server", () => {
    const m = ok(schreibe(bestand(), SUB, (m) => {
      const a = m.anfragen.find((x) => x.id === "an-a");
      Object.assign(a, { status: "genehmigt", durch: "Jemand Anderes", entschieden: "gefälscht", antwort: "ok" });
      m.abwesenheiten.push({ id: "abw-neu", personId: "a1", art: "urlaub", von: "2026-11-10", bis: "2026-11-12", notiz: "" });
    }));
    const a = m.anfragen.find((x) => x.id === "an-a");
    expect(a.status).toBe("genehmigt");
    expect(a.durch).toBe("V Sami");
    expect(a.entschieden).not.toBe("gefälscht");
    expect(m.abwesenheiten.find((x) => x.id === "abw-neu")).toMatchObject({ personId: "a1", art: "urlaub" });
  });
  it("… im fremden Bereich: abgewiesen", () => {
    ab(schreibe(bestand(), SUB, (m) => { m.anfragen.push({ ...gespeichert("anfragen", "an-b"), status: "genehmigt" }); }));
  });
  it("Urlaub ohne genehmigten Antrag eintragen: abgewiesen", () => {
    ab(schreibe(bestand(), SUB, (m) => {
      m.abwesenheiten.push({ id: "abw-x", personId: "a1", art: "urlaub", von: "2026-12-01", bis: "2026-12-03" });
    }));
  });
  it("den eigenen Antrag genehmigt sie sich nicht selbst", () => {
    expect(ab(schreibe(bestand(), SUB, (m) => { m.anfragen.find((x) => x.id === "an-s").status = "genehmigt"; })))
      .toMatch(/eigenen Antrag/);
    ab(schreibe(bestand(), SUB, (m) => {
      m.anfragen.find((x) => x.id === "an-s").status = "genehmigt";
      m.abwesenheiten.push({ id: "abw-s", personId: "s1", art: "urlaub", von: "2026-11-20", bis: "2026-11-21" });
    }));
  });
  it("neue Anfrage an den eigenen Bereich nur offen, an den fremden gar nicht", () => {
    const m = ok(schreibe(bestand(), SUB, (m) => {
      m.anfragen.unshift({ id: "ein1", personId: "a1", typ: "einsatz", status: "offen", von: "2026-11-30", bis: "2026-11-30", dienstId: "F" });
    }));
    expect(m.anfragen.find((x) => x.id === "ein1").status).toBe("offen");
    ab(schreibe(bestand(), SUB, (m) => {
      m.anfragen.unshift({ id: "ein2", personId: "b1", typ: "einsatz", status: "offen", von: "2026-11-30", bis: "2026-11-30" });
    }));
    ab(schreibe(bestand(), SUB, (m) => {
      m.anfragen.unshift({ id: "ein3", personId: "a1", typ: "abwesenheit", art: "urlaub", status: "genehmigt", von: "2026-12-01", bis: "2026-12-01" });
    }));
  });
  it("Freigaben: Bestehendes bleibt, höchstens die eigene kommt hinzu", () => {
    const g = bestand(); g.mandanten[0].anfragen[0].freigaben = [{ von: "Lea", zeit: "1" }];
    ab(schreibe(g, SUB, (m) => { m.anfragen[0].freigaben = []; }));
    const m = ok(schreibe(g, SUB, (m) => { m.anfragen[0].freigaben = [...m.anfragen[0].freigaben, { von: "Fälschung", zeit: "x" }]; }));
    expect(m.anfragen[0].freigaben.map((f) => f.von)).toEqual(["Lea", "V Sami"]);
  });
  it("auf ein fremdes Tauschgesuch melden darf sie sich wie jede Beschäftigte", () => {
    const m = ok(schreibe(bestand(), SUB, (m) => { m.anfragen.find((x) => x.id === "t-b").interessenten = ["s1"]; }));
    expect(m.anfragen.find((x) => x.id === "t-b").interessenten).toEqual(["s1"]);
    /* Andere eintragen: wirkungslos — die Meldungen anderer bleiben, wie sie sind. */
    const m2 = ok(schreibe(bestand(), SUB, (m) => { m.anfragen.find((x) => x.id === "t-b").interessenten = ["a1"]; }));
    expect(m2.anfragen.find((x) => x.id === "t-b").interessenten).toEqual([]);
  });
});

describe("D — Abwesenheiten", () => {
  it("6. Krankmeldung im eigenen Bereich: erlaubt, bereinigt", () => {
    const m = ok(schreibe(bestand(), SUB, (m) => {
      m.abwesenheiten.push({ id: "k1", personId: "a1", art: "krank", von: "2026-10-20", bis: "2026-10-21", notiz: "", geheim: 1 });
    }));
    expect(m.abwesenheiten.find((x) => x.id === "k1")).toEqual({ id: "k1", personId: "a1", art: "krank", von: "2026-10-20", bis: "2026-10-21", notiz: "" });
  });
  it("… im fremden Bereich: abgewiesen", () => {
    ab(schreibe(bestand(), SUB, (m) => { m.abwesenheiten.push({ id: "k2", personId: "b1", art: "krank", von: "2026-10-20", bis: "2026-10-21" }); }));
  });
  it("bestehende Einträge ändern oder löschen: abgewiesen", () => {
    ab(schreibe(bestand(), SUB, (m) => { m.abwesenheiten[0].bis = "2026-12-31"; }));
    ab(schreibe(bestand(), SUB, (m) => { m.abwesenheiten = []; }));
  });
});

describe("E — Stempeluhr und Zeiterfassung", () => {
  /* Seit 1d.1 wird einstempeln im PUT übergangen statt abgewiesen: Die
     Oberfläche zieht nach /api/stempeln eine leicht abweichende Kopie nach,
     und jeder folgende PUT bekam sonst 403. Ändern lässt sich trotzdem nichts. */
  it("7. fremdes einstempeln über PUT: wirkungslos", () => {
    const g = bestand();
    const m = ok(schreibe(g, SUB, (m) => {
      m.einstempeln = { ...(m.einstempeln || {}), "b1|2026-10-01": { ...g.mandanten[0].einstempeln["b1|2026-10-01"], innerhalbStart: false },
        "a1|2026-10-02": { start: "06:00", innerhalbStart: true, geprueftStart: true } };
    }));
    expect(m.einstempeln).toEqual(g.mandanten[0].einstempeln);
  });
  it("8. eigenes einstempeln über PUT: ebenfalls wirkungslos", () => {
    const g = bestand();
    const m = ok(schreibe(g, SUB, (m) => { m.einstempeln["s1|2026-10-02"] = { start: "06:00", ortStart: "Am Einsatzort", innerhalbStart: true }; }));
    expect(m.einstempeln).toEqual(g.mandanten[0].einstempeln);
  });
  it("9. erfassung.bestaetigt über PUT: fremd und im Bereich abgewiesen, eigen wirkungslos", () => {
    ab(schreibe(bestand(), SUB, (m) => { m.erfassung["b1|2026-10-01"] = { ...bestand().mandanten[0].erfassung["b1|2026-10-01"], bestaetigt: true }; }));
    ab(schreibe(bestand(), SUB, (m) => { m.erfassung["a1|2026-10-01"] = { start: "06:00", ende: "14:00", bestaetigt: true }; }));
    /* Seit 1d.2: die eigene Selbstauskunft läuft über POST /api/zeit-bestaetigen;
       im PUT wird eine eigene Kopie übergangen, nicht abgewiesen. */
    const g = bestand();
    expect(ok(schreibe(g, SUB, (m) => { m.erfassung["s1|2026-10-01"] = { start: "00:00", ende: "23:59", bestaetigt: true }; })).erfassung)
      .toEqual(g.mandanten[0].erfassung);
  });
});

describe("F/G/H — Nachrichten, Dienstbuch, Unterschreitungen", () => {
  it("10. fremde Nachricht ändern: abgewiesen; löschen: wirkungslos (nicht sichtbar)", () => {
    ab(schreibe(bestand(), SUB, (m) => { m.nachrichten.push({ ...gespeichert("nachrichten", "n-a"), titel: "anders" }); }));
    ab(schreibe(bestand(), SUB, (m) => { m.nachrichten.push({ ...gespeichert("nachrichten", "n-b"), gelesen: true }); }));
    const m = ok(schreibe(bestand(), SUB, (m) => { m.nachrichten = []; m.abweichungen["a1|2026-11-03"] = "F"; }));
    expect(m.nachrichten.map((n) => n.id).sort()).toEqual(["n-a", "n-b", "n-s"]);
  });
  it("Zustellstatus einer fremden Nachricht: übergangen, kein 403", () => {
    const m = ok(schreibe(bestand(), SUB, (m) => { m.nachrichten.push({ ...gespeichert("nachrichten", "n-a"), zugestellt: { mail: "ok", push: null } }); }));
    expect(m.nachrichten.find((n) => n.id === "n-a")).toEqual(gespeichert("nachrichten", "n-a"));
  });
  it("neue Mitteilung an den eigenen Bereich: erlaubt, Zustellwege nur aus dem Stand", () => {
    const m = ok(schreibe(bestand(), SUB, (m) => {
      m.nachrichten.unshift({ id: "n-neu", personId: "a1", art: "planGeaendert", titel: "x", wege: { mail: "angreifer@x.de", push: null } });
    }));
    expect(m.nachrichten[0].wege.mail).toBeNull();
    const m2 = ok(schreibe(bestand(), SUB, (m) => {
      m.nachrichten.unshift({ id: "n-neu2", personId: "a1", art: "planGeaendert", titel: "x", wege: { mail: "a@x.de", push: null } });
    }));
    expect(m2.nachrichten[0].wege.mail).toBe("a@x.de");
  });
  it("… an den fremden Bereich: abgewiesen", () => {
    ab(schreibe(bestand(), SUB, (m) => { m.nachrichten.unshift({ id: "n-x", personId: "b1", art: "info" }); }));
  });
  it("die eigene Nachricht als gelesen markieren: erlaubt", () => {
    const m = ok(schreibe(bestand(), SUB, (m) => { m.nachrichten.find((n) => n.id === "n-s").gelesen = true; }));
    expect(m.nachrichten.find((n) => n.id === "n-s").gelesen).toBe(true);
  });
  it("eine hinten gekürzte Liste löscht nichts", () => {
    const m = ok(schreibe(bestand(), SUB, (m) => { m.protokoll = m.protokoll.slice(0, 1); m.abweichungen["a1|2026-11-03"] = "F"; }));
    expect(m.protokoll.map((n) => n.id)).toEqual(["l2", "l1"]);
  });
  it("11. Dienstbuch ändern, löschen oder ergänzen: abgewiesen (kein Bereichsbezug)", () => {
    ab(schreibe(bestand(), SUB, (m) => { m.dienstbuch[0].text = "anders"; }));
    ab(schreibe(bestand(), SUB, (m) => { m.dienstbuch = []; }));
    ab(schreibe(bestand(), SUB, (m) => { m.dienstbuch.unshift({ id: "db2", datum: "2026-10-02", text: "neu" }); }));
  });
  it("Unterschreitungen: abgewiesen (kein Bereichsbezug)", () => {
    ab(schreibe(bestand(), SUB, (m) => { m.unterschreitungen = []; }));
    ab(schreibe(bestand(), SUB, (m) => { m.unterschreitungen.unshift({ id: "u2", datum: "2026-10-02", dienstId: "F", grund: "x" }); }));
  });
});

describe("I — Protokoll und Änderungen: nur anhängen", () => {
  it("12. Protokoll ändern: abgewiesen; löschen: wirkungslos (nicht sichtbar)", () => {
    ab(schreibe(bestand(), SUB, (m) => { m.protokoll = [{ ...gespeichert("protokoll", "l1"), text: "gefälscht" }]; }));
    const m = ok(schreibe(bestand(), SUB, (m) => { m.protokoll = []; m.abweichungen["a1|2026-11-03"] = "F"; }));
    expect(m.protokoll.map((l) => l.id)).toEqual(["l2", "l1"]);
  });
  it("neuer Protokolleintrag: angehängt, Zeit und Urheber vom Server", () => {
    const m = ok(schreibe(bestand(), SUB, (m) => {
      m.abweichungen["a1|2026-11-04"] = "F";
      m.protokoll.unshift({ id: "l3", zeit: "1999", text: "geplant" });
    }));
    expect(m.protokoll.map((l) => l.id)).toEqual(["l3", "l2", "l1"]);
    expect(m.protokoll[0].zeit).not.toBe("1999");
    expect(m.protokoll[0].durch).toBe("V Sami");
  });
  it("13. Änderungen ersetzen: abgewiesen", () => {
    ab(schreibe(bestand(), SUB, (m) => { m.aenderungen = [{ id: "c9", personId: "a1", datum: "2026-10-03" }]; }));
    ab(schreibe(bestand(), SUB, (m) => { m.aenderungen[0].nach = "S"; }));
  });
  it("neue Änderung nur zum eigenen Bereich", () => {
    ok(schreibe(bestand(), SUB, (m) => { m.aenderungen.unshift({ id: "c3", personId: "a1", datum: "2026-11-02", von: "-", nach: "F", vorlauf: 3 }); }));
    ab(schreibe(bestand(), SUB, (m) => { m.aenderungen.unshift({ id: "c4", personId: "b1", datum: "2026-11-02" }); }));
  });
});

describe("J — Selbstservice der Schichtverantwortung", () => {
  it("14. eigene Krankmeldung", () => {
    const m = ok(schreibe(bestand(), SUB, (m) => { m.abwesenheiten.push({ id: "ks", personId: "s1", art: "krank", von: "2026-10-20", bis: "2026-10-20" }); }));
    expect(m.abwesenheiten.find((x) => x.id === "ks")).toBeTruthy();
  });
  it("15. eigener Notruf", () => {
    const m = ok(schreibe(bestand(), SUB, (m) => {
      m.notrufe.unshift({ id: "nr-s", personId: "s1", art: "hilfe", notiz: "", empfaenger: ["l1"], bestaetigt: "schon" });
    }));
    expect(m.notrufe[0]).toMatchObject({ id: "nr-s", personId: "s1", bestaetigt: null });
  });
  it("einen an sie gerichteten Notruf bestätigen — nur das Bestätigen", () => {
    const m = ok(schreibe(bestand(), SUB, (m) => { m.notrufe.find((n) => n.id === "nr-a").bestaetigt = "irgendwann"; }));
    expect(m.notrufe.find((n) => n.id === "nr-a")).toMatchObject({ durch: "V Sami" });
    ab(schreibe(bestand(), SUB, (m) => { m.notrufe.find((n) => n.id === "nr-a").notiz = "anders"; }));
  });
  it("16. eigene Selbstplanung", () => {
    const m = ok(schreibe(bestand(), SUB, (m) => {
      m.selbstplanung[0].eintraege.push({ personId: "s1", datum: "2026-11-03", dienstId: "F" },
        { personId: "a1", datum: "2026-11-04", dienstId: "F" });
    }));
    expect(m.selbstplanung[0].eintraege).toEqual([{ personId: "s1", datum: "2026-11-03", dienstId: "F" }]);
  });
  it("17. eigene Bewerbung", () => {
    const m = ok(schreibe(bestand(), SUB, (m) => { m.ausschreibungen[0].bewerbungen.push({ personId: "s1", text: "gern" }); }));
    expect(m.ausschreibungen[0].bewerbungen).toEqual([{ personId: "s1", text: "gern" }]);
  });
  it("eigener Tauschantrag und eigene Kontaktdaten", () => {
    const m = ok(schreibe(bestand(), SUB, (m) => {
      m.anfragen.unshift({ id: "t-s", personId: "s1", typ: "tausch", status: "offen", von: "2026-11-06", bis: "2026-11-06", interessenten: [] });
      m.personen[0].telefon = "0151";
    }));
    expect(m.anfragen[0].id).toBe("t-s");
    expect(m.personen[0].telefon).toBe("0151");
  });
});

describe("L — Personenfelder", () => {
  it("18. Rollenwechsel einer fremden Person: abgewiesen", () => {
    ab(schreibe(bestand(), SUB, (m) => { m.personen[1].rolle = "planer"; }));
    ab(schreibe(bestand(), SUB, (m) => { m.personen[2].rolle = "subplaner"; }));
  });
  it("eigene Rolle, Bereich oder Qualifikation: abgewiesen", () => {
    ab(schreibe(bestand(), SUB, (m) => { m.personen[0].rolle = "leitung"; }));
    ab(schreibe(bestand(), SUB, (m) => { m.personen[0].bereich = "ALLE"; }));
    ab(schreibe(bestand(), SUB, (m) => { m.personen[0].qualifikationen = ["pfk"]; }));
  });
  it("Kontaktdaten und Bereich fremder Personen, auch im eigenen Bereich: abgewiesen", () => {
    ab(schreibe(bestand(), SUB, (m) => { m.personen[1].email = "x@y.de"; }));
    ab(schreibe(bestand(), SUB, (m) => { m.personen[1].bereich = "e2"; }));
    ab(schreibe(bestand(), SUB, (m) => { m.personen.push(person("neu", "Neu", "mitarbeiter", "e1")); }));
  });
});

describe("19./20./23. — zweite Einheit, zweiter Betrieb, Leitung und Planung", () => {
  it("19. nach allen erlaubten Schritten: zweite Einheit und zweiter Betrieb unverändert", () => {
    const g = bestand();
    const e = schreibe(g, SUB, (m) => {
      m.abweichungen["a1|2026-11-05"] = "F";
      m.anfragen.find((x) => x.id === "an-a").status = "abgelehnt";
      m.abwesenheiten.push({ id: "k5", personId: "a1", art: "krank", von: "2026-10-22", bis: "2026-10-22" });
    });
    const m = ok(e);
    expect(m.abweichungen["b1|2026-11-01"]).toBe("F");
    expect(m.anfragen.find((x) => x.id === "an-b")).toEqual(g.mandanten[0].anfragen.find((x) => x.id === "an-b"));
    expect(m.erfassung).toEqual(g.mandanten[0].erfassung);
    expect(m.einstempeln).toEqual(g.mandanten[0].einstempeln);
    expect(e.mandanten[1]).toEqual(g.mandanten[1]);
    expect(pruefeGestalt(e).ok).toBe(true);
  });
  it("20. doppelter Betrieb bleibt abgewiesen", () => {
    ab(schreibe(bestand(), SUB, (m, b) => { b.mandanten.push(JSON.parse(JSON.stringify(m))); }));
  });
  it("23. Leitung und Planung schreiben weiter alles Betriebliche", () => {
    for (const s of [LEITUNG, PLANER]) {
      const m = ok(schreibe(bestand(), s, (m) => {
        m.abweichungen["b1|2026-11-02"] = "F";
        m.dienstbuch.unshift({ id: "db9", datum: "2026-10-03", text: "x" });
        m.erfassung["b1|2026-10-01"].bestaetigt = true;
        m.anfragen.find((x) => x.id === "an-b").status = "genehmigt";
      }));
      expect(m.abweichungen["b1|2026-11-02"]).toBe("F");
      expect(m.erfassung["b1|2026-10-01"].bestaetigt).toBe(true);
    }
  });
});
