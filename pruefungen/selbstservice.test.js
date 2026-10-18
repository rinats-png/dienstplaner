/* ==========================================================================
   SELBSTSERVICE — Krankmeldung, Selbstplanung und Notruf von Beschäftigten

   Die Oberfläche bot alle drei an, der Server verwarf sie bis Oktober 2026
   stillschweigend: Die Felder fehlten in eigenesZusammen, die Antwort
   lautete trotzdem „ok". Jetzt kommt genau der vorgesehene Vorgang durch —
   eine neue eigene Krankmeldung, die eigenen Einträge einer offenen Runde,
   ein neuer eigener Notruf — und sonst nichts.

   Jeder Fall läuft den Weg der Anwendung: lesen (bestandFuerRolle, also
   die gekürzte Sicht), ändern, zurückschreiben (zusammenfuehren), neu lesen.
   ========================================================================== */

import { describe, it, expect } from "vitest";
import { bestandFuerRolle, zusammenfuehren } from "../server/lib/rechte.mjs";

const person = (id, vorname, rolle) => ({
  id, vorname, nachname: `${vorname}mann`, rolle, bereich: "e1", funktion: "Fachkraft",
  zugehoerigkeit: [{ ab: "2024-01-01", einheitId: "e1" }], eintritt: "2024-01-01",
  austritt: null, status: "aktiv", qualifikationen: [], wochenstunden: 38.5,
});

/* A = 0 und B = 1 beschäftigt, 2 Betriebsrat, 3 Planung, 4 Leitung, 5 Schichtleitung. */
const bestand = () => ({
  version: 9, stand: 1, session: null,
  mandanten: [{
    id: "m1", name: "Probehaus",
    personen: [person(0, "Andrea", "mitarbeiter"), person(1, "Miriam", "mitarbeiter"),
      person(2, "Britta", "betriebsrat"), person(3, "Paula", "planer"),
      person(4, "Lea", "leitung"), person(5, "Sami", "subplaner")],
    dienstarten: [{ id: "F", name: "Früh" }, { id: "S", name: "Spät" }],
    abweichungen: {},
    abwesenheiten: [
      { id: "a-b", personId: 1, art: "krank", von: "2026-10-12", bis: "2026-10-14", notiz: "Migräne" },
      { id: "a-a", personId: 0, art: "urlaub", von: "2026-12-01", bis: "2026-12-05", notiz: "genehmigt" },
    ],
    selbstplanung: [
      { id: "sp-offen", monat: "2026-11", status: "offen",
        eintraege: [{ personId: 1, datum: "2026-11-03", dienstId: "F", zeit: "t1" }] },
      { id: "sp-zu", monat: "2026-10", status: "geschlossen",
        eintraege: [{ personId: 0, datum: "2026-10-05", dienstId: "F", zeit: "t0" }] },
    ],
    notrufe: [{ id: "nr-b", personId: 1, art: "medizin", notiz: "Sturz", zeit: "2026-10-12T10:00:00Z",
      datum: "2026-10-12", empfaenger: [3], bestaetigt: null }],
    anfragen: [{ id: "an-b", personId: 1, typ: "abwesenheit", art: "urlaub", status: "offen",
      von: "2026-11-10", bis: "2026-11-12", text: "Hochzeit" },
    { id: "t-b", personId: 1, typ: "tausch", status: "offen", partnerId: null,
      von: "2026-10-30", bis: "2026-10-30", text: "Feier", interessenten: [] }],
    wuensche: [{ id: "w-b", personId: 1, datum: "2026-11-01", art: "moechte" }],
    ausschreibungen: [{ id: "as1", datum: "2026-10-25", dienstId: "F", status: "offen",
      bewerbungen: [{ personId: 1, text: "gern" }] }],
    erfassung: { "1|2026-10-01": { start: "06:00", ende: "14:00", bestaetigt: true, grund: "x" } },
    einstempeln: { "1|2026-10-01": { start: "05:58", ortStart: "Am Einsatzort (20 m)" } },
    nachrichten: [],
  }, {
    id: "m2", name: "Fremdbetrieb", personen: [person(9, "Fremd", "mitarbeiter")],
    abwesenheiten: [], selbstplanung: [], notrufe: [], dienstarten: [{ id: "F" }],
  }],
});

const SITZ = {
  a: { rolle: "mitarbeiter", person: 0, betrieb: 0 },
  b: { rolle: "mitarbeiter", person: 1, betrieb: 0 },
  br: { rolle: "betriebsrat", person: 2, betrieb: 0 },
  planer: { rolle: "planer", person: 3, betrieb: 0 },
  leitung: { rolle: "leitung", person: 4, betrieb: 0 },
  subplaner: { rolle: "subplaner", person: 5, betrieb: 0 },
};

/** Lesen → ändern → zurückschreiben, wie die Anwendung es tut. */
function schreibe(gespeichert, sitz, aendern) {
  const gelesen = JSON.parse(JSON.stringify(bestandFuerRolle(gespeichert, sitz)));
  aendern(gelesen.mandanten[0], gelesen);
  return zusammenfuehren(gespeichert, gelesen, sitz);
}
const m1 = (b) => b.mandanten[0];
const sicht = (b, s) => bestandFuerRolle(b, s).mandanten[0];
const text = (x) => JSON.stringify(x);
const ohneReihenfolge = (w) => (Array.isArray(w)
  ? w.map(ohneReihenfolge).sort((a, b) => text(a).localeCompare(text(b)))
  : w && typeof w === "object"
    ? Object.fromEntries(Object.keys(w).sort().map((k) => [k, ohneReihenfolge(w[k])])) : w);

const KRANK = { id: "a-neu", personId: 0, art: "krank", von: "2026-10-20", bis: "2026-10-21", notiz: "Fieber" };

/* --------------------------------------------------------------------------
   KRANKMELDUNG
   -------------------------------------------------------------------------- */
describe("Krankmeldung", () => {
  const nachher = schreibe(bestand(), SITZ.a, (m) => m.abwesenheiten.push({ ...KRANK }));

  it("1. die eigene Meldung wird gespeichert", () => {
    expect(m1(nachher).abwesenheiten.find((a) => a.id === "a-neu")).toEqual(KRANK);
  });
  it("2. nach dem Neuladen ist sie da", () => {
    expect(sicht(nachher, SITZ.a).abwesenheiten.find((a) => a.id === "a-neu")).toEqual(KRANK);
  });
  it("3. Planung und Leitung sehen sie vollständig", () => {
    for (const s of [SITZ.planer, SITZ.leitung, SITZ.subplaner])
      expect(sicht(nachher, s).abwesenheiten.find((a) => a.id === "a-neu")).toEqual(KRANK);
  });
  it("4./5. andere Beschäftigte und der Betriebsrat sehen nur Zeitraum und „abwesend“", () => {
    for (const s of [SITZ.b, SITZ.br]) {
      expect(sicht(nachher, s).abwesenheiten.find((a) => a.id === "a-neu"))
        .toEqual({ id: "a-neu", personId: 0, von: "2026-10-20", bis: "2026-10-21", art: "abwesend" });
      expect(text(sicht(nachher, s))).not.toContain("Fieber");
    }
  });
  it("6. eine Meldung für eine andere Person wird verworfen", () => {
    const n = schreibe(bestand(), SITZ.a, (m) => m.abwesenheiten.push({ ...KRANK, personId: 1 }));
    expect(m1(n).abwesenheiten.map((a) => a.id)).toEqual(["a-b", "a-a"]);
  });
  it("7. Urlaub und andere Arten gehen über diesen Weg nicht", () => {
    for (const art of ["urlaub", "frei", "schulung", "ausgleich", "abwesend", "KRANK", undefined]) {
      const n = schreibe(bestand(), SITZ.a, (m) => m.abwesenheiten.push({ ...KRANK, art }));
      expect(m1(n).abwesenheiten.map((a) => a.id), String(art)).toEqual(["a-b", "a-a"]);
    }
  });
  it("8. unerlaubte Felder werden entfernt, ungültige Meldungen verworfen", () => {
    const n = schreibe(bestand(), SITZ.a, (m) => m.abwesenheiten.push({ ...KRANK,
      diagnose: "J11", grund: "Grippe", nachweis: "AU", genehmigt: true, quelle: "x" }));
    expect(m1(n).abwesenheiten.find((a) => a.id === "a-neu")).toEqual(KRANK);
    for (const kaputt of [{ von: "20.10.2026" }, { bis: "2026-10-19" }, { notiz: 42 },
      { notiz: "x".repeat(2001) }, { id: "" }, { id: { x: 1 } }]) {
      const k = schreibe(bestand(), SITZ.a, (m) => m.abwesenheiten.push({ ...KRANK, ...kaputt }));
      expect(m1(k).abwesenheiten.map((a) => a.id), text(kaputt)).toEqual(["a-b", "a-a"]);
    }
    const ohne = schreibe(bestand(), SITZ.a, (m) => {
      const { notiz: _notiz, ...rest } = KRANK; m.abwesenheiten.push(rest);
    });
    expect(m1(ohne).abwesenheiten.find((a) => a.id === "a-neu")).toEqual(
      { id: "a-neu", personId: 0, art: "krank", von: "2026-10-20", bis: "2026-10-21" });
  });
  it("9. bestehende Meldungen lassen sich weder ändern noch löschen noch überschreiben", () => {
    const n = schreibe(bestand(), SITZ.a, (m) => {
      m.abwesenheiten = m.abwesenheiten.filter((a) => a.id !== "a-a")
        .map((a) => ({ ...a, bis: "2099-01-01" }));
      m.abwesenheiten.push({ ...KRANK, id: "a-b" });            // fremde Kennung
      m.abwesenheiten.push({ ...KRANK, id: "a-a" });            // eigene bestehende Kennung
    });
    expect(m1(n).abwesenheiten).toEqual(bestand().mandanten[0].abwesenheiten);
  });
  it("10. der andere Betrieb bleibt unberührt", () => {
    const n = schreibe(bestand(), SITZ.a, (m, alles) => {
      m.abwesenheiten.push({ ...KRANK });
      alles.mandanten.push({ ...bestand().mandanten[1], abwesenheiten: [{ ...KRANK, personId: 9 }] });
    });
    expect(n.mandanten[1]).toEqual(bestand().mandanten[1]);
  });
  it("zwei gleichlautende Kennungen in einer Übermittlung zählen einmal", () => {
    const n = schreibe(bestand(), SITZ.a, (m) => m.abwesenheiten.push({ ...KRANK }, { ...KRANK, von: "2026-10-22", bis: "2026-10-22" }));
    expect(m1(n).abwesenheiten.filter((a) => a.id === "a-neu")).toHaveLength(1);
  });
});

/* --------------------------------------------------------------------------
   SELBSTPLANUNG
   -------------------------------------------------------------------------- */
const runde = (b, id = "sp-offen") => m1(b).selbstplanung.find((r) => r.id === id);
const EINTRAG = { personId: 0, datum: "2026-11-04", dienstId: "S", zeit: "2026-10-18T12:00:00Z" };

describe("Selbstplanung", () => {
  const eintragen = (e, id = "sp-offen") => schreibe(bestand(), SITZ.a,
    (m) => m.selbstplanung.find((r) => r.id === id).eintraege.push(e));

  it("11. der eigene gültige Eintrag wird gespeichert", () => {
    expect(runde(eintragen({ ...EINTRAG })).eintraege).toContainEqual(EINTRAG);
  });
  it("12. nach dem Neuladen ist er da — und ein zweiter Durchgang verliert nichts", () => {
    const n = eintragen({ ...EINTRAG });
    expect(sicht(n, SITZ.a).selbstplanung.find((r) => r.id === "sp-offen").eintraege).toContainEqual(EINTRAG);
    const nochmal = schreibe(n, SITZ.a, () => {});
    expect(ohneReihenfolge(m1(nochmal))).toEqual(ohneReihenfolge(m1(n)));
  });
  it("13. ein Eintrag für eine andere Person wird verworfen", () => {
    expect(runde(eintragen({ ...EINTRAG, personId: 1, datum: "2026-11-09" })).eintraege)
      .toEqual(bestand().mandanten[0].selbstplanung[0].eintraege);
  });
  it("14. eine geschlossene Runde nimmt nichts an", () => {
    const n = eintragen({ ...EINTRAG, datum: "2026-10-06" }, "sp-zu");
    expect(runde(n, "sp-zu")).toEqual(bestand().mandanten[0].selbstplanung[1]);
    const weg = schreibe(bestand(), SITZ.a, (m) => { m.selbstplanung.find((r) => r.id === "sp-zu").eintraege = []; });
    expect(runde(weg, "sp-zu")).toEqual(bestand().mandanten[0].selbstplanung[1]);
  });
  it("15. ein Datum außerhalb des Rundenmonats wird verworfen", () => {
    for (const datum of ["2026-12-01", "2026-10-31", "04.11.2026", "2026-11"])
      expect(runde(eintragen({ ...EINTRAG, datum })).eintraege, datum)
        .toEqual(bestand().mandanten[0].selbstplanung[0].eintraege);
  });
  it("16. eine unbekannte Dienstart wird verworfen", () => {
    expect(runde(eintragen({ ...EINTRAG, dienstId: "N" })).eintraege)
      .toEqual(bestand().mandanten[0].selbstplanung[0].eintraege);
  });
  it("17. fremde Einträge bleiben, obwohl die Sicht sie ohne Person zeigt", () => {
    const n = schreibe(bestand(), SITZ.a, (m) => {
      const r = m.selbstplanung.find((x) => x.id === "sp-offen");
      expect(r.eintraege).toEqual([{ datum: "2026-11-03", dienstId: "F" }]);   // gekürzte Sicht
      r.eintraege = [{ ...EINTRAG }];                                          // fremden „entfernt“
    });
    expect(runde(n).eintraege).toEqual([
      { personId: 1, datum: "2026-11-03", dienstId: "F", zeit: "t1" }, EINTRAG]);
  });
  it("Zusatzfelder fallen weg, je Tag zählt ein Eintrag, neue Runden werden nicht angelegt", () => {
    const n = schreibe(bestand(), SITZ.a, (m) => {
      m.selbstplanung.find((r) => r.id === "sp-offen").eintraege.push(
        { ...EINTRAG, genehmigt: true, prioritaet: 1 }, { ...EINTRAG, dienstId: "F" });
      m.selbstplanung.push({ id: "sp-neu", monat: "2026-12", status: "offen", eintraege: [{ ...EINTRAG }] });
      m.selbstplanung.find((r) => r.id === "sp-offen").status = "uebernommen";
    });
    expect(runde(n).eintraege).toContainEqual(EINTRAG);
    expect(runde(n).eintraege.filter((e) => e.personId === 0)).toHaveLength(1);
    expect(runde(n).status).toBe("offen");
    expect(m1(n).selbstplanung.map((r) => r.id)).toEqual(["sp-offen", "sp-zu"]);
  });
  it("den eigenen Eintrag wieder austragen geht in der offenen Runde", () => {
    const n = eintragen({ ...EINTRAG });
    const raus = schreibe(n, SITZ.a, (m) => {
      const r = m.selbstplanung.find((x) => x.id === "sp-offen");
      r.eintraege = r.eintraege.filter((e) => e.personId !== 0);
    });
    expect(runde(raus).eintraege).toEqual(bestand().mandanten[0].selbstplanung[0].eintraege);
  });
});

/* --------------------------------------------------------------------------
   NOTRUF
   -------------------------------------------------------------------------- */
const NOTRUF = { id: "nr-neu", personId: 0, art: "hilfe", notiz: "Brauche Hilfe",
  zeit: "2026-10-18T09:00:00.000Z", datum: "2026-10-18", dienst: "Früh", ort: "WB 1",
  empfaenger: [5, 3, 4], bestaetigt: null };

describe("Notruf", () => {
  const absetzen = (n) => schreibe(bestand(), SITZ.a, (m) => { m.notrufe = [n, ...m.notrufe]; });

  it("18. der eigene gültige Notruf wird gespeichert", () => {
    expect(m1(absetzen({ ...NOTRUF })).notrufe[0]).toEqual(NOTRUF);
  });
  it("19. nach dem Neuladen ist er da", () => {
    expect(sicht(absetzen({ ...NOTRUF }), SITZ.a).notrufe).toEqual([NOTRUF]);
  });
  it("20. Planung, Leitung und Schichtverantwortung sehen ihn", () => {
    const n = absetzen({ ...NOTRUF });
    for (const s of [SITZ.planer, SITZ.leitung, SITZ.subplaner])
      expect(sicht(n, s).notrufe.map((x) => x.id)).toEqual(["nr-neu", "nr-b"]);
  });
  it("21. andere Beschäftigte und der Betriebsrat sehen ihn nicht", () => {
    const n = absetzen({ ...NOTRUF });
    expect(sicht(n, SITZ.b).notrufe.map((x) => x.id)).toEqual(["nr-b"]);
    expect(sicht(n, SITZ.br).notrufe).toEqual([]);
  });
  it("22. ein Notruf im Namen einer anderen Person wird verworfen", () => {
    expect(m1(absetzen({ ...NOTRUF, personId: 1 })).notrufe).toEqual(bestand().mandanten[0].notrufe);
  });
  it("23. nur die vorgesehenen Arten", () => {
    for (const art of ["feuer", "HILFE", "", undefined, "einspringen"])
      expect(m1(absetzen({ ...NOTRUF, art })).notrufe, String(art)).toEqual(bestand().mandanten[0].notrufe);
    for (const art of ["hilfe", "medizin", "bedrohung", "technik"])
      expect(m1(absetzen({ ...NOTRUF, art })).notrufe[0].art).toBe(art);
  });
  it("24. „bestätigt“ setzt nicht, wer den Notruf absetzt", () => {
    const n = absetzen({ ...NOTRUF, bestaetigt: "2026-10-18T09:01:00Z", durch: "Andrea" });
    expect(m1(n).notrufe[0].bestaetigt).toBeNull();
    expect(m1(n).notrufe[0].durch).toBeUndefined();
  });
  it("25. bestehende und fremde Notrufe lassen sich nicht ändern, bestätigen oder löschen", () => {
    const n = schreibe(bestand(), SITZ.b, (m) => {
      m.notrufe = m.notrufe.map((x) => ({ ...x, bestaetigt: "jetzt", notiz: "geändert" }));
    });
    expect(m1(n).notrufe).toEqual(bestand().mandanten[0].notrufe);
    const weg = schreibe(bestand(), SITZ.b, (m) => { m.notrufe = []; });
    expect(m1(weg).notrufe).toEqual(bestand().mandanten[0].notrufe);
    const kapern = absetzen({ ...NOTRUF, id: "nr-b" });
    expect(m1(kapern).notrufe).toEqual(bestand().mandanten[0].notrufe);
  });
  it("Empfänger nur aus Schichtverantwortung, Planung und Leitung dieses Betriebs; Zusatzfelder fallen weg", () => {
    const n = absetzen({ ...NOTRUF, empfaenger: [3, 1, 2, 9, "x", 4], extra: "y" });
    expect(m1(n).notrufe[0].empfaenger).toEqual([3, 4]);
    expect(m1(n).notrufe[0].extra).toBeUndefined();
  });
});

/* --------------------------------------------------------------------------
   REGRESSION
   -------------------------------------------------------------------------- */
describe("Regression", () => {
  it("26. eigener Antrag geht wie bisher, fremde Anträge bleiben", () => {
    const n = schreibe(bestand(), SITZ.a, (m) => m.anfragen.push({ id: "an-a", personId: 0,
      typ: "abwesenheit", art: "urlaub", status: "genehmigt", von: "2027-01-02", bis: "2027-01-03", text: "" }));
    expect(m1(n).anfragen.find((a) => a.id === "an-a").status).toBe("offen");
    expect(m1(n).anfragen.find((a) => a.id === "an-b").text).toBe("Hochzeit");
  });
  it("27. auf ein Tauschgesuch melden geht wie bisher", () => {
    const n = schreibe(bestand(), SITZ.a, (m) => {
      const t = m.anfragen.find((a) => a.id === "t-b"); t.interessenten = [...t.interessenten, 0];
    });
    expect(m1(n).anfragen.find((a) => a.id === "t-b").interessenten).toEqual([0]);
  });
  it("28. eigene Wünsche gehen, fremde bleiben", () => {
    const n = schreibe(bestand(), SITZ.a, (m) => m.wuensche.push({ id: "w-a", personId: 0, datum: "2026-11-02", art: "moechte" }));
    expect(m1(n).wuensche.map((w) => w.id).sort()).toEqual(["w-a", "w-b"]);
  });
  it("29. auf offene Schichten melden geht, fremde Meldungen bleiben", () => {
    const n = schreibe(bestand(), SITZ.a, (m) => m.ausschreibungen[0].bewerbungen.push({ personId: 0, text: "ich" }));
    expect(m1(n).ausschreibungen[0].bewerbungen).toEqual([{ personId: 1, text: "gern" }, { personId: 0, text: "ich" }]);
  });
  it("30. Stempelungen sind über den Bestand weiterhin nicht schreibbar", () => {
    const n = schreibe(bestand(), SITZ.a, (m) => {
      m.einstempeln = { "0|2026-10-18": { start: "06:00", ortStart: "Am Einsatzort" },
        "1|2026-10-01": { start: "09:00" } };
    });
    expect(m1(n).einstempeln).toEqual(bestand().mandanten[0].einstempeln);
  });
  it("31. Rollen, Personal und Dienstarten bleiben unberührt", () => {
    const n = schreibe(bestand(), SITZ.a, (m) => {
      m.personen.find((p) => p.id === 0).rolle = "leitung";
      m.dienstarten = [];
      m.abwesenheiten.push({ ...KRANK });
    });
    expect(m1(n).personen).toEqual(bestand().mandanten[0].personen);
    expect(m1(n).dienstarten).toEqual(bestand().mandanten[0].dienstarten);
  });
  it("32. Mandantentrennung: ein zweiter Betrieb lässt sich nicht beschreiben", () => {
    const n = schreibe(bestand(), SITZ.a, (m, alles) => {
      alles.mandanten.push({ id: "m2", personen: [], notrufe: [{ ...NOTRUF, personId: 9 }],
        selbstplanung: [], abwesenheiten: [{ ...KRANK, personId: 9 }] });
    });
    expect(n.mandanten[1]).toEqual(bestand().mandanten[1]);
  });
  it("34. die gekürzte Sicht unverändert zurückgeschrieben verliert nichts", () => {
    for (const s of [SITZ.a, SITZ.b]) {
      const n = schreibe(bestand(), s, () => {});
      expect(ohneReihenfolge(n)).toEqual(ohneReihenfolge(bestand()));
    }
  });
  it("Betriebsrat schreibt weiterhin nicht", () => {
    const g = bestand();
    expect(zusammenfuehren(g, bestandFuerRolle(g, SITZ.br), SITZ.br)).toBeNull();
  });
});
