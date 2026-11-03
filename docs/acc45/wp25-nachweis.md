# WP-25 Wiederherstellen in der Oberfläche: Nachweis

Branch `acc45/infra/wp25-wiederherstellen-ui`, Basis `origin/integration/centric-complete` (9abf988, enthält WP-26 und
WP-45b bis d).

## Umsetzung

Die Leitung legte Sicherungen schon in der Oberfläche an, zurückspielen ging nur über die Schnittstelle. Jetzt gibt es
unter Einstellungen den Abschnitt **Sicherungen**:

- **Liste** der In-App-Sicherungen des eigenen Betriebs (`GET /api/sicherungen`): Zeit in Berliner Zeit, Umfang
  (Betrieb oder ganzer Raum, dann mit dem Hinweis, dass nur dieser Betrieb zurückgespielt wird), automatisch oder von
  wem.
- **Zurückspielen** (`POST /api/wiederherstellen`) mit **Bestätigungsdialog**. Der Text nennt:
  - den Umfang: nur der eigene Betrieb, andere Betriebe des Raums bleiben;
  - dass der Stand seit der Sicherung fehlt und der jetzige Stand vorher automatisch gesichert wird;
  - dass Vertrag, Protokoll, anonymisierte Personen und Zugänge bleiben;
  - die Aufbewahrungsfristen (WP-26).
- **Rechte** laut RECHTEMATRIX, dieselben Rollen wie der Server: Liste für Leitung und Kundenrolle, Zurückspielen nur für
  die Leitung. Die Kundenrolle sieht keinen Knopf. Beschäftigte, Planung, Schichtverantwortung und Betriebsrat sehen den
  Abschnitt nicht.
- **Antworten, die die Leitung versteht** (`src/sicherungen-ui.js`, `ergebnisMeldung`):
  - 200: „Zurückgespielt“, dazu die **Fristen-Meldung** aus WP-26 (`fristen`). Bei `CENTRIC_DATENSCHUTZLAUF` `vorschau`
    oder `aus` heißt sie „nach den Fristen fällig, aber nicht gelöscht“, bei `an` „entfernt“. Danach „Neu laden“.
  - 403 mit `neuAnmelden`: Anmeldung muss jünger als 20 Minuten sein.
  - 409: Bestand inzwischen geändert, neu laden.
  - 429: Bremse.
  - **503 `BESTAND_UNLESBAR`**: Text mit Verweis auf den Betreiber und BETRIEB-SICHERUNG, Abschnitt 4a „Unlesbare
    Datei“ (Zurückspielen ist dann absichtlich gesperrt).
- `src/speicher.js`: `sicherungen()` wirft bei einer Absage, statt still eine leere Liste zu liefern. Neu
  `wiederherstellen(marke)` schreibt Ausstehendes zuerst, schickt den ETag des letzten Ladens mit und übernimmt den
  neuen. Liegt noch ein gescheiterter Schreibversuch vor, weist es ab, statt ihn zu überschreiben.
- Der Text „Zurückspielen in Vorbereitung“ (WP-41) steht auf diesem Stand noch nicht in der Oberfläche. Der Satz
  „auf die sich später zurückgehen lässt“ ist ersetzt. Beim Zusammenführen mit WP-41 entfällt dessen Hinweis; der
  Handbuchsatz „Oberfläche in Vorbereitung (WP-25)“ gehört dann angepasst.

## Tests

`pruefungen/wiederherstellen-ui.test.js` (12 Tests, `npm run pruefung:wiederherstellen-ui`, im CI-Gate):

- Regeln: dieselben Rollen wie der Server, kein Recht für alle anderen.
- Texte und Deutung jeder Antwort.
- Gerendert: Leitung mit Knöpfen, Kundenrolle ohne, leere Liste und Fehler werden gesagt.
- Gegen den echten Server-Handler:
  - anlegen, auflisten, zurückspielen mit `fristen` (Vorgabe `vorschau`: nichts gelöscht);
  - 409 bei altem ETag;
  - 403 für die Kundenrolle beim Zurückspielen und für Beschäftigte bei der Liste;
  - 503 bei unlesbarer Scherbe.
- `speicher.js` schickt Marke und ETag mit und übernimmt den neuen.

**Rot vorher:** Die Prüfdatei lässt sich auf dem Basisstand nicht einmal laden: `src/sicherungen-ui.js` und
`SicherungenVerwalten` fehlen. Die Server-Fälle gelten schon auf dem Basisstand, weil WP-25 den Server nicht ändert.
Sie sind der Nachweis, dass die Oberfläche genau diese Antworten deutet.

Lokal gezielt: `wiederherstellen-ui` 12/12, `sicherungen`, `oberflaeche-selbstservice` grün, eslint ohne Fehler.
`oberflaeche-render` läuft mit 22/22 grün, wenn das Zeitlimit von 5 s nicht greift. Unter Last (zwei Agenten zugleich)
überschritten einzelne Fälle die 5 s, in wechselnder Zahl. Mit `--testTimeout=60000` 22/22.

## Offen

- Die Browserprüfung (Playwright) und die Prüfung auf Telefonbreite stehen aus; geprüft ist das Rendern und der
  Server-Weg, nicht der Klick im Browser.
- Kein Vorschau-Schritt mit Diff: Die Akzeptanz nennt „Vorschau“. Umgesetzt ist die Beschreibung des Umfangs im
  Bestätigungsdialog (Zeit, Umfang, Folgen), aber keine Gegenüberstellung der Inhalte. Eine echte Vorschau bräuchte
  einen Lese-Endpunkt für den Inhalt einer Sicherung; den gibt es nicht.
- Eine Sicherung aus der Zeit vor einer Wiederherstellung (§4a, Standfolge) gilt nur für das Werkzeug
  `ablage-pruefen`, nicht für die In-App-Sicherungen; sie sind betriebsbezogen und tragen keine Standnummern.
