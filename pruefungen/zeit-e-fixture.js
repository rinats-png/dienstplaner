/* Gemeinsamer Bestand für pruefungen/zeit-e-zuschlaege-dst.test.js (WP-ZEIT, Teilpaket ZEIT-E / E6, Befund Z47).
   Ein Betrieb in Bayern, eine Person, Nachtdienste in der Herbst-Umstellungsnacht (Sa 24.10. → So 25.10.2026),
   über die Monatsgrenze auf Allerheiligen (Sa 31.10. → So 1.11.2026) und ein Frühdienst. Alle Ist-Zeiten bestätigt
   ohne eigene Zeiten (= Planzeit). Kein Netz, keine Uhr. */
export const OKT_ZEIT_E = "2026-10";
export const MAERZ_ZEIT_E = "2026-03";

export function zeitEBetrieb(A) {
  const m = A.leererMandant("ZeitE-Zuschlaege-Umstellungsnacht", "pflege");
  /* Feste Kennungen statt Zufalls-IDs der Anlage — die Hashes des Freezes müssen reproduzierbar sein. */
  const e1 = "e-zeit-e-umstellung-1";
  m.standorte = (m.standorte || []).map((s, i) => ({ ...s, id: `st-zeit-e-umstellung-${i + 1}` }));
  m.einheiten = m.einheiten.map((x, i) => (i === 0 ? { ...x, id: e1, standortId: m.standorte[0].id } : x));
  const ohneVorgabe = { mindest: { mo_do: 0, fr: 0, sa: 0, so: 0 }, mindestQual: {} };
  const F = { ...m.dienstarten[0], ...ohneVorgabe, id: "F", name: "Früh", kurz: "F", start: "06:00", ende: "14:00", pause: 30, form: "regel" };
  const N = { ...m.dienstarten[0], ...ohneVorgabe, id: "N", name: "Nacht", kurz: "N", start: "22:00", ende: "06:00", pause: 30, form: "regel" };
  m.id = "m-zeit-e";
  m.bundesland = "BY";
  /* Feiertage folgen dem Bundesland des Standorts der Einheit (landFuerEinheit) — hier ausdrücklich Bayern. */
  m.standorte = (m.standorte || []).map((s) => ({ ...s, bundesland: "BY" }));
  m.dienstarten = [F, N];
  m.einstellungen = { ...m.einstellungen, nachtVon: "23:00", nachtBis: "06:00" };
  m.zuschlaege = [
    { id: "z-n", art: "nacht", name: "Nacht", prozent: 25, aktiv: true },
    { id: "z-so", art: "sonntag", name: "Sonntag", prozent: 50, aktiv: true },
    { id: "z-ft", art: "feiertag", name: "Feiertag", prozent: 100, aktiv: true },
    { id: "z-sa", art: "samstag", name: "Samstag", prozent: 10, aktiv: true },
  ];
  m.personen = [{ ...A.zugangsPerson("mitarbeiter", e1, 1), id: "a1", vorname: "Vera", nachname: "Umstellung",
    personalnummer: "P-ZEITE-1", rolle: "mitarbeiter", eintritt: "2020-01-01", zugehoerigkeit: [{ ab: "2020-01-01", einheitId: e1 }],
    bereich: e1, imSchichtdienst: false, wochenstunden: 1, stundenuebertrag: 0 }];
  m.abweichungen = {
    "a1|2026-03-28": "N", // Sa → So 29.03. (Frühjahr, 23-Stunden-Tag)
    "a1|2026-10-05": "F",
    "a1|2026-10-24": "N", // Sa → So 25.10. (Herbst, 25-Stunden-Tag)
    "a1|2026-10-31": "N", // Sa → So 01.11. Allerheiligen (Monatsgrenze, Feiertag BY)
  };
  m.erfassung = {};
  for (const k of Object.keys(m.abweichungen)) m.erfassung[k] = { start: null, ende: null, bestaetigt: true, grund: "" };
  m.einstempeln = {}; m.abwesenheiten = []; m.anfragen = []; m.monatsabschluss = {};
  m.lohnarten = undefined;
  return m;
}
