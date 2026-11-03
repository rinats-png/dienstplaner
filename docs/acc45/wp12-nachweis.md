# WP-12 — Integrationsabnahme Kette A + Kette B: Nachweis

Branch `acc45/qa/wp12-integrationsabnahme`, Basis `integration/centric-complete` (7b96e7a, enthält WP-10/11 und
Kette B mit WP-43). Grundlage: Testplan Abschnitte 3.1–3.4, QUALITY-GATES G1/G2.

## Umfang und Vorgehen

Kette A (Bestätigungsprotokoll, Regelregister, eine Schutzprüfung, MuSchG-Einwilligung, Jugendschutz-Schalter,
Selbstplanungs-Hinweise, Beschäftigungsmodell/Monatsgrenze) und Kette B (H8+, Positivkataloge je Rolle, WP-43
Personaldaten-Filter, Einsatzregeln statt Schutzmerkmal) wurden **zusammen** abgenommen:

1. **Bestehende Abnahmetests beider Ketten** gezielt lokal ausgeführt (24 Suiten, 1219 Prüfungen, Liste unten).
2. **Neue Abnahme über die Schnittstelle** — [`pruefungen/abnahme-a-b.test.js`](../../pruefungen/abnahme-a-b.test.js),
   25 Prüfungen. Die bisherigen Rundreisen prüfen `rechte.mjs`/`sicht.mjs` direkt; diese schickt die Fälle durch
   `daten.mjs` (Sitzung, Rolle, Bremse, Raumsperre, Zusammenführen, Gestalt) und die echte Dateiablage (Kern und
   Monatsscherben), mit **einem** Bestand, der die Felder beider Ketten zugleich trägt:
   - GET je Rolle (Beschäftigte, eigene Person mit Schutzmerkmal, Betriebsrat, Schichtverantwortung, Planung,
     Leitung) = Bibliothekssicht auf den gespeicherten Stand — Transport und Ablage verlieren und ergänzen nichts;
   - Lesen je Rolle × Feld an Zeilen der Rechtematrix (Bank/Lohn, Kontakt, Schutzmerkmal roh/neutral,
     Bestätigungsprotokoll inkl. Zählwerte für den Betriebsrat, Beschäftigungsmodell/Monatsgrenze,
     Selbstplanungs-Hinweise, Krankheitsnotiz);
   - Rundreise GET → PUT unverändert → gespeichert wertgleich für jede schreibende Rolle; Betriebsrat 403;
   - Kette A beim Speichern über HTTP: Bestätigung mit Wer/Zeit vom Server, Rechtsverstoß nicht bestätigbar
     (403), Schichtverantwortung nicht für fremde Bereiche, MuSchG ohne/mit Einwilligung (20–22 Uhr) und Nacht,
     Jugendschutz (15-Jährige) und Schalter nur durch Planung/Leitung;
   - Verborgenes bleibt beim Schreiben unberührt (Schichtverantwortung, Beschäftigte).
3. **UI = Server:** Rechtetabelle Oberfläche ↔ Server (`pruefungen/matrix.mjs` in `rechtematrix`), Grundarten
   der Bestätigung (`kette-a-rundreise`), eine Schutzprüfung im Code (`schutzpruefung-eine`), Regelregister
   Oberfläche ↔ Server (`regelregister`) — alle grün.

## Ergebnis

| Prüfung | Ort | Ergebnis |
|---|---|---|
| `abnahme-a-b` (neu, 25) | lokal Windows | 25/25 nach Korrektur B-1; vor der Korrektur rot (SV-Rundreise 403) |
| 24 Suiten Kette A + B (1219) | lokal Windows, parallel | 1218/1219; `datenintegritaet` R1 einmal rot unter Parallellast, einzeln 12/12 — Zeitverhalten des Laptops, siehe B-3 |
| Vollregression | CI Linux (`Prüfung`, `Sicherheit`, `Lieferkette`, `Betrieb`) | siehe Commit-Status des Branch-Kopfs |

Gezielt ausgeführte Suiten: `kette-a-rundreise`, `rechtematrix-zeilen`, `rechtematrix`, `nachpruefung-wp11`,
`schutzpruefung-eine`, `schutzmerkmale-sicht`, `sicht-planung-leitung`, `sicht-schichtverantwortung`,
`datenschutz-schutz`, `review-wp10`, `review-wp11`, `regelregister`, `sicht`, `leserechte`, `warnen`,
`konsistenz`, `datenintegritaet`, `personendaten`, `beschaeftigung`, `schutzregeln-ersatzsuche`,
`wiederherstellung-schutz`, `stempel-datenschutz`, `regelwerk`, `sicht-tagesgenau`.

## Befunde

| # | Befund | Bewertung | Stand |
|---|---|---|---|
| B-1 | Trägt eine gespeicherte Person kein `qualifikationen` (Altbestand), liefert GET sie angeglichen (`qualifikationen: []`), PUT führte aber gegen den **nicht** angeglichenen Stand zusammen. Ein unverändertes Zurückschreiben der Schichtverantwortung galt damit als Änderung fremder Personen → **403** „Angaben anderer Personen ändert die Leitung“. Andere Rollen waren nicht betroffen. | Funktionsfehler (Speichern der Schichtverantwortung auf Altbeständen unmöglich) | **behoben** in `server/funktionen/daten.mjs`: PUT führt gegen `personenAngleichen(jetzt.bestand)` zusammen — dieselbe Form wie GET. Rot vorher, grün nachher: `abnahme-a-b` › 3 › SV. Geschrieben wurde schon bisher angeglichen (`personenAngleichen` auf das Ergebnis), es ändert sich also nichts an der gespeicherten Form. |
| B-2 | Die 409-Antwort von PUT liefert `bestandFuerRolle(erg.bestand)` ohne `personenAngleichen`, GET mit. | Info — seit B-1 ohne Folge (ein Zurückschreiben aus beiden Formen wird gleich behandelt) | offen, kosmetisch |
| B-3 | `datenintegritaet` R1 (50 gleichzeitige Stempel) unter paralleler Testlast auf dem Laptop einmal rot, einzeln grün. | Plattform/Zeit, kein Funktionsbefund; maßgeblich Linux-CI (QUALITY-GATES) | beobachten |

## Nicht in diesem Nachweis — offen

- **Testplan 3.1 auf Staging** (Rollen × Kernaufgaben × Desktop/Tablet/Telefon, Viewports, Konsolenfehler,
  Antwortzeit): braucht den isolierten Staging-Container und die Browser-Regression (WP-33). Dieses Paket hatte
  keinen Zugriff auf Staging/VPS; der Lauf ist durch die QA mit Zugang nachzuholen. Die Stufen A/B (Bibliothek und
  Schnittstelle) sind hier abgedeckt.
- **3.3 Art.-15-Auskunft, Löschlauf serverseitig:** WP-26 (in Integration), nicht Teil von A+B.
