/* ==========================================================================
   WP-I16 Teil 1 — Betriebssteuerung: Schalter, Betriebsrat-Pause, Schreibweg

   Rot vor, grün nach der Änderung. Geprüft wird durch die echten Wege
   (zusammenfuehren, bestandFuerRolle, vollausgabeBetrieb/betriebWiederherstellen,
   bestandAnlegen-Strip) mit manipulierten Rümpfen für ALLE Rollen:
   - wer was ändern darf (Leitung: Hauptschalter, Funktionen, Frage; Betriebsrat: nur die Pause; alle anderen nie)
   - die Pause hebt nur der Betriebsrat auf; die Leitung nie
   - Wann/Wer/Protokoll setzt der Server; mitgeschickte Werte zählen nie
   - intelligenceErlaubt: fail closed, Pause sperrt jede Rolle, Prozessschalter aus sperrt alles
   - Betriebsrat-Rechte sonst unverändert (RB-Regeln: eigene Tests laufen weiter)
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { zusammenfuehren, bestandFuerRolle } from "../server/lib/rechte.mjs";
import { betriebWiederherstellen } from "../server/lib/sicherungen.mjs";
import {
  KI_FUNKTIONEN, KI_ROLLEN_AUSLOESEN, KI_GESPERRT, intelligenceErlaubt, intelligenceEntscheidung, kiSteuerungLesen,
  kiSteuerungVerwerfen, kiSteuerungProtokollZeilen, kiSteuerungSicht, KI_PROTOKOLL_GRENZE,
} from "../server/lib/ki-steuerung.mjs";
import { FUNKTIONEN_IDS } from "../server/lib/intelligence/schemas.mjs";
import { ROLLEN_ERLAUBT, FREISCHALTUNG_GESPERRT } from "../server/lib/intelligence/positivliste.mjs";
import { modusAusUmgebung } from "../server/lib/intelligence/gateway/schalter.mjs";

const AN = { prozess: "an" };
const person = (id, rolle, extra = {}) => ({ id, vorname: `V${id}`, nachname: `N${id}`, rolle, bereich: "e1", status: "aktiv",
  zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }], ...extra });
const betrieb = (extra = {}) => ({ id: "m1", name: "Haus", einheiten: [{ id: "e1", name: "WB" }],
  dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00" }],
  personen: [person("a1", "mitarbeiter"), person("s1", "subplaner"), person("r1", "betriebsrat"), person("p1", "planer"), person("l1", "leitung")],
  abweichungen: {}, einstellungen: {}, abwesenheiten: [], erfassung: {}, einstempeln: {}, anfragen: [], aenderungen: [], nachrichten: [], ...extra });
const bestand = (m = betrieb()) => ({ version: 9, stand: 1, mandanten: [m] });
const kopie = (x) => JSON.parse(JSON.stringify(x));
const SITZ = {
  leitung: { rolle: "leitung", person: "l1", betrieb: 0, mandantId: "m1" },
  planer: { rolle: "planer", person: "p1", betrieb: 0, mandantId: "m1" },
  kunde: { rolle: "kunde", person: null, betrieb: 0, mandantId: "m1" },
  subplaner: { rolle: "subplaner", person: "s1", betrieb: 0, mandantId: "m1" },
  mitarbeiter: { rolle: "mitarbeiter", person: "a1", betrieb: 0, mandantId: "m1" },
  betriebsrat: { rolle: "betriebsrat", person: "r1", betrieb: 0, mandantId: "m1" },
  betreiber: { rolle: "betreiber", person: null },
  leitungDemo: { rolle: "leitung", person: "l1", betrieb: 0, mandantId: "m1", demo: true },
  fremd: { rolle: "leitung", person: "l1", betrieb: 5, mandantId: "mX" },
};
const NEGATIV_SCHALTEN = ["planer", "kunde", "subplaner", "mitarbeiter", "betriebsrat", "betreiber", "leitungDemo"];

/** Ein Schreibversuch: Rumpf = gespeicherter Stand + Änderung am Betrieb. */
function schreibe(sitzKey, aendere, alt = bestand()) {
  const neu = kopie(alt);
  aendere(neu.mandanten[0]);
  const e = zusammenfuehren(alt, neu, SITZ[sitzKey]);
  if (!e || e.verweigert) return { abgewiesen: true, grund: e && e.verweigert, m: alt.mandanten[0], bestand: alt };
  return { abgewiesen: false, m: e.mandanten[0], bestand: e };
}
const setze = (k) => (m) => { m.einstellungen = { ...m.einstellungen, kiSteuerung: k }; };

/** Ein Betrieb, den die Leitung vorbereitet hat: Hauptschalter an, F3 an, Frage „nein“. */
function bereit(extra = {}) {
  const r = schreibe("leitung", setze({ betrieb: { an: true }, funktionen: { F3: { an: true }, F15: { an: true } }, betriebsratFrage: { antwort: "nein" } }));
  expect(r.abgewiesen, r.grund).toBe(false);
  return { ...r.bestand, mandanten: [{ ...r.m, ...extra }] };
}
const KI = (b) => b.mandanten[0].einstellungen.kiSteuerung;

describe("Verträge: Spiegel der Listen im Rechenkern", () => {
  it("Funktionsliste, Rollenliste und gesperrte Funktionen gleichen der Positivliste", () => {
    expect([...KI_FUNKTIONEN]).toEqual([...FUNKTIONEN_IDS]);
    expect([...KI_ROLLEN_AUSLOESEN]).toEqual([...ROLLEN_ERLAUBT]);
    expect({ ...KI_GESPERRT }).toEqual({ ...FREISCHALTUNG_GESPERRT });
  });
});

describe("intelligenceErlaubt: fail closed", () => {
  it("Vorgabe: ohne Steuerung, ohne Prozessschalter, mit falschen Eingaben ist alles nein", () => {
    const b = betrieb();
    for (const f of KI_FUNKTIONEN) for (const r of KI_ROLLEN_AUSLOESEN) expect(intelligenceErlaubt(b, f, r, AN), `${f} ${r}`).toBe(false);
    for (const x of [null, undefined, 1, "x", []]) expect(intelligenceErlaubt(x, "F3", "leitung", AN)).toBe(false);
    expect(intelligenceErlaubt(b, undefined, "leitung", AN)).toBe(false);
    expect(intelligenceErlaubt(b, "F3", undefined, AN)).toBe(false);
  });
  it("alles eingeschaltet: nur Leitung, Planung, Beschäftigte — und nur mit Prozessschalter genau „an“", () => {
    const b = bereit().mandanten[0];
    for (const r of KI_ROLLEN_AUSLOESEN) expect(intelligenceErlaubt(b, "F3", r, AN), r).toBe(true);
    for (const r of ["betriebsrat", "betreiber", "kunde", "subplaner", "gast", "", "__proto__"]) expect(intelligenceErlaubt(b, "F3", r, AN), r).toBe(false);
    for (const p of [undefined, null, "aus", "AN", true, 1, "an ", {}]) expect(intelligenceErlaubt(b, "F3", "leitung", { prozess: p }), String(p)).toBe(false);
    expect(intelligenceErlaubt(b, "F3", "leitung")).toBe(false);
    expect(intelligenceErlaubt(b, "F3", "leitung", null)).toBe(false);
    expect(intelligenceEntscheidung(b, "F3", "leitung").code).toBe("KI_AUS");
  });
  it("jede Funktion einzeln: nur die eingeschaltete; unbekannte, F7B, __proto__ nie; F7A bleibt gesperrt", () => {
    const b = bereit().mandanten[0];
    expect(intelligenceErlaubt(b, "F15", "leitung", AN)).toBe(true);
    expect(intelligenceErlaubt(b, "F6", "leitung", AN)).toBe(false);
    for (const f of ["F7B", "F99", "__proto__", "toString", "f3", ""]) expect(intelligenceErlaubt(b, f, "leitung", AN), f).toBe(false);
    expect(intelligenceEntscheidung(b, "F7B", "leitung", AN).code).toBe("KI_FUNKTION");
    const r = schreibe("leitung", setze({ funktionen: { F7A: { an: true } } }), bestand(betrieb()));
    expect(r.abgewiesen).toBe(true);
  });
  it("kaputte gespeicherte Werte heißen aus (Hauptschalter, Funktion, Frage) — nie an", () => {
    const gut = bereit().mandanten[0];
    const mit = (f) => { const m = kopie(gut); f(m.einstellungen.kiSteuerung); return m; };
    const faelle = [
      (k) => { k.betrieb.an = "true"; }, (k) => { k.betrieb = true; }, (k) => { delete k.betrieb; },
      (k) => { k.funktionen.F3.an = 1; }, (k) => { k.funktionen = []; }, (k) => { delete k.funktionen; },
      (k) => { k.betriebsratFrage.antwort = "vielleicht"; }, (k) => { delete k.betriebsratFrage; },
      (k) => { k.betrieb.am = {}; },
    ];
    for (const f of faelle) expect(intelligenceErlaubt(mit(f), "F3", "leitung", AN), String(f)).toBe(false);
    expect(intelligenceErlaubt(mit(() => {}), "F3", "leitung", AN)).toBe(true);
    const k = kopie(gut); k.einstellungen.kiSteuerung = "an"; expect(intelligenceErlaubt(k, "F3", "leitung", AN)).toBe(false);
    const k2 = kopie(gut); k2.einstellungen = null; expect(intelligenceErlaubt(k2, "F3", "leitung", AN)).toBe(false);
  });
  it("die Pause sperrt jede Rolle und jede Funktion; ein unlesbarer Pausenstand zählt als Pause", () => {
    const b = kopie(bereit().mandanten[0]);
    b.einstellungen.kiSteuerung.pause = { aktiv: true, am: "2026-01-01T00:00:00.000Z", vonRolle: "betriebsrat" };
    for (const f of ["F3", "F15"]) for (const r of KI_ROLLEN_AUSLOESEN) {
      expect(intelligenceErlaubt(b, f, r, AN), `${f} ${r}`).toBe(false);
      expect(intelligenceEntscheidung(b, f, r, AN).code).toBe("KI_PAUSIERT");
    }
    for (const kaputt of ["x", { aktiv: "nein" }, { aktiv: 0 }, [], null]) {
      const c = kopie(b); c.einstellungen.kiSteuerung.pause = kaputt;
      expect(intelligenceErlaubt(c, "F3", "leitung", AN), JSON.stringify(kaputt)).toBe(false);
    }
  });
  it("Antwort „ja“: gesperrt, bis der Betriebsrat die Pause aufgehoben hat; „nein“ braucht keine Pause", () => {
    const b = bereit();
    const ja = schreibe("leitung", setze({ betriebsratFrage: { antwort: "ja" } }), b);
    expect(ja.abgewiesen, ja.grund).toBe(false);
    expect(KI(ja.bestand).pause.aktiv).toBe(true);
    expect(intelligenceErlaubt(ja.m, "F3", "leitung", AN)).toBe(false);
    const auf = schreibe("betriebsrat", setze({ pause: { aktiv: false } }), ja.bestand);
    expect(auf.abgewiesen, auf.grund).toBe(false);
    expect(KI(auf.bestand).pause.aktiv).toBe(false);
    expect(intelligenceErlaubt(auf.m, "F3", "leitung", AN)).toBe(true);
    expect(intelligenceErlaubt(b.mandanten[0], "F3", "leitung", AN)).toBe(true);   // „nein“, nie eine Pause
  });
  it("Prozessschalter: nur die Umgebung genau „an“ liefert „an“ — der Aufrufer reicht es durch", () => {
    expect(modusAusUmgebung({})).toBe("aus");
    const b = bereit().mandanten[0];
    expect(intelligenceErlaubt(b, "F3", "leitung", { prozess: modusAusUmgebung({}) })).toBe(false);
    expect(intelligenceErlaubt(b, "F3", "leitung", { prozess: modusAusUmgebung({ ["CENTRIC" + "_KI_MODUS"]: "an" }) })).toBe(true);
  });
});

describe("Schreibweg: wer ändert was (zusammenfuehren, manipulierte Rümpfe)", () => {
  it("Leitung: Frage beantworten, Hauptschalter, Funktionen — Wann/Wer setzt der Server, Protokoll entsteht", () => {
    const r = schreibe("leitung", setze({ betrieb: { an: true, am: "1999-01-01", vonRolle: "betriebsrat" }, funktionen: { F3: { an: true, vonPerson: "x" } },
      betriebsratFrage: { antwort: "nein" }, protokoll: [{ art: "gefaelscht" }] }));
    expect(r.abgewiesen, r.grund).toBe(false);
    const k = r.m.einstellungen.kiSteuerung;
    expect(k.betrieb.an).toBe(true);
    expect(k.betrieb.vonRolle).toBe("leitung");
    expect(k.betrieb.vonPerson).toBe("l1");
    expect(k.betrieb.am).not.toBe("1999-01-01");
    expect(k.funktionen.F3.vonPerson).toBe("l1");
    expect(k.protokoll.map((x) => x.art)).toEqual(["betrieb-an", "frage", "funktion-an"]);
    expect(JSON.stringify(k.protokoll)).not.toMatch(/gefaelscht/);
    for (const x of k.protokoll) expect(Object.keys(x).sort()).toEqual(["am", "art", "vonPerson", "vonRolle", "wert", "ziel"]);
    expect(Object.keys(r.m.einstellungen)).toEqual(["kiSteuerung"]);
  });
  it("Hauptschalter einschalten verlangt die beantwortete Frage", () => {
    const r = schreibe("leitung", setze({ betrieb: { an: true } }));
    expect(r.abgewiesen).toBe(true);
    expect(r.grund).toMatch(/Betriebsrat/);
  });
  it("Ausschalten geht immer; Ein/Aus lässt eine Spur im Protokoll", () => {
    const b = bereit();
    const r = schreibe("leitung", setze({ betrieb: { an: false }, funktionen: { F3: { an: false } } }), b);
    expect(r.abgewiesen, r.grund).toBe(false);
    expect(KI(r.bestand).betrieb.an).toBe(false);
    expect(KI(r.bestand).funktionen.F3.an).toBe(false);
    expect(KI(r.bestand).protokoll.slice(-2).map((x) => x.art)).toEqual(["betrieb-aus", "funktion-aus"]);
    expect(intelligenceErlaubt(r.m, "F3", "leitung", AN)).toBe(false);
  });
  for (const k of NEGATIV_SCHALTEN) {
    it(`${k}: Hauptschalter, Funktion und Frage lassen sich nicht ändern`, () => {
      for (const absicht of [{ betrieb: { an: true } }, { funktionen: { F3: { an: true } } }, { betriebsratFrage: { antwort: "nein" } }]) {
        const r = schreibe(k, setze(absicht));
        if (k === "betriebsrat" || k === "betreiber" || k === "mitarbeiter" || k === "subplaner") {
          /* Diese Rollen tragen die Änderung nie in den Bestand: abgewiesen oder verworfen. */
          expect(kiSteuerungLesen(r.m.einstellungen), `${k} ${JSON.stringify(absicht)}`).toBeNull();
        } else {
          expect(r.abgewiesen, `${k} ${JSON.stringify(absicht)}`).toBe(true);
          expect(r.m.einstellungen.kiSteuerung).toBeUndefined();
        }
      }
    });
  }
  it("unbekannte Funktion, falsche Typen, Müll: abgewiesen, nichts gespeichert", () => {
    for (const absicht of [{ funktionen: { F99: { an: true } } }, { funktionen: { __proto__: { an: true }, F3: { an: "ja" } } }, { funktionen: [] },
      { betrieb: { an: "true" } }, { betrieb: 1 }, { betriebsratFrage: { antwort: "vielleicht" } }, { pause: { aktiv: "ja" } }, "an", 5, [{}]]) {
      const r = schreibe("leitung", setze(absicht));
      expect(r.abgewiesen, JSON.stringify(absicht)).toBe(true);
      expect(r.m.einstellungen.kiSteuerung).toBeUndefined();
    }
  });
  it("Fremder Betrieb: eine fremde Sitzung ändert nichts am Betrieb", () => {
    const alt = bestand();
    const neu = kopie(alt); neu.mandanten[0].einstellungen = { kiSteuerung: { betrieb: { an: true } } };
    const e = zusammenfuehren(alt, neu, SITZ.fremd);
    const m = e && !e.verweigert ? e.mandanten[0] : alt.mandanten[0];
    expect(kiSteuerungLesen(m.einstellungen)).toBeNull();
  });
  it("unveränderter Rückschreib-Rumpf ist keine Änderung (auch für Planung und Kunde)", () => {
    const b = bereit();
    for (const k of ["leitung", "planer", "kunde"]) {
      const gelesen = JSON.parse(JSON.stringify(bestandFuerRolle(b, SITZ[k])));
      const e = zusammenfuehren(b, gelesen, SITZ[k]);
      expect(e && e.verweigert, k).toBeFalsy();
      expect(e.mandanten[0].einstellungen.kiSteuerung, k).toEqual(KI(b));
    }
  });
  it("Fehlt `einstellungen` im Rumpf, bleibt die Steuerung stehen (kein stilles Löschen)", () => {
    const b = bereit();
    const r = schreibe("leitung", (m) => { delete m.einstellungen; }, b);
    expect(r.abgewiesen, r.grund).toBe(false);
    expect(r.m.einstellungen.kiSteuerung).toEqual(KI(b));
  });
  it("ein mitgeschicktes Löschen oder Verfälschen von Stempel und Protokoll ändert den Stand nicht", () => {
    const b = bereit();
    const r = schreibe("leitung", (m) => { const k = m.einstellungen.kiSteuerung; k.protokoll = []; k.betrieb.am = "2000-01-01"; k.betrieb.vonRolle = "betriebsrat"; }, b);
    expect(r.abgewiesen, r.grund).toBe(false);
    expect(r.m.einstellungen.kiSteuerung).toEqual(KI(b));
  });
  it("das Protokoll ist begrenzt", () => {
    let b = bereit();
    for (let i = 0; i < KI_PROTOKOLL_GRENZE + 10; i++) {
      const an = i % 2 === 1;
      const r = schreibe("leitung", setze({ funktionen: { F3: { an } } }), b);
      expect(r.abgewiesen, r.grund).toBe(false);
      b = r.bestand;
    }
    expect(KI(b).protokoll.length).toBe(KI_PROTOKOLL_GRENZE);
  });
});

describe("Betriebsrat-Pause", () => {
  it("der Betriebsrat setzt die Pause sofort; jede Rolle ist danach gesperrt", () => {
    const b = bereit();
    const r = schreibe("betriebsrat", setze({ pause: { aktiv: true, am: "1999", vonRolle: "leitung" } }), b);
    expect(r.abgewiesen, r.grund).toBe(false);
    const p = KI(r.bestand).pause;
    expect(p.aktiv).toBe(true);
    expect(p.vonRolle).toBe("betriebsrat");
    expect(p.vonPerson).toBe("r1");
    expect(p.am).not.toBe("1999");
    for (const f of ["F3", "F15"]) for (const rolle of ["leitung", "planer", "mitarbeiter", "betriebsrat", "betreiber", "kunde", "subplaner"])
      expect(intelligenceErlaubt(r.m, f, rolle, AN), `${f} ${rolle}`).toBe(false);
    expect(KI(r.bestand).protokoll.at(-1)).toMatchObject({ art: "pause-gesetzt", vonRolle: "betriebsrat" });
  });
  it("der Betriebsrat ändert sonst nichts: weder Hauptschalter noch Funktionen noch Frage, auch nicht zusammen mit der Pause", () => {
    const b = bereit();
    for (const absicht of [{ pause: { aktiv: true }, betrieb: { an: false } }, { pause: { aktiv: true }, funktionen: { F3: { an: false } } },
      { pause: { aktiv: true }, betriebsratFrage: { antwort: "ja" } }, { betrieb: { an: false } }, { funktionen: { F6: { an: true } } }]) {
      const r = schreibe("betriebsrat", setze(absicht), b);
      expect(r.abgewiesen, JSON.stringify(absicht)).toBe(true);
      expect(r.m.einstellungen.kiSteuerung).toEqual(KI(b));
    }
  });
  it("sonstige Änderungen im Rumpf des Betriebsrats werden nicht übernommen", () => {
    const b = bereit();
    const r = schreibe("betriebsrat", (m) => {
      m.einstellungen = { ...m.einstellungen, kiSteuerung: { pause: { aktiv: true } }, geoPruefung: true, planFreigabePflicht: true };
      m.name = "Gekapert"; m.personen = []; m.freigaben = { "2099-06": { stand: 1 } };
    }, b);
    expect(r.abgewiesen, r.grund).toBe(false);
    expect(r.m.name).toBe("Haus");
    expect(r.m.personen.length).toBe(5);
    expect(r.m.freigaben).toBeUndefined();
    expect(r.m.einstellungen.geoPruefung).toBeUndefined();
    expect(r.m.einstellungen.planFreigabePflicht).toBeUndefined();
  });
  it("ohne Änderung der Pause bleibt der Betriebsrat ohne Schreibrecht (wie bisher)", () => {
    const b = bereit();
    const gelesen = JSON.parse(JSON.stringify(bestandFuerRolle(b, SITZ.betriebsrat)));
    expect(zusammenfuehren(b, gelesen, SITZ.betriebsrat)).toBeNull();
    const ohne = kopie(b); ohne.mandanten[0].name = "x";
    expect(zusammenfuehren(b, ohne, SITZ.betriebsrat)).toBeNull();
    expect(zusammenfuehren(b, null, SITZ.betriebsrat)).toBeNull();
    expect(zusammenfuehren(b, { mandanten: [] }, SITZ.betriebsrat)).toBeNull();
  });
  it("Pause aufheben: nur der Betriebsrat — die Leitung und alle anderen nie", () => {
    const pausiert = schreibe("betriebsrat", setze({ pause: { aktiv: true } }), bereit()).bestand;
    for (const k of ["leitung", "planer", "kunde", "leitungDemo", "subplaner", "mitarbeiter", "betreiber"]) {
      const r = schreibe(k, setze({ pause: { aktiv: false } }), pausiert);
      expect(KI(r.bestand).pause.aktiv, k).toBe(true);
      if (k === "leitung" || k === "planer" || k === "kunde" || k === "leitungDemo") expect(r.abgewiesen, k).toBe(true);
      /* auch mit allem anderen zusammen: die Pause bleibt */
      const r2 = schreibe(k, setze({ pause: { aktiv: false }, betrieb: { an: true }, funktionen: { F3: { an: true } } }), pausiert);
      expect(KI(r2.bestand).pause.aktiv, k).toBe(true);
    }
    const auf = schreibe("betriebsrat", setze({ pause: { aktiv: false } }), pausiert);
    expect(auf.abgewiesen, auf.grund).toBe(false);
    expect(KI(auf.bestand).pause.aktiv).toBe(false);
    expect(KI(auf.bestand).protokoll.at(-1)).toMatchObject({ art: "pause-aufgehoben", vonRolle: "betriebsrat" });
  });
  it("die Leitung kann die Pause weder über die Frage noch durch Aus/An umgehen", () => {
    const pausiert = schreibe("betriebsrat", setze({ pause: { aktiv: true } }), bereit()).bestand;
    const r = schreibe("leitung", setze({ betriebsratFrage: { antwort: "ja" } }), pausiert);
    expect(r.abgewiesen, r.grund).toBe(false);
    expect(KI(r.bestand).pause.aktiv).toBe(true);
    const r2 = schreibe("leitung", setze({ betriebsratFrage: { antwort: "nein" } }), r.bestand);
    expect(KI(r2.bestand).pause.aktiv).toBe(true);
    const r3 = schreibe("leitung", setze({ betrieb: { an: false } }), r2.bestand);
    const r4 = schreibe("leitung", setze({ betrieb: { an: true } }), r3.bestand);
    expect(KI(r4.bestand).pause.aktiv).toBe(true);
    expect(intelligenceErlaubt(r4.m, "F3", "leitung", AN)).toBe(false);
  });
  it("ein Betriebsrat eines anderen Betriebs (Fremdsitzung) setzt keine Pause", () => {
    /* Zwei Betriebe im Raum: Der Betriebsrat von m2 erreicht m1 nicht — weder mit dem Rumpf von m1 noch dem von m2. */
    const b1 = bereit();
    const b = { ...b1, mandanten: [b1.mandanten[0], { ...betrieb({ id: "m2" }), einstellungen: {} }] };
    for (const ziel of [0, 1]) {
      const neu = kopie(b); neu.mandanten[ziel].einstellungen.kiSteuerung = { pause: { aktiv: true } };
      const e = zusammenfuehren(b, neu, { rolle: "betriebsrat", person: "r1", betrieb: 1, mandantId: "m2" });
      const m1 = e && !e.verweigert ? e.mandanten[0] : b.mandanten[0];
      expect(m1.einstellungen.kiSteuerung.pause, `Rumpf ${ziel}`).toBeUndefined();
    }
  });
  it("ein Demo-Betriebsrat setzt keine Pause", () => {
    const neu = kopie(bereit()); neu.mandanten[0].einstellungen.kiSteuerung = { pause: { aktiv: true } };
    expect(zusammenfuehren(bereit(), neu, { ...SITZ.betriebsrat, demo: true })).toBeNull();
  });
});

describe("Sicht, neuer Betrieb, Sicherung, Protokoll", () => {
  it("Sicht: Leitung, Planung, Kunde sehen alles; Betriebsrat ohne Personenkennung; Schichtverantwortung und Beschäftigte nichts", () => {
    const b = schreibe("betriebsrat", setze({ pause: { aktiv: true } }), bereit()).bestand;
    for (const k of ["leitung", "planer", "kunde"]) {
      const s = bestandFuerRolle(b, SITZ[k]).mandanten[0].einstellungen.kiSteuerung;
      expect(s, k).toBeTruthy();
      expect(s.protokoll.length, k).toBeGreaterThan(0);
      expect(s.betrieb.vonPerson, k).toBe("l1");
    }
    const br = bestandFuerRolle(b, SITZ.betriebsrat).mandanten[0].einstellungen.kiSteuerung;
    expect(br.pause.aktiv).toBe(true);
    expect(JSON.stringify(br)).not.toMatch(/vonPerson|"l1"|"r1"/);
    for (const k of ["subplaner", "mitarbeiter"]) {
      const e = bestandFuerRolle(b, SITZ[k]).mandanten[0].einstellungen;
      expect(e && e.kiSteuerung, k).toBeUndefined();
    }
  });
  it("Rückspielen der Rolle ohne Sicht verliert nichts (Beschäftigte und Schichtverantwortung)", () => {
    const b = bereit();
    for (const k of ["subplaner", "mitarbeiter"]) {
      const gelesen = JSON.parse(JSON.stringify(bestandFuerRolle(b, SITZ[k])));
      const e = zusammenfuehren(b, gelesen, SITZ[k]);
      const m = e && !e.verweigert ? e.mandanten[0] : b.mandanten[0];
      expect(m.einstellungen.kiSteuerung, k).toEqual(KI(b));
    }
  });
  it("ein neu angelegter Betrieb bringt keine Steuerung mit", () => {
    const m = { id: "n1", name: "N", einstellungen: { kiSteuerung: { betrieb: { an: true } }, geoPruefung: false } };
    expect(kiSteuerungVerwerfen(m).einstellungen).toEqual({ geoPruefung: false });
    expect(kiSteuerungVerwerfen({ id: "x" })).toEqual({ id: "x" });
    const alt = bestand();
    const neu = kopie(alt); neu.mandanten.push({ ...betrieb({ id: "m2" }), einstellungen: { kiSteuerung: { betrieb: { an: true, vonRolle: "leitung" } } } });
    const e = zusammenfuehren(alt, neu, SITZ.leitung);
    if (e && !e.verweigert) for (const x of e.mandanten) expect(kiSteuerungLesen(x.einstellungen) || null, x.id).toBeNull();
  });
  it("Wiederherstellen aus einer alten Sicherung hebt weder die Pause auf noch schaltet es etwas ein", () => {
    const alt = bereit();                                            // „Sicherung“: Stand vor der Pause
    const pausiert = schreibe("betriebsrat", setze({ pause: { aktiv: true } }), alt).bestand;
    const aus = betriebWiederherstellen(pausiert, alt, SITZ.leitung, { marke: "t1" });
    expect(aus.verweigert, aus.verweigert).toBeUndefined();
    const m = aus.bestand.mandanten[0];
    expect(m.einstellungen.kiSteuerung.pause.aktiv).toBe(true);
    expect(m.einstellungen.kiSteuerung).toEqual(KI(pausiert));
    /* und eine Sicherung ohne Steuerung schaltet nichts ab und nichts ein */
    const leer = betriebWiederherstellen(pausiert, bestand(), SITZ.leitung, { marke: "t2" });
    expect(leer.bestand.mandanten[0].einstellungen.kiSteuerung).toEqual(KI(pausiert));
  });
  it("Betriebsprotokoll: Art, Ziel, Rolle — keine Person, kein Inhalt", () => {
    const alt = bestand();
    const r = schreibe("leitung", setze({ betriebsratFrage: { antwort: "ja" }, betrieb: { an: true }, funktionen: { F3: { an: true } } }), alt);
    const zeilen = kiSteuerungProtokollZeilen(alt, r.bestand);
    expect(zeilen.length).toBe(4);
    expect(zeilen).toContain("pause-gesetzt einrichtung (leitung)");
    expect(zeilen).toContain("funktion-an F3 (leitung)");
    for (const z of zeilen) expect(z).not.toMatch(/l1|Haus|V\w+ N\w+/);
    expect(kiSteuerungProtokollZeilen(r.bestand, r.bestand)).toEqual([]);
    expect(kiSteuerungProtokollZeilen(null, null)).toEqual([]);
  });
  it("kiSteuerungSicht lässt Fremdes unberührt", () => {
    expect(kiSteuerungSicht({ geoPruefung: true }, "betriebsrat")).toEqual({ geoPruefung: true });
    expect(kiSteuerungSicht(null, "mitarbeiter")).toBeNull();
  });
});
