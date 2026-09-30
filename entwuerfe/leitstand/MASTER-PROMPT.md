# CENTRIC — Master-Prompt: Umgestaltung im „Leitstand-Stil"

Stand: 29. September 2026. Dieser Prompt ist **noch nicht ausgeführt**. An der Anwendung wurde nichts geändert.

Grundlage: die Design-Canvas „CENTRIC Leitstand-Entwürfe" (45 Artboards) und ein Durchgang durch den echten Code (`src/App.jsx`, `src/farben.js`, `src/main.jsx`, `src/marke.jsx`, `src/schrift.css`, `index.html`, `vite.config.js`, `netlify.toml`). Alle Zahlen zu Kontrasten in diesem Dokument sind gerechnet, nicht geschätzt.

---

## 0. So benutzt du diesen Prompt

- **Teil A bis M** ist der Auftrag an mich (oder eine neue Sitzung). Du kannst ihn komplett einfügen oder Phase für Phase (Teil K).
- **Teil C** enthält sechs Entscheidungen, die du treffen musst, bevor es losgeht. Ich habe jeweils eine Empfehlung eingetragen.
- **Reihenfolge:** erst die Migration auf den IONOS-Server, dann dieses Redesign. Zwei große Umbauten gleichzeitig machen Fehlersuche unmöglich.
- **Zwei Korrekturen gegenüber dem, was ich dir vorher gesagt habe** (Anhang 1 hat alle): (1) Es sind **43 Ansichten**, nicht 38. (2) Der Farbverlauf liegt in der Kopfzone **doch unter Text** (Titel und Untertitel), nicht nur in den Zwischenräumen. Das ist unkritisch, wenn man die Deckkraft begrenzt (Teil D.3) — aber es muss gemessen werden.

---

## Teil A — Auftrag und Rahmen

### A.1 Ziel
Die Oberfläche von CENTRIC bekommt den Stil der Canvas „Leitstand-Entwürfe": Kopfzeile mit Pillen-Navigation statt dunkler Seitenleiste, deckende weiße Karten mit Kennzahlen und Mikro-Diagrammen, ein weicher Teal-Verlauf hinter der Titelzone, einheitliche Radien, Schatten und Icons. Die **Farbwelt bleibt** (`src/farben.js`). Die **Funktionen bleiben**.

### A.2 Was nicht Teil des Auftrags ist
Nicht anfassen, außer wo Teil E/F es ausdrücklich verlangt:
- Rechte, Rollen, Paketzuordnung (`netlify/lib/rechte.mjs`, `darf(...)`, Abschnitt Rechtetabelle in `App.jsx`). Der Test `npm run pruefung:matrix` vergleicht Oberfläche und Server — er muss grün bleiben.
- Regelwerk und Rechenkerne: `regelwerk.js`, `ppugv.js`, `ppprl.js`, `fahrzeit.js`, `aufbewahrung.js`, `tarifwerke.js`, `stufen.js`, `preisgestaltung.js`.
- Server: alles unter `netlify/`.
- Datenmodell, Speicherformat, Migration (`speicher.js`, `migration.js`).
- **Ansichts-IDs** (`"start"`, `"plan"`, `"jahr"` …) und die Struktur von `BEREICHE`. Tour, Handbuch, Suche (Strg K) und Zähler hängen daran.
- Sicherheitsheader und CSP (`netlify.toml`, später der nginx-Ersatz). Das Redesign braucht **keine** Änderung daran (siehe A.3).

### A.3 Harte Randbedingungen aus dem Code
1. **Schrift bleibt im Haus.** `src/schrift.css` bindet Inter lokal ein; der Kommentar dort erklärt warum (IP-Weitergabe an Dritte, LG München I 2022). Die Canvas benutzt zur Vorschau einen Google-Fonts-Link — **das darf nie in die Anwendung**. Keine externen Fonts, Bilder, Icon-CDNs, Skripte.
2. **CSP:** `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'`. Erlaubt sind also CSS-Verläufe, Inline-Styles, Inline-SVG, `data:`-Bilder. Verboten: Inline-Skripte, Inline-Handler (`onclick="…"` als Attribut-String), externe Ressourcen. Der Build prüft „kein Inline-Skript".
3. **Theme-Mechanik:** `C` in `farben.js` wird beim Umschalten **überschrieben** (`themaSetzen`, `Object.assign(C, …)`); zusätzlich setzt `bauStyles()` CSS-Variablen (`alsVariablen`) für `:root` und `:root[data-thema="dunkel"]`. Neue Farb-Tokens müssen in **beiden** Paletten stehen (`C`/`C_HELL` und `C_DUNKEL`).
4. **Dichte:** Klasse `.dicht` (Kompakt) ändert `--zeile`, `--pad-y`, `--pad-x`, `--luft`, `--block`, `--schrift`. Neue Abstände laufen über diese Variablen.
5. **Sondermodi, die weiterleben müssen:** Fokusmodus (`.fokus` blendet Navigation aus), Feldmodus (`.feldmodus`, größere Schrift, Kontrast), Druck (`@media print`), `prefers-reduced-motion`, Sprungmarke „Zum Inhalt springen", sichtbarer Fokusring.
6. **Zwei Schalen:** Desktop/Tablet (`AppInnen` → `.huelle`) und die **eigenständige Mitarbeiter-Telefonschale** (`MobilSchale`, `M_TABS`, `MKarte`, `MZeile`, `MTitel`, `MBlatt`). Sie wird bei `nurMitarbeiter && !rechnerAnsicht` gewählt. Beide müssen umgestaltet werden.
7. **Zwei weitere Einstiege:** `src/main.jsx` (Anmeldung, Demozugänge, Preisrechner mit `Ringregler`, eigene Palette `F`) und `src/startbild.jsx` (Startsequenz mit Canvas-Marke aus `marke.jsx`).
8. **`src/pruefung.jsx`** (7.900 Zeilen) ist der lazy nachgeladene Selbsttest, kein UI. Er hat eine Kopie von `themaSetzen`. Keine Klassennamen umbenennen, die er benutzt (vorher `grep`).
9. **README ist veraltet:** Sie nennt einen Ordner `quelle/` mit `bau.sh` — den gibt es nicht. Es wird direkt in `src/App.jsx` gearbeitet.
10. **App.jsx ist 22.737 Zeilen.** Neuer Code kommt in **neue Dateien** (Teil F.1), nicht in den Monolithen. In `App.jsx` nur Aufrufe ändern.
11. **Keine Abhängigkeiten hinzufügen** (weder Icon-Bibliothek noch Diagramm-Bibliothek). `npm audit --omit=dev` steht auf 0 Funden; das soll so bleiben.

---

## Teil B — Ausgangslage: Was schon so ist und was nicht

**Schon nah am Ziel** (also eher Umlackieren als Umbauen):
- Titel `h1.titel`: 38 px, Gewicht 300, Laufweite −0,045 em — genau der Stil der Entwürfe.
- `.seg` sind schon Pillen. `.karte` hat Rand, Radius 16, weichen Schatten. `Pille`, `Kpi`, `Card`, `Btn`, `Field`, `Sheet`, `Leer`, `Avatar`, `Planzelle`, `table.raster` gibt es.
- `.kopfleiste` ist schon sticky mit `backdrop-filter`.
- Ein schmaler Reiter-Baustein `.reiterreihe` existiert (horizontal scrollbar) — Grundlage für die Unterleiste.

**Bewusste frühere Entscheidungen, die die Entwürfe umkehren oder verletzen** (nur mit Absicht ändern):
- `farben.js`: „Die Hierarchie kommt aus der dunklen Seitenleiste und aus der Typografie, nicht mehr aus Rändern um jedes Kästchen." → Die Entwürfe streichen die Leiste. Ersatz: Kopfzeile + Verlauf + Typografie.
- `TON(farbe)`: Dienstarten sind „entsättigte Tönungen mit dünner Akzentlinie — **keine Farbflächen**" (`background: farbe+12/1F`, `borderLeft: 2.5px`). Mein Entwurf „Monatsplan" zeichnet volle Farbflächen mit weißer Schrift. → **Die Tönung bleibt.** Gründe: Weiß auf Freistellung-Grau (#878C93) erreicht nur 3,39:1; Farbenblindheit (Farbe darf nicht allein tragen — es steht immer das Kürzel dabei); Druckbild.
- Karten brauchen **einen sichtbaren Rand** (Kommentar in `farben.js`: Weiß auf Sea Salt hat nur 1,3:1). Bleibt.

**Bekannte Schwachstellen, die im Zuge des Umbaus mit erledigt werden** (Fund im Code):
| Stelle | Problem |
|---|---|
| `.pille-ok/-warn/-danger/-accent` | Rand hart in Tailwind-Farben (`#BBF7D0`, `#FEF08A`, `#FECACA`, `#9FC2AC`) — nicht in der Palette |
| `AV_TOENE` (Avatar) | Acht Tailwind-Farbpaare (`#F0FDFA/#0F766E` …) — nicht in der Palette |
| `MKarte` | Rand `#FECACA`/`#FDE68A` hart |
| `.sheet-back`, `MBlatt`, `.toast`, Hinweisstreifen | Überlagerungen mit hartem `rgba(17,24,39,…)`/`rgba(20,20,28,…)`, `#fff` |
| `.kopfleiste` | `background: rgba(255,255,255,.92)` hart — **im Dunkelmodus prüfen** |
| `.btn-danger` | `background:#fff` hart |
| Glyphen als Icons | `⌕ ✉︎ ☰ ◉ ▤ ✎ ⏻ ›` sind Textzeichen; sie sehen je Betriebssystem anders aus und werden teils als Emoji gerendert |
| `Schalter` | CSS `.schalter.on` nimmt Akzent, das React-Style `C.ok` — zwei Quellen |

---

## Teil C — Entscheidungen (am 30. September 2026 vom Auftraggeber als gesetzt bestätigt)

| # | Frage | Entscheidung |
|---|---|---|
| C1 | Navigation: Pillen-Kopfzeile + Unterleiste (wie Entwürfe) **oder** dunkle Seitenleiste behalten? | **Pillen + Unterleiste** auf Rechner/Tablet ≥ 1025 px. Die bestehende Seitenleiste bleibt als **Drawer** ≤ 1024 px (erprobter Code, kein Neubau). |
| C2 | Heißt die erste Ansicht „Start" oder „Leitstand"? | **„Start" behalten** (ID `start`, Tour/Handbuch nennen sie so). „Leitstand" kann als Untertitel oder Rubrik dienen. |
| C3 | Bleibt der Feldmodus? | **Ja.** Er ist für Nachtschicht/Feldeinsatz gedacht und mit dem neuen Stil vereinbar. |
| C4 | Kennzahl-Trends („↗ 2,4 % zum Vormonat") | **Nur dort, wo die App beide Zeiträume wirklich besitzt.** Sonst keine Trendpille. Siehe Teil J. |
| C5 | Icons | **Eigener kleiner Satz als Inline-SVG** (Teil D.7). Keine Bibliothek. |
| C6 | Rollout | **Direkt auf dem Branch, ohne Schalter.** Du hast nur Demodaten. Ein alter/neuer Modus nebeneinander würde die Testfläche verdoppeln. |
| C7 | Tauschbörse: Was sieht die Leitung? | **Die Vorgänge der ganzen Einheit** (nicht nur eigene). Das ist eine Codeänderung an der Ansicht `boerse` und ihrer Filterung; Rechte und Serverfilter (`bestandFuerRolle`) dürfen dadurch nichts Zusätzliches ausliefern — vorher prüfen, ob die Daten der Einheit für diese Rolle ohnehin im Bestand liegen. Erst nach P4. |
| C8 | Reihenfolge zur Migration | **Erst Migration auf den IONOS-Server, dann P0.** |
| C9 | Entwurfsumfang | Nicht alles zeichnen. Gezeichnet wurden zusätzlich: Rahmen mit Unterleiste, Menüs, Zustandsblatt, Icons, Maßblatt, Telefon-Tabs, Meine Schichten, Dunkel/Kompakt/Feldmodus. Anmeldung, Startsequenz, Betreiberkonsole und Preisrechner werden **direkt in Code** umgesetzt (P7), Dialoge nach dem Zustandsblatt. |

**Kennzahlen der Startseite (gesetzt):** Besetzung heute, offene Schichten, offene Anträge, Ruhezeit-Befunde, Untergrenzen-Erfüllung. Krankenstand nur, wenn der Vergleichszeitraum berechenbar ist. Die Prognosekarte entfällt.

---

## Teil D — Designsystem

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
| `randStark` | `#5B6B72` | `#7A8D95` | Rand/Kontur von Bedienelementen im Aus-Zustand (Kreise, Checkboxen) — siehe Kontrastbefund |

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
4. **Das Kontrastskript (Teil L) rechnet die Überlagerung am ungünstigsten Punkt** und lässt den Build der Prüfung scheitern, wenn `text`/`dim` unter 4,5:1 fallen oder jemand einen Token über die Grenze schiebt.
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
| `kreis-leer` | `circle 12 12 r8.6` (Kontur `randStark`) | Checkliste offen |
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

## Teil E — Bausteine

Alle neuen Bausteine in `src/gestalt/bausteine.jsx`; die CSS-Klassen in `bauStyles()` (oder in eine neue `src/gestalt/stil.js`, die `bauStyles()` zusammensetzt).

| Baustein | Änderung | Wichtig |
|---|---|---|
| `Card` / `.karte` | Radius 18, Schatten E2, Rand `line`; Variante `.karte-still` (E1) | Rand bleibt (1,3:1-Lehre). |
| `Btn` | Pille, Höhen laut D.5; `kind`: plain/primary/quiet/danger/ok bleiben | Primär: `accent`-Grund, Weiß 5,91:1; dunkel: Grund `accent` (#3FBFBF), Schrift `#06181A` (8,16:1) statt Weiß. |
| `Pille` | ohne Rand; Ton = Tönung (`okLight` …) + Volltönung | Tailwind-Ränder entfernen. Kontraste: ok 5,50, warn 4,69, danger 12,22, accent 5,03 — alle über 4,5. |
| `Seg` | bleibt Pillenreihe; aktiv: `accentLight`-Grund + `accent`-Rand (besteht) | `role="tablist"` beibehalten. Alternativ segmentiert (Kapsel, aktiv dunkel) nur für Zeitraum-Schalter; **eine** Form wählen (Empfehlung: bestehende). |
| `Kpi` | neu: Titel klein `aus`, Wert groß, optional `trend` (Pille), optional `bild` (Mikro-Diagramm), Fußzeile | Trend nur wenn Daten (Teil J). |
| `Sparkline` (neu) | SVG-`polyline` + Fläche `accentLight`, Endpunkt hervorgehoben; Säulen-Variante; Punktraster-Variante | Farbe nur `accent`/Status; Werte tabellarisch beschriftet für Leser (`<title>` oder `aria-label` mit Zusammenfassung). |
| `Bogen` (neu, Halbkreis) | SVG-Pfad, Segmente per `stroke-dasharray`; Farben `ok`/`warn`/`lineStark` (nicht Orange-Grün-Blau wie im Vorbild) | Für PpUGV-Erfüllung, PPP-RL. Zahl in der Mitte als Text. Segmentfarben tragen nie allein: Legende/Text daneben. |
| `Fortschritt` (neu) | Balken 6–8 px, `accent`/Status | für Einrichtung, Beteiligung, Auslastung |
| `Checkliste` (neu) | Zeile mit `kreis-haken` (ok) / `kreis-leer` (Kontur `randStark`) | Leer-Kreise in den Entwürfen nutzen #9DB3BC = 2,19:1 → fällt unter 3:1 für Bedienelement-Konturen. **`randStark` verwenden (5,54:1).** |
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

## Teil F — Rahmen und Navigation

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

## Teil G — Ansichten (alle 43)

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

## Teil H — Telefonschale (Mitarbeiter)

- Bleibt eigenständig (`MobilSchale`). **Kein** Umbau auf die Kopfnavigation.
- Verlauf: gleiche Schicht, Höhe ~260 px, gleiche Tokens.
- Karte „Heute" (Schicht, Uhrzeit, Ort, Kolleg:innen) mit Pille „beginnt in …"; drei Schnellaktionen Tausch / Krank / Urlaub als Pillenknöpfe (Höhe 46).
- „Diese Woche" als Liste mit Dienstpille (`TON`), „Stundenkonto" mit Sparkline.
- Tableiste unten: 4 Tabs (`heute`, `plan`, `anliegen`, `mehr`), Icons `heute`, `kalender`, `stift`, `menue` ersetzen die Glyphen `◉ ▤ ✎ ☰`. Höhe 72 + `env(safe-area-inset-bottom)`; aktiver Tab `accent` + Gewicht 600; Tippfläche ≥ 46.
- `MKarte`: Rand über Tokens (kein `#FECACA`), Radius 14→18, `MBlatt` Rücken über `--c-ueberlagerung`.
- Feldmodus (Schrift 16, Kontrast) weiter möglich.
- Schichtenraster bleibt aus der Telefonansicht draußen (Code-Kommentar: „ein Raster mit 31 Spalten lässt sich auf dieser Breite nicht retten").

---

## Teil I — Zustände, Modi, Sonderfälle

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

## Teil J — Ehrlichkeit der Daten

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

## Teil K — Phasen und Arbeitsweise

**Arbeitsweise (gilt in jeder Phase)**
1. Eigener Branch `redesign/leitstand`, von der aktuellen Hauptlinie. **Nie direkt auf `main`.**
2. Vor jedem Schritt die betroffene Stelle in `App.jsx` lesen (Grep auf Komponentennamen); Änderungen klein und rückgängig.
3. Nach jeder Phase: `npm run lint`, `npm run pruefung:typen`, `npm run build`, `npm run pruefung` (die serverabhängigen Prüfungen brauchen `CENTRIC_ADMIN=… npx vite --port 5173`, wie in `.github/workflows/pruefung.yml`), dazu Kontrastskript und Screenshot-Satz (Teil L). **Alles grün, sonst nicht weiter.**
4. Ein Commit pro Phase (bei großen Phasen pro Bereich), Nachrichtenstil wie im Repo (deutsch, Begründung statt Beschreibung).
5. Am Ende jeder Phase kurzer Bericht: was geändert, was gemessen, was offen.
6. Anhalten und fragen, wenn: eine Ansicht Daten bräuchte, die es nicht gibt; ein Recht/eine Regel berührt würde; ein Test rot wird und die Ursache nicht eindeutig im Redesign liegt.

| Phase | Inhalt | Sichtbar? | Größe |
|---|---|---|---|
| **P0 Vorbereitung** | Branch; Baseline-Screenshots aller Ansichten (Teil L) *vor* der ersten Änderung; Kontrastskript anlegen und auf den Ist-Stand laufen lassen; `Icon` und leere `gestalt/`-Dateien | nein | S |
| **P1 Tokens und Bausteine** | Neue Tokens in `farben.js` (beide Paletten); `bauStyles` auf Tokens; `Card`, `Btn`, `Pille`, `Seg`, `Kpi`, `Avatar`, `Leer`, `Sheet`, `Toast` umgestellt; harte Farben aus Teil B entfernt; `Sparkline`, `Bogen`, `Fortschritt`, `Checkliste`, `Erklaerkasten`, `Menue` neu | ja, überall leicht | M |
| **P2 Rahmen** | Kopfzeile, Bereichs-Pillen, Unterleiste, Ansicht-/Avatar-Menü, Drawer ≤ 1024, Fokusmodus, Betreiber-Nav, Verlaufsschicht | ja, stark | M |
| **P3 Übersichten** | `start`, `lage`, `untergrenzen`, `pruef`, `belastung`, `belastbarkeit`, `planstand`, `verteilung`, `lenkzeiten`, `nachweis`, `abrechnung` | ja | L |
| **P4 Entscheidungsansichten** | `notrufe`, `offene`, `antraege`, `boerse`, `wuensche`, `aushang`, `buch` | ja | M |
| **P5 Arbeitsebene (leicht)** | `plan`, `einsatz`, `jahr`, `zeitachse`, `bereitschaft`, `selbstplan`, `sonder`, `folge`, `personal`, `quals`, `nachweise`, `kompetenzen`, `einarbeitung`, `mittel`, `meine` — nur Kopf, Werkzeugleiste, Radien, Chips | ja | M |
| **P6 Formulare und Text** | `betrieb`, `dienste`, `einstellungen`, `mitnahme`, `datenschutz`, `rechtliches`, `handbuch`, `hilfe`, `ablauf`, `uebergabe` | ja | M |
| **P7 Telefonschale und Einstiege** | `MobilSchale` + Bausteine, Anmeldung (`main.jsx`, Palette `F` durch `C` ersetzen), Startbild, Betreiberkonsole, Preisrechner | ja | M |
| **P8 Abnahme** | Vollständiger Lauf aller Prüfungen, Screenshot-Vergleich, Tour-/Handbuch-Bilder, `public/vorschau.png` (Teilen-Vorschau), `theme-color`, Marketing-Bilder aktualisieren, Doku (`ENTWICKLUNG.md`, README-Korrektur `quelle/`) | ja | S |

**Reihenfolge-Begründung:** P1 vor P2, weil der Rahmen die Bausteine braucht; P3 vor P5, weil die Übersichten den meisten Nutzen bringen und die Arbeitsebene am risikoreichsten ist.

**Abhängigkeit zur Migration:** Das Redesign ändert weder Header noch Pfade. Nach dem Umzug auf IONOS läuft es gegen den dortigen nginx mit derselben CSP. Erst umziehen, dann P0.

---

## Teil L — Prüfungen (neu anzulegen, alles unter `pruefungen/`)

### L.1 Kontrastprüfung `kontrast.test.js` (vitest, ohne Server, in `npm run pruefung`)
- Liest `C_HELL` und `C_DUNKEL` aus `farben.js`.
- Prüft eine **Tabelle von Paaren** (Vorder-/Hintergrund, Mindestwert) für Text ≥ 4,5, große Schrift ≥ 3, Bedienelement-Konturen ≥ 3.
- Pflichtpaare (mindestens): `text/bg`, `dim/bg`, `aus/flaeche`, `accent/bg`, `Weiß/accent`, `ok|warn|danger|violet` auf ihrer `…Light`-Fläche, dunkel `#06181A` auf `accent`, alle zehn weißen-Schrift-Dienstfarben aus D.1, `randStark/flaeche` ≥ 3, die acht Avatar-Paare.
- **Verlauf:** Komposition `verlaufA` (+ `verlaufB`) über `flaecheStill` (hell) bzw. `bg` (dunkel) am ungünstigsten Punkt; `text` und `dim` ≥ 4,5. Schlägt fehl, sobald jemand die Deckkraft erhöht.
- Rechnet mit WCAG-Formel (relative Luminanz), keine Bibliothek.

### L.2 Screenshot-Satz `pruefungen/bilder.mjs` (Playwright, nicht in CI; eigener npm-Script `pruefung:bilder`)
Gleicher Ansatz wie `pruefungen/rechte.mjs`: Vite starten, Testmandant über `/einrichten` (Demo-Generator der App), pro Ansicht Screenshot.
Matrix: **Rolle** (Leitung, Planer, Mitarbeiter, Betriebsrat, Betreiber) × **Thema** (hell, dunkel) × **Breite** (1440, 1024, 390) × **Modus** (normal, kompakt, Feldmodus). Nicht jede Ansicht in jeder Kombination: Pflicht sind alle 43 Ansichten in *Leitung/hell/1440*, dazu die Übersichten in *dunkel* und *390/Mitarbeiter*.
- Vor der Änderung Baseline erzeugen (P0), nach jeder Phase vergleichen (Augenschein + Pixel-Differenz-Hinweis, kein Automatismus).
- Konsole muss leer sein (keine Fehler, keine Warnungen), keine horizontale Seitenrolle (`document.documentElement.scrollWidth <= innerWidth`).

### L.3 Strukturprüfung `pruefungen/gestalt.test.js`
- `grep`-artig über `src/**/*.jsx|js|css`: keine externen URLs (`https://` außer in Rechtstexten/Doku), kein `@import url(`, kein `fonts.googleapis`, keine Emoji/Symbolglyphen als Icons (`⌕ ✉ ☰ ⏻`), keine neuen harten Hexfarben außerhalb `farben.js`/Dienstdaten (Whitelist).
- Nur Bausteine aus `Icon`-Satz.

### L.4 Bestehende Prüfungen, die grün bleiben müssen
`npm run pruefung` in voller Länge (Lint, Typen, Regeln, Branchen, PpUGV, PPP-RL, Fahrzeit, Selbsttest, Aufbewahrung, Tarife, Codes, Scherben, Matrix, Betreiber, Rollen, Standorte, Rechte, Sicherung, Verwalter, Demo, Bremse) und `npm run build` ohne Inline-Skript. Wenn `pruefung:selbst` oder `pruefung:matrix` rot werden: Redesign ist die wahrscheinlichste Ursache — sofort untersuchen, nicht die Prüfung anpassen.

---

## Teil M — Abnahme

**Muss erfüllt sein**
- [ ] Alle 43 Ansichten im neuen Stil oder bewusst „Klasse A leicht", ohne Funktionsverlust.
- [ ] Kein Rechte-, Regel-, Server-, Speicher-Code geändert (`git diff --stat` zeigt es).
- [ ] `npm run pruefung` grün, `npm run build` grün, Kontrastprüfung grün.
- [ ] Hell **und** dunkel; Kompakt; Feldmodus; Fokus; Druckvorschau geprüft.
- [ ] 1440, 1024, 390 px ohne horizontale Seitenrolle und ohne überlaufende Karten.
- [ ] Nur `text` und `dim` auf dem Verlauf; Ränder der Karten sichtbar.
- [ ] Keine externe Ressource, keine neue Abhängigkeit, CSP unverändert.
- [ ] Keine Glyphen/Emojis als Icons; alle Icon-Knöpfe mit `aria-label`.
- [ ] Tastaturbedienung: Kopfnavigation, Unterleiste, Menüs, Sheets erreichbar; Fokus sichtbar; Escape schließt Menüs.
- [ ] Zähler an Bereichen/Ansichten wie bisher; Betreiber-Navigation vollständig.
- [ ] Jede angezeigte Kennzahl hat eine Quelle (Teil J); keine Prognosekarte.
- [ ] Tour und Handbuch zeigen keine veralteten Beschreibungen („Seitenleiste links").

**Berichtsformat am Ende**
1. Was umgesetzt ist (Phasen, Commits).
2. Gemessene Ergebnisse (Prüfungen, Kontrastwerte, Screenshots).
3. Abweichungen von diesem Prompt und warum.
4. Offene Punkte / Entscheidungen für dich.

---

## Anhang 1 — Korrekturen gegenüber früheren Aussagen und Entwürfen

| Punkt | Früher gesagt/gezeichnet | Richtig |
|---|---|---|
| Ansichtenzahl | 38 | **43** (8+7+7+7+8+6 laut `BEREICHE`). Das Word-Dokument „CENTRIC-Übersicht" nennt in einer Überschrift ebenfalls 38. |
| Verlauf und Text | „Nur in den Zwischenräumen, nie unter Text" | Titel und Untertitel liegen auf dem Verlauf. Zulässig nur mit den Grenzen aus D.3. |
| Farbflächen im Plan | Monatsplan-Entwurf mit vollen Dienstfarben | Bestehende Tönung + Linie bleibt (Kontrast, Farbenblindheit, Druck). |
| Google Fonts | Im Entwurf eingebunden | Nie in der Anwendung; Inter lokal (`schrift.css`). |
| Äußerer Rahmen | Entwürfe zeigen einen abgerundeten Rahmen mit 28 px Rand | Vorschau-Chrome. **Nicht umsetzen** — die Anwendung ist vollflächig. |
| Weichzeichner | `filter: blur(56px)` im Entwurf | Nicht übernehmen; Radialverlauf ohne Filter. |
| Navigation | Pillenleiste, Unterebene fehlt | Unterleiste (F.2) ergänzt; Drawer bleibt. |
| Icons | Teilweise nur Icons (Monatsplan/Main) | Bereichs-Pillen immer mit Text. |
| Unerledigt-Kreis | `#9DB3BC` (2,19:1) | `randStark` (5,54:1). |
| Prognosekarte | „Personalbedarf 30 Tage / 87 %" | Gestrichen (keine Funktion). |
| Hilfe-Suchfeld, Kategorien am Brett, Fristen bei Wünschen, Einarbeitungsbausteine, Wartung, Wiederherstellen | teils im Entwurf oder in der Beschreibung | Nicht im Code → nicht zeigen. |
| Leitungssicht Tauschbörse | Einheit | Im Code nur eigene Vorgänge; Entscheidung nötig (Teil G). |

## Anhang 2 — Kurzfassung als Startbefehl (zum Einfügen)

> Setze den Master-Prompt „CENTRIC — Umgestaltung im Leitstand-Stil" um, Phase P0 und P1. Arbeite auf dem Branch `redesign/leitstand`. Ändere keine Rechte, Regeln, Server- oder Speicherdateien. Füge keine Abhängigkeit hinzu und keine externe Ressource. Lege zuerst die Baseline-Screenshots und das Kontrastskript an, führe es auf dem Ist-Stand aus und berichte die Werte. Danach Tokens und Bausteine gemäß Teil D und E. Alle Prüfungen aus Teil K müssen grün sein, bevor du P2 vorschlägst. Frage nach, wenn eine Ansicht Daten bräuchte, die es nicht gibt.
