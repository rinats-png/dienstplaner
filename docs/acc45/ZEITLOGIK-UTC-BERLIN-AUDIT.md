# Audit Zeitlogik: UTC-Tag gegen Berliner Tag

Stand: 2026-11-04. Basis: `origin/integration/centric-complete` (6e02b4e). Lesende Analyse, kein Produktcode geändert.
Hinweis: Der Fix `517bdc7` (`fix/fachpruefung-datumsabhaengig`) ist in dieser Basis noch NICHT enthalten.

## Wann weichen die Tage ab?

Der UTC-Tag liegt nie vor, sondern höchstens einen Tag hinter dem Berliner Tag. Das passiert im Sommer zwischen 22:00 und 24:00 UTC (00:00 bis 02:00 Berlin), im Winter zwischen 23:00 und 24:00 UTC (00:00 bis 01:00 Berlin). Beispiel: 2026-07-14 22:30 UTC ist Berlin 2026-07-15, der UTC-Tag bleibt 2026-07-14 (mit Node geprüft). Ein Zeitpunkt wie 00:30 UTC ist dagegen unkritisch (gleicher Tag). „Heute" ist in diesem Fenster also „gestern". Das kippt Vergleiche der Form `datum < heute` und `ab <= heute` um bis zu zwei Stunden pro Nacht.

## Zählung (36 Treffer von `toISOString().slice(0, 10)`: 35 server, 1 src)

| Kategorie | Treffer | Stellen |
|---|---|---|
| (a) reine Kalenderarithmetik auf Tagesstrings, unkritisch | 19 | kalender.mjs 222/227, geo 81, istdaten 69/85, korrekturworkflow 39, modul-bereichsplan 31, modul-geteilterdienst 136, modul-posten 32, planungsregeln 37/44/49/102, rechte 1011, schutzpruefung 41, sicht 173, zeiterfassung 50, zeitregeln 21, src/App.jsx 7749 |
| (b) „heute" aus Systemzeit, fachlich relevant | 12 | siehe Tabelle unten |
| (c) Protokoll-/Dateischlüssel, durchgängig UTC, unkritisch | 5 | schutz 1000/1034/1081, auskunft 209, datenschutzlauf 110 |

Zusätzlich (c), nur Anzeige: 16 Stellen in `src/` zeigen `zeit.slice(0, 10)` eines UTC-Zeitstempels als Datum (z. B. „Test bis", „angelegt", „Zuletzt geändert am"; App.jsx 10192, 20000 ff., 21580 ff.). Die Durchsetzung des Testendes rechnet mit Millisekunden (daten.mjs 704, verwalter.mjs 67), nicht mit dem Tagesstring.

Schon korrekt mit `heuteBerlin()`: Stempel (zeiterfassung, daten.mjs), Datenschutzlauf 145, Sicherungen 278, Kalender-Feed, Lesesicht (rechte.mjs 562), rechte.mjs 1031.

## Kategorie (b): relevante Stellen

| # | Datei:Zeile, Funktion | Wirkung bei Abweichung (Szenario) | Schwere | Kleinster Fix | Test mit eingefrorener Uhr |
|---|---|---|---|---|---|
| 1 | rechte.mjs:1558 `eigeneEinheit`, :1646 `imEigenenBereich`, :1880 `einheitZusammen` (`heute` für `einheitAm`) | Bereichszuordnung der Schichtverantwortung. Eine Person wechselt mit `ab: 2026-07-15` von Bereich A nach B. Am 15.07. um 00:30 Berlin (22:30 UTC) sieht der Server sie noch in A: die Schichtverantwortung von A darf bis 02:00 für sie Notruf quittieren, Anträge entscheiden und Zustellung auslösen (Datenschutz-Zugriffsgrenze, vgl. H8+). Umgekehrt bekommt eine neu zugeordnete Schichtverantwortung („kein Bereich zugeordnet") bis 02:00 die Ablehnung. | Mittel (Zugriffsgrenze, höchstens 2 h an Wechseltagen) | `new Date().toISOString().slice(0, 10)` durch `heuteBerlin()` ersetzen (in rechte.mjs bereits importiert, Zeile 18); 3 Stellen | Nein (sicht-tagesgenau, schichtverantwortung ohne Uhr) |
| 2 | bestaetigungen.mjs:116 `leitungFuerBestaetigung` (Default-Parameter) und :131 `schutzKonfliktMitteilungen` (`austritt < heute`) | Wer am 14.07. ausgetreten ist (`austritt: 2026-07-14`), gilt am 15.07. 00:30 Berlin noch nicht als ausgetreten und bekommt die dringende Mitteilung „Einteilung widerspricht Schutz- oder Einsatzregel" (Name, Tag). | Niedrig (Mitteilung an eben Ausgeschiedene, 2 h) | `heuteBerlin()` einsetzen, Parameter bleibt; Import aus zeiterfassung.mjs ergänzen | Nein (kein Test setzt die Uhr auf die Berliner Mitternacht) |
| 3 | provisionierung.mjs:113 `heute()`, genutzt in `leitungsperson` (`eintritt`, `rolleSeit`, `zugehoerigkeit[0].ab`) | Selbststart um 00:30 Berlin: Eintritt und Zugehörigkeit tragen den Vortag. Ein Tag früher ist die ungefährliche Richtung, aber Datum und Eintrittstag der Leitung stimmen nicht. | Niedrig | `const heute = () => heuteBerlin();` | Nein (provisionierung.test.js ohne Uhr) |
| 4 | leerbetrieb.mjs:75 `seit`, :76 `stichtag`, :37 `ankerMontag` | `seit` einen Tag früher (kosmetisch). `stichtag` ist der UTC-Tag von jetzt+14 Tagen (nur Anzeige, Ablauf rechnet in ms). `ankerMontag` mischt lokale Getter (`getDay`, `setDate`) mit UTC-`toISOString`: bei Server-Zeitzone UTC liefert der Selbststart Montag 00:30 Berlin den Montag der Vorwoche (Zyklus-Phase der dann befüllten Schichtfolge um eine Woche versetzt); bei Server-Zeitzone Berlin liefert er zwischen 00:00 und 02:00 den Sonntag (Wochentage der Schichtfolge um einen Tag verschoben). Die Server-Zeitzone ist im Repo nicht gesetzt (kein `TZ`). | Niedrig bis Mittel (Selbststart in der Nachtstunde, wirkt dauerhaft auf den Schichtfolge-Anker, bemerkbar) | `const tag = heuteBerlin(jetzt)`; Montag per `new Date(`${tag}T12:00:00Z`)` und `getUTCDay()` ableiten; `seit: tag` | Nein |
| 5 | rechte.mjs:335 `notrufeZusammen` (Fallback `datum`) | Nur wenn der Client kein gültiges `datum` schickt: Notruf um 00:30 Berlin wird dem Vortag zugeschrieben und ggf. dem falschen Bereich zugeordnet (siehe 1). Client sendet normalerweise sein Datum. | Niedrig | `heuteBerlin()` | Nein |
| 6 | schutzdurchsetzung.mjs:253 `fachpruefungUebermittlung`, :278 `...Async` (Default `heute`) | Fachprüfung beim Speichern/Übermitteln rechnet Mutterschutz-, Jugendschutz- und Alterskante mit dem Vortag. | Mittel (rechtlich, 2 h) | Bereits mit `517bdc7` behoben (`heuteBerlin()`, Parameter beibehalten) | Prüfung im Fix-Branch (nicht Teil dieser Basis) |
| 7 | rechte.mjs:1850 `bestaetigungenZusammen` (Tageslimit Bestätigungen je Person) | Vergleicht `x.zeit.startsWith(heute)` mit ISO-UTC-Zeit: beides UTC, daher in sich konsistent; nur das Fenster endet um 01:00/02:00 Berlin statt 00:00. Missbrauchsgrenze, keine Frist. | Unkritisch (faktisch Kategorie c) | Kein Fix nötig | n. a. |

## Tests

Tests mit UTC-„heute" gegen Berlin-Code, die im Fenster kippen könnten: geprüft wurden `tagPlus`-Helfer in schutzmerkmale-sicht, schutzregeln-ersatzsuche, bereich-ausschreibungen, modul-posten, modul-bereichsplan, fachpruefung-server.mjs. Sie nutzen Abstände von +3 bis +5000 Tagen (Geburtstage über +30 Tage); ein Tag Verschiebung kippt keine Aussage, ausgenommen die Kanten `tagPlus(10/11)` und `tagPlus(3)`, die aber mit dem Fix `517bdc7` ohnehin angefasst werden. Die Spur-Tests (stempeln 211, korrekturworkflow 261, passwort-http 556, registrierung-http 510/850, starten 462/488) vergleichen UTC mit dem UTC-Schlüssel des Servers und sind in sich konsistent; sie sind nur um 00:00 UTC (nicht Berlin) racy. `kalender-feed-autoritaet.test.js:110` nutzt „vor 2 Tagen", robust. Tests mit Berliner `HEUTE` (Intl) sind korrekt. Mit `setSystemTime`-Nähe zur Berliner Mitternacht gibt es nur serverdatum.test.js (Stempel); keine Abdeckung für die Stellen 1 bis 5. Es wurden keine Tests ausgeführt (nicht nötig).

## Empfohlener Fix-Umfang (ein Paket)

Dateien: `server/lib/rechte.mjs` (1558, 1646, 1850 optional, 1880, 335), `server/lib/bestaetigungen.mjs` (116, 131), `server/lib/provisionierung.mjs` (113), `server/lib/leerbetrieb.mjs` (37, 75, 76). Jeweils `heuteBerlin()` aus `server/lib/zeiterfassung.mjs`, Parameter und Signaturen unverändert. Dazu ein Test mit `vi.setSystemTime("2026-07-14T22:30:00Z")` je Stelle 1 (Bereichswechsel `ab` = Berliner Heute), 2 (Austritt gestern), 4 (Anker, Seit). Nicht ändern: Kategorie (a) und (c), Anzeige-Slices in `src/`.
