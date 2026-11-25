# WP-I8 Teil 1 — Konflikte mit Ursache (Lücken-Ursache im Rechenkern)

Basis: integration/release-v4 (4f548e66). Nicht produktiv: keine Route, keine Oberfläche, kein Anbieter, kein Schalter berührt. Reiner Rechenkern, nur synthetische Testdaten.

## Warum dieser Teil

WP-I8 hängt als Ganzes am Planer-Kern (WP-I7, von WP-I5 abhängig, beide von anderen Schreibern bearbeitet). Der Teil „Konflikte mit Ursache“ braucht aber keinen Plan, den der Planer erzeugt: Er erklärt für eine bereits **unterbesetzte** Dienstart an einem Tag, woran die freien Personen scheitern. Er setzt nur auf der heutigen Einsatzprüfung (`hindernisBefunde`, WP-I12a) auf, baut keinen Planer und keine zweite Prüflogik (nichts doppelt gebaut). Dieselbe Ursachenzählung kann WP-I26 (Regel-Konflikte erklären) später nutzen.

## Umfang

| Datei | Inhalt |
|---|---|
| `server/lib/engine/luckenursache.mjs` (neu) | `lueckenUrsache(m, tag, dienst, { budget })`, `konflikteMitUrsache(m, von, bis, { budget, luckenMax })`, `budgetNeu`, Grenzen `PERSONEN_PRUEFUNGEN_MAX` (400), `LUECKEN_MAX` (50), `WEGE_MAX` (5), `TAGE_MAX` (62) |
| `pruefungen/engine-luckenursache.test.js` (neu, 17 Tests) | U1 bis U6, siehe unten; aufgenommen in `pruefung:querschnitt` (package.json) |

Ergebnis je Lücke: `fehlt`, `geprueft`, `direkt` (freie Personen ohne Hindernis), `hindernisse` (je Regelkennung: Zahl hindernder Personen), `kleinste` (kleinste Regelmenge, die bei mindestens einer Person entfallen müsste), `wege` (die kleinsten Regelmengen mit Personenzahl und `deckt` = min(fehlt, direkt + Personen)), `ursache` (`besetzt`, `direktMoeglich`, `hindernisse`, `keinPersonal`, `unvollstaendig`), `unvollstaendig`, bei fehlender Qualifikation `qualFehlt`.

## Schutzregeln (je mit Test und Mutation)

- **Ein Budget je äußerem Einstieg.** `konflikteMitUrsache` reicht ein Budget an alle Lücken durch, nie je Lücke neu (Lehre #561/#566). Ohne übergebenes Budget bekommt der äußere Aufruf genau eines. Ungültiger Rest (NaN, negativ, Text, Infinity, fehlend) zählt als erschöpft. Mutationen: Budgetprüfung entfernt, Budget je Lücke neu.
- **Fail closed.** Budget erschöpft: `unvollstaendig`, keine `kleinste` Ursache, keine Wege; es wird nichts behauptet, was nicht geprüft wurde. Mutation: frühen Rückgang entfernt.
- **Parametergrenzen.** Zeitraum höchstens 62 Tage (Zählregeln darüber gehören in die Aggregate, WP-I7 / I5-4), Datum streng geprüft (Schaltjahr, Monatslänge), Lückenzahl begrenzt (weitere werden gezählt, nicht untersucht). Mutation: Zeitraumgrenze entfernt.
- **Datenschutz.** Ergebnis enthält nur Kennungen und Zahlen: keine Personenkennung, kein Name, kein Befundtext (Schutzgründe, Abwesenheitsgrund bleiben draußen), Schlüssel-Positivliste im Test. Mutation: Regelkennung durch Befundtext ersetzt.
- **Rein.** Keine Uhr, kein Zufall, keine Mutation (eingefrorene Eingabe), kein Import aus `src/` oder `intelligence/`.
- **Einsatzregeln unverändert.** Es zählen Befunde ab „Achtung“ wie in `ersatzVorschlaege`; Hinweise zählen nicht (Mutation: ab „Hinweis“).

## Rot → grün

Vorher: Test lädt `luckenursache.mjs` nicht (Modul fehlt), 0 Tests. Danach 17 von 17 grün (`pruefungen/engine-luckenursache.test.js`, TZ=UTC).

## Grenzen und Offenes

- Die Rechnung ist synchron; nach oben begrenzt durch das Budget (400 Personenprüfungen). Wer größere Betriebe über viele Tage braucht, ruft mehrfach mit eigenem Budget (Abstand für den Event-Loop). Ein Server-Aufrufer gehört in WP-I7/I8 (Planer), nicht hierher; dieser Teil hat keine Route.
- Bei `fehlt > 1` ist `deckt` die Zählung, keine Kombination mehrerer Regelmengen (kleinste Ursache je Person, nicht die kleinste gemeinsame Menge für mehrere Personen). Die vollständige Minimalmengen-Suche braucht den Planer (WP-I7).
- Ob eine Regel „entfallen darf“ (Rangfolge Gesetz > Besetzung > …), entscheidet der Planer-Kern; der Wege-Text mit Folgen („Mit 1 Person aus Wohnbereich 1 …“) und die Anzeige in `App.jsx` bleiben offen.
- Offen für WP-I8 insgesamt: Varianten und Erfüllungsbericht (Zählwerte; brauchen den Plan aus WP-I7).
