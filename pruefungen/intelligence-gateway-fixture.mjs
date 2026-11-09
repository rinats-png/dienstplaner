/* Gemeinsame Prüfdaten für die Gateway-Tests (WP-I13/I15): ein Betrieb voller Personendaten, Rollen-Sitzungen, Faktenquelle. */
export const SCHLUESSEL = Buffer.from("5b0e9c1d7a3f48e26c1b9d0a4e7f3c2b8a6d1e9f0c3b7a5d2e8f1c4b6a9d0e3f", "hex");
export const VERSIONEN = { engine: "0.0.0-attrappe", regelstand: "r-2026-11", tarifstand: "t-2026" };
export const ZR = { von: "2026-11-01", bis: "2026-11-30" };
/** Gültige Namenspolitik (WP-I13, G18): ohne sie verweigert das Gateway jede Freitext-Funktion (F5, F6, F7A, F9, F16). */
export const NAMENSPOLITIK_TEST = Object.freeze({ version: "np-test", sperrliste: "betrieb", kurznamen: "sperren", doppelgaenger: "sperren", fremdeSchrift: "sperren", freigabe: "produktverantwortung" });
export const betrieb = (id = "m1", name = "Seniorenheim Sonnenhof") => ({
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
export const bestand = (...m) => ({ version: 1, stand: 1, session: null, mandanten: m.length ? m : [betrieb()] });
export const sitzung = (rolle, person, o = {}) => ({ rolle, person, bestand: "raum-a", betrieb: 0, ...o });
export const S = {
  leitung: sitzung("leitung", "l1"), planer: sitzung("planer", "pl1"), subplaner: sitzung("subplaner", "sv1"),
  mitarbeiter: sitzung("mitarbeiter", "a1"), betriebsrat: sitzung("betriebsrat", "br1"), betreiber: sitzung("betreiber", "betreiber"),
};
/** Eine Faktenquelle, die jedes berechnete Feld liefert (für alle Personen und Einheiten der Sicht). */
export const vollQuelle = ({ sicht }) => {
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
export const fold = (s) => String(s).toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
  .normalize("NFKD").replace(/[̀-ͯ]/g, "");
export const VERBOTEN_IM_PAKET = ["lena", "brandt", "piotr", "kowalski", "svetlana", "iwanowa", "anna", "weberknecht", "joerg",
  "mueller", "luedenscheidt", "nguyen", "gerda", "haberland", "kurt", "ausgeschieden", "sonnenhof", "lindenhof", "ahornweg",
  "elbblick", "raum-a", "@", "+49", "0151", "100234", "1990-05-12", "2009-02-02", "de8937", "lindenallee", "bremen",
  "mutterschutz", "schwanger", "arzt", "attest", "grippe", "diagnose", "krank", "rueckenschmerz", "kinderwunsch",
  "wiedereingliederung", "keinenacht", "einwilligung", "schwerbehind", "merkzeichen", "masern", "insulin", "siebert",
  "lehmann", "gestuerzt", "a3f1c9e0", "push.example", "53.07516", "8.80777", "notiz", "grund", "anmerkung", "\"l1\"",
  "\"pl1\"", "\"sv1\"", "\"a1\"", "\"a2\"", "\"a3\"", "\"br1\"", "\"alt1\"", "\"e1\"", "\"e2\"", "\"pool\"", "\"m1\"", "urlaub"];
export const verbotenImPaket = (paket) => {
  const s = fold(JSON.stringify(paket));
  return VERBOTEN_IM_PAKET.filter((v) => s.includes(fold(v)));
};
