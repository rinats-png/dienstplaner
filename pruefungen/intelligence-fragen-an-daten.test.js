/* ==========================================================================
   INTELLIGENCE — F6 FRAGEN AN DATEN (WP-I31 Teil 1)

   Geprüft über die echte Funktion frageAnDaten (serverseitiger Kern, ohne Route): Schalter aus (Vorgabe), Freigabe,
   Katalog (jede Abfrage mit genauer Ausgabe auf Beispieldaten), Zuordnung der Frage, Rollenmatrix, keine Gesundheits-/
   Abwesenheitsangaben (offene Krankmeldungen und Krankabwesenheiten im Bestand), kein Anbieteraufruf ohne Gateway, die
   Frage wird nicht gespeichert, Grenzen, Bremse, Determinismus, Quelltext.
   ========================================================================== */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { offenePersonenAm } from "../server/lib/klaerung.mjs";
import { frageAnDaten, abfrageZuordnen, FRAGEN_KATALOG, FRAGEN_GRENZEN, F6_TEXT_ABGELEHNT, F6_TEXT_NICHT_ERLAUBT, F6_HINWEIS_AUSFAELLE } from "../server/lib/intelligence/funktionen/fragen-an-daten.mjs";
import { betrieb, bestand, S, sitzung, fold } from "./intelligence-gateway-fixture.mjs";
import { deepFreeze } from "../server/lib/intelligence/felder.mjs";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const AN = { prozess: () => "an", laufzeit: () => "an" };
const HEUTE = "2026-11-02";

/* Beispieldaten: Mindestbesetzung, Schichtfolge ab Anker, offene Krankmeldung (a3), Krankabwesenheiten mit Grund und
   Anmerkung (a1, a2), Urlaub mit Notiz (a2), eine Klärungsmarkierung im Bestand, Betriebsratsmitglied br1. */
const daten = () => {
  const b = betrieb();
  b.dienstarten = b.dienstarten.map((d) => ({ ...d, mindest: { mo_do: 2, fr: 2, sa: 1, so: 1 } }));
  b.personen = b.personen.map((p) => ({ ...p, eintritt: "2026-11-01" }));
  b.anker = "2026-11-02";
  b.abwesenheiten.push(
    { id: "ab4", personId: "a2", von: "2026-11-16", bis: "2026-11-20", art: "urlaub", notiz: "Reise nach Rom" },
    { id: "ab5", personId: "a2", von: "2026-11-05", bis: "2026-11-06", art: "krank", grund: "Magen-Darm", anmerkung: "AU Dr. Klein" });
  b.krankmeldungen = [{ id: "k1", personId: "a3", von: "2026-11-04", bis: "2026-11-04", status: "eingegangen", notiz: "Grippe Fieber" }];
  b.klaerung = { offen: [{ personId: "a3", tag: "2026-11-04" }] };
  return b;
};
function lauf(frage, o = {}) {
  const ladeBestand = vi.fn(async () => bestand(daten()));
  return { ladeBestand, ruf: (extra = {}) => frageAnDaten({ sitzung: S.leitung, frage, heute: HEUTE, ladeBestand, schalter: AN, funktionenFreigegeben: ["F6"], ausgeschlossenAm: offenePersonenAm, ...o, ...extra }) };
}
const frage = (f, rolle = "leitung", o = {}) => lauf(f, { sitzung: S[rolle], ...o }).ruf();
const fehlerCode = async (p) => { try { await p; } catch (e) { return e.code; } return null; };

/* Was nie in einer Ausgabe stehen darf: Gesundheits- und Abwesenheitsangaben, Betriebsrat, Klärung, Notizen. */
const VERBOTEN = ["krank", "grippe", "fieber", "magen", "darm", "attest", "dr. klein", "diagnose", "grund", "anmerkung", "notiz", "klaerung",
  "reise", "betriebsrat", "haberland", "gerda", "br1", "mutterschutz", "schwanger", "\"k1\"", "\"ab4\"", "\"ab5\"", "\"art\""];
const leck = (ausgabe) => { const s = fold(JSON.stringify(ausgabe)); return VERBOTEN.filter((v) => s.includes(fold(v))); };
const NAMEN_FREMD = ["brandt", "kowalski", "iwanowa", "mueller", "nguyen", "haberland", "ausgeschieden"];

const FRAGEN = {
  besetzung_tag: "Wie ist die Besetzung am 04.11.2026?",
  frei_am_tag: "Wer ist am 05.11.2026 frei?",
  stundenkonto: "Wie sind die Überstunden im November?",
  urlaub_uebersicht: "Wer hat im November Urlaub?",
  eigene_dienste: "Wann sind meine nächsten Dienste?",
};

describe("Schalter, Freigabe, Sitzung", () => {
  it("Vorgabe AUS: ohne Schalter, mit nur einem Schalter, mit falschen Werten — KI_AUS, der Bestand wird nicht einmal geladen", async () => {
    for (const schalter of [undefined, { prozess: () => "an", laufzeit: () => "aus" }, { prozess: () => "aus", laufzeit: () => "an" },
      { prozess: () => true, laufzeit: () => 1 }, { prozess: () => { throw new Error("x"); }, laufzeit: () => "an" }]) {
      const l = lauf(FRAGEN.besetzung_tag);
      expect(await fehlerCode(l.ruf({ schalter })), String(schalter)).toBe("KI_AUS");
      expect(l.ladeBestand).not.toHaveBeenCalled();
    }
  });
  it("ohne Freigabe der Funktion F6: KI_FUNKTION; eine andere Funktion genügt nicht", async () => {
    for (const funktionenFreigegeben of [undefined, [], ["F15"], ["F9", "F3"]]) {
      const l = lauf(FRAGEN.besetzung_tag);
      expect(await fehlerCode(l.ruf({ funktionenFreigegeben }))).toBe("KI_FUNKTION");
      expect(l.ladeBestand).not.toHaveBeenCalled();
    }
  });
  it("Rollen ohne Zugang: Betriebsrat, Betreiber, Kunde, unbekannt, leer — KI_ROLLE; ohne Person/Raum — KI_NICHT_ANGEMELDET", async () => {
    for (const rolle of ["betriebsrat", "betreiber", "kunde", "gast", "", "LEITUNG", "subplaner", "mitarbeiter"]) {
      const l = lauf(FRAGEN.besetzung_tag);
      expect(await fehlerCode(l.ruf({ sitzung: sitzung(rolle, "br1") })), rolle).toBe("KI_ROLLE");
      expect(l.ladeBestand).not.toHaveBeenCalled();
    }
    expect(await fehlerCode(lauf("Besetzung heute").ruf({ sitzung: { rolle: "leitung", person: "", bestand: "raum-a" } }))).toBe("KI_NICHT_ANGEMELDET");
    expect(await fehlerCode(lauf("Besetzung heute").ruf({ sitzung: null }))).toBe("KI_NICHT_ANGEMELDET");
  });
  it("anderer Betrieb: ein Index außerhalb des Bestands ist KI_NICHT_GEFUNDEN, ein anderer Betrieb liefert nie Daten des eigenen", async () => {
    expect(await fehlerCode(frageAnDaten({ sitzung: sitzung("leitung", "l1", { betrieb: 7 }), frage: FRAGEN.besetzung_tag, heute: HEUTE, ladeBestand: async () => bestand(daten()), schalter: AN, funktionenFreigegeben: ["F6"], ausgeschlossenAm: offenePersonenAm }))).toBe("KI_NICHT_GEFUNDEN");
    const fremd = { id: "m2", name: "Fremdhaus", einheiten: [{ id: "x1", name: "X" }], dienstarten: [], personen: [{ id: "z1", vorname: "Zora", nachname: "Fremd", rolle: "mitarbeiter", bereich: "x1" }], abwesenheiten: [] };
    let r, code = null;
    try { r = await frageAnDaten({ sitzung: sitzung("leitung", "l1", { betrieb: 1 }), frage: FRAGEN.frei_am_tag, heute: HEUTE, ladeBestand: async () => bestand(daten(), fremd), schalter: AN, funktionenFreigegeben: ["F6"], ausgeschlossenAm: offenePersonenAm }); } catch (e) { code = e.code; }
    const s = fold(JSON.stringify(r ?? {}));
    for (const x of ["zora", "fremd", "brandt", "weberknecht", "kowalski"]) expect(s, x).not.toContain(x);
    expect(code).toBe("KI_NICHT_GEFUNDEN");                       // die Person l1 steht nicht in Betrieb 1
  });
});

describe("Katalog: jede Abfrage, genaue Ausgabe (leitung)", () => {
  it("der Katalog ist geschlossen: fünf Abfragen mit Kennung, Titel, Beispiel und Rollen", () => {
    expect(FRAGEN_KATALOG.map((a) => a.id)).toEqual(["besetzung_tag", "frei_am_tag", "stundenkonto", "urlaub_uebersicht", "eigene_dienste"]);
    expect(Object.isFrozen(FRAGEN_KATALOG)).toBe(true);
    for (const a of FRAGEN_KATALOG) { expect(a.rollen.every((r) => ["leitung", "planer", "subplaner", "mitarbeiter"].includes(r))).toBe(true); expect(a.beispiel.length).toBeGreaterThan(5); }
  });
  it("besetzung_tag: Ist/Soll je Dienst am 04.11.2026 (Mittwoch)", async () => {
    const r = await frage(FRAGEN.besetzung_tag);
    expect(r).toEqual({ funktion: "F6", quelle: "berechnet", status: "ok", abfrage: { id: "besetzung_tag", titel: "Besetzung eines Tages" }, geltung: "betrieb",
      parameter: { datum: "2026-11-04", dienstId: null }, quellen: [{ rechnung: "besetzung", datum: "2026-11-04" }], modell: { status: "nicht_verfuegbar", text: "nicht verfügbar" },
      antwort: { datum: "2026-11-04", dienste: [
        { dienstId: "F", dienst: "Früh", beginn: "06:00", ende: "14:00", ist: 0, soll: 2, differenz: -2 },
        { dienstId: "N", dienst: "Nacht", beginn: "21:15", ende: "06:15", ist: 0, soll: 2, differenz: -2 },
        { dienstId: "S", dienst: "Spät", beginn: "13:30", ende: "21:30", ist: 5, soll: 2, differenz: 3 }] } });
  });
  it("besetzung_tag mit Dienst in der Frage: nur dieser Dienst; Datum „morgen“ und Wochentag", async () => {
    const r = await frage("Wie ist die Besetzung im Frühdienst morgen?");
    expect(r.parameter).toEqual({ datum: "2026-11-03", dienstId: "F" });
    expect(r.antwort.dienste.length).toBe(1);
    expect(r.antwort.dienste[0]).toMatchObject({ dienstId: "F", dienst: "Früh", soll: 2 });
    expect((await frage("Ist am Freitag der Nachtdienst abgedeckt?")).parameter).toEqual({ datum: "2026-11-06", dienstId: "N" });
  });
  it("frei_am_tag: nur wer im Dienst, nicht eingeteilt und nicht abwesend ist — ohne Grund, ohne Betriebsrat; mit Qualifikation gefiltert", async () => {
    const r = await frage(FRAGEN.frei_am_tag);
    expect(r.hinweis).toBe(F6_HINWEIS_AUSFAELLE);
    expect(r.geltung).toBe("betrieb");
    expect(r.antwort).toEqual({ datum: "2026-11-05", qualifikation: null, anzahl: 5, gekuerzt: false, personen: [
      { personId: "a1", name: "Anna Weberknecht" }, { personId: "a3", name: "Zoë Nguyen" }, { personId: "l1", name: "Lena Brandt" },
      { personId: "pl1", name: "Piotr Kowalski" }, { personId: "sv1", name: "Svetlana Iwanowa" }] });
    const q = await frage("Wer ist am 05.11.2026 frei mit Qualifikation PFK?");
    expect(q.antwort).toEqual({ datum: "2026-11-05", qualifikation: { id: "pfk", name: "pfk" }, anzahl: 1, gekuerzt: false, personen: [{ personId: "a1", name: "Anna Weberknecht" }] });
    /* Der Nachweis „masern“ (Gesundheitsnähe) wird nie abgefragt: die Frage wird abgelehnt. */
    expect((await frage("Wer ist am 05.11.2026 frei mit masern?")).status).toBe("abgelehnt");
  });
  it("stundenkonto: Plus/Minus je Person (Engine), absteigend; wer keinen Stand hat: „nicht verfügbar“, nie ein Wert aus der Planzeit", async () => {
    const r = await frage(FRAGEN.stundenkonto);
    expect(r.parameter).toEqual({ monat: "2026-11" });
    expect(r.antwort.personen).toEqual([
      { personId: "sv1", name: "Svetlana Iwanowa", verfuegbar: true, stunden: 50 }, { personId: "a1", name: "Anna Weberknecht", verfuegbar: true, stunden: 46 },
      { personId: "l1", name: "Lena Brandt", verfuegbar: true, stunden: 8 }, { personId: "a2", name: "Jörg Müller-Lüdenscheidt", verfuegbar: true, stunden: -56.6 },
      { personId: "a3", name: "Zoë Nguyen", verfuegbar: true, stunden: -76 }, { personId: "pl1", name: "Piotr Kowalski", verfuegbar: true, stunden: -161.7 },
      { personId: "alt1", name: "Kurt Ausgeschieden", verfuegbar: false, stunden: null }]);
    expect((await frage("Wie ist das Stundenkonto im Dezember 2026?")).parameter).toEqual({ monat: "2026-12" });
  });
  it("urlaub_uebersicht: nur Urlaub (nie Krank, Mutterschutz …), nur Person, Von, Bis — ohne Notiz", async () => {
    const r = await frage(FRAGEN.urlaub_uebersicht);
    expect(r.antwort).toEqual({ von: "2026-11-01", bis: "2026-11-30", gekuerzt: false, eintraege: [
      { personId: "a3", name: "Zoë Nguyen", von: "2026-10-28", bis: "2026-11-02" }, { personId: "a2", name: "Jörg Müller-Lüdenscheidt", von: "2026-11-16", bis: "2026-11-20" }] });
    for (const e of r.antwort.eintraege) expect(Object.keys(e).sort()).toEqual(["bis", "name", "personId", "von"]);
    expect((await frage("Wer hat am 17.11. Urlaub?")).antwort.eintraege.map((e) => e.personId)).toEqual(["a2"]);
  });
  it("eigene_dienste: die nächsten 14 Tage der fragenden Person (Leitung l1)", async () => {
    const r = await frage(FRAGEN.eigene_dienste, "leitung");
    expect(r.geltung).toBe("eigene");
    expect(r.parameter).toEqual({ von: "2026-11-02", bis: "2026-11-15" });
    expect(r.antwort.dienste.map((d) => `${d.datum}:${d.dienstId}`)).toEqual(["2026-11-02:F", "2026-11-03:F", "2026-11-04:S", "2026-11-06:N", "2026-11-07:N", "2026-11-09:F", "2026-11-10:F", "2026-11-11:S", "2026-11-13:N", "2026-11-14:N"]);
    expect(r.antwort.dienste[0]).toEqual({ datum: "2026-11-02", dienstId: "F", dienst: "Früh", beginn: "06:00", ende: "14:00", entwurf: false });
  });
});

describe("frei_am_tag und offene Krankmeldungen (RB-5), Ist-Schutz, Wortgrenzen", () => {
  const offen = () => { const b = daten(); b.krankmeldungen = [{ id: "k1", personId: "a3", von: "2026-11-04", bis: "2026-11-06", status: "eingegangen", notiz: "Grippe Fieber" }]; return b; };
  const mitFall = (rolle, o = {}) => frageAnDaten({ sitzung: S[rolle], frage: FRAGEN.frei_am_tag, heute: HEUTE, ladeBestand: async () => bestand(offen()), schalter: AN, funktionenFreigegeben: ["F6"], ausgeschlossenAm: offenePersonenAm, ...o });
  it("eine Person mit offenem Fall wird nicht als frei aufgeführt (leitung und planer, genaue Ausgabe); ein abgeschlossener Fall nicht ausgeschlossen", async () => {
    for (const rolle of ["leitung", "planer"]) {
      const r = await mitFall(rolle);
      expect(r.antwort).toEqual({ datum: "2026-11-05", qualifikation: null, anzahl: 4, gekuerzt: false, personen: [
        { personId: "a1", name: "Anna Weberknecht" }, { personId: "l1", name: "Lena Brandt" }, { personId: "pl1", name: "Piotr Kowalski" }, { personId: "sv1", name: "Svetlana Iwanowa" }] });
      expect(leck(r)).toEqual([]);
    }
    const zu = offen(); zu.krankmeldungen[0].status = "endgueltig_bestaetigt";
    const r2 = await frageAnDaten({ sitzung: S.leitung, frage: FRAGEN.frei_am_tag, heute: HEUTE, ladeBestand: async () => bestand(zu), schalter: AN, funktionenFreigegeben: ["F6"], ausgeschlossenAm: offenePersonenAm });
    expect(r2.antwort.personen.some((p) => p.personId === "a3")).toBe(true);
  });
  it("eine wirksame Krankabwesenheit (a2 am 05.11.) steht nie als frei da; die Ausschlussfunktion ist Pflicht (fail closed) und wird mit Sicht und Tag gerufen", async () => {
    const r = await frage(FRAGEN.frei_am_tag);
    expect(r.antwort.personen.some((p) => p.personId === "a2")).toBe(false);
    for (const ausgeschlossenAm of [undefined, null, "x"]) {
      const l = lauf(FRAGEN.frei_am_tag);
      expect(await fehlerCode(l.ruf({ ausgeschlossenAm })), String(ausgeschlossenAm)).toBe("KI_INTERN");
      expect(l.ladeBestand).not.toHaveBeenCalled();
    }
    expect(await fehlerCode(lauf(FRAGEN.frei_am_tag).ruf({ ausgeschlossenAm: () => { throw new Error("x"); } }))).toBe("KI_INTERN");
    const spion = vi.fn(() => ["l1"]);
    const k = await lauf(FRAGEN.frei_am_tag).ruf({ ausgeschlossenAm: spion });
    expect(spion).toHaveBeenCalledWith(expect.objectContaining({ id: "m1" }), "2026-11-05");
    expect(k.antwort.personen.some((p) => p.personId === "l1")).toBe(false);
    /* Andere Abfragen brauchen die Funktion nicht. */
    expect((await lauf(FRAGEN.besetzung_tag).ruf({ ausgeschlossenAm: undefined })).status).toBe("ok");
  });
  it("Quelltext (RB-5): die Funktion liest m.krankmeldungen nicht selbst", () => {
    const q = readFileSync(path.join(WURZEL, "server/lib/intelligence/funktionen/fragen-an-daten.mjs"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(q).not.toMatch(/krankmeldungen|klaerung\.mjs|offenePersonenAm/);
  });
  it("Ist-Schutz: ist der Monat abgeschlossen und das eingefrorene Ist nicht verfügbar, steht „nicht verfügbar“ da — nie eine Planzeit", async () => {
    const zu = daten(); zu.monatsabschluss = { "2026-11": { abgeschlossen: true } };
    const r = await frageAnDaten({ sitzung: S.leitung, frage: FRAGEN.stundenkonto, heute: HEUTE, ladeBestand: async () => bestand(zu), schalter: AN, funktionenFreigegeben: ["F6"], ausgeschlossenAm: offenePersonenAm });
    expect(r.antwort).toEqual({ monat: "2026-11", gekuerzt: false, personen: ["a1", "a2", "a3", "alt1", "l1", "pl1", "sv1"].map((id) => ({
      personId: id, name: { a1: "Anna Weberknecht", a2: "Jörg Müller-Lüdenscheidt", a3: "Zoë Nguyen", alt1: "Kurt Ausgeschieden", l1: "Lena Brandt", pl1: "Piotr Kowalski", sv1: "Svetlana Iwanowa" }[id],
      verfuegbar: false, stunden: null })) });
  });
  it("Wortgrenzen: „Grundpflege“ ist eine Besetzungsfrage, „Grund der Abwesenheit“ wird abgelehnt", async () => {
    const r = await frage("Wie ist die Grundpflege morgen besetzt?");
    expect(r.status).toBe("ok");
    expect(r.abfrage.id).toBe("besetzung_tag");
    expect(r.parameter.datum).toBe("2026-11-03");
    const a = await frage("Grund der Abwesenheit am 05.11.?");
    expect(a.status).toBe("abgelehnt");
    expect((await frage("Wer hat Urlaub aus gesundheitlichen Gründen?")).status).toBe("abgelehnt");
    expect((await frage("Welche Krankheiten gibt es?")).status).toBe("abgelehnt");
  });
});

describe("Zuordnung der Frage (Stichwörter, kein Modell)", () => {
  it.each([
    ["Wie ist die Besetzung morgen?", "besetzung_tag"], ["Ist der Spätdienst am Montag unterbesetzt?", "besetzung_tag"], ["Wie viele Leute sind heute da?", "besetzung_tag"],
    ["Wer ist verfügbar am Samstag?", "frei_am_tag"], ["Wer kann einspringen am 10.11.?", "frei_am_tag"], ["Wer hat morgen frei?", "frei_am_tag"],
    ["Wie sind die Überstunden?", "stundenkonto"], ["Plus-Minus-Stunden im Oktober", "stundenkonto"], ["Zeigt mir das Stundenkonto", "stundenkonto"],
    ["Wer hat Urlaub?", "urlaub_uebersicht"], ["Urlaub im Dezember", "urlaub_uebersicht"],
    ["Wann sind meine nächsten Dienste?", "eigene_dienste"], ["Wann arbeite ich wieder?", "eigene_dienste"], ["Meine nächsten Schichten", "eigene_dienste"],
    ["Wie wird das Wetter?", null], ["Schreibe ein Gedicht", null], ["???", null],
  ])("%s → %s", (f, id) => { expect(abfrageZuordnen(f)).toBe(id); });
  it("deterministisch und unabhängig von Groß-/Kleinschreibung und Umlautschreibung", () => {
    for (const f of ["WIE SIND DIE ÜBERSTUNDEN?", "wie sind die ueberstunden?", "Wie sind die Überstunden?"]) expect(abfrageZuordnen(f)).toBe("stundenkonto");
  });
  it("eine Frage ohne passende Abfrage: Liste der erlaubten Abfragen der Rolle, keine Daten", async () => {
    const r = await frage("Wie wird das Wetter?", "planer");
    expect(r.status).toBe("keine_passende_abfrage");
    expect(r.verfuegbareAbfragen.map((a) => a.id)).toEqual(["besetzung_tag", "frei_am_tag", "stundenkonto", "urlaub_uebersicht", "eigene_dienste"]);
    expect(r.antwort).toBeUndefined();
  });
  it("ungültiges Datum: parameter_ungueltig, nichts berechnet", async () => {
    expect((await frage("Wie ist die Besetzung am 31.02.2026?")).status).toBe("parameter_ungueltig");
  });
});

describe("Rollenmatrix", () => {
  it("planer: wie die Leitung im Betrieb (Besetzung, frei, Konto, Urlaub), eigene Dienste nur die eigenen", async () => {
    for (const id of ["besetzung_tag", "frei_am_tag", "stundenkonto", "urlaub_uebersicht"]) {
      const l = await frage(FRAGEN[id], "leitung"), p = await frage(FRAGEN[id], "planer");
      expect(p.geltung).toBe("betrieb");
      expect(p.antwort).toEqual(l.antwort);
    }
    expect((await frage(FRAGEN.eigene_dienste, "planer")).geltung).toBe("eigene");
  });
  it("subplaner und mitarbeiter: die ganze Funktion ist an die Positivliste F6 gebunden (nur leitung, planer) — KI_ROLLE, ohne dass ein Bestand geladen wird", async () => {
    for (const rolle of ["subplaner", "mitarbeiter"]) for (const f of Object.values(FRAGEN)) {
      const l = lauf(f, { sitzung: S[rolle] });
      expect(await fehlerCode(l.ruf()), `${rolle}: ${f}`).toBe("KI_ROLLE");
      expect(l.ladeBestand).not.toHaveBeenCalled();
    }
  });
  it("leitung und planer: „eigene Dienste“ nur die der fragenden Person", async () => {
    const l = await frage(FRAGEN.eigene_dienste, "leitung"), p = await frage(FRAGEN.eigene_dienste, "planer");
    expect(l.geltung).toBe("eigene");
    expect(l.antwort.dienste.length).toBeGreaterThan(0);
    expect(p.antwort.dienste).toEqual([]);                        // pl1 hat keine Einheit: keine Schichtfolge
  });
});

describe("Keine Gesundheits-, Abwesenheits- oder Betriebsratsangaben", () => {
  it("keine Ausgabe, keine Rolle, keine Frage enthält eine verbotene Zeichenfolge (Beispieldaten mit offenen Krankmeldungen und Krankabwesenheiten)", async () => {
    for (const rolle of ["leitung", "planer"])
      for (const f of [...Object.values(FRAGEN), "Wie ist die Besetzung am 05.11.2026?", "Wer ist am 04.11.2026 frei?", "Wer ist am 06.11.2026 frei?", "Urlaub im Dezember", "Plus-Minus im Oktober"]) {
        const r = await frage(f, rolle);
        expect(leck(r), `${rolle}: ${f}`).toEqual([]);
      }
  });
  it("die Prüfung selbst schlägt an: eine eingeschleuste Art, ein Grund und ein Betriebsratsname werden erkannt (Gegenprobe)", async () => {
    const r = await frage(FRAGEN.urlaub_uebersicht);
    expect(leck(r)).toEqual([]);
    expect(leck({ ...r, antwort: { ...r.antwort, eintraege: [{ ...r.antwort.eintraege[0], art: "krank" }] } }).length).toBeGreaterThan(0);
    expect(leck({ ...r, antwort: { grund: "Grippe" } }).length).toBeGreaterThan(0);
    expect(leck({ x: "Gerda Haberland" }).length).toBeGreaterThan(0);
  });
  it("Krankmeldungen, Gründe und Klärung stehen nirgends: wer abwesend ist, ist nur „nicht aufgeführt“; der offene Fall ändert die Ausgabe nicht", async () => {
    const ohneFall = daten(); delete ohneFall.krankmeldungen; delete ohneFall.klaerung;
    const mit = await frage(FRAGEN.frei_am_tag);
    const ohne = await frageAnDaten({ sitzung: S.leitung, frage: FRAGEN.frei_am_tag, heute: HEUTE, ladeBestand: async () => bestand(ohneFall), schalter: AN, funktionenFreigegeben: ["F6"], ausgeschlossenAm: offenePersonenAm });
    expect(mit).toEqual(ohne);
    const tag = await frage("Wer ist am 06.11.2026 frei?");
    expect(tag.antwort.personen.some((p) => p.personId === "a2")).toBe(false);   // a2 ist abwesend: nicht aufgeführt, ohne Hinweis auf den Grund
    expect(Object.keys(tag.antwort).sort()).toEqual(["anzahl", "datum", "gekuerzt", "personen", "qualifikation"]);
  });
  it("Fragen nach Krankheit, Gründen, Klärung, Betriebsrat und Gesundheit werden abgelehnt — vor jeder Abfrage", async () => {
    for (const f of ["Wer ist krank?", "Wer hat am 05.11. frei und warum?", "Warum fehlt Anna?", "Welche Diagnose hat Anna?", "Wer ist schwanger?", "Wer hat eine Krankmeldung?",
      "Welche Besetzung hat der Betriebsrat?", "Zeige die Klärungsfälle", "Wer hat Urlaub aus gesundheitlichen Gründen?", "Wer hat Grippe?", "Wer ist im Mutterschutz?", "Anmerkung zum Urlaub"]) {
      const l = lauf(f);
      const r = await l.ruf();
      expect(r, f).toEqual({ funktion: "F6", quelle: "berechnet", modell: { status: "nicht_verfuegbar", text: "nicht verfügbar" }, status: "abgelehnt", text: F6_TEXT_ABGELEHNT });
      expect(l.ladeBestand, f).not.toHaveBeenCalled();
    }
  });
});

describe("Kein Anbieter ohne Gateway, nur die bereinigte Frage, nie ein Ergebnis", () => {
  const spion = (antwort) => ({ ausfuehren: vi.fn(async () => antwort) });
  const FERTIG = { status: "fertig", ergebnis: { text: "Die Besetzung ist knapp." }, kennzeichnung: { kiGestuetzt: true, entwurf: true, geprueft: true } };
  it("ohne Gateway (Stand heute): „nicht verfügbar“, die berechnete Antwort ist da", async () => {
    const r = await frage(FRAGEN.besetzung_tag);
    expect(r.modell).toEqual({ status: "nicht_verfuegbar", text: "nicht verfügbar" });
    expect(r.antwort.dienste.length).toBe(3);
  });
  it("Schalter aus, Rolle ohne F6, Gesundheitsfrage, keine Abfrage, nicht erlaubt: das Gateway wird NIE gerufen", async () => {
    const g = spion(FERTIG);
    await expect(frageAnDaten({ sitzung: S.leitung, frage: FRAGEN.besetzung_tag, heute: HEUTE, ladeBestand: async () => bestand(daten()), schalter: undefined, funktionenFreigegeben: ["F6"], gateway: g })).rejects.toMatchObject({ code: "KI_AUS" });
    for (const rolle of ["subplaner", "mitarbeiter"]) expect(await fehlerCode(frage(FRAGEN.stundenkonto, rolle, { gateway: g }))).toBe("KI_ROLLE");
    await frage("Wer ist krank?", "leitung", { gateway: g });
    await frage("Wie wird das Wetter?", "leitung", { gateway: g });
    expect(g.ausfuehren).not.toHaveBeenCalled();
  });
  it("leitung/planer mit Gateway: genau ein Aufruf, Funktion F6, nur die Frage — keine Kontaktdaten, kein Name, kein Ergebnis", async () => {
    for (const rolle of ["leitung", "planer"]) {
      const g = spion(FERTIG);
      const r = await frage("Wie ist die Besetzung am 04.11.2026? Rückruf lena.brandt@sonnenhof.example oder 0151 98765432 ZEBRA-4711", rolle, { gateway: g });
      expect(g.ausfuehren).toHaveBeenCalledTimes(1);
      const [s, a] = g.ausfuehren.mock.calls[0];
      expect(s.rolle).toBe(rolle);
      expect(a).toEqual({ funktion: "F6", eingabe: { fremdtext: ["Frage: Wie ist die Besetzung am 04.11.2026? Rückruf [entfernt] oder [entfernt] ZEBRA-4711"] } });
      const roh = JSON.stringify(a);
      for (const v of ["@", "0151", "lena", "brandt", "weberknecht", "Früh", "Spät", "soll", "\"ist\""]) expect(roh, v).not.toContain(v);
      expect(r.modell).toEqual({ status: "fertig", text: "Die Besetzung ist knapp.", kennzeichnung: { kiGestuetzt: true, entwurf: true, geprueft: true } });
      expect(r.antwort.dienste.length).toBe(3);                   // die berechnete Antwort bleibt unverändert die Antwort
    }
  });
  it("ohne Kennzeichnung, mit Fehler oder falscher Form: „nicht verfügbar“ — der Fehlertext (mit der Frage) verlässt das Modul nie", async () => {
    for (const antwort of [{ status: "fertig", ergebnis: { text: "x" } }, { status: "rueckfall" }, null, { status: "fertig", ergebnis: { text: "  " }, kennzeichnung: { kiGestuetzt: true, entwurf: true } }]) {
      const r = await frage(FRAGEN.besetzung_tag, "leitung", { gateway: spion(antwort) });
      expect(r.modell).toEqual({ status: "nicht_verfuegbar", text: "nicht verfügbar" });
    }
    const g = { ausfuehren: vi.fn(async () => { throw new Error("ZEBRA-4711 Anna Weberknecht"); }) };
    const r = await frage(`${FRAGEN.besetzung_tag} ZEBRA-4711`, "leitung", { gateway: g });
    expect(r.modell.status).toBe("nicht_verfuegbar");
    expect(JSON.stringify(r)).not.toContain("ZEBRA");
  });
});

describe("Die Frage wird nicht gespeichert, nicht wiederholt, nicht protokolliert", () => {
  it("die Frage steht in keiner Ausgabe, auch nicht in Fehlern", async () => {
    expect(JSON.stringify(await frage("Wie ist die Besetzung am 04.11.2026? ZEBRA-4711"))).not.toContain("ZEBRA");
    expect(JSON.stringify(await frage("Wie wird das Wetter ZEBRA-4711"))).not.toContain("ZEBRA");
    expect(JSON.stringify(await frage("Wer ist krank ZEBRA-4711"))).not.toContain("ZEBRA");
    for (const sonder of ["ZEBRA-4711 ".repeat(40), 42, null]) {
      try { await frage(sonder); throw new Error("sollte werfen"); } catch (e) { expect(String(e.message) + String(e.code)).not.toContain("ZEBRA"); expect(e.code).toBe("KI_EINGABE"); }
    }
  });
  it("Quelltext: kein console, kein Schreiben/Protokoll, kein Netz, kein Anbieter, keine Umgebung, kein Import von Gateway oder Anbieter", () => {
    const q = readFileSync(path.join(WURZEL, "server/lib/intelligence/funktionen/fragen-an-daten.mjs"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(q).not.toMatch(/console\.|protokoll|bestandSchreiben|zusammenfuehren|writeFile|appendFile|setJSON|\.set\(|fetch\s*\(|node:|process\.|require\s*\(|import\s*\(|anthropic|openai|erzeugeGateway|erzeugeAttrappe|erzeugeLiveAnbieter/i);
    expect([...q.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]).filter((i) => /gateway\//.test(i) && !/gateway\/(schalter|codes)\.mjs$/.test(i))).toEqual([]);
    expect(q).toMatch(/frageBereinigen/);
  });
});

describe("Grenzen, Bremse, Determinismus", () => {
  it("Frage: höchstens 300 Zeichen, mindestens 3, nur Text — sonst KI_EINGABE ohne Zugriff auf den Bestand", async () => {
    for (const f of ["x".repeat(FRAGEN_GRENZEN.frage + 1), "ab", "", 5, {}, null, undefined, ["a"]]) {
      const l = lauf(f);
      expect(await fehlerCode(l.ruf()), String(f).slice(0, 10)).toBe("KI_EINGABE");
      expect(l.ladeBestand).not.toHaveBeenCalled();
    }
    expect((await frage("Besetzung " + "x".repeat(FRAGEN_GRENZEN.frage - 10))).funktion).toBe("F6");
    expect(await fehlerCode(lauf(FRAGEN.besetzung_tag).ruf({ heute: "2026-13-40" }))).toBe("KI_EINGABE");
  });
  it("Ausgabe: höchstens 100 Zeilen, gekuerzt gesetzt; mehr als 400 Personen: KI_EINGABE", async () => {
    const viele = (n) => { const b = daten(); for (let i = 0; i < n; i++) b.personen.push({ id: `x${String(i).padStart(3, "0")}`, vorname: "P", nachname: String(i), rolle: "mitarbeiter", bereich: "e1", eintritt: "2026-11-01", zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }], springer: true }); return b; };
    const r = await frageAnDaten({ sitzung: S.leitung, frage: FRAGEN.frei_am_tag, heute: HEUTE, ladeBestand: async () => bestand(viele(150)), schalter: AN, funktionenFreigegeben: ["F6"], ausgeschlossenAm: offenePersonenAm });
    expect(r.antwort.personen.length).toBe(FRAGEN_GRENZEN.zeilen);
    expect(r.antwort.gekuerzt).toBe(true);
    expect(r.antwort.anzahl).toBe(155);
    expect(await fehlerCode(frageAnDaten({ sitzung: S.leitung, frage: FRAGEN.frei_am_tag, heute: HEUTE, ladeBestand: async () => bestand(viele(400)), schalter: AN, funktionenFreigegeben: ["F6"], ausgeschlossenAm: offenePersonenAm }))).toBe("KI_EINGABE");
  });
  it("Urlaubszeitraum: Tag, Monat oder 30 Tage ab heute, nie mehr als 62 Tage", async () => {
    expect((await frage("Wer hat am 01.11.2026 Urlaub?")).parameter).toEqual({ von: "2026-11-01", bis: "2026-11-01" });
    expect((await frage("Urlaub im Dezember 2026")).parameter).toEqual({ von: "2026-12-01", bis: "2026-12-31" });
    expect((await frage("Wer hat Urlaub?")).parameter).toEqual({ von: "2026-11-02", bis: "2026-12-02" });
  });
  it("Bremse: nicht frei → KI_LIMIT, der Bestand wird nicht geladen; frei → antwortet; die Bremse bekommt nur die Person", async () => {
    const bremse = vi.fn(async () => ({ frei: false }));
    const l = lauf(FRAGEN.besetzung_tag);
    expect(await fehlerCode(l.ruf({ bremse }))).toBe("KI_LIMIT");
    expect(l.ladeBestand).not.toHaveBeenCalled();
    expect(bremse).toHaveBeenCalledWith("l1");
    expect((await lauf(FRAGEN.besetzung_tag).ruf({ bremse: async () => ({ frei: true }) })).status).toBe("ok");
    expect(await fehlerCode(lauf(FRAGEN.besetzung_tag).ruf({ bremse: async () => ({}) }))).toBe("KI_LIMIT");
  });
  it("deterministisch; Eingabe unverändert (eingefrorener Bestand); Reihenfolge der Personen ohne Einfluss", async () => {
    const eingefroren = deepFreeze(bestand(daten()));
    const ruf = (f, rolle = "leitung") => frageAnDaten({ sitzung: S[rolle], frage: f, heute: HEUTE, ladeBestand: async () => eingefroren, schalter: AN, funktionenFreigegeben: ["F6"], ausgeschlossenAm: offenePersonenAm });
    for (const f of Object.values(FRAGEN)) expect(await ruf(f)).toEqual(await ruf(f));
    const umgekehrt = daten(); umgekehrt.personen.reverse();
    const a = await ruf(FRAGEN.stundenkonto);
    const b = await frageAnDaten({ sitzung: S.leitung, frage: FRAGEN.stundenkonto, heute: HEUTE, ladeBestand: async () => bestand(umgekehrt), schalter: AN, funktionenFreigegeben: ["F6"], ausgeschlossenAm: offenePersonenAm });
    expect(b).toEqual(a);
  });
});
