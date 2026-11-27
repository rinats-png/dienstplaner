# RST-2 — Kandidaten-Werkzeug `werkzeug/release-kandidat.mjs` (Nachweis und Abgrenzung)

Stand: 2026-11-27. Umfangsklasse OPTIONAL-WERKZEUG. Basis `origin/integration/release-v4` (`e6064845`). Nur synthetische
Daten. Keine Änderung an `werkzeug/release-pruefung.mjs`, an der Gate-Konfiguration und an `.github/workflows/*`.
Kein Deployment, kein VPS, kein Merge, kein Push auf geschützte Zweige.

## 1. Abgleich der Akzeptanz

| Akzeptanz (SSOT) | Umsetzung | Ergebnis |
|---|---|---|
| Trockenlauf ist Standard | Ohne Schalter nur lesend aus dem Schnitt-Commit (`git show/ls-tree/diff/log`); Test protokolliert alle Aufrufe: nur Lese-Unterbefehle, kein `gh`/`curl`, kein Push | umgesetzt |
| Vorlage der Freigabedatei, `vorlagenHashes`, G2-Belegliste, G8/G9-Listen, Übergabe | Ausgabe-JSON und (mit `--ausgabe`) fünf Dateien; Hashes aus `release-pruefung.mjs --vorlagen-hashes` (Prozessaufruf, unverändert); G8/G9 über die dort exportierten Funktionen ohne Betreiber-Annahmen („Vorschau“) | umgesetzt |
| „außerhalb des Kandidaten“ | `--ausgabe` liegt nie im Repository (Prüfung mit `realpath`) und überschreibt nie eine abweichende Datei | umgesetzt (Test) |
| rc-Zweig nur mit `--anlegen` | legt **nur lokal** `release/rc-<id>` auf dem Schnitt-Commit an, ohne Checkout | **Teil**: siehe Abschnitt 4 |
| ändert nie einen bestehenden Kandidaten | Abbruch bei lokalem Zweig auf anderem Commit, Zweig auf dem Remote (`git ls-remote`, lesend), nicht lesbarem Remote, vergebener Release-ID; gleicher Commit: „nichts geändert“ | umgesetzt (Tests) |
| zweiter Lauf byte-gleich | keine Uhrzeit, keine Hosts; alle Listen sortiert und begrenzt | umgesetzt (Test, Ausgabe und Dateien) |
| kein Netzaufruf außer GET, kein Bildbau, kein Deploy | siehe oben; `ls-remote` nur bei `--anlegen` | umgesetzt |
| fail-closed | jede nicht ermittelbare Angabe: `status: nicht-bewertbar`, Exit 1, keine Vorlage; `freigabeBereit` ist immer `false` | umgesetzt (Tests) |

## 2. Was der Trockenlauf ausgibt

Basis und Schnitt-Commit (je 40 Hex, dazu der Baum von S), Anzahl Commits, Pfadklassen (feste Reihenfolge, Zahl je Klasse),
kritische Dateien (Workflows, Deploy-Vorlagen, Paketkette; höchstens 50), betroffene Start-Schreibvorgänge W-1 bis W-9 und
Startblock, G2-Kandidatenliste (PR-Nummern aus den Betreffs; Commits der Hauptlinie ohne PR-Nummer), G8/G9-Vorschau,
Vorlagenvergleich mit der Basis, Tabelle G1 bis G10 mit „nicht bewertet“, Vorlage der Freigabedatei
(`kandidatCommit`, `digest`, `freigegebenDurch`, `datum`, `rueckweg.strategie` bleiben `null`, die Datei ist unverändert nie gültig)
und die Übergabe (nächste Schritte mit Rollen). Exit 0 heißt nur „Unterlagen erzeugt“.

## 3. Tests und Mutationen

`pruefungen/release-kandidat.test.js` (17 Tests), eingetragen in `pruefung:acc45-werkzeuge` (läuft damit in der CI). Lokal:
Windows, `TZ=UTC`, `--maxWorkers=1`, nur gezielter Lauf; eslint der Dateien ohne Befund.

Mutationen (je einzeln, danach zurückgelegt, Hash der Datei bestätigt):

| Mutation | Ergebnis |
|---|---|
| M1 `freigabeBereit` true | rot (3) |
| M2 bestehender Remote-Zweig ignoriert | rot (1) |
| M3 lokaler Zweig auf anderem Commit ignoriert | rot (1) |
| M4 Überschreibschutz der Ausgabedateien | rot (1) |
| M5 Ausgabe im Repository erlaubt | rot (1) |
| M6 Basis-Vorfahr nicht geprüft | zuerst grün (Lücke: die Listenprüfung fing den Fall mit), Test „Basis in der Liste, aber kein Vorfahr“ ergänzt, danach rot |
| M7 fehlende SSOT gilt als in Ordnung | rot (1) |
| M8 Push nach dem Anlegen | rot (1) |
| M9 Zeitstempel in der Ausgabe | rot (1) |
| M10 vergebene Release-ID zugelassen | rot (1) |
| M11 Fehler der Vorlagen-Hashes verschluckt | rot (1) |
| M12 Pfadklasse `server` falsch | rot |
| M13 Status immer „unterlagen-erzeugt“ | rot (6) |
| M14 nicht lesbarer Remote gilt als frei | rot (1) |
| M15 Anlegen trotz „nicht bewertbar“ | rot (1) |

## 4. Offen und bewusst nicht umgesetzt

- **Push des rc-Zweigs und Entwurfs-PR**: in PR #597 bewusst nicht umgesetzt (schreibende Netzaufrufe); nach der Betreiber-
  entscheidung vom 2026-11-27 als eigener, ausdrücklich aktivierter Ausführungsmodus `--ausfuehren` nachgezogen (Abschnitt 6).
  Standard und `--anlegen` bleiben ohne Push und ohne PR; die Übergabe nennt die Befehle weiterhin als Text.
- G1 (CI), G4, G6, G7, G10 sind nur online bzw. mit Digest, Nachweisen und Freigabedatei bewertbar; sie bleiben „nicht bewertet“.
- G2: Reviews und PR-Bestätigung prüft weiterhin nur `release-pruefung.mjs` online; das Werkzeug liefert die Kandidatenliste.
- Die Vorlagen-Hashes gelten für den Baum von S; nach dem Release-Merge ist Baum(M) = Baum(S) (RELEASE-PROZESS Abschnitt 1).
- Review: Opus unabhängig (SSOT-Vorgabe), noch nicht erfolgt.

## 5. Hinweise aus dem Review (C; Testlücken inzwischen geschlossen, siehe Abschnitt 6)

- Testlücken (niedrig, offen): flacher Klon (Fail-closed-Zweig ohne eigenen Test), Pfade mit Steuerzeichen, Replace-Objekte
  (`refs/replace`, nur durch `GIT_NO_REPLACE_OBJECTS` abgedeckt), Aufrufprotokoll-Test gilt nur für den Trockenlauf, nicht für `--anlegen`.
- Die Vorlagen-Hashes liefert `release-pruefung.mjs` aus dem Checkout, in dem das Werkzeug läuft (Prozessaufruf, `--wurzel` = Repository);
  gelesen werden sie aus dem Schnitt-Commit. Das Werkzeug des Checkouts ist also nicht der Kandidat; maßgeblich bleibt die Endprüfung
  auf `main`-HEAD (RELEASE-PROZESS Abschnitt 4).

## 6. Ausführungsmodus `--ausfuehren` (Folge-PR, Betreiberentscheidung 2026-11-27)

Standard bleibt der rein lesende Trockenlauf. `--ausfuehren` gilt nur zusammen mit `--anlegen` (allein: Aufruffehler, Exit 2), ist nie
Standard und wird von der Koordination nur auf ausdrücklichen Auftrag eingesetzt.

- Schritte: (a) lokaler Zweig steht auf dem Schnitt-Commit, (b) Zweig existiert auf dem Remote nicht (`ls-remote`), (c) zu diesem Zweig
  gibt es keinen PR (`gh pr list`, lesend), (d) `git push -- <remote> refs/heads/release/rc-<id>:refs/heads/release/rc-<id>`
  (ohne force), (e) `gh pr create --draft --base main --head release/rc-<id>`. Basis `main`, weil der Release-PR nach RELEASE-PROZESS
  Abschnitt 1 (Zeile M) auf `main` zielt; als Entwurf, nichts wird gemergt.
- Grenzen im Code: feste Allowlist `aufrufErlaubt` vor jedem Fremdaufruf (git/gh/node, ohne Shell, Zeitgrenze 60 s), fail-closed. Push nur
  im Ausführungsmodus und nur für genau einen Zielzweig `release/rc-<id>` (kein force, kein `+`, kein Löschen, kein `main`, `integration/*`
  oder anderer `release/*`-Zweig, Remote nur als konfigurierter Name, nie als URL); `gh` nur `pr list` (lesen) und `pr create --draft`.
  Kein Merge, kein Workflow, kein Deployment. Freigabedatei bleibt Vorlage mit `null`-Feldern, `freigabeBereit` bleibt `false`.
- Ausgabe: nur Status, Schritte und PR-Nummer; die URL aus `gh` wird nie ausgegeben (keine Hosts, keine Tokens).
- Fehler: Abbruch vor dem Push ohne jede Änderung (`abgebrochen`); scheitert die PR-Erstellung nach dem Push, meldet das Werkzeug
  `teilweise` mit Exit 1 und nimmt nichts zurück (kein Löschen des Zweigs).
- Tests (`pruefungen/release-kandidat.test.js`, 35): Allowlist-Matrix (erlaubt, außerhalb des Modus, über 40 abgelehnte Aufrufe), Aufrufprotokoll
  für Trockenlauf, `--anlegen` und Ausführungsmodus (genau Branch, PR-Abfrage, Push, PR-Erstellung), Abbruchfälle (Remote-Zweig, lokaler Zweig
  auf anderem Commit, vorhandener PR, Abfrage- und Push-Fehler, Zwischenzustand, PR ohne lesbare Nummer). Die Review-Lücken aus Abschnitt 5
  sind geschlossen: flacher Klon, Steuerzeichen im Commit-Betreff (nur Escape), Replace-Objekte, `--anlegen`-Aufrufprotokoll.
- Code-Warnung statt stillem Vertrauen: Die Ausgabe enthält `warnungen`, wenn das `release-pruefung.mjs` des Werkzeug-Checkouts fehlt
  oder von der Fassung im Schnitt abweicht (die Vorlagen-Hashes kommen vom Checkout-Werkzeug). Die Warnung blockiert nicht.
- Mutationen (Ausführungsmodus und Lücken, je einzeln, danach zurückgelegt, Dateihash bestätigt): siehe Tabelle unten.
- Nicht belegt: ein echter Lauf gegen das GitHub-Repository (im Test ist `gh` ein Ersatz, der Push geht gegen ein lokales Bare-Repository).

| Mutation (Folge-PR) | Ergebnis |
|---|---|
| N1 Allowlist `aufrufErlaubt` gibt immer „erlaubt“ | rot (2) |
| N2 Standard führt aus (Freigabe im Ruhezustand offen) | zuerst grün (Lücke: frühere Tests setzten den Zustand zurück), Prüfung des Ruhezustands als erster Test ergänzt, danach rot (1) |
| N3 geschützter Zielzweig (`main`) erlaubt | rot (1) |
| N4 `--force` im Push | rot (3) |
| N5 Merge-Aufruf nach dem PR | rot (1) |
| N6 bestehender Remote-Zweig überschrieben | rot (1) |
| N7 PR-Existenzprüfung entfällt | rot (1) |
| N8 Zwischenzustand als „vollständig“ gemeldet | rot (1) |
| N9 URL in der Ausgabe | rot (1) |
| N10 `--ausfuehren` ohne `--anlegen` erlaubt | rot (1) |
| N11 Entwurfsflag entfernt | rot (1) |
| N12 PR-Basis nicht `main` | rot (3) |
| N13 `--anlegen` allein führt aus | rot (1) |
| N14 lokaler Zweig nicht auf Schnitt-Commit geprüft | rot (1) |
| N15 flacher Klon nicht erkannt | rot (1) |
| N16 Escape der Ausgabe entfernt | rot (1) |
| N17 Replace-Objekte wirksam (`GIT_NO_REPLACE_OBJECTS` entfernt) | rot (1) (erster Anlauf wegen falschem Muster nicht angewandt, wiederholt) |
| N18 Warnung zu Checkout-Vorlagen entfernt | rot (1) |
| N19 Freigabe nach dem Lauf nicht zurückgesetzt | rot (1) |
