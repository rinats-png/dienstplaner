# CENTRIC Wiederaufnahmepunkt (Nachtbetrieb)

Stand 2026-11-09 ca. 19:40 Europe/Berlin. Ergänzt `docs/STATUS-FERTIGSTELLUNG.md` (einziger Arbeitsstand); ersetzt ihn nicht.
Nach jedem Neustart zuerst Repository-Zustand abgleichen (`git fetch`, offene PRs, Branches), erst dann Aufgaben übernehmen. Bereits integrierte Pakete nicht neu umsetzen.

## Ausführung (tatsächlich geprüft)
- Geplanter Cloud-Lauf `trig_0144efYeRu3BMqUGbXuGTDRB`, stündlich zu Minute 32, aktiv, jeder Lauf startet eine frische Sitzung. Erster Lauf 2026-11-09 18:33 UTC.
- Es läuft daneben ein lokaler Koordinator (Sitzung „CENTRIC“, CLI): `integration/release-v4` bekam am 09.11. bis 19:10 Merges. Zwei Koordinatoren lassen sich nicht zuverlässig ausschließen; geplante Läufe sind daher auf lesende Prüfung und Statuspflege beschränkt, solange kein Alleinbetrieb belegt ist.
- Hintergrundagenten und persistente Warteschlange: nicht als zuverlässig belegt, nicht angenommen. Neustart nach Wochenlimit (10.11.2026 13:00) erfolgt nur über den stündlichen Zeitplan.

## Letzter geprüfter Integrationscommit
`744a2f6` (`origin/integration/release-v4`, Merge #167 WR-1 Kontowiederherstellung Kern). Kein Merge nach `main`.

## Offene PRs auf `integration/release-v4` (CI: keine Status-Einträge gemeldet, Zustand „pending“, nicht grün belegt)
| PR | Inhalt |
|---|---|
| #166 | OPT-1 sichere Ersteinrichtung neuer Betriebe |
| #164 | SSOT-Belege: drei Ebenen |
| #139 | WP-I12c planKennzahlen ohne Fehlwerte |
| #129 | Entscheidungsregister (Doku) |
| #127 | Bereinigung Testkonten/Demo (Plan, Doku) |
| #115 | Backlog SI-P9 integriert (Doku) |

Nicht auf Release-Zweig zielend, nicht anfassen: #104 (NICHT INTEGRIEREN), #97, #96, #94, #92, #91, #18, #17, #16, #15, #7, #6.

## Aktive Agenten / Worktrees
Aus dieser Sitzung nicht einsehbar (lokaler Koordinator). Von dieser Sitzung gestartet: keine.

## Erledigt, offen, blockiert
- Erledigt/integriert: siehe `docs/STATUS-FERTIGSTELLUNG.md`, zuletzt WR-1 (#167), WP-40 (#165).
- Offen: 111 Pflichtpakete laut SSOT-Stand 04.11. (veraltet; Abgleich über PR #164).
- Blockiert: B1 Caddy Basic Auth, B2 Staging-Probe Punkt 7/9, B4/B5 Datenisolation und Backup-Wiederherstellung (alle Betreiber/VPS).
- Betreiberentscheidungen: Freigabepaket D.2/D.3 (Migration `kunde`), Produktionsfreigabe, KI-Budget.

## Nächste ausführbare Arbeitspakete
1. PRs #166/#164/#139 nach grüner CI und Review integrieren (nur durch den Koordinator mit Freigabe-Befugnis).
2. Browserprobe Rollenwähler und Demo-Sweeps 1280/375/320 (offen laut Status).
3. Opus-Review Lohnexport-Änderung (offen laut Status).
