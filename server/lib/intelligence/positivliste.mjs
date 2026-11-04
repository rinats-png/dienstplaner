/* ==========================================================================
   INTELLIGENCE — POSITIVLISTE JE FUNKTION (WP-I11)

   Für jede Intelligence-Funktion steht hier, welche Rollen ein Faktenpaket
   auslösen dürfen, welche Felder (aus felder.mjs) hinein dürfen, ob Personen
   überhaupt vorkommen dürfen und ob Fremdtext (Eingabe der Nutzerin, Datei)
   gekapselt mitgehen darf. Alles andere: verweigert.

   Grundsätze:
   - Default verweigern. Eine Funktion ohne Eintrag gibt es nicht; eine
     Rolle ohne Nennung darf nicht; ein Feld ohne Nennung geht nicht hinein.
   - Das Faktenpaket ist der SCHNITT aus Rollensicht (sicht.mjs) und dieser
     Liste, nie die Vereinigung. Eine höhere Rolle sieht mehr, bekommt aber
     kein Feld über diese Liste hinaus.
   - Betriebsrat und Betreiber lösen nie aus (ARCHITEKTUR-ABGLEICH 2.4).
   - Schichtverantwortung (Rolle `subplaner`): Default nein, Entscheidung B-5
     des Betreibers offen. Beschäftigte: nur F9 (Hilfe ohne Betriebsdaten).
   - Freitext geht standardmäßig nicht hinein. Nur wo die Funktion ohne die
     Eingabe der Nutzerin nicht arbeiten kann (F5, F6, F7A, F9, F16), darf
     Fremdtext gekapselt mit; er durchläuft dieselbe Leck-Prüfung.

   Rollen und Felder sind ein ERSTER Stand für die in I12–I17 und F1–F18
   absehbaren Kernfälle. Jede Änderung ist eine Code-Änderung mit Review:
   pruefungen/intelligence-positivliste.test.js hält den ganzen Inhalt als
   Abdruck fest und schlägt bei jeder Abweichung an.
   ========================================================================== */

import { FELDER, deepFreeze } from "./felder.mjs";
import { FUNKTIONEN_IDS } from "./schemas.mjs";

export const POSITIVLISTE_VERSION = "1.0";

/** Rollen, die nie ein Faktenpaket auslösen — gleich, was unten steht. */
export const NIE_AUSLOESEN = Object.freeze(["betriebsrat", "betreiber"]);
/** Rollen, die überhaupt in Frage kommen. `subplaner` und `kunde` fehlen bis
    zu einer Entscheidung (B-5) bewusst. */
export const ROLLEN_ERLAUBT = Object.freeze(["leitung", "planer", "mitarbeiter"]);

const PLANUNG = ["leitung", "planer"];
const DIENSTART = ["dienstart.beginn", "dienstart.ende", "dienstart.dauer"];
const BEFUND = ["befund.regel", "befund.stufe"];
const BESETZUNG = ["besetzung.ist", "besetzung.soll"];

/**
 * @typedef {{ name: string, klasse: "A"|"B"|"C"|"D", zweck: string, rollen: readonly string[],
 *   felder: readonly string[], personenbezug: boolean, fremdtext: boolean }} FunktionEintrag
 */

/** @type {Readonly<Record<string, Readonly<FunktionEintrag>>>} */
export const FUNKTIONEN = deepFreeze({
  F1: { name: "Plan-Erklärer", klasse: "B", zweck: "erklärt eine Planzelle: Dienst, Zeiten, Befunde der Person an diesem Tag",
    rollen: PLANUNG, personenbezug: true, fremdtext: false,
    felder: ["schicht.dienst", "schicht.frei", ...DIENSTART, "person.vorhanden", "person.einheit", "person.qualifikation",
      "person.wochenstunden", "abwesenheit.zeitraum", "einheit.vorhanden", ...BEFUND] },
  F2: { name: "Regel- und Verstoß-Erklärer", klasse: "A", zweck: "erklärt einen Regelbefund mit Regelkennung, Ist- und Sollwert",
    rollen: PLANUNG, personenbezug: true, fremdtext: false,
    felder: [...BEFUND, "schicht.dienst", ...DIENSTART, "person.vorhanden", "ruhezeit.ist", "konto.saldo"] },
  F3: { name: "Ausfall-Vorschlag", klasse: "A", zweck: "Ersatz bei Ausfall: Kandidaten, Near-Miss, Lösungswege aus dem Rechenkern",
    rollen: PLANUNG, personenbezug: true, fremdtext: false,
    felder: ["schicht.dienst", "schicht.frei", ...DIENSTART, "person.vorhanden", "person.einheit", "person.qualifikation",
      "person.wochenstunden", "person.teilzeit", "person.springer", "person.schichtdienst", "abwesenheit.zeitraum",
      "einheit.vorhanden", "einheit.pool", ...BEFUND, "kandidat.zulaessig", "kandidat.spielraum", "kandidat.hinderung",
      "konto.saldo", "ruhezeit.ist"] },
  F4: { name: "Leitungsbriefing", klasse: "C", zweck: "Lage des Betriebs als Kennzahlen, ohne Personen",
    rollen: ["leitung"], personenbezug: false, fremdtext: false,
    felder: ["kennzahl.wert", ...BESETZUNG, "befund.stufe", "einheit.vorhanden"] },
  F5: { name: "Nachrichten-Werkstatt", klasse: "B", zweck: "Entwurf aus Stichworten der Nutzerin; keine Betriebsdaten",
    rollen: PLANUNG, personenbezug: false, fremdtext: true, felder: [] },
  F6: { name: "Fragen an Daten", klasse: "B", zweck: "Frage der Nutzerin → geprüfte Abfrage; Ergebnis rechnet der Kern",
    rollen: PLANUNG, personenbezug: false, fremdtext: true, felder: ["kennzahl.wert"] },
  F7A: { name: "Altplan-Übernahme (Tabelle)", klasse: "D", zweck: "Spaltenköpfe und maskierte Beispiele → Dienstarten; Klarnamen bleiben lokal",
    rollen: PLANUNG, personenbezug: false, fremdtext: true, felder: [...DIENSTART, "qualifikation.vorhanden"] },
  F8: { name: "Schichtmodell-Analyse", klasse: "C", zweck: "Schichtfolge und Dienstarten bewerten, ohne Personen",
    rollen: PLANUNG, personenbezug: false, fremdtext: false,
    felder: [...DIENSTART, "zyklus.tag", "kennzahl.wert", "einheit.vorhanden"] },
  F9: { name: "Hilfe-Assistent", klasse: "B", zweck: "Antwort nur aus dem Handbuch; keine Betriebsdaten",
    rollen: ["leitung", "planer", "mitarbeiter"], personenbezug: false, fremdtext: true, felder: [] },
  F10: { name: "Personalansatz-Analyse", klasse: "C", zweck: "Bedarf und Besetzung je Einheit, ohne Personen",
    rollen: PLANUNG, personenbezug: false, fremdtext: false,
    felder: ["kennzahl.wert", ...BESETZUNG, "einheit.vorhanden", "einheit.pool"] },
  F11: { name: "Frühwarnungen", klasse: "C", zweck: "Engpässe als Kennzahlen; keine Vorhersage über Einzelne",
    rollen: PLANUNG, personenbezug: false, fremdtext: false,
    felder: ["kennzahl.wert", ...BESETZUNG, ...BEFUND, "einheit.vorhanden"] },
  F12: { name: "Abschluss-Assistent", klasse: "C", zweck: "Prüfliste zum Monatsabschluss: offene Befunde, Konten (Plan)",
    rollen: PLANUNG, personenbezug: true, fremdtext: false,
    felder: ["konto.saldo", ...BEFUND, "schicht.dienst", "person.vorhanden", "kennzahl.wert"] },
  F13: { name: "Planvorschlag", klasse: "C", zweck: "erklärt den Vorschlag des Planer-Kerns und vergleicht Varianten",
    rollen: PLANUNG, personenbezug: true, fremdtext: false,
    felder: ["schicht.dienst", "schicht.frei", ...DIENSTART, "person.vorhanden", "person.einheit", "person.qualifikation",
      "person.wochenstunden", "person.teilzeit", "abwesenheit.zeitraum", ...BEFUND, "kennzahl.wert", "einheit.vorhanden",
      "einheit.pool"] },
  F14: { name: "Was-wäre-wenn", klasse: "C", zweck: "erklärt die Folgen einer gedachten Änderung (gerechnet vom Kern)",
    rollen: PLANUNG, personenbezug: true, fremdtext: false,
    felder: ["kennzahl.wert", ...BEFUND, "schicht.dienst", ...BESETZUNG, "person.vorhanden"] },
  F15: { name: "Änderungsübersicht", klasse: "C", zweck: "Ereignisse seit dem letzten Besuch (deterministische Liste)",
    rollen: PLANUNG, personenbezug: true, fremdtext: false,
    felder: ["aenderung.art", "person.vorhanden", "dienstart.beginn", "dienstart.ende"] },
  F16: { name: "Regel-Übersetzer", klasse: "B", zweck: "Satz der Leitung → Eintrag im Regelbaukasten; Gesundheitsbegriffe werden abgelehnt",
    rollen: PLANUNG, personenbezug: false, fremdtext: true,
    felder: ["regel.art", "dienstart.beginn", "dienstart.ende", "qualifikation.vorhanden"] },
  F17: { name: "Regel-Konflikte erklären", klasse: "B", zweck: "warum nicht alle Vorgaben zugleich erfüllbar sind (kleinste Ursache vom Kern)",
    rollen: PLANUNG, personenbezug: false, fremdtext: false,
    felder: [...BEFUND, "regel.art", "kennzahl.wert"] },
  F18: { name: "Plan-Gutachten", klasse: "B", zweck: "Gutachtentext aus Kennzahlen und Befunden, kein Personen-Scoring",
    rollen: PLANUNG, personenbezug: false, fremdtext: false,
    felder: ["kennzahl.wert", ...BEFUND, ...BESETZUNG, ...DIENSTART] },
});

/** Funktionen, die (mit Fremdtext) NICHT freigeschaltet werden dürfen, bis
    die genannte Voraussetzung gebaut ist. Der Bildner verweigert ihren
    Fremdtext mit KI_FUNKTION; die Freischaltung (I13/I16) darf sie nicht
    anbieten. F7A: Spaltenköpfe und Beispiele einer fremden Tabelle tragen
    Klarnamen in beliebiger Form — die Leck-Prüfung allein genügt nicht
    (Review F7). */
export const FREISCHALTUNG_GESPERRT = deepFreeze({
  F7A: "serverseitige Maskierung der Tabelle vor der Leck-Prüfung fehlt",
});

/**
 * Der Eintrag einer Funktion — oder null (Default verweigern). Nur eigene
 * Felder des Katalogs; „__proto__", „toString" und Ähnliches gibt es nicht.
 * @param {unknown} funktion
 * @returns {Readonly<FunktionEintrag> | null}
 */
export function funktionEintrag(funktion) {
  if (typeof funktion !== "string" || !FUNKTIONEN_IDS.includes(funktion)) return null;
  if (!Object.prototype.hasOwnProperty.call(FUNKTIONEN, funktion)) return null;
  return FUNKTIONEN[funktion];
}

/** Darf diese Rolle die Funktion auslösen? Default nein. */
export function rolleDarf(eintrag, rolle) {
  if (!eintrag || typeof rolle !== "string") return false;
  if (NIE_AUSLOESEN.includes(rolle) || !ROLLEN_ERLAUBT.includes(rolle)) return false;
  return eintrag.rollen.includes(rolle);
}

/** Ist das Feld für die Funktion erlaubt (und überhaupt im Katalog)? Ob ein
    einzelner Fakt eine Person tragen darf, entscheidet zusätzlich
    `personenbezug` (faktenpaket.mjs). */
export function feldErlaubt(eintrag, feld) {
  return !!eintrag && typeof feld === "string" && Object.prototype.hasOwnProperty.call(FELDER, feld)
    && eintrag.felder.includes(feld);
}
