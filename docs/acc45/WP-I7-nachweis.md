# WP-I7 Planer-Kern — Teil 1: Zählregeln über 62 Tage mit vorberechneten Aggregaten

Stufe L4, Umfangsklasse SICHERHEIT-QUALITAET. Basis `origin/integration/release-v4` (7d73f2be, nach PR #566 WP-I5). Nur synthetische Daten, kein KI-Anteil, keine externen Dienste, nichts produktiv eingeschaltet.

## Paketstatus und Umfang

- SSOT vor diesem Schritt: WP-I7 `BLOCKED` (Abhängigkeit WP-I5 `IN_PROGRESS`). WP-I5 ist mit #566 in `integration/release-v4` gemergt; der Status von WP-I5 in `work-packages.json` ist noch nicht nachgezogen (Sache des Koordinators). Die Blockade von WP-I7 bestand nur wegen WP-I5; WP-I3 und WP-I6 sind `INTEGRATED`. Damit ist WP-I7 ausführbar.
- Das Paket (Plan Block K: ganzer Plan, Blöcke vor Einzeltagen, Verbessern mit Zeitbudget und Startwert, Rangfolge Gesetz > Besetzung > Tarif/BV/Muss > Soll > Verteilung > Wunsch > Stabilität; 14–26 PT) ist für einen sicheren PR zu groß. Geliefert wird der kleinste tragende Kern, den die Betreiberentscheidung I5-4 ausdrücklich WP-I7 zuweist: **Zählregeln über 62 Tage mit vorberechneten Aggregaten**, mit klarer Schnittstelle für den späteren Planer (`aggregatZaehler`, `vorgabenPlanFortschreiben`, `planeMonat(…, { aggregate: true })`).
- Rest von WP-I7 (nicht in diesem Schritt): eigener Planer `planer.js` (ganzer Plan, Blöcke, Verbessern mit festem Budget/Startwert, Rangfolge), Wunschregel im Planer, Grenz-/Besetzungs-/Paar-/Verteilungsregel im Plan, lange Muster (> 62 Tage), Vorschlag „Montag frei“ nach Nachtdienst-Wochenende, Betriebsmodus-Schalter und Hinweis „seit dem Vorschlag geändert“ (aus WP-I6 hierher verschoben).

## Umsetzung

- Neu `server/lib/engine/planeraggregate.mjs`: Aggregate je Person und Monat (Tagesklassen, Summe je Klasse, Präfixsummen erst bei Bedarf), Zählung über einen Zeitraum mit einem Schritt je berührtem Monat; Kalenderjahr = 12 Schritte. Datumsrechnung ohne `Date` (Ganzzahlkalender): Ein Datumsobjekt kostete je Tag so viel wie die Tagesabfrage selbst (300 × 365 Tage: `personTag` 1,8 s, Datumsformat 1,7 s).
- `server/lib/vorgabenwirkung.mjs`: Zählregeln mit Kalenderjahr oder rollierend bis 372 Tage (53 Wochen, 12 Monate, 372 Tage) rechnen über die Aggregate; feste Fensterlänge (Tage/Wochen) gleitet mit zwei Tagen je Stichtag. Die Fensterentscheidung (verletzt, vergrößert, Teilzeit-Grenze, Urlaub/Krankheit, nicht ganzzahlig = offen) liegt an EINER Stelle (`fensterBewerten`) für kurzen und langen Weg; der Text und die Bestätigung kommen weiter vom Regelbaukasten (`pruefeRegel`). Lange Muster- und Blockregeln bleiben offen.
- `vorgabePlanwirkung(v, { aggregate, pause })`: Verwaltung und Prüfung sagen dasselbe (bis 372 Tage wirkt mit Aggregaten; darüber „Zeiträume über 372 Tage rechnen nur im Testlauf“).
- `src/lib/fachlogik.js` `planeMonat`: `grenzen.aggregate === true` (nur ausdrücklich) legt das Monatsbudget mit Aggregaten an; nach jeder Einteilung `vorgabenPlanFortschreiben` (Blöcke wandern zum neuen Stand, nur der Monat der geänderten Person wird neu gelesen; Übernahme nur, wenn sich ausschließlich `abweichungen` geändert hat).

### Verbindliche Vorgaben, wie umgesetzt

| Vorgabe | Umsetzung |
|---|---|
| I5-4 Aggregate innerhalb WP-I7, keine pauschale Anhebung der Lastgrenzen | `VORGABEN_WIRKUNG_GRENZE` unverändert (50 / 62 / 200000, Test); eigene Grenze `AGGREGAT_GRENZE.fensterTage = 372`; das eine Budget je Einstieg trägt auch die Aggregate |
| konsistent zwischen Planer und Prüfwegen | eine Prüfstelle (`vorgabenBefunde`) für Planer, Ersatzsuche, Warndialog, Selbstplanung; 150 Zufallsfälle gegen den Regelbaukasten; Planer-Ergebnis über den Prüfweg nachgeprüft |
| nicht unterstützte Prüfungen nie „bestanden“ | über 372 Tage, Pause, Schalter aus, Budget aufgebraucht: `vorgabeOffen` mit Grund; in der Automatik bei Muss Achtung (nicht einteilen) |
| Teilzeit anteilig nur bei `teilzeitAnteilig === true`, freie Tage nie gesenkt | dieselbe Bedingung wie WP-I5, Test im langen Weg |
| Urlaub/Krankheit aus der Zählung, Abwesenheit nie frei | Klasse „unbekannt“ für jeden abwesenden Tag, Urlaub/Krankheit verkleinern die Untergrenze anteilig; Test mit Urlaub und Schulung |
| Dienstplanung nie beeinträchtigt, Schalter AUS | `PLANER_AGGREGATE_AN = false`; Oberfläche (`assistent.jsx`) ruft `planeMonat` unverändert ohne `aggregate` (Test); ohne Freischaltung exakt das Verhalten aus WP-I5 |
| KI-Pause hält die Automatik an | bei `kiPauseAktiv(einstellungen)` (auch unlesbarer Stand) ruhen die Aggregate: offen mit Grund „Intelligence pausiert“, Automatik teilt bei Muss nicht ein; manuelle Planung bleibt möglich (Hinweis) |
| fail-closed | Kosten werden VOR der Arbeit angemeldet; reicht das Budget nicht, entsteht kein halber Block, die Vorgabe und alle folgenden sind offen |
| Mandantengrenze | Blöcke hängen in einer `WeakMap` am Betriebsstand; Test: zwei Betriebe, gleiche Personenkennung, ein Budget |
| kein Personenbezug in Ausgaben | Blöcke nur im Speicher des Einstiegs; Befundtexte wie in WP-I5 (Name der Vorgabe, kein Personenname) |
| Wiederherstellen/Import | kein neuer Schreibweg, kein neues Betriebsfeld |

## Rot → grün

`pruefungen/intelligence-planer-aggregate.test.js` (neu, 21 Tests). Auf dem Stand ohne die Quelländerungen (nur das neue Modul vorhanden): 14 rot, 6 grün (Schalter-AUS-Fälle, kurzer Weg unverändert, `aggregateFortschreiben` als Modultest, fail-closed-Planer, Demo-Messung ohne Wirkung). Danach 21 grün. Der 21. Test (300 Personen) kam nach dem ersten Lauf dazu. Ein Testfehler beim ersten grünen Lauf lag an der Testannahme (die Demo-Schichtfolge hat im Jahr schon viele Nachtdienste: die Jahresregel war bereits verletzt, der Planer setzte richtigerweise nichts); die Vorlage leert jetzt das Jahr.

Bestehende Tests: nicht verändert.

## Mutationen (je Schutz einzeln, gegen die neue Testdatei ohne Messteil, danach zurückgesetzt)

Werkzeug: `sed` je Mutation, `vitest -t '^(?!6\. Messung)'`, `git checkout` danach. Rote Tests je Mutation:

Tag d nicht aus der Zählung genommen 1 · Monat lesen ohne Kosten 2 · Präfixsumme ohne Kosten 1 · KI-Pause ignoriert 1 · Schalter AN 3 · Fortschreiben verwirft den geänderten Monat nicht 2 (der Planer teilte über die Jahresgrenze hinaus ein) · Fortschreiben ohne Prüfung der übrigen Felder 1 · Blöcke nicht je Betriebsstand (Mandantengrenze) 4 · gleitendes Fenster mit falschem Rand 1 · Budget aufgebraucht als Rechenfehler 1 · Grenze 372 Tage entfällt 1 · `planeMonat` schreibt nicht fort 1 (Quelle; das Ergebnis bleibt richtig, nur teurer) · „vergrößert“-Prüfung entfällt (gemeinsame Fensterentscheidung) 2 · Teilzeit ohne Flag skaliert 1.

Eine Mutation überlebte zuerst: „Urlaub am Tag d wird aus der Untergrenze genommen“ (0 rot). Neuer Testfall (Urlaub nur am Tag d: volle Grenze, kein Zusatz „ohne Urlaub“); danach 1 rot.

## Messung (Laptop Celeron N4120, TZ=UTC, `--maxWorkers=1`, synthetisch)

Messtest mit fester Obergrenze in der Testdatei (Abschnitt 6): höchstens 5 s mehr als ohne Vorgaben, relativ gemessen (trägt auf schnellen und langsamen Maschinen). Werte mit `MESSUNG_DATEI`:

| Lauf | ohne Vorgaben | 50 Langzeitregeln, Aggregate AUS (Stand vorher, WP-I5) | 50 Langzeitregeln, Aggregate AN | Worst-Case |
|---|---|---|---|---|
| 300 Personen (synthetisch aus demo1), 62 Tage, Ersatzsuche für den Nachtdienst, EIN Budget | 11,7 s | 13,7 s | 11,1 s (Budget aufgebraucht, Rest offen) | 50 × „mindestens 100–149 freie Tage in 372 Tagen rollierend“: 11,4 s (aufgebraucht) |
| `planeMonat` demo1 (86 Personen), Dezember, alle Nachtdienste frei gemacht | 14,9 s | — | 3,0 s (keine Einteilung: die Regeln sind im Demo-Jahr schon verletzt oder das Budget ist aufgebraucht; die 31 Stellen bleiben offen, fail-closed) | — |

Vor der Datumskorrektur (Datumsobjekte je Tag) lag der Lauf mit Aggregaten bei 20,4 s (+10,3 s über ohne Vorgaben, Messtest rot); Ursache: `toISOString` je Tag kostete so viel wie `personTag` (300 × 365 Tage: 1,7 s gegen 1,8 s). Seitdem Ganzzahlkalender und Wiederverwendung des zuletzt benutzten Monatsblocks.

Rechenaufwand je Prüfung: Kalenderjahr 12 Schritte (+ einmal 365 Tagesabfragen je Person und Einstieg); rollierend mit fester Länge n: höchstens 13 Monatsschritte + 2 (höchstens) bzw. 4 (mindestens) Schritte je weiterem Stichtag; Monate-Fenster: Monatsschritte je Stichtag. Alles linear, alles im Budget angemeldet.

## Tests und Typprüfung

Lokal, TZ=UTC, `--maxWorkers=1`:
- `pruefungen/intelligence-planer-aggregate.test.js`: 21/21 grün.
- Betroffene Dateien (rufen die geänderten Funktionen auf, `git grep`): `intelligence-vorgaben-wirkung`, `intelligence-vorgaben-einstiege`, `intelligence-vorgaben-oberflaeche`, `engine-einsatz`, `branchen-app`, `imp6-verdrahtung`, `istdaten`, `konsistenz`, `review-wp10`, `schutzpruefung-eine`, `schutzregeln-ersatzsuche`, `warnen`, `prozess-wachen`: 13 Dateien, 308 Tests grün. Dazu `engine-rechenkern`, `engine-paketliste`, `engine-kennzahlen-wp-i12c`, `imp6-planwirkung`, `imp6-zyklen-grenzfaelle`, `intelligence-ausfallvorschlag`, `intelligence-steuerung`: 7 Dateien, 269 Tests grün.
- `npx tsc -p jsconfig.json --noEmit` grün; `npx eslint` auf die geänderten Dateien: 0 Fehler (5 Warnungen in `src/lib/fachlogik.js`, alle schon auf der Basis vorhanden); `node werkzeug/verdrahtung-pruefen.mjs` ok (die neue Datei läuft über `pruefung:intelligence`, Präfix `pruefungen/intelligence-`); `node werkzeug/acc45-backlog.mjs pruefen` ok.
- Keine Oberflächendatei geändert (v4-3b-Prüfungen nicht betroffen), keine `.github/workflows`-Änderung. Vollregression in CI.

## Offene Rückfragen (nichts erfunden)

1. **Freischaltung der Aggregate.** Entscheidung: Wann wird `PLANER_AGGREGATE_AN` eingeschaltet (für alle Prüfwege zugleich)? Empfehlung: nach fachlicher Abnahme mit einem Pilotbetrieb, gemeinsam mit dem Planer-Einstieg. Alternativen: (a) sofort an — lange Zählregeln wirken in Ersatzsuche, Warndialog und Planungsassistent; (b) nur Planungsassistent. Auswirkung: Bei AUS bleiben Kalenderjahr-Regeln „nicht vollständig geprüft“, der Assistent teilt bei Muss dort nicht ein.
2. **Budget großer Betriebe.** Mit 300 Personen und 50 Langzeitregeln ist das Budget (200000) in der Ersatzsuche über 62 Tage aufgebraucht (Rest offen, fail-closed). Entscheidung: Budget unverändert lassen oder für den Planer-Einstieg gezielt erhöhen (mit Messtest)? Empfehlung: unverändert, bis der eigene Planer (Rest WP-I7) die Aggregate einmal je Lauf für alle Personen aufbaut.
3. **KI-Pause und der bestehende Planungsassistent.** Umgesetzt: Die Pause hält die neuen Aggregate an (Automatik fail-closed). Nicht umgesetzt: den ganzen Planungsassistenten bei Pause sperren — das würde die normale Dienstplanung beeinträchtigen. Entscheidung, ob „Pause hält die Automatik an“ auch den bisherigen Assistenten (`planeMonat`) meint. Empfehlung: nein (Assistent ist ACC45-Bestand ohne KI); der neue Planer (Rest WP-I7) hält bei Pause an.
4. **Lange Muster** (z. B. „höchstens 40 Frühdienste in Folge“) sind nicht Teil von I5-4 und bleiben offen. Entscheidung, ob sie mit Aggregaten (Folgenlängen je Monat) gerechnet werden sollen.
