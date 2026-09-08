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
/* ==========================================================================
   QUALIFIKATIONSKATALOG JE BRANCHE

   Jeder Eintrag nennt seine Rechtsgrundlage — oder sagt ausdrücklich, dass
   es keine gibt. Das ist der Unterschied, an dem ein Compliance-Werkzeug
   hängt: „Pflegefachkraft" folgt aus dem PflBG und ist nicht verhandelbar,
   „Erste Hilfe alle zwei Jahre" ist eine betriebliche Festlegung, die je
   nach Gefährdungsbeurteilung anders ausfallen darf.

   Zwei Dinge sind hier bewusst nicht als bundesweite Pflicht verdrahtet:

   Die Sachkundeprüfung nach § 34a GewO gilt nicht für jede
   Bewachungstätigkeit. Für einen großen Teil — etwa Bewachung im
   Objektschutz ohne die in § 34a Abs. 1a genannten Tätigkeiten — genügt die
   Unterrichtung. Beides steht deshalb getrennt im Katalog, und nur die
   Unterrichtung ist vorbelegt. Wer Türsteher, Citystreife oder
   Ladendetektive einsetzt, schaltet die Sachkunde selbst scharf.

   Und der Masernschutz nach § 20 IfSG wird als Status geführt, nicht als
   Gesundheitsangabe: Ob der Nachweis vorliegt, darf der Betrieb wissen; die
   Impfdaten selbst gehen ihn nichts an.
   ========================================================================== */
const QUALIFIKATIONEN = {
  pflege: [
    { id: "q1", name: "Pflegefachkraft", kurz: "PFK",
      ebene: "bund", bezug: "person", gueltigMonate: null, nachweisPflicht: true, fachkraft: true,
      grundlage: "§§ 1, 4 PflBG — Erlaubnis zum Führen der Berufsbezeichnung" },
    { id: "q2", name: "Betreuungskraft § 43b", kurz: "BK",
      ebene: "bund", bezug: "taetigkeit", gueltigMonate: null, nachweisPflicht: false, fachkraft: false,
      grundlage: "§ 43b SGB XI" },
    { id: "q3", name: "Pflegeassistenz", kurz: "PA",
      ebene: "land", bezug: "person", gueltigMonate: null, nachweisPflicht: false, fachkraft: false,
      grundlage: "Landesrecht — Bezeichnung und Umfang sind je Bundesland verschieden" },
    /* Kein bundesweit vorgeschriebenes Intervall. Der Wert ist eine
       verbreitete betriebliche Praxis, kein Gesetz. */
    { id: "q4", name: "Erste Hilfe", kurz: "EH",
      ebene: "betrieb", bezug: "person", gueltigMonate: 24, nachweisPflicht: false, fachkraft: false,
      grundlage: "Betrieblich — Umfang nach Gefährdungsbeurteilung (§ 5 ArbSchG, DGUV Vorschrift 1)" },
    { id: "q5", name: "Hygieneunterweisung", kurz: "HYG",
      ebene: "bund", bezug: "einrichtung", intervallBetrieblich: true, gueltigMonate: 12, nachweisPflicht: true, fachkraft: false,
      grundlage: "§ 23 IfSG in Verbindung mit dem Hygieneplan der Einrichtung" },
    { id: "q6", name: "Masernschutz — Status", kurz: "MSG",
      ebene: "bund", bezug: "einrichtung", gueltigMonate: null, nachweisPflicht: true, fachkraft: false,
      nurStatus: true,
      grundlage: "§ 20 Abs. 8, 9 IfSG — nur das Vorliegen erfassen, keine Impfdaten" },
  ],
  klinik: [
    { id: "q1", name: "Pflegefachkraft", kurz: "PFK",
      ebene: "bund", bezug: "person", gueltigMonate: null, nachweisPflicht: true, fachkraft: true,
      grundlage: "§§ 1, 4 PflBG" },
    { id: "q2", name: "Approbation", kurz: "APP",
      ebene: "bund", bezug: "taetigkeit", gueltigMonate: null, nachweisPflicht: true, fachkraft: true,
      grundlage: "§ 2 Bundesärzteordnung; Berufserlaubnis nach Landesrecht" },
    { id: "q3", name: "Facharztanerkennung", kurz: "FA",
      ebene: "land", bezug: "taetigkeit", gueltigMonate: null, nachweisPflicht: false, fachkraft: false,
      grundlage: "Weiterbildungsordnung der zuständigen Landesärztekammer" },
    { id: "q4", name: "Fachweiterbildung Intensiv/Anästhesie", kurz: "FWI",
      ebene: "land", bezug: "taetigkeit", gueltigMonate: null, nachweisPflicht: false, fachkraft: false,
      grundlage: "Landesrecht und Vorgaben der Einrichtung — keine bundesweit einheitliche Pflicht" },
    { id: "q5", name: "Geräteeinweisung Medizinprodukte", kurz: "MPG",
      ebene: "bund", bezug: "taetigkeit", intervallBetrieblich: true, gueltigMonate: 24, nachweisPflicht: true, fachkraft: false,
      grundlage: "§§ 4, 10 MPBetreibV — je Gerät und Tätigkeit" },
    { id: "q6", name: "Hygieneunterweisung", kurz: "HYG",
      ebene: "bund", bezug: "einrichtung", intervallBetrieblich: true, gueltigMonate: 12, nachweisPflicht: true, fachkraft: false,
      grundlage: "§ 23 IfSG, Hygieneplan des Krankenhauses" },
    { id: "q7", name: "Masernschutz — Status", kurz: "MSG",
      ebene: "bund", bezug: "einrichtung", gueltigMonate: null, nachweisPflicht: true, fachkraft: false,
      nurStatus: true, grundlage: "§ 20 Abs. 8, 9 IfSG — nur das Vorliegen erfassen" },
    { id: "q8", name: "Erste Hilfe", kurz: "EH",
      ebene: "betrieb", bezug: "person", gueltigMonate: 24, nachweisPflicht: false, fachkraft: false,
      grundlage: "Betrieblich — nach Gefährdungsbeurteilung" },
  ],
  sicherheit: [
    /* Vorbelegt ist die Unterrichtung, nicht die Sachkunde — siehe oben. */
    { id: "q1", name: "Unterrichtung § 34a GewO", kurz: "UNT",
      ebene: "bund", bezug: "taetigkeit", gueltigMonate: null, nachweisPflicht: true, fachkraft: true,
      grundlage: "§ 34a Abs. 1a GewO, §§ 4 ff. BewachV — genügt für die meisten Bewachungstätigkeiten" },
    { id: "q2", name: "Sachkundeprüfung § 34a GewO", kurz: "SK",
      ebene: "bund", bezug: "taetigkeit", gueltigMonate: null, nachweisPflicht: false, fachkraft: false,
      grundlage: "§ 34a Abs. 1a Satz 2 GewO — nur für die dort genannten Tätigkeiten, etwa Kontrollgänge im "
        + "öffentlichen Verkehrsraum, Schutz vor Ladendieben und Bewachung im Einlassbereich" },
    { id: "q3", name: "Zuverlässigkeit geprüft — Status", kurz: "ZUV",
      ebene: "bund", bezug: "person", gueltigMonate: 60, nachweisPflicht: true, fachkraft: false,
      nurStatus: true,
      grundlage: "§ 34a Abs. 1 Satz 3 GewO, § 8 BewachV — Regelüberprüfung durch die Behörde" },
    { id: "q4", name: "Waffenrechtliche Erlaubnis", kurz: "WAF",
      ebene: "bund", bezug: "taetigkeit", gueltigMonate: null, nachweisPflicht: false, fachkraft: false,
      grundlage: "§§ 10, 28 WaffG, § 10 AWaffV — nur bei tatsächlich bewaffnetem Einsatz, "
        + "kein allgemeiner Qualifikationsnachweis des Gewerbes" },
    { id: "q5", name: "Erste Hilfe", kurz: "EH",
      ebene: "betrieb", bezug: "person", gueltigMonate: 24, nachweisPflicht: false, fachkraft: false,
      grundlage: "Betrieblich — nach Gefährdungsbeurteilung" },
  ],
  industrie: [
    { id: "q1", name: "Unterweisung Arbeitsschutz", kurz: "UAS",
      ebene: "bund", bezug: "person", gueltigMonate: 12, nachweisPflicht: true, fachkraft: false,
      grundlage: "§ 12 ArbSchG, § 4 DGUV Vorschrift 1 — jährlich, arbeitsplatzbezogen" },
    { id: "q2", name: "Maschinen- und Anlagenunterweisung", kurz: "MAU",
      ebene: "bund", bezug: "taetigkeit", gueltigMonate: 12, nachweisPflicht: true, fachkraft: false,
      grundlage: "§ 12 BetrSichV — je Arbeitsmittel" },
    { id: "q3", name: "Befähigte Person", kurz: "BEF",
      ebene: "bund", bezug: "taetigkeit", gueltigMonate: null, nachweisPflicht: false, fachkraft: true,
      grundlage: "§ 2 Abs. 6 BetrSichV, TRBS 1203 — je konkreter Prüfaufgabe" },
    { id: "q4", name: "Flurförderzeug (Staplerschein)", kurz: "STA",
      ebene: "betrieb", bezug: "taetigkeit", gueltigMonate: 12, nachweisPflicht: false, fachkraft: false,
      grundlage: "DGUV Vorschrift 68, DGUV Grundsatz 308-001" },
    { id: "q5", name: "Erste Hilfe", kurz: "EH",
      ebene: "betrieb", bezug: "person", gueltigMonate: 24, nachweisPflicht: false, fachkraft: false,
      grundlage: "Betrieblich — nach Gefährdungsbeurteilung" },
    { id: "q6", name: "Brandschutzhelfer", kurz: "BSH",
      ebene: "bund", bezug: "einrichtung", intervallBetrieblich: true, gueltigMonate: 36, nachweisPflicht: false, fachkraft: false,
      grundlage: "§ 10 ArbSchG, ASR A2.2" },
  ],
  sonstige: [
    { id: "q1", name: "Unterweisung Arbeitsschutz", kurz: "UAS",
      ebene: "bund", bezug: "person", gueltigMonate: 12, nachweisPflicht: true, fachkraft: false,
      grundlage: "§ 12 ArbSchG — vor Aufnahme der Tätigkeit und danach regelmäßig" },
    { id: "q2", name: "Erste Hilfe", kurz: "EH",
      ebene: "betrieb", bezug: "person", gueltigMonate: 24, nachweisPflicht: false, fachkraft: false,
      grundlage: "Betrieblich — nach Gefährdungsbeurteilung" },
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
export function baueLeerenBetrieb({ name, branche, email, land, raum, laeuftAb }) {
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
