# WP-14c — Folgebefunde F2, F4–F8 (WP-14b-Delta-Review)

Basis 46dd93b, Branch `feature/wp16c-stempelkette`. Prüfung: `pruefungen/wp14c-folgebefunde.test.js` (14 Tests, davon 10 ohne die Änderung rot;
die vier übrigen sind Festnagelungen/Kontrollen, die vorher und nachher grün sind).

| Befund | Änderung | Beleg |
|---|---|---|
| **F2** Pause ≥ Anwesenheit zählte 0 h als bestätigt | `stempeln` (daten.mjs): wirksame Pause (angegeben, sonst Dienstart) erreicht die Anwesenheit ⇒ Erfassung `bestaetigt:false`, Grund `PAUSE_ZU_LANG`, Markierung; `zurPruefung`/`bestaetigungsGrund`/`nurKorrekturGrund` (istdaten.mjs) kennen den Fall; „Bestätigen“ wie gestempelt bleibt gesperrt (Korrektur mit denselben Zeiten ohne neue Pause ⇒ 422, `pauseZuLang`). Altdaten mit negativem Ist: `istZeitFuer` bleibt bei 0 h (bestehende Prüfung unverändert), setzt aber `zurPruefung`/`pauseUeberAnwesenheit` ⇒ Konto/Auswertung/Freeze (`p:1`) kennzeichnen es. | Tests F2 (HTTP: Stempeln, Korrektur Leitung 422/200, Mitarbeiter 403; Altdaten; Kontrolle 06:40/30 min unverändert bestätigt) |
| **F4** ZEITUMSTELLUNG mit 1 Minute Verschiebung umgehbar | `zeitumstellungSperre(alt, start, ende, stempel, datum)`: die Uhrzeiten müssen zur gemessenen Dauer (startAm/endeAm) passen (≤ `UHR_ABWEICHUNG_MINUTEN`); gilt für Direktkorrektur, Antrag, Genehmigung. Ohne Zeitpunkte (Altstempel) gilt weiter nur die Sperre gegen dieselben Uhrzeiten (sonst gäbe es keinen Ausweg). Text nennt die gestempelte Dauer. | Tests F4 (lib + HTTP; Antrag; alter Antrag bei Genehmigung 422) |
| **F5** gemessene Dauer im Befund | `gemesseneDauerMin`, `dauerMinText` (istdaten.mjs); Stempelbefunde (korrekturen.jsx) zeigen „gestempelt H:MM h“ neben den Prüffällen. Grenze „Beginn 22:00 + Dauer 4:01–4:59 h“: nicht geändert (Datenmodell), Text der Sperre nennt jetzt die gestempelte Dauer, damit die Leitung den Beginn verschieben kann. | Tests F5 |
| **F6** ungeplanter 24-h-Einsatz / verwerfen | **Nicht umgesetzt — Frage** (`wp16c-fragen.md` F6). Fail-closed festgenagelt: Beginn = Ende wird ohne geplanten 24-h-Dienst nie bestätigt (422), ein DAUER_NULL-Fehlstempel bleibt Prüffall. | Test F6 |
| **F7** „überholt“ in der Oberfläche | `antragUeberholt`/`istStand` (istdaten.mjs, vom Server geteilt); korrekturantraege.jsx: „gilt bisher“ zeigt die aktuelle Ist-Zeit, Hinweis „überholt“, Genehmigen gesperrt (Ablehnen bleibt). Server 409 unverändert. | Tests F7 (Funktion + Quelltextwächter) |
| **F8** Selbstauskunft | Bereits erledigt (WP-16-Merge: `pauseZuLang(…, datum)`, `BEGINN_GLEICH_ENDE`); hier als Test festgenagelt. | Tests F8 |

## Invarianten
Stempel unveränderlich (nur neue Erfassungen/Prüffälle, Korrekturen als Ereignis), Berechtigung unverändert (Korrektur nur `staff.edit`),
Betriebsrat/Mitarbeiter sehen keine fremden Ist-Zeiten (keine neue Ausgabe), Drei-Wege-Merge unberührt, ETag-Pflicht unberührt.
Der Freeze (Monatsabschluss) schreibt nur `p:1` zusätzlich; bereits abgeschlossene Monate bleiben unverändert.

## Mount-Hinweis
Keine neue Datei; Änderungen an `src/ansichten/korrekturen.jsx`, `korrekturantraege.jsx` (chirurgisch), `src/App.jsx` (eine Zeile: `nurKorrekturGrund`), `src/stempelvorgang.js` (Text).

## Prüfläufe
wp14c 14, wp16b 3, istdaten, korrektur*, offline-stempeln, datenintegritaet (Hinweis: `datenintegritaet`/`offline-stempeln` rechnen mit der echten
Tagesgrenze — Läufe über Mitternacht sind rot, nicht wegen der Änderung).

## Nachbesserung 2026-11-19 (Branch `fix/wp14c-nachbesserung`)
Prüfung: `pruefungen/wp14c-nachbesserung.test.js` (32 Tests, mit den Review-Auflagen 36, im Skript `pruefung:wp-nachtraege`); auf dem Basisstand `e231525d` 28 rot.

| Befund | Stand vorher (Datei:Zeile auf `e231525d`) | Behebung |
|---|---|---|
| **K** Kennzeichnung „zur Prüfung“ einer BESTÄTIGTEN Ist-Zeit mit Pause ≥ Anwesenheit erreicht keine Oberfläche | `istZeitFuer` setzt `zurPruefung`/`pauseUeberAnwesenheit` (server/lib/istdaten.mjs:259-261), der Freeze schreibt `p:1` (isteinfrieren.mjs:454), `istStunden` zählt `zurPruefung` (engine/plan.mjs:147) — gelesen wird das nirgends. `pruefHinweis`/`exportWarnung`/`lohnPruefZeilen` (istdaten.mjs:106, 189, 228; fachlogik.js:3323) und `offenePunkte` (monatsabschluss.mjs:387) zählen nur unbestätigte Prüffälle. | `pauseAnwesenheitFaelle` (src/lib/fachlogik.js): bestätigte Ist-Zeiten mit `pauseUeberAnwesenheit`, Dienst wie in der Rechnung (`istTag`, im abgeschlossenen Monat der eingefrorene) — auch für Abschlüsse vor `p:1`. Sichtbar im Lohnausgabe-Blatt (`lohnPruefZeilen`, Text `PAUSE_ANWESENHEIT_TEXT`), in der Rückfrage vor Lohnausgabe- und Zuschläge-Export (`lohnWarnung`), als Band in Abrechnungsdaten und als Prüffall im Monatsabschluss. Nur Kennzeichnung: keine Stunde, kein Freeze, keine Prüfsumme ändert sich (Test). Keine Abschlusssperre (P2-12 Schritt 3, P2-6 b offen). |
| **I** istNeu beim Wiederöffnen/Korrekturbeginn falsch | `istAbweichungen` (isteinfrieren.mjs:546-560) verglich `JSON.stringify` mit Schlüsselreihenfolge und mit `p`: Altabschluss Schema 1 (`da` vorn) ⇒ jeder Personentag „geändert“ (Messbetrieb 3 Personen: 60); Abschluss vor #268 mit Pause = Anwesenheit ⇒ istNeu 1 ohne Änderung. Der Wert steht dauerhaft im Verlauf und in der Oberfläche („Ist an N Personentagen geändert“). Er ändert nie ein Ist: Wiederöffnen ist nach bestätigtem Lohnexport gesperrt (monatsabschluss.mjs:510), Korrekturbeginn verwirft den Freeze ausdrücklich als neue Revision. | Vergleich mit sortierten Schlüsseln, ohne `p` (Kennzeichnung, keine Ist-Zeit). Echte Änderungen (Erfassung, Plan, Abwesenheit) zählen weiter, auch im Schema 1; Differenztest gegen das alte Verfahren für Schema 3 (36 Änderungen) gleich. |
| **P** negative/ungültige Pause | Stempeln (daten.mjs:2311, `PAUSE_UNGUELTIG`), Selbstauskunft (zeiterfassung.mjs:166), Antrag (korrekturworkflow.mjs:70-81), Korrektur (stempelintegritaet.mjs:464, 531) prüfen 0–180 und < Anwesenheit; Offline-Sync läuft über Stempeln. Das allgemeine Speichern (PUT `/api/bestand`, Teilweg) prüfte eine Ist-Zeit eines ungestempelten Tages nicht: `pause: -30` zählte über `dauer()` (schutzpruefung.mjs:61-65) als +0,5 h in Konto, Mehrarbeit (Lohnausgabe), Bereitschaft/Ruf (Freeze `summeAusTagen`), Betriebsrat-Auswertung — ohne Kennzeichnung. Zuschläge rechnen aus der Dienstart (nicht betroffen). Pausenbeginn/-ende gibt es im Datenmodell nicht (nur Minuten). | `erfassungPauseFehler` (server/lib/gestalt.mjs), verdrahtet nach `kalendertagFehler` (daten.mjs): NEUE/GEÄNDERTE Einträge mit ungültiger Pause (wie `pauseAngabe`) oder Pause ≥ Anwesenheit (`pauseZuLang`, mit Zeitumstellung) ⇒ 422 `PAUSE_UNGUELTIG`, nichts geändert. Ohne Pausenangabe (Feld fehlt, `null`) wie bisher die Pause der Dienstart; `""` ist seit dem Folge-Commit ungültig (M1). Alteinträge byte-gleich speicherbar; ihre Behandlung ist P2-16 (nicht gebaut). |

Mutanten: unverändert-Ausnahme entfernt, `pauseZuLang` entfernt, `p` wieder verglichen, Reihenfolge wieder verglichen, Monatsfilter entfernt,
Export-Zeile entfernt, Handler-Verdrahtung entfernt — getötet. Die frühere Angabe „1 gleichwertiger Mutant“ (Filter `bestaetigt === true`) war
falsch (Review #368, N2): Er war ein Defekt (siehe unten) und ist behoben.

### Auflagen aus dem Review von #368 (Folge-Commit)
- **M1:** Eine leere Pause (`""`) galt als „keine Angabe“, `istZeitFuer` liest sie aber als 0 (Dienstart F 30 min, 06:00–14:00 ⇒ 8 h statt 7,5 h,
  still). Jetzt: neu oder geändert 422 `PAUSE_UNGUELTIG`; nur Feld fehlt/`undefined`/`null` ist „keine Angabe“. Alteinträge mit `""` bleiben
  byte-gleich speicherbar (P2-16). Kein legitimer Sender: `ZeitFormular` (korrekturen.jsx) sendet über Antrag/Korrektur mit eigener Regel
  (`""` = keine Angabe, nicht gespeichert), die Leitungsoberfläche schickt im allgemeinen Speichern keine Pause, Demobestand/Seeds ohne Erfassung.
- **N2:** `pauseAnwesenheitFaelle` filterte `bestaetigt !== true`, `istZeitFuer` rechnet mit dem Wahrheitswert (`1`, `"ja"` ⇒ 0 h und `p:1`, aber
  keine Kennzeichnung). Angeglichen auf `!e.bestaetigt`; Test, Mutant getötet.
- **N1:** Test für das Band in Abrechnungsdaten ergänzt; Mutant „Band entfernt“ getötet. Damit sind alle vier Stellen geprüft.
- Mutanten des Folge-Commits: `""`-Behandlung entfernt, Filter `bestaetigt !== true`, Band entfernt — alle drei getötet.
- **Restrisiken (nur benannt, nicht gebaut):** N3 Erfassung ohne `start`/`ende` oder mit Uhrzeit wie `8:00` überspringt `pauseZuLang`
  (gestalt.mjs), `istZeitFuer` nimmt dann die Zeiten der Dienstart: `{ende: "06:20", pause: 30}` wird angenommen und zählt 0 h — bestätigt
  über die Kennzeichnung sichtbar. N4 Im abgeschlossenen Monat liest die Kennzeichnung die gespeicherte Erfassung, nicht das eingefrorene `p`
  (gewollt wegen Abschlüssen vor #268; die Erfassung ist im abgeschlossenen Monat gesperrt). N5 Folgepunkt: Der Client zeigt 422
  `PAUSE_UNGUELTIG` als „unbekannt“ mit „Noch einmal senden“ (src/speicher.js `fehlerart`, wie der Kalendertag vor #354); über die App nicht
  erreichbar.

Offen: P2-16 (Altbestand mit ungültiger Pause), P2-6 (b) und P2-12 Schritt 3 (Abschlusssperre), Kennzeichnung in der eigenen Sicht der
Beschäftigten (Meine Schichten, Personalakte) nicht ergänzt; Dienstarten-Pause im allgemeinen Speichern weiter ungeprüft (Restrisiko).
Ein unabhängiges Review der Nachbesserung steht aus; WP-14c bleibt REVIEW.
