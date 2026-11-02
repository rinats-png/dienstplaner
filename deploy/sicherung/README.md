# deploy/sicherung — Sicherung außer Haus (WP-04)

| Datei | Zweck |
|---|---|
| `sicherung-ausser-haus.sh` | täglich: sichern → prüfen → restic backup → forget 7/4/12 → check 5 % → Status → Ping |
| `wiederherstellung-probe.sh` | monatlich: restore → prüfen → wiederherstellen → Manifest-Abgleich → Probe-Container ohne Netz → Status → Ping |
| `gemeinsam.sh` | Konfiguration lesen/prüfen, Sperre, Ping, Container-Aufruf |
| `hilfen/abgleich.mjs`, `hilfen/bestaende-zaehlen.mjs` | laufen im Produktionsbild (Abgleich, Bestände zählen) |
| `env.beispiel`, `crontab.beispiel` | Vorlagen |
| `ci/` | nur CI-Nachweis (`.github/workflows/betrieb-sicherung.yml`) |

Einrichtung, Schlüsselverwahrung, Ernstfall und Grenzen: [docs/BETRIEB-SICHERUNG.md](../../docs/BETRIEB-SICHERUNG.md).
