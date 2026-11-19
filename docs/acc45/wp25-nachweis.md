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

## Review (bece9cc: nicht integrierbar) und Nachbesserung

Basis jetzt: `origin/merge/wp17-06` (Integration plus WP-17 und WP-06, PR #47 noch offen), damit der Dialogtext dem Stand
nach WP-06 folgt. Konflikte in `package.json` (Sammelzeile `pruefung`: nichts herausgefallen, `pruefung:fachpruefung`,
`pruefung:branchenmodule`, `pruefung:doku` und `pruefung:wiederherstellen-ui` stehen darin) und `src/App.jsx` (Text der
Zeile „Sicherung anlegen“) von Hand gelöst. Wird #47 zuerst gemerged, läuft der Merge dieses Branchs ohne Konflikt weiter.

| Befund | Umsetzung | Test |
|---|---|---|
| **BLOCKER** `laden={akt.sicherungenLaden}` und `zurueckspielen={akt.zurueckspielen}` fehlten im Aktionsobjekt der App: Liste blieb bei „Lädt …“, ein Klick endete im TypeError | `sicherungenAktionen(SP)` in `src/sicherungen-ui.js` liefert `sicherungenLaden` (→ `SP.sicherungen`) und `zurueckspielen` (→ `SP.wiederherstellen`); das Aktionsobjekt der App setzt sie ein (`...sicherungenAktionen(SP)`). Fehlt eine Aktion, steht in der Oberfläche „nicht angeschlossen (Programmfehler)“ statt eines ewigen „Lädt …“. | Die echte Komponente `Einstellungen` wird eingeloggt als Leitung gerendert (`SP.anmelden` gegen eine Fetch-Attrappe): ein aufzeichnendes `akt` zeigt, dass genau diese beiden Aktionen gelesen werden; mit den Aktionen der Fabrik erscheint „Lädt“, ohne sie (Stand der ersten Fassung) der Fehler; die Fabrik ruft `SP.sicherungen` und `SP.wiederherstellen(marke)`. Kundenrolle: Liste ohne „Zurückspielen“, Beschäftigte: kein Abschnitt. |
| **MITTEL** Dialogtext nannte nicht, was verloren geht | `BESTAETIGUNG` (Umfang, „Das bleibt“, „Das geht auf den Stand der Sicherung zurück“, „Gut zu wissen“) in drei Abschnitten, gerendert von `BestaetigungsText`. Es **bleibt**: Stempel samt Korrekturen und abgeleiteter Ist-Zeit (dazu Stempel nur der Sicherung), Protokoll mit Eintrag zur Wiederherstellung, Planänderungen, Vertrags- und Rechnungsangaben, Zugänge, Zustellwege, Bank-/Steuer-/Lohnangaben, anonymisierte Personen, andere Betriebe. Es **geht zurück**: Plan, Freigaben und Planstände, Personen (neu angelegte fehlen, ihre Stempel bleiben), Stammdaten, Einstellungen, Dienstarten, Einheiten, Regelwerk, Abwesenheiten, Anträge, Wünsche, Mitteilungen, Ist-Zeiten ohne Stempel. Dazu die Vorab-Sicherung und der Fristenmodus. | Der Dialog wird gerendert (`vorgabe.auswahl`) und auf alle Aussagen geprüft. **Jede Aussage wird am Server belegt**: `betriebWiederherstellen` mit einem Betrieb, der Stempel mit Korrektur, eine neu angelegte Person, geänderten Plan/Einstellungen, ein Protokoll, Planänderungen, abweichenden Vertrag und eine anonymisierte Person hat; Fristen bei `vorschau` (gemeldet) und `an` (entfernt). |
| 404/422/403/503 | gezielte Texte, jeweils mit „Es wurde nichts geändert“ und dem nächsten Schritt: 403 (nicht erlaubt, mit Text des Servers), 404 (Sicherung nicht (mehr) da, ausgedünnt, Liste neu laden), 422 (Sicherung unbrauchbar, andere wählen oder Betreiber), 503 ohne Code (belegt/neu gestartet), 400. | `ergebnisMeldung` für jeden Status. |
| Handbuch | `docs/handbuch/leitung.md` und `docs/RESTORE-ANLEITUNG.md`: Der Satz „Oberfläche in Vorbereitung (WP-25)“ ist ersetzt durch den Weg in der Oberfläche und die Aussage, was bleibt und was zurückgeht. | `pruefung:doku` |

Grenze der Verdrahtungsprüfung: Das Aktionsobjekt entsteht in `App()` und lässt sich nicht aufrufen. Deshalb gibt es eine
einzige Quelltext-Prüfung, dass `...sicherungenAktionen(SP)` genau einmal dort steht; alles andere läuft über echtes Rendern.
Eine Browserprüfung (Playwright) bleibt offen.
