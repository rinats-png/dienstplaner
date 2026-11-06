# WP-I12 — Decision Engine (Rechenkern) — Nachweis

Stand 2026-11-06, Branch `feature/wp-i12-engine`, Basis `bda8b68` (integration/release-v4). Nicht-produktiv: keine Route, kein Anbieter, keine Verdrahtung im Gateway (nur ein optionaler Haken).

## Umfang

Die Abhängigkeitsschließung (`werkzeug/engine-schliessung.mjs --datei=<Fassung bda8b68>`, Wurzeln `pruefen`, `besetzung`, `personTag`, `sollStunden`, `istStunden`, `stundenkonto`, `planKennzahlen`) umfasst **27 Definitionen / 654 Zeilen**. 26 davon liegen jetzt unverändert in `server/lib/engine/` (`kann` bleibt in `src/lib/fachlogik.js` als Verweis auf die Paketlogik des Clients):

| Datei | Inhalt |
|-------|--------|
| `plan.mjs` | `ABW`, `abwArt`, Zwischenspeicher (`cache`, `memo`, `absIdx`), `aktive`, `abwesenheitAm`, `postenBesatzung`, `personTag`, `besetzung`, `sollStunden`, `istStunden`, `nachtTageImJahr`, `stundenkonto`, `istTag`, `istDauer`, `ungeplantAm`, `nachweisStand`, `qualGueltig` |
| `befunde.mjs` | `pruefen` (Planprüfung), `fachkraftLage`, `EINSCHRAENKUNG_BEWERTUNG`, Merkmalshaken |
| `kennzahlen.mjs` | `verteilung`, `planKennzahlen` |
| `zeit.mjs`, `textformat.mjs` | `heute` (mit `mitTagesdatum`), `n1`, `zahlOder`, `fKurz` (aus `src/lib/datum.js` / `format.js`) |
| `abwesenheitsarten.mjs` | verschoben aus `src/abwesenheitsarten.js` (reine Daten, `entgeltStatus`); `src/abwesenheitsarten.js` reicht weiter |
| `rechenkern.mjs` | Schnittstelle für die Intelligence-Schicht (unten) |

`src/lib/fachlogik.js`, `datum.js`, `format.js`, `abwesenheitsarten.js` importieren und re-exportieren diese Funktionen: **eine Implementierung**, der Client ruft dieselben Namen. `src/App.jsx` ist unberührt. `src/engine/rechenkern.js` reicht nur weiter (AD-06).

## Schnittstelle (`rechenkern.mjs`)

- `rechnen(sicht, { zeitraum, heute, merkmale? })` → `{ version, zeitraum, heute, fakten[], nichtBerechenbar[], zaehler }`. Fakt: `id`, `feld` (aus dem Feldkatalog, Herkunft „berechnet“), `wert`, `person?`, `ref?`, `datum?`, `herkunft { berechnung, version, von, bis, heute }`. Berechnet werden `befund.regel` (aus `pruefen`) und `kennzahl.wert` (aus `planKennzahlen`: `plan.befunde`, `.schwer`, `.unterbesetzt`, `.ueberbesetzt`, `.dienste`, `.stunden`). Alles Übrige: `docs/acc45/wp-i12-fragen.md`.
- `faktenquelleErzeugen({ heute, merkmale })` → Funktion für `faktenpaketBilden({ faktenquelle })` (liefert nur die erlaubten Schlüssel).
- `gegenrechnen(sicht, fakten, optionen)` → `{ ok, geprueft, bestaetigt, nichtPruefbar[], abweichungen[] }`.
- `gegenrechnungErzeugen(quelle)` → Funktion für den Ausgabeprüfer: `({ ausgabe, paket }) => { ok }`.
- Prüfer (`gateway/pruefer.mjs`): optionaler Parameter `gegenrechnung`; ohne ihn ändert sich nichts. Mit ihm: nach allen übrigen Prüfungen, `{ ok: true }` ist die einzige Freigabe; Rückgabe anders, Ausnahme, Nicht-Funktion = Code **P-10**, ganze Antwort verworfen. Der Haken bekommt eine eingefrorene Momentaufnahme. `gateway.mjs` reicht `gegenrechnung` aus den Optionen an beide `ausgabePruefen`-Aufrufe durch (Voreinstellung: keiner).

## Invarianten und Belege (`pruefungen/engine-rechenkern.test.js`, 28 Tests)

| Nr | Invariante | Beleg |
|----|-----------|-------|
| E1 | Verhaltensgleiche Extraktion | Golden `pruefungen/fixtures/engine-golden.json`, erzeugt mit der Fassung **vor** der Extraktion (`bda8b68`), feste Uhr und festes Zufallsmuster: leerer Betrieb (`leerbetrieb.mjs`) und drei Demobetriebe (86 Personen u. a.) — `pruefen` (Anzahl, Arten, Prüfsumme), `besetzung`, `personTag`, `sollStunden`, `istStunden`, `stundenkonto`, `nachtTageImJahr`, `fachkraftLage`, `verteilung`, `planKennzahlen` bit-gleich |
| E2 | Eine Implementierung | Test: `F[name] === Plan/Befunde[name]`; fachlogik definiert diese Funktionen nicht mehr (Quelltextprüfung) |
| E3 | Quelltextprüfungen bleiben wirksam | `pruefungen/app-quelle.js` liest zusätzlich `server/lib/engine/*.mjs` (nur erweitert, nichts entfernt); die Prüfungen, die `src/abwesenheitsarten.js` im Quelltext lesen, lesen jetzt die verschobene Datei (gleiche Aussagen) |
| E4 | Determinismus | gleiche Eingabe (auch Kopie, neues Optionsobjekt) = gleiche Ausgabe (SHA-256); Tagesdatum nur aus der Eingabe (Uhr verstellt = gleiches Ergebnis) |
| E5 | Keine Mutation | tief eingefrorene Sicht wird gerechnet (Strict Mode wirft bei Schreibversuch), Prüfsumme davor/danach gleich; Zwischenspeicher nur in WeakMap an einer Arbeitsansicht (`Object.create(sicht)`), nicht an der Sicht |
| E6 | Rollensicht | Kanarienfelder an jeder Person/Betrieb werden nie gelesen (Proxy-Protokoll) und stehen in keinem Fakt; kein Kontakt-/Konto-/Zugangs-/Freitextfeld wird gelesen; für Leitung, Planung, Beschäftigte auf der Sicht von `bestandFuerRolle`: Rechnung ohne Absturz, Personen nur aus der Sicht, keine Geburtsdaten/IBAN/Adressen in den Fakten |
| E7 | Anschluss an das Faktenpaket | `faktenpaketBilden({ faktenquelle })` mit dem Rechenkern: nur Felder der Positivliste, keine Klarnamen; Quelle liefert nur die erlaubten Schlüssel |
| E8 | Gegenrechnung | eigene Fakten bestätigt; falsche Zahl, falsche Befundart, fremde Person = Abweichung; unbekannte Felder „nicht prüfbar“; Ausnahme = `ok:false` |
| E9 | Gateway bleibt inert | ohne Haken (fehlt/undefined/null) identische Entscheidung; mit Haken P-10 in allen Fehlfällen; abgelehnte Antworten rufen ihn nicht auf; Test, dass weder `intelligence/` noch `gateway/` etwas aus `engine/` importieren |
| E10 | Reiner Kern | Quelltextprüfung: kein Import aus `intelligence/` oder `src/`, kein React/DOM/`node:fs`/Netz/`process.env`/`Math.random`; alle Importquellen liegen in `server/lib/` (Docker-Bild ohne `src/`) und laden |
| E11 | Leistung | Demobetrieb (86 Personen, ein Monat) < 30 s (Richtwert gegen Ausreißer; gemessen etwa 3–5 s unter Last) |

## Grenzen und bekannte Befunde

- Fachkraftquote (`fachkraftLage`) hängt an der Paketlogik des Clients; auf dem Server gilt ohne Angabe `merkmale` kein Merkmal als nutzbar (Frage 1).
- `planKennzahlen` liefert `spanne`/`wochenenden` nicht als Zahl (bestehender Mangel, Frage 4); sie sind kein Rechenkern-Fakt.
- Der Prüfer verdrahtet keine Gegenrechnung von selbst; die Verdrahtung (Sicht und Alias-Auflösung) ist Sache von WP-I13/I15 (Frage 8).
- Neue Rechenwege (Near-Miss, Lösungswege) sind nicht Teil dieses Teilschritts (Frage 7).
- Testlauf (Windows-Rechner, 81 betroffene Dateien: alle, die `app-quelle.js`, fachlogik, App.jsx oder abwesenheitsarten lesen, dazu `intelligence-*`, `regel*`, `fachpruefung*`, `konsistenz*`, `oberflaeche-render*`, die neue Datei): 3034 grün; Rest-Fehlschläge ohne Bezug zur Änderung: `wiederherstellen-ui` (3, erwartet den Text „Lädt“, die Oberfläche zeigt „werden geladen …“) und `selbsttest` („Erster Aufbau unter 500 ms“) — beide **identisch auf dem Stand ohne Änderung** (mit `git stash` geprüft); Server-Tests mit Start in `beforeAll` (`geo`, `mail-push-handler`, `zustellung-rechte`, `dsgvo-server`, `mandanten-session`) schlagen unter Last an den 5-/10-s-Grenzen an und bestehen mit `--hookTimeout=180000 --testTimeout=120000` (123 grün).
- Gefunden und behoben: `stempel-oberflaeche` schneidet den Quelltext „von `function istStunden(` bis `§ 3 ArbZG`“; `app-quelle.js` setzt den Rechenkern deshalb vor `fachlogik.js` (Reihenfolge wie vorher).
- `npx vite build` grün; `npx eslint` auf allen berührten Dateien ohne Fehler (nur vorhandene Warnungen in `fachlogik.js`).
