# P2-21 — Fachprüfung beim Wiederherstellen: Nachweis und Messung

Stand 2026-11-20, Branch `fix/p2-21-p2-22-server-rechte` (PR #419), Review #419 Auflage 1.

## Was gebaut ist

- `POST /api/wiederherstellen` rechnet die Fachprüfung des Speicherns als **Bericht**: `wiederherstellungsPruefung` in
  `server/lib/schutzdurchsetzung.mjs`. Gezählt werden nur neue Befunde gegenüber dem jetzigen Stand. Der Bericht enthält
  keine Person, keinen Tag und kein Merkmal. Regeln mit Schutzbezug (Katalogspalte `schutz`) erscheinen nur zusammengefasst
  als `schutz`. Er steht in der Antwort (`fachpruefung`), im Eintrag „wiederhergestellt“ des Betriebsprotokolls und im
  Serverprotokoll (Ausgang `pruefung` vor dem Tausch, dazu in der Erfolgszeile).
- Zurückgespielt wird trotz Befund (Empfehlung B). Am zurückgespielten Stand ändert sich nichts: keine automatische
  Bestätigung, keine Wirkung auf Ist, Abschlüsse oder Abrechnung.
- Die Prüfung rechnet **vor der Raumsperre**. Andere Schreiber desselben Raums warten währenddessen nicht. Unter der Sperre
  gilt der Bericht nur für genau den geprüften Stand und genau die geprüfte Sicherung (SHA-256 der Sicherung), sonst 409.
- **Zeitgrenzen** (`WIEDERHERSTELLEN_GRENZEN`, Delta-Review #419): Die ganze Antwort muss unter der Antwortzeitgrenze des
  Proxys bleiben (60 s, `deploy/caddy/Caddyfile.vorlage`). Sonst kommt ein 504, obwohl der Server womöglich noch schreibt.
  Dazu zählt auch die Wartezeit auf die Raumsperre (höchstens 15 s, `server/lib/raumsperre.mjs`).
  - Die Prüfung hat höchstens **30 s** (`budgetMs`).
  - Sind seit Beginn der Anfrage mehr als **45 s** vergangen (`gesamtMs`), bricht der Server unter der Sperre **vor dem
    Schreiben** ab: 503 `WIEDERHERSTELLEN_ZEIT`, sicher nichts geschrieben. Für Sicherung „vor Wiederherstellung“ und
    Tausch bleiben 15 s.
  - Höchstens **2** Wiederherstellungs-Prüfungen laufen gleichzeitig im Prozess (`gleichzeitig`). Darüber gibt es 503
    `WIEDERHERSTELLEN_BELEGT` vor der Bremse, der Versuch zählt dann nicht.
- Die Oberfläche (`src/sicherungen-ui.js`) zeigt bei diesen 503 den Servertext ohne „in einer Minute noch einmal“. Bei
  502/504 (Proxy-Zeitgrenze) zeigt sie „Ergebnis unklar“ mit dem Hinweis, die Sicherungsliste zu prüfen, nicht mehr
  „nichts geändert“.
- **Fail-closed:** Zeitbudget überschritten oder Ausnahme → 503 `FACHPRUEFUNG_OFFEN`, nichts zurückgespielt, keine
  Sicherung „vor Wiederherstellung“. Im Protokoll steht ein fester Text, keine Ausnahmemeldung.
- Die Antwort auf den 503 sagt, dass ein erneuter Versuch mit derselben Sicherung voraussichtlich wieder abbricht, dass
  jeder Versuch zur Bremse zählt (fünf je Stunde) und dass der Betreiber zu verständigen ist (Notweg
  `docs/BETRIEB-SICHERUNG.md` §4b).
- **Bremse:** Ein 503 nach Abbruch nimmt den Versuch bewusst nicht zurück. Mit Rücknahme wären beliebig viele
  30-s-Rechnungen je Raum möglich, begrenzt nur durch die Schreibbremse von 120 je Minute. Die Rücknahme müsste außerdem
  den Ablage-, den atomaren und den prozesslokalen Zähler der Bremse erreichen; heute gibt `bremse()` dafür nur die
  Ziel- und Gesamtvermerke zurück.

## Messung (ungünstigster Fall)

Werkzeug: `node werkzeug/p2-21-messung.mjs <personen> <vergangeneTage> [folge]`. Gemessen wird rein lokal mit festem Tag
und asynchron in Häppchen wie im Server, einmal mit dem Budget der Wiederherstellung und einmal ohne Budget.

Das Messszenario:
- 20 Einheiten, drei Dienstarten, jede mit Mindestbesetzung.
- Die Sicherung hat eine **andere Schichtfolge**; das ergibt die mittelbare Nachrechnung für alle Personen über 120 Tage.
- An jedem Tag und für jede Person weicht die Einteilung ab und erzeugt Ruhezeitverstöße.
- Fall `folge`: Nur die Schichtfolge weicht ab, ohne Abweichungen.

Rechner: Windows-Entwicklungsrechner (Node 24), ohne parallele Last:

Die Dauern wurden mit einem Budget von 40 s bzw. ohne Budget gemessen (Fassung vor dem Delta-Review). Die Spalte „im
30-s-Budget“ ist aus der Dauer ohne Budget abgeleitet.

| Personen | vergangene Tage abweichend | Abweichungen je Stand | Prüfung (geprüfte Einteilungen) | Dauer ohne Budget | im 30-s-Budget | längster Block |
|---|---|---|---|---|---|---|
| 1 000 | – (nur Schichtfolge) | 0 | 103 700 | 9,8 s | passt | 38–47 ms |
| 2 000 | – (nur Schichtfolge) | 0 | 207 400 | 19,4 s | passt | 54–62 ms |
| 500 | 30 | 75 500 | 75 500 | 12,2 s | passt | 44–47 ms |
| 1 000 | 0 (121 künftige Tage) | 121 000 | 121 000 | 17,8–19,8 s | passt | 82–120 ms |
| 2 000 | 0 (121 künftige Tage) | 242 000 | 242 000 | 36,2 s | **Abbruch** | 201–217 ms |
| 2 000 | 180 | 602 000 | 602 000 | **154,4 s** | **Abbruch** | 555 ms |

Unter paralleler Last (gleichzeitig laufende Prüfdateien) lagen die Werte etwa doppelt so hoch. Ergebnisse:
- 1 000 Personen × 121 Tage brachen dann schon am 40-s-Budget ab.
- 2 000 Personen × 121 Tage dauerten ohne Budget 66 s.
- 2 000 Personen × 180 vergangene Tage dauerten ohne Budget 94 s, mit einem längsten Block bis 1,2 s.

**Bewertung:**
- Gewöhnliche Wiederherstellungen bleiben weit unter dem Budget, typisch ist eine Sicherung von gestern mit wenigen
  geänderten Tagen.
- Abbrechen kann nur eine Sicherung, die sich in einem sehr großen Betrieb über Hunderttausende Einteilungen vom jetzigen
  Stand unterscheidet, besonders mit vielen abweichenden **vergangenen** Tagen. Für diesen Fall gilt der Notweg (§4b) bzw.
  die offene Entscheidung D′/E′ (Entscheidungsliste P2-21).

**Nebenbefund:** Bei sehr vielen ausdrücklich geänderten Einteilungen wächst der längste Abschnitt ohne Nachgeben über das
WP-22-Ziel von 50 ms hinaus: 200–550 ms ohne Last, bis 1,2 s unter Last. Er stammt aus dem Aufbau der Planrechnung und
den Durchläufen über die Abweichungen der bestehenden Prüfung. Das gilt ebenso für einen Voll-PUT dieser Größe. Er ist
technisch und gehört zu Kategorie B. Er ist nicht Teil von P2-21 und als Folgepunkt vermerkt.

## Tests

- `pruefungen/p2-21-wiederherstellen-fachpruefung.test.js` (in `pruefung:fachpruefung`): echter Handler mit Dateiablage.
  - Positiv: keine Befunde; Ruhezeit-Verstoß wird zurückgespielt und gezählt; Daten unverändert; Protokolle ohne Person.
  - Fail-closed: Zeitbudget und Ausnahme ergeben 503; Stand und Sicherungen unverändert; Text ohne „gleich noch einmal“;
    kein Ausnahmetext nach außen.
  - Raumsperre nicht gehalten: Ein paralleles Speichern kommt durch, danach 409.
  - Zeitgrenzen: Budget plus Sperrzeit liegen unter der Gesamtgrenze, die Gesamtgrenze unter 60 s minus 15 s. Ist die
    Gesamtgrenze überschritten, kommt 503 `WIEDERHERSTELLEN_ZEIT`, Stand und Sicherungen bleiben unverändert.
  - Obergrenze: Mit `gleichzeitig` = 0 kommt 503 `WIEDERHERSTELLEN_BELEGT`, ohne Bremsverbrauch. Zwei Prüfungen laufen
    gleichzeitig, die dritte erhält 503.
- `pruefungen/wiederherstellen-ui.test.js`: Die eigenen 503 zeigen den Servertext, 502/504 zeigen „Ergebnis unklar“.
  - Reine Fälle: `schutz` zusammengefasst, unbekannte Dienstart, Zeitbudget, Speicherweg unverändert.
