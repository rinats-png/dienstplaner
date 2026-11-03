# ACC45 – Modell-Routing (Projektregel)

Stand 2026-11-03 · gilt für **neue** Agenten ab sofort · keine globale Einstellung geändert.

## Verfügbarkeit (geprüft mit je einem Minimal-Aufruf über das Agent-Tool, Parameter `model`)

| Kurzname im Agent-Tool | tatsächliche Kennung (vom Modell selbst gemeldet) |
|---|---|
| `sonnet` | `claude-sonnet-5-5` |
| `haiku` | `claude-haiku-5-5` |
| `opus` | `claude-opus-5-5` (Kennung laut Umgebung; Koordinator läuft aktuell auf Sonnet 5.5, Subagenten bisher überwiegend Opus 5.5) |

Subagenten können pro Aufruf ein eigenes Modell bekommen (`model` im Agent-Tool). Ein laufender Agent behält sein Modell; per Nachricht fortgesetzte Agenten ebenfalls. **Umgestellt werden nur neu gestartete Agenten.** Remote Control und die Koordinator-Sitzung sind nicht betroffen.

## Regeln

| Modell | Einsatz |
|---|---|
| **Sonnet** (Standard) | normale Backend-/Frontend-Entwicklung, API-Implementierung, gewöhnliche Refactorings, Standardtests, Fehleranalyse mittlerer Komplexität, Dokumentation, Branchenmodule ohne Sicherheits-/Datenintegritätsanteil, Koordination von Routinearbeit, Nachprüfungen kleiner Änderungen |
| **Haiku** | Dateinamen-/Symbolsuche, Logzusammenfassung, einfache Recherche, klar umrissene Dokumentationsarbeiten, einfache Klassifizierung |
| **Opus** | serverseitige Sicherheitslogik, Datenintegrität/Ablage/Journal/Wiederherstellung, Nebenläufigkeit, Offline-Synchronisierung, schwierige Migrationen, schwere Integrationskonflikte, schwieriges Debugging, **unabhängige Reviews sicherheits-/datenschutzkritischer Änderungen** (Rechte, Art. 9, Auskunft, Löschen, Deploy) |

Unabhängige Reviews unkritischer Änderungen (Werkzeuge, Doku, UI ohne Rechtebezug) laufen auf Sonnet.

## Eskalation zu Opus (Sonnet → Opus)

Nur bei: mehrere fundierte Lösungsversuche gescheitert · sicherheitskritisches Risiko erkannt · Architekturentscheidung mit großer Wirkung · schwierige Datenkonflikte · Tests wiederholt unerwartet rot · Review fordert komplexe Korrektur.

Ablauf: Stand committen und pushen (Branch ist die Historie), danach **neuer Agent** mit `model: opus` und dem Auftrag „setze Branch X fort“ plus Kurzbriefing (Auftrag, Entscheidungsstand, offene Befunde). Kein Hin-und-Her ohne Begründung; Begründung in den Branch-Nachweis (`docs/acc45/wpNN-nachweis.md`).

## Laufende Arbeiten

Laufende Agenten (Stand heute) behalten ihr Modell bis zum nächsten Übergabepunkt (Merge des Pakets). Neue Pakete: Zuordnung nach Tabelle; bei Zweifel Sonnet mit Eskalationsmöglichkeit, bei Sicherheits-/Datenintegritätsbezug von Anfang an Opus.

## Kontextdisziplin (zusätzlich zum Modell)

- `node werkzeug/acc45-backlog.mjs brief WP-xx` statt Gesamtanalyse; `bereit` statt Backlog lesen.
- Tests über `werkzeug/test-kurz.mjs --sperre -- …`; Logs speichern und kompakt auswerten.
- Vorab `werkzeug/vorpruefung.mjs`.
- Vollregression nur in CI an den Integrations-/Release-Gates.

## Messung

Wirkung getrennt je Maßnahme (A Beads, B Token Optimizer, C Routing) in `docs/acc45/PERFORMANCE.md` (lokal). Ein Effekt gilt erst als belegt, wenn gleichartige Aufgaben vor/nach verglichen wurden; sonst „NOCH NICHT MESSBAR“.
