# WP-16c / WP-14c / WP-16b — offene Fragen (fail-closed festgelegt)

Keine arbeits-, tarif- oder steuerrechtliche Regel wurde erfunden. Wo etwas unklar ist, gilt das **restriktivste** Verhalten, durch einen Test festgenagelt.

## Korrekturrevision (WP-16c)

| # | Frage | Festgelegtes Verhalten (restriktiv) | Test |
|---|---|---|---|
| 1 | **Zweite Freigabe:** Wer ist „berechtigt“? Und was gilt in einem Betrieb mit nur einer Leitung? | Eine **zweite Person** mit `org.edit` (Leitung, Probierraum), die weder begonnen noch mitgewirkt hat (Stempelkorrekturen, Antragsentscheidungen, Speichern des Bestands seit Beginn: `korrektur.autoren`); ohne Personenkennung weder Beginn noch Freigabe. Die Freigabe sieht die Differenzzeilen (Personalnummer, Lohnart, ±h) — nur `org.edit`. Nur bei **lohnrelevanter** Differenz (mindestens eine Lohnzeile ≥ 0,01 h). Ein Einzelinhaber-Betrieb kann lohnrelevante Korrekturen derzeit nicht abschließen — Entscheidung nötig (z. B. Vertretung/Betreiber-Freigabe). | `wp16c` „lohnrelevante Änderung“, „Rechte“, HTTP-Weg |
| 2 | **Wirkt eine Änderung von Vertrags-/Tarifparametern zwischen Export und Korrektur auf die Differenz?** | Ja, **aber nie still**: Die Differenz zeigt sie, sie ist lohnrelevant und braucht die zweite Person. Eingefroren bleiben die Parameter nicht (das Freeze wird mit dem Beginn verworfen, wie beim Wiederöffnen). `istNeu` (Personentage, die anders rechnen) steht im Verlauf. | `wp16c` „Vertrags-/Tarifparameter“ |
| 3 | **Gesetzlich erforderliche Berichtigungen** | Dieselbe Strecke mit Anlass `gesetzlich` (nur Kennzeichnung im Verlauf, keine Abkürzung, keine Frist). Ob dafür eine Ausnahme von der zweiten Freigabe gelten soll, ist offen. | `wp16c` „keine starre Frist“ |
| 4 | **Exportierte Zeilen nicht mehr reproduzierbar** (Freeze nach Frist gelöscht, Schema < 3) | `KORREKTUR_BASIS_FEHLT`: Die Korrektur beginnt nicht; Klärung mit dem Betreiber. | `wp16c` „Migration“ |
| 5 | **Heutige Lohnzeilen weichen von den bestätigten ab** (z. B. Anonymisierung einer Person) | `KORREKTUR_BASIS_ABWEICHEND`: immer abgewiesen (Review: die abgelegte Revision wäre sonst nicht die exportierte). Ein Weg für diesen Fall (Betreiberklärung) ist offen. | `wp16c` „Basis weicht ab“ |
| 6 | **Aufbewahrung der abgelegten Lohnzeilen** (Personalnummer + Stunden) | Sie gehen mit dem eingefrorenen Ist nach der Plandatenfrist (`abschlussPersonenRaeumen`, `planStichtag`); Kennung, Prüfsumme, Zeitpunkt, Berechtigte bleiben. Danach ist eine weitere Korrektur dieses Monats nicht mehr automatisch möglich (siehe 4). Ob die Frist zu kurz ist (Revisionssicherheit gegen Aufbewahrungspflicht), ist eine Betreiber-/Steuerberaterfrage. | `wp16c` „Aufbewahrung“ |
| 7 | **Korrekturexport-Format DATEV** | Gleiche Spalten wie der Erstexport; Zeilen = Differenz je Personalnummer und Lohnart (positive und negative Stunden), Bezeichnung „Korrektur R2 zu R1: …“, Dateiname `…_korrektur_r2_…`. Ob das Lohnbüro negative Stunden oder Storno/Neu-Buchungen erwartet, ist offen. | `wp16c` „Korrekturexport bestätigen“ |
| 8 | **Revision ohne Lohnänderung** | Differenz leer: keine Freigabe nötig; der (leere) Korrekturexport wird trotzdem ausdrücklich bestätigt, damit der Monat wieder gegen einfaches Wiederöffnen gesperrt ist. | `wp16c` „ohne lohnrelevante Änderung“ |
| 9 | **Späte Offline-Stempel** | Solange die Revision gegen Wiederöffnen gesperrt ist (Export bestätigt): 409 `MONAT_ABGESCHLOSSEN` mit `lohnexportiert`, am Abschluss vermerkt. Während eine Korrektur offen ist, werden sie angenommen (wie nach dem Wiederöffnen) und gehören in die Revision. | HTTP-Weg |

## Folgebefunde (WP-14c)

| # | Frage | Festgelegtes Verhalten | Test |
|---|---|---|---|
| F6a | **Ungeplanter echter 24-h-Einsatz:** Soll es ein ausdrückliches Feld (`ganztag24`) mit Plausibilitätsprüfung geben? | Nicht umgesetzt. Beginn = Ende wird ohne geplanten 24-h-Dienst weiter mit 422 abgewiesen. Arbeitszeitrechtlich (ArbZG-Höchstgrenzen) braucht die Zulässigkeit eine Fachentscheidung. | `wp14c` F6 |
| F6b | **Fehlstempel ohne Arbeit auf 0 h setzen („verwerfen“)** | Nicht umgesetzt (berührt jede Stelle, die `erfassung` liest). Der Fall bleibt Prüffall (`DAUER_NULL`), blockiert den Abschluss ohne „trotzdem“, wird nie still als 24 h oder 0 h bestätigt. | `wp14c` F6 |
| F2 | Altdaten mit Pause über der Anwesenheit | Wert bleibt 0 h (vorhandene Prüfung), jetzt aber als Prüffall gekennzeichnet (`zurPruefung`). Ob stattdessen die Planzeit gelten soll, ist offen. | `wp14c` F2 |
| F5 | Beginn 22:00 mit Dauer 4:01–4:59 h nicht darstellbar | Unverändert (Datenmodell); die Sperre nennt jetzt die gestempelte Dauer, die Leitung verschiebt den Beginn. | — |

## WP-16b

Alte Spur-Zeilen werden beim Lesen (Betreiber-Lage) geschwärzt, nicht in der Ablage umgeschrieben (Aufbewahrung 30 Tage, Auskunft nach Art. 15 liest die Zeile mit `tag`). Offen nur: soll die Ablage zusätzlich bereinigt werden?

## Nachtrag zum Opus-Review von 3513451

| # | Punkt | Festgelegtes Verhalten / offen |
|---|---|---|
| R1 | `vorschau` aus dem Rumpf (Vier-Augen-Umgehung) | Behoben: `vorschau` ist ein interner Parameter von `abschliessen`; der Handler reicht nur eine Positivliste von Rumpffeldern durch (`MONATSABSCHLUSS_RUMPF`). Test `wp16c` Review 1. |
| R2 | Beginn ohne Personenkennung | Abgewiesen (403 `KORREKTUR_PERSON_NOETIG`). **Folge/Frage:** Leitungs-Codes und die Probierraum-Rolle ohne Person können weder beginnen noch freigeben (und die Kundenrolle `kunde` ohne Person nicht abschließen) — fail-closed, bis entschieden ist, wie solche Zugänge Personen zugeordnet werden. |
| R3 | Autoren der Änderungen | Wer den Bestand während der offenen Korrektur gespeichert hat (jedes PUT mit Vollschreibrecht, auch ohne Änderung), wer eine Stempelkorrektur angelegt oder einen Antrag entschieden hat, gibt nicht frei. Grobe, bewusst restriktive Zuordnung: eine Person, die nur etwas Unbeteiligtes speichert, ist ebenfalls ausgeschlossen. |
| R4 | Zeitumstellungs-Sperre | Gleiche Uhrzeiten wie der Prüffall bleiben gesperrt; verschobene Uhrzeiten, die von der gemessenen Dauer abweichen, sind 422 mit Hinweis — die Leitung (`org.edit`) kann mit `zeitumstellungAusnahme` und dem Pflichtgrund bestätigen (Ereignis `zeitumstellungAusnahme`, Spur „· Zeitumstellung bestätigt“). Planung kann die Ausnahme nicht setzen; ein Antrag kann sie nicht tragen (die Leitung korrigiert direkt). |
| R5 | Blinde Freigabe | Die Antwort von `korrektur-freigeben` (Vorschau und Erfolg) enthält die Differenzzeilen; der Abschluss (Planung) liefert nur Zahlen. |
| R7 | Folgemonate | Offen/nicht umgesetzt: Eine Korrektur eines Monats ändert den Übertrag/das Konto folgender, bereits exportierter Monate (`vs`/`ue` im Freeze). Keine Markierung der Folgemonate; Klärung nötig, ob sie als „Konto veraltet“ gekennzeichnet werden sollen. |
| R8 | Probierraum | Siehe R2. |

## Nachtrag zum Re-Review von 383a710

| # | Punkt | Festgelegtes Verhalten / offen |
|---|---|---|
| RR1 | Mitwirkende zentral | Statt je Endpunkt: `bestandSchreiben` (bestand.mjs) vergleicht bei jedem Schreibvorgang mit offener Korrektur je Monat Vorher/Nachher (`erfassung`, `einstempeln` samt Korrekturen, `abweichungen`, `abwesenheiten`, `zuschlaege`, `lohnarten`, `dienstarten`) und vermerkt die handelnde Person (Schreibkontext, `schreibkontext.mjs`) — nur bei echter Änderung. Ohne Anfragekontext (Löschlauf, Sicherung) kein Vermerk. Bei veraltetem ETag wird gegen den heute gespeicherten Stand verglichen (kann zu viel zuordnen: fail-closed). Zugang ohne Person ⇒ "?" ⇒ Freigabe nur durch eine Person, die nicht "?" ist — der Eintrag selbst blockiert keine konkrete Person; wer die Freigabe darf, entscheidet weiterhin die Mitwirkenden-Liste. |
| RR2 | Selbstauskunft und Wiederherstellen | In einem Monat mit offener Korrektur: 409 `KORREKTUR_OFFEN` (nichts wird still geändert). Wiederherstellen ist für den ganzen Betrieb gesperrt, solange irgendeine Korrektur offen ist. |
| RR3 | Eigene Lohnzeilen | Wessen Personalnummer in der Differenz steht, gibt nicht frei (403). |
| RR5 | Grenze der Mitwirkenden | Ab 20 vermerkten Personen `autorenVoll`: Freigabe 403 `KORREKTUR_AUTOREN_VOLL` (Klärung mit der Betriebsleitung). |
| RR6 | Namen in der Freigabe-Antwort | Entfernt: nur Personalnummer, Lohnart, Bezeichnung, Stunden. |
| RR7 | Zeitumstellungs-Ausnahme | Eigener Pflichtgrund `zeitumstellungGrund` (10–Maximallänge Zeichen), im Ereignis gespeichert; nie für die eigene Zeit (422). |
| RR8 | Gleiche Uhrzeiten | Bleiben auch mit Ausnahme gesperrt (sie ergäben die falsche Dauer). |

## Nachtrag zur letzten Review-Runde (dce9b1a → Folgecommit)

| # | Punkt | Festgelegtes Verhalten / Restrisiko (Betreiberentscheidung) |
|---|---|---|
| L1 | `"?"` (Zugang ohne Person hat mitgewirkt) | Freigabe 403 `KORREKTUR_AUTOR_UNBEKANNT`, bis die Korrektur verworfen und neu begonnen wird. |
| L2/L3 | Mitwirkung = Änderung des Eingabe-Fingerabdrucks | `korrekturFingerabdruck` = Prüfsumme des eingefrorenen Ist (`istEinfrieren`) + Prüfsumme der daraus folgenden Lohnzeilen (`exportZeilenFuer`) — dieselbe Rechnung wie die Differenz. Nur wer sie ändert, wird vermerkt (Dezember-Abwesenheit: nein). Vorfilter: Kern oder Scherbe des Jahres bis zum Korrekturmonat geändert. **Restrisiko:** Eine Änderung, die den Fingerabdruck erst in Kombination mit einer späteren Änderung wirksam macht, wird dem Schreiber der letzten Änderung zugeordnet. |
| L4 | Grenze der Liste | 200 Einträge (Speicherschutz). Darüber `autorenVoll`: die gelisteten Mitwirkenden geben nicht frei, jede nicht gelistete Person mit `org.edit` schon (kein dauerhaftes Sperren). **Restrisiko:** Ein nach Überschreitung erstmals Mitwirkender bleibt unvermerkt und könnte freigeben. |
| L5 | Ausweg | `korrektur-verwerfen` (org.edit, Grund ≥ 10 Zeichen, keine zweite Person, Verlauf + Spur ohne Grund): Sperren (Selbstauskunft, Wiederherstellen) fallen, die Freigabe ist ungültig, Revision N bleibt abgelegt. **Restrisiko/Frage:** Die Änderungen am Ist bleiben stehen (es gibt keinen Ist-Schnappschuss, der den exportierten Stand wiederherstellte); der Monat bleibt offen, der nächste Abschluss prüft die Differenz zur exportierten Revision weiter und braucht eine unbeteiligte zweite Person. Ob ein echter Rückbau auf Revision N gewünscht ist (Schnappschuss des Ist), ist zu entscheiden. |
| L6 | Laufzeit | Schnellpfad: ohne Anfragekontext oder ohne laufende Korrektur kein zusätzliches Lesen/Rechnen (Test: gleiche Zugriffszahl, Prüfung < 5 ms). Mit laufender Korrektur: Hash-Vorfilter, dann Fingerabdruck (zweimal `istEinfrieren` des Korrekturmonats) nur bei berührtem Kern/Scherbe — bei großen Betrieben (Sekundenbereich) nur während einer Korrektur. Nicht gemessen am 12-MB-Bestand. |
| L7 | Veralteter Stand | Grundlage ist die Basis des Schreibers (Vermerk des erwarteten Stands); verglichen wird auf Hash-Ebene (Kern/Scherben des Jahres bis zum Korrekturmonat), nicht inhaltlich: Ein Schreiber, der den Kern oder die Scherbe des Korrekturjahres tatsächlich ändert, wird eingetragen, auch wenn der Fingerabdruck gleich bliebe. Der Vermerk selbst liegt im Kern und kann bei gleichzeitigen Kern-Änderungen anderer einen Konflikt (409) auslösen. |
