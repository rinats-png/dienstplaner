# CENTRIC — Designkonzept „Leitstand-Stil"

Stand: 30. September 2026. Diese Datei beschreibt **nur das Design** (Farben, Verlauf, Ebenen, Typografie, Icons, Bausteine, Rahmen, Ansichten, Zustände, Datenehrlichkeit). Projektplan, Phasen und Prüfungen stehen im `MASTER-PROMPT.md`, die maschinenlesbaren Werte in `design-tokens.json`, die Bilder in `bilder/`, die Maße je Artboard in `LAYOUT.md`.

Grundsatz: Die Farbwelt aus `src/farben.js` bleibt. Funktionen, Rechenkerne, Rechte und Inhalte bleiben. Was der Code heute zeigt, geht nicht verloren; wo ein Entwurf weniger zeigt, gilt der Code.

## Designsystem

### D.1 Farben (nur Werte aus `farben.js`)

**Bestehende Tokens bleiben unverändert** (hell / dunkel):

| Token | Hell | Dunkel | Verwendung |
|---|---|---|---|
| `bg` | #D9E4E8 | #0B1418 | Seitengrund (Ebene 0) |
| `flaeche` | #FFFFFF | #121E23 | Karte (Ebene 2) |
| `flaecheStill` | #E7EEF1 | #18262C | Einsatzflächen, Tabellenkopf, Hinweiskasten |
| `sidebar` / `sidebarTief` | #071317 / #001619 | #070F12 / #040A0C | nur noch Drawer + Bildmarke |
| `text` | #071317 | #E8EFF1 | Fließtext, Zahlen |
| `dim` | #3D4E55 | #9FB2B9 | Untertitel, Beschriftungen |
| `aus` | #5B6B72 | #7A8D95 | Nebentext **nur auf Karten**, nie auf dem Verlauf |
| `line` / `lineSoft` / `lineStark` | #BCCDD4 / #CBDAE0 / #9DB3BC | #243238 / #1B282E / #33454C | Ränder |
| `accent` | #017070 | #3FBFBF | Primäraktion, aktive Navigation |
| `accentHi` | #028E8E | #5FD6D6 | Hover |
| `accentLight` | #DFF0F0 | #13292C | aktive Fläche, Pillen-Ton |
| `accentDeep` | #023441 | #7FE0E0 | Avatar-Grund, Überschrift-Akzent |
| `accentGlanz` | #50E8F4 | #50E8F4 | Glanz auf Dunkel (Toast-Aktion) |
| `marke` | #02A0A0 | #02A0A0 | mittlerer Balken der Bildmarke |
| `ok` / `warn` / `danger` / `violet` | #0E6B45 / #955410 / #4E0401 / #316C81 | #4ADE9B / #F0B060 / #F87A70 / #7FC4DC | Status |
| `okLight` / `warnLight` / `dangerLight` | #DFEFE7 / #FFE0C0 / #F6DEDC | #0F2620 / #2A2013 / #2A1614 | Status-Fläche |

**Neu hinzuzufügen** (in `C`, `C_HELL` und `C_DUNKEL`; werden automatisch zu CSS-Variablen):

| Neues Token | Hell | Dunkel | Zweck |
|---|---|---|---|
| `verlaufA` | `rgba(2,160,160,.34)` | `rgba(63,191,191,.22)` | Hauptfleck |
| `verlaufB` | `rgba(80,232,244,.16)` | `rgba(80,232,244,.10)` | Glanz im Fleck |
| `verlaufC` | `rgba(2,52,65,.14)` | `rgba(127,224,224,.10)` | Tiefe rechts |
| `kopfGrund` | `rgba(255,255,255,.86)` | `rgba(18,30,35,.86)` | Kopfzeile (ersetzt hartes Weiß) |
| `ueberlagerung` | `rgba(7,19,23,.36)` | `rgba(0,0,0,.56)` | Rücken hinter Blättern (ersetzt `rgba(17,24,39,…)`) |
| *(vorhanden)* `steuer` | `#6E858E` | `#5C7681` | Rand/Kontur von Bedienelementen und Aus-Zustand (Kreise, Checkboxen, Schalter); ≥ 3:1 nach WCAG 1.4.11. **Ersetzt den früher vorgeschlagenen Ton `randStark`.** |
| *(vorhanden)* `aufAkzent` | `#FFFFFF` | `#071317` | Schrift auf gefüllter Akzentfläche (dunkel 8,45:1). **Ersetzt die früher vorgeschlagene Knopfschrift `#06181A`.** |

**Dienstarten-Farben** stammen aus den Daten (`#017070` Früh, `#316C81` Spät, `#023441` Nacht, `#4C4668` Bereitschaft, `#955410` Rufbereitschaft, `#2E6B4F` Urlaub, `#B3261E` Krank, `#35506B` Schulung, `#0369A1` Ausgleich, `#8A5A00` Sonstiges, `#878C93` Freistellung). Sie bleiben Daten; **Darstellung immer per `TON()`** (Tönung + 2,5 px Akzentlinie, Kürzel als Text). Weiße Schrift auf voller Dienstfarbe nur für: Akzent 5,91:1, `#316C81` 5,85:1, `#023441` 13,37:1, `#955410` 5,91:1, `#2E6B4F` 6,30:1, `#B3261E` 6,54:1, `#4C4668` 8,81:1, `#0369A1` 5,93:1, `#35506B` 8,36:1, `#8A5A00` 5,93:1 — **nicht** auf `#878C93` (3,39:1).

**Avatar-Töne** (ersetzen `AV_TOENE`): acht Paare aus der Palette, Fläche = Tint, Text = Volltönung, jedes ≥ 4,5:1:
`accent/accentLight`, `violet/#E4EDF1`, `accentDeep/#DFF0F0`, `warn/warnLight`, `ok/okLight`, `#35506B/#E4E9F1`, `#4C4668/#ECEAF3`, `#2E6B4F/#DFEFE7`. (Vor Übernahme mit dem Kontrastskript aus Teil L prüfen.)

### D.2 Ebenen (Elevation) und z-Ordnung

| Ebene | Was | Fläche | Rand | Schatten (hell) | Schatten (dunkel) |
|---|---|---|---|---|---|
| E0 | Seitengrund | `bg` + Verlaufsschicht | — | — | — |
| E1 | eingelassene Gruppen, Tabellenkopf, Hinweiskasten | `flaecheStill` | 1 px `lineSoft` (optional) | — | — |
| E2 | Karte | `flaeche` | 1 px `line` | `0 1px 2px rgba(7,19,23,.04), 0 8px 22px rgba(7,19,23,.05)` | `0 1px 2px rgba(0,0,0,.30)` (Rand trägt) |
| E3 | Karte im Hover / gewählt | wie E2 | `lineStark` | `--schatten-hoch` (besteht) | wie E2, Rand `lineStark` |
| E4 | Kopfzeile, Unterleiste (sticky) | `kopfGrund` + `backdrop-filter: saturate(160%) blur(12px)` | unten 1 px `line` | — | — |
| E5 | Blatt, Menü, Drawer | `flaeche` | 1 px `line` | `0 20px 48px rgba(7,19,23,.18)` | `0 20px 48px rgba(0,0,0,.5)` |
| E6 | Toast, Hinweis | `text` (hell) / `flaeche` (dunkel) | — | `0 12px 32px rgba(7,19,23,.28)` | `0 12px 32px rgba(0,0,0,.5)` |

**z-index** (bestehende Werte bleiben): Verlaufsschicht `0`, Inhalt `1`, Unterleiste `29`, Kopfzeile `30`, Drawer `40`, Sheet-Rücken `90`, Toast `95`, Sprungmarke `100`. Der Verlauf hat `pointer-events:none`.

### D.3 Farbverlauf — exakte Vorgabe

**Ort:** eine einzige Schicht hinter der Kopfzone jeder Ansicht, nicht pro Karte. Umsetzung als Pseudo-Element an `.inhalt` (kein neues DOM):

```css
.inhalt{ position:relative; isolation:isolate; }
.inhalt::before{
  content:""; position:absolute; left:0; right:0; top:0; height:440px; z-index:-1;
  pointer-events:none;
  background:
    radial-gradient(ellipse 46% 60% at 46% 0%,  var(--c-verlauf-a), var(--c-verlauf-b) 48%, transparent 76%),
    radial-gradient(ellipse 28% 44% at 82% 14%, var(--c-verlauf-c), transparent 74%);
}
.feldmodus .inhalt::before, .kein-verlauf .inhalt::before{ display:none; }
@media print{ .inhalt::before{ display:none; } }
```
(Die CSS-Variablen heißen so, wie `alsVariablen` die Schlüssel umbenennt: `verlaufA` → `--c-verlauf-a`. Beim Umsetzen gegenprüfen.)

**Regeln:**
1. **Kein `filter: blur`** (in den Entwürfen nur zur Vorschau). Radialverläufe sind ohne Weichzeichner weich genug und auf schwachen Tablets billig.
2. **Bewegt sich nicht.** Keine Animation, kein Parallax.
3. **Nur `text` und `dim` liegen auf dem Verlauf** (Titel, Untertitel, Rubrik, Aktionsknöpfe). **Nie `aus`, nie `aus`-graue Kleintexte.** Begründung (gerechnet, Grund #E7EEF1, Teal-Deckkraft a):
   | a | Text 071317 | dim 3D4E55 | aus 5B6B72 |
   |---|---|---|---|
   | 0,00 | 16,06 | 7,40 | 4,72 |
   | 0,30 | 11,86 | 5,46 | **3,49** |
   | 0,34 | 11,38 | 5,24 | **3,35** |
   | 0,40 | 10,70 | 4,93 | **3,15** |
   | 0,50 | 9,65 | **4,45** | **2,84** |
   Mit Glanzschicht (0,34 + Cyan 0,16): dim 5,31. **Obergrenze hell: Teal ≤ 0,40, dim bleibt ≥ 4,9.** Die Entwürfe (0,34–0,50 Mitte) sind teils darüber — deshalb 0,34 im Token.
   Dunkel (Grund #0B1418, dim #9FB2B9): a=0,24 → 5,36; a=0,30 → 4,65; `aus` scheitert schon bei 0,12 (4,43). **Obergrenze dunkel: 0,24; Token 0,22.**
4. **Das Kontrastskript (im MASTER-PROMPT.md, Teil L) rechnet die Überlagerung am ungünstigsten Punkt** und lässt den Build der Prüfung scheitern, wenn `text`/`dim` unter 4,5:1 fallen oder jemand einen Token über die Grenze schiebt.
5. Auf Ansichten mit Vollflächen-Tabellen (Monatsplan, Jahresansicht, Personaleinsatz) reicht der Verlauf nur hinter Titelzone und Werkzeugleiste — die Karte mit der Tabelle ist deckend.

### D.4 Typografie
Inter (lokal, variabel 100–900). Ziffern immer tabellarisch (`NUM`).

| Rolle | Größe / Gewicht / Laufweite | Anmerkung |
|---|---|---|
| Titel (`h1.titel`) | 38 / 300 / −0,045 em, Zeilenhöhe 1,08 | Gewicht 300 nur ab 27 px; Fettanteil `<b>` 680 bleibt möglich |
| Titel mobil (`MTitel`) | 27 / 300 / −0,035 em | |
| Untertitel | 15,5 / 400, `dim`, max. 680 px | auf dem Verlauf: nur `dim` |
| Abschnittstitel | 19 / 640 / −0,02 em | |
| Kartentitel | 14 bis 15,5 / 600–620 | |
| Kennzahl | 30–32 / 500–650 / −0,03 em, tabellarisch | Einheit 14 / 500 `aus` |
| Fließtext | `var(--schrift)` (14,5 / kompakt 13,5) | Feldmodus 16 |
| Tabellenkopf | 11,5 / 600 / +0,04 em, Versalien | |
| Rubrik | 11 / 700 / +0,10 em, Versalien | |
| Pille | 11 bis 12 / 600 | |
| Kleintext | 11 bis 12 / 400–500 | nie unter 11 |

### D.5 Form, Abstand, Größen

| Wert | Neu | Bisher |
|---|---|---|
| `--r` (Eingaben, kleine Elemente) | 12 px | 12 |
| `--r-gross` (Karten) | **18 px** | 16 |
| `--r-pille` | 999 px | — |
| `.btn` | **Pille (999)**, Höhe 40, klein 34, Padding 0 18 | Radius 10, Padding 10/18 |
| `.btn` mobil | Höhe 46 | — |
| Eingaben `.inp`/`.sel` | Radius 12, Höhe 40 (16 px Schrift ≤ 560 px, wie bisher) | ähnlich |
| Suchfeld | Pille | Radius 12 |
| Kopfzeile | Höhe **64** | 56 |
| Unterleiste | Höhe **48** | — |
| Bereichs-Pille | Höhe 40 | — |
| Rasterlücke Karten | 16 px | — |
| Inhaltsbreite | max. 1720 (bleibt) | 1720 |
| Tippflächen | ≥ 44 px auf Touch, ≥ 40 px am Rechner | uneinheitlich |

Umbrüche: 1280 (Dashboard 12→8 Spalten), **1024** (Kopfnavigation → Drawer, wie bisher), 900 (`.zweispaltig` stapelt, wie bisher), **820** (Wahl der Telefonschale, wie bisher), 560 (wie bisher).

Dichte: `--zeile` 48/36, `--pad-y`, `--pad-x`, `--luft`, `--block` bleiben. Neu: `.karte` innen `padding: var(--pad-y) var(--pad-x)` statt fest 16–24.

### D.6 Bewegung
Nur: Hover/Fokus 140–160 ms, Blatt einblenden 160 ms, Toast 200 ms (alles besteht). Keine Seitenübergänge, keine Verlaufsanimation, keine Zähl-Animationen. `prefers-reduced-motion` bleibt wie es ist.

### D.7 Icons — eigener Satz, Inline-SVG, keine Bibliothek

**Komponente** `Icon` (neue Datei `src/gestalt/icons.jsx`):
`<Icon n="kalender" size={18} />` → `<svg viewBox="0 0 24 24" width height fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">`. Farbe kommt aus `currentColor`. Reine Zierde ist `aria-hidden`; ein Icon-Knopf trägt `aria-label`.

**Gezeichnete Pfade** (24er Raster, so in den Entwürfen verwendet; Kreise als `circle`):
| Name | Pfad(e) | Einsatz |
|---|---|---|
| `raster` | 4× `rect` x3/13.5 y3/13.5 w7.5 h7.5 rx1.6 | Bereich Im Dienst / Start |
| `kalender` | `rect x3 y5 w18 h16 rx2.4` · `M8 3v4M16 3v4M3 10.5h18` | Bereich Planen |
| `pruefliste` | `M9 4.5h6v2.6H9z` · `M7.5 5.8H5.2v15.1h13.6V5.8H16.5` · `m9.2 13.4 2.1 2.1 4.2-4.3` | Bereich Zu entscheiden |
| `personen` | `circle 9.2 8.4 r3.3` · `M3.2 19.8c0-3.3 2.7-5.2 6-5.2s6 1.9 6 5.2` · `M16.2 6.4a3.2 3.2 0 0 1 0 7.5` · `M17.8 15.6c2 .7 3.2 2.1 3.2 4.2` | Bereich Wer mitfährt |
| `saeulen` | `M3 20.5h18` · `M6 20V11M11 20V4.5M16 20v-6.5M20.5 20v-10` | Bereich Nachsehen |
| `zahnrad` | `circle 12 12 r3.2` · `M12 2.6v2.3M12 19.1v2.3M21.4 12h-2.3M4.9 12H2.6M18.6 5.4 17 7M7 17l-1.6 1.6M18.6 18.6 17 17M7 7 5.4 5.4` | Bereich Verwaltung |
| `suche` | `circle 11 11 r6.6` · `m16 16 4.6 4.6` | Suchen |
| `plus` | `M12 5.2v13.6M5.2 12h13.6` | Anlegen |
| `haken` | `m4.6 12.4 4.8 4.8L19.4 6.6` | Genehmigen, erledigt |
| `kreis-haken` | `circle 12 12 r8.6` · `m8.4 12.2 2.4 2.4 4.8-5` | Checkliste erledigt |
| `kreis-leer` | `circle 12 12 r8.6` (Kontur `steuer`) | Checkliste offen |
| `pfeil-rechts` | `M5 12h13M13 7l5 5-5 5` | „Öffnen" |
| `chevron-l/-r/-u/-o` | `m14.5 5.5-6.5 6.5 6.5 6.5` / `m9.5 5.5 6.5 6.5-6.5 6.5` / `m6 9.5 6 6 6-6` (unten) | Monat vor/zurück, Auswahl |
| `mehr` | drei `circle r1.6` (gefüllt) bei x5.5/12/18.5 | Kartenmenü |
| `warnung` | `M12 4.2 2.8 19.8h18.4z` · `M12 10.2v4M12 17.2v.4` | Verstoß, Hinweis |
| `info` | `circle 12 12 r8.8` · `M12 11.2v5.4M12 7.8v.4` | Erklärkasten |
| `schloss` | `rect x4.5 y10.5 w15 h9.5 rx2` · `M8 10.5V8a4 4 0 0 1 8 0v2.5` | Datenschutz, festgeschrieben |
| `laden` | `M12 4v11M7.5 10.5 12 15l4.5-4.5M4.5 19.5h15` | Export |
| `stift` | `M5 20.2h14` · `M14.2 4.4 18 8.2 8.6 17.6H4.8v-3.8z` | Bearbeiten |
| `tausch` | `M4 8.4h13l-3.2-3.2M20 15.6H7l3.2 3.2` | Tauschbörse |
| `glocke` | `M6.2 9.4a5.8 5.8 0 0 1 11.6 0c0 4.8 1.9 5.9 1.9 5.9H4.3s1.9-1.1 1.9-5.9z` · `M10.1 19.2a2.1 2.1 0 0 0 3.8 0` | Mitteilungen |
| `sonne` | `circle 12 12 r4` · `M12 2.4v2.2M12 19.4v2.2M21.6 12h-2.2M4.6 12H2.4M18.8 5.2 17.2 6.8M6.8 17.2l-1.6 1.6M18.8 18.8l-1.6-1.6M6.8 6.8 5.2 5.2` | hell |
| `mond` | `M20.4 14.2A8.6 8.6 0 0 1 9.8 3.6a8.6 8.6 0 1 0 10.6 10.6z` | dunkel |
| `heute` | `circle 12 12 r8.4` + gefüllter `circle r3.2` | Tab „Heute" (mobil) |

**Noch zu zeichnen im selben Stil** (Raster 24, Strich 1,7, keine Füllung außer Punkten): `brief` (Postfach), `abmelden`, `menue`, `filter`, `uhr`, `person`, `griff` (Ziehen), `notruf` (Telefon mit Welle), `fahrzeug` (Lenkzeiten), `schluessel` (Betriebsmittel), `buch` (Handbuch), `rettungsring` (Hilfe), `schild` (Datenschutz), `nadel` (Schwarzes Brett), `stern`, `x` (Schließen). Ein Icon darf nie die einzige Information tragen.

**Kein Emoji, kein Textzeichen als Icon** in der fertigen Anwendung. Alle bisherigen Glyphen (`⌕ ✉︎ ☰ ⏻ ◉ ▤ ✎ ›`) werden ersetzt.

**Bildmarke:** `marke.jsx` und `Logo()` bleiben, wie sie sind. In der Kopfzeile die helle Fassung mit Wortmarke „CENTRIC" (16 px, 700, Laufweite +0,14 em).

---

## Bausteine

Alle neuen Bausteine in `src/gestalt/bausteine.jsx`; die CSS-Klassen in `bauStyles()` (oder in eine neue `src/gestalt/stil.js`, die `bauStyles()` zusammensetzt).

| Baustein | Änderung | Wichtig |
|---|---|---|
| `Card` / `.karte` | Radius 18, Schatten E2, Rand `line`; Variante `.karte-still` (E1) | Rand bleibt (1,3:1-Lehre). |
| `Btn` | Pille, Höhen laut D.5; `kind`: plain/primary/quiet/danger/ok bleiben | Primär: `accent`-Grund, Weiß 5,91:1; Schrift auf Akzent über das vorhandene Token `aufAkzent` (hell Weiß, dunkel #071317). |
| `Pille` | ohne Rand; Ton = Tönung (`okLight` …) + Volltönung | Tailwind-Ränder entfernen. Kontraste: ok 5,50, warn 4,69, danger 12,22, accent 5,03 — alle über 4,5. |
| `Seg` | bleibt Pillenreihe; aktiv: `accentLight`-Grund + `accent`-Rand (besteht) | `role="tablist"` beibehalten. Alternativ segmentiert (Kapsel, aktiv dunkel) nur für Zeitraum-Schalter; **eine** Form wählen (Empfehlung: bestehende). |
| `Kpi` | neu: Titel klein `aus`, Wert groß, optional `trend` (Pille), optional `bild` (Mikro-Diagramm), Fußzeile | Trend nur wenn Daten (Teil J). |
| `Sparkline` (neu) | SVG-`polyline` + Fläche `accentLight`, Endpunkt hervorgehoben; Säulen-Variante; Punktraster-Variante | Farbe nur `accent`/Status; Werte tabellarisch beschriftet für Leser (`<title>` oder `aria-label` mit Zusammenfassung). |
| `Bogen` (neu, Halbkreis) | SVG-Pfad, Segmente per `stroke-dasharray`; Farben `ok`/`warn`/`lineStark` (nicht Orange-Grün-Blau wie im Vorbild) | Für PpUGV-Erfüllung, PPP-RL. Zahl in der Mitte als Text. Segmentfarben tragen nie allein: Legende/Text daneben. |
| `Fortschritt` (neu) | Balken 6–8 px, `accent`/Status | für Einrichtung, Beteiligung, Auslastung |
| `Checkliste` (neu) | Zeile mit `kreis-haken` (ok) / `kreis-leer` (Kontur `steuer`) | Leer-Kreise in den Entwürfen nutzen #9DB3BC = 2,19:1 → fällt unter 3:1 für Bedienelement-Konturen. **`steuer` verwenden** (das hat der Remote-Stand bereits als Token; Schalter und Felder nutzen es dort schon). |
| `Avatar` | Töne aus D.1 | |
| `Planzelle` / `TON` | **unverändert**, nur Radius 9 → 8 und Mindesthöhe 44 auf Touch | Tönung + Linie bleibt. |
| `Leer` | Icon statt „◌", Text unverändert, Aktion als `Btn` | |
| `Sheet` / `MBlatt` | Rücken = `--c-ueberlagerung`, Blatt E5, Radius 18 / mobil oben 26 | |
| `Toast` | E6, Aktion `accentGlanz` (besteht) | |
| `Field` | unverändert (Label/Hinweis-Verknüpfung ist gut) | |
| `Filterleiste` | Suchfeld als Pille | |
| `H1` | unverändert, plus optional `verlauf` implizit (Schicht liegt am `.inhalt`) | |
| `Erklaerkasten` (neu) | E1-Fläche, `info`-Icon, Text `dim` | ersetzt die vielen einzeln gestylten Hinweisboxen |
| `Menue` / `Popover` (neu) | E5; für Avatar-Menü, „Ansicht"-Menü, Kartenmenü | Fokus-Falle, Escape schließt, Pfeiltasten |

---

## Rahmen und Navigation

### F.1 Dateien
Neu: `src/gestalt/icons.jsx`, `src/gestalt/bausteine.jsx`, `src/gestalt/rahmen.jsx` (Kopfzeile, Bereichsnavigation, Unterleiste, Menüs), `src/gestalt/stil.js` (CSS-Text). `App.jsx` importiert und ersetzt nur die Stelle ab `<div className="huelle">`.

### F.2 Desktop/Tablet ≥ 1025 px
```
┌ Kopfzeile 64 ─────────────────────────────────────────────────────────────┐
│ Marke  CENTRIC │ Betrieb  ⟨ Im Dienst · Planen · Zu entscheiden · Wer mit-  │
│                                 fährt · Nachsehen · Verwaltung ⟩   Suche ⌘K │
│                                                Rückgängig  Postfach  Ansicht│
│                                                                    Avatar   │
├ Unterleiste 48 ── Ansichten des aktiven Bereichs ─────────────────────────┤
│ Monatsplan  Personaleinsatz  Jahresansicht  Bereitschaft  Selbstplanung …  │
└────────────────────────────────────────────────────────────────────────────┘
```
- **Marke + Betriebsname** links: Bildmarke 26 px, „CENTRIC", dünner Trenner, `sitz.mandant.name` (Betreiber: „Betreiberkonsole"). Der Betriebsname stand bisher in der Seitenleiste und fehlt in den Entwürfen — bei Trägern mit mehreren Standorten wichtig.
- **Bereichs-Pillen:** sechs, **immer mit Beschriftung** (keine reinen Icons), Icon + Text, Höhe 40, aktiv `accentLight`-Grund + `accent`-Text, Zähler-Punkt/Zahl wenn Summe der `zaehler` seiner Ansichten > 0 (`zaehlerWarn` → `danger`-Tönung). Nur Bereiche zeigen, in denen der Nutzer mindestens eine Ansicht darf (wie `bereiche` heute).
- **Klick auf Bereich** öffnet die zuletzt besuchte Ansicht dieses Bereichs, sonst die erste erlaubte.
- **Unterleiste:** Ansichten des aktiven Bereichs, gefiltert nach Recht (dieselbe Filterung wie `bereiche`), Text-only, aktiv = 2 px Akzentunterstrich + Gewicht 620 (bewusst *anders* als die Bereichs-Pillen), Zähler-Pille rechts vom Label wie bisher. Überlauf: horizontal scrollen mit weichem Rand, aktives Element wird ins Sichtfeld gerückt. `<nav aria-label="Ansichten in {Bereich}">`, Knöpfe mit `aria-current="page"`.
- **Rechts:** Suchpille (öffnet die vorhandene Suche `setKmd(true)`, „Strg K"), Rückgängig (Icon-Knopf mit Tooltip, ruft `akt.zurueck`), Postfach (`glocke`/`brief`, Zahl `ungelesen`), **Ansicht-Menü** (Dichte Komfortabel/Kompakt, Fokus, Feldmodus, Erscheinungsbild Hell/Dunkel/Wie das Gerät — die Umschalter, die heute als vier Textknöpfe in der Kopfzeile stehen), **Avatar-Menü** (Name, Rolle `r.label`, Einstellungen, Abmelden — löst die Seitenleisten-Fußzeile ab).
- **Fokusmodus:** blendet Bereichsnavigation *und* Unterleiste aus, die schmale Fokus-Leiste („Fokusmodus — Navigation ausgeblendet · Fokus beenden") bleibt.
- **Betreiber:** hat heute eine flache Liste (`nav`). Darstellung: ein einziger Bereich „Betreiberkonsole" in den Pillen, die Liste als Unterleiste.
- **Telefonschale (Mitarbeiter):** nicht betroffen, siehe Teil H.

### F.3 ≤ 1024 px (Tablet hochkant, kleines Fenster)
Kopfzeile: Menüknopf (`menue`), Marke, Suche als Icon, Postfach, Avatar. **Bereichs-Pillen und Unterleiste entfallen; die bestehende Seitenleiste dient als Drawer** (`.seitenleiste.offen`, Code bleibt). Das ist bewusst: erprobte Logik wiederverwenden, kein Neubau. Nur die Glyphen dort gegen `Icon` tauschen.

### F.4 Sonstiges im Rahmen, das bleibt
Sprungmarke, `Testablauf`-Banner, `Offlineleiste`, `NichtGespeichert`, Hinweis „Für Tablet und Rechner ausgelegt", Dialogblock, `main#inhalt` mit `aria-label`.

---

## Ansichten (alle 43)

**Klassen der Umsetzung**
- **Ü — Übersicht:** Kennzahlkarten, Bogen, Verläufe, Listen. Vollständig im neuen Stil.
- **E — Entscheidung:** Liste links, Detail/Auswirkung rechts, klare Primäraktion.
- **A — Arbeitsebene:** dichte Tabellen/Raster. Nur Radien, Chips, Abstände, Kopfzeile; Zellen unverändert (`TON`, `Planzelle`, `table.raster`).
- **F — Formular/Text:** Karten mit `Field`s, Erklärkasten, Lesefläche.

**Die Tabelle gilt als Auftrag für jede Ansicht:** Klasse, Kernbausteine, Daten-Vorbehalte. „Entwurf" = Artboard in der Canvas.

| Bereich | ID · Ansicht | Kl. | Kernbausteine | Vorbehalt aus Code/Entwurf |
|---|---|---|---|---|
| Im Dienst | `start` Start | Ü | Kpi-Reihe (Besetzung heute, Offene Schichten, Anträge offen, Ruhezeit-Befunde), Bogen PpUGV, Einrichtungs-Checkliste, Dienstbuch-Ausschnitt | **Keine Prognosekarte.** Einrichtungs-Checkliste = bestehende `Testablauf`-Logik nutzen, nicht neu erfinden. |
| | `ablauf` Ablauf | F/E | Stationenliste mit Sprung in die Ansicht | Zustand „erledigt" heißt nur „hat einen Stand" (Code) — so beschriften. |
| | `handbuch` Handbuch | F | Suche, Themenliste links, Artikel rechts (`handbuch-inhalt.js`) | Kapitel je nach Paket ausblenden (Sicherheitsdienst nur, wenn geführt). |
| | `hilfe` Hilfe | F | Fragen, Kontakt | **Kein Suchfeld** (Code hat keins). Kontaktadresse ist Platzhalter → Warnhinweis. |
| | `uebergabe` Übergabe | F | Felder `lage` (Pflicht), `offen`, `vorkommnis`, `material`; Übergabe an; Prüfliste; letzte Übergabe | Recht `PAKET:uebergabe`. 24 Monate Aufbewahrung nur nennen, wenn `aufbewahrung.js` das belegt. |
| | `meine` Meine Schichten | A/E | Liste + Monat (Segment), Stundenkonto | **Kein Desktop-Entwurf** — als Mobil-Karte gedacht; für Desktop aus Mobil ableiten. |
| | `lage` Lagebild | Ü | drei Schichtkarten (Ist/Soll, Balken), „Jetzt im Dienst" nach Einheit, Achtungspunkte | Achtungspunkte nur aus echten Befunden. |
| | `zeitachse` Zeitachse | A | Stundenraster 0–24, Balken je Person, Köpfe je Stunde, Jetzt-Linie | Tagesbalken je Dienstart per `TON`. |
| Planen | `plan` Monatsplan | A | `table.raster`, Legende, Filter, Regelprüfungs-Leiste, Besetzung je Tag | Volle Dienstfarbe **nicht**; Tönung + Linie. Konfliktzelle: Ring `danger`. |
| | `einsatz` Personaleinsatz | A | Spalten je Einheit, Verfügbarkeitsspalte mit Eignungsreihenfolge | Sortierung (Eignung/Dienstalter/Gemischt) kommt aus Code. Gesperrt = harte Grenze (Ruhezeit, § 4 PflBG). |
| | `jahr` Jahresansicht | A | 12×31-Raster, Konten (Urlaub, Krank, Stunden, Wochenenden) | Beispielwerte im Entwurf; echte Konten aus Daten. |
| | `bereitschaft` Bereitschaft | A | Liste/Kalender, Abrufzeit | EuGH-Hinweis nur, wo im Code belegt (C-580/19). Dienstart „Rufbereitschaft Leitung" ist **Entwurfs-Beispiel**. |
| | `selbstplan` Selbstplanung | E/A | Vier-Stufen-Fortschritt (vorbereitet → läuft → geschlossen → übernommen), Wunsch-Deckung-Raster, Beteiligung, Nicht-eingetragen-Liste | Zustände genau wie `SELBST_ZUSTAND` im Code. |
| | `sonder` Sondereinsätze | A/E | Liste + Detail | Knopf „Zuteilung ändern" nur, wenn die Ansicht das im Code tut. |
| | `folge` Schichtfolge | A | Musterliste, Wochenraster, Regelkacheln, Zuweisung | Regelwerte aus `regelwerk.js`, nicht fest. |
| Zu entscheiden | `notrufe` Notrufe | E | Aktiver Notruf (`danger`-Rand 2 px), Empfängerkette, Verlauf, Kette, 7-Tage-Rückblick | Arten und Quittierzeit aus Code; Hinweis „ersetzt keine Rufanlage" beibehalten. |
| | `offene` Offene Schichten | E | Liste links, Vorschlagsreihenfolge rechts, Anfragen | Vergeben erst mit Zusage. Gesperrt-Zeilen ohne Übergehen-Knopf. |
| | `antraege` Anträge | E | Filter, Antragskarten mit Folgezeile, Detail rechts mit Besetzung im Zeitraum; Umschalter Einzelanträge/Jahresurlaubsrunde | Auswirkungsvorschau nur wenn berechenbar. |
| | `boerse` Tauschbörse | E | Angebote, Passung, Zustimmung beider Seiten | Leitungssicht zeigt im Code nur die eigenen Vorgänge — im Entwurf zeigt sie die der Einheit: **angleichen oder Code erweitern (entscheiden).** |
| | `wuensche` Wunschdienste | E/A | Kalender mit „Möchte arbeiten (+)" #2E6B4F / „Lieber nicht (−)" #8A5A00 | **Keine Fristen** (Code hat keine). |
| | `aushang` Schwarzes Brett | F | Aushänge, Gültigkeit | **Keine Kategorien, Anhänge, Lesebestätigung** (Code hat keine). |
| | `buch` Dienstbuch | E | Verlauf nach Tag, Suche, Kategorien, Ausgabe | „Nicht nachträglich änderbar" nur schreiben, wenn der Code das erzwingt — prüfen. |
| Wer mitfährt | `personal` Personal | A | Suche, Filter, Tabelle, Detailkarte, Zusammensetzung | Fachkraftquote-Hinweis nur, wenn berechnet. |
| | `quals` Qualifikationen | A | Matrix Person × Qualifikation, Zustände vorhanden/läuft ab/abgelaufen/fehlt | Vorbehalt § 4 PflBG aus Code. |
| | `nachweise` Nachweise | A | Kacheln, Liste nach Dringlichkeit, Ablauf über 12 Monate | Sperrlogik („sperrt Schichten, nicht die Person") muss der Code so tun. |
| | `kompetenzen` Kompetenzen | A | Matrix | Nur Stände gültig/läuft ab/abgelaufen/fehlt — **keine Entwicklungsstufen**. |
| | `einarbeitung` Einarbeitung | A | Begleitung, Quote „gemeinsame Dienste" | **Keine Bausteine/Fortschritt** (Code kennt sie nicht). |
| | `verteilung` Verteilung (Belastungsverteilung) | Ü | Histogramm, Rangliste | Titel „Belastungsverteilung". |
| | `mittel` Betriebsmittel | A | Ausgabe an Personen | **Keine Wartung** (Code kennt sie nicht). |
| Nachsehen | `pruef` Prüfung | Ü/E | Kacheln (hart/weich/Hinweis), Befundliste, „Was geprüft wurde" | Freigabe-Sperre bei hartem Verstoß; Begründungs-Übergehen nur wenn Code es kennt. Zahlen in Beispielen (Datumsangaben) durch echte ersetzen. |
| | `untergrenzen` Untergrenzen | Ü | Tabelle je Bereich (Tag/Nacht/Hilfskraftanteil), PPP-RL-Balken, Monatsraster | „Nicht bewertbar" ist ein eigener Zustand (grau), kein Verstoß. |
| | `lenkzeiten` Lenkzeiten | Ü | Tages-/Wochen-/Doppelwochen-Summen, Ruhezeiten, Ausnahmen | **Hinweis „ersetzt kein Kontrollgerät" bleibt** (steht im Code). Beispiel Nordwacht (Sicherheit), nicht Pflege. |
| | `belastung` Belastung | Ü | Balken je Person, Stufen (unauffällig ab 0, erhöht ab 45, hoch ab 70), Histogramm | Erklärkasten „keine Leistungskontrolle" beibehalten. |
| | `belastbarkeit` Belastbarkeit | Ü | 4/8/13-Wochen-Umschalter, Reserve/Auslastung | Dienstarten als „Früh 3", nicht Kürzel. |
| | `planstand` Planstand | Ü | Vergleich mit Freigabestand, Änderungen seit Freigabe | Nur Vergleich, kein Entwurf→veröffentlicht-Ablauf; kein „wer". „Kurzfristig" = 0–13 Tage Vorlauf. |
| | `nachweis` Leistungsnachweis | Ü/F | Zeitraum, Summen, Ausgabe | |
| | `abrechnung` Abrechnungsdaten | Ü/A | Reiter Zuschläge/Freizeitausgleich/Lohnausgabe, Summen, Sätze, Format | Nur Zahlen/Personalnummer, keine Gründe. Recht `account.view.all`. |
| Verwaltung | `betrieb` Betrieb | F | Stammdaten, Einheiten, Regelwerk/Tarif, Zugänge, Paket | Zugangscodes nur als Prüfsumme; kein Klartext anzeigen. |
| | `dienste` Dienstarten | F/A | Liste mit Zeit/Netto/Pause/Soll/Zuschlag, Abwesenheitsarten, Detailformular | Änderungen gelten ab nächstem unveröffentlichten Monat — nur aussagen, wenn Code so arbeitet. |
| | `einstellungen` Einstellungen | F | Dichte (Komfortabel/Kompakt), Erscheinungsbild (Hell/Dunkel/Wie das Gerät), Benachrichtigungen | Umschalter-Werte kommen aus dem Code (~Zeile 16276). |
| | `mitnahme` Datenmitnahme | F | Export/Sicherung | **Keine Wiederherstellen-Funktion** im Code → nicht zeigen. |
| | `datenschutz` Datenschutz | F | Fristen (24 Monate Plandaten; 6 Monate Ausgetretene, dann anonymisiert; 3 Monate Gesundheits-Freitexte), Löschlauf, Betroffenenrechte, Zugriffsprotokoll 30 Tage | Alle Fristen aus `aufbewahrung.js`/`schutz.mjs`, nicht aus dem Entwurf abschreiben. |
| | `rechtliches` Rechtliches | F | Impressum/Datenschutzerklärung als Lesefläche | `[BEISPIEL-…]`-Platzhalter aus dem Code; Abschnitt „Urheberrecht" im Entwurf ausgelassen — im Code vorhanden lassen. |

**Bereiche in der Canvas ohne Ansicht:** „Mobil — Meine Schichten" (390 × 844) entspricht der Telefonschale, „Kontrast" ist Erklärung, „Leitstand — dunkel" ist die Dunkelfassung von `start`.

---

## Telefonschale (Mitarbeiter)

- Bleibt eigenständig (`MobilSchale`). **Kein** Umbau auf die Kopfnavigation.
- Verlauf: gleiche Schicht, Höhe ~260 px, gleiche Tokens.
- Karte „Heute" (Schicht, Uhrzeit, Ort, Kolleg:innen) mit Pille „beginnt in …"; drei Schnellaktionen Tausch / Krank / Urlaub als Pillenknöpfe (Höhe 46).
- „Diese Woche" als Liste mit Dienstpille (`TON`), „Stundenkonto" mit Sparkline.
- Tableiste unten: 4 Tabs (`heute`, `plan`, `anliegen`, `mehr`), Icons `heute`, `kalender`, `stift`, `menue` ersetzen die Glyphen `◉ ▤ ✎ ☰`. Höhe 72 + `env(safe-area-inset-bottom)`; aktiver Tab `accent` + Gewicht 600; Tippfläche ≥ 46.
- `MKarte`: Rand über Tokens (kein `#FECACA`), Radius 14→18, `MBlatt` Rücken über `--c-ueberlagerung`.
- Feldmodus (Schrift 16, Kontrast) weiter möglich.
- Schichtenraster bleibt aus der Telefonansicht draußen (Code-Kommentar: „ein Raster mit 31 Spalten lässt sich auf dieser Breite nicht retten").

---

## Zustände, Modi, Sonderfälle

Für **jede** Ansicht und jeden Baustein gehören dazu (in den Entwürfen fehlen sie fast alle):
- **Hover, Fokus (`:focus-visible`), aktiv/gewählt, deaktiviert, geladen, leer, Fehler, offline.** Leere Zustände über `Leer` mit Erklärung *und* nächstem Schritt.
- **Dunkel:** alles über Tokens. Sonderprüfung: Kopfzeile (`kopfGrund`), Schatten (Rand trägt), Verlauf (≤ 0,24), Diagrammflächen, Bogen-Segmente.
- **Kompakt (`.dicht`):** Kartenpadding und Tabellenzeilen schrumpfen über die Variablen; Kennzahlgröße bleibt.
- **Feldmodus:** kein Verlauf, Ränder `lineStark`, Schrift 16.
- **Fokus:** Navigation weg, Fokus-Leiste da.
- **Druck:** kein Verlauf, keine Sticky-Leisten, Karten mit Rand ohne Schatten (besteht).
- **Betriebsrat:** rein lesend — alle Aktionsknöpfe fehlen, nicht deaktiviert; Ansichten dieselben Zahlen.
- **Betreiber:** sieht nur Zahlen, keine Namen. In Übersichten keine Personenlisten rendern.
- **Sehr lange Namen, 0 Einträge, 500 Einträge:** Layout darf nicht brechen; Tabellen scrollen intern, Karten nie über den Rahmen.
- **Farbe nie allein:** jede Statusfarbe hat Text oder Form daneben (Pillen mit Wort, Zellen mit Kürzel, Bogen mit Legende).

---

## Ehrlichkeit der Daten

Ein Produkt für Nachweise darf keine dekorativen Zahlen zeigen.
1. **Gestrichen:** „Personalbedarf — nächste 30 Tage" mit „Prognosegüte 87 %" (kommt aus dem Vorbild, ist keine CENTRIC-Funktion). Wenn du eine Bedarfsvorschau *willst*, ist das ein eigenes Vorhaben (Datenmodell, Modell, Prüfung) — nicht Teil dieses Auftrags.
2. **Jede Kennzahl bekommt eine benannte Quelle** (Funktion/Feld) und eine Regel für „nicht berechenbar". Vorschlag für `start`:
   | Karte | Quelle | „nicht berechenbar" wenn |
   |---|---|---|
   | Besetzung heute | Ist/Soll aus Plan + Dienstarten-Soll | kein Soll hinterlegt |
   | Offene Schichten | Zahl der offenen (Ansicht `offene`) | — |
   | Anträge offen | Zähler `zaehler.antraege` | — |
   | Ruhezeit-Befunde | `regelwerk.js`-Prüfung, letzte 28 Tage | Plan nicht geprüft |
   | PpUGV-Erfüllung | `ppugv.js` je Bereich | Belegung fehlt → „nicht bewertbar" |
   | Krankenstand | Abwesenheitsart `krank` ÷ Soll-Tage | kein Vergleichszeitraum → nur Wert, ohne Trend |
3. **Trendpillen nur mit beiden Zeiträumen.** Fehlt der Vergleich, steht dort nichts (kein „—", kein Platzhalter-Pfeil).
4. **Beispielzahlen der Entwürfe sind keine Vorlagen.** Namen, Datum, Prozentwerte, „Rufbereitschaft Leitung", die Ereignisse im Dienstbuch etc. sind Demo. Umsetzung liest immer aus dem Bestand.
5. **Keine Rechtsbehauptung ohne Beleg im Code.** Wo ein Entwurf einen Paragrafen nennt, muss die Stelle im Code oder in `regelwerk.js`/`aufbewahrung.js` existieren, sonst weglassen.
6. **Mikro-Diagramme sind Illustration + Zahl:** Die Zahl daneben ist die Wahrheit; das Diagramm darf nie mehr Genauigkeit vortäuschen als die Daten haben.

---

