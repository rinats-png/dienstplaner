# Review-Nachweis der Orchestrierung (Stand 2026-11-19)

**Ehrlichkeitsvermerk:** Dies ist eine Zusammenfassung der unabhängigen Reviews der Orchestrierung, keine Rohberichte. Die Berichte liegen nicht als Dateien im Repository. Es ist Selbstauskunft der Orchestrierung, belegt nur über Merge-Gate-Protokoll, PR-Verlauf und Head-Pin-Merges. Die Merge-Commits sind mit `gh pr view` geprüft. Was hier nicht steht, ist „nicht in dieser Übersicht“.

| PR | Geprüfter Head | Reviewer-Modell | Urteil | Wesentliche Befunde / Behebung | Merge-Commit |
|---|---|---|---|---|---|
| #360 BE-1 Passwörter | 050e75a0; Delta f464531c | Opus (Sicherheitsreview, dann Delta) | MERGE-MIT-AUFLAGEN; Delta MERGE-OK | MITTEL-1 Sitzung lebt nach Restore auf, behoben durch Epoche+1; MITTEL-2 Testlücken M6/M7 | 8baa93cc |
| #361 Kapern/Orakel B1-B3 | 24242d39; Delta 65091351 | Opus | NICHT MERGEN; Delta MERGE-MIT-AUFLAGEN | Erster Head: CI rot, zweite Bestandsprüfung in `schichtverantwortung.mjs`; Delta: A1 Regression bei gemischtem Altbestand (fremd 5 / eigen „5“), behoben auf 71e49311; Fix vom Reviewer verifiziert, kein drittes Review | 93f8c9eb |
| #362 WP-28b | 414476c4 | Opus | MERGE-MIT-AUFLAGEN (nur grüne CI) | nicht in dieser Übersicht | 8895842c |
| #364 Test-Härtung | 0b0b4191 | Opus | MERGE-MIT-AUFLAGEN | CI rot (Spur-Marke), Ergebnistest geschwächt; Nachbesserung f1dabadc **ohne zweites Review**, nur CI-Gegenprobe 22/22 (nicht unabhängig nachgeprüft) | 899ce304 |
| #365 WP-48-GB | 43b9f69b; Delta 5fbcebe0 | Opus | MERGE-MIT-AUFLAGEN; Delta MERGE-OK | nicht in dieser Übersicht | c177116f |
| #366 SV-Orakel | e6a448de; Delta 4ee4f4e9 | Opus | NICHT MERGEN; Delta MERGE-OK | CI rot `kette-a-rundreise`, N2 Testlücke M8, N1 deterministische Server-Kennungen; Delta: 60.000 Läufe, 14.827 Abweichungen, alle gewollt | e231525d |
| #368 WP-14c | 62b0f9c1; Delta 51475ea4 | Opus | MERGE-MIT-AUFLAGEN; Delta MERGE-OK | M1 leere Pause, N2 Filter, N1 Banner-Test | 9fd6045f |
| #369 IMP-6 Teil 1 | a24c0f33 (Folge-Head 92bddc34 ohne weiteres Opus-Review) | Opus | MERGE-MIT-AUFLAGEN | MITTEL: Modellkürzung ergibt „ungueltig“ ohne Abweisung, dokumentiert und per Test festgenagelt, Pflicht vor Punkt 6; Folge-Head nur Test/Doku/Kommentar, CI 23/23 | 8200976a |
| #370 ABN-A4 | 36c25ec0; Delta 5e7c5498 | Opus | MERGE-MIT-AUFLAGEN; Delta MERGE-OK nach grüner CI 23/23 | H1 CI rot (status-schreiben fehlte); M1 null/''/false/[3]; M2 Mutanten; Delta: 43.320 Fälle `mindestTagOffen` = `mindestFeldStatus`, 6.400 Aufrufe bit-gleich. Deckt die Q1-Q5-Tabelle und die Anzeige-Lücke, **nicht** den Code von #280 | 87473f12 |

Frühere Reviews (#356 bis #359), nur summarisch und ohne Head-SHAs, Quelle der Merge-Commits `gh pr view`: #356 Opus-Review und Delta MERGE-MIT-AUFLAGEN (dfcd8309); #357 Opus MERGE-OK (a8ce186b); #358 Opus und Delta (f175bf9d); #359 Opus und Nachbesserung (72072ab0). Urteile und Befunde im Einzelnen: nicht in dieser Übersicht.

**Nicht belegt:** Ein Review des Codes von #280 (Direktmerge bcddf680, 2026-11-13) liegt nicht vor; ABN-A4 bleibt deshalb REVIEW.
