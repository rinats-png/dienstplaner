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
