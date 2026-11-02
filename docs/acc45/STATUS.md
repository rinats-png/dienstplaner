# ACC45 – Status

Stand: 2026-11-02 (Tag 1) · Quelle der Zahlen: `docs/acc45/work-packages.json` (Generator `werkzeug/acc45-backlog.mjs`)

## Überblick

| | |
|---|---|
| Pakete gesamt | 44 (42 aus dem Audit + WP-43 Personaldaten-Filter + WP-44 Code-Rotation) |
| DONE | 2 (WP-01 H8+ produktiv, WP-08 Geheimnisprüfung) |
| IN_PROGRESS | 4 (WP-02, WP-03, WP-04 durch Agenten; WP-09 Integration) |
| READY | 3 (WP-30, WP-32, WP-33) |
| BLOCKED | 35 (Abhängigkeiten) |
| Offener Aufwand | 162,5 PT |
| Kritischer Pfad | WP-02 → WP-09 → WP-10 → WP-11 → WP-22 → WP-19 → WP-42 (48,5 PT); mit aufgeteiltem WP-19 ≈ 36,5 PT |

## Produktion

`main` = `274bfa0` (H8+). `centric-dp-web` läuft mit `sha256:0b1929273a79…` und ist gesund (verifiziert 2026-11-02). Netlify: Veröffentlichung gesperrt, Builds gestoppt.

## Integration

- `integration/centric-complete` = `main` + Kette B (Merge `65c1188`). Der Baum ist identisch mit Kette B; die 8 Konflikte wurden mit der B-Fassung aufgelöst.
- H8+-Invarianten gegen den B-Code geprüft: **kein Leck.**
  - 7 Abweichungen sind strengere B-Regeln: Fremde Ist-Zeiten ändert nur die Leitung; „ALLE“ ohne fremde Ist-Zeiten; anderer Feldname im Ist-Vermerk.
  - 1 Abweichung ist weniger streng: Die Bereichszuordnung nach Sichtfenster ist nicht tagesgenau. Nach einer Versetzung sind Beginn/Ende fremder Tage sichtbar (ohne Grund). → **WP-43**.

- CI auf `integration/centric-complete` (`e6418bd`): Prüfung grün (2146 vitest-Tests bestanden, HTTP-/Skriptprüfungen 649/649), Sicherheit grün.
- Kette-A-Konfliktmatrix auf dem Integrationsstand: #7 und #6 kollidieren weiterhin nur in `App.jsx`, `server/lib/rechte.mjs`, `package.json`, `pruefung.yml` (wie im Audit).

## Laufende Arbeitsstränge

| Strang | Paket | Branch |
|---|---|---|
| Agent A | WP-02 | `acc45/security/wp02-datenintegritaet` |
| Agent B1 | WP-03 | `acc45/infra/wp03-digest-rollback` |
| Agent B2 | WP-04 | `acc45/infra/wp04-backup` |
| Agent 0 | WP-09 | `integration/centric-complete` |

## Offene Nutzerfreigaben und -entscheidungen

1. WP-09: Merge Kette B nach `main` und Produktiv-Deploy (nach Staging-Abnahme).
2. Isolierte VPS-Proben (WP-03 Rücksprung, WP-04 Restore) – Freigabe für ein entferntes Testsystem.
3. WP-04: Speicherziel, Verwahrung des restic-Passworts, Alarmdienst.
4. WP-44 (A9): Ablauf Z1–Z7 (Nutzerhandlungen Z3/Z4).
5. Externe Gates: Pentest beauftragen, iPhone/Tablet, Rechtstext-Inhalte, fachliche Kriterien je Branchenpaket.
6. Mehr als 3 parallele Agenten: nur mit zusätzlicher Rechenkapazität (Kosten vorher).

## Release-Risiken

- Personaldaten-Filter in Produktion erst mit Kette B (bis dahin keine echten Beschäftigtendaten).
- Stempelverlust bei Konflikt (WP-02 in Arbeit).
- Kein automatisiertes Offsite-Backup (WP-04 in Arbeit).
- WP-19 (25 PT) ohne fachliche Kriterien nicht abnahmefähig.
- Echte Geräte und externer Pentest sind nicht von Agenten erbringbar.
