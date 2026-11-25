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
| Heute, Mein Plan, Anliegen (Urlaub, Krank, Tausch), Mehr (Profil) | Beschäftigte | ja (Verlauf aus, siehe Grenzen) | ja | ja | ja | ja |

Die Beschäftigten (Schichtdienst) sehen immer die Telefonschale mit vier Reitern (`zeigeMobil` in `src/App.jsx`). Sie wird bei 375 px und bei 1024 px (Umbruch der Seitenleiste, `UMBRUCH.seitenleiste`) geprüft, im selben Lauf je Thema. Die Rechneransicht der Beschäftigten (Umschalter in „Mehr“) ist nicht Teil dieser Prüfung. Die Leitung bleibt bei 375 und 1280 px; 1024 px gibt es für sie nicht.

Die Prüfungen:

- Kontrast: axe-Regel `color-contrast` (WCAG 1.4.3), jeder Fund zählt. Je Fläche müssen mehr als null Knoten bewertet sein (Verstöße plus bestanden); sonst ist der Fund „keine Knoten bewertet“ und die Fläche ist rot.
- Bildlauf: Die Seite hat keine waagerechte Bildlaufleiste (`scrollWidth <= clientWidth`).
- Außerhalb: Kein Hauptelement (Knöpfe, Felder, Überschriften, Karten, Navigation) liegt außerhalb der Breite, außer in einer waagerecht klemmenden oder blätternden Fläche (Plantabelle; siehe Grenzen).
- Abgeschnitten: Kein Element mit `overflow: hidden` schneidet Text ab, außer mit Auslassungspunkten.
- Überlappung: Bedienbare Elemente überlappen sich nicht. Elemente unter festen oder klebenden Leisten und in Bildlaufflächen zählen nicht.
- Fokus: Je Ansicht drei gezielte Elemente: das erste bedienbare Element, das erste im Hauptinhalt (`main`, nicht in einer festen oder klebenden Leiste) und das letzte. Umriss oder Schatten sichtbar, Kontrast >= 3:1 gegen die Fläche dahinter (WCAG 1.4.11).
- Selbsttest (Mutation, bei jedem Lauf): Auf der Anmeldeseite wird je Prüfung ein Fehler eingebaut (blasser Text, breites Element, Knopf außerhalb, abgeschnittene Karte, überlappende Knöpfe, Fokusring entfernt). Die Prüfung muss anschlagen. Außerdem muss die Ausgangslage sauber sein.

Beleg der Mutation (lokal, 2026-11-25): Mit abgeschalteter Kontrastprüfung bzw. abgeschalteter Überlappungsprüfung wird der Selbsttest rot („Prüfung kontrast muss anschlagen, fand []“, ebenso `ueberlappung`).

## Befunde

### B1 Planzelle Zusatzzeile hell (behoben in V4-3d-B1)

Befund: Dienstplan (Monatsplan), Leitung, Desktop 1280 px, hell: Die Zusatzzeile (`.unten`) der Planzellen in Nachtdienst- und Spätdienstfarbe hatte 4,0 bis 4,3:1 gegen die Zellenfläche (Nachtdienst #7c3aed auf #dad8e4 = 4,04:1; Spätdienst #b03a0a auf #d7d9ce = 4,25:1); gefordert sind 4,5:1 (WCAG 1.4.3, Schrift 14,5 px, nicht fett). Dunkel bestand, Telefon (375 px) meldete hier nichts.

Ursache: Die Zelle `Planzelle` (`src/ui/bausteine.jsx`) legt `${da.farbe}1C` (Deckkraft 28/255) über die Zellenfläche und setzte die Schrift in `lesbar(da.farbe, 5.4)`; `lesbar` lässt die Farbe im hellen Erscheinungsbild unverändert. Die Mischfläche ist je nach Zelle dunkler als die Karte: Wochenende und Feiertag (`flaecheStill`) und der heutige Tag (`accentLight`) sind die schwächsten Flächen. Die Nachrechnung über alle Dienstfarben zeigte: Nicht nur Nacht und Spät, sondern acht von neun Dienstfarben lagen im hellen Erscheinungsbild auf mindestens einer Zellenfläche unter 4,5:1 (kleinster Wert Nacht auf Heute 4,01:1); nur Früh (#1D4ED8) trug überall (4,72:1). Die Schrift der ganzen Zelle (Kurzzeichen `.oben` und Zusatzzeile `.unten`) erbt dieselbe Farbe; beide waren betroffen.

Behebung: `planzellenSchrift` (`src/ui/bausteine.jsx`, nutzt nur `kontrastVon` aus `src/gestalt/lesbar.js`; `thema.js` und `lesbar.js` bleiben unberührt) dunkelt die Dienstfarbe im hellen Erscheinungsbild in 2-%-Schritten zum Schwarz hin ab, bis sie auf der Tönung (Mischung mit gerundeten Kanalwerten wie im Browser) über jeder Zellenfläche des Plans (Karte, Grund, Wochenende/Feiertag, Heute) mindestens 4,55:1 erreicht (Reserve gegen Rundung im Browser; gefordert bleiben 4,5:1). Eine Farbe, die schon trägt, bleibt unverändert (Früh). Dunkel bleibt `lesbar(farbe, 5,4)`. Hintergrund (Tönung), Dienstdaten und alle anderen Flächen bleiben unverändert. Werte (schwächste Zellenfläche, vorher auf nachher, mit der echten Funktion gerechnet): Nacht #7C3AED 4,01 auf 4,57 (Schrift #7235da); Spät #B03A0A 4,26 auf 4,67 (#a53709); Posten und 24-Stunden-Dienst #2C6B63 4,43 auf 4,56 (#2b6961); Zwischendienst #446F0D 4,25 auf 4,68 (#40680c); Rufbereitschaft #8A5309 4,49 auf 4,64 (#875109); #017070 4,20 auf 4,62 (#016969); #955410 4,20 auf 4,61 (#8c4f0f); #316C81 4,19 auf 4,57 (#2e6679); Früh #1D4ED8 4,72 unverändert. Hinweis: Mit ungerundeter Mischung statt gerundeter wäre #2b6961 bei 4,547:1 und fiele durch die Reserve; der Browser und der Prüfsatz rechnen mit gerundeten Kanalwerten. „Acht von neun Dienstfarben“ ist über den Quelltext-Scan definiert (jede `farbe: "#…"` in `src/lib/fachlogik.js` und `src/lib/mandant-anlage.js`, ohne die Nicht-Dienstfarben #0369A1, #2E6B4F, #8A5A00); es ist keine Aussage über alle denkbaren Betriebsfarben. Prüfsatz: `pruefungen/kontrast.test.js` (Abschnitt V4-3d-B1) rendert die echte Zelle und prüft jede Dienstfarbe hell und dunkel gegen alle vier Flächen. Der Eintrag B1 in `VISUELL_BEKANNT` (`e2e/v4-visuell.mjs`) ist entfernt; die Liste ist leer.

Folgepakete aus B1 (nicht umgesetzt): (1) `src/ansichten/wunschdienste.jsx` Zeile 118 (gleiche Technik: Tönung 1C mit Schrift in Tönungsfarbe; erst die tatsächliche Zellenfläche prüfen), Priorität P2. (2) Palettenfarbe #878C93 (3,35:1 auf der Karte): klären, ob sie als Schrift oder nur als Fläche/Kante dient; bis dahin SPAETER-PRODUKT. (3) Kontrastmessung der Glas-Karte über dem Verlauf, P2. (4) Optionaler Prüfsatz „nicht dunkler als nötig“ (Abstand der abgedunkelten Farbe von der Dienstfarbe höchstens 10 % für Nacht und Spät): Ein Fehlbau mit 20 % statt 2 % Schritt überlebt den heutigen Prüfsatz.

Stand: Die Spec findet keinen echten Befund an der App mehr. Bildlauf, Außerhalb, Abschneiden, Überlappung und Fokus bestehen in allen geprüften Ansichten, Breiten und Themen; Kontrast besteht dort, wo axe Knoten bewertet (siehe Grenzen). `VISUELL_BEKANNT` in `e2e/v4-visuell.mjs` ist leer. Der erste Lauf von PR #538 (10 Tests) meldete "kein Befund"; das galt für den Kontrast auf angemeldeten Flächen nicht, weil axe dort keinen Knoten bewertete.

Zwei Messfehler im ersten Entwurf (kein App-Fehler, im Test behoben):

1. Anmeldung hell, Kontrast 2,23:1 auf einem `aria-hidden`-Element: Das war die Wortmarke der Startsequenz mitten in der Einblendung. Die Spec misst erst, wenn die Startsequenz (`[aria-label="CENTRIC wird gestartet"]`) weg ist.
2. Fokusring 1,08:1 auf der Konto-Taste: Der Umriss blendet von `currentColor` zur Fokusfarbe über; der erste Messwert war ein Zwischenbild. Die Spec schaltet Übergänge für die Messung ab (wie `e2e/v4-seitenleiste-kontrast.spec.mjs`). Im Ruhebild ist die Fokusfarbe `--v4-focus` (hell `#ac670e`, dunkel `#ffd77b`).

## Grenzen (ehrlich)

- Kontrast auf angemeldeten Flächen: Ohne Eingriff meldete axe dort überwiegend „incomplete“ (Hintergrund nicht bestimmbar wegen eines Pseudoelements, `.inhalt::before` und `.m-schale::before`) und bewertete keinen Knoten; ein grünes Ergebnis belegte nichts. Der erste Stand (PR #538 und die erste Fassung dieser Folge) hatte diese Lücke für Leitung und Beschäftigte. Jetzt blendet die Spec für die Messung die beiden Verlaufs-Pseudoelemente aus (die App kennt denselben Zustand als Einstellung, Feldmodus und `kein-verlauf`), zählt die bewerteten Knoten und verlangt mehr als null je Fläche. Gemessen wird damit gegen die Grundfläche, nicht gegen den Verlauf; ein Text, der nur auf dem Verlauf zu blass wäre, bleibt unentdeckt. Der Verlauf ist für den Kontrast nicht bloß Zierde: Eine Rechnung des Reviewers (keine Browsermessung) ergibt hell für Text in der Farbe "aus" (#566e72) 4,85 statt 3,8 auf dem Verlauf, für die Planzelle Nachtdienst 4,35 statt 3,45 und Spätdienst 4,61 statt 3,66. Die Farben "text", "dim" und "accent" bleiben auch auf dem Verlauf über 4,5. Texte in "aus" oder Zellen in der Titelzone, die der Verlauf bedeckt, würden von der Ausblendung verdeckt; das ist Absicht des Entwurfs, nicht erzwungen. Folgepaket: Messung mit Verlauf. Der Selbsttest hat eine Kontrast-Mutation auf einer angemeldeten Fläche (Beschäftigte, 375 px, hell).
- Der Wächtertest der Fokusauswahl in `pruefungen/v4-visuell-qa.test.js` ist ein Textwächter (er sucht Zeichenfolgen im Code). Das Verhalten beweist der Selbsttest in der Spec: Mit fester Kopfleiste vor einem `<main>` trifft die Auswahl „haupt“ ein Element in `main` und keines in der Leiste.
- „erstes“ und „letztes“ wiederholen sich je Fläche (erstes meist die Mitteilungen in der Kopfleiste, letztes der Reiter „Mehr“); nur „haupt“ ist je Reiter ein eigenes Element. Folgepaket-Gedanke: statt „letztes“ das letzte Element im `main`.

- Die Fokusprüfung ist eine gezielte Auswahl (drei Elemente je Ansicht), keine vollständige Tabulatorfolge.
- Die Überlappungsprüfung nimmt feste und klebende Leisten sowie Bildlaufflächen aus. Ein Fehler dort bleibt unentdeckt.
- Die Prüfungen „außerhalb“ und „Überlappung“ nehmen Elemente aus, deren Vorfahr waagerecht klemmt (`overflow-x` hidden, clip, auto oder scroll, mit `scrollWidth > clientWidth`). Ein Knopf, der sauber in einem solchen Behälter verschwindet, bleibt unentdeckt. Die Prüfung „abgeschnitten“ deckt nur Text im klemmenden Element selbst.
- Es werden die Leitung (Kundenseite), die Beschäftigten (Telefonschale) und die Betreiberrolle geprüft; Planung, Schichtverantwortung und Betriebsrat haben die Kontrast- und Fokusprüfung nur über `e2e/barrierefreiheit.spec.mjs` (Standardthema).
- Keine Tablet-Breiten für Leitung und Betreiber (768 px; 1024 px nur bei den Beschäftigten) und kein Querformat; die acht Gerätebreiten bleiben bei den bestehenden axe-Specs.
- Die Token-Nutzung im Quelltext (keine harten Farben) sichern weiter `pruefung:v4-tokens` und `pruefungen/v4-3b-*.test.js`; hier gibt es dazu keine eigene Prüfung. `v4-variablen.spec.mjs` sichert die Variablen je Thema.
- V4-3d (Rest-Farb- und Formwerte) ist offen (Betreiberentscheidung in `ENTSCHEIDUNGSLISTE.md`); diese QA nimmt keine Entscheidung vorweg.
- Die Zahl der Anmeldungen je Lauf ist klein (zwei Leitung, zwei Beschäftigte, zwei Betreiber); die Lastbremse „anmelden-code“ (20 je 300 s und Code) ist unkritisch.

## Laufzeit

Messweise: lokal (Windows, 2 Arbeiter), Summe der Testzeiten laut Playwright-Liste und Beobachtung des Reviewers, 2026-11-25. Die Werte schwanken stark mit der Last der Maschine; sie sind Größenordnungen, keine Zusagen.

- Zwei neue Tests (Beschäftigte hell und dunkel): lokal Größenordnung +30 bis 45 s Summe (gemessen 31 s und 43 s). Die frühere Angabe „Testphase rund 70 s Wandzeit“ und die Summen 139 s und 165 s sind nicht bestätigt und gelten nicht als Wert. Ein Lauf des Reviewers mit 12 Tests brauchte für die Testphase rund 3,5 min (Summe etwa 225 s).
- Mit Verlaufsausblendung und Kontrastzählung: Messung siehe PR-Beschreibung; der Zusatz je Fläche liegt im Millisekundenbereich, ein weiterer Test (Mutation auf angemeldeter Fläche) kommt hinzu (eine Anmeldung, rund 10 s).
- CI (Job `browser-abnahme`): im Rauschen der Läufe (etwa ±2,5 min), kein messbarer Zuwachs. Die Testphase ist dort nicht getrennt gemessen.

Die Anmeldung ist der größte Posten; deshalb gibt es je Thema nur eine Anmeldung je Rolle, die Breite wechselt im selben Lauf.

## Folgepakete (nicht in diesem PR)

- 1024 px für die Leitung (Schubladen-Navigation, geschätzt +45 s in der CI): nach Prüfung der Kontrastbefunde (B1 behoben).
- Rechneransicht der Beschäftigten (Umschalter in „Mehr“; ein Lauf, nur 1280 px): kleines Paket.
- Messung des Kontrasts mit eingeblendetem Verlauf (Titelzone).
