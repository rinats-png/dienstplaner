# CENTRIC

Dienstplanung für rotierende Schichtbetriebe.

## Aufbau

    src/App.jsx          die Anwendung
    src/main.jsx         Einstieg mit Anmeldung, Preisen und Selbststart
    src/speicher.js      Anbindung an den Server
    server.mjs           der Node-Prozess: liefert dist/ aus und ruft die Funktionen
    server/funktionen/   die Endpunkte (/api, /einrichten, /lage, /starten, /kalender, /zustellung)
    server/lib/          Ablage, Rechte, Bremse, Zugangscodes, Verwalterkonten
    pruefungen/          alle Prüfungen (npm run pruefung)
    deploy/compose.yml   Betrieb als Container

Im Betrieb läuft alles auf einem Server:

    Browser → app.centric-dienstplanung.de → Caddy → Container centric-dp-web
            → server.mjs → server/funktionen + server/lib → Dateien unter /data

Es gibt keine Datenbank und keinen Fremddienst für die Daten. Ausgeliefert
wird über GitHub Actions als Bild nach GHCR; Einzelheiten in
`BEREITSTELLUNG.md`, Entwicklung in `ENTWICKLUNG.md`, Sicherheit in
`SICHERHEIT.md`.

## Entwickeln

    npm install
    npm run build
    npm run pruefung

Für die Oberfläche mit schnellem Neuladen: `node server.mjs` und daneben
`npm run dev` — siehe `ENTWICKLUNG.md`.

## Zugänge anlegen

Einmalig nach der ersten Inbetriebnahme, mit einem Verwalterschlüssel
(`V-XXXXX-XXXXX-XXXXX-XXXXX`, siehe `BEREITSTELLUNG.md`, Schritt 5.1):

    curl -X POST https://app.centric-dienstplanung.de/einrichten \
      -H "content-type: application/json" \
      -H "authorization: Bearer V-XXXXX-XXXXX-XXXXX-XXXXX" \
      -d '{"name":"Mein Betrieb","bestand":"betrieb1","rolle":"leitung"}'

Die Antwort enthält den Zugangscode. Er wird nur als Prüfsumme gespeichert
und lässt sich nicht wiederherstellen. Betreiberzugang, Demobetriebe und
einen leeren Testbetrieb legt `werkzeug/zugaenge-anlegen.sh` in einem Zug
an — wiederholbar, ohne Duplikate.

Jeder `bestand` ist ein eigener, vollständig getrennter Datenraum.
