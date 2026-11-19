# WP-40 Nachweis: Barrierefreiheit WCAG 2.2 AA

Stand: Branch `feature/wp40-wp35-darstellung` (Basis 46dd93b). Prüfung: `npx vitest run pruefungen/wp40-zugaenglichkeit.test.js pruefungen/kontrast.test.js` sowie die Prüfungen, die `pruefungen/app-quelle.js` lesen.

Die Prüfungen sind Quelltext- und Render-Prüfungen (`renderToStaticMarkup`). Eine echte Browser-Prüfung mit Tastatur, Vorlesesoftware, 200 % Zoom und axe ist nicht Teil dieses Nachweises (siehe Abschnitt unten).

## Was in diesem Paket geändert wurde

| Stelle | Änderung | Kriterium |
|---|---|---|
| `src/ui/dialogfokus.js` (neu) | Fokus beim Öffnen ins Blatt, Tab bleibt darin, Escape schließt, Fokus kehrt zur auslösenden Stelle zurück | 2.1.1, 2.1.2, 2.4.3, 4.1.2 |
| `src/App.jsx` `MBlatt` | nutzt den Hook, Blatt mit `tabIndex=-1` fokussierbar | 2.1.2, 2.4.3 |
| `src/App.jsx` `Kommandoleiste` | Überlagerung als `role="dialog" aria-modal="true" aria-label="Schnellsuche"` | 4.1.2 |
| `src/App.jsx` Blatt „Feldmodus“ | Schalter erhält `label="Feldmodus"` (vorher ohne Namen) | 4.1.2 |
| `src/App.jsx` Telefon-Konto | E-Mail-Feld erhält `aria-label`; Rahmen `steuer` statt `line` | 1.3.1, 1.4.11, 4.1.2 |
| `src/ui/bausteine.jsx` `Seg` | Schaltflächen `type="button"` | 4.1.2 (Formularverhalten) |
| `src/main.jsx` Einrichtung | Beschriftungen per `htmlFor`/`id` mit Feldern verbunden; Branchen-Auswahl als `role="group"` mit `aria-labelledby` und `aria-pressed`; Rahmen `steuer` | 1.3.1, 1.4.1, 1.4.11, 4.1.2 |
| `pruefungen/kontrast.test.js` | neuer Abschnitt: Rahmen der Eingabefelder aus `v4/app-stil.js` wird gelesen und mit 3:1 gegen die Feldfläche gerechnet, beide Erscheinungsbilder | 1.4.11 |
| `pruefungen/wp40-zugaenglichkeit.test.js` (neu) | 19 Fälle (Fokus-Hook, MBlatt, Schnellsuche, alle `<Schalter>` benannt, Seg, Einrichtung, Telefon-Konto) | — |

Vor der Korrektur schlugen die neuen Fälle fehl (geprüft durch Zurücksetzen von `src/App.jsx` und `src/ui/bausteine.jsx`): MBlatt-Fokus, Schnellsuche-Dialog, unbenannter Schalter „Feldmodus“, Seg ohne `type`. Die übrigen Fälle prüfen Zustände, die erst mit dem Paket hergestellt wurden.

## Kriterien

| Kriterium | Was ist da | Nachweis |
|---|---|---|
| 1.1.1 Nicht-Text-Inhalt | Symbole sind `aria-hidden`; Namenszeichen (`Avatar`) `aria-hidden`, die Person steht daneben im Text. Zeitbereichs-Schaltflächen (`Zeitwahl`) tragen `aria-label`. | Quelltext `ui/bausteine.jsx`, `gestalt/ansichten.jsx` |
| 1.3.1 Info und Beziehungen | `Field` verbindet Beschriftung (`htmlFor`), Feld und Hinweis (`aria-describedby`). Filterleiste hat `aria-label`. Einrichtung: Beschriftungen jetzt per `id`. Abschnitte mit `h2`. | `wp40-zugaenglichkeit` („Einrichtung und Konto“); `ui/bausteine.jsx` |
| 1.3.1 Überschriftenstruktur | Jede Ansicht hat eine `h1` (`H1`), Abschnitte `h2` (`Abschnitt`). Nicht pro Ansicht geprüft. | **Browser-Prüfung offen** |
| 1.4.1 Farbe allein | Gewählte Branche: `aria-pressed`. Planzellen: Ausfall durch Durchstreichung und Deckkraft, nicht nur Farbe. Status als Wort in Pillen (`Pill`, `Trend`). | `wp40-zugaenglichkeit`; `ui/bausteine.jsx` `Planzelle` |
| 1.4.3 Kontrast Text | `kontrast.test.js`: Text, gedämpfter Text, Statusfarben, Verläufe, Dienstfarben, Namenszeichen, beide Erscheinungsbilder. Keine neuen Hexwerte. | `kontrast.test.js` (bestanden) |
| 1.4.10 Reflow | Keine Viewport-Sperre (`user-scalable`/`maximum-scale` fehlen in `index.html`). Die breiten Tabellen liegen in einem Bereich mit `overflow-x:auto`. Ob bei 320 px kein Querscrollen der Seite entsteht, ist nicht geprüft. | **Browser-Prüfung offen** (320 px) |
| 1.4.11 Nichttextkontrast | Rahmen der Eingabefelder über die v4-Regel `steuer` (4,14:1 hell, 4,41:1 dunkel). Die Basisregel `line` (1,60 / 1,44:1) wird überschrieben; jetzt geprüft. Die Felder der Einrichtung und des Telefon-Kontos hatten `line` ohne Überschreibung und sind korrigiert. Schalter-Rand `steuer` 3:1. | `kontrast.test.js` („Eingabefelder“); `wp40-zugaenglichkeit` |
| 1.4.12 Textabstand | Keine feste Höhe bei Text in den Bausteinen; `Seg` und Knöpfe umbrechen (`flex-wrap`). | **Browser-Prüfung offen** |
| 2.1.1 Tastatur | `klickbar()` gibt `role="button"`, `tabIndex=0`, Enter und Leertaste. Eigene Bedienelemente in einer Zeile werden nicht verschluckt. Schalter und Seg sind echte Schaltflächen. Schnellsuche per Pfeiltasten (Kombinationsfeld mit `aria-activedescendant`). | `ui/bausteine.jsx`; `App.jsx` Kommandoleiste |
| 2.1.2 Keine Tastaturfalle | Blätter schließen mit Escape; Tab bleibt im Blatt (`useDialogFokus`). Die Dialoge in `ui/leisten.jsx` (`Sheet`), `ansichten/fenster.jsx`, `v4/komponenten.jsx` hatten das bereits. | `wp40-zugaenglichkeit` („Blätter und Dialoge“) |
| 2.4.3 Fokusreihenfolge | Blätter setzen den Fokus hinein und zurück. | `wp40-zugaenglichkeit` |
| 2.4.7 Fokus sichtbar | Globales `:focus-visible` (2 px, Akzentfarbe) in `App.jsx` und `v4/app-stil.js`; Eingabefelder mit Rahmen und Ring. | `v4-app-stil.test.js` (bestanden) |
| 2.4.11 Fokus nicht verdeckt (2.2) | Kopfleiste und Leisten liegen fest. Ob der Fokus unter einer festen Leiste verschwindet, ist nicht geprüft. | **Browser-Prüfung offen** |
| 2.5.8 Zielgröße (2.2) | Planzellen 34 px hoch; Ziele unter 40 px auf dichten Planrastern auf dem Telefon sind bewusst (Hinweis „Für Tablet und Rechner ausgelegt“). Nicht verändert. Die Schwelle nach 2.5.8 ist 24 px. | **Browser-Prüfung offen** (24 px je Ziel) |
| 2.3.3 Animation | `prefers-reduced-motion` in `App.jsx` und `v4/app-stil.js`: Animationen auf 0,01 ms, Ladeanzeige ohne Bewegung. `startbild.jsx` liest die Einstellung. | `v4-app-stil.test.js`; Quelltext |
| 3.3.1 / 3.3.2 Fehler und Beschriftung | Fehler als `role="alert"` (`Feldfehler`, Fehlerbänder). Platzhalter sind nicht die einzige Beschriftung (Suchfeld, E-Mail, Name). | `ui/bausteine.jsx`; `wp40-zugaenglichkeit` |
| 3.3.? Fehler am Feld | Fehlertext ist nicht per `aria-describedby` mit dem Feld verbunden (nur über `role="alert"`). Siehe `docs/acc45/wp40-fragen.md`, Frage 2. | offen |
| 4.1.2 Name, Rolle, Wert | Schalter: `role="switch"` und `aria-checked`, Name über `label` oder umschließendes `<label>` (Prüfung je Stelle). Seg: `type="button"`. Kommandoleiste: `role="combobox"`, `role="listbox"`. | `wp40-zugaenglichkeit` („Jeder Schalter trägt einen Namen“) |
| 4.1.3 Statusmeldungen | Toasts `role="status" aria-live="polite"`; Fehler `role="alert"`; Ladezustände `aria-busy`. | `App.jsx` (Toast), `ui/bausteine.jsx` `Laden` |

## Nur im Browser prüfbar (Abnahme durch den Orchestrator)

1. axe-core im Browser auf den Hauptansichten (Plan, Stempeluhr, Telefon-Startseite, Einstellungen, Schichtfolge), beide Erscheinungsbilder.
2. Tastatur allein: Tab-Reihenfolge durch Kopfleiste, Seitenleiste, Plan; Enter und Leertaste auf `role="button"`-Zellen; Escape in Blättern und in der Schnellsuche.
3. Vorlesesoftware: Überschriftenstruktur je Ansicht, Namen der Planzellen.
4. Zoom 200 % und 320 px Breite: kein horizontales Scrollen der Seite; `Seg` bricht um oder scrollt im Bereich.
5. Zielgrößen (24 px) auf dem Telefon außerhalb der dichten Raster.
6. Fokus unter festen Leisten (2.4.11).
7. Blatt auf dem Telefon: Fokus landet im Blatt, Tab kehrt nicht in den Hintergrund zurück, Escape schließt und setzt den Fokus zurück.

## Was nicht geändert wurde (mit Begründung)

- Zielgrößen unter 40 px auf dichten Planrastern: bewusst (Hinweis „Für Tablet und Rechner ausgelegt“). Nicht verändert.
- `Seg` nutzt `role="tab"` ohne `aria-controls` und ohne Pfeiltastennavigation. Die Filter sind Schaltflächen mit Tab-Reihenfolge; `bildersatz.mjs` sucht über die Rolle `tab`. Eine Umstellung auf `aria-pressed` wäre sauberer; Frage 3 in `wp40-fragen.md`.
- Vorhandene Dialoge in `ui/leisten.jsx`, `ansichten/fenster.jsx`, `v4/komponenten.jsx`, `rechtstexte.jsx` sind bereits geprüft; nicht angefasst.
- `wiederherstellen-ui.test.js` schlägt im Ausgangszustand bereits fehl (3 Fälle, „Lädt“-Erwartung). Nicht durch dieses Paket verursacht; nicht verändert.

## Review

Stand 2026-11-09. Review des vorhandenen Bestands auf `origin/integration/release-v4` (Commits 5d114abd, a7c2948b, ba0d846b). Kein Produktcode und keine Tests geändert; der obige Text ist unverändert.

### Prüfung

- `npx vitest run pruefungen/wp40-zugaenglichkeit.test.js pruefungen/kontrast.test.js pruefungen/v4-app-stil.test.js`: 3 Dateien, 251 Fälle, alle bestanden. `wp40-zugaenglichkeit.test.js` allein: 28 Fälle bestanden (14 feste Fälle plus ein Fall je `<Schalter>`).
- Hinweis: `node --test` kann die Datei nicht laden (JSX-Import, `ERR_UNKNOWN_FILE_EXTENSION`); der Lauf geht nur über vitest, wie im Nachweis genannt.

### Abgleich Nachweis und Code

Die Aussagen des Nachweises stimmen im Stichprobenabgleich mit dem Code überein: `useDialogFokus` (Escape, Tab-Falle, Rückkehr), `MBlatt` mit `tabIndex=-1`, Schnellsuche als `role="dialog"` mit `combobox`/`listbox`/`aria-activedescendant`, `label="Feldmodus"`, `Seg` mit `type="button"`, Einrichtung mit `htmlFor`/`id` und `aria-pressed`, `klickbar()`, `Planzelle` mit Durchstreichung, `role="status"`/`role="alert"`/`aria-busy`, `:focus-visible` und `prefers-reduced-motion` in `App.jsx` und `v4/app-stil.js`, keine Viewport-Sperre in `index.html`.

Widersprüche und Abweichungen:

1. Ortsangaben veraltet: Der Nachweis nennt `src/App.jsx` für `MBlatt`, Kommandoleiste und Feldmodus-Schalter. Seit WP-39 stehen sie in `src/ansichten/mobil.jsx`, `src/ansichten/kommandoleiste.jsx` und `src/ansichten/mobil.jsx`. Die Prüfung findet sie weiter, weil `pruefungen/app-quelle.js` die ausgelagerten Dateien zusammenfügt. Inhaltlich kein Fehler, aber die Tabelle verweist auf falsche Dateien.
2. Fallzahl: Der Nachweis nennt 19 Fälle für `wp40-zugaenglichkeit.test.js`; es sind 28 (19 ist nicht mehr aktuell; je Schalter ein Fall).
3. Stand-Zeile nennt Branch `feature/wp40-wp35-darstellung` (Basis 46dd93b), nicht den Integrationsbranch.
4. Tabellenzeile „3.3.? Fehler am Feld“ trägt kein Kriterium. Gemeint ist 3.3.1 (Fehler erkennen) bzw. 1.3.1/4.1.2 (`aria-describedby`, `aria-invalid`); die Zeile ist offen und gehört zu Frage 2.
5. Die Schalter-Prüfung sucht `<Schalter`; die zweite Variante `<Schalt` (`src/gestalt/rahmen.jsx`, Prefix-Treffer nicht abgedeckt, da `<Schalter` nicht auf `<Schalt ` passt) ist nicht Teil der Prüfung. Stichprobe: Alle `<Schalt `-Stellen tragen `label=`. Die Behauptung „alle Schalter benannt“ ist dort nur per Stichprobe belegt.
6. Der Nachweis sagt „Seg ... `flex-wrap`“ (1.4.12). `flexWrap` ist in `ui/bausteine.jsx` für Kopf- und Zeitwahl-Container vorhanden; für `Seg` selbst wurde es nicht bestätigt. Belegt ist es nur als Quelltext-Annahme.
7. Der Nachweis sagt, der Rahmen `steuer` in der Einrichtung sei geprüft. Der Test verneint nur ein Muster mit `C.line` (eine Verneinung eines Textmusters). Er belegt nicht, dass jedes Feld `steuer` nutzt; der Kontrasttest prüft die Regel in `v4/app-stil.js`, nicht die Inline-Stile in `main.jsx`.
8. Der Nachweis führt `wiederherstellen-ui.test.js` mit 3 Fehlern im Ausgangszustand. Diese Datei wurde in diesem Review nicht ausgeführt; der Zustand auf dem Integrationsbranch ist offen.

### Kriterien: belegt

Belegt heißt: Quelltext- oder Render-Prüfung vorhanden und bestanden. Das ist keine Browser-Abnahme.

| Kriterium | Beleg |
|---|---|
| 1.1.1 | Quelltext (`aria-hidden`, `aria-label` an Zeitwahl) |
| 1.3.1 (Beschriftung/Beziehung) | Test „Einrichtung und Konto“, `Field` |
| 1.4.1 | Test (`aria-pressed`), `Planzelle` Quelltext |
| 1.4.3 | `kontrast.test.js` |
| 1.4.11 | `kontrast.test.js` („Eingabefelder“), `steuer` 3:1 |
| 2.1.1 | `klickbar()`, Schnellsuche Quelltext |
| 2.1.2 | Test „Blätter und Dialoge“ (Quelltextmuster) |
| 2.4.3 | Test (Hook, MBlatt) |
| 2.4.7 | `v4-app-stil.test.js`, `:focus-visible` |
| 2.3.3 (AAA, nicht AA) | `prefers-reduced-motion`; kein AA-Kriterium, nur als Zusatz belegt |
| 3.3.2 | Quelltext, Test E-Mail-Konto |
| 4.1.2 | Test „Jeder Schalter trägt einen Namen“, `Seg` |
| 4.1.3 | Quelltext (`role="status"`, `role="alert"`, `aria-busy`) |

13 Zeilen; davon ist 2.3.3 AAA und zählt nicht für AA, also 12 AA-Kriterien belegt auf Quelltextebene. 3.3.1 ist nur teilweise belegt (`role="alert"`, ohne Feldverbindung).

Einschränkung: Fokus-, Tab- und Escape-Verhalten (2.1.2, 2.4.3) ist nur über Textmuster im Hook geprüft, nicht über ein Verhalten (kein DOM-Lauf, kein Browser). Die Prüfung beweist, dass der Code vorhanden ist, nicht dass er funktioniert.

### Kriterien: offen

| Kriterium | Grund |
|---|---|
| 1.3.1 Überschriftenstruktur je Ansicht | nicht geprüft; Browser/Vorlesesoftware |
| 1.4.10 Reflow (320 px, 200 %) | nicht geprüft; Browser |
| 1.4.12 Textabstand | nicht geprüft; Browser |
| 2.4.11 Fokus nicht verdeckt (2.2) | nicht geprüft; Browser |
| 2.5.8 Zielgröße 24 px (2.2) | nicht gemessen; Planzellen 34 px hoch, übrige Ziele nicht gemessen; Frage 1 |
| 3.3.1 Fehler am Feld | `aria-describedby`/`aria-invalid` fehlen; Frage 2 |
| axe-core, Tastatur, Vorlesesoftware | Abnahmeliste unter „Nur im Browser prüfbar“ nicht durchgeführt |

Im Nachweis nicht genannt, aber für WCAG 2.2 AA relevant und nicht belegt (nur als Hinweis, keine Prüfung durchgeführt): 2.4.1 Bereiche umgehen, 2.4.2 Seitentitel, 2.4.4/2.4.6, 2.5.7 Ziehbewegungen, 3.2.6, 3.3.7 Redundante Eingabe, 3.3.8 Zugängliche Authentifizierung (Anmeldung/2FA), 1.4.13, 1.3.4 Eingabezweck (`autocomplete`), 1.4.4 Textgröße. Diese stehen nicht im Nachweis und gelten als nicht bewertet.

### Fragen an den Betreiber

1. Die Fragen 1 bis 6 in `wp40-fragen.md` sind weiter offen und unentschieden (Zielgrößen, Fehlertext am Feld, `Seg` als `tab`, Gruppenbeschriftung, Geo-Schalter, Tabellenreflow). Frage 4 ist eine Kleinigkeit (ein `<label>` ohne Steuerelement).
2. Wer führt die Browser-Abnahme (axe, Tastatur, 320 px, Telefon) durch, und wann? Ohne sie bleibt WP-40 für 1.4.10, 1.4.12, 2.4.11, 2.5.8 ungeprüft.
3. Sind die nicht genannten Kriterien (3.3.8 Authentifizierung, 1.3.4 Eingabezweck, 2.4.1, 2.4.2, 2.5.7, 3.3.7) im Umfang von WP-40 gewollt? Dann fehlt eine Bestandsaufnahme.
4. Soll die Zeile „3.3.?“ im Nachweis auf 3.3.1 korrigiert und der Ortshinweis auf die ausgelagerten Dateien angepasst werden (Textänderung am Nachweis, hier bewusst nicht erfolgt)?

### Empfehlung für den SSOT-Status

`BLOCKED` stimmt nicht mehr mit dem Bestand überein: Code und 28 Prüffälle sind vorhanden und bestehen. Empfehlung: Status auf einen Zwischenstand wie „Quelltext-Prüfung bestanden, Browser-Abnahme offen“ setzen (nicht auf erledigt), solange die Browser-Abnahme und die Fragen 1 bis 3 offen sind. Diese Änderung an `work-packages.json` ist hier nicht erfolgt.

## Browser-Abnahme (Teil 2, 2026-11-12)

Skript `pruefungen/browser/wcag-wp40.mjs` (`npm run pruefung:wcag-wp40-browser`, lokal, Edge, Wegwerfdaten, kein CI-Bestandteil); Bewertungslogik ohne Browser in `pruefungen/wcag-wp40.test.js` (CI, Kette `pruefung`). Gemessen: 76 Ansichten (Mitarbeit, Planung, Leitung, Schichtverantwortung; 320, 360, 390, 768 px). Einzelheiten und Befunde: `docs/acc45/WP-40-BEFUNDE.md`.

| Kriterium | Stand | Beleg |
|---|---|---|
| 1.4.10 Reflow | bewiesen für die gemessenen 76 Ansichten: kein Querscrollen der Seite; Datentabellen und Schnellfilter rollen im eigenen Bereich | Browserlauf |
| 2.5.8 Zielgröße | bewiesen für die gemessenen 76 Ansichten: alle Ziele mindestens 24 px oder durch Abstand erfüllt | Browserlauf |
| 2.4.11 Fokus nicht verdeckt | Befund gefunden (35 Verdeckungen unter fester unterer Leiste) und behoben (`scroll-padding` in `src/gestalt/stil.js`); Nachmessung 76 Ansichten, 0 Befunde (je 18 Tab-Stopps) | Browserlauf 1 und 2 |
| 3.3.1 Fehlertext | Krankmeldung, Antrag, Person hinzufügen: Text, `role="alert"`, `aria-describedby` (Lücke geschlossen, bewiesen in 31 Fällen); Stempel-Absage als Text in der Live-Region; Korrektur: Absenden nur deaktiviert, ohne Text (offen, Befund 2) | Browserlauf, Unit-Test |

Weiterhin offen: Korrektur-Hinweis (Befund 2), Mitarbeit bei 768 px für Stempel und Korrektur nicht erreicht, vollständiger Nachlauf aller vier Kriterien nach der Korrektur, 1.4.12, 200 % Zoom, Vorlesesoftware, axe, Safari und echte Geräte. Die Tabellenzeile "3.3.? Fehler am Feld" oben ist damit für Krankmeldung, Antrag und Person hinzufügen geschlossen.
