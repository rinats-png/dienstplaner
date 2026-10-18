/* ==========================================================================
   LESERECHTE — was Beschäftigte und Betriebsrat über GET /api/bestand
   von anderen Personen bekommen

   Bis Oktober 2026 filterte bestandFuerRolle nur Stammdaten und
   Abwesenheiten. Mitteilungen und Notrufe gingen vollständig hinaus — mit
   „Krankmeldung: …“ samt Anmerkung, „NOTRUF: …“, und in `wege` der
   E-Mail-Adresse und Push-Anmeldung der Empfänger. An fremden Personen
   hingen außerdem Push-Anmeldung, Zustellvorlieben und das Geheimnis des
   Kalender-Abos, mit dem sich deren Feed lesen, überschreiben und löschen
   ließ. Die Oberfläche zeigte davon nichts; die Antwort enthielt es.
   ========================================================================== */

import { describe, it, expect } from "vitest";
import { bestandFuerRolle, zusammenfuehren } from "../server/lib/rechte.mjs";

const ZUGANG = (n) => ({
  pushSchluessel: { endpoint: `https://push.example/${n}`, keys: { p256dh: `k-${n}`, auth: `a-${n}` } },
  zustellung: { planGeaendert: { mail: true, push: true } },
  kalenderGeheim: `geheim-${n}-xxxxxxxxxxxxxxxxxxxx`,
  kalenderVerweis: `https://app.example/kalender/feed/geheim-${n}.ics`,
});

const person = (id, vorname, rolle, zusatz = {}) => ({
  id, vorname, nachname: `${vorname}mann`, rolle, bereich: "e1",
  email: `${vorname.toLowerCase()}@probe.de`, anschrift: `${vorname}weg 1`,
  ...ZUGANG(vorname.toLowerCase()), ...zusatz,
});

const mitteilung = (id, personId, art, titel, mail, push) => ({
  id, personId, art, titel, text: "…", gelesen: false,
  wege: { mail, push }, zugestellt: { mail: null, push: null },
});

/* A = 0 und B = 1 sind beschäftigt, 2 ist Betriebsrat, 3 Planung, 4 Leitung. */
const bestand = () => ({
  version: 5, stand: 1,
  mandanten: [{
    id: "m1", name: "Probebetrieb",
    personen: [
      person(0, "Andrea", "mitarbeiter"),
      person(1, "Miriam", "mitarbeiter"),
      person(2, "Britta", "betriebsrat"),
      person(3, "Paula", "planer"),
      person(4, "Lea", "leitung"),
    ],
    abwesenheiten: [
      { id: "a1", personId: 1, art: "krank", von: "2026-10-12", bis: "2026-10-14",
        grund: "Bandscheibe", nachweis: "AU", notiz: "Rücken" },
      { id: "a2", personId: 0, art: "krank", von: "2026-10-20", bis: "2026-10-20",
        grund: "Zahnarzt" },
    ],
    nachrichten: [
      mitteilung("n-a", 0, "planFreigegeben", "Dienstplan Oktober freigegeben", null, null),
      mitteilung("n-b", 1, "planGeaendert", "Dienst am 13.10. geändert",
        "miriam@probe.de", { endpoint: "https://push.example/miriam" }),
      mitteilung("n-krank", 3, "planGeaendert", "Krankmeldung: Miriam Vogt",
        "paula@probe.de", { endpoint: "https://push.example/paula" }),
      mitteilung("n-notruf", 4, "einspringen", "NOTRUF: Medizinischer Notfall",
        "lea@probe.de", { endpoint: "https://push.example/lea" }),
      mitteilung("n-tausch", 1, "tauschAngebot", "Andrea übernimmt deinen Dienst",
        "miriam@probe.de", null),
      mitteilung("n-br", 2, "planFreigegeben", "Dienstplan Oktober freigegeben", null, null),
    ],
    notrufe: [
      { id: "nr-b", personId: 1, art: "medizin", notiz: "Sturz, Knie", ort: "Zi. 12",
        zeit: "2026-10-12T10:00:00Z", datum: "2026-10-12", empfaenger: [3, 4], bestaetigt: null },
      { id: "nr-a", personId: 0, art: "hilfe", notiz: "", ort: null,
        zeit: "2026-10-12T11:00:00Z", datum: "2026-10-12", empfaenger: [3], bestaetigt: null },
    ],
    anfragen: [], erfassung: {}, dienstarten: [{ id: "F", name: "Früh" }],
  }, {
    id: "m2", name: "Fremdbetrieb",
    personen: [person(9, "Fremd", "mitarbeiter")],
    abwesenheiten: [],
    nachrichten: [mitteilung("n-fremd", 9, "planGeaendert", "Fremd", "fremd@probe.de", null)],
    notrufe: [{ id: "nr-fremd", personId: 9, art: "hilfe", notiz: "fremd" }],
  }],
});

const SITZ = {
  a: { rolle: "mitarbeiter", person: 0, betrieb: 0 },
  br: { rolle: "betriebsrat", person: 2, betrieb: 0 },
  planer: { rolle: "planer", person: 3, betrieb: 0 },
  leitung: { rolle: "leitung", person: 4, betrieb: 0 },
  fremd: { rolle: "mitarbeiter", person: 9, betrieb: 1 },
};

const lies = (s) => bestandFuerRolle(bestand(), s);
const betrieb = (b) => b.mandanten[0];
const ids = (liste) => (liste || []).map((x) => x.id).sort();
const FELDER = ["pushSchluessel", "zustellung", "kalenderGeheim", "kalenderVerweis"];

describe("Beschäftigte: Mitteilungen und Notrufe", () => {
  const m = betrieb(lies(SITZ.a));

  it("1. sieht keine Mitteilung an eine Kollegin", () => {
    expect(ids(m.nachrichten)).not.toContain("n-b");
    expect(ids(m.nachrichten)).not.toContain("n-tausch");
  });
  it("2. sieht keine Krankmeldungs-Mitteilung über eine Kollegin", () => {
    expect(ids(m.nachrichten)).not.toContain("n-krank");
    expect(JSON.stringify(m.nachrichten)).not.toContain("Krankmeldung");
    expect(JSON.stringify(m.nachrichten)).not.toContain("NOTRUF");
  });
  it("3. bekommt keine fremden Zustellwege (wege.mail, wege.push)", () => {
    const text = JSON.stringify(m.nachrichten);
    for (const fremd of ["miriam@probe.de", "paula@probe.de", "lea@probe.de",
      "push.example/miriam", "push.example/paula", "push.example/lea"])
      expect(text).not.toContain(fremd);
  });
  it("4. sieht keinen Notruf einer Kollegin", () => {
    expect(ids(m.notrufe)).toEqual(["nr-a"]);
    expect(JSON.stringify(m.notrufe)).not.toContain("Sturz");
  });
  it("5. behält die eigenen Mitteilungen", () => {
    expect(ids(m.nachrichten)).toEqual(["n-a"]);
  });
});

describe("Beschäftigte: Zugangsfelder fremder Personen", () => {
  const m = betrieb(lies(SITZ.a));
  const b = m.personen.find((p) => p.id === 1);
  const a = m.personen.find((p) => p.id === 0);

  it("A bekommt kalenderGeheim, kalenderVerweis, pushSchluessel, zustellung von B nicht", () => {
    for (const f of FELDER) expect(b[f], f).toBeUndefined();
  });
  it("… auch nicht von Planung und Leitung", () => {
    for (const p of m.personen.filter((x) => x.id !== 0))
      for (const f of FELDER) expect(p[f], `${p.vorname}.${f}`).toBeUndefined();
  });
  it("A behält die eigenen Zugangsfelder (Kalender, Push, Benachrichtigungen)", () => {
    for (const f of FELDER) expect(a[f], f).toEqual(bestand().mandanten[0].personen[0][f]);
    expect(a.email).toBe("andrea@probe.de");
  });
  it("Name und Rolle der Kolleginnen bleiben — sonst ist kein Plan lesbar", () => {
    expect(b.vorname).toBe("Miriam");
    expect(b.rolle).toBe("mitarbeiter");
  });
});

describe("Betriebsrat", () => {
  const m = betrieb(lies(SITZ.br));

  it("bekommt keine fremden Mitteilungen, nur die eigenen", () => {
    expect(ids(m.nachrichten)).toEqual(["n-br"]);
  });
  it("bekommt keine Notruf-Anmerkungen", () => {
    expect(m.notrufe).toEqual([]);
    expect(JSON.stringify(m)).not.toContain("Sturz");
  });
  it("bekommt die vier Zugangsfelder fremder Personen nicht", () => {
    for (const p of m.personen.filter((x) => x.id !== 2))
      for (const f of FELDER) expect(p[f], `${p.vorname}.${f}`).toBeUndefined();
  });
  it("bekommt keine Gesundheitsangaben", () => {
    const a1 = m.abwesenheiten.find((x) => x.id === "a1");
    expect(a1.art).toBe("abwesend");
    expect(a1.grund).toBeUndefined();
    expect(JSON.stringify(m)).not.toContain("Bandscheibe");
  });
});

describe("Planung und Leitung unverändert", () => {
  for (const wer of ["planer", "leitung"]) {
    it(`${wer} sieht alle Mitteilungen, Notrufe und Zugangsfelder des Betriebs`, () => {
      const m = betrieb(lies(SITZ[wer]));
      expect(ids(m.nachrichten)).toEqual(ids(bestand().mandanten[0].nachrichten));
      expect(ids(m.notrufe)).toEqual(["nr-a", "nr-b"]);
      const b = m.personen.find((p) => p.id === 1);
      for (const f of FELDER) expect(b[f], f).toEqual(bestand().mandanten[0].personen[1][f]);
      expect(m.abwesenheiten.find((x) => x.id === "a1").grund).toBe("Bandscheibe");
    });
  }
});

describe("Mandantentrennung", () => {
  it("Beschäftigte bekommen nur den eigenen Betrieb", () => {
    const b = lies(SITZ.a);
    expect(b.mandanten.map((x) => x.id)).toEqual(["m1"]);
    expect(JSON.stringify(b)).not.toContain("Fremdbetrieb");
  });
  it("der fremde Betrieb sieht nichts aus m1", () => {
    const b = lies(SITZ.fremd);
    expect(b.mandanten.map((x) => x.id)).toEqual(["m2"]);
    expect(ids(b.mandanten[0].nachrichten)).toEqual(["n-fremd"]);
    expect(JSON.stringify(b)).not.toContain("Miriam");
  });
});

describe("Abwesenheiten: Säuberung unverändert", () => {
  it("fremde Krankheit erscheint als 'abwesend' ohne Grund und Nachweis", () => {
    const a1 = betrieb(lies(SITZ.a)).abwesenheiten.find((x) => x.id === "a1");
    expect(a1).toMatchObject({ id: "a1", personId: 1, art: "abwesend", von: "2026-10-12" });
    expect(a1.grund).toBeUndefined();
    expect(a1.nachweis).toBeUndefined();
  });
  it("die eigene Abwesenheit bleibt vollständig", () => {
    const a2 = betrieb(lies(SITZ.a)).abwesenheiten.find((x) => x.id === "a2");
    expect(a2).toMatchObject({ art: "krank", grund: "Zahnarzt" });
  });
});

describe("Schreibweg: Gefiltertes verschwindet nicht", () => {
  it("Beschäftigte schreiben den gelesenen Stand zurück — Fremdes bleibt gespeichert", () => {
    const gespeichert = bestand();
    const gelesen = bestandFuerRolle(gespeichert, SITZ.a);
    const neu = zusammenfuehren(gespeichert, JSON.parse(JSON.stringify(gelesen)), SITZ.a);
    const m = neu.mandanten[0];
    expect(ids(m.nachrichten)).toEqual(ids(gespeichert.mandanten[0].nachrichten));
    expect(ids(m.notrufe)).toEqual(ids(gespeichert.mandanten[0].notrufe));
    const b = m.personen.find((p) => p.id === 1);
    for (const f of FELDER) expect(b[f], f).toEqual(gespeichert.mandanten[0].personen[1][f]);
    expect(neu.mandanten[1]).toEqual(gespeichert.mandanten[1]);
  });
  it("die eigenen Zugangsfelder lassen sich weiter pflegen", () => {
    const gespeichert = bestand();
    const gelesen = JSON.parse(JSON.stringify(bestandFuerRolle(gespeichert, SITZ.a)));
    gelesen.mandanten[0].personen[0].zustellung = { planGeaendert: { mail: false, push: true } };
    gelesen.mandanten[0].personen[0].pushSchluessel = null;
    const neu = zusammenfuehren(gespeichert, gelesen, SITZ.a);
    const a = neu.mandanten[0].personen[0];
    expect(a.zustellung).toEqual({ planGeaendert: { mail: false, push: true } });
    expect(a.pushSchluessel).toBeNull();
  });
});
