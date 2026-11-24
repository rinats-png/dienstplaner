# GATE-EW3 — Testplan nach der Übernahme

Der Betreiber löst die Läufe aus (Actions → *Staging-Gate* → **Run workflow**, Eingabe nur `digest`); Claude prüft nur
lesend. Voraussetzung: Patch übernommen ([README.md](README.md)) und `STAGING_GATE_AKTIV = true` für die Dauer der
Läufe (Aktivierungsentscheidung N-9, getrennt). Ohne die Variable wird der Job übersprungen (kein Lauf, kein Nachweis).

**Wichtig:** Jeder rote Lauf bleibt als Check-Run auf seinem Commit. Ein roter Lauf auf S oder M macht G1 für diesen
Kandidaten dauerhaft NO-GO (`werkzeug/release-pruefung.mjs`, G1). Rote Erwartungen (WT-3, WT-4) **nur** auf
Wegwerf-Branches.

| Nr | Lauf (Ref, Eingabe) | Erwartung | Claude prüft (lesend) |
|---|---|---|---|
| WT-0 | keiner: CI des Übernahme-PR | `pruefung:staging-o2` grün (Test im Modus „übernommen“), `workflow-haertung`, `actions-pins` grün | `gh api repos/<repo>/commits/<sha>/check-runs` |
| WT-1 | Ref = Commit, auf dem das Testbild gebaut wurde (Label = dieser Commit), Digest des Testbilds | grün; Nachweis `bindung: gleich`, `commit` = `laufCommit`, `baum` = Baum des Commits, S1–S6 `ok`, `ergebnis: success` | `gh run view <id>`; Artefakt `staging-nachweis` laden, Felder und `skriptSha256` nachrechnen |
| WT-2 | Ref = `release/rc-<id>` (Schnitt S), Digest des Bilds von M (Merge-Commit auf `main`, 2. Elter S) | grün; `bindung: schnitt`, `commit` = M, `laufCommit` = S, `baum` = Baum(M) = Baum(S) | wie WT-1, zusätzlich `git rev-list --parents -n 1 M`, `git rev-parse M^{tree} S^{tree}`; mit #535: Endprüfung G6 E6/E7 |
| WT-3 | Wegwerf-Branch mit anderem Baum, derselbe Digest | rot im Schritt „Bild per Digest ziehen“ (Bindung B-3) | Fehlertext `weder der geprüfte Quellstand … noch ein Merge-Commit` |
| WT-4 | Wegwerf-Branch, Eingabe `latest` (kein Digest) | rot im Schritt „Eingabe prüfen“ | Fehlertext `kein Digest` |
| WT-5 | Ref = `main`, solange `main` = M, Digest des Bilds von M | grün; `bindung: gleich` | wie WT-1 |

## Woher das Testbild für WT-1 kommt

Der Staging-Gate baut kein Bild und veröffentlicht keins. Ein Testbild entsteht nur über den Bau-Job von `deploy.yml`
(Bildveröffentlichung nach GHCR) — das ist eine eigene Betreiberentscheidung und nicht Teil dieses Patches. Ohne
eigenes Testbild ist WT-2 auf dem echten Kandidaten der erste Lauf.

## Was ein grüner Lauf belegt und was nicht

- Belegt: S1–S6 am **exakten** Digest (kein lokal gebautes Bild), Migration von einem Bestand der 274bfa0-Anwendungs-
  schicht, Widerruf über die echte API, Neustart- und Rücksprungfestigkeit beider Bücher, W1–W11 mit echtem restic,
  Bindung Digest ↔ Commit ↔ Baum.
- Nicht belegt (bleibt Pflicht, Gate-Entwurf A.10/F1): K4 (G5), Restore-Probe (G6), Live-Abnahme, die Nachholprobe
  auf dem VPS. Die Probe S1 nutzt einen synthetischen Bestand, geschrieben mit den Bibliotheken von 274bfa0 — kein
  Abbild der echten Produktionsablage.

## Abbruch

Ein roter WT-1/WT-2 ist kein Sicherheitsvorfall: nichts wird ausgeliefert. Ursache aus dem Log (`::error::`) lesen,
Befund an Claude; bei WT-2 neuer Lauf am selben Digest (mit B-3 auf `release/rc-<id>` jederzeit wiederholbar).
