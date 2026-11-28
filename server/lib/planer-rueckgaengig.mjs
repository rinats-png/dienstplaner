/* ==========================================================================
   PLANVORSCHLAG-ÜBERNAHME — RÜCKGÄNGIG-DATEN AM BETRIEB (WP-I7, Stufe 2)

   Die Vorwerte einer Übernahme (engine/planer-uebernahme.mjs, `rueckgaengig`) liegen nur auf dem Server: im Betrieb unter dem Feld
   `planerRueckgaengig` (Liste von Datensätzen). Das Feld steht bewusst in KEINEM Sichtkatalog (sicht.mjs BETRIEB/VOLL_BETRIEB/SCHICHT,
   Betreiber, Export, Vollausgabe): unbekannte Felder gehen an keine Rolle hinaus (RECHTEMATRIX „unbekannte neue Felder“), beim Speichern
   über PUT /api/bestand füllt der Server sie aus dem gespeicherten Stand zurück (rechte.mjs vollRueckfuellen) — mitgeschickt sind sie
   wirkungslos. Der Teilweg nimmt das Feld nie an (teilweg.mjs NUR_SERVER). Geschrieben wird es nur von der eigenen Server-Aktion
   (planer-aktion.mjs), im selben Schreibvorgang wie Patch, Änderungseinträge und Protokoll.

   Aufbewahrung (ANNAHME, Betreiberentscheidung offen — nicht als gesetzt behandeln): ein Datensatz gilt bis zu seinem Gebrauch
   (danach sofort entfernt, einmalig), längstens bis Monatsende des übernommenen Monats + RUECKGAENGIG_GRENZE.nachfristTage; ist der
   Monat vorher abgeschlossen, endet er dort (die Aktion räumt ihn beim nächsten Schreiben weg, der Datenschutzlauf nach Datum).
   Höchstens RUECKGAENGIG_GRENZE.saetze Datensätze je Betrieb; darüber fällt der älteste weg (kein Rückgängig mehr möglich).

   Rein und ohne Uhr (Tag als Eingabe), wirft nie.
   ========================================================================== */
import { addDays, dim_, pad } from "./regelwerk.mjs";

/** Feld am Betrieb (nur Server). */
export const RUECKGAENGIG_FELD = "planerRueckgaengig";
/** Grenzen: Datensätze je Betrieb, Nachfrist nach Monatsende in Tagen (Annahme, Betreiberentscheidung offen). */
export const RUECKGAENGIG_GRENZE = Object.freeze({ saetze: 10, nachfristTage: 7 });

const istObjekt = (x) => !!x && typeof x === "object" && !Array.isArray(x);
const MONAT = /^\d{4}-(0[1-9]|1[0-2])$/;
const TAG = /^\d{4}-\d{2}-\d{2}$/;
/** Kennung eines Datensatzes (vergibt die Aktion zufällig). */
export const RUECKGAENGIG_ID = /^pu-[0-9a-f]{32}$/;

/** Letzter Tag, an dem der Datensatz eines Monats noch gilt (Monatsende + Nachfrist). null bei ungültigem Monat. */
export function aufbewahrenBis(ym) {
  if (typeof ym !== "string" || !MONAT.test(ym)) return null;
  const j = Number(ym.slice(0, 4)), mo = Number(ym.slice(5, 7));
  return addDays(`${ym}-${pad(dim_(j, mo - 1))}`, RUECKGAENGIG_GRENZE.nachfristTage);
}

/** Datensätze des Betriebs (nur gültige Form; anderes zählt nicht). */
export function rueckgaengigListe(m) {
  const roh = istObjekt(m) && Array.isArray(m[RUECKGAENGIG_FELD]) ? m[RUECKGAENGIG_FELD] : [];
  return roh.filter((r) => istObjekt(r) && typeof r.id === "string" && RUECKGAENGIG_ID.test(r.id) && typeof r.ym === "string" && MONAT.test(r.ym));
}

/**
 * Welche Datensätze bleiben am Tag `heute` (JJJJ-MM-TT)? Fällig: ungültige Form, Frist überschritten (heute > aufbewahrenBis), und —
 * wenn `abgeschlossen(ym)` übergeben ist — abgeschlossene Monate.
 * @param {any} m Betrieb @param {string} heute @param {{ abgeschlossen?: (ym: string) => boolean }} [o]
 * @returns {{ rest: any[], faellig: number, vorhanden: boolean }}
 */
export function rueckgaengigFaellig(m, heute, o = {}) {
  const vorhanden = istObjekt(m) && Object.prototype.hasOwnProperty.call(m, RUECKGAENGIG_FELD);
  if (!vorhanden) return { rest: [], faellig: 0, vorhanden };
  const roh = Array.isArray(m[RUECKGAENGIG_FELD]) ? m[RUECKGAENGIG_FELD] : [];
  const gilt = (r) => {
    if (!rueckgaengigListe({ [RUECKGAENGIG_FELD]: [r] }).length) return false;
    const bis = aufbewahrenBis(r.ym);
    if (!bis || typeof heute !== "string" || !TAG.test(heute) || heute > bis) return false;
    try { if (typeof o.abgeschlossen === "function" && o.abgeschlossen(r.ym)) return false; } catch { return false; }
    return true;
  };
  const rest = roh.filter(gilt);
  return { rest, faellig: Array.isArray(m[RUECKGAENGIG_FELD]) ? roh.length - rest.length : 1, vorhanden };
}

/**
 * Für den Datenschutz-/Aufbewahrungslauf (aufbewahrung.mjs raeumen): der Betrieb ohne fällige Datensätze (nach Datum). Ohne das Feld
 * unverändert (dasselbe Objekt); leer geräumt entfällt das Feld.
 * @param {any} m @param {string} heute
 */
export function rueckgaengigRaeumen(m, heute) {
  const f = rueckgaengigFaellig(m, heute);
  if (!f.vorhanden || !f.faellig) return m;
  const { [RUECKGAENGIG_FELD]: _weg, ...ohne } = m; // eslint-disable-line no-unused-vars
  return f.rest.length ? { ...ohne, [RUECKGAENGIG_FELD]: f.rest } : ohne;
}
