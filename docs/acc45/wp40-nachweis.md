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
