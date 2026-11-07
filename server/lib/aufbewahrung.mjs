/* ==========================================================================
   AUFBEWAHRUNG UND LÖSCHLAUF

   Die Aufbewahrungsfristen kamen mit Migration 5 → 6 in den Bestand:
   plandatenMonate, stammdatenMonate, gruendeMonate. Seitdem standen sie
   dort und taten nichts. Ein Löschkonzept, das nur aus drei Zahlen in einem
   Datensatz besteht, ist keines — Artikel 17 Absatz 1 Buchstabe a DSGVO
   verlangt die Löschung, nicht die Absicht dazu.

   Diese Datei führt sie aus. Sie ist rein: Eingabe Betrieb, Ausgabe neuer
   Betrieb plus Bericht. Kein Zugriff auf Speicher, keine Seiteneffekte,
   damit sich die Vorschau mit demselben Code rechnen lässt, der später auch
   löscht — und damit die Prüfungen sie erreichen.

   ---------------------------------------------------------------------------
   Was gelöscht wird und was nicht

   Drei Fristen, drei sehr verschiedene Eingriffe:

   Plandaten (24 Monate). Schichtzuweisungen, erfasste Zeiten, Stempelungen
   und die Änderungshistorie. Sie verschwinden vollständig. Die Untergrenze
   ist eine Produktentscheidung, angelehnt an § 16 Abs. 2 ArbZG: Dort sind
   (nur) die Aufzeichnungen über die über acht Stunden werktäglich
   hinausgehende Arbeitszeit mindestens zwei Jahre aufzubewahren — eine
   Mindestfrist für Mehrarbeitsnachweise, keine Frist für alle Plandaten
   (T-06, L-08). Weil die Anwendung diese Stunden nicht getrennt ablegt,
   gilt die Untergrenze einheitlich für Plan-, Zeit- und Stempeldaten; in
   den Branchen des § 2a SchwarzArbG trägt zusätzlich § 17 Abs. 1 MiLoG
   (siehe unten). Eine kürzere Einstellung warnt die Vorschau.

   Stammdaten (6 Monate nach Austritt). Ausgeschiedene Personen werden
   *anonymisiert*, nicht entfernt. Würde die Person verschwinden, zerfiele
   jeder vergangene Dienstplan, in dem sie steht — und genau der ist nach
   § 16 Abs. 2 ArbZG aufzubewahren. Name, Kontakt und Personalnummer gehen,
   die Kennung bleibt.

   Gründe (3 Monate). Freitexte zu Abwesenheiten sind Gesundheitsangaben
   nach Artikel 9 DSGVO und gehören am kürzesten aufbewahrt. Gelöscht wird
   nur der Text; dass jemand krank war, bleibt — sonst stimmt die
   Fehlzeitenstatistik nicht mehr.

   Nicht angefasst wird alles, was nach § 147 AO oder § 257 HGB aufzubewahren
   ist. Das betrifft in dieser Anwendung nur Rechnungen, und die liegen beim
   Betreiber, nicht im Betrieb.

   ---------------------------------------------------------------------------
   Warum die Untergrenze zwei Jahre bleibt, obwohl zwei Vorschriften greifen

   Neben § 16 Abs. 2 ArbZG verlangt § 17 Abs. 1 MiLoG für die Branchen des
   § 2a SchwarzArbG — darunter Bewachungsgewerbe, Gaststätten, Bau, Logistik
   und Fleischwirtschaft — Beginn, Ende und Dauer der täglichen Arbeitszeit
   aufzuzeichnen und diese Aufzeichnungen nach § 17 Abs. 1 Satz 2 ebenfalls
   mindestens zwei Jahre bereitzuhalten.

   Beide Fristen sind gleich lang, deshalb ändert sich an der Untergrenze
   nichts. Sie stehen hier trotzdem beide, weil sie verschiedene Betriebe
   treffen: Ein Sicherheitsdienst unterliegt § 17 MiLoG für die gesamte
   Arbeitszeit, nicht nur für die Stunden über acht. Wer die Aufbewahrung
   kürzer stellen will, muss wissen, welche der beiden ihn bindet.
   ========================================================================== */

/* Branchenmodule (WP-19.0, Nachtrag G3): Personenfelder der Module („personId|Tag")
   und das Modulprotokoll hängen am selben Lauf — siehe moduldatenFaellig unten. */
import { BRANCHENMODULE, modulprotokollFaellig, MODULPROTOKOLL_FRIST, MODULDATEN_AUFBEWAHRUNG,
  BEWACHV_FRISTTYPEN_BERECHENBAR } from "./branchenmodule.mjs";
import { regelGeprueft } from "./regelstatus.mjs";

/** Voreinstellungen, falls ein Betrieb sie noch nicht hat. */
export const VORGABE = {
  plandatenMonate: 24,
  stammdatenMonate: 6,
  gruendeMonate: 3,
};

/* Untergrenze der Plandatenfrist in Monaten (T-06, L-08). Angelehnt an § 16 Abs. 2 ArbZG — das ist eine
   Mindestfrist für die Nachweise der über acht Stunden werktäglich hinausgehenden Arbeitszeit, nicht für
   alle Plandaten — und, wo einschlägig, § 17 Abs. 1 MiLoG. Weil Mehrarbeitsnachweise nicht getrennt
   vorliegen, gilt sie in der Anwendung einheitlich; darunter löscht der Lauf nie (stichtage). Ob eine
   kürzere Einstellung im Einzelfall unzulässig wäre, hängt vom Betrieb ab und wird hier nicht beurteilt. */
export const PLANDATEN_MINDEST = 24;

const ZWEI = (n) => String(n).padStart(2, "0");

/** Datum minus Monate, als ISO-Tag. Ohne Zeitzonenfallen — reine Rechnung. */
export function minusMonate(isoTag, monate) {
  const [j, m, t] = String(isoTag).slice(0, 10).split("-").map(Number);
  /* Arithmetisch, nicht mit einer Schleife: Bis November 2026 stand hier
     `while (monat <= 0) monat += 12`. Mit einer Frist von Infinity endete
     das nie, mit einer sehr großen erst nach Minuten — und der tägliche
     Datenschutzlauf hätte den ganzen Server angehalten (WP-26, H1). */
  const gesamt = j * 12 + (m - 1) - Number(monate);
  if (!Number.isSafeInteger(gesamt)) throw new RangeError(`Ungültige Frist: ${monate}`);
  const jahr = Math.floor(gesamt / 12);
  const monat = gesamt - jahr * 12 + 1;
  /* Der 31. März minus einen Monat ist der 28. Februar, nicht der 3. März.
     Ohne diese Deckelung sprängen Stichtage über den Monat hinaus. */
  const letzterTag = new Date(Date.UTC(jahr, monat, 0)).getUTCDate();
  return `${jahr}-${ZWEI(monat)}-${ZWEI(Math.min(t, letzterTag))}`;
}

/* Standort-Ergebnisse (WP-20) am Stempel: Urteil, Anzeigetext und die abgeleiteten Altfelder. Sie sind
   nicht aufbewahrungspflichtig — § 16 ArbZG verlangt die Zeiten, nicht den Ort — und gehen deshalb mit der
   kurzen Frist der Gründe (gruendeMonate, Vorgabe 3 Monate). Start, Ende und Kennzeichen bleiben bis zur
   Plandatenfrist. */
export const STANDORT_FELDER = Object.freeze(["geoStart", "geoEnde", "ortStart", "ortEnde",
  "innerhalbStart", "innerhalbEnde", "geprueftStart", "geprueftEnde"]);
const hatStandort = (e) => !!e && typeof e === "object" && STANDORT_FELDER.some((f) => f in e);

/** Zeitdaten je Person und Tag mit der Plandatenfrist; istEingefroren: das eingefrorene Ist
    abgeschlossener Monate (WP-16, Review H1). */
export const PLAN_FELDER = Object.freeze(["abweichungen", "erfassung", "einstempeln", "istEingefroren"]);

/** Der Tagesanteil aus einem Schlüssel "personId|JJJJ-MM-TT". */
const tagVon = (schluessel) => {
  const teil = String(schluessel).split("|")[1] || "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(teil)) return teil;
  /* Monatsschlüssel des eingefrorenen Ists ("personId|JJJJ-MM", "*|JJJJ-MM"; WP-16 Nachtrag): es zählt der
     letzte Tag des Monats — gelöscht, wenn der ganze Monat aus der Frist ist. */
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(teil)) {
    const [j, mo] = teil.split("-").map(Number);
    return new Date(Date.UTC(j, mo, 0)).toISOString().slice(0, 10);
  }
  return null;
};

/* Grenzen für die drei Fristen (Monate). Eine Angabe außerhalb ist kein
   Wert, sondern ein Fehler: Sie wird beim Speichern abgewiesen (gestalt.mjs,
   aufbewahrungFehler) und vom Datenschutzlauf übersprungen. */
export const FRIST_GRENZEN = Object.freeze({ min: 1, max: 600 });
const FRIST_FELDER = ["plandatenMonate", "stammdatenMonate", "gruendeMonate"];

/**
 * Ist m.aufbewahrung wohlgeformt? Ohne Angabe, null oder 0 heißt „Vorgabe".
 * Sonst eine ganze Zahl in FRIST_GRENZEN — keine Brüche, nichts Negatives,
 * kein Infinity. zuletztGeraeumt: fehlt oder JJJJ-MM-TT.
 * @returns {string|null} der Grund, oder null
 */
export function aufbewahrungFehler(a) {
  if (a === undefined || a === null) return null;
  if (typeof a !== "object" || Array.isArray(a)) return "Aufbewahrung: kein Objekt.";
  /* modulprotokollMonate (Frist des Modulprotokolls je Betrieb) gibt es nicht mehr (zweiter Opus-Review M1):
     ein gespeicherter Altwert wirkt nicht und fällt beim nächsten Löschlauf weg. */
  for (const f of FRIST_FELDER) {
    const w = a[f];
    if (w === undefined || w === null || w === 0 || w === "") continue;
    const n = typeof w === "number" || typeof w === "string" ? Number(w) : NaN;
    if (!Number.isInteger(n) || n < FRIST_GRENZEN.min || n > FRIST_GRENZEN.max)
      return `Aufbewahrung: ${f} muss eine ganze Zahl von ${FRIST_GRENZEN.min} bis ${FRIST_GRENZEN.max} Monaten sein.`;
  }
  if (a.zuletztGeraeumt !== undefined && a.zuletztGeraeumt !== null
      && !/^\d{4}-\d{2}-\d{2}$/.test(String(a.zuletztGeraeumt)))
    return "Aufbewahrung: zuletztGeraeumt ist kein Datum.";
  return null;
}

/** Die drei Fristen eines Betriebs, mit Voreinstellungen aufgefüllt. */
export function fristen(m) {
  const a = (m && m.aufbewahrung) || {};
  /* Nur gültige Werte zählen (ganze Zahl in FRIST_GRENZEN); ein Altwert wie
     1.5 aus der früheren Oberfläche gilt als „Vorgabe" — angezeigt und
     gerechnet. Gelöscht wird mit ihm nie: Der Lauf überspringt einen
     Betrieb mit ungültiger Angabe und meldet ihn (aufbewahrungFehler). */
  const gueltig = (w) => {
    const n = Number(w);
    return Number.isInteger(n) && n >= FRIST_GRENZEN.min && n <= FRIST_GRENZEN.max ? n : null;
  };
  return {
    plandatenMonate: gueltig(a.plandatenMonate) ?? VORGABE.plandatenMonate,
    stammdatenMonate: gueltig(a.stammdatenMonate) ?? VORGABE.stammdatenMonate,
    gruendeMonate: gueltig(a.gruendeMonate) ?? VORGABE.gruendeMonate,
    zuletztGeraeumt: a.zuletztGeraeumt || null,
  };
}

/** Schalter CENTRIC_DATENSCHUTZLAUF: „aus", „vorschau" (Vorgabe) oder „an". */
export const DATENSCHUTZ_MODI = Object.freeze(["aus", "vorschau", "an"]);

/** Der Modus aus der Umgebung: Vorgabe „vorschau", unbekannte Werte ebenfalls. */
export function datenschutzModus(wert = typeof process !== "undefined" ? process.env.CENTRIC_DATENSCHUTZLAUF : undefined) {
  const w = String(wert || "").trim().toLowerCase();
  return DATENSCHUTZ_MODI.includes(w) ? w : "vorschau";
}

/** Eine Eingabe der Oberfläche als gültige Frist: ganze Monate, 1 bis 600. */
export function fristWert(v) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return FRIST_GRENZEN.min;
  return Math.min(FRIST_GRENZEN.max, Math.max(FRIST_GRENZEN.min, n));
}

/**
 * Welche Betriebe haben ihre Aufbewahrungsangabe gegenüber dem
 * gespeicherten Stand geändert (oder sind neu)? Nur diese prüft das
 * Speichern streng (gestalt.mjs) — ein ungültiger Altwert in einem anderen
 * Betrieb desselben Raums sperrt sonst das Speichern für alle (N-1).
 * @returns {(m: any) => boolean}
 */
export function aufbewahrungGeaendert(vorher) {
  if (!vorher || !Array.isArray(vorher.mandanten)) return () => true;
  const alt = new Map(vorher.mandanten.filter((m) => m && typeof m === "object")
    .map((m) => [String(m.id), JSON.stringify(m.aufbewahrung ?? null)]));
  return (m) => !alt.has(String(m && m.id)) || alt.get(String(m.id)) !== JSON.stringify(m.aufbewahrung ?? null);
}

/** Die drei Stichtage, ab denen rückwärts gelöscht wird. */
export function stichtage(m, heuteIso) {
  const f = fristen(m);
  return {
    /* Harte Untergrenze (WP-26, H2): Plan-, Zeit- und Stempeldaten werden nie
       vor PLANDATEN_MINDEST Monaten gelöscht — § 16 Abs. 2 ArbZG, § 17 Abs. 1
       MiLoG. Eine kürzere Einstellung warnt in der Vorschau (s. unten), aber
       sie löscht nicht mehr: Vorher genügte eine Planerin mit Frist 1, und der
       Löschlauf nahm Ist-Zeiten und Stempel des Vormonats mit. */
    plan: minusMonate(heuteIso, Math.max(f.plandatenMonate, PLANDATEN_MINDEST)),
    stamm: minusMonate(heuteIso, f.stammdatenMonate),
    grund: minusMonate(heuteIso, f.gruendeMonate),
    /* Standort-Ergebnisse: wie die Gründe (WP-20). */
    standort: minusMonate(heuteIso, f.gruendeMonate),
    fristen: f,
  };
}

/**
 * Moduldaten mit Personenbezug (Registry: `personenfelder`, Schlüssel
 * „personId|JJJJ-MM-TT"), die fällig sind — wie die übrigen Plandaten NUR nach
 * Datum (zweiter Opus-Review M2): Eine Anonymisierung entfernt keine
 * Zuordnungen; danach ist der Schlüssel pseudonym, wie in abweichungen. Und
 * nur nach einer GEPRÜFTEN Aufbewahrungsregel (Betreiber-Ergänzung A3,
 * MODULDATEN_AUFBEWAHRUNG, regelstatus.mjs): Ist sie ungeprüft, abgelaufen
 * oder zurückgezogen, wird nichts gelöscht — die Vorschau zählt es als
 * „zurückgehalten" und verlangt Prüfung/Freigabe. Die Frist ist nie kürzer
 * als die Plandatenfrist (PLANDATEN_MINDEST). Gilt unabhängig vom Schalter.
 *
 * Bewachungsgewerbe (T-08, L-10): Personenfelder von Modulen mit `bewachvFrist` (Wachbuch, Objektbericht)
 * bleiben auch bei geprüfter Regel liegen, solange die Regel keinen berechenbaren BewachV-Fristtyp nennt
 * (`bewachvFristtyp`, BEWACHV_FRISTTYPEN in branchenmodule.mjs). Sie zählen dann als zurückgehalten
 * (`bewachvZurueckgehalten`). Andere Moduldaten sind davon nicht berührt.
 * @returns {{ anzahl: number, zurueckgehalten: number, bewachvZurueckgehalten: number, felder: Record<string, Set<string>> }}
 */
function moduldatenFaellig(m, heuteIso, module, regel) {
  const felder = [...new Set((module || []).flatMap((x) => (x && Array.isArray(x.personenfelder) ? x.personenfelder : [])))];
  const monate = Math.max(Number.isInteger(Number(regel && regel.monate)) ? Number(regel.monate) : PLANDATEN_MINDEST,
    PLANDATEN_MINDEST, fristen(m).plandatenMonate);
  const stichtag = minusMonate(heuteIso, monate);
  const geprueft = regelGeprueft(regel, { heute: String(heuteIso).slice(0, 10) });
  const bewachvFelder = new Set((module || []).flatMap((x) => (x && x.bewachvFrist === true && Array.isArray(x.personenfelder) ? x.personenfelder : [])));
  const bewachvLoeschbar = !!regel && BEWACHV_FRISTTYPEN_BERECHENBAR.includes(regel.bewachvFristtyp);
  /** @type {Record<string, Set<string>>} */
  const raus = {};
  let anzahl = 0;
  let bewachvZurueck = 0;
  for (const f of felder) {
    const inhalt = m[f];
    if (!inhalt || typeof inhalt !== "object" || Array.isArray(inhalt)) continue;
    for (const k of Object.keys(inhalt)) {
      /* Rotationen („Kennung|von“): maßgeblich ist das Ende (bis), nicht der Beginn im Schlüssel — ein laufender oder
         offener Eintrag (Zugehörigkeit ohne Ende, Ziel) wird nie gelöscht. */
      const wert = inhalt[k];
      const tag = f === "rotationen" && istObjekt(wert) ? (typeof wert.bis === "string" ? wert.bis.slice(0, 10) : null) : tagVon(k);
      if (!tag || tag >= stichtag) continue;                    // unerwartete Form oder in der Frist: bleibt liegen
      if (bewachvFelder.has(f) && !bewachvLoeschbar) { bewachvZurueck++; continue; } // ohne BewachV-Fristtyp: bleibt (T-08)
      (raus[f] = raus[f] || new Set()).add(k);
      anzahl++;
    }
  }
  return geprueft ? { anzahl, zurueckgehalten: bewachvZurueck, bewachvZurueckgehalten: bewachvZurueck, felder: raus }
    /* Ungeprüfte Regel: alles zurückgehalten — der Grund ist dann die Regel, nicht der Fristtyp. */
    : { anzahl: 0, zurueckgehalten: anzahl + bewachvZurueck, bewachvZurueckgehalten: 0, felder: {} };
}

/** Hinweis, wenn eine Aufbewahrungsregel ungeprüft ist und deshalb nichts gelöscht wurde. */
const PRUEFHINWEIS = "Prüfung/Freigabe erforderlich: Die Aufbewahrungsregel für Branchenmodul-Daten bzw. das Modulprotokoll "
  + "ist nicht geprüft (FN-32). Bis dahin wird daraus nichts gelöscht.";
/** Hinweis, wenn Wachbuch-/Objektberichtsfelder mangels BewachV-Fristtyp zurückgehalten sind (T-08). */
const BEWACHV_HINWEIS = "Prüfung/Freigabe erforderlich: Für Wachbuch- und Objektberichtsdaten ist kein BewachV-Fristtyp "
  + "(Anknüpfung an Ereignis, Vertrags- oder Beschäftigungsende) hinterlegt. Bis dahin wird daraus nichts gelöscht.";

const istObjekt = (x) => !!x && typeof x === "object" && !Array.isArray(x);

/**
 * Personenbezug am Abschluss räumen (Review M2): abgewiesene Stempel und
 * Zähler von Personen, die anonymisiert oder nicht mehr im Betrieb sind,
 * und — mit `grundStichtag` (Frist der Gründe) — alle,
 * deren Tag davor liegt. Unverändert: dasselbe Objekt.
 * @param {any} w  m.monatsabschluss
 * @param {{personen?: any[], grundStichtag?: string|null, planStichtag?: string|null}} o
 * @returns {{wert: any, entfernt: number}}
 */
export function abschlussPersonenRaeumen(w, { personen, grundStichtag = null, planStichtag = null } = {}) {
  if (!istObjekt(w)) return { wert: w, entfernt: 0 };
  /* Abgelegte Revisionen (WP-16c) tragen die ausgegebenen Lohnzeilen je Personalnummer — personenbezogene Stunden.
     Sie gehen mit dem eingefrorenen Ist des Monats (Plandatenfrist); Kennung, Prüfsumme, Zeitpunkt und Berechtigte bleiben. */
  let revisionenGeraeumt = 0;
  if (planStichtag) {
    const neu = {};
    for (const [mon, e] of Object.entries(w)) {
      const abgelaufen = /^\d{4}-(0[1-9]|1[0-2])$/.test(mon) && `${mon}-31` < planStichtag;
      if (!abgelaufen || !istObjekt(e) || !Array.isArray(e.revisionen) || !e.revisionen.some((r) => istObjekt(r) && Array.isArray(r.zeilen))) { neu[mon] = e; continue; }
      revisionenGeraeumt += e.revisionen.filter((r) => istObjekt(r) && Array.isArray(r.zeilen)).length;
      neu[mon] = { ...e, revisionen: e.revisionen.map((r) => { if (!istObjekt(r) || !Array.isArray(r.zeilen)) return r;
        const { zeilen: _z, bez: _b, ...rest } = r; void _z; void _b; return { ...rest, zeilenGeloescht: true }; }) };
    }
    if (revisionenGeraeumt) { const inner = abschlussPersonenRaeumen(neu, { personen, grundStichtag }); return { wert: inner.wert, entfernt: inner.entfernt + revisionenGeraeumt }; }
  }
  const aktiv = Array.isArray(personen)
    ? new Set(personen.filter((p) => p && typeof p === "object" && p.anonym !== true).map((p) => String(p.id))) : null;
  const bleibt = (pid) => !aktiv || aktiv.has(String(pid));
  let entfernt = 0;
  const aus = {};
  for (const [mon, e] of Object.entries(w)) {
    if (!istObjekt(e) || (!Array.isArray(e.abgewiesen) && !istObjekt(e.abgewiesenGezaehlt))) { aus[mon] = e; continue; }
    const abgelaufen = (tag) => !!grundStichtag && String(tag) < grundStichtag;
    const liste = (Array.isArray(e.abgewiesen) ? e.abgewiesen : []).filter((x) => istObjekt(x) && bleibt(x.personId) && !abgelaufen(x.datum));
    const vorher = Array.isArray(e.abgewiesen) ? e.abgewiesen.length : 0;
    /* Zähler hängen am Monat: abgelaufen, wenn der letzte Tag des Monats vor dem Stichtag liegt. */
    const monatAbgelaufen = !!grundStichtag && /^\d{4}-(0[1-9]|1[0-2])$/.test(mon) && `${mon}-31` < grundStichtag;
    const z = istObjekt(e.abgewiesenGezaehlt) ? e.abgewiesenGezaehlt : {};
    const zNeu = monatAbgelaufen ? {} : Object.fromEntries(Object.entries(z).filter(([pid]) => bleibt(pid)));
    const weg = vorher - liste.length + Object.keys(z).length - Object.keys(zNeu).length;
    if (!weg) { aus[mon] = e; continue; }
    entfernt += weg;
    const { abgewiesen: _a, abgewiesenGezaehlt: _z, ...rest } = e;
    void _a; void _z;
    aus[mon] = { ...rest, ...(liste.length ? { abgewiesen: liste } : {}), ...(Object.keys(zNeu).length ? { abgewiesenGezaehlt: zNeu } : {}) };
  }
  return entfernt ? { wert: aus, entfernt } : { wert: w, entfernt: 0 };
}

/* --------------------------------------------------------------------------
   Vorschau
   -------------------------------------------------------------------------- */

/**
 * Was wäre heute fällig? Verändert nichts.
 *
 * personen   zur Anonymisierung fällige Personen
 * plandaten  Anzahl je Feld
 * gruende    Freitexte, die entfallen
 * abgewiesen abgewiesene Stempel/Zähler am Monatsabschluss nach der Frist der Gründe (WP-16)
 * moduldaten Einträge in Modul-Personenfeldern hinter der Frist (nur mit geprüfter Regel)
 * modulprotokoll  Einträge im Modulprotokoll nach dessen Frist (nur mit geprüfter Regel)
 * moduldatenZurueckgehalten, modulprotokollZurueckgehalten  wären fällig, Regel ungeprüft — nicht gelöscht
 * bewachvZurueckgehalten  davon Wachbuch-/Objektberichtsfelder ohne BewachV-Fristtyp (T-08)
 * pruefhinweis  „Prüfung/Freigabe erforderlich", wenn etwas zurückgehalten ist
 * gesamt     Summe aller Eingriffe
 *
 * @param {any} m
 * @param {string} heuteIso
 * @param {{ module?: readonly any[], regeln?: { moduldaten?: any, modulprotokoll?: any } }} [o]
 * @returns {{stichtage: object, personen: Array<object>, plandaten: object,
 *   planSumme: number, aenderungen: number, gruende: number, standort: number, abgewiesen: number,
 *   moduldaten: number, modulprotokoll: number, moduldatenZurueckgehalten: number,
 *   modulprotokollZurueckgehalten: number, bewachvZurueckgehalten: number, pruefhinweis: (string|null), gesamt: number,
 *   warnung: (string|null)}}
 */
export function vorschau(m, heuteIso, { module = BRANCHENMODULE, regeln = {} } = {}) {
  const st = stichtage(m, heuteIso);
  const personen = (m.personen || []).filter((p) => {
    if (!p || p.anonym || !p.austritt) return false;
    return String(p.austritt).slice(0, 10) <= st.stamm;
  });
  const md = moduldatenFaellig(m, heuteIso, module, regeln.moduldaten || MODULDATEN_AUFBEWAHRUNG);
  const mp = modulprotokollFaellig(m, heuteIso, { regel: regeln.modulprotokoll || MODULPROTOKOLL_FRIST });
  const modulprotokoll = mp.faellig;

  const plandaten = {};
  let planSumme = 0;
  /* istEingefroren (WP-16, Review H1): das eingefrorene Ist abgeschlossener Monate — Zeitdaten wie die Erfassung. */
  for (const feld of PLAN_FELDER) {
    const inhalt = m[feld];
    let n = 0;
    if (inhalt && typeof inhalt === "object") {
      for (const k of Object.keys(inhalt)) {
        const tag = tagVon(k);
        if (tag && tag < st.plan) n++;
      }
    }
    plandaten[feld] = n;
    planSumme += n;
  }

  /* Standort-Ergebnisse an Stempeln, die älter als die kurze Frist, aber noch nicht als Ganzes fällig sind. */
  let standort = 0;
  if (m.einstempeln && typeof m.einstempeln === "object") {
    for (const [k, e] of Object.entries(m.einstempeln)) {
      const tag = tagVon(k);
      if (tag && tag >= st.plan && tag < st.standort && hatStandort(e)) standort++;
    }
  }

  const aenderungen = (m.aenderungen || [])
    .filter((c) => c && c.datum && String(c.datum).slice(0, 10) < st.plan).length;

  /* Ein Grund zählt nur, wenn es ihn gibt und die Abwesenheit vorbei ist. */
  const gruende = (m.abwesenheiten || []).filter((a) => {
    if (!a) return false;
    const text = a.notiz || a.grund || "";
    if (!String(text).trim()) return false;
    const ende = String(a.bis || a.von || "").slice(0, 10);
    return ende && ende < st.grund;
  }).length;

  /* Abgewiesene Stempel am Monatsabschluss (WP-16, Review M2): Person, Tag, Uhrzeit — mit der Frist der Gründe. */
  const abgewiesen = abschlussPersonenRaeumen(m.monatsabschluss, { grundStichtag: st.grund, planStichtag: st.plan }).entfernt;

  const warnung = st.fristen.plandatenMonate < PLANDATEN_MINDEST
    ? `Die Frist für Plandaten steht auf ${st.fristen.plandatenMonate} Monaten. `
      + "§ 16 Abs. 2 Arbeitszeitgesetz verlangt eine Mindestaufbewahrung von zwei Jahren "
      + "für die Aufzeichnungen der über acht Stunden werktäglich hinausgehenden Arbeitszeit "
      + "(Mehrarbeitsnachweise) — nicht für alle Plandaten. Weil diese Nachweise in der "
      + "Anwendung nicht getrennt vorliegen, löscht der Lauf Plan-, Zeit- und Stempeldaten "
      + "trotzdem nie vor 24 Monaten. "
      + "In den Branchen des § 2a Schwarzarbeitsbekämpfungsgesetz — darunter "
      + "das Bewachungsgewerbe — kommt § 17 Abs. 1 Mindestlohngesetz hinzu: "
      + "dort sind Beginn, Ende und Dauer der gesamten täglichen Arbeitszeit "
      + "aufzuzeichnen und ebenfalls zwei Jahre bereitzuhalten."
    : null;

  return {
    stichtage: st,
    personen,
    plandaten,
    planSumme,
    aenderungen,
    gruende,
    standort,
    abgewiesen,
    moduldaten: md.anzahl,
    modulprotokoll,
    moduldatenZurueckgehalten: md.zurueckgehalten,
    modulprotokollZurueckgehalten: mp.zurueckgehalten,
    bewachvZurueckgehalten: md.bewachvZurueckgehalten,
    pruefhinweis: [(md.zurueckgehalten > md.bewachvZurueckgehalten) || mp.zurueckgehalten ? PRUEFHINWEIS : null,
      md.bewachvZurueckgehalten ? BEWACHV_HINWEIS : null].filter(Boolean).join(" ") || null,
    gesamt: personen.length + planSumme + aenderungen + gruende + standort + abgewiesen + md.anzahl + modulprotokoll,
    warnung,
  };
}

/* --------------------------------------------------------------------------
   Ausführen
   -------------------------------------------------------------------------- */

/** Eine Person anonymisieren — Kennung bleibt, damit der Plan hält. */
export function anonymisiere(p) {
  return {
    ...p,
    vorname: "",
    /* Ein lesbarer Platzhalter statt einer leeren Zeile: In alten Plänen
       muss noch erkennbar sein, dass dort jemand stand. */
    nachname: `Ausgeschieden ${String(p.id).slice(-4)}`,
    email: "",
    telefon: "",
    personalnummer: "",
    geburtstag: null,
    anschrift: "",
    notiz: "",
    /* Schutzangaben sind besonders schützenswert und für einen
       ausgeschiedenen Menschen ohne jeden Zweck. */
    einschraenkungen: {},
    schutz: undefined,
    anonym: true,
    anonymSeit: undefined,
  };
}

/**
 * Führt den Löschlauf aus.
 *
 * Der Bericht hat dieselbe Gestalt wie die Vorschau, damit die Oberfläche
 * beides gleich darstellt.
 *
 * @param {any} m
 * @param {string} heuteIso
 * @param {{ module?: readonly any[], regeln?: { moduldaten?: any, modulprotokoll?: any } }} [o]
 * @returns {{mandant: object, bericht: object}}
 */
export function raeumen(m, heuteIso, { module = BRANCHENMODULE, regeln = {} } = {}) {
  const plan = vorschau(m, heuteIso, { module, regeln });
  /* Eine Frist des Modulprotokolls je Betrieb (modulprotokollMonate) gibt es nicht mehr (M1): Sie fällt hier weg. */
  if (plan.gesamt === 0) {
    return {
      mandant: { ...m, aufbewahrung: { ...fristen(m), zuletztGeraeumt: heuteIso } },
      bericht: { ...plan, ausgefuehrt: true },
    };
  }
  const st = plan.stichtage;
  const faellig = new Set(plan.personen.map((p) => p.id));
  /* Moduldaten (Personenfelder der Branchenmodule): fällige Schlüssel entfernen (nur geprüfte Regel, nur nach Datum). */
  const md = moduldatenFaellig(m, heuteIso, module, regeln.moduldaten || MODULDATEN_AUFBEWAHRUNG);
  const moduldatenGeraeumt = Object.fromEntries(Object.entries(md.felder)
    .map(([f, raus]) => [f, Object.fromEntries(Object.entries(m[f]).filter(([k]) => !raus.has(k)))]));

  const gekuerzt = {};
  for (const feld of PLAN_FELDER) {
    const inhalt = m[feld];
    if (feld === "istEingefroren" && !(feld in m)) continue;
    if (!inhalt || typeof inhalt !== "object") { gekuerzt[feld] = inhalt; continue; }
    const neu = {};
    for (const [k, v] of Object.entries(inhalt)) {
      const tag = tagVon(k);
      /* Ein Schlüssel ohne erkennbares Datum bleibt liegen. Lieber eine
         unerwartete Form mitschleppen als sie stillschweigend löschen. */
      if (tag && tag < st.plan) continue;
      /* Standort-Ergebnisse gehen früher als der Stempel selbst (WP-20); die Zeiten bleiben. */
      if (feld === "einstempeln" && tag && tag < st.standort && hatStandort(v)) {
        const rest = { ...v };
        for (const f of STANDORT_FELDER) delete rest[f];
        neu[k] = rest;
        continue;
      }
      neu[k] = v;
    }
    gekuerzt[feld] = neu;
  }
  const personenNeu = (m.personen || []).map((p) => (faellig.has(p.id)
    ? { ...anonymisiere(p), anonymSeit: heuteIso } : p));
  /* Personalangaben im Freeze (WP-16, Nachtrag dritter Review H-1: `nm` je Person und Monat für die Lohnausgabe)
     gehen mit der Anonymisierung — wie im Personalstamm. */
  if (istObjekt(gekuerzt.istEingefroren) && faellig.size) {
    const anonym = new Map(personenNeu.filter((p) => faellig.has(p.id)).map((p) => [String(p.id), p]));
    const neu = {};
    for (const [k, v] of Object.entries(gekuerzt.istEingefroren)) {
      const a = anonym.get(String(k).split("|")[0]);
      neu[k] = a && istObjekt(v) && Array.isArray(v.nm) ? { ...v, nm: [a.personalnummer || a.id, a.nachname ?? null, a.vorname ?? null] } : v;
    }
    gekuerzt.istEingefroren = neu;
  }
  /* Abgewiesene Stempel (WP-16, Review M2): nach der Frist der Gründe und mit der Anonymisierung der Person. */
  if (istObjekt(m.monatsabschluss))
    gekuerzt.monatsabschluss = abschlussPersonenRaeumen(m.monatsabschluss, { personen: personenNeu, grundStichtag: st.grund, planStichtag: st.plan }).wert;

  return {
    mandant: {
      ...m,
      ...gekuerzt,
      personen: personenNeu,
      aenderungen: (m.aenderungen || [])
        .filter((c) => !(c && c.datum && String(c.datum).slice(0, 10) < st.plan)),
      abwesenheiten: (m.abwesenheiten || []).map((a) => {
        if (!a) return a;
        const ende = String(a.bis || a.von || "").slice(0, 10);
        if (!ende || ende >= st.grund) return a;
        if (!String(a.notiz || a.grund || "").trim()) return a;
        /* Nur der Text geht. Art und Zeitraum bleiben — ohne sie stimmt
           keine Fehlzeitenstatistik mehr. */
        return { ...a, notiz: "", grund: "", grundGeloescht: heuteIso };
      }),
      ...moduldatenGeraeumt,
      ...(plan.modulprotokoll ? { einstellungen: { ...m.einstellungen,
        modulprotokoll: modulprotokollFaellig(m, heuteIso, { regel: regeln.modulprotokoll || MODULPROTOKOLL_FRIST }).rest } } : {}),
      aufbewahrung: { ...fristen(m), zuletztGeraeumt: heuteIso },
    },
    bericht: { ...plan, ausgefuehrt: true },
  };
}

/** „1 Person" statt „1 Personen" — Zahlen im Text sind kein Formular. */
const zahlwort = (n, eins, viele) => `${n} ${n === 1 ? eins : viele}`;

/** Ein Satz für die Oberfläche und fürs Protokoll. */
export function berichtstext(b) {
  if (!b) return "Nichts fällig — alle Fristen eingehalten.";
  if (b.gesamt === 0) return b.pruefhinweis || "Nichts fällig — alle Fristen eingehalten.";
  const teile = [];
  if (b.personen.length)
    teile.push(`${zahlwort(b.personen.length, "Person", "Personen")} anonymisiert`);
  if (b.planSumme)
    teile.push(`${zahlwort(b.planSumme, "Plan- oder Zeiteintrag", "Plan- und Zeiteinträge")} gelöscht`);
  if (b.aenderungen)
    teile.push(`${zahlwort(b.aenderungen, "Änderungsvermerk", "Änderungsvermerke")} gelöscht`);
  if (b.standort)
    teile.push(`${zahlwort(b.standort, "Standort-Ergebnis", "Standort-Ergebnisse")} entfernt`);
  if (b.gruende)
    teile.push(`${zahlwort(b.gruende, "Abwesenheitsgrund", "Abwesenheitsgründe")} entfernt`);
  if (b.abgewiesen)
    teile.push(`${zahlwort(b.abgewiesen, "abgewiesener Stempel", "abgewiesene Stempel")} am Monatsabschluss entfernt`);
  if (b.moduldaten)
    teile.push(`${zahlwort(b.moduldaten, "Modulzuordnung", "Modulzuordnungen")} entfernt`);
  if (b.modulprotokoll)
    teile.push(`${zahlwort(b.modulprotokoll, "Eintrag", "Einträge")} im Modulprotokoll entfernt`);
  if (!teile.length) return b.pruefhinweis || "Nichts fällig — alle Fristen eingehalten.";
  return `${teile.join(", ")}.${b.pruefhinweis ? ` ${b.pruefhinweis}` : ""}`;
}
