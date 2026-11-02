# WP-43 — Personaldaten-Filter vollständig: Nachweis

Branch `acc45/security/wp43-personaldaten-filter`, Basis `integration/centric-complete` (cce1c32).

## Was geprüft wird

| Datei | Inhalt | Tests |
|---|---|---|
| `pruefungen/rechtematrix-zeilen.test.js` | liest Abschnitt 1 von `RECHTEMATRIX.md` und prüft **jede Zelle** (39 Zeilen × 9 Lesepfade: MA, BR, SV, PL, LT, Kunde→LT, BT, VA-LT, VA-SK) gegen `bestandFuerRolle` bzw. die Vollausgabe; Zellen mit Wortlaut („abwesend", „nur eigene Einheit" …) je eigene Prüfung; neue Zeile oder neuer Wortlaut ohne Prüfung → rot. Dazu Fußnoten ¹ ² ³ ⁴ ⁵ ¹⁴ und Rundreise je schreibender Rolle (MA, SV, PL, LT, Kunde, BT): unverändert zurück = wertgleich; verborgene Werte (Bank, `notfall`, Notfallkontakt, Kalendergeheimnis, frühere Anmeldeadresse, Betriebsnotiz) mitgeschickt = abgewiesen oder wirkungslos | 403 |
| `pruefungen/sicht-tagesgenau.test.js` | Schichtverantwortung tagesgenau: Versetzung mitten im Zeitraum, Rückversetzung, Pool → anderer Bereich, Springer, Bereich „ALLE" (Person und SV), Person ohne Zugehörigkeit, Fenster bleibt maßgeblich, ohne gültigen Tag fail-closed, Rundweg mit Angriffen | 21 |

Beide laufen in CI über `npm run pruefung:rechtematrix` (Schritt „Rechtematrix").

## Befunde und Behebung

1. **`notfall` an Planung, Leitung, Kundenrolle und Vollausgabe der Leitung** (Code gab mehr heraus als die Matrix).
   `notfall` steht in `PERSONENFELDER`, fehlte aber in `VOLL_PERSON_WEG` (`server/lib/sicht.mjs`). Behoben in der
   Positivliste: `notfall` in `VOLL_PERSON_WEG`. Damit kommt es beim Speichern aus dem gespeicherten Stand
   (`vollRueckfuellen`) und bei der Wiederherstellung aus dem heutigen Stand.
2. **Schichtverantwortung sah Tagesdaten aus dem neuen Bereich einer versetzten Person** (bekannter Befund).
   `umfangImZeitraum` (`server/lib/sicht.mjs`): Für Tageseinträge zählt zusätzlich die Zugehörigkeit am Tag;
   Ergebnis ist der kleinere Umfang aus Sichtfenster und Tag. Betroffen: `erfassung`, `fahrzeiten`, `wuensche`,
   `einspruenge`, `aenderungen`, `notrufe`, `selbstplanung.eintraege` (Tag), `abwesenheiten`,
   `urlaubsrunde.wuensche` (Zeitraum berührt den Bereich), `anfragen` (erster Tag, wie beim Entscheiden in
   `einheitZusammen`). Personenliste und Personenfelder bleiben beim Sichtfenster.

## Rot → grün

Gemessen mit `server/lib/sicht.mjs` aus cce1c32 gegen die neuen Tests:

- `sicht-tagesgenau.test.js`: 7 von 21 rot (Versetzung ×3, Rückversetzung, Pool → e2, ohne Tag, Payload).
- `rechtematrix-zeilen.test.js`: 7 rot — Notfallkontakt PL, LT, Kunde, VA-LT; Rundreise „Notfallangabe
  mitschicken" PL, LT, Kunde (wurde gespeichert).
- Mit der Änderung: alle grün; die bestehenden Rechte-/Sicht-/Personendaten-/Ist-Daten-/Stempel-Tests
  (23 Dateien, 1042 Tests) ebenfalls grün.

Eine Testanpassung: In `sicht-schichtverantwortung.test.js` trägt der Notruf `nr-a` jetzt `datum` (die
Oberfläche setzt es immer); ohne Tag bekommt die Schichtverantwortung einen Bereichsnotruf nicht mehr
(fail-closed, eigener Test in `sicht-tagesgenau.test.js`). Notrufe, die an sie gerichtet sind, sieht sie
weiterhin unabhängig vom Tag.

## Präzisierungen in `RECHTEMATRIX.md` (keine Rechte erweitert)

- Hinweis auf den neuen Zeilentest.
- „Die eigene Person bekommt jede Rolle vollständig" stimmte nur für Planung, Leitung und Kundenrolle;
  Beschäftigte, Betriebsrat und Schichtverantwortung bekommen `EIGENE_PERSON`.
- Personengerüst: MA/BR/SV „ohne Rollenverlauf ¹⁶" statt ✓ (`rechtematrix.test.js` prüfte schon immer –).
- Qualifikationen SV: ² (fremde Personen ohne Status-Qualifikationen).
- Personennotizen: die Notiz der Leitung `notiz` an der Person ausdrücklich genannt.
- Fußnote ¹⁵ (tagesgenau) an Zeiterfassung, Abwesenheiten, Anträgen und Notrufen der SV.

## Offene fachliche Fragen (Code restriktiver als die Matrix bzw. nicht geregelt)

1. Rollenverlauf (`rolleSeit`, `rolleVerlauf`) für Beschäftigte, Betriebsrat, Schichtverantwortung — gebraucht?
2. Eigene Person: Beschäftigte sehen die eigenen Bank-, Steuer- und Lohnangaben und die frühere
   Anmeldeadresse nicht — gewollt (Auskunft über einen anderen Weg) oder Lücke?
3. Personenfeld `zuschlaege` (an der Person, keine Oberfläche schreibt es) geht an Planung und Leitung; die
   Matrix nennt es nicht. Lohnbestandteil (dann wie Lohn) oder Planungsangabe?
4. `sichtIstDaten` der SV bleibt personenbezogen. Für Tage einer versetzten Person im anderen Bereich fehlt die
   Erfassung jetzt aus Datenschutzgründen; `src/istdaten.js` rechnet dort mit der Planzeit („nicht erfasst")
   statt „nicht verfügbar". Folgeschritt in der Oberfläche (tagesgenaue Angabe), nicht Teil von WP-43.
5. Sondereinsätze, Kompetenzen, Einarbeitung, Betriebsmittel bleiben beim Sichtfenster (keine Ist- oder
   Gesundheitsdaten); Sondereinsätze tragen ein Datum — tagesgenau gewünscht?
6. Rundreise der Beschäftigten stellt verborgene Anträge hinter die sichtbaren (Reihenfolge, kein Verlust).
