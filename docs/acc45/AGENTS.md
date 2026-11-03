# ACC45 – Agenten, Zuständigkeiten, Dateibesitz

## Tatsächlich verfügbare Mittel (geprüft 2026-11-02)

| Mittel | Verfügbar | Einsatz |
|---|---|---|
| Subagents (Agent-Werkzeug) mit `isolation: worktree` | ja | je Paket ein Agent in eigenem Git-Worktree und Branch, im Hintergrund |
| Workflow-Orchestrierung (viele Agenten per Skript) | ja, nur auf ausdrücklichen Wunsch | nicht genutzt (Kosten); Agenten einzeln gesteuert |
| Parallele Sitzungen / Agent Teams | nicht nötig | – |
| GitHub Actions | ja (öffentliches Repo) | volle Regression, Container-HTTP-Prüfungen, Betriebstests |
| Lokaler Rechner | 4 logische Kerne, 11,8 GB RAM (≈ 6 GB frei) | höchstens 3 schreibende Agenten gleichzeitig; nur gezielte Tests lokal |
| VPS (Test) | nur mit Freigabe | isolierte Proben wie A2/T1 |

**Grenze:** Agenten arbeiten nur, solange eine Claude-Code-Sitzung aktiv ist. Unbeaufsichtigte Arbeit über Nacht ohne laufende Sitzung findet nicht statt.

## Rollen

| Agent | Pakete (Hauptverantwortung) |
|---|---|
| 0 – Integration (diese Sitzung) | WP-01 ✓, WP-08 ✓, WP-09, WP-34, WP-42, WP-44; Integrationsbranch `integration/centric-complete`, Konfliktauflösung, Verträge, Status |
| A – Security & Data Integrity | WP-02, WP-06, WP-23, WP-26, WP-27, WP-43 |
| B – Infrastructure & Reliability | WP-03, WP-04, WP-05, WP-28, WP-30, WP-31, WP-32, WP-41 |
| C – Rule Engine & Legal Workflows | WP-10, WP-11, WP-22 |
| D – Time Tracking, Offline & Geo | WP-07, WP-13, WP-14, WP-15, WP-16, WP-17, WP-20, WP-29 |
| E – Business Modules & Frontend | WP-18, WP-19, WP-21, WP-24, WP-25, WP-35–WP-40 |
| F – Independent QA & Review | WP-12, WP-33; unabhängiger Review jedes PRs vor Integration |

Ein Agent F prüft jede Korrektur selbst nach (Test auf altem Stand rot, auf neuem grün). Er übernimmt keine Fertigmeldung des implementierenden Agenten ungeprüft.

## Dateibesitz (Konfliktzonen: ein Schreiber zur Zeit)

| Datei/Bereich | aktueller Besitzer |
|---|---|
| `server/lib/bestand.mjs`, Schreib-/Stempelpfade in `server/funktionen/daten.mjs`, `server.mjs` (Prozess-Lock), `package.json` (scripts), `.github/workflows/pruefung.yml` | A (WP-02) |
| `deploy/compose.yml`, `deploy/*.sh`, `deploy/FREIGEGEBENE-IMAGES.md`, `.github/workflows/deploy.yml`, `.github/workflows/betrieb-deploy.yml`, `BEREITSTELLUNG.md` | B (WP-03) |
| `deploy/sicherung/**`, `.github/workflows/betrieb-sicherung.yml`, `werkzeug/ablage-sicherung.mjs`, `docs/BETRIEB-SICHERUNG.md` | B (WP-04) |
| `server/lib/rechte.mjs`, `server/lib/sicht.mjs`, `src/App.jsx` | frei bis WP-10 (dann C exklusiv) |
| `docs/acc45/**`, `werkzeug/acc45-backlog.mjs`, `werkzeug/vorpruefung.mjs`, `werkzeug/test-kurz.mjs` | 0 |

## Arbeitsvertrag je Agent

1. Branch `acc45/<bereich>/<wp>-<kurzname>` von `integration/centric-complete` (die ersten drei: von Kette B, identischer Baum).
2. Akzeptanzkriterien lesen → fehlende Tests zuerst (rot auf altem Stand) → umsetzen → gezielte Tests lokal → Push → CI auswerten.
3. Commit-Identität `rinats-png`, Trailer laut Projektregel. Kein PR, kein Merge durch Implementierungsagenten: PR und Integration macht Agent 0.
4. Keine Produktion, kein VPS ohne Freigabe, keine Secrets, keine Abschwächung von Tests, keine erfundenen Ergebnisse.
5. Bericht: Branch, Commits, Dateien, Tests vorher/nachher mit Zahlen, CI-Run, offene Punkte.

## Werkzeuge

Drei Repo-Werkzeuge beschleunigen die Arbeit, ohne neue Software, Hooks oder globale Einstellungen. Geprüft in
`pruefungen/acc45-werkzeuge.test.js` (`npm run pruefung:acc45-werkzeuge`, im CI-Gate).

**`werkzeug/acc45-backlog.mjs`**: eine Quelle bleibt das Array `P`.

| Aufruf | Wirkung |
|---|---|
| `node werkzeug/acc45-backlog.mjs` | schreibt `work-packages.json` und `DEPENDENCIES.md` (wie bisher) |
| `… bereit` | Pakete mit Status READY/BLOCKED, deren Abhängigkeiten alle INTEGRATED/VERIFIED/DONE sind. Eine Abhängigkeit auf WP-09 gilt als erfüllt: WP-09 ist nur die Reihenfolge des Livegangs, keine Code-Abhängigkeit. Aufgeführt werden auch Pakete, die aus anderen Gründen warten, etwa WP-36 auf Inhalte. |
| `… brief WP-23` | Agentenauftrag als Text: Name, Akzeptanz, Tests, Dateien, Branch, Abhängigkeiten mit Status, Standardregeln, Vorab-Checkliste |
| `… fortschritt` | Kurzstatus: Zählung, kritischer Pfad, was läuft, was bereit ist |
| `… lokal WP-23 agentId=… letzterCheckpoint=… abbruch=…` | lokale Felder. Sie stehen nur in der Datei aus `ACC45_LOKAL`, und diese muss außerhalb des Repos liegen (sonst Abbruch). Sie kommen nie ins öffentliche JSON (`schreiben` bricht ab, falls doch). `fortschritt` zeigt sie, wenn die Variable gesetzt ist. |

**`werkzeug/vorpruefung.mjs`**: vor der Abgabe eines Pakets.

    node werkzeug/vorpruefung.mjs --paket WP-23 [--basis origin/integration/centric-complete] [--ohne-lint]

- **Rückgabe 1** bei einem harten Verstoß:
  - Code geändert (`server/`, `src/`, `werkzeug/`, `deploy/`, `public/`, `server.mjs`), aber kein Test neu oder
    geändert;
  - eslint-Fehler in geänderten Dateien;
  - eine hinzugefügte Zeile mit typischem Geheimnis (privater Schlüssel, GitHub-, AWS- oder API-Token,
    Passwort-Zuweisung);
  - eine `.env` im Änderungssatz.
- **Warnung** bei Dateien außerhalb des Paketfeldes `dateien`. Das Feld ist unscharf gepflegt, deshalb nur ein Hinweis.
- Danach folgt die **Checkliste** der häufigsten Review-Befunde aus den Nachweisen, zum Abhaken:
  - fail-closed;
  - kein stiller Datenverlust;
  - Datenschutz je Rolle mit Art. 9;
  - alle Schreibwege;
  - rot vorher per Commit;
  - Laufzeit und Event-Loop;
  - Tests nicht abschwächen;
  - öffentliches Repo.
- Verglichen werden Commits seit dem Merge-Base, der Arbeitsbaum und neue, nicht ignorierte Dateien.

**`werkzeug/test-kurz.mjs`**: Testläufe mit kurzer Ausgabe.

    node werkzeug/test-kurz.mjs [--sperre] [--warten 900] [--zeilen 200] -- npx vitest run pruefungen/x.test.js

- Gibt nur Zusammenfassung und Fehlschläge aus. Endet der Befehl mit einem Fehler und passt keine Zeile, kommen die
  letzten 30 Zeilen.
- Behält den Rückgabewert genau (Signal: 128 + Nummer).
- Plattformneutral: `node` wird direkt gestartet. Unter Windows läuft alles andere über `cmd.exe` mit selbst
  gesetzten Anführungszeichen.
- `--sperre`: Über alle Worktrees läuft nur ein schwerer Lauf gleichzeitig.
  - Sperrdatei `<tmp>/centric-test-kurz.sperre` oder `TEST_KURZ_SPERRE`.
  - Gewartet wird höchstens `--warten` Sekunden.
  - Fail-safe: Läuft die Zeit ab oder klappt die Sperre nicht, läuft der Test trotzdem, mit Hinweis.
  - Die Sperre eines toten Prozesses oder eine, die älter als 2 Stunden ist, wird übernommen.
