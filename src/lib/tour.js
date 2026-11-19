/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */



/* ==========================================================================
   GEFÜHRTE TOUR

   Kein Werbefilm, sondern eine Einweisung. Wer sie durchläuft, kann danach
   seinen Bereich bedienen — ohne Nachfragen, ohne Handbuch.

   Drei Regeln, die den Unterschied zu üblichen Produkttouren machen:

   Jeder Punkt nennt eine Handlung, nicht eine Funktion. „Klicke auf X"
   statt „Hier siehst du X". Wer nur liest, behält nichts.

   Jeder Punkt, der etwas verändert, nennt die Erfolgskontrolle. Sonst weiß
   niemand, ob es geklappt hat.

   Der Umfang richtet sich nach der Verantwortung. Die Organisationsleitung
   richtet einen Betrieb ein und braucht viel; wer nur den eigenen Plan
   sieht, braucht wenig. Eine Tour, die alle gleich behandelt, langweilt die
   einen und überfordert die anderen.
   ========================================================================== */

/* Der Inhalt liegt in src/tour-inhalt.js und wird erst geholt, wenn ihn
   jemand braucht — siehe dort. */
export let _tour = null;
export let _tourLaeuft = null;

/** Holt den Tourinhalt. Mehrfache Aufrufe teilen sich ein Versprechen. */
export function tourLaden() {
  if (_tour) return Promise.resolve(_tour);
  if (!_tourLaeuft) {
    _tourLaeuft = import("../tour-inhalt.js")
      .then((mod) => { _tour = mod.TOUR; return _tour; })
      .catch((e) => { _tourLaeuft = null; throw e; });
  }
  return _tourLaeuft;
}

/** Alle Punkte einer Rolle flach — für Fortschritt und Navigation. */
export function tourPunkte(tour, rolleId) {
  const t = (tour || {})[rolleId] || (tour || {}).mitarbeiter;
  if (!t) return [];
  const out = [];
  t.kapitel.forEach((k, ki) => k.punkte.forEach((p, pi) =>
    out.push({ ...p, kapitel: k.name, kapitelIdx: ki, punktIdx: pi,
      id: `${rolleId}:${ki}:${pi}` })));
  return out;
}

/** Wie weit ist jemand? */
export function tourStand(person, rolleId, tour) {
  const alle = tourPunkte(tour, rolleId);
  const gesehen = (person.tour || {}).gesehen || [];
  const idx = Math.min(alle.length - 1, Math.max(0, (person.tour || {}).schritt || 0));
  return { alle, gesehen, idx, gesamt: alle.length,
    anteil: alle.length ? Math.round((gesehen.length / alle.length) * 100) : 0,
    fertig: !!(person.tour || {}).fertig,
    unterdrueckt: !!(person.tour || {}).nichtMehr };
}

/**
 * Die Kapitel einer Tour mit ihrem Fortschritt.
 *
 * Vierundvierzig Schritte am Stück sind keine Führung, sondern eine
 * Zumutung — „Schritt 17 von 44" entmutigt mehr, als es leitet. Die Tour
 * ist längst in Kapitel geteilt; sichtbar war das nur als kleine
 * Überschrift über dem laufenden Schritt.
 *
 * @returns {Array<{name, idx, von, bis, anzahl, gesehen, fertig}>}
 */
export function tourKapitel(tour, rolleId, gesehen = []) {
  const alle = tourPunkte(tour, rolleId);
  const gesetzt = new Set(gesehen);
  const aus = [];
  alle.forEach((punkt, i) => {
    let k = aus[aus.length - 1];
    if (!k || k.idx !== punkt.kapitelIdx) {
      k = { name: punkt.kapitel, idx: punkt.kapitelIdx, von: i, bis: i,
        anzahl: 0, gesehen: 0, fertig: false };
      aus.push(k);
    }
    k.bis = i; k.anzahl++;
    if (gesetzt.has(punkt.id)) k.gesehen++;
  });
  for (const k of aus) k.fertig = k.anzahl > 0 && k.gesehen >= k.anzahl;
  return aus;
}

/**
 * Soll die Tour beim Anmelden von selbst starten?
 *
 * `zurueckgestellt` musste dazukommen: Der Selbststart hing allein daran,
 * ob schon ein Schritt gesehen wurde. Wer die Tour wegklickte, ohne je
 * „Weiter" gedrückt zu haben — der häufigste Fall —, bekam sie beim
 * nächsten Ansichtswechsel wieder vorgesetzt. Ein Wegklicken, das nicht
 * hält, erzieht dazu, gar nicht mehr hinzusehen.
 */
export const tourStartet = (person, rolleId) => {
  const t = person.tour || {};
  if (t.nichtMehr || t.fertig || t.zurueckgestellt) return false;
  return !(t.gesehen || []).length;
};
