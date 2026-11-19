# WP-I12a — Decision Engine Rest: Einsatzprüfung, Ersatzsuche, Near-Miss (Frage 7)

Basis: integration/release-v4 (38fc7d0). Nicht-produktiv: keine Route, kein Anbieter, keine KI-Anbindung (E-25). Verhalten der Oberfläche gleich; neu ist nur, was der Rechenkern zusätzlich als Fakt liefert.

## Messung der Schließung (Schritt 1)

`node werkzeug/engine-schliessung.mjs hindernisBefunde ersatzVorschlaege`: **9 Definitionen / 173 Zeilen** (Plan: höchstens 15 Funktionen je Teil): `nachtJahr`, `einschr`, `SCHUTZ_QUELLE_EINSCHRAENKUNG`, `wochenStundenGeplant`, `hindernisBefunde`, `ersatzVorschlaege`, `FENSTER`, `fensterVon`, `verfuegbarFuer` (dazu `SCHUTZ_QUELLE_NEUTRAL`, dieselbe Stelle). Alles Übrige (`einteilungsBefunde`, `schutzEinsatz`, `sperrtBefund`, Ist-Rechnung) liegt schon in `server/lib/`.

## Umfang

| Datei | Inhalt |
|-------|--------|
| `server/lib/engine/einsatz.mjs` (neu) | die 9 Definitionen, Text unverändert aus `src/lib/fachlogik.js`; `stufeRang` (Rang der Warnstufen); Haken `regelIdHakenSetzen` für die Regelkennung des Regelregisters |
| `server/lib/engine/ersatzfakten.mjs` (neu) | `ersatzKandidaten` (direkte Treffer und Near-Miss), `ruheZuNachbarn` |
| `server/lib/engine/rechenkern.mjs` | Option `ausfaelle`, Fakten `kandidat.zulaessig`, `kandidat.hinderung`, `kandidat.spielraum`, `ruhezeit.ist`; `BERECHNETE_FELDER` erweitert (Gegenrechnung prüft sie) |
| `server/lib/engine/textformat.mjs`, `src/lib/datum.js` | `DOW` (Wochentagskürzel) wohnt im Kern, `datum.js` reicht weiter |
| `src/lib/fachlogik.js` | die Definitionen entfallen, Weiterleitung aus `einsatz.mjs`; hängt `regelIdFuerBefund` (Register, nur im Client) als Haken ein |
| `server/lib/intelligence/faktenpaket.mjs` | `kandidat.*` und `ruhezeit.ist` zählen zu den Feldern mit Dienst-Bezug (`REF_IST_DIENST`): der Bezug geht nur als Alias ins Paket (Review F5), nie als Rohkennung. Nur Verschärfung. |
| `pruefungen/app-quelle.js` | liest zusätzlich `einsatz.mjs` (an der Stelle der Fachlogik); nichts entfernt |

Offen bleibt: Frage 6 (Regelkennung des Registers auf dem Server: `befund.regel` bleibt die Befundart, `regelId` am Befund ist auf dem Server `null`), `aenderung.art` (braucht einen Vergleichsstand des Plans, WP-I24) und `regel.art` (Regelart des Baukastens).

## Near-Miss — Definition

Ein Kandidat der Ersatzsuche ist **Near-Miss**, wenn alle Befunde ab „Achtung“ Ruhezeitbefunde sind (`ruhezeitGesetz`, `ruhezeitBetrieb`) und der Fehlbetrag in Minuten bezifferbar ist. Spielraum = Grenze (Einstellung `ruhezeit`, sonst 11 h) − kürzeste Ruhezeit zu den Diensten zwei Tage davor und danach, gleiche Formel wie `einteilungsBefunde`. Beispiel: Spätdienst am Vortag bis 23:30, Frühdienst 06:00 = 390 min Ruhe, Spielraum 270 min. Alles, was nicht auf Minuten führt (Qualifikation, Schutz, Abwesenheit, Teilzeit …), ist kein Near-Miss. Je Liste höchstens 10 Kandidaten; Reihenfolge: kleinster Spielraum, dann Eignung, dann Kennung. `ausfaelle`: höchstens 5, Datum im Zeitraum.

## Tests

`pruefungen/engine-einsatz.test.js` (17 Tests, neu; vorher rot, da Module fehlten), Golden `pruefungen/fixtures/engine-einsatz-golden.json` mit der Fassung **vor** der Extraktion erzeugt (`hindernisBefunde`, `ersatzVorschlaege`, `nachtJahr`, `verfuegbarFuer`; leerer Betrieb und drei Demobetriebe):

- E1/E2 bit-gleich zur alten Fassung; fachlogik definiert die Funktionen nicht mehr, gleiche Objekte.
- E3 Server ohne Haken: gleiche Befunde, Regelkennung `null`; Haken wirkt. E4 Rangtabelle gleich `src/warnstufen.js`.
- E5 Spielraum gegen unabhängige Rechnung, Abgrenzung, Reihenfolge, Grenze aus der Einstellung, Rufbereitschaft, unbekannte Dienstart, eingefrorene Eingabe.
- E6 Fakten mit person/ref/datum; `ruhezeit.ist` gleich der Zahl im Befundtext; Determinismus; Eingabeprüfung der Ausfälle.
- E7 Faktenpaket F3 mit Alias für Person und Dienst, keine Klarnamen, F11 erhält keine Kandidatenfakten; Gegenrechnung bestätigt, erkennt falsche Zahl.

## Grenzen

- Die Rechnung für 86 Personen und 5 Ausfälle ist nicht optimiert (Ersatzsuche rechnet je Person die Einsatzprüfung); gemessen im Test unter 1 s je Ausfall.
- Ein Faktenpaket hat höchstens 500 Fakten (`FAKTEN_MAX`); F3 mit allen 86 Personen der Sicht überschreitet das auch ohne Kandidaten. Verkleinerung des Umfangs gehört zu WP-I20 (Router/Umfang), nicht hierher.
- `stufeRang("constructor")` ist 1 (Hinweis); die Oberfläche las dort `undefined`. Echte Stufen sind unverändert.
