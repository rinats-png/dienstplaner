/* ==========================================================================
   INTELLIGENCE — FAKTENPAKET BILDEN (WP-I11)

   Quelle ist die ROLLENSICHT (bestandFuerRolle → sicht.mjs), geschnitten mit
   der Positivliste der Funktion; nie Rohbestand, nie die Vereinigung.
   Geprüft:
   - je Rolle: Beschäftigte, Schichtverantwortung, Betriebsrat, Planung,
     Leitung, Betreiber (Sicht = sicht.mjs; höhere Rolle bekommt kein Feld
     über die Positivliste hinaus);
   - Mandantentrennung (Raum und Betrieb aus der Sitzung, Alias nie
     betriebsübergreifend);
   - Freitext standardmäßig nicht; Gesundheits- und Schutzmerkmale nie;
   - Faktenquelle (Rechenkern) kann die Positivliste nicht umgehen;
   - Leck-Prüfung fail closed mit Audit-Ereignis ohne Inhalt;
   - Property-Tests: zufällige Betriebe mit eingebetteten Klarnamen,
     Kontakt- und Gesundheitsdaten — nie im Paket.
   ========================================================================== */

import { describe, it, expect } from "vitest";
import { faktenpaketBilden, faktenAusSicht, befundNeutral, FAKTEN_MAX } from "../server/lib/intelligence/faktenpaket.mjs";
import { FUNKTIONEN } from "../server/lib/intelligence/positivliste.mjs";
import { FELDER } from "../server/lib/intelligence/felder.mjs";
import { pruefeFaktenpaket, FUNKTIONEN_IDS } from "../server/lib/intelligence/schemas.mjs";
import { bestandFuerRolle } from "../server/lib/rechte.mjs";

const SCHLUESSEL = Buffer.from("5b0e9c1d7a3f48e26c1b9d0a4e7f3c2b8a6d1e9f0c3b7a5d2e8f1c4b6a9d0e3f", "hex");
const VERSIONEN = { engine: "0.0.0-attrappe", regelstand: "r-2026-11", tarifstand: "t-2026" };
const ZR = { von: "2026-11-01", bis: "2026-11-30" };
const MIT_FELDERN = FUNKTIONEN_IDS.filter((f) => FUNKTIONEN[f].felder.length > 0);

/* ------------------------------------------------------------------------
   Ein Betrieb mit allem, was nie ins Paket darf.
   ------------------------------------------------------------------------ */
const betrieb = (id = "m1", name = "Seniorenheim Sonnenhof") => ({
  id, name, raum: undefined, kontakt: "verwaltung@sonnenhof.example", anschrift: "Am Deich 4, 28199 Bremen",
  einheiten: [{ id: "e1", name: "Wohnbereich Lindenhof" }, { id: "e2", name: "Wohnbereich Ahornweg" }, { id: "pool", name: "Springerpool", pool: true }],
  dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00" }, { id: "S", name: "Spät", start: "13:30", ende: "21:30" },
    { id: "N", name: "Nacht", start: "21:15", ende: "06:15" }],
  qualifikationen: [{ id: "pfk" }, { id: "hilfe" }, { id: "masern", nurStatus: true }],
  zyklus: { tage: ["F", "F", "S", "-", "N", "N", "-"] },
  einsatzorte: [{ id: "o1", name: "Haus Elbblick", lat: 53.07516, lng: 8.80777, radius: 150 }],
  personen: [
    { id: "l1", vorname: "Lena", nachname: "Brandt", rolle: "leitung", bereich: "e1", wochenstunden: 40, email: "lena.brandt@sonnenhof.example",
      zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }] },
    { id: "pl1", vorname: "Piotr", nachname: "Kowalski", rolle: "planer", bereich: "e1", wochenstunden: 38.5 },
    { id: "sv1", vorname: "Svetlana", nachname: "Iwanowa", rolle: "subplaner", bereich: "e1", wochenstunden: 30,
      zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }] },
    { id: "a1", vorname: "Anna", nachname: "Weberknecht", rolle: "mitarbeiter", bereich: "e1", wochenstunden: 30, teilzeit: true,
      email: "anna.weberknecht@example.org", telefon: "+49 171 2345678", mobil: "0151 98765432", personalnummer: "100234",
      geburtsdatum: "1990-05-12", iban: "DE89370400440532013000", anschrift: { strasse: "Lindenallee 12", ort: "Bremen" },
      mutterschutz: { aktiv: true, entbindung: "2027-01-15" }, schwerbehindert: false, notiz: "Schwanger, Arzttermine dienstags",
      einschraenkungen: { keineNacht: true, wiedereingliederung: { bis: "2026-12-31", stunden: 20 } },
      mutterschutzEinwilligungen: [{ art: "nacht", erteilt: "2026-10-01" }], kalenderGeheim: "a3f1c9e07b2d4a6e8f0c1b3d5e7f9a1c",
      pushSchluessel: { endpoint: "https://push.example/abc", p256dh: "BNcR" }, qualifikationen: ["pfk", "masern"],
      qualNachweise: [{ qualId: "masern", vorhanden: true, ablauf: "2030-01-01" }],
      zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }], status: "aktiv", imSchichtdienst: true },
    { id: "a2", vorname: "Jörg", nachname: "Müller-Lüdenscheidt", rolle: "mitarbeiter", bereich: "e2", wochenstunden: 39,
      schwerbehindert: { grad: 60, merkzeichen: "G" }, springer: false, qualifikationen: ["hilfe"],
      zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e2" }], geburtsdatum: "2009-02-02" },
    { id: "a3", vorname: "Zoë", nachname: "Nguyen", rolle: "mitarbeiter", bereich: "pool", springer: true, wochenstunden: 20,
      zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "pool" }] },
    { id: "br1", vorname: "Gerda", nachname: "Haberland", rolle: "betriebsrat", bereich: "e2", wochenstunden: 35 },
    { id: "alt1", vorname: "Kurt", nachname: "Ausgeschieden", rolle: "mitarbeiter", bereich: "e1", austritt: "2025-01-31" },
  ],
  abweichungen: { "a1|2026-11-03": "F", "a2|2026-11-03": "N", "a3|2026-11-04": "S", "a1|2026-11-05": "-", "alt1|2026-11-03": "F" },
  abwesenheiten: [
    { id: "ab1", personId: "a1", von: "2026-11-10", bis: "2026-11-12", art: "krank", grund: "Grippe", anmerkung: "AU liegt vor, Diagnose J11" },
    { id: "ab2", personId: "a2", von: "2026-11-20", bis: "2026-12-05", art: "mutterschutz", nachweis: "Attest Dr. Klein" },
    { id: "ab3", personId: "a3", von: "2026-10-28", bis: "2026-11-02", art: "urlaub" },
  ],
  notizen: { "a1|2026-11-03": "Anna Weberknecht klagt über Rückenschmerzen" },
  tagesnotizen: { "tag|2026-11-03": "Jörg früher gehen lassen (Arzt)" },
  dienstbuch: [{ text: "Bewohnerin Frau Siebert gestürzt, Zoë informiert" }],
  uebergaben: [{ text: "Herr Lehmann: Insulin 8 IE" }],
  anfragen: [{ id: "q1", typ: "urlaub", personId: "a1", text: "Wegen Kinderwunschbehandlung frei", status: "offen" }],
  bestaetigungen: [{ personId: "a1", datum: "2026-11-03", befunde: [{ regel: "schutz", text: "MuSchG § 5" }], grund: "Anna wollte unbedingt" }],
});
const bestand = (...m) => ({ version: 1, stand: 1, session: null, mandanten: m.length ? m : [betrieb()] });
const sitzung = (rolle, person, o = {}) => ({ rolle, person, bestand: "raum-a", betrieb: 0, ...o });
const S = {
  leitung: sitzung("leitung", "l1"), planer: sitzung("planer", "pl1"), subplaner: sitzung("subplaner", "sv1"),
  mitarbeiter: sitzung("mitarbeiter", "a1"), betriebsrat: sitzung("betriebsrat", "br1"), betreiber: sitzung("betreiber", "betreiber"),
};
const bilden = (o = {}) => faktenpaketBilden({ sitzung: S.leitung, ladeBestand: () => bestand(), funktion: "F3",
  eingabe: { zeitraum: ZR }, kontext: "auftrag-1", aliasSchluessel: SCHLUESSEL, versionen: VERSIONEN, ...o });
const code = async (p) => { try { await p; return "ok"; } catch (e) { return e.code || String(e); } };

/** Eine Faktenquelle, die jedes berechnete Feld liefert (für alle Personen und Einheiten der Sicht). */
const vollQuelle = ({ sicht }) => {
  const aus = [];
  const pers = (sicht.personen || []).map((p) => p.id);
  const einh = (sicht.einheiten || []).map((e) => e.id);
  for (const p of pers) {
    aus.push({ feld: "befund.regel", person: p, wert: "ruhezeitGesetz", datum: "2026-11-03", regel: { regelId: "ruhezeitGesetz", pruefstatus: "geprueft", fundstelle: "§ 5 ArbZG" } });
    aus.push({ feld: "befund.stufe", person: p, wert: "achtung", datum: "2026-11-03" });
    aus.push({ feld: "kandidat.zulaessig", person: p, wert: true });
    aus.push({ feld: "kandidat.spielraum", person: p, wert: 60 });
    aus.push({ feld: "kandidat.hinderung", person: p, wert: "ruhezeitBetrieb" });
    aus.push({ feld: "konto.saldo", person: p, wert: -3.5 });
    aus.push({ feld: "ruhezeit.ist", person: p, wert: 660, datum: "2026-11-04" });
    aus.push({ feld: "aenderung.art", person: p, wert: "neu", datum: "2026-11-04", ref: "F" });
  }
  for (const e of einh) {
    aus.push({ feld: "besetzung.ist", einheit: e, wert: 3, datum: "2026-11-03", ref: "F" });
    aus.push({ feld: "besetzung.soll", einheit: e, wert: 4, datum: "2026-11-03", ref: "F" });
  }
  aus.push({ feld: "befund.stufe", wert: "recht" });
  aus.push({ feld: "kennzahl.wert", wert: 0.92, ref: "besetzung.quote" });
  aus.push({ feld: "regel.art", wert: "zaehlregel", ref: "R-WE-2" });
  return aus;
};

/* Was nie im Paket stehen darf (unabhängige, einfache Prüfung — nicht die Leck-Prüfung selbst). */
const fold = (s) => String(s).toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
  .normalize("NFKD").replace(/[̀-ͯ]/g, "");
const VERBOTEN_IM_PAKET = ["lena", "brandt", "piotr", "kowalski", "svetlana", "iwanowa", "anna", "weberknecht", "joerg",
  "mueller", "luedenscheidt", "nguyen", "gerda", "haberland", "kurt", "ausgeschieden", "sonnenhof", "lindenhof", "ahornweg",
  "elbblick", "raum-a", "@", "+49", "0151", "100234", "1990-05-12", "2009-02-02", "de8937", "lindenallee", "bremen",
  "mutterschutz", "schwanger", "arzt", "attest", "grippe", "diagnose", "krank", "rueckenschmerz", "kinderwunsch",
  "wiedereingliederung", "keinenacht", "einwilligung", "schwerbehind", "merkzeichen", "masern", "insulin", "siebert",
  "lehmann", "gestuerzt", "a3f1c9e0", "push.example", "53.07516", "8.80777", "notiz", "grund", "anmerkung", "\"l1\"",
  "\"pl1\"", "\"sv1\"", "\"a1\"", "\"a2\"", "\"a3\"", "\"br1\"", "\"alt1\"", "\"e1\"", "\"e2\"", "\"pool\"", "\"m1\"", "urlaub"];
const verbotenImPaket = (paket) => {
  const s = fold(JSON.stringify(paket));
  return VERBOTEN_IM_PAKET.filter((v) => s.includes(fold(v)));
};

/* ------------------------------------------------------------------------ */
describe("Rollen: Auslösen nur laut Positivliste", () => {
  it("Leitung und Planung bilden F3; Paket gültig, ohne Verbotenes", async () => {
    for (const r of ["leitung", "planer"]) {
      const { paket } = await bilden({ sitzung: S[r], faktenquelle: vollQuelle });
      expect(pruefeFaktenpaket(paket).ok, r).toBe(true);
      expect(verbotenImPaket(paket), r).toEqual([]);
      expect(paket.fakten.length, r).toBeGreaterThan(20);
    }
  });
  it("Betriebsrat, Betreiber, Schichtverantwortung, Kundenrolle, unbekannte Rolle: jede Funktion → KI_ROLLE", async () => {
    for (const s of [S.betriebsrat, S.betreiber, S.subplaner, sitzung("kunde", "k1"), sitzung("admin", "x")])
      for (const f of FUNKTIONEN_IDS)
        expect(await code(bilden({ sitzung: s, funktion: f, eingabe: FUNKTIONEN[f].felder.length ? { zeitraum: ZR } : {} })), `${s.rolle} ${f}`)
          .toBe("KI_ROLLE");
  });
  it("Beschäftigte: nur F9 und ohne Betriebsdaten; alles andere KI_ROLLE", async () => {
    for (const f of FUNKTIONEN_IDS.filter((x) => x !== "F9"))
      expect(await code(bilden({ sitzung: S.mitarbeiter, funktion: f })), f).toBe("KI_ROLLE");
    const { paket } = await bilden({ sitzung: S.mitarbeiter, funktion: "F9", eingabe: { fremdtext: ["Wie tausche ich einen Dienst?"] },
      faktenquelle: vollQuelle });
    expect(paket.fakten).toEqual([]);
    expect(paket.zeitraum).toBeNull();
    expect(paket.fremdtext).toEqual([{ kapselId: "k0", text: "Wie tausche ich einen Dienst?" }]);
  });
  it("Planung darf F4 (Leitungsbriefing) nicht", async () => {
    expect(await code(bilden({ sitzung: S.planer, funktion: "F4" }))).toBe("KI_ROLLE");
  });
});

describe("Quelle ist die Rollensicht (sicht.mjs), nie der Rohbestand", () => {
  it("die Faktenquelle bekommt genau die Sicht der Rolle — eingefroren", async () => {
    for (const [r, f] of [["leitung", "F3"], ["planer", "F3"], ["mitarbeiter", "F9"]]) {
      let gesehen = null;
      await bilden({ sitzung: S[r], funktion: f, eingabe: f === "F9" ? {} : { zeitraum: ZR }, faktenquelle: ({ sicht }) => { gesehen = sicht; return []; } });
      expect(gesehen, r).toEqual(bestandFuerRolle(bestand(), S[r]).mandanten[0]);
      expect(Object.isFrozen(gesehen), r).toBe(true);
    }
  });
  it("die Sicht der Beschäftigten enthält keine fremden Kontakt- und Schutzdaten — das Paket erst recht nicht", async () => {
    const sicht = bestandFuerRolle(bestand(), S.mitarbeiter).mandanten[0];
    const anna = sicht.personen.find((p) => p.id === "a2");
    expect(anna.schwerbehindert).toBeUndefined();
    expect(anna.geburtsdatum).toBeUndefined();
  });
  it("Schnitt: aus einer kleineren Sicht entstehen nie mehr Fakten als aus der größeren (Schichtverantwortung, Beschäftigte ⊆ Leitung)", () => {
    const zr = ZR;
    const roh = (rolle) => faktenAusSicht(FUNKTIONEN.F3, bestandFuerRolle(bestand(), S[rolle]).mandanten[0], zr).fakten
      .map((f) => JSON.stringify(f));
    const leitung = new Set(roh("leitung"));
    for (const r of ["subplaner", "mitarbeiter", "betriebsrat", "planer"]) {
      const klein = roh(r);
      expect(klein.filter((x) => !leitung.has(x)), r).toEqual([]);
    }
  });
  it("Schichtverantwortung: ihre Sicht gibt nur Felder her, die sicht.mjs für den Umfang freigibt (fremde Bereiche ohne Konten)", () => {
    const sicht = bestandFuerRolle(bestand(), S.subplaner).mandanten[0];
    const fakten = faktenAusSicht(FUNKTIONEN.F3, sicht, ZR).fakten;
    for (const p of sicht.personen) {
      const eigene = fakten.filter((f) => f.person === p.id).map((f) => f.feld);
      for (const feld of eigene) {
        const quelle = { "person.wochenstunden": "wochenstunden", "person.teilzeit": "teilzeit", "person.springer": "springer",
          "person.qualifikation": "qualifikationen", "person.schichtdienst": "imSchichtdienst" }[feld];
        if (quelle) expect(Object.prototype.hasOwnProperty.call(p, quelle), `${p.id} ${feld}`).toBe(true);
      }
    }
  });
  it("höhere Rolle erweitert das Paket nicht: Leitung und Planung haben dieselben Felder, beide ⊆ Positivliste", async () => {
    const felder = async (s) => new Set((await bilden({ sitzung: s, faktenquelle: vollQuelle })).paket.fakten.map((f) => f.feld));
    const l = await felder(S.leitung); const p = await felder(S.planer);
    expect([...l].sort()).toEqual([...p].sort());
    for (const f of l) expect(FUNKTIONEN.F3.felder).toContain(f);
    /* Die Leitung sieht E-Mail, Telefon, Schutzmerkmale — im Paket nichts davon. */
    const sicht = bestandFuerRolle(bestand(), S.leitung).mandanten[0];
    expect(sicht.personen.find((x) => x.id === "a1").email).toBeDefined();
    expect(sicht.personen.find((x) => x.id === "a1").mutterschutz).toBeDefined();
  });
  it("für jede Funktion: nur Felder der Positivliste; ohne Personenbezug kein Personen-Alias", async () => {
    for (const f of FUNKTIONEN_IDS) {
      const e = FUNKTIONEN[f];
      const { paket } = await bilden({ funktion: f, eingabe: e.felder.length ? { zeitraum: ZR } : {}, faktenquelle: vollQuelle });
      for (const x of paket.fakten) expect(e.felder, `${f}: ${x.feld}`).toContain(x.feld);
      if (!e.personenbezug) expect(JSON.stringify(paket), f).not.toMatch(/"P_[A-Z]{8}"/);
      expect(verbotenImPaket(paket), f).toEqual([]);
    }
  });
});

describe("Gesundheits- und Schutzmerkmale nie im Paket", () => {
  it("Abwesenheit nur „abwesend“, ohne Art, Grund, Anmerkung, Nachweis — auch Urlaub nicht", async () => {
    const { paket } = await bilden();
    const abw = paket.fakten.filter((f) => f.feld === "abwesenheit.zeitraum");
    expect(abw.length).toBe(3);
    for (const a of abw) expect(Object.keys(a).sort()).toEqual(["alias", "art", "bis", "datum", "feld", "id", "wert"]);
    expect(new Set(abw.map((a) => a.wert))).toEqual(new Set(["abwesend"]));
    /* auf den Zeitraum geschnitten */
    expect(abw.map((a) => [a.datum, a.bis]).sort()).toEqual([["2026-11-01", "2026-11-02"], ["2026-11-10", "2026-11-12"], ["2026-11-20", "2026-11-30"]]);
  });
  it("Schutzbefunde aus der Faktenquelle werden neutral „schutz“, ohne Fundstelle", async () => {
    const quelle = () => [
      { feld: "befund.regel", person: "a1", wert: "keineNacht", regel: { regelId: "keineNacht", pruefstatus: "geprueft", fundstelle: "Einsatzeinschränkung" } },
      { feld: "befund.regel", person: "a2", wert: "schutzWeich", regel: { regelId: "R_MUSCHG_5", pruefstatus: "geprueft", fundstelle: "§ 5 MuSchG" } },
      { feld: "kandidat.hinderung", person: "a1", wert: "maxDiensteWoche" },
      { feld: "befund.regel", person: "a3", wert: "JArbSchG_14", regel: { regelId: "ruhezeitGesetz", pruefstatus: "geprueft", fundstelle: "§ 14 JArbSchG" } },
    ];
    const { paket } = await bilden({ faktenquelle: quelle });
    const b = paket.fakten.filter((f) => f.feld === "befund.regel" || f.feld === "kandidat.hinderung");
    expect(b.length).toBe(4);
    for (const x of b) expect(x.wert).toBe("schutz");
    expect(b.filter((x) => x.regel).map((x) => x.regel.fundstelle)).toEqual([undefined, undefined, undefined]);
    expect(JSON.stringify(paket)).not.toMatch(/MuSchG|JArbSchG|Einsatzeinschr|keineNacht|maxDienste/);
  });
  it("befundNeutral: Katalog-Schutzbefunde und schutzartige Kennungen", () => {
    for (const k of ["schutz", "schutzWeich", "schutzOffen", "schutzHinweis", "keineNacht", "keinAlleindienst", "maxDiensteWoche",
      "R_MUSCHG_NACHT", "jarbschg-14", "SGB_IX", "wiedereingliederung"]) expect(befundNeutral(k), k).toBe("schutz");
    for (const k of ["ruhezeitGesetz", "folge", "abwesend", "qualifikationBetrieblich", "R-WE-2"]) expect(befundNeutral(k), k).toBe(k);
  });
  it("reine Statusnachweise (Masernschutz) fehlen, auch in der Leitungssicht", async () => {
    const { paket } = await bilden({ funktion: "F7A" });
    expect(paket.fakten.filter((f) => f.feld === "qualifikation.vorhanden").map((f) => f.ref).sort()).toEqual(["hilfe", "pfk"]);
    const p3 = await bilden();
    expect(p3.paket.fakten.filter((f) => f.feld === "person.qualifikation").map((f) => f.wert).sort()).toEqual(["hilfe", "pfk"]);
  });
  it("ausgeschiedene Personen gehören nicht zum Zeitraum; ihre Einteilungen auch nicht", async () => {
    const { paket, aliasKarte } = await bilden();
    expect(paket.fakten.filter((f) => f.feld === "person.vorhanden").length).toBe(7);
    expect(paket.fakten.filter((f) => f.feld === "schicht.dienst").length).toBe(3);
    expect(paket.fakten.filter((f) => f.feld === "schicht.frei").length).toBe(1);
    expect(paket.fakten.map((f) => f.alias)).not.toContain(aliasKarte.alias("person", "alt1"));
  });
});

describe("Freitext standardmäßig nicht", () => {
  it("Notizen, Tagesnotizen, Dienstbuch, Übergaben, Anträge, Bestätigungsgründe: nie im Paket", async () => {
    for (const f of MIT_FELDERN) expect(verbotenImPaket((await bilden({ funktion: f, faktenquelle: vollQuelle })).paket), f).toEqual([]);
  });
  it("Fremdtext an eine Funktion ohne Zulassung → KI_EINGABE", async () => {
    for (const f of FUNKTIONEN_IDS.filter((x) => !FUNKTIONEN[x].fremdtext))
      expect(await code(bilden({ funktion: f, eingabe: { zeitraum: ZR, fremdtext: ["Hallo"] } })), f).toBe("KI_EINGABE");
  });
  it("zugelassener Fremdtext wird bereinigt und gekapselt; mit Klarnamen oder Gesundheitsbegriff → KI_LECK", async () => {
    const { paket } = await bilden({ funktion: "F5", eingabe: { fremdtext: ["Teamtreffen <b>Montag</b> 14:00"] } });
    expect(paket.fremdtext).toEqual([{ kapselId: "k0", text: "Teamtreffen Montag 14:00" }]);
    expect(await code(bilden({ funktion: "F5", eingabe: { fremdtext: ["Anna Weberknecht fällt aus"] } }))).toBe("KI_LECK");
    expect(await code(bilden({ funktion: "F16", eingabe: { zeitraum: ZR, fremdtext: ["Keine Nachtdienste für Schwangere"] } }))).toBe("KI_LECK");
    expect(await code(bilden({ funktion: "F9", eingabe: { fremdtext: ["Meine Mail: anna@example.org"] } }))).toBe("KI_LECK");
  });
});

describe("Positivliste kann über die Faktenquelle nicht umgangen werden", () => {
  it("unbekanntes Feld, Sicht-Feld, fremdes Feld, unsichtbare Person, fremde Einheit, Zusatzschlüssel, falscher Typ → verworfen", async () => {
    const quelle = () => [
      { feld: "person.email", person: "a1", wert: "x" },                       // nicht im Katalog
      { feld: "person.wochenstunden", person: "a1", wert: 99 },                // Sicht-Feld: nur der Bildner liest es
      { feld: "kennzahl.wert", person: "a1", wert: 1, ref: "k" },              // Feld trägt keine Person
      { feld: "konto.saldo", person: "fremd-99", wert: 1 },                    // Person nicht in der Sicht
      { feld: "besetzung.ist", einheit: "e-anderer-betrieb", wert: 3 },        // Einheit nicht in der Sicht
      { feld: "konto.saldo", person: "a1", wert: 1, notiz: "krank" },          // Zusatzschlüssel
      { feld: "konto.saldo", person: "a1", wert: "viel" },                     // falscher Typ
      { feld: "befund.stufe", person: "a1", wert: "krank" },                   // Zustand nicht im Vokabular
      { feld: "kandidat.spielraum", wert: 5 },                                 // Pflicht-Person fehlt
      { feld: "ruhezeit.ist", person: "a1", wert: 600, datum: "2027-01-01" },  // außerhalb des Zeitraums
      Object.assign(Object.create({ geerbt: 1 }), { feld: "konto.saldo", person: "a1", wert: 1 }), // kein einfaches Objekt
      "konto.saldo", null, 42,
    ];
    const ereignisse = [];
    const { paket } = await bilden({ faktenquelle: quelle, audit: (e) => ereignisse.push(e) });
    expect(paket.fakten.filter((f) => FELDER[f.feld].herkunft === "berechnet")).toEqual([]);
    expect(paket.fakten.filter((f) => f.feld === "person.wochenstunden").map((f) => f.wert).sort()).toEqual([20, 30, 30, 35, 38.5, 39, 40]);
    expect(ereignisse.at(-1)).toMatchObject({ art: "ki.faktenpaket.gebildet", verworfen: 14 });
  });
  it("ohne Personenbezug (F4) verwirft der Bildner jede Person, auch an optionalen Feldern", async () => {
    const { paket } = await bilden({ funktion: "F4", faktenquelle: () => [{ feld: "befund.stufe", person: "a1", wert: "recht" },
      { feld: "befund.stufe", wert: "achtung" }] });
    expect(paket.fakten.filter((f) => f.feld === "befund.stufe")).toEqual([expect.objectContaining({ wert: "achtung" })]);
    expect(JSON.stringify(paket)).not.toMatch(/P_[A-Z]{8}/);
  });
  it("Klarname, Kontakt oder rohe Kennung als Wert der Faktenquelle → KI_LECK", async () => {
    for (const [feld, wert, ref] of [["regel.art", "Weberknecht", undefined], ["kennzahl.wert", 1, "Nguyen"],
      ["kennzahl.wert", 1, "a1"], ["regel.art", "zaehlregel", "Sonnenhof"], ["kennzahl.wert", 100234, "k"]]) {
      expect(await code(bilden({ funktion: "F17", faktenquelle: () => [{ feld, wert, ...(ref ? { ref } : {}) }] })), `${wert} ${ref}`)
        .toBe("KI_LECK");
    }
  });
});

describe("Leck-Prüfung fail closed, Audit ohne Inhalt", () => {
  it("bei Verdacht: kein Paket, genau ein Audit-Ereignis mit Kategorien, ohne Wert, Raum oder Person", async () => {
    const ereignisse = [];
    const c = await code(bilden({ funktion: "F17", audit: (e) => ereignisse.push(e),
      faktenquelle: () => [{ feld: "regel.art", wert: "zaehlregel", ref: "Weberknecht" }, { feld: "kennzahl.wert", wert: 1, ref: "Diagnose" }] }));
    expect(c).toBe("KI_LECK");
    expect(ereignisse.length).toBe(1);
    const e = ereignisse[0];
    expect(Object.keys(e).sort()).toEqual(["anzahl", "art", "funktion", "kategorien", "rolle"]);
    expect(e).toMatchObject({ art: "ki.faktenpaket.verworfen", funktion: "F17", rolle: "leitung" });
    expect(e.kategorien).toEqual(["GESUNDHEIT", "KLARNAME"]);
    expect(fold(JSON.stringify(e))).not.toMatch(/weber|diagnose|raum-a|l1|m1/);
    expect(Object.isFrozen(e)).toBe(true);
  });
  it("ein werfendes Audit ändert nichts: weiterhin KI_LECK bzw. Paket", async () => {
    const boese = () => { throw new Error("Audit kaputt"); };
    expect(await code(bilden({ funktion: "F17", audit: boese, faktenquelle: () => [{ feld: "regel.art", wert: "Weberknecht" }] }))).toBe("KI_LECK");
    expect(await code(bilden({ audit: boese }))).toBe("ok");
  });
  it("eine Kennung, die zufällig wie ein Name aussieht (Dienstart „Anna“), verwirft das Paket statt es durchzulassen", async () => {
    const b = betrieb(); b.dienstarten.push({ id: "Anna", start: "08:00", ende: "12:00" });
    expect(await code(bilden({ ladeBestand: () => bestand(b) }))).toBe("KI_LECK");
  });
});

describe("Mandantentrennung", () => {
  it("der Bestand wird nur mit dem Raum der Sitzung geladen", async () => {
    const geladen = [];
    await bilden({ ladeBestand: (r) => { geladen.push(r); return bestand(); } });
    expect(geladen).toEqual(["raum-a"]);
  });
  it("Raum, Betrieb oder Rolle in der Eingabe → KI_EINGABE", async () => {
    for (const x of [{ raum: "raum-b" }, { betrieb: 1 }, { rolle: "leitung" }, { mandant: "m2" }])
      expect(await code(bilden({ eingabe: { zeitraum: ZR, ...x } })), JSON.stringify(x)).toBe("KI_EINGABE");
  });
  it("Betrieb gehört zu einem anderen Raum, ungültiger oder fehlender Index → KI_NICHT_GEFUNDEN (kein Rückfall)", async () => {
    const fremd = { ...betrieb(), raum: "raum-b" };
    expect(await code(bilden({ ladeBestand: () => bestand(fremd) }))).toBe("KI_NICHT_GEFUNDEN");
    expect(await code(bilden({ sitzung: { ...S.leitung, betrieb: 5 } }))).toBe("KI_NICHT_GEFUNDEN");
    expect(await code(bilden({ sitzung: { ...S.leitung, betrieb: "x" } }))).toBe("KI_NICHT_GEFUNDEN");
    expect(await code(bilden({ sitzung: { ...S.leitung, betrieb: undefined }, ladeBestand: () => bestand(betrieb(), betrieb("m2", "Haus Zwei")) })))
      .toBe("KI_NICHT_GEFUNDEN");
    expect(await code(bilden({ ladeBestand: () => ({ mandanten: [] }) }))).toBe("KI_NICHT_GEFUNDEN");
    expect(await code(bilden({ ladeBestand: () => null }))).toBe("KI_NICHT_GEFUNDEN");
  });
  it("Betrieb 1 der Sitzung: nur dessen Personen; Bezug auf eine Person des anderen Betriebs → KI_NICHT_GEFUNDEN", async () => {
    const zwei = betrieb("m2", "Haus Zwei");
    zwei.personen = [{ id: "z1", vorname: "Xaver", nachname: "Zwiebel", rolle: "leitung", wochenstunden: 40 }];
    const lade = () => bestand(betrieb(), zwei);
    const { paket } = await bilden({ sitzung: sitzung("leitung", "z1", { betrieb: 1 }), ladeBestand: lade });
    expect(paket.fakten.filter((f) => f.feld === "person.vorhanden").length).toBe(1);
    expect(await code(bilden({ sitzung: sitzung("leitung", "z1", { betrieb: 1 }), ladeBestand: lade, bezug: { personId: "a1" } })))
      .toBe("KI_NICHT_GEFUNDEN");
    const ok = await bilden({ bezug: { personId: "a1", datum: "2026-11-03", schichtId: "F" } });
    expect(ok.paket.bezug).toEqual({ alias: ok.aliasKarte.alias("person", "a1"), datum: "2026-11-03", ref: "F" });
  });
  it("gleiche Daten, gleicher Kontext und Schlüssel in zwei Räumen → keine gemeinsamen Alias", async () => {
    const a = await bilden();
    const b = await bilden({ sitzung: { ...S.leitung, bestand: "raum-b" } });
    const alias = (p) => new Set(p.fakten.flatMap((f) => [f.alias, f.bezugAlias]).filter(Boolean));
    const aa = alias(a.paket); const bb = alias(b.paket);
    expect([...aa].filter((x) => bb.has(x))).toEqual([]);
    expect(a.paket.fakten.length).toBe(b.paket.fakten.length);
  });
  it("Raum, Betriebskennung und Betriebsname stehen nie im Paket; die Alias-Karte auch nicht", async () => {
    const { paket, aliasKarte } = await bilden({ faktenquelle: vollQuelle });
    const s = JSON.stringify(paket);
    expect(s).not.toMatch(/raum-a|"m1"|Sonnenhof/);
    expect(s).not.toContain("aliasKarte");
    expect(Object.values(paket)).not.toContain(aliasKarte);
    expect(aliasKarte.raum).toBe("raum-a");
  });
});

describe("Eingabe, Grenzen, Determinismus", () => {
  it("Pflichtangaben fehlen → passende Codes", async () => {
    expect(await code(bilden({ sitzung: { ...S.leitung, bestand: "" } }))).toBe("KI_NICHT_ANGEMELDET");
    expect(await code(bilden({ sitzung: { ...S.leitung, person: undefined } }))).toBe("KI_NICHT_ANGEMELDET");
    expect(await code(bilden({ sitzung: null }))).toBe("KI_NICHT_ANGEMELDET");
    expect(await code(bilden({ funktion: "F99" }))).toBe("KI_FUNKTION");
    expect(await code(bilden({ funktion: "__proto__" }))).toBe("KI_FUNKTION");
    expect(await code(bilden({ eingabe: {} }))).toBe("KI_EINGABE");
    expect(await code(bilden({ eingabe: { zeitraum: { von: "2026-11-01", bis: "2027-01-15" } } }))).toBe("KI_EINGABE");
    expect(await code(bilden({ eingabe: { zeitraum: { von: "2026-11-30", bis: "2026-11-01" } } }))).toBe("KI_EINGABE");
    expect(await code(bilden({ versionen: undefined }))).toBe("KI_EINGABE");
    expect(await code(bilden({ versionen: { ...VERSIONEN, extra: "1" } }))).toBe("KI_EINGABE");
    expect(await code(bilden({ kontext: "" }))).toBe("KI_EINGABE");
    expect(await code(bilden({ aliasSchluessel: undefined }))).toBe("KI_ALIAS_SCHLUESSEL");
    expect(await code(bilden({ bezug: { raum: "x" } }))).toBe("KI_EINGABE");
  });
  it("zu viele Fakten → KI_EINGABE, nichts wird still gekürzt", async () => {
    const viel = () => Array.from({ length: FAKTEN_MAX + 1 }, (_, i) => ({ feld: "kennzahl.wert", wert: i, ref: `k${i}` }));
    expect(await code(bilden({ funktion: "F17", faktenquelle: viel }))).toBe("KI_EINGABE");
  });
  it("gleiche Eingabe → gleiches Paket; anderer Kontext → andere Alias, gleiche Fakten", async () => {
    const a = await bilden({ faktenquelle: vollQuelle });
    const b = await bilden({ faktenquelle: vollQuelle });
    expect(b.paket).toEqual(a.paket);
    const c = await bilden({ faktenquelle: vollQuelle, kontext: "auftrag-2" });
    expect(c.paket).not.toEqual(a.paket);
    const ohneAlias = (p) => p.fakten.map(({ alias: _a, bezugAlias: _b, id: _i, ...r }) => JSON.stringify(r)).sort();
    expect(ohneAlias(c.paket)).toEqual(ohneAlias(a.paket));
  });
  it("Paket tief eingefroren; Datum, Zeiten und Zahlen unverändert (deterministische Gegenrechnung)", async () => {
    const { paket } = await bilden();
    expect(Object.isFrozen(paket)).toBe(true);
    expect(Object.isFrozen(paket.fakten[0])).toBe(true);
    const nacht = paket.fakten.filter((f) => f.ref === "N" && f.feld.startsWith("dienstart.")).map((f) => [f.feld, f.wert]).sort();
    expect(nacht).toEqual([["dienstart.beginn", "21:15"], ["dienstart.dauer", 540], ["dienstart.ende", "06:15"]]);
    expect(paket.fakten.filter((f) => f.feld === "person.wochenstunden").map((f) => f.wert)).toContain(38.5);
  });
});

/* ------------------------------------------------------------------------
   PROPERTY-TESTS (eigener, fest gesäter Zufall — reproduzierbar)
   ------------------------------------------------------------------------ */
function zufall(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const VORNAMEN = ["Mehmet", "Svetlana", "Björn", "Chantal", "Grzegorz", "Ingrid", "Leonie", "Ömer", "Rüdiger", "Yusuf", "Åsa", "Thi Mai",
  "Zoë", "Jürgen", "Małgorzata", "François"];
const NACHNAMEN = ["Papadopoulos", "Öztürk", "Schäfer", "Kowalczyk", "Nguyen", "Müller-Lüdenscheidt", "Hoffmann", "Wójcik", "Fernández",
  "Krüger", "Abdullah", "Østergaard", "Weißenfels", "Brückner"];
const GESUNDHEIT = ["Krankmeldung wegen Grippe", "Diagnose F32.1", "schwanger seit Mai", "GdB 50, Merkzeichen G", "Mutterschutz ab 01.12.",
  "Wiedereingliederung nach Hamburger Modell", "Arzttermin Dienstag", "Burnout", "AU bis Freitag", "Einwilligung Nachtarbeit"];
const pick = (r, l) => l[Math.floor(r() * l.length)];
const hex = (r, n) => Array.from({ length: n }, () => Math.floor(r() * 16).toString(16)).join("");

function zufallsBetrieb(seed) {
  const r = zufall(seed);
  const tag = (n) => `2026-11-${String(1 + (n % 30)).padStart(2, "0")}`;
  const einheiten = Array.from({ length: 1 + Math.floor(r() * 3) }, (_, i) => ({ id: `e${hex(r, 6)}${i}`, name: `Station ${pick(r, NACHNAMEN)}` }));
  einheiten.push({ id: `pool${hex(r, 4)}`, name: "Springerpool", pool: true });
  const personen = Array.from({ length: 3 + Math.floor(r() * 10) }, (_, i) => {
    const e = pick(r, einheiten).id;
    const p = { id: `id-${hex(r, 8)}-${i}`, vorname: pick(r, VORNAMEN), nachname: pick(r, NACHNAMEN), rolle: i === 0 ? "leitung" : i === 1 ? "planer" : "mitarbeiter",
      bereich: e, zugehoerigkeit: [{ ab: "2020-01-01", einheitId: e }], wochenstunden: Math.round(r() * 40 * 2) / 2,
      email: `${hex(r, 5)}.${pick(r, ["x", "y"])}@${pick(r, ["example.org", "mail.example"])}`, telefon: `+49 1${hex(r, 2).replace(/\D/g, "7")}${Math.floor(r() * 1e7)}`,
      personalnummer: String(100000 + Math.floor(r() * 899999)), geburtsdatum: `19${60 + Math.floor(r() * 40)}-0${1 + Math.floor(r() * 9)}-1${Math.floor(r() * 9)}`,
      iban: `DE${Math.floor(10 + r() * 89)}3704004405320130${Math.floor(r() * 90 + 10)}`, notiz: pick(r, GESUNDHEIT),
      mutterschutz: r() < 0.3, schwerbehindert: r() < 0.3 ? { grad: 50 } : false,
      einschraenkungen: r() < 0.5 ? { keineNacht: true, wiedereingliederung: { stunden: 20 } } : {},
      mutterschutzEinwilligungen: r() < 0.3 ? [{ art: "nacht" }] : undefined, kalenderGeheim: hex(r, 40),
      pushSchluessel: { endpoint: `https://push.example/${hex(r, 12)}` }, qualifikationen: r() < 0.5 ? ["pfk", "masern"] : ["hilfe"],
      teilzeit: r() < 0.5, springer: r() < 0.2 };
    return p;
  });
  const abweichungen = {};
  const abwesenheiten = [];
  for (const p of personen) {
    for (let n = 0; n < 8; n++) abweichungen[`${p.id}|${tag(Math.floor(r() * 30))}`] = pick(r, ["F", "S", "N", "-"]);
    if (r() < 0.6) {
      const v = Math.floor(r() * 25);
      abwesenheiten.push({ id: hex(r, 6), personId: p.id, von: tag(v), bis: tag(v + Math.floor(r() * 4)), art: pick(r, ["krank", "mutterschutz", "urlaub", "elternzeit", "beschaeftigungsverbot"]),
        grund: pick(r, GESUNDHEIT), anmerkung: `${p.vorname} ${pick(r, GESUNDHEIT)}` });
    }
  }
  const m = { id: `m-${hex(r, 6)}`, name: `Pflegeheim ${pick(r, NACHNAMEN)}hof`, einheiten,
    dienstarten: [{ id: "F", start: "06:00", ende: "14:00" }, { id: "S", start: "14:00", ende: "22:00" }, { id: "N", start: "22:00", ende: "06:00" }],
    qualifikationen: [{ id: "pfk" }, { id: "hilfe" }, { id: "masern", nurStatus: true }], personen, abweichungen, abwesenheiten,
    notizen: { [`${personen[0].id}|${tag(3)}`]: `${personen[2].vorname} ${pick(r, GESUNDHEIT)}` },
    einsatzorte: [{ id: "o1", name: "Haus Ost", lat: 53 + r(), lng: 8 + r(), radius: 100 }] };
  return { m, raum: `raum-${hex(r, 8)}`, r };
}
const sensibleWerte = (m, raum) => {
  const w = [raum, m.id, m.name];
  for (const p of m.personen) w.push(p.id, p.vorname, p.nachname, p.email, p.telefon, p.personalnummer, p.geburtsdatum, p.iban,
    p.kalenderGeheim, p.pushSchluessel.endpoint);
  for (const e of m.einheiten) w.push(e.id, e.name);
  for (const g of GESUNDHEIT) w.push(g);
  w.push("krank", "mutterschutz", "elternzeit", "beschaeftigungsverbot", "masern", "wiedereingliederung");
  return [...new Set(w)];
};
/* Aus der Sicht darf zusätzlich keine Abwesenheitsart, keine Einschränkung und kein Notizfeld kommen. (Als Regelart des
   Rechenkerns ist „urlaub" dagegen eine zulässige Kennung — deshalb nicht in der Liste der feindlichen Quelle.) */
const sensibleWerteSicht = (m, raum) => [...sensibleWerte(m, raum), "urlaub", "keineNacht", "notiz", "anmerkung", "grund"];
const enthaelt = (paket, werte) => {
  const s = fold(JSON.stringify(paket));
  const sw = ` ${s.replace(/[^a-z0-9]+/g, " ")} `;
  return werte.filter((v) => {
    const f = fold(v);
    if (f.length >= 4) return s.includes(f) || sw.replace(/ /g, "").includes(f.replace(/[^a-z0-9]+/g, "")) && f.replace(/[^a-z0-9]+/g, "").length >= 6;
    return sw.includes(` ${f.replace(/[^a-z0-9]+/g, " ").trim()} `);
  });
};

describe("Property-Tests: zufällige Betriebe mit Klarnamen und Gesundheitsdaten", () => {
  it("kein Paket (über alle Funktionen, Leitung und Planung, 24 Betriebe) enthält einen sensiblen Wert", async () => {
    let gebildet = 0; let verworfen = 0;
    for (let seed = 1; seed <= 24; seed++) {
      const { m, raum } = zufallsBetrieb(seed);
      const werte = sensibleWerteSicht(m, raum);
      for (const [rolle, pid] of [["leitung", m.personen[0].id], ["planer", m.personen[1].id]]) {
        for (const f of FUNKTIONEN_IDS) {
          const e = FUNKTIONEN[f];
          if (!e.rollen.includes(rolle)) continue;
          try {
            const { paket } = await faktenpaketBilden({ sitzung: { rolle, person: pid, bestand: raum, betrieb: 0 },
              ladeBestand: () => ({ mandanten: [m] }), funktion: f, eingabe: e.felder.length ? { zeitraum: ZR } : {},
              kontext: `k-${seed}`, aliasSchluessel: SCHLUESSEL, versionen: VERSIONEN, faktenquelle: vollQuelle });
            expect(enthaelt(paket, werte), `seed ${seed} ${rolle} ${f}`).toEqual([]);
            expect(pruefeFaktenpaket(paket).ok).toBe(true);
            gebildet++;
          } catch (err) {
            expect(err.code, `seed ${seed} ${rolle} ${f}`).toBe("KI_LECK");
            verworfen++;
          }
        }
      }
    }
    /* Die Prüfung ist nicht nur deshalb dicht, weil sie alles verwirft. */
    expect(gebildet).toBeGreaterThan(verworfen * 5);
  }, 120000);
  it("eine feindliche Faktenquelle, die sensible Werte einschleust, kommt nie durch", async () => {
    let versuche = 0;
    for (let seed = 101; seed <= 130; seed++) {
      const { m, raum, r } = zufallsBetrieb(seed);
      const werte = sensibleWerte(m, raum);
      for (let i = 0; i < 6; i++) {
        const gift = pick(r, werte);
        const pos = pick(r, ["wert", "ref", "fundstelle"]);
        const quelle = () => [pos === "fundstelle"
          ? { feld: "befund.regel", wert: "folge", regel: { regelId: "folge", pruefstatus: "geprueft", fundstelle: String(gift).slice(0, 100) } }
          : pos === "wert" ? { feld: "regel.art", wert: String(gift).replace(/\s+/g, "_").slice(0, 60), ref: "r1" }
            : { feld: "kennzahl.wert", wert: 1, ref: String(gift).replace(/\s+/g, "_").slice(0, 60) }];
        versuche++;
        try {
          const { paket } = await faktenpaketBilden({ sitzung: { rolle: "leitung", person: m.personen[0].id, bestand: raum, betrieb: 0 },
            ladeBestand: () => ({ mandanten: [m] }), funktion: "F17", eingabe: { zeitraum: ZR }, kontext: "k", aliasSchluessel: SCHLUESSEL,
            versionen: VERSIONEN, faktenquelle: quelle });
          /* durchgekommen ist nur, was die Form nicht erfüllte und deshalb verworfen wurde */
          expect(enthaelt(paket, [gift]), `seed ${seed}: ${pos}`).toEqual([]);
        } catch (err) {
          expect(err.code).toBe("KI_LECK");
        }
      }
    }
    expect(versuche).toBe(180);
  }, 120000);
});
