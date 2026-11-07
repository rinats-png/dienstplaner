/* ==========================================================================
   ART.-9-KATALOG (T-11, L-16, R-03)

   Jedes in ART9_FELDER (server/lib/sicht.mjs) markierte Feld einer FREMDEN
   Person fehlt in den Sichten von Beschäftigten, Betriebsrat, Betreiber und
   Schichtverantwortung ohne Bereichsbezug. Für den eigenen Bereich der
   Schichtverantwortung gilt nur die dokumentierte Ausnahme (Kategorie
   „krank“ ohne Anmerkung). Prüft die bestehende Sichtlogik, baut sie nicht um.
   ========================================================================== */

import { describe, it, expect } from "vitest";
import { bestandFuerRolle } from "../server/lib/rechte.mjs";
import { ART9_FELDER, ABWESENHEITSARTEN_SV } from "../server/lib/sicht.mjs";

const tagPlus = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const MARKE = (f) => `MK-ART9-${f}`;

/** Ein Wert je markiertem Feld — Texte mit Marke, damit auch Umbenennungen auffallen. */
function setzen(ziel, pfad, wert) {
  const teile = pfad.split(".");
  let o = ziel;
  for (const t of teile.slice(0, -1)) o = o[t] = o[t] && typeof o[t] === "object" ? o[t] : {};
  o[teile.at(-1)] = wert;
}
function holen(o, pfad) {
  return pfad.split(".").reduce((x, t) => (x && typeof x === "object" && Object.prototype.hasOwnProperty.call(x, t) ? x[t] : undefined), o);
}
const sensibel = () => {
  const p = {};
  for (const { feld } of ART9_FELDER.person) {
    const wert = feld === "mutterschutz" || feld === "schwerbehindert" || feld === "einschraenkungen.keineNacht" ? true
      : feld === "einschraenkungen.wiedereingliederung" ? { von: tagPlus(-5), bis: tagPlus(40), maxStundenWoche: 17, grund: MARKE(feld) }
        : feld === "mutterschutzEinwilligungen" ? [{ art: "nacht", text: MARKE(feld) }]
          : MARKE(feld);
    setzen(p, feld, wert);
  }
  return p;
};
const person = (id, rolle, einheit, extra = {}) => ({ id, vorname: `V${id}`, nachname: `N${id}`, rolle, bereich: einheit,
  status: "aktiv", zugehoerigkeit: [{ ab: "2020-01-01", einheitId: einheit }], ...extra });
const abw = (id, personId, art) => {
  const a = { id, personId, art, von: tagPlus(-2), bis: tagPlus(2) };
  for (const { feld } of ART9_FELDER.abwesenheit) a[feld] = MARKE(`abw-${feld}-${id}`);
  return a;
};
const ARTEN = ART9_FELDER.abwesenheitsarten.map((x) => x.art);
/* Masernschutz (§ 20 IfSG) als Nur-Status-Nachweis, wie branchen.mjs ihn anlegt. */
const MSG = { id: "msg", name: "Masernschutz — Status", nurStatus: true };
const masern = () => ({ qualifikationen: ["msg"],
  qualNachweise: [{ qualId: "msg", ablauf: null, vorhanden: true, datei: "MK-ART9-masern-datei", notiz: "MK-ART9-masern-notiz" }] });
/* Bekannte Lücken: als solche geprüft (der Test schlägt an, wenn sich das Verhalten ändert), nicht als „neutral“
   bestanden. Einträge in docs/legal/TECHNISCHE-FOLGEAUFGABEN.md. */
const bekannteLuecke = (kennung, text, fn) => it(`bekannteLuecke ${kennung}: ${text}`, fn);

/* x und y: fremde Personen (Einheit e2) mit allen markierten Feldern; b: im Bereich der SV (e1). */
const bestand = () => ({
  version: 9, stand: 1, session: null,
  mandanten: [{
    id: "m1", name: "Haus", einheiten: [{ id: "e1" }, { id: "e2" }],
    dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00", pause: 30 }],
    personen: [person("s1", "subplaner", "e1"), person("ma", "mitarbeiter", "e1"), person("r1", "betriebsrat", "e1"),
      person("x", "mitarbeiter", "e2", { ...sensibel(), ...masern() }), person("b", "mitarbeiter", "e1", { ...sensibel(), ...masern() }),
      person("pl", "planer", "e1"), person("l1", "leitung", "e1")],
    abwesenheiten: [...ARTEN.map((art, i) => abw(`x${i}`, "x", art)), ...ARTEN.map((art, i) => abw(`b${i}`, "b", art))],
    qualifikationen: [MSG],
    ausschreibungen: [{ id: "au1", datum: tagPlus(3), dienstId: "F", einheitId: "e2", hinweis: "MK-ART9-hinweis", bewerbungen: [] }],
    aenderungen: [{ id: "c1", personId: "x", datum: tagPlus(1), von: "-", nach: "F", zeit: "x", vorlauf: 1, grund: "MK-ART9-aend-grund" },
      { id: "c2", personId: "b", datum: tagPlus(1), von: "-", nach: "F", zeit: "x", vorlauf: 1, notiz: "MK-ART9-aend-notiz" }],
    abweichungen: {}, nachrichten: [], anfragen: [],
  }],
});

const ROLLEN = {
  Mitarbeiter: { rolle: "mitarbeiter", person: "ma", betrieb: 0 },
  Betriebsrat: { rolle: "betriebsrat", person: "r1", betrieb: 0 },
  Betreiber: { rolle: "betreiber", person: null, betrieb: 0 },
  Schichtverantwortung: { rolle: "subplaner", person: "s1", betrieb: 0 },
};
const sicht = (s) => {
  const aus = bestandFuerRolle(bestand(), s);
  return aus && Array.isArray(aus.mandanten) ? aus.mandanten[0] || {} : {};
};

describe("Katalog ART9_FELDER", () => {
  it("ist vollständig belegt und eingefroren", () => {
    expect(Object.isFrozen(ART9_FELDER)).toBe(true);
    expect(ART9_FELDER.person.length).toBeGreaterThan(0);
    for (const e of [...ART9_FELDER.person, ...ART9_FELDER.abwesenheit])
      expect(["gesundheit", "schwangerschaft", "freitext"], e.feld).toContain(e.kategorie);
    /* Die Ausnahme der SV ist eine Teilmenge der Arten, die die SV im Klartext sieht. */
    for (const a of ART9_FELDER.ausnahmeSchichtBereich) expect(ABWESENHEITSARTEN_SV).toContain(a);
  });
});

for (const [name, s] of Object.entries(ROLLEN)) {
  describe(`${name}: fremde Person ohne Art.-9-nahe Felder`, () => {
    const m = sicht(s);
    const x = (m.personen || []).find((p) => p && p.id === "x");
    it("die fremde Person ist überhaupt in der Sicht (sonst wäre die Prüfung leer)", () => {
      if (name === "Betreiber") return;                                  // Betreiber: Gerüst, Personen ggf. reduziert
      expect(x, name).toBeDefined();
      expect((m.abwesenheiten || []).filter((a) => a && a.personId === "x").length, name).toBe(ARTEN.length);
    });
    it("kein markiertes Personenfeld", () => {
      for (const { feld } of ART9_FELDER.person) expect(holen(x, feld), `${name}: ${feld}`).toBeUndefined();
    });
    it("keine Abwesenheits-Freitexte und keine verräterische Art", () => {
      for (const a of (m.abwesenheiten || []).filter((a) => a && a.personId === "x")) {
        for (const { feld } of ART9_FELDER.abwesenheit) expect(a[feld], `${name}: abwesenheit.${feld}`).toBeUndefined();
        expect(ARTEN, `${name}: art ${a.art}`).not.toContain(a.art);
      }
    });
    it("keine Marke irgendwo in der Antwort", () => {
      const text = JSON.stringify(bestandFuerRolle(bestand(), s));
      for (const { feld } of ART9_FELDER.person) expect(text, `${name}: ${feld}`).not.toContain(MARKE(feld));
      expect(text).not.toMatch(/MK-ART9-abw-[a-z]+-x/);
      expect(text, `${name}: Masern`).not.toContain("MK-ART9-masern");
      expect(text, `${name}: aenderungen`).not.toContain("MK-ART9-aend");
    });
    it("kein Masernschutz-Nachweis der fremden Person (§ 20 IfSG)", () => {
      expect(((x && x.qualNachweise) || []).some((n) => n && n.qualId === "msg"), name).toBe(false);
      expect(((x && x.qualifikationen) || []).includes("msg"), name).toBe(false);
    });
    it("Planänderungen nur mit den Standardfeldern", () => {
      for (const e of m.aenderungen || []) for (const f of ["grund", "notiz"]) expect(e[f], `${name}: aenderungen.${f}`).toBeUndefined();
    });
  });
}

describe("Schichtverantwortung, eigener Bereich: nur die dokumentierte Ausnahme", () => {
  const m = sicht(ROLLEN.Schichtverantwortung);
  const b = (m.personen || []).find((p) => p && p.id === "b");
  it("Person im Bereich: keine markierten Rohfelder (nur neutrale planungsregeln)", () => {
    expect(b && b.sichtbereich).toBe("bereich");
    for (const { feld } of ART9_FELDER.person) expect(holen(b, feld), feld).toBeUndefined();
  });
  it("Masernschutz im Bereich: nur qualId, ablauf, vorhanden (dokumentierte Ausnahme)", () => {
    const n = (b.qualNachweise || []).filter((x) => x && x.qualId === "msg");
    expect(n).toHaveLength(1);
    expect(Object.keys(n[0]).sort()).toEqual([...ART9_FELDER.ausnahmeSchichtBereichNachweis].sort());
  });
  bekannteLuecke("M2", "planungsregeln der SV verraten Mutterschutz-Kombination und Zeitraum der Wiedereingliederung", () => {
    const regeln = b.planungsregeln || [];
    const namen = regeln.map((x) => x.regel);
    /* Fachentscheid offen (Opus-Review M2): Die Kombination ist für Mutterschutz typisch, von/bis = Wiedereingliederung. */
    expect(namen).toEqual(expect.arrayContaining(["nachtNichtZulaessig", "sonntagNurMitFreigabe"]));
    const grenze = regeln.find((x) => x.regel === "stundengrenzeWoche");
    expect(grenze && { von: grenze.von, bis: grenze.bis }).toEqual({ von: tagPlus(-5), bis: tagPlus(40) });
  });
  it("Abwesenheiten im Bereich: keine Freitexte; sichtbare Art nur aus der Ausnahme", () => {
    const eigene = (m.abwesenheiten || []).filter((a) => a && a.personId === "b");
    expect(eigene.length).toBe(ARTEN.length);
    for (const a of eigene) {
      for (const { feld } of ART9_FELDER.abwesenheit) expect(a[feld], `abwesenheit.${feld}`).toBeUndefined();
      if (ARTEN.includes(a.art)) expect(ART9_FELDER.ausnahmeSchichtBereich, a.art).toContain(a.art);
    }
  });
});

describe("Planung: sieht alles (gewollt)", () => {
  const m = sicht({ rolle: "planer", person: "pl", betrieb: 0 });
  const x = (m.personen || []).find((p) => p && p.id === "x");
  it("Rohfelder, Freitexte und Nachweise der fremden Person sind da", () => {
    for (const { feld } of ART9_FELDER.person) expect(holen(x, feld), feld).toBeDefined();
    expect((x.qualNachweise || []).some((n) => n.qualId === "msg")).toBe(true);
    const a = (m.abwesenheiten || []).find((a) => a && a.personId === "x");
    expect(a.notiz).toBeDefined();
    expect(m.aenderungen.find((e) => e.id === "c1").grund).toBe("MK-ART9-aend-grund");
  });
});

describe("Betreiber: Leerlauf der Personenprüfung", () => {
  it("bekommt nur das Gerüst — keine Abwesenheiten, Ausschreibungen, Änderungen; Person ohne Fachfelder", () => {
    /* Kennzeichnung: Die Prüfungen „fremde Person“ laufen beim Betreiber ins Leere, weil er die Felder gar nicht erhält. */
    const m = sicht(ROLLEN.Betreiber);
    for (const f of ["abwesenheiten", "ausschreibungen", "aenderungen", "qualifikationen"]) expect(m[f], f).toBeUndefined();
    const x = (m.personen || []).find((p) => p && p.id === "x");
    expect(Object.keys(x || {}).every((k) => ["id", "rolle", "rolleSeit", "status", "eintritt", "austritt", "zugehoerigkeit"].includes(k))).toBe(true);
  });
});

describe("Freitext-Wege", () => {
  bekannteLuecke("N1-hinweis", "ausschreibungen[].hinweis geht als Planungs-Freitext an Beschäftigte und Betriebsrat", () => {
    /* Der Hinweis ist ein Text der Planung für alle (Ausschreibung); sein Inhalt ist nicht prüfbar. Kein Fix: Fachentscheid. */
    for (const s of [ROLLEN.Mitarbeiter, ROLLEN.Betriebsrat])
      expect((sicht(s).ausschreibungen || []).find((a) => a.id === "au1").hinweis).toBe("MK-ART9-hinweis");
  });
  it("aenderungen: Betriebsrat bekommt nur die Standardfelder (behoben, vorher VOLL)", () => {
    const e = sicht(ROLLEN.Betriebsrat).aenderungen;
    expect(e).toHaveLength(2);
    for (const x of e) expect(Object.keys(x).every((k) => ["id", "personId", "datum", "von", "nach", "zeit", "regelstand", "vorlauf"].includes(k))).toBe(true);
    expect(sicht(ROLLEN.Mitarbeiter).aenderungen ?? []).toEqual([]);
  });
});
