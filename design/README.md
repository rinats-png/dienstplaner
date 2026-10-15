# Neues Design – App und Website

**Stand:** 15.10.2026. Hier liegt das neue Design von CENTRIC mit dem vollständigen Code der Entwürfe. Die laufende Anwendung ist noch nicht umgestellt; das erledigt der Befehl unten.

## Befehl

Im Repository Claude Code starten und eingeben:

```
/design-aufspielen
```

Optional mit Ziel: `/design-aufspielen app`, `/design-aufspielen website` oder `/design-aufspielen alles` (Vorgabe: `alles`).

Der Befehl setzt das Design in den Quelltext um, lässt alle Prüfungen laufen, zeigt Vorher-Nachher-Bilder und **fragt vor jeder Veröffentlichung nach**. Die vollständige Anweisung steht in [`.claude/commands/design-aufspielen.md`](../.claude/commands/design-aufspielen.md).

## Ansehen

```
npm run design:ansehen
```

Öffnet `http://localhost:4800` mit allen Artboards, gruppiert nach Bereichen (braucht Internet für die Schrift Instrument Sans).

## Was wo liegt

| Pfad | Inhalt |
|---|---|
| `canvas/V3-*.dc.html` | **App, Version 3 hell** – 47 Bereiche (maßgeblich) |
| `canvas/V3D-*.dc.html` | **App, Version 3 dunkel** – dieselben 47 Bereiche |
| `canvas/W-*.dc.html`, `canvas/M-*.dc.html` | **Website hell** – 10 Desktop-Seiten, 3 Mobil-Seiten |
| `canvas/DW-*.dc.html`, `canvas/DM-*.dc.html` | **Website dunkel** – dieselben 13 Seiten |
| `canvas/Main.dc.html`, `Planen`, `Dunkel-*` … | Entwurf 2 – nur zum Vergleich, **nicht umsetzen** |
| `canvas/canvas.json` | Anordnung und Titel aller Artboards |
| `canvas/support.js` | Laufzeit zum Anzeigen der Artboards (nicht Teil der App) |
| `app/stil.css` | **Stilquelle**: alle Farbwerte hell und dunkel, Schrift, Kacheln, Navigation, Knöpfe, Pillen, Felder, Tabellen, Mobilleiste |
| `website/quelle/` | Generator der Website-Entwürfe (Python 3.11+): `bau_web.py` hell, `bau_web_dunkel.py` dunkel, `toolkit.py`, `basis.css`, `web_hoehen.json` |
| `werkzeug/ansehen.mjs` | lokaler Betrachter (`npm run design:ansehen`) |

Jedes Artboard ist eine eigenständige HTML-Datei: im `<style>` steht der komplette Stil, darunter das Markup des Bereichs. Das ist der Code, der in React-Komponenten übertragen wird.

`npm run design:website` erzeugt die 26 Website-Artboards neu aus dem Generator (Ergebnis ist bytegleich mit den abgelegten Dateien).

## Gestaltungsregeln (Kurzfassung)

- **Grund** Sea Salt `#D9E4E8` mit leichtem Petrol-Verlauf oben; dunkel `#0B1418` mit gedämpftem Verlauf.
- **Akzent** Petrol `#017070` (dunkel `#3FBFBF`), **Hero-Kachel** `#06363D`.
- **Schrift** Instrument Sans 400–700, Zahlen mit `tabular-nums`.
- **Kacheln** statt Tabellenwände: weiße Flächen, Radius 24 px, leiser Schatten, eine Hero-Kachel je Ansicht.
- **Navigation** als Pillenleiste oben (Desktop) und schwebende Tab-Leiste unten (Telefon).
- **Zustände** immer als Pille mit Punkt: ok, warn, krit, neutral.
- **Schichtfarben** Früh blau, Spät orange, Nacht violett – als Fläche mit dunkler Schrift, nie als Text allein.
- Keine festen Farben in Komponenten, nur die Variablen aus `app/stil.css`.

## Zuordnung App: Artboard → Bereich

Die Hauptnavigation der App (`src/App.jsx`) hat sechs Gruppen: Im Dienst, Planen, Zu entscheiden, Wer mitfährt (Team), Nachsehen, Verwaltung. Die Artboards tragen die Namen der Bereiche, die es heute schon gibt.

| Gruppe | Artboards (`V3-…`) |
|---|---|
| Start / Im Dienst | `start`, `lage`, `uebergabe`, `notrufe`, `aushang`, `sonder` |
| Planen | `plan`, `jahr`, `zeitachse`, `einsatz`, `folge`, `offene`, `wuensche`, `selbstplan`, `bereitschaft`, `verteilung`, `planstand` |
| Zu entscheiden | `antraege`, `boerse` |
| Team | `personal`, `quals`, `kompetenzen`, `einarbeitung`, `nachweise` |
| Nachsehen | `pruef`, `belastung`, `belastbarkeit`, `untergrenzen`, `lenkzeiten`, `buch`, `abrechnung`, `nachweis` |
| Verwaltung | `betrieb`, `dienste`, `mittel`, `ablauf`, `einstellungen`, `datenschutz`, `mitnahme`, `rechtliches`, `handbuch`, `hilfe` |
| Beschäftigte | `meine` (Desktop), `tel-heute`, `tel-plan`, `tel-anliegen`, `tel-mehr` (Telefon) |

Die Anmeldung der App ist in den Website-Entwürfen enthalten (`W-anmeldung`, `M-anmeldung`), ebenso Demo-Rollenwahl (`W-demo`) und Selbst starten (`W-starten`). Diese drei Seiten liegen heute in `src/main.jsx`.

## Website: was zu wissen ist

- **Quelltext der bisherigen Website** liegt nicht in diesem Repository. Bei Netlify gibt es das Projekt `centric-website` (Stand 15.10.2026 ohne aktive Auslieferung). Der Befehl baut die Website deshalb neu unter `website/` und fragt vor dem Veröffentlichen, wohin.
- **Platzhalter** in eckigen Klammern (Impressum, Adresse, Registernummer) müssen vor dem Veröffentlichen ersetzt sein. Der Befehl bricht sonst ab.
- **CENTRIC Intelligence** kommt auf der Website bewusst nicht vor, weil es noch nicht gebaut ist (siehe `docs/intelligence/`).
- Preise stammen aus `src/stufen.js` (89 / 159 / 279 €, Pakete), Branchen aus `server/lib/branchen.mjs`. Ändern sich diese Werte, gilt der Code, nicht der Entwurf.
