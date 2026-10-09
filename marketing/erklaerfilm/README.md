# Erklärfilm „Ausgleichszeitraum“ (CENTRIC)

60 s, Deutsch, mit Stimme und Untertiteln. Die eine Erkenntnis: **Ein Plan, in dem jede Woche zulässig ist, kann den Ausgleichszeitraum nach § 3 ArbZG trotzdem reißen, denn das Gesetz misst den Durchschnitt über 24 Wochen.** Für Schichtplanerinnen und Leitungen.

## Lieferung (`out/`)

| Datei | Inhalt |
|---|---|
| `master_16x9.mp4` | 1920×1080, 60 fps, H.264 crf 16, yuv420p, AAC 256 kb/s |
| `cut_9x16.mp4` | 1080×1920, eigene Komposition (die Fassung fürs Handy) |
| `cut_1x1.mp4` | 1080×1080, eigene Komposition |
| `master_16x9_reduzierte_bewegung.mp4` | dieselbe Folge der Ideen ohne Fahrten und Skalierungen (Ein- und Ausblenden am Ort, Zoom als harter Schnitt) |
| `captions.srt` | 16 Untertitel, dieselben Zeilen wie eingebrannt |
| `contact.png` | Kontaktbogen: 17 Beats aus `master_16x9.mp4` |

Außerdem: `directions.html` (vier Richtungen, Gewinner markiert), `SCENES.md` (Szenen nach Vorgabe), `DECISIONS.md`, `SOURCES.md`, `stills/vorher-nachher/` (je Korrektur ein Bildpaar), `stills/kontakt_9x16_390px.png`, `stills/pegelkarte.png`.

## Neu erzeugen

```bash
cd src
python vo.py ../build/vo 0.92            # im Ordner mit dem Thorsten-Modell (vits/…); Coqui TTS
python3 zeiten.py                         # vo.json → vo-zeiten.js
PW=<node_modules mit playwright-core> node probe.mjs 16x9 ../build/probe 0.5   # schreibt build/timeline.json
python3 srt.py                            # out/captions.srt
python3 ton.py                            # Bett, Klänge, Mischung, Master → build/ton/
PW=… FF=<ffmpeg> node render.mjs 16x9 ../build/video/16x9.mp4   # ebenso 9x16, 1x1, „16x9 … rm“
bash export.sh                            # Ton unterlegen → out/
```

`film.html` lässt sich im Browser öffnen: `?f=16x9|9x16|1x1`, `?rm=1`, `?cc=0`, `?t=<Sekunden>`. `window.seek(t)` malt das Bild zur Zeit t, `window.TIMELINE` enthält Beats, Bewegungen (Schlüsselbilder je Kachel), Bildschirmworte, Klangmarken und Untertitel.

## Was geprüft wurde (und mit welchem Ergebnis)

- **Determinismus:** Vier Zeitpunkte (3,5 / 31,7 / 44,3 / 52 s) jeweils dreimal gemalt: direkt, nach einem anderen t und in einer frischen Seite. Alle drei Bilder waren bytegleich (`build/determinismus.txt`). Die Stimme ist mit festen Zufallswerten erzeugt; zwei Läufe ergaben identische Zeiten.
- **Standbild an jedem Beat** in allen drei Formaten (`stills/beats/`, nicht im Repo) und jeweils auf 390 px verkleinert (`stills/390/`). In 9:16 auf 390 px ist jede Zeile lesbar (`stills/kontakt_9x16_390px.png`, aus dem fertigen Video). In 16:9 auf 390 px nicht: Die Untertitel wären dort 8 px hoch (in DECISIONS.md festgehalten).
- **Ohne Ton:** Am Kontaktbogen geprüft. Jeder Beat trägt seine Aussage über die eingebrannten Untertitel und die Bildschirmworte; „überschritten“ und „eingehalten“ stehen immer als Wort, nie nur als Farbe.
- **Nur Ton:** Der Sprechertext enthält die vollständige Erklärung inklusive aller Zahlen. Pegel über die Zeit in `stills/pegelkarte.png`: Das Bett liegt beim Sprechen 23,9 dB unter der Stimme, das Motiv erklingt bei beiden „Durchschnitt“-Stellen. Gehört hat den Ton niemand; geprüft wurden Pegel und Ablauf, nicht der Höreindruck.
- **Lautheit der gelieferten Dateien:** alle vier −16,1 LUFS integriert, −2,25 dBTP (ffmpeg loudnorm, `build/lautheit_out.txt`). Ein Spitzenfänger auf der Stimme greift auf 0,7 % der Sprechzeit mit mehr als 1 dB (höchstens 2,9 dB).
- **Design-Review** (Subagent mit den Review-Fragen: Für wen? Was kommunizieren wir? Braucht es einen Namen? Was kann weg?): 13 Befunde. Umgesetzt wurden die Befunde 1–10 und 12; zu jedem Hauptbefund gibt es ein Bildpaar in `stills/vorher-nachher/`. Zu 11 (Karte aus dem Beispielbetrieb) bleibt die Beschriftung „Ansicht in CENTRIC“. 13 (16:9 auf 390 px) ist dokumentiert, nicht behoben.
- **Barrierefreiheit** (Subagent, mit Messskripten): Kontrast aller Textpaare ≥ 4,5:1 nach der Korrektur von „So“ (5,1:1). Farbe nie allein. Keine Blitze (höchstens 1,6 % der Fläche in Bewegung). Untertitel vollständig, höchstens zwei Zeilen und nach der Korrektur höchstens 16,5 Zeichen/s. Reduzierte Bewegung behält die Folge der Ideen bei.

## Nicht geprüft

- Den Wortlaut von § 3 ArbZG an der Quelle (gesetze-im-internet.de war gesperrt); siehe SOURCES.md.
- Reduzierte Bewegung für 9:16 und 1:1 (nur 16:9 gerendert).
- Wiedergabe auf echten Geräten und Plattformen.

## Rechte

Stimme: Thorsten-Modell (CC0). Schriften: Inter und IBM Plex Mono (SIL OFL 1.1, Lizenzen in `src/fonts/`). Oberfläche, Marke und Farben: CENTRIC. Musik und Klänge: im Code erzeugt.
