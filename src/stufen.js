/* ==========================================================================
   DAS PREISMODELL — eine Fassung, drei Leser

   Hier stehen die Zahlen, aus denen sich ein Monatspreis ergibt. Sie
   standen vorher zweimal: einmal in App.jsx für Abrechnung und
   Betreiberkonsole, einmal in main.jsx für den öffentlichen Rechner vor
   der Anmeldung. Zwei Fassungen derselben Preisliste sind eine zu viel —
   die zweite driftet, und was driftet, ist am Ende ein Preisversprechen,
   das die Anwendung nicht einhält. Genau das war passiert: In main.jsx
   fehlte `paketeFrei`, und ein Leistungstext lautete anders.

   Der Aufbau in drei Sätzen:

     Die Grundgebühr der Stufe deckt ein Kontingent an Planer-Zugängen
     und ein Kontingent an Standorten beliebiger Größe.

     Jeder Planer-Zugang darüber kostet eine feste Pauschale — unabhängig
     davon, wie groß der Betrieb ist.

     Jeder Standort über dem Kontingent kostet nach SEINER eigenen Größe,
     nicht nach der des Betriebs. Die Bänder dazu stehen in standorte.js,
     zusammen mit der Begründung, warum ein Standort unter fünfzehn
     Personen nichts kostet.

   Was nicht kostet: Beschäftigte, Sub-Planer, Betriebsrat und
   Organisationsleitung — in jeder Stufe unbegrenzt. Wer geplant wird,
   zahlt nicht.

   Die Website (eigenes Repo, website/build.py) führt dieselben Zahlen
   als Python-Fassung. Wer hier etwas ändert, ändert sie dort mit.
   ========================================================================== */

import { standortzuschlaege } from "./standorte.js";
import { BRANCHENMODULE } from "../server/lib/branchenmodule.mjs";
import { PAKET_MERKMALE, PAKET_FREIGABEN, PAKET_ZUSTAENDE, merkmalNutzbar, merkmaleInVorbereitung,
  paketNutzbar, paketZustand, paketBuchbar, paketAnzeige, pilotAktiv }
  from "../server/lib/paketstand.mjs";

export { paketNutzbar, merkmalNutzbar, merkmaleInVorbereitung, paketZustand, paketBuchbar,
  paketAnzeige, pilotAktiv, PAKET_ZUSTAENDE };

/* Werbung folgt dem Zustand (G9, Review F2): „enthalten" nur, solange mindestens ein
   Branchenpaket Zustand 5 hat. Sonst steht dort, was stimmt: noch nicht verfügbar. */
const BRANCHENPAKETE_ENTHALTEN = "Zwei Branchenpakete enthalten";
const BRANCHENPAKETE_BALD = "Zwei Branchenpakete – sobald verfügbar";
const einPaketBuchbar = (liste, freigaben) => Object.keys(PAKET_MERKMALE)
  .some((id) => id !== "kern" && paketBuchbar(id, liste, freigaben));

/** Leistungszeile zu den in Enterprise enthaltenen Branchenpaketen, passend zum Paketstand. */
export const branchenpaketeZeile = (liste = BRANCHENMODULE, freigaben = PAKET_FREIGABEN) =>
  einPaketBuchbar(liste, freigaben) ? BRANCHENPAKETE_ENTHALTEN : BRANCHENPAKETE_BALD;

/** Hinweis unter der Paketauswahl des Rechners, passend zum Paketstand. */
export const branchenpaketeHinweis = (liste = BRANCHENMODULE, freigaben = PAKET_FREIGABEN) =>
  einPaketBuchbar(liste, freigaben)
    ? "In Enterprise sind zwei Pakete enthalten — angerechnet werden die beiden teuersten."
    : "Branchenpakete sind in Vorbereitung und noch nicht buchbar. Sobald ein Paket verfügbar ist, "
      + "gehören in Enterprise zwei Pakete dazu — angerechnet werden dann die beiden teuersten. "
      + "Kein Paket wird ohne Ihre ausdrückliche Auswahl gebucht.";

/** Leistungsliste für die Anzeige: auch ein gespeicherter älterer Tariftext folgt dem Paketstand. */
export const leistungenAnzeige = (leistungen, liste = BRANCHENMODULE, freigaben = PAKET_FREIGABEN) =>
  (leistungen || []).map((z) => (z === BRANCHENPAKETE_ENTHALTEN || z === BRANCHENPAKETE_BALD
    ? branchenpaketeZeile(liste, freigaben) : z));

export const STUFEN = [
  { id: "basis", name: "Basis", grund: 89, planerInklusive: 1, standorteInklusive: 1,
    paketeFrei: 0,
    leistungen: ["Dienstplanung mit Rotationsmodellen", "Anträge und Tauschbörse",
      "Kalender-Feed und Weckzeiten", "Mobile Ansicht", "Datenmitnahme jederzeit"] },
  { id: "pro", name: "Business", grund: 159, planerInklusive: 3, standorteInklusive: 2,
    paketeFrei: 0,
    leistungen: ["Alles aus Basis", "Qualifikationen mit Ablauf", "Arbeitszeitprüfung",
      "Belastbarkeitsanalyse", "Lohnausgabe — ein Klick zur Lohnbuchhaltung"] },
  { id: "enterprise", name: "Enterprise", grund: 279, planerInklusive: 8, standorteInklusive: 4,
    paketeFrei: 2,
    leistungen: ["Alles aus Business", branchenpaketeZeile(),
      "Leistungsnachweis für Auftraggeber", "Auftragsverarbeitung nach Artikel 28",
      "Bevorzugter Rückruf"] },
];

export const stufeVon = (id) => STUFEN.find((s) => s.id === id) || STUFEN[0];

/* Ein Zugang über die eigene Planung hinaus ist eine bewusste
   Entscheidung — anders als Einstellen oder ein neuer Einsatzort trifft
   ein Betrieb sie absichtlich, und sie darf im Rang nur die Leitung
   treffen (RANG.leitung > RANG.planer in rollenvergabe.mjs). Deshalb
   braucht es dafür keine eigene Bestätigung mehr, wie es sie für
   Standorte einmal gab — die Rollenvergabe sperrt das an der Quelle. */
export const ZUSATZ_PLANER = 25;

/* Jenseits der Enterprise-Kapazität rechnet die Formel zwar weiter, aber
   ein Betrieb dieser Größe soll nicht allein vor einem Formular stehen.
   Ab hier zeigt die Oberfläche „Sprich uns an" statt einer Zahl. */
export const KONTAKT_AB_PLANER = 16;
export const KONTAKT_AB_ZUSCHLAGSSTANDORTE = 9;

/* --------------------------------------------------------------------------
   BRANCHENPAKETE

   Fachliche Erweiterungen über dem Kern, je Betrieb berechnet — nicht je
   Standort und nicht je Kopf. „kern" trägt keinen Aufpreis; es steht in
   der Liste, weil die Merkmalsprüfung (`kann()` in App.jsx) dieselbe
   Liste liest.
   ========================================================================== */
const PAKETE_ROH = [
  /* „sperreGesetz" steht bewusst im Kern und nicht in einem Zusatzpaket.

     Das gesetzliche Minimum ist kein Mehrwert, den man verkauft — es ist die
     Voraussetzung dafür, dass eine Dienstplanung ihren Zweck erfüllt. Eine
     Anwendung, die erkennt, dass jemand ohne die nach § 4 PflBG vorbehaltene
     Qualifikation eingeteilt ist, und schweigt, weil der Betrieb die kleinere
     Stufe gebucht hat, wäre nach einem Vorfall nicht zu verteidigen.

     Seit E-19 sperrt CENTRIC nicht mehr, es warnt — gesetzliche und eigene
     Vorgaben in jeder Stufe (E-21). „sperreEigen" bleibt als Merkmal stehen,
     damit bestehende Bestände und Auswertungen lesbar bleiben; die
     Warnung hängt nicht mehr daran. */
  { id: "kern", name: "Kernplattform", pflicht: true,
    beschreibung: "Schichtplanung, Anträge, Zeiten, Stundenkonten, Auswertungen. "
      + "Gesetzliche und eigene Vorgaben warnen in jeder Stufe, mit Bestätigungsprotokoll.",
    merkmale: PAKET_MERKMALE.kern },
  { id: "sicherheit", name: "Sicherheitsdienst", aufpreis: 79,
    verfuegbar: "Standortprüfung beim Stempeln und branchentypische Vorlagen für interne Vorgaben.",
    merkmale: PAKET_MERKMALE.sicherheit },
  { id: "pflege", name: "Pflege und Rettungsdienst", aufpreis: 89,
    verfuegbar: "Fachkraftquote je Dienst und Übergabeprotokoll.",
    merkmale: PAKET_MERKMALE.pflege },
  { id: "klinik", name: "Klinik", aufpreis: 129,
    verfuegbar: "Übergabeprotokoll und Fachkraftquote je Dienst.",
    merkmale: PAKET_MERKMALE.klinik },
  { id: "industrie", name: "Industrie, Technik und Anlagen", aufpreis: 59,
    verfuegbar: "Noch keine nutzbare Funktion.",
    merkmale: PAKET_MERKMALE.industrie },
];

/* Was ein Paket bewirbt, folgt dem Stand der Branchenmodule (Entscheidung G9,
   WP-19.0): Ein Modul, das noch „geplant" ist (nicht einschaltbar,
   server/lib/branchenmodule.mjs), steht nicht unter dem, was das Paket kann,
   sondern ausdrücklich „In Vorbereitung". Die Kennzeichnung kommt aus dem
   Registry-Status — keine zweite Liste, die driftet. `verfuegbar` ist der
   Text für das heute Nutzbare. Preise und Merkmale bleiben unverändert; über
   Zahlung und Buchbarkeit entscheidet diese Datei nicht. */
function mitModulstand(p) {
  if (p.pflicht) return { ...p, inVorbereitung: [], nutzbar: true, buchbar: true, zustand: 5 };
  const geplant = inVorbereitungModule(p);
  return { ...p, inVorbereitung: geplant.map((x) => x.id), nutzbar: paketNutzbar(p.id),
    zustand: paketZustand(p.id), buchbar: paketBuchbar(p.id),
    beschreibung: p.verfuegbar + (geplant.length ? ` In Vorbereitung: ${geplant.map((x) => x.name).join(", ")}.` : "") };
}

/** Die Registry-Module eines Pakets, die noch nicht nutzbar sind (Entscheidung G9). */
export function inVorbereitungModule(p, liste = BRANCHENMODULE) {
  const offen = new Set(merkmaleInVorbereitung(p.id, liste));
  return liste.filter((x) => offen.has(x.merkmal) && p.merkmale.includes(x.merkmal));
}

/**
 * Das Angebot der Pakete für Auswahl und Anzeige (Website-Rechner, Konsole).
 * Betreiberentscheidung G9: Nur Zustand 5 (buchbar und abrechenbar) ist
 * wählbar, beworben und mit Preis genannt; die Zielpreise bleiben, gelten
 * aber erst dann. Zustände 1–4: „In Vorbereitung" mit Zustand, ohne Preis.
 */
export function paketeAngebot(liste = BRANCHENMODULE, freigaben = PAKET_FREIGABEN) {
  return PAKETE_ROH.filter((p) => !p.pflicht).map((p) => {
    const zustand = paketZustand(p.id, liste, freigaben);
    const buchbar = zustand === 5;
    return { id: p.id, name: p.name, zustand, zustandName: PAKET_ZUSTAENDE[zustand],
      nutzbar: paketNutzbar(p.id, liste), buchbar,
      aufpreis: buchbar ? p.aufpreis : null,
      inVorbereitung: inVorbereitungModule(p, liste).map((x) => x.name) };
  });
}

/** Aus einer Auswahl nur das, was buchbar ist (Rechner, automatische Buchung): Zustand 5. */
export const buchbareAuswahl = (ids, liste = BRANCHENMODULE, freigaben = PAKET_FREIGABEN) =>
  (ids || []).filter((id) => id !== "kern" && PAKETE_ROH.some((p) => p.id === id)
    && paketBuchbar(id, liste, freigaben));
export const PAKETE = PAKETE_ROH.map(mitModulstand);

export const paketVon = (id) => PAKETE.find((p) => p.id === id) || PAKETE[0];

/**
 * Was die gewählten Branchenpakete kosten.
 *
 * Enterprise enthält zwei Pakete. Welche zwei, entscheidet der Betrieb
 * nicht — es sind die teuersten der gewählten. Alles andere wäre eine
 * Falle: Wer Pflege und Klinik bucht und Industrie dazunimmt, dürfte
 * sonst schlechter dastehen als vorher.
 *
 * Ein Paket unter Zustand 5 (G9) oder in einem Pilotbetrieb wird nicht
 * berechnet und belegt keinen der freien Plätze; es bleibt in `gewaehlt`
 * (der Bestand verliert nichts) und steht zusätzlich in `nichtBerechnet`.
 *
 * @param ids        gewählte Paket-Kennungen (ohne „kern")
 * @param paketeFrei wie viele davon in der Stufe enthalten sind
 * @param liste      Registry-Stand (Vorgabe: BRANCHENMODULE)
 * @param freigaben  Betreiberfreigaben (Vorgabe: PAKET_FREIGABEN)
 * @param pilot      Pilotbetrieb: nichts wird berechnet
 * @param abrechenbar  Abrechnungsgrund je Paket (Zustimmung oder Vertrag, paketstand.mjs). Vorgabe:
 *                     alles — nur für ein Angebot (Rechner) ohne Betrieb; jede Abrechnung eines
 *                     Betriebs geht über mandantPaketkosten (paketlogik.js) und übergibt den Grund.
 */
export function paketkosten(ids, paketeFrei = 0, liste = BRANCHENMODULE, freigaben = PAKET_FREIGABEN, pilot = false,
  abrechenbar = () => true) {
  const alle = PAKETE_ROH.filter((p) => !p.pflicht && (ids || []).includes(p.id)).map((p) => mitModulstand(p));
  const zaehlt = (p) => !pilot && paketBuchbar(p.id, liste, freigaben) && abrechenbar(p.id);
  const nichtBerechnet = alle.filter((p) => !zaehlt(p));
  const gewaehlt = alle.filter(zaehlt)
    .sort((a, b) => (b.aufpreis || 0) - (a.aufpreis || 0));
  const frei = gewaehlt.slice(0, Math.max(0, paketeFrei));
  const zahlend = gewaehlt.slice(Math.max(0, paketeFrei));
  return {
    gewaehlt: [...gewaehlt, ...nichtBerechnet], frei, zahlend, nichtBerechnet,
    summe: zahlend.reduce((a, p) => a + (p.aufpreis || 0), 0),
  };
}

/**
 * Der Monatspreis aus den drei — mit Paketen vier — Bausteinen.
 *
 * @param stufe            ein Eintrag aus STUFEN (oder db.tarife)
 * @param planerGesamt     Planer-Zugänge insgesamt, nicht nur die zusätzlichen
 * @param standortPersonen Personenzahl je Standort, beliebige Reihenfolge
 * @param paketIds         gewählte Branchenpakete
 * @param liste            Registry-Stand (Vorgabe: BRANCHENMODULE)
 * @param freigaben        Betreiberfreigaben je Paket (Vorgabe: PAKET_FREIGABEN)
 * @param pilot            kostenloser Pilotbetrieb: keine Paketpreise
 */
export function preisFuer(stufe, planerGesamt, standortPersonen, paketIds = [], liste = BRANCHENMODULE,
  freigaben = PAKET_FREIGABEN, pilot = false) {
  const zusatzPlaner = Math.max(0, planerGesamt - stufe.planerInklusive);
  const summePlaner = zusatzPlaner * ZUSATZ_PLANER;
  const zuschlaege = standortzuschlaege(standortPersonen, stufe.standorteInklusive);
  const pakete = paketkosten(paketIds, stufe.paketeFrei || 0, liste, freigaben, pilot);
  const gesamt = Math.round(
    (stufe.grund + summePlaner + zuschlaege.summe + pakete.summe) * 100) / 100;
  const kontaktEmpfohlen = planerGesamt > KONTAKT_AB_PLANER
    || zuschlaege.posten.length > KONTAKT_AB_ZUSCHLAGSSTANDORTE;
  return { stufe, planerGesamt, zusatzPlaner, summePlaner, zuschlaege,
    pakete, summePakete: pakete.summe, gesamt, kontaktEmpfohlen };
}

/**
 * Die kleinste Stufe, die das gewählte Planer-Kontingent ohne Aufpreis
 * trägt — die ehrlichste Antwort auf „was brauche ich". Wer weniger
 * zahlen will, wählt bewusst darunter.
 */
export function passendeStufe(planerGesamt) {
  return STUFEN.find((s) => planerGesamt <= s.planerInklusive) || STUFEN[STUFEN.length - 1];
}
