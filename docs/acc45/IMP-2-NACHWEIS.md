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
| `sheetRows` | 0 (alle Formate) | aus: SheetJS übersprang Zeilen jenseits davon still (Review 1da3ceb, M1, siehe 8). Früher bei ods gesetzt; ODS wird seit Review 8725dc5 (E1) nicht mehr gelesen (siehe 9). |
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

## 8. Befunde aus dem Review (1da3ceb)

Branch `acc45/import/imp-2-fix2` (Basis `origin/acc45/import/imp-2` @ 1da3ceb). Zwei Commits: zuerst nur die Tests (Rot-Nachweis per Commit),
danach die Korrektur. Geändert: `server/lib/import/parser-kern.mjs`, `pruefungen/import-parser.test.js`, `pruefungen/import-parser-hilfen.mjs`
(nur rückwärtsverträglich: `mappe(…, schreib)` für `bookSST`), dieser Nachweis, `IMPORT-VERTRAG.md`. `vendor/sheetjs/` unverändert:
SHA-256 von `xlsx.mjs` = `1a0fb062…77db`, `LICENSE`, `package.json`, `CHANGELOG.md` wie in Abschnitt 2; `import-parser-vendor.test.js` grün.

**Geänderte bestehende Assertion (eine, bewusst):** `Review PR #123 Befund 3: B3: <fmt>: gleicher Kalendertag …` prüfte
`expect(b.datumssystem).toBe("1904")`. Die verbindliche Entscheidung H1 legt fest, dass `datumssystem` das Ergebnis beschreibt; die Zeile prüft jetzt
`"1900"` und zusätzlich `datumssystemQuelle === "1904"`. Beide Anforderungen („keine Assertion ändern“ und H1) ließen sich nicht zugleich erfüllen;
H1 hat Vorrang. Keine andere Assertion wurde geändert oder entfernt.

**Rot/Grün.** Rot: `import-parser.test.js` mit den neuen Tests gegen den Parser von 1da3ceb (Commit `IMP-2 Review 1da3ceb: Tests …`) →
**19 von 87 rot** (68 grün: alle 68 bisherigen und neuen Begleit-/Absicherungstests, die schon vorher galten). Grün nach der Korrektur:
`npx vitest run pruefungen/import-parser.test.js pruefungen/import-parser-vendor.test.js --testTimeout=60000` → **92 von 92** (87 Parser,
5 Einbindung), ca. 75 s. ESLint auf `server/lib/import` und den drei Prüfdateien: 0 Befunde.

| Befund | Status | Test (Präfix `Review 1da3ceb …:`) | vorher | nachher |
|---|---|---|---|---|
| H1 Datum an einer Stelle | behoben | `H1: xlsx: gleicher Kalendertag in 1900- und 1904-Mappe liefert gleiche roh-Werte; datumssystem "1900", datumssystemQuelle "1904"` | rot (`"1904"`) | grün |
| H1 | | `H1: xls: …` und `H1: ods: …` (derselbe Test) | rot | grün |
| H1 | | `H1: xlsx: Zeitwert 06:00 und Dauer [h]:mm werden in der 1904-Mappe nicht verschoben` | **rot: roh 1462.25 statt 0.25** | grün |
| H1 | | `H1: xls: …` und `H1: ods: …` (derselbe Test) | rot (1462.25) | grün |
| H1 | | `H1: xlsx: Zelle t="d" ohne Datumsformat bleibt unverändert (keine zweite Verschiebung, kein Datumsobjekt)` | grün (Absicherung) | grün |
| H1 | | `H1: ods: null-date nach der Tabelle wird abgelehnt (kein um 1462 Tage falsches Datum)` | **rot: ok:true, Datum um 4 Jahre verschoben** | grün (BESCHAEDIGT) |
| H2 Textmenge | behoben | `H2-PoC: 1,2-MB-xlsx mit einem großen sharedStrings-Eintrag und vielen Verweisen wird abgelehnt, bevor postMessage kopiert` | **rot: ok:true** | grün (TEXT_ZU_GROSS, im Kern) |
| H2 | | `H2: Summe der Zeichen über alle Zellen über dem Entpack-Budget → TEXT_ZU_GROSS (jede Zelle unter 32.767)` | rot (ok:true) | grün |
| H2 | | `H2: Höchstlänge je Zelle 32.767 Zeichen: genau am Limit ok, eins darüber abgelehnt (xlsx und CSV)` | rot | grün |
| M1 Zeilen still verloren | behoben | `M1-PoC: <row r=50000> ohne Anführungszeichen → ZU_VIELE_ZEILEN (nicht still verworfen)` | **rot: ok:true, Zeile fehlt** | grün |
| M1 | | `M1-PoC: r="4" mit x:r="50000" (doppeltes Attribut) → BESCHAEDIGT` | rot (ok:true) | grün |
| M1 | | `M1-PoC: <ext r="50000"> nach der letzten Zeile → BESCHAEDIGT` | rot (ok:true) | grün |
| M1 | | `M1-PoC: r="&#53;" (Entität im r-Wert) → BESCHAEDIGT` | rot (ok:true, Zelle fehlt) | grün |
| M1 | | `M1: ungültige c-r-Werte und doppelte Zellattribute → BESCHAEDIGT` | rot | grün |
| M1 | | `M1: r ohne Anführungszeichen innerhalb der Grenze ist zulässig und wird gelesen` | grün (Absicherung) | grün |
| M1 | | `M1: ohne Ablehnung im Vorfilter greift die Prüfung der tatsächlich gelesenen Zeilen (kein sheetRows)` | grün (Absicherung) | grün |
| M2 Namensnormalisierung | behoben | `M2-PoC: xl/worksheets/sheet1.xml und /xl/worksheets/sheet1.xml in einer Datei → BESCHAEDIGT` | rot (ok:true) | grün |
| M2 | | `M2: // wird zu / zusammengefasst (Doppel nach Normalisierung) → BESCHAEDIGT` | rot | grün |
| M2 | | `M2: Steuerzeichen \u0000–\u0006 und Backslash im Namen → BESCHAEDIGT` | rot | grün |
| M2 | | `M2: Archiv mit führendem / in allen Namen wird wie bei SheetJS gelesen` | rot (NICHT_UNTERSTUETZT) | grün |

**H1 – Umsetzung.** Der Parser ist die einzige umrechnende Stelle. `datumssystem` ist bei Arbeitsmappen immer `"1900"` (Ergebnis),
`datumssystemQuelle: "1904"` nur bei 1904-Mappen. Verschoben wird nur bei Formaten mit Datumsteil (`hatDatumsteil`, Zerlegung wie SSF
`fmt_is_date`); Zeit- und Dauerformate nicht, weil ihr Wert ein Tagesbruchteil bzw. eine Dauer ist. ODS: `<table:null-date>` mehrfach oder nach
der ersten Tabelle → `BESCHAEDIGT` (SheetJS hätte die Zellen davor im System 1900 berechnet und das Ergebnis danach als 1904 gekennzeichnet),
ungewöhnlicher Wert → `NICHT_UNTERSTUETZT`.

**H2 – Umsetzung.** `pruefeTextmenge` läuft im Kern (also im Worker) als letzter Schritt vor der Rückgabe, die der Worker per `postMessage`
schickt: je Zelle ≤ `zellZeichen` (32.767), alle Texte zusammen ≤ `entpacktBytes` Zeichen, sonst `TEXT_ZU_GROSS` ohne Teilergebnis.
Messung mit der PoC-Datei (1,14 MB, ein 1,5-Mio.-Zeichen-Eintrag, 1.000 Verweise): vorher `ok:true`, 1,5 Mrd. Zeichen im Hauptthread,
Heap +1.415 MB, 5,0 s; nachher `TEXT_ZU_GROSS`, 0 Zeichen, Heap +0 MB, 0,7 s. Mit 100 Verweisen (Testfall) vorher 150 Mio. Zeichen.

**M1 – Umsetzung.** `sheetRows` entfällt bei xlsx (bleibt bei ods). `pruefeBlattXml` ersetzt die alte Vorzählung und folgt dem Lesepfad
von SheetJS (siehe Vertrag 3): Zeilenelement muss `row` heißen, Attribute einmalig (Schlüssel wie `parsexmltag`, also `x:r`, `R`, `r_x`
zählen als `r`), `row r` nur Ziffern ≥ 1 (mit/ohne Anführungszeichen), `c r` nur `[A-Z]+` + Ziffern, Zeile ≥ 1, Spalte ≤ XFD. Zellbezüge
zählen zur höchsten Zeilenposition. Ursache der PoCs: SheetJS liest `r=50000` ohne Anführungszeichen, `x:r` überschreibt `r`, jedes Element
vor `>` gilt als Zeile, und `&#53;` ergibt NaN (Zelle an Position −1, verloren). UTF-16-Blätter werden wie bei SheetJS (BOM) dekodiert.

**M2 – Umsetzung.** `normiereName`: Bytes 0x00–0x06 und `\` → `BESCHAEDIGT`; führendes `/` entfernt, `//+` → `/`; Doppelprüfung (ohne
Groß-/Kleinschreibung) auf dem normalisierten Namen; das saubere Archiv für SheetJS trägt die normalisierten Namen.

**Für IMP-3 (eigener Schritt, hier nicht geändert):** IMP-3 darf keine zweite 1904-Verschiebung machen. Stand
`origin/acc45/import/imp-3-auflagen2` (edba1d7):
1. `server/lib/import/personen.mjs` `datumAusZelle(z, datumssystem)`: Epoche immer 25569 (System 1900), Untergrenze `roh >= 1`; den Zweig
   `ist1904 ? 24107 : 25569` und den Parameter `datumssystem` entfernen (bzw. ignorieren). `datumssystemAus` wird für Berechnungen nicht mehr gebraucht.
2. `analysieren({ …, datumssystem })` und `server/lib/import/uebernahme.mjs` (Zeile ~120): kein Datumssystem mehr durchreichen.
3. `server/funktionen/import.mjs` (Zeilen ~170–262): `erg.datumssystem`/`blaetter[].datumssystem` nicht mehr für die Umrechnung verwenden;
   falls angezeigt, nur `datumssystemQuelle` als Information. Ältere Momentaufnahmen mit `datumssystem: 1904` aus Testständen nicht umrechnen.
4. `pruefungen/import-endpunkt.test.js` (Zeilen ~930–968): Die Nachhilfe, die `datumssystem: "1904"` in die Parser-Ausgabe schreibt, bildet den
   Vertrag nicht mehr ab; der „echte Parser-Weg“ muss für eine 1904-Mappe dasselbe Datum wie für eine 1900-Mappe ergeben.

**Offene Punkte.** (a) ODS liest weiter mit `sheetRows`; die bestehende Prüfung (`!data.length`, `!fullref`) gilt, eine strenge Vorprüfung des
ODS-XML (`number-rows-repeated`) wie bei xlsx gibt es nicht. (b) xlsx-Zellen mit Tabulator statt Leerzeichen nach `<c` erkennt SheetJS nicht als
Zelle (fehlerhaftes XML; kein Grenzthema, nicht abgewiesen). (c) Die IMP-3-Angleichung (oben) steht aus; bis dahin würde IMP-3 auf
`imp-3-auflagen2` bei 1904-Mappen nichts doppelt verschieben, weil `datumssystem` jetzt `"1900"` ist, die dortigen Tests mit eingespeistem
`"1904"` prüfen aber ein nicht mehr gültiges Verhalten.

## 9. Befunde aus dem Sicherheitsreview 8725dc5

Branch `acc45/import/imp-2-fix3` (Basis `origin/acc45/import/imp-2` @ 8725dc5). Zwei Commits: zuerst nur die neuen Tests (Rot-Nachweis per
Commit `IMP-2 Sicherheitsreview 8725dc5: Regressionstests E1-E7 …`), danach die Korrektur. Geändert: `server/lib/import/parser-kern.mjs`,
`pruefungen/import-parser.test.js`, `IMPORT-VERTRAG.md`, dieser Nachweis. `vendor/sheetjs/` unverändert (SHA-256 `xlsx.mjs` = `1a0fb062…77db`,
`LICENSE`, `package.json`, `CHANGELOG.md` wie in Abschnitt 2; `import-parser-vendor.test.js` grün).

**Entscheidungen (verbindlich, vorgegeben):** E1 ODS nicht unterstützt; E2 XLS nur mit plausibler CFB-Struktur; E3 xlsb, sonstige Binärformate,
unbekannter Hauptinhaltstyp → `NICHT_UNTERSTUETZT`; E4 strikte Paketprüfung xlsx; E5 Blattnamen ≤ 31 Zeichen, Hinweise in der Textmenge;
E6 nur UTF-8; E7 Spalten-Fallback begrenzen oder ablehnen (gewählt: **ablehnen**, siehe unten).

**Rot/Grün.** Rot: die 25 neuen Tests gegen den Parser von 8725dc5 → **23 rot, 2 grün** (die 2 grünen sind ausgewiesene Absicherung bzw.
Dokumentation). Grün nach der Korrektur, zweimal gelaufen:
`npx vitest run pruefungen/import-parser.test.js pruefungen/import-parser-vendor.test.js --testTimeout=60000` → **113 von 113** (108 Parser,
5 Einbindung), 106 s und 107 s. ESLint auf `server/lib/import` und den drei Prüfdateien: 0 Befunde. `node werkzeug/verdrahtung-pruefen.mjs`:
„Verdrahtung ok: 284 Prüfdateien“ (nur bekannte Warnungen zu anderen Paketen).

| Befund (PoC aus dem Review) | Maßnahme | Test (Präfix `Review 8725dc5 …:`) | vorher | nachher |
|---|---|---|---|---|
| Getarnte ODS (xlsx + `META-INF/manifest.xml`) | E1: Formatbestimmung wie SheetJS, ODS-Merkmale → `NICHT_UNTERSTUETZT` | `E1-PoC: getarnte ODS (xlsx-Teile plus META-INF/manifest.xml und content.xml) → NICHT_UNTERSTUETZT, nicht als ODS gelesen` | **rot: ok:true, als „xlsx“ gemeldet, ODS-Inhalt gelesen** | grün |
| ODS allgemein | E1 | `E1: echte ODS-Datei (auch mit Endung .xlsx oder .xls) → NICHT_UNTERSTUETZT mit verständlicher Meldung` | rot (ok:true) | grün |
| null-date/Unicode | E1 (ODS-Prüfung entfällt, `pruefeOdsNullDatum` entfernt) | `E1-PoC null-date/Unicode: ODS mit null-date (1904, auch mit Unicode-Präfix nach der Tabelle) → NICHT_UNTERSTUETZT` | rot (ok:true) | grün |
| Tabellen-Alias | E1 | `E1-PoC Tabellen-Alias: ODS mit Tabellen-Element unter anderem Präfix → NICHT_UNTERSTUETZT` | rot (ok:true) | grün |
| Getarnte xlsb (`wb.bin` in Content_Types, leere `workbook.xml`) | E3: Arbeitsmappe aus `[Content_Types].xml`; xlsb-Typ oder Pfad auf `bin` → `NICHT_UNTERSTUETZT` | `E3-PoC: getarnte xlsb (wb.bin in [Content_Types].xml, leere xl/workbook.xml) → NICHT_UNTERSTUETZT` | **rot: ok:true, xlsb-Inhalt gelesen** | grün |
| Arbeitsmappen-Typen | E4: genau ein Override; xlsx- oder xlsm-Typ; Vorlage/Add-in/fehlend → `NICHT_UNTERSTUETZT`; zwei → `BESCHAEDIGT` | `E4: Arbeitsmappen-Inhaltstyp: Vorlage, Add-in oder fehlend → NICHT_UNTERSTUETZT; zwei Arbeitsmappen → BESCHAEDIGT` | rot (ok:true) | grün |
| Makro-Typ | E4: nie Makros lesen, Hinweis `MAKROS_VERWORFEN` | `E4: Makro-Arbeitsmappentyp: Makros werden nie gelesen, Hinweis MAKROS_VERWORFEN, nur Tabellendaten` | rot (kein Hinweis) | grün (überholt durch imp-2-fix4, siehe Offene Punkte (d)) |
| Makro-Typ abweisen (imp-2-fix4) | E4-Entscheidung: xlsm → `NICHT_UNTERSTUETZT`, keine Datenübernahme | `xlsm wird nicht gelesen: NICHT_UNTERSTUETZT mit Hinweistext, keine Daten, kein Teilergebnis` (+ Erwartung der zwei bestehenden xlsm-Tests ersetzt) | rot (gegen 9e7b2ff: `ok:true`) | grün |
| Blatt `.dat` mit `r=&#53;` | E4: jeder Teil mit `sheetData` wird geprüft, unabhängig von der Endung | `E4-PoC: Blatt mit Endung .dat (oder ohne Endung) und r="&#53;" wird vorab geprüft → BESCHAEDIGT` | **rot: ok:true, Zeile still verloren** | grün |
| Binäres Blatt in xlsx | E3/E4: `.bin`-Teile erreichen SheetJS nicht; nicht lesbares Blatt nie still leer | `E3/E4: binäres Blatt (.bin) in einer xlsx wird nicht an SheetJS gegeben → NICHT_UNTERSTUETZT` | rot (ok:true, `parse_ws_bin`) | grün |
| Numbers, `Index.zip`, ohne Content_Types | E3 | `E3: Numbers-Paket, verschachteltes Index.zip und ZIP ohne [Content_Types].xml → NICHT_UNTERSTUETZT` | rot (BESCHAEDIGT) | grün |
| bookType-Abgleich | nach dem Lesen `bookType` gegen Format; Abweichung → `BESCHAEDIGT` | `Nach dem Lesen wird bookType mit dem erkannten Format abgeglichen (Abweichung → BESCHAEDIGT)` | rot (Funktion fehlt) | grün |
| UTF-16-Blatt mit BOM | E6: UTF-16-BOM (wie `cc2str`) → `BESCHAEDIGT` | `E6-PoC: UTF-16-Blatt mit BOM (LE und BE) → BESCHAEDIGT` | **rot: ok:true** | grün |
| Andere Kodierung | E6: gültiges UTF-8 und Deklaration UTF-8 Pflicht; UTF-8-BOM zulässig | `E6: Blatt in anderer Kodierung (Deklaration ISO-8859-1 oder ungültiges UTF-8) → BESCHAEDIGT; UTF-8 mit BOM bleibt lesbar` | rot (ok:true) | grün |
| Content_Types/Arbeitsmappe UTF-16 | E4/E6 | `E6: [Content_Types].xml und Arbeitsmappe als UTF-16 → BESCHAEDIGT` | rot (ok:true) | grün |
| 8-MB-Blattname | E5: Name > 31 Zeichen → `BESCHAEDIGT` ohne Namen | `E5-PoC: 8-MB-Blattname → BESCHAEDIGT, Meldung ohne den Namen, kleines Ergebnis` | **rot: ok:true, 8 MB Name im Ergebnis und in Hinweisen** | grün |
| Lange Blattnamen in Fehlertexten | E5: Prüfung vor jedem Hinweis/Fehlertext | `E5-PoC: Blattname über 31 Zeichen erscheint nicht in Fehlertexten (z. B. ZU_VIELE_ZEILEN)` | **rot: ZU_VIELE_ZEILEN mit dem Namen** | grün |
| Grenze 31 | E5 | `E5: Blattname mit genau 31 Zeichen ist zulässig, mit 32 nicht` | rot (32 ok:true) | grün |
| Hinweise in der Textmenge | E5/H2: `pruefeTextmenge` zählt `nachricht` und `blatt` aller Hinweise, als letzter Schritt | `E5/H2: Hinweistexte zählen zur Textmenge` | rot (ok:true) | grün |
| Spalten-Fallback | E7: ablehnen (siehe unten) | `E7-PoC: Zelle ohne r mit fremdem Spaltenkürzel (xr="…" oder r= in einem Kindelement) → BESCHAEDIGT` | **rot: ok:true, Zelle in fremder Spalte** | grün |
| Fortlaufende Spalte | E7: ≤ XFD | `E7: fortlaufende Spalte ohne r über XFD hinaus → BESCHAEDIGT; innerhalb normal gelesen` | rot (ok:true) | grün |
| XLS: zyklische Sektorkette | E2: Ketten ohne Zyklus/Doppelnutzung | `E2-PoC: zyklische Sektorkette im Workbook-Strom → BESCHAEDIGT (statt Endlosschleife bis zum Zeitlimit)` | **rot: ZEITLIMIT nach 8 s (Endlosschleife in `get_sector_list`)** | grün (ca. 1 s samt Testdatei-Erzeugung) |
| XLS: Größenbudget | E2: Stromgröße passt in die Kette, Summe ≤ `entpacktBytes` | `E2-PoC: Stromgröße größer als seine Sektorkette (Größenbudget vor dem Lesen) → BESCHAEDIGT` | rot (ok:true) | grün |
| XLS ohne Tabellenstrom | E2/E3 | `E2: OLE-Datei ohne Workbook-/Book-Strom → NICHT_UNTERSTUETZT` | rot (BESCHAEDIGT) | grün |
| XLS-Kopf | E2 | `E2: falsche Sektorgröße oder Mini-Sektorgröße → BESCHAEDIGT; gültige große XLS wird gelesen (Absicherung)` | grün (Absicherung) | grün |
| Zeitformat mit echtem Datum in 1904-Mappe | dokumentiert (Vertrag 6): `v ≥ 1` mit reinem Zeitformat wird nicht verschoben, mit Datumsteil schon | `Wert v ≥ 1 mit reinem Zeitformat (hh:mm) wird in der 1904-Mappe nicht verschoben; mit Datumsteil schon` | grün (Dokumentation, keine Sicherheitsänderung) | grün |

**Geänderte bestehende Erwartungen (E1, bewusst):** Folgende Erwartungen schrieben ODS als unterstützt fest und widersprechen E1. Sie wurden
angepasst (Assertions sonst unverändert); Ersatz prüft jeweils `NICHT_UNTERSTUETZT`:
1. `IMP-2 gültige Formate › ods: mehrere Blätter …` (Schleife `["xlsx","xls","ods"]` → `["xlsx","xls"]`; Ersatz: `E1: echte ODS-Datei …`).
2. `Datum in XLS und ODS ebenfalls als Rohzahl plus Text` (Schleife ohne `"ods"`).
3. `XLS mit Endung .xlsx und ODS mit Endung .xls`: `expect(b.ok && b.format).toBe("ods")` → `toMatchObject({ ok:false, code:"NICHT_UNTERSTUETZT" })`.
4. `B2: xls und ods mit Daten jenseits der Lesegrenze …` (Schleife ohne `"ods"`).
5. `B3: ods: gleicher Kalendertag …` (Schleife ohne `"ods"`).
6. `H1: ods: gleicher Kalendertag …` und `H1: ods: Zeitwert 06:00 …` (Schleife ohne `"ods"`).
7. `H1: ods: null-date nach der Tabelle …`: die Gegenprobe `roh: 45306` für die unveränderte 1904-ODS → `NICHT_UNTERSTUETZT`.

**Berichtigte Testeingabe (keine Assertion geändert):** `Makro-Datei (xlsm mit vbaProject.bin) …` ersetzte bisher „sheet.main+xml“ durch
„sheet.macroEnabled.main+xml“ und erzeugte so den Phantasietyp `…spreadsheetml.sheet.macroEnabled.main+xml`, den es nicht gibt (SheetJS fiel auf
`xl/workbook.xml` zurück). Nach E3/E4 ist ein unbekannter Arbeitsmappentyp `NICHT_UNTERSTUETZT`. Die Eingabe verwendet jetzt den echten xlsm-Typ
`application/vnd.ms-excel.sheet.macroEnabled.main+xml`; alle Assertions (ok:true, Daten, `MAKROS_VERWORFEN`, kein Makrocode) gelten unverändert.

**Umsetzung im Einzelnen.**
- *Format wie SheetJS* (`erkennePaket`): `mimetype` → ODS bzw. „OpenDocument, keine Tabelle“; `META-INF/manifest.xml`, `objectdata.xml` → ODS;
  `Index/Document.iwa` → Numbers; ohne `[Content_Types].xml` → keine Tabelle (Numbers 08/09, `Index.zip`) — alles `NICHT_UNTERSTUETZT`.
  `[Content_Types].xml` wird wie `parse_ct` gelesen (`tagregex1`, Attribute wie `parsexmltag`, doppelte Attribute → `BESCHAEDIGT`). Arbeitsmappe
  = Override mit einem der fünf Arbeitsmappentypen aus `ct2type`; genau einer; xlsb/xlam/xltx → `NICHT_UNTERSTUETZT`; Namensraum falsch →
  `BESCHAEDIGT`; Pfad auf `bin` → `NICHT_UNTERSTUETZT`; Pfad fehlt im Archiv → `BESCHAEDIGT`. Namen ohne Groß-/Kleinschreibung (`safegetzipfile`).
- *Inhaltsprüfung je Teil* (`pruefeEintraege`): `.bin` → nicht ins saubere Archiv; sonst UTF-16-BOM → `BESCHAEDIGT`; XML-artig oder mit `sheetData`
  → strenges UTF-8 und Deklaration UTF-8; mit `sheetData` → `pruefeBlattXml`. Der erste Befund wird nach der Formatbestimmung gemeldet.
- *Nach dem Lesen*: `buchtypPasst(format, wb.bookType)`; Blattnamen ≤ 31; bei xlsx jedes Blatt vorhanden (sonst `BESCHAEDIGT`, bzw.
  `NICHT_UNTERSTUETZT`, wenn `.bin`-Teile ausgelassen wurden). `ENDUNG_ABWEICHEND` zeigt die Endung höchstens mit 10 Zeichen; `pruefeTextmenge`
  läuft als letzter Schritt mit allen Hinweisen.
- *E7 – Entscheidung „ablehnen“*: SheetJS nimmt die Spalte aus dem ersten Treffer von `/r=["']([^"']*)["']/` im ganzen Zelltext. Eine Begrenzung
  hätte die fremde Spalte weiter akzeptiert (Zelle an falscher Stelle, still); Ablehnen ist einfacher und eindeutig: mit `r`-Attribut muss der
  Treffer gleich dem Attribut sein, ohne `r`-Attribut darf es keinen Treffer geben; fortlaufende Spalte ≤ XFD. Echte Excel-Dateien schreiben `r`
  immer als erstes Zellattribut; Kindelemente der Zelle (`v`, `f`, `is`) tragen kein `r=`.
- *E2 – CFB* (`pruefeCfb`): Kopf, DIFAT/FAT wie `sleuth_fat`, Ketten mit Zyklus-/Bereichs-/Doppelprüfung, Stromgröße ≤ Kette, Summe ≤ `entpacktBytes`,
  Stammeintrag zuerst, Strom `Workbook`/`Book`. Ein letzter, kürzerer Sektor (angehängte Bytes) bleibt zulässig (wie `sectorify`).

**Ausgeschlossene Formate (Stand nach diesem Branch):** ODS/FODS/UOC und andere OpenDocument-Pakete; xlsb (auch getarnt); xltx (Vorlage);
xlam (Add-in); Apple Numbers (alle Varianten); ZIP-Pakete ohne `[Content_Types].xml` oder ohne/mit unbekanntem Arbeitsmappentyp (Word, PowerPoint
usw.); OLE2 ohne `Workbook`/`Book`-Strom (Word, PowerPoint, Quattro Pro); verschlüsselte Dateien (`PASSWORTGESCHUETZT`); XML/HTML; ZIP64;
mehrteilige Archive. xlsm (Makro-Typ, ab imp-2-fix4). Unterstützt: xlsx (ohne Makro-Typ), xls (CFB/BIFF), CSV, TSV.

**Für IMP-3 (nur benannt, nicht umgesetzt):** `TEXT_ZU_GROSS` und `ZU_VIEL_GLEICHZEITIG` im Endpunkt-Vertrag führen und anzeigen; die
Datumsumrechnung in IMP-3 bleibt entfernt (bereits im Branch `acc45/import/imp-3-datum`). IMP-3 muss außerdem damit rechnen, dass ODS jetzt
`NICHT_UNTERSTUETZT` liefert (Oberflächentext/Hilfetext „ODS“ anpassen).

**Offene Punkte.** (a) XLS: Für Blätter, die SheetJS in einer xls nicht lesen kann, gibt es keine Prüfung „Blatt fehlt“ wie bei xlsx (SheetJS
liefert dort für Diagrammblätter u. U. kein Blatt; ohne echte Excel-Testdateien nicht sicher abgrenzbar). (b) Die Formel-Zellen-Fälle aus 8 (b)
bleiben. (c) Die strikte Paketprüfung ist gegen synthetische, von SheetJS geschriebene Dateien getestet; ein Gegenlauf mit echten Excel-/LibreOffice-
Exporten (xlsx, xlsm, xls) vor dem Pilotbetrieb wird empfohlen (Testdaten-Vorgabe: nur synthetische Dateien im Repo). (d) **Erledigt in imp-2-fix4 (E4-Entscheidung):** xlsm (Makro-Typ) wird mit
`NICHT_UNTERSTUETZT` abgewiesen („Dateien mit Makros (xlsm) werden nicht gelesen. Bitte die Datei als .xlsx speichern (Makros entfernen).“), ohne Datenübernahme
und ohne Teilergebnis. Eine Zeile in `erkennePaket`; neuer Test `xlsm wird nicht gelesen` (rot gegen 9e7b2ff: `ok:true`); die beiden bestehenden xlsm-Tests
(`Makro-Datei (xlsm mit vbaProject.bin)…`, `E4: Makro-Arbeitsmappentyp…`) erwarten jetzt `NICHT_UNTERSTUETZT` statt `ok:true` + Hinweis (Erwartung ersetzt, keine Assertion gelöscht).
`MAKROS_VERWORFEN` bleibt für vbaProject-Teile in xlsx ohne Makro-Typ und für XLS mit VBA.

## 10. Befunde aus dem Review bbf64ca

Branch `acc45/import/imp-2-fix5` (Basis `origin/acc45/import/imp-2-fix4` @ bbf64ca). Zwei Commits: zuerst nur die Tests (Rot-Nachweis per Commit),
danach die Korrektur. Geändert: `server/lib/import/parser-kern.mjs` (`pruefeCfb`, Kommentar; `erk.makroTyp` im Makro-Hinweis entfernt, toter Code),
`pruefungen/import-parser.test.js` (neuer Block `Review bbf64ca (imp-2-fix5): …`, 7 Tests; keine bestehende Assertion geändert oder entfernt),
`pruefungen/import-parser-hilfen.mjs` (nur ergänzt: `cfbDatei`, `workbookStrom`), `IMPORT-VERTRAG.md` (Abschnitt 2 und 5a), dieser Nachweis.
`vendor/sheetjs/` unverändert: SHA-256 `xlsx.mjs` = `1a0fb062…77db`.

| Auflage | Status | Test | vorher (bbf64ca) | nachher |
|---|---|---|---|---|
| A1 Endlosschleife (Verzeichnisbaum) | behoben | `A1-PoC: gültige XLS, Baumzeiger der Einträge 2 und 3 zeigen aufeinander → BESCHAEDIGT in unter 2 s` | **rot: kein Ergebnis, Prozess bricht nach ca. 19 s mit Heap-Überlauf ab** (vitest-Lauf 18,9 s) | grün, **623 ms**, `BESCHAEDIGT` |
| A1 | | `A1: Zeiger außerhalb der Einträge, mehrfach erreichbarer Eintrag und Selbstverweis → BESCHAEDIGT` | rot (`ok:true`) | grün |
| A1 | | `A1 Gegenprobe: gültige XLS (mit Verzeichnisbaum) wird weiter gelesen` | grün | grün |
| A2 Lotus/Quattro Pro | behoben | `A2-PoC: CFB mit /Sub/Workbook und /PerfectOffice_MAIN (WK3-Daten) → NICHT_UNTERSTUETZT` | **rot: `ok:true`, format `xls`** | grün |
| A2 | | `A2: leerer Workbook-Strom (Größe 0) unter der Wurzel zählt nicht → NICHT_UNTERSTUETZT` | rot (`ok:true`) | grün |
| A2 | | `A2: Quattro-Pro-/Lotus-Ströme (NativeContent_MAIN, MN0) ohne Workbook/Book unter der Wurzel → NICHT_UNTERSTUETZT` | grün (Absicherung) | grün |
| A2 | | `A2 Gegenprobe: normale XLS mit Workbook unter der Wurzel bleibt ok` | grün | grün |

Rot: 4 von 7 neuen Tests (die übrigen drei sichern Gegenproben und Fälle ab, die schon vorher galten).

**A1 – Umsetzung.** `pruefeCfb` liest die Verzeichniseinträge vollständig ein und prüft danach den Baum, bevor SheetJS ihn liest: Zeiger links/rechts/Kind
jedes benutzten Eintrags (Typ ≠ 0) müssen auf einen vorhandenen Eintrag zeigen oder -1 sein; eine Tiefensuche ab der Wurzel meldet jeden zweiten Besuch
(Zyklus, Selbstverweis, Mehrfachverweis) als `BESCHAEDIGT`, ebenso einen erreichbaren unbenutzten Eintrag. Unbenutzte, nicht erreichbare Einträge werden nicht
beurteilt. Messung: gleiche Datei vorher Abbruch nach ca. 19 s (Heap), nachher 623 ms. Die Prüfung ist linear in der Eintragszahl, die durch die Verzeichniskette begrenzt ist.

**A2 – Umsetzung.** `pruefeCfb` liefert nur noch Ströme des Geschwisterbaums direkt unter der Wurzel (Kind der Wurzel; Unterordner werden nicht betreten) mit
Größe > 0. `erkenne` verlangt `workbook` oder `book` darin; damit sind Lotus/Quattro Pro (`PerfectOffice_MAIN`, `NativeContent_MAIN`, `MN0`) ohne diesen Strom
`NICHT_UNTERSTUETZT`. Grenze: Eine Datei, die zusätzlich zu einem gültigen Wurzel-`Workbook` einen Quattro-Pro-Strom enthält, wird weiter als XLS gelesen
(die Auflage betrifft Dateien ohne diesen Strom).

**Vertrag.** Abschnitt 2 (Quattro Pro ausgeschlossen) und 5a präzisiert: „direkt unter der Wurzel“, „Größe > 0“, Verzeichnisbaum-Prüfung.

**Verifikation.** `npx vitest run pruefungen/import-parser.test.js pruefungen/import-parser-vendor.test.js --testTimeout=60000` zweimal: je **121 von 121** grün
(116 Parser, 5 Einbindung; vorher 114 + 7 neue), ca. 70 und 80 s. ESLint auf `server/lib/import` und den Prüfdateien: 0 Befunde. `node werkzeug/verdrahtung-pruefen.mjs`: grün (284 Prüfdateien).
