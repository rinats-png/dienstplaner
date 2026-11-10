# WP-21 Gerätematrix: Smartphone und Tablet für alle Rollen (Teil 1)

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

## 7 Offen für spätere Teile

- Querformat der Telefone und echte Geräte (iOS Safari, Android Chrome), Sicherheitsbereiche.
- Bedienabläufe statt Bildschirme: Plan freigeben, Tag öffnen und Abweichung setzen, Antrag entscheiden, Schichtübergabe, Krankmeldung, Postfach, Tour.
- Kartenansicht für Planungstabellen (Operatorentscheidung zu Frage 6), Mein Plan Schnellfilter (B6), Betrieb Rollen und Rechte (B7).
- Tastatur- und Vorlesesoftwareprobe der neuen `Scrollbereich`-Regionen und der Seitenleiste (Fokus beim Öffnen und Schließen).
- Hinweis „Für Tablet und Rechner ausgelegt“ ansichtsweise zurücknehmen (Abschnitt 6).
- Zielgrößen bei Textvergrößerung, Dunkelmodus und Kontrastmodus.

## 8 Nachweise

- Test ohne Browser: `npm run pruefung:geraete` (`pruefungen/geraete-wp21.test.js`), Teil der Kette `pruefung`.
- Messung: `npm run pruefung:geraete-browser` (manuell, Abschnitt 3); Umgebungsvariablen `WP21_ROLLEN`, `WP21_VIEWPORTS`, `WP21_JSON`, `WP21_BILDER`, `WP21_KANAL` (msedge statt Chromium).
