# Layoutbeschreibung Leitstand-Artboards

Aus DOM-Messung (Chromium, Laufzeit gerendert). Koordinaten in px relativ zur oberen linken Ecke des Artboards. "Karte" = Element mit Hintergrund oder Rand und Eckenradius >= 10 px, mindestens 100x40 px; Einrückung zeigt Karten in Karten. Reihenfolge = DOM-Reihenfolge (Lesereihenfolge). Grid-Angaben nur, wo das Elternelement CSS-Grid ist. Schrift ist im Lauf die Systemschrift statt Inter.

Gemeinsamer Rahmen der Desktop-Artboards (1440x980): Root mit abgerundetem Vorschau-Rahmen (Hintergrund #D9E4E8, Verlaufsfleck oben bis ca. 440 px), darin Kopfzeile (Logo CENTRIC, Pillen-Navigation Im Dienst / Planen / Zu entscheiden / Wer mitfährt / Nachsehen / Verwaltung, Suche, Avatar), darunter Seitentitel mit Untertitel links und Aktionen rechts, dann der Inhalt.

## Main (1440x980)

Root: display flex row, Innenabstand 28px, Abstand normal, Hintergrund rgb(217, 228, 232).

Hauptblöcke (Kinder des Root):
- <div> x28 y28 1384x924, relative/flex, 5 Kinder – "Guten Morgen, Sabine"

Karten:
- x28 y28 1384x924 "Guten Morgen, Sabine", 5 Kinder
  - x172 y39 351x46 "Leitstand", 6 Kinder
  - x1203 y42 131x40 "Alle Einheiten", 1 Kinder
  - x795 y111 154x40 "Schicht besetzen", 1 Kinder
  - x957 y111 129x40 "Anträge", 2 Kinder
  - x1094 y111 112x40 "Übergabe", 1 Kinder
  - x1214 y111 165x40 "Monatsplan öffnen", 1 Kinder
  - x61 y198 429x244 "Einrichtung", 3 Kinder, Spaltenspanne "span 4" (Eltern-Grid: 12 Spalten à ca. 95px)
    (+1 gleich große Karten: x950 y198 "94 %")
  - x61 y458 318x156 "97,3 %", 5 Kinder, Spaltenspanne "span 3" (Eltern-Grid: 12 Spalten à ca. 95px)
    (+1 gleich große Karten: x395 y458 "12")
  - x728 y458 317x156 "6,4 %", 5 Kinder, Spaltenspanne "span 3" (Eltern-Grid: 12 Spalten à ca. 95px)
  - x1061 y458 318x156 "3", 5 Kinder, Spaltenspanne "span 3" (Eltern-Grid: 12 Spalten à ca. 95px)
  - x61 y630 762x248 "1.842", 4 Kinder, Spaltenspanne "span 7" (Eltern-Grid: 12 Spalten à ca. 95px)
  - x839 y630 540x248 "Dienstbuch", 3 Kinder, Spaltenspanne "span 5" (Eltern-Grid: 12 Spalten à ca. 95px)

## Leitstand-Dunkel (1440x980)

Root: display flex row, Innenabstand 28px, Abstand normal, Hintergrund rgb(4, 10, 12).

Hauptblöcke (Kinder des Root):
- <div> x28 y28 1384x924, relative/flex, 5 Kinder – "Guten Abend, Sabine"

Karten:
- x28 y28 1384x924 "Guten Abend, Sabine", 5 Kinder
  - x172 y39 351x46 "Leitstand", 6 Kinder
  - x1201 y42 131x40 "Alle Einheiten", 1 Kinder
  - x787 y111 154x40 "Schicht besetzen", 1 Kinder
  - x949 y111 129x40 "Anträge", 2 Kinder
  - x1085 y111 112x40 "Übergabe", 1 Kinder
  - x1205 y111 174x40 "Monatsplan öffnen", 1 Kinder
  - x61 y198 429x244 "Einrichtung", 3 Kinder, Spaltenspanne "span 4" (Eltern-Grid: 12 Spalten à ca. 95px)
    (+1 gleich große Karten: x950 y198 "94 %")
  - x61 y458 318x156 "97,3 %", 5 Kinder, Spaltenspanne "span 3" (Eltern-Grid: 12 Spalten à ca. 95px)
    (+1 gleich große Karten: x395 y458 "12")
  - x728 y458 317x156 "6,4 %", 5 Kinder, Spaltenspanne "span 3" (Eltern-Grid: 12 Spalten à ca. 95px)
  - x1061 y458 318x156 "3", 5 Kinder, Spaltenspanne "span 3" (Eltern-Grid: 12 Spalten à ca. 95px)
  - x61 y630 762x248 "1.842", 4 Kinder, Spaltenspanne "span 7" (Eltern-Grid: 12 Spalten à ca. 95px)
  - x839 y630 540x248 "Dienstbuch", 3 Kinder, Spaltenspanne "span 5" (Eltern-Grid: 12 Spalten à ca. 95px)

## Kontrast (880x460)

Root: display flex column, Innenabstand 26px 28px, Abstand 16px, Hintergrund rgb(217, 228, 232).

Hauptblöcke (Kinder des Root):
- <div> x90 y40 700x340, absolute/block, 0 Kinder
- <div> x28 y26 824x44, relative/block, 2 Kinder – "Warum die Karten deckend bleiben"
- <div> x28 y86 824x348, relative/flex, 2 Kinder – "97,3 %"

Karten:
- x28 y107 410x284 "97,3 %", 5 Kinder
- x458 y107 394x284 "97,3 %", 5 Kinder

## Mobil (390x844)

Root: display flex column, Innenabstand 0px, Abstand normal, Hintergrund rgb(217, 228, 232).

Hauptblöcke (Kinder des Root):
- <div> x-60 y-170 500x380, absolute/block, 0 Kinder
- <div> x0 y0 390x64, relative/flex, 4 Kinder – "CENTRIC"
- <div> x0 y64 390x66, relative/block, 2 Kinder – "Guten Morgen, Tobias"
- <div> x0 y130 390x649, relative/flex, 5 Kinder – "Spätdienst"
- <div> x0 y779 390x72, relative/flex, 4 Kinder – "Heute"

Karten:
- x18 y146 354x195 "Spätdienst", 5 Kinder
- x18 y355 116x46 "Tausch", 1 Kinder
- x142 y355 109x46 "Krank", 1 Kinder
- x259 y355 113x46 "Urlaub", 1 Kinder
- x18 y437 354x227 "Mi", 5 Kinder
- x18 y678 354x87 "+18,5 h", 2 Kinder

## Lagebild (1440x980)

Root: display flex row, Innenabstand 28px, Abstand normal, Hintergrund rgb(217, 228, 232).

Hauptblöcke (Kinder des Root):
- <div> x28 y28 1384x924, relative/flex, 4 Kinder – "Lagebild"

Karten:
- x28 y28 1384x924 "Lagebild", 4 Kinder
  - x162 y37 562x44 "Im Dienst", 6 Kinder
  - x59 y168 431x207 "11", 4 Kinder, Spaltenspanne "span 4" (Eltern-Grid: 12 Spalten à ca. 97px)
    (+2 gleich große Karten: x504 y168 "9"; x950 y168 "3")
  - x59 y389 877x340 "Jetzt im Dienst", 5 Kinder, Spaltenspanne "span 8" (Eltern-Grid: 12 Spalten à ca. 97px)
  - x950 y389 431x340 "Achtungspunkte", 6 Kinder, Spaltenspanne "span 4" (Eltern-Grid: 12 Spalten à ca. 97px)

## Zeitachse (1440x980)

Root: display flex row, Innenabstand 28px, Abstand normal, Hintergrund rgb(217, 228, 232).

Hauptblöcke (Kinder des Root):
- <div> x28 y28 1384x924, relative/flex, 4 Kinder – "Zeitachse"

Karten:
- x28 y28 1384x924 "Zeitachse", 4 Kinder
  - x162 y37 562x44 "Im Dienst", 6 Kinder
  - x59 y168 1322x483 "Besetzung im Tagesverlauf", 4 Kinder
  - x59 y665 648x64 "Deckungslücke 22:00 – 23:00 Uhr", 3 Kinder
  - x721 y665 660x64 "Übergabefenster nur 15 Minuten", 3 Kinder

## Uebergabe (1440x980)

Root: display flex row, Innenabstand 28px, Abstand normal, Hintergrund rgb(217, 228, 232).

Hauptblöcke (Kinder des Root):
- <div> x28 y28 1384x924, relative/flex, 4 Kinder – "Übergabe"

Karten:
- x28 y28 1384x924 "Übergabe", 4 Kinder
  - x162 y37 562x44 "Im Dienst", 6 Kinder
  - x59 y168 877x113 "Lage und Besonderheiten", 2 Kinder
  - x59 y294 877x134 "Offene Aufgaben", 2 Kinder
  - x59 y440 877x113 "Besondere Vorkommnisse", 2 Kinder
  - x59 y565 877x134 "Material und Betriebsmittel", 2 Kinder
  - x950 y168 431x182 "Übergabe an", 3 Kinder
    - x967 y212 397x54 "Brandt, Miriam", 2 Kinder
  - x950 y362 431x161 "Vor dem Absenden", 5 Kinder
  - x950 y535 431x121 "Letzte Übergabe", 3 Kinder
  - x950 y669 431x66 "Übergaben bleiben 24 Monate abrufbar — § 16 Abs. 2 ArbZG und", 1 Kinder

## Monatsplan (1440x980)

Root: display flex row, Innenabstand 28px, Abstand normal, Hintergrund rgb(217, 228, 232).

Hauptblöcke (Kinder des Root):
- <div> x28 y28 1384x924, relative/flex, 5 Kinder – "CENTRIC"

Karten:
- x28 y28 1384x924 "CENTRIC", 5 Kinder
  - x172 y38 338x48 "Planen", 6 Kinder
  - x57 y113 201x40 "September 2026", 3 Kinder
  - x952 y113 225x40 "Monat", 3 Kinder
  - x57 y197 1326x519 "1", 14 Kinder
  - x57 y730 1326x43 "Regelprüfung", 8 Kinder

## Jahresansicht (1440x980)

Root: display flex row, Innenabstand 28px, Abstand normal, Hintergrund rgb(217, 228, 232).

Hauptblöcke (Kinder des Root):
- <div> x28 y28 1384x924, relative/flex, 4 Kinder – "Jahresansicht"

Karten:
- x28 y28 1384x924 "Jahresansicht", 4 Kinder
  - x162 y37 560x44 "Planen", 6 Kinder
  - x59 y168 367x106 "21", 4 Kinder
  - x440 y168 318x106 "5", 4 Kinder
  - x772 y168 303x106 "+18,5 h", 4 Kinder
  - x1089 y168 292x106 "24", 4 Kinder
  - x59 y288 1322x635 "Das ganze Jahr auf einen Blick", 3 Kinder

## Personaleinsatz (1440x980)

Root: display flex row, Innenabstand 28px, Abstand normal, Hintergrund rgb(217, 228, 232).

Hauptblöcke (Kinder des Root):
- <div> x28 y28 1384x924, relative/flex, 4 Kinder – "Personaleinsatz"

Karten:
- x28 y28 1384x924 "Personaleinsatz", 4 Kinder
  - x162 y37 560x44 "Planen", 6 Kinder
  - x59 y168 248x755 "Wohnbereich Nord", 4 Kinder
    (+3 gleich große Karten: x319 y168 "Wohnbereich Süd"; x579 y168 "Wohnbereich West"; x839 y168 "Springerpool")
  - x1101 y168 280x755 "Verfügbar heute", 4 Kinder
    - x1118 y313 246x44 "Mertens, Frank", 3 Kinder
    - x1118 y365 246x56 "Peters, Max", 3 Kinder
    - x1118 y429 246x44 "Krause, Ines", 3 Kinder
    - x1118 y481 246x56 "Timm, Anja", 3 Kinder
      (+2 gleich große Karten: x1118 y545 "Vogel, Jana"; x1118 y609 "Seidel, Tim")
    - x1118 y834 246x72 "Die Reihenfolge ist ein Vorschlag. Entscheiden tut ein Mensc", 0 Kinder

## Selbstplanung (1440x980)

Root: display flex row, Innenabstand 28px, Abstand normal, Hintergrund rgb(217, 228, 232).

Hauptblöcke (Kinder des Root):
- <div> x28 y28 1384x924, relative/flex, 4 Kinder – "Selbstplanung"

Karten:
- x28 y28 1384x924 "Selbstplanung", 4 Kinder
  - x162 y37 560x44 "Planen", 6 Kinder
  - x59 y168 1322x62 "Vorbereitet", 4 Kinder
  - x59 y244 988x679 "Bedarf und Wünsche im Oktober", 3 Kinder
    - x78 y850 950x56 "An fünf Tagen liegen mehr Absagen als Bedarf vor — vorwiegen", 3 Kinder
  - x1061 y244 320x141 "41", 4 Kinder
  - x1061 y399 320x524 "Noch nicht eingetragen", 8 Kinder

## Schichtfolge (1440x980)

Root: display flex row, Innenabstand 28px, Abstand normal, Hintergrund rgb(217, 228, 232).

Hauptblöcke (Kinder des Root):
- <div> x28 y28 1384x924, relative/flex, 4 Kinder – "Schichtfolge"

Karten:
- x28 y28 1384x924 "Schichtfolge", 4 Kinder
  - x162 y37 560x44 "Planen", 6 Kinder
  - x59 y168 380x85 "Dreischicht rollierend", 2 Kinder
    (+3 gleich große Karten: x59 y263 "Früh und Spät im Wechsel"; x59 y358 "Dauernachtwache"; x59 y453 "Teilzeit 60 Prozent")
  - x59 y548 380x64 "Ein Muster beschreibt nur die Abfolge. Wer es bekommt, entsc", 0 Kinder
  - x453 y168 928x755 "Dreischicht rollierend", 5 Kinder
    - x472 y564 214x103 "11,5 Std", 3 Kinder
      (+3 gleich große Karten: x698 y564 "33 %"; x923 y564 "8 je 6 Wochen"; x1149 y564 "38,5 h")

## Antraege (1440x980)

Root: display flex row, Innenabstand 28px, Abstand normal, Hintergrund rgb(217, 228, 232).

Hauptblöcke (Kinder des Root):
- <div> x28 y28 1384x924, relative/flex, 4 Kinder – "Anträge"

Karten:
- x28 y28 1384x924 "Anträge", 4 Kinder
  - x162 y37 564x44 "Zu entscheiden", 6 Kinder
  - x59 y216 968x109 "Kern, Andrea", 2 Kinder
    (+3 gleich große Karten: x59 y337 "Vogel, Jana"; x59 y458 "Sadiku, Elira"; x59 y579 "Seidel, Tim")
  - x59 y700 968x46 "Genehmigte Abwesenheiten wirken sofort im Plan. Wird dadurch", 0 Kinder
  - x1041 y168 340x755 "9 Tage", 5 Kinder
    - x1060 y253 147x75 "9 Tage", 3 Kinder
    - x1217 y253 145x75 "8", 3 Kinder
    - x1060 y464 302x96 "Zwei Tage werden eng", 2 Kinder

## OffeneSchichten (1440x980)

Root: display flex row, Innenabstand 28px, Abstand normal, Hintergrund rgb(217, 228, 232).

Hauptblöcke (Kinder des Root):
- <div> x28 y28 1384x924, relative/flex, 4 Kinder – "Offene Schichten"

Karten:
- x28 y28 1384x924 "Offene Schichten", 4 Kinder
  - x162 y37 564x44 "Zu entscheiden", 6 Kinder
  - x59 y168 520x76 "30", 4 Kinder
    (+4 gleich große Karten: x59 y254 "1"; x59 y340 "3"; x59 y426 "4"; x59 y512 "6")
  - x59 y598 520x64 "Eine angefragte Person sagt zu oder ab. Erst mit der Zusage", 0 Kinder
  - x593 y168 788x755 "Nachtdienst · Mittwoch, 30. September", 4 Kinder
    - x612 y316 750x58 "Mertens, Frank", 5 Kinder
      (+5 gleich große Karten: x612 y383 "Peters, Max"; x612 y450 "Berger, Nina"; x612 y517 "Öztürk, Derya"; x612 y584 "Vogel, Jana"; x612 y651 "Seidel, Tim")
    - x612 y844 750x61 "Gesperrte Vorschläge lassen sich nicht übergehen: Ruhezeit u", 2 Kinder

## Notrufe (1440x980)

Root: display flex row, Innenabstand 28px, Abstand normal, Hintergrund rgb(217, 228, 232).

Hauptblöcke (Kinder des Root):
- <div> x28 y28 1384x924, relative/flex, 4 Kinder – "Notrufe"

Karten:
- x28 y28 1384x924 "Notrufe", 4 Kinder
  - x162 y37 564x44 "Zu entscheiden", 6 Kinder
  - x59 y168 990x162 "Hilfe angefordert", 2 Kinder
    - x910 y189 117x40 "Übernehmen", 0 Kinder
    - x81 y243 229x67 "Sofort", 3 Kinder
      (+3 gleich große Karten: x320 y243 "Nach 30 Sekunden"; x559 y243 "Nach 90 Sekunden"; x798 y243 "Nach 3 Minuten")
  - x59 y343 990x580 "Verlauf", 8 Kinder
  - x1063 y168 318x313 "Eskalationskette", 5 Kinder
  - x1063 y494 318x189 "Sieben Tage im Rückblick", 5 Kinder
  - x1063 y696 318x117 "24 s", 3 Kinder

## Dienstbuch (1440x980)

Root: display flex row, Innenabstand 28px, Abstand normal, Hintergrund rgb(217, 228, 232).

Hauptblöcke (Kinder des Root):
- <div> x28 y28 1384x924, relative/flex, 4 Kinder – "Dienstbuch"

Karten:
- x28 y28 1384x924 "Dienstbuch", 4 Kinder
  - x162 y37 564x44 "Zu entscheiden", 6 Kinder
  - x59 y168 990x755 "Im Dienstbuch suchen", 5 Kinder
  - x1063 y168 318x259 "Kategorien", 7 Kinder
  - x1063 y440 318x199 "Ausgabe", 4 Kinder
    - x1080 y482 284x40 "Zeitraum als PDF", 2 Kinder
      (+2 gleich große Karten: x1080 y532 "Tabelle für die Prüfung"; x1080 y582 "Einzelner Tag zum Drucken")
  - x1063 y652 318x83 "Einträge sind nach dem Absenden fest. Korrekturen entstehen", 1 Kinder

## Personal (1440x980)

Root: display flex row, Innenabstand 28px, Abstand normal, Hintergrund rgb(217, 228, 232).

Hauptblöcke (Kinder des Root):
- <div> x28 y28 1384x924, relative/flex, 4 Kinder – "Personal"

Karten:
- x28 y28 1384x924 "Personal", 4 Kinder
  - x162 y37 564x44 "Wer mitfährt", 6 Kinder
  - x59 y168 988x755 "Person suchen", 4 Kinder
    - x70 y454 966x44 "Kern, Andrea", 7 Kinder
  - x1061 y168 320x273 "80 %", 4 Kinder
    - x1173 y242 103x54 "+18,5 h", 2 Kinder
  - x1061 y454 320x469 "Zusammensetzung", 7 Kinder
    - x1078 y848 286x59 "Fachkraftquote 54 % — die Landesvorgabe von 50 % ist eingeha", 0 Kinder

## Qualifikationen (1440x980)

Root: display flex row, Innenabstand 28px, Abstand normal, Hintergrund rgb(217, 228, 232).

Hauptblöcke (Kinder des Root):
- <div> x28 y28 1384x924, relative/flex, 4 Kinder – "Qualifikationen"

Karten:
- x28 y28 1384x924 "Qualifikationen", 4 Kinder
  - x162 y37 564x44 "Wer mitfährt", 6 Kinder
  - x59 y168 1008x755 "Wohnbereich Nord und Süd", 4 Kinder
    - x68 y792 990x40 "Abdeckung", 9 Kinder
  - x1081 y168 300x218 "Vorbehaltene Aufgaben", 3 Kinder
    - x1098 y296 266x74 "Jede Schicht gedeckt", 2 Kinder
  - x1081 y400 300x523 "Handlungsbedarf", 5 Kinder

## Nachweise (1440x980)

Root: display flex row, Innenabstand 28px, Abstand normal, Hintergrund rgb(217, 228, 232).

Hauptblöcke (Kinder des Root):
- <div> x28 y28 1384x924, relative/flex, 4 Kinder – "Nachweise"

Karten:
- x28 y28 1384x924 "Nachweise", 4 Kinder
  - x162 y37 564x44 "Wer mitfährt", 6 Kinder
  - x59 y168 317x77 "2", 2 Kinder
  - x390 y168 304x77 "5", 2 Kinder
    (+1 gleich große Karten: x708 y168 "13")
  - x1026 y168 355x77 "184", 2 Kinder
  - x59 y259 1008x664 "Nach Dringlichkeit", 3 Kinder
    - x70 y355 986x47 "Öztürk, Derya", 6 Kinder
      (+8 gleich große Karten: x70 y403 "Krause, Ines"; x70 y451 "Seidel, Tim"; x70 y499 "Kern, Andrea"; x70 y547 "Weiß, Carola"; x70 y595 "Hoffmann, Lars"; x70 y643 "Adler, Antje"; x70 y691 "Nowak, Piotr"; x70 y739 "Lang, Sonja")
  - x1081 y259 300x215 "Ablauf über zwölf Monate", 3 Kinder
  - x1081 y487 300x436 "Erinnerungen", 5 Kinder
    - x1098 y531 266x50 "90 Tage vorher", 2 Kinder
      (+2 gleich große Karten: x1098 y593 "30 Tage vorher"; x1098 y655 "Am Ablauftag")
    - x1098 y850 266x57 "Läuft ein Pflichtnachweis ab, sperrt CENTRIC die betroffenen", 0 Kinder

## Pruefung (1440x980)

Root: display flex row, Innenabstand 28px, Abstand normal, Hintergrund rgb(217, 228, 232).

Hauptblöcke (Kinder des Root):
- <div> x28 y28 1384x924, relative/flex, 4 Kinder – "Prüfung"

Karten:
- x28 y28 1384x924 "Prüfung", 4 Kinder
  - x162 y37 562x44 "Nachsehen", 6 Kinder
  - x59 y168 312x80 "2", 2 Kinder
  - x385 y168 345x80 "5", 2 Kinder
  - x745 y168 285x80 "9", 2 Kinder
  - x1044 y168 337x80 "1.842", 2 Kinder
  - x59 y262 996x661 "Befunde", 7 Kinder
    - x78 y326 958x83 "Ruhezeit unterschritten", 3 Kinder
    - x78 y422 958x76 "Ruhezeit unterschritten", 3 Kinder
    - x78 y511 958x83 "Höchstarbeitszeit im Ausgleich überschritten", 3 Kinder
    - x78 y607 958x76 "Elf Dienste in Folge", 3 Kinder
      (+1 gleich große Karten: x78 y696 "Sonntagsruhe knapp")
    - x78 y785 958x83 "Pausenlage unklar", 3 Kinder
  - x1069 y262 312x252 "Was geprüft wurde", 8 Kinder
  - x1069 y527 312x396 "Vor der Freigabe", 4 Kinder
    - x1086 y653 278x73 "2 harte Verstöße offen", 2 Kinder
    - x1086 y832 278x74 "Der Regelstand ist versioniert. Ändert sich eine Vorschrift,", 0 Kinder

## Untergrenzen (1440x980)

Root: display flex row, Innenabstand 28px, Abstand normal, Hintergrund rgb(217, 228, 232).

Hauptblöcke (Kinder des Root):
- <div> x28 y28 1384x924, relative/flex, 4 Kinder – "Untergrenzen"

Karten:
- x28 y28 1384x924 "Untergrenzen", 4 Kinder
  - x162 y37 562x44 "Nachsehen", 6 Kinder
  - x59 y168 321x80 "4", 2 Kinder
  - x394 y168 323x80 "1", 2 Kinder
  - x731 y168 288x80 "1", 2 Kinder
  - x1033 y168 348x80 "4", 2 Kinder
  - x59 y262 968x661 "Pflegesensitive Bereiche · PpUGV", 4 Kinder
    - x70 y340 946x53 "1 : 9,4", 5 Kinder
      (+5 gleich große Karten: x70 y394 "1 : 1,8"; x70 y448 "1 : 9,8"; x70 y502 "1 : 10,6"; x70 y556 "1 : 9,1"; x70 y610 "—")
    - x78 y844 930x62 "Nicht bewertbar", 2 Kinder
  - x1041 y262 340x324 "Psychiatrie · PPP-RL", 5 Kinder
    - x1058 y493 306x76 "Der Pflegedienst liegt bei 88 % — zwei Punkte unter der Mind", 0 Kinder
  - x1041 y599 340x324 "Schichten im Monat", 4 Kinder

## Belastung (1440x980)

Root: display flex row, Innenabstand 28px, Abstand normal, Hintergrund rgb(217, 228, 232).

Hauptblöcke (Kinder des Root):
- <div> x28 y28 1384x924, relative/flex, 4 Kinder – "Belastung"

Karten:
- x28 y28 1384x924 "Belastung", 4 Kinder
  - x162 y37 562x44 "Nachsehen", 6 Kinder
  - x59 y168 978x755 "Nach Belastung sortiert", 4 Kinder
    - x70 y248 956x47 "82", 6 Kinder
      (+11 gleich große Karten: x70 y296 "74"; x70 y344 "61"; x70 y392 "58"; x70 y440 "52"; x70 y488 "47"; x70 y536 "39"; x70 y584 "34"; x70 y632 "31" …)
    - x78 y848 940x58 "Zwei Personen liegen deutlich über dem Üblichen. CENTRIC sch", 3 Kinder
  - x1051 y168 330x176 "Verteilung im Betrieb", 3 Kinder
  - x1051 y357 330x219 "Was die Stufen bedeuten", 4 Kinder
  - x1051 y590 330x333 "Keine Leistungskontrolle", 3 Kinder

## Abrechnung (1440x980)

Root: display flex row, Innenabstand 28px, Abstand normal, Hintergrund rgb(217, 228, 232).

Hauptblöcke (Kinder des Root):
- <div> x28 y28 1384x924, relative/flex, 4 Kinder – "Abrechnungsdaten"

Karten:
- x28 y28 1384x924 "Abrechnungsdaten", 4 Kinder
  - x162 y37 562x44 "Nachsehen", 6 Kinder
  - x59 y168 978x755 "Zuschlagspflichtige Stunden", 5 Kinder
    - x68 y764 960x44 "Summe aller 57 Beschäftigten", 6 Kinder
    - x78 y864 940x42 "Der Monat ist freigegeben und regelgeprüft. Nachträgliche Än", 2 Kinder
  - x1051 y168 330x289 "Hinterlegte Sätze", 6 Kinder
    - x1068 y368 296x72 "Sätze und Grenzen kommen aus dem gewählten Tarifwerk. Abweic", 0 Kinder
  - x1051 y470 330x211 "Übergabeformat", 4 Kinder
    - x1068 y512 296x44 "DATEV Lohn und Gehalt", 2 Kinder
      (+2 gleich große Karten: x1068 y566 "Tabelle zur Kontrolle"; x1068 y620 "Monatsnachweis je Person")
  - x1051 y694 330x229 "Nur Zahlen, keine Gründe", 3 Kinder

## Betrieb (1440x980)

Root: display flex row, Innenabstand 28px, Abstand normal, Hintergrund rgb(217, 228, 232).

Hauptblöcke (Kinder des Root):
- <div> x28 y28 1384x924, relative/flex, 4 Kinder – "Betrieb"

Karten:
- x28 y28 1384x924 "Betrieb", 4 Kinder
  - x162 y37 563x44 "Im Dienst", 6 Kinder
  - x59 y168 543x376 "Stammdaten", 5 Kinder, Spaltenspanne "span 5" (Eltern-Grid: 12 Spalten à ca. 97px)
  - x616 y168 765x376 "Einheiten", 6 Kinder, Spaltenspanne "span 7" (Eltern-Grid: 12 Spalten à ca. 97px)
    - x634 y214 729x52 "Wohnbereich Nord", 5 Kinder
      (+4 gleich große Karten: x634 y279 "Wohnbereich Süd"; x634 y344 "Wohnbereich West"; x634 y409 "Tagespflege"; x634 y474 "Springerpool")
  - x59 y558 543x329 "Regelwerk und Tarif", 5 Kinder, Spaltenspanne "span 5" (Eltern-Grid: 12 Spalten à ca. 97px)
    - x77 y604 507x52 "Branchenprofil", 2 Kinder
      (+3 gleich große Karten: x77 y669 "Tarifwerk"; x77 y734 "Ausgleichszeitraum"; x77 y799 "Regelstand")
  - x616 y558 431x329 "Zugänge", 8 Kinder, Spaltenspanne "span 4" (Eltern-Grid: 12 Spalten à ca. 97px)
    - x634 y814 395x55 "Zugangscodes werden nur als Prüfsumme gespeichert und lassen", 0 Kinder
  - x1061 y558 320x329 "Pflege", 4 Kinder, Spaltenspanne "span 3" (Eltern-Grid: 12 Spalten à ca. 97px)

## Dienstarten (1440x980)

Root: display flex row, Innenabstand 28px, Abstand normal, Hintergrund rgb(217, 228, 232).

Hauptblöcke (Kinder des Root):
- <div> x28 y28 1384x924, relative/flex, 4 Kinder – "Dienstarten"

Karten:
- x28 y28 1384x924 "Dienstarten", 4 Kinder
  - x162 y37 563x44 "Im Dienst", 6 Kinder
  - x59 y168 978x416 "Dienste", 3 Kinder
    - x70 y246 956x45 "Frühdienst", 7 Kinder
      (+6 gleich große Karten: x70 y292 "Spätdienst"; x70 y338 "Nachtdienst"; x70 y384 "Zwischendienst"; x70 y430 "Tagespflege"; x70 y476 "Bereitschaftsdienst"; x70 y522 "Rufbereitschaft")
  - x59 y597 978x326 "Abwesenheiten", 2 Kinder
    - x78 y642 139x47 "U", 2 Kinder
      (+2 gleich große Karten: x226 y642 "K"; x374 y642 "S")
    - x522 y642 156x47 "A", 2 Kinder
    - x687 y642 139x47 "X", 2 Kinder
    - x835 y642 151x47 "F", 2 Kinder
  - x1051 y168 330x755 "Frühdienst", 6 Kinder
    - x1069 y831 294x74 "Änderungen gelten ab dem nächsten unveröffentlichten Monat.", 0 Kinder

## Datenschutz (1440x980)

Root: display flex row, Innenabstand 28px, Abstand normal, Hintergrund rgb(217, 228, 232).

Hauptblöcke (Kinder des Root):
- <div> x28 y28 1384x924, relative/flex, 4 Kinder – "Datenschutz"

Karten:
- x28 y28 1384x924 "Datenschutz", 4 Kinder
  - x162 y37 563x44 "Im Dienst", 6 Kinder
  - x59 y168 978x444 "Aufbewahrung und Löschung", 3 Kinder
    - x70 y246 956x69 "Plandaten und Arbeitszeiten", 4 Kinder
      (+4 gleich große Karten: x70 y316 "Stammdaten Ausgetretener"; x70 y386 "Gesundheitsbezogene Freitexte"; x70 y456 "Zugriffsprotokoll"; x70 y526 "Anträge und Entscheidungen")
  - x59 y625 680x337 "1. September", 6 Kinder
    - x78 y887 642x59 "Anonymisieren heißt hier: Der Name verschwindet, der Dienstp", 0 Kinder
  - x752 y625 285x337 "Betroffenenrechte", 5 Kinder
    - x771 y668 247x61 "Auskunft erteilen", 3 Kinder
      (+3 gleich große Karten: x771 y740 "Daten mitgeben"; x771 y812 "Berichtigung eintragen"; x771 y884 "Löschung prüfen")
  - x1051 y168 330x291 "Besonders geschützt", 5 Kinder
  - x1051 y472 330x193 "Zugriffsprotokoll", 4 Kinder
  - x1051 y679 330x284 "Unterlagen", 6 Kinder

## Ablauf (1440x980)

Root: display flex row, Innenabstand 28px, Abstand normal, Hintergrund rgb(217, 228, 232).

Hauptblöcke (Kinder des Root):
- <div> x28 y28 1384x924, relative/flex, 4 Kinder – "Ablauf"

Karten:
- x28 y28 1384x924 "Ablauf", 4 Kinder
  - x162 y37 562x44 "Im Dienst", 6 Kinder
  - x59 y168 232x92 "6 / 6", 3 Kinder
    (+2 gleich große Karten: x304 y168 "6"; x549 y168 "0")
  - x794 y168 587x92 "„Erledigt“ heißt nur, dass eine Station überhaupt einen Stan", 2 Kinder
  - x59 y273 1322x165 "Der Betriebsablauf in sechs Stationen", 2 Kinder
    - x78 y318 197x103 "1. Betrieb einrichten", 3 Kinder
      (+5 gleich große Karten: x295 y318 "2. Personal anlegen"; x513 y318 "3. Qualifikationen zuordnen"; x730 y318 "4. Schichtfolge festlegen"; x947 y318 "5. Plan prüfen und freigeben"; x1165 y318 "6. Laufender Betrieb")
  - x59 y451 749x472 "Plan prüfen und freigeben", 5 Kinder
  - x821 y451 560x472 "Alle Stationen im Einzelnen", 7 Kinder

## Handbuch (1440x980)

Root: display flex row, Innenabstand 28px, Abstand normal, Hintergrund rgb(217, 228, 232).

Hauptblöcke (Kinder des Root):
- <div> x28 y28 1384x924, relative/flex, 4 Kinder – "Handbuch"

Karten:
- x28 y28 1384x924 "Handbuch", 4 Kinder
  - x162 y37 562x44 "Im Dienst", 6 Kinder
  - x59 y168 360x40 "", 0 Kinder
  - x59 y221 300x578 "Bevor es losgeht", 11 Kinder
  - x373 y221 730x702 "Der laufende Betrieb", 3 Kinder
    - x400 y578 676x57 "Unter dem markierten Antrag stehen Urlaubsrest, Stundenkonto", 2 Kinder
    - x400 y648 676x61 "Wer täglich vierzig Anträge entscheidet, sollte die Tastatur", 1 Kinder
  - x1117 y221 264x99 "53 %", 3 Kinder
  - x1117 y333 264x314 "In diesem Kapitel", 8 Kinder
  - x1117 y660 264x119 "Die Suche versteht keine ganzen Sätze. Sie sucht ab zwei Zei", 2 Kinder

## Hilfe (1440x980)

Root: display flex row, Innenabstand 28px, Abstand normal, Hintergrund rgb(217, 228, 232).

Hauptblöcke (Kinder des Root):
- <div> x28 y28 1384x924, relative/flex, 4 Kinder – "Hilfe"

Karten:
- x28 y28 1384x924 "Hilfe", 4 Kinder
  - x162 y37 562x44 "Im Dienst", 6 Kinder
  - x59 y168 856x250 "Selbst nachsehen", 4 Kinder
  - x59 y431 856x492 "Uns fragen", 6 Kinder
  - x929 y168 452x102 "Kontaktadresse noch nicht gesetzt.", 2 Kinder
  - x929 y284 452x212 "Was jede E-Mail mitbringt", 3 Kinder
    - x946 y353 418x126 "Seniorenzentrum Lindenhof", 4 Kinder
  - x929 y509 452x414 "Häufige Fragen aus der Einführung", 6 Kinder

## Bereitschaft (1440x980)

Root: display flex row, Innenabstand 28px, Abstand normal, Hintergrund rgb(217, 228, 232).

Hauptblöcke (Kinder des Root):
- <div> x28 y28 1384x924, relative/flex, 4 Kinder – "Bereitschaft"

Karten:
- x28 y28 1384x924 "Bereitschaft", 4 Kinder
  - x162 y37 560x44 "Planen", 6 Kinder
  - x59 y168 1002x547 "Die nächsten 21 Tage", 4 Kinder
    - x144 y215 123x153 "Di 29.09.", 3 Kinder
      (+6 gleich große Karten: x273 y215 "Mi 30.09."; x402 y215 "Do 01.10."; x531 y215 "Fr 02.10."; x661 y215 "Sa 03.10."; x790 y215 "So 04.10."; x919 y215 "Mo 05.10.")
    - x144 y380 123x153 "Di 06.10.", 3 Kinder
      (+6 gleich große Karten: x273 y380 "Mi 07.10."; x402 y380 "Do 08.10."; x531 y380 "Fr 09.10."; x661 y380 "Sa 10.10."; x790 y380 "So 11.10."; x919 y380 "Mo 12.10.")
    - x144 y545 123x153 "Di 13.10.", 3 Kinder
      (+6 gleich große Karten: x273 y545 "Mi 14.10."; x402 y545 "Do 15.10."; x531 y545 "Fr 16.10."; x661 y545 "Sa 17.10."; x790 y545 "So 18.10."; x919 y545 "Mo 19.10.")
  - x1075 y168 306x265 "Was aufs Konto zählt", 4 Kinder
  - x1075 y446 306x177 "Ausgestaltung der Dienstarten", 3 Kinder
    - x1092 y488 272x54 "Rufbereitschaft Pflege", 2 Kinder
      (+1 gleich große Karten: x1092 y552 "Rufbereitschaft Leitung")
  - x1075 y636 306x236 "Rufbereitschaft Leitung: Abrufzeit 15 Minuten", 3 Kinder

## Sondereinsaetze (1440x980)

Root: display flex row, Innenabstand 28px, Abstand normal, Hintergrund rgb(217, 228, 232).

Hauptblöcke (Kinder des Root):
- <div> x28 y28 1384x924, relative/flex, 4 Kinder – "Sondereinsätze"

Karten:
- x28 y28 1384x924 "Sondereinsätze", 4 Kinder
  - x162 y37 560x44 "Planen", 6 Kinder
  - x59 y168 1322x83 "78,0", 5 Kinder
  - x59 y264 916x474 "Einsätze", 3 Kinder
    - x78 y333 878x63 "12", 4 Kinder
      (+5 gleich große Karten: x78 y398 "17"; x78 y463 "4"; x78 y528 "14"; x78 y593 "6"; x78 y658 "28")
  - x989 y264 392x339 "Grippeschutz-Impftag", 4 Kinder
    - x1008 y369 113x53 "5,0 h", 2 Kinder
      (+2 gleich große Karten: x1129 y369 "2"; x1249 y369 "10,0 h")
  - x989 y616 392x99 "Ein Sondereinsatz lässt sich nicht gegen die Ruhezeit prüfen", 2 Kinder

## Tauschboerse (1440x980)

Root: display flex row, Innenabstand 28px, Abstand normal, Hintergrund rgb(217, 228, 232).

Hauptblöcke (Kinder des Root):
- <div> x28 y28 1384x924, relative/flex, 4 Kinder – "Tauschbörse"

Karten:
- x28 y28 1384x924 "Tauschbörse", 4 Kinder
  - x162 y37 564x44 "Zu entscheiden", 6 Kinder
  - x59 y196 968x242 "Freitag, 2. Oktober 2026 · Spätdienst", 4 Kinder
    - x77 y275 932x68 "Berger, Nina", 4 Kinder
      (+1 gleich große Karten: x77 y354 "Weiß, Carola")
  - x59 y450 968x163 "Montag, 5. Oktober 2026 · Nachtdienst", 3 Kinder
    - x77 y529 932x68 "Peters, Max", 4 Kinder
  - x59 y625 968x116 "Samstag, 10. Oktober 2026 · Frühdienst", 2 Kinder
  - x1041 y168 340x257 "So läuft ein Tausch", 4 Kinder
  - x1041 y438 340x319 "Tauschvorgänge", 5 Kinder
  - x1041 y770 340x153 "Rot markierte Meldungen verletzen eine Vorgabe, etwa Ruhezei", 2 Kinder

## Wunschdienste (1440x980)

Root: display flex row, Innenabstand 28px, Abstand normal, Hintergrund rgb(217, 228, 232).

Hauptblöcke (Kinder des Root):
- <div> x28 y28 1384x924, relative/flex, 4 Kinder – "Wunschdienste"

Karten:
- x28 y28 1384x924 "Wunschdienste", 4 Kinder
  - x162 y37 564x44 "Zu entscheiden", 6 Kinder
  - x59 y168 958x755 "Wunschdienste · Nina Berger", 5 Kinder
    - x475 y287 126x82 "·", 3 Kinder, im Grid (7 Spalten à ca. 126px)
      (+30 gleich große Karten: x607 y287 "·"; x739 y287 "+"; x872 y287 "·"; x78 y375 "·"; x210 y375 "·"; x343 y375 "·"; x475 y375 "−"; x607 y375 "·" …)
  - x1031 y168 350x472 "+", 11 Kinder
  - x1031 y653 350x117 "Wünsche sind keine Anträge — es gibt weder Genehmigung noch", 2 Kinder

## SchwarzesBrett (1440x980)

Root: display flex row, Innenabstand 28px, Abstand normal, Hintergrund rgb(217, 228, 232).

Hauptblöcke (Kinder des Root):
- <div> x28 y28 1384x924, relative/flex, 4 Kinder – "Schwarzes Brett"

Karten:
- x28 y28 1384x924 "Schwarzes Brett", 4 Kinder
  - x162 y37 564x44 "Zu entscheiden", 6 Kinder
  - x59 y196 467x210 "Brandschutzübung am 7. Oktober", 5 Kinder, im Grid (467px 467px)
  - x540 y196 467x190 "Dienstplan Oktober ist freigegeben", 5 Kinder, im Grid (467px 467px)
    (+3 gleich große Karten: x59 y420 "Fortbildung Hygiene am 14. Okt"; x540 y420 "Parkplatz am Hintereingang ges"; x59 y624 "Sommerfest am 12. September")
  - x540 y624 467x104 "Ein Aushang erreicht alle im Betrieb, nicht einzelne Persone", 2 Kinder, im Grid (467px 467px)
  - x1021 y168 360x412 "Aushang verfassen", 5 Kinder
    - x1040 y303 322x116 "Am 11. November, 14:00 bis 17:00 Uhr. Eingeladen sind alle,", 0 Kinder
  - x1021 y593 360x246 "Wo Aushänge erscheinen", 4 Kinder

## Kompetenzen (1440x980)

Root: display flex row, Innenabstand 28px, Abstand normal, Hintergrund rgb(217, 228, 232).

Hauptblöcke (Kinder des Root):
- <div> x28 y28 1384x924, relative/flex, 4 Kinder – "Kompetenzen"

Karten:
- x28 y28 1384x924 "Kompetenzen", 4 Kinder
  - x162 y37 564x44 "Wer mitfährt", 6 Kinder
  - x59 y168 320x90 "5", 3 Kinder
    (+3 gleich große Karten: x393 y168 "2"; x727 y168 "4"; x1061 y168 "3")
  - x59 y272 938x551 "Übersicht", 6 Kinder
  - x1011 y272 370x401 "Vorbehaltene Aufgaben", 5 Kinder
  - x1011 y686 370x117 "Eine Kompetenz sperrt nur den Dienst, an dem sie hinterlegt", 2 Kinder

## Einarbeitung (1440x980)

Root: display flex row, Innenabstand 28px, Abstand normal, Hintergrund rgb(217, 228, 232).

Hauptblöcke (Kinder des Root):
- <div> x28 y28 1384x924, relative/flex, 4 Kinder – "Einarbeitung"

Karten:
- x28 y28 1384x924 "Einarbeitung", 4 Kinder
  - x162 y37 564x44 "Wer mitfährt", 6 Kinder
  - x59 y168 234x80 "4", 2 Kinder
    (+3 gleich große Karten: x307 y168 "3"; x555 y168 "1"; x803 y168 "20")
  - x59 y262 978x432 "Laufende Einarbeitungen", 3 Kinder
    - x70 y340 956x84 "Berger, Nina", 2 Kinder
      (+3 gleich große Karten: x70 y425 "Roth, Hanna"; x70 y509 "Timm, Anja"; x70 y594 "Peters, Max")
  - x59 y708 978x62 "Begleitet", 2 Kinder
  - x1051 y168 330x473 "Einarbeitung anlegen", 7 Kinder
    - x1068 y377 296x72 "Beide gehören verschiedenen Wohnbereichen an. Sie werden dad", 2 Kinder
  - x1051 y655 330x233 "Was die Farben bedeuten", 4 Kinder

## Verteilung (1440x980)

Root: display flex row, Innenabstand 28px, Abstand normal, Hintergrund rgb(217, 228, 232).

Hauptblöcke (Kinder des Root):
- <div> x28 y28 1384x924, relative/flex, 4 Kinder – "Belastungsverteilung"

Karten:
- x28 y28 1384x924 "Belastungsverteilung", 4 Kinder
  - x162 y37 564x44 "Wer mitfährt", 6 Kinder
  - x59 y168 232x92 "74 %", 2 Kinder
    (+3 gleich große Karten: x305 y168 "11"; x550 y168 "6"; x796 y168 "36")
  - x59 y274 968x635 "Nach Wochenendnächten und Feiertagen sortiert", 4 Kinder
    - x70 y360 946x43 "11", 7 Kinder
      (+10 gleich große Karten: x70 y404 "10"; x70 y448 "9"; x70 y492 "9"; x70 y536 "8"; x70 y580 "7"; x70 y624 "6"; x70 y668 "5"; x70 y712 "5" …)
  - x1041 y168 340x371 "Wochenendnächte je Person", 3 Kinder
  - x1041 y552 340x182 "So lesen Sie die Farben", 4 Kinder
  - x1041 y747 340x176 "Rohzählung, keine Wertung", 2 Kinder

## Betriebsmittel (1440x980)

Root: display flex row, Innenabstand 28px, Abstand normal, Hintergrund rgb(217, 228, 232).

Hauptblöcke (Kinder des Root):
- <div> x28 y28 1384x924, relative/flex, 4 Kinder – "Betriebsmittel"

Karten:
- x28 y28 1384x924 "Betriebsmittel", 4 Kinder
  - x162 y37 564x44 "Wer mitfährt", 6 Kinder
  - x59 y168 184x80 "11", 2 Kinder
    (+4 gleich große Karten: x257 y168 "10"; x456 y168 "6"; x654 y168 "2"; x853 y168 "2")
  - x59 y262 978x618 "Wer hat was, seit wann", 3 Kinder
    - x70 y336 956x47 "Generalschlüssel Haupthaus", 5 Kinder
      (+10 gleich große Karten: x70 y384 "Stationsschlüssel Wohnbereich "; x70 y432 "Stationsschlüssel Wohnbereich "; x70 y480 "Stationsschlüssel Wohnbereich "; x70 y528 "Schlüssel Medikamentenraum"; x70 y576 "Zweitschlüssel Nachtdienst"; x70 y624 "Kleinbus Ausflugsfahrten"; x70 y672 "Pkw Springerdienst"; x70 y720 "Diensthandy Nachtdienst Nord" …)
  - x1051 y168 330x302 "Ausgabe per Ziehen", 2 Kinder
  - x1051 y483 330x169 "Nach Art", 6 Kinder
  - x1051 y665 330x258 "Was die Liste nicht weiß", 3 Kinder

## Lenkzeiten (1440x980)

Root: display flex row, Innenabstand 28px, Abstand normal, Hintergrund rgb(217, 228, 232).

Hauptblöcke (Kinder des Root):
- <div> x28 y28 1384x924, relative/flex, 4 Kinder – "Lenkzeiten · 21.09. bis 27.09."

Karten:
- x28 y28 1384x924 "Lenkzeiten · 21.09. bis 27.09.", 4 Kinder
  - x162 y37 562x44 "Nachsehen", 6 Kinder
  - x59 y168 320x80 "51,5 h", 2 Kinder
    (+3 gleich große Karten: x393 y168 "3"; x727 y168 "2"; x1061 y168 "1")
  - x59 y262 968x661 "Die Woche", 3 Kinder
    - x70 y336 946x53 "8,5 h", 6 Kinder
    - x70 y390 946x71 "9,5 h", 6 Kinder
    - x70 y462 946x53 "10 h", 6 Kinder
      (+1 gleich große Karten: x70 y516 "9 h")
    - x70 y570 946x67 "9,5 h", 6 Kinder
      (+2 gleich große Karten: x70 y638 "5 h"; x70 y706 "So 27.09.")
  - x1041 y262 340x178 "Doppelwoche", 4 Kinder
    - x1058 y353 306x70 "91,5 Stunden in zwei aufeinanderfolgenden Wochen. Zulässig s", 2 Kinder
  - x1041 y454 340x208 "Wonach gerechnet wird", 5 Kinder
  - x1041 y675 340x248 "Ersetzt kein Kontrollgerät", 3 Kinder

## Belastbarkeit (1440x980)

Root: display flex row, Innenabstand 28px, Abstand normal, Hintergrund rgb(217, 228, 232).

Hauptblöcke (Kinder des Root):
- <div> x28 y28 1384x924, relative/flex, 4 Kinder – "Belastbarkeit"

Karten:
- x28 y28 1384x924 "Belastbarkeit", 4 Kinder
  - x162 y37 562x44 "Nachsehen", 6 Kinder
  - x59 y168 1322x76 "Ab der Woche vom 26.10. verkraftet der Nachtdienst keinen ei", 2 Kinder
  - x59 y258 431x80 "1", 2 Kinder
    (+2 gleich große Karten: x504 y258 "5"; x950 y258 "20")
  - x59 y352 948x571 "Wo bricht es zuerst", 5 Kinder
  - x1021 y352 360x571 "+1", 6 Kinder
    - x1038 y430 326x72 "+1", 2 Kinder
      (+3 gleich große Karten: x1038 y512 "+4"; x1038 y594 "+13"; x1038 y676 "+31")
    - x1038 y813 326x93 "Der Ausfall wird gleichmäßig über die Belegschaft verteilt,", 0 Kinder

## Planstand (1440x980)

Root: display flex row, Innenabstand 28px, Abstand normal, Hintergrund rgb(217, 228, 232).

Hauptblöcke (Kinder des Root):
- <div> x28 y28 1384x924, relative/flex, 4 Kinder – "Planstand · September 2026"

Karten:
- x28 y28 1384x924 "Planstand · September 2026", 4 Kinder
  - x162 y37 562x44 "Nachsehen", 6 Kinder
  - x59 y168 184x97 "11", 3 Kinder
    (+4 gleich große Karten: x257 y168 "3"; x456 y168 "2"; x654 y168 "6"; x853 y168 "2")
  - x59 y279 978x644 "Was sich geändert hat", 4 Kinder
  - x1051 y168 330x216 "26. August", 3 Kinder
  - x1051 y397 330x229 "Nach Art der Änderung", 5 Kinder
    - x1068 y554 296x55 "Kurzfristig heißt: weniger als 14 Tage zwischen heute und de", 0 Kinder
  - x1051 y639 330x284 "Kein Stand vor der Freigabe", 3 Kinder

## Leistungsnachweis (1440x980)

Root: display flex row, Innenabstand 28px, Abstand normal, Hintergrund rgb(217, 228, 232).

Hauptblöcke (Kinder des Root):
- <div> x28 y28 1384x924, relative/flex, 4 Kinder – "Leistungsnachweis"

Karten:
- x28 y28 1384x924 "Leistungsnachweis", 4 Kinder
  - x162 y37 562x44 "Nachsehen", 6 Kinder
  - x59 y168 1322x85 "Wohnbereich Nord", 4 Kinder
  - x59 y267 253x114 "31 Tage", 3 Kinder
    (+4 gleich große Karten: x326 y267 "30"; x593 y267 "97 %"; x861 y267 "412"; x1128 y267 "3")
  - x59 y396 968x609 "Vorschau", 2 Kinder
    - x78 y441 930x547 "Leistungsnachweis Seniorenzentrum Lindenhof", 16 Kinder
  - x1041 y396 340x216 "Abgeleitet, nicht geschrieben", 3 Kinder
    - x1060 y540 304x55 "Im Zeitraum sind 84 Übergaben erfasst, davon 3 mit einem Vor", 0 Kinder
  - x1041 y625 340x192 "Eigene Anmerkung", 3 Kinder
    - x1058 y667 306x74 "", 0 Kinder
  - x1041 y829 340x176 "Nicht enthalten", 6 Kinder

## Einstellungen (1440x980)

Root: display flex row, Innenabstand 28px, Abstand normal, Hintergrund rgb(217, 228, 232).

Hauptblöcke (Kinder des Root):
- <div> x28 y28 1384x924, relative/flex, 4 Kinder – "Einstellungen"

Karten:
- x28 y28 1384x924 "Einstellungen", 4 Kinder
  - x162 y37 563x44 "Im Dienst", 6 Kinder
  - x59 y168 654x332 "Darstellung", 6 Kinder
  - x59 y513 654x232 "Anmeldeadresse", 4 Kinder
    - x78 y673 616x55 "Betriebliche Festlegungen wie Arbeitszeitregeln gelten für a", 1 Kinder
  - x59 y758 654x151 "Deine Daten", 3 Kinder
  - x727 y168 654x517 "Benachrichtigungen", 10 Kinder
  - x727 y698 654x204 "Für den Betrieb", 4 Kinder

## Datenmitnahme (1440x980)

Root: display flex row, Innenabstand 28px, Abstand normal, Hintergrund rgb(217, 228, 232).

Hauptblöcke (Kinder des Root):
- <div> x28 y28 1384x924, relative/flex, 4 Kinder – "Datenmitnahme"

Karten:
- x28 y28 1384x924 "Datenmitnahme", 4 Kinder
  - x162 y37 563x44 "Im Dienst", 6 Kinder
  - x59 y168 868x481 "Was ausgegeben wird", 8 Kinder
  - x941 y168 440x481 "Sicherung außer Haus", 4 Kinder
    - x960 y488 402x46 "7c41e09a", 4 Kinder
      (+1 gleich große Karten: x960 y544 "b209d5f3")
  - x59 y663 868x260 "Was das bedeutet", 2 Kinder
  - x941 y663 440x260 "Ausgabe, kein Rückspielpunkt", 2 Kinder

## Rechtliches (1440x980)

Root: display flex row, Innenabstand 28px, Abstand normal, Hintergrund rgb(217, 228, 232).

Hauptblöcke (Kinder des Root):
- <div> x28 y28 1384x924, relative/flex, 4 Kinder – "Rechtliches"

Karten:
- x28 y28 1384x924 "Rechtliches", 4 Kinder
  - x162 y37 563x44 "Im Dienst", 6 Kinder
  - x59 y168 270x269 "Impressum", 5 Kinder
    - x70 y179 248x47 "Impressum", 2 Kinder
  - x59 y450 270x139 "Stand der Fassungen", 4 Kinder
  - x59 y602 270x151 "Ohne Recht, ohne Anmeldung", 2 Kinder
  - x343 y168 1038x641 "Anbieter", 3 Kinder
    - x368 y248 988x61 "Entwurf mit Beispieldaten.", 1 Kinder
    - x368 y345 479x99 "[BEISPIEL-FIRMA] [BEISPIEL-RECHTSFORM] [BEISPIEL-STRASSE] [B", 1 Kinder
    - x368 y533 479x60 "Telefon: [BEISPIEL-TELEFON] E-Mail: [BEISPIEL-EMAIL]", 1 Kinder
    - x368 y628 479x80 "Eintragung im Handelsregister Registergericht: [BEISPIEL-REG", 1 Kinder
    - x877 y345 479x80 "[BEISPIEL-VERTRETER] [BEISPIEL-STRASSE] [BEISPIEL-PLZ-ORT]", 1 Kinder

## Rahmen (1440x980)

Root: display flex row, Innenabstand 28px, Abstand normal, Hintergrund rgb(217, 228, 232).

Hauptblöcke (Kinder des Root):
- <div> x28 y28 1384x924, relative/flex, 7 Kinder – "Monatsplan"

Karten:
- x28 y28 1384x924 "Monatsplan", 7 Kinder
  - x253 y36 711x50 "Planen", 6 Kinder
  - x988 y41 154x40 "Suchen …", 2 Kinder
  - x59 y159 1322x376 "Monatsplan", 4 Kinder

## Menues (1200x760)

Root: display flex row, Innenabstand 28px, Abstand normal, Hintergrund rgb(217, 228, 232).

Hauptblöcke (Kinder des Root):
- <div> x28 y28 1144x704, relative/flex, 8 Kinder – "Monatsplan"

Karten:
- x28 y28 1144x704 "Monatsplan", 8 Kinder
  - x162 y37 560x44 "Planen", 6 Kinder
  - x59 y181 1082x522 "", 2 Kinder
  - x369 y147 388x357 "Ansicht", 5 Kinder
  - x819 y147 288x236 "SK", 6 Kinder
    - x828 y235 270x40 "Einstellungen", 1 Kinder

## Zustaende (1440x1100)

Root: display flex row, Innenabstand 28px, Abstand normal, Hintergrund rgb(217, 228, 232).

Hauptblöcke (Kinder des Root):
- <div> x28 y28 1384x1044, relative/flex, 4 Kinder – "Zustände"

Karten:
- x28 y28 1384x1044 "Zustände", 4 Kinder
  - x162 y37 563x44 "Im Dienst", 6 Kinder
  - x59 y168 1322x252 "Knopf", 6 Kinder
  - x59 y433 431x296 "Pille", 4 Kinder
    (+2 gleich große Karten: x504 y433 "Eingabefeld"; x950 y433 "Karte")
    - x969 y473 393x50 "Frühdienst · Wohnbereich Nord", 2 Kinder
      (+2 gleich große Karten: x969 y549 "Frühdienst · Wohnbereich Nord"; x969 y625 "Frühdienst · Wohnbereich Nord")
  - x59 y742 431x305 "Checkliste", 6 Kinder
    (+1 gleich große Karten: x504 y742 "Kein Eintrag")
    - x523 y782 393x228 "Kein Eintrag", 4 Kinder
  - x950 y742 431x305 "Fehlerstreifen", 6 Kinder
    - x969 y780 393x46 "Erneut", 3 Kinder
    - x969 y861 393x44 "Keine Verbindung. Änderungen werden gesendet, sobald du wied", 2 Kinder
    - x969 y940 393x42 "Rückgängig", 3 Kinder

## Icons (1440x900)

Root: display flex row, Innenabstand 28px, Abstand normal, Hintergrund rgb(217, 228, 232).

Hauptblöcke (Kinder des Root):
- <div> x28 y28 1384x844, relative/flex, 4 Kinder – "Icons"

Karten:
- x28 y28 1384x844 "Icons", 4 Kinder
  - x162 y37 563x44 "Im Dienst", 6 Kinder
  - x59 y168 1322x302 "raster", 1 Kinder
  - x59 y483 1322x82 "Größen", 5 Kinder

## Masse (1440x980)

Root: display flex row, Innenabstand 28px, Abstand normal, Hintergrund rgb(217, 228, 232).

Hauptblöcke (Kinder des Root):
- <div> x28 y28 1384x924, relative/flex, 4 Kinder – "Maße"

Karten:
- x28 y28 1384x924 "Maße", 4 Kinder
  - x162 y37 563x44 "Im Dienst", 6 Kinder
  - x59 y168 680x285 "97,3 %", 3 Kinder
    - x78 y230 240x158 "97,3 %", 5 Kinder
    - x392 y230 240x158 "", 0 Kinder
  - x753 y168 628x285 "94 %", 3 Kinder
  - x59 y466 680x461 "Sparkline · Höhe 40", 4 Kinder
  - x753 y466 628x130 "Fortschrittsbalken", 3 Kinder
  - x753 y610 628x317 "Farbregel für den Verlauf", 4 Kinder
    - x772 y650 289x86 "Text #071317", 2 Kinder
    - x1073 y650 289x86 "Text hell", 2 Kinder

## Mobil-MeinPlan (390x844)

Root: display flex column, Innenabstand 0px, Abstand normal, Hintergrund rgb(217, 228, 232).

Hauptblöcke (Kinder des Root):
- <div> x-60 y-170 500x380, absolute/block, 0 Kinder
- <div> x0 y0 390x64, relative/flex, 4 Kinder – "CENTRIC"
- <div> x0 y64 390x64, relative/flex, 2 Kinder – "Mein Plan"
- <div> x0 y128 390x60, relative/flex, 5 Kinder – "Alle"
- <div> x0 y188 390x584, relative/block, 8 Kinder – "29"
- <div> x0 y772 390x72, relative/flex, 4 Kinder – "Mein Plan"

Karten:
- x232 y80 140x48 "Liste", 2 Kinder
- x84 y144 103x44 "Nur Dienste", 1 Kinder
- x279 y144 110x44 "Nachtdienste", 1 Kinder
  (+1 gleich große Karten: x397 y144 "Wochenende")
- x18 y204 354x64 "29", 4 Kinder
  (+7 gleich große Karten: x18 y276 "30"; x18 y348 "1"; x18 y420 "3"; x18 y492 "4"; x18 y564 "6"; x18 y636 "7"; x18 y708 "8")
- x94 y781 107x56 "Mein Plan", 2 Kinder

## Mobil-Anliegen (390x844)

Root: display flex column, Innenabstand 0px, Abstand normal, Hintergrund rgb(217, 228, 232).

Hauptblöcke (Kinder des Root):
- <div> x-60 y-170 500x380, absolute/block, 0 Kinder
- <div> x0 y0 390x64, relative/flex, 4 Kinder – "CENTRIC"
- <div> x0 y64 390x64, relative/block, 2 Kinder – "Anliegen"
- <div> x0 y128 390x644, relative/block, 3 Kinder – "Urlaub 12.10."
- <div> x0 y772 390x72, relative/flex, 4 Kinder – "Anliegen"
- <div> x0 y0 390x844, absolute/block, 0 Kinder
- <div> x0 y392 390x452, absolute/block, 3 Kinder – "Krankmeldung"

Karten:
- x18 y146 172x52 "Frei beantragen", 1 Kinder, im Grid (172px 172px)
  (+1 gleich große Karten: x200 y146 "Krank melden")
- x18 y245 354x310 "Urlaub 12.10.", 4 Kinder
- x198 y781 102x56 "Anliegen", 2 Kinder
- x0 y392 390x452 "Krankmeldung", 3 Kinder
  - x20 y487 350x48 "", 0 Kinder
  - x20 y567 170x48 "", 0 Kinder
  - x200 y567 170x48 "", 0 Kinder
  - x20 y647 350x48 "", 0 Kinder
  - x20 y780 350x52 "Krank melden", 0 Kinder, im Grid (350px)

## Mobil-Mehr (390x844)

Root: display flex column, Innenabstand 0px, Abstand normal, Hintergrund rgb(217, 228, 232).

Hauptblöcke (Kinder des Root):
- <div> x-60 y-170 500x380, absolute/block, 0 Kinder
- <div> x0 y0 390x64, relative/flex, 4 Kinder – "CENTRIC"
- <div> x0 y64 390x64, relative/block, 2 Kinder – "Tobias Brandt"
- <div> x0 y128 390x644, relative/block, 5 Kinder – "94 %"
- <div> x0 y772 390x72, relative/flex, 4 Kinder – "Mehr"

Karten:
- x18 y144 354x67 "94 %", 3 Kinder
- x18 y221 354x193 "Checkliste heute", 3 Kinder
- x18 y423 354x198 "Feldmodus", 3 Kinder
- x18 y634 354x46 "Abmelden", 0 Kinder

## MeineSchichten (1440x980)

Root: display flex row, Innenabstand 28px, Abstand normal, Hintergrund rgb(217, 228, 232).

Hauptblöcke (Kinder des Root):
- <div> x28 y28 1384x924, relative/flex, 5 Kinder – "Meine Schichten"

Karten:
- x28 y28 1384x924 "Meine Schichten", 5 Kinder
  - x162 y37 562x44 "Im Dienst", 6 Kinder
  - x59 y168 868x203 "Spätdienst", 4 Kinder
  - x59 y385 868x494 "Kommende Dienste", 8 Kinder
  - x941 y168 440x287 "+12,5", 6 Kinder
  - x941 y469 440x133 "9", 4 Kinder
  - x941 y616 440x263 "Meine Anträge", 4 Kinder
  - x428 y903 129x40 "Meine Schichten", 1 Kinder

## Monatsplan-Dunkel (1440x980)

Root: display flex row, Innenabstand 28px, Abstand normal, Hintergrund rgb(7, 15, 18).

Hauptblöcke (Kinder des Root):
- <div> x28 y28 1384x924, relative/flex, 5 Kinder – "CENTRIC"

Karten:
- x28 y28 1384x924 "CENTRIC", 5 Kinder
  - x172 y38 338x48 "Planen", 6 Kinder
  - x57 y113 201x40 "September 2026", 3 Kinder
  - x952 y113 225x40 "Monat", 3 Kinder
  - x57 y197 1326x519 "1", 14 Kinder
  - x57 y730 1326x43 "Regelprüfung", 8 Kinder

## Personal-Kompakt (1440x980)

Root: display flex row, Innenabstand 28px, Abstand normal, Hintergrund rgb(217, 228, 232).

Hauptblöcke (Kinder des Root):
- <div> x28 y28 1384x924, relative/flex, 4 Kinder – "Personal"

Karten:
- x28 y28 1384x924 "Personal", 4 Kinder
  - x162 y37 564x44 "Wer mitfährt", 6 Kinder
  - x59 y168 988x755 "Person suchen", 4 Kinder
  - x1061 y168 320x273 "80 %", 4 Kinder
    - x1173 y242 103x54 "+18,5 h", 2 Kinder
  - x1061 y454 320x469 "Zusammensetzung", 7 Kinder
    - x1078 y848 286x59 "Fachkraftquote 54 % — die Landesvorgabe von 50 % ist eingeha", 0 Kinder

## Lagebild-Feldmodus (1440x980)

Root: display flex row, Innenabstand 28px, Abstand normal, Hintergrund rgb(217, 228, 232).

Hauptblöcke (Kinder des Root):
- <div> x28 y28 1384x924, relative/flex, 3 Kinder – "Lagebild"

Karten:
- x28 y28 1384x924 "Lagebild", 3 Kinder
  - x179 y35 690x54 "Im Dienst", 6 Kinder
    - x184 y40 104x44 "Im Dienst", 0 Kinder
  - x782 y108 113x40 "Feldmodus", 0 Kinder
  - x906 y102 160x52 "Alle Einheiten", 1 Kinder
  - x1075 y102 120x52 "Nur Lücken", 0 Kinder
  - x1205 y102 175x52 "Schicht besetzen", 0 Kinder
  - x60 y178 274x266 "11", 5 Kinder, im Grid (274px 274px 274px)
    (+2 gleich große Karten: x348 y178 "9"; x636 y178 "3")
  - x60 y458 850x470 "Jetzt im Dienst", 5 Kinder
    - x242 y509 118x44 "Adler, A.", 2 Kinder
    - x367 y509 115x44 "Kern, A.", 2 Kinder
    - x489 y509 120x44 "Weiß, C.", 2 Kinder
    - x615 y509 124x44 "Seidel, T.", 2 Kinder
    - x242 y565 132x44 "Brandt, M.", 2 Kinder
    - x381 y565 129x44 "Nowak, P.", 2 Kinder
    - x517 y565 118x44 "Lang, S.", 2 Kinder
    - x641 y565 132x44 "Richter, K.", 2 Kinder
    - x242 y616 131x44 "Sadiku, E.", 2 Kinder
    - x380 y616 119x44 "Vogel, J.", 2 Kinder
    - x506 y616 149x44 "Hoffmann, L.", 2 Kinder
    - x242 y672 130x44 "Berger, N.", 2 Kinder
    - x379 y672 126x44 "Krause, I.", 2 Kinder
    - x513 y672 137x44 "Mertens, F.", 2 Kinder
    - x657 y672 117x44 "Roth, H.", 2 Kinder
    - x242 y723 121x44 "Timm, A.", 2 Kinder
    - x242 y779 130x44 "Öztürk, D.", 2 Kinder
    - x379 y779 131x44 "Peters, M.", 2 Kinder
  - x924 y178 456x750 "Achtungspunkte", 6 Kinder
