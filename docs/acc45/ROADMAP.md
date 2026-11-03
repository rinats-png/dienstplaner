# ACC45 – Roadmap (Ziel 30–45 Kalendertage, Start 2026-11-02)

Aufwände: menschliches Äquivalent in Entwicklertagen (PT). Wie schnell Agenten tatsächlich sind, wird an WP-02 bis WP-04 gemessen und danach hier nachgeführt.

## Rechnung

Aktuelle Zahlen (erzeugt; die Tabelle vom 2026-11-02 mit 162,5 PT und 44 Paketen ist überholt):

<!-- AUTO:BEGIN rechnung -->
| Größe | Wert (erzeugt aus `work-packages.json`) |
|---|---|
| Pakete | 138 (ACC45 48, Folge 8, WP-19 14, Intelligence 37, extern 31) |
| integriert / produktiv | 29 / 2 |
| offener Entwicklungsaufwand | 405–690 PT |
| kritischer Pfad ohne Intelligence | WP-19.0 → WP-19.1 → WP-19.2 → WP-19.3 → WP-19.13 → WP-42a → WP-42 = **28–43,5 PT** |
| kritischer Pfad gemeinsam | WP-I10 → WP-I12 → WP-I13 → WP-I17 → WP-I19 → WP-I27 → WP-I37 = **77–133 PT** |
| Zeitprognosen | [`GESAMTPLAN.md`](GESAMTPLAN.md) |
<!-- AUTO:END rechnung -->

Die Phasen unten sind der Plan vom 2026-11-02 (Ziel 30–45 Kalendertage) und bleiben als Ausgangspunkt stehen; maßgeblich für Reihenfolge, Wellen und Termine ist [`GESAMTPLAN.md`](GESAMTPLAN.md).

## Einschätzung

- **30 Tage:** nicht belastbar. Kritischer Pfad, serielle Konfliktzonen (`App.jsx`, `rechte.mjs`) und externe Gates passen nicht hinein.
- **45 Tage:** nur unter vier Bedingungen erreichbar:
  1. Agenten liefern auf dem kritischen Pfad mindestens 1 PT-Äquivalent je Kalendertag; das wird an WP-02 bis 04 gemessen.
  2. Täglich aktive Sitzung und zeitnahe Freigaben.
  3. Externe Gates sind rechtzeitig eingeplant: Pentest buchen, iPhone/Tablet verfügbar, Inhalte der Rechtstexte und fachliche Kriterien je Branchenpaket vom Nutzer.
  4. Höchstens 3 schreibende Agenten lokal; mehr nur mit zusätzlicher Rechenkapazität.

## Phasen

| Tage | Inhalt | Meilenstein |
|---|---|---|
| 1–5 | WP-02, 03, 04 (laufen); WP-09 Integrationsbranch ✓ (`65c1188`), Staging-Abnahme vorbereiten; WP-33 Start; WP-43 Matrix-Abgleich | IP1 P0-Grundsicherung |
| 6–12 | WP-09 abschließen (Freigabe main/Deploy); WP-10/11 Kette A auf B (C, exklusiv in Konfliktzonen); parallel: WP-17, 06 (A/D), 30–32 (B), 23–27 (A) | IP2/IP3 |
| 13–25 | WP-06/13–16, 07 Offline (D); WP-20/29 Geo; WP-22; WP-19 in 12 Modul-PRs (E, bis 3 Stränge); WP-18; WP-39 → WP-21 | IP4, IP5 |
| 26–35 | WP-12 Gesamtabnahme, WP-35/37/38/40, Last WP-28, Migrationen, Konkurrenz-/Offline-Tests | IP6, IP7 |
| 36–42 | Release-Kandidat, isoliertes Staging, Geräte mit GPS, Restore, Pentest-Befunde | IP8 RC |
| 43–45 | Freigaben, Rollout mit R0-Plan, Smoke, Monitoring, Abschlussbericht | Livegang |

Fällt eine sicherheitskritische Prüfung durch, wird der Livegang nicht erzwungen.
