# WP-04 Nachweis — Sicherung außer Haus, Wiederherstellungsprobe, Alarm

Stand: 2026-11-02 · Branch `acc45/infra/wp04-backup` (Basis `feature/geo-zeiterfassung` @ `a379095`) · kein VPS-Zugriff, kein echtes Speicherziel

## CI-Lauf nach den Review-Auflagen

Workflow „Betrieb Sicherung“ (`.github/workflows/betrieb-sicherung.yml`), Run **41486794261**, Commit `b37154e`: **success**.
Umgebung: ubuntu-24.04, restic 0.18.1 (gepinnt, SHA-256 geprüft), App-Bild lokal gebaut (`docker/build-push-action`, `load: true`), aufgerufen per Bild-ID.
Testdaten: über die Anwendungsschicht im Bild (`server/lib`), 36 Dateien: 3 Betriebe (Kern, Scherben, Stände), 4 Konten, `token:`/`tokencode:`, 2 `sk:` + 3 `t:`, 5 Spureinträge, Klasse C (takt, accountsitzungen). Die Haupt-Konfiguration nutzt eine `.env` mit **Pfeffer in Anführungszeichen** (wie von Hand gepflegt) — alle Erfolgsproben laufen damit.

| Probe | Ergebnis |
|---|---|
| Shellcheck (`-x`, alle Skripte), `bash -n`, `node --check`, `py_compile` | bestanden |
| T1 Konfigurationsdatei Modus 644 | abgelehnt, Exit 78 |
| T2 Sicherung 1 | 27 Dateien, 11 077 Bytes; Start- und Erfolgs-Ping |
| Klassen | Klasse C und `t:`/`token:`/`tokencode:` nicht in der Sicherung |
| T3 Aufbewahrung 7/4/12 | 40 künstliche Tages-Snapshots (`restic backup --time`) + 2 echte → **42 → 11**, identisch mit unabhängiger Nachrechnung |
| T4 lokale Kopien | nach 3 Läufen genau 2 |
| T5 Wiederherstellungsprobe | **29 gleich, 0 abweichend, 0 fehlend, 0 überzählig**; Pfeffer-Gegenprobe; Probe-Container ohne Netz (nur Pfeffer im Env) **healthy**; **3/3 Bestände lesbar**, 4 Konten; aufgeräumt |
| T6 Probe mit `--snapshot <Kurz-ID>` | bestanden |
| T7 **Fehlalarm** (falsches Repository-Passwort) | Exit 12, Schritt `repository-zugang`, **Fail-Ping**, kein Snapshot |
| T8 Probe mit fremdem Pfeffer | abgelehnt, Fail-Ping, aufgeräumt |
| T9 Sperre | zweiter Lauf (Sicherung und Probe) abgewiesen, Exit 75, kein Ping |
| T11 Arbeitsordner im Datenpfad / = Datenpfad | Exit 78, **nichts angelegt** |
| T12 Ping-URL mit `"` | Exit 78 |
| T13 **leere Quelle** | Abbruch `plausibilitaet`, **Fail-Ping**, kein Snapshot |
| T14 **geschrumpfte Quelle** (29 → 20 Dateien, > 20 %) | Abbruch `plausibilitaet`, **Fail-Ping**, kein Snapshot |
| T15 Fehler je Schritt (Wrapper, Exit 1) | `pruefen`, `restic-backup`, `restic-forget`, `restic-check`: je Fehler, Fail-Ping, richtiger Schritt |
| T16 **hängendes restic** (Zeitgrenze 10 s) | Exit 124, Fail-Ping, Sperre frei |
| T17 **hängender Container** (Zeitgrenze 10 s) | Abbruch `sichern`, Fail-Ping |
| T18 argv / `docker inspect` während eines Laufs | 205 Kommandozeilen, 29 Container-Inspektionen: kein Passwort, Admin-Schlüssel, Ping-ID; Pfeffer in keiner Kommandozeile (im Container-Env zwangsläufig, nur er) |
| T10 Geheimnisse | nichts in Logs, Ausgaben, Statusdateien; Pfeffer-Temp-Dateien gelöscht |

Erster grüner Lauf vor dem Review: Run 41484177323 (T1–T10). Rote Läufe davor (41483168430, 41483508677, 41483818144) scheiterten an Testfehlern, nicht an den Skripten.

## Lokal (Windows, ohne Docker/restic)

`bash -n`, shellcheck 0.11 (pip `shellcheck-py`) für alle Skripte; `node --check`; `py_compile`; Funktionsprobe `hilfen/abgleich.mjs` gegen eine echte Mini-Sicherung (gleich → Exit 0; veränderte Datei → `abweichend: 1`, Exit 1); Nachrechnung der Aufbewahrung an Beispieldaten.

## Nicht nachgewiesen (braucht VPS und deine Entscheidungen)

- Lauf gegen das echte Speicherziel (sftp/S3), echter Totmannschalter, Cron auf dem VPS, Produktionsbild per Repo-Digest (CI nutzt die Bild-ID; beide Formen werden akzeptiert).
- Auf dem VPS: Probelauf in ein **Test**-Repository → Wiederherstellungsprobe → Fehlalarm-Probe → erst dann produktiv.
