# WP-35 Nachweis: Darstellungsbefunde

Stand: Branch `feature/wp40-wp35-darstellung` (Basis 46dd93b).

Akzeptanz (work-packages.json): „Kein Querscrollen bei ≤430 px für Abrechnungsdaten/Handbuch; Geo-Schalter sofort“. Prüfung laut Eintrag: Playwright-Viewport.

## Stand je Punkt

| Punkt | Befund im Quelltext | Änderung in diesem Paket | Nachweis |
|---|---|---|---|
| Abrechnungsdaten ≤430 px | Die Tabelle (`table.raster`, Mindestbreite 760 px) liegt in einer `Card` mit `overflowX: "auto"`. Die Seite selbst entsteht daraus kein Querscrollen; die Tabelle scrollt innerhalb ihres Bereichs. Die Leiste darüber (`Leitraster seiteBreite={480}`) und die Eingabefelder (`minWidth` 160/96/150) brechen in `flexWrap`-Zeilen um. | keine | **Browser-Prüfung offen** (Playwright, 430 px: `document.documentElement.scrollWidth <= 430`). Frage 6 in `wp40-fragen.md`. |
| Handbuch ≤430 px | Die Handbuch-Ansicht (`Handbuch` in `App.jsx`) nutzt `H1` mit `flex: 1 1 300px` und umbrechende Gruppen; `hilfe.jsx` hat keine feste Breite (`minWidth: 220`). | keine | **Browser-Prüfung offen**. |
| Geo-Schalter sofort | `GeoSchalter` (`ansichten/geo-schalter.jsx`) ruft `akt.setzeGeoPruefung` bzw. `akt.setzeGeoModus` auf. Beide laufen über `mUpd` (lokale Zustandsänderung, Meldung „eingeschaltet“/„ausgeschaltet“). Der Server bestätigt danach. | keine | **Browser-Prüfung offen**; Frage 5 in `wp40-fragen.md`. |
| Darstellungsbefunde (bekannt) | Ziele unter 40 px auf dichten Planrastern (Telefon) sind bewusst; Hinweis „Für Tablet und Rechner ausgelegt“. | keine (nicht zu brechen) | — |

## Warum keine Änderung an den Layouts

Ohne Messung im Browser lässt sich nicht sagen, ob ein Querscrollen entsteht. Die Tabelle ist ein Datenbereich mit eigenem Scroll-Container; das ist für 1.4.10 zulässig. Ob der Akzeptanztext die Tabelle selbst meint, entscheidet der Orchestrator (Frage 6). Eine Umstellung ohne diese Entscheidung wäre eine Vermutung.

## Tests

Die Tests zu WP-35 liegen unverändert. Der Kontrast- und Darstellungsbestand (`pruefungen/kontrast.test.js`, `pruefungen/gestalt.test.js`, `pruefungen/v4-*.test.js`, `pruefungen/oberflaeche-render.test.js`) läuft mit diesem Paket weiter grün.

## Nur im Browser prüfbar

1. Playwright bei 430 px und 390 px: Abrechnungsdaten und Handbuch, `scrollWidth` des Dokuments.
2. Geo-Schalter: Klick auf „Einschalten“ und „Auf Hinweis zurückstellen“, Anzeige ohne Verzögerung.
3. Zielgrößen auf dem Telefon: Planzellen als bewusste Ausnahme dokumentiert.
