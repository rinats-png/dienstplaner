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

- **Push des rc-Zweigs und Entwurfs-PR** (`--anlegen` im SSOT-Wortlaut): nicht umgesetzt. Beides sind schreibende Netzaufrufe
  (nicht GET) und widersprechen dem Satz „kein Netzaufruf außer GET“ derselben Akzeptanz; der Auftrag verbietet Pushes und
  GitHub-Schreibzugriffe durch das Werkzeug. Die Übergabe nennt die Befehle (`git push`, `gh pr create --draft`) als Text für
  Koordination bzw. Betreiber. Wird eine Ausführung durch das Werkzeug gewünscht, ist das eine eigene Entscheidung (Betreiber).
- G1 (CI), G4, G6, G7, G10 sind nur online bzw. mit Digest, Nachweisen und Freigabedatei bewertbar; sie bleiben „nicht bewertet“.
- G2: Reviews und PR-Bestätigung prüft weiterhin nur `release-pruefung.mjs` online; das Werkzeug liefert die Kandidatenliste.
- Die Vorlagen-Hashes gelten für den Baum von S; nach dem Release-Merge ist Baum(M) = Baum(S) (RELEASE-PROZESS Abschnitt 1).
- Review: Opus unabhängig (SSOT-Vorgabe), noch nicht erfolgt.
