# Entscheidungsvorlage B-Z3: Zuschlagsstunden ohne Pausenabzug

Stand: 2026-11-20, Basis `integration/release-v4` Kopf `53ed554e`. Registriert als **P2-23** in
[`ENTSCHEIDUNGSLISTE.md`](ENTSCHEIDUNGSLISTE.md) (Priorität 2, Kategorie C: Abrechnung).
**Nur Dokumentation. Kein Produktcode geändert, keine Daten geändert, keine Migration.**

## 1. Befund

Belegt in der lokalen E2E-Abnahme (`LOKALE-E2E-ABNAHME-2026-11-20.md`, Befund B-Z3; Spec
`e2e/hauptfunktionen-zeit-abrechnung.spec.mjs` Z3/Z4):

- Geplanter Frühdienst am Sonntag, 06:00–14:00, Pause der Dienstart 30 min.
- „Gearbeitet“ (Stundenkonto, Ist): **7,5 h** (Anwesenheit minus Pause).
- Zuschlagsstunden „Sonntag“: **8,0 h** (Anwesenheit ohne Pausenabzug).

Ursache: Die Zuschlagsrechnung zerlegt die **Anwesenheitsspanne** `start`–`ende` der Dienstart in Kalendertage und
ordnet die Minuten Nacht/Sonntag/Feiertag/Samstag zu. Das Feld `pause` wird dort nicht gelesen. Die Pause ist im
Datenmodell nicht verortet (nur eine Dauer, keine Lage im Dienst).

Fachlicher Hintergrund (keine Rechtsberatung, Prüfung durch die Fachseite nötig): Zuschlagsfähig ist nach üblicher
Lesart nur tatsächlich geleistete Arbeit (§ 3b EStG für die Steuerfreiheit; Tarifverträge, z. B. § 8 TVöD, knüpfen an
„Arbeit“ in der Zeit an). Eine Pause ist keine Arbeitszeit (§ 4 ArbZG). Ob die Pause abgezogen werden muss, hängt
auch davon ab, **wann** sie lag (in der Sonntags- oder Nachtzeit oder nicht). Das kennt CENTRIC heute nicht.

## 2. Betroffene Stellen (Datei:Zeile, Kopf `53ed554e`)

| Stelle | Rolle |
|---|---|
| `server/lib/isteinfrieren.mjs:266` `tagesanteile` | Zerlegt `start`–`ende` in Minuten je Kalendertag; liest `pause` nicht. |
| `server/lib/isteinfrieren.mjs:310` `zuschlagTagAddieren` | Addiert Nacht (`nachtAnteilAm`) und Sonntag/Feiertag/Samstag (aus `tagesanteile`) ohne Pause. |
| `server/lib/isteinfrieren.mjs:220` `nachtAnteilAm` → `server/lib/schutzpruefung.mjs:97` `nachtAnteil` | Nachtstunden ebenfalls aus der Anwesenheitsspanne, ohne Pause. Gleiche Frage für den Nachtzuschlag. |
| `server/lib/isteinfrieren.mjs:472` (`personMonat`) und `:477` (Freeze `z`) | Beim Monatsabschluss werden die Zuschlagsstunden eingefroren (`z: [Nacht, Sonntag, Feiertag, Samstag]`). |
| `server/lib/isteinfrieren.mjs:300` `zuschlagStand` | Wählt je Monat den Rechenstand (offen: heutiger; abgeschlossen: der des Abschlusses). |
| `server/lib/isteinfrieren.mjs:766` `datevAusFreeze` (Zeile `:786` liest `z`) | Lohnausgabe (DATEV) eines abgeschlossenen Monats nur aus dem Freeze. |
| `server/lib/lohnrechnung.mjs:38` `RECHEN_STAND = 3` | Fassung der Rechenregeln; eine Regeländerung hebt den Stand (Muster ZEIT-E / E6). |
| `src/lib/fachlogik.js:1400` `zuschlagStunden` (Aufruf `:1417`, Freeze `:1430`) | Oberfläche, offene Monate live, abgeschlossene aus dem Freeze. |
| `src/lib/fachlogik.js:1444` `zuschlagWert` | Bewertung in Ausgleichsstunden (Prozent der Regel). |
| `src/ansichten/abrechnungsdaten.jsx:26`, `src/app/aktionen/ausgaben.js:131`, `src/lib/fachlogik.js:3249` | Anzeige „Abrechnungsdaten“, Export (CSV), weitere Ausgabe. |
| `server/lib/engine/plan.mjs:159` | Liest Nachtstunden eines abgeschlossenen Monats aus dem Freeze (`z[0]`). |
| `server/lib/istdaten.mjs:243` `istZeitFuer` (Pause `:255`, `:280`) | Ist-Zeit: hier wird die Pause abgezogen (Vergleichsmaßstab „Gearbeitet“). |
| `src/pruefung.jsx:1608` `tagesanteile`, `:1619` `zuschlagStunden` | Kopie in der Selbstprüfung (Referenzrechnung), ebenfalls ohne Pause; müsste bei B/C mitgezogen werden. |

Tests, die das heutige Verhalten festhalten: `pruefungen/zeit-e-zuschlaege-dst.test.js` (`pause: 0` in den Fällen, also
neutral), `pruefungen/monatsabschluss-nachtrag.test.js`, `e2e/hauptfunktionen-zeit-abrechnung.spec.mjs:200` (Z3, „8,0“)
und `:234` (Z4, CSV „8,0“), beide als „nach fachlicher Klärung ggf. umkehren“ markiert.

Abgrenzung (nicht Teil dieser Frage, nur zur Einordnung): Die Zuschläge rechnen mit den **geplanten** Zeiten der
Dienstart, nicht mit gestempelten Zeiten. Das ist eine eigene Frage und bleibt unverändert.

## 3. Optionen

**A — So lassen (Anwesenheit ohne Pausenabzug), kennzeichnen.**
Rechnung unverändert. In „Abrechnungsdaten“, Export und Lohnausgabe ein Hinweis: „Zuschlagsstunden ohne Pausenabzug
(Lage der Pause nicht erfasst)“. Kein neuer Rechenstand.
Folge: Zuschläge können zu hoch sein (im Beispiel 0,5 h Sonntag je Dienst). Die Lohnstelle muss selbst kürzen.

**B — Pause anteilig abziehen (neuer Rechenstand 4, nur offene Monate).**
Die Pause der Dienstart (bzw. die erfasste Pause des Tages) wird im Verhältnis der Anteile auf die Kalendertage und
auf Nacht/Nicht-Nacht verteilt: Zuschlagsminuten = Anteilsminuten × (Anwesenheit − Pause) / Anwesenheit.
Beispiel: 06:00–14:00, 30 min Pause, ganz Sonntag → 7,5 h Sonntag. Nachtdienst Sa 22:00–So 06:00, 30 min Pause:
Sa 2 h, So 6 h → Sa 1,875 h, So 5,625 h.
Folge: Summe der Zuschlagsanteile = gearbeitete Zeit; keine Annahme über die Lage der Pause nötig. Kann in Einzelfällen
von der wirklichen Lage abweichen (Pause lag z. B. ganz außerhalb der Nacht).

**C — Pause verorten (Lage im Dienst erfassen) und genau abziehen.**
Neues Feld „Pausenbeginn“ an Dienstart und Ist-Zeit; Zuschlagsminuten ohne die Pausenminuten an ihrer Lage. Ohne Lage
Rückfall auf B (oder auf A, je Entscheidung).
Folge: genau, aber neues Datenfeld (Gestalt, Schreibwege, Stempeluhr, Import, Freeze-Schema) und neue Eingabe in der
Oberfläche. Größter Aufwand, eigener Review.

**Empfehlung: B** (neuer Rechenstand 4, nur offene Monate), vorher die Fachseite fragen, ob der anteilige Abzug für
die eingesetzten Tarifwerke vertretbar ist. C nur, wenn die Fachseite die genaue Lage verlangt. Bis zur Entscheidung
gilt A **ohne** Kennzeichnung (gebautes Verhalten); die Kennzeichnung aus A kann vorab als eigener kleiner PR kommen.

## 4. Auswirkung auf bereits abgerechnete Zeiträume

- **Abgeschlossene Monate ändern sich nicht** — bei keiner Option. Ihre Zuschläge stehen im Freeze (`z`, Schema ≥ 2)
  und die Lohnausgabe liest nur den Freeze (`datevAusFreeze`). Bei Schema 1 ohne `z` rechnet `zuschlagStand` mit dem
  Rechenstand des Abschlusses (`rv`), also ebenfalls ohne neue Regel. Gleiches Muster wie ZEIT-E (Betreiberentscheidung
  E6 vom 2026-11-14, bindend: „Korrektur gilt für offene Monate; abgeschlossene bleiben unverändert“).
- **Historische Korrektur** nur über den kontrollierten Revisionsweg: Monat mit Grund wiederöffnen und neu abschließen
  (WP-16/WP-16c). Der neue Abschluss friert mit dem dann gültigen Rechenstand ein; die Lohnausgabe meldet
  „rechenstand“ bzw. „Vormonat nach dem Abschluss geändert“. Ob und für welche Zeiträume Nachzahlungen bzw.
  Rückforderungen nötig sind, entscheidet die Fachseite (Lohnstelle); CENTRIC rechnet nichts still um.
- **Offene Monate** ändern sich mit B/C ab dem Einspielen: Zuschlagsstunden sinken um den Pausenanteil. Die Anzeige
  „Abrechnungsdaten“ und der Export zeigen die neuen Werte; ein schon exportierter, noch offener Monat weicht danach
  vom früheren Export ab (Hinweis in den Versionshinweisen nötig).

## 5. Migrationsbedarf

- **A:** keiner.
- **B:** keine Datenmigration. Neuer `RECHEN_STAND = 4` in `server/lib/lohnrechnung.mjs` (Kommentar „Stand 4“),
  `zuschlagStand` erkennt `rv` 4; `tagesanteile`/`zuschlagTagAddieren` bekommen ab Stand 4 die Pause; die Kopie in
  `src/pruefung.jsx` zieht nach. Freeze-Schema bleibt 3 (nur `rv` steigt).
- **C:** Schemaänderung: neues Feld an Dienstart und Ist-Zeit (Gestalt `server/lib/gestalt.mjs`, Schreibwege,
  Teilweg-Feldliste, Import, Stempeluhr), Freeze-Kopie der Dienstart (`dienstKopie`) trägt es mit. Kein Rückschreiben
  in Altbestände; ohne Feld gilt der Rückfall. Eigener Review und Erkennungslauf auf einer Sicherungskopie (wie viele
  Dienstarten haben eine Pause > 0).

## 6. Testfälle (für B; bei C zusätzlich mit Pausenlage)

| Nr. | Fall | Erwartet (B) |
|---|---|---|
| T1 | Sonntag 06:00–14:00, Pause 30 | Sonntag 7,5 h; Gearbeitet 7,5 h (heute 8,0 / 7,5) |
| T2 | Sonntag 06:00–14:00, Pause 0 | Sonntag 8,0 h (unverändert) |
| T3 | Sa 22:00–So 06:00, Pause 30, Nachtfenster 23–6 | Sa 1,875 h, So 5,625 h; Nacht 7 h × 7,5/8 = 6,5625 h |
| T4 | Feiertag auf Werktag, 14:00–22:00, Pause 30 | Feiertag 7,5 h |
| T5 | Umstellungsnacht 24./25.10.2026 (Herbst), Sa 22:00–So 06:00, Pause 30 | heute Sa 2 h, So 7 h (9 h wirkliche Dauer); mit B Sa 2 × 8,5/9 ≈ 1,89 h, So 7 × 8,5/9 ≈ 6,61 h, Summe 8,5 h (Rechenstand 4 setzt auf ZEIT-E auf) |
| T6 | Abgeschlossener Monat (Freeze `rv` 3, `z` vorhanden) | Werte unverändert aus dem Freeze; Lohnausgabe unverändert |
| T7 | Abgeschlossener Altmonat Schema 1 ohne `z` | Rechenstand des Abschlusses, unverändert |
| T8 | Wiederöffnen und neu abschließen nach Einspielen | neuer Freeze mit `rv` 4 und gekürzten Zuschlägen; Lohnausgabe meldet den Rechenstandwechsel |
| T9 | Erfasste Pause des Tages abweichend von der Dienstart (z. B. 45 min) | Abzug mit der erfassten Pause (wie `istZeitFuer`), nicht mit der Pause der Dienstart |
| T10 | Pause ≥ Anwesenheit (gekennzeichneter Prüffall) | Zuschläge 0, Prüffall bleibt sichtbar |
| T11 | Selbstprüfung `src/pruefung.jsx` | Referenzrechnung liefert dieselben Werte wie `src/lib/fachlogik.js` |
| T12 | E2E Z3/Z4 | „8,0“ wird „7,5“ (Browser und CSV); Gegenprobe a2 unverändert |

## 7. Was nach der Entscheidung zu tun ist

- A: Hinweistext in Abrechnungsdaten/Export/Lohnausgabe (eigener PR), E2E Z3/Z4 bleiben bei 8,0 mit Verweis auf P2-23.
- B: Code-PR mit Rechenstand 4 und T1–T12; Versionshinweis an die Betriebe; Z3/Z4 umkehren.
- C: Spezifikation des Feldes, Erkennungslauf, dann Code-PR; bis dahin B oder A als Rückfall festlegen.
