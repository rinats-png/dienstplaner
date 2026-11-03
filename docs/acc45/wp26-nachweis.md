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

Umgesetzt in `server/funktionen/daten.mjs` und `server/lib/auskunft.mjs`. Die Aufbewahrungsrechnung liegt jetzt unter `server/lib/aufbewahrung.mjs`, weil das Serverbild `src/` nicht enthält; `src/aufbewahrung.js` verweist für die Oberfläche darauf.

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
- **RECHTEMATRIX:** Fußnote ²⁶ als Präzisierung, keine neue Spalte (bis zum Merge mit WP-10 ²¹; ²¹–²⁵ gehören WP-10).

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

## Review-Auflagen (Agent F, 2c1aa8e: Ablehnung) — umgesetzt

| Nr | Umsetzung |
|---|---|
| H1 | `minusMonate` rechnet arithmetisch statt mit einer Schleife; Infinity/NaN werfen sofort. `aufbewahrungFehler`: Fristen nur als ganze Zahl 1–600 (fehlt/null/0 = Vorgabe), `zuletztGeraeumt` nur als Datum. `pruefeGestalt` weist ungültige Werte ab (PUT → 422, wie jeder Gestaltfehler dieses Pfads). Der Lauf prüft zusätzlich und **überspringt und meldet** einen Betrieb mit ungültigen Werten (fail-closed). |
| H2 | Harte Untergrenze: Plan-, Zeit- und Stempeldaten nie unter 24 Monaten (`stichtage`: `max(Frist, PLANDATEN_MINDEST)`) — für Lauf, Oberfläche (gleiche Rechnung) und Wiederherstellen. Vor jedem löschenden Schreiben eine automatische Sicherung des alten Stands. Eine Frist unter 24 wird weiter gespeichert (bestehende Betriebe sollen nicht blockiert werden) und in der Vorschau gewarnt, löscht aber nicht früher. |
| H3 | Wiederherstellen lehnt Sicherungen von vor dem letzten Löschlauf nicht mehr ab, sondern schickt den zurückgespielten Betrieb mit den heutigen Fristen erneut durch `raeumen`; anonymisierte Personen bleiben anonymisiert. Schalter **`CENTRIC_DATENSCHUTZLAUF`**: `aus` / `vorschau` (**Vorgabe**: berichtet in Protokoll und Vermerk, löscht nichts — auch keine Sicherungen, keine Spur) / `an`. In `.env.example` und `ENTWICKLUNG.md`. Kein zweiter gleichzeitiger Lauf (übersprungen). |
| M1 | Auskunft durch die Leitung: kein Protokoll, kein Push-, Kalender- oder Kontostatus. Fußnote ²⁶ (vorher ²¹) korrigiert. |
| M2 | Spur-Zeilen tragen `mandantId` (`schutz.mjs`, `wer.mandantId` aus der Sitzung). Die Auskunft nimmt nur Zeilen desselben Betriebs; ältere Zeilen ohne Betrieb nur in Räumen mit genau einem Betrieb. |
| M3 | Fremde Anträge, an denen die Person als Tauschpartner beteiligt ist, nur im Gerüst (`id`, `typ`, `von`, `bis`, `status`, `personId`, `partnerId`); tote Filter entfernt. |
| M4 | Ergänzt: Plan aus Schichtfolge (±2 Monate), eigene Einträge der Sammlungen aus der Sicht einer Beschäftigten (`wuensche`, `einspruenge`, `fahrzeiten`, `checks`, `ansichten`, `notrufe`, `kompetenzen`, `einarbeitung`, `betriebsmittel`, `sondereinsaetze`, `urlaubsrunde`, `selbstplanung`, eigene Bewerbungen), Betriebsprotokoll mit eigener Kennung, Konto ohne Geheimnisse, von der Leitung erteilte Auskünfte. „Vollständig" gestrichen; der Hinweis nennt die Lücken (Sitzungen/Geräte, Handlungen anderer außer Auskünften, Betriebsprotokoll ohne Kennung, Sicherungsinhalte, Protokoll > 30 Tage). |
| M5 | Eigene Bremse `auskunft` (30 je Stunde und Betrieb); Spur nur der letzten 30 Tage gelesen. Die Spur ist nach Tag/Art abgelegt, nicht nach Raum — eine Präfixsuche je Raum wäre eine Umstellung des Protokollformats (Folgepunkt). |
| N1 | `sicherungsPlan`: die 20 neuesten je Kontingent bleiben immer, auch wenn sie älter als 90 Tage sind. |
| N2 | durch die Ganzzahlprüfung (H1). |
| N4 | Die Aufbewahrungsrechnung liegt seit ab108fb unter `server/lib/aufbewahrung.mjs` (das Serverbild enthält `src/` nicht); `src/aufbewahrung.js` verweist darauf; `pruefungen/sicht.test.js` liest von dort. |

**Tests, rot vorher:** `dsgvo-server.test.js` (jetzt 22) und der angepasste Test in `sicherungen.test.js` gegen einen Export von 2c1aa8e (eigener Ordner, nicht der Arbeitsbaum): 17 rot (u. a. PUT „Infinity" → 200; Leitung bekommt Protokoll; fremder Antrag mit „Arzttermin"; Wiederherstellen → 409; Vorschau löschte; keine Schutzsicherung; Bremse fehlte). Die beiden Fälle „Infinity in minusMonate" und „ungültige Frist in der Ablage" lassen sich gegen den alten Stand nicht als Test laufen lassen — sie **hängen** den Prozess: `minusMonate("2026-11-02", Infinity)` brach nach 5 s Zeitgrenze ab (Exit 124), jetzt wirft sie sofort. Nachher alle grün.

Geänderter bestehender Test: `sicherungen.test.js` „keine Sicherung von vor oder vom Tag des letzten Löschlaufs" → „zurückgespielt, Fristabgelaufenes bleibt gelöscht" (H3, ausdrücklich verlangt).
