/* ==========================================================================
   PREISGESTALTUNG — was der Betreiber jenseits der drei Tarife entscheidet

   Die Tarifrechnung in preis() ist gut für den Regelfall: drei Stufen,
   Preis je Standort, Mengenstaffel über die Zahl der Standorte. Für alles
   darüber hinaus gab es nichts — und „alles darüber hinaus" ist im Vertrieb
   der Normalfall, sobald jemand telefoniert hat.

   Drei Dinge fehlten, und sie sind verschieden genug, um getrennt zu
   bleiben:

   Der Sonderpreis ersetzt die Rechnung. Ein Haus mit vierzig Standorten und
   eigenen Anforderungen bekommt eine Zahl, nicht eine Stufe. Was der Tarif
   ergeben hätte, bleibt sichtbar — sonst weiß in einem Jahr niemand mehr,
   ob der Preis günstig war.

   Die Freizeit befristet, was heute nur „Testphase" heißt. Der Status
   „test" ist ein Zustand des Vertrags; ein kostenloser Monat für einen
   zahlenden Kunden ist etwas anderes. Deshalb ein eigenes Feld mit eigenem
   Datum, das nach Ablauf von selbst greift — niemand muss daran denken.

   Die Aussetzung überspringt einzelne Monate. Ein Betrieb, der ein Quartal
   pausiert, soll weder gekündigt noch gelöscht werden müssen. Sie zählt in
   ganzen Monaten, weil Rechnungen in ganzen Monaten laufen.

   ---------------------------------------------------------------------------
   Warum das hier steht und nicht in App.jsx

   Preisregeln entscheiden über Geld und werden selten angefasst. Beides
   spricht dafür, sie prüfbar zu halten: reine Funktionen, kein Zustand,
   keine Oberfläche. Der Rechenweg oben ruft sie auf, die Prüfungen auch.

   ---------------------------------------------------------------------------
   Der Rabatt, der nie einer war

   `rabattGrund` stand seit jeher im Datensatz, war in der Betreiberkonsole
   als Prozentfeld bedienbar — und wurde in `preis()` nie gelesen. Wer ihn
   auf 20 % stellte, sah dieselbe Rechnung wie vorher. Er wird hier
   mitverarbeitet, damit das Feld hält, was es zeigt.
   ========================================================================== */

/** Voreinstellung: nichts Besonderes vereinbart. */
export const LEER = {
  sonderpreis: null,      // { betrag, bezeichnung }
  freiBis: null,          // "JJJJ-MM-TT" — letzter kostenloser Tag, einschließlich
  freiGrund: "",
  aussetzungen: [],       // [{ von: "JJJJ-MM", bis: "JJJJ-MM", grund }]
};

const ZAHL = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const TAG = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? String(v) : null);
const MONAT = (v) => (/^\d{4}-\d{2}$/.test(String(v)) ? String(v) : null);

/**
 * Die Preisgestaltung eines Betriebs, mit Voreinstellungen aufgefüllt.
 *
 * Nimmt alles entgegen, was in einem gewachsenen Datensatz stehen kann —
 * fehlende Felder, Zahlen als Zeichenkette, halbe Zeiträume — und gibt
 * etwas zurück, mit dem sich rechnen lässt.
 */
export function gestaltung(m) {
  const g = (m && m.preisgestaltung) || {};
  const betrag = g.sonderpreis ? ZAHL(g.sonderpreis.betrag) : 0;
  return {
    /* Ein Sonderpreis von null ist eine Aussage: „kostet nichts". Er wird
       deshalb nur dann verworfen, wenn gar kein Betrag dasteht. */
    sonderpreis: g.sonderpreis && betrag >= 0
      ? { betrag: Math.round(betrag * 100) / 100,
          bezeichnung: String(g.sonderpreis.bezeichnung || "").trim() || "Individuelle Vereinbarung" }
      : null,
    freiBis: TAG(g.freiBis),
    freiGrund: String(g.freiGrund || "").trim(),
    aussetzungen: (Array.isArray(g.aussetzungen) ? g.aussetzungen : [])
      .map((a) => ({ von: MONAT(a && a.von), bis: MONAT(a && a.bis) || MONAT(a && a.von),
        grund: String((a && a.grund) || "").trim() }))
      .filter((a) => a.von && a.bis && a.von <= a.bis),
  };
}

/** Gilt am angegebenen Tag eine kostenlose Zeit? */
export function istFrei(m, isoTag) {
  const g = gestaltung(m);
  if (!g.freiBis) return false;
  return String(isoTag).slice(0, 10) <= g.freiBis;
}

/** Ist dieser Abrechnungsmonat ausgesetzt? Wenn ja, welcher Zeitraum. */
export function aussetzungFuer(m, ym) {
  const monat = MONAT(String(ym).slice(0, 7));
  if (!monat) return null;
  return gestaltung(m).aussetzungen.find((a) => a.von <= monat && monat <= a.bis) || null;
}

/** Wie viele Monate umfasst ein Aussetzungszeitraum? Beide Enden zählen mit. */
export function monateZwischen(von, bis) {
  const [jv, mv] = String(von).split("-").map(Number);
  const [jb, mb] = String(bis).split("-").map(Number);
  return (jb - jv) * 12 + (mb - mv) + 1;
}

/**
 * Der Nettobetrag eines Monats, nachdem alle Vereinbarungen gegriffen haben.
 *
 * `berechnet` ist, was die Tarifrechnung ergeben hat. Die Reihenfolge ist
 * nicht beliebig: Der Sonderpreis ersetzt die Tarifrechnung, der Rabatt
 * wirkt auf das Ergebnis, und die kostenlose Zeit sowie die Aussetzung
 * setzen alles auf null. Andersherum gerechnet käme auf einen ausgesetzten
 * Monat noch ein Rabatt — was niemand versteht und niemand braucht.
 *
 * @returns {{netto: number, herkunft: string, rabatt: number, text: string,
 *   frei: boolean, ausgesetzt: (object|null), tarifwert: number}}
 */
export function monatspreis(m, berechnet, ym, heuteIso) {
  const g = gestaltung(m);
  const tarifwert = Math.round(ZAHL(berechnet) * 100) / 100;

  /* Ein Rabatt über 100 % ergibt einen negativen Preis — eine Gutschrift,
     die niemand beabsichtigt hat. Deshalb gedeckelt. */
  const rabatt = Math.min(1, Math.max(0, ZAHL(m && m.rabattGrund)));

  const grundlage = g.sonderpreis ? g.sonderpreis.betrag : tarifwert;
  const herkunft = g.sonderpreis ? "sonderpreis" : "tarif";
  let netto = Math.round(grundlage * (1 - rabatt) * 100) / 100;

  /* Für die kostenlose Zeit zählt der erste Tag des Abrechnungsmonats.
     Wer bis zum 15. frei hat, hat den Monat frei — halbe Monate wären
     zwar genauer, aber ein geschenkter Monat wird nicht anteilig
     zurückgefordert. Wer es taggenau will, setzt freiBis auf den
     Monatsletzten. */
  const monatsAnfang = `${String(ym).slice(0, 7)}-01`;
  const frei = !!g.freiBis && monatsAnfang <= g.freiBis;
  const ausgesetzt = aussetzungFuer(m, ym);
  if (frei || ausgesetzt) netto = 0;

  const text = ausgesetzt
    ? `Zahlung ausgesetzt${ausgesetzt.grund ? ` — ${ausgesetzt.grund}` : ""}`
    : frei
      ? `Kostenlos bis ${g.freiBis}${g.freiGrund ? ` — ${g.freiGrund}` : ""}`
      : g.sonderpreis
        ? g.sonderpreis.bezeichnung
        : "Nach Tarif";

  return { netto, herkunft, rabatt, text, frei, ausgesetzt, tarifwert,
    /* Was die Vereinbarung gegenüber dem Tarif ausmacht. Negativ heißt
       günstiger — die übliche Leserichtung bei einem Nachlass. */
    abweichung: Math.round((netto - tarifwert) * 100) / 100,
    heute: heuteIso || null };
}

/**
 * Soll für diesen Monat überhaupt eine Rechnung entstehen?
 *
 * Eine Rechnung über null Euro ist keine Freundlichkeit, sondern ein
 * Beleg, den jemand ablegen, prüfen und archivieren muss. Ausgesetzte und
 * kostenlose Monate erzeugen deshalb keine.
 */
export function rechnungFaellig(m, ym) {
  const monatsAnfang = `${String(ym).slice(0, 7)}-01`;
  if (aussetzungFuer(m, ym)) return { faellig: false, grund: "ausgesetzt" };
  if (istFrei(m, monatsAnfang)) return { faellig: false, grund: "kostenlos" };
  return { faellig: true, grund: null };
}

/** Ein Satz für die Konsole — was gilt hier gerade, und bis wann. */
export function lagetext(m, heuteIso) {
  const g = gestaltung(m);
  const teile = [];
  if (g.sonderpreis)
    teile.push(`Sonderpreis ${g.sonderpreis.betrag.toFixed(2)} € — ${g.sonderpreis.bezeichnung}`);
  if (g.freiBis)
    teile.push(istFrei(m, heuteIso)
      ? `kostenlos noch bis ${g.freiBis}`
      : `kostenlose Zeit endete am ${g.freiBis}`);
  const offen = g.aussetzungen.filter((a) => a.bis >= String(heuteIso).slice(0, 7));
  if (offen.length)
    teile.push(offen.length === 1
      ? `Zahlung ausgesetzt ${offen[0].von} bis ${offen[0].bis}`
      : `${offen.length} Aussetzungen vorgemerkt`);
  return teile.length ? teile.join(" · ") : "Nach Tarif, keine Sondervereinbarung";
}
