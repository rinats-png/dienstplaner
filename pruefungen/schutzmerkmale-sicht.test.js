/* ==========================================================================
   SCHUTZMERKMALE — Einsatzregeln statt Rohdaten (Commit S1)

   Bis Commit S1 bekam die Schichtverantwortung für Personen ihres Bereichs
   und des Pools Mutterschutz, Schwerbehinderung, Geburtsdatum, das Datum
   der arbeitsmedizinischen Vorsorge und eine Wiedereingliederung roh; die
   Schutzprüfung im Browser rechnete daraus. Ohne diese Rohdaten hätte die
   Prüfung keinen Konflikt mehr gefunden.

   Jetzt leitet der Server bei jedem Lesen `planungsregeln` ab (Einsatzregeln
   ohne Grund, nie gespeichert); src/regelwerk.js wendet sie an — dieselben
   Treffer und dieselbe Härte wie schutzBefunde auf den Rohdaten, aber
   neutral. Fehlen die Regeln, sperrt die Prüfung.
   ========================================================================== */

import { describe, it, expect } from "vitest";
import { bestandFuerRolle, zusammenfuehren } from "../server/lib/rechte.mjs";
import * as RW from "../src/regelwerk.js";

const PR = await import("../server/lib/planungsregeln.mjs").catch(() => ({}));

const tagPlus = (n, ab = new Date()) => { const d = new Date(ab); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
/* 18 in 30 Tagen — relativ zu heute, damit das Sichtfenster immer passt. */
const GEB = (() => { const d = new Date(`${tagPlus(30)}T00:00:00Z`); d.setUTCFullYear(d.getUTCFullYear() - 18); return d.toISOString().slice(0, 10); })();
const VORSORGE = "2025-03-03";
const WIEDER = { von: tagPlus(-10), bis: tagPlus(40), maxStundenWoche: 17.25 };

const person = (id, rolle, einheit, extra = {}) => ({ id, vorname: `V${id}`, nachname: `N${id}`, rolle, bereich: einheit,
  zugehoerigkeit: einheit === "ALLE" ? [] : [{ ab: "2020-01-01", einheitId: einheit }], ...extra });
const bestand = () => ({
  version: 9, stand: 1, session: null,
  mandanten: [{
    id: "m1", name: "Haus", einheiten: [{ id: "e1" }, { id: "e2" }, { id: "ePool", pool: true }],
    dienstarten: [{ id: "N", name: "Nacht", start: "22:00", ende: "06:00", pause: 30 }],
    personen: [person("s1", "subplaner", "e1"),
      person("mu", "mitarbeiter", "e1", { mutterschutz: true }),
      person("sb", "mitarbeiter", "e1", { schwerbehindert: true }),
      person("ju", "mitarbeiter", "e1", { geburtstag: GEB }),
      person("vo", "mitarbeiter", "e1", { nachtvorsorge: VORSORGE }),
      person("we", "mitarbeiter", "e1", { einschraenkungen: { keineNacht: false, maxDiensteWoche: 4, wiedereingliederung: { ...WIEDER } } }),
      person("kn", "mitarbeiter", "e1", { einschraenkungen: { keineNacht: true, keinAlleindienst: true } }),
      person("oh", "mitarbeiter", "e1"),
      person("po", "mitarbeiter", "ePool", { mutterschutz: true }),
      person("fr", "mitarbeiter", "e2", { schwerbehindert: true, geburtstag: GEB }),
      person("pl", "planer", "ALLE"), person("l1", "leitung", "ALLE"), person("r1", "betriebsrat", "ALLE")],
    abweichungen: {}, aenderungen: [], nachrichten: [], anfragen: [],
  }],
});
const SUB = { rolle: "subplaner", person: "s1", betrieb: 0 };
const MA = { rolle: "mitarbeiter", person: "oh", betrieb: 0 };
const BR = { rolle: "betriebsrat", person: "r1", betrieb: 0 };
const PL = { rolle: "planer", person: "pl", betrieb: 0 };
const LT = { rolle: "leitung", person: "l1", betrieb: 0 };
const sicht = (s, g = bestand()) => bestandFuerRolle(g, s).mandanten[0];
const pers = (m, id) => m.personen.find((p) => p.id === id);
const ROH = ["mutterschutz", "schwerbehindert", "geburtstag", "geburtsdatum", "nachtvorsorge"];
const VERBOTEN = ["mutterschutz", "schwerbehindert", "nachtvorsorge", "wiedereingliederung", "geburtstag",
  "MuSchG", "JArbSchG", "SGB", "Schwerbehind", "Schwanger", "Wiedereingliederung", GEB, VORSORGE];

describe("Sicht der Schichtverantwortung", () => {
  it("keine Rohmarker — weder Merkmale noch Geburts- oder Vorsorgedatum noch Wiedereingliederung", () => {
    const text = JSON.stringify(sicht(SUB));
    for (const s of VERBOTEN) expect(text, s).not.toContain(s);
  });
  it("planungsregeln mit den erwarteten Regeln und Zeiträumen", () => {
    const m = sicht(SUB);
    const regeln = (id) => (pers(m, id).planungsregeln || []).map((r) => r.regel).sort();
    expect(regeln("mu")).toEqual(["nachtNichtZulaessig", "sonntagNurMitFreigabe"]);
    expect(regeln("sb")).toEqual(["ueber8hNurAbsprache"]);
    expect(regeln("ju")).toEqual(["hoechstens8hTag", "nachtNichtZulaessig", "wochenendePruefen"]);
    expect(pers(m, "ju").planungsregeln.every((r) => r.bis === tagPlus(29))).toBe(true);
    expect(regeln("vo")).toEqual([]);                                   // Vorsorge: keine Ableitung
    expect(pers(m, "we").planungsregeln).toEqual([{ regel: "stundengrenzeWoche", hart: false, von: WIEDER.von, bis: WIEDER.bis, wert: 17.25 }]);
    expect(pers(m, "we").einschraenkungen).toEqual({ keineNacht: false, maxDiensteWoche: 4 });
    expect(pers(m, "kn").einschraenkungen).toEqual({ keineNacht: true, keinAlleindienst: true });
    expect(regeln("oh")).toEqual([]);
    expect(regeln("po")).toEqual(["nachtNichtZulaessig", "sonntagNurMitFreigabe"]);
    expect(pers(m, "fr").planungsregeln).toBeUndefined();               // fremder Bereich: weder Roh noch Ableitung
  });
  it("Mutterschutz und Schwerbehinderung ohne erfundenen Zeitraum", () => {
    for (const r of [...pers(sicht(SUB), "mu").planungsregeln, ...pers(sicht(SUB), "sb").planungsregeln]) {
      expect(r.von).toBeUndefined();
      expect(r.bis).toBeUndefined();
    }
  });
});

describe("andere Rollen unverändert", () => {
  it("Planung und Leitung: Rohdaten unverändert, keine planungsregeln", () => {
    for (const s of [PL, LT]) {
      const m = sicht(s);
      expect(pers(m, "mu").mutterschutz).toBe(true);
      expect(pers(m, "ju").geburtstag).toBe(GEB);
      expect(pers(m, "vo").nachtvorsorge).toBe(VORSORGE);
      expect(pers(m, "we").einschraenkungen.wiedereingliederung).toEqual(WIEDER);
      expect(m.personen.some((p) => "planungsregeln" in p)).toBe(false);
    }
  });
  it("Beschäftigte und Betriebsrat: keine Rohdaten, keine planungsregeln", () => {
    for (const s of [MA, BR]) {
      const m = sicht(s);
      for (const p of m.personen) {
        for (const f of ROH) expect(p[f], `${p.id}.${f}`).toBeUndefined();
        expect(p.planungsregeln).toBeUndefined();
      }
    }
  });
});

describe("Gleichwertigkeit: Rohdaten + schutzBefunde = Ableitung + regelBefunde", () => {
  const REGEL = { "JArbSchG § 14": "nachtNichtZulaessig", "MuSchG § 5": "nachtNichtZulaessig", "JArbSchG § 8": "hoechstens8hTag",
    "JArbSchG §§ 16–17": "wochenendePruefen", "MuSchG § 6": "sonntagNurMitFreigabe", "SGB IX § 207": "ueber8hNurAbsprache" };
  const DIENSTE = {
    frueh: { start: "06:00", ende: "14:00", pause: 30 }, vor6: { start: "05:30", ende: "13:30", pause: 30 },
    spaet: { start: "14:00", ende: "22:00", pause: 30 }, nacht: { start: "22:00", ende: "06:00", pause: 30 },
    kurz: { start: "08:00", ende: "12:00", pause: 0 }, lang: { start: "07:00", ende: "19:00", pause: 45 },
  };
  /* Mi 4.11.2026, Sa 7.11., So 8.11.; 18. Geburtstag am 5.11.2026; 29.2. */
  const TAGE = ["2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08", "2026-02-27", "2026-02-28", "2026-03-01"];
  const PERSONEN = {
    mutterschutz: { mutterschutz: true }, schwerbehindert: { schwerbehindert: true },
    unter18: { geburtstag: "2008-11-05" }, schaltjahr: { geburtstag: "2008-02-29" },
    beides: { mutterschutz: true, geburtstag: "2008-11-05", schwerbehindert: true },
    wiedereingliederung: { einschraenkungen: { wiedereingliederung: { von: "2026-11-02", bis: "2026-11-06", maxStundenWoche: 20 } } },
    ohne: {},
  };
  const kurzform = (l) => l.map((b) => `${b.regel}|${b.hart}`).sort();
  it("Ableitung und Auswertung gibt es", () => {
    expect(typeof PR.planungsregelnAbleiten).toBe("function");
    expect(typeof RW.regelBefunde).toBe("function");
  });
  for (const [name, p] of Object.entries(PERSONEN)) {
    it(`${name}: dieselben Treffer und dieselbe Härte für alle Dienste und Tage`, () => {
      const abgeleitet = PR.planungsregelnAbleiten(p, {});
      for (const [dn, da] of Object.entries(DIENSTE)) for (const tag of TAGE) {
        const roh = RW.schutzBefunde(p, da, tag).map((b) => ({ regel: REGEL[b.regel] || `?${b.regel}`, hart: b.hart }));
        expect(kurzform(RW.regelBefunde(abgeleitet, da, tag)), `${name} ${dn} ${tag}`).toEqual(kurzform(roh));
      }
    });
  }
  it("Wiedereingliederung: dieselbe Wochenstundengrenze mit demselben Zeitraum", () => {
    const w = PERSONEN.wiedereingliederung.einschraenkungen.wiedereingliederung;
    expect(RW.stundengrenzeAusRegeln(PR.planungsregelnAbleiten(PERSONEN.wiedereingliederung, {}))).toEqual(w);
    expect(RW.stundengrenzeAusRegeln(PR.planungsregelnAbleiten({}, {}))).toBeNull();
  });
  it("29. Februar: minderjährig bis zum 28.2. des 18. Jahres", () => {
    expect(PR.letzterTagMinderjaehrig("2008-02-29")).toBe("2026-02-28");
    expect(PR.letzterTagMinderjaehrig("2008-11-05")).toBe("2026-11-04");
  });
});

describe("Prüfung mit der Sicht der Schichtverantwortung", () => {
  const nacht = { start: "22:00", ende: "06:00", pause: 30 };
  const pruefe = (p, da, tag) => (RW.schutzBefundeFuer || RW.schutzBefunde)(p, da, tag);
  it("eine gekürzte Sicht ohne Rohdaten verliert keinen Schutzkonflikt", () => {
    const m = sicht(SUB);
    const mu = { ...pers(m, "mu") };
    for (const f of ROH) delete mu[f];
    const b = pruefe(mu, nacht, "2026-11-04");
    expect(b.some((x) => x.hart)).toBe(true);
  });
  it("Nachtdienst der Mutterschutz-Person: hart; zulässiger Frühdienst: kein Befund", () => {
    const mu = pers(sicht(SUB), "mu");
    expect(RW.schutzBefundeFuer(mu, nacht, "2026-11-04").map((b) => [b.regel, b.hart])).toEqual([["nachtNichtZulaessig", true]]);
    expect(RW.schutzBefundeFuer(mu, { start: "06:00", ende: "14:00", pause: 30 }, "2026-11-04")).toEqual([]);
  });
  it("neutrale Texte: keine Diagnose, kein Gesetz", () => {
    const texte = JSON.stringify([RW.EINSATZREGEL_TEXTE, ...["mu", "sb", "ju", "we"].map((id) =>
      RW.schutzBefundeFuer(pers(sicht(SUB), id), { start: "22:00", ende: "10:00", pause: 30 }, "2026-11-08"))]);
    for (const s of VERBOTEN) expect(texte, s).not.toContain(s);
  });
  it("fail-closed: fehlen die planungsregeln einer Person aus Bereich oder Pool, sperrt die Prüfung", () => {
    for (const id of ["oh", "po"]) {
      const p = { ...pers(sicht(SUB), id) };
      delete p.planungsregeln;
      expect(RW.schutzBefundeFuer(p, { start: "06:00", ende: "14:00", pause: 30 }, "2026-11-04"))
        .toEqual([expect.objectContaining({ regel: "pruefungNichtMoeglich", hart: true })]);
    }
  });
  it("leere planungsregeln: geprüft, keine Regel — kein Befund", () => {
    expect(RW.schutzBefundeFuer(pers(sicht(SUB), "oh"), nacht, "2026-11-08")).toEqual([]);
  });
  it("unbekannte Regel: sperrt", () => {
    expect(RW.regelBefunde([{ regel: "neuInZukunft", hart: false }], nacht, "2026-11-04")).toEqual([expect.objectContaining({ hart: true })]);
  });
});

describe("Schreibweg und Rundweg", () => {
  function schreibe(s, aendern, g = bestand()) {
    const gelesen = JSON.parse(JSON.stringify(bestandFuerRolle(g, s)));
    aendern(gelesen.mandanten[0]);
    const e = zusammenfuehren(g, gelesen, s);
    return { g, e, m: e && e.mandanten ? e.mandanten[0] : null };
  }
  it("Rundweg: gekürzt lesen, zurückschreiben — alle Rohwerte exakt gespeichert, auch die Wiedereingliederung", () => {
    const { e, m } = schreibe(SUB, (mm) => { mm.abweichungen[`oh|${tagPlus(3)}`] = "N"; });
    expect(e.verweigert).toBeFalsy();
    expect(m.personen).toEqual(bestand().mandanten[0].personen);
  });
  it("planungsregeln setzen, ändern oder löschen: nichts gespeichert", () => {
    for (const f of [(mm) => { pers(mm, "oh").planungsregeln = [{ regel: "frei", hart: false }]; },
      (mm) => { pers(mm, "mu").planungsregeln = []; },
      (mm) => { delete pers(mm, "ju").planungsregeln; }]) {
      const { e, m } = schreibe(SUB, f);
      expect(e.verweigert).toBeFalsy();
      expect(m.personen).toEqual(bestand().mandanten[0].personen);
    }
    const p = schreibe(PL, (mm) => { pers(mm, "oh").planungsregeln = [{ regel: "x" }]; });
    expect(pers(p.m, "oh").planungsregeln).toBeUndefined();
  });
  it("Rohfeld einer Person des Bereichs setzen: abgewiesen; nicht mitgeschickt: bleibt", () => {
    expect(schreibe(SUB, (mm) => { pers(mm, "mu").mutterschutz = false; }).e.verweigert).toBeTruthy();
    expect(schreibe(SUB, (mm) => { pers(mm, "oh").schwerbehindert = true; }).e.verweigert).toBeTruthy();
    expect(schreibe(SUB, (mm) => { pers(mm, "we").einschraenkungen = { keineNacht: false, maxDiensteWoche: 4, wiedereingliederung: null }; }).e.verweigert).toBeTruthy();
    expect(schreibe(SUB, (mm) => { pers(mm, "fr").schwerbehindert = false; }).e.verweigert).toBeTruthy();
  });
});
