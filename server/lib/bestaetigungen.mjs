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

/**
 * DER BEFUNDKATALOG (Review WP-10, M1 und H1). Ein bestätigter Befund wird
 * nur als Kennung aus diesem Katalog und Stufe gespeichert — nie als Text
 * des Clients: Ein Freitext wie „Frau X ist schwanger" ginge sonst ins
 * Protokoll und von dort an den Betriebsrat. Angezeigt wird der Text von
 * hier. `sperrt` ist die eine Stelle für die Fachentscheidung „warnen oder
 * sperren" (Oberfläche: SPERR_REGELN in src/warnstufen.js liest hier). Bis
 * zur Entscheidung des Nutzers gilt die strenge Variante des Integrations-
 * stands (Kette B). Ein sperrender Befund lässt sich nicht bestätigen — der
 * Server weist eine solche Bestätigung ab.
 * `schutz` markiert, was der Betriebsrat nur neutral sieht. `stufe` ist die
 * Stufe des Befunds — der Server übernimmt sie von hier, nicht vom Client
 * (Nachprüfung N3).
 */
export const BEFUND_KATALOG = Object.freeze({
  bestand: { text: "nicht im Bestand", quelle: "Beschäftigungsverhältnis", stufe: "recht", sperrt: true },
  schutz: { text: "Schutz- oder Einsatzregel der Person", quelle: "Schutzvorschrift", stufe: "recht", sperrt: true, schutz: true },
  /* Weiche Schutzbefunde (Ausnahme, Freistellung auf Verlangen) und nicht
     bewertbare (Daten fehlen) — aus derselben Schutzprüfung (schutzEinsatz, WP-11). */
  schutzWeich: { text: "Schutzvorschrift: Ausnahme oder Freistellung auf Verlangen", quelle: "Schutzvorschrift", stufe: "achtung", sperrt: false, schutz: true },
  schutzOffen: { text: "Schutzprüfung nicht bewertbar (Daten fehlen)", quelle: "Schutzvorschrift", stufe: "hinweis", sperrt: false, schutz: true },
  /* Nachprüfung WP-11: zulässig nach einer hinterlegten Ausnahme des Betriebs
     (etwa § 14 Abs. 2 Nr. 2 JArbSchG, mehrschichtig) — nur zur Kenntnis. */
  schutzHinweis: { text: "Schutzvorschrift: Ausnahme des Betriebs hinterlegt", quelle: "Schutzvorschrift", stufe: "hinweis", sperrt: false, schutz: true },
  keineNacht: { text: "keine Nachtdienste zugelassen", quelle: "Einsatzeinschränkung", stufe: "recht", sperrt: true, schutz: true },
  keinAlleindienst: { text: "darf nicht allein eingeteilt werden", quelle: "Einsatzeinschränkung", stufe: "recht", sperrt: true, schutz: true },
  maxDiensteWoche: { text: "Höchstzahl Dienste je Woche erreicht", quelle: "Einsatzeinschränkung", stufe: "recht", sperrt: true, schutz: true },
  qualifikationGesetzlich: { text: "gesetzlich verbindliche Qualifikation fehlt", quelle: "Rechtsvorschrift", stufe: "recht", sperrt: true },
  kompetenz: { text: "Einweisung am Gerät fehlt", quelle: "§ 4 MPBetreibV / § 12 BetrSichV", stufe: "recht", sperrt: true },
  ruhezeitGesetz: { text: "Ruhezeit unter 11 Stunden", quelle: "§ 5 ArbZG", stufe: "recht", sperrt: true },
  qualifikationBetrieblich: { text: "betrieblich verbindliche Qualifikation fehlt", quelle: "Vorgabe des Betriebs", stufe: "achtung", sperrt: false },
  ruhezeitBetrieb: { text: "Ruhezeit unter der Vorgabe von Tarif oder Betrieb", quelle: "Tarif oder Betrieb", stufe: "achtung", sperrt: false },
  verfuegbarkeit: { text: "nicht verfügbar", quelle: "Verfügbarkeit der Person", stufe: "achtung", sperrt: false },
  teilzeit: { text: "arbeitet an diesem Wochentag nicht", quelle: "Teilzeitvereinbarung", stufe: "achtung", sperrt: false },
  folge: { text: "Höchstzahl Dienste in Folge erreicht", quelle: "Einstellung des Betriebs", stufe: "achtung", sperrt: false },
  abwesend: { text: "abwesend", quelle: "Abwesenheit", stufe: "achtung", sperrt: false },
  /* WP-22: Lange Dienste und Mindestbesetzung. Ein Dienst über zehn Stunden
     ist nach Nutzerentscheidung automatisch erlaubt — nur ein Hinweis, keine
     Bestätigung, kein Protokoll, keine Mitteilung; ob eine Regelung nach § 7
     ArbZG ihn trägt, verantwortet der Betrieb. Die Mindestbesetzung warnt
     (Vorgabe des Betriebs, bestätigungspflichtig). */
  tagesgrenze: { text: "Dienst über zehn Stunden (Regelung nach § 7 ArbZG nötig)", quelle: "§ 3, § 7 ArbZG", stufe: "hinweis", sperrt: false },
  untergrenze: { text: "Mindestbesetzung unterschritten", quelle: "Vorgabe des Betriebs", stufe: "achtung", sperrt: false },
});
/** Sperrt diese Befundart? Unbekannte sperren (fail-closed). */
export const sperrtBefund = (regel) => (Object.prototype.hasOwnProperty.call(BEFUND_KATALOG, regel) ? BEFUND_KATALOG[regel].sperrt : true);
/** Anzeigetext eines Befunds aus dem Katalog. */
export const befundText = (regel) => (BEFUND_KATALOG[regel] || { text: "Befund" }).text;

/** Höchstens so viele neue Einträge je Speichern, so viele insgesamt (N1) —
    über der Gesamtgrenze werden neue abgewiesen, nie alte verdrängt (B1) —,
    und so viele je bestätigender Person und Tag (Bremse). */
export const BESTAETIGUNGEN_JE_SPEICHERN = 50;
export const BESTAETIGUNGEN_GESAMT = 5000;
export const BESTAETIGUNGEN_JE_TAG = 200;
/** Ab diesem Füllstand wird die Leitung gewarnt (80 % der Gesamtgrenze). */
export const BESTAETIGUNGEN_WARNUNG_AB = Math.floor(BESTAETIGUNGEN_GESAMT * 0.8);

/**
 * Füllstand des Bestätigungsprotokolls. Ab 80 % warnt die Anwendung die
 * Leitung — an der Grenze werden neue Bestätigungen abgewiesen, alte nie
 * verdrängt (Nachprüfung WP-10, B1). Archiv und Aufbewahrungslauf sind ein
 * eigenes Paket.
 * @returns {{ anzahl: number, grenze: number, warnung: boolean, voll: boolean, text: string | null }}
 */
export function protokollFuellstand(anzahl) {
  const n = Number.isFinite(anzahl) ? anzahl : 0;
  const voll = n >= BESTAETIGUNGEN_GESAMT, warnung = n >= BESTAETIGUNGEN_WARNUNG_AB;
  return { anzahl: n, grenze: BESTAETIGUNGEN_GESAMT, warnung, voll,
    text: voll ? `Das Bestätigungsprotokoll ist voll (${n} von ${BESTAETIGUNGEN_GESAMT}). Neue Bestätigungen werden abgewiesen, bis ältere archiviert sind.`
      : warnung ? `Das Bestätigungsprotokoll ist zu ${Math.floor(n / BESTAETIGUNGEN_GESAMT * 100)} % gefüllt (${n} von ${BESTAETIGUNGEN_GESAMT}). An der Grenze werden neue Bestätigungen abgewiesen — bitte die Archivierung planen.`
        : null };
}

const istObjekt = (x) => !!x && typeof x === "object" && !Array.isArray(x);
const gleichId = (a, b) => a !== null && a !== undefined && b !== null && b !== undefined && String(a) === String(b);
const name = (p) => (p ? `${p.vorname || ""} ${p.nachname || ""}`.trim() : "") || "Jemand";
const kuerzen = (t, n) => String(t ?? "").slice(0, n);
/** TT.MM.JJJJ — für Mitteilungen, die über den Jahreswechsel gelesen werden (Nachtrag WP-22b). */
const tagMitJahr = (d) => (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}` : "");
const tagKurz = (d) => (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d.slice(8, 10)}.${d.slice(5, 7)}.` : "");

/** Wer bei einem bestätigten Rechtsverstoß unterrichtet wird: die Leitung
    des Betriebs, nicht die bestätigende Person selbst, keine ausgetretene. */
export function leitungFuerBestaetigung(personen, ich, heute = new Date().toISOString().slice(0, 10)) {
  return (Array.isArray(personen) ? personen : []).filter((p) => istObjekt(p) && p.rolle === "leitung"
    && !gleichId(p.id, ich) && !p.anonym && !(typeof p.austritt === "string" && p.austritt && p.austritt < heute));
}

/**
 * Nachprüfung 9717ddf (M2): Nach einer Änderung an den Schutzangaben einer
 * Person widersprechen bestehende Einteilungen. Gespeichert wurde trotzdem —
 * Planung und Leitung bekommen eine dringende Mitteilung, neutral: Person,
 * Tag, „Einteilung widerspricht Schutz- oder Einsatzregel der Person". Eine
 * Kennung je Person, Tag und Empfänger, damit nichts doppelt kommt.
 */
export function schutzKonfliktMitteilungen(altM, neuM, konflikte, ich) {
  if (!istObjekt(neuM) || !Array.isArray(konflikte) || !konflikte.length) return neuM;
  const personen = (Array.isArray(neuM.personen) ? neuM.personen : Array.isArray(altM && altM.personen) ? altM.personen : []).filter(istObjekt);
  const heute = new Date().toISOString().slice(0, 10);
  const empfaenger = personen.filter((p) => (p.rolle === "leitung" || p.rolle === "planer") && !p.anonym
    && !(typeof p.austritt === "string" && p.austritt && p.austritt < heute));
  const vorhanden = new Set([...(Array.isArray(altM && altM.nachrichten) ? altM.nachrichten : []),
    ...(Array.isArray(neuM.nachrichten) ? neuM.nachrichten : [])].filter(istObjekt).map((n) => String(n.id)));
  const jetzt = new Date();
  const neue = [];
  for (const k of konflikte.slice(0, 50)) {
    const wer = personen.find((p) => gleichId(p.id, k.personId));
    for (const e of empfaenger) {
      const id = `n-schutzkonflikt-${k.personId}-${k.datum}-${e.id}`;
      if (vorhanden.has(id)) continue;
      vorhanden.add(id);
      neue.push({ id, personId: e.id, art: "planGeaendert", titel: kuerzen("Einteilung widerspricht Schutz- oder Einsatzregel", TITEL_MAX),
        text: kuerzen(`${name(wer)} · ${tagMitJahr(k.datum)} — Die Einteilung widerspricht einer Schutz- oder Einsatzregel der Person. Bitte umplanen.`, TEXT_MAX),
        ziel: "pruef", zeit: jetzt.toLocaleString("de-DE"), erstellt: jetzt.toISOString(), gelesen: false, dringend: true,
        quelle: { art: "schutzkonflikt", von: ich } });
    }
  }
  if (!neue.length) return neuM;
  return { ...neuM, nachrichten: [...neue, ...(Array.isArray(neuM.nachrichten) ? neuM.nachrichten
    : Array.isArray(altM && altM.nachrichten) ? altM.nachrichten : [])] };
}

/** Wie viele Personen haben Schutzangaben verloren (Mutterschutz, Schwerbehinderung, Geburtsdatum, Einwilligung)? */
export function schutzEntferntAnzahl(altM, neuM) {
  const alt = new Map((Array.isArray(altM && altM.personen) ? altM.personen : []).filter(istObjekt).map((p) => [String(p.id), p]));
  let n = 0;
  for (const p of (Array.isArray(neuM && neuM.personen) ? neuM.personen : []).filter(istObjekt)) {
    const a = alt.get(String(p.id));
    if (!a) continue;
    const weg = (f) => !!a[f] && !p[f];
    const einw = (x) => (Array.isArray(x.mutterschutzEinwilligungen) ? x.mutterschutzEinwilligungen.length : 0);
    if (weg("mutterschutz") || weg("schwerbehindert") || weg("geburtstag") || weg("geburtsdatum") || einw(p) < einw(a)) n++;
  }
  return n;
}

/**
 * Empfehlung aus Nachprüfung 948a4ba: Werden Schutzangaben entfernt, erfährt
 * es die Leitung — ohne Inhalt und ohne Person (wie viele, von wem).
 */
export function schutzEntferntMitteilungen(altM, neuM, ich) {
  if (!istObjekt(neuM)) return neuM;
  const n = schutzEntferntAnzahl(altM, neuM);
  if (!n) return neuM;
  const personen = (Array.isArray(altM && altM.personen) ? altM.personen : []).filter(istObjekt);
  const von = personen.find((p) => gleichId(p.id, ich));
  const jetzt = new Date();
  const neue = leitungFuerBestaetigung(personen, ich).map((l) => ({ id: `n-schutzentfernt-${jetzt.getTime()}-${l.id}`, personId: l.id,
    art: "planGeaendert", titel: kuerzen("Schutzangaben entfernt", TITEL_MAX),
    text: kuerzen(`Bei ${n} Person${n === 1 ? "" : "en"} wurden Schutzangaben entfernt — von ${name(von)}.`, TEXT_MAX),
    ziel: "personal", zeit: jetzt.toLocaleString("de-DE"), erstellt: jetzt.toISOString(), gelesen: false, dringend: false,
    quelle: { art: "schutzentfernt", von: ich } }));
  if (!neue.length) return neuM;
  return { ...neuM, nachrichten: [...neue, ...(Array.isArray(neuM.nachrichten) ? neuM.nachrichten
    : Array.isArray(altM && altM.nachrichten) ? altM.nachrichten : [])] };
}

/** Überschreitet das Protokoll mit dieser Übermittlung 80 %, bekommt die
    Leitung einmalig eine Mitteilung (feste Kennung je Betrieb). */
function fuellstandMitteilung(altM, neuM, ich) {
  const vorher = (Array.isArray(altM && altM.bestaetigungen) ? altM.bestaetigungen : []).length;
  const jetzt = neuM.bestaetigungen.length;
  if (vorher >= BESTAETIGUNGEN_WARNUNG_AB || jetzt < BESTAETIGUNGEN_WARNUNG_AB) return neuM;
  const f = protokollFuellstand(jetzt);
  const personen = (Array.isArray(altM && altM.personen) ? altM.personen : []).filter(istObjekt);
  const vorhanden = new Set([...(Array.isArray(altM && altM.nachrichten) ? altM.nachrichten : []),
    ...(Array.isArray(neuM.nachrichten) ? neuM.nachrichten : [])].filter(istObjekt).map((n) => String(n.id)));
  const jetztZeit = new Date();
  const neue = leitungFuerBestaetigung(personen, null).map((l) => ({ id: `n-protokoll80-${l.id}`, personId: l.id, art: "planGeaendert",
    titel: kuerzen("Bestätigungsprotokoll zu 80 % gefüllt", TITEL_MAX), text: kuerzen(f.text, TEXT_MAX), ziel: "pruef",
    zeit: jetztZeit.toLocaleString("de-DE"), erstellt: jetztZeit.toISOString(), gelesen: false,
    dringend: false, quelle: { art: "protokollFuellstand", anzahl: jetzt, von: ich } })).filter((n) => !vorhanden.has(n.id));
  if (!neue.length) return neuM;
  return { ...neuM, nachrichten: [...neue, ...(Array.isArray(neuM.nachrichten) ? neuM.nachrichten
    : Array.isArray(altM && altM.nachrichten) ? altM.nachrichten : [])] };
}

/**
 * Hängt die Mitteilungen an die Leitung für neu bestätigte Rechtsverstöße
 * an. Eine Mitteilung je Leitungsperson und Speichervorgang; die Kennung
 * hängt am ersten neuen Eintrag, ein zweites Speichern erzeugt nichts neu.
 * @returns {any} der Betrieb mit den neuen Mitteilungen vorn
 */
export function bestaetigungMitteilungen(altM, neuM, ich) {
  if (!istObjekt(neuM) || !Array.isArray(neuM.bestaetigungen)) return neuM;
  neuM = fuellstandMitteilung(altM, neuM, ich);
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
  /* Der Text kommt aus dem Befundkatalog, nicht vom Client (Review N1). */
  const text = recht.slice(0, 3).map((b) => `${b.art === "sammel" ? `${b.anzahl || 0} Einteilungen ${tagKurz(b.von)}–${tagKurz(b.bis)}` : `${name(person(b.personId))} · ${tagKurz(b.datum)}`} · ${
    befundText(Array.isArray(b.befunde) && istObjekt(b.befunde[0]) ? b.befunde[0].regel : null)}`).join("; ")
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
