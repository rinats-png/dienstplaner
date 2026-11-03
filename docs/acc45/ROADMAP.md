# ACC45 – Roadmap (Ziel 30–45 Kalendertage, Start 2026-11-02)

Aufwände: menschliches Äquivalent in Entwicklertagen (PT). Wie schnell Agenten tatsächlich sind, wird an WP-02 bis WP-04 gemessen und danach hier nachgeführt.

## Rechnung

| Größe | Wert |
|---|---|
| offener Aufwand | 162,5 PT (44 Pakete: 42 aus dem Audit + WP-43 Personaldaten-Filter + WP-44 Code-Rotation) |
| kritischer Pfad laut Graph | 48,5 PT (WP-02 → 09 → 10 → 11 → 22 → 19 → 42) |
| kritischer Pfad mit WP-19 auf 3 Stränge verteilt | ≈ 36,5 PT (dann: WP-02 → 09 → 10 → 11 → 12 → 39 → 21 → 40 → 42) |
| nötige Parallelität für 45 Tage | 162,5 PT ÷ 45 Tage ≈ 3,6 parallel voll produktive Stränge bei 1 PT/Tag je Strang; mit Integrations- und Review-Aufschlag (~25 %) ≈ **4,5–5 Stränge** |
| für 30 Tage | ≈ 7 Stränge, und der kritische Pfad (≥ 36,5 PT) müsste ≥ 1,2× beschleunigt sein |

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
