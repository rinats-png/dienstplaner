# Laptop-Integration: PR #7 und PR #6

Ziel: beide Pull Requests lokal prüfen, bevor jemand über einen Merge entscheidet. Diese Liste enthält keine Merge- und keine Deployment-Schritte. Die Entscheidung dazu fällt separat.

Stand der Vorbereitung: 22.10.2026

| PR | Branch → Ziel | Inhalt |
|---|---|---|
| #7 (Entwurf) | `claude/regelwerk-registry-basis` → `main` | Leitstand-Umbau, Kontrast-/Gestaltprüfung, Pentest-Skript, Warnen statt sperren, Dokumentation. Ersetzt #5. |
| #6 | `claude/regelwerk-registry` → `claude/regelwerk-registry-basis` | Regelwerk-Registry, Regelbaukasten, Schutzprüfung, Beschäftigungsmodelle, Abwesenheitsarten, Datenschutz |

Reihenfolge: erst #7 vollständig, dann #6. Nach einem späteren Merge von #7 wird #6 auf `main` umgestellt und die Abschnitte 3 und 4 wiederholt.

Referenzwerte der letzten Läufe:

| Stand | Vitest-Tests | „BESTANDEN"-Zeilen (Node-Läufe) | Lint |
|---|---|---|---|
| `main` + #7 (`b0ec7d9`) | 904 | 242 | 0 Fehler, 154 Warnungen |
| #6 (`d8fcf35`) | 1116 | 242 | 0 Fehler, 154 Warnungen |

Abweichungen nach unten sind ein Befund. Nach oben sind sie nur bei neuen Tests erwartbar.

---

## 1. Vorbereitung

- [ ] `git status` — sauber? Lokale, ungepushte Änderungen sichern oder stashen und notieren.
- [ ] `git branch --show-current` — aktuellen Branch notieren: ______
- [ ] `git log --oneline -3` — aktuellen Stand notieren: ______
- [ ] `git fetch origin`
- [ ] `git log --oneline origin/main -3` — hat sich `main` seit `64d08a4` bewegt? Wenn ja: notieren, die Diffs unten gegen den neuen Stand lesen.
- [ ] Node 22 (wie in der CI): `node -v` ______
- [ ] Keine Produktionszugänge, keine produktiven Daten, keine Umgebungsvariablen aus dem Betrieb in dieser Shell. Lokal mit `daten-dev` (siehe `ENTWICKLUNG.md`).

## 2. PR #7 lokal prüfen

- [ ] `git checkout claude/regelwerk-registry-basis`
- [ ] `git rev-parse --short HEAD` — erwartet `b0ec7d9`
- [ ] `npm ci` (nicht `npm install`, damit `package-lock.json` unverändert bleibt)
- [ ] `git status` — nach der Installation weiterhin sauber?
- [ ] `npm run pruefung` — vollständig grün? Vitest-Zahl, „BESTANDEN"-Zeilen und Lint-Warnungen mit den Referenzwerten vergleichen.
- [ ] `npm run pruefung:typen`
- [ ] `npm run build`
- [ ] Lokale App starten (Anleitung in `ENTWICKLUNG.md`; `npm run dev` für die Oberfläche, der Server wie dort beschrieben)
- [ ] Browser-Konsole beim Start: keine Fehler, keine 4xx/5xx auf eigene Pfade

Diff gegen `main` lesen:

- [ ] `git diff --stat origin/main...HEAD` — Größenordnung ~246 Dateien.
- [ ] `git diff --name-status origin/main...HEAD | grep -E "^(D|R)"` — `marketing/` darf nicht gelöscht sein (wurde in `77dca1b` zurückgeholt; die Bereinigung folgt in einem eigenen PR).
- [ ] Keine Änderungen an `Dockerfile`, `Caddyfile`, `docker-compose*`, `.github/workflows/deploy.yml`, `sicherheit.yml`. Erwartet ist nur `.github/workflows/pruefung.yml` (+6 Zeilen, Kontrastschritt).
- [ ] Keine Geheimnisse, keine lokalen Pfade in `src/` und `server/`.

## 3. Manueller Test PR #7

Mit lokalen Testdaten, nicht mit Kundendaten. Pro Zeile Ergebnis eintragen (ok / Befund / nicht geprüft).

**Anmeldung und Rollen**

- [ ] Anmeldung als Leitung, Planer, Schichtverantwortung, Mitarbeiter, Betriebsrat (je eigener Zugang)
- [ ] Falsche Zugangsdaten: verständliche Meldung, keine Details
- [ ] Abmelden, erneut anmelden; Sitzung bleibt nach Neuladen erhalten
- [ ] Mitarbeiter: sieht nur die eigenen Schichten und Anträge; keine Stammdaten anderer (Telefon, Anschrift, Geburtsdatum), kein Protokoll, keine Bestätigungen
- [ ] Betriebsrat: lesender Zugriff, keine Schaltflächen zum Ändern; bestätigte Abweichungen ohne Namen
- [ ] Leitung/Planer: voller Planungszugriff

**Leitstand und Navigation**

- [ ] Kopfzeile mit Bereichen, alle Bereiche erreichbar, aktive Markierung stimmt
- [ ] Tastatur: Tab-Reihenfolge, Fokus sichtbar, Befehlssuche (Combobox) mit Pfeiltasten und Enter
- [ ] Hell- und Dunkelmodus; Text lesbar, Schaltflächen erkennbar
- [ ] Handbuch, Hilfe, Tour öffnen sich

**Planansichten**

- [ ] Monatsplan: Dienste, Farben, Abwesenheiten, Unterbesetzung sichtbar
- [ ] Einen Dienst einteilen, ändern, entfernen; Neuladen zeigt dasselbe
- [ ] Mehrfacheingabe (mehrere Personen/Tage)
- [ ] Einspringen/Ersatzsuche

**Warnen statt sperren**

- [ ] Einteilung mit Ruhezeit unter 11 h: Warndialog, Stufe **Rechtsverstoß**, „gelesen" ankreuzen, Grund freiwillig, Bestätigen möglich (keine Sperre)
- [ ] Betriebliche Grenze (z. B. zu viele Dienste in Folge): Stufe **Achtung**, ein Klick
- [ ] Hinweis (z. B. ersetzt einen geplanten Dienst): nur Information
- [ ] Abbrechen: nichts wird eingeteilt
- [ ] Bestätigung erscheint im Protokoll; Leitung wird bei Rechtsverstoß benachrichtigt
- [ ] Im Plan: Markierung der bestätigten Abweichung; verschwindet, wenn der Dienst geändert wird
- [ ] Mobil: Dialog über allen Blättern, Plural „Rechtsverstöße"

**Abwesenheiten, Qualifikationen, Zeiterfassung**

- [ ] Abwesenheit eintragen (Urlaub, Krank, Freistellung), Überschneidung wird gemeldet
- [ ] Mitarbeiter stellt Urlaubsantrag; Leitung genehmigt; Stundenkonto/Urlaubskonto stimmen
- [ ] Qualifikation hinterlegen, ablaufen lassen, Sperre/Befund prüfen
- [ ] Zeiterfassung: Ein- und Ausstempeln, Korrektur, Ist-Stunden im Konto
- [ ] Stundenkonto eines Monats nachrechnen (Soll, Ist, Gutschrift bei Urlaub)

**Darstellung und Daten**

- [ ] 1440 px, 1024 px, 390 px (Telefon): kein waagerechter Überlauf, nichts abgeschnitten
- [ ] Browser-Konsole in jeder Hauptansicht: keine Fehler
- [ ] Bestehende lokale Daten laden, ändern, Seite neu laden, Änderung noch da
- [ ] Zwei Browser/Sitzungen gleichzeitig: Änderungen überschreiben sich nicht stillschweigend
- [ ] Offline/Wiederverbindung: Verhalten wie in `ENTWICKLUNG.md` beschrieben

**Ergebnis PR #7:** ______ (Befunde mit Ansicht, Rolle, Schritten notieren)

## 4. PR #6 lokal prüfen

- [ ] `git checkout claude/regelwerk-registry`
- [ ] `git rev-parse --short HEAD` — erwartet `d8fcf35` (oder neuer, dann notieren)
- [ ] `npm ci`, `git status` sauber
- [ ] `npm run pruefung` — vollständig grün? (1116 Vitest, 242 BESTANDEN)
- [ ] `npm run pruefung:typen`, `npm run build`
- [ ] `git diff --stat claude/regelwerk-registry-basis...HEAD` — 24 Dateien, nur Regelwerk, Doku, Prüfungen, `App.jsx`, `rechte.mjs`
- [ ] Keine Änderung an Rechenmodulen: `git diff claude/regelwerk-registry-basis...HEAD --stat -- src/ppugv.js src/ppprl.js src/fahrzeit.js src/tarifwerke.js` ist leer
- [ ] App starten

## 5. Manueller Test PR #6

**Registry-Anzeige**

- [ ] Prüfansicht: unter einem Befund steht die Rechtsquelle wie bisher; zusätzlich klein die Regelkennung (z. B. `AZ-RUHE-01`), Tooltip „Regel … · Regelstand 2026.09"
- [ ] Wortlaut der Quellen unverändert gegenüber `main`

**Schutzprüfung (Planprüfung und Warndialog sagen dasselbe)**

- [ ] Jugendliche (Geburtsdatum unter 18) in den Nachtdienst: Prüfansicht **und** Warndialog zeigen JArbSchG § 14 als Rechtsverstoß
- [ ] Jugendliche im Frühdienst werktags: kein Befund. Samstag/Sonntag: Achtung (§§ 16–17)
- [ ] Person mit Mutterschutz im Nachtdienst: § 5 Rechtsverstoß; am Sonntag: § 6
- [ ] Schwerbehinderte Person, Dienst über 8 h: SGB IX § 207 als Achtung (Freistellung auf Verlangen)
- [ ] **Fehlendes Geburtsdatum**, Nachtdienst: Hinweis „nicht bewertbar" (kein Verstoß); im Frühdienst nichts; in der Prüfansicht einmal je Person
- [ ] Ungültiges Geburtsdatum (z. B. 30.02.) wird wie fehlend behandelt
- [ ] Genau 18. Geburtstag am Dienstag: kein Befund; einen Tag vorher: Befund
- [ ] Aufgabe ohne Qualifikation (PflBG-Aufgabe): „nicht prüfbar" statt stillschweigend erfüllt

**Beschäftigungsmodell**

- [ ] Personalblatt: Feld „Beschäftigungsmodell", leer = „Nicht angegeben — gilt als Vollzeit/Teilzeit"
- [ ] Bestehende Personen ohne Feld laden und speichern ohne Fehler
- [ ] Minijob/Midijob: Feld „Zulässige Stunden je Monat" erscheint
- [ ] Mitarbeiter sieht das Modell anderer nicht (Antwort des Servers prüfen)

**Neue Abwesenheitsarten und Entgeltstatus**

- [ ] Leitung/Planer: neun neue Arten wählbar (Elternzeit, Pflegezeit, Familienpflegezeit, kurzzeitige Arbeitsverhinderung, Mutterschutz, Feuerwehr/THW, Personalvertretung, Berufsschule, ATZ-Freistellung); Auswahl zeigt „· Entgelt ungeklärt" und den Hinweis unter dem Feld (Personalblatt und Mehrfacheingabe)
- [ ] Mitarbeiter: diese Arten sind **nicht** wählbar (Antrag am Desktop und mobil)
- [ ] Stundenkonto: Tage mit ungeklärter Art schreiben **nichts** gut und ziehen nichts ab; Urlaub/Freistellung/Ausgleich rechnen wie vorher
- [ ] Prüfansicht: „Entgeltstatus der Abwesenheit nicht geklärt" mit Anzahl der Tage
- [ ] Andere sehen bei fremden Personen nur „abwesend", nicht die Art (Ausnahmen Urlaub/Frei)

**Datenschutz und Betriebsrat**

- [ ] Mitarbeiter-Sicht: bei Kolleginnen kein `mutterschutz`/`schwerbehindert` (Antwort `/api` im Netzwerk-Tab)
- [ ] Eigener Eintrag bleibt sichtbar
- [ ] Betriebsrat: bestätigte Abweichung mit MuSchG/SGB IX erscheint als „Individuelle Schutzregel" / `SCHUTZ-INDIVIDUELL`, ohne Regel, Fundstelle, Freitext, Namen; Jugendschutz und andere Befunde unverändert
- [ ] Leitung/Planer sehen die Bestätigung vollständig

**Bestehende Prüfungen unverändert**

- [ ] PpUGV: Pflegepersonaluntergrenze, Ergebnisse wie auf `main` (gleiche Testdaten vergleichen)
- [ ] PPP-RL: Ampel grün/gelb/rot/grau wie vorher
- [ ] Fahr-/Lenkzeit: Tages-/Wochenlenkzeit, Unterbrechung, Ruhezeit wie vorher
- [ ] Tarifvorlage anwenden (z. B. TVöD-P): gleiche Einstellungen, Quelle und Stand am Betrieb vermerkt
- [ ] Arbeitszeit: Ruhezeit, Pause, Tagesgrenze, 24-Wochen-Ausgleich, Sonntagsfrei, Ersatzruhetag, Vorsorge: Befunde wie auf `main`

**Ergebnis PR #6:** ______

## 6. Abschluss

- [ ] `git status` sauber; keine neuen Dateien durch Test und Installation
- [ ] Diff beider PRs noch einmal als Ganzes lesen
- [ ] Testergebnisse in den PR-Kommentaren festhalten (Zahlen aus Abschnitt 2 und 4, manuelle Befunde)
- [ ] Offene Befunde als Issues oder Kommentare anlegen; Follow-ups stehen in `docs/REGELWERK-REGISTRY.md`, Anhang F
- [ ] Erst danach die Merge-Entscheidung treffen — getrennt von dieser Liste

## Bekannte Eigenheiten

- Die CI führt die Prüfungen einzeln aus. `warnen` und `gestalt` laufen dort seit `c6e7204` (PR #7), die Registry-Prüfungen seit `adb2230` (PR #6). Der lokale Lauf von `npm run pruefung` bleibt trotzdem Pflicht.
- Netlify-Prüfungen am PR („Header rules", „Redirect rules", „Pages changed") sind Vorschau-Anzeigen mit dem Ergebnis „neutral", kein Produktiv-Deploy.
- `deploy.yml` läuft nur von Hand (`workflow_dispatch`); keiner dieser Schritte löst ihn aus.
