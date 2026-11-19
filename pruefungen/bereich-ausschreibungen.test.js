/* ==========================================================================
   AUSSCHREIBUNGEN — Bereichsverantwortung (Commit C1)

   Bis Commit C1 bekam die Schichtverantwortung alle Ausschreibungen samt
   aller Bewerbungstexte des Betriebs. Anlegen, Vergeben und Zurückziehen,
   die ihre Oberfläche anbietet, verwarf der Server still — angenommen wurde
   nur die eigene Bewerbung.

   Jetzt: `einheitId` ist die verantwortende Einheit. Bei einer Ausschreibung
   der eigenen Einheit sieht und entscheidet die Schichtverantwortung alles;
   sonst (fremde Einheit, null, Altbestand) sieht sie den Kopf wie
   Beschäftigte und nur die eigene Bewerbung. Der Pool ist kein eigener
   Bereich. Über die Rechteschicht direkt (bestandFuerRolle, zusammenfuehren).
   ========================================================================== */

import { describe, it, expect } from "vitest";
import { bestandFuerRolle, zusammenfuehren } from "../server/lib/rechte.mjs";

const tag = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const T = tag(5);
const person = (id, rolle, einheit) => ({ id, vorname: `V${id}`, nachname: `N${id}`, rolle, bereich: einheit,
  zugehoerigkeit: [{ ab: "2020-01-01", einheitId: einheit }] });
const bew = (pid, as) => ({ personId: pid, zeit: "2026-10-01T08:00:00.000Z", text: `TEXT-${as}-${pid}` });
const ausschreibung = (id, einheitId, extra = {}) => ({ id, datum: T, dienstId: "F", hinweis: "", status: "offen",
  erstellt: "2026-10-01T07:00:00.000Z", durch: "Planung", ...(einheitId === undefined ? {} : { einheitId }),
  bewerbungen: [bew("a1", id), bew("b1", id), bew("p1", id)], vergebenAn: null, ...extra });
const bestand = () => ({
  version: 9, stand: 1, session: null,
  mandanten: [{
    id: "m1", name: "Haus", einheiten: [{ id: "eA" }, { id: "eB" }, { id: "ePool", pool: true }],
    dienstarten: [{ id: "F", name: "Früh" }],
    personen: [person("s1", "subplaner", "eA"), person("a1", "mitarbeiter", "eA"), person("a2", "mitarbeiter", "eA"),
      person("b1", "mitarbeiter", "eB"), person("p1", "mitarbeiter", "ePool"), person("pl", "planer", "ALLE"),
      person("l1", "leitung", "ALLE"), person("r1", "betriebsrat", "ALLE")],
    abweichungen: {}, aenderungen: [], nachrichten: [], anfragen: [],
    ausschreibungen: [ausschreibung("as-A", "eA"), ausschreibung("as-B", "eB", { bewerbungen: [bew("a1", "as-B"), bew("b1", "as-B"), bew("p1", "as-B"), bew("s1", "as-B")] }),
      ausschreibung("as-N", null), ausschreibung("as-L", undefined)],
  }],
});
const SUB = { rolle: "subplaner", person: "s1", betrieb: 0 };
const MA = { rolle: "mitarbeiter", person: "a1", betrieb: 0 };
const BR = { rolle: "betriebsrat", person: "r1", betrieb: 0 };
const PL = { rolle: "planer", person: "pl", betrieb: 0 };
const LT = { rolle: "leitung", person: "l1", betrieb: 0 };

const sicht = (s, g = bestand()) => bestandFuerRolle(g, s).mandanten[0];
const as = (m, id) => m.ausschreibungen.find((a) => a.id === id);
const bewerber = (a) => a.bewerbungen.map((b) => b.personId).sort();
function schreibe(s, aendern, g = bestand()) {
  const gelesen = JSON.parse(JSON.stringify(bestandFuerRolle(g, s)));
  aendern(gelesen.mandanten[0]);
  const e = zusammenfuehren(g, gelesen, s);
  return { g, e, m: e && e.mandanten ? e.mandanten[0] : null };
}
const roh = (id) => as(bestand().mandanten[0], id);

describe("Sicht der Schichtverantwortung", () => {
  it("alle Ausschreibungsköpfe", () => {
    const m = sicht(SUB);
    expect(m.ausschreibungen.map((a) => a.id)).toEqual(["as-A", "as-B", "as-N", "as-L"]);
    for (const id of ["as-A", "as-B", "as-N", "as-L"]) {
      const { bewerbungen: _v, ...kopf } = as(m, id); // eslint-disable-line no-unused-vars
      const { bewerbungen: _r, ...rohKopf } = roh(id); // eslint-disable-line no-unused-vars
      expect(kopf, id).toEqual(rohKopf);
    }
  });
  it("eigene Einheit: alle Bewerbungen, auch die der Pool-Person und aus B", () => {
    expect(as(sicht(SUB), "as-A").bewerbungen).toEqual(roh("as-A").bewerbungen);
  });
  it("fremde Einheit, null, Altbestand: nur die eigene Bewerbung — nicht die von Personen des eigenen Bereichs", () => {
    const m = sicht(SUB);
    expect(bewerber(as(m, "as-B"))).toEqual(["s1"]);
    expect(as(m, "as-N").bewerbungen).toEqual([]);
    expect(as(m, "as-L").bewerbungen).toEqual([]);
    const text = JSON.stringify(m.ausschreibungen.filter((a) => a.id !== "as-A"));
    for (const s of ["TEXT-as-B-a1", "TEXT-as-B-b1", "TEXT-as-B-p1", "TEXT-as-N-a1", "TEXT-as-L-p1"]) expect(text).not.toContain(s);
  });
  it("ohne eigenen Bereich: keine Ausschreibung gilt als eigene", () => {
    const g = bestand(); g.mandanten[0].personen[0] = { ...person("s1", "subplaner", "ALLE"), zugehoerigkeit: [] };
    for (const a of sicht(SUB, g).ausschreibungen) expect(bewerber(a).filter((x) => x !== "s1"), a.id).toEqual([]);
  });
});

describe("Beschäftigte, Betriebsrat, Planung, Leitung unverändert", () => {
  it("Beschäftigte: alle Köpfe, nur die eigene Bewerbung", () => {
    const m = sicht(MA);
    expect(m.ausschreibungen.map((a) => a.id)).toEqual(["as-A", "as-B", "as-N", "as-L"]);
    for (const a of m.ausschreibungen) expect(bewerber(a), a.id).toEqual(["a1"]);
  });
  it("Betriebsrat: Köpfe ohne Bewerbungen", () => {
    for (const a of sicht(BR).ausschreibungen) expect(a.bewerbungen, a.id).toEqual([]);
  });
  it("Planung und Leitung: vollständig", () => {
    for (const s of [PL, LT]) expect(sicht(s).ausschreibungen).toEqual(bestand().mandanten[0].ausschreibungen);
  });
});

describe("Schreiben der Schichtverantwortung", () => {
  it("neue Ausschreibung: verantwortende Einheit A vom Server — auch wenn der Client B schickt", () => {
    const { e, m } = schreibe(SUB, (mm) => {
      mm.ausschreibungen.unshift({ id: "as-neu", datum: T, dienstId: "F", hinweis: "bitte", status: "offen", einheitId: "eB",
        durch: "Jemand", erstellt: "1999-01-01", bewerbungen: [], vergebenAn: null });
    });
    expect(e.verweigert).toBeFalsy();
    expect(as(m, "as-neu")).toMatchObject({ einheitId: "eA", durch: "Vs1 Ns1", status: "offen", hinweis: "bitte", bewerbungen: [] });
    expect(as(m, "as-neu").erstellt).not.toBe("1999-01-01");
  });
  it("neue Ausschreibung mit Bewerbungen, schon vergeben oder unbekannter Dienstart: abgewiesen", () => {
    const neu = { id: "as-x", datum: T, dienstId: "F", status: "offen", bewerbungen: [], vergebenAn: null };
    for (const extra of [{ bewerbungen: [bew("b1", "x")] }, { status: "vergeben", vergebenAn: "a1" }, { dienstId: "GIBTS-NICHT" }])
      expect(schreibe(SUB, (mm) => { mm.ausschreibungen.unshift({ ...neu, ...extra }); }).e.verweigert, JSON.stringify(extra)).toBeTruthy();
  });
  it("eigene Ausschreibung zurückziehen: erlaubt", () => {
    const { e, m } = schreibe(SUB, (mm) => { as(mm, "as-A").status = "zurueckgezogen"; });
    expect(e.verweigert).toBeFalsy();
    expect(as(m, "as-A")).toMatchObject({ status: "zurueckgezogen" });
    expect(as(m, "as-A").bewerbungen).toEqual(roh("as-A").bewerbungen);
  });
  it("eigene Ausschreibung an eine Person des eigenen Bereichs vergeben: erlaubt (mit Planeintrag)", () => {
    const { e, m } = schreibe(SUB, (mm) => {
      Object.assign(as(mm, "as-A"), { status: "vergeben", vergebenAn: "a1", vergebenZeit: "x" });
      mm.abweichungen[`a1|${T}`] = "F";
    });
    expect(e.verweigert).toBeFalsy();
    expect(as(m, "as-A")).toMatchObject({ status: "vergeben", vergebenAn: "a1" });
    expect(m.abweichungen[`a1|${T}`]).toBe("F");
  });
  it("Vergabe an eine Person aus B oder aus dem Pool: abgewiesen (die Planungsregeln gelten weiter)", () => {
    for (const an of ["b1", "p1"]) {
      expect(schreibe(SUB, (mm) => { Object.assign(as(mm, "as-A"), { status: "vergeben", vergebenAn: an }); }).e.verweigert, an).toBeTruthy();
      expect(schreibe(SUB, (mm) => { Object.assign(as(mm, "as-A"), { status: "vergeben", vergebenAn: an }); mm.abweichungen[`${an}|${T}`] = "F"; }).e.verweigert, an).toBeTruthy();
    }
  });
  it("fremde, null- und Altbestand-Ausschreibungen: zurückziehen oder vergeben abgewiesen", () => {
    for (const id of ["as-B", "as-N", "as-L"]) {
      expect(schreibe(SUB, (mm) => { as(mm, id).status = "zurueckgezogen"; }).e.verweigert, id).toBeTruthy();
      expect(schreibe(SUB, (mm) => { Object.assign(as(mm, id), { status: "vergeben", vergebenAn: "a1" }); }).e.verweigert, id).toBeTruthy();
    }
  });
  it("übernehmen durch einheitId = A: abgewiesen (Altbestand, null, B)", () => {
    for (const id of ["as-L", "as-N", "as-B"])
      expect(schreibe(SUB, (mm) => { as(mm, id).einheitId = "eA"; }).e.verweigert, id).toBeTruthy();
  });
  it("einheitId der eigenen Ausschreibung ändern oder Tag/Dienst umschreiben: abgewiesen", () => {
    expect(schreibe(SUB, (mm) => { as(mm, "as-A").einheitId = "eB"; }).e.verweigert).toBeTruthy();
    expect(schreibe(SUB, (mm) => { as(mm, "as-A").datum = tag(9); }).e.verweigert).toBeTruthy();
  });
  it("eigene Bewerbung auf eine fremde Ausschreibung: weiterhin erlaubt, die anderen bleiben", () => {
    const { e, m } = schreibe(SUB, (mm) => { as(mm, "as-N").bewerbungen.push({ personId: "s1", zeit: "z", text: "gern" }); });
    expect(e.verweigert).toBeFalsy();
    expect(as(m, "as-N").bewerbungen).toEqual([...roh("as-N").bewerbungen, { personId: "s1", zeit: "z", text: "gern" }]);
    const z = schreibe(SUB, (mm) => { as(mm, "as-B").bewerbungen = []; });          // eigene zurückziehen
    expect(bewerber(as(z.m, "as-B"))).toEqual(["a1", "b1", "p1"]);
  });
});

describe("Rundweg und Angriffe", () => {
  it("gekürzte Sicht lesen, unverändert zurückschreiben: alle verborgenen Bewerbungen exakt gespeichert", () => {
    const { e, m } = schreibe(SUB, (mm) => { mm.abweichungen[`a1|${tag(6)}`] = "F"; });
    expect(e.verweigert).toBeFalsy();
    expect(m.ausschreibungen).toEqual(bestand().mandanten[0].ausschreibungen);
  });
  it("Bewerbung aus B löschen oder ändern (auch bei der eigenen Ausschreibung): wirkungslos", () => {
    for (const id of ["as-A", "as-B"]) {
      const weg = schreibe(SUB, (mm) => { as(mm, id).bewerbungen = as(mm, id).bewerbungen.filter((b) => b.personId !== "b1"); });
      expect(weg.e.verweigert).toBeFalsy();
      expect(as(weg.m, id).bewerbungen).toEqual(as(bestand().mandanten[0], id).bewerbungen);
      const anders = schreibe(SUB, (mm) => { as(mm, id).bewerbungen.push({ personId: "b1", text: "GEFÄLSCHT" }); });
      expect(JSON.stringify(as(anders.m, id))).not.toContain("GEFÄLSCHT");
    }
    const geaendert = schreibe(SUB, (mm) => { as(mm, "as-A").bewerbungen.find((b) => b.personId === "b1").text = "GEFÄLSCHT"; });
    expect(as(geaendert.m, "as-A").bewerbungen).toEqual(roh("as-A").bewerbungen);
  });
  it("Pool-Bewerbung auf fremder Ausschreibung einschleusen oder ändern: wirkungslos", () => {
    for (const id of ["as-B", "as-N", "as-L"]) {
      const { m } = schreibe(SUB, (mm) => { as(mm, id).bewerbungen.push({ personId: "p1", zeit: "z", text: "POOL-FAKE" }); });
      expect(as(m, id).bewerbungen, id).toEqual(roh(id).bewerbungen);
    }
  });
  it("eine verborgene Ausschreibung fehlt in der Übermittlung: bleibt gespeichert", () => {
    const { m } = schreibe(SUB, (mm) => { mm.ausschreibungen = mm.ausschreibungen.filter((a) => a.id !== "as-B"); });
    expect(as(m, "as-B")).toEqual(roh("as-B"));
  });
  it("Beschäftigte: eigene Bewerbung wie bisher, fremde Ausschreibung übernehmen wirkungslos", () => {
    const { m } = schreibe(MA, (mm) => { as(mm, "as-L").einheitId = "eA"; as(mm, "as-L").status = "zurueckgezogen"; });
    /* Die eigene Bewerbung rückt dabei ans Ende (Verhalten seit 1c, unverändert). */
    expect(as(m, "as-L").einheitId).toBeUndefined();
    expect(as(m, "as-L").status).toBe("offen");
    expect(bewerber(as(m, "as-L"))).toEqual(bewerber(roh("as-L")));
  });
});
