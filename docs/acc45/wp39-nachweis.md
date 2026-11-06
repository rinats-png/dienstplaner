# WP-39 Nachweis: Aufteilung von src/App.jsx (inkrementell)

Branch `feature/wp39-app-aufteilung`, Basis 5014e13 (integration/release-v4). Text der verschobenen Stellen unveraendert; es wurden nur Imports ergaenzt. Kein Verhalten geaendert.

| Schritt | Verschobene Symbole | Neue Datei(en) | App.jsx Zeilen vorher -> nachher |
|---|---|---|---|
| a | zahlOder, n1, n2, sgn, n1Ist, sgnIst, eur, eur0, zahl, uid; DOW, DOW_LANG, MON, heute, fLang, fKurz, fDatum | src/lib/format.js, src/lib/datum.js | 25927 -> 25902 |
| b | Darstellungsmodus (`_dunkel` als Getter/Setter istDunkel/dunkelSetzen), lesbar, TON, NUM; Leer, Laden, Feldfehler, klickbar, Card, CardHead, Lab, Rubrik, Schalter, Haken, Fussleiste, Filterleiste, Planzelle, Avatar, Btn, Inp, Sel, Field, Seg, H1, Kpi, KpiRow, Abschnitt, Pill | src/ui/thema.js, src/ui/bausteine.jsx | 25902 -> 25617 |
| c1 | Einwilligungen | src/ansichten/einwilligungen.jsx | -> 25571 |
| a2 | ROLLEN, rolle, anzahlWort, mehrzahl, ROLLENBEZEICHNUNG, ROLLEN_VORGABE, rollenName, RECHTE_GRUPPEN, ALLE_RECHTE, MATRIX_STD; darf | src/lib/rollen.js, src/lib/berechtigung.js | -> 25469 |
| c2 | GeoSchalter, JugendschutzSchalter | src/ansichten/geo-schalter.jsx, jugendschutz-schalter.jsx | -> 25384 |
| c3 | Adressaenderungen (+adressAenderungen), OfflineSchalter, Hilfe, Pakete (+paketeFuerBranche), BetreiberTarife, Mandantenrechner | src/ansichten/*.jsx | -> 24844 |

Theme: `themaSetzen` in App.jsx ruft `dunkelSetzen()`; alle Bausteine lesen `istDunkel()` aus src/ui/thema.js. Die Palette C bleibt das eine Objekt aus src/farben.js.

## Pruefungen je Schritt
- `npx vite build` gruen, `npx eslint` 0 Fehler (Warnungen nicht mehr als vorher: 105 -> 102).
- Immer: oberflaeche-render, tour-dialog, v4-app-stil, v4-tokens; nach (b) und (c3) alle 56 Pruefungen, die `App.jsx` im Quelltext lesen.
- Quelltextpruefungen (g9-nachtrag, g9-nachtrag2, g9-verkauf, gestalt, preisanzeige) lesen jetzt ueber `pruefungen/app-quelle.js` App.jsx plus src/ansichten, src/ui, src/lib (ohne fuehrendes `export `). Behauptungen unveraendert; negative Behauptungen sind dadurch strenger.
- Bekannt rot schon vor WP-39 (Basisstand): selbsttest (1), wiederherstellen-ui (3), zugaenge-anlegen (jq fehlt). geo, mandanten-session, zustellung-rechte waren unter Volllast einmal rot und einzeln gruen.
- Browserlaeufe (Playwright) nicht ausgefuehrt; Aufgabe des Orchestrators.

## Nicht herausloesbar ohne mehr als Imports
Views, die noch von in App.jsx verbliebenen Fachfunktionen abhaengen (z. B. vorschau, pruefen, memo, Sheet, Zelle, Standorte/Betrieb-Verflechtung): Kapazitaetsvorschau, Urlaubsrunde, Planstand, Tarifwerk, Wunschdienste, Einarbeitung u. a. Naechster Schritt: Fachlogik (Zeilen ca. 1300-4400) nach src/lib/ ziehen, dann Sheet/Zelle nach src/ui.
