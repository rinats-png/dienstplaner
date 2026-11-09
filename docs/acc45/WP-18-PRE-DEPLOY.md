# WP-18 – Pre-Deploy-Prüfung Offline-Warteschlangen

Stand: 2026-11-09. Ergänzt [WP-18-NACHWEIS.md](WP-18-NACHWEIS.md) 9.3 und den Schritt in
[BETRIEBSHANDBUCH.md](../BETRIEBSHANDBUCH.md) (Abschnitt Auslieferung). Dieses Dokument ist die prüfbare Form.

## 1. Sachstand (belegt)

- Der Client hält einen Stempel, dessen Server-Antwort `STEMPEL_FREMDE_SITZUNG` (409) lautet, im Zustand `halt`.
  Er wird nicht gelöscht (`src/stempelpuffer.js`, `antwortArt`, Zweig `halt`: „liegen lassen, nichts weiter senden“).
- Durch den Deploy ändert sich der Inhaber-Hash für: Konto-Sitzungen mit Funktionsrolle, alle Sitzungen in Betrieben mit
  rein numerischer Raum-ID, alte Code-Sitzungen ohne Betriebsnummer.
- Folge: Stempel mit altem Inhaber werden nach dem Deploy nicht mehr gesendet. Sie bleiben auf dem Gerät liegen.
- Der Server kann Geräte-Warteschlangen nicht sehen. Die Zählung ist deshalb kein Serverlauf, sondern eine
  Betreiberabfrage plus Bestätigung je Betrieb.
- Automatischer Wiederanlauf nach dem Deploy existiert nicht. Verworfen werden Stempel nur, wenn Gerätespeicher gelöscht wird.

## 2. Prüfschritte (vor dem Deploy, alle mit Nachweis)

| Nr | Prüfung | Nachweis | Stand |
|---|---|---|---|
| P1 | Betriebe mit Raum-ID `/^\d+$/` nur lesend auflisten | Liste mit Betriebs-ID, Anzahl Konten je Betrieb | offen (Betreiber, nur Lesezugriff) |
| P2 | Konten mit Funktionsrolle auflisten (nur lesend) | Liste der Konten | offen (Betreiber, nur Lesezugriff) |
| P3 | Je betroffenem Gerät: Warteschlange leer oder Stempel nachgetragen | Bestätigung der Schichtverantwortung je Betrieb, mit Datum | offen |
| P4 | Ausstehende Stempel nach Ablauf P3 erneut zählen | Zähler „0 wartend“ je Betrieb | offen |
| P5 | Entscheidung: Warteschlange leeren (Empfehlung) oder Übergangsregel (siehe 3) | Betreiberentscheidung, schriftlich | offen |

Der Deploy darf erst laufen, wenn P1 bis P5 belegt sind. Ohne Belege gilt die Prüfung als nicht bestanden.

## 3. Entscheidung für den Betreiber

- **Option 1 (Empfehlung): Warteschlange vor dem Deploy leeren** (P3, P4). Kein Eingriff in die Sicherheit. Aufwand
  liegt bei den Betrieben.
- **Option 2: Übergangsregel**, der Server nimmt den alten Inhaber-Hash befristet an. Das schwächt die
  Sitzungsbindung von WP-18 ab. Nach Schutzregel 3 ist das eine Betreiberentscheidung. Nicht ohne ausdrückliche Freigabe
  umsetzen.

## 4. Stand dieser Prüfung

Nicht gelaufen. P1 bis P5 sind offen. Der Deploy von WP-18 bleibt gesperrt, bis der Betreiber Option 1 oder 2 freigibt
und die Belege vorliegen.
