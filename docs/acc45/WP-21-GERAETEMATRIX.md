# WP-21 Gerätematrix: Smartphone und Tablet für alle Rollen (Teil 1 und 2)

Teil 1 (Abschnitte 1 bis 8): Bildschirme. Teil 2 (Abschnitt 9): Bedienabläufe, Querformat, Tastatur, Hinweis „Für Tablet und Rechner ausgelegt“.

Stand: Branch `feature/wp-21-smartphone-s1` (Basis `origin/integration/release-v4`, 163dc491).
Akzeptanz laut `docs/acc45/work-packages.json`: „Kernaufgaben je Rolle ohne Querscrollen 360/390/430 px; Gerätematrix“. Prüfung dort: „Playwright-Viewports, Geräte“.
Dieser Teil liefert die Matrix, die Messung und die Korrekturen mit der größten Wirkung. WP-21 ist damit **nicht erledigt** (siehe Abschnitt 7).

## 1 Rollen und Kernaufgaben

Die Rollen stammen aus `src/lib/rollen.js` (ROLLEN) und `RECHTEMATRIX.md`. Eine eigene Kundenrolle gibt es im Code nicht: „Kunde“ ist der Betrieb (Mandant); die Rolle `kunde` ist nur ein älterer Zugangscode und wird wie die Leitung behandelt (`RECHTEMATRIX.md`, Abschnitt 1). Die Kundensicht ist damit die der Organisationsleitung.

| Rolle (Id) | Fachbegriff | Oberfläche auf kleinen Geräten | Kernaufgaben (3 bis 5) |
|---|---|---|---|
| Mitarbeiter (`mitarbeiter`) | Beschäftigte | eigene Telefonansicht `MobilSchale` mit Reitern Heute, Mein Plan, Anliegen, Mehr; gilt für Beschäftigte im Schichtdienst auf jeder Breite | stempeln (Heute); eigenen Plan sehen (Mein Plan); Abwesenheit, Tausch, Wunsch beantragen (Anliegen, Blatt „Frei beantragen“); Konto und Einstellungen (Mehr) |
| Sub-Planer (`subplaner`) | Schichtverantwortung | Rechneransicht mit Seitenleiste als Schublade (bis 1024 px) und Leiste unten (Schichten, Anträge, Lage, Post, Krank) | eigene Schichten; Lagebild; Anträge entscheiden; Personaleinsatz der eigenen Einheit lesen; Tauschbörse |
| Planer (`planer`) | Planung | wie oben | Monatsplan planen und freigeben; Personaleinsatz; Anträge; Prüfung; Personal |
| Organisationsleitung (`leitung`) | Leitung, Kundenrolle | wie oben | Monatsplan; Anträge; Personal; Abrechnungsdaten; Betrieb (Einrichtung, Rechte) |
| Betriebsrat (`betriebsrat`) | Mitbestimmung, rein lesend | wie oben | Monatsplan lesen; Prüfung; Auswertung (Betriebsrat); Hilfe |
| Betreiber (`betreiber`) | Plattformbetrieb | Betreiberkonsole (Rechneransicht) | Mandanten; Rechnungen; Tarife |

## 2 Viewport-Matrix

| Gerät | Viewport (Breite x Höhe, CSS-px) | Bemerkung |
|---|---|---|
| Telefon klein | 360x740 | Hochformat |
| Telefon mittel | 390x844 | Hochformat |
| Telefon groß | 430x932 | Hochformat |
| Tablet hoch | 768x1024 | unter 820 px zeigt die Anwendung auf Ansichten außerhalb der Telefonliste den Hinweis „Für Tablet und Rechner ausgelegt“ |
| Tablet quer | 1024x768 | Seitenleiste als Schublade (Umbruch bei 1024 px) |

Die Zahlen stehen als Quelle in `src/ui/geraete.js` (`GERAETE_VIEWPORTS`, `UMBRUCH`, `ZIEL_MINDEST`); Skript und Test lesen sie von dort. Rechnerbreite (1280x800) wird nur als Regressionsprobe mitgeführt (Abschnitt 5).

## 3 Messverfahren (`pruefungen/browser/geraete-wp21.mjs`)

Lokal und von Hand, nicht Teil von CI: `npx vite build` und danach `npm run pruefung:geraete-browser`. Wegwerf-Server auf 127.0.0.1 mit Zufallsschlüssel und frischem Datenordner, Demo-Betrieb mit erfundenen Namen (86 Personen), keine echten Daten, keine Zugangsdatei der Staging-Umgebung. Browser: gebündeltes Playwright-Chromium (playwright-core 1.64.1), Viewport-Emulation mit Touch; keine echten Geräte.

Je Rolle, Viewport und Kernaufgabe:

1. Seite ohne Querscrollen: `document.documentElement.scrollWidth` und `document.body.scrollWidth` höchstens `window.innerWidth`.
2. Bereiche mit eigenem Querscroll (`overflow-x` auto oder scroll, Inhalt breiter als der Bereich) werden gezählt und benannt.
3. Zielgröße nach WCAG 2.5.8: sichtbare bedienbare Elemente (Schaltflächen, Links, Eingaben, Rollen button, tab, switch, checkbox, Fokusziele) mindestens 24x24 px; ein kleineres Ziel gilt als erfüllt, wenn sein 24-px-Kreis kein anderes Ziel berührt (Ausnahme „Abstand“); Satzlinks (inline) sind ausgenommen.
4. Hauptnavigation erreichbar: Telefonansicht: Leiste unten mit vier Reitern vollständig im Bild und mindestens 24 px; Rechneransicht bis 1024 px: Menütaste öffnet die Seitenleiste, die Seitenleiste lässt sich ohne Auswahl eines Eintrags wieder schließen (Abdunkelung, Escape oder freie Menütaste).
5. Merker „H“: die Seite zeigt „Für Tablet und Rechner ausgelegt“.

Nicht gemessen: Tastaturbedienung im Einzelnen, Vorlesesoftware, Textvergrößerung, Dialoge der Planungsansichten, echte Geräte (Safari, Android), Querformat der Telefone, Sicherheitsbereiche (Notch). Diese Punkte stehen als „noch nicht geprüft“.

Statuswörter in den Tabellen: **ok** = bereits ohne Querscrollen (Seite und innen); **B-i (n)** = Befund: Seite ohne Querscrollen, aber n Bereiche mit eigenem Querscroll; **Zn** = n Ziele unter 24 px; **H** = Hinweis „Für Tablet und Rechner ausgelegt“ sichtbar; **n.g.** = noch nicht geprüft. Eine Seite mit Querscrollen (Befund an der Seitenbreite) kam in keiner Zeile vor.

## 4 Messergebnis (Stand nach den Korrekturen dieses Teils)

Letzter vollständiger Lauf: 165 Zeilen (6 Rollen, 5 Viewports; je Rolle und Viewport die Hauptnavigation plus 3 bis 5 Kernaufgaben, zusammen 135 Aufgabenansichten).

| Messgröße | vor den Korrekturen | nach den Korrekturen |
|---|---|---|
| Aufgabenansichten mit Seite quer (scrollWidth größer als Fenster) | 0 von 135 | 0 von 135 |
| Hauptnavigation ohne Befund | 5 von 30 (nur die Telefonansicht der Beschäftigten; alle 25 Kombinationen der Rechneransicht: Seitenleiste nach dem Öffnen nicht schließbar) | 30 von 30 |
| Ansichten mit Zielen unter 24 px (nach Ausnahme „Abstand“) | 20 von 135 | 0 von 135 |
| Ansichten mit mindestens einem Bereich mit eigenem Querscroll | 44 von 135 | 38 von 135 (die Tabellen davon mit Fokus, Namen und Hinweis) |
| Ansichten mit Hinweis „Für Tablet und Rechner ausgelegt“ | 52 von 135 | 52 von 135 (unverändert, Abschnitt 6) |

### Ergebnis je Rolle, Kernaufgabe und Viewport (nach den Korrekturen)

#### Mitarbeiter (Beschäftigte, Telefonansicht)

| Kernaufgabe (Ansicht) | 360x740 | 390x844 | 430x932 | 768x1024 | 1024x768 |
|---|---|---|---|---|---|
| Heute: stempeln | ok | ok | ok | ok | ok |
| Mein Plan | B-i (1) | B-i (1) | B-i (1) | ok | ok |
| Anliegen: Abwesenheit, Tausch, Wunsch | ok | ok | ok | ok | ok |
| Antrag stellen (Blatt) | ok | ok | ok | ok | ok |
| Mehr: Konto, Einstellungen | ok | ok | ok | ok | ok |

#### Sub-Planer (Schichtverantwortung)

| Kernaufgabe (Ansicht) | 360x740 | 390x844 | 430x932 | 768x1024 | 1024x768 |
|---|---|---|---|---|---|
| Meine Schichten | ok | ok | ok | ok | ok |
| Lagebild | B-i (1) | B-i (1) | B-i (1) | B-i (1) | ok |
| Anträge entscheiden | ok | ok | ok | ok | ok |
| Personaleinsatz lesen | B-i (1) + H | B-i (1) + H | B-i (1) + H | B-i (1) + H | B-i (1) |
| Tauschbörse | ok + H | ok + H | ok + H | ok + H | ok |

#### Planer (Planung)

| Kernaufgabe (Ansicht) | 360x740 | 390x844 | 430x932 | 768x1024 | 1024x768 |
|---|---|---|---|---|---|
| Monatsplan (planen, freigeben) | ok | ok | ok | ok | B-i (1) |
| Personaleinsatz | B-i (1) + H | B-i (1) + H | B-i (1) + H | B-i (1) + H | B-i (1) |
| Anträge | ok | ok | ok | ok | ok |
| Prüfung | ok + H | ok + H | ok + H | ok + H | ok |
| Personal | B-i (1) + H | B-i (1) + H | B-i (1) + H | B-i (1) + H | B-i (1) |

#### Organisationsleitung (Leitung)

| Kernaufgabe (Ansicht) | 360x740 | 390x844 | 430x932 | 768x1024 | 1024x768 |
|---|---|---|---|---|---|
| Monatsplan (planen, freigeben) | ok | ok | ok | ok | B-i (1) |
| Anträge | ok | ok | ok | ok | ok |
| Personal | B-i (1) + H | B-i (1) + H | B-i (1) + H | B-i (1) + H | B-i (1) |
| Abrechnungsdaten | ok + H | ok + H | ok + H | B-i (1) + H | ok |
| Betrieb | B-i (1) + H | B-i (1) + H | B-i (1) + H | B-i (1) + H | ok |

#### Betriebsrat

| Kernaufgabe (Ansicht) | 360x740 | 390x844 | 430x932 | 768x1024 | 1024x768 |
|---|---|---|---|---|---|
| Monatsplan lesen | ok | ok | ok | ok | B-i (1) |
| Prüfung | ok + H | ok + H | ok + H | ok + H | ok |
| Auswertung (Betriebsrat) | ok + H | B-i (1) + H | B-i (1) + H | B-i (1) + H | ok |
| Hilfe | ok | ok | ok | ok | ok |

#### Betreiber (Konsole)

| Kernaufgabe (Ansicht) | 360x740 | 390x844 | 430x932 | 768x1024 | 1024x768 |
|---|---|---|---|---|---|
| Mandanten | ok + H | ok + H | ok + H | ok + H | ok |
| Rechnungen | ok + H | ok + H | ok + H | ok + H | ok |
| Tarife | ok + H | ok + H | ok + H | ok + H | ok |

Die Zeile „Heute: stempeln“ misst den Bildschirm der Stempeluhr (Ziele, Breite), nicht den Stempelvorgang selbst; der Vorgang ist noch nicht geprüft. Dasselbe gilt für alle Zeilen: gemessen sind Bildschirme, keine Bedienabläufe.

### Befunde und Behandlung

| Nr | Befund (gemessen) | Behandlung in diesem Teil |
|---|---|---|
| B1 | Rechneransicht, alle Rollen außer der Telefonansicht, 360 bis 1024 px: nach dem Öffnen deckt die Seitenleiste die Menütaste ab, es gibt weder Abdunkelung noch Escape; die geschlossene Leiste war nur per Verschiebung aus dem Bild genommen (Befund aus dem Quelltext, nicht per Tastaturprobe gemessen). Das betraf 25 von 25 Kombinationen. | behoben: Abdunkelung (`.seiten-abdunkelung`) zum Antippen, Escape schließt, geschlossene Leiste `visibility:hidden`; nachgemessen 30 von 30 |
| B2 | Auswahlkästchen der Sammelentscheidung in Anträge: 15x15 px (360, 430 und 768 px) | behoben: 24 px bis 1024 px (`.ziel-haken`) |
| B3 | Kontrollkästchen „Nächstes Mal nicht mehr anzeigen“ der Tour: Zeile 235x22 px (768 und 1024 px) | behoben: Mindesthöhe 24 px |
| B4 | Tabellen mit eigenem Querscroll ohne Tastaturzugang, Namen und Hinweis: Personaleinsatz (1179 px), Personal (1004 px), Lagebild (746 px), Auswertung Betriebsrat (835 px), Monatsplan (1151 px bei 1024 px) | geändert: `Scrollbereich` (Fokus, Region mit Namen, sichtbarer Hinweis bis 1024 px). Der Querscroll bleibt bestehen |
| B5 | Filterleisten (Anträge: Offen, Genehmigt, Abgelehnt, Alle; Personal: Einheiten) scrollten innen, Einträge standen hinter dem Rand | geändert: Umbruch bis 480 px wie bei WP-35 (`seg-umbruch`) |
| B6 | Mein Plan der Beschäftigten: Schnellfilter (Alle, Nur Dienste, Nur frei, Nachtdienste, Wochenende) 475 px in 324 px breitem Bereich | bewusst nicht geändert: im Quelltext ausdrücklich als wischbare Schnellfilter gebaut; die Schnellfilter sind alle erreichbar. Entscheidung für spätere Teile |
| B7 | Betrieb (Leitung), Rollen und Rechte: Tabelle 780 px bei 360 bis 768 px; Abrechnungsdaten bei 768 px: 792 px in 738 px | nicht geändert (Betrieb) bzw. WP-35 (Abrechnungsdaten bis 480 px gestapelt); als Befund eingetragen |
| B8 | Hinweis „Für Tablet und Rechner ausgelegt“ auf 52 Ansichten | bewusst unverändert, siehe Abschnitt 6 |

### Entscheidung zur Tabellendarstellung (Operatorfrage offen)

`wp40-fragen.md` Frage 6 (Kartenansicht statt Tabellenscroll) ist nicht bestätigt und bleibt unbeantwortet. Gewählt ist die konservative, zugängliche Variante: eigener Querscroll im Datenbereich (zulässig für Datentabellen nach WCAG 1.4.10), per Tastatur fokussierbar mit sichtbarem Fokusrahmen (2.4.7), mit Namen als Region und mit einem sichtbaren Hinweis unter der Tabelle. Karten bzw. Stapelung werden nur dort verwendet, wo sie schon das etablierte Muster sind (Abrechnungsdaten, WP-35; Filterleisten mit `seg-umbruch`).

## 5 Regression Rechneransicht

Probe bei 1280x800 für Planer und Leitung (Monatsplan, Personaleinsatz, Personal, Anträge): Bereichsleiste oben mit 6 Bereichen, keine Abdunkelung, kein sichtbarer Querscroll-Hinweis, Seitenbreite gleich Fensterbreite: 8 von 8 ohne Befund. Die Stilregeln für Seitenleiste, Abdunkelung und Hinweis gelten nur bis 1024 px (`pruefungen/geraete-wp21.test.js` prüft, dass außerhalb dieses Blocks keine Seitenleistenregel steht).

## 6 Hinweis „Für Tablet und Rechner ausgelegt“

Der Hinweis (`src/App.jsx`, Liste `MOBIL`) bleibt in diesem Teil an allen Ansichten außerhalb der Liste bestehen, auch an denen, die gemessen ohne Querscrollen und ohne kleine Ziele bleiben (Tauschbörse, Prüfung, Betreiberkonsole). Grund: Die Messung deckt Bildschirme, nicht ganze Bedienabläufe ab, und die Akzeptanz „Kernaufgaben je Rolle“ ist für Planung, Leitung und Betriebsrat noch nicht erfüllt (Bereiche mit eigenem Querscroll, Dialoge ungeprüft). Kandidaten für das Entfernen in einem späteren Teil: Tauschbörse, Prüfung, Betreiber Mandanten, Rechnungen und Tarife, Hilfe.

## 7 Offen für spätere Teile (Stand Teil 1; der Stand nach Teil 2 steht in Abschnitt 9.7)

- Querformat der Telefone und echte Geräte (iOS Safari, Android Chrome), Sicherheitsbereiche.
- Bedienabläufe statt Bildschirme: Plan freigeben, Tag öffnen und Abweichung setzen, Antrag entscheiden, Schichtübergabe, Krankmeldung, Postfach, Tour.
- Kartenansicht für Planungstabellen (Operatorentscheidung zu Frage 6), Mein Plan Schnellfilter (B6), Betrieb Rollen und Rechte (B7).
- Tastatur- und Vorlesesoftwareprobe der neuen `Scrollbereich`-Regionen und der Seitenleiste (Fokus beim Öffnen und Schließen).
- Hinweis „Für Tablet und Rechner ausgelegt“ ansichtsweise zurücknehmen (Abschnitt 6).
- Zielgrößen bei Textvergrößerung, Dunkelmodus und Kontrastmodus.

## 8 Nachweise

- Test ohne Browser: `npm run pruefung:geraete` (`pruefungen/geraete-wp21.test.js`), Teil der Kette `pruefung`.
- Messung: `npm run pruefung:geraete-browser` (manuell, Abschnitt 3); Umgebungsvariablen `WP21_ROLLEN`, `WP21_VIEWPORTS`, `WP21_JSON`, `WP21_BILDER`, `WP21_KANAL` (msedge statt Chromium).

## 9 Teil 2: Bedienabläufe, Querformat, Tastatur (Stand: Branch `feature/wp-21-smartphone-s2`)

Teil 1 maß Bildschirme. Teil 2 führt die Kernaufgaben je Rolle tatsächlich aus und misst sie an acht Viewports: die fünf der Matrix (Abschnitt 2) und die drei Querformate der Telefone 740x360, 844x390 und 932x430. WP-21 ist auch damit **nicht erledigt** (Abschnitt 9.7).

### 9.1 Messverfahren (`pruefungen/browser/geraete-wp21-ablaeufe.mjs`)

Lokal und von Hand, nicht Teil von CI: `npx vite build` und danach `npm run pruefung:geraete-ablaeufe-browser` (Umgebung: `WP21_ROLLEN`, `WP21_VIEWPORTS`, `WP21_AUFGABEN`, `WP21_JSON`, `WP21_BILDER`, `WP21_DIST`, `WP21_SONDEN=0`). Gleiche Sicherheitsgrenzen wie Abschnitt 3: Wegwerf-Server auf 127.0.0.1, Zufallsschlüssel, frischer Datenordner, erfundene Personen, keine Zugangsdatei der Staging-Umgebung. Der Demo-Betrieb wird lokal erzeugt und dem Server übergeben (die Betreibersicht enthält keinen Dienstplan); damit die Schichtübergabe messbar ist, bekommt der Wegwerf-Betrieb zusätzlich das Paket „pflege“. Je Aufgabe eine frische Sitzung; Stempeln mit Erfolg verbraucht den Tag der Person, deshalb je Viewport eine eigene Person mit Dienst heute.

Je Aufgabe gilt als **bestanden**, wenn der Ablauf bis zum Ergebnis gelingt (Ergebnistext, Zustand) und zugleich: jedes getippte Ziel erreichbar (scrollbar, nicht verdeckt, ganz im Bild), mindestens 24 x 24 px, die Seite nicht breiter als das Fenster und keine Ziele unter 24 px (Ausnahme „Abstand“ wie in Abschnitt 3). Gemessen werden Taps, kleinstes getipptes Ziel, Innenscroll-Bereiche und der Hinweis „Für Tablet und Rechner ausgelegt“. Aufgaben ohne Ergebnis (Berechtigung fehlt) stehen als nicht bestanden mit Grund da.

Aufgaben: Beschäftigte (Telefonansicht): stempeln, stempeln mit Absage des Servers (Fehlertext), eigenen Plan sehen und Tausch suchen, Abwesenheit beantragen, Antrag mit Ende vor Beginn, Krankmeldung, Mehr. Schichtverantwortung: Meine Schichten, Lagebild, Anträge entscheiden, Tag öffnen (im Lagebild), Schichtübergabe, Krankmeldung (Leiste unten), Tauschbörse (Gesuch einstellen). Planung: Tag öffnen, Anträge entscheiden, Schichtübergabe, Krankmeldung, Tauschbörse, Prüfung, Personaleinsatz, Personal. Leitung: Plan freigeben, Anträge, Tag öffnen, Krankmeldung, Tauschbörse, Abrechnungsdaten, Betrieb (Rollen und Rechte). Betriebsrat: Monatsplan mit Tag öffnen, Prüfung, Auswertung, Hilfe. Betreiber: Mandanten (mit Öffnen), Rechnungen, Tarife. Zusammen 36 Aufgaben je Viewport, 288 Läufe.

### 9.2 Ergebnis vorher und nachher

| Messgröße (288 Läufe, 8 Viewports) | vorher (Stand integration/release-v4, c8c643fd) | nachher |
|---|---|---|
| Aufgaben bestanden | 210 | 274 |
| Läufe mit Seite quer (scrollWidth größer als Fenster) | 0 | 0 |
| Läufe mit Zielen unter 24 px | 43 | 0 |
| Läufe mit Hinweis „Für Tablet und Rechner ausgelegt“ | 90 | 65 |
| Läufe mit mindestens einem Bereich mit eigenem Querscroll | 50 | 51 (alle als benannter Scrollbereich mit Fokus, bis auf die Schrittleiste der Betreiber-Mandantenansicht) |
| Tastatur- und Vorlesesoftware-Probe (28 Prüfungen) | 23 bestanden | 28 bestanden |
| Kleinstes getipptes Ziel (Breite x Höhe) | 33 x 34 px | 33 x 34 px |

Die 14 nicht bestandenen Läufe nachher sind zwei Befunde, die nicht an der Darstellung liegen: B16 (Plan freigeben, 8 Läufe) und B17 (Krankmeldung der Schichtverantwortung, 6 Läufe). Die 78 nicht bestandenen Läufe vorher: Meldungsstreifen mit Schaltfläche 75 x 16 px 40, Absage ohne Live-Region 8, Ende vor Beginn ohne Fehlertext 8, Plan freigeben 8, Krankmeldung Schichtverantwortung 6, Schnellfilter 3, Schalter 40 x 23 px 3, Schließen verdeckt 2. „Ok n“ steht für bestanden mit n Taps.

#### Ergebnis je Rolle, Aufgabe und Viewport (nachher)

| Rolle | Aufgabe | 360x740 | 390x844 | 430x932 | 768x1024 | 1024x768 | 740x360 | 844x390 | 932x430 |
|---|---|---|---|---|---|---|---|---|---|
| mitarbeiter | Stempeln (Einstempeln, Ausstempeln) | ok 2 | ok 2 | ok 2 | ok 2 | ok 2 | ok 2 | ok 2 | ok 2 |
| mitarbeiter | Stempeln: Fehlertext bei Absage | ok 2 | ok 2 | ok 2 | ok 2 | ok 2 | ok 2 | ok 2 | ok 2 |
| mitarbeiter | Eigenen Plan sehen, Tausch suchen | ok 3 | ok 3 | ok 3 | ok 3 | ok 3 | ok 3 | ok 3 | ok 3 |
| mitarbeiter | Abwesenheit beantragen | ok 3 | ok 3 | ok 3 | ok 3 | ok 3 | ok 3 | ok 3 | ok 3 |
| mitarbeiter | Antrag mit Ende vor Beginn | ok 3 | ok 3 | ok 3 | ok 3 | ok 3 | ok 3 | ok 3 | ok 3 |
| mitarbeiter | Krankmeldung | ok 4 | ok 4 | ok 4 | ok 4 | ok 4 | ok 4 | ok 4 | ok 4 |
| mitarbeiter | Mehr: Konto | ok 1 | ok 1 | ok 1 | ok 1 | ok 1 | ok 1 | ok 1 | ok 1 |
| subplaner | Meine Schichten | ok 2 | ok 2 | ok 2 | ok 2 | ok 2 | ok 2 | ok 2 | ok 2 |
| subplaner | Lagebild lesen | ok 2 | ok 2 | ok 2 | ok 2 | ok 2 | ok 2 | ok 2 | ok 2 |
| subplaner | Anträge entscheiden | ok 3 | ok 3 | ok 3 | ok 3 | ok 3 | ok 3 | ok 3 | ok 3 |
| subplaner | Tag öffnen | ok 3 | ok 3 | ok 3 | ok 3 | ok 3 | ok 3 | ok 3 | ok 3 |
| subplaner | Schichtübergabe | ok 3 | ok 3 | ok 3 | ok 3 | ok 3 | ok 3 | ok 3 | ok 3 |
| subplaner | Krankmeldung (Leiste unten) | **nicht bestanden** | ok 3 | **nicht bestanden** | **nicht bestanden** | **nicht bestanden** | **nicht bestanden** | **nicht bestanden** | ok 3 |
| subplaner | Tauschbörse | ok 3 | ok 3 | ok 3 | ok 3 | ok 3 | ok 3 | ok 3 | ok 3 |
| planer | Tag öffnen | ok 3 | ok 3 | ok 3 | ok 3 | ok 3 | ok 3 | ok 3 | ok 3 |
| planer | Anträge entscheiden | ok 3 | ok 3 | ok 3 | ok 3 | ok 3 | ok 3 | ok 3 | ok 3 |
| planer | Schichtübergabe | ok 3 | ok 3 | ok 3 | ok 3 | ok 3 | ok 3 | ok 3 | ok 3 |
| planer | Krankmeldung (Leiste unten) | ok 3 | ok 3 | ok 3 | ok 3 | ok 3 | ok 3 | ok 3 | ok 3 |
| planer | Tauschbörse lesen | ok 2 | ok 2 | ok 2 | ok 2 | ok 2 | ok 2 | ok 2 | ok 2 |
| planer | Prüfung lesen | ok 2 | ok 2 | ok 2 | ok 2 | ok 2 | ok 2 | ok 2 | ok 2 |
| planer | Personaleinsatz lesen | ok 2 | ok 2 | ok 2 | ok 2 | ok 2 | ok 2 | ok 2 | ok 2 |
| planer | Personal lesen | ok 2 | ok 2 | ok 2 | ok 2 | ok 2 | ok 2 | ok 2 | ok 2 |
| leitung | Plan freigeben | **nicht bestanden** | **nicht bestanden** | **nicht bestanden** | **nicht bestanden** | **nicht bestanden** | **nicht bestanden** | **nicht bestanden** | **nicht bestanden** |
| leitung | Anträge entscheiden | ok 3 | ok 3 | ok 3 | ok 3 | ok 3 | ok 3 | ok 3 | ok 3 |
| leitung | Tag öffnen | ok 3 | ok 3 | ok 3 | ok 3 | ok 3 | ok 3 | ok 3 | ok 3 |
| leitung | Krankmeldung (Leiste unten) | ok 3 | ok 3 | ok 3 | ok 3 | ok 3 | ok 3 | ok 3 | ok 3 |
| leitung | Tauschbörse lesen | ok 2 | ok 2 | ok 2 | ok 2 | ok 2 | ok 2 | ok 2 | ok 2 |
| leitung | Abrechnungsdaten lesen | ok 2 | ok 2 | ok 2 | ok 2 | ok 2 | ok 2 | ok 2 | ok 2 |
| leitung | Betrieb: Rollen und Rechte | ok 2 | ok 2 | ok 2 | ok 2 | ok 2 | ok 2 | ok 2 | ok 2 |
| betriebsrat | Monatsplan lesen, Tag öffnen | ok 3 | ok 3 | ok 3 | ok 3 | ok 3 | ok 3 | ok 3 | ok 3 |
| betriebsrat | Prüfung lesen | ok 2 | ok 2 | ok 2 | ok 2 | ok 2 | ok 2 | ok 2 | ok 2 |
| betriebsrat | Auswertung (Betriebsrat) lesen | ok 2 | ok 2 | ok 2 | ok 2 | ok 2 | ok 2 | ok 2 | ok 2 |
| betriebsrat | Hilfe lesen | ok 2 | ok 2 | ok 2 | ok 2 | ok 2 | ok 2 | ok 2 | ok 2 |
| betreiber | Mandanten ansehen | ok 3 | ok 3 | ok 3 | ok 3 | ok 3 | ok 3 | ok 3 | ok 3 |
| betreiber | Rechnungen ansehen | ok 2 | ok 2 | ok 2 | ok 2 | ok 2 | ok 2 | ok 2 | ok 2 |
| betreiber | Tarife ansehen | ok 2 | ok 2 | ok 2 | ok 2 | ok 2 | ok 2 | ok 2 | ok 2 |

„ok n“: bestanden mit n Taps. „nicht bestanden“: Plan freigeben (B16) und Krankmeldung der Schichtverantwortung an Tagen mit Dienst (B17).

### 9.3 Befunde und Behandlung

| Nr | Befund (gemessen) | Behandlung |
|---|---|---|
| B9 | „Rückgängig“ im Meldungsstreifen der Rechneransicht 75 x 16 px (Anträge entscheiden bei Schichtverantwortung, Planung, Leitung; Schichtübergabe abschließen), 40 von 40 Läufen bei allen acht Viewports | behoben: mindestens 24 px, bis 1024 px 36 px (`.toast button`) |
| B10 | Meldungen der Telefonansicht (z. B. „Stempel abgelehnt: …“) ohne Live-Region: Vorlesesoftware meldet sie nicht (8 von 8). Der abgelehnte Stempel bleibt als Eintrag mit „Erneut senden“ und „Zur Kenntnis“ stehen (dort Live-Region vorhanden) | behoben: Live-Region steht immer im Dokument, der Text kommt hinein |
| B11 | Abwesenheitsantrag auf dem Telefon mit Ende vor Beginn: das Blatt schließt, kein Fehlertext, der Antrag geht ab (8 von 8). Die Rechneransicht prüfte das schon | behoben: dieselbe Prüfung für beide (`src/lib/antragpruefung.js`), Fehlertext im Blatt (`role="alert"`), Blatt bleibt offen, Feld `aria-invalid` |
| B12 | Mein Plan, Schnellfilter 475 px: bei 360 px 3 von 5, bei 390 und 430 px 4 von 5 Filter ohne Wischen im Bild (B6 aus Teil 1) | behoben: Umbruch bis 560 px (`.reiterreihe-umbruch`); ab 768 px passten sie schon (5 von 5) |
| B13 | Tastaturprobe Seitenleiste (390 und 1024 px): nach dem Öffnen blieb der Fokus auf der Menütaste unter der Leiste, die Menütaste hatte kein `aria-controls` (je 2 von 2) | behoben: Fokus auf den aktuellen Eintrag beim Öffnen, zurück zur Menütaste beim Schließen (Escape, Abdunkelung, Auswahl), `aria-controls` |
| B14 | Querformat: Meldungsstreifen der Telefonansicht verdeckt „Schließen“ der Krankmeldung (844x390, 932x430); Schalter 40 x 23 px im Monatsplan bei 932x430 (Planung, Leitung, Betriebsrat) | behoben: Streifen nimmt keine Eingaben an (`pointer-events:none`); Schalter bis 1024 px 24 px hoch |
| B15 | Betrieb, Rollen und Rechte 780 px und Abrechnungsdaten 792 px in 738 px (B7 aus Teil 1) | geändert: beide Tabellen als benannter Scrollbereich mit Fokus und Hinweis; die Stapelung der Abrechnungsdaten bis 480 px (WP-35) bleibt |
| B16 | **Plan freigeben ist keiner Rolle möglich:** `src/ansichten/freigabeleiste.jsx` zeigt die Schaltfläche nur bei dem Recht `plan.publish`; dieses Recht steht in keiner Rolle der Rechtematrix (`MATRIX_STD` in `src/lib/rollen.js`, auch nicht im Demo-Betrieb). Gemessen: Leitung, 8 von 8 Läufen, Schaltfläche fehlt. Der Server nähme die Freigabe von Planung und Leitung an (`server/lib/rechte.mjs`, `freigabenZusammen`). Dieselbe Prüfung in `tagesaufgaben` (`fachlogik.js`) ist damit ebenfalls wirkungslos | **nicht geändert** (Rechtefrage, Operatorentscheidung; Vorschlag: Recht in die Matrix aufnehmen oder auf `plan.edit.all` prüfen) |
| B17 | **Krankmeldung der Schichtverantwortung** (Leiste unten, eigene Person): an Tagen mit eigenem Dienst (Hinweis „Lücke 1 von 1“) weist der Server die Änderung nach dem Absenden ab, es erscheint das Band „Diese Änderung ist mit deiner Rolle nicht zulässig … Keine Schreibberechtigung“ und das Blatt schließt sich (6 von 6 Läufen); an Tagen ohne Dienst gelingt sie (2 von 2) | **nicht geändert** (Schreibrecht der Schichtverantwortung, Server; Operatorentscheidung). Die Messung weist es als Befund „SERVER-RECHT“ aus |

Nicht behoben und nicht entschieden: die Tabellen bleiben beim bewährten, zugänglichen Querscroll im Datenbereich; eine Kartenansicht (`wp40-fragen.md` Frage 6) ist nicht bestätigt und wurde nicht gebaut. Die Fragen in `wp40-fragen.md` sind unverändert.

### 9.4 Querformat (740x360, 844x390, 932x430)

Alle Aufgaben mit Ausnahme B16 und B17 bestehen in den drei Querformaten wie im Hochformat. Gemessen: Das Blatt „Frei beantragen“ und das Tagesblatt sind höher als das Fenster und scrollen (Tagesblatt 813 px in 360, 390 und 430 px Höhe; Blatt Mein Plan 396 px in 430 px Höhe), die Schaltflächen bleiben erreichbar. Die Reiterleiste der Telefonansicht (72 px) bleibt im Bild, kein getipptes Ziel war verdeckt. Bei 844 px und 932 px Breite gilt die Rechneransicht (Raster, kein Tablet-Hinweis); dort sind die Tageszellen 33 x 44 px.

### 9.5 Tastatur- und Vorlesesoftware-Probe (automatisiert, 28 Prüfungen, 390 und 1024 px)

Seitenleiste: Menütaste mit `aria-expanded` und `aria-controls`; geschlossen erreicht Tab keinen Eintrag; geöffnet liegt der Fokus in der Leiste, sie heißt „Hauptnavigation“; Escape schließt und der Fokus kehrt zur Menütaste zurück. Scrollbereich (Personaleinsatz): Region mit Namen und `tabindex=0`, Fokusrahmen mindestens 2 px, Pfeiltaste scrollt (0 auf 80 px), sichtbarer Hinweis bis 1024 px. Tagesblatt: `role="dialog"`, `aria-modal`, Name, Fokus darin, Escape schließt. Telefonansicht: Reiterleiste benannt mit einem `aria-current`, Blatt „Frei beantragen“ als Dialog, Escape schließt und der Fokus kehrt zum Auslöser zurück, Live-Region für Meldungen. Vorher 5 Prüfungen nicht bestanden (B10, B13), nachher 28 von 28. Keine Vorlesesoftware im Einsatz: geprüft sind Rollen, Namen und Zustände im Dokument, nicht das gesprochene Ergebnis.

### 9.6 Hinweis „Für Tablet und Rechner ausgelegt“ zurückgenommen

Die Liste steht jetzt in `src/ui/geraete.js` (`TELEFON_ANSICHTEN`, `TELEFON_ANSICHTEN_BETREIBER`, `telefonTauglich`); ein Test prüft, dass jede Ansicht ohne Hinweis in diesem Abschnitt steht. Zurückgenommen nur für Ansichten, deren Kernaufgaben in allen acht Viewports bestanden haben, ohne Ziele unter 24 px und ohne Bereich mit eigenem Querscroll:

- `boerse` (Tauschbörse): Schichtverantwortung Gesuch einstellen und „Ich übernehme“ (8 von 8), Planung und Leitung lesen (je 8 von 8); 2 bis 3 Taps.
- `pruef` (Prüfung): Planung und Betriebsrat lesen (je 8 von 8), 2 Taps.

Unverändert mit Hinweis, obwohl die Aufgabe bestanden hat: Betreiber Mandanten, Rechnungen, Tarife (nur Ansehen gemessen, Rechnungen und Tarife mit leeren Listen im Wegwerf-Betrieb; die Schrittleiste der Mandantenansicht scrollt unbenannt quer, 724 px), Personaleinsatz und Personal (Tabellen mit Querscroll), Abrechnungsdaten, Betrieb, Übergabe. Übrige Ansichten sind nicht gemessen und behalten den Hinweis. `hilfe` und `rechtliches` standen schon in der Liste.

### 9.7 Offen für spätere Teile

- B16 und B17 (Rechte; Operatorentscheidung).
- Kartenansicht für Planungstabellen (Frage 6 offen); Schrittleiste der Betreiber-Mandantenansicht.
- Echte Geräte (iOS Safari, Android Chrome), Sicherheitsbereiche (Notch), Textvergrößerung, Dunkelmodus und Kontrastmodus, Vorlesesoftware im Einsatz.
- Weitere Ansichten (Schichtübergabe, Personal, Betreiber) auf Aufgaben mit Inhalt prüfen, bevor der Hinweis fällt.
- Stempeln bei langsamem Server: nach „Einstempeln“ steht die Schaltfläche auf „Wird gespeichert …“, bis der Server geantwortet hat; unter Last auf dem Wegwerf-Server dauerte das länger als 6 s (erste Messläufe liefen deshalb in die Zeitüberschreitung, die Messung wartet jetzt bis 45 s). Das Verhalten der Anwendung ist unverändert.

### 9.8 Nachweise Teil 2

- Test ohne Browser: `npm run pruefung:geraete-ablaeufe` (`pruefungen/geraete-wp21-ablaeufe.test.js`), Teil der Kette `pruefung` und der CI.
- Messung: `npm run pruefung:geraete-ablaeufe-browser` (manuell); Regression der Teil-1-Messung (`npm run pruefung:geraete-browser`) nach den Änderungen: 173 von 173 Zeilen ohne Befund, 0 Zeilen mit Zielen unter 24 px.
