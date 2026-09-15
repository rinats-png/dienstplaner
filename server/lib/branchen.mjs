/* ==========================================================================
   BRANCHENPROFILE

   Eine Branche war bisher an drei Stellen beschrieben: eine Liste in der
   Oberfläche, eine Tabelle mit Einheitsbezeichnungen im Server und ein
   Qualifikationskatalog daneben. Die drei sind auseinandergelaufen — die
   Oberfläche bot zehn Branchen an, der Server kannte fünf Kataloge, und
   „Produktion" traf den vorhandenen Katalog „industrie" wegen der
   abweichenden Kennung nie. Wer Rettungsdienst wählte, bekam zwei
   Allgemeinplätze.

   Hier steht eine Branche nur noch einmal, als Datensatz: Name, wie die
   Einheit heißt, was eine Schicht darin bedeutet, welche Fachkraftquote
   üblich ist, und welche Qualifikationen fast immer gebraucht werden. Eine
   neue Branche ist damit ein Eintrag in dieser Datei, keine Änderung an
   der Anwendung.

   ---------------------------------------------------------------------------
   ZUR RECHTLICHEN EINORDNUNG

   Jeder Katalogeintrag nennt seine Grundlage — oder sagt ausdrücklich, dass
   es keine gibt. Daran hängt das ganze Werkzeug: „Pflegefachkraft" folgt
   aus dem PflBG und ist nicht verhandelbar, „Erste Hilfe alle zwei Jahre"
   ist eine betriebliche Festlegung, die nach Gefährdungsbeurteilung anders
   ausfallen darf.

   Drei Dinge sind bewusst nicht als bundesweite Pflicht verdrahtet:

   Die Sachkundeprüfung nach § 34a GewO gilt nicht für jede
   Bewachungstätigkeit; für Objektschutz ohne die in Absatz 1a genannten
   Tätigkeiten genügt die Unterrichtung. Beides steht getrennt, nur die
   Unterrichtung ist vorbelegt.

   Gesundheitsangaben werden als Status geführt, nicht als Befund: Masern
   nach § 20 IfSG, arbeitsmedizinische Eignung nach ArbMedVV. Ob der
   Nachweis vorliegt, darf der Betrieb wissen; was darin steht, nicht.

   Und wo Landesrecht entscheidet — Rettungsdienst, Feuerwehr, Pflege­assistenz —
   trägt der Eintrag `ebene: "land"`. Die Anwendung sagt dann nicht
   „gesetzlich vorgeschrieben", sondern nennt das Land. Eine Liste der
   Länder steht hier bewusst nicht: Ein Katalogvorschlag kennt den Standort
   des Betriebs noch nicht, und Regeln wie die Pflegeassistenz gelten in
   jedem Land — nur eben jeweils anders. Der Betrieb hinterlegt sein Land,
   und die Prüfung weist ihn darauf hin, solange er es nicht getan hat.
   ========================================================================== */

/* Die drei Dienste im Achtstundenrhythmus — der Normalfall im
   durchgehenden Schichtbetrieb und ein Ausgangspunkt, der sich ändern
   lässt. Branchen mit anderem Rhythmus überschreiben sie unten. */
export const DIENSTARTEN_STANDARD = [
  { id: "F", name: "Frühdienst", kurz: "F", start: "06:00", ende: "14:00",
    pause: 30, farbe: "#3C7C8C", ort: "" },
  { id: "S", name: "Spätdienst", kurz: "S", start: "14:00", ende: "22:00",
    pause: 30, farbe: "#A8621B", ort: "" },
  { id: "N", name: "Nachtdienst", kurz: "N", start: "22:00", ende: "06:00",
    pause: 45, farbe: "#43507E", ort: "" },
];

/* Zwölfstundendienste — üblich in Rettungsdienst und Werkfeuerwehr. */
const DIENSTARTEN_ZWOELF = [
  { id: "T", name: "Tagdienst", kurz: "T", start: "07:00", ende: "19:00",
    pause: 45, farbe: "#3C7C8C", ort: "" },
  { id: "N", name: "Nachtdienst", kurz: "N", start: "19:00", ende: "07:00",
    pause: 45, farbe: "#43507E", ort: "" },
];

/* Wiederkehrende Einträge. Sie stehen in fast jedem Katalog und sollen
   überall gleich begründet sein. */
const ERSTE_HILFE = {
  name: "Erste Hilfe", kurz: "EH",
  ebene: "betrieb", bezug: "person", gueltigMonate: 24, nachweisPflicht: false, fachkraft: false,
  grundlage: "Betrieblich — Umfang nach Gefährdungsbeurteilung (§ 5 ArbSchG, DGUV Vorschrift 1)",
};
const UNTERWEISUNG = {
  name: "Unterweisung Arbeitsschutz", kurz: "UAS",
  ebene: "bund", bezug: "person", gueltigMonate: 12, nachweisPflicht: true, fachkraft: false,
  grundlage: "§ 12 ArbSchG, § 4 DGUV Vorschrift 1 — vor Aufnahme der Tätigkeit und danach jährlich",
};
const BRANDSCHUTZHELFER = {
  name: "Brandschutzhelfer", kurz: "BSH",
  ebene: "bund", bezug: "einrichtung", intervallBetrieblich: true, gueltigMonate: 36,
  nachweisPflicht: false, fachkraft: false,
  grundlage: "§ 10 ArbSchG, ASR A2.2 — Anteil und Wiederholung nach Gefährdungsbeurteilung",
};
const GEFAHRSTOFFE = {
  name: "Gefahrstoffunterweisung", kurz: "GST",
  ebene: "bund", bezug: "taetigkeit", gueltigMonate: 12, nachweisPflicht: true, fachkraft: false,
  grundlage: "§ 14 GefStoffV — tätigkeitsbezogen, mindestens jährlich",
};
const MASERN = {
  name: "Masernschutz — Status", kurz: "MSG",
  ebene: "bund", bezug: "einrichtung", gueltigMonate: null, nachweisPflicht: true, fachkraft: false,
  nurStatus: true,
  grundlage: "§ 20 Abs. 8, 9 IfSG — nur das Vorliegen erfassen, keine Impfdaten",
};
const STAPLER = {
  name: "Flurförderzeug (Staplerschein)", kurz: "STA",
  ebene: "betrieb", bezug: "taetigkeit", gueltigMonate: 12, nachweisPflicht: false, fachkraft: false,
  grundlage: "DGUV Vorschrift 68, DGUV Grundsatz 308-001 — Beauftragung durch den Betrieb, "
    + "Unterweisung jährlich",
};

/** Nummeriert einen Katalog durch: q1, q2, … */
const katalog = (eintraege) => eintraege.map((q, i) => ({ id: `q${i + 1}`, ...q }));

/* --------------------------------------------------------------------------
   DIE BRANCHEN

   `gruppe` fasst zusammen, was rechtlich zusammengehört, und steuert, welche
   Zusatzprüfungen die Anwendung anbietet:

     pflege     Fachkraftquote, Nachweise mit Ablauf, PpUGV im Krankenhaus
     sicherheit § 34a-Nachweise, Alleinarbeit, Notruf
     technik    Arbeitsmittel, befähigte Personen, Unterweisungen
     fahren     Fahrerlaubnis und Fahrpersonalrecht
     allgemein  nur der gemeinsame Kern
   -------------------------------------------------------------------------- */
export const BRANCHEN = [
  {
    id: "pflege", name: "Pflege", einheit: "Wohnbereich", gruppe: "pflege", paket: "pflege",
    quote: { tag: 0.40, nacht: 0.50 },
    qualifikationen: katalog([
      { name: "Pflegefachkraft", kurz: "PFK",
        ebene: "bund", bezug: "person", gueltigMonate: null, nachweisPflicht: true, fachkraft: true,
        grundlage: "§§ 1, 4 PflBG — Erlaubnis zum Führen der Berufsbezeichnung" },
      { name: "Betreuungskraft § 43b", kurz: "BK",
        ebene: "bund", bezug: "taetigkeit", gueltigMonate: null, nachweisPflicht: false, fachkraft: false,
        grundlage: "§ 43b SGB XI" },
      { name: "Pflegeassistenz", kurz: "PA",
        ebene: "land", bezug: "person", gueltigMonate: null, nachweisPflicht: false, fachkraft: false,
        grundlage: "Landesrecht — Bezeichnung und Umfang sind je Bundesland verschieden" },
      ERSTE_HILFE,
      { name: "Hygieneunterweisung", kurz: "HYG",
        ebene: "bund", bezug: "einrichtung", intervallBetrieblich: true, gueltigMonate: 12,
        nachweisPflicht: true, fachkraft: false,
        grundlage: "§ 23 IfSG in Verbindung mit dem Hygieneplan der Einrichtung" },
      MASERN,
    ]),
  },
  {
    id: "klinik", name: "Klinik", einheit: "Station", gruppe: "pflege", paket: "klinik",
    quote: { tag: 0.50, nacht: 0.50 },
    qualifikationen: katalog([
      { name: "Pflegefachkraft", kurz: "PFK",
        ebene: "bund", bezug: "person", gueltigMonate: null, nachweisPflicht: true, fachkraft: true,
        grundlage: "§§ 1, 4 PflBG" },
      { name: "Approbation", kurz: "APP",
        ebene: "bund", bezug: "taetigkeit", gueltigMonate: null, nachweisPflicht: true, fachkraft: true,
        grundlage: "§ 2 Bundesärzteordnung; Berufserlaubnis nach Landesrecht" },
      { name: "Facharztanerkennung", kurz: "FA",
        ebene: "land", bezug: "taetigkeit", gueltigMonate: null, nachweisPflicht: false, fachkraft: false,
        grundlage: "Weiterbildungsordnung der zuständigen Landesärztekammer" },
      { name: "Fachweiterbildung Intensiv/Anästhesie", kurz: "FWI",
        ebene: "land", bezug: "taetigkeit", gueltigMonate: null, nachweisPflicht: false, fachkraft: false,
        grundlage: "Landesrecht und Vorgaben der Einrichtung — keine bundesweit einheitliche Pflicht" },
      { name: "Geräteeinweisung Medizinprodukte", kurz: "MPG",
        ebene: "bund", bezug: "taetigkeit", intervallBetrieblich: true, gueltigMonate: 24,
        nachweisPflicht: true, fachkraft: false,
        grundlage: "§§ 4, 10 MPBetreibV — je Gerät und Tätigkeit" },
      { name: "Hygieneunterweisung", kurz: "HYG",
        ebene: "bund", bezug: "einrichtung", intervallBetrieblich: true, gueltigMonate: 12,
        nachweisPflicht: true, fachkraft: false,
        grundlage: "§ 23 IfSG, Hygieneplan des Krankenhauses" },
      MASERN,
      ERSTE_HILFE,
    ]),
  },
  {
    id: "sicherheit", name: "Sicherheitsdienst", einheit: "Schichtgruppe", gruppe: "sicherheit",
    paket: "sicherheit",
    qualifikationen: katalog([
      /* Vorbelegt ist die Unterrichtung, nicht die Sachkunde — siehe oben. */
      { name: "Unterrichtung § 34a GewO", kurz: "UNT",
        ebene: "bund", bezug: "taetigkeit", gueltigMonate: null, nachweisPflicht: true, fachkraft: true,
        grundlage: "§ 34a Abs. 1a GewO, §§ 4 ff. BewachV — mindestens 40 Unterrichtsstunden, "
          + "genügt für die meisten Bewachungstätigkeiten" },
      { name: "Sachkundeprüfung § 34a GewO", kurz: "SK",
        ebene: "bund", bezug: "taetigkeit", gueltigMonate: null, nachweisPflicht: false, fachkraft: false,
        grundlage: "§ 34a Abs. 1a Satz 2 GewO — nur für die dort genannten Tätigkeiten, etwa Kontrollgänge im "
          + "öffentlichen Verkehrsraum, Schutz vor Ladendieben und Bewachung im Einlassbereich" },
      { name: "Zuverlässigkeit geprüft — Status", kurz: "ZUV",
        ebene: "bund", bezug: "person", gueltigMonate: 60, nachweisPflicht: true, fachkraft: false,
        nurStatus: true,
        grundlage: "§ 34a Abs. 1 Satz 3 GewO, § 8 BewachV — Regelüberprüfung durch die Behörde" },
      { name: "Waffenrechtliche Erlaubnis", kurz: "WAF",
        ebene: "bund", bezug: "taetigkeit", gueltigMonate: null, nachweisPflicht: false, fachkraft: false,
        grundlage: "§§ 10, 28 WaffG, § 10 AWaffV — nur bei tatsächlich bewaffnetem Einsatz, "
          + "kein allgemeiner Qualifikationsnachweis des Gewerbes" },
      ERSTE_HILFE,
    ]),
  },
  {
    id: "leitstelle", name: "Notruf- und Serviceleitstelle", einheit: "Wachschicht",
    gruppe: "sicherheit", paket: "sicherheit",
    qualifikationen: katalog([
      { name: "Unterrichtung § 34a GewO", kurz: "UNT",
        ebene: "bund", bezug: "taetigkeit", gueltigMonate: null, nachweisPflicht: true, fachkraft: true,
        grundlage: "§ 34a Abs. 1a GewO — auch für die Arbeit in der Notrufleitstelle" },
      { name: "Einweisung Leitstellentechnik", kurz: "LST",
        ebene: "betrieb", bezug: "taetigkeit", intervallBetrieblich: true, gueltigMonate: 12,
        nachweisPflicht: true, fachkraft: false,
        grundlage: "Betrieblich — Arbeitsplatzfreigabe je Leitstellenplatz; bei zertifizierten "
          + "Notruf- und Serviceleitstellen zusätzlich nach DIN EN 50518" },
      { name: "Interventionskraft", kurz: "IVK",
        ebene: "betrieb", bezug: "taetigkeit", gueltigMonate: null, nachweisPflicht: false, fachkraft: false,
        grundlage: "Betrieblich und vertraglich — Anforderungen des Auftraggebers oder Versicherers" },
      { name: "Zuverlässigkeit geprüft — Status", kurz: "ZUV",
        ebene: "bund", bezug: "person", gueltigMonate: 60, nachweisPflicht: true, fachkraft: false,
        nurStatus: true,
        grundlage: "§ 34a Abs. 1 Satz 3 GewO, § 8 BewachV" },
      ERSTE_HILFE,
    ]),
  },
  {
    id: "rettung", name: "Rettungsdienst", einheit: "Wachabteilung", gruppe: "pflege", paket: "pflege",
    dienstarten: DIENSTARTEN_ZWOELF,
    quote: { tag: 0.50, nacht: 0.50 },
    qualifikationen: katalog([
      { name: "Notfallsanitäter", kurz: "NFS",
        ebene: "bund", bezug: "person", gueltigMonate: null, nachweisPflicht: true, fachkraft: true,
        grundlage: "§ 1 NotSanG — Erlaubnis zum Führen der Berufsbezeichnung" },
      { name: "Rettungssanitäter", kurz: "RS",
        ebene: "land", bezug: "person", gueltigMonate: null, nachweisPflicht: true, fachkraft: false,
        grundlage: "Landesrecht — Ausbildung und Einsatzbefugnis regeln die Rettungsdienstgesetze der Länder" },
      { name: "Jahresfortbildung Rettungsdienst", kurz: "FBR",
        ebene: "land", bezug: "person", gueltigMonate: 12, nachweisPflicht: true, fachkraft: false,
        grundlage: "Landesrecht — Umfang und Frist nach dem Rettungsdienstgesetz des Landes" },
      { name: "Fahrerlaubnis C1", kurz: "C1",
        ebene: "bund", bezug: "taetigkeit", gueltigMonate: 60, nachweisPflicht: true, fachkraft: false,
        grundlage: "§ 6 FeV, Anlage 6 — Klasse C1 ist befristet, Verlängerung mit ärztlicher Untersuchung" },
      { name: "Einsatzfahrt / Sondersignal", kurz: "SOS",
        ebene: "betrieb", bezug: "taetigkeit", intervallBetrieblich: true, gueltigMonate: 24,
        nachweisPflicht: false, fachkraft: false,
        grundlage: "Betrieblich — Fahrsicherheitstraining nach § 35 StVO und Vorgabe des Trägers" },
      { name: "Geräteeinweisung Medizinprodukte", kurz: "MPG",
        ebene: "bund", bezug: "taetigkeit", intervallBetrieblich: true, gueltigMonate: 24,
        nachweisPflicht: true, fachkraft: false,
        grundlage: "§§ 4, 10 MPBetreibV — je Gerät, etwa Beatmung und Defibrillation" },
      MASERN,
      { name: "Hygieneunterweisung", kurz: "HYG",
        ebene: "bund", bezug: "einrichtung", intervallBetrieblich: true, gueltigMonate: 12,
        nachweisPflicht: true, fachkraft: false,
        grundlage: "§ 23 IfSG, Hygieneplan des Trägers" },
    ]),
  },
  {
    id: "feuerwehr", name: "Feuerwehr und Rettungsleitstelle", einheit: "Wachabteilung",
    gruppe: "technik", dienstarten: DIENSTARTEN_ZWOELF,
    qualifikationen: katalog([
      { name: "Atemschutzgeräteträger", kurz: "AGT",
        ebene: "land", bezug: "taetigkeit", gueltigMonate: 12, nachweisPflicht: true, fachkraft: false,
        grundlage: "FwDV 7 in der Fassung des Landes, DGUV Regel 112-190 — jährliche Übung und "
          + "Belastungsübung als Voraussetzung des Einsatzes" },
      { name: "Arbeitsmedizinische Eignung G 26.3 — Status", kurz: "G26",
        ebene: "bund", bezug: "taetigkeit", gueltigMonate: 36, nachweisPflicht: true, fachkraft: false,
        nurStatus: true,
        grundlage: "ArbMedVV, DGUV Grundsatz G 26 — nur das Vorliegen und die Frist erfassen, "
          + "keine Befunde; kürzere Fristen je nach Alter" },
      { name: "Maschinist", kurz: "MA",
        ebene: "land", bezug: "taetigkeit", gueltigMonate: null, nachweisPflicht: true, fachkraft: false,
        grundlage: "FwDV 2 in der Fassung des Landes — Ausbildung an Pumpe und Fahrzeug" },
      { name: "Gruppenführer", kurz: "GF",
        ebene: "land", bezug: "person", gueltigMonate: null, nachweisPflicht: false, fachkraft: true,
        grundlage: "FwDV 2 in der Fassung des Landes — Führungsausbildung" },
      { name: "Fahrerlaubnis C/CE", kurz: "CE",
        ebene: "bund", bezug: "taetigkeit", gueltigMonate: 60, nachweisPflicht: true, fachkraft: false,
        grundlage: "§ 6 FeV — befristet, Verlängerung mit ärztlicher Untersuchung" },
      { name: "Einweisung Leitstellenplatz", kurz: "LST",
        ebene: "land", bezug: "taetigkeit", intervallBetrieblich: true, gueltigMonate: 12,
        nachweisPflicht: false, fachkraft: false,
        grundlage: "Landesrecht und Dienstanweisung des Trägers — Freigabe je Arbeitsplatz" },
      ERSTE_HILFE,
    ]),
  },
  {
    id: "produktion", name: "Produktion, Technik und Energie", einheit: "Schichtgruppe",
    gruppe: "technik", paket: "industrie",
    qualifikationen: katalog([
      UNTERWEISUNG,
      { name: "Maschinen- und Anlagenunterweisung", kurz: "MAU",
        ebene: "bund", bezug: "taetigkeit", gueltigMonate: 12, nachweisPflicht: true, fachkraft: false,
        grundlage: "§ 12 BetrSichV — je Arbeitsmittel, vor der ersten Verwendung und danach regelmäßig" },
      { name: "Befähigte Person", kurz: "BEF",
        ebene: "bund", bezug: "taetigkeit", gueltigMonate: null, nachweisPflicht: false, fachkraft: true,
        grundlage: "§ 2 Abs. 6 BetrSichV, TRBS 1203 — je konkreter Prüfaufgabe, "
          + "durch den Betrieb schriftlich bestellt" },
      { name: "Elektrofachkraft", kurz: "EFK",
        ebene: "bund", bezug: "taetigkeit", gueltigMonate: null, nachweisPflicht: true, fachkraft: true,
        grundlage: "DGUV Vorschrift 3, DIN VDE 1000-10 — Ausbildung, Kenntnisse und Erfahrung "
          + "für die übertragene Aufgabe" },
      { name: "Schaltberechtigung", kurz: "SCB",
        ebene: "betrieb", bezug: "taetigkeit", gueltigMonate: 36, nachweisPflicht: true, fachkraft: false,
        grundlage: "Betrieblich — schriftliche Erteilung durch den Anlagenbetreiber, je Anlage "
          + "und Spannungsebene" },
      STAPLER,
      GEFAHRSTOFFE,
      ERSTE_HILFE,
      BRANDSCHUTZHELFER,
    ]),
  },
  {
    id: "logistik", name: "Logistik und Fahrpersonal", einheit: "Team", gruppe: "fahren",
    qualifikationen: katalog([
      { name: "Fahrerlaubnis C/CE", kurz: "CE",
        ebene: "bund", bezug: "taetigkeit", gueltigMonate: 60, nachweisPflicht: true, fachkraft: false,
        grundlage: "§ 6 FeV — befristet, Verlängerung mit ärztlicher Untersuchung" },
      { name: "Berufskraftfahrerqualifikation", kurz: "BKF",
        ebene: "bund", bezug: "taetigkeit", gueltigMonate: 60, nachweisPflicht: true, fachkraft: true,
        grundlage: "§§ 4, 5 BKrFQG — Schlüsselzahl 95, Weiterbildung von 35 Stunden in fünf Jahren" },
      { name: "Fahrerkarte", kurz: "FK",
        ebene: "bund", bezug: "taetigkeit", gueltigMonate: 60, nachweisPflicht: true, fachkraft: false,
        grundlage: "VO (EU) 165/2014, § 2 FPersV — Voraussetzung für Fahrten mit Kontrollgerät" },
      { name: "Gefahrgut ADR", kurz: "ADR",
        ebene: "bund", bezug: "taetigkeit", gueltigMonate: 60, nachweisPflicht: false, fachkraft: false,
        grundlage: "ADR Kapitel 8.2, § 6 GGVSEB — nur für kennzeichnungspflichtige Beförderung" },
      { name: "Ladungssicherung", kurz: "LAS",
        ebene: "betrieb", bezug: "taetigkeit", gueltigMonate: 24, nachweisPflicht: false, fachkraft: false,
        grundlage: "§ 22 StVO, § 12 ArbSchG, VDI 2700 — Umfang nach Gefährdungsbeurteilung" },
      STAPLER,
      UNTERWEISUNG,
      ERSTE_HILFE,
    ]),
  },
  {
    id: "gastronomie", name: "Gastronomie und Hotellerie", einheit: "Team", gruppe: "allgemein",
    qualifikationen: katalog([
      { name: "Belehrung § 43 IfSG", kurz: "IFS",
        ebene: "bund", bezug: "taetigkeit", gueltigMonate: 24, nachweisPflicht: true, fachkraft: false,
        grundlage: "§ 43 IfSG — Erstbelehrung durch das Gesundheitsamt vor der Tätigkeit, "
          + "danach Folgebelehrung durch den Betrieb alle zwei Jahre" },
      { name: "Hygieneschulung HACCP", kurz: "HAC",
        ebene: "bund", bezug: "einrichtung", intervallBetrieblich: true, gueltigMonate: 12,
        nachweisPflicht: true, fachkraft: false,
        grundlage: "VO (EG) 852/2004 Anhang II Kapitel XII, § 4 LMHV — Umfang nach dem "
          + "Hygienekonzept des Betriebs" },
      { name: "Jugendschutz-Unterweisung", kurz: "JUS",
        ebene: "bund", bezug: "taetigkeit", gueltigMonate: 12, nachweisPflicht: false, fachkraft: false,
        grundlage: "§§ 9, 10 JuSchG — Ausschank und Abgabe; Unterweisung ist betriebliche Vorsorge" },
      UNTERWEISUNG,
      ERSTE_HILFE,
      BRANDSCHUTZHELFER,
    ]),
  },
  {
    id: "handel", name: "Handel und Filiale", einheit: "Filialteam", gruppe: "allgemein",
    qualifikationen: katalog([
      UNTERWEISUNG,
      { name: "Jugendschutz-Unterweisung", kurz: "JUS",
        ebene: "bund", bezug: "taetigkeit", gueltigMonate: 12, nachweisPflicht: false, fachkraft: false,
        grundlage: "§§ 9, 10 JuSchG, § 10 TabakerzG — Abgabe von Alkohol und Tabak" },
      { name: "Kassenverantwortung", kurz: "KAS",
        ebene: "betrieb", bezug: "taetigkeit", gueltigMonate: null, nachweisPflicht: false, fachkraft: false,
        grundlage: "Betrieblich — Einweisung und Freigabe für Kassenabschluss und Geldtransport" },
      STAPLER,
      ERSTE_HILFE,
      BRANDSCHUTZHELFER,
    ]),
  },
  {
    id: "reinigung", name: "Reinigung und Facility", einheit: "Objektteam", gruppe: "technik",
    qualifikationen: katalog([
      UNTERWEISUNG,
      GEFAHRSTOFFE,
      { name: "Arbeitsmedizinische Vorsorge Feuchtarbeit — Status", kurz: "HAU",
        ebene: "bund", bezug: "taetigkeit", gueltigMonate: 36, nachweisPflicht: false, fachkraft: false,
        nurStatus: true,
        grundlage: "ArbMedVV Anhang Teil 2 — Pflicht- oder Angebotsvorsorge je nach Dauer der "
          + "Feuchtarbeit; nur das Vorliegen erfassen, keine Befunde" },
      { name: "Einweisung Reinigungsmaschinen", kurz: "REM",
        ebene: "bund", bezug: "taetigkeit", gueltigMonate: 12, nachweisPflicht: false, fachkraft: false,
        grundlage: "§ 12 BetrSichV — je Arbeitsmittel" },
      { name: "Hygieneunterweisung", kurz: "HYG",
        ebene: "bund", bezug: "einrichtung", intervallBetrieblich: true, gueltigMonate: 12,
        nachweisPflicht: false, fachkraft: false,
        grundlage: "§ 23 IfSG — nur bei Einsatz in Einrichtungen des Gesundheitswesens" },
      ERSTE_HILFE,
    ]),
  },
  {
    id: "sonstiges", name: "Sonstiges", einheit: "Einheit", gruppe: "allgemein",
    qualifikationen: katalog([
      { ...UNTERWEISUNG,
        grundlage: "§ 12 ArbSchG — vor Aufnahme der Tätigkeit und danach regelmäßig" },
      ERSTE_HILFE,
    ]),
  },
];

const NACH_ID = new Map(BRANCHEN.map((b) => [b.id, b]));

/* Kennungen, die es einmal gab oder die von außen kommen. Ohne diese
   Brücke verlöre ein bestehender Betrieb seine Branche. */
const ALTE_KENNUNGEN = {
  industrie: "produktion",
  sonstige: "sonstiges",
  pflegeheim: "pflege",
  krankenhaus: "klinik",
  security: "sicherheit",
};

/**
 * Das Profil zu einer Branchenkennung. Unbekanntes landet bei „Sonstiges" —
 * nie bei nichts: Ein Betrieb ohne Profil hätte keine Einheitsbezeichnung
 * und keinen Katalog.
 */
export function brancheVon(id) {
  const k = ALTE_KENNUNGEN[id] || id;
  return NACH_ID.get(k) || NACH_ID.get("sonstiges");
}

/** Wie die Einheit in dieser Branche heißt. */
export const einheitLabel = (id) => brancheVon(id).einheit;

/** Der Qualifikationskatalog der Branche, als frische Kopie. */
export const qualifikationenFuer = (id) =>
  brancheVon(id).qualifikationen.map((q) => ({ ...q }));

/** Die Dienstarten, mit denen ein neuer Betrieb dieser Branche startet. */
export const dienstartenFuer = (id) =>
  (brancheVon(id).dienstarten || DIENSTARTEN_STANDARD).map((d) => ({ ...d }));

/** Übliche Fachkraftquote — oder null, wo keine geprüft wird. */
export const quoteFuer = (id) => brancheVon(id).quote || null;

/** Welches Zusatzpaket zu dieser Branche gehört — oder null für den Kern. */
export const paketFuer = (id) => brancheVon(id).paket || null;

/** Für Auswahlfelder: [Kennung, Name, Einheitsbezeichnung]. */
export const branchenListe = () => BRANCHEN.map((b) => [b.id, b.name, b.einheit]);
