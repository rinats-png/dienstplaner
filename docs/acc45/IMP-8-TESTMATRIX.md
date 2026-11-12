# IMP-8 — Synthetische Testdateien und Testmatrix (20 Fälle)

Stand: 2026-11-12. Paket: `work-packages.json` IMP-8 („Synthetische Testdateien und Testmatrix (20 Fälle, je Unit/HTTP/E2E)“), Akzeptanz: „Alle Fälle aus der Anforderungsliste durch Tests belegt; keine echten Personendaten“. Abhängigkeit IMP-2 (integriert).
Test: `pruefungen/imp8-testmatrix.test.js` (`npm run pruefung:imp8-testmatrix`, Teil der Kette `pruefung` und des Workflows `pruefung.yml`). Fixtures: `pruefungen/import-fixtures/`.

## 1. Herleitung der 20 Fälle (Annahme, bitte prüfen)

Die im Paket genannte Quelle `docs/acc45/IMPORT-PLAN.md` ist im Repository **nicht vorhanden** (nur Verweise darauf in `DEPENDENCIES.md`, `GESAMTPLAN.md`, `IMP-6-NACHWEIS.md`); eine ausdrückliche „Anforderungsliste“ mit 20 Einträgen gibt es nicht. Die 20 Fälle sind deshalb aus dem Paketauftrag und dem, was der Bestand verbindlich festlegt, **rekonstruiert**:

- Vertrag des Parsers: `docs/acc45/IMPORT-VERTRAG.md` (Formate §2, Grenzen §3, Zip-/CFB-Prüfung §5/§5a, Zellwerte und Datum §6, Hinweise §8, Codes §9, nicht unterstützte Formate §11).
- Dubletten-, Datums- und Pflichtspaltenregeln: Kopf von `server/lib/import/personen.mjs` und `docs/acc45/IMP-1-NACHWEIS.md`.
- Gefahrenklassen aus dem Auftrag: Formel-Injektion (= + - @), Übergröße, Zeilen-/Spaltengrenzen, falsche Kodierung/BOM, doppelte Personalnummern, leere Datei, Binärdatei, ZIP-Bombe, Dateinamen-Tricks, CSV gegen XLSX, unbekannte Spalten, Datumsformen.

Annahmen: (A1) Die Zahl 20 ist erreicht, indem zusammengehörige Prüfungen einem Fall zugeordnet sind (z. B. F15 = Zeilen-, Spalten- und Zellgrenze); jeder Fall hat eine Unit- und, wo der Endpunkt es tragen kann, eine HTTP-Prüfung. (A2) „HTTP“ = der echte Handler `server/funktionen/import.mjs` im Wegwerfverzeichnis, wie in `import-endpunkt.test.js`; der Schalter der Oberfläche (`IMPORT_DATEI_AKTIV`, bleibt aus) wird nicht berührt, der Handler selbst kennt keinen Schalter. (A3) Erwartete Ergebnisse stammen ausschließlich aus Vertrag, Modulkopf und den vorhandenen Tests, nicht aus der Beobachtung neuen Verhaltens. (A4) Kein Fall verlangt neues Produktverhalten.

## 2. Matrix

Status: **belegt** = Test grün; **offen** = Fähigkeit nicht verfügbar (Grund genannt). Spalte E2E ist für alle Fälle **offen**: Die Import-Oberfläche ist per `IMPORT_DATEI_AKTIV` ausgeschaltet und steht nicht im Browserlauf; ein Browser-E2E würde Verdrahtung oder Aktivierung verlangen (ausdrücklich ausgeschlossen). Die Brücke Oberfläche-Schicht → Handler ist unabhängig davon in `import-personal-e2e.test.js` belegt.

| Fall | Zweck | Fixture | Erwartetes Ergebnis (Quelle) | Test | Unit | HTTP | E2E |
|---|---|---|---|---|---|---|---|
| F01 | Normalfall CSV (UTF-8, `;`, Kommazahl, zwei Datumsformen, leere Zellen) | `f01-gueltig.csv` | 5 Personen, alle „neu“, keine Fehler; Eintritt ISO bzw. `null` (nie heute), E-Mail leer bleibt leer (Vertrag §2/§6, IMP-1) | F01 [Unit], F01 [HTTP] | belegt | belegt | offen |
| F02 | UTF-8-BOM | `erzeuge.mjs csvMitBom` (f01 + BOM) | BOM entfernt, erste Überschrift „Personalnummer“ zugeordnet (§2) | F02 | belegt | – | offen |
| F03 | Falsche Kodierung (Windows-1252) | `csv1252` | Umlaut erhalten, Hinweis `ZEICHENSATZ_ERSATZ` (§2) | F03 | belegt | – | offen |
| F04 | TSV | `f04-tabs.tsv` | Format `tsv`, 2 Personen (§2) | F04 | belegt | – | offen |
| F05 | XLSX (Datumszelle, Zahlen) | `xlsxGueltig` | Datum als `{typ:"datum"}`, ISO-Eintritt, Zahl 38,5 (§6) | F05 [Unit], F05 [HTTP] | belegt | belegt | offen |
| F06 | XLS (BIFF) | `xlsGueltig` | gleiche Werte wie F05 als XLSX (§2, §5a) | F06 | belegt | – | offen |
| F07 | Datumsformen | `f07-datumsformate.csv` | ISO und TT.MM.JJJJ gültig; 31.02., 2024-02-30, Monat 13, Text, US-Form: „Eintrittsdatum ungültig“, nur „überspringen“, Meldung ohne Wert; leer = `null` (IMP-1, `datumAusZelle`) | F07 | belegt | – | offen |
| F08 | Datumssystem 1904 | `xlsx1904` | Parser normiert auf 1900, `datumssystemQuelle: "1904"`, Hinweis `DATUMSSYSTEM_1904`, gleiche Kalendertage wie 1900-Mappe, keine Doppelverschiebung (§6) | F08 | belegt | – | offen |
| F09 | Formel-Injektion `=` `+` `-` `@` | `f09-formelzellen.csv`, `xlsxFormelzellen` | Text bleibt unverändert Text, nichts wird ausgewertet; echte Formelzelle liefert nur den gespeicherten Wert (§6); Ausgabeseite neutralisiert über `csvText` (SI-02) | F09 ×3 | belegt | belegt | offen |
| F10 | Doppelte Personalnummer in der Datei (auch Groß-/Kleinschreibung) | `f10-doppelte-personalnummer.csv` | alle beteiligten Zeilen „klären“, nur überspringen/klären, Art `personalnummer-datei` (personen.mjs) | F10 [Unit], F10 [HTTP] | belegt | belegt | offen |
| F11 | Treffer gegen den Bestand | `f11-gegen-bestand.csv`, `f11b-aehnliche-nummer.csv` | exakte Nummer: klären, nie „neu“; ähnliche Nummer (Trennzeichen, führende Nullen, Schreibweise): klären; nur Name: Vorschlag, klären; neue Nummer: neu (IMP-1, IMP-3) | F11 ×2 | belegt | – (Bestandsfälle liegen in `import-endpunkt.test.js`) | offen |
| F12 | Leere Datei, nur Leerraum, nur Kopfzeile | `leer`, `nurLeerraum`, `nurKopf` | leer/Leerraum: Fehler ohne Teilergebnis, HTTP 422 `LEER`; nur Kopfzeile: lesbar, 0 Datensätze (§7, §9) | F12 [Unit], F12 [HTTP] | belegt | belegt | offen |
| F13 | Binär-/Nicht-Textdateien (PNG, EXE, Zufallsbytes, UTF-16-Text) | `png`, `exe`, `zufall`, `csvUtf16` | `UNBEKANNTES_FORMAT` (Erkennung nach Inhalt, nicht Endung; NUL-Bytes sind kein CSV, §2); HTTP 422 ohne Stacktrace | F13 [Unit], F13 [HTTP] | belegt | belegt | offen |
| F14 | Übergröße | 10 MB + 1 Byte (zur Laufzeit) | `DATEI_ZU_GROSS`; HTTP 413; kein Vorgang (§3) | F14 [Unit], F14 [HTTP] | belegt | belegt | offen |
| F15 | Zeilen-, Spalten- und Zellgrenzen | `csvZeilen`, `csvSpalten`, `csvZelle` | 20.000 Zeilen ok / 20.001 `ZU_VIELE_ZEILEN`; 200 Spalten ok / 201 `ZU_VIELE_SPALTEN`; Zelle 32.767 ok / 32.768 `TEXT_ZU_GROSS`; HTTP 422 (§3) | F15 [Unit], F15 [HTTP] | belegt | belegt | offen |
| F16 | ZIP-Bombe | `bombe*` | erklärt über 100 MB: `ENTPACKT_ZU_GROSS`; 50 MB bei hohem Verhältnis: `KOMPRESSION_VERDAECHTIG`; lügender Kopf: abgelehnt; zu viele Einträge: abgelehnt; schnell, kein Teilergebnis; Server antwortet danach weiter (§3, §5) | F16 [Unit], F16 [HTTP] | belegt | belegt | offen |
| F17 | Dateinamen-/Pfadtricks (`../`, `..\`, NUL, RTL-Zeichen, 5000 Zeichen, `CON`, Shell-/HTML-Zeichen) | Namen im Test, Inhalt `f01-gueltig.csv` | Name steuert nie die Erkennung (§1/§2); gleiches Ergebnis bei jedem Namen; Endung im Hinweis höchstens 10 Zeichen; HTTP 201, Name nicht im Ergebnis, keine Datei dieses Namens im Datenverzeichnis | F17 [Unit], F17 [HTTP] | belegt | belegt | offen |
| F18 | Unbekannte Spalten | `f18-unbekannte-spalten.csv` | nicht zugeordnet, nicht gelesen, kein Fehler, Werte tauchen in keinem Datensatz auf (FELDER als Weißliste) | F18 | belegt | – | offen |
| F19 | Pflichtspalte fehlt | `f19-pflichtspalte-fehlt.csv` | `fehlendePflicht: ["einheit"]`, keine Datensätze; Vorschau 422 `PFLICHTSPALTE_FEHLT` | F19 [Unit], F19 [HTTP] | belegt | belegt | offen |
| F20 | Nicht unterstützte Formate | `xlsm`, `ods`, `xlsb`, `verschluesselt` | `NICHT_UNTERSTUETZT` (auch mit Endung .xlsx), Meldung „bitte als XLSX oder CSV speichern“ bei ODS; verschlüsselt: `PASSWORTGESCHUETZT`; kein Teilergebnis (§11, §5a) | F20 [Unit], F20 [HTTP] | belegt | belegt | offen |

Zählung: 20 Fälle; 20 auf Unit-Ebene belegt; 12 davon zusätzlich auf HTTP-Ebene belegt (F01, F05, F09, F10, F12, F13, F14, F15, F16, F17, F19, F20); E2E-Ebene bei allen 20 offen (Grund siehe oben). **Befunde: 0.**

## 3. Beobachtungen (kein Befund)

- B-1 (Formel-Injektion): Der Import speichert Text mit führendem `=`, `+`, `-`, `@` unverändert (z. B. Nachname „=1+1“). Das entspricht dem Vertrag (der Parser interpretiert nichts, Formeln werden nicht ausgewertet) und der bestehenden Schutzstelle auf der Ausgabeseite (`csvText`, SI-02); F09 belegt beides. Andere Ausgabewege (Druck, Kalenderexport) sind nicht Gegenstand dieses Pakets.
- B-2 (Dateiname im Hinweis): Bei abweichender Endung erscheinen bis zu 10 Zeichen der Endung im Hinweis (Vertrag §2), also beliebige Zeichen aus dem Namen (z. B. `.csv;rm -rf`). Es sind nur Anzeigetexte; die Oberfläche muss sie als Text rendern (React tut das). Kein Verstoß gegen den Vertrag.
- B-3 (Binärdatei-Erwartung): Der bestehende Parsertest lässt für PDF/PNG/EXE sowohl `UNBEKANNTES_FORMAT` als auch `NICHT_UNTERSTUETZT` zu; F13 fixiert für die hier benutzten Dateien `UNBEKANNTES_FORMAT`, wie §2 („Alles Unbekannte“).

## 4. Fixtures und Datenschutz

Alle Personen heißen „Testperson NN“ (Vorname „Fiktiv“), Personalnummern `TP-nnnn`, E-Mail-Adressen nur `@example.invalid`, Einheit „Wohnbereich 1“, Konfession/Ort „Testkonfession“/„Testort“. Statische Textdateien liegen unter `pruefungen/import-fixtures/*.csv|tsv`; alle Binärdateien (XLSX, XLS, ZIP-Bomben, OLE) entstehen zur Laufzeit in `pruefungen/import-fixtures/erzeuge.mjs`, damit keine Binärdateien im Repository liegen. Keine echten Personendaten, kein Netz, kein Schreiben außerhalb des Wegwerfverzeichnisses.

## 5. Nicht geändert

Kein Produktionscode, `IMPORT_DATEI_AKTIV` bleibt aus, IMP-6-Verdrahtung und E-25/E-26 unberührt. Bestehende Importtests unverändert grün (`import-parser`, `import-bestand-imp1`, `import-endpunkt`).
