# WP-I3 Regelbaukasten (8 Regelarten) - Abnahmenachweis (Dateiname wegen Gross-/Kleinschreibung nicht WP-I3-NACHWEIS.md)

Stand 2026-11-09, Basis `integration/release-v4` (de703e1). Ergebnis der Prüfung: Alle acht Regelarten sind bereits vollständig im Stand enthalten (PR 108, Commits 464720e, 1be78df, 55cfa78). Es wurde keine neue Regellogik ergänzt. Fachlicher Nachweis der Umsetzung: `wp-i3-nachweis.md`.

## Ergebnis nach Regelart (Prüfung, Befundtext, Test)
| Regelart | Ort | Tests (grün) |
|---|---|---|
| Zählregel | `server/lib/regelbaukasten.mjs` | 13 in `regelbaukasten.test.js` |
| Grenzregel | dto. | 6 |
| Besetzungsregel | dto. | 26 (Mindestanzahl, Qualifikation, Quote, Höchstanteil, Verhältnis, mehrere) |
| Paarregel | dto. | 10 |
| Musterregel (verbotene Folge, höchstens Folge) | `server/lib/regelbaukasten-erweitert.mjs` | 19 + 6 gemeinsame Zusagen |
| Blockregel | dto. | 11 + 6 |
| Verteilungsregel | dto. | 8 + 6 |
| Wunschregel (nur Hinweis) | dto. | 8 + 6 |

Querschnitt: Wochenend-Rotation (Plan 5.3) 8, Testlauf 4, Dispatcher/Register 4, Laufzeit 31 Tage x 40 Personen 1, Gültigkeit/Prüfstatus 10, Zeiträume 9.
Invarianten je Art getestet: `offen` nie grün, deterministisch, Eingaben unverändert, keine Personenbewertung, Wunsch nie mehr als Hinweis.

## Testlauf
`npx vitest run pruefungen/intelligence-regelbaukasten.test.js pruefungen/regelbaukasten.test.js`: 2 Dateien, 168 Tests grün (87 + 81). Rot-Stand entfällt, da keine Änderung am Code; keine Tests geändert oder entfernt.

## Offen
Fachfragen (Wochenend-Fragen, Teilzeit, Prioritätsskala): `wp-i3-i6-fragen.md`. Verwaltungsoberfläche und Stufengrenzen sind WP-I4. Statusstufen in `work-packages.json` bewusst nicht geändert.
