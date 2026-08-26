/* ==========================================================================
   LEERER BETRIEB

   Der Selbststart legte bisher nur Zugänge an, keinen Bestand. Beim ersten
   Öffnen fand die Anwendung nichts vor und erzeugte ihre Beispieldaten —
   drei erfundene Betriebe. Wer „Pflegeheim Sonnenhof" eingab und sich
   anmeldete, landete in der „Nordwacht Sicherheitsdienste GmbH" mit
   erfundenem Wachpersonal. Nachgestellt und bestätigt.

   Der eingegebene Name und die gewählte Branche verschwanden dabei
   vollständig, und es widersprach dem eigenen Versprechen: „Der Betrieb ist
   vollständig leer — keine erfundenen Namen, keine Beispiel-Dienstpläne."

   Diese Datei baut, was dort stehen sollte: ein Betrieb mit dem echten
   Namen, dem passenden Branchenpaket, drei Dienstarten und den gesetzlichen
   Grundwerten. Kein Personal, kein Plan, kein Antrag.
   ========================================================================== */

import { MATRIX } from "./rechte.mjs";

/* Muss zu VERSION in src/migration.js passen. Weicht es ab, zieht die
   Migration den Bestand beim ersten Öffnen hoch — unschön, aber harmlos. */
export const VERSION = 8;

/* Wie die Einheit im jeweiligen Gewerbe heißt. Das prägt die halbe
   Oberfläche: „Wohnbereich 1" gegen „Schichtgruppe 1". */
const EINHEIT_LABEL = {
  pflege: "Wohnbereich",
  klinik: "Station",
  sicherheit: "Schichtgruppe",
  industrie: "Schichtgruppe",
  sonstige: "Schichtgruppe",
};

/* Drei Dienste im Achtstundenrhythmus — der Normalfall im durchgehenden
   Schichtbetrieb und ein Ausgangspunkt, der sich ändern lässt. */
const DIENSTARTEN = [
  { id: "F", name: "Frühdienst", kurz: "F", start: "06:00", ende: "14:00",
    pause: 30, farbe: "#3C7C8C", ort: "" },
  { id: "S", name: "Spätdienst", kurz: "S", start: "14:00", ende: "22:00",
    pause: 30, farbe: "#A8621B", ort: "" },
  { id: "N", name: "Nachtdienst", kurz: "N", start: "22:00", ende: "06:00",
    pause: 45, farbe: "#43507E", ort: "" },
];

/* Fachkraftquote je Dienst — nur in Pflege und Klinik geprüft. Die Werte
   sind Vorschläge am unteren Rand des Üblichen, keine Vorgaben. */
const QUOTE = { pflege: { tag: 0.40, nacht: 0.50 }, klinik: { tag: 0.50, nacht: 0.50 } };

/* Qualifikationen, die im jeweiligen Gewerbe fast immer gebraucht werden.
   Angelegt, aber keiner Person zugeordnet — es gibt ja noch keine. */
const QUALIFIKATIONEN = {
  pflege: [
    { id: "q1", name: "Pflegefachkraft", kurz: "PFK", monate: null, pflicht: true, fachkraft: true },
    { id: "q2", name: "Betreuungskraft § 43b", kurz: "BK", monate: null, pflicht: false, fachkraft: false },
    { id: "q3", name: "Erste Hilfe", kurz: "EH", monate: 24, pflicht: true, fachkraft: false },
    { id: "q4", name: "Hygieneschulung", kurz: "HYG", monate: 12, pflicht: true, fachkraft: false },
  ],
  klinik: [
    { id: "q1", name: "Pflegefachkraft", kurz: "PFK", monate: null, pflicht: true, fachkraft: true },
    { id: "q2", name: "Erste Hilfe", kurz: "EH", monate: 24, pflicht: true, fachkraft: false },
    { id: "q3", name: "Hygieneschulung", kurz: "HYG", monate: 12, pflicht: true, fachkraft: false },
  ],
  sicherheit: [
    { id: "q1", name: "Sachkunde § 34a GewO", kurz: "SK", monate: null, pflicht: true, fachkraft: true },
    { id: "q2", name: "Erste Hilfe", kurz: "EH", monate: 24, pflicht: true, fachkraft: false },
    { id: "q3", name: "Führungszeugnis", kurz: "FZ", monate: 36, pflicht: true, fachkraft: false },
  ],
  industrie: [
    { id: "q1", name: "Erste Hilfe", kurz: "EH", monate: 24, pflicht: true, fachkraft: false },
    { id: "q2", name: "Brandschutzhelfer", kurz: "BSH", monate: 36, pflicht: false, fachkraft: false },
  ],
  sonstige: [
    { id: "q1", name: "Erste Hilfe", kurz: "EH", monate: 24, pflicht: true, fachkraft: false },
  ],
};

/** Montag der laufenden Woche — Ankerpunkt für die Schichtfolge. */
function ankerMontag(jetzt) {
  const d = new Date(jetzt);
  const versatz = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - versatz);
  return d.toISOString().slice(0, 10);
}

/**
 * Baut einen leeren, aber benutzbaren Betrieb.
 *
 * @param {object} o
 * @param {string} o.name      Betriebsname, wie eingegeben
 * @param {string} o.branche   pflege | klinik | sicherheit | industrie | sonstige
 * @param {string} [o.email]   Kontaktadresse aus dem Selbststart
 * @param {string} [o.land]    Bundesland-Kürzel für die Feiertage
 * @param {string} [o.raum]    Raumname, wird zur Betriebskennung
 * @param {string} [o.laeuftAb] Ende des Testzeitraums
 */
export function baueLeerenBetrieb({ name, branche, email, land, raum, laeuftAb, avv }) {
  const jetzt = new Date();
  const br = EINHEIT_LABEL[branche] ? branche : "sonstige";
  const label = EINHEIT_LABEL[br];
  const mandantId = raum || `m-${jetzt.getTime()}`;

  const einheiten = [{
    id: "e1",
    name: `${label} 1`,
    farbe: "#017070",
    versatz: 0,
    pool: false,
    standortId: "st1",
  }];

  const mandant = {
    id: mandantId,
    name: String(name).trim(),
    branche: br,
    einheitLabel: label,
    bundesland: land || "HE",
    tarif: "pro",
    status: "test",
    seit: jetzt.toISOString().slice(0, 10),
    stichtag: laeuftAb ? String(laeuftAb).slice(0, 10) : null,
    kontakt: email ? String(email).trim() : "",
    anschrift: "",
    anker: ankerMontag(jetzt),
    zyklus: { wochen: 3, tage: new Array(21).fill("-"), vorlage: null },
    /* Leer heißt leer: keine Person, kein Dienst im Zyklus, kein Antrag. */
    personen: [],
    abwesenheiten: [],
    abweichungen: {},
    anfragen: [],
    nachrichten: [],
    aenderungen: [],
    protokoll: [],
    freigaben: {},
    einspruenge: [],
    unterschreitungen: [],
    dienstbuch: [],
    erfassung: {},
    einstempeln: {},
    urlaubsrunde: null,
    zuschlaege: [
      { id: "z1", name: "Nachtarbeit", art: "nacht", prozent: 25, aktiv: true },
      { id: "z2", name: "Sonntagsarbeit", art: "sonntag", prozent: 50, aktiv: true },
      { id: "z3", name: "Feiertagsarbeit", art: "feiertag", prozent: 125, aktiv: true },
    ],
    standorte: [{ id: "st1", name: `${String(name).trim()}`, land: land || "HE",
      lat: undefined, lon: undefined, radius: 200 }],
    einheiten,

    /* Die Rechtematrix fehlte hier — und damit jedem selbst angelegten
       Betrieb. Die Betriebsansicht liest m.matrix[rolle] ungeprüft und
       stürzte ab, sobald jemand sie öffnete: „Cannot read properties of
       undefined (reading 'leitung')". Der Server war davon nicht betroffen,
       er hat seine eigene Matrix — aber die halbe Verwaltung war
       unerreichbar. */
    matrix: JSON.parse(JSON.stringify(MATRIX)),

    dienstarten: DIENSTARTEN.map((d) => ({ ...d,
      faktor: 1, posten: false, quelle: null, ruhezeitNeutral: false, rufbereitschaft: false,
      mindest: { mo_do: 0, fr: 0, sa: 0, so: 0 }, mindestQual: {} })),
    qualifikationen: (QUALIFIKATIONEN[br] || QUALIFIKATIONEN.sonstige).map((q) => ({ ...q })),

    /* Gesetzliche Grundwerte. Bewusst die Mindestanforderungen des
       Arbeitszeitgesetzes, damit die Prüfung von Anfang an etwas prüft. */
    einstellungen: {
      wochenstunden: 40,
      /* Dieselbe Größe unter zwei Namen: Die Oberfläche liest fast überall
         sollWochenstunden, angelegt wurde nur wochenstunden. Folge: Das Feld
         „Vertragliche Wochenarbeitszeit" blieb leer, und jeder Vergleich fiel
         auf die eingebaute Vierzig zurück — auch bei einem Betrieb, der auf
         38,5 stand. Beide werden geschrieben und gemeinsam gepflegt. */
      sollWochenstunden: 40,
      /* Ohne Obergrenze prüft die Urlaubsregel nichts: `n > undefined` ist
         immer falsch. Zwei gleichzeitige Urlaube je Einheit sind ein
         brauchbarer Startwert. */
      maxUrlaubJeEinheit: 2,
      ausgleichGrenze: 40,
      ausgleichFristMonate: 6,
      ruhezeit: 11,
      maxFolge: 6,
      maxNachtFolge: 4,
      urlaubsanspruch: 30,
      /* § 3 ArbZG: acht Stunden im Durchschnitt von vierundzwanzig Wochen. */
      ausgleichWochen: 24,
      maxTagesstunden: 10,
      pausen: { ab6h: 30, ab9h: 45 },
      quote: QUOTE[br] || null,
      pakete: br === "sonstige" ? [] : [br],
    },

    /* Aufbewahrung — siehe src/migration.js, Stufe 5 → 6. */
    aufbewahrung: {
      plandatenMonate: 24,
      stammdatenMonate: 6,
      gruendeMonate: 3,
      zuletztGeraeumt: null,
    },

    selbstAngelegt: true,
    laeuftAb: laeuftAb || null,
  };

  return {
    version: VERSION,
    stand: 0,
    /* Wann welche Fassung des Vertrags zur Auftragsverarbeitung angenommen
       wurde. Steht am Bestand, nicht nur am Konto: Der Bestand ist es, den
       der Vertrag schützt. */
    avv: avv || null,
    /* Keine Tarifliste, keine Rechnungen, keine Betreiberangaben: Die
       gehören dem Betreiber und werden für Kunden ohnehin gefiltert. */
    tarife: [],
    rechnungen: [],
    protokoll: [],
    mandanten: [mandant],
    /* Ohne Sitzung landet der Zugang auf der Rollenauswahl; die Anmeldung
       setzt sie anhand der Rolle im Zugangscode. */
    session: null,
  };
}
