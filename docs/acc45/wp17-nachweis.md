# WP-17 Stempelkonflikt, Serverdatum — Nachweis

Branch `acc45/time/wp17-serverdatum`, Basis `origin/acc45/security/wp45-atomares-schreiben` (bad4a71).
Grundlage: `docs/GEO-ZEITERFASSUNG-SPEZIFIKATION.md` (Branch `docs/geo-zeiterfassung-spezifikation`), Abschnitte
B5, B6 und B7. Die Läufe fanden lokal statt (Windows 11, Node 24.18).

## Regel (server/lib/zeiterfassung.mjs, `stempelZiel`)

Den Tag bestimmt der Server aus seiner Uhr in Europe/Berlin. Eine Zeitzone je Betrieb gibt es im Bestand noch nicht.

- **Beginn:** Gestempelt wird auf heute. Läuft noch ein offener Beginn von gestern, der höchstens 20 h zurückliegt
  (Nachtdienst), antwortet der Server mit 409 `STEMPEL_SCHON_EINGESTEMPELT` (B5 „doppelter Start“).
- **Ende:** Das Ende gehört zum offenen Vorgang.
  - Gibt es einen Eintrag von heute, gilt dieser Tag.
  - Sonst gilt ein offener Beginn von gestern, wenn er höchstens 20 h zurückliegt. Dann bekommt der Eintrag
    `endeDatum` = heute, und die Erfassung wird geschrieben.
  - Sonst kommt das Ende auf heute, markiert als `START_FEHLT`; der alte Vorgang bleibt für die Korrektur offen
    (B6.3).
  - Schickt das Gerät ausdrücklich das Datum eines veralteten offenen Beginns, wird das Ende wie bisher an diesen
    Beginn gehängt und als `START_VERALTET` markiert.
- **Zeitumstellung:** Datum und Abstand werden aus dem eindeutigen Zeitpunkt berechnet (`heuteBerlin`, `startAm`).
- **Gerätedatum (`datum`):**
  - Es dient nur noch der Plausibilität und darf fehlen.
  - Ist es da, muss es heute sein, mit 2 min Spiel um Mitternacht (B7). Beim Ende darf es auch der Tag eines offenen
    Beginns von gestern sein.
  - Jedes andere Datum wird mit 400 `STEMPEL_DATUM_UNPASSEND` und einer klaren Meldung abgelehnt; ein ungültiges
    Format mit 400 `STEMPEL_DATUM_UNGUELTIG`. Früher wurde es übernommen oder mit 422 abgelehnt.
  - Abweichung von der Spezifikation B7 („Feld wird ignoriert“): Laut Auftrag wird ein unpassendes Datum abgelehnt,
    nicht ignoriert.
- **Antwort:** Das Feld `datum` nennt den Tag, den der Server gewählt hat.

`src/stempelvorgang.js` musste nur im Kommentar angepasst werden. Die Oberfläche schickt beim Beginn das heutige Datum
und beim Ende den Tag eines offenen Beginns von gestern (höchstens 20 h); das passt zur neuen Regel.

## Tests

`pruefungen/serverdatum.test.js` (9 Tests, Serverzeit über `vi.setSystemTime`) wurde gegen bad4a71 gelaufen:
**9/9 rot**.

| Fall | vorher (bad4a71) | nachher |
|---|---|---|
| Beginn ohne Gerätedatum | 400 „Kein gültiges Datum“ | 200, heute |
| 25.10. 00:30 MESZ, ohne Datum / Gerät in UTC schickt 24.10. | 400 | 200 auf 25.10. / 400 |
| Gerätedatum gestern bei geplantem Nachtdienst | **200, auf gestern gestempelt** | 400, nichts gestempelt |
| Gerätedatum morgen | 422 | 400 mit Meldung |
| Nachtdienst 22:00 → 06:00, Ende mit dem Datum des neuen Tags | **auf dem neuen Tag als START_FEHLT** | beim Beginn, Erfassung, `endeDatum` |
| Zweites Einstempeln während des offenen Nachtdiensts | 400 (kein Datum) | 409 |
| Zeitumstellung 25.10.: 22:00 MESZ → 05:30 MEZ | **auf dem 25.10.** | beim 24.10., 8,5 h |
| Vergessenes Ausstempeln (28 h) | 400 (kein Datum) | heute, START_FEHLT, alter Vorgang offen |
| 20 gleichzeitige Stempel (B5) | 20 × 400 | 20 × 200 |

Beim Test mit 20 gleichzeitigen Stempeln liegt das Rot vorher nur am fehlenden Datum. Die Wiederholung bei Konflikt
(B5) gibt es seit WP-02; der Test prüft, dass das so bleibt.

### Angepasste bestehende Prüfungen

Diese Prüfungen hielten die alte Datumsregel fest:

- **`zeiterfassung.test.js`:** Die Fälle 20–24 prüfen jetzt `stempelZiel` mit fester Serverzeit. Neu sind die Fälle
  offener Beginn innerhalb und außerhalb der 20 h, Mitternachtsspiel, Herbst- und Frühjahrsumstellung sowie ein
  Beginn in der Rückstellnacht.
- **`pruefungen/zeiterfassung.mjs` (HTTP):**
  - „morgen“, „vor fünf Tagen“ und „gestern ohne Nachtdienst“ erwarten jetzt 400 statt 422.
  - „gestern mit Nachtdienst: 200“ ist ersetzt durch zwei Prüfungen: Gerätedatum gestern ohne offenen Beginn → 400;
    Ende ohne Datum → heute, START_FEHLT.
  - Die Protokollprüfung sucht jetzt `STEMPEL_DATUM_UNPASSEND`.

### Regression nachher

- vitest, 18 Dateien: 458/458.
- Serverlauf: zeiterfassung 39/39, geo 14/14, rechte 147/147, schichtverantwortung 25/25.
- `tsc` sauber; eslint 0 Fehler (331 Warnungen wie vorher).

## Offen

- `src/App.jsx`, Rückfallweg nach dem Stempeln (`spiegeln`, nur wenn das Nachladen scheitert): Der lokale Eintrag
  wird dort unter dem Gerätedatum statt unter `erg.datum` abgelegt. Das betrifft nur Fälle, in denen Server und Gerät
  sich im Tag unterscheiden. Gehört dem Agenten, der `App.jsx` bearbeitet: dort `erg.datum` verwenden.
- Eine Zeitzone je Betrieb ist im Bestand nicht vorgesehen; es gilt Europe/Berlin.
- Offline-Ereignisse mit `clientErfasstAm` (B7/B8) gehören zu WP-07.
