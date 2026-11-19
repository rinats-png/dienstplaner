/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { einheitAm } from "../../server/lib/fachpruefung.mjs";
import { addDays } from "../regelwerk.js";
import { besetzung, uebergabenVon } from "./fachlogik.js";


/* ==========================================================================
   BERICHT AN DEN AUFTRAGGEBER
   Aus der internen Übergabe eine Fassung, die nach außen darf: ohne Namen,
   ohne Interna, ohne Krankheitsgründe.
   ========================================================================== */

export function auftraggeberBericht(m, von, bis, einheitId) {
  /* Die Vorkommnisse kamen hier nie an.

     Übergaben liegen als Liste vor, je Tag und Dienstart. Diese Auswertung
     griff sie über einen Schlüssel `datum|einheitId` ab, den es in den Daten
     nie gab, und verlangte zusätzlich ein Feld `abgeschlossen`, das an keiner
     Stelle geschrieben wird. Beides zusammen hieß: Der Nachweis meldete
     ausnahmslos „keine besonderen Vorkommnisse" — gleichgültig, wie viel im
     Betrieb tatsächlich dokumentiert war. */
  const zeilen = [];
  for (const u of uebergabenVon(m)) {
    if (!u || !u.datum || u.datum < von || u.datum > bis) continue;
    if (!u.vorkommnis) continue;
    /* Eine Übergabe gehört zu der Einheit, aus der jemand an der übergebenen
       Schicht beteiligt war. Näheres gibt das Modell nicht her — Übergaben
       hängen an der Dienstart, nicht an der Einheit. */
    if (einheitId && (u.personen || []).length) {
      const dabei = u.personen.some((pid) => {
        const p = m.personen.find((x) => x.id === pid);
        return p && einheitAm(p, u.datum) === einheitId;
      });
      if (!dabei) continue;
    }
    const da = m.dienstarten.find((x) => x.id === u.dienstId);
    /* Nur das Vorkommnis — Lage, offene Aufgaben und Material sind intern. */
    zeilen.push({ datum: u.datum, dienst: da ? da.name : "", vorkommnis: u.vorkommnis });
  }
  zeilen.sort((a, b) => (a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : 0));
  const besetzt = [];
  for (let d = von; d <= bis; d = addDays(d, 1)) {
    const bes = besetzung(m, d);
    const summe = Object.values(bes).reduce((a, b) => a + b.anzahl, 0);
    const soll = Object.values(bes).reduce((a, b) => a + b.soll, 0);
    /* Was davon aus der gewählten Einheit kam. Die Mindestbesetzung ist je
       Dienstart hinterlegt, nicht je Einheit — ein Soll für die Einheit
       gibt es also nicht. Gezählt wird, was sich ehrlich zählen lässt:
       Dienste aus dieser Einheit, und Tage, an denen sie nicht auf dem
       Plan stand. */
    const ausEinheit = einheitId
      ? Object.values(bes).reduce((a, b) => a + b.personen.filter((p) => einheitAm(p, d) === einheitId).length, 0)
      : summe;
    besetzt.push({ datum: d, ist: summe, soll, gedeckt: soll === 0 || summe >= soll, ausEinheit });
  }
  const mehrereEinheiten = (m.einheiten || []).length > 1;
  return {
    von, bis,
    tage: besetzt.length,
    vollstaendig: besetzt.filter((b) => b.gedeckt).length,
    quote: besetzt.length
      ? Math.round((besetzt.filter((b) => b.gedeckt).length / besetzt.length) * 100) : null,
    /* Die Besetzungsquote gilt für den Betrieb; sie ist nur dann die Quote
       der Einheit, wenn es keine andere gibt. Der Bericht sagt das dazu. */
    betriebsweit: !!einheitId && mehrereEinheiten,
    diensteEinheit: besetzt.reduce((a, b) => a + b.ausEinheit, 0),
    tageOhneEinheit: einheitId ? besetzt.filter((b) => b.ausEinheit === 0).length : 0,
    eintraege: zeilen,
    /* Bewusst nicht enthalten: Namen, Krankmeldungen, Stundenkonten,
       interne Aufgaben. Ein Auftraggeber bekommt Nachweis, keine Personalakte. */
  };
}

/* ==========================================================================
   ERSPARNIS
   Was ein Betrieb spart. Offen gerechnet, mit deutschen Zahlen und
   benannten Annahmen — eine Zahl ohne Herleitung glaubt zu Recht niemand.
   ========================================================================== */

export const ERSPARNIS_ANNAHMEN = {
  stundenlohn: 16.50,        // Durchschnitt Wach- und Pflegehilfsberufe, brutto
  lohnnebenkosten: 0.21,     // Arbeitgeberanteil
  planungStundenWoche: 4,    // Zeit der Planung für einen Monatsplan, je Woche
  planungStundenlohn: 28,    // Kosten einer Planungsstunde
  fehlerAnteil: 0.008,       // Anteil fehlerhaft abgerechneter Stunden
  ausfaelleJahr: 2,          // unbesetzte Schichten je Jahr, die vermeidbar waren
  ausfallKosten: 180,        // Kosten einer kurzfristig unbesetzten Schicht
  erfassungAnteil: 0.010,    // nicht erfasste oder zu hoch erfasste Zeit
};

/**
 * Was CENTRIC im Jahr spart — konservativ gerechnet.
 * Jede Zeile nennt ihre Annahme, damit die Zahl nachprüfbar bleibt.
 */
export function ersparnis(personen, standorte, monatspreis, eigen) {
  const a = { ...ERSPARNIS_ANNAHMEN, ...(eigen || {}) };
  const jahresstunden = personen * 1600;             // grob, nach Abzug von Urlaub
  const lohnkosten = jahresstunden * a.stundenlohn * (1 + a.lohnnebenkosten);

  const zeilen = [
    { was: "Genauere Zeiterfassung",
      grund: `${(a.erfassungAnteil * 100).toFixed(1)} % der Stunden werden heute zu hoch erfasst`,
      betrag: Math.round(lohnkosten * a.erfassungAnteil) },
    { was: "Weniger Planungsaufwand",
      grund: `${a.planungStundenWoche} Stunden je Woche, die der Rechenkern übernimmt`,
      betrag: Math.round(a.planungStundenWoche * 52 * a.planungStundenlohn * 0.6) },
    { was: "Weniger Abrechnungsfehler",
      grund: `${(a.fehlerAnteil * 100).toFixed(1)} % Fehleranteil, davon die Hälfte vermeidbar`,
      betrag: Math.round(lohnkosten * a.fehlerAnteil * 0.5) },
    { was: "Vermiedene Ausfälle",
      grund: `${a.ausfaelleJahr} kurzfristig unbesetzte Schichten je Jahr`,
      betrag: Math.round(a.ausfaelleJahr * a.ausfallKosten * Math.max(1, standorte)) },
  ];
  const brutto = zeilen.reduce((s, z) => s + z.betrag, 0);
  const kosten = Math.round(monatspreis * 12);
  /* Im ersten Jahr wird nicht alles gehoben — Einführung, Gewöhnung,
     Widerstände. Zwei Drittel sind eine ehrliche Annahme. */
  const anlauf = 0.66;
  const netto = Math.round(brutto * anlauf - kosten);
  return { zeilen, brutto, kosten, anlauf, netto,
    jePerson: personen ? Math.round(netto / personen) : 0,
    lohnkosten: Math.round(lohnkosten),
    lohntSich: netto > 0,
    amortisation: brutto > 0 ? Math.max(1, Math.round((kosten / (brutto * anlauf)) * 12)) : null };
}
