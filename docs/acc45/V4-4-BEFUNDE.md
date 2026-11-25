# V4-4: Visuelle QA hell/dunkel — Prüfumfang und Befunde

Stand: 2026-11-25, Basis `integration/release-v4` (d699e1e8; Folge zu PR #538 auf 4c18ac77). Arbeitspaket V4-4 (SSOT `docs/acc45/work-packages.json`), Umfangsklasse RELEASE-UMFANG (V4-Qualität). Nur erfundene Testdaten (Demo-Bestand des Testservers, `e2e/global-setup.mjs`).

## Was es gibt

Playwright-Projekt `v4-visuell` in `playwright.config.mjs` (Spec `e2e/v4-visuell.spec.mjs`, Hilfen `e2e/v4-visuell.mjs`, Wiring-Test `pruefungen/v4-visuell-qa.test.js`, eingebunden in `pruefung:e2e-flaechen`).

- Lauf lokal: `npm run e2e:browser` (einmal), dann `npx playwright test --project=v4-visuell`.
- Lauf in der CI: Der Job `browser-abnahme` ruft `npm run e2e` ohne `--project`; das neue Projekt läuft dort mit. Es ist keine Änderung an `.github/` nötig.
- Bilder nur zur Ansicht: `V4_VISUELL_BILDER=1` legt Bilder unter `e2e/ergebnisse/v4-visuell/` ab (ignoriert, nie im Repo, nie ein Gate). Es gibt keine Bild-Baselines im Repo; es gibt keinen Pixelvergleich.

## Geprüfte Ansichten

Je Ansicht, Breite (375 px Telefon, 1280 px Desktop) und Thema (hell, dunkel; gemerkte Wahl der App und Systemthema stimmen überein):

| Ansicht | Rolle | Kontrast | Bildlauf | Außerhalb / abgeschnitten | Überlappung | Fokus |
| --- | --- | --- | --- | --- | --- | --- |
| Anmeldung | ohne | ja | ja | ja | ja | ja |
| Dienstplan (Monatsplan) | Leitung | ja | ja | ja | ja | ja |
| Mitarbeiter (Personal) | Leitung | ja | ja | ja | ja | ja |
| Abwesenheiten (Anträge) | Leitung | ja | ja | ja | ja | ja |
| Einstellungen | Leitung | ja | ja | ja | ja | ja |
| Pakete | Betreiber | ja | ja | ja | ja | ja |
| Heute, Mein Plan, Anliegen (Urlaub, Krank, Tausch), Mehr (Profil) | Beschäftigte | ja | ja | ja | ja | ja |

Die Beschäftigten (Schichtdienst) sehen immer die Telefonschale mit vier Reitern (`zeigeMobil` in `src/App.jsx`). Sie wird bei 375 px und bei 1024 px (Umbruch der Seitenleiste, `UMBRUCH.seitenleiste`) geprüft, im selben Lauf je Thema. Die Rechneransicht der Beschäftigten (Umschalter in „Mehr“) ist nicht Teil dieser Prüfung. Die Leitung bleibt bei 375 und 1280 px; 1024 px gibt es für sie nicht.

Die Prüfungen:

- Kontrast: axe-Regel `color-contrast` (WCAG 1.4.3), jeder Fund zählt.
- Bildlauf: Die Seite hat keine waagerechte Bildlaufleiste (`scrollWidth <= clientWidth`).
- Außerhalb: Kein Hauptelement (Knöpfe, Felder, Überschriften, Karten, Navigation) liegt außerhalb der Breite, außer in einer waagerecht klemmenden oder blätternden Fläche (Plantabelle; siehe Grenzen).
- Abgeschnitten: Kein Element mit `overflow: hidden` schneidet Text ab, außer mit Auslassungspunkten.
- Überlappung: Bedienbare Elemente überlappen sich nicht. Elemente unter festen oder klebenden Leisten und in Bildlaufflächen zählen nicht.
- Fokus: Je Ansicht drei gezielte Elemente: das erste bedienbare Element, das erste im Hauptinhalt (`main`, nicht in einer festen oder klebenden Leiste) und das letzte. Umriss oder Schatten sichtbar, Kontrast >= 3:1 gegen die Fläche dahinter (WCAG 1.4.11).
- Selbsttest (Mutation, bei jedem Lauf): Auf der Anmeldeseite wird je Prüfung ein Fehler eingebaut (blasser Text, breites Element, Knopf außerhalb, abgeschnittene Karte, überlappende Knöpfe, Fokusring entfernt). Die Prüfung muss anschlagen. Außerdem muss die Ausgangslage sauber sein.

Beleg der Mutation (lokal, 2026-11-25): Mit abgeschalteter Kontrastprüfung bzw. abgeschalteter Überlappungsprüfung wird der Selbsttest rot („Prüfung kontrast muss anschlagen, fand []“, ebenso `ueberlappung`).

## Befunde

Der erste vollständige Lauf (alle 10 Tests) zeigt keinen echten Befund an der App: Kontrast, Bildlauf, Außerhalb, Abschneiden, Überlappung und Fokus bestehen in allen geprüften Ansichten, Breiten und Themen. Auch die Folge (Rolle Beschäftigte bei 375 und 1024 px, gezielte Fokusauswahl; 12 Tests) findet keinen echten Befund an der App. `VISUELL_BEKANNT` in `e2e/v4-visuell.mjs` ist leer.

Zwei Messfehler im ersten Entwurf (kein App-Fehler, im Test behoben):

1. Anmeldung hell, Kontrast 2,23:1 auf einem `aria-hidden`-Element: Das war die Wortmarke der Startsequenz mitten in der Einblendung. Die Spec misst erst, wenn die Startsequenz (`[aria-label="CENTRIC wird gestartet"]`) weg ist.
2. Fokusring 1,08:1 auf der Konto-Taste: Der Umriss blendet von `currentColor` zur Fokusfarbe über; der erste Messwert war ein Zwischenbild. Die Spec schaltet Übergänge für die Messung ab (wie `e2e/v4-seitenleiste-kontrast.spec.mjs`). Im Ruhebild ist die Fokusfarbe `--v4-focus` (hell `#ac670e`, dunkel `#ffd77b`).

## Grenzen (ehrlich)

- Die Fokusprüfung ist eine gezielte Auswahl (drei Elemente je Ansicht), keine vollständige Tabulatorfolge.
- Die Überlappungsprüfung nimmt feste und klebende Leisten sowie Bildlaufflächen aus. Ein Fehler dort bleibt unentdeckt.
- Die Prüfungen „außerhalb“ und „Überlappung“ nehmen Elemente aus, deren Vorfahr waagerecht klemmt (`overflow-x` hidden, clip, auto oder scroll, mit `scrollWidth > clientWidth`). Ein Knopf, der sauber in einem solchen Behälter verschwindet, bleibt unentdeckt. Die Prüfung „abgeschnitten“ deckt nur Text im klemmenden Element selbst.
- Es werden die Leitung (Kundenseite), die Beschäftigten (Telefonschale) und die Betreiberrolle geprüft; Planung, Schichtverantwortung und Betriebsrat haben die Kontrast- und Fokusprüfung nur über `e2e/barrierefreiheit.spec.mjs` (Standardthema).
- Keine Tablet-Breiten für Leitung und Betreiber (768 px; 1024 px nur bei den Beschäftigten) und kein Querformat; die acht Gerätebreiten bleiben bei den bestehenden axe-Specs.
- Die Token-Nutzung im Quelltext (keine harten Farben) sichern weiter `pruefung:v4-tokens` und `pruefungen/v4-3b-*.test.js`; hier gibt es dazu keine eigene Prüfung. `v4-variablen.spec.mjs` sichert die Variablen je Thema.
- V4-3d (Rest-Farb- und Formwerte) ist offen (Betreiberentscheidung in `ENTSCHEIDUNGSLISTE.md`); diese QA nimmt keine Entscheidung vorweg.
- Die Zahl der Anmeldungen je Lauf ist klein (zwei Leitung, zwei Beschäftigte, zwei Betreiber); die Lastbremse „anmelden-code“ (20 je 300 s und Code) ist unkritisch.

## Laufzeit

Messweise: lokal (Windows, 2 Arbeiter, ohne Parallellast), Summe der Testzeiten laut Listenausgabe von Playwright, 2026-11-25. Die Wandzeit der Testphase ist lokal nicht getrennt vom Aufbau des Testservers (`global-setup.mjs`, rund zwei Minuten) gemessen; der Aufbau fällt ohnehin an und zählt nicht zum Zusatz.

- Erster Stand (10 Tests): Summe der Testzeiten 139 s. Die frühere Angabe „Testphase rund 70 s Wandzeit“ ist nicht reproduziert und gilt nicht mehr.
- Mit der Rolle Beschäftigte (12 Tests): Summe der Testzeiten 165 s. Die zwei neuen Tests brauchen zusammen 31 s (hell 12 s, dunkel 19 s).
- CI (Job `browser-abnahme`): Der Zuwachs steht in der PR-Beschreibung (Vergleich mit der Basis). Die Testphase ist dort nicht getrennt gemessen.

Die Anmeldung ist der größte Posten; deshalb gibt es je Thema nur eine Anmeldung je Rolle, die Breite wechselt im selben Lauf.
