# WP-18 – Pre-Deploy-Runbook Offline-Warteschlangen

Stand: 2026-11-09. Ergänzt [WP-18-NACHWEIS.md](WP-18-NACHWEIS.md) 9.3 und den Schritt „Vor Deploy prüfen“ in
[BETRIEBSHANDBUCH.md](../BETRIEBSHANDBUCH.md). Dieses Dokument ist die prüfbare Form. Es ist ein Runbook für den Betreiber,
kein Serverskript: der Server sieht die Geräte-Warteschlangen nicht.

## 1. Sachstand (belegt)

- **Warteschlange liegt auf dem Gerät.** Ein Stempel mit Server-Antwort `STEMPEL_FREMDE_SITZUNG` (409) wird im Client auf
  `halt` gesetzt, nicht gelöscht und nicht erneut gesendet (`src/stempelpuffer.js`, `antwortArt`).
- **Inhaber-Änderung durch den Deploy.** Der Stempel-Inhaber ist ein Hash aus Bestand, Betriebsteil und Person
  (`server/funktionen/daten.mjs`, `stempelInhaber`, `betriebsteil`). Er ändert sich für:
  Konto-Sitzungen mit Funktionsrolle, alle Sitzungen in Betrieben mit rein numerischer Raum-ID, alte Code-Sitzungen ohne
  Betriebsnummer.
- **Folge.** Stempel mit altem Inhaber werden nach dem Deploy nicht mehr gesendet und bleiben auf dem Gerät liegen.
- **Kein automatischer Wiederanlauf.** Verworfen wird nichts durch den Client. Ein Verlust tritt nur ein, wenn der
  Gerätespeicher gelöscht wird oder das Gerät verloren geht.
- **Ablage.** Daten liegen als JSON-Dateien unter `CENTRIC_DATEN` (Vorgabe `/data`), Unterverzeichnis je Store, Dateiname =
  Schlüssel mit Prozent-Kodierung (`server/lib/ablage.mjs`). Die Zählung in P1/P2 ist eine reine Leseauswertung.

## 2. Prüfschritte

Reihenfolge ist bindend. Jeder Schritt braucht einen Nachweis im Feld rechts. Ohne Nachweis gilt er als nicht bestanden.

| Nr | Prüfung | Vorgehen (nur lesend) | Nachweis |
|---|---|---|---|
| P1 | Betriebe mit numerischer Raum-ID | Auf dem Server im Store-Verzeichnis die Schlüssel der Raumdaten auflisten, Filter auf Raum-IDs `^\d+$`. Kein Schreibzugriff. | Liste der Betriebs-IDs und Anzahl; ohne Personendaten. Datum, Name der Person, die gelesen hat. |
| P2 | Konten mit Funktionsrolle | Mitgliedschaften lesen, Filter auf Funktionsrolle. Nur Zählung je Betrieb, keine Namen. | Anzahl je Betrieb; Datum; Person. |
| P3 | Geräte leer | Je betroffenem Betrieb: Schichtverantwortung bestätigt schriftlich, dass alle betroffenen Geräte online waren und keine Stempel mehr ausstehen (oder die Stempel nachgetragen sind). | Bestätigung je Betrieb mit Datum und Name der Schichtverantwortung. |
| P4 | Erneute Zählung | Nach P3 die Bestätigung gegen P1/P2 abgleichen. Die Geräte-Stände können nicht gezählt werden, deshalb gilt die schriftliche Bestätigung aus P3. | Zähler „0 wartend“ je Betrieb, mit Datum. |
| P5 | Entscheidung | Betreiber wählt Option 1 oder 2 (siehe 3) und dokumentiert sie. | Schriftliche Freigabe mit Datum und Name. |

**Abbruchkriterium:** Fehlt auch nur ein Nachweis aus P1 bis P5, wird nicht ausgeliefert. Die Auslieferung wird dann auf den
nächsten Termin verschoben.

**Datenschutz der Auswertung:** P1 und P2 sind Zählungen und Betriebskennungen. Keine Personennamen, keine Stempelzeiten,
keine Koordinaten in den Nachweisen. Die Auswertung wird nach Abschluss gelöscht, sobald die Nachweise vorliegen.

## 3. Entscheidung für den Betreiber

- **Option 1 (Empfehlung): Warteschlange vor dem Deploy leeren.** Alle betroffenen Geräte online bringen, bis P3 belegt
  ist. Kein Eingriff in die Sicherheit.
- **Option 2: Übergangsregel**, der Server nimmt den alten Inhaber-Hash befristet an. Das schwächt die Sitzungsbindung
  von WP-18 ab. Ausdrücklich nicht genehmigt. Nicht umsetzen.

## 4. Wiederanlauf nach dem Deploy (offen)

Nach dem Deploy gibt es für Stempel mit altem Inhaber keinen automatischen Sendeweg. Das Verfahren für nachträgliche
Erfassung durch die Schichtverantwortung muss vor dem Deploy festgelegt und im Betriebshandbuch beschrieben sein.
Dieser Punkt ist offen und vom Betreiber zu bestätigen. Bis dahin gilt Option 1 als Pflicht.

## 5. Stand

Nicht gelaufen. P1 bis P5 sind offen. Der Deploy von WP-18 bleibt gesperrt, bis P1 bis P5 belegt und Option 1 freigegeben
sind und der Wiederanlauf in Abschnitt 4 festgelegt ist.
