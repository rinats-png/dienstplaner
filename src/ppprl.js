/* ==========================================================================
   PERSONALAUSSTATTUNG PSYCHIATRIE UND PSYCHOSOMATIK — PPP-RL

   Die Richtlinie des Gemeinsamen Bundesausschusses gibt für die stationäre
   Psychiatrie, die Kinder- und Jugendpsychiatrie und die Psychosomatik
   verbindliche Mindestvorgaben an therapeutischem Personal vor. Sie zählt
   anders als die PpUGV: nicht Köpfe je Schicht, sondern Minuten je Patient
   und Woche, aufgeteilt auf Berufsgruppen.

   Deshalb steht sie in einer eigenen Datei und rechnet auf die Woche.

   Was sie hier tut:

   Sie nimmt die Zahl der Patientinnen und Patienten je Behandlungsbereich
   und die geleisteten Minuten je Berufsgruppe und sagt, wie weit die
   Vorgabe erfüllt ist. Die Richtlinie kennt eine Mindesterfüllung, unter
   der Vergütungsabschläge drohen; sie wird als eigene Schwelle geführt.

   Was sie nicht tut:

   Sie meldet die Zahlen nicht an die Kassen. Das Nachweisverfahren wurde
   zum 1. Januar 2026 umgestellt und läuft jährlich über eine eigene
   Spezifikation; was hier entsteht, ist die Grundlage dafür, nicht die
   Meldung selbst.

   Und sie erfindet keine Zahlen. Ohne erfasste Minuten steht „nicht
   bewertbar".

   Die Minutenwerte sind Richtwerte der Anlage zur PPP-RL für die
   Regelbehandlung Erwachsener. Sie sind hier datiert hinterlegt und je
   Einrichtung überschreibbar — die Richtlinie kennt Differenzierungen nach
   Behandlungsart, die kein Vorschlagswert vorwegnehmen kann.

   Quellen: https://www.g-ba.de/richtlinien/113/ und
   https://www.g-ba.de/service/fachnews/225/
   ========================================================================== */

/** Die Bereiche, für die die Richtlinie Vorgaben macht. */
export const BEREICHE = [
  { id: "psych_erwachsene", name: "Allgemeine Psychiatrie (Erwachsene)" },
  { id: "psych_kjp", name: "Kinder- und Jugendpsychiatrie" },
  { id: "psychosomatik", name: "Psychosomatik" },
];

/** Behandlungsarten — die Vorgaben unterscheiden sich deutlich. */
export const ARTEN = [
  { id: "vollstationaer", name: "Vollstationär" },
  { id: "teilstationaer", name: "Teilstationär (Tagesklinik)" },
];

/** Die Berufsgruppen, auf die die Richtlinie die Minuten aufteilt. */
export const BERUFSGRUPPEN = [
  { id: "aerzte", name: "Ärztlicher Dienst" },
  { id: "pflege", name: "Pflegedienst" },
  { id: "psychologen", name: "Psychologinnen und Psychologen" },
  { id: "spezialtherapie", name: "Spezialtherapeutisches Personal" },
  { id: "sozialdienst", name: "Sozialdienst" },
];

export const bereichVon = (id) => BEREICHE.find((b) => b.id === id) || null;
export const berufsgruppeVon = (id) => BERUFSGRUPPEN.find((b) => b.id === id) || null;

/* --------------------------------------------------------------------------
   RICHTWERTE

   Minuten je Patientin oder Patient und Woche. Sie sind Ausgangspunkt, nicht
   Gesetz: Die Richtlinie differenziert nach Behandlungsbereichen, die ein
   Vorschlagswert nicht abbilden kann. Jede Einrichtung überschreibt sie mit
   den Werten, die für ihre Bereiche gelten.
   -------------------------------------------------------------------------- */
const SAETZE = [
  {
    ab: "2020-01-01", bis: null,
    fassung: "PPP-RL, Richtwerte der Regelbehandlung — Ausgangswerte",
    werte: {
      "psych_erwachsene|vollstationaer": {
        aerzte: 110, pflege: 780, psychologen: 55, spezialtherapie: 110, sozialdienst: 40 },
      "psych_erwachsene|teilstationaer": {
        aerzte: 80, pflege: 380, psychologen: 55, spezialtherapie: 120, sozialdienst: 40 },
      "psych_kjp|vollstationaer": {
        aerzte: 130, pflege: 900, psychologen: 130, spezialtherapie: 220, sozialdienst: 70 },
      "psych_kjp|teilstationaer": {
        aerzte: 110, pflege: 480, psychologen: 120, spezialtherapie: 230, sozialdienst: 70 },
      "psychosomatik|vollstationaer": {
        aerzte: 130, pflege: 300, psychologen: 190, spezialtherapie: 190, sozialdienst: 40 },
      "psychosomatik|teilstationaer": {
        aerzte: 100, pflege: 180, psychologen: 190, spezialtherapie: 200, sozialdienst: 40 },
    },
  },
];

/* Ab welcher Erfüllung droht kein Abschlag? Die Richtlinie kennt eine
   Mindesterfüllung; darunter greifen Vergütungsabschläge. */
export const MINDESTERFUELLUNG = 0.90;

/** Der Regelsatz, der an diesem Tag galt. */
export function satzAm(datum) {
  const d = String(datum || "");
  return SAETZE.find((s) => s.ab <= d && (!s.bis || s.bis >= d)) || null;
}

/**
 * Die Richtwerte für einen Bereich — Vorgabe der Einrichtung schlägt den
 * hinterlegten Ausgangswert.
 */
export function richtwerte(bereich, art, datum, eigene) {
  const satz = satzAm(datum);
  const schluessel = `${bereich}|${art}`;
  const grund = satz && satz.werte[schluessel];
  if (!grund && !eigene) return null;
  const werte = { ...(grund || {}), ...((eigene && eigene[schluessel]) || {}) };
  return { werte, fassung: satz ? satz.fassung : "eigene Vorgabe der Einrichtung",
    eigen: !!(eigene && eigene[schluessel]) };
}

/**
 * Prüft eine Woche gegen die Vorgabe.
 *
 * @param {object} lage
 * @param {string} lage.bereich
 * @param {string} lage.art
 * @param {string} lage.datum        ein Tag der Woche
 * @param {number|null} lage.patienten  Belegungstage geteilt durch sieben, oder Ist-Zahl
 * @param {object} lage.minuten      { berufsgruppeId: geleistete Minuten }
 * @param {object} [lage.eigene]     eigene Richtwerte der Einrichtung
 * @returns {{urteil: string, ...}}  "gruen" | "gelb" | "rot" | "grau"
 */
export function pruefeWoche(lage) {
  const { bereich, art, datum, patienten, minuten = {}, eigene = null } = lage || {};

  const b = bereichVon(bereich);
  if (!b)
    return { urteil: "grau", grund: "keinBereich",
      text: "Für diese Einheit ist kein Behandlungsbereich der PPP-RL hinterlegt." };

  const rw = richtwerte(bereich, art, datum, eigene);
  if (!rw)
    return { urteil: "grau", grund: "keineRichtwerte", bereich: b,
      text: `Für ${b.name} liegen keine Richtwerte vor. Sie müssen hinterlegt werden, `
        + "bevor sich etwas beurteilen lässt." };

  if (patienten === null || patienten === undefined || patienten === ""
      || !Number.isFinite(Number(patienten)))
    return { urteil: "grau", grund: "keinePatientenzahl", bereich: b, richtwerte: rw,
      text: `${b.name}: Ohne die Zahl der Patientinnen und Patienten lässt sich die `
        + "Vorgabe nicht prüfen. Nicht bewertbar ist nicht dasselbe wie erfüllt." };

  const pat = Number(patienten);
  const zeilen = [];
  let erfasstIrgendwas = false;

  for (const g of BERUFSGRUPPEN) {
    const soll = Math.round((rw.werte[g.id] || 0) * pat);
    const rohIst = minuten[g.id];
    const erfasst = rohIst !== null && rohIst !== undefined && rohIst !== ""
      && Number.isFinite(Number(rohIst));
    if (erfasst) erfasstIrgendwas = true;
    const ist = erfasst ? Number(rohIst) : null;
    const quote = soll > 0 && ist !== null ? ist / soll : null;
    zeilen.push({ gruppe: g, soll, ist, erfasst, quote,
      erfuellt: quote === null ? null : quote >= 1,
      ueberMindest: quote === null ? null : quote >= MINDESTERFUELLUNG });
  }

  if (!erfasstIrgendwas)
    return { urteil: "grau", grund: "keineMinuten", bereich: b, richtwerte: rw, patienten: pat, zeilen,
      text: `${b.name}: Für diese Woche sind keine Minuten erfasst.` };

  const bewertet = zeilen.filter((z) => z.quote !== null);
  const unterMindest = bewertet.filter((z) => !z.ueberMindest);
  const unterSoll = bewertet.filter((z) => !z.erfuellt);
  const luecken = zeilen.filter((z) => !z.erfasst && z.soll > 0);

  const urteil = unterMindest.length ? "rot" : unterSoll.length ? "gelb" : "gruen";
  return {
    urteil, bereich: b, art, richtwerte: rw, patienten: pat, zeilen,
    luecken: luecken.map((z) => z.gruppe.name),
    text: urteil === "rot"
      ? `${b.name}: ${unterMindest.map((z) => z.gruppe.name).join(", ")} unter der `
        + `Mindesterfüllung von ${Math.round(MINDESTERFUELLUNG * 100)} Prozent — hier drohen Abschläge.`
      : urteil === "gelb"
        ? `${b.name}: ${unterSoll.map((z) => z.gruppe.name).join(", ")} unter der Vorgabe, `
          + `aber über der Mindesterfüllung.`
        : `${b.name}: alle Berufsgruppen erfüllen die Vorgabe.`,
    quelle: rw.fassung,
  };
}
