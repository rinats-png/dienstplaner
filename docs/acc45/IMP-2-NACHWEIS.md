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
| `sheetRows` | zeilen + 1 + 10.000 | bricht das Lesen sehr langer Blätter ab; `!fullref` zeigt das Abschneiden |
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
2. **ZIP-Prüfung ist kein vollständiger Ersatz für eine eigene Entpackbibliothek**: SheetJS entpackt die Einträge ein zweites Mal selbst. Dank gleicher Größen/Namen in lokalem Kopf und Verzeichnis und dem Probe-Entpacken ist ein Auseinanderlaufen praktisch ausgeschlossen, aber nicht formal bewiesen.
3. **Doppelte Entpackarbeit** bis 100 MB; bewusst für Sicherheit. Zeitlimit 20 s deckt das ab.
4. **XLS-Makros** werden nur über den Verzeichnisnamen `_VBA_PROJECT` erkannt (Zeichenfolge im Container). Ein bewusst verschleierter Container könnte den Hinweis umgehen; ausgeführt wird in keinem Fall etwas.
5. **Zeilenlimit bei xlsx/xls/ods mit mehr als 10.000 Leerzeilen am Stück** meldet `ZU_VIELE_ZEILEN` (siehe Vertrag 3).
6. **Worker-Start je Anfrage** (ca. 0,5–1 s Latenz). Für Upload-Importe vertretbar; bei Bedarf Worker-Pool in einem späteren Paket.
7. **Zeichensatz**: nur UTF-8 und Windows-1252. UTF-16-Text wird als „nicht erkennbar“ abgelehnt.
8. Lokale Testumgebung: `pruefungen/verdrahtung.test.js` („das Repo selbst besteht“) überschreitet hier sein 5-s-Zeitlimit, weil das Werkzeug in diesem Worktree ca. 14 s braucht (Git-Abfragen). Unabhängig von IMP-2, das Werkzeug selbst endet fehlerfrei.
9. `docs/acc45/work-packages.json` enthält auf `origin/integration/release-v4` noch keine Einträge `IMP-*`; Status wurde dort nicht geändert (Auftrag: keine Änderungen an Statusquellen genannt). Eintrag und Statuswechsel sind Sache des Integrators.
