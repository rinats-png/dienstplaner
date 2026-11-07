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
