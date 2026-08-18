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
     Zweiter Anlauf nach einer ausführlichen Farbprüfung (32 Entwürfe
     verglichen, dann auf ausdrücklichen Wunsch verworfen und durch
     diesen ersetzt — „Option 45"): Fog als blasses Salbeigrün trägt
     nur noch die Bildmarke, nicht mehr Text oder Flächen. Die
     Seitenleiste ist Covert Black, ein fast farbloses Nahezu-Schwarz.
     Einziger Akzent im ganzen System: ein gedecktes Tannengrün, das
     sonst nirgends vorkommt — dadurch bleibt „diese Farbe = eine
     Handlung" immer eindeutig.

     Zwei Dinge mussten wie beim Vorgänger-Schema angepasst werden:

     Erstens trägt das rohe Tannengrün als Fläche zwar problemlos Text
     (9,14:1 auf dem Grund), Fog dagegen nicht — als Fläche oder Text
     bliebe es zu blass (1,46:1 auf dem Grund). Fog lebt deshalb nur an
     einer Stelle in echter Stärke: der Bildmarke vor „CENTRIC", die
     keine eigene Textfarbe sein muss.

     Zweitens ist der neue, fog-getönte Grund fast weiß. Eine weiße
     Karte hebt sich davon nur mit 1,07:1 ab — das reicht nicht als
     alleiniges Mittel. Karten brauchen weiterhin einen sichtbaren Rand.
     ------------------------------------------------------------------ */
  bg: "#F7F8F6",               // Fog, stark aufgehellt
  flaeche: "#FFFFFF",
  flaecheStill: "#F1F3EE",    // zwischen Grund und Karte
  sidebar: "#16171C",         // Covert Black
  sidebarTief: "#001619",     // Blue Charcoal

  text: "#16171C",            // 16,80:1
  dim: "#4C4D52", dimmer: "#4C4D52", aus: "#6B6C70",

  line: "#CDD4C9", lineSoft: "#DEE3D9", lineStark: "#AFB8A9",

  /* Akzent: ein gedecktes Tannengrün, im ganzen System sonst nirgends
     verwendet — trägt bereits ungedimmt als Text und als Fläche. */
  accent: "#2F4A38",           // 9,14:1 · weißer Text darauf 9,73:1
  accentHi: "#3E6350",         // 6,35:1 auf Grund — Hover, eine Spur heller
  /* Der Grund ist fast weiß, nicht weiß. Fog selbst trägt darauf nicht
     (1,46:1) — es gehört auf die Seitenleiste, und nur dorthin, wo es
     11,52:1 erreicht. */
  accentOrig: "#C9D2C6",       // Fog, unverdünnt — nur auf Dunkel
  accentDeep: "#1E3226",       // 12,81:1 auf Grund, 13,64:1 mit weißem Text
  accentLight: "#DCE5DD",
  accentGlanz: "#C9D2C6",      // Fog — Glanzlicht auf Dunkel, 11,52:1

  /* Nur für die Bildmarke: das rohe, unverdünnte Fog. Trägt keinen Text,
     muss also nicht die 4,5:1-Schwelle erreichen — nur gegen die dunkle
     Seitenleiste sichtbar sein (11,52:1). */
  marke: "#C9D2C6",

  ok: "#146C46",               // 6,04:1
  warn: "#9A4200",             // 6,25:1
  danger: "#7A2320",           // 9,44:1
  violet: "#316C81",           // unverändert — eigenständige Kennzahlfarbe, kein Akzent

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
  sidebar: "#0C0D10", sidebarTief: "#050506",

  text: "#E8EFF1",            // 16,01:1
  dim: "#9FB2B9", dimmer: "#9FB2B9", aus: "#7A8D95",

  line: "#243238", lineSoft: "#1B282E", lineStark: "#33454C",

  accent: "#6FBF98",           // 8,50:1 — heller als im Hellmodus, sonst zu schwach
  accentHi: "#8FD4B2", accentOrig: "#B9D4C1",
  accentDeep: "#A6E6C4", accentGlanz: "#C9D2C6",   // Fog trägt unverändert auf Dunkel
  accentLight: "#12261C",     // gedämpfte Fläche statt heller

  marke: "#C9D2C6",            // Fog — bleibt in beiden Erscheinungsbildern gleich

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
