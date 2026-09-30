# Prüfbericht Leitstand-Artboards

Gerendert mit der Design-Laufzeit (`artifact-type/dc-runtime.js`, als `support.js` abgelegt) in Chromium/Playwright, Viewport = Größe aus `canvas.json`. Stand der Messung: 57 Artboards.

Hinweise zur Methode:

- Die Schrift-Verbindung zu fonts.googleapis.com war ohne Netz nicht erreichbar (für den Lauf abgebrochen); Inter fiel auf die Systemschrift zurück. Textbreiten können daher leicht von der echten Darstellung abweichen. Diese Ladefehler sind nicht als Konsolenfehler gezählt.
- React kommt in der Laufzeit-Datei selbst mit; ein Netzabruf von cdn.jsdelivr.net war nicht nötig (dort wäre 403 gekommen).
- Kontrast (e): gezählt sind Textelemente mit Farbe #5B6B72, die im oberen Bereich (y < 440 px) liegen und keinen deckenden Vorfahren (Hintergrund-Alpha >= 0,9) unter dem Root haben, also auf Verlauf oder Glas stehen. Es ist nur eine Zählung, kein gemessener Kontrastwert.
- Nicht gezählt (Falschmeldungen): visuell versteckte Suchfeld-Labels mit 1x1 px (Dienstbuch, Personal, Handbuch, Personal-Kompakt), überlappende Avatar-Stapel (Mobil, MeineSchichten; gewollt) und zwei Label-Texte in Einstellungen, die im Bild sauber stehen.

## Ergebnis

- Ohne (e): **49 von 57** Artboards ohne Befund in (a) bis (d).
- Einschließlich (e): **48 von 57** Artboards ohne jeden Befund.

## Tabelle

| Artboard | Größe | (a) Konsole | (b) {{ | (c) Überlauf Root | (c) Abschneiden | (d) Überlappung | (e) #5B6B72 auf Verlauf |
|---|---|---|---|---|---|---|---|
| Main | 1440x980 | 0 | 0 | 0 | 0 | 0 | 0 |
| Leitstand-Dunkel | 1440x980 | 0 | 0 | 0 | 0 | 0 | 0 |
| Kontrast | 880x460 | 0 | 0 | 0 | 0 | 0 | 2 |
| Mobil | 390x844 | 0 | 0 | 1 | 0 | 0 | 1 |
| Lagebild | 1440x980 | 0 | 0 | 0 | 0 | 0 | 0 |
| Zeitachse | 1440x980 | 0 | 0 | 0 | 0 | 0 | 0 |
| Uebergabe | 1440x980 | 0 | 0 | 0 | 0 | 0 | 0 |
| Monatsplan | 1440x980 | 0 | 0 | 0 | 0 | 0 | 0 |
| Jahresansicht | 1440x980 | 0 | 0 | 0 | 12 | 0 | 0 |
| Personaleinsatz | 1440x980 | 0 | 0 | 0 | 0 | 0 | 0 |
| Selbstplanung | 1440x980 | 0 | 0 | 0 | 0 | 0 | 0 |
| Schichtfolge | 1440x980 | 0 | 0 | 0 | 0 | 0 | 0 |
| Antraege | 1440x980 | 0 | 0 | 0 | 0 | 0 | 0 |
| OffeneSchichten | 1440x980 | 0 | 0 | 0 | 0 | 0 | 0 |
| Notrufe | 1440x980 | 0 | 0 | 0 | 0 | 0 | 0 |
| Dienstbuch | 1440x980 | 0 | 0 | 0 | 0 | 0 | 0 |
| Personal | 1440x980 | 0 | 0 | 0 | 0 | 0 | 0 |
| Qualifikationen | 1440x980 | 0 | 0 | 0 | 0 | 0 | 0 |
| Nachweise | 1440x980 | 0 | 0 | 0 | 0 | 0 | 0 |
| Pruefung | 1440x980 | 0 | 0 | 0 | 0 | 0 | 0 |
| Untergrenzen | 1440x980 | 0 | 0 | 0 | 0 | 0 | 0 |
| Belastung | 1440x980 | 0 | 0 | 0 | 0 | 0 | 0 |
| Abrechnung | 1440x980 | 0 | 0 | 0 | 0 | 0 | 0 |
| Betrieb | 1440x980 | 0 | 0 | 0 | 0 | 0 | 0 |
| Dienstarten | 1440x980 | 0 | 0 | 0 | 0 | 0 | 0 |
| Datenschutz | 1440x980 | 0 | 0 | 1 | 0 | 0 | 0 |
| Ablauf | 1440x980 | 0 | 0 | 0 | 0 | 0 | 0 |
| Handbuch | 1440x980 | 0 | 0 | 0 | 0 | 0 | 0 |
| Hilfe | 1440x980 | 0 | 0 | 0 | 0 | 0 | 0 |
| Bereitschaft | 1440x980 | 0 | 0 | 0 | 0 | 0 | 0 |
| Sondereinsaetze | 1440x980 | 0 | 0 | 0 | 0 | 0 | 0 |
| Tauschboerse | 1440x980 | 0 | 0 | 0 | 0 | 0 | 0 |
| Wunschdienste | 1440x980 | 0 | 0 | 0 | 0 | 0 | 0 |
| SchwarzesBrett | 1440x980 | 0 | 0 | 0 | 0 | 0 | 0 |
| Kompetenzen | 1440x980 | 0 | 0 | 0 | 0 | 0 | 0 |
| Einarbeitung | 1440x980 | 0 | 0 | 0 | 0 | 0 | 0 |
| Verteilung | 1440x980 | 0 | 0 | 0 | 0 | 0 | 0 |
| Betriebsmittel | 1440x980 | 0 | 0 | 0 | 0 | 0 | 0 |
| Lenkzeiten | 1440x980 | 2 | 0 | 0 | 0 | 0 | 0 |
| Belastbarkeit | 1440x980 | 0 | 0 | 0 | 0 | 0 | 0 |
| Planstand | 1440x980 | 0 | 0 | 0 | 0 | 0 | 0 |
| Leistungsnachweis | 1440x980 | 0 | 0 | 7 | 1 | 0 | 0 |
| Einstellungen | 1440x980 | 0 | 0 | 0 | 0 | 0 | 0 |
| Datenmitnahme | 1440x980 | 0 | 0 | 0 | 0 | 0 | 0 |
| Rechtliches | 1440x980 | 0 | 0 | 0 | 0 | 0 | 0 |
| Rahmen | 1440x980 | 0 | 0 | 0 | 1 | 0 | 0 |
| Menues | 1200x760 | 0 | 0 | 0 | 0 | 0 | 0 |
| Zustaende | 1440x1100 | 0 | 0 | 0 | 0 | 0 | 0 |
| Icons | 1440x900 | 0 | 0 | 0 | 0 | 0 | 0 |
| Masse | 1440x980 | 0 | 0 | 0 | 0 | 0 | 0 |
| Mobil-MeinPlan | 390x844 | 0 | 0 | 2 | 1 | 0 | 0 |
| Mobil-Anliegen | 390x844 | 0 | 0 | 0 | 0 | 0 | 0 |
| Mobil-Mehr | 390x844 | 0 | 0 | 0 | 0 | 0 | 0 |
| MeineSchichten | 1440x980 | 5 | 0 | 0 | 0 | 0 | 0 |
| Monatsplan-Dunkel | 1440x980 | 0 | 0 | 0 | 0 | 0 | 0 |
| Personal-Kompakt | 1440x980 | 0 | 0 | 0 | 0 | 0 | 0 |
| Lagebild-Feldmodus | 1440x980 | 0 | 0 | 0 | 0 | 0 | 0 |

## Artboards mit Problemen (a) bis (d)

| Datei | Stelle | Art des Problems |
|---|---|---|
| Mobil.dc.html | div:Heute Mein Plan (x0 y779 390x72) | ragt über das Root-Element (390x844) hinaus |
| Jahresansicht.dc.html | span.sc-interp:21 Dienste | Text abgeschnitten: ragt aus div:CENTRIC Im DienstPla heraus (15px rechts, -583px unten) |
| Jahresansicht.dc.html | span.sc-interp:19 Dienste | Text abgeschnitten: ragt aus div:CENTRIC Im DienstPla heraus (15px rechts, -558px unten) |
| Jahresansicht.dc.html | span.sc-interp:20 Dienste | Text abgeschnitten: ragt aus div:CENTRIC Im DienstPla heraus (15px rechts, -533px unten) |
| Jahresansicht.dc.html | … | weitere 9 abgeschnittene Texte gleicher Art |
| Datenschutz.dc.html | div:Aufbewahrung und Löschung (x29 y152 1382x838) | ragt über das Root-Element (1440x980) hinaus |
| Lenkzeiten.dc.html | erste Zeichnung | Konsole: 2 Meldungen beim ersten Rendern, davon mit unaufgelöstem Platzhalter (Attributwert {{…}} vor Befüllung): warning: The specified value "{{z.lenk}}" cannot be parsed, or is out of range.; warning: The specified value "{{z.ruhe}}" cannot be parsed, or is out of range.. Endzustand des DOM enthält kein "{{" mehr. |
| Leistungsnachweis.dc.html | div:Von Bis (x29 y152 1382x881) | ragt über das Root-Element (1440x980) hinaus |
| Leistungsnachweis.dc.html | div:Vorschau leistungsnach (x59 y396 1322x609) | ragt über das Root-Element (1440x980) hinaus |
| Leistungsnachweis.dc.html | div:Vorschau leistungsnach (x59 y396 968x609) | ragt über das Root-Element (1440x980) hinaus |
| Leistungsnachweis.dc.html | div:Wer einem Auftraggeber mehr ge | Text abgeschnitten: ragt aus div:CENTRIC Im DienstPla heraus (-48px rechts, 36px unten) |
| Rahmen.dc.html | span:Seniorenzentrum Lindenhof | Text abgeschnitten: scroll 154x14 > client 75x14 |
| Mobil-MeinPlan.dc.html | button:Wochenende (x397 y144 110x44) | ragt über das Root-Element (390x844) hinaus |
| Mobil-MeinPlan.dc.html | span.sc-interp:Wochenende (x414 y158 76x15) | ragt über das Root-Element (390x844) hinaus |
| Mobil-MeinPlan.dc.html | span.sc-interp:Wochenende | Text abgeschnitten: ragt aus div:Alle Nur Dienste heraus (100px rechts, -14px unten) |
| MeineSchichten.dc.html | erste Zeichnung | Konsole: 5 Meldungen beim ersten Rendern, davon mit unaufgelöstem Platzhalter (Attributwert {{…}} vor Befüllung): error: Error: <line> attribute y1: Expected length, "{{konto.nullY}}".; error: Error: <line> attribute y2: Expected length, "{{konto.nullY}}".; error: Error: <path> attribute d: Expected moveto path command ('M' or 'm'), "{{konto.linie}}".. Endzustand des DOM enthält kein "{{" mehr. |

## Kontrast (e): Artboards mit den meisten Treffern

| Artboard | Treffer | Beispiele |
|---|---|---|
| Kontrast.dc.html | 2 | span:Besetzungsgrad (y124), span:Vergleich zum Vormonat  (y180) |
| Mobil.dc.html | 1 | span:KW 40 (y416) |

Artboards ohne Treffer in (e): Main, Leitstand-Dunkel, Lagebild, Zeitachse, Uebergabe, Monatsplan, Jahresansicht, Personaleinsatz, Selbstplanung, Schichtfolge, Antraege, OffeneSchichten, Notrufe, Dienstbuch, Personal, Qualifikationen, Nachweise, Pruefung, Untergrenzen, Belastung, Abrechnung, Betrieb, Dienstarten, Datenschutz, Ablauf, Handbuch, Hilfe, Bereitschaft, Sondereinsaetze, Tauschboerse, Wunschdienste, SchwarzesBrett, Kompetenzen, Einarbeitung, Verteilung, Betriebsmittel, Lenkzeiten, Belastbarkeit, Planstand, Leistungsnachweis, Einstellungen, Datenmitnahme, Rechtliches, Rahmen, Menues, Zustaende, Icons, Masse, Mobil-MeinPlan, Mobil-Anliegen, Mobil-Mehr, MeineSchichten, Monatsplan-Dunkel, Personal-Kompakt, Lagebild-Feldmodus.

Screenshots: `bilder/<Artboardname>.png`.
