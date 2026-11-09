# Eintrittsdatum: keine stille Ersetzung (Nachweis)

Branch `acc45/person/eintritt`, Basis `acc45/import/imp-1` (e675b62). Freigabe der Regeln: 2026-11-09.

## Regeln

| Fall | Ergebnis |
|---|---|
| leer, fachlich optional | `null` |
| gültige Eingabe (TT.MM.JJJJ oder JJJJ-MM-TT) | übernommen |
| ungültige Eingabe (z. B. 31.02.2024) | Validierungsfehler mit dem eingegebenen Wert |
| fachlich erforderlich, fehlt | Fehler "Bitte das Eintrittsdatum eingeben." (kein Standardwert) |
| heutiges Datum | nur nach ausdrücklicher Eingabe oder Auswahl |
| Bearbeitung, Feld leer | bestehendes Datum bleibt |

Im Modell ist der Eintritt optional: `imDienst` (server/lib/fachpruefung.mjs:167) behandelt ein fehlendes Datum als "keine Beschränkung". Der Import ruft deshalb `eintrittPruefen` mit `pflicht: false`. Die Pflichtvariante steht für die manuelle Anlage bereit.

## Ist-Stand (vor dem Fix)

- Import setzt: src/lib/fachlogik.js:2082 `if (!eintrittRoh) return heute();` (leere Zelle oder fehlende Spalte wurde heute). Ungültiges Datum war seit IMP-1 bereits ein Fehler.
- Speicherung: src/App.jsx:10874 (`importieren`) schreibt `eintritt`, `zugehoerigkeit[0].ab` und `rolleSeit` aus `z.eintritt`. Der Server (server/funktionen/daten.mjs) hat kein Schema für `eintritt`; JSON-Bestand nimmt `null` an. Es gibt kein Validierungsschema, das null verbietet.
- Lesen: `imDienst` (fachpruefung.mjs:167, zeiterfassung.mjs:150) prüft `p.eintritt &&`: null ist sauber. planungsreife.mjs:150/157 prüft `istTag(x.eintritt)` und meldet "fehlt der Eintritt" als Lücke (kein Absturz). faktenpaket.mjs:98 prüft ebenfalls. Anzeige: fachlogik.js:1775 `fDatum(p.eintritt)`, App.jsx:7527 `dienstalter` mit Guard.
- Falsche Zugehörigkeit bei null: Der Import schreibt `zugehoerigkeit: [{ ab: null, ... }]`. `einheitAm` (fachpruefung.mjs:98, zeiterfassung.mjs:145, src/pruefung.jsx:729) verglich `z.ab <= d`; `null <= "2026-..."` ist false. Die Person gehörte dann an keinem Tag einer Einheit und wäre aus dem Plan gefallen. `rolleAm` hatte dieselbe Lücke im `rolleVerlauf`. Bereits tolerant: server/lib/sicht.mjs:264, geo.mjs:155, src/standorte.js:81, rechte.mjs:1616 (über sicht), planungsreife.mjs:82.

## Fix

1. src/lib/fachlogik.js: neu `eintrittPruefen(roh, { pflicht })` und `eintrittUebernehmen(person, roh)`. `importPruefen` nutzt `eintrittPruefen`; die Ersetzung durch `heute()` entfällt.
2. Lesekompatibilität, damit `null` und Bestand ohne Feld unverändert rechnen: `einheitAm` in server/lib/fachpruefung.mjs, server/lib/zeiterfassung.mjs, src/pruefung.jsx sowie `rolleAm` in src/lib/fachlogik.js behandeln leeres `ab` als "von Anfang an" (`!z.ab || z.ab <= d`). Datierte Einträge verhalten sich wie zuvor (Test L4).
3. Keine Änderung an App.jsx, server/funktionen/daten.mjs, server/lib/rechte.mjs.

Migration: Es werden keine Bestandsdaten umgeschrieben. Alter Bestand (kein Feld, oder heutiges Datum aus dem früheren Standardwert) rechnet unverändert (Tests L1, L2). Welche Altwerte tatsächlich existieren, ist nicht nachgewiesen; ein früherer Standardwert "heute" lässt sich im Bestand nicht von einer echten Eingabe unterscheiden.

## Tests

Datei pruefungen/person-eintritt.test.js (23 Tests), Skript `pruefung:person-eintritt` mit `--testTimeout=60000`, im Sammelskript `pruefung` und in .github/workflows/pruefung.yml eingetragen.

- Rot gegen den Ist-Stand (nach Anlage der Tests, vor dem Fix): 17 rot, 6 grün. Rot waren: Eingabeprüfung (neue Funktionen fehlten), Import leere Zelle und fehlende Spalte (lieferten heute), Bearbeitung, `einheitAm` mit `ab = null` (L3) und Planrechnung mit null (L6). Grün von Anfang an: L1, L2, L4, L5 (Altbestand) und die Import-Fälle mit gültigem und ungültigem Datum.
- Grün nach dem Fix: 23 von 23.
- Bestehende Tests nicht abgeschwächt, keine Erwartung angepasst: pruefungen/import-bestand-imp1.test.js (19 Tests) bleibt grün. Angrenzende Läufe: fachpruefung-server, schutzkonflikte, beschaeftigung, konsistenz, personendaten, rollenvergabe, standorte, zeiterfassung, schutzpruefung-eine: 217 Tests grün. Verdrahtung ok (284 Prüfdateien, verdrahtung.test.js 8/8 mit `--testTimeout=60000`; mit dem Standard von 5 s läuft der Selbsttest unter Last in ein Timeout). Typprüfung (`tsc`) grün. Lint: 0 Fehler, 153 Warnungen (vorhandene).

## Offene Stellen in src/App.jsx (nach WP-39, Zeilen am Stand dieses Branches)

| Zeile | Befund | Gewünscht |
|---|---|---|
| 10874 / 10878 | `importieren` schreibt `zugehoerigkeit: [{ ab: z.eintritt }]` und `rolleSeit: z.eintritt`; bei null bleibt `ab` null (jetzt lesbar). | optional `ab: z.eintritt` beibehalten, oder bewusst ein ausdrücklich gewähltes Datum verlangen |
| 10699-10702 | `neuePerson` (manuelle Anlage): `eintritt: f.eintritt` ohne Prüfung; E-Mail wird aus dem Namen erfunden (`@betrieb.de`, derselbe Fehler wie IMP-1 Fehler 3). Keine Aufrufstelle im Quelltext gefunden, daher möglicherweise tot oder über Formular-Namen aufgerufen. | `eintrittPruefen(f.eintritt, { pflicht })` verwenden, Fehlermeldung anzeigen |
| Bearbeiten-Formular Person | `eintrittUebernehmen(person, eingabe)` verwenden, damit ein leeres Feld das Datum nicht überschreibt. Eine Stelle für das Bearbeiten wurde nicht gefunden. | wie links |
| 9373 | `eintritt: heute()` bei Anlage der Organisationsleitung (Registrierung) | ausdrückliche Wahl oder Hinweis |
| 9770 | `eintritt: mand.seit \|\| heute()` bei Leitungsperson aus Mandantendaten | wie oben |
| 6259 | `eintritt: jetzt` bei Zugangs-Platzhalter | fachlich Anlagedatum, prüfen |
| 11870 | `eintritt: e.anker` (Einrichtungsassistent): Ankerdatum des Plans | fachlich begründet, prüfen |
| 2764-2790 | Importoberfläche: Hinweistext und Spaltenliste; ein leerer Eintritt kann jetzt als "ohne Eintritt" angezeigt werden (Anzeige von `z.eintritt` in der Vorschau prüfen) | Anzeige "nicht angegeben" |

Außerhalb von App.jsx, nicht geändert: server/lib/provisionierung.mjs:204 setzt für die Leitungsperson bei der Registrierung `eintritt: heute()` (`tag`). Das ist das Anlagedatum; ob das als stillschweigender Standardwert gelten soll, ist eine Produktentscheidung.
