/* ==========================================================================
   STANDORTE UND WAS SIE KOSTEN

   Der Preis hängt an der Zahl der Standorte: je Standort eine Grundgebühr,
   darauf eine Mengenstaffel. Ein Standort mehr ist deshalb keine
   Verwaltungsänderung, sondern eine Vertragsänderung — und bis hierher
   konnte eine Planung sie mit einem Klick auslösen, ohne dass es jemandem
   auffiel. Die nächste Rechnung war dann höher, und niemand wusste, warum.

   Diese Datei beantwortet drei Fragen, alle ohne Seiteneffekt:

   Was kostet der Betrieb mit n Standorten? — `stufe()`
   Was ändert sich, wenn einer dazukommt? — `folgen()`
   Muss dafür jemand zustimmen, und wer? — `zustimmung()`

   ---------------------------------------------------------------------------
   Warum ein Standort mehr als eine Adresse ist

   Standorte arbeiten unabhängig: eigene Einheiten, eigene Dienstarten,
   eigene Besetzung, oft eigene Leitung. Genau deshalb kostet jeder einzeln
   — und genau deshalb muss die Zugehörigkeit konfigurierbar bleiben. Wer
   eine Planung nur für den Standort Hannover einsetzt, will nicht, dass
   sie in Frankfurt umplant.
   ========================================================================== */

/** Mengenstaffel über die Zahl der Standorte — dieselbe wie im Rechenkern. */
export const STAFFEL = [
  { von: 1, bis: 1, rabatt: 0, label: "ein Standort" },
  { von: 2, bis: 2, rabatt: 0.07, label: "2 Standorte" },
  { von: 3, bis: 5, rabatt: 0.12, label: "3 – 5 Standorte" },
  { von: 6, bis: 10, rabatt: 0.20, label: "6 – 10 Standorte" },
  { von: 11, bis: 25, rabatt: 0.27, label: "11 – 25 Standorte" },
  { von: 26, bis: 1e6, rabatt: 0.34, label: "ab 26 Standorten" },
];

export const staffel = (n) => STAFFEL.find((s) => n >= s.von && n <= s.bis) || STAFFEL[0];

/**
 * Was kostet ein Betrieb mit `anzahl` Standorten zum Preis `jeStandort`?
 *
 * Bewusst ohne Personen und Pakete: Für die Frage „springt der Preis, wenn
 * ich einen Standort anlege" zählt nur, was sich dabei ändert.
 */
export function stufe(anzahl, jeStandort) {
  const n = Math.max(1, Math.floor(Number(anzahl) || 1));
  const je = Number(jeStandort) || 0;
  const st = staffel(n);
  const einzel = Math.round(je * (1 - st.rabatt) * 100) / 100;
  return { anzahl: n, staffel: st, einzel, netto: Math.round(einzel * n * 100) / 100 };
}

/**
 * Was ändert sich beim Sprung von `vorher` auf `nachher` Standorte?
 *
 * `neueStaffel` ist wahr, wenn die Mengenstaffel eine andere Stufe
 * erreicht — dann sinkt der Preis je Standort, die Summe steigt trotzdem.
 * Beides gehört in den Hinweis, sonst wirkt die Zahl willkürlich.
 *
 * @returns {{vorher: object, nachher: object, mehr: number, neueStaffel: boolean}}
 */
export function folgen(vorher, nachher, jeStandort) {
  const a = stufe(vorher, jeStandort);
  const b = stufe(nachher, jeStandort);
  return {
    vorher: a, nachher: b,
    mehr: Math.round((b.netto - a.netto) * 100) / 100,
    neueStaffel: a.staffel.label !== b.staffel.label,
  };
}

/* --------------------------------------------------------------------------
   ZUSTIMMUNG

   Wer einen Standort anlegt, ändert den Preis. Ob er das allein darf,
   hängt an seiner Rolle — nicht daran, ob er den Knopf findet.
   -------------------------------------------------------------------------- */

/**
 * Was passiert, wenn diese Rolle einen Standort anlegen will?
 *
 *   "frei"       — darf sofort, ohne Rückfrage (Betreiber)
 *   "bestaetigen"— darf, muss die Kostenfolge aber bestätigen (Leitung)
 *   "anfragen"   — darf nicht allein; die Leitung entscheidet (Planung)
 *   "nein"       — darf nicht
 *
 * Die Trennung zwischen „bestätigen" und „anfragen" ist der Kern deiner
 * Frage: Die Leitung verantwortet den Vertrag, sie bestätigt selbst. Eine
 * Planung verantwortet ihn nicht — sie stellt einen Antrag, den die
 * Leitung sieht und entscheidet.
 */
export function zustimmung(rolle) {
  if (rolle === "betreiber") return "frei";
  if (rolle === "leitung") return "bestaetigen";
  if (rolle === "planer") return "anfragen";
  return "nein";
}

/** Beträge deutsch: Komma, zwei Stellen. */
const betrag = (n, waehrung) => `${Number(n).toFixed(2).replace(".", ",")} ${waehrung}`;

/**
 * Der Satz, der im Bestätigungsfenster steht.
 *
 * Die Mengenstaffel kommt hier bewusst *nicht* vor: Das Fenster zeigt sie
 * ohnehin in einem eigenen Kasten, und beim ersten Sichttest stand sie
 * zweimal untereinander. Zweimal dasselbe zu lesen erzieht dazu, das
 * zweite Mal nicht mehr zu lesen.
 */
export function hinweistext(f, waehrung = "€") {
  const teile = [];
  teile.push(f.nachher.anzahl === 2
    ? "Der Betrieb bekommt einen zweiten Standort."
    : `Der Betrieb wächst von ${f.vorher.anzahl} auf ${f.nachher.anzahl} Standorte.`);
  teile.push(f.mehr === 0
    ? "Die monatliche Grundgebühr bleibt unverändert."
    : `Die monatliche Grundgebühr ändert sich um ${f.mehr > 0 ? "+" : "−"}`
      + `${betrag(Math.abs(f.mehr), waehrung)} auf ${betrag(f.nachher.netto, waehrung)}.`);
  return teile.join(" ");
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
 * ob Preis und Tarif noch passen — und die der Betrieb selbst braucht, um
 * zu erkennen, wo Personal fehlt.
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
