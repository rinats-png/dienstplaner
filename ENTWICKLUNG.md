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
    src/gestalt/          Gestaltung (Leitstand-Stil), siehe unten
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
    npm run pruefung:kontrast # WCAG-Kontraste beider Paletten, Verlauf, Dienstfarben im Dunkelmodus
    npm run pruefung:gestalt  # Struktur der Gestaltung: keine fremden Adressen, Hexfarben-Obergrenze, Symbole

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


## Gestaltung (Leitstand-Stil)

Die Oberfläche folgt den Entwürfen unter `entwuerfe/leitstand/` (`DESIGN.md`,
`design-tokens.json`, `LAYOUT.md`). Der Code dazu liegt in `src/gestalt/`:

    icons.jsx      Icon: Inline-SVG, 24er Raster, Strich 1,7; keine Bibliothek
    bausteine.jsx  Pille, Trend, Sparkline, Bogen, Fortschritt, Checkliste, Erklaerkasten, Menue
    ansichten.jsx  Bausteine der Ansichten: Abschnittskopf, Grosszahl, Zeitwahl, Statuszeile, Fehlerband
    rahmen.jsx     Kopfzeile mit Bereichs-Pillen, Unterleiste, Ansicht- und Konto-Menü
    stil.js        die Stilregeln dazu (CSS als Text, wird mit bauStyles() in App.jsx zusammengesetzt)
    lesbar.js      Dienstfarben im Dunkelmodus aufhellen (nur Darstellung)

Regeln, die Prüfungen erzwingen oder die man beim Ändern beachten muss:

- **Farben nur aus `src/farben.js`** (`C`, beide Paletten). Neue Farbe: in
  `C_HELL` und `C_DUNKEL` anlegen. Keine neuen harten Hexwerte in `App.jsx`
  (Obergrenze in `pruefungen/gestalt.test.js`, sie darf nur sinken; übrig sind
  Dienstfarben als Daten und Druckvorlagen).
- **Dienstfarben sind Daten.** Angezeigt als Tönung mit Linie (`TON`), das
  Kürzel steht immer dabei. Als Schrift oder Kante auf dunklem Grund läuft die
  Farbe durch `lesbar()`; der Kontrasttest prüft die Regel (Schrift 4,5:1,
  Kante 3:1).
- **Der Verlauf** hinter der Titelzone hat begrenzte Deckkraft; nur `text` und
  `dim` liegen darauf, nie `aus`. Der Kontrasttest rechnet den ungünstigsten Punkt.
- **Kein Textzeichen als Symbol** (✓ ✕ × →): immer `Icon`; ein Icon-Knopf trägt
  `aria-label`, ein Icon, das allein einen Zustand meldet, ein Wort für
  Vorlesesoftware (`className="nurLeser"`).
- **Keine externen Ressourcen**, Inter liegt lokal (`schrift.css`); die CSP in
  `netlify.toml` bleibt unverändert.
- **Zwei Schalen:** Rechner/Tablet (Kopfzeile, ab 1025 px) und die eigene
  Telefonschale der Beschäftigten (`MobilSchale`). Unter 1025 px führt der
  Drawer, die Leiste unten (`.tabbar`) trägt die häufigsten Ansichten.
  Sondermodi: Kompakt (`.dicht`), Feldmodus, Fokus, Druck.
- Ansichts-IDs und `BEREICHE` sind Schnittstellen (Tour, Handbuch, Suche,
  Zähler); sie werden nicht umbenannt.

### Oberflächenvergleich und Bildersatz

Beide brauchen einen Browser und laufen nicht in `npm run pruefung`.

    CENTRIC_ADMIN=vergleich-geheim npx vite --port 5173 &
    export NODE_PATH=<Ordner mit node_modules/playwright-core>
    npm run pruefung:vergleich              # gegen die Basis pruefungen/basis/vergleich.json
    npm run pruefung:vergleich -- --basis   # Basis neu schreiben (erst nach Prüfung jeder Differenz)
    node pruefungen/bildersatz.mjs          # Bilder nach entwuerfe/leitstand/umsetzung/

Der Vergleich hält fest, WAS die Oberfläche zeigt (Text, Knöpfe, Felder,
Tabellenköpfe je Ansicht und Blatt, für Leitung, Betriebsrat, Telefonschale und
Betreiberkonsole), nicht wie sie aussieht. Ein Umbau darf Formen ändern, aber
nichts verlieren; jede Differenz wird erklärt, dann erst kommt die neue Basis.
Der Bildersatz (`bildersatz.mjs`, Testdaten in `testdaten.mjs`) zeigt das Ergebnis.

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
