# IMP-1 Nachweis — Vier Bestandsfehler im Personalimport

Branch `acc45/import/imp-1` (Basis `origin/integration/release-v4`). Test: `pruefungen/import-bestand-imp1.test.js` (19 Fälle), Aufruf `npx vitest run pruefungen/import-bestand-imp1.test.js --testTimeout=60000`, verdrahtet als `pruefung:import-bestand` (package.json, Workflow).

## Rot vor dem Fix (unveränderter Bestandscode)

Lauf gegen den Stand `origin/integration/release-v4`: **16 rot, 3 grün (19)**. Die drei grünen sind Kontrollfälle, die auch vorher gelten sollten (D3 Neuanlage mit Wahl, D7 mandantenintern, T-gültig).

## Grün nach dem Fix

**19 von 19 grün.**

| Fehler | Tests (rot vorher, grün nachher) | Ursache (Bestand) | Korrektur |
|---|---|---|---|
| 1 Dubletten ungeprüft | D1, D2, D4, D5, D6 | `fachlogik.js` ca. 2089/2094: `doppelt` war nur eine Anzeige, `ok` hing nur an `fehler`; App.jsx übernimmt `filter(z => z.ok)` | `fachlogik.js:2103-2134`: Dublette über Personalnummer (mandantenintern), sonst Name, auch innerhalb der Datei. `ok` nur bei ausdrücklicher Wahl „neu". Wahl über neuen 5. Parameter `entscheidungen`: `neu` / `ueberspringen` / `klaeren` / `{aktion:"aktualisieren", bestaetigt:true}`. Aktualisieren ist nie `ok` (nie Neuanlage) und trägt `zielId`. Name allein führt nie zusammen. |
| 2 Personalnummer | N1, N2, N3 | Spalte wurde zugeordnet (`importZuordnen`), aber weder gelesen noch im Datensatz geführt | `fachlogik.js:2092` liest sie, Zeile trägt `personalnummer`; `App.jsx:10873` speichert sie in der neuen Person |
| 3 E-Mail erfunden | E1, E2, E3, E4 | `App.jsx:10873` (alt): `vorname.nachname@betrieb.de` | `fachlogik.js:2093` liest die E-Mail-Spalte, leer bleibt leer, ungültig (`name@x.y`-Muster) ist Fehler; `App.jsx:10873` nimmt `z.email \|\| ""` |
| 4 Datum | T-Text, T-unmöglicher Tag, T-Monat 13, T-ISO unmöglich | `fachlogik.js` ca. 2079: jeder nicht lesbare Wert fiel auf `heute()` | `fachlogik.js:2080-2091`: Kalenderprüfung (auch 31.02., 2024-02-30); Fehlermeldung „Eintrittsdatum … ungültig", `eintritt: null`, `ok: false` |

## Kopie in `src/pruefung.jsx`

Entscheidung: **dieselbe Korrektur eingebaut** (Zeilen 2122ff, Marker-Kommentar), Entfernung empfohlen. Begründung: Die Selbstprüfung dort (`Import liest drei Zeilen` u. a.) läuft gegen die Kopie und die Kopien beider Dateien waren Zeile für Zeile gleich; ein bloßes Entfernen würde die Selbstprüfung der Anwendung umbauen (eigener Auftrag, `pruefung.jsx` trägt „an vielen Stellen eigene Kopien"). Bis die Kopie entfällt, würde sie ohne Korrektur das Fehlverhalten weiter prüfen und verdecken. Folgepunkt: `importZuordnen`/`importPruefen` aus `fachlogik.js` in `pruefung.jsx` importieren und die Kopie löschen.

## Angepasste Erwartungen

Keine bestehende Assertion wurde entfernt oder abgeschwächt. Keine Bestandserwartung schrieb die erfundene E-Mail oder das stille Datum fest (`Import wandelt deutsche Datumsangaben`, `Import liest drei Zeilen` unverändert grün; Selbsttest-Import-Fälle grün).

## Regression (Auszug)

`konsistenz`, `laufzeit`, `personendaten`, `g9-nachtrag`, `fachpruefung-server`, `acc45-status`, `verdrahtung`: grün (verdrahtung nach Aufnahme des neuen Skripts). `npm run lint`: 0 Fehler, Warnungen unverändert (Bestand). `selbsttest.test.js` „Erster Aufbau unter 500 ms" rot durch Laufzeit (Lastbedingung, nicht Import; alle Import-Fälle darin grün).

## Offene Punkte

1. **Oberfläche (App.jsx, wegen Modularisierung nicht angefasst):** Die Dublettenwahl (Neu / Aktualisieren mit Bestätigung / Überspringen / Klären) hat noch kein Bedienelement. `importPruefen` nimmt `entscheidungen` bereits an. Bis dahin werden Dubletten sicher **nicht** übernommen und mit „Name bereits vorhanden" angezeigt.
2. **„Bestehenden aktualisieren"** ist in der Prüfung (Zeile trägt `zielId`, `aktualisierungBestaetigt`) vorbereitet, aber es gibt noch keine Anwendungsfunktion; die Feldregeln, was überschrieben werden darf, sind zu entscheiden.
3. `App.jsx` `neuePerson` (Einzelanlage, ca. 10701) erfindet weiterhin eine E-Mail; außerhalb von IMP-1.
4. Leere Eintrittszelle bzw. fehlende Spalte nimmt weiterhin `heute()` (bewusst nicht als „ungültig" gewertet; falls das ebenfalls Fehler sein soll, Entscheidung nötig).
5. Anzeige der Fehlermeldung „E-Mail ungültig" nutzt die vorhandene Fehlerspalte; keine neue UI.

## Auflage aus dem IMP-3-Review

Vorgabe (verbindlich): keine Zusammenführung nur über Namen, keine automatische Überschreibung; Aktualisierung nur über Personalnummer-Treffer und mit ausdrücklicher Bestätigung je Datensatz.

**Ist-Stand (e7b4f22):** `fachlogik.js` (alt Z. 2133) setzte `zielId` bei `aktion === "aktualisieren" && bestaetigt && dublette`, also auch bei `dublette.grund === "name"` (angelegt Z. 2113). Ein bestätigter Namenstreffer führte damit zu einer Aktualisierung. Eine Personalnummer, die sich nur in führenden Nullen oder Trennzeichen unterschied, galt als verschieden.

**Korrektur (`fachlogik.js` 2108-2150, Kopie `pruefung.jsx` gleichlautend):**
- `darfAktualisieren` nur bei `grund === "personalnummer"` (exakter Treffer, ohne Groß-/Kleinschreibung) und nicht innerhalb der Datei. `zielId` nur dann und nur mit `bestaetigt: true`.
- Ein Aktualisierungswunsch auf einen anderen Treffer wird zu `aktion: "klaeren"` mit `aktualisierungAbgelehnt: true`; die Zeile bleibt nicht übernehmbar.
- Neuer Treffergrund `personalnummer_aehnlich`: Nummern, die nach Entfernen von Trennzeichen und führenden Nullen gleich sind (`01001`/`1001`, `P-1001`/`P1001`), sind ein möglicher Treffer zum Klären, nie stillschweigend „verschieden", nie Aktualisierung.
- Namenstreffer trägt `nummerAbweicht` (Zeilennummer weicht von der des Bestands ab).
- Neues Feld `vorgabe`: bei jeder Dublette `"klaeren"`, nie `"aktualisieren"`, nie `"neu"`; ohne Dublette `null`.

**Tests (`import-bestand-imp1.test.js`, Block „Auflage aus dem IMP-3-Review", A1-A8):** rot gegen den Ist-Stand 5 (A1-A5), A6-A8 schon grün (Schutz gegen Rückfall). Nach dem Fix 27 von 27 grün.

**Angepasste Erwartung (D4):** prüfte bisher die Aktualisierung über einen reinen Namenstreffer (`zielId` bei `grund "name"`). Das ist das nun verbotene Verhalten; D4 prüft dieselbe Bestätigungsregel jetzt über einen Personalnummer-Treffer. Keine Assertion abgeschwächt; die Namensfälle stehen verschärft in A1-A3.

**Regression:** `konsistenz`, `personendaten`, `verdrahtung` grün; `selbsttest` nur „Erster Aufbau unter 500 ms" rot (Lastbedingung, unverändert zum Vorstand, alle Import-Fälle grün). Lint: 0 Fehler, 153 Warnungen (Bestand).

**Offen:** Die Oberfläche (App.jsx, WP-39) muss `vorgabe` und `aktualisierungAbgelehnt` anzeigen und „Aktualisieren" nur bei `dublette.grund === "personalnummer"` anbieten.
