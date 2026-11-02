# WP-04 Nachweis — Sicherung außer Haus, Wiederherstellungsprobe, Alarm

Stand: 2026-11-02 · Branch `acc45/infra/wp04-backup` (Basis `feature/geo-zeiterfassung` @ `a379095`) · kein VPS-Zugriff, kein echtes Speicherziel

## CI-Lauf

Workflow „Betrieb Sicherung“ (`.github/workflows/betrieb-sicherung.yml`), Run **41484177323**, Commit `226176a`: **success** (1 min 48 s).
Umgebung: ubuntu-24.04, restic 0.18.1 (gepinnt, SHA-256 geprüft), App-Bild lokal gebaut (`docker/build-push-action`, `load: true`), aufgerufen per Bild-ID `sha256:c08e23a7…`.
Testdaten: über die Anwendungsschicht im Bild (`server/lib`), 36 Dateien: 3 Betriebe (Kern, Scherben, Stände), 4 Konten, `token:`/`tokencode:`, 2 `sk:` + 3 `t:`, 5 Spureinträge, Klasse C (takt, accountsitzungen).

| Probe | Ergebnis |
|---|---|
| Shellcheck (`-x`, alle Skripte), `bash -n`, `node --check`, `py_compile` | bestanden |
| T1 Konfigurationsdatei Modus 644 | abgelehnt, Exit 78 |
| T2 Sicherung 1 | 27 Dateien, 11 077 Bytes gesichert, geprüft, Snapshot angelegt; Start- und Erfolgs-Ping angekommen |
| Klassen | Klasse C und `t:`/`token:`/`tokencode:` nicht in der Sicherung (Werkzeug: „bewusst ausgelassen“) |
| T3 Aufbewahrung 7/4/12 | 40 künstliche Tages-Snapshots (`restic backup --time`, keine Uhrmanipulation) + 2 echte → **42 → 11 behalten**, Menge identisch mit unabhängiger Nachrechnung (`ci/aufbewahrung-erwartet.py`); ältere Sicherung desselben Tages entfernt |
| T4 lokale Kopien | nach 3 Läufen genau 2 (`LOKAL_BEHALTEN=2`), die neuesten |
| T5 Wiederherstellungsprobe (neuester Snapshot) | **29 gleich, 0 abweichend, 0 fehlend, 0 überzählig**; Pfeffer-Gegenprobe bestanden; Probe-Container ohne Netz **healthy**; **3/3 Bestände lesbar**, 4 Konten; Container und Arbeitsordner entfernt; Probe-Pings (Start, Erfolg) angekommen |
| T6 Probe mit `--snapshot <Kurz-ID>` | bestanden |
| T7 **Fehlalarm-Probe**: falsches Repository-Passwort | Exit 12 (restic „wrong password“), Schritt `repository-zugang`, **Fail-Ping angekommen**, `status.json` `ergebnis=fehler`, kein Snapshot angelegt |
| T8 Probe mit fremdem Pfeffer | Werkzeug lehnt ab („CENTRIC_PFEFFER fehlt oder ist ein anderer“), Fail-Ping der Probe angekommen, aufgeräumt |
| T9 Sperre | zweiter gleichzeitiger Lauf (Sicherung und Probe) abgewiesen, Exit 75, kein Ping |
| T10 Geheimnisse | weder restic-Passwort, Pfeffer, Admin-Schlüssel noch Ping-IDs in Logs, Ausgaben oder Statusdateien |

Pings (14, IDs ersetzt): 3 × Sicherung start/erfolg, 2 × Probe start/erfolg, Sicherung start/**fail**, Probe start/**fail**.

Vorherige Läufe 41483168430, 41483508677, 41483818144 scheiterten an Testfehlern, nicht an den Skripten: Shellcheck-Hinweis für die trap-Funktion (ältere Shellcheck-Fassung), Klasse-C-Prüfung auf leere Verzeichnisse statt Dateien, T6 mit dem Snapshot von Sicherung 2, den Sicherung 3 desselben Tages korrekt per Aufbewahrung entfernt hatte.

## Lokal (Windows, ohne Docker/restic)

`bash -n` und shellcheck 0.11 (pip `shellcheck-py`) für alle Skripte; `node --check` für die .mjs; `py_compile`; Funktionsprobe `hilfen/abgleich.mjs` gegen eine mit `ablage-sicherung.mjs` erzeugte und wiederhergestellte Mini-Ablage (gleich → Exit 0; eine Datei verändert → `abweichend: 1`, Exit 1); Nachrechnung der Aufbewahrung an Beispieldaten.

## Nicht nachgewiesen (braucht VPS und deine Entscheidungen)

- Lauf gegen das echte Speicherziel (sftp/S3), echter Totmannschalter, Cron auf dem VPS, Produktionsbild per Repo-Digest (CI nutzt die Bild-ID; beide Formen werden akzeptiert).
- Laut Plan: Probelauf in ein **Test**-Repository auf dem VPS → Wiederherstellungsprobe → Fehlalarm-Probe → erst dann produktiv.
