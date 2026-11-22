# WP-40 Browser-Abnahme: Befunde

Stand: 2026-11-12, Basis `integration/release-v4` (6c195b66), Branch `feature/wp40-browser-abnahme`.
Messung: `node pruefungen/browser/wcag-wp40.mjs` (Edge, `WCAG_KANAL=msedge`), lokaler Server auf 127.0.0.1, erfundener Demo-Bestand, Wegwerfdaten.
Bewertungslogik ohne Browser: `pruefungen/wcag-wp40.test.js` (in `npm run pruefung` und in der CI).
Gemessen: Rollen mitarbeiter, planer, leitung, subplaner; Breiten 320, 360, 390, 768 CSS-px; je Rolle vier bzw. fünf Kernansichten (wie Gerätematrix WP-21), insgesamt 76 Ansichten.

## Ergebnis nach Kriterium

| Kriterium | Ergebnis | Beleg |
|---|---|---|
| 1.4.10 Reflow | bestanden: in 76 von 76 Ansichten ist die Seite nicht breiter als das Fenster (320, 360, 390, 768). Keine Befunde. | Lauf 1 |
| 1.4.10 Rollbereiche | 27 Meldungen "Rollbereich mit overflow-x", ausschließlich Datentabellen (`div.scrollbereich`: Personal, Personaleinsatz, Rollen und Rechte, Abrechnungsdaten, Schichtfolge) und die Schnellfilter `div.seg` (Mein Plan, Mehr, Personaleinsatz). Die Seite selbst scrollt nicht quer. Zulässig nach der Ausnahme "Datentabellen". | Lauf 1, Hinweise `reflow-rollbereich` |
| 2.5.8 Zielgröße | bestanden: in 76 von 76 Ansichten ist jedes bedienbare Ziel mindestens 24 x 24 px oder durch die Abstandsausnahme erfüllt. Keine Befunde. | Lauf 1 |
| 2.4.11 Fokus nicht verdeckt | **Befund, behoben** (siehe unten): vor der Korrektur 35 Befunde (31 echte Verdeckungen unter der festen unteren Leiste, 4 Messartefakte des Sprunglinks). Nach der Korrektur siehe Abschnitt "Nachmessung". | Läufe 1 und 2 |
| 3.3.1 Fehlertext | Krankmeldung (alle Rollen), Antrag (Telefon), Person hinzufügen (planer, leitung): Text in `role="alert"`, mit dem Feld per `aria-describedby` verbunden, 31 von 31 geprüften Fällen bestanden. Stempel-Absage: Text in der Live-Region, kein Feld. Korrektur: offener Befund 2 (Hinweis, kein Fehlschlag). | Lauf 1 |

## Behoben (kleine, lokale Korrekturen)

### B1 (2.4.11) Fokus unter fester unterer Leiste

- Betroffen: Telefonansicht (`nav.m-tabs`, Reiter unten) und Rechneransicht bis 1024 px (`nav.tabbar`, Leiste unten).
- Gemessen vor der Korrektur: Mitarbeit "Mehr" (Wunschdienste, Nachweise, Kalender abonnieren, Abmelden, Rechneransicht); Planung, Leitung, Schichtverantwortung: Monatsplan (Standortkarte), Anträge (Mitzeichnen, Ablehnen), Personal (Namenssuche, Filter Springerpool/Ausgetreten), Betrieb (Eingabefelder, Vorschau), Meine Schichten (Wie geplant, Abweichend), Lagebild (Achtungszeilen). Das fokussierte Element lag beim Tabben ganz unter der festen Leiste, weil der Browser nur bis an den Bildrand rollte.
- Korrektur: `scroll-padding-bottom` (und `scroll-padding-top` bei `.m-tabs`) auf `html`, abhängig von der vorhandenen Leiste (`html:has(.m-tabs)`, `html:has(.tabbar)` bis 1024 px), in `src/gestalt/stil.js`. Keine Änderung an Layout oder Größe der Leisten.
- Die Messung hat keine echten Geräte; Safari auf iOS rollt Fokus anders. Offen bleibt die Prüfung auf Gerät (siehe `docs/acc45/WP-21-GERAETEMATRIX.md`).

### B2 (3.3.1) Fehlertext nicht mit dem Feld verbunden

- Krankmeldung (`src/ansichten/krankmeldung.jsx`) und Antrag auf dem Telefon (`src/ansichten/mobil.jsx`, `Fehlerband`): die Meldung war `role="alert"` ohne Kennung, die Felder verwiesen nicht darauf.
- Korrektur: Meldung mit `id` (`krank-fehler`, `antrag-fehler`), Felder Von und Bis mit `aria-describedby`, Bis mit `aria-invalid`. `Fehlerband` nimmt eine optionale `id`.
- "Person hinzufügen" war schon verbunden und wird jetzt durch Test und Browserlauf belegt.

## Offen (größer, nicht in diesem Paket)

### Befund 1: Messartefakt Sprunglink (kein Produktfehler)

Der Sprunglink "Zum Inhalt springen" liegt beim Fokus über der Kopfzeile. Die erste Messung zählte ihn als verdeckt (4 Fälle, Tauschbörse, subplaner); die Messung prüft jetzt die Stapelreihenfolge (`elementFromPoint`) und zählt nur Überlagerungen, die tatsächlich obenauf liegen.

### Befund 2: Korrektur beantragen, Absenden ohne Erklärung (3.3.1 / 3.3.3)

- Element: Formular "Korrektur beantragen" (`ZeitFormular` in `src/ansichten/korrekturen.jsx`), Telefonansicht "Heute" (Mitarbeit); gleiches Formular in Prioritäten und Tagesstart.
- Messung: bei Grund unter 10 Zeichen ist die Schaltfläche "Antrag stellen" nur deaktiviert; es gibt keinen Text, der sagt, warum, und keine Verbindung zum Feld (nur der Platzhalter "Grund (mindestens 10 Zeichen)"). Gemessen bei 320, 360, 390.
- Einordnung: 3.3.1 verlangt Text, wenn ein Fehler erkannt wird; hier wird die Eingabe verhindert statt gemeldet. Nach 3.3.3 (AA) sollte der Fehler beschrieben werden. Als Hinweis geführt, nicht als Fehlschlag.
- Vorschlag: bei nicht gültiger Eingabe unter dem Formular einen Hinweis mit `id` ("Bitte einen Grund mit mindestens 10 Zeichen angeben.") anzeigen, Felder per `aria-describedby` und `aria-invalid` verbinden, Schaltfläche nicht deaktivieren, sondern beim Absenden den Hinweis zeigen. Textentscheidung beim Produkt (Frage 2 in `wp40-fragen.md`).

### Befund 3: Stempel-Absage ist ein vorübergehender Streifen

- Element: Meldungsstreifen "Stempel abgelehnt: …" (`role="status"`, nicht an ein Feld gebunden).
- Messung: Text sichtbar, in der Live-Region, im Bild; kein Feld, das zu verbinden wäre. Bestanden. Der Streifen verschwindet nach 3 s (`melde`); 2.2.1 (Zeitbegrenzung) ist hier nicht Teil von WP-40; die dauerhafte Anzeige "Erneut senden / Zur Kenntnis" bleibt stehen.

## Nicht geprüft

- Mitarbeit bei 768 px: Stempel (Absage) und Korrektur: Zeitüberschreitung beim Klick auf "Einstempeln" (Ursache nicht untersucht). Bei 320, 360 und 390 geprüft.
- Weitere Ansichten außer den fünf je Rolle, andere Rollen (Betriebsrat, Betreiber), 1.4.12 Textabstand, 200 % Zoom, Vorlesesoftware, axe, Safari und echte Geräte.
- Die Tab-Folge umfasst je Ansicht die ersten 18 Tab-Stopps ab Seitenanfang, nicht alle Steuerelemente.

## Nachmessung nach der Korrektur

Lauf 2 (nur Kriterium Fokus, neuer Bau mit der Korrektur B1, geschärfte Messung): 76 Ansichten, 0 Befunde, 0 Hinweise, nichts nicht geprüft, Exit 0. Die übrigen Kriterien wurden nicht erneut gemessen (die Korrektur betrifft nur Rollabstände der Seite); ihre Ergebnisse stehen aus Lauf 1. Eine vollständige Messung aller vier Kriterien in einem Lauf nach der Korrektur steht aus. Zusammenfassung: Abschnitt "Browser-Abnahme" in `docs/acc45/wp40-nachweis.md`.

## Nachmessung 2026-11-22 (Basis `integration/release-v4` 39e0b436, Branch `acc45/a11y/wp-40-browserabnahme`)

Messung lokal, Chromium (Playwright 1.65.1), Wegwerfdaten, ein Arbeiter. Drei Messwege: die Suite `e2e/wcag-320.spec.mjs` (neu), das Skript
`pruefungen/browser/wcag-wp40.mjs` bei 320 px und der Bereichs-Sweep `pruefungen/browser/bereiche.mjs` (Leitung, 320 px).

### Was die CI schon prüft (Iststand)

| Prüfung | Wo | Deckt von WP-40 |
|---|---|---|
| axe (WCAG 2.2 AA, serious/critical) an 8 Viewports (360 bis 1024 und Telefone quer) | Job `browser-abnahme`: `e2e/barrierefreiheit.spec.mjs`, `e2e/barrierefreiheit-flaechen.spec.mjs`; Ausnahmeliste `e2e/axe-ausnahmen.json` ist leer | Kontrast 1.4.3/1.4.11, Namen 2.5.3/4.1.2, Zielgröße 2.5.8 (axe `target-size`) auf den geprüften Flächen |
| Quelltext und Render: Bewertungslogik, Fehlertext-Markup | `pruefungen/wcag-wp40.test.js` (Kette `pruefung`) | 2.4.11, 3.3.1, 1.4.10, 2.5.8 nur als Bewertungsfunktion |
| Browser-Messung 320/360/390/768 px (Reflow, Zielgröße, Fokus, Fehlertext) | `pruefungen/browser/wcag-wp40.mjs`: nur von Hand, nicht in der CI | alle vier Kriterien, aber nicht automatisch |

Lücke vorher: Die CI misst nie bei 320 px (kleinster Viewport 360 px); Reflow 1.4.10 und die Schublade (2.4.11) waren nur per Hand gemessen.

### Ergebnis je Kriterium

| Kriterium | Ergebnis | Beleg |
|---|---|---|
| 1.4.10 Reflow, Leitung, alle 44 Ansichten der Schublade, 320 px | **Befund, behoben**: vorher Ansicht Verteilung 26 px Querscroll (Seite 346 px bei 320 px Fenster); nachher 0 Befunde in 44 von 44 Ansichten. | `e2e/wcag-320.spec.mjs` (rot vorher, grün nachher); Ursache siehe B3 |
| 2.4.11 Tab-Stopps in geschlossener Schublade, Leitung, 320 px | bestanden: 40 Tab-Schritte, kein Fokus in `.seitenleiste` (geschlossen). Die frühere Meldung ist seit `visibility:hidden` (`src/ui/geraete.js`) behoben. | `e2e/wcag-320.spec.mjs`; zusätzlich `wcag-wp40.mjs`: Fokus verdeckt 0 Befunde |
| 2.4.11 Fokus nicht verdeckt, alle vier Rollen, 320 px, 19 Ansichten | bestanden (18 Tab-Stopps je Ansicht, keines ganz verdeckt) | `wcag-wp40.mjs` (WCAG_BREITEN=320) |
| 2.5.8 Zielgröße, alle vier Rollen, 320 px, 19 Ansichten | bestanden (alle Ziele 24 px oder durch Abstand ausgenommen) | `wcag-wp40.mjs` |
| 3.3.1 Fehlertext, 320 px (Krankmeldung, Person hinzufügen, Antrag) | bestanden (Text sichtbar, per `aria-describedby` verbunden); Korrektur beantragen bleibt Hinweis (Befund 2) | `wcag-wp40.mjs`: 19 Ansichten, 0 Befunde, 9 Hinweise (8 Rollbereiche und Schnellfilter, 1 Korrektur), nichts nicht geprüft |
| 1.4.10 Rollbereiche | unverändert zulässig: Datentabellen (`div.scrollbereich`: Personal, Rollen und Rechte, Schichtfolge, Personaleinsatz) und Schnellfilter `div.seg` | `wcag-wp40.mjs`, Hinweise `reflow-rollbereich` |

### B3 (1.4.10) Überschrift ragt über den Rand (Verteilung)

- Ursache (gemessen): `h1.titel` ("Belastungsverteilung", 38 px, Gewicht 300; Regel in `src/App.jsx`, dort nicht geändert) ist 336 px breit bei 310 px Platz; das Wort ist unteilbar, der Text ragt über den Rand, `scrollWidth` von `.sw-root` ist 346 statt 320. Die frühere Vermutung "Schublade/Verteilung" traf also die Ansicht Verteilung, nicht die Schublade.
- Verworfene Vermutung: das Diagramm-Raster `repeat(auto-fit,minmax(280px,1fr))` in `src/ansichten/verteilung.jsx`. Die Änderung auf `minmax(min(280px,100%),1fr)` ließ den Test rot (26 px blieben); sie wurde zurückgenommen.
- Korrektur: `h1.titel{overflow-wrap:break-word; hyphens:auto;}` in `geraeteStil()` (`src/ui/geraete.js`, wird nach den App-Regeln eingebunden). Kurze Wörter bleiben unverändert; zu lange brechen (mit Trennung, wo `lang="de"` sie kennt).
- Wirkung: nachher 0 px Querscroll in allen 44 Ansichten. Mutation: ohne die Regel bleibt der Test rot (Lauf mit nur der Rasteränderung: Verteilung 26 px).
- Test: `e2e/wcag-320.spec.mjs` (CI-Job `browser-abnahme`, Projekt 360x740 setzt die Breite selbst auf 320 px) und `pruefungen/wcag-wp40.test.js` (Quelltext der Regel).

### Beobachtung, kein Befund nach WCAG

- Der Sweep `bereiche.mjs` meldet bei 320 px "Schublade/Personaleinsatz: 27 Bedienelemente kleiner als 40 px". Das ist eine eigene Heuristik (40 px) des Sweeps, strenger als WCAG 2.5.8 (24 px). `wcag-wp40.mjs` und axe `target-size` finden keinen Verstoß. Keine Änderung; Entscheidung Design, falls 40 px Hausstandard werden soll.

### Weiterhin offen (nicht Teil dieser Nachmessung)

1.4.12 Textabstand, 200 % Zoom, Screenreader, Safari/echte Geräte, `wcag-wp40.mjs` läuft weiter nur von Hand (nicht in der CI); Betriebsrat und Betreiber nicht gemessen; Mitarbeit bei 768 px, Befund 2 (Korrektur beantragen: Texthinweis, Produktentscheidung). Die Browser-Abnahme ist damit nicht vollständig, ein unabhängiges Review liegt nicht vor; der Status bleibt IN_PROGRESS.
