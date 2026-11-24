# CENTRIC — Website

Die Marketing-Website zur Anwendung CENTRIC (Dienstplanung für rotierende
Schichtbetriebe), erreichbar unter `https://centric-dienstplanung.de`. Die Anwendung
selbst ist eine eigene Auslieferung unter `https://app.centric-dienstplanung.de` und
liegt im Repo `rinats-png/dienstplaner`.

Die Website ist **vollständig statisch**: kein Server-Code, keine Formulare an einen
Server (das Kontaktformular baut eine `mailto:`-Nachricht), keine externen Skripte
oder Schriften, kein Tracking. Ausgeliefert werden ausschließlich Dateien.

## Aufbau des Repositorys

Dieses Repository enthält nur die **Quelle**:

| Pfad | Inhalt |
|---|---|
| `build.py` | der Generator — Inhalte, Preise, CSS, JavaScript und die WebGL-Halle in einer Datei |
| `assets/fonts/` | Jura, Instrument Sans, Geist Mono (OFL) |
| `assets/vendor/` | Drei.js r143 (MIT) |

Alles, was ausgeliefert wird, entsteht beim Bau unter `dist/`. Der Ordner steht in
`.gitignore` und wird nicht eingecheckt.

## Bauen

```bash
python build.py
```

Benötigt Python 3 ohne weitere Abhängigkeiten (nur Standardbibliothek). Der Bau
dauert unter einer Sekunde und schreibt nach `dist/`:

- die 15 HTML-Seiten, `sitemap.xml`, `robots.txt`
- `assets/style.css`, `assets/site.js`, `assets/halle.js`, `assets/favicon.svg`
- `assets/fonts/` und `assets/vendor/` als Kopie aus der Quelle

**`dist/` ist das Deployment-Artefakt.** Es ist für sich vollständig: Wer den Ordner
auf einen Webserver legt, hat die Website — ohne Python, ohne dieses Repository.
Es enthält ausschließlich Auslieferungsdateien und wird **nicht eingecheckt**
(`.gitignore`); bei jedem Bau entsteht es neu.

Der Standardbau erzeugt **keine Einzeldatei**. Sie wiegt allein mehr als die ganze
Website, ist von keiner Seite verlinkt und gehört nicht in die Auslieferung — wer
sie zum Zeigen oder Prüfen braucht, ruft sie ausdrücklich ab:

```bash
python build.py --einzeldatei
```

Dann entsteht neben dem normalen Bau zusätzlich
`dist/centric-website-einzeldatei.html` — die ganze Website in einer Datei, Router
über die Adresszeile, Schriften und Drei.js eingebettet (~1,6 MB).

Generierte Textdateien tragen unabhängig vom Betriebssystem LF als Zeilenende.
Zwei Bauten desselben Stands ergeben damit Byte für Byte dasselbe Ergebnis — das
macht einen Vergleich zweier Auslieferungen erst aussagekräftig.

`python build.py --hilfe` zeigt die Aufrufe.

Ansehen:

```bash
python -m http.server 8080 --directory dist
# http://localhost:8080
```

Die Seiten funktionieren auch direkt per Doppelklick (`file://`), weil alle Verweise
relativ sind.

### Adressen

Zwei Umgebungsvariablen steuern die einzigen absoluten Adressen im Ergebnis:

| Variable | Vorgabe | Wirkt auf |
|---|---|---|
| `CENTRIC_APP` | `https://app.centric-dienstplanung.de` | die Knöpfe „Anmelden" und „Testen" — der Weg in die Anwendung |
| `CENTRIC_WEBSITE` | `https://centric-dienstplanung.de` | `sitemap.xml` und `robots.txt` — sonst nichts, alle Seitenverweise sind relativ |
| `CENTRIC_OUT` | `dist/` neben `build.py` | Zielordner des Baus |

```bash
CENTRIC_APP=https://app.centric-dienstplanung.de \
CENTRIC_WEBSITE=https://centric-dienstplanung.de \
python build.py
```

`CENTRIC_APP` darf nie auf die Website selbst zeigen — sonst landet jemand aus
„Testen" wieder auf der Verkaufsseite statt in der Anwendung.

### Helle Vorschau

Daneben gibt es eine Vorschau, in der jede dunkle Fläche hell wird — die Halle, die
Rechnerausgabe, das Aufrufband und die Fußzeile. Sie schreibt nur ihre eigene Datei
`dist/centric-hell-vorschau.html`; die ausgelieferte Seite bleibt unberührt:

```bash
python build.py --hell
```

## Inhalte pflegen

Inhalte, Preise, Branchenpakete und Rollen stehen oben in `build.py` als Datenstrukturen
(`STUFEN`, `STANDORT_BAENDER`, `ZUSATZ_PLANER`, `PAKETE`, `ROLLEN`). Wer dort etwas
ändert, ändert es auf allen Seiten gleichzeitig, inklusive Preisrechner und
Zuschlagstabelle.

**Die Preiszahlen sind eine zweite Fassung.** Maßgeblich ist `src/stufen.js` im
Anwendungsrepo — dort rechnet die Abrechnung damit, hier nur die Auskunft. Ein Preis,
den die Website nennt und die Anwendung nicht einhält, ist schlimmer als ein zu hoher
Preis, deshalb: wer eine Zahl ändert, ändert sie an beiden Orten.
`pruefungen/stufen.test.js` drüben hält die Zahlen ausdrücklich fest, damit man beim
Ändern hier vorbeikommt.

Das Modell in drei Sätzen: Die Grundgebühr der Stufe deckt ein Kontingent an
Planer-Zugängen und ein Kontingent an Standorten beliebiger Größe. Jeder Planer-Zugang
darüber kostet eine feste Pauschale. Jeder Standort darüber kostet nach *seiner eigenen*
Größe, nicht nach der des Betriebs. Wer geplant wird, kostet nichts.

## Seiten

Alle Dateien entstehen unter `dist/`.

| Datei | Inhalt |
|---|---|
| `index.html` | Startseite: Hero, Problem, Rechenprinzip, Funktionen, Ablauf, Branchen, Stimmen, Preis-Teaser, FAQ |
| `funktionen.html` | Planung, Prüfung, Alltag, Auswertung, Rollenmatrix, Einrichtung |
| `branchen.html` | Die vier Branchenpakete im Detail |
| `preise.html` | Stufen, interaktiver Preisrechner, Standortzuschlag, Pakete, Preis-FAQ |
| `sicherheit.html` | Datenschutz, Artikel 28, Mitbestimmung, Betrieb |
| `wissen.html` | Übersicht der Leitfäden |
| `wissen-rotation.html` | Langartikel: warum ein Dienstplan keine Liste sein sollte |
| `centric-website-einzeldatei.html` | die ganze Website in einer Datei (~1,6 MB) — nur mit `--einzeldatei`, nicht verlinkt, nicht Teil der Auslieferung |
| `centric-hell-vorschau.html` | dieselbe Datei, aber ohne dunkle Flächen — nur mit `--hell`, nur zum Ansehen |
| `ueber-uns.html` | Haltung, Zahlen, Arbeiten bei CENTRIC |
| `kontakt.html` | Formular, Support, AV-Anfragen, Anschrift |
| `faq.html` | Häufige Fragen in vier Gruppen |
| `impressum.html`, `datenschutz.html`, `agb.html`, `barrierefreiheit.html` | Rechtstexte |
| `404.html` | Fehlerseite |

## Gestaltung

**Die Farben stammen aus der Anwendung.** Übernommen ist der Satz `C` aus
`src/farben.js` des Repos `rinats-png/dienstplaner` — der helle Modus, unverändert:

| Rolle | Wert | in der Anwendung |
|---|---|---|
| `--grund` | `#EDF2F4` | `bg` |
| `--flaeche` | `#FFFFFF` | `flaeche` — das Papier |
| `--still` | `#E1EAEE` | `flaecheStill` — Sea Salt |
| `--text` / `--text-dim` / `--text-schwach` | `#071317` / `#3D4E55` / `#5B6B72` | `text` / `dim` / `aus` |
| `--linie` / `--linie-weich` / `--linie-stark` | `#BCCDD4` / `#CBDAE0` / `#9DB3BC` | `line` / `lineSoft` / `lineStark` |
| `--akzent` / `--akzent-hell` / `--akzent-flaeche` | `#017070` / `#028E8E` / `#DFF0F0` | `accent` / `accentHi` / `accentLight` |
| `--sidebar` / `--tief` | `#071317` / `#001619` | `sidebar` / `sidebarTief` |

**Der Aufbau folgt der Anwendung, nicht nur ihre Werte.** Die Farbdatei beschreibt,
dass der Inhalt auf Papier liegt und die Hierarchie aus der dunklen Seitenleiste und
der Typografie kommt, „nicht mehr aus Rändern um jedes Kästchen“. Genau so ist die
Seite gebaut: Inhalt auf `--flaeche`, Grund und Zwischenflächen in Sea Salt — und
die Rolle der Seitenleiste tragen die Klasse `.dunkel` und mit ihr die Halle, die
Midnight-Bänder, die Rechnerausgabe, das Aufrufband und die Fußzeile.

**Auf Dunkel gelten die Töne, die die Anwendung dafür vorsieht:** Traditional
Turquoise `#02A0A0` (5,87:1 auf der Seitenleiste — der Wert, den die Farbdatei
selbst nennt) und Fluorescent Blue `#50E8F4` als Glanzlicht. Auf Papier trägt
stattdessen der abgedunkelte Akzent `#017070`.

**Schichtarten** kommen aus derselben Sammlung, Helligkeit fällt zur Nacht hin:
auf Papier Traditional Turquoise → abgedunkelter Akzent → Natural Indigo
(`#02A0A0` / `#017070` / `#023441`), auf Dunkel Fluorescent Blue → Traditional
Turquoise → Vintage Aqua (`#50E8F4` / `#02A0A0` / `#316C81`). Natural Indigo
trägt auf der Seitenleiste nur 1,4:1 und wird dort durch Vintage Aqua ersetzt.

**Bildmarke und SVG-Grafiken tragen Klassen statt fester Farben** und nehmen die
Werte ihrer Fläche an — dunkel auf Papier, hell auf der Seitenleiste.

**Freie Zeiten treten zurück.** Die Umrisse der freien Rasten sind auf `lineSoft`
zurückgenommen (`#CBDAE0` auf Papier, `#1E3138` auf Dunkel) und dünner gezeichnet.
Übrig bleibt fast nur der Strich; hell wird allein, was belegt ist. Dadurch trägt
das Schichtmuster das Bild, statt gegen einen Kranz aus Umrissen anzukommen — in
der Planleiste, im Rotationsdiagramm, auf den Beispielbögen und auf den Tafeln der
Halle gleichermaßen.

**Der Kopf der Startseite ist die Spiegelhalle:** eine WebGL-Trommel aus
leuchtenden Tafeln über stillem, spiegelndem Wasser, in Blue Charcoal und den
Dunkel-Tönen der Anwendung. Ziehen dreht sie mit Nachlauf, Überfahren hebt eine
Tafel, der Zeiger hinterlässt Ringe im Wasser, die Spiegelung ist eine echte
planare. Ein Klick auf eine Tafel öffnet den Bereich. Drei.js (r0.143.0, MIT)
liegt lokal unter `assets/vendor/` — nichts wird nachgeladen.

**Die Halle ist konvex, nicht konkav.** Die Kamera stand ursprünglich in der
Mitte des Rings: alle Tafeln gleich weit weg, gleich groß, man stand in einer
Rotunde. Jetzt steht sie außerhalb, die Tafeln liegen auf der Außenhaut
(`woelbung: -1`, Tafeln nach außen gedreht, Bildwinkel 46° statt 67°). Aus dem
Raum, in dem man stand, wird ein Gegenstand, den man ansieht — und man sieht,
dass der Zyklus eine geschlossene Runde ist. Der Kameraabstand folgt dem
Seitenverhältnis, damit der Umriss auch hochkant ins Bild passt.

**Schrift in drei Rollen** (alle OFL, unter `assets/fonts/`):

| Rolle | Schrift | wofür |
|---|---|---|
| `--sig` | Jura Light / Medium | Überschriften und Großziffern |
| `--lauf` | Instrument Sans | Fließtext |
| `--zaehl` | Geist Mono | alles Zählbare |

**Der Preisrechner wird über drei Ringe bedient** — dasselbe Bauteil wie in der
Anwendung (`src/ringregler.jsx`), hier in reinem JavaScript: Planer-Zugänge von 1 bis
20, Standorte in ganzen Schritten von 1 bis 30, Personen je Standort in Fünferschritten
von 5 bis 300, damit die Bandgrenzen bei 15, 40, 80 und 150 genau auf einer Raste
liegen. Der Ring ist unten offen, jede Raste ist
antippbar, Strichstärke und Segmentlänge folgen der Teilung — bei drei Standorten
zählt man drei Punkte. Bedienbar mit Zeiger, Tasten und Tastatur; nach außen ein
`role="slider"`. Die Branchenpakete sind Schalter in derselben Formensprache, das
Ankreuzfeld liegt darunter und bleibt bedienbar.

**Der laufende Plan** (das Instrument) folgt auf die Halle: alle 2,4 s rückt das
Gitter um einen Tag vor, eine Helligkeitswelle wandert mit dem Plan, das
Uhrwerk-Diagramm dreht gegenläufig. Bei `prefers-reduced-motion` steht alles —
Halle, Plan, Welle, Ringe — und bleibt vollständig lesbar.

## Formular und Datenschutz

Das Kontaktformular überträgt nichts an einen Server. Es baut aus den Eingaben eine
`mailto:`-Nachricht im Programm der Besucherin. Es gibt keine Cookies, keine externen
Schriften (die drei Schnitte liegen lokal bei), keine Reichweitenmessung — deshalb auch
kein Einwilligungsbanner.

## Vor der Veröffentlichung

Impressum, Datenschutzerklärung und AGB enthalten Platzhalter (Anschrift, USt-IdNr.,
Telefonnummer) und sind als Vorlage gekennzeichnet. Sie müssen durch die tatsächlichen
Angaben ersetzt und rechtlich geprüft werden.
