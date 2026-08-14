# CENTRIC

Dienstplanung für rotierende Schichtbetriebe.

## Aufbau

    src/App.jsx        die Anwendung (aus quelle/ zusammengesetzt)
    src/main.jsx       Einstieg mit Anmeldung
    src/speicher.js    Anbindung an den Server
    netlify/functions/ Datenspeicher und Einrichtung
    quelle/            die Einzelteile, aus denen App.jsx gebaut wird

## Entwickeln

    npm install
    npm run dev

## Neue Fassung bauen

    cd quelle && ./bau.sh && cp CENTRIC.jsx ../src/App.jsx
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
