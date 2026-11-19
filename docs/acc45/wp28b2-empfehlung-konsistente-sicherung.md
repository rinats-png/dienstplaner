# Empfehlung an den Hauptorchestrator: konsistente Sicherung unter Dauerlast (Folgeaufgabe zu WP-28b/2)

Status: **Empfehlung, nichts davon ist umgesetzt.** Stand: Branch `claude/wp-28b-datensicherung-last-1yiwh0`.
Quellen: Messungen in `docs/acc45/wp28b2-nachweis.md`; Code-Recherche (lesend, `Datei:Zeile` am Stand `087fbe9` + PR-Kopf).

## 1. Problem in einem Absatz

`werkzeug/ablage-sicherung.mjs` kopiert den Dateibaum, während der Server schreibt. Das Werkzeug sieht nur Dateien, nicht
Anwendungsvorgänge. Es kann deshalb nur *feststellen*, dass sich zwischen Lesen und Prüfdurchlauf nichts verändert hat
(Größe, mtime, Inode, Dateimenge, dazu die Ruhezeit `--ruhe`). Bei etwa 17 Schreibvorgängen/s auf 3000 Dateien gelang nur
1 von 14 Läufen (ohne Ruhezeit; mit der Vorgabe-Ruhezeit 1 s schon bei 8/s keiner von 5); bei Transaktionen über zwei Dateien mit kurzer Lücke liegt ein Schnitt ohne Ruhezeit in einigen Prozent der
Fälle mitten in der Transaktion (Messung in §8 des Nachweises). Beides lässt sich **im Werkzeug nicht beheben**:
Dauerlast ohne Ruhe gibt dem Werkzeug keinen Moment, in dem die Quelle still steht.

## 2. Was der Bestand schon bietet — und was nicht (belegt)

| Mittel | Befund | Eignung als Schreib-Halt |
|---|---|---|
| `schreibstopp()` / `alleFrei(ms)` (`server/lib/raumsperre.mjs:123-138`) | nur an Verlust der Prozesssperre gekoppelt (`server.mjs:376-383`); keine Aufhebung zur Laufzeit; Clients bekommen 503 `SPEICHERN_GESTOPPT`; `/gesund` wird kritisch (`raumsperre.mjs:117-120`, `gesund.mjs:253-254`) | **ungeeignet**: terminal, weist ab statt zu halten |
| Raumsperre (`raumsperre.mjs`, 15 s Grenze, 30 s Wächter) | Kette je Raum im Speicher; deckt Bestand, Stempel, PUT, Sicherung, Wiederherstellung, Provisionierung, Löschläufe | **Einhängepunkt** `unterRaumsperre` (nach der `gestoppt`-Prüfung, ~Z. 165), deckt aber nicht alles |
| Eigene Ketten ohne Raumsperre | `accounts.mjs:112-121`, `token.mjs:191`, `provisionierung.mjs:236-245`, `registrierung.mjs:618`; zählen nicht in `offen` | **müssen mitzählen**, sonst zerreißt ein Halt Konto→Mitgliedschaft |
| Ungesperrte Einzelschreiber | `sitzungen.mjs:136` (`ta:`), `schutz.mjs:985-988` (Takt), `:1078` (Spur), `versand.mjs` | je Datei atomar; für einen exakten Schnitt über Ablage-Ebene mit anhalten |
| `ablage.mjs` | genau zwei Mutationsstellen: `schreiben` (289-306) und `delete` (373-379); Zwischendatei+rename+fsync (173-194) | Einhängepunkt für Einzelschreiber; **allein genügt er nicht** (hielte mitten in A→B) |
| `prozesssperre.mjs` | Start-Exklusivität, Puls alle 5 s `utimes`, veraltet nach 45 s | Puls darf nie angehalten werden |
| Wiederherstellen | `serverLaeuft()` (`ablage-sicherung.mjs`, ~Z. 440-445): **jede** HTTP-Antwort = läuft; im Docker-Alltag `--network none`/`--ohne-serverpruefung`, „Server steht“ ist Betriebsvorschrift (`BETRIEB-SICHERUNG.md:157`) | Halt darf `/gesund` nicht stumm machen; kein `SIGSTOP`/`docker pause` |
| Aufruf des Werkzeugs | nächtlich als Wegwerf-Container `--network none --read-only -v /data:ro` (`deploy/sicherung/gemeinsam.sh:229-233`, `sicherung-ausser-haus.sh:98-99`); bei der Auslieferung nach `compose stop` (`deploy.sh:342-349`, ruhende Ablage) | kein Weg vom Werkzeug zum Server; Kanal nötig (§4) |
| Fachliche Reparatur | Bestand: Journal + Wiederanlauf (`bestand.mjs:232-241, 514-566, 758-761`); Konto/Mitgliedschaft: Generation wird beim Lesen geprüft, Teilzustand ist fail-closed „öffnet nicht, bis neu eingeladen“ (`accounts.mjs:732-762`); Provisionierung: `wiederaufnehmen` | ein Schnitt mitten in einer Transaktion ist **absturzgleich**: die Anwendung fängt ihn fail-closed ab, aber der Zugang ist danach unbrauchbar |

## 3. Empfehlung: koordinierter, kurzer, befristeter Schreib-Halt auf Transaktionsebene

**Nicht** „Schreiben in `ablage.mjs` sperren“: Das hielte zwischen Konto und Mitgliedschaft an und erzeugte genau den
zerrissenen Stand, den man vermeiden will. Stattdessen:

1. **Neue Transaktionen nicht beginnen lassen, laufende zu Ende laufen lassen (Drain).** Ein kleines Modul
   (z. B. `server/lib/schreibhalt.mjs`) mit Zähler laufender Transaktionen und einer Frist `haltBis` (Monotonzeit).
   Eingehängt an den *Eintritten*, die es schon gibt: `unterRaumsperre` und die vier Ketten oben. Verschachtelte
   Schreibvorgänge einer zugelassenen Transaktion laufen weiter (Markierung über `AsyncLocalStorage`, Muster wie in
   `raumsperre.mjs:79, 163`). Einzelschreiber werden auf Ablage-Ebene gehalten.
2. **Halten, nicht abweisen.** Wartende Aufrufer warten (kein 503), solange die Frist klein bleibt. Frist **≤ 2 s**
   empfohlen, harte Obergrenze 10 s — deutlich unter der Raumsperren-Grenze (15 s) und dem Wächter (30 s).
3. **Selbstlösend.** Die Frist läuft immer ab; ein Prozessneustart hebt den Halt auf; kein Zustand auf der Platte, der
   über einen Neustart wirkt. Nie eine Dauersperre.
4. **Eigener Zustand, nicht `schreibstopp()`.** `/gesund` bleibt `ok` (höchstens ein Feld `halt`), der Prozesspuls
   `.prozess` läuft weiter, kein Einfrieren des Prozesses.
5. **Ablauf der Sicherung (kombiniert mit diesem PR):** Runde 1 und Nachkopieren *ohne* Halt (wie jetzt, Kopierzeit
   ~5 s für 5000 Dateien). Erst für den **letzten Durchgang** Halt anfordern: Bestätigung (Drain fertig) abwarten →
   Delta-Kopie der wenigen geänderten Dateien → Prüfdurchlauf (jetzt zwangsläufig unverändert) → Halt freigeben →
   `FERTIG`. Haltedauer damit ~0,2–0,5 s statt der gesamten Kopierzeit. Wird der Halt nicht bestätigt: Rückfall auf den
   heutigen fail-closed Weg (Ruhezeit, Code 3, Fail-Ping).
6. **Kanal Werkzeug → Server ohne Netzfreigabe.** Das Werkzeug läuft isoliert (`--network none`, `/data:ro`).
   Empfohlen: Steuerdatei im Datenverzeichnis (Punktdatei, wird von `quelleAnsehen` und der Sicherung ignoriert), vom
   **Host-Skript** gesetzt (Frist + Token), vom Server in kurzem Takt gelesen und per Bestätigungsdatei quittiert; das
   Werkzeug liest die Bestätigung nur (`:ro`). Der Server prüft Format und Obergrenze der Frist, ignoriert Unlesbares.
   Alternative (schwächer wegen verlorener Isolation): Werkzeug per `docker exec` im Server-Container plus
   Loopback-Endpunkt nach dem Muster `detailErlaubt` (`gesund.mjs:287-291`).
7. **Wiederherstellen bleibt wie es ist** (Server steht). Der Halt darf weder `serverLaeuft()` noch die
   Prozesssperre täuschen; eine Haltedatei im Datenordner wird beim Start entfernt/ignoriert.

Bewusst **nicht**: prozessübergreifende Dateisperre, neue Sperrhierarchie, Halt per `SIGSTOP`/`docker pause`,
Eingriff in die Raumsperren-Semantik. Der Halt ist Zähler + Frist und nimmt keine bestehende Sperre.

## 4. Alternativen

| Option | Wirkung | Nachteil |
|---|---|---|
| A Schreib-Halt (oben) | nachweisbar konsistent, auch bei hoher Last | Eingriff in Schreibwege des Servers, Review nötig; Einfluss auf Stempel-p95 messen |
| B Dateisystem-Snapshot (LVM, btrfs, ZFS, `fsfreeze`) | ein Zeitpunkt, absturzgleich | Dateisystem des VPS nicht geprüft; Mitten-in-Transaktion bleibt möglich (wie ein Absturz) |
| C Server kurz stoppen | wie `deploy.sh` heute | Ausfall für Nutzer, ungeeignet nachts mit Schichtbetrieb |
| D nichts ändern (dieser PR) | fail-closed, Code 3 + Fail-Ping; Erfolg nur bei Ruhe | keine Sicherung bei Dauerlast; `gesund` warnt erst nach 26 h (`gesund.mjs:143-155`) |

## 5. Abnahmekriterien für die spätere Umsetzung

- Mess-Skript mit Zwei-Datei-Transaktionen (Lücke 5 ms, ≥ 50 Schreibvorgänge/s): **0** Schnitte mitten in einer
  Transaktion in ≥ 1000 Sicherungen und **100 %** Erfolg; zum Vergleich der Stand dieses PR.
- Lasttest S5 (`werkzeug/last/lauf.mjs`): Sicherung in der Last gelingt; Stempel-p95 und 503-Anteil nicht schlechter
  als ohne Sicherung (Haltezeit sichtbar gemessen).
- Frist läuft ab, wenn die Freigabe ausbleibt; Absturz des Werkzeugs und des Servers während des Halts; kein Halt über
  einen Neustart.
- Reentranz: eine zugelassene Transaktion, die während des Halts weiterschreibt, blockiert sich nicht selbst.
- Drain-Grenze: hängende Transaktion → Halt wird nicht bestätigt, Rückfall auf Code 3.
- Wiederherstellung und Wiederherstellungsprobe unverändert grün; `/gesund` und Docker-Healthcheck bleiben `ok`.
- Hintergrundschreiber (Löschlauf, Datenschutzlauf, Zustelltakt, `server.mjs:480-567`) respektieren den Halt.

## 6. Offene Fragen an den Betreiber

- Maximal tolerierte Haltezeit für Stempel (Vorschlag 2 s)?
- Dateisystem und Snapshot-Möglichkeiten des VPS (für Option B)?
- Soll die nächtliche Sicherung bei nicht erreichbarem Halt weiter fail-closed scheitern (Empfehlung) oder den Server
  kurz stoppen (Option C)?

Aufwand: **SCHÄTZUNG** 3–5 PT inkl. Messreihe und unabhängigem Review. Abhängig von der Freigabe der Sperr-Einhängepunkte
durch den Besitzer von `server/lib/raumsperre.mjs` und der Konto-/Mitgliedschaftsketten.
