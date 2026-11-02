# WP-26 DSGVO serverseitig — Nachweis

Branch `acc45/security/wp26-dsgvo-server`, Basis `origin/integration/centric-complete` (541ebc2).

## Befund

- **Art. 15:** Die Auskunft entstand nur in der Oberfläche (`App.jsx`, `datenauskunft`). Sie war Text, nicht
  maschinenlesbar. Es fehlten die Stempeldaten mit Ortsbefund, die Markierungen, die Protokolleinträge zur Person und
  alles außerhalb des Bestands (Push-Anmeldung, Kalenderverweis).
- **Aufbewahrung:** Der Löschlauf (`src/aufbewahrung.js`, `raeumen`) lief nur, wenn jemand in der Oberfläche darauf
  drückte.
- **In-App-Sicherungen:** Sie wurden nur nach Anzahl ausgedünnt; ältere Tage blieben unbegrenzt erhalten, samt allem,
  was die Fristen längst gelöscht hatten.
- **Spur:** Sie wurde nur nebenbei aufgeräumt, wenn der Betreiber zufällig die Lage ansah (Zufall 10 %).

## Umsetzung

### Auskunft (`GET /api/auskunft[?person=<id>]`)

Umgesetzt in `server/funktionen/daten.mjs` und `server/lib/auskunft.mjs`.

- **Ohne Angabe:** die eigene Person der Sitzung, vollständig. Dazu gehören der Personendatensatz, Stempel mit Ortsbefund
  (Koordinaten werden nicht gespeichert), Ist-Zeiten, Planabweichungen, Abwesenheiten mit Anmerkung, Anträge,
  Planänderungen und Mitteilungen.
- **Weitere Angaben:** Protokolleinträge zur Personenkennung im eigenen Raum, Push-Anmeldung und Kalenderverweis
  (ja/nein), die Aufbewahrungsfristen, Zwecke, Empfänger und Herkunft (Art. 15 Abs. 1 lit. a–g).
- **Format:** JSON mit `Content-Disposition: attachment`.
- **`?person=` für eine andere Person:**
  - nur Leitung und `kunde` (dieselben Rollen wie bei Sicherungen), nur für eine Person des eigenen Betriebs;
  - Inhalt ist die eigene Sicht der Leitung (`bestandFuerRolle`), keine Rechteerweiterung; die Antwort sagt das;
  - jede andere Rolle bekommt 403, der Betreiber ebenfalls 403, eine Person eines fremden Betriebs 404.
- **Lesen:** streng (H1), gebremst (`lesen`), jede Auskunft wird protokolliert.
- **RECHTEMATRIX:** Fußnote ²¹ als Präzisierung, keine neue Spalte.

### Datenschutzlauf (`server/lib/datenschutzlauf.mjs`)

Er läuft täglich in `server.mjs` zusammen mit dem Löschlauf für Testbetriebe und folgt demselben Schalter
`CENTRIC_AUFRAEUMEN`.

1. **Aufbewahrungsfristen für jeden Betrieb jedes Raums.**
   - Es ist dieselbe reine Rechnung wie in der Oberfläche (`raeumen`): Plandaten nach 24 Monaten, Anonymisierung
     6 Monate nach Austritt, Gründe nach 3 Monaten (jeweils Vorgaben, je Betrieb einstellbar).
   - Geschrieben wird unter der Raumsperre mit Schreibjournal und streng gelesen. Ein unlesbarer Raum wird übersprungen
     und gemeldet, nicht „ohne die Lücke“ geschrieben.
   - Geschrieben wird nur, wenn etwas fällig ist. Jede Bereinigung steht im Protokoll und im Vermerk
     `datenschutzlauf:letzter`.
2. **In-App-Sicherungen nach festem Plan (`sicherungsPlan`, F-26).** Je Kontingent:
   - die 20 neuesten,
   - danach eine je Tag bis 14 Tage,
   - eine je Woche bis 90 Tage,
   - **nichts älter als 90 Tage**.

   Ohne erkennbares Alter bleibt eine Sicherung liegen und wird gezählt. Die Langzeitsicherung außer Haus ist
   restic (BETRIEB-SICHERUNG).
3. **Spur:** nach 30 Tagen gelöscht (`spurAufraeumen` aus `schutz.mjs`, unverändert, jetzt planmäßig aufgerufen).

## Tests

`pruefungen/dsgvo-server.test.js` hat 11 Tests und läuft über `pruefung:dsgvo-server` (CI-Schritt „DSGVO
serverseitig“ und Sammelkette).

| Test | vorher (541ebc2) | nachher |
|---|---|---|
| Eigene Auskunft mit Stempeln + Ortsbefund, Ist-Zeiten, Abwesenheiten, Protokoll, nichts von anderen | 404 (Endpunkt fehlte; die Oberflächen-Auskunft enthielt keine Stempel) | 200 |
| Fremde Person als Mitarbeiterin | 404 | 403 |
| Leitung: eigener Betrieb / fremder Betrieb | 404 | 200 in Leitungssicht / 404 |
| Betreiber | 404 | 403 |
| Löschlauf auf dem Server (Plan, Zeit, Stempel, Gründe, Anonymisierung, idempotent ohne Schreiben) | Modul fehlte (Löschlauf nur in der Oberfläche) | grün |
| Unlesbarer Raum wird übersprungen, nichts gelöscht | – | grün |
| Sicherungsplan (2 Tests) und Löschen in der Ablage | – | grün |
| Spur nach 30 Tagen; Zeitsteuerung in `server.mjs` | – | grün |

Weil Endpunkt und Modul vorher fehlten, waren alle 11 Tests vorher rot.

**Regression lokal:** rechtematrix, rechtematrix-zeilen, sitzungsinventar, verwaltungswege, leserechte,
rollen-failclosed, vollausgabe, sicherungen, aufraeumen, aufbewahrung, personendaten, stempel-datenschutz, sicht und
betreiber-sicht sind grün. Serverlauf: rechte 147/147, vollausgabe 12/12, sicherungen 28/28. eslint 0 Fehler, `tsc`
sauber.

## Folgepunkte (nicht in diesem Paket)

- **Oberfläche (`App.jsx`, anderer Agent):** Die Schaltfläche „Auskunft erzeugen“ und eine Schaltfläche „Meine Daten“
  für jede Person sollen `GET /api/auskunft` aufrufen und die JSON-Datei ausliefern statt der Text-Auskunft. Bis dahin
  ist die Server-Auskunft nur über die Schnittstelle erreichbar.
- **Oberfläche:** Der manuelle Löschlauf bleibt bestehen. Die Seite kann künftig den Vermerk
  `datenschutzlauf:letzter` bzw. `aufbewahrung.zuletztGeraeumt` anzeigen.
- **Protokolleinträge zur Person** werden über Raum und betriebsinterne Personenkennung zugeordnet. Tragen Personen
  verschiedener Betriebe desselben Raums dieselbe Kennung, erscheinen ihre Einträge gemeinsam, weil die Spur den
  Betrieb nicht kennt.
- **Raumweite automatische Sicherungen:** Sie enthalten alle Betriebe eines Raums. Der Plan dünnt sie aus, schneidet aber
  keine einzelnen Felder heraus. Spätestens nach 90 Tagen sind sie weg.
