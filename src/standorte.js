/* ==========================================================================
   STANDORTE — Zuordnung und Zuschlag

   Ein Standort ist ab jetzt kostenlos, unabhängig von seiner Größe. Das war
   nicht immer so: Die erste Fassung dieser Datei rechnete eine Grundgebühr
   je Standort mit Mengenstaffel — jeder weitere Standort war eine
   Vertragsänderung, die die Leitung bestätigen musste, und ein mobiler
   Pflegedienst mit vielen Einsatzorten zahlte dafür, dass er viele
   Einsatzorte hat.

   Das traf den falschen Betrieb. Wer an einem Ort wächst, soll dafür nie
   mehr zahlen — das gilt für einen Standort mit vierhundert Beschäftigten
   genauso wie für einen mit vier. Was tatsächlich zusätzlichen Aufwand
   macht, ist ein WEITERER, eigenständiger Standort: eigenes Bundesland,
   eigene Leitung vor Ort, eigene Aufsicht. Und das auch nur, wenn er groß
   genug ist, um mehr als eine Postanschrift zu sein.

   Diese Datei beantwortet deshalb zwei Fragen:

   Wer gehört wohin? — `einheitAm()`, `standortAm()`, `jeStandort()`
   Was kostet ein zusätzlicher Standort dieser Größe? — `standortZuschlag()`

   Die Frage „darf ich diesen Standort anlegen" stellt sich nicht mehr —
   ein leerer Standort kostet nichts, also gibt es nichts zu bestätigen.
   ========================================================================== */

/* --------------------------------------------------------------------------
   ZUSCHLAG

   Gilt nur für Standorte, die über das Kontingent der gebuchten Stufe
   hinausgehen — siehe STUFEN in App.jsx. Innerhalb des Kontingents ist
   jeder Standort kostenlos, unabhängig von seiner Größe.

   Die Schwelle von vierzehn Personen trennt eine echte Einrichtung von
   einer Postanschrift: eine Patientenadresse, eine kleine Außenstelle,
   ein Notfallquartier. Erst darüber lohnt es, von einem zweiten Standort
   im wirtschaftlichen Sinn zu sprechen.
   ========================================================================== */
export const STANDORT_BAENDER = [
  { bis: 14, zuschlag: 0, label: "bis 14 Personen" },
  { bis: 40, zuschlag: 29, label: "15 – 40 Personen" },
  { bis: 80, zuschlag: 49, label: "41 – 80 Personen" },
  { bis: 150, zuschlag: 79, label: "81 – 150 Personen" },
  { bis: Infinity, zuschlag: 119, label: "über 150 Personen" },
];

/** Der Zuschlag für einen zusätzlichen Standort dieser Größe. */
export function standortZuschlag(personen) {
  const n = Math.max(0, Math.round(Number(personen) || 0));
  return (STANDORT_BAENDER.find((b) => n <= b.bis) || STANDORT_BAENDER[STANDORT_BAENDER.length - 1]).zuschlag;
}

/**
 * Die Standortzuschläge eines ganzen Betriebs.
 *
 * Die größten Standorte bis zum Kontingent der Stufe sind kostenlos — ein
 * Betrieb muss nichts auswählen, um den günstigsten Fall zu bekommen: Ein
 * neuer, noch leerer Standort verdrängt keinen bestehenden aus dem
 * Kontingent, weil er unten in der sortierten Liste landet.
 *
 * @param standortPersonen  Personenzahl je Standort, beliebige Reihenfolge
 * @param inklusive         wie viele der größten Standorte kostenlos sind
 */
export function standortzuschlaege(standortPersonen, inklusive) {
  const sortiert = [...standortPersonen].sort((a, b) => b - a);
  const zuschlagspflichtig = sortiert.slice(Math.max(0, inklusive));
  const posten = zuschlagspflichtig.map((personen) => ({ personen, zuschlag: standortZuschlag(personen) }));
  return { posten, summe: posten.reduce((a, p) => a + p.zuschlag, 0) };
}

/* --------------------------------------------------------------------------
   ZUORDNUNG

   Welche Person gehört zu welchem Standort? Nicht direkt — sie gehört zu
   einer Einheit, und die Einheit steht an einem Standort. Diese Umleitung
   ist Absicht: Wer den Wohnbereich wechselt, wechselt damit den Standort,
   ohne dass jemand zwei Felder pflegen muss.
   -------------------------------------------------------------------------- */

/** Die Einheit einer Person am angegebenen Tag. */
export function einheitAm(person, datum) {
  const liste = ((person && person.zugehoerigkeit) || [])
    .filter((z) => z && (!z.ab || z.ab <= datum))
    .sort((a, b) => String(a.ab || "").localeCompare(String(b.ab || "")));
  return liste.length ? liste[liste.length - 1].einheitId : null;
}

/** Der Standort einer Person am angegebenen Tag. */
export function standortAm(m, person, datum) {
  const eid = einheitAm(person, datum);
  const einheit = ((m && m.einheiten) || []).find((e) => e && e.id === eid);
  if (!einheit) return null;
  const erster = ((m && m.standorte) || [])[0];
  return einheit.standortId || (erster ? erster.id : null);
}

/**
 * Personen, Einheiten und Rollen je Standort.
 *
 * Das ist die Aufstellung, die die Betreiberkonsole braucht, um zu sehen,
 * ob ein Standort ins Kontingent seiner Stufe fällt oder einen Zuschlag
 * auslöst — und die der Betrieb selbst braucht, um zu erkennen, wo
 * Personal fehlt.
 */
export function jeStandort(m, datum) {
  const standorte = ((m && m.standorte) || []).length
    ? m.standorte
    : [{ id: "s1", name: (m && m.name) || "Standort" }];

  const aktiv = ((m && m.personen) || []).filter((p) => p && p.status !== "inaktiv"
    && (!p.austritt || p.austritt > datum) && (!p.eintritt || p.eintritt <= datum));

  return standorte.map((st) => {
    const einheiten = ((m && m.einheiten) || [])
      .filter((e) => e && (e.standortId || standorte[0].id) === st.id);
    const ids = new Set(einheiten.map((e) => e.id));
    const personen = aktiv.filter((p) => ids.has(einheitAm(p, datum)));
    const rollen = {};
    for (const p of personen) rollen[p.rolle] = (rollen[p.rolle] || 0) + 1;
    return { standort: st, einheiten: einheiten.length, personen: personen.length, rollen };
  });
}
