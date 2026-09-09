# Entwürfe — Planungsansichten

Eine Entwurfsstudie zu den Personal-, Monats-, Jahres- und Einsatzansichten.
**Sie ist mit der Anwendung nicht verbunden.** Kein Modul unter `src/` oder
`netlify/` importiert etwas von hier, und nichts hier importiert aus der
Anwendung. Der Ordner ist ein Anhang, keine Erweiterung.

## Öffnen

    entwuerfe/planungsansichten.html

Eine einzelne Datei ohne Server: im Browser öffnen und lesen. Die Entwürfe
sind bedienbar, soweit es dem Vergleich dient — Filterchips schalten,
Verlaufsstreifen öffnen den Tag, die Personenliste ist sortierbar.

## Woher die Zahlen kommen

`daten.json` stammt aus einem laufenden Prüfbetrieb: fünf Wohnbereiche,
67 Personen, September 2026, ein Drei-Wochen-Zyklus mit Tagesversatz,
21 Abwesenheiten, 24 Abweichungen vom Sollplan.

Die abgeleiteten Größen — Besetzung je Tag und Dienstart, Fachkraftquote,
Stundenkonten, Befunde — wurden nach denselben Regeln gerechnet wie in
`src/App.jsx` (`einheitDienst`, `personTag`, `besetzung`) und anschließend
gegen die gerenderten Tabellen der laufenden Anwendung geprüft: **90 von 90
Besetzungswerten stimmen überein.** Erfundene Zahlen in einem Mockup
beweisen nichts; diese hier tragen.

Namen, Dienstzeiten, Qualifikationen und Rechtsgrundlagen sind die des
Prüfbetriebs, nicht die eines Kunden.

## Aufbau

Die fertige Datei entsteht aus acht Teilen — eine Datei von 158 KB ließe
sich nicht mehr sinnvoll bearbeiten:

    teil-1-kopf.html        Dokumenttypografie und Farbtoken
    teil-2-produkt.html     Produktsprache, gilt nur innerhalb von .schirm
    teil-3-analyse.html     Phase 1 — die acht gemessenen Befunde
    teil-4-entwuerfe.html   Phase 2 — die sechs Rahmen
    teil-5-bewertung.html   Phase 3 und 4 — Vergleich und Empfehlung
    teil-6-code.html        Datenaufbereitung, Entwurf A und B
    teil-7-code.html        Entwurf C und D
    teil-8-code.html        Entwurf E und F

Neu zusammensetzen:

    cd entwuerfe && node bauen.mjs

## Stand

Phase 5 — die Umsetzung — steht aus. Bis eine Variante gewählt ist, bleiben
die bestehenden Ansichten, Komponenten und Datenstrukturen unverändert.
