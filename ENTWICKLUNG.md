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

## Rechte an zwei Stellen

Die Rechtetabelle steht doppelt: `MATRIX_STD` in `src/App.jsx` steuert, was
die Oberfläche anbietet. `MATRIX` in `netlify/lib/rechte.mjs` entscheidet,
was der Server zulässt.

Das ist Absicht — was im Browser läuft, gehört dem Browser. Bei einer
Änderung müssen beide nachgezogen werden. Weichen sie ab, gilt der Server:
Die Oberfläche darf weniger zeigen als er erlaubt, niemals mehr.

## Umgebungsvariablen

| Name | Zweck | geheim |
|---|---|---|
| `CENTRIC_ADMIN` | Verwaltungskennwort für `/einrichten` | ja |
| `RESEND_API_KEY` | E-Mail-Versand | ja |
| `CENTRIC_ABSENDER` | Absenderadresse, Domain muss in Resend verifiziert sein | nein |
| `VAPID_PUBLIC` | Web Push, öffentlicher Teil | nein |
| `VAPID_PRIVATE` | Web Push, privater Teil — ohne ihn geht nichts hinaus | ja |
| `VAPID_KONTAKT` | Kontaktadresse für die Push-Dienste | nein |

Schlüsselpaar erzeugen: `npx web-push generate-vapid-keys`
