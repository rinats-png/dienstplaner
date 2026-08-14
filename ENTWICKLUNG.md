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
    npm run dev      # Entwicklung
    npm run build    # nach dist/

## Aufbau

    index.html            Einstieg, Symbole, Manifest
    src/main.jsx          Anmeldung, Preise, Selbststart — alles vor der Anwendung
    src/App.jsx           Die Anwendung
    src/pruefung.jsx      Arbeitszeitprüfung, nachgeladen
    src/speicher.js       Server statt window.storage
    netlify/functions/    Sieben Endpunkte
    netlify/lib/schutz.mjs   Bremse und Protokoll
    netlify/lib/rechte.mjs   Rechteprüfung auf dem Server

## Prüfungen

    npm run pruefung          # alles
    npm run lint              # Linter
    npm run pruefung:codes    # Schlüsselwechsel der Zugangscodes, ohne Server
    npm run pruefung:matrix   # Rechtetabellen auf Drift, ohne Server

Die beiden übrigen brauchen einen laufenden Dienst:

    CENTRIC_ADMIN=testgeheim npx vite --port 5173 &
    CENTRIC_BASIS=http://localhost:5173 CENTRIC_ADMIN=testgeheim npm run pruefung:rechte
    CENTRIC_BASIS=http://localhost:5173 npm run pruefung:bremse

`.github/workflows/pruefung.yml` fährt dasselbe bei jedem Push.

## Rechte an zwei Stellen

Die Rechtetabelle steht doppelt: `MATRIX_STD` in `src/App.jsx` steuert, was
die Oberfläche anbietet. `MATRIX` in `netlify/lib/rechte.mjs` entscheidet,
was der Server zulässt.

Das ist Absicht — was im Browser läuft, gehört dem Browser. Bei einer
Änderung müssen beide nachgezogen werden. Weichen sie ab, gilt der Server:
Die Oberfläche darf weniger zeigen als er erlaubt, niemals mehr.

## Umgebungsvariablen

| Name | Zweck | geheim | Umfang |
|---|---|---|---|
| `CENTRIC_ADMIN` | Verwaltungskennwort für `/einrichten` | **ja** | functions, runtime |
| `CENTRIC_PFEFFER` | Schlüssel für die Zugangscode-Hashes | **ja** | functions, runtime |
| `RESEND_API_KEY` | E-Mail-Versand | **ja** | functions, runtime |
| `CENTRIC_ABSENDER` | Absenderadresse, Domain muss in Resend verifiziert sein | nein | alle |
| `VAPID_PUBLIC` | Web Push, öffentlicher Teil | nein | alle |
| `VAPID_PRIVATE` | Web Push, privater Teil — ohne ihn geht nichts hinaus | **ja** | functions, runtime |
| `VAPID_KONTAKT` | Kontaktadresse für die Push-Dienste | nein | alle |
| `REDIS_REST_URL` | optional: atomarer Zähler für die Bremse | nein | functions, runtime |
| `REDIS_REST_TOKEN` | optional: Token dazu | **ja** | functions, runtime |

Schlüsselpaar für Push erzeugen:

    npx web-push generate-vapid-keys

Pfeffer erzeugen:

    node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

### Was noch von Hand zu tun ist

Netlify lässt das Merkmal „geheim" nur beim **Anlegen** einer Variablen
setzen, nicht beim Ändern. Die vier oben fett markierten Variablen sind
derzeit als nicht geheim hinterlegt und im Umfang `builds` und
`post_processing` — beides sollte nicht sein: So stehen die Werte im
Netlify-UI im Klartext und sind nicht gegen Ausgabe in Build-Protokollen
geschützt.

Der Weg dorthin, je Variable:

1. Wert notieren (Site settings → Environment variables)
2. Variable löschen
3. Neu anlegen, dabei *Contains secret values* ankreuzen und den Umfang auf
   *Functions* und *Runtime* begrenzen

`CENTRIC_PFEFFER` gleich mit anlegen — ohne ihn laufen die Zugangscodes
weiter über den alten, ungeschlüsselten Hash. Bestehende Codes funktionieren
in beiden Fällen; mit Pfeffer werden sie bei der nächsten Anmeldung still
umgeschlüsselt.

`RESEND_API_KEY` sollte bei der Gelegenheit in Resend neu ausgestellt werden
— er lag längere Zeit ungeschützt.
