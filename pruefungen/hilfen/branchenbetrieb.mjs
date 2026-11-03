/* ==========================================================================
   TESTHILFE BRANCHENMODULE (WP-19)

   Ein kleiner Gesamtbestand mit einem Betrieb, gebuchten Paketen und
   Moduleinstellungen, dazu der Schreibweg über den Server
   (bestandFuerRolle → ändern → zusammenfuehren), wie ihn die übrigen
   Rechteprüfungen gehen. Jedes Branchenmodul nutzt diese Hilfe für seine
   Rechte- und Aktivierungsfälle, statt eigene Betriebe zu bauen.
   ========================================================================== */
import { bestandFuerRolle, zusammenfuehren } from "../../server/lib/rechte.mjs";

/** Sitzungen je Rollenkürzel (Leitung, Kundenrolle, Planung, Schichtverantwortung, Beschäftigte, Betriebsrat). */
export const SITZUNGEN = Object.freeze({
  LT: { rolle: "leitung", person: "l1", betrieb: 0 },
  KD: { rolle: "kunde", person: "k1", betrieb: 0 },
  PL: { rolle: "planer", person: "p1", betrieb: 0 },
  SV: { rolle: "subplaner", person: "s1", betrieb: 0 },
  MA: { rolle: "mitarbeiter", person: "a1", betrieb: 0 },
  BR: { rolle: "betriebsrat", person: "b1", betrieb: 0 },
});

const person = (id, rolle) => ({ id, vorname: "V", nachname: `N${id}`, rolle, bereich: rolle === "mitarbeiter" || rolle === "subplaner" ? "e1" : "ALLE",
  status: "aktiv", geburtstag: "1980-01-01", zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }] });

/**
 * Ein Gesamtbestand mit einem Betrieb.
 * @param {{ pakete?: string[], branche?: string, branchenmodule?: Record<string, any> | undefined }} [o]
 */
export function branchenbestand({ pakete = [], branche = "sonstiges", branchenmodule } = {}) {
  const einstellungen = { ruhezeit: 11, maxFolge: 6 };
  if (branchenmodule !== undefined) einstellungen.branchenmodule = branchenmodule;
  return { version: 1, stand: 1, mandanten: [{ id: "m1", name: "Testbetrieb", branche, pakete,
    einheiten: [{ id: "e1", versatzTage: 0 }],
    dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00" }],
    zyklus: { tage: ["F", "F", "F", "F", "F", "-", "-"] }, anker: "2026-01-05",
    qualifikationen: [], einstellungen,
    personen: [person("l1", "leitung"), person("k1", "kunde"), person("p1", "planer"), person("s1", "subplaner"),
      person("a1", "mitarbeiter"), person("b1", "betriebsrat")],
    abweichungen: {}, nachrichten: [], anfragen: [], abwesenheiten: [], bestaetigungen: [] }] };
}

const kopie = (x) => JSON.parse(JSON.stringify(x));

/**
 * Schreibt als Rolle `r`: liest den Bestand so, wie der Server ihn der Rolle
 * ausliefert, ändert ihn und gibt das Ergebnis von zusammenfuehren zurück
 * (Bestand oder { verweigert }).
 */
export function schreibeAls(gesamt, r, aendern) {
  const s = kopie(bestandFuerRolle(gesamt, SITZUNGEN[r]));
  aendern(s.mandanten[0]);
  return zusammenfuehren(gesamt, s, SITZUNGEN[r]);
}
