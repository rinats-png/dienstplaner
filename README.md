# CENTRIC

Dienstplanung für rotierende Schichtbetriebe.

## Aufbau

    src/App.jsx        die Anwendung (eine Datei, direkt bearbeitet)
    src/gestalt/       Gestaltung: Symbole, Bausteine, Kopfzeile, Stilregeln
    src/main.jsx       Einstieg mit Anmeldung
    src/speicher.js    Anbindung an den Server
    netlify/functions/ Datenspeicher und Einrichtung
    pruefungen/        Prüfungen, Oberflächenvergleich, Bildersatz

## Entwickeln

    npm install
    npm run dev

## Bauen

`src/App.jsx` ist die Quelle; einen Ordner `quelle/` mit `bau.sh` gibt es nicht
mehr (siehe ENTWICKLUNG.md).

    npm run build

## Zugang anlegen

Einmalig nach dem ersten Deployment, mit dem Verwaltungskennwort aus den
Netlify-Umgebungsvariablen (CENTRIC_ADMIN):

    curl -X POST https://centric-dienstplanung.netlify.app/einrichten \
      -H "content-type: application/json" \
      -d '{"verwaltung":"KENNWORT","name":"Mein Betrieb","bestand":"betrieb1"}'

Die Antwort enthält den Zugangscode. Er wird nur als Prüfsumme gespeichert
und lässt sich nicht wiederherstellen.

Jeder `bestand` ist ein eigener, vollständig getrennter Datenraum.
