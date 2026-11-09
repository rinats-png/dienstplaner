/* ==========================================================================
   IMP-4 — Ablauf des Dateiimports in der Oberfläche (reine Logik, ohne React)

   Schritte: wahl → pruefen (Spalten, Dublettenwahl) → vorschau → fertig.
   Die Regeln des Servers (IMP-3) sind maßgeblich; diese Datei erzwingt sie
   zusätzlich in der Oberfläche, damit die Person nie etwas anbieten sieht,
   das der Server ablehnen würde:

     - Keine automatische Überschreibung: Vorgabe ist nie „aktualisieren“;
       „aktualisieren“ gilt nur mit ausdrücklicher Bestätigung je Datensatz.
     - Dublettenvorschlag nur bei fehlender Personalnummer und nie nur über den
       Namen zum Überschreiben: bei Namenstreffer ist „aktualisieren“ nie wählbar.
     - Bei Personalnummer-Treffer ist „neu“ nicht wählbar (mandantenintern eindeutig).
     - Jede Änderung nach der Vorschau macht sie ungültig; die Übernahme braucht
       die Vorschau, ihren Bestätigungscode UND das ausdrückliche Häkchen.
     - Doppelklick: Während ein Schritt läuft, wird kein zweiter gestartet.

   Der Server wird nur über die Schnittstelle aus import-schnittstelle.js erreicht.
   ========================================================================== */

export const AKTIONEN = Object.freeze(["neu", "aktualisieren", "ueberspringen", "klaeren"]);
export const AKTION_TEXT = Object.freeze({
  neu: "Als neue Person anlegen",
  aktualisieren: "Bestehende Person aktualisieren",
  ueberspringen: "Überspringen",
  klaeren: "Noch klären (wird nicht übernommen)",
});

const MIT_NUMMER = ["personalnummer", "personalnummer-datei"];

/** Dublette ohne Personalnummer = bloßer Namenshinweis. */
export const istNamensVorschlag = (d) => !!(d && d.dublette && (d.dublette.art === "name" || d.dublette.art === "name-datei"));

/** Erklärung zur Dublette für die Person. Namensfälle sind ausdrücklich nur ein Vorschlag. */
export function dublettenText(d) {
  const a = d && d.dublette && d.dublette.art;
  if (a === "personalnummer") return "Diese Personalnummer gibt es im Betrieb bereits. Die Nummer ist im Betrieb eindeutig.";
  if (a === "personalnummer-datei") return "Diese Personalnummer steht in der Datei mehrfach.";
  if (a === "name") return "Vorschlag: Eine Person mit gleichem Vor- und Nachnamen gibt es schon. Ohne Personalnummer wird nichts zusammengeführt; bitte selbst prüfen.";
  if (a === "name-datei") return "Vorschlag: Gleicher Vor- und Nachname steht in der Datei mehrfach. Bitte selbst prüfen.";
  return "";
}

/** Welche Aktionen die Person für diesen Datensatz wählen darf (Server-Liste, zusätzlich gehärtet). */
export function aktionenFuer(d) {
  if (!d || !Array.isArray(d.erlaubt)) return ["ueberspringen"];
  const hatFehler = Array.isArray(d.fehler) && d.fehler.length > 0;
  const art = d.dublette && d.dublette.art;
  return AKTIONEN.filter((a) => d.erlaubt.includes(a))
    .filter((a) => !(a === "aktualisieren" && (hatFehler || art !== "personalnummer")))
    .filter((a) => !(a === "neu" && MIT_NUMMER.includes(art)))
    .filter((a) => !(hatFehler && a !== "ueberspringen"));
}

/** Startwerte: die Vorgabe des Servers; nie „aktualisieren“ (kein stilles Überschreiben). */
export function startEntscheidungen(datensaetze) {
  const aus = {};
  for (const d of datensaetze || []) {
    const erlaubt = aktionenFuer(d);
    const v = d.vorgabe === "aktualisieren" ? "klaeren" : d.vorgabe;
    aus[String(d.datensatz)] = erlaubt.includes(v) ? v : (erlaubt.includes("klaeren") ? "klaeren" : erlaubt[0]);
  }
  return aus;
}

/** Anfrage für /vorschau: Bestätigungen nur für Datensätze, die tatsächlich „aktualisieren“ sind. */
export function vorschauAnfrage({ vorgang, entscheidungen, bestaetigungen, einheitenAnlegen }) {
  const b = {};
  for (const [nr, aktion] of Object.entries(entscheidungen || {})) if (aktion === "aktualisieren" && bestaetigungen && bestaetigungen[nr] === true) b[nr] = true;
  return { vorgang, entscheidungen: { ...entscheidungen }, bestaetigungen: b, einheitenAnlegen: einheitenAnlegen === true };
}

/** Datensätze, die „aktualisieren“ gewählt haben, aber noch nicht ausdrücklich bestätigt sind. */
export const unbestaetigteAktualisierungen = (entscheidungen, bestaetigungen) =>
  Object.entries(entscheidungen || {}).filter(([nr, a]) => a === "aktualisieren" && !(bestaetigungen && bestaetigungen[nr] === true)).map(([nr]) => Number(nr));

const FEHLER_TEXT = {
  NETZ: "Keine Verbindung zum Server. Es wurde nichts übernommen.",
  DATEI_ZU_GROSS: "Die Datei ist zu groß (höchstens 10 MB).",
  ORG_EDIT_FEHLT: "Neue Einheiten oder Standorte darf nur die Leitung anlegen. Bitte die Einheit vorher anlegen lassen oder die Zeile überspringen.",
  KEINE_BERECHTIGUNG: "Den Import dürfen nur Leitung und Planung verwenden.",
  PFLICHTSPALTE_FEHLT: "Nachname, Vorname und Einheit müssen einer Spalte zugeordnet sein.",
  AKTUALISIERUNG_OHNE_BESTAETIGUNG: "Zum Aktualisieren bitte jede betroffene Person ausdrücklich bestätigen.",
  ENTSCHEIDUNG_UNZULAESSIG: "Diese Wahl ist für den Datensatz nicht zulässig.",
  BEREITS_UEBERNOMMEN: "Dieser Import wurde bereits übernommen.",
  DATEI_BEREITS_UEBERNOMMEN: "Diese Datei wurde in den letzten 30 Tagen schon übernommen.",
  VORSCHAU_VERALTET: "Der Bestand hat sich geändert. Bitte die Vorschau neu erstellen und prüfen.",
  NICHT_GEFUNDEN: "Der Importvorgang ist abgelaufen. Bitte die Datei erneut hochladen.",
  NICHTS_ZU_UEBERNEHMEN: "Es gibt nichts zu übernehmen.",
};
/** Satz für den Bildschirm: bevorzugt der Server-Satz (enthält nie Werte), sonst eigener Text. */
export const fehlerText = (r) => FEHLER_TEXT[r.code] || r.fehler || "Der Import ist fehlgeschlagen.";

const anfang = () => ({
  schritt: "wahl", laeuft: false, fehler: null, fehlercode: null,
  vorgang: null, art: "personal", format: null, blaetter: [], blatt: 0, dateiHinweise: [],
  spalten: [], zuordnung: {}, fehlendePflicht: [], datensaetze: [], zaehler: null,
  entscheidungen: {}, bestaetigungen: {}, einheitenAnlegen: false,
  vorschau: null, bestaetigungscode: null, bereit: false, bestaetigt: false, ergebnis: null,
});

export function erzeugeAblauf(schnittstelle) {
  let z = anfang();
  const hoerer = new Set();
  const setze = (teil) => { z = { ...z, ...teil }; for (const h of hoerer) h(z); };
  /* Ein laufender Schritt sperrt alle anderen (Doppelklick). */
  const exklusiv = async (fn) => {
    if (z.laeuft) return false;
    setze({ laeuft: true, fehler: null });
    try { return await fn(); } finally { setze({ laeuft: false }); }
  };
  /* Jede inhaltliche Änderung nach der Vorschau macht Vorschau und Bestätigung ungültig. */
  const verwerfeVorschau = () => ({ vorschau: null, bestaetigungscode: null, bereit: false, bestaetigt: false, schritt: z.schritt === "vorschau" ? "pruefen" : z.schritt });

  const analysieren = async (blatt, zuordnung) => {
    const r = await schnittstelle.analyse({ vorgang: z.vorgang, blatt, zuordnung });
    if (!r.ok) { setze({ fehler: fehlerText(r), fehlercode: r.code }); return false; }
    const d = r.daten;
    setze({ blatt, spalten: d.spalten || [], zuordnung: d.zuordnung || {}, fehlendePflicht: d.fehlendePflicht || [],
      datensaetze: d.datensaetze || [], zaehler: d.zaehler || null,
      entscheidungen: startEntscheidungen(d.datensaetze), bestaetigungen: {}, ...verwerfeVorschau(), schritt: "pruefen" });
    return true;
  };

  return {
    zustand: () => z,
    abonnieren: (f) => { hoerer.add(f); return () => hoerer.delete(f); },

    /** Datei wählen → Upload → Analyse des vorgeschlagenen Blatts. */
    hochladen: (datei, art = "personal") => exklusiv(async () => {
      if (!datei) return false;
      const r = await schnittstelle.upload(datei, art);
      if (!r.ok) { setze({ fehler: fehlerText(r), fehlercode: r.code }); return false; }
      const d = r.daten;
      setze({ ...anfang(), laeuft: true, vorgang: d.vorgang, art: d.art, format: d.format, blaetter: d.blaetter || [],
        dateiHinweise: d.hinweise || [] });
      return analysieren(Number.isInteger(d.vorgabeBlatt) ? d.vorgabeBlatt : 0, undefined);
    }),

    blattWaehlen: (blatt) => exklusiv(() => analysieren(blatt, undefined)),

    /** Spaltenzuordnung von Hand ändern; leer ("") entfernt die Zuordnung. */
    zuordnen: (feld, index) => exklusiv(() => {
      const neu = { ...z.zuordnung };
      if (index === "" || index === null || index === undefined) delete neu[feld]; else neu[feld] = Number(index);
      return analysieren(z.blatt, neu);
    }),

    /** Eine Wahl je Datensatz; nicht erlaubte Wahlen werden abgelehnt (false). */
    entscheiden: (nr, aktion) => {
      const d = z.datensaetze.find((x) => x.datensatz === Number(nr));
      if (!d || z.laeuft || !aktionenFuer(d).includes(aktion)) return false;
      const b = { ...z.bestaetigungen };
      if (aktion !== "aktualisieren") delete b[String(nr)];
      setze({ entscheidungen: { ...z.entscheidungen, [String(nr)]: aktion }, bestaetigungen: b, ...verwerfeVorschau() });
      return true;
    },
    /** Ausdrückliche Bestätigung, dass genau diese Person überschrieben werden darf. */
    bestaetigenAktualisierung: (nr, wert) => {
      if (z.laeuft || z.entscheidungen[String(nr)] !== "aktualisieren") return false;
      const b = { ...z.bestaetigungen };
      if (wert) b[String(nr)] = true; else delete b[String(nr)];
      setze({ bestaetigungen: b, ...verwerfeVorschau() });
      return true;
    },
    einheitenAnlegen: (wert) => { if (z.laeuft) return false; setze({ einheitenAnlegen: wert === true, ...verwerfeVorschau() }); return true; },

    vorschauErstellen: () => exklusiv(async () => {
      const offen = unbestaetigteAktualisierungen(z.entscheidungen, z.bestaetigungen);
      if (offen.length) { setze({ fehler: fehlerText({ code: "AKTUALISIERUNG_OHNE_BESTAETIGUNG" }), fehlercode: "AKTUALISIERUNG_OHNE_BESTAETIGUNG" }); return false; }
      const r = await schnittstelle.vorschau(vorschauAnfrage({ vorgang: z.vorgang, entscheidungen: z.entscheidungen,
        bestaetigungen: z.bestaetigungen, einheitenAnlegen: z.einheitenAnlegen }));
      if (!r.ok) { setze({ fehler: fehlerText(r), fehlercode: r.code }); return false; }
      setze({ schritt: "vorschau", vorschau: r.daten.vorschau, bestaetigungscode: r.daten.bestaetigung || null,
        bereit: r.daten.bereit === true, zaehler: r.daten.zaehler || z.zaehler, bestaetigt: false });
      return true;
    }),

    bestaetigtSetzen: (wert) => { if (z.laeuft || z.schritt !== "vorschau") return false; setze({ bestaetigt: wert === true }); return true; },

    zurueck: () => { if (z.laeuft || z.schritt !== "vorschau") return false; setze({ ...verwerfeVorschau(), schritt: "pruefen" }); return true; },

    /** Nur mit Vorschau, deren Code und ausdrücklichem Häkchen. */
    uebernehmen: () => exklusiv(async () => {
      if (z.schritt !== "vorschau" || !z.bereit || !z.bestaetigungscode || !z.bestaetigt) return false;
      const r = await schnittstelle.uebernahme({ vorgang: z.vorgang, bestaetigung: z.bestaetigungscode });
      if (!r.ok) {
        if (r.code === "VORSCHAU_VERALTET") setze({ ...verwerfeVorschau(), schritt: "pruefen" });
        setze({ fehler: fehlerText(r), fehlercode: r.code });
        return false;
      }
      setze({ schritt: "fertig", ergebnis: r.daten.zaehler || {}, vorschau: null, bestaetigungscode: null, bereit: false,
        datensaetze: [], entscheidungen: {}, bestaetigungen: {} });
      return true;
    }),

    /** Vorgang serverseitig verwerfen (Abbrechen/Schließen); Fehler dabei sind unkritisch (Frist 30 min). */
    verwerfen: async () => {
      const v = z.vorgang;
      const beendet = z.schritt === "fertig";
      z = anfang();
      for (const h of hoerer) h(z);
      if (v && !beendet) { try { await schnittstelle.verwerfen({ vorgang: v }); } catch { /* Frist räumt auf */ } }
      return true;
    },
  };
}
