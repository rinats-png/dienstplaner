# Restore-Abnahme-Plan (E-7)

Stand: 2026-11-04 · **Gerüst.** Abgeleitet aus `EXTERNE-ABNAHMEN-UEBERGABE.md` (E-7), `docs/BETRIEB-SICHERUNG.md`, `docs/RESTORE-ANLEITUNG.md`, `docs/acc45/wp04-nachweis.md`.
Nichts davon ist laut `wp04-nachweis.md` extern eingerichtet oder bewiesen: Lauf gegen das echte Speicherziel, echter Totmannschalter und Cron auf dem VPS sind **nicht nachgewiesen**.
Keine Hosts, Zugangsdaten, Passwörter oder Speicherziel-Namen in dieser Datei.

Zeitplan: [`../BETREIBER-AUFGABEN-WEIHNACHTEN.md`](../BETREIBER-AUFGABEN-WEIHNACHTEN.md) (E-7, E-32).

## 1. Entscheidungen des Betreibers (offen, zurückgestellt am 2026-11-03)

| Entscheidung | Empfehlung im Dokument | Stand |
|---|---|---|
| Speicherziel | sftp-Storage-Box oder S3-kompatibel in der EU | nicht entschieden |
| Verwahrung des Sicherungspassworts (restic) | Passwortmanager plus versiegelte Papierkopie außerhalb von Büro und Server | nicht entschieden |
| Alarmdienst (Totmannschalter) | EU-Standort; hängt mit E-8 zusammen | nicht entschieden |
| Vertrag/AVV mit dem Speicherziel-Anbieter | siehe E-32 | offen |

Im Ernstfall nötig: Sicherungspasswort, `CENTRIC_PFEFFER`, Zugang zum Speicherziel. Ohne Passwort ist die Sicherung nicht wiederherstellbar. Alles nur im Passwortmanager, getrennt von den Sicherungen.

## 2. Ablauf der Abnahme

1. restic gepinnt installieren, Prüfsumme prüfen.
2. Speicherziel anlegen (eigener Schlüssel nur für die Sicherung), zuerst ein **Test**-Repository.
3. Passwort erzeugen, verwahren, Verwahrung durch zweite Person oder Papierkopie bestätigen.
4. Repository initialisieren, Probelauf in das Test-Repository, Wiederherstellungsprobe.
5. Fehlalarm-Probe (Konfigurationskopie mit falscher Passwortdatei): Alarm muss kommen.
6. Erst danach produktives Repository und Cron.
7. **Tatsächlicher Restore** in einen leeren Container: identische Prüfsummen (Testplan 3.5); passender Pfeffer.
8. Aufbewahrung prüfen (laut Dokument 7 täglich, 4 wöchentlich, 12 monatlich).
9. Sicherungsalter im Alarmweg (`CENTRIC_SICHERUNG_STATUS`, WP-05): alte Sicherung simulieren, Alarm „Sicherung“ erwartet (E-8 Schritt 6).

Befehle: `docs/BETRIEB-SICHERUNG.md` Abschnitt 2; Restore: `docs/RESTORE-ANLEITUNG.md`.

## 3. Abnahmekriterien (laut Übergabeliste)

- Restore bytegleich (Abgleichwerkzeug: „abweichend 0“).
- Totmannschalter schlägt bei absichtlichem Fehler an, Normalbetrieb ohne Alarm.
- Passwortverwahrung bestätigt (Art der Verwahrung, nicht der Ort selbst).
- Restore **vor** dem Produktiv-Deploy (E-23) bewiesen; Sicherung unmittelbar vor dem Deploy, Wiederherstellbarkeit gesehen.

## 4. Nachweis (beim Betreiber, nicht im Repository)

Protokollzeilen (Dateianzahl, Bytes, „In Ordnung: N Dateien“), Screenshot des Totmannschalters (Fehlalarm und Normalbetrieb), Notiz „Passwortverwahrung bestätigt am …“.

## 5. Zusätzlich empfohlen (Hypothese, nicht Teil der Übergabeliste)

Wiederholung der Restore-Probe nach dem Deploy und danach in festem Rhythmus `<Betreiber legt fest>`; Übung mit einer Person, die den Restore nicht aufgebaut hat.

## 6. Vom Betreiber auszufüllen

Speicherziel-Anbieter · Passwortverwahrung (Art) · Alarmdienst · Datum der Abnahme · Ablageort des Nachweises.
