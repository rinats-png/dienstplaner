# IMP-2 — Nachweis Import-Parser

Stand: 2026-11-09. Branch `acc45/import/imp-2` (Basis `origin/integration/release-v4`). Vertrag: `docs/acc45/IMPORT-VERTRAG.md`.

## 1. Herkunft und Lizenz

- Bibliothek: SheetJS Community Edition **0.20.3**, aus der Herstellerdistribution `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` (am 2026-11-09 erreichbar, 2.409.319 Bytes).
  Nicht das npm-Paket `xlsx@0.18.5`; `package.json` der App enthält keine Abhängigkeit auf `xlsx` (geprüft in `import-parser-vendor.test.js`).
- Lokal: `vendor/sheetjs/` mit `xlsx.mjs`, `LICENSE`, `package.json`, `CHANGELOG.md` (byte-identisch aus dem Paket), `HERKUNFT.md`, `PRUEFSUMMEN.txt`. Es liegt keine zweite Kopie vor (nur der ES-Modul, nicht die dist-/CJS-Varianten).
- Lizenz: Apache-2.0, `vendor/sheetjs/LICENSE` mitkopiert; `package.json` der Bibliothek trägt `license: Apache-2.0`.
- Kein Laufzeit-Nachladen: `xlsx.mjs` enthält weder `fetch`, `XMLHttpRequest`, `child_process`, `eval` noch `new Function` (einziger Treffer auf `require(`: ein Kommentar in Zeile 1644, geprüft per Suche). Der Parser-Quelltext wird zusätzlich im Test auf Netz-, Schreib- und Eval-Aufrufe geprüft.

## 2. Prüfsummen (SHA-256)

| Datei | SHA-256 |
|---|---|
| xlsx-0.20.3.tgz (Referenz, nicht im Repo) | 8dc73fc3b00203e72d176e85b50938627c7b086e607c682e8d3c22c02bb99fe8 |
| vendor/sheetjs/xlsx.mjs | 1a0fb062ee9781b13f6687371b202aaefc53b6ce55b530c027e01f9c087b77db |
| vendor/sheetjs/LICENSE | 4d2a38ac35cda06a555c84074a819d413339cd3691b822cae50f8f322fe01f64 |
| vendor/sheetjs/package.json | bb9458277a69b41a304a89e45f19173ac0d23f2fc296091db49dba3c8b61c546 |
| vendor/sheetjs/CHANGELOG.md | 897b88e9889d75dc6a56b167a9457e71447cc8eabbed2513abef8015db66cccf |

Prüfung zur Testzeit: `pruefungen/import-parser-vendor.test.js` berechnet die Summen aller Dateien in `vendor/sheetjs/` neu, vergleicht mit `PRUEFSUMMEN.txt`,
schlägt bei zusätzlichen, fehlenden oder veränderten Dateien fehl und prüft Version, Lizenz und die Import-Regel (nur `vendor/sheetjs/xlsx.mjs`).

## 3. Lese-Optionen (gegen die SheetJS-Parse-Optionen und den vendorten Quelltext geprüft)

Jede Option kommt in `xlsx.mjs` als `opts.<name>` vor. Gesetzt in `parser-kern.mjs`:

| Option | Wert | Wirkung / Grund |
|---|---|---|
| `cellFormula` | false | Formeltexte werden nicht ausgelesen. SheetJS berechnet ohnehin keine Formeln; geliefert wird der gespeicherte Wert. |
| `cellHTML` | false | kein HTML aus Rich Text |
| `cellStyles` | false | keine Stile |
| `cellNF` | true | Zahlenformat je Zelle, nötig zur Datumserkennung (`SSF.is_date`) |
| `cellText` | true | formatierter Text `w` für Datumszellen |
| `cellDates` | false | Datum bleibt Rohzahl (Seriennummer), keine JS-Date-Interpretation |
| `bookVBA` | false | VBA-Projekt wird nicht gelesen oder übernommen |
| `bookProps`, `bookFiles`, `bookDeps`, `bookSheets` | false | ausdrücklich ausgeschaltet. Hinweis: `bookProps`/`bookSheets` = true würden nur Metadaten lesen; unser Wert ist der Vorgabewert. |
| `sheetStubs` | false | keine Platzhalter für leere Zellen |
| `sheetRows` | xlsx/ods: zeilen + 1 + 10.000 + 1; xls: 0 | begrenzt das Lesen sehr langer Blätter; jede Überschreitung ergibt `ZU_VIELE_ZEILEN` (siehe 7, Befund 2) |
| `dense` | true | speicherärmere Zeilenstruktur |
| `WTF` | false | keine Ausnahmen bei Toleranzfällen; kein `password` |

Grenzen dieser Optionen, ehrlich: SheetJS parst Dokumenteigenschaften teilweise trotzdem intern; der Parser **übernimmt** sie nicht in das Ergebnis
(`Props`, `Custom`, `Workbook` werden nie ausgegeben). Externe Verweise (`xl/externalLinks`) löst die Bibliothek nicht auf (kein Netzcode); der Parser meldet sie als Hinweis.
Eine eigene Option „externe Verweise aus“ gibt es in SheetJS nicht. Nur Lesen: kein `XLSX.write*`, kein `set_fs` im Parser (Test prüft den Quelltext).

## 4. Schwachstellen-Stand der Version 0.20.3

Quellen: `CHANGELOG.md` im Paket und die GitHub-Advisory-Datenbank (Abfrage `ecosystem=npm&affects=xlsx` am 2026-11-09).

| Advisory | Betroffen | Status in 0.20.3 |
|---|---|---|
| CVE-2023-30533 / GHSA-4r6h-8v6p-xvw6, Prototype Pollution, hoch | xlsx < 0.19.3 | behoben (CHANGELOG v0.19.3 „Fixed Prototype Pollution“) |
| CVE-2024-22363 / GHSA-5pgg-2g8v-p4x9, ReDoS, hoch | xlsx < 0.20.2 | behoben (CHANGELOG v0.20.2 „avoid slow regexes“) |
| CVE-2021-32012/-32013/-32014 (SheetJS Pro, DoS, mittel) | xlsx < 0.17.0 | nicht betroffen |

Keine zu 0.20.3 offene Advisory in der Abfrage. Das schließt unbekannte Fehler nicht aus; daher die Schutzschichten (Worker, Zeit-/Speicherlimit, ZIP-Prüfung). Neuere Version nach 0.20.3 wurde nicht gesucht (Freigabe lautet auf 0.20.3).
Zusätzlich im Test: Blattname `__proto__` führt nicht zu Prototype-Pollution.

## 5. Tests

Rot-Nachweis (vor der Umsetzung, Parser als Stub mit fester Antwort `UNBEKANNTES_FORMAT`): **42 von 48 Tests rot**, 6 grün (4 Einbindungs-Tests, die nur Dateien prüfen, und 2 Parser-Tests, die auch eine pauschale Ablehnung erfüllt, z. B. ungültige Eingabe). Darunter alle sicherheitsrelevanten: ZIP-Bombe (3 Varianten), Makro-Hinweis, Zeitlimit, Dateigröße, Magic-Byte-Erkennung.

Grün-Nachweis nach der Umsetzung: `npx vitest run pruefungen/import-parser.test.js pruefungen/import-parser-vendor.test.js` → **48 von 48 bestanden** (43 Parser, 5 Einbindung), ca. 46 s (jede Parser-Anfrage startet einen Worker-Thread; der Modul-Ladevorgang von SheetJS kostet je Aufruf ca. 0,5–1 s).
`npm run pruefung:import-parser` ist in `package.json` und in die Kette `pruefung` aufgenommen; `werkzeug/verdrahtung-pruefen.mjs` meldet „Verdrahtung ok: 284 Prüfdateien“. ESLint auf den neuen Dateien: 0 Befunde.

Abgedeckt: XLSX mit mehreren Blättern, XLS, ODS; CSV mit Semikolon (BOM, Anführungszeichen, Zeilenumbruch in Zelle) und Komma; TSV; Windows-1252-CSV; ungewöhnliche Spaltennamen;
Datum als Zahl und Text (xlsx, xls, ods); Wahrheitswerte; Formel ohne Berechnung/ohne Formeltext; leere Zeilen/Spalten mit Hinweis; falsche Endung (Magic Bytes, 4 Kombinationen);
nicht unterstützte Dateien (PDF, PNG, EXE, DOCX, XLSB, Binärmüll); beschädigte Dateien (4 Varianten); verschlüsselte Datei; Überlänge je Grenze (Datei, Zeilen, Spalten, Blätter, Zellen, jeweils am Limit ok und eins darüber abgelehnt);
ZIP-Bombe (erklärt > 100 MB, Verhältnis, lügender Header, zu viele Einträge; zur Laufzeit erzeugt, unter 1 MB groß); Zeitlimit; Ereignisschleife frei während des Parsens;
Makro-Datei (xlsm mit `vbaProject.bin`, getarnt als .xlsx, XLS mit VBA-Verzeichnis); externe Verweise.

Beim Schreiben der Tests aufgefallene Eigenheiten von SheetJS, die der Parser ausgleicht oder die nur den Testgenerator betreffen:
ODS-Blattnamen kommen mit XML-Entitäten (`&amp;`), der Parser entschlüsselt sie; SheetJS schreibt Datumswerte in lokaler Zeit (nur Testgenerator, der Test nutzt lokale Mitternacht).

## 6. Restrisiken und offene Punkte

1. **Unbekannte Fehler in SheetJS** (xls/ods-Parser sind komplex): abgefedert durch Worker (Zeit, Speicher, Absturz bleibt im Thread), aber nicht ausgeschlossen. Empfehlung: Pentest/Fuzz-Lauf vor Produktivbetrieb (nicht Teil von IMP-2).
2. ~~ZIP-Prüfung ist kein vollständiger Ersatz für eine eigene Entpackbibliothek~~ — durch Review PR #123 Befund 1 widerlegt und behoben: SheetJS bekommt jetzt nur noch ein selbst neu gebautes Archiv aus geprüften Einträgen (siehe 7).
3. **Doppelter Speicher statt doppelter Entpackarbeit**: seit Befund 1 entpackt nur noch der Parser; das neu gebaute Archiv ist unkomprimiert. Spitzenbedarf außerhalb des JS-Heaps bis ca. 2 × 100 MB im Worker; bewusst für Sicherheit.
4. **XLS-Makros** werden nur über den Verzeichnisnamen `_VBA_PROJECT` erkannt (Zeichenfolge im Container). Ein bewusst verschleierter Container könnte den Hinweis umgehen; ausgeführt wird in keinem Fall etwas.
5. **Zeilenlimit bei xlsx/xls/ods mit mehr als 10.000 Leerzeilen am Stück** meldet `ZU_VIELE_ZEILEN` (siehe Vertrag 3).
6. **Worker-Start je Anfrage** (ca. 0,5–1 s Latenz). Für Upload-Importe vertretbar; bei Bedarf Worker-Pool in einem späteren Paket.
7. **Zeichensatz**: nur UTF-8 und Windows-1252. UTF-16-Text wird als „nicht erkennbar“ abgelehnt.
8. Lokale Testumgebung: `pruefungen/verdrahtung.test.js` („das Repo selbst besteht“) überschreitet hier sein 5-s-Zeitlimit, weil das Werkzeug in diesem Worktree ca. 14 s braucht (Git-Abfragen). Unabhängig von IMP-2, das Werkzeug selbst endet fehlerfrei.
9. `docs/acc45/work-packages.json` enthält auf `origin/integration/release-v4` noch keine Einträge `IMP-*`; Status wurde dort nicht geändert (Auftrag: keine Änderungen an Statusquellen genannt). Eintrag und Statuswechsel sind Sache des Integrators.

## 7. Befunde aus dem Review (PR #123)

Branch `acc45/import/imp-2-fix` (Basis `origin/acc45/import/imp-2` @ 0aa4142). Korrektur nur in `server/lib/import/parser-kern.mjs`;
`vendor/sheetjs/` unverändert (SHA-256 aller sechs Dateien vor und nach der Änderung identisch, `import-parser-vendor.test.js` grün).
Bestehende Assertions unverändert; der Testhelfer `pruefungen/import-parser-hilfen.mjs` wurde nur rückwärtsverträglich erweitert
(`mappe(…, wbProps)`, `zip()` mit optionalem `extra`, `crc`, `methodeLokal`).

**Rot/Grün.** Rot: `import-parser.test.js` mit den neuen Tests gegen den unveränderten Parser von 0aa4142 → **18 von 65 rot**
(47 grün: alle 43 bisherigen Parser-Tests und 4 neue Begleit-/Positivtests, die schon vorher galten). Zusätzlich direkt geprüft: der alte
`parseKern` liefert für den kleinen PoC (Offset 10 = n − 1) `ok:true` mit Blattdaten. Grün nach der Korrektur:
`npx vitest run pruefungen/import-parser.test.js pruefungen/import-parser-vendor.test.js --testTimeout=60000` → **70 von 70** (65 Parser, 5 Einbindung).
ESLint auf `server/lib/import` und den drei Prüfdateien: 0 Befunde.

| Befund | Status | Test (Präfix `Review PR #123 Befund n:`) | vorher | nachher |
|---|---|---|---|---|
| 1 HOCH ZIP-EOCD-Mismatch | behoben | `B1-PoC: Eintragszahl Offset 8 ungleich Offset 10 wird abgewiesen, bevor SheetJS läuft` | rot (`pruefeZip` fehlt; alter Parser ok:true) | grün |
| 1 | | `B1-PoC: versteckter Eintrag mit 300 MB Entpackgröße führt nicht zu ok:true` | **rot: ok:true** (SheetJS entpackte 300 MB, 7,9 s) | grün (BESCHAEDIGT, < 4 s) |
| 1 | | `B1: EOCD nicht am Dateiende (angehängte Bytes / falsche Kommentarlänge) wird abgewiesen` | rot (ok:true) | grün |
| 1 | | `B1: zweite EOCD-Signatur (im Kommentar) wird abgewiesen` | rot (ok:true) | grün |
| 1 | | `B1: Zentralverzeichnis endet nicht exakt am EOCD (Lücke) wird abgewiesen` | rot (ok:true) | grün |
| 1 | | `B1: ZIP64-Extrafeld 0x0001 in einem Eintrag wird abgewiesen` | rot (ok:true) | grün |
| 1 | | `B1: falsche CRC und abweichende Methode im lokalen Kopf werden abgewiesen` | rot (ok:true) | grün |
| 1 | | `B1: doppelte Eintragsnamen werden abgewiesen` | rot (ok:true) | grün |
| 1 | | `B1: SheetJS erhält ein neu aufgebautes, sauberes Archiv aus geprüften Einträgen` | rot | grün |
| 1 | | `B1: Gesamtbudget entpackter Bytes über alle Einträge bricht ab` | rot | grün |
| 2 MITTEL stilles Abschneiden | behoben | `B2: xlsx ohne <dimension> mit Daten jenseits der Lesegrenze → ZU_VIELE_ZEILEN` | rot (ok:true, Zeile fehlt) | grün |
| 2 | | `B2: xlsx mit gefälschtem ref (<dimension ref="A1:A3">) → ZU_VIELE_ZEILEN` | rot (ok:true) | grün |
| 2 | | `B2: xlsx Zeilen ohne r-Attribut (implizit fortlaufend) über die Lesegrenze → ZU_VIELE_ZEILEN` | rot (ok:true) | grün |
| 2 | | `B2: Grenze exakt: Daten an Zeilenposition 10006 ok, an 10007 abgelehnt (xlsx)` | rot (10007 ok:true) | grün |
| 2 | | `B2: xls und ods mit Daten jenseits der Lesegrenze → ZU_VIELE_ZEILEN (kein Teilergebnis)` | grün (Absicherung) | grün |
| 3 MITTEL Datumssystem 1904 | behoben (Normierung) | `B3: xlsx: gleicher Kalendertag in 1900- und 1904-Mappe liefert gleiches Ergebnis` | rot | grün |
| 3 | | `B3: xls: …` und `B3: ods: …` (gleicher Test je Format, inkl. Geburts- und Eintrittsdatum) | rot | grün |
| 3 | | `B3: 1904-Testmappe speichert tatsächlich den um 1462 Tage kleineren Rohwert` | grün (Testdatei echt) | grün |
| 3 | | `B3: CSV hat kein Datumssystem (Vertragsform unverändert)` | grün | grün |
| 4 NIEDRIG Makro-Fehlalarm | behoben | `B4: normale 1-Blatt-xlsx (SheetJS-Standard-Content-Types) ohne Hinweis MAKROS_VERWORFEN` | rot (Hinweis gesetzt) | grün |
| 4 | | `B4: Content-Type application/vnd.ms-office.vbaProject allein genügt für den Hinweis` | grün | grün |
| 5 NIEDRIG Test-Timeouts | behoben | `vi.setConfig({ testTimeout: 60000 })` am Kopf von `import-parser.test.js`; keine Schwelle gelockert | – | – |
| 6 Spalten-Vorabprüfung | nur dokumentiert | Vertrag 8, „Spaltenzahl vor dem Ausbau“ | – | – |

**Befund 1 – Umsetzung.** `pruefeZip(buf, grenzen)` (exportiert, läuft vor SheetJS): EOCD = letzte Signatur (wie SheetJS), exakt am Dateiende
mit Kommentarlänge; Offset 8 = Offset 10 ≤ `archivEintraege`; Disk-Nummern 0; `cdVersatz + cdGroesse` = EOCD-Beginn und Einträge füllen das
Verzeichnis lückenlos; keine zweite EOCD-Signatur ab Verzeichnisbeginn; ZIP64 (Marker, Locator, Extrafeld 0x0001 in Verzeichnis **und** lokalem
Kopf) abgewiesen; lokaler Kopf muss in Name (Bytes), Merkmalen, Methode, Größen und CRC übereinstimmen; doppelte Namen abgewiesen. Jeder Eintrag
wird selbst mit `inflateRawSync` und `maxOutputLength` entpackt, Ist-Größe und CRC-32 geprüft, die tatsächlich entpackten Bytes laufend gegen
`entpacktBytes` summiert (sofortiger Abbruch). Danach baut der Parser aus den geprüften Einträgen ein **neues** unkomprimiertes Archiv und gibt
nur dieses an SheetJS. Damit ist es gleichgültig, wie SheetJS das Original gelesen hätte (Offset 8, EOCD-Suche ab `length-4`, ZIP64-Extrafeld):
es sieht das Original nie. Die Speichergrenze außerhalb des V8-Heaps ist das Entpackbudget (Buffer-Bytes), nicht `maxOldGenerationSizeMb`.
Bewusst nicht geprüft: EOCD-Signaturen **innerhalb** komprimierter Daten vor dem Verzeichnis (zufällig möglich, für SheetJS ohne Bedeutung,
da es das Original nicht mehr liest).

**Befund 2 – Umsetzung.** Lesegrenze `L = zeilen + 1 + 10.000` Zeilenpositionen. xlsx: vor SheetJS wird die höchste Zeilenposition jedes Blatt-XML
selbst bestimmt (Logik wie SheetJS: `r`-Attribut, sonst Vorgänger + 1), unabhängig von `<dimension>`; über `L` → `ZU_VIELE_ZEILEN`.
xlsx/ods: `sheetRows = L + 1`, und mehr als `L` gelesene Zeilen (`!data.length`) oder `!fullref` über `L` → `ZU_VIELE_ZEILEN`. xls: ohne `sheetRows`
(nichts wird abgeschnitten), danach dieselbe Positionsgrenze. Ergebnis immer ohne Teilübernahme.

**Befund 3 – Entscheidung: Normierung auf 1900 (mit Kennzeichnung).** Begründung: Ein Rohwert, dessen Bedeutung von einem zweiten Feld abhängt,
wird früher oder später falsch ausgewertet (IMP-1, Export, Vergleich zweier Dateien); ein Tag Versatz bei Geburts- oder Eintrittsdatum ist in
Personaldaten ein stiller, fachlich schwerer Fehler. Deshalb liefert der Parser `roh` immer im System 1900 und kennzeichnet die Herkunft zusätzlich
(`datumssystem`, Hinweis `DATUMSSYSTEM_1904`). Umgerechnet wird nach Metadaten (`Workbook.WBProps.date1904`), genau einmal, nur bei numerischen
Zellen mit Datumsformat (die einzige Stelle, an der ein `{typ:"datum"}` mit Rohzahl entsteht); gewöhnliche Zahlen (z. B. 1462, Stunden,
Personalnummer) und Text bleiben unverändert. `cellDates` bleibt aus, SheetJS liefert also keine bereits interpretierten Datumswerte, die doppelt
umgerechnet werden könnten. `text` stammt von SheetJS, das das Datumssystem dabei selbst berücksichtigt; die Tests zeigen identische `text`-Werte.
`datumssystem` gibt es nur bei Arbeitsmappen; die bestehende Vertragsprüfung der CSV-Ergebnisform bleibt dadurch unverändert gültig.

**Befund 4.** Makro nur bei `vbaProject.bin`, ODS-Skripten oder Content-Type `application/vnd.ms-office.vbaProject`; die allgemeine
`Default Extension="bin"`-Zeile von SheetJS-Dateien löst nichts mehr aus.

**Offene Punkte.** (a) Punkt 6 (Spaltenprüfung vor dem Ausbau) nicht umgesetzt: nicht trivial, weil die Spaltengrenze nach Entfernen leerer
Spalten zählt; begrenzt durch Zeit-/Speicher-/Entpackgrenzen. (b) Positionsgrenze für Zeilen ist konservativ: Dateien mit mehr als 10.000 Leerzeilen
vor den letzten Daten werden abgelehnt. (c) Speicher-Spitze ca. 2 × Entpackbudget im Worker.
