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
