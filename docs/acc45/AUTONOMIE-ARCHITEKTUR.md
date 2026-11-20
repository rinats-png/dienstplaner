# Dauerhaft autonome Entwicklungssteuerung: Untersuchung, Architektur, Prototyp

Stand 2026-11-19 (Lücken 1 bis 8 aus §7 überarbeitet, siehe §7.1). Status: Prototyp und Tests im Repository, **nichts aktiviert** (kein Trigger, kein globaler Hook, keine Berechtigungsänderung, keine neuen Kosten).

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
- Heartbeat gekoppelt an Worker-Puls: Die Lease wird nur erneuert, solange der letzte Puls jünger als die Lease-Dauer (20 Min) ist. Ein eingefrorener Worker verliert so nach spätestens einer Lease-Dauer das Schreibrecht und wird beendet (im Test vor Minute 33). Ein eingefrorener Worker wird dabei als Fehlversuch gezählt (Backoff, Sperre nach 3). `haengMin` ist deshalb gleich `leaseMin` (20 Min). Ein Worker, der länger als 20 Min keinerlei Ausgabe erzeugt, würde ebenfalls so behandelt; der echte Adapter muss deshalb Streamausgabe (`stream-json`) als Puls nutzen.
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

`pruefungen/dauerlauf.test.js` (Kern und Zyklen) und `pruefungen/dauerlauf-prozess.test.js` (echte Prozesse, Push-Schutz, Wiederanlauf), beide Teil von `npm run pruefung:koordination`, also ohne Workflow-Änderung in der CI. Ergänzungen zu den Lücken stehen in §7.1.

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

## 7. Lücken des Prototyps (ehrlich, Stand nach `feat/dauerlauf-luecken`)

### 7.1 Geschlossen (mit Test)

Nachweise: `pruefungen/dauerlauf.test.js` (reiner Kern, Zyklen) und `pruefungen/dauerlauf-prozess.test.js` (echte Kindprozesse, echtes Git, lokales Bare-Remote). Beide laufen in `npm run pruefung:koordination`, also ohne Workflow-Änderung in der CI. **Einschränkung:** Die CI läuft nur unter Ubuntu. Der Windows-Weg (PowerShell-Identitätsabfrage, `taskkill /T`, Start über `.cmd`/`cmd.exe`) wird dort nie geprüft; er ist nur lokal unter Windows getestet (`.cmd`-Test läuft nur unter Windows). Die Zufallsläufe "nie zwei Schreiber" laufen mit sehr hohen Limits und prüfen eine Mindestzahl an Worker-Starts, damit die Nutzungsgrenzen ihre Abdeckung nicht ausdünnen.

| Frühere Lücke | Lösung | Test |
|---|---|---|
| 1 Fortschritt wurde nicht gemessen | Reine Funktion `fortschritt(vorher, nachher)` über Integrationskopf, SSOT-Status/PR-Liste am Integrationskopf und PR-Zustand (gh, optional, injizierbar). Messung beim Start im Zustand, Vergleich am Ende. Ist eine Messung vorhanden, wird die Selbstauskunft des Workers verworfen. PRs werden nur verglichen, wenn beide Messungen PR-Daten haben (sonst wäre jeder vorhandene PR "neu"). Scheinfortschritt (geschlossener PR, Status rückwärts, Statussprung ohne PR-Beleg, SSOT nennt nicht existierenden PR) zählt nicht; geänderter Integrationskopf allein ist kein Fortschritt des Pakets. | Fortschritt, Scheinfortschritt, nichts, rote CI, `prsFuerPaket` (WP-16 nicht in WP-16c), Zyklus mit verworfener Selbstauskunft |
| 3 und 7 Windows-Prozesssteuerung | `werkzeug/dauerlauf-prozess.mjs`: eigene PATH-Auflösung (`.exe` vor `.cmd`/`.bat` vor `.ps1`; Datei ohne Endung unter Windows nie), `.cmd` nur über `cmd.exe /d /s /c` mit geprüften Argumenten (keine Leer- und Sonderzeichen, sonst kein Start), sonst ohne Shell; `error`-Listener; Startfehler werfen nie und zählen als Fehlversuch mit Backoff. Prozessbaum beenden (`taskkill /T /F`, sonst Signal an die Prozessgruppe). Startzeit und Kommandozeilen-Merkmal stehen in der Zustandsdatei; `status`/`beenden` vergleichen sie, ein fremder Prozess unter gleicher PID wird nie beendet. Ist die Startzeit beim Start nicht ermittelbar, wird der Prozess sofort über das eigene Handle beendet (Startfehler). Lässt sich ein Worker nicht sicher beenden (Identität unklar), bleibt der Auftrag eingetragen: Eskalation, keine neuen Starts. Eskaliert wird einmal je Auftrag, auch wenn ein Laufzeit- oder Wallclock-Limit den Beendeversuch auslöst und dieser in jedem Zyklus erneut scheitert (Merker `limitEskaliert` und `beendenFehlgeschlagen` am Auftrag). Ob ein Baum beendet ist, entscheidet die Nachprüfung des Prozesses, nicht der Exit-Code von `taskkill` (der ist ungleich 0, wenn Kinder schon mit dem Starter gestorben sind; im Wiederanlauftest gefunden). **Grenze:** Nachgeprüft wird nur der Starter selbst, nicht seine Nachfahren. Unter Windows verlassen sich Starter und Kind auf die Job-Gruppe; libuv startet Kindprozesse aber mit `JOB_OBJECT_LIMIT_SILENT_BREAKAWAY_OK`, sodass Nachfahren (etwa `node` hinter `claude.cmd`) außerhalb des Jobs liegen können. Überlebt ein solcher Nachfahre `taskkill /T` (z. B. weil sein Elternprozess schon vorher endete und die Baumbeziehung abriss), meldet die Nachprüfung trotzdem "beendet". Nicht geprüft und nicht getestet; siehe 7.2 Nr. 4. Einer Exit-Datei wird nicht vertraut, solange der Starter mit gleicher Identität noch lebt (er wird dann beendet). Systemprogramme (`powershell.exe`, `taskkill.exe`, `cmd.exe`) mit festem Pfad unter `%SystemRoot%System32`, `git` (auch für Integrationskopf und SSOT, `gitPfad()`; ohne absoluten Fund Fehler, kein Rückfall auf den bloßen Namen `git`) und `gh` (für die PR-Messung, `ghPfad()`, nur `.exe` bzw. ohne Endung unter POSIX; sonst keine PR-Daten) mit absolutem Pfad aus dem PATH des Supervisors und nie mit der Worker-Kopie als Arbeitsverzeichnis. Im scharfen Lauf ist `--claude-pfad <absolut>` Pflicht (keine PATH-Suche). Auftrag über stdin statt `-p @datei`. Losgelöst gestartet wird nur der Zwischenprozess `werkzeug/dauerlauf-starter.mjs`; er startet den Befehl mit verborgener Konsole und schreibt den Exit-Code in eine Datei (auch nach Neustart des Supervisors lesbar). Grund, im Test gefunden: Ein losgelöst gestartetes `cmd.exe` hat keine Konsole, sein Kind (`node` hinter `claude.cmd`) bekam eine neue Konsole statt der Pipes; der Auftrag über stdin kam nie an, ein echter `claude.cmd`-Worker hätte endlos gewartet. | echter Attrappen-Worker mit Kindeskind wird gestartet und als Baum beendet; PID-Wiederverwendung; unklare Identität; Startzeit unbekannt; gefälschte Exit-Datei; nicht beendbarer Worker im Zyklus (auch nach Laufzeit-/Wallclock-Limit: je Limit-Eskalation einmal je Auftrag); `ghPfad`/`gitPfad` (nur absolute Treffer, relative PATH-Einträge übersprungen, keine `.cmd`, git ohne Fund: Fehler statt Rückfall auf den bloßen Namen); unbekannter und nicht ausführbarer Befehl; unter Windows Start über eine echte `.cmd`-Datei samt Baum-Ende |
| 6 Fencing nur kooperativ | Geschützte Worker-Kopie (`werkzeug/dauerlauf-schutz.mjs`, nur lokale Git-Konfiguration dieser Kopie): `pushurl` ungültig, `core.hooksPath` mit pre-push-Hook, der nur eine Einmalmarke von `koordination.mjs push` durchlässt; Anmeldehelfer in der Kopie geleert, nur der Wrapper setzt ihn. Der Supervisor startet keinen Worker, wenn die Prüfung der Kopie scheitert. Zulässig ist nur die Wurzel eines eigenständigen Klons: ein `git worktree` (gemeinsames Git-Verzeichnis, jede `git config` landete in der Konfiguration des Haupt-Repos und sperrte dessen Pushes), das Haupt-Repo selbst, ein Unterordner und ein leerer Pfad werden abgelehnt, bevor etwas geschrieben wird. Allowlist als Vorschlag: `docs/acc45/AUTONOMIE-ALLOWLIST-VORSCHLAG.json` (nicht installiert). | direkter `git push` (über Namen, über URL, mit gefälschter Marke) scheitert; Wrapper-Push nur mit gültiger Epoche und eigenem Halter; gesperrte Ziele; ungeschützte Kopie wird erkannt; echter `git worktree` und Haupt-Repo abgelehnt, Konfiguration des Haupt-Repos unverändert |
| 5 Kosten ohne Tageslimit | Harte Grenzen im reinen Kern: Starts je UTC-Tag, Starts gesamt, Läufe je Paket, Laufzeit je Worker (danach beenden), Wallclock je Tag; Zähler persistent in der Zustandsdatei. Überschreitung: keine Starts, Eskalationsprotokoll (`eskalation.jsonl`), Lease freigeben, keine Wiederübernahme (`WARTEN_LIMIT`) bis zum Zurücksetzen der Tageszähler am nächsten UTC-Tag (Gesamtlimit und Läufe je Paket bleiben). Im scharfen Lauf ist jedes Limit Pflichtparameter mit Obergrenze (ohne Limit kein Start). Notaus bleibt die Datei `AUTONOMIE-AUS`. | Tageslimit mit Tageswechsel, Gesamtlimit, Läufe je Paket, Laufzeitlimit, Wallclock, ohne Limits, Pflichtparameter |
| 8 Ergebnis von `erneuern` | Fehlschlag wird protokolliert (Wirkung weiterhin erst im nächsten Zyklus). | indirekt |
| Wiederanlauf nur simuliert | Echter Supervisor-Prozess im Testmodus (Bare-Remote in `KOORD_REMOTE`, Attrappen-Worker, Uhrdatei): Start, harter Abbruch (Prozess gekillt, Worker lebt weiter, Sperrdatei verwaist), Neustart mit gleichem Halter setzt fort ohne Doppelstart, neuer Halter wartet bis Ablauf plus Zone und übernimmt mit Epoche 2, Push des verwaisten Workers scheitert am Fencing, der zurückkehrende alte Supervisor beendet seinen Worker samt Kindeskind. | `dauerlauf-prozess.test.js` |

### 7.2 Verbleibend

1. `claude -p` ist nicht real gestartet worden (keine Kosten, kein scharfer Lauf). Geprüft ist nur `claude --help` (2.1.328): `-p`, `--model`, `--output-format`, `--verbose`, `--max-budget-usd` stehen dort, `--max-turns` nicht; es wird deshalb nur auf ausdrücklichen Wunsch gesetzt, und der Supervisor prüft vor dem ersten Start, ob jede verwendete Option in der lokalen Hilfe steht. Dass `claude -p` den Auftrag von stdin liest, folgt aus der Hilfe ("useful for pipes"), ist aber erst im ersten freigegebenen Lauf belegt. Die harte Grenze ist das Laufzeitlimit.
2. Berechtigungen des headless Workers: Die Allowlist ist nur ein Vorschlag. Ohne installierte Allowlist fragt `claude -p` bei nicht erlaubten Werkzeugen nach und bricht ab (kein Fortschritt, also Fehlversuch).
3. Der Push-Schutz ist eine Hürde, keine Sicherheitsgrenze: Ein Worker mit freier Shell kann `--no-verify` nutzen, `core.hooksPath` zurücksetzen, die Marke selbst schreiben oder einen gh-Token für HTTPS verwenden (Test "Grenze (ehrlich)"). Wirksam bleiben Fencing über die Epoche, die gesperrten Ziele des Wrappers, PR-Pflicht, Review, CI und serverseitiger Branch-Schutz (offene Betreiberaufgabe).
4. Identitätsprüfung: Zwischen Prüfung und `taskkill` bleibt ein sehr kleines Zeitfenster. Ist die Identität unklar (Abfrage scheitert), wird nicht beendet; der Auftrag bleibt dann eingetragen und es gibt keine neuen Starts (Eskalation), der Worker kann aber über das Laufzeitlimit hinaus weiterlaufen. Ein Doppelstart bleibt möglich, wenn `status` einen noch lebenden Worker irrtümlich als beendet meldet (Prozess nicht sichtbar, etwa andere Sitzung ohne Rechte, oder Startzeit-Abfrage liefert einen abweichenden Wert); dann startet der nächste Zyklus einen zweiten Worker mit gleicher Epoche, den das Fencing nicht unterscheidet. Unter Windows kostet jede Abfrage einen PowerShell-Start (etwa 1 s). **Nachfahren werden nicht nachgeprüft:** Nach `taskkill /T /F` prüft der Supervisor nur, ob der Starter weg ist. Nachfahren, die nicht mehr im Prozessbaum hängen oder (libuv setzt `JOB_OBJECT_LIMIT_SILENT_BREAKAWAY_OK`) außerhalb der Job-Gruppe des Starters liegen, etwa `node` hinter `claude.cmd`, können weiterlaufen, während der Auftrag als beendet verbucht wird; dann ist auch ein zweiter Worker möglich. Ein Merken der Nachfahren-PIDs vor `taskkill` mit Nachprüfung danach wäre Windows-spezifisch und in der CI (Ubuntu) nicht prüfbar; es ist deshalb bewusst nicht umgesetzt. Gegenmittel bis dahin: nach jedem "Worker beendet" im Protokoll stichprobenhaft im Task-Manager nach verwaisten `node`/`claude`-Prozessen mit der Worker-Kopie als Arbeitsverzeichnis sehen; das Fencing (Epoche) sperrt Pushes eines verwaisten Workers erst nach einem Epochenwechsel, nicht innerhalb derselben Epoche.
5. Exit-Code nach Neustart des Supervisors ist unbekannt (`null`); dann entscheidet allein die Messung.
6. Pulsmessung weiter über die Änderungszeit der Ausgabedatei (Streamausgabe); ein still rechnender Worker kann als hängend gelten (Schwelle 20 Min).
7. Sperrdatei (früher Punkt 9) und Lease-Halten im Backoff (früher Punkt 10) unverändert.
8. Fortschrittsmessung über gh ordnet PRs über Paket-ID in Titel oder Branch beziehungsweise die SSOT-PR-Liste zu; ein PR ohne Kennung zählt nicht. Ohne gh wird nur ein SSOT-Schritt am geänderten Integrationskopf anerkannt. Gemessen wird **Aktivität, nicht Qualität**: auch ein leerer Worker-PR oder ein PR eines Menschen mit der Paket-ID zählt als Fortschritt; begrenzt wird das nur durch `laeufeJePaket` und die übrigen Limits. Qualität sichern weiterhin Review und CI.
9. **Limits sind nur gegen einen kooperativen Worker hart.** Die Zähler liegen in der Zustandsdatei im beschreibbaren Zustandsordner; ein Worker mit Schreibzugriff dorthin könnte sie zurücksetzen (die Allowlist-Vorlage begrenzt Edit/Write deshalb auf die Worker-Kopie). Ein anderer Halter oder ein anderer Zustandsordner beginnt mit Zählern bei null. Prozesse, die ein Worker selbst losgelöst startet, liegen außerhalb des mit `taskkill /T` beendeten Baums und außerhalb des Laufzeitlimits.
10. Der Windows-Weg ist nur lokal getestet; die CI (Ubuntu) prüft ihn nie. Das gilt auch für die Nachträge aus dem Delta-Review von #388.
11. **Dauerblockade durch einen nicht beendbaren Worker (Betreiberanleitung).** Scheitert das Beenden (Protokoll "Worker nicht beendet", Eskalation "nicht beendbar" in `eskalation.jsonl`), bleibt der Auftrag eingetragen und der Supervisor startet nichts Neues, versucht aber in jedem Zyklus erneut zu beenden. **Lease:** Solange `WORKER_BEENDEN` hängt, wird die Lease nicht erneuert (Heartbeat nur bei `WORKER_LAEUFT`/`BACKOFF`). Nach höchstens einer Lease-Dauer (20 Min) läuft sie ab; ab dann wechselt der Protokollgrund von "Laufzeitlimit …"/"Wallclock-Limit …"/"Abschalter gesetzt" zu "Schreibrecht verloren (Epoche, Zone oder Ablauf)". Das ist dieselbe Blockade, kein neuer Fehler. Nach Ablauf plus Sicherheitszone kann ein anderer Halter die Lease mit neuer Epoche übernehmen; der hängende Worker kann dann nicht mehr pushen (Fencing), läuft aber weiter, bis er von Hand beendet ist. Auflösen von Hand:
    1. Notaus setzen: Datei `AUTONOMIE-AUS` im Zustandsordner anlegen (`%LOCALAPPDATA%\centric-dauerlauf\` bzw. `CENTRIC_AUTONOMIE_DIR`) oder den Supervisor mit `CENTRIC_AUTONOMIE` ungleich `ja` neu starten.
    2. Den Prozess von Hand beenden: PID aus `zustand.json` (`laufend.pid`), vorher im Task-Manager oder mit `Get-CimInstance Win32_Process -Filter "ProcessId=<pid>"` prüfen, dass Startzeit und Kommandozeile (`dauerlauf-starter.mjs`) passen; dann `taskkill /PID <pid> /T /F`. Verwaiste Nachfahren (`node`/`claude` mit der Worker-Kopie als Arbeitsverzeichnis) gesondert beenden (siehe 7.2 Nr. 4).
    3. Ist der Prozess weg, erkennt der nächste Zyklus das selbst ("lief nicht mehr") und gibt den Auftrag frei. Nur wenn der Eintrag trotzdem hängt: Supervisor anhalten, in `zustand.json` das Feld `laufend` auf `null` setzen (Datei vorher sichern), Supervisor wieder starten. Erst danach `AUTONOMIE-AUS` entfernen.

## 8. Aufwand, Verbesserung, Risiken

- Aufwand bis zum scharfen Probelauf: etwa 4 bis 6 PT (Fortschrittsmessung, Worker-Adapter real testen, Windows-Prozesssteuerung inklusive PID-/Prozessbaum-Behandlung, Tageslimit, Protokoll-/Statusanzeige), danach Beobachtungsphase.
- Erwartete Verbesserung: Stillstand nach Sitzungsende von bis zu 182 Min auf höchstens etwa 25 Min, solange freigegebene Pakete existieren; kein manuelles Wiederanstoßen im Regelfall.
- Risiken: Kosten ohne Limit, Fehlsteuerung durch falsche Fortschrittsmessung, ein Worker mit zu weiten Rechten, Doppelarbeit bei parallelem Hauptchat (durch Lease ausgeschlossen, aber der Hauptchat müsste dann `freigeben`/warten).

## 9. Genehmigungspflichtige Aktivierungsschritte (nicht ausgeführt)

1. Erster scharfer Lauf (`CENTRIC_AUTONOMIE=ja`) und seine Dauer. Voraussetzungen, die der Supervisor selbst erzwingt: geschützte Worker-Kopie (`--worker-kopie-einrichten`, dann `--worker-kopie`), eigenständiger Klon (kein git worktree), fester absoluter `--claude-pfad`, alle fünf Limits als Parameter, lokale `claude --help` kennt jede verwendete Option.
2. Autostart (Windows-Aufgabenplanung oder Dienst): Systemeinstellung.
3. Berechtigungsstrategie für headless Worker: Vorschlag `docs/acc45/AUTONOMIE-ALLOWLIST-VORSCHLAG.json` prüfen und gegebenenfalls installieren (keine Umgehung). `<WORKER_KOPIE>` dabei als absoluten Pfad in Regelsyntax einsetzen (`//c/...` unter Windows; ein einzelnes `/` wäre relativ zur Settings-Quelle), siehe Feld `pfadsyntax` der Vorlage mit den vor Installation zu prüfenden Punkten. Zusätzlich empfehlenswert: gh-Token des Workers nur mit PR-Rechten.
4. Konkrete Werte der Pflichtlimits (`--limit-starts-tag`, `--limit-starts-gesamt`, `--limit-laeufe-paket`, `--limit-laufzeit-min`, `--limit-wall-min-tag`) und Kostenrahmen; Vorschlag für den ersten Lauf: 2, 4, 2, 60, 120.
5. Anpassung der Cloud-Routine (Entwurf `routine-vorspann.txt` bleibt unangewendet).
6. Falls gewünscht: eigener CI-Job für den Prototyp (Workflow-Änderung).
