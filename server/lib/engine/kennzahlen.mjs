/* ==========================================================================
   RECHENKERN — KENNZAHLEN (WP-I12)

   Verteilung und Plankennzahlen, aus src/lib/fachlogik.js unverändert herausgelöst.
   ========================================================================== */
import { imDienst, nachtAnteil, nachtschwelle } from "../fachpruefung.mjs";
import { addDays, dow, dauer } from "../regelwerk.mjs";
import { feiertag } from "../feiertage.mjs";
import { memo, personTag, besetzung } from "./plan.mjs";
import { pruefen } from "./befunde.mjs";

/* --------------------------- Verteilungsgerechtigkeit -------------------- */
/**
 * Belastungsverteilung über einen Zeitraum: Wochenendnächte, Feiertagsdienste,
 * Nachtdienste, kurzfristige Änderungen. Grundlage für Streitfreiheit.
 */
export function verteilung(m, von, bis) {
  return memo(m, `vert|${von}|${bis}`, () => {
    const kurz = {};
    for (const a of m.aenderungen || []) if (a.datum >= von && a.datum <= bis && a.vorlauf < 14)
      kurz[a.personId] = (kurz[a.personId] || 0) + 1;
    const zeilen = m.personen.filter((p) => imDienst(p, bis)).map((p) => {
      let weNacht = 0, feier = 0, naechte = 0, wochenenden = 0, dienste = 0;
      for (let d = von; d <= bis; d = addDays(d, 1)) {
        const t = personTag(m, p, d);
        if (!t.dienstId) continue;
        const da = m.dienstarten.find((x) => x.id === t.dienstId);
        if (!da) continue;
        dienste++;
        const w = dow(d), nacht = nachtAnteil(da, m.einstellungen) >= nachtschwelle(m.einstellungen);
        if (nacht) naechte++;
        if (nacht && (w === 4 || w === 5)) weNacht++;
        if (w >= 5) wochenenden++;
        if (feiertag(d, m.bundesland)) feier++;
      }
      return { person: p, weNacht, feier, naechte, wochenenden, dienste, kurzfristig: kurz[p.id] || 0 };
    });
    const felder = ["weNacht", "feier", "naechte", "wochenenden", "kurzfristig"];
    const mittel = {};
    for (const f of felder) mittel[f] = zeilen.length ? zeilen.reduce((a, z) => a + z[f], 0) / zeilen.length : 0;
    for (const z of zeilen) { z.abw = {}; for (const f of felder) z.abw[f] = z[f] - mittel[f]; }
    zeilen.sort((a, b) => (b.weNacht + b.feier) - (a.weNacht + a.feier));
    return { zeilen, mittel, felder };
  });
}
/* ==========================================================================
   SZENARIENVERGLEICH
   Zwei Planvarianten nebeneinander, mit denselben Kennzahlen gemessen.
   ========================================================================== */
export function planKennzahlen(m, von, bis) {
  const bef = pruefen(m, von, bis);
  const schwer = bef.filter((x) => x.schwere === "danger").length;
  let unterbesetzt = 0, ueberbesetzt = 0, dienste = 0, stunden = 0;
  for (let d = von; d <= bis; d = addDays(d, 1)) {
    for (const [k, e] of Object.entries(besetzung(m, d))) {
      if (e.soll === 0) continue;
      dienste += e.anzahl;
      if (e.diff < 0) unterbesetzt++;
      if (e.diff > 1) ueberbesetzt++;
      if (e.da) stunden += e.anzahl * dauer(e.da);
    }
  }
  const v = verteilung(m, von.slice(0, 7));
  return { befunde: bef.length, schwer, unterbesetzt, ueberbesetzt, dienste,
    stunden: Math.round(stunden), spanne: v.spanne,
    wochenenden: v.zeilen.reduce((a, z) => a + z.wochenendNaechte, 0) };
}
