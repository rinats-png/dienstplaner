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

## Auflagen aus dem Datenreview PR #130

Branch `acc45/import/imp-1-rebase2` auf `origin/acc45/import/imp-1-rebase` @ e2c1d58. Entscheidungen vom 2026-11-09 (verbindlich). Tests: Blöcke „Auflage 1/2/4 (PR #130)“ in `pruefungen/person-eintritt.test.js` (A1-*, A2-*, A4-*) und „IMP-1 Auflagen aus dem Datenreview (PR #130)“ in `pruefungen/import-bestand-imp1.test.js` (AUF130-*). Rot-Lauf gegen e2c1d58 mit den neuen Tests: **21 rot, 76 grün (97)**; danach **97/97 grün**.

| Auflage | Status | Tests rot vorher → grün nachher | Umsetzung |
|---|---|---|---|
| 1 (hoch) Eintritt null/leer ergibt keine rückwirkende Beschäftigung | erledigt | A1-1 … A1-7 (7 rot → grün; A1-2 nur rot, weil `imDienst` in zeiterfassung.mjs nicht exportiert war — Kontrollfall) | `imDienst` in `server/lib/fachpruefung.mjs`, `server/lib/zeiterfassung.mjs` (jetzt exportiert) und Kopie `src/pruefung.jsx`: `eintritt === null \|\| eintritt === ""` → `false` an jedem Tag. Damit keine Soll-/Ist-/Kontorechnung (`sollMonat`, `sollStunden`, `istStunden`, `stundenkonto` laufen alle über `imDienst`), keine Planung (`dienstAm`/`aktive`) und keine `abschlussLuecke` (prüft `tageDes(mon).some(imDienst)`). `planungsreife`: „Bei n Personen fehlt der Eintritt.“ ist eine eigene Lücke im Punkt `personal`, jetzt **Hinweis** (`hinweis: true`) mit `behebung` („Eintrittsdatum in der Personalakte eintragen …“), keine Blockade. Personen mit `eintritt` null/leer zählen nicht als einsetzbar; sind es alle, bleibt „keine Person einsetzbar“ eine Blockade. Neue Hilfe `eintrittFehlt(p)` (fachpruefung.mjs). Personalliste (`src/ansichten/personal.jsx`): Personen ohne Eintritt bleiben sichtbar (sonst unauffindbar) und tragen „Eintritt fehlt“. |
| 2 (mittel) Bearbeitungsweg für den Eintritt | erledigt | A2-1 … A2-4 (4 rot → grün) | Neue Aktion `setzeEintritt(pid, roh)` (`src/app/aktionen/plan.js`) über `eintrittUebernehmen`: leer behält das bestehende Datum, gültig (ISO oder TT.MM.JJJJ) wird übernommen, ungültig → Meldung, Bestand unverändert. Personalakte (`src/ansichten/personalakte.jsx`, Bereich staff.edit): Feld „Eintrittsdatum“ mit „Übernehmen“, Fehleranzeige (`role="alert"`) aus `eintrittUebernehmen(p, …)`, Kennzeichnung „Eintritt fehlt“. A2-1…A2-3 rufen die Aktion mit einem echten Mandanten auf (Verhaltenstest); A2-4 prüft nur die Anbindung im Formular. |
| 3 (mittel) Personalnummer beim Speichern erneut prüfen | erledigt (clientseitig) | AUF130-3b, AUF130-3c (2 rot → grün); AUF130-3a Vorbedingung (grün vorher wie nachher) | `importGegenBestand(personen, zeilen)` (`src/lib/fachlogik.js`): exakte Nummer (getrimmt, ohne Groß-/Kleinschreibung) im aktuellen `m.personen` → Zeile übersprungen mit Fehler „Personalnummer „…“ bereits vorhanden — Zeile n nicht angelegt“; dieselbe Nummer zweimal im selben Speichervorgang → nur die erste. `importieren` (`src/app/aktionen/stammdaten.js`) ruft sie innerhalb von `mUpd` gegen den aktuellen Bestand auf, nach dem Filter `z.ok === true`; die Meldung nennt die übersprungenen Zeilen. AUF130-3b ruft `importieren` mit einem Bestand auf, der die Nummer schon enthält (auch `" p4711 "`), und prüft den Bestand danach. |
| 4 (mittel) Einzelanlage ohne stille Vorbelegung | erledigt | A4-1 … A4-4 (4 rot → grün; A4-2 nur rot, weil `neuePersonFormular` fehlte — Kontrollfall) | `neuePersonFormular(m)` (`src/ansichten/personal.jsx`): `eintritt: ""` (nicht heute), `funktion: ""` (Auswahl „Nicht angegeben“, nicht „Fachkraft“). `neuePerson` (`plan.js`) prüft vor dem Speichern mit `eintrittPruefen`: leer → `eintritt: null` und `zugehoerigkeit[0].ab: null` (nie `""`), gültig → übernommen, ungültig → Meldung, nichts angelegt, kein Protokolleintrag. Nach dem Hinzufügen werden Eintritt und Funktion wieder geleert. |
| 5a vergebbareRollen direkt | erledigt | AUF130-5a (rot → grün); R3c (Gleichlauf) unverändert grün | `IMPORT_VERGEBBAR` wird in `fachlogik.js` (und in der Kopie `pruefung.jsx`, R10-Gleichlauf) aus `vergebbareRollen()` und `RANG` von `server/lib/rollenvergabe.mjs` abgeleitet, keine Kopie der Liste mehr. Begründung: der Client bindet das Modul sauber ein (es ist frei von Node-APIs; `fachlogik.js` bezieht bereits andere Module aus `server/lib/`, `personal.jsx` importierte `vergebbareRollen` schon). Der Export `IMPORT_VERGEBBAR` bleibt (Rückmeldung, R3c). |
| 5b Versetzungssortierung null-sicher | erledigt | AUF130-5b (rot → grün) | `versetze` (`plan.js`) sortiert über `zugehoerigkeitSortiert`: `ab` null/leer vor jedem Datum, gleiche Schlüssel in bisheriger Reihenfolge (stabile Sortierung, Vergleich liefert 0), deterministisch. Bisher landete `{ab: null}` je nach Eingangsreihenfolge mitten in der Liste (`null < "2024-…"` ist false). Die Hilfe ist bewusst nicht exportiert (jeder Export der Aktionsdateien gilt in `wp39-app-aufbau` als Fabrik). |
| 5c Namensgleichheit mit abweichender Nummer in der Datei | erledigt | AUF130-5c (rot → grün) | Keine Dublette (die Nummer entscheidet, `doppelt` bleibt false wie in R6), aber `dublettenGrund` „Namensgleichheit mit abweichender Nummer in der Datei (Zeile n), bitte klären“, `vorgabe: "klaeren"`, Feld `namensgleichheit` (Zeilennummern), ohne ausdrückliche Wahl „neu“ nicht übernehmbar. Kopie `pruefung.jsx` gleich. |
| 5d Unbekannte Rollenangabe | erledigt | AUF130-5d (rot → grün) | Nur eine leere Rollenangabe heißt „mitarbeiter“; eine nicht erkannte (weder Kennung noch Bezeichnung) ist der Fehler „Rolle „…“ nicht erkannt“, `rolle: null`, nicht übernehmbar. Kopie `pruefung.jsx` gleich. |

**Urlaub und Wochenstunden (Auflage 4):** bleiben vorbelegt, weil beide Betriebsvorgaben mit sicherer Herkunft sind (Wochenstunden aus der Betriebseinstellung `sollWochenstunden`, Urlaub 30 Tage wie im Import), anders als ein erfundenes Eintrittsdatum oder eine erfundene Funktion. Sie stehen sichtbar im Formular, jetzt mit dem Hinweis „Vorgabe des Betriebs — bitte prüfen“ bzw. „Vorgabe 30 Tage — bitte prüfen“; die Planung bestätigt sie also bewusst beim Anlegen und kann sie in der Personalakte ändern.

**Abgrenzung null / fehlendes Feld:** `imDienst` liefert `false` für `eintritt === null` und `""` — so legen Import und Einzelanlage eine Person ohne Eintritt seit IMP-1 an. Ein Datensatz ganz ohne Feld (`undefined`, Altbestand vor IMP-1, in Prüfbeständen verbreitet) bleibt unbeschränkt wie bisher (L1 zweiter Teil, A1-2); bisher legten beide Wege immer ein Datum an. `planungsreife` meldet beide Fälle als Hinweis „fehlt der Eintritt“.

**Erwartungen, die altes Verhalten festschreiben (angepasst, benannt):**
- `person-eintritt` **L1**, erster Teil: `imDienst(nullAb) === true` („null bedeutet keine Beschränkung“) — genau das von Entscheidung 1 verbotene Verhalten; jetzt `false`. Der Teil zum fehlenden Feld ist unverändert.
- `person-eintritt` **L6**: „Person mit null wird wie dieselbe Person mit frühem Datum geplant“ (`a toEqual b`, `a.some > 0`) — jetzt: mit null an keinem Tag geplant, mit frühem Datum geplant (Gegenprobe), Rechnung ohne Fehler.
- `sicht.test.js` „jedes Feld einer Person hat eine Entscheidung“: nur der **Anker** (Fundstelle des Personenliterals von `neuePerson`) angepasst, weil `neuePerson` den Eintritt jetzt vor `mUpd` prüft; dazu eine Vorbedingung, dass die Fundstelle existiert. Keine Erwartung geändert.

Keine Assertion entfernt. `intelligence-planungsreife` („Personal: kein Eintritt …“) prüft nur die Texte; Text und Reihenfolge sind unverändert.

**Läufe:** `person-eintritt` 38/38 (23 bisher + 15 neu), `import-bestand-imp1` 59/59 (52 bisher + 7 neu); gezielt `fachpruefung-server`, `zeiterfassung`, `intelligence-planungsreife`, `sicht`, `konsistenz`, `personendaten`, `wp39-app-aufbau`, `rollen-eintritt`, `rollenvergabe`, `standorte`, `schutzkonflikte`, `sicht-tagesgenau`, `stempel-fachpruefung`, `verdrahtung`, `intelligence-faktenpaket`: 17 Dateien, 425/425 (nach der sicht-Ankeranpassung). Gesamtlauf `vitest run pruefungen` (267 Dateien, lokal unter Last, `--testTimeout=60000`): 7621 grün, 15 rot, 15 übersprungen. Die roten liegen außerhalb der geänderten Pfade und sind Last- oder Windows-Bedingungen: `selbsttest` nur „Erster Aufbau unter 500 ms“ (wie schon auf 9c9e80d), `accountanmeldung`/`datenintegritaet`/`sicherung-ablage` Zeitgrenzen (wechselnde Fälle je Lauf; `datenintegritaet` „50 Personen stempeln“ einzeln grün), `ablage` Dateirechte, `server` SIGTERM, `zugaenge-anlegen` (Shell-Skript) — unter Windows nicht lauffähig, Nachweis in der CI. `node werkzeug/verdrahtung-pruefen.mjs`: ok (288 Prüfdateien). Lint der geänderten Dateien gegen e2c1d58: 0 Fehler, keine neue Warnung.

**Restpunkte:**
1. **Serverseitige Eindeutigkeit der Personalnummer** — eigener Schritt, nicht in diesem Auftrag. Die Prüfung beim Speichern (Auflage 3) läuft im Client innerhalb von `mUpd`; zwei Sitzungen, die gleichzeitig speichern, oder ein Schreibweg am Client vorbei werden erst durch eine Prüfung im Server-Schreibpfad (`server/funktionen/daten.mjs`) ausgeschlossen.
2. **Eintritt-Pflicht für neue Personen** — Vorschlag zur Produktentscheidung, **nicht umgesetzt**: Einzelanlage und Import könnten `eintrittPruefen(…, { pflicht: true })` nutzen (die Option besteht schon). Bis dahin ist der Eintritt optional; ohne ihn wird die Person weder geplant noch abgerechnet, und Planungsreife und Personalliste weisen darauf hin.
3. `src/standorte.js` `jeStandort` zählt Personen ohne Eintritt weiter im Standortbestand (`!p.eintritt || …`); bewusst nicht angefasst (Kontingent-/Preisaufstellung, eigene Entscheidung).
4. IMP-4 wie oben (Dublettenwahl in der Oberfläche, damit auch die Wahl „neu“ bei Namensgleichheit mit abweichender Nummer).

## Auflagen A und C aus dem Datenreview PR #130

Basis `8a4db41` (acc45/import/imp-1-rebase), Branch `acc45/import/imp-1-auflagen-ac`. Keine Datenmigration, keine Produktionsänderung.

| Auflage | Status | Tests rot vorher → grün nachher | Umsetzung |
|---|---|---|---|
| A (hoch) Stempel von Personen ohne Eintritt gehen nicht still verloren | erledigt | `pruefungen/person-eintritt-stempel.test.js`: A-1a, A-1b, A-1c, A-2a, A-2b, A-3, A-3a, A-4a (8 rot → grün); A-2c und A-4b Kontrollen (grün vorher wie nachher: keine erfundenen Lohnzeilen, Freeze der übrigen Personen gleich) | Stempeln ohne Eintritt bleibt erlaubt, der Stempel wird gespeichert (unverändert). Neu in `server/lib/isteinfrieren.mjs`: `OHNE_EINTRITT_TEXT` („Eintrittsdatum fehlt – Stunden nicht abgerechnet“), `stempelOhneEintritt(m, p, mon)` (Tage des Monats mit Stempel oder Ist-Eintrag einer Person mit `eintritt` null/leer, nur bei Ist-Zugang der Rolle), `ohneEintrittPrueffaelle(m, mon)`, `ohneEintrittFallText`. `abschliessen` (`server/lib/monatsabschluss.mjs`): solche Stempel sind ein Prüffall — 409 `ABSCHLUSS_PRUEFFAELLE` mit `offen.ohneEintritt` (Anzahl) und Text; nur mit `trotzPrueffaellen` (bestehende Rückfrage der Oberfläche) wird abgeschlossen, der Verlauf vermerkt `offen.ohneEintritt`. Der bisherige Text bei offenen Stempeln/Ist zur Prüfung ist unverändert, `offenePunkte` unverändert (seine `toEqual`-Erwartung bleibt gültig). Lohnausgabe (`src/lib/fachlogik.js`): neue `ohneEintrittZeilen` in `lohnPruefZeilen` (damit in `lohnausgabeText`) mit Name und Stempelzahl je Person; `lohnWarnung` (Rückfrage vor Lohnausgabe-CSV und Zuschlags-CSV) nennt den Prüffall. Keine Lohnzeilen für die Person (keine erfundenen Stunden), aber keine stille Auslassung. Monatsabschluss-Ansicht (`src/ansichten/monatsabschluss.jsx`): Hinweis „Prüffall: Eintrittsdatum fehlt – Stunden nicht abgerechnet (Name: n Stempel)“ für offene und abgeschlossene Monate. Freeze, Prüfsumme und Lohnzeilen eingefrorener Monate unverändert (A-4a/A-4b); der Hinweis ist reine Anzeige. |
| C (mittel) Personalnummer serverseitig eindeutig | erledigt | `pruefungen/bestand-personalnummer.test.js`: C1, C1b, C4b, C6 (4 rot → grün); C2 rot nur als Folge von C1b auf altem Code (C1b hatte gespeichert), für sich Kontrolle; C3, C4, C5 Kontrollen (grün vorher wie nachher) | Neues Modul `server/lib/personalnummer.mjs`: `personalnummerKonflikt(alt, neu)` je Betrieb, Vergleich `trim` + Kleinschreibung; nur NEUE Doppelungen — eine Person, deren normalisierte Nummer gleich bleibt, ist nie ein Konflikt (bestehende Doppelungen blockieren nichts und bleiben, keine Bereinigung); leere Nummern nie. `PUT /api/bestand` (`server/funktionen/daten.mjs`, ein Block mit Kommentar nach der Standortprüfung, vor Gestaltprüfung und Schreiben): 409 `PERSONALNUMMER_DOPPELT`, Text „Die Personalnummer „…“ ist in diesem Betrieb schon an eine andere Person vergeben. … Es wurde nichts geändert.“ (ohne Namen der anderen Person), `etag` des unveränderten Stands; Protokoll ohne Nummer und Person. ETag-/Segment-Konfliktschutz unverändert. Client (`src/speicher.js`): dieser 409 ist kein Versionskonflikt — kein Konfliktfenster, ETag bleibt, Meldung als nicht gespeichert mit Servertext. |

**Erwartungen, die altes Verhalten festschreiben:** keine geändert oder entfernt. `person-eintritt` A1-5 („keine abschlussLuecke“ für Personen ohne Eintritt) gilt weiter — der neue Prüffall ist bewusst eine eigene Art neben `abschlussLuecke`, nicht deren Ausweitung.

**Läufe:** neu `person-eintritt-stempel` 10/10, `bestand-personalnummer` 8/8. Gezielt (22 Dateien: `person-eintritt`, `person-eintritt-stempel`, `import-bestand-imp1`, `bestand-personalnummer`, `monatsabschluss*` (7), `zeiterfassung`, `fachpruefung-server`, `rollen*` (5), `sicht`, `etag-pflicht`, `selbstauskunft`, `stempel-oberflaeche`): 504/504. Gesamtlauf `vitest run` (269 Dateien, lokal unter Last, `--testTimeout=60000`): 7637 grün, 17 rot, 15 übersprungen. Die roten liegen außerhalb der geänderten Pfade (keine Meldung nennt Personalnummer oder Eintritt) und sind Last- oder Windows-Bedingungen wie im Lauf davor: `zugaenge-anlegen` (Shell-Skript, 7), `ablage` (Dateirechte/EPERM, 3), `selbsttest` (Aufbau unter 500 ms), `server` (SIGTERM), `sicherung-ablage` (Zeitgrenze), `ablage-pruefen-rueckweg` (3 Zeitgrenzen; einzeln grün), `wp28b-sicherung-last` (EPERM beim Umbenennen unter Windows, auch einzeln). `node werkzeug/verdrahtung-pruefen.mjs`: ok (beide neuen Dateien im Skript `pruefung:person-eintritt`, das die CI ausführt). Lint der geänderten Dateien: 0 Fehler, keine neue Warnung.

**Offene Punkte:**
1. **Betreiberschritt (lesend, vor Deploy):** Zählung der Personen mit `eintritt` null/leer je Betrieb in Staging und Produktion, dazu je Betrieb die Stempel dieser Personen in offenen Monaten. Nur benannt, nicht ausgeführt.
2. **Bestehende Doppelungen der Personalnummer** bleiben gespeichert (Entscheidung: keine automatische Bereinigung); eine lesende Zählung je Betrieb wäre ebenfalls ein Betreiberschritt.
3. Weitere Schreibwege für Personen außerhalb von `PUT /api/bestand` (etwa Betreiber-Erstbefüllung) prüfen die Nummer nicht serverseitig; nicht Teil dieses Auftrags.
