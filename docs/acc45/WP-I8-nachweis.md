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

## Nachbesserung nach Opus-Review #570 (neuer Commit)

| Befund | Lösung | Test (rot → grün) | Mutation |
|---|---|---|---|
| 1 HOCH fail-open: `schutzOffen` (Stufe Hinweis, nicht bewertbar) zählte als „direkt“ | Jeder Befund mit Regelkennung `…Offen` (`schutzOffen`, künftig `vorgabeOffen`) hindert wie ein Befund ab „Achtung“ (`hindert`); nie `direkt` | U7 (demo1, Nachtdienst, Geburtsdaten entfernt: vorher `direkt 25`); die übrigen Tests setzen Geburtsdaten, sonst hindert `schutzOffen` jede Person | Offen-Regel entfernt: U7 rot |
| 2 Qualifikationslücke überzeichnete `direkt`/`deckt` | Bei `qualFehlt` zählen nur Personen mit einer gültigen fehlenden Qualifikation; die übrigen stehen in `ohneQualifikation`; Ursache `qualifikationFehlt` ohne Wege | U8 (niemand hat sie: `direkt 0`; zwei Personen: höchstens 2) | Prüfung entfernt: U8 rot |
| 3 Budget-Umgehung (`rest` 1e9 / MAX_SAFE_INTEGER) | Übergebenes Budget wird auf `PERSONEN_PRUEFUNGEN_MAX` gedeckelt | U9 (vorher 1859 Prüfungen) | Deckel entfernt: U9 rot |
| Nebenpunkt: fehlende Felder | `betriebOk`: `einstellungen`, `abweichungen`, `abwesenheiten`, Person ohne `id` ⇒ `ok:false` statt TypeError | U9 | Prüfung entfernt: U9 rot |

Offen (nach Merge von #566): Durchreichen des #566-Vorgaben-Budgets: nach Merge von #566 nachziehen (Rebase): ein gemeinsames `vorgabenBudget` je Einstieg und `automatisch` an `hindernisBefunde` durchreichen, dazu Test. Die Offen-Behandlung ist dafür bereits so gebaut, dass `vorgabeOffen` automatisch als Hindernis zählt.

Hinweis für den späteren Aufrufer (WP-I7/I8): Der kalte Erstaufbau der Planrechnung (Zwischenspeicher je Bestand) kostet rund 2,5 s und ist nicht budgetiert; er fällt beim ersten Aufruf auf einem frischen Bestand an.
