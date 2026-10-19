/* ==========================================================================
   ZEITERFASSUNG — Selbstauskunft und Stempeldatum

   Bis Oktober 2026 übernahm der Server bei Beschäftigten jeden eigenen
   Schlüssel aus `erfassung` unverändert — anlegen, ändern, löschen, auch
   Gestempeltes, für jeden Tag. Jetzt nur noch über POST /api/zeit-bestaetigen:
   neue eigene Bestätigung für einen vergangenen Tag (höchstens 14 zurück)
   mit geplantem Dienst, ohne bestehenden Eintrag, genau {start, ende,
   bestaetigt: true, grund}. Im allgemeinen Speichern (PUT) bleibt
   `erfassung` für Beschäftigte und Schichtverantwortung, wie sie ist.

   Alle Daten relativ zu heute (Europe/Berlin), damit die Prüfung morgen
   genauso läuft. Den HTTP-Weg prüft pruefungen/zeiterfassung.mjs.
   ========================================================================== */

import { describe, it, expect } from "vitest";
import { bestandFuerRolle, zusammenfuehren } from "../server/lib/rechte.mjs";
import { heuteBerlin, tagePlus, geplanterDienst, stempelDatumPruefen, selbstauskunftPruefen }
  from "../server/lib/zeiterfassung.mjs";

const HEUTE = heuteBerlin();
const tag = (n) => tagePlus(HEUTE, n);
const person = (id, rolle, einheit, extra = {}) => ({ id, vorname: "V", nachname: id, rolle, bereich: einheit,
  status: "aktiv", zugehoerigkeit: [{ ab: "2020-01-01", einheitId: einheit }], ...extra });

/* a1, a2 Beschäftigte in e1, s1 Schichtverantwortung in e1, l1 Leitung, p1 Planung.
   Geplant über Abweichungen: a1 gestern bis vor 20 Tagen Früh; s1 dito;
   N ist ein Nachtdienst. */
function bestand() {
  const abw = {};
  for (let i = 1; i <= 20; i++) { abw[`a1|${tag(-i)}`] = "F"; abw[`s1|${tag(-i)}`] = "F"; abw[`a2|${tag(-i)}`] = "F"; }
  abw[`a1|${tag(-3)}`] = "-";                  // an diesem Tag frei
  abw[`a1|${tag(-4)}`] = "N";                  // Nachtdienst
  abw[`a1|${tag(1)}`] = "F";                   // künftig geplant
  return { version: 9, stand: 1, session: null, mandanten: [{
    id: "m1", name: "Haus", einheiten: [{ id: "e1", name: "WB 1" }],
    dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00" }, { id: "N", name: "Nacht", start: "21:00", ende: "06:00" }],
    personen: [person("a1", "mitarbeiter", "e1"), person("a2", "mitarbeiter", "e1"), person("s1", "subplaner", "e1"),
      person("l1", "leitung", "ALLE"), person("p1", "planer", "ALLE")],
    abweichungen: abw, abwesenheiten: [],
    erfassung: {
      [`a1|${tag(-2)}`]: { start: "06:02", ende: "14:05", bestaetigt: true, grund: "" },          // gestempelt
      [`a2|${tag(-2)}`]: { start: null, ende: null, bestaetigt: true, grund: "" },
    },
    einstempeln: { [`a1|${tag(-2)}`]: { start: "06:02", ortStart: "Am Einsatzort", innerhalbStart: true, geprueftStart: true,
      ende: "14:05", ortEnde: "Am Einsatzort", innerhalbEnde: true, geprueftEnde: true } },
  }] };
}
const A1 = { rolle: "mitarbeiter", person: "a1", betrieb: 0 };
const S1 = { rolle: "subplaner", person: "s1", betrieb: 0 };
const L1 = { rolle: "leitung", person: "l1", betrieb: 0 };
const P1 = { rolle: "planer", person: "p1", betrieb: 0 };
const WIE_GEPLANT = { start: null, ende: null, bestaetigt: true, grund: "" };

function schreibe(g, sitz, aendern) {
  const gelesen = JSON.parse(JSON.stringify(bestandFuerRolle(g, sitz)));
  aendern(gelesen.mandanten[0]);
  return zusammenfuehren(g, gelesen, sitz);
}
const erf = (e) => { expect(e && !e.verweigert, e && e.verweigert).toBe(true); return e.mandanten[0].erfassung; };
const pruefe = (pid, datum, wert) => {
  const m = bestand().mandanten[0];
  return selbstauskunftPruefen(m, m.personen.find((p) => p.id === pid), datum, wert, HEUTE);
};

describe("Selbstauskunft: die Regeln (POST /api/zeit-bestaetigen)", () => {
  it("1. „Wie geplant\" für einen vergangenen Dienst: gültig", () => {
    expect(pruefe("a1", tag(-1), { ...WIE_GEPLANT }).eintrag).toEqual(WIE_GEPLANT);
  });
  it("2. „Abweichend\" mit Beginn, Ende und Grund: gültig", () => {
    const w = { start: "06:00", ende: "15:30", bestaetigt: true, grund: "Übergabe verlängert" };
    expect(pruefe("a1", tag(-5), w).eintrag).toEqual(w);
  });
  it("5./6./7. künftig, heute, älter als 14 Tage, ohne Dienst: ungültig — 14 Tage noch gültig", () => {
    for (const t of [tag(1), HEUTE, tag(-15), tag(-3)]) expect(pruefe("a1", t, { ...WIE_GEPLANT }).grund, t).toBeTruthy();
    expect(pruefe("a1", tag(-14), { ...WIE_GEPLANT }).eintrag).toEqual(WIE_GEPLANT);
  });
  it("11./12. Zusatzfelder, bestaetigt false: ungültig", () => {
    expect(pruefe("a1", tag(-1), { ...WIE_GEPLANT, innerhalbStart: true }).grund).toBeTruthy();
    expect(pruefe("a1", tag(-1), { ...WIE_GEPLANT, bestaetigt: false }).grund).toBeTruthy();
  });
});

describe("Beschäftigte: im PUT keine Selbstauskunft, Kopien wirkungslos", () => {
  it("eine neue eigene Bestätigung im PUT wird übergangen — sie läuft über den eigenen Endpunkt", () => {
    const e = erf(schreibe(bestand(), A1, (m) => {
      m.erfassung[`a1|${tag(-1)}`] = { ...WIE_GEPLANT };
      m.erfassung[`a1|${tag(-5)}`] = { start: "06:00", ende: "15:30", bestaetigt: true, grund: "x" };
    }));
    expect(e[`a1|${tag(-1)}`]).toBeUndefined();
    expect(e[`a1|${tag(-5)}`]).toBeUndefined();
  });
  it("3./4. nur die eigene Person — fremde Person: übergangen", () => {
    const e = erf(schreibe(bestand(), A1, (m) => { m.erfassung[`a2|${tag(-1)}`] = { ...WIE_GEPLANT }; }));
    expect(e[`a2|${tag(-1)}`]).toBeUndefined();
  });
  it("5. künftiger Tag und heute: übergangen", () => {
    const e = erf(schreibe(bestand(), A1, (m) => {
      m.erfassung[`a1|${tag(1)}`] = { ...WIE_GEPLANT }; m.erfassung[`a1|${HEUTE}`] = { ...WIE_GEPLANT };
    }));
    expect(e[`a1|${tag(1)}`]).toBeUndefined();
    expect(e[`a1|${HEUTE}`]).toBeUndefined();
  });
  it("6. älter als 14 Tage im PUT: übergangen", () => {
    const e = erf(schreibe(bestand(), A1, (m) => {
      m.erfassung[`a1|${tag(-15)}`] = { ...WIE_GEPLANT }; m.erfassung[`a1|${tag(-14)}`] = { ...WIE_GEPLANT };
    }));
    expect(e[`a1|${tag(-15)}`]).toBeUndefined();
    expect(e[`a1|${tag(-14)}`]).toBeUndefined();          // im PUT ohnehin nie neu (Regel oben)
  });
  it("7. Tag ohne Dienst: übergangen", () => {
    expect(erf(schreibe(bestand(), A1, (m) => { m.erfassung[`a1|${tag(-3)}`] = { ...WIE_GEPLANT }; }))[`a1|${tag(-3)}`])
      .toBeUndefined();
    const g = bestand(); g.mandanten[0].abwesenheiten.push({ id: "k", personId: "a1", art: "krank", von: tag(-6), bis: tag(-6) });
    expect(erf(schreibe(g, A1, (m) => { m.erfassung[`a1|${tag(-6)}`] = { ...WIE_GEPLANT }; }))[`a1|${tag(-6)}`]).toBeUndefined();
  });
  it("8./10. bestehende — auch gestempelte — Erfassung ändern: übergangen", () => {
    const g = bestand();
    const e = erf(schreibe(g, A1, (m) => {
      m.erfassung[`a1|${tag(-2)}`] = { start: "05:00", ende: "18:00", bestaetigt: true, grund: "mehr" };
    }));
    expect(e[`a1|${tag(-2)}`]).toEqual(g.mandanten[0].erfassung[`a1|${tag(-2)}`]);
  });
  it("9. bestehende Erfassung löschen: übergangen", () => {
    const g = bestand();
    const e = erf(schreibe(g, A1, (m) => { delete m.erfassung[`a1|${tag(-2)}`]; }));
    expect(e[`a1|${tag(-2)}`]).toEqual(g.mandanten[0].erfassung[`a1|${tag(-2)}`]);
    expect(erf(schreibe(g, A1, (m) => { m.erfassung = {}; }))[`a1|${tag(-2)}`]).toBeTruthy();
  });
  it("11. Zusatzfelder: der ganze Eintrag wird übergangen", () => {
    const e = erf(schreibe(bestand(), A1, (m) => {
      m.erfassung[`a1|${tag(-1)}`] = { ...WIE_GEPLANT, innerhalbStart: true, ortStart: "Am Einsatzort" };
    }));
    expect(e[`a1|${tag(-1)}`]).toBeUndefined();
  });
  it("12. bestaetigt: false oder fehlend: übergangen", () => {
    const e = erf(schreibe(bestand(), A1, (m) => {
      m.erfassung[`a1|${tag(-1)}`] = { ...WIE_GEPLANT, bestaetigt: false };
      m.erfassung[`a1|${tag(-5)}`] = { start: null, ende: null, grund: "" };
    }));
    expect(e[`a1|${tag(-1)}`]).toBeUndefined();
    expect(e[`a1|${tag(-5)}`]).toBeUndefined();
  });
  it("13. ungültige Uhrzeiten: abgewiesen", () => {
    const m = bestand().mandanten[0], p = m.personen[0];
    for (const [start, ende] of [["25:00", "14:00"], ["6:00", "14:00"], ["06:00", null], ["xx", "yy"], ["24:00", "06:00"],
      ["14:00", "06:00"], ["06:00", "06:00"]])
      expect(selbstauskunftPruefen(m, p, tag(-1), { start, ende, bestaetigt: true, grund: "" }).grund, `${start}-${ende}`).toBeTruthy();
    expect(selbstauskunftPruefen(m, p, tag(-1), { start: "06:00", ende: "14:00", bestaetigt: true, grund: "x".repeat(501) }).grund)
      .toBeTruthy();
  });
  it("Nachtdienst: Ende nach Mitternacht ist gültig", () => {
    const m = bestand().mandanten[0], p = m.personen[0];
    expect(selbstauskunftPruefen(m, p, tag(-4), { start: "21:00", ende: "06:15", bestaetigt: true, grund: "" }).eintrag)
      .toEqual({ start: "21:00", ende: "06:15", bestaetigt: true, grund: "" });
  });
  it("14. ein bestätigter Eintrag bleibt beim Neuladen und beim nächsten Speichern erhalten", () => {
    const n1 = bestand();
    n1.mandanten[0].erfassung[`a1|${tag(-1)}`] = { ...WIE_GEPLANT };       // wie vom Endpunkt geschrieben
    const wieder = bestandFuerRolle(n1, A1).mandanten[0];
    expect(wieder.erfassung[`a1|${tag(-1)}`]).toEqual(WIE_GEPLANT);
    const n2 = schreibe(n1, A1, (m) => { delete m.erfassung[`a1|${tag(-1)}`]; });
    expect(n2.mandanten[0].erfassung[`a1|${tag(-1)}`]).toEqual(WIE_GEPLANT);
  });
});

describe("Schichtverantwortung: eigene Selbstauskunft über den Endpunkt, sonst nichts", () => {
  it("15./16. eigene „Wie geplant\" und „Abweichend\": gültig nach denselben Regeln", () => {
    expect(pruefe("s1", tag(-1), { ...WIE_GEPLANT }).eintrag).toEqual(WIE_GEPLANT);
    const w = { start: "06:00", ende: "14:30", bestaetigt: true, grund: "Übergabe" };
    expect(pruefe("s1", tag(-2), w).eintrag).toEqual(w);
  });
  it("eigene Kopien im PUT — neu, ungültig oder veraltet — blockieren das Speichern nicht", () => {
    const g = bestand();
    for (const f of [(m) => { m.erfassung[`s1|${tag(-1)}`] = { ...WIE_GEPLANT }; },
      (m) => { m.erfassung[`s1|${tag(1)}`] = { start: "14:00", ende: "06:00", bestaetigt: true, grund: "" }; }]) {
      const n = schreibe(g, S1, (m) => { f(m); m.abweichungen[`a1|${tag(5)}`] = "F"; });
      expect(n.verweigert).toBeFalsy();
      expect(n.mandanten[0].erfassung).toEqual(g.mandanten[0].erfassung);
      expect(n.mandanten[0].abweichungen[`a1|${tag(5)}`]).toBe("F");
    }
  });
  it("17. fremde Erfassung: 403 — neu, geändert, auch im eigenen Bereich", () => {
    for (const f of [(m) => { m.erfassung[`a1|${tag(-1)}`] = { ...WIE_GEPLANT }; },
      (m) => { m.erfassung[`a1|${tag(-2)}`].bestaetigt = false; },
      (m) => { delete m.erfassung[`a2|${tag(-2)}`]; }])
      expect(schreibe(bestand(), S1, f).verweigert).toBeTruthy();
  });
});

describe("Stempeluhr im PUT", () => {
  it("18. Beschäftigte: einstempeln über PUT ändert nichts", () => {
    const g = bestand();
    const n = schreibe(g, A1, (m) => {
      m.einstempeln = { ...(m.einstempeln || {}), [`a1|${tag(-1)}`]: { start: "06:00", innerhalbStart: true } };
      if (m.einstempeln[`a1|${tag(-2)}`]) m.einstempeln[`a1|${tag(-2)}`].innerhalbStart = false;
    });
    expect(n.mandanten[0].einstempeln).toEqual(g.mandanten[0].einstempeln);
  });
  it("19. Schichtverantwortung: einstempeln über PUT ändert nichts", () => {
    const g = bestand();
    const n = schreibe(g, S1, (m) => { m.einstempeln[`s1|${tag(-1)}`] = { start: "06:00", innerhalbStart: true }; });
    expect(n.verweigert).toBeFalsy();
    expect(n.mandanten[0].einstempeln).toEqual(g.mandanten[0].einstempeln);
  });
  it("25./26. Abgleich nach /api/stempeln: die lokale Kopie ohne geprueftStart führt nicht zu 403", () => {
    const g = bestand();
    g.mandanten[0].einstempeln[`s1|${HEUTE}`] = { start: "06:01", ortStart: "Am Einsatzort", innerhalbStart: true, geprueftStart: true };
    for (const sitz of [S1, A1]) {
      const n = schreibe(g, sitz, (m) => {
        m.einstempeln = { ...(m.einstempeln || {}), [`s1|${HEUTE}`]: { start: "06:01", ortStart: "Am Einsatzort", innerhalbStart: true } };
      });
      expect(n.verweigert, sitz.rolle).toBeFalsy();
      expect(n.mandanten[0].einstempeln[`s1|${HEUTE}`].geprueftStart).toBe(true);
    }
  });
});

describe("16. Leitung und Planung behalten das Korrekturrecht", () => {
  it("bestehende Zeit ändern, fremde bestätigen", () => {
    for (const s of [L1, P1]) {
      const e = erf(schreibe(bestand(), s, (m) => {
        m.erfassung[`a1|${tag(-2)}`] = { start: "06:00", ende: "14:00", bestaetigt: true, grund: "korrigiert" };
        m.erfassung[`a2|${tag(-30)}`] = { start: null, ende: null, bestaetigt: true, grund: "" };
      }));
      expect(e[`a1|${tag(-2)}`].grund).toBe("korrigiert");
      expect(e[`a2|${tag(-30)}`]).toBeTruthy();
    }
  });
});

describe("/api/stempeln: Datum", () => {
  const m = () => bestand().mandanten[0];
  const p = (mm) => mm.personen[0];
  it("20. heute: erlaubt", () => { const mm = m(); expect(stempelDatumPruefen(mm, p(mm), HEUTE, "start")).toBeNull(); });
  it("21. künftig: abgewiesen", () => { const mm = m(); expect(stempelDatumPruefen(mm, p(mm), tag(1), "start")).toMatch(/künftig/); });
  it("22. gestern mit Nachtdienst: erlaubt", () => {
    const mm = m(); mm.abweichungen[`a1|${tag(-1)}`] = "N";
    expect(stempelDatumPruefen(mm, p(mm), tag(-1), "ende")).toBeNull();
  });
  it("… gestern mit offenem gestempeltem Beginn: Ausstempeln erlaubt, Einstempeln nicht", () => {
    const mm = m(); mm.einstempeln[`a1|${tag(-1)}`] = { start: "13:00", innerhalbStart: true };
    expect(stempelDatumPruefen(mm, p(mm), tag(-1), "ende")).toBeNull();
    expect(stempelDatumPruefen(mm, p(mm), tag(-1), "start")).toBeTruthy();
  });
  it("23. gestern ohne Bezug (Frühdienst): abgewiesen", () => {
    const mm = m(); expect(stempelDatumPruefen(mm, p(mm), tag(-1), "ende")).toMatch(/Mitternacht/);
  });
  it("24. älter: abgewiesen, auch mit Nachtdienst", () => {
    const mm = m(); expect(stempelDatumPruefen(mm, p(mm), tag(-4), "ende")).toMatch(/Ältere/);
  });
});

describe("Planrechnung des Servers", () => {
  it("Schichtfolge der Einheit, Teilzeit nach Wochentagen, Abweichung, Abwesenheit", () => {
    const mm = { anker: "2026-01-05", zyklus: { tage: ["F", "F", "-", "N", "N", "-", "-"] },
      einheiten: [{ id: "e1" }], einstellungen: {}, abweichungen: {}, abwesenheiten: [] };
    const p = person("x", "mitarbeiter", "e1");
    expect(geplanterDienst(mm, p, "2026-01-05")).toBe("F");
    expect(geplanterDienst(mm, p, "2026-01-07")).toBeNull();
    expect(geplanterDienst(mm, p, "2026-01-15")).toBe("N");          // 10 Tage → Index 3
    expect(geplanterDienst(mm, { ...p, teilzeit: { aktiv: true, modus: "wochentage", wochentage: [1] } }, "2026-01-05")).toBeNull();
    expect(geplanterDienst({ ...mm, abweichungen: { "x|2026-01-07": "S" } }, p, "2026-01-07")).toBe("S");
    expect(geplanterDienst({ ...mm, abwesenheiten: [{ personId: "x", von: "2026-01-05", bis: "2026-01-05" }] }, p, "2026-01-05")).toBeNull();
    expect(geplanterDienst(mm, { ...p, springer: true }, "2026-01-05")).toBeNull();
    expect(geplanterDienst(mm, { ...p, austritt: "2026-01-01" }, "2026-01-05")).toBeNull();
  });
});
