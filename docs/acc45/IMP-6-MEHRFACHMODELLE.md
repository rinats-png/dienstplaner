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
   Modell, kein Kalenderdatum, Ende vor Beginn, fehlender Anker, Versatz, **Überschneidung**, **Lücke**, zu viele. Ein verwendetes
   Modell lässt sich nicht entfernen. Antwort 403 mit deutschem Grund (nur Kennungen, kein Name), nichts gespeichert.
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
7. **Teilweg** (`/api/bestand/teile`, `CENTRIC_TEILSPEICHERUNG`): dieselbe Kette, gleicher Status und Stand wie der Voll-PUT (geprüft).

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

## Offene Fragen an den Betreiber

1. Gilt „ab morgen“ als frühester Wechsel, oder darf ein Wechsel für **heute** gelten (laufende Schichten)?
2. Darf eine Modelländerung in einem **wiedergeöffneten** Monat bzw. in einer Korrekturrevision (WP-16c) **rückwirkend** gelten?
   Derzeit nein (vergangene Tage bleiben immer).
3. Freigegebene Monate: Absage (heute) oder Änderung mit Vorlauf und erneuter Freigabe wie andere Planänderungen?
4. Sollen Beschäftigte ihr eigenes Modell (und der Betriebsrat Modelle ohne Personenbezug) sehen? Derzeit nein (keine neue Leserechte).
5. Lücken und „keine“: Soll eine Person ohne Modell an Tagen außerhalb aller Zuordnungen zulässig sein (z. B. nicht im Schichtdienst),
   oder muss jede Liste offen enden? Derzeit: Lücken zwischen Zuordnungen abgewiesen, Ränder als `keine` (Klärung).
