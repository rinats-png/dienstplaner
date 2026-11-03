# WP-23 Entwürfe nicht an Beschäftigte ausliefern: Nachweis

Branch `acc45/security/wp23-entwuerfe`, Basis `origin/integration/centric-complete` (5ddda3f).

## Befund

Ein Monatsplan ist ein Entwurf, bis die Planung ihn freigibt (`freigaben[JJJJ-MM]`). `GET /api/bestand` lieferte
Beschäftigten die Einteilungen (`abweichungen`) aller Monate, auch die eines Monats, an dem die Planung noch arbeitet.
Ein Dienst, den es morgen vielleicht nicht mehr gibt, stand auf dem Telefon.

## Umsetzung

`server/lib/sicht.mjs`, Katalog `BETRIEB`: `abweichungen` ist für Beschäftigte jetzt `R(planOhneEntwurf)`.

- **Sichtbar** sind für Beschäftigte die Einteilungen eines freigegebenen Monats und jedes Tages bis einschließlich
  heute (Berliner Zeit, `laufenderTag`). Was heute oder früher liegt, ist in Kraft und kein Entwurf mehr.
  **Warum nach Tag und nicht nach Monat:** Die erste Fassung schnitt nach Monaten. Die vorhandenen Render-Prüfungen
  (`oberflaeche-render`) zeigten sofort die Folge: In einem Monat ohne Freigabe verschwand der heutige Dienst, „Mein
  Dienst heute“ und damit das Einstempeln. Ein Betrieb, der die Freigabe nicht benutzt, hätte seinen Beschäftigten den
  ganzen laufenden Monat genommen. Ein Entwurf ist deshalb nur, was nach heute liegt und zu einem nicht freigegebenen
  Monat gehört.
- Ein Eintrag **ohne gültigen Tag** im Schlüssel (`Person|JJJJ-MM-TT`) geht nicht hinaus (fail-closed).
- **Nur Beschäftigte.** Der Betriebsrat behält den ganzen Plan: Die Mitbestimmung bei Beginn, Ende und Verteilung der
  Arbeitszeit setzt voraus, dass er den Entwurf vor der Freigabe prüfen kann. Schichtverantwortung, Planung, Leitung
  und Kundenrolle planen selbst und sehen den Entwurf. Diese Entscheidung ist in RECHTEMATRIX ²⁷ festgehalten und
  fachlich zu bestätigen.
- **Speichern bleibt gleich:** Beschäftigte schreiben `abweichungen` nicht (`eigenesZusammen`). Der gespeicherte
  Entwurf übersteht ihr Speichern (getestet).
- RECHTEMATRIX: neue Fußnote ²⁷.

## Tests

`pruefungen/entwuerfe.test.js` (14 Tests, `npm run pruefung:entwuerfe`, im CI-Gate), mit festen Monaten weit in der
Zukunft bzw. Vergangenheit:

- Sonde je Rolle über `bestandFuerRolle`: Beschäftigte ohne eigenen und fremden Entwurf; Betriebsrat, Schichtverantwortung,
  Planung, Leitung und Kundenrolle mit Entwurf.
- Ohne `freigaben` im Betrieb sehen Beschäftigte die Zukunft nicht, die Vergangenheit schon.
- Gestern und heute sichtbar, morgen im nicht freigegebenen Monat nicht, im freigegebenen schon; Tageswechsel in
  Berliner Zeit.
- Die Eingabe wird nicht verändert.
- Über den Handler: `GET /api/bestand` ohne `2099-05` für Beschäftigte; Speichern einer Beschäftigten lässt den
  Entwurf unberührt; nach der Freigabe durch die Planung ist der Monat sichtbar.

**Rot vorher:** Gegen `sicht.mjs` ohne die Änderung 4 von 14 rot (Beschäftigte sehen den Entwurf in der Sicht, im
Handler und ohne Freigaben; `laufenderTag` fehlt). Die übrigen 10 sind „bleibt erhalten“-Prüfungen und bestehen auf
beiden Ständen. Jetzt 14/14.

Regression lokal: `rechtematrix`, `rechtematrix-zeilen`, `sicht`, `sicht-tagesgenau`, `sicht-planung-leitung`,
`sicht-schichtverantwortung`, `kette-a-rundreise`, `review-wp10`, `personendaten`, `oberflaeche-render`,
`oberflaeche-selbstservice`, `zeiterfassung`, `stempeln`, `stempeldaten` — ohne eine Anpassung bestehender Tests.
Die erste, monatsgenaue Fassung machte 5 Fälle in `oberflaeche-render` rot (heutiger Dienst fehlt); die tagesgenaue
Regel hält sie grün. eslint ohne Befund.

## Offen

- **Kalender-Feed (WP-24):** Er liefert heute keine Einteilungen. Sobald er das tut, muss er dieselbe Regel einhalten
  (nicht freigegebene Monate gehen nicht an die Person).
- **Anzeige:** Die Oberfläche beschriftet einen nicht freigegebenen Monat bei „Kommende Dienste“ mit „Entwurf“. Für
  Beschäftigte zeigt sie dort jetzt nur die Schichtfolge ohne die Einteilungen der Planung. Ob dort stattdessen
  „noch nicht veröffentlicht“ stehen soll, ist eine fachliche Frage.
- **Mitteilungen:** Wer die Planung vor der Freigabe an einem Entwurf ändert, erzeugt dabei unter Umständen schon
  Mitteilungen an Betroffene (`planGeaendert`, z. B. beim Einspringen). Das gehört zur Freigabelogik und ist nicht Teil
  von WP-23.
- Auskunft nach Art. 15 (WP-26) nennt die geplanten Dienste der Person, auch im Entwurf: Es sind ihre eigenen Daten, die
  Auskunft dient nicht der Planansicht.
