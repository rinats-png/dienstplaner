/* ==========================================================================
   INTELLIGENCE-GATEWAY — ALARME ALS REINE FUNKTION (WP-I15)

   Keine Ein-/Ausgabe, kein Mailversand, kein Webhook: die Funktion bekommt Zahlen und liefert eine Liste von
   Alarmen. Wer sie auslöst (gesund.mjs, Webhook, Mail) ist Sache des Betreibers (Haken `alarmHaken` im Gateway).
   Schwellen: CENTRIC-INTELLIGENCE.md 7.4 (Betrieb 70/90/100/110 %) und 7.5 (Plattform 80/100 % des
   Tagesbudgets, Tag über dem Dreifachen des 7-Tage-Mittels). Alle Alarme sind Codes ohne Personen- und Betriebsnamen.

   Die Alarme sind Hinweise, keine Sperren; gesperrt wird in limits.mjs. Ein Intelligence-Alarm setzt /gesund nie auf
   „kritisch“ (Plan I15) — das ist die Aufgabe des Aufrufers.
   ========================================================================== */

const STUFEN_BETRIEB = [[1.1, "KONTINGENT_110", "pause"], [1.0, "KONTINGENT_100", "erreicht"], [0.9, "KONTINGENT_90", "dringlich"],
  [0.7, "KONTINGENT_70", "hinweis"]];

const zahl = (n) => typeof n === "number" && Number.isFinite(n) && n >= 0;

/**
 * @param {{
 *   betrieb?: { ieMonat: number, kontingentIE: number },
 *   gesamt?: { ieTag: number, tagesIE: number, hartTagesIE?: number },
 *   tageswerte7?: number[],     // Verbrauch (IE) der letzten sieben Tage der Plattform, ohne heute
 * }} d
 * @returns {{ ebene: "betrieb"|"gesamt", code: string, stufe: string }[]}
 */
export function alarmeBerechnen(d) {
  const aus = [];
  if (!d || typeof d !== "object") return aus;
  const b = d.betrieb;
  if (b && zahl(b.ieMonat) && zahl(b.kontingentIE) && b.kontingentIE > 0) {
    const anteil = b.ieMonat / b.kontingentIE;
    const treffer = STUFEN_BETRIEB.find(([schwelle]) => anteil >= schwelle);
    if (treffer) aus.push({ ebene: "betrieb", code: treffer[1], stufe: treffer[2] });
  }
  const g = d.gesamt;
  if (g && zahl(g.ieTag) && zahl(g.tagesIE) && g.tagesIE > 0) {
    if (zahl(g.hartTagesIE) && g.hartTagesIE > 0 && g.ieTag >= g.hartTagesIE) aus.push({ ebene: "gesamt", code: "GESAMT_HART", stufe: "sperre" });
    else if (g.ieTag >= g.tagesIE) aus.push({ ebene: "gesamt", code: "GESAMT_100", stufe: "nur_klasse_a" });
    else if (g.ieTag >= 0.8 * g.tagesIE) aus.push({ ebene: "gesamt", code: "GESAMT_80", stufe: "klasse_c_verschieben" });
    const w = Array.isArray(d.tageswerte7) ? d.tageswerte7.filter(zahl) : [];
    if (w.length >= 3) {
      const mittel = w.reduce((s, x) => s + x, 0) / w.length;
      if (mittel > 0 && g.ieTag > 3 * mittel) aus.push({ ebene: "gesamt", code: "KOSTEN_DREIFACH", stufe: "sofort" });
    }
  }
  return aus;
}
