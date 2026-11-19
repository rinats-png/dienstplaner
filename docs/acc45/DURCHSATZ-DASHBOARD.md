# Durchsatz-Dashboard (erzeugt)

Erzeugt von `node werkzeug/durchsatz.mjs` aus GitHub-Daten (nur lesend), `git log` und `docs/acc45/work-packages.json`. Methode und Grenzen: [DURCHSATZ-ANALYSE.md](DURCHSATZ-ANALYSE.md).

<!-- AUTO:BEGIN durchsatz -->
Erzeugt 2026-11-13T15:26:12.861Z · Basis-Commit des Arbeitsbaums 76621eba7c46c9ec643c826b2d1067555ddf10ad · PR-Ziel `integration/release-v4` · Zeitraum „seit“ 2026-11-10.

Nur gemessene Werte; „nicht messbar“ nennt den Grund. Commits sind nicht die Kennzahl.

### Bestand

PRs gesamt (Abfrage, Limit 400): 266; mit Ziel `integration/release-v4`: 192; davon gemergt 175, offen 14.

### PRs gemergt seit 2026-11-10 (n = 112 gemergte PRs)

| Kennzahl | n | Median | Bereich |
|---|---|---|---|
| Durchlaufzeit angelegt → gemergt | 112 | 35 min | 16 – 980 |
| CI-Dauer (erster Start → letzter grüner Lauf auf dem gemergten Kopf) | 112 | 19,7 min | 13,5 – 63,1 |
| CI-Warteschlange (Lauf angelegt → gestartet, größter Wert je PR) | 112 | 0 s | 0 – 2404 |
| Commits nach Anlage (Nachbesserungs-Proxy) | 112 | 0  | 0 – 6 |
| Commits je PR | 112 | 1  | 1 – 9 |
| Fehlgeschlagene CI-Läufe je PR (Ereignis pull_request) | 112 | 0  | 0 – 4 |
| Geänderte Zeilen (+/−) | 112 | 264  | 6 – 3252 |
| Geänderte Dateien | 112 | 7  | 1 – 29 |

Klassen: feature 56, fix 0, docs 12, ssot 35, test-infra 9, review 0, merge 0. PRs mit mindestens einem fehlgeschlagenen CI-Lauf: 11. Nachbesserungsfix (Proxy: Fix-PR nennt früheren PR per #N): 0.

### Vergleichszeitraum: gemergt vor 2026-11-10 (n = 63 gemergte PRs)

| Kennzahl | n | Median | Bereich |
|---|---|---|---|
| Durchlaufzeit angelegt → gemergt | 63 | 41 min | 12 – 1159 |
| CI-Dauer (erster Start → letzter grüner Lauf auf dem gemergten Kopf) | 59 | 15,1 min | 7,7 – 30,7 |
| CI-Warteschlange (Lauf angelegt → gestartet, größter Wert je PR) | 63 | 0 s | 0 – 952 |
| Commits nach Anlage (Nachbesserungs-Proxy) | 63 | 1  | 0 – 17 |
| Commits je PR | 63 | 2  | 1 – 24 |
| Fehlgeschlagene CI-Läufe je PR (Ereignis pull_request) | 63 | 0  | 0 – 8 |
| Geänderte Zeilen (+/−) | 63 | 308  | 2 – 33057 |
| Geänderte Dateien | 63 | 6  | 1 – 78 |

Klassen: feature 44, fix 1, docs 0, ssot 11, test-infra 7, review 0, merge 0. PRs mit mindestens einem fehlgeschlagenen CI-Lauf: 29. Nachbesserungsfix (Proxy: Fix-PR nennt früheren PR per #N): 0.

### Gemergte PRs je Tag (Ziel-Zweig, alle Klassen / davon Funktion = feature+fix)

| Tag | gemergt | Funktion | gleichzeitig offen |
|---|---|---|---|
| 2026-11-07 | 12 | 11 | 16 |
| 2026-11-08 | 7 | 5 | 11 |
| 2026-11-09 | 44 | 29 | 53 |
| 2026-11-10 | 22 | 12 | 31 |
| 2026-11-11 | 17 | 7 | 27 |
| 2026-11-12 | 43 | 27 | 53 |
| 2026-11-13 | 30 | 10 | 45 |

Abstand aufeinanderfolgender Merges seit 2026-11-10: n = 111, Median 0,5 h, Bereich 0,0 – 6,5 h (Betreiber- und Agentenwartezeit sind daraus nicht trennbar).

### Vergleich 7 Tage gegen die 7 Tage davor (gleitend, gemergte PRs beider Integrationszweige)

| Kennzahl | letzte 7 Tage | 7 Tage davor |
|---|---|---|
| gemergte PRs (n) | 175 | 70 |
| davon Funktion (feature+fix) | 101 | 60 |
| Median Durchlaufzeit (h) | 0,6 | 0,1 |
| Median CI-Dauer (min), n = 171 / 70 | 17,7 | 6,0 |
| Median Commits nach Anlage | 0 | 0 |
| fehlgeschlagene CI-Läufe (Summe) | 89 | 6 |
| Nachbesserungsfix (Proxy) | 0 | 1 |

### Zusammenhang Parallelität und Konflikte (Proxy)

Konfliktauflösungen laut Git-Betreffzeilen seit 2026-11-01 (alle entfernten Zweige): Kettenvereinigung 5, Merge mit Auflösungswort 9 (Wort „Konflikt/conflict“ allgemein: 20); Commits mit Review-/Befund-/Nachbesserungs-/Nachtrag-Wort: 263 (häufigste Pakete: IMP-2 11, WP-19.0 10, IMP-1 8, WP-19 8, WP-16 7, SI-P6 6, WP-45b 5, IMP-3 4, SI-P1 4, WP-20 4). Das ist ein Proxy: GitHub-„mergeable“ ist nachträglich nicht messbar.
Gleichzeitig offene PRs je Tag: Median 31, Bereich 11 – 53 (n = 7 Tage). Pearson-Korrelation mit Konfliktauflösungen je Tag: 0,86 (n = 7 Tage; keine Kausalität).

### Review (Subagenten, nicht aus GitHub)

Review-Wartezeit, Korrekturrunden und nachträgliche Fehler: nicht messbar. Grund: unabhängige Reviews laufen über Subagenten, nicht als GitHub-Reviews; Ereignisdatei `docs/acc45/durchsatz-ereignisse.json` ist leer oder fehlt. Eintrag: `node werkzeug/durchsatz.mjs ereignis --pr N --art review-start|review-ende|korrekturrunde|fehler-nachtraeglich --notiz "…"`.

### Ausführbare, unbearbeitete Pakete (Proxy)

Definition: Status READY, IN_PROGRESS oder BLOCKED; alle Abhängigkeiten INTEGRATED/DONE; kein offener PR im Feld `pr`; Notiz/Akzeptanz nennt keine Betreiber-/Staging-/Extern-Blockade (Textmuster, Proxy).

Anzahl ausführbar: **13**; ausgeschlossen wegen offenem PR: 0; ausgeschlossen als betreiber-/staging-blockiert (Textmuster): 34.

| Paket | Status | Prio | Strang | Aufwand PT | Konfliktzonen | Titel |
|---|---|---|---|---|---|---|
| WP-40 | IN_PROGRESS | P3 | acc45 | 3–4.5 | App.jsx | Barrierefreiheit WCAG 2.2 AA |
| WP-I19 | IN_PROGRESS | P3 | intelligence | 16–28 | App.jsx | Altplan-Übernahme (F7A) |
| WP-I20 | IN_PROGRESS | P3 | intelligence | 16–28 | App.jsx | Ausfall-Vorschlag (F3) |
| WP-I22 | BLOCKED | P3 | intelligence | 8–14 | App.jsx | F1 Plan-Erklärer + F2 KI-Ausbau |
| WP-I23 | IN_PROGRESS | P3 | intelligence | 4–7 | – | F9 Hilfe-Assistent |
| WP-I24 | IN_PROGRESS | P3 | intelligence | 5–9 | App.jsx | F15 Änderungsübersicht |
| WP-I29 | IN_PROGRESS | P3 | intelligence | 18–30 | App.jsx | Batch-Infrastruktur + F4, F11, F12 |
| WP-I30 | IN_PROGRESS | P3 | intelligence | 4–8 | App.jsx | F5 Nachrichten-Werkstatt |
| WP-I31 | IN_PROGRESS | P3 | intelligence | 9–15 | – | F6 Fragen an Daten |
| WP-I35 | BLOCKED | P3 | intelligence | 15–28 | – | Kontingent, Preise, Zukauf (bedingt) |
| E-20 | READY | P2 | extern | 0.25–0.5 | – | Lasttest-Nachlauf S2/S5 (Linux, nach WP-47) |
| OPT-4 | IN_PROGRESS | P1 | acc45 | 3–5 | daten.mjs | SI-P4 Option 4: zweiter Faktor (TOTP) direkt für Benutzerkonten, Zielarchitektur |
| WP-48-GB | BLOCKED | P2 | acc45 | 1–3 | daten.mjs, App.jsx | Lesen des Plans schreibt: Dialog „Gleichzeitig bearbeitet“ beim bloßen Öffnen (Befund aus dem Review von PR #262) |

### Kernmetrik: abnahmereife, integrierte Funktionalität

(a) Gemergte PRs der Klassen feature und fix seit 2026-11-10 auf `integration/release-v4`: 101 in 7 Kalendertagen (14,4 je Kalendertag). SSOT-, Doku-, Merge-, Review- und Infrastruktur-PRs zählen nicht.
(b) Pakete mit erstmals INTEGRATED/DONE laut Git-Verlauf von work-packages.json: 89; erstmals lokalGetestet = true: 114 (INTEGRATED/DONE je Tag: 2026-11-02: 9, 2026-11-03: 21, 2026-11-04: 1, 2026-11-08: 7, 2026-11-09: 27, 2026-11-10: 9, 2026-11-11: 6, 2026-11-12: 9; lokalGetestet je Tag: 2026-11-03: 38, 2026-11-04: 1, 2026-11-07: 1, 2026-11-08: 8, 2026-11-09: 25, 2026-11-10: 11, 2026-11-11: 6, 2026-11-12: 24). Das misst den Zeitpunkt der SSOT-Buchung, nicht der Integration (Buchungsverzug).

<!-- AUTO:END durchsatz -->
