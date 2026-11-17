/* ==========================================================================
   MONATSABSCHLUSS SEGMENTWEISE (WP-48.7, Stufe a)

   docs/acc45/WP48-TEILSPEICHERUNG.md Abschnitt 5. Bisher las POST
   /api/monatsabschluss unter der Raumsperre den ganzen Bestand (alle Monate
   aller Jahre), rechnete darüber und schrieb ihn über bestandSchreiben
   zurück (zerlegen und Abdruck aller Scherben). Die Sperre hielt deshalb
   O(Historie): gemessen 0,75 s (60 × 12) bis 42 s (400 × 36).

   Stufe a (hier, hinter CENTRIC_ABSCHLUSS_SEGMENTWEISE):
   - Gelesen werden nur der Kern und die Scherben des eigenen Betriebs von
     Januar bis zum Monat (bestand.mjs bestandLesenAuswahlStreng). Mehr
     braucht die Rechnung nicht: Ist, Prüffälle, Freeze und Prüfsumme liegen
     im Monat (Schlüssel „…|JJJJ-MM[-TT]", der Nachtdienst gehört zum Tag
     des Beginns), das Stundenkonto im Freeze rechnet ab Januar desselben
     Jahres (isteinfrieren.mjs kontoBis), alles andere steht im Kern.
   - Geschrieben werden der Kern und die Scherbe des Monats über den
     Segmentschreiber (teileSchreiben, ein Journal). Abdrücke der übrigen
     Scherben kommen aus dem Vermerk.
   - Das Ergebnis auf der Platte ist dasselbe wie im vollen Weg (Prüfung
     pruefungen/wp48-7-abschluss-segmentweise.test.js, beide Wege nebeneinander).

   Fail-closed zurück auf den vollen Weg (nicht segmentweise):
   - eine andere Aktion als abschliessen, wiederoeffnen, lohnexport;
   - irgendein Betrieb des Raums mit laufender Korrekturrevision (WP-16c:
     bestandSchreiben vermerkt dann Mitwirkende — das kann nur der volle Weg);
   - Kern/Zeiger/Vermerk/Verzeichnis unklar, Journal liegt, keine Epoche;
   - die Rechnung hat etwas außerhalb des Monats in den Monatsfeldern
     verändert (abschlussTeile → null): dann wäre die Änderung im
     Segmentweg verloren — der volle Weg rechnet neu und schreibt alles.

   Stufe b (Rechnen außerhalb der Sperre, compare-and-set) ist nicht Teil
   dieser Stufe.
   ========================================================================== */

import { zerlegen, monatVon, MONATSFELDER } from "./scherben.mjs";
import { eigenerMandant } from "./rechte.mjs";

/** Diese Aktionen von POST /api/monatsabschluss können segmentweise laufen. */
export const ABSCHLUSS_SEGMENT_AKTIONEN = Object.freeze(["abschliessen", "wiederoeffnen", "lohnexport"]);

const MONAT = /^\d{4}-(0[1-9]|1[0-2])$/;
const objekt = (x) => !!x && typeof x === "object" && !Array.isArray(x);

/** Die Monate des Jahres bis einschließlich `monat` ("2026-03" → ["2026-01", "2026-02", "2026-03"]); [] ohne gültigen Monat. */
export function jahrBisMonat(monat) {
  if (!MONAT.test(String(monat ?? ""))) return [];
  const j = monat.slice(0, 4), mo = Number(monat.slice(5, 7));
  return Array.from({ length: mo }, (_, i) => `${j}-${String(i + 1).padStart(2, "0")}`);
}

/**
 * Die Auswahl für bestandLesenAuswahlStreng: der Betrieb der Sitzung, Januar bis Monat.
 * null (nicht segmentweise), wenn der Betrieb keine eindeutige Kennung trägt.
 */
export function abschlussAuswahl(sitzung, monat) {
  return (kern) => {
    const m = eigenerMandant(kern, sitzung);
    if (!m || typeof m.id !== "string" || !m.id || m.id.includes(":")) return null;
    /* Alle Betriebskennungen des Raums eindeutig — dieselbe Regel wie teileGeprueft (bestand.mjs, „Betriebskennung
       doppelt“, auch zwei Betriebe ohne Kennung). Sonst würfe der Segmentschreiber (500); so nimmt der Abschluss den
       vollen Weg (Review PR #322, Auflage 2). */
    const ids = (Array.isArray(kern.mandanten) ? kern.mandanten : []).map((x) => (objekt(x) ? x.id : undefined));
    if (new Set(ids).size !== ids.length) return null;
    const monate = jahrBisMonat(monat);
    return monate.length ? monate.map((mon) => `${m.id}::${mon}`) : null;
  };
}

/**
 * Hat die Rechnung in einem Monatsfeld etwas außerhalb von `monat` verändert (Schlüssel mit Datum)?
 * Verglichen wird je Schlüssel die Referenz: Die Funktionen in monatsabschluss.mjs übernehmen
 * unveränderte Einträge unverändert ({ ...m, … }).
 */
function aussenGeaendert(alt, neu, monat) {
  for (const feld of MONATSFELDER) {
    const a = objekt(alt[feld]) ? alt[feld] : {}, n = objekt(neu[feld]) ? neu[feld] : {};
    if (a === n) continue;
    for (const k of Object.keys(a)) {
      const mon = monatVon(k);
      if (mon && mon !== monat && (!Object.prototype.hasOwnProperty.call(n, k) || n[k] !== a[k])) return true;
    }
    for (const k of Object.keys(n)) {
      const mon = monatVon(k);
      if (mon && mon !== monat && !Object.prototype.hasOwnProperty.call(a, k)) return true;
    }
  }
  return false;
}

/**
 * Die Teile für teileSchreiben: der ganze Kern (zerlegt, ohne Monatsdaten) und die Scherbe des Monats
 * (leer, wenn der Monat danach keine Einträge mehr hat — der Segmentschreiber entfernt sie dann).
 * null: nicht segmentweise schreibbar (siehe Kopf).
 * @param {object} gelesen  Bestand aus bestandLesenAuswahlStreng
 * @param {object} mAlt     der gelesene Betrieb
 * @param {object} mNeu     der Betrieb nach der Aktion (r.mandant)
 * @param {string} monat
 * @returns {null | {kern: object, scherben: Array<{mandantId: string, monat: string, felder: object}>}}
 */
export function abschlussTeile(gelesen, mAlt, mNeu, monat) {
  if (!objekt(gelesen) || !Array.isArray(gelesen.mandanten) || !objekt(mAlt) || !objekt(mNeu)) return null;
  if (mNeu.id !== mAlt.id || !MONAT.test(String(monat ?? ""))) return null;
  if (aussenGeaendert(mAlt, mNeu, monat)) return null;
  const z = zerlegen({ ...gelesen, mandanten: gelesen.mandanten.map((x) => (x === mAlt ? mNeu : x)) });
  const id = `${mAlt.id}::${monat}`;
  const s = z.scherben.get(id);
  return { kern: z.kern, scherben: [s || { mandantId: mAlt.id, monat, felder: Object.fromEntries(MONATSFELDER.map((f) => [f, {}])) }] };
}
