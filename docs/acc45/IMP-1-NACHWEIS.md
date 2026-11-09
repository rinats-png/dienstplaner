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

## Auflagen aus dem Datenreview (PR #122)

Umgesetzt in `src/lib/fachlogik.js` (Kopie `src/pruefung.jsx` gleichlautend), Tests im Block "IMP-1 Auflagen aus dem Datenreview (PR #122)" in `pruefungen/import-bestand-imp1.test.js`. `importPruefen` hat einen sechsten Parameter `optionen` (`{ vergeber }`, Vorgabe `"planer"`).

| Punkt | Status | Test |
|---|---|---|
| A "neu" bei exaktem Personalnummer-Treffer nicht wählbar, Vorgabe klaeren | erledigt (`neuAbgelehnt`, Aktion wird zu klaeren) | AUF-A |
| B Aktualisierung über den Import nie übernehmbar, auch bestätigt; Rückmeldung "vorhanden, nicht über den Import änderbar" (`hinweis`, `fehler`) | erledigt; keine Aktualisierungsoberfläche | AUF-B, D4, A6, A7 |
| C Leeres Eintrittsdatum gleich null (nicht heute), ungültig gleich Fehler; `eintrittPruefen` aus acc45/person/eintritt (4414084) übernommen, Zeilenfeld `eintrittLeer` | erledigt in der Logik; Speicherpfad offen (siehe unten) | AUF-C1, AUF-C2, AUF-C3, T-* |
| D Rolle, die der Anwender nicht vergeben darf, ist Fehler "Rolle ... nicht vergebbar" (Konstante `IMPORT_VERGEBBAR`, Spiegel von `server/lib/rollenvergabe.mjs`; der Server prüft trotzdem) | erledigt | AUF-D |
| E Doppelte Zeilen in der Datei: alle beteiligten Zeilen klaeren, Nummernvergleich mit `nrLose`, kein stiller Vorrang | erledigt; D6 umgeschrieben (altes Verhalten: erste Zeile blieb ok) | D6, AUF-E1, AUF-E2, A8 |
| F Namensvarianten (Umlaute, ß, Doppelleerzeichen, Bindestrich, Groß-/Kleinschreibung), vertauschter Vor-/Nachname gleich möglicher Treffer, immer klaeren | erledigt | AUF-F1, AUF-F2, A1-A3 |
| G P4711 und p4711 gleich, Treffer klaeren | erledigt | AUF-G |
| H Test E4/N3 sucht über `appQuelle()` statt nur in App.jsx, Vorbedingung `i >= 0` | erledigt | E4, N3 |
| I Keine Assertion entfernt; angepasst nur D6 (Erwartung des alten Verhaltens). "neu bei Treffer" war vorher nicht getestet. | erledigt | - |

Offen für den Rebase auf WP-39: (1) E-Mail-Erfindung `neuePerson` in `src/app/aktionen/stammdaten.js`/`plan.js`; (2) Speicherpfad für `eintritt === null` (`zugehoerigkeit.ab`, `rolleSeit` nicht schreiben/anzeigen) und App-Aufruf mit `{ vergeber: <Rolle des Anwenders> }`; (3) Oberfläche: Auswahl "neu" bei Personalnummer-Treffer ausblenden, `hinweis` anzeigen. — Erledigt bzw. eingeordnet im folgenden Abschnitt.

## Rebase auf WP-39 und Review-Punkte

Branch `acc45/import/imp-1-rebase` auf `origin/integration/release-v4` @ 9c9e80d (enthält WP-39). Übernommen per Cherry-Pick in Originalreihenfolge: e675b62, e7b4f22, e8e78e2, 50adfc8 (IMP-1) und 4414084 (acc45/person/eintritt). Danach ein Commit mit den Review-Punkten. Tests im Block „IMP-1 Rebase auf WP-39 und Review-Punkte" (R2a–R10) in `pruefungen/import-bestand-imp1.test.js`.

**Konflikte:** `src/App.jsx` (e675b62): Die Importzeile steht nach WP-39 in `src/app/aktionen/stammdaten.js` (`importieren`); die IMP-1-Zeile (`email: z.email || "", personalnummer: z.personalnummer || ""`) ist dort eingesetzt, App.jsx bleibt auf WP-39-Stand (keine Strukturänderung). `package.json` (e675b62, 4414084): Skripte `pruefung:import-bestand` und `pruefung:person-eintritt` neben `pruefung:app-aufbau` eingefügt und an die Gesamtkette angehängt. `src/lib/fachlogik.js` (4414084 nach 50adfc8): `eintrittPruefen` stand in beiden Commits — eine Definition behalten, `eintrittUebernehmen` ergänzt, Kommentare des Eintritts-Branches übernommen. `sicht.test.js` (e7b4f22) und `import-bestand-imp1.test.js` (`appQuelle()`) laufen ohne Anpassung gegen die neue Struktur.

| Punkt | Status | Test |
|---|---|---|
| 1 Rebase/Übernahme auf WP-39; Importzeile in `src/app/aktionen/stammdaten.js`, Einzelanlage in `src/app/aktionen/plan.js` | erledigt; WP-39-Struktur unverändert | N3, E4, R2b, R4b, R8, `wp39-app-aufbau` 4/4, `sicht` 30/30 |
| 2 Eintritt leer → null; Weg (a): Branch acc45/person/eintritt (4414084) übernommen — `einheitAm` (fachpruefung.mjs, zeiterfassung.mjs, Kopie pruefung.jsx) und `rolleAm` lesen leeres `ab` als „von Anfang an“. Speicherpfad legt `zugehoerigkeit.ab`, `eintritt` und `rolleSeit` bewusst als `null` an (`z.eintritt \|\| null`). `eintrittLeer` jetzt `!eintrittRoh` (ungültig ≠ leer). | erledigt | R2a, R2b, R2c, AUF-C1–C3, `person-eintritt` 23/23 (L1–L6) |
| 3 `importPruefen` mit der Rolle des Anwenders (`{ vergeber: sitz.person.rolle }` in `src/ansichten/import.jsx`, beide Aufrufe) | erledigt | R3a, R3b, AUF-D |
| 3 Kunde: `IMPORT_VERGEBBAR` ohne Eintrag `kunde` — stimmt mit `vergebbareRollen()` überein (dort `[]`). Wer nichts vergeben darf, legt auch ohne Rollenspalte niemanden an („Keine Berechtigung, Zugänge anzulegen“). | erledigt | R3c |
| 4 Dubletten ohne Oberfläche (IMP-4): Zeile bleibt `ok: false`, Rückmeldung zeigt den Grund (`dublettenGrund`, Spalte „Hinweis“). `zielId` bleibt reine Rückmeldung: Oberfläche liest es nicht, `importieren` legt nur `ok === true`-Zeilen an und liest `zielId` nicht. | erledigt | R4a, R4b, D1–D5, A1–A8 |
| 5 Personalnummer-Exaktvergleich: beide Seiten getrimmt. „neu“ bei ähnlichem Treffer bleibt wählbar — fachlich bereits geregelt, nicht geändert. | erledigt | R5, AUF-G, A4, A5 |
| 6 Namensgleichheit in der Datei auch, wenn nur eine Zeile eine Nummer hat (Zed Oli / Zed Oli Q9): beide markiert, klaeren. Tragen beide (verschiedene) Nummern, entscheidet die Nummer (keine Dublette, wie bisher). | erledigt | R6, AUF-E1, AUF-E2, D6 |
| 7 `eintrittPruefen` genau einmal definiert | erledigt | R7 |
| 8 Einzelanlage `neuePerson` (`src/app/aktionen/plan.js`): keine erfundene E-Mail, `email: f.email \|\| ""` | erledigt | R8 |
| 9 Kommentar in fachlogik.js („nimmt wie bisher den heutigen Tag“) ersetzt | erledigt | R9 |
| 10 Kopie `src/pruefung.jsx` im Gleichlauf (Importprüfung, `rolleAm` tolerant); Entfernung in IMP-4 | erledigt | R10 (Logikvergleich ohne Kommentare) |

**Begründung Weg (a):** Der Branch acc45/person/eintritt ließ sich nach den IMP-1-Commits mit einem einzigen inhaltlichen Konflikt (die doppelte `eintrittPruefen`-Definition) übernehmen; die Leserkorrekturen in fachpruefung.mjs, zeiterfassung.mjs und rolleAm kamen konfliktfrei. Die übrigen Leser waren schon tolerant: `src/standorte.js` und `server/lib/geo.mjs` (`!z.ab || z.ab <= d`), `server/lib/sicht.mjs` `zugehoerigkeitsAbschnitte` (leeres `ab` → `0000-01-01`, damit auch `rechte.mjs`). `rolleAm` mit `rolleSeit: null` gibt die Rolle zurück; `setzeRolle` schreibt `ab: x.rolleSeit \|\| x.eintritt` (null) in den Verlauf, was `rolleAm` jetzt toleriert. Ergänzt: `rolleAm` in der Kopie `src/pruefung.jsx` (fehlte in 4414084).

**Erwartungen, die altes Verhalten festschreiben:** keine neue Anpassung. Bestehend (aus 50adfc8): D6. Keine Assertion entfernt. Hinweis: AUF-D prüft `rolleRoh && …`; die Rollenprüfung greift jetzt auch ohne Rollenspalte (Vorgabe „mitarbeiter“) — für die Vorgabe „planer“ ändert das nichts.

**Läufe:** `import-bestand-imp1` 52/52 (38 bisher + 14 neu), `person-eintritt` 23/23, `fachpruefung-server` 37/37, `schutzkonflikte` 20/20, `zeiterfassung` 40/40, `standorte` 14/14, `g9-nachtrag` 50/50, `g9-nachtrag2` 35/35, `g9-nachtrag3` 31/31, `g9-verkauf` 28/28, `konsistenz` 32/32, `personendaten` 11/11, `sicht` 30/30, `wp39-app-aufbau` 4/4; dazu `pruefung:zeiterfassung` (21 Dateien), `pruefung:g9`, `verdrahtung`, `rollenvergabe`, `kunde-abloesung`, `rollen-eintritt`, `sicht-tagesgenau`: 39 Dateien, 889/889. `selbsttest` nur „Erster Aufbau unter 500 ms“ rot — ebenso auf 9c9e80d ohne diese Änderungen (Lastbedingung). Lint der geänderten Dateien: 0 Fehler (Warnungen nur Bestand in fachlogik.js/pruefung.jsx).

**Offen:** IMP-4 — Oberfläche für Dublettenentscheidungen (`entscheidungen`, Auswahl neu/überspringen/klären, „neu“ bei Personalnummer-Treffer ausblenden) und Entfernung der Kopie in `src/pruefung.jsx`.
