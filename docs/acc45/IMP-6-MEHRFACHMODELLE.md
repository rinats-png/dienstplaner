# IMP-6 Teil 2 — Mehrere Schichtmodelle je Person (Nachweis)

Stand: 2026-11-13. Grundlage: Betreiberentscheidung 2026-11-13 (verbindlich): Eine Person kann mehrere Schichtmodelle tragen.
Umsetzung: `server/lib/schichtzuordnung.mjs` (rein), eingebunden in `server/lib/rechte.mjs` (Schreibweg der Rollen mit
Vollschreibrecht), `server/lib/sicht.mjs` (Lesesicht), `server/funktionen/daten.mjs` (Protokoll) und
`server/lib/import/schichtvorschau.mjs` (Importvorschau). Prüfung: `pruefungen/imp6-mehrfachmodelle.test.js`
(`npm run pruefung:imp6-mehrfachmodelle`, eigener CI-Schritt). **Keine Aktivierung**: `CENTRIC_IMPORT_AKTIV` bleibt aus,
kein neuer Weg, keine Oberfläche, keine Wirkung auf die Planrechnung.

## Datenmodell (additiv, keine Migration)

| Ort | Feld | Form |
|---|---|---|
| Betrieb | `schichtmodelle` | `[{ id, name, tage: string[], geaendertAm, geaendertVon, version }]` — `tage` je Zyklustag eine Dienstart-Kennung des Betriebs oder `-` |
| Person | `schichtmodellZuordnungen` | `[{ id, modellId, gueltigAb, gueltigBis, versatz?, geaendertAm, geaendertVon, version }]` — Daten `JJJJ-MM-TT` einschließlich, `null` = offen |

- `modellId: "betrieb"` ist die bisherige Schichtfolge des Betriebs (`zyklus`, `anker`, Versatz der Einheit) — reserviert.
- Fehlt das Feld an der Person (oder ist die Liste leer), gilt `betrieb` unbefristet (implizite Zuordnung). Bestehende Daten
  bleiben unverändert; ein Rundweg legt kein Feld an (geprüft für alle Rollen).
- Eigenes Modell: `gueltigAb` ist Pflicht (Zyklusbeginn); am Tag `gueltigAb` gilt Zyklustag `versatz + 1` (wie die Importvorlage).
- Grenzen (technisch): 50 Modelle, 1000 Zyklustage, Name 80 Zeichen, 50 Zuordnungen je Person, Kennungen 1–40 Zeichen `[A-Za-z0-9_-]`.

## Regeln (gewählt)

1. **Genau ein Modell oder Klärung.** `anzuwendendesModell(m, person, datum)` liefert `modell` (mit Kennung, Versatz, Anker)
   oder ausdrücklich `keine`, `mehrdeutig` (mit den Kennungen) bzw. `ungueltig` — nie einen stillen Vorrang.
   `modellDienstAm` liefert den Dienst der Schichtfolge nur bei eindeutigem Modell (Kalendertage, unabhängig von Zeitumstellung).
2. **Speichern nur eindeutiger Listen.** `pruefeZuordnungen` weist ab: Form/unbekanntes Feld, Kennung, doppelte Kennung, unbekanntes
   Modell, kein Kalenderdatum, Ende vor Beginn, fehlender Anker, Versatz, **Überschneidung**, zu viele. Ein verwendetes
   Modell lässt sich nicht entfernen. Antwort 403 mit deutschem Grund (nur Kennungen, kein Name), nichts gespeichert.
   **Lücken** zwischen Zuordnungen und ein befristetes Ende sind seit der Entscheidung vom 2026-11-14 (Frage 5) zulässig:
   an diesen Tagen liefert `anzuwendendesModell` „keine“ (nie still das Betriebsmodell). Eine Lücke, die bis heute oder
   in einen abgeschlossenen bzw. freigegebenen Monat reicht, fängt weiter der historische Schutz (Regel 3).
   Ein gespeicherter Versatz außerhalb 0 … n−1 oder ohne ganze Zahl (etwa aus einer alten Sicherung) ergibt „ungültig“
   (`grund: "versatz"`), nie still 0 oder Modulo; ein fehlender Versatz gilt wie dokumentiert als 0.
3. **Historischer Schutz.** Verglichen wird je Abschnitt zwischen allen Grenzen (alt und neu), was vorher und nachher gilt
   (Modell, Versatz, Anker; auch geänderte Zyklustage eines Modells). Abgewiesen, wenn sich etwas ändert an einem Tag **bis
   einschließlich heute** (Europe/Berlin), in einem **abgeschlossenen Monat** (`monatsabschluss`) oder in einem **freigegebenen
   Monat** (`freigaben`). Weg dafür: Zuordnung ab morgen bzw. ab dem Folgemonat; für einen freigegebenen Monat die bestehende
   Rücknahme der Freigabe (Leitung, `org.edit`); für einen abgeschlossenen Monat das Wiederöffnen. Vergangene Tage bleiben immer.
4. **Rechte (keine neuen).** Lesen und Schreiben nur Rollen mit Vollschreibrecht und (`org.edit` oder `pattern.edit`) und
   `staff.edit` — Planung, Leitung, Kundenrolle (wer heute Schichtfolge und Personal pflegt). Beschäftigte (auch eigene Person),
   Betriebsrat, Schichtverantwortung, Betreiber: nicht sichtbar; mitgeschickt wirkungslos bzw. (Schichtverantwortung) 403 wie jedes
   Leitungsfeld. Ein vom Betreiber neu angelegter Betrieb bekommt die Felder nicht. RB-1 bis RB-5 unverändert.
5. **Server setzt Wann/Wer/Version**; mitgeschickte Stempel verfallen. Unverändert Zurückgeschicktes behält den gespeicherten
   Datensatz. Fehlt ein Feld in der Übermittlung (veraltete Kopie), gilt der gespeicherte Stand (kein 403).
6. **Protokoll**: je angelegtem/geändertem/entferntem Modell bzw. Zuordnung eine Zeile im Betriebsprotokoll (`schichtmodell`)
   nur mit Kennungen (Modell, Person, Zuordnung); keine Namen, Modellnamen oder Zeiträume; höchstens 50 Zeilen je Speichern.
7. **Dienstarten**: Eine Dienstart, die ein Zyklustag eines Modells noch nennt, lässt sich nicht löschen (403, deutscher Grund).
   Eine entfernte Person hinterlässt je Zuordnung eine Protokollzeile (nur Kennungen).
8. **Teilweg** (`/api/bestand/teile`, `CENTRIC_TEILSPEICHERUNG`): dieselbe Kette, gleicher Status und Stand wie der Voll-PUT (geprüft).

## Importvorschau (ohne Schreiben)

`schichtVorschau` (Art `schichtzyklus`) ergänzt `zuordnungen.modellwechsel`, wenn der Tag übergeben wird (Handler: `heute`):
`{ personen, mehrereModelle, uebernehmbar, rueckwirkend: { anzahl, datensaetze }, klaeren: { anzahl, datensaetze } }`.
Je Person ergibt sich aus den übernehmbaren Zeilen eine Kette (bis zum Tag vor dem nächsten Beginn), die die gespeicherten
Zuordnungen ab dem ersten Beginn ersetzen würde; geprüft mit derselben Bibliothek (Form, Überschneidung, Lücke, Rückwirkung).
Ausgabe nur als Anzahlen und Zeilennummern. Der Zwischenspeicher bezieht Tag, Modelle, Abschlüsse und Freigaben in den Hash ein.
Übernahme bleibt 422; `CENTRIC_IMPORT_AKTIV` bleibt aus (geprüft: 404 für jeden Weg).

## Nicht in diesem Paket (Folgeschritte)

- Wirkung auf die Planrechnung (`dienstAm`, Oberfläche, Fachprüfung): Einschalten ist eine eigene Entscheidung.
- Oberfläche (Abschnitt Einstellungen/Person): bewusst nicht gebaut; braucht Gestaltung der Klärungsanzeige.
- Übernahme der Importzuordnungen in den Bestand (IMP-6 Übernahme) und IMP-7 (historische Pläne) bauen auf dieser Bibliothek auf.

## Bekannte Grenze: Wiederherstellen

`POST /api/wiederherstellen` (bestehender Leitungsweg) setzt einen gesicherten Stand ganz zurück und läuft am historischen Schutz
dieser Zuordnungen vorbei. Das ist **nur hinnehmbar, solange die Zuordnungen keine Wirkung auf die Planrechnung haben**; vor dem
Einschalten der Wirkung muss das Wiederherstellen die Zuordnungen wie die Ist-Daten abgeschlossener Monate behandeln.

## Offene Fragen an den Betreiber

1. Gilt „ab morgen“ als frühester Wechsel, oder darf ein Wechsel für **heute** gelten (laufende Schichten)?
2. Darf eine Modelländerung in einem **wiedergeöffneten** Monat bzw. in einer Korrekturrevision (WP-16c) **rückwirkend** gelten?
   Derzeit nein (vergangene Tage bleiben immer).
3. Freigegebene Monate: Absage (heute) oder Änderung mit Vorlauf und erneuter Freigabe wie andere Planänderungen?
4. Sollen Beschäftigte ihr eigenes Modell (und der Betriebsrat Modelle ohne Personenbezug) sehen? Derzeit nein (keine neue Leserechte).
   Dazu gehört die Auskunft nach Art. 15 DSGVO (Selbstauskunft, LUECKEN_SELBST) für `schichtmodellZuordnungen` — rechtliche Einschätzung nötig.
5. Lücken und „keine“: Soll eine Person ohne Modell an Tagen außerhalb aller Zuordnungen zulässig sein (z. B. nicht im Schichtdienst),
   oder muss jede Liste offen enden? Derzeit: Lücken zwischen Zuordnungen abgewiesen, Ränder als `keine` (Klärung).

## Entscheidungen des Betreibers vom 2026-11-14 (Fragen 1 bis 5)

Die Fragen 1 bis 5 oben sind entschieden. Das ist eine Produktentscheidung, **keine** Produktionsfreigabe: Die Regeln sind
noch nicht umgesetzt, reviewt, integriert, auf Staging geprüft oder aktiviert (`CENTRIC_IMPORT_AKTIV` bleibt aus).

| Frage | Entscheidung |
|---|---|
| 1 | Ein Wechsel gilt frühestens am Folgetag. |
| 2 | Nie rückwirkend; Änderungen für die Vergangenheit nur über den Revisionsprozess (WP-16c). |
| 3 | Veröffentlichte Zukunftspläne brauchen nach einer Modelländerung eine neue Planfreigabe. |
| 4 | Beschäftigte sehen ihr eigenes Modell. Es gibt **keine** neuen Leserechte für den Betriebsrat. Offene Prüfung: Die Selbstauskunft nach Art. 15 DSGVO für `schichtmodellZuordnungen` ist getrennt auf Vollständigkeit zu prüfen. |
| 5 | Der Zustand „kein Schichtmodell“ ist zulässig. |

### Umsetzungsstand je Frage (Branch `feat/imp6-schichtmodelle-zyklen`, nicht integriert)

| Frage | Stand im Code | Nachweis |
|---|---|---|
| 1 | Erfüllt seit Teil 2: jede Änderung an einem Tag bis einschließlich heute wird abgewiesen (`historischeSperre`), frühester Wechsel ist morgen. | `imp6-mehrfachmodelle` Abschnitt 4 „Wechsel ab heute“ |
| 2 | Erfüllt seit Teil 2: vergangene Tage ändern sich nie über diesen Weg; abgeschlossene Monate erst nach dem Wiederöffnen (WP-16c), nicht rückwirkend. | Abschnitt 4 „Vergangenheit“, „abgeschlossener Monat“ |
| 3 | Strenger als verlangt, solange die Zuordnungen nicht auf die Planrechnung wirken: Eine Änderung in einem freigegebenen Monat wird abgewiesen; Weg ist Rücknahme der Freigabe (Leitung), Änderung, neue Freigabe — also immer eine neue Planfreigabe. Eine Änderung mit Vorlauf, die die Freigabe selbst zurücknimmt, gehört zur Planwirkung (Punkt 6) und ist nicht gebaut. | Abschnitt 4 „freigegebener Monat“ |
| 4 | Nicht gebaut (eigener Schritt: Lesesicht der eigenen Person in `sicht.mjs`, RECHTEMATRIX). Bis dahin sehen Beschäftigte die Zuordnung nicht (Abschnitt 1). | — |
| 5 | **Umgesetzt:** Lücken und befristetes Ende werden gespeichert; „keine“ an diesen Tagen. | `imp6-zyklen-grenzfaelle` Q5, `imp6-mehrfachmodelle` Abschnitt 3 „Frage 5“ |

Zusätzlich geprüft (`pruefungen/imp6-zyklen-grenzfaelle.test.js`, Teil von `npm run pruefung:imp6-mehrfachmodelle`):
Zykluslage für die Längen 1, 5, 7, 9, 14, 21, 28, 42 mit Beginn über Jahreswechsel, Schalttag, beide Zeitumstellungen und
mitten im Monat (je Versatz 0, Mitte, n−1; unabhängig Tag für Tag gezählt); Modellwechsel mitten im Monat; Überschneidung
ohne Vorrang; Validierung von Länge, Muster, Beginn und Versatz; Differenz alt/neu der Planrechnung (Plan, Prüfung,
Kennzahlen, Soll/Ist/Konto, Zuschläge, Ist-Einfrieren, Rechenkern) über die Golden-Betriebe: mit genau einem Modell je
Person bit-gleich; ein Wächter listet die Module, die Zuordnungen lesen (Planwirkung = bewusste Erweiterung).

## Zählung „Fragen 1 bis 8“: Berichtigung

Frühere Dokumente (SSOT-Notiz IMP-6, `WIEDERAUFNAHME.md`, `ENTSCHEIDUNGSLISTE.md`) sprachen von „Q1 bis Q8“. Diese Datei hat
nur die fünf nummerierten Fragen oben. Die Fragen 6 bis 8 stammen aus der Beschreibung von PR #263 und stehen nur dort
als eigene Nummern. In dieser Datei sind sie bereits enthalten, aber nicht als Fragen: Frage 7 ist der Zusatz zu Frage 4
(Art. 15 DSGVO), Frage 8 ist der Abschnitt „Bekannte Grenze: Wiederherstellen“. Frage 6 hat in dieser Datei keine
eigene Entsprechung (sie steht in der SSOT-Notiz zu IMP-7 als Punkt (e)).

| Nr | Wortlaut laut PR #263 | Stand |
|---|---|---|
| 6 | Wirkung auf die Planrechnung einschalten (`dienstAm`/Oberfläche): ja, und wann? | **offen**, nicht entschieden |
| 7 | Art. 15 DSGVO: Auskunft/`LUECKEN_SELBST` für `schichtmodellZuordnungen` (rechtliche Einschätzung, gehört zu Frage 4) | **offen**, rechtliche Einschätzung nötig |
| 8 | `/api/wiederherstellen` umgeht den historischen Schutz; hingenommen nur, solange die Zuordnungen keine Planwirkung haben | **offen**, Voraussetzung vor Frage 6 |
