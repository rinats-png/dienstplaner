# WP-I3 — Regelbaukasten vervollständigen (8 Regelarten) — Nachweis

Stand 2026-11-06, Branch `feature/wp-i3-regelbaukasten`. Status: implementiert und lokal getestet; nicht reviewt, nicht integriert.

## Was
- `server/lib/regelbaukasten-erweitert.mjs` (neu): `musterregel`, `blockregel`, `verteilungsregel`, `wunschregel`, `wuenscheGeordnet`, `wochenendEreignisse`, `wochenendZaehlregel`, `testlauf`, `pruefeRegel` (alle acht Arten), `REGELARTEN_ALLE`.
- `server/lib/regelbaukasten.mjs`: nur ein Export `BAUSTEINE` (die vorhandenen Ergebnisbausteine) und ein Kommentar. Die Rechnung der vier alten Arten ist unverändert; der Server-Weg `branchenbefunde.mjs` bleibt auf `regelbaukasten.mjs#pruefeRegel` (vier Arten).
- `src/regelbaukasten.js`: reicht die neuen Arten weiter und löst Kennungen über das Register; `pruefeRegel` rechnet jetzt alle acht.
- Dieselbe Maschine, keine zweite: Ergebnisform (`status`, `befund`, `fakten`), Prüfstatus (`watchlist`/`deprecated` wirken nicht, `provisional` höchstens Hinweis) und Gültigkeit kommen aus dem bestehenden Baukasten.

## Regelarten (Parameter siehe Kopfkommentar der Datei)
| Art | Beispiel | Kernsemantik |
|---|---|---|
| Musterregel `verbotenFolge` | nach Nacht kein Früh | Klasse am Tag d aus `von` und am Tag d+n aus `dann` = Verstoß |
| Musterregel `hoechstensFolge` | Nachtblock höchstens 3, danach 2 frei | Block-Länge und freie Tage danach |
| Blockregel | Sa/So dieselbe Dienstart | je Kalenderwoche gleiche Bezeichnung (optional `gruppen`) |
| Verteilungsregel | Nächte, Abweichung höchstens 1 | Spannweite über Personen |
| Wunschregel | Dienstag frei | nur Hinweis, Priorität 1–5, nie `achtung`/`recht` |

Plan 5.3 (Wochenend-Rotation) wird aus Zählregel (über `wochenendZaehlregel`/`wochenendEreignisse`), Blockregel und Musterregel (Nacht-Wochenende, Montag Früh) zusammengesetzt und im Test gerechnet. `testlauf()` liefert „7 von 24 verletzen die Regel".

## Invarianten (je im Test belegt)
1. Offen ist nie grün: unbekannte Tage/Werte, Randblöcke und unvollständige Wochenenden ergeben `offen`; eine am bekannten Teil schon sichere Verletzung bleibt `verletzt`. `testlauf().gruen` ist nur ohne verletzte und offene Fälle wahr.
2. Bestimmtheit: gleiche Eingabe, gleiche Ausgabe (auch nach `structuredClone`); keine Uhr, kein Zufall; Ausgaben unabhängig von Schlüsselreihenfolge.
3. Keine Veränderung der Eingaben: Regel und Kontext tief eingefroren übergeben, nichts wirft, nichts ändert sich.
4. Keine Personenbewertung (Plan 6.3): Parameter, die Krankheit/Gesundheit/Fehlzeit/Leistung/Zuverlässigkeit nennen, werfen.
5. Wunsch ist nie mehr als ein Hinweis, auch bei `hoechsteStufe: "recht"` im Eintrag.
6. Tarif-/Gesetzeswerte kommen nur aus Registereinträgen; der Code enthält keine.

## Tests
- `pruefungen/intelligence-regelbaukasten.test.js`: 87 Tests (je Art positiv/negativ/Rand, vier Gemeinsamkeits-Zusagen je Art, Wochenend-Rotation, Testlauf, Dispatcher, Laufzeit 31 Tage x 40 Personen < 1 s; gemessen etwa 10 ms).
- `pruefungen/regelbaukasten.test.js`: eine Zusicherung angepasst. „Eine nicht gerechnete Regelart wirft" prüfte mit `musterregel`, die jetzt gerechnet wird; der Test nutzt jetzt den Platzhalter-Typ `zauberregel` (gleiche Erwartung, gleiche Meldung). Sonst unverändert.
- Gelaufen und grün: `regelwerk`, `regelregister`, `fachpruefung-server`, `konsistenz`, `branchen*`, `schutzregeln-ersatzsuche` (zusammen 379 grün).
- **Nicht von I3 verursacht, schon auf Basis 9aac167 rot:** `regelbaukasten.test.js` „die neuen Registerregeln der gerechneten Arten sind auswertbar" (`BEREIT-HOECHST-01` hat `grenzeAus` statt Grenze). Weder verändert noch umgangen.
- `npx eslint` auf alle geänderten Dateien: ohne Befund.

## Integrationspunkte
Keine Änderung in `src/App.jsx`. Spätere Anbindung (WP-I4/I5): `import { pruefeRegel, testlauf } from "./regelbaukasten.js"`; der Aufrufer baut die Tageskarte `{ "JJJJ-MM-TT": Klasse }` aus dem Plan.

## Offen
Fachfragen (Wochenend-Fragen 1–6 des Plans, Teilzeit, Verbotsliste, Prioritätsskala): `docs/acc45/wp-i3-i6-fragen.md`. Verwaltungsoberfläche, Aktivierung, Stufengrenzen (E-21) sind I4, nicht Teil dieses Pakets.
