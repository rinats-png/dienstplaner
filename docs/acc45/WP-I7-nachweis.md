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

## Opus-Review PR #572 (Kopf cb7d9d43), Befund A1: veraltete Aggregate nach dem Fortschreiben

- Befund: `aggregateFortschreiben` nahm an, eine Einteilung ändere nur den Monat der eingeteilten Person. `personTag` → `postenBesatzung` hängt aber von den Einteilungen ANDERER Personen am selben Tag ab: Wird R auf einen Posten eingeteilt, fällt P aus der Postenbesetzung und hat wieder den Quelldienst. P's Monatsblock blieb veraltet, eine Verletzung blieb unbemerkt (frisch: `vorgabeMuss`, nach dem Fortschreiben: nichts).
- Weitere Abhängigkeiten von anderen Personen in `personTag` geprüft: `planDienst` (Folge, Teilzeit, Schichtmodell), Abweichung und Abwesenheit lesen nur die eigene Person; `istEntwurfstag` hängt am Tag. Einzige Quelle ist die Postenbesetzung.
- Fix (fail-closed): Hat der Betrieb Posten-Dienstarten, übernimmt `aggregateFortschreiben` nichts; der neue Stand liest neu. Ohne Posten wie bisher. Das Budget und die Grenzen bleiben unverändert.
- Test (neu, Abschnitt 5): demo1, Posten mit Bedarf 1, P steht am Tag auf dem Posten, eine andere Person R wird dorthin eingeteilt (P hat dann den Quelldienst); Muss „höchstens n Quelldienste im Kalenderjahr“ mit n = Zahl im neuen Stand. Erwartet: nach dem Fortschreiben dasselbe Ergebnis wie frisch gerechnet (`vorgabeMuss`). Vor dem Fix rot (`[]`), danach grün.
- Mutation: Posten-Prüfung entfernt → 1 rot, zurückgesetzt.
- Läufe: `intelligence-planer-aggregate` (22), `intelligence-vorgaben-wirkung`, `engine-einsatz`, `prozess-wachen`: 4 Dateien, 128 Tests grün; `tsc` grün, `eslint` ohne Befund. Messtest unverändert grün: 300 Personen × 62 Tage ohne 9,5 s, mit 50 Langzeitregeln 10,3 s, Worst-Case 8,5 s; `planeMonat` demo1 (hat Posten, jetzt ohne Übernahme) 3,2 s gegen 10,8 s ohne Vorgaben.
- Folge: In Betrieben mit Posten liest der Planer nach jeder Einteilung neu; das Budget ist dann früher aufgebraucht (offen, sichtbar). Eine genauere Übernahme (nur Personen der Einheit am geänderten Tag neu lesen) ist möglich, aber nicht gebaut.

## Offene Rückfragen (nichts erfunden)

1. **Freischaltung der Aggregate.** Entscheidung: Wann wird `PLANER_AGGREGATE_AN` eingeschaltet (für alle Prüfwege zugleich)? Empfehlung: nach fachlicher Abnahme mit einem Pilotbetrieb, gemeinsam mit dem Planer-Einstieg. Alternativen: (a) sofort an — lange Zählregeln wirken in Ersatzsuche, Warndialog und Planungsassistent; (b) nur Planungsassistent. Auswirkung: Bei AUS bleiben Kalenderjahr-Regeln „nicht vollständig geprüft“, der Assistent teilt bei Muss dort nicht ein.
2. **Budget großer Betriebe.** Mit 300 Personen und 50 Langzeitregeln ist das Budget (200000) in der Ersatzsuche über 62 Tage aufgebraucht (Rest offen, fail-closed). Entscheidung: Budget unverändert lassen oder für den Planer-Einstieg gezielt erhöhen (mit Messtest)? Empfehlung: unverändert, bis der eigene Planer (Rest WP-I7) die Aggregate einmal je Lauf für alle Personen aufbaut.
3. **KI-Pause und der bestehende Planungsassistent.** Umgesetzt: Die Pause hält die neuen Aggregate an (Automatik fail-closed). Nicht umgesetzt: den ganzen Planungsassistenten bei Pause sperren — das würde die normale Dienstplanung beeinträchtigen. Entscheidung, ob „Pause hält die Automatik an“ auch den bisherigen Assistenten (`planeMonat`) meint. Empfehlung: nein (Assistent ist ACC45-Bestand ohne KI); der neue Planer (Rest WP-I7) hält bei Pause an.
4. **Lange Muster** (z. B. „höchstens 40 Frühdienste in Folge“) sind nicht Teil von I5-4 und bleiben offen. Entscheidung, ob sie mit Aggregaten (Folgenlängen je Monat) gerechnet werden sollen.

---

# WP-I7 Planer-Kern — Teil 2: Aggregate einmal je Lauf (Tagesnachführung)

Basis `origin/integration/release-v4` (a8a2cbaa, nach #572 und #571). Nur synthetische Daten, kein KI-Anteil, Schalter `PLANER_AGGREGATE_AN` weiter AUS, keine Oberflächendatei geändert.

## Klassifikation des Rests von WP-I7

| Teil | Einordnung | Begründung |
|---|---|---|
| Aggregate einmal je Lauf aufbauen | **ausführbar — dieser Schritt** | Voraussetzung für den eigenen Planer (Rückfrage 2 aus Teil 1); in sich abgeschlossen, gegen frische Rechnung prüfbar |
| eigener Planer `planer.js` (ganzer Plan, feste Punkte, Blöcke vor Einzeltagen, Verbessern mit festem Budget und Startwert, Rangfolge) | ausführbar, nächster Teil | Rangfolge und Ziel stehen im Plan (Block K, I7); groß, daher eigener Schritt; Laufzeitziel „< 1 Minute bis etwa 80 Personen“ ist laut Plan erst im Pilot zu messen |
| Wunschregel, Grenz-/Besetzungs-/Paar-/Verteilungsregel im Plan | ausführbar nach dem Planer | brauchen den ganzen Plan (WP-I5-Nachweis Punkt 1) |
| Hinweis „seit dem Vorschlag geändert“ | ausführbar nach dem Planer | braucht einen gespeicherten Vorschlag |
| Betriebsmodus-Schalter (automatisch / Knopfdruck / aus) speichern | teilweise blockiert | Speichern technisch möglich; **Entscheidung** offen, ob „nicht planungsreif“ den Vorschlag sperrt (WP-I6 offener Punkt 1) und welcher Modus Vorgabe ist |
| lange Muster (> 62 Tage) | **blockiert (Entscheidung)** | Rückfrage 4 aus Teil 1 |
| Vorschlag „Montag frei“ nach Nachtdienst-Wochenende | **blockiert (Entscheidung)** | in Plan und Spezifikation nicht beschrieben (Bedingung, Stärke, Geltung); nichts erfunden |
| Freischaltung der Aggregate, Budget großer Betriebe | **blockiert (Entscheidung)** | Rückfragen 1 und 2 aus Teil 1 (neue Messwerte unten) |

## Umsetzung

- `server/lib/engine/planeraggregate.mjs`: `aggregateFortschreiben` verwirft keine Monatsblöcke mehr, sondern merkt genau den geänderten Tag zum Nachlesen vor (`block.neu`). Ohne Posten-Dienstarten bei der eingeteilten Person; mit Posten-Dienstarten bei allen Personen mit einem Block dieses Monats (Review #572 A1: die Postenbesetzung hängt von den Abweichungen anderer Personen am selben Tag ab). Bisher wurde im Betrieb mit Posten gar nichts übernommen.
- Begründung der Tagesgrenze (Code gelesen): `personTag` liest die eigene Abweichung des Tags, die Folge (`planDienst`, `teilzeitDienst`, `schichtmodellLageAm` lesen keine Abweichungen) und die Abwesenheit; `postenBesatzung(m, eid, d, …)` liest nur Abweichungen des Tags `d`. Eine Einteilung ändert also nie einen anderen Tag.
- Nachlesen beim nächsten Zugriff (`aggregatZaehler`): Kosten (ein Schritt je vorgemerktem Tag) VOR dem Lesen; erst alles lesen, dann übernehmen. Wirft das Budget oder das Lesen, bleibt der Block unverändert und vorgemerkt. Präfixsummen verfallen und werden bei Bedarf mit Kosten neu gebildet.
- Ungültige Tage (kein Kalenderdatum JJJJ-MM-TT, z. B. 30. Februar) → keine Übernahme, der neue Stand liest neu (vorher: `slice(0, 7)` ohne Prüfung).
- Arbeit in `aggregateFortschreiben` selbst: je Änderung ein Schlüssel (ohne Posten) bzw. ein Durchlauf über die Blöcke des Betriebsstands (mit Posten); deren Zahl ist durch das Budget beschränkt (jeder Block kostete beim Lesen mindestens 28 Schritte, also höchstens etwa 7100 Blöcke bei 200000).
- Unverändert: Schalter AUS, ein Budget je äußerem Einstieg, Mandantengrenze (WeakMap je Betriebsstand), KI-Pause, Teilzeit/Urlaub/Abwesenheit (in `vorgabenwirkung.mjs` und `fachlogik.js` nur je ein Kommentar), `assistent.jsx` unberührt.

## Rot → grün

- Neu `pruefungen/intelligence-planer-aggregate-lauf.test.js` (8 Tests, läuft über `pruefung:intelligence`): Gleichwertigkeit in 200 Zufallsfällen (mit/ohne Posten, Abwesenheit, Präfixsummen, Verdrängung einer anderen Person) gegen frische Rechnung; Kosten; Budget aufgebraucht; Lesefehler; ungültige Tage; Vormerkung mit/ohne Posten; demo1 mit Posten: 12 Einteilungen, nach jedem Fortschreiben dieselben Befunde wie frisch (mindestens eine Verdrängung, Befunde kommen vor); `planeMonat` demo1 wiederholbar, setzt ein, Prüfweg ohne Muss-Befund.
- Gegen den Stand vor der Quelländerung: 7 von 8 rot (der `planeMonat`-Test ist auch vorher grün: er prüft Korrektheit, nicht Menge); dazu 1 rot in der bestehenden Datei.
- Bestehender Test geändert (Erwartung durch die Änderung gekippt, nicht abgeschwächt): `intelligence-planer-aggregate.test.js` Abschnitt 4 „aggregateFortschreiben …“ erwartete das Verwerfen des Monats `a|2026-11`; jetzt bleibt der Block und genau Tag 17 ist vorgemerkt (zusätzliche Erwartung). Titel des A1-Tests angepasst (Erwartung unverändert: wie frisch gerechnet).

## Mutationen (je einzeln, zurückgesetzt)

Posten: nur eingeteilte Person vorgemerkt 4 rot (Lauf mit beiden Dateien) · Nachlesen ohne Kosten 2 · Präfixsummen nicht verworfen 2 · Summen nicht nachgeführt 3 · Abwesenheit nicht nachgeführt 1 · Datumsprüfung entfällt 1 · Kosten nach dem Lesen (halb nachgeführt) 2 · Posten: Tag in allen Monaten vorgemerkt 2 · Vormerkung nicht geleert 1 · Nachlesen beim Zugriff entfällt 4. Die Mutationen 2–10 liefen wegen Speicherknappheit des Laptops nur gegen die Abschnitte 1–3 der neuen Datei; ein erster gemeinsamer Lauf wurde wegen Speicherdruck abgebrochen und verworfen.

## Messung (Laptop Celeron N4120, TZ=UTC, `--maxWorkers=1`, synthetisch demo1, 86 Personen, mit Posten)

`planeMonat` Dezember, alle Nachtdienste frei gemacht, Muss „höchstens 70 Nachtdienste im Kalenderjahr“, Aggregate ausdrücklich an:

| Stand | ohne Vorgaben | 1 Jahresregel | 5 Jahresregeln |
|---|---|---|---|
| vorher (Teil 1: mit Posten keine Übernahme) | 7,7 s, 194 gesetzt | 2,8 s, **9 gesetzt**, 30 offen wegen Budget | 2,9 s, **8 gesetzt**, 30 offen wegen Budget |
| Teil 2 (Tagesnachführung) | 7,0 s, 194 gesetzt | 4,4 s, **55 gesetzt**, 23 offen wegen Budget | 3,7 s, **29 gesetzt**, 27 offen wegen Budget |

Bestehender Messtest (Abschnitt 6, feste Obergrenze relativ zum Lauf ohne Vorgaben) grün: `planeMonat` demo1 mit 50 Langzeitregeln 2,0 s gegen 7,6 s ohne (gesetzt 0: Regeln im Demo-Jahr schon verletzt bzw. Budget); 300 Personen × 62 Tage ohne 4,8 s, mit 50 Langzeitregeln 7,4 s, Worst-Case 7,6 s (Budget jeweils aufgebraucht, Rest offen).

Befund: Das Neulesen nach jeder Einteilung ist beseitigt; das Budget reicht jetzt für ein Mehrfaches an Einteilungen. Es ist aber auch so vor Monatsende aufgebraucht — der verbleibende Hauptposten sind die Zählschritte je Prüfung (12 je Kalenderjahr, Person, Vorgabe und Kandidat), nicht mehr das Lesen. Das ist die offene Budgetentscheidung, kein Rechenfehler; der Rest bleibt fail-closed offen und sichtbar.

## Tests und Typprüfung (lokal, TZ=UTC, `--maxWorkers=1`)

- `intelligence-planer-aggregate` + `intelligence-planer-aggregate-lauf`: 2 Dateien, 30/30 grün (mit Messteil).
- `intelligence-vorgaben-wirkung`, `engine-einsatz`, `prozess-wachen`: 106/106 grün; `intelligence-vorgaben-einstiege`, `schutzregeln-ersatzsuche`, `engine-luckenursache`: 60/60 grün.
- `npx tsc -p jsconfig.json --noEmit` grün; `eslint` auf die geänderten Dateien 0 Fehler (5 Warnungen in `src/lib/fachlogik.js`, schon auf der Basis); `node werkzeug/verdrahtung-pruefen.mjs` ok; `node werkzeug/acc45-backlog.mjs pruefen` ok.
- v4-3b-*: keine Oberflächendatei geändert, lokal nicht gelaufen (CI). Vollregression in CI.

## SSOT

WP-I5 auf `INTEGRATED` (#566, Merge 7d73f2be, Review und Delta-Review im WP-I5-Nachweis). WP-I7 bleibt `IN_PROGRESS`; Teil 1 als #572 integriert eingetragen, Teil 2 lokal.

## Offene Rückfragen (Teil 2)

1. **Budget für den Planer-Einstieg** (präzisiert Rückfrage 2 aus Teil 1): Nach Teil 2 ist das Lesen kein Engpass mehr; in demo1 reicht das Budget von 200000 für 55 von 78 Einteilungen bei einer Jahresregel. Entscheidung: (a) Budget unverändert (Rest offen, fail-closed); (b) eigenes, höheres Budget nur für den Planer-Einstieg mit Messtest; (c) im eigenen Planer den Zählstand je Vorgabe und Person zwischenspeichern und wie die Blöcke nachführen. Empfehlung: (c) im nächsten Teil, bis dahin (a).
2. **„Montag frei“**: Bedingung (welche Dienste, welches Wochenende), Stärke (Vorschlag, Soll, Muss) und Geltung festlegen; ohne Festlegung wird nichts gebaut.
3. **Betriebsmodus**: Vorgabe-Modus und ob „nicht planungsreif“ den Vorschlag sperrt (aus WP-I6).

C/D: keine neuen Pakete, Werkzeuge oder Doku-Familien; nur dieser Abschnitt.

---

# WP-I7 Planer-Kern — Teil 3: eigener Planer, erste Scheibe (ohne Oberfläche)

Basis `origin/integration/release-v4` (046c3884, nach #572 und #574). Nur synthetische Daten, kein KI-Anteil, Schalter `PLANER_AN` AUS, keine Oberflächendatei geändert, `planeMonat` und `assistent.jsx` unberührt.

## Klassifikation (Stand nach Teil 2, unverändert bis auf diesen Schritt)

| Teil | Einordnung | in diesem Schritt |
|---|---|---|
| eigener Planer: ganzer Monat, feste Punkte, Blöcke vor Einzeltagen, Verbessern mit festem Budget und Startwert, Rangfolge | ausführbar, groß | **erste tragende Scheibe gebaut** (unten); offen: Tausch zweier Personen, Verschieben über Dienstarten, Anheften, Varianten (WP-I8) |
| Wunsch-, Grenz-, Besetzungs-, Paar-, Verteilungsregel im Plan; Hinweis „seit dem Vorschlag geändert“ | ausführbar nach dem Planer | nicht gebaut; Rangstufen „Verteilung“ und „Wunsch“ stehen als **nicht bewertet** (null) im Ergebnis |
| Betriebsmodus-Schalter, lange Muster, „Montag frei“, Freischaltung/Budget großer Betriebe | blockiert (Entscheidung / nicht beschrieben) | nicht gebaut, nichts erfunden |

## Umsetzung

Neu `server/lib/engine/planer.mjs` (reines ESM, Rechenkern; Plan 7.4):
- `planeVorschlag(m, ym, opt)` → `{ status, grund, ym, startwert, gesetzt[{personId, datum, dienstId, art}], offen[{datum, dienstId, fehlt, qualFehlt, grund?}], abweichungen, rang, nichtBewertet, aufwand{grenze, verbraucht, ausgeschoepft}, verbessert }`. Status `aus` (Schalter), `pausiert` (KI-Pause, auch unlesbar), `ungueltig` (Eingabe), `aufwand` (Budget reicht nicht für die Nachprüfung), `nachpruefung` (Aufbau fällt durch), `ok`. In allen Status außer `ok` wird nichts gesetzt.
- **Feste Punkte:** Der Bestand (Abweichungen, Folge, Abwesenheiten) bleibt; der Planer setzt nur zusätzliche Einteilungen für Personen ohne Dienst. Beim Zurücknehmen einer eigenen Einteilung wird der Bestandswert des Schlüssels wiederhergestellt (nicht gelöscht). „Anheften“ hat kein Datenfeld — nicht gebaut.
- **Aufbauen, Blöcke vor Einzeltagen:** erst Nachtblöcke (zusammenhängende Tage mit Lücke im selben Nachtdienst, höchstens 7), dann Wochenendblöcke (Sa + So mit Lücke im selben Dienst), dann Tag für Tag. Ein Block wird mit derselben Person fortgesetzt, solange sie dort einsetzbar ist. Einsetzbarkeit = dieselbe Prüfung wie der Planungsassistent (`ersatzVorschlaege` → `hindernisBefunde`, Automatik, Höchstzahl je Person 3). „Nach Schichtfolge und internen Vorgaben“ (Plan 7.4) wird nicht eigens ausgewertet, sondern über die Einsetzbarkeitsprüfung.
- **Ohne Blöcke und ohne Verbessern ist der Aufbau Schritt für Schritt `planeMonat`** (gleicher Kontext, gleiche Reihenfolge, gleiches Budget der Vorgaben, gleiche Fortschreibung der Aggregate).
- **Verbessern (Umbesetzen):** feste Zahl von Zügen (Vorgabe 100, höchstens 2000), Reihenfolge aus festem Startwert (`zufallAus`, mulberry32; keine Uhr, kein `Math.random`). Ein Zug nimmt eine eigene Einteilung einer Person zurück, setzt die Person auf eine offene Stelle eines anderen Tags und besetzt die frei gewordene Stelle neu. Behalten nur bei strikt weniger Lücken an beiden Tagen (Rang 2); sonst zurück zum alten Stand (Aggregate wandern mit zurück). Tausch zweier Personen und Verschieben über Dienstarten: nicht gebaut.
- **Rangfolge:** `RANGFOLGE` = Gesetz > Besetzung > Muss > Soll > Verteilung > Wunsch > Stabilität, `rangVergleich` streng lexikografisch; nicht Bewertetes (null) entscheidet nichts. Gesetz/Muss/Soll = Befunde der Nachprüfung, Besetzung = fehlende Personen + fehlende Qualifikationen über alle Tage, Stabilität = Zahl der eigenen Einteilungen (Wechsel gegenüber dem eigenen Plan; Vormonat nicht gebaut). Soll ist null, wenn eine Soll-Vorgabe ungeprüft blieb.
- **Nachprüfung (fail-closed, `nachpruefen`):** jede eigene Einteilung auf dem fertigen Stand, ohne sie: dienstfrei, Abweichung passt, kein Befund ab Achtung (Automatik). Eigenes, gleich großes Budget der Vorgaben, frisch gerechnet. Verbesserter Plan fällt durch oder ist nicht besser → aufgebauter Plan; Aufbau fällt durch → nichts gesetzt.
- **Aufwand:** ein Budget je Aufruf (Vorgabe 1 000 000 Personenprüfungen, Obergrenze ebenso): Besetzung eines Tags und Ersatzsuche = Zahl der Personen, Einsatzprüfung = 1. Angemeldet VOR der Arbeit; die Nachprüfung des jeweiligen Stands ist reserviert. Reicht es nicht, bleibt die Stelle offen (Grund `aufwand`), kein halber Block; reicht es nicht einmal für die Nachprüfung, Status `aufwand`. Eingaben (Monat, Aufwand, Züge, Startwert, Höchstzahl, Budget der Vorgaben) streng geprüft: NaN, Infinity, Bruchzahl, negativ, über der Grenze, Zeichenkette → `ungueltig`.
- **Datenschutz:** Ergebnis ohne Namen und ohne Begründungstexte zu Personen, nur Kennungen, die der Plan braucht. Keine Ablage, kein Protokoll.
- Unverändert: `PLANER_AGGREGATE_AN` AUS, Aggregate nur mit `aggregate: true`; Teilzeit, Urlaub/Krankheit, Abwesenheit wirken über die bestehende Prüfung (keine neue Zähllogik).

### Verbindliche Vorgaben, wie umgesetzt

| Vorgabe | Umsetzung |
|---|---|
| Budget je äußerem Einstieg, Kosten vorab, nicht umgehbar | ein Aufwand je `planeVorschlag`, Anmeldung vor jeder Besetzungs-/Ersatz-/Einsatzprüfung, Reserve für die Nachprüfung, strenge Eingabeprüfung |
| nicht bewertbar nie „bestanden“ | Verteilung/Wunsch null; Soll null bei ungeprüfter Soll-Vorgabe; Muss ungeprüft = Achtung = nicht einteilen; Nachprüfung fail-closed |
| KI-Pause hält Automatik an | Status `pausiert`, auch bei unlesbarem Stand (`kiPauseAktiv`, Ausnahme = Pause) |
| Mandantengrenze | kein Zustand außerhalb des Aufrufs; Aggregate je Betriebsstand (WeakMap, Teil 1); Test mit gleichen Personenkennungen |
| Tagesklasse hängt bei Posten von anderen Personen ab | jede Änderung (auch Zurücknehmen) läuft über `vorgabenPlanFortschreiben` (Teil 2) |
| Gleichwertigkeit, Dienstplanung nie beeinträchtigt | Test: ohne Blöcke/Verbessern = `planeMonat` (demo3, demo1 mit Posten); Bestand und `planeMonat` danach unverändert; Schalter AUS |

## Rot → grün

Neu `pruefungen/intelligence-planer-kern.test.js` (18 Tests, nach dem Nachtrag unten 23; läuft über `pruefung:intelligence`, Präfix `pruefungen/intelligence-`). Auf der Basis ohne `planer.mjs` alle rot (Modul fehlt). Danach 18/18 grün. Bestehende Tests und bestehende Quelldateien: nicht verändert.

## Mutationen (je einzeln, gegen die neue Datei ohne Messteil, danach zurückgesetzt und mit `cmp` geprüft)

Werkzeug: Ersetzung mit wörtlichem Text (genau ein Treffer je Mutation), `vitest -t '^(?!7\. Messung)'`, nacheinander, ein Prozess. Rote Tests je Mutation:

Schalter wirkungslos 1 · KI-Pause ignoriert 1 · Prüfung des Aufwands entfällt 1 · Anmeldung schlägt nie fehl 1 · keine Reserve für die Nachprüfung 2 · Nachprüfung: Befund ab Achtung ignoriert 1 · Nachprüfung: Dienst im Bestand ignoriert 1 · Nachprüfung: Abweichung nicht verglichen 1 · Block nicht fortgesetzt 1 · Höchstzahl je Person entfällt 12 · Bestandswert beim Zurücknehmen gelöscht statt wiederhergestellt 2 · Automatik aus (Muss ungeprüft würde eingeteilt) 1 · Startwert ignoriert 1 · Züge ignoriert 2 · Einsetzbarkeitsprüfung bei Block/Zug entfällt 10 · Prüfung des Startwerts entfällt 1.

Zuerst überlebt und durch schärfere Tests erkannt: „Reihenfolge der Dienstarten im Einzeltag umgedreht“ (Gleichwertigkeit hatte nur Lücken im Nachtdienst; jetzt zusätzlich bei jeder vierten Person alle Dienste frei → 1 rot) · „jeder Zug wird behalten“ (neue Schranke: jeder behaltene Zug schließt mindestens eine Lücke → 1 rot).

Überlebt (Absicherung doppelt, kein auslösender Datenstand gefunden): „Nachprüfung des Aufbaus ignoriert“ — der Aufbau prüft jede Einteilung schon vor dem Setzen; die Nachprüfung ist der unabhängige Riegel für Fälle, die der Aufbau nicht sieht (z. B. Postenverdrängung). Der Riegel selbst (`nachpruefen`) ist direkt geprüft (3 Mutationen rot). · „Rangvergleich am Ende entfällt“ — redundant zur strikten Annahme der Züge.

## Messung (Laptop Celeron N4120, TZ=UTC, `--maxWorkers=1`, synthetisch)

Messtest mit fester Obergrenze (Abschnitt 7): Planer höchstens 3 × `planeMonat` + 5 s, relativ gemessen.

| Lauf | `planeMonat` | Planer (Blöcke, 100 Züge, Nachprüfung) | Aufwand verbraucht |
|---|---|---|---|
| demo1 (86 Personen, Posten), Dezember, alle Nachtdienste frei | 4,3–5,5 s, 194 gesetzt, 0 offen | 4,7–5,6 s, 194 gesetzt, 0 offen | 75 870 von 1 000 000 |
| demo3 (48 Personen), Dezember, alle Nachtdienste frei | 1,1–1,8 s, 63 gesetzt, Lücke 67 | 1,3–2,2 s, 63 gesetzt, **Lücke 65** (2 Züge behalten) | 49 377 |
| demo2 (57 Personen) | 2,5 s, 93 gesetzt | 1,8 s, 93 gesetzt | 26 746 |

Mit einer Muss-Jahresregel (demo3, Aggregate an): 53 Nachtdienste gesetzt, keine Muss-Verletzung (frisch nachgeprüft); ohne Aggregate 0 gesetzt (Muss ungeprüft, fail-closed). Laufzeitziel des Plans („< 1 Minute bis etwa 80 Personen“) ist hier eingehalten, laut Plan aber im Pilot zu messen.

## Tests und Typprüfung (lokal, TZ=UTC, `--maxWorkers=1`, ein Prozess, freier Speicher vor jedem Lauf ≥ 2,1 GB)

- `intelligence-planer-kern`: 18/18 grün (mit Messteil).
- `intelligence-planer-aggregate`, `intelligence-planer-aggregate-lauf`, `intelligence-vorgaben-wirkung`, `intelligence-positivliste`, `intelligence-leck`, `prozess-wachen`: 6 Dateien, 209/209 grün.
- `engine-*`: 5 Dateien, 93/93 grün. Übrige `intelligence-*` (ohne Browserprüfung): 41 Dateien, 1250/1250 grün.
- `npx tsc -p jsconfig.json --noEmit` grün; `eslint` auf die neuen Dateien 0 Befunde; `node werkzeug/verdrahtung-pruefen.mjs` ok; `node werkzeug/acc45-backlog.mjs pruefen` ok.
- v4-3b-*: keine Oberflächendatei geändert, nicht gelaufen (CI). Keine `.github/workflows`-Änderung. Vollregression in CI.

## SSOT

WP-I7 bleibt `IN_PROGRESS`; Teil 2 als #574 integriert eingetragen, Teil 3 lokal (Belege und Tests ergänzt).

## Offene Rückfragen (Teil 3, nichts erfunden)

1. **Verteilung (Rang 5)**: Plan 7.4 nennt „gleichmäßige Verteilung von Nächten, Wochenenden und Feiertagen“, aber kein Maß. Zur Entscheidung: (a) Spanne (höchste − niedrigste Zahl) je Art über die Personen im Dienst, Teilzeit anteilig nur mit `teilzeitAnteilig === true`; (b) erst über die Verteilungsregel im Plan (nach dem Planer). Empfehlung: (b), bis dahin bleibt die Stufe „nicht bewertet“.
2. **Muss nicht erfüllbar (Rang 3)**: Plan 7.4 sieht die Einstellung „Lücke lassen (Standard) / mit gekennzeichneter Abweichung füllen“ vor. Gebaut ist nur „Lücke lassen“. Entscheidung, ob und wann die zweite Möglichkeit kommt (gehört zum Betriebsmodus).
3. **Anheften**: Datenfeld und Recht dafür sind nicht beschrieben; ohne Festlegung nicht gebaut.
4. ~~Postenverdrängung bei festen Punkten~~ — **behoben** (Abschnitt „Nachtrag: Bestandspersonen bei Posten“ unten; Vorgabe des Koordinators).
5. Unverändert offen aus Teil 1/2: Freischaltung der Aggregate und des Planers, Budget großer Betriebe, „Montag frei“, Betriebsmodus.

C/D: keine neuen Pakete, Werkzeuge oder Doku-Familien; nur dieser Abschnitt.

## Nachtrag: Bestandspersonen bei Posten (Rückfrage 4 behoben, gleiche Fehlerklasse wie Review #572 A1)

**Befund (nachgestellt, vor dem Fix):** demo1, Posten „PF“ (Quelle F) braucht eine Qualifikation, die die Rotation nicht sicher hat. Der Planer füllte die Qualifikationslücke 35-mal mit einer Einteilung auf den Posten; jede senkte den Rest der Rotation, eine Person des Bestands fiel auf ihren Quelldienst F zurück. Niemand prüfte diese Person (fail-open: eine Muss-Vorgabe zu F hätte still verletzt sein können). Der bestehende `planeMonat` tut dasselbe (unverändert; Assistent ist Bestand).

**Fix (`planer.mjs`):**
- Neu `verdraengt(bestand, stand, d, eigene)`: frische Rechnung des Tags `d` für ALLE Personen ohne eigene Einteilung an diesem Tag, Dienst gegen den Bestand (`personTag`). Gegen den Bestand statt „ohne diese eine Einteilung“: erfasst auch das Zusammenwirken mehrerer Einteilungen am Tag, mehrere Posten, Verdrängen und Hineinziehen (Zurücknehmen erhöht den Rest der Rotation).
- **Aufbau:** nach jedem Setzen (auch Blockfortsetzung) geprüft; verdrängt die Einteilung jemanden, wird sie zurückgenommen (Bestandswert wiederhergestellt) und der nächste Kandidat versucht, höchstens 3 je Stelle (Verdrängung ist meist strukturell: jede zusätzliche Posten-Einteilung senkt die Rotation); danach bleibt die Stelle offen mit Grund `verdraengung`.
- **Verbessern:** ein Zug wird nur behalten, wenn an beiden berührten Tagen niemand verdrängt oder hineingezogen ist.
- **Nachprüfung:** an jedem Tag mit eigener Einteilung alle Bestandspersonen gegen den Bestand; jede Abweichung = nicht bestanden (`verdraengte` im Ergebnis von `nachpruefen`).
- **Aufwand vorab:** 2 P je Prüfung im Aufbau, 4 P je Zug, Reserve der Nachprüfung jetzt `n · (P+1) + 3 · Tage · P`.
- Ohne Posten ändert eine Einteilung niemand anderen; geprüft wird trotzdem immer (kein Sonderweg, der umgangen werden kann).

**Zustandsraum, selbst durchgegangen:** Posten ja/nein (ohne: immer 0, Gleichwertigkeit zu `planeMonat` bleibt) · eine und mehrere Verdrängte, mehrere Posten-Einteilungen am Tag (Test: 1 und 2) · Hineinziehen beim Zurücknehmen (Verbessern, Nachprüfung gegen den Bestand) · Monatsgrenze (Postenbesetzung hängt nur am Tag; Test: Folgetag im neuen Monat 0) · Budget leer mitten in der Nachprüfung (Aufwand reserviert; Budget der Vorgaben leer → Muss ungeprüft = durchgefallen, Test mit 0 und 500) · eigene Einteilungen auf dem Posten selbst (Abweichung = feste Zuweisung, von der Rotation unabhängig) · Abwesenheit (in beiden Ständen gleich).

**Rot → grün:** neue Tests in Abschnitt 8 (5 Tests). Gegen die Fassung vor dem Fix: 3 rot (Planer mit/ohne Blöcke verdrängt Bestandspersonen, `verdraengt` fehlt); der Test „Budget der Vorgaben leer“ war schon vorher grün (die Nachprüfung war dort bereits fail-closed). Danach 23/23 grün.

**Testkorrektur:** Die Vorlagen der Prüfung riefen `personTag` auf, während sie die Abweichungen noch änderten; der Zwischenspeicher der Postenbesetzung hängt am Objekt. Jetzt wird der vorbereitete Betrieb frisch geklont (`structuredClone`). Ohne diese Korrektur meldete ein neuer Test eine Verdrängung, die nur im veralteten Speicher bestand.

**Mutationen (je einzeln, zurückgesetzt):** Prüfung im Aufbau entfällt 1 rot (die Nachprüfung fängt es ab, Ergebnis dann leer: fail-closed; rot wird der erwartete Grund „verdraengung“) · Nachprüfung ignoriert die Verdrängung 1 · Zug ohne Prüfung behalten 1 (neuer Test „Verbessern mit Posten“: sonst Rückfall auf den Aufbau, kein Zug behalten) · eigene Einteilungen nicht ausgenommen 13 · Vergleich wirkungslos 3. Nach der Änderung erneut geprüft: Reihenfolge 2, jeder Zug behalten 1, Block 2.

**Messung:** demo1 `planeMonat` 8,0 s gegen Planer 7,5 s (Lauf unter Last), 194/194 gesetzt, Aufwand 122 998 von 1 000 000; Messtest (3 × + 5 s) grün.

## Nachtrag: Postenverdrängung im bestehenden `planeMonat` (Opus-Review #577, Schwere B; Betreiberentscheidung 26.11.)

**Klassifikation:** Korrektur im bestehenden Paket (WP-I5/WP-I7), kein neues Paket, kein Assistenten-Umbau. Befund: `planeMonat` füllt eine Qualifikationslücke auf dem Posten (PF, Quelle F, `mindestQual`) mit einer Einteilung; die Postenbesetzung verdrängt dadurch eine Person der Rotation auf F, und niemand prüfte diese Person (Ruhezeit mit F-Zeiten, Muss-Vorgaben zu F, Einweisung am Ort) — fail-open. Vorgabe: nicht auf den neuen Planer warten, `verdraengt` wiederverwenden, verdrängte Personen prüfen, Muss nie ungeprüft verletzen.

**Invarianten (vor der Umsetzung festgelegt):**
1. *Ohne Posten* (keine Dienstart mit `posten`): `personTag` hängt nur über die Postenbesetzung von anderen Personen ab — eine Einteilung ändert niemand anderen. Keine Prüfung, kein Aufwand, Ergebnis byte-gleich wie bisher (auch mit Aufwand 0).
2. *Mit Posten, keine Verdrängung*: Ergebnis gleich wie bisher (gleiche Einteilungen, Abweichungen, offene Stellen, Gründe); nur Aufwand für den Tagesvergleich.
3. *Mit Posten, Verdrängung einer oder mehrerer Personen* (auch durch das Zusammenwirken mehrerer Einteilungen am Tag oder mehrerer Posten): Nach jeder Einteilung wird der Tag frisch gegen den Bestand gerechnet (`verdraengt`, Bestand = Eingang von `planeMonat`, eigene Einteilungen ausgenommen). Jede veränderte Person wird für ihren NEUEN Dienst geprüft wie eine Einteilung (`hindernisBefunde` auf dem neuen Stand, gemeinsames Monatsbudget der Vorgaben, Automatik: Muss ungeprüft = Achtung). Ab Achtung (Muss, Gesetz, Ruhezeit, Einweisung …) ⇒ diese Einteilung wird NICHT gesetzt, der Stand und die Aggregate werden zurückgenommen, die Stelle bleibt offen mit Grund `verdraengung` (fail-closed). Nur Hinweise (Soll) ⇒ eingeteilt wie bisher; der Grund der Einteilung nennt „verdrängt ‹Person› in ‹Dienst›“ und die Hinweise.
4. *Person ohne Dienst danach oder unbekannter Dienst* (Hineinziehen/Herausfallen; `planeMonat` setzt nur Personen ohne Dienst, entfernt nie etwas): nicht prüfbar ⇒ nicht setzen (`verdraengung`).
5. *Budget der Vorgaben leer* mitten in der Prüfung einer verdrängten Person: Muss ungeprüft = Achtung ⇒ nicht setzen, Grund `vorgabe`. Nie „bestanden“ für Ungeprüftes.
6. *Aufwand der Verdrängungsprüfung*: EIN Budget je Aufruf (`PLANEMONAT_VERDRAENGUNG_AUFWAND` = 1 000 000 Personenprüfungen, je Aufruf `grenzen.verdraengungAufwand`), Vergleich des Tags = P, Prüfung einer verdrängten Person = 1, jeweils VOR der Arbeit angemeldet; reicht es nicht ⇒ nicht einteilen, Grund `aufwand` (auch mitten im Lauf; danach bleibt es leer).
7. *Monatsgrenze/Folgetag*: Die Postenbesetzung hängt nur am Tag; geprüft wird der Tag der Einteilung. Die Prüfung der verdrängten Person enthält Ruhezeit und Zählregeln über die Nachbartage (auch im Folgemonat), wie jede Einteilung.
8. *Muss/Soll/automatisch, Aggregate an/aus*: Die Prüfung läuft mit `vorgabenAutomatisch: true` und dem Monatsbudget von `planeMonat` (mit `grenzen.aggregate` die Aggregate des Planer-Kerns; Vorgabe bleibt AUS, `PLANER_AGGREGATE_AN` unverändert). Die Aggregate werden vor der Prüfung fortgeschrieben und bei Ablehnung zurückgeschrieben (wie im Planer `zurueck`).
9. Kein weiterer Kandidat nach einer Ablehnung (anders als der Planer mit 3 Versuchen): Verdrängung ist strukturell (jede weitere Einteilung auf den Posten senkt die Rotation gleich); bewusst kleinster Eingriff, schlimmstenfalls bleibt eine Stelle mehr offen — nie eine ungeprüfte.

**Änderung:**
- `verdraengt` aus `server/lib/engine/planer.mjs` nach `server/lib/engine/einsatz.mjs` verschoben (Text gleich, wahlweise 5. Parameter `liste` sammelt die veränderten Personen mit Dienst vorher/nachher); `planer.mjs` reicht es unverändert weiter (`PL.verdraengt` bleibt). `einsatz.mjs` ist schon im Browser-Bündel (fachlogik.js importiert es), keine neue Abhängigkeit.
- `src/lib/fachlogik.js` `planeMonat`: Prüfung nach Invarianten 1–9; neues Feld nur `grund` bei offenen Stellen (`verdraengung`/`aufwand`, wie bisher `vorgabe`) und die Kennzeichnung im bestehenden `grund` der Einteilung. Rückgabeform unverändert. Oberfläche (`src/ansichten/assistent.jsx`, V4-3b-gepinnt) unverändert: die offene Stelle erscheint wie bisher unter „Nicht deckbar“ (der Grund wird dort nicht angezeigt — Hinweis, C/D, keine UI-Änderung).

**Rot → grün:** 6 neue Tests in `pruefungen/intelligence-planer-kern.test.js` Abschnitt 8. Mit abgeschalteter Prüfung (= Verhalten vor dem Fix, Mutation M1) 3 rot, darunter der Befund-Fall (demo1, PF mit `mindestQual`, Muss „höchstens 0 F in 7 Tagen“: verdrängte Personen mit Befund ab Achtung für ihren neuen Dienst); danach grün.

**Mutationen (nacheinander, je Lauf zurückgesetzt und gegen die Sicherung verglichen, Quelle danach sauber):** M1 Prüfung aus 3 rot · M2 Befunde der Verdrängten ignoriert 1 · M3 Aufwand nie knapp 1 · M4 eigene Einteilung nicht ausgenommen 1 · M5 Ablehnung ohne Rücknahme des Stands 1 · M6 Hinweise nicht gekennzeichnet 1. Nicht eigens mutiert: Invariante 4 (Person ohne Dienst danach) — in `planeMonat` nicht auslösbar (setzt nur, entfernt nie).

**Messung (Laptop, TZ=UTC, `--maxWorkers=1`, synthetisch, demo1 86 Personen, Dezember mit allen Nachtdiensten frei, PF mit `mindestQual`):** alter `planeMonat` 6,6 / 9,3 / 7,9 s, neuer 7,6 / 8,0 / 8,4 s (Lauf unter Last, ein zweiter Schreiber parallel); beide 250 gesetzt, 58 auf dem Posten, 8 offen (ohne Muss-Vorgabe bestehen alle Verdrängten). demo1 ohne `mindestQual`: Ergebnis alt und neu byte-gleich (JSON). Messtest im Repo: mit Prüfung höchstens 2 × derselbe Lauf ohne Posten-Kennzeichen + 5 s.

**Offene Rückfragen:** (1) Die Prüfung ist streng: Befunde ab Achtung, die die verdrängte Person schon im Bestand auf dem Posten hatte (z. B. „Dienste in Folge“), sperren die Einteilung ebenfalls (fail-closed statt Vergleich alt/neu). Lockern nur mit Entscheidung. (2) Anzeige des Grundes `verdraengung` in der Oberfläche (assistent.jsx gepinnt) — erst mit Freigabe der Oberfläche.

**Tests und Prüfungen (lokal, TZ=UTC, `--maxWorkers=1`, ein Prozess):** `intelligence-*` (ohne Browserprüfung) + `engine-*` + `prozess-wachen` (QS-5): 53 Dateien, 1587/1587 grün (Messtest im Lauf: ohne Posten-Kennzeichen 11,3 s, mit Prüfung 8,9 s). `npx tsc -p jsconfig.json --noEmit` grün; `eslint` auf die geänderten Dateien 0 Fehler (5 Warnungen, alle schon vorher, gleiche Zahl); `node werkzeug/verdrahtung-pruefen.mjs` ok; `acc45-backlog status-schreiben` + `pruefen` ok. v4-3b-*: keine Oberflächendatei geändert, nicht gelaufen (CI). Vollregression in CI.

### Delta-Review #579 (Kopf 5caddcc1), Befund B-1: Besetzungsänderung ohne Dienständerung

**Befund:** `verdraengungPruefen` prüfte nur Personen, deren DIENST sich änderte. Eine Verdrängung ändert aber auch, WER im Dienst steht (Posten: die eingeteilte Person rückt nach, die verdrängte geht). Davon hängen Befunde von Personen mit gleichem Dienst ab — die eingeteilte Person selbst (in der Ersatzsuche noch neben der später verdrängten geprüft) und die übrigen Personen auf dem Posten. Betroffen: `keinAlleindienst` (Stufe „recht“, sperrt; `alleinOhnePartner` hängt von der Besetzung ab). Szenario des Reviewers (demo1, PF mindest 1, `mindestQual` 1, alle Personen mit der Qualifikation `keinAlleindienst`): 19 neue Alleindienst-Befunde im Endstand, keine offene Stelle mit Grund. Invariante 3 war damit falsch.

**Zustandsraum der geänderten Prüfung (vor dem Commit durchgegangen):**
- *Besetzungsabhängige Regeln* (grep `besetzung`/`alleinOhnePartner`/`personenImDienst` in `hindernisBefunde`, `fachpruefung.mjs`, `vorgabenwirkung.mjs`, Befundkatalog): `keinAlleindienst` (recht, sperrt) und Branchenhinweise (höchstens Hinweis). Ruhezeit, Folge, Woche, Tagesgrenze, Qualifikation, Einweisung, Schutz hängen nur am eigenen Plan. Vorgaben (`vorgabenBefunde`) zählen nur den eigenen Plan der Person (`besetzungsregel` wirkt nicht über `hindernisBefunde`). Mindest-/Soll-Besetzung ist kein Personenbefund; sie bleibt in der Füllschleife (`besetzung` je Dienst, `qualFehlt`).
- *Wer wird geprüft:* Nur wenn `verdraengt` > 0 (sonst unverändert, Gleichwertigkeit). Dann jede Person JEDES Dienstes, dessen Besetzung am Tag `d` sich durch DIESE Einteilung geändert hat (Stand davor gegen neuen Stand): die eingeteilte Person selbst, die übrigen Personen auf dem Posten, die Personen des Quelldienstes, mehrere Posten am Tag gleich. Verdrängte Personen werden wie bisher voll geprüft (mit Vorgaben).
- *Was sperrt:* Befunde ab Achtung auf dem neuen Stand, die auf dem Stand davor für dieselbe Person und denselben Dienst nicht bestanden (Schlüssel Regel + Text). Bestehende Befunde (aus dem Bestand) sperren nicht, damit ein Dienst nicht wegen fremder Altlasten nie mehr gefüllt werden kann. Für die eingeteilte Person ist „davor“ die Prüfung der Ersatzsuche (ohne Achtung), also zählt jeder Befund ab Achtung.
- *Vorgaben* gehen in diesen Vergleich nicht ein (eigenes leeres Budget, ohne Automatik; Regeln `vorgabe*` ausgefiltert): Sie hängen nur vom eigenen, unveränderten Plan ab. Kein Verbrauch des Monatsbudgets, deshalb bleibt die Gleichwertigkeit erhalten. Das leere Budget kommt aus einer Hilfsfunktion außerhalb von planeMonat; die Quellprüfung „genau EIN neuesVorgabenBudget in planeMonat“ (intelligence-planer-aggregate) bleibt unverändert und gilt weiter für das eine Budget, das Arbeit leistet.
- *Budget leer mitten in der Prüfung:* Kosten 2 je Person (vorher/nachher), VOR der Prüfung angemeldet; reicht es nicht, wird nicht eingeteilt (Grund `aufwand`). Invariante 7 entsprechend: Tagesvergleich P + Mitglieder 2 je Person + Verdrängte 1 je Person.
- *Ablehnung:* Grund `verdraengung`, Stand und Aggregate vollständig zurückgenommen (wie bisher).
- *Monatsgrenze:* Die Besetzung hängt nur am Tag `d`; Partner und Postenmitglieder anderer Tage ändern sich nicht.
- *Soll ≥ 2:* geprüft (Test mit Soll 1 und 2).
- C-3 (nur dies, trivial): `grenzen.verdraengungAufwand` ist nach oben auf `PLANEMONAT_VERDRAENGUNG_AUFWAND` begrenzt. C-1, C-2, C-4 bis C-6 nicht umgesetzt.

**Nebenbefund (nicht aus der Verdrängung, nicht behoben, Rückfrage):** Der neue Endstandtest fand bei Soll 2 zweimal „folge“ (Dienste in Folge DAVOR) bei Personen mit unverändertem Dienst. Die Regel blickt nur rückwärts: Eine eigene Einteilung VOR einem bestehenden Dienst derselben Person verlängert deren Folge, ohne dass jemand den späteren Tag erneut prüft. Das ist bestehendes Verhalten von `planeMonat`, unabhängig von Posten. Der Test nimmt „folge“ nur aus, wenn die Person in den Tagen davor wirklich eine eigene Einteilung hat. Entscheidung, ob die Rückwärtsregel in `planeMonat` auch vorwärts gelten soll, offen (gehört nicht zu B-1).

**Rot → grün:** 3 neue Tests (Szenario des Reviewers mit Soll 1 und 2: kein neuer Befund ab Achtung im Endstand, frisch für JEDE Person mit Dienst; Aufwand der Mitgliederprüfung angemeldet + Obergrenze C-3). Mit abgeschalteter Mitgliederprüfung (Mutation N1, entspricht 5caddcc1) 3 rot; danach grün.

**Mutationen (nacheinander, je Lauf zurückgesetzt und gegen die Sicherung verglichen):** N0 ohne Änderung 12/12 grün · N1 Mitgliederprüfung aus 3 rot · N2 Kosten nicht angemeldet 1 rot · N3 Vergleich gegen den alten statt den neuen Stand 2 rot.

**Gleichwertigkeit (alt = `origin/integration/release-v4`, neu = dieser Stand, Ergebnis als JSON verglichen):** 4 Betriebe (leer, demo1 mit Posten, demo2, demo3) × Lücken ja/nein × Höchstzahl 3/31 = 16 Kombinationen, alle byte-gleich (keine davon verdrängt). demo1 mit `mindestQual` (Verdrängung, ohne Vorgabe): dieselben 250 Einteilungen, 8 offen, keine Ablehnung. Laufzeit demo1 mit Lücken alt 7,4 / 8,7 s, neu 8,6 / 8,1 s; mit `mindestQual` alt 9,7 s, neu 9,8 s.

**Tests (lokal, TZ=UTC, `--maxWorkers=1`, ein Prozess):** intelligence-planer-kern, intelligence-planer-aggregate(+lauf), intelligence-vorgaben-wirkung/-einstiege, intelligence-planungsreife-anzeige, engine-einsatz, engine-rechenkern, prozess-wachen: 9 Dateien, 217/217 grün (Messtest: ohne Posten-Kennzeichen 6,7 s, mit Prüfung 6,4 s). `tsc -p jsconfig.json` grün; eslint 0 Fehler (5 Warnungen wie vorher); `verdrahtung-pruefen` ok; `acc45-backlog status-schreiben` + `pruefen` ok.

### Nachtrag: Dienste in Folge auch vorwärts (Review #579, Betreiberentscheidung 26.11.)

**Klassifikation:** Korrektur im bestehenden Paket (WP-I5/WP-I7), kein neues Paket, kein Umbau des Assistenten. Befund (Review #579, oben als Nebenbefund offen): Die Regel `folge` (Dienste in Folge, Stufe Achtung, sperrt nicht, Einstellung `maxFolge`) zählt in `hindernisBefunde` nur rückwärts (`server/lib/engine/einsatz.mjs`, Schleife über `addDays(d, -i)`). Setzt `planeMonat` eine Einteilung für Person X am Tag d und hat X im Bestand Dienste an d+1 … d+k, wird die Folge an d+k länger als `maxFolge`; diesen späteren Tag prüfte niemand. Entscheidung 26.11. (verbindlich): Planer bzw. Planungsassistent berücksichtigen relevante nachfolgende Dienste; zwingende Regeln dürfen nicht durch eine zeitlich davor eingefügte Einteilung unbemerkt verletzt werden; vorhandene Prüfungen wiederverwenden.

**Zustandsraum: welche Regel hängt von Tagen NACH der Einteilung ab (aus `hindernisBefunde`, `einteilungsBefunde` und dem Befundkatalog `server/lib/bestaetigungen.mjs` abgeleitet, vor der Umsetzung festgelegt; nach Opus-Review #584 B-1 um die Planbefunde aus `server/lib/engine/befunde.mjs` `pruefen` ergänzt):**

| Regel (Katalog) | wirkt vorwärts? | vor der Korrektur gedeckt? | Beleg |
| --- | --- | --- | --- |
| `bestand`, `abwesend`, `verfuegbarkeit`, `teilzeit`, `tagesgrenze` | nein, nur eigener Tag | — | `hindernisBefunde` liest nur Tag d |
| `schutz`/`schutzWeich`/`schutzOffen`/`schutzHinweis`, `keineNacht` (auch persönliche Planungsregeln) | nein | — | `schutzEinsatz(person, dienstart, datum, einst)` (`schutzpruefung.mjs`) bekommt keinen Plan |
| `qualifikationGesetzlich`/`-Betrieblich`, `kompetenz` | nein, nur eigener Tag | — | `fachpruefung.mjs` Qualifikation/Einweisung |
| `keinAlleindienst`, `branche` | nein, Besetzung desselben Tags (dort B-1) | — | `alleinOhnePartner`/`personenImDienst` lesen Tag d |
| `ruhezeitGesetz` (recht, sperrt), `ruhezeitBetrieb` | ja (d+1, d+2) | **ja**: Versatz `[-2, -1, 1, 2]`, dieselbe Rechnung für das Paar aus beiden Richtungen, gleiche Stufe | `fachpruefung.mjs` Z. 515 ff. |
| `maxDiensteWoche` (recht, sperrt) | ja (ganze Woche Mo–So) | **ja**: Bedingung „übrige Dienste der Woche ≥ Höchstzahl“ ist für jeden Tag der Woche dieselbe | `fachpruefung.mjs` Z. 531 ff. |
| `folge` (Achtung) | ja (d+1 … d+maxFolge) | **nein** — einziger einseitiger Befund | `einsatz.mjs` Z. 157–164 |
| Vorgaben (`vorgabeMuss`/`-Soll`/`-Offen`): Zählregel rollierend, Kalendermonat/-jahr (auch Aggregate), Musterregeln (`hoechstensFolge`, `verbotenFolge` — „Arbeitstage/Wochenenden am Stück“ als Vorgabe; Nachtdienste in Folge siehe `nachtfolge` unten), Blockregel | ja | **ja**: rollierend alle Fenster mit d (Stichtage d … d+n−1), Kalenderzeitraum ganz, Muster d ± halb mit Vergleich mit/ohne, Block die Woche; Muss = Achtung in der Automatik | `vorgabenwirkung.mjs` `fensterUm` Z. 233 ff., Stichtagsschleifen Z. 427/476 |
| `nachtfolge` (Planbefund „warn“, Einstellung `maxNachtFolge`, Standard 4, AZ-NACHTFOLGE-01) | ja (Lauf von Nachtdiensten über d hinweg) | **nein — vom Assistenten in keiner Richtung geprüft** (`hindernisBefunde` kennt die Regel nicht); bestehende Lücke, byte-gleich zur Basis; Entscheidung ausstehend | `befunde.mjs` `pruefen` Z. 108–122 (Zähler `nl`, Meldung Z. 118–120) |
| `ersatzruhe` (§ 11 Abs. 3 ArbZG, gesetzlich zwingend: Ersatzruhetag binnen zwei Wochen nach Sonntags-, acht Wochen nach Feiertagsdienst) | ja (Fenster bis 56 Tage vor/nach) | **nein — in keiner Richtung geprüft**; bestehende Lücke, byte-gleich zur Basis; Entscheidung ausstehend | `befunde.mjs` Z. 202–216 (`ersatzruhetage`, Rand 56 Tage) |
| `sonntagsfrei` (§ 11 Abs. 1 ArbZG, mindestens 15 freie Sonntage im Jahr) | ja (Jahreszählung) | **nein — in keiner Richtung geprüft**; bestehende Lücke, byte-gleich zur Basis; Entscheidung ausstehend | `befunde.mjs` Z. 219–232 (`freieSonntage`) |
| Wochenstundengrenze (`stundengrenzeHinweis`) | ja (Woche) | nur Hinweis, ganze Woche | `einsatz.mjs` Ersatzsuche |
| Mindest-/Sollbesetzung | kein Personenbefund | Füllschleife | — |

Ergebnis (eingeschränkt nach Opus-Review #584 B-1): Für die im Assistenten geprüften Regeln (`hindernisBefunde`) ist die Vorwärtswirkung gedeckt. Nicht im Assistenten geprüft sind die Planbefunde `nachtfolge`, `ersatzruhe` und `sonntagsfrei` (in keiner Richtung, also auch nicht von `folgeVorwaerts`; bestehende Lücke, keine Regression). Messung des Reviewers (byte-gleich zur Basis): demo3 Dezember, Nachtdienste frei, Höchstzahl 31: 8 neue `nachtfolge`-Befunde (z. B. 6 Nächte in Folge bei `maxNachtFolge` 4) und 1 `sonntagsfrei`; demo1: 1 `nachtfolge`. Entscheidung beim Betreiber (Entscheidungsvorlage): (a) als Regel in `hindernisBefunde` aufnehmen, Vorwärtsfenster max(`maxFolge`, `maxNachtFolge`) bzw. die Fristen von § 11 — ändert Warndialog, Ersatzsuche und Golden-Werte (kein Assistenten-Umbau ohne Freigabe); (b) zurückstellen.

**Verhalten (festgelegt und begründet):**
1. *Fenster:* die zusammenhängenden Diensttage der Person ab d+1, solange ihr Lauf rückwärts auf dem Stand davor unter `maxFolge` bleibt (`j − 1 < maxFolge`, dieselbe Grenze wie die Rückwärtsschleife). Am Tag d+j zählt der Stand davor j−1 Dienste; ab j−1 ≥ `maxFolge` bestand der Befund schon, und ein früherer Tag desselben Laufs schlägt zuerst an. Ohne Dienst an d+1: keine Prüfung, kein Aufwand, Ergebnis wie bisher.
2. *Prüfung:* für jeden dieser Tage `hindernisBefunde` frisch auf dem Stand davor und mit der Einteilung (keine neue Regellogik), Befunde ab Achtung ohne Vorgaben (Regel + Text; Vorgaben sind an d schon symmetrisch geprüft, so bleibt das eine Monatsbudget der Vorgaben unberührt). Ein Befund, der davor nicht bestand, lehnt ab; ein schon bestehender sperrt nicht (wie die Verdrängungsprüfung B-1). Der Befund auf einem späteren Tag ist damit genau der, den die Einteilung dort neu auslöst — analog der Verdrängungsprüfung, Grund `folgeVorwaerts`.
3. *Kandidatenwechsel:* Anders als bei der Verdrängung (strukturell, kein weiterer Kandidat) hängt die Vorwärtsprüfung an der Person: Scheitert ein Kandidat, wird der nächste der Ersatzsuche geprüft; erst wenn alle scheitern, bleibt die Stelle offen mit Grund `folgeVorwaerts`. Die Prüfung sitzt in der Kandidatenwahl von `planeMonat`, nicht in `ersatzVorschlaege` (die Ersatzsuche der Oberfläche und die Golden-Werte bleiben unverändert; geprüft wird nur, bis ein Kandidat besteht).
4. *Aufwand:* `folgeVorwaerts` meldet 2 Tagesprüfungen je Folgetag VOR der Arbeit an; reicht der Zähler nicht ⇒ nicht einteilen, Grund `aufwand` (fail-closed). Eigener Zähler je Aufruf nach dem Muster der Verdrängung: `PLANEMONAT_FOLGE_AUFWAND` = 1 000 000, je Aufruf `grenzen.folgeAufwand` (nach oben begrenzt). Bewusst nicht der Zähler der Verdrängung: Der bestehende Test „ohne Posten: Verdrängungsprüfung ohne Aufwand (auch Aufwand 0 gleich)“ hätte sonst abgeschwächt werden müssen (Rückfrage 1).
5. *Hineingezogene Personen* (Posten, vorher frei, danach mit Dienst) werden in der Verdrängungsprüfung wie eine Einteilung vorwärts geprüft. In `planeMonat` nicht auslösbar (die Postenbesetzung zieht nur aus dem Quelldienst), daher nicht mutiert.
6. *Unbekannter Dienst* an einem Folgetag: nicht prüfbar ⇒ ablehnen.
7. *Monatsgrenze:* Folgetage im Folgemonat zählen (der Bestand dort ist bekannt); der Endstandtest prüft bis 10.01.
8. *Planer* (`planer.mjs`, Schalter AUS): dieselbe Funktion im Aufbau (Kandidat scheitert ⇒ nächster, zählt nicht als Versuch; alle ⇒ Grund `folgeVorwaerts`), in der Blockfortsetzung und im Verbessern (`einsetzbar`, Ersatz der frei gewordenen Stelle) und in der Nachprüfung (fail-closed; Reserve je Einteilung + 2 · ⌈maxFolge⌉). Die Gleichwertigkeit „ohne Blöcke und Verbessern = `planeMonat`“ bleibt.

**Änderung:**
- `server/lib/engine/einsatz.mjs`: neue `folgeVorwaerts(vorher, p, d, da, leisten, stand)` neben `verdraengt` (eine Implementierung für Assistent und Planer; schon im Browser-Bündel).
- `src/lib/fachlogik.js` `planeMonat`: Kandidatenwahl mit Vorwärtsprüfung, eigener Aufwandszähler, Vorwärtsprüfung Hineingezogener in `verdraengungPruefen`; Rückgabeform unverändert, neuer Wert nur im bestehenden Feld `grund` offener Stellen (`folgeVorwaerts`).
- `server/lib/engine/planer.mjs`: wie unter 8.
- Nicht geändert (Hinweis, C/D): `src/ansichten/assistent.jsx` (V4-3b-gepinnt) zeigt den Grund offener Stellen weiter nicht an; die Kopie von `planeMonat` im Selbsttest `src/pruefung.jsx` prüft weiter nur rückwärts.

**Rot → grün:** 9 neue Tests in `pruefungen/intelligence-planer-kern.test.js` Abschnitt 8 (Szenario des Befunds: X mit N an d+1 … d+5, `maxFolge` 5, Einteilung an d; Kandidatenwechsel; Gegenproben Folge genau `maxFolge` und Lücke an d+1, dort auch Aufwand 0 gleich; Aufwand 0/9/10 und Obergrenze; Planer: Aufbau gleich `planeMonat`, Nachprüfung lehnt ab, Gegenprobe; Nachtblock endet vor dem Tag; Endstand mit `maxFolge` 3 für demo3 und demo1, `planeMonat` 3/31 und Planer mit Blöcken und Verbessern; Quellprüfung „eine Implementierung“). Der Endstandtest von B-1 nimmt `folge` nicht mehr aus und prüft bis 10.01. Mit abgeschalteter Vorwärtsprüfung (M1 = Verhalten vor der Korrektur; als JSON byte-gleich zur Basis gemessen) 7 rot, darunter B-1 Soll 2 (die beiden Fälle aus dem Review) und der Befund-Fall; danach grün.

**Mutationen (nacheinander, Ziel: neue Tests + B-1; je Lauf zurückgesetzt und gegen die Sicherung verglichen, Quelle danach sauber):** M1 Vorwärtsprüfung aus 7 rot · M2 kein Kandidatenwechsel 2 · M3 Aufwand nie knapp 1 · M4 Fenster einen Tag zu kurz 5 · M5 Vergleich gegen den neuen statt den alten Stand 7 · M6 Kosten nicht angemeldet 1 · M7 Planer-Aufbau ohne Vorwärtsprüfung 2 · M8 Planer-Nachprüfung ohne Vorwärtsprüfung 1 · M9 Planer `einsetzbar` (Block/Verbessern) ohne Vorwärtsprüfung zuerst überlebt (die Nachprüfung fing es ab), mit dem neuen Nachtblock-Test 1 rot · M10 Planer-Ersatz im Verbessern ohne Vorwärtsprüfung überlebt (kein Fall in den Szenarien; ein Zug mit Verstoß fällt in der Nachprüfung durch und der Aufbau gilt — fail-closed, nur schlechter, nie unsicher). Nicht mutiert: Hineingezogene (Verhalten 5, in `planeMonat` nicht auslösbar), unbekannter Dienst am Folgetag.

**Gleichwertigkeit und Deckung (alt = Basis #579 4c924859, neu = dieser Stand, Ergebnis als JSON verglichen; TZ=UTC, `--maxWorkers=1`, synthetisch):** 4 Betriebe (leer, demo1 mit Posten, demo2, demo3) × Lücken (keine / Nachtdienste frei / zusätzlich jede vierte Person frei) × Höchstzahl 3/31 = 24 Kombinationen, alle byte-gleich (keine Vorwärtsverletzung darin). B-1-Szenario Soll 1 gleich; Soll 2: 2 neue `folge`-Befunde → 0, 212 → 213 eingeteilt, 3 → 2 offen (der Kandidatenwechsel füllt die Stelle). Belastung `maxFolge` 3 mit vielen Lücken: demo1 (3/31) 2 → 0 neue `folge`-Befunde bei gleich vielen Einteilungen (200) und 0 offenen Stellen; demo3 (3/31) unverändert (63/18 offen bzw. 116/0). In diesen Messungen keine zusätzliche offene Stelle. Ungenau war die frühere Fassung „in irgendeinem Fall“: Messung des Reviewers mit `maxFolge` 3, demo3, nur Nachtdienste frei, Höchstzahl 31: 116 → 115 eingeteilt, 1 zusätzliche offene Stelle mit Grund `folgeVorwaerts` (berechtigt: jede Kandidatin hätte eine bestehende Folge zu lang gemacht). Laufzeit `planeMonat` demo1 mit Lücken alt 6,9 / 5,1 / 7,6 / 9,7 s, neu 7,1 / 8,7 / 9,2 / 8,6 s; demo3 alt 1,7–2,4 s, neu 2,0–2,8 s (Läufe unter Last, parallele Schreiber; Streuung größer als der Unterschied). Arbeit nur für Kandidaten mit Dienst am Folgetag (höchstens 2 · `maxFolge` Prüfungen je Kandidat).

**Geänderter bestehender Test (nur Daten, Zusicherungen gleich):** „Verbessern mit Posten“ (Abschnitt 8) verlangt, dass mindestens ein Zug behalten wird. Mit der Vorwärtsprüfung nimmt der Aufbau bei einem Verstoß an Folgetagen die nächste Kandidatin (zählt nicht als Versuch) und schließt in diesem Szenario 3 Lücken mehr (29 → 26); danach findet das Verbessern keinen Zug mehr — auch mit abgeschalteter Vorwärtsprüfung im Verbessern und in der Nachprüfung, auch mit Startwert 2/3 oder 300 Zügen (0 Züge). Ursache ist also der bessere Aufbau, nicht eine Sperre. Das Szenario lässt deshalb jede zweite statt jede dritte Person frei (Aufbau 72 Lücken, 3 Züge behalten, 69); alle Zusicherungen (keine Bestandsperson verdrängt, Zug behalten, weniger Lücken) unverändert.

**Tests und Prüfungen (lokal, TZ=UTC, `--maxWorkers=1`, ein Prozess, freier Speicher vor jedem Lauf ≥ 2,3 GB):** intelligence-planer-kern, intelligence-planer-aggregate(+lauf), intelligence-vorgaben-wirkung/-einstiege, intelligence-planungsreife-anzeige, engine-einsatz, engine-rechenkern, prozess-wachen (QS-5) und v4-3b-betreiber/-import/-personal/-querschnitt-1/-querschnitt-2/-selbsttest/-plan: 16 Dateien, 325/325 grün (Messtest Verdrängung: ohne Posten-Kennzeichen 7,3 s, mit Prüfung 6,3 s). `npx tsc -p jsconfig.json --noEmit` grün (eine Typangabe am leeren Vorgabenbudget in `folgeVorwaerts`); `eslint` auf die geänderten Dateien 0 Fehler (5 Warnungen in `fachlogik.js`, auf der Basis dieselben 5); `node werkzeug/verdrahtung-pruefen.mjs` ok (519 Prüfdateien); `acc45-backlog status-schreiben` + `pruefen` ok. Vollregression in CI.

**SSOT:** WP-I7-Eintrag in `docs/acc45/work-packages.json` (Notiz „Nachtrag 2026-11-26 … Dienste in Folge auch vorwärts“), `STATUS.md` neu geschrieben. Status unverändert `IN_PROGRESS`.

**Offene Rückfragen (nichts erfunden):**
1. *Aufwandszähler:* Der Auftrag nannte das bestehende Budget je Aufruf. Umgesetzt ist ein eigener Zähler nach demselben Muster (`PLANEMONAT_FOLGE_AUFWAND`, `grenzen.folgeAufwand`), weil der gemeinsame Zähler den bestehenden Test „ohne Posten: Verdrängungsprüfung ohne Aufwand, auch Aufwand 0 gleich“ gebrochen hätte. Zusammenlegen nur mit Entscheidung (dann den Test neu fassen).
2. *Planer* (Schalter AUS): mitgezogen, damit „ohne Blöcke und Verbessern = `planeMonat`“ gilt und dieselbe Lücke dort nicht bleibt (Aufbau, Block, Verbessern, Nachprüfung). Falls der Auftrag ausdrücklich nur `planeMonat` meinte: rückbaubar, dann bricht aber die Gleichwertigkeit in Fällen mit Vorwärtsverstoß.
3. *Anzeige* des Grundes `folgeVorwaerts` (wie `verdraengung`) in `assistent.jsx` (V4-3b-gepinnt) — erst mit Freigabe der Oberfläche; bis dahin erscheint die Stelle wie bisher unter „Nicht deckbar“.
4. *Selbsttest-Kopie* von `planeMonat` in `src/pruefung.jsx` unverändert (Vorgabe); sie prüft weiter nur rückwärts.
5. *`maxFolge` als Zeichenkette* (vorbestehend, C-Hinweis): `hindernisBefunde` rechnet `maxFolge + 1` (bei "5" ergibt das "51"), `folgeVorwaerts` wandelt mit `Number`. Eine Typprüfung der Einstellung ist nicht Teil dieser Korrektur.
6. *Planbefunde `nachtfolge`, `ersatzruhe`, `sonntagsfrei` im Assistenten* (Opus-Review #584 B-1): Prüfung aufnehmen (Variante a) oder zurückstellen (Variante b) — Betreiberentscheidung, siehe Ergebnis unter der Regeltabelle.

### Nachtrag: Planbefunde `nachtfolge`, `ersatzruhe`, `sonntagsfrei` im Assistenten und im Planer (Opus-Review #584 B-1, Betreiberentscheidung 26.11. Variante A)

**Klassifikation:** Korrektur im bestehenden Paket (WP-I5/WP-I7), kein neues Paket, kein Umbau des Assistenten. Rückfrage 6 des vorigen Nachtrags ist entschieden (Variante A, verbindlich): die bestehenden Planungs- und Prüfmechanismen ergänzen; gesetzliche und betriebliche Regelwirkung unterscheiden; Bezugszeiträume, Ausnahmen und Voraussetzungen nur so weit, wie sie im Repo belegt sind; nachfolgende Auswirkungen erfassen; vorhandene Implementierungen wiederverwenden; nicht bewertbare zwingende Regeln gelten nie als bestanden.

**Invarianten (vor der Umsetzung festgelegt, aus `befunde.mjs` `pruefen`, `regelwerk.mjs`, Regelregister `src/regelregister.js` und Befundkatalog `server/lib/bestaetigungen.mjs`):**

| | `nachtfolge` | `sonntagsfrei` | `ersatzruhe` |
| --- | --- | --- | --- |
| Grundlage, Art | betrieblich: Einstellung `maxNachtFolge` (Standard 4), Regelregister AZ-NACHTFOLGE-01 `ebene: "betrieb"` (Anknüpfung § 6 Abs. 1 ArbZG, „die Zahl legt der Betrieb fest“) | gesetzlich zwingend: § 11 Abs. 1 ArbZG, AZ-SONNTAG-01, `FREIE_SONNTAGE_MIN` = 15 | gesetzlich zwingend: § 11 Abs. 3 ArbZG, AZ-ERSATZRUHE-01, 14 Tage (Sonntag) / 56 Tage (Feiertag an einem Werktag) |
| Bezugszeitraum (wie `pruefen`) | Lauf aufeinanderfolgender Tage mit Nachtdienst (Nachtanteil ≥ Schwelle); ein Tagdienst oder freier Tag beendet ihn; Befund am Tag `maxNachtFolge + 1` | Kalenderjahr; „gearbeitet“ = Dienst, nicht abwesend, keine Rufbereitschaft | Ersatzruhetag = freier Nicht-Sonntag im Abstand ≤ Frist − 1 (den Tag einschließender Zeitraum), gierig zugeordnet (engste Frist zuerst), ein Ersatztag deckt nur einen Anspruch; Feiertag auf einem Sonntag = Sonntag; Feiertage je Bundesland (`feiertagFuer`) |
| Stufe in `pruefen` | warn | danger (unterschritten) / warn (knapp) | warn |
| Wirkung im Assistenten/Planer | wie `folge` in hindernisBefunde (korrigiert nach Review #588 B-2): ist der Lauf von Nachtdiensten durch d nach der Einteilung länger als `maxNachtFolge` ⇒ Kandidat abgelehnt, der nächste wird versucht — auch wenn der Lauf schon vorher zu lang war (Verlängerung, beide Richtungen gleich); ein zu langer Lauf an anderer Stelle sperrt nicht | sperrend: nach der Einteilung weniger als 15 freie Sonntage im Kalenderjahr (ganzes Jahr, jeder geplante Sonntag zählt) ⇒ abgelehnt, auch wenn es davor schon so war (jeder weitere Sonntag verschlimmert) | sperrend für neu verursachte Fälle (korrigiert nach Review #588 B-1): für JEDE Monatsansicht, deren Rechnung d lesen kann (Monatsanfang − 111 ≤ d ≤ Monatsende + 111, höchstens 9 Monate), genau die Rechnung der Prüfansicht (`ersatzruheBefunde` Monat, Zuordnung über Monat ± 56) vorher und nachher; ein Befund, den es in einer dieser Ansichten vorher nicht gab ⇒ abgelehnt |
| Richtung | rückwärts und vorwärts: Lauf durch d, je Seite höchstens `maxNachtFolge` + 1 Tage gelesen (dann steht „zu lang“ fest) | Jahresbilanz, nur eine Einteilung an einem Sonntag | Sonntags-/Feiertagsdienst an d (eigener Anspruch) und Werktag d als Ersatztag eines früheren ODER späteren gearbeiteten Sonntags (± 13) bzw. Feiertags (± 55), auch über Monats- und Jahresgrenze |
| betroffen nur wenn | an d neu ein Nachtdienst | an d neu gearbeitet und d Sonntag | an d neu gearbeitet und (d Sonn-/Feiertag oder gearbeiteter Sonntag in ± 13 / Feiertag in ± 55) — sonst berührt d keine Zuordnung (exakt) |
| nicht bewertbar ⇒ nie bestanden | `maxNachtFolge` keine ganze Zahl ≥ 1 (auch "4", null, fehlend) bei neuem Nachtdienst | — (Sonntage sind datenunabhängig) | Bundesland unbekannt (Feiertage nicht bestimmbar) bei neuem Arbeitstag |

Gleich für alle drei: Rechnung aus `pruefen` (keine zweite Regellogik; der Nachtlauf durch d nutzt dasselbe Nachtdienst-Kriterium `istNachtdienst`), Stand davor gegen Stand mit der Einteilung; Ergebnis nur im bestehenden Feld `grund` offener Stellen (`nachtfolge`/`sonntagsfrei`/`ersatzruhe`, wie bisher `folgeVorwaerts`); Aufwand in Personentagen, als Obergrenze VOR der Arbeit angemeldet (Kostenmodell siehe Delta-Review #588 B-3 unten; eigener Zähler `PLANEMONAT_PLANBEFUND_AUFWAND` = `PLANBEFUND_GRENZE` = 40 000 000, je Aufruf `grenzen.planbefundAufwand`, nach oben begrenzt); leer ⇒ nicht einteilen, Grund `aufwand`; ohne neuen Nacht- oder Arbeitstag an d keine Arbeit und kein Aufwand. `knapp` (warn) bei `sonntagsfrei` ist nach dem Kommentar in `regelwerk.mjs` „keine Feststellung“ und sperrt nicht (in der Ansicht Dezember entsteht er nie, weil dann kein Sonntag mehr offen ist).

**Ausnahmen und Voraussetzungen (nur Belegtes):** Das Repo kennt für § 11 keine Ausnahmen oder Abweichungen (§ 12 ArbZG: Tarifvertrag, etwa weniger freie Sonntage in Krankenhäusern und Pflege oder andere Ersatzruhe-Regeln; § 10 Zulässigkeit der Sonntagsarbeit überhaupt; § 9 Abs. 2 Verschiebung des Sonntags im Schichtbetrieb). Es gilt daher der strenge gesetzliche Standard. Ein Dienst zählt wie in `pruefen` an seinem Anfangstag (eine Nacht Samstag → Sonntag ist keine Sonntagsarbeit, ein Feiertag als freier Werktag gilt als Ersatztag). Beides ist Entscheidung bzw. Rechtsprüfung, nicht Teil dieser Korrektur.

**Änderung:**
- `server/lib/engine/befunde.mjs`: die drei Rechnungen aus `pruefen` herausgelöst in `nachtfolgeBefunde`, `sonntagsArbeit`, `ersatzruheBefunde`, `sonntagsfreiBefund` (Text und Rechnung gleich); `pruefen` ruft sie an derselben Stelle, Ausgabe byte-gleich (Golden-Werte `engine-rechenkern` unverändert grün).
- `server/lib/engine/einsatz.mjs`: `planbefundeNeu(vorher, p, d, da, leisten, stand)` (Invarianten oben), `PLANBEFUND_GRENZE`, `planbefundAufwandHoechst(m, jahr)` (nach Review #588; vorher `PLANBEFUND_AUFWAND_HOECHST` = 6). Der Stand danach wird für p nur am Tag d gelesen (eine Einteilung ändert ihren Plan nur dort; sonst rechnete jeder Kandidat die Postenbesetzung für jeden Tag neu).
- `src/lib/fachlogik.js` `planeMonat`: Kandidatenwahl nach `folgeVorwaerts` zusätzlich mit `planbefundeNeu` (Kandidatenwechsel), ebenso für verdrängte Personen in `verdraengungPruefen`; eigener Zähler.
- `server/lib/engine/planer.mjs` (Schalter AUS): gemeinsame Hilfsfunktion `vorwaerts` (folgeVorwaerts, dann planbefundeNeu) im Aufbau (Grund = Regel), in `einsetzbar` (Block, Verbessern), im Ersatz des Verbesserns und in `nachpruefen`; nach Review #588 B-3 eigenes Budget der Planbefunde in Personentagen (`planbefundAufwand`, Reserve der Nachprüfung je Einteilung `planbefundAufwandHoechst`), nicht mehr in der Reserve der Personenprüfungen.
- Nicht geändert: `hindernisBefunde`, Warndialog, Ersatzsuche (`ersatzVorschlaege`), Befundkatalog, Golden-Werte der Ersatzsuche; `src/ansichten/assistent.jsx` (zeigt den Grund offener Stellen weiter nicht an); die Kopie von `planeMonat`/`pruefen` im Selbsttest `src/pruefung.jsx` (Hinweis an den zuständigen Schreiber: dort fehlt die Prüfung weiter).

**Rot → grün:** 11 neue Tests in `pruefungen/intelligence-planer-kern.test.js` Abschnitt 9: nachtfolge vorwärts/rückwärts/verbindend mit Gegenproben und Abgleich mit `pruefen`; nachtfolge nicht bewertbar; sonntagsfrei (15/16/10 freie Sonntage, Werktag, Folgejahr, Abgleich mit `pruefen`); ersatzruhe (Sonntagsdienst, Werktag als einziger Ersatztag eines früheren/späteren Sonntags, Abgleich mit `pruefen`); Grenzfälle (drei Feiertage mit acht Wochen, Sonntagsdienst 3.1.2027 und Einteilung 31.12.2026, Schaltjahr 29.2.2028); Bundesland unbekannt; Aufwand (6 / 4 / 0, zu klein); `planeMonat` im Befund-Szenario (offen mit Grund `nachtfolge`, Kandidatenwechsel, Aufwand 0, Obergrenze, Gegenprobe); Planer (Aufbau = `planeMonat`, Nachprüfung, Gegenprobe); Endstand demo3 (Nachtdienste frei / viele Lücken, 3/31, Planer), demo2, demo1 ohne neuen Planbefund in den Prüfansichten November bis Januar; Quellprüfung „eine Rechnung“. Mit abgeschalteter Prüfung (M1 = Verhalten vor der Korrektur) 13 der 16 Tests der Abschnitte 9 und 2 rot (alle neuen außer der Quellprüfung; die beiden Gleichwertigkeitstests aus Abschnitt 2 bleiben grün); danach grün. Die Zeilen `nachtfolge`, `ersatzruhe`, `sonntagsfrei` der Regeltabelle im vorigen Nachtrag („nicht geprüft, Entscheidung ausstehend“) gelten damit als erledigt.

**Geänderte bestehende Tests (Zusicherungen nicht abgeschwächt):** (1) Abschnitt 2 „Gleichwertigkeit“: Der Planer nennt nun wie bei `folgeVorwaerts` den Grund einer offenen Stelle (demo3: 13. und 20.12. N, `sonntagsfrei`); verglichen wird die frische Rechnung ohne `grund`, zusätzlich neu: die Gründe müssen dieselben sein wie bei `planeMonat`. (2) „Gegenprobe ohne Posten“: offene Stellen ohne `verdraengung`/`aufwand` wie bisher; erlaubt sind nur die Gründe der drei Planbefunde (demo3 mit vielen Lücken: 2 Stellen `sonntagsfrei`). (3) Szenario „Dienste in Folge vorwärts“: `maxNachtFolge` 31 (nur Daten), weil X dort fünf Nächte in Folge bekommt — mit Standard 4 lehnt nun die Nachtregel ab (berechtigt), die Tests sollen aber `folge` allein prüfen; die Nachtregel prüft Abschnitt 9.

**Mutationen (nacheinander, Abschnitte 9 und 2, je Lauf zurückgesetzt und gegen die Sicherung verglichen):** M1 Prüfung aus (= vor der Korrektur) 13 rot · M2 kein Kandidatenwechsel 3 · M3 nachtfolge gegen den neuen statt den alten Stand 7 · M4 sonntagsfrei aus 4. **Nicht abgeschlossen:** M5 (ersatzruhe aus) bis M13 — der Lauf wurde während M5/M6 vom System wegen Speichermangels beendet (parallele Schreiber); M5 ohne Ergebnis, M6 stand beim Abbruch noch in `einsatz.mjs` und wurde aus der Sicherung zurückgesetzt (gegen die Sicherung verglichen, danach Vollregression grün). Vorgesehen und nicht gelaufen: M5 ersatzruhe aus, M6 Werktag nicht geprüft, M7 Aufwand nie knapp, M8 Verdrängte ohne Planbefunde (in planeMonat voraussichtlich nicht auslösbar, wie Verhalten 5 oben), M9 Planer-Nachprüfung ohne Planbefunde, M10 Planer-Aufbau ohne Planbefunde, M11/M12 nicht bewertbar = bestanden, M13 Werktag nur ± 13. Skript liegt bereit; Nachholen nur bei ausreichendem Speicher.

**Gleichwertigkeit und Deckung (alt = Basis 61c919bf, neu = dieser Stand; `planeMonat`-Ergebnis als JSON verglichen; TZ=UTC, `--maxWorkers=1`, synthetisch):** 4 Betriebe (leer, demo1 mit Posten, demo2, demo3) × Lücken (keine / Nachtdienste frei / zusätzlich jede vierte Person frei) × Höchstzahl 3/31 = 24 Kombinationen. 15 byte-gleich (alle ohne Lücken, leer, demo1 außer Nacht/31). 9 verschieden, nur durch neu verhinderte Einteilungen: neue Planbefunde in den Ansichten November–Januar alt → neu: demo1 Nacht/31 1 → 0 (194 eingeteilt, 0 offen, andere Kandidatin); demo2 Nacht/3 1 → 0 (93 → 88 eingeteilt, 0 → 2 offen `sonntagsfrei`), Nacht/31 3 → 0 (93/0), viele/3 0 → 0 (93 → 90, 0 → 1 offen `sonntagsfrei`; Kandidatenwechsel der Reihenfolge), viele/31 6 → 0 (93/0); demo3 Nacht/3 1 → 0 (63 → 63, 18 → 19 offen, 3 × `sonntagsfrei`), Nacht/31 9 → 0 (116 → 113, 0 → 2 offen `sonntagsfrei`), viele/3 4 → 0 (63, 17 → 18 offen), viele/31 9 → 0 (116/0). Deckung: höchstens 3 zusätzliche offene Stellen je Kombination, alle mit Grund `sonntagsfrei` (die Kandidatinnen hätten im Jahr 2026 weniger als 15 freie Sonntage); `nachtfolge` wurde in allen gemessenen Fällen durch Kandidatenwechsel gedeckt; `ersatzruhe` trat in den Demodaten nicht auf (nur in den synthetischen Tests). Laufzeit `planeMonat` (Nachtdienste frei, Höchstzahl 31; abwechselnd alt/neu im selben Zustand, Läufe unter Last): demo1 alt 10,5 / 9,4 / 9,4 / 8,6 s, neu 11,9 / 12,5 / 15,6 / 12,3 s (rund + 35 %: die Zuordnung der Ersatzruhetage liest je betroffener Einteilung rund 330 Tage der Person auf dem jeweils neuen Stand, mit Posten samt Postenbesetzung); demo3 alt 2,4–3,5 s, neu 2,9–3,4 s.

**Tests und Prüfungen (lokal, TZ=UTC, `--maxWorkers=1`, ein Prozess, freier Speicher vor jedem Lauf geprüft):** engine-*, intelligence-* (ohne Browserprüfung), prozess-wachen (QS-5), v4-3b-betreiber/-import/-personal/-querschnitt-1/-querschnitt-2/-selbsttest/-plan: 60 Dateien, 1718/1718 grün (darin intelligence-planer-kern 55/55, engine-rechenkern mit unveränderten Golden-Werten). `npx tsc -p jsconfig.json --noEmit` grün; `eslint` auf die geänderten Dateien 0 Fehler (5 Warnungen in `fachlogik.js`, wie auf der Basis); `node werkzeug/verdrahtung-pruefen.mjs` ok (521 Prüfdateien); `acc45-backlog status-schreiben` + `pruefen` ok. Vollregression in CI.

**SSOT:** WP-I7-Eintrag in `docs/acc45/work-packages.json` (Notiz „Nachtrag 2026-11-26 … Planbefunde“), `STATUS.md` neu geschrieben. Status unverändert `IN_PROGRESS`.

**Offene Rückfragen (nur konkret, nichts erfunden):**
1. *§ 12 ArbZG / Tarif:* Weniger als 15 freie Sonntage (z. B. Krankenhaus/Pflege) oder andere Ersatzruhe-Regeln kennt das Repo nicht; es gilt der gesetzliche Standard. Abbildung als Regel/Einstellung = Entscheidung + Rechtsprüfung.
2. *Sonntagsarbeit nach Uhrzeit:* Ein Dienst zählt (wie in `pruefen`) am Anfangstag; eine Nacht Samstag → Sonntag gilt nicht als Sonntagsarbeit, ein freier Feiertag gilt als Ersatztag. Rechtsprüfung.
3. *`sonntagsfrei` „knapp“* sperrt nicht (keine Feststellung). Soll der Assistent auch „knapp“ vermeiden? Entscheidung.
4. *Zuordnung der Ersatzruhetage ist gierig und fensterabhängig* (Eigenschaft von `pruefen`): Geprüft werden alle Ansprüche, denen d unmittelbar als Ersatztag dienen kann (d ± 55); eine Kettenwirkung über weitere Ansprüche hinaus und eine andere Zuordnung in einer anders geschnittenen Prüfansicht sind nicht ausgeschlossen (in allen Messungen 0 Fälle). **Widerlegt durch Review #588 B-1** (Zufallsvergleich des Reviewers: Seed 7 4 von 1 355, Seed 1 1 von 270 bewerteten Einteilungen angenommen, obwohl eine Monatsansicht danach einen neuen Befund zeigte); behoben, siehe Delta-Review #588.
5. *Fail-closed bei fehlender Einstellung:* Ohne gültiges `maxNachtFolge` teilt der Assistent keine Nachtdienste mehr ein (vorher: keine Prüfung). Alternative wäre der Grundwert 4 wie in `server/lib/import/schichtpruefung.mjs`. Entscheidung.
6. *Warndialog und Ersatzsuche* (`hindernisBefunde`) kennen die drei Regeln weiter nicht; manuelle Einteilungen zeigen sie wie bisher nur in der Prüfansicht. Aufnahme dort (Befundkatalog, Sperrwirkung, Golden-Werte) wäre ein eigener Schritt mit Freigabe.
7. *Anzeige* der neuen Gründe in `assistent.jsx` (anderer Schreiber) und *Selbsttest-Kopie* in `src/pruefung.jsx` (anderer Schreiber).
8. *Laufzeit* demo1 + rund 35 %: Abhilfe wäre ein Zwischenspeicher je unverändertem Tag (Bestand), nicht Teil dieser Korrektur. (Stand nach #588 siehe unten.)

#### Delta-Review #588 (Kopf b958f2bb): B-1 Ersatzruhe-Fenster, B-2 Nachtlauf-Verlängerung, B-3 Kostenmodell

**Zustandsraum (vor dem Commit durchgegangen):**
- *Fensterkonsistenz zu `pruefen` (B-1):* `pruefen` rechnet je Ansicht `von` … `bis` die Zuordnung über `von` − 56 … `bis` + 56; ein Anspruch am Rand sucht ± 55 weiter. Eine Ansicht liest also höchstens `von` − 111 … `bis` + 111. Liegt d außerhalb, sind alle Tage, die diese Ansicht liest, vorher und nachher gleich (für p ändert die Einteilung nur d) ⇒ ihr Ergebnis ist gleich. Liegt d innerhalb, rechnet `planbefundeNeu` für diese Ansicht genau die Rechnung der Prüfansicht (`ersatzruheBefunde` mit Monatsanfang und -ende) vorher und nachher. Damit ist das Ergebnis für jede **Monatsansicht** exakt (auch Ketten über ± 55 hinaus, Monats- und Jahresgrenzen, Schaltjahr). **Rest:** Ansichten mit anderem Schnitt (z. B. 14 Tage im Lagebild, freie Zeiträume) sind nicht abgeglichen; ihre gierige Zuordnung kann anders ausfallen. Entscheidung, ob weitere Schnitte (etwa `d0` … `d0 + 13`) einbezogen werden sollen. **Erledigt in Teil 5** (Stufe A1: `pruefen` rechnet die Ersatzruhe je Kalendermonat; jeder Schnitt = Monatsansicht).
- *Auslöser (exakt):* Ohne gearbeiteten Sonntag in ± 13, Feiertag in ± 55 und ohne Sonn-/Feiertag an d liest keine Zuordnung d.
- *Nachtlauf (B-2):* Lauf durch d nach der Einteilung > `maxNachtFolge` ⇒ abgelehnt, beide Richtungen gleich (fünf Nächte davor oder danach, sechste an d); Lauf ≤ Grenze erlaubt; zu langer Lauf an anderer Stelle sperrt nicht. Das ist strenger als „neuer Überschreitungstag“ (`pruefen` meldet je Lauf nur einmal) und entspricht `folge` in `hindernisBefunde` und der Haltung bei `sonntagsfrei` („verschlimmert“).
- *Mehrere Einteilungen am Tag, Verdrängte, Posten, Planer:* Jede Einteilung wird auf dem jeweils aktuellen Stand geprüft (der vorige Kandidat ist schon enthalten); verdrängte Personen über `verdraengungPruefen` mit `stand`; Postenwirkung nur am Tag d; der Planer nutzt dieselbe Funktion im Aufbau, in `einsetzbar`, im Ersatz und in der Nachprüfung.
- *Bundesländer:* Feiertage je Person (`feiertagFuer`, Land der Einheit am jeweiligen Tag); Bundesland unbekannt am Tag d ⇒ nicht bewertbar (Hinweis des Reviewers: geprüft wird nur das Land am Tag d; wechselt die Einheit im Fenster das Land, rechnet `ersatzruheBefunde` je Tag richtig, die Bewertbarkeit wird aber nur für d festgestellt).

**B-3 Kostenmodell (Einheit Personentage = Tage, die eine Regel für die Person betrachtet; konsistent zum Budgetmodell der Vorgaben „Tagesabfragen“):** Obergrenze je Aufruf, VOR der Arbeit angemeldet: Nachtlauf 2 · (`maxNachtFolge` + 1); Jahresbilanz Tage des Jahres (365/366, die Schleife von `freieSonntage`); Auslöseprüfung der Ersatzruhe 110; Ersatzruhe je berührter Monatsansicht und Stand: Tage des Zuordnungsfensters (Monat + 112) + 26 je Sonntag im Fenster + 110 je Feiertag (Vereinigung aller Länder des Betriebs) im Fenster. Zwei Anmeldungen: erst Nacht/Jahr/Auslöser, nach dem Auslöser die Ersatzruhe. Die Grenze `PLANBEFUND_GRENZE` = 40 000 000 gilt für `planeMonat` (`PLANEMONAT_PLANBEFUND_AUFWAND`) und den Planer (`planbefundAufwand`, eigenes Budget; Reserve der Nachprüfung je Einteilung `planbefundAufwandHoechst(m, jahr)` mit der größten Feiertagszahl in 143 Tagen). Messung (Laptop, TZ=UTC, `--maxWorkers=1`; alle freien Person-Tage im Dezember, Nacht- und Frühdienst; demo1 3 422 Aufrufe, demo3 1 730): im Mittel 0,49–0,64 µs je angemeldetem Personentag, je Regelart ähnlich (Sonntag 0,49–0,58, Werktag 0,50–0,64); ein relevanter Aufruf meldet rund 17 000 an (≈ 10 ms). Die Grenze entspricht damit rund 20–26 s Rechenzeit der Planbefunde je Aufruf (echte Schranke; Messtest im Repo: Mittel < 5 µs, also höchstens 200 s). Verbrauch: demo1 Aufbau des Planers mit Posten (258 Einteilungen) 13,0 Mio einschließlich Reserve, mit Verbessern 21,4 Mio. Vorher (2 je Regel) war die Ersatzruhe rund 20-fach unterschätzt und der Auslöser unbudgetiert. Größere Betriebe (300 Personen) erreichen die Grenze früher: dann offen mit Grund `aufwand` (fail-closed, sichtbar).

**Änderung:** `einsatz.mjs` (`planbefundeNeu` Nachtlauf, Monatsansichten, Kosten; `PLANBEFUND_GRENZE`, `planbefundAufwandHoechst`), `befunde.mjs` (`istNachtdienst`, von `nachtfolgeBefunde` genutzt; Ausgabe unverändert), `fachlogik.js` (Grenze, Kommentar), `planer.mjs` (eigenes Budget der Planbefunde, Option `planbefundAufwand` geprüft, Ergebnis `aufwand.planbefund`).

**Rot → grün:** neue Tests in Abschnitt 9: Kette vor dem Monat (Anspruch 25.12. nimmt nach der Einteilung am 2.11. den Ersatztag des 1.1.; außerhalb ± 55 und außerhalb Monat ± 56); Planer-Budgets getrennt (Ergebnis gleich bei genau dem Verbrauch an Personenprüfungen + 1 000; knappes Planbefund-Budget nie überschritten); die vier Fälle des Reviewers (Seed 7, Durchläufe 644/670/758/1001, mit demselben Generator nachgebaut; Orakel: Prüfansicht des Monats vorher ohne, nachher mit Befund zum 17.05.2027 Pfingstmontag, 06.05.2027 Christi Himmelfahrt, 26.12.2026); Nachtlauf-Verlängerung beide Richtungen mit Gegenproben; Kosten in Personentagen (Anmeldung, zu klein an jeder Stufe, Dienstwechsel ohne neuen Arbeitstag = keine Anmeldung, Obergrenze); Planer-Budget (ungültig, 0, Verbrauch); Messtest µs je Einheit. Geänderte eigene Erwartungen aus #584: Tag des nachtfolge-Befunds ist jetzt d (Lauf durch d), der Tagdienst-Fall meldet die Auslöseprüfung (110) an.

**Brute-Force-Vergleich (Skript des Reviewers, Orakel 15 Monatsansichten um d mit `pruefen`-gleicher Rechnung; eine Person, Pläne 2026–2027 mit 55–95 % Arbeitstagen, d zwischen 1.9.2026 und 28.4.2027, also über den Jahreswechsel):** Fehlannahmen (angenommen, obwohl eine Ansicht danach einen neuen Befund zeigt) **0** für alle drei Regeln: Seed 7 HE 2 000 Durchläufe, Seed 1 HE 2 000, Seed 2 BY, 3 SN, 4 NW, 5 BE, 6 TH, 8 SL je 1 500 (13 000 Durchläufe, 10 703 bewertete Ersatzruhe-Fälle). Überablehnungen: Ersatzruhe 0; nachtfolge 0–6 je Lauf (gewollt: Verlängerung eines schon zu langen Laufs, den das Orakel nicht neu meldet); sonntagsfrei 94–135 je Lauf (gewollt: Jahresbilanz über das ganze Jahr statt „noch offene Sonntage“). Schaltjahr 29.2.2028 im Test (Abschnitt 9), nicht im Zufallsvergleich.

**Mutationen (Skript `nfs-mutation.mjs`, nacheinander, Abschnitte 9 und 2, je Lauf zurückgesetzt und gegen die Sicherung verglichen):** N0 Prüfung aus 19 rot · N1 nur Fenster d ± 55 (Stand b958f2bb) 4 (die vier Fälle des Reviewers) · N2 Reichweite nur Rand 56 zuerst überlebt; der Zufallsvergleich unter N2 fand 1 Fehlannahme (Seed 6 TH: d = 31.12.2026, Ansicht März, Karfreitag 26.03.2027), danach neuer Test „Kette vor dem Monat“ (d = 2.11.2026, 60 Tage vor dem 1.1.2027) ⇒ 1 rot · N3 Nachtlauf nur vorwärts 7 · N4 Verlängerung eines zu langen Laufs erlaubt 1 · N5 Ersatzruhe-Aufwand nicht angemeldet 2 · N6 Auslöseprüfung nicht angemeldet 8 · N7 Planer ohne Reserve der Nachprüfung im Planbefund-Budget und N8 Planbefunde im Budget der Personenprüfungen zuerst überlebt, danach neuer Test „Planer-Budgets getrennt“ ⇒ je 1 rot. Quelle nach jedem Lauf gleich der Sicherung. Die Mutationen M5–M13 des ersten Nachtrags hat der Reviewer auf b958f2bb laufen lassen (alle erkannt).

**Gleichwertigkeit und Deckung (neu gemessen, wie oben, 24 Kombinationen gegen die Basis 61c919bf):** dasselbe Bild wie vor dem Review: 15 byte-gleich, 9 verschieden nur durch neu verhinderte Einteilungen, neue Planbefunde November–Januar überall 0; zusätzliche offene Stellen höchstens 3 je Kombination, alle `sonntagsfrei` (demo2 Nacht/3 0 → 2, viele/3 0 → 1; demo3 Nacht/3 18 → 19, Nacht/31 0 → 2, viele/3 17 → 18). Laufzeit `planeMonat` (Nachtdienste frei, 31; unter Last, parallele Schreiber): demo1 12,0 / 12,9 s (Basis zuvor 8,6–10,5 s), demo3 4,5 / 4,7 s (Basis zuvor 2,4–3,5 s); die Monatsansichten (bis zu 9 je relevanter Einteilung) kosten bei demo3 mehr als das alte Fenster.

**Tests und Prüfungen (lokal, TZ=UTC, `--maxWorkers=1`, ein Prozess, freier Speicher vor jedem Lauf ≥ 2,4 GB):** engine-*, intelligence-* (ohne Browserprüfung), prozess-wachen (QS-5), v4-3b-betreiber/-import/-personal/-querschnitt-1/-querschnitt-2/-selbsttest/-plan: 60 Dateien, 1726/1726 grün (darin intelligence-planer-kern 63/63; engine-rechenkern mit unveränderten Golden-Werten, `pruefen`-Ausgabe byte-gleich). `npx tsc -p jsconfig.json --noEmit` grün; `eslint` auf die geänderten Dateien 0 Fehler (5 Warnungen in `fachlogik.js`, wie auf der Basis); `node werkzeug/verdrahtung-pruefen.mjs` ok (521); `acc45-backlog status-schreiben` + `pruefen` ok.

**C-Hinweise (nicht umgesetzt):** M8 (Verdrängte ohne Planbefunde) fängt weiterhin nur die Quellprüfung; ein Verhaltenstest bräuchte ein Posten-Szenario, in dem die Verdrängung einen Nachtlauf oder neuen Arbeitstag erzeugt (in `planeMonat` zieht die Postenbesetzung nur aus dem Quelldienst: Arbeit bleibt Arbeit; nachtfolge nur, wenn Posten und Quelldienst verschiedene Nachtanteile haben). Bundesland-Prüfung nur am Tag d (siehe oben). Oberfläche `regelwerk.jsx` speichert `maxNachtFolge` als Zahl mit Schritt 0,5 (leeres Feld 0, 4,5) ⇒ „nicht bewertbar“ ⇒ keine Nachtdienste; Meldung jetzt „ungültig oder leer“ statt „nicht eingestellt“; UI unverändert (Hinweis an die Oberfläche). Frage 5 (fail-closed ohne gültiges `maxNachtFolge`) bleibt wie entschieden: Normalfall gesetzt (mandant-anlage.js, leerbetrieb.mjs, Demodaten).
---

# WP-I7 Planer-Kern — Teil 4: lange Musterregeln mit den Aggregaten

Basis `origin/integration/release-v4` (61c919bf, nach #584/#585). Betreiberentscheidung 26.11. (verbindlich) zu Rückfrage 4 aus Teil 1: lange Musterregeln innerhalb WP-I7 mit den vorhandenen Aggregaten fertigstellen; `PLANER_AN` und `PLANER_AGGREGATE_AN` bleiben AUS; keine pauschale Budgeterhöhung; nicht vollständig Geprüftes nie „bestanden“. Nur synthetische Daten, kein KI-Anteil, keine Oberflächendatei, `src/lib/fachlogik.js`, `planer.mjs`, `einsatz.mjs`, `befunde.mjs` unberührt.

## Klassifikation (aus Code, nichts erfunden)

| Regel (Regelbaukasten `musterregel`) | Fenster der Planwirkung | vorher | jetzt |
| --- | --- | --- | --- |
| „höchstens in Folge“ (`hoechstensFolge`: Klassen, `max`, `danachFrei`, wahlweise `frei`) | d ± halb, halb = max + danachFrei + 1, Länge 2·halb + 1 | ≤ 62 Tage kurzer Weg; darüber `vorgabeOffen` („rechnet erst mit den Aggregaten“), auch mit Aggregaten | ≤ 62 unverändert kurzer Weg; 63–372 Tage (halb 31–185) mit Aggregaten; > 372 `vorgabeOffen` „Muster über 372 Tage“ |
| „verbotene Folge“ (`verbotenFolge`: `von`, `dann`, `abstandTage`) | d ± Abstand | wie oben | wie oben (Abstand 31–185 mit Aggregaten) |
| Blockregel | Kalenderwoche (7 Tage) | nie lang | unverändert |
| Zählregeln > 62 Tage | — | Teil 1 | unverändert |

Parametergrenzen der Vorgabe: `max` und `danachFrei` je ≤ 366 (halb bis 733), `abstandTage` ohne Obergrenze → alles über halb 185 bleibt offen (nie bestanden). Die Fachbedeutung ist durch den Regelbaukasten und den kurzen Weg vollständig bestimmt (Fenster, Vergleich mit/ohne, Maß); es war **keine Fachentscheidung** nötig, um sie auf 372 Tage zu erweitern. Einzige gewählte Festlegung: das Maß der Obergrenze ist die Fensterlänge 2·halb + 1 (dasselbe Maß wie die 62-Tage-Grenze des kurzen Wegs), Rückfrage 1 unten.

## Invarianten (vor der Umsetzung festgelegt)

1. **Semantik = kurzer Weg:** Befund genau dann, wenn der Regelbaukasten über das Fenster d ± halb mit der Einteilung verletzt und die Einteilung die Verletzung herbeiführt oder vergrößert (ohne verletzt und Maß mit ≤ Maß ohne ⇒ kein Befund; Maß = Summe der Verstoßlängen, verbotene Folge je Paar 1). Am Tag d: „ohne“ = frei, „mit“ = Dienst. Text und Bestätigung kommen vom Baukasten über das ganze Fenster (gleicher Wortlaut wie im kurzen Weg). Eine Stelle für den Vergleich: `mitOhneEntscheiden` (kurzer Weg, Blockregel, lange Muster).
2. **Was die Aggregate darstellen:** die Tagesklasse je Person und Tag (Monatsblock, einmal je Einstieg gelesen, Tagesnachführung aus Teil 2). Musterregeln brauchen Folgen, keine Summen; Präfix-/Fenstersummen tragen sie nicht. Aggregiert wird darum nur das Lesen; die Entscheidung (`musterVerschaerft`) liest nur die Tage, die d berührt:
   - verbotene Folge: nur die Paare (d − a, d) und (d, d + a) enthalten d; alle übrigen sind mit/ohne gleich ⇒ 2 Tage.
   - höchstens in Folge: ein Block [i, j] (maximal, am Fensterrand abgeschnitten wie im Baukasten) hängt nur an den Tagen i − 1 … j + max(danachFrei, 1); Blöcke ohne d in diesem Bereich sind mit/ohne gleich. Gerechnet werden genau die Blöcke mit i ≤ d + 1 und j ≥ d − max(danachFrei, 1) (Anfang links gesucht, rechts bis zum Blockende + danachFrei), in derselben Zählweise wie der Baukasten. Beweisskizze: Ein Block, dessen Bereich d nicht enthält, hat in beiden Fassungen dieselben Rand- und Folgetage, also denselben Beitrag; Befund ⇔ Maß mit > Maß ohne (Maß ≥ 1 je Verstoß).
   - nur bei „verschärft“ rechnet der Baukasten das ganze Fenster (Text, Bestätigung, gleiche Vergleichsregel).
   - **nicht aggregierbar ⇒ offen:** kaputte Parameter (der Baukasten prüft sie vorab und wirft wie im kurzen Weg), unbekannte Art, ungültiger Tag, Fenster > 372 Tage, Budget leer, Pause, Schalter AUS ⇒ `vorgabeOffen` mit Grund, in der Automatik bei Muss Achtung (nicht einteilen). Nie „bestanden“.
3. **Stale:** Die Tagesklasse hängt bei Posten von den Einteilungen anderer Personen am selben Tag ab (Review #572 A1). Lange Muster lesen ausschließlich über `aggregatZaehler.klasse` ⇒ die Vormerkung aus Teil 2 (mit Posten bei allen Personen des Monats) gilt unverändert; kein eigener Zwischenspeicher über den Aufruf hinaus (`gelesen` lebt nur in einer Auswertung).
4. **Teilzeit:** Musterregeln werden nie skaliert (Teilzeit anteilig nur Zählregeln mit `ausnahmen.teilzeitAnteilig === true`; Frei-Untergrenzen nie gesenkt) — unverändert.
5. **Urlaub/Krankheit/Abwesenheit:** abwesender Tag = unbekannte Klasse (nie frei); er beendet keinen Block als „frei“ und erfüllt kein „danach frei“ (wie im kurzen Weg und im Baukasten). Herausnehmen aus der Zählung betrifft nur Zählregeln.
6. **Budget je äußerem Einstieg, Kosten vorab:** dasselbe Budget wie bisher (`VORGABEN_WIRKUNG_GRENZE` unverändert 50/62/200000). Je Auswertung fester Grundbetrag `MUSTER_LANG_GRUNDKOSTEN` = 2 (Hinweis #566-Review), je gelesenem Tag 1, Monat lesen = Tage des Monats (Aggregate), Bestätigung über das Fenster 2 je Tag (Kostenmodell des kurzen Wegs „Fenster zweimal“). Alles VOR der Arbeit angemeldet; reicht es nicht ⇒ diese und alle folgenden Vorgaben offen.
7. **Nicht umgehbar:** Tag muss ein Kalenderdatum sein (`tagAus(tagNr(d)) === d`, 30. Februar und falsches Format ⇒ Rechenfehler, offen); halb NaN/Infinity/übergroß ⇒ nicht wirkend bzw. offen über der Grenze.
8. **KI-Pause hält an** (auch unlesbarer Stand): Aggregate ruhen ⇒ lange Muster offen mit Grund „Intelligence pausiert“; kurze Muster und die normale Dienstplanung unverändert.
9. **Mandantengrenze:** Blöcke je Betriebsstand (WeakMap, Teil 1); Test mit zwei Betrieben, gleicher Personenkennung, einem Budget.
10. **Keine Personenbezüge:** Befundtext wie im kurzen Weg (Name der Vorgabe, Tage); nichts wird abgelegt.
11. **Gleichwertigkeit:** Aggregatweg = Regelbaukasten über das ganze Fenster (Referenz im Test) = kurzer Weg (für Fenster ≤ 62 Tage ist die Referenz gegen den bestehenden kurzen Weg geprüft); Verwaltung (`vorgabePlanwirkung`) und Prüfung sagen dasselbe.
12. **Obergrenze** 372 Tage Fensterlänge (wie Teil 1), darüber offen.
13. **Schalter AUS:** ohne `aggregate` (Vorgabe) exakt das bisherige Verhalten (Text, Stufe, Verwaltung); `assistent.jsx` und `planeMonat` unverändert.

## Umsetzung (nur `server/lib/vorgabenwirkung.mjs`)

- `vorgabePlanwirkung`: Musterregel mit Fenster > 62 Tage wirkt mit Aggregaten bis 372 Tage; darüber „Muster über 372 Tage rechnen nur im Testlauf“. Ohne Aggregate der bisherige Text.
- `vorgabenBefunde`: neuer Zweig `langMuster` (Kalenderdatum prüfen, Grundbetrag, Parameterprüfung durch den Baukasten, Lesen über `aggregatZaehler` mit Kosten je Tag, Entscheidung `musterVerschaerft`, bei Treffer Baukasten über das Fenster via `mitOhneEntscheiden`). Grund über der Grenze mit Aggregaten: „Muster über 372 Tage“.
- Neu exportiert: `musterVerschaerft` (reine Entscheidung, direkt getestet), `MUSTER_LANG_GRUNDKOSTEN`. Gemeinsam: `musterHalb` (vorher dreimal derselbe Ausdruck), `mitOhneEntscheiden` (vorher im kurzen Weg inline; gleiche Logik), der Aufbau des Zählers (`zaehler`) für Zähl- und Musterregeln.
- Planer (`planeMonat` mit `aggregate: true`, `planer.mjs`): keine Änderung nötig; sie prüfen über `hindernisBefunde` → `vorgabenBefunde` mit ihrem einen Budget und schreiben die Aggregate fort. Vorwärtswirkung ist durch das symmetrische Fenster d ± halb gedeckt.

## Rot → grün

Neu `pruefungen/intelligence-planer-aggregate-muster.test.js` (14 Tests, läuft über `pruefung:intelligence`). Gegen die Basisquelle (nur `vorgabenwirkung.mjs` zurückgesetzt): 11 rot, 2 grün (Schalter AUS, 300 kurze Muster = Bestand), dazu 1 rot im geänderten bestehenden Test. Danach alle grün.

Geänderter bestehender Test (Erwartung durch die Entscheidung gekippt, nicht abgeschwächt): `intelligence-planer-aggregate.test.js` Abschnitt 2 erwartete für „höchstens 40 F in Folge“ mit Aggregaten `vorgabeOffen` („nicht Teil von I5-4“); jetzt kein Befund (leerer Plan) und zusätzlich `vorgabeOffen` für halb 186 (Fenster 373 Tage).

## Mutationen

Werkzeug: wörtliche Ersetzung (genau ein Treffer), Lauf `intelligence-planer-aggregate-muster` + `intelligence-planer-aggregate` ohne Messteil, nacheinander, ein Prozess, Quelle danach gegen die Sicherung verglichen (jeweils sauber). Rote Tests je Mutation:

M1 Folge: verschärft nie 7 · M2 verbotene Folge: verschärft nie 3 · M3 Blockanfang links nicht gesucht 6 · M4 Bereich danachFrei statt max(danachFrei, 1) 6 · M5 Block ab d+1 nicht betrachtet 1 · M6 „danach nicht frei“ zählt nicht 3 · M7 „zu lang“ zählt 1 statt Länge 3 · M8 abwesend als frei 1 · M9 Grundbetrag nicht angemeldet 1 · M10 Tag lesen ohne Kosten 1.

M11 „Bestätigung ohne Kosten“ **überlebte** (0 rot): kein Test hielt die Kosten eines Treffers fest. Neue Zusicherung im Budgettest (Treffer kostet mindestens Grundbetrag + 2 × 83 Tage); der Abschnitt ist danach grün, die Mutation wurde nicht erneut gefahren (siehe unten).

**Abgebrochen:** Der Mutationslauf wurde nach M11 vom System wegen Speichermangel beendet (Laptop, parallel weitere Schreiber). Die Quelle war beim Abbruch unverändert (Vergleich mit der Sicherung: gleich). Nicht gelaufen, vorbereitet: M12 Datumsprüfung entfällt · M13 Parameterprüfung des Baukastens entfällt · M14 Grenze 372 entfällt · M15 Pause in der Verwaltung ignoriert · M16 Pause in der Prüfung ignoriert · M17 Vergleich mit/ohne entfällt · M18 Posten: nur eingeteilte Person vorgemerkt · M19 Bestätigung über halbes Fenster. Die zugehörigen Tests sind grün; ob sie die Mutationen fangen, ist **nicht belegt**.

## Messung

Laptop Celeron N4120, TZ=UTC, `--maxWorkers=1`, synthetisch, Läufe unter Last (parallele Schreiber).

| Lauf | ohne Vorgaben | 2 lange Muss-Muster | 5 lange Muss-Muster |
| --- | --- | --- | --- |
| `planeMonat` demo3 (48 Personen), Dezember, Nachtdienste frei, Aggregate an | 2,1–2,3 s, 63 gesetzt | 63 gesetzt (Budget reicht) | 4,2–4,8 s; 34 gesetzt, 25 offen (17 Grund `vorgabe`) |

Messtest (Abschnitt 5, „6. Messung“): 5 lange Muster höchstens 2 × ohne + 5 s — grün (4,2 s gegen 2,1 s). Kosten je Prüfung (demo3, 2418 Prüfungen je Regel): ohne Treffer 6–8 Schritte, mit Treffer etwa 2 × Fensterlänge. Erste Fassung belastete einen Treffer mit 3 × Fensterlänge (Tage einzeln + Baukasten); auf das Kostenmodell des kurzen Wegs (Fenster zweimal = 2 je Tag) gebracht: 26 → 34 gesetzt. Von den 17 offenen Stellen mit Grund `vorgabe` wären 16 mit großem Budget besetzbar (Diagnose mit 10⁸) — Budget, keine Fehlentscheidung; Rückfrage 2.

## Tests und Prüfungen

Lokal, TZ=UTC, `--maxWorkers=1`, ein Prozess, freier Speicher vor jedem Lauf ≥ 2,2 GB:
- `intelligence-planer-*` (kern, aggregate, aggregate-lauf, aggregate-muster), `intelligence-vorgaben*` (11 Dateien), `intelligence-planungsreife`/`-anzeige`, `intelligence-regelbaukasten`, `engine-*` (5), `prozess-wachen` (QS-5), `konsistenz`, `schutzregeln-ersatzsuche`, `warnen`: 24 Dateien, 638/638 grün (mit Messteilen). Danach nur die Kostenzusicherung ergänzt: Abschnitt 3 der neuen Datei 4/4 grün.
- `npx tsc -p jsconfig.json --noEmit` grün; `eslint` auf die geänderten Dateien ohne Befund; `node werkzeug/verdrahtung-pruefen.mjs` ok; `acc45-backlog status-schreiben` + `pruefen` ok.
- v4-3b-*: `src/lib/fachlogik.js` und Oberfläche unverändert, nicht gelaufen. Keine `.github/workflows`-Änderung. Vollregression in CI.

## SSOT

WP-I7-Eintrag in `docs/acc45/work-packages.json` (Notiz und Beleg „Teil 4 lange Musterregeln“), `STATUS.md` neu geschrieben; Status unverändert `IN_PROGRESS`.

## Offene Rückfragen (nur konkret)

1. **Maß der Obergrenze 372 Tage.** Umgesetzt: Fensterlänge 2·halb + 1 ≤ 372 (also „höchstens 184 in Folge“ ohne „danach frei“; verbotene Folge bis 185 Tage Abstand), gleiches Maß wie die 62-Tage-Grenze. Alternative: Musterlänge halb ≤ 372 (Fenster bis 745 Tage; der Baukasten rechnet bis 800). Entscheidung: Maß beibehalten oder auf Musterlänge umstellen? Empfehlung: beibehalten (konservativ, ein Maß für alle Wege; längere Muster sind in Plan und Tests nicht beschrieben).
2. **Budget mit mehreren anspruchsvollen langen Mustern** (präzisiert Rückfrage 1 aus Teil 2, keine Erhöhung vorgenommen): demo3 Dezember, 5 lange Muss-Muster (u. a. „nach N 2 Tage frei“ mit Fenster 87 Tage): 34 gesetzt, 25 offen, davon 16 mit größerem Budget besetzbar. Kosten je Prüfung ohne Treffer 6–8, mit Treffer etwa 2 × Fensterlänge (Baukasten über das Fenster für Text und Bestätigung). Entscheidung wie dort: (a) unverändert, Rest offen (fail-closed); (b) Budget je Planer-Einstieg mit Messtest; (c) in der Automatik den Befund ohne Text (nur Regel/Stufe) aus `musterVerschaerft` nehmen und den Baukasten nur für die angezeigten Befunde rechnen. Empfehlung: (c) prüfen (größter Hebel, keine Budgeterhöhung; braucht aber eine Festlegung, dass die Automatik den Wortlaut nicht braucht), bis dahin (a).
3. **C-Hinweis:** `abstandTage` hat in `pruefeVorgabe` (vorgaben.mjs `groessenFehler`) keine Obergrenze (anders als `max`/`danachFrei` ≤ 366); wirkt sich nicht aus (über 185 offen), wäre aber für die Eingabe konsistent zu begrenzen. Nicht geändert (Scope).

C/D: keine neuen Pakete, Werkzeuge oder Doku-Familien; nur dieser Abschnitt.

### Nachtrag: Gründe offener Stellen im Planungsassistenten und im Selbsttest (Betreiberentscheidung 26.11., Punkt 9)

**Klassifikation:** gehört zu WP-I4/I5/I7, kein neues Paket, keine Änderung der Engine-Logik, keine Umgestaltung des Assistenten. Erledigt die Rückfragen „Anzeige des Grundes“ (`verdraengung`, `folgeVorwaerts`, Planbefunde) und „Selbsttest-Kopie von `planeMonat`“ der Nachträge oben.

**Umsetzung:** Neu `src/lib/assistentGruende.js` (reine Texte, keine Personenbezüge): `grundText(grund)` und `offenText(o)`. `assistent.jsx` zeigt die Zeile „Nicht deckbar“ über `offenText(o)` (zeilenneutral: Import +1, Zeile −1; keine neue Datei im Oberflächeninventar, kein neues Stilliteral). Ohne Feld `grund` bleibt die Zeile exakt wie bisher. Texte: `verdraengung`, `folgeVorwaerts`, `nachtfolge` (betrieblich), `ersatzruhe` und `sonntagsfrei` (gesetzlich, § 11 ArbZG), `aufwand` („Rechenbudget erreicht – Stelle bleibt offen“), `vorgabe` (Rechenbudget der Vorgaben). **Fail-closed:** jeder andere Wert (unbekannt, leer, kein Text, Objektschlüssel wie `constructor`) zeigt „Grund nicht bewertbar – Stelle bleibt offen“, nie leer und nie „frei“. Rollen und Sichtbarkeit unverändert (gleiche Ansicht, gleiche Daten).

**Selbsttest:** `src/pruefung.jsx` hatte eine eigene, ältere Kopie von `planeMonat` (ohne Verdrängung, Vorwärtsprüfung, Planbefunde, Gründe). Sie entfällt; der Selbsttest nutzt `planeMonat` aus `src/lib/fachlogik.js` (wie schon `planKennzahlen`) und prüft dieselben Texte (`offenText`). Damit gibt es eine Rechnung und eine Textquelle.

**Pins (V4-3b), jede Änderung begründet:** `pruefungen/v4-3b-selbsttest.test.js` legt `src/pruefung.jsx` byte-genau fest (Prüfsumme + Zeilenzahl). Wegen der entfallenen Kopie: Zeilen der Datei 7805 → 7755 (Zeile „Selbsttest“ 7875 → 7825, `zeilenMehr` 32 → −18), Prüfsumme `89d6888d…` → `a028bb17…`. Keine andere Pin geändert: `assistent.jsx` bleibt zeilengleich (Einstellungen-Pins, Radien/Literale: unverändert grün), Gesamtzahlen der Ansichten unverändert, weil die neue Datei unter `src/lib` liegt.

**Tests:** neu `pruefungen/intelligence-assistent-gruende.test.js` (11 Tests, läuft über `pruefung:intelligence`): Text je Grund, Interna-frei, gesetzlich/betrieblich benannt, fail-closed, Zeile ohne Grund gleich der bisherigen Formel, jeder von `planeMonat`/`planbefundeNeu` gesetzte Grund hat einen Text, Assistent und Selbsttest ohne zweite Kopie. **Mutationen** (`ui-mutiere`, je zurückgesetzt, Quelle danach sauber): unbekannt leer, Prototyp-Schlüssel, Grund nicht angehängt, Interna-Text, `null` als „kein Grund“, eigene Zeile im Assistenten, eigene Kopie im Selbsttest: 7/7 rot. Vorher (Basis e6064845) und nachher: V4-3b-*, v4-3c, selbsttest, v4-inventar, v4-ist-stand, wp38, planungsreife-anzeige, planer-aggregate: 21 Dateien/246 Tests grün → 22 Dateien/257 Tests grün. `tsc` grün, `eslint` 0 Fehler, `verdrahtung-pruefen` ok.

**Korrektur nach Review #593 (B-1):** `pruefungen/engine-kennzahlen-wp-i12c.test.js` verlangte exakt `import { planKennzahlen } from "./lib/fachlogik.js"`; der Import enthält jetzt auch `planeMonat`. Regex gelockert auf „planKennzahlen im Import aus fachlogik“ (die Zusicherung „keine eigene Fassung“ bleibt). Alle Tests, die Quelltext von `pruefung.jsx`/`assistent.jsx` lesen, lokal geprüft: engine-kennzahlen-wp-i12c, g9-nachtrag, g9-verkauf, geo-spezifikation, imp6-planwirkung (Zählung `einheitDienst(`), import-bestand-imp1, person-eintritt, wp38-toter-code, selbsttest, v4-3b-selbsttest/-einstellungen/-einstieg, intelligence-planungsreife-anzeige, intelligence-planer-aggregate, plus die Gruppe `pruefung:querschnitt` (ohne `inventur-konsole/-install/-phase2/-skript`: hingen lokal unter Windows ohne Ergebnis, lesen weder `pruefung.jsx` noch `assistent.jsx`; CI). Text von `folgeVorwaerts` nennt zusätzlich „Folgedienst nicht prüfbar (Dienst unbekannt)“ (Engine: unbekannter Dienst an einem Folgetag ⇒ ablehnen).

---

# WP-I7 Planer-Kern — Teil 5: Korrekturen aus #588, Betriebsmodus, „Montag frei“, Vorlage Anheften

Basis `origin/integration/release-v4` (e6064845, nach #588/#592). Bestehendes Paket WP-I7, kein neues Paket. `PLANER_AN` und `PLANER_AGGREGATE_AN` unverändert AUS; `PLANBEFUND_GRENZE` (40 Mio) und 372-Tage-Obergrenze unverändert; keine Rechteänderung für Schichtverantwortung oder Betriebsrat; nur synthetische Daten. Verteilung (Teilzeitquoten/Zeiträume) und Variante C (Rechenbudget) nicht in diesem Schritt.

## Stufe A — beschlossene Korrekturen aus #588

1. **Lagebild = Monatsansicht (Fensterangleichung, keine Neuüberarbeitung).** Ursache: `pruefen` ordnete die Ersatzruhetage je Ansicht über `von` − 56 … `bis` + 56 zu; die Zuordnung ist gierig und hängt am Fenster. Das 14-Tage-Lagebild (`src/ansichten/lagebild.jsx:26`) und die Startseite (`fachlogik.js` ~2536) rufen `pruefen(m, d0, d0 + 13)` des Rechenkerns. (Korrigiert nach Review #595 C6: die Selbsttest-Kopie `src/pruefung.jsx` ~2496 hat ein eigenes `pruefen` ohne Ersatzruhe; für sie gilt die Angleichung nicht — sie meldet Ersatzruhe gar nicht, bekannter Rest der Kopie.) Beleg (Skript des Reviewers, nachgestellt im Test): Lagebild ab 24.12.2026, Sonntagsdienst 28.02.2027, Einteilung 02.03.2027 — Monatsansichten unverändert (Einteilung angenommen), Lagebild vorher 1.1., nachher 26.12. + 1.1. Korrektur an einer Stelle: `pruefen` rechnet die Ersatzruhe über `ersatzruheMonatsweise` (befunde.mjs) je Kalendermonat mit der Rechnung der Monatsansicht und filtert auf den Zeitraum. Für einen ganzen Monat ist das byte-gleich zu vorher; für jeden anderen Schnitt sagt die Ansicht für einen Tag dasselbe wie der Monat, und `planbefundeNeu` (je Monatsansicht) deckt damit alle Schnitte ab. Die Aufrufer bleiben unverändert (keine Oberflächenänderung). Kosten: ein 14-Tage-Schnitt über zwei Monate rechnet zwei Monatsfenster statt eines.
2. **Kosten mit tatsächlichem Worst Case.** Die Jahresbilanz liest das Jahr zweimal (`sonntagsfreiBefund` sucht den letzten Sonntag, `freieSonntage` zählt): Anmeldung jetzt 2 · Tage des Jahres, `planbefundAufwandHoechst` 2 · 366. Budget unverändert.
3. **Reserve und Verbrauch konsistent (Planer).** Eine Einteilung ohne Anmeldung (z. B. Rufbereitschaft am Tag, kein neuer Arbeits- oder Nachttag) prüfte die Reserve der Nachprüfung im Planbefund-Budget nicht; nach der Nachprüfung lag `verbraucht` über der Grenze (nachgestellt: Grenze 0, Verbrauch 326 592). Korrektur: `vorwaerts` (planer.mjs) prüft vor jeder Einteilung `leistenPlan(0)` (Reserve für eine Einteilung mehr); leer ⇒ Grund `aufwand`. Fachverhalten unverändert (großes Budget: gleiches Ergebnis, Test).
4. **Messtest verschärft, robust:** Median von drei Läufen < 3 µs je angemeldetem Personentag (vorher Mittel eines Laufs < 5 µs; gemessen bisher 0,27–0,64 µs, also Abstand ≥ 4,5 ×; drei Läufe dämpfen Ausreißer unter Last). Grenze damit höchstens 120 s Rechenzeit.
5. **Kette nach dem Monat:** Test mit dem Gegenbeispiel des Reviewers (Sonntagsdienst 21.02.2027, Einteilung 27.02.2027 ⇒ neuer fehlender Ersatzruhetag zum 26.12.2026 in der Ansicht Dezember; `planbefundeNeu` lehnt ab, Gegenprobe mit weiterem freien Werktag). **Korrektur der Aussage:** Ansprüche *nach* dem Monat können die gemeldeten Befunde eines Monats sehr wohl beeinflussen (ein Sonntagsanspruch mit engerer Frist wird vor den Feiertagsansprüchen zugeordnet und nimmt ihnen den Ersatztag). Die Reichweite Monat ± 111 der Monatsansichten in `planbefundeNeu` deckt das in beide Richtungen ab; die frühere Begründung, nur Ketten *vor* dem Monat seien möglich, war falsch.

## Stufe B — Betriebsmodus der Planer-Funktion

- **Persistenz und Rechte (bestehendes Muster):** `einstellungen.kiSteuerung.planerModus` = `{ modus: "aus" | "knopfdruck" | "automatisch", am, vonRolle, vonPerson }` im einen Schreibweg der Intelligence-Steuerung (`kiSteuerungAnwenden`/`kiSteuerungZusammen`, ki-steuerung.mjs). Ändern darf nur die Leitung (nicht Demo); jede andere Rolle ist wirkungslos (gespeicherter Stand bleibt); ein ungültiger Wert wird abgewiesen; Wann/Wer setzt der Server; Protokolleintrag `planermodus planer (leitung)` ohne Inhalt; Sicht des Betriebsrats ohne Personenkennung. Unlesbarer gespeicherter Wert ⇒ AUS (beim nächsten Schreiben als `aus`/`system` abgelegt).
- **Wirksamer Modus** `planerModusWirksam` (planer.mjs): ohne Freigabe des Planers (`PLANER_AN`, bleibt AUS) immer AUS; nach der Freigabe Standard Knopfdruck, automatisch nur bei ausdrücklicher Einstellung; unbekannt/unlesbar = AUS.
- **Äußerer Einstieg** `planerEinstieg`: Modus → KI-Pause (unlesbar = Pause) → Planungsreife (WP-I6 `planungsreife`/`vorschlagErlaubt`, vorhandene Logik) → `planeVorschlag`. Nicht planungsreif ⇒ Status `nicht_planungsreif`, kein (auch kein teilweiser) Vorschlag, `voraussetzungen` = Punkt + Text der Prüfliste ohne Personenkennungen. Knopfdruck ohne Knopf ⇒ `wartet`.
- **Unerfüllbares Muss ⇒ offen + Ursache:** Jede offene Stelle ohne Grund bekommt nach dem Planen `ursache` + `regeln` aus `lueckenUrsache` (WP-I8; Kennungen, keine Person; ein Budget für alle Stellen, eigenes Vorgaben-Budget, ohne Wirkung auf den Plan); reicht das Budget nicht oder sind Vorgaben nicht vollständig geprüft: `unvollstaendig` (nie eine erfundene Ursache). Eine Einteilung mit Muss-Verletzung setzt der Planer weiterhin nie.
- **Ungültige Muss-Vorgaben fallen nicht still weg (Review #587 C1):** Aktive Plan-Vorgaben (Muster/Block/Zählregel), die weder wirken noch gültig über der Grenze sind (z. B. Muster ohne brauchbare Länge, Zählregel ohne gültigen Zeitraum), ergeben jetzt `vorgabeOffen` „Vorgabe nicht auswertbar beschrieben“ (Automatik bei Muss: Achtung ⇒ nicht einteilen; Warndialog: Hinweis). Vorher: kein Befund. Ein bestehender Test hielt das alte Verhalten fest; Erwartung durch die Entscheidung gekippt (nicht abgeschwächt).
- **Oberfläche:** nicht gebaut. Der Planer hat noch keine Oberfläche (kein Knopf „Vorschlag erstellen“); ein Modusschalter ohne Planer wäre keine Produktfunktion und zöge V4-3b-Pins (Querschnitt-Inventar) nach sich. Vorschlag: eigene Datei neben `ki-steuerung.jsx` zusammen mit der Planer-Oberfläche; `einstellungen.jsx` (377 Zeilen) bleibt unberührt.

- **Voraussetzung vor `PLANER_AN` (Review #595 C7, vorgemerkt):** `planerEinstieg` prüft heute Freigabe, Modus, KI-Pause und Planungsreife, aber noch NICHT den Intelligence-Hauptschalter des Betriebs und die Beantwortung der Mitbestimmungsfrage (`intelligenceEntscheidung`). Vor dem Einschalten von `PLANER_AN` nachzuziehen (Entscheidung zur Funktionskennung, siehe offene Frage 1).

## Stufe C — „Montag frei“ nach einem Nachtdienst-Wochenende

Konfigurierbare betriebliche Vorgabe in der vorhandenen Struktur (Musterregel, Regelbaukasten): neue Musterart `montagFrei` `{ art, klassen }` — stehen Samstag UND Sonntag Dienste aus `klassen` (der Betrieb wählt, z. B. Nachtdienste), ist der folgende Montag frei. Stärke (Muss/Soll/Wunsch) und Geltung (Betrieb, Einheit, Qualifikationsgruppe, Personen), Gültigkeit und Ausnahmen kommen wie bei jeder Vorgabe aus der Verwaltung; nichts pauschal. Wirkung über `vorgabenBefunde` (Fenster d ± 2: geprüft wird auch die Einteilung am Wochenende, wenn der Montag schon Dienst hat); Abwesenheit am Montag ist nie „frei“ (offen). Verwaltung: Option, Beispielfälle für den Testlauf, Bezeichnung in `vorgaben.jsx` (eine Zeile verlängert). Keine Fairness-Architektur, keine Änderung der gesetzlichen Ruhezeitprüfung.

## Stufe D — Anheften: nicht gebaut, Vorlage im PR-Text

## Rot → grün, Mutationen, Tests

**Neue/geänderte Tests:** `intelligence-planer-kern.test.js` Abschnitt 9: Kette nach dem Monat, Lagebild (Szenario des Reviewers), Lagebild-Schnitte gegen Monatsansichten (Zufallsplan), Messtest (Median), Reserve ohne Anmeldung (Rufbereitschaft am Tag; Grenzen 0, h − 1, h, 3h ⇒ 0/0/1/3 Einteilungen, Verbrauch ≤ Grenze; großes Budget unverändert 12); Erwartungen der Anmeldung (2 · 365) angepasst; Quellprüfung „eine Rechnung“ auf `ersatzruheMonatsweise`. Abschnitt 10 (neu): Modus/Freigabe, Schreibweg/Rechte, `planerEinstieg`, nicht planungsreif, unerfüllbares Muss + ungültige Muss-Vorgabe. Abschnitte 2/3: offene Stellen ohne `ursache`/`regeln` gegen die frische Rechnung, jede offene Stelle mit Grund oder Ursache. `intelligence-vorgaben-wirkung.test.js`: Erwartung „ungültig ⇒ kein Befund“ durch die Entscheidung gekippt (jetzt `vorgabeOffen`, Automatik Achtung); Abschnitt 10 (neu) „Montag frei“ (Verwaltung/Testlauf, Muss/Soll, Wochenend-Einteilung, Geltung, `planeMonat` und Planer mit Gegenprobe).

**Rot vor der Korrektur (nachgestellt):** Lagebild 26.12. + 1.1. statt 1.1. (Skript `r588b-lagebild`); Planer Grenze 0 ⇒ Verbrauch 326 592 (Skript `i7-ruf`); ungültige Muss-Vorgabe ⇒ kein Befund.

**Mutationen (`i7-mutation.mjs`, nacheinander, je Lauf zurückgesetzt, Quelle danach gegen die Sicherung verglichen: jeweils gleich):** M1 Lagebild ohne Monatsschnitt 1 rot · M2 Jahresbilanz einfach angemeldet 1 · M3 Reserve nur bei Anmeldung 1 · M4 ohne Einstellung „automatisch“ 2 · M5 Freigabe ignoriert 2 · M6 Planung darf den Modus 1 · M7 Planungsreife übergangen 1 · M8 ungültige Vorgaben still 2 · M9 keine Ursache 1 · M10 „Montag frei“ nie verletzt 5 · M11 Fenster ± 1 statt ± 2 4 · M12 unlesbarer Modus wie gespeichert 1. Alle erkannt. Hinweis: Der Zufallstest „jeder Schnitt gleich den Monatsansichten“ fängt M1 allein nicht (der Zufallsplan zeigt keinen Fensterunterschied); M1 fängt das Reviewer-Szenario.

**Tests und Prüfungen (lokal, TZ=UTC, `--maxWorkers=1`, ein Prozess, freier Speicher vor jedem Lauf geprüft):** in Gruppen (ein abgebrochener Gesamtlauf wurde nicht unverändert wiederholt): `intelligence-vorgaben*`, `intelligence-steuerung*`, `intelligence-planungsreife*`, `intelligence-regelbaukasten` 15 Dateien 511/511; `engine-*`, `schutzregeln-ersatzsuche`, `konsistenz`, `warnen` 8 Dateien 167/167 (Golden-Werte unverändert); `intelligence-planer-aggregate*` 3 Dateien 44/44; `intelligence-planer-kern` 72/72; `v4-3b-einstellungen`, `-querschnitt-1`, `-querschnitt-2` 38/38. `npx tsc -p jsconfig.json --noEmit` grün; `eslint` auf die geänderten Dateien ohne Befund. Keine `.github/workflows`-Änderung. Vollregression in CI.

## SSOT

WP-I7-Eintrag in `docs/acc45/work-packages.json` (Notiz „Teil 5“), `STATUS.md` neu geschrieben; Status unverändert `IN_PROGRESS`.

## Offene Fachfragen (kurz)

1. **Freigabe des Betriebsmodus:** Gilt „Freigabe“ = `PLANER_AN` (global, Betreiber) — so umgesetzt — oder zusätzlich je Betrieb der Intelligence-Hauptschalter/eine Funktion F1…F18? Empfehlung: zusätzlich eine Funktion der KI-Steuerung, sobald der Planer eine Oberfläche bekommt.
2. **„Montag frei“ Auslöser:** umgesetzt Samstag UND Sonntag mit gewählten Diensten (ein Dienst zählt am Anfangstag; eine Nacht Freitag→Samstag zählt nicht). Soll auch „Freitag + Samstag“ (Nacht endet Sonntag früh) auslösen? Entscheidung.
3. **Ursache bei großen Betrieben:** `lueckenUrsache` hat 400 Personenprüfungen je Einstieg; danach `unvollstaendig`. Größeres Diagnose-Budget nur mit Messung (keine pauschale Erhöhung).
4. **Anheften:** Datenmodell-Vorlage im PR-Text zur Entscheidung.

## Review #595 (Kopf 5b531a56): B-1 und C-Punkte

- **B-1 (behoben):** War das ganze Feld `kiSteuerung` unlesbar (kein einfaches Objekt: Text, Liste, Zahl, Wahrheitswert, null), galt es als „nicht vorhanden“ ⇒ Knopfdruck ohne Pause (`planerEinstieg` setzte 12 Einteilungen). Neu `kiSteuerungUnlesbar` (ki-steuerung.mjs): Feld vorhanden und nicht `undefined`, aber kein einfaches Objekt, oder die Einstellungen selbst kein Objekt ⇒ `kiPauseAktiv` = Pause (wirkt auch für `planeVorschlag` und die Aggregate der Vorgaben), `planerModusWirksam` = AUS. Fehlendes Feld (auch `undefined`) und leere Steuerung `{}` bleiben „nicht vorhanden“ (Abgrenzung im Test). Tests: Abschnitt 10 („kaputt“, [], 5, true, null; Einstieg AUS, Planer pausiert).
- **R10 (Test):** fester Wert `planbefundAufwandHoechst` HE 2026 = 2·5 + 2·366 + 110 + 9·2·(143 + 22·26 + 7·110) = 27 582 (selbst nachgerechnet; erkennt „1 × 366“).
- **R6 (Test):** Zufallstest „Lagebild = Monatsansichten“ mit dichten Plänen (85–97 % Arbeitstage, auch sonntags; Seeds 35/64/74/76/78) und Vorbedingung, dass der alte Schnitt dort in ≥ 5 Fällen abwiche; erkennt den alten Schnitt jetzt allein.
- **C2:** `montagFrei` mit „frei“ unter den Auslöser-Klassen wird in der Verwaltung (`pruefeVorgabe`) abgewiesen.
- **C1:** Zählregel mit nicht numerischer Grenze (Text, fehlt, null, leer, Wahrheitswert) im Wirkpfad ⇒ `vorgabeOffen` „nicht auswertbar beschrieben“ (Automatik bei Muss: Achtung), nicht mehr still „kein Befund“.
- **C6, C7:** Nachweis korrigiert bzw. Voraussetzung vorgemerkt (oben).
- **Mutationen:** M13 Modus: unlesbares Feld = nicht vorhanden 2 rot · M14 Pause: unlesbares Feld = keine Pause 2 · M15 Höchstwert mit 1 × 366 1 · M16 alter Schnitt (nur Zufallstest) 1 · M17 Zählregel-Grenze still 1. Quelle danach jeweils gleich der Sicherung.
- **Tests (nach dem Fix, Gruppen, ein Prozess):** vorgaben/steuerung/planungsreife/regelbaukasten 511/511, engine-* u. a. 167/167, planer-aggregate 44/44, planer-kern 73/73; tsc grün, eslint ohne Befund.

## Betreiberentscheidung 27.11.: Funktionsschalter je Betrieb (im selben PR)

- **Umsetzung:** Knopfdruck/automatisch gelten nur, wenn im Betrieb der Funktionsschalter **F13 „Planvorschlag“** an ist (bestehende Struktur `kiSteuerung.funktionen`, bestehender Schreibweg: nur die Leitung, Stempel vom Server; `PLANER_FUNKTION` in planer.mjs). Vorrangig und verbindlich: `PLANER_AN`, Pause (auch unlesbar), Intelligence-Hauptschalter, beantwortete Frage nach der Mitbestimmungsvertretung („ja“ erst nach aufgehobener Pause). Die betriebliche Prüfung ist eine Stelle: `kiBetriebsEntscheidung` (ki-steuerung.mjs), aus `intelligenceEntscheidung` herausgelöst und dort unverändert genutzt (Rolle und Prozessschalter prüft weiter nur `intelligenceEntscheidung`; der Planer ruft kein Sprachmodell). Fehlend/unlesbar = AUS. Damit ist die Voraussetzung C7 (oben vorgemerkt) erledigt. Hinweis: F13 ist in der Positivliste als Erklärfunktion zum Planvorschlag beschrieben; derselbe Schalter gibt jetzt auch den deterministischen Planer im Betrieb frei (eine Kennung für „Planvorschlag“, keine neue Architektur).
- **Reihenfolge in `planerEinstieg`:** Eingaben → Freigabe → Pause (Status `pausiert`) → Hauptschalter/Frage/F13 (Status `aus`) → Modus → Planungsreife → `planeVorschlag`. Eine unlesbare Steuerung ergibt jetzt `pausiert` (vorher `aus`; beides rechnet nichts). `planeVorschlag` selbst bleibt der Kern (Prüfungen geben ausdrücklich frei).
- **Unvollständig sichtbar:** offene Stellen tragen `ursache: "unvollstaendig"` bzw. `vorgabenUnvollstaendig`; das Ergebnis zählt sie in `ursachenUnvollstaendig`. Eine Anzeige des Planers gibt es noch nicht; `assistent.jsx` zeigt `planeMonat` (unverändert, ohne Ursachen).
- **Anheften:** Konfliktregel entschieden (manuelle Änderung hebt nur die Anheftung der betroffenen Einteilung auf, nachvollziehbar und sichtbar) — in der Datenmodell-Vorlage im PR-Text; nicht gebaut.
- **Tests:** neuer Test „Funktionsschalter des Betriebs“ (ohne Hauptschalter, Hauptschalter aus, Frage offen, ohne Funktion, F13 aus, andere Funktion, F13 ohne Stempel ⇒ AUS mit Code `KI_AUS`; „ja“ ohne aufgehobene Pause ⇒ pausiert, mit aufgehobener Leitungs-Pause ⇒ ok; ohne Freigabe nichts; F13 schaltet nur die Leitung); bestehende Abschnitt-10-Tests auf freigeschaltete Betriebe umgestellt (ohne Freischaltung jetzt AUS statt Knopfdruck — Erwartung durch die Entscheidung gekippt); `ursachenUnvollstaendig` geprüft. Gruppen nach der Änderung: 511/511, 167/167, 44/44, planer-kern 74/74; tsc grün, eslint ohne Befund.
- **Mutationen:** M18 Modus ohne Betriebsfreischaltung 2 rot · M19 Einstieg ohne Betriebsfreischaltung zuerst überlebt (der Modus fängt es doppelt ab; gleicher Status), nach Zusicherung des Grunds 1 · M20 Funktionsschalter ignoriert 1 · M21 Frage ignoriert zuerst überlebt (Ausnahmepfad ergab ebenfalls „nicht OK“), nach Zusicherung des Codes `KI_AUS` 1 · M22 unvollständige Ursachen nicht gezählt 1. Quelle jeweils zurückgesetzt und verglichen.

---

# WP-I7 Planer-Kern — Teil 6: eigener Planer-Schalter, Testlücke D5, Anheften

Basis `origin/integration/release-v4` (284d9a3d, enthält #595 Teil 5). Bestehendes Paket WP-I7, kein neues Paket. `PLANER_AN` und `PLANER_AGGREGATE_AN` unverändert AUS; `PLANBEFUND_GRENZE` (40 Mio) und 372-Tage-Obergrenze unverändert; keine Budgeterhöhung; keine Rechteänderung für Schichtverantwortung, Betriebsrat oder Beschäftigte; nur synthetische Daten. Ein Commit je Stufe.

## Stufe A0 — Doppelnutzung F13 aufgelöst (Betreiberentscheidung 27.11.)

- **Vorher (#595):** Der Funktionsschalter F13 „Planvorschlag“ (Klasse C, Modellaufrufe) war zugleich der betriebsspezifische Schalter des deterministischen Planers.
- **Jetzt:** eigener Schalter `einstellungen.kiSteuerung.planerSchalter` = `{ an, am, vonRolle, vonPerson }` in der bestehenden Struktur und im bestehenden Schreibweg (`kiSteuerungAnwenden`): nur die Leitung (nicht Demo; `KI_RECHTE.leitung` + `planerSchalter`), Stempel vom Server, Protokoll `planer-an`/`planer-aus` (Ziel `planer`), Sicht des Betriebsrats ohne Personenkennung, ungültiger Wert abgewiesen, unlesbarer gespeicherter Wert = AUS (beim nächsten Schreiben `an: false`, `vonRolle: system`).
- **Entscheidung:** `kiPlanerEntscheidung` (ki-steuerung.mjs) nutzt dieselben Voraussetzungen wie jede Funktion — eine Stelle `betriebsVoraussetzungen`: Pause (auch unlesbar) vor allem, Hauptschalter an, Frage nach der Mitbestimmungsvertretung beantwortet, „ja“ erst nach aufgehobener Pause (Voraussetzungen bleiben, im Test belegt) — danach nur der eigene Schalter. `kiBetriebsEntscheidung`/`intelligenceEntscheidung` unverändert (gleiche Reihenfolge, gleiche Codes; F13 bleibt nur die KI-Erklärfunktion). `planerModusWirksam`/`planerEinstieg` lesen `kiPlanerEntscheidung`; `PLANER_FUNKTION` entfällt (`PLANER_SCHALTER = "planerSchalter"`).
- **Tests:** F13 an allein ⇒ Planer AUS; F13 aus + Planer-Schalter an ⇒ Planer rechnet; ohne/aus/unlesbar (ohne Stempel, kein Objekt, null, „an“ als Text) ⇒ AUS mit `KI_AUS`; Pause/Leitung-Pause/unlesbare Pause ⇒ `KI_PAUSIERT`; „ja“ ohne aufgehobene Pause ⇒ pausiert, mit aufgehobener ⇒ ok; nur die Leitung schaltet; Golden: `intelligenceEntscheidung` mit und ohne Planer-Schalter (an/aus/kaputt) gleich über alle 18 Funktionen + eine unbekannte, 4 Rollen, Prozess an/aus, 7 Stände, je 3 Werte des Schalters (3 192 Vergleiche); die bestehenden Steuerungstests (147) unverändert grün. Oberfläche für den Schalter nicht gebaut (der Planer hat noch keine; wie der Betriebsmodus).

## Stufe A — Testlücke D5 (Review #595)

Test in `intelligence-steuerung.test.js` (keine Codeänderung): unlesbares Feld `kiSteuerung` (Text, Liste, Zahl, Wahrheitswert, null), Einstellungen kein Objekt, aktive/unlesbare Leitung-Pause, „ja“-Pause, Leitung-Pause neben aufgehobener BR-Pause ⇒ `kiPauseAktiv` ja, aber `kiBrPauseAktiv` nein, `betriebsratKontenSperre` frei, `rollenwechselErlaubt` erlaubt (Herabstufen und neues BR-Konto). Gegenprobe: nur die Betriebsrat-Pause (aktiv oder eigener unlesbarer Stand) sperrt.

## Stufe B — Anheften (Betreiberentscheidungen 26./27.11., Vorlage #595)

**Invarianten (vor der Umsetzung festgelegt):** (1) Planer, Verbessern und `planeMonat` setzen an einem angehefteten Person-Tag nichts und ändern angeheftete Einträge nie — auch nicht über Posten (angeheftete Personen sind nie eigene Einteilungen und zählen in `verdraengt` immer mit). (2) Angeheftetes steht im Bestand (`abweichungen`) und zählt überall als gesetzt; die Aggregate der Vorgaben lesen den Bestand, keine Vormerkung je Tag veraltet. (3) Eine manuelle Änderung der Einteilung hebt ausschließlich deren Anheftung auf — sichtbar und nachvollziehbar. (4) Unlesbar ⇒ fail closed, nie stilles Weglassen. (5) Keine neuen Rechte.

**Datenmodell (wie Vorlage):** eigene Karte `mandant.angeheftet = { "<personId>|<JJJJ-MM-TT>": { am, vonRolle } }`; aufgehoben zusätzlich `aufgehobenAm`, `aufgehobenVonRolle` (Vermerk bleibt sichtbar, bis Leitung/Planung ihn entfernt). Wert der Einteilung bleibt in `abweichungen` (Leser unverändert). Lesen: `server/lib/engine/anheften.mjs` (rein); Schreibweg: `server/lib/anheften.mjs`, eingehängt in `zusammenfuehren` nach den Vorgaben.

**Wo die Vorlage offen war — kleinste fail-closed Variante:**
- Stempel nur Rolle (`vonRolle`), keine Personenkennung (Vorlage: `von`).
- Anheften nur für eine eingetragene Einteilung (Schlüssel in `abweichungen`, Dienst oder „-“); der Server leitet keinen Folge-/Schichtmodell-Dienst her — die Oberfläche schreibt ihn vorher als Abweichung.
- Ungültiger Schlüssel, unbekannte Person: Absage mit Grund statt stillem Verwerfen.
- Rechte: anheften/lösen nur Leitung und Planung (nicht Demo, nicht Kundenrolle); andere Rollen: mitgeschicktes Feld wirkungslos. Ändert die Kundenrolle (voller Schreibweg) eine angeheftete Einteilung, hebt das die Anheftung wie jede Änderung auf.
- **Schichtverantwortung:** sieht die Karte nicht, schreibt sie nie (Feld „der Leitung vorbehalten“), und eine angeheftete Einteilung ändert sie nicht (Absage) — kein neues Recht, auch nicht das Aufheben. Unlesbare Karte ⇒ SV-Änderungen am Plan abgewiesen (Fachfrage 2).
- Beschäftigte und Betriebsrat sehen weder Karte noch Protokolleinträge (Vorlage: „fest“ für Beschäftigte offen).
- Veraltete Kopie: ein früher aktiver Eintrag mit altem Stempel heftet einen aufgehobenen Tag nicht neu an; neu angeheftet wird nur mit frischem Eintrag. Schickt die Anfrage das Feld nicht mit, bleibt die gespeicherte Karte.
- Abwesenheit am angehefteten Tag hebt nichts auf (Befund wie bisher).
- Unlesbare Karte: Planer Status `ungueltig` („Anheftungen nicht lesbar“), Ersatzsuche/`planeMonat` schlagen niemanden vor, die Anzeige meldet sie; Leitung/Planung reparieren durch Neusetzen.

**Wirkung im Code:** `ersatzVorschlaege` (einsatz.mjs, gemeinsam für Planer und `planeMonat`): angeheftete Person nicht möglich, Hindernis „Einteilung an diesem Tag angeheftet“; Planer: `einsetzbar` (Blockfortsetzung, Verbessern) und `nachpruefen` (eigene Einteilung an angeheftetem Tag besteht nie); Ergebnis zählt `angeheftet` im Monat.

**Protokoll und Grenzen:** Modulprotokoll, Modul `anheften`, Arten `anheften-gesetzt`/`-geloest`/`-aufgehoben` mit Anzahl, Zeit, Rolle — kein Person|Tag (Betriebsprotokoll z. B. „Anheften: 1 Einteilung durch Änderung nicht mehr angeheftet (die Planung)“). Grenzen wie die Vorgaben (`MODULPROTOKOLL_GRENZE`, 512 KiB über `modulprotokollUeberGrenze`): neues Anheften scheitert an der Grenze, Aufheben durch Änderung und Lösen gehen immer (wie Deaktivieren). Karte höchstens 3 000 Einträge bzw. 320 KiB (≈ 90 Byte je Eintrag; weit unter `RUMPF_MAX` 6 MiB); mehr beim Lesen = unlesbar. Neuer Betrieb ohne Karte; Sicherung/Export/Wiederherstellung über `VOLL_BETRIEB` zusammen mit `abweichungen`.

**Sichtbar (klein):** `src/ansichten/anheftungen.jsx` (eigene Datei, nur lesend): angeheftete Einteilungen des Monats und „nicht mehr angeheftet — manuell geändert am … (Rolle)“; unlesbare Karte als Meldung. Einhängezeile in `monatsplan.jsx` (Zeilen 216 → 218: Import + Einhängezeile); `einstellungen.jsx` (377), kern/bereichsplan/posten/assistent unberührt. Anheften/Lösen in der Oberfläche mit der Planer-Oberfläche (Fachfrage 4).

**Tests (`pruefungen/intelligence-anheften.test.js`, neu, 10):** Lesen (10 unlesbare Formen sperren alles); „frei“ angeheftet bleibt frei (Gegenprobe: ohne Anheften setzt der Planer dort), Nachprüfung, Ersatzsuche, `planeMonat`; unlesbare Karte; **Zufallsvergleich gegen naive Referenz** (12 Startwerte × mit/ohne Aggregate = 24 Läufe, feste Obergrenze; Referenz: Eintrag, Dienst laut `personTag` und keine eigene Einteilung an jedem angehefteten Person-Tag; mit und ohne Aggregate gleiches Ergebnis); zwei Demobetriebe mit Posten/Lücken (Verdrängung); Schreibweg end-to-end über `zusammenfuehren` (Rechte je Rolle, Stempel, Protokoll ohne Person|Tag, Aufheben nur der betroffenen Einteilung, Entfernen = Änderung, veraltete Kopie, Neu-Anheften, Lösen, Betriebsprotokoll, Anzeige, SV-Absage, Sicht je Rolle, BR-Protokollsicht, Grenzen der Karte und des Modulprotokolls).

## Stufe C — Verteilung: nicht gebaut (Umfang), Fachfrage vorgelegt

Weggelassen (Auftrag: bei zu großem Umfang). Grund: Die vorhandene `verteilungsregel` hat nur `groesse` (freier Text) und `maxAbweichung` und wirkt heute nicht im Plan (nur Testlauf, nicht in `VORGABEN_PLANARTEN`); welche Größe (Nächte, Wochenenden, Feiertage, Stunden) gemeint ist und wie mehrere Verteilungsregeln gegeneinander gewichtet werden, ist nicht bestimmt — das würde erfunden. `rang.verteilung` bleibt `null` („nicht bewertet“, nie „erfüllt“). Teilzeit anteilig weiter nur bei `ausnahmen.teilzeitAnteilig === true` (Zählregeln, unverändert). Entscheidungsfrage im PR-Text.

**Machbarkeitsnotiz Variante C (Rechenbudget, nicht gebaut):**
1. Idee: Automatik nimmt bei langen Mustern nur das Urteil `musterVerschaerft`, ohne das Fenster mit dem Baukasten zu rechnen.
2. Ersparnis nur im Fall „verschärft“ (2 · Fensterlänge Schritte) — gerade dann lehnt die Automatik bei Muss ohnehin ab; im häufigen Fall „nicht verschärft“ spart C nichts.
3. Gleichwertigkeit nicht voll belegt: der Baukasten unterscheidet `verletzt`/`offen` (unbekannte, abwesende Tage) und liefert Text/Hinweis; `musterVerschaerft` nur ja/nein.
4. Soll/Wunsch-Befunde (Anzeige) brauchen den Baukasten weiter; nur Muss in der Automatik wäre betroffen.
5. Ungültige/nicht bewertbare Muss-Muster müssten weiter `vorgabeOffen` ergeben (C1 #587) — in C gesondert abzusichern.
6. Ergebnis: volle fachliche Gleichwertigkeit nicht nachgewiesen, Nutzen gering ⇒ Variante A bleibt; Budget 40 Mio und 372-Tage-Grenze unverändert.

## Tests, Mutationen, Prüfungen (Teil 6)

**Mutationen** (`i7b-mutationen.mjs`, Arbeitsablage; nacheinander, ein Prozess, feste Zeitgrenze, Quelle danach gegen die Sicherung verglichen und `git diff` sauber — jeweils ja): M1 Planer-Schalter ignoriert · M2 „ja“ ohne aufgehobene Pause · M3 unlesbarer Planer-Schalter gilt · M4 Planung darf den Planer-Schalter · M5 unlesbare Steuerung sperrt BR-Konten (D5) · M6 Leitung-Pause sperrt BR-Konten (D5) · M7 unlesbare Karte sperrt nicht · M8 Ersatzsuche ohne Anheften · M9 Planer ohne Prüfung der unlesbaren Karte · M10 Blockfortsetzung/Verbessern ohne Anheften · M11 Nachprüfung ohne Anheften · M12 Änderung hebt nicht auf · M13 Änderung hebt alle auf · M14 Kundenrolle heftet an · M15 SV ändert Angeheftetes · M16 veraltete Kopie heftet neu an · M17 Beschäftigte sehen die Karte · M18 BR sieht Protokolleinträge · M19 Anheften ohne eingetragene Einteilung. **19/19 erkannt.**

**Tests (lokal, TZ=UTC, `--maxWorkers=1`, ein Prozess, freier Speicher vor jedem Lauf geprüft):** Intelligence-Gruppe (`intelligence-planer-*`, `intelligence-anheften`, `intelligence-steuerung*`, `intelligence-vorgaben*`, `intelligence-planungsreife*`, `intelligence-regelbaukasten*`) 22 Dateien 654/654; Rechte/Sicht/Engine/Wachen (`engine-*`, `sicht*`, `rechtematrix*`, `vollausgabe`, `wiederherstellung-*`, `betreiberfelder`, `kette-a-rundreise`, `modul-bereichsplan-protokoll`, `modul-inert`, `modulaktiv-allowlist`, `beschaeftigung`, `schutzregeln-ersatzsuche`, `konsistenz`, `warnen`, `imp6-*`, `geraete-wp21*`, `oberflaeche-render`, `wcag-wp40`, `prozess-wachen`, `ci-abdeckung`, `v4-inventar`, `routen-inventar`, `sitzungsinventar`) 39 Dateien — erster Lauf 2 Dateien rot (V4-3b-Inventar zählt die neue Datei), Inline-Stile aus der neuen Datei entfernt und Pins nachgeführt; danach alle `v4-3b-*` 14 Dateien 176/176 (bzw. Einzelwiederholung grün). `npx tsc -p jsconfig.json` grün; `eslint` auf alle geänderten Dateien ohne Befund (nur drei vorbestehende Warnungen in `monatsplan.jsx`). Keine Workflow-Änderung. Vollregression in CI.

## SSOT (Teil 6)

WP-I7-Eintrag in `docs/acc45/work-packages.json` (Notiz „Teil 6“, Testliste + `intelligence-anheften.test.js`), `STATUS.md` neu geschrieben, `acc45-backlog pruefen` OK; Status unverändert `IN_PROGRESS`.

## Offene Fachfragen (Teil 6, kurz)

1. **Verteilung:** Welche Größen (Nächte, Wochenenden, Feiertage, Stunden) und welche Gewichtung? Empfehlung: zunächst eine Größe „Nachtdienste je Person im Monat“ mit `maxAbweichung` der vorhandenen `verteilungsregel`, Teilzeit nur bei `teilzeitAnteilig === true`, nur als Rang „Verteilung“ nach Muss/Soll.
2. **SV und Angeheftetes:** umgesetzt „SV ändert nicht“ (kein neues Recht); Alternative „SV-Änderung hebt auf“. Empfehlung: so lassen.
3. **Beschäftigte:** „fest“ an eigenen Tagen zeigen? Umgesetzt: nichts.
4. **Oberfläche** für Anheften/Lösen sowie Planer-Schalter/-Modus: mit der Planer-Oberfläche in eigener Datei — **Stufe 1 gebaut** (Abschnitt „Planer-Oberfläche, Stufe 1“ unten).

## Review #602 (Kopf 5e18df4b): CI, B-1, B-2, C1, C2 — behoben

- **CI `wp48-rundweg`:** neues Katalogfeld `angeheftet` im Prüfbestand belegt (`angeheftet: {}`). **Sicherung/Export/Wiederherstellung/Import:** die Karte steht in `sicht.mjs` BETRIEB (Spalten WEG/WEG) und damit in `VOLL_BETRIEB` — Sicherung (`EXPORT_BETRIEB = VOLL_BETRIEB`), Vollausgabe und Wiederherstellung (`betriebWiederherstellen` nimmt `VOLL_BETRIEB` aus der Sicherung) führen sie zusammen mit `abweichungen`; anders als `vorgaben` (Server-Testlauf, Stufengrenze) braucht sie keine Sonderbehandlung: ihre Stempel stammen vom Server, und eine verwaiste Anheftung nach dem Zurückspielen wird beim nächsten Speichern als aufgehoben vermerkt (B-1). Neuer Betrieb: Karte verworfen. Die Monatsscherben (`MONATSFELDER`) und Teilweg-Zellfelder bleiben unverändert (die Karte liegt im Kern; der Teilweg schickt sie unverändert zurück ⇒ B-2).
- **B-1 (verwaiste Anheftung sperrte jedes Speichern):** „Nur eingetragene Einteilung“ gilt jetzt nur für in der Anfrage NEU Angeheftetes. Eine aktive Anheftung ohne Einteilung wird beim Speichern als aufgehoben vermerkt (`aufgehobenVonRolle: "system"`, wenn die Einteilung schon vorher fehlte; sonst die Rolle der Änderung) und im Modulprotokoll gezählt — sie sperrt nie. Der Datenschutzlauf (`raeumen`, aufbewahrung.mjs) kürzt die Karte mit der Plandatenfrist wie `abweichungen` (nur nach Datum; eine unlesbare Karte bleibt liegen). **C1:** Anonymisierung lässt den Schlüssel pseudonym stehen — wie `abweichungen` (Plandaten werden nur nach Datum gelöscht); kein eigener Löschweg je Person.
- **B-2 (unlesbare Karte sperrte das normale Speichern):** Der unverändert zurückgeschickte gespeicherte Wert gilt als „nicht geschrieben“ — Speichern geht, die Karte bleibt unlesbar, Planer `ungueltig`, SV gesperrt. Reparatur: Leitung/Planung schicken eine gültige Zuordnung (gültige alte Einträge behalten ihren Stempel). Ein unlesbarer gespeicherter Eintrag, unverändert in einer geänderten Zuordnung mitgeschickt, wird abgewiesen (kleinste fail-closed Variante; nie still neu angeheftet).
- **C2:** Test „neuer Betrieb ohne Karte“ ohne Bedingung; Lösen und Aufheben an der Kartengrenze getestet.
- **Tests:** Gegenbeispiele des Reviewers 1:1 (Karte `a1|2020-01-01` ohne Abweichung, Leitung/Planung/Kunde ändern nur `name`; `raeumen` mit Frist; Karte `"x"`, `[]`, `3`, `{"a1|…": {}}` mit Namensänderung; Reparatur; SV gesperrt).
- **Mutationen M19–M24** (je Lauf zurückgesetzt, byte-gleich, git diff sauber): M19 Prüfung „eingetragene Einteilung“ entfernt — erkannt · M20 Prüfung wieder für alle aktiven Einträge — **nicht erkannt, gleichwertige Mutation**: verwaiste Einträge sind vor der Prüfung schon aufgehoben, die Prüfung trifft dann dieselbe Menge; die Absicherung von B-1 trägt M21 · M21 verwaiste Anheftung nicht aufgehoben — erkannt (das ist zusammen mit M20 genau der Fehler des Reviewers) · M22 unveränderter Rückweg zählt als Schreiben — erkannt · M23 unlesbarer Eintrag still neu angeheftet — erkannt · M24 Datenschutzlauf ohne Karte — erkannt.
- **Tests nach dem Fix (ein Prozess, TZ=UTC, --maxWorkers=1):** 48 Dateien 2 109/2 109 (`intelligence-anheften`, `wp48-*` inkl. `wp48-rundweg`/Teilweg/Löschlauf, `b-h5-teilweg`, Katalog-/Sichttests `sicht*`, `vollausgabe`, `betreiber-sicht`, `kette-a-rundreise`, `wiederherstellung-schutz`, `drift-wiederherstellung`, `dsgvo-server`, Aufbewahrung/Monatsabschluss/Modul-Kern, `rechtematrix*`, `betreiberfelder`, Wachen `prozess-wachen`, `ci-abdeckung`, `v4-inventar`, `routen-inventar`, `sitzungsinventar`); tsc grün, eslint ohne Befund.

---

# WP-I7 Planer-Kern — Teil 7: Verteilung (erste Stufe), „Fest eingeplant“, Review #602 C

Basis `origin/integration/release-v4` (84f94813, enthält #602/#595). Bestehendes Paket WP-I7, kein neues Paket. `PLANER_AN` und `PLANER_AGGREGATE_AN` unverändert AUS; `PLANBEFUND_GRENZE` (40 Mio) und 372-Tage-Obergrenze unverändert; Variante C nicht gebaut; keine neuen Rechte; nur synthetische Daten.

## Stufe A — Verteilung: Nachtdienste je Person im Kalendermonat (Betreiberentscheidung 27.11.)

**Datenform (vorhanden):** Vorgabe `verteilungsregel` `{ groesse, maxAbweichung }`. Bewertet wird die Größe `nachtdienste` (Schreibweise ohne Groß/Klein und Rand-Leerraum; `VERTEILUNG_GROESSEN`, vorgabenwirkung.mjs). Andere Größen: „nicht bewertet“ (Verwaltung nennt den Grund). Weitere Größen (Wochenend-, Feiertagsdienste, Arbeitsstunden) = weiterer Schlüssel + Zählung in `engine/verteilung.mjs`; Gruppe, Baukasten und Rang bleiben.

**Definition (aus vorhandener Fachlogik):**
- *Nachtdienst*: Tag des Monats, an dem `personTag` einen Dienst mit `nachtAnteil ≥ nachtschwelle` nennt (wie `kennzahlen.verteilung`, Nachtblöcke des Planers). Gezählt wird der ganze Plan: Bestand, Schichtfolge, **angeheftete** und eigene Einteilungen.
- *maxAbweichung*: größte zulässige **Spannweite** (höchster − niedrigster Wert der Gruppe) — die Rechnung des Regelbaukastens (`verteilungsregel`), nicht nachgebaut. Abweichung je Person = Wert − niedrigster Wert; Überschreitung = max(0, Spannweite − maxAbweichung).
- *Vergleichsgruppe je Vorgabe*: Geltung (Betrieb/Einheit/Gruppe/Personen, Gültigkeit, Ausnahmen; dieselbe Stelle `giltFuer` wie die Wirkung je Einteilung) an **jedem** Tag, im Schichtdienst (nicht gesperrt), ganzer Monat beschäftigt, an jedem Tag nachtdienstfähig (für mindestens eine Nachtdienstart kein harter Befund aus `schutzBefundeFuer`, keine Einschränkung „keine Nacht“).
- *Wert*: n · T/(T − U) mit U = Urlaubs-/Krankheitstage (Entscheidung 26.11., `VORGABEN_ZAEHLUNG_OHNE`: aus Zähler und Grundlage herausgenommen). Teilzeit **nur** bei `ausnahmen.teilzeitAnteilig === true`: Wert / `teilzeitQuote`; sonst nicht umgerechnet.
- *Rundung*: keine fachliche; 6 Stellen gegen Gleitkomma-Rauschen, Vergleich mit 1e-9 wie der Baukasten.
- *Rang „Verteilung“*: Summe der Überschreitungen der Muss/Soll-Verteilungsvorgaben (eine Einheit: Nachtdienste). Bewertet nur, wenn mindestens eine Vorgabe erfüllt/verletzt ist und keine offen/nicht bewertet; sonst `null` (in `nichtBewertet`, nie „erfüllt“). Stärke Muss/Soll hebt die Verteilung NICHT in den Rang Muss/Soll; Wunsch-Stärke gehört zum Rang Wunsch (nicht bewertet).

**Annahmen (konservativ, keine verbindliche Vorgabe verändert):**
1. Nicht bewertbar (Wert unbekannt, Vorgabe dann höchstens „verletzt“ durch die bekannten Werte, Rang null): Geltung nur an einem Teil des Monats oder nicht entscheidbar, Eintritt/Austritt im Monat (keine erfundene Anteilsrechnung), nur an einem Teil der Tage nachtdienstfähig, Abwesenheit anderer Art als Urlaub/Krankheit, Teilzeitquote nicht bestimmbar.
2. Außerhalb der Gruppe (sichtbar unter `ausserhalb` mit Kennung des Grunds, ohne Schutzmerkmal): an keinem Tag nachtdienstfähig, nicht im Schichtdienst/gesperrt, ganzer Monat Urlaub/Krankheit.
3. Weniger als zwei Personen: „nicht anwendbar“ (Baukasten), zählt nicht als erfüllt.
4. Keine Gewichtung mehrerer Vorgaben außer der Summe in derselben Einheit.

**Planer:** Vorbereitung einmal je Aufruf, Aufwand vorab angemeldet (`verteilungAufwand`; reicht er nicht: „nicht bewertet“, Grund `aufwand`). Ergebnis `verteilung` = `{ bewertet, summe, ausgeglichen, regeln: [{ vorgabeId, staerke, groesse, maxAbweichung, status, grund?, spannweite, ueberschreitung, personen: [{ personId, nachtdienste, wert, abweichung }], nichtBewertbar, ausserhalb }] }`. Schritt 4 „Ausgleichen“ (nur bei bewerteter, überschrittener Verteilung, höchstens `zuege` Versuche): eine **eigene** Nachteinteilung einer Person mit dem höchsten Wert geht an eine Person mit niedrigem Wert (derselbe Tag/Dienst), nur mit derselben Einsetzbarkeitsprüfung (Anheften, Befunde ab Achtung, Vorwärts/Planbefunde, Höchstzahl), ohne Soll- oder offenen Vorgabenbefund bei der neuen Person, ohne Verdrängung, Besetzung nicht schlechter, Summe strikt kleiner; übernommen nur, wenn die Nachprüfung besteht und der Rang in der ganzen Rangfolge besser ist. Bestand und Angeheftetes ändern sich nie. Ohne Verteilungsvorgabe: Aufwand und Ergebnis wie vorher (`verteilung: null`).

## Stufe B — „Fest eingeplant“ für Beschäftigte (Betreiberentscheidung 27.11.)

`sicht.mjs` `festEingeplantEigene`: nur `{ "<ich>|<Tag>": true }` für aktive Anheftungen **eigener**, in der Sicht stehender Einteilungen (verborgene Entwurfseinteilung: kein Hinweis; unlesbare Karte: keiner); kein Wann/Wer, keine fremden, kein Protokoll; die Karte bleibt WEG. Nie gespeichert: Voll-PUT (`abgeleiteteEntfernen`), Teilweg (`NUR_SERVER`). BR/SV/Planung/Leitung unverändert. Anzeige: Pille „Fest eingeplant (Änderung nur durch Leitung/Planung)“ in „Meine Schichten“ (eine Import- und eine Anzeigezeile; Helfer in `anheftungen.jsx`). RECHTEMATRIX: neue Zeile „Anheftungen“ + Fußnote ³² (Review #602 vermerkte die fehlende Zeile), geprüft in `rechtematrix-zeilen.test.js`.

**Pins:** `meineschichten.jsx` 257 → 259, `anheftungen.jsx` 46 → 51, `monatsplan.jsx` 218 unverändert, `einstellungen.jsx` 377 unverändert; keine Inline-Stile, keine Form-/Farbliterale neu.

## Stufe C — Review #602 C

Unlesbare Karte mit gültigem Eintrag (`a1|…12-01` gültig, anderer kaputt): ändert eine Anfrage diese Einteilung, wird der gültige Eintrag trotzdem als aufgehoben vermerkt (Wann/Rolle, Modulprotokoll); unlesbare Einträge bleiben unverändert, die Karte bleibt unlesbar (Planer `ungueltig`, SV gesperrt). Die Reparatur mit altem Stempel heftet den Tag nicht wieder an. Ohne Änderung der Einteilung bleibt die Karte byte-gleich.

## Tests, Mutationen, Prüfungen (Teil 7)

**Neue/geänderte Tests:** `pruefungen/intelligence-verteilung.test.js` (neu, 13 Tests: Definition, Grenze maxAbweichung, nicht bewertbar nie erfüllt, Aufwand, Teilzeit nur mit Flag, Urlaub/Krankheit, Vergleichsgruppe, Ausgleichen mit Rangschutz/Bestand/Angeheftetem/Soll-Vorrang, **Zufallsvergleich gegen naive Referenz** — 10 feste Startwerte, feste Obergrenzen, Zählung über `personTag`, Faktor Urlaub und Teilzeit nur mit Flag, Angeheftetes unverändert, Nachprüfung frisch —, Demobetrieb); `intelligence-anheften.test.js` (+2: Review #602 C, „Fest eingeplant“ inkl. Entwurf, unlesbare Karte, Direkt-PUT, Teilweg, Text); `rechtematrix-zeilen.test.js` (Zeile „Anheftungen“ je Spalte); V4-3b-Pins (Zeilen 6608 → 6613).

**Mutationen** (`i7c-mutiere.mjs`, Arbeitsablage; nacheinander, ein Prozess, je Lauf zurückgesetzt, Quelle byte-gleich, `git diff` sauber): M1 Teilzeit immer anteilig 2 rot · M2 Urlaub/Krankheit nicht herausgenommen 2 · M3 andere Abwesenheit als bekannt 2 · M4 Eintritt ignoriert 1 · M5 verletzt mit Unbekannten als bewertet 2 · M6 nicht bewertete Vorgabe still übergangen 1 · M7 Ausgleich ohne Soll-Schutz und Rangvergleich 1 · M8 Ausgleich ohne Einsetzbarkeit 1 · M9 Rang nie bewertet 5 · M10 Geltung teilweise ignoriert 1 · M11 keine Nacht möglich in der Gruppe 1 · M12 Überschreitung ohne maxAbweichung 3 · M13 Hinweis für fremde Anheftungen 1 · M14 Hinweis verrät Entwurf 1 · M15 Kennzeichen nicht aus dem Voll-PUT entfernt — **überlebt, gleichwertig**: der Schreibweg übernimmt ohnehin nur Katalogfelder, das Entfernen in `abgeleiteteEntfernen` ist die zweite Sicherung (wie `sichtIstDaten`) · M16 Review #602 C zurückgenommen 1 · M17 Teilweg ohne Nur-Server-Eintrag 1 · M18 Beschäftigte bekommen die Karte 3. **17/18 erkannt, 1 gleichwertig.**

**Läufe (lokal, TZ=UTC, `--maxWorkers=1`, ein Prozess, freier Speicher vor jedem Lauf geprüft):** Intelligence/Engine-Gruppe (alle `intelligence-*`, `engine-*`, `schutzregeln-ersatzsuche`, `konsistenz`, `warnen`) 62 Dateien 1 785/1 785; alle übrigen Testdateien, die eine berührte Datei importieren oder lesen (`rechte`, `sicht`, `teilweg`, `vorgabenwirkung`, `planer`, `anheften`, `meineschichten`, `anheftungen`, RECHTEMATRIX, SSOT) samt `sicht*`, `rechtematrix*`, `wp48-*`, `v4-3b-*`, Wachen und Inventaren in drei Gruppen (158 Dateien): grün bis auf (a) V4-3b-Zeilenpin (nachgeführt, danach grün), (b) `accountanmeldung` „überholter Schreibvorgang“ (Zeitfenster-Test unter Last; allein wiederholt grün), (c) `release-pruefung` „keine unbekannte Vorlage“ meldet `node_modules (Mode 120000)` — Artefakt des Arbeitsbaums (node_modules als Verzeichnisverbindung), keine Dateiänderung dieses PR; in CI mit echtem node_modules. Nach dem Merge von `integration/release-v4` (ca0bb39e) Wachen/Inventare/Release-Tests/V4-3b erneut: 515/516 (nur c). `npx tsc -p jsconfig.json` grün; `eslint` auf alle geänderten Dateien ohne Befund. Keine Workflow-Änderung. Vollregression in CI.

## SSOT (Teil 7)

WP-I7-Eintrag in `docs/acc45/work-packages.json` (Notiz „Teil 7“, Testliste + `intelligence-verteilung.test.js`), `STATUS.md` neu geschrieben, `acc45-backlog pruefen` OK; Status unverändert `IN_PROGRESS`.

## Offene Fachfragen (Teil 7, kurz)

1. Abwesenheit anderer Art (Schulung, Freistellung …): derzeit nicht bewertbar — wie Urlaub/Krankheit herausnehmen?
2. Eintritt/Austritt im Monat: derzeit nicht bewertbar — anteilig nach Beschäftigungstagen?
3. Weitere Größen (Wochenend-, Feiertagsdienste, Arbeitsstunden): Schlüssel und Reihenfolge.
4. Anzeige der Verteilungsergebnisse mit der Planer-Oberfläche (eigene Datei).
5. „Fest eingeplant“ auch in der Telefonansicht (bisher „Meine Schichten“)?

## Review #605 (Kopf c0e930cc, Freigabe) — Nachzug C-1, C-2, C-3, D-1

- **C-2 (Datenintegrität, behoben):** Im Zweig „unlesbar, ohne Reparatur“ setzte `aus[s] = x` auf ein Objektliteral; ein Schlüssel `"__proto__"` aus beschädigter Ablage ging still verloren und die Karte wurde lesbar. Jetzt überall eigene Eigenschaften (`Object.defineProperty`): Karte (`anheften.mjs`, alle Einträge), Kennzeichen (`sicht.mjs`), Verteilungswerte (`engine/verteilung.mjs`; Personenkennung `"__proto__"`). Geprüft: Leitung und Planung behalten den kaputten Eintrag (auch nach JSON-Rundweg), Karte bleibt unlesbar, gültiger Eintrag als aufgehoben vermerkt; SV bei unlesbarer Karte abgewiesen; Beschäftigte ohne Kennzeichen. Die Stelle in `sicht.mjs` ist gleichwertig gesichert (Schlüssel dort sind immer gültige „Person|Tag“-Schlüssel), daher ohne eigene Mutation. Übrige Stellen: `altK` per `Object.fromEntries`, Kopien per Spread (beide legen eigene Eigenschaften an); Zähler als `Map`.
- **C-1 (Testlücke, geschlossen):** neue Tests „angeheftetes frei der Zielperson bleibt“ (p3 an 20 Tagen angeheftet frei; Ausgleich weicht auf die übrigen Tage aus), „Besetzung (Qualifikation) bleibt“, Soll-Schutz findet die andere Person. Mutationen des Reviewers (`i7c-mutiere2.mjs`): **R4** Anheften-Ausschluss der Zugwahl weg — erkannt · **R5** Nachprüfung bei der Übernahme weg — überlebt, **doppelt gesichert**: jede Bedingung der Nachprüfung (Anheften, Befunde, Vorwärts, Verdrängung) prüft schon die Zugwahl; der Nachprüfungsweg selbst ist direkt getestet (`nachpruefen`, intelligence-anheften Abschnitt 2) · **R4+R5** zusammen — erkannt (2 rot) · **R11** Soll-Schutz weg — erkannt · **R12** Verdrängungsprüfung im Ausgleich weg — überlebt, **doppelt gesichert** durch die Nachprüfung (Verdrängung gegen den Bestand an jedem Tag mit eigener Einteilung; Planer-Kern Abschnitt 8) · **R13** Besetzungsschutz weg — erkannt · **R17** = M15 (oben, gleichwertig). Neu C2a/C2b (Zuweisung statt eigener Eigenschaft) und C3 (kein sichtbarer Grund) — erkannt.
- **C-3 (umgesetzt):** Eine Vorgabe, die nicht in den Rang eingeht, trägt einen sichtbaren Grund: `geltung_teilweise` mit Hinweis „Verteilung nicht bewertbar: Geltung nur teilweise im Monat (Ausnahmezeitraum oder Gültigkeit im Monat).“, wenn jede Person nur teilweise gilt; sonst `personen_nicht_bewertbar`. Die Verwaltung nennt es bei gesetztem Ausnahmezeitraum oder Gültigkeit im Text der Planwirkung.
- **D-1:** vorgemerkt (Hinweis aus Review #605, nicht in diesem Schritt).

**Empfehlungen zu den Fachfragen (nicht gebaut):** Eintritt/Austritt im Monat anteilig als n · T/(B − U) (B = Beschäftigungstage), erst ab mindestens 7 Beschäftigungstagen; Abwesenheiten „Fortbildung“, „Freistellung“, „Sonderurlaub“ über eine feste Liste wie Urlaub/Krankheit herausnehmen; weitere Größen in der Reihenfolge Wochenenddienste → Feiertagsdienste → Arbeitsstunden. „Fest eingeplant“ in der Telefonansicht (`mobil.jsx`, gleicher Helfer und Text) mit der Planer-Oberfläche, nicht in diesem PR.

## Planer-Oberfläche, Stufe 1 (Betreiberentscheidung 27.11.: Bedienbarkeit vor weiteren Server-Teilen; Branch `intelligence/planer-oberflaeche-1`)

Gehört zu WP-I7 Teil 6 (offene Frage 4 oben), kein neues Paket. **Nur Oberfläche** für Leitung/Planung; keine neue Server- oder Rechtelogik, kein neuer Endpunkt (Lesen und Schreiben gehen über den vorhandenen `PUT`/`GET /api/bestand`). `PLANER_AN` und `PLANER_AGGREGATE_AN` bleiben AUS, nichts aktiviert. Nicht in dieser Stufe: Planvorschlag-Übernahme, Verteilung/Ergebnisanzeige (nach Review #605), „Fest eingeplant“ (#605).

**Gebaut:**
- `src/ansichten/planer-steuerung.jsx` (neu, Einhängezeile in `einstellungen.jsx`): Schalter „Planer für diesen Betrieb“ (`kiSteuerung.planerSchalter`) und Betriebsmodus AUS / Auf Knopfdruck / Automatisch (`kiSteuerung.planerModus`). Leitung schaltet, Planung liest, alle anderen sehen nichts, Demo liest nur. **Ehrlich:** gezeigt wird der WIRKSAME Zustand (`planerModusWirksam`, dieselbe Funktion wie der Server). Solange der Planer global nicht freigegeben ist, steht „Wirksam jetzt: AUS“ und „Der Planer ist global nicht freigegeben (AUS)“; Schalter und Modus sind dann nur „vorgemerkt“. Die Voraussetzungen stehen einzeln da (je „erfüllt“/„fehlt“, auch als Text): globale Freigabe, Pause (Betriebsrat oder Leitung), Hauptschalter, Frage nach Betriebsrat/Personalrat/Mitarbeitervertretung (bei „ja“ erst nach aufgehobener Pause), Schalter des Planers, Betriebsmodus, Planungsreife des laufenden Monats (`reifeFuerMonat`, vorhanden). Unlesbare Steuerung, unlesbarer Schalter oder Modus: Warnung (`role="alert"`), es gilt AUS. Nie „erfüllt“, wenn der Server (`kiPlanerEntscheidung`, `planerModusWirksam`) es anders sieht (Test über alle Fälle).
- `src/ansichten/anheftungen.jsx` (erweitert; Einhängezeile in `monatsplan.jsx` nur um die Eigenschaften `sitz`/`akt` ergänzt, Zeilenzahl 218 unverändert): zu der vorhandenen Lese-Anzeige kommen „Lösen“ je angehefteter Einteilung, „Erneut anheften“ bei „nicht mehr angeheftet — manuell geändert am …“ und ein Formular „Einteilung anheften“ (Person, Tag des Monats). Die Einteilung wird als eigene Einteilung (`abweichungen`) eingetragen, wenn sie noch aus der Schichtfolge kommt; Abwesenheit ohne eigenen Eintrag und Personen außerhalb ihres Dienstverhältnisses sind nicht anheftbar (Grund steht da). Ohne Recht (SV, Beschäftigte, Betriebsrat, Demo) kein Knopf. Unlesbare Karte: Warnung, Anheften und Lösen werden nicht angeboten und nie geschrieben.
- `src/lib/planer-oberflaeche.js` (rein: Rechte, Zustand, Einteilung/Karte), `src/lib/planer-aktionen.js` (Aktionen). **Rechte** nach den Tabellen des Servers (`KI_RECHTE`, `darfAnheften`), Rolle des Zugangs vor der Rolle der Person (`sitz` trägt `rolle: "kunde"`; die Altrolle „kunde“ schaltet nichts, wie am Server), keine rohen Rollenstrings in den Ansichten.
- **Bestätigung wie #596:** sofort schreiben, Serverstand mit `liesZumVergleich` zurücklesen (rückt den ETag nie vor). „Geändert“/„angeheftet“/„gelöst“ steht nur, wenn der Serverstand es zeigt. Sonst sichtbarer Fehler (`role="alert"`): Server lehnt ab (mit Grund), Konflikt (409), Lesen fehlgeschlagen, Server ohne Rückmeldung nach 45 s, Recht fehlt („nicht übernommen“). Die lokale Anzeige geht auf den Serverstand bzw. den Stand davor zurück (nur die betroffene Einteilung und die Karte, nie der übrige lokale Stand). `kiAbsichtAnwenden`/`kiSteuerungBestaetigt` (`ki-steuerung-aktionen.js`) kannten `planerModus`/`planerSchalter` nicht: Ohne Ergänzung hätte die Bestätigung diese Teile als „ok“ durchgelassen (je 1 Zeile).
- **Fund beim Testen:** Das Lösen wäre für Rollen ohne Karte in der Sicht (Beschäftigte, SV) fälschlich „bestätigt“ gewesen (leere Karte = nichts angeheftet). Die Bestätigung verlangt jetzt, dass der Serverstand die Karte trägt (Test, Mutation M8).
- **Gründeanzeige #593 (`assistentGruende.js`):** in dieser Stufe nicht berührt — sie erklärt offene Stellen eines Planungsergebnisses; die Gründe hier sind Voraussetzungen des Betriebs. Die Ergebnisanzeige (nach #605) nutzt `offenText` weiter.

**Pins (V4-3b), gemessen vorher → nachher, jede Änderung zwingend durch Datei bzw. Zeilen:** `monatsplan.jsx` 218 → 218 (Eigenschaften in vorhandener Zeile); `einstellungen.jsx` 377 → 379 (Import + Einhängezeile); `ki-steuerung.jsx` 154 → 154, `src/pruefung.jsx` 7755 → 7755 (unberührt). Querschnitt/Bausteine (`v4-3b-querschnitt-1/-2`): Dateien 35 → 36, sichtbar 26 → 27, Zeilen 6608 → 6783 (+88 `anheftungen.jsx` inkl. 5 aus Teil 7 und 5 aus dem Zielgröße-Fix, +92 `planer-steuerung.jsx`), farbrein 21 → 22, formErreicht 23 → 24, `[overlayDirekt, ueberBaustein, tokenDirekt]` [10,7,6] → [10,8,6], voll 15 → 16, ohne V4 `[formErreicht, sichtbar]` [148,161] → [149,162], `NEU_SEIT_BASIS` +`planer-steuerung.jsx`; `v4-3b-selbsttest`: `[18,13,148,130,161]` → `[18,13,149,131,162]`, „Querschnitt/Bausteine 23/26“ → „24/27“. Unverändert: Inline-Stile 452 (keine neuen), Form-/Farbliterale, Radienstufen. Die neue Datei hat 0 Form-/Farbliterale und 0 Inline-Stile (Test).

**Tests (`pruefungen/intelligence-planer-oberflaeche.test.js`, 49):** Rechte je Rolle/Demo/Zugangsrolle; wirksamer Zustand (global AUS bei vollständig gesetztem Betrieb; Freigabe nur als Projektion der Prüfung; 10 Ausfälle je Grund mit Übereinstimmung zu `kiPlanerEntscheidung`; Planungsreife); echte Ansichten und Aktionen gegen den echten Handler (Muster `intelligence-steuerung-leitungpause-aufheben`): Planer-Schalter und Modus (Leitung bestätigt; Planung/SV/Beschäftigte/Betriebsrat „nicht übernommen“, Server unverändert; Konflikt 409; Lesefehler; Speicherweg ohne Rückmeldung; Absage mit Grund), Anheften durch Planung, Eintrag „frei“, Lösen, manuelle Änderung hebt NUR diese Anheftung auf und die Ansicht sagt es, erneut anheften, SV/Beschäftigte/Betriebsrat wirkungslos und sichtbar abgewiesen, unlesbare Karte; Quelltext ohne Garantiesprache, Rohrollen, Inline-Stile.
**Mutationen** (`ui2-mutiere.mjs`, Arbeitsablage; je Lauf zurückgesetzt, `git status` danach nur die gewollten Dateien): M1 Erfolg ohne Serverstand · M2 Anheften immer bestätigt · M3 Schalter wirksam trotz global AUS · M4 Rechte-Gating weg · M5 SV sieht Anheften · M6 Speicherfehler als Erfolg · M7 unlesbare Karte ohne Warnung · M8 Lösen ohne Karte bestätigt · M9 Demo nicht ausgeschlossen · M10 Rolle der Person vor Zugangsrolle · M11 Konflikt als Erfolg · M12 unlesbare Karte als leer geschrieben · M13 Vermerk „nicht mehr angeheftet“ fehlt · M14 Planungsreife immer erfüllt · M15/M16 Modus-/Schalter-Bestätigung fehlt · M17 Lesefehler als bestätigt · M18 Bedienelemente ohne Recht: **18/18 rot**.
**Läufe (lokal, TZ=UTC, `--maxWorkers=1`, ein Prozess):** vorher 16 Dateien/194 Tests (V4-3b-*, v4-3c, v4-inventar) grün; nachher 69 Dateien, 68 Dateien/2 275 Tests grün (`v4-*`, `intelligence-steuerung*`, `-anheften`, `-assistent-gruende`, `-planer*`, `rechtematrix*`, `wp48-*`, `imp6-planwirkung/-verdrahtung`, `wcag-wp40`, `geraete-wp21*`, `oberflaeche-render`, `wp39-app-aufbau`, `sicherung-anlegen-ui`, `intelligence-vorgaben-oberflaeche`, `darstellung-wp35`, `prozess-wachen`, `ci-abdeckung`, `intelligence-planungsreife-anzeige`, `demo-rollenwaehler`, `routen-inventar`). Die eine nicht grüne Datei, `v4-visuell-qa.test.js`, bricht schon beim Laden ab (`@playwright/test` lässt sich im lokalen Arbeitsbaum nicht laden); nicht Teil dieser Änderung, Lauf in CI. `tsc -p jsconfig.json` grün, `eslint` auf den geänderten Dateien ohne Befund, `verdrahtung-pruefen` ok, `ci-abdeckung` ok.

**Browser-/E2E-Abnahme (nicht lokal gestartet):** Einstellungen (Leitung: Abschnitt „Planer“, Schalter und Modus, Gründe; Planung: nur lesen), Monatsplan (Anheften/Lösen/Erneut anheften auf Telefon, Tablet und Desktop, Tastatur, Fokus, Bildschirmleser: Zustandstexte, Warnungen), Dunkelmodus/Kontrast der neuen Texte.

**Offene Fragen:** (1) Soll die Leiste „Angeheftete Einteilungen“ für Leitung/Planung im Monatsplan immer sichtbar sein (jetzt ja, mit eingeklapptem Formular) oder erst auf Wunsch? (2) Soll die Leitung eine unlesbare Karte in der Oberfläche zurücksetzen können (Server erlaubt die Reparatur; hier bewusst nicht gebaut)? (3) „Erneut anheften“ nach manueller Änderung heftet den aktuellen Wert an — gewollt?

**Review #606 (C-1, C-4) und Basis #607:** Basis `origin/integration/release-v4` (#607, `f429e909`) eingemerged (keine Konflikte; `status-schreiben` und `pruefen` ok; `src/pruefung.jsx` 7755, `einstellungen.jsx` 379, `monatsplan.jsx` 218 unverändert gemessen). C-1: Ist der Planer wirksam, die Planungsreife des Monats aber nicht erfüllt, zeigt die Pille „eingeschränkt: Planungsreife fehlt“ (auch in der Zeile „Wirksam jetzt“), nicht „Auf Knopfdruck“. C-4: „vorgemerkt“ steht nur, solange der Planer nicht wirksam ist (Schalter und Modus); „Erneut anheften: <Wert>“ nennt auf dem Knopf (und im Namen) die Einteilung, die angeheftet würde (Dienstname oder „frei“), ohne anheftbaren Wert kein Knopf. Pin nachgemessen: Querschnitt Zeilen 6769 → 6773 (`anheftungen.jsx` 116 → 119, `planer-steuerung.jsx` 91 → 92); übrige Pins unverändert. Tests: +2 (C-1, C-4), Knopfsuche im Erneut-Test auf den Wert angepasst.

**CI #606, axe `target-size` (Flächen `plan-planer`, `plan-leitung`, alle Viewports):** Ursache war das Aufklappelement „Einteilung anheften“ (`details`/`summary`, Zeilenhöhe unter 24 px) — auf diesen Flächen das einzige sichtbare Bedienelement der neuen Leiste; Schalter und Knöpfe der Einstellungen waren nicht betroffen (`einstellungen-leitung` grün). Behoben: Knopf `Btn` (`btn-sm`, Mindesthöhe 34 px, `aria-expanded`/`aria-controls`) „Neue Einteilung anheften“ öffnet das Formular; alle Bedienelemente beider Ansichten sind Bausteine (`Btn`, `Sel` mit 40 px). Test: Quelltext ohne rohe kleine Bedienelemente, Mindesthöhen `.btn-sm`/`.sel`/`.btn` in App.jsx/app-stil.js, leere Leiste hat genau einen `btn`-Knopf. Pin Querschnitt-Zeilen 6778 → 6783 (+5 `anheftungen.jsx`); Inline-Stile unverändert 452. Playwright lokal nicht gelaufen, CI entscheidet.

## Nachtrag 2026-11-28 (#609) — „Fest eingeplant“ in der Telefonansicht

- `src/ansichten/mobil.jsx` nutzt die vorhandene Ableitung aus #605 (Server `festEingeplantEigene`, Objektform; Oberfläche `festEingeplant`/`FEST_EINGEPLANT_TEXT` aus `anheftungen.jsx`): Hinweis als sichtbare Pille an „Dein Dienst heute“, in Mein Plan (Liste, Tagblatt) und im zugänglichen Namen des Monatsfelds — nur an eigenen Tagen mit Dienst, keine Aktion. Keine Serveränderung.
- `pruefungen/fest-eingeplant.test.js` (11; Review B-1: eigener Abwesenheitstag mit Kennzeichen ohne Hinweis, Fremdkennzeichen am eigenen Diensttag in „Heute“ ohne Hinweis, Monatsfeld-Name und Tagblatt tatsächlich gerendert — die Mutationen „`da &&` entfernt“, „Personenprüfung entfernt“, „Zusatz im Namen entfernt“ je rot): Objektform ohne Metadaten, Entwurf, Mandantentrennung, BR/SV mit Karte = ohne Karte, **Wache C-2** (mitgeschicktes oder gespeichertes `festEingeplant` wird über Leitung/Kunde/Beschäftigte nie gespeichert; Mutation „Feld aus `abgeleiteteEntfernen` entfernt“ macht nur diesen Test rot), Telefonansicht (nur eigene Diensttage, sichtbarer Text).
- V4-3b-Telefonschale: Rückrechnung nimmt den Nachtrag wörtlich zurück (`NACHTRAG_FEST`), danach byte-gleich zur Basis.

## Planer-Oberfläche, Stufe 2 (nur lesen; Branch `intelligence/planer-oberflaeche-2`)

Bestehende Betreiberpriorität „Nutzerabläufe/Bedienbarkeit nach den Planer-Arbeiten“; kein neues Paket.

**Bestandsaufnahme (was die Oberfläche heute bekommt):**
- Der Planer (`engine/planer.mjs`: `planeVorschlag`, `planerEinstieg`) ist über keinen Handler und keine Ansicht erreichbar (`PLANER_AN = false`, `PLANER_AGGREGATE_AN = false`). Die API liefert **keinen** Planvorschlag, keine Zusammenfassung und keine Verteilung; es gibt dafür auch kein Antwortfeld. Die Anzeige eines Planvorschlags (Zusammenfassung, offene Stellen mit `lueckenursache`) ist deshalb in dieser Stufe nicht gebaut und bleibt dem Stück der kontrollierten Planvorschlag-Übernahme vorbehalten.
- Was die Oberfläche selbst ableiten kann: `src/` importiert die reinen Engine-Module (wie `planer-oberflaeche.js` für `planerModusWirksam`). Die Verteilung des **vorhandenen** Plans (`verteilungAufwand`/`verteilungVorbereiten`/`nachtZaehlen`/`verteilungBewerten`, `engine/verteilung.mjs`) braucht nur den Betrieb `m` mit Vorgaben, Abweichungen, Schichtfolge — alles, was Leitung und Planung ohnehin bekommen. Beschäftigte, Schichtverantwortung und Betriebsrat sehen die Fläche nicht (Rechte wie `planerRechte().sehen`).
- Gründe: die Klartexte der Kennungen (`VERTEILUNG_GRUENDE`, Gründe je Vorgabe) gab es nur als Kennung; `assistentGruende.js` erklärt offene Stellen eines Planungsergebnisses und ist hier nicht einschlägig. Neu sind nur die Texte (eine Quelle, gegen den Quelltext der Engine abgeglichen), keine zweite Rechenlogik.

**Gebaut (kein neues Serverfeld, keine Schreibaktion):**
- `src/lib/planer-oberflaeche.js`: `hatVerteilungsvorgabe`, `verteilungErgebnis(m, ym)` (ruft die Engine; Aufwand über `VORGABEN_WIRKUNG_GRENZE.aufwand` ⇒ Engine-Grund `aufwand`; wirft nie, sonst `{ ok: false }`), `verteilungAnzeige(bewertung, m)` (Zustand je Vorgabe: **erfüllt** nur bei Status `erfuellt`, **nicht erfüllt** nur bei `verletzt` ohne `grund` (alle Werte bekannt), alles andere — offen, nicht bewertet, nicht anwendbar, unbekannter Status — **nicht bewertbar**), Texte `VERTEILUNG_VORGABE_GRUND`/`VERTEILUNG_PERSON_GRUND`, unbekannter Grund: „Grund nicht bewertbar“. Teilzeit nur bei `ausnahmen.teilzeitAnteilig === true` (Wert aus der Engine; die Ansicht nennt, ob anteilig umgerechnet wird).
- `src/ansichten/planer-steuerung.jsx`: `PlanerVerteilung` (Fläche mit Knopf „Verteilung anzeigen“, `aria-expanded`; gerechnet wird erst nach dem Öffnen) und `PlanerVerteilungAnsicht`; im Monatsplan eingehängt (`monatsplan.jsx`, 2 Zeilen: Import, Einhängezeile). Ohne aktive Verteilungsvorgabe erscheint nichts. Zustände stehen als Wort (Pille mit Text), Zusammenfassung „n erfüllt · n nicht erfüllt · n nicht bewertbar (insgesamt nicht bewertet)“, je Person Nachtdienste, Vergleichswert (Urlaub/Krankheit herausgerechnet), Abstand zum niedrigsten; „Nicht bewertbar“ und „Nicht in der Vergleichsgruppe“ je Person mit Grund. Nur `Card`, `Btn size="sm"`, `Pill`, `Lab`; keine Inline-Stile, keine rohen Bedienelemente.

**Tests** (`pruefungen/intelligence-planer-verteilung-anzeige.test.js`, 22; über `pruefung:intelligence` verdrahtet): Zustände mit der Engine verglichen, unbekannte Person (auch bei schon verletzenden Werten) nie „erfüllt“/„nicht erfüllt“, Teilzeit nur mit Flag, außerhalb der Gruppe, Aufwand/Wunsch/nicht anwendbar/unbekannter Status, fail closed, Betrieb unverändert, jede Kennung hat einen Text, Rechte je Rolle (Leitung, Planung ja; Schichtverantwortung, Beschäftigte, Betriebsrat, Betreiber, Altrolle „kunde“, ohne Sitz nein), Ansichtstexte, Quelltext (kein Schreibweg, keine Inline-Stile, keine rohen Bedienelemente), Schalter AUS.
**Mutationen** (selbst ausgeführt, je Lauf zurückgesetzt, alle rot): M1 `verletzt` mit unbekannter Person als „nicht erfüllt“ · M2 `offen` als „erfüllt“ · M3 Teilzeit immer anteilig · M4 Rechte-Gating der Fläche entfernt · M5 Text einer Personenkennung entfernt: **5/5 rot**.
**Pins (V4-3b):** `monatsplan.jsx` 218 → 220 (Import + Einhängezeile; nicht als Zeilenzahl gepinnt), `planer-steuerung.jsx` +64 Zeilen ⇒ Querschnitt-Zeilen 6783 → 6847 (`v4-3b-querschnitt-1/-2`); Inline-Stile 452 unverändert; `einstellungen.jsx` 379, `src/pruefung.jsx` 7755 unberührt.
**Browser/E2E (nicht lokal gestartet):** Monatsplan als Leitung/Planung mit aktiver Verteilungsvorgabe: Knopf, Öffnen, Zustandstexte, Dunkelmodus/Kontrast der Pillen, Tastatur, Telefon; CI-axe `plan-planer`/`plan-leitung` (die Demo-Betriebe haben keine Verteilungsvorgabe, die Fläche erscheint dort nicht).
**Offen / bewusst nicht gebaut:** Planvorschlag-Zusammenfassung und offene Stellen mit Ursache (kein Server-Weg); Verteilung des **Vorschlags** (das Feld `verteilung` des Planers hat dieselbe Form, `verteilungAnzeige` nimmt es unverändert); Wochenend-/Feiertags-/Stundenverteilung (Engine kennt nur Nachtdienste); Wahl eines anderen Monats außer dem im Monatsplan gezeigten.

**Hinweis zur Nacht der abgebenden Person:** Beim Entfernen der Nacht der abgebenden Person prüft der Code nur die eigenen Einteilungen nach; neu bewerten, sobald eine Planart „mindestens“ im Plan wirkt.

## Planvorschlag-Übernahme, Kern (Stufe 1) — Branch `intelligence/planer-uebernahme`

Reine Übernahme-Logik `server/lib/engine/planer-uebernahme.mjs` (Prüfung `pruefungen/intelligence-planer-uebernahme.test.js`, über `pruefung:intelligence` verdrahtet). Keine Route, keine Oberfläche, kein Schreiben; `PLANER_AN` und `PLANER_AGGREGATE_AN` bleiben AUS; Budgets unverändert.

Funktionen: `vorschlagBasis(m, ym)` (Fingerprint), `uebernahmePruefen` / `uebernahmeAnwenden` (Vorschlag + Auswahl je Einteilung), `rueckgaengigPruefen` / `rueckgaengigAnwenden`, `patchAnwenden` (Hilfe für Prüfung und späteren Schreibweg). Rein, deterministisch (Zeit nur aus `kontext.jetzt`, Regeln mit `mitTagesdatum`), Eingaben unverändert, wirft nie (`{ ok: false, grund }`).

Entscheidungen dieser Stufe:
- **Rechte:** nur Leitung und Planung mit `plan.edit.all` (`darf` aus rechte.mjs), nie Demo; Schichtverantwortung, Betriebsrat, Beschäftigte, Altrolle „kunde“, Betreiber nie (Muster `darfAnheften`). Gleiche Prüfung für Rückgängig.
- **Keine Auto-Übernahme:** Anwenden verlangt `kontext.bestaetigt === true`, auch im Modus „automatisch“ (`bestaetigung-fehlt`). Prüfen (Vorschau) braucht die Bestätigung nicht.
- **Planer-Freigabe:** dieselben Funktionen wie `planerEinstieg` (`planerModusWirksam`, `kiPauseAktiv`, `kiSteuerungUnlesbar`, `kiPlanerEntscheidung`), aber ohne erneuten Planlauf (`planerEinstieg` selbst würde den ganzen Planer rechnen). Kennungen `planer-nicht-freigegeben`, `planer-pausiert`, `planer-im-betrieb-aus`. `kontext.freigabe: true` nur in Prüfungen.
- **Basis-Fingerprint:** SHA-256 über Monat ± 31 Tage (Abweichungen, Anheftungen, Abwesenheiten) und die Regelfelder (Personen, Dienste, Einheiten, Folge, Vorgaben, Qualifikationen, Einstellungen ohne Modulprotokoll inkl. Schalterstand). Wird beim Erzeugen als `vorschlag.basis` gespeichert; weicht er ab: `seit-vorschlag-geaendert`. Nach außen nur der Hash. Planfreigabe des Monats gehört nicht dazu (ändert nur den Mitteilungshinweis).
- **Je Eintrag auf dem echten Stand, atomar:** Dienst/Person vorhanden, Person im Betrieb, nicht abwesend, nicht angeheftet (unlesbare Karte: nichts), Zielschlüssel ohne Dienst („-“ gilt als frei, Vorwert bleibt „-“), Lücke besteht noch, keine Befunde ab Achtung und kein sperrender Befund (`hindernisBefunde`, Automatik: Muss ungeprüft = Achtung), danach `nachpruefen` über die ganze Auswahl (Posten/Bestandspersonen, Vorwärts, Planbefunde). Ein Fehler lehnt alles ab (`eintrag-abgelehnt`, Liste nur mit Index der Auswahl und Kennung, ohne Person|Tag).
- **Anwenden:** Patch nur der gewählten Schlüssel von `abweichungen` (nie Komplettüberschreiben, `angeheftet` unberührt — kein Weg über `anheftenZusammen`), `rueckgaengig` mit Vorwerten genau dieser Schlüssel, Protokoll `{ modul: "planer", art: "planer-uebernommen", am, von: Rolle, anzahl, zeitraum }` ohne Person|Tag/Namen, Änderungseinträge wie `uebernehmeVorschlag` (von „-“, nach, Vorlauf, Zeit de-DE, deterministische Kennung `c-pu-…`), Mitteilungen nur als Hinweis (`versandt: false`). Idempotenz: zweites Anwenden `bereits-uebernommen` bzw. `seit-vorschlag-geaendert`.
- **Rückgängig:** stellt nur die gespeicherten Vorwerte her (null = Schlüssel entfernen), nur wenn jeder Schlüssel noch den übernommenen Wert hat (`seit-uebernahme-geaendert`) und keiner inzwischen angeheftet ist (`angeheftet`); zweimal = `bereits-rueckgaengig`. Rückgängig ist nicht an Planer-Schalter/Pause gebunden (stellt nur Menschenstand her; Test C-4) — zur Review. Replay-Hinweis: die Rückgängig-Daten selbst sind nicht einmalig; erst ein zweites Anwenden nach erfolgreicher Rücknahme scheitert an `bereits-rueckgaengig` bzw. `seit-uebernahme-geaendert`. Einmalige Verwendung muss der Schreibweg sicherstellen (Datensatz nach Gebrauch entwerten).
- **Review #612 (B-1, B-2, C-1…C-4, C-7) behoben:** Rückwirkend nichts — Tage vor dem heutigen Betriebstag (`betriebstag(jetzt)`, Europe/Berlin; heute selbst nicht vergangen wie in planungsreife „vor heute“) → `vergangen`, abgeschlossener Monat (`monatAbgeschlossen`, monatsabschluss.mjs) → `monat-abgeschlossen`, beides auch beim Rückgängigmachen. Rohstand: vorhandener Wert außer „-“ (auch "" / null) → `schluessel-belegt`; Bestand mit `sichtEntwuerfe`/`sichtIstDaten` → `betrieb-ungueltig`. Rückgängig-Daten: Vorwert nur null oder „-“, Schlüssel `Person|JJJJ-MM-TT` mit Kennungsprüfung und Längengrenze. `demo` muss ein echtes Boolean `false` sein. `patchAnwenden` liefert `{ ok, mandant }`, prüft Schlüsselform und Werte, lehnt `__proto__`/`constructor`/`prototype` ab, wirft nie.
- Hinweis (Review C-5/C-6/D, nicht gebaut): die übrigen Anmerkungen der Review sind als Hinweis für den Verdrahtungsschritt vermerkt, kein eigenes Paket.

Offene Anschlüsse (brauchen Review, nicht erfunden):
- Verdrahtung = **eigene Server-Aktion** (nicht der allgemeine PUT `/api/bestand`-Weg über `zusammenfuehren`/`anheftenZusammen`): unter der Prozesssperre und mit ETag/Version (409 bei Abweichung) den gespeicherten Betrieb laden, `uebernahmeAnwenden` bzw. `rueckgaengigAnwenden` rechnen, nur `patchAnwenden` auf `abweichungen` legen und in EINEM Schreibvorgang atomar speichern: Patch + `aenderungen` + Protokolleintrag (Modulprotokoll, Grenze `modulprotokollUeberGrenze`) + Rückgängig-Datensatz. Vorschlag, `basis` und Rückgängig-Daten nur serverseitig erzeugen und aufbewahren (nie vom Client übernehmen); Rückgängig-Daten einmalig verwendbar. `kontext` serverseitig bauen: rohe `sitzung.rolle`, echtes Boolean `demo` aus der Sitzung, Serveruhr als `jetzt`, `freigabe` nie aus der Anfrage (nur `PLANER_AN`). Mitteilungen bleiben `versandt: false`, bis die Betreiberentscheidung vorliegt.
- Oberfläche (Häkchen je Einteilung, Bestätigung, Rückgängig-Knopf).
- **Betreiberentscheidung offen:** Aufbewahrung der Vorwerte für Rückgängig (wo, wie lange, Löschung im Datenschutzlauf).
- **Betreiberentscheidung offen:** Mitteilungen an Beschäftigte nach einer Übernahme in einem freigegebenen Monat (bisher `uebernehmeVorschlag`: Mitteilung „Zusätzlicher Dienst“).

Mutationen (von Hand, je Lauf der Prüfdatei; Ergebnis siehe Tabelle):

| Nr | Mutation | rote Tests |
|---|---|---|
| M1 | Rollenprüfung entfernt (`darfUebernehmen` immer wahr) | 1 |
| M2 | Demo-Ausschluss entfernt | 1 |
| M3 | Fingerprint-Vergleich entfernt | 2 |
| M4 | Anheft-Prüfung je Eintrag entfernt | 1 |
| M5 | Atomarität aufgeweicht (nur gültige Einträge übernehmen) | 1 |
| M6 | Patch = alle Abweichungen (Komplettüberschreiben) | 2 |
| M7 | Rückgängig ohne Änderungsprüfung | 1 |
| M8 | Bestätigungspflicht entfernt | 1 |
| M9 | Planer-Freigabe/Schalter/Pause entfernt | 2 |
| M10 | harte Regeln je Eintrag entfernt | 1 |
| M11 | Lückenprüfung entfernt | 1 |
| M12 | Nachprüfung (`nachpruefen`) ignoriert | 1 |
| M13 | Abwesenheitsprüfung entfernt | 1 |
| M14 | Person\|Tag-Schlüssel ins Protokoll | 1 |
| M15 | Freigabe nicht mehr „genau true“ | 1 |
| M16 | Abweichungen nicht im Fingerprint | 3 |
| M17 | B-1: `vergangen` je Eintrag entfernt | ≥ 1 |
| M18 | B-1: abgeschlossener Monat nicht gesperrt | 1 |
| M19 | B-1: `vergangen` beim Rückgängigmachen entfernt | 1 |
| M20 | B-2: Rohstand ("" / null) nicht als belegt | 1 |
| M21 | B-2: Sichten (`sichtEntwuerfe`/`sichtIstDaten`) zugelassen | 1 |
| M22 | C-1: beliebiger Vorwert in den Rückgängig-Daten | 1 |
| M23 | C-1: Schlüsselform der Rückgängig-Daten nicht geprüft | ≥ 1 |
| M24 | C-2: `demo` nur `=== true` statt echtes Boolean | 1 |
| M25 | C-3: Schlüsselform im Patch nicht geprüft | 1 |
| M26 | C-3: Prototyp-Namen zugelassen | ≥ 1 |
| M27 | C-3: `defineProperty` durch Zuweisung ersetzt | **überlebt, gleichwertig**: Prototyp-Namen sind vorher abgewiesen und jeder Schlüssel enthält „\|“, eine Zuweisung kann damit keinen Prototyp treffen; zweite Sicherung |
| M28 | C-3: try/catch in `patchAnwenden` entfernt | 1 |

Nach Review #612 (Kopf vor dem Fix b79fe1e5): 31 Tests; Lauf der Mutationen M1–M28 erneut gegen die geänderte Datei: 27/28 erkannt, M27 gleichwertig (oben).
