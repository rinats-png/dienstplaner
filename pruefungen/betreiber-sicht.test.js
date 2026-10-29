/* ==========================================================================
   BETREIBERSICHT ALS POSITIVKATALOG (Commit D1)

   Bis Commit D1 bekam der Betreiber über GET /api/bestand (und die
   409-Antwort von PUT) den ganzen Raum ungefiltert — Gesundheitsdaten,
   Krankmeldungen, Bank, Steuer, Lohn, Namen, Kontakte, Notizen, Kalender-
   und Push-Geheimnisse, Pläne, Zeiten, Nachrichten aller Betriebe, dazu
   jedes neue Feld. Seine Konsole braucht davon nur ein Gerüst.

   Jetzt eine Positivliste (sicht.mjs, bestandSichtBetreiber). Die
   Kennzahlen der Konsole ergeben aus dem Gerüst dasselbe wie aus dem
   vollständigen Bestand — geprüft mit den Funktionen der Oberfläche selbst.
   Schreiben nimmt der Server vom Betreiber ohnehin nur das Kaufmännische.
   ========================================================================== */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { bestandFuerRolle, zusammenfuehren } from "../server/lib/rechte.mjs";
import { jeStandort } from "../src/standorte.js";

const BT = { rolle: "betreiber", person: null, betrieb: 0 };
const LT = { rolle: "leitung", person: "l1", betrieb: 0 };
const SV = { rolle: "subplaner", person: "s1", betrieb: 0 };

const person = (id, rolle, einheit, extra = {}) => ({ id, vorname: `MK-VORNAME-${id}`, nachname: `MK-NACHNAME-${id}`, rolle,
  bereich: einheit, status: "aktiv", eintritt: "2024-01-01", zugehoerigkeit: [{ ab: "2020-01-01", einheitId: einheit, notizZ: "MK-ZUG-EXTRA" }], ...extra });
const SENSIBEL = {
  mutterschutz: true, schwerbehindert: true, geburtsdatum: "MK-GEBDATUM", geburtstag: "MK-GEBTAG", nachtvorsorge: "MK-VORSORGE",
  einschraenkungen: { keineNacht: true, wiedereingliederung: { von: "2026-01-01", bis: "2026-12-31", maxStundenWoche: 17, grund: "MK-WIEDER" } },
  iban: "MK-IBAN", steuerId: "MK-STEUER", sozialversicherung: "MK-SV", lohn: "MK-LOHN", gehalt: "MK-GEHALT",
  notfallkontakt: "MK-NOTFALL", email: "mk-mail@x.de", telefon: "MK-TEL", mobil: "MK-MOBIL", anschrift: "MK-ANSCHRIFT",
  emailVorher: "MK-EMAILVORHER", notiz: "MK-LEITUNGSNOTIZ", kalenderGeheim: "MK-KALGEHEIM", kalenderVerweis: "MK-KALVERWEIS",
  pushSchluessel: { endpoint: "MK-PUSH" }, zustellung: { planGeaendert: { mail: "MK-ZUSTELLUNG" } },
  qualifikationen: ["MK-QUAL"], unbekanntesPersonenfeld: "MK-UNBEKANNT-PERSON",
};
const betrieb = (id, name, personen, extra = {}) => ({
  id, name, raum: "raum-1", branche: "pflege", status: "aktiv", tarif: "pro", seit: "2024-01-01", stichtag: 1, testTage: 30,
  rabattGrund: "Freund", preisgestaltung: { sonder: 10 }, pakete: ["pflege"], kontakt: "k@kunde.de", kontaktName: "Frau Kunde",
  anschrift: "Kundenweg 1", ustId: "DE123", notiz: "MK-BETRIEBSNOTIZ", einheitLabel: "Wohnbereich", rollennamen: { leitung: "PDL" },
  einheiten: [{ id: "e1", name: "WB 1", standortId: "st1", pool: false, farbe: "#000", unbekanntesEinheitenfeld: "MK-UNBEKANNT-EINHEIT" },
    { id: "e2", name: "WB 2", standortId: "st2" }, { id: "ep", name: "Pool", standortId: "st1", pool: true }],
  standorte: [{ id: "st1", name: "Haupthaus", lat: 50, unbekanntesStandortfeld: "MK-UNBEKANNT-STANDORT" }, { id: "st2", name: "Nebenhaus" }],
  dienstarten: [{ id: "F", name: "Früh", unbekanntesDienstartfeld: "MK-UNBEKANNT-DIENSTART" }, { id: "S" }, { id: "N" }],
  personen,
  abweichungen: { "a1|2026-12-01": "MK-PLAN" },
  erfassung: { "a1|2026-10-01": { start: "06:00", grund: "MK-ERFASSUNG" } },
  einstempeln: { "a1|2026-10-01": { ortStart: "MK-STEMPEL" } },
  abwesenheiten: [{ id: "ab", personId: "a1", art: "krank", von: "2026-12-01", bis: "2026-12-02", notiz: "MK-KRANKNOTIZ", grund: "MK-KRANKGRUND" }],
  anfragen: [{ id: "an", personId: "a1", typ: "abwesenheit", text: "MK-ANTRAG" }],
  wuensche: [{ id: "w", personId: "a1", text: "MK-WUNSCH" }],
  nachrichten: [{ id: "n", personId: "a1", titel: "MK-NACHRICHT" }],
  notrufe: [{ id: "nr", personId: "a1", notiz: "MK-NOTRUF" }],
  dienstbuch: [{ id: "db", text: "MK-DIENSTBUCH" }], uebergaben: [{ id: "u", lage: "MK-UEBERGABE" }],
  notizen: { "tag|2026-12-01": [{ id: "t", text: "MK-TAGESNOTIZ" }], "person|a1": [{ id: "p", text: "MK-PERSONENNOTIZ" }] },
  tagesnotizen: { x: "MK-TOTFELD" },
  ausschreibungen: [{ id: "as", bewerbungen: [{ personId: "a1", text: "MK-BEWERBUNG" }] }],
  selbstplanung: [{ id: "sp", eintraege: [{ personId: "a1", zeit: "MK-SELBSTPLAN" }] }],
  einspruenge: [{ id: "ei", personId: "a1", grund: "MK-EINSPRUNG" }], fahrzeiten: { "a1|2026-10-01": { kennzeichen: "MK-FAHRZEIT" } },
  checks: [{ id: "c", text: "MK-CHECK" }], lohnarten: [{ id: "MK-LOHNART" }],
  protokoll: [{ id: "l2", zeit: "2026-10-18 09:00", text: "MK-BETRIEBSPROTOKOLL", durch: "MK-NACHNAME-l1" }, { id: "l1", zeit: "2026-10-01", text: "alt" }],
  adressAenderungen: [{ personId: "a1", zeit: "2026-10-10T08:00:00.000Z", von: "alt@x.de", nach: "neu@x.de",
    geheim: "DARF-NICHT-RAUS", name: "MK-ADR-NAME", passwortHash: "MK-ADR-HASH" }],
  unbekanntImBetrieb: "MK-UNBEKANNT-BETRIEB",
  ...extra,
});
const bestand = () => ({
  version: 9, stand: 1,
  /* Altbestand: eine mitgespeicherte Sitzung (per PUT weiterhin setzbar). */
  session: { rolle: "kunde", mandantId: "m1", personId: "MK-SESSION-PERSON", token: "MK-SESSION-TOKEN", email: "mk-session@x.de" },
  betreiber: { firma: "CENTRIC" }, tarife: [{ id: "pro", preis: 99 }], rechnungen: [{ id: "r1", mandantId: "m1" }],
  protokoll: [{ id: "bp", text: "Betreiberprotokoll" }], pakete: [{ id: "pflege" }], adressaenderungen: [{ alt: "a@x" }],
  selbststarts: [{ raum: "t-1" }], unbekanntOben: "MK-UNBEKANNT-OBEN",
  mandanten: [
    betrieb("m1", "Haus A", [person("l1", "leitung", "e1"), person("s1", "subplaner", "e1"),
      person("p1", "planer", "e1", { rolleSeit: "2026-10-10", rolleVerlauf: [{ ab: "2026-01-01", rolle: "mitarbeiter", warum: "MK-VERLAUF-EXTRA" }, { ab: "2026-10-10", rolle: "planer" }] }),
      person("a1", "mitarbeiter", "e1", SENSIBEL), person("a2", "mitarbeiter", "e2", { austritt: "2026-10-15" }),
      person("a3", "mitarbeiter", "ep", { eintritt: "2026-10-20" }), person("g1", "mitarbeiter", "e2", { status: "gesperrt" })]),
    betrieb("m2", "Haus B", [person("b1", "leitung", "e1", { iban: "MK-IBAN-B", mutterschutz: true })]),
  ],
});
const sicht = (s = BT, g = bestand()) => bestandFuerRolle(g, s);
const VERBOTEN = ["MK-VORNAME", "MK-NACHNAME", "MK-GEBDATUM", "MK-GEBTAG", "MK-VORSORGE", "MK-WIEDER", "wiedereingliederung",
  "mutterschutz", "schwerbehindert", "MK-IBAN", "MK-STEUER", "MK-SV", "MK-LOHN", "MK-GEHALT", "MK-NOTFALL", "mk-mail@x.de",
  "MK-TEL", "MK-MOBIL", "MK-ANSCHRIFT", "MK-EMAILVORHER", "MK-LEITUNGSNOTIZ", "MK-KALGEHEIM", "MK-KALVERWEIS", "MK-PUSH",
  "MK-ZUSTELLUNG", "MK-QUAL", "MK-UNBEKANNT-PERSON", "MK-PLAN", "MK-ERFASSUNG", "MK-STEMPEL", "MK-KRANKNOTIZ", "MK-KRANKGRUND",
  "\"krank\"", "MK-ANTRAG", "MK-WUNSCH", "MK-NACHRICHT", "MK-NOTRUF", "MK-DIENSTBUCH", "MK-UEBERGABE", "MK-TAGESNOTIZ",
  "MK-PERSONENNOTIZ", "MK-TOTFELD", "MK-BEWERBUNG", "MK-SELBSTPLAN", "MK-EINSPRUNG", "MK-FAHRZEIT", "MK-CHECK", "MK-LOHNART",
  "MK-BETRIEBSPROTOKOLL", "MK-UNBEKANNT-BETRIEB", "MK-UNBEKANNT-EINHEIT", "MK-UNBEKANNT-STANDORT", "MK-UNBEKANNT-DIENSTART",
  "MK-UNBEKANNT-OBEN", "MK-ZUG-EXTRA", "MK-VERLAUF-EXTRA", "keineNacht",
  "MK-SESSION", "mk-session@x.de", "MK-BETRIEBSNOTIZ", "DARF-NICHT-RAUS", "MK-ADR-NAME", "MK-ADR-HASH"];

describe("Sicht des Betreibers", () => {
  it("GET: kein sensibler Marker, kein unbekanntes Feld — in keinem Betrieb", () => {
    const text = JSON.stringify(sicht());
    for (const s of VERBOTEN) expect(text, s).not.toContain(s);
  });
  it("oben genau seine Felder", () => {
    expect(Object.keys(sicht()).sort()).toEqual(["adressaenderungen", "betreiber", "mandanten", "pakete", "protokoll",
      "rechnungen", "selbststarts", "session", "stand", "tarife", "version"]);
    expect(sicht().rechnungen).toEqual(bestand().rechnungen);
  });
  it("beide Betriebe, jeder nur mit Katalogfeldern", () => {
    const b = sicht();
    expect(b.mandanten.map((m) => m.id)).toEqual(["m1", "m2"]);
    expect(Object.keys(b.mandanten[0]).sort()).toEqual(["adressAenderungen", "anschrift", "branche", "dienstarten", "einheitLabel",
      "einheiten", "id", "kontakt", "kontaktName", "name", "pakete", "personen", "preisgestaltung", "protokoll", "rabattGrund",
      "raum", "rollennamen", "seit", "standorte", "status", "stichtag", "tarif", "testTage", "ustId"].sort());
  });
  it("Personengerüst: genau die erlaubten Felder", () => {
    for (const p of sicht().mandanten.flatMap((m) => m.personen)) {
      for (const k of Object.keys(p)) expect(["id", "rolle", "rolleSeit", "rolleVerlauf", "status", "eintritt", "austritt", "zugehoerigkeit"], k).toContain(k);
      for (const z of p.zugehoerigkeit) expect(Object.keys(z).sort()).toEqual(["ab", "einheitId"]);
    }
    const p1 = sicht().mandanten[0].personen.find((p) => p.id === "p1");
    expect(p1.rolleVerlauf).toEqual([{ ab: "2026-01-01", rolle: "mitarbeiter" }, { ab: "2026-10-10", rolle: "planer" }]);
  });
  it("Einheiten, Standorte, Dienstarten, Protokoll gekürzt; Adressänderungen bleiben (funktionale Ausnahme)", () => {
    const m = sicht().mandanten[0];
    expect(m.einheiten[0]).toEqual({ id: "e1", name: "WB 1", standortId: "st1", pool: false });
    expect(m.standorte[0]).toEqual({ id: "st1", name: "Haupthaus" });
    expect(m.dienstarten).toEqual([{ id: "F" }, { id: "S" }, { id: "N" }]);
    expect(m.protokoll).toEqual([{ zeit: "2026-10-18 09:00" }]);
    expect(m.adressAenderungen).toEqual([{ personId: "a1", zeit: "2026-10-10T08:00:00.000Z", von: "alt@x.de", nach: "neu@x.de" }]);
  });
  /* D1a */
  it("session: immer null — auch wenn der Bestand eine (Alt-)Sitzung trägt", () => {
    expect(sicht().session).toBeNull();
    expect(bestand().session).toBeTruthy();
  });
  it("notiz: geht nicht hinaus; der Betreiber kann sie weiterhin setzen", () => {
    expect(sicht().mandanten[0].notiz).toBeUndefined();
    const g = bestand();
    const gelesen = JSON.parse(JSON.stringify(sicht(BT, g)));
    gelesen.mandanten[0].notiz = "neu vom Betreiber";
    expect(zusammenfuehren(g, gelesen, BT).mandanten[0].notiz).toBe("neu vom Betreiber");
  });
  it("Adressänderungen: nur personId, zeit, von, nach — unbekannte Felder nicht", () => {
    for (const a of sicht().mandanten[0].adressAenderungen) expect(Object.keys(a).sort()).toEqual(["nach", "personId", "von", "zeit"]);
  });
  it("fail-closed: neue unbekannte Felder auf allen Ebenen gehen nicht hinaus", () => {
    const g = bestand();
    g.neuOben = "MK-NEU"; g.mandanten[0].neuImBetrieb = "MK-NEU"; g.mandanten[0].personen[0].neuAnPerson = "MK-NEU";
    g.mandanten[0].einheiten[0].neu = "MK-NEU"; g.mandanten[0].standorte[0].neu = "MK-NEU"; g.mandanten[0].dienstarten[0].neu = "MK-NEU";
    expect(JSON.stringify(sicht(BT, g))).not.toContain("MK-NEU");
  });
  it("Leitung und Schichtverantwortung: Stichprobe unverändert", () => {
    expect(sicht(LT).mandanten[0].personen.find((p) => p.id === "a1").iban).toBeUndefined();     // wie bisher: Bank nicht für die Leitung
    expect(sicht(LT).mandanten[0].personen.find((p) => p.id === "a1").mutterschutz).toBe(true);
    expect(sicht(LT).mandanten[0].abwesenheiten[0].notiz).toBe("MK-KRANKNOTIZ");
    expect(sicht(SV).mandanten[0].personen.find((p) => p.id === "a1").mutterschutz).toBeUndefined();
  });
});

describe("Kennzahlen: aus dem Gerüst dasselbe wie aus dem vollen Bestand", () => {
  /* Die Funktionen der Oberfläche selbst, aus App.jsx geladen. */
  const app = readFileSync(path.join(process.cwd(), "src/App.jsx"), "utf8").replace(/\r\n/g, "\n");
  const quelle = (name) => {
    const i = app.indexOf(`function ${name}(`);
    const j = app.indexOf("\n}\n", i);
    const zeile = app.indexOf("\n", i);
    return app.slice(i, app.slice(i, zeile).trim().endsWith("}") ? zeile : j + 2);
  };
  const F = new Function(`${quelle("einheitAm")}\n${quelle("imDienst")}\n${quelle("rolleAm")}\nreturn { einheitAm, imDienst, rolleAm };`)();
  const TAGE = ["2026-10-01", "2026-10-12", "2026-10-16", "2026-10-21", "2026-11-01"];
  const kennzahlen = (m) => TAGE.map((d) => {
    const aktiv = m.personen.filter((p) => F.imDienst(p, d));
    const rollen = {};
    for (const p of aktiv) { const r = F.rolleAm(p, d); rollen[r] = (rollen[r] || 0) + 1; }
    return { d, aktiv: aktiv.map((p) => p.id), planer: aktiv.filter((p) => p.rolle === "planer").length, rollen,
      einheiten: aktiv.map((p) => F.einheitAm(p, d)), standorte: jeStandort(m, d).map((z) => [z.standort.id, z.personen, z.rollen]) };
  });
  it("aktive Personen, Rollen (auch anteilig über rolleVerlauf), Planer, Einheiten, Standorte", () => {
    for (let i = 0; i < 2; i++)
      expect(kennzahlen(sicht().mandanten[i])).toEqual(kennzahlen(bestand().mandanten[i]));
  });
  it("Dienstart-Anzahl, Einheiten-Anzahl, letzte Änderung", () => {
    const r = sicht().mandanten[0], v = bestand().mandanten[0];
    expect(r.dienstarten.length).toBe(v.dienstarten.length);
    expect(r.einheiten.length).toBe(v.einheiten.length);
    expect(r.protokoll[0].zeit).toBe(v.protokoll[0].zeit);
  });
  it("die Konsole liest nur Felder des Katalogs", () => {
    const sichtCode = quelle("betreiberSicht");
    const felder = [...sichtCode.matchAll(/\bm\.([a-zA-Z]+)/g)].map((x) => x[1]);
    for (const f of felder) expect(["id", "name", "branche", "status", "seit", "stichtag", "kontakt", "anschrift", "tarif",
      "rabattGrund", "pakete", "einheiten", "dienstarten", "protokoll", "personen", "standorte"], f).toContain(f);
  });
});

describe("Schreibweg und Rundweg", () => {
  it("gekürzt lesen, kaufmännisches Feld ändern, zurückschreiben: alles Verborgene exakt gespeichert", () => {
    const g = bestand();
    const gelesen = JSON.parse(JSON.stringify(sicht(BT, g)));
    gelesen.mandanten[0].tarif = "enterprise";
    const e = zusammenfuehren(g, gelesen, BT);
    expect(e.verweigert).toBeFalsy();
    expect(e.mandanten[0]).toEqual({ ...g.mandanten[0], tarif: "enterprise" });
    expect(e.mandanten[1]).toEqual(g.mandanten[1]);
    expect(e.unbekanntOben).toBe("MK-UNBEKANNT-OBEN");
  });
  it("gekürzte Personenlisten oder fehlende Felder löschen nichts", () => {
    const g = bestand();
    const gelesen = JSON.parse(JSON.stringify(sicht(BT, g)));
    gelesen.mandanten[0].personen = [];
    delete gelesen.mandanten[0].einheiten;
    const e = zusammenfuehren(g, gelesen, BT);
    expect(e.mandanten[0]).toEqual(g.mandanten[0]);
  });
  it("neuer Betrieb anlegbar, Betrieb löschbar", () => {
    const g = bestand();
    const gelesen = JSON.parse(JSON.stringify(sicht(BT, g)));
    gelesen.mandanten = [gelesen.mandanten[0], { id: "m3", name: "Neu", personen: [{ id: "x", vorname: "A", nachname: "B", rolle: "leitung" }], einheiten: [] }];
    const e = zusammenfuehren(g, gelesen, BT);
    expect(e.mandanten.map((m) => m.id)).toEqual(["m1", "m3"]);
    expect(e.mandanten[1].personen[0].vorname).toBe("A");
    expect(e.mandanten[0]).toEqual(g.mandanten[0]);
  });
});
