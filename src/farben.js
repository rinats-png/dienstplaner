/* ==========================================================================
   FARBEN — die eine Quelle

   Diese Palette stand dreifach im Quelltext: als C in App.jsx, noch einmal
   als C in pruefung.jsx und als gekürztes F in main.jsx. Eine Farbänderung
   musste an drei Stellen nachgezogen werden, und beim Umbau auf den
   helleren Grund fiel sofort auf, dass die Anmeldeseite den alten Ton
   behalten hatte.

   Jetzt gibt es eine Datei. Wer C verändert — themaSetzen tut das beim
   Umschalten auf Dunkel — verändert sie für alle Teile zugleich, weil alle
   dasselbe Objekt vor sich haben.
   ========================================================================== */

const C = {
  /* ------------------------------------------------------------------
     Sea Salt als Grundfläche, dazu die Farben aus derselben Sammlung.

     Zwei Dinge mussten angepasst werden, sonst wäre es unlesbar:

     Erstens trägt keine der bunten Farben als Text. Traditional Turquoise
     erreicht auf Sea Salt 2,48:1, Orange Grove 1,97:1 — nötig sind 4,5:1.
     Für Text und Flächen gelten deshalb abgedunkelte Varianten desselben
     Farbtons; die Originale leben als Zierde und Hover weiter, wo keine
     Schrift darauf steht.

     Zweitens ist Sea Salt selbst nicht weiß. Eine weiße Karte hebt sich
     davon nur mit 1,3:1 ab — das reicht nicht als alleiniges Mittel.
     Karten brauchen hier einen sichtbaren Rand.
     ------------------------------------------------------------------ */
  /* Der Grund war Sea Salt in voller Sättigung (#D9E4E8). Eine weiße Karte
     hob sich davon nur mit 1,3:1 ab — die Folge war, dass jedes Element
     einen Rand brauchte und dadurch gleich laut wurde.

     Jetzt liegt der Inhalt auf Papier, und der Ton ist auf einen Hauch
     zurückgenommen. Die Hierarchie kommt aus der dunklen Seitenleiste und
     aus der Typografie, nicht mehr aus Rändern um jedes Kästchen. Sea Salt
     lebt in flaecheStill und in den Zwischenflächen weiter. */
  bg: "#EDF2F4",
  flaeche: "#FFFFFF",
  flaecheStill: "#E1EAEE",    // zwischen Grund und Karte — jetzt deutlicher
  sidebar: "#071317",         // Midnight Edition
  sidebarTief: "#001619",     // Blue Charcoal

  text: "#071317",            // 14,55:1
  dim: "#3D4E55", dimmer: "#3D4E55", aus: "#5B6B72",

  line: "#BCCDD4", lineSoft: "#CBDAE0", lineStark: "#9DB3BC",

  /* Akzent: Traditional Turquoise, abgedunkelt bis es trägt */
  accent: "#017070",          // 4,56:1 · weißer Text darauf 5,91:1
  /* Traditional Turquoise erreicht auf Sea Salt nur 2,48:1 — zu wenig selbst
     für Zierde (3:1). Der Hover-Ton ist deshalb eine Spur dunkler. Das
     Original lebt auf der Seitenleiste weiter, wo es 5,87:1 erreicht. */
  accentHi: "#028E8E",        // 3,08:1 auf Grund
  accentOrig: "#02A0A0",      // Traditional Turquoise — nur auf Dunkel
  accentDeep: "#023441",      // Natural Indigo
  accentLight: "#DFF0F0",
  accentGlanz: "#50E8F4",     // Fluorescent Blue — Glanzlicht auf Dunkel

  ok: "#0E6B45",              // 5,05:1 — Grün fehlt in der Vorlage, abgeleitet
  warn: "#955410",            // Orange Grove, abgedunkelt · 4,56:1
  danger: "#4E0401",          // Dark Maroon · 12,08:1
  violet: "#316C81",          // Vintage Aqua, abgedunkelt · 4,51:1

  okLight: "#DFEFE7", warnLight: "#FFE0C0", dangerLight: "#F6DEDC",
};

/* --------------------------------------------------------------------------
   DUNKELMODUS
   Wer um drei Uhr nachts auf den Plan schaut, wird von einer hellen Fläche
   geblendet. Das ist kein Luxus, sondern der häufigste Fall im Schichtdienst.

   Die Palette ist keine Umkehrung der hellen — Farben verhalten sich auf
   Dunkel anders. Gesättigte Töne wirken greller, deshalb sind Akzent und
   Statusfarben aufgehellt und leicht entsättigt. Alle Textfarben tragen
   mindestens 4,9:1, die meisten deutlich mehr.
   -------------------------------------------------------------------------- */
const C_DUNKEL = {
  bg: "#0B1418", flaeche: "#121E23", flaecheStill: "#18262C",
  sidebar: "#070F12", sidebarTief: "#040A0C",

  text: "#E8EFF1",            // 16,01:1
  dim: "#9FB2B9", dimmer: "#9FB2B9", aus: "#7A8D95",

  line: "#243238", lineSoft: "#1B282E", lineStark: "#33454C",

  accent: "#3FBFBF",          // 8,35:1 — heller als im Hellmodus, sonst zu schwach
  accentHi: "#5FD6D6", accentOrig: "#5FD6D6",
  accentDeep: "#7FE0E0", accentGlanz: "#50E8F4",
  accentLight: "#13292C",     // gedämpfte Fläche statt heller

  ok: "#4ADE9B", warn: "#F0B060", danger: "#F87A70", violet: "#7FC4DC",
  okLight: "#0F2620", warnLight: "#2A2013", dangerLight: "#2A1614",
};

/* Umschalten ohne Umbau: Statt tausend Verwendungsstellen zu ändern, werden
   die Werte in C ausgetauscht. Wer C.text liest, bekommt danach den dunklen
   Wert — die Anwendung merkt davon nichts. Ein Zähler in der Oberfläche
   erzwingt den Neuaufbau. */
const C_HELL = { ...C };

export { C, C_DUNKEL, C_HELL };

/* Die Palette als CSS-Variablen. Sie erreichen Stellen, an die ein
   JavaScript-Objekt nicht kommt: Bildlaufleisten, Auswahlfelder und die
   Datumsauswahl des Browsers. */
export const alsVariablen = (palette) => Object.entries(palette)
  .map(([k, v]) => `--c-${k.replace(/[A-Z]/g, (x) => `-${x.toLowerCase()}`)}:${v};`)
  .join("");
