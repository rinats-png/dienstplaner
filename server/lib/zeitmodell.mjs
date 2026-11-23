/* ==========================================================================
   ZEITMODELL — Lesekern für Stempel beider Zeitmodelle (WP-ZEIT, ZEIT-B Stufe 1, Schritt 2)

   Plan: docs/acc45/ZEIT-B-STUFE1-PLAN.md § 2.4, § 2.5, § 10 N2/N3 (bei Widerspruch gilt § 10).
   Vertrag: docs/acc45/ZEIT-BETRIEBSTAG-VERTRAG.md § 4.1, § 4.2, § 6.2.

   Schritt 2 ist wirkungsfrei: Kein Produktionscode bindet dieses Modul ein (Wächter in
   pruefungen/zeitmodell.test.js). Erst Schritt 3 (Fail-closed-Wächter) und Schritt 4 (Schreiber) nutzen es.

   Regeln:
   - zeitmodellVon ist TOTAL: Schlüssel fehlt oder undefined → 1; genau die Zahl 2 → 2; alles andere (null, 1, 3,
     "2", 2.5, NaN, Objekt, Array, true, kein Datensatz) → "UNBEKANNT" (fail-closed). Kein Schreiber setzt je
     zeitmodell 1 oder null; ein solcher Wert ist fremd und wird nie still als Modell 1 gedeutet.
   - Vollständige Signatur (N2) = eigene Felder zeitmodell, zeitzone, startKalendertag, zeitStart vorhanden und
     zeitStart.eingegangenAm vorhanden — unabhängig vom Wert von zeitmodell.
   - Regel Modell 2 gilt nur bei zeitmodellVon === 2 UND vollständiger Signatur. Nur dann wird zeitzone gelesen und
     geprüft (ERLAUBTE_ZONEN, sonst ZONE_UNBEKANNT, fail-closed).
   - N3: zeitmodell 2 ohne vollständige Signatur → Befund ZEITMODELL_SIGNATUR_UNVOLLSTAENDIG (Hinweis), Zone und
     Kalendertage nach der Modell-1-Regel, lesbar. zeitzone wird dann weder geprüft noch gelesen.
   - Modell-1-Regel (I6, T-LEG-1/2): Beginn = Schlüsseltag; Ende = endeDatum ?? Schlüsseltag; nie aus startAm/endeAm
     abgeleitet. Ein Gerätetag-Schlüssel aus der Zeit vor WP-17 gilt wie gespeichert.
   - Gemischt (Modell 2 mit Ende, ohne endeKalendertag; nur durch Altschreiber nach Rücksprung): Ende nach
     Modell-1-Regel, Befund ZEITMODELL_ENDE_ALT (Hinweis, rechnet weiter).
   - Ein Kalendertag, den es nicht gibt (kalendertagEcht), wird nie gerollt: KALENDERTAG_UNGUELTIG, fail-closed.
   - Die Leser schreiben nie zurück und lesen keine Uhr.
   - Es zählen nur eigene Felder (Object.hasOwn); ein Feld mit Wert undefined gilt als fehlend (JSON speichert es nie).
   ========================================================================== */
import { BETRIEBSZONE, zoneErlaubt, kalendertagEcht } from "./betriebszeit.mjs";

/** Ergebnis von zeitmodellVon für jeden Wert außer „fehlt“ und genau 2. */
export const UNBEKANNT = "UNBEKANNT";

/** Befundcodes der Leser. Hinweis = rechnet weiter; fail-closed = kein Kalendertag, keine Zone. */
export const BEFUND = Object.freeze({
  ZEITMODELL_UNBEKANNT: "ZEITMODELL_UNBEKANNT",                         // fail-closed
  ZONE_UNBEKANNT: "ZONE_UNBEKANNT",                                     // fail-closed (nur Modell 2, vollständig)
  KALENDERTAG_UNGUELTIG: "KALENDERTAG_UNGUELTIG",                       // fail-closed
  ZEITMODELL_ENDE_ALT: "ZEITMODELL_ENDE_ALT",                           // Hinweis
  ZEITMODELL_SIGNATUR_UNVOLLSTAENDIG: "ZEITMODELL_SIGNATUR_UNVOLLSTAENDIG", // Hinweis (N3)
  ZEITZONENVERLAUF_UNBEKANNT: "ZEITZONENVERLAUF_UNBEKANNT",             // fail-closed (zoneZum, Stufe 1)
});

/** Typwächter: ein Datensatz (Objekt, kein Array, nicht null). @param {unknown} e @returns {e is Record<string, any>} */
const istDatensatz = (e) => e !== null && typeof e === "object" && !Array.isArray(e);
/** Eigenes Feld mit einem Wert ungleich undefined. @param {Record<string, any>} o @param {string} k */
const hat = (o, k) => Object.hasOwn(o, k) && o[k] !== undefined;

/**
 * Zeitmodell eines Stempels: 1, 2 oder "UNBEKANNT" (total, fail-closed; Plan § 2.5).
 * @param {unknown} e @returns {1|2|"UNBEKANNT"}
 */
export function zeitmodellVon(e) {
  if (!istDatensatz(e)) return UNBEKANNT;
  if (!hat(e, "zeitmodell")) return 1;
  return e.zeitmodell === 2 ? 2 : UNBEKANNT;
}

/**
 * Vollständige Signatur (Plan § 10 N2): Feldpräsenz, unabhängig vom Wert von zeitmodell.
 * @param {unknown} e @returns {e is Record<string, any>}
 */
export function signaturVollstaendig(e) {
  if (!istDatensatz(e)) return false;
  if (!hat(e, "zeitmodell") || !hat(e, "zeitzone") || !hat(e, "startKalendertag") || !hat(e, "zeitStart")) return false;
  return istDatensatz(e.zeitStart) && hat(e.zeitStart, "eingegangenAm");
}

/**
 * „Beginn Modell 2“ für R-S2 (Plan § 2.2, § 10 N2): vollständige Signatur UND zeitmodellVon === 2 UND Zone erlaubt.
 * @param {unknown} e @returns {boolean}
 */
export function beginnModellZwei(e) {
  return signaturVollstaendig(e) && zeitmodellVon(e) === 2 && zoneErlaubt(e.zeitzone);
}

/** Gemeinsame Einordnung: welches Modell, welche Regel, welche Zone. */
function einordnen(e) {
  const modell = zeitmodellVon(e);
  const signatur = signaturVollstaendig(e);
  if (modell === UNBEKANNT) return { modell, signatur, regel: null, zone: null, befunde: [BEFUND.ZEITMODELL_UNBEKANNT] };
  if (modell === 2 && signatur) {
    if (!zoneErlaubt(e.zeitzone)) return { modell, signatur, regel: null, zone: null, befunde: [BEFUND.ZONE_UNBEKANNT] };
    return { modell, signatur, regel: 2, zone: e.zeitzone, befunde: [] };
  }
  /* Modell 1, oder N3 (Modell 2 ohne vollständige Signatur): Modell-1-Regel, zeitzone wird nicht gelesen. */
  return { modell, signatur, regel: 1, zone: BETRIEBSZONE,
    befunde: modell === 2 ? [BEFUND.ZEITMODELL_SIGNATUR_UNVOLLSTAENDIG] : [] };
}

/**
 * Zone eines Stempels (Plan § 2.5). Modell 1 und N3: BETRIEBSZONE, ein vorhandenes Feld zeitzone wird weder geprüft
 * noch gelesen. Modell 2 (vollständig): e.zeitzone, nicht erlaubt → zone null und ZONE_UNBEKANNT.
 * @param {unknown} e @returns {{zone: string|null, befunde: string[]}}
 */
export function zoneVon(e) {
  const r = einordnen(e);
  return { zone: r.zone, befunde: r.befunde };
}

/** Trägt der Datensatz ein Ende? Wie der bestehende Code (offen = `start && !ende`: monatsabschluss.mjs,
    selbstauskunft.mjs, daten.mjs) zählt nur ein truthy `ende` oder `endeAm`; null, "", 0, undefined = kein Ende
    (Plan § 10 D6). @param {Record<string, any>} e */
const hatEnde = (e) => (Object.hasOwn(e, "ende") && Boolean(e.ende)) || (Object.hasOwn(e, "endeAm") && Boolean(e.endeAm));

/** Ende nach Modell-1-Regel: endeDatum ?? Schlüsseltag (nie aus endeAm). undefined = unechter Kalendertag.
    @param {Record<string, any>} e @param {string} schluesselTag @returns {string|undefined} */
function endeModellEins(e, schluesselTag) {
  const d = e.endeDatum;
  if (d === null || d === undefined || !Object.hasOwn(e, "endeDatum")) return schluesselTag;
  return kalendertagEcht(d) ? d : undefined;
}

/**
 * Vollständiges Lesen eines Stempels unter seinem Schlüsseltag (Schichttag aus dem Schlüssel „personId|JJJJ-MM-TT“).
 * fail-closed (lesbar false): zone, start und ende sind null.
 * @param {unknown} e @param {string} schluesselTag
 * @returns {{modell: 1|2|"UNBEKANNT", signatur: boolean, regel: 1|2|null, lesbar: boolean, zone: string|null,
 *   start: string|null, ende: string|null, befunde: string[]}}
 */
export function stempelLesen(e, schluesselTag) {
  const r = einordnen(e);
  const zu = (befunde) => ({ modell: r.modell, signatur: r.signatur, regel: null, lesbar: false, zone: null,
    start: null, ende: null, befunde });
  if (r.regel === null) return zu(r.befunde);
  if (!kalendertagEcht(schluesselTag)) return zu([BEFUND.KALENDERTAG_UNGUELTIG]);
  /* regel 1 oder 2 setzt einen Datensatz voraus (einordnen: kein Datensatz → UNBEKANNT → regel null). */
  const d = /** @type {Record<string, any>} */ (e);
  const befunde = [...r.befunde];
  let start, ende = null;
  if (r.regel === 2) {
    start = d.startKalendertag;
    if (!kalendertagEcht(start)) return zu([BEFUND.KALENDERTAG_UNGUELTIG]);
    if (hat(d, "endeKalendertag")) {
      ende = d.endeKalendertag;
      if (!kalendertagEcht(ende)) return zu([BEFUND.KALENDERTAG_UNGUELTIG]);
    } else if (hatEnde(d)) {
      ende = endeModellEins(d, schluesselTag);
      if (ende === undefined) return zu([BEFUND.KALENDERTAG_UNGUELTIG]);
      befunde.push(BEFUND.ZEITMODELL_ENDE_ALT);
    }
  } else {
    start = schluesselTag;
    if (hatEnde(d)) {
      ende = endeModellEins(d, schluesselTag);
      if (ende === undefined) return zu([BEFUND.KALENDERTAG_UNGUELTIG]);
    }
  }
  return { modell: r.modell, signatur: r.signatur, regel: r.regel, lesbar: true, zone: r.zone, start, ende, befunde };
}

/**
 * Kalendertage eines Stempels (Plan § 2.5): Beginn und Ende („JJJJ-MM-TT“; ende null = kein Ende gestempelt).
 * @param {unknown} e @param {string} schluesselTag
 * @returns {{start: string|null, ende: string|null, befunde: string[]}}
 */
export function kalendertageVon(e, schluesselTag) {
  const r = stempelLesen(e, schluesselTag);
  return { start: r.start, ende: r.ende, befunde: r.befunde };
}

/**
 * Zone eines Betriebs zum Zeitpunkt (Plan § 2.4, Vertrag § 4.1 Absatz 2). Stufe 1 speichert keinen Verlauf: Fehlt
 * m.zeitzonenVerlauf, gilt die implizite Version 1 Europe/Berlin für jeden Zeitpunkt. Ist ein Verlauf gespeichert
 * (Daten aus einem späteren Bild), kann Stufe 1 ihn nicht deuten → fail-closed, nie still Berlin.
 * Der Zeitpunkt ist Pflicht (keine echte Uhr); ungültig → RangeError. Kein Betrieb → TypeError.
 * @param {object} m @param {Date|number|string} zeitpunkt
 * @returns {{version: 1, zone: string, implizit: true} | {version: null, zone: null, implizit: false, befund: string}}
 */
export function zoneZum(m, zeitpunkt) {
  if (!istDatensatz(m)) throw new TypeError("zoneZum: kein Betrieb.");
  const d = zeitpunkt instanceof Date ? zeitpunkt : new Date(zeitpunkt);
  if (zeitpunkt === undefined || zeitpunkt === null || !Number.isFinite(d.getTime())) throw new RangeError("Ungültiger Zeitpunkt.");
  if (!hat(m, "zeitzonenVerlauf")) return { version: 1, zone: BETRIEBSZONE, implizit: true };
  return { version: null, zone: null, implizit: false, befund: BEFUND.ZEITZONENVERLAUF_UNBEKANNT };
}
