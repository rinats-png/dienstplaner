# Entwicklung

## Wo der Quelltext liegt

`src/App.jsx` ist die Quelle. Nicht irgendetwas anderes.

Bis August 2026 lag daneben ein Ordner `quelle/` mit 33 Fragmenten und einem
Skript `bau.sh`, das sie zu einer Datei zusammenfügte. Beide Stände waren
auseinandergelaufen: `quelle/` hatte 13.650 Zeilen, `src/App.jsx` 18.612.
Wer in `quelle/` etwas geändert und `bau.sh` ausgeführt hätte, hätte rund
5.000 Zeilen überschrieben — ohne Fehlermeldung.

`quelle/` ist deshalb entfernt. Der Verlauf bewahrt den Stand auf:

    git show 2131442:quelle/a7.jsx

## Bauen und starten

    npm install
    npm run build    # nach dist/

Entwicklung mit schnellem Neuladen — zwei Prozesse, weil Vite nur die
Oberfläche liefert und alles unter `/api`, `/lage`, `/starten`,
`/kalender`, `/zustellung`, `/einrichten` und `/gesund` an den Server
weiterreicht (`server.proxy` in `vite.config.js`, Ziel
`http://localhost:3000`, änderbar über `CENTRIC_ENTWICKLUNG_SERVER`):

    CENTRIC_DATEN=./daten-dev CENTRIC_ADMIN=testgeheim CENTRIC_PFEFFER=dev node server.mjs &
    npm run dev      # Oberfläche auf http://localhost:5173

`daten-dev/` ist eine Wegwerfablage; sie liegt nicht im Git. Der Server
allein (ohne Vite) liefert nach `npm run build` auch die Oberfläche aus
`dist/` — so läuft er im Container.

## Aufbau

    index.html            Einstieg, Symbole, Manifest
    src/main.jsx          Anmeldung, Preise, Selbststart — alles vor der Anwendung
    src/App.jsx           Die Anwendung
    src/pruefung.jsx      Arbeitszeitprüfung, nachgeladen
    src/speicher.js       Server statt window.storage
    server/funktionen/    Sechs Endpunkte
    server/lib/aufraeumen.mjs  täglicher Löschlauf für abgelaufene Testbetriebe (30 + 90 Tage)
    server/lib/schutz.mjs   Bremse und Protokoll
    server/lib/rechte.mjs   Rechteprüfung auf dem Server

## Prüfungen

    npm run pruefung          # alles
    npm run lint              # Linter
    npm run pruefung:codes    # Schlüsselwechsel der Zugangscodes, ohne Server
    npm run pruefung:matrix   # Rechtetabellen auf Drift, ohne Server

Die serverseitigen Prüfungen (Rechte, Sicherung, Verwalter, Demozugänge,
Bremse) brauchen je einen **frischen** Server mit leerer Ablage — die
Bremse zählt das Gesamtaufkommen von `/einrichten` in der Ablage mit, und
zwei Prüfungen gegen denselben Server laufen in 429. `npm run pruefung`
erledigt das über `pruefungen/serverlauf.mjs`: Wegwerfverzeichnis,
`server.mjs` auf freiem Port, Prüfung, Server beenden, aufräumen — je
Prüfung einmal. Einzeln:

    node pruefungen/serverlauf.mjs rechte        # auch: sicherung, verwalter, demozugang, bremse
    npm run pruefung:serverlauf                  # alle fünf nacheinander

Gegen einen bereits laufenden Server (etwa den Container in der CI) gehen
die Prüfungen weiterhin direkt: `CENTRIC_BASIS=… CENTRIC_ADMIN=… npm run
pruefung:rechte`.

`.github/workflows/pruefung.yml` fährt dasselbe bei jedem Push.

## Rechte an zwei Stellen

Die Rechtetabelle steht doppelt: `MATRIX_STD` in `src/App.jsx` steuert, was
die Oberfläche anbietet. `MATRIX` in `server/lib/rechte.mjs` entscheidet,
was der Server zulässt.

Das ist Absicht — was im Browser läuft, gehört dem Browser. Bei einer
Änderung müssen beide nachgezogen werden. Weichen sie ab, gilt der Server:
Die Oberfläche darf weniger zeigen als er erlaubt, niemals mehr.

## Umgebungsvariablen

Alle Werte liest der Server aus der Umgebung des Containers — im Betrieb
aus `/opt/apps/centric-dienstplanung/.env` (Rechte 600, nie im Git;
Vorlage `.env.example`).

| Name | Zweck | geheim |
|---|---|---|
| `CENTRIC_DATEN` | Wurzel der Ablage, Vorgabe `/data` | nein |
| `CENTRIC_ADMIN` | nur vorübergehend: Ursprungsschlüssel, bis das erste benannte Verwalterkonto angelegt ist | **ja** |
| `CENTRIC_PFEFFER` | Schlüssel für die Zugangscode-Hashes — nach dem ersten Code nie mehr ändern | **ja** |
| `RESEND_API_KEY` | E-Mail-Versand | **ja** |
| `CENTRIC_ABSENDER` | Absenderadresse, Domain muss in Resend verifiziert sein | nein |
| `VAPID_PUBLIC` | Web Push, öffentlicher Teil | nein |
| `VAPID_PRIVATE` | Web Push, privater Teil — ohne ihn geht nichts hinaus | **ja** |
| `VAPID_KONTAKT` | Kontaktadresse für die Push-Dienste | nein |
| `REDIS_REST_URL` | optional: atomarer Zähler für die Bremse | nein |
| `REDIS_REST_TOKEN` | optional: Token dazu | **ja** |
| `CENTRIC_AUFRAEUMEN` | `aus` schaltet den täglichen Löschlauf ab (Vorgabe: an) | nein |

Schlüsselpaar für Push erzeugen:

    npx web-push generate-vapid-keys

Pfeffer erzeugen:

    node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

### Geheimnisse

Ob ein Wert im Container angekommen ist, zeigt `GET /einrichten/umgebung`
mit einem Verwalterschlüssel — ja oder nein je Variable, nie der Wert.

`CENTRIC_PFEFFER` gleich mit anlegen — ohne ihn laufen die Zugangscodes
weiter über den alten, ungeschlüsselten Hash. Bestehende Codes funktionieren
in beiden Fällen; mit Pfeffer werden sie bei der nächsten Anmeldung still
umgeschlüsselt.

`RESEND_API_KEY` sollte bei der Gelegenheit in Resend neu ausgestellt werden
— er lag längere Zeit ungeschützt.
