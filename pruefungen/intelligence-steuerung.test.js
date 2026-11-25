/* ==========================================================================
   WP-I16 — Betriebssteuerung: Schalter, Betriebsrat-Pause (Variante A), Schreibweg

   Rot vor, grün nach der Änderung. Geprüft wird durch die echten Wege
   (zusammenfuehren, bestandFuerRolle, vollausgabeBetrieb/betriebWiederherstellen,
   bestandAnlegen-Strip) mit manipulierten Rümpfen für ALLE Rollen:
   - wer was ändern darf (Leitung: Hauptschalter, Funktionen, Frage, Pause AUFHEBEN; Betriebsrat: nur die Pause SETZEN,
     und nur hinter dem Schalter CENTRIC_KI_BR_PAUSE, Vorgabe aus; alle anderen nie)
   - Betreiberentscheidung P2-8 Variante A (2026-11-25): Betriebsrat pausiert, Leitung hebt auf; jede Änderung im Protokoll
   - Rollenvergabe (roles.assign) hebelt die Pause nicht aus: Betriebsrat-Konten sind bei aktiver Pause gesperrt
   - Wann/Wer/Protokoll setzt der Server; mitgeschickte Werte zählen nie
   - intelligenceErlaubt: fail closed, Pause sperrt jede Rolle, Prozessschalter aus sperrt alles
   - Betriebsrat-Rechte sonst unverändert (RB-Regeln: eigene Tests laufen weiter)
   ========================================================================== */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { zusammenfuehren, bestandFuerRolle, rollenwechselErlaubt } from "../server/lib/rechte.mjs";
import { kiBetriebsratPauseAn } from "../server/lib/schalter.mjs";
import { betriebWiederherstellen } from "../server/lib/sicherungen.mjs";
import { auskunftBauen } from "../server/lib/auskunft.mjs";
import {
  KI_FUNKTIONEN, kiBrPauseAktiv, KI_ROLLEN_AUSLOESEN, KI_GESPERRT, intelligenceErlaubt, intelligenceEntscheidung, kiSteuerungLesen,
  kiSteuerungVerwerfen, kiSteuerungAnwenden, kiSteuerungProtokollZeilen, kiSteuerungSicht, KI_PROTOKOLL_GRENZE, betriebsratKontenZeilen,
} from "../server/lib/ki-steuerung.mjs";
import { FUNKTIONEN_IDS } from "../server/lib/intelligence/schemas.mjs";
import { ROLLEN_ERLAUBT, FREISCHALTUNG_GESPERRT } from "../server/lib/intelligence/positivliste.mjs";
import { modusAusUmgebung } from "../server/lib/intelligence/gateway/schalter.mjs";

const AN = { prozess: "an" };
/* Der Schalter für das Schreibrecht des Betriebsrats wird bei jeder Anfrage gelesen (wie die anderen Schalter). */
const SCHALTER = "CENTRIC_KI_BR_PAUSE";
let schalterVorher;
beforeAll(() => { schalterVorher = process.env[SCHALTER]; process.env[SCHALTER] = "true"; });
afterAll(() => { if (schalterVorher === undefined) delete process.env[SCHALTER]; else process.env[SCHALTER] = schalterVorher; });
function ohneSchalter(wert, fn) {
  const v = process.env[SCHALTER];
  if (wert === undefined) delete process.env[SCHALTER]; else process.env[SCHALTER] = wert;
  try { return fn(); } finally { process.env[SCHALTER] = v; }
}
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
/** Aufheben der Pause so, wie die Oberfläche es schickt: mit dem Stempel der Pause, die die Leitung gesehen hat. */
const frei = (b, extra = {}) => ({ pause: { aktiv: false, am: KI(b).pause.am, nr: KI(b).pause.nr }, ...extra });

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
  it("Antwort „ja“: gesperrt, bis die Leitung die Pause aufgehoben hat; „nein“ braucht keine Pause", () => {
    const b = bereit();
    const ja = schreibe("leitung", setze({ betriebsratFrage: { antwort: "ja" } }), b);
    expect(ja.abgewiesen, ja.grund).toBe(false);
    expect(KI(ja.bestand).pause.aktiv).toBe(true);
    expect(intelligenceErlaubt(ja.m, "F3", "leitung", AN)).toBe(false);
    const nicht = schreibe("betriebsrat", setze({ pause: { aktiv: false } }), ja.bestand);
    expect(KI(nicht.bestand).pause.aktiv).toBe(true);                 // der Betriebsrat hebt nicht auf
    const auf = schreibe("leitung", setze(frei(ja.bestand)), ja.bestand);
    expect(auf.abgewiesen, auf.grund).toBe(false);
    expect(KI(auf.bestand).pause).toMatchObject({ aktiv: false, vonRolle: "leitung", vonPerson: "l1" });
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
        /* Ohne Recht an diesem Teil zählt der gesendete Wert nicht: verworfen, der gespeicherte Stand bleibt. */
        expect(kiSteuerungLesen(r.m.einstellungen), `${k} ${JSON.stringify(absicht)}`).toBeNull();
      }
    });
  }
  it("unbekannte Funktion, falsche Typen, Müll: abgewiesen, nichts gespeichert", () => {
    for (const absicht of [{ funktionen: { F99: { an: true } } }, { funktionen: { __proto__: { an: true }, F3: { an: "ja" } } }, { funktionen: [] },
      { betrieb: { an: "true" } }, { betrieb: 1 }, { betriebsratFrage: { antwort: "vielleicht" } }, "an", 5, [{}]]) {
      const r = schreibe("leitung", setze(absicht));
      expect(r.abgewiesen, JSON.stringify(absicht)).toBe(true);
      expect(r.m.einstellungen.kiSteuerung).toBeUndefined();
    }
    /* Die Leitung hebt die Pause auf: Müll dort wird abgewiesen. Rollen ohne Pausenrecht: ohne Wirkung wie jeder Wert. */
    expect(schreibe("leitung", setze({ pause: { aktiv: "ja" } })).abgewiesen).toBe(true);
    const p = schreibe("planer", setze({ pause: { aktiv: "ja" } }));
    expect(p.abgewiesen).toBe(false);
    expect(kiSteuerungLesen(p.m.einstellungen)).toBeNull();
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
  it("der Betriebsrat ändert sonst nichts: mit der Pause mitgeschickte Schalter und Frage werden ignoriert; ohne Pausenänderung 403", () => {
    const b = bereit();
    for (const absicht of [{ pause: { aktiv: true }, betrieb: { an: false } }, { pause: { aktiv: true }, funktionen: { F3: { an: false } } },
      { pause: { aktiv: true }, betriebsratFrage: { antwort: "ja" } }]) {
      const r = schreibe("betriebsrat", setze(absicht), b);
      expect(r.abgewiesen, JSON.stringify(absicht)).toBe(false);
      const k = r.m.einstellungen.kiSteuerung;
      expect(k.pause.aktiv).toBe(true);
      expect(k.betrieb).toEqual(KI(b).betrieb);
      expect(k.funktionen).toEqual(KI(b).funktionen);
      expect(k.betriebsratFrage).toEqual(KI(b).betriebsratFrage);
      expect(k.protokoll.length).toBe(KI(b).protokoll.length + 1);
    }
    for (const absicht of [{ betrieb: { an: false } }, { funktionen: { F6: { an: true } } }]) {
      const r = schreibe("betriebsrat", setze(absicht), b);
      expect(r.abgewiesen, JSON.stringify(absicht)).toBe(true);
      expect(r.m.einstellungen.kiSteuerung).toEqual(KI(b));
    }
  });
  it("veraltete Kopie: Planung speichert mit altem Schalterstand etwas anderes — kein 403, der Schalter bleibt, wie er gespeichert ist", () => {
    const b = bereit();
    const alt = kopie(b);
    const aus = schreibe("leitung", setze({ funktionen: { F3: { an: false } } }), b);
    const neu = kopie(alt); neu.mandanten[0].name = "Anderer Name";
    const e = zusammenfuehren(aus.bestand, neu, SITZ.planer);
    expect(e && e.verweigert, e && e.verweigert).toBeFalsy();
    expect(e.mandanten[0].name).toBe("Anderer Name");
    expect(e.mandanten[0].einstellungen.kiSteuerung.funktionen.F3.an).toBe(false);
  });
  it("veraltete Kopie: die Pause des Betriebsrats gelingt trotz anderer veralteter Felder", () => {
    const alt = bereit();
    const stale = kopie(alt);
    const gestellt = schreibe("leitung", setze({ funktionen: { F3: { an: false } }, betrieb: { an: false } }), alt).bestand;
    stale.mandanten[0].einstellungen.kiSteuerung.pause = { aktiv: true };
    const e = zusammenfuehren(gestellt, stale, SITZ.betriebsrat);
    expect(e && e.verweigert, e && e.verweigert).toBeFalsy();
    const k = e.mandanten[0].einstellungen.kiSteuerung;
    expect(k.pause.aktiv).toBe(true);
    expect(k.betrieb.an).toBe(false);
    expect(k.funktionen.F3.an).toBe(false);
  });
  it("veraltete Kopie: Leitung mit aufgehobener Pause speichert, nachdem der Betriebsrat erneut pausiert hat — kein 403, Pause bleibt", () => {
    const b0 = bereit();
    const gesetzt = schreibe("betriebsrat", setze({ pause: { aktiv: true } }), b0).bestand;
    const aufgehoben = schreibe("leitung", setze(frei(gesetzt)), gesetzt).bestand;
    const kopieLeitung = kopie(aufgehoben);
    const wieder = schreibe("betriebsrat", setze({ pause: { aktiv: true } }), aufgehoben).bestand;
    kopieLeitung.mandanten[0].einstellungen.kiSteuerung.funktionen.F15 = { an: false };
    const e = zusammenfuehren(wieder, kopieLeitung, SITZ.leitung);
    expect(e && e.verweigert, e && e.verweigert).toBeFalsy();
    const k = e.mandanten[0].einstellungen.kiSteuerung;
    expect(k.pause.aktiv).toBe(true);
    expect(k.funktionen.F15.an).toBe(false);
  });
  it("gleicher Zeitstempel (feste Uhr): Aufheben und erneutes Pausieren in derselben Millisekunde — die veraltete Kopie hebt die neue Pause nie auf", () => {
    const T0 = "2026-11-25T10:00:00.000Z";
    const LEIT = SITZ.leitung; const BR = SITZ.betriebsrat;
    const lesen = (st) => kiSteuerungLesen({ kiSteuerung: st.stand ? { pause: st.stand.pause, protokoll: st.stand.protokoll } : null });
    let r = kiSteuerungAnwenden(null, { pause: { aktiv: true } }, BR, T0);
    const gesetzt1 = r.stand.pause;
    const gesehen = { aktiv: false, am: gesetzt1.am, nr: gesetzt1.nr };      // was die Leitung sah
    r = kiSteuerungAnwenden(lesen(r), { pause: gesehen }, LEIT, T0);          // Leitung hebt auf (gleiche Millisekunde)
    expect(r.stand.pause.aktiv).toBe(false);
    r = kiSteuerungAnwenden(lesen(r), { pause: { aktiv: true } }, BR, T0);    // Betriebsrat pausiert erneut, gleiche Millisekunde
    expect(r.stand.pause.aktiv).toBe(true);
    expect(r.stand.pause.am).toBe(gesetzt1.am);                                // gleicher Zeitstempel ...
    expect(r.stand.pause.nr).not.toBe(gesetzt1.nr);                            // ... aber eine andere Pause
    const stale = kiSteuerungAnwenden(lesen(r), { pause: gesehen }, LEIT, T0); // veraltete Kopie der Leitung
    expect(stale.stand.pause.aktiv).toBe(true);
    expect(stale.ereignisse.length).toBe(0);
    const aktuell = r.stand.pause;                                             // mit dem aktuellen Merkmal gelingt es
    const ok = kiSteuerungAnwenden(lesen(r), { pause: { aktiv: false, am: aktuell.am, nr: aktuell.nr } }, LEIT, T0);
    expect(ok.stand.pause.aktiv).toBe(false);
    /* ohne nr oder mit gefälschter nr: nie */
    for (const x of [undefined, "1", -1, aktuell.nr + 1]) {
      const n = kiSteuerungAnwenden(lesen(r), { pause: { aktiv: false, am: aktuell.am, nr: x } }, LEIT, T0);
      expect(n.stand.pause.aktiv, String(x)).toBe(true);
    }
  });
  it("die Sicht der Leitung und Planung nennt nur die Rolle, nicht das Betriebsratsmitglied, das pausiert hat", () => {
    const b = schreibe("betriebsrat", setze({ pause: { aktiv: true } }), bereit()).bestand;
    expect(KI(b).pause.vonPerson).toBe("r1");
    for (const k of ["leitung", "planer", "kunde"]) {
      const s = bestandFuerRolle(b, SITZ[k]).mandanten[0].einstellungen.kiSteuerung;
      expect(s.pause.vonRolle, k).toBe("betriebsrat");
      expect(JSON.stringify(s.pause), k).not.toMatch(/r1|vonPerson/);
      expect(JSON.stringify(s.protokoll.filter((x) => x.vonRolle === "betriebsrat")), k).not.toMatch(/r1|vonPerson/);
      expect(s.betrieb.vonPerson, k).toBe("l1");
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
  it("Pause setzen: nur der Betriebsrat (mit Schalter, eigener Weg) — alle anderen nie (auch nicht mit anderen Änderungen zusammen)", () => {
    const b = bereit();
    for (const k of ["planer", "kunde", "leitungDemo", "subplaner", "mitarbeiter", "betreiber"]) {
      const r = schreibe(k, setze({ pause: { aktiv: true } }), b);
      expect(KI(r.bestand).pause, k).toBeUndefined();
      const r2 = schreibe(k, setze({ pause: { aktiv: true }, betrieb: { an: true }, funktionen: { F3: { an: true } } }), b);
      expect(KI(r2.bestand).pause, k).toBeUndefined();
    }
  });
  it("Pause setzen: die Leitung setzt `pause` nie (auch nicht mit dem Schalter) — ihre eigene Pause ist `leitungPause`", () => {
    const r = schreibe("leitung", setze({ pause: { aktiv: true } }), bereit());
    expect(KI(r.bestand).pause).toBeUndefined();
  });
  it("Leitung setzt eine EIGENE Pause (leitungPause, Betreiberentscheidung 2026-11-26): ohne den Schalter, vonRolle leitung, Server stempelt, alle Funktionen gesperrt", () => {
    ohneSchalter(undefined, () => {
      const r = schreibe("leitung", setze({ leitungPause: { aktiv: true, am: "1999", vonRolle: "betriebsrat", vonPerson: "x", nr: 77 } }), bereit());
      expect(r.abgewiesen, r.grund).toBe(false);
      const p = KI(r.bestand).leitungPause;
      expect(p).toMatchObject({ aktiv: true, vonRolle: "leitung", vonPerson: "l1", nr: 1 });
      expect(p.am).not.toBe("1999");
      expect(KI(r.bestand).pause).toBeUndefined();
      expect(KI(r.bestand).protokoll.at(-1)).toMatchObject({ art: "leitungspause-gesetzt", vonRolle: "leitung" });
      for (const f of ["F3", "F15"]) for (const rolle of KI_ROLLEN_AUSLOESEN) expect(intelligenceErlaubt(r.m, f, rolle, AN), `${f} ${rolle}`).toBe(false);
    });
  });
  it("leitungPause: nur die Leitung (nicht Demo) setzt und hebt auf; der Betriebsrat und alle anderen nie; Aufheben nur mit gesehenem am+nr", () => {
    const b = bereit();
    for (const k of ["planer", "kunde", "leitungDemo", "subplaner", "mitarbeiter", "betreiber", "betriebsrat"]) {
      expect(KI(schreibe(k, setze({ leitungPause: { aktiv: true } }), b).bestand).leitungPause, k).toBeUndefined();
    }
    const gesetzt = schreibe("leitung", setze({ leitungPause: { aktiv: true } }), b).bestand;
    const aufh = (bst) => ({ leitungPause: { aktiv: false, am: KI(bst).leitungPause.am, nr: KI(bst).leitungPause.nr } });
    for (const k of ["planer", "kunde", "leitungDemo", "subplaner", "mitarbeiter", "betreiber", "betriebsrat"])
      expect(KI(schreibe(k, setze(aufh(gesetzt)), gesetzt).bestand).leitungPause.aktiv, k).toBe(true);
    expect(KI(schreibe("leitung", setze({ leitungPause: { aktiv: false } }), gesetzt).bestand).leitungPause.aktiv).toBe(true);     // blind
    expect(KI(schreibe("leitung", setze({ leitungPause: { aktiv: false, am: KI(gesetzt).leitungPause.am, nr: 9 } }), gesetzt).bestand).leitungPause.aktiv).toBe(true);
    const auf = schreibe("leitung", setze(aufh(gesetzt)), gesetzt);
    expect(KI(auf.bestand).leitungPause).toMatchObject({ aktiv: false, vonRolle: "leitung", nr: 2 });
    expect(KI(auf.bestand).protokoll.at(-1)).toMatchObject({ art: "leitungspause-aufgehoben" });
    expect(intelligenceErlaubt(auf.m, "F3", "leitung", AN)).toBe(true);
    expect(KI(schreibe("leitung", setze({ leitungPause: { aktiv: true } }), gesetzt).bestand).leitungPause.nr).toBe(1);   // schon aktiv: keine neue nr
  });
  it("Nr. 2 (1): eine Leitungspause überschreibt eine bestehende Betriebsrat-Pause nicht (Herkunft, Stempel, Wirkung bleiben)", () => {
    const brPause = schreibe("betriebsrat", setze({ pause: { aktiv: true } }), bereit()).bestand;
    const vorher = KI(brPause).pause;
    const beide = schreibe("leitung", setze({ leitungPause: { aktiv: true }, pause: { aktiv: true, am: "1999", nr: 5 } }), brPause);
    expect(beide.abgewiesen, beide.grund).toBe(false);
    expect(KI(beide.bestand).pause).toEqual(vorher);                              // unverändert, vonRolle betriebsrat
    expect(KI(beide.bestand).pause.vonRolle).toBe("betriebsrat");
    expect(KI(beide.bestand).leitungPause).toMatchObject({ aktiv: true, vonRolle: "leitung", nr: 1 });
  });
  it("Nr. 2 (2): das Aufheben der Leitungspause beseitigt eine bestehende Betriebsrat-Pause nicht — und umgekehrt; Intelligence ist pausiert, solange EINE aktiv ist", () => {
    const br = schreibe("betriebsrat", setze({ pause: { aktiv: true } }), bereit()).bestand;
    const beide = schreibe("leitung", setze({ leitungPause: { aktiv: true } }), br).bestand;
    const ohneLeitung = schreibe("leitung", setze({ leitungPause: { aktiv: false, am: KI(beide).leitungPause.am, nr: KI(beide).leitungPause.nr } }), beide);
    expect(KI(ohneLeitung.bestand).leitungPause.aktiv).toBe(false);
    expect(KI(ohneLeitung.bestand).pause).toEqual(KI(br).pause);
    expect(KI(ohneLeitung.bestand).pause.aktiv).toBe(true);
    expect(intelligenceErlaubt(ohneLeitung.m, "F3", "leitung", AN)).toBe(false);                  // BR-Pause hält
    /* umgekehrt: die Leitung hebt die BR-Pause auf, ihre eigene bleibt */
    const ohneBr = schreibe("leitung", setze(frei(beide)), beide);
    expect(KI(ohneBr.bestand).pause.aktiv).toBe(false);
    expect(KI(ohneBr.bestand).leitungPause).toEqual(KI(beide).leitungPause);
    expect(intelligenceErlaubt(ohneBr.m, "F3", "leitung", AN)).toBe(false);                       // Leitungspause hält
    /* beide aufgehoben: frei */
    const frei2 = schreibe("leitung", setze({ leitungPause: { aktiv: false, am: KI(ohneBr.bestand).leitungPause.am, nr: KI(ohneBr.bestand).leitungPause.nr } }), ohneBr.bestand);
    expect(intelligenceErlaubt(frei2.m, "F3", "leitung", AN)).toBe(true);
    /* Aufheben beider in einer Anfrage */
    const beideAuf = schreibe("leitung", setze({ ...frei(beide), leitungPause: { aktiv: false, am: KI(beide).leitungPause.am, nr: KI(beide).leitungPause.nr } }), beide);
    expect(KI(beideAuf.bestand).pause.aktiv).toBe(false);
    expect(KI(beideAuf.bestand).leitungPause.aktiv).toBe(false);
  });
  it("ein unlesbarer Stand der Leitungspause pausiert (fail closed), sperrt aber keine Betriebsrat-Konten; die Leitung hebt ihn ohne Stempel auf", () => {
    const b = kopie(bereit()); b.mandanten[0].einstellungen.kiSteuerung.leitungPause = "kaputt";
    expect(intelligenceErlaubt(b.mandanten[0], "F3", "leitung", AN)).toBe(false);
    expect(kiBrPauseAktiv(b.mandanten[0].einstellungen)).toBe(false);
    const auf = schreibe("leitung", setze({ ...KI(b), leitungPause: { aktiv: false } }), b);
    expect(auf.abgewiesen, auf.grund).toBe(false);
    expect(KI(auf.bestand).leitungPause.aktiv).toBe(false);
  });
  it("Nr. 2 (3): die Konten-Sperre greift NUR bei aktiver Betriebsrat-Pause, nicht bei einer reinen Leitungspause", () => {
    const nurLeitung = schreibe("leitung", setze({ leitungPause: { aktiv: true } }), bereit()).bestand;
    const aendern = (bst) => { const n = kopie(bst); n.mandanten[0].personen.find((x) => x.id === "r1").rolle = "mitarbeiter"; return n; };
    expect(rollenwechselErlaubt(nurLeitung, aendern(nurLeitung), SITZ.leitung).ok).toBe(true);
    expect(kiBrPauseAktiv(nurLeitung.mandanten[0].einstellungen)).toBe(false);
    const br = schreibe("betriebsrat", setze({ pause: { aktiv: true } }), bereit()).bestand;
    expect(rollenwechselErlaubt(br, aendern(br), SITZ.leitung).ok).toBe(false);
    const beide = schreibe("leitung", setze({ leitungPause: { aktiv: true } }), br).bestand;
    expect(rollenwechselErlaubt(beide, aendern(beide), SITZ.leitung).ok).toBe(false);
    /* Leitungspause aufgehoben, BR-Pause besteht weiter: weiter gesperrt */
    const nurBr = schreibe("leitung", setze({ leitungPause: { aktiv: false, am: KI(beide).leitungPause.am, nr: KI(beide).leitungPause.nr } }), beide).bestand;
    expect(rollenwechselErlaubt(nurBr, aendern(nurBr), SITZ.leitung).ok).toBe(false);
    /* BR-Pause aufgehoben, Leitungspause besteht weiter: frei */
    const nurL = schreibe("leitung", setze(frei(beide)), beide).bestand;
    expect(rollenwechselErlaubt(nurL, aendern(nurL), SITZ.leitung).ok).toBe(true);
  });
  it("Pause aufheben: nur die Leitung (Rolle leitung, nicht Demo) — Betriebsrat, Planung und alle anderen nie; Protokoll nennt die Rolle", () => {
    const pausiert = schreibe("betriebsrat", setze({ pause: { aktiv: true } }), bereit()).bestand;
    for (const k of ["betriebsrat", "planer", "kunde", "leitungDemo", "subplaner", "mitarbeiter", "betreiber"]) {
      const r = schreibe(k, setze(frei(pausiert)), pausiert);
      expect(KI(r.bestand).pause.aktiv, k).toBe(true);
      const r2 = schreibe(k, setze(frei(pausiert, { betrieb: { an: true }, funktionen: { F3: { an: true } } })), pausiert);
      expect(KI(r2.bestand).pause.aktiv, k).toBe(true);
    }
    const auf = schreibe("leitung", setze(frei(pausiert)), pausiert);
    expect(auf.abgewiesen, auf.grund).toBe(false);
    expect(KI(auf.bestand).pause).toMatchObject({ aktiv: false, vonRolle: "leitung" });
    expect(KI(auf.bestand).protokoll.at(-1)).toMatchObject({ art: "pause-aufgehoben", vonRolle: "leitung" });
    const f = schreibe("leitung", setze({ pause: { aktiv: false, am: KI(pausiert).pause.am, nr: KI(pausiert).pause.nr, vonRolle: "betriebsrat", vonPerson: "x" } }), pausiert);
    expect(KI(f.bestand).pause).toMatchObject({ aktiv: false, vonRolle: "leitung", vonPerson: "l1" });
  });
  it("Pause aufheben nur mit dem Stempel der gesehenen Pause: eine veraltete oder blinde Kopie hebt nichts auf (Compare-and-set)", () => {
    const pausiert = schreibe("betriebsrat", setze({ pause: { aktiv: true } }), bereit()).bestand;
    for (const p of [{ aktiv: false }, { aktiv: false, am: "1999-01-01T00:00:00.000Z" }, { aktiv: false, am: 5 }, { aktiv: false, am: null }]) {
      const r = schreibe("leitung", setze({ pause: p }), pausiert);
      expect(KI(r.bestand).pause, JSON.stringify(p)).toEqual(KI(pausiert).pause);
      expect(KI(r.bestand).protokoll.length).toBe(KI(pausiert).protokoll.length);
    }
  });
  it("ein unlesbarer Pausenstand lässt sich von der Leitung aufheben (kein Dauerzustand); der Betriebsrat nie", () => {
    const alt = kopie(bereit()); alt.mandanten[0].einstellungen.kiSteuerung.pause = "kaputt";
    const r = schreibe("leitung", setze({ pause: { aktiv: false } }), alt);
    expect(r.abgewiesen, r.grund).toBe(false);
    expect(KI(r.bestand).pause).toMatchObject({ aktiv: false, vonRolle: "leitung" });
    const b = schreibe("betriebsrat", setze({ pause: { aktiv: false } }), alt);
    expect(b.abgewiesen).toBe(true);
  });
  it("Pause: unverändert ist keine Änderung und kein Protokolleintrag", () => {
    const pausiert = schreibe("betriebsrat", setze({ pause: { aktiv: true } }), bereit()).bestand;
    const nochmal = schreibe("betriebsrat", setze({ pause: { aktiv: true } }), pausiert);
    expect(nochmal.abgewiesen).toBe(true);
    const nichts = schreibe("leitung", setze({ pause: { aktiv: false } }), bereit());
    expect(KI(nichts.bestand).protokoll.length).toBe(KI(bereit()).protokoll.length);
    /* Erneutes Aufheben einer schon aufgehobenen Pause (mit deren Stempel) ändert nichts und steht nicht im Protokoll */
    const gesetzt = schreibe("betriebsrat", setze({ pause: { aktiv: true } }), bereit()).bestand;
    const aufgehoben = schreibe("leitung", setze(frei(gesetzt)), gesetzt).bestand;
    const wieder = schreibe("leitung", setze(frei(aufgehoben)), aufgehoben);
    expect(KI(wieder.bestand)).toEqual(KI(aufgehoben));
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
  it("Schalter CENTRIC_KI_BR_PAUSE: Vorgabe aus, nur genau „true“ schaltet ein; aus = Betriebsrat schreibt nirgends (403 wie bisher)", () => {
    ohneSchalter(undefined, () => expect(kiBetriebsratPauseAn()).toBe(false));
    for (const w of ["", "1", "TRUE", "True", "yes", "ja", "an", " true", "true "]) ohneSchalter(w, () => expect(kiBetriebsratPauseAn(), w).toBe(false));
    ohneSchalter("true", () => expect(kiBetriebsratPauseAn()).toBe(true));
    const b = bereit();
    for (const w of [undefined, "", "TRUE", "1"]) ohneSchalter(w, () => {
      const r = schreibe("betriebsrat", setze({ pause: { aktiv: true } }), b);
      expect(r.abgewiesen, String(w)).toBe(true);
      expect(KI(r.bestand).pause).toBeUndefined();
      const neu = kopie(b); neu.mandanten[0].einstellungen.kiSteuerung.pause = { aktiv: true };
      expect(zusammenfuehren(b, neu, SITZ.betriebsrat), String(w)).toBeNull();
    });
    ohneSchalter(undefined, () => {
      const ja = schreibe("leitung", setze({ betriebsratFrage: { antwort: "ja" } }), b);
      expect(KI(ja.bestand).pause.aktiv).toBe(true);
      const auf = schreibe("leitung", setze(frei(ja.bestand)), ja.bestand);
      expect(KI(auf.bestand).pause.aktiv).toBe(false);
    });
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

describe("Rollenvergabe (roles.assign) hebelt die Betriebsrat-Pause nicht aus", () => {
  const pausiert = () => schreibe("betriebsrat", setze({ pause: { aktiv: true } }), bereit()).bestand;
  const mitPersonen = (b, aendere) => { const n = kopie(b); aendere(n.mandanten[0].personen); return n; };
  const wechsel = (alt, neu, k = "leitung") => rollenwechselErlaubt(alt, neu, SITZ[k]);

  it("bei aktiver Pause: Entzug, Herabstufung, Löschung eines Betriebsrat-Kontos und ein neues Betriebsrat-Konto sind gesperrt", () => {
    const alt = pausiert();
    const falle = {
      herabstufen: mitPersonen(alt, (p) => { p.find((x) => x.id === "r1").rolle = "mitarbeiter"; }),
      loeschen: mitPersonen(alt, (p) => { p.splice(p.findIndex((x) => x.id === "r1"), 1); }),
      neuesKonto: mitPersonen(alt, (p) => { p.push(person("r2", "betriebsrat")); }),
      umwidmen: mitPersonen(alt, (p) => { p.find((x) => x.id === "a1").rolle = "betriebsrat"; }),
      deaktivieren: mitPersonen(alt, (p) => { p.find((x) => x.id === "r1").status = "inaktiv"; }),
      austritt: mitPersonen(alt, (p) => { p.find((x) => x.id === "r1").austritt = "2026-01-01"; }),
      anonymisieren: mitPersonen(alt, (p) => { p.find((x) => x.id === "r1").anonym = true; }),
    };
    for (const [name, neu] of Object.entries(falle)) {
      const r = wechsel(alt, neu);
      expect(r.ok, name).toBe(false);
      expect(r.grund, name).toMatch(/Betriebsrat/);
      /* und im echten Schreibweg: nichts wird gespeichert */
      const e = zusammenfuehren(alt, neu, SITZ.leitung);
      expect(e && e.verweigert, name).toBeTruthy();
    }
  });
  it("auch die Kundenrolle (zählt als Leitung) und eine Sicherung (Wiederherstellen) kommen nicht daran vorbei", () => {
    const alt = pausiert();
    const neu = mitPersonen(alt, (p) => { p.find((x) => x.id === "r1").rolle = "mitarbeiter"; });
    expect(wechsel(alt, neu, "kunde").ok).toBe(false);
    const sicherung = mitPersonen(bereit(), (p) => { p.find((x) => x.id === "r1").rolle = "mitarbeiter"; });
    const aus = betriebWiederherstellen(alt, sicherung, SITZ.leitung, { marke: "t3" });
    expect(aus.verweigert, "Wiederherstellen").toBeTruthy();
  });
  it("ohne aktive Pause bleibt die Rollenvergabe wie bisher; andere Rollen bleiben auch bei Pause frei", () => {
    const frei = bereit();
    expect(wechsel(frei, mitPersonen(frei, (p) => { p.find((x) => x.id === "r1").rolle = "mitarbeiter"; })).ok).toBe(true);
    expect(wechsel(frei, mitPersonen(frei, (p) => { p.push(person("r2", "betriebsrat")); })).ok).toBe(true);
    const alt = pausiert();
    expect(wechsel(alt, mitPersonen(alt, (p) => { p.find((x) => x.id === "a1").rolle = "subplaner"; })).ok).toBe(true);
    expect(wechsel(alt, mitPersonen(alt, (p) => { p.push(person("a2", "mitarbeiter")); })).ok).toBe(true);
    expect(wechsel(alt, alt).ok).toBe(true);                           // unverändert zurückgeschrieben
  });
  it("die Pause wirkt auch ohne den Schalter (Frage „ja“ setzt sie): Betriebsrat-Konten sind dann ebenso gesperrt", () => {
    const ja = schreibe("leitung", setze({ betriebsratFrage: { antwort: "ja" } }), bereit()).bestand;
    ohneSchalter(undefined, () => {
      const neu = mitPersonen(ja, (p) => { p.find((x) => x.id === "r1").rolle = "mitarbeiter"; });
      expect(wechsel(ja, neu).ok).toBe(false);
    });
  });
  it("ein unlesbarer Pausenstand zählt als Pause (fail closed) auch für die Konten", () => {
    const alt = kopie(bereit()); alt.mandanten[0].einstellungen.kiSteuerung.pause = "kaputt";
    const neu = mitPersonen(alt, (p) => { p.find((x) => x.id === "r1").rolle = "mitarbeiter"; });
    expect(wechsel(alt, neu).ok).toBe(false);
  });
  it("jede Änderung an Betriebsrat-Konten steht im Betriebsprotokoll — nur Art und Zahl, keine Person", () => {
    const alt = bereit();
    const neu = mitPersonen(alt, (p) => { p.find((x) => x.id === "r1").rolle = "mitarbeiter"; p.push(person("r2", "betriebsrat")); p.push(person("r3", "betriebsrat")); });
    const z = betriebsratKontenZeilen(alt, neu);
    expect(z).toEqual(["betriebsrat-konten +2 -1"]);
    expect(z.join()).not.toMatch(/r1|r2|V\w+ N/);
    expect(betriebsratKontenZeilen(alt, alt)).toEqual([]);
    expect(betriebsratKontenZeilen(null, null)).toEqual([]);
  });
});

describe("Art. 15 DSGVO: die Personenkennung im Pausenstand (Betreiberentscheidung 2026-11-26, Nr. 4: nur geprüft)", () => {
  it("die eigene Auskunft eines Betriebsratsmitglieds enthält weder die Steuerung noch die Personenkennung der Pause (Stand der Prüfung, keine Rechtsbewertung)", () => {
    const b = schreibe("betriebsrat", setze({ pause: { aktiv: true } }), bereit()).bestand;
    expect(KI(b).pause.vonPerson).toBe("r1");                                   // die Kennung liegt in der Ablage
    const m = b.mandanten[0];
    const eigeneSicht = bestandFuerRolle(b, SITZ.mitarbeiter).mandanten[0];
    for (const [umfang, sicht] of [["selbst", eigeneSicht], ["selbst", null]]) {
      const a = auskunftBauen(m, m.personen.find((x) => x.id === "r1"), { raum: "r", erstellt: "2026-11-26T10:00:00.000Z", umfang, eigeneSicht: sicht });
      const text = JSON.stringify(a);
      expect(text).not.toMatch(/kiSteuerung|vonPerson|pause-gesetzt|betriebsratFrage/);
    }
  });
});
