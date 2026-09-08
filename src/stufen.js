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
    leistungen: ["Alles aus Business", "Zwei Branchenpakete enthalten",
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
export const PAKETE = [
  /* „sperreGesetz" steht bewusst im Kern und nicht in einem Zusatzpaket.

     Das gesetzliche Minimum ist kein Mehrwert, den man verkauft — es ist die
     Voraussetzung dafür, dass eine Dienstplanung ihren Zweck erfüllt. Eine
     Anwendung, die erkennt, dass jemand ohne die nach § 4 PflBG vorbehaltene
     Qualifikation eingeteilt ist, und schweigt, weil der Betrieb die kleinere
     Stufe gebucht hat, wäre nach einem Vorfall nicht zu verteidigen.

     Verkauft wird, was darüber liegt: eigene Regeln durchsetzen. Das ist
     „sperreEigen" und bleibt im Paket. */
  { id: "kern", name: "Kernplattform", pflicht: true,
    beschreibung: "Schichtplanung, Anträge, Zeiten, Stundenkonten, Auswertungen. "
      + "Gesetzlich zwingende Qualifikationen sperren den Einsatz in jeder Stufe.",
    merkmale: ["plan", "antraege", "zeiten", "konten", "qualifikationen", "export", "sperreGesetz"] },
  { id: "sicherheit", name: "Sicherheitsdienst", aufpreis: 79,
    beschreibung: "Objektbezogene Posten, Wachbuch, Standortprüfung beim Stempeln, "
      + "und eigene Vorgaben als harte Sperre durchsetzen.",
    merkmale: ["posten", "wachbuch", "sperreEigen", "geofence", "objektbericht"] },
  { id: "pflege", name: "Pflege", aufpreis: 89,
    beschreibung: "Fachkraftquote je Dienst, Übergabeprotokoll, Wohnbereichsplanung, Betreuungskräfte nach § 43b.",
    merkmale: ["fachkraftquote", "uebergabe", "bereichsplan", "pflegequal"] },
  { id: "klinik", name: "Klinik", aufpreis: 129,
    beschreibung: "Bereitschaftsdienst und Rufbereitschaft mit eigener Anrechnung, geteilte Dienste, Funktionsdienste, Rotationen.",
    merkmale: ["bereitschaftsdienst", "geteilterdienst", "funktionsdienst", "rotation", "uebergabe", "fachkraftquote"] },
  { id: "industrie", name: "Industrie und Anlagen", aufpreis: 59,
    beschreibung: "Anlagenbindung, Maschinenqualifikationen, Kontischichtmodelle mit Stufenversatz.",
    merkmale: ["anlagen", "maschinenqual", "kontimodelle"] },
];

export const paketVon = (id) => PAKETE.find((p) => p.id === id) || PAKETE[0];

/**
 * Was die gewählten Branchenpakete kosten.
 *
 * Enterprise enthält zwei Pakete. Welche zwei, entscheidet der Betrieb
 * nicht — es sind die teuersten der gewählten. Alles andere wäre eine
 * Falle: Wer Pflege und Klinik bucht und Industrie dazunimmt, dürfte
 * sonst schlechter dastehen als vorher.
 *
 * @param ids        gewählte Paket-Kennungen (ohne „kern")
 * @param paketeFrei wie viele davon in der Stufe enthalten sind
 */
export function paketkosten(ids, paketeFrei = 0) {
  const gewaehlt = PAKETE
    .filter((p) => !p.pflicht && (ids || []).includes(p.id))
    .sort((a, b) => (b.aufpreis || 0) - (a.aufpreis || 0));
  const frei = gewaehlt.slice(0, Math.max(0, paketeFrei));
  const zahlend = gewaehlt.slice(Math.max(0, paketeFrei));
  return {
    gewaehlt, frei, zahlend,
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
 */
export function preisFuer(stufe, planerGesamt, standortPersonen, paketIds = []) {
  const zusatzPlaner = Math.max(0, planerGesamt - stufe.planerInklusive);
  const summePlaner = zusatzPlaner * ZUSATZ_PLANER;
  const zuschlaege = standortzuschlaege(standortPersonen, stufe.standorteInklusive);
  const pakete = paketkosten(paketIds, stufe.paketeFrei || 0);
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
