/* ==========================================================================
   PAKETLISTE — die EINE Quelle der Branchenpakete (WP-I12b, Frage 1 aus docs/acc45/wp-i12-fragen.md)

   Die Liste (PAKETE) und die Frage „ist dieses Merkmal gebucht und nutzbar?“ (kannMerkmal) standen im
   Client (src/stufen.js, src/paketlogik.js); das Docker-Bild enthält src/ nicht. Hier stehen beide, ohne
   Abhängigkeit zur Oberfläche: der Rechenkern (server/lib/engine/befunde.mjs) wertet die Fachkraftquote
   damit serverseitig aus; src/stufen.js und src/paketlogik.js reichen dieselben Objekte nur weiter.
   Inhalte, Preise und Merkmale sind gegenüber der Fassung in src/stufen.js unverändert.
   ========================================================================== */
import { BRANCHENMODULE } from "./branchenmodule.mjs";
import { PAKET_MERKMALE, merkmalNutzbar, merkmaleInVorbereitung, paketNutzbar, paketZustand, paketBuchbar } from "./paketstand.mjs";

export const PAKETE_ROH = [
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
export function mitModulstand(p) {
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

export const PAKETE = PAKETE_ROH.map(mitModulstand);

export const paketVon = (id) => PAKETE.find((p) => p.id === id) || PAKETE[0];

/** Die gebuchten Pakete — nur eine echte Liste zählt (Review N3: keine Zeichenkette, kein Objekt). */
const gebucht = (m) => (m && Array.isArray(m.pakete) ? m.pakete : []);

/**
 * Ist ein Merkmal für diesen Betrieb freigeschaltet? Das Paket muss gebucht sein UND das
 * Merkmal nutzbar (nicht in der Registry oder Modul abgenommen). Ein geplantes Merkmal ist nie
 * freigeschaltet, auch nicht bei gebuchtem Paket.
 */
export function kannMerkmal(m, merkmal, liste = BRANCHENMODULE) {
  const aktiv = ["kern", ...gebucht(m)];
  return merkmalNutzbar(merkmal, liste)
    && PAKETE.filter((p) => aktiv.includes(p.id)).some((p) => p.merkmale.includes(merkmal));
}
