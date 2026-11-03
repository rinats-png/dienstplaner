/* ==========================================================================
   LOHNRECHNUNG — Konstanten und Monatswerte für Abschluss und Oberfläche
   (WP-16, Nachtrag dritter Opus-Delta-Review: H-1, N-d)

   Der Monatsabschluss friert seit diesem Nachtrag nicht nur Tage, Soll und
   Zuschläge ein, sondern auch die Ist-Summe, das Stundenkonto zum Monatsende
   (mit dem Übertrag und den Vormonaten, wie sie zum Abschluss galten), die
   Bereitschafts- und Rufstunden und die Personalangaben für die Lohnausgabe.
   Dafür muss der Server dieselbe Ist-Rechnung kennen wie die Oberfläche
   (src/App.jsx istStunden): Anrechnungsfaktor je Dienstform, Entgeltstatus
   und Rang je Abwesenheitsart, Standard-Lohnarten.

   Dienstformen und Standard-Lohnarten stehen nur hier (die Oberfläche
   importiert sie). Die Abwesenheitsarten bleiben in src/App.jsx und
   src/abwesenheitsarten.js (Farben, Texte, Quelltext-Prüfungen); hier steht
   nur, was die Rechnung braucht — Entgeltstatus und Rang —, und
   pruefungen/monatsabschluss-nachtrag3.test.js vergleicht beides Eintrag für
   Eintrag.

   RECHEN_STAND: Fassung dieser Konstanten. Der Abschluss schreibt sie ins
   Verzeichnis des Monats („*|JJJJ-MM".rv). Ändert ein Softwarestand die
   Konstanten, steigt die Zahl — die Lohnausgabe eines älteren Abschlusses
   sagt dann, dass er mit einem anderen Rechenstand entstand (N-d). Die
   eingefrorenen Summen (Ist, Konto, Zuschläge, Bereitschaft) ändern sich
   dadurch nicht.
   ========================================================================== */

export const RECHEN_STAND = 1;

/**
 * Dienstformen. Bereitschaftsdienst (Anwesenheit am Arbeitsplatz) und
 * Rufbereitschaft (Erreichbarkeit von zu Hause) zählen unterschiedlich. Beide
 * sind Arbeitszeit im Sinne des Arbeitsschutzes, aber nicht in voller Höhe
 * vergütungs- oder kontenwirksam.
 */
export const DIENSTFORMEN = [
  { id: "regel", name: "Regeldienst", faktor: 1, ruhezeitNeutral: false,
    aufenthalt: "arbeitsplatz",
    hinweis: "Volle Arbeitszeit, unterbricht die Ruhezeit." },
  { id: "bereitschaft", name: "Bereitschaftsdienst", faktor: 0.6, ruhezeitNeutral: false,
    aufenthalt: "arbeitsplatz", abrufMinuten: 0,
    hinweis: "Anwesenheit am Arbeitsplatz oder an einer vom Betrieb bestimmten Stelle. "
      + "Arbeitszeit im Sinne des ArbZG, auf dem Konto anteilig." },
  { id: "ruf", name: "Rufbereitschaft", faktor: 0.125, ruhezeitNeutral: true,
    aufenthalt: "frei", abrufMinuten: 30,
    hinweis: "Aufenthalt frei wählbar, nur Erreichbarkeit geschuldet. Unterbricht die "
      + "Ruhezeit nicht, solange kein Einsatz erfolgt." },
  { id: "geteilt", name: "Geteilter Dienst", faktor: 1, ruhezeitNeutral: false, geteilt: true,
    aufenthalt: "arbeitsplatz",
    hinweis: "Zwei Abschnitte mit Unterbrechung. Die Pause dazwischen ist keine Arbeitszeit." },
];
export const dienstform = (id) => DIENSTFORMEN.find((x) => x.id === id) || DIENSTFORMEN[0];

/**
 * Womit wird diese Dienstart auf das Konto gerechnet?
 *
 * Der Betrieb kann einen Faktor setzen. Ist stattdessen ein Einsatzanteil
 * erfasst — wie viel der Bereitschaft erfahrungsgemäß Einsatz ist —, ist
 * das die ehrlichere Zahl: Sie stammt aus der Beobachtung und nicht aus
 * einer Verhandlung. Sie greift nur, wenn kein eigener Faktor gesetzt ist.
 */
export function anrechnungsfaktor(da) {
  if (!da) return 1;
  if (da.faktor !== undefined && da.faktor !== null) return da.faktor;
  const anteil = Number(da.einsatzAnteil);
  if ((da.form === "ruf" || da.form === "bereitschaft") && Number.isFinite(anteil) && anteil > 0)
    return Math.min(1, anteil);
  return dienstform(da.form).faktor;
}
/** Gewertete Stunden eines Dienstes (Rufbereitschaft nicht voll). */
export const gewertet = (da, std) => Math.round(std * anrechnungsfaktor(da) * 100) / 100;

/**
 * Übliche Lohnartennummern als Startwerte. Sie sind keine Vorgabe von DATEV,
 * sondern in deutschen Lohnbüros verbreitete Hausnummern — jeder Betrieb
 * führt seinen eigenen Lohnartenschlüssel, deshalb sind sie einstellbar.
 * Der Abschluss friert die wirksamen Lohnarten ein (eigene oder diese).
 */
export const LOHNARTEN_STD = {
  grund: { nr: "1000", text: "Gehalt" },
  nacht: { nr: "1400", text: "Nachtzuschlag steuerfrei" },
  sonntag: { nr: "1410", text: "Sonntagszuschlag steuerfrei" },
  feiertag: { nr: "1420", text: "Feiertagszuschlag steuerfrei" },
  samstag: { nr: "1430", text: "Samstagszuschlag" },
  bereitschaft: { nr: "1500", text: "Bereitschaftsdienst" },
  ruf: { nr: "1510", text: "Rufbereitschaft" },
  mehrarbeit: { nr: "1200", text: "Mehrarbeit" },
};

/**
 * Was die Ist-Rechnung von einer Abwesenheitsart braucht: Entgeltstatus
 * (true/false/„ungeklaert", siehe entgeltStatus) und Rang (die höchste Art
 * eines Tages zählt). Gleich mit ABW in src/App.jsx (geprüft).
 */
export const ABW_RECHNUNG = {
  urlaub: { bezahlt: true, rang: 3 },
  krank: { bezahlt: true, rang: 5 },
  schulung: { bezahlt: true, rang: 4 },
  frei: { bezahlt: false, rang: 1 },
  sonst: { bezahlt: true, rang: 2 },
  ausgleich: { bezahlt: false, rang: 2 },
  elternzeit: { bezahlt: "ungeklaert", rang: 3 },
  pflegezeit: { bezahlt: "ungeklaert", rang: 3 },
  familienpflegezeit: { bezahlt: "ungeklaert", rang: 3 },
  arbeitsverhinderung: { bezahlt: "ungeklaert", rang: 4 },
  mutterschutz: { bezahlt: "ungeklaert", rang: 5 },
  ehrenamt: { bezahlt: "ungeklaert", rang: 2 },
  personalvertretung: { bezahlt: "ungeklaert", rang: 2 },
  berufsschule: { bezahlt: "ungeklaert", rang: 4 },
  atzfreistellung: { bezahlt: "ungeklaert", rang: 3 },
};
/* Wie abwArt in der Oberfläche: „abwesend" (gekürzte Sicht) bezahlt mit Rang 1, Unbekanntes wie „Sonstiges". */
const ABW_NEUTRAL_RECHNUNG = { bezahlt: true, rang: 1 };
export const abwRechnung = (id) => ABW_RECHNUNG[id] || (id === "abwesend" ? ABW_NEUTRAL_RECHNUNG : ABW_RECHNUNG.sonst);
/** Wird eine Abwesenheit dieser Art gutgeschrieben? Nur bei `bezahlt === true` (wie entgeltStatus). */
export const abwBezahlt = (id) => abwRechnung(id).bezahlt === true;
/** Die zählende Art eines Tages: die mit dem höchsten Rang, bei Gleichstand die erste. */
export const abwHoechste = (arten) => (Array.isArray(arten) ? arten : [])
  .reduce((best, x) => (best === null || abwRechnung(x).rang > abwRechnung(best).rang ? x : best), null);
