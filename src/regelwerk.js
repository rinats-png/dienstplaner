/* ==========================================================================
   REGELWERK

   Ruhezeiten, Höchstarbeitszeit, Dienstserien und der Ausgleichszeitraum —
   der Teil, bei dem ein Fehler unmittelbar rechtliche Folgen hat. Bis hierher
   steckte er mitten in einer Datei mit über achtzehntausend Zeilen, ohne
   einen einzigen Test.

   Diese Datei enthält nur reine Funktionen: Eingabe rein, Ergebnis raus,
   kein Zustand, kein React, kein Speicher. Das ist der Grund, warum sie sich
   prüfen lässt — und der Grund, warum die Prüfungen in Millisekunden laufen.

   Was hier steht, ist die gesetzliche Untergrenze. Tarifverträge und
   Betriebsvereinbarungen können strenger sein; deren Werte kommen aus den
   Einstellungen des Betriebs und überschreiben die Vorgaben.
   ========================================================================== */

/* --------------------------------------------------------------------------
   DATUM UND ZEIT
   -------------------------------------------------------------------------- */

export const pad = (n) => String(n).padStart(2, "0");
export const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const pISO = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
export const addDays = (s, n) => { const d = pISO(s); d.setDate(d.getDate() + n); return iso(d); };
/** Montag ist 0 — im deutschen Arbeitsrecht beginnt die Woche dort. */
export const dow = (s) => (pISO(s).getDay() + 6) % 7;
export const between = (a, b) => Math.round((pISO(b).getTime() - pISO(a).getTime()) / 86400000);
export const dim_ = (y, m) => new Date(y, m + 1, 0).getDate();
export const montag = (s) => addDays(s, -dow(s));
export const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/* --------------------------------------------------------------------------
   DIENSTE
   -------------------------------------------------------------------------- */

/** Bezahlte Stunden eines Dienstes, Pause abgezogen. */
export function dauer(d) {
  let x = toMin(d.ende) - toMin(d.start);
  if (x <= 0) x += 1440;                     // Ende vor Start heißt Folgetag
  return Math.round((x / 60 - (d.pause || 0) / 60) * 100) / 100;
}

/** Anwesenheit von Beginn bis Ende, ohne Pausenabzug. */
export function brutto(d) {
  let x = toMin(d.ende) - toMin(d.start);
  if (x <= 0) x += 1440;
  return x / 60;
}

/**
 * Lage eines Dienstes auf einer durchgehenden Minutenachse ab 2000-01-01.
 * Dadurch lassen sich Dienste über Mitternacht ohne Sonderfälle vergleichen.
 */
export function fenster(datum, d) {
  const basis = between("2000-01-01", datum) * 1440;
  const start = basis + toMin(d.start);
  let ende = basis + toMin(d.ende);
  if (ende <= start) ende += 1440;
  return [start, ende];
}

/* --------------------------------------------------------------------------
   SOMMERZEIT

   Zweimal im Jahr hat der Tag nicht vierundzwanzig Stunden. In der Nacht
   zum letzten Sonntag im März springt die Uhr um zwei auf drei — der Tag
   hat dreiundzwanzig Stunden. Im Oktober zurück von drei auf zwei —
   fünfundzwanzig.

   Für einen Nachtdienst von 22 bis 6 Uhr heißt das: Er dauert in dieser
   einen Nacht sieben Stunden, nicht acht. Im Oktober neun. Gerechnet wurde
   bis hierher stur mit der Uhrzeit, also beide Male mit acht.

   Das ist keine Kleinigkeit. Ein Pflegeheim mit fünf Nachtwachen zahlt im
   Oktober jedes Jahr fünf Stunden zu wenig und im März fünf zu viel. Und
   die Ruhezeit nach § 5 ArbZG wird an derselben Stelle falsch gerechnet:
   In der Märznacht liegt zwischen Dienstende und Dienstbeginn eine Stunde
   weniger, als die Uhr zeigt.

   Die Umstellung gilt europaweit einheitlich um 01:00 UTC, in
   mitteleuropäischer Zeit also um 02:00 Ortszeit (März) beziehungsweise
   03:00 (Oktober). Gerechnet wird hier auf der Ortszeitachse, deshalb liegt
   der Sprungpunkt in beiden Fällen bei 02:00 der Ortszeit vor dem Sprung.
   -------------------------------------------------------------------------- */

/** Der letzte Sonntag eines Monats, als ISO-Tag. */
export function letzterSonntag(jahr, monat) {
  const d = new Date(jahr, monat, 0);              // letzter Tag des Monats
  d.setDate(d.getDate() - ((d.getDay() + 7) % 7)); // zurück auf Sonntag
  return iso(d);
}

/**
 * Springt an diesem Tag die Uhr? Gibt die Minuten zurück, die dem Tag
 * fehlen (−60 im März) oder die er zusätzlich hat (+60 im Oktober), sonst 0.
 */
export function uhrsprung(datum) {
  const jahr = Number(String(datum).slice(0, 4));
  if (datum === letzterSonntag(jahr, 3)) return -60;
  if (datum === letzterSonntag(jahr, 10)) return 60;
  return 0;
}

/**
 * Wie viele Minuten die Uhr zwischen zwei Punkten der Ortszeitachse
 * gesprungen ist. Beide Werte sind Minuten seit 2000-01-01 00:00 Ortszeit,
 * wie sie fenster() liefert.
 *
 * Wirkliche Dauer = (bis − von) + uhrversatz(von, bis).
 */
export function uhrversatz(von, bis) {
  if (!(bis > von)) return 0;
  let summe = 0;
  const ersterTag = Math.floor(von / 1440);
  const letzterTag = Math.floor((bis - 1) / 1440);
  for (let t = ersterTag; t <= letzterTag; t++) {
    const tag = addDays("2000-01-01", t);
    const sprung = uhrsprung(tag);
    if (!sprung) continue;
    /* Der Sprungpunkt liegt bei 02:00 Ortszeit vor dem Sprung. Er zählt
       nur, wenn er echt zwischen den beiden Punkten liegt — ein Dienst,
       der genau um 02:00 endet, ist noch nicht betroffen. */
    const punkt = t * 1440 + 120;
    if (punkt > von && punkt < bis) summe += sprung;
  }
  return summe;
}

/**
 * Bezahlte Stunden eines Dienstes an einem bestimmten Tag — mit der
 * Sommerzeit. Für alle Tage außer zweien im Jahr dasselbe wie dauer().
 */
export function dauerAm(datum, d) {
  const [von, bis] = fenster(datum, d);
  const versatz = uhrversatz(von, bis);
  if (!versatz) return dauer(d);
  return Math.round((dauer(d) + versatz / 60) * 100) / 100;
}

/** Anwesenheit an einem bestimmten Tag, ohne Pausenabzug, mit Sommerzeit. */
export function bruttoAm(datum, d) {
  const [von, bis] = fenster(datum, d);
  return (bis - von + uhrversatz(von, bis)) / 60;
}

/* --------------------------------------------------------------------------
   § 4 ArbZG — RUHEPAUSEN

   Mehr als sechs Stunden: dreißig Minuten. Mehr als neun: fünfundvierzig.
   Aufteilbar in Abschnitte von mindestens fünfzehn Minuten.
   -------------------------------------------------------------------------- */

export function pausePflicht(arbeitsstunden) {
  if (arbeitsstunden > 9) return 45;
  if (arbeitsstunden > 6) return 30;
  return 0;
}

/**
 * Reicht die eingetragene Pause?
 * Gerechnet wird gegen die Anwesenheit, nicht gegen die bezahlte Zeit —
 * die Pause ist ja gerade das, was dazwischen liegt.
 */
export function pauseGenuegt(d) {
  const anwesend = brutto(d);
  const noetig = pausePflicht(anwesend - (d.pause || 0) / 60);
  return (d.pause || 0) >= noetig;
}

/* --------------------------------------------------------------------------
   § 5 ArbZG — RUHEZEIT

   Elf Stunden ununterbrochen nach Beendigung der täglichen Arbeitszeit. In
   Krankenhäusern und Pflegeeinrichtungen darf auf zehn verkürzt werden, wenn
   der Ausgleich innerhalb eines Kalendermonats oder von vier Wochen erfolgt
   (§ 5 Abs. 2). Der Betrieb hinterlegt den für ihn geltenden Wert.
   -------------------------------------------------------------------------- */

export function ruhezeitStunden(datumDavor, dienstDavor, dienstDanach, tageSpaeter = 1) {
  const [, ende] = fenster(datumDavor, dienstDavor);
  const [start] = fenster(addDays(datumDavor, tageSpaeter), dienstDanach);
  /* In der Nacht der Zeitumstellung ist die Ruhezeit eine Stunde kürzer
     oder länger, als die Uhr zeigt. Im März ist das der Fall, in dem elf
     Stunden auf dem Plan zehn in Wirklichkeit sind — und damit ein Verstoß
     gegen § 5 Abs. 1 ArbZG, den der Plan nicht zeigte. */
  return (start - ende + uhrversatz(ende, start)) / 60;
}

export function ruhezeitVerletzt(einstellungen, datumDavor, dienstDavor, dienstDanach, tageSpaeter = 1) {
  const noetig = (einstellungen && einstellungen.ruhezeit) || 11;
  return ruhezeitStunden(datumDavor, dienstDavor, dienstDanach, tageSpaeter) < noetig;
}

/* --------------------------------------------------------------------------
   § 3 ArbZG — WERKTÄGLICHE ARBEITSZEIT UND AUSGLEICHSZEITRAUM

   Das war die Lücke.

   Acht Stunden werktäglich. Verlängerbar auf zehn, „wenn innerhalb von sechs
   Kalendermonaten oder innerhalb von 24 Wochen im Durchschnitt acht Stunden
   werktäglich nicht überschritten werden."

   Der Durchschnitt ist der Kern der Vorschrift, und genau er fehlte: Bis
   hierher prüfte die Anwendung die Tagesgrenze und ein Stundenkonto gegen
   eine frei gesetzte Schwelle — beides sagt nichts über den gesetzlichen
   Ausgleich. Ein Plan kann Woche für Woche zulässig aussehen und den
   Zeitraum trotzdem reißen.

   Werktage sind Montag bis Samstag. Der Sonntag zählt nicht mit, weder als
   Teiler noch als Ausnahme — Sonntagsarbeit regelt § 9 gesondert, die dort
   geleisteten Stunden fließen aber in den Durchschnitt ein.
   -------------------------------------------------------------------------- */

export const HOECHST_TAG = 10;          // § 3 Satz 2
export const DURCHSCHNITT_TAG = 8;      // § 3 Satz 1
export const AUSGLEICH_WOCHEN = 24;     // § 3 Satz 2, zweite Möglichkeit

/** Werktage (Mo–Sa) im Zeitraum, beide Enden eingeschlossen. */
export function werktage(von, bis) {
  let n = 0;
  for (let d = von; d <= bis; d = addDays(d, 1)) if (dow(d) < 6) n++;
  return n;
}

/**
 * Prüft § 3 ArbZG über einen gleitenden Zeitraum.
 *
 * @param {(datum: string) => number} stundenAmTag  was an diesem Tag gearbeitet wurde
 * @param {string} bis   letzter Tag des Zeitraums
 * @param {object} [opt]
 * @param {number} [opt.wochen]  Länge des Ausgleichszeitraums (Vorgabe 24)
 * @param {number} [opt.grenze]  zulässiger Durchschnitt je Werktag (Vorgabe 8)
 *
 * @returns {{von: string, bis: string, werktage: number, stunden: number,
 *   zulaessig: number, durchschnitt: number, eingehalten: boolean,
 *   ueberhang: number}}
 * }
 */
export function ausgleichszeitraum(stundenAmTag, bis, opt = {}) {
  const wochen = opt.wochen || AUSGLEICH_WOCHEN;
  const grenze = opt.grenze || DURCHSCHNITT_TAG;
  const von = addDays(bis, -(wochen * 7 - 1));

  let stunden = 0;
  for (let d = von; d <= bis; d = addDays(d, 1)) stunden += Number(stundenAmTag(d)) || 0;

  const tage = werktage(von, bis);
  const zulaessig = tage * grenze;
  const durchschnitt = tage ? stunden / tage : 0;

  return {
    von, bis, werktage: tage,
    stunden: Math.round(stunden * 100) / 100,
    zulaessig: Math.round(zulaessig * 100) / 100,
    durchschnitt: Math.round(durchschnitt * 100) / 100,
    eingehalten: stunden <= zulaessig,
    /* Wie viele Stunden müssen abgebaut werden, um wieder im Rahmen zu
       sein? Das ist die Zahl, die eine Planerin braucht — nicht der
       Durchschnitt auf zwei Nachkommastellen. */
    ueberhang: Math.max(0, Math.round((stunden - zulaessig) * 100) / 100),
  };
}

/**
 * Prüft die Tagesgrenze nach § 3 Satz 2.
 * Über zehn Stunden ist ohne Ausnahmegenehmigung nach § 15 unzulässig.
 */
export function tagesgrenzeVerletzt(stunden, grenze = HOECHST_TAG) {
  return Number(stunden) > grenze + 0.001;   // Rundungsschlupf
}

/* --------------------------------------------------------------------------
   DIENSTSERIEN

   Keine unmittelbare Vorschrift des Arbeitszeitgesetzes, sondern eine Regel
   aus Tarifverträgen und Betriebsvereinbarungen — und aus der Arbeitsmedizin.
   Die Grenze kommt deshalb aus den Einstellungen.
   -------------------------------------------------------------------------- */

/**
 * Längste ununterbrochene Dienstfolge im Zeitraum.
 * @param hatDienst (datum) => boolean
 */
export function laengsteFolge(hatDienst, von, bis) {
  let laenge = 0, beste = 0, start = null, besterStart = null;
  for (let d = von; d <= bis; d = addDays(d, 1)) {
    if (hatDienst(d)) {
      if (laenge === 0) start = d;
      laenge++;
      if (laenge > beste) { beste = laenge; besterStart = start; }
    } else laenge = 0;
  }
  return { laenge: beste, ab: besterStart };
}

/** Alle Serien, die über der Grenze liegen. */
export function folgenUeberGrenze(hatDienst, von, bis, grenze) {
  const aus = [];
  let laenge = 0, start = null;
  const schliessen = (ende) => {
    if (laenge > grenze) aus.push({ ab: start, bis: ende, laenge });
    laenge = 0; start = null;
  };
  for (let d = von; d <= bis; d = addDays(d, 1)) {
    if (hatDienst(d)) { if (laenge === 0) start = d; laenge++; }
    else schliessen(addDays(d, -1));
  }
  if (laenge) schliessen(bis);
  return aus;
}

/* --------------------------------------------------------------------------
   § 6 ArbZG — NACHTARBEIT

   Nachtzeit ist 23 bis 6 Uhr, in Bäckereien 22 bis 5. Ein Nachtdienst ist
   ein Dienst mit mehr als zwei Stunden in dieser Zeit. Die werktägliche
   Arbeitszeit von Nachtarbeitenden darf acht Stunden nur überschreiten, wenn
   der Ausgleich binnen eines Kalendermonats oder vier Wochen erfolgt — ein
   deutlich kürzerer Zeitraum als der allgemeine.
   -------------------------------------------------------------------------- */

export const NACHT_VON = 23 * 60;
export const NACHT_BIS = 6 * 60;
export const NACHT_AUSGLEICH_WOCHEN = 4;

/** Minuten eines Dienstes, die in die Nachtzeit fallen. */
export function nachtMinuten(d) {
  const s = toMin(d.start);
  let e = toMin(d.ende);
  if (e <= s) e += 1440;
  let summe = 0;
  /* Zwei Abschnitte, weil die Nachtzeit über Mitternacht läuft: 23–24 Uhr
     des Vortags reicht als 1380–1440 herein, 0–6 Uhr als 0–360, und für
     Dienste, die über Mitternacht gehen, noch einmal 1440+ */
  for (const [a, b] of [[0, NACHT_BIS], [NACHT_VON, 1440 + NACHT_BIS], [1440 + NACHT_VON, 2880]]) {
    summe += Math.max(0, Math.min(e, b) - Math.max(s, a));
  }
  return Math.min(summe, e - s);
}

/** Ist das ein Nachtdienst im Sinne des § 2 Abs. 4? */
export function istNachtdienst(d) {
  return nachtMinuten(d) > 120;
}

/* --------------------------------------------------------------------------
   WOHER EINE ANFORDERUNG KOMMT — UND WOFÜR SIE GILT

   Bis hierher stand die Rechtsgrundlage einer Qualifikation als Fließtext
   im Datensatz. Für einen Menschen lesbar, für die Anwendung nicht: Sie
   formulierte jede harte Sperre gleich — „Der Einsatz ist unzulässig" —,
   ganz gleich, ob dahinter das Pflegeberufegesetz stand oder eine
   betriebliche Festlegung aus der Gefährdungsbeurteilung. Das ist genau
   die Anmaßung, vor der ein Compliance-Werkzeug sich hüten muss: Es darf
   keine Gesetzeskraft behaupten, die ihm niemand gesagt hat.

   Zwei Merkmale, und sie sind ausdrücklich unabhängig voneinander:

   EBENE — woher die Anforderung stammt. Bundesrecht gilt überall gleich,
   Landesrecht nur in den genannten Ländern, Tarif- und Dienstvereinbarungen
   binden den Betrieb, aber sind kein Gesetz, und eine betriebliche
   Festlegung ist die eigene Entscheidung des Arbeitgebers.

   BEZUG — woran die Anforderung hängt. An der Person, an einer bestimmten
   Tätigkeit oder an einer bestimmten Einrichtung.

   Dass beides getrennt sein muss, zeigt § 34a GewO: Die Sachkundeprüfung
   ist Bundesrecht und gilt trotzdem nicht für jeden Wachmann, sondern nur
   für die dort genannten Tätigkeiten. „Bundesrecht" und „gilt für alle"
   sind eben nicht dasselbe. Dasselbe in der Pflege: Die Fachweiterbildung
   Intensiv ist keine bundeseinheitliche Pflicht, sondern hängt an Land,
   Einrichtung und Funktion.

   Ohne Angabe gilt „betrieblich". Das ist die vorsichtige Richtung: Wer
   nichts hinterlegt hat, bekommt keine Gesetzesbehauptung geschenkt.
   -------------------------------------------------------------------------- */

export const EBENEN = {
  bund: { label: "Bundesrecht", kurz: "Bund", gesetzlich: true,
    wort: "unzulässig", satz: "Gilt bundesweit gleich." },
  land: { label: "Landesrecht", kurz: "Land", gesetzlich: true,
    wort: "unzulässig", satz: "Gilt nur in den genannten Bundesländern." },
  tarif: { label: "Tarif oder Dienstvereinbarung", kurz: "Tarif", gesetzlich: false,
    wort: "nicht vereinbarungsgemäß", satz: "Bindet den Betrieb, ist aber kein Gesetz." },
  betrieb: { label: "Betriebliche Festlegung", kurz: "Betrieb", gesetzlich: false,
    wort: "gegen die betriebliche Vorgabe", satz: "Eigene Entscheidung des Arbeitgebers." },
};

export const BEZUEGE = {
  person: { label: "an der Person", satz: "Gilt für die Person unabhängig vom Dienst." },
  taetigkeit: { label: "an der Tätigkeit", satz: "Gilt nur für bestimmte Tätigkeiten." },
  einrichtung: { label: "an der Einrichtung", satz: "Gilt nur in bestimmten Einrichtungen." },
};

/**
 * Wie verbindlich ist diese Qualifikation hier und heute?
 *
 * @param {object} q          Die Qualifikation aus dem Bestand
 * @param {object} [kontext]
 * @param {string} [kontext.land]  Bundesland des Einsatzorts, zweistellig
 */
export function verbindlichkeit(q, kontext = {}) {
  const ebene = q && EBENEN[q.ebene] ? q.ebene : "betrieb";
  const def = EBENEN[ebene];
  const bezug = q && BEZUEGE[q.bezug] ? q.bezug : "person";
  const laender = Array.isArray(q && q.laender) ? q.laender.filter(Boolean) : [];

  /* Landesrecht ohne Länderangabe bindet überall — das ist keine gute
     Konfiguration, aber die sichere Auslegung wäre hier die falsche: Wer
     Landesrecht einträgt und kein Land nennt, meint in aller Regel „mein
     Betrieb". Gemeldet wird der Mangel trotzdem, siehe unten. */
  const giltHier = ebene !== "land" || laender.length === 0
    || (!!kontext.land && laender.includes(kontext.land));

  return {
    ebene, bezug, laender, giltHier,
    label: def.label, kurz: def.kurz, gesetzlich: def.gesetzlich, wort: def.wort,
    /* Eine Sperre wirkt nur, wo die Anforderung überhaupt gilt. */
    sperrt: !!(q && q.harteSperre) && giltHier,
  };
}

/**
 * Mängel in der Konfiguration einer Qualifikation.
 *
 * Nicht der Plan wird geprüft, sondern die Regel selbst. Eine Sperre ohne
 * Rechtsgrundlage ist keine Rechtsdurchsetzung, sondern eine Behauptung —
 * und eine tätigkeitsabhängige Anforderung, die pauschal jeden Dienst
 * sperrt, ist genau der Fehler, den § 34a GewO nicht hergibt.
 */
export function regelMaengel(q) {
  const aus = [];
  const v = verbindlichkeit(q);
  const name = (q && q.name) || "Qualifikation";

  if (q && q.harteSperre && !String(q.grundlage || "").trim())
    aus.push({ art: "ohneGrundlage", schwere: "warn", qualId: q.id,
      text: `${name} sperrt den Einsatz, nennt aber keine Grundlage. `
        + "Wer einen Dienst verhindert, sollte sagen können, worauf er sich stützt." });

  if (q && q.harteSperre && !v.gesetzlich)
    aus.push({ art: "sperreOhneGesetz", schwere: "info", qualId: q.id,
      /* Nicht kleinschreiben: „betriebliche festlegung" las sich wie ein
         Tippfehler. Der Klartext der Ebene ist ein Substantiv. */
      text: `${name} ist hinterlegt als: ${v.label}. Die Anforderung sperrt trotzdem den Einsatz. `
        + "Das ist zulässig, wird aber als betriebliche Vorgabe ausgewiesen, nicht als gesetzliches Verbot." });

  if (q && q.harteSperre && v.bezug === "taetigkeit")
    aus.push({ art: "pauschaleSperre", schwere: "warn", qualId: q.id,
      text: `${name} hängt an der Tätigkeit, sperrt aber jeden Dienst. `
        + "Wo das Recht nach Tätigkeiten unterscheidet — etwa § 34a GewO —, gehört die Anforderung "
        + "an die betreffenden Dienstarten statt an alle." });

  if (q && q.ebene === "land" && !v.laender.length)
    aus.push({ art: "landOhneLand", schwere: "warn", qualId: q.id,
      text: `${name} ist als Landesrecht hinterlegt, nennt aber kein Bundesland. `
        + "Sie wirkt deshalb an allen Standorten gleich." });

  if (q && q.gueltigMonate && q.intervallBetrieblich && v.gesetzlich)
    aus.push({ art: "intervallBetrieblich", schwere: "info", qualId: q.id,
      text: `Die Pflicht zu ${name} folgt aus dem Gesetz, die Wiederholung alle `
        + `${q.gueltigMonate} Monate ist eine betriebliche Festlegung.` });

  return aus;
}

/* --------------------------------------------------------------------------
   § 6 Abs. 3 ArbZG — ARBEITSMEDIZINISCHE UNTERSUCHUNG

   Nachtarbeitnehmer haben das Recht, sich vor Beginn der Beschäftigung und
   danach in regelmäßigen Zeitabständen von nicht weniger als drei Jahren
   arbeitsmedizinisch untersuchen zu lassen. Nach Vollendung des
   fünfzigsten Lebensjahres steht ihnen die Untersuchung jährlich zu.

   Zwei Dinge, die hier bewusst nicht getan werden:

   Es ist ein Anspruch der Beschäftigten, keine Pflicht — wer nicht will,
   muss nicht. Der Befund ist deshalb ein Hinweis an den Betrieb, dass das
   Angebot fällig ist, und niemals eine Einsatzsperre.

   Und wer Nachtarbeitnehmer ist, steht in § 2 Abs. 5: wer Nachtarbeit in
   Wechselschicht leistet oder an mindestens 48 Tagen im Kalenderjahr. Die
   zweite Hälfte lässt sich zählen, die erste nicht — deshalb genügt hier
   die gezählte Schwelle, und der Kommentar sagt, warum das die
   vorsichtigere Richtung ist: Wer in Wechselschicht fährt, kommt fast
   immer auch über 48 Tage.
   -------------------------------------------------------------------------- */

export const NACHT_TAGE_SCHWELLE = 48;     // § 2 Abs. 5 Nr. 2
export const VORSORGE_MONATE = 36;         // § 6 Abs. 3 Satz 1
export const VORSORGE_MONATE_AB_50 = 12;   // § 6 Abs. 3 Satz 2

/**
 * Ist die arbeitsmedizinische Untersuchung fällig?
 *
 * @param {object} p
 * @param {number} p.nachtTage      Nachtdienste im laufenden Kalenderjahr
 * @param {number|null} p.alter     Alter am Stichtag, null wenn unbekannt
 * @param {string|null} p.letzte    Datum der letzten Untersuchung, ISO
 * @param {string} p.stichtag       Bezugstag, ISO
 */
export function vorsorgeFaellig({ nachtTage, alter, letzte, stichtag }) {
  if (!Number.isFinite(nachtTage) || nachtTage < NACHT_TAGE_SCHWELLE)
    return { nachtarbeitnehmer: false, faellig: false };

  const abstand = alter !== null && alter >= 50 ? VORSORGE_MONATE_AB_50 : VORSORGE_MONATE;

  /* Ohne jede Untersuchung ist das Angebot schon vor Beginn der
     Beschäftigung fällig — deshalb hier kein "unbekannt, also gut". */
  if (!letzte) return { nachtarbeitnehmer: true, faellig: true, abstand, letzte: null, faellig_am: null };

  const [jy, jm, jd] = String(letzte).split("-").map(Number);
  const f = new Date(jy, (jm - 1) + abstand, jd);
  const faelligAm = iso(f);
  return { nachtarbeitnehmer: true, faellig: stichtag >= faelligAm, abstand, letzte, faellig_am: faelligAm };
}

/* --------------------------------------------------------------------------
   § 11 ArbZG — SONN- UND FEIERTAGSRUHE

   Zwei getrennte Vorschriften, die gern verwechselt werden.

   Absatz 1: Mindestens fünfzehn Sonntage im Jahr müssen beschäftigungsfrei
   bleiben. Das ist eine Jahresbilanz je Person, kein Ereignis an einem
   einzelnen Tag — sie lässt sich erst beurteilen, wenn man das ganze Jahr
   ansieht, und deshalb rechnet die Funktion auch mit dem noch offenen Rest
   des Jahres.

   Absatz 3: Wer an einem Sonntag arbeitet, muss einen Ersatzruhetag
   innerhalb eines den Beschäftigungstag einschließenden Zeitraums von zwei
   Wochen haben. Bei Feiertagsarbeit an einem Werktag sind es acht Wochen.

   Der Ersatzruhetag ist ein ganzer freier Tag — kein Tag mit einem kurzen
   Dienst, und auch kein Tag, der ohnehin schon als Ersatz für einen anderen
   Sonntag verbraucht ist. Das zweite ist der Grund, warum hier zugeordnet
   und nicht bloß gezählt wird: Bei zwei Sonntagen in Folge und nur einem
   freien Tag dazwischen wäre eine Zählung zufrieden, die Vorschrift nicht.
   -------------------------------------------------------------------------- */

export const FREIE_SONNTAGE_MIN = 15;       // § 11 Abs. 1
export const ERSATZ_TAGE_SONNTAG = 14;      // § 11 Abs. 3 Satz 1
export const ERSATZ_TAGE_FEIERTAG = 56;     // § 11 Abs. 3 Satz 2

/**
 * Ordnet jedem Sonn- und Feiertagsdienst einen Ersatzruhetag zu.
 *
 * `hatDienst(datum)` sagt, ob an dem Tag gearbeitet wird; `istFeiertag`
 * ebenso. Beide bekommen ISO-Tage. Zurück kommt eine Liste der Tage, für
 * die kein freier Tag mehr übrig war.
 *
 * Zugeordnet wird gierig und vom frühesten Anspruch aus: Wer den engeren
 * Zeitraum hat — der Sonntag mit zwei Wochen —, greift zuerst zu. Andernfalls
 * verbraucht ein Feiertag mit acht Wochen Spielraum den einen freien Tag,
 * den der Sonntag daneben zwingend gebraucht hätte.
 */
export function ersatzruhetage(hatDienst, istFeiertag, von, bis) {
  const anspruch = [];
  for (let d = von; d <= bis; d = addDays(d, 1)) {
    if (!hatDienst(d)) continue;
    const sonntag = dow(d) === 6;
    const feiertag = istFeiertag(d);
    if (!sonntag && !feiertag) continue;
    /* Ein Feiertag, der auf einen Sonntag fällt, ist ein Sonntag — die
       kürzere Frist gilt. */
    anspruch.push({ datum: d, art: sonntag ? "sonntag" : "feiertag",
      frist: sonntag ? ERSATZ_TAGE_SONNTAG : ERSATZ_TAGE_FEIERTAG });
  }
  anspruch.sort((a, b) => (a.frist - b.frist) || (a.datum < b.datum ? -1 : 1));

  const belegt = new Set();
  const offen = [];
  for (const a of anspruch) {
    /* „Innerhalb eines den Beschäftigungstag einschließenden Zeitraums von
       zwei Wochen." Der Zeitraum ist nicht um den Tag zentriert — er darf
       beliebig liegen, solange er beide Tage enthält. Ein Zeitraum von n
       Tagen, der Tag und Ersatztag umfasst, existiert genau dann, wenn ihr
       Abstand höchstens n − 1 beträgt. Beim Sonntag also dreizehn Tage in
       jede Richtung, nicht sechs.

       Gesucht wird vom Tag aus nach außen, und bei gleichem Abstand zuerst
       nach hinten: Ein Ruhetag nach dem gearbeiteten Sonntag ist der
       naheliegende Fall, und er lässt die früheren Tage für ältere
       Ansprüche frei. */
    const weite = a.frist - 1;
    let gefunden = null;
    for (let abstand = 1; abstand <= weite && !gefunden; abstand++) {
      for (const k of [abstand, -abstand]) {
        const t = addDays(a.datum, k);
        if (belegt.has(t) || hatDienst(t)) continue;
        if (dow(t) === 6) continue;        // ein Sonntag ist kein Ersatz für einen Sonntag
        gefunden = t; break;
      }
    }
    if (gefunden) belegt.add(gefunden);
    else offen.push(a);
  }
  return { offen, belegt: [...belegt].sort() };
}

/**
 * Die Jahresbilanz nach § 11 Abs. 1.
 *
 * Gezählt werden die Sonntage des Kalenderjahres ohne Dienst. Solange das
 * Jahr läuft, zählen die noch nicht verplanten Sonntage als frei mit —
 * sonst meldete die Prüfung im Januar für jeden einen Verstoß.
 */
export function freieSonntage(hatDienst, jahr, bisDatum = null) {
  let frei = 0, gearbeitet = 0, offen = 0;
  for (let d = `${jahr}-01-01`; d <= `${jahr}-12-31`; d = addDays(d, 1)) {
    if (dow(d) !== 6) continue;
    if (bisDatum && d > bisDatum) { offen++; continue; }
    if (hatDienst(d)) gearbeitet++; else frei++;
  }
  const moeglich = frei + offen;
  return {
    frei, gearbeitet, offen,
    moeglich,
    /* Nur wenn selbst alle offenen Sonntage frei bleiben die Zahl nicht mehr
       erreichen, steht der Verstoß fest. Vorher ist es eine Warnung wert,
       aber keine Feststellung. */
    verletzt: moeglich < FREIE_SONNTAGE_MIN,
    knapp: moeglich >= FREIE_SONNTAGE_MIN && frei < FREIE_SONNTAGE_MIN,
    noetig: FREIE_SONNTAGE_MIN,
  };
}

/* --------------------------------------------------------------------------
   BESONDERE PERSONENGRUPPEN

   Drei Fälle, in denen die Software einen Plan verhindern muss, der sonst
   zulässig wäre. Alle drei sind in Pflege und Sicherheit alltäglich.
   -------------------------------------------------------------------------- */

/** Alter in Jahren am Stichtag. Ohne Geburtsdatum: null. */
export function alterAm(geburtstag, datum) {
  if (!geburtstag || !/^\d{4}-\d{2}-\d{2}$/.test(String(geburtstag))) return null;
  const g = pISO(geburtstag), d = pISO(datum);
  let jahre = d.getFullYear() - g.getFullYear();
  const vorGeburtstag = d.getMonth() < g.getMonth()
    || (d.getMonth() === g.getMonth() && d.getDate() < g.getDate());
  if (vorGeburtstag) jahre--;
  return jahre;
}

/**
 * Prüft einen geplanten Dienst gegen die Schutzvorschriften.
 *
 * @returns Liste von Befunden: { regel, text, hart }
 *   hart = die Zuweisung ist unzulässig, nicht nur bedenklich.
 */
export function schutzBefunde(person, dienstart, datum) {
  const aus = [];
  const alter = alterAm(person.geburtstag || person.geburtsdatum, datum);

  /* --- Jugendarbeitsschutzgesetz --- */
  if (alter !== null && alter < 18) {
    if (istNachtdienst(dienstart) || toMin(dienstart.start) < 6 * 60)
      aus.push({ regel: "JArbSchG § 14", hart: true,
        text: "Jugendliche dürfen nicht zwischen 20 und 6 Uhr beschäftigt werden." });
    if (dauer(dienstart) > 8.5)
      aus.push({ regel: "JArbSchG § 8", hart: true,
        text: "Für Jugendliche gelten höchstens acht Stunden täglich." });
    if (dow(datum) >= 5)
      aus.push({ regel: "JArbSchG §§ 16–17", hart: false,
        text: "Samstags- und Sonntagsarbeit Jugendlicher ist nur in Ausnahmen zulässig — in der Pflege erlaubt, mit Ersatzruhetag." });
  }

  /* --- Mutterschutzgesetz --- */
  if (person.mutterschutz) {
    if (istNachtdienst(dienstart) || toMin(dienstart.start) < 6 * 60)
      aus.push({ regel: "MuSchG § 5", hart: true,
        text: "Nachtarbeit zwischen 20 und 6 Uhr nur mit Einwilligung und behördlicher Genehmigung." });
    if (dow(datum) === 6)
      aus.push({ regel: "MuSchG § 6", hart: true,
        text: "Sonntagsarbeit nur mit ausdrücklicher Einwilligung." });
  }

  /* --- Schwerbehinderung --- */
  if (person.schwerbehindert && dauer(dienstart) > 8)
    aus.push({ regel: "SGB IX § 207", hart: false,
      text: "Schwerbehinderte Menschen sind auf Verlangen von Mehrarbeit über acht Stunden freizustellen." });

  return aus;
}

/* --------------------------------------------------------------------------
   § 7 BUrlG — URLAUBSVERFALL UND HINWEISPFLICHT

   Nach der Rechtsprechung des EuGH (C-684/16) und des BAG (9 AZR 541/15)
   verfällt Urlaub nur, wenn der Arbeitgeber rechtzeitig und ausdrücklich auf
   den drohenden Verfall hingewiesen hat. Ohne Hinweis wird er übertragen und
   häuft sich an.

   Die Anwendung führt Urlaubskonten und ist damit die natürliche Stelle für
   diesen Hinweis. Das ist kein Beiwerk: Es nimmt dem Betrieb ein echtes
   Haftungsrisiko ab.
   -------------------------------------------------------------------------- */

/**
 * Steht ein Hinweis an?
 * @param offen         nicht genommene Tage
 * @param heuteDatum    Stichtag
 * @param letzterHinweis Datum des letzten protokollierten Hinweises
 */
export function urlaubshinweisFaellig(offen, heuteDatum, letzterHinweis) {
  if (!offen || offen <= 0) return { faellig: false };
  const jahr = Number(String(heuteDatum).slice(0, 4));
  const monat = Number(String(heuteDatum).slice(5, 7));

  /* Der Hinweis muss so früh kommen, dass der Urlaub noch zu nehmen ist.
     Ab Oktober bleibt dafür ein Vierteljahr — das ist die übliche Praxis. */
  if (monat < 10) return { faellig: false };

  const schonGewarnt = letzterHinweis
    && Number(String(letzterHinweis).slice(0, 4)) === jahr
    && Number(String(letzterHinweis).slice(5, 7)) >= 10;
  if (schonGewarnt) return { faellig: false };

  return {
    faellig: true,
    offen,
    verfaelltAm: `${jahr}-12-31`,
    /* Übertragung bis zum 31. März nur bei dringenden betrieblichen oder
       persönlichen Gründen (§ 7 Abs. 3 Satz 2). */
    uebertragBis: `${jahr + 1}-03-31`,
    text: `${offen} ${offen === 1 ? "Urlaubstag verfällt" : "Urlaubstage verfallen"} zum 31.12.${jahr}, `
      + "wenn sie nicht genommen werden.",
  };
}

/* --------------------------------------------------------------------------
   KOMPETENZEN

   Eine Qualifikation sagt, was jemand ist: Pflegefachkraft, Notfallsanitäter,
   Elektrofachkraft. Eine Kompetenz sagt, was jemand an einer bestimmten
   Sache darf: dieses Beatmungsgerät bedienen, diese Anlage schalten, diesen
   Stapler fahren.

   Der Unterschied ist keine Wortklauberei. „Geräteeinweisung" als
   Qualifikation führen heißt: Wer sie hat, gilt als eingewiesen — in was,
   steht nirgends. § 4 MPBetreibV verlangt die Einweisung aber je Gerät, und
   nach § 12 BetrSichV gilt dasselbe für Arbeitsmittel. Wer zwölf
   Beatmungsgeräte betreibt, braucht zwölf Nachweise, nicht einen.

   Deshalb hier ein eigenes Objekt, das vier Dinge zusammenbringt:

     woran   das Betriebsmittel oder die Tätigkeit
     wer     die freigebende Stelle — nicht jede Einweisung darf jeder geben
     wann    Erteilung und Wiederholung
     wofür   die Dienstarten, für die sie Voraussetzung ist

   Die Prüfung selbst ist bewusst einfach gehalten und rein: Sie bekommt
   Kompetenz und Nachweis und sagt, wie es steht. Was daraus folgt —
   Hinweis, Warnung oder Sperre — entscheidet die Anwendung.
   -------------------------------------------------------------------------- */

/** Wie lange vorher auf eine ablaufende Kompetenz hingewiesen wird. */
export const KOMPETENZ_VORLAUF = 60;

/**
 * Stand einer Kompetenz an einer Person.
 *
 * @param {object} kompetenz  Eintrag aus m.kompetenzen
 * @param {object|null} nachweis  Eintrag aus person.kompetenzNachweise
 * @param {string} heuteDatum
 * @returns {{stand: string, bis: (string|null), tage: (number|null),
 *   unbefristet: boolean, zurueckgenommen?: string}}
 *   stand: "fehlt" | "gueltig" | "laeuft_ab" | "abgelaufen"
 */
export function kompetenzStand(kompetenz, nachweis, heuteDatum) {
  if (!kompetenz) return { stand: "fehlt", bis: null, tage: null, unbefristet: false };
  if (!nachweis || !nachweis.ab)
    return { stand: "fehlt", bis: null, tage: null, unbefristet: false };

  /* Eine zurückgenommene Freigabe zählt nicht — sie steht weiter im
     Verlauf, damit nachvollziehbar bleibt, dass es sie gab. */
  if (nachweis.zurueckgenommen)
    return { stand: "fehlt", bis: null, tage: null, unbefristet: false,
      zurueckgenommen: nachweis.zurueckgenommen };

  /* Ohne Wiederholungsfrist gilt sie, bis jemand sie zurücknimmt. Ein
     ausdrücklich gesetztes Ende wirkt trotzdem. */
  const frist = kompetenz.wiederholungMonate;
  const bis = nachweis.bis
    || (frist ? addDays(nachweis.ab, Math.round(frist * 30.44)) : null);
  if (!bis) return { stand: "gueltig", bis: null, tage: null, unbefristet: true };

  const tage = between(heuteDatum, bis);
  return {
    stand: tage < 0 ? "abgelaufen" : tage <= KOMPETENZ_VORLAUF ? "laeuft_ab" : "gueltig",
    bis, tage, unbefristet: false,
  };
}

/** Gilt die Kompetenz an diesem Tag? */
export function kompetenzGilt(kompetenz, nachweis, datum) {
  const s = kompetenzStand(kompetenz, nachweis, datum);
  return s.stand === "gueltig" || s.stand === "laeuft_ab";
}

/**
 * Widersprüche in einer Kompetenz. Dasselbe Muster wie regelMaengel für
 * Qualifikationen: Die Anwendung soll sagen können, was an einer Vorgabe
 * nicht schlüssig ist, statt sie stillschweigend anzuwenden.
 */
export function kompetenzMaengel(k) {
  const aus = [];
  const name = (k && k.name) || "Kompetenz";
  if (!k) return aus;

  if ((k.pflichtFuer || []).length && !String(k.grundlage || "").trim())
    aus.push({ art: "ohneGrundlage", schwere: "warn", kompetenzId: k.id,
      text: `${name} ist Voraussetzung für einen Dienst, nennt aber keine Grundlage. `
        + "Wer eine Einteilung verhindert, sollte sagen können, worauf er sich stützt." });

  if (k.art === "geraet" && !k.betriebsmittelId)
    aus.push({ art: "geraetOhneMittel", schwere: "warn", kompetenzId: k.id,
      text: `${name} ist als Geräteeinweisung angelegt, nennt aber kein Betriebsmittel. `
        + "§ 4 MPBetreibV und § 12 BetrSichV verlangen die Einweisung je Gerät — "
        + "ohne Zuordnung bleibt offen, worauf sie sich bezieht." });

  if (!String(k.freigabeStelle || "").trim())
    aus.push({ art: "ohneFreigabeStelle", schwere: "info", kompetenzId: k.id,
      text: `Für ${name} ist keine freigebende Stelle hinterlegt. `
        + "Bei einer Prüfung ist das die erste Frage." });

  return aus;
}

/**
 * Welche Kompetenzen fehlen dieser Person für diese Dienstart?
 *
 * Steht hier statt in der Oberfläche, damit sie sich prüfen lässt: Die
 * Sperrwirkung ist der Grund, warum es das Objekt überhaupt gibt, und was
 * einen Dienst verhindert, gehört in den geprüften Kern.
 *
 * @param {Array} kompetenzen   alle Kompetenzen des Betriebs
 * @param {Array} nachweise     die Nachweise der Person
 * @param {string} dienstId
 * @param {string} datum
 * @param {Function} [mittelName] gibt zu einer Betriebsmittelkennung den Namen
 * @returns {Array<{komp: object, stand: object, text: string}>}
 */
export function fehlendeKompetenzen(kompetenzen, nachweise, dienstId, datum, mittelName) {
  const aus = [];
  for (const k of kompetenzen || []) {
    if (!(k.pflichtFuer || []).includes(dienstId)) continue;
    const n = (nachweise || []).find((x) => x.kompetenzId === k.id) || null;
    if (kompetenzGilt(k, n, datum)) continue;
    const stand = kompetenzStand(k, n, datum);
    const woran = k.betriebsmittelId && mittelName ? mittelName(k.betriebsmittelId) : null;
    aus.push({ komp: k, stand,
      text: `${k.name}${woran ? ` (${woran})` : ""} `
        + (stand.stand === "abgelaufen" ? `abgelaufen am ${stand.bis}` : "fehlt")
        + (k.grundlage ? ` — ${k.grundlage}` : "") });
  }
  return aus;
}
