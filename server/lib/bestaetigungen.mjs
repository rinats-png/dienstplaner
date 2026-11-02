/* ==========================================================================
   BESTÄTIGUNGSPROTOKOLL — Warnen statt sperren (Kette A, E-19; WP-10 d.1/d.4)

   Wer eine Einteilung trotz Befund vornimmt, bestätigt sie im Warndialog.
   Die Oberfläche legt dafür einen Eintrag in `bestaetigungen` an
   (src/warnstufen.js, bestaetigungsEintraege). Was davon gespeichert wird,
   entscheidet der Server (rechte.mjs, bestaetigungenZusammen): nur neue
   Einträge, Wer, Rolle und Zeit setzt er selbst, Bestehendes ist
   unveränderlich.

   Diese Datei erzeugt die Mitteilung an die Leitung, wenn eine gesetzliche
   Vorgabe bewusst übergangen wurde (Stufe „recht"). Bis WP-10 baute die
   Oberfläche sie selbst — für die Schichtverantwortung lehnte der Server die
   ganze Speicherung dann ab, weil die Leitung nicht zu ihrem Bereich gehört.
   Jetzt wie beim Notruf (mitteilungen.mjs): nur der Server, aus dem
   fachlichen Vorgang, mit fester Kennung, zugestellt nach dem Speichern
   (neueServermitteilungen erkennt sie an `quelle`).

   Rein: keine Ablage, kein Versand.
   ========================================================================== */
import { ZUSTELLARTEN, TITEL_MAX, TEXT_MAX } from "./mitteilungen.mjs";

/** Die Gründe, die der Warndialog anbietet — dieselben Kennungen wie
    ABWEICHUNG_GRUENDE in src/warnstufen.js (pruefungen/bestaetigungen.test.js
    vergleicht beide). */
export const ABWEICHUNG_GRUENDE = ["notfall", "bewilligung", "tarif", "sonstiges"];

const istObjekt = (x) => !!x && typeof x === "object" && !Array.isArray(x);
const gleichId = (a, b) => a !== null && a !== undefined && b !== null && b !== undefined && String(a) === String(b);
const name = (p) => (p ? `${p.vorname || ""} ${p.nachname || ""}`.trim() : "") || "Jemand";
const kuerzen = (t, n) => String(t ?? "").slice(0, n);
const tagKurz = (d) => (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d.slice(8, 10)}.${d.slice(5, 7)}.` : "");

/** Wer bei einem bestätigten Rechtsverstoß unterrichtet wird: die Leitung
    des Betriebs, nicht die bestätigende Person selbst, keine ausgetretene. */
export function leitungFuerBestaetigung(personen, ich, heute = new Date().toISOString().slice(0, 10)) {
  return (Array.isArray(personen) ? personen : []).filter((p) => istObjekt(p) && p.rolle === "leitung"
    && !gleichId(p.id, ich) && !p.anonym && !(typeof p.austritt === "string" && p.austritt && p.austritt < heute));
}

/**
 * Hängt die Mitteilungen an die Leitung für neu bestätigte Rechtsverstöße
 * an. Eine Mitteilung je Leitungsperson und Speichervorgang; die Kennung
 * hängt am ersten neuen Eintrag, ein zweites Speichern erzeugt nichts neu.
 * @returns {any} der Betrieb mit den neuen Mitteilungen vorn
 */
export function bestaetigungMitteilungen(altM, neuM, ich) {
  if (!istObjekt(neuM) || !Array.isArray(neuM.bestaetigungen)) return neuM;
  const alt = new Set((Array.isArray(altM && altM.bestaetigungen) ? altM.bestaetigungen : [])
    .filter(istObjekt).map((b) => String(b.id)));
  const recht = neuM.bestaetigungen.filter((b) => istObjekt(b) && !alt.has(String(b.id)) && b.stufe === "recht");
  if (!recht.length) return neuM;
  const personen = (Array.isArray(altM && altM.personen) ? altM.personen : []).filter(istObjekt);
  const person = (id) => personen.find((p) => gleichId(p.id, id));
  const von = person(ich);
  const vorhanden = new Set([...(Array.isArray(altM && altM.nachrichten) ? altM.nachrichten : []),
    ...(Array.isArray(neuM.nachrichten) ? neuM.nachrichten : [])].filter(istObjekt).map((n) => String(n.id)));
  const titel = recht.length === 1 ? "Rechtsverstoß bewusst bestätigt" : `${recht.length} Rechtsverstöße bewusst bestätigt`;
  const ohneGrund = recht.some((b) => b.ohneGrund);
  const text = recht.slice(0, 3).map((b) => `${name(person(b.personId))} · ${tagKurz(b.datum)} · ${
    (Array.isArray(b.befunde) && istObjekt(b.befunde[0]) ? b.befunde[0].text : "") || "Befund"}`).join("; ")
    + ` — bestätigt von ${name(von)}${ohneGrund ? ", ohne Grund" : ""}`;
  const jetzt = new Date();
  const neue = [];
  for (const l of leitungFuerBestaetigung(personen, ich)) {
    const id = `n-bestaetigung-${recht[0].id}-${l.id}`;
    if (vorhanden.has(id)) continue;
    vorhanden.add(id);
    neue.push({ id, personId: l.id, art: "planGeaendert", titel: kuerzen(titel, TITEL_MAX), text: kuerzen(text, TEXT_MAX),
      ziel: "pruef", zeit: jetzt.toLocaleString("de-DE"), erstellt: jetzt.toISOString(), gelesen: false,
      dringend: !!(ZUSTELLARTEN.planGeaendert || {}).dringend,
      quelle: { art: "bestaetigung", ids: recht.map((b) => b.id).slice(0, 50), von: ich } });
  }
  if (!neue.length) return neuM;
  return { ...neuM, nachrichten: [...neue, ...(Array.isArray(neuM.nachrichten) ? neuM.nachrichten
    : Array.isArray(altM && altM.nachrichten) ? altM.nachrichten : [])] };
}
