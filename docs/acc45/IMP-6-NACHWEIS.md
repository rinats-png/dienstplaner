# IMP-6 — Schichtmodelle und Schichtzyklen (Nachweis)

Stand: 2026-11-10. Umsetzung: `server/lib/import/schichtmodelle.mjs` (Lesen, Ausrollen),
`server/lib/import/schichtpruefung.mjs` (Analyse, Prüfung, Grenze). Prüfung: `pruefungen/import-schichtmodelle-imp6.test.js`
(`npm run pruefung:import-schichtmodelle`, eigener CI-Schritt). Freigabe Punkt 5: mehrere Modelle je Betrieb, keine feste
Zykluslänge. `IMPORT_DATEI_AKTIV` bleibt `false`; der Endpunkt `/api/import` ist unverändert (siehe „Offen").

## Format (Rohinhalt aus dem Parser, IMPORT-VERTRAG.md §6)

| Tabelle | Spalten (Pflicht) | Regeln |
|---|---|---|
| Modelle | `Modell`, `Tag`, `Dienst` | Eine Zeile je Zyklustag. Tag 1 … n lückenlos, je Modell genau einmal; n = Zykluslänge (beliebig). Dienst = Kürzel einer Dienstart **des Betriebs** oder `-` (frei). Leere Zelle = Lücke (Fehler), nie „frei". Mehrere Modelle in einer Tabelle. |
| Zuordnungen | `Personalnummer`, `Modell`, `Beginn`, `Versatz` | Am Beginn arbeitet die Person Zyklustag Versatz + 1. Versatz 0 … n−1, sonst Fehler (kein Modulo). Person nur über die Personalnummer im eigenen Betrieb. Mehrere Zuordnungen je Person = Modellwechsel ab dem jeweiligen Beginn. |

Spaltenerkennung über Überschriften (genau, dann Wortanfang) oder eine mitgeschickte Zuordnung (geprüft wie im Personalimport).

## Konfliktmodell (wie `personen.mjs`)

Je Datensatz `fehler` (Feldnamen, nie Werte), `hinweise`, `konflikte: [{ art }]`, `erlaubt`, `vorgabe`.
Modellkonflikte: `dienstart-unbekannt`, `dienstart-mehrdeutig`, `dienstart-zeit-ungueltig`, `tag-fehlt`, `tag-doppelt`,
`datensatz-fehlerhaft`, `modell-leer`. Ein Modell mit Konflikt ist `pruefbar: false`, wird nicht ausgerollt und nicht geprüft.
Zuordnungskonflikte: `person-unbekannt`, `person-mehrdeutig`, `modell-unbekannt`, `modell-mit-konflikt`, `zuordnung-doppelt`,
`person-nicht-im-dienst`. Arbeitszeitbefunde setzen die Vorgabe auf `klaeren`; `uebernehmen` bleibt nur als ausdrückliche Wahl.

## Prüfung (keine eigene Regel)

Die ausgerollten Schichten werden als Einteilungen in eine Prüfkopie geschrieben; geprüft wird mit `pruefen()` aus
`server/lib/engine/befunde.mjs` und den Einstellungen und Dienstarten des Betriebs. Übernommen werden die Befundarten
`ruhezeit` (inkl. Zeitumstellung), `folge`, `nachtfolge`, `pause`, `tagesgrenze`, `ersatzruhe`, `sonntagsfrei`, `schutz`,
`einschraenkung`, `istdaten`. Zwei Ebenen: je Modell eine neutrale volljährige Prüfperson über zwei volle Zyklen ab `von`
(Verstöße über das Zyklusende), je Zuordnung die Person mit ihren Merkmalen über `von` … `bis`. Nachtschichten werden mit
`fenster`/`uhrversatz`/`dauerAm` gelegt (Ende am Folgetag, wirkliche Dauer bei Zeitumstellung).

## Ressourcengrenze (technisch, keine Geschäftsregel)

`pruefTage = 20.000` Personentage je Analyse (je Modell 2 × Länge, je Person die Tage des Zeitraums). Gemessen ca. 70 µs je
Personentag (Windows-Entwicklungsrechner; 50 Personen × 400 Tage ≈ 1,4 s); 20.000 halten die synchrone Prüfung bei ca. 1,5 s
und unter dem Ziel „unter 2 s" (IMPORT-PLAN Teil E). Keine Grenze für Zykluslänge oder Modellzahl als solche. Darüber
`PRUEFUMFANG_ZU_GROSS` ohne Teilergebnis.

## Konservative Festlegungen (ohne Betreiberentscheidung)

1. Fehlende Grenze im Betrieb (`ruhezeit`, `maxFolge`, `maxNachtFolge`) → Grundwert eines neuen Betriebs (11 h, 6, 4) und
   Hinweis `grundwert-verwendet`; ohne Wert prüfte `pruefen` sonst still nichts.
2. Abwesenheiten, erfasste Ist-Zeiten und eingefrorene Monate zugeordneter Personen bleiben in der Prüfkopie außen vor
   (sie würden Verstöße des Modells verdecken). Vor dem ersten Beginn gelten die Abweichungen des Bestands.
3. „Kein Alleindienst" ist eine Besetzungsfrage, keine Arbeitszeitregel, und wird hier nicht bewertet.
4. Leere Dienstzelle = Lücke, Versatz Pflicht, kein Modulo, Personenzuordnung nie über den Namen.

## Offen (Entscheidung nötig)

- Übernahme in den Bestand: Der Bestand kennt **einen** Zyklus je Betrieb (`m.zyklus` + Versatz je Einheit). Mehrere Modelle
  mit Zuordnung je Person brauchen ein Datenmodell (oder Abweichungen je Tag, begrenzt durch `RUMPF_MAX` 6 MB). Bis dahin:
  nur Analyse und Vorschau als Bibliothek; `/api/import` (Art `schichtzyklus`) bleibt beim Gerüst mit 422 bei der Übernahme.
- Anbindung an `/api/import/analyse|vorschau` (zwei Blätter: Modelle und Zuordnungen) und Oberfläche.
