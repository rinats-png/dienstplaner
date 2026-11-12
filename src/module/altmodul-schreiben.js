/* ==========================================================================
   SCHREIBAKTIONEN DER FÜNF ÄLTEREN BRANCHENMODULE (WP-19 B5)

   Posten, Bereichsplan, geteilter Dienst, Anlagen und Maschinenqualifikation
   speichert der Server nur, solange das Modul im Betrieb wirkt (modulAktiv:
   Status „vorlaeufig“ oder „freigegeben“ aus der einen Allowlist statusWirksam,
   gebucht, eingeschaltet, Abhängigkeiten aktiv) — sonst 403
   (server/lib/modul-altwege.mjs). Die Ansichten fragen hier dieselbe Funktion
   (modulAktiv aus server/lib/branchenmodule.mjs, keine zweite Liste), damit sie
   nie eine Schaltfläche zeigen, die nur eine Abweisung erzeugen kann.
   Lesen bleibt: bestehende Altdaten werden weiter angezeigt.
   Kernansichten mit Schreibaktionen auf Daten dieser Module:
     Betriebsmittel  Betriebsmittel der Art „anlage“  → Modul „anlagen“
     Kompetenzen     Kompetenzen mit befaehigtePerson oder Bezug auf eine
                     Anlage                           → Modul „maschinenqual“
   (Posten, Bereichsplan und geteilter Dienst haben keine Schreibansicht im Kern;
   ihre Oberflächen sind reine Anzeigen.)
   ========================================================================== */
import { BRANCHENMODULE, modulAktiv } from "../../server/lib/branchenmodule.mjs";
import { istAnlage } from "../../server/lib/modul-anlagen.mjs";

/** Der kurze Grund, der an gesperrten Aktionen steht. */
export const MODUL_NICHT_VERFUEGBAR = "Modul noch nicht verfügbar";

/** Darf die Oberfläche Daten dieses Moduls im Betrieb ändern? (Dieselbe Frage wie der Server.) */
export const modulSchreibbar = (m, id, liste = BRANCHENMODULE) => modulAktiv(m, id, liste);

/** Gehört die Kompetenz zur Maschinenqualifikation (befähigte Person oder Bezug auf eine Anlage)? */
export function istMaschinenKompetenz(m, k) {
  if (!k || typeof k !== "object") return false;
  if (k.befaehigtePerson !== undefined) return true;
  const anlagen = new Set((Array.isArray(m && m.betriebsmittel) ? m.betriebsmittel : []).filter(istAnlage).map((x) => String(x.id)));
  return anlagen.has(String(k.betriebsmittelId));
}

/** Darf die Oberfläche dieses Betriebsmittel ändern oder löschen? (Anlagen nur bei wirkendem Modul „Anlagen“.) */
export const mittelSchreibbar = (m, x, liste = BRANCHENMODULE) => !istAnlage(x) || modulSchreibbar(m, "anlagen", liste);

/** Darf die Oberfläche diese Kompetenz ändern oder löschen? (Maschinenkompetenzen nur bei wirkender Maschinenqualifikation.) */
export const kompetenzSchreibbar = (m, k, liste = BRANCHENMODULE) => !istMaschinenKompetenz(m, k) || modulSchreibbar(m, "maschinenqual", liste);
