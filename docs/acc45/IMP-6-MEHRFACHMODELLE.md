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
   Ein gespeicherter Versatz außerhalb 0 … n−1 oder ohne ganze Zahl ergibt „ungültig“ (`grund: "versatz"`), nie still 0
   oder Modulo; ein fehlender Versatz gilt wie dokumentiert als 0. Ein solcher Fehlwert entsteht nur noch über
   `/api/wiederherstellen` (alte Sicherung; P2-4 Punkt 8). **Modell verkürzt, Versatz ≥ n (umgesetzt, Vorbedingung vor
   Punkt 6, Branch `feat/imp6-versatz-vorbedingung`):** Wird ein Modell verkürzt (neue Zahl der Zyklustage n kleiner als
   gespeichert) und trägt eine Zuordnung zu diesem Modell im zusammengeführten Stand einen Versatz ≥ n, antwortet der
   Server **422 `MODELL_VERKUERZT_VERSATZ`** (`feld: mandanten[i].schichtmodelle`, Text nur mit Kennungen: Modell,
   Zuordnung, Person, neue Länge, Versatz) und speichert nichts — kein stilles „ungültig“, kein Modulo, kein Ersatzwert.
   Bisher speicherte er mit 200, wenn die Zuordnung unverändert blieb (sie wurde nicht erneut geprüft). Ausweg: im selben
   oder einem vorherigen Speichern den Versatz anpassen. Wird die Zuordnung im selben Speichern auch sonst geändert, greift
   wie bisher die Listenprüfung (403 „Versatz muss …“). Geprüft wird jede Zuordnung zum verkürzten Modell (vergangene
   fängt schon der historische Schutz); ein Modell, das nicht verkürzt wird, prüft die Regel nicht, ein gespeicherter
   Altfehler blockiert also kein unabhängiges Speichern. Voll- und Teilweg gleich (nach der Rechteprüfung, in
   `daten.mjs` neben den übrigen 422-Absagen; Bibliothek `modellKuerzungFehler`/`modellKuerzungFehlerBestand`).
   Statuscode 422 statt 403 wie `MODELL_VERWENDET`: es ist eine inhaltliche Absage, kein Rechtefall (Code im Rumpf).
   Die Oberfläche kennt den Code seit der Pflegeoberfläche (Branch `acc45/imp/imp-6-ui`): `src/speicher.js` zeigt ihn als Lage
   „schichtmodell“ mit dem Text des Servers (siehe unten „Oberfläche“).
   Nicht erfasst: das Betriebsmodell (`m.zyklus`, Versatz der Einheit), das wie bisher modulo rechnet.
   Prüfung: `imp6-mehrfachmodelle` Abschnitte 4 und 4b.
3. **Historischer Schutz.** Verglichen wird je Abschnitt zwischen allen Grenzen (alt und neu), was vorher und nachher gilt
   (Modell, Versatz, Anker; auch geänderte Zyklustage eines Modells). Abgewiesen, wenn sich etwas ändert an einem Tag **bis
   einschließlich heute** (Europe/Berlin), in einem **abgeschlossenen Monat** (`monatsabschluss`) oder in einem **freigegebenen
   Monat** (`freigaben`). Weg dafür: Zuordnung ab morgen bzw. ab dem Folgemonat; für einen freigegebenen Monat die bestehende
   Rücknahme der Freigabe (Leitung, `org.edit`); für einen abgeschlossenen Monat das Wiederöffnen. Vergangene Tage bleiben immer.
4. **Rechte (keine neuen).** Schreiben und vollständiges Lesen nur Rollen mit Vollschreibrecht und (`org.edit` oder
   `pattern.edit`) und `staff.edit` — Planung, Leitung, Kundenrolle (wer heute Schichtfolge und Personal pflegt). Seit Frage 4
   (siehe unten, „Umsetzungsstand“) sehen Beschäftigte und die Schichtverantwortung an der **eigenen** Person ihre Zuordnungen
   und nur deren Modelle, ohne Wann/Wer/Version. Fremde Personen, Betriebsrat (auch an der eigenen Person), Betreiber: nicht
   sichtbar. Mitgeschickt wirkungslos bzw. (Schichtverantwortung) 403 wie jedes Leitungsfeld; unverändert Zurückgeschicktes
   behält den gespeicherten Stand. Ein vom Betreiber neu angelegter Betrieb bekommt die Felder nicht. RB-1 bis RB-5 unverändert.
   Die Schreibregeln (Inhalt und Rechte) sind mit Frage 4 unverändert. **Ausnahme im Verhalten (Review #372 M1):** Seit die
   Schichtverantwortung die eigene Zuordnung und deren Modelle sieht, wertet ihre Rückfüllung (`rechte.mjs`,
   „sichtbar, aber nicht mitgeschickt = gelöscht“) eine **ältere Client-Kopie** ohne diese Felder (eigene Zuordnung fehlt
   oder `[]`, `schichtmodelle: []`) als Löschung: **403 statt 200**, fail-closed, Bestand byte-gleich, Neuladen löst es.
   Betrifft nur Schichtverantwortliche mit gespeicherter eigener Zuordnung. Vor dem Produktivsetzen: Rückfüllregel anpassen
   oder Deploy-Hinweis „Clients neu laden“ (ENTSCHEIDUNGSLISTE P2-19 (e); festgeschrieben in `imp6-eigenes-modell`).
5. **Server setzt Wann/Wer/Version**; mitgeschickte Stempel verfallen. Unverändert Zurückgeschicktes behält den gespeicherten
   Datensatz. Fehlt ein Feld in der Übermittlung (veraltete Kopie), gilt der gespeicherte Stand (kein 403) — außer für die
   Schichtverantwortung an Feldern, die sie seit Frage 4 sieht (siehe Regel 4, Ausnahme).
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

- Wirkung auf die Planrechnung (`dienstAm`, Oberfläche, Fachprüfung): Einschalten ist eine eigene Entscheidung. Rechenkern
  seit 2026-11-20 hinter `CENTRIC_SCHICHTMODELL_WIRKUNG` gebaut und (PR 2) verbunden, Vorgabe aus, siehe unten „Planwirkung“.
- Oberfläche für Beschäftigte („Mein Schichtmodell“): nicht gebaut (P2-19 (d)). Die Pflege für Planung/Leitung ist gebaut, siehe unten.
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
| 4 | **Lesesicht umgesetzt** (Branch `feat/imp6-eigenes-modell`, PR an `integration/release-v4`): `GET /api/bestand` liefert Beschäftigten und der Schichtverantwortung an der eigenen Person die eigenen Zuordnungen (Kennung, Modell, Gültigkeit, Versatz) und im Betrieb nur die Modelle dieser Zuordnungen (Kennung, Name, Zyklustage), jeweils ohne Wann/Wer/Version; fremde Personen nie; Betriebsrat und Betreiber nichts; Planung, Leitung, Kundenrolle unverändert. Schreibregeln (Inhalt, Rechte) unverändert; ältere Client-Kopie der Schichtverantwortung ohne die neuen Felder: 403 statt 200 (Regel 4, Ausnahme; P2-19 (e)). **Nicht gebaut:** eine Anzeige in der Oberfläche (die Modelle wirken noch nicht auf den Plan, eine Anzeige „Mein Schichtmodell“ neben einem anders gerechneten Plan wäre irreführend), Selbstauskunft (Punkt 7). Offene Abgrenzungen: ENTSCHEIDUNGSLISTE P2-19. | `imp6-eigenes-modell` (Matrix, Schreibweg, Teilweg, Differenz alt/neu); `imp6-mehrfachmodelle` Abschnitt 1 (umgestellt); `rechtematrix-zeilen` |
| 5 | **Umgesetzt:** Lücken und befristetes Ende werden gespeichert; „keine“ an diesen Tagen. | `imp6-zyklen-grenzfaelle` Q5, `imp6-mehrfachmodelle` Abschnitt 3 „Frage 5“ |

Zusätzlich geprüft (`pruefungen/imp6-zyklen-grenzfaelle.test.js`, Teil von `npm run pruefung:imp6-mehrfachmodelle`):
Zykluslage für die Längen 1, 5, 7, 9, 14, 21, 28, 42 mit Beginn über Jahreswechsel, Schalttag, beide Zeitumstellungen und
mitten im Monat (je Versatz 0, Mitte, n−1; unabhängig Tag für Tag gezählt); Modellwechsel mitten im Monat; Überschneidung
ohne Vorrang; Validierung von Länge, Muster, Beginn und Versatz; Differenz alt/neu der Planrechnung (Plan, Prüfung,
Kennzahlen, Soll/Ist/Konto, Zuschläge, Ist-Einfrieren, Rechenkern) über die Golden-Betriebe: mit genau einem Modell je
Person bit-gleich, ebenso mit eigenen Modellen und mit Lücke/befristetem Ende; ein Wächter listet die Module, die
Zuordnungen bzw. Modelldefinitionen (`schichtmodelle`) im Quelltext nennen (Planwirkung = bewusste Erweiterung; dynamisch
gebildete Feldzugriffe erkennt er nicht).

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

## Oberfläche: Pflege für Planung, Leitung, Kundenrolle (Branch `acc45/imp/imp-6-ui`, 2026-11-20)

Abschnitt „Schichtmodelle je Person“ in der Ansicht „Schichtfolge“ (`src/ansichten/schichtmodelle.jsx`), sichtbar nur bei
(org.edit oder pattern.edit) und staff.edit — wie der Schreibweg des Servers. Hinweis oben: „Noch ohne Wirkung auf den Dienstplan“.

- **Modelle:** anlegen, bearbeiten, entfernen; Name und Folge der Zyklustage (Kürzel der Dienstarten, „-“/„frei“), jede Zykluslänge
  von 1 bis 1000 Tagen (Anzeige „9 Tage“, „14 Tage (2 Wochen)“), Kürzel per Knopf anhängbar. Unbekanntes Kürzel sperrt „Übernehmen“.
  Entfernen nur, solange niemand zugeordnet ist.
- **Zuordnungen je Person:** Modell (auch „Schichtfolge des Betriebs“), Gültig ab, Gültig bis (leer = offen), Startpunkt im Zyklus;
  Anzeige „Heute“ und „Ab morgen“ (Modell und Zyklustag, „kein Schichtmodell“, Klärungsfälle). Begonnene Zuordnungen: nur „Gültig bis“
  änderbar, nicht entfernbar. Die erste eigene Zuordnung legt die Fortsetzung der Schichtfolge des Betriebs bis heute sichtbar in den
  Entwurf (sonst wären die Tage davor „kein Schichtmodell“ und damit rückwirkend geändert).
- **Vorprüfung = Server:** `entwurfPruefen` (`src/lib/schichtmodelle-pflege.js`) ruft dieselbe Kette wie der Server
  (`schichtzuordnungZusammen`, danach `modellKuerzungFehler`) und zeigt deren Text; erst ohne Befund schreibt die Aktion.
- **Absage des Servers:** 422 `MODELL_VERKUERZT_VERSATZ` und die inhaltlichen 403 (stabiler Code `SCHICHTMODELL_<Prüfcode>`) werden unter „Nicht gespeichert“ zur Lage
  „schichtmodell“ (Bereich „Schichtmodelle“, Text des Servers, Verwerfen-Weg, kein „Noch einmal senden“, keine Rollenmeldung).
- **Nicht gebaut:** Planwirkung (P2-4 Punkt 6), Anzeige für Beschäftigte (P2-19 (d)), Versionierung laufender Modelle (P2-24 (b)).
- **Prüfungen:** `pruefungen/imp6-oberflaeche.test.js` (in `pruefung:imp6-mehrfachmodelle`), `e2e/imp6-schichtmodelle.spec.mjs`
  (Browser, axe WCAG 2.2 AA); Wächter D2 in `imp6-zyklen-grenzfaelle` um die Pflegehilfe erweitert (einzige Stelle der Oberfläche,
  die die Felder nennt).

## Schalter `CENTRIC_SCHICHTMODELL_PFLEGE` (P2-24 B, Betreiberentscheidung 2026-11-20)

- **Wirkung:** nur die Anzeige. Ist der Schalter an (genau `true`), meldet `GET /api/bestand` `schichtmodellPflege: true`;
  `src/speicher.js` setzt daraus den Merker (`src/lib/schichtmodell-schalter.js`), und die Ansicht zeigt den Abschnitt (zusätzlich
  zum Pflegerecht). Fehlt die Angabe, bleibt der Abschnitt verborgen (fail-closed). Vorgabe: aus; `.env.example` auskommentiert.
- **Kein Datenverlust bei AUS:** Die Modelle und Zuordnungen stehen weiter im gelesenen Bestand und gehen beim Speichern
  unverändert mit; der Server behält Unverändertes byte-gleich (Regel 5). Eine Kopie ohne die Felder (älterer Client) behält
  den gespeicherten Stand. Geprüft: `imp6-oberflaeche` S1–S4, `imp6-mehrfachmodelle` Abschnitt 9, E2E S6.
- **Server-Schreibweg bei AUS: unverändert (geprüft und so entschieden).** Begründung:
  1. P2-24 (a) betrifft die Verwechslungsgefahr in der Oberfläche, nicht die Unversehrtheit der Daten; die Modelle wirken nicht
     auf den Plan (P2-4 Punkt 6 offen).
  2. Alle Schutzregeln des Schreibwegs gelten unabhängig vom Schalter (Rechte nur Planung/Leitung/Kundenrolle, Form,
     Überschneidung, historischer Schutz, Modell verkürzt 422, Protokoll). Ein Schreiben bei AUS ist also nie ungeprüft.
  3. Ein Abweisen bei AUS änderte bestehende, integrierte Serverregeln (#263, #369, #372) und deren Prüfungen und könnte
     Speichervorgänge blockieren, die gespeicherte Modelle nur mitführen — genau das soll ohne Datenverlust weiterlaufen.
  4. Die Bremse „Dienstart löschen, solange ein Modell sie nennt“ (403) schützt auch bei AUS gespeicherte Daten; sie bliebe
     bei einer Sperre des Schreibwegs nur dann richtig, wenn die Sperre fein unterschiede — mehr Code in der Konfliktzone
     `rechte.mjs` ohne Schutzgewinn.
  Festgeschrieben: `imp6-mehrfachmodelle` 9 „Schalter aus: der Schreibweg des Servers ist unverändert“.
- **Entwicklung und isolierte Prüfungen:** `CENTRIC_SCHICHTMODELL_PFLEGE=true` setzen; die Komponentenprüfungen setzen den
  Merker direkt, die E2E-Spec ergänzt die GET-Antwort des echten Servers für ihre Seite (andere Specs sehen nichts).

## Rechte der Anzeige (Review #423 A1)

Die Anzeige rechnet wie der Server mit der **festen** Rollenmatrix (`MATRIX_STD`/`rechte.mjs` `MATRIX`), nicht mit der
Betriebsmatrix `m.matrix`: Eine Rolle, der nur die Betriebsmatrix `staff.edit` und `pattern.edit` gibt, sähe sonst die Pflege,
und der Server verwürfe ihre Änderung still (Felder ohne Recht wirkungslos). `darfSchichtmodelle` in
`src/lib/schichtmodelle-pflege.js`; Gleichlauf je Rolle mit `rechte.mjs` `darf` in `imp6-oberflaeche` D1b. Serververhalten unverändert.

## Planwirkung (P2-4 Punkt 6) — PR 1: Rechenkern (Branch `acc45/imp/imp-6-planwirkung`, 2026-11-20)

Betreiberauftrag 2026-11-20: Integration der Schichtmodelle in die tatsächliche Dienstplanung, mit historischen
Gültigkeiten, Übergängen, Überschneidungen und den bisherigen Entscheidungen; kein produktives Aktivieren vor vollständiger
Funktions- und Sicherheitsprüfung. Wegen des Umfangs in zwei PRs: **PR 1** (dieser) Rechenkern und Prüfungen mit Schalter AUS;
**PR 2** Verdrahtung (Server-Einstieg, Oberfläche, Schutzrechnung-Auslöser, Anzeige, Sicht der Beschäftigten, Export/Lagebild).

**Schalter `CENTRIC_SCHICHTMODELL_WIRKUNG`** (`server/lib/schalter.mjs`, `schichtmodellWirkungAn`; nur genau `true`; Vorgabe aus;
`.env.example` auskommentiert; Betriebshandbuch). **In PR 1 mit keinem Weg verbunden:** Die Planrechnung liest die Wirkung
über `schichtmodellWirkungAktiv()` (`server/lib/fachpruefung.mjs`); die Quelle setzt nur `schichtmodellWirkungSetzen`, und das
ruft in `server/` und `src/` niemand auf (Wächter `imp6-planwirkung` S). Grund: Ohne PR 2 rechneten Server und Oberfläche
verschieden (Planung sähe das Betriebsmodell, der Server prüfte nach Modellen). `RELEASE-UNFERTIG.json` (PR #427) ist noch nicht
gemergt; der Schalter ist dort nachzutragen (unfertig, Vorgabe aus).

**Eine Stelle für die Schichtfolge:** `planDienst(m, p, d)` (Schichtfolge mit Teilzeit, ohne Abweichung/Posten/Abwesenheit).
AUS: wörtlich der bisherige Ausdruck (`einheitDienst` der Einheit mit `teilzeitDienst`). AN: `schichtmodellLageAm`:

| Lage am Tag | Ergebnis |
|---|---|
| Betriebsmodell (auch implizit, ohne Feld) | Schichtfolge der Einheit wie bisher (AN = AUS, geprüft) |
| eigenes Modell | Zyklustag ab „Gültig ab“ mit Versatz, Kalendertage (Zeitumstellung zählt nicht); Wechsel frühestens Folgetag (Q1, Schreibweg) |
| „keine“ (Lücke, befristetes Ende, Q5) | kein Dienst aus einem Modell; nie das Betriebsmodell; Abweichungen gelten weiter |
| mehrdeutig (Überschneidung, nur über alte Sicherung speicherbar) | „uneindeutig“: kein Dienst, nie still gewählt; `schichtmodellKlaerungen` listet die Tage |
| ungültig (Versatz, unbekanntes Modell, fehlender Beginn) | kein Dienst; Klärungsfall |
| Springer / nicht im Schichtdienst | keine Folge (wie bisher) |

Teilzeit-Quote im eigenen Modell über dessen Zyklustage (`teilzeitModell`; Entscheidung P2-28). Verdrahtet in PR 1: `personTag`
(Oberfläche, `server/lib/engine/plan.mjs`), `dienstAm` (Server, Stempel, Selbstauskunft, Fachprüfung), `planTag` und
Postenbesetzung (Einfrieren beim Monatsabschluss; mit AN besetzt einen Posten nur, wer nach seinem Modell den Gruppendienst hat),
Planrechner der Schutzrechnung (`schutzdurchsetzung.mjs`, `am`), Ersatzvorschlag („hätte regulär frei“). **Nicht in PR 1
(PR 2):** Auslöser der Schutzrechnung bei geänderten Modellen/Zuordnungen (`planStrukturSchritte`, B-H5-Vorbedingung in P2-4),
Oberfläche (`src/`: Merker aus `GET /api/bestand`, Monatsplan/Lagebild/Aushang je Einheit, Aktionen `plan.js`/`begleitung.js`,
`urlaubskonto`, Änderungen gegenüber der Freigabe), Sicht der Beschäftigten auf die Pläne anderer (Q4: nur das eigene Modell —
die anderen brauchen den gerechneten Dienst vom Server, nie deren Modelle), Export/Import-Pfade.

**Historische Tage.** Abgeschlossene Monate rechnen Soll, Ist, Konto, Zuschläge und Lohnexport aus dem Eingefrorenen — die Wirkung
ändert sie nicht (geprüft: Abschluss bei AUS, danach AN unverändert; Abschluss bei AN friert das damals gültige Modell ein, späteres
AUS ändert nichts). Die Zuordnungen selbst sind gegen Rückwirkung geschützt (Regel 3). **Offen:** Zuordnungen, die vor dem
Einschalten schon gelten, rechneten bei AN vergangene offene Tage, freigegebene Pläne und die Plananzeige abgeschlossener Monate
neu — Vorprüfung `wirkungsVorpruefung` gebaut, Entscheidung P2-27 (Empfehlung Stichtag). Frage 7 → P2-25, Frage 8 → P2-26.

## Planwirkung — PR 2: Verdrahtung (Branch `acc45/imp6/teil2-verdrahtung`, 2026-11-20)

Der Schalter bleibt **AUS** (Vorgabe, `.env.example` auskommentiert, kein Workflow setzt ihn). AUS rechnet jede Stelle wörtlich
wie vorher (Prüfungen: `imp6-verdrahtung` je Stelle, `imp6-planwirkung` D3 unverändert).

| Weg | Verdrahtung | AUS |
|---|---|---|
| Server-Einstieg | `server/lib/schichtmodell-wirkung.mjs` setzt die Quelle (`schichtmodellWirkungAn`, je Aufruf gelesen); eingebunden in `server.mjs` und `server/funktionen/daten.mjs` | Quelle liest „aus“ |
| Oberfläche | `GET /api/bestand` meldet `schichtmodellWirkung: true` **nur** Rollen mit vollständiger Sicht (Vollschreibrecht, org.edit oder pattern.edit, staff.edit: Planung, Leitung, Kundenrolle); `src/speicher.js` setzt den Merker allein daraus | keine Angabe, Merker aus |
| Auslöser der Schutzrechnung | `planStrukturSchritte` nimmt mit AN `schichtmodelle` (Betrieb) und `schichtmodellZuordnungen` (Person) hinzu (`schichtmodellPlanfelder`, eine Stelle) | wie bisher keine |
| Aktionen | `setzeAbweichung` (`plan.js`), `mehrfachDienst` (`begleitung.js`): Plan = Modell der Person (`schichtfolgeAm`) | bisheriger Ausdruck |
| Auswertungen | `urlaubskonto` (Urlaubstag = Tag mit Dienst nach dem Modell; Lücke kein Urlaubstag), `planVergleich` (Änderungen gegenüber der Freigabe gegen das Modell) | bisheriger Ausdruck |
| Ersatzvorschlag | Lücke/Überschneidung/ungültig: weder „hätte regulär frei“ noch „in der Dienstphase“, keine Punkte, Grund „kein Schichtmodell an diesem Tag“ bzw. „Schichtmodell unklar (Klärung)“ | bisheriger Ausdruck |
| Anzeige je Einheit | Aushang, Monatsplan (Zeile je Einheit), Lagebild („im Regeldienst“, Schichtfolge zwei Wochen) zeigen weiter die Folge der Einheit = Betriebsmodell; bei AN nennt ein Hinweis die **Zahl** der Personen mit eigenem Modell (keine Namen; `abweichendVomBetriebsmodell`) | kein Hinweis, Markup byte-gleich |
| Zwischenspeicher | `modellVerzeichnisGemerkt` (Kern): je Liste der Modelle gemerkt, jede Änderung (auch an Ort und Stelle) rechnet neu; `modellVerzeichnis` liefert weiter eine frische Karte | — |

**`schichtfolgeAm(m, p, d, alt)`** (`fachpruefung.mjs`): AUS → `alt()`; AN mit Betriebsmodell (auch implizit), Springer, nicht im
Schichtdienst → `alt()` (AN = AUS ohne eigenes Modell); eigenes Modell → Zyklustag; „keine“/uneindeutig/ungültig → kein Dienst.
Wächter `imp6-planwirkung` S: Gesamtsuche `einheitDienst(` in `server/` und `src/` mit Positivliste und Grund je Datei; die
personenbezogenen Stellen der Oberfläche stehen nur als alter Ausdruck in `schichtfolgeAm`. Quelle der Wirkung genau an drei
Stellen (Definition, Server-Einstieg, `speicher.js`) plus die Meldung in `daten.mjs`.

**Bewusst nicht gebaut (fail-safe, Vorbedingung vor dem Einschalten):**
1. **Sicht der Beschäftigten, der Schichtverantwortung und des Betriebsrats auf fremde Pläne.** Diese Rollen sehen höchstens die
   eigene Zuordnung (Q4). Mit unvollständigen Daten rechnete die Oberfläche für andere still das Betriebsmodell (gegen Q5); sie
   bekommen deshalb keine Angabe und bleiben beim bisherigen Stand. Lösung: der Server liefert den gerechneten Dienst, nie die
   Modelle anderer (keine neuen Leserechte). Bis dahin sähen sie bei AN auch die eigene Folge nach dem Betriebsmodell.
   **Schreibweg der Teilrollen (Nachtrag Review #431): nicht nur Anzeige, sondern Datenintegrität beim Schreiben.** Szenario
   bei AN: Die Schichtverantwortung setzt bei einer Person mit eigenem Modell den Dienst, der der Betriebsfolge entspricht.
   Ihr Client hat keinen Merker und hält diesen Dienst für den „Plan“ (`src/app/aktionen/plan.js`, `setzeAbweichung`, ~Z. 52:
   `dienstId === plan` → Abweichung gelöscht). Der Server meldet ihr den Merker nicht (`server/funktionen/daten.mjs`, ~Z. 1419)
   und rechnet selbst nach dem Modell der Person. Nach dem Speichern gilt also still der **Modelldienst**, nicht der gewählte
   Dienst; Änderungsliste und Mitteilung beruhen auf der Betriebsfolge des Clients. Dasselbe gilt für jeden Weg der Teilrollen, der „Abweichung = Plan“
   wegnormalisiert. **Vorbedingung vor AN:** vom Server gerechneter Dienst für die Teilrollen, mit **Sicht und Schreibweg**
   (der Client vergleicht beim Schreiben mit dem Dienst des Servers, oder der Server normalisiert selbst; nie mit der
   Betriebsfolge, wenn die Person ein eigenes Modell hat). **Gebaut** (Branch `acc45/imp6/teilrollen-serverdienst`), siehe
   unten „Teilrollen: vom Server gerechneter Dienst“.
2. **P2-26** (Wiederherstellen), **P2-27** (Stichtag), **P2-25** (Art. 15), **P2-24 (b)** (Versionierung), **P2-28** (Teilzeit-Quote):
   nicht entschieden, nichts daran geändert. Urlaubskonto bei AN nach dem Modell: **gebaut als Vorschlag hinter AN,
   Entscheidung P2-28 offen (Kategorie C)**. Begründung des Vorschlags: Q5 („nie still das Betriebsmodell“) lässt für
   eine Person mit eigenem Modell keine andere Zählung zu; die Teilzeitfrage von P2-28 berührt das nicht (gezählt wird wie bisher
   die rohe Folge ohne Quote). Vergangene Urlaubstage offener Jahre rechneten bei AN neu — das ist Teil von P2-27.
3. **`RELEASE-UNFERTIG.json`** (#427): Eintrag `CENTRIC_SCHICHTMODELL_WIRKUNG` (unfertig, Vorgabe aus) erst nach dem Merge von #427.
4. Release-Gate-Warnung bei gesetztem, aber nicht genau `true` (REL-1, Hinweis 4 aus #429): nicht Teil dieses PR.

**Vorbedingungen vor AN (Liste, Stand Nachtrag Review #431).** Der Schalter bleibt AUS, bis alle Punkte erledigt oder
entschieden sind:
1. Teilrollen (Beschäftigte, Schichtverantwortung, Betriebsrat): vom Server gerechneter Dienst mit Sicht **und Schreibweg**
   (siehe „Bewusst nicht gebaut“ 1, Szenario Schichtverantwortung). **Gebaut, Schalter AUS** (Abschnitt „Teilrollen: vom
   Server gerechneter Dienst“); vor AN offen bleibt dort „Grenzen“ (Deploy-Hinweis „Clients neu laden“, Fenster, Punkt 5) sowie die
   Entscheidungen P2-29 bis P2-31 (Review #436).
2. Entscheidungen P2-26, P2-27; dazu P2-24 (b), P2-25, P2-28 und P2-29 bis P2-31 (Teilrollen, Review #436) beim Betreiber.
3. `RELEASE-UNFERTIG.json`-Eintrag nach dem Merge von #427; Release-Gate-Warnung (REL-1).
4. **Teilzeitprofil (Befund 4, Review #431):** `teilzeitProfil` (`src/lib/fachlogik.js`, ~Z. 1743) rechnet aus `m.zyklus` ohne
   `einheitDienst(` — der Wächter `imp6-planwirkung` S erfasst die Stelle deshalb nicht. Bei AN zeigte es für eine Person mit
   eigenem Modell die Dienste je Zyklus des Betriebsmodells. Gehört zu P2-28 (Teilzeit im eigenen Modell).
5. **Offline-Merker (Befund 5, Review #431):** `src/speicher.js` (`lies`, ~Z. 381) übernimmt `schichtmodellWirkung` auch aus
   einer Antwort aus dem Speicher des Dienstarbeiters (`ausSpeicher`). Nach dem Abschalten am Server rechnet ein Offline-Client
   weiter mit den Modellen, bis er wieder online liest. Vor AN klären: gemerkte Antwort nicht als Quelle des Merkers nehmen
   (oder beim Abschalten den Speicher verwerfen). Gilt ebenso für `schichtfolgeServer` (Teilrollen, unten): `lies` übernimmt
   es wie den Merker auch aus der gemerkten Antwort — bewusst gleich behandelt, die Lösung gehört zu diesem Punkt.

## Teilrollen: vom Server gerechneter Dienst (Vorbedingung 1, Branch `acc45/imp6/teilrollen-serverdienst`, 2026-11-20)

Schalter `CENTRIC_SCHICHTMODELL_WIRKUNG` bleibt **AUS** (nirgends gesetzt, auch nicht in CI). Bei AUS ist alles wörtlich wie
vorher: keine neue Angabe in `GET /api/bestand`, kein Unterschied beim Schreiben, kein Kopf beim Senden, Planrechnung und
Markup byte-gleich (`imp6-planwirkung` D3, `imp6-verdrahtung` H unverändert grün; `imp6-teilrollen` G4, W6, C1).
Keine Entscheidung zu P2-24 (b), P2-25 bis P2-28. Teilrollen = jede Rolle ohne vollständige Sicht der Zuordnungen
(`vollsichtSchichtmodelle`, `server/lib/schichtfolge-teilrollen.mjs`; dieselbe Regel wie die Angabe `schichtmodellWirkung`):
Beschäftigte, Schichtverantwortung, Betriebsrat.

**Sicht (GET /api/bestand, nur AN, nur Teilrollen, nicht Betreiber/Sicherungsschlüssel).** Neue Angabe `schichtfolgeServer`:
`{ von, bis, personen: { [personId]: Wert je Tag } }`. Fenster = `SICHTFENSTER` (heute − 60 bis heute + 90 Tage, Europe/Berlin),
wie die Personensicht der Schichtverantwortung. Wert: `null` = an diesem Tag Betriebsmodell (die Oberfläche rechnet wie bisher),
`"F"`/`"-"` = Dienst (roh = Plan), `["F", "-"]` = [roh, Plan mit Teilzeit].
- **Nur Personen der Sicht der Rolle** (`bestandFuerAntwort`; dieselbe Personenliste wie bisher) und nur solche mit eigener
  Zuordnung (`folgtNurBetriebsmodell`: kein Feld, leer oder genau eine unbefristete Zuordnung „betrieb“ → nicht enthalten).
  Springer und Personen außerhalb des Schichtdiensts nicht (keine Folge).
- **Datenschutz (Q4):** nie Modelle, Modellnamen, Zykluslänge, Versatz, Zuordnungskennungen oder Gültigkeiten als Angabe — nur
  der gerechnete Dienst je Tag, wie er bisher aus Schichtfolge und Teilzeit (`teilzeit`, `wochenstunden` stehen in der Sicht) für
  jede Person der Sicht ablesbar war. Aus der Folge der Tage lässt sich nur ablesen, was auch der fertige Plan zeigt. Der Betriebsrat liest weiterhin keine Modelle, auch nicht die eigene Zuordnung. Mitgeteilt wird
  zusätzlich, **dass** eine Person eine eigene Zuordnung hat (Schlüssel vorhanden) — nötig, damit die Oberfläche außerhalb
  des Fensters nicht still das Betriebsmodell zeigt. Laut Review #436 (B2) ist das vermeidbar und keine Kategorie B: offene
  Entscheidung **P2-29** vor AN.
- Entwurfstage der Beschäftigten: `personTag` zeigt dort wie bisher keinen Plan (`sichtEntwuerfe`); die Angabe filtert sie aber
  nicht (offene Entscheidung **P2-31**).

**Oberfläche.** `src/speicher.js` (`lies`) setzt die Angabe allein aus der Antwort (`schichtfolgeServerSetzen`, ungültige Form
= keine Angabe). `planDienst` und `schichtfolgeAm` (`fachpruefung.mjs`) lesen sie nur im AUS-Zweig der eigenen Rechnung:
Wert im Fenster → Dienst des Servers; `null` oder Person ohne Schlüssel → bisheriger Ausdruck; **außerhalb des Fensters für
eine Person mit Schlüssel „offen“: kein Dienst, nie still das Betriebsmodell (Q5).** Damit folgen `personTag` (Monatsplan,
Mein Dienst), `setzeAbweichung`, `mehrfachDienst`, `urlaubskonto`, `planVergleich` und der Ersatzvorschlag dem Dienst des
Servers. `abweichendVomBetriebsmodell` zählt für Teilrollen die Personen mit Angabe (Hinweis je Einheit). An einem offenen Tag
löschen `setzeAbweichung`/`mehrfachDienst` keine Abweichung als „Plan“, sondern speichern ausdrücklich (`schichtfolgeOffen`).
Volle Rollen bekommen keine Angabe; ist bei ihnen die eigene Rechnung an, wirkt eine Angabe ohnehin nicht.

**Schreibweg (Voll-PUT und Teilweg, nur AN, nur Schichtverantwortung).** `abweichungenTeilrollen` entscheidet **vor** der
Rechteprüfung (`zusammenfuehren`) gegen den Modelldienst des gespeicherten Stands (`schichtmodellLageAm`), verglichen mit der Sicht
der Rolle auf den gespeicherten Stand (ein unsichtbarer Eintrag gilt nie als gelöscht). Entschieden werden nur geänderte Schlüssel,
die die Schichtverantwortung **sieht und schreiben darf** — Person in ihrer Sicht, Tag im Sichtfenster, Einheit am Tag = eigener
Bereich (`eigeneEinheit`/`einheitAm` wie `rechte.mjs`) — und nur an Tagen, an denen die Person **nicht** dem Betriebsmodell folgt
(eigenes Modell, Lücke, Klärung). Alles andere geht unverändert an die Rechteprüfung: gleicher Status und gleicher Stand wie bei AUS
(Review #436 B1: sonst verriete 200/403 bei einem fremden Bereich oder einem Tag außerhalb des Fensters den Modelldienst fremder
Zuordnungen, Q4). Andere Teilrollen schreiben keine Abweichungen; für sie und den Betreiber (B5) bleibt der Rumpf unverändert.

| Änderung des Clients | Kopf `x-centric-schichtfolge: server` | Ergebnis |
|---|---|---|
| Abweichung = Modelldienst (`-` = frei) | egal | entfällt (sie ist der Plan) |
| andere Abweichung | egal | bleibt |
| Abweichung gelöscht | fehlt (Client rechnete mit der Betriebsfolge) | ausdrücklich der Dienst der Betriebsfolge — was der Client als Plan zeigte; gleicht er dem Modelldienst, bleibt die Löschung |
| Abweichung gelöscht | gesetzt (Client rechnete mit dem Dienst des Servers) | Löschung bleibt: Plan = Modelldienst |

Der Kopf geht nur hinaus, wenn die Oberfläche den Dienst des Servers hat (`schichtfolgeServerAktiv`); bei AUS nie; nur der Wert
genau `server` zählt. Er erweitert keine **Schreibrechte**: Er bestimmt nur, wie eine eigene Löschung im eigenen Bereich und im
Fenster gelesen wird; beide Ergebnisse könnte der Client auch ausdrücklich setzen. Das Ergebnis (gespeicherter Stand) ist für die
Rolle ohnehin lesbar und entspricht dem Dienst, den `schichtfolgeServer` ihr für diese Tage schon nennt — keine neue Leseauskunft.
Rechte (Bereich der Schichtverantwortung), Fachprüfung, Stempel- und Abschlussschutz laufen danach unverändert auf dem
entschiedenen Stand. Volle Rollen: unverändert (sie rechnen selbst mit allen Zuordnungen).

**Grenzen (vor AN zu beachten):**
1. **Veraltete Clients** (Code vor diesem Stand oder vor dem Einschalten gelesen): Wählt die Schichtverantwortung an einem Tag mit
   eigenem Modell den Dienst der Betriebsfolge und gab es dort keine Abweichung, schickt ihr Client nichts — das erkennt kein
   Server. Abhilfe beim Einschalten: Deploy-Hinweis „Clients neu laden“ (wie P2-19 (e)). Jeder Client, der bei AN liest, hat den
   Dienst des Servers und schickt den Kopf.
2. **Fenster:** Außerhalb von heute − 60 … + 90 Tagen zeigen Teilrollen für Personen mit eigenem Modell keinen Dienst
   (fail-safe). Eine Abweichung dort wird ausdrücklich gespeichert und **nicht** entschieden (wie AUS, B1); eine Löschung dort
   (veralteter Client) gilt als Modelldienst — gehört zu Grenze 1 („Clients neu laden“).
3. **Kopf zum Sendezeitpunkt:** Eine offline gemerkte Änderung trägt den Kopf nach dem Stand beim Senden, nicht beim Bearbeiten.
   Wechselt der Schalter dazwischen, gilt die Löschung nach dem neuen Stand (wie Vorbedingung 5).
4. **Ersatzvorschlag** an Lücken-/Klärungstagen und an „offenen“ Tagen (außerhalb des Fensters): Teilrollen bekommen nur den Dienst,
   nicht die Art der Lage; der neutrale Grund „kein Schichtmodell an diesem Tag“ erscheint nur bei vollen Rollen (Teilrollen: wie
   ein Tag ohne Dienst der Folge gewertet, Grund „in der Dienstphase“, +8). Nur Rangfolge eines Vorschlags, kein Schreibweg.
   Offene Entscheidung vor AN: **P2-30**.
6. **Mitteilung „eigene Zuordnung“** (Review #436 B2): siehe Abschnitt „Sicht“; vermeidbar, offene Entscheidung vor AN **P2-29**
   (Datenschutzbeauftragter/Betreiber; datensparsame Alternative dort).
7. **Entwurfstage** (B4): `schichtfolgeServer` filtert Entwurfstage nicht (Beschäftigte sehen dort in der Oberfläche weiter keinen
   Plan, die Angabe steht aber in der Antwort); offene Entscheidung vor AN **P2-31**.
5. `teilzeitProfil` (Punkt 4) und Offline-Merker (Punkt 5): nicht in diesem Stand, unverändert offen.

Prüfung: `pruefungen/imp6-teilrollen.test.js` (in `pruefung:imp6-mehrfachmodelle`); Wächter `imp6-planwirkung` S um
`server/lib/schichtfolge-teilrollen.mjs` (1 Aufruf `einheitDienst(`, Plan der Betriebsfolge im Schreibweg) erweitert.
