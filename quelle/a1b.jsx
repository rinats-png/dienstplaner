
/* ==========================================================================
   SCHICHTMODELL-KATALOG
   Jede Vorlage ist rechnerisch geprüft: Deckung, Wochenarbeitszeit,
   Dienstserien, Nachtserien und Ruhezeiten. Die angegebenen Werte sind
   berechnet, nicht behauptet — der Katalog zeigt sie offen an, damit die
   Planung eine begründete Wahl treffen kann.

   Zwei Rotationsarten:
     Wochenversatz — jede Gruppe startet eine Woche später (klassisch)
     Tagesversatz  — jede Gruppe startet einen Tag später (Stufenmodell)
   ========================================================================== */

/** Dienstartvorlagen, aus denen die Modelle schöpfen. */
const DIENST_VORLAGEN = {
  F:   { name: "Frühdienst",     kurz: "F",  start: "06:00", ende: "14:00", farbe: "#1D4ED8" },
  S:   { name: "Spätdienst",     kurz: "S",  start: "14:00", ende: "22:00", farbe: "#B03A0A" },
  N:   { name: "Nachtdienst",    kurz: "N",  start: "22:00", ende: "06:00", farbe: "#7C3AED" },
  F9:  { name: "Frühdienst",     kurz: "F",  start: "06:00", ende: "15:45", farbe: "#1D4ED8" },
  S9:  { name: "Spätdienst",     kurz: "S",  start: "13:45", ende: "23:30", farbe: "#B03A0A" },
  N9:  { name: "Nachtdienst",    kurz: "N",  start: "21:30", ende: "07:15", farbe: "#7C3AED" },
  T12: { name: "Tagdienst",      kurz: "T",  start: "06:00", ende: "18:00", farbe: "#1D4ED8" },
  N12: { name: "Nachtdienst",    kurz: "N",  start: "18:00", ende: "06:00", farbe: "#7C3AED" },
  V24: { name: "24-Stunden-Dienst", kurz: "V", start: "07:00", ende: "07:00", farbe: "#2C6B63" },
  Z:   { name: "Zwischendienst", kurz: "Z",  start: "09:00", ende: "17:00", farbe: "#446F0D" },
};

/**
 * branchen: für welche Bereiche die Vorlage typisch ist
 * vollkonti: false bedeutet, dass am Wochenende planmäßig nicht gearbeitet wird —
 *            dort sind fehlende Dienste keine Lücke, sondern Absicht
 * kennzahlen: berechnet, nicht geschätzt
 */
const MODELLE = [
  {
    id: "zwei-woechentlich", name: "2-Schicht, wöchentlich wechselnd",
    kurz: "Früh und Spät im Wochenwechsel, Wochenende frei",
    beschreibung: "Der einfachste Fall: zwei Gruppen tauschen jede Woche zwischen Früh- und Spätdienst. Kein Nachtdienst, keine Wochenendarbeit.",
    branchen: ["produktion", "handel", "logistik", "gastronomie", "sonstiges"],
    gruppen: 2, versatzTage: 7, vollkonti: false, dienste: ["F", "S"],
    tage: ["F","F","F","F","F","-","-","S","S","S","S","S","-","-"],
    kennzahlen: { wochenstunden: 40, serie: 5, nachtserie: 0, besetzung: "1 Gruppe je Dienst" },
    passt: "Betriebszeit etwa 06 bis 22 Uhr, Montag bis Freitag.",
  },
  {
    id: "drei-teilkonti", name: "3-Schicht teilkontinuierlich",
    kurz: "Rund um die Uhr, aber nur werktags",
    beschreibung: "Drei Gruppen decken Früh, Spät und Nacht von Montag bis Freitag ab. Am Wochenende steht der Betrieb.",
    branchen: ["produktion", "logistik", "sonstiges"],
    gruppen: 3, versatzTage: 7, vollkonti: false, dienste: ["F", "S", "N"],
    tage: ["F","F","F","F","F","-","-","S","S","S","S","S","-","-","N","N","N","N","N","-","-"],
    kennzahlen: { wochenstunden: 40, serie: 5, nachtserie: 5, besetzung: "1 Gruppe je Dienst" },
    passt: "Durchgehende Fertigung werktags, Wochenende ruht.",
    hinweis: "Fünf Nachtdienste am Stück gelten arbeitswissenschaftlich als belastend. Drei bis vier sind empfohlen.",
  },
  {
    id: "vier-x-vier", name: "4x4 Vollkonti, klassisch",
    kurz: "Vier Gruppen, je vier Tage Früh, Spät, Nacht, frei",
    beschreibung: "Das verbreitetste Modell der Fertigungsindustrie. Vier Gruppen rotieren in Viererblöcken durch alle Dienste.",
    branchen: ["produktion", "logistik", "leitstelle", "sonstiges"],
    gruppen: 4, versatzTage: 4, vollkonti: true, dienste: ["F", "S", "N"],
    tage: ["F","F","F","F","S","S","S","S","N","N","N","N","-","-","-","-"],
    kennzahlen: { wochenstunden: 42, serie: 12, nachtserie: 4, besetzung: "1 Gruppe je Dienst" },
    passt: "Anlagen, die nicht stillstehen dürfen.",
    hinweis: "Zwölf Diensttage am Stück. Das ist die bekannte Schwäche dieses Modells — die entzerrte Fassung behebt sie bei gleicher Wochenarbeitszeit.",
  },
  {
    id: "vier-x-vier-entzerrt", name: "4x4 Vollkonti, entzerrt",
    kurz: "Wie 4x4, aber mit Freitag nach jedem Block",
    beschreibung: "Gleiche Deckung und gleiche Wochenarbeitszeit wie das klassische 4x4, aber nach jedem Viererblock folgt ein freier Tag. Höchstens vier Dienste am Stück.",
    branchen: ["produktion", "logistik", "leitstelle", "pflege", "klinik", "sicherheit", "sonstiges"],
    gruppen: 4, versatzTage: 4, vollkonti: true, dienste: ["F", "S", "N"],
    tage: ["F","F","F","F","-","S","S","S","S","-","N","N","N","N","-","-"],
    kennzahlen: { wochenstunden: 42, serie: 4, nachtserie: 4, besetzung: "1 Gruppe je Dienst" },
    passt: "Wie 4x4, wenn die Belastung durch lange Dienstserien vermieden werden soll.",
    empfohlen: true,
  },
  {
    id: "panama", name: "Panama, 2-2-3 mit 12-Stunden-Diensten",
    kurz: "Zwei an, zwei frei, drei an — jedes zweite Wochenende ganz frei",
    beschreibung: "Vier Gruppen, zwölfstündige Tag- und Nachtdienste. Zwei Gruppen sind täglich im Einsatz. Jede Gruppe hat jedes zweite Wochenende vollständig frei.",
    branchen: ["produktion", "sicherheit", "leitstelle", "rettung", "sonstiges"],
    gruppen: 4, versatzTage: 7, vollkonti: true, dienste: ["T12", "N12"],
    tage: ["T12","T12","-","-","T12","T12","T12","-","-","T12","T12","-","-","-",
           "N12","N12","-","-","N12","N12","N12","-","-","N12","N12","-","-","-"],
    kennzahlen: { wochenstunden: 42, serie: 3, nachtserie: 3, besetzung: "1 Gruppe je Dienst" },
    passt: "Wenn lange Freiblöcke wichtiger sind als kurze Dienste.",
    hinweis: "Zwölfstündige Dienste sind nach dem Arbeitszeitgesetz nur zulässig, wenn im Schnitt über sechs Monate acht Stunden je Werktag nicht überschritten werden oder erhebliche Bereitschaftsanteile vorliegen.",
  },
  {
    id: "fuenf-schicht", name: "5-Schicht Vollkonti, 9,75 Stunden",
    kurz: "Fünf Gruppen, keine Einzeldienste, viele freie Wochenenden",
    beschreibung: "Fünf Gruppen mit leicht verlängerten Diensten. Höchstens vier Dienste und vier Nächte am Stück, keine isolierten Diensttage.",
    branchen: ["sicherheit", "behoerde", "leitstelle", "klinik", "rettung", "sonstiges"],
    gruppen: 5, versatzTage: 7, vollkonti: true, dienste: ["F9", "S9", "N9"],
    tage: ["-","N9","N9","N9","N9","-","-","-","S9","S9","S9","-","N9","N9",
           "N9","-","-","-","S9","S9","S9","S9","-","-","F9","F9","-","-",
           "F9","F9","F9","-","-","F9","F9"],
    kennzahlen: { wochenstunden: 40.95, serie: 4, nachtserie: 4, besetzung: "1 Gruppe je Dienst" },
    passt: "41-Stunden-Woche im Vollkontibetrieb, etwa im öffentlichen Dienst.",
    empfohlen: true,
  },
  {
    id: "stufe-8", name: "Stufenmodell F F S S N N frei frei",
    kurz: "Acht Gruppen im Tagesversatz, immer zwei je Dienst",
    beschreibung: "Jede Gruppe startet einen Tag später als die vorherige. Dadurch sind an jedem Tag genau zwei Gruppen je Dienstart im Einsatz — die Besetzung ist besonders gleichmäßig.",
    branchen: ["pflege", "klinik", "rettung", "leitstelle", "sonstiges"],
    gruppen: 8, versatzTage: 1, vollkonti: true, dienste: ["F", "S", "N"],
    tage: ["F","F","S","S","N","N","-","-"],
    kennzahlen: { wochenstunden: 42, serie: 6, nachtserie: 2, besetzung: "2 Gruppen je Dienst" },
    passt: "Größere Stationen und Wachen mit mehr als 30 Personen.",
    empfohlen: true,
  },
  {
    id: "stufe-11", name: "Stufenmodell drei Tage je Dienst",
    kurz: "Elf Gruppen im Tagesversatz, immer drei je Dienst",
    beschreibung: "Wie das achtstufige Modell, aber mit drei Tagen je Dienstart und drei Gruppen gleichzeitig je Dienst.",
    branchen: ["klinik", "pflege", "leitstelle", "sonstiges"],
    gruppen: 11, versatzTage: 1, vollkonti: true, dienste: ["F", "S", "N"],
    tage: ["F","F","F","S","S","S","N","N","N","-","-"],
    kennzahlen: { wochenstunden: 45.8, serie: 9, nachtserie: 3, besetzung: "3 Gruppen je Dienst" },
    passt: "Große Einheiten mit hohem Grundbedarf.",
    hinweis: "45,8 Wochenstunden liegen über jedem üblichen Vertrag. Ohne Teilzeitanteile oder zusätzliche Freischichten ist das Modell so nicht einsetzbar.",
  },
  {
    id: "24-72", name: "24-Stunden-Dienst mit 72 Stunden frei",
    kurz: "Ein voller Tag Dienst, drei Tage frei",
    beschreibung: "Vier Gruppen im Tagesversatz. Klassisch bei Feuerwehr und Rettungsdienst, wo erhebliche Teile Bereitschaft sind.",
    branchen: ["rettung", "sicherheit", "behoerde", "sonstiges"],
    gruppen: 4, versatzTage: 1, vollkonti: true, dienste: ["V24"],
    tage: ["V24","-","-","-"],
    kennzahlen: { wochenstunden: 42, serie: 1, nachtserie: 0, besetzung: "1 Gruppe je Dienst" },
    passt: "Wachdienste mit hohem Bereitschaftsanteil.",
    hinweis: "24-Stunden-Dienste setzen eine Regelung nach § 7 Arbeitszeitgesetz voraus und sind nur bei erheblichem Bereitschaftsanteil zulässig.",
  },
];

const modellFuerBranche = (b) => MODELLE.filter((m) => m.branchen.includes(b));

/** Rechnet ein Modell durch — dieselbe Prüfung wie im laufenden Betrieb. */
function modellPruefen(modell) {
  const len = modell.tage.length;
  const dv = modell.dienste.map((d) => DIENST_VORLAGEN[d]);
  const nach = (k) => {
    const v = DIENST_VORLAGEN[k]; if (!v) return 0;
    const s = toMin(v.start); let e = toMin(v.ende); if (e <= s) e += 1440;
    let sum = 0; for (const [a, b] of [[0, 360], [1380, 1800]]) sum += Math.max(0, Math.min(e, b) - Math.max(s, a));
    return sum / 60;
  };
  const dau = (k) => { const v = DIENST_VORLAGEN[k]; if (!v) return 0;
    let d = toMin(v.ende) - toMin(v.start); if (d <= 0) d += 1440; return d / 60; };

  const luecken = {}; for (const d of modell.dienste) luecken[d] = 0;
  const proTag = [];
  for (let i = 0; i < len; i++) {
    const z = {};
    for (let g = 0; g < modell.gruppen; g++) {
      const idx = (((i - g * modell.versatzTage) % len) + len) % len;
      const t = modell.tage[idx]; if (t && t !== "-") z[t] = (z[t] || 0) + 1;
    }
    proTag.push(z);
    if (!modell.vollkonti && i % 7 >= 5) continue;   // Wochenende ist hier Absicht
    for (const d of modell.dienste) if (!z[d]) luecken[d]++;
  }
  let std = 0, dienste = 0;
  for (const t of modell.tage) if (t && t !== "-") { std += dau(t); dienste++; }
  let maxSerie = 0, serie = 0, maxNacht = 0, nserie = 0, ruhe = 0, einzel = 0;
  for (let i = 0; i < len; i++) {
    const c = modell.tage[i], nx = modell.tage[(i + 1) % len], pv = modell.tage[(i - 1 + len) % len];
    if (c && c !== "-") {
      serie++; maxSerie = Math.max(maxSerie, serie);
      if (nach(c) >= 2) { nserie++; maxNacht = Math.max(maxNacht, nserie); } else nserie = 0;
      if ((!pv || pv === "-") && (!nx || nx === "-")) einzel++;
      if (nx && nx !== "-" && DIENST_VORLAGEN[c] && DIENST_VORLAGEN[nx]) {
        let e = toMin(DIENST_VORLAGEN[c].ende); if (e <= toMin(DIENST_VORLAGEN[c].start)) e += 1440;
        if ((1440 + toMin(DIENST_VORLAGEN[nx].start) - e) / 60 < 11) ruhe++;
      }
    } else { serie = 0; nserie = 0; }
  }
  const mind = {};
  for (const d of modell.dienste) {
    const werte = proTag.map((z, i) => (!modell.vollkonti && i % 7 >= 5) ? null : (z[d] || 0)).filter((x) => x !== null);
    mind[d] = werte.length ? Math.min(...werte) : 0;
  }
  return { len, wochenstunden: Math.round(std / (len / 7) * 100) / 100, dienste,
    luecken: Object.values(luecken).reduce((a, b) => a + b, 0),
    maxSerie, maxNacht, ruhe, einzel, mind, proTag };
}
