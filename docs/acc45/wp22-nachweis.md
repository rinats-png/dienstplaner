# WP-22 — Fachprüfungen auf dem Server: Nachweis

Branch `acc45/rules/wp22-fachpruefungen-server`, nachgezogen auf `acc45/rules/wp11-regelregister` (948a4ba: U1,
Einwilligung MuSchG, M1/M2/N1, Nachprüfung 9717ddf). Stand nach Review WP-22 (B1–B4) und den Nutzerentscheidungen
vom 3. November 2026 (Planung behält die Einrichtung; lange Dienste automatisch erlaubt).

## Was umgesetzt ist

**Eine Prüflogik.** Die Prüfung einer Einteilung steht in `server/lib/fachpruefung.mjs` (`einteilungsBefunde`).
Oberfläche (`hindernisBefunde` in `src/App.jsx`, mit `personTag` und `besetzung`) und Server
(`server/lib/schutzdurchsetzung.mjs`, eigene Planrechnung aus Abweichungen, Schichtfolge, Teilzeit und Abwesenheiten)
rufen dieselbe Funktion; darin die eine Schutzprüfung `schutzEinsatz`. Das Regelwerk liegt in `server/lib/regelwerk.mjs`,
`src/regelwerk.js` reicht es weiter. Planrechnung, Nachtfenster, Nachweise und Ruhezeitstufe nimmt die Oberfläche von dort.

**Geprüfte Regeln** (Stufe und `sperrt` aus `BEFUND_KATALOG`, `server/lib/bestaetigungen.mjs`):

| Regel | Katalog | Server |
|---|---|---|
| nicht im Bestand, harte Schutzregel, keine Nacht, kein Alleindienst, Höchstzahl je Woche, gesetzliche Qualifikation, Einweisung, Ruhezeit unter 11 h | `bestand`, `schutz`, `keineNacht`, `keinAlleindienst`, `maxDiensteWoche`, `qualifikationGesetzlich`, `kompetenz`, `ruhezeitGesetz` | sperrt (403) |
| weiche Schutzregel, betriebliche Qualifikation, Ruhezeit unter der Vorgabe des Betriebs, Mindestbesetzung | `schutzWeich`, `qualifikationBetrieblich`, `ruhezeitBetrieb`, `untergrenze` | Bestätigung im selben Speichervorgang, sonst 409 |
| Dienst über zehn Stunden | `tagesgrenze` (Hinweis) | nichts — Nutzerentscheidung, § 7 ArbZG verantwortet der Betrieb |

Rufbereitschaft (`form: "ruf"`, `ruhezeitNeutral`) ist keine Arbeitszeit: kein Befund über zehn Stunden, keine
Ruhezeitprüfung zu oder von ihr. Tatsächliche Einsätze aus der Rufbereitschaft kennt die Planung nicht (Grenze).

**Nur neue Befunde, ausdrücklich und mittelbar.** Mittelbar bei Änderungen an Dienstarten, Schichtfolge, Anker,
Einheiten und Personen (neu angelegt, Zugehörigkeit, Springer, Schichtdienst, Teilzeit, Wochenstunden, Ein-/Austritt,
Status, Schutzangaben) — 120 Tage, nur Einteilungen, an denen sich etwas geändert haben kann.

**Gelöschte Abweichungen und aufgehobene Abwesenheiten (B-H5, 2026-11-19).** Wird eine Abweichung ab heute
gelöscht, gilt am Tag wieder der Dienst aus der Schichtfolge; der Server prüft ihn wie einen gesetzten (dieselben
Antworten 403/409, Partner für „kein Alleindienst“, Mindestbesetzung, Bereich der Schichtverantwortung). Ebenso die
Tage ab heute bis zum Ende des Horizonts, die eine gelöschte, verkürzte oder aufgehobene Abwesenheit wieder
dienstpflichtig macht (höchstens `ABWESENHEIT_TAGE_MAX` = 2 000 je Übermittlung, sonst Absage). Das ist eine bewusste Mengensperre
(Kategorie B), die auch ohne Befund greift: Betriebsferien von 150 Personen × 14 Tagen auf einmal aufheben ergibt
2 100 Tage und damit 403 „bitte in kleineren Schritten“. Vergangene Tage
nicht: Löschlauf und Aufbewahrung bleiben frei. Altbestände bleiben unverändert; nur neue Befunde zählen.

**Schutzangaben immer speichern (Nachprüfung 9717ddf, M2).** Ändern sich nur Mutterschutz, Einwilligung,
Geburtsdatum (oder Schwerbehinderung, Vorsorge) einer Person, wird gespeichert; bestehende widersprechende
Einteilungen kommen als Konflikt zurück und Planung und Leitung bekommen eine dringende, neutrale Mitteilung. Neue
widersprechende Einteilungen bleiben gesperrt.

**Bestätigung (Review B1).** Je Einteilung (Person, Tag, Regel) oder — für Planung, Leitung und Kundenrolle — als
Sammelbestätigung je Regel, Einheit und Zeitraum (`art: "sammel"`). Der Server zählt, wie viele Einteilungen sie deckt
(`anzahl`); sie zählt gegen die Grenzen 50/200/5000 wie ein Eintrag; der Betriebsrat sieht die gedeckte Anzahl in den
Zählwerten. Die 409 liefert `sammelVorschlag`; die Oberfläche bietet ab elf Einteilungen „Gesammelt bestätigen“ an.
Sperrende Regeln lassen sich auch gesammelt nicht bestätigen; Schutzregeln (`schutz: true` im Katalog) nur einzeln; die Einheit ist Pflicht; der gespeicherte Zeitraum schrumpft auf die tatsächlich betroffenen Tage, eine Sammelbestätigung ohne Treffer wird nicht gespeichert (Review S1); die Schichtverantwortung sammelt nicht.

**Kein Block (Review B2).** Der Server prüft in Häppchen (`fachpruefungUebermittlungAsync`) — auch den Aufbau der Planrechnung (Verzeichnisse über Abweichungen) und die Durchläufe über Abweichungen —: höchstens 15 ms am Stück,
dann `setImmediate`; nach 8 s Abbruch mit 503 und dem Hinweis, die Strukturänderung in kleineren Schritten zu speichern. Strukturänderungen sind je Raum und Betrieb auf 10 je
Minute gebremst (429). Laufzeit und längster Block werden ohne Personenbezug protokolliert. Prüfungen und kleine
Bestände nutzen die synchrone Fassung derselben Rechnung (`fachpruefungUebermittlung`).

**Dienstarten (Review B3, Nutzerentscheidung).** Anlegen, ändern, löschen: Leitung, Kundenrolle und Planung
(`org.edit` oder `pattern.edit`) — die Planung behält die Einrichtung (Assistent, Zeiten, Mindestbesetzung,
Vorlagenzeiten, Checkliste). Alle anderen Rollen weist der Server ab (403). Ein Schalter „nur org.edit“ ist nach der
Entscheidung nicht nötig.

**Schichtverantwortung und fremde Bereiche (Review B4).** Der Server kennt ihren Schreibumfang (eigene Person,
eigener Bereich am Tag). Entsteht durch ihre Änderung ein Befund außerhalb davon, sperrt sie — ohne Person, Tag,
Regel oder Kennung aus dem fremden Bereich.

## Prüfungen

| Datei | Inhalt |
|---|---|
| `pruefungen/fachpruefung-server.test.js` | Qualifikation, Ruhezeit, lange Dienste und Rufbereitschaft, Mindestbesetzung, nur neue Befunde, mittelbar, fail-closed, neutrale Texte, Dienstarten je Rolle, Sammelbestätigung (B1), fremder Bereich (B4) |
| `pruefungen/fachpruefung-server.mjs` (HTTP) | Dienstarten (Planung 200, Leitung 200, Schichtverantwortung 403), sperrend 403, langer Dienst 200, warnend 409 → mit Bestätigung 200 (Wer/Zeit vom Server), Mutterschutz bei geplantem Nachtdienst gespeichert + Mitteilung, Schichtverantwortung 409 neutral |
| `pruefungen/nachpruefung-wp11.test.js` | WP-11-Nachprüfungen in WP-22-Semantik; Laufzeit (300 Personen < 300 ms; 2000/300 gemessen); B2: Event-Loop (`perf_hooks.monitorEventLoopDelay`), längster Block ≤ 50 ms, Zeitbudget, Bremse |
| `pruefungen/rechtematrix-zeilen.test.js` | Abschnitt 2: Dienstarten — MA, BR, SV abgewiesen oder wirkungslos; PL, LT, Kunde gespeichert |
| `pruefungen/fachpruefung-server.test.js` (Block B-H5) | gelöschte Abweichung: 403 Ruhezeit, 409/200 mit Bestätigung (auch in der Form der Oberfläche), Mutterschutz neutral, vor heute 200, Mindestbesetzung, kein Alleindienst, Schichtverantwortung und fremder Bereich; Abwesenheit verkürzt/gelöscht 403, vergangen 200, Obergrenze; feste Uhr. 10 von 16 Fällen rot ohne B-H5 (grün bleiben die „bleibt 200“-Fälle, das Orakel und die Uhr) |
| `pruefungen/b-h5-teilweg.test.js` | Voll-PUT und `POST /api/bestand/teile` geben bei gelöschter Abweichung dieselbe Antwort (403, 409/200, vor heute 200); 2 von 3 rot ohne B-H5 |

Rot → grün: gegen den WP-11-Stand ohne WP-22 sind die Regel-, Bestätigungs-, Datenschutz- und Rollenfälle rot
(erste Fassung: 12 von 18); die neuen Fälle zu B1–B4 sind ohne die jeweilige Änderung rot (Sammelbestätigung wird
abgewiesen, keine Async-Fassung/Bremse, fremde Kennungen in der 409). Die Testanpassungen „Planung → Leitung“ aus der
ersten Fassung sind zurückgenommen.

## Laufzeit

Strukturelle Änderung der Schichtfolge (ungünstigster Fall), warm, Minimum aus drei Läufen:

| Fall | lokal (Windows, belastet) | CI |
|---|---|---|
| 300 Personen, 121 Tage | 330–520 ms | **71,3 ms** warm, 136,9 ms kalt (20 520 Einteilungen) |
| 2 000 Personen, 300 geschützt, 20 000 Abweichungen | 1,5–2,5 s | 429,8 ms warm, 448,4 ms kalt (136 800 Einteilungen) — synchron gerechnet |
| Event-Loop bei 2 000 Personen (asynchron, wie der Server) | längster Block ≤ 50 ms | längste Verzögerung **23,7 ms**, längster Rechenblock 23 ms, gesamt 413 ms |

## Grenzen

- Posten und die Feiertagsanhebung der Mindestbesetzung rechnet nur die Oberfläche.
- Der Durchschnitt nach § 3 Satz 2 ArbZG wird nicht je Einteilung geprüft; lange Dienste sind nur ein Hinweis.
- Rufbereitschaft zählt nicht; tatsächliche Einsätze daraus kennt die Planung nicht.
- Dienste in Folge, Verfügbarkeit und Teilzeit-Wochentage bleiben Hinweise der Oberfläche.
- Aufgehobene Abwesenheiten nur 120 Tage voraus (B-H5); spätere Tage zeigt die Planprüfung.
- B-H5, Tage vor heute ausgenommen: Wer die Abweichung von **gestern** löscht, verändert damit auch die Ruhezeit zum
  Dienst von heute; das prüft der Server nicht.
- B-H5, Altbefund der Schichtfolge: Verletzt schon der Dienst aus der Schichtfolge eine Regel, geht „zurück zur
  Schichtfolge“ nicht (403). Ausweg: den Tag ausdrücklich auf „-“ oder einen anderen Dienst setzen.
- Die Oberfläche zeigt den Text einer 403 der Fachprüfung (`text`) nicht an: `src/speicher.js` wirft nur `fehler`,
  `fehlerart` macht daraus „nicht zulässig“. Folgepaket (Kategorie B), nicht Teil von B-H5.
- `/api/wiederherstellen` (nur Leitung) prüft seit P2-21 mit derselben Rechnung, sperrt aber nicht (Empfehlung B:
  Bericht mit Anzahl neuer Befunde je Regel in Antwort, Betriebs- und Serverprotokoll; ohne abgeschlossene Prüfung
  503, nichts zurückgespielt). Sperren wie beim Speichern bleibt Betreiberentscheidung (Entscheidungsliste P2-21, Option C).
- Mittelbar nur 120 Tage voraus. Ändern sich nur Vorgaben des Betriebs, prüft der Server bestehende Einteilungen nicht nach.
- Die Bremse für Strukturänderungen lebt im Speicher des einen Serverprozesses.
