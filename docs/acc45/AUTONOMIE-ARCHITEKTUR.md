# Dauerhaft autonome Entwicklungssteuerung: Untersuchung, Architektur, Prototyp

Stand 2026-11-19. Status: Prototyp und Tests im Repository, **nichts aktiviert** (kein Trigger, kein globaler Hook, keine Berechtigungsänderung, keine neuen Kosten).

## 1. Ist-Analyse: warum nach PRs und Agentenläufen nichts weiterläuft

Unsere Werkzeuge sind **passiv**: `werkzeug/koordination.mjs` (Lease, Fencing, `leerlauf`) und `werkzeug/naechstes-paket.mjs` (Paketauswahl) lesen und entscheiden nur, wenn jemand sie aufruft. Es gibt keinen Prozess, der nach Sitzungsende weiterläuft. Daraus folgen die beobachteten Stillstände. Die Zuordnung leitet sich aus Code und dokumentierten Vorfällen ab (zum Beispiel `WIEDERAUFNAHME.md` Nachtrag 2026-11-17 Abend: Lease Epoche 19 seit 15:28Z abgelaufen, Übernahme erst 16:14Z).

| Ursache | Was passiert | Beleg / Prüfweg | Behebbar durch |
|---|---|---|---|
| Regulärer Sitzungsabschluss | Eine Claude-Sitzung endet, wenn kein Werkzeugaufruf mehr aussteht. Nichts startet sie neu. | Verhalten von Claude Code; kein Code von uns | Externer Supervisor (neu) |
| Fehlender Wiederanlauf | Cloud-Routine ist laut Betreiberentscheidung 18.11. ein Entwurf (`routine-vorspann.txt`), nicht aktiv geändert. Die Wiederaufnahme hängt am Hauptchat. | Entscheidungsliste, Memory 2026-11-18 | Supervisor plus freigegebene Routine |
| Abgelaufene Lease | Erneuert nur die lebende Sitzung. Nach Ende läuft sie in 90 bis 180 Min ab. `leerlauf` erkennt das, ruft aber niemand auf. | `koordination.mjs` Zeilen 57 bis 106, 180 bis 229 | Kurze Lease plus Heartbeat (neu) |
| Blockierter Agent | Ein hängender Subagent hält die Sitzung offen oder endet ohne Ergebnis; es gibt keinen Puls und kein Zeitlimit. | Subagenten ohne Watchdog | Puls-Watchdog (neu) |
| Abwartende CI | `pruefen` und `browser-abnahme` brauchen 25 bis 40 Min. Wartet die Sitzung nicht aktiv (Monitor, Wakeup), endet sie. | CI-Läufe #375 bis #379 | Supervisor-Zyklus, der CI als Fortschrittssignal liest |
| Fehlende Aufgabenfreigabe | `naechstes-paket` liefert nichts, wenn alles an Betreiberentscheidungen hängt (Stand 2026-11-17: kein Paket READY). Das ist korrekt und **kein Fehler**. | `naechstes-paket.mjs` Zeilen 7 bis 11 | Bleibt Betreiberentscheidung; Supervisor gibt Lease frei und meldet Leerlauf |
| Technischer Fehler | Chromium-Installationsschritt der CI (Infrastruktur), Speichermangel beim Lauf großer Testmengen. | `WIEDERAUFNAHME.md` 2026-11-17, CI-Wiederholungen | Begrenzte Wiederholung, Backoff, Eskalation |

Kernaussage: Der häufigste Fall ist **regulärer Abschluss ohne Wiederanlauf**, kein Defekt. Die Lease schützt korrekt, nur fehlt der Akteur, der sie nach Ablauf sicher übernimmt.

## 2. Vergleich der fünf Projekte (Codeanalyse, nichts ausgeführt)

Quelle: Analyse der flachen Klone (nur gelesen). Lizenzen: MIT (1, 2, 4, 5), Apache-2.0 (3).

| Projekt | Art | Dauerbetrieb nach Prozessende | Lease / Fencing | Windows (Git Bash) | Rechte | Befund |
|---|---|---|---|---|---|---|
| snarktank/ralph | externe Bash-Schleife, `prd.json` mit `passes` | nein (läuft nur solange das Skript läuft) | keine | braucht `jq` (hier nicht installiert) | fest `--dangerously-skip-permissions` | Muster Aufgabenliste plus append-only Fortschritt; kein Watchdog, keine Fehlerbehandlung |
| FasalZein/ralph-loop | externer Supervisor | nein, aber Retry (bis 5) und Idle-Watchdog | keine | `jq`; Prozessgruppen-Kill unter Git Bash unzuverlässig | fest `--dangerously-skip-permissions` | Technisch stärkstes Vorbild: Supervisor prüft selbst, ob eine Erledigt-Meldung stimmt; Stop-Datei |
| anthropics ralph-loop (Plugin) | Stop-Hook in der Sitzung | **nein**, endet mit der Sitzung; Kontext wächst | keine | Git Bash nötig | Sitzungsrechte | Iterationen standardmäßig unbegrenzt (Kostenrisiko); als Hook auf unseren Zweck nicht ausreichend |
| nnemirovsky/cc-resume-watchdog | Hooks in der Sitzung | nein; weckt nur nach transienten Stream-Abbrüchen | keine | Windows-PID-Prüfung unklar, ungetestet | Hooks bei jedem Tool-Aufruf in allen Sitzungen | Gute Muster: Whitelist transienter Fehler, Ledger, Rate-Limit; Hooks wären global und damit nicht freigegeben |
| anthropics/claude-code-action | GitHub Action, ereignisgesteuert | nur pro Ereignis (Label, Kommentar, schedule/dispatch mit `prompt`) | keine; `concurrency` der Action ist kein Fencing | läuft auf Runnern, nicht lokal | Schreibrechte nötig; kann nicht mergen | Geeignet für abgeschlossene Pakete mit PR als Ergebnis, nicht für lange Ketten, VPS oder lokale Lease |

Querschnitt: **Keines** der Projekte hat Lease mit Epoche, Koordination mehrerer Schreiber, unser Modellrouting oder unsere CI-/Review-Gates. 1 bis 4 setzen `jq` voraus und zwei bringen Rechteumgehung mit. Fremder Code wird deshalb nicht übernommen, nur Muster.

## 3. Bestes Projekt und was übernommen wird

Beste Vorlage: **FasalZein/ralph-loop** (Supervisor außerhalb der Sitzung, Idle-Watchdog, Retry mit Backoff, Prüfung der Erledigt-Meldung durch den Supervisor, Stop-Datei). Der Code wird nicht übernommen (Bash plus `jq`, Rechteumgehung, ein Autor, 0 Sterne). Übernommene Muster:

1. Aufgabenliste mit Priorität im Repository (haben wir: `docs/acc45/work-packages.json`).
2. Frischer Kontext je Paket (`claude -p`, begrenzt durch `--max-turns`).
3. Supervisor prüft **nachweisbaren Fortschritt** statt der Selbstauskunft des Workers.
4. Idle-Watchdog über wachsende Ausgabe (Puls).
5. Wiederholungsobergrenze mit Backoff, danach Sperre und Eskalation.
6. Stop-Datei als Abschalter.
7. Aus cc-resume-watchdog: Rate-Limit und Ledger-Gedanke für Wiederholungen (hier: Versuchszähler je Paket).
8. claude-code-action: nur als Option für isolierte Einzelpakete; derzeit kein Bedarf.

## 4. Was bereits vorhanden ist und was neu ist

Vorhanden: atomare Lease mit Compare-and-Swap, Epoche, Fencing-Push, Sicherheitszone, `leerlauf`, `naechstes-paket`, SSOT, Modellrouting-Regeln, CI-Gates, Review- und Merge-Regeln.

Neu (Prototyp, `werkzeug/dauerlauf.mjs`):

- Reiner Entscheidungskern `planeSchritt` (genau eine Aktion je Zyklus, fail-closed).
- Heartbeat gekoppelt an Worker-Puls: Die Lease wird nur erneuert, solange der letzte Puls jünger als die Lease-Dauer (20 Min) ist. Ein eingefrorener Worker verliert so nach spätestens einer Lease-Dauer das Schreibrecht und wird beendet (im Test vor Minute 33). Ein Worker, der länger als 20 Min keinerlei Ausgabe erzeugt, würde ebenfalls so behandelt; der echte Adapter muss deshalb Streamausgabe (`stream-json`) als Puls nutzen.
- Kurze Lease (20 Min, Erneuerung unter 10 Min Rest): nach Ende des Supervisor-Prozesses höchstens etwa 22 Min Stillstand statt bis 182 Min.
- Kein Übernehmen ohne offenes Paket (verhindert Epochen-Rauschen); laufender Worker wird bei Abschalter, unlesbarer Lease oder verlorenem Schreibrecht immer zuerst beendet.
- Sperrdatei im Zustandsverzeichnis: zwei Supervisor-Prozesse mit gleichem Halter sind ausgeschlossen (verwaiste Sperre wird übernommen).
- Verbuchung von Ergebnissen mit Fortschrittsprüfung, Backoff, Sperre, Eskalation.
- Doppelstart-Schutz (Auftragsschlüssel `Paket@Kopf`, kein Start bei laufendem Auftrag, Start nur nach `pruefen`).
- Abschalter (Datei `AUTONOMIE-AUS` oder `CENTRIC_AUTONOMIE` ungleich `ja`).
- `claudeBefehl`: begrenzter Befehl ohne Rechteumgehung, validierte Eingaben.
- Kleine Änderung an `koordination.mjs`: `push` nimmt optional `--minuten`. Vorher verlängerte jeder Worker-Push die Lease stillschweigend auf 90 Min und hätte die kurze Lease samt Heartbeat-Kopplung ausgehebelt (im Test entdeckt).

## 5. Zielarchitektur (kleinste zuverlässige Erweiterung)

```
Windows-Aufgabenplanung / Dienst (Betreiber richtet ein)  ->  dauerlauf.mjs --scharf (ein Prozess)
   Zyklus alle 2 bis 5 Min:
     Lease lesen -> planeSchritt -> eine Aktion
       UEBERNEHMEN   nur bei abgelaufener/freigegebener Lease, eigene Kennung, Übergabetext
       STARTEN       frischer `claude -p` je Paket; Epoche in der Umgebung; Schreiben per `koordination push` (kooperativ, siehe §7)
       WORKER_LAEUFT Heartbeat (Lease erneuern) nur bei frischem Puls
       WORKER_BEENDEN bei Hängen, verlorener Epoche oder Abschalter
       FREIGEBEN     kein Paket, Eskalation oder Abschalter
       WARTEN_*      fremde Lease, Sicherheitszone: nur lesen
Zustand: lokale JSON-Datei (atomar), Protokoll: JSONL; Fortschritt und Aufgaben: im Repository (SSOT, PRs).
Merge, Review, CI, Modellrouting bleiben unverändert im Worker-Auftrag; der Supervisor merged nie selbst.
```

Zwei Wege nach Totalausfall: gleicher Halter mit Zustandsdatei setzt sofort fort (Worker lebt weiter, kein Doppelstart); neuer Halter wartet den Ablauf ab und übernimmt mit Epoche plus 1, der alte Worker scheitert am Fencing.

## 6. Nachweise des Prototyps

`pruefungen/dauerlauf.test.js` (32 Tests, Teil von `npm run pruefung:koordination`, also ohne Workflow-Änderung in der CI):

| Anforderung | Test |
|---|---|
| Erfolgreicher Abschluss, unmittelbar nächstes Paket | gleicher Zyklus verbucht das Ende und startet das nächste |
| Simuliertes Prozessende | Neustart mit/ohne Zustandsdatei; neuer Halter übernimmt nach Ablauf, alter Push wird atomar abgelehnt (echter Git-Remote) |
| Abgelaufene Lease | Übernahme erst nach Ablauf plus Zone, Epoche plus 1 |
| Gültige fremde Lease | nur Warten; Lease-Commit bleibt nach 10 Zyklen unverändert (echter Remote) |
| Hängender Agent | kein Erneuern, Worker beendet, Fehlversuch gezählt |
| Fehlgeschlagene CI | Backoff, nach 3 Versuchen gesperrt, Lease freigegeben, kein Dauerlauf |
| Fehlende Betreiberfreigabe | extern, bedingt, BLOCKED, unerfüllte Abhängigkeit: nie Kandidat; ohne Kandidat Freigabe der Lease |
| Wiederholter Start desselben Auftrags | genau ein Start trotz mehrerer Zyklen |
| Nie zwei Schreiber (Teilbeweis, siehe Grenze) | 8 reproduzierbare Zufallsläufe à 400 Schritte (3 Supervisoren, Abstürze, hängende Worker, Abschalter, verwaiste Worker): höchstens ein Koordinator besteht `pruefen`, Epochen steigen nur, Worker nur mit Schreibrecht, Schreibversuche gelingen nur dem aktuellen Halter mit aktueller Epoche; zusätzlich echte CAS-Probe: zwei Supervisoren lesen dieselbe leere Lease, genau eine Übernahme gelingt |

Grenze des Beweises: Die Zufallsläufe verwenden eindeutige Halter; ihre Invarianten 1 und 4 folgen weitgehend aus `entscheide` und sind keine unabhängige Prüfung, aussagekräftig sind Epochen-Monotonie und "Worker nur mit Schreibrecht" (nur für den jeweils schrittenden Supervisor). Gleichzeitige Prozesse mit gleichem Halter verhindert die Sperrdatei (eigener Test), nicht der Zufallslauf. Der Beweis stützt sich auf die Korrektheit von `entscheide` und den Git-CAS (beide bereits getestet). Er deckt das Zusammenspiel Supervisor/Lease ab, **nicht** das Verhalten eines echten `claude -p`-Prozesses unter Windows.

## 7. Bekannte Lücken des Prototyps (ehrlich)

1. Der echte Worker-Adapter ist ungetestet. Er meldet derzeit `fortschritt: false`, solange keine Fortschrittsmessung existiert; ein scharfer Lauf würde also jeden Lauf als Fehlversuch zählen. Nötig: Messung über Integrationskopf, SSOT-Status und PR-Zustand (etwa 1 bis 2 PT).
2. `claude -p` headless braucht eine Berechtigungsstrategie (Allowlist), ohne `--dangerously-skip-permissions`. Das ist eine Berechtigungsentscheidung des Betreibers.
3. Prozessüberwachung unter Windows (PID-Prüfung, Prozessbaum beenden) muss real getestet werden.
4. Die Pulsmessung per Log-Änderungszeit ist grob; ein Worker, der still rechnet (lange Testläufe), kann fälschlich als hängend gelten. Die Schwelle `haengMin` ist deshalb 30 Min.
5. Kosten: jeder Lauf verbraucht Nutzungskontingent oder API-Kosten. Begrenzung nur über `--max-turns`, `maxVersuche` und Abschalter; ein Tageslimit fehlt noch.

6. Das Fencing des Workers ist kooperativ: Der Auftrag verlangt `koordination push`, aber ein Worker mit Projektrechten könnte direkt `git push` ausführen. Die Umgebungsvariablen `CENTRIC_KOORD_*` wertet kein Code aus. Die Berechtigungs-Allowlist (§9.3) muss direktes `git push` sperren. Hinzu kommt der bestehende Schutz durch Pull Request, Review und CI.
7. Prozesssteuerung unter Windows: `beenden` beendet eine gespeicherte PID; nach Neustart kann sie wiederverwendet sein (Prüfung über Startzeit oder Kommandozeile fehlt), der Prozessbaum wird nicht beendet, und `spawn("claude")` ohne Shell scheitert, falls `claude` eine `.cmd`-Datei ist (kein `error`-Listener). Ob `-p @datei` die Datei so einliest, ist ungeprüft.
8. Ergebnis von `erneuern` wird im Zyklus nicht ausgewertet; ein Fehlschlag zeigt sich erst im nächsten Zyklus.

## 8. Aufwand, Verbesserung, Risiken

- Aufwand bis zum scharfen Probelauf: etwa 4 bis 6 PT (Fortschrittsmessung, Worker-Adapter real testen, Windows-Prozesssteuerung inklusive PID-/Prozessbaum-Behandlung, Tageslimit, Protokoll-/Statusanzeige), danach Beobachtungsphase.
- Erwartete Verbesserung: Stillstand nach Sitzungsende von bis zu 182 Min auf höchstens etwa 25 Min, solange freigegebene Pakete existieren; kein manuelles Wiederanstoßen im Regelfall.
- Risiken: Kosten ohne Limit, Fehlsteuerung durch falsche Fortschrittsmessung, ein Worker mit zu weiten Rechten, Doppelarbeit bei parallelem Hauptchat (durch Lease ausgeschlossen, aber der Hauptchat müsste dann `freigeben`/warten).

## 9. Genehmigungspflichtige Aktivierungsschritte (nicht ausgeführt)

1. Erster scharfer Lauf (`CENTRIC_AUTONOMIE=ja`) und seine Dauer.
2. Autostart (Windows-Aufgabenplanung oder Dienst): Systemeinstellung.
3. Berechtigungsstrategie für headless Worker (Allowlist, keine Umgehung).
4. Nutzungslimit und Kostenrahmen für Dauerläufe.
5. Anpassung der Cloud-Routine (Entwurf `routine-vorspann.txt` bleibt unangewendet).
6. Falls gewünscht: eigener CI-Job für den Prototyp (Workflow-Änderung).
