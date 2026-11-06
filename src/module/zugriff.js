/* ==========================================================================
   ZUGRIFF DER BRANCHENMODULE-OBERFLÄCHEN (WP-19, Rechte)

   Der Basiskontext, den kern.jsx den Moduloberflächen gibt. Alles hier ist
   fail-closed: Eine unbekannte Rolle, eine fehlende Person oder eine fehlende
   Quelle ergibt „keiner“, null oder eine leere Angabe — nie mehr Sicht.

   Maßgeblich bleibt der Server (sicht.mjs liefert der Rolle nur ihre Daten);
   diese Stufen steuern nur, was die Ansicht aus dem Gelieferten zeigt.

   Die Serverrolle „kunde“ (eigener Datenraum) hat serverseitig die Rechte der
   Leitung; in den Ansichten der Branchenmodule gilt sie bis zur Entscheidung
   als „Kunde“ (keiner), wie in WACHBUCH_ZUGRIFF (WB-2). Vorläufig.
   ========================================================================== */
import { WACHBUCH_ZUGRIFF } from "../../server/lib/modul-wachbuch.mjs";
import { qualGueltig } from "../../server/lib/fachpruefung.mjs";

/** Serverrolle → Kürzel der Zugriffstabellen. */
export const ROLLE_KUERZEL = Object.freeze({ leitung: "LT", planer: "PL", subplaner: "SV", mitarbeiter: "MA", betriebsrat: "BR", kunde: "Kunde" });

const istObjekt = (x) => !!x && typeof x === "object" && !Array.isArray(x);

/** Zugriffsstufe des Wachbuchs für eine Rolle: voll | einheit | eigene | keiner (W4). @param {any} rolle */
export function wachbuchZugriffFuer(rolle) {
  const k = typeof rolle === "string" && Object.prototype.hasOwnProperty.call(ROLLE_KUERZEL, rolle) ? ROLLE_KUERZEL[rolle] : null;
  return (k && WACHBUCH_ZUGRIFF[k]) || "keiner";
}

/** Zugriff auf den Objektbericht: „voll“ nur für Planung und Leitung (O1, Plan: „nur Leitung/Planung“). @param {any} rolle */
export function berichtZugriffFuer(rolle) {
  return rolle === "leitung" || rolle === "planer" ? "voll" : "keiner";
}

/**
 * Der Basiskontext für die Moduloberflächen.
 * @param {{ sitz?: any, kontext?: any }} o
 */
export function modulKontext({ sitz, kontext } = {}) {
  const person = sitz && istObjekt(sitz.person) ? sitz.person : null;
  /* Die Rolle der Sitzung (wie der Server), nicht die Rollenangabe der Person: Betreiber und Unbekanntes ergeben „keiner“. */
  const rolle = sitz && typeof sitz.rolle === "string" ? sitz.rolle : null;
  const eigene = person && typeof person.bereich === "string" && person.bereich && person.bereich !== "ALLE" ? person.bereich : null;
  const m = sitz && istObjekt(sitz.mandant) ? sitz.mandant : null;
  const k = istObjekt(kontext) ? kontext : {};
  return {
    wachbuchZugriff: wachbuchZugriffFuer(rolle),
    berichtZugriff: berichtZugriffFuer(rolle),
    person: person && person.id !== undefined && person.id !== null ? String(person.id) : null,
    eigeneEinheit: eigene,
    personen: m && Array.isArray(m.personen) ? m.personen.filter(istObjekt) : [],
    qualGueltig,
    /* Bestätigte Ist-Zeiten (OB-2): ohne Quelle des Aufrufers „ungeklärt“ (null), nie die Planzeit. */
    dienstzeit: typeof k.dienstzeit === "function" ? k.dienstzeit : () => null,
  };
}
