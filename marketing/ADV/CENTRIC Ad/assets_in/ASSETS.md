# Materialliste · CENTRIC Spec-Ad (Idee A „Elf Stunden.“)

**Status:** wartet auf dein OK. Es wird nichts heruntergeladen. Alles stammt aus diesem Repository oder wird im Code erzeugt.

## Festgelegt (aus deinem OK zum Briefing)

- Idee **A „Elf Stunden.“**
- Aussprache **„Sentrik“** (englisch). Im Sprechertext steht deshalb „Sentrik“ statt CENTRIC.
- Stimme **Bernhard** (ElevenLabs v3, ID `WDb8QOTdO9U9QZDXuLLT`, deutsch, sonor).
- SFX und Musik im Code, Schrift Inter Display, End Card wie in Abschnitt 6 des Briefings beschrieben.

## A · Marke

| Nr. | Datei / Quelle | Verwendung | Lizenz |
|---|---|---|---|
| A1 | Bildmarke aus `src/marke.jsx` (Pfade `BALKEN`, `SCHWUNG`, `LINIE`) | Logo in Beat 4, 10, End Card | eigene Marke |
| A2 | Farben aus `src/farben.js` (`#02A0A0` Marke, `#017070` Akzent, `#023441` Tief, `#071317` Midnight, `#50E8F4` Glanz) | Markenschein, Akzente | eigene Marke |
| A3 | Wortmarke „CENTRIC“ in Inter, gesperrt wie im App-Kopf | Logo, End Card | SIL OFL 1.1 |

## B · Echte App-Screenshots (vorhanden, `entwuerfe/leitstand/umsetzung/`)

| Nr. | Datei | Beat |
|---|---|---|
| B1 | `leitung-plan-hell.jpg` / `leitung-plan-dunkel.jpg` | 5 (Monatsplan, Match-Cut, Parallax) und 6 (Lücke im Plan) |
| B2 | `leitung-folge-hell.jpg` | 5 (Schichtmodell einmal anlegen) |
| B3 | `dialog-krankmeldung.jpg` | 6 (Krankmeldung, „schlägt Ersatz vor“) |
| B4 | `leitung-pruef-hell.jpg` | 7 (Was geprüft wurde, Regelstand 2026.09) |
| B5 | `telefon-heute-hell.jpg` | 8 (Einstempeln) |
| B6 | `telefon-plan-hell.jpg` | 8 (Plan am Handy) |
| B7 | `leitung-boerse-hell.jpg` | 8 (Tauschbörse) |
| B8 | `leitung-quals-hell.jpg`, `leitung-untergrenzen-hell.jpg`, `leitung-einsatz-hell.jpg` | 9 (Branchen-Details) |
| B9 | `leitung-start-dunkel.jpg` | Reserve für die End Card |

## C · Neu aufzunehmende Screenshots (kein Download, braucht trotzdem dein OK)

Die vorhandenen Bilder sind 1440 px breit. Für sauberes 4K-Material bei Zooms und für das Hochformat nehme ich **dieselben Ansichten in doppelter Auflösung (2×)** neu auf. Das läuft mit dem vorhandenen Werkzeug `pruefungen/bildersatz.mjs` im Headless-Chromium, mit den Testdaten aus `pruefungen/testdaten.mjs` und fester Uhrzeit (Di, 29.9.2026, 09:00). Es entsteht **keine Aufnahme deines Bildschirms**.

| Nr. | Ansicht | Modus |
|---|---|---|
| C1 | Monatsplan, Schichtfolge, Prüfung, Tauschbörse, Qualifikationen, Untergrenzen | hell und dunkel, 2× |
| C2 | Krankmeldung-Dialog | hell, 2× |
| C3 | Telefon: Heute, Mein Plan, Anliegen (Tausch) | hell, 2× bei 390 px |

Ablage: `marketing/ADV/CENTRIC Ad/assets_in/screens/`.

## D · Schrift

| Nr. | Datei | Lizenz |
|---|---|---|
| D1 | `node_modules/@fontsource-variable/inter/files/inter-latin-opsz-normal.woff2` (variable Achsen Gewicht + optische Größe → „Display“) | SIL OFL 1.1 |

## E · Ton

| Nr. | Was | Quelle |
|---|---|---|
| E1 | Sprecher Bernhard, 2 Takes | ElevenLabs v3 über Creative Fabrica (**kostet Guthaben**, siehe unten) |
| E2 | Musik 96 BPM | im Code synthetisiert, lizenzfrei |
| E3 | Alle SFX (ca. 80 Einsätze in 6 Kategorien) | im Code synthetisiert, lizenzfrei |

## F · Fotos

Keine. Idee A kommt ohne Fotos aus.

## Guthaben-Schätzung für die Stimme

- Text mit Aussprache-Schreibweisen: **747 Zeichen** je Take.
- **2 Takes in einem Aufruf:** 2 × 747 = **ca. 1.500 Zeichen**.
- Creative Fabrica berechnet ElevenLabs v3 „dynamisch je Anfrage“ und nennt vorab keinen festen Münzpreis. Der Betrag erscheint erst beim Absenden, eine fehlgeschlagene Erzeugung wird erstattet.
- Zum Vergleich: Bei ElevenLabs selbst kosten 1.500 Zeichen mit v3 etwa 1.500 Credits.
- Danach wird **nichts mehr** an Stimme erzeugt, außer du willst eine Korrektur.

## Was als Nächstes passiert, wenn du „los“ sagst

1. Ein Aufruf: Bernhard, 2 Takes. Danach schicke ich dir beide zum Anhören.
2. Parallel und kostenlos: 2×-Screenshots (C), Musikskizze, SFX-Bank.
3. Danach PREVIEW v1 (16:9) + Kontaktbogen, auf die gewählte Aufnahme getimt.
