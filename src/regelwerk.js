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
export const between = (a, b) => Math.round((pISO(b) - pISO(a)) / 86400000);
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
  return (start - ende) / 60;
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
 * @param stundenAmTag  (datum) => Stunden — was an diesem Tag gearbeitet wurde
 * @param bis           letzter Tag des Zeitraums
 * @param opt.wochen    Länge des Ausgleichszeitraums (Vorgabe 24)
 * @param opt.grenze    zulässiger Durchschnitt je Werktag (Vorgabe 8)
 *
 * @returns {
 *   von, bis, werktage, stunden, zulaessig, durchschnitt,
 *   eingehalten, ueberhang
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
