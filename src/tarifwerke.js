/* ==========================================================================
   TARIFVORLAGEN

   Ein neu angelegter Betrieb startete mit den gesetzlichen Mindestwerten:
   40 Wochenstunden, 24 Urlaubstage, elf Stunden Ruhezeit. Das ist richtig
   als Untergrenze und für fast jeden Betrieb in Pflege, Klinik oder
   Rettungsdienst falsch — dort gilt ein Tarifvertrag oder eine
   arbeitsrechtliche Regelung, und deren Werte weichen an jeder Stelle ab.

   Wer das nicht kennt, plant mit 40 statt 38,5 Wochenstunden und rechnet
   ein Jahr lang Minusstunden zusammen, die es nicht gibt.

   ---------------------------------------------------------------------------
   Was hier steht — und was ausdrücklich nicht

   Hier stehen die **strukturellen** Werte: Wochenarbeitszeit, Urlaub,
   Zusatzurlaub, das Nachtfenster, die Zuschlagssätze in Prozent, die
   Definition der Wechselschicht. Sie stehen im Tarifvertrag selbst, ändern
   sich selten und sind das, was eine Dienstplanung braucht.

   Hier stehen **keine Entgelttabellen**. Zwei Gründe, beide gewichtig:

   Erstens rechnet CENTRIC keine Löhne. Die Zuschläge werden in
   Ausgleichsstunden je Zuschlagsart ausgegeben — genau das, was die
   Lohnstelle braucht — und der Eurobetrag entsteht dort, wo die
   Eingruppierung bekannt ist.

   Zweitens ändern sich die Beträge mit jeder Tarifrunde. Eine Tabelle mit
   zweiundsiebzig Beträgen, die niemand nachzieht, ist schlimmer als keine:
   Sie sieht ein Jahr später genauso verbindlich aus und ist es nicht.

   ---------------------------------------------------------------------------
   Stand und Verantwortung

   Jede Vorlage nennt ihre Fundstelle und den Stand. Beim Anwenden schreibt
   CENTRIC beides in den Betrieb, damit später nachvollziehbar ist, woher
   die Werte kamen. Eine Vorlage ersetzt weder den Blick in den
   Tarifvertrag noch die Betriebsvereinbarung — sie erspart nur das Abtippen
   und das Übersehen.
   ========================================================================== */

/** Woher die Werte stammen. Wird beim Anwenden mitgeschrieben. */
export const STAND = "2026-08";

/**
 * Eine Vorlage beschreibt, was sie am Betrieb ändert.
 *
 * einstellungen  überschreibt m.einstellungen
 * zuschlaege     ersetzt m.zuschlaege vollständig
 * hinweise       erscheint vor dem Anwenden — was die Vorlage nicht kann
 */
export const TARIFWERKE = [
  {
    id: "tvoed-p",
    name: "TVöD-P (Pflege, kommunal)",
    kurz: "TVöD-P",
    branchen: ["pflege", "klinik"],
    grundlage: "TVöD-B/VKA, Anlage zum TVöD für Beschäftigte in der Pflege",
    quelle: "https://www.tarif-oed.de/tvoed_paragraf_7",
    stand: STAND,
    beschreibung:
      "Kommunale Alten- und Krankenpflege. 38,5 Wochenstunden, Nachtarbeit "
      + "ab 21 Uhr, Zusatzurlaub für Wechselschicht.",
    einstellungen: {
      wochenstunden: 38.5,
      urlaubsanspruch: 30,
      ruhezeit: 11,
      maxTagesstunden: 10,
      ausgleichWochen: 24,
      pausen: { ab6h: 30, ab9h: 45 },
      nachtVon: "21:00",
      nachtBis: "06:00",
      /* § 7 Abs. 5 TVöD: Nachtschicht ist eine Schicht mit mindestens
         zwei Stunden Nachtarbeit. */
      nachtschichtAbStunden: 2,
      zusatzurlaub: {
        wechselschichtMonate: 2,      // ein Tag je zwei zusammenhängende Monate
        schichtMonate: 4,             // ein Tag je vier zusammenhängende Monate
      },
    },
    /* § 8 Abs. 1 TVöD. Beim Zusammentreffen wird nur der höchste gezahlt —
       das setzt zuschlagStunden() bereits so um. */
    zuschlaege: [
      { name: "Nachtarbeit 21–6 Uhr", art: "nacht", prozent: 20, aktiv: true },
      { name: "Sonntagsarbeit", art: "sonntag", prozent: 25, aktiv: true },
      { name: "Feiertagsarbeit ohne Freizeitausgleich", art: "feiertag", prozent: 135, aktiv: true },
      { name: "Samstagsarbeit 13–21 Uhr", art: "samstag", prozent: 20, aktiv: true },
    ],
    hinweise: [
      "Der Feiertagszuschlag beträgt 35 Prozent, wenn Freizeitausgleich gewährt wird, "
      + "und 135 Prozent ohne. Voreingestellt ist der Fall ohne Ausgleich; wer ausgleicht, "
      + "setzt den Wert auf 35.",
      "Für den 24. und 31. Dezember ab 6 Uhr gilt ein Zuschlag von 35 Prozent. "
      + "CENTRIC kennt keine Vorfesttage als eigene Zuschlagsart — bitte in der "
      + "Lohnstelle berücksichtigen.",
      "Überstundenzuschläge (30 Prozent bis Entgeltgruppe 9, 15 Prozent darüber) "
      + "hängen an der Eingruppierung und werden hier nicht abgebildet.",
      "38,5 Stunden gelten im kommunalen Bereich West. Im TVöD Bund sind es 39, "
      + "in einzelnen Ländern abweichend — bitte prüfen.",
    ],
  },

  {
    id: "tvoed-k",
    name: "TVöD-K (Krankenhäuser)",
    kurz: "TVöD-K",
    branchen: ["klinik", "rettung"],
    grundlage: "TVöD-K, Besonderer Teil Krankenhäuser",
    quelle: "https://www.tv-oed.de/tv-kommunaler-bereich/tvoed-k-krankenhaeuser/tvoed_k_027",
    stand: STAND,
    beschreibung:
      "Kommunale Krankenhäuser. Wie TVöD-P, zusätzlich Bereitschaftsdienst "
      + "und Rufbereitschaft mit eigener Anrechnung.",
    einstellungen: {
      wochenstunden: 38.5,
      urlaubsanspruch: 30,
      ruhezeit: 11,
      maxTagesstunden: 10,
      ausgleichWochen: 24,
      pausen: { ab6h: 30, ab9h: 45 },
      nachtVon: "21:00",
      nachtBis: "06:00",
      nachtschichtAbStunden: 2,
      zusatzurlaub: { wechselschichtMonate: 2, schichtMonate: 4 },
    },
    zuschlaege: [
      { name: "Nachtarbeit 21–6 Uhr", art: "nacht", prozent: 20, aktiv: true },
      { name: "Sonntagsarbeit", art: "sonntag", prozent: 25, aktiv: true },
      { name: "Feiertagsarbeit ohne Freizeitausgleich", art: "feiertag", prozent: 135, aktiv: true },
      { name: "Samstagsarbeit 13–21 Uhr", art: "samstag", prozent: 20, aktiv: true },
    ],
    hinweise: [
      "Bereitschaftsdienst wird nach Stufen bewertet und nicht als volle Arbeitszeit "
      + "vergütet. CENTRIC bildet die Anrechnung über den Faktor an der Dienstart ab — "
      + "der Prozentsatz je Stufe kommt aus der Betriebsvereinbarung.",
      "Die Höchstarbeitszeit lässt sich bei Bereitschaftsdienst nach § 7 ArbZG "
      + "verlängern. Das setzt eine tarifvertragliche Regelung und die Zustimmung "
      + "der Beschäftigten voraus; die Prüfung in CENTRIC bleibt bei zehn Stunden.",
      "Wie beim TVöD-P: Feiertagszuschlag 35 Prozent mit Freizeitausgleich.",
    ],
  },

  {
    id: "avr-caritas",
    name: "AVR Caritas, Anlage 32 (Pflege)",
    kurz: "AVR",
    branchen: ["pflege", "klinik"],
    grundlage: "Richtlinien für Arbeitsverträge in den Einrichtungen des "
      + "Deutschen Caritasverbandes, Anlagen 30–33",
    quelle: "https://www.caritas.de/neue-caritas/heftarchiv/jahrgang2020/artikel/"
      + "zeitzuschlaege-nach-anlage-6-a-zu-den-avr",
    stand: STAND,
    beschreibung:
      "Caritas-Einrichtungen. Nachtarbeit ab 21 Uhr, Sonntag 25 Prozent, "
      + "Sonntag auf Feiertag 50 Prozent.",
    einstellungen: {
      wochenstunden: 39,
      urlaubsanspruch: 30,
      ruhezeit: 11,
      maxTagesstunden: 10,
      ausgleichWochen: 24,
      pausen: { ab6h: 30, ab9h: 45 },
      nachtVon: "21:00",
      nachtBis: "06:00",
      nachtschichtAbStunden: 2,
      zusatzurlaub: { wechselschichtMonate: 2, schichtMonate: 4 },
    },
    zuschlaege: [
      /* Der Nachtzuschlag ist in den AVR ein fester Betrag je Stunde, keine
         Prozentgröße. CENTRIC gibt Stunden je Zuschlagsart aus — die Regel
         steht deshalb mit null Prozent hier, damit die Stunden gezählt und
         an die Lohnstelle gemeldet werden, ohne einen Prozentsatz zu
         behaupten, den es nicht gibt. */
      { name: "Nachtarbeit 21–6 Uhr (fester Betrag je Stunde)", art: "nacht", prozent: 0, aktiv: true },
      { name: "Sonntagsarbeit", art: "sonntag", prozent: 25, aktiv: true },
      { name: "Feiertagsarbeit", art: "feiertag", prozent: 50, aktiv: true },
    ],
    hinweise: [
      "Der Nachtzuschlag ist in den AVR ein fester Eurobetrag je Stunde und keine "
      + "Prozentgröße. Die Regel steht mit null Prozent in der Liste: Die Stunden "
      + "werden gezählt und ausgegeben, der Betrag entsteht in der Lohnabrechnung.",
      "Fällt ein Sonntag auf einen Feiertag, gilt der volle Feiertagssatz. CENTRIC "
      + "wertet beim Zusammentreffen ohnehin nur den höchsten Zuschlag.",
      "Die AVR werden vom Arbeitsrechtlichen Ausschuss beschlossen und ändern sich "
      + "unabhängig vom TVöD. Die Werte hier sind der Stand August 2026.",
    ],
  },

  {
    id: "gesetzlich",
    name: "Nur gesetzliche Mindestwerte",
    kurz: "Gesetz",
    branchen: [],
    grundlage: "ArbZG, BUrlG",
    quelle: "https://www.gesetze-im-internet.de/arbzg/",
    stand: STAND,
    beschreibung:
      "Kein Tarifvertrag. Die Untergrenzen aus Arbeitszeitgesetz und "
      + "Bundesurlaubsgesetz — mehr ist möglich, weniger nicht.",
    einstellungen: {
      wochenstunden: 40,
      /* § 3 BUrlG: 24 Werktage bei Sechstagewoche, also 20 bei Fünftagewoche.
         Angegeben wird der übliche Bezug auf die Fünftagewoche. */
      urlaubsanspruch: 20,
      ruhezeit: 11,
      maxTagesstunden: 10,
      ausgleichWochen: 24,
      pausen: { ab6h: 30, ab9h: 45 },
      /* § 2 Abs. 3 ArbZG: Nachtzeit ist 23 bis 6 Uhr. */
      nachtVon: "23:00",
      nachtBis: "06:00",
      nachtschichtAbStunden: 2,
      zusatzurlaub: null,
    },
    zuschlaege: [
      /* Das Arbeitszeitgesetz kennt keinen Prozentsatz. § 6 Abs. 5 ArbZG
         verlangt „eine angemessene Zahl bezahlter freier Tage oder einen
         angemessenen Zuschlag" — die Höhe legt der Betrieb fest. */
      { name: "Nachtarbeit 23–6 Uhr", art: "nacht", prozent: 25, aktiv: true },
      { name: "Sonntagsarbeit", art: "sonntag", prozent: 0, aktiv: false },
      { name: "Feiertagsarbeit", art: "feiertag", prozent: 0, aktiv: false },
    ],
    hinweise: [
      "§ 6 Abs. 5 ArbZG verlangt für Nachtarbeit „eine angemessene Zahl bezahlter "
      + "freier Tage oder einen angemessenen Zuschlag\". Eine Prozentzahl steht nicht "
      + "im Gesetz; 25 Prozent sind ein verbreiteter Wert und kein Rechtssatz.",
      "Sonntags- und Feiertagszuschläge sind gesetzlich nicht vorgeschrieben. Sie "
      + "stehen hier ausgeschaltet in der Liste, damit sie sich einschalten lassen.",
      "20 Urlaubstage sind das Minimum bei Fünftagewoche (§ 3 BUrlG rechnet mit "
      + "24 Werktagen bei Sechstagewoche).",
    ],
  },
];

/** Eine Vorlage anhand ihrer Kennung. */
export const tarifwerk = (id) => TARIFWERKE.find((t) => t.id === id) || null;

/** Welche Vorlagen passen zu einer Branche? Der Rest folgt darunter. */
export function vorlagenFuer(branche) {
  const passend = TARIFWERKE.filter((t) => t.branchen.includes(branche));
  const rest = TARIFWERKE.filter((t) => !t.branchen.includes(branche));
  return [...passend, ...rest];
}

/**
 * Wendet eine Vorlage auf einen Betrieb an.
 *
 * Angefasst wird nur, was die Vorlage nennt. Alles andere — Dienstarten,
 * Personal, Einheiten, Fachkraftquote — bleibt unberührt: Eine Vorlage ist
 * eine Regelwerksänderung, kein neuer Betrieb.
 *
 * @returns {{ mandant: object, geaendert: Array<{feld, von, nach}> }}
 */
export function anwenden(m, id, heuteIso) {
  const t = tarifwerk(id);
  if (!t) return { mandant: m, geaendert: [] };

  const alt = m.einstellungen || {};
  const geaendert = [];
  /* wochenstunden und sollWochenstunden sind dieselbe Größe unter zwei
     Namen — beide werden gesetzt, sonst laufen sie auseinander. */
  const werte = { ...t.einstellungen, sollWochenstunden: t.einstellungen.wochenstunden };
  for (const [k, v] of Object.entries(werte)) {
    const vorher = alt[k];
    if (JSON.stringify(vorher) !== JSON.stringify(v))
      geaendert.push({ feld: k, von: vorher, nach: v });
  }
  const alteZ = (m.zuschlaege || []).filter((z) => z.aktiv).length;
  const neueZ = t.zuschlaege.filter((z) => z.aktiv).length;
  if (alteZ !== neueZ || (m.zuschlaege || []).length !== t.zuschlaege.length)
    geaendert.push({ feld: "zuschlaege", von: `${alteZ} aktiv`, nach: `${neueZ} aktiv` });

  return {
    mandant: {
      ...m,
      einstellungen: { ...alt, ...werte },
      zuschlaege: t.zuschlaege.map((z, i) => ({ ...z, id: `z${i + 1}` })),
      /* Woher die Werte kamen, bleibt am Betrieb stehen. Ohne diesen Vermerk
         weiß in zwei Jahren niemand mehr, ob 38,5 Stunden eine Vorlage oder
         eine bewusste Entscheidung waren. */
      tarifwerk: { id: t.id, name: t.name, stand: t.stand, quelle: t.quelle,
        angewendet: heuteIso },
    },
    geaendert,
  };
}

/** Lesbarer Name eines Einstellungsfeldes für die Vorschau. */
export const FELDNAME = {
  wochenstunden: "Wochenarbeitszeit",
  sollWochenstunden: "Vertragliche Wochenarbeitszeit",
  urlaubsanspruch: "Urlaubsanspruch in Tagen",
  ruhezeit: "Ruhezeit in Stunden",
  maxTagesstunden: "Höchstarbeitszeit je Tag",
  ausgleichWochen: "Ausgleichszeitraum in Wochen",
  pausen: "Pausenregel",
  nachtVon: "Nachtarbeit ab",
  nachtBis: "Nachtarbeit bis",
  nachtschichtAbStunden: "Nachtschicht ab Stunden Nachtarbeit",
  zusatzurlaub: "Zusatzurlaub für Schichtarbeit",
  zuschlaege: "Zuschlagsregeln",
};

/** Einen Wert für die Vorschau lesbar machen. */
export function wertText(v) {
  if (v === null || v === undefined) return "nicht gesetzt";
  if (typeof v === "object") {
    if (v.ab6h !== undefined) return `${v.ab6h} min ab 6 h, ${v.ab9h} min ab 9 h`;
    if (v.wechselschichtMonate !== undefined)
      return `1 Tag je ${v.wechselschichtMonate} Monate Wechselschicht, `
        + `1 Tag je ${v.schichtMonate} Monate Schicht`;
    return JSON.stringify(v);
  }
  return String(v);
}

/* --------------------------------------------------------------------------
   ZUSATZURLAUB

   § 27 TVöD und die entsprechende Regelung der AVR: Wer ständig
   Wechselschicht fährt, bekommt für je zwei zusammenhängende Monate einen
   Tag zusätzlich; bei ständiger Schichtarbeit für je vier.

   Gerechnet wird über die Monate, in denen jemand tatsächlich in Wechsel-
   oder Schichtarbeit stand — nicht über Kalendermonate.
   -------------------------------------------------------------------------- */

/**
 * Zusatzurlaubstage aus einer Zahl zusammenhängender Monate.
 *
 * @param monate      Zusammenhängende Monate in dem Schichtsystem
 * @param jeMonate    Nach wie vielen Monaten ein Tag entsteht
 */
export function zusatzurlaubstage(monate, jeMonate) {
  if (!jeMonate || jeMonate < 1 || !monate || monate < 1) return 0;
  return Math.floor(monate / jeMonate);
}

/**
 * Zusatzurlaub für eine Person, aus der Zahl der Monate mit Wechsel-
 * beziehungsweise Schichtarbeit.
 *
 * @returns {{ tage, art, monate }} — art ist "wechselschicht", "schicht" oder null
 */
export function zusatzurlaub(einstellungen, wechselMonate, schichtMonate) {
  const z = (einstellungen || {}).zusatzurlaub;
  if (!z) return { tage: 0, art: null, monate: 0 };
  /* Wechselschicht schlägt Schichtarbeit — beides nebeneinander gibt es
     nicht, und der günstigere Anspruch gilt. */
  if (wechselMonate >= (z.wechselschichtMonate || 2))
    return { tage: zusatzurlaubstage(wechselMonate, z.wechselschichtMonate),
      art: "wechselschicht", monate: wechselMonate };
  if (schichtMonate >= (z.schichtMonate || 4))
    return { tage: zusatzurlaubstage(schichtMonate, z.schichtMonate),
      art: "schicht", monate: schichtMonate };
  return { tage: 0, art: null, monate: Math.max(wechselMonate || 0, schichtMonate || 0) };
}
