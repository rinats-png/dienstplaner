# Tiefendeckel an allen Rumpflesern (WP-19.5, Nachtrag zu Review #505 A1)

Stand 2026-11-23. Branch `acc45/haertung/tiefendeckel-import`, Basis `integration/release-v4` 09688acc.

## Befund

PR #505 hat den Tiefendeckel (`zuTief`, `server/lib/rumpftiefe.mjs`) nur in `rumpfLesen` von `server/funktionen/daten.mjs` eingebaut. Die übrigen Funktionen lesen ihren Rumpf selbst. Nach `JSON.parse` laufen dort rekursive Funktionen über unbekannte Struktur: `JSON.stringify` (z. B. `eingabeHash` in `server/lib/import/schichtvorschau.mjs`), und `String(wert)`. `String()` einer verschachtelten Liste ruft `Array.prototype.join` rekursiv auf und wirft ab einigen tausend Ebenen `RangeError` (lokal geprüft: `String(JSON.parse("[".repeat(5000) + "]".repeat(5000)))`).

## Bestandsaufnahme

Grundlage: `grep -rn "JSON.parse\|req.json()\|.text()" server/`. Anfragerümpfe lesen nur die Funktionen in `server/funktionen/`. `server.mjs` reicht den Rumpf ungeparst weiter. Die übrigen `JSON.parse`-Stellen in `server/lib/` lesen eigene Dateien der Ablage (ablage, gesund, prozesssperre, schluesselepoche, schreibhalt, widerrufbuch, widerrufbuchsicherung, kontowiderrufbuch), Antworten fremder Dienste (`post.mjs`: Fehlerrumpf des Mailanbieters, nur Felder gelesen; `intelligence/gateway/pruefer.mjs`: Modellantwort) oder den eigenen Parser-Prozess (`import/parser-prozess.mjs`, `parser-worker.mjs`). Sie sind keine Anfragerümpfe und nicht Teil dieses Nachtrags.

Messung: Skript gegen lokalen `server.mjs` (Port 4700 bis 4900, nur 127.0.0.1, Wegwerfablage im Scratchpad, kein Netz). Schalter für die Messung an: `CENTRIC_IMPORT_AKTIV`, `CENTRIC_SELBSTSTART`, `CENTRIC_PUBLIC_REGISTRATION`, `CENTRIC_HILFE_ASSISTENT=suche` (Vorgabe jeweils aus). Rumpf: verschachtelte Listen (2 Byte je Ebene) in dem Feld, das der Weg liest. Sitzungen: Leitung bzw. Mitarbeiter über `sitzungAnlegen`. Importvorgang: Schichtmodell-Datei hochgeladen, Analyse vorab erfolgreich. Nach jeder Anfrage: `/gesund` antwortet (Prozess lebt) in allen Fällen, vorher wie nachher.

| Leser (Datei:Zeile nach der Änderung) | Weg und Feld | vorher 5000 / 100000 Ebenen | nachher 5000 / 100000 Ebenen |
|---|---|---|---|
| `daten.mjs:195` rumpfLesen (Kontrolle, #505) | POST /api/stempeln, Zusatzfeld | 400 / 400 | 400 / 400 |
| `import.mjs:77` jsonLesen | POST /api/import/analyse, `zuordnung` | **500** INTERNER_FEHLER / **500** (RangeError in JSON.stringify, `eingabeHash`) | 400 / 400 |
| `import.mjs:77` jsonLesen | POST /api/import/vorschau, `zuordnung` | 200 / 200 (die Vorschau liest die Zuordnung des Vorgangs aus der Analyse, nicht die des Rumpfs; die Analyse mit tiefer Zuordnung endete vorher mit 500, bevor sie am Vorgang gespeichert wurde) | 400 / 400 |
| `import.mjs:77` jsonLesen | POST /api/import/uebernahme, Zusatzfeld | 422 / 422 | 400 / 400 |
| `kalender.mjs:192` rumpfLesen | POST /kalender/daten, `termine[0]` | 404 / 404 | 400 / 400 |
| `kalender.mjs:192` rumpfLesen | POST /kalender/einrichten, `alt` | 403 / 403 | 400 / 400 |
| `einladung.mjs:59` rumpfLesen (Grenze 4 KB) | POST /api/einladung/annehmen, `einladung` | 413 / 413; bei 2040 Ebenen 400 (Fachprüfung) | 413 / 413; bei 2040 Ebenen 400 Tiefe |
| `einladung.mjs:59` rumpfLesen (Grenze 4 KB) | POST /api/einladung, `personId` | 413 / 413 | 413 / 413 |
| `anmeldung.mjs:168` rumpfLesen (Grenze 16 KB) | POST /api/account/anmelden, `email` (ohne Anmeldung) | **500** / 413 (RangeError in `String(email)`, `mailNormieren`) | 400 / 413 |
| `anmeldung.mjs:168` rumpfLesen | POST /api/account/betrieb, `raum` | 400 (Fachprüfung) / 413 | 400 / 413 |
| `registrierung.mjs:120` rumpfLesen (Grenze 16 KB) | POST /api/registrierung, `vorname` | 400 (Fachprüfung) / 413 | 400 / 413 |
| `registrierung.mjs:120` rumpfLesen | POST /api/registrierung/verifizieren, `token` | 400 / 413 | 400 / 413 |
| `registrierung.mjs:120` rumpfLesen | POST /api/registrierung/passwort, `fortsetzung` | 400 / 413 | 400 / 413 |
| `zustellung.mjs:158` req.json | POST /zustellung/anmelden, `anmeldung` | 400 (Fachprüfung) / 400 | 400 / 400 |
| `zustellung.mjs:152` req.json | POST /zustellung/abmelden, `endpoint` | 200 / 200 | 400 / 400 |
| `zustellung.mjs:100` req.json | POST /zustellung/senden, `nachrichten` | 400 (Fachprüfung) / 400 | 400 / 400 |
| `zustellung.mjs:222` req.json | POST /zustellung/mailbestaetigung/bestaetigen, `code` | 404 (Schalter aus) / 404 | 404 / 404; mit Schalter `angebot`: 400 (Test) |
| `hilfe.mjs:66` req.json (Grenze 4 KB) | POST /api/hilfe/frage, `frage` | 413 / 413; bei 2040 Ebenen 400 FRAGE_FORM | 413 / 413; bei 2040 Ebenen 400 Tiefe |
| `einrichten.mjs:63` req.json (Verwalterschlüssel im Rumpf) | POST /einrichten, `hinweis` | 400 (Fachprüfung) / 400 | 400 / 400 |
| `starten.mjs:89` req.json | POST /starten, `name` (Schalter Vorgabe aus) | **500** / **500** (RangeError in `String(name)`) | 400 / 400 |

„Fachprüfung“: Der Weg wies das Feld vorher aus einem anderen Grund ab (falscher Typ). Das war kein Fehler, aber Zufall: Ein anderes Feld oder eine andere Reihenfolge hätte die rekursive Funktion erreicht. Jetzt gilt an jedem Leser dieselbe Prüfung vor jeder Verwendung.

Ergebnis: drei Wege lieferten 500 statt 400: `/api/import/analyse` (nur Leitung/Planung mit Sitzung, Schalter Vorgabe aus), `/api/account/anmelden` (ohne Anmeldung erreichbar, 16 KB reichen für 5000 Ebenen) und `/starten` (Schalter Vorgabe aus). Kein Weg brachte den Prozess zum Absturz.

## Lösung

Eine gemeinsame Prüfung und ein gemeinsamer Antwortrumpf in `server/lib/rumpftiefe.mjs`: `zuTief(wert)` und `zuTiefRumpf()` = `{ fehler: "Der Rumpf ist zu tief verschachtelt.", text: "Höchstens 64 Ebenen sind vorgesehen." }`, Status 400. Ein einziger gemeinsamer Leser für alle wäre größer: Die Leser haben verschiedene Größengrenzen (4 KB bis 6 MB), verschiedene Fehlerformen (`{ok:false, fehler:"kaputtes-json"}`, `{fehler, code}`) und lesen an verschiedenen Stellen (vor oder nach Sitzung, Bremse, Schalter). Darum prüft jeder Leser direkt nach `JSON.parse` bzw. `req.json()` selbst, mit derselben Funktion und demselben Rumpf. Import ergänzt wie alle seine Fehler `code: "RUMPF_ZU_TIEF"`.

Reihenfolge unverändert: Jeder Leser prüft an der Stelle, an der er schon bisher las. Keine Berechtigungslogik geändert. Wo ein Leser vor der Sitzungsprüfung liest (anmeldung, registrierung, einladung/annehmen, einrichten vor dem Schlüsselvergleich, starten), kommt die 400 vor 401 bzw. 403, wie bei kaputtem JSON und wie in #505.

## Grenze 64 je Leser

Messung mit aktiver Prüfung: `zuTief` hat für die Dauer eines Laufs jede Tiefe protokolliert (nur lokal, nicht eingecheckt). Lauf: 56 Handler-Suiten, die eine der berührten Funktionen laden (import*, kalender*, einladung*, anmeldung*, registrierung*, zustellung*, hilfe*, einrichten*, starten* und weitere, siehe unten).

2995 geprüfte Rümpfe, 1634 von 1639 Tests grün (die 5 roten: siehe „Lokale Läufe“). Höchste gemessene Tiefe des ganzen Rumpfs je Leser:

| Leser | Rümpfe | höchste Tiefe |
|---|---|---|
| import.mjs | 348 | 2 |
| kalender.mjs | 125 | 3 |
| einladung.mjs | 151 | 2 |
| anmeldung.mjs | 635 | 2 |
| registrierung.mjs | 181 | 2 |
| zustellung.mjs | 120 | 3 |
| hilfe.mjs | 215 | 1 |
| einrichten.mjs | 173 | 3 |
| starten.mjs | 69 | 2 |
| daten.mjs (Nebenwirkung derselben Suiten; #505 maß 10) | 978 | 9 |

Die Angriffsrümpfe der neuen Prüfung liefen in diesem Lauf nicht mit (Datei ausgeschlossen).

64 reicht überall. Kein Leser braucht eine eigene Grenze. Der tiefste legitime Rumpf ist der Import (Spaltenzuordnung `{ zuordnung: { feld: spalte } }`, Entscheidungen `{ entscheidungen: { zeile: wert } }`). Ein Rumpf dieser Wege ist flach gebaut. Die Datei selbst kommt nicht als JSON, sondern als `application/octet-stream` (Upload) und wird vom Parser gelesen.

## H1 (Review #505): Rechenzeit bei sehr breiten Rümpfen

`zuTief` nutzt jetzt zwei parallele Stapel statt Paar-Listen und `for…in` statt `Object.values` (keine Zwischenlisten je Knoten). Für Werte aus `JSON.parse` ist das Ergebnis identisch (nur eigene, aufzählbare Zeichenketten-Schlüssel; auch ein eigener Schlüssel `__proto__`). Beleg: Vergleich mit der Fassung aus #505 auf 3000 zufälligen JSON-Werten je Grenze 1, 2, 3, 4, 6, 8, 12, 64 (`pruefungen/modul-tiefendeckel-leser.test.js`); alle Tests aus `pruefungen/modul-tiefendeckel.test.js` grün.

| Rumpf (lokal, Median aus 5) | vorher zuTief | nachher zuTief | JSON.parse |
|---|---|---|---|
| 1,9 Mio. leere Listen (5,7 MB) | 253 bis 277 ms | 141 bis 155 ms | etwa 550 ms |
| 400 000 kleine Objekte | 320 bis 361 ms | 78 bis 79 ms | 285 bis 368 ms |

`rumpfTiefe` (nur Messung und Tests) bleibt unverändert.

## Prüfungen

- `pruefungen/modul-tiefendeckel-leser.test.js` (Gruppe `pruefung:branchenmodule` über das Präfix `pruefungen/modul-`, wie `modul-tiefendeckel.test.js`): je Leser ein tiefer Angriff (5000 Ebenen; bei 4 KB Grenze 2000) → 400 mit einheitlichem Rumpf; Grenze 64 (keine Tiefenabweisung, kein 500) und 65 (400) je Leser; realistische Rümpfe wie bisher; H1-Gleichheit.
- Vor der Änderung rot: 34 von 34 Angriffs- und Grenzfällen (drei davon 500), realistische Fälle grün.
- Mutationen (Lauf mit `modul-tiefendeckel-leser.test.js` und `modul-tiefendeckel.test.js`, 49 Tests): 15 von 15 erkannt. Prüfung entfernt in import, kalender, einladung, anmeldung, registrierung, zustellung senden/mailbestätigung (je 4 rot), zustellung abmelden, zustellung anmelden, hilfe, einrichten, starten (je 2 rot), daten (#505, 5 rot); `zuTief` Grenze um eins verschoben (20 rot); Objektzweig ausgelassen (41 rot); Listenzweig ausgelassen (39 rot).

## Lokale Läufe

- Die 56 Handler-Suiten (mit aktiver Prüfung): 1634 von 1639 grün. Die 5 roten Tests sind nicht durch diese Änderung verursacht: `registrierung-http` (Importliste des Handlers) und `import-abweichungen-imp11` (Fehlerschlüssel in IMPORT-VERTRAG §9a) sind angepasst, danach grün; `sicherheit-intern` DEP-1 liest `node_modules/web-push` (lokal über die Verknüpfung 3.6.7, Lockdatei 4.0.0, Umgebungsartefakt); `einladungen` „zwei Node-Prozesse …“ und `sicherung-ablage` „… nie als Erfolg ohne Gegenprobe“ sind auf der Basis 09688acc lokal ebenso rot (gleicher Lauf mit den alten Dateien unter `server/`). Maßgeblich ist die CI.
